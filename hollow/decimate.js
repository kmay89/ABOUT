/**
 * Hollow — mesh decimation by quadric error metrics (Garland & Heckbert),
 * run the fast way (after Forstmann): no priority queue, just passes over
 * the triangles with a rising error threshold, collapsing every edge that is
 * cheap enough and has not already been touched in this pass.
 *
 * Surface extraction turns a flat mold face into hundreds of thousands of
 * tiny triangles. Each vertex carries the sum of squared distances to the
 * planes of its faces; collapsing an edge whose combined quadric is (near)
 * zero costs nothing, so flat regions fold up into a few large triangles
 * while curved ones stay within `tolerance` millimetres of where they were.
 * Every collapse is checked so the mesh stays a closed manifold: the link
 * condition rejects collapses that would pinch the surface, and a normal
 * test rejects any that would fold a face over.
 *
 * No DOM, no third-party code.
 */

const MAX_DEGREE = 40;

/**
 * @param mesh {positions, indices}
 * @param options.tolerance maximum error in mm (default 0.02)
 * @param options.maxTriangles keep collapsing past the tolerance until under this many triangles
 * @returns a new mesh
 */
export function decimate(mesh, { tolerance = 0.02, maxTriangles = Infinity, passes = 10 } = {}) {
  const V = mesh.positions.length / 3;
  let F = mesh.indices.length / 3;
  const pos = Float64Array.from(mesh.positions);
  const tris = Int32Array.from(mesh.indices);
  let deleted = new Uint8Array(F);
  let dirty = new Uint8Array(F);
  const Q = new Float64Array(V * 10);
  const vArea = new Float64Array(V);
  const normals = new Float64Array(F * 3);

  /** Unit normal of face f, or all zeros for a sliver whose direction cannot be trusted. Returns twice the area. */
  const faceNormal = (f) => {
    const a = tris[f * 3], b = tris[f * 3 + 1], c = tris[f * 3 + 2];
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    const wx = pos[c * 3] - pos[b * 3], wy = pos[c * 3 + 1] - pos[b * 3 + 1], wz = pos[c * 3 + 2] - pos[b * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    const longest = Math.max(ux * ux + uy * uy + uz * uz, vx * vx + vy * vy + vz * vz, wx * wx + wy * wy + wz * wz);
    if (!(l > 1e-4 * longest)) { normals[f * 3] = normals[f * 3 + 1] = normals[f * 3 + 2] = 0; return l; }
    normals[f * 3] = nx / l; normals[f * 3 + 1] = ny / l; normals[f * 3 + 2] = nz / l;
    return l;
  };
  // Quadrics, weighted by area: the extraction leaves slivers whose normals are noise, and
  // weighting lets them count for as little as they are.
  const addPlane = (f) => {
    const l = faceNormal(f);
    const nx = normals[f * 3], ny = normals[f * 3 + 1], nz = normals[f * 3 + 2];
    if (nx === 0 && ny === 0 && nz === 0) return;
    const a = tris[f * 3], b = tris[f * 3 + 1], c = tris[f * 3 + 2];
    const area = l / 2;
    const d = -(nx * pos[a * 3] + ny * pos[a * 3 + 1] + nz * pos[a * 3 + 2]);
    for (const v of [a, b, c]) {
      const o = v * 10;
      Q[o] += area * nx * nx; Q[o + 1] += area * nx * ny; Q[o + 2] += area * nx * nz; Q[o + 3] += area * nx * d;
      Q[o + 4] += area * ny * ny; Q[o + 5] += area * ny * nz; Q[o + 6] += area * ny * d;
      Q[o + 7] += area * nz * nz; Q[o + 8] += area * nz * d; Q[o + 9] += area * d * d;
      vArea[v] += area / 3;
    }
  };
  for (let f = 0; f < F; f++) addPlane(f);

  // vertex → (triangle, corner) references, rebuilt each pass
  const refStart = new Int32Array(V + 1), refCount = new Int32Array(V);
  let refs = new Int32Array(F * 3);
  const fill = new Int32Array(V);
  const rebuildRefs = () => {
    // compact deleted triangles first
    let w = 0;
    for (let f = 0; f < F; f++) {
      if (deleted[f]) continue;
      if (w !== f) {
        tris[w * 3] = tris[f * 3]; tris[w * 3 + 1] = tris[f * 3 + 1]; tris[w * 3 + 2] = tris[f * 3 + 2];
        normals[w * 3] = normals[f * 3]; normals[w * 3 + 1] = normals[f * 3 + 1]; normals[w * 3 + 2] = normals[f * 3 + 2];
      }
      w++;
    }
    F = w;
    deleted = new Uint8Array(F); dirty = new Uint8Array(F);
    refCount.fill(0);
    for (let f = 0; f < F; f++) { refCount[tris[f * 3]]++; refCount[tris[f * 3 + 1]]++; refCount[tris[f * 3 + 2]]++; }
    refStart[0] = 0;
    for (let v = 0; v < V; v++) refStart[v + 1] = refStart[v] + refCount[v];
    fill.fill(0);
    for (let f = 0; f < F; f++) for (let k = 0; k < 3; k++) {
      const v = tris[f * 3 + k];
      refs[refStart[v] + fill[v]++] = f * 3 + k;
    }
  };
  // Live references of a vertex live in [refStart[v], refStart[v] + refCount[v]); after a
  // collapse the merged vertex's references are appended at the end of `refs`.
  let refEnd = F * 3;
  const appendRefs = (v, list) => {
    if (refEnd + list.length > refs.length) { const bigger = new Int32Array(Math.max(refs.length * 2, refEnd + list.length)); bigger.set(refs); refs = bigger; }
    refStart[v] = refEnd; refCount[v] = list.length;
    for (const r of list) refs[refEnd++] = r;
  };

  const sum = new Float64Array(10);
  const best = [0, 0, 0];
  const evalSum = (x, y, z) =>
    sum[0] * x * x + 2 * sum[1] * x * y + 2 * sum[2] * x * z + 2 * sum[3] * x
    + sum[4] * y * y + 2 * sum[5] * y * z + 2 * sum[6] * y + sum[7] * z * z + 2 * sum[8] * z + sum[9];
  /** Cost of collapsing (a,b); writes the best position into `best`. */
  const edgeCost = (a, b) => {
    for (let i = 0; i < 10; i++) sum[i] = Q[a * 10 + i] + Q[b * 10 + i];
    const q0 = sum[0], q1 = sum[1], q2 = sum[2], q3 = sum[3], q4 = sum[4], q5 = sum[5], q6 = sum[6], q7 = sum[7], q8 = sum[8];
    const det = q0 * (q4 * q7 - q5 * q5) - q1 * (q1 * q7 - q5 * q2) + q2 * (q1 * q5 - q4 * q2);
    const scale = Math.max(Math.abs(q0), Math.abs(q4), Math.abs(q7), 1e-12);
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2], bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
    const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
    let bestCost = Infinity;
    if (Math.abs(det) > 1e-9 * scale * scale * scale) {
      const inv = 1 / det;
      const x = -(q3 * (q4 * q7 - q5 * q5) - q1 * (q6 * q7 - q5 * q8) + q2 * (q6 * q5 - q4 * q8)) * inv;
      const y = -(q0 * (q6 * q7 - q5 * q8) - q3 * (q1 * q7 - q5 * q2) + q2 * (q1 * q8 - q6 * q2)) * inv;
      const z = -(q0 * (q4 * q8 - q6 * q5) - q1 * (q1 * q8 - q6 * q2) + q3 * (q1 * q5 - q4 * q2)) * inv;
      // keep the solution near the edge; a far one means the system was nearly singular
      const span = Math.hypot(ax - bx, ay - by, az - bz) + tolerance;
      if (Math.hypot(x - mx, y - my, z - mz) <= 2 * span) { bestCost = evalSum(x, y, z); best[0] = x; best[1] = y; best[2] = z; }
    }
    // Fallbacks for a singular system (a plane, a crease): the midpoint first, so a flat
    // region — where all three cost nothing — meets in the middle; then either end,
    // which keeps a crease sharp.
    let cost = evalSum(mx, my, mz);
    if (cost < bestCost - 1e-12) { bestCost = cost; best[0] = mx; best[1] = my; best[2] = mz; }
    cost = evalSum(ax, ay, az);
    if (cost < bestCost - 1e-12) { bestCost = cost; best[0] = ax; best[1] = ay; best[2] = az; }
    cost = evalSum(bx, by, bz);
    if (cost < bestCost - 1e-12) { bestCost = cost; best[0] = bx; best[1] = by; best[2] = bz; }
    return Math.max(bestCost, 0);
  };

  /** Would moving vertex `moved` to (px,py,pz) fold or flatten any of its faces not shared with `other`? */
  const flips = (moved, other, px, py, pz) => {
    const start = refStart[moved], end = start + refCount[moved];
    for (let r = start; r < end; r++) {
      const ref = refs[r], f = ref / 3 | 0;
      if (deleted[f]) continue;
      const k = ref % 3;
      const i1 = tris[f * 3 + (k + 1) % 3], i2 = tris[f * 3 + (k + 2) % 3];
      if (i1 === other || i2 === other) continue; // this face disappears
      const d1x = pos[i1 * 3] - px, d1y = pos[i1 * 3 + 1] - py, d1z = pos[i1 * 3 + 2] - pz;
      const d2x = pos[i2 * 3] - px, d2y = pos[i2 * 3 + 1] - py, d2z = pos[i2 * 3 + 2] - pz;
      const nx = d1y * d2z - d1z * d2y, ny = d1z * d2x - d1x * d2z, nz = d1x * d2y - d1y * d2x;
      const l = Math.hypot(nx, ny, nz);
      if (!(l > 1e-14)) return true;
      const ox = normals[f * 3], oy = normals[f * 3 + 1], oz = normals[f * 3 + 2];
      if (ox === 0 && oy === 0 && oz === 0) continue; // a sliver has no direction to keep
      if ((nx * ox + ny * oy + nz * oz) / l < 0.2) return true;
    }
    return false;
  };

  const stamp = new Int32Array(V); let stampNow = 0;
  /** Link condition: a and b may share exactly the two vertices across their common edge. */
  const linkOk = (a, b) => {
    stampNow++;
    let s = refStart[a], e = s + refCount[a];
    for (let r = s; r < e; r++) { const f = refs[r] / 3 | 0; if (deleted[f]) continue; stamp[tris[f * 3]] = stampNow; stamp[tris[f * 3 + 1]] = stampNow; stamp[tris[f * 3 + 2]] = stampNow; }
    const mark = stampNow; stampNow++;
    let common = 0, shared = 0;
    s = refStart[b]; e = s + refCount[b];
    for (let r = s; r < e; r++) {
      const f = refs[r] / 3 | 0; if (deleted[f]) continue;
      let hasA = false;
      for (let k = 0; k < 3; k++) {
        const v = tris[f * 3 + k];
        if (v === a) hasA = true;
        else if (v !== b && stamp[v] === mark) { stamp[v] = stampNow; common++; }
      }
      if (hasA) shared++;
    }
    return shared === 2 && common === 2;
  };

  const merged = [];
  const collapse = (a, b, px, py, pz) => {
    // faces around b: those with a vanish, the rest get a in place of b
    let s = refStart[b], e = s + refCount[b];
    merged.length = 0;
    for (let r = s; r < e; r++) {
      const ref = refs[r], f = ref / 3 | 0;
      if (deleted[f]) continue;
      if (tris[f * 3] === a || tris[f * 3 + 1] === a || tris[f * 3 + 2] === a) { deleted[f] = 1; continue; }
      tris[ref] = a; dirty[f] = 1; merged.push(ref);
    }
    s = refStart[a]; e = s + refCount[a];
    for (let r = s; r < e; r++) {
      const ref = refs[r], f = ref / 3 | 0;
      if (deleted[f]) continue;
      dirty[f] = 1; merged.push(ref);
    }
    pos[a * 3] = px; pos[a * 3 + 1] = py; pos[a * 3 + 2] = pz;
    for (let i = 0; i < 10; i++) Q[a * 10 + i] += Q[b * 10 + i];
    vArea[a] += vArea[b];
    refCount[b] = 0;
    appendRefs(a, merged);
    for (const ref of merged) faceNormal(ref / 3 | 0); // refresh the normals of the faces that moved
  };

  const target = tolerance * tolerance;
  let live = F;
  for (let pass = 0; pass < 200; pass++) {
    rebuildRefs(); refEnd = F * 3; live = F;
    const ramp = Math.min(1, (pass + 1) / passes);
    const threshold = live > maxTriangles ? Infinity : target * ramp * ramp * ramp;
    let collapsed = 0;
    for (let f = 0; f < F && live > 4; f++) {
      if (deleted[f] || dirty[f]) continue;
      for (let k = 0; k < 3; k++) {
        const a = tris[f * 3 + k], b = tris[f * 3 + (k + 1) % 3];
        if (refCount[a] + refCount[b] - 4 > MAX_DEGREE) continue;
        const cost = edgeCost(a, b);
        if (cost > threshold * (vArea[a] + vArea[b])) continue;
        const px = best[0], py = best[1], pz = best[2];
        if (flips(a, b, px, py, pz) || flips(b, a, px, py, pz)) continue;
        if (!linkOk(a, b)) continue;
        collapse(a, b, px, py, pz);
        collapsed++; live -= 2;
        break;
      }
    }
    if (live <= 4) break;
    if (pass + 1 >= passes && live <= maxTriangles && collapsed < Math.max(2, live * 0.0005)) break;
  }

  // compact
  const remap = new Int32Array(V).fill(-1);
  const positions = [], indices = [];
  let n = 0;
  for (let f = 0; f < F; f++) {
    if (deleted[f]) continue;
    for (let k = 0; k < 3; k++) {
      const v = tris[f * 3 + k];
      if (remap[v] === -1) { remap[v] = n++; positions.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); }
      indices.push(remap[v]);
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}
