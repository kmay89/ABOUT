/**
 * Tuck — the page. The numbers of a box go to a worker, which returns the
 * flat sheet and the name's inlay; the page shows the box folding in 3D,
 * reads out whether it prints and fits, and writes the files.
 */
import { DEFAULTS, HINGES, WINDOWS, planBox, resolve } from './plan.js';
import { dielineSVG } from './dieline.js';
import { threeMF, PRINTERS, binarySTL, TUCK_APP } from './export.js';
import { INLAYS } from '../knurl/textures.js';
import { BoxPreview } from './preview.js';

const $ = id => document.getElementById(id);
const ids = ['printerSelect', 'printerSelect2', 'bedField', 'bedSelect', 'guideBtn', 'guide', 'guideClose', 'stageLabel', 'flatBtn', 'viewTopBtn', 'viewBelowBtn', 'resetViewBtn', 'viewer', 'viewerFallback', 'viewerStatus', 'foldRange', 'readGrid', 'readNote',
  'sizeChips', 'widthInput', 'depthInput', 'heightInput', 'thicknessInput', 'cornerInput', 'windowSelect', 'windowFields', 'windowSizeInput', 'lidToggle', 'notchToggle',
  'hingeChips', 'hingeBlurb', 'grooveInput', 'residualInput', 'fitInput', 'flapInput', 'tongueInput',
  'nameInput', 'fontSelect', 'layersInput', 'inlayColour', 'whereChips', 'patternChips', 'patternFields', 'patternPeriodInput', 'patternWeightInput', 'inlayStatus',
  'bodyColour', 'totalsLine', 'warnings', 'download3mf', 'downloadStl', 'downloadSvg', 'profileNote', 'shareBtn', 'toast'];
const els = Object.fromEntries(ids.map(id => [id, $(id)]));
const BED_TYPES = [['Textured PEI Plate', 'Textured PEI plate'], ['Cool Plate', 'Cool plate (smooth PEI)'], ['Supertack Plate', 'Cool Plate SuperTack'], ['High Temp Plate', 'High temperature plate'], ['Engineering Plate', 'Engineering plate']];
const SIZES = [
  { id: 'ring', name: 'Ring box', w: 50, d: 50, h: 35 }, { id: 'gift', name: 'Gift', w: 80, d: 60, h: 40 }, { id: 'cards', name: 'Deck of cards', w: 66, d: 92, h: 22 },
  { id: 'cables', name: 'Cables', w: 110, d: 80, h: 45 }, { id: 'tall', name: 'Tall', w: 60, d: 60, h: 80 }, { id: 'shallow', name: 'Shallow tray', w: 120, d: 90, h: 20 },
];
const WHERES = [{ id: 'lid', name: 'On the lid' }, { id: 'front', name: 'On the front' }, { id: 'both', name: 'Both' }, { id: 'none', name: 'No name' }];
const PATTERNS = INLAYS.filter(p => p.f).slice(0, 14);

const state = { hinge: 'petg', where: 'lid', pattern: 'none', printerId: PRINTERS[0].id, bed: BED_TYPES[0][0], sheet: null, inlay: null, inlayInfo: null, plan: null, info: null, busy: 0, flat: false };

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
const slug = () => (els.nameInput.value.trim() || 'box').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'box';

/* ---------- the worker ---------- */
const worker = new Worker('./worker.js', { type: 'module' });
let nextId = 1; const pending = new Map();
worker.onmessage = e => { const r = pending.get(e.data.id); if (!r) return; pending.delete(e.data.id); e.data.error ? r.reject(new Error(e.data.error)) : r.resolve(e.data); };
worker.onerror = e => { for (const r of pending.values()) r.reject(new Error(e.message || 'The worker failed.')); pending.clear(); };
const ask = (kind, options) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); worker.postMessage({ id, kind, options }); });

