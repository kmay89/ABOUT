/**
 * The drawer, the grid and the bins on it. Millimetres throughout. No DOM.
 *
 * A design is a drawer (inside width, depth and height), a grid of columns
 * and rows that fills it edge to edge, and bins that each cover a rectangle
 * of whole cells. The grid pitch comes from the drawer, so a layout always
 * fills it exactly: no slop, no spacers, nothing to shim. Every bin is the
 * same height (the drawer's, less a little room under its top edge) unless
 * it is marked low. The parts list groups identical bins, counts the clips
 * that join neighbours, and packs everything onto the printer's plates.
 */
import { JOINT, CLIP_FITS, buildBin, buildClip } from './geometry.js';
import { ITEM_BY_ID, fit as itemFit } from './items.js';

export const VERSION = 1;
export const MIN_CELL = 18;      // mm — a channel, two corners and room for a finger
export const MAX_CELL = 120;

export const SPACES = Object.freeze({
  kitchen: { name: 'Kitchen', cell: 65, blurb: 'Utensils, cutlery, the junk drawer.' },
  desk: { name: 'Desk', cell: 55, blurb: 'Pens, cables, clips and the small things.' },
  garage: { name: 'Garage', cell: 45, blurb: 'Screws, bits, hand tools and hardware.' },
  bath: { name: 'Bathroom', cell: 50, blurb: 'Makeup, brushes, hair ties, razors.' },
  other: { name: 'Anywhere', cell: 55, blurb: 'A plain grid to arrange as you like.' },
});

/** Build volumes from the makers' published figures. `exclude` is the
 * front-left corner Bambu Studio keeps clear for the nozzle wipe and purge
 * line (its profiles' bed_exclude_area, 18 × 28 mm); parts are packed
 * around it so a plate slices exactly as laid out. */
export const PRINTERS = Object.freeze([
  { id: 'p2s', name: 'Bambu Lab P2S', short: 'P2S', bed: [256, 256, 256], exclude: [18, 28] },
  { id: 'p1x1', name: 'Bambu Lab X1 · P1 series', short: 'X1 / P1', bed: [256, 256, 256], exclude: [18, 28] },
  { id: 'a1', name: 'Bambu Lab A1', short: 'A1', bed: [256, 256, 256], exclude: [18, 28] },
  { id: 'a1mini', name: 'Bambu Lab A1 mini', short: 'A1 mini', bed: [180, 180, 180], exclude: [18, 28] },
  { id: 'h2d', name: 'Bambu Lab H2D', short: 'H2D', bed: [350, 320, 325], exclude: [18, 28] },
  { id: 'mk4s', name: 'Prusa MK4S', short: 'MK4S', bed: [250, 210, 220] },
  { id: 'coreone', name: 'Prusa CORE One', short: 'CORE One', bed: [250, 220, 270] },
  { id: 'mini', name: 'Prusa MINI+', short: 'MINI', bed: [180, 180, 180] },
  { id: 'g220', name: 'Any 220 mm printer', short: '220 mm', bed: [220, 220, 220] },
  { id: 'g300', name: 'Any 300 mm printer', short: '300 mm', bed: [300, 300, 300] },
]);

export const FILAMENTS = Object.freeze({
  pla: { name: 'PLA', density: 1.24 },
  petg: { name: 'PETG', density: 1.27 },
  abs: { name: 'ABS / ASA', density: 1.05 },
});

export const SETTINGS_DEFAULTS = Object.freeze({
  wall: 1.6,        // four lines of a 0.4 mm nozzle
  floor: 1.2,       // six 0.2 mm layers
  radius: 3,        // outside corners
  divider: 1.2,     // walls between compartments
  clearance: 0.5,   // between the bins and the drawer, each side
  gap: 0.4,         // between neighbouring bins
  rimGap: 3,        // from the top of a bin to the top of the drawer
  clips: true,
  clipFit: 'normal',
  printer: 'p2s',
  filament: 'pla',
});

export const SETTINGS_LIMITS = Object.freeze({
  wall: [1.2, 3.2], floor: [0.8, 3], radius: [0, 8], divider: [0.8, 3],
  clearance: [0, 3], gap: [0.2, 2], rimGap: [0, 20],
});

