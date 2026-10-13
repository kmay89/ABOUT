/* make-game-icons.js — dev-only. Draws every new room's app icons from
   scratch, and writes them into each game's icons/ folder.

   No canvas, no image library: the pixels are worked out analytically and
   written into a PNG by hand (node's zlib does the compression; the chunk
   framing and the CRC are here). Same approach as the chess and domino
   rooms' icon tools, and for the same reason — it keeps the repo free of
   binary source assets nobody can regenerate.

   Everything is drawn with three primitives (disc, rectangle, polygon), each
   sampled 3×3 per pixel so the edges are smooth without a rasteriser. A game
   is then a short list of shapes, which is why a dozen icon sets fit in one
   file instead of a dozen. The well is the exception, and says why where it
   is drawn: its icon is a small lit scene, still entirely formulas.

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
  /* The other way to fill a sheet: a whole scene as one function of the
     point, returning an sRGB colour (0…255 per channel), averaged over
     ss×ss samples per pixel. Layering flat shapes cannot do a gradient or a
     glow; a scene can, and the well's icon is mostly light. Everything it
     paints is opaque. */
  scene(fn, ss) {
    const n = this.n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = fn((x + (sx + 0.5) / ss) / n, (y + (sy + 0.5) / ss) / n);
        r += c[0]; g += c[1]; b += c[2];
      }
      const i = y * n + x, k = 1 / (ss * ss);
      this.px[i * 3] = r * k; this.px[i * 3 + 1] = g * k; this.px[i * 3 + 2] = b * k;
      this.a[i] = 1;
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
const star5 = (cx, cy, r) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = (i % 2) ? r * 0.42 : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return poly(pts);
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