/* ---------- options ---------- */
function boxOptions() {
  return {
    width: num(els.widthInput, 80), depth: num(els.depthInput, 60), height: num(els.heightInput, 40), thickness: num(els.thicknessInput, 1.2),
    hinge: state.hinge, groove: num(els.grooveInput, null), residual: num(els.residualInput, null), lid: els.lidToggle.checked, notch: els.notchToggle.checked,
    corner: num(els.cornerInput, 3), fit: num(els.fitInput, 0.2), flap: num(els.flapInput, 10), tongueLength: num(els.thicknessInput, 1.2) + num(els.tongueInput, 2),
    window: els.windowSelect.value, windowSize: num(els.windowSizeInput, 24),
  };
}

/* ---------- controls ---------- */
for (const s of SIZES) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = s.id; b.innerHTML = `<span>${s.name}</span><small>${s.w} × ${s.d} × ${s.h}</small>`;
  b.addEventListener('click', () => { els.widthInput.value = s.w; els.depthInput.value = s.d; els.heightInput.value = s.h; setPressed(els.sizeChips, s.id); scheduleBuild(); });
  els.sizeChips.append(b);
}
for (const w of WINDOWS) { const o = document.createElement('option'); o.value = w.id; o.textContent = w.name; els.windowSelect.append(o); }
function renderHingeChips() {
  els.hingeChips.innerHTML = '';
  for (const h of HINGES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = h.id; b.textContent = h.name;
    b.setAttribute('aria-pressed', String(h.id === state.hinge));
    b.addEventListener('click', () => selectHinge(h.id));
    els.hingeChips.append(b);
  }
}
function selectHinge(id, { quiet = false } = {}) {
  const h = HINGES.find(x => x.id === id) || HINGES[1];
  state.hinge = h.id; setPressed(els.hingeChips, h.id); els.hingeBlurb.textContent = h.blurb;
  els.grooveInput.value = h.groove; els.residualInput.value = h.residual;
  if (!quiet) scheduleBuild();
}
function renderWhereChips() {
  els.whereChips.innerHTML = '';
  for (const w of WHERES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = w.id; b.textContent = w.name;
    b.setAttribute('aria-pressed', String(w.id === state.where));
    b.addEventListener('click', () => { state.where = w.id; setPressed(els.whereChips, w.id); scheduleInlay(); updateFoldName(); });
    els.whereChips.append(b);
  }
}
function renderPatternChips() {
  els.patternChips.innerHTML = '';
  for (const p of [{ id: 'none', name: 'None' }, ...PATTERNS]) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.id = p.id; b.textContent = p.name;
    b.setAttribute('aria-pressed', String(p.id === state.pattern));
    b.addEventListener('click', () => { state.pattern = p.id; setPressed(els.patternChips, p.id); els.patternFields.hidden = p.id === 'none'; scheduleInlay(); });
    els.patternChips.append(b);
  }
}
for (const el of [els.widthInput, els.depthInput, els.heightInput, els.thicknessInput, els.cornerInput, els.windowSizeInput, els.grooveInput, els.residualInput, els.fitInput, els.flapInput, els.tongueInput]) el.addEventListener('input', () => { setPressed(els.sizeChips, null); scheduleBuild(); });
for (const el of [els.windowSelect, els.lidToggle, els.notchToggle]) el.addEventListener('change', () => { els.windowFields.hidden = els.windowSelect.value === 'none'; scheduleBuild(); });
els.nameInput.addEventListener('input', () => { scheduleInlay(); updateFoldName(); });
els.fontSelect.addEventListener('change', () => { scheduleInlay(); updateFoldName(); });
for (const el of [els.layersInput, els.patternPeriodInput, els.patternWeightInput]) el.addEventListener('input', scheduleInlay);
els.inlayColour.addEventListener('input', () => { preview?.setColours(els.bodyColour.value, els.inlayColour.value); updateFoldName(); setOutputs(); });
els.bodyColour.addEventListener('input', () => { preview?.setColours(els.bodyColour.value, els.inlayColour.value); updateFoldName(); setOutputs(); });

