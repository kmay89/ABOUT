import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
const M = await import('../mesh.js');
const T = await import('../texture.js');
const I = await import('../inlay.js');
const E = await import('../export.js');
const { roundedBox } = await import('../samples.js');

const decoder = new TextDecoder();
function unzip(buffer) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer), files = new Map();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true), nameLength = view.getUint16(at + 26, true), extra = view.getUint16(at + 28, true);
    const name = decoder.decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const start = at + 30 + nameLength + extra, method = view.getUint16(at + 8, true);
    const raw = bytes.subarray(start, start + size);
    const data = method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw;
    assert.equal(E.crc32(data), view.getUint32(at + 14, true), `${name} crc`);
    files.set(name, { data, crc: view.getUint32(at + 14, true), method });
    at = start + size;
  }
  assert.equal(view.getUint32(at, true), 0x02014b50);
  return files;
}
function parts() {
  const body = T.applyTexture(roundedBox(40, 30, 12, 4), { texture: 'hex', where: 'walls', period: 4, depth: 0.4, maxTriangles: 20000 }).mesh;
  const inlay = I.buildInlay(body, { pattern: 'stripes', period: 6, weight: 0.4, layers: 2, margin: 1 }).mesh;
  return [{ name: 'Body', mesh: body, extruder: 1 }, { name: 'First-layer inlay', mesh: inlay, extruder: 2 }];
}

