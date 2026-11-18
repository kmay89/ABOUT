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

var PATTERNS = { plain: 1, wood: 1, marble: 1, linen: 1, inlay: 1,
                 grass: 1, soil: 1, clover: 1, moss: 1, tatami: 1, sand: 1, ice: 1, parchment: 1 };

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


/* ---------- the arenas ----------
   The coaches' own boards are places, not finishes: a mown lawn, a seed
   tray, a meadow, moss and stone, a dojo's mat, the desert, the frozen
   ridge, the library. Each recipe leaves the same tone and relief as
   the finishes above, and may also leave A: how much of the board's
   accent colour sits on this pixel (a buttercup, a sprout, a petal).
   They are told where they are on the whole board (o.gx, o.gy, 0..1,
   a8 top-left), for things that cross squares, like a lawn's mowing
   stripes, and where they are on their own square, unleaned (o.lx,
   o.ly), so a flower is never cut in half by a square's edge. */
var A = 0;
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
/* a sprinkle of little shapes across a square: a 3x3 grid of cells, each
   holding one with probability `p`, jittered inside its cell so it never
   touches the edge. `shape` is a polar outline: r(a)/R in 0..1 */
var SHAPES = {
  dot: function () { return 1; },
  clover: function (a) { return 0.55 + 0.45 * Math.abs(Math.cos(1.5 * a)); },
  sprout: function (a) { var c = Math.cos(a); return 0.25 + 0.75 * c * c; },
  petal: function (a) { return 0.5 + 0.5 * Math.abs(Math.cos(2.5 * a)); },
  flake: function (a) { var c = Math.abs(Math.cos(3 * a)); return 0.22 + 0.78 * c * c * c * c; },
  glint: function (a) { var c = Math.abs(Math.cos(2 * a)); return 0.15 + 0.85 * Math.pow(c, 6); }
};
function sprinkle(o, seed, p, size, shape, spin) {
  var cells = 3, cx = Math.min(cells - 1, Math.floor(o.lx * cells)), cy = Math.min(cells - 1, Math.floor(o.ly * cells));
  var key = seed + o.sq * 7;
  if (hash(cx, cy, key) >= p) return 0;
  var px = (cx + 0.3 + hash(cx, cy, key + 1) * 0.4) / cells, py = (cy + 0.3 + hash(cx, cy, key + 2) * 0.4) / cells;
  var R = size * (0.75 + hash(cx, cy, key + 3) * 0.5) / cells;
  var dx = o.lx - px, dy = o.ly - py, r = Math.sqrt(dx * dx + dy * dy);
  if (r > R * 1.25) return 0;
  var a = Math.atan2(dy, dx) + (spin ? hash(cx, cy, key + 4) * 6.283 : 0);
  var edge = R * SHAPES[shape](a), aa = 0.012;
  return clamp01((edge - r) / aa + 0.5);
}
/* the lawn: blades standing in clumps, mown in broad stripes across the
   whole board; the light squares painted over with white line-marking
   paint that the grass shows through; buttercups in the green */
function grass(x, y, rnd, seed, o) {
  var blades = (vnoise(x * 70, y * 7, seed) - 0.5) * 1.1 + (vnoise(x * 150 + 3, y * 13, seed + 1) - 0.5) * 0.7;
  var clump = fbm(x * 3.2, y * 3.2, seed + 5, 2) * 1.1;
  var stripe = (Math.floor(o.gx * 4) % 2 ? 1 : -1) * 0.22;
  if (o.dk) {
    T = blades * 0.6 + clump * 0.45 + stripe;
    RL = blades * 0.55 + clump * 0.25;
    A = sprinkle(o, seed + 90, 0.2, 0.2, "petal", true);
  } else {
    var chalk = fbm(x * 6, y * 6, seed + 9, 2);
    T = blades * 0.16 + chalk * 0.4 + stripe * 0.45;
    RL = blades * 0.22 + chalk * 0.1;
    A = 0;
  }
}
/* the seed tray: crumbly dark soil with grit, sprouts pushing up out of
   it; the light squares a soft felted cream */
