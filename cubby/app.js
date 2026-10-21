/**
 * Cubby — the page. State lives in one design object (layout.js); every
 * change goes through update(), which rebuilds the parts, the plan, the
 * preview and the numbers, and saves the design to this browser. Nothing
 * leaves the device: files are made here and handed to the browser to save.
 */
import {
  newDesign, restoreDesign, grid, binRect, partsList, packPlates, fillEmpty, placeBin, trimToGrid, applyRecipe,
  RECIPES, SPACES, PRINTERS, FILAMENTS, SETTINGS_DEFAULTS, SETTINGS_LIMITS, clampSetting, binHeights, maxCount,
  suggestedCount, fmt, MIN_CELL, binInside, insideFor, itemFitsBin, splitToFit, plateFit, plateTotals, occupancy,
  PROFILES, profileOf, applyProfile,
} from './layout.js';
import { ITEMS, ITEM_BY_ID, cellsFor, arrange, fit as itemFit } from './items.js';
import { threeMF, bundle, partSTL, partFileName, zipStore } from './export.js';
import { DrawerPreview } from './preview.js';
import * as sound from './sound.js';

const $ = id => document.getElementById(id);
const STORAGE = 'cubby.design.v1';
const el = {
  printer: $('printerSelect'), printer2: $('printerSelect2'), filament: $('filamentSelect'),
  guideBtn: $('guideBtn'), guide: $('guide'), guideClose: $('guideClose'),
  planSvg: $('planSvg'), planStats: $('planStats'), planHint: $('planHint'),
  undoBtn: $('undoBtn'), fillBtn: $('fillBtn'), clearBtn: $('clearBtn'),
  viewer: $('viewer'), viewerFallback: $('viewerFallback'), viewerStatus: $('viewerStatus'), resetViewBtn: $('resetViewBtn'),
  spaceChips: $('spaceChips'), spaceBlurb: $('spaceBlurb'),
  width: $('widthInput'), depth: $('depthInput'), height: $('heightInput'), unitMm: $('unitMm'), unitIn: $('unitIn'),
  recipe: $('recipeSelect'), recipeBlurb: $('recipeBlurb'),
  colsMinus: $('colsMinus'), colsPlus: $('colsPlus'), colsValue: $('colsValue'), colsNote: $('colsNote'),
  rowsMinus: $('rowsMinus'), rowsPlus: $('rowsPlus'), rowsValue: $('rowsValue'), rowsNote: $('rowsNote'),
  binEmpty: $('binEmpty'), binForm: $('binForm'), binTitle: $('binTitle'), binSize: $('binSize'),
  cxMinus: $('cxMinus'), cxPlus: $('cxPlus'), cxValue: $('cxValue'), cyMinus: $('cyMinus'), cyPlus: $('cyPlus'), cyValue: $('cyValue'),
  heightFull: $('heightFull'), heightLow: $('heightLow'), heightNote: $('heightNote'), scoop: $('scoopToggle'),
  splitBtn: $('splitBtn'), deleteBtn: $('deleteBtn'),
  parts: $('partsList'), totals: $('totalsLine'), warnings: $('warnings'),
  download3mf: $('download3mf'), downloadZip: $('downloadZip'), copyLink: $('copyLinkBtn'), save: $('saveBtn'), open: $('openInput'),
  wall: $('wallInput'), floor: $('floorInput'), radius: $('radiusInput'), divider: $('dividerInput'),
  clearance: $('clearanceInput'), gap: $('gapInput'), rimGap: $('rimGapInput'), clips: $('clipsToggle'), clipFit: $('clipFitSelect'),
  resetSettings: $('resetSettingsBtn'), toast: $('toast'), settingsDetails: $('settingsDetails'), soundBtn: $('soundBtn'),
  edge: $('edgeInput'), chamfer: $('chamferInput'), joint: $('jointSelect'), channelsWhere: $('channelsSelect'),
  finishChips: $('finishChips'), finishBlurb: $('finishBlurb'), finishCustom: $('finishCustom'),
  itemSpace: $('itemSpace'), itemSpace2: $('itemSpace2'), binItems: $('binItems'), itemsNote: $('itemsNote'),
  sizeItems: $('sizeItems'), sizeNote: $('sizeNote'), plateList: $('plateList'), platesSummary: $('platesSummary'),
};

const state = {
  design: null, selected: null, undo: [], units: 'mm', list: null, packing: null, previewTimer: 0,
  itemSpace: null, sizeItem: null,
};

/* ---------- small helpers ---------- */

let toastTimer = 0;
function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2600);
}

function download(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const b64url = {
  encode: str => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  decode: s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)))),
};

function minutes(m) {
  if (m < 60) return `${Math.round(m)} min`;
  return `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`;
}

function pushUndo() {
  state.undo.push(JSON.stringify(state.design));
  if (state.undo.length > 60) state.undo.shift();
  el.undoBtn.disabled = false;
}

function printer() { return PRINTERS.find(p => p.id === state.design.settings.printer) || PRINTERS[0]; }

/* ---------- boot ---------- */

function loadDesign() {
  const fromHash = location.hash.match(/^#d=([A-Za-z0-9_-]+)/);
  if (fromHash) {
    try { return restoreDesign(JSON.parse(b64url.decode(fromHash[1]))); } catch { toast('That link did not hold a design; starting fresh.'); }
  }
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) return restoreDesign(JSON.parse(saved));
  } catch { /* a fresh start */ }
  return newDesign({ width: 400, depth: 400, height: 60, space: 'desk' });
}

function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify(state.design)); } catch { /* private mode */ }
}

const preview = new DrawerPreview(el.viewer, {
  onSelect: id => select(id),
  onFailure: () => { el.viewerFallback.hidden = false; el.viewerStatus.hidden = true; },
});
if (preview.failed) { el.viewerFallback.hidden = false; el.viewerStatus.hidden = true; }

