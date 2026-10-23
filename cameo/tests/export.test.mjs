import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const m = await import('../mask.js');
const r = await import('../relief.js');
const e = await import('../export.js');

const decoder = new TextDecoder();
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
  assert.equal(view.getUint32(at, true), 0x02014b50);
  return files;
}
function disc(w, h, cx, cy, rad) { const k = m.makeMask(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad) k.data[y * w + x] = 1; return k; }

function parts() {
  const fig = r.buildFigure(disc(80, 100, 40, 50, 35), null, { height: 50 });
  const ped = r.buildPedestal(fig.tab);
  return [{ name: 'Figure (lying on its back)', mesh: fig.mesh, size: fig.size, settings: e.PART_SETTINGS.figure }, { name: 'Pedestal', mesh: ped.mesh, size: ped.size, settings: e.PART_SETTINGS.pedestal }];
}

test('the ZIP is sound and the STL has one record per triangle', () => {
  const zip = e.zipStore([{ name: 'a.txt', data: 'hello' }]);
  const files = unzip(zip);
  assert.equal(decoder.decode(files.get('a.txt').data), 'hello');
  assert.equal(e.crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog')), 0x414fa339);
  if (existsSync('/usr/bin/unzip')) {
    const dir = mkdtempSync(join(tmpdir(), 'cameo-'));
    writeFileSync(join(dir, 't.zip'), Buffer.from(zip));
    assert.match(execFileSync('/usr/bin/unzip', ['-t', join(dir, 't.zip')], { encoding: 'utf8' }), /No errors detected/);
  }
  const [fig] = parts();
  const stl = e.binarySTL(fig.mesh);
  assert.equal(new DataView(stl).getUint32(80, true), fig.mesh.indices.length / 3);
  assert.equal(stl.byteLength, 84 + 50 * (fig.mesh.indices.length / 3));
});

test('the parts lie side by side on the plate, clear of the purge corner, and a plate too small says so', () => {
  const lay = e.layout(parts(), e.PRINTERS[0]);
  assert.deepEqual(lay.warnings, []);
  const [a, b] = lay.placed;
  assert.ok(a.x + a.size[0] / 2 < b.x - b.size[0] / 2, 'no overlap');
  for (const p of lay.placed) assert.ok(p.x - p.size[0] / 2 >= 18 || p.y - p.size[1] / 2 >= 28, 'clear of the purge corner');
  const tiny = { id: 't', short: 'tiny', bed: [60, 60, 60] };
  assert.ok(e.layout(parts(), tiny).warnings.length === 1);
});

test('the 3MF carries both parts with their settings, the plate, and the sparse Bambu project config', () => {
  const lay = e.layout(parts(), e.PRINTERS[0]);
  const files = unzip(e.threeMF(lay.placed, { printer: e.PRINTERS[0], plate: 'Textured PEI Plate' }));
  for (const n of ['[Content_Types].xml', '_rels/.rels', '3D/3dmodel.model', 'Metadata/model_settings.config', 'Metadata/project_settings.config']) assert.ok(files.has(n), n);
  const model = decoder.decode(files.get('3D/3dmodel.model').data);
  assert.equal(model.match(/<object /g).length, 2);
  assert.ok(model.includes(`transform="1 0 0 0 1 0 0 0 1 ${Math.round(lay.placed[0].x * 1000) / 1000} ${Math.round(lay.placed[0].y * 1000) / 1000} 0"`));
  const config = decoder.decode(files.get('Metadata/model_settings.config').data);
  assert.ok(config.includes('<metadata key="ironing_type" value="no ironing"/>'));
  assert.ok(config.includes('<metadata key="ironing_type" value="topmost"/>'));
  assert.ok(config.includes('<metadata key="bed_type" value="Textured PEI Plate"/>'));
  const project = JSON.parse(decoder.decode(files.get('Metadata/project_settings.config').data));
  assert.equal(project.printer_settings_id, 'Bambu Lab P2S 0.4 nozzle');
  assert.deepEqual(project.different_settings_to_system, ['', '', '']);
  const prusa = unzip(e.threeMF(e.layout(parts(), e.PRINTERS.find(p => p.id === 'mk4s')).placed, { printer: e.PRINTERS.find(p => p.id === 'mk4s') }));
  assert.ok(!prusa.has('Metadata/project_settings.config'));
});