/* ---------- the icons ----------
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
  stratego: (s) => {
    /* two tiles facing each other across a lake: one showing its rank, one
       showing its back — which is the whole game in one picture */
    s.fillAll("#6b7248");
    s.paint("#2d5f7a", rect(0, 0.42, 1, 0.16));
    s.paint("#ffffff", rect(0.1, 0.47, 0.3, 0.012), 0.3);
    s.paint("#ffffff", rect(0.58, 0.52, 0.3, 0.012), 0.3);
    /* theirs, face down, with the dot that says it has moved */
    s.paint("#000000", rect(0.2, 0.1, 0.44, 0.3), 0.3);
    s.paint("#2f6fa8", rect(0.16, 0.06, 0.42, 0.3));
    s.paint("#1d4670", rect(0.16, 0.28, 0.42, 0.08));
    s.paint("#ffffff", rect(0.24, 0.185, 0.26, 0.028), 0.25);
    s.paint("#ffd77a", disc(0.505, 0.13, 0.038));
    /* yours, face up, and wearing its insignia rather than a number — the
       Marshal's star in its laurel, which is the mark the board now draws */
    s.paint("#000000", rect(0.46, 0.64, 0.44, 0.3), 0.3);
    s.paint("#c8452f", rect(0.42, 0.6, 0.42, 0.3));
    s.paint("#8a2718", rect(0.42, 0.82, 0.42, 0.08));
    s.paint("#f4efe2", star5(0.63, 0.735, 0.075));
    s.paint("#f4efe2", (x, y) => {
      const d = Math.hypot(x - 0.63, y - 0.742);
      if (d > 0.125 || d < 0.104) return 0;
      /* open at the top, which is where a laurel opens */
      return (y - 0.742 > -0.055) ? 1 : 0;
    });
  },
  catchphrase: (s) => {
    /* a speech bubble with a fuse on it — the game is a thing you say under a
       clock you cannot see, and a bubble alone would read as any chat app */
    s.fillAll("#3a2320");
    s.paint("#000000", (x, y) => (bubble(0.52, 0.46)(x, y)), 0.3);
    s.paint("#f2ece1", bubble(0.48, 0.42));
    /* three dots: the describing, mid-sentence */
    for (const cx of [0.32, 0.46, 0.6]) s.paint("#3a2320", disc(cx, 0.42, 0.045));
    /* the fuse, lit */
    s.paint("#8d7f6c", (x, y) => {
      const dx = x - 0.74, dy = y - 0.2;
      const d = Math.sqrt(dx * dx + dy * dy);
      return (d > 0.13 && d < 0.165 && x > 0.7 && y < 0.24) ? 1 : 0;
    });
    s.paint("#e0503f", disc(0.875, 0.115, 0.075));
    s.paint("#ffd77a", disc(0.86, 0.1, 0.036));
  },
  guesstures: (s) => {
    /* a figure mid-mime, arms out, and a clock behind it */
    s.fillAll("#16301c");
    s.paint("#2c5a35", ring(0.5, 0.5, 0.42, 0.055));
    /* the hands of the clock, at about ten seconds left */
    s.paint("#2c5a35", (x, y) => {
      const dx = x - 0.5, dy = y - 0.5;
      return (Math.abs(dx) < 0.022 && dy < 0 && dy > -0.3) ? 1 : 0;
    });
    /* the mime */
    s.paint("#f2ece1", disc(0.5, 0.26, 0.095));
    s.paint("#f2ece1", rect(0.455, 0.35, 0.09, 0.28));
    s.paint("#f2ece1", (x, y) => {
      /* both arms flung out and up, which is the shape of somebody miming */
      const arm = (ax, ay, bx, by) => {
        const t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2);
        if (t < 0 || t > 1) return 0;
        const px = ax + t * (bx - ax), py = ay + t * (by - ay);
        return ((x - px) ** 2 + (y - py) ** 2) < 0.0016 ? 1 : 0;
      };
      return arm(0.47, 0.38, 0.24, 0.22) || arm(0.53, 0.38, 0.76, 0.22) ? 1 : 0;
    });
    s.paint("#f2ece1", (x, y) => {
      const leg = (ax, ay, bx, by) => {
        const t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2);
        if (t < 0 || t > 1) return 0;
        const px = ax + t * (bx - ax), py = ay + t * (by - ay);
        return ((x - px) ** 2 + (y - py) ** 2) < 0.0016 ? 1 : 0;
      };
      return leg(0.49, 0.61, 0.34, 0.86) || leg(0.51, 0.61, 0.66, 0.86) ? 1 : 0;
    });
  },
  viuda: (s) => {
    /* the widow: one card face down in the middle of the table, with two of
       your own face up under it. The whole game is the relationship between
       those two things, and a face-down card among face-up ones is the one
       arrangement everybody reads instantly. */
    s.fillAll("#1d5d43");
    /* yours, two of them, fanned */
    s.paint("#000000", rect(0.1, 0.52, 0.36, 0.44), 0.3);
    s.paint("#f7f4ec", rect(0.06, 0.48, 0.34, 0.44));
    s.paint("#1e1e1e", rect(0.1, 0.52, 0.05, 0.13));
    s.paint("#1e1e1e", spade(0.27, 0.76, 0.13));
    s.paint("#000000", rect(0.5, 0.56, 0.36, 0.44), 0.3);
    s.paint("#f7f4ec", rect(0.46, 0.52, 0.34, 0.44));
    s.paint("#c0392b", rect(0.5, 0.56, 0.05, 0.13));
    s.paint("#c0392b", heart(0.67, 0.8, 0.13));
    /* the widow, face down and above them both */
    s.paint("#000000", rect(0.32, 0.1, 0.38, 0.42), 0.34);
    s.paint("#2c4f8e", rect(0.28, 0.06, 0.36, 0.42));
    s.paint("#182d55", (x, y) => {
      if (x < 0.31 || x > 0.61 || y < 0.09 || y > 0.45) return 0;
      /* the lattice on the back, which is what says "face down" */
      const u = (x * 26) % 2, v = (y * 26) % 2;
      return Math.abs(u - v) < 0.5 || Math.abs(u + v - 2) < 0.5 ? 1 : 0;
    });
  },
  yahtzee: (s) => {
    /* two dice on the felt, showing a five and a three — five because it is
       the only face whose arrangement everybody can picture, and three
       because a second die at an angle is what says "dice" rather than
       "cube". The pips are the real layout; a five with a missing centre is
       the sort of mistake nobody can name and everybody sees. */
    s.fillAll("#2f5d43");
    s.paint("#000000", rect(0.12, 0.5, 0.42, 0.42), 0.28);
    s.paint("#f6f1e6", rect(0.08, 0.46, 0.42, 0.42));
    s.paint("#cdc4b2", rect(0.08, 0.84, 0.42, 0.04));
    const five = [[0.17, 0.55], [0.41, 0.55], [0.29, 0.67], [0.17, 0.79], [0.41, 0.79]];
    for (const p of five) s.paint("#241f19", disc(p[0], p[1], 0.045));
    s.paint("#000000", rect(0.54, 0.16, 0.38, 0.38), 0.28);
    s.paint("#f6f1e6", rect(0.5, 0.12, 0.38, 0.38));
    s.paint("#cdc4b2", rect(0.5, 0.46, 0.38, 0.04));
    const three = [[0.58, 0.2], [0.69, 0.31], [0.8, 0.42]];
    for (const p of three) s.paint("#241f19", disc(p[0], p[1], 0.042));
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
  },
  well: wellIcon
};