/* ---------- the design ---------- */

export function clampSetting(key, value) {
  const [lo, hi] = SETTINGS_LIMITS[key];
  if (!Number.isFinite(value)) return SETTINGS_DEFAULTS[key];
  return Math.min(hi, Math.max(lo, Math.round(value * 100) / 100));
}

export function normalizeDrawer(drawer = {}) {
  const num = (v, fallback, lo, hi) => Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v * 10) / 10)) : fallback;
  return {
    width: num(drawer.width, 400, 30, 2000),
    depth: num(drawer.depth, 400, 30, 2000),
    height: num(drawer.height, 60, 12, 300),
    space: SPACES[drawer.space] ? drawer.space : 'other',
  };
}

/** How many cells across fit the drawer at the space's favourite cell size. */
export function suggestedCount(length, settings, space) {
  const usable = length - 2 * settings.clearance;
  const want = Math.round(usable / SPACES[space].cell);
  return Math.max(1, Math.min(maxCount(length, settings), want));
}
export function maxCount(length, settings) {
  return Math.max(1, Math.floor((length - 2 * settings.clearance + settings.gap) / (MIN_CELL + settings.gap)));
}

/** The grid: where every cell sits and how big a bin covering it is. */
export function grid(design) {
  const { drawer, settings } = design;
  const cols = Math.max(1, Math.min(maxCount(drawer.width, settings), design.cols));
  const rows = Math.max(1, Math.min(maxCount(drawer.depth, settings), design.rows));
  const pitchX = (drawer.width - 2 * settings.clearance + settings.gap) / cols;
  const pitchY = (drawer.depth - 2 * settings.clearance + settings.gap) / rows;
  return {
    cols, rows, pitchX, pitchY,
    cellW: pitchX - settings.gap, cellD: pitchY - settings.gap,
    originX: settings.clearance, originY: settings.clearance,
    tooBig: pitchX > MAX_CELL || pitchY > MAX_CELL,
  };
}

export function binHeights(design) {
  const printer = PRINTERS.find(p => p.id === design.settings.printer) || PRINTERS[0];
  const full = Math.max(8, Math.min(design.drawer.height - design.settings.rimGap, printer.bed[2] - 2));
  const low = Math.max(8, Math.round(full * 0.5));
  return { full: Math.round(full * 10) / 10, low };
}

/** Where a bin sits in the drawer and how big it is, from its cells. */
export function binRect(design, bin, g = grid(design)) {
  const x = g.originX + bin.c * g.pitchX, y = g.originY + bin.r * g.pitchY;
  return { x, y, width: bin.w * g.pitchX - design.settings.gap, depth: bin.h * g.pitchY - design.settings.gap };
}

/** Everything buildBin needs for one bin of the design. */
export function binSpec(design, bin, g = grid(design)) {
  const { settings } = design, rect = binRect(design, bin, g), heights = binHeights(design);
  const centres = (n, pitch) => Array.from({ length: n }, (_, i) => (i + 0.5) * pitch - settings.gap / 2);
  const channels = settings.clips
    ? { front: centres(bin.w, g.pitchX), back: centres(bin.w, g.pitchX), left: centres(bin.h, g.pitchY), right: centres(bin.h, g.pitchY) }
    : { front: [], back: [], left: [], right: [] };
  const height = bin.low ? heights.low : heights.full;
  return {
    width: Math.round(rect.width * 1000) / 1000, depth: Math.round(rect.depth * 1000) / 1000, height,
    wall: settings.wall, floor: settings.floor, radius: settings.radius, divider: settings.divider,
    compartmentsX: bin.cx || 1, compartmentsY: bin.cy || 1,
    channels,
    scoop: bin.scoop ? { depth: Math.min(12, 0.28 * height), width: 0.6 * rect.width } : null,
  };
}

export function occupancy(design) {
  const g = grid(design), cells = new Array(g.cols * g.rows).fill(null);
  for (const bin of design.bins) {
    for (let r = bin.r; r < bin.r + bin.h; r++) for (let c = bin.c; c < bin.c + bin.w; c++) {
      if (c >= 0 && c < g.cols && r >= 0 && r < g.rows) cells[r * g.cols + c] = bin.id;
    }
  }
  return { ...g, cells };
}

