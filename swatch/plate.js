/**
 * Swatch — the plate. Which printers, how one or several tests' coupons are
 * built and laid out on the bed, and what to warn about.
 */
import { COUPONS, layoutLabel, labelRoom, textCols } from './geometry.js';
import { coupons as testCoupons } from './tests.js';

/**
 * Build volumes from the makers' published figures. `exclude` is the
 * front-left corner Bambu Studio's profiles keep clear for the purge line
 * (bed_exclude_area, 18 × 28 mm). `presets` names the system profiles that
 * a Bambu printer ships with in Bambu Studio, so the file can name them
 * and open as a project with no warning; printers without them get a
 * file with geometry and per-object settings only.
 */
export const PRINTERS = Object.freeze([
  { id: 'p2s', name: 'Bambu Lab P2S', short: 'P2S', bed: [256, 256, 256], exclude: [18, 28],
    presets: { model: 'Bambu Lab P2S', printer: 'Bambu Lab P2S 0.4 nozzle', process: '0.20mm Standard @BBL P2S', filament: 'Bambu PLA Basic @BBL P2S' } },
  { id: 'x1c', name: 'Bambu Lab X1 Carbon', short: 'X1C', bed: [256, 256, 256], exclude: [18, 28],
    presets: { model: 'Bambu Lab X1 Carbon', printer: 'Bambu Lab X1 Carbon 0.4 nozzle', process: '0.20mm Standard @BBL X1C', filament: 'Bambu PLA Basic @BBL X1C' } },
  { id: 'p1s', name: 'Bambu Lab P1S', short: 'P1S', bed: [256, 256, 256], exclude: [18, 28],
    presets: { model: 'Bambu Lab P1S', printer: 'Bambu Lab P1S 0.4 nozzle', process: '0.20mm Standard @BBL P1P', filament: 'Bambu PLA Basic @BBL P1P' } },
  { id: 'a1', name: 'Bambu Lab A1', short: 'A1', bed: [256, 256, 256], exclude: [18, 28],
    presets: { model: 'Bambu Lab A1', printer: 'Bambu Lab A1 0.4 nozzle', process: '0.20mm Standard @BBL A1', filament: 'Bambu PLA Basic @BBL A1' } },
  { id: 'a1mini', name: 'Bambu Lab A1 mini', short: 'A1 mini', bed: [180, 180, 180], exclude: [18, 28],
    presets: { model: 'Bambu Lab A1 mini', printer: 'Bambu Lab A1 mini 0.4 nozzle', process: '0.20mm Standard @BBL A1M', filament: 'Bambu PLA Basic @BBL A1M' } },
  { id: 'h2d', name: 'Bambu Lab H2D', short: 'H2D', bed: [350, 320, 325], exclude: [18, 28],
    presets: { model: 'Bambu Lab H2D', printer: 'Bambu Lab H2D 0.4 nozzle', process: '0.20mm Standard @BBL H2D', filament: 'Bambu PLA Basic @BBL H2D' } },
  { id: 'mk4s', name: 'Prusa MK4S', short: 'MK4S', bed: [250, 210, 220] },
  { id: 'coreone', name: 'Prusa CORE One', short: 'CORE One', bed: [250, 220, 270] },
  { id: 'mini', name: 'Prusa MINI+', short: 'MINI', bed: [180, 180, 180] },
  { id: 'g220', name: 'Any 220 mm printer', short: '220 mm', bed: [220, 220, 220] },
  { id: 'g300', name: 'Any 300 mm printer', short: '300 mm', bed: [300, 300, 300] },
]);

/** Bambu Studio's plate types, by the name its config uses. */
export const BED_TYPES = Object.freeze([
  { id: 'Textured PEI Plate', name: 'Textured PEI plate' },
  { id: 'Cool Plate', name: 'Cool plate (smooth PEI)' },
  { id: 'Supertack Plate', name: 'Cool Plate SuperTack' },
  { id: 'High Temp Plate', name: 'High temperature plate' },
  { id: 'Engineering Plate', name: 'Engineering plate' },
]);

