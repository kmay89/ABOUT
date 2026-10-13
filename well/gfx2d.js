/* gfx2d.js — the well, drawn on a flat canvas.

   This is the renderer for every device that cannot or should not run the
   WebGL well: Lockdown Mode, old phones, a lost context, "Simple
   graphics". It is not a lesser copy of the 3D room. It keeps every
   presentation rule the 3D well keeps — fused pieces, the landing light,
   previews drifting over the mouth, the Keep niche in the rim, clears that
   dissolve into the world's particles, the flash governor — and it has
   its own kind of beauty: soft shading baked once, pixels copied many
   times.

   ## Bake once, copy forever

   Everything expensive happens when something changes — the skin, the
   size, the world, a piece locking — and never in the ordinary frame.
   The tiles are baked when the skin or the size changes. The stack is
   painted into its own layer when the board changes, which is a few times
   a second at most. The well, the niche and that layer are composed into
   one well-sized canvas, again only on a change. So the ordinary frame is
   a short list of drawImage calls: the sky stretched from half
   resolution, one copy of the well, the piece in your hand, the landing
   light, the previews, and the particles. No gradients are created in the
   frame, no shadowBlur is set in the frame, no strings are built in the
   frame, and no arrays, objects or closures are allocated in it;
   particles live in typed arrays and every effect has a slot in a fixed
   pool. A phone-sized frame costs about 3 ms of script in a desktop
   browser, which leaves an old phone plenty of its 16.

   ## A piece is one body

   A piece is drawn as one continuous object: rounded outside corners, no
   seams between its cells (brief §7.1). The board is drawn from tiles, so
   that has to be true of tiles. Each tile is chosen by a 4-bit mask of
   which neighbours belong to the same piece (the engine's pid), and each
   tile is *painted from its neighbourhood*: the union of the cell and its
   eight neighbours is built as a shape, lit as one shape — bevels, rim,
   gloss, inner glow, all from canvas shadows of the shape's complement —
   and only then is the middle cell cut out. Two tiles that meet were lit
   from the same geometry where they meet, so the seam between them is
   invisible by construction rather than by luck. Diagonals come from the
   piece type: only an O piece ever has a 2×2 block of itself in play, so
   a concave corner is notched and filleted for every other piece — and a
   prepared lesson board that joins a 2×2 block of something else gets a
   "filled" variant of the tile, chosen from the board itself.

   The active piece, the previews and the kept piece are whole-piece
   sprites assembled from the same tiles, so a piece can turn, glide and
   shrink as one image without its tiles ever drifting apart.

   ## Honest motion (brief §8.3)

   The logic snaps; the pictures glide, and never for long. A sideways
   step is chased with a 15 ms time constant. A gravity row eases over the
   lesser of 90 ms and half the row interval, and is otherwise drawn
   exactly where it is. A turn is a 75 ms spring about the real rotation
   centre. A hard drop is a teleport with a light trail. Rows above a
   clear settle in 120 ms. The landing light is always drawn from the
   logic, never from the picture, so it is right on the same frame.

   ## Calm by construction (brief §8.4)

   Every large brightness change estimates its own change in relative
   luminance. Under 0.08 it is never a flash and goes ahead. At or above,
   it asks the flash governor, which allows two such pulses in any rolling
   second, each with at least 400 ms from rise to fall, and turns the rest
   into colour-only changes. Clear light goes toward warm white, never
   toward a piece's colour; nothing is red; danger is a cool vignette, not
   an alarm. The active piece, the landing light, the previews and the
   Keep niche are drawn after every particle and every glow and are never
   dimmed by any of them.                                                  */
