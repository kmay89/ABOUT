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

/** 0 on a line, rising smoothly to 1 at distance w: an engraved line with gentle flanks. */
const groove = (d, w) => smooth(d / w);
/** Distance to the nearest line of a family spaced s apart, measured along t. */
const lineDist = (t, s) => { const f = fract(t / s); return s * Math.min(f, 1 - f); };
/** Distance from (x, y) to the segment a–b. */
function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-12;
  const t = clamp01(((x - ax) * dx + (y - ay) * dy) / l2);
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
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
  {
    id: 'quilted', name: 'Quilted', blurb: 'Diamond tufting: pillowy cells with a stitched seam between them, the padded-door look. Soft everywhere but the seam, which is narrow and shallow.',
    defaults: { period: 7, depth: 0.4 }, knobs: [{ key: 'puff', label: 'Puff', min: 0.3, max: 1.5, step: 0.05, value: 0.7 }],
    h: (u, v, p, k) => { const a = (u + v) / (p * 1.4142), b = (u - v) / (p * 1.4142); const dome = Math.sin(Math.PI * fract(a)) * Math.sin(Math.PI * fract(b)); return Math.pow(dome, k.puff); },
  },
  {
    id: 'basket', name: 'Basket weave', blurb: 'Strands over and under, cell by cell, like rattan or a woven leather bag. Each strand is a rounded bar that dips where it passes under its neighbour.',
    defaults: { period: 8, depth: 0.5 }, knobs: [{ key: 'strands', label: 'Strands per cell', min: 1, max: 4, step: 1, value: 2 }],
    h: (u, v, p, k) => {
      const i = Math.floor(u / p), j = Math.floor(v / p), fu = fract(u / p), fv = fract(v / p);
      const across = (i + j) & 1 ? fv : fu, along = (i + j) & 1 ? fu : fv;
      const bar = Math.pow(Math.sin(Math.PI * fract(across * k.strands)), 0.6);
      const dip = 0.5 + 0.5 * smooth(Math.min(along, 1 - along) / 0.16);
      return 0.08 + 0.92 * bar * dip;
    },
  },
  {
    id: 'herringbone', name: 'Herringbone', blurb: 'Parquet: 2 × 1 blocks in zigzag courses, each with a bevelled edge and a gentle cushion. Reads as wood floor, tweed or brick depending on the repeat.',
    defaults: { period: 5, depth: 0.35 }, knobs: [{ key: 'bevel', label: 'Bevel', min: 0.06, max: 0.4, step: 0.02, value: 0.18 }],
    h: (u, v, p, k) => {
      const x = (u + v) / (p * 1.4142), y = (v - u) / (p * 1.4142);   // the classic 45° courses
      const i = Math.floor(x), j = Math.floor(y), r = (((i - j) % 4) + 4) % 4;
      let lx, ly, L, W;
      if (r < 2) { lx = x - (i - r); ly = y - j; L = 2; W = 1; } else { lx = x - i; ly = y - (j - (3 - r)); L = 1; W = 2; }
      const e = Math.min(lx, L - lx, ly, W - ly);
      const cushion = 0.9 + 0.1 * (1 - Math.pow(2 * (lx / L) - 1, 2)) * (1 - Math.pow(2 * (ly / W) - 1, 2));
      return groove(e, k.bevel) * cushion;
    },
  },
  {
    id: 'topo', name: 'Topo lines', blurb: 'Contour lines of an imaginary landscape engraved into the surface: the map look. Thin lines that wander and bunch where the hill is steep.',
    defaults: { period: 6, depth: 0.25 }, knobs: [{ key: 'levels', label: 'Contours', min: 2, max: 12, step: 1, value: 7 }, { key: 'line', label: 'Line width', min: 0.08, max: 0.4, step: 0.02, value: 0.2 }],
    h: (u, v, p, k) => {
      const s = p * 1.6, e = 0.05;
      const n = fbm(u / s, v / s, 3, 23) * k.levels;
      const gx = (fbm((u + e) / s, v / s, 3, 23) - fbm((u - e) / s, v / s, 3, 23)) * k.levels / (2 * e);
      const gy = (fbm(u / s, (v + e) / s, 3, 23) - fbm(u / s, (v - e) / s, 3, 23)) * k.levels / (2 * e);
      const f = fract(n), d = Math.min(f, 1 - f) / Math.max(1e-3, Math.hypot(gx, gy));   // distance to the contour in mm
      return groove(d, k.line * p * 0.5);
    },
  },
  {
    id: 'hammered', name: 'Hammered', blurb: 'Overlapping round dents of slightly different sizes, like hand-hammered copper. Catches the light from every direction; no edges at all.',
    defaults: { period: 4, depth: 0.3 }, knobs: [{ key: 'overlap', label: 'Overlap', min: 0.5, max: 1.2, step: 0.05, value: 0.85 }],
    h: (u, v, p, k) => {
      const x = u / p, y = v / p, ix = Math.floor(x), iy = Math.floor(y);
      let deepest = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, cy = iy + dy;
        const px = cx + 0.2 + 0.6 * hash2(cx, cy, 41), py = cy + 0.2 + 0.6 * hash2(cx, cy, 43), r = k.overlap * (0.55 + 0.3 * hash2(cx, cy, 47));
        const d = Math.hypot(x - px, y - py) / r;
        if (d < 1) deepest = Math.max(deepest, (1 - d * d) * (0.7 + 0.3 * hash2(cx, cy, 53)));
      }
      return 1 - deepest;
    },
  },
  {
    id: 'facets', name: 'Low poly', blurb: 'A triangular mesh of flat facets at random heights: the faceted, gem-cut look. Every facet is a plane, so the slopes are exactly what the depth and repeat make them.',
    defaults: { period: 8, depth: 0.5 }, knobs: [{ key: 'jitter', label: 'Jitter', min: 0, max: 0.4, step: 0.05, value: 0.2 }],
    h: (u, v, p, k) => {
      const a = u / p - v / (p * 1.7320508), b = 2 * v / (p * 1.7320508);          // skew to the triangular lattice
      const i = Math.floor(a), j = Math.floor(b), fa = a - i, fb = b - j, upper = fa + fb > 1;
      const hv = (x, y) => Math.round(hash2(x, y, 61) * 2) / 2;                   // three levels, so neighbouring facets differ
      const w0 = upper ? fa + fb - 1 : 1 - fa - fb;                              // barycentric weights on the three corners
      const h0 = upper ? hv(i + 1, j + 1) : hv(i, j), h1 = hv(i + 1, j), h2 = hv(i, j + 1);
      const w1 = upper ? 1 - fb : fa, w2 = upper ? 1 - fa : fb;
      const v0 = 0.15 + 0.85 * (h0 * (1 - k.jitter) + k.jitter * 0.5);
      return v0 * w0 + (0.15 + 0.85 * h1) * w1 + (0.15 + 0.85 * h2) * w2;
    },
  },
  {
    id: 'seigaiha', name: 'Seigaiha', blurb: 'The Japanese wave: overlapping scallops in staggered rows, each a shallow bowl with concentric ridges rising to its rim. Every step faces up, so it prints cleanly on a wall.',
    defaults: { period: 6, depth: 0.35 }, knobs: [{ key: 'rings', label: 'Rings', min: 2, max: 6, step: 1, value: 3 }],
    h: (u, v, p, k) => {
      const R = p / 2, rowH = p * 0.25;
      const row = Math.floor(v / rowH);
      // the scallop in front is from the highest row whose circle contains the point (rows overlap from above)
      for (let r = row + 2; r >= row - 2; r--) {
        const off = (r & 1) ? R : 0, cy = r * rowH, cx = Math.round((u - off) / p) * p + off;
        const d = Math.hypot(u - cx, v - cy);
        if (d <= R && v >= cy - 1e-9) { const t = d / R; const bowl = Math.pow(t, 0.8); const ring = 0.5 + 0.5 * Math.cos(2 * Math.PI * t * k.rings); return bowl * (0.7 + 0.3 * ring); }
      }
      return 1;
    },
  },
  {
    id: 'arabesque', name: 'Arabesque', blurb: 'The octagon-and-square lattice of a mashrabiya screen, engraved as fine lines. Formal, geometric, and all straight grooves at 0°, 45° and 90°.',
    defaults: { period: 8, depth: 0.3 }, knobs: [{ key: 'line', label: 'Line width', min: 0.04, max: 0.25, step: 0.02, value: 0.1 }],
    h: (u, v, p, k) => {
      const x = Math.abs(fract(u / p) - 0.5), y = Math.abs(fract(v / p) - 0.5);        // cell-local, folded to a quadrant
      const oct = Math.max(x, y, (x + y) / 1.4142);                                   // the octagon norm
      const r = 0.5 - 0.1464;                                                         // octagons touch; the squares between them are what is left
      return groove(Math.abs(oct - r) * p, k.line * p);
    },
  },
  {
    id: 'asanoha', name: 'Asanoha', blurb: 'The hemp-leaf star of Japanese joinery: a triangular lattice with lines from each triangle’s centre to its corners, making six-pointed stars. Engraved lines in six directions.',
    defaults: { period: 10, depth: 0.3 }, knobs: [{ key: 'line', label: 'Line width', min: 0.02, max: 0.15, step: 0.01, value: 0.05 }],
    h: (u, v, p, k) => {
      const e = p, hgt = e * 0.8660254;
      // the three lattice line families
      let d = Math.min(lineDist(v, hgt), lineDist(v * 0.5 + u * 0.8660254, hgt), lineDist(v * 0.5 - u * 0.8660254, hgt));
      // the triangle containing the point, and its centroid-to-corner spokes
      const a = u / e - v / (e * 1.7320508), b = 2 * v / (e * 1.7320508);
      const i = Math.floor(a), j = Math.floor(b), fa = a - i, fb = b - j, upper = fa + fb > 1;
      const P = (ia, jb) => [ia * e + jb * e * 0.5, jb * hgt];
      const corners = upper ? [P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)] : [P(i, j), P(i + 1, j), P(i, j + 1)];
      const cx = (corners[0][0] + corners[1][0] + corners[2][0]) / 3, cy = (corners[0][1] + corners[1][1] + corners[2][1]) / 3;
      for (const c of corners) d = Math.min(d, segDist(u, v, cx, cy, c[0], c[1]));
      return groove(d, k.line * p);
    },
  },
  {
    id: 'chevron', name: 'Chevron', blurb: 'Zigzag ridges, bold and graphic. A cosine profile, so even the sharp turns are smooth; turn it 90° for vertical zigzags.',
    defaults: { period: 4, depth: 0.4 }, knobs: [{ key: 'span', label: 'Zig width', min: 1, max: 6, step: 0.5, value: 3 }],
    h: (u, v, p, k) => 0.5 + 0.5 * Math.cos(2 * Math.PI * (v / p + 0.9 * tri(u / (p * k.span)))),
  },
  {
    id: 'dunes', name: 'Dunes', blurb: 'Wind ripples in sand: parallel crests that wander, split and rejoin. Organic and calm; the slopes are those of a sine wave.',
    defaults: { period: 3.5, depth: 0.35 }, knobs: [{ key: 'wander', label: 'Wander', min: 0, max: 1.5, step: 0.05, value: 0.8 }],
    h: (u, v, p, k) => 0.5 + 0.5 * Math.sin(2 * Math.PI * (v / p + k.wander * 1.4 * fbm(u / (p * 4), v / (p * 4), 2, 17))),
  },
  {
    id: 'linen', name: 'Linen', blurb: 'A fine woven cloth: threads in both directions with a little unevenness. Shallow and small; it hides layer lines completely and feels like fabric.',
    defaults: { period: 2.2, depth: 0.18 }, knobs: [{ key: 'slub', label: 'Slub', min: 0, max: 1, step: 0.1, value: 0.4 }],
    h: (u, v, p, k) => { const w = 0.5 + 0.25 * Math.sin(2 * Math.PI * u / p) + 0.25 * Math.sin(2 * Math.PI * v / p); return clamp01(w + k.slub * 0.3 * (noise(u / (p * 3), v / (p * 3), 29) - 0.5)); },
  },
  {
    id: 'trellis', name: 'Trellis', blurb: 'Overlapping circles on a grid, the quatrefoil lattice of Moroccan tile and garden trellis. Curved grooves only; nothing straight.',
    defaults: { period: 8, depth: 0.3 }, knobs: [{ key: 'line', label: 'Line width', min: 0.04, max: 0.25, step: 0.02, value: 0.1 }],
    h: (u, v, p, k) => {
      const r = 0.56 * p, ix = Math.round(u / p), iy = Math.round(v / p);
      let d = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) d = Math.min(d, Math.abs(Math.hypot(u - (ix + dx) * p, v - (iy + dy) * p) - r));
      return groove(d, k.line * p);
    },
  },
]);