let nextId = 1;
export function newId() { return `b${Date.now().toString(36)}${(nextId++).toString(36)}`; }

/** Put a bin over a rectangle of cells, taking the place of whatever was there. */
export function placeBin(design, rect, extra = {}) {
  const g = grid(design);
  const c0 = Math.max(0, Math.min(rect.c, rect.c + rect.w - 1)), r0 = Math.max(0, Math.min(rect.r, rect.r + rect.h - 1));
  const c1 = Math.min(g.cols - 1, Math.max(rect.c, rect.c + rect.w - 1)), r1 = Math.min(g.rows - 1, Math.max(rect.r, rect.r + rect.h - 1));
  if (c1 < c0 || r1 < r0) return null;
  const overlaps = b => !(b.c + b.w - 1 < c0 || b.c > c1 || b.r + b.h - 1 < r0 || b.r > r1);
  const bin = { id: newId(), c: c0, r: r0, w: c1 - c0 + 1, h: r1 - r0 + 1, cx: 1, cy: 1, low: false, scoop: false, items: [], ...extra };
  design.bins = design.bins.filter(b => !overlaps(b)).concat(bin);
  return bin;
}

/** Fill every empty cell with a one-cell bin. */
export function fillEmpty(design) {
  const occ = occupancy(design);
  let added = 0;
  for (let r = 0; r < occ.rows; r++) for (let c = 0; c < occ.cols; c++) {
    if (occ.cells[r * occ.cols + c]) continue;
    design.bins.push({ id: newId(), c, r, w: 1, h: 1, cx: 1, cy: 1, low: false, scoop: false, items: [] });
    added++;
  }
  return added;
}

/** Drop bins that no longer fit the grid, and shrink any that hang over its edge. */
export function trimToGrid(design) {
  const g = grid(design);
  design.cols = g.cols; design.rows = g.rows;
  design.bins = design.bins.filter(b => b.c < g.cols && b.r < g.rows).map(b => ({
    ...b, w: Math.min(b.w, g.cols - b.c), h: Math.min(b.h, g.rows - b.r),
  }));
  // Bins may now overlap where the grid shrank; keep the first of any pair.
  const taken = new Set();
  design.bins = design.bins.filter(b => {
    const keys = [];
    for (let r = b.r; r < b.r + b.h; r++) for (let c = b.c; c < b.c + b.w; c++) keys.push(`${c},${r}`);
    if (keys.some(k => taken.has(k))) return false;
    keys.forEach(k => taken.add(k));
    return true;
  });
  return design;
}

/* ---------- starting layouts ---------- */

/** Tile the grid left to right, front to back; pick() says how big a bin to
 * put at each free cell (it is clipped to the free space). */
function tile(cols, rows, pick) {
  const bins = [], taken = new Set();
  const free = (c, r) => c < cols && r < rows && !taken.has(`${c},${r}`);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!free(c, r)) continue;
    const want = pick(c, r, cols, rows) || { w: 1, h: 1 };
    let w = 1; while (w < (want.w || 1) && free(c + w, r)) w++;
    let h = 1; while (h < (want.h || 1) && Array.from({ length: w }, (_, i) => free(c + i, r + h)).every(Boolean)) h++;
    for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) taken.add(`${cc},${rr}`);
    const { w: _w, h: _h, ...extra } = want;
    bins.push({ id: newId(), c, r, w, h, cx: 1, cy: 1, low: false, scoop: false, items: [], ...extra });
  }
  return bins;
}

