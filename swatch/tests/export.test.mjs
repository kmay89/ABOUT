import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { zipStore, crc32, threeMF, sheet, legendSVG, slug, projectSettings } = await import('../export.js');
const { TESTS, SESSIONS, SETTINGS, PARAMS, withDetail } = await import('../tests.js');
const { PRINTERS, BED_TYPES, build, estimate } = await import('../plate.js');
const { isClosed, volume } = await import('../geometry.js');

const decoder = new TextDecoder();

/** Read a stored ZIP back without a library: walk the local headers. */
function unzip(buffer) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer), files = new Map();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true), nameLength = view.getUint16(at + 26, true), extra = view.getUint16(at + 28, true);
    const name = decoder.decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const start = at + 30 + nameLength + extra;
    files.set(name, { data: bytes.subarray(start, start + size), crc: view.getUint32(at + 14, true) });
    at = start + size;
  }
  assert.equal(view.getUint32(at, true), 0x02014b50, 'central directory follows the entries');
  return files;
}

test('crc32 matches the reference value', () => {
  assert.equal(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog')), 0x414fa339);
});

test('a stored ZIP holds its files byte for byte, and the system unzip agrees', () => {
  const zip = zipStore([{ name: 'a.txt', data: 'hello' }, { name: 'dir/b.bin', data: new Uint8Array([1, 2, 3, 250]) }]);
  const files = unzip(zip);
  assert.equal(decoder.decode(files.get('a.txt').data), 'hello');
  for (const f of files.values()) assert.equal(crc32(f.data), f.crc);
  if (existsSync('/usr/bin/unzip')) {
    const dir = mkdtempSync(join(tmpdir(), 'swatch-zip-'));
    writeFileSync(join(dir, 't.zip'), Buffer.from(zip));
    assert.match(execFileSync('/usr/bin/unzip', ['-t', join(dir, 't.zip')], { encoding: 'utf8' }), /No errors detected/);
  }
});

test('every test, quick and thorough, builds a grid of closed coupons that fits the P2S plate clear of the purge corner', () => {
  for (const detail of ['quick', 'thorough']) for (const tst0 of TESTS) {
    const tst = withDetail(tst0, detail);
    const built = build([tst], { printer: PRINTERS[0] });
    assert.deepEqual(built.warnings, [], `${tst.id} ${detail}: ${built.warnings.join(' ')}`);
    assert.equal(built.items.length, tst.x.values.length * (tst.y ? tst.y.values.length : 1));
    const layouts = new Set(built.items.map(i => i.lines.length));
    assert.equal(layouts.size, 1, `${tst.id}: one label layout across the grid`);
    for (const it of built.items) {
      assert.ok(isClosed(it.mesh) && volume(it.mesh) > 0, `${tst.id} ${it.name} is a solid`);
      const [w, d] = it.size;
      assert.ok(it.x - w / 2 >= 0 && it.x + w / 2 <= 256 && it.y - d / 2 >= 0 && it.y + d / 2 <= 256, `${tst.id} on the plate`);
      assert.ok(!(it.x - w / 2 < 18 && it.y - d / 2 < 28), `${tst.id} clear of the purge corner`);
    }
    const sizes = new Set(built.items.map(i => i.size.join('x')));
    assert.equal(sizes.size, 1, `${tst.id}: every coupon the same size`);
    const est = estimate(built.items);
    assert.ok(est.grams > 3 && est.grams < 400 && est.minutes > 5, `${tst.id} estimate is sane`);
  }
});

test('every quick session fits the P2S plate with its tests in order from the front, and no two coupons overlap', () => {
  for (const s of SESSIONS) {
    const tests = s.tests.map(id => withDetail(TESTS.find(t => t.id === id), 'quick'));
    const built = build(tests, { printer: PRINTERS[0] });
    assert.deepEqual(built.warnings, [], `${s.id}: ${built.warnings.join(' ')}`);
    assert.equal(built.groups.length, s.tests.length);
    assert.equal(built.items.length, built.groups.reduce((n, g) => n + g.items.length, 0));
    for (let i = 1; i < built.groups.length; i++) {
      const a = built.groups[i - 1], b = built.groups[i];
      assert.ok(b.origin[1] >= a.origin[1] || b.origin[0] > a.origin[0], `${s.id}: test ${i + 1} is behind or to the right of test ${i}`);
    }
    const boxes = built.items.map(it => [it.x - it.size[0] / 2, it.y - it.size[1] / 2, it.x + it.size[0] / 2, it.y + it.size[1] / 2]);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      assert.ok(a[2] <= b[0] + 1e-9 || b[2] <= a[0] + 1e-9 || a[3] <= b[1] + 1e-9 || b[3] <= a[1] + 1e-9, `${s.id}: coupons ${i} and ${j} overlap`);
    }
  }
});

