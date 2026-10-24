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
  { id: 'walls', name: 'Walls', blurb: 'Faces that stand up: within 30° of vertical, leaning outward no more than 15°.' },
  { id: 'walls-top', name: 'Walls and tops', blurb: 'Everything but faces that look down, and the bottom.' },
  { id: 'top', name: 'Tops only', blurb: 'Faces that look up: within 45° of flat.' },
  { id: 'all', name: 'Everything but the bottom', blurb: 'Undersides too — mind the overhang readout.' },
  { id: 'picked', name: 'Tap to pick', blurb: 'Tap faces in the 3D view to add or remove them. A flat face picks as one; a curved one picks as a strip.' },
]);

export const DEFAULTS = Object.freeze({
  texture: 'knurl', where: 'walls', mapping: 'auto', period: 2.4, depth: 0.5, direction: 'in', angle: 0,
  bottomClear: 1.2, topClear: 0, edgeFade: 1.0, insideWalls: false, target: 0.4, maxTriangles: 1200000, knobs: {},
  bandFrom: 0, bandTo: null, ramp: 'none', pick: null,
});

/**
 * The finest feature of a texture at a repeat, in mm: sample the height
 * field on a fine grid over a few repeats, split it at mid-height, scan it
 * along four directions (rows, columns and both diagonals), take the
 * lower quartile of the run lengths of either phase in each direction,
 * and report the smallest. Below a nozzle's line width (about 0.42 mm)
 * the slicer will merge or drop it. null for a texture that has no field
 * of its own.
 */
export function featureSize(tex, period, knobs = {}) {
  if (!tex || !tex.h || tex.id === 'stamp') return null;
  const k = {}; for (const x of tex.knobs || []) k[x.key] = knobs[x.key] ?? x.value;
  const span = period * 3, N = 240, step = span / N;
  const grid = new Float32Array(N * N);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const h = tex.h((i - N / 2) * step, (j - N / 2) * step, period, k); grid[j * N + i] = h; if (h < lo) lo = h; if (h > hi) hi = h; }
  if (!(hi - lo > 1e-6)) return null;
  const mid = (lo + hi) / 2;
  // only runs that both begin and end at a phase change count (the window's edges would cut the others short)
  const scan = (runs, at, len) => { let run = 0, phase = -1, changes = 0; for (let n = 0; n < len; n++) { const ph = grid[at(n)] >= mid ? 1 : 0; if (ph === phase) run++; else { if (changes >= 2) runs.push(run); changes++; phase = ph; run = 1; } } };
  const quartile = (runs, unit) => { if (runs.length < 8) return Infinity; runs.sort((a, b) => a - b); return runs[Math.floor(runs.length * 0.25)] * unit; };
  const rows = [], cols = [], diag = [], anti = [];
  for (let j = 0; j < N; j += 3) scan(rows, i => j * N + i, N);
  for (let i = 0; i < N; i += 3) scan(cols, j => j * N + i, N);
  for (let s = 0; s < N; s += 4) { scan(diag, n => (s + n) * N + n, N - s); scan(diag, n => n * N + (s + n), N - s); scan(anti, n => (s + n) * N + (N - 1 - n), N - s); scan(anti, n => n * N + (N - 1 - s - n), N - s); }
  const best = Math.min(quartile(rows, step), quartile(cols, step), quartile(diag, step * Math.SQRT2), quartile(anti, step * Math.SQRT2));
  return Number.isFinite(best) ? best : null;
}

/**
 * How thick the part is under its textured faces: from the centroid of a
 * sample of textured triangles, cast a ray inward along the normal and
 * find the first surface it meets. Triangles are bucketed in a uniform
 * grid so a big STL stays quick. Returns { min, median, count } in mm, or
 * null when nothing was hit.
 */