export const RECIPES = Object.freeze({
  kitchen: [
    { id: 'utensils', name: 'Utensil lanes', blurb: 'Long lanes front to back; the last one double width for the big spoons.',
      make: (cols, rows) => tile(cols, rows, (c) => ({ w: c >= cols - 2 && cols >= 4 ? 2 : 1, h: rows })) },
    { id: 'cutlery', name: 'Cutlery', blurb: 'A lane for each kind, the first split front and back for teaspoons.',
      make: (cols, rows) => tile(cols, rows, (c) => ({ w: 1, h: rows, cy: c === 0 && rows >= 2 ? 2 : 1 })) },
    { id: 'junk', name: 'The junk drawer', blurb: 'Small cups with a finger scoop at the front, bigger bins behind.',
      make: (cols, rows) => tile(cols, rows, (c, r) => r === 0 ? { w: 1, h: 1, scoop: true } : { w: 2, h: 2 }) },
  ],
  desk: [
    { id: 'pens', name: 'Pens and bits', blurb: 'A pen tray along the back, small cups at the front, a cable bin with a scoop.',
      make: (cols, rows) => tile(cols, rows, (c, r) => r === rows - 1 && rows >= 2 ? { w: cols, h: 1, cx: Math.min(3, Math.max(1, Math.floor(cols / 2))) }
        : r === 0 ? (c >= cols - 2 && cols >= 3 ? { w: 2, h: 1, scoop: true } : { w: 1, h: 1 }) : { w: 2, h: 2 }) },
    { id: 'cups', name: 'Cups', blurb: 'Double-width bins, each with a finger scoop, for everything small.',
      make: (cols, rows) => tile(cols, rows, () => ({ w: 2, h: 1, scoop: true })) },
    { id: 'office', name: 'Office', blurb: 'A lane down one side for rulers and scissors, big bins for the rest.',
      make: (cols, rows) => tile(cols, rows, (c) => c === 0 ? { w: 1, h: rows } : { w: 2, h: 2 }) },
  ],
  garage: [
    { id: 'screws', name: 'Screws and bits', blurb: 'Low cups split in four at the front, bigger split bins behind.',
      make: (cols, rows) => tile(cols, rows, (c, r) => r < 2 ? { w: 1, h: 1, cx: 2, cy: 2, low: true } : { w: 2, h: 2, cx: 2, cy: 2 }) },
    { id: 'tools', name: 'Hand tools', blurb: 'Lanes front to back; one double for pliers and drivers.',
      make: (cols, rows) => tile(cols, rows, (c) => ({ w: c === cols - 2 && cols >= 3 ? 2 : 1, h: rows })) },
    { id: 'mixed', name: 'Mixed hardware', blurb: 'Split bins on the left, roomy ones on the right.',
      make: (cols, rows) => tile(cols, rows, (c) => c < Math.ceil(cols / 2) ? { w: 2, h: 1, cx: 2, cy: 1 } : { w: 2, h: 2 }) },
  ],
  bath: [
    { id: 'makeup', name: 'Makeup', blurb: 'Lipstick cups at the front, split bins behind, a lane for brushes.',
      make: (cols, rows) => tile(cols, rows, (c, r) => c === cols - 1 && cols >= 3 ? { w: 1, h: rows } : r === 0 ? { w: 1, h: 1, cx: 2, cy: 2 } : { w: 2, h: 2, cx: 2, cy: 1 }) },
    { id: 'hair', name: 'Hair and skin', blurb: 'Big bins for bottles and brushes with a scoop to lift them out.',
      make: (cols, rows) => tile(cols, rows, () => ({ w: 2, h: 2, scoop: true })) },
    { id: 'everyday', name: 'Everyday', blurb: 'Small bins at the front, large ones behind.',
      make: (cols, rows) => tile(cols, rows, (c, r) => r === 0 ? { w: 1, h: 1 } : { w: 2, h: 2 }) },
  ],
  other: [
    { id: 'bigsmall', name: 'Big and small', blurb: 'Small bins at the front, large ones behind.',
      make: (cols, rows) => tile(cols, rows, (c, r) => r === 0 ? { w: 1, h: 1 } : { w: 2, h: 2 }) },
    { id: 'pairs', name: 'Pairs', blurb: 'Double-width bins.',
      make: (cols, rows) => tile(cols, rows, () => ({ w: 2, h: 1 })) },
    { id: 'cells', name: 'One bin per cell', blurb: 'The plain grid; join cells by dragging across them.',
      make: (cols, rows) => tile(cols, rows, () => ({ w: 1, h: 1 })) },
    { id: 'empty', name: 'Empty', blurb: 'Draw every bin yourself.', make: () => [] },
  ],
});

