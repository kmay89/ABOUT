/* make-game-icons.js — dev-only. Draws every new room's app icons from
   scratch, and writes them into each game's icons/ folder.

   No canvas, no image library: the pixels are worked out analytically and
   written into a PNG by hand (node's zlib does the compression; the chunk
   framing and the CRC are here). Same approach as the chess and domino
   rooms' icon tools, and for the same reason — it keeps the repo free of
   binary source assets nobody can regenerate.

   Everything is drawn with three primitives (disc, rectangle, polygon), each
   sampled 3×3 per pixel so the edges are smooth without a rasteriser. A game
   is then a short list of shapes, which is why eight icon sets fit in one
   file instead of eight.

   Run: node tools/make-game-icons.js                                       */
"use strict";
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

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
function png(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------- a tiny painter ----------
   Everything is a coverage function over the unit square, sampled 3×3 per
   pixel and composited in order. Slow and completely predictable, which is
   the right trade for something that runs once per release. */
function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
class Sheet {
  constructor(size) {
    this.n = size;
    this.px = new Float32Array(size * size * 3);
    this.a = new Float32Array(size * size);
  }
  fillAll(colour) {
    const [r, g, b] = hex(colour);
    for (let i = 0; i < this.n * this.n; i++) {
      this.px[i * 3] = r; this.px[i * 3 + 1] = g; this.px[i * 3 + 2] = b;
      this.a[i] = 1;
    }
  }
  /* cover(x, y) → 0…1, in unit coordinates with (0,0) top-left */
  paint(colour, cover, alpha = 1) {
    const [r, g, b] = hex(colour), n = this.n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let c = 0;
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        c += cover((x + (sx + 0.5) / 3) / n, (y + (sy + 0.5) / 3) / n);
      }
      c = (c / 9) * alpha;
      if (c <= 0) continue;
      const i = y * n + x;
      this.px[i * 3] = this.px[i * 3] * (1 - c) + r * c;
      this.px[i * 3 + 1] = this.px[i * 3 + 1] * (1 - c) + g * c;
      this.px[i * 3 + 2] = this.px[i * 3 + 2] * (1 - c) + b * c;
      this.a[i] = Math.min(1, this.a[i] + c);
    }
  }
  rgba() {
    const n = this.n, out = Buffer.alloc(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      out[i * 4] = Math.max(0, Math.min(255, Math.round(this.px[i * 3])));
      out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(this.px[i * 3 + 1])));
      out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(this.px[i * 3 + 2])));
      out[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(this.a[i] * 255)));
    }
    return out;
  }
}
const disc = (cx, cy, r) => (x, y) => ((x - cx) ** 2 + (y - cy) ** 2 <= r * r ? 1 : 0);
const ring = (cx, cy, r, w) => (x, y) => {
  const d = Math.hypot(x - cx, y - cy);
  return (d <= r && d >= r - w) ? 1 : 0;
};
const rect = (x0, y0, w, h) => (x, y) => (x >= x0 && x < x0 + w && y >= y0 && y < y0 + h ? 1 : 0);
const poly = (pts) => (x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? 1 : 0;
};
const star6 = (cx, cy, r) => {
  const a = [], b = [];
  for (let k = 0; k < 3; k++) {
    const t = -Math.PI / 2 + k * 2 * Math.PI / 3;
    a.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  for (let k = 0; k < 3; k++) {
    const t = Math.PI / 2 + k * 2 * Math.PI / 3;
    b.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  const pa = poly(a), pb = poly(b);
  return (x, y) => Math.max(pa(x, y), pb(x, y));
};

/* ---------- the eight icons ----------
   Each one is the single object that room is about: not a logo, the thing
   itself, big enough to read at 32 pixels. */
const ICONS = {
  checkers: (s, m) => {
    /* a checkerboard corner with one crowned piece standing on it */
    s.fillAll("#2a1a10");
    const c = 0.155;
    for (let r = 0; r < 6; r++) for (let q = 0; q < 6; q++) {
      const dark = ((r + q) & 1) === 1;
      s.paint(dark ? "#7a4f31" : "#d8c09a", rect(m + q * c, m + r * c, c, c));
    }
    s.paint("#000000", disc(0.53, 0.58, 0.24), 0.35);
    s.paint("#7d1f1a", disc(0.5, 0.54, 0.245));
    s.paint("#b8322b", disc(0.5, 0.54, 0.2));
    s.paint("#7d1f1a", ring(0.5, 0.54, 0.145, 0.022));
    s.paint("#7d1f1a", star6(0.5, 0.54, 0.095));
  },
  othello: (s) => {
    /* four discs on green cloth, mid-turn: one is edge-on */
    s.fillAll("#186347");
    s.paint("#0d3d2b", rect(0.5 - 0.004, 0.06, 0.008, 0.88));
    s.paint("#0d3d2b", rect(0.06, 0.5 - 0.004, 0.88, 0.008));
    s.paint("#000000", disc(0.31, 0.31, 0.16), 0.3);
    s.paint("#191919", disc(0.3, 0.3, 0.16));
    s.paint("#f2f0e8", disc(0.7, 0.3, 0.16));
    s.paint("#f2f0e8", disc(0.3, 0.7, 0.16));
    /* the one turning: squashed to a sliver, which is the room's whole idea */
    s.paint("#b9b5a6", (x, y) =>
      (((x - 0.7) / 0.035) ** 2 + ((y - 0.7) / 0.16) ** 2 <= 1 ? 1 : 0));
  },
  halma: (s) => {
    /* the star, with marbles in two opposite points */
    s.fillAll("#2a1c12");
    s.paint("#4a3527", star6(0.5, 0.5, 0.46));
    s.paint("#1b120b", star6(0.5, 0.5, 0.42));
    const rows = [[0.5, 0.14], [0.44, 0.24], [0.56, 0.24], [0.38, 0.34], [0.5, 0.34], [0.62, 0.34]];
    for (const [x, y] of rows) {
      s.paint("#c9932c", disc(x, y, 0.052));
      s.paint("#ffd77a", disc(x - 0.012, y - 0.014, 0.03));
    }
    for (const [x, y] of rows) {
      s.paint("#39549e", disc(x, 1 - y, 0.052));
      s.paint("#8fb0ff", disc(x - 0.012, 1 - y - 0.014, 0.03));
    }
  },
  hearts: (s) => {
    /* the queen of spades, and one heart behind her */
    s.fillAll("#1d5d43");
    s.paint("#000000", rect(0.24, 0.2, 0.56, 0.64), 0.3);
    s.paint("#c0392b", heart(0.5, 0.46, 0.3));
    s.paint("#f7f4ec", rect(0.3, 0.2, 0.44, 0.6));
    s.paint("#c9c2b0", rect(0.3, 0.2, 0.44, 0.012));
    s.paint("#1e1e1e", spade(0.52, 0.56, 0.2));
    /* the Q in the corner: a ring with a tail through it, which is the only
       letter in the pack you can draw with two primitives and still read */
    s.paint("#1e1e1e", ring(0.375, 0.29, 0.058, 0.02));
    s.paint("#1e1e1e", poly([[0.385, 0.3], [0.43, 0.355], [0.412, 0.368], [0.367, 0.313]]));
  },
  euchre: (s) => {
    /* the two bowers, one on the other */
    s.fillAll("#5a2333");
    s.paint("#000000", rect(0.2, 0.24, 0.44, 0.58), 0.32);
    s.paint("#f7f2e6", rect(0.16, 0.2, 0.42, 0.58));
    s.paint("#c0392b", rect(0.2, 0.24, 0.06, 0.16));
    s.paint("#c0392b", diamond(0.37, 0.52, 0.13));
    s.paint("#000000", rect(0.46, 0.32, 0.44, 0.58), 0.32);
    s.paint("#f7f2e6", rect(0.42, 0.28, 0.42, 0.58));
    s.paint("#1e1e1e", rect(0.46, 0.32, 0.06, 0.16));
    s.paint("#1e1e1e", spade(0.63, 0.6, 0.15));
  },
  solitaire: (s) => {
    /* three cards fanned, an ace on top */
    s.fillAll("#1b5c3f");
    s.paint("#000000", rect(0.16, 0.3, 0.4, 0.52), 0.3);
    s.paint("#25457e", rect(0.12, 0.26, 0.36, 0.5));
    s.paint("#16294d", rect(0.16, 0.3, 0.28, 0.42));
    s.paint("#000000", rect(0.42, 0.24, 0.44, 0.56), 0.32);
    s.paint("#f7f4ec", rect(0.38, 0.2, 0.42, 0.56));
    s.paint("#c0392b", rect(0.42, 0.24, 0.05, 0.15));
    s.paint("#c0392b", heart(0.6, 0.52, 0.2));
  },
  minesweeper: (s) => {
    /* one tile, one mine, and a 3 */
    s.fillAll("#171512");
    s.paint("#4a443b", rect(0.06, 0.06, 0.42, 0.42));
    s.paint("#615a4e", rect(0.06, 0.06, 0.42, 0.045));
    s.paint("#241f1a", rect(0.06, 0.435, 0.42, 0.045));
    s.paint("#1e1b17", rect(0.52, 0.06, 0.42, 0.42));
    s.paint("#e0503f", rect(0.52, 0.52, 0.42, 0.42));
    s.paint("#e0503f", rect(0.06, 0.52, 0.42, 0.42), 0.12);
    /* the mine, with spikes */
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 4;
      s.paint("#201c18", (x, y) => {
        const dx = x - 0.73, dy = y - 0.73;
        const u = dx * Math.cos(a) + dy * Math.sin(a);
        const v = -dx * Math.sin(a) + dy * Math.cos(a);
        return (Math.abs(v) < 0.017 && Math.abs(u) < 0.2) ? 1 : 0;
      });
    }
    s.paint("#201c18", disc(0.73, 0.73, 0.13));
    s.paint("#ffffff", disc(0.69, 0.69, 0.032), 0.6);
    /* A 3. Three equal bars off a right-hand stem reads as a mirrored E; a
       real 3 has a short waist, and that one shortened bar is the whole
       difference between a numeral and a symbol. */
    s.paint("#e0503f", rect(0.62, 0.13, 0.2, 0.045));
    s.paint("#e0503f", rect(0.69, 0.245, 0.13, 0.045));
    s.paint("#e0503f", rect(0.62, 0.36, 0.2, 0.045));
    s.paint("#e0503f", rect(0.775, 0.13, 0.045, 0.275));
  },
  breaker: (s) => {
    /* three courses of bricks, a ball, a paddle */
    s.fillAll("#111623");
    const courses = [["#e8a33d", "#b6741c"], ["#63c76a", "#3d9247"], ["#4fb3d9", "#2f87ab"]];
    for (let r = 0; r < 3; r++) {
      for (let q = 0; q < 3; q++) {
        const x = 0.06 + q * 0.3, y = 0.1 + r * 0.13;
        s.paint(courses[r][1], rect(x, y, 0.27, 0.1));
        s.paint(courses[r][0], rect(x, y, 0.27, 0.07));
      }
    }
    s.paint("#e06a52", rect(0.06 + 0.3, 0.1 + 0.13, 0.27, 0.1), 0);
    s.paint("#ffd77a", disc(0.44, 0.62, 0.075));
    s.paint("#ffffff", disc(0.42, 0.6, 0.032));
    s.paint("#8d857a", rect(0.28, 0.83, 0.44, 0.07));
    s.paint("#e8e2d6", rect(0.28, 0.83, 0.44, 0.035));
  }
};

function heart(cx, cy, r) {
  return (x, y) => {
    const u = (x - cx) / r, v = (y - cy) / r;
    const a = u * u + (v - 0.15) * (v - 0.15) * 1.1;
    /* two lobes and a point */
    const l = ((u + 0.42) ** 2 + (v + 0.16) ** 2) <= 0.29;
    const rr = ((u - 0.42) ** 2 + (v + 0.16) ** 2) <= 0.29;
    const t = poly([[cx - r * 0.85, cy - r * 0.05], [cx + r * 0.85, cy - r * 0.05], [cx, cy + r * 0.95]])(x, y);
    return (l || rr || t) ? 1 : 0;
  };
}
function spade(cx, cy, r) {
  return (x, y) => {
    const u = (x - cx) / r, v = (y - cy) / r;
    const l = ((u + 0.42) ** 2 + (v - 0.16) ** 2) <= 0.29;
    const rr = ((u - 0.42) ** 2 + (v - 0.16) ** 2) <= 0.29;
    const t = poly([[cx - r * 0.85, cy + r * 0.05], [cx + r * 0.85, cy + r * 0.05], [cx, cy - r * 0.95]])(x, y);
    const stem = (Math.abs(u) < 0.13 && v > 0.2 && v < 0.85) ||
                 (Math.abs(u) < 0.34 && v > 0.7 && v < 0.86);
    return (l || rr || t || stem) ? 1 : 0;
  };
}
function diamond(cx, cy, r) {
  return poly([[cx, cy - r], [cx + r * 0.72, cy], [cx, cy + r], [cx - r * 0.72, cy]]);
}

/* ---------- write them ---------- */
const SIZES = [
  { file: "icon-192.png", n: 192, inset: 0 },
  { file: "icon-512.png", n: 512, inset: 0 },
  { file: "apple-touch-icon.png", n: 180, inset: 0 },
  /* maskable icons are cropped to a circle by some launchers, so the drawing
     is shrunk into the safe zone and the background carries the corners */
  { file: "icon-maskable-512.png", n: 512, inset: 0.12 }
];

let made = 0;
for (const game of Object.keys(ICONS)) {
  const dir = path.join(ROOT, game, "icons");
  if (!fs.existsSync(path.join(ROOT, game))) {
    console.log("  – no " + game + "/ folder, skipping");
    continue;
  }
  fs.mkdirSync(dir, { recursive: true });
  for (const size of SIZES) {
    const s = new Sheet(size.n);
    if (size.inset) {
      /* draw at full size into a scratch sheet, then letterbox it */
      const inner = new Sheet(size.n);
      ICONS[game](inner, 0.02);
      s.fillAll("#12100e");
      const k = 1 - size.inset * 2, off = size.inset;
      for (let y = 0; y < size.n; y++) for (let x = 0; x < size.n; x++) {
        const sx = Math.floor((x / size.n - off) / k * size.n);
        const sy = Math.floor((y / size.n - off) / k * size.n);
        if (sx < 0 || sy < 0 || sx >= size.n || sy >= size.n) continue;
        const si = sy * size.n + sx, di = y * size.n + x;
        s.px[di * 3] = inner.px[si * 3];
        s.px[di * 3 + 1] = inner.px[si * 3 + 1];
        s.px[di * 3 + 2] = inner.px[si * 3 + 2];
        s.a[di] = 1;
      }
    } else {
      ICONS[game](s, 0.02);
    }
    fs.writeFileSync(path.join(dir, size.file), png(size.n, size.n, s.rgba()));
    made++;
  }
  console.log("  ✓ " + game + "/icons");
}
console.log("\n" + made + " icons written");
