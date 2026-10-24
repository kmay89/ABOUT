import test from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../mesh.js');
const I = await import('../inlay.js');
const X = await import('../textures.js');
const { roundedBox, revolve } = await import('../samples.js');

const count = g => g.data.reduce((a, b) => a + b, 0);

test('the footprint rasterises the bottom face to within a cell of its true area', () => {
  const m = roundedBox(60, 40, 24, 6), fp = I.footprint(m, { cell: 0.25 });
  const area = count(fp) * fp.cell * fp.cell, expect = 60 * 40 - (4 - Math.PI) * 36;
  assert.ok(Math.abs(area - expect) / expect < 0.01, `area ${area} vs ${expect}`);
  // a one-cell empty rim all round
  for (let x = 0; x < fp.width; x++) assert.equal(fp.data[x] | fp.data[(fp.height - 1) * fp.width + x], 0);
  for (let y = 0; y < fp.height; y++) assert.equal(fp.data[y * fp.width] | fp.data[y * fp.width + fp.width - 1], 0);
  const ring = revolve([[0, 0], [20, 0], [20, 5], [0, 5]], 64);
  const fr = I.footprint(ring);
  assert.ok(Math.abs(count(fr) * 0.0625 - Math.PI * 400) / (Math.PI * 400) < 0.01, 'a disc');
});

test('erode shrinks by r cells and unpinch removes corner-only touches', () => {
  const g = { width: 9, height: 9, data: new Uint8Array(81) };
  for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) g.data[y * 9 + x] = 1;
  const e = I.erode(g, 1);
  assert.equal(count(e), 25);
  assert.equal(count(I.erode(g, 3)), 1);
  const p = { width: 4, height: 4, data: new Uint8Array(16) };
  p.data[1 * 4 + 1] = 1; p.data[2 * 4 + 2] = 1; // two cells kissing at a corner
  const u = I.unpinch(p);
  assert.ok(count(u) >= 3, 'a cell was filled to join them');
  const solid = I.rasterSolid(u, { z0: 0, height: 0.4 });
  const w = M.watertight(solid);
  assert.ok(w.closed && w.nonManifoldEdges === 0, 'the solid is manifold after unpinch');
});

test('the raster solid is closed, right-handed and has exactly area × height volume', () => {
  const m = roundedBox(60, 40, 24, 6);
  for (const pattern of ['hexgrid', 'dots', 'stripes', 'checker', 'diamonds', 'rings', 'waves', 'border']) {
    const r = I.buildInlay(m, { pattern, period: 6, weight: 0.3, layers: 2, margin: 1 });
    const w = M.watertight(r.mesh);
    assert.ok(w.closed, `${pattern} closed`);
    assert.equal(w.nonManifoldEdges, 0, `${pattern} manifold`);
    assert.equal(w.inconsistentEdges, 0, `${pattern} consistent`);
    const vol = M.signedVolume(r.mesh);
    assert.ok(Math.abs(vol - r.area * r.height) < 1e-6 * Math.max(1, vol), `${pattern} volume ${vol} = ${r.area} × ${r.height}`);
    assert.ok(r.height === 0.4);
    assert.ok(r.area > 50 && r.area < 2400, `${pattern} covers some of the base (${r.area})`);
    const b = M.bounds(r.mesh);
    assert.ok(Math.abs(b.min[2] - 0) < 1e-6 && Math.abs(b.max[2] - 0.4) < 1e-6, `${pattern} spans the first two layers`);
    assert.ok(Math.abs(r.grams - r.area * 0.4 * 1.24 / 1000) < 1e-9);
  }
  const none = I.buildInlay(m, { pattern: 'none' });
  assert.equal(none.area, 0);
  assert.equal(none.mesh.indices.length, 0);
});

test('the inlay respects the edge margin and the border hugs the outline', () => {
  const m = roundedBox(60, 40, 24, 6);
  const r = I.buildInlay(m, { pattern: 'checker', period: 4, margin: 2 });
  const b = M.bounds(r.mesh), bm = M.bounds(m);
  assert.ok(b.min[0] >= bm.min[0] + 2 - 0.3 && b.max[0] <= bm.max[0] - 2 + 0.3, 'inset in X');
  assert.ok(b.min[1] >= bm.min[1] + 2 - 0.3 && b.max[1] <= bm.max[1] - 2 + 0.3, 'inset in Y');
  const border = I.buildInlay(m, { pattern: 'border', period: 3, margin: 1 });
  const fp = border.footprint;
  const centre = fp.data.length >> 1;
  assert.equal(border.raster.data[centre + (fp.width >> 1) - (centre % fp.width)], 0, 'the middle is empty');
  // ring area ≈ perimeter × width
  const perim = 2 * (60 + 40) - 8 * 6 + 2 * Math.PI * 6;
  assert.ok(border.area > perim * 3 * 0.6 && border.area < perim * 3 * 1.2, `ring area ${border.area}`);
});

test('a page raster is centred and mirrored in X so it reads right from below', () => {
  const m = roundedBox(60, 40, 24, 6), fp = I.footprint(m);
  // a 20×10 raster with only its left half set
  const raster = { width: 20, height: 10, data: new Uint8Array(200) };
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) raster.data[y * 20 + x] = 1;
  const mirrored = I.inlayRaster(fp, { pattern: 'image', raster, mirror: true, scale: 4 });
  const plain = I.inlayRaster(fp, { pattern: 'image', raster, mirror: false, scale: 4 });
  assert.equal(mirrored.count, plain.count);
  assert.ok(mirrored.count > 0);
  const cx = (x, g) => { let s = 0, n = 0; for (let y = 0; y < g.height; y++) for (let xx = 0; xx < g.width; xx++) if (g.data[y * g.width + xx]) { s += xx; n++; } return s / n; };
  const mid = fp.width / 2;
  assert.ok(cx(0, plain) < mid, 'unmirrored sits left of centre');
  assert.ok(cx(0, mirrored) > mid, 'mirrored sits right of centre');
  assert.ok(Math.abs(cx(0, plain) + cx(0, mirrored) - 2 * mid) < 2, 'symmetric about the centre');
});

test('pattern functions agree with their names', () => {
  const f = id => X.inlayById(id).f;
  assert.equal(f('checker')(0.5, 0.5, 2), 0);
  assert.equal(f('checker')(2.5, 0.5, 2), 1);
  assert.equal(f('stripes')(0.2, 0, 2, { weight: 0.5 }), 1);
  assert.equal(f('stripes')(1.5, 0, 2, { weight: 0.5 }), 0);
  assert.equal(f('rings')(0.1, 0, 5, { weight: 0.3 }), 1);
  assert.equal(f('rings')(4, 0, 5, { weight: 0.3 }), 0);
  assert.equal(X.inlayById('border').f, null);
  assert.equal(X.inlayById('text').f, null);
});