export function newDesign({ width = 400, depth = 400, height = 60, space = 'other', recipe } = {}, settings = {}) {
  const design = {
    version: VERSION,
    drawer: normalizeDrawer({ width, depth, height, space }),
    settings: { ...SETTINGS_DEFAULTS, ...settings },
    cols: 1, rows: 1, bins: [], recipe: null,
  };
  design.cols = suggestedCount(design.drawer.width, design.settings, design.drawer.space);
  design.rows = suggestedCount(design.drawer.depth, design.settings, design.drawer.space);
  applyRecipe(design, recipe || RECIPES[design.drawer.space][0].id);
  return design;
}

export function applyRecipe(design, id) {
  const list = RECIPES[design.drawer.space] || RECIPES.other;
  const recipe = list.find(r => r.id === id) || list[0];
  const g = grid(design);
  design.bins = recipe.make(g.cols, g.rows);
  design.recipe = recipe.id;
  splitToFit(design);
  return design;
}

/** The inside of one compartment of a bin: what a thing has to fit. */
export function binInside(design, bin, g = grid(design)) {
  const rect = binRect(design, bin, g), s = design.settings, heights = binHeights(design);
  const cx = bin.cx || 1, cy = bin.cy || 1;
  return {
    w: (rect.width - 2 * s.wall - (cx - 1) * s.divider) / cx,
    d: (rect.depth - 2 * s.wall - (cy - 1) * s.divider) / cy,
    h: (bin.low ? heights.low : heights.full) - s.floor,
  };
}

/** The inside a bin of w × h cells would have (one compartment). */
export function insideFor(design, w, h, g = grid(design)) {
  return binInside(design, { c: 0, r: 0, w, h, cx: 1, cy: 1, low: false }, g);
}

/** Does a thing fit this bin? See items.js. */
export function itemFitsBin(design, bin, item, g = grid(design)) {
  return itemFit(binInside(design, bin, g), item, design.settings.rimGap);
}

/* ---------- the plate ---------- */

export const PLATE_MARGIN = 4;    // mm kept clear at the plate's edge
export const PLATE_SPACING = 6;   // mm between parts

/** How a footprint goes on the printer's plate: as it is, turned a quarter,
 * on the diagonal (alone on its plate), or not at all. */
export function plateFit(w, d, printer) {
  const maxW = printer.bed[0] - 2 * PLATE_MARGIN, maxD = printer.bed[1] - 2 * PLATE_MARGIN;
  if (w <= maxW && d <= maxD) return 'axis';
  if (d <= maxW && w <= maxD) return 'turned';
  // At 45° a w × d rectangle's shadow is (w + d) / √2 on each axis.
  const shadow = (w + d) / Math.SQRT2;
  if (shadow <= maxW && shadow <= maxD) return 'diagonal';
  return null;
}

/**
 * Split any bin too long for the plate into the fewest pieces along its long
 * axis that fit square on, so a utensil lane deeper than the plate becomes
 * two lanes joined by a clip. Pieces are as even as the cells allow. A bin
 * whose single cell is already too big is left for the warning.
 */
export function splitToFit(design, printer = PRINTERS.find(p => p.id === design.settings.printer) || PRINTERS[0]) {
  const g = grid(design), out = [];
  let changed = false;
  for (const bin of design.bins) {
    const rect = binRect(design, bin, g), how = plateFit(rect.width, rect.depth, printer);
    if (how === 'axis' || how === 'turned') { out.push(bin); continue; }
    const alongX = rect.width >= rect.depth, cells = alongX ? bin.w : bin.h, pitch = alongX ? g.pitchX : g.pitchY;
    const maxLen = Math.max(printer.bed[0], printer.bed[1]) - 2 * PLATE_MARGIN;
    const perPiece = Math.floor((maxLen + design.settings.gap) / pitch);
    if (perPiece < 1 || cells <= 1) { out.push(bin); continue; }
    const pieces = Math.ceil(cells / perPiece), base = Math.floor(cells / pieces), extra = cells % pieces;
    let at = 0;
    for (let i = 0; i < pieces; i++) {
      const n = base + (i < extra ? 1 : 0);
      out.push({ ...bin, id: i === 0 ? bin.id : newId(), items: [...(bin.items || [])],
        c: alongX ? bin.c + at : bin.c, r: alongX ? bin.r : bin.r + at, w: alongX ? n : bin.w, h: alongX ? bin.h : n });
      at += n;
    }
    changed = true;
  }
  design.bins = out;
  return changed;
}