for (const sel of [el.printer, el.printer2]) {
  for (const p of PRINTERS) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = sel === el.printer ? p.short : `${p.name} · ${p.bed[0]} × ${p.bed[1]} × ${p.bed[2]} mm`;
    sel.append(o);
  }
}
for (const [id, f] of Object.entries(FILAMENTS)) {
  const o = document.createElement('option');
  o.value = id; o.textContent = `${f.name} · ${f.density} g/cm³`;
  el.filament.append(o);
}
for (const [id, s] of Object.entries(SPACES)) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.space = id; b.textContent = s.name; b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => setSpace(id));
  el.spaceChips.append(b);
}
for (const [id, p] of Object.entries(PROFILES)) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.profile = id; b.textContent = p.name; b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => {
    if (state.design.settings.profile === id) return;
    pushUndo();
    applyProfile(state.design, id);
    update();
    sound.settle(3);
  });
  el.finishChips.append(b);
}
for (const sel of [el.itemSpace, el.itemSpace2]) {
  for (const [id, s] of Object.entries(SPACES)) {
    if (id === 'other') continue;
    const o = document.createElement('option'); o.value = id; o.textContent = s.name; sel.append(o);
  }
  const all = document.createElement('option'); all.value = 'all'; all.textContent = 'Everything'; sel.append(all);
  sel.addEventListener('change', () => { state.itemSpace = sel.value; renderBinForm(); });
}


/* ---------- the central update ---------- */

function update(reason = '') {
  const d = state.design;
  trimToGrid(d);
  if (state.selected && !d.bins.some(b => b.id === state.selected)) state.selected = null;
  state.list = partsList(d);
  state.packing = packPlates(state.list.parts, printer());
  renderDrawer();
  renderGrid();
  renderBinForm();
  renderPlan();
  renderParts();
  renderSettings();
  save();
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(() => {
    preview.setDesign(d, state.list);
    const unique = state.list.parts.filter(p => p.kind === 'bin').length;
    el.viewerStatus.innerHTML = `<span class="status-dot"></span>${d.bins.length} bin${d.bins.length === 1 ? '' : 's'} · ${unique} unique part${unique === 1 ? '' : 's'}`;
  }, reason === 'boot' ? 0 : 60);
}

function select(id) {
  if (id && id !== state.selected) sound.tick();
  state.selected = id;
  renderBinForm();
  for (const g of el.planSvg.querySelectorAll('.bin-group')) g.classList.toggle('selected', g.dataset.bin === id);
  preview.select(id);
}

/* ---------- drawer card ---------- */

function mmToUnit(mm) { return state.units === 'in' ? Math.round(mm / 25.4 * 100) / 100 : Math.round(mm * 10) / 10; }
function unitToMm(v) { return state.units === 'in' ? v * 25.4 : v; }

function renderDrawer() {
  const d = state.design.drawer;
  for (const b of el.spaceChips.children) b.setAttribute('aria-pressed', String(b.dataset.space === d.space));
  el.spaceBlurb.textContent = SPACES[d.space].blurb;
  for (const [input, key] of [[el.width, 'width'], [el.depth, 'depth'], [el.height, 'height']]) {
    if (document.activeElement !== input) input.value = mmToUnit(d[key]);
    input.step = state.units === 'in' ? '0.05' : '0.5';
  }
  for (const u of document.querySelectorAll('[data-unit]')) u.textContent = state.units;
  el.unitMm.setAttribute('aria-pressed', String(state.units === 'mm'));
  el.unitIn.setAttribute('aria-pressed', String(state.units === 'in'));
  const list = RECIPES[d.space];
  if (el.recipe.dataset.space !== d.space) {
    el.recipe.replaceChildren(...list.map(r => { const o = document.createElement('option'); o.value = r.id; o.textContent = r.name; return o; }));
    el.recipe.dataset.space = d.space;
  }
  el.recipe.value = list.some(r => r.id === state.design.recipe) ? state.design.recipe : '';
  const recipe = list.find(r => r.id === el.recipe.value);
  el.recipeBlurb.textContent = recipe ? recipe.blurb : 'Your own arrangement. Pick a layout above to start again from one.';
  const profile = state.design.settings.profile;
  for (const b of el.finishChips.children) b.setAttribute('aria-pressed', String(b.dataset.profile === profile));
  el.finishCustom.hidden = profile !== 'custom';
  el.finishBlurb.textContent = PROFILES[profile] ? PROFILES[profile].blurb : 'Pick a finish to go back to one of the two, or keep tuning in Fine settings.';
}

function setSpace(space) {
  if (space === state.design.drawer.space) return;
  pushUndo();
  const d = state.design;
  d.drawer.space = space;
  d.cols = suggestedCount(d.drawer.width, d.settings, space);
  d.rows = suggestedCount(d.drawer.depth, d.settings, space);
  applyRecipe(d, RECIPES[space][0].id);
  state.selected = null;
  update();
  sound.settle(d.bins.length);
}

for (const [input, key] of [[el.width, 'width'], [el.depth, 'depth'], [el.height, 'height']]) {
  input.addEventListener('change', () => {
    const v = unitToMm(parseFloat(input.value));
    if (!Number.isFinite(v)) { renderDrawer(); return; }
    pushUndo();
    const d = state.design;
    d.drawer[key] = v;
    d.drawer = { ...d.drawer, ...restoreDesign({ drawer: d.drawer }).drawer };
    if (key !== 'height') {
      // Keep the cell size the user had, within reason, by re-suggesting the count.
      const len = d.drawer[key], which = key === 'width' ? 'cols' : 'rows';
      d[which] = Math.max(1, Math.min(maxCount(len, d.settings), d[which]));
    }
    update();
  });
}
el.unitMm.addEventListener('click', () => { state.units = 'mm'; renderDrawer(); });
el.unitIn.addEventListener('click', () => { state.units = 'in'; renderDrawer(); });
el.recipe.addEventListener('change', () => {
  if (!el.recipe.value) return;
  pushUndo();
  applyRecipe(state.design, el.recipe.value);
  state.selected = null;
  update();
  sound.settle(state.design.bins.length);
});

