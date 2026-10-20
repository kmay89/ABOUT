/**
 * Files out: binary STL per part, a ZIP of them, and a 3MF per plate with
 * every part already placed, so Bambu Studio (or any slicer that reads
 * 3MF) opens it ready to slice. The ZIP writer stores without compressing —
 * STL and 3MF are small and a slicer reads either in a blink — and 3MF is
 * itself a ZIP with three XML files inside. No DOM; runs anywhere.
 */
import { binarySTL, JOINT, CLIP_FITS } from './geometry.js';
import { fmt, PRINTERS, FILAMENTS, SPACES, designSummary, binHeights } from './layout.js';

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
  const entries = [];
  let offset = 0;
  const parts = [];
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

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = v => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

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
 * One plate as a 3MF: an object per unique part, a build item per copy,
 * each translated to its packed place (and turned a quarter where the
 * packer turned it). Coordinates are plate coordinates, origin at the
 * plate's front-left corner, as slicers expect.
 */
export function threeMF(plate, { title = 'Cubby drawer organizer', bed } = {}) {
  const objects = new Map();
  let id = 1;
  const items = [];
  for (const it of plate.items) {
    if (!objects.has(it.part.key)) objects.set(it.part.key, { id: id++, part: it.part });
    const obj = objects.get(it.part.key);
    // A quarter turn about Z maps (x, y) to (-y, x); shift so the part still
    // starts at its packed corner.
    const t = it.rot === 90
      ? `0 1 0 -1 0 0 0 0 1 ${num(it.x + it.part.mesh.size[1])} ${num(it.y)} 0`
      : `1 0 0 0 1 0 0 0 1 ${num(it.x)} ${num(it.y)} 0`;
    items.push(`<item objectid="${obj.id}" transform="${t}" partnumber="${esc(it.part.title)}"/>`);
  }
  const model = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `<metadata name="Title">${esc(title)}</metadata>`,
    '<metadata name="Application">Cubby (kmay89.com/cubby)</metadata>',
    bed ? `<metadata name="Description">Plate ${plate.index}, laid out for a ${num(bed[0])} x ${num(bed[1])} mm plate. Print as placed; no supports.</metadata>` : '',
    '<resources>'];
  for (const { id, part } of objects.values()) {
    model.push(`<object id="${id}" name="${esc(part.title)}" type="model">${meshXML(part.mesh)}</object>`);
  }
  model.push('</resources><build>', ...items, '</build></model>');
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>' },
    { name: '3D/3dmodel.model', data: model.join('\n') },
  ]);
}

/* ---------- STL ---------- */

export function partSTL(part) {
  return binarySTL(part.mesh, { header: `Cubby ${part.title} | mm | Z up | print as oriented, no supports` });
}