/* ---------- the name as a raster ---------- */
const FONT = () => els.fontSelect.value;
function textRaster(text) {
  if (!text.trim()) return null;
  const c = document.createElement('canvas'); const ctx = c.getContext('2d'); if (!ctx) return null;
  const size = 120; ctx.font = FONT().replace(/\d+px/, `${size}px`);
  const width = Math.ceil(ctx.measureText(text).width) + 8, height = Math.ceil(size * 1.25);
  c.width = width; c.height = height;
  ctx.font = FONT().replace(/\d+px/, `${size}px`); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000'; ctx.textBaseline = 'middle'; ctx.fillText(text, 4, height / 2);
  const d = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = d[i * 4] < 128 ? 1 : 0;
  // rows bottom-up (the sheet's +y): flip the canvas rows
  const flipped = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) flipped.set(data.subarray(y * width, (y + 1) * width), (height - 1 - y) * width);
  return { data: flipped, width, height };
}

/* ---------- building ---------- */
let preview = null;
try { preview = new BoxPreview(els.viewer, { onFailure: () => { els.viewerFallback.hidden = false; } }); if (preview.failed) preview = null; } catch { els.viewerFallback.hidden = false; }
els.resetViewBtn.addEventListener('click', () => preview?.resetView('front'));
els.viewTopBtn.addEventListener('click', () => preview?.resetView('top'));
els.viewBelowBtn.addEventListener('click', () => preview?.resetView('below'));
els.flatBtn.addEventListener('click', () => { state.flat = !state.flat; els.flatBtn.setAttribute('aria-pressed', String(state.flat)); preview?.setMode(state.flat ? 'flat' : 'folding'); els.foldRange.disabled = state.flat; if (preview) preview.resetView(state.flat ? 'top' : 'front'); });
els.foldRange.addEventListener('input', () => preview?.setFold(num(els.foldRange, 100) / 100));

let buildTimer = 0, inlayTimer = 0, buildSeq = 0, inlaySeq = 0;
function scheduleBuild() { clearTimeout(buildTimer); buildTimer = setTimeout(build, 180); }
function scheduleInlay() { clearTimeout(inlayTimer); inlayTimer = setTimeout(buildInlay, 220); }
function busy(on, what = '') {
  state.busy += on ? 1 : -1; if (state.busy < 0) state.busy = 0;
  if (state.busy) els.viewerStatus.innerHTML = `<span class="status-dot"></span>${what}…`;
  else if (state.sheet) els.viewerStatus.innerHTML = `<span class="status-dot"></span>${(state.sheet.indices.length / 3).toLocaleString()} triangles · sheet ${state.info.size.map(v => v.toFixed(0)).join(' × ')} mm`;
}
async function build() {
  const seq = ++buildSeq, options = boxOptions();
  busy(true, 'Laying out the sheet');
  try {
    state.plan = planBox(options);
    if (preview) { preview.showFolding(state.plan, { name: state.where === 'lid' || state.where === 'both' ? els.nameInput.value.trim() : '', font: FONT(), inlayColour: els.inlayColour.value }); }
    const r = await ask('sheet', options);
    if (seq !== buildSeq) return;
    state.sheet = r.mesh; state.info = r;
    if (preview) preview.showFlat(state.sheet, state.inlay);
    els.stageLabel.textContent = `${options.width} × ${options.depth} × ${options.height} mm inside · sheet ${r.size.map(v => v.toFixed(0)).join(' × ')} mm`;
    setOutputs(); rememberSettings();
    buildInlay();
  } catch (err) { toast(err.message); }
  finally { if (seq === buildSeq) busy(false); }
}
async function buildInlay() {
  if (!state.plan) return;
  const seq = ++inlaySeq;
  const text = els.nameInput.value.trim();
  const where = state.where === 'both' ? ['lid', 'front'] : state.where === 'none' ? [] : [state.where];
  const places = where.filter(w => w !== 'lid' || state.plan.lid);
  const raster = text && places.length ? textRaster(text) : null;
  if (!raster && state.pattern === 'none') { state.inlay = null; state.inlayInfo = null; if (preview && state.sheet) preview.showFlat(state.sheet, null); els.inlayStatus.textContent = text || state.pattern !== 'none' ? '' : 'Type a name, or pick a pattern.'; setOutputs(); return; }
  busy(true, 'Setting the name');
  try {
    const r = await ask('inlay', { box: boxOptions(), raster, where: places, pattern: state.pattern, patternPeriod: num(els.patternPeriodInput, 8), patternWeight: num(els.patternWeightInput, 0.35), layers: Math.max(1, Math.round(num(els.layersInput, 2))) });
    if (seq !== inlaySeq) return;
    state.inlay = r.mesh; state.inlayInfo = r;
    els.inlayStatus.textContent = r.count ? `${r.area.toFixed(0)} mm² in the second colour, ${r.height} mm tall, about ${r.grams.toFixed(1)} g.` : 'Nothing landed on the sheet — a shorter name, or the other panel.';
    if (preview && state.sheet) preview.showFlat(state.sheet, state.inlay);
    setOutputs(); rememberSettings();
  } catch (err) { toast(err.message); }
  finally { if (seq === inlaySeq) busy(false); }
}
function updateFoldName() { if (preview && state.plan) preview.showFolding(state.plan, { name: state.where === 'lid' || state.where === 'both' ? els.nameInput.value.trim() : '', font: FONT(), inlayColour: els.inlayColour.value }); }

