/**
 * Knurl — the page. A part in, a texture and a first-layer inlay chosen,
 * the solids built in a worker and shown in 3D, files out. The thinking is
 * in texture.js, inlay.js, textures.js and export.js; this wires them up.
 */
import { parseModel, bounds, watertight, binarySTL, translate, signedVolume } from './mesh.js';
import { TEXTURES, INLAYS, textureById } from './textures.js';
import { WHERE, DEFAULTS } from './texture.js';
import { SAMPLES } from './samples.js';
import { PRINTERS, threeMF } from './export.js';
import { PartPreview } from './preview.js';

const $ = id => document.getElementById(id);
const ids = ['printerSelect', 'printerSelect2', 'bedField', 'bedSelect', 'guideBtn', 'guide', 'guideClose', 'stageLabel', 'viewBelowBtn', 'resetViewBtn', 'viewer', 'viewerEmpty', 'viewerFallback', 'viewerStatus', 'fileInput', 'sampleChips', 'readGrid', 'readNote',
  'textureChips', 'textureBlurb', 'periodInput', 'depthInput', 'angleInput', 'knobGrid', 'dirIn', 'dirOut', 'whereChips', 'whereBlurb', 'bottomClearInput', 'edgeFadeInput', 'mappingSelect', 'insideToggle', 'fineToggle',
  'inlayChips', 'inlayFields', 'inlayPeriodInput', 'inlayWeightInput', 'inlayAngleInput', 'inlayLayersInput', 'inlayMarginInput', 'inlayColour', 'textField', 'inlayText', 'imageField', 'inlayImage', 'mirrorToggle', 'inlayStatus',
  'bodyColour', 'totalsLine', 'warnings', 'download3mf', 'downloadBody', 'downloadInlay', 'profileNote', 'toast'];
const els = Object.fromEntries(ids.map(id => [id, $(id)]));
const BED_TYPES = [['Textured PEI Plate', 'Textured PEI plate'], ['Cool Plate', 'Cool plate (smooth PEI)'], ['Supertack Plate', 'Cool Plate SuperTack'], ['High Temp Plate', 'High temperature plate'], ['Engineering Plate', 'Engineering plate']];

const state = {
  source: null, name: 'part', textured: null, texStats: null, mapping: null, inlay: null, inlayInfo: null,
  texture: 'knurl', where: 'walls', direction: 'in', knobs: {}, inlayPattern: 'none', imageRaster: null,
  printerId: PRINTERS[0].id, bed: BED_TYPES[0][0], busy: 0,
};

/* ---------- helpers ---------- */

