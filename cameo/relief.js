/**
 * Cameo — the figure. From a cut-out (and, when there is one, a depth
 * map) to a printable relief: a height field over the silhouette, rounded
 * at the edges by the distance transform, raised in the middle by the
 * depth, with a flat back; a tab along the bottom; and a pedestal with a
 * slot the tab drops into. Both solids come from one mesher that turns a
 * height field over a mask into a closed shell. Millimetres, Z up; the
 * figure is built lying on its back (that is how it prints), the pedestal
 * standing.
 */
import { makeMask, bounds, distanceTransform, blurField, resample, resampleField } from './mask.js';

/* ---------- the height field mesher ---------- */

/**
 * A closed solid from a height field: every set cell of `mask` becomes a
 * column from z = 0 to z = heights[i] (> 0), with a shared top surface
 * (bilinear-ish: corners average the heights of the cells around them),
 * walls where a set cell meets an unset one, and a flat bottom. Cells are
 * `cell` mm square; the mesh is centred on the mask's bounding box in XY.
 * Returns { vertices: number[], indices: number[], size: [w, d, h] }.
 */
export function meshHeightField(mask, heights, { cell = 0.4, centre = true, smoothTop = true } = {}) {
  const { width, height, data } = mask;
  const b = bounds(mask);
  if (!b) return { vertices: [], indices: [], size: [0, 0, 0] };
  const ox = centre ? -((b.x0 + b.x1 + 1) / 2) * cell : 0;
  const oy = centre ? ((b.y0 + b.y1 + 1) / 2) * cell : 0;
  // corner heights: the mean of the set cells around each corner (so the
  // top is a smooth sheet rather than a staircase of columns)
  const cw = width + 1;
  const topZ = new Float32Array(cw * (height + 1));
  const topN = new Uint8Array(cw * (height + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!data[i]) continue;
    for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
      const c = cy * cw + cx;
      if (smoothTop) { topZ[c] += heights[i]; topN[c]++; } else { topZ[c] = Math.max(topZ[c], heights[i]); topN[c] = 1; }
    }
  }
  const vertices = [], indices = [];
  const topIndex = new Int32Array(cw * (height + 1)).fill(-1), botIndex = new Int32Array(cw * (height + 1)).fill(-1);
  // image y runs down; the figure's up is +Y, so flip
  const px = cx => ox + cx * cell, py = cy => oy - cy * cell;
  const top = c => {
    if (topIndex[c] < 0) { const cx = c % cw, cy = (c - cx) / cw; topIndex[c] = vertices.length / 3; vertices.push(px(cx), py(cy), topZ[c] / (topN[c] || 1)); }
    return topIndex[c];
  };
  const bot = c => {
    if (botIndex[c] < 0) { const cx = c % cw, cy = (c - cx) / cw; botIndex[c] = vertices.length / 3; vertices.push(px(cx), py(cy), 0); }
    return botIndex[c];
  };
  let zmax = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!data[i]) continue;
    zmax = Math.max(zmax, heights[i]);
    const c00 = y * cw + x, c10 = c00 + 1, c01 = c00 + cw, c11 = c01 + 1;
    // top (facing +Z): in image coordinates y grows down, so the CCW order seen from above is c00 → c01 → c11 / c00 → c11 → c10
    indices.push(top(c00), top(c01), top(c11), top(c00), top(c11), top(c10));
    // bottom (facing -Z)
    indices.push(bot(c00), bot(c11), bot(c01), bot(c00), bot(c10), bot(c11));
    // walls where the neighbour is outside, wound outward
    if (x === 0 || !data[i - 1]) indices.push(bot(c00), top(c01), top(c00), bot(c00), bot(c01), top(c01));             // -X side
    if (x === width - 1 || !data[i + 1]) indices.push(bot(c10), top(c11), bot(c11), bot(c10), top(c10), top(c11));     // +X side
    if (y === 0 || !data[i - width]) indices.push(bot(c00), top(c10), bot(c10), bot(c00), top(c00), top(c10));         // +Y side (image top)
    if (y === height - 1 || !data[i + width]) indices.push(bot(c01), top(c11), top(c01), bot(c01), bot(c11), top(c11)); // -Y side (image bottom)
  }
  return { vertices, indices, size: [(b.x1 - b.x0 + 1) * cell, (b.y1 - b.y0 + 1) * cell, zmax] };
}

/* ---------- the figure ---------- */

