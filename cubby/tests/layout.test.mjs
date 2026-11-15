import test from 'node:test';
import assert from 'node:assert/strict';

const L = await import('../layout.js');
const { newDesign, restoreDesign, grid, binRect, binSpec, partsList, packPlates, fillEmpty, placeBin, trimToGrid,
  applyRecipe, occupancy, clipPlan, RECIPES, SPACES, PRINTERS, SETTINGS_DEFAULTS, maxCount, MIN_CELL, binHeights } = L;

function near(actual, expected, tolerance = 1e-6, message = '') {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} Expected ${expected}, received ${actual}`);
}

test('the grid fills the drawer exactly, whatever the drawer', () => {
  for (const [width, depth] of [[400, 400], [297.5, 513], [120, 90], [900, 600]]) {
    const design = newDesign({ width, depth, height: 70, space: 'kitchen' });
    const g = grid(design), s = design.settings;
    near(g.originX + g.cols * g.pitchX - s.gap + s.clearance, width, 1e-9, `${width} wide`);
    near(g.originY + g.rows * g.pitchY - s.gap + s.clearance, depth, 1e-9, `${depth} deep`);
    assert.ok(g.cellW >= MIN_CELL - 1e-9 && g.cellD >= MIN_CELL - 1e-9, 'cells are never too small to print');
    const rect = binRect(design, { c: g.cols - 1, r: g.rows - 1, w: 1, h: 1 }, g);
    near(rect.x + rect.width, width - s.clearance, 1e-9, 'the last bin ends at the clearance');
  }
});

test('columns are capped so a cell never drops below the minimum', () => {
  const design = newDesign({ width: 100, depth: 100, height: 50 });
  design.cols = 40; design.rows = 40;
  const g = grid(design);
  assert.equal(g.cols, maxCount(100, design.settings));
  assert.ok(g.cellW >= MIN_CELL - 1e-9);
});

test('every starting layout tiles the grid without overlap', () => {
  for (const [space, recipes] of Object.entries(RECIPES)) for (const recipe of recipes) {
    for (const [cols, rows] of [[1, 1], [2, 3], [7, 7], [12, 4]]) {
      const design = newDesign({ width: 60 + 50 * cols, depth: 60 + 50 * rows, height: 60, space });
      design.cols = cols; design.rows = rows;
      applyRecipe(design, recipe.id);
      const occ = occupancy(design);
      const covered = design.bins.reduce((n, b) => n + b.w * b.h, 0);
      assert.equal(occ.cells.filter(Boolean).length, covered, `${space}/${recipe.id} ${cols}×${rows}: no two bins share a cell`);
      if (recipe.id !== 'empty') assert.equal(covered, cols * rows, `${space}/${recipe.id} ${cols}×${rows}: every cell has a bin`);
      for (const b of design.bins) assert.ok(b.c + b.w <= cols && b.r + b.h <= rows, 'inside the grid');
    }
  }
});

test('placing a bin takes the place of whatever it covers; filling adds one-cell bins', () => {
  const design = newDesign({ width: 300, depth: 300, height: 50, space: 'other', recipe: 'cells' });
  const { cols, rows } = grid(design);
  assert.equal(design.bins.length, cols * rows);
  const bin = placeBin(design, { c: 0, r: 0, w: 2, h: 2 });
  assert.equal(design.bins.length, cols * rows - 4 + 1);
  assert.equal(bin.w, 2);
  design.bins = design.bins.filter(b => b.id !== bin.id);
  assert.equal(fillEmpty(design), 4);
  assert.equal(occupancy(design).cells.filter(Boolean).length, cols * rows);
  assert.equal(placeBin(design, { c: 99, r: 99, w: 1, h: 1 }), null, 'off the grid is nothing');
});

test('shrinking the grid trims bins instead of leaving them hanging', () => {
  const design = newDesign({ width: 300, depth: 300, height: 50, space: 'other', recipe: 'cells' });
  const { cols, rows } = grid(design);
  placeBin(design, { c: cols - 2, r: rows - 2, w: 2, h: 2 });
  design.cols = cols - 1; design.rows = rows - 1;
  trimToGrid(design);
  const occ = occupancy(design);
  assert.ok(design.bins.every(b => b.c + b.w <= occ.cols && b.r + b.h <= occ.rows));
  assert.equal(new Set(occ.cells.filter(Boolean)).size, design.bins.length, 'no bin lost its cells to another');
});

test('a bin spec carries a channel at the centre of each cell it covers', () => {
  const design = newDesign({ width: 400, depth: 400, height: 60, space: 'other', recipe: 'cells' });
  L.applyProfile(design, 'light');                      // channels on every wall
  const g = grid(design);
  const spec = binSpec(design, { c: 1, r: 0, w: 2, h: 3, cx: 1, cy: 1 }, g);
  assert.equal(spec.channels.front.length, 2);
  assert.equal(spec.channels.left.length, 3);
  near(spec.channels.front[0], g.pitchX / 2 - design.settings.gap / 2, 1e-9, 'first channel is mid-cell');
  near(spec.channels.front[1] - spec.channels.front[0], g.pitchX, 1e-9, 'one pitch apart');
  near(spec.width, 2 * g.pitchX - design.settings.gap, 1e-3, 'rounded to a thousandth');
  assert.equal(spec.height, binHeights(design).full);
  design.settings.clips = false;
  assert.equal(binSpec(design, { c: 0, r: 0, w: 1, h: 1 }, g).channels.front.length, 0, 'no clips, no channels');
});

test('bin heights leave room under the drawer top and never exceed the printer', () => {
  const design = newDesign({ width: 300, depth: 300, height: 60 });
  assert.equal(binHeights(design).full, 57);
  assert.equal(binHeights(design).low, 29);
  design.drawer.height = 300; design.settings.printer = 'a1mini';
  assert.equal(binHeights(design).full, 178);
});

test('the parts list groups identical bins and counts one clip per shared cell edge', () => {
  const design = newDesign({ width: 300, depth: 300, height: 50, space: 'other', recipe: 'cells' });
  L.applyProfile(design, 'light');                      // every same-size bin identical
  const { cols, rows } = grid(design);
  const list = partsList(design);
  const binParts = list.parts.filter(p => p.kind === 'bin');
  assert.equal(binParts.length, 1, 'every cell bin is the same part');
  assert.equal(binParts[0].qty, cols * rows);
  assert.ok(binParts[0].mesh && !binParts[0].error);
  const clips = list.parts.filter(p => p.kind === 'clip');
  assert.equal(clips.length, 1);
  assert.equal(clips[0].qty, (cols - 1) * rows + (rows - 1) * cols, 'one per neighbouring pair');
  assert.equal(list.totals.parts, cols * rows + clips[0].qty);
  assert.ok(list.totals.grams > 0 && list.totals.minutes > 0);
  design.settings.clips = false;
  assert.equal(clipPlan(design).length, 0);
});

test('a low bin beside a full one gets the shorter clip', () => {
  const design = newDesign({ width: 200, depth: 100, height: 60, space: 'other', recipe: 'empty' });
  design.cols = 2; design.rows = 1;
  const a = placeBin(design, { c: 0, r: 0, w: 1, h: 1 });
  const b = placeBin(design, { c: 1, r: 0, w: 1, h: 1 });
  b.low = true;
  const [clip] = clipPlan(design);
  assert.equal(clip.qty, 1);
  assert.equal(clip.length, Math.round(0.6 * (binHeights(design).low - design.settings.floor)));
  a.low = true;
  assert.equal(clipPlan(design)[0].length, clip.length);
});

test('plates pack every part inside the bed, turning parts when that helps', () => {
  const design = newDesign({ width: 500, depth: 240, height: 60, space: 'kitchen', recipe: 'utensils' });
  const list = partsList(design);
  const printer = PRINTERS.find(p => p.id === 'p2s');
  const packing = packPlates(list.parts, printer);
  assert.equal(packing.tooBig.length, 0);
  const placed = packing.plates.reduce((n, p) => n + p.items.length, 0);
  assert.equal(placed, list.totals.parts, 'every copy of every part is on a plate');
  for (const plate of packing.plates) {
    for (const it of plate.items) {
      assert.ok(it.x >= 0 && it.y >= 0 && it.x + it.w <= printer.bed[0] && it.y + it.d <= printer.bed[1], 'inside the bed');
      for (const other of plate.items) {
        if (other === it) continue;
        const apart = it.x + it.w <= other.x || other.x + other.w <= it.x || it.y + it.d <= other.y || other.y + other.d <= it.y;
        assert.ok(apart, 'no two parts overlap');
      }
    }
  }
  // A 240 mm deep lane only fits the A1 mini's plate turned on neither axis.
  const mini = packPlates(list.parts, PRINTERS.find(p => p.id === 'a1mini'));
  assert.ok(mini.tooBig.length > 0, 'the lanes are reported, not silently dropped');
});

test('a saved design comes back whole, and a damaged one comes back safe', () => {
  const design = newDesign({ width: 350, depth: 420, height: 65, space: 'garage', recipe: 'screws' });
  design.settings.wall = 2; design.settings.clipFit = 'snug';
  const back = restoreDesign(JSON.parse(JSON.stringify(design)));
  assert.deepEqual(back.bins.map(b => [b.c, b.r, b.w, b.h, b.cx, b.cy, b.low, b.scoop]), design.bins.map(b => [b.c, b.r, b.w, b.h, b.cx, b.cy, b.low, b.scoop]));
  assert.equal(back.settings.wall, 2);
  assert.equal(back.settings.clipFit, 'snug');
  const hurt = restoreDesign({ drawer: { width: 'x', depth: -5, height: 1e9, space: 'moon' }, settings: { wall: 99, printer: 'toaster', clipFit: 'weird' }, cols: 'a', bins: [{ c: -1, r: 0, w: 1, h: 1 }, { c: 0, r: 0, w: 2, h: 2, cx: 99 }, 'junk'] });
  assert.equal(hurt.drawer.space, 'other');
  assert.equal(hurt.settings.wall, 3.2);
  assert.equal(hurt.settings.printer, SETTINGS_DEFAULTS.printer);
  assert.equal(hurt.settings.clipFit, 'normal');
  assert.equal(hurt.bins.length, 1);
  assert.equal(hurt.bins[0].cx, 12);
  assert.throws(() => restoreDesign('nope'), TypeError);
});

test('every space has a favourite cell size that gives a sensible grid', () => {
  for (const space of Object.keys(SPACES)) {
    const design = newDesign({ width: 420, depth: 380, height: 60, space });
    const g = grid(design);
    assert.ok(g.cols >= 3 && g.cols <= 12, `${space}: ${g.cols} columns`);
    assert.ok(Math.abs(g.pitchX - SPACES[space].cell) < SPACES[space].cell / 2 + 1, 'near the favourite size');
  }
});

test('parts keep clear of the corner Bambu Studio reserves, and the strip in front of a wide part is still used', () => {
  const design = newDesign({ width: 480, depth: 240, height: 60, space: 'kitchen', recipe: 'utensils' });
  const list = partsList(design);
  const printer = PRINTERS.find(p => p.id === 'p2s');
  const packing = packPlates(list.parts, printer);
  assert.deepEqual(packing.exclude, [18, 28]);
  for (const plate of packing.plates) for (const it of plate.items) {
    const inCorner = it.x < 18 && it.y < 28;
    assert.ok(!inCorner, `${it.part.title} at ${it.x},${it.y} sits in the reserved corner`);
    assert.ok(it.x >= 0 && it.y >= 0 && it.x + it.w <= 256 + 1e-9 && it.y + it.d <= 256 + 1e-9, 'inside the bed');
  }
  // A lane wider than the room beside the corner starts above it, and clips fill the strip in front.
  const first = packing.plates[0].items;
  const wide = first.find(it => it.w > 256 - 4 - 24);
  if (wide) {
    assert.ok(wide.y >= 28, 'the wide part sits above the corner');
    assert.ok(first.some(it => it.part.kind === 'clip' && it.y < 28 && it.x >= 24), 'clips use the strip in front of it');
  }
});

test('a lane longer than the plate prints on the diagonal, alone, pointing away from the reserved corner', () => {
  const design = newDesign({ width: 120, depth: 280, height: 40, space: 'other', recipe: 'empty' });
  design.cols = 2; design.rows = 5;
  placeBin(design, { c: 0, r: 0, w: 1, h: 5 });
  const list = partsList(design), printer = PRINTERS.find(p => p.id === 'p2s');
  const lane = list.parts.find(p => p.kind === 'bin');
  assert.ok(lane.mesh.size[1] > 256, 'longer than the plate');
  assert.equal(L.plateFit(lane.mesh.size[0], lane.mesh.size[1], printer), 'diagonal');
  const packing = packPlates(list.parts, printer);
  assert.equal(packing.tooBig.length, 0);
  const plate = packing.plates.find(p => p.diagonal);
  assert.ok(plate && plate.items.length === 1, 'alone on its plate');
  const it = plate.items[0];
  assert.equal(it.rot, 45, 'its long side (Y) turned to run from front-right to back-left');
  assert.ok(it.x >= 0 && it.y >= 0 && it.x + it.w <= 256 && it.y + it.d <= 256, 'the turned footprint is inside the bed');
  // Turned by 45° the part's own corner (0, 0) is its lowest point, at (tx, ty); the
  // long side runs up and to the left from there, so it is well right of the reserved corner.
  assert.ok(it.tx > 18 + 100 && it.ty >= 4, 'misses the reserved corner');
  assert.equal(L.plateFit(60, 400, printer), null, 'and a 400 mm lane fits no way');
});

test('starting layouts split lanes that would not fit the plate, carrying what they were for', () => {
  const design = newDesign({ width: 400, depth: 400, height: 60, space: 'kitchen', recipe: 'cutlery' });
  const g = grid(design);
  for (const bin of design.bins) {
    const rect = binRect(design, bin, g);
    assert.ok(L.plateFit(rect.width, rect.depth, PRINTERS[0]) !== 'diagonal' && L.plateFit(rect.width, rect.depth, PRINTERS[0]) !== null, 'every piece lies square on the plate');
  }
  assert.ok(design.bins.length > g.cols, 'the lanes were split');
  assert.equal(occupancy(design).cells.filter(Boolean).length, g.cols * g.rows, 'and still fill the drawer');
  // A user-drawn lane is left alone (it prints on the diagonal if it can) until asked.
  const own = newDesign({ width: 400, depth: 400, height: 60, space: 'other', recipe: 'empty' });
  own.cols = 4; own.rows = 4;
  const lane = placeBin(own, { c: 0, r: 0, w: 1, h: 4 }, { items: ['knife', 'fork'] });
  assert.equal(own.bins.length, 1);
  assert.ok(L.splitToFit(own, PRINTERS.find(p => p.id === 'p2s')));
  assert.equal(own.bins.length, 2);
  assert.deepEqual(own.bins.map(b => b.h), [2, 2]);
  assert.deepEqual(own.bins[1].items, ['knife', 'fork']);
  assert.ok(own.bins.some(b => b.id === lane.id), 'the first piece keeps its id');
});

test('two finishes: Designer hides the joint in the wall and cuts channels only where bins meet', () => {
  const design = newDesign({ width: 400, depth: 400, height: 60, space: 'desk' });
  assert.equal(design.settings.profile, 'designer');
  assert.equal(L.profileOf(design.settings), 'designer');
  const list = partsList(design);
  assert.equal(list.totals.errors, 0);
  for (const p of list.parts) if (p.kind === 'bin') {
    assert.equal(p.mesh.ribDepth, 0, `${p.title}: no rib inside`);
    assert.equal(p.spec.joint.depth, 1.0);
    assert.ok(p.mesh.settings.edge > 0 && p.mesh.settings.chamfer > 0, 'rounded rim, chamfered foot');
  }
  const g = grid(design), occ = occupancy(design);
  for (const bin of design.bins) {
    const spec = binSpec(design, bin, g, occ);
    if (bin.c === 0) assert.equal(spec.channels.left.length, 0, 'nothing joins the drawer wall');
    if (bin.r === 0) assert.equal(spec.channels.front.length, 0);
    if (bin.c + bin.w === g.cols) assert.equal(spec.channels.right.length, 0);
    if (bin.r + bin.h === g.rows) assert.equal(spec.channels.back.length, 0);
  }
  // every shared cell edge has a channel on both sides
  for (let r = 0; r < g.rows; r++) for (let c = 0; c + 1 < g.cols; c++) {
    const a = occ.cells[r * g.cols + c], b = occ.cells[r * g.cols + c + 1];
    if (!a || !b || a === b) continue;
    const binA = design.bins.find(x => x.id === a), binB = design.bins.find(x => x.id === b);
    const right = binSpec(design, binA, g, occ).channels.right, left = binSpec(design, binB, g, occ).channels.left;
    const y = (r - binA.r + 0.5) * g.pitchY - design.settings.gap / 2, y2 = (r - binB.r + 0.5) * g.pitchY - design.settings.gap / 2;
    assert.ok(right.some(v => Math.abs(v - y) < 1e-6) && left.some(v => Math.abs(v - y2) < 1e-6), 'both sides of a seam are channelled');
  }
  const titles = list.parts.filter(p => p.kind === 'bin').map(p => p.title);
  assert.equal(new Set(titles).size, titles.length, 'variants are told apart by which sides they join');
  assert.ok(titles.some(t => /joins/.test(t)));
  // Light: ribs, channels everywhere, square edges, every same-size bin identical
  L.applyProfile(design, 'light');
  assert.equal(design.settings.profile, 'light');
  const light = partsList(design);
  for (const p of light.parts) if (p.kind === 'bin') {
    assert.equal(p.mesh.ribDepth, 1.4);
    assert.equal(p.mesh.settings.edge, 0);
    assert.ok(!/joins/.test(p.title));
  }
  assert.ok(light.parts.length < list.parts.length, 'fewer distinct parts');
  design.settings.wall = 2.4;
  assert.equal(L.profileOf(design.settings), 'custom');
  const back = restoreDesign(JSON.parse(JSON.stringify(design)));
  assert.equal(back.settings.profile, 'custom');
  assert.equal(back.settings.joint, 'deep');
  const old = restoreDesign({ drawer: { width: 300, depth: 300, height: 50 }, settings: { wall: 1.6, floor: 1.2, radius: 3, divider: 1.2 }, cols: 5, rows: 5, bins: [] });
  assert.equal(old.settings.profile, 'light', 'a design saved before finishes existed is the Light one it was');
});
