/**
 * Knurl — applying a texture. Faces are sorted by the way they point
 * (walls, tops, undersides, the bottom that touches the plate), the mesh
 * is subdivided, each vertex gets surface coordinates (u, v) in mm — by
 * the dominant axis of its face, or wrapped around the part's axis for
 * round things — and is moved along its normal by the texture's height,
 * inward by default so the part still fits where it did. The result's
 * steepest overhang is measured so the page can say whether it prints.
 */
import { bounds, faceNormals, vertexNormals, signedVolume } from './mesh.js';
import { subdivide } from './subdivide.js';
import { textureById } from './textures.js';

export const WHERE = Object.freeze([
  { id: 'walls', name: 'Walls', blurb: 'Faces that stand up: within 30° of vertical.' },
  { id: 'walls-top', name: 'Walls and tops', blurb: 'Everything but faces that look down, and the bottom.' },
  { id: 'top', name: 'Tops only', blurb: 'Faces that look up: within 45° of flat.' },
  { id: 'all', name: 'Everything but the bottom', blurb: 'Undersides too — mind the overhang readout.' },
]);

export const DEFAULTS = Object.freeze({
  texture: 'knurl', where: 'walls', mapping: 'auto', period: 2.4, depth: 0.5, direction: 'in', angle: 0,
  bottomClear: 1.2, topClear: 0, edgeFade: 1.0, insideWalls: false, target: 0.5, maxTriangles: 1200000, knobs: {},
});

/**
 * Classify every original triangle: 0 none (bottom or excluded), 1 textured.
 * Also returns per-triangle class names for the page.
 */
export function classify(mesh, where, { bottomTolerance = 0.05, insideWalls = false } = {}) {
  const n = faceNormals(mesh), b = bounds(mesh), { positions: p, indices: ix } = mesh;
  const count = ix.length / 3;
  const on = new Uint8Array(count), kind = new Uint8Array(count), inward = new Uint8Array(count); // kind: 0 bottom, 1 wall, 2 top, 3 underside
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  for (let t = 0; t < count; t++) {
    const nz = n[t * 3 + 2];
    const a = ix[t * 3] * 3, bb = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const zmin = Math.min(p[a + 2], p[bb + 2], p[c + 2]);
    const isBottom = nz < -0.7 && zmin <= b.min[2] + bottomTolerance;
    const k = isBottom ? 0 : Math.abs(nz) < 0.5 ? 1 : nz > 0 ? 2 : 3;
    kind[t] = k;
    // a wall whose normal points toward the part's axis is an inside wall (the inside of a cup)
    const mx = (p[a] + p[bb] + p[c]) / 3 - cx, my = (p[a + 1] + p[bb + 1] + p[c + 1]) / 3 - cy;
    inward[t] = k === 1 && (mx * n[t * 3] + my * n[t * 3 + 1]) < -0.3 * (Math.hypot(mx, my) || 1) ? 1 : 0;
    const wall = k === 1 && !(inward[t] && !insideWalls);
    on[t] = k === 0 ? 0 : where === 'walls' ? (wall ? 1 : 0) : where === 'walls-top' ? (wall || k === 2 ? 1 : 0) : where === 'top' ? (k === 2 ? 1 : 0) : (k === 1 ? (wall ? 1 : 0) : 1);
  }
  return { on, kind, inward, bounds: b, normals: n };
}

/** Is the part round about a vertical axis? (For the mapping's auto choice.) The share of wall normals pointing away from the centre. */
export function roundness(mesh, cls) {
  const { positions: p, indices: ix } = mesh, n = cls.normals, b = cls.bounds;
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  let radial = 0, total = 0;
  for (let t = 0; t < cls.kind.length; t++) {
    if (cls.kind[t] !== 1) continue;
    const a = ix[t * 3] * 3, bb = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const mx = (p[a] + p[bb] + p[c]) / 3 - cx, my = (p[a + 1] + p[bb + 1] + p[c + 1]) / 3 - cy;
    const l = Math.hypot(mx, my) || 1, hl = Math.hypot(n[t * 3], n[t * 3 + 1]) || 1;
    const dot = ((mx / l) * n[t * 3] + (my / l) * n[t * 3 + 1]) / hl;  // the normal's horizontal part vs the radial direction
    total++;
    if (Math.abs(dot) > 0.95) radial++;
  }
  return total ? radial / total : 0;
}