export const DEFAULTS = Object.freeze({ gap: 6, between: 10, margin: 8 });

/** One test's coupons, built and laid out as a block with its origin at (0, 0). */
function buildGroup(test, gap) {
  const make = COUPONS[test.coupon.type];
  if (!make) throw new Error(`No coupon of type "${test.coupon.type}".`);
  const list = testCoupons(test);
  // One label layout for the whole grid, from the longest label, so every
  // coupon has the same tab and the same pixel size.
  const longest = list.reduce((a, c) => (textCols(c.label.join('/')) > textCols(a.label.join('/')) ? c : a), list[0]);
  const minPx = test.coupon.type === 'stencil' ? 1 : test.coupon.type === 'tile' ? 0.85 : test.coupon.type === 'gauge' || test.coupon.type === 'socket' ? 0.7 : 0.8;
  const shared = layoutLabel(longest.label, labelRoom(test.coupon.type, test.coupon), { px: test.coupon.px ?? (test.coupon.type === 'stencil' ? 1.2 : test.coupon.type === 'gauge' || test.coupon.type === 'socket' ? 0.9 : 1), minPx, lines: test.coupon.type === 'socket' ? 1 : 0 });
  const layout = { lines: shared.lines.length, px: shared.px };
  const items = list.map(c => {
    const built = make({ ...test.coupon, ...c.geom, label: c.label, layout });
    return { ...c, test, type: test.coupon.type, mesh: built.mesh, size: built.size, area: built.area, lines: built.lines, measure: built.measure };
  });
  const cols = test.x.values.length, rows = test.y ? test.y.values.length : 1;
  const cellW = Math.max(...items.map(i => i.size[0])), cellD = Math.max(...items.map(i => i.size[1]));
  const width = cols * cellW + (cols - 1) * gap, depth = rows * cellD + (rows - 1) * gap;
  for (const it of items) {
    it.x = it.col * (cellW + gap) + cellW / 2;
    it.y = it.row * (cellD + gap) + cellD / 2;
  }
  return { test, items, cols, rows, cell: [cellW, cellD], width, depth };
}

/**
 * Build every coupon of one or more tests and lay the groups out on the
 * plate: each test is a block (columns left to right, rows front to back),
 * blocks go in shelves across the plate, tallest first, and the whole is
 * centred. Returns { groups, items, footprint, warnings }.
 */
