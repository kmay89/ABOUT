/**
 * Swatch — the plate. Which printers, how a test's coupons are built and
 * laid out in a grid on the bed, and what to warn about.
 */
import { COUPONS, layoutLabel, labelRoom, textCols } from './geometry.js';
import { coupons as testCoupons } from './tests.js';

/** Build volumes from the makers' published figures. `exclude` is the
 * front-left corner Bambu Studio's profiles keep clear for the purge line
 * (bed_exclude_area, 18 × 28 mm). */
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

export const DEFAULTS = Object.freeze({ gap: 6, margin: 8 });

/**
 * Build every coupon of a test and place the grid centred on the plate:
 * columns run left to right (x), rows front to back (y). Returns
 * { items: [{...coupon, mesh, size, x, y}], footprint, warnings }.
 */
export function build(test, { printer = PRINTERS[0], gap = DEFAULTS.gap, margin = DEFAULTS.margin } = {}) {
  const make = COUPONS[test.coupon.type];
  if (!make) throw new Error(`No coupon of type "${test.coupon.type}".`);
  // One label layout for the whole grid, worked out from the longest label,
  // so every coupon has the same tab and the same pixel size.
  const list = testCoupons(test);
  const longest = list.reduce((a, c) => (textCols(c.label.join('/')) > textCols(a.label.join('/')) ? c : a), list[0]);
  const minPx = test.coupon.type === 'stencil' ? 1 : test.coupon.type === 'tile' ? 0.85 : 0.8;
  const shared = layoutLabel(longest.label, labelRoom(test.coupon.type, test.coupon), { px: test.coupon.px ?? (test.coupon.type === 'stencil' ? 1.2 : 1), minPx });
  const layout = { lines: shared.lines.length, px: shared.px };
  const items = list.map(c => {
    const built = make({ ...test.coupon, label: c.label, layout });
    return { ...c, type: test.coupon.type, mesh: built.mesh, size: built.size, area: built.area, lines: built.lines };
  });
  const cols = test.x.values.length, rows = test.y ? test.y.values.length : 1;
  const cellW = Math.max(...items.map(i => i.size[0])), cellD = Math.max(...items.map(i => i.size[1]));
  const width = cols * cellW + (cols - 1) * gap, depth = rows * cellD + (rows - 1) * gap;
  const [bedW, bedD, bedH] = printer.bed;
  let x0 = (bedW - width) / 2, y0 = (bedD - depth) / 2;
  const warnings = [];
  if (printer.exclude) {
    // Keep off the purge corner at the front left: nudge the grid back and right if there is room.
    const [ex, ey] = printer.exclude;
    const overlaps = () => x0 < ex + 2 && y0 < ey + 2;
    if (overlaps()) {
      const roomBack = bedD - margin - (y0 + depth), roomRight = bedW - margin - (x0 + width);
      if (roomBack >= ey + 2 - y0) y0 = ey + 2;
      else if (roomRight >= ex + 2 - x0) x0 = ex + 2;
    }
    if (overlaps()) warnings.push(`The grid reaches into the ${ex} × ${ey} mm front-left corner that Bambu Studio keeps for the purge line. Use fewer values, a smaller coupon, or move the parts in the slicer.`);
  }
  if (width > bedW - 2 * margin || depth > bedD - 2 * margin) {
    warnings.push(`This grid is ${Math.round(width)} × ${Math.round(depth)} mm; the ${printer.short} plate is ${bedW} × ${bedD} mm with ${margin} mm kept clear at the edges. Use fewer values or smaller coupons.`);
  }
  const tallest = Math.max(...items.map(i => i.size[2]));
  if (tallest > bedH) warnings.push(`A coupon is ${tallest} mm tall; the ${printer.short} prints to ${bedH} mm.`);
  for (const it of items) {
    it.x = x0 + it.col * (cellW + gap) + cellW / 2;
    it.y = y0 + it.row * (cellD + gap) + cellD / 2;
  }
  return { items, cols, rows, cell: [cellW, cellD], footprint: [width, depth], origin: [x0, y0], warnings };
}

/**
 * A rough print estimate: grams and minutes. Thin tiles print nearly solid
 * (top and bottom shells meet); pillars and cylinders are three walls, the
 * shells, and 15 % infill inside. A plain rate stands in for the slicer.
 */
export function estimate(items, { density = 1.24, mmPerSecond = 110, lineArea = 0.42 * 0.2, infill = 0.15 } = {}) {
  let mm3 = 0;
  for (const it of items) {
    const [w, d, h] = it.size;
    const round = it.type === 'cylinder';
    const footprint = round ? Math.PI * (w / 2) ** 2 : w * d;
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