/**
 * Apply. Returns { mesh, stats: { triangles, overhang, textured, period }, mapping }.
 */
export function applyTexture(mesh, options = {}) {
  const o = { ...DEFAULTS, ...options, knobs: { ...options.knobs } };
  const tex = textureById(o.texture);
  for (const knob of tex.knobs) if (!(knob.key in o.knobs)) o.knobs[knob.key] = knob.value;
  const cls = classify(mesh, o.where, { insideWalls: o.insideWalls });
  const anyOn = cls.on.some(v => v);
  if (!anyOn || o.depth <= 0) return { mesh, stats: stats(mesh, cls.bounds), mapping: o.mapping, textured: 0 };
  const sub = subdivide(mesh, { target: Math.min(o.target, o.period / 5), maxTriangles: o.maxTriangles });
  const { positions: p, indices: ix } = sub.mesh;
  const vcount = p.length / 3;
  const b = cls.bounds;
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  const mapping = o.mapping === 'auto' ? (roundness(mesh, cls) > 0.6 ? 'around' : 'flat') : o.mapping;
  // Per vertex: is every face around it textured? (else it is on a texture
  // boundary and stays put), which way does its textured face point, which
  // axis dominates for the flat mapping, and the mean wall radius for the wrap.
  const allOn = new Uint8Array(vcount).fill(1), anyOnV = new Uint8Array(vcount);
  const texNormal = new Float32Array(vcount * 3), axisVotes = new Float32Array(vcount * 3);
  let rSum = 0, rN = 0;
  const n = cls.normals;
  for (let t = 0; t < ix.length / 3; t++) {
    const src = sub.source[t];
    const w = cls.on[src];
    for (let k = 0; k < 3; k++) {
      const v = ix[t * 3 + k];
      if (!w) allOn[v] = 0; else { anyOnV[v] = 1; texNormal[v * 3] += n[src * 3]; texNormal[v * 3 + 1] += n[src * 3 + 1]; texNormal[v * 3 + 2] += n[src * 3 + 2]; }
      axisVotes[v * 3] += Math.abs(n[src * 3]); axisVotes[v * 3 + 1] += Math.abs(n[src * 3 + 1]); axisVotes[v * 3 + 2] += Math.abs(n[src * 3 + 2]);
    }
    if (w && cls.kind[src] === 1) for (let k = 0; k < 3; k++) { const v = ix[t * 3 + k] * 3; rSum += Math.hypot(p[v] - cx, p[v + 1] - cy); rN++; }
  }
  const R = rN ? rSum / rN : 1;
  // distance from every textured vertex to the nearest texture boundary, in
  // hops of about one edge length, so the texture fades in over edgeFade mm
  const weight = fadeFromBoundary(ix, vcount, allOn, anyOnV, o.edgeFade, sub.target);
  // a period that fits a whole number of times around, so the seam closes
  let period = o.period;
  if (mapping === 'around') { const nAround = Math.max(3, Math.round(2 * Math.PI * R / period)); period = 2 * Math.PI * R / nAround; }
  const out = new Float32Array(p);
  const ca = Math.cos(o.angle * Math.PI / 180), sa = Math.sin(o.angle * Math.PI / 180);
  const zmin = b.min[2], zmax = b.max[2];
  const sign = o.direction === 'out' ? 1 : -1;
  for (let v = 0; v < vcount; v++) {
    let w = weight[v];
    if (w <= 0) continue;
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
    if (o.bottomClear > 0) w *= smooth((z - zmin - 0.2) / o.bottomClear);
    if (o.topClear > 0) w *= smooth((zmax - z) / o.topClear);
    if (w <= 0) continue;
    let nx = texNormal[v * 3], ny = texNormal[v * 3 + 1], nz = texNormal[v * 3 + 2];
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let u, vv;
    const ax = axisVotes[v * 3], ay = axisVotes[v * 3 + 1], az = axisVotes[v * 3 + 2];
    if (mapping === 'around' && az < Math.max(ax, ay)) { u = Math.atan2(y - cy, x - cx) * R; vv = z; }
    else if (az >= ax && az >= ay) { u = x; vv = y; }
    else if (ax >= ay) { u = y; vv = z; }
    else { u = x; vv = z; }
    const ur = u * ca - vv * sa, vr = u * sa + vv * ca;
    const h = tex.h(ur, vr, period, o.knobs);               // 1 = original surface, 0 = full depth
    const d = sign < 0 ? -(1 - h) * o.depth : h * o.depth; // cut in: valleys recede; raise out: peaks stand proud
    out[v * 3] += nx * d * w; out[v * 3 + 1] += ny * d * w; out[v * 3 + 2] += nz * d * w;
  }
  const result = { positions: out, indices: ix };
  let texturedCount = 0; for (let v = 0; v < vcount; v++) if (weight[v] > 0) texturedCount++;
  const textured = texturedCount / vcount;
  return { mesh: result, stats: { ...stats(result, b), period, target: sub.target }, mapping, textured };
}