/* ---------- outputs ---------- */
function setOutputs() {
  const pr = printer(); els.bedField.hidden = !pr.presets;
  const info = state.info; if (!info || !state.plan) { els.readGrid.innerHTML = ''; els.totalsLine.textContent = ''; return; }
  const p = state.plan.p;
  const [sw, sd] = info.size, bed = pr.bed;
  const fits = (sw <= bed[0] - 4 && sd <= bed[1] - 4) || (sd <= bed[0] - 4 && sw <= bed[1] - 4);
  const rotated = !(sw <= bed[0] - 4 && sd <= bed[1] - 4) && fits;
  const hingeLayers = Math.round(p.hr / 0.2);
  const tongue = p.tw;
  els.readGrid.innerHTML = `
    <div class="read ${fits ? 'good' : 'bad'}"><small>Flat sheet</small><strong>${sw.toFixed(0)} × ${sd.toFixed(0)} mm</strong></div>
    <div class="read ${hingeLayers >= 2 && hingeLayers <= 4 ? 'good' : 'warn'}"><small>Hinge</small><strong>${p.hr.toFixed(1)} mm · ${hingeLayers} layer${hingeLayers === 1 ? '' : 's'}</strong></div>
    <div class="read ${tongue >= 8 ? 'good' : tongue >= 5 ? 'warn' : 'bad'}"><small>Lock tongues</small><strong>${tongue.toFixed(0)} mm wide</strong></div>
    <div class="read"><small>Sheet</small><strong>${p.t.toFixed(1)} mm · ${Math.round(p.t / 0.2)} layers</strong></div>`;
  const notes = [];
  notes.push(fits ? (rotated ? `Fits the ${pr.short}'s plate turned 90°: Bambu Studio will ask to place it; rotate the object or let it.` : `Fits the ${pr.short}'s plate as placed.`) : `Too big for the ${pr.short}'s ${bed[0]} × ${bed[1]} mm plate: a smaller box, or print the lid-less tray and a separate lid.`);
  notes.push(p.hingeName === 'PLA' ? 'PLA hinges take a handful of folds: fold once, slowly, and leave it folded.' : p.hingeName === 'TPU / flex' ? 'TPU folds forever and the walls stay a little soft; print slow.' : 'PETG hinges take hundreds of folds.');
  if (info.warnings.length) notes.push(...info.warnings);
  els.readNote.textContent = notes.join(' ');
  const grams = info.volume * 1.24 / 1000 + (state.inlayInfo ? state.inlayInfo.grams : 0);
  const mins = info.volume / (0.42 * 0.2) / 120 / 60 + 4;
  els.totalsLine.innerHTML = `Inside <strong>${p.W} × ${p.D} × ${p.H} mm</strong>; the sheet is <strong>${sw.toFixed(0)} × ${sd.toFixed(0)} × ${p.t} mm</strong>, about <strong>${Math.round(grams)} g</strong> and <strong>${minutes(mins)}</strong>, roughly — the slicer knows better.${state.inlayInfo && state.inlayInfo.count ? ` The name adds ${state.inlayInfo.grams.toFixed(1)} g in the second colour.` : ''}`;
  els.warnings.innerHTML = fits ? '' : `<p class="warning">The flat sheet (${sw.toFixed(0)} × ${sd.toFixed(0)} mm) does not fit this plate.</p>`;
  els.profileNote.innerHTML = pr.presets
    ? `<strong>Opens as a project with no warning.</strong> The file names the ${pr.short}’s own presets and the ${BED_TYPES.find(b => b[0] === state.bed)[1].toLowerCase()}${state.inlay && state.inlayInfo?.count ? ', with two filaments in your two colours; the name is on filament 2' : ''}. Print as placed, no supports.`
    : `<strong>Open it as a project</strong> (File › Open Project). ${state.inlay && state.inlayInfo?.count ? 'Set the name part to your second filament.' : ''} Print as placed, no supports.`;
}
for (const sel of [els.printerSelect, els.printerSelect2]) {
  for (const p of PRINTERS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.append(o); }
  sel.value = state.printerId;
  sel.addEventListener('change', () => { state.printerId = sel.value; els.printerSelect.value = els.printerSelect2.value = sel.value; try { localStorage.setItem('tuck.printer', sel.value); } catch { /* fine */ } setOutputs(); });
}
for (const [id, name] of BED_TYPES) { const o = document.createElement('option'); o.value = id; o.textContent = name; els.bedSelect.append(o); }
els.bedSelect.addEventListener('change', () => { state.bed = els.bedSelect.value; setOutputs(); });