test('a geometry axis changes the coupon, not the settings', () => {
  const fit = withDetail(TESTS.find(t => t.id === 'fit'));
  const built = build([fit], { printer: PRINTERS[0] });
  assert.deepEqual(Object.keys(built.items[0].serialized), []);
  assert.equal(built.items[0].measure.clearance, 0.1);
  assert.ok(volume(built.items[0].mesh) > volume(built.items[4].mesh), 'a bigger hole leaves less plastic');
  assert.ok(PARAMS.clearance);
});

test('a plate too big for the printer says so instead of placing coupons off it', () => {
  const tst = withDetail(TESTS.find(t => t.id === 'walls'), 'thorough');
  const big = { ...tst, x: { ...tst.x, values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120] } };
  const built = build([big], { printer: PRINTERS.find(p => p.id === 'a1mini') });
  assert.ok(built.warnings.some(w => /fewer values/.test(w)));
});

test('the 3MF carries the coupons, their places, and each one\u2019s settings the way Bambu Studio reads them', () => {
  const tst = withDetail(TESTS.find(t => t.id === 'ironing'), 'thorough');
  const built = build([tst], { printer: PRINTERS[0] });
  const files = unzip(threeMF(built, { printer: PRINTERS[0], plate: 'Textured PEI Plate' }));
  for (const name of ['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', 'Metadata/model_settings.config', 'Metadata/project_settings.config']) assert.ok(files.has(name), name);
  const model = decoder.decode(files.get('3D/3dmodel.model').data);
  assert.match(model, /<model unit="millimeter"/);
  assert.equal(model.match(/<object /g).length, built.items.length);
  assert.equal(model.match(/<item /g).length, built.items.length);
  assert.ok(model.includes(`transform="1 0 0 0 1 0 0 0 1 ${built.items[0].x} ${built.items[0].y} 0"`), 'the first coupon is where the plan put it');
  const config = decoder.decode(files.get('Metadata/model_settings.config').data);
  assert.match(config, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<config>/);
  assert.equal(config.match(/<object id="/g).length, built.items.length);
  assert.equal(config.match(/<model_instance>/g).length, built.items.length);
  assert.ok(config.includes('<object id="1">'));
  assert.ok(config.includes('<metadata key="ironing_speed" value="15"/>'));
  assert.ok(config.includes('<metadata key="ironing_flow" value="8%"/>'));
  assert.ok(config.includes('<metadata key="ironing_type" value="topmost"/>'));
  assert.ok(config.includes('<metadata key="plater_id" value="1"/>'));
  assert.ok(config.includes('<metadata key="bed_type" value="Textured PEI Plate"/>'));
  for (let i = 1; i <= built.items.length; i++) assert.ok(model.includes(`<object id="${i}" `) && config.includes(`<object id="${i}">`));
  for (const m of config.matchAll(/<metadata key="([a-z_]+)"/g)) assert.ok(m[1] === 'name' || m[1] in SETTINGS || ['plater_id', 'plater_name', 'locked', 'bed_type', 'object_id', 'instance_id', 'identify_id'].includes(m[1]), m[1]);
  assert.ok(!model.includes('BambuStudio-'), 'the file does not claim to come from Bambu Studio');
});

test('for a Bambu printer the project config names only the system presets and lists nothing as different, so the slicer selects its own copies', () => {
  for (const p of PRINTERS.filter(x => x.presets)) {
    const json = JSON.parse(projectSettings(p, { plate: 'Cool Plate' }));
    assert.equal(json.name, 'project_settings');
    assert.equal(json.printer_model, p.presets.model);
    assert.equal(json.printer_settings_id, p.presets.printer);
    assert.equal(json.print_settings_id, p.presets.process);
    assert.deepEqual(json.filament_settings_id, [p.presets.filament]);
    assert.equal(json.filament_colour.length, 1, 'one filament, so the loader counts one');
    assert.deepEqual(json.inherits_group, ['', '', '']);
    assert.deepEqual(json.different_settings_to_system, ['', '', '']);
    assert.equal(json.curr_bed_type, 'Cool Plate');
    assert.ok(BED_TYPES.some(b => b.id === json.curr_bed_type));
    assert.ok(!('nozzle_diameter' in json) && !('machine_start_gcode' in json), 'no key the user\u2019s own profile would be overwritten by');
    for (const k of Object.keys(json)) assert.ok(['version', 'name', 'from', 'printer_technology', 'printer_model', 'printer_settings_id', 'print_settings_id', 'filament_settings_id', 'filament_colour', 'inherits_group', 'different_settings_to_system', 'curr_bed_type'].includes(k), k);
  }
  assert.equal(projectSettings(PRINTERS.find(p => p.id === 'mk4s')), null, 'a printer without Bambu presets gets no project config');
  const built = build([withDetail(TESTS[0])], { printer: PRINTERS.find(p => p.id === 'mk4s') });
  assert.ok(!unzip(threeMF(built, { printer: PRINTERS.find(p => p.id === 'mk4s') })).has('Metadata/project_settings.config'));
});

test('a session plate names every coupon by its test and keeps each test\u2019s settings apart', () => {
  const s = SESSIONS[0];
  const built = build(s.tests.map(id => withDetail(TESTS.find(t => t.id === id))), { printer: PRINTERS[0] });
  const files = unzip(threeMF(built, { printer: PRINTERS[0], plate: 'Textured PEI Plate' }));
  const config = decoder.decode(files.get('Metadata/model_settings.config').data);
  assert.ok(config.includes('Dimensions: contour × hole — '));
  assert.ok(config.includes('<metadata key="xy_hole_compensation" value="0.08"/>'));
  assert.ok(config.includes('<metadata key="initial_layer_flow_ratio" value="0.92"/>'));
  const objects = config.split('<object id=').slice(1);
  assert.equal(objects.length, built.items.length);
  assert.ok(objects.slice(9, 14).every(o => !o.includes('xy_') && !o.includes('initial_layer')), 'the fit sockets carry no settings');
});

test('the sheet and the legend name every coupon and both axes of every test', () => {
  const s = SESSIONS.find(x => x.id === 'sides');
  const built = build(s.tests.map(id => withDetail(TESTS.find(t => t.id === id))), { printer: PRINTERS[0] });
  const text = sheet(built, { printer: PRINTERS[0], plate: 'Textured PEI Plate' });
  assert.match(text, /TESTS ON THIS PLATE/); assert.match(text, /Scarf seam/); assert.match(text, /Outer wall speed/);
  assert.match(text, /seam_slope_min_length\s+10/);
  assert.match(text, /override_filament_scarf_seam_setting\s+1/);
  assert.match(text, /0\.20mm Standard @BBL P2S/);
  for (const it of built.items) assert.ok(text.includes(it.lines.join(' / ')), it.name);
  const svg = legendSVG(built, { printer: PRINTERS[0] });
  assert.match(svg, /^<svg /); assert.equal(svg.match(/<circle /g).length, 6, 'six cylinders drawn round');
  assert.ok(svg.includes('front → back: Seam position') && svg.includes('2 · Seam: scarf × position'));
  assert.equal(slug('Ironing: speed × flow'), 'ironing-speed-x-flow');
});
