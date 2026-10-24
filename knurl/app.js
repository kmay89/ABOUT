/**
 * Knurl — the page. A part in, a texture and a first-layer inlay chosen,
 * the solids built in a worker and shown in 3D, files out. The thinking is
 * in texture.js, inlay.js, textures.js and export.js; this wires them up:
 * looks, the live swatch, tap-to-pick faces, bands, stamps, the heat view,
 * make-it-print, fast preview with full-detail export, and a share link.
 */
import { parseModel, bounds, watertight, binarySTL, translate } from './mesh.js';
import { ALL_TEXTURES, INLAYS, textureById } from './textures.js';
import { WHERE, DEFAULTS, tuneDepth } from './texture.js';
import { SAMPLES } from './samples.js';
import { PRINTERS, threeMF } from './export.js';
import { LOOKS, lookById } from './looks.js';
import { encodeSettings, decodeSettings } from './settings.js';
import { PartPreview } from './preview.js';

const $ = id => document.getElementById(id);
const ids = ['printerSelect', 'printerSelect2', 'bedField', 'bedSelect', 'guideBtn', 'guide', 'guideClose', 'stageLabel', 'viewBelowBtn', 'resetViewBtn', 'heatBtn', 'originalBtn', 'viewer', 'viewerEmpty', 'viewerFallback', 'viewerStatus', 'fileInput', 'sampleChips', 'readGrid', 'readNote', 'tuneBtn',
  'lookChips', 'textureChips', 'swatch', 'textureBlurb', 'periodInput', 'depthInput', 'angleInput', 'knobGrid', 'dirIn', 'dirOut', 'stampField', 'stampText', 'stampImage', 'stampOnce', 'stampTile',
  'whereChips', 'whereBlurb', 'pickBar', 'pickCount', 'clearPicksBtn', 'bottomClearInput', 'edgeFadeInput', 'mappingSelect', 'bandFromInput', 'bandToInput', 'rampSelect', 'insideToggle', 'draftToggle', 'fineToggle',
  'inlayChips', 'inlayFields', 'inlayPeriodInput', 'inlayWeightInput', 'inlayAngleInput', 'inlayLayersInput', 'inlayMarginInput', 'inlayColour', 'textField', 'inlayText', 'imageField', 'inlayImage', 'mirrorToggle', 'inlayStatus',
  'bodyColour', 'totalsLine', 'warnings', 'download3mf', 'downloadBody', 'downloadInlay', 'profileNote', 'shareBtn', 'toast'];
const els = Object.fromEntries(ids.map(id => [id, $(id)]));
const BED_TYPES = [['Textured PEI Plate', 'Textured PEI plate'], ['Cool Plate', 'Cool plate (smooth PEI)'], ['Supertack Plate', 'Cool Plate SuperTack'], ['High Temp Plate', 'High temperature plate'], ['Engineering Plate', 'Engineering plate']];
const FONT = '700 {size}px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const state = {
  source: null, name: 'part', textured: null, texStats: null, mapping: null, inlay: null, inlayInfo: null, lastSource: null, quality: null,
  texture: 'knurl', where: 'walls', direction: 'in', knobs: {}, look: null, inlayPattern: 'none', imageRaster: null,
  stampTile: false, stampImage: null, stampCache: null, regionIds: null, picked: new Set(), heat: false, showOriginal: false,
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
const setPressed = (group, id) => { for (const c of group.querySelectorAll('.chip')) c.setAttribute('aria-pressed', String(c.dataset.id === id)); };

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

async function setSource(mesh, name) {
  const w = watertight(mesh);
  const b = bounds(mesh);
  // stand it on the plate, centred
  const m = translate(mesh, [-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]]);
  state.source = m; state.name = name.replace(/\.[^.]+$/, '') || 'part';
  state.textured = null; state.inlay = null; state.lastSource = null; state.regionIds = null; state.picked.clear(); state.quality = null;
  els.viewerEmpty.hidden = true;
  els.stageLabel.textContent = `${state.name} · ${b.size.map(v => v.toFixed(0)).join(' × ')} mm · ${(mesh.indices.length / 3).toLocaleString()} triangles`;
  els.warnings.innerHTML = w.closed ? '' : `<p class="warning">This mesh is not closed (${w.boundaryEdges} open edges, ${w.nonManifoldEdges} shared by more than two faces). Textures still apply, but the slicer may need to repair it.</p>`;
  els.bandToInput.placeholder = `top (${b.size[2].toFixed(0)})`;
  updatePickCount();
  rebuild();
  try { const r = await ask('regions', m, { angle: 8 }); if (state.source === m) state.regionIds = r.id_; } catch { /* picking just stays off */ }
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

