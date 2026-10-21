import test from 'node:test';
import assert from 'node:assert/strict';

const L = await import('../layout.js');
const { partsList, packPlates, placeBin, newDesign, restoreDesign, SETTINGS_LIMITS, PRINTERS, SPACES, RECIPES, grid, occupancy, CLIP_FITS: _ } = L;
const { bundle, threeMF } = await import('../export.js');
const { ITEMS } = await import('../items.js');

/** A small seeded generator, so a failure can be run again. */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function assertSolid(mesh, what) {
  const { vertices, indices, vertexCount, triangleCount } = mesh;
  assert.ok(mesh.volume > 0, `${what}: positive volume`);
  const edges = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]];
    assert.equal(new Set(tri).size, 3, `${what}: no collapsed triangles`);
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3], key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const e = edges.get(key) ?? { count: 0, direction: 0 };
      e.count++; e.direction += a < b ? 1 : -1; edges.set(key, e);
    }
  }
  for (const [key, e] of edges) {
    assert.equal(e.count, 2, `${what}: edge ${key} has two faces`);
    assert.equal(e.direction, 0, `${what}: edge ${key} wound both ways`);
  }
  assert.equal(vertexCount - edges.size + triangleCount, 2, `${what}: one closed surface`);
  assert.ok(vertices.every(Number.isFinite), `${what}: finite`);
}

function randomDesign(r, i) {
  const spaces = Object.keys(SPACES), space = spaces[Math.floor(r() * spaces.length)];
  const settings = {};
  for (const [key, [lo, hi]] of Object.entries(SETTINGS_LIMITS)) settings[key] = Math.round((lo + r() * (hi - lo)) * 10) / 10;
  settings.clips = r() < 0.75;
  settings.clipFit = ['snug', 'normal', 'loose'][Math.floor(r() * 3)];
  settings.printer = PRINTERS[Math.floor(r() * PRINTERS.length)].id;
  const recipes = RECIPES[space];
  const design = newDesign({
    width: 30 + Math.round(r() * 900), depth: 30 + Math.round(r() * 700), height: 12 + Math.round(r() * 200), space,
    recipe: recipes[Math.floor(r() * recipes.length)].id,
  }, settings);
  // then some bins of our own, with every feature thrown in
  const g = grid(design), n = Math.floor(r() * 6);
  for (let k = 0; k < n; k++) {
    const w = 1 + Math.floor(r() * Math.min(4, g.cols)), h = 1 + Math.floor(r() * Math.min(4, g.rows));
    placeBin(design, { c: Math.floor(r() * g.cols), r: Math.floor(r() * g.rows), w, h }, {
      cx: 1 + Math.floor(r() * 4), cy: 1 + Math.floor(r() * 3), low: r() < 0.3, scoop: r() < 0.4,
      items: [ITEMS[Math.floor(r() * ITEMS.length)].id],
    });
  }
  design.seed = i;
  return design;
}

test('random drawers, settings and bins: every part builds closed, packs inside the plate, and exports', () => {
  const r = rng(20261020);
  let parts = 0, errors = 0;
  for (let i = 0; i < 60; i++) {
    const design = randomDesign(r, i), what = `design ${i} (${design.drawer.width}×${design.drawer.depth}×${design.drawer.height}, ${design.drawer.space})`;
    const list = partsList(design);
    for (const part of list.parts) {
      if (part.error) {
        errors++;
        // The only things a bin may refuse: compartments too narrow for the cells.
        assert.match(part.error, /narrower than 5 mm|no room inside/, `${what}: ${part.title}: ${part.error}`);
        continue;
      }
      assertSolid(part.mesh, `${what}: ${part.title}`);
      parts++;
    }
    const printer = PRINTERS.find(p => p.id === design.settings.printer);
    const packing = packPlates(list.parts, printer);
    for (const plate of packing.plates) {
      for (const it of plate.items) {
        assert.ok(it.x >= -1e-6 && it.y >= -1e-6 && it.x + it.w <= printer.bed[0] + 1e-6 && it.y + it.d <= printer.bed[1] + 1e-6, `${what}: ${it.part.title} inside the bed`);
        // A part on the diagonal runs front-right to back-left: its box may touch the corner, the part never does.
        if (printer.exclude && !plate.diagonal) assert.ok(!(it.x < printer.exclude[0] && it.y < printer.exclude[1]), `${what}: ${it.part.title} clear of the reserved corner`);
        for (const other of plate.items) {
          if (other === it) continue;
          const apart = it.x + it.w <= other.x + 1e-6 || other.x + other.w <= it.x + 1e-6 || it.y + it.d <= other.y + 1e-6 || other.y + other.d <= it.y + 1e-6;
          assert.ok(apart, `${what}: ${it.part.title} overlaps ${other.part.title}`);
        }
      }
    }
    const placed = packing.plates.reduce((n, p) => n + p.items.length, 0) + packing.tooBig.reduce((n, p) => n + p.qty, 0);
    assert.equal(placed, list.parts.filter(p => p.mesh).reduce((n, p) => n + p.qty, 0), `${what}: every copy is on a plate or reported`);
    if (packing.plates.length) assert.ok(threeMF(packing.plates[0], { bed: packing.bed }).byteLength > 200, `${what}: a 3MF`);
    assert.ok(bundle(design, list, packing).byteLength > 200, `${what}: a bundle`);
    const back = restoreDesign(JSON.parse(JSON.stringify(design)));
    assert.equal(back.bins.length, design.bins.length, `${what}: survives a save`);
    const occ = occupancy(design);
    assert.equal(new Set(occ.cells.filter(Boolean)).size, design.bins.length, `${what}: no two bins share a cell`);
  }
  assert.ok(parts > 200, `built ${parts} parts`);
});

test('channels near a corner shrink the corner instead of failing', () => {
  const design = newDesign({ width: 62, depth: 62, height: 40, space: 'other', recipe: 'cells' }, { radius: 8 });
  design.cols = 3; design.rows = 3;                       // 19 mm cells: a channel's base ends 7 mm from the corner
  L.applyRecipe(design, 'cells');
  const list = partsList(design);
  const bin = list.parts.find(p => p.kind === 'bin');
  assert.equal(bin.error, null);
  assert.ok(bin.mesh.settings.radius < 8 && bin.mesh.settings.radius > 1, `the corner came down to ${bin.mesh.settings.radius}`);
});