/* ---------- grid card ---------- */

function renderGrid() {
  const d = state.design, g = grid(d);
  el.colsValue.value = g.cols; el.rowsValue.value = g.rows;
  const maxC = maxCount(d.drawer.width, d.settings), maxR = maxCount(d.drawer.depth, d.settings);
  el.colsMinus.disabled = g.cols <= 1; el.colsPlus.disabled = g.cols >= maxC;
  el.rowsMinus.disabled = g.rows <= 1; el.rowsPlus.disabled = g.rows >= maxR;
  el.colsNote.textContent = `cells ${fmt(g.cellW)} mm wide${g.cols >= maxC ? ` · ${MIN_CELL} mm is the smallest` : ''}`;
  el.rowsNote.textContent = `cells ${fmt(g.cellD)} mm deep${g.rows >= maxR ? ` · ${MIN_CELL} mm is the smallest` : ''}`;
}

function stepGrid(which, delta) {
  pushUndo();
  const d = state.design;
  d[which] = Math.max(1, d[which] + delta);
  update();
  sound.toggle();
}
el.colsMinus.addEventListener('click', () => stepGrid('cols', -1));
el.colsPlus.addEventListener('click', () => stepGrid('cols', 1));
el.rowsMinus.addEventListener('click', () => stepGrid('rows', -1));
el.rowsPlus.addEventListener('click', () => stepGrid('rows', 1));

/* ---------- bin card ---------- */

function selectedBin() { return state.design.bins.find(b => b.id === state.selected) || null; }

function renderBinForm() {
  const bin = selectedBin();
  el.binEmpty.hidden = !!bin;
  el.binForm.hidden = !bin;
  if (!bin) { renderSizeItems(); return; }
  const part = state.list?.parts.find(p => p.bins.includes(bin.id));
  el.binTitle.textContent = part ? part.title : 'Bin';
  el.binSize.textContent = part ? `${part.size}${part.error ? ' — ' + part.error : ''}` : '';
  el.cxValue.value = bin.cx; el.cyValue.value = bin.cy;
  el.cxMinus.disabled = bin.cx <= 1; el.cyMinus.disabled = bin.cy <= 1;
  el.heightFull.setAttribute('aria-pressed', String(!bin.low));
  el.heightLow.setAttribute('aria-pressed', String(!!bin.low));
  const h = binHeights(state.design);
  el.heightNote.textContent = `${fmt(h.full)} mm, or ${fmt(h.low)} mm low`;
  el.scoop.checked = !!bin.scoop;
  el.splitBtn.disabled = bin.w * bin.h <= 1;
  renderItems(bin);
}

/* ---------- things that go in it ---------- */

function itemSpace() {
  const d = state.design.drawer.space;
  return state.itemSpace || (d === 'other' ? 'all' : d);
}
function itemsFor(space) {
  return space === 'all' ? ITEMS : ITEMS.filter(i => i.spaces.includes(space));
}
function fitWords(f, item) {
  if (!f) return 'does not fit';
  const how = f.how === 'flat' ? (f.angle ? 'fits, turned across' : 'fits flat') : `fits on the diagonal (${f.angle}°)`;
  return f.tall ? `${how}, standing ${fmt(item.h)} mm tall above the rim` : how;
}

/** Chips for the selected bin: each coloured by whether the thing fits. */
function renderItems(bin) {
  const space = itemSpace();
  el.itemSpace.value = space;
  const g = grid(state.design);
  el.binItems.replaceChildren(...itemsFor(space).map(item => {
    const f = itemFitsBin(state.design, bin, item, g);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = !f ? 'miss' : f.how === 'flat' && !f.tall ? 'fits' : f.how === 'diagonal' ? 'diagonal' : 'tall';
    b.setAttribute('aria-pressed', String((bin.items || []).includes(item.id)));
    b.innerHTML = `<span class="mark" aria-hidden="true">${!f ? '×' : f.how === 'flat' && !f.tall ? '✓' : '◇'}</span>${item.name}`;
    b.title = `${item.name}: ${item.l} × ${item.w} × ${item.h} mm${item.note ? ' — ' + item.note : ''}. ${fitWords(f, item)}.`;
    b.addEventListener('click', () => {
      const bin = selectedBin();
      if (!bin) return;
      pushUndo();
      bin.items = bin.items || [];
      bin.items = bin.items.includes(item.id) ? bin.items.filter(i => i !== item.id) : [...bin.items, item.id].slice(0, 12);
      update();
      noteFor(item, f);
    });
    b.addEventListener('mouseenter', () => noteFor(item, f));
    b.addEventListener('focus', () => noteFor(item, f));
    return b;
  }));
  const named = (bin.items || []).map(id => ITEM_BY_ID[id]?.name).filter(Boolean);
  el.itemsNote.innerHTML = named.length ? `For: <strong>${named.join(', ')}</strong>. Hover a thing to see how it fits.` : 'Hover a thing to see how it fits; press it to note what this bin is for.';
  function noteFor(item, f) {
    let text = `<strong>${item.name}</strong>, ${item.l} × ${item.w} × ${item.h} mm${item.note ? ` (${item.note})` : ''}: ${fitWords(f, item)}.`;
    if (!f || f.how !== 'flat') {
      const need = cellsFor(item, g.cols, g.rows, (w, h) => insideFor(state.design, w, h, g), state.design.settings.rimGap);
      text += need ? ` Flat, it needs a ${need.w}×${need.h} bin.` : ' No bin on this grid takes it flat.';
    }
    el.itemsNote.innerHTML = text;
  }
}

