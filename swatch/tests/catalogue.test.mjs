import test from 'node:test';
import assert from 'node:assert/strict';

const t = await import('../tests.js');

test('every test uses only settings the catalogue knows, with values the slicer accepts', () => {
  for (const tst of t.TESTS) {
    for (const axis of [tst.x, tst.y].filter(Boolean)) {
      assert.ok(axis.values.length >= 2, `${tst.id} has values on each axis`);
      if (axis.composite) {
        assert.ok(t.COMPOSITES[axis.composite], `${tst.id} composite exists`);
        for (const v of axis.values) assert.ok(t.COMPOSITES[axis.composite].options.some(o => o.id === v), `${tst.id}: ${v}`);
      } else {
        assert.ok(t.SETTINGS[axis.key], `${tst.id}: ${axis.key} is known`);
        for (const v of axis.values) assert.doesNotThrow(() => t.serialize(axis.key, v), `${tst.id}: ${axis.key}=${v}`);
      }
    }
    for (const [k, v] of Object.entries(tst.fixed)) {
      assert.ok(t.SETTINGS[k], `${tst.id}: ${k} is known`);
      assert.doesNotThrow(() => t.serialize(k, v));
    }
    for (const field of ['name', 'blurb', 'look', 'pick', 'tag']) assert.ok(tst[field], `${tst.id} has ${field}`);
    assert.ok(['tile', 'stencil', 'pillar', 'cylinder'].includes(tst.coupon.type));
  }
});

test('composite options set only known keys, and the scarf ones switch the override on', () => {
  for (const comp of Object.values(t.COMPOSITES)) for (const o of comp.options) {
    for (const [k, v] of Object.entries(o.set)) { assert.ok(t.SETTINGS[k], k); assert.doesNotThrow(() => t.serialize(k, v)); }
    assert.equal(o.set.override_filament_scarf_seam_setting, 1);
    assert.ok(o.short.length <= 5, 'short labels fit a coupon');
  }
});

test('values are written the way Bambu Studio writes them', () => {
  assert.equal(t.serialize('ironing_flow', 12), '12%');
  assert.equal(t.serialize('ironing_type', 'topmost'), 'topmost');
  assert.equal(t.serialize('top_solid_infill_flow_ratio', 0.97), '0.97');
  assert.equal(t.serialize('top_shell_layers', 5), '5');
  assert.equal(t.serialize('precise_outer_wall', 1), '1');
  assert.equal(t.serialize('seam_slope_start_height', '10%'), '10%');
  assert.equal(t.serialize('elefant_foot_compensation', 0), '0');
  assert.throws(() => t.serialize('ironing_type', 'sideways'));
  assert.throws(() => t.serialize('made_up_key', 1));
});

test('short labels drop the leading zero and keep two decimals where a ratio needs them', () => {
  assert.equal(t.short('outer_wall_line_width', 0.42), '.42');
  assert.equal(t.short('initial_layer_flow_ratio', 1), '1.00');
  assert.equal(t.short('initial_layer_flow_ratio', 0.95), '.95');
  assert.equal(t.short('elefant_foot_compensation', 0), '0');
  assert.equal(t.short('ironing_speed', 40), '40');
  assert.equal(t.short('top_surface_pattern', 'monotonicline'), 'MLINE');
  assert.equal(t.short('seam_position', 'aligned'), 'ALIGN');
});

test('typed values parse, de-duplicate, keep order, and complain about what they cannot read', () => {
  assert.deepEqual(t.parseValues('ironing_speed', '15, 25 40;60,25').values, [15, 25, 40, 60]);
  const bad = t.parseValues('ironing_flow', '10, 200, x');
  assert.deepEqual(bad.values, [10]); assert.equal(bad.errors.length, 2);
  assert.deepEqual(t.parseValues('top_surface_pattern', 'Monotonic line, concentric, nope').values, ['monotonicline', 'concentric']);
  assert.deepEqual(t.parseValues('top_shell_layers', '4.6').values, [5]);
  assert.deepEqual(t.parseValues('seam_slope_start_height', '10%, 0.1').values, ['10%', '0.1']);
});

test('a grid is every pair, axes winning over the fixed settings, labelled across then front-to-back', () => {
  const tst = t.TESTS.find(x => x.id === 'ironing');
  const list = t.coupons(tst);
  assert.equal(list.length, tst.x.values.length * tst.y.values.length);
  assert.deepEqual(list[0].label, ['15', '8']);
  assert.equal(list[0].settings.ironing_type, 'topmost');
  assert.equal(list[1].settings.ironing_speed, 25);
  assert.equal(list[tst.x.values.length].settings.ironing_flow, 10);
  assert.equal(list[0].serialized.ironing_flow, '8%');
  const seam = t.coupons(t.TESTS.find(x => x.id === 'seam'));
  assert.equal(seam[1].settings.seam_slope_min_length, 5);
  assert.equal(seam[1].settings.seam_slope_type, 'external');
  assert.equal(seam[0].settings.seam_slope_type, 'none');
  const row = t.coupons({ ...tst, y: null });
  assert.equal(row.length, tst.x.values.length); assert.deepEqual(row[0].label, ['15']);
});
