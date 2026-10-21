import { parseModel, bounds, transform, translate, multiply3, rotationMatrix, faceNormals, binarySTL, watertight, signedVolume } from './mesh.js';
import { MoldViewer } from './viewer.js';
import { SAMPLES } from './samples.js';
import { DEFAULTS, QUALITY, MATERIALS, castEstimate, pourAxis } from './mold.js';
import { write3MF } from './threemf.js';
import { verdict } from './verdict.js';
import { spacingFor } from './sdf.js';
import { Sounds } from './sounds.js';

/* ---------- printers, as in Luma ---------- */
const PRINTERS = [
  { id: 'p2s', name: 'Bambu Lab P2S', short: 'P2S', bed: { x: 256, y: 256, z: 256 } },
  { id: 'bambu256', name: 'Bambu Lab X1 · P1 · A1', short: 'your Bambu', bed: { x: 256, y: 256, z: 256 } },
  { id: 'h2d', name: 'Bambu Lab H2D', short: 'H2D', bed: { x: 350, y: 320, z: 325 } },
  { id: 'a1mini', name: 'Bambu Lab A1 mini', short: 'A1 mini', bed: { x: 180, y: 180, z: 180 } },
  { id: 'mk4', name: 'Prusa MK4S · MK4', short: 'MK4', bed: { x: 250, y: 210, z: 220 } },
  { id: 'coreone', name: 'Prusa CORE One', short: 'CORE One', bed: { x: 250, y: 220, z: 270 } },
  { id: 'mini', name: 'Prusa MINI+', short: 'MINI+', bed: { x: 180, y: 180, z: 180 } },
  { id: 'k1', name: 'Creality K1 · Ender-3 V3', short: 'your Creality', bed: { x: 220, y: 220, z: 250 } },
  { id: 'big', name: 'A large printer · 300 mm', short: 'your printer', bed: { x: 300, y: 300, z: 300 } },
];

const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 1) => Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const state = {
  source: null,          // { name, mesh } as loaded
  orient: IDENTITY.slice(),
  scale: 1,
  type: 'two-part',
  pourFrom: '+y',
  live: null,            // last draft build result
  final: null,           // last export-quality build result
  finalStale: true,
  building: false,
  buildId: 0,
  worker: null,
  projectName: 'hollow-mold',
};
let viewer, liveTimer, toastTimer;
const sounds = new Sounds();

/* ---------- recommended settings per material ---------- */
const RECOMMENDED = {
  concrete: { wall: 12, spout: [14, 24], keys: 'cones', keyClearance: 0.25, fasteners: 'bands', clearance: 0.1, lip: 3, floor: 10 },
  plaster: { wall: 10, spout: [12, 20], keys: 'cones', keyClearance: 0.25, fasteners: 'bands', clearance: 0.1, lip: 2, floor: 8 },
  resin: { wall: 8, spout: [8, 16], keys: 'rail', keyClearance: 0.2, fasteners: 'bands', clearance: 0, lip: 2, floor: 6 },
  wax: { wall: 8, spout: [10, 18], keys: 'cones', keyClearance: 0.25, fasteners: 'bands', clearance: 0, lip: 2, floor: 6 },
  soap: { wall: 10, spout: [12, 20], keys: 'cones', keyClearance: 0.25, fasteners: 'bands', clearance: 0.05, lip: 3, floor: 8 },
};
function applyRecommended() {
  const r = RECOMMENDED[$('materialSelect').value] || RECOMMENDED.concrete;
  const mesh = orientedMesh();
  const longest = mesh ? Math.max(...bounds(mesh).size) : 60;
  const wall = longest < 50 ? Math.max(7, r.wall - 3) : longest > 160 ? r.wall + 2 : r.wall;
  $('wallInput').value = String(wall);
  $('spoutDiameterInput').value = String(r.spout[0]); $('spoutMouthInput').value = String(r.spout[1]);
  $('keysSelect').value = wall < 8 && r.keys === 'cones' ? 'rail' : r.keys;
  $('keyClearanceInput').value = String(r.keyClearance);
  $('fastenerSelect').value = r.fasteners;
  $('clearanceInput').value = String(r.clearance);
  $('lipInput').value = String(r.lip); $('floorInput').value = String(r.floor);
  $('spoutCheck').checked = true; $('ventsCheck').checked = true; $('pryCheck').checked = true;
  $('autoPlane').checked = true; $('planeInput').disabled = true;
  changed();
  toast(`Set for ${MATERIALS[$('materialSelect').value].name.toLowerCase()}: a ${wall} mm wall, a ${r.spout[0]} mm spout, ${$('keysSelect').value === 'rail' ? 'a locating rail' : 'three pegs'} and rubber-band grooves.`);
}

/** The export quality, capped at Standard on a machine with little memory: Fine needs a few
 * hundred megabytes in the worker. */
function exportQuality() {
  const q = $('qualitySelect').value;
  const memory = navigator.deviceMemory; // gigabytes, Chrome only
  if (q === 'fine' && Number.isFinite(memory) && memory < 4) return 'standard';
  return q;
}