/** With nothing selected: pick a thing, see the smallest bin for it, add one. */
function renderSizeItems() {
  const space = itemSpace();
  el.itemSpace2.value = space;
  el.sizeItems.replaceChildren(...itemsFor(space).map(item => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(state.sizeItem === item.id));
    b.innerHTML = `<span class="mark" aria-hidden="true">${item.l}</span>${item.name}`;
    b.title = `${item.name}: ${item.l} × ${item.w} × ${item.h} mm${item.note ? ' — ' + item.note : ''}`;
    b.addEventListener('click', () => { state.sizeItem = state.sizeItem === item.id ? null : item.id; renderSizeItems(); });
    return b;
  }));
  const item = ITEM_BY_ID[state.sizeItem];
  if (!item) { el.sizeNote.textContent = 'Typical sizes; the fit leaves 2 mm of room. Pens and cutlery want a lane as deep as the drawer.'; return; }
  const g = grid(state.design);
  const need = cellsFor(item, g.cols, g.rows, (w, h) => insideFor(state.design, w, h, g), state.design.settings.rimGap);
  if (!need) {
    const anyRow = itemFit(insideFor(state.design, g.cols, g.rows, g), item, state.design.settings.rimGap);
    el.sizeNote.innerHTML = `<strong>${item.name}</strong> is ${item.l} × ${item.w} × ${item.h} mm${item.note ? ` (${item.note})` : ''}. ${anyRow ? 'It only fits this drawer on the diagonal.' : 'It does not fit this drawer flat; it may be too tall or too long.'}`;
    return;
  }
  const inside = insideFor(state.design, need.w, need.h, g);
  el.sizeNote.innerHTML = `<strong>${item.name}</strong> is ${item.l} × ${item.w} × ${item.h} mm${item.note ? ` (${item.note})` : ''}. The smallest bin that takes it flat is <strong>${need.w}×${need.h}</strong> (${fmt(inside.w)} × ${fmt(inside.d)} mm inside).`;
  const add = document.createElement('button');
  add.type = 'button'; add.textContent = `Add a ${need.w}×${need.h} bin`;
  add.addEventListener('click', () => {
    const occ = occupancy(state.design);
    const free = (c, r) => c < occ.cols && r < occ.rows && !occ.cells[r * occ.cols + c];
    let spot = null;
    for (const [w, h] of [[need.w, need.h], [need.h, need.w]]) {
      for (let r = 0; r < occ.rows && !spot; r++) for (let c = 0; c < occ.cols && !spot; c++) {
        let ok = true;
        for (let rr = r; rr < r + h && ok; rr++) for (let cc = c; cc < c + w && ok; cc++) if (!free(cc, rr)) ok = false;
        if (ok) spot = { c, r, w, h };
      }
      if (spot) break;
    }
    if (!spot) { toast(`No free ${need.w}×${need.h} space on the plan; remove a bin first, or draw over one.`); sound.nope(); return; }
    pushUndo();
    const bin = placeBin(state.design, spot, { items: [item.id] });
    state.selected = bin?.id || null;
    update();
    sound.place();
    toast(`Added a bin for ${item.name.toLowerCase()}.`);
  });
  el.sizeNote.append(' ', add);
}

function editBin(change) {
  const bin = selectedBin();
  if (!bin) return;
  pushUndo();
  change(bin);
  update();
  sound.toggle();
}
el.cxMinus.addEventListener('click', () => editBin(b => { b.cx = Math.max(1, b.cx - 1); }));
el.cxPlus.addEventListener('click', () => editBin(b => { b.cx = Math.min(12, b.cx + 1); }));
el.cyMinus.addEventListener('click', () => editBin(b => { b.cy = Math.max(1, b.cy - 1); }));
el.cyPlus.addEventListener('click', () => editBin(b => { b.cy = Math.min(12, b.cy + 1); }));
el.heightFull.addEventListener('click', () => editBin(b => { b.low = false; }));
el.heightLow.addEventListener('click', () => editBin(b => { b.low = true; }));
el.scoop.addEventListener('change', () => editBin(b => { b.scoop = el.scoop.checked; }));
el.splitBtn.addEventListener('click', () => {
  const bin = selectedBin();
  if (!bin) return;
  pushUndo();
  const d = state.design;
  d.bins = d.bins.filter(b => b.id !== bin.id);
  for (let r = bin.r; r < bin.r + bin.h; r++) for (let c = bin.c; c < bin.c + bin.w; c++) {
    placeBin(d, { c, r, w: 1, h: 1 }, { cx: 1, cy: 1, low: bin.low, scoop: false, items: [...(bin.items || [])] });
  }
  state.selected = null;
  update();
  sound.settle(bin.w * bin.h);
});
function deleteSelected() {
  const bin = selectedBin();
  if (!bin) return;
  pushUndo();
  state.design.bins = state.design.bins.filter(b => b.id !== bin.id);
  state.selected = null;
  update();
  sound.remove();
}
el.deleteBtn.addEventListener('click', deleteSelected);

/* ---------- the plan ---------- */

const SVG = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

const plan = { pointer: null, ghost: null, cellRects: [] };