/** Read a saved design, however old, into a valid one. */
export function restoreDesign(saved) {
  if (!saved || typeof saved !== 'object') throw new TypeError('That is not a Cubby design.');
  const settings = { ...SETTINGS_DEFAULTS };
  for (const key of Object.keys(SETTINGS_LIMITS)) if (saved.settings && key in saved.settings) settings[key] = clampSetting(key, Number(saved.settings[key]));
  if (saved.settings) {
    settings.clips = saved.settings.clips !== false;
    settings.clipFit = CLIP_FITS[saved.settings.clipFit] !== undefined ? saved.settings.clipFit : 'normal';
    settings.printer = PRINTERS.some(p => p.id === saved.settings.printer) ? saved.settings.printer : SETTINGS_DEFAULTS.printer;
    settings.filament = FILAMENTS[saved.settings.filament] ? saved.settings.filament : 'pla';
  }
  const design = { version: VERSION, drawer: normalizeDrawer(saved.drawer), settings, cols: Number(saved.cols) || 1, rows: Number(saved.rows) || 1, bins: [], recipe: saved.recipe || null };
  const ok = n => Number.isInteger(n) && n >= 0 && n < 1000;
  for (const b of Array.isArray(saved.bins) ? saved.bins : []) {
    if (!ok(b.c) || !ok(b.r) || !ok(b.w) || !ok(b.h) || b.w < 1 || b.h < 1) continue;
    design.bins.push({ id: typeof b.id === 'string' ? b.id : newId(), c: b.c, r: b.r, w: b.w, h: b.h,
      cx: ok(b.cx) && b.cx >= 1 ? Math.min(b.cx, 12) : 1, cy: ok(b.cy) && b.cy >= 1 ? Math.min(b.cy, 12) : 1,
      low: !!b.low, scoop: !!b.scoop,
      items: Array.isArray(b.items) ? [...new Set(b.items.filter(id => typeof id === 'string' && ITEM_BY_ID[id]))].slice(0, 12) : [] });
  }
  return trimToGrid(design);
}

/* ---------- parts ---------- */

function binKey(spec) {
  // Everything that shapes the solid, so a changed wall or floor is a new part (and a fresh preview mesh).
  return ['bin', spec.width, spec.depth, spec.height, spec.compartmentsX, spec.compartmentsY, spec.scoop ? 's' : '',
    spec.channels.front.length, spec.channels.left.length, spec.wall, spec.floor, spec.radius, spec.divider].join('|');
}

export function describeBin(bin, spec) {
  const comps = (bin.cx || 1) * (bin.cy || 1);
  const bits = [`${bin.w} × ${bin.h} cell${bin.w * bin.h > 1 ? 's' : ''}`];
  if (comps > 1) bits.push(`${comps} compartments`);
  if (bin.low) bits.push('low');
  if (bin.scoop) bits.push('scoop');
  return { title: `Bin ${bin.w}×${bin.h}${comps > 1 ? ` · ${bin.cx}×${bin.cy} inside` : ''}${bin.low ? ' · low' : ''}${bin.scoop ? ' · scoop' : ''}`,
    size: `${fmt(spec.width)} × ${fmt(spec.depth)} × ${fmt(spec.height)} mm`, bits };
}

export function fmt(mm) { return (Math.round(mm * 10) / 10).toString(); }

/** Every clip the design needs: one per shared cell edge between two bins,
 * long enough for the shorter of the pair. */
export function clipPlan(design) {
  if (!design.settings.clips) return [];
  const occ = occupancy(design), byId = new Map(design.bins.map(b => [b.id, b])), heights = binHeights(design);
  const height = b => b.low ? heights.low : heights.full;
  const lengths = new Map();
  const seam = (idA, idB) => {
    if (!idA || !idB || idA === idB) return;
    const h = Math.min(height(byId.get(idA)), height(byId.get(idB)));
    const length = Math.max(6, Math.round(0.6 * (h - design.settings.floor)));
    lengths.set(length, (lengths.get(length) || 0) + 1);
  };
  for (let r = 0; r < occ.rows; r++) for (let c = 0; c < occ.cols; c++) {
    const here = occ.cells[r * occ.cols + c];
    if (c + 1 < occ.cols) seam(here, occ.cells[r * occ.cols + c + 1]);
    if (r + 1 < occ.rows) seam(here, occ.cells[(r + 1) * occ.cols + c]);
  }
  return [...lengths].sort((p, q) => q[0] - p[0]).map(([length, qty]) => ({ length, qty }));
}