export const FIGURE_DEFAULTS = Object.freeze({
  height: 80,        // mm, of the figure itself, tab not counted
  back: 1.2,         // mm, the flat slab behind everything
  round: 3,          // mm, the radius the edge rounds over
  relief: 4,         // mm, how much the depth map raises the middle
  detail: 1.5,       // mm, fine depth detail (the high-frequency part of the depth map)
  cell: 0.4,         // mm per cell
  tabHeight: 5,      // mm, the foot that goes into the pedestal
  tabThickness: 3,   // mm
  maxCells: 420,     // on the longer side
});

/**
 * Size the working grid: cells of about `cell` mm, never more than
 * `maxCells` on the figure's taller side. Returns { cols, rows, cell }.
 */
export function gridFor(maskBounds, opts) {
  const bw = maskBounds.x1 - maskBounds.x0 + 1, bh = maskBounds.y1 - maskBounds.y0 + 1;
  let cell = opts.cell;
  let rows = Math.round(opts.height / cell);
  if (rows > opts.maxCells) { rows = opts.maxCells; cell = opts.height / rows; }
  const cols = Math.max(1, Math.round(rows * bw / bh));
  return { cols, rows, cell };
}

/**
 * The figure: a cut-out `mask` (any size), an optional `depth` field of
 * the same size (any scale; bigger = nearer), and the options above.
 * Returns { mesh, size, tab: { length, thickness, height }, grid, heights, gridMask }.
 */
export function buildFigure(mask, depth, options = {}) {
  const o = { ...FIGURE_DEFAULTS, ...options };
  const b = bounds(mask);
  if (!b) throw new Error('The cut-out is empty.');
  const { cols, rows, cell } = gridFor(b, o);
  // crop to the bounds and resample to the working grid, with a border of
  // empty cells so the distance transform sees the outside
  const pad = 2;
  const cropW = b.x1 - b.x0 + 1, cropH = b.y1 - b.y0 + 1;
  const crop = makeMask(cropW, cropH);
  for (let y = 0; y < cropH; y++) for (let x = 0; x < cropW; x++) crop.data[y * cropW + x] = mask.data[(b.y0 + y) * mask.width + b.x0 + x];
  const small = resample(crop, cols, rows);
  const tabRows = Math.round(o.tabHeight / cell);
  const W = cols + 2 * pad, H = rows + tabRows + 2 * pad;
  const g = makeMask(W, H);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) g.data[(y + pad) * W + x + pad] = small.data[y * cols + x];
  // the tab: a bar under the lowest part of the figure, as wide as the
  // figure is in its bottom tenth, so the feet stand on something
  const footBand = Math.max(1, Math.round(rows * 0.1));
  let tx0 = W, tx1 = -1;
  for (let y = rows - footBand; y < rows; y++) for (let x = 0; x < cols; x++) if (small.data[y * cols + x]) { tx0 = Math.min(tx0, x + pad); tx1 = Math.max(tx1, x + pad); }
  if (tx1 < tx0) { tx0 = pad; tx1 = pad + cols - 1; }
  const tabCells = new Uint8Array(W * H);
  for (let y = rows + pad; y < rows + pad + tabRows; y++) for (let x = tx0; x <= tx1; x++) { g.data[y * W + x] = 1; tabCells[y * W + x] = 1; }
  // also fill the figure's cells in the foot band straight down to the tab, so paws meet it
  for (let x = tx0; x <= tx1; x++) {
    let seen = false;
    for (let y = pad; y < rows + pad; y++) {
      const i = y * W + x;
      if (g.data[i]) seen = true;
      else if (seen && y >= rows + pad - footBand) { g.data[i] = 1; }
    }
  }
  // heights
  const dist = distanceTransform(g);
  const R = o.round / cell;
  const heights = new Float32Array(W * H);
  // depth, if any: cropped, resampled, normalised inside the figure, split
  // into a broad part (the body's roundness) and a fine part (fur, folds)
  let broad = null, fine = null;
  if (depth) {
    const dcrop = new Float32Array(cropW * cropH);
    for (let y = 0; y < cropH; y++) for (let x = 0; x < cropW; x++) dcrop[y * cropW + x] = depth[(b.y0 + y) * mask.width + b.x0 + x];
    const d = resampleField(dcrop, cropW, cropH, cols, rows);
    let lo = Infinity, hi = -Infinity;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (small.data[y * cols + x]) { const v = d[y * cols + x]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1;
    const norm = new Float32Array(W * H);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) norm[(y + pad) * W + x + pad] = small.data[y * cols + x] ? (d[y * cols + x] - lo) / span : 0;
    // outside the figure, hold the edge value so blurs do not pull the edge down
    const low = blurField(norm, W, H, Math.max(2, Math.round(rows / 40)), 3);
    broad = low;
    fine = new Float32Array(W * H);
    for (let i = 0; i < fine.length; i++) fine[i] = norm[i] - low[i];
  }
  for (let i = 0; i < W * H; i++) {
    if (!g.data[i]) continue;
    if (tabCells[i]) { heights[i] = o.tabThickness; continue; }
    const t = Math.min(1, dist[i] / Math.max(R, 1e-6));
    const roundness = Math.sqrt(1 - (1 - t) * (1 - t));          // a quarter circle: vertical at the edge, flat inside
    let z = o.back + o.round * roundness;
    if (broad) z += o.relief * broad[i] * roundness + o.detail * fine[i] * roundness * roundness;
    heights[i] = Math.max(o.back * 0.5, z);
  }
  const mesh = meshHeightField(g, heights, { cell });
  return {
    mesh, size: mesh.size, cell, grid: { width: W, height: H, rows, cols, pad, tabRows },
    tab: { length: (tx1 - tx0 + 1) * cell, thickness: o.tabThickness, height: tabRows * cell },
    heights, gridMask: g,
  };
}