/* ---------- the verdict card ---------- */
function renderVerdict(result) {
  const bed = printer().bed;
  const layout = viewer.printLayout || [];
  const together = layout.every(p => p.at[0] + p.size[0] <= bed.x + 0.01 && p.at[1] + p.size[1] <= bed.y + 0.01);
  // the detail the export will be built at, for the chosen quality and this block
  const blk = result.block, size = [blk.max[0] - blk.min[0], blk.max[1] - blk.min[1], blk.max[2] - blk.min[2]];
  const exportH = Math.max(0.2, spacingFor(size, QUALITY[exportQuality()].nodes, 0.3, 1.5));
  const v = verdict(result, { material: $('materialSelect').value, bed, printerName: `your ${printer().short}`, fitsTogether: together, exportH });
  const card = $('verdictCard');
  card.className = `verdict-card is-${v.grade}`;
  $('verdictBadge').textContent = v.grade === 'good' ? 'Good to go' : v.grade === 'care' ? 'With care' : 'Not yet';
  $('verdictHeadline').textContent = v.headline;
  $('verdictOutlook').textContent = v.outlook || 'Fix the red items and the verdict will change.';
  const list = $('verdictList'); list.innerHTML = '';
  const expanded = $('verdictToggle').getAttribute('aria-expanded') === 'true';
  let hiddenCount = 0;
  v.items.forEach((item, i) => {
    const li = document.createElement('li'); li.className = `is-${item.level}`;
    const showByDefault = item.level !== 'ok' || i === 0 || v.items.every(x => x.level === 'ok');
    if (!showByDefault && !expanded) { li.classList.add('is-hidden'); hiddenCount++; }
    li.style.animationDelay = `${Math.min(i, 8) * 40}ms`;
    li.innerHTML = `<span class="mark" aria-hidden="true">${item.level === 'ok' ? '✓' : item.level === 'warn' ? '!' : '✕'}</span><div><strong>${item.title}</strong><p>${item.detail}</p>${item.fix ? `<span class="fix">${item.fix}</span>` : ''}</div>`;
    list.append(li);
  });
  const toggle = $('verdictToggle');
  toggle.hidden = hiddenCount === 0 && !expanded;
  toggle.textContent = expanded ? 'Show fewer' : `Show every check (${hiddenCount} more)`;
  state.lastVerdict = v;
  return v;
}
function pendingVerdict() {
  const card = $('verdictCard'); card.className = 'verdict-card is-pending';
  $('verdictBadge').textContent = 'Checking…';
}

/* ---------- small helpers ---------- */
function toast(message) {
  const el = $('toast'); el.textContent = message; el.hidden = false; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 300); }, 4200);
}
function numeric(id, min, max, fallback) {
  const el = $(id); let v = parseFloat(el.value);
  if (!Number.isFinite(v)) v = fallback ?? min;
  v = Math.min(max, Math.max(min, v)); el.value = String(v); return v;
}
function printer() { return PRINTERS.find(p => p.id === $('printerSelect').value) || PRINTERS[0]; }
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const slug = (s) => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model';

/* ---------- the oriented model ---------- */
function orientedMesh() {
  if (!state.source) return null;
  const m = state.orient.map(v => v * state.scale);
  let mesh = transform(state.source.mesh, m);
  const b = bounds(mesh);
  // sit on Z = 0, centred in X and Y, so the numbers read nicely
  return translate(mesh, [-b.center[0], -b.center[1], -b.min[2]]);
}

function rotate(axis, degrees) { state.orient = multiply3(rotationMatrix(axis, degrees), state.orient); changed(); }

/** Rotation taking unit vector a to unit vector b (Rodrigues). */
function rotationBetween(a, b) {
  const v = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const s = Math.hypot(...v);
  if (s < 1e-9) return c > 0 ? IDENTITY.slice() : rotationMatrix('x', 180);
  const [x, y, z] = v.map(t => t / s);
  const k = 1 - c;
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k];
}

/** Put the model's largest flat face down. */
function layFlat() {
  const mesh = orientedMesh(); if (!mesh) return;
  const n = faceNormals(mesh), { positions: p, indices: ix } = mesh;
  const buckets = new Map();
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    const key = `${Math.round(n[t] * 12)},${Math.round(n[t + 1] * 12)},${Math.round(n[t + 2] * 12)}`;
    const e = buckets.get(key) || { area: 0, n: [0, 0, 0] };
    e.area += area; e.n[0] += n[t] * area; e.n[1] += n[t + 1] * area; e.n[2] += n[t + 2] * area;
    buckets.set(key, e);
  }
  let best = null;
  for (const e of buckets.values()) if (!best || e.area > best.area) best = e;
  if (!best) return;
  const l = Math.hypot(...best.n) || 1;
  const dir = best.n.map(v => v / l);
  // an open mold wants the flat back at the top (that is the opening); everything else wants it down
  const up = state.type === 'open';
  state.orient = multiply3(rotationBetween(dir, [0, 0, up ? 1 : -1]), state.orient);
  changed();
  toast(up ? 'The largest flat face is now on top, where the open mold pours in. Flip it if that is the wrong face.' : 'The largest flat face is now at the bottom. Flip it if it should be on top.');
}