function smooth(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }

/**
 * Per-vertex weight 0..1: 0 on and outside a texture boundary, rising to 1
 * `fade` mm in, measured in hops along edges of about `step` mm.
 */
function fadeFromBoundary(ix, vcount, allOn, anyOnV, fade, step) {
  const weight = new Float32Array(vcount);
  const hops = Math.max(1, Math.ceil(fade / Math.max(step, 1e-6)));
  const dist = new Int32Array(vcount).fill(-1);
  let frontier = [];
  for (let v = 0; v < vcount; v++) if (anyOnV[v] && !allOn[v]) { dist[v] = 0; frontier.push(v); }
  if (!frontier.length) { for (let v = 0; v < vcount; v++) weight[v] = anyOnV[v]; return weight; }
  // adjacency once
  const deg = new Int32Array(vcount + 1);
  for (let i = 0; i < ix.length; i++) deg[ix[i] + 1] += 2;
  for (let v = 0; v < vcount; v++) deg[v + 1] += deg[v];
  const adj = new Int32Array(deg[vcount]), fill = Int32Array.from(deg.subarray(0, vcount));
  for (let t = 0; t < ix.length; t += 3) for (let k = 0; k < 3; k++) { const a = ix[t + k], b = ix[t + (k + 1) % 3]; adj[fill[a]++] = b; adj[fill[b]++] = a; }
  for (let d = 1; d <= hops && frontier.length; d++) {
    const next = [];
    for (const v of frontier) for (let e = deg[v]; e < deg[v + 1]; e++) { const u = adj[e]; if (dist[u] < 0 && allOn[u]) { dist[u] = d; next.push(u); } }
    frontier = next;
  }
  for (let v = 0; v < vcount; v++) {
    if (!anyOnV[v]) continue;
    if (!allOn[v]) continue;                                  // a boundary vertex stays put
    weight[v] = dist[v] < 0 ? 1 : smooth(dist[v] / hops);
  }
  return weight;
}

/**
 * Triangle count, volume, the steepest overhang (degrees from vertical,
 * among triangles of real size) above the plate, and how much surface
 * area overhangs more than 50°.
 */
export function stats(mesh, b = bounds(mesh)) {
  const n = faceNormals(mesh), { positions: p, indices: ix } = mesh;
  let worst = 0, steepArea = 0;
  for (let t = 0; t < ix.length / 3; t++) {
    const nz = n[t * 3 + 2];
    if (nz >= -0.05) continue;
    const a = ix[t * 3] * 3, bb = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const zmax = Math.max(p[a + 2], p[bb + 2], p[c + 2]);
    if (zmax <= b.min[2] + 0.05) continue;       // the bottom itself (a chamfer rising from the plate still counts)
    const ux = p[bb] - p[a], uy = p[bb + 1] - p[a + 1], uz = p[bb + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    if (area < 0.01) continue;                    // slivers from the subdivision carry no weight
    const angle = Math.asin(Math.min(1, -nz)) * 180 / Math.PI;  // 0 = vertical wall, 90 = flat underside
    if (angle > worst) worst = angle;
    if (angle > 50) steepArea += area;
  }
  return { triangles: ix.length / 3, volume: signedVolume(mesh), overhang: worst, steepArea, size: b.size };
}