els.download3mf.addEventListener('click', async () => {
  if (!state.sheet || els.download3mf.disabled) return;
  els.download3mf.disabled = true;
  try {
    const parts = [{ name: 'Box sheet', mesh: state.sheet, extruder: 1 }];
    const hasInlay = state.inlay && state.inlayInfo?.count;
    if (hasInlay) parts.push({ name: 'Name on the first layer', mesh: state.inlay, extruder: 2 });
    const colours = hasInlay ? [els.bodyColour.value.toUpperCase(), els.inlayColour.value.toUpperCase()] : [els.bodyColour.value.toUpperCase()];
    download(`tuck-${slug()}.3mf`, await threeMF(parts, { printer: printer(), plate: state.bed, colours, title: `Tuck box — ${els.nameInput.value.trim() || 'box'}`, app: TUCK_APP }), 'model/3mf');
    toast(printer().presets ? 'Open it as a project in Bambu Studio; print as placed; fold.' : 'Open it as a project in your slicer; print as placed; fold.');
  } finally { els.download3mf.disabled = false; }
});
els.downloadStl.addEventListener('click', () => { if (state.sheet) download(`tuck-${slug()}.stl`, binarySTL(state.sheet, 'Tuck fold-up box sheet | mm | Z up | print as placed'), 'model/stl'); });
els.downloadSvg.addEventListener('click', () => { if (state.plan) download(`tuck-${slug()}-dieline.svg`, dielineSVG(state.plan, { title: `Tuck box ${els.nameInput.value.trim()}` }), 'image/svg+xml'); });

