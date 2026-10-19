import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Load the browser ESM source independently of the hosting package's module type.
const source = await readFile(new URL('../mesh.js', import.meta.url), 'utf8');
const { buildMesh, binarySTL, estimateGrid, MAX_VERTICES } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function near(actual, expected, tolerance = 1e-5, message = '') {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} Expected ${expected}, received ${actual}`);
}

function point(mesh, layer, i, j) {
  const { columns, rows } = mesh.grid;
  const index = ((layer * columns * rows) + j * columns + i) * 3;
  return Array.from(mesh.vertices.slice(index, index + 3));
}

function normal(mesh, index) {
  const triangle = Array.from(mesh.indices.slice(index * 3, index * 3 + 3));
  const p = triangle.map(i => Array.from(mesh.vertices.slice(i * 3, i * 3 + 3)));
  const u = p[1].map((v, k) => v - p[0][k]);
  const v = p[2].map((v, k) => v - p[0][k]);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

function assertSolid(mesh) {
  const { vertices, indices, vertexCount, triangleCount } = mesh;
  assert.equal(vertices.length, vertexCount * 3);
  assert.equal(indices.length, triangleCount * 3);
  assert.ok(vertices.every(Number.isFinite));
  assert.ok(mesh.signedVolume > 0);
  const edges = new Map();
  const used = new Set();
  let originVolume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const tri = Array.from(indices.slice(i, i + 3));
    assert.equal(new Set(tri).size, 3);
    const n = normal(mesh, i / 3);
    assert.ok(Math.hypot(...n) > 0, `Triangle ${i / 3} has zero area`);
    for (let k = 0; k < 3; k++) {
      const a = tri[k];
      const b = tri[(k + 1) % 3];
      assert.ok(a < vertexCount && b < vertexCount);
      used.add(a);
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const edge = edges.get(key) ?? { count: 0, direction: 0 };
      edge.count++;
      edge.direction += a < b ? 1 : -1;
      edges.set(key, edge);
    }
    const a = tri[0] * 3;
    originVolume += (vertices[a] * n[0] + vertices[a + 1] * n[1] + vertices[a + 2] * n[2]) / 6;
  }
  for (const [key, edge] of edges) {
    assert.equal(edge.count, 2, `Edge ${key} must have exactly two incident faces`);
    assert.equal(edge.direction, 0, `Edge ${key} must be used in opposite directions`);
  }
  assert.equal(used.size, vertexCount, 'No unused vertices');
  // A lamp is a ring: one closed surface with a hole through it (genus one).
  const euler = mesh.settings.shape === 'cylinder' ? 0 : 2;
  assert.equal(vertexCount - edges.size + triangleCount, euler, 'One closed surface of the expected genus');
  near(originVolume, mesh.signedVolume, mesh.signedVolume * 1e-8 + 1e-5, 'Independent volume');
  near(mesh.bounds.min[2], 0);
  near(mesh.bounds.max[2], mesh.settings.height);
}

const field = { nx: 4, ny: 3, values: new Float32Array([0, 0.25, 0.5, 1, 1, 0.7, 0.2, 0, 0.3, 1, 0.6, 0.1]) };

for (const preset of [
  { name: 'flat picture panel', shape: 'flat', width: 120, height: 90, border: 3, resolution: 2 },
  { name: 'borderless tiny panel', shape: 'flat', width: 20, height: 16, border: 0, resolution: 1 },
  { name: 'flat coarse rail', shape: 'flat', width: 17, height: 13, border: 0.4, resolution: 5 },
  { name: '90 degree nightlight', shape: 'curved', angleDeg: 90, width: 110, height: 90, border: 3, resolution: 2 },
  { name: '180 degree half cylinder', shape: 'curved', angleDeg: 180, width: 170, height: 120, border: 2, resolution: 3 },
  { name: '15 degree shallow curve', shape: 'curved', angleDeg: 15, width: 170, height: 120, border: 2, resolution: 3 },
]) {
  test(`${preset.name}: manifold, positive volume, consistent winding, finite bounds`, () => {
    assertSolid(buildMesh({ ...preset, ...field }));
  });
}

test('flat uniform panel has the exact cuboid volume and outward front normal', () => {
  const mesh = buildMesh({ width: 60, height: 40, border: 0, minThickness: 2, maxThickness: 2, resolution: 3 });
  near(mesh.signedVolume, 60 * 40 * 2, 1e-6);
  assert.deepEqual(mesh.bounds.min, [-30, -2, 0]);
  assert.deepEqual(mesh.bounds.max, [30, 0, 40]);
  assert.ok(normal(mesh, 0)[1] < 0, 'The exterior/front normal faces negative Y');
  assert.ok(normal(mesh, 2)[1] > 0, 'The back normal faces positive Y');
});

test('white is thin, black is thick; uploaded image stays upright and unmirrored', () => {
  // Top: black left, white right. Bottom: 25% left, 75% right.
  const mesh = buildMesh({ width: 8, height: 6, border: 0, minThickness: 1, maxThickness: 5, resolution: 2, nx: 2, ny: 2, values: [0, 1, 0.25, 0.75] });
  const right = mesh.grid.columns - 1;
  const top = mesh.grid.rows - 1;
  near(point(mesh, 0, 0, top)[1], -5, 0, 'Top-left black');
  near(point(mesh, 0, right, top)[1], -1, 0, 'Top-right white');
  near(point(mesh, 0, 0, 0)[1], -4, 0, 'Bottom-left');
  near(point(mesh, 0, right, 0)[1], -2, 0, 'Bottom-right');
  assert.ok(point(mesh, 0, 0, top)[0] < point(mesh, 0, right, top)[0]);
  near(point(mesh, 0, 0, top)[2], 6, 0);
});

test('bilinear image interpolation preserves a constant or one-pixel image', () => {
  const options = { width: 9, height: 9, border: 0, minThickness: 1, maxThickness: 3, resolution: 1 };
  const a = buildMesh({ ...options, nx: 1, ny: 1, values: [0.25] });
  for (let i = 0; i < a.grid.columns * a.grid.rows; i++) near(a.vertices[i * 3 + 1], -2.5);
  const b = buildMesh({ ...options, nx: 2, ny: 2, values: [0, 1, 1, 0] });
  // At one third across and one third up, bilinear interpolation gives 5/9 white.
  near(point(b, 0, 3, 3)[1], -(1 + 2 * 4 / 9));
});

test('curved thickness is radial, inside radius is exact, and the outside image is not mirrored', () => {
  const options = { shape: 'curved', angleDeg: 120, width: 90, height: 30, border: 0, resolution: 3, minThickness: 1, maxThickness: 4, nx: 2, ny: 2, values: [0, 1, 0.5, 0.25] };
  const mesh = buildMesh(options);
  const r = 90 / (120 * Math.PI / 180);
  near(mesh.settings.innerRadius, r, 1e-10);
  const top = mesh.grid.rows - 1;
  const right = mesh.grid.columns - 1;
  for (let j = 0; j < mesh.grid.rows; j++) {
    for (let i = 0; i < mesh.grid.columns; i++) {
      const back = point(mesh, 1, i, j);
      near(Math.hypot(back[0], back[1] - r), r, 4e-6);
    }
  }
  const frontLeft = point(mesh, 0, 0, top);
  const frontRight = point(mesh, 0, right, top);
  near(Math.hypot(frontLeft[0], frontLeft[1] - r) - r, 4, 4e-6);
  near(Math.hypot(frontRight[0], frontRight[1] - r) - r, 1, 4e-6);
  assert.ok(frontLeft[0] < 0 && frontRight[0] > 0, 'Image left and right follow the outside view');
  const center = Math.floor(mesh.grid.columns / 2);
  near(point(mesh, 1, center, top)[1], 0);
  assert.ok(point(mesh, 0, center, top)[1] < 0);
  assert.ok(point(mesh, 1, 0, top)[1] > 0 && point(mesh, 1, right, top)[1] > 0);
});

test('uniform curve volume agrees with the known polygonal annular sector', () => {
  const mesh = buildMesh({ shape: 'curved', width: 120, height: 70, angleDeg: 180, border: 0, minThickness: 2, maxThickness: 2, resolution: 2 });
  const n = mesh.grid.columns - 1;
  const theta = Math.PI;
  const r = 120 / theta;
  const exactFaceted = n * Math.sin(theta / n) * ((r + 2) ** 2 - r ** 2) * 70 / 2;
  near(mesh.signedVolume, exactFaceted, exactFaceted * 2e-6);
});

test('border breakpoints and integral rail remain present below the sample spacing', () => {
  const mesh = buildMesh({ width: 17, height: 13, border: 0.4, borderThickness: 4, minThickness: 0.8, maxThickness: 3, resolution: 5, nx: 1, ny: 1, values: [1] });
  assert.ok(Array.from(mesh.grid.horizontal).includes(0.4));
  assert.ok(Array.from(mesh.grid.horizontal).includes(16.6));
  assert.ok(Array.from(mesh.grid.vertical).includes(0.4));
  assert.ok(Array.from(mesh.grid.vertical).includes(12.6));
  const { columns, rows, horizontal, vertical } = mesh.grid;
  let photoPoints = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const rail = horizontal[i] <= 0.4 || horizontal[i] >= 16.6 || vertical[j] <= 0.4 || vertical[j] >= 12.6;
      near(point(mesh, 0, i, j)[1], rail ? -4 : -0.8);
      if (!rail) photoPoints++;
    }
  }
  assert.ok(photoPoints > 0);
  assertSolid(mesh);
});

test('binary STL round-trips every triangle, outward unit normal, and zero attribute bytes', () => {
  const mesh = buildMesh({ shape: 'curved', width: 16, height: 12, border: 1, resolution: 2, ...field });
  const buffer = binarySTL(mesh);
  assert.ok(buffer instanceof ArrayBuffer);
  assert.equal(buffer.byteLength, 84 + 50 * mesh.triangleCount);
  const view = new DataView(buffer);
  assert.equal(view.getUint32(80, true), mesh.triangleCount);
  for (let i = 0; i < mesh.triangleCount; i++) {
    let at = 84 + 50 * i;
    const n = [0, 4, 8].map(offset => view.getFloat32(at + offset, true));
    near(Math.hypot(...n), 1, 1e-6);
    const expected = normal(mesh, i);
    assert.ok(n.reduce((sum, value, k) => sum + value * expected[k], 0) > 0);
    at += 12;
    for (let k = 0; k < 3; k++) {
      const index = mesh.indices[i * 3 + k] * 3;
      for (let axis = 0; axis < 3; axis++) {
        assert.equal(view.getFloat32(at, true), mesh.vertices[index + axis]);
        at += 4;
      }
    }
    assert.equal(view.getUint16(at, true), 0);
  }
});

test('invalid images, dimensions, thickness, curvature, and excessive density are rejected', () => {
  for (const options of [
    { width: NaN }, { height: Infinity }, { width: 0 }, { width: -2 },
    { minThickness: 0 }, { minThickness: 4, maxThickness: 3 },
    { border: -1 }, { width: 10, border: 5 }, { borderThickness: 0 },
    { resolution: 0 }, { shape: 'sphere' }, { angleDeg: NaN },
    { shape: 'curved', angleDeg: 14.9 }, { shape: 'curved', angleDeg: 180.1 },
    { nx: 2, ny: 2, values: [1] }, { nx: 0, ny: 1, values: [] },
    { nx: 1, ny: 1, values: [NaN] }, { nx: 1, ny: 1, values: [1.1] },
    { nx: 1, ny: 1, values: [-0.1] }, { values: [1] },
    { width: 250, height: 250, resolution: 0.01 },
    { width: 1e20, resolution: 0.25 },
  ]) {
    assert.throws(() => buildMesh(options), { name: 'RangeError' }, JSON.stringify(options));
  }
  assert.throws(() => buildMesh(null), { name: 'TypeError' });
  assert.throws(() => binarySTL({ vertices: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) }), /degenerate/);
  assert.equal(MAX_VERTICES, 1_200_000);
});

test('a realistic export stays within the declared vertex and volume budgets', () => {
  const mesh = buildMesh({ width: 120, height: 100, shape: 'curved', angleDeg: 90, resolution: 0.25, ...field });
  assert.ok(mesh.vertexCount < MAX_VERTICES);
  assert.ok(mesh.triangleCount < 800_000);
  assert.ok(mesh.signedVolume > 120 * 100 * 0.8);
  assert.ok(mesh.signedVolume < 120 * 100 * 3 * 1.1);
});

test('grid estimator agrees exactly with the mesh and supplies a spacing that meets the limit', () => {
  const options = { width: 120, height: 90, border: 2.7, resolution: 1.3 };
  const estimate = estimateGrid(options);
  const mesh = buildMesh(options);
  assert.equal(estimate.vertexCount, mesh.vertexCount);
  assert.equal(estimate.triangleCount, mesh.triangleCount);
  assert.equal(estimate.stlBytes, binarySTL(mesh).byteLength);
  assert.equal(estimate.withinLimit, true);
  assert.equal(estimate.suggestedResolution, options.resolution);
  const large = estimateGrid({ width: 127, height: 177.8, resolution: 0.15 });
  assert.equal(large.withinLimit, false);
  assert.ok(large.suggestedResolution > 0.15);
  const adjusted = estimateGrid({ width: 127, height: 177.8, resolution: large.suggestedResolution });
  assert.equal(adjusted.withinLimit, true);
});

test('preview thicknesses match corresponding front/back vertices', () => {
  const mesh = buildMesh({ width: 24, height: 18, border: 2, resolution: 1, ...field });
  assert.equal(mesh.thicknesses.length, mesh.vertexCount);
  for (let i = 0; i < mesh.grid.layerSize; i++) {
    near(mesh.thicknesses[i], -mesh.vertices[i * 3 + 1]);
    near(mesh.thicknesses[i + mesh.grid.layerSize], mesh.thicknesses[i]);
  }
});

test('a lamp is one closed ring: exact inside radius, borders only top and bottom, estimator agrees', () => {
  const options = { shape: 'cylinder', width: Math.PI * 80, height: 100, border: 3, resolution: 2, minThickness: 0.8, maxThickness: 3, ...field };
  const mesh = buildMesh(options);
  assertSolid(mesh);
  near(mesh.settings.innerRadius, 40, 1e-9, 'Inside radius');
  const { columns, layerSize } = mesh.grid;
  for (let i = 0; i < layerSize; i++) {
    const b = Array.from(mesh.vertices.slice((layerSize + i) * 3, (layerSize + i) * 3 + 3));
    near(Math.hypot(b[0], b[1] - 40), 40, 1e-3, 'Back surface on the inside circle');
  }
  // No side border: the middle row reads the photo all the way round, seam included.
  const middle = Math.floor(mesh.grid.rows / 2) * columns;
  assert.ok(mesh.thicknesses[middle] < 3, 'The seam column carries the photo, not a rail');
  near(mesh.bounds.size[0], 86, 0.1, 'Outside diameter');
  const estimate = estimateGrid(options);
  assert.equal(estimate.vertexCount, mesh.vertexCount);
  assert.equal(estimate.triangleCount, mesh.triangleCount);
  const stl = new DataView(binarySTL(mesh));
  assert.equal(stl.getUint32(80, true), mesh.triangleCount);
});
