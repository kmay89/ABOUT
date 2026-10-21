import test from 'node:test';
import assert from 'node:assert/strict';

const { ITEMS, ITEM_BY_ID, fit, cellsFor, arrange, EASE } = await import('../items.js');
const L = await import('../layout.js');
const { newDesign, grid, binInside, insideFor, itemFitsBin, placeBin, SPACES } = L;

test('every thing has a sensible size, lies flat, and belongs to a real space', () => {
  const ids = new Set();
  for (const it of ITEMS) {
    assert.ok(!ids.has(it.id), `duplicate id ${it.id}`); ids.add(it.id);
    assert.ok(it.l >= it.w, `${it.name} is listed as it lies: longest first`);
    assert.ok(it.h >= 2 && it.l <= 400, `${it.name} is a drawer-sized thing`);
    assert.ok(it.spaces.length && it.spaces.every(s => SPACES[s]), `${it.name} belongs somewhere`);
  }
  assert.ok(ITEMS.length >= 80, 'a library worth browsing');
  for (const space of ['desk', 'kitchen', 'garage', 'bath']) assert.ok(ITEMS.filter(i => i.spaces.includes(space)).length >= 15, `${space} has a good list`);
});

test('fit: flat, turned, diagonal, or not; height against the rim', () => {
  const fork = ITEM_BY_ID.fork;                                          // 200 × 25 × 15
  assert.equal(fit({ w: 210, d: 40, h: 40 }, fork).how, 'flat');
  assert.equal(fit({ w: 40, d: 210, h: 40 }, fork).angle, 90, 'turned a quarter');
  assert.equal(fit({ w: 170, d: 170, h: 40 }, fork).how, 'diagonal', 'a 200 mm fork lies across a 170 mm square');
  assert.equal(fit({ w: 120, d: 120, h: 40 }, fork), null, 'but not a 120 mm one');
  assert.equal(fit({ w: 201, d: 26, h: 40 }, fork), null, `${EASE} mm of ease is kept`);
  const stapler = ITEM_BY_ID.stapler;                                    // 60 high
  assert.equal(fit({ w: 200, d: 100, h: 50 }, stapler, 3), null, 'taller than bin plus rim will not let the drawer close');
  const f = fit({ w: 200, d: 100, h: 57 }, stapler, 3);
  assert.ok(f && f.tall, 'stands above the rim but under the drawer top');
  assert.ok(!fit({ w: 200, d: 100, h: 61 }, stapler, 3).tall);
});

test('cellsFor finds the fewest cells, squarer when tied', () => {
  const inside = (w, h) => ({ w: 60 * w - 4, d: 60 * h - 4, h: 50 });
  assert.deepEqual(cellsFor(ITEM_BY_ID.aa, 6, 6, inside), { w: 1, h: 1 });
  assert.deepEqual(cellsFor(ITEM_BY_ID.fork, 6, 6, inside), { w: 1, h: 4 }, 'a lane 4 deep, not 4 × 1: both tie and the first found wins');
  assert.equal(cellsFor(ITEM_BY_ID.chefknife, 3, 3, inside), null, 'a chef\'s knife needs more drawer than this');
  assert.deepEqual(cellsFor(ITEM_BY_ID.compact, 6, 6, inside), { w: 2, h: 2 });
});

test('arrange lays things left to right, front to back, as many as fit in one layer', () => {
  const space = { w: 150, d: 60, h: 40 };
  const laid = arrange(space, ['aa', 'aa', 'aa', 'aaa', 'phone', 'nope']);
  const batteries = laid.filter(p => p.item.id !== 'phone');
  assert.equal(batteries.length, 4);
  for (const p of laid) {
    assert.ok(p.x >= 0 && p.y >= 0);
    if (!p.loose) assert.ok(p.x + p.l <= space.w + 1e-9 && p.y + p.w <= space.d + 1e-9, `${p.item.name} inside`);
  }
  const phone = laid.find(p => p.item.id === 'phone');
  assert.equal(phone, undefined, 'the phone fits on the diagonal only, and arrange draws flat layers');
  const ruler = arrange({ w: 300, d: 170, h: 40 }, ['ruler']);
  assert.ok(ruler[0].loose, 'a 12 in ruler in a 300 × 170 bin is drawn loose, on its diagonal');
});

test('a bin\'s inside accounts for walls, dividers and the floor, and the fit uses the rim', () => {
  const design = newDesign({ width: 300, depth: 300, height: 60, space: 'other', recipe: 'empty' });
  L.applyProfile(design, 'light');                      // the thin-walled finish these figures were worked out for
  design.cols = 3; design.rows = 3;
  const g = grid(design);
  const bin = placeBin(design, { c: 0, r: 0, w: 1, h: 3 }, { cx: 1, cy: 2 });
  const inside = binInside(design, bin, g);
  const rect = { width: g.pitchX - design.settings.gap, depth: 3 * g.pitchY - design.settings.gap };
  assert.ok(Math.abs(inside.w - (rect.width - 2 * design.settings.wall)) < 1e-9);
  assert.ok(Math.abs(inside.d - (rect.depth - 2 * design.settings.wall - design.settings.divider) / 2) < 1e-9, 'one of two compartments');
  assert.equal(inside.h, 57 - design.settings.floor);
  assert.ok(itemFitsBin(design, bin, ITEM_BY_ID.teaspoon, g), 'a teaspoon fits half a 3-deep lane');
  assert.equal(itemFitsBin(design, bin, ITEM_BY_ID.knife, g), null, 'a dinner knife does not');
  const whole = insideFor(design, 1, 3, g);
  assert.ok(fit(whole, ITEM_BY_ID.knife), 'without the divider it would');
});