(function (root) {
"use strict";

var W = 10, VIS = 22, TOPROW = 24;        /* rows drawn: the face and two above it */
var MN = 1, ME = 2, MS = 4, MW = 8;        /* neighbour mask bits, screen directions */
var TAU = Math.PI * 2;
var BIG = 20000;                           /* offscreen offset for shadow-only draws */
var PMAX = 180;                            /* particle slots allocated */

/* ---------- piece shapes ----------
   SRS states, y up, relative to the rotation centre (brief §3.3). Read
   from Rules when it is loaded, so the renderer can never disagree with
   the engine; written out here as well so this file stands alone. */
function rotCW(p) { return [p[1], -p[0]]; }
function states3(n) {
  var r = [], r2 = [], r3 = [], i;
  for (i = 0; i < 4; i++) r.push(rotCW(n[i]));
  for (i = 0; i < 4; i++) r2.push(rotCW(r[i]));
  for (i = 0; i < 4; i++) r3.push(rotCW(r2[i]));
  return [n, r, r2, r3];
}
var OWN_SHAPES = [null,
  [[[-1,0],[0,0],[1,0],[2,0]], [[1,1],[1,0],[1,-1],[1,-2]], [[-1,-1],[0,-1],[1,-1],[2,-1]], [[0,1],[0,0],[0,-1],[0,-2]]],
  [[[0,0],[1,0],[0,1],[1,1]], [[0,0],[1,0],[0,1],[1,1]], [[0,0],[1,0],[0,1],[1,1]], [[0,0],[1,0],[0,1],[1,1]]],
  states3([[-1,0],[0,0],[1,0],[0,1]]),
  states3([[-1,0],[0,0],[0,1],[1,1]]),
  states3([[-1,1],[0,1],[0,0],[1,0]]),
  states3([[-1,1],[-1,0],[0,0],[1,0]]),
  states3([[1,1],[-1,0],[0,0],[1,0]])
];
function shapeOf(type, rot) {
  var R = root.Rules;
  if (R && R.CELLS && R.CELLS[type] && R.CELLS[type][rot]) return R.CELLS[type][rot];
  return OWN_SHAPES[type][rot & 3];
}
/* where a piece actually turns, relative to the centre of its centre cell
   (cells, y up): the middle of the 4×4 box for I, the middle of the O */
var PIVOT_X = [0, 0.5, 0.5, 0, 0, 0, 0, 0];
var PIVOT_Y = [0, -0.5, 0.5, 0, 0, 0, 0, 0];
var LETTERS = ["", "I", "O", "T", "S", "Z", "J", "L"];
function typeId(t) {
  if (typeof t === "number") return t | 0;
  var i = LETTERS.indexOf(t);
  return i > 0 ? i : (t === "G" ? 8 : 0);
}

/* ---------- the juice ladder (brief §8.1, Medium) ----------
   E (relative intensity), particles, kick in CSS px, rotational kick in
   degrees, hit-stop in ms. */
var LADDER = {
  hard:        [1,    8,   3, 0,   0],
  single:      [2,    24,  2, 0,   0],
  double:      [2.5,  40,  3, 0,   0],
  triple:      [3,    64,  4, 0,   30],
  quad:        [4,    120, 5, 0,   60],
  twist:       [2,    16,  0, 0,   30],
  mini:        [1.5,  8,   0, 0,   30],
  miniSingle:  [2.5,  40,  2, 0,   30],
  miniDouble:  [3,    56,  3, 0.3, 40],
  twistSingle: [4,    80,  3, 0.6, 50],
  twistDouble: [4.5,  120, 4, 0.6, 70],
  twistTriple: [4.75, 150, 5, 0.6, 80],
  empty:       [5,    200, 0, 0,   120]
};
var JUICE = { calm: 0.5, medium: 1, vivid: 1.5 };

/* ---------- colour ---------- */
var WHITE = [255, 255, 255], BLACK = [0, 0, 0];
var WARM = [255, 244, 228];                 /* the neutral every clear goes toward */
var PEARL = [246, 240, 232];
function hexRgb(hex) {
  if (typeof hex !== "string" || hex.charAt(0) !== "#") return [128, 128, 128];
  var h = hex.slice(1);
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  var n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function c255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function css(c, a) {
  return "rgba(" + Math.round(c255(c[0])) + "," + Math.round(c255(c[1])) + "," + Math.round(c255(c[2])) + "," +
         (a === undefined ? 1 : Math.round(Math.max(0, Math.min(1, a)) * 1000) / 1000) + ")";
}
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function lighten(c, k) { return mix(c, WHITE, k); }
function darken(c, k) { return mix(c, BLACK, k); }
function saturate(c, k) {
  var g = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  return [c255(g + (c[0] - g) * k), c255(g + (c[1] - g) * k), c255(g + (c[2] - g) * k)];
}
function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function luma(c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
/* The change in relative luminance when "alpha" of colour "c" is added
   (canvas "lighter" adds in sRGB) over a grey of "base" (0..1, sRGB).
   Used to decide whether an effect is a flash before it is drawn. */
function deltaL(c, alpha, base) {
  var b = base * 255;
  var before = luma([b, b, b]);
  var after = luma([c255(b + c[0] * alpha), c255(b + c[1] * alpha), c255(b + c[2] * alpha)]);
  return after - before;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
/* How far a cell of the skin's colours can be tinted toward warm white
   (laid over it, not added) before its luminance has changed by "dl":
   the clear's warmth stays a change of colour, under the flash line, on
   any skin — pale Sea Glass gets less, dark Ink a little more. */
function tintFor(colors, dl, cap) {
  var r = 0, g = 0, b = 0, n = 0;
  for (var t = 1; t <= 7; t++) if (colors[t]) { r += colors[t][0]; g += colors[t][1]; b += colors[t][2]; n++; }
  if (!n) return cap;
  var c0 = [r / n, g / n, b / n], l0 = luma(c0), w;
  for (w = 0.02; w <= cap; w += 0.02) {
    var c1 = [c0[0] + (WARM[0] - c0[0]) * w, c0[1] + (WARM[1] - c0[1]) * w, c0[2] + (WARM[2] - c0[2]) * w];
    if (luma(c1) - l0 > dl) return Math.max(0, w - 0.02);
  }
  return cap;
}
function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function easeOut(t) { t = clamp(t, 0, 1); var u = 1 - t; return 1 - u * u * u; }
/* a spring from 0 to 1 in about "dur", with a small overshoot */
function spring(t) {
  if (t >= 1) return 1;
  if (t <= 0) return 0;
  return 1 - Math.exp(-6 * t) * Math.cos(4.6 * t);
}
/* a seeded generator, for textures that must look the same every rebuild */
function rng(seed) {
  var s = (seed >>> 0) || 1;
  return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function canvasOf(w, h) {
  var c = (typeof document !== "undefined") ? document.createElement("canvas") : null;
  if (!c) return null;
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}
function ctxOf(c) { return c.getContext("2d"); }
function noShadow(x) { x.shadowColor = "rgba(0,0,0,0)"; x.shadowBlur = 0; x.shadowOffsetX = 0; x.shadowOffsetY = 0; }

function roundRect(x, l, t, w, h, tl, tr, br, bl) {
  x.moveTo(l + tl, t);
  x.lineTo(l + w - tr, t);
  if (tr) x.arcTo(l + w, t, l + w, t + tr, tr); else x.lineTo(l + w, t);
  x.lineTo(l + w, t + h - br);
  if (br) x.arcTo(l + w, t + h, l + w - br, t + h, br); else x.lineTo(l + w, t + h);
  x.lineTo(l + bl, t + h);
  if (bl) x.arcTo(l, t + h, l, t + h - bl, bl); else x.lineTo(l, t + h);
  x.lineTo(l, t + tl);
  if (tl) x.arcTo(l, t, l + tl, t, tl); else x.lineTo(l, t);
  x.closePath();
}

/* ====================================================================
   The tile painter: one fused cell, lit from its neighbourhood
   ==================================================================== */

/* How a skin's material numbers become 2D shading. Each material in
   skins.js keeps its meaning: rough widens and softens the light, rim
   brightens grazing edges, refract makes the body translucent and adds a
   crisp glassy edge, sss lifts the interior, emissive lights the body
   from inside, speckle and fibre are baked grain. */
function lookOf(skin) {
  var m = skin.mat || {};
  var rough = m.rough === undefined ? 0.4 : m.rough;
  return {
    id: skin.id, mono: !!skin.mono,
    unlit: !!m.unlit, outline: !!m.outline,
    alpha: m.refract > 0 ? 0.93 : 1,
    hiA: 0.22 + (m.rim || 0) * 0.2 + (1 - rough) * 0.18,
    hiBlur: 0.07 + rough * 0.2,
    shA: 0.26 + rough * 0.42,
    shBlur: 0.08 + rough * 0.18,
    rimA: (m.rim || 0) * 0.55,
    gloss: (m.refract > 0 ? 0.62 : 0) + (m.sss >= 0.5 ? 0.7 : 0),
    sss: m.sss || 0, emissive: m.emissive || 0,
    speckle: m.speckle || 0, fibre: m.fibre || 0, frost: m.refract > 0 ? 1 : 0,
    bloomCap: m.bloomCap === undefined ? 1 : m.bloomCap
  };
}

/* the scratch canvases the painter reuses; sized to the tile */
var P = { s: 0, mask: null, mx: null, inv: null, ix: null, tile: null, tx: null, tmp: null, qx: null };
function painterFor(s) {
  if (P.s === s && P.mask) return P;
  P.s = s;
  P.mask = canvasOf(3 * s, 3 * s); P.mx = ctxOf(P.mask);
  P.inv = canvasOf(3 * s, 3 * s); P.ix = ctxOf(P.inv);
  P.tile = canvasOf(s, s); P.tx = ctxOf(P.tile);
  P.tmp = canvasOf(s, s); P.qx = ctxOf(P.tmp);
  return P;
}

/* grid: 9 flags, index j*3+i, (1,1) the cell being painted; y down */
function gridAt(grid, i, j) { return (i < 0 || j < 0 || i > 2 || j > 2) ? 0 : grid[j * 3 + i]; }

/* the union of the member cells, eroded by g on open edges, convex
   corners rounded by r, concave corners notched and filleted by g */
function buildMask(grid, s, g, r) {
  var x = P.mx, i, j, l, t, w, h;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = "source-over";
  x.clearRect(0, 0, 3 * s, 3 * s);
  x.fillStyle = "#fff";
  for (j = 0; j < 3; j++) for (i = 0; i < 3; i++) {
    if (!grid[j * 3 + i]) continue;
    var N = gridAt(grid, i, j - 1), S = gridAt(grid, i, j + 1), Wn = gridAt(grid, i - 1, j), E = gridAt(grid, i + 1, j);
    l = i * s + (Wn ? 0 : g); t = j * s + (N ? 0 : g);
    w = (i + 1) * s - (E ? 0 : g) - l; h = (j + 1) * s - (S ? 0 : g) - t;
    x.beginPath();
    roundRect(x, l, t, w, h, (!N && !Wn) ? r : 0, (!N && !E) ? r : 0, (!S && !E) ? r : 0, (!S && !Wn) ? r : 0);
    x.fill();
  }
  /* concave corners: both neighbours on a corner belong, the diagonal does not */
  for (j = 0; j < 3; j++) for (i = 0; i < 3; i++) {
    if (!grid[j * 3 + i]) continue;
    for (var k = 0; k < 4; k++) {
      var sx = (k === 1 || k === 2) ? 1 : -1, sy = (k >= 2) ? 1 : -1;    /* 0 NW, 1 NE, 2 SE, 3 SW */
      if (!gridAt(grid, i + sx, j) || !gridAt(grid, i, j + sy) || gridAt(grid, i + sx, j + sy)) continue;
      var cx = sx > 0 ? (i + 1) * s : i * s, cy = sy > 0 ? (j + 1) * s : j * s;
      /* the notch is the g×g square in that corner of the cell */
      var nx = sx > 0 ? cx - g : cx, ny = sy > 0 ? cy - g : cy;
      x.globalCompositeOperation = "destination-out";
      x.fillRect(nx, ny, g, g);
      x.globalCompositeOperation = "source-over";
      /* the fillet: material in the notch, inside a quarter circle about
         the notch's far corner, so the inside corner is rounded too */
      var px = cx - sx * g, py = cy - sy * g;           /* the concave corner */
      var ccx = cx, ccy = cy;                           /* the circle's centre */
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px, ccy);
      x.lineTo(ccx, py);
      x.closePath();
      x.save();
      x.clip();
      x.beginPath();
      x.rect(Math.min(px, ccx), Math.min(py, ccy), g, g);
      x.arc(ccx, ccy, g, 0, TAU, true);
      x.fill("evenodd");
      x.restore();
    }
  }
  /* the complement, for every inner effect */
  var v = P.ix;
  v.setTransform(1, 0, 0, 1, 0, 0);
  v.globalCompositeOperation = "source-over";
  v.clearRect(0, 0, 3 * s, 3 * s);
  v.fillStyle = "#fff";
  v.fillRect(0, 0, 3 * s, 3 * s);
  v.globalCompositeOperation = "destination-out";
  v.drawImage(P.mask, 0, 0);
  v.globalCompositeOperation = "source-over";
}

/* An inner light or shade along the shape's edges: the shadow of the
   complement, offset toward (ox, oy), kept only inside the shape. A
   positive oy lights the top edges; a negative one shades the bottom. */
function inner(col, alpha, blur, ox, oy, comp) {
  var s = P.s, q = P.qx;
  /* only the part of the neighbourhood whose shadow can reach the tile */
  var m = Math.min(s, Math.ceil(blur * 1.6 + Math.max(Math.abs(ox), Math.abs(oy))) + 2);
  q.globalCompositeOperation = "source-over";
  q.clearRect(0, 0, s, s);
  q.shadowColor = css(col, alpha);
  q.shadowBlur = blur;
  q.shadowOffsetX = ox + BIG;
  q.shadowOffsetY = oy;
  q.drawImage(P.inv, s - m, s - m, s + 2 * m, s + 2 * m, -m - BIG, -m, s + 2 * m, s + 2 * m);
  noShadow(q);
  q.globalCompositeOperation = "destination-in";
  q.drawImage(P.mask, s, s, s, s, 0, 0, s, s);
  q.globalCompositeOperation = "source-over";
  P.tx.globalCompositeOperation = comp || "source-over";
  P.tx.drawImage(P.tmp, 0, 0);
  P.tx.globalCompositeOperation = "source-over";
}
/* A crisp band inside the edges facing (dx, dy), from depth d1 to d2:
   the gloss strip on glass and candy, the outline on Ink. */
function band(col, alpha, d1, d2, dx, dy, comp) {
  var s = P.s, q = P.qx;
  q.globalCompositeOperation = "source-over";
  q.clearRect(0, 0, s, s);
  var m = Math.ceil(d2) + 2;
  q.drawImage(P.inv, s - m, s - m, s + 2 * m, s + 2 * m, -m + dx * d2, -m + dy * d2, s + 2 * m, s + 2 * m);
  if (d1 > 0) {
    q.globalCompositeOperation = "destination-out";
    q.drawImage(P.inv, s - m, s - m, s + 2 * m, s + 2 * m, -m + dx * d1, -m + dy * d1, s + 2 * m, s + 2 * m);
  }
  q.globalCompositeOperation = "destination-in";
  q.drawImage(P.mask, s, s, s, s, 0, 0, s, s);
  q.globalCompositeOperation = "source-in";
  q.fillStyle = css(col, alpha);
  q.fillRect(0, 0, s, s);
  q.globalCompositeOperation = "source-over";
  P.tx.globalCompositeOperation = comp || "source-over";
  P.tx.drawImage(P.tmp, 0, 0);
  P.tx.globalCompositeOperation = "source-over";
}
/* something drawn into tmp by "draw", clipped to the shape, composited */
function clipped(draw, comp) {
  var s = P.s, q = P.qx;
  q.globalCompositeOperation = "source-over";
  q.clearRect(0, 0, s, s);
  draw(q, s);
  q.globalCompositeOperation = "destination-in";
  q.drawImage(P.mask, s, s, s, s, 0, 0, s, s);
  q.globalCompositeOperation = "source-over";
  P.tx.globalCompositeOperation = comp || "source-over";
  P.tx.drawImage(P.tmp, 0, 0);
  P.tx.globalCompositeOperation = "source-over";
}

function drawGlyph(x, kind, s, col, alpha) {
  var c = s / 2, k = s * 0.15, lw = Math.max(1, s * 0.075);
  x.save();
  x.strokeStyle = css(col, alpha);
  x.fillStyle = css(col, alpha);
  x.lineWidth = lw;
  x.lineCap = "round";
  x.lineJoin = "round";
  x.beginPath();
  if (kind === "lines") {
    for (var i = -1; i <= 1; i++) { x.moveTo(c - k * 1.15, c + i * k * 0.8); x.lineTo(c + k * 1.15, c + i * k * 0.8); }
    x.stroke();
  } else if (kind === "dot") {
    x.arc(c, c, s * 0.1, 0, TAU);
    x.fill();
  } else if (kind === "triangle") {
    x.moveTo(c, c - k * 1.05); x.lineTo(c + k * 1.1, c + k * 0.85); x.lineTo(c - k * 1.1, c + k * 0.85);
    x.closePath();
    x.fill();
  } else if (kind === "slash") {
    x.moveTo(c - k, c + k); x.lineTo(c + k, c - k); x.stroke();
  } else if (kind === "backslash") {
    x.moveTo(c - k, c - k); x.lineTo(c + k, c + k); x.stroke();
  } else if (kind === "bracket") {
    x.moveTo(c - k, c - k); x.lineTo(c - k, c + k); x.lineTo(c + k, c + k); x.stroke();
  } else if (kind === "bracketR") {
    x.moveTo(c + k, c - k); x.lineTo(c + k, c + k); x.lineTo(c - k, c + k); x.stroke();
  }
  x.restore();
}

/* Paint one tile: piece type "type" (1..7, 8 silt), neighbour mask, at
   tile size s, into P.tile. "paint" carries the colour, look and glyph.
   Bit 16 of the mask is the "filled" variant: the diagonals between
   joined neighbours belong to the same body, as they always do in an O
   and can in a body a prepared lesson board joins into a 2×2 block. */
function paintTile(type, mask, s, paint) {
  var grid = [0, 0, 0, 0, 1, 0, 0, 0, 0];
  var N = !!(mask & MN), E = !!(mask & ME), S = !!(mask & MS), Wm = !!(mask & MW);
  if (N) grid[1] = 1;
  if (S) grid[7] = 1;
  if (Wm) grid[3] = 1;
  if (E) grid[5] = 1;
  /* only an O ever fills a 2×2 block of itself in play */
  if (type === 2 || (mask & 16)) {
    if (N && Wm) grid[0] = 1;
    if (N && E) grid[2] = 1;
    if (S && E) grid[8] = 1;
    if (S && Wm) grid[6] = 1;
  }
  var look = paint.look, base = paint.colors[type], silt = type === 8;
  var g = Math.max(1, Math.round(s * 0.045)), r = Math.max(2, Math.round(s * (look.unlit ? 0.16 : 0.2)));
  buildMask(grid, s, g, r);
  var t = P.tx;
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.globalCompositeOperation = "source-over";
  t.globalAlpha = 1;
  t.clearRect(0, 0, s, s);

  var body = base;
  if (!look.unlit) {
    if (look.frost) body = lighten(saturate(base, 0.92), 0.05);
    else if (look.sss >= 0.5) body = saturate(base, 1.06);
    else if (look.emissive > 0.4) body = lighten(base, look.emissive * 0.2);
    else if (look.speckle) body = darken(base, 0.03);
  }
  if (silt) body = base;
  /* the body */
  t.drawImage(P.mask, -s, -s);
  t.globalCompositeOperation = "source-in";
  t.fillStyle = css(body, silt ? 1 : look.alpha);
  t.fillRect(0, 0, s, s);
  t.globalCompositeOperation = "source-over";

  var rand = rng(type * 131 + mask * 17 + 7);
  if (!look.unlit) {
    /* light scattered under the surface: the edges sit deeper and more
       saturated, so the middle of the piece reads as lit from within */
    if (look.sss > 0) inner(saturate(darken(base, 0.28), 1.25), look.sss * 0.62, s * 0.26, 0, 0);
    /* paper lit from inside: bright where the paper is thin, the frame
       of the lantern darker and warmer round the edge */
    if (look.emissive > 0.4) {
      inner(darken(saturate(mix(base, [255, 170, 90], 0.25), 1.15), 0.4), 0.62, s * 0.26, 0, 0);
      inner(mix(base, [255, 236, 200], 0.6), 0.35, s * 0.06, 0, 0, "lighter");
    }
    /* the shaded side, away from the key light */
    inner(darken(silt ? base : saturate(base, 1.08), 0.62), look.shA, s * look.shBlur, -s * 0.035, -s * 0.085);
    /* the lit side: the top faces of a well seen from just above */
    inner(lighten(base, 0.72), look.hiA, s * look.hiBlur, s * 0.035, s * 0.085);
    /* the rim: grazing light all round the outside edge */
    if (look.rimA > 0) inner(lighten(base, 0.85), look.rimA, s * 0.045, 0, 0);
    /* a crisp gloss strip just inside the top edges: glass and candy */
    if (look.gloss > 0 && !silt) {
      band(WHITE, Math.min(0.75, look.gloss * 0.62), s * 0.07, s * 0.13, 0.35, 1);
      band(WHITE, Math.min(0.4, look.gloss * 0.3), s * 0.06, s * 0.1, 1, 0.2);
    }
    /* a soft spot of specular light in a top-left outside corner */
    if (look.gloss > 0 && !silt && !N && !Wm) {
      clipped(function (q, s2) {
        var gr = q.createRadialGradient(s2 * 0.3, s2 * 0.27, 0, s2 * 0.3, s2 * 0.27, s2 * 0.3);
        gr.addColorStop(0, "rgba(255,255,255," + (0.42 * look.gloss).toFixed(3) + ")");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        q.fillStyle = gr;
        q.fillRect(0, 0, s2, s2);
      });
    }
    /* grain */
    if (look.speckle > 0 || silt) {
      clipped(function (q, s2) {
        var n = Math.round(s2 * s2 * 0.018 * (silt ? 0.7 : look.speckle * 2)), i2;
        for (i2 = 0; i2 < n; i2++) {
          var dark = rand() < 0.55, rr = s2 * (0.012 + rand() * 0.022);
          q.fillStyle = dark ? "rgba(20,16,12," + (0.12 + rand() * 0.16).toFixed(3) + ")"
                             : "rgba(255,250,240," + (0.08 + rand() * 0.14).toFixed(3) + ")";
          q.beginPath(); q.arc(rand() * s2, rand() * s2, rr, 0, TAU); q.fill();
        }
        if (silt) {
          /* strata: fine horizontal layers that run on from tile to tile */
          for (i2 = 1; i2 < 4; i2++) {
            q.fillStyle = i2 % 2 ? "rgba(0,0,0,0.13)" : "rgba(255,255,255,0.06)";
            q.fillRect(0, s2 * (0.18 + i2 * 0.19), s2, Math.max(1, s2 * 0.03));
          }
        }
      });
    }
    if (look.fibre > 0 && !silt) {
      clipped(function (q, s2) {
        q.lineCap = "round";
        for (var i2 = 0; i2 < 9; i2++) {
          q.strokeStyle = "rgba(255,248,232," + (0.06 + rand() * 0.08 * look.fibre * 2).toFixed(3) + ")";
          q.lineWidth = Math.max(0.6, s2 * 0.012);
          var x0 = rand() * s2, y0 = rand() * s2, a = rand() * TAU, len = s2 * (0.18 + rand() * 0.3);
          q.beginPath();
          q.moveTo(x0, y0);
          q.quadraticCurveTo(x0 + Math.cos(a + 0.6) * len * 0.5, y0 + Math.sin(a + 0.6) * len * 0.5,
                             x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
          q.stroke();
        }
      });
    }
    if (look.frost > 0 && !silt) {
      clipped(function (q, s2) {
        for (var i2 = 0; i2 < s2 * 1.2; i2++) {
          q.fillStyle = "rgba(255,255,255," + (0.03 + rand() * 0.05).toFixed(3) + ")";
          q.fillRect(rand() * s2, rand() * s2, 1, 1);
        }
      });
    }
  }
  /* glyph: a low-contrast inner motif, the same in every cell of a piece */
  if (!silt && paint.glyphA > 0) {
    var kind = paint.glyphs[type];
    var gc = luma(body) > 0.36 ? darken(saturate(base, 1.2), 0.62) : lighten(base, 0.7);
    clipped(function (q, s2) { drawGlyph(q, kind, s2, gc, paint.glyphA); });
  }
  /* Ink: a 2 px light outline round the outside edge of each piece */
  if (look.outline) {
    var ow = Math.max(1, Math.round(paint.dpr * 2));
    var oc = paint.outline;
    band(oc, 1, 0, ow, 1, 0);
    band(oc, 1, 0, ow, -1, 0);
    band(oc, 1, 0, ow, 0, 1);
    band(oc, 1, 0, ow, 0, -1);
  }
  return P.tile;
}

/* every (type, mask) a piece or a fragment of one can ever show, so the
   atlas is baked for those and nothing else; anything unforeseen is
   painted on first sight */
function masksInUse() {
  var need = [], ty, ro, k;
  for (ty = 0; ty <= 8; ty++) need.push(new Uint8Array(16));
  for (ty = 1; ty <= 7; ty++) for (ro = 0; ro < 4; ro++) {
    var cells = shapeOf(ty, ro), ys = [];
    for (k = 0; k < 4; k++) if (ys.indexOf(cells[k][1]) < 0) ys.push(cells[k][1]);
    ys.sort(function (a, b) { return a - b; });
    /* every subset of rows cleared, the rest collapsed */
    for (var sub = 0; sub < (1 << ys.length); sub++) {
      var left = [];
      for (k = 0; k < 4; k++) {
        var yi = ys.indexOf(cells[k][1]);
        if (sub & (1 << yi)) continue;
        var below = 0;
        for (var b = 0; b < yi; b++) if (sub & (1 << b)) below++;
        left.push([cells[k][0], cells[k][1] - below]);
      }
      for (k = 0; k < left.length; k++) {
        var m = 0;
        for (var q = 0; q < left.length; q++) {
          var dx = left[q][0] - left[k][0], dy = left[q][1] - left[k][1];
          if (dx === 0 && dy === 1) m |= MN;
          if (dx === 1 && dy === 0) m |= ME;
          if (dx === 0 && dy === -1) m |= MS;
          if (dx === -1 && dy === 0) m |= MW;
        }
        need[ty][m] = 1;
      }
    }
  }
  need[8][0] = need[8][ME] = need[8][MW] = need[8][ME | MW] = 1;
  return need;
}

/* ====================================================================
   Sprites baked once: soft lights, the landing light, particles
   ==================================================================== */
function softDot(size, col, hard) {
  var c = canvasOf(size, size), x = ctxOf(c), h = size / 2;
  var g = x.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, css(col, 1));
  g.addColorStop(hard ? 0.35 : 0.18, css(col, hard ? 0.8 : 0.55));
  g.addColorStop(1, css(col, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}
function particleSprite(kind, col, size) {
  var c = canvasOf(size, size), x = ctxOf(c), h = size / 2, g;
  x.translate(h, h);
  if (kind === "bubble") {
    x.strokeStyle = css(col, 0.75); x.lineWidth = size * 0.07;
    x.beginPath(); x.arc(0, 0, h * 0.72, 0, TAU); x.stroke();
    x.fillStyle = css(col, 0.12); x.fill();
    x.fillStyle = css(WHITE, 0.85);
    x.beginPath(); x.arc(-h * 0.28, -h * 0.3, h * 0.14, 0, TAU); x.fill();
  } else if (kind === "drop") {
    g = x.createLinearGradient(0, -h, 0, h);
    g.addColorStop(0, css(col, 0)); g.addColorStop(0.7, css(col, 0.55)); g.addColorStop(1, css(col, 0.95));
    x.fillStyle = g;
    x.beginPath(); x.moveTo(0, -h * 0.95);
    x.quadraticCurveTo(h * 0.26, h * 0.35, 0, h * 0.62);
    x.quadraticCurveTo(-h * 0.26, h * 0.35, 0, -h * 0.95); x.fill();
  } else if (kind === "leaf" || kind === "petal") {
    x.fillStyle = css(col, 0.92);
    x.beginPath();
    if (kind === "leaf") {
      x.moveTo(-h * 0.85, 0);
      x.quadraticCurveTo(0, -h * 0.55, h * 0.85, 0);
      x.quadraticCurveTo(0, h * 0.55, -h * 0.85, 0);
    } else {
      x.moveTo(0, -h * 0.75);
      x.bezierCurveTo(h * 0.62, -h * 0.5, h * 0.5, h * 0.55, 0, h * 0.7);
      x.bezierCurveTo(-h * 0.5, h * 0.55, -h * 0.62, -h * 0.5, 0, -h * 0.75);
    }
    x.fill();
    x.strokeStyle = css(darken(col, 0.25), 0.5); x.lineWidth = size * 0.035;
    x.beginPath(); x.moveTo(kind === "leaf" ? -h * 0.7 : 0, kind === "leaf" ? 0 : -h * 0.55);
    x.lineTo(kind === "leaf" ? h * 0.7 : 0, kind === "leaf" ? 0 : h * 0.5); x.stroke();
  } else if (kind === "spark" || kind === "star") {
    g = x.createRadialGradient(0, 0, 0, 0, 0, h);
    g.addColorStop(0, css(WHITE, 1)); g.addColorStop(0.15, css(col, 0.85)); g.addColorStop(1, css(col, 0));
    x.fillStyle = g;
    x.beginPath(); x.arc(0, 0, h * (kind === "star" ? 0.5 : 0.42), 0, TAU); x.fill();
    x.fillStyle = css(col, 0.75);
    var arm = kind === "star" ? 0.95 : 0.8, wd = h * 0.07;
    x.beginPath();
    x.moveTo(-h * arm, 0); x.quadraticCurveTo(0, -wd, h * arm, 0); x.quadraticCurveTo(0, wd, -h * arm, 0);
    x.moveTo(0, -h * arm); x.quadraticCurveTo(-wd, 0, 0, h * arm); x.quadraticCurveTo(wd, 0, 0, -h * arm);
    x.fill();
  } else if (kind === "flake") {
    g = x.createRadialGradient(0, 0, 0, 0, 0, h);
    g.addColorStop(0, css(lighten(col, 0.5), 1)); g.addColorStop(0.45, css(col, 0.75)); g.addColorStop(1, css(col, 0));
    x.fillStyle = g;
    x.fillRect(-h, -h, size, size);
    x.fillStyle = css(lighten(col, 0.3), 0.9);
    x.beginPath(); roundRect(x, -h * 0.3, -h * 0.22, h * 0.6, h * 0.44, h * 0.1, h * 0.1, h * 0.1, h * 0.1); x.fill();
  } else {
    /* mote, plankton, snow, dust, light: a soft round glow */
    g = x.createRadialGradient(0, 0, 0, 0, 0, h);
    var core = kind === "snow" ? 0.55 : kind === "plankton" ? 0.3 : 0.22;
    g.addColorStop(0, css(lighten(col, 0.4), 1));
    g.addColorStop(core, css(col, 0.7));
    g.addColorStop(1, css(col, 0));
    x.fillStyle = g;
    x.fillRect(-h, -h, size, size);
  }
  return c;
}
/* which kinds glow (drawn additively) and which are things (drawn over) */
var ADDITIVE = { mote: 1, spark: 1, star: 1, plankton: 1, flake: 1, drop: 1, light: 1, dust: 1, snow: 0, bubble: 0, leaf: 0, petal: 0 };
var KINDS = ["light", "dust", "mote", "bubble", "drop", "leaf", "spark", "plankton", "flake", "snow", "petal", "star"];

/* ====================================================================
   The well itself: back wall, walls, lip and floor, per world
   ==================================================================== */

/* How each world's stone is dressed. Low contrast on purpose: the back
   wall sits behind the stack and must never compete with it. */
var DRESS = {
  dawn:      { courses: 1, joints: 1, speckle: 0.3, sheen: 0 },
  tide:      { courses: 1.5, joints: 0.6, speckle: 0.2, sheen: 0.3, round: 1 },
  rain:      { courses: 1, joints: 1, speckle: 0.6, moss: 1 },
  bamboo:    { lattice: 1, stalks: 1 },
  aurora:    { sheen: 1, courses: 0, speckle: 0.1 },
  moonpool:  { columns: 1, sheen: 0.6 },
  lanterns:  { planks: 1, sheen: 0.5 },
  snowfall:  { courses: 1, joints: 1, frost: 1, speckle: 0.2 },
  bells:     { speckle: 1, courses: 2, joints: 0.5 },
  starfield: { sheen: 1, sparkle: 1 }
};

function dressStone(x, l, t, w, h, C, world, base, alphaK, seed) {
  var d = DRESS[world.id] || DRESS.dawn, rand = rng(seed), i, j, y;
  var lo = css(darken(base, 0.55), 0.22 * alphaK), hi = css(lighten(base, 0.35), 0.10 * alphaK);
  x.save();
  x.beginPath(); x.rect(l, t, w, h); x.clip();
  if (d.courses) {
    var ch = C * d.courses;
    for (y = t + ch * 0.62, j = 0; y < t + h; y += ch, j++) {
      x.fillStyle = lo; x.fillRect(l, Math.round(y), w, Math.max(1, Math.round(C * 0.035)));
      x.fillStyle = hi; x.fillRect(l, Math.round(y) + Math.max(1, Math.round(C * 0.035)), w, 1);
      if (d.joints) {
        var step = C * (1.6 + d.joints), off = (j % 2) * step * 0.5 + rand() * C * 0.3;
        for (var jx = l + off; jx < l + w; jx += step + rand() * C * 0.4) {
          x.fillStyle = lo;
          x.fillRect(Math.round(jx), Math.round(y - ch), Math.max(1, Math.round(C * 0.03)), Math.round(ch));
        }
      }
    }
  }
  if (d.planks) {
    for (y = t + C * 0.8; y < t + h; y += C * 0.8) {
      x.fillStyle = lo; x.fillRect(l, Math.round(y), w, Math.max(1, Math.round(C * 0.03)));
    }
  }
  if (d.columns) {
    for (var cx = l + C * 0.9; cx < l + w; cx += C * (1.4 + rand() * 0.8)) {
      x.fillStyle = lo; x.fillRect(Math.round(cx), t, Math.max(1, Math.round(C * 0.03)), h);
    }
  }
  if (d.lattice) {
    x.strokeStyle = lo; x.lineWidth = Math.max(1, C * 0.035);
    x.beginPath();
    for (i = -h; i < w + h; i += C * 1.25) { x.moveTo(l + i, t); x.lineTo(l + i + h * 0.6, t + h); x.moveTo(l + i, t); x.lineTo(l + i - h * 0.6, t + h); }
    x.stroke();
  }
  if (d.stalks) {
    for (var sx = l + C * 0.5; sx < l + w; sx += C * 1.9) {
      x.fillStyle = hi; x.fillRect(Math.round(sx), t, Math.max(1, Math.round(C * 0.05)), h);
      for (y = t + rand() * C * 3; y < t + h; y += C * (2.5 + rand() * 2)) {
        x.fillStyle = lo; x.fillRect(Math.round(sx - C * 0.12), Math.round(y), Math.round(C * 0.3), Math.max(1, Math.round(C * 0.05)));
      }
    }
  }
  if (d.speckle) {
    var n = Math.round(w * h / (C * C) * 14 * d.speckle);
    for (i = 0; i < n; i++) {
      x.fillStyle = rand() < 0.5 ? css(darken(base, 0.6), 0.16 * alphaK) : css(lighten(base, 0.5), 0.09 * alphaK);
      x.fillRect(l + rand() * w, t + rand() * h, Math.max(1, C * 0.04), Math.max(1, C * 0.04));
    }
  }
  if (d.moss) {
    for (i = 0; i < w * h / (C * C) * 0.8; i++) {
      x.fillStyle = "rgba(96,140,84," + (0.025 + rand() * 0.04).toFixed(3) + ")";
      x.beginPath(); x.ellipse(l + rand() * w, t + rand() * h, C * (0.1 + rand() * 0.25), C * (0.05 + rand() * 0.1), 0, 0, TAU); x.fill();
    }
  }
  if (d.frost) {
    for (i = 0; i < w * h / (C * C) * 10; i++) {
      x.fillStyle = "rgba(235,242,255," + (0.05 + rand() * 0.1).toFixed(3) + ")";
      x.fillRect(l + rand() * w, t + rand() * h, Math.max(1, C * 0.03), Math.max(1, C * 0.03));
    }
  }
  if (d.sheen) {
    for (i = 0; i < 3; i++) {
      var sxx = l + rand() * w, g = x.createLinearGradient(sxx - C, t, sxx + C, t + C * 2);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(230,240,255," + (0.035 * d.sheen * alphaK).toFixed(3) + ")");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g;
      x.beginPath(); x.moveTo(sxx - C * 0.6, t); x.lineTo(sxx + C * 0.6, t); x.lineTo(sxx + C * 3.5, t + h); x.lineTo(sxx + C * 2.3, t + h); x.fill();
    }
  }
  if (d.sparkle) {
    for (i = 0; i < w * h / (C * C) * 1.5; i++) {
      x.fillStyle = "rgba(220,228,255," + (0.08 + rand() * 0.18).toFixed(3) + ")";
      x.fillRect(l + rand() * w, t + rand() * h, 1, 1);
    }
  }
  x.restore();
}

/* ====================================================================
   The renderer
   ==================================================================== */
function create(canvas, opts) {
  opts = opts || {};
  var ctx = null;
  try { ctx = canvas.getContext("2d", { alpha: false }); } catch (e) { ctx = null; }
  if (!ctx) ctx = canvas.getContext("2d");

  var R = { kind: "2d", tier: "2d", stats: { particles: 0, buildMs: 0, tiles: 0 } };

  /* ---------- geometry (device px) ---------- */
  var L = null, dpr = 1, devW = 1, devH = 1, cssW = 1, cssH = 1;
  var C = 1, S = 1, WX = 0, WY = 0, WWd = 1, WHd = 1, wallD = 1, lipD = 1, floorD = 1;
  var colX = new Float64Array(W + 1);
  var bodyL = 0, bodyT = 0, bodyW = 1, bodyH = 1, margin = 0;

  /* ---------- skin ---------- */
  var skin = null, palette = "skin", glyphPref = "off", look = null;
  var colors = [null, null, null, null, null, null, null, null, null];   /* rgb by type, 8 = silt */
  var paint = null;
  var atlas = null, ax = null, built = null;        /* built[type*32+mask] */
  /* each tile's shape in warm light, made the first time a clear needs it */
  var glowAtlas = null, gax = null, glowBuilt = null, clearTint = 0.2;
  var pieceSpr = [];                                /* [type*4+rot] = {c, minX, maxY, pad, w, h} */
  var prevSpr = [];                                 /* [slot][type] */
  var keepSpr = [];                                 /* [type] */
  var streakSpr = [];                               /* [type] hard-drop trail */
  var glowSpr = [];                                 /* [type] lantern glow under bodies */

  /* ---------- world ---------- */
  var world = null, worldB = null, worldMix = 1, worldT0 = -1, worldDur = 2.5;
  var wellA = null, wellB = null, nicheA = null, nicheB = null, nicheGlow = null, rimGlow = null;
  var keyRgb = [255, 226, 196], rimRgb = [159, 180, 255], partRgb = [242, 201, 160];
  var keyCss = "", keyCssSoft = "", poolSpr = null, railSpr = null, beadOn = null, beadOff = null, seamSpr = null;
  var partSpr = {};
  var dotWarm = null, dotPearl = null, bandSpr = null, vigSpr = null, dangerSpr = null;

  /* ---------- the sky, and the well scene ----------
     The sky is painted at half resolution, a few times a second (its
     motifs move at 0.12 Hz or slower), and stretched over the screen once
     a frame. The well scene is the well, the niche and the stack composed
     into one canvas the size of the well alone, recomposed only when one
     of them changes: a lock, a world fading into the next. Most frames
     are the sky, one copy of the well scene, and what moves on top. */
  var sky = null, skx = null, skyLast = -1, skyDirty = true, skyBroken = false, skyHz = 15;
  var ws = null, wsx = null, wsDirty = true, WSX = 0, WSY = 0, layerTop = 0;
  var tgtKey = "";
  /* ---------- the stack, as a layer ----------
     The board changes when a piece locks, not every frame, so the stack
     (shadows, glows and tiles) is painted into its own canvas and redrawn
     only when the board changes or while rows are settling. */
  var layer = null, lyx = null, shL = null, shx = null, LX0 = 0, LY0 = 0, layerDirty = true, layerAnim = false;
  var shadowSpr = null, ringSpr = null;
  var reactT0 = -1, reactDur = 4.5;

  /* ---------- options ---------- */
  var optLanding = true, optGrid = "faint", optLock = true, optMotion = "full", optJuice = "medium";
  var optNudge = 1, optSteady = false, optPreviews = 5;
  var quality = 1;                                  /* 1 full, 0.6 balanced, 0.35 simple */
  var pBudget = 120;

  /* ---------- clocks ---------- */
  var now = 0, fxNow = 0, holdLeft = 0, lastTime = -1, frameDt = 0;
  var paused = false;

  /* ---------- cadence ---------- */
  var dts = new Float32Array(120), dtsN = 0, dtsI = 0, slowRun = 0, lowPowerSaid = false, lowRun = 0;
  var sortBuf = new Float32Array(120);

  /* ---------- the active piece, as drawn ---------- */
  var aType = 0, aRot = 0, aY = 0, aHave = false;
  var dX = 0, dY = 0, yFrom = 0, yTo = 0, yT0 = -1, yDur = 0.05, lastRowT = 0;
  var rotT0 = -1, rotFrom = 0, glideT0 = -1, glideFX = 0, glideFY = 0, glideFS = 1;
  var bumpT0 = -1, bumpDir = 0, bumpRot = 0, glintT0 = -1, glintK = 0;
  var spawnFlag = false, rewindFlag = false, fromKeep = false, snapY = false, lastDx = 1, lastRotDir = 1;
  var softT0 = -1;

  /* ---------- previews and Keep ---------- */
  var advT0 = -1, holdSwap = false, keepT0 = -1, keepType = 0, keepFX = 0, keepFY = 0, keepPulseT0 = -1;

  /* ---------- the board, remembered ---------- */
  var snapB = new Uint8Array(400), snapP = new Uint16Array(400), snapOk = false;
  var rowOff = new Float32Array(TOPROW + 2), rowHide = new Uint8Array(TOPROW + 2);

  /* ---------- effects, all in fixed pools ---------- */
  function Clear() {
    this.on = false; this.t0 = -1; this.n = 0; this.rows = new Int8Array(4);
    this.cx = new Int8Array(40); this.cy = new Int8Array(40); this.cv = new Uint8Array(40); this.cp = new Uint16Array(40);
    this.cn = 0; this.kind = "single"; this.twist = false; this.mini = false; this.empty = false;
    this.waiting = false; this.settleT0 = -1; this.sync = 0; this.spawned = 0; this.parts = 0; this.warm = 0;
    this.tx = 4; this.ty = 1; this.gl = 1;
  }
  var clears = [new Clear(), new Clear(), new Clear(), new Clear()];
  function Ring() { this.on = false; this.t0 = -1; this.x = 0; this.y = 0; this.a = 0; }
  var rings = [new Ring(), new Ring(), new Ring(), new Ring()];
  function Ribbon() { this.on = false; this.t0 = -1; this.x = 0; this.y = 0; this.mini = false; this.dir = 1; }
  var ribbons = [new Ribbon(), new Ribbon()];
  function Trail() { this.on = false; this.t0 = -1; this.type = 1; this.n = 0; this.xs = new Int8Array(4); this.y0 = new Float32Array(4); this.y1 = new Float32Array(4); }
  var trails = [new Trail(), new Trail()];
  var squash = { on: false, t0: -1, pid: 0, base: 0 };
  var emptyFx = { on: false, t0: -1, a: 0, motes: 0 };
  var breatheOutro = { on: false, phase: 0, a: 0 };
  var shimmer = { t0: -1, a: 0 };
  var drainFx = { on: false, t0: -1, rows: 0, v: new Uint8Array(400), p: new Uint16Array(400) };
  var siltFx = { on: false, t0: -1, rows: 0 };
  var endFx = { on: false, t0: -1, v: new Uint8Array(400), p: new Uint16Array(400), top: 0, surface: false, gate: 1 };
  var ended = false;
  var filament = { on: false, a: 0, t0: -1, n: 0 };
  var big = { e: 0, t0: -1, dur: 0, kick: 0, rot: 0 };
  var kickY = 0, kickR = 0;
  var wa = 1, wb = 0, wc = 0, wd = 1, we = 0, wf = 0;     /* the well's transform this frame */
  var flashLog = new Float64Array(4), flashN = 0;
  var dangerS = 0;
  var lastLockX = 4, lastLockY = 1;

  /* ---------- particles: one struct of arrays ---------- */
  var pX = new Float32Array(PMAX), pY = new Float32Array(PMAX), pVX = new Float32Array(PMAX), pVY = new Float32Array(PMAX);
  var pAY = new Float32Array(PMAX), pAge = new Float32Array(PMAX), pLife = new Float32Array(PMAX), pSize = new Float32Array(PMAX);
  var pRot = new Float32Array(PMAX), pVR = new Float32Array(PMAX), pSway = new Float32Array(PMAX), pPh = new Float32Array(PMAX);
  var pSw = new Float32Array(PMAX), pCX = new Float32Array(PMAX), pCY = new Float32Array(PMAX);
  var pKind = new Uint8Array(PMAX), pOn = new Uint8Array(PMAX), pHead = 0, pLive = 0;
  var pA = new Float32Array(PMAX);           /* each particle's own opacity ceiling */
  var kindSpr = [];                                  /* by kind index, rebuilt per world */

  /* ================================================================
     building
     ================================================================ */
  function motionK() { return optMotion === "full" ? 1 : 0; }
  function juiceK() { return optSteady ? 0.5 : (JUICE[optJuice] || 1); }

  function rebuildAtlas() {
    if (!skin || !L) return;
    var t0 = Date.now();
    painterFor(S);
    paint.dpr = dpr;
    atlas = canvasOf(16 * S, 15 * S);
    ax = ctxOf(atlas);
    built = new Uint8Array(9 * 32);
    glowAtlas = null; gax = null; glowBuilt = new Uint8Array(9 * 32);
    var need = masksInUse(), n = 0;
    for (var ty = 1; ty <= 8; ty++) for (var m = 0; m < 16; m++) {
      if (!need[ty][m]) continue;
      bakeTile(ty, m);
      n++;
    }
    buildPieceSprites();
    layerDirty = true;
    R.stats.buildMs = Date.now() - t0;
    R.stats.tiles = n;
  }
  /* where a tile lives in the atlas: masks across, types down, and the
     filled variants of types 1..7 in rows 8..14 */
  function tileY(ty, m) { return ((m & 16) && ty < 8 ? 7 + ty : ty - 1) * S; }
  function bakeTile(ty, m) {
    paintTile(ty, m, S, paint);
    ax.clearRect((m & 15) * S, tileY(ty, m), S, S);
    ax.drawImage(P.tile, (m & 15) * S, tileY(ty, m));
    built[ty * 32 + m] = 1;
    if (glowBuilt) glowBuilt[ty * 32 + m] = 0;
  }
  /* A tile's silhouette filled with warm white, at the same place in a
     second atlas: laid over the tile itself, it turns that tile toward
     light without spilling past its rounded, fused edges. */
  function glowReady(ty, m) {
    tileReady(ty, m);
    if (glowBuilt[ty * 32 + m]) return;
    if (!glowAtlas) { glowAtlas = canvasOf(atlas.width, atlas.height); gax = ctxOf(glowAtlas); }
    var sx = (m & 15) * S, sy = tileY(ty, m);
    gax.clearRect(sx, sy, S, S);
    gax.globalCompositeOperation = "source-over";
    gax.drawImage(atlas, sx, sy, S, S, sx, sy, S, S);
    gax.globalCompositeOperation = "source-atop";
    gax.fillStyle = css(WARM, 1);
    gax.fillRect(sx, sy, S, S);
    gax.globalCompositeOperation = "source-over";
    glowBuilt[ty * 32 + m] = 1;
  }
  function tileReady(ty, m) {
    if (!built[ty * 32 + m]) { painterFor(S); bakeTile(ty, m); }
  }

  /* a whole piece, assembled from tiles, with an optional soft halo */
  function assemble(type, cells, size, pad, halo) {
    var minX = 99, maxX = -99, minY = 99, maxY = -99, k;
    for (k = 0; k < 4; k++) {
      if (cells[k][0] < minX) minX = cells[k][0];
      if (cells[k][0] > maxX) maxX = cells[k][0];
      if (cells[k][1] < minY) minY = cells[k][1];
      if (cells[k][1] > maxY) maxY = cells[k][1];
    }
    var cols = maxX - minX + 1, rows = maxY - minY + 1;
    var c = canvasOf(cols * S + 2 * pad, rows * S + 2 * pad), x = ctxOf(c);
    for (k = 0; k < 4; k++) {
      var m = 0, q;
      for (q = 0; q < 4; q++) {
        var dx = cells[q][0] - cells[k][0], dy = cells[q][1] - cells[k][1];
        if (dx === 0 && dy === 1) m |= MN;
        if (dx === 1 && dy === 0) m |= ME;
        if (dx === 0 && dy === -1) m |= MS;
        if (dx === -1 && dy === 0) m |= MW;
      }
      tileReady(type, m);
      x.drawImage(atlas, (m & 15) * S, tileY(type, m), S, S, pad + (cells[k][0] - minX) * S, pad + (maxY - cells[k][1]) * S, S, S);
    }
    if (halo > 0) {
      /* the shadow it throws on the back wall, like every block in the
         stack, and a soft halo in its own colour: the one thing that sets
         the piece in your hand apart from the stack */
      x.globalCompositeOperation = "destination-over";
      x.shadowColor = "rgba(0,0,0,0.42)";
      x.shadowBlur = C * 0.22;
      x.shadowOffsetX = BIG + C * 0.1;
      x.shadowOffsetY = C * 0.15;
      x.drawImage(c, -BIG, 0);
      noShadow(x);
      x.shadowColor = css(lighten(colors[type], 0.2), halo);
      x.shadowBlur = S * 0.55;
      x.shadowOffsetX = BIG;
      x.drawImage(c, -BIG, 0);
      noShadow(x);
      x.globalCompositeOperation = "source-over";
    }
    var out = { c: c, minX: minX, maxY: maxY, pad: pad, cols: cols, rows: rows };
    if (size !== S) out = shrink(out, size / S);
    return out;
  }
  /* downscale by halving steps, so a far preview is crisp, not aliased */
  function shrink(spr, k) {
    var src = spr.c, w = src.width, h = src.height, tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
    while (w / 2 > tw) {
      var hw = Math.max(1, Math.round(w / 2)), hh = Math.max(1, Math.round(h / 2));
      var mid = canvasOf(hw, hh), mx = ctxOf(mid);
      mx.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in mx) mx.imageSmoothingQuality = "high";
      mx.drawImage(src, 0, 0, hw, hh);
      src = mid; w = hw; h = hh;
    }
    var c = canvasOf(tw, th), x = ctxOf(c);
    x.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in x) x.imageSmoothingQuality = "high";
    x.drawImage(src, 0, 0, tw, th);
    return { c: c, minX: spr.minX, maxY: spr.maxY, pad: spr.pad * k, cols: spr.cols, rows: spr.rows, k: k };
  }

  /* Whole-piece sprites are made when first needed, and the rest in the
     quiet milliseconds at the end of frames (see idleBake), so changing
     the skin pays only for the tiles. Previews and the kept piece are the
     piece in your hand, scaled down, halo and all. */
  function pieceSprite(ty, ro) {
    var k = ty * 4 + (ro & 3), sp = pieceSpr[k];
    if (!sp) sp = pieceSpr[k] = assemble(ty, shapeOf(ty, ro & 3), S, Math.round(S * 0.6),
                                         look.unlit ? 0.25 : (look.emissive > 0.4 ? 0.6 : 0.42));
    return sp;
  }
  function prevSprite(slot, ty) {
    var row = prevSpr[slot] || (prevSpr[slot] = []), sp = row[ty];
    if (!sp) sp = row[ty] = shrink(pieceSprite(ty, 0), L.next[slot].s * L.cell * dpr / S);
    return sp;
  }
  function keepSprite(ty) {
    var sp = keepSpr[ty];
    if (!sp) sp = keepSpr[ty] = shrink(pieceSprite(ty, 0), L.keep.s * L.cell * dpr / S);
    return sp;
  }
  var bakeNext = 0;
  function idleBake() {
    var nPrev = L.next ? Math.min(L.next.length, optPreviews) : 0;
    var total = 28 + 7 * nPrev + (L.keep ? 7 : 0), t0 = Date.now();
    while (bakeNext < total && Date.now() - t0 < 3) {
      var i = bakeNext++;
      if (i < 28) pieceSprite(1 + (i >> 2), i & 3);
      else if (i < 28 + 7 * nPrev) prevSprite(Math.floor((i - 28) / 7), 1 + (i - 28) % 7);
      else keepSprite(1 + (i - 28 - 7 * nPrev));
    }
  }
  function buildPieceSprites() {
    var ty;
    pieceSpr = []; prevSpr = []; keepSpr = []; bakeNext = 0;
    /* hard-drop trails and lantern glows, one per colour */
    streakSpr = []; glowSpr = [];
    for (ty = 1; ty <= 7; ty++) {
      var sc = canvasOf(8, 128), sx = ctxOf(sc), g = sx.createLinearGradient(0, 0, 0, 128);
      var col = lighten(colors[ty], 0.45);
      g.addColorStop(0, css(col, 0)); g.addColorStop(0.75, css(col, 0.5)); g.addColorStop(1, css(col, 0.9));
      sx.fillStyle = g; sx.fillRect(0, 0, 8, 128);
      streakSpr[ty] = sc;
      if (look.emissive > 0.4) glowSpr[ty] = softDot(Math.round(S * 2.2), lighten(colors[ty], 0.25), false);
    }
  }

  /* The well, for one world: a shaft of the world's stone seen from just
     above (brief §7.5). Depth comes from light, not from lines: the key
     light falls in at the mouth and dies away down the shaft, the inner
     faces of the walls catch it on one side and hold shade on the other,
     the coping on the wall tops and the floor slab show their lit top
     faces, and the whole well casts a soft shadow on the sky behind it. */
  function buildWell(wd) {
    if (!L || !wd) return null;
    var c = canvasOf(bodyW + 2 * margin, bodyH + 2 * margin), x = ctxOf(c);
    var o = margin, base = hexRgb(wd.wall), key = hexRgb(wd.key), rim = hexRgb(wd.rim);
    var hor = hexRgb(wd.sky.horizon);
    var faceL = o + wallD, faceT = o + lipD, faceW = WWd, faceH = WHd;
    var back = mix(darken(base, 0.72), hor, 0.26);
    var px1 = Math.max(1, Math.round(dpr));
    var g, i, j, s;

    /* the soft shadow the whole well casts on the backdrop */
    x.save();
    x.shadowColor = "rgba(0,0,0,0.6)";
    x.shadowBlur = C * 1.1;
    x.shadowOffsetY = C * 0.18;
    x.fillStyle = css(darken(base, 0.6));
    x.fillRect(o, o, bodyW, bodyH);
    x.restore();

    /* the back wall: lit at the mouth, falling into shade further down */
    g = x.createLinearGradient(0, o, 0, o + lipD + faceH);
    g.addColorStop(0, css(mix(back, key, 0.12)));
    g.addColorStop(0.28, css(back));
    g.addColorStop(1, css(darken(back, 0.42)));
    x.fillStyle = g;
    x.fillRect(faceL, o, faceW, faceH + lipD);
    dressStone(x, faceL, o, faceW, faceH + lipD, C, wd, back, 0.7, 11);
    /* the light that falls in at the mouth */
    g = x.createRadialGradient(faceL + faceW * 0.42, o - C * 0.5, C, faceL + faceW * 0.42, o - C * 0.5, faceH * 0.55);
    g.addColorStop(0, css(key, 0.13)); g.addColorStop(0.5, css(key, 0.05)); g.addColorStop(1, css(key, 0));
    x.fillStyle = g;
    x.fillRect(faceL, o, faceW, faceH + lipD);
    /* shade gathering in the deep corners */
    g = x.createRadialGradient(faceL + faceW / 2, o + lipD + faceH * 0.4, faceW * 0.4, faceL + faceW / 2, o + lipD + faceH * 0.55, faceH * 0.62);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.38)");
    x.fillStyle = g;
    x.fillRect(faceL, o, faceW, faceH + lipD);

    /* the inner faces of the walls, seen a little from inside: the right
       one catches the key light, the left one is in its own shade */
    var isw = Math.max(2, Math.round(C * 0.16));
    g = x.createLinearGradient(faceL, 0, faceL + isw * 2.2, 0);
    g.addColorStop(0, "rgba(0,0,0,0.55)"); g.addColorStop(0.45, "rgba(0,0,0,0.22)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(faceL, o, isw * 2.2, faceH + lipD);
    g = x.createLinearGradient(faceL + faceW, 0, faceL + faceW - isw * 2.2, 0);
    g.addColorStop(0, css(mix(lighten(back, 0.25), key, 0.25), 0.55)); g.addColorStop(0.45, css(mix(back, key, 0.15), 0.25));
    g.addColorStop(1, css(back, 0));
    x.fillStyle = g; x.fillRect(faceL + faceW - isw * 2.2, o, isw * 2.2, faceH + lipD);
    /* where the back wall meets the floor, and the lip's shadow below it */
    g = x.createLinearGradient(0, faceT + faceH, 0, faceT + faceH - C * 1.2);
    g.addColorStop(0, "rgba(0,0,0,0.45)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(faceL, faceT + faceH - C * 1.2, faceW, C * 1.2);
    g = x.createLinearGradient(0, o + lipD * 0.35, 0, o + lipD + C * 0.8);
    g.addColorStop(0, "rgba(0,0,0,0.3)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(faceL, o + lipD * 0.35, faceW, lipD * 0.65 + C * 0.8);

    /* the grid: the stack stays readable by spacing and shading, so the
       grid is only ever a whisper */
    if (optGrid !== "off") {
      var ga = optGrid === "full" ? 0.07 : 0.12;
      x.fillStyle = css(mix(key, WHITE, 0.3), ga);
      if (optGrid === "full") {
        for (i = 1; i < W; i++) x.fillRect(Math.round(faceL + i * C), faceT, 1, faceH);
        for (j = 1; j < VIS; j++) x.fillRect(faceL, Math.round(faceT + j * C), faceW, 1);
      } else {
        var dot = Math.max(1, Math.round(dpr * 1.2));
        for (i = 1; i < W; i++) for (j = 1; j < VIS; j++) {
          x.fillRect(Math.round(faceL + i * C - dot / 2), Math.round(faceT + j * C - dot / 2), dot, dot);
        }
      }
    }

    /* the back rim at the top of the shaft: its top face catches the light */
    var capH = Math.max(2, Math.round(C * 0.12));
    x.fillStyle = css(mix(lighten(base, 0.1), key, 0.22));
    x.fillRect(faceL, o, faceW, capH);
    x.fillStyle = css(darken(base, 0.38));
    x.fillRect(faceL, o + capH, faceW, Math.max(1, Math.round(C * 0.05)));

    /* the side walls: the world's stone, lit from above, rim light down
       the edge that faces the well */
    var sides = [o, o + wallD + faceW];
    for (s = 0; s < 2; s++) {
      var wl = sides[s];
      g = x.createLinearGradient(0, o, 0, o + bodyH);
      g.addColorStop(0, css(mix(base, key, 0.14)));
      g.addColorStop(0.45, css(darken(base, 0.1)));
      g.addColorStop(1, css(darken(base, 0.45)));
      x.fillStyle = g;
      x.fillRect(wl, o, wallD, bodyH);
      dressStone(x, wl, o, wallD, bodyH, C, wd, base, 1.6, 31 + s);
      g = x.createLinearGradient(wl, 0, wl + wallD, 0);
      g.addColorStop(0, s === 0 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.25)");
      g.addColorStop(1, s === 0 ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.06)");
      x.fillStyle = g; x.fillRect(wl, o, wallD, bodyH);
      x.fillStyle = css(rim, 0.5);
      x.fillRect(s === 0 ? wl + wallD - px1 : wl, o + capH, px1, bodyH - capH - floorD);
      x.fillStyle = "rgba(0,0,0,0.4)";
      x.fillRect(s === 0 ? wl : wl + wallD - px1, o, px1, bodyH);
    }
    /* the coping: a stone laid along each wall top, a touch wider than the
       wall, its top face lit and a little shadow under its lip */
    var cope = Math.max(1, Math.round(C * 0.07)), copeH = Math.max(3, Math.round(C * 0.22));
    for (s = 0; s < 2; s++) {
      var cl = sides[s] - cope, cw = wallD + cope * 2;
      x.save();
      x.shadowColor = "rgba(0,0,0,0.45)"; x.shadowBlur = C * 0.15; x.shadowOffsetY = C * 0.06;
      x.fillStyle = css(mix(base, key, 0.2));
      x.fillRect(cl, o - Math.round(C * 0.04), cw, copeH);
      x.restore();
      x.fillStyle = css(mix(lighten(base, 0.3), key, 0.35));
      x.fillRect(cl, o - Math.round(C * 0.04), cw, Math.max(1, Math.round(copeH * 0.42)));
      x.fillStyle = "rgba(255,255,255,0.18)";
      x.fillRect(cl, o - Math.round(C * 0.04), cw, px1);
    }
    /* the floor slab: a lit top face, a front face in shade */
    var ft = faceT + faceH, fTop = Math.max(2, Math.round(floorD * 0.42));
    x.fillStyle = css(mix(lighten(base, 0.06), key, 0.2));
    x.fillRect(o - cope, ft, bodyW + 2 * cope, fTop);
    x.fillStyle = "rgba(255,255,255,0.12)";
    x.fillRect(o - cope, ft + fTop - px1, bodyW + 2 * cope, px1);
    g = x.createLinearGradient(0, ft + fTop, 0, ft + floorD);
    g.addColorStop(0, css(darken(base, 0.2))); g.addColorStop(1, css(darken(base, 0.58)));
    x.fillStyle = g;
    x.fillRect(o - cope, ft + fTop, bodyW + 2 * cope, floorD - fTop);
    x.fillStyle = css(rim, 0.25);
    x.fillRect(faceL, ft, faceW, px1);
    return { c: c, id: wd.id };
  }

  /* the Keep niche: an alcove cut into a block of the same stone. Beside
     a wide well the block reaches across to the wall, as the 3D well's
     does, so the niche is part of the stone rather than a box beside it;
     the alcove stays where the layout put the niche. */
  function buildNiche(wd) {
    if (!L || !L.keep || !wd) return null;
    var k = L.keep, w0 = k.w * dpr, h = k.h * dpr, o = Math.round(C * 0.5);
    var reach = L.shape === "wide" && L.well ? Math.max(0, (L.well.x - (L.wall || 0)) - (k.x + k.w)) * dpr : 0;
    var w = w0 + reach;
    var c = canvasOf(w + 2 * o, h + 2 * o), x = ctxOf(c);
    var base = hexRgb(wd.wall), key = hexRgb(wd.key), hor = hexRgb(wd.sky.horizon);
    var r = Math.min(w, h) * 0.2;
    x.save();
    x.shadowColor = "rgba(0,0,0,0.5)"; x.shadowBlur = C * 0.6; x.shadowOffsetY = C * 0.1;
    var g = x.createLinearGradient(0, o, 0, o + h);
    g.addColorStop(0, css(mix(base, key, 0.14))); g.addColorStop(1, css(darken(base, 0.4)));
    x.fillStyle = g;
    x.beginPath(); roundRect(x, o, o, w, h, r, r, r, r); x.fill();
    x.restore();
    x.save();
    x.beginPath(); roundRect(x, o, o, w, h, r, r, r, r); x.clip();
    dressStone(x, o, o, w, h, C, wd, base, 1.4, 77);
    x.fillStyle = css(mix(lighten(base, 0.25), key, 0.3));
    x.fillRect(o, o, w, Math.max(1, Math.round(C * 0.1)));
    x.restore();
    /* the recess */
    var inset = Math.max(2, Math.round(Math.min(w0, h) * 0.12)), rw = w0 - 2 * inset, rh = h - 2 * inset, rr = r * 0.7;
    /* the alcove is stone in its own shade, not a hole: what is kept in
       it, and the light that pools there when Keep is free, read against
       it the way they would in a niche in a wall */
    var back = mix(darken(base, 0.58), hor, 0.3);
    x.fillStyle = css(back);
    x.beginPath(); roundRect(x, o + inset, o + inset, rw, rh, rr, rr, rr, rr); x.fill();
    x.save();
    x.beginPath(); roundRect(x, o + inset, o + inset, rw, rh, rr, rr, rr, rr); x.clip();
    x.shadowColor = "rgba(0,0,0,0.5)"; x.shadowBlur = C * 0.35; x.shadowOffsetY = C * 0.12; x.shadowOffsetX = C * 0.04;
    x.lineWidth = C * 0.4;
    x.strokeStyle = "#000";
    x.beginPath(); roundRect(x, o + inset - C * 0.2, o + inset - C * 0.2, rw + C * 0.4, rh + C * 0.4, rr, rr, rr, rr); x.stroke();
    x.restore();
    /* the shelf the piece rests on */
    x.fillStyle = css(mix(base, key, 0.25), 0.55);
    x.fillRect(o + inset + rr, o + inset + rh - Math.max(1, Math.round(dpr)), rw - 2 * rr, Math.max(1, Math.round(dpr)));
    return { c: c, id: wd.id, o: o, inset: inset };
  }

  function buildWorldSprites() {
    if (!world || !L) return;
    var w = worldMix >= 0.5 && worldB ? worldB : world;
    keyRgb = hexRgb(w.key); rimRgb = hexRgb(w.rim); partRgb = hexRgb(w.particle ? w.particle.color : "#F2C9A0");
    keyCss = css(lighten(keyRgb, 0.35), 0.9);
    keyCssSoft = css(keyRgb, 0.32);
    poolSpr = softDot(64, keyRgb, false);
    railSpr = (function () {
      var c = canvasOf(4, 128), x = ctxOf(c), g = x.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, css(keyRgb, 0.8)); g.addColorStop(0.6, css(keyRgb, 0.3)); g.addColorStop(1, css(keyRgb, 0.06));
      x.fillStyle = g; x.fillRect(0, 0, 4, 128);
      return c;
    })();
    /* lit beads are light in the stone, the key light warmed toward the rim */
    beadOn = softDot(32, mix(keyRgb, rimRgb, 0.3), true);
    beadOff = (function () {
      var c = canvasOf(32, 32), x = ctxOf(c);
      x.fillStyle = css(mix(hexRgb(w.wall), WHITE, 0.15), 0.55);
      x.beginPath(); x.arc(16, 16, 6, 0, TAU); x.fill();
      x.strokeStyle = "rgba(0,0,0,0.4)"; x.lineWidth = 1.5; x.stroke();
      return c;
    })();
    seamSpr = softDot(64, rimRgb, false);
    ringSpr = (function () {
      var c = canvasOf(128, 128), x = ctxOf(c), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      var col = mix(keyRgb, WHITE, 0.3);
      g.addColorStop(0, css(col, 0)); g.addColorStop(0.7, css(col, 0)); g.addColorStop(0.86, css(col, 1));
      g.addColorStop(0.93, css(col, 0.35)); g.addColorStop(1, css(col, 0));
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      return c;
    })();
    var kinds = KINDS, i, kind = w.particle ? w.particle.kind : "mote";
    kindSpr = [];
    for (i = 0; i < kinds.length; i++) {
      var col = kinds[i] === "light" ? WARM : kinds[i] === "dust" ? mix(keyRgb, WHITE, 0.4) : partRgb;
      kindSpr[i] = particleSprite(kinds[i], col, 48);
    }
    partSpr.world = KINDS.indexOf(kind);
    if (partSpr.world < 0) partSpr.world = 2;
    /* Breath breathes the shaft's own light, as the 3D well does: light
       falling in at the mouth and fading down the shaft, never a lit
       outline round the well */
    rimGlow = (function () {
      var c = canvasOf(Math.max(4, Math.round(bodyW / 4)), Math.max(16, Math.round(bodyH / 4))), x = ctxOf(c);
      var g = x.createLinearGradient(0, 0, 0, c.height);
      var lc = mix(keyRgb, hexRgb(w.sky.top), 0.25);
      g.addColorStop(0, css(lc, 0.5)); g.addColorStop(0.35, css(lc, 0.2)); g.addColorStop(1, css(lc, 0.06));
      x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
      return { c: c, m: 0 };
    })();
    /* Keep is free: a lamp in the niche. Light pools on the sill and
       climbs the back of the alcove; only the faintest edge of it reaches
       the rim, so the niche never reads as an outlined box */
    nicheGlow = null;
    if (L.keep) {
      var k = L.keep, kw = k.w * dpr, kh = k.h * dpr, mg = Math.round(C * 0.6);
      var inset = Math.max(2, Math.round(Math.min(kw, kh) * 0.12)), rr = Math.min(kw, kh) * 0.14;
      var c = canvasOf(kw + 2 * mg, kh + 2 * mg), x = ctxOf(c);
      var rx0 = mg + inset, ry0 = mg + inset, rw2 = kw - 2 * inset, rh2 = kh - 2 * inset;
      var lamp = mix(keyRgb, rimRgb, 0.3);
      x.save();
      x.beginPath(); roundRect(x, rx0, ry0, rw2, rh2, rr, rr, rr, rr); x.clip();
      var g = x.createRadialGradient(rx0 + rw2 / 2, ry0 + rh2, 0, rx0 + rw2 / 2, ry0 + rh2, Math.max(rw2 * 0.6, rh2 * 1.1));
      g.addColorStop(0, css(lamp, 0.6)); g.addColorStop(0.45, css(lamp, 0.24)); g.addColorStop(1, css(lamp, 0));
      x.fillStyle = g; x.fillRect(rx0, ry0, rw2, rh2);
      x.restore();
      x.strokeStyle = css(lighten(rimRgb, 0.2), 0.2); x.lineWidth = Math.max(1, dpr);
      x.beginPath(); roundRect(x, rx0, ry0, rw2, rh2, rr, rr, rr, rr); x.stroke();
      nicheGlow = { c: c, m: mg };
    }
  }

  function buildStatic() {
    dotWarm = softDot(64, WARM, false);
    dotPearl = softDot(48, PEARL, true);
    bandSpr = (function () {
      var c = canvasOf(64, 64), x = ctxOf(c);
      var g = x.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, css(WARM, 0)); g.addColorStop(0.3, css(WARM, 0.8)); g.addColorStop(0.5, css(WARM, 1));
      g.addColorStop(0.7, css(WARM, 0.8)); g.addColorStop(1, css(WARM, 0));
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      x.globalCompositeOperation = "destination-in";
      g = x.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.08, "rgba(0,0,0,1)");
      g.addColorStop(0.92, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      return c;
    })();
    vigSpr = (function () {
      var c = canvasOf(256, 256), x = ctxOf(c), g = x.createRadialGradient(128, 128, 60, 128, 128, 182);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(2,3,8,1)");
      x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      return c;
    })();
    /* danger: cool and grey, never red */
    dangerSpr = (function () {
      var c = canvasOf(256, 256), x = ctxOf(c), g = x.createRadialGradient(128, 128, 70, 128, 128, 182);
      g.addColorStop(0, "rgba(40,56,84,0)"); g.addColorStop(0.6, "rgba(40,56,84,0.45)"); g.addColorStop(1, "rgba(28,40,64,1)");
      x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      return c;
    })();
  }

  function rebuildWells() {
    if (!L) return;
    wellA = world ? buildWell(world) : null;
    wellB = worldB && worldMix < 1 ? buildWell(worldB) : null;
    nicheA = world ? buildNiche(world) : null;
    nicheB = worldB && worldMix < 1 ? buildNiche(worldB) : null;
    buildWorldSprites();
    wsDirty = true;
  }

  /* ================================================================
     the public face
     ================================================================ */
  R.resize = function (w, h, ratio, lay) {
    cssW = Math.max(1, w); cssH = Math.max(1, h);
    dpr = Math.max(0.5, Math.min(2, ratio || 1));
    if (!lay && root.Layout) lay = root.Layout.compute(cssW, cssH, { dpr: dpr, previews: optPreviews });
    if (!lay) return;
    L = lay;
    devW = Math.max(1, Math.round(cssW * dpr)); devH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== devW) canvas.width = devW;
    if (canvas.height !== devH) canvas.height = devH;
    C = L.cell * dpr;
    S = Math.max(4, Math.round(C));
    WX = Math.round(L.well.x * dpr); WY = Math.round(L.well.y * dpr);
    WWd = Math.round(W * C); WHd = Math.round(VIS * C);
    for (var i = 0; i <= W; i++) colX[i] = Math.round(WX + i * C);
    wallD = Math.max(2, Math.round((L.wall || Math.max(3, L.cell * 0.22)) * dpr));
    lipD = Math.max(2, Math.round((L.lip || L.cell * 0.5) * dpr));
    floorD = Math.max(2, Math.round((L.floor || L.cell * 0.3) * dpr));
    bodyL = WX - wallD; bodyT = WY - lipD; bodyW = WWd + 2 * wallD; bodyH = WHd + lipD + floorD;
    margin = Math.round(C * 1.2);
    var sw = Math.max(1, Math.round(cssW * 0.5)), sh = Math.max(1, Math.round(cssH * 0.5));
    if (!sky) { sky = canvasOf(sw, sh); skx = ctxOf(sky); }
    else if (sky.width !== sw || sky.height !== sh) { sky.width = sw; sky.height = sh; }
    skyGrads = {};
    skyDirty = true;

    LX0 = Math.round(WX - C); LY0 = Math.round(cellTop(TOPROW - 1) - C);
    var lw = Math.round(WWd + 2 * C), lh = Math.round(WY + WHd + C * 1.5) - LY0;
    var hw = Math.ceil(lw / 2), hh = Math.ceil(lh / 2);
    if (!layer) { layer = canvasOf(lw, lh); lyx = ctxOf(layer); shL = canvasOf(hw, hh); shx = ctxOf(shL); }
    else { layer.width = lw; layer.height = lh; shL.width = hw; shL.height = hh; }
    layerDirty = true;
    /* the well scene covers the well with its shadow, the stack layer and
       the niche, and nothing else */
    var x0 = Math.min(bodyL - margin, LX0), y0 = Math.min(bodyT - margin, LY0);
    var x1 = Math.max(bodyL + bodyW + margin, LX0 + lw), y1 = Math.max(bodyT + bodyH + margin, LY0 + lh);
    if (L.keep) {
      var ko = Math.round(C * 0.5), kx = Math.round(L.keep.x * dpr), ky = Math.round(L.keep.y * dpr);
      x0 = Math.min(x0, kx - ko); y0 = Math.min(y0, ky - ko);
      x1 = Math.max(x1, kx + Math.round(L.keep.w * dpr) + ko); y1 = Math.max(y1, ky + Math.round(L.keep.h * dpr) + ko);
    }
    WSX = Math.floor(x0); WSY = Math.floor(y0);
    var wsw = Math.ceil(x1) - WSX, wsh = Math.ceil(y1) - WSY;
    if (!ws) { ws = canvasOf(wsw, wsh); wsx = ctxOf(ws); }
    else { ws.width = wsw; ws.height = wsh; }
    wsDirty = true;
    /* a square core, so the shadows of neighbouring cells merge into one
       soft shape with no seam between them */
    shadowSpr = (function () {
      var pad = Math.round(C * 0.35), c = canvasOf(S + 2 * pad, S + 2 * pad), x = ctxOf(c);
      x.shadowColor = "rgba(0,0,0,1)"; x.shadowBlur = C * 0.22; x.shadowOffsetX = BIG;
      x.fillStyle = "#000";
      x.fillRect(pad - BIG, pad, S, S);
      c.pad = pad;
      return c;
    })();
    if (!dotWarm) buildStatic();
    if (skin) rebuildAtlas();
    rebuildWells();
  };

  R.setSkin = function (sk, pal, glyphs) {
    var Sk = root.Skins;
    skin = Sk ? Sk.get(sk) : sk;
    if (!skin) return;
    palette = pal === "safe" ? "safe" : "skin";
    glyphPref = glyphs || "off";
    look = lookOf(skin);
    var res = Sk ? Sk.resolve(skin, palette) : (skin.colors || {});
    for (var t = 1; t <= 7; t++) colors[t] = hexRgb(res[LETTERS[t]]);
    colors[8] = hexRgb(res.silt || skin.silt || "#5A6470");
    clearTint = tintFor(colors, 0.075, 0.35);
    var mode = Sk && Sk.glyphs ? Sk.glyphs(skin, glyphPref) : glyphPref;
    var gl = (Sk && Sk.GLYPHS) || { I: "lines", O: "dot", T: "triangle", S: "slash", Z: "backslash", J: "bracket", L: "bracketR" };
    var glyphs2 = [];
    for (t = 1; t <= 7; t++) glyphs2[t] = gl[LETTERS[t]];
    paint = {
      look: look, colors: colors, glyphs: glyphs2, dpr: dpr,
      glyphA: mode === "strong" ? (look.unlit ? 0.62 : 0.55) : mode === "subtle" ? 0.26 : 0,
      outline: [246, 243, 236]
    };
    if (L) rebuildAtlas();
  };

  R.setWorld = function (wd, instant) {
    var Wd = root.Worlds;
    if (typeof wd === "string" && Wd) wd = Wd.get(wd);
    if (!wd) return;
    if (!world || instant) {
      world = wd; worldB = null; worldMix = 1;
      if (L) rebuildWells();
      skyDirty = true;
      return;
    }
    if (wd.id === (worldB || world).id) return;
    if (worldB) { world = worldB; wellA = wellB; nicheA = nicheB; }
    worldB = wd;
    worldMix = 0;
    worldT0 = -1;
    worldDur = optMotion === "still" ? 0.15 : 2.5;
    if (L) {
      wellB = buildWell(worldB);
      nicheB = buildNiche(worldB);
    }
    skyDirty = true;
  };

  R.setOptions = function (o) {
    if (!o) return;
    var regrid = false;
    if (o.landing !== undefined) optLanding = !!o.landing;
    if (o.grid !== undefined && o.grid !== optGrid) { optGrid = o.grid; regrid = true; }
    if (o.lockLight !== undefined) optLock = !!o.lockLight;
    if (o.motion !== undefined) optMotion = o.motion === "still" || o.motion === "gentle" ? o.motion : "full";
    if (o.juice !== undefined) optJuice = JUICE[o.juice] ? o.juice : "medium";
    if (o.nudge !== undefined) optNudge = clamp(+o.nudge || 0, 0, 1);
    if (o.steady !== undefined) optSteady = !!o.steady;
    if (o.previews !== undefined) optPreviews = clamp(o.previews | 0, 0, 6);
    if (regrid && L) { wellA = world ? buildWell(world) : null; if (worldB) wellB = buildWell(worldB); wsDirty = true; }
  };

  R.setTier = function (name) {
    quality = name === "simple" ? 0.35 : name === "balanced" ? 0.6 : 1;
    skyHz = name === "simple" ? 0 : name === "balanced" ? 10 : 15;
    pBudget = Math.round(120 * quality);
  };
  R.setTier(opts.tier || "full");

  R.dispose = function () {
    if (canvas.removeEventListener) canvas.removeEventListener("contextrestored", restored);
    atlas = null; ax = null; glowAtlas = null; gax = null; pieceSpr = []; prevSpr = []; keepSpr = [];
    wellA = wellB = nicheA = nicheB = null; sky = null; skx = null; ws = null; wsx = null; layer = null; shL = null;
    canvas.width = 1; canvas.height = 1;
  };

  /* ================================================================
     effects plumbing
     ================================================================ */
  /* the flash governor: may a pulse of this size happen now? Returns the
     factor to scale its brightness by (1 = as designed). */
  function flashGate(dl) {
    if (dl < 0.08) return 1;
    var n = 0, i;
    for (i = 0; i < flashN; i++) if (now - flashLog[i] < 1.0) n++;
    if (n >= 2) return 0.079 / dl;                  /* downgrade to colour-only */
    if (flashN < 4) flashLog[flashN++] = now;
    else { for (i = 1; i < 4; i++) flashLog[i - 1] = flashLog[i]; flashLog[3] = now; }
    return 1;
  }
  /* effects never add up: the strongest wins, the rest stretch it */
  function bigEffect(e, kickPx, rotDeg, stopMs) {
    var live = big.t0 >= 0 && fxNow - big.t0 < big.dur;
    if (live && e <= big.e) { big.dur *= 1.2; return false; }
    big.e = e; big.t0 = fxNow; big.dur = 0.16 + e * 0.05;
    var m = motionK() * (optSteady ? 0 : 1) * optNudge * juiceK();
    big.kick = Math.min(8, kickPx * m) * dpr;
    big.rot = rotDeg * m * lastRotDir;
    if (!optSteady && stopMs > 0) holdLeft = Math.max(holdLeft, Math.min(120, stopMs) / 1000);
    return true;
  }
  function kickNow() {
    if (big.t0 < 0) return 0;
    var u = fxNow - big.t0;
    if (u < 0) return 0;
    if (u < 0.02) return u / 0.02;
    u -= 0.02;
    var k = 45;
    return (1 + k * u) * Math.exp(-k * u);
  }

  /* the well's own transform, and a local one composed onto it */
  function wellT(x) { x.setTransform(wa, wb, wc, wd, we, wf); }
  function localT(x, sc, ang, tx, ty) {
    var lc = Math.cos(ang) * sc, ls = Math.sin(ang) * sc;
    x.setTransform(wa * lc + wc * ls, wb * lc + wd * ls, wc * lc - wa * ls, wd * lc - wb * ls,
                   wa * tx + wc * ty + we, wb * tx + wd * ty + wf);
  }

  function spawnParticle(kind, x, y, vx, vy, ay, life, size) {
    var i = pHead;
    pHead = (pHead + 1) % pBudget;
    if (pHead >= PMAX) pHead = 0;
    pX[i] = x; pY[i] = y; pVX[i] = vx; pVY[i] = vy; pAY[i] = ay;
    pAge[i] = 0; pLife[i] = life; pSize[i] = size; pRot[i] = Math.random() * TAU;
    pVR[i] = (Math.random() - 0.5) * 2.4; pSway[i] = 0; pPh[i] = Math.random() * TAU;
    pSw[i] = 0; pCX[i] = 0; pCY[i] = 0; pKind[i] = kind; pOn[i] = 1; pA[i] = 1;
    return i;
  }
  /* world particles for a dissolving cell (device px) */
  function burst(n, x0, y0, w0, h0, warm, up, spiral, cx, cy) {
    if (optMotion === "still" || n <= 0) return;
    var w = worldMix >= 0.5 && worldB ? worldB : world;
    var pc = w && w.particle ? w.particle : { kind: "mote", dir: 1, drift: 0.3, size: 0.4 };
    var kind = partSpr.world, gentle = optMotion === "gentle";
    var sizeK = (0.55 + pc.size * 0.9) * C * 0.42;
    for (var k = 0; k < n; k++) {
      var useLight = warm > 0 && Math.random() < warm * 0.6;
      var x = x0 + Math.random() * w0, y = y0 + Math.random() * h0;
      var dir = up ? 1 : (pc.dir || 1);
      var sp = C * (0.6 + Math.random() * 1.6);
      var vx = (Math.random() - 0.5) * C * 2.2 * (0.4 + pc.drift);
      var vy = -dir * sp;
      var ay = dir > 0 ? -C * 0.6 : C * 1.4;
      if (pc.kind === "drop" && !up) { vy = C * (0.5 + Math.random()); ay = C * 6; }
      var life = 0.9 + Math.random() * 1.1;
      if (gentle) { vx = 0; vy = 0; ay = 0; life = 0.3; }
      var i = spawnParticle(useLight ? 0 : kind, x, y, vx, vy, ay, life, sizeK * (0.6 + Math.random() * 0.7));
      pSway[i] = gentle ? 0 : pc.drift * C * 0.9;
      if (spiral && !gentle) { pSw[i] = (lastRotDir >= 0 ? 1 : -1) * (2.2 + Math.random() * 1.5); pCX[i] = cx; pCY[i] = cy; }
    }
  }
  function count(base) {
    if (optMotion === "still") return 0;
    var n = base * juiceK() * quality;
    if (optMotion === "gentle") n *= 0.2;
    return Math.max(0, Math.round(Math.min(n, pBudget)));
  }

  /* screen position (device px) of a board cell's top-left corner */
  function cellTop(y) { return WY + (VIS - 1 - y) * C; }

  /* ================================================================
     events
     ================================================================ */
  R.fx = function (ev) {
    if (!ev || !ev.t) return;
    var t = ev.t, k;
    if (t === "move") { if (ev.dx) lastDx = ev.dx > 0 ? 1 : -1; }
    else if (t === "rotate") {
      lastRotDir = ev.dir === "ccw" ? -1 : 1;
      if (motionK()) {
        rotT0 = -2;
        rotFrom = ev.dir === "cw" ? -Math.PI / 2 : ev.dir === "ccw" ? Math.PI / 2 : -Math.PI;
        glintT0 = -2; glintK = ev.kick ? 1 : 0.5;
      }
    }
    else if (t === "bump") {
      if (motionK()) { bumpT0 = -2; bumpDir = lastDx; bumpRot = ev.what === "rotate" ? 1 : 0; }
    }
    else if (t === "soft") softT0 = -2;
    else if (t === "spawn") {
      spawnFlag = true;
      /* a piece from the queue: every preview moves up one place (a swap
         out of Keep leaves the queue as it was) */
      if (!holdSwap) advT0 = -2;
      holdSwap = false;
    }
    else if (t === "hold") {
      keepType = typeId(ev.type);
      keepT0 = -2;
      keepPulseT0 = -2;
      fromKeep = !!ev.from;
      holdSwap = !!ev.from;
      spawnFlag = true;
      /* the glide starts where the piece was drawn */
      keepFX = WX + (dX + 0.5) * C;
      keepFY = cellTop(dY) + C * 0.5;
    }
    else if (t === "hard") {
      snapY = true;
      var tr = trails[0].on && (trails[1].t0 < trails[0].t0 || !trails[1].on) ? trails[1] : trails[0];
      tr.on = true; tr.t0 = -2; tr.type = typeId(ev.type); tr.n = 0;
      if (ev.cells && ev.rows > 0) {
        for (k = 0; k < ev.cells.length; k++) {
          var cx = ev.cells[k][0], cy = ev.cells[k][1], j, found = -1;
          for (j = 0; j < tr.n; j++) if (tr.xs[j] === cx) found = j;
          if (found < 0) { found = tr.n++; tr.xs[found] = cx; tr.y0[found] = cy; tr.y1[found] = cy; }
          if (cy > tr.y1[found]) tr.y1[found] = cy;
          if (cy < tr.y0[found]) tr.y0[found] = cy;
        }
        for (j = 0; j < tr.n; j++) tr.y0[j] = tr.y1[j] + ev.rows;     /* where the trail starts */
        /* dust at the contact */
        var nd = count(LADDER.hard[1]);
        for (k = 0; k < ev.cells.length && nd > 0; k++) {
          var bx = ev.cells[k][0], by = ev.cells[k][1], under = true;
          for (j = 0; j < ev.cells.length; j++) if (ev.cells[j][0] === bx && ev.cells[j][1] === by - 1) under = false;
          if (!under) continue;
          for (j = 0; j < 2 && nd > 0; j++, nd--) {
            var pi = spawnParticle(1, WX + (bx + Math.random()) * C, cellTop(by) + C, (Math.random() - 0.5) * C * 3, -C * (0.3 + Math.random() * 0.8), C * 1.5, 0.45 + Math.random() * 0.3, C * 0.28);
            if (optMotion === "gentle") { pVX[pi] = 0; pVY[pi] = 0; pAY[pi] = 0; pLife[pi] = 0.3; }
          }
        }
      }
      bigEffect(LADDER.hard[0], LADDER.hard[2], 0, 0);
    }
    else if (t === "lock") {
      squash.on = optMotion === "full" && !!ev.pid; squash.t0 = -2; squash.pid = ev.pid || 0;
      layerDirty = true;
      var mxx = 0, myy = 0, minY = 99;
      if (ev.cells) {
        for (k = 0; k < ev.cells.length; k++) { mxx += ev.cells[k][0]; myy += ev.cells[k][1]; if (ev.cells[k][1] < minY) minY = ev.cells[k][1]; }
        mxx /= ev.cells.length; myy /= ev.cells.length;
        squash.base = minY;
        lastLockX = mxx; lastLockY = myy;
        /* the T's centre, for a Twist ribbon: the cell with three neighbours */
        if (typeId(ev.type) === 3) {
          for (k = 0; k < 4; k++) {
            var nb = 0;
            for (j = 0; j < 4; j++) {
              var ddx = Math.abs(ev.cells[j][0] - ev.cells[k][0]), ddy = Math.abs(ev.cells[j][1] - ev.cells[k][1]);
              if (ddx + ddy === 1) nb++;
            }
            if (nb === 3) { lastLockX = ev.cells[k][0]; lastLockY = ev.cells[k][1]; }
          }
        }
      }
      /* the ripple ring: a change in luminance of 0.05 or less */
      if (optMotion !== "still") {
        var rg = rings[0];
        for (k = 1; k < rings.length; k++) if (!rings[k].on || rings[k].t0 < rg.t0) rg = rings[k];
        rg.on = true; rg.t0 = -2; rg.x = WX + (mxx + 0.5) * C; rg.y = cellTop(minY) + C; rg.a = 0.16;
      }
    }
    else if (t === "clear") startClear(ev);
    else if (t === "twist") {
      var key = ev.kind === "mini" ? "mini" : "twist";
      var rb = ribbons[0].on ? ribbons[1] : ribbons[0];
      rb.on = true; rb.t0 = -2; rb.x = lastLockX; rb.y = lastLockY; rb.mini = ev.kind === "mini"; rb.dir = lastRotDir;
      bigEffect(LADDER[key][0], LADDER[key][2], LADDER[key][3], LADDER[key][4]);
      burst(count(LADDER[key][1]), WX + (lastLockX - 0.5) * C, cellTop(lastLockY) - C * 0.5, C * 2, C * 2, 0.5, true, true,
            WX + (lastLockX + 0.5) * C, cellTop(lastLockY) + C * 0.5);
    }
    else if (t === "silt") { siltFx.on = true; siltFx.t0 = -2; siltFx.rows = ev.rows || 1; }
    else if (t === "drain") {
      drainFx.on = true; drainFx.t0 = -2; drainFx.rows = Math.min(VIS, ev.rows || 4);
      if (snapOk) { drainFx.v.set(snapB); drainFx.p.set(snapP); }
      else drainFx.v.fill(0);
    }
    else if (t === "rewind") { rewindFlag = true; fromKeep = false; }
    else if (t === "start") reset();
    else if (t === "pause") paused = true;
    else if (t === "resume") paused = false;
    else if (t === "world") R.setWorld(ev.world, false);
    else if (t === "pb" || t === "chapter") { shimmer.t0 = -2; shimmer.a = t === "pb" ? 0.6 : 0.45; }
    else if (t === "end" || t === "over" || t === "surface") startEnd(t === "surface");
    else if (t === "breathe") { breatheOutro.on = true; breatheOutro.phase = clamp(+ev.phase || 0, 0, 1); }
  };

  function reset() {
    var i;
    for (i = 0; i < clears.length; i++) clears[i].on = false;
    for (i = 0; i < rings.length; i++) rings[i].on = false;
    for (i = 0; i < ribbons.length; i++) ribbons[i].on = false;
    for (i = 0; i < trails.length; i++) trails[i].on = false;
    for (i = 0; i < PMAX; i++) pOn[i] = 0;
    squash.on = false; emptyFx.on = false; drainFx.on = false; siltFx.on = false; endFx.on = false;
    ended = false; filament.on = false; filament.a = 0; breatheOutro.on = false;
    big.t0 = -1; holdLeft = 0; aHave = false; reactT0 = -1; paused = false; holdSwap = false; layerDirty = true;
  }

  function startClear(ev) {
    var c = clears[0], i, k;
    squash.on = false;
    for (i = 1; i < clears.length; i++) if (!clears[i].on || (clears[i].t0 >= 0 && clears[i].t0 < c.t0)) c = clears[i];
    for (i = 0; i < clears.length; i++) if (!clears[i].on) { c = clears[i]; break; }
    c.on = true; c.t0 = -2; c.settleT0 = -1; c.waiting = true;
    c.n = Math.min(4, ev.n || (ev.rows ? ev.rows.length : 0));
    for (i = 0; i < c.n; i++) c.rows[i] = ev.rows[i];
    c.cn = 0;
    if (ev.cells) for (k = 0; k < ev.cells.length && c.cn < 40; k++) {
      var e = ev.cells[k];
      c.cx[c.cn] = e.x; c.cy[c.cn] = e.y; c.cv[c.cn] = typeId(e.v); c.cp[c.cn] = e.pid || 0; c.cn++;
    }
    c.twist = ev.twist === "full" || ev.twist === "mini";
    c.mini = ev.twist === "mini";
    c.empty = !!ev.empty;
    c.sync = clamp(+ev.sync || 0, 0, 0.25);
    c.spawned = 0;
    c.tx = lastLockX; c.ty = lastLockY;
    var n = c.n, key;
    if (c.twist) key = c.mini ? (n >= 2 ? "miniDouble" : "miniSingle") : (n >= 3 ? "twistTriple" : n === 2 ? "twistDouble" : "twistSingle");
    else key = n >= 4 ? "quad" : n === 3 ? "triple" : n === 2 ? "double" : "single";
    c.kind = key;
    var L0 = LADDER[key], parts = L0[1], kick = L0[2];
    var rip = Math.max(0, ev.ripple || 0);
    if (ev.unbroken) { parts *= 1.25; kick += 1; }
    if (rip > 0) { parts *= 1 + 0.1 * Math.min(10, rip); kick += Math.min(2, 0.5 * rip); }
    c.warm = Math.min(1, 0.25 + rip * 0.08);
    c.parts = count(parts);
    /* the glow's brightness, through the governor */
    /* the band of light and the warmth on the leaving cells are one pulse,
       and pass the flash governor together */
    var gl = n >= 4 ? 0.24 : 0.2;
    c.gate = flashGate(deltaL(WARM, gl * 0.6, 0.3) * (n >= 4 ? 1.4 : 1));
    c.gl = gl * c.gate;
    if (c.empty) {
      bigEffect(LADDER.empty[0], 0, 0, LADDER.empty[4]);
      emptyFx.on = true; emptyFx.t0 = -2;
      emptyFx.a = 0.2 * flashGate(deltaL(WARM, 0.2, 0.12));
      emptyFx.motes = count(LADDER.empty[1] * 0.3); emptyFx.spent = 0;
      c.parts = count(40);
    } else bigEffect(L0[0] + (ev.unbroken ? 0.5 : 0) + Math.min(1, rip * 0.25), kick, L0[3], L0[4]);
    if (n >= 4 && !optSteady) reactT0 = -2;
    /* Unbroken: the filament lives while the chain does */
    var difficult = n >= 4 || c.twist;
    if (ev.unbroken) { filament.on = true; filament.n = ev.unbrokenCount || 1; if (filament.t0 < 0) filament.t0 = -2; }
    else if (!difficult) filament.on = false;
  }

  function startEnd(surface) {
    if (ended && endFx.on) { if (surface) endFx.surface = true; return; }
    ended = true;
    layerDirty = true;
    endFx.on = true; endFx.t0 = -2; endFx.surface = !!surface;
    if (snapOk) { endFx.v.set(snapB); endFx.p.set(snapP); } else endFx.v.fill(0);
    var top = 0;
    for (var y = 0; y < TOPROW; y++) for (var x = 0; x < W; x++) if (endFx.v[y * W + x]) top = y;
    endFx.top = top;
    endFx.gate = flashGate(deltaL(WARM, surface ? 0.24 : 0.16, 0.12));
    if (surface) reactT0 = -2;
  }

  /* ================================================================
     the frame
     ================================================================ */
  function stamp() {
    /* effects queued between frames start on the frame that shows them */
    var i;
    for (i = 0; i < clears.length; i++) if (clears[i].t0 === -2) clears[i].t0 = fxNow;
    for (i = 0; i < rings.length; i++) if (rings[i].t0 === -2) rings[i].t0 = fxNow;
    for (i = 0; i < ribbons.length; i++) if (ribbons[i].t0 === -2) ribbons[i].t0 = fxNow;
    for (i = 0; i < trails.length; i++) if (trails[i].t0 === -2) trails[i].t0 = now;
    if (squash.t0 === -2) squash.t0 = now;
    if (emptyFx.t0 === -2) emptyFx.t0 = fxNow;
    if (drainFx.t0 === -2) drainFx.t0 = now;
    if (siltFx.t0 === -2) siltFx.t0 = now;
    if (endFx.t0 === -2) endFx.t0 = now;
    if (rotT0 === -2) rotT0 = now;
    if (glintT0 === -2) glintT0 = now;
    if (bumpT0 === -2) bumpT0 = now;
    if (keepT0 === -2) keepT0 = now;
    if (advT0 === -2) advT0 = now;
    if (keepPulseT0 === -2) keepPulseT0 = now;
    if (softT0 === -2) softT0 = now;
    if (reactT0 === -2) reactT0 = now;
    if (shimmer.t0 === -2) shimmer.t0 = now;
    if (filament.t0 === -2) filament.t0 = now;
    if (worldT0 === -1 && worldB) worldT0 = now;
  }

  function cadence(raw) {
    dts[dtsI] = raw; dtsI = (dtsI + 1) % 120; if (dtsN < 120) dtsN++;
    if (dtsN < 60) return;
    for (var i = 0; i < dtsN; i++) sortBuf[i] = dts[i];
    var med = median(sortBuf, dtsN);
    /* thirty frames in a row well over the cadence: halve the particles.
       A steady 30 fps (Low Power Mode) is a cadence, not an overload. */
    if (raw > Math.max(0.02, med * 1.5)) slowRun++; else slowRun = 0;
    if (slowRun >= 30) { pBudget = Math.max(20, Math.round(pBudget / 2)); slowRun = 0; }
    if (med > 0.03 && med < 0.037) lowRun += raw; else lowRun = 0;
    if (!lowPowerSaid && lowRun > 2 && opts.onLowPower) { lowPowerSaid = true; try { opts.onLowPower(); } catch (e) {} }
  }
  function median(a, n) {
    /* insertion sort on a copy: 120 floats, no allocation */
    for (var i = 1; i < n; i++) { var v = a[i], j = i - 1; while (j >= 0 && a[j] > v) { a[j + 1] = a[j]; j--; } a[j + 1] = v; }
    return a[n >> 1];
  }

  /* the fallback dusk for a world, made once per world and sky size */
  var skyGrads = {};
  function skyGradient(wd) {
    var g = skyGrads[wd.id];
    if (g) return g;
    g = skx.createLinearGradient(0, 0, 0, sky.height);
    g.addColorStop(0, wd.sky.top); g.addColorStop(0.82, wd.sky.horizon);
    g.addColorStop(1, css(darken(hexRgb(wd.sky.horizon), 0.35)));
    skyGrads[wd.id] = g;
    return g;
  }
  /* the sky only needs repainting if a painter is there to move it */
  function skyMoves() { return !!(root.Sky && root.Sky.paint2D && !skyBroken && root.Sky.paint2D.length >= 8); }
  function paintSky() {
    if (!sky) return;
    var a = world, b = worldB, m = worldB ? worldMix : 0;
    /* the gradient underneath is the fallback and the base: if sky.js is
       missing or its painter fails, the well still has a dusk to sit in */
    for (var pass = 0; pass < (b ? 2 : 1); pass++) {
      var wd = pass ? b : a;
      if (!wd) continue;
      skx.globalAlpha = pass ? m : 1;
      skx.fillStyle = skyGradient(wd);
      skx.fillRect(0, 0, sky.width, sky.height);
    }
    skx.globalAlpha = 1;
    var Sky = root.Sky;
    if (Sky && Sky.paint2D && !skyBroken && a) {
      try {
        var react = 0;
        if (reactT0 >= 0 && !optSteady) {
          var u = now - reactT0;
          react = u < 0.8 ? smooth(0, 0.8, u) : 1 - smooth(0.8, reactDur, u);
          if (u > reactDur) reactT0 = -1;
        }
        var mot = optMotion === "full" ? (optSteady ? 0.5 : 1) : 0;
        Sky.paint2D(skx, sky.width, sky.height, a, b || a, m, now, react, mot);
      } catch (e) { skyBroken = true; }
      skx.setTransform(1, 0, 0, 1, 0, 0);
      skx.globalAlpha = 1;
      skx.globalCompositeOperation = "source-over";
    }
    /* a quiet vignette, baked into the sky rather than drawn every frame */
    skx.globalAlpha = 0.34;
    skx.drawImage(vigSpr, -sky.width * 0.08, -sky.height * 0.06, sky.width * 1.16, sky.height * 1.12);
    skx.globalAlpha = 1;
    skyLast = now;
    skyDirty = false;
    if (worldB) wsDirty = true;
  }

  function composeWS() {
    wsx.setTransform(1, 0, 0, 1, 0, 0);
    wsx.globalAlpha = 1;
    wsx.globalCompositeOperation = "source-over";
    wsx.clearRect(0, 0, ws.width, ws.height);
    drawWells(wsx, -WSX, -WSY);
    blitLayer(wsx, -WSX, -WSY);
    wsDirty = false;
  }
  /* the occupied part of the stack layer only: an empty well costs nothing */
  function blitLayer(x, ox, oy) {
    var sy = layerTop, h = layer.height - sy;
    if (h > 0) x.drawImage(layer, 0, sy, layer.width, h, LX0 + ox, LY0 + sy + oy, layer.width, h);
  }
  /* frames that cannot use the composed well: something is drawn between
     the back wall and the stack */
  function splitFrame() {
    if (emptyFx.on || breatheOutro.on || drainFx.on || endFx.on) return true;
    for (var i = 0; i < clears.length; i++) {
      var c = clears[i];
      if (c.on && c.t0 >= 0 && fxNow - c.t0 < Math.max(0.2, c.sync) + 0.45) return true;
    }
    return false;
  }
  function drawWells(x, ox, oy) {
    if (wellA) x.drawImage(wellA.c, bodyL - margin + ox, bodyT - margin + oy);
    if (wellB && worldB) { x.globalAlpha = worldMix; x.drawImage(wellB.c, bodyL - margin + ox, bodyT - margin + oy); x.globalAlpha = 1; }
    if (nicheA && L.keep) {
      var kx = Math.round(L.keep.x * dpr) - nicheA.o + ox, ky = Math.round(L.keep.y * dpr) - nicheA.o + oy;
      x.drawImage(nicheA.c, kx, ky);
      if (nicheB && worldB) { x.globalAlpha = worldMix; x.drawImage(nicheB.c, kx, ky); x.globalAlpha = 1; }
    }
  }

  R.render = function (view, dt, time) {
    if (!L || !skin || !world) return;
    var raw = dt > 0 ? dt : 0;
    if (typeof time === "number") {
      if (lastTime >= 0 && !(dt > 0)) raw = time - lastTime;
      now = time;
    } else now += raw;
    lastTime = now;
    cadence(raw);
    dt = clamp(raw, 0, 0.1);
    frameDt = dt;
    if (view) paused = !!view.paused;
    var fdt = paused ? 0 : dt;
    if (holdLeft > 0) { var h = Math.min(holdLeft, fdt); holdLeft -= h; fdt -= h; }
    fxNow += fdt;
    stamp();

    /* worlds crossfade on their own clock, paused or not */
    if (worldB) {
      worldMix = clamp((now - worldT0) / worldDur, 0, 1);
      if (worldMix >= 0.5 && partSpr.from !== worldB.id) { partSpr.from = worldB.id; buildWorldSprites(); }
      if (worldMix >= 1) {
        world = worldB; worldB = null; worldMix = 1;
        wellA = wellB; nicheA = nicheB; wellB = null; nicheB = null;
        if (!wellA) wellA = buildWell(world);
        partSpr.from = world.id;
        buildWorldSprites();
        skyDirty = true;
        wsDirty = true;
      }
    }
    /* the sky: at most 30 times a second, and not at all while nothing moves */
    var moving = (optMotion === "full" && skyHz > 0 && !paused && skyMoves()) || worldB;
    if (skyDirty || (moving && now - skyLast >= 1 / Math.max(10, skyHz)) || (reactT0 >= 0 && now - skyLast >= 1 / 15)) paintSky();

    var dg = view ? view.danger || 0 : 0;
    /* slow on the way in and out: a cue that drifts, never one that pulses */
    dangerS += (dg - dangerS) * (1 - Math.exp(-dt / 0.9));

    stepParticles(fdt);
    if (view) {
      if (boardChanged(view)) layerDirty = true;
      stepActive(view, dt);
      stepClears(view);
    }
    draw(view);
    if (view) remember(view);
    idleBake();
    R.stats.particles = pLive;
  };

  /* ---------- the active piece ---------- */
  function stepActive(view, dt) {
    var a = view.active;
    if (!a || ended) { aHave = false; spawnFlag = false; rewindFlag = false; return; }
    var ty = typeId(a.type), m = motionK();
    var newPiece = !aHave || spawnFlag || rewindFlag || ty !== aType || a.y > aY + 4;
    if (newPiece) {
      var oldX = dX, oldY = dY, had = aHave;
      dX = a.x; dY = a.y; yT0 = -1; rotT0 = -1; bumpT0 = -1; glideT0 = -1;
      if (m && rewindFlag && had) {
        /* a rewind (Fewest Moves) floats the piece back up to its start */
        glideFX = (oldX - a.x) * C; glideFY = -(oldY - a.y) * C; glideFS = 1; glideT0 = now;
      } else if (m && spawnFlag) {
        /* The next piece glides in from the preview it was, or out of the
           niche, over 90 ms: the one moment the picture leads the logic,
           and it is shorter than a gravity row. */
        var src = null, sc = 1;
        if (fromKeep && L.keep) { src = L.keep; sc = L.keep.s; }
        else if (L.next && L.next.length && optPreviews > 0) { src = L.next[0]; sc = L.next[0].s; }
        if (src) {
          var cx = (src.x + src.w / 2) * dpr, cy = (src.y + src.h / 2) * dpr;
          var px = WX + (a.x + 0.5 + PIVOT_X[ty]) * C, py = cellTop(a.y) + C * (0.5 - PIVOT_Y[ty]);
          glideFX = cx - px; glideFY = cy - py; glideFS = sc; glideT0 = now;
        }
      }
      spawnFlag = false; rewindFlag = false; fromKeep = false; snapY = false;
      aType = ty; aRot = a.rot; aY = a.y; aHave = true;
      lastRowT = now;
      return;
    }
    /* sideways: an exponential chase, 15 ms */
    if (m && Math.abs(a.x - dX) < 6) {
      dX += (a.x - dX) * (1 - Math.exp(-dt / 0.015));
      if (Math.abs(a.x - dX) < 0.003) dX = a.x;
    } else dX = a.x;
    /* down: each row eases over min(90 ms, half the row interval); a hard
       drop or a jump of more than four rows is drawn where it lands */
    if (a.y !== aY) {
      var interval = now - lastRowT;
      lastRowT = now;
      if (!m || snapY || Math.abs(a.y - aY) > 4) { dY = a.y; yT0 = -1; }
      else { yFrom = dY; yTo = a.y; yT0 = now; yDur = Math.max(0.008, Math.min(0.09, 0.5 * interval)); }
      snapY = false;
    }
    if (yT0 >= 0) {
      var u = (now - yT0) / yDur;
      if (u >= 1) { dY = yTo; yT0 = -1; } else dY = yFrom + (yTo - yFrom) * easeOut(u);
    } else dY = a.y;
    /* a turn with no rotate event (a restored game): drawn as it is */
    if (a.rot !== aRot && rotT0 >= 0 && now - rotT0 > 0.075) rotT0 = -1;
    aRot = a.rot; aY = a.y;
  }

  /* ---------- clears: when the stack collapses, it settles ---------- */
  function stepClears(view) {
    var i, y, k;
    for (y = 0; y < rowOff.length; y++) { rowOff[y] = 0; rowHide[y] = 0; }
    var b = view.board, p = view.pid;
    for (i = 0; i < clears.length; i++) {
      var c = clears[i];
      if (!c.on) continue;
      var age = fxNow - c.t0;
      if (c.waiting) {
        /* has the engine taken the rows out yet? (it may hold them during
           its clear delay; then they are drawn by the dissolve, not twice) */
        var r0 = c.rows[0], still = true;
        for (k = 0; k < c.cn && still; k++) {
          if (c.cy[k] !== r0) continue;
          var idx = r0 * W + c.cx[k];
          if (!b[idx] || (p && p[idx] !== c.cp[k])) still = false;
        }
        if (still) { for (k = 0; k < c.n; k++) rowHide[c.rows[k]] = 1; }
        else { c.waiting = false; c.settleT0 = now; }
      }
      if (!c.waiting && c.settleT0 >= 0 && optMotion === "full") {
        var st = (now - c.settleT0) / 0.12;
        if (st < 1) {
          var left = 1 - spring(st);
          /* each row now at y fell by the number of cleared rows below
             where it used to be */
          var kk = 0, ri = 0;
          for (y = 0; y < rowOff.length; y++) {
            while (ri < c.n && c.rows[ri] <= y + kk) { kk++; ri++; }
            rowOff[y] += kk * left;
          }
        }
      }
      if (age > 1.6 && !c.waiting) c.on = false;
    }
    /* silt pushes up: drawn from below, rising into place */
    if (siltFx.on) {
      var su = (now - siltFx.t0) / 0.32;
      if (su >= 1 || optMotion !== "full") siltFx.on = false;
      else for (y = 0; y < rowOff.length; y++) rowOff[y] -= siltFx.rows * (1 - easeOut(su));
    }
    /* the drain: the stack settles down over 1.5 s, most of it early */
    if (drainFx.on) {
      var du = (now - drainFx.t0) / 1.5;
      if (du >= 1) drainFx.on = false;
      else if (optMotion !== "still") {
        var e = 1 - Math.pow(1 - du, 4);
        for (y = 0; y < rowOff.length; y++) rowOff[y] += drainFx.rows * (1 - e);
      }
    }
  }

  function stepParticles(dt) {
    pLive = 0;
    if (dt <= 0) { for (var j = 0; j < PMAX; j++) if (pOn[j]) pLive++; return; }
    for (var i = 0; i < PMAX; i++) {
      if (!pOn[i]) continue;
      pAge[i] += dt;
      if (pAge[i] >= pLife[i]) { pOn[i] = 0; continue; }
      pVY[i] += pAY[i] * dt;
      pVX[i] *= (1 - dt * 0.8);
      pX[i] += pVX[i] * dt + Math.sin(pPh[i] + pAge[i] * 2.1) * pSway[i] * dt;
      pY[i] += pVY[i] * dt;
      pRot[i] += pVR[i] * dt;
      if (pSw[i] !== 0) {
        var a = pSw[i] * dt, dx = pX[i] - pCX[i], dy = pY[i] - pCY[i], ca = Math.cos(a), sa = Math.sin(a);
        pX[i] = pCX[i] + dx * ca - dy * sa;
        pY[i] = pCY[i] + dx * sa + dy * ca;
      }
      pLive++;
    }
  }

  function boardChanged(view) {
    if (!snapOk) return true;
    var b = view.board, p = view.pid, n = Math.min(400, b.length);
    for (var i = 0; i < n; i++) if (snapB[i] !== b[i] || (p && snapP[i] !== p[i])) return true;
    return false;
  }
  function remember(view) {
    var b = view.board, p = view.pid, n = Math.min(400, b.length);
    for (var i = 0; i < n; i++) { snapB[i] = b[i]; snapP[i] = p ? p[i] : 0; }
    snapOk = true;
    /* a new run without a start event: the board no longer matches */
    if (ended && !endFx.on && !view.over && view.active) { ended = false; layerDirty = true; }
  }

  /* ================================================================
     drawing
     ================================================================ */
  function draw(view) {
    var x = ctx;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
    x.imageSmoothingEnabled = true;

    /* the well and everything on it moves together when nudged */
    var kk = kickNow();
    kickY = Math.round(big.kick * kk * 4) / 4;
    kickR = big.rot * kk * Math.PI / 180;
    if (Math.abs(kickR) < 0.0002) kickR = 0;
    var cxw = WX + WWd / 2, cyw = WY + WHd / 2, cr = Math.cos(kickR), sr = Math.sin(kickR);
    wa = cr; wb = sr; wc = -sr; wd = cr;
    we = cxw - cr * cxw + sr * cyw; wf = cyw - sr * cxw - cr * cyw + kickY;

    /* the stack layer, repainted only when the board has changed */
    if (view) {
      var anim = rowsMoving();
      if (squash.on && (now - squash.t0 >= 0.1 || optMotion !== "full")) { squash.on = false; layerDirty = true; }
      if (layerDirty || anim || layerAnim || targetChanged(view)) { paintLayer(view); layerDirty = false; wsDirty = true; }
      layerAnim = anim;
    }
    /* the sky, stretched from half resolution: it is soft by design */
    x.drawImage(sky, 0, 0, devW, devH);
    wellT(x);
    if (!splitFrame()) {
      /* the usual frame: one copy of the composed well */
      if (wsDirty) composeWS();
      x.drawImage(ws, WSX, WSY);
    } else {
      drawWells(x, 0, 0);
      drawWellLight(x);
      drawClearGhosts(x);
      blitLayer(x, 0, 0);
      drawDrainGhosts(x);
      drawEnd(x);
    }
    if (view) drawSquash(x, view);
    drawDangerWalls(x);
    drawLights(x);
    drawParticles(x);

    /* danger: a cool vignette, under everything you need to read */
    if (dangerS > 0.5) {
      x.save();
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalAlpha = 0.66 * smooth(0.5, 0.92, dangerS);
      x.drawImage(dangerSpr, -devW * 0.04, -devH * 0.03, devW * 1.08, devH * 1.06);
      x.restore();
    }
    if (view) {
      drawLanding(x, view);
      drawTrails(x);
      drawRim(x, view);
      drawKeep(x, view);
      drawPreviews(x, view);
      drawActive(x, view);
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
  }

  function drawDangerWalls(x) {
    var d = smooth(0.5, 0.92, dangerS);
    if (d <= 0) return;
    /* the walls cool and lose their colour; information, not threat */
    x.globalAlpha = 0.5 * d;
    x.fillStyle = "rgb(84,98,120)";
    x.fillRect(bodyL, bodyT, wallD, bodyH);
    x.fillRect(bodyL + bodyW - wallD, bodyT, wallD, bodyH);
    x.globalAlpha = 1;
  }

  /* light on the back wall: the Empty Well's one slow breath, Steady's
     breathing outro, a PB or chapter shimmer */
  /* The Empty Well's motes: lanterns lifting off the floor, slowly, over
     the breath. A few at a time across a second and a half, from anywhere
     in the bottom two rows, each a soft dot in the world's own key light at
     under half strength: lanterns, one by one. (All at once, white, and
     added on top of each other, they piled into an overexposed band of
     foam along the floor at the game's biggest moment.) */
  function releaseMotes(u) {
    if (emptyFx.motes <= 0 || u < 0.2) return;
    var want = Math.ceil(emptyFx.motes * clamp((u - 0.2) / 1.4, 0, 1)), gentle = optMotion === "gentle";
    var kind = KINDS.indexOf("dust");
    while (emptyFx.spent < want && emptyFx.spent < emptyFx.motes) {
      var i = spawnParticle(kind, WX + C * 0.3 + Math.random() * (WWd - C * 0.6), WY + WHd - C * 0.3 - Math.random() * C * 1.7,
                            (Math.random() - 0.5) * C * 0.25, -C * (0.45 + Math.random() * 0.7), -C * 0.06,
                            2.4 + Math.random() * 1.2, C * (0.22 + Math.random() * 0.22));
      pA[i] = 0.32 + Math.random() * 0.13;
      pSway[i] = C * 0.45;
      if (gentle) { pVX[i] = 0; pVY[i] = 0; pAY[i] = 0; pLife[i] = 0.3; pSway[i] = 0; }
      emptyFx.spent++;
    }
  }
  function drawWellLight(x) {
    var a = 0;
    if (emptyFx.on) {
      var u = fxNow - emptyFx.t0;
      releaseMotes(u);
      /* the breath of light is over by 1.2 s; the lanterns go on rising */
      if (u <= 1.2) a += emptyFx.a * (u < 0.3 ? smooth(0, 0.3, u) : 1 - smooth(0.3, 1.2, u));
      else if (u > 1.7) emptyFx.on = false;
    }
    if (breatheOutro.on) {
      var ph = breatheOutro.phase;
      a += 0.12 * (ph < 0.4 ? smooth(0, 0.4, ph) : 1 - smooth(0.4, 1, ph));
    }
    if (a <= 0.002) return;
    x.globalCompositeOperation = "lighter";
    x.globalAlpha = a;
    x.drawImage(bandSpr, WX - C * 0.5, WY - C * 1.5, WWd + C, WHd + C * 2);
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
  }

  function targetChanged(view) {
    var tg = view.target, k = "";
    if (tg && tg.length) for (var i = 0; i < tg.length; i++) k += tg[i][0] + "," + tg[i][1] + ";";
    if (k === tgtKey) return false;
    tgtKey = k;
    return true;
  }
  /* a lesson's target: a quiet outline where the piece is meant to go */
  function drawTarget(x, view, ox, oy) {
    var tg = view.target;
    if (!tg || !tg.length) return;
    x.save();
    x.translate(ox, oy);
    x.fillStyle = keyCssSoft;
    x.globalAlpha = 0.35;
    var k, j, lw = Math.max(1, Math.round(dpr * 1.5));
    for (k = 0; k < tg.length; k++) x.fillRect(WX + tg[k][0] * C, cellTop(tg[k][1]), C, C);
    x.globalAlpha = 0.85;
    x.fillStyle = keyCss;
    for (k = 0; k < tg.length; k++) {
      var cx = tg[k][0], cy = tg[k][1], n = 0, e = 0, s = 0, w = 0;
      for (j = 0; j < tg.length; j++) {
        if (tg[j][0] === cx && tg[j][1] === cy + 1) n = 1;
        if (tg[j][0] === cx + 1 && tg[j][1] === cy) e = 1;
        if (tg[j][0] === cx && tg[j][1] === cy - 1) s = 1;
        if (tg[j][0] === cx - 1 && tg[j][1] === cy) w = 1;
      }
      var l = WX + cx * C, t = cellTop(cy);
      if (!n) x.fillRect(l, t, C, lw);
      if (!s) x.fillRect(l, t + C - lw, C, lw);
      if (!w) x.fillRect(l, t, lw, C);
      if (!e) x.fillRect(l + C - lw, t, lw, C);
    }
    x.globalAlpha = 1;
    x.restore();
  }

  /* silt: a soft glow where each row's gap is */
  function drawSeams(x, view, ox, oy) {
    var b = view.board, y, xx, has;
    for (y = 0; y < VIS; y++) {
      has = false;
      for (xx = 0; xx < W; xx++) if (b[y * W + xx] === 8) { has = true; break; }
      if (!has) continue;
      for (xx = 0; xx < W; xx++) {
        if (b[y * W + xx]) continue;
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = 0.32;
        x.drawImage(seamSpr, WX + (xx - 0.35) * C + ox, cellTop(y) - rowOff[y] * C - C * 0.25 + oy, C * 1.7, C * 1.5);
        x.globalAlpha = 1;
        x.globalCompositeOperation = "source-over";
      }
    }
  }

  function maskAt(b, p, v, pid, xx, y) {
    var m = 0, i = y * W + xx;
    if (v === 8) {
      if (xx > 0 && b[i - 1] === 8) m |= MW;
      if (xx < W - 1 && b[i + 1] === 8) m |= ME;
      return m;
    }
    if (pid) {
      if (y + 1 < 40 && b[i + W] && p[i + W] === pid) m |= MN;
      if (y > 0 && b[i - W] && p[i - W] === pid) m |= MS;
      if (xx > 0 && b[i - 1] && p[i - 1] === pid) m |= MW;
      if (xx < W - 1 && b[i + 1] && p[i + 1] === pid) m |= ME;
      /* a body that fills a 2×2 block of itself (never in play but an O;
         possible on a prepared board): join its inside corners too */
      if (v !== 2 && m > 0) {
        var yes = 0, no = 0;
        if ((m & MN) && (m & MW)) { if (p[i + W - 1] === pid && b[i + W - 1]) yes++; else no++; }
        if ((m & MN) && (m & ME)) { if (p[i + W + 1] === pid && b[i + W + 1]) yes++; else no++; }
        if ((m & MS) && (m & MW)) { if (p[i - W - 1] === pid && b[i - W - 1]) yes++; else no++; }
        if ((m & MS) && (m & ME)) { if (p[i - W + 1] === pid && b[i - W + 1]) yes++; else no++; }
        if (yes > no) m |= 16;
      }
    } else {
      /* a prepared board without piece ids: fuse runs of the same colour */
      if (y + 1 < 40 && b[i + W] === v && !p[i + W]) m |= MN;
      if (y > 0 && b[i - W] === v && !p[i - W]) m |= MS;
      if (xx > 0 && b[i - 1] === v && !p[i - 1]) m |= MW;
      if (xx < W - 1 && b[i + 1] === v && !p[i + 1]) m |= ME;
    }
    return m;
  }

  /* the piece that just locked: a 2–3% squash and spring over 100 ms,
     keeping its colour exactly (brief §7.5) */
  function drawSquash(x, view) {
    if (!squash.on || !squash.pid || ended) return;
    var su = clamp((now - squash.t0) / 0.1, 0, 1);
    var sq = Math.sin(su * Math.PI) * (1 - su * 0.35) * C * 0.03;
    var b = view.board, p = view.pid, y, xx, i;
    if (!p) return;
    for (y = 0; y < TOPROW; y++) {
      if (rowHide[y]) continue;
      var top = Math.round(cellTop(y) - rowOff[y] * C);
      for (xx = 0; xx < W; xx++) {
        i = y * W + xx;
        if (p[i] !== squash.pid || !b[i]) continue;
        var v = b[i], m = maskAt(b, p, v, p[i], xx, y);
        tileReady(v, m);
        x.drawImage(atlas, (m & 15) * S, tileY(v, m), S, S, colX[xx], top + Math.round(sq * (y - squash.base + 0.5)), colX[xx + 1] - colX[xx], S);
      }
    }
  }
  function rowsMoving() {
    for (var y = 0; y < rowOff.length; y++) if (rowOff[y] !== 0 || rowHide[y]) return true;
    return false;
  }
  /* the stack: soft shadows on the back wall, a lantern's glow, then the
     fused tiles, all into the layer canvas */
  function paintLayer(view) {
    var x = lyx;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, layer.width, layer.height);
    layerTop = layer.height;
    if (ended) return;
    var b = view.board, p = view.pid || snapP, y, xx, i, v, pid, m;
    var minTop = layer.height;
    if (view.target && view.target.length) minTop = 0;
    drawTarget(x, view, -LX0, -LY0);
    drawSeams(x, view, -LX0, -LY0);
    /* the piece that has just locked is drawn outside the layer while it
       settles, so its 100 ms squash costs four blits, not a repaint */
    var sqPid = squash.on && squash.pid ? squash.pid : -1;
    /* shadows: every block stands a little off the back wall and the key
       light is above and to the left, so each throws a soft shadow down
       and to the right. Drawn solid into their own canvas first, so where
       two overlap they do not double, then laid down at one strength. */
    /* (at half resolution: a shadow is soft by nature, and this is the one
       full-height fill a lock costs) */
    var sx = shx, so = C * 0.1, sy0 = C * 0.15, any = false, hs = 0.5;
    sx.setTransform(hs, 0, 0, hs, 0, 0);
    sx.clearRect(0, 0, layer.width, layer.height);
    var shTop = layer.height;
    for (y = 0; y < TOPROW; y++) {
      if (rowHide[y]) continue;
      var top0 = Math.round(cellTop(y) - rowOff[y] * C) - LY0;
      for (xx = 0; xx < W; xx++) {
        if (!b[y * W + xx]) continue;
        sx.drawImage(shadowSpr, colX[xx] - LX0 + so - shadowSpr.pad, top0 + sy0 - shadowSpr.pad);
        if (top0 < shTop) shTop = top0;
        any = true;
      }
    }
    if (any && quality > 0.4) {
      /* the back wall ends at the face; shadows do not fall on the sky */
      sx.globalCompositeOperation = "destination-in";
      sx.fillStyle = "#000";
      sx.fillRect(WX - LX0, WY - lipD - LY0, WWd, WHd + lipD);
      sx.globalCompositeOperation = "source-over";
      sx.setTransform(1, 0, 0, 1, 0, 0);
      x.globalAlpha = look.unlit ? 0.3 : 0.42;
      var cy0 = Math.max(0, Math.floor(shTop * hs)), ch = shL.height - cy0;
      if (ch > 0) x.drawImage(shL, 0, cy0, shL.width, ch, 0, cy0 / hs, layer.width, ch / hs);
      x.globalAlpha = 1;
    }
    var glow = glowSpr.length && look.emissive > 0.4 && quality > 0.5;
    for (var pass = glow ? 0 : 1; pass < 2; pass++) {
      if (pass === 0) { x.globalCompositeOperation = "lighter"; x.globalAlpha = 0.22; }
      for (y = 0; y < TOPROW; y++) {
        if (rowHide[y]) continue;
        var top = Math.round(cellTop(y) - rowOff[y] * C) - LY0;
        for (xx = 0; xx < W; xx++) {
          i = y * W + xx; v = b[i];
          if (!v) continue;
          pid = p[i];
          if (pass === 0) {
            var gs = glowSpr[v];
            if (gs) x.drawImage(gs, colX[xx] - LX0 - C * 0.6, top - C * 0.6, C * 2.2, C * 2.2);
            continue;
          }
          if (pid === sqPid) continue;
          m = maskAt(b, p, v, pid, xx, y);
          if (!built[v * 32 + m]) tileReady(v, m);
          x.drawImage(atlas, (m & 15) * S, tileY(v, m), S, S, colX[xx] - LX0, top, colX[xx + 1] - colX[xx], S);
          if (top < minTop) minTop = top;
        }
      }
      if (pass === 0) { x.globalCompositeOperation = "source-over"; x.globalAlpha = 1; }
    }
    layerTop = Math.max(0, Math.floor(minTop - C));
  }

  /* Cleared cells turn to light. Each one warms toward white as the glow
     reaches it, then draws in toward its own centre as its particles lift
     away, paling as it shrinks, until it is a point of warm light that
     goes out among them. Fading a whole tile out over the dark wall behind
     it would pass through a muddy grey-brown on the way, which reads as
     the clear going dark; a warm tile drawing in never does, and the
     warmth is held to a change of colour while the tile is large (it may
     pale further only once it is small, when it is no longer an area). Rows sweep left to
     right (or run out along a twisting ribbon); a Quad's four rows melt
     together into one band of light as it rises. */
  function drawClearGhosts(x) {
    var still = optMotion === "still";
    for (var i = 0; i < clears.length; i++) {
      var c = clears[i];
      if (!c.on || c.t0 < 0) continue;
      var age = fxNow - c.t0;
      var peak = Math.max(0.2, c.sync);
      var sweep = c.kind === "quad" ? 0.12 : 0.18;
      /* the warmth's ceiling: as much as stays a change of colour on this
         skin, and less again if the governor turned the band down */
      var warmMax = clearTint * (c.gate === undefined ? 1 : Math.min(1, c.gate));
      for (var k = 0; k < c.cn; k++) {
        var cx = c.cx[k], cy = c.cy[k], v = c.cv[k];
        if (!v) continue;
        var start = peak + sweep * (cx / 9), fade = 0.22;
        if (c.twist && !c.mini) {
          /* the ribbon runs out from the T both ways */
          start = peak + 0.24 * Math.abs(cx - c.tx) / 6;
        } else if (c.kind === "quad") {
          start = 0.04 + 0.25 * peak; fade = Math.max(0.24, 0.6 * peak);
        }
        var u = (age - start) / fade;
        if (u >= 1) continue;
        /* the particles leave a beat before the cell does, so the light
           seems to come out of it */
        if (age >= start - 0.06 && c.spawned < c.parts && !still) {
          var share = Math.ceil(c.parts / Math.max(1, c.cn));
          var nn = Math.min(share, c.parts - c.spawned);
          c.spawned += nn;
          burst(nn, WX + cx * C, cellTop(cy), C, C, c.warm, c.kind === "quad" || c.empty, c.twist && c.n >= 2,
                WX + (c.tx + 0.5) * C, cellTop(c.ty) + C * 0.5);
        }
        var a, sc = 1, w;
        if (still) {
          a = age < 0.15 ? 1 - age / 0.15 : 0;
          w = 0;
        } else if (optMotion === "gentle") {
          /* reduced motion: no drawing in (that is a zoom), just a warm
             cross-fade where the cell was */
          a = u < 0 ? 1 : 1 - smooth(0, 1, u);
          w = u < 0 ? warmMax * smooth(start - 0.16, start, age) : warmMax + (0.5 - warmMax) * smooth(0, 0.8, u);
        } else {
          /* warm as the glow arrives; then it draws in, paling as it goes,
             until what is left is a point of warm light among the motes */
          a = u < 0.75 ? 1 : 1 - smooth(0.75, 1, u);
          sc = u <= 0 ? 1 : 1 - 0.85 * easeOut(u);
          w = u < 0 ? warmMax * smooth(start - 0.16, start, age) : warmMax + (0.7 - warmMax) * smooth(0.5, 0.95, u);
        }
        if (a <= 0) continue;
        /* the leaving cells keep their fused shape among themselves */
        var m = 0;
        for (var q = 0; q < c.cn; q++) {
          if (q === k) continue;
          var same = v === 8 ? (c.cv[q] === 8 && c.cy[q] === cy) : (c.cp[q] === c.cp[k] && c.cp[k] !== 0);
          if (!same) continue;
          var ddx = c.cx[q] - cx, ddy = c.cy[q] - cy;
          if (ddx === -1 && ddy === 0) m |= MW;
          if (ddx === 1 && ddy === 0) m |= ME;
          if (ddx === 0 && ddy === 1 && v !== 8) m |= MN;
          if (ddx === 0 && ddy === -1 && v !== 8) m |= MS;
        }
        /* once it starts to draw in, a cell is its own small light */
        if (sc < 0.97) m = 0;
        tileReady(v, m);
        var lift = u > 0 && optMotion === "full" ? u * C * 0.18 : 0;
        var cw = colX[cx + 1] - colX[cx], dw = cw * sc, dh = S * sc;
        var dx = colX[cx] + (cw - dw) / 2, dy = cellTop(cy) - lift + (S - dh) / 2;
        x.globalAlpha = a;
        x.drawImage(atlas, (m & 15) * S, tileY(v, m), S, S, dx, dy, dw, dh);
        if (w > 0.004) {
          /* laid over the tile, not added: warmer and paler, never a flash */
          glowReady(v, m);
          x.globalAlpha = a * w;
          x.drawImage(glowAtlas, (m & 15) * S, tileY(v, m), S, S, dx, dy, dw, dh);
        }
        x.globalAlpha = 1;
      }
    }
  }

  function drawDrainGhosts(x) {
    if (!drainFx.on || ended) return;
    var u = clamp((now - drainFx.t0) / 1.5, 0, 1), e = 1 - Math.pow(1 - u, 4);
    var floorY = WY + WHd;
    x.save();
    x.beginPath(); x.rect(WX, WY - C * 2, WWd, WHd + C * 2); x.clip();
    for (var y = 0; y < drainFx.rows; y++) {
      var top = Math.round(cellTop(y) + drainFx.rows * e * C);
      if (top >= floorY) continue;
      x.globalAlpha = (1 - u) * (1 - clamp((top - (floorY - C * 2)) / (C * 2), 0, 1) * 0.6);
      for (var xx = 0; xx < W; xx++) {
        var v = drainFx.v[y * W + xx];
        if (!v) continue;
        var m = maskAt(drainFx.v, drainFx.p, v, drainFx.p[y * W + xx], xx, y) & (ME | MW);
        tileReady(v, m);
        x.drawImage(atlas, (m & 15) * S, tileY(v, m), S, S, colX[xx], top, colX[xx + 1] - colX[xx], S);
      }
    }
    x.restore();
    x.globalAlpha = 1;
    if (u < 0.5 && optMotion !== "still" && Math.random() < 0.5) {
      burst(1, WX, floorY - C * 0.3, WWd, C * 0.3, 0.6, true, false, 0, 0);
    }
  }

  /* the end: the stack dissolves into light rising up the shaft */
  function drawEnd(x) {
    if (!endFx.on) return;
    var u = now - endFx.t0, dur = 1.5;
    if (u > dur + 0.6) { endFx.on = false; return; }
    var top = Math.max(1, endFx.top);
    for (var y = 0; y <= endFx.top && y < TOPROW; y++) {
      var start = 0.75 * (y / top);
      for (var xx = 0; xx < W; xx++) {
        var v = endFx.v[y * W + xx];
        if (!v) continue;
        var s = start + ((xx * 7 + y * 3) % 5) * 0.03;
        var t = (u - s) / 0.6;
        if (t >= 1) continue;
        if (t > 0 && t < 0.08 && optMotion !== "still" && Math.random() < 0.45 * quality) {
          var pi = spawnParticle(0, WX + (xx + 0.5) * C, cellTop(y) + C * 0.5, (Math.random() - 0.5) * C * 0.4, -C * (2.5 + Math.random() * 2), -C * 0.8, 1.4, C * 0.5);
          if (optMotion === "gentle") { pVX[pi] = 0; pVY[pi] = 0; pAY[pi] = 0; pLife[pi] = 0.3; }
        }
        var a = t <= 0 ? 1 : 1 - easeOut(t);
        var m = maskAt(endFx.v, endFx.p, v, endFx.p[y * W + xx], xx, y);
        tileReady(v, m);
        x.globalAlpha = a;
        var lift = t > 0 && optMotion === "full" ? t * C * 0.5 : 0;
        x.drawImage(atlas, (m & 15) * S, tileY(v, m), S, S, colX[xx], Math.round(cellTop(y) - lift), colX[xx + 1] - colX[xx], S);
        if (t > 0) {
          x.globalCompositeOperation = "lighter";
          x.globalAlpha = 0.4 * Math.sin(t * Math.PI);
          x.drawImage(dotWarm, colX[xx] - C * 0.3, cellTop(y) - lift - C * 0.3, C * 1.6, C * 1.6);
          x.globalCompositeOperation = "source-over";
        }
        x.globalAlpha = 1;
      }
    }
    /* one soft column of light climbing the shaft */
    if (optMotion !== "still") {
      var cu = clamp(u / dur, 0, 1), colA = endFx.gate * (endFx.surface ? 0.24 : 0.16) * Math.sin(cu * Math.PI);
      x.globalCompositeOperation = "lighter";
      x.globalAlpha = colA;
      var cy = WY + WHd * (1 - cu) - C * 3;
      x.drawImage(bandSpr, WX, cy, WWd, C * 6);
      x.globalCompositeOperation = "source-over";
      x.globalAlpha = 1;
    }
  }

  /* additive light: clear bands, Twist ribbons, the lock's ripple ring */
  function drawLights(x) {
    var i, k;
    x.globalCompositeOperation = "lighter";
    for (i = 0; i < clears.length; i++) {
      var c = clears[i];
      if (!c.on || c.t0 < 0) continue;
      var age = fxNow - c.t0, peak = Math.max(0.2, c.sync);
      var env = age < peak ? smooth(0, peak, age) : 1 - smooth(peak, peak + (c.kind === "quad" ? 0.75 : 0.45), age);
      if (optMotion === "still") env = age < 0.15 ? 1 - age / 0.15 : 0;
      if (env <= 0.003) continue;
      if (c.kind === "quad" && c.n >= 4) {
        /* four rows fuse into one band of soft light */
        var lo = 99, hi = -1;
        for (k = 0; k < c.n; k++) { if (c.rows[k] < lo) lo = c.rows[k]; if (c.rows[k] > hi) hi = c.rows[k]; }
        x.globalAlpha = c.gl * env;
        var bt = cellTop(hi) - C * 0.6, bh = (hi - lo + 1) * C + C * 1.2;
        x.drawImage(bandSpr, WX - C * 0.4, bt - (optMotion === "full" ? (age > peak ? (age - peak) * C * 1.2 : 0) : 0), WWd + C * 0.8, bh);
      } else if (c.twist && !c.mini && optMotion !== "still") {
        for (k = 0; k < c.n; k++) drawRowRibbon(x, c, c.rows[k], age, env);
      } else {
        for (k = 0; k < c.n; k++) {
          x.globalAlpha = c.gl * env;
          x.drawImage(bandSpr, WX - C * 0.3, cellTop(c.rows[k]) - C * 0.45, WWd + C * 0.6, C * 1.9);
        }
      }
    }
    for (i = 0; i < ribbons.length; i++) {
      var r = ribbons[i];
      if (!r.on || r.t0 < 0) continue;
      var ra = fxNow - r.t0, dur = r.mini ? 0.5 : 0.65;
      if (ra > dur + 0.25 || optMotion === "still") { r.on = false; continue; }
      drawSpiral(x, r, ra, dur);
    }
    for (i = 0; i < rings.length; i++) {
      var g = rings[i];
      if (!g.on || g.t0 < 0) continue;
      var ga = fxNow - g.t0;
      if (ga > 0.45) { g.on = false; continue; }
      /* a soft ring of light spreading through the well from where the
         piece came to rest: luminance change 0.05 or less */
      var rad = C * (1 + easeOut(ga / 0.45) * 3), al = g.a * (1 - ga / 0.45);
      if (optMotion === "gentle") rad = C * 1.4;
      x.save();
      x.beginPath(); x.rect(WX, WY - lipD, WWd, WHd + lipD); x.clip();
      x.globalAlpha = al;
      x.drawImage(ringSpr, g.x - rad, g.y - rad * 0.36, rad * 2, rad * 0.72);
      x.restore();
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
  }
  /* A pearl ribbon that twists as it runs out along the cleared row from
     the T, both ways: pearls stamped along a helix seen side-on, wide
     where the ribbon faces you and thin where it turns edge-on. */
  function drawRowRibbon(x, c, row, age, env) {
    var y0 = cellTop(row) + C * 0.5, run = clamp((age - 0.06) / 0.3, 0, 1);
    var cxw = WX + (c.tx + 0.5) * C;
    var a0 = env * Math.min(1, c.gl / 0.22);
    for (var side = -1; side <= 1; side += 2) {
      var reach = side < 0 ? cxw - WX : WX + WWd - cxw, n = 16;
      for (var k = 0; k <= n; k++) {
        var f = k / n;
        if (f > run) break;
        var px = cxw + side * reach * f;
        var ph = (px - cxw) / C * 1.25 * side - age * 8;
        var face = Math.abs(Math.cos(ph));
        var sz = C * (0.22 + 0.5 * face);
        var head = 1 - clamp((run - f) / 0.35, 0, 1);
        x.globalAlpha = a0 * (0.35 + 0.65 * face) * (0.45 + 0.55 * head);
        x.drawImage(dotPearl, px - sz / 2, y0 + Math.sin(ph) * C * 0.16 - sz / 2, sz, sz);
      }
    }
  }
  /* the pearl ribbon spiralling once around the T */
  function drawSpiral(x, r, age, dur) {
    var cx = WX + (r.x + 0.5) * C, cy = cellTop(r.y) + C * 0.5;
    var u = clamp(age / dur, 0, 1), fade = age > dur ? 1 - (age - dur) / 0.25 : 1;
    var n = r.mini ? 9 : 14, R0 = C * (r.mini ? 1.2 : 1.6), R1 = C * (r.mini ? 0.7 : 0.85);
    for (var k = 0; k < n; k++) {
      var t = u - k * 0.022;
      if (t < 0) continue;
      var ang = -Math.PI / 2 + r.dir * t * TAU, rad = R0 + (R1 - R0) * t;
      var px = cx + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad * 0.9;
      var sz = C * (0.62 - k * 0.03) * (r.mini ? 0.75 : 1);
      x.globalAlpha = fade * (1 - k / n) * 0.85;
      x.drawImage(dotPearl, px - sz / 2, py - sz / 2, sz, sz);
    }
  }

  function drawParticles(x) {
    if (!pLive) return;
    var i, s, a, k;
    for (var pass = 0; pass < 2; pass++) {
      x.globalCompositeOperation = pass === 0 ? "lighter" : "source-over";
      for (i = 0; i < PMAX; i++) {
        if (!pOn[i]) continue;
        k = pKind[i];
        var add = ADDITIVE[KINDS[k]] ? 0 : 1;
        if (add !== pass) continue;
        var u = pAge[i] / pLife[i];
        a = u < 0.12 ? u / 0.12 : u > 0.55 ? 1 - (u - 0.55) / 0.45 : 1;
        if (a <= 0) continue;
        s = pSize[i];
        x.globalAlpha = a * pA[i] * (pass === 0 ? 0.85 : 0.95);
        var spr = kindSpr[k];
        if (!spr) continue;
        if (KINDS[k] === "leaf" || KINDS[k] === "petal" || KINDS[k] === "flake") {
          localT(x, 1, pRot[i], pX[i], pY[i]);
          x.drawImage(spr, -s / 2, -s / 2, s, s);
          wellT(x);
        } else x.drawImage(spr, pX[i] - s / 2, pY[i] - s / 2, s, s);
      }
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
  }

  /* The landing light (brief §7.5): pools where the piece will rest, two
     hairline rails down from its outer columns, and corner ticks around
     the landing box. Never a copy of the piece. Drawn from the logic. */
  function drawLanding(x, view) {
    var a = view.active, g = view.ghost;
    if (!optLanding || !a || !g || ended) return;
    var b = view.board, k, j;
    var hc = look && look.unlit ? 1 : 0.85;
    var minX = 99, maxX = -1, minY = 99, maxY = -1, aMinY = 99;
    for (k = 0; k < 4; k++) {
      if (g[k][0] < minX) minX = g[k][0];
      if (g[k][0] > maxX) maxX = g[k][0];
      if (g[k][1] < minY) minY = g[k][1];
      if (g[k][1] > maxY) maxY = g[k][1];
      if (a.cells[k][1] < aMinY) aMinY = a.cells[k][1];
    }
    /* (1) pools on what it will rest on */
    x.globalCompositeOperation = "lighter";
    for (k = 0; k < 4; k++) {
      var gx = g[k][0], gy = g[k][1], self = false;
      for (j = 0; j < 4; j++) if (g[j][0] === gx && g[j][1] === gy - 1) self = true;
      if (self) continue;
      if (gy > 0 && !b[(gy - 1) * W + gx]) continue;
      var py = cellTop(gy) + C;
      x.globalAlpha = 0.8 * hc;
      x.drawImage(poolSpr, WX + (gx - 0.3) * C, py - C * 0.3, C * 1.6, C * 0.72);
    }
    x.globalCompositeOperation = "source-over";
    /* (2) rails, from the piece's outer columns down to where it lands */
    var r0 = cellTop(aMinY) + C, r1 = cellTop(minY) + C;
    if (r1 - r0 > C * 0.5) {
      var lw = Math.max(1, Math.round(dpr));
      x.globalAlpha = 0.42 * hc;
      x.drawImage(railSpr, colX[minX], r0, lw, r1 - r0);
      x.drawImage(railSpr, colX[maxX + 1] - lw, r0, lw, r1 - r0);
    }
    /* (3) corner ticks round the landing box */
    var l = colX[minX], rr = colX[maxX + 1], t = cellTop(maxY), bt = cellTop(minY) + C;
    var tl = Math.round(C * 0.24), tw = Math.max(1, Math.round(dpr * 1.25));
    x.globalAlpha = 0.85 * hc;
    x.fillStyle = keyCss;
    x.fillRect(l, t, tl, tw); x.fillRect(l, t, tw, tl);
    x.fillRect(rr - tl, t, tl, tw); x.fillRect(rr - tw, t, tw, tl);
    x.fillRect(l, bt - tw, tl, tw); x.fillRect(l, bt - tl, tw, tl);
    x.fillRect(rr - tl, bt - tw, tl, tw); x.fillRect(rr - tw, bt - tl, tw, tl);
    x.globalAlpha = 1;
  }

  function drawTrails(x) {
    for (var i = 0; i < trails.length; i++) {
      var tr = trails[i];
      if (!tr.on) continue;
      var u = (now - tr.t0) / 0.12;
      if (u >= 1 || optMotion === "still") { tr.on = false; continue; }
      var spr = streakSpr[tr.type];
      if (!spr) continue;
      x.globalCompositeOperation = "lighter";
      x.globalAlpha = 0.3 * (1 - u);
      for (var k = 0; k < tr.n; k++) {
        var top = cellTop(tr.y0[k]), bot = cellTop(tr.y1[k]) + C * 0.2;
        x.drawImage(spr, colX[tr.xs[k]] + C * 0.12, top, C * 0.76, Math.max(1, bot - top));
      }
      x.globalCompositeOperation = "source-over";
      x.globalAlpha = 1;
    }
  }

  function drawActive(x, view) {
    var a = view.active;
    if (!a || !aHave || ended) return;
    var ty = typeId(a.type);
    if (ty < 1 || ty > 7) return;
    var spr = pieceSprite(ty, a.rot);
    /* check the sprite really is this piece's shape; if an engine ever
       disagrees, rebuild from the cells it reports */
    var minX = 99, maxY = -99, k;
    for (k = 0; k < 4; k++) { if (a.cells[k][0] < minX) minX = a.cells[k][0]; if (a.cells[k][1] > maxY) maxY = a.cells[k][1]; }
    if (minX - a.x !== spr.minX || maxY - a.y !== spr.maxY) {
      var rel = [];
      for (k = 0; k < 4; k++) rel.push([a.cells[k][0] - a.x, a.cells[k][1] - a.y]);
      spr = pieceSpr[ty * 4 + (a.rot & 3)] = assemble(ty, rel, S, Math.round(S * 0.6), 0.42);
    }
    var ox = (dX - a.x) * C, oy = -(dY - a.y) * C;
    var left = WX + (a.x + spr.minX) * C - spr.pad + ox, top = cellTop(a.y + spr.maxY) - spr.pad + oy;
    var pivX = WX + (a.x + 0.5 + PIVOT_X[ty]) * C + ox, pivY = cellTop(a.y) + C * (0.5 - PIVOT_Y[ty]) + oy;
    var ang = 0, sc = 1, gx = 0, gy = 0;
    if (rotT0 >= 0) {
      var ru = (now - rotT0) / 0.075;
      if (ru >= 1) rotT0 = -1; else ang = rotFrom * (1 - spring(ru));
    }
    if (bumpT0 >= 0) {
      var bu = (now - bumpT0) / 0.06;
      if (bu >= 1) bumpT0 = -1;
      else if (bumpRot) ang += Math.sin(bu * Math.PI) * 0.035 * lastRotDir;
      else gx += Math.sin(bu * Math.PI) * dpr * bumpDir;
    }
    if (glideT0 >= 0) {
      var gu = (now - glideT0) / 0.09;
      if (gu >= 1) glideT0 = -1;
      else { var e = 1 - easeOut(gu); gx += glideFX * e; gy += glideFY * e; sc = glideFS + (1 - glideFS) * easeOut(gu); }
    }
    var tx = pivX + gx, tyy = pivY + gy;
    if (ang !== 0 || sc !== 1) {
      localT(x, sc, ang, tx, tyy);
      x.drawImage(spr.c, left - pivX, top - pivY);
      wellT(x);
    } else x.drawImage(spr.c, Math.round(left + gx), Math.round(top + gy));
    /* the glint of a turn, brighter if it kicked */
    if (glintT0 >= 0) {
      var gl = (now - glintT0) / 0.16;
      if (gl >= 1) glintT0 = -1;
      else {
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = 0.28 * glintK * (1 - gl);
        x.drawImage(dotPearl, tx - C * 1.2, tyy - C * 1.2, C * 2.4, C * 2.4);
        x.globalCompositeOperation = "source-over";
        x.globalAlpha = 1;
      }
    }
    /* a soft drop leaves a faint streak */
    if (softT0 >= 0 && now - softT0 < 0.1 && optMotion === "full") {
      var ss = streakSpr[ty];
      x.globalCompositeOperation = "lighter";
      x.globalAlpha = 0.16 * (1 - (now - softT0) / 0.1);
      x.drawImage(ss, left + spr.pad, top + spr.pad - C * 1.2, spr.cols * C, C * 1.4);
      x.globalCompositeOperation = "source-over";
      x.globalAlpha = 1;
    }
    drawLockLight(x, view, a, ox, oy);
  }

  /* the lock light: a thin light along the bottom of a grounded piece,
     draining as the lock timer runs, with a pip for each reset left */
  function drawLockLight(x, view, a, ox, oy) {
    if (!optLock || !view.ghost) return;
    var g = view.ghost, k, grounded = true;
    for (k = 0; k < 4; k++) if (g[k][1] !== a.cells[k][1] || g[k][0] !== a.cells[k][0]) grounded = false;
    if (!grounded) return;
    var minY = 99, minX = 99, maxX = -1;
    for (k = 0; k < 4; k++) if (a.cells[k][1] < minY) minY = a.cells[k][1];
    for (k = 0; k < 4; k++) if (a.cells[k][1] === minY) { if (a.cells[k][0] < minX) minX = a.cells[k][0]; if (a.cells[k][0] > maxX) maxX = a.cells[k][0]; }
    var y = cellTop(minY) + C - Math.max(2, Math.round(dpr * 1.5)) + oy;
    var l = colX[minX] + C * 0.16 + ox, w = colX[maxX + 1] - colX[minX] - C * 0.32;
    var left = 1 - clamp(view.lock || 0, 0, 1), lw = w * left;
    x.globalCompositeOperation = "lighter";
    x.globalAlpha = 0.9;
    x.fillStyle = keyCss;
    x.fillRect(l + (w - lw) / 2, y, lw, Math.max(1, Math.round(dpr * 1.5)));
    var used = clamp(view.lockResets || 0, 0, 15);
    if (used > 0) {
      var pr = Math.max(1, dpr * 0.9), gap = Math.min(w / 15, pr * 4), px0 = l + w / 2 - gap * 7;
      for (k = 0; k < 15; k++) {
        x.globalAlpha = k < 15 - used ? 0.75 : 0.18;
        x.fillRect(px0 + k * gap - pr / 2, y + pr * 2.5, pr, pr);
      }
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = "source-over";
  }

  function drawKeep(x, view) {
    if (!L.keep || !view.keep) return;
    var k = L.keep, cx = (k.x + k.w / 2) * dpr, cy = (k.y + k.h / 2) * dpr;
    /* the rim glows while Keep is free to use */
    var avail = !view.holdUsed;
    var pulse = keepPulseT0 >= 0 ? clamp(1 - (now - keepPulseT0) / 0.5, 0, 1) : 0;
    var ga = (avail ? 0.55 : 0.08) + pulse * 0.4;
    if (nicheGlow && ga > 0.01) {
      x.globalCompositeOperation = "lighter";
      x.globalAlpha = Math.min(1, ga);
      x.drawImage(nicheGlow.c, Math.round(k.x * dpr) - nicheGlow.m, Math.round(k.y * dpr) - nicheGlow.m);
      x.globalCompositeOperation = "source-over";
      x.globalAlpha = 1;
    }
    var ty = typeId(view.hold);
    if (keepT0 >= 0) {
      var u = (now - keepT0) / 0.12;
      if (u >= 1 || optMotion !== "full") keepT0 = -1;
      else {
        var e = easeOut(u), spr = keepType >= 1 && keepType <= 7 ? pieceSprite(keepType, 0) : null;
        if (spr) {
          var sc = 1 + (k.s - 1) * e;
          var px = keepFX + (cx - keepFX) * e, py = keepFY + (cy - keepFY) * e;
          localT(x, sc, 0, px, py);
          x.drawImage(spr.c, -spr.c.width / 2, -spr.c.height / 2);
          wellT(x);
        }
        return;
      }
    }
    if (ty >= 1 && ty <= 7) {
      var ks = keepSprite(ty);
      x.drawImage(ks.c, Math.round(cx - ks.c.width / 2), Math.round(cy - ks.c.height / 2));
    }
  }

  function drawPreviews(x, view) {
    var q = view.queue, n = Math.min(optPreviews, L.next ? L.next.length : 0, q ? q.length : 0);
    if (n <= 0) return;
    var adv = advT0 >= 0 && optMotion === "full" ? (now - advT0) / 0.22 : 1;
    if (adv >= 1) { adv = 1; advT0 = -1; }
    var e = easeOut(adv);
    var bobK = optMotion === "full" ? C * 0.045 : 0;
    for (var i = 0; i < n; i++) {
      var ty = typeId(q[i]);
      if (ty < 1 || ty > 7) continue;
      var spr = prevSprite(i, ty);
      var r = L.next[i], cx = (r.x + r.w / 2) * dpr, cy = (r.y + r.h / 2) * dpr;
      cy += Math.sin(now * TAU * 0.09 + i * 1.7) * bobK;
      var sc = 1, a = 1;
      if (e < 1) {
        /* everything moves up one place: from the slot behind */
        var from = L.next[i + 1];
        if (from) {
          var fx = (from.x + from.w / 2) * dpr, fy = (from.y + from.h / 2) * dpr;
          cx = fx + (cx - fx) * e; cy = fy + (cy - fy) * e;
          sc = (from.s / r.s) + (1 - from.s / r.s) * e;
        } else a = e;
      }
      /* the later ones hang a little further off in the air */
      x.globalAlpha = a * (1 - (L.shape === "wide" ? 0.12 : 0.08) * i);
      if (sc !== 1) {
        localT(x, sc, 0, cx, cy);
        x.drawImage(spr.c, -spr.c.width / 2, -spr.c.height / 2);
        wellT(x);
      } else x.drawImage(spr.c, Math.round(cx - spr.c.width / 2), Math.round(cy - spr.c.height / 2));
    }
    x.globalAlpha = 1;
  }

  /* the rim: Breath beads, the shaft breathing with Breath, the Unbroken filament,
     and a passing shimmer for a personal best or a chapter's end */
  function drawRim(x, view) {
    var br = view.breath;
    if (br) {
      var charge = clamp(br.charge || 0, 0, 20);
      var y0 = WY + WHd + floorD * 0.62, sp = WWd / 20, rad = Math.max(2, Math.min(C * 0.16, sp * 0.36));
      for (var i = 0; i < 20; i++) {
        var bx = WX + (i + 0.5) * sp;
        var on = i < charge;
        if (on) {
          x.globalCompositeOperation = "lighter";
          x.globalAlpha = i < 10 && charge >= 10 ? 0.55 : 0.4;
          x.drawImage(beadOn, bx - rad * 2, y0 - rad * 2, rad * 4, rad * 4);
          x.globalCompositeOperation = "source-over";
        } else {
          x.globalAlpha = 0.8;
          x.drawImage(beadOff, bx - rad * 1.4, y0 - rad * 1.4, rad * 2.8, rad * 2.8);
        }
      }
      x.globalAlpha = 1;
      /* a Breath: the shaft's light breathes with it, 4 s in and 6 s out,
         a change of light and nothing else (so reduced motion keeps it) */
      if (br.active && rimGlow) {
        var ph = clamp(br.phase || 0, 0, 1), cyc = (ph * 10) % 10;
        var lvl = cyc < 4 ? smooth(0, 4, cyc) : 1 - smooth(4, 10, cyc);
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = 0.04 + lvl * 0.14;
        x.drawImage(rimGlow.c, WX, WY, WWd, WHd);
        x.globalCompositeOperation = "source-over";
        x.globalAlpha = 1;
      }
    }
    /* Unbroken: a thin gold filament along the rim while the chain lives */
    filament.a += ((filament.on ? 1 : 0) - filament.a) * (1 - Math.exp(-frameDt / (filament.on ? 0.15 : 0.6)));
    if (filament.a > 0.01) {
      var fy = WY - lipD + Math.round(C * 0.05), fw = Math.max(1, Math.round(dpr));
      var fx0 = WX, fx1 = WX + WWd;
      if (L.keep && L.shape === "tall") fx0 = Math.max(fx0, Math.round((L.keep.x + L.keep.w) * dpr) + Math.round(C * 0.2));
      x.globalCompositeOperation = "lighter";
      x.globalAlpha = 0.5 * filament.a;
      x.fillStyle = "rgb(214,178,112)";
      x.fillRect(fx0, fy, fx1 - fx0, fw);
      /* a bead of light runs along it, slowly */
      var run = ((now * 0.16) % 1) * (fx1 - fx0);
      x.globalAlpha = 0.45 * filament.a;
      x.drawImage(dotWarm, fx0 + run - C * 0.5, fy - C * 0.18, C, C * 0.36 + fw);
      x.globalCompositeOperation = "source-over";
      x.globalAlpha = 1;
    }
    if (shimmer.t0 >= 0) {
      var su = (now - shimmer.t0) / 1.1;
      if (su >= 1) shimmer.t0 = -1;
      else {
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = shimmer.a * Math.sin(su * Math.PI) * 0.6;
        var sx = bodyL + su * bodyW;
        x.drawImage(dotWarm, sx - C, WY - lipD - C * 0.5, C * 2, C);
        x.globalCompositeOperation = "source-over";
        x.globalAlpha = 1;
      }
    }
  }

  /* a 2D context can be lost too, under memory pressure; bake again */
  function restored() { if (L) { rebuildAtlas(); rebuildWells(); skyDirty = true; } }
  if (canvas.addEventListener) canvas.addEventListener("contextrestored", restored);

  return R;
}

var Gfx2D = { create: create };

if (typeof module !== "undefined" && module.exports) module.exports = Gfx2D;
else root.Gfx2D = Gfx2D;
})(typeof self !== "undefined" ? self : this);
