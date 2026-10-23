/**
 * Cameo — the files. A binary STL per part, and a 3MF with the figure
 * lying on its back and the pedestal standing beside it, placed on the
 * plate, so Bambu Studio opens it as a project ready to slice. For a
 * Bambu printer the 3MF carries the sparse project config that names the
 * printer's own presets (see swatch/export.js for the reasoning), so it
 * opens with no warning, and per-object settings that suit a relief:
 * the figure gets more top layers and no ironing of its face.
 *
 * The ZIP is written by hand, store only. No DOM; runs anywhere.
 */

/* ---------- ZIP (store only) ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();
function toBytes(data) {
  if (typeof data === 'string') return encoder.encode(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new TypeError('A ZIP entry must be a string or bytes.');
}

export function zipStore(files) {
  const entries = [], parts = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), data = toBytes(file.data), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    entries.push({ name, data, crc, offset });
    offset += 30 + name.length + data.length;
  }
  const centralStart = offset;
  for (const e of entries) {
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, e.crc, true); c.setUint32(20, e.data.length, true); c.setUint32(24, e.data.length, true);
    c.setUint16(28, e.name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true);
    c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, e.offset, true);
    parts.push(new Uint8Array(c.buffer), e.name);
    offset += 46 + e.name.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, offset - centralStart, true); end.setUint32(16, centralStart, true); end.setUint16(20, 0, true);
  parts.push(new Uint8Array(end.buffer));
  const out = new Uint8Array(offset + 22);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out.buffer;
}

/* ---------- STL ---------- */

export function binarySTL(mesh, { header = 'Cameo | mm | Z up' } = {}) {
  const tris = mesh.indices.length / 3;
  const out = new ArrayBuffer(84 + tris * 50), view = new DataView(out);
  new TextEncoder().encodeInto(header.slice(0, 80), new Uint8Array(out, 0, 80));
  view.setUint32(80, tris, true);
  const v = mesh.vertices;
  let o = 84;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] * 3, b = mesh.indices[i + 1] * 3, c = mesh.indices[i + 2] * 3;
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    view.setFloat32(o, nx, true); view.setFloat32(o + 4, ny, true); view.setFloat32(o + 8, nz, true); o += 12;
    for (const p of [a, b, c]) { view.setFloat32(o, v[p], true); view.setFloat32(o + 4, v[p + 1], true); view.setFloat32(o + 8, v[p + 2], true); o += 12; }
    view.setUint16(o, 0, true); o += 2;
  }
  return out;
}

/* ---------- printers ---------- */

export const PRINTERS = Object.freeze([
  { id: 'p2s', name: 'Bambu Lab P2S', short: 'P2S', bed: [256, 256, 256], exclude: [18, 28],
    presets: { model: 'Bambu Lab P2S', printer: 'Bambu Lab P2S 0.4 nozzle', process: '0.20mm Standard @BBL P2S', filament: 'Bambu PLA Basic @BBL P2S' } },
  { id: 'x1c', name: 'Bambu Lab X1 Carbon', short: 'X1C', bed: [256, 256, 256], exclude: [18, 28],
    presets: { model: 'Bambu Lab X1 Carbon', printer: 'Bambu Lab X1 Carbon 0.4 nozzle', process: '0.20mm Standard @BBL X1C', filament: 'Bambu PLA Basic @BBL X1C' } },
  { id: 'p1s', name: 'Bambu Lab P1S', short: 'P1S', bed: [256, 256, 256], exclude: [18, 28],
    presets: { model: 'Bambu Lab P1S', printer: 'Bambu Lab P1S 0.4 nozzle', process: '0.20mm Standard @BBL P1P', filament: 'Bambu PLA Basic @BBL P1P' } },
  { id: 'a1', name: 'Bambu Lab A1', short: 'A1', bed: [256, 256, 256], exclude: [18, 28],
    presets: { model: 'Bambu Lab A1', printer: 'Bambu Lab A1 0.4 nozzle', process: '0.20mm Standard @BBL A1', filament: 'Bambu PLA Basic @BBL A1' } },
  { id: 'a1mini', name: 'Bambu Lab A1 mini', short: 'A1 mini', bed: [180, 180, 180], exclude: [18, 28],
    presets: { model: 'Bambu Lab A1 mini', printer: 'Bambu Lab A1 mini 0.4 nozzle', process: '0.20mm Standard @BBL A1M', filament: 'Bambu PLA Basic @BBL A1M' } },
  { id: 'h2d', name: 'Bambu Lab H2D', short: 'H2D', bed: [350, 320, 325], exclude: [18, 28],
    presets: { model: 'Bambu Lab H2D', printer: 'Bambu Lab H2D 0.4 nozzle', process: '0.20mm Standard @BBL H2D', filament: 'Bambu PLA Basic @BBL H2D' } },
  { id: 'mk4s', name: 'Prusa MK4S', short: 'MK4S', bed: [250, 210, 220] },
  { id: 'coreone', name: 'Prusa CORE One', short: 'CORE One', bed: [250, 220, 270] },
  { id: 'mini', name: 'Prusa MINI+', short: 'MINI', bed: [180, 180, 180] },
  { id: 'g220', name: 'Any 220 mm printer', short: '220 mm', bed: [220, 220, 220] },
  { id: 'g300', name: 'Any 300 mm printer', short: '300 mm', bed: [300, 300, 300] },
]);