function renderPlan() {
  const d = state.design, g = grid(d), { width: W, depth: D } = d.drawer;
  const M = 16, below = 14, dimGap = Math.max(8, Math.min(14, W * 0.03));
  const s = el.planSvg;
  s.setAttribute('viewBox', `${-M} ${-M - dimGap} ${W + 2 * M + dimGap} ${D + 2 * M + below + dimGap}`);
  s.replaceChildren();
  const toY = (y, h = 0) => D - y - h;        // the front of the drawer is at the bottom of the plan
  s.append(svg('rect', { class: 'drawer', x: -1.5, y: -1.5, width: W + 3, height: D + 3, rx: 4 }));
  plan.cellRects = [];
  const cells = svg('g', { class: 'cells' });
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    const x = g.originX + c * g.pitchX, y = g.originY + r * g.pitchY;
    const rect = svg('rect', { class: 'cell', x, y: toY(y, g.cellD), width: g.cellW, height: g.cellD, rx: 1.5, 'data-c': c, 'data-r': r });
    cells.append(rect);
    plan.cellRects.push(rect);
  }
  s.append(cells);
  const bins = svg('g', { class: 'bins' });
  const known = plan.known;
  let freshCount = 0;
  const errored = new Set(state.list.parts.filter(p => p.error).flatMap(p => p.bins));
  const tooBig = new Set(state.packing.tooBig.flatMap(p => p.bins));
  const fontSize = Math.max(5, Math.min(13, Math.min(g.cellW, g.cellD) * 0.24));
  for (const bin of d.bins) {
    const rect = binRect(d, bin, g);
    const fresh = !known || !known.has(bin.id);
    const group = svg('g', { class: `bin-group${bin.id === state.selected ? ' selected' : ''}${fresh ? ' new' : ''}`, 'data-bin': bin.id });
    if (fresh) group.style.animationDelay = `${Math.min(600, freshCount++ * (known ? 30 : 18))}ms`;
    const classes = ['bin', bin.low ? 'low' : '', errored.has(bin.id) || tooBig.has(bin.id) ? 'error' : ''].filter(Boolean).join(' ');
    group.append(svg('rect', { class: classes, x: rect.x, y: toY(rect.y, rect.depth), width: rect.width, height: rect.depth, rx: Math.min(d.settings.radius, 6) }));
    // dividers
    const cx = bin.cx || 1, cy = bin.cy || 1, wall = d.settings.wall;
    for (let i = 1; i < cx; i++) {
      const x = rect.x + wall + (rect.width - 2 * wall) * i / cx;
      group.append(svg('line', { class: 'divider', x1: x, x2: x, y1: toY(rect.y + wall), y2: toY(rect.y + rect.depth - wall) }));
    }
    for (let j = 1; j < cy; j++) {
      const y = rect.y + wall + (rect.depth - 2 * wall) * j / cy;
      group.append(svg('line', { class: 'divider', x1: rect.x + wall, x2: rect.x + rect.width - wall, y1: toY(y), y2: toY(y) }));
    }
    if (bin.scoop) {
      const sw = rect.width * 0.6, x0 = rect.x + rect.width / 2 - sw / 2, yf = toY(rect.y);
      group.append(svg('path', { class: 'scoop-mark', d: `M ${x0} ${yf} Q ${rect.x + rect.width / 2} ${yf - Math.min(8, rect.depth * 0.25)} ${x0 + sw} ${yf}` }));
    }
    // what goes in it, drawn to size in the first compartment
    const items = (bin.items || []).filter(id => ITEM_BY_ID[id]);
    if (items.length) {
      const inside = binInside(d, bin, g);
      const x0 = rect.x + wall, y0 = rect.y + wall;
      for (const p of arrange(inside, items, d.settings.rimGap)) {
        const px = x0 + p.x, py = y0 + p.y;
        const node = svg('rect', { class: `thing${p.loose ? ' loose' : ''}`, x: px, y: toY(py, p.w), width: p.l, height: p.w, rx: Math.min(2, p.w / 3) });
        if (p.loose) node.setAttribute('transform', `rotate(${-p.angle} ${px} ${toY(py)})`);
        group.append(node);
      }
    }
    const midX = rect.x + rect.width / 2, midY = toY(rect.y, rect.depth) + rect.depth / 2;
    const names = items.map(id => ITEM_BY_ID[id].name);
    const label = names.length ? names[0] + (names.length > 1 ? ` +${names.length - 1}` : '') : `${bin.w}×${bin.h}`;
    const sub = [names.length ? `${bin.w}×${bin.h}` : '', cx * cy > 1 ? `${cx * cy} inside` : '', bin.low ? 'low' : '', bin.scoop ? 'scoop' : ''].filter(Boolean).join(' · ');
    const labelSize = names.length ? Math.min(fontSize, Math.max(4.5, rect.width * 1.6 / Math.max(6, label.length))) : fontSize;
    group.append(svg('text', { class: `label${names.length ? ' named' : ''}`, x: midX, y: midY + (sub ? -fontSize * 0.1 : fontSize * 0.35), 'font-size': labelSize }, label));
    if (sub) group.append(svg('text', { class: 'sublabel', x: midX, y: midY + fontSize * 1.05, 'font-size': fontSize * 0.68 }, sub));
    group.append(svg('title', {}, `${bin.w}×${bin.h} bin${names.length ? ' for ' + names.join(', ') : ''}${sub ? ' · ' + sub : ''}. Click to change it.`));
    bins.append(group);
  }
  s.append(bins);
  plan.known = new Set(d.bins.map(b => b.id));
  s.append(svg('text', { class: 'front-mark', x: W / 2, y: D + M * 0.8, 'font-size': Math.max(5, Math.min(9, W * 0.02)) }, 'FRONT OF THE DRAWER'));
  // dimensions: width along the top, depth down the right
  const dimFont = Math.max(5, Math.min(8, W * 0.018)), tick = dimGap * 0.3;
  const dims = svg('g', { class: 'dims' });
  const yd = -dimGap * 0.55, xd = W + dimGap * 0.55;
  dims.append(svg('path', { class: 'dim', d: `M0 ${yd} H${W} M0 ${yd - tick} V${yd + tick} M${W} ${yd - tick} V${yd + tick}`, fill: 'none' }));
  dims.append(svg('rect', { x: W / 2 - dimFont * 2.6, y: yd - dimFont * 0.7, width: dimFont * 5.2, height: dimFont * 1.4, fill: '#ece8dc' }));
  dims.append(svg('text', { class: 'dim-text', x: W / 2, y: yd + dimFont * 0.38, 'font-size': dimFont }, `${fmt(W)} mm`));
  dims.append(svg('path', { class: 'dim', d: `M${xd} 0 V${D} M${xd - tick} 0 H${xd + tick} M${xd - tick} ${D} H${xd + tick}`, fill: 'none' }));
  dims.append(svg('rect', { x: xd - dimFont * 0.7, y: D / 2 - dimFont * 2.6, width: dimFont * 1.4, height: dimFont * 5.2, fill: '#ece8dc' }));
  dims.append(svg('text', { class: 'dim-text', x: xd, y: D / 2, 'font-size': dimFont, transform: `rotate(-90 ${xd} ${D / 2})`, dy: dimFont * 0.38 }, `${fmt(D)} mm`));
  s.append(dims);
  plan.ghost = svg('rect', { class: 'ghost', x: 0, y: 0, width: 0, height: 0, rx: 2, visibility: 'hidden' });
  s.append(plan.ghost);

  const empty = g.cols * g.rows - d.bins.reduce((n, b) => n + b.w * b.h, 0);
  el.planStats.innerHTML = `<span><strong>${g.cols} × ${g.rows}</strong> cells</span><span>each <strong>${fmt(g.cellW)} × ${fmt(g.cellD)} mm</strong></span><span><strong>${d.bins.length}</strong> bin${d.bins.length === 1 ? '' : 's'}</span>${empty ? `<span><strong>${empty}</strong> empty cell${empty === 1 ? '' : 's'}</span>` : ''}`;
  el.fillBtn.disabled = empty === 0;
  el.clearBtn.disabled = d.bins.length === 0;
}