export function wallThickness(mesh, on, { samples = 400, maxDistance = 40 } = {}) {
  const { positions: p, indices: ix } = mesh, n = faceNormals(mesh), count = ix.length / 3;
  const b = bounds(mesh);
  const cells = Math.max(4, Math.min(40, Math.round(Math.cbrt(count / 4))));
  const size = [0, 1, 2].map(i => Math.max(1e-6, b.size[i]) / cells);
  const cellOf = (x, y, z) => [0, 1, 2].map(i => Math.min(cells - 1, Math.max(0, Math.floor(([x, y, z][i] - b.min[i]) / size[i]))));
  const buckets = new Map();
  const key = (cx, cy, cz) => (cx * cells + cy) * cells + cz;
  for (let t = 0; t < count; t++) {
    const a = ix[t * 3] * 3, bb = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const lo = cellOf(Math.min(p[a], p[bb], p[c]), Math.min(p[a + 1], p[bb + 1], p[c + 1]), Math.min(p[a + 2], p[bb + 2], p[c + 2]));
    const hi = cellOf(Math.max(p[a], p[bb], p[c]), Math.max(p[a + 1], p[bb + 1], p[c + 1]), Math.max(p[a + 2], p[bb + 2], p[c + 2]));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const kk = key(x, y, z); const arr = buckets.get(kk); if (arr) arr.push(t); else buckets.set(kk, [t]); }
  }
  // Möller–Trumbore
  const hit = (t, o, d) => {
    const a = ix[t * 3] * 3, bb = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const e1x = p[bb] - p[a], e1y = p[bb + 1] - p[a + 1], e1z = p[bb + 2] - p[a + 2], e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) return Infinity;
    const inv = 1 / det, tx = o[0] - p[a], ty = o[1] - p[a + 1], tz = o[2] - p[a + 2];
    const u = (tx * px + ty * py + tz * pz) * inv; if (u < -1e-6 || u > 1 + 1e-6) return Infinity;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const w = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (w < -1e-6 || u + w > 1 + 1e-6) return Infinity;
    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return dist > 1e-4 ? dist : Infinity;
  };
  const textured = []; for (let t = 0; t < count; t++) if (!on || on[t]) textured.push(t);
  if (!textured.length) return null;
  const stride = Math.max(1, Math.floor(textured.length / samples));
  const found = [];
  for (let s = 0; s < textured.length; s += stride) {
    const t = textured[s];
    const a = ix[t * 3] * 3, bb = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const o = [(p[a] + p[bb] + p[c]) / 3, (p[a + 1] + p[bb + 1] + p[c + 1]) / 3, (p[a + 2] + p[bb + 2] + p[c + 2]) / 3];
    const d = [-n[t * 3], -n[t * 3 + 1], -n[t * 3 + 2]];
    // walk the grid cells along the ray (3D DDA), testing each cell's triangles
    let cell = cellOf(o[0], o[1], o[2]);
    const stepDir = d.map(v => (v > 0 ? 1 : v < 0 ? -1 : 0));
    const tMax = [0, 1, 2].map(i => { if (!stepDir[i]) return Infinity; const edge = b.min[i] + (cell[i] + (stepDir[i] > 0 ? 1 : 0)) * size[i]; return (edge - o[i]) / d[i]; });
    const tDelta = [0, 1, 2].map(i => (stepDir[i] ? size[i] / Math.abs(d[i]) : Infinity));
    let best = Infinity, travelled = 0;
    const tested = new Set();
    while (travelled < maxDistance && best === Infinity) {
      const arr = buckets.get(key(cell[0], cell[1], cell[2]));
      if (arr) for (const tt of arr) { if (tt === t || tested.has(tt)) continue; tested.add(tt); const dist = hit(tt, o, d); if (dist < best) best = dist; }
      const axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      travelled = tMax[axis];
      if (best <= travelled) break;
      cell[axis] += stepDir[axis]; tMax[axis] += tDelta[axis];
      if (cell[axis] < 0 || cell[axis] >= cells) break;
    }
    if (best < maxDistance) found.push(best);
  }
  if (!found.length) return null;
  found.sort((a, b) => a - b);
  return { min: found[0], median: found[Math.floor(found.length / 2)], count: found.length };
}

/**
 * Smooth regions: triangles joined across an edge whose normals agree
 * within `angle` degrees share an id, so a flat face is one region and a
 * finely faceted cylinder (steps under the angle) is one region too,
 * while a crease stops the fill. Returns { id, count, area }.
 */
