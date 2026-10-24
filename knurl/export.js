/**
 * Knurl — the files. A binary STL per part, and a Bambu Studio 3MF with
 * one object made of two parts: the textured body on filament 1 and the
 * first-layer inlay on filament 2 (parts are components of one object;
 * the part settings in Metadata/model_settings.config carry the
 * extruder). For a Bambu printer the sparse project config names the
 * printer's own presets, with two filaments when there is an inlay, so
 * the file opens as a project with no warning. The ZIP is written by
 * hand: deflated when the platform has CompressionStream (the XML shrinks
 * five to ten times), stored otherwise.
 */

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let crc = 0xffffffff; for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
const encoder = new TextEncoder();
const toBytes = d => (typeof d === 'string' ? encoder.encode(d) : d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength));

export function zipStore(files) {
  return assembleZip(files.map(file => { const data = toBytes(file.data); return { name: encoder.encode(file.name), data, stored: data, crc: crc32(data), method: 0 }; }));
}

/** Deflate every entry with the platform's CompressionStream; falls back to store where there is none. */
export async function zipDeflate(files) {
  if (typeof CompressionStream !== 'function') return zipStore(files);
  const entries = [];
  for (const file of files) {
    const data = toBytes(file.data);
    const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const stored = new Uint8Array(await new Response(stream).arrayBuffer());
    entries.push({ name: encoder.encode(file.name), data, stored, crc: crc32(data), method: 8 });
  }
  return assembleZip(entries);
}

function assembleZip(entries) {
  const parts = [];
  let offset = 0;
  for (const e of entries) {
    const { name, data, stored, crc, method } = e;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, method, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true);
    local.setUint32(14, crc, true); local.setUint32(18, stored.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, stored); e.offset = offset; offset += 30 + name.length + stored.length;
  }
  const centralStart = offset;
  for (const e of entries) {
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, e.method, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, e.crc, true); c.setUint32(20, e.stored.length, true); c.setUint32(24, e.data.length, true); c.setUint16(28, e.name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true);
    c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, e.offset, true);
    parts.push(new Uint8Array(c.buffer), e.name); offset += 46 + e.name.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, offset - centralStart, true); end.setUint32(16, centralStart, true); end.setUint16(20, 0, true);
  parts.push(new Uint8Array(end.buffer));
  const out = new Uint8Array(offset + 22); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out.buffer;
}

export const PRINTERS = Object.freeze([
  { id: 'p2s', name: 'Bambu Lab P2S', short: 'P2S', bed: [256, 256, 256], exclude: [18, 28], presets: { model: 'Bambu Lab P2S', printer: 'Bambu Lab P2S 0.4 nozzle', process: '0.20mm Standard @BBL P2S', filament: 'Bambu PLA Basic @BBL P2S' } },
  { id: 'x1c', name: 'Bambu Lab X1 Carbon', short: 'X1C', bed: [256, 256, 256], exclude: [18, 28], presets: { model: 'Bambu Lab X1 Carbon', printer: 'Bambu Lab X1 Carbon 0.4 nozzle', process: '0.20mm Standard @BBL X1C', filament: 'Bambu PLA Basic @BBL X1C' } },
  { id: 'p1s', name: 'Bambu Lab P1S', short: 'P1S', bed: [256, 256, 256], exclude: [18, 28], presets: { model: 'Bambu Lab P1S', printer: 'Bambu Lab P1S 0.4 nozzle', process: '0.20mm Standard @BBL P1P', filament: 'Bambu PLA Basic @BBL P1P' } },
  { id: 'a1', name: 'Bambu Lab A1', short: 'A1', bed: [256, 256, 256], exclude: [18, 28], presets: { model: 'Bambu Lab A1', printer: 'Bambu Lab A1 0.4 nozzle', process: '0.20mm Standard @BBL A1', filament: 'Bambu PLA Basic @BBL A1' } },
  { id: 'a1mini', name: 'Bambu Lab A1 mini', short: 'A1 mini', bed: [180, 180, 180], exclude: [18, 28], presets: { model: 'Bambu Lab A1 mini', printer: 'Bambu Lab A1 mini 0.4 nozzle', process: '0.20mm Standard @BBL A1M', filament: 'Bambu PLA Basic @BBL A1M' } },
  { id: 'h2d', name: 'Bambu Lab H2D', short: 'H2D', bed: [350, 320, 325], exclude: [18, 28], presets: { model: 'Bambu Lab H2D', printer: 'Bambu Lab H2D 0.4 nozzle', process: '0.20mm Standard @BBL H2D', filament: 'Bambu PLA Basic @BBL H2D' } },
  { id: 'mk4s', name: 'Prusa MK4S', short: 'MK4S', bed: [250, 210, 220] },
  { id: 'coreone', name: 'Prusa CORE One', short: 'CORE One', bed: [250, 220, 270] },
  { id: 'g220', name: 'Any 220 mm printer', short: '220 mm', bed: [220, 220, 220] },
  { id: 'g300', name: 'Any 300 mm printer', short: '300 mm', bed: [300, 300, 300] },
]);

