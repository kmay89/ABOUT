/**
 * Swatch — the files. A 3MF that Bambu Studio opens as a plate of coupons
 * with each coupon's settings already on it, a settings sheet in plain
 * text, and a legend as SVG.
 *
 * The 3MF is a ZIP of XML, written here by hand (store only; the files are
 * small). Besides the three parts every 3MF has, it carries Bambu Studio's
 * Metadata/model_settings.config: for each object, <metadata key value/>
 * entries that the slicer reads straight into that object's per-object
 * config — the same file it writes when you right-click a part and add a
 * setting. No project settings are embedded on purpose: the file must not
 * replace your printer, filament or process profile, only add to each
 * coupon. The slicer therefore says it loaded "geometry data only"; the
 * per-object settings are kept all the same (they are reset only on
 * File › Import, so open the file as a project).
 */
import { SETTINGS, format, axisLabel } from './tests.js';

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

/** @param {{name: string, data: string|ArrayBuffer|Uint8Array}[]} files @returns {ArrayBuffer} */
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

/* ---------- 3MF ---------- */

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

/** A safe file name from a title. */
export function slug(s) { return String(s).toLowerCase().replace(/×/g, 'x').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

/**
 * The project file. `items` are the built coupons from plate.js: each with
 * mesh, x, y (plate coordinates, origin at the front-left corner), name and
 * serialized settings. Object ids count from 1 in the order given.
 */
export function threeMF(test, items, { printer, application = 'Swatch (kmay89.com/swatch)' } = {}) {
  const title = `Swatch — ${test.name}`;
  const model = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `<metadata name="Title">${esc(title)}</metadata>`,
    `<metadata name="Application">${esc(application)}</metadata>`,
    `<metadata name="Description">${esc(`${items.length} coupons, each with its own settings in Metadata/model_settings.config. Open as a project in Bambu Studio${printer ? `; laid out for a ${printer.bed[0]} × ${printer.bed[1]} mm plate` : ''}.`)}</metadata>`,
    '<resources>'];
  items.forEach((it, i) => model.push(`<object id="${i + 1}" name="${esc(it.name)}" type="model">${meshXML(it.mesh)}</object>`));
  model.push('</resources><build>');
  items.forEach((it, i) => model.push(`<item objectid="${i + 1}" transform="1 0 0 0 1 0 0 0 1 ${num(it.x)} ${num(it.y)} 0" printable="1"/>`));
  model.push('</build></model>');

  const config = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>'];
  items.forEach((it, i) => {
    config.push(`  <object id="${i + 1}">`, `    <metadata key="name" value="${esc(it.name)}"/>`);
    for (const [key, value] of Object.entries(it.serialized)) config.push(`    <metadata key="${esc(key)}" value="${esc(value)}"/>`);
    config.push('  </object>');
  });
  config.push('  <plate>', '    <metadata key="plater_id" value="1"/>', `    <metadata key="plater_name" value="${esc(test.name)}"/>`, '    <metadata key="locked" value="false"/>');
  items.forEach((it, i) => config.push('    <model_instance>', `      <metadata key="object_id" value="${i + 1}"/>`, '      <metadata key="instance_id" value="0"/>', `      <metadata key="identify_id" value="${i + 1}"/>`, '    </model_instance>'));
  config.push('  </plate>', '</config>');

  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>' },
    { name: '3D/3dmodel.model', data: model.join('\n') },
    { name: 'Metadata/model_settings.config', data: config.join('\n') + '\n' },
  ]);
}

/* ---------- the sheet ---------- */

const pad = (s, n) => String(s).padEnd(n);

