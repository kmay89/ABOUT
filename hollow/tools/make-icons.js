/* make-icons.js — dev-only. Draws Hollow's app icons from formulas and writes
   them as PNGs by hand (node's zlib compresses; the chunk framing and the CRC
   are here), the same way the games' icons are made, so the repo carries no
   binary source asset nobody can regenerate.

   The icon: a dark rounded tile, a terracotta arch (the mold block) and a pale
   smaller arch inside it (the hollow). Edges are sampled 4×4 per pixel.

   Run: node hollow/tools/make-icons.js                                      */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- the drawing, in a 64-unit square ---------- */
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const TILE = hex('#2b2f31'), CLAY = hex('#d9835a'), PALE = hex('#eee6dc');

/** Distance to a stroked arch: a semicircle of radius r centred (cx, cy) above cy, legs down to y0. */
function archDistance(x, y, cx, cy, r, y0) {
  const dx = x - cx, dy = y - cy;
  if (dy <= 0) return Math.abs(Math.hypot(dx, dy) - r);
  if (y <= y0) return Math.min(Math.abs(dx - r), Math.abs(dx + r));
  return Math.hypot(Math.abs(dx) - r, y - y0);
}
function baseDistance(x, y, x0, x1, yb) {
  const dx = Math.max(x0 - x, 0, x - x1);
  return Math.hypot(dx, y - yb);
}

function sample(u, v, maskable) {
  const s = maskable ? 48 / 64 : 1; // maskable icons keep the art inside the safe zone
  const x = (u - 32) / s + 32, y = (v - 32) / s + 32;
  const rx = Math.abs(u - 32) - 16, ry = Math.abs(v - 32) - 16;
  const tileD = Math.hypot(Math.max(rx, 0), Math.max(ry, 0)) + Math.min(Math.max(rx, ry), 0) - 16;
  if (!maskable && tileD > 0) return [0, 0, 0, 0];
  let rgb = TILE;
  const outer = Math.min(archDistance(x, y, 32, 28, 16, 46), baseDistance(x, y, 16, 48, 46));
  const inner = archDistance(x, y, 32, 32, 6, 46);
  if (outer <= 2.25) rgb = CLAY;
  if (inner <= 1.75 && y <= 46) rgb = PALE;
  return [rgb[0], rgb[1], rgb[2], 255];
}

function render(n, maskable) {
  const out = Buffer.alloc(n * n * 4);
  const ss = 4;
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const u = (px + (sx + 0.5) / ss) / n * 64, v = (py + (sy + 0.5) / ss) / n * 64;
      const c = sample(u, v, maskable);
      r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
    }
    const o = (py * n + px) * 4;
    if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
    out[o + 3] = Math.round(a / (ss * ss));
  }
  return out;
}

const dir = path.join(here, '..', 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const [file, n, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]]) {
  fs.writeFileSync(path.join(dir, file), png(n, n, render(n, maskable)));
  console.log('wrote', path.relative(process.cwd(), path.join(dir, file)));
}
