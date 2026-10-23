/**
 * Cameo — the page. A photo in, a cut-out made by a model or by hand, a
 * figurine and its pedestal built live and shown in 3D, files out. The
 * thinking is in mask.js (the cut-out), relief.js (the solids), ai.js
 * (the models) and export.js (the files); this file wires them up.
 */
import * as M from './mask.js';
import { buildFigure, buildPedestal, FIGURE_DEFAULTS, PEDESTAL_DEFAULTS, volume } from './relief.js';
import { removeBackground, estimateDepth } from './ai.js';
import { PRINTERS, layout, threeMF, binarySTL, PART_SETTINGS } from './export.js';
import { FigurePreview } from './preview.js';

const $ = id => document.getElementById(id);
const els = Object.fromEntries(['printerSelect', 'printerSelect2', 'bedField', 'bedSelect', 'guideBtn', 'guide', 'guideClose', 'cutHint', 'cutTools', 'toolWand', 'toolAdd', 'toolErase', 'brushSize', 'wandTol', 'undoBtn', 'clearMaskBtn', 'drop', 'photoCanvas', 'maskCanvas', 'dropEmpty', 'fileInput', 'sampleBtn', 'cutStatus', 'viewer', 'viewerEmpty', 'viewerFallback', 'viewerStatus', 'resetViewBtn', 'aiCutBtn', 'aiDepthBtn', 'aiStatus', 'heightInput', 'roundInput', 'reliefInput', 'detailInput', 'backInput', 'holeInput', 'pedChips', 'pedHeightInput', 'pedDepthInput', 'clearanceInput', 'totalsLine', 'warnings', 'download3mf', 'downloadFigure', 'downloadPedestal', 'profileNote', 'toast'].map(id => [id, $(id)]));

const BED_TYPES = [['Textured PEI Plate', 'Textured PEI plate'], ['Cool Plate', 'Cool plate (smooth PEI)'], ['Supertack Plate', 'Cool Plate SuperTack'], ['High Temp Plate', 'High temperature plate'], ['Engineering Plate', 'Engineering plate']];
const MAX_SIDE = 1024; // the working size of the photo

