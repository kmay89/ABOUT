import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
const P = await import('../plan.js');
const G = await import('../geometry.js');
const I = await import('../inlay.js');
const E = await import('../../knurl/export.js');
const { TUCK_APP } = await import('../export.js');

const decoder = new TextDecoder();
function unzip(buffer) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer), files = new Map();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true), nameLength = view.getUint16(at + 26, true), extra = view.getUint16(at + 28, true);
    const name = decoder.decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const start = at + 30 + nameLength + extra, method = view.getUint16(at + 8, true);
    const raw = bytes.subarray(start, start + size);
    files.set(name, method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw);
    at = start + size;
  }
  return files;
}

test('the 3MF names Tuck, carries the sheet on filament 1 and the name on filament 2, and opens silently on a P2S', async () => {
  const plan = P.planBox({});
  const sheet = G.sheetMesh(plan.regions);
  const fp = I.footprint(plan);
  const raster = { width: 30, height: 10, data: new Uint8Array(300).fill(1) };
  const inlay = I.inlaySolid(I.placeRaster(fp, raster, P.namePlace(plan, 'lid')));
  const zip = await E.threeMF([{ name: 'Box sheet', mesh: sheet, extruder: 1 }, { name: 'Name on the first layer', mesh: inlay.mesh, extruder: 2 }], { printer: E.PRINTERS[0], app: TUCK_APP, title: 'Tuck box', colours: ['#F2C200', '#FFFFFF'] });
  const files = unzip(zip);
  const model = decoder.decode(files.get('3D/3dmodel.model'));
  assert.match(model, /<metadata name="Application">Tuck \(kmay89\.com\/tuck\)<\/metadata>/);
  assert.equal((model.match(/<object /g) || []).length, 3);
  const settings = decoder.decode(files.get('Metadata/model_settings.config'));
  assert.match(settings, /<part id="2" subtype="normal_part">\s*<metadata key="name" value="Name on the first layer"\/>\s*<metadata key="extruder" value="2"\/>/);
  const project = JSON.parse(decoder.decode(files.get('Metadata/project_settings.config')));
  assert.deepEqual(project.filament_colour, ['#F2C200', '#FFFFFF']);
  assert.equal(project.printer_settings_id, 'Bambu Lab P2S 0.4 nozzle');
  // Knurl's own files still say Knurl
  const k = unzip(await E.threeMF([{ name: 'Body', mesh: sheet, extruder: 1 }], { printer: E.PRINTERS[0] }));
  assert.match(decoder.decode(k.get('3D/3dmodel.model')), /Application">Knurl/);
});