/* ---------- settings from the page ---------- */
function settings(quality) {
  const type = state.type;
  const s = {
    type, quality,
    wall: numeric('wallInput', 3, 40, 10),
    cornerRadius: numeric('cornerInput', 0, 20, 4),
    clearance: numeric('clearanceInput', 0, 1, 0),
    tolerance: quality === 'fine' ? 0.012 : quality === 'draft' ? 0.03 : 0.02,
  };
  if (type === 'two-part') {
    const auto = $('autoPlane').checked;
    const mesh = orientedMesh();
    const b = mesh ? bounds(mesh) : null;
    s.partingZ = auto || !b ? 'auto' : b.min[2] + b.size[2] * numeric('planeInput', 0, 100, 50) / 100;
    s.pourFrom = state.pourFrom;
    s.spout = { enabled: $('spoutCheck').checked, diameter: numeric('spoutDiameterInput', 4, 30, 10), mouth: numeric('spoutMouthInput', 4, 50, 18) };
    s.vents = { enabled: $('ventsCheck').checked, diameter: 2.5, max: 6 };
    s.keys = { style: $('keysSelect').value, diameter: 7, height: 4, clearance: numeric('keyClearanceInput', 0.1, 0.6, 0.25) };
    s.fasteners = $('fastenerSelect').value;
    s.prySlots = $('pryCheck').checked;
  } else if (type === 'open') {
    s.lip = numeric('lipInput', 0, 10, 2);
    s.pushHole = parseFloat($('pushHoleSelect').value) || 0;
    s.floor = numeric('floorInput', 3, 40, 8);
  } else {
    s.siliconeGap = numeric('gapInput', 4, 30, 10);
    s.boxWall = numeric('boxWallInput', 1.2, 6, 2.4);
    s.boxFloor = numeric('boxFloorInput', 1.5, 10, 3);
  }
  return s;
}

/* ---------- the worker ---------- */
function workerBuild(model, options, onProgress) {
  return new Promise((resolve, reject) => {
    if (state.worker) { state.worker.terminate(); state.worker = null; }
    let worker;
    try { worker = new Worker('./mold-worker.js', { type: 'module' }); }
    catch (error) { reject(new Error('This browser could not start the geometry worker (workers need http(s), not file://).')); return; }
    state.worker = worker;
    const id = ++state.buildId;
    worker.onmessage = ({ data }) => {
      if (data.id !== id) return;
      if (data.error) { reject(new Error(data.error)); return; }
      if (data.result) { resolve(data.result); return; }
      onProgress?.(data.progress, data.message);
    };
    worker.onerror = (event) => reject(new Error(event.message || 'The geometry worker failed.'));
    const positions = model.positions.slice(), indices = model.indices.slice();
    worker.postMessage({ id, model: { positions, indices }, options }, [positions.buffer, indices.buffer]);
  });
}

function changed() {
  sounds.tick();
  state.finalStale = true;
  pendingVerdict();
  $('buildBtn').classList.add('is-stale');
  $('downloads').hidden = true;
  refreshOrientation();
  syncTypeFields();
  clearTimeout(liveTimer);
  liveTimer = setTimeout(liveBuild, 450);
}

async function liveBuild() {
  const mesh = orientedMesh();
  if (!mesh) return;
  const status = $('viewerStatus');
  status.innerHTML = '<span class="status-dot"></span>Building the preview…';
  status.classList.add('is-busy');
  state.building = true;
  try {
    const result = await workerBuild(mesh, settings('draft'), (p, message) => { status.innerHTML = `<span class="status-dot"></span>${message}`; $('liveProgress').style.width = `${Math.round(p * 100)}%`; });
    state.live = result;
    showResult(result, mesh, false);
    status.innerHTML = `<span class="status-dot"></span>Preview at ${result.h.toFixed(2)} mm detail · drag to orbit`;
    sounds.preview();
    if (viewer.view === 'mold') { viewer.setExplode(0); viewer.animateExplode(+$('explodeInput').value / 100, 900); }
    if (viewer.view === 'pour') { viewer.playPour(); sounds.pour(); }
  } catch (error) {
    if (error.message && /terminated|could not start|worker failed/i.test(error.message)) return;
    status.innerHTML = `<span class="status-dot"></span>${error.message}`;
    sounds.error();
    toast(error.message);
  } finally {
    status.classList.remove('is-busy'); state.building = false; $('liveProgress').style.width = '0%';
  }
}

async function finalBuild() {
  const mesh = orientedMesh();
  if (!mesh) { toast('Add a model first.'); return; }
  const quality = exportQuality();
  if (quality !== $('qualitySelect').value) toast('Fine detail needs more memory than this device has, so this export is built at Standard.');
  const btn = $('buildBtn'); btn.disabled = true;
  $('progressRow').hidden = false;
  try {
    const result = await workerBuild(mesh, settings(quality), (p, message) => { $('progressBar').style.width = `${Math.round(p * 100)}%`; $('progressText').textContent = message; });
    state.final = result; state.finalStale = false;
    btn.classList.remove('is-stale');
    showResult(result, mesh, true);
    renderDownloads(result);
    sounds.built();
    toast(`Built at ${result.h.toFixed(2)} mm detail. Save the STLs or the 3MF below.`);
  } catch (error) {
    if (!/terminated/i.test(error.message || '')) { sounds.error(); toast(error.message); }
  } finally {
    btn.disabled = false; $('progressRow').hidden = true; $('progressBar').style.width = '0%';
  }
}