/* ---------- looks ---------- */

function renderLookChips() {
  els.lookChips.innerHTML = '';
  for (const l of LOOKS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = l.id;
    b.setAttribute('aria-pressed', String(l.id === state.look)); b.innerHTML = `<span>${l.name}</span><small>${l.blurb}</small>`;
    b.addEventListener('click', () => applyLook(l));
    els.lookChips.append(b);
  }
}
function applyLook(l) {
  selectTexture(l.texture, { quiet: true });
  els.periodInput.value = l.period; els.depthInput.value = l.depth; els.angleInput.value = l.angle || 0;
  setDirection(l.direction);
  for (const [k, v] of Object.entries(l.knobs)) { state.knobs[k] = v; const input = $(`knob-${k}`); if (input) input.value = v; }
  els.rampSelect.value = l.ramp || 'none'; els.bandFromInput.value = 0; els.bandToInput.value = '';
  selectWhere(l.where, { quiet: true });
  state.inlayPattern = l.inlay.pattern; setPressed(els.inlayChips, l.inlay.pattern);
  if (l.inlay.period) els.inlayPeriodInput.value = l.inlay.period;
  if (l.inlay.weight) els.inlayWeightInput.value = l.inlay.weight;
  syncInlayFields();
  state.look = l.id; setPressed(els.lookChips, l.id);
  drawSwatch();
  scheduleRebuild({ keepLook: true });
  toast(`${l.name}: ${l.blurb}`);
}
function clearLook() { if (state.look) { state.look = null; setPressed(els.lookChips, null); } }

/* ---------- controls ---------- */