/**
 * The parts list: unique bins with quantities, then clips. Meshes are built
 * here, once per unique part, so the same list serves the preview, the
 * estimates and the files. A part that cannot be built carries its error.
 */
export function partsList(design) {
  const g = grid(design), parts = new Map(), heights = binHeights(design);
  for (const bin of design.bins) {
    const spec = binSpec(design, bin, g), key = binKey(spec);
    if (!parts.has(key)) {
      const part = { key, kind: 'bin', qty: 0, bins: [], spec, ...describeBin(bin, spec), contents: [], mesh: null, error: null };
      try { part.mesh = buildBin(spec); } catch (error) { part.error = error.message; }
      parts.set(key, part);
    }
    const part = parts.get(key);
    part.qty++; part.bins.push(bin.id);
    for (const id of bin.items || []) if (ITEM_BY_ID[id] && !part.contents.includes(ITEM_BY_ID[id].name)) part.contents.push(ITEM_BY_ID[id].name);
  }
  const list = [...parts.values()].sort((p, q) => q.spec.width * q.spec.depth - p.spec.width * p.spec.depth);
  const fit = CLIP_FITS[design.settings.clipFit] ?? CLIP_FITS.normal;
  for (const { length, qty } of clipPlan(design)) {
    const spec = { length, gap: design.settings.gap, fit, joint: JOINT };
    const part = { key: `clip|${length}`, kind: 'clip', qty, bins: [], contents: [], spec, title: `Clip ${length} mm`, size: `${length} × ${fmt(JOINT.base)} × ${fmt(2 * JOINT.depth + design.settings.gap)} mm`, bits: ['joins two bins'], mesh: null, error: null };
    try { part.mesh = buildClip(spec); } catch (error) { part.error = error.message; }
    list.push(part);
  }
  for (const part of list) if (part.mesh) {
    const density = FILAMENTS[design.settings.filament].density;
    part.grams = part.mesh.volume / 1000 * density;
    // A rough figure for a 0.2 mm profile on a fast printer: thin walls
    // print at roughly 20 cm³ an hour, plus a little for each part's first
    // layers and travel between parts on a plate.
    part.minutes = part.mesh.volume / 1000 / 20 * 60 + (part.kind === 'clip' ? 0.5 : 1.5);
  }
  const totals = list.reduce((t, p) => ({
    parts: t.parts + p.qty,
    grams: t.grams + (p.grams || 0) * p.qty,
    minutes: t.minutes + (p.minutes || 0) * p.qty,
    errors: t.errors + (p.error ? 1 : 0),
  }), { parts: 0, grams: 0, minutes: 0, errors: 0 });
  return { parts: list, totals, heights, grid: g };
}

/* ---------- plates ---------- */

/** Where a part's corner goes so its footprint, turned by `rot` degrees
 * about its own origin, sits with its bounding box at (x, y). */
function placement(part, rot, x, y) {
  const [w0, d0] = part.mesh.size, a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const corners = [[0, 0], [w0, 0], [w0, d0], [0, d0]].map(([px, py]) => [px * c - py * s, px * s + py * c]);
  const mx = Math.min(...corners.map(p => p[0])), my = Math.min(...corners.map(p => p[1]));
  const w = Math.max(...corners.map(p => p[0])) - mx, d = Math.max(...corners.map(p => p[1])) - my;
  return { part, rot, x, y, w, d, tx: x - mx, ty: y - my };
}

/**
 * Pack the parts onto plates of the printer's size, in shelves: biggest
 * footprint first, turned a quarter when that fits a shelf better, kept
 * out of the corner Bambu Studio reserves for the purge line. A part too
 * long to lie square goes alone on a plate at 45°, pointing from the
 * front-right corner to the back-left so it misses that reserved corner.
 * A part that fits no way is reported, not placed.
 */
