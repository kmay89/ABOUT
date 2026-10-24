/**
 * Knurl — the textures. Each is a height function h(u, v) in [0, 1] over a
 * surface parameterisation in millimetres, with a period `p` (one repeat)
 * and a few knobs. 0 is the deepest point of the cut, 1 the original
 * surface (textures cut in by default). Pure functions; no DOM.
 *
 * Printability notes live with each texture: the thing that matters on a
 * wall is the slope along z (an overhang), and the thing that matters on
 * a top is nothing at all (it is printed layer by layer regardless).
 */

const fract = x => x - Math.floor(x);
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const tri = x => 1 - Math.abs(2 * fract(x) - 1);           // triangle wave 0..1..0 over one period

/* ---------- a small hash noise ---------- */

function hash2(ix, iy, seed = 0) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise in [0, 1], smooth, with cells of size 1. */
export function noise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/** Fractal noise, `octaves` of value noise, normalised to about [0, 1]. */
export function fbm(x, y, octaves = 3, seed = 0) {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += amp * noise(x, y, seed + o * 7); norm += amp; x *= 2.03; y *= 1.97; amp *= 0.5; }
  return sum / norm;
}

/** Distance to the nearest cell centre of a jittered grid (Worley), in cell units, plus which cell. */
function worley(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let best = 9, second = 9, id = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = ix + dx, cy = iy + dy;
    const px = cx + 0.15 + 0.7 * hash2(cx, cy, seed), py = cy + 0.15 + 0.7 * hash2(cx, cy, seed + 31);
    const d = Math.hypot(x - px, y - py);
    if (d < best) { second = best; best = d; id = hash2(cx, cy, seed + 97); } else if (d < second) second = d;
  }
  return { d: best, d2: second, id };
}

/* ---------- the catalogue ---------- */

/**
 * Each texture: { id, name, blurb, where (which surfaces it suits), h(u, v, p, k),
 * defaults: { period, depth }, knobs: [{ key, label, min, max, step, value }] }.
 * `k` is the knob values by key. u runs along the surface horizontally,
 * v upward on walls (v = z), so a slope in v is an overhang on a wall.
 */
