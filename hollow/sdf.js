/**
 * Hollow — signed distance fields. All dimensions are millimetres.
 *
 * A Grid is a box of nodes `h` apart. A field is one Float32 per node:
 * negative inside the solid, positive outside, zero on its surface. The
 * model's field is measured from its triangles (exact point–triangle
 * distance inside a narrow band, clamped to ±band beyond it) and signed by
 * ray parity along all three axes with a majority vote, so a model with a
 * few missing triangles still comes out solid. Everything the mold adds —
 * the block, keys, spout, vents, grooves — is an analytic shape, and shapes
 * combine with min (union), max (intersection) and max(a, −b) (difference).
 *
 * No DOM, no third-party code: runs in a page, a worker or Node.
 */

export class Grid {
  /** @param origin position of node (0,0,0); @param h spacing; @param nx,ny,nz node counts */
  constructor(origin, h, nx, ny, nz) {
    this.origin = origin; this.h = h; this.nx = nx; this.ny = ny; this.nz = nz;
    this.count = nx * ny * nz;
  }
  index(i, j, k) { return (k * this.ny + j) * this.nx + i; }
  x(i) { return this.origin[0] + i * this.h; }
  y(j) { return this.origin[1] + j * this.h; }
  z(k) { return this.origin[2] + k * this.h; }
  /** Node index range [lo, hi] covering world interval [a, b], clamped to the grid. */
  range(axis, a, b) {
    const n = axis === 0 ? this.nx : axis === 1 ? this.ny : this.nz;
    const o = this.origin[axis];
    const lo = Math.max(0, Math.floor((a - o) / this.h)), hi = Math.min(n - 1, Math.ceil((b - o) / this.h));
    return [lo, hi];
  }
  /** Trilinear sample of a field at a world point; outside the grid, the nearest node. */
  sample(field, x, y, z) {
    const fx = Math.min(Math.max((x - this.origin[0]) / this.h, 0), this.nx - 1.000001);
    const fy = Math.min(Math.max((y - this.origin[1]) / this.h, 0), this.ny - 1.000001);
    const fz = Math.min(Math.max((z - this.origin[2]) / this.h, 0), this.nz - 1.000001);
    const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const c = (di, dj, dk) => field[this.index(i + di, j + dj, k + dk)];
    const lerp = (a, b, t) => a + (b - a) * t;
    return lerp(
      lerp(lerp(c(0, 0, 0), c(1, 0, 0), tx), lerp(c(0, 1, 0), c(1, 1, 0), tx), ty),
      lerp(lerp(c(0, 0, 1), c(1, 0, 1), tx), lerp(c(0, 1, 1), c(1, 1, 1), tx), ty), tz);
  }
}

/** A grid covering [min, max] with margin, with an irrational-looking offset so nodes avoid the
 * round coordinates STL vertices sit on. Node counts are capped so the field fits in memory. */
export function gridFor(min, max, h, margin = 0) {
  const jitter = 0.371 * h;
  const origin = [min[0] - margin - jitter, min[1] - margin - jitter, min[2] - margin - jitter];
  const n = (c) => Math.ceil((max[c] + margin + jitter - origin[c]) / h) + 2;
  return new Grid(origin, h, n(0), n(1), n(2));
}

/** Spacing that keeps a grid of the given size under `maxNodes` nodes. */
export function spacingFor(size, maxNodes, preferred, margin = 0) {
  let h = preferred;
  for (let guard = 0; guard < 60; guard++) {
    const nodes = (Math.ceil((size[0] + 2 * margin) / h) + 3) * (Math.ceil((size[1] + 2 * margin) / h) + 3) * (Math.ceil((size[2] + 2 * margin) / h) + 3);
    if (nodes <= maxNodes) break;
    h *= 1.06;
  }
  return Math.round(h * 1000) / 1000;
}

/* ---------- distance to the model ---------- */

/** Squared distance from point p to triangle (a,b,c) — Ericson, Real-Time Collision Detection 5.1.5. */
function pointTriangleDist2(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const qx = ax + abx * v - px, qy = ay + aby * v - py, qz = az + abz * v - pz;
    return qx * qx + qy * qy + qz * qz;
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const qx = ax + acx * w - px, qy = ay + acy * w - py, qz = az + acz * w - pz;
    return qx * qx + qy * qy + qz * qz;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const qx = bx + (cx - bx) * w - px, qy = by + (cy - by) * w - py, qz = bz + (cz - bz) * w - pz;
    return qx * qx + qy * qy + qz * qz;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  const qx = ax + abx * v + acx * w - px, qy = ay + aby * v + acy * w - py, qz = az + abz * v + acz * w - pz;
  return qx * qx + qy * qy + qz * qz;
}

/** Visit every triangle, splitting any whose longest edge exceeds maxEdge so no single
 * triangle's bounding box covers much more of the grid than its surface does. */