/* ---------- showing a result ---------- */
function showResult(result, mesh, isFinal) {
  const meta = { type: result.settings.type, block: result.block, partingZ: result.analysis?.partingZ, pour: result.features?.pour };
  // the box master stands the model on its tray; show it there
  const shown = result.features?.modelOffset ? translate(mesh, result.features.modelOffset) : mesh;
  viewer.setModel(shown, result.analysis?.vertexClass, meta);
  viewer.setParts(result.parts, meta);
  if (result.settings.type === 'two-part' && $('autoPlane').checked) {
    const b = bounds(mesh);
    $('planeInput').value = String(Math.round((result.analysis.partingZ - b.min[2]) / b.size[2] * 100));
    $('planeValue').textContent = `${fmt(result.analysis.partingZ)} mm`;
  }
  // numbers
  const mb = result.model.bounds, blk = result.block;
  $('modelSizeLabel').textContent = `${fmt(mb.size[0])} × ${fmt(mb.size[1])} × ${fmt(mb.size[2])} mm`;
  $('modelSizeHint').textContent = `${fmt(mb.size[0] / 25.4)} × ${fmt(mb.size[1] / 25.4)} × ${fmt(mb.size[2] / 25.4)} in`;
  $('moldSizeLabel').textContent = `${fmt(blk.max[0] - blk.min[0])} × ${fmt(blk.max[1] - blk.min[1])} × ${fmt(blk.max[2] - blk.min[2])} mm · ${result.parts.length} ${result.parts.length === 1 ? 'part' : 'parts'}`;
  const est = castEstimate(result.cast.volumeMm3, $('materialSelect').value);
  if (result.settings.type === 'box') {
    const sil = result.features.silicone;
    $('castLabel').textContent = `${fmt(sil.volumeMm3 / 1000, 0)} mL of silicone`;
    $('castHint').textContent = `to fill the tray ${fmt(sil.gap)} mm around and over the model`;
  } else {
    $('castLabel').textContent = est.unit === 'mL' ? `${fmt(est.mL, 0)} mL of ${est.material.name.toLowerCase()}` : `${fmt(est.grams, 0)} g of ${est.material.name.toLowerCase()}`;
    $('castHint').textContent = `${fmt(est.mL, 0)} mL cast${result.cast.spoutMm3 ? ' including the spout' : ''} · mix about 10 % extra`;
  }
  const plastic = result.parts.reduce((a, p) => a + p.plasticGrams, 0);
  $('plasticLabel').textContent = `≈ ${fmt(plastic, 0)} g of PLA`;
  $('plasticHint').textContent = `${fmt(result.parts.reduce((a, p) => a + p.volumeMm3, 0) / 1000, 0)} cm³ of parts at 15 % infill`;
  // release summary
  const a = result.analysis;
  const releaseEl = $('releaseSummary');
  if (a?.mode === 'release') {
    const trapped = a.trappedFraction * 100, steep = a.steepFraction * 100;
    releaseEl.textContent = trapped < 0.05 ? (steep > 20 ? `Everything releases, though ${fmt(steep, 0)} % of the surface is steep.` : 'Everything releases cleanly.') : `${fmt(trapped, 1)} % of the surface is trapped.`;
    releaseEl.className = 'release-summary ' + (trapped >= 5 ? 'is-bad' : trapped > 0.05 || steep > 30 ? 'is-warn' : 'is-good');
  } else if (a) {
    releaseEl.textContent = a.trappedFraction > 0.03 ? 'The master has overhangs that will need supports.' : 'The master prints without supports.';
    releaseEl.className = 'release-summary ' + (a.trappedFraction > 0.03 ? 'is-warn' : 'is-good');
  }
  // warnings
  const list = $('warnings'); list.innerHTML = '';
  for (const w of result.warnings) { const li = document.createElement('li'); li.textContent = w; list.append(li); }
  const vents = result.features?.vents?.length || 0;
  if (result.settings.type === 'two-part') {
    const notes = [];
    if (result.features.spout) notes.push('a pour spout on the parting line');
    if (vents) notes.push(`${vents} air vent${vents > 1 ? 's' : ''} where air would be trapped`);
    if (result.features.keys) notes.push(result.features.keys.style === 'rail' ? 'a locating rail and one orientation peg' : `${result.features.keys.pegs.length} tapered alignment pegs`);
    if (result.features.bands) notes.push('two grooves for rubber bands');
    if (result.features.bolts) notes.push('four bolt holes');
    if (result.features.prySlots) notes.push('two pry slots');
    if (notes.length) { const li = document.createElement('li'); li.className = 'is-note'; li.textContent = `This mold has ${notes.join(', ')}.`; list.prepend(li); }
  } else if (result.settings.type === 'open' && result.features.cores) {
    const li = document.createElement('li'); li.className = 'is-note'; li.textContent = `The model is hollow, so the mold comes out as a body and ${result.features.cores > 1 ? result.features.cores + ' cores' : 'a core'} with a collar that rests on the rim at the right depth. Pour into the body, then press the core in.`; list.prepend(li);
  }
  list.parentElement.hidden = !list.children.length;
  fitCheck(result);
  renderVerdict(result);
  $('legendRelease').hidden = a?.mode !== 'release';
  $('legendPrint').hidden = a?.mode !== 'print';
  $('liveNote').textContent = isFinal ? `Shown at export detail (${result.h.toFixed(2)} mm).` : `Preview at draft detail (${result.h.toFixed(2)} mm); export builds finer.`;
}