const state = {
  photo: null,          // { width, height, rgba }
  mask: null,           // the raw cut-out at photo size (what the tools edit)
  depth: null,          // Float32Array at photo size, or null
  history: [],
  tool: 'wand',
  pedestal: 'oval',
  printerId: PRINTERS[0].id, bed: BED_TYPES[0][0],
  figure: null, ped: null, placed: null,
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

/* ---------- the photo ---------- */

async function loadPhoto(source) {
  let bitmap;
  try { bitmap = await createImageBitmap(source); } catch { toast('That file is not a picture this browser can read.'); return; }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
  const c = els.photoCanvas; c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  state.photo = { width: w, height: h, rgba: ctx.getImageData(0, 0, w, h).data };
  state.mask = M.makeMask(w, h); state.depth = null; state.history = [];
  els.maskCanvas.width = w; els.maskCanvas.height = h;
  els.photoCanvas.hidden = false; els.maskCanvas.hidden = false; els.dropEmpty.hidden = true; els.cutTools.hidden = false;
  els.aiCutBtn.disabled = false; els.aiDepthBtn.disabled = false;
  els.aiStatus.textContent = 'Photo loaded. Press “Cut out the subject”, or click the subject with the wand.';
  els.cutHint.textContent = 'Wand: click the subject to add everything of that colour. Paint and Erase fix the rest. The figure updates as you go.';
  drawMask(); rebuild();
}

function drawMask() {
  const { width, height } = state.mask;
  const ctx = els.maskCanvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  const d = img.data, k = state.mask.data;
  for (let i = 0, p = 0; i < k.length; i++, p += 4) {
    if (k[i]) { d[p] = 232; d[p + 1] = 174; d[p + 2] = 57; d[p + 3] = 110; }
    else { d[p] = 20; d[p + 1] = 24; d[p + 2] = 20; d[p + 3] = 120; }
  }
  ctx.putImageData(img, 0, 0);
  const n = M.count(state.mask);
  els.cutStatus.innerHTML = n ? `<span><strong>${Math.round(100 * n / k.length)} %</strong> of the photo is the subject</span><span>${state.depth ? 'depth: from the model' : 'depth: none yet — rounded from the outline'}</span>` : '<span>Nothing cut out yet.</span>';
}

function pushHistory() { state.history.push(M.clone(state.mask)); if (state.history.length > 20) state.history.shift(); els.undoBtn.disabled = false; }

/* ---------- tools on the canvas ---------- */

function canvasPoint(e) {
  const r = els.maskCanvas.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) * els.maskCanvas.width / r.width), Math.floor((e.clientY - r.top) * els.maskCanvas.height / r.height)];
}
let painting = false;
els.maskCanvas.addEventListener('pointerdown', e => {
  if (!state.photo) return;
  const [x, y] = canvasPoint(e);
  if (x < 0 || y < 0 || x >= state.mask.width || y >= state.mask.height) return;
  pushHistory();
  if (state.tool === 'wand') {
    const region = M.wand(state.photo.rgba, state.photo.width, state.photo.height, x, y, Number(els.wandTol.value));
    state.mask = e.shiftKey || e.altKey ? M.subtract(state.mask, region) : M.union(state.mask, region);
    drawMask(); scheduleRebuild();
  } else {
    painting = true; els.maskCanvas.setPointerCapture(e.pointerId);
    paintAt(x, y);
  }
});
function paintAt(x, y) {
  const radius = Number(els.brushSize.value) * state.mask.width / els.maskCanvas.getBoundingClientRect().width / 2;
  M.brush(state.mask, x, y, Math.max(1, radius), state.tool === 'add' ? 1 : 0);
  drawMask();
}
els.maskCanvas.addEventListener('pointermove', e => { if (painting) { const [x, y] = canvasPoint(e); paintAt(x, y); } });
const endPaint = () => { if (painting) { painting = false; scheduleRebuild(); } };
els.maskCanvas.addEventListener('pointerup', endPaint);
els.maskCanvas.addEventListener('pointercancel', endPaint);
for (const [el, tool] of [[els.toolWand, 'wand'], [els.toolAdd, 'add'], [els.toolErase, 'erase']]) {
  el.addEventListener('click', () => { state.tool = tool; for (const [e2, t2] of [[els.toolWand, 'wand'], [els.toolAdd, 'add'], [els.toolErase, 'erase']]) e2.setAttribute('aria-pressed', String(t2 === tool)); });
}
els.undoBtn.addEventListener('click', () => { const prev = state.history.pop(); if (prev) { state.mask = prev; drawMask(); scheduleRebuild(); } els.undoBtn.disabled = !state.history.length; });
els.clearMaskBtn.addEventListener('click', () => { if (!state.mask) return; pushHistory(); state.mask = M.makeMask(state.mask.width, state.mask.height); drawMask(); scheduleRebuild(); });

/* ---------- loading ---------- */

els.fileInput.addEventListener('change', () => { const f = els.fileInput.files[0]; if (f) loadPhoto(f); });
els.sampleBtn.addEventListener('click', async () => {
  try { const res = await fetch('sample.jpg'); loadPhoto(await res.blob()); } catch { toast('The sample could not be loaded.'); }
});
for (const ev of ['dragenter', 'dragover']) els.drop.addEventListener(ev, e => { e.preventDefault(); els.drop.classList.add('over'); });
for (const ev of ['dragleave', 'drop']) els.drop.addEventListener(ev, e => { e.preventDefault(); els.drop.classList.remove('over'); });
els.drop.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadPhoto(f); });
document.addEventListener('paste', e => { const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if (item) loadPhoto(item.getAsFile()); });

/* ---------- the models ---------- */

