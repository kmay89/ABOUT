import test from 'node:test';
import assert from 'node:assert/strict';
import { weld, parseModel, parseAsciiSTL, parseOBJ, binarySTL, bounds, signedVolume, surfaceArea, watertight, components, transform, rotationMatrix, merge, invert } from '../mesh.js';
import { extrude, lathe, SAMPLES } from '../samples.js';

const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b} ± ${tol}, got ${a}`);
const box = () => extrude([[0, 0], [20, 0], [20, 10], [0, 10]], 0, 5);

test('weld shares vertices and drops degenerate triangles', () => {
  const soup = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1]);
  const m = weld(soup);
  assert.equal(m.positions.length / 3, 4);
  assert.equal(m.indices.length / 3, 2);
});

test('a box extrusion is closed with the right volume and area', () => {
  const m = box();
  assert.ok(watertight(m).closed);
  near(signedVolume(m), 1000, 1e-6, 'volume');
  near(surfaceArea(m), 2 * (200 + 100 + 50), 1e-6, 'area');
  assert.deepEqual(bounds(m).size, [20, 10, 5]);
});

test('binary STL round-trips through the parser', () => {
  const m = box();
  const bytes = binarySTL(m, 'test');
  assert.equal(bytes.byteLength, 84 + m.indices.length / 3 * 50);
  const back = parseModel(bytes, 'box.stl');
  assert.equal(back.indices.length, m.indices.length);
  near(signedVolume(back), 1000, 1e-4);
  assert.ok(watertight(back).closed);
});

test('ASCII STL and OBJ parse, including negative OBJ indices and quads', () => {
  const ascii = `solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n`;
  const m = parseAsciiSTL(ascii);
  assert.equal(m.indices.length, 3);
  const detected = parseModel(new TextEncoder().encode(ascii), 'thing.stl');
  assert.equal(detected.indices.length, 3);
  const obj = `v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\nf -4 -3 -2\n`;
  const o = parseOBJ(obj);
  assert.equal(o.indices.length / 3, 3);
  assert.equal(parseModel(new TextEncoder().encode(obj), 'thing.obj').indices.length / 3, 3);
});

test('watertight reports open edges and inconsistent winding', () => {
  const m = box();
  const open = { positions: m.positions, indices: m.indices.slice(3) };
  assert.equal(watertight(open).boundaryEdges, 3);
  const bad = { positions: m.positions, indices: Uint32Array.from(m.indices) };
  [bad.indices[1], bad.indices[2]] = [bad.indices[2], bad.indices[1]];
  assert.ok(watertight(bad).inconsistentEdges > 0);
  assert.ok(!watertight(bad).closed);
});

test('components splits separate shells, largest first', () => {
  const a = box(), b = transform(extrude([[0, 0], [5, 0], [5, 5], [0, 5]], 0, 5), undefined, [50, 0, 0]);
  const parts = components(merge([b, a]));
  assert.equal(parts.length, 2);
  near(signedVolume(parts[0]), 1000, 1e-6);
  near(signedVolume(parts[1]), 125, 1e-6);
});

test('a mirroring transform keeps faces outward; invert turns them in', () => {
  const m = box();
  const mirrored = transform(m, [-1, 0, 0, 0, 1, 0, 0, 0, 1]);
  near(signedVolume(mirrored), 1000, 1e-6, 'mirrored volume stays positive');
  near(signedVolume(invert(m)), -1000, 1e-6, 'inverted volume is negative');
  const turned = transform(m, rotationMatrix('z', 90));
  near(bounds(turned).size[0], 10, 1e-4); near(bounds(turned).size[1], 20, 1e-4);
});

test('every sample is a closed, outward solid that sits on Z = 0', () => {
  for (const [key, s] of Object.entries(SAMPLES)) {
    const m = s.make();
    const w = watertight(m);
    assert.ok(w.closed, `${key}: ${JSON.stringify(w)}`);
    assert.ok(signedVolume(m) > 0, `${key} volume`);
    near(bounds(m).min[2], 0, 1e-6, `${key} base`);
  }
  // a lathe of a cylinder has the cylinder's volume
  const cyl = lathe([[0, 0], [10, 0], [10, 20], [0, 20]], 256);
  near(signedVolume(cyl), Math.PI * 100 * 20, 30, 'cylinder volume');
});
