/**
 * Tuck — the sheet. A fold-up box is one flat solid: regions of the plane,
 * each with a bottom and a top height (a panel is 0 to t; a hinge groove
 * cut from the top is 0 to the residual; a groove cut from below is
 * t − residual to t), tiling the sheet with exactly matching edges. Every
 * region gets a cap at its top and at its bottom; a wall is raised along
 * every ring edge where the region's height interval sticks out beyond
 * its neighbour's (or beyond nothing, at the outline and around holes).
 * Edges are first split at every other region's vertex lying on them, so
 * a panel next to a narrower groove shares its vertices exactly and the
 * result welds into one closed solid. Caps are triangulated by earcut,
 * with the ring points earcut leaves out stitched back in.
 */
import earcut from './vendor/earcut.js';
import { weld } from '../knurl/mesh.js';

export const Q = 1e-4;   // welding quantum, mm

/* ---------- outlines ---------- */

/** A rectangle, counter-clockwise, with optional corner radii [bl, br, tr, tl] (0 = sharp). */
export function rect(x0, y0, x1, y1, radii = [0, 0, 0, 0], segments = 6) {
  const corners = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]]; // point and the direction into the rect
  const out = [];
  corners.forEach(([cx, cy, sx, sy], i) => {
    const r = Math.min(radii[i] || 0, (x1 - x0) / 2, (y1 - y0) / 2);
    if (r <= 0) { out.push({ x: cx, y: cy }); return; }
    const ox = cx + sx * r, oy = cy + sy * r;   // arc centre
    // start angle: the corner's arc runs from the incoming edge to the outgoing, counter-clockwise
    const a0 = [Math.PI, 1.5 * Math.PI, 0, 0.5 * Math.PI][i];
    for (let k = 0; k <= segments; k++) { const a = a0 + (k / segments) * (Math.PI / 2); out.push({ x: ox + r * Math.cos(a), y: oy + r * Math.sin(a) }); }
  });
  // two arcs that meet (a stadium) would repeat a point: drop consecutive duplicates
  return out.filter((q, i) => { const prev = out[(i + out.length - 1) % out.length]; return Math.hypot(q.x - prev.x, q.y - prev.y) > 1e-9; });
}

/** A circle, counter-clockwise. */
export function circle(cx, cy, r, segments = 48) {
  const out = []; for (let k = 0; k < segments; k++) { const a = (k / segments) * 2 * Math.PI; out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } return out;
}
/** A heart of about `size` across, counter-clockwise, point down. */
export function heart(cx, cy, size, segments = 64) {
  const out = [];
  for (let k = 0; k < segments; k++) {
    const t = (k / segments) * 2 * Math.PI;
    const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push({ x: cx + x * size / 32, y: cy + y * size / 32 });
  }
  return out;
}
/** A star with `points` points, counter-clockwise. */
export function star(cx, cy, r, points = 5, inner = 0.45) {
  const out = []; for (let k = 0; k < points * 2; k++) { const a = Math.PI / 2 + (k / (points * 2)) * 2 * Math.PI, rr = k & 1 ? r * inner : r; out.push({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) }); } return out;
}
export function signedArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return a / 2; }
export const ccw = pts => (signedArea(pts) >= 0 ? pts : pts.slice().reverse());
export const cw = pts => (signedArea(pts) <= 0 ? pts : pts.slice().reverse());

