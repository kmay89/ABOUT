/**
 * Hollow — mesh utilities. All dimensions are millimetres.
 *
 * A mesh is { positions: Float32Array (3 per vertex), indices: Uint32Array
 * (3 per triangle) }. This module reads STL (binary and ASCII) and OBJ,
 * welds vertices, measures meshes, transforms them, splits them into
 * connected pieces, checks that they are closed, and writes binary STL.
 *
 * No DOM, no WebGL, no third-party code: it runs in a page, a worker or Node.
 */

const WELD_QUANTUM = 1e-4; // mm — vertices closer than this are the same vertex

/* ---------- a small open-addressing hash for welding ---------- */
class PointTable {
  constructor(expected) {
    let size = 1; while (size < expected * 2) size <<= 1;
    this.mask = size - 1;
    this.keys = new Int32Array(size * 3);
    this.values = new Int32Array(size).fill(-1);
  }
  /** Returns the index stored for (qx,qy,qz), or inserts `value` and returns -1. */
  getOrInsert(qx, qy, qz, value) {
    let slot = ((qx * 73856093) ^ (qy * 19349663) ^ (qz * 83492791)) & this.mask;
    const { keys, values, mask } = this;
    for (;;) {
      const v = values[slot];
      if (v === -1) { keys[slot * 3] = qx; keys[slot * 3 + 1] = qy; keys[slot * 3 + 2] = qz; values[slot] = value; return -1; }
      if (keys[slot * 3] === qx && keys[slot * 3 + 1] === qy && keys[slot * 3 + 2] === qz) return v;
      slot = (slot + 1) & mask;
    }
  }
}

/** Turn a triangle soup (9 floats per triangle) into an indexed mesh, dropping degenerate triangles. */
export function weld(soup, quantum = WELD_QUANTUM) {
  const triangles = Math.floor(soup.length / 9);
  const table = new PointTable(triangles * 3);
  const positions = new Float32Array(triangles * 9);
  const indices = new Uint32Array(triangles * 3);
  let vertexCount = 0, triangleCount = 0;
  const inv = 1 / quantum;
  const q = new Int32Array(9);
  for (let t = 0; t < triangles; t++) {
    let ok = true;
    for (let c = 0; c < 9; c++) {
      const v = soup[t * 9 + c];
      if (!Number.isFinite(v)) { ok = false; break; }
      q[c] = Math.round(v * inv);
    }
    // a triangle with two corners in the same place is dropped before its corners are kept
    const same = (a, b) => q[a] === q[b] && q[a + 1] === q[b + 1] && q[a + 2] === q[b + 2];
    if (!ok || same(0, 3) || same(3, 6) || same(0, 6)) continue;
    const tri = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      let index = table.getOrInsert(q[c * 3], q[c * 3 + 1], q[c * 3 + 2], vertexCount);
      if (index === -1) {
        index = vertexCount++;
        positions[index * 3] = soup[t * 9 + c * 3]; positions[index * 3 + 1] = soup[t * 9 + c * 3 + 1]; positions[index * 3 + 2] = soup[t * 9 + c * 3 + 2];
      }
      tri[c] = index;
    }
    indices[triangleCount * 3] = tri[0]; indices[triangleCount * 3 + 1] = tri[1]; indices[triangleCount * 3 + 2] = tri[2];
    triangleCount++;
  }
  return { positions: positions.slice(0, vertexCount * 3), indices: indices.slice(0, triangleCount * 3) };
}

/* ---------- readers ---------- */

function isBinarySTL(bytes) {
  if (bytes.length < 84) return false;
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
  if (bytes.length === 84 + count * 50) return true;
  // Some writers pad the file; accept when the header does not read as ASCII "solid".
  const head = String.fromCharCode(...bytes.subarray(0, 5)).toLowerCase();
  if (head !== 'solid') return bytes.length >= 84 + count * 50 && count > 0;
  // "solid" but the declared count fits: real ASCII files have "facet" soon after.
  const sample = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 400)));
  return !/facet|endsolid|vertex/i.test(sample);
}

