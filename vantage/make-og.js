/* make-og.js — dev-only. Draws vantage/og.png, the 1200 × 630 card that a
   link to /vantage/ unfurls into, from scratch.

   No canvas and no image library, the same as tools/make-game-icons.js:
   every shape is a coverage function sampled 4 × 4 per pixel inside its own
   bounding box, composited in order, and written into a PNG by hand (node's
   zlib does the compression; the chunk framing and the CRC are here). So the
   card has no binary source anybody would need to keep, and it can be
   redrawn in a second.

   What it shows is the product rather than its name, because the title
   travels with the link anyway: one aerial view of a made-up lakeside park,
   the first flight on the left of a curtain and the last on the right, a
   little drone in the room's teal on the left, and the calendar rail along
   the bottom with the last flight lit.

   Run: node vantage/make-og.js                                             */
"use strict";
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const W = 1200, H = 630;

/* ---------- a minimal PNG writer ---------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgb) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;                       // 8-bit RGB, no alpha: a card is opaque
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------- a tiny painter, in pixels ---------- */
function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const px = new Float32Array(W * H * 3);
const SS = 4;                                      // samples per pixel, per axis
/* paint(colour, cover, bbox, alpha, clip): cover/clip are (x, y) → 0|1 in pixels */
function paint(colour, cover, bb, alpha = 1, clip = null) {
  const [r, g, b] = hex(colour);
  const x0 = Math.max(0, Math.floor(bb[0])), y0 = Math.max(0, Math.floor(bb[1]));
  const x1 = Math.min(W, Math.ceil(bb[2])), y1 = Math.min(H, Math.ceil(bb[3]));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    let c = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const X = x + (sx + 0.5) / SS, Y = y + (sy + 0.5) / SS;
      if (cover(X, Y) && (!clip || clip(X, Y))) c++;
    }
    c = (c / (SS * SS)) * alpha;
    if (c <= 0) continue;
    const i = (y * W + x) * 3;
    px[i] = px[i] * (1 - c) + r * c;
    px[i + 1] = px[i + 1] * (1 - c) + g * c;
    px[i + 2] = px[i + 2] * (1 - c) + b * c;
  }
}
/* a soft glow: no edges, so no supersampling */
function glow(colour, cx, cy, rad, peak, clip = null) {
  const [r, g, b] = hex(colour);
  for (let y = Math.max(0, cy - rad | 0); y < Math.min(H, cy + rad); y++)
    for (let x = Math.max(0, cx - rad | 0); x < Math.min(W, cx + rad); x++) {
      if (clip && !clip(x + .5, y + .5)) continue;
      const d = Math.hypot(x - cx, y - cy) / rad;
      if (d >= 1) continue;
      const c = peak * Math.pow(1 - d, 2);
      const i = (y * W + x) * 3;
      px[i] = px[i] * (1 - c) + r * c; px[i + 1] = px[i + 1] * (1 - c) + g * c; px[i + 2] = px[i + 2] * (1 - c) + b * c;
    }
}
const disc = (cx, cy, r) => [(x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, [cx - r, cy - r, cx + r, cy + r]];
const ring = (cx, cy, r, w) => [(x, y) => { const d = Math.hypot(x - cx, y - cy); return d <= r && d >= r - w; },
  [cx - r, cy - r, cx + r, cy + r]];
const rect = (x0, y0, w, h) => [(x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h, [x0, y0, x0 + w, y0 + h]];
function rrect(x0, y0, w, h, r) {
  return [(x, y) => {
    if (x < x0 || x >= x0 + w || y < y0 || y >= y0 + h) return false;
    const cx = Math.min(Math.max(x, x0 + r), x0 + w - r), cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  }, [x0, y0, x0 + w, y0 + h]];
}
function poly(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [(x, y) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]];
}
/* a thick line with round ends: a capsule */
function seg(ax, ay, bx, by, w) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, r = w / 2;
  return [(x, y) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= r * r;
  }, [Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r]];
}
function polyline(pts, w, colour, alpha, clip) {
  for (let i = 1; i < pts.length; i++) {
    const [f, bb] = seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w);
    paint(colour, f, bb, alpha, clip);
  }
}
const P = (shape, colour, alpha = 1, clip = null) => paint(colour, shape[0], shape[1], alpha, clip);
/* a seeded random, so the trees land in the same places every run */
let seed = 20261009;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

/* ---------- the room ---------- */
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = y / H, i = (y * W + x) * 3;
  px[i] = 14 + 10 * t; px[i + 1] = 10 + 7 * t; px[i + 2] = 7 + 4 * t;
}
glow("#ffc97a", 150, -40, 720, .16);              // the lamp, somewhere up and to the left
glow("#4fd6c4", 800, 330, 560, .07);