export function regions(mesh, angle = 8) {
  const { indices: ix } = mesh, n = faceNormals(mesh), count = ix.length / 3;
  const vcount = mesh.positions.length / 3;
  const edges = new Map();
  for (let t = 0; t < count; t++) for (let k = 0; k < 3; k++) {
    const a = ix[t * 3 + k], b = ix[t * 3 + (k + 1) % 3];
    const key = a < b ? a * vcount + b : b * vcount + a;
    const e = edges.get(key); if (e) e.push(t); else edges.set(key, [t]);
  }
  const adj = Array.from({ length: count }, () => []);
  for (const ts of edges.values()) for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) { adj[ts[i]].push(ts[j]); adj[ts[j]].push(ts[i]); }
  const id = new Int32Array(count).fill(-1), cosA = Math.cos(angle * Math.PI / 180);
  let next = 0;
  const { positions: p } = mesh;
  const triArea = t => { const a = ix[t * 3] * 3, b = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3; const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]; return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; };
  const areas = [];
  for (let s = 0; s < count; s++) {
    if (id[s] >= 0) continue;
    const r = next++; id[s] = r; let area = triArea(s);
    const stack = [s];
    while (stack.length) {
      const t = stack.pop();
      for (const u of adj[t]) {
        if (id[u] >= 0) continue;
        const d = n[t * 3] * n[u * 3] + n[t * 3 + 1] * n[u * 3 + 1] + n[t * 3 + 2] * n[u * 3 + 2];
        if (d >= cosA) { id[u] = r; area += triArea(u); stack.push(u); }
      }
    }
    areas.push(area);
  }
  return { id, count: next, area: Float32Array.from(areas) };
}

/**
 * The depth that brings an overhang of `angle` degrees down to `target`:
 * on a wall the slope is proportional to depth, so scale by the tangents.
 * Never below 0.05 mm; never up.
 */
export function tuneDepth(depth, angle, target = 42) {
  if (!(angle > target) || !(depth > 0)) return depth;
  const scaled = depth * Math.tan(target * Math.PI / 180) / Math.tan(Math.min(angle, 89) * Math.PI / 180);
  return Math.max(0.05, Math.round(scaled * 20) / 20);
}

/**
 * Classify every original triangle: 0 none (bottom or excluded), 1 textured.
 * Also returns per-triangle class names for the page.
 */
