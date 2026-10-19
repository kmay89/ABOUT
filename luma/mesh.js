/**
 * Lumen lithophane geometry. All dimensions are millimetres.
 *
 * The image is row-major, 0 = black and 1 = white, top row first.
 * Exports stand upright: Z is height, and the image faces negative Y.
 * Curved width is the length of the inside/back arc, including the border.
 * A cylinder is the curve taken all the way round: width is the inside
 * circumference, the photo wraps once, and only the top and bottom carry a
 * border. It is still one closed solid, shaped like a ring (a torus to a
 * topologist), so slicers see a lamp shade rather than a strip with a seam.
 *
 * This module has no DOM, WebGL, or third-party dependencies. It can run in a
 * browser, a worker, or Node. Each result is a single closed indexed solid.
 */

export const DEFAULTS = Object.freeze({
  width: 120,
  height: 100,
  shape: 'flat',
  angleDeg: 90,
  minThickness: 0.8,
  maxThickness: 3,
  border: 3,
  borderThickness: 3,
  resolution: 0.25,
  turn: false,
});

export const MAX_VERTICES = 1_200_000;

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than zero.`);
  }
  return value;
}

function normalize(options) {
  if (!options || typeof options !== 'object') {
    throw new TypeError('Geometry options must be an object.');
  }
  const s = { ...DEFAULTS, ...options };
  for (const key of ['width', 'height', 'minThickness', 'maxThickness', 'resolution']) {
    positive(s[key], key);
  }
  if (s.maxThickness < s.minThickness) {
    throw new RangeError('maxThickness must be at least minThickness.');
  }
  if (options.borderThickness === undefined) s.borderThickness = s.maxThickness;
  positive(s.borderThickness, 'borderThickness');
  if (!Number.isFinite(s.border) || s.border < 0) {
    throw new RangeError('border must be a finite number of zero or greater.');
  }
  if (2 * s.border >= Math.min(s.width, s.height)) {
    throw new RangeError('The border must leave a positive-width photo opening.');
  }
  if (s.shape !== 'flat' && s.shape !== 'curved' && s.shape !== 'cylinder') {
    throw new RangeError('shape must be "flat", "curved" or "cylinder".');
  }
  if (!Number.isFinite(s.angleDeg)) {
    throw new RangeError('angleDeg must be finite.');
  }
  if (s.shape === 'curved' && (s.angleDeg < 15 || s.angleDeg > 180)) {
    throw new RangeError('The curved panel angle must be between 15 and 180 degrees.');
  }
  const hasImage = s.values !== undefined && s.values !== null;
  if (hasImage) {
    if (!Number.isSafeInteger(s.nx) || !Number.isSafeInteger(s.ny) || s.nx < 1 || s.ny < 1) {
      throw new RangeError('The image requires positive integer nx and ny dimensions.');
    }
    if (!Number.isSafeInteger(s.nx * s.ny) || s.values.length !== s.nx * s.ny) {
      throw new RangeError('The image values length must equal nx multiplied by ny.');
    }
    for (let i = 0; i < s.values.length; i++) {
      const value = s.values[i];
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`Image luminance at index ${i} must be between zero and one.`);
      }
    }
  } else {
    s.values = null;
    s.nx = 0;
    s.ny = 0;
  }
  return s;
}

// Subdivide each border/image interval separately. The rail's inner and outer
// edges are therefore present even when the requested sample spacing is coarse.
function axisPlan(length, border, resolution) {
  const breaks = border > 0 ? [0, border, length - border, length] : [0, length];
  let count = 1;
  const divisions = [];
  for (let i = 1; i < breaks.length; i++) {
    const n = Math.max(1, Math.ceil((breaks[i] - breaks[i - 1]) / resolution));
    divisions.push(n);
    count += n;
    if (!Number.isSafeInteger(count)) {
      throw new RangeError('The mesh is too dense. Increase the sample spacing or reduce its size.');
    }
  }
  return { breaks, divisions, count };
}

function axis(length, border, resolution, closed = false) {
  const { breaks, divisions, count } = axisPlan(length, border, resolution);
  if (count > MAX_VERTICES / 2) {
    throw new RangeError('The mesh is too dense. Increase the sample spacing or reduce its size.');
  }
  const points = new Float64Array(count);
  let at = 0;
  for (let i = 0; i < divisions.length; i++) {
    const start = breaks[i];
    const end = breaks[i + 1];
    const n = divisions[i];
    for (let k = 0; k < n; k++) points[at++] = start + (end - start) * k / n;
  }
  points[at] = length;
  // Round a closed loop the last point is the first one again, so it is left out.
  return closed ? points.subarray(0, count - 1) : points;
}

/** Vertex and triangle counts for a grid. A closed loop has no left/right walls. */
function gridCounts(columns, rows, closed) {
  const spans = closed ? columns : columns - 1;
  return {
    vertexCount: 2 * columns * rows,
    triangleCount: 4 * spans * (rows - 1) + 4 * spans + (closed ? 0 : 4 * (rows - 1)),
  };
}

/** Predict the exact grid and STL size without allocating mesh/image buffers.
 * suggestedResolution is equal to the request when it fits; otherwise it is
 * rounded up to 0.001 mm at the closest spacing that fits MAX_VERTICES.
 */
export function estimateGrid(options = {}) {
  if (!options || typeof options !== 'object') throw new TypeError('Geometry options must be an object.');
  const s = normalize({ ...options, values: null });
  const closed = s.shape === 'cylinder';
  const counts = resolution => {
    const columns = closed ? axisPlan(s.width, 0, resolution).count - 1 : axisPlan(s.width, s.border, resolution).count;
    const rows = axisPlan(s.height, s.border, resolution).count;
    const { vertexCount, triangleCount } = gridCounts(columns, rows, closed);
    return { columns, rows, nx: columns, ny: rows, layerSize: columns * rows, vertexCount, triangleCount };
  };
  const result = counts(s.resolution);
  const withinLimit = result.vertexCount <= MAX_VERTICES;
  let suggestedResolution = s.resolution;
  if (!withinLimit) {
    let lower = s.resolution;
    let upper = Math.max(s.width, s.height, lower);
    for (let i = 0; i < 48; i++) {
      const mid = (lower + upper) / 2;
      if (counts(mid).vertexCount <= MAX_VERTICES) upper = mid;
      else lower = mid;
    }
    suggestedResolution = Math.ceil(upper * 1000) / 1000;
  }
  return { ...result, stlBytes: 84 + 50 * result.triangleCount, withinLimit, suggestedResolution };
}

function luminance(values, nx, ny, u, v) {
  if (!values) return 1;
  const px = Math.max(0, Math.min(1, u)) * (nx - 1);
  const py = Math.max(0, Math.min(1, v)) * (ny - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, nx - 1);
  const y1 = Math.min(y0 + 1, ny - 1);
  const fx = px - x0;
  const fy = py - y0;
  const top = values[y0 * nx + x0] * (1 - fx) + values[y0 * nx + x1] * fx;
  const bottom = values[y1 * nx + x0] * (1 - fx) + values[y1 * nx + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

function thicknessAt(s, arc, z) {
  const b = s.border;
  const closed = s.shape === 'cylinder';
  const side = closed ? 0 : b;
  if (b > 0 && ((!closed && (arc <= b || arc >= s.width - b)) || z <= b || z >= s.height - b)) {
    return s.borderThickness;
  }
  const u = (arc - side) / (s.width - 2 * side);
  const v = 1 - (z - b) / (s.height - 2 * b);
  const value = luminance(s.values, s.nx, s.ny, u, v);
  return s.minThickness + (1 - value) * (s.maxThickness - s.minThickness);
}

function measure(vertices, indices) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const value = vertices[i + k];
      if (!Number.isFinite(value)) {
        throw new RangeError('The chosen dimensions cannot be represented as a finite mesh.');
      }
      min[k] = Math.min(min[k], value);
      max[k] = Math.max(max[k], value);
    }
  }
  const size = max.map((value, k) => value - min[k]);
  const center = min.map((value, k) => value + size[k] / 2);
  let volume = 0;
  let correction = 0;
  let area = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ux = vertices[b] - vertices[a];
    const uy = vertices[b + 1] - vertices[a + 1];
    const uz = vertices[b + 2] - vertices[a + 2];
    const vx = vertices[c] - vertices[a];
    const vy = vertices[c + 1] - vertices[a + 1];
    const vz = vertices[c + 2] - vertices[a + 2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const norm = Math.hypot(cx, cy, cz);
    if (!(norm > 0) || !Number.isFinite(norm)) {
      throw new RangeError('These dimensions produce a degenerate triangle. Increase the thickness or sample spacing.');
    }
    area += norm / 2;
    // Use a nearby reference and compensated summation for thin large panels.
    const term = ((vertices[a] - center[0]) * cx
      + (vertices[a + 1] - center[1]) * cy
      + (vertices[a + 2] - center[2]) * cz) / 6;
    const adjusted = term - correction;
    const next = volume + adjusted;
    correction = (next - volume) - adjusted;
    volume = next;
  }
  if (!(volume > 0) || !Number.isFinite(volume)) {
    throw new RangeError('The mesh must have a positive, finite enclosed volume.');
  }
  return { bounds: { min, max, size }, signedVolume: volume, surfaceAreaMm2: area };
}

/**
 * @param {object} options See DEFAULTS. values/nx/ny describe the input image.
 * @returns {{vertices: Float32Array, indices: Uint32Array, bounds: object,
 * signedVolume: number, volumeMm3: number, triangleCount: number,
 * vertexCount: number, grid: object, settings: object}}
 */
export function buildMesh(options = {}) {
  const s = normalize(options);
  const closed = s.shape === 'cylinder';
  const horizontal = axis(s.width, closed ? 0 : s.border, s.resolution, closed);
  const vertical = axis(s.height, s.border, s.resolution);
  const columns = horizontal.length;
  const rows = vertical.length;
  const layerSize = columns * rows;
  const { vertexCount, triangleCount } = gridCounts(columns, rows, closed);
  if (!Number.isSafeInteger(vertexCount) || vertexCount > MAX_VERTICES) {
    throw new RangeError(`The mesh needs ${vertexCount.toLocaleString('en-US')} vertices. Increase the sample spacing or reduce the size to stay below ${MAX_VERTICES.toLocaleString('en-US')}.`);
  }
  const vertices = new Float32Array(vertexCount * 3);
  const thicknesses = new Float32Array(vertexCount);
  const indices = new Uint32Array(triangleCount * 3);
  // A cylinder is a 360 degree curve: its seam sits at the back, its centre faces -Y.
  const theta = closed ? 2 * Math.PI : s.angleDeg * Math.PI / 180;
  const innerRadius = s.shape === 'flat' ? null : s.width / theta;
  const sin = new Float64Array(columns);
  const cos = new Float64Array(columns);
  if (innerRadius !== null) {
    for (let i = 0; i < columns; i++) {
      const a = horizontal[i] / innerRadius - theta / 2;
      sin[i] = Math.sin(a);
      cos[i] = Math.cos(a);
    }
  }
  for (let j = 0; j < rows; j++) {
    const z = vertical[j];
    for (let i = 0; i < columns; i++) {
      const front = (j * columns + i) * 3;
      const back = front + layerSize * 3;
      const t = thicknessAt(s, horizontal[i], z);
      thicknesses[j * columns + i] = thicknesses[layerSize + j * columns + i] = t;
      if (innerRadius === null) {
        vertices[front] = vertices[back] = horizontal[i] - s.width / 2;
        vertices[front + 1] = -t;
        vertices[back + 1] = 0;
      } else {
        const r = innerRadius;
        vertices[back] = r * sin[i];
        // Expanded expressions avoid cancelling two large radii near the center.
        vertices[back + 1] = r * (1 - cos[i]);
        vertices[front] = (r + t) * sin[i];
        vertices[front + 1] = r * (1 - cos[i]) - t * cos[i];
      }
      vertices[front + 2] = vertices[back + 2] = z;
    }
  }
  let cursor = 0;
  const triangle = (a, b, c) => {
    indices[cursor++] = a;
    indices[cursor++] = b;
    indices[cursor++] = c;
  };
  const spans = closed ? columns : columns - 1;
  const next = i => (i + 1) % columns;
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < spans; i++) {
      const a = j * columns + i;
      const b = j * columns + next(i);
      const d = a + columns;
      const c = b + columns;
      triangle(a, b, c);
      triangle(a, c, d);
      triangle(a + layerSize, c + layerSize, b + layerSize);
      triangle(a + layerSize, d + layerSize, c + layerSize);
    }
  }
  for (let i = 0; i < spans; i++) {
    const a = i;
    const b = next(i);
    triangle(a, a + layerSize, b + layerSize);
    triangle(a, b + layerSize, b);
    const d = (rows - 1) * columns + i;
    const c = (rows - 1) * columns + next(i);
    triangle(d, c, c + layerSize);
    triangle(d, c + layerSize, d + layerSize);
  }
  for (let j = 0; j < (closed ? 0 : rows - 1); j++) {
    const a = j * columns;
    const d = a + columns;
    triangle(a, d, d + layerSize);
    triangle(a, d + layerSize, a + layerSize);
    const b = a + columns - 1;
    const c = b + columns;
    triangle(b, b + layerSize, c + layerSize);
    triangle(b, c + layerSize, c);
  }
  // A flat panel can be laid on its long edge for printing: a quarter turn
  // about Y (a proper rotation, so the winding stays outward), then back
  // onto Z = 0. The picture is sideways on the plate and still faces -Y.
  if (s.turn && s.shape === 'flat') {
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i], z = vertices[i + 2];
      vertices[i] = z - s.height / 2;
      vertices[i + 2] = s.width / 2 - x;
    }
  }
  const measurement = measure(vertices, indices);
  const { values, ...settings } = s;
  settings.innerRadius = innerRadius;
  return {
    vertices,
    indices,
    thicknesses,
    ...measurement,
    volumeMm3: measurement.signedVolume,
    triangleCount,
    vertexCount,
    grid: { columns, rows, nx: columns, ny: rows, layerSize, horizontal, vertical },
    settings,
  };
}

/** Write an ordinary binary STL, using millimetres by convention.
 * @returns {ArrayBuffer} Ready for new Blob([binarySTL(mesh)], ...).
 */
export function binarySTL(mesh, { header = 'Lumen lithophane | units: mm | upright Z | image faces -Y' } = {}) {
  const { vertices, indices } = mesh;
  if (!vertices || !indices || vertices.length % 3 || indices.length % 3) {
    throw new TypeError('The mesh requires xyz vertices and triangle indices.');
  }
  const count = indices.length / 3;
  if (count > 0xffffffff) throw new RangeError('The mesh has too many triangles for binary STL.');
  const buffer = new ArrayBuffer(84 + count * 50);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < Math.min(80, header.length); i++) {
    const code = header.charCodeAt(i);
    bytes[i] = code >= 32 && code <= 126 ? code : 32;
  }
  const view = new DataView(buffer);
  view.setUint32(80, count, true);
  let offset = 84;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ux = vertices[b] - vertices[a];
    const uy = vertices[b + 1] - vertices[a + 1];
    const uz = vertices[b + 2] - vertices[a + 2];
    const vx = vertices[c] - vertices[a];
    const vy = vertices[c + 1] - vertices[a + 1];
    const vz = vertices[c + 2] - vertices[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const norm = Math.hypot(nx, ny, nz);
    if (!(norm > 0) || !Number.isFinite(norm)) throw new RangeError('Cannot export a degenerate triangle.');
    view.setFloat32(offset, nx / norm, true);
    view.setFloat32(offset + 4, ny / norm, true);
    view.setFloat32(offset + 8, nz / norm, true);
    offset += 12;
    for (const index of [a, b, c]) {
      for (let k = 0; k < 3; k++) {
        const value = vertices[index + k];
        if (!Number.isFinite(value)) throw new RangeError('Cannot export a non-finite vertex.');
        view.setFloat32(offset, value, true);
        offset += 4;
      }
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return buffer;
}
