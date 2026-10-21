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
 * setting.
 *
 * For a Bambu printer it also carries Metadata/project_settings.config,
 * but a sparse one: it names the printer, the process and the filament
 * presets the printer ships with and lists nothing as different from
 * them. Bambu Studio fills every other key from the installed system
 * presets and selects them (PresetCollection::load_external_preset: keys
 * not in different_settings_to_system are copied from the base preset,
 * and a preset that then equals the system one is selected rather than
 * created), so the file opens as a plain project with no warning, and the
 * user's own profiles are one dropdown away. No G-code is carried, no
 * key the user's profile would be overwritten by.
 */
import { SETTINGS, PARAMS, format, axisLabel } from './tests.js';

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

/** The title of a plate: one test's name, or the tests joined. */
export function plateTitle(built) { return built.groups.map(g => g.test.name).join(' + '); }

/**
 * Metadata/project_settings.config for a Bambu printer: the sparse project
 * config described at the top of this file. `plate` is the bed type by
 * Bambu Studio's name.
 */
export function projectSettings(printer, { plate = 'Textured PEI Plate' } = {}) {
  const p = printer.presets;
  if (!p) return null;
  const json = {
    version: '1.0',
    name: 'project_settings',
    from: 'project',
    printer_technology: 'FFF',
    printer_model: p.model,
    printer_settings_id: p.printer,
    print_settings_id: p.process,
    filament_settings_id: [p.filament],
    filament_colour: ['#00AE42'],
    inherits_group: ['', '', ''],
    different_settings_to_system: ['', '', ''],
    curr_bed_type: plate,
  };
  return JSON.stringify(json, null, 4) + '\n';
}

/**
 * The project file. `built` is from plate.js: items with mesh, x, y (plate
 * coordinates, origin at the front-left corner), name and serialized
 * settings, grouped by test. Object ids count from 1 in the order given.
 */
export function threeMF(built, { printer, plate, application = 'Swatch (kmay89.com/swatch)' } = {}) {
  const items = built.items, many = built.groups.length > 1;
  const title = `Swatch — ${plateTitle(built)}`;
  const model = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `<metadata name="Title">${esc(title)}</metadata>`,
    `<metadata name="Application">${esc(application)}</metadata>`,
    `<metadata name="Description">${esc(`${items.length} coupons, each with its own settings in Metadata/model_settings.config. Open as a project in Bambu Studio${printer ? `; laid out for a ${printer.bed[0]} × ${printer.bed[1]} mm plate` : ''}.`)}</metadata>`,
    '<resources>'];
  const nameOf = it => (many ? `${it.test.name} — ${it.name}` : it.name);
  items.forEach((it, i) => model.push(`<object id="${i + 1}" name="${esc(nameOf(it))}" type="model">${meshXML(it.mesh)}</object>`));
  model.push('</resources><build>');
  items.forEach((it, i) => model.push(`<item objectid="${i + 1}" transform="1 0 0 0 1 0 0 0 1 ${num(it.x)} ${num(it.y)} 0" printable="1"/>`));
  model.push('</build></model>');

  const config = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>'];
  items.forEach((it, i) => {
    config.push(`  <object id="${i + 1}">`, `    <metadata key="name" value="${esc(nameOf(it))}"/>`);
    for (const [key, value] of Object.entries(it.serialized)) config.push(`    <metadata key="${esc(key)}" value="${esc(value)}"/>`);
    config.push('  </object>');
  });
  config.push('  <plate>', '    <metadata key="plater_id" value="1"/>', `    <metadata key="plater_name" value="${esc(plateTitle(built))}"/>`, '    <metadata key="locked" value="false"/>');
  if (printer && printer.presets && plate) config.push(`    <metadata key="bed_type" value="${esc(plate)}"/>`);
  items.forEach((it, i) => config.push('    <model_instance>', `      <metadata key="object_id" value="${i + 1}"/>`, '      <metadata key="instance_id" value="0"/>', `      <metadata key="identify_id" value="${i + 1}"/>`, '    </model_instance>'));
  config.push('  </plate>', '</config>');

  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>' },
    { name: '3D/3dmodel.model', data: model.join('\n') },
    { name: 'Metadata/model_settings.config', data: config.join('\n') + '\n' },
  ];
  const project = printer ? projectSettings(printer, { plate }) : null;
  if (project) files.push({ name: 'Metadata/project_settings.config', data: project });
  return zipStore(files);
}

