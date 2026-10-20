/**
 * Hollow — surface extraction by marching tetrahedra.
 *
 * Each grid cube is cut into six tetrahedra around its main diagonal; the
 * face diagonals that come out of that split agree between neighbouring
 * cubes, so the surface is one closed, consistently wound mesh with no
 * look-up table to get wrong. A tetrahedron with mixed signs yields one
 * triangle (one corner apart) or two (two and two). Vertices on shared
 * edges are shared, so the result is an indexed mesh ready for decimation.
 *
 * Inside is negative. A node exactly at zero counts as outside.
 */

class EdgeTable {
  constructor(expected = 1 << 16) {
    let size = 1 << 12; while (size < expected * 2) size <<= 1;
    this.alloc(size);
  }
  alloc(size) {
    this.mask = size - 1; this.size = size; this.used = 0;
    this.ka = new Int32Array(size).fill(-1); this.kb = new Int32Array(size); this.val = new Int32Array(size);
  }
  get(a, b) {
    let s = (Math.imul(a, 0x9E3779B1) ^ Math.imul(b, 0x85EBCA77)) & this.mask;
    for (;;) {
      const k = this.ka[s];
      if (k === -1) return -1;
      if (k === a && this.kb[s] === b) return this.val[s];
      s = (s + 1) & this.mask;
    }
  }
  set(a, b, v) {
    if (this.used * 10 > this.size * 6) this.grow();
    let s = (Math.imul(a, 0x9E3779B1) ^ Math.imul(b, 0x85EBCA77)) & this.mask;
    while (this.ka[s] !== -1) s = (s + 1) & this.mask;
    this.ka[s] = a; this.kb[s] = b; this.val[s] = v; this.used++;
  }
  grow() {
    const { ka, kb, val, size } = this;
    this.alloc(size * 2);
    for (let i = 0; i < size; i++) if (ka[i] !== -1) this.set(ka[i], kb[i], val[i]);
  }
}

class FloatList {
  constructor(n = 1 << 16) { this.data = new Float32Array(n); this.length = 0; }
  push3(x, y, z) {
    if (this.length + 3 > this.data.length) { const d = new Float32Array(this.data.length * 2); d.set(this.data); this.data = d; }
    this.data[this.length++] = x; this.data[this.length++] = y; this.data[this.length++] = z;
  }
  result() { return this.data.slice(0, this.length); }
}
class IntList {
  constructor(n = 1 << 16) { this.data = new Uint32Array(n); this.length = 0; }
  push3(a, b, c) {
    if (this.length + 3 > this.data.length) { const d = new Uint32Array(this.data.length * 2); d.set(this.data); this.data = d; }
    this.data[this.length++] = a; this.data[this.length++] = b; this.data[this.length++] = c;
  }
  result() { return this.data.slice(0, this.length); }
}

// Six tetrahedra around the diagonal from corner 0 to corner 7 (corner bits: x + 2y + 4z).
const TETS = [[0, 1, 3, 7], [0, 3, 2, 7], [0, 2, 6, 7], [0, 6, 4, 7], [0, 4, 5, 7], [0, 5, 1, 7]];

/**
 * Extract the zero surface of `field` on `grid`.
 * @returns {{positions: Float32Array, indices: Uint32Array}}
 */
