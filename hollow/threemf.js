/**
 * Hollow — a 3MF writer. One file, every mold part in it, named and laid
 * out on the plate, so it opens in Bambu Studio (or any slicer) as a ready
 * project instead of a handful of STLs to arrange.
 *
 * 3MF is a ZIP of XML. The ZIP is written here by hand (local headers, a
 * central directory, CRC-32), compressed with the browser's own
 * CompressionStream when it has one and stored uncompressed when it does
 * not. Only the core 3MF schema is used: unit, objects with meshes, build
 * items with a transform. No DOM, no third-party code; runs in a worker or
 * Node 18+.
 */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch { return null; }
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/** Build a ZIP from { name: Uint8Array|string } entries. */
export async function zip(entries, { compress = true } = {}) {
  const encoder = new TextEncoder();
  const files = [];
  for (const [name, content] of Object.entries(entries)) {
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    const packed = compress ? await deflateRaw(data) : null;
    const method = packed && packed.length < data.length ? 8 : 0;
    files.push({ name: encoder.encode(name), data, body: method === 8 ? packed : data, method, crc: crc32(data) });
  }
  const { time, day } = dosDateTime();
  let size = 0;
  for (const f of files) size += 30 + f.name.length + f.body.length + 46 + f.name.length;
  size += 22;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let o = 0;
  const offsets = [];
  for (const f of files) {
    offsets.push(o);
    view.setUint32(o, 0x04034b50, true); view.setUint16(o + 4, 20, true); view.setUint16(o + 6, 0x0800, true);
    view.setUint16(o + 8, f.method, true); view.setUint16(o + 10, time, true); view.setUint16(o + 12, day, true);
    view.setUint32(o + 14, f.crc, true); view.setUint32(o + 18, f.body.length, true); view.setUint32(o + 22, f.data.length, true);
    view.setUint16(o + 26, f.name.length, true); view.setUint16(o + 28, 0, true);
    out.set(f.name, o + 30); o += 30 + f.name.length;
    out.set(f.body, o); o += f.body.length;
  }
  const cdStart = o;
  files.forEach((f, i) => {
    view.setUint32(o, 0x02014b50, true); view.setUint16(o + 4, 20, true); view.setUint16(o + 6, 20, true); view.setUint16(o + 8, 0x0800, true);
    view.setUint16(o + 10, f.method, true); view.setUint16(o + 12, time, true); view.setUint16(o + 14, day, true);
    view.setUint32(o + 16, f.crc, true); view.setUint32(o + 20, f.body.length, true); view.setUint32(o + 24, f.data.length, true);
    view.setUint16(o + 28, f.name.length, true); view.setUint16(o + 30, 0, true); view.setUint16(o + 32, 0, true);
    view.setUint16(o + 34, 0, true); view.setUint16(o + 36, 0, true); view.setUint32(o + 38, 0, true); view.setUint32(o + 42, offsets[i], true);
    out.set(f.name, o + 46); o += 46 + f.name.length;
  });
  view.setUint32(o, 0x06054b50, true); view.setUint16(o + 4, 0, true); view.setUint16(o + 6, 0, true);
  view.setUint16(o + 8, files.length, true); view.setUint16(o + 10, files.length, true);
  view.setUint32(o + 12, o - cdStart, true); view.setUint32(o + 16, cdStart, true); view.setUint16(o + 20, 0, true);
  return out;
}

const escapeXML = (s) => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const num = (v) => { const s = (Math.round(v * 10000) / 10000).toString(); return s === '-0' ? '0' : s; };

/** The model XML for a list of parts: { name, mesh: {positions, indices}, translate?: [x,y,z] }. */
export function modelXML(parts, { title = 'Hollow mold', application = 'Hollow — kmay89.com/hollow' } = {}) {
  const chunks = [`<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n`,
    `  <metadata name="Title">${escapeXML(title)}</metadata>\n  <metadata name="Application">${escapeXML(application)}</metadata>\n  <resources>\n`];
  parts.forEach((part, index) => {
    const { positions: p, indices: ix } = part.mesh;
    chunks.push(`    <object id="${index + 1}" name="${escapeXML(part.name)}" type="model">\n      <mesh>\n        <vertices>\n`);
    const verts = new Array(p.length / 3);
    for (let i = 0; i < p.length; i += 3) verts[i / 3] = `          <vertex x="${num(p[i])}" y="${num(p[i + 1])}" z="${num(p[i + 2])}"/>`;
    chunks.push(verts.join('\n'), '\n        </vertices>\n        <triangles>\n');
    const tris = new Array(ix.length / 3);
    for (let i = 0; i < ix.length; i += 3) tris[i / 3] = `          <triangle v1="${ix[i]}" v2="${ix[i + 1]}" v3="${ix[i + 2]}"/>`;
    chunks.push(tris.join('\n'), '\n        </triangles>\n      </mesh>\n    </object>\n');
  });
  chunks.push('  </resources>\n  <build>\n');
  parts.forEach((part, index) => {
    const t = part.translate || [0, 0, 0];
    chunks.push(`    <item objectid="${index + 1}" transform="1 0 0 0 1 0 0 0 1 ${num(t[0])} ${num(t[1])} ${num(t[2])}"/>\n`);
  });
  chunks.push('  </build>\n</model>\n');
  return chunks.join('');
}

/** A complete .3mf as bytes. */
export async function write3MF(parts, options = {}) {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>\n`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n`;
  return zip({ '[Content_Types].xml': contentTypes, '_rels/.rels': rels, '3D/3dmodel.model': modelXML(parts, options) }, { compress: options.compress !== false });
}
