/**
 * Knurl — a shaded tile of a texture, drawn into RGBA bytes. Pure: no DOM,
 * so the page's live swatch, the chip thumbnails and the tests share it.
 * `h(u, v)` is the height in [0, 1] (1 = the original surface), `span` the
 * width of the tile in mm, `depth` in mm, `out` true when the texture is
 * raised rather than cut. The light comes from the top left.
 */
export function shadeTile(data, W, H, h, { span, depth, out = false, colour = [240, 236, 226] } = {}) {
  const mm = span / W;
  const grid = new Float32Array((W + 1) * (H + 1));
  for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
    const u = (x - W / 2) * mm, v = (H / 2 - y) * mm;
    const hv = h(u, v);
    grid[y * (W + 1) + x] = (out ? hv : hv - 1) * depth;
  }
  const lx = -0.55, ly = 0.6, lz = 0.58;
  const [cr, cg, cb] = colour;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * (W + 1) + x;
    const dx = (grid[i + 1] - grid[i]) / mm, dy = (grid[i] - grid[i + W + 1]) / mm;
    let nx = -dx, ny = -dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const lit = Math.max(0, nx * lx + ny * ly + nz * lz);
    const ao = 0.75 + 0.25 * Math.min(1, Math.max(0, 1 + grid[i] / Math.max(depth, 0.05)));
    const s = (0.35 + 0.75 * lit) * ao;
    const o = (y * W + x) * 4;
    data[o] = Math.min(255, cr * s); data[o + 1] = Math.min(255, cg * s); data[o + 2] = Math.min(255, cb * s); data[o + 3] = 255;
  }
  return data;
}

/** A two-colour tile of a first-layer pattern: `f(u, v)` truthy where the second colour goes. */
export function patternTile(data, W, H, f, { span, ink = [43, 43, 43], paper = [240, 236, 226] } = {}) {
  const mm = span / W;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5 - W / 2) * mm, v = (H / 2 - y - 0.5) * mm;
    const c = f(u, v) ? ink : paper;
    const o = (y * W + x) * 4;
    data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
  }
  return data;
}

/** The hex colour as [r, g, b], or a warm off-white when it is not one. */
export function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [240, 236, 226];
  return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
}