export function classify(mesh, where, { bottomTolerance = 0.05, insideWalls = false, pick = null } = {}) {
  const n = faceNormals(mesh), b = bounds(mesh), { positions: p, indices: ix } = mesh;
  const count = ix.length / 3;
  const on = new Uint8Array(count), kind = new Uint8Array(count), inward = new Uint8Array(count); // kind: 0 bottom, 1 wall, 2 top, 3 underside
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  for (let t = 0; t < count; t++) {
    const nz = n[t * 3 + 2];
    const a = ix[t * 3] * 3, bb = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const zmin = Math.min(p[a + 2], p[bb + 2], p[c + 2]);
    const isBottom = nz < -0.7 && zmin <= b.min[2] + bottomTolerance;
    // a wall stands within 30° of vertical but leans outward (downward-facing) by no more than 15°:
    // texturing a face that already overhangs only makes it worse
    const k = isBottom ? 0 : nz < -0.26 ? 3 : Math.abs(nz) < 0.5 ? 1 : nz > 0 ? 2 : 3;
    kind[t] = k;
    // a wall whose normal points toward the part's axis is an inside wall (the inside of a cup)
    const mx = (p[a] + p[bb] + p[c]) / 3 - cx, my = (p[a + 1] + p[bb + 1] + p[c + 1]) / 3 - cy;
    inward[t] = k === 1 && (mx * n[t * 3] + my * n[t * 3 + 1]) < -0.3 * (Math.hypot(mx, my) || 1) ? 1 : 0;
    const wall = k === 1 && !(inward[t] && !insideWalls);
    on[t] = k === 0 ? 0 : where === 'picked' ? (pick && pick[t] ? 1 : 0) : where === 'walls' ? (wall ? 1 : 0) : where === 'walls-top' ? (wall || k === 2 ? 1 : 0) : where === 'top' ? (k === 2 ? 1 : 0) : (k === 1 ? (wall ? 1 : 0) : 1);
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
  const cls = classify(mesh, o.where, { insideWalls: o.insideWalls, pick: o.pick });
  const anyOn = cls.on.some(v => v);
  if (!anyOn || o.depth <= 0) return { mesh, stats: stats(mesh, cls.bounds), mapping: o.mapping, textured: 0, source: null, on: cls.on };
  const sub = subdivide(mesh, { target: Math.min(o.target, o.period / 6), maxTriangles: o.maxTriangles, on: cls.on });
  const { positions: p, indices: ix } = sub.mesh;
  const vcount = p.length / 3;
  const b = cls.bounds;
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  const mapping = o.mapping === 'auto' ? (roundness(mesh, cls) > 0.6 ? 'around' : 'flat') : o.mapping;
  // Per vertex: is every face around it textured? (else it is on a texture
  // boundary and stays put), which way does its textured face point, which
  // axis dominates for the flat mapping, and the mean wall radius for the wrap.
  const allOn = new Uint8Array(vcount).fill(1), anyOnV = new Uint8Array(vcount), texCount = new Uint16Array(vcount);
  const texNormal = new Float32Array(vcount * 3), axisVotes = new Float32Array(vcount * 3);
  let rSum = 0, rN = 0;
  const n = cls.normals;
  for (let t = 0; t < ix.length / 3; t++) {
    const src = sub.source[t];
    const w = cls.on[src];
    for (let k = 0; k < 3; k++) {
      const v = ix[t * 3 + k];
      if (!w) allOn[v] = 0; else { anyOnV[v] = 1; texCount[v]++; texNormal[v * 3] += n[src * 3]; texNormal[v * 3 + 1] += n[src * 3 + 1]; texNormal[v * 3 + 2] += n[src * 3 + 2]; }
      axisVotes[v * 3] += Math.abs(n[src * 3]); axisVotes[v * 3 + 1] += Math.abs(n[src * 3 + 1]); axisVotes[v * 3 + 2] += Math.abs(n[src * 3 + 2]);
    }
    if (w && cls.kind[src] === 1) for (let k = 0; k < 3; k++) { const v = ix[t * 3 + k] * 3; rSum += Math.hypot(p[v] - cx, p[v + 1] - cy); rN++; }
  }
  // a sharp crease between textured faces (the top edge of a box) is a
  // boundary too: its vertices stay put and the texture fades in from it,
  // so the edge stays crisp and no triangle there leans past the pattern's slope
  for (let v = 0; v < vcount; v++) {
    if (!allOn[v] || texCount[v] < 2) continue;
    const l = Math.hypot(texNormal[v * 3], texNormal[v * 3 + 1], texNormal[v * 3 + 2]) / texCount[v];
    if (l < 0.866) allOn[v] = 0;   // the mean of the unit normals is short when they disagree by more than about 30°
  }
  const R = rN ? rSum / rN : 1;
  // distance from every textured vertex to the nearest texture boundary,
  // along the mesh's edges, so the texture fades in over edgeFade mm
  const weight = fadeFromBoundary(ix, vcount, allOn, anyOnV, o.edgeFade, p);
  // a period that fits a whole number of times around, so the seam closes
  let period = o.period;
  if (mapping === 'around') { const nAround = Math.max(3, Math.round(2 * Math.PI * R / period)); period = 2 * Math.PI * R / nAround; }
  const out = new Float32Array(p);
  const ca = Math.cos(o.angle * Math.PI / 180), sa = Math.sin(o.angle * Math.PI / 180);
  const zmin = b.min[2], zmax = b.max[2];
  const sign = o.direction === 'out' ? 1 : -1;
  // a height band: the texture lives between bandFrom and bandTo above the plate, fading in over the edge-fade distance
  const z0 = zmin + Math.max(0, o.bandFrom || 0), z1 = o.bandTo == null ? zmax : Math.min(zmax, zmin + o.bandTo);
  const bandFade = Math.max(0.3, o.edgeFade);
  const banded = z0 > zmin + 1e-6 || z1 < zmax - 1e-6;
  // (u, v) per vertex, with u running to the right as the face is seen from
  // outside, so a stamp reads the right way round on every wall
  const uvOf = v => {
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
    const ax = axisVotes[v * 3], ay = axisVotes[v * 3 + 1], az = axisVotes[v * 3 + 2];
    let u, vv;
    if (mapping === 'around' && az < Math.max(ax, ay)) { u = Math.atan2(y - cy, x - cx) * R; vv = z; }
    else if (az >= ax && az >= ay) { u = texNormal[v * 3 + 2] >= 0 ? x : -x; vv = y; }
    else if (ax >= ay) { u = texNormal[v * 3] >= 0 ? y : -y; vv = z; }
    else { u = texNormal[v * 3 + 1] >= 0 ? -x : x; vv = z; }
    return [u * ca - vv * sa, u * sa + vv * ca];
  };
  // a stamp placed once sits at the centre of the textured faces' (u, v) box
  if (tex.id === 'stamp' && !o.knobs.tile && o.knobs.raster) {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let v = 0; v < vcount; v++) { if (weight[v] <= 0) continue; const [uu, vv] = uvOf(v); if (uu < u0) u0 = uu; if (uu > u1) u1 = uu; if (vv < v0) v0 = vv; if (vv > v1) v1 = vv; }
    o.knobs = { ...o.knobs, cu: (u0 + u1) / 2, cv: (v0 + v1) / 2 };
  }
  for (let v = 0; v < vcount; v++) {
    let w = weight[v];
    if (w <= 0) continue;
    const z = p[v * 3 + 2];
    if (o.bottomClear > 0) w *= smooth((z - zmin - 0.2) / o.bottomClear);
    if (o.topClear > 0) w *= smooth((zmax - z) / o.topClear);
    if (banded) w *= smooth((z - z0) / bandFade) * smooth((z1 - z) / bandFade);
    if (w <= 0) continue;
    let nx = texNormal[v * 3], ny = texNormal[v * 3 + 1], nz = texNormal[v * 3 + 2];
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const [ur, vr] = uvOf(v);
    const h = tex.h(ur, vr, period, o.knobs);               // 1 = original surface, 0 = full depth
    let depth = o.depth;
    if (o.ramp === 'up' || o.ramp === 'down') {            // ombré: the depth grows along the band
      const t = Math.min(1, Math.max(0, (z - z0) / Math.max(1e-6, z1 - z0)));
      depth *= o.ramp === 'up' ? t : 1 - t;
    }
    const d = sign < 0 ? -(1 - h) * depth : h * depth;     // cut in: valleys recede; raise out: peaks stand proud
    out[v * 3] += nx * d * w; out[v * 3 + 1] += ny * d * w; out[v * 3 + 2] += nz * d * w;
  }
  const result = { positions: out, indices: ix };
  let texturedCount = 0; for (let v = 0; v < vcount; v++) if (weight[v] > 0) texturedCount++;
  const textured = texturedCount / vcount;
  return { mesh: result, stats: { ...stats(result, b), period, target: sub.target }, mapping, textured, source: sub.source, on: cls.on };
}