/* a speech bubble: a rounded body with a tail off the bottom left */
function bubble(cx, cy) {
  return (x, y) => {
    const inBody = Math.abs(x - cx) < 0.32 && Math.abs(y - cy) < 0.22 &&
      ((Math.abs(x - cx) - 0.24 < 0 || Math.abs(y - cy) - 0.14 < 0) ||
       ((Math.abs(x - cx) - 0.24) ** 2 + (Math.abs(y - cy) - 0.14) ** 2 < 0.0064));
    const tail = poly([[cx - 0.2, cy + 0.18], [cx - 0.04, cy + 0.18], [cx - 0.22, cy + 0.4]])(x, y);
    return (inBody || tail) ? 1 : 0;
  };
}
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

/* ---------- the well ----------
   The one icon here that is lit rather than laid out flat, because the room
   is. A stone well at dusk in three-quarter view, the stack of pieces
   rising inside it, and the light coming up from below — and the light is
   the point, so it is a scene (Sheet.scene) evaluated per sample, in linear
   light, rather than a stack of flat shapes. A flat yellow disc in a grey
   ring would say "lamp"; it takes a gradient to say "deep".

   The pieces are the room's own and nobody else's: each one is a single
   fused body with rounded outer corners and no line between its cells, cut
   slightly apart from its neighbours, with a top face showing because we
   are looking down into the well. The colours are the room's default Sea
   Glass skin, which was chosen to sit nowhere near the genre's classic
   colour-per-piece mapping. The stone is the sandstone of the first world,
   Dawn, and the sky is Dawn's sky. One more piece is on its way down, with
   the room's landing light — a pool where it will rest and two hairline
   rails from its outer edges — instead of a ghost copy of itself.

   It draws its own background to the very edge, so the maskable version
   shrinks only the well into the safe zone instead of letterboxing a
   picture of a sky (see `bleed`, in the writer below). */
