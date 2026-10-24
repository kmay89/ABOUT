/**
 * Knurl — the first-layer inlay. The part's footprint on the plate is
 * rasterised, a pattern (or text, or a picture, rasterised by the page)
 * is laid over it, and the cells where both hold become a thin solid one
 * or two layers tall that lies inside the part's bottom. Exported as a
 * second part of the same object on filament 2, it is clipped into the
 * body by the slicer (a later part wins where parts overlap), so the
 * bottom prints in two colours with nothing else changed.
 */
import { bounds } from './mesh.js';
import { inlayById } from './textures.js';

/**
 * Rasterise the bottom faces (normal down, touching the lowest z) into a
 * grid of `cell` mm over the part's XY bounds. Returns { data: Uint8Array,
 * width, height, x0, y0, cell } with 1 where the part touches the plate.
 */
export function footprint(mesh, { cell = 0.25, tolerance = 0.05 } = {}) {
  const b = bounds(mesh), { positions: p, indices: ix } = mesh;
  const x0 = b.min[0] - cell, y0 = b.min[1] - cell;
  const width = Math.ceil((b.size[0] + 2 * cell) / cell) + 1, height = Math.ceil((b.size[1] + 2 * cell) / cell) + 1;
  const data = new Uint8Array(width * height);
  for (let t = 0; t < ix.length / 3; t++) {
    const a = ix[t * 3] * 3, bb = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    if (p[a + 2] > b.min[2] + tolerance || p[bb + 2] > b.min[2] + tolerance || p[c + 2] > b.min[2] + tolerance) continue;
    // a flat triangle on the plate: rasterise it in 2D (sample at cell centres)
    const xs = [p[a], p[bb], p[c]], ys = [p[a + 1], p[bb + 1], p[c + 1]];
    const minX = Math.max(0, Math.floor((Math.min(...xs) - x0) / cell)), maxX = Math.min(width - 1, Math.ceil((Math.max(...xs) - x0) / cell));
    const minY = Math.max(0, Math.floor((Math.min(...ys) - y0) / cell)), maxY = Math.min(height - 1, Math.ceil((Math.max(...ys) - y0) / cell));
    const area = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]);
    if (Math.abs(area) < 1e-12) continue;
    for (let gy = minY; gy <= maxY; gy++) for (let gx = minX; gx <= maxX; gx++) {
      const px = x0 + (gx + 0.5) * cell, py = y0 + (gy + 0.5) * cell;
      const w0 = ((xs[1] - px) * (ys[2] - py) - (xs[2] - px) * (ys[1] - py)) / area;
      const w1 = ((xs[2] - px) * (ys[0] - py) - (xs[0] - px) * (ys[2] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) data[gy * width + gx] = 1;
    }
  }
  return { data, width, height, x0, y0, cell, zmin: b.min[2] };
}

/**
 * Two set cells touching only at a corner would share a vertical edge
 * between four walls — a solid that is not manifold. Fill one of the two
 * empty cells of such a pinch (a few passes, since a fill can make a new one).
 */
export function unpinch(grid) {
  const { width, height } = grid;
  const data = new Uint8Array(grid.data);
  for (let pass = 0; pass < 4; pass++) {
    let changed = 0;
    for (let y = 0; y + 1 < height; y++) for (let x = 0; x + 1 < width; x++) {
      const a = data[y * width + x], b = data[y * width + x + 1], c = data[(y + 1) * width + x], d = data[(y + 1) * width + x + 1];
      if (a && d && !b && !c) { data[y * width + x + 1] = 1; changed++; }
      else if (b && c && !a && !d) { data[y * width + x] = 1; changed++; }
    }
    if (!changed) break;
  }
  return { ...grid, data };
}

/** Erode a raster by r cells (keeps the inlay a margin inside the part's edge). */
export function erode(grid, r) {
  const { data, width, height } = grid;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!data[i]) continue;
    let ok = true;
    for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height || !data[yy * width + xx]) { ok = false; break; }
    }
    out[i] = ok ? 1 : 0;
  }
  return { ...grid, data: out };
}

/**
 * The inlay raster: footprint ∧ pattern. `pattern` is an INLAYS id with
 * `period`, `weight` and `angle`; for 'border' the ring inside the edge of
 * width `period`; for 'text' / 'image' a `raster` ({ data, width, height }
 * of 0/1 at the same cell size, centred on the footprint) made by the page.
 * `margin` mm keeps the inlay inside the outline. Mirror flips in X so a
 * picture reads right from underneath.
 */