export function marchingTetrahedra(field, grid) {
  const { nx, ny, nz, h, origin } = grid;
  const positions = new FloatList(), indices = new IntList();
  const table = new EdgeTable(Math.max(1 << 16, Math.floor(grid.count / 8)));
  const corner = new Int32Array(8), value = new Float64Array(8);
  const cornerOffset = [0, 1, nx, nx + 1, nx * ny, nx * ny + 1, nx * ny + nx, nx * ny + nx + 1];

  const nodePos = (n, out) => {
    const i = n % nx, j = Math.floor(n / nx) % ny, k = Math.floor(n / (nx * ny));
    out[0] = origin[0] + i * h; out[1] = origin[1] + j * h; out[2] = origin[2] + k * h;
  };
  const pa = [0, 0, 0], pb = [0, 0, 0];
  /** Vertex on the edge between nodes a and b, shared between all tetrahedra that use it. */
  const vertexOn = (a, b) => {
    const lo = a < b ? a : b, hi = a < b ? b : a;
    let v = table.get(lo, hi);
    if (v !== -1) return v;
    const fa = field[lo], fb = field[hi];
    let t = fa / (fa - fb);
    if (!Number.isFinite(t)) t = 0.5;
    t = Math.min(Math.max(t, 0), 1);
    nodePos(lo, pa); nodePos(hi, pb);
    v = positions.length / 3;
    positions.push3(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t);
    table.set(lo, hi, v);
    return v;
  };
  const P = positions;
  const cin = [0, 0, 0], cout = [0, 0, 0];
  /** Emit a triangle wound so it faces from the inside corner towards the outside corner. */
  const emit = (v0, v1, v2, insideNode, outsideNode) => {
    const d = P.data;
    const ax = d[v1 * 3] - d[v0 * 3], ay = d[v1 * 3 + 1] - d[v0 * 3 + 1], az = d[v1 * 3 + 2] - d[v0 * 3 + 2];
    const bx = d[v2 * 3] - d[v0 * 3], by = d[v2 * 3 + 1] - d[v0 * 3 + 1], bz = d[v2 * 3 + 2] - d[v0 * 3 + 2];
    const nx_ = ay * bz - az * by, ny_ = az * bx - ax * bz, nz_ = ax * by - ay * bx;
    nodePos(insideNode, cin); nodePos(outsideNode, cout);
    const dot = nx_ * (cout[0] - cin[0]) + ny_ * (cout[1] - cin[1]) + nz_ * (cout[2] - cin[2]);
    if (dot >= 0) indices.push3(v0, v1, v2); else indices.push3(v0, v2, v1);
  };

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      let base = (k * ny + j) * nx;
      for (let i = 0; i < nx - 1; i++, base++) {
        let allIn = true, allOut = true;
        for (let c = 0; c < 8; c++) {
          const n = base + cornerOffset[c];
          corner[c] = n; const f = field[n]; value[c] = f;
          if (f < 0) allOut = false; else allIn = false;
        }
        if (allIn || allOut) continue;
        for (const tet of TETS) {
          let mask = 0;
          for (let c = 0; c < 4; c++) if (value[tet[c]] < 0) mask |= 1 << c;
          if (mask === 0 || mask === 15) continue;
          const n0 = corner[tet[0]], n1 = corner[tet[1]], n2 = corner[tet[2]], n3 = corner[tet[3]];
          const nodes = [n0, n1, n2, n3];
          const insideCount = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
          if (insideCount === 1 || insideCount === 3) {
            const lone = insideCount === 1 ? mask : (~mask & 15);
            const li = lone === 1 ? 0 : lone === 2 ? 1 : lone === 4 ? 2 : 3;
            const others = [0, 1, 2, 3].filter(c => c !== li);
            const a = vertexOn(nodes[li], nodes[others[0]]);
            const b = vertexOn(nodes[li], nodes[others[1]]);
            const c = vertexOn(nodes[li], nodes[others[2]]);
            const inNode = insideCount === 1 ? nodes[li] : nodes[others[0]];
            const outNode = insideCount === 1 ? nodes[others[0]] : nodes[li];
            emit(a, b, c, inNode, outNode);
          } else {
            const ins = [], outs = [];
            for (let c = 0; c < 4; c++) (mask & (1 << c) ? ins : outs).push(c);
            const [ia, ib] = ins, [oc, od] = outs;
            const ac = vertexOn(nodes[ia], nodes[oc]), ad = vertexOn(nodes[ia], nodes[od]);
            const bd = vertexOn(nodes[ib], nodes[od]), bc = vertexOn(nodes[ib], nodes[oc]);
            emit(ac, ad, bd, nodes[ia], nodes[oc]);
            emit(ac, bd, bc, nodes[ia], nodes[oc]);
          }
        }
      }
    }
  }
  return { positions: positions.result(), indices: indices.result() };
}