function renderTextureChips() {
  els.textureChips.innerHTML = '';
  for (const t of ALL_TEXTURES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = t.id;
    b.setAttribute('aria-pressed', String(t.id === state.texture)); b.textContent = t.name;
    b.addEventListener('click', () => selectTexture(t.id));
    els.textureChips.append(b);
  }
}
function selectTexture(id, { quiet = false } = {}) {
  state.texture = id; state.knobs = {};
  const t = textureById(id);
  els.periodInput.value = t.defaults.period; els.depthInput.value = t.defaults.depth;
  setPressed(els.textureChips, id);
  els.textureBlurb.textContent = t.blurb;
  els.periodInput.previousElementSibling.textContent = id === 'stamp' ? (state.stampTile ? 'Tile width' : 'Width') : 'Repeat';
  els.stampField.hidden = id !== 'stamp';
  els.knobGrid.innerHTML = '';
  for (const k of t.knobs) {
    const f = document.createElement('div'); f.className = 'field';
    f.innerHTML = `<label for="knob-${k.key}">${k.label}</label><input id="knob-${k.key}" type="number" inputmode="decimal" min="${k.min}" max="${k.max}" step="${k.step}" value="${k.value}">`;
    f.querySelector('input').addEventListener('input', e => { state.knobs[k.key] = num(e.target, k.value); if (id === 'stamp') state.stampCache = null; drawSwatch(); scheduleRebuild(); });
    els.knobGrid.append(f);
  }
  if (!quiet) { drawSwatch(); scheduleRebuild(); }
}
function renderWhereChips() {
  els.whereChips.innerHTML = '';
  for (const w of WHERE) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = w.id;
    b.setAttribute('aria-pressed', String(w.id === state.where)); b.textContent = w.name;
    b.addEventListener('click', () => selectWhere(w.id));
    els.whereChips.append(b);
  }
  els.whereBlurb.textContent = WHERE.find(w => w.id === state.where).blurb;
}
function selectWhere(id, { quiet = false } = {}) {
  state.where = id; setPressed(els.whereChips, id);
  els.whereBlurb.textContent = WHERE.find(w => w.id === id).blurb;
  const picking = id === 'picked';
  els.pickBar.hidden = !picking; els.viewer.classList.toggle('picking', picking);
  if (!quiet) scheduleRebuild();
}
function renderInlayChips() {
  els.inlayChips.innerHTML = '';
  for (const p of INLAYS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = p.id;
    b.setAttribute('aria-pressed', String(p.id === state.inlayPattern)); b.textContent = p.name;
    b.addEventListener('click', () => { state.inlayPattern = p.id; setPressed(els.inlayChips, p.id); clearLook(); syncInlayFields(); scheduleInlay(); });
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
function setDirection(dir) { state.direction = dir; els.dirIn.setAttribute('aria-pressed', String(dir === 'in')); els.dirOut.setAttribute('aria-pressed', String(dir === 'out')); }
for (const [el, dir] of [[els.dirIn, 'in'], [els.dirOut, 'out']]) el.addEventListener('click', () => { setDirection(dir); drawSwatch(); scheduleRebuild(); });
for (const [el, tile] of [[els.stampOnce, false], [els.stampTile, true]]) el.addEventListener('click', () => {
  state.stampTile = tile; els.stampOnce.setAttribute('aria-pressed', String(!tile)); els.stampTile.setAttribute('aria-pressed', String(tile));
  els.periodInput.previousElementSibling.textContent = tile ? 'Tile width' : 'Width';
  drawSwatch(); scheduleRebuild();
});
for (const el of [els.periodInput, els.depthInput, els.angleInput]) el.addEventListener('input', () => { drawSwatch(); scheduleRebuild(); });
for (const el of [els.bottomClearInput, els.edgeFadeInput, els.bandFromInput, els.bandToInput]) el.addEventListener('input', scheduleRebuild);
for (const el of [els.mappingSelect, els.rampSelect, els.insideToggle, els.draftToggle, els.fineToggle]) el.addEventListener('change', scheduleRebuild);
els.stampText.addEventListener('input', () => { state.stampCache = null; drawSwatch(); scheduleRebuild(); });
els.stampImage.addEventListener('change', async () => {
  const f = els.stampImage.files[0]; if (!f) return;
  try {
    state.stampImage = await greyRaster(f, 480);
    state.stampCache = null; drawSwatch(); scheduleRebuild();
    toast('Picture loaded: dark is deep. Clear the text field to use it alone.');
  } catch { toast('That picture could not be read.'); }
});
for (const el of [els.inlayPeriodInput, els.inlayWeightInput, els.inlayAngleInput, els.inlayLayersInput, els.inlayMarginInput, els.inlayText]) el.addEventListener('input', scheduleInlay);
els.mirrorToggle.addEventListener('change', scheduleInlay);
els.inlayColour.addEventListener('input', () => { preview?.setColours(els.bodyColour.value, els.inlayColour.value); setOutputs(); });
els.bodyColour.addEventListener('input', () => { preview?.setColours(els.bodyColour.value, els.inlayColour.value); drawSwatch(); setOutputs(); });
els.inlayImage.addEventListener('change', async () => {
  const f = els.inlayImage.files[0]; if (!f) return;
  try {
    const g = await greyRaster(f, 600);
    const data = new Uint8Array(g.width * g.height);
    for (let i = 0; i < data.length; i++) data[i] = g.data[i] > 127 ? 1 : 0;   // dark (deep) → the second colour
    state.imageRaster = { data, width: g.width, height: g.height };
    scheduleInlay();
  } catch { toast('That picture could not be read.'); }
});
els.clearPicksBtn.addEventListener('click', () => { state.picked.clear(); updatePickCount(); scheduleRebuild(); });

/* ---------- rasterising text and pictures ---------- */

/** A picture as 0..255 per pixel, 255 where it is dark (deep), rows top-down as drawn. */
async function greyRaster(file, maxSide) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas'); const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const data = new Uint8Array(c.width * c.height);
  for (let i = 0; i < data.length; i++) { const l = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000; data[i] = d[i * 4 + 3] > 64 ? 255 - Math.round(l) : 0; }
  return { data, width: c.width, height: c.height };
}
function flipRows(r) {
  const out = new Uint8Array(r.width * r.height);
  for (let y = 0; y < r.height; y++) out.set(r.data.subarray(y * r.width, (y + 1) * r.width), (r.height - 1 - y) * r.width);
  return { data: out, width: r.width, height: r.height };
}
function textRaster(text, fp) {
  // for the inlay: as wide as the footprint allows, less the margin; one row of cells per pixel; 0/1
  if (!text.trim()) return null;
  const margin = num(els.inlayMarginInput, 1) / fp.cell;
  const maxW = Math.max(8, fp.width - 2 * margin - 4), maxH = Math.max(6, fp.height - 2 * margin - 4);
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  let size = Math.floor(maxH * 0.9);
  ctx.font = FONT.replace('{size}', size);
  const w = ctx.measureText(text).width;
  if (w > maxW) size = Math.floor(size * maxW / w);
  if (size < 5) return null;
  ctx.font = FONT.replace('{size}', size);
  const width = Math.ceil(ctx.measureText(text).width) + 2, height = Math.ceil(size * 1.25);
  c.width = width; c.height = height;
  ctx.font = FONT.replace('{size}', size);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000'; ctx.textBaseline = 'middle'; ctx.fillText(text, 1, height / 2);
  const d = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = d[i * 4] < 128 ? 1 : 0;
  return flipRows({ data, width, height });   // the canvas y runs down; the footprint's rows run up (+Y)
}
/** The stamp's raster: the text set big and soft-edged, else the picture; 255 = full cut; rows bottom-up (v up). */
function stampRaster() {
  if (state.stampCache) return state.stampCache;
  const soft = state.knobs.soft ?? 0.2, text = els.stampText.value.trim();
  let r = null;
  if (text) {
    const c = document.createElement('canvas'); const ctx = c.getContext('2d');
    const size = 160; ctx.font = FONT.replace('{size}', size);
    const pad = Math.ceil(10 + soft * 24);
    const width = Math.ceil(ctx.measureText(text).width) + pad * 2, height = Math.ceil(size * 1.2) + pad * 2;
    c.width = width; c.height = height;
    ctx.font = FONT.replace('{size}', size); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
    if (soft > 0 && 'filter' in ctx) ctx.filter = `blur(${(soft * 10).toFixed(1)}px)`;
    ctx.fillStyle = '#000'; ctx.textBaseline = 'middle'; ctx.fillText(text, pad, height / 2);
    const d = ctx.getImageData(0, 0, width, height).data;
    const data = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i++) data[i] = 255 - d[i * 4];
    r = flipRows({ data, width, height });
  } else if (state.stampImage) {
    r = state.stampImage;
    if (soft > 0) {
      const c = document.createElement('canvas'); c.width = r.width; c.height = r.height; const ctx = c.getContext('2d');
      const img = ctx.createImageData(r.width, r.height);
      for (let i = 0; i < r.data.length; i++) { const v = 255 - r.data[i]; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
      ctx.putImageData(img, 0, 0);
      if ('filter' in ctx) { ctx.filter = `blur(${(soft * 6).toFixed(1)}px)`; ctx.drawImage(c, 0, 0); }
      const d = ctx.getImageData(0, 0, r.width, r.height).data;
      const data = new Uint8Array(r.width * r.height);
      for (let i = 0; i < data.length; i++) data[i] = 255 - d[i * 4];
      r = { data, width: r.width, height: r.height };
    }
    r = flipRows(r);
  }
  state.stampCache = r;
  return r;
}

/* ---------- the live swatch ---------- */

function drawSwatch() {
  const c = els.swatch; if (!c) return;
  const ctx = c.getContext('2d'); if (!ctx) return;
  const W = c.width, H = c.height, t = textureById(state.texture);
  const knobs = {}; for (const k of t.knobs) knobs[k.key] = state.knobs[k.key] ?? k.value;
  const period = num(els.periodInput, t.defaults.period), depth = num(els.depthInput, t.defaults.depth);
  const out = state.direction === 'out';
  let span = period * 2.5, h;
  if (t.id === 'stamp') {
    const r = stampRaster();
    if (!r) { ctx.fillStyle = '#d9d5cb'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#5b574f'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Type a word', W / 2, H / 2 - 6); ctx.fillText('or add a picture', W / 2, H / 2 + 10); return; }
    const k = { raster: r, tile: state.stampTile, cu: 0, cv: 0 };
    span = state.stampTile ? period * 2 : Math.max(period, period * r.height / r.width) * 1.15;
    h = (u, v) => t.h(u, v, period, k);
  } else h = (u, v) => t.h(u, v, period, knobs);
  const img = ctx.createImageData(W, H), d = img.data;
  const mm = span / W, step = mm;
  const body = els.bodyColour.value || '#f0ece2';
  const br = parseInt(body.slice(1, 3), 16), bg = parseInt(body.slice(3, 5), 16), bb = parseInt(body.slice(5, 7), 16);
  const lx = -0.55, ly = 0.6, lz = 0.58;
  const grid = new Float32Array((W + 1) * (H + 1));
  for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
    const u = (x - W / 2) * mm, v = (H / 2 - y) * mm;
    const hv = h(u, v);
    grid[y * (W + 1) + x] = (out ? hv : hv - 1) * depth;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * (W + 1) + x;
    const dx = (grid[i + 1] - grid[i]) / step, dy = (grid[i] - grid[i + W + 1]) / step;
    let nx = -dx, ny = -dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const lit = Math.max(0, nx * lx + ny * ly + nz * lz);
    const ao = 0.75 + 0.25 * Math.min(1, Math.max(0, 1 + grid[i] / Math.max(depth, 0.05)));
    const s = (0.35 + 0.75 * lit) * ao;
    const o = (y * W + x) * 4;
    d[o] = Math.min(255, br * s); d[o + 1] = Math.min(255, bg * s); d[o + 2] = Math.min(255, bb * s); d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(6, H - 20, 54, 14);
  ctx.fillStyle = '#fff'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`${span.toFixed(0)} mm across`, 9, H - 9);
}

/* ---------- picking faces ---------- */

let preview = null;
try { preview = new PartPreview(els.viewer, { onFailure: () => { els.viewerFallback.hidden = false; } }); if (preview.failed) preview = null; } catch { els.viewerFallback.hidden = false; }
els.resetViewBtn.addEventListener('click', () => preview?.resetView('front'));
els.viewBelowBtn.addEventListener('click', () => preview?.resetView('below'));
els.heatBtn.addEventListener('click', () => { state.heat = !state.heat; els.heatBtn.setAttribute('aria-pressed', String(state.heat)); preview?.setHeat(state.heat); if (state.heat) toast('Green prints anywhere; amber wants cooling; red will sag.'); });
els.originalBtn.addEventListener('click', () => {
  if (!preview || !state.source) return;
  state.showOriginal = !state.showOriginal; els.originalBtn.setAttribute('aria-pressed', String(state.showOriginal));
  if (state.showOriginal) preview.show(state.source, null); else { preview.show(state.textured || state.source, state.inlay); showPicks(); }
});
let pointerStart = null;
els.viewer.addEventListener('pointerdown', e => { pointerStart = [e.clientX, e.clientY]; });
els.viewer.addEventListener('pointerup', e => {
  if (!pointerStart) return;
  const moved = Math.hypot(e.clientX - pointerStart[0], e.clientY - pointerStart[1]); pointerStart = null;
  if (moved > 5 || state.where !== 'picked' || !preview || !state.source) return;
  if (!state.regionIds) { toast('Still sorting the faces — try again in a moment.'); return; }
  const tri = preview.pick(e.clientX, e.clientY);
  if (tri < 0) return;
  const src = state.showOriginal || !state.lastSource ? tri : state.lastSource[tri];
  const region = state.regionIds[src];
  if (region == null) return;
  if (state.picked.has(region)) state.picked.delete(region); else state.picked.add(region);
  updatePickCount(); clearLook();
  showPicks();
  scheduleRebuild();
});
function pickMask() {
  if (state.where !== 'picked' || !state.regionIds || !state.picked.size) return null;
  const mask = new Uint8Array(state.regionIds.length);
  for (let t = 0; t < mask.length; t++) if (state.picked.has(state.regionIds[t])) mask[t] = 1;
  return mask;
}
function showPicks() {
  if (!preview) return;
  if (state.where !== 'picked') { preview.highlight(null); return; }
  const pick = pickMask();
  if (!pick) { preview.highlight(null); return; }
  const shown = state.showOriginal ? state.source : (state.textured || state.source);
  const n = shown.indices.length / 3, mask = new Uint8Array(n);
  const map = state.showOriginal ? null : state.lastSource;
  for (let t = 0; t < n; t++) { const s = map ? map[t] : t; if (s < pick.length && pick[s]) mask[t] = 1; }
  preview.highlight(mask);
}
function updatePickCount() {
  const n = state.picked.size;
  els.pickCount.textContent = n ? `${n} face${n === 1 ? '' : 's'} picked.` : 'Nothing picked yet.';
}

/* ---------- building ---------- */

let rebuildTimer = 0, inlayTimer = 0, buildSeq = 0, inlaySeq = 0;
function scheduleRebuild({ keepLook = false } = {}) { if (!keepLook) clearLook(); clearTimeout(rebuildTimer); rebuildTimer = setTimeout(() => rebuild(), 220); }
function scheduleInlay() { clearLook(); clearTimeout(inlayTimer); inlayTimer = setTimeout(rebuildInlay, 220); }

const exportQuality = () => (els.fineToggle.checked ? 'fine' : 'full');
const previewQuality = () => (els.draftToggle.checked ? 'draft' : exportQuality());
function textureOptions(quality) {
  const t = textureById(state.texture);
  const knobs = { ...state.knobs };
  if (t.id === 'stamp') { knobs.raster = stampRaster(); knobs.tile = state.stampTile; }
  const bandTo = els.bandToInput.value === '' ? null : num(els.bandToInput, null);
  return {
    texture: state.texture, where: state.where, direction: state.direction, mapping: els.mappingSelect.value,
    period: num(els.periodInput, t.defaults.period), depth: num(els.depthInput, t.defaults.depth), angle: num(els.angleInput, 0),
    bottomClear: num(els.bottomClearInput, 1.2), edgeFade: num(els.edgeFadeInput, 1), insideWalls: els.insideToggle.checked,
    bandFrom: num(els.bandFromInput, 0), bandTo, ramp: els.rampSelect.value, pick: pickMask(),
    target: quality === 'fine' ? 0.3 : DEFAULTS.target, maxTriangles: quality === 'draft' ? 260000 : quality === 'fine' ? 2000000 : 900000, knobs,
  };
}

async function rebuild(quality = previewQuality()) {
  if (!state.source) return;
  const seq = ++buildSeq;
  state.showOriginal = false; els.originalBtn.setAttribute('aria-pressed', 'false');
  busy(true, quality === 'draft' ? 'Texturing (fast preview)' : 'Texturing at full detail');
  try {
    const r = await ask('texture', state.source, textureOptions(quality));
    if (seq !== buildSeq) return;
    state.textured = r.mesh; state.texStats = r.stats; state.mapping = r.mapping; state.texturedShare = r.textured; state.lastSource = r.source || null; state.quality = quality;
    if (preview) { preview.show(state.textured, state.inlay, { size: r.stats.size }); showPicks(); }
    setOutputs();
    rememberSettings();
    rebuildInlay();
  } catch (err) { toast(err.message); }
  finally { if (seq === buildSeq) busy(false); }
}

/** The full-detail mesh, if the one on screen is the fast preview. */
async function ensureFull() {
  if (state.quality === exportQuality()) return;
  toast('Building the full-detail mesh first…');
  await rebuild(exportQuality());
}

async function rebuildInlay() {
  if (!state.source) return;
  if (state.inlayPattern === 'none') { state.inlay = null; state.inlayInfo = null; if (preview && state.textured && !state.showOriginal) { preview.show(state.textured, null); showPicks(); } els.inlayStatus.textContent = ''; setOutputs(); return; }
  const seq = ++inlaySeq;
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
    if (preview && state.textured && !state.showOriginal) { preview.show(state.textured, state.inlay); showPicks(); }
    setOutputs();
    rememberSettings();
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
  else if (state.texStats) els.viewerStatus.innerHTML = `<span class="status-dot"></span>${state.texStats.triangles.toLocaleString()} triangles · ${state.mapping === 'around' ? 'wrapped around the axis' : 'flat faces'}${state.quality === 'draft' ? ' · fast preview' : ''}`;
}

/* ---------- make it print ---------- */

let tuning = false;
els.tuneBtn.addEventListener('click', async () => {
  if (tuning || !state.texStats) return;
  tuning = true; els.tuneBtn.disabled = true;
  try {
    for (let round = 0; round < 3 && state.texStats && state.texStats.overhang > 45; round++) {
      const t = textureById(state.texture);
      const depth = num(els.depthInput, t.defaults.depth), next = tuneDepth(depth, state.texStats.overhang, 42);
      if (next >= depth) break;
      els.depthInput.value = next; drawSwatch(); clearLook();
      clearTimeout(rebuildTimer);
      await rebuild();
    }
    toast(state.texStats && state.texStats.overhang <= 45 ? `Depth ${els.depthInput.value} mm: every slope is under 45°.` : 'Still steep: try a longer repeat or a gentler texture.');
  } finally { tuning = false; els.tuneBtn.disabled = false; }
});

/* ---------- outputs ---------- */

function setOutputs() {
  const pr = printer();
  els.bedField.hidden = !pr.presets;
  const s = state.texStats;
  if (!state.textured || !s) {
    els.readGrid.innerHTML = ''; els.readNote.textContent = 'Load a part to see.'; els.tuneBtn.hidden = true;
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
  els.tuneBtn.hidden = !(over > 45 && state.texturedShare > 0 && num(els.depthInput, 0) > 0.05);
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
  sel.addEventListener('change', () => { state.printerId = sel.value; els.printerSelect.value = els.printerSelect2.value = sel.value; try { localStorage.setItem('knurl.printer', sel.value); } catch { /* fine */ } setOutputs(); });
}
for (const [id, name] of BED_TYPES) { const o = document.createElement('option'); o.value = id; o.textContent = name; els.bedSelect.append(o); }
els.bedSelect.addEventListener('change', () => { state.bed = els.bedSelect.value; setOutputs(); });

els.download3mf.addEventListener('click', async () => {
  if (!state.textured || els.download3mf.disabled) return;
  els.download3mf.disabled = true;
  try {
    await ensureFull();
    const parts = [{ name: `${state.name} (textured)`, mesh: state.textured, extruder: 1 }];
    const hasInlay = state.inlay && state.inlayInfo?.count;
    if (hasInlay) parts.push({ name: 'First-layer inlay', mesh: state.inlay, extruder: 2 });
    const colours = hasInlay ? [els.bodyColour.value.toUpperCase(), els.inlayColour.value.toUpperCase()] : [els.bodyColour.value.toUpperCase()];
    download(`knurl-${state.name}.3mf`, await threeMF(parts, { printer: printer(), plate: state.bed, colours, title: `${state.name} — ${textureById(state.texture).name}` }), 'model/3mf');
    toast(printer().presets ? 'Open it as a project in Bambu Studio; then pick your filaments.' : 'Open it as a project in Bambu Studio.');
  } finally { els.download3mf.disabled = false; }
});
els.downloadBody.addEventListener('click', async () => { if (!state.textured) return; await ensureFull(); download(`knurl-${state.name}.stl`, binarySTL(state.textured, `Knurl ${state.name} | ${state.texture} | mm | Z up`), 'model/stl'); });
els.downloadInlay.addEventListener('click', () => { if (state.inlay) download(`knurl-${state.name}-inlay.stl`, binarySTL(state.inlay, 'Knurl first-layer inlay | mm | same frame as the part'), 'model/stl'); });

/* ---------- settings in the link ---------- */

function currentSettings() {
  return {
    texture: state.texture, period: num(els.periodInput, NaN), depth: num(els.depthInput, NaN), angle: num(els.angleInput, 0), direction: state.direction,
    where: state.where === 'picked' ? 'walls' : state.where, bottomClear: num(els.bottomClearInput, 1.2), edgeFade: num(els.edgeFadeInput, 1), mapping: els.mappingSelect.value, insideWalls: els.insideToggle.checked,
    bandFrom: num(els.bandFromInput, 0), bandTo: els.bandToInput.value === '' ? null : num(els.bandToInput, null), ramp: els.rampSelect.value, tile: state.stampTile, stampText: els.stampText.value,
    inlayPattern: state.inlayPattern, inlayPeriod: num(els.inlayPeriodInput, 6), inlayWeight: num(els.inlayWeightInput, 0.35), inlayAngle: num(els.inlayAngleInput, 0), inlayLayers: num(els.inlayLayersInput, 2), inlayMargin: num(els.inlayMarginInput, 1),
    inlayText: els.inlayText.value, inlayColour: els.inlayColour.value, bodyColour: els.bodyColour.value, printerId: state.printerId, bed: state.bed, knobs: { ...state.knobs },
  };
}
function rememberSettings() {
  try { history.replaceState(null, '', '#' + encodeSettings(currentSettings())); } catch { /* fine */ }
}
function applySettings(s) {
  if (s.texture && textureById(s.texture).id === s.texture) selectTexture(s.texture, { quiet: true });
  if (s.period != null) els.periodInput.value = s.period;
  if (s.depth != null) els.depthInput.value = s.depth;
  if (s.angle != null) els.angleInput.value = s.angle;
  if (s.direction === 'in' || s.direction === 'out') setDirection(s.direction);
  for (const [k, v] of Object.entries(s.knobs || {})) { const input = $(`knob-${k}`); if (input) { input.value = v; state.knobs[k] = v; } }
  if (s.where && WHERE.some(w => w.id === s.where) && s.where !== 'picked') selectWhere(s.where, { quiet: true });
  if (s.bottomClear != null) els.bottomClearInput.value = s.bottomClear;
  if (s.edgeFade != null) els.edgeFadeInput.value = s.edgeFade;
  if (['auto', 'flat', 'around'].includes(s.mapping)) els.mappingSelect.value = s.mapping;
  if (s.insideWalls != null) els.insideToggle.checked = !!s.insideWalls;
  if (s.bandFrom != null) els.bandFromInput.value = s.bandFrom;
  if (s.bandTo != null) els.bandToInput.value = s.bandTo;
  if (['none', 'up', 'down'].includes(s.ramp)) els.rampSelect.value = s.ramp;
  if (s.tile != null) { state.stampTile = !!s.tile; els.stampOnce.setAttribute('aria-pressed', String(!s.tile)); els.stampTile.setAttribute('aria-pressed', String(!!s.tile)); }
  if (s.stampText != null) els.stampText.value = s.stampText;
  if (s.inlayPattern && INLAYS.some(p => p.id === s.inlayPattern)) { state.inlayPattern = s.inlayPattern; setPressed(els.inlayChips, s.inlayPattern); syncInlayFields(); }
  if (s.inlayPeriod != null) els.inlayPeriodInput.value = s.inlayPeriod;
  if (s.inlayWeight != null) els.inlayWeightInput.value = s.inlayWeight;
  if (s.inlayAngle != null) els.inlayAngleInput.value = s.inlayAngle;
  if (s.inlayLayers != null) els.inlayLayersInput.value = s.inlayLayers;
  if (s.inlayMargin != null) els.inlayMarginInput.value = s.inlayMargin;
  if (s.inlayText != null) els.inlayText.value = s.inlayText;
  if (/^#[0-9a-f]{6}$/i.test(s.inlayColour || '')) els.inlayColour.value = s.inlayColour;
  if (/^#[0-9a-f]{6}$/i.test(s.bodyColour || '')) els.bodyColour.value = s.bodyColour;
  if (s.printerId && PRINTERS.some(p => p.id === s.printerId)) { state.printerId = s.printerId; els.printerSelect.value = els.printerSelect2.value = s.printerId; }
  if (s.bed && BED_TYPES.some(b => b[0] === s.bed)) { state.bed = s.bed; els.bedSelect.value = s.bed; }
  preview?.setColours(els.bodyColour.value, els.inlayColour.value);
}
els.shareBtn.addEventListener('click', async () => {
  rememberSettings();
  const url = location.href;
  try { await navigator.clipboard.writeText(url); toast('Link copied: it opens Knurl with these settings. Add the part yourself.'); }
  catch { prompt('Copy this link:', url); }
});

els.guideBtn.addEventListener('click', () => { if (typeof els.guide.showModal === 'function') els.guide.showModal(); else els.guide.setAttribute('open', ''); });
els.guideClose.addEventListener('click', () => els.guide.close());
els.guide.addEventListener('click', e => { if (e.target === els.guide) els.guide.close(); });

/* ---------- go ---------- */

renderLookChips(); renderTextureChips(); renderWhereChips(); renderInlayChips();
for (const sel of [els.printerSelect, els.printerSelect2]) { let saved = null; try { saved = localStorage.getItem('knurl.printer'); } catch { /* fine */ } if (saved && PRINTERS.some(p => p.id === saved)) { state.printerId = saved; sel.value = saved; } }
selectTexture(state.texture, { quiet: true });
const fromLink = decodeSettings(location.hash);
if (fromLink) { applySettings(fromLink); toast('Settings from the link are in. Drop in a part.'); }
drawSwatch();
setOutputs();