/** The cell under the pointer; null outside the drawer unless `clamp`
 * (a drag that wanders off the plan keeps its nearest cell). */
function cellAt(event, clamp = false) {
  const d = state.design, g = grid(d);
  const pt = el.planSvg.createSVGPoint();
  pt.x = event.clientX; pt.y = event.clientY;
  const ctm = el.planSvg.getScreenCTM();
  if (!ctm) return null;
  const p = pt.matrixTransform(ctm.inverse());
  const x = p.x, y = d.drawer.depth - p.y;
  if (!clamp && (x < 0 || x > d.drawer.width || y < 0 || y > d.drawer.depth)) return null;
  const c = Math.max(0, Math.min(g.cols - 1, Math.floor((x - g.originX) / g.pitchX)));
  const r = Math.max(0, Math.min(g.rows - 1, Math.floor((y - g.originY) / g.pitchY)));
  return { c, r };
}

function showGhost(a, b) {
  const d = state.design, g = grid(d);
  const c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c), r0 = Math.min(a.r, b.r), r1 = Math.max(a.r, b.r);
  const x = g.originX + c0 * g.pitchX, y = g.originY + r0 * g.pitchY;
  const w = (c1 - c0 + 1) * g.pitchX - d.settings.gap, h = (r1 - r0 + 1) * g.pitchY - d.settings.gap;
  plan.ghost.setAttribute('x', x); plan.ghost.setAttribute('y', d.drawer.depth - y - h);
  plan.ghost.setAttribute('width', w); plan.ghost.setAttribute('height', h);
  plan.ghost.setAttribute('visibility', 'visible');
}

el.planSvg.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  const cell = cellAt(e);
  if (!cell) return;
  const group = e.target.closest?.('.bin-group');
  plan.pointer = { id: e.pointerId, start: cell, current: cell, onBin: group ? group.dataset.bin : null, dragging: false };
  el.planSvg.setPointerCapture(e.pointerId);
  e.preventDefault();
});
el.planSvg.addEventListener('pointermove', (e) => {
  const p = plan.pointer;
  if (!p || e.pointerId !== p.id) return;
  const cell = cellAt(e, true);
  if (!cell) return;
  p.current = cell;
  if (cell.c !== p.start.c || cell.r !== p.start.r) p.dragging = true;
  if (p.dragging) showGhost(p.start, p.current);
});
function endPointer(e) {
  const p = plan.pointer;
  if (!p || e.pointerId !== p.id) return;
  plan.pointer = null;
  plan.ghost.setAttribute('visibility', 'hidden');
  if (e.type === 'pointercancel') return;
  if (p.dragging) {
    pushUndo();
    const bin = placeBin(state.design, { c: Math.min(p.start.c, p.current.c), r: Math.min(p.start.r, p.current.r), w: Math.abs(p.current.c - p.start.c) + 1, h: Math.abs(p.current.r - p.start.r) + 1 });
    state.selected = bin?.id || null;
    update();
    sound.place();
  } else if (p.onBin) {
    select(p.onBin === state.selected ? null : p.onBin);
  } else {
    pushUndo();
    const bin = placeBin(state.design, { ...p.start, w: 1, h: 1 });
    state.selected = bin?.id || null;
    update();
    sound.place();
  }
}
el.planSvg.addEventListener('pointerup', endPointer);
el.planSvg.addEventListener('pointercancel', endPointer);
el.planSvg.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); e.preventDefault(); }
  else if (e.key === 'Escape') select(null);
});

el.fillBtn.addEventListener('click', () => { pushUndo(); const n = fillEmpty(state.design); update(); sound.settle(n); });
el.clearBtn.addEventListener('click', () => { pushUndo(); state.design.bins = []; state.selected = null; update(); sound.remove(); });
el.undoBtn.addEventListener('click', () => {
  const last = state.undo.pop();
  if (!last) return;
  state.design = restoreDesign(JSON.parse(last));
  state.selected = null;
  el.undoBtn.disabled = state.undo.length === 0;
  update();
  sound.toggle();
});
document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !typing) {
    el.undoBtn.click(); e.preventDefault();
  } else if (e.key === 'Delete' && !typing && state.selected && !el.guide.open) {
    deleteSelected(); e.preventDefault();
  }
});
el.resetViewBtn.addEventListener('click', () => preview.resetView());