/* ---------- the panel: one aerial view, two flights ---------- */
const PX = 430, PY = 64, PW = 720, PH = 470, CUT = 760;
P(rrect(PX - 3, PY - 3, PW + 6, PH + 6, 27), "#3a2c1c");
const inPanel = rrect(PX, PY, PW, PH, 24)[0];
const L = (x, y) => inPanel(x, y) && x < CUT;
const R = (x, y) => inPanel(x, y) && x >= CUT;
const ALL = (x, y) => inPanel(x, y);

/* the lake along the top, and the far shore */
P(rect(PX, PY, PW, 120), "#1f4f60", 1, ALL);
P(rect(PX, PY, PW, 22), "#2c3b2a", 1, ALL);
for (let k = 0; k < 9; k++) P(rect(PX + 40 + k * 78, PY + 22, 4, 26), "#5d6b70", .55, ALL);   // the far shore's docks
glow("#9fd8e8", 760, PY + 70, 360, .10, ALL);

/* the ground: scrub and dirt before, mown grass after */
const shore = (x) => PY + 128 + 7 * Math.sin((x - PX) / 46) + 4 * Math.sin((x - PX) / 17);
const ground = [(x, y) => y >= shore(x), [PX, PY + 110, PX + PW, PY + PH]];
P(ground, "#6f7a45", 1, L);
P(ground, "#4f8a3c", 1, R);
seed = 7;
for (let k = 0; k < 70; k++) {                    // bare patches, before
  const x = PX + rnd() * (CUT - PX), y = PY + 150 + rnd() * (PH - 160), r = 6 + rnd() * 22;
  P(disc(x, y, r), rnd() < .5 ? "#8a7a4e" : "#5f6a3a", .55, L);
}
for (let k = 0; k < 26; k++) {                    // mowing stripes, after
  const x = CUT + k * 18;
  P(rect(x, PY + 120, 9, PH), "#5a9643", .45, (X, Y) => R(X, Y) && Y >= shore(X));
}
/* the beach, after: a wedge of sand down to the water */
P(poly([[CUT, shore(CUT) - 2], [PX + PW, shore(PX + PW) - 2], [PX + PW, PY + 205], [CUT + 30, PY + 178]]), "#d9c7a3", 1, R);
P(poly([[CUT - 220, shore(CUT - 220) - 2], [CUT, shore(CUT) - 2], [CUT, PY + 178], [CUT - 190, PY + 196]]), "#a69a72", .7, L);
/* the boardwalk out over the water, after; a broken dock, before */
P(rect(CUT + 160, PY + 72, 16, 66), "#b8864e", 1, R);
P(rect(CUT + 110, PY + 72, 116, 12), "#b8864e", 1, R);
P(rect(CUT - 130, PY + 86, 10, 44), "#6d5a44", 1, L);
P(rect(CUT - 152, PY + 86, 34, 8), "#6d5a44", .8, L);

/* the path loop and the plaza: cracked and grey before, pale and new after */
const LOOP = [];
for (let k = 0; k <= 8; k++) {
  const a = -Math.PI / 2 + k * Math.PI / 4 + Math.PI / 8;
  LOOP.push([CUT + 10 + 170 * Math.cos(a), PY + 318 + 112 * Math.sin(a)]);
}
polyline(LOOP, 15, "#8f8c80", 1, L);
polyline(LOOP, 16, "#e3d6b6", 1, R);
polyline([[CUT + 10, PY + 430], [CUT + 10, PY + PH]], 18, "#8f8c80", 1, L);
polyline([[CUT + 10, PY + 430], [CUT + 10, PY + PH]], 18, "#e3d6b6", 1, R);
polyline([[CUT + 10, PY + 430], [PX + 40, PY + 330]], 13, "#8f8c80", .9, L);
polyline([[CUT + 10, PY + 430], [PX + PW - 30, PY + 300]], 13, "#e3d6b6", 1, R);
P(disc(CUT + 10, PY + 430, 46), "#8f8c80", 1, L);
P(disc(CUT + 10, PY + 430, 46), "#e3d6b6", 1, R);
P(ring(CUT + 10, PY + 430, 34, 6), "#c99a62", 1, R);
P(disc(CUT + 10, PY + 430, 12), "#4fb3a8", 1, R);
for (let k = 0; k < 14; k++) {                    // cracks in the old plaza
  const a = rnd() * Math.PI * 2, r0 = rnd() * 30;
  polyline([[CUT + 10 + r0 * Math.cos(a), PY + 430 + r0 * Math.sin(a)],
    [CUT + 10 + (r0 + 16) * Math.cos(a + .3), PY + 430 + (r0 + 16) * Math.sin(a + .3)]], 1.4, "#5f5d55", .8, L);
}
/* a parking lot, before; a meadow, after */
P(rect(PX, PY + PH - 54, CUT - PX, 54), "#6e6c66", 1, L);
for (let k = 0; k < 16; k++) P(rect(PX + 14 + k * 20, PY + PH - 50, 2, 22), "#d8d4c6", .8, L);
seed = 99;
for (let k = 0; k < 90; k++) {                    // wildflowers in the meadow, after
  const x = CUT + rnd() * (PX + PW - CUT), y = PY + PH - 50 + rnd() * 50;
  P(disc(x, y, 1.8), ["#f2d24a", "#e88ab0", "#ffffff"][k % 3], .9, R);
}

