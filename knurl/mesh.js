/**
 * Knurl — mesh utilities, millimetres throughout. A mesh is
 * { positions: Float32Array (3 per vertex), indices: Uint32Array (3 per
 * triangle) }. Readers for STL (binary and ASCII) and OBJ, welding,
 * measurement, normals, a closedness check and a binary STL writer. No
 * DOM: runs in a page, a worker or Node.
 */

const WELD_QUANTUM = 1e-4;

class PointTable {
  constructor(expected) {
    let size = 1; while (size < expected * 2) size <<= 1;
    this.mask = size - 1;
    this.keys = new Int32Array(size * 3);
    this.values = new Int32Array(size).fill(-1);
  }
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

/** A triangle soup (9 floats per triangle) to an indexed mesh, degenerate triangles dropped. */
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
    for (let c = 0; c < 9; c++) { const v = soup[t * 9 + c]; if (!Number.isFinite(v)) { ok = false; break; } q[c] = Math.round(v * inv); }
    const same = (a, b) => q[a] === q[b] && q[a + 1] === q[b + 1] && q[a + 2] === q[b + 2];
    if (!ok || same(0, 3) || same(3, 6) || same(0, 6)) continue;
    const tri = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      let index = table.getOrInsert(q[c * 3], q[c * 3 + 1], q[c * 3 + 2], vertexCount);
      if (index === -1) { index = vertexCount++; positions[index * 3] = soup[t * 9 + c * 3]; positions[index * 3 + 1] = soup[t * 9 + c * 3 + 1]; positions[index * 3 + 2] = soup[t * 9 + c * 3 + 2]; }
      tri[c] = index;
    }
    indices[triangleCount * 3] = tri[0]; indices[triangleCount * 3 + 1] = tri[1]; indices[triangleCount * 3 + 2] = tri[2];
    triangleCount++;
  }
  return { positions: positions.slice(0, vertexCount * 3), indices: indices.slice(0, triangleCount * 3) };
}

/** Weld an indexed mesh's vertices by position (after subdivision, when edges were built from both sides). */
export function reweld(mesh, quantum = WELD_QUANTUM) {
  const { positions: p, indices: ix } = mesh;
  const soup = new Float32Array(ix.length * 3);
  for (let i = 0; i < ix.length; i++) { const v = ix[i] * 3; soup[i * 3] = p[v]; soup[i * 3 + 1] = p[v + 1]; soup[i * 3 + 2] = p[v + 2]; }
  return weld(soup, quantum);
}

/* ---------- readers ---------- */

function toBytes(buffer) {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  if (ArrayBuffer.isView(buffer)) return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  throw new TypeError('Expected an ArrayBuffer or a typed array.');
}

function isBinarySTL(bytes) {
  if (bytes.length < 84) return false;
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
  if (bytes.length === 84 + count * 50) return true;
  const head = String.fromCharCode(...bytes.subarray(0, 5)).toLowerCase();
  if (head !== 'solid') return bytes.length >= 84 + count * 50 && count > 0;
  const sample = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 400)));
  return !/facet|endsolid|vertex/i.test(sample);
}

export function parseBinarySTL(buffer) {
  const bytes = toBytes(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  if (bytes.length < 84 + count * 50) throw new Error('This STL file is truncated.');
  const soup = new Float32Array(count * 9);
  for (let t = 0, o = 84; t < count; t++, o += 50) for (let c = 0; c < 9; c++) soup[t * 9 + c] = view.getFloat32(o + 12 + c * 4, true);
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
  const verts = [], soup = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('v ')) { const p = line.split(/\s+/); verts.push(+p[1], +p[2], +p[3]); }
    else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/).slice(1).map(token => { const i = parseInt(token.split('/')[0], 10); return i < 0 ? verts.length / 3 + i : i - 1; });
      for (let i = 1; i + 1 < parts.length; i++) for (const index of [parts[0], parts[i], parts[i + 1]]) soup.push(verts[index * 3], verts[index * 3 + 1], verts[index * 3 + 2]);
    }
  }
  if (soup.length < 9) throw new Error('No faces were found in this OBJ file.');
  return weld(Float32Array.from(soup));
}

/** Read an STL (binary or ASCII) or OBJ from bytes. */
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
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { if (p[i + k] < min[k]) min[k] = p[i + k]; if (p[i + k] > max[k]) max[k] = p[i + k]; }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

export function signedVolume(mesh) {
  const { positions: p, indices: ix } = mesh;
  let v = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

export function surfaceArea(mesh) {
  const { positions: p, indices: ix } = mesh;
  let a2 = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    a2 += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  return a2 / 2;
}

/** Area-weighted unit vertex normals. */
export function vertexNormals(mesh) {
  const { positions: p, indices: ix } = mesh;
  const n = new Float32Array(p.length);
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}

/** Unit face normals, 3 per triangle. */
export function faceNormals(mesh) {
  const { positions: p, indices: ix } = mesh;
  const n = new Float32Array(ix.length);
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    n[i] = nx / l; n[i + 1] = ny / l; n[i + 2] = nz / l;
  }
  return n;
}

/** Is the mesh a closed, consistently wound surface? */
export function watertight(mesh) {
  const { indices: ix } = mesh;
  const vertexCount = mesh.positions.length / 3;
  const edges = new Map();
  for (let i = 0; i < ix.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = ix[i + k], b = ix[i + (k + 1) % 3];
    const key = a < b ? a * vertexCount + b : b * vertexCount + a;
    const e = edges.get(key);
    if (e) { e[0]++; e[1] += a < b ? 1 : -1; } else edges.set(key, [1, a < b ? 1 : -1]);
  }
  let boundary = 0, nonManifold = 0, inconsistent = 0;
  for (const [, [count, direction]] of edges) { if (count === 1) boundary++; else if (count > 2) nonManifold++; else if (direction !== 0) inconsistent++; }
  return { closed: boundary === 0 && nonManifold === 0 && inconsistent === 0, boundaryEdges: boundary, nonManifoldEdges: nonManifold, inconsistentEdges: inconsistent };
}

/** Move a mesh by t. */
export function translate(mesh, t) {
  const positions = new Float32Array(mesh.positions);
  for (let i = 0; i < positions.length; i += 3) { positions[i] += t[0]; positions[i + 1] += t[1]; positions[i + 2] += t[2]; }
  return { positions, indices: mesh.indices };
}

/** Binary STL bytes. */
export function binarySTL(mesh, header = 'Knurl | mm | Z up') {
  const { positions: p, indices: ix } = mesh;
  const tris = ix.length / 3;
  const out = new ArrayBuffer(84 + tris * 50), view = new DataView(out);
  new TextEncoder().encodeInto(header.slice(0, 80), new Uint8Array(out, 0, 80));
  view.setUint32(80, tris, true);
  let o = 84;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    view.setFloat32(o, nx, true); view.setFloat32(o + 4, ny, true); view.setFloat32(o + 8, nz, true); o += 12;
    for (const k of [a, b, c]) { view.setFloat32(o, p[k], true); view.setFloat32(o + 4, p[k + 1], true); view.setFloat32(o + 8, p[k + 2], true); o += 12; }
    view.setUint16(o, 0, true); o += 2;
  }
  return out;
}