/** The sparse project config; `colours` is one entry per filament. */
export function projectSettings(printer, { plate = 'Textured PEI Plate', colours = ['#00AE42'] } = {}) {
  const p = printer && printer.presets;
  if (!p) return null;
  const n = colours.length, blanks = Array(n + 2).fill('');
  return JSON.stringify({
    version: '1.0', name: 'project_settings', from: 'project', printer_technology: 'FFF',
    printer_model: p.model, printer_settings_id: p.printer, print_settings_id: p.process, filament_settings_id: Array(n).fill(p.filament),
    filament_colour: colours, inherits_group: blanks, different_settings_to_system: blanks, curr_bed_type: plate,
  }, null, 4) + '\n';
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = v => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? '0' : String(r); };
function meshXML(mesh) {
  const { positions: v, indices: f } = mesh;
  const out = ['<mesh><vertices>'];
  for (let i = 0; i < v.length; i += 3) out.push(`<vertex x="${num(v[i])}" y="${num(v[i + 1])}" z="${num(v[i + 2])}"/>`);
  out.push('</vertices><triangles>');
  for (let i = 0; i < f.length; i += 3) out.push(`<triangle v1="${f[i]}" v2="${f[i + 1]}" v3="${f[i + 2]}"/>`);
  out.push('</triangles></mesh>');
  return out.join('');
}

/**
 * One object of several parts. `parts` = [{ name, mesh, extruder }], in
 * print-priority order (a later part wins where it overlaps an earlier
 * one). The object is placed with its XY centre at (x, y) on the plate.
 */
export async function threeMF(parts, { printer, plate = 'Textured PEI Plate', colours, title = 'Knurl part', x, y, objectSettings = {} } = {}) {
  const bedW = printer ? printer.bed[0] : 256, bedD = printer ? printer.bed[1] : 256;
  // centre the body on the plate (all parts share the body's frame)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const p0 = parts[0].mesh.positions;
  for (let i = 0; i < p0.length; i += 3) { if (p0[i] < minX) minX = p0[i]; if (p0[i] > maxX) maxX = p0[i]; if (p0[i + 1] < minY) minY = p0[i + 1]; if (p0[i + 1] > maxY) maxY = p0[i + 1]; }
  const tx = (x ?? bedW / 2) - (minX + maxX) / 2, ty = (y ?? bedD / 2) - (minY + maxY) / 2;
  const objectId = parts.length + 1;
  const model = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `<metadata name="Title">${esc(title)}</metadata>`, '<metadata name="Application">Knurl (kmay89.com/knurl)</metadata>',
    `<metadata name="Description">${esc('A textured part with a first-layer inlay as a second part on filament 2. Open as a project in Bambu Studio.')}</metadata>`,
    '<resources>'];
  parts.forEach((p, i) => model.push(`<object id="${i + 1}" name="${esc(p.name)}" type="model">${meshXML(p.mesh)}</object>`));
  model.push(`<object id="${objectId}" name="${esc(title)}" type="model"><components>`);
  parts.forEach((p, i) => model.push(`<component objectid="${i + 1}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`));
  model.push('</components></object>', '</resources><build>', `<item objectid="${objectId}" transform="1 0 0 0 1 0 0 0 1 ${num(tx)} ${num(ty)} 0" printable="1"/>`, '</build></model>');

  const config = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>', `  <object id="${objectId}">`, `    <metadata key="name" value="${esc(title)}"/>`, '    <metadata key="extruder" value="1"/>'];
  for (const [k, v] of Object.entries(objectSettings)) config.push(`    <metadata key="${esc(k)}" value="${esc(v)}"/>`);
  parts.forEach((p, i) => {
    config.push(`    <part id="${i + 1}" subtype="normal_part">`, `      <metadata key="name" value="${esc(p.name)}"/>`, `      <metadata key="extruder" value="${p.extruder || 1}"/>`, '    </part>');
  });
  config.push('  </object>', '  <plate>', '    <metadata key="plater_id" value="1"/>', `    <metadata key="plater_name" value="${esc(title)}"/>`, '    <metadata key="locked" value="false"/>');
  if (printer && printer.presets) config.push(`    <metadata key="bed_type" value="${esc(plate)}"/>`);
  config.push('    <model_instance>', `      <metadata key="object_id" value="${objectId}"/>`, '      <metadata key="instance_id" value="0"/>', `      <metadata key="identify_id" value="${objectId}"/>`, '    </model_instance>', '  </plate>', '</config>');

  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>' },
    { name: '3D/3dmodel.model', data: model.join('\n') },
    { name: 'Metadata/model_settings.config', data: config.join('\n') + '\n' },
  ];
  const project = projectSettings(printer, { plate, colours: colours || (parts.length > 1 ? ['#F2EEE4', '#2B2B2B'] : ['#F2EEE4']) });
  if (project) files.push({ name: 'Metadata/project_settings.config', data: project });
  return zipDeflate(files);
}