function fitCheck(result) {
  const bed = printer().bed;
  const fits = (size) => (size[0] <= bed.x && size[1] <= bed.y || size[0] <= bed.y && size[1] <= bed.x) && size[2] <= bed.z;
  const bad = result.parts.filter(p => !fits(p.print.size));
  const badge = $('fitBadge'), msg = $('fitMessage');
  const layout = viewer.printLayout || [];
  const together = layout.every(p => p.at[0] + p.size[0] <= bed.x + 0.01 && p.at[1] + p.size[1] <= bed.y + 0.01);
  if (bad.length) {
    badge.className = 'fit-badge is-error';
    badge.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v7m0 3v1"/></svg>Too big for your ${printer().short}`;
    msg.textContent = `${bad.map(p => p.name).join(' and ')} ${bad.length > 1 ? 'are' : 'is'} larger than the ${printer().name}'s ${bed.x} × ${bed.y} × ${bed.z} mm. Reduce the wall, scale the model down, or choose another printer.`;
  } else {
    badge.className = 'fit-badge';
    badge.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3.2 3.2L15 6.5"/></svg>Fits your ${printer().short}`;
    msg.textContent = together && result.parts.length > 1 ? `All ${result.parts.length} parts fit on one ${printer().name} plate together — the 3MF lays them out for you.`
      : result.parts.length > 1 ? `Each part fits the ${printer().name}; print them one plate at a time.` : `Sized for the ${printer().name}. Print it as it arrives, flat side down.`;
  }
}

/* ---------- downloads ---------- */
function printMesh(part) { return transform(part.mesh, part.print.matrix, part.print.translate); }

function renderDownloads(result) {
  const box = $('downloads'); box.hidden = false;
  const list = $('partsList'); list.innerHTML = '';
  const base = slug(state.projectName);
  result.parts.forEach((part) => {
    const row = document.createElement('div'); row.className = 'part-row';
    const name = document.createElement('div'); name.className = 'part-name';
    name.innerHTML = `<strong>${part.name}</strong><span>${fmt(part.print.size[0], 0)} × ${fmt(part.print.size[1], 0)} × ${fmt(part.print.size[2], 0)} mm · ${fmt(part.triangles, 0)} triangles · ≈ ${fmt(part.plasticGrams, 0)} g${part.closed ? '' : ' · <em>not closed — check in the slicer</em>'}</span>`;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'button button-small';
    btn.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9m-4-4 4 4 4-4M4 16h12"/></svg>STL';
    btn.addEventListener('click', () => {
      const mesh = printMesh(part);
      saveBlob(new Blob([binarySTL(mesh, `Hollow ${part.name} | units: mm | print as it arrives`)], { type: 'model/stl' }), `${base}-${slug(part.name)}.stl`);
    });
    row.append(name, btn); list.append(row);
  });
  const grams = result.parts.reduce((s, p) => s + p.plasticGrams, 0);
  const hours = grams / 12; // a P2S at 0.2 mm layers lays down roughly 12 g of PLA an hour on parts like these
  $('resultDetails').textContent = `Every part arrives in its printing position: flat side down, cavity up. Open at 100 % scale. Roughly ${hours < 1 ? `${Math.round(hours * 60)} minutes` : `${fmt(hours, 1)} hours`} of printing in all at 0.2 mm layers; the slicer will know exactly.`;
  const m = $('materialSelect').value, est = castEstimate(result.cast.volumeMm3, m);
  const amount = est.unit === 'mL' ? `${fmt(est.mL * 1.1, 0)} mL of resin (10 % extra)` : `${fmt(est.grams * 1.1, 0)} g of ${est.material.name.toLowerCase()} mix (10 % extra)`;
  const needs = {
    concrete: [amount, 'a release agent: cooking spray wiped thin, or paste wax', 'a cup and a stick to mix, and a bag to cover it while it cures', result.settings.type === 'two-part' ? 'rubber bands or clamps, and a tray to catch drips' : 'a straight edge to strike the back flat'],
    plaster: [amount, 'a little soap or release spray on the mold', 'a cup to mix in, and a sieve to sprinkle plaster into the water', result.settings.type === 'two-part' ? 'rubber bands or clamps' : 'a straight edge to strike the back'],
    resin: [amount, 'a mold release spray — resin bonds to plastic without it', 'gloves, a mask or open window, mixing cups and sticks', result.settings.type === 'two-part' ? 'rubber bands or clamps, and tape round the seam' : 'a lighter or heat gun to pop surface bubbles'],
    wax: [amount, 'a pot to melt it in and a thermometer (pour below 80 °C)', result.settings.type === 'two-part' ? 'rubber bands or clamps' : 'a wick and a wick holder, if it is a candle'],
    soap: [amount, 'a microwave-safe jug to melt it in', 'rubbing alcohol in a spray bottle to clear bubbles', 'room in the freezer for ten minutes before unmolding'],
  }[m] || [];
  if (result.settings.type === 'box') needs.splice(0, needs.length, `${fmt(result.features.silicone.volumeMm3 / 1000 * 1.1, 0)} mL of 20–30 Shore A silicone (10 % extra)`, 'mixing cups, a stick and gloves', 'a craft knife to cut the cured block open');
  const ul = $('needsList'); ul.innerHTML = '';
  for (const n of needs) { const li = document.createElement('li'); li.textContent = n; ul.append(li); }
}