const WELL = (() => {
  const lin = (h) => hex(h).map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const geo = { cx: 0.5, my: 0.5, rx: 0.41, e: 0.36, rc: 0.438, ri: 0.352,
                band: 0.046, by: 0.8, c: 0.084 };
  /* seven columns across the mouth; the floor of the visible stack sits
     just behind the front of the rim, so the bottom row is half hidden by
     the stone in front of it — which is what makes it read as inside */
  geo.x0 = geo.cx - 3.5 * geo.c;
  geo.yb = geo.my + geo.ri * geo.e + 0.006;
  const pieces = [
    { hex: "#3FA58A", dy: 0, cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
    { hex: "#F2C36B", dy: 0, cells: [[3, 0], [4, 0], [5, 0], [6, 0]] },
    { hex: "#F09AB0", dy: 0, cells: [[2, 1], [3, 1], [3, 2], [4, 2]] },
    { hex: "#B5DB86", dy: 0, cells: [[5, 1], [6, 1], [6, 2], [6, 3]] },
    { hex: "#B9A3F0", dy: 0, cells: [[0, 1], [0, 2], [1, 2], [2, 2]] },
    /* the one on its way down, between rows rather than on one */
    { hex: "#4E6FD0", dy: 4.55, cells: [[3, 0], [4, 0], [3, 1], [4, 1]] }
  ].map((p) => {
    /* cells as numbers rather than "x,y" strings: this is asked millions
       of times per icon */
    const key = (i, j) => (i + 16) * 64 + (j + 16);
    const set = new Set(p.cells.map((q) => key(q[0], q[1])));
    const xs = p.cells.map((q) => q[0]), ys = p.cells.map((q) => q[1] + p.dy);
    /* the piece's box on the sheet, for skipping the glow sum far from it */
    const box = [geo.x0 + Math.min(...xs) * geo.c, geo.yb - (Math.max(...ys) + 1) * geo.c,
                 geo.x0 + (Math.max(...xs) + 1) * geo.c, geo.yb - Math.min(...ys) * geo.c];
    return { lin: lin(p.hex), dy: p.dy, cells: p.cells, box, has: (i, j) => set.has(key(i, j)) };
  });
  return {
    geo, pieces, lin,
    stone: lin("#8C7B6A"), coping: lin("#A49279"), dark: lin("#231B2A"),
    skyTop: lin("#0A0D24"), skyMid: lin("#231D3F"), skyLow: lin("#43304F"),
    ground: lin("#130F1C"), glow: lin("#FFD3A0"), key: lin("#FFE2C4"),
    amb: [0.075, 0.08, 0.12]
  };
})();

function wellIcon(s, m, view) {
  /* view = { k, off }: the maskable size draws the subject at scale k, offset
     into the safe zone, while the sky still runs to the corners */
  const k = view ? view.k : 1, off = view ? view.off : 0;
  s.scene((x, y) => wellAt((x - off) / k, (y - off) / k), 4);
}
wellIcon.bleed = true;

/* How far inside piece p the grid point (gx, gy) is, in cells: negative
   when it is outside. Cells of one piece run into each other seamlessly;
   where a piece meets anything else it stops GAP short, and its outer
   corners are rounded to RAD. Inner corners keep the gap's own quarter
   circle, which is what makes an L read as one bent body, not three
   squares and a fourth. */
const GAP = 0.05, RAD = 0.2;
function inPiece(p, gx, gy) {
  gy -= p.dy;
  const i = Math.floor(gx), j = Math.floor(gy);
  if (!p.has(i, j)) return -1;
  const fx = gx - i, fy = gy - j;
  const L = !p.has(i - 1, j), R = !p.has(i + 1, j), D = !p.has(i, j - 1), U = !p.has(i, j + 1);
  let d = 1;
  if (L) d = Math.min(d, fx - GAP);
  if (R) d = Math.min(d, 1 - GAP - fx);
  if (D) d = Math.min(d, fy - GAP);
  if (U) d = Math.min(d, 1 - GAP - fy);
  if (d < 0) return -1;
  const sx = fx < 0.5 ? -1 : 1, sy = fy < 0.5 ? -1 : 1;
  const ox = sx < 0 ? L : R, oy = sy < 0 ? D : U;
  if (ox && oy) {
    const ax = sx < 0 ? GAP + RAD : 1 - GAP - RAD, ay = sy < 0 ? GAP + RAD : 1 - GAP - RAD;
    if ((fx - ax) * sx > 0 && (fy - ay) * sy > 0) {
      const r = Math.hypot(fx - ax, fy - ay);
      if (r > RAD) return -1;
      d = Math.min(d, RAD - r);
    }
  } else if (!ox && !oy && !p.has(i + sx, j + sy)) {
    const r = Math.hypot(fx - (sx < 0 ? 0 : 1), fy - (sy < 0 ? 0 : 1));
    if (r < GAP) return -1;
    d = Math.min(d, r - GAP);
  }
  return d;
}

const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/* a fixed scatter, so every block of stone is its own shade and the same
   block is the same shade on every run */
function hash2(a, b) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/* sandstone, lit: a cool sky from everywhere and a low key light from the
   upper left, on a surface whose normal points (nx, ny, nz) */
function litStone(alb, nx, ny, nz, vary) {
  const lx = -0.55, ly = 0.5, lz = 0.67;
  const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
  const out = [0, 0, 0];
  for (let q = 0; q < 3; q++) {
    out[q] = alb[q] * vary * (WELL.amb[q] * (1.2 + ny) + WELL.key[q] * diff * 0.34);
  }
  return out;
}

function wellAt(x, y) {
  const g = WELL.geo, cx = g.cx, my = g.my, e = g.e;
  let col;

  /* ---- the sky at dusk, a horizon of low hills, the ground ---- */
  const hill = 0.795 + 0.018 * Math.sin(x * 7.1 + 0.6) + 0.01 * Math.sin(x * 17.3);
  if (y < hill) {
    const a = smooth(0, 0.62, y), b = smooth(0.55, 0.8, y);
    col = [0, 1, 2].map((q) => WELL.skyTop[q] + (WELL.skyMid[q] - WELL.skyTop[q]) * a +
                              (WELL.skyLow[q] - WELL.skyMid[q]) * b);
    const stars = [[0.11, 0.09, 1], [0.24, 0.2, 0.6], [0.8, 0.07, 0.8], [0.9, 0.23, 0.55],
                   [0.66, 0.15, 0.45], [0.07, 0.33, 0.5], [0.93, 0.42, 0.4], [0.37, 0.06, 0.5]];
    for (const st of stars) {
      const d = Math.hypot(x - st[0], y - st[1]);
      const v = st[2] * 0.5 * Math.exp(-(d * d) / 0.000018);
      col[0] += v * 0.8; col[1] += v * 0.85; col[2] += v;
    }
  } else {
    const t = smooth(hill, 1.05, y);
    col = WELL.ground.map((v) => v * (1 - 0.55 * t));
    /* the well's own shadow, pooled under it and a little to the right,
       away from the key light */
    const sx = (x - cx - 0.04) / (g.rx * 1.45), sy = (y - g.by - g.rx * e * 0.6) / (g.rx * e * 1.5);
    const sh = Math.max(0, 1 - Math.hypot(sx, sy));
    col = col.map((v) => v * (1 - 0.6 * smooth(0, 0.6, sh)));
  }

  /* ---- the outside wall: courses of sandstone round a cylinder ---- */
  const u = (x - cx) / g.rx;
  if (Math.abs(u) <= 1 && y >= my && y <= g.by + g.rx * e * Math.sqrt(1 - u * u)) {
    const th = Math.asin(u), front = Math.sqrt(1 - u * u);
    const t = y - (my + g.rx * e * front + g.band);
    const h = 0.07, course = Math.floor(t / h), ft = t / h - course;
    const step = Math.PI * 2 / 13, shift = hash2(course + 3, 17) * step;
    const jn = Math.round((th + shift) / step);
    const xj = cx + g.rx * Math.sin(jn * step - shift);
    const mortar = ft < 0.09 || (Math.abs(x - xj) < 0.0042 && Math.cos(jn * step - shift) > 0);
    const vary = 0.86 + 0.26 * hash2(course + 40, jn + 40);
    col = litStone(WELL.stone, Math.sin(th), 0, Math.cos(th), mortar ? 0.42 : vary);
    /* the coping overhangs, so the top course sits in its shade; and the
       foot of the wall is in the shade of the ground */
    const ao = (0.45 + 0.55 * smooth(-0.005, 0.05, t)) *
               (0.75 + 0.25 * smooth(g.by + g.rx * e * front, g.by - 0.1, y));
    col = col.map((v) => v * ao);
  }

  /* ---- the coping: a ring of capstones, its front face and its top ---- */
  const uc = (x - cx) / g.rc;
  if (Math.abs(uc) <= 1) {
    const arc = my + g.rc * e * Math.sqrt(1 - uc * uc);
    if (y >= arc && y <= arc + g.band) {
      const th = Math.asin(uc);
      const step = Math.PI * 2 / 14, jn = Math.round(th / step);
      const mortar = Math.abs(x - (cx + g.rc * Math.sin(jn * step))) < 0.0035;
      col = litStone(WELL.coping, Math.sin(th), 0.15, Math.cos(th),
                     mortar ? 0.5 : 0.9 + 0.2 * hash2(jn + 7, 3));
      /* the arris catches the sky */
      const lip = 1 - smooth(arc, arc + 0.008, y);
      col = col.map((v, q) => v + WELL.amb[q] * 0.9 * lip);
    }
  }
  const rho = Math.hypot((x - cx) / g.rc, (y - my) / (g.rc * e));
  const rhoi = Math.hypot((x - cx) / g.ri, (y - my) / (g.ri * e));
  if (rho <= 1 && rhoi > 1) {
    const phi = Math.atan2((y - my) / e, x - cx);
    const step = Math.PI * 2 / 14, jn = Math.round(phi / step);
    const rr = Math.hypot(x - cx, (y - my) / e);
    const mortar = Math.abs(phi - jn * step) * rr < 0.0035;
    col = litStone(WELL.coping, 0, 1, 0.25, mortar ? 0.5 : 0.92 + 0.18 * hash2(jn + 11, 5));
    /* the light from inside warms the inner edge, and the far side of the
       ring, which faces it, most of all */
    const t = (rhoi - 1) / (g.rc / g.ri - 1);
    const far = y < my ? 1 : 0.45;
    const w = Math.pow(1 - Math.min(1, t), 2.5) * 0.6 * far;
    col = col.map((v, q) => v + WELL.glow[q] * w);
  } else if (rhoi <= 1) {
    /* ---- inside: the far wall, going down into the light ---- */
    const v = (y - (my - g.ri * e)) / (2 * g.ri * e);
    const gl = Math.exp(-Math.pow((x - cx) / 0.2, 2) - Math.pow((y - my - 0.07) / 0.11, 2));
    col = WELL.dark.map((d, q) => d * (0.5 + 0.6 * v) + WELL.glow[q] * (0.12 * v + 0.75 * gl));
  }

  /* ---- the pieces ---- */
  const frontArc = Math.abs((x - cx) / g.ri) <= 1
    ? my + g.ri * e * Math.sqrt(1 - Math.pow((x - cx) / g.ri, 2)) : -1;
  const gx = (x - g.x0) / g.c, gy = (g.yb - y) / g.c;
  let hit = null, depth = 0;
  if (y < frontArc || frontArc < 0) {
    for (const p of WELL.pieces) {
      const d = inPiece(p, gx, gy);
      if (d >= 0) { hit = p; depth = d; break; }
    }
    if (hit) {
      /* fused glass lit from within: brighter the deeper it sits, a bright
         rim where the glass turns edge-on, and a soft sheen under the top */
      const inner = 0.62 + 0.42 * smooth(4.5, 0, gy - hit.dy);
      const core = smooth(0.08, 0.42, depth);
      const rim = Math.pow(1 - Math.min(1, depth / 0.07), 2);
      const fy = gy - hit.dy - Math.floor(gy - hit.dy);
      const sheen = hit.has(Math.floor(gx), Math.floor(gy - hit.dy) + 1)
        ? 0 : smooth(0.55, 0.75, fy) * (1 - smooth(0.82, 0.9, fy));
      col = hit.lin.map((v, q) => v * (inner + 0.45 * core + 0.6 * rim) + 0.06 * rim +
                                  0.06 * sheen + WELL.glow[q] * 0.05 * core);
    } else {
      /* the top face, seen because we look down into the well: the same
         body moved up a fraction of a cell, lighter, where the front of
         nothing is in the way */
      for (const p of WELL.pieces) {
        if (inPiece(p, gx, gy - 0.2) >= 0) {
          col = p.lin.map((v) => v * 1.12 + 0.05);
          hit = p;
          break;
        }
      }
    }
  }

  /* ---- light: what glows, glows onto what is round it ---- */
  if (!hit) {
    for (const p of WELL.pieces) {
      /* past 0.2 of the sheet the glow is under a thousandth: not worth
         the sum */
      if (x < p.box[0] - 0.2 || x > p.box[2] + 0.2 || y < p.box[1] - 0.2 || y > p.box[3] + 0.2) continue;
      let d = 9;
      for (const q of p.cells) {
        const x0 = g.x0 + q[0] * g.c, y1 = g.yb - (q[1] + p.dy) * g.c;
        const ddx = Math.max(x0 - x, 0, x - (x0 + g.c));
        const ddy = Math.max((y1 - g.c) - y, 0, y - y1);
        d = Math.min(d, Math.hypot(ddx, ddy));
      }
      const a = 0.34 * Math.exp(-d / 0.024) * (y > frontArc && frontArc > 0 ? 0.45 : 1);
      col = col.map((v, q) => v + p.lin[q] * a);
    }
  }
  /* the landing light: a pool on the stone where the falling piece will
     rest, and two hairline rails down from its outer edges */
  const fall = WELL.pieces[5];
  const lx0 = g.x0 + 3 * g.c + GAP * g.c, lx1 = g.x0 + 5 * g.c - GAP * g.c;
  const top = g.yb - 3 * g.c, bottom = g.yb - fall.dy * g.c;
  if (!hit || hit !== fall) {
    if (y > bottom && y < top) {
      const fade = 0.5 + 0.5 * smooth(bottom, top, y);
      const rail = Math.max(Math.exp(-Math.pow((x - lx0) / 0.0018, 2)),
                            Math.exp(-Math.pow((x - lx1) / 0.0018, 2)));
      col = col.map((v, q) => v + WELL.key[q] * 0.16 * rail * fade);
    }
    const pool = Math.exp(-Math.pow((x - (lx0 + lx1) / 2) / (g.c * 0.95), 4) -
                          Math.pow((y - top) / (g.c * 0.16), 2));
    col = col.map((v, q) => v + WELL.key[q] * 0.3 * pool);
  }
  /* and the light the well breathes up into the dusk: a haze over its
     mouth, and a faint column rising out of it */
  const haze = Math.exp(-Math.pow((x - cx) / 0.33, 2) - Math.pow((y - my + 0.02) / 0.13, 2));
  col = col.map((v, q) => v + WELL.glow[q] * 0.075 * haze);
  if (y < my) {
    const hgt = my - y;
    const beam = Math.exp(-Math.pow((x - cx) / (0.2 + hgt * 0.3), 2)) * Math.exp(-hgt / 0.28);
    col = col.map((v, q) => v + WELL.glow[q] * 0.08 * beam);
  }

  /* a gentle vignette, then back to sRGB */
  const vig = 1 - 0.35 * smooth(0.42, 0.78, Math.hypot(x - 0.5, y - 0.52));
  return col.map((v) => {
    v = Math.max(0, Math.min(1, v * vig));
    return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  });
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
    if (size.inset && ICONS[game].bleed) {
      /* an icon that paints its own background to the edges is asked to
         shrink only its subject, rather than being letterboxed — a picture
         of a sky in a dark frame is not what a launcher's circle should cut */
      ICONS[game](s, 0.02, { k: 1 - size.inset * 2, off: size.inset });
    } else if (size.inset) {
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
