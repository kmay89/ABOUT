/* grain.js — the surface of the board, as pixels.

   The squares used to be painted with a handful of bezier strokes per
   square: six wavy lines for wood, three for marble, a grid for linen.
   Seen close, which is how a phone sees a board, they were strokes —
   the drawing of a grain rather than a grain. Real veneer is not a
   line: it is a field. Wood is rings cut at a slant, so the bands come
   and go, crowd together and open out, and every square is its own
   piece of a different plank with its own lean. Marble is veins that
   wander through clouds, thin and crisp where the stone fractured and
   soft where mineral soaked in. Linen is a weave, with the thread
   going over and under.

   So this file is a small noise kitchen: a hash, a value noise built on
   it, a few octaves of that stacked into fBm, and three recipes that
   turn it into a chessboard. The result is a field — two numbers for
   every pixel of the playing surface, a tone (how much lighter or
   darker the paint is there) and a relief (how far proud of or cut
   into the surface it is) — which both boards sample: the drawn one
   into its colour, the carved one into its colour and into the height
   map its light reads. One recipe, two boards, and the carved board's
   normal map can never disagree with the colour it belongs to.

   The field is laid out in board space, a8 in the top-left corner,
   whatever way the board is shown — so the grain stays on its square
   when the board is flipped, as it would on a real board turned round.
   Every number comes from a seeded stream, so the same skin always
   paints the same board, and the same board on both renderers.

   Pure arithmetic: no DOM, no canvas. `apply` writes into any
   {data, width, height} — an ImageData, or a plain object in a test.
   Tested by chess/tools/grain-check.js. */