export function parseBinarySTL(buffer) {
  const bytes = toBytes(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  if (bytes.length < 84 + count * 50) throw new Error('This STL file is truncated.');
  const soup = new Float32Array(count * 9);
  for (let t = 0, o = 84; t < count; t++, o += 50) {
    for (let c = 0; c < 9; c++) soup[t * 9 + c] = view.getFloat32(o + 12 + c * 4, true);
  }
  return weld(soup);
}

export function parseAsciiSTL(text) {
  const values = [];
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  let m;
  while ((m = re.exec(text))) values.push(+m[1], +m[2], +m[3]);
  if (values.length < 9) throw new Error('No triangles were found in this STL file.');
  return weld(Float32Array.from(values.slice(0, values.length - (values.length % 9))));
}

export function parseOBJ(text) {
  const verts = [];
  const soup = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      verts.push(+p[1], +p[2], +p[3]);
    } else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/).slice(1).map(token => {
        const i = parseInt(token.split('/')[0], 10);
        return i < 0 ? verts.length / 3 + i : i - 1;
      });
      for (let i = 1; i + 1 < parts.length; i++) {
        for (const index of [parts[0], parts[i], parts[i + 1]]) soup.push(verts[index * 3], verts[index * 3 + 1], verts[index * 3 + 2]);
      }
    }
  }
  if (soup.length < 9) throw new Error('No faces were found in this OBJ file.');
  return weld(Float32Array.from(soup));
}

function toBytes(buffer) {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  if (ArrayBuffer.isView(buffer)) return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  throw new TypeError('Expected an ArrayBuffer or a typed array.');
}

/** Read an STL (binary or ASCII) or OBJ from bytes, by extension first and content second. */
export function parseModel(buffer, name = '') {
  const bytes = toBytes(buffer);
  if (!bytes.length) throw new Error('The file is empty.');
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  if (ext === 'obj') return parseOBJ(new TextDecoder().decode(bytes));
  if (isBinarySTL(bytes)) return parseBinarySTL(bytes);
  const text = new TextDecoder().decode(bytes);
  if (/^\s*solid/i.test(text) || /facet\s+normal/i.test(text)) return parseAsciiSTL(text);
  if (/^\s*(v|f)\s/m.test(text)) return parseOBJ(text);
  throw new Error('This does not look like an STL or OBJ file.');
}

/* ---------- measurement ---------- */

export function bounds(mesh) {
  const p = mesh.positions;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let c = 0; c < 3; c++) { const v = p[i + c]; if (v < min[c]) min[c] = v; if (v > max[c]) max[c] = v; }
  }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return { min, max, size, center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] };
}

/** Signed volume (positive for an outward-wound closed mesh), mm³. */
export function signedVolume(mesh) {
  const { positions: p, indices: ix } = mesh;
  let v = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
       - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
       + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

export function surfaceArea(mesh) {
  const { positions: p, indices: ix } = mesh;
  let area = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return area;
}

export function triangleCount(mesh) { return mesh.indices.length / 3; }

/* ---------- transforms ---------- */

/** Rotation matrix (row-major 3×3) about x, y or z by degrees. */
export function rotationMatrix(axis, degrees) {
  const r = degrees * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  if (axis === 'x') return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 'y') return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export function multiply3(a, b) {
  const out = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  }
  return out;
}

/** Apply p' = M·p + t (M row-major 3×3, t a 3-vector); returns a new mesh. */
export function transform(mesh, m = [1, 0, 0, 0, 1, 0, 0, 0, 1], t = [0, 0, 0]) {
  const p = mesh.positions, out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    out[i] = m[0] * x + m[1] * y + m[2] * z + t[0];
    out[i + 1] = m[3] * x + m[4] * y + m[5] * z + t[1];
    out[i + 2] = m[6] * x + m[7] * y + m[8] * z + t[2];
  }
  const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  let indices = mesh.indices;
  if (det < 0) { // a mirror turns the winding inside out; swap two corners to keep faces outward
    indices = new Uint32Array(mesh.indices.length);
    for (let i = 0; i < indices.length; i += 3) { indices[i] = mesh.indices[i]; indices[i + 1] = mesh.indices[i + 2]; indices[i + 2] = mesh.indices[i + 1]; }
  }
  return { positions: out, indices };
}

export function translate(mesh, t) { return transform(mesh, undefined, t); }
export function scale(mesh, s) { return transform(mesh, [s, 0, 0, 0, s, 0, 0, 0, s]); }

/** Flip every triangle so the surface faces the other way. */
export function invert(mesh) {
  const indices = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < indices.length; i += 3) { indices[i] = mesh.indices[i]; indices[i + 1] = mesh.indices[i + 2]; indices[i + 2] = mesh.indices[i + 1]; }
  return { positions: mesh.positions, indices };
}