/* ---------- the pedestal ---------- */

export const PEDESTAL_DEFAULTS = Object.freeze({
  shape: 'oval',       // 'oval' | 'rounded'
  height: 8,           // mm
  margin: 10,          // mm beyond the tab each way
  depth: 26,           // mm front to back
  slotDepth: 5,        // mm
  clearance: 0.3,      // mm, on the slot's width (the fit test's running fit is a good number)
  cell: 0.4,
});

/**
 * A pedestal: a disc or rounded block with a slot for the figure's tab,
 * as a height field (the slot is a pocket) meshed by the same mesher.
 * Returns { mesh, size, slot }.
 */
export function buildPedestal(tab, options = {}) {
  const o = { ...PEDESTAL_DEFAULTS, ...options };
  const cell = o.cell;
  const length = tab.length + 2 * o.margin, depth = Math.max(o.depth, tab.thickness + 2 * 6);
  const W = Math.ceil(length / cell) + 2, H = Math.ceil(depth / cell) + 2;
  const m = makeMask(W, H);
  const heights = new Float32Array(W * H);
  const cx = W / 2, cy = H / 2, rx = length / cell / 2, ry = depth / cell / 2, corner = Math.min(rx, ry) * 0.35;
  const slotL = tab.length + 2 * o.clearance, slotT = tab.thickness + o.clearance;
  const sx = slotL / cell / 2, sy = slotT / cell / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = x + 0.5 - cx, py = y + 0.5 - cy;
    let inside;
    if (o.shape === 'oval') inside = (px * px) / (rx * rx) + (py * py) / (ry * ry) <= 1;
    else {
      const ax = Math.abs(px) - (rx - corner), ay = Math.abs(py) - (ry - corner);
      inside = ax <= 0 && Math.abs(py) <= ry || ay <= 0 && Math.abs(px) <= rx || (ax > 0 && ay > 0 && ax * ax + ay * ay <= corner * corner);
    }
    if (!inside) continue;
    m.data[y * W + x] = 1;
    const inSlot = Math.abs(px) <= sx && Math.abs(py) <= sy;
    heights[y * W + x] = inSlot ? o.height - o.slotDepth : o.height;
  }
  const mesh = meshHeightField(m, heights, { cell, smoothTop: false });
  return { mesh, size: mesh.size, slot: { length: slotL, thickness: slotT, depth: o.slotDepth }, length, depth, height: o.height };
}

/* ---------- checks ---------- */

export function volume(mesh) {
  const v = mesh.vertices, ix = mesh.indices;
  let sum = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    sum += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
  }
  return sum / 6;
}

export function isClosed(mesh) {
  const edges = new Map();
  const ix = mesh.indices;
  for (let i = 0; i < ix.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = ix[i + k], b = ix[i + (k + 1) % 3];
    const key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
    const e = edges.get(key) || { n: 0, dir: 0 };
    e.n++; e.dir += a < b ? 1 : -1;
    edges.set(key, e);
  }
  for (const e of edges.values()) if (e.n !== 2 || e.dir !== 0) return false;
  return true;
}

export function meshBounds(mesh) {
  const v = mesh.vertices, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[i + k]); hi[k] = Math.max(hi[k], v[i + k]); }
  return [lo, hi];
}