function soil(x, y, rnd, seed, o) {
  if (o.dk) {
    var crumb = (vnoise(x * 34, y * 34, seed) - 0.5) * 1.2 + (vnoise(x * 90, y * 90, seed + 1) - 0.5) * 0.6;
    var lump = fbm(x * 4, y * 4, seed + 3, 3) * 1.2;
    var grit = vnoise(x * 160, y * 160, seed + 4) > 0.86 ? 0.5 : 0;
    T = crumb * 0.5 + lump * 0.5 + grit;
    RL = crumb * 0.6 + lump * 0.4 + grit * 0.5;
    A = sprinkle(o, seed + 91, 0.3, 0.25, "sprout", false);
  } else {
    var felt = (vnoise(x * 60, y * 60, seed + 5) - 0.5) * 0.5 + fbm(x * 5, y * 5, seed + 6, 2) * 0.5;
    T = felt * 0.5; RL = felt * 0.3; A = 0;
  }
}
/* the meadow: the green squares are a mat of little three-lobed leaves;
   the pale ones open grass, with clover flowers on them */
function clover(x, y, rnd, seed, o) {
  if (o.dk) {
    var u = x * 9, v = y * 9, cu = Math.floor(u), cv = Math.floor(v);
    var du = u - cu - 0.5 + (hash(cu, cv, seed) - 0.5) * 0.3, dv = v - cv - 0.5 + (hash(cu, cv, seed + 1) - 0.5) * 0.3;
    var r = Math.sqrt(du * du + dv * dv), ang = Math.atan2(dv, du) + hash(cu, cv, seed + 2) * 6.283;
    var leaf = r < 0.42 * (0.55 + 0.45 * Math.abs(Math.cos(1.5 * ang))) ? 1 : 0;
    var vein = leaf ? Math.pow(Math.abs(Math.cos(1.5 * ang)), 30) * 0.4 : 0;
    T = leaf * 0.32 - (1 - leaf) * 0.28 + vein + fbm(x * 3, y * 3, seed + 3, 2) * 0.3;
    RL = leaf * 0.5 - (1 - leaf) * 0.2;
    A = 0;
  } else {
    var g = (vnoise(x * 60, y * 6, seed + 4) - 0.5) * 0.6 + fbm(x * 4, y * 4, seed + 5, 2) * 0.4;
    T = g * 0.45; RL = g * 0.35;
    A = sprinkle(o, seed + 92, 0.22, 0.21, "clover", true);
  }
}
/* the fern shade: pale stone slabs with fine cracks, and deep cushions
   of moss between them, fireflies over the moss */
function moss(x, y, rnd, seed, o) {
  if (o.dk) {
    var fuzz = (vnoise(x * 110, y * 110, seed) - 0.5) * 0.7 + (vnoise(x * 40, y * 40, seed + 1) - 0.5) * 0.5;
    var cushion = fbm(x * 3.5, y * 3.5, seed + 2, 3) * 1.4;
    T = fuzz * 0.5 + cushion * 0.55;
    RL = cushion * 0.8 + fuzz * 0.3;
    A = sprinkle(o, seed + 93, 0.16, 0.11, "glint", false);
  } else {
    var crack = Math.pow(1 - Math.abs(fbm(x * 2.2, y * 2.2, seed + 3, 3) * 2), 14);
    var speck = (vnoise(x * 120, y * 120, seed + 4) - 0.5) * 0.4;
    var slab = fbm(x * 1.5, y * 1.5, seed + 5, 2) * 0.8;
    T = -crack * 0.5 + speck * 0.5 + slab * 0.4;
    RL = -crack * 0.8 + slab * 0.2;
    A = 0;
  }
}
/* the dojo's mat: woven rush, one way on the dark squares and the other
   on the light, as tatami are laid, with sakura petals blown across */
function tatami(x, y, rnd, seed, o) {
  var along = o.dk ? x : y, across = o.dk ? y : x;
  var strand = Math.sin(across * 46 * Math.PI) * 0.5 + 0.5;
  var weave = Math.sin(along * 14 * Math.PI + (Math.floor(across * 23) % 2) * Math.PI) * 0.5 + 0.5;
  var slub = (vnoise(along * 4, across * 46, seed) - 0.5) * 0.6;
  T = (strand - 0.5) * 0.75 + (weave - 0.5) * 0.35 + slub * 0.4 + fbm(x * 2, y * 2, seed + 1, 2) * 0.25;
  RL = (strand - 0.5) * 0.6 + (weave - 0.5) * 0.4;
  A = sprinkle(o, seed + 94, 0.1, 0.19, "petal", true);
}
/* the desert: wind ripples across the sand, and sun-baked terracotta
   tiles with a crackle glaze, with a cactus flower now and then */