/** Area-weighted vertex normals, for display. */
export function vertexNormals(mesh) {
  const { positions: p, indices: ix } = mesh;
  const n = new Float32Array(p.length);
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/** Face normals (unit), 3 per triangle. */
export function faceNormals(mesh) {
  const { positions: p, indices: ix } = mesh;
  const n = new Float32Array(ix.length);
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    n[i] = nx / l; n[i + 1] = ny / l; n[i + 2] = nz / l;
  }
  return n;
}

/* ---------- topology ---------- */

/** Is the mesh a closed, consistently wound surface? Reports what is wrong when not. */
export function watertight(mesh) {
  const { indices: ix } = mesh;
  const vertexCount = mesh.positions.length / 3;
  const edges = new Map(); // key -> [count, directionSum]
  for (let i = 0; i < ix.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = ix[i + k], b = ix[i + (k + 1) % 3];
      const key = a < b ? a * vertexCount + b : b * vertexCount + a;
      const e = edges.get(key);
      if (e) { e[0]++; e[1] += a < b ? 1 : -1; } else edges.set(key, [1, a < b ? 1 : -1]);
    }
  }
  let boundary = 0, nonManifold = 0, inconsistent = 0;
  for (const [, [count, direction]] of edges) {
    if (count === 1) boundary++;
    else if (count > 2) nonManifold++;
    else if (direction !== 0) inconsistent++;
  }
  return { closed: boundary === 0 && nonManifold === 0 && inconsistent === 0, boundaryEdges: boundary, nonManifoldEdges: nonManifold, inconsistentEdges: inconsistent, edges: edges.size };
}

/** Split a mesh into connected pieces (by shared vertices), largest first. */
export function components(mesh) {
  const { positions: p, indices: ix } = mesh;
  const vertexCount = p.length / 3;
  const parent = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let i = 0; i < ix.length; i += 3) { union(ix[i], ix[i + 1]); union(ix[i], ix[i + 2]); }
  const groups = new Map();
  for (let i = 0; i < ix.length; i += 3) {
    const root = find(ix[i]);
    let g = groups.get(root);
    if (!g) { g = []; groups.set(root, g); }
    g.push(i);
  }
  const out = [];
  for (const faces of groups.values()) {
    const remap = new Int32Array(vertexCount).fill(-1);
    const positions = [], indices = new Uint32Array(faces.length * 3);
    let n = 0, w = 0;
    for (const f of faces) {
      for (let k = 0; k < 3; k++) {
        const v = ix[f + k];
        if (remap[v] === -1) { remap[v] = n++; positions.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]); }
        indices[w++] = remap[v];
      }
    }
    out.push({ positions: Float32Array.from(positions), indices });
  }
  out.sort((a, b) => Math.abs(signedVolume(b)) - Math.abs(signedVolume(a)));
  return out;
}

/** Join meshes into one (no welding across pieces). */
export function merge(meshes) {
  let v = 0, t = 0;
  for (const m of meshes) { v += m.positions.length; t += m.indices.length; }
  const positions = new Float32Array(v), indices = new Uint32Array(t);
  let vo = 0, to = 0;
  for (const m of meshes) {
    positions.set(m.positions, vo);
    const base = vo / 3;
    for (let i = 0; i < m.indices.length; i++) indices[to + i] = m.indices[i] + base;
    vo += m.positions.length; to += m.indices.length;
  }
  return { positions, indices };
}

/* ---------- writer ---------- */

/** Binary STL, millimetres. @returns {ArrayBuffer} */
export function binarySTL(mesh, header = 'Hollow mold | units: mm | print as it arrives') {
  const { positions: p, indices: ix } = mesh;
  const count = ix.length / 3;
  const buffer = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const head = new TextEncoder().encode(header.slice(0, 80));
  bytes.set(head, 0);
  view.setUint32(80, count, true);
  let o = 84;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l > 0) { nx /= l; ny /= l; nz /= l; } else { nx = ny = 0; nz = 1; }
    view.setFloat32(o, nx, true); view.setFloat32(o + 4, ny, true); view.setFloat32(o + 8, nz, true);
    for (let k = 0; k < 3; k++) {
      const s = ix[i + k] * 3;
      view.setFloat32(o + 12 + k * 12, p[s], true);
      view.setFloat32(o + 16 + k * 12, p[s + 1], true);
      view.setFloat32(o + 20 + k * 12, p[s + 2], true);
    }
    view.setUint16(o + 48, 0, true);
    o += 50;
  }
  return buffer;
}