/* ---------- the sheet ---------- */

const pad = (s, n) => String(s).padEnd(n);

/** Plain text: every test on the plate, its grid, every coupon's settings, and what to look for. */
export function sheet(built, { printer, plate } = {}) {
  const lines = ['SWATCH — test sheet', 'kmay89.com/swatch', ''];
  if (printer) lines.push(`Printer     ${printer.name} (${printer.bed[0]} × ${printer.bed[1]} mm plate)${printer.presets && plate ? `, ${plate}` : ''}`);
  lines.push(`Plate       ${plateTitle(built)}: ${built.items.length} coupons, ${Math.round(built.footprint[0])} × ${Math.round(built.footprint[1])} mm`, '');
  if (built.groups.length > 1) {
    lines.push('TESTS ON THIS PLATE (front to back, left to right)', '');
    built.groups.forEach((g, i) => lines.push(`  ${i + 1}. ${g.test.name} — ${g.items.length} coupons`));
    lines.push('');
  }
  for (const g of built.groups) {
    const test = g.test;
    lines.push('='.repeat(78), test.name.toUpperCase(), '', wrap(test.blurb), '');
    lines.push(`Coupons     ${g.items.length} (${g.cols} across × ${g.rows} deep), ${test.coupon.type} ${g.items[0].size.map(v => num(v)).join(' × ')} mm`);
    lines.push(`Across      ${axisLabel(test.x)}: ${test.x.values.map(v => labelOf(test.x, v)).join(' · ')}`);
    if (test.y) lines.push(`Front→back  ${axisLabel(test.y)}: ${test.y.values.map(v => labelOf(test.y, v)).join(' · ')}`);
    lines.push('');
    const fixedKeys = Object.keys(test.fixed);
    if (fixedKeys.length) {
      lines.push('On every coupon:');
      for (const k of fixedKeys) lines.push(`  ${pad(SETTINGS[k].label, 36)} ${format(k, test.fixed[k])}   (${k})`);
      lines.push('');
    }
    lines.push('Each coupon:');
    for (let r = g.rows - 1; r >= 0; r--) {
      for (let c = 0; c < g.cols; c++) {
        const it = g.items[r * g.cols + c];
        lines.push(`  ${pad(it.lines.join(' / '), 12)} ${it.name}`);
        for (const [k, v] of Object.entries(it.settings)) if (!(k in test.fixed) || test.fixed[k] !== v) lines.push(`      ${pad(k, 38)} ${it.serialized[k]}`);
        for (const [k, v] of Object.entries(it.geom || {})) lines.push(`      ${pad(k + ' (geometry)', 38)} ${format(k, v)}`);
      }
    }
    lines.push('', 'What to look for:', wrap(test.look), '', 'How to choose:', wrap(test.pick), '');
  }
  lines.push('='.repeat(78), '',
    wrap(printer && printer.presets
      ? `Open the 3MF as a project in Bambu Studio (File › Open Project). It names the printer's own ${printer.presets.process} process, ${printer.presets.filament} filament and ${printer.presets.printer} presets so it opens without a warning; switch the filament and process to your own in the dropdowns, the coupons keep their differences as per-object settings. Click a coupon and its settings are listed under it in the object list. Slice and print the whole plate at once.`
      : 'Open the 3MF as a project in Bambu Studio (File › Open Project, not Import). The file carries no printer or filament profile, so the slicer says it loaded geometry only; each coupon keeps its differences as per-object settings. Click a coupon and its settings are listed under it in the object list. Slice and print the whole plate at once.'),
    '', 'Generated by Swatch — free, in the browser, nothing uploaded.');
  return lines.join('\n');
}