function sand(x, y, rnd, seed, o) {
  if (o.dk) {
    var craze = Math.pow(1 - Math.abs(fbm(x * 3.5, y * 3.5, seed, 3) * 2), 18);
    var clay = fbm(x * 2.5, y * 2.5, seed + 1, 3) * 1.1 + (vnoise(x * 80, y * 80, seed + 2) - 0.5) * 0.3;
    T = clay * 0.55 - craze * 0.6;
    RL = clay * 0.3 - craze * 0.5;
    A = 0;
  } else {
    var warp = fbm(x * 1.6, y * 1.6, seed + 3, 2) * 1.8;
    var ripple = Math.sin((o.gy * 8 * 5.5 + warp) * Math.PI * 2);
    var grains = (vnoise(x * 170, y * 170, seed + 4) - 0.5) * 0.7;
    T = ripple * 0.32 + grains * 0.45;
    RL = ripple * 0.6 + grains * 0.2;
    A = sprinkle(o, seed + 95, 0.1, 0.2, "petal", true);
  }
}
/* the frozen ridge: soft snow that sparkles on the pale squares; clear
   blue ice with cracks running through it on the dark, snowflakes on it */
function ice(x, y, rnd, seed, o) {
  if (o.dk) {
    var crack = Math.pow(1 - Math.abs(Math.sin((x * 1.3 - y * 0.8 + fbm(x * 1.8, y * 1.8, seed, 3) * 2.2) * Math.PI * 1.5)), 40) +
                Math.pow(1 - Math.abs(Math.sin((x * 0.6 + y * 1.4 + fbm(x * 2.4 + 4, y * 2.4, seed + 1, 2) * 1.6) * Math.PI * 2.1)), 60) * 0.7;
    var depth = fbm(x * 1.4, y * 1.4, seed + 2, 3) * 1.2;
    T = crack * 0.9 + depth * 0.5;
    RL = -crack * 0.5 + depth * 0.1;
    A = sprinkle(o, seed + 96, 0.18, 0.23, "flake", true);
  } else {
    var drift = fbm(x * 2.2, y * 2.2, seed + 3, 3);
    var sparkle = vnoise(x * 140, y * 140, seed + 4) > 0.93 ? 0.55 : 0;
    T = drift * 0.35 + sparkle;
    RL = drift * 0.5;
    A = 0;
  }
}
/* the library: pale parchment with fibres and old foxing; the dark
   squares tooled leather with a stitched border, flecked with gold leaf */