/** A safe file name for a part: "bin-2x1-3-compartments-x4.stl". */
export function partFileName(part, ext = 'stl') {
  const slug = part.title.toLowerCase().replace(/×/g, 'x').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug}-x${part.qty}.${ext}`;
}

/* ---------- the print sheet ---------- */

function minutes(m) {
  if (m < 60) return `${Math.round(m)} min`;
  return `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`;
}

/** Plain text: what to print, how many, what to set, how to put it together. */
export function printSheet(design, list, packing) {
  const s = design.settings, summary = designSummary(design);
  const printer = PRINTERS.find(p => p.id === s.printer) || PRINTERS[0];
  const lines = [
    'CUBBY — drawer organizer print sheet', 'kmay89.com/cubby', '',
    `Drawer      ${summary.drawer} (${summary.space})`,
    `Grid        ${summary.grid}`,
    `Heights     ${summary.height}`,
    `Printer     ${printer.name}, ${FILAMENTS[s.filament].name}`,
    '', 'PARTS', '',
  ];
  for (const p of list.parts) {
    lines.push(`${String(p.qty).padStart(3)} ×  ${p.title.padEnd(34)} ${p.size.padEnd(28)} ${p.error ? 'could not be built: ' + p.error : `${fmt(p.grams)} g each, about ${minutes(p.minutes)} each`}`);
  }
  lines.push('', `${list.totals.parts} parts, about ${Math.round(list.totals.grams)} g of ${FILAMENTS[s.filament].name}, roughly ${minutes(list.totals.minutes)} of printing (a rough estimate; your slicer knows better).`);
  if (packing) {
    lines.push('', 'PLATES', '');
    for (const plate of packing.plates) {
      const counts = new Map();
      for (const it of plate.items) counts.set(it.part.title, (counts.get(it.part.title) || 0) + 1);
      lines.push(`Plate ${plate.index}: ${[...counts].map(([t, n]) => `${n} × ${t}`).join(', ')}`);
    }
    for (const p of packing.tooBig) lines.push(`Too big for this plate: ${p.title} (${p.size}). Pick a bigger printer, or split it across more cells.`);
  }
  lines.push('', 'SLICER SETTINGS (Bambu Studio / OrcaSlicer / PrusaSlicer)', '',
    `  Layer height      0.2 mm (0.16 for a finer finish; nothing here needs it)`,
    `  Walls             4 loops or more — the ${fmt(s.wall)} mm wall is sized to print solid`,
    `  Top / bottom      5 / 4 layers — the ${fmt(s.floor)} mm floor comes out solid either way`,
    `  Infill            anything; there is almost none to fill`,
    `  Supports          off. Every part prints as placed with no overhang past 30°`,
    `  Brim              off on a textured plate; a 3 mm brim on a smooth one for the tallest bins`,
    `  Elephant foot     0.15 mm compensation (the default) keeps the first layer flush`,
    `  Seam              rear, or aligned, so the outside walls stay clean`,
    '', 'HOW IT GOES TOGETHER', '',
    '  1. Bins drop into the drawer in the order of the plan; they fill it edge to edge',
    `     with ${fmt(s.clearance)} mm to spare at each side and ${fmt(s.gap)} mm between neighbours.`);
  if (s.clips) {
    lines.push(`  2. Where two bins touch, their channels face each other. Slide a clip down into`,
      `     the pair from the top; it stops on the floor. Clips are ${s.clipFit} fit (${CLIP_FITS[s.clipFit]} mm a side).`,
      '     If a clip is tight, a drop of water helps; if loose, choose "snug" and reprint only the clips.',
      '  3. Clips are optional: a drawer filled edge to edge holds itself. Use them for a',
      '     half-filled drawer, or to carry a block of bins out as one.');
  } else {
    lines.push('  2. This design has no clips: the bins hold each other by filling the drawer.');
  }
  lines.push('', 'THE NUMBERS', '',
    `  Wall ${fmt(s.wall)} mm · floor ${fmt(s.floor)} mm · corners R${fmt(s.radius)} · dividers ${fmt(s.divider)} mm`,
    `  Dovetail channel ${fmt(JOINT.depth)} mm deep, ${fmt(JOINT.neck)} mm at the mouth, ${fmt(JOINT.base)} mm at the back, ${fmt(JOINT.backing)} mm of wall behind it`,
    `  Bins stop ${fmt(s.rimGap)} mm below the drawer's top edge`,
    '', 'Generated by Cubby — free, in the browser, nothing uploaded. Enjoy the tidy drawer.');
  return lines.join('\n');
}

/** Everything as one ZIP: a 3MF per plate, an STL per unique part, the sheet, the design. */
export function bundle(design, list, packing) {
  const files = [];
  for (const plate of packing.plates) {
    const name = packing.plates.length === 1 ? 'cubby-plate.3mf' : `cubby-plate-${plate.index}-of-${packing.plates.length}.3mf`;
    files.push({ name, data: threeMF(plate, { bed: packing.bed, title: `Cubby plate ${plate.index}` }) });
  }
  for (const part of list.parts) if (part.mesh) files.push({ name: `stl/${partFileName(part)}`, data: partSTL(part) });
  files.push({ name: 'print-sheet.txt', data: printSheet(design, list, packing) });
  files.push({ name: 'cubby-design.json', data: JSON.stringify(design, null, 2) });
  return zipStore(files);
}

export { binHeights, SPACES };
