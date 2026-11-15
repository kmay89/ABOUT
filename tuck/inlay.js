/**
 * Tuck — the second colour on the first layer. A raster (0/1 cells, rows
 * running up the sheet) is placed in a rectangle of the sheet, clipped to
 * the sheet's own footprint, and meshed into a thin closed solid that sits
 * on the plate under the sheet's first layers; a pattern can cover the
 * whole footprint instead. The mesher is Knurl's.
 */
import { rasterSolid, unpinch } from '../knurl/inlay.js';
import { inside } from './geometry.js';

/** A 0/1 grid of the sheet's footprint at `cell` mm: 1 where the sheet's bottom touches the plate. */
export function footprint(plan, cell = 0.25) {
  const x0 = plan.bounds.min[0] - cell, y0 = plan.bounds.min[1] - cell;
  const width = Math.ceil((plan.size[0] + 2 * cell) / cell) + 1, height = Math.ceil((plan.size[1] + 2 * cell) / cell) + 1;
  const data = new Uint8Array(width * height);
  for (const r of plan.regions) {
    if (r.z0 > 1e-9) continue;   // a groove cut from below floats above the plate
    const xs = r.ring.map(q => q.x), ys = r.ring.map(q => q.y);
    const gx0 = Math.max(0, Math.floor((Math.min(...xs) - x0) / cell)), gx1 = Math.min(width - 1, Math.ceil((Math.max(...xs) - x0) / cell));
    const gy0 = Math.max(0, Math.floor((Math.min(...ys) - y0) / cell)), gy1 = Math.min(height - 1, Math.ceil((Math.max(...ys) - y0) / cell));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const px = x0 + (gx + 0.5) * cell, py = y0 + (gy + 0.5) * cell;
      if (!inside(r.ring, px, py)) continue;
      if (r.holes.some(h => inside(h, px, py))) continue;
      data[gy * width + gx] = 1;
    }
  }
  return { data, width, height, x0, y0, cell, zmin: 0 };
}

/**
 * Place a raster { data, width, height } (rows bottom-up) inside the
 * rectangle `place` { x0, y0, x1, y1, up } of the sheet, scaled to fit,
 * centred; `up` −1 flips it top to bottom (the lid turns over the back,
 * y → −y, so a top-to-bottom flip now reads right from above once closed;
 * the letters still run left to right along +x). Returns the raster grid
 * in footprint cells.
 */
export function placeRaster(fp, raster, place, { margin = 0 } = {}) {
  const out = new Uint8Array(fp.data.length);
  if (!raster || !raster.width) return { ...fp, data: out, count: 0 };
  const availW = (place.x1 - place.x0 - 2 * margin) / fp.cell, availH = (place.y1 - place.y0 - 2 * margin) / fp.cell;
  const s = Math.min(availW / raster.width, availH / raster.height);
  if (!(s > 0)) return { ...fp, data: out, count: 0 };
  const w = Math.floor(raster.width * s), h = Math.floor(raster.height * s);
  const cx = ((place.x0 + place.x1) / 2 - fp.x0) / fp.cell, cy = ((place.y0 + place.y1) / 2 - fp.y0) / fp.cell;
  const gx0 = Math.round(cx - w / 2), gy0 = Math.round(cy - h / 2);
  let count = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(raster.width - 1, Math.floor(x / s));
    let sy = Math.min(raster.height - 1, Math.floor(y / s));
    let gx = gx0 + x, gy = gy0 + y;
    if (place.up < 0) sy = raster.height - 1 - sy;   // tops toward -y (the hinge), letters left to right along +x
    if (gx < 0 || gy < 0 || gx >= fp.width || gy >= fp.height) continue;
    if (raster.data[sy * raster.width + sx] && fp.data[gy * fp.width + gx]) { out[gy * fp.width + gx] = 1; count++; }
  }
  return { ...fp, data: out, count };
}

/** A pattern f(u, v) over the whole footprint, u and v in mm from the sheet's centre. */
export function patternRaster(fp, f, { margin = 1.2 } = {}) {
  const out = new Uint8Array(fp.data.length), m = Math.round(margin / fp.cell);
  const cx = fp.x0 + fp.width * fp.cell / 2, cy = fp.y0 + fp.height * fp.cell / 2;
  let count = 0;
  for (let y = 0; y < fp.height; y++) for (let x = 0; x < fp.width; x++) {
    const i = y * fp.width + x; if (!fp.data[i]) continue;
    let ok = true;
    for (let dy = -m; dy <= m && ok; dy++) for (let dx = -m; dx <= m; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= fp.width || yy >= fp.height || !fp.data[yy * fp.width + xx]) { ok = false; break; } }
    if (!ok) continue;
    if (f(fp.x0 + (x + 0.5) * fp.cell - cx, fp.y0 + (y + 0.5) * fp.cell - cy)) { out[i] = 1; count++; }
  }
  return { ...fp, data: out, count };
}

/** The inlay solid from a placed grid: `layers` × `layerHeight` tall, sunk 0.02 mm. */
export function inlaySolid(grid, { layers = 2, layerHeight = 0.2 } = {}) {
  const clean = unpinch(grid);
  let count = 0; for (let i = 0; i < clean.data.length; i++) count += clean.data[i];
  const height = layers * layerHeight;
  const mesh = rasterSolid(clean, { z0: -0.02, height: height + 0.02 });
  const area = count * grid.cell * grid.cell;
  return { mesh, count, area, height, grams: area * height * 1.24 / 1000 };
}
