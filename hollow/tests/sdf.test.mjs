import test from 'node:test';
import assert from 'node:assert/strict';
import { gridFor, spacingFor, distanceField, insideField, signedDistanceField, shapes, apply } from '../sdf.js';
import { extrude, lathe } from '../samples.js';
import { transform, rotationMatrix, bounds } from '../mesh.js';

const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b} ± ${tol}, got ${a}`);

test('the grid covers the box with a margin and never lands nodes on round numbers', () => {
  const g = gridFor([0, 0, 0], [10, 10, 10], 1, 2);
  assert.ok(g.x(0) < -2 && g.x(g.nx - 1) > 12);
  assert.ok(Math.abs(g.x(3) - Math.round(g.x(3))) > 0.05);
  const [lo, hi] = g.range(0, 1, 2.5);
  assert.ok(g.x(lo) <= 1 && g.x(hi) >= 2.5);
});

test('spacingFor keeps the node count under budget', () => {
  const h = spacingFor([100, 100, 100], 1_000_000, 0.3);
  assert.ok(h > 0.3);
  const n = Math.ceil(100 / h) + 3;
  assert.ok(n ** 3 <= 1_000_000);
  assert.equal(spacingFor([10, 10, 10], 1e9, 0.3), 0.3);
});

test('the signed distance of a tilted box matches the analytic one in the band', () => {
  const deg = 30, h = 0.5;
  const m = transform(extrude([[-20, -15], [20, -15], [20, 15], [-20, 15]], 0, 20), rotationMatrix('y', deg));
  const b = bounds(m);
  const grid = gridFor(b.min, b.max, h, 3);
  const { sdf, disagreement } = signedDistanceField(m, grid, 1.5);
  assert.equal(disagreement, 0);
  const r = -deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  let maxErr = 0, checked = 0;
  for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    const x = grid.x(i), y = grid.y(j), z = grid.z(k);
    const exact = shapes.box(c * x + s * z, y, -s * x + c * z, [0, 0, 10], [20, 15, 10]);
    if (Math.abs(exact) < 1.2) { checked++; maxErr = Math.max(maxErr, Math.abs(sdf[grid.index(i, j, k)] - exact)); }
  }
  assert.ok(checked > 1000);
  assert.ok(maxErr < 1e-3, `max error ${maxErr}`);
});

test('inside is decided by vote, so a shell with a hole still fills', () => {
  const m = lathe([[0, 0], [10, 0], [10, 20], [0, 20]], 48);
  const holed = { positions: m.positions, indices: m.indices.slice(0, m.indices.length - 30) }; // tear ten triangles out
  const b = bounds(m);
  const grid = gridFor(b.min, b.max, 0.8, 2);
  const { inside } = insideField(holed, grid);
  let filled = 0, total = 0;
  for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    const x = grid.x(i), y = grid.y(j), z = grid.z(k);
    if (Math.hypot(x, y) < 9 && z > 1 && z < 19) { total++; filled += inside[grid.index(i, j, k)]; }
  }
  assert.ok(filled / total > 0.98, `${filled} of ${total} interior nodes marked inside`);
});

test('distanceField is unsigned and clamps to the band', () => {
  const m = extrude([[0, 0], [10, 0], [10, 10], [0, 10]], 0, 10);
  const grid = gridFor([0, 0, 0], [10, 10, 10], 1, 4);
  const d = distanceField(m, grid, 2);
  let max = -Infinity, min = Infinity;
  for (const v of d) { max = Math.max(max, v); min = Math.min(min, v); }
  assert.ok(min >= 0 && max <= 2 + 1e-9);
});

test('analytic shapes measure what they say', () => {
  near(shapes.sphere(3, 0, 0, [0, 0, 0], 1), 2, 1e-12);
  near(shapes.box(0, 0, 0, [0, 0, 0], [1, 2, 3]), -1, 1e-12);
  near(shapes.box(2, 0, 0, [0, 0, 0], [1, 2, 3]), 1, 1e-12);
  // a cylinder along z, radius 2, from z 0 to 10
  near(shapes.cone(3, 0, 5, [0, 0, 0], [0, 0, 10], 2, 2), 1, 1e-9, 'beside the cylinder');
  near(shapes.cone(0, 0, 12, [0, 0, 0], [0, 0, 10], 2, 2), 2, 1e-9, 'past the end');
  assert.ok(shapes.cone(0, 0, 5, [0, 0, 0], [0, 0, 10], 2, 2) < 0, 'inside');
  // a cone: radius 4 at the base, 0 at the tip
  assert.ok(shapes.cone(0, 0, 9.5, [0, 0, 0], [0, 0, 10], 4, 0.01) < 0);
  assert.ok(shapes.cone(3, 0, 9, [0, 0, 0], [0, 0, 10], 4, 0.01) > 0);
  near(shapes.halfspace(0, 0, 3, [0, 0, 1], [0, 0, 1]), 2, 1e-12);
  near(shapes.roundedBoxXY(0, 0, 0, [0, 0, 0], [5, 5, 5], 2), -5, 1e-12);
  near(shapes.roundedBoxXY(5, 5, 0, [0, 0, 0], [5, 5, 5], 2), Math.SQRT2 * 2 - 2, 1e-12, 'a rounded corner is cut back');
  // a rectangular ring 1 wide on the outline of a 10×10 box
  assert.ok(shapes.rectRing(5, 0, 1, [0, 0, 0], [5, 5, 5], 0, 1, 0, 2) < 0);
  assert.ok(shapes.rectRing(3, 0, 1, [0, 0, 0], [5, 5, 5], 0, 1, 0, 2) > 0);
});

test('apply unions, cuts and intersects over the shape box only', () => {
  const grid = gridFor([-5, -5, -5], [5, 5, 5], 1, 0);
  const field = new Float32Array(grid.count).fill(10);
  apply(field, grid, 'union', [-1, -1, -1], [1, 1, 1], (x, y, z) => shapes.sphere(x, y, z, [0, 0, 0], 1));
  const inside = field[grid.index(Math.round(-grid.origin[0]), Math.round(-grid.origin[1]), Math.round(-grid.origin[2]))];
  assert.ok(inside < 0);
  assert.equal(field[0], 10);
  apply(field, grid, 'cut', [-1, -1, -1], [1, 1, 1], (x, y, z) => shapes.sphere(x, y, z, [0, 0, 0], 2));
  assert.ok(field[grid.index(Math.round(-grid.origin[0]), Math.round(-grid.origin[1]), Math.round(-grid.origin[2]))] > 0);
});