function forEachSmallTriangle(mesh, maxEdge, visit) {
  const { positions: p, indices: ix } = mesh;
  const stack = [];
  const max2 = maxEdge * maxEdge;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    stack.push([p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]]);
    while (stack.length) {
      const tri = stack.pop();
      const e0 = (tri[3] - tri[0]) ** 2 + (tri[4] - tri[1]) ** 2 + (tri[5] - tri[2]) ** 2;
      const e1 = (tri[6] - tri[3]) ** 2 + (tri[7] - tri[4]) ** 2 + (tri[8] - tri[5]) ** 2;
      const e2 = (tri[0] - tri[6]) ** 2 + (tri[1] - tri[7]) ** 2 + (tri[2] - tri[8]) ** 2;
      if (Math.max(e0, e1, e2) <= max2) { visit(tri); continue; }
      const m01 = [(tri[0] + tri[3]) / 2, (tri[1] + tri[4]) / 2, (tri[2] + tri[5]) / 2];
      const m12 = [(tri[3] + tri[6]) / 2, (tri[4] + tri[7]) / 2, (tri[5] + tri[8]) / 2];
      const m20 = [(tri[6] + tri[0]) / 2, (tri[7] + tri[1]) / 2, (tri[8] + tri[2]) / 2];
      stack.push([tri[0], tri[1], tri[2], ...m01, ...m20], [...m01, tri[3], tri[4], tri[5], ...m12],
        [...m20, ...m12, tri[6], tri[7], tri[8]], [...m01, ...m12, ...m20]);
    }
  }
}

/** Unsigned distance to the mesh at every node within `band` of it; `band` elsewhere. */
export function distanceField(mesh, grid, band) {
  const field = new Float32Array(grid.count).fill(band);
  const { h, origin, nx, ny } = grid;
  forEachSmallTriangle(mesh, 6 * h, (t) => {
    const [i0, i1] = grid.range(0, Math.min(t[0], t[3], t[6]) - band, Math.max(t[0], t[3], t[6]) + band);
    const [j0, j1] = grid.range(1, Math.min(t[1], t[4], t[7]) - band, Math.max(t[1], t[4], t[7]) + band);
    const [k0, k1] = grid.range(2, Math.min(t[2], t[5], t[8]) - band, Math.max(t[2], t[5], t[8]) + band);
    for (let k = k0; k <= k1; k++) {
      const z = origin[2] + k * h;
      for (let j = j0; j <= j1; j++) {
        const y = origin[1] + j * h;
        let idx = (k * ny + j) * nx + i0;
        for (let i = i0; i <= i1; i++, idx++) {
          const d2 = pointTriangleDist2(origin[0] + i * h, y, z, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]);
          if (d2 < field[idx] * field[idx]) field[idx] = Math.sqrt(d2);
        }
      }
    }
  });
  return field;
}

/* ---------- inside or outside: ray parity, three ways, majority vote ---------- */

/** For one axis, toggles parity at every crossing then prefix-XORs along the axis. */
function parityAlong(mesh, grid, axis, votes) {
  const { h, origin, nx, ny, nz } = grid;
  const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  const n = [nx, ny, nz];
  const flips = new Uint8Array(grid.count);
  const stride = axis === 0 ? 1 : axis === 1 ? nx : nx * ny;
  const { positions: p, indices: ix } = mesh;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const au = p[a + u], av = p[a + v], bu = p[b + u], bv = p[b + v], cu = p[c + u], cv = p[c + v];
    const area = (bu - au) * (cv - av) - (cu - au) * (bv - av);
    if (area === 0) continue;
    const [ju0, ju1] = grid.range(u, Math.min(au, bu, cu), Math.max(au, bu, cu));
    const [jv0, jv1] = grid.range(v, Math.min(av, bv, cv), Math.max(av, bv, cv));
    const aw = p[a + axis], bw = p[b + axis], cw = p[c + axis];
    const inv = 1 / area;
    for (let jv = jv0; jv <= jv1; jv++) {
      const yv = origin[v] + jv * h;
      for (let ju = ju0; ju <= ju1; ju++) {
        const xu = origin[u] + ju * h;
        // barycentric weights of (xu, yv) in the projected triangle
        const w0 = ((bu - xu) * (cv - yv) - (cu - xu) * (bv - yv)) * inv;
        const w1 = ((cu - xu) * (av - yv) - (au - xu) * (cv - yv)) * inv;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const w = w0 * aw + w1 * bw + w2 * cw;
        const i = Math.ceil((w - origin[axis]) / h);
        if (i < 0 || i >= n[axis]) continue;
        const base = axis === 0 ? (jv * ny + ju) * nx : axis === 1 ? (jv * ny) * nx + ju : (ju) + jv * nx;
        // base is the index of node 0 along the axis for this line; ju/jv are (u,v) indices
        flips[base + i * stride] ^= 1;
      }
    }
  }
  // prefix XOR along the axis
  const lines = grid.count / n[axis];
  for (let line = 0; line < lines; line++) {
    let base;
    if (axis === 0) base = line * nx;
    else if (axis === 1) { const k = Math.floor(line / nx), i = line % nx; base = k * ny * nx + i; }
    else { base = line; }
    let parity = 0;
    for (let s = 0, idx = base; s < n[axis]; s++, idx += stride) {
      parity ^= flips[idx];
      votes[idx] += parity;
    }
  }
}