export const TEXTURES = Object.freeze([
  {
    id: 'knurl', name: 'Knurl', blurb: 'Machinist’s diamonds: two sets of grooves at 45°, pyramids between them. Grips well, prints well because every groove climbs at 45° at most.',
    defaults: { period: 2.4, depth: 0.4 }, knobs: [{ key: 'sharp', label: 'Sharpness', min: 0.2, max: 1, step: 0.05, value: 0.6 }],
    h: (u, v, p, k) => { const a = tri((u + v) / p), b = tri((u - v) / p); const m = Math.min(a, b); return Math.pow(m, 1 / (0.35 + k.sharp)); },
  },
  {
    id: 'hex', name: 'Honeycomb', blurb: 'Hexagonal cells with a groove between them, each cell a shallow dome. Reads as a technical, even surface from any angle.',
    defaults: { period: 4, depth: 0.45 }, knobs: [{ key: 'groove', label: 'Groove width', min: 0.05, max: 0.6, step: 0.05, value: 0.3 }],
    h: (u, v, p, k) => {
      // hex lattice distance: fold into one cell
      const s = p / Math.sqrt(3);
      let x = u / (1.5 * s), y = v / (Math.sqrt(3) * s);
      const ix = Math.round(x), iy = Math.round(y - 0.5 * (ix & 1));
      let best = 9;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const cx = ix + dx, cy = iy + dy;
        const px = cx * 1.5 * s, py = (cy + 0.5 * (cx & 1)) * Math.sqrt(3) * s;
        const ex = u - px, ey = v - py;
        // hexagon distance (flat-top): max over the three axes
        const d = Math.max(Math.abs(ex), Math.abs(ex * 0.5 + ey * 0.8660254), Math.abs(ex * 0.5 - ey * 0.8660254)) / s;
        if (d < best) best = d;
      }
      const edge = 0.8660254;      // the cell boundary in these units
      const t = clamp01((edge - best) / (edge * k.groove));
      return smooth(t) * (0.85 + 0.15 * (1 - best / edge));
    },
  },
  {
    id: 'flutes', name: 'Flutes', blurb: 'Vertical rounded channels, like a column. The safest wall texture there is: each layer is the same, so nothing overhangs.',
    defaults: { period: 3, depth: 0.6 }, knobs: [{ key: 'round', label: 'Roundness', min: 0.2, max: 1, step: 0.05, value: 0.8 }],
    h: (u, v, p, k) => { const t = tri(u / p); return 1 - Math.pow(Math.sin(Math.PI * t / 2), 1 + 3 * k.round) * 1; },
  },
  {
    id: 'ripples', name: 'Ripples', blurb: 'Horizontal waves climbing the part, layer-aligned. Gentle slopes; keep the period at least four times the depth and it prints clean.',
    defaults: { period: 3, depth: 0.4 }, knobs: [{ key: 'drift', label: 'Drift', min: 0, max: 1, step: 0.05, value: 0.25 }],
    h: (u, v, p, k) => 0.5 + 0.5 * Math.sin(2 * Math.PI * (v / p + k.drift * 0.6 * Math.sin(2 * Math.PI * u / (p * 4)))),
  },
  {
    id: 'scales', name: 'Fish scales', blurb: 'Overlapping scales in staggered rows, each a shallow dome with a crisp lower edge. Lovely on vases; the crisp edge faces down on a wall, so keep the depth modest.',
    defaults: { period: 4, depth: 0.45 }, knobs: [{ key: 'dome', label: 'Dome', min: 0.2, max: 1, step: 0.05, value: 0.6 }],
    h: (u, v, p, k) => {
      const row = Math.floor(v / (p * 0.5));
      let best = 0;
      for (let r = row; r <= row + 1; r++) {
        const off = (r & 1) ? p / 2 : 0;
        const cy = r * p * 0.5;
        const cx = (Math.round((u - off) / p)) * p + off;
        const d = Math.hypot((u - cx) / p, (v - cy) / p);
        if (v >= cy - 1e-9 && d <= 0.5) best = Math.max(best, 1 - k.dome * Math.pow(d / 0.5, 2) * 0.9 - (1 - k.dome) * 0.3);
      }
      return best || 0.2;
    },
  },
  {
    id: 'leather', name: 'Leather', blurb: 'Irregular pebbled grain, cells of different sizes with soft creases between them. Hides layer lines like nothing else.',
    defaults: { period: 2.5, depth: 0.35 }, knobs: [{ key: 'crease', label: 'Crease', min: 0.05, max: 0.6, step: 0.05, value: 0.25 }],
    h: (u, v, p, k) => { const w = worley(u / p, v / p, 3); const crease = clamp01((w.d2 - w.d) / k.crease); return 0.15 + 0.85 * smooth(crease) * (0.8 + 0.2 * w.id); },
  },
  {
    id: 'peel', name: 'Orange peel', blurb: 'Soft random stipple, like powder coat or cast metal. The gentlest texture: no direction, no edges, tiny slopes.',
    defaults: { period: 1.6, depth: 0.25 }, knobs: [{ key: 'grain', label: 'Grain', min: 1, max: 4, step: 1, value: 3 }],
    h: (u, v, p, k) => fbm(u / p, v / p, k.grain, 11),
  },
  {
    id: 'wood', name: 'Wood grain', blurb: 'Long wandering lines of grain running up the part, from stretched noise. Prints as fine vertical ridges.',
    defaults: { period: 2, depth: 0.3 }, knobs: [{ key: 'wander', label: 'Wander', min: 0, max: 1, step: 0.05, value: 0.4 }],
    h: (u, v, p, k) => { const n = fbm(u / (p * 6), v / (p * 40), 3, 5); return 0.5 + 0.5 * Math.sin(2 * Math.PI * (u / p + k.wander * 6 * n)); },
  },
  {
    id: 'brick', name: 'Brick', blurb: 'Running bond with recessed mortar lines; each brick face slightly cushioned. The mortar lines are horizontal and vertical, both easy.',
    defaults: { period: 8, depth: 0.45 }, knobs: [{ key: 'mortar', label: 'Mortar', min: 0.04, max: 0.3, step: 0.02, value: 0.16 }],
    h: (u, v, p, k) => {
      const bh = p * 0.45;
      const row = Math.floor(v / bh);
      const uu = u + (row & 1 ? p / 2 : 0);
      const fx = fract(uu / p), fy = fract(v / bh);
      const m = k.mortar;
      const inside = Math.min(fx, 1 - fx) / m * (p / bh) , insideY = Math.min(fy, 1 - fy) / m;
      const t = smooth(Math.min(inside, insideY));
      return t * (0.85 + 0.15 * (1 - 4 * (fx - 0.5) ** 2) * (1 - 4 * (fy - 0.5) ** 2));
    },
  },
  {
    id: 'dots', name: 'Dimples', blurb: 'A staggered field of shallow round dimples, golf-ball style. Round everywhere, so nothing overhangs beyond the depth you give it.',
    defaults: { period: 3, depth: 0.4 }, knobs: [{ key: 'size', label: 'Dimple size', min: 0.3, max: 0.95, step: 0.05, value: 0.75 }],
    h: (u, v, p, k) => {
      const row = Math.round(v / (p * 0.866));
      const off = (row & 1) ? p / 2 : 0;
      const cx = Math.round((u - off) / p) * p + off, cy = row * p * 0.866;
      const d = Math.hypot(u - cx, v - cy) / (p * 0.5 * k.size);
      return d >= 1 ? 1 : 1 - Math.sqrt(1 - d * d);
    },
  },
]);