function smooth(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }

/**
 * Per-vertex weight 0..1: 0 on and outside a texture boundary, rising to 1
 * `fade` mm in, by distance along the mesh's edges (a breadth-first
 * sweep from the boundary with edge lengths, then two relaxations, which
 * is within a few percent of the geodesic distance on these fine meshes).
 */
function fadeFromBoundary(ix, vcount, allOn, anyOnV, fade, p) {
  const weight = new Float32Array(vcount);
  const dist = new Float32Array(vcount).fill(Infinity);
  let frontier = [];
  for (let v = 0; v < vcount; v++) if (anyOnV[v] && !allOn[v]) { dist[v] = 0; frontier.push(v); }
  if (!frontier.length) { for (let v = 0; v < vcount; v++) weight[v] = anyOnV[v]; return weight; }
  // adjacency once
  const deg = new Int32Array(vcount + 1);
  for (let i = 0; i < ix.length; i++) deg[ix[i] + 1] += 2;
  for (let v = 0; v < vcount; v++) deg[v + 1] += deg[v];
  const adj = new Int32Array(deg[vcount]), fill = Int32Array.from(deg.subarray(0, vcount));
  for (let t = 0; t < ix.length; t += 3) for (let k = 0; k < 3; k++) { const a = ix[t + k], b = ix[t + (k + 1) % 3]; adj[fill[a]++] = b; adj[fill[b]++] = a; }
  const len = (a, b) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
  const limit = fade * 1.5, touched = [];
  const seen = new Uint8Array(vcount);
  for (const v of frontier) seen[v] = 1;
  while (frontier.length) {
    const next = [];
    for (const v of frontier) for (let e = deg[v]; e < deg[v + 1]; e++) {
      const u = adj[e]; if (!allOn[u]) continue;
      const d = dist[v] + len(v, u);
      if (d < dist[u]) { dist[u] = d; if (!seen[u]) { seen[u] = 1; if (d < limit) { next.push(u); touched.push(u); } } }
    }
    frontier = next;
  }
  for (let pass = 0; pass < 2; pass++) for (const v of touched) for (let e = deg[v]; e < deg[v + 1]; e++) { const u = adj[e]; const d = dist[u] + len(u, v); if (d < dist[v]) dist[v] = d; }
  for (let v = 0; v < vcount; v++) {
    if (!anyOnV[v]) continue;
    if (!allOn[v]) continue;                                  // a boundary vertex stays put
    weight[v] = dist[v] >= fade ? 1 : smooth(dist[v] / Math.max(fade, 1e-6));
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