/** 1 where the point is inside the mesh (two of three axis parities agree), else 0.
 * Also returns how often the three disagreed — a measure of how broken the mesh is. */
export function insideField(mesh, grid) {
  const votes = new Uint8Array(grid.count);
  for (const axis of [0, 1, 2]) parityAlong(mesh, grid, axis, votes);
  let disagreements = 0;
  const inside = new Uint8Array(grid.count);
  for (let i = 0; i < votes.length; i++) {
    const v = votes[i];
    if (v === 1 || v === 2) disagreements++;
    inside[i] = v >= 2 ? 1 : 0;
  }
  return { inside, disagreement: disagreements / grid.count };
}

/** Signed distance to the model: negative inside, clamped to ±band away from the surface. */
export function signedDistanceField(mesh, grid, band) {
  const field = distanceField(mesh, grid, band);
  const { inside, disagreement } = insideField(mesh, grid);
  for (let i = 0; i < field.length; i++) if (inside[i]) field[i] = -field[i];
  return { sdf: field, inside, disagreement };
}

/* ---------- analytic shapes (each returns a signed distance) ---------- */

export const shapes = {
  /** Box with rounded vertical edges: centre c, half-sizes hs, corner radius r (in xy). */
  roundedBoxXY(x, y, z, c, hs, r) {
    const qx = Math.abs(x - c[0]) - (hs[0] - r), qy = Math.abs(y - c[1]) - (hs[1] - r);
    const dxy = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    const dz = Math.abs(z - c[2]) - hs[2];
    return Math.max(dxy, dz);
  },
  box(x, y, z, c, hs) {
    const qx = Math.abs(x - c[0]) - hs[0], qy = Math.abs(y - c[1]) - hs[1], qz = Math.abs(z - c[2]) - hs[2];
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
  },
  sphere(x, y, z, c, r) { return Math.hypot(x - c[0], y - c[1], z - c[2]) - r; },
  /** Capped cone from point a (radius ra) to point b (radius rb). A cylinder when ra = rb. */
  cone(x, y, z, a, b, ra, rb) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const L = Math.hypot(ux, uy, uz) || 1e-9;
    const dx = x - a[0], dy = y - a[1], dz = z - a[2];
    const t = (dx * ux + dy * uy + dz * uz) / L;
    const rx = dx - ux * t / L, ry = dy - uy * t / L, rz = dz - uz * t / L;
    const q0 = Math.hypot(rx, ry, rz), q1 = t - L / 2, hh = L / 2;
    // iq's capped cone in the (radius, axis) half-plane
    const k1x = rb, k1y = hh, k2x = rb - ra, k2y = 2 * hh;
    const cax = q0 - Math.min(q0, q1 < 0 ? ra : rb), cay = Math.abs(q1) - hh;
    const k2d = k2x * k2x + k2y * k2y || 1e-12;
    const tt = Math.min(Math.max(((k1x - q0) * k2x + (k1y - q1) * k2y) / k2d, 0), 1);
    const cbx = q0 - k1x + k2x * tt, cby = q1 - k1y + k2y * tt;
    const s = (cbx < 0 && cay < 0) ? -1 : 1;
    return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
  },
  halfspace(x, y, z, o, n) { return (x - o[0]) * n[0] + (y - o[1]) * n[1] + (z - o[2]) * n[2]; },
  /** The outline of a rounded rectangle, as a ring `w` wide, extruded from z0 to z1. */
  rectRing(x, y, z, c, hs, r, w, z0, z1) {
    const qx = Math.abs(x - c[0]) - (hs[0] - r), qy = Math.abs(y - c[1]) - (hs[1] - r);
    const d2 = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    const ring = Math.abs(d2) - w / 2;
    const dz = Math.max(z0 - z, z - z1);
    return Math.max(ring, dz);
  },
};

/** Combine a field in place with a shape over the shape's bounding box.
 * op: 'union' (add material), 'cut' (remove material), 'intersect'. */
export function apply(field, grid, op, min, max, shape) {
  const [i0, i1] = grid.range(0, min[0], max[0]);
  const [j0, j1] = grid.range(1, min[1], max[1]);
  const [k0, k1] = grid.range(2, min[2], max[2]);
  const { h, origin, nx, ny } = grid;
  for (let k = k0; k <= k1; k++) {
    const z = origin[2] + k * h;
    for (let j = j0; j <= j1; j++) {
      const y = origin[1] + j * h;
      let idx = (k * ny + j) * nx + i0;
      for (let i = i0; i <= i1; i++, idx++) {
        const d = shape(origin[0] + i * h, y, z);
        const f = field[idx];
        if (op === 'union') { if (d < f) field[idx] = d; }
        else if (op === 'cut') { if (-d > f) field[idx] = -d; }
        else if (d > f) field[idx] = d;
      }
    }
  }
}