export const textureById = id => TEXTURES.find(t => t.id === id) || TEXTURES[0];

/**
 * Patterns for the first-layer inlay: 1 where the second colour goes.
 * Same parameterisation (u, v in mm on the bottom face), period p.
 */
export const INLAYS = Object.freeze([
  { id: 'none', name: 'None' },
  { id: 'hexgrid', name: 'Honeycomb lines', f: (u, v, p, k) => 1 - Math.round(textureById('hex').h(u, v, p, { groove: k.weight * 0.8 })) },
  { id: 'dots', name: 'Polka dots', f: (u, v, p, k) => (textureById('dots').h(u, v, p, { size: k.weight * 1.1 }) < 1 ? 1 : 0) },
  { id: 'stripes', name: 'Stripes', f: (u, v, p, k) => (fract(u / p) < k.weight ? 1 : 0) },
  { id: 'checker', name: 'Checkerboard', f: (u, v, p) => ((Math.floor(u / p) + Math.floor(v / p)) & 1) },
  { id: 'diamonds', name: 'Diamonds', f: (u, v, p, k) => (tri((u + v) / p) < k.weight && tri((u - v) / p) < k.weight ? 1 : 0) },
  { id: 'rings', name: 'Rings', f: (u, v, p, k) => (fract(Math.hypot(u, v) / p) < k.weight ? 1 : 0) },
  { id: 'waves', name: 'Waves', f: (u, v, p, k) => (fract(v / p + 0.25 * Math.sin(2 * Math.PI * u / (2 * p))) < k.weight ? 1 : 0) },
  { id: 'border', name: 'Border', f: null },  // handled by distance to the footprint edge
  { id: 'text', name: 'Text', f: null },      // rasterised by the page
  { id: 'image', name: 'Image', f: null },    // rasterised by the page
]);
export const inlayById = id => INLAYS.find(t => t.id === id) || INLAYS[0];