function progressText(p) {
  if (!p) return '';
  if (p.status === 'progress' && p.file) return `downloading ${p.file.split('/').pop()} ${Math.round(p.progress || 0)} %`;
  if (p.status === 'done') return `${p.file ? p.file.split('/').pop() + ' ready' : 'ready'}`;
  return p.status || '';
}
els.aiCutBtn.addEventListener('click', async () => {
  if (!state.photo) return;
  els.aiCutBtn.disabled = true;
  els.aiStatus.textContent = 'Loading the cut-out model (about 45 MB the first time)…';
  try {
    const { alpha } = await removeBackground(els.photoCanvas, { onProgress: p => { const t = progressText(p); if (t) els.aiStatus.textContent = `Cut-out model: ${t}`; } });
    pushHistory();
    state.mask = M.fromAlpha(alpha, state.photo.width, state.photo.height, 128);
    drawMask(); scheduleRebuild();
    els.aiStatus.textContent = 'Subject cut out. Fix any stray bits with the brushes, then add depth.';
  } catch (err) {
    els.aiStatus.textContent = `The cut-out model could not run (${err.message || err}). Use the wand: click the subject, raise the tolerance until it fills, and paint the rest.`;
  }
  els.aiCutBtn.disabled = false;
});
els.aiDepthBtn.addEventListener('click', async () => {
  if (!state.photo) return;
  els.aiDepthBtn.disabled = true;
  els.aiStatus.textContent = 'Loading the depth model (about 25 MB the first time)…';
  try {
    const { depth } = await estimateDepth(els.photoCanvas, { onProgress: p => { const t = progressText(p); if (t) els.aiStatus.textContent = `Depth model: ${t}`; } });
    state.depth = depth;
    drawMask(); scheduleRebuild();
    els.aiStatus.textContent = 'Depth added: nearer parts now stand proud. Tune “Depth relief” and “Fine detail”.';
  } catch (err) {
    els.aiStatus.textContent = `The depth model could not run (${err.message || err}). The figure is rounded from its outline alone, which still looks good.`;
  }
  els.aiDepthBtn.disabled = false;
});

/* ---------- the solids ---------- */

let preview = null;
try {
  preview = new FigurePreview(els.viewer, { onFailure: () => { els.viewerFallback.hidden = false; } });
  if (preview.failed) preview = null;
} catch { els.viewerFallback.hidden = false; }
els.resetViewBtn.addEventListener('click', () => preview?.resetView(state.figure ? Math.max(state.figure.size[1], state.ped ? state.ped.length : 0) + 40 : 120));

let rebuildTimer = 0;
function scheduleRebuild() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuild, 160); }

function options() {
  return {
    height: num(els.heightInput, FIGURE_DEFAULTS.height), round: num(els.roundInput, FIGURE_DEFAULTS.round), relief: num(els.reliefInput, FIGURE_DEFAULTS.relief),
    detail: num(els.detailInput, FIGURE_DEFAULTS.detail), back: num(els.backInput, FIGURE_DEFAULTS.back),
  };
}

function rebuild() {
  if (!state.mask || !M.count(state.mask)) { state.figure = state.ped = state.placed = null; setOutputs(); return; }
  els.viewerStatus.innerHTML = '<span class="status-dot"></span>Building the figurine';
  try {
    const tidy = M.tidy(state.mask, { radius: 2, holeArea: num(els.holeInput, 400) });
    if (!M.count(tidy)) { state.figure = null; setOutputs(); return; }
    const o = options();
    state.figure = buildFigure(tidy, state.depth, o);
    state.ped = state.pedestal === 'none' ? null : buildPedestal(state.figure.tab, { shape: state.pedestal, height: num(els.pedHeightInput, PEDESTAL_DEFAULTS.height), depth: num(els.pedDepthInput, PEDESTAL_DEFAULTS.depth), clearance: num(els.clearanceInput, PEDESTAL_DEFAULTS.clearance) });
  } catch (err) {
    state.figure = null; els.viewerStatus.innerHTML = `<span class="status-dot"></span>${err.message}`; setOutputs(); return;
  }
  setOutputs();
}