/* ---------- print card ---------- */

function renderParts() {
  const d = state.design, list = state.list, pk = state.packing, pr = printer();
  el.printer.value = d.settings.printer; el.printer2.value = d.settings.printer; el.filament.value = d.settings.filament;
  el.parts.replaceChildren(...list.parts.map(part => {
    const li = document.createElement('li');
    if (part.error) li.className = 'error';
    const qty = document.createElement('span'); qty.className = 'qty'; qty.textContent = `${part.qty} ×`;
    const what = document.createElement('div'); what.className = 'what';
    const title = document.createElement('strong'); title.textContent = part.title;
    const meta = document.createElement('span');
    meta.textContent = part.error ? part.error : `${part.size} · ${fmt(part.grams)} g · ~${minutes(part.minutes)} each${part.contents?.length ? ' · for ' + part.contents.join(', ') : ''}`;
    what.append(title, meta);
    li.append(qty, what);
    if (part.mesh) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'stl'; b.textContent = 'STL';
      b.title = `Download just this part as STL`;
      b.addEventListener('click', () => download(partFileName(part), partSTL(part), 'model/stl'));
      li.append(b);
    }
    if (part.kind === 'bin') {
      li.addEventListener('mouseenter', () => { for (const g of el.planSvg.querySelectorAll('.bin-group')) if (part.bins.includes(g.dataset.bin)) g.classList.add('selected'); });
      li.addEventListener('mouseleave', () => { for (const g of el.planSvg.querySelectorAll('.bin-group')) g.classList.toggle('selected', g.dataset.bin === state.selected); });
    }
    return li;
  }));
  const t = list.totals;
  el.totals.innerHTML = t.parts
    ? `<strong>${t.parts} part${t.parts === 1 ? '' : 's'}</strong> · about <strong>${Math.round(t.grams)} g</strong> of ${FILAMENTS[d.settings.filament].name} · roughly <strong>${minutes(t.minutes)}</strong> of printing · <strong>${pk.plates.length} plate${pk.plates.length === 1 ? '' : 's'}</strong> on the ${pr.short}.<br><small>Time is a rough figure for a 0.2 mm profile; your slicer will know better.</small>`
    : 'Draw a bin on the plan to start the parts list.';
  const warnings = [];
  if (d.bins.length === 0) warnings.push(['note', 'The plan is empty. Drag across cells, click a cell, or pick a starting layout.']);
  for (const p of pk.tooBig) {
    const bins = d.bins.filter(b => p.bins.includes(b.id));
    const splittable = bins.some(b => Math.max(b.w, b.h) > 1);
    warnings.push(['error', `${p.title} (${p.size}) is too big for the ${pr.short}'s ${pr.bed[0]} × ${pr.bed[1]} mm plate, even on the diagonal.${splittable ? ' Split it into shorter bins joined by a clip, or' : ' Add columns or rows so the cells are smaller, or'} choose a bigger printer.`, splittable ? { label: 'Split it to fit', run: () => { pushUndo(); splitToFit(d, pr); update(); toast('Split into bins that fit the plate; a clip joins them.'); } } : null]);
  }
  for (const plate of pk.plates) if (plate.diagonal) { warnings.push(['note', `${plate.items[0].part.title} is longer than the plate, so it prints on the diagonal, alone on plate ${plate.index}.`]); break; }
  for (const p of list.parts) if (p.error) warnings.push(['error', `${p.title}: ${p.error}`]);
  const g = list.grid;
  if (g.tooBig) warnings.push(['note', `Cells over 120 mm make big, floppy bins; add columns or rows.`]);
  const heights = list.heights;
  if (d.drawer.height - d.settings.rimGap < 8) warnings.push(['error', 'The drawer is too shallow for the room left below its top; lower that setting or check the height.']);
  if (heights.full >= pr.bed[2] - 2) warnings.push(['note', `Bins are capped at ${fmt(heights.full)} mm, the tallest the ${pr.short} prints.`]);
  el.warnings.replaceChildren(...warnings.map(([kind, text, action]) => {
    const p = document.createElement('p'); if (kind === 'note') p.className = 'note'; p.textContent = text;
    if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.addEventListener('click', action.run); p.append(b); }
    return p;
  }));
  el.download3mf.disabled = el.downloadZip.disabled = pk.plates.length === 0;
  renderPlates();
}

