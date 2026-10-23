import test from 'node:test';
import assert from 'node:assert/strict';
const m = await import('../mask.js');
const r = await import('../relief.js');

function disc(w, h, cx, cy, rad) { const k = m.makeMask(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad) k.data[y * w + x] = 1; return k; }
/** A dog-ish silhouette: a body, a head, two legs, so there is a foot band and a gap. */
function doggy() {
  let k = disc(120, 120, 55, 60, 28);
  k = m.union(k, disc(120, 120, 90, 38, 16));
  for (let y = 80; y < 110; y++) for (let x = 36; x < 46; x++) k.data[y * 120 + x] = 1;
  for (let y = 80; y < 110; y++) for (let x = 66; x < 76; x++) k.data[y * 120 + x] = 1;
  return k;
}

test('the height-field mesher makes a closed, outward solid the size of its mask', () => {
  const k = disc(40, 30, 20, 15, 10);
  const h = new Float32Array(40 * 30).fill(2.5);
  const mesh = r.meshHeightField(k, h, { cell: 0.5 });
  assert.ok(r.isClosed(mesh));
  const expect = m.count(k) * 0.25 * 2.5;
  assert.ok(Math.abs(r.volume(mesh) - expect) / expect < 1e-6, `${r.volume(mesh)} vs ${expect}`);
  const [lo, hi] = r.meshBounds(mesh);
  assert.ok(Math.abs(lo[2]) < 1e-9 && Math.abs(hi[2] - 2.5) < 1e-9);
  assert.ok(Math.abs(lo[0] + hi[0]) < 1e-9 && Math.abs(lo[1] + hi[1]) < 1e-9, 'centred');
  // a mask with a hole and two pieces is still closed
  const two = m.union(m.subtract(k, disc(40, 30, 20, 15, 3)), disc(40, 30, 35, 25, 3));
  assert.ok(r.isClosed(r.meshHeightField(two, h, { cell: 0.5 })));
});

test('a figure is a closed solid, standing the height asked, rounded at the edge, with a tab under its feet', () => {
  const k = doggy();
  const fig = r.buildFigure(k, null, { height: 60 });
  assert.ok(r.isClosed(fig.mesh));
  assert.ok(r.volume(fig.mesh) > 0);
  // height: the figure plus its tab
  assert.ok(Math.abs(fig.size[1] - (60 + fig.tab.height)) < fig.cell * 2.5, `${fig.size[1]}`);
  // rounded: the tallest point is back + round, the edge is lower
  const [, hi] = r.meshBounds(fig.mesh);
  assert.ok(Math.abs(hi[2] - (1.2 + 3)) < 0.05);
  assert.equal(fig.tab.thickness, 3);
  assert.ok(fig.tab.length > 10 && fig.tab.length < fig.size[0]);
  // the tab cells are the flat thickness, the body's middle is higher
  const g = fig.grid, hs = fig.heights;
  const tabRow = (g.pad + g.rows + 1) * g.width;
  const tabCell = [...Array(g.width).keys()].find(x => fig.gridMask.data[tabRow + x]);
  assert.equal(hs[tabRow + tabCell], 3);
});

test('depth raises the middle without breaking the edge, and detail is bounded', () => {
  const k = doggy();
  const depth = new Float32Array(120 * 120);
  for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) depth[y * 120 + x] = 100 - Math.hypot(x - 55, y - 60); // nearest at the body's centre
  const flat = r.buildFigure(k, null, { height: 60 }), deep = r.buildFigure(k, depth, { height: 60, relief: 4, detail: 1 });
  assert.ok(r.isClosed(deep.mesh));
  const zFlat = r.meshBounds(flat.mesh)[1][2], zDeep = r.meshBounds(deep.mesh)[1][2];
  assert.ok(zDeep > zFlat + 2 && zDeep <= 1.2 + 3 + 4 + 1 + 1e-6, `${zFlat} → ${zDeep}`);
  for (let i = 0; i < deep.heights.length; i++) if (deep.gridMask.data[i]) assert.ok(deep.heights[i] >= 0.6, 'never thinner than half the back');
});

test('the grid never exceeds the cell cap, and a small figure keeps fine cells', () => {
  const big = r.gridFor({ x0: 0, y0: 0, x1: 99, y1: 199 }, { ...r.FIGURE_DEFAULTS, height: 250 });
  assert.equal(big.rows, r.FIGURE_DEFAULTS.maxCells);
  assert.ok(big.cell > r.FIGURE_DEFAULTS.cell);
  const small = r.gridFor({ x0: 0, y0: 0, x1: 99, y1: 199 }, { ...r.FIGURE_DEFAULTS, height: 40 });
  assert.equal(small.cell, r.FIGURE_DEFAULTS.cell); assert.equal(small.rows, 100); assert.equal(small.cols, 50);
});

test('a pedestal is a closed solid with a pocket the tab fits with its clearance, oval or rounded', () => {
  const tab = { length: 40, thickness: 3, height: 5 };
  for (const shape of ['oval', 'rounded']) {
    const ped = r.buildPedestal(tab, { shape, height: 8, slotDepth: 5, clearance: 0.3 });
    assert.ok(r.isClosed(ped.mesh), shape);
    const [lo, hi] = r.meshBounds(ped.mesh);
    assert.ok(Math.abs(hi[2] - 8) < 1e-9 && Math.abs(lo[2]) < 1e-9);
    assert.ok(Math.abs(ped.slot.length - 40.6) < 1e-9 && Math.abs(ped.slot.thickness - 3.3) < 1e-9);
    const footprint = shape === 'oval' ? Math.PI * (ped.length / 2) * (ped.depth / 2) : ped.length * ped.depth;
    const vol = r.volume(ped.mesh);
    assert.ok(vol > footprint * 8 * 0.9 - 40.6 * 3.3 * 5 && vol < footprint * 8, `${shape} volume ${vol} for footprint ${footprint}`);
    // the pocket: a cell in the slot's middle is lower than one beside it
    assert.ok(vol < footprint * 8 * 1.001 - 40.6 * 3.3 * 5 * 0.8, 'the pocket took something out');
  }
});