async function download3MF() {
  const result = state.final; if (!result) return;
  const btn = $('download3mfBtn'); btn.disabled = true;
  try {
    const layout = viewer.printLayout || [];
    const parts = result.parts.map((part, i) => ({ name: part.name, mesh: printMesh(part), translate: layout[i] ? layout[i].at : [0, 0, 0] }));
    const bytes = await write3MF(parts, { title: `Hollow mold — ${state.projectName}` });
    saveBlob(new Blob([bytes], { type: 'model/3mf' }), `${slug(state.projectName)}-mold.3mf`);
    toast('3MF saved. Open it in Bambu Studio: every part is already on the plate.');
  } catch (error) { toast(error.message); } finally { btn.disabled = false; }
}

function downloadAllSTL() {
  const result = state.final; if (!result) return;
  const base = slug(state.projectName);
  result.parts.forEach((part, i) => setTimeout(() => {
    saveBlob(new Blob([binarySTL(printMesh(part), `Hollow ${part.name} | units: mm`)], { type: 'model/stl' }), `${base}-${slug(part.name)}.stl`);
  }, i * 600));
}

/* ---------- model in ---------- */
async function loadFile(file) {
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    const mesh = parseModel(buffer, file.name);
    setSource(file.name, mesh);
  } catch (error) { toast(error.message); }
}

function setSource(name, mesh, { type } = {}) {
  const b = bounds(mesh);
  if (!b.size.every(Number.isFinite) || Math.max(...b.size) <= 0) { toast('That model has no size.'); return; }
  state.source = { name, mesh };
  state.projectName = name.replace(/\.[a-z0-9]+$/i, '');
  state.orient = IDENTITY.slice(); state.scale = 1; $('scaleInput').value = '100';
  // models that arrive in metres or inches: offer a guess
  const longest = Math.max(...b.size);
  if (longest < 2) toast('This model is tiny — under 2 mm. If it was made in metres or inches, use Scale.');
  else if (longest > 600) toast('This model is over 600 mm long. If it was made in microns or tenths, use Scale.');
  const tight = watertight(mesh);
  $('fileName').textContent = name;
  $('modelStats').textContent = `${fmt(mesh.indices.length / 3, 0)} triangles · ${tight.closed ? 'closed solid' : tight.boundaryEdges ? `${fmt(tight.boundaryEdges, 0)} open edges` : 'imperfect shell'} · ${fmt(Math.abs(signedVolume(mesh)) / 1000, 1)} cm³`;
  if (type) setType(type);
  $('autoPlane').checked = true; $('planeInput').disabled = true;
  changed();
}

function refreshOrientation() {
  const mesh = orientedMesh();
  if (!mesh) { $('sizeLabel').textContent = '—'; return; }
  const b = bounds(mesh);
  $('sizeLabel').textContent = `${fmt(b.size[0])} × ${fmt(b.size[1])} × ${fmt(b.size[2])} mm`;
}

/* ---------- mold type ---------- */
function setType(type) {
  state.type = type;
  for (const t of ['two-part', 'open', 'box']) $(`type-${t}`).setAttribute('aria-pressed', String(t === type));
  syncTypeFields();
}
function syncTypeFields() {
  $('twoPartFields').hidden = state.type !== 'two-part';
  $('openFields').hidden = state.type !== 'open';
  $('boxFields').hidden = state.type !== 'box';
  $('wallField').hidden = state.type === 'box';
  const tabPour = $('view-pour');
  tabPour.textContent = state.type === 'two-part' ? 'Pour' : state.type === 'box' ? 'Silicone' : 'Pour';
}
function setPour(dir) {
  state.pourFrom = dir;
  for (const d of ['+y', '-y', '+x', '-x']) $(`pour-${d[0] === '+' ? 'p' : 'n'}${d[1]}`).setAttribute('aria-pressed', String(d === dir));
  changed();
}

