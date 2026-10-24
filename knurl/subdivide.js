/**
 * Knurl — subdivision. A CAD mesh has triangles as big as its faces; a
 * texture needs vertices every half millimetre. Each triangle is split
 * uniformly m × m where m comes from its longest edge, and then the points
 * along each edge are snapped onto n(edge) + 1 positions where n depends
 * on that edge alone — so the two triangles sharing an edge put their
 * vertices in the same places and the surface stays closed. Snapping
 * makes a few zero-area triangles; welding by position removes them.
 * Every new vertex remembers which original triangle it came from.
 */
import { weld } from './mesh.js';

/**
 * Subdivide `mesh` so no edge is longer than `target` mm, within a budget
 * of about `maxTriangles` (the target grows to fit). Returns
 * { mesh, source: Int32Array (original triangle per new triangle), target }.
 */
export function subdivide(mesh, { target = 0.5, maxTriangles = 1200000 } = {}) {
  const { positions: p, indices: ix } = mesh;
  const triCount = ix.length / 3;
  const edgeLen = (a, b) => Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
  // choose the target so the budget holds
  let t = target;
  for (let attempt = 0; attempt < 12; attempt++) {
    let estimate = 0;
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
      const m = Math.max(1, Math.ceil(Math.max(edgeLen(a, b), edgeLen(b, c), edgeLen(c, a)) / t));
      estimate += m * m;
    }
    if (estimate <= maxTriangles) break;
    t *= 1.25;
  }
  const segs = len => Math.max(1, Math.ceil(len / t));
  const soup = [], source = [];
  const v = (idx, out) => { out[0] = p[idx]; out[1] = p[idx + 1]; out[2] = p[idx + 2]; };
  const A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0];
  for (let tIdx = 0; tIdx < triCount; tIdx++) {
    const ia = ix[tIdx * 3] * 3, ib = ix[tIdx * 3 + 1] * 3, ic = ix[tIdx * 3 + 2] * 3;
    v(ia, A); v(ib, B); v(ic, C);
    const nAB = segs(edgeLen(ia, ib)), nBC = segs(edgeLen(ib, ic)), nCA = segs(edgeLen(ic, ia));
    const m = Math.max(nAB, nBC, nCA);
    // a point at barycentric (i, j) of m: P = A + (B-A) i/m + (C-A) j/m; on an
    // edge, snap the parameter to that edge's own count
    const point = (i, j) => {
      let s = i / m, r = j / m;              // weights of B and C
      if (j === 0) { s = Math.round(s * nAB) / nAB; r = 0; }                            // edge AB
      else if (i === 0) { r = Math.round(r * nCA) / nCA; s = 0; }                       // edge CA
      else if (i + j === m) { const q = Math.round(r * nBC) / nBC; r = q; s = 1 - q; } // edge BC
      return [A[0] + (B[0] - A[0]) * s + (C[0] - A[0]) * r, A[1] + (B[1] - A[1]) * s + (C[1] - A[1]) * r, A[2] + (B[2] - A[2]) * s + (C[2] - A[2]) * r];
    };
    for (let j = 0; j < m; j++) for (let i = 0; i + j < m; i++) {
      const p00 = point(i, j), p10 = point(i + 1, j), p01 = point(i, j + 1);
      soup.push(...p00, ...p10, ...p01); source.push(tIdx);
      if (i + j + 1 < m) { const p11 = point(i + 1, j + 1); soup.push(...p10, ...p11, ...p01); source.push(tIdx); }
    }
  }
  // weld, keeping the source of every surviving triangle
  const welded = weldWithSource(Float32Array.from(soup), Int32Array.from(source));
  return { mesh: welded.mesh, source: welded.source, target: t };
}

/** weld() that also carries a per-triangle tag through the degenerate-triangle drop. */
function weldWithSource(soup, tags, quantum = 1e-4) {
  // weld one triangle at a time so we know which survive
  const all = weld(soup, quantum);
  // weld() drops degenerate triangles in order; redo the degeneracy test here to map tags
  const inv = 1 / quantum, q = new Int32Array(9);
  const kept = [];
  for (let t = 0; t < tags.length; t++) {
    for (let c = 0; c < 9; c++) q[c] = Math.round(soup[t * 9 + c] * inv);
    const same = (a, b) => q[a] === q[b] && q[a + 1] === q[b + 1] && q[a + 2] === q[b + 2];
    if (!(same(0, 3) || same(3, 6) || same(0, 6))) kept.push(tags[t]);
  }
  return { mesh: all, source: Int32Array.from(kept) };
}
