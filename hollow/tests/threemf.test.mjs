import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, zip, modelXML, write3MF } from '../threemf.js';
import { extrude } from '../samples.js';

/** A small ZIP reader for the tests: walks the central directory and inflates each entry. */
async function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  assert.ok(eocd >= 0, 'end of central directory found');
  const count = view.getUint16(eocd + 10, true), cdOffset = view.getUint32(eocd + 16, true);
  const entries = {};
  let o = cdOffset;
  for (let n = 0; n < count; n++) {
    assert.equal(view.getUint32(o, true), 0x02014b50);
    const method = view.getUint16(o + 10, true), crc = view.getUint32(o + 16, true), csize = view.getUint32(o + 20, true), usize = view.getUint32(o + 24, true);
    const nameLen = view.getUint16(o + 28, true), extraLen = view.getUint16(o + 30, true), commentLen = view.getUint16(o + 32, true);
    const local = view.getUint32(o + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(o + 46, o + 46 + nameLen));
    assert.equal(view.getUint32(local, true), 0x04034b50);
    const lname = view.getUint16(local + 26, true), lextra = view.getUint16(local + 28, true);
    const start = local + 30 + lname + lextra;
    let data = bytes.subarray(start, start + csize);
    if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    assert.equal(data.length, usize, `${name} size`);
    assert.equal(crc32(data), crc, `${name} crc`);
    entries[name] = new TextDecoder().decode(data);
    o += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

test('crc32 matches the reference value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('zip writes entries that read back, stored and deflated', async () => {
  const text = 'hello hollow '.repeat(200);
  for (const compress of [false, true]) {
    const bytes = await zip({ 'a.txt': text, 'dir/b.bin': new Uint8Array([1, 2, 3, 4]) }, { compress });
    const entries = await readZip(bytes);
    assert.equal(entries['a.txt'], text);
    assert.equal(entries['dir/b.bin'].length, 4);
    if (compress) assert.ok(bytes.length < text.length / 4, 'deflate shrank it');
  }
});

test('the 3MF holds every part, named and placed', async () => {
  const a = extrude([[0, 0], [10, 0], [10, 10], [0, 10]], 0, 5);
  const b = extrude([[0, 0], [4, 0], [4, 4], [0, 4]], 0, 4);
  const xml = modelXML([{ name: 'Half A <lower>', mesh: a, translate: [10, 20, 0] }, { name: 'Half B', mesh: b }]);
  assert.ok(xml.includes('unit="millimeter"'));
  assert.ok(xml.includes('name="Half A &lt;lower&gt;"'));
  assert.equal((xml.match(/<object /g) || []).length, 2);
  assert.equal((xml.match(/<vertex /g) || []).length, a.positions.length / 3 + b.positions.length / 3);
  assert.equal((xml.match(/<triangle /g) || []).length, a.indices.length / 3 + b.indices.length / 3);
  assert.ok(xml.includes('transform="1 0 0 0 1 0 0 0 1 10 20 0"'));
  const bytes = await write3MF([{ name: 'Half A', mesh: a }, { name: 'Half B', mesh: b, translate: [30, 0, 0] }], { title: 'test' });
  const entries = await readZip(bytes);
  assert.ok(entries['[Content_Types].xml'].includes('3dmanufacturing-3dmodel+xml'));
  assert.ok(entries['_rels/.rels'].includes('/3D/3dmodel.model'));
  assert.ok(entries['3D/3dmodel.model'].includes('<item objectid="2" transform="1 0 0 0 1 0 0 0 1 30 0 0"/>'));
  assert.ok(entries['3D/3dmodel.model'].includes('<metadata name="Title">test</metadata>'));
});