test('the ZIP is sound, stored or deflated, and the STL has one record per triangle', async () => {
  const zip = E.zipStore([{ name: 'a.txt', data: 'hello' }]);
  assert.equal(decoder.decode(unzip(zip).get('a.txt').data), 'hello');
  assert.equal(E.crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog')), 0x414fa339);
  if (existsSync('/usr/bin/unzip')) {
    const dir = mkdtempSync(join(tmpdir(), 'knurl-'));
    writeFileSync(join(dir, 't.zip'), Buffer.from(zip));
    assert.match(execFileSync('/usr/bin/unzip', ['-t', join(dir, 't.zip')], { encoding: 'utf8' }), /No errors detected/);
  }
  const deflated = await E.zipDeflate([{ name: 'a.txt', data: 'hello hello hello hello' }]);
  assert.equal(decoder.decode(unzip(deflated).get('a.txt').data), 'hello hello hello hello');
  if (existsSync('/usr/bin/unzip')) {
    const dir = mkdtempSync(join(tmpdir(), 'knurl-'));
    writeFileSync(join(dir, 'd.3mf'), Buffer.from(await E.threeMF(parts(), { printer: E.PRINTERS[0] })));
    assert.match(execFileSync('/usr/bin/unzip', ['-t', join(dir, 'd.3mf')], { encoding: 'utf8' }), /No errors detected/);
  }
  const [body] = parts();
  const stl = M.binarySTL(body.mesh);
  assert.equal(new DataView(stl).getUint32(80, true), body.mesh.indices.length / 3);
  assert.equal(stl.byteLength, 84 + 50 * (body.mesh.indices.length / 3));
});

test('the 3MF is one object of two parts, the inlay on extruder 2, centred on the plate, with a two-filament project config', async () => {
  const ps = parts();
  const files = unzip(await E.threeMF(ps, { printer: E.PRINTERS[0], plate: 'Cool Plate', title: 'Test part' }));
  for (const name of ['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', 'Metadata/model_settings.config', 'Metadata/project_settings.config']) assert.ok(files.has(name), name);
  assert.equal(files.get('3D/3dmodel.model').method, 8, 'the model is deflated');
  const model = decoder.decode(files.get('3D/3dmodel.model').data);
  assert.equal((model.match(/<object /g) || []).length, 3, 'two part objects and one assembly');
  assert.match(model, /<object id="3" name="Test part" type="model"><components>\s*<component objectid="1"[^>]*\/>\s*<component objectid="2"/);
  assert.equal((model.match(/<triangle /g) || []).length, (ps[0].mesh.indices.length + ps[1].mesh.indices.length) / 3);
  assert.match(model, /<metadata name="Application">Knurl \(kmay89\.com\/knurl\)<\/metadata>/);
  const item = model.match(/<item objectid="3" transform="1 0 0 0 1 0 0 0 1 ([\d.-]+) ([\d.-]+) 0" printable="1"\/>/);
  assert.ok(item, 'one build item for the assembly');
  const b = M.bounds(ps[0].mesh);
  assert.ok(Math.abs(+item[1] + (b.min[0] + b.max[0]) / 2 - 128) < 0.01, 'centred in X');
  assert.ok(Math.abs(+item[2] + (b.min[1] + b.max[1]) / 2 - 128) < 0.01, 'centred in Y');

  const settings = decoder.decode(files.get('Metadata/model_settings.config').data);
  assert.match(settings, /<object id="3">/);
  assert.match(settings, /<part id="1" subtype="normal_part">\s*<metadata key="name" value="Body"\/>\s*<metadata key="extruder" value="1"\/>/);
  assert.match(settings, /<part id="2" subtype="normal_part">\s*<metadata key="name" value="First-layer inlay"\/>\s*<metadata key="extruder" value="2"\/>/);
  assert.match(settings, /<metadata key="bed_type" value="Cool Plate"\/>/);
  assert.match(settings, /<model_instance>\s*<metadata key="object_id" value="3"\/>/);

  const project = JSON.parse(decoder.decode(files.get('Metadata/project_settings.config').data));
  assert.equal(project.printer_settings_id, 'Bambu Lab P2S 0.4 nozzle');
  assert.equal(project.print_settings_id, '0.20mm Standard @BBL P2S');
  assert.deepEqual(project.filament_settings_id, ['Bambu PLA Basic @BBL P2S', 'Bambu PLA Basic @BBL P2S']);
  assert.deepEqual(project.filament_colour, ['#F2EEE4', '#2B2B2B']);
  assert.equal(project.different_settings_to_system.length, 4, 'print + printer + two filaments');
  assert.ok(project.different_settings_to_system.every(s => s === ''), 'nothing differs from the system presets');
  assert.equal(project.curr_bed_type, 'Cool Plate');
});

test('colours, object settings and a body-only file come through; non-Bambu printers get no project config', async () => {
  const ps = parts();
  const files = unzip(await E.threeMF(ps, { printer: E.PRINTERS[0], colours: ['#FF0000', '#00FF00'], objectSettings: { wall_loops: '3' } }));
  const project = JSON.parse(decoder.decode(files.get('Metadata/project_settings.config').data));
  assert.deepEqual(project.filament_colour, ['#FF0000', '#00FF00']);
  assert.match(decoder.decode(files.get('Metadata/model_settings.config').data), /<metadata key="wall_loops" value="3"\/>/);
  const solo = unzip(await E.threeMF([ps[0]], { printer: E.PRINTERS[0] }));
  const soloProject = JSON.parse(decoder.decode(solo.get('Metadata/project_settings.config').data));
  assert.equal(soloProject.filament_settings_id.length, 1);
  assert.equal((decoder.decode(solo.get('3D/3dmodel.model').data).match(/<object /g) || []).length, 2);
  const prusa = E.PRINTERS.find(p => p.id === 'mk4s');
  const open = unzip(await E.threeMF(ps, { printer: prusa }));
  assert.ok(!open.has('Metadata/project_settings.config'));
  assert.doesNotMatch(decoder.decode(open.get('Metadata/model_settings.config').data), /bed_type/);
  assert.equal(E.projectSettings(prusa), null);
  const mini = E.PRINTERS.find(p => p.id === 'a1mini');
  const miniItem = decoder.decode(unzip(await E.threeMF([ps[0]], { printer: mini })).get('3D/3dmodel.model').data).match(/<item [^>]*transform="1 0 0 0 1 0 0 0 1 ([\d.-]+) ([\d.-]+) 0"/);
  const b = M.bounds(ps[0].mesh);
  assert.ok(Math.abs(+miniItem[1] + (b.min[0] + b.max[0]) / 2 - 90) < 0.01, 'centred on the small plate');
});

test('every Bambu printer names a full preset set and the plate sizes are sane', () => {
  for (const p of E.PRINTERS) {
    assert.ok(p.bed.every(v => v >= 150 && v <= 400), p.id);
    if (p.presets) for (const k of ['model', 'printer', 'process', 'filament']) assert.ok(p.presets[k], `${p.id}.${k}`);
  }
  assert.equal(E.PRINTERS[0].id, 'p2s');
});