/* trees: scrubby and few before, planted in rows after; each with a shadow */
function tree(x, y, r, side, dark, light) {
  P(disc(x + r * .45, y + r * .55, r), "#000000", .25, side);
  P(disc(x, y, r), dark, 1, side);
  P(disc(x - r * .3, y - r * .3, r * .55), light, .8, side);
}
seed = 3;
for (let k = 0; k < 18; k++) tree(PX + 20 + rnd() * (CUT - PX - 30), PY + 150 + rnd() * 250, 5 + rnd() * 6, L, "#3d5a2a", "#6b8a44");
for (let k = 0; k < 14; k++) {
  const a = -Math.PI / 2 + k * Math.PI * 2 / 14;
  tree(CUT + 10 + 205 * Math.cos(a), PY + 318 + 140 * Math.sin(a), 9, R, "#2f6a2e", "#6fae4e");
}
for (let k = 0; k < 9; k++) tree(CUT + 30 + k * 46, PY + 200 + (k % 2) * 8, 10, R, "#2f6a2e", "#6fae4e");

/* the light falls the same way on both: one camera, one sun */
glow("#fff1d6", CUT + 160, PY + 120, 420, .08, ALL);

/* the calendar rail: twelve flights, the last one lit */
P(rrect(PX + 90, PY + PH - 34, PW - 180, 20, 10), "#0e0a07", .55, ALL);
for (let k = 0; k < 12; k++) {
  const x = PX + 112 + k * ((PW - 224) / 11);
  P(disc(x, PY + PH - 24, k === 11 ? 6.5 : 4), k === 11 ? "#4fd6c4" : "#f4e9d8", k === 11 ? 1 : .75, ALL);
}

/* the curtain */
P(rect(CUT - 1.5, PY, 3, PH), "#ffffff", .95, ALL);
P(disc(CUT + 2, PY + PH / 2 + 4, 28), "#000000", .25);
P(disc(CUT, PY + PH / 2, 27), "#ffffff");
P(poly([[CUT - 8, PY + PH / 2], [CUT - 2, PY + PH / 2 - 7], [CUT - 2, PY + PH / 2 + 7]]), "#1f1a14");
P(poly([[CUT + 8, PY + PH / 2], [CUT + 2, PY + PH / 2 - 7], [CUT + 2, PY + PH / 2 + 7]]), "#1f1a14");

/* ---------- the drone, top down, in the room's teal ---------- */
const DX = 225, DY = 300, ARM = 74, TEAL = "#4fd6c4";
glow(TEAL, DX, DY, 260, .10);
for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
  P(seg(DX + sx * 22, DY + sy * 22, DX + sx * ARM, DY + sy * ARM, 15), "#2a3a38");
  P(seg(DX + sx * 22, DY + sy * 22, DX + sx * ARM, DY + sy * ARM, 9), TEAL);
}
for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
  const cx = DX + sx * ARM, cy = DY + sy * ARM;
  P(disc(cx, cy, 48), TEAL, .10);                 // the blur of a spinning prop
  P(ring(cx, cy, 48, 5), TEAL, .9);
  P(disc(cx, cy, 11), "#0e0a07");
  P(ring(cx, cy, 11, 4), TEAL);
  P(seg(cx - 38, cy + 10, cx + 38, cy - 10, 5), TEAL, .55);
}
P(rrect(DX - 34, DY - 46, 68, 92, 22), "#0e0a07");
P(rrect(DX - 30, DY - 42, 60, 84, 19), TEAL);
P(rrect(DX - 18, DY - 26, 36, 40, 10), "#2a8f84", .55);
P(disc(DX, DY + 30, 9), "#0e0a07");               // the camera, looking down
P(disc(DX, DY + 30, 4.5), "#2c4a6a");
P(disc(DX - 2, DY + 28, 1.8), "#e9f1ff");
/* and the way it flies: the same route, every time */
for (let k = 0; k < 15; k++) {
  const t = k / 14, x = DX + 110 + t * (PX - DX - 140), y = DY - 40 - Math.sin(t * Math.PI) * 120 + t * 10;
  P(disc(x, y, 3.2), TEAL, .25 + .55 * (1 - Math.abs(t - .5) * 2) ** .5);
}

/* ---------- out ---------- */
const out = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H * 3; i++) out[i] = Math.max(0, Math.min(255, Math.round(px[i])));
const file = path.join(__dirname, "og.png");
fs.writeFileSync(file, png(W, H, out));
console.log("  ✓ " + path.relative(process.cwd(), file) + " (" + (fs.statSync(file).size / 1024).toFixed(0) + " KB)");