/** A semicircular bite of radius r out of the edge y = yEdge of a rectangle outline, centred at x = cx. The edge must be a straight segment of the ring; returns a new ring. */
export function notch(ring, cx, yEdge, r, fromBelow, segments = 12) {
  // find the edge that contains (cx, yEdge)
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (Math.abs(a.y - yEdge) > 1e-9 || Math.abs(b.y - yEdge) > 1e-9) continue;
    if (cx - r <= Math.min(a.x, b.x) || cx + r >= Math.max(a.x, b.x)) continue;
    const dir = Math.sign(b.x - a.x);
    const arc = [];
    // from (cx - r·dir... walk the arc into the solid: into +y when the bite comes from below (fromBelow), else into -y
    for (let k = 0; k <= segments; k++) {
      const t = k / segments;
      const ang = dir > 0 ? Math.PI - t * Math.PI : t * Math.PI;   // from the entry side to the exit side
      const y = yEdge + (fromBelow ? 1 : -1) * r * Math.abs(Math.sin(ang));
      arc.push({ x: cx + r * Math.cos(ang), y });
    }
    return [...ring.slice(0, i + 1), ...arc, ...ring.slice(i + 1)];
  }
  return ring;
}

/* ---------- regions ---------- */

const key = (x, y) => `${Math.round(x / Q)},${Math.round(y / Q)}`;

/** Insert, into every ring, every vertex of any ring that lies strictly inside one of its edges, so shared boundaries match vertex for vertex. */
export function splitSharedEdges(regions) {
  const pts = [];
  for (const r of regions) for (const ring of [r.ring, ...(r.holes || [])]) for (const p of ring) pts.push(p);
  const byX = pts.slice().sort((a, b) => a.x - b.x), xs = byX.map(p => p.x);
  const lowerBound = v => { let lo = 0, hi = xs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < v) lo = m + 1; else hi = m; } return lo; };
  const splitRing = ring => {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      out.push(a);
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy; if (len2 < 1e-18) continue;
      const len = Math.sqrt(len2), x0 = Math.min(a.x, b.x) - Q, x1 = Math.max(a.x, b.x) + Q, found = [];
      for (let k = lowerBound(x0); k < xs.length && xs[k] <= x1; k++) {
        const m = byX[k], mx = m.x - a.x, my = m.y - a.y;
        if (Math.abs(dx * my - dy * mx) / len > Q) continue;
        const t = (mx * dx + my * dy) / len2;
        if (t > 1e-7 && t < 1 - 1e-7) found.push([t, m]);
      }
      found.sort((p, q) => p[0] - q[0]);
      let lastKey = key(a.x, a.y);
      for (const [, m] of found) { const k = key(m.x, m.y); if (k !== lastKey && k !== key(b.x, b.y)) { out.push({ x: m.x, y: m.y }); lastKey = k; } }
    }
    return out;
  };
  return regions.map(r => ({ ...r, ring: splitRing(r.ring), holes: (r.holes || []).map(splitRing) }));
}

/** Triangulate an outer ring with holes (earcut, with left-out collinear points stitched back). Wound to face `up`. */
export function triangulateRings(rings, up = true) {
  const data = [], holes = [];
  rings.forEach((r, ri) => { if (ri > 0) holes.push(data.length / 2); r.forEach(p => data.push(p.x, p.y)); });
  const n = data.length / 2;
  const raw = earcut(data, holes.length ? holes : undefined);
  const X = i => data[2 * i], Y = i => data[2 * i + 1];
  const area2 = (a, b, c) => (X(b) - X(a)) * (Y(c) - Y(a)) - (Y(b) - Y(a)) * (X(c) - X(a));
  const byX = Array.from({ length: n }, (_, i) => i).sort((p, q) => X(p) - X(q)), xs = byX.map(X);
  const lowerBound = v => { let lo = 0, hi = xs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < v) lo = m + 1; else hi = m; } return lo; };
  const onSegment = (u, v) => {
    const dx = X(v) - X(u), dy = Y(v) - Y(u), len2 = dx * dx + dy * dy; if (len2 < 1e-18) return null;
    const len = Math.sqrt(len2), x0 = Math.min(X(u), X(v)) - 1e-6, x1 = Math.max(X(u), X(v)) + 1e-6, found = [];
    for (let k = lowerBound(x0); k < xs.length && xs[k] <= x1; k++) {
      const m = byX[k]; if (m === u || m === v) continue;
      const mx = X(m) - X(u), my = Y(m) - Y(u);
      if (Math.abs(dx * my - dy * mx) / len > 1e-6) continue;
      const t = (mx * dx + my * dy) / len2;
      if (t > 1e-9 && t < 1 - 1e-9) found.push([t, m]);
    }
    return found.length ? found.sort((p, q) => p[0] - q[0]).map(([, m]) => m) : null;
  };
  const tris = [];
  const emit = (a, b, c, depth = 0) => {
    if (Math.abs(area2(a, b, c)) < 1e-9) return;
    if (depth < 64) for (const [u, v, w] of [[a, b, c], [b, c, a], [c, a, b]]) {
      const mids = onSegment(u, v); if (!mids) continue;
      let prev = u; for (const m of mids) { emit(w, prev, m, depth + 1); prev = m; } emit(w, prev, v, depth + 1); return;
    }
    tris.push((area2(a, b, c) > 0) === up ? [a, b, c] : [a, c, b]);
  };
  for (let i = 0; i < raw.length; i += 3) emit(raw[i], raw[i + 1], raw[i + 2]);
  return tris;
}