export function inlayRaster(fp, { pattern = 'hexgrid', period = 6, weight = 0.3, angle = 0, margin = 0.8, raster = null, mirror = true, scale = 1 } = {}) {
  const inner = erode(fp, Math.round(margin / fp.cell));
  const out = new Uint8Array(fp.data.length);
  const def = inlayById(pattern);
  if (pattern === 'none') return { ...fp, data: out, count: 0 };
  const cx = fp.x0 + fp.width * fp.cell / 2, cy = fp.y0 + fp.height * fp.cell / 2;
  const ca = Math.cos(angle * Math.PI / 180), sa = Math.sin(angle * Math.PI / 180);
  let ring = null;
  if (pattern === 'border') ring = erode(inner, Math.max(1, Math.round(period / fp.cell)));
  let count = 0;
  for (let y = 0; y < fp.height; y++) for (let x = 0; x < fp.width; x++) {
    const i = y * fp.width + x;
    if (!inner.data[i]) continue;
    let on = 0;
    if (pattern === 'border') on = ring.data[i] ? 0 : 1;
    else if (raster) {
      // the page's raster, centred, in cells; mirrored in X when read from below
      const rx = (mirror ? fp.width - 1 - x : x) - Math.floor((fp.width - raster.width * scale) / 2);
      const ry = y - Math.floor((fp.height - raster.height * scale) / 2);
      const sx = Math.floor(rx / scale), sy = Math.floor(ry / scale);
      on = sx >= 0 && sy >= 0 && sx < raster.width && sy < raster.height ? raster.data[sy * raster.width + sx] : 0;
    } else if (def.f) {
      const px = fp.x0 + (x + 0.5) * fp.cell - cx, py = fp.y0 + (y + 0.5) * fp.cell - cy;
      const u = (mirror ? -px : px) * ca - py * sa, v = (mirror ? -px : px) * sa + py * ca;
      on = def.f(u, v, period, { weight }) ? 1 : 0;
    }
    if (on) { out[i] = 1; count++; }
  }
  const clean = unpinch({ ...fp, data: out });
  let n = 0; for (let i = 0; i < clean.data.length; i++) n += clean.data[i];
  return { ...clean, count: n };
}

/**
 * A closed solid from a raster: every set cell becomes a column from z0 to
 * z0 + height, with walls between set and unset cells (the same mesher as
 * Cameo's, flat-topped). Returns { positions, indices } in the part's
 * coordinates.
 */
export function rasterSolid(grid, { z0 = 0, height = 0.4 } = {}) {
  const { data, width, height: rows, x0, y0, cell } = grid;
  const cw = width + 1;
  const topIndex = new Int32Array(cw * (rows + 1)).fill(-1), botIndex = new Int32Array(cw * (rows + 1)).fill(-1);
  const vertices = [], indices = [];
  const px = c => x0 + c * cell, py = r => y0 + r * cell;
  const top = c => { if (topIndex[c] < 0) { const cx = c % cw, cy = (c - cx) / cw; topIndex[c] = vertices.length / 3; vertices.push(px(cx), py(cy), z0 + height); } return topIndex[c]; };
  const bot = c => { if (botIndex[c] < 0) { const cx = c % cw, cy = (c - cx) / cw; botIndex[c] = vertices.length / 3; vertices.push(px(cx), py(cy), z0); } return botIndex[c]; };
  for (let y = 0; y < rows; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!data[i]) continue;
    const c00 = y * cw + x, c10 = c00 + 1, c01 = c00 + cw, c11 = c01 + 1;
    // here +y is +Y (no image flip): top CCW seen from +Z is c00 → c10 → c11
    indices.push(top(c00), top(c10), top(c11), top(c00), top(c11), top(c01));
    indices.push(bot(c00), bot(c11), bot(c10), bot(c00), bot(c01), bot(c11));
    if (x === 0 || !data[i - 1]) indices.push(bot(c00), top(c00), top(c01), bot(c00), top(c01), bot(c01));              // -X
    if (x === width - 1 || !data[i + 1]) indices.push(bot(c10), bot(c11), top(c11), bot(c10), top(c11), top(c10));      // +X
    if (y === 0 || !data[i - width]) indices.push(bot(c00), bot(c10), top(c10), bot(c00), top(c10), top(c00));          // -Y
    if (y === rows - 1 || !data[i + width]) indices.push(bot(c01), top(c01), top(c11), bot(c01), top(c11), bot(c11));   // +Y
  }
  return { positions: Float32Array.from(vertices), indices: Uint32Array.from(indices) };
}

/** The whole inlay: raster then solid. `layers` × `layerHeight` tall, sunk 0.02 mm so it never floats. */
export function buildInlay(mesh, options = {}) {
  const fp = footprint(mesh, { cell: options.cell || 0.25 });
  const raster = inlayRaster(fp, options);
  const height = (options.layers || 2) * (options.layerHeight || 0.2);
  const solid = rasterSolid(raster, { z0: fp.zmin, height });
  const area = raster.count * fp.cell * fp.cell;
  return { mesh: solid, raster, footprint: fp, area, height, grams: area * height * 1.24 / 1000 };
}
