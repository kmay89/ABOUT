/**
 * Knurl — three sample parts, built from scratch so the studio has
 * something to texture before a file is dropped in: a box with a lid lip,
 * a cup, and a knob. Closed meshes, millimetres, standing on z = 0.
 */
import { weld } from './mesh.js';

/** A solid of revolution from a profile [[r, z], …] (r ≥ 0, z rising); closed top and bottom when the profile starts and ends on the axis or at a flat. */
export function revolve(profile, segments = 96) {
  const soup = [];
  const ring = (i, k) => { const a = (k / segments) * Math.PI * 2; return [profile[i][0] * Math.cos(a), profile[i][0] * Math.sin(a), profile[i][1]]; };
  for (let i = 0; i + 1 < profile.length; i++) for (let k = 0; k < segments; k++) {
    const k2 = (k + 1) % segments;
    const a = ring(i, k), b = ring(i, k2), c = ring(i + 1, k2), d = ring(i + 1, k);
    soup.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  // caps where the profile ends away from the axis
  const cap = (i, up) => { for (let k = 0; k < segments; k++) { const k2 = (k + 1) % segments, a = ring(i, k), b = ring(i, k2), o = [0, 0, profile[i][1]]; soup.push(...o, ...(up ? a : b), ...(up ? b : a)); } };
  if (profile[0][0] > 1e-9) cap(0, false);
  if (profile[profile.length - 1][0] > 1e-9) cap(profile.length - 1, true);
  return weld(Float32Array.from(soup));
}

/** A box with rounded vertical corners, optionally with a shallow recess on top (a lid lip). */
export function roundedBox(w = 60, d = 40, h = 24, r = 6, segments = 10) {
  // outline: rounded rectangle, counter-clockwise
  const pts = [];
  const corners = [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, Math.PI / 2], [-w / 2 + r, -d / 2 + r, Math.PI], [w / 2 - r, -d / 2 + r, 1.5 * Math.PI]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= segments; i++) { const a = a0 + (i / segments) * Math.PI / 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return prism(pts, h);
}

/** A straight prism from a CCW outline (convex or star-shaped around the origin is fine), fanned from the centroid. */
export function prism(outline, h) {
  const soup = [];
  const n = outline.length;
  let cx = 0, cy = 0; for (const [x, y] of outline) { cx += x; cy += y; } cx /= n; cy /= n;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = outline[i], [x1, y1] = outline[(i + 1) % n];
    soup.push(x0, y0, 0, x1, y1, 0, x1, y1, h, x0, y0, 0, x1, y1, h, x0, y0, h);   // side
    soup.push(cx, cy, 0, x1, y1, 0, x0, y0, 0);                                   // bottom (down)
    soup.push(cx, cy, h, x0, y0, h, x1, y1, h);                                   // top (up)
  }
  return weld(Float32Array.from(soup));
}

export const SAMPLES = Object.freeze([
  { id: 'box', name: 'Box', blurb: '60 × 40 × 24 mm, rounded corners', make: () => roundedBox(60, 40, 24, 6) },
  { id: 'cup', name: 'Cup', blurb: 'Ø 60 × 70 mm, a vessel with a flared lip', make: () => revolve([[0, 0], [26, 0], [28, 2], [29, 30], [31, 68], [32, 70], [29.5, 70], [28.5, 68], [27, 30], [26, 4], [0, 4]], 96) },
  { id: 'knob', name: 'Knob', blurb: 'Ø 32 × 20 mm, a dome on a skirt', make: () => revolve([[0, 0], [16, 0], [16, 6], [15, 8], [14, 14], [10, 18], [5, 20], [0, 20]], 96) },
]);