/**
 * The closed solid of a set of regions { z0, z1, ring (ccw), holes (cw) }.
 * Returns { positions, indices } welded, Z up, in the regions' coordinates.
 */
export function sheetMesh(regionsIn) {
  const regions = splitSharedEdges(regionsIn);
  // every directed edge a→b, with the region that owns it
  const owner = new Map();
  const edgeKey = (a, b) => key(a.x, a.y) + '|' + key(b.x, b.y);
  regions.forEach((r, ri) => { for (const ring of [r.ring, ...r.holes]) for (let i = 0; i < ring.length; i++) owner.set(edgeKey(ring[i], ring[(i + 1) % ring.length]), ri); });
  const soup = [];
  const tri = (a, b, c) => soup.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  // every wall is split into bands at the sheet's height levels, so where walls of
  // different ranges meet at a corner their vertical edges coincide band for band
  const levels = [...new Set(regions.flatMap(r => [Math.round(r.z0 / Q) * Q, Math.round(r.z1 / Q) * Q]))].sort((a, b) => a - b);
  const wall = (a, b, zlo, zhi) => {
    if (zhi - zlo <= 1e-9) return;
    const cuts = [zlo, ...levels.filter(z => z > zlo + 1e-9 && z < zhi - 1e-9), zhi];
    for (let i = 0; i + 1 < cuts.length; i++) { const lo = cuts[i], hi = cuts[i + 1]; tri([a.x, a.y, lo], [b.x, b.y, lo], [b.x, b.y, hi]); tri([a.x, a.y, lo], [b.x, b.y, hi], [a.x, a.y, hi]); }
  };
  regions.forEach((r, ri) => {
    const rings = [r.ring, ...r.holes];
    for (const [a, b, c] of triangulateRings(rings, true)) { const P = rings.flat(); tri([P[a].x, P[a].y, r.z1], [P[b].x, P[b].y, r.z1], [P[c].x, P[c].y, r.z1]); }
    for (const [a, b, c] of triangulateRings(rings, false)) { const P = rings.flat(); tri([P[a].x, P[a].y, r.z0], [P[b].x, P[b].y, r.z0], [P[c].x, P[c].y, r.z0]); }
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const other = owner.get(edgeKey(b, a));
      if (other == null || other === ri) { wall(a, b, r.z0, r.z1); continue; }
      const s = regions[other];
      if (r.z1 > s.z1) wall(a, b, Math.max(r.z0, s.z1), r.z1);
      if (r.z0 < s.z0) wall(a, b, r.z0, Math.min(r.z1, s.z0));
    }
  });
  return weld(Float32Array.from(soup), Q);
}

/** Is the point inside the ring (even-odd)? */
export function inside(ring, x, y) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