(function (root) {
"use strict";

var PATTERNS = { plain: 1, wood: 1, marble: 1, linen: 1, inlay: 1 };

/* ---------- noise ---------- */
/* an integer hash, good enough for texture and the same everywhere */
function hash(x, y, seed) {
  var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) * 2.3283064365386963e-10;
}
function smooth(t) { return t * t * (3 - 2 * t); }
/* value noise: the four corners of the cell, blended with a smoothstep
   so there is no crease at the edges */
function vnoise(x, y, seed) {
  var xi = Math.floor(x), yi = Math.floor(y);
  var fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  var a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
  var c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  var top = a + (b - a) * fx;
  return top + ((c + (d - c) * fx) - top) * fy;
}
/* fractal Brownian motion: octaves of the same noise at doubling
   frequency and halving weight. Three is enough for a grain the eye
   reads as organic; more is paid for and not seen. */
function fbm(x, y, seed, octaves) {
  var sum = 0, amp = 0.5, norm = 0, i;
  for (i = 0; i < octaves; i++) {
    sum += (vnoise(x, y, seed + i * 17) - 0.5) * amp;
    norm += amp;
    x = x * 2.03 + 11.3; y = y * 1.97 + 7.1;
    amp *= 0.5;
  }
  return sum / norm;                  /* roughly -0.5..0.5 */
}

/* ---------- the recipes ----------
   Each takes a point in a square's own frame (0..1 across the square,
   already leaned and shifted so that no two squares are the same cut)
   plus a per-square random, and leaves a tone and a relief in T and
   RL, both about -1..1 before the amount is applied. */

/* Wood: the growth rings cut at a slant. The rings are a sine of the
   distance across the plank, warped by noise so they wander, with the
   latewood — the dark, hard line of each year — narrow and sharp, the
   earlywood between them wide and soft. Pores ride on top as a fine
   speckle along the grain, and a slow mottle gives the whole square the
   unevenness of a thing that grew. The rings are recessed a hair, which
   is what a finished board's grain feels like under a thumb. */
function wood(x, y, rnd, seed, o) {
  /* the ring spacing is the plank's, not the board's: every square is
     cut from somewhere else on the tree, the rings crowd and open out
     along the cut, and a third of the squares are cut where the rings
     sweep through the face as arches rather than stripes — the
     "cathedral" figure of flat-sawn wood */
  var lines = o.lines * (0.75 + rnd * 0.5);
  var arch = rnd > 0.78 ? (x - 0.5 - (rnd - 0.89) * 3.0) : 0;
  var drift = fbm(x * 0.7, y * 0.5, seed + 21, 2) * 0.9;
  var warp = fbm(x * 1.1, y * 0.35, seed, 2) * 1.6 + (vnoise(x * 4.5, y * 1.4, seed + 3) - 0.5) * 0.22;
  var ring = (arch ? Math.sqrt(y * y * 0.9 + arch * arch * 1.1) : y) * lines * (1 + drift) + warp * 2.2 + rnd * 9;
  var t = 0.5 + 0.5 * Math.sin(ring * Math.PI * 2);
  var late = Math.pow(t, 3.0);                     /* the narrow dark year-line */
  var early = (1 - t) * 0.18;                      /* the soft pale wood between */
  var pores = (vnoise(x * 150 + rnd * 40, y * 9, seed + 5) - 0.5) * 0.9 *
              (0.6 + 0.4 * (vnoise(x * 30, y * 30, seed + 9)));
  var mottle = fbm(x * 2.2, y * 2.2, seed + 7, 2) * 1.2;
  /* the figure: broad light and dark across the square, the way a
     board's squares are never one even tone */
  var figure = fbm(x * 1.3, y * 0.9, seed + 41, 2) * 1.6;
  /* centred, so the grain is a texture on the square's colour rather
     than a darkening of it */
  T = -late * 0.5 + early + pores * 0.14 + mottle * 0.3 + figure * 0.35 + 0.08;
  RL = -late * 0.45 + pores * 0.2 + mottle * 0.06;
}

/* Marble: two families of veins, thin and crisp, each a line through
   noise-bent space so it wanders and branches, laid over a soft cloud
   of mineral. The veins are lighter on a dark stone and darker on a
   pale one — which is the only thing that differs between the two
   colours of square — and polished stone has almost no relief, so what
   there is follows the clouds, not the veins. */
function marble(x, y, rnd, seed, o) {
  var n1 = fbm(x * 1.6, y * 1.6, seed, 3), n2 = fbm(x * 2.3 + 5, y * 2.3 + 5, seed + 31, 3);
  var v1 = Math.abs(Math.sin((x * 0.7 + y * 0.9 + n1 * 2.4 + rnd * 3) * Math.PI * 1.3));
  var v2 = Math.abs(Math.sin((x * 1.4 - y * 0.6 + n2 * 2.0 + rnd * 5) * Math.PI * 1.9));
  var vein = Math.pow(1 - v1, 9) * 1.0 + Math.pow(1 - v2, 13) * 0.6;
  var cloud = fbm(x * 1.2, y * 1.2, seed + 61, 2) * 1.1;
  var fleck = (vnoise(x * 80, y * 80, seed + 71) - 0.5) * 0.12;
  var sign = o.dark ? 1 : -1;
  T = sign * (vein * 0.75 + Math.max(0, cloud) * 0.25) + cloud * 0.18 + fleck;
  RL = cloud * 0.22 - vein * 0.10;
}

/* Linen: threads going over and under. Two sines, one across and one
   along, give the warp and the weft; where one is up the other is
   down, which is the weave. A little slub noise along each thread
   stops it looking printed, and the relief is the weave itself. */
function linen(x, y, rnd, seed, o) {
  var f = o.threads;
  var sx = x * f * Math.PI * 2, sy = y * f * Math.PI * 2;
  var wx = Math.sin(sx), wy = Math.sin(sy);
  var over = wx * wx > wy * wy ? wx * wx : -(wy * wy);
  var slub = (vnoise(x * f * 0.5, y * f * 4.1, seed) - 0.5) * 0.5 +
             (vnoise(x * f * 4.1, y * f * 0.5, seed + 3) - 0.5) * 0.5;
  var shade = Math.abs(wx) * Math.abs(wy) * 0.9 - 0.3;
  T = shade * 0.55 + slub * 0.35 + fbm(x * 3, y * 3, seed + 11, 2) * 0.3;
  RL = over * 0.75 + slub * 0.2;
}

/* paper and inlay: nothing but a whisper of fibre, so a plain square
   is not a flat fill and an inlaid one has something under its line */
function paper(x, y, rnd, seed) {
  var n = (vnoise(x * 120, y * 120, seed) - 0.5) * 0.5 + fbm(x * 6, y * 6, seed + 1, 2) * 0.6;
  T = n * 0.5; RL = n * 0.25;
}

var RECIPE = { wood: wood, marble: marble, linen: linen, plain: paper, inlay: paper };
/* the recipes hand their answer back in these rather than in a fresh
   object each pixel: a quarter of a million allocations a field is the
   difference between a skin change you notice and one you do not */
var T = 0, RL = 0;

/* ---------- the field ----------
   N by N over the playing surface, a8 top-left. `tiles` is how many
   squares across (8 for the board, 1 for a frame painted as one plank).
   The lean and shift of each square come from its own hash, so no two
   are the same cut — and the dark squares and the light ones are two
   woods, cut from two boards, so they lean differently again. */
var cache = [];
function key(N, o) {
  return [N, o.pattern, o.tiles, o.seed, o.lines, o.threads].join("|");
}
function field(N, o) {
  o = o || {};
  var pattern = PATTERNS[o.pattern] ? o.pattern : "wood";
  var opts = { pattern: pattern, tiles: o.tiles || 8, seed: o.seed | 0,
               lines: o.lines || 9, threads: o.threads || 17 };
  var k = key(N, opts), i;
  for (i = 0; i < cache.length; i++) if (cache[i].key === k) return cache[i].field;
  var tone = new Float32Array(N * N), relief = new Float32Array(N * N);
  var recipe = RECIPE[pattern], tiles = opts.tiles, seed = opts.seed;
  var darkOpts = { dark: true, lines: opts.lines, threads: opts.threads };
  var lightOpts = { dark: false, lines: opts.lines, threads: opts.threads };
  var inv = tiles / N, x, y, f, r, lx, ly, rnd, ang, c, s, cx, cy, rx, ry, dark;
  for (y = 0; y < N; y++) {
    var v = (y + 0.5) * inv;
    r = Math.floor(v); if (r >= tiles) r = tiles - 1;
    ly = v - r;
    for (x = 0; x < N; x++) {
      var u = (x + 0.5) * inv;
      f = Math.floor(u); if (f >= tiles) f = tiles - 1;
      lx = u - f;
      /* canvas row 0 is rank 8: a8 is dark, and so is every square
         whose file and rank (from the top) add to an even number */
      dark = ((f + r) % 2) === 0;
      rnd = hash(f, r, seed + 101);
      /* each square's veneer is cut from a different place on the
         plank, and laid a degree or two off square */
      ang = (hash(f, r, seed + 202) - 0.5) * (pattern === "linen" ? 0.0 : 0.11) + (dark ? 0.05 : -0.05);
      c = Math.cos(ang); s = Math.sin(ang);
      cx = lx - 0.5; cy = ly - 0.5;
      rx = cx * c - cy * s + 0.5 + rnd * 3.7 + (dark ? 17 : 0);
      ry = cx * s + cy * c + 0.5 + hash(f, r, seed + 303) * 2.9;
      recipe(rx, ry, rnd, seed + (dark ? 7 : 0), dark ? darkOpts : lightOpts);
      /* a square of its own: real veneer is never quite the shade of
         the one beside it */
      var even = (hash(f, r, seed + 404) - 0.5) * 0.14;
      var idx = y * N + x;
      tone[idx] = T + even;
      relief[idx] = RL;
    }
  }
  var out = { n: N, tone: tone, relief: relief, pattern: pattern };
  cache.push({ key: k, field: out });
  if (cache.length > 6) cache.shift();
  return out;
}

/* ---------- laying it on ----------
   `img` is {data, width, height} (an ImageData will do). `region` is
   the rectangle of it the field covers — the playing surface — as
   {x, y, w, h} in pixels. `amount` is the skin's grain, 0..1. In
   "colour" mode the pixels already hold the squares' paint and are
   lightened or darkened by the tone; in "height" mode they hold a grey
   height field and the relief is added to it. `flip` turns the field
   round for a board shown from Black's side. The field is sampled
   bilinearly so a small field on a big board stays smooth. */
var TONE_GAIN = { wood: 0.30, marble: 0.44, linen: 0.32, plain: 0.08, inlay: 0.12 };
var RELIEF_GAIN = { wood: 0.24, marble: 0.14, linen: 0.50, plain: 0.06, inlay: 0.06 };

function apply(img, fld, region, amount, mode, flip) {
  if (!img || !fld || !region || !(amount > 0)) return img;
  var data = img.data, W = img.width, H = img.height, N = fld.n;
  var src = mode === "height" ? fld.relief : fld.tone;
  var gain = amount * (mode === "height" ? RELIEF_GAIN[fld.pattern] : TONE_GAIN[fld.pattern]) || 0;
  if (!(gain > 0)) return img;
  var x0 = Math.max(0, Math.floor(region.x)), y0 = Math.max(0, Math.floor(region.y));
  var x1 = Math.min(W, Math.ceil(region.x + region.w)), y1 = Math.min(H, Math.ceil(region.y + region.h));
  var sx = N / region.w, sy = N / region.h, x, y;
  for (y = y0; y < y1; y++) {
    var fy = (y + 0.5 - region.y) * sy - 0.5;
    if (flip) fy = N - 1 - fy;
    var yi = Math.floor(fy), ty = fy - yi;
    var ya = yi < 0 ? 0 : yi >= N ? N - 1 : yi, yb = yi + 1 >= N ? N - 1 : yi + 1 < 0 ? 0 : yi + 1;
    for (x = x0; x < x1; x++) {
      var fx = (x + 0.5 - region.x) * sx - 0.5;
      if (flip) fx = N - 1 - fx;
      var xi = Math.floor(fx), tx = fx - xi;
      var xa = xi < 0 ? 0 : xi >= N ? N - 1 : xi, xb = xi + 1 >= N ? N - 1 : xi + 1 < 0 ? 0 : xi + 1;
      var a = src[ya * N + xa], b = src[ya * N + xb], c = src[yb * N + xa], d = src[yb * N + xb];
      var v = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
      var o = (y * W + x) * 4;
      if (mode === "height") {
        var hgt = data[o] + v * gain * 255;
        data[o] = data[o + 1] = data[o + 2] = hgt < 0 ? 0 : hgt > 255 ? 255 : hgt;
      } else {
        /* a multiply rather than an add: a dark square's grain stays
           dark and a pale one's stays pale, as paint on wood does */
        var m = 1 + v * gain, k;
        for (k = 0; k < 3; k++) {
          var cv = data[o + k] * m;
          data[o + k] = cv < 0 ? 0 : cv > 255 ? 255 : cv;
        }
      }
    }
  }
  return img;
}

var Grain = {
  PATTERNS: PATTERNS, TONE_GAIN: TONE_GAIN, RELIEF_GAIN: RELIEF_GAIN,
  hash: hash, vnoise: vnoise, fbm: fbm, field: field, apply: apply, key: key
};
if (typeof module !== "undefined" && module.exports) module.exports = Grain;
else root.Grain = Grain;
})(typeof self !== "undefined" ? self : this);
