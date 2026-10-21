import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { zipStore, crc32, threeMF, sheet, legendSVG, slug } = await import('../export.js');
const { TESTS, SETTINGS } = await import('../tests.js');
const { PRINTERS, build, estimate } = await import('../plate.js');
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

test('every test builds a grid of closed coupons that fits the P2S plate, clear of the purge corner', () => {
  for (const tst of TESTS) {
    const built = build(tst, { printer: PRINTERS[0] });
    assert.deepEqual(built.warnings, [], `${tst.id}: ${built.warnings.join(' ')}`);
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
    assert.ok(est.grams > 5 && est.grams < 400 && est.minutes > 10, `${tst.id} estimate is sane`);
  }
});

test('a grid too big for the plate says so instead of placing coupons off it', () => {
  const tst = TESTS.find(t => t.id === 'walls');
  const big = { ...tst, x: { ...tst.x, values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120] } };
  const built = build(big, { printer: PRINTERS.find(p => p.id === 'a1mini') });
  assert.ok(built.warnings.some(w => /fewer values/.test(w)));
});

test('the 3MF carries the coupons, their places, and each one’s settings the way Bambu Studio reads them', () => {
  const tst = TESTS.find(t => t.id === 'ironing');
  const built = build(tst, { printer: PRINTERS[0] });
  const files = unzip(threeMF(tst, built.items, { printer: PRINTERS[0] }));
  for (const name of ['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', 'Metadata/model_settings.config']) assert.ok(files.has(name), name);
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
  // object ids in the model and the config agree, and every key is a setting the catalogue knows
  for (let i = 1; i <= built.items.length; i++) assert.ok(model.includes(`<object id="${i}" `) && config.includes(`<object id="${i}">`));
  for (const m of config.matchAll(/<metadata key="([a-z_]+)"/g)) assert.ok(m[1] === 'name' || m[1] in SETTINGS || ['plater_id', 'plater_name', 'locked', 'object_id', 'instance_id', 'identify_id'].includes(m[1]), m[1]);
  assert.ok(!model.includes('BambuStudio-'), 'the file does not claim to come from Bambu Studio');
  assert.ok(!files.has('Metadata/project_settings.config'), 'no profile is embedded, so the user’s own stay selected');
});

test('the sheet and the legend name every coupon and both axes', () => {
  const tst = TESTS.find(t => t.id === 'seam');
  const built = build(tst, { printer: PRINTERS[0] });
  const text = sheet(tst, built, { printer: PRINTERS[0] });
  assert.match(text, /Scarf seam/); assert.match(text, /Seam position/);
  assert.match(text, /seam_slope_min_length\s+10/);
  assert.match(text, /override_filament_scarf_seam_setting\s+1/);
  for (const it of built.items) assert.ok(text.includes(it.lines.join(' / ')), it.name);
  const svg = legendSVG(tst, built, { printer: PRINTERS[0] });
  assert.match(svg, /^<svg /); assert.equal(svg.match(/<circle /g).length, built.items.length);
  assert.ok(svg.includes('front → back: Seam position'));
  assert.equal(slug('Ironing: speed × flow'), 'ironing-speed-x-flow');
});