/* ---------- settings in the link ---------- */
function rememberSettings() {
  try {
    const q = new URLSearchParams();
    const o = boxOptions();
    for (const [k, v] of Object.entries(o)) if (v != null && v !== '' && typeof v !== 'object') q.set(k, String(v));
    q.set('name', els.nameInput.value); q.set('where', state.where); q.set('pattern', state.pattern); q.set('font', String(els.fontSelect.selectedIndex)); q.set('body', els.bodyColour.value); q.set('ink', els.inlayColour.value);
    history.replaceState(null, '', '#' + q.toString());
  } catch { /* fine */ }
}
function applySettings(fragment) {
  const q = new URLSearchParams(String(fragment || '').replace(/^#/, '')); if (![...q.keys()].length) return false;
  const setNum = (el, k, lo, hi) => { if (q.has(k)) { const v = Number(q.get(k)); if (Number.isFinite(v)) el.value = Math.min(hi, Math.max(lo, v)); } };
  setNum(els.widthInput, 'width', 20, 240); setNum(els.depthInput, 'depth', 20, 240); setNum(els.heightInput, 'height', 10, 150); setNum(els.thicknessInput, 'thickness', 0.8, 2.4);
  setNum(els.cornerInput, 'corner', 0, 6); setNum(els.windowSizeInput, 'windowSize', 8, 120); setNum(els.fitInput, 'fit', 0, 0.6); setNum(els.flapInput, 'flap', 6, 30);
  if (q.has('hinge') && HINGES.some(h => h.id === q.get('hinge'))) selectHinge(q.get('hinge'), { quiet: true });
  setNum(els.grooveInput, 'groove', 0.8, 4); setNum(els.residualInput, 'residual', 0.2, 1.2);
  if (q.has('tongueLength')) { const v = Number(q.get('tongueLength')) - num(els.thicknessInput, 1.2); if (Number.isFinite(v)) els.tongueInput.value = Math.min(6, Math.max(0.5, v)); }
  if (q.has('lid')) els.lidToggle.checked = q.get('lid') !== 'false'; if (q.has('notch')) els.notchToggle.checked = q.get('notch') !== 'false';
  if (q.has('window') && WINDOWS.some(w => w.id === q.get('window'))) els.windowSelect.value = q.get('window');
  if (q.has('name')) els.nameInput.value = q.get('name').slice(0, 30);
  if (q.has('where') && WHERES.some(w => w.id === q.get('where'))) state.where = q.get('where');
  if (q.has('pattern') && (q.get('pattern') === 'none' || PATTERNS.some(p => p.id === q.get('pattern')))) state.pattern = q.get('pattern');
  if (q.has('font')) { const i = Number(q.get('font')); if (i >= 0 && i < els.fontSelect.options.length) els.fontSelect.selectedIndex = i; }
  for (const [k, el] of [['body', els.bodyColour], ['ink', els.inlayColour]]) if (/^#[0-9a-f]{6}$/i.test(q.get(k) || '')) el.value = q.get(k);
  return true;
}
els.shareBtn.addEventListener('click', async () => { rememberSettings(); try { await navigator.clipboard.writeText(location.href); toast('Link copied: it opens Tuck with this box.'); } catch { prompt('Copy this link:', location.href); } });

els.guideBtn.addEventListener('click', () => { if (typeof els.guide.showModal === 'function') els.guide.showModal(); else els.guide.setAttribute('open', ''); });
els.guideClose.addEventListener('click', () => els.guide.close());
els.guide.addEventListener('click', e => { if (e.target === els.guide) els.guide.close(); });

/* ---------- go ---------- */
renderHingeChips(); renderWhereChips(); renderPatternChips();
selectHinge(state.hinge, { quiet: true });
for (const sel of [els.printerSelect, els.printerSelect2]) { let saved = null; try { saved = localStorage.getItem('tuck.printer'); } catch { /* fine */ } if (saved && PRINTERS.some(p => p.id === saved)) { state.printerId = saved; sel.value = saved; } }
if (applySettings(location.hash)) { setPressed(els.whereChips, state.where); setPressed(els.patternChips, state.pattern); els.patternFields.hidden = state.pattern === 'none'; }
els.windowFields.hidden = els.windowSelect.value === 'none';
setPressed(els.sizeChips, 'gift');
preview?.setColours(els.bodyColour.value, els.inlayColour.value);
build();