function labelOf(axis, v) {
  if (axis.composite) return v;
  return format(axis.param || axis.key, v);
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
 * labelled with its values; each test's block titled, and its axes named
 * below.
 */
export function legendSVG(built, { printer, scale = 2.6 } = {}) {
  const [bedW, bedD] = printer ? printer.bed : [256, 256];
  const groups = built.groups;
  const padL = 24, padT = 50, padR = 24, padB = 30 + groups.length * 30;
  const W = bedW * scale + padL + padR, H = bedD * scale + padT + padB;
  const sx = x => padL + x * scale, sy = y => padT + (bedD - y) * scale;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif">`,
    `<rect width="${W}" height="${H}" fill="#f4f2eb"/>`,
    `<text x="${padL}" y="24" font-size="15" font-weight="600" fill="#252722">Swatch — ${esc(plateTitle(built))}</text>`,
    `<text x="${padL}" y="40" font-size="11" fill="#797b71">${esc(printer ? printer.name : 'plate')} · ${built.items.length} coupons · the plate seen from above, front edge at the bottom</text>`,
    `<rect x="${sx(0)}" y="${sy(bedD)}" width="${bedW * scale}" height="${bedD * scale}" fill="#e9e5d8" stroke="#8a7a5d" stroke-width="1.5"/>`];
  if (printer && printer.exclude) out.push(`<rect x="${sx(0)}" y="${sy(printer.exclude[1])}" width="${printer.exclude[0] * scale}" height="${printer.exclude[1] * scale}" fill="#d9cfb8" stroke="none"/>`);
  groups.forEach((g, gi) => {
    const [ox, oy] = g.origin;
    out.push(`<rect x="${sx(ox) - 4}" y="${sy(oy + g.depth) - 4}" width="${g.width * scale + 8}" height="${g.depth * scale + 8}" rx="4" fill="none" stroke="#b89249" stroke-width="1" stroke-dasharray="4 3"/>`);
    out.push(`<text x="${sx(ox)}" y="${sy(oy + g.depth) - 8}" font-size="10" font-weight="700" fill="#956011">${groups.length > 1 ? `${gi + 1} · ` : ''}${esc(g.test.name)}</text>`);
  });
  for (const it of built.items) {
    const [w, d] = it.size;
    const x = sx(it.x - w / 2), y = sy(it.y + d / 2);
    const round = it.type === 'cylinder';
    out.push(round
      ? `<circle cx="${sx(it.x)}" cy="${sy(it.y)}" r="${w / 2 * scale}" fill="#fbf9f3" stroke="#8e8871" stroke-width="1"/>`
      : `<rect x="${x}" y="${y}" width="${w * scale}" height="${d * scale}" rx="2" fill="#fbf9f3" stroke="#8e8871" stroke-width="1"/>`);
    if (it.type === 'gauge' || it.type === 'socket') {
      const m = it.measure, cx = it.type === 'gauge' ? it.x - (w / 2 - m.hole / 2 - 3) : it.x - w / 2 + 9, r = (it.type === 'gauge' ? m.hole : m.peg + m.clearance) / 2;
      out.push(`<circle cx="${sx(cx)}" cy="${sy(it.y)}" r="${r * scale}" fill="#e9e5d8" stroke="#8e8871" stroke-width=".8"/>`);
    }
    const fs = Math.max(7, Math.min(12, w * scale / 7));
    const lx = it.type === 'gauge' ? sx(it.x + w / 4 - 1) : it.type === 'socket' ? sx(it.x + w / 2 - 4.5) : sx(it.x);
    it.lines.forEach((line, i) => out.push(`<text x="${lx}" y="${sy(it.y) + (i - (it.lines.length - 1) / 2) * (fs + 2) + fs / 3}" font-size="${fs}" text-anchor="middle" fill="#4a4b42" font-weight="600">${esc(line)}</text>`));
  }
  groups.forEach((g, gi) => {
    const y = H - padB + 16 + gi * 30, t = g.test;
    out.push(`<text x="${padL}" y="${y}" font-size="10.5" fill="#64695f"><tspan font-weight="700" fill="#956011">${groups.length > 1 ? `${gi + 1}. ` : ''}${esc(t.name)}</tspan>  across: ${esc(axisLabel(t.x))} ${t.x.values.map(v => labelOf(t.x, v)).join(' → ')}</text>`);
    if (t.y) out.push(`<text x="${padL}" y="${y + 13}" font-size="10.5" fill="#64695f">front → back: ${esc(axisLabel(t.y))} ${t.y.values.map(v => labelOf(t.y, v)).join(' → ')}</text>`);
  });
  out.push('</svg>');
  return out.join('\n');
}
