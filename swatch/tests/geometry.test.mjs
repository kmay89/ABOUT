import test from 'node:test';
import assert from 'node:assert/strict';

const g = await import('../geometry.js');

test('the font knows every character the labels use, three wide and five tall', () => {
  for (const ch of '0123456789.-/%: ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const { pixels, cols, rows } = g.rasterize([ch]);
    assert.equal(cols, 3, `${ch} is 3 wide`); assert.equal(rows, 5);
    if (ch !== ' ') assert.ok(pixels.length > 0, `${ch} has pixels`);
    for (const p of pixels) assert.ok(p.col >= 0 && p.col < 3 && p.row >= 0 && p.row < 5);
  }
});

test('a mirrored label is the label flipped left to right', () => {
  const plain = g.rasterize(['7']).pixels, mirrored = g.rasterize(['7'], { mirror: true }).pixels;
  const flip = new Set(plain.map(p => `${2 - p.col},${p.row}`));
  assert.equal(mirrored.length, plain.length);
  for (const p of mirrored) assert.ok(flip.has(`${p.col},${p.row}`));
});

test('two lines stack with a gap and centre on the longer', () => {
  const { pixels, cols, rows } = g.rasterize(['1.05', '0']);
  assert.equal(cols, 15); assert.equal(rows, 11);
  const second = pixels.filter(p => p.row >= 6);
  assert.ok(second.every(p => p.col >= 6 && p.col <= 8), 'the 0 sits in the middle under 1.05');
});

test('a box and a prism are closed solids with the volume they should have', () => {
  const b = g.box(g.emptyMesh(), 0, 0, 0, 2, 3, 4);
  assert.ok(g.isClosed(b)); assert.ok(Math.abs(g.volume(b) - 24) < 1e-9);
  const p = g.prism(g.emptyMesh(), 0, 0, 10, 0, 5, 360);
  assert.ok(g.isClosed(p)); assert.ok(Math.abs(g.volume(p) - Math.PI * 100 * 5) / (Math.PI * 500) < 2e-4);
});

test('every coupon kind is closed, wound outward, standing on z = 0, and labelled', () => {
  const kinds = [['tile', {}], ['stencil', {}], ['pillar', {}], ['cylinder', {}], ['gauge', {}], ['socket', { clearance: 0.2 }]];
  for (const [kind, opts] of kinds) {
    const { mesh, size, lines } = g.COUPONS[kind]({ ...opts, label: ['1.05', 'ARCH'] });
    assert.ok(g.isClosed(mesh), `${kind} closed`);
    assert.ok(g.volume(mesh) > 0, `${kind} outward`);
    const [lo, hi] = g.bounds(mesh);
    assert.ok(Math.abs(lo[2]) < 1e-9, `${kind} stands on the plate`);
    assert.ok(Math.abs(hi[2] - size[2]) < 1e-9, `${kind} is as tall as it says`);
    assert.ok(Math.abs(hi[0] - lo[0] - size[0]) < 1e-9 && Math.abs(hi[1] - lo[1] - size[1]) < 1e-9, `${kind} is as big as it says`);
    assert.ok(Math.abs(lo[0] + hi[0]) < 1e-9 && Math.abs(lo[1] + hi[1]) < 1e-9, `${kind} is centred`);
    assert.ok(lines.length >= 1 && lines.length <= 2);
  }
});

test('a tile label stays below the test surface, and a stencil label is holes through the whole tile', () => {
  const tile = g.tileCoupon({ h: 2.4, label: ['40', '12'] });
  const [, hi] = g.bounds(tile.mesh);
  assert.ok(Math.abs(hi[2] - 2.4) < 1e-9, 'nothing rises above the slab');
  const stencil = g.stencilCoupon({ w: 26, d: 30, h: 1.2, label: ['1.05'] });
  // every box in the stencil spans the full height
  const v = stencil.mesh.vertices;
  const zs = new Set();
  for (let i = 2; i < v.length; i += 3) zs.add(Math.round(v[i] * 1000));
  assert.deepEqual([...zs].sort((a, b) => a - b), [0, 1200]);
  assert.ok(g.volume(stencil.mesh) < 26 * 30 * 1.2, 'the label took something out');
  assert.ok(g.volume(stencil.mesh) > 26 * 30 * 1.2 * 0.9, 'but not much');
});

test('a label layout fits the room: one line when it can, two when it must, never below the minimum pixel', () => {
  const one = g.layoutLabel(['40', '12'], 23);
  assert.equal(one.lines.length, 1); assert.equal(one.px, 1);
  const two = g.layoutLabel(['1.05', '100'], 23);
  assert.equal(two.lines.length, 2); assert.ok(two.px >= 0.85);
  const forced = g.layoutLabel(['40', '12'], 23, { lines: 2, px: 0.9 });
  assert.equal(forced.lines.length, 2); assert.equal(forced.px, 0.9);
});

test('the STL of a coupon has one record per triangle', () => {
  const { mesh } = g.pillarCoupon({ label: ['60', '.42'] });
  const stl = g.binarySTL(mesh);
  assert.equal(stl.byteLength, 84 + 50 * (mesh.indices.length / 3));
  assert.equal(new DataView(stl).getUint32(80, true), mesh.indices.length / 3);
});

test('a block with a hole is one closed shell whose volume is the block less the hole, with sharp corners', () => {
  const m = g.holedBlock(g.emptyMesh(), { w: 30, d: 24, h: 4, cx: -7, cy: 0, r: 5, n: 360 });
  assert.ok(g.isClosed(m));
  const expect = 30 * 24 * 4 - Math.PI * 25 * 4;
  assert.ok(Math.abs(g.volume(m) - expect) / expect < 2e-4);
  const [lo, hi] = g.bounds(m);
  assert.deepEqual([lo[0], lo[1], hi[0], hi[1]].map(v => Math.round(v * 1000) / 1000), [-15, -12, 15, 12]);
  const corner = m.vertices.some((v, i) => i % 3 === 0 && Math.abs(v - 15) < 1e-9 && Math.abs(m.vertices[i + 1] - 12) < 1e-9);
  assert.ok(corner, 'the rectangle keeps its corner');
});

test('a socket\u2019s hole is the peg plus the clearance, and the peg stands clear of the block', () => {
  const a = g.socketCoupon({ clearance: 0.1, label: ['.10'] }), b = g.socketCoupon({ clearance: 0.4, label: ['.40'] });
  assert.ok(g.isClosed(a.mesh) && g.isClosed(b.mesh));
  const dv = g.volume(a.mesh) - g.volume(b.mesh);
  const expect = Math.PI * 8 * ((8.4 / 2) ** 2 - (8.1 / 2) ** 2);
  assert.ok(Math.abs(dv - expect) / expect < 0.02, 'the volume difference is the ring between the two holes');
  assert.equal(a.measure.peg, 8);
});