/** Every plate as the slicer will open it: the bed, the reserved corner, each part in place. */
function renderPlates() {
  const pk = state.packing, pr = printer();
  const [bx, by] = pk.bed, [exX, exY] = pk.exclude || [0, 0];
  el.platesSummary.textContent = pk.plates.length ? `${pk.plates.length} plate${pk.plates.length === 1 ? '' : 's'} on the ${pr.short}` : 'Plates';
  el.plateList.replaceChildren(...pk.plates.map(plate => {
    const fig = document.createElement('figure'); fig.className = 'plate';
    const s = svg('svg', { viewBox: `-2 -2 ${bx + 4} ${by + 4}`, role: 'img', 'aria-label': `Plate ${plate.index}` });
    // plate coordinates have the back at +Y; flip so the back is at the top, as in the slicer
    const flip = svg('g', { transform: `translate(0 ${by}) scale(1 -1)` });
    flip.append(svg('rect', { class: 'bed', x: 0, y: 0, width: bx, height: by, rx: 3 }));
    if (exX) flip.append(svg('rect', { class: 'exclude', x: 0, y: 0, width: exX, height: exY }));
    for (const it of plate.items) {
      const [w0, d0] = it.part.mesh.size;
      flip.append(svg('rect', { class: `part${it.part.kind === 'clip' ? ' clip' : ''}`, x: 0, y: 0, width: w0, height: d0, rx: Math.min(3, d0 / 3), transform: `translate(${it.tx} ${it.ty}) rotate(${it.rot})` }));
    }
    s.append(flip);
    for (const it of plate.items) {
      if (it.part.kind === 'clip' || Math.min(it.w, it.d) < 28) continue;
      const short = it.part.title.replace(/^Bin /, '').split(' · ')[0];
      s.append(svg('text', { class: 'part-label', x: it.x + it.w / 2, y: by - (it.y + it.d / 2), 'font-size': Math.max(7, Math.min(11, Math.min(it.w, it.d) / 4)) }, short));
    }
    const counts = new Map();
    for (const it of plate.items) counts.set(it.part.title, (counts.get(it.part.title) || 0) + 1);
    const t = plateTotals(plate);
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<strong>Plate ${plate.index}</strong> · ${Math.round(t.grams)} g · ~${minutes(t.minutes)}${plate.diagonal ? ' · on the diagonal' : ''}<br>${[...counts].map(([title, n]) => `${n} × ${title}`).join(', ')}`;
    fig.append(s, cap);
    return fig;
  }));
}

function setSetting(key, value) {
  pushUndo();
  state.design.settings[key] = value;
  state.design.settings.profile = profileOf(state.design.settings);
  update();
  sound.toggle();
}
for (const sel of [el.printer, el.printer2]) sel.addEventListener('change', () => setSetting('printer', sel.value));
el.filament.addEventListener('change', () => setSetting('filament', el.filament.value));

function renderSettings() {
  const s = state.design.settings;
  for (const key of Object.keys(SETTINGS_LIMITS)) if (document.activeElement !== el[key]) el[key].value = s[key];
  el.clips.checked = s.clips;
  el.clipFit.value = s.clipFit;
  el.joint.value = s.joint;
  el.channelsWhere.value = s.channelsWhere;
}
for (const key of Object.keys(SETTINGS_LIMITS)) {
  el[key].addEventListener('change', () => {
    const v = clampSetting(key, parseFloat(el[key].value));
    el[key].value = v;
    if (v !== state.design.settings[key]) setSetting(key, v);
  });
}
el.clips.addEventListener('change', () => setSetting('clips', el.clips.checked));
el.joint.addEventListener('change', () => setSetting('joint', el.joint.value));
el.channelsWhere.addEventListener('change', () => setSetting('channelsWhere', el.channelsWhere.value));
el.clipFit.addEventListener('change', () => setSetting('clipFit', el.clipFit.value));
el.resetSettings.addEventListener('click', () => {
  pushUndo();
  const keep = { printer: state.design.settings.printer, filament: state.design.settings.filament };
  state.design.settings = { ...SETTINGS_DEFAULTS, ...keep };
  state.design.settings.profile = profileOf(state.design.settings);
  update();
  toast('Settings are back to the defaults.');
});

el.download3mf.addEventListener('click', () => {
  const pk = state.packing;
  if (!pk.plates.length) return;
  if (pk.plates.length === 1) {
    download('cubby-plate.3mf', threeMF(pk.plates[0], { bed: pk.bed, title: 'Cubby drawer organizer' }), 'model/3mf');
    toast('One plate. Open it in Bambu Studio, choose a filament, slice.');
    sound.chime();
  } else {
    const files = pk.plates.map(p => ({ name: `cubby-plate-${p.index}-of-${pk.plates.length}.3mf`, data: threeMF(p, { bed: pk.bed, title: `Cubby plate ${p.index}` }) }));
    download('cubby-plates.zip', zipStore(files), 'application/zip');
    toast(`${pk.plates.length} plates, one 3MF each, in a ZIP.`);
    sound.chime();
  }
});
el.downloadZip.addEventListener('click', () => {
  download('cubby-drawer.zip', bundle(state.design, state.list, state.packing), 'application/zip');
  toast('Plates, STLs, the print sheet and your design, zipped.');
  sound.chime();
});
el.copyLink.addEventListener('click', async () => {
  const hash = '#d=' + b64url.encode(JSON.stringify(state.design));
  history.replaceState(null, '', hash);
  try { await navigator.clipboard.writeText(location.href); toast('Link copied. It holds the whole design.'); }
  catch { toast('The link is in the address bar; copy it from there.'); }
});
el.save.addEventListener('click', () => {
  download('cubby-design.json', JSON.stringify(state.design, null, 2), 'application/json');
});
el.open.addEventListener('change', async () => {
  const file = el.open.files?.[0];
  if (!file) return;
  try {
    const design = restoreDesign(JSON.parse(await file.text()));
    pushUndo();
    state.design = design; state.selected = null;
    update();
    toast(`Opened ${file.name}.`);
    sound.settle(design.bins.length);
  } catch (error) {
    toast(`Could not open that: ${error.message}`);
    sound.nope();
  }
  el.open.value = '';
});

/* ---------- sound ---------- */

function renderSound() {
  el.soundBtn.setAttribute('aria-pressed', String(sound.isOn()));
  el.soundBtn.lastElementChild.textContent = `Sound: ${sound.isOn() ? 'on' : 'off'}`;
}
el.soundBtn.addEventListener('click', () => { sound.setOn(!sound.isOn()); renderSound(); });
for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => sound.wake(), { once: true, capture: true });
renderSound();

/* ---------- the guide ---------- */

el.guideBtn.addEventListener('click', () => { el.guide.showModal(); });
el.guideClose.addEventListener('click', () => el.guide.close());
el.guide.addEventListener('click', (e) => { if (e.target === el.guide) el.guide.close(); });

/* ---------- go ---------- */

state.design = loadDesign();
update('boot');