/**
 * The stamp: a raster (text set by the page, or any picture as a height
 * map) as the relief. k.raster = { data: Uint8Array 0..255 (255 = full
 * cut), width, height }, k.tile (repeat it as a pattern) or placed once at
 * (k.cu, k.cv), which applyTexture sets to the centre of the textured
 * faces. One tile is `p` mm wide. Bilinear, so letters have smooth edges.
 */
export function stampHeight(u, v, p, k) {
  const r = k.raster;
  if (!r || !r.width || !r.height) return 1;
  const mmPerPx = p / r.width;
  let lx = (u - (k.cu || 0)) / mmPerPx + r.width / 2, ly = (v - (k.cv || 0)) / mmPerPx + r.height / 2;
  if (k.tile) { lx -= Math.floor(lx / r.width) * r.width; ly -= Math.floor(ly / r.height) * r.height; }
  else if (lx < 0 || ly < 0 || lx >= r.width || ly >= r.height) return 1;
  const x0 = Math.floor(lx - 0.5), y0 = Math.floor(ly - 0.5), fx = lx - 0.5 - x0, fy = ly - 0.5 - y0;
  const at = (x, y) => {
    if (k.tile) { x = ((x % r.width) + r.width) % r.width; y = ((y % r.height) + r.height) % r.height; }
    else if (x < 0 || y < 0 || x >= r.width || y >= r.height) return 0;
    return r.data[y * r.width + x];
  };
  const val = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  return 1 - val / 255;
}