function parchment(x, y, rnd, seed, o) {
  if (o.dk) {
    var pebble = (vnoise(x * 55, y * 55, seed) - 0.5) * 0.7;
    var tan = fbm(x * 2, y * 2, seed + 1, 3) * 0.9;
    var m = Math.min(o.lx, o.ly, 1 - o.lx, 1 - o.ly);
    var stitch = m > 0.07 && m < 0.1 && (Math.floor((o.lx + o.ly) * 30) % 2 === 0) ? 0.55 : 0;
    T = pebble * 0.5 + tan * 0.5 + stitch;
    RL = pebble * 0.5 - (m > 0.06 && m < 0.11 ? 0.4 : 0);
    A = sprinkle(o, seed + 97, 0.14, 0.12, "glint", true);
  } else {
    var fibre = (vnoise(x * 4, y * 120, seed + 2) - 0.5) * 0.5 + (vnoise(x * 120, y * 4, seed + 3) - 0.5) * 0.3;
    var fox = Math.max(0, fbm(x * 2.5, y * 2.5, seed + 4, 3) - 0.12) * 1.6;
    T = fibre * 0.4 - fox * 0.6 + fbm(x * 6, y * 6, seed + 5, 2) * 0.2;
    RL = fibre * 0.3;
    A = 0;
  }
}
var RECIPE = { wood: wood, marble: marble, linen: linen, plain: paper, inlay: paper,
               grass: grass, soil: soil, clover: clover, moss: moss, tatami: tatami, sand: sand, ice: ice, parchment: parchment };
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
  var accent = null;
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
      ang = (hash(f, r, seed + 202) - 0.5) * (pattern === "linen" || pattern === "tatami" ? 0.0 : 0.11) + (dark ? 0.05 : -0.05);
      c = Math.cos(ang); s = Math.sin(ang);
      cx = lx - 0.5; cy = ly - 0.5;
      rx = cx * c - cy * s + 0.5 + rnd * 3.7 + (dark ? 17 : 0);
      ry = cx * s + cy * c + 0.5 + hash(f, r, seed + 303) * 2.9;
      var oo = dark ? darkOpts : lightOpts;
      oo.gx = u / tiles; oo.gy = v / tiles; oo.lx = lx; oo.ly = ly; oo.sq = f * 8 + r;
      /* the arenas need to know which squares really are the dark ones
         (a8 is a light square; the finishes above never minded) */
      oo.dk = !dark;
      A = 0;
      recipe(rx, ry, rnd, seed + (dark ? 7 : 0), oo);
      /* a square of its own: real veneer is never quite the shade of
         the one beside it */
      var even = (hash(f, r, seed + 404) - 0.5) * 0.14;
      var idx = y * N + x;
      tone[idx] = T + even;
      relief[idx] = RL;
      if (A > 0) { if (!accent) accent = new Float32Array(N * N); accent[idx] = A; }
    }
  }
  var out = { n: N, tone: tone, relief: relief, accent: accent, pattern: pattern };
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
var TONE_GAIN = { wood: 0.30, marble: 0.44, linen: 0.32, plain: 0.08, inlay: 0.12,
                  grass: 0.42, soil: 0.46, clover: 0.40, moss: 0.40, tatami: 0.34, sand: 0.30, ice: 0.30, parchment: 0.34 };
var RELIEF_GAIN = { wood: 0.24, marble: 0.14, linen: 0.50, plain: 0.06, inlay: 0.06,
                    grass: 0.42, soil: 0.50, clover: 0.40, moss: 0.50, tatami: 0.45, sand: 0.40, ice: 0.22, parchment: 0.30 };

function apply(img, fld, region, amount, mode, flip, tint) {
  if (!img || !fld || !region || !(amount > 0)) return img;
  var data = img.data, W = img.width, H = img.height, N = fld.n;
  var src = mode === "height" ? fld.relief : fld.tone;
  var gain = amount * (mode === "height" ? RELIEF_GAIN[fld.pattern] : TONE_GAIN[fld.pattern]) || 0;
  if (!(gain > 0)) return img;
  var x0 = Math.max(0, Math.floor(region.x)), y0 = Math.max(0, Math.floor(region.y));
  var x1 = Math.min(W, Math.ceil(region.x + region.w)), y1 = Math.min(H, Math.ceil(region.y + region.h));
  var sx = N / region.w, sy = N / region.h, x, y;
  /* the accent: in colour, painted on in the board's accent colour; in
     height, a flower or a sprout stands a little proud */
  var acc = fld.accent, tr = 0, tg = 0, tb = 0, accAmt = Math.min(1, amount * 2.4);
  if (acc && tint && mode !== "height") { tr = tint[0]; tg = tint[1]; tb = tint[2]; }
  else if (mode !== "height") acc = null;
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
      var av = 0;
      if (acc) av = (acc[ya * N + xa] + (acc[ya * N + xb] - acc[ya * N + xa]) * tx) * (1 - ty) + (acc[yb * N + xa] + (acc[yb * N + xb] - acc[yb * N + xa]) * tx) * ty;
      if (mode === "height") {
        var hgt = data[o] + v * gain * 255 + av * 70 * amount;
        data[o] = data[o + 1] = data[o + 2] = hgt < 0 ? 0 : hgt > 255 ? 255 : hgt;
      } else {
        /* a multiply rather than an add: a dark square's grain stays
           dark and a pale one's stays pale, as paint on wood does */
        var m = 1 + v * gain, k;
        for (k = 0; k < 3; k++) {
          var cv = data[o + k] * m;
          data[o + k] = cv < 0 ? 0 : cv > 255 ? 255 : cv;
        }
        if (av > 0) {
          var w = av * accAmt;
          data[o] = data[o] + (tr - data[o]) * w;
          data[o + 1] = data[o + 1] + (tg - data[o + 1]) * w;
          data[o + 2] = data[o + 2] + (tb - data[o + 2]) * w;
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