export function packPlates(parts, printer, spacing = PLATE_SPACING, margin = PLATE_MARGIN) {
  const [bedX, bedY] = printer.bed, ex = printer.exclude || [0, 0];
  const maxW = bedX - 2 * margin, maxD = bedY - 2 * margin;
  const items = [];
  for (const part of parts) {
    if (!part.mesh) continue;
    for (let i = 0; i < part.qty; i++) items.push({ part, w: part.mesh.size[0], d: part.mesh.size[1] });
  }
  items.sort((p, q) => q.w * q.d - p.w * p.d);
  const plates = [], tooBig = [];
  const fitsAt = (w, d) => w <= maxW && d <= maxD;
  const startX = y => y < ex[1] ? Math.max(margin, ex[0] + spacing) : margin;
  for (const item of items) {
    const ways = [[item.w, item.d, 0], [item.d, item.w, 90]].filter(([w, d]) => fitsAt(w, d));
    if (!ways.length) {
      const how = plateFit(item.w, item.d, printer);
      if (how === 'diagonal') {
        // Long side along the front-right to back-left diagonal.
        const rot = item.w >= item.d ? 135 : 45;
        const p = placement(item.part, rot, 0, 0);
        plates.push({ shelves: null, diagonal: true, items: [placement(item.part, rot, (bedX - p.w) / 2, (bedY - p.d) / 2)] });
      } else if (!tooBig.includes(item.part)) tooBig.push(item.part);
      continue;
    }
    let placed = false;
    for (const plate of plates) {
      if (!plate.shelves) continue;
      for (const shelf of plate.shelves) {
        for (const [w, d, rot] of ways) {
          if (shelf.x + w <= bedX - margin && d <= shelf.height + 1e-9) {
            plate.items.push(placement(item.part, rot, shelf.x, shelf.y));
            shelf.x += w + spacing; placed = true; break;
          }
        }
        if (placed) break;
      }
      if (placed) break;
      if (openShelf(plate, item, ways)) { placed = true; break; }
    }
    if (!placed) {
      const plate = { shelves: [], items: [] };
      openShelf(plate, item, ways);
      plates.push(plate);
    }
  }
  /** Start a new shelf on a plate for the first way the part fits, lowest
   * first. A part too wide to sit beside the reserved corner starts above
   * it, and the strip in front stays open as a shelf for small parts. */
  function openShelf(plate, item, ways) {
    const last = plate.shelves[plate.shelves.length - 1];
    const top = last ? last.y + last.height + spacing : margin;
    for (const [w, d, rot] of [...ways].sort((p, q) => p[1] - q[1])) {
      for (const y of top < ex[1] ? [top, ex[1] + spacing] : [top]) {
        const x0 = startX(y);
        if (y + d > bedY - margin || x0 + w > bedX - margin) continue;
        if (y > top) plate.shelves.push({ y: top, height: y - spacing - top, x: startX(top) });
        plate.shelves.push({ y, height: d, x: x0 + w + spacing });
        plate.items.push(placement(item.part, rot, x0, y));
        return true;
      }
    }
    return false;
  }
  return { plates: plates.map((p, i) => ({ index: i + 1, items: p.items, diagonal: !!p.diagonal })), tooBig, bed: [bedX, bedY], exclude: ex, margin, spacing };
}

/** The time and plastic a plate takes. */
export function plateTotals(plate) {
  return plate.items.reduce((t, it) => ({ grams: t.grams + (it.part.grams || 0), minutes: t.minutes + (it.part.minutes || 0) }), { grams: 0, minutes: 0 });
}

/** One line per bin: what each is, in plain words, for the print sheet. */
export function designSummary(design) {
  const g = grid(design), heights = binHeights(design);
  return {
    drawer: `${fmt(design.drawer.width)} × ${fmt(design.drawer.depth)} mm inside, ${fmt(design.drawer.height)} mm deep`,
    grid: `${g.cols} × ${g.rows} cells of ${fmt(g.cellW)} × ${fmt(g.cellD)} mm`,
    height: `bins ${fmt(heights.full)} mm tall (low bins ${fmt(heights.low)} mm)`,
    space: SPACES[design.drawer.space].name,
  };
}