export const STAMP = Object.freeze({
  id: 'stamp', name: 'Stamp', blurb: 'Your own text or picture as the relief: a name across a wall, a logo, any photo as a height map. Place it once, centred on the textured faces, or tile it as a pattern.',
  defaults: { period: 40, depth: 0.5 }, knobs: [{ key: 'soft', label: 'Softness', min: 0, max: 1, step: 0.05, value: 0.2 }],
  h: stampHeight,
});

export const ALL_TEXTURES = Object.freeze([...TEXTURES, STAMP]);
export const textureById = id => ALL_TEXTURES.find(t => t.id === id) || TEXTURES[0];

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
  { id: 'chevron', name: 'Chevron', f: (u, v, p, k) => (fract(v / p + 0.9 * tri(u / (p * 3))) < k.weight ? 1 : 0) },
  { id: 'herringbone', name: 'Herringbone', f: (u, v, p, k) => (textureById('herringbone').h(u, v, p, { bevel: 0.08 + k.weight * 0.3 }) < 0.5 ? 1 : 0) },
  { id: 'basket', name: 'Basket weave', f: (u, v, p, k) => (textureById('basket').h(u, v, p, { strands: 2 }) < 0.25 + k.weight * 0.6 ? 1 : 0) },
  { id: 'seigaiha', name: 'Seigaiha', f: (u, v, p, k) => { const h = textureById('seigaiha').h(u, v, p, { rings: 3 }); return h > 1 - k.weight * 0.75 ? 1 : 0; } },
  { id: 'asanoha', name: 'Asanoha', f: (u, v, p, k) => (textureById('asanoha').h(u, v, p, { line: 0.02 + k.weight * 0.1 }) < 0.5 ? 1 : 0) },
  { id: 'arabesque', name: 'Arabesque', f: (u, v, p, k) => (textureById('arabesque').h(u, v, p, { line: 0.04 + k.weight * 0.25 }) < 0.5 ? 1 : 0) },
  { id: 'trellis', name: 'Trellis', f: (u, v, p, k) => (textureById('trellis').h(u, v, p, { line: 0.04 + k.weight * 0.25 }) < 0.5 ? 1 : 0) },
  { id: 'topo', name: 'Topo lines', f: (u, v, p, k) => (textureById('topo').h(u, v, p, { levels: 5, line: 0.04 + k.weight * 0.3 }) < 0.5 ? 1 : 0) },
  { id: 'quilt', name: 'Quilted', f: (u, v, p, k) => (textureById('quilted').h(u, v, p, { puff: 0.7 }) < k.weight * 0.9 ? 1 : 0) },
  { id: 'squares', name: 'Concentric squares', f: (u, v, p, k) => (fract(Math.max(Math.abs(u), Math.abs(v)) / p) < k.weight ? 1 : 0) },
  { id: 'sunburst', name: 'Sunburst', f: (u, v, p, k) => (fract(Math.atan2(v, u) / (2 * Math.PI) * Math.max(4, Math.round(36 / p * 2))) < k.weight ? 1 : 0) },
  { id: 'halftone', name: 'Halftone', f: (u, v, p, k) => { const cx = Math.round(u / p) * p, cy = Math.round(v / p) * p; const size = clamp01(0.5 + v / 60) * (0.3 + k.weight * 1.8); return Math.hypot(u - cx, v - cy) < p * 0.5 * size ? 1 : 0; } },  // dots grow across 60 mm
  { id: 'border', name: 'Border', f: null },  // handled by distance to the footprint edge
  { id: 'text', name: 'Text', f: null },      // rasterised by the page
  { id: 'image', name: 'Image', f: null },    // rasterised by the page
]);
export const inlayById = id => INLAYS.find(t => t.id === id) || INLAYS[0];
