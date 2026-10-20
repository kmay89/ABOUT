/**
 * Hollow — sample models, drawn by formula so the page ships no one else's
 * files. Each is a closed, outward-wound mesh in millimetres, Z up, sitting
 * on Z = 0. They exist so the studio can be tried before a real STL is to
 * hand, and so the tests have known shapes to pour.
 *
 * No DOM; runs anywhere.
 */

import { weld, signedVolume, invert } from './mesh.js';

/** Revolve a closed profile [[r, z], …] about Z. Points on the axis (r ≈ 0) become single vertices. */
export function lathe(profile, segments = 96) {
  const soup = [];
  const n = profile.length;
  const ring = (i, a) => { const [r, z] = profile[i]; return [r * Math.cos(a), r * Math.sin(a), z]; };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ri = profile[i][0] < 1e-6, rj = profile[j][0] < 1e-6;
    if (ri && rj) continue;
    for (let s = 0; s < segments; s++) {
      const a0 = 2 * Math.PI * s / segments, a1 = 2 * Math.PI * (s + 1) / segments;
      const p00 = ring(i, a0), p01 = ring(i, a1), p10 = ring(j, a0), p11 = ring(j, a1);
      if (ri) soup.push(...p00, ...p10, ...p11);
      else if (rj) soup.push(...p01, ...p00, ...p10);
      else soup.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
    }
  }
  return outward(weld(Float32Array.from(soup)));
}

/** Extrude a closed 2D outline [[x, y], …] (any winding, no self-crossings) from z0 to z1. */
export function extrude(outline, z0, z1) {
  const soup = [];
  const n = outline.length;
  // walls
  for (let i = 0; i < n; i++) {
    const [ax, ay] = outline[i], [bx, by] = outline[(i + 1) % n];
    soup.push(ax, ay, z0, bx, by, z0, bx, by, z1, ax, ay, z0, bx, by, z1, ax, ay, z1);
  }
  // caps by ear clipping
  const tris = earClip(outline);
  for (const [a, b, c] of tris) {
    soup.push(outline[a][0], outline[a][1], z1, outline[b][0], outline[b][1], z1, outline[c][0], outline[c][1], z1);
    soup.push(outline[a][0], outline[a][1], z0, outline[c][0], outline[c][1], z0, outline[b][0], outline[b][1], z0);
  }
  return outward(weld(Float32Array.from(soup)));
}

function earClip(points) {
  const idx = points.map((_, i) => i);
  let area = 0;
  for (let i = 0; i < points.length; i++) { const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length]; area += ax * by - bx * ay; }
  if (area < 0) idx.reverse();
  const cross = (o, a, b) => (points[a][0] - points[o][0]) * (points[b][1] - points[o][1]) - (points[a][1] - points[o][1]) * (points[b][0] - points[o][0]);
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (cross(a, b, c) <= 0) continue;
      let ok = true;
      for (const p of idx) if (p !== a && p !== b && p !== c && inside(p, a, b, c)) { ok = false; break; }
      if (!ok) continue;
      out.push([a, b, c]); idx.splice(i, 1); clipped = true; break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

function outward(mesh) { return signedVolume(mesh) < 0 ? invert(mesh) : mesh; }

/** A smooth river pebble, 60 × 45 × 32 mm — the classic two-part job. */
export function pebble() {
  const profile = [];
  const H = 32, R = 30;
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, z = H * t;
    const r = R * Math.sqrt(Math.max(0, 1 - ((t - 0.5) / 0.52) ** 2)) * (0.92 + 0.08 * Math.cos(3 * t));
    profile.push([i === 0 || i === steps ? 0 : Math.max(r, 0.01), z]);
  }
  // squash it in Y so it is not a plain spheroid
  const m = lathe(profile, 80);
  for (let i = 0; i < m.positions.length; i += 3) m.positions[i + 1] *= 0.75;
  return m;
}

/** A faceted planter, 90 mm across and 70 tall, with a 6 mm wall — body plus core in an open mold. */
export function planter() {
  const outer = [], inner = [];
  const H = 70, wall = 6, floor = 8;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    outer.push([30 + 15 * t, H * t]);
  }
  for (let i = 12; i >= 0; i--) {
    const t = i / 12, z = H * t;
    if (z < floor) break;
    inner.push([30 + 15 * t - wall, z]);
  }
  const profile = [[0, 0], ...outer, [45 - wall, H], ...inner.slice(1), [0, floor]];
  // 12 facets, by using few segments
  return lathe(profile, 12);
}

/** A star-shaped tile, 80 mm point to point, 12 mm thick — a flat-backed open-mold piece. */
export function starTile() {
  const outline = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 40;
    outline.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return extrude(outline, 0, 12);
}

/** A round knob with a stem, 36 mm across — a small resin piece for a two-part mold with a spout. */
export function knob() {
  const profile = [[0, 0], [5, 0], [5, 10], [9, 12], [14, 15], [17, 20], [18, 26], [16, 33], [11, 38], [5, 40], [0, 40]];
  return lathe(profile, 64);
}

export const SAMPLES = Object.freeze({
  pebble: { name: 'River pebble', make: pebble, type: 'two-part', note: 'A smooth stone for a two-part concrete mold.' },
  knob: { name: 'Drawer knob', make: knob, type: 'two-part', note: 'A small resin piece with a stem; pour from the stem.' },
  star: { name: 'Star tile', make: starTile, type: 'open', note: 'Flat back up: an open mold for concrete.' },
  planter: { name: 'Faceted planter', make: planter, type: 'open', note: 'A vessel: the mold comes out as a body and a core.' },
});