export function projectSettings(printer, { plate = 'Textured PEI Plate' } = {}) {
  const p = printer && printer.presets;
  if (!p) return null;
  return JSON.stringify({
    version: '1.0', name: 'project_settings', from: 'project', printer_technology: 'FFF',
    printer_model: p.model, printer_settings_id: p.printer, print_settings_id: p.process, filament_settings_id: [p.filament],
    filament_colour: ['#00AE42'], inherits_group: ['', '', ''], different_settings_to_system: ['', '', ''], curr_bed_type: plate,
  }, null, 4) + '\n';
}

/* ---------- 3MF ---------- */

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = v => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? '0' : String(r); };

function meshXML(mesh) {
  const { vertices: v, indices: f } = mesh;
  const out = ['<mesh><vertices>'];
  for (let i = 0; i < v.length; i += 3) out.push(`<vertex x="${num(v[i])}" y="${num(v[i + 1])}" z="${num(v[i + 2])}"/>`);
  out.push('</vertices><triangles>');
  for (let i = 0; i < f.length; i += 3) out.push(`<triangle v1="${f[i]}" v2="${f[i + 1]}" v3="${f[i + 2]}"/>`);
  out.push('</triangles></mesh>');
  return out.join('');
}

/**
 * Lay the parts on the plate: side by side, centred, the figure (lying
 * flat) on the left and the pedestal on the right, clear of the purge
 * corner. Parts are { name, mesh, size: [w, d, h], settings? }.
 * Returns [{ ...part, x, y }] and the footprint.
 */
export function layout(parts, printer, { gap = 10, margin = 8 } = {}) {
  const [bedW, bedD] = printer.bed;
  const width = parts.reduce((s, p) => s + p.size[0], 0) + gap * (parts.length - 1);
  const depth = Math.max(...parts.map(p => p.size[1]));
  let x = (bedW - width) / 2, y0 = (bedD - depth) / 2;
  if (printer.exclude && x < printer.exclude[0] + 2 && y0 < printer.exclude[1] + 2) y0 = Math.min(printer.exclude[1] + 2, bedD - margin - depth);
  const placed = parts.map(p => { const item = { ...p, x: x + p.size[0] / 2, y: y0 + depth / 2 }; x += p.size[0] + gap; return item; });
  const warnings = [];
  if (width > bedW - 2 * margin || depth > bedD - 2 * margin) warnings.push(`The figure and pedestal need ${Math.round(width)} × ${Math.round(depth)} mm; the ${printer.short} plate is ${bedW} × ${bedD} mm. Make the figure smaller, or print the two files one at a time.`);
  return { placed, width, depth, warnings };
}

/** The project file: every placed part as an object with its settings. */
export function threeMF(placed, { printer, plate = 'Textured PEI Plate', title = 'Cameo figurine' } = {}) {
  const model = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `<metadata name="Title">${esc(title)}</metadata>`, '<metadata name="Application">Cameo (kmay89.com/cameo)</metadata>',
    `<metadata name="Description">${esc('A relief figurine lying on its back and its pedestal standing, placed to print without supports. Open as a project in Bambu Studio.')}</metadata>`,
    '<resources>'];
  placed.forEach((p, i) => model.push(`<object id="${i + 1}" name="${esc(p.name)}" type="model">${meshXML(p.mesh)}</object>`));
  model.push('</resources><build>');
  placed.forEach((p, i) => model.push(`<item objectid="${i + 1}" transform="1 0 0 0 1 0 0 0 1 ${num(p.x)} ${num(p.y)} 0" printable="1"/>`));
  model.push('</build></model>');
  const config = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>'];
  placed.forEach((p, i) => {
    config.push(`  <object id="${i + 1}">`, `    <metadata key="name" value="${esc(p.name)}"/>`);
    for (const [k, v] of Object.entries(p.settings || {})) config.push(`    <metadata key="${esc(k)}" value="${esc(v)}"/>`);
    config.push('  </object>');
  });
  config.push('  <plate>', '    <metadata key="plater_id" value="1"/>', `    <metadata key="plater_name" value="${esc(title)}"/>`, '    <metadata key="locked" value="false"/>');
  if (printer && printer.presets) config.push(`    <metadata key="bed_type" value="${esc(plate)}"/>`);
  placed.forEach((p, i) => config.push('    <model_instance>', `      <metadata key="object_id" value="${i + 1}"/>`, '      <metadata key="instance_id" value="0"/>', `      <metadata key="identify_id" value="${i + 1}"/>`, '    </model_instance>'));
  config.push('  </plate>', '</config>');
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>' },
    { name: '3D/3dmodel.model', data: model.join('\n') },
    { name: 'Metadata/model_settings.config', data: config.join('\n') + '\n' },
  ];
  const project = projectSettings(printer, { plate });
  if (project) files.push({ name: 'Metadata/project_settings.config', data: project });
  return zipStore(files);
}

/** Per-object settings that suit each part: a relief face wants shells, not ironing; a pedestal top wants ironing. */
export const PART_SETTINGS = Object.freeze({
  figure: { top_shell_layers: '6', top_surface_pattern: 'monotonicline', ironing_type: 'no ironing', wall_loops: '3' },
  pedestal: { ironing_type: 'topmost', ironing_flow: '10%', ironing_speed: '30', top_shell_layers: '5' },
});