/* ---------- projects ---------- */
function saveProject() {
  if (!state.source) { toast('Add a model first.'); return; }
  const stl = binarySTL(state.source.mesh, 'Hollow project model');
  if (stl.byteLength > 40e6) { toast('This model is too large to embed in a project file (over 40 MB). Save the settings by hand or keep the STL beside it.'); }
  const bytes = new Uint8Array(stl);
  let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const data = {
    app: 'hollow', version: 1, name: state.source.name, orient: state.orient, scale: state.scale, type: state.type, pourFrom: state.pourFrom,
    fields: Object.fromEntries(FIELD_IDS.map(id => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value])),
    model: stl.byteLength <= 40e6 ? btoa(binary) : null,
  };
  saveBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${slug(state.projectName)}.hollow.json`);
  toast('Project saved: the model and every setting, in one file.');
}
const FIELD_IDS = ['materialSelect', 'wallInput', 'cornerInput', 'clearanceInput', 'pushHoleSelect', 'autoPlane', 'planeInput', 'spoutCheck', 'spoutDiameterInput', 'spoutMouthInput', 'ventsCheck', 'keysSelect', 'keyClearanceInput', 'fastenerSelect', 'pryCheck', 'lipInput', 'floorInput', 'gapInput', 'boxWallInput', 'boxFloorInput', 'qualitySelect'];
async function openProject(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'hollow' || !data.model) throw new Error('This is not a Hollow project file with a model in it.');
    const binary = atob(data.model); const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const mesh = parseModel(bytes, 'model.stl');
    for (const id of FIELD_IDS) if (data.fields && id in data.fields) { if ($(id).type === 'checkbox') $(id).checked = !!data.fields[id]; else $(id).value = data.fields[id]; }
    setSource(data.name || 'project.stl', mesh, { type: data.type });
    state.orient = Array.isArray(data.orient) && data.orient.length === 9 ? data.orient : IDENTITY.slice();
    state.scale = Number.isFinite(data.scale) ? data.scale : 1; $('scaleInput').value = String(Math.round(state.scale * 100));
    if (data.pourFrom) setPour(data.pourFrom); else changed();
    $('planeInput').disabled = $('autoPlane').checked;
    toast('Project opened.');
  } catch (error) { toast(error.message); }
}

/* ---------- wiring ---------- */
function init() {
  viewer = window.hollowViewer = new MoldViewer($('viewer'), {
    onFailure: () => { $('viewerStatus').textContent = 'The 3D view lost its graphics context. Reload the page to bring it back.'; },
  });
  // printers
  const sel = $('printerSelect');
  for (const p of PRINTERS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.append(o); }
  try { const saved = localStorage.getItem('hollow-printer'); if (PRINTERS.some(p => p.id === saved)) sel.value = saved; } catch { /* private mode */ }
  sel.addEventListener('change', () => { try { localStorage.setItem('hollow-printer', sel.value); } catch { /* ignore */ } viewer.setPlate(printer().bed); const r = state.final && !state.finalStale ? state.final : state.live; if (r) { fitCheck(r); renderVerdict(r); } });
  viewer.setPlate(printer().bed);
  // materials
  const mat = $('materialSelect');
  for (const [id, m] of Object.entries(MATERIALS)) { const o = document.createElement('option'); o.value = id; o.textContent = m.name; mat.append(o); }
  try { const saved = localStorage.getItem('hollow-material'); if (MATERIALS[saved]) mat.value = saved; } catch { /* ignore */ }
  mat.addEventListener('change', () => {
    try { localStorage.setItem('hollow-material', mat.value); } catch { /* ignore */ }
    viewer.setMaterialName(mat.value);
    $('materialNote').textContent = MATERIALS[mat.value].note;
    if (state.live) showResult(state.final && !state.finalStale ? state.final : state.live, orientedMesh(), !state.finalStale);
  });
  $('materialNote').textContent = MATERIALS[mat.value].note;
  viewer.setMaterialName(mat.value);
  // samples
  const samples = $('sampleSelect');
  for (const [id, s] of Object.entries(SAMPLES)) { const o = document.createElement('option'); o.value = id; o.textContent = s.name; samples.append(o); }
  samples.addEventListener('change', () => {
    const s = SAMPLES[samples.value]; if (!s) return;
    setSource(`${s.name}.stl`, s.make(), { type: s.type });
    toast(s.note);
    samples.value = '';
  });
  // files
  $('uploadBtn').addEventListener('click', () => $('modelInput').click());
  $('modelInput').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
  const zone = $('dropZone');
  for (const ev of ['dragenter', 'dragover']) zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-over'); });
  for (const ev of ['dragleave', 'drop']) zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('is-over'); });
  zone.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
  // orientation
  $('rotX').addEventListener('click', () => rotate('x', 90));
  $('rotY').addEventListener('click', () => rotate('y', 90));
  $('rotZ').addEventListener('click', () => rotate('z', 90));
  $('flipBtn').addEventListener('click', () => rotate('x', 180));
  $('layFlatBtn').addEventListener('click', layFlat);
  $('resetOrientBtn').addEventListener('click', () => { state.orient = IDENTITY.slice(); state.scale = 1; $('scaleInput').value = '100'; changed(); });
  $('scaleInput').addEventListener('change', () => { state.scale = numeric('scaleInput', 1, 10000, 100) / 100; changed(); });
  // type
  for (const t of ['two-part', 'open', 'box']) $(`type-${t}`).addEventListener('click', () => { setType(t); changed(); });
  for (const d of ['+y', '-y', '+x', '-x']) $(`pour-${d[0] === '+' ? 'p' : 'n'}${d[1]}`).addEventListener('click', () => setPour(d));
  $('autoPlane').addEventListener('change', () => { $('planeInput').disabled = $('autoPlane').checked; changed(); });
  $('planeInput').addEventListener('input', () => {
    const mesh = orientedMesh(); if (!mesh) return;
    const b = bounds(mesh); $('planeValue').textContent = `${fmt(b.min[2] + b.size[2] * +$('planeInput').value / 100)} mm`;
  });
  $('planeInput').addEventListener('change', changed);
  for (const id of ['wallInput', 'cornerInput', 'clearanceInput', 'pushHoleSelect', 'spoutCheck', 'spoutDiameterInput', 'spoutMouthInput', 'ventsCheck', 'keysSelect', 'keyClearanceInput', 'fastenerSelect', 'pryCheck', 'lipInput', 'floorInput', 'gapInput', 'boxWallInput', 'boxFloorInput']) {
    $(id).addEventListener('change', changed);
  }
  // views
  const VIEWS = ['model', 'mold', 'section', 'print', 'pour'];
  const showView = (v) => {
    const was = viewer.view;
    for (const w of VIEWS) $(`view-${w}`).setAttribute('aria-pressed', String(w === v));
    viewer.setView(v);
    if (was !== v) sounds.click();
    $('orbitHint').classList.add('is-gone');
    $('explodeRow').hidden = v !== 'mold'; $('sectionRow').hidden = v !== 'section'; $('pourRow').hidden = v !== 'pour';
    if (v === 'mold' && was !== v) { const to = Math.max(0.45, +$('explodeInput').value / 100); $('explodeInput').value = String(Math.round(to * 100)); viewer.setExplode(0); viewer.animateExplode(to, 900); }
    if (v === 'pour' && was !== v) { setTimeout(() => { viewer.playPour(); sounds.pour(); }, 450); }
    $('viewHint').textContent = {
      model: 'Green releases, amber is steep, red is trapped. The amber plane is the parting line; the arrow is the pour.',
      mold: 'The printed parts around the cast. Pull them apart with the slider.',
      section: 'Cut through the mold to see the cavity, spout and vents. Slide to move the cut.',
      print: 'Every part on your plate, in printing position. Red marks overhangs steeper than 45°.',
      pour: state.type === 'two-part' ? 'The mold standing to be poured, spout up, with the cast inside.' : state.type === 'box' ? 'The master with the silicone level at the top of the tray.' : 'The open mold with the cast inside.',
    }[v];
  };
  for (const v of VIEWS) $(`view-${v}`).addEventListener('click', () => showView(v));
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea, [contenteditable]') || e.altKey || e.ctrlKey || e.metaKey) return;
    const i = parseInt(e.key, 10);
    if (i >= 1 && i <= 5) { showView(VIEWS[i - 1]); e.preventDefault(); }
  });
  $('pourPlayBtn').addEventListener('click', () => { viewer.playPour(); sounds.pour(); });
  for (const name of ['iso', 'front', 'side', 'top']) $(`cam-${name}`).addEventListener('click', () => { viewer.preset(name); sounds.click(); $('orbitHint').classList.add('is-gone'); });
  $('spinBtn').addEventListener('click', () => { const on = $('spinBtn').getAttribute('aria-pressed') !== 'true'; $('spinBtn').setAttribute('aria-pressed', String(on)); viewer.setAutoRotate(on); sounds.click(); });
  viewer.onSpinStop = () => $('spinBtn').setAttribute('aria-pressed', 'false');
  $('viewer').addEventListener('pointerdown', () => $('orbitHint').classList.add('is-gone'), { once: true });
  setTimeout(() => $('orbitHint').classList.add('is-gone'), 9000);
  $('verdictToggle').addEventListener('click', () => {
    const t = $('verdictToggle'); t.setAttribute('aria-expanded', String(t.getAttribute('aria-expanded') !== 'true'));
    const r = state.final && !state.finalStale ? state.final : state.live; if (r) renderVerdict(r);
  });
  $('recommendBtn').addEventListener('click', () => { sounds.click(); applyRecommended(); });
  const soundBtn = $('soundBtn');
  const syncSound = () => { soundBtn.setAttribute('aria-pressed', String(sounds.enabled)); soundBtn.title = sounds.enabled ? 'Sounds on' : 'Sounds off'; soundBtn.setAttribute('aria-label', sounds.enabled ? 'Turn sounds off' : 'Turn sounds on'); };
  syncSound();
  soundBtn.addEventListener('click', () => { sounds.setEnabled(!sounds.enabled); syncSound(); });
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => sounds.unlock(), { once: true, capture: true });
  $('explodeInput').addEventListener('input', () => viewer.setExplode(+$('explodeInput').value / 100));
  $('sectionInput').addEventListener('input', () => viewer.setSection(+$('sectionInput').value / 100));
  $('resetViewBtn').addEventListener('click', () => { viewer.userFramed = false; viewer.resetView(550); sounds.click(); });
  $('snapshotBtn').addEventListener('click', () => {
    sounds.snap();
    const url = viewer.snapshot();
    fetch(url).then(r => r.blob()).then(blob => saveBlob(blob, `${slug(state.projectName)}-hollow-${viewer.view}.png`));
  });
  // build
  $('buildBtn').addEventListener('click', finalBuild);
  $('qualitySelect').addEventListener('change', () => { state.finalStale = true; $('buildBtn').classList.add('is-stale'); $('downloads').hidden = true; });
  $('download3mfBtn').addEventListener('click', download3MF);
  $('downloadAllBtn').addEventListener('click', downloadAllSTL);
  // projects
  $('projectSaveBtn').addEventListener('click', saveProject);
  $('projectOpenBtn').addEventListener('click', () => $('projectInput').click());
  $('projectInput').addEventListener('change', (e) => { if (e.target.files[0]) openProject(e.target.files[0]); e.target.value = ''; });
  // guide
  const dialog = $('guideDialog');
  const openGuide = (section) => { dialog.showModal(); if (section) dialog.querySelector(`#${section}`)?.scrollIntoView(); };
  $('guideBtn').addEventListener('click', () => openGuide());
  $('resultGuideBtn')?.addEventListener('click', () => openGuide('guide-print'));
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.querySelectorAll('[data-guide]').forEach(el => el.addEventListener('click', () => openGuide(el.dataset.guide)));
  // offline
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
  // start with a sample so the page is never empty
  setType('two-part');
  setSource('River pebble.stl', SAMPLES.pebble.make());
}

init();