function setOutputs() {
  const fig = state.figure, ped = state.ped, pr = printer();
  els.bedField.hidden = !pr.presets;
  if (!fig) {
    els.viewerEmpty.hidden = false;
    els.totalsLine.textContent = 'Nothing to print yet.';
    els.warnings.innerHTML = '';
    els.download3mf.disabled = els.downloadFigure.disabled = els.downloadPedestal.disabled = true;
    els.viewerStatus.innerHTML = '<span class="status-dot"></span>Waiting for a cut-out';
    els.profileNote.textContent = '';
    return;
  }
  els.viewerEmpty.hidden = true;
  if (preview) preview.show(fig, ped || buildPedestal(fig.tab, { height: 0.01, slotDepth: 0 }));
  const parts = [{ name: 'Figure (lying on its back)', mesh: fig.mesh, size: fig.size, settings: PART_SETTINGS.figure }];
  if (ped) parts.push({ name: 'Pedestal', mesh: ped.mesh, size: ped.size, settings: PART_SETTINGS.pedestal });
  const lay = layout(parts, pr);
  state.placed = lay.placed;
  const mm3 = parts.reduce((s, p) => s + volume(p.mesh), 0), grams = mm3 * 1.24 / 1000;
  const mins = (mm3 / (0.42 * 0.2) / 100) / 60 * 1.7;
  els.totalsLine.innerHTML = `Figure <strong>${fig.size[0].toFixed(0)} × ${fig.size[1].toFixed(0)} mm</strong>, ${fig.size[2].toFixed(1)} mm at its thickest${ped ? `; pedestal ${ped.length.toFixed(0)} × ${ped.depth.toFixed(0)} × ${ped.height} mm` : ''}. About <strong>${Math.round(grams)} g</strong> and <strong>${minutes(mins)}</strong> at 0.2 mm layers, roughly; the slicer knows better. ${fig.mesh.indices.length / 3 + (ped ? ped.mesh.indices.length / 3 : 0)} triangles.`;
  els.warnings.innerHTML = lay.warnings.map(w => `<p class="warning">${w}</p>`).join('');
  els.download3mf.disabled = els.downloadFigure.disabled = false; els.downloadPedestal.disabled = !ped;
  els.viewerStatus.innerHTML = `<span class="status-dot"></span>${fig.mesh.indices.length / 3} triangles · ${state.depth ? 'depth from the model' : 'rounded from the outline'}`;
  els.profileNote.innerHTML = pr.presets
    ? `<strong>Opens as a project with no warning.</strong> The file names the ${pr.short}’s own presets and the ${BED_TYPES.find(b => b[0] === state.bed)[1].toLowerCase()}; pick your filament and process after it opens. The figure carries six top layers and no ironing on its face; the pedestal has its top ironed. Print the figure as placed, on its back.`
    : `<strong>Open it as a project</strong> (File › Open Project). Print the figure as placed, lying on its back, 0.12–0.16 mm layers for the finest face; no supports needed.`;
}

for (const el of [els.heightInput, els.roundInput, els.reliefInput, els.detailInput, els.backInput, els.holeInput, els.pedHeightInput, els.pedDepthInput, els.clearanceInput]) el.addEventListener('input', scheduleRebuild);
els.pedChips.addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  state.pedestal = b.dataset.shape;
  for (const c of els.pedChips.querySelectorAll('.chip')) c.setAttribute('aria-pressed', String(c === b));
  scheduleRebuild();
});

/* ---------- printer, downloads ---------- */

for (const sel of [els.printerSelect, els.printerSelect2]) {
  for (const p of PRINTERS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.append(o); }
  sel.value = state.printerId;
  sel.addEventListener('change', () => { state.printerId = sel.value; els.printerSelect.value = els.printerSelect2.value = sel.value; setOutputs(); });
}
for (const [id, name] of BED_TYPES) { const o = document.createElement('option'); o.value = id; o.textContent = name; els.bedSelect.append(o); }
els.bedSelect.addEventListener('change', () => { state.bed = els.bedSelect.value; setOutputs(); });

els.download3mf.addEventListener('click', () => {
  if (!state.placed) return;
  download('cameo-figurine.3mf', threeMF(state.placed, { printer: printer(), plate: state.bed }), 'model/3mf');
  toast(printer().presets ? 'Open it as a project in Bambu Studio; then pick your filament.' : 'Open it as a project in Bambu Studio.');
});
els.downloadFigure.addEventListener('click', () => { if (state.figure) download('cameo-figure.stl', binarySTL(state.figure.mesh, { header: 'Cameo figure | mm | print lying on its back, relief up' }), 'model/stl'); });
els.downloadPedestal.addEventListener('click', () => { if (state.ped) download('cameo-pedestal.stl', binarySTL(state.ped.mesh, { header: 'Cameo pedestal | mm | print standing' }), 'model/stl'); });

/* ---------- the guide ---------- */

els.guideBtn.addEventListener('click', () => { if (typeof els.guide.showModal === 'function') els.guide.showModal(); else els.guide.setAttribute('open', ''); });
els.guideClose.addEventListener('click', () => els.guide.close());
els.guide.addEventListener('click', e => { if (e.target === els.guide) els.guide.close(); });

setOutputs();
