import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { zipStore, crc32, threeMF, partSTL, partFileName, printSheet, bundle } = await import('../export.js');
const { newDesign, partsList, packPlates, PRINTERS } = await import('../layout.js');

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
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('a stored ZIP holds its files, byte for byte, with the right checksums', () => {
  const zip = zipStore([{ name: 'a.txt', data: 'hello' }, { name: 'dir/b.bin', data: new Uint8Array([1, 2, 3, 250]) }]);
  const files = unzip(zip);
  assert.deepEqual([...files.keys()], ['a.txt', 'dir/b.bin']);
  assert.equal(decoder.decode(files.get('a.txt').data), 'hello');
  assert.deepEqual([...files.get('dir/b.bin').data], [1, 2, 3, 250]);
  for (const f of files.values()) assert.equal(crc32(f.data), f.crc);
  // The system's own unzip must agree, where it exists.
  if (existsSync('/usr/bin/unzip')) {
    const dir = mkdtempSync(join(tmpdir(), 'cubby-zip-'));
    writeFileSync(join(dir, 't.zip'), Buffer.from(zip));
    const out = execFileSync('/usr/bin/unzip', ['-t', join(dir, 't.zip')], { encoding: 'utf8' });
    assert.match(out, /No errors detected/);
  }
});

test('a 3MF is a ZIP with the three parts a slicer looks for, one object per unique part', () => {
  const design = newDesign({ width: 300, depth: 200, height: 50, space: 'other', recipe: 'bigsmall' });
  const list = partsList(design);
  const packing = packPlates(list.parts, PRINTERS[0]);
  const files = unzip(threeMF(packing.plates[0], { bed: packing.bed }));
  assert.ok(files.has('[Content_Types].xml') && files.has('_rels/.rels') && files.has('3D/3dmodel.model'));
  const model = decoder.decode(files.get('3D/3dmodel.model').data);
  assert.match(model, /<model unit="millimeter"/);
  const objects = model.match(/<object /g).length, items = model.match(/<item /g).length;
  assert.equal(items, packing.plates[0].items.length);
  assert.equal(objects, new Set(packing.plates[0].items.map(i => i.part.key)).size);
  for (const it of packing.plates[0].items) assert.ok(model.includes(`name="${it.part.title}"`), `names ${it.part.title}`);
  // Every triangle index points at a vertex of its object.
  for (const obj of model.matchAll(/<object[^>]*>(.*?)<\/object>/gs)) {
    const vertexCount = (obj[1].match(/<vertex /g) || []).length;
    for (const t of obj[1].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)) {
      for (const v of t.slice(1, 4)) assert.ok(Number(v) < vertexCount);
    }
  }
  // Turned parts are turned by a proper rotation that keeps them on the plate.
  for (const item of model.matchAll(/transform="([^"]+)"/g)) {
    const t = item[1].split(' ').map(Number);
    assert.equal(t.length, 12);
    assert.ok(t[9] >= 0 && t[10] >= 0 && t[11] === 0);
    const det = t[0] * (t[4] * t[8] - t[5] * t[7]) - t[1] * (t[3] * t[8] - t[5] * t[6]) + t[2] * (t[3] * t[7] - t[4] * t[6]);
    assert.ok(Math.abs(det - 1) < 1e-9, 'a rotation, not a mirror');
  }
});

test('STL names are safe file names and the sheet names every part', () => {
  const design = newDesign({ width: 300, depth: 300, height: 50, space: 'desk', recipe: 'pens' });
  const list = partsList(design);
  const packing = packPlates(list.parts, PRINTERS[0]);
  for (const part of list.parts) {
    assert.match(partFileName(part), /^[a-z0-9-]+-x\d+\.stl$/);
    assert.equal(partSTL(part).byteLength, 84 + part.mesh.triangleCount * 50);
  }
  const sheet = printSheet(design, list, packing);
  for (const part of list.parts) assert.ok(sheet.includes(part.title), `sheet names ${part.title}`);
  assert.match(sheet, /Plate 1:/);
  assert.match(sheet, /Walls\s+4 loops/);
  const files = unzip(bundle(design, list, packing));
  assert.ok(files.has('print-sheet.txt') && files.has('cubby-design.json'));
  assert.ok([...files.keys()].some(n => n.endsWith('.3mf')) && [...files.keys()].some(n => n.startsWith('stl/')));
  const saved = JSON.parse(decoder.decode(files.get('cubby-design.json').data));
  assert.equal(saved.bins.length, design.bins.length);
});
