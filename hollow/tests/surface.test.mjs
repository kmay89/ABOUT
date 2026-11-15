import test from 'node:test';
import assert from 'node:assert/strict';
import { gridFor, shapes, signedDistanceField } from '../sdf.js';
import { marchingTetrahedra } from '../mc.js';
import { decimate } from '../decimate.js';
import { watertight, signedVolume, bounds, transform, rotationMatrix } from '../mesh.js';
import { extrude } from '../samples.js';

const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b} ± ${tol}, got ${a}`);

function fieldOf(grid, fn) {
  const f = new Float32Array(grid.count);
  for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) f[grid.index(i, j, k)] = fn(grid.x(i), grid.y(j), grid.z(k));
  return f;
}

test('marching tetrahedra traces a sphere as a closed solid with the right volume', () => {
  const R = 12, h = 0.5;
  const grid = gridFor([-R, -R, -R], [R, R, R], h, 3);
  const mesh = marchingTetrahedra(fieldOf(grid, (x, y, z) => shapes.sphere(x, y, z, [0, 0, 0], R)), grid);
  const w = watertight(mesh);
  assert.ok(w.closed, JSON.stringify(w));
  near(signedVolume(mesh), 4 / 3 * Math.PI * R ** 3, 4 / 3 * Math.PI * R ** 3 * 0.01, 'volume');
  const b = bounds(mesh);
  near(b.size[0], 2 * R, 2 * h); near(b.size[2], 2 * R, 2 * h);
});

test('an empty or full field gives no triangles', () => {
  const grid = gridFor([0, 0, 0], [5, 5, 5], 1, 1);
  assert.equal(marchingTetrahedra(new Float32Array(grid.count).fill(1), grid).indices.length, 0);
  assert.equal(marchingTetrahedra(new Float32Array(grid.count).fill(-1), grid).indices.length, 0);
});

test('decimation keeps a sphere closed and within tolerance, with far fewer triangles', () => {
  const R = 12, h = 0.5;
  const grid = gridFor([-R, -R, -R], [R, R, R], h, 3);
  const raw = marchingTetrahedra(fieldOf(grid, (x, y, z) => shapes.sphere(x, y, z, [0, 0, 0], R)), grid);
  const mesh = decimate(raw, { tolerance: 0.02 });
  assert.ok(watertight(mesh).closed);
  assert.ok(mesh.indices.length < raw.indices.length / 8, `${raw.indices.length / 3} → ${mesh.indices.length / 3}`);
  near(signedVolume(mesh), signedVolume(raw), signedVolume(raw) * 0.003, 'volume kept');
  // every vertex stays near the sphere
  let worst = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) worst = Math.max(worst, Math.abs(Math.hypot(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]) - R));
  assert.ok(worst < 0.12, `worst radial error ${worst}`);
});

test('a flat box collapses to a few dozen triangles, tilted or not', () => {
  const h = 0.5;
  for (const deg of [0, 30]) {
    const grid = gridFor([-25, -20, -12], [25, 20, 12], h, 3);
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const f = fieldOf(grid, (x, y, z) => shapes.box(c * x + s * z, y, -s * x + c * z, [0, 0, 0], [14, 10, 6]));
    const raw = marchingTetrahedra(f, grid);
    const mesh = decimate(raw, { tolerance: 0.02 });
    assert.ok(watertight(mesh).closed, `tilt ${deg}`);
    assert.ok(mesh.indices.length / 3 < (deg ? 4000 : 120), `tilt ${deg}: ${mesh.indices.length / 3} triangles from ${raw.indices.length / 3}`);
    near(signedVolume(mesh), 28 * 20 * 12, 28 * 20 * 12 * 0.01, `tilt ${deg} volume`);
  }
});

test('a model goes round the whole pipeline and comes back the same size', () => {
  const m = transform(extrude([[0, 0], [30, 0], [30, 20], [15, 28], [0, 20]], 0, 15), rotationMatrix('z', 17));
  const b = bounds(m), h = 0.4;
  const grid = gridFor(b.min, b.max, h, 3);
  const { sdf } = signedDistanceField(m, grid, 1.2);
  const mesh = decimate(marchingTetrahedra(sdf, grid), { tolerance: 0.02 });
  assert.ok(watertight(mesh).closed);
  near(signedVolume(mesh), signedVolume(m), signedVolume(m) * 0.01, 'volume');
  const bb = bounds(mesh);
  for (let c = 0; c < 3; c++) near(bb.size[c], b.size[c], h, `size ${c}`);
});

test('decimation honours a triangle budget', () => {
  const R = 10, h = 0.5;
  const grid = gridFor([-R, -R, -R], [R, R, R], h, 3);
  const raw = marchingTetrahedra(fieldOf(grid, (x, y, z) => shapes.sphere(x, y, z, [0, 0, 0], R)), grid);
  const mesh = decimate(raw, { tolerance: 0.001, maxTriangles: 2000 });
  assert.ok(mesh.indices.length / 3 <= 2000);
  assert.ok(watertight(mesh).closed);
});