/** Plain text: the grid, every coupon's settings, and what to look for. */
export function sheet(test, built, { printer } = {}) {
  const { items, cols, rows } = built;
  const lines = ['SWATCH — surface test sheet', 'kmay89.com/swatch', '', test.name, test.blurb, ''];
  if (printer) lines.push(`Printer     ${printer.name} (${printer.bed[0]} × ${printer.bed[1]} mm plate)`);
  lines.push(`Coupons     ${items.length} (${cols} across × ${rows} deep), ${test.coupon.type} ${items[0].size.map(v => num(v)).join(' × ')} mm`, '');
  lines.push('THE GRID (as it lies on the plate: left to right, front to back)', '');
  lines.push(`Across      ${axisLabel(test.x)}: ${test.x.values.map(v => labelOf(test.x, v)).join(' · ')}`);
  if (test.y) lines.push(`Front→back  ${axisLabel(test.y)}: ${test.y.values.map(v => labelOf(test.y, v)).join(' · ')}`);
  lines.push('');
  const fixedKeys = Object.keys(test.fixed);
  if (fixedKeys.length) {
    lines.push('ON EVERY COUPON', '');
    for (const k of fixedKeys) lines.push(`  ${pad(SETTINGS[k].label, 36)} ${format(k, test.fixed[k])}   (${k})`);
    lines.push('');
  }
  lines.push('EACH COUPON', '');
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      const it = items[r * cols + c];
      lines.push(`  ${pad(it.lines.join(' / '), 12)} ${it.name}`);
      for (const [k, v] of Object.entries(it.settings)) if (!(k in test.fixed) || test.fixed[k] !== v) lines.push(`      ${pad(k, 38)} ${it.serialized[k]}`);
    }
  }
  lines.push('', 'WHAT TO LOOK FOR', '', wrap(test.look), '', 'HOW TO CHOOSE', '', wrap(test.pick), '',
    'Open the 3MF as a project in Bambu Studio (File › Open Project, or drop it on the window and choose to open it as a project). Keep your own printer, filament and process profiles; each coupon carries its differences as per-object settings — click one and look at its object list entry. Slice and print the whole plate at once so every coupon sees the same filament, plate and temperatures.',
    '', 'Generated by Swatch — free, in the browser, nothing uploaded.');
  return lines.join('\n');
}

function labelOf(axis, v) {
  if (axis.composite) return v;
  return format(axis.key, v);
}

function wrap(text, width = 78) {
  const words = String(text).split(/\s+/), out = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) out.push(line);
  return out.join('\n');
}

/* ---------- the legend ---------- */

/**
 * An SVG of the plate with every coupon drawn where it will print and
 * labelled with its two values; the axes named along the edges.
 */
export function legendSVG(test, built, { printer, scale = 2.6 } = {}) {
  const [bedW, bedD] = printer ? printer.bed : [256, 256];
  const padL = 60, padT = 50, padR = 20, padB = 54;
  const W = bedW * scale + padL + padR, H = bedD * scale + padT + padB;
  const sx = x => padL + x * scale, sy = y => padT + (bedD - y) * scale;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif">`,
    `<rect width="${W}" height="${H}" fill="#f4f2eb"/>`,
    `<text x="${padL}" y="24" font-size="15" font-weight="600" fill="#252722">Swatch — ${esc(test.name)}</text>`,
    `<text x="${padL}" y="40" font-size="11" fill="#797b71">${esc(printer ? printer.name : 'plate')} · ${built.items.length} coupons · across: ${esc(axisLabel(test.x))}${test.y ? ` · front to back: ${esc(axisLabel(test.y))}` : ''}</text>`,
    `<rect x="${sx(0)}" y="${sy(bedD)}" width="${bedW * scale}" height="${bedD * scale}" fill="#e9e5d8" stroke="#8a7a5d" stroke-width="1.5"/>`];
  if (printer && printer.exclude) out.push(`<rect x="${sx(0)}" y="${sy(printer.exclude[1])}" width="${printer.exclude[0] * scale}" height="${printer.exclude[1] * scale}" fill="#d9cfb8" stroke="none"/>`);
  for (const it of built.items) {
    const [w, d] = it.size;
    const x = sx(it.x - w / 2), y = sy(it.y + d / 2);
    const round = test.coupon.type === 'cylinder';
    out.push(round
      ? `<circle cx="${sx(it.x)}" cy="${sy(it.y)}" r="${w / 2 * scale}" fill="#fbf9f3" stroke="#8e8871" stroke-width="1"/>`
      : `<rect x="${x}" y="${y}" width="${w * scale}" height="${d * scale}" rx="2" fill="#fbf9f3" stroke="#8e8871" stroke-width="1"/>`);
    const fs = Math.max(8, Math.min(12, w * scale / 6));
    it.lines.forEach((line, i) => out.push(`<text x="${sx(it.x)}" y="${sy(it.y) + (i - (it.lines.length - 1) / 2) * (fs + 2) + fs / 3}" font-size="${fs}" text-anchor="middle" fill="#4a4b42" font-weight="600">${esc(line)}</text>`));
  }
  out.push(`<text x="${sx(bedW / 2)}" y="${H - 30}" font-size="11" text-anchor="middle" fill="#64695f">FRONT · across: ${esc(axisLabel(test.x))} ${test.x.values.map(v => labelOf(test.x, v)).join(' → ')}</text>`);
  if (test.y) out.push(`<text transform="translate(${padL - 14} ${sy(bedD / 2)}) rotate(-90)" font-size="11" text-anchor="middle" fill="#64695f">front → back: ${esc(axisLabel(test.y))} ${test.y.values.map(v => labelOf(test.y, v)).join(' → ')}</text>`);
  out.push('</svg>');
  return out.join('\n');
}