export function build(tests, { printer = PRINTERS[0], gap = DEFAULTS.gap, between = DEFAULTS.between, margin = DEFAULTS.margin } = {}) {
  const list = Array.isArray(tests) ? tests : [tests];
  const groups = list.map(t => buildGroup(t, gap));
  const [bedW, bedD, bedH] = printer.bed;
  const roomW = bedW - 2 * margin, roomD = bedD - 2 * margin;
  // Shelf packing in the order given (sessions are ordered on purpose):
  // blocks go left to right along a shelf, shelves stack toward the back.
  // If that does not fit, the same with the blocks widest first, then with
  // the shelves running front to back instead; the first that fits wins,
  // else the one that overflows least.
  const pack = (order, vertical) => {
    const shelves = [];
    const along = g => (vertical ? g.depth : g.width), across = g => (vertical ? g.width : g.depth);
    const limit = vertical ? roomD : roomW;
    for (const g of order) {
      let shelf = shelves[shelves.length - 1];
      if (!shelf || shelf.along + between + along(g) > limit) { shelf = { groups: [], along: 0, across: 0 }; shelves.push(shelf); }
      shelf.groups.push({ g, at: shelf.along + (shelf.groups.length > 1 ? between : 0) });
      shelf.along = shelf.groups[shelf.groups.length - 1].at + along(g);
      shelf.across = Math.max(shelf.across, across(g));
    }
    let acrossTotal = 0;
    for (const sh of shelves) { sh.start = acrossTotal; acrossTotal += sh.across + between; }
    acrossTotal -= between;
    const alongTotal = Math.max(...shelves.map(sh => sh.along));
    const width = vertical ? acrossTotal : alongTotal, depth = vertical ? alongTotal : acrossTotal;
    const places = new Map();
    for (const sh of shelves) for (const { g, at } of sh.groups) places.set(g, vertical ? [sh.start, at] : [at, sh.start]);
    const overflow = Math.max(0, width - roomW) + Math.max(0, depth - roomD);
    return { width, depth, places, overflow };
  };
  const byWidth = [...groups].sort((a, b) => b.width - a.width);
  const candidates = [pack(groups, false), pack(byWidth, false), pack(groups, true), pack([...groups].sort((a, b) => b.depth - a.depth), true)];
  const chosen = candidates.find(c => c.overflow === 0) || candidates.reduce((a, b) => (b.overflow < a.overflow ? b : a));
  const { width, depth, places } = chosen;
  let x0 = (bedW - width) / 2, y0 = (bedD - depth) / 2;
  const warnings = [];
  if (printer.exclude) {
    const [ex, ey] = printer.exclude;
    const overlaps = () => x0 < ex + 2 && y0 < ey + 2;
    if (overlaps()) {
      const roomBack = bedD - margin - (y0 + depth), roomRight = bedW - margin - (x0 + width);
      if (roomBack >= ey + 2 - y0) y0 = ey + 2;
      else if (roomRight >= ex + 2 - x0) x0 = ex + 2;
    }
    if (overlaps()) warnings.push(`The plate reaches into the ${ex} × ${ey} mm front-left corner that Bambu Studio keeps for the purge line. Use fewer values, or fewer tests on this plate.`);
  }
  if (chosen.overflow > 0) {
    warnings.push(`This plate needs ${Math.round(width)} × ${Math.round(depth)} mm; the ${printer.short} plate is ${bedW} × ${bedD} mm with ${margin} mm kept clear at the edges. Use fewer values, or fewer tests on this plate.`);
  }
  const items = [];
  for (const g of groups) {
    const [gx, gy] = places.get(g);
    g.origin = [x0 + gx, y0 + gy];
    for (const it of g.items) { it.x += g.origin[0]; it.y += g.origin[1]; it.group = groups.indexOf(g); items.push(it); }
  }
  const tallest = Math.max(...items.map(i => i.size[2]));
  if (tallest > bedH) warnings.push(`A coupon is ${tallest} mm tall; the ${printer.short} prints to ${bedH} mm.`);
  return { groups, items, footprint: [width, depth], origin: [x0, y0], warnings };
}

/**
 * A rough print estimate: grams and minutes. Thin tiles print nearly solid
 * (top and bottom shells meet); taller coupons are three walls, the
 * shells, and 15 % infill inside. A plain rate stands in for the slicer.
 */
export function estimate(items, { density = 1.24, mmPerSecond = 110, lineArea = 0.42 * 0.2, infill = 0.15 } = {}) {
  let mm3 = 0;
  for (const it of items) {
    const [w, d, h] = it.size;
    const round = it.type === 'cylinder';
    const footprint = round ? Math.PI * (w / 2) ** 2 : w * d * (it.type === 'socket' ? 0.6 : 1);
    const perimeter = round ? Math.PI * w : 2 * (w + d);
    const solid = footprint * h;
    if (h <= 3) { mm3 += solid; continue; }
    const shell = footprint * 1.6 + perimeter * h * 1.26;
    mm3 += Math.min(solid, shell + Math.max(0, solid - shell) * infill);
  }
  const grams = mm3 * density / 1000;
  const minutes = (mm3 / lineArea / mmPerSecond) / 60 * 1.7; // the 1.7 is for the travels, accelerations and the ironing
  return { grams, minutes, mm3 };
}