let toastTimer = 0;
function toast(message) { els.toast.textContent = message; els.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3000); }
function download(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const printer = () => PRINTERS.find(p => p.id === state.printerId) || PRINTERS[0];
const num = (el, fallback) => { const v = Number(el.value); return Number.isFinite(v) && el.value !== '' ? v : fallback; };
const minutes = m => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`);

/* ---------- the worker ---------- */

const worker = new Worker('./worker.js', { type: 'module' });
let nextId = 1;
const pending = new Map();
worker.onmessage = e => { const r = pending.get(e.data.id); if (!r) return; pending.delete(e.data.id); e.data.error ? r.reject(new Error(e.data.error)) : r.resolve(e.data); };
worker.onerror = e => { for (const r of pending.values()) r.reject(new Error(e.message || 'The worker failed.')); pending.clear(); };
function ask(kind, mesh, options) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, kind, mesh: { positions: mesh.positions, indices: mesh.indices }, options });
  });
}

/* ---------- loading ---------- */

function setSource(mesh, name) {
  const w = watertight(mesh);
  const b = bounds(mesh);
  // stand it on the plate, centred
  const m = translate(mesh, [-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]]);
  state.source = m; state.name = name.replace(/\.[^.]+$/, '') || 'part';
  state.textured = null; state.inlay = null;
  els.viewerEmpty.hidden = true;
  els.stageLabel.textContent = `${state.name} · ${b.size.map(v => v.toFixed(0)).join(' × ')} mm · ${(mesh.indices.length / 3).toLocaleString()} triangles`;
  els.warnings.innerHTML = w.closed ? '' : `<p class="warning">This mesh is not closed (${w.boundaryEdges} open edges, ${w.nonManifoldEdges} shared by more than two faces). Textures still apply, but the slicer may need to repair it.</p>`;
  rebuild();
}
async function loadFile(file) {
  try { setSource(parseModel(await file.arrayBuffer(), file.name), file.name); }
  catch (err) { toast(err.message); }
}
els.fileInput.addEventListener('change', () => { const f = els.fileInput.files[0]; if (f) loadFile(f); });
for (const ev of ['dragenter', 'dragover']) els.viewer.addEventListener(ev, e => { e.preventDefault(); els.viewer.classList.add('over'); });
for (const ev of ['dragleave', 'drop']) els.viewer.addEventListener(ev, e => { e.preventDefault(); els.viewer.classList.remove('over'); });
els.viewer.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });
for (const s of SAMPLES) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.innerHTML = `<span>${s.name}</span><small>${s.blurb}</small>`;
  b.addEventListener('click', () => setSource(s.make(), s.name.toLowerCase()));
  els.sampleChips.append(b);
}

/* ---------- controls ---------- */

function renderTextureChips() {
  els.textureChips.innerHTML = '';
  for (const t of TEXTURES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = t.id;
    b.setAttribute('aria-pressed', String(t.id === state.texture)); b.textContent = t.name;
    b.addEventListener('click', () => selectTexture(t.id));
    els.textureChips.append(b);
  }
}
function selectTexture(id) {
  state.texture = id; state.knobs = {};
  const t = textureById(id);
  els.periodInput.value = t.defaults.period; els.depthInput.value = t.defaults.depth;
  for (const b of els.textureChips.querySelectorAll('.chip')) b.setAttribute('aria-pressed', String(b.dataset.id === id));
  els.textureBlurb.textContent = t.blurb;
  els.knobGrid.innerHTML = '';
  for (const k of t.knobs) {
    const f = document.createElement('div'); f.className = 'field';
    f.innerHTML = `<label for="knob-${k.key}">${k.label}</label><input id="knob-${k.key}" type="number" inputmode="decimal" min="${k.min}" max="${k.max}" step="${k.step}" value="${k.value}">`;
    f.querySelector('input').addEventListener('input', e => { state.knobs[k.key] = num(e.target, k.value); scheduleRebuild(); });
    els.knobGrid.append(f);
  }
  scheduleRebuild();
}
function renderWhereChips() {
  els.whereChips.innerHTML = '';
  for (const w of WHERE) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = w.id;
    b.setAttribute('aria-pressed', String(w.id === state.where)); b.textContent = w.name;
    b.addEventListener('click', () => { state.where = w.id; for (const c of els.whereChips.querySelectorAll('.chip')) c.setAttribute('aria-pressed', String(c.dataset.id === w.id)); els.whereBlurb.textContent = w.blurb; scheduleRebuild(); });
    els.whereChips.append(b);
  }
  els.whereBlurb.textContent = WHERE.find(w => w.id === state.where).blurb;
}
function renderInlayChips() {
  els.inlayChips.innerHTML = '';
  for (const p of INLAYS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = p.id;
    b.setAttribute('aria-pressed', String(p.id === state.inlayPattern)); b.textContent = p.name;
    b.addEventListener('click', () => { state.inlayPattern = p.id; for (const c of els.inlayChips.querySelectorAll('.chip')) c.setAttribute('aria-pressed', String(c.dataset.id === p.id)); syncInlayFields(); scheduleInlay(); });
    els.inlayChips.append(b);
  }
  syncInlayFields();
}
function syncInlayFields() {
  const p = state.inlayPattern;
  els.textField.hidden = p !== 'text'; els.imageField.hidden = p !== 'image';
  els.inlayFields.hidden = p === 'none';
  els.inlayPeriodInput.parentElement.hidden = p === 'text' || p === 'image';
  els.inlayWeightInput.parentElement.hidden = p === 'text' || p === 'image' || p === 'checker' || p === 'border';
  els.inlayAngleInput.parentElement.hidden = p === 'text' || p === 'image' || p === 'border';
  els.inlayPeriodInput.previousElementSibling.textContent = p === 'border' ? 'Width' : 'Repeat';
}
for (const [el, dir] of [[els.dirIn, 'in'], [els.dirOut, 'out']]) el.addEventListener('click', () => { state.direction = dir; els.dirIn.setAttribute('aria-pressed', String(dir === 'in')); els.dirOut.setAttribute('aria-pressed', String(dir === 'out')); scheduleRebuild(); });
for (const el of [els.periodInput, els.depthInput, els.angleInput, els.bottomClearInput, els.edgeFadeInput]) el.addEventListener('input', scheduleRebuild);
for (const el of [els.mappingSelect, els.insideToggle, els.fineToggle]) el.addEventListener('change', scheduleRebuild);
for (const el of [els.inlayPeriodInput, els.inlayWeightInput, els.inlayAngleInput, els.inlayLayersInput, els.inlayMarginInput, els.inlayText]) el.addEventListener('input', scheduleInlay);
els.mirrorToggle.addEventListener('change', scheduleInlay);
els.inlayColour.addEventListener('input', () => { preview?.setColours(els.bodyColour.value, els.inlayColour.value); setOutputs(); });
els.bodyColour.addEventListener('input', () => { preview?.setColours(els.bodyColour.value, els.inlayColour.value); setOutputs(); });
els.inlayImage.addEventListener('change', async () => {
  const f = els.inlayImage.files[0]; if (!f) return;
  try {
    const bmp = await createImageBitmap(f);
    const c = document.createElement('canvas'); const scale = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const data = new Uint8Array(c.width * c.height);
    for (let i = 0; i < data.length; i++) { const l = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000; data[i] = l < 128 && d[i * 4 + 3] > 64 ? 1 : 0; }
    state.imageRaster = { data, width: c.width, height: c.height };
    scheduleInlay();
  } catch { toast('That picture could not be read.'); }
});

/* ---------- rasterising text and pictures to the inlay's cell size ---------- */

function textRaster(text, fp) {
  // as wide as the footprint allows, less the margin, in a bold sans serif; one row of cells per pixel
  if (!text.trim()) return null;
  const margin = num(els.inlayMarginInput, 1) / fp.cell;
  const maxW = Math.max(8, fp.width - 2 * margin - 4), maxH = Math.max(6, fp.height - 2 * margin - 4);
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  let size = Math.floor(maxH * 0.9);
  ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  const w = ctx.measureText(text).width;
  if (w > maxW) size = Math.floor(size * maxW / w);
  if (size < 5) return null;
  ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  const width = Math.ceil(ctx.measureText(text).width) + 2, height = Math.ceil(size * 1.25);
  c.width = width; c.height = height;
  ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000'; ctx.textBaseline = 'middle'; ctx.fillText(text, 1, height / 2);
  const d = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = d[i * 4] < 128 ? 1 : 0;
  // the canvas y runs down; the footprint's rows run up (+Y): flip
  const flipped = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) flipped.set(data.subarray(y * width, (y + 1) * width), (height - 1 - y) * width);
  return { data: flipped, width, height };
}

/* ---------- building ---------- */

let preview = null;
try { preview = new PartPreview(els.viewer, { onFailure: () => { els.viewerFallback.hidden = false; } }); if (preview.failed) preview = null; } catch { els.viewerFallback.hidden = false; }
els.resetViewBtn.addEventListener('click', () => preview?.resetView('front'));
els.viewBelowBtn.addEventListener('click', () => preview?.resetView('below'));

let rebuildTimer = 0, inlayTimer = 0, buildSeq = 0, inlaySeq = 0;
function scheduleRebuild() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuild, 220); }
function scheduleInlay() { clearTimeout(inlayTimer); inlayTimer = setTimeout(rebuildInlay, 220); }

function textureOptions() {
  const t = textureById(state.texture);
  return {
    texture: state.texture, where: state.where, direction: state.direction, mapping: els.mappingSelect.value,
    period: num(els.periodInput, t.defaults.period), depth: num(els.depthInput, t.defaults.depth), angle: num(els.angleInput, 0),
    bottomClear: num(els.bottomClearInput, 1.2), edgeFade: num(els.edgeFadeInput, 1), insideWalls: els.insideToggle.checked,
    target: els.fineToggle.checked ? 0.3 : DEFAULTS.target, maxTriangles: els.fineToggle.checked ? 2000000 : 900000, knobs: { ...state.knobs },
  };
}

async function rebuild() {
  if (!state.source) return;
  const seq = ++buildSeq;
  busy(true, 'Texturing');
  try {
    const r = await ask('texture', state.source, textureOptions());
    if (seq !== buildSeq) return;
    state.textured = r.mesh; state.texStats = r.stats; state.mapping = r.mapping; state.texturedShare = r.textured;
    if (preview) preview.show(state.textured, state.inlay, { size: r.stats.size });
    setOutputs();
    rebuildInlay();
  } catch (err) { toast(err.message); }
  finally { if (seq === buildSeq) busy(false); }
}

async function rebuildInlay() {
  if (!state.source) return;
  if (state.inlayPattern === 'none') { state.inlay = null; state.inlayInfo = null; if (preview && state.textured) preview.show(state.textured, null); els.inlayStatus.textContent = ''; setOutputs(); return; }
  const seq = ++inlaySeq;
  // footprint size for the text raster: ask the worker for cells? cheap enough to compute here from bounds
  const b = bounds(state.source), cell = 0.25;
  const fpGuess = { width: Math.ceil((b.size[0] + 2 * cell) / cell) + 1, height: Math.ceil((b.size[1] + 2 * cell) / cell) + 1, cell };
  let raster = null;
  if (state.inlayPattern === 'text') { raster = textRaster(els.inlayText.value, fpGuess); if (!raster) { els.inlayStatus.textContent = 'Type some text.'; state.inlay = null; setOutputs(); return; } }
  if (state.inlayPattern === 'image') { if (!state.imageRaster) { els.inlayStatus.textContent = 'Choose a picture.'; state.inlay = null; setOutputs(); return; } raster = fitRaster(state.imageRaster, fpGuess); }
  busy(true, 'Laying the first layer');
  try {
    const r = await ask('inlay', state.source, {
      pattern: state.inlayPattern, period: num(els.inlayPeriodInput, 6), weight: num(els.inlayWeightInput, 0.35), angle: num(els.inlayAngleInput, 0),
      layers: Math.max(1, Math.round(num(els.inlayLayersInput, 2))), layerHeight: 0.2, margin: num(els.inlayMarginInput, 1), mirror: els.mirrorToggle.checked, raster, cell,
    });
    if (seq !== inlaySeq) return;
    state.inlay = r.mesh; state.inlayInfo = r;
    els.inlayStatus.textContent = r.count ? `${r.area.toFixed(0)} mm² in the second colour, ${r.height} mm tall, about ${r.grams.toFixed(1)} g.` : 'The pattern found nothing inside the footprint — a bigger repeat, a smaller margin, or a different pattern.';
    if (preview && state.textured) preview.show(state.textured, state.inlay);
    setOutputs();
  } catch (err) { toast(err.message); }
  finally { if (seq === inlaySeq) busy(false); }
}

/** Scale a 0/1 raster to fit inside the footprint less a border, nearest neighbour. */
function fitRaster(r, fp) {
  const margin = num(els.inlayMarginInput, 1) / fp.cell;
  const maxW = fp.width - 2 * margin - 4, maxH = fp.height - 2 * margin - 4;
  const s = Math.min(maxW / r.width, maxH / r.height);
  const width = Math.max(1, Math.floor(r.width * s)), height = Math.max(1, Math.floor(r.height * s));
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(r.width - 1, Math.floor(x / s)), sy = Math.min(r.height - 1, Math.floor((height - 1 - y) / s)); // flip: canvas y runs down
    data[y * width + x] = r.data[sy * r.width + sx];
  }
  return { data, width, height };
}

function busy(on, what = '') {
  state.busy += on ? 1 : -1;
  if (state.busy < 0) state.busy = 0;
  if (state.busy) els.viewerStatus.innerHTML = `<span class="status-dot"></span>${what}…`;
  else if (state.texStats) els.viewerStatus.innerHTML = `<span class="status-dot"></span>${state.texStats.triangles.toLocaleString()} triangles · ${state.mapping === 'around' ? 'wrapped around the axis' : 'flat faces'}`;
}

/* ---------- outputs ---------- */

function setOutputs() {
  const pr = printer();
  els.bedField.hidden = !pr.presets;
  const s = state.texStats;
  if (!state.textured || !s) {
    els.readGrid.innerHTML = ''; els.readNote.textContent = 'Load a part to see.';
    els.totalsLine.textContent = 'Nothing to print yet.';
    els.download3mf.disabled = els.downloadBody.disabled = els.downloadInlay.disabled = true;
    els.profileNote.textContent = '';
    return;
  }
  const over = s.overhang;
  const cls = over < 45 ? 'good' : over < 60 ? 'warn' : 'bad';
  const steep = s.steepArea || 0;
  els.readGrid.innerHTML = `
    <div class="read ${cls}"><small>Steepest overhang</small><strong>${over.toFixed(0)}°</strong></div>
    <div class="read ${steep < 20 ? 'good' : steep < 200 ? 'warn' : 'bad'}"><small>Area past 50°</small><strong>${steep < 1 ? '0' : steep.toFixed(0)} mm²</strong></div>
    <div class="read"><small>Triangles</small><strong>${(s.triangles / 1000).toFixed(0)}k</strong></div>
    <div class="read"><small>Volume</small><strong>${(s.volume / 1000).toFixed(1)} cm³</strong></div>`;
  els.readNote.textContent = over < 45 ? 'Prints cleanly on any printer, no supports: every slope is under 45°.'
    : over < 60 ? 'Prints with good cooling; the steepest slopes are between 45° and 60°. A longer repeat or a shallower depth brings them down.'
    : 'Some slopes are past 60° and will sag or need supports. Choose a gentler texture (flutes, ripples, orange peel, leather), a longer repeat, or less depth.';
  const grams = s.volume * 1.24 / 1000 * 0.45 + (state.inlayInfo ? state.inlayInfo.grams : 0);
  const mins = (s.volume * 0.45 / (0.42 * 0.2) / 100) / 60 * 1.6;
  els.totalsLine.innerHTML = `${state.name}: <strong>${s.size.map(v => v.toFixed(0)).join(' × ')} mm</strong>; about <strong>${Math.round(grams)} g</strong> and <strong>${minutes(mins)}</strong> at 15 % infill, roughly — the slicer knows better.${state.inlay && state.inlayInfo?.count ? ` The inlay adds ${state.inlayInfo.grams.toFixed(1)} g in the second colour.` : ''}`;
  els.download3mf.disabled = els.downloadBody.disabled = false; els.downloadInlay.disabled = !(state.inlay && state.inlayInfo?.count);
  els.profileNote.innerHTML = pr.presets
    ? `<strong>Opens as a project with no warning.</strong> The file names the ${pr.short}’s own presets and the ${BED_TYPES.find(b => b[0] === state.bed)[1].toLowerCase()}${state.inlay && state.inlayInfo?.count ? ', with two filaments in your two colours; the inlay part is on filament 2' : ''}. Pick your real filament${state.inlay ? 's' : ''} and process after it opens.`
    : `<strong>Open it as a project</strong> (File › Open Project). The object has ${state.inlay && state.inlayInfo?.count ? 'two parts: set the inlay part to your second filament' : 'one part'}.`;
}

for (const sel of [els.printerSelect, els.printerSelect2]) {
  for (const p of PRINTERS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.append(o); }
  sel.value = state.printerId;
  sel.addEventListener('change', () => { state.printerId = sel.value; els.printerSelect.value = els.printerSelect2.value = sel.value; setOutputs(); });
}
for (const [id, name] of BED_TYPES) { const o = document.createElement('option'); o.value = id; o.textContent = name; els.bedSelect.append(o); }
els.bedSelect.addEventListener('change', () => { state.bed = els.bedSelect.value; setOutputs(); });

els.download3mf.addEventListener('click', async () => {
  if (!state.textured || els.download3mf.disabled) return;
  els.download3mf.disabled = true;
  const parts = [{ name: `${state.name} (textured)`, mesh: state.textured, extruder: 1 }];
  const hasInlay = state.inlay && state.inlayInfo?.count;
  if (hasInlay) parts.push({ name: 'First-layer inlay', mesh: state.inlay, extruder: 2 });
  const colours = hasInlay ? [els.bodyColour.value.toUpperCase(), els.inlayColour.value.toUpperCase()] : [els.bodyColour.value.toUpperCase()];
  try {
  download(`knurl-${state.name}.3mf`, await threeMF(parts, { printer: printer(), plate: state.bed, colours, title: `${state.name} — ${textureById(state.texture).name}` }), 'model/3mf');
  toast(printer().presets ? 'Open it as a project in Bambu Studio; then pick your filaments.' : 'Open it as a project in Bambu Studio.');
  } finally { els.download3mf.disabled = false; }
});
els.downloadBody.addEventListener('click', () => { if (state.textured) download(`knurl-${state.name}.stl`, binarySTL(state.textured, `Knurl ${state.name} | ${state.texture} | mm | Z up`), 'model/stl'); });
els.downloadInlay.addEventListener('click', () => { if (state.inlay) download(`knurl-${state.name}-inlay.stl`, binarySTL(state.inlay, 'Knurl first-layer inlay | mm | same frame as the part'), 'model/stl'); });

els.guideBtn.addEventListener('click', () => { if (typeof els.guide.showModal === 'function') els.guide.showModal(); else els.guide.setAttribute('open', ''); });
els.guideClose.addEventListener('click', () => els.guide.close());
els.guide.addEventListener('click', e => { if (e.target === els.guide) els.guide.close(); });

renderTextureChips(); renderWhereChips(); renderInlayChips();
selectTexture(state.texture);
setOutputs();
