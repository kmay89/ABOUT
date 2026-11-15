/**
 * Knurl — subdivision. A CAD mesh has triangles as big as its faces; a
 * texture needs vertices every few tenths of a millimetre. Each textured
 * triangle is split uniformly m × m where m comes from its longest edge,
 * and then the points along each edge are snapped onto n(edge) + 1
 * positions where n depends on that edge alone — so the two triangles
 * sharing an edge put their vertices in the same places and the surface
 * stays closed. Untextured triangles stay whole, unless they share an edge
 * with a textured one: then that edge is split and the triangle becomes a
 * fan from its centroid, which keeps the mesh watertight without spending
 * triangles where nothing moves. A long thin textured triangle (a wall
 * quad cut in two) is laid out as a ruled strip, rows between its two
 * long edges with only as many points across as the row's length needs
 * (rows shorten toward the far vertex, and neighbouring rows with
 * different counts are stitched), so it costs about nShort·nLong
 * triangles instead of nLong² and every triangle stays well shaped.
 * Snapping makes a
 * few zero-area triangles;
 * welding by position removes them. Every new vertex remembers which
 * original triangle it came from.
 */
import { weld } from './mesh.js';

/**
 * Subdivide `mesh` so no edge of a textured triangle is longer than
 * `target` mm, within a budget of about `maxTriangles` (the target grows
 * to fit). `on` is a per-triangle mask of the textured triangles; without
 * it every triangle counts as textured. Returns { mesh, source: Int32Array
 * (original triangle per new triangle), target }.
 */
export function subdivide(mesh, { target = 0.5, maxTriangles = 1200000, on = null } = {}) {
  const { positions: p, indices: ix } = mesh;
  const triCount = ix.length / 3, vcount = p.length / 3;
  const edgeLen = (a, b) => Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
  // which edges need splitting: those of a textured triangle
  const fine = new Set();
  const edgeKey = (a, b) => (a < b ? a * vcount + b : b * vcount + a);
  if (on) for (let t = 0; t < triCount; t++) if (on[t]) { const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2]; fine.add(edgeKey(a, b)); fine.add(edgeKey(b, c)); fine.add(edgeKey(c, a)); }
  const isFine = (a, b) => !on || fine.has(edgeKey(a, b));
  // choose the target so the budget holds
  let t = target;
  for (let attempt = 0; attempt < 12; attempt++) {
    let estimate = 0;
    for (let tri = 0; tri < triCount; tri++) {
      const a = ix[tri * 3], b = ix[tri * 3 + 1], c = ix[tri * 3 + 2];
      const nAB = isFine(a, b) ? Math.ceil(edgeLen(a * 3, b * 3) / t) : 1, nBC = isFine(b, c) ? Math.ceil(edgeLen(b * 3, c * 3) / t) : 1, nCA = isFine(c, a) ? Math.ceil(edgeLen(c * 3, a * 3) / t) : 1;
      if (!on || on[tri]) { const m = Math.max(1, nAB, nBC, nCA), small = Math.min(nAB, nBC, nCA); estimate += m >= 2 * small ? small * m + m : m * m; } else estimate += nAB + nBC + nCA === 3 ? 1 : nAB + nBC + nCA;
    }
    if (estimate <= maxTriangles) break;
    t *= 1.25;
  }
  const segs = len => Math.max(1, Math.ceil(len / t));
  const soup = [], source = [];
  const v = (idx, out) => { out[0] = p[idx]; out[1] = p[idx + 1]; out[2] = p[idx + 2]; };
  const A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0];
  const lerp = (P, Q, s) => [P[0] + (Q[0] - P[0]) * s, P[1] + (Q[1] - P[1]) * s, P[2] + (Q[2] - P[2]) * s];
  for (let tIdx = 0; tIdx < triCount; tIdx++) {
    const a = ix[tIdx * 3], b = ix[tIdx * 3 + 1], c = ix[tIdx * 3 + 2];
    const ia = a * 3, ib = b * 3, ic = c * 3;
    v(ia, A); v(ib, B); v(ic, C);
    const nAB = isFine(a, b) ? segs(edgeLen(ia, ib)) : 1, nBC = isFine(b, c) ? segs(edgeLen(ib, ic)) : 1, nCA = isFine(c, a) ? segs(edgeLen(ic, ia)) : 1;
    if (on && !on[tIdx]) {
      // untextured: whole, or a fan from the centroid over the split edges
      if (nAB + nBC + nCA === 3) { soup.push(...A, ...B, ...C); source.push(tIdx); continue; }
      const G = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
      const ring = [];
      for (let i = 0; i < nAB; i++) ring.push(lerp(A, B, i / nAB));
      for (let i = 0; i < nBC; i++) ring.push(lerp(B, C, i / nBC));
      for (let i = 0; i < nCA; i++) ring.push(lerp(C, A, i / nCA));
      for (let i = 0; i < ring.length; i++) { const P = ring[i], Q = ring[(i + 1) % ring.length]; soup.push(...G, ...P, ...Q); source.push(tIdx); }
      continue;
    }
    const m = Math.max(nAB, nBC, nCA), small = Math.min(nAB, nBC, nCA);
    if (m >= 2 * small) {
      // a ruled strip: rotate so the short edge is AB and C the far vertex
      let P0 = A, P1 = B, P2 = C, n01 = nAB, n12 = nBC, n20 = nCA;
      if (small === nBC) { P0 = B; P1 = C; P2 = A; n01 = nBC; n12 = nCA; n20 = nAB; }
      else if (small === nCA) { P0 = C; P1 = A; P2 = B; n01 = nCA; n12 = nAB; n20 = nBC; }
      const nLong = Math.max(n12, n20);
      // row j runs from the left edge (P0→P2) to the right edge (P1→P2) at height j/nLong, with
      // as many points as its length needs; the last row is the far vertex itself
      const row = j => {
        if (j >= nLong) return [P2];
        const n = Math.max(1, Math.round(n01 * (1 - j / nLong)));
        const s = j / nLong;
        // the interior points lie on the unsnapped row, so neighbouring rows stay parallel;
        // only the two ends move onto their edges' own grids (two rows may then share an end,
        // which costs a degenerate triangle that welding removes, never a sliver)
        const L0 = lerp(P0, P2, s), R0 = lerp(P1, P2, s), out = [];
        out.push(lerp(P0, P2, Math.round(s * n20) / n20));
        for (let k = 1; k < n; k++) out.push(lerp(L0, R0, k / n));
        out.push(lerp(P1, P2, Math.round(s * n12) / n12));
        return out;
      };
      let U = row(0);
      for (let j = 0; j < nLong; j++) {
        const W = row(j + 1), nu = U.length - 1, nw = W.length - 1;
        let i = 0, k = 0;
        while (i < nu || k < nw) {
          if (k === nw || (i < nu && (i + 1) / nu <= (k + 1) / nw)) { soup.push(...U[i], ...U[i + 1], ...W[k]); source.push(tIdx); i++; }
          else { soup.push(...U[i], ...W[k + 1], ...W[k]); source.push(tIdx); k++; }
        }
        U = W;
      }
      continue;
    }
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
