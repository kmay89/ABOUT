/* fx.js — the board's big moments.

   Most of a game of chess is quiet, and should be: a piece is picked
   up, carried, set down, and the room says nothing. But a game has
   punctuation too — a capture, a check, a pawn that becomes a queen, a
   king that has nowhere left to go — and a board that marks all of
   those exactly the same as a quiet move is a board that is not paying
   attention. This file is how the room pays attention.

   It is a layer of light laid over the board: a canvas inside the
   stage that the pieces never touch and fingers pass straight through.
   A capture is a blow, so it gets a shockwave across the wood, a spray
   of sparks and a few chips of whatever was taken, in that piece's own
   colour, scattering and bouncing to rest — a pawn a little, a queen a
   lot. A check is a warm pulse running out from the king. A promotion
   is a column of light rising out of the square. A mate is the one
   moment worth all of it at once: a burst from the king, and a band of
   light passing over the whole board like a lamp carried across a
   table. Gold when you won it, a soft cool grey-blue when you did not,
   and a neutral gold when two people at the same board share it.

   And then a second layer over the whole page, for the end of the
   game: confetti that flutters and tumbles and catches the light the
   way paper does, a few fireworks, sparkles around a number as it
   counts up — the rating you just earned, say — and the small physical
   things that make a screen feel like an object: a shake, a buzz.

   Three rules hold it in place, because a room this warm is easy to
   spoil.

   It is light, not noise. Everything is drawn from a handful of
   procedural sprites — a glow, a soft puff, a four-pointed star —
   painted once and stamped, with no filters and no blur in the frame
   loop, so a phone can draw four hundred of them without noticing.
   There is a hard ceiling of four hundred live particles; a storm of
   confetti and fireworks together is held to it, and a slow device is
   noticed (frame time, not a user agent) and quietly given fewer.

   It is asleep when nothing is happening. The loop runs only while
   something is alive, the layers are hidden when it stops, and an idle
   board costs exactly nothing.

   And it respects stillness. Under prefers-reduced-motion it draws
   nothing at all — the toppled king and the words on the card say
   what happened — and a number that would have counted up simply
   arrives.

   Squares are 0x88, like everywhere else. Where a square is on screen
   is the renderer's business, not this file's: setProjector hands over
   a function that answers that question, and effects that belong to a
   square ask it again every frame, so a spark stays on its square while
   the camera orbits or pushes in. Tested by chess/tools/fx-check.js in a
   real browser over tools/fx-preview.html.                             */
(function (root) {
"use strict";

var HAS_DOM = typeof document !== "undefined" && typeof document.createElement === "function";
var MAX = 400;

/* ---------- small arithmetic ---------- */
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(list) { return list[(Math.random() * list.length) | 0]; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
function easeInOutSine(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }
function now() {
  return root.performance && typeof root.performance.now === "function" ? root.performance.now() : Date.now();
}

/* ---------- colour ----------
   Everything arrives as hex, the way skins.js speaks. Nothing here
   trusts it: a colour that does not parse is warm white, not a crash. */
function rgbOf(c) {
  if (typeof c !== "string") return [255, 244, 224];
  var h = c.charAt(0) === "#" ? c.slice(1) : c;
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [255, 244, 224];
  var n = parseInt(h, 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function hexOf(c) {
  var n = (clamp(Math.round(c[0]), 0, 255) << 16) | (clamp(Math.round(c[1]), 0, 255) << 8) |
          clamp(Math.round(c[2]), 0, 255);
  return "#" + (0x1000000 + n).toString(16).slice(1);
}
function mixHex(a, b, t) {
  var x = rgbOf(a), y = rgbOf(b);
  return hexOf([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}
/* f > 0 toward white, f < 0 toward black */
function shade(hex, f) { return f >= 0 ? mixHex(hex, "#ffffff", f) : mixHex(hex, "#000000", -f); }
function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

/* the men's own colours, for when a caller says "white" rather than
   handing over the skin's hex: ivory and a warm ebony */
var SIDE = { "1": "#efe3cc", "-1": "#3b3029", w: "#efe3cc", b: "#3b3029" };
function pieceColour(c) {
  if (c == null) return SIDE["1"];
  if (typeof c === "number") return c < 0 ? SIDE["-1"] : SIDE["1"];
  if (SIDE[c]) return SIDE[c];
  return hexOf(rgbOf(c));
}
/* how big a capture is, by what was taken: a pawn is a tap, a queen is
   a blow */
var PIECE_POWER = [0.5, 0.30, 0.55, 0.58, 0.74, 1.0, 1.0];

/* the three moods a game can end in */
var MOOD = {
  win:  { core: "#fff7e2", glow: "#ffc75e", ring: "#ffe0a0", sweep: "#ffe6ad",
          spark: ["#fff2c8", "#ffd56e", "#ffb54c", "#ffe9b0"], ember: "#ffd27a" },
  loss: { core: "#eef3fb", glow: "#9fb5d6", ring: "#c9d7ec", sweep: "#d3def0",
          spark: ["#e3ebf7", "#b4c6e2", "#93a9cb"], ember: "#b9c9e2" },
  even: { core: "#fff5e4", glow: "#ecc98a", ring: "#f3dcae", sweep: "#f4e4c0",
          spark: ["#fbeccc", "#efd093", "#dcb676"], ember: "#f0d49a" }
};
/* paper in the room's own colours, with a little cool in it so the
   warm ones read as warm */
var CONFETTI = ["#f2c14e", "#f6ead2", "#e8835a", "#5fb3a1", "#d96c8a", "#8fb8de", "#f19a3e", "#c7a4e0"];
var FIREWORK = ["#ffd36b", "#ff9f6b", "#f6ead2", "#7fd1c0", "#e88aa6", "#a9c4ff"];
/* the sparks off a capture: mostly amber and orange, which still read
   as light on a cream square, a few white-hot */
var SPARKS = ["#fff3d6", "#ffd27a", "#ffb347", "#ffb347", "#ff9a3c", "#ffc864"];

/* ---------- sprites ----------
   Every soft thing on screen is one of three little pictures, painted
   once per colour on an ordinary canvas and stamped with drawImage.
   Stamping is the one canvas operation every phone is fast at; a
   gradient built per particle per frame is the one it is slowest at. */
var sprites = {}, spriteCount = 0;
function sprite(kind, hex) {
  var key = kind + hex;
  var hit = sprites[key];
  if (hit) return hit;
  if (spriteCount > 96) { sprites = {}; spriteCount = 0; }
  var S = 64, r = S / 2, c = document.createElement("canvas");
  c.width = c.height = S;
  var g = c.getContext("2d"), rgb = rgbOf(hex), hot = rgbOf(mixHex(hex, "#ffffff", 0.65)), gr;
  if (kind === "glow") {
    /* light: a white-hot centre, the colour around it, a long falloff */
    gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.10, rgba(hot, 0.95));
    gr.addColorStop(0.32, rgba(rgb, 0.50));
    gr.addColorStop(0.66, rgba(rgb, 0.12));
    gr.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  } else if (kind === "soft") {
    /* a puff of dust: no hot centre, just colour thinning out */
    gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, rgba(rgb, 0.55));
    gr.addColorStop(0.5, rgba(rgb, 0.28));
    gr.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  } else {
    /* a star: four tapering rays and a small glow where they cross —
       the shape a bright point makes through an eyelash */
    g.globalCompositeOperation = "lighter";
    gr = g.createRadialGradient(r, r, 0, r, r, r * 0.42);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, rgba(hot, 0.7));
    gr.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    for (var i = 0; i < 4; i++) {
      var a = i * Math.PI / 2, len = i % 2 ? r * 0.78 : r * 0.98, wid = r * 0.085;
      var ca = Math.cos(a), sa = Math.sin(a);
      var lg = g.createLinearGradient(r, r, r + ca * len, r + sa * len);
      lg.addColorStop(0, "rgba(255,255,255,0.95)");
      lg.addColorStop(0.4, rgba(hot, 0.55));
      lg.addColorStop(1, rgba(rgb, 0));
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(r - sa * wid, r + ca * wid);
      g.lineTo(r + ca * len, r + sa * len);
      g.lineTo(r + sa * wid, r - ca * wid);
      g.closePath();
      g.fill();
    }
  }
  sprites[key] = c; spriteCount++;
  return c;
}

/* ---------- the two layers ----------
   The stage layer sits inside the board's own box, above the board
   canvases and below everything else that lives there (the name bars,
   the toast), so a spark never covers a clock. The page layer is fixed
   over the whole window, above the end-of-game card, for the moments
   that belong to the card rather than the board. It is made the first
   time something asks for it. */
function makeLayer(fixed) {
  return { cv: null, ctx: null, w: 0, h: 0, dpr: 1, fixed: fixed, host: null, shown: false, used: false };
}
var stageL = makeLayer(false), pageL = makeLayer(true);

function styleLayer(cv, fixed) {
  var st = cv.style;
  st.position = fixed ? "fixed" : "absolute";
  st.left = "0"; st.top = "0"; st.width = "100%"; st.height = "100%";
  st.pointerEvents = "none";
  st.display = "block";
  st.visibility = "hidden";
  /* the end card is z-index 20; the update banner 40 and the splash 50
     stay above a celebration */
  if (fixed) st.zIndex = "30";
  cv.setAttribute("aria-hidden", "true");
  cv.className = fixed ? "fx-page" : "fx-stage";
}
function pageLayer() {
  if (!HAS_DOM) return null;
  if (!pageL.cv) {
    pageL.cv = document.createElement("canvas");
    styleLayer(pageL.cv, true);
    pageL.ctx = pageL.cv.getContext("2d");
  }
  if (!pageL.cv.parentNode && document.body) document.body.appendChild(pageL.cv);
  return pageL.ctx ? pageL : null;
}
function layerFor(name) {
  if (name === "page") return pageLayer();
  return stageL.ctx && stageL.host ? stageL : null;
}
/* sized to its box at the device's pixel density — capped at 2 over
   the board, 1.5 over the whole page (a tablet's full screen at 2x is
   sixteen megabytes of canvas for paper that does not need to be
   sharp), and dropped to 1 when the device has shown it is struggling */
function sizeLayer(L) {
  if (!L || !L.cv) return false;
  var w, h;
  if (L.fixed) { w = root.innerWidth || 0; h = root.innerHeight || 0; }
  else { w = L.host ? L.host.clientWidth : 0; h = L.host ? L.host.clientHeight : 0; }
  var dpr = Math.min(quality < 0.6 ? 1 : L.fixed ? 1.5 : 2, root.devicePixelRatio || 1);
  if (w !== L.w || h !== L.h || dpr !== L.dpr) {
    L.w = w; L.h = h; L.dpr = dpr;
    L.cv.width = Math.max(1, Math.round(w * dpr));
    L.cv.height = Math.max(1, Math.round(h * dpr));
  }
  return w > 0 && h > 0;
}
function showLayer(L, on) {
  if (!L.cv || L.shown === on) return;
  L.shown = on;
  L.cv.style.visibility = on ? "visible" : "hidden";
}

/* ---------- state ---------- */
var reduced = false, projector = null;
var quality = 1, ema = 16.7, lastCull = 0;
var looping = false, loopId = 0, lastT = 0, frames = 0, peak = 0, dropped = 0, frameNo = 0;

function prefersReduced() {
  try {
    return typeof root.matchMedia === "function" &&
           root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) { return false; }
}
reduced = prefersReduced();

/* ---------- particles ----------
   One shape of object for everything, recycled rather than collected,
   so a big moment makes no garbage for the collector to stop the board
   over halfway through. */
var GLOW = 1, RING = 2, SPARK = 3, CHIP = 4, DUST = 5, CONF = 6, STAR = 7, BEAM = 8,
    SWEEP = 9, WASH = 10, ROCKET = 11, EMBER = 12;
/* which of them are light (added) and which are matter (laid over) */
var LIGHT = {};
LIGHT[GLOW] = LIGHT[RING] = LIGHT[SPARK] = LIGHT[STAR] = LIGHT[BEAM] = LIGHT[SWEEP] =
  LIGHT[WASH] = LIGHT[ROCKET] = LIGHT[EMBER] = true;
/* which of them can be thinned on a slow frame without anybody missing
   them: the many small ones, never the one ring that says what happened */
var THIN = {};
THIN[SPARK] = THIN[CONF] = THIN[EMBER] = THIN[STAR] = THIN[DUST] = THIN[CHIP] = true;

function Particle() {
  this.layer = null; this.kind = 0; this.an = null;
  this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.g = 0; this.drag = 0;
  this.age = 0; this.life = 1; this.size = 0; this.size1 = 0;
  this.rot = 0; this.vrot = 0; this.ph = 0; this.vph = 0;
  this.a = 1; this.k = 1; this.w = 0; this.hh = 0; this.h = 0; this.vh = 0;
  this.col = "#ffffff"; this.col2 = "#ffffff"; this.col3 = "#ffffff"; this.spr = null;
  this.trail = 0; this.twinkle = 0; this.seed = 0; this.round = false; this.bounces = 0;
}
var P = [], spare = [];

/* make room by retiring whatever was going to go soonest — a big moment
   arriving in the middle of a celebration takes the oldest confetti,
   not the other way round */
function steal() {
  var best = -1, left = 1e9;
  for (var i = 0; i < P.length; i++) {
    var p = P[i];
    if (p.age < 0) continue;
    var l = p.life - p.age;
    if (l < left) { left = l; best = i; }
  }
  if (best < 0) return false;
  retire(best);
  return true;
}
function retire(i) {
  var p = P[i], last = P.pop();
  if (i < P.length) P[i] = last;
  p.an = null; p.spr = null; p.layer = null;
  spare.push(p);
}
function make(L, kind, an) {
  if (P.length >= MAX && !steal()) { dropped++; return null; }
  var p = spare.pop() || new Particle();
  p.layer = L; p.kind = kind; p.an = an || null;
  p.vx = p.vy = p.g = p.drag = 0; p.age = 0; p.life = 1000;
  p.rot = p.vrot = p.ph = p.vph = 0; p.a = 1; p.k = 1; p.h = p.vh = 0;
  p.trail = 0; p.twinkle = 0; p.seed = Math.random(); p.round = false; p.bounces = 0;
  p.spr = null;
  P.push(p);
  if (P.length > peak) peak = P.length;
  L.used = true;
  return p;
}

/* ---------- where things are ----------
   An effect that belongs to a square is anchored to it: the projector
   is asked once a frame where the square is now, and the whole effect
   is moved by however far it has gone since it began. */
function project(sq, lift) {
  if (!projector) return null;
  var p;
  try { p = projector(sq, lift || 0); } catch (e) { return null; }
  if (!p || !isFinite(p.x) || !isFinite(p.y)) return null;
  var s = p.s > 0 ? p.s : 48;
  return { x: p.x, y: p.y, s: s, sy: p.sy > 0 ? p.sy : s };
}
/* a square or a point: {x, y, s} is taken as-is, in stage pixels */
function where(target, lift) {
  if (target && typeof target === "object") {
    var s = target.s > 0 ? target.s : 48;
    return { x: +target.x || 0, y: +target.y || 0, s: s, sy: target.sy > 0 ? target.sy : s, an: null,
             up: { x: 0, y: -s * 0.3 } };
  }
  if (target == null || target < 0) return null;
  var g = project(target, 0);
  if (!g) return null;
  /* the middle of the man standing there, as well as the square under
     him: a burst comes out of the king, a ring runs out across the wood */
  var b = project(target, lift == null ? 0.45 : lift) || g;
  g.an = { sq: target, x0: g.x, y0: g.y, dx: 0, dy: 0, f: -1 };
  g.up = { x: b.x - g.x, y: b.y - g.y };
  return g;
}
/* how flat a circle on the board looks from here */
function flatOf(w) { return clamp(w.sy / w.s, 0.35, 1); }

function ready(L) { return !reduced && HAS_DOM && !!L && sizeLayer(L); }

/* ---------- spawners ----------
   Short, positional, and unglamorous on purpose: every effect below is
   a recipe of these, so its shape is readable at a glance. */
function glow(L, an, x, y, size, size1, life, alpha, hex, k, delay) {
  var p = make(L, GLOW, an); if (!p) return null;
  p.x = x; p.y = y; p.size = size; p.size1 = size1; p.life = life; p.a = alpha;
  p.spr = sprite("glow", hex); p.k = k || 1; p.age = -(delay || 0);
  return p;
}
function ring(L, an, x, y, r0, r1, w0, w1, life, alpha, hex, k, delay) {
  var p = make(L, RING, an); if (!p) return null;
  p.x = x; p.y = y; p.size = r0; p.size1 = r1; p.w = w0; p.hh = w1; p.life = life; p.a = alpha;
  p.col = hex; p.k = k || 1; p.age = -(delay || 0);
  return p;
}
function spark(L, an, x, y, vx, vy, g, drag, life, width, hex, trail, delay) {
  var p = make(L, SPARK, an); if (!p) return null;
  p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.g = g; p.drag = drag; p.life = life;
  p.size = width; p.col = hex; p.trail = trail; p.age = -(delay || 0);
  return p;
}
function star(L, an, x, y, vx, vy, g, drag, life, size, hex, delay) {
  var p = make(L, STAR, an); if (!p) return null;
  p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.g = g; p.drag = drag; p.life = life;
  p.size = size; p.spr = sprite("star", hex); p.rot = rnd(0, Math.PI / 2); p.vrot = rnd(-1.2, 1.2);
  p.age = -(delay || 0);
  return p;
}
function ember(L, an, x, y, vx, vy, g, drag, life, size, hex, delay) {
  var p = make(L, EMBER, an); if (!p) return null;
  p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.g = g; p.drag = drag; p.life = life;
  p.size = size; p.spr = sprite("glow", hex); p.twinkle = 1; p.ph = rnd(0, 6.28); p.vph = rnd(2, 5);
  p.age = -(delay || 0);
  return p;
}

/* ---------- the moments ---------- */

/* A capture is a blow. The light under the square comes from the
   renderer (R.impact); this is everything that comes off it: a
   shockwave running out across the wood, sparks, a puff of dust, and a
   few chips of the piece that was taken, thrown up and bouncing to rest
   on the board — flattened into the board's own perspective, so on the
   carved board they land on the wood rather than on the glass. */
function capture(target, o) {
  o = o || {};
  var L = stageL;
  if (!ready(L)) return 0;
  var w = where(target, 0.35);
  if (!w) return 0;
  var power = o.power != null ? clamp(+o.power || 0, 0, 1)
            : PIECE_POWER[Math.abs(o.piece | 0)] != null ? PIECE_POWER[Math.abs(o.piece | 0)] : 0.5;
  var col = pieceColour(o.color);
  var s = w.s, k = flatOf(w), x = w.x, y = w.y, an = w.an, n0 = P.length, i, a, sp;
  var bx = x + w.up.x * 0.6, by = y + w.up.y * 0.6;
  var q = quality;

  /* the flash at the moment of contact */
  glow(L, an, bx, by, s * 0.5, s * (1.1 + 0.9 * power), 230 + 140 * power, 0.85, "#ffd9a3", 1, 0);
  /* the shockwave, lying on the board */
  ring(L, an, x, y, s * 0.26, s * (0.85 + 0.85 * power), s * (0.10 + 0.05 * power), s * 0.01,
       380 + 240 * power, 0.85, "#ffe2b8", k, 0);
  if (power > 0.6) {
    ring(L, an, x, y, s * 0.3, s * (1.3 + 1.0 * power), s * 0.05, s * 0.006,
         620 + 260 * power, 0.42, "#ffd08a", k, 70);
  }
  /* sparks: hot, quick, thrown up and out — saturated enough to read on
     a pale square, with a few white-hot ones among them */
  var ns = Math.round((8 + 26 * power) * q);
  for (i = 0; i < ns; i++) {
    a = rnd(0, Math.PI * 2);
    sp = s * rnd(1.8, 3.4 + 3.6 * power);
    spark(L, an, bx, by, Math.cos(a) * sp, Math.sin(a) * sp * k - s * rnd(0.6, 2.6), s * 6.5, 2.4,
          rnd(260, 440 + 260 * power), s * rnd(0.032, 0.058), pick(SPARKS),
          0.034, rnd(0, 40));
  }
  /* chips of the taken piece, in its own colour, a face lit and a face
     in shade, bouncing on the board's plane */
  var nc = Math.round((5 + 12 * power) * q);
  var lit = shade(col, 0.28), dark = shade(col, -0.32);
  /* the edge that makes a chip readable on its own colour: a dark rim on
     a pale piece, a lit one on a dark piece */
  var cc = rgbOf(col), edge = (cc[0] * 0.2126 + cc[1] * 0.7152 + cc[2] * 0.0722) / 255 < 0.4 ? shade(col, 0.5) : shade(col, -0.42);
  for (i = 0; i < nc; i++) {
    var p = make(L, CHIP, an);
    if (!p) break;
    a = rnd(0, Math.PI * 2);
    sp = s * rnd(0.7, 1.4 + 1.6 * power);
    p.x = x + Math.cos(a) * s * 0.12; p.y = y + Math.sin(a) * s * 0.12 * k;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * k;
    p.h = s * rnd(0.1, 0.4); p.vh = s * rnd(1.8, 3.2) * (0.75 + 0.5 * power);
    p.g = s * 13; p.life = rnd(820, 1250);
    p.size = s * rnd(0.05, 0.075 + 0.05 * power); p.w = p.size * rnd(0.55, 1);
    p.rot = rnd(0, 6.28); p.vrot = rnd(-14, 14); p.ph = rnd(0, 6.28); p.vph = rnd(6, 16);
    p.col = pick([col, col, lit]); p.col2 = dark; p.col3 = edge; p.k = k;
  }
  /* and a breath of dust where it stood */
  var nd = Math.round((2 + 4 * power) * q), dustCol = mixHex(col, "#b9a58c", 0.55);
  for (i = 0; i < nd; i++) {
    var d = make(L, DUST, an);
    if (!d) break;
    a = rnd(0, Math.PI * 2);
    d.x = x; d.y = y - s * 0.05; d.vx = Math.cos(a) * s * rnd(0.3, 0.9); d.vy = Math.sin(a) * s * rnd(0.2, 0.5) * k - s * 0.15;
    d.drag = 2.2; d.life = rnd(620, 950); d.size = s * 0.35; d.size1 = s * rnd(0.9, 1.3);
    d.a = 0.22 + 0.12 * power; d.spr = sprite("soft", dustCol); d.k = k;
  }
  kick();
  return P.length - n0;
}

/* A check is a warm pulse running out from the king across the board:
   three rings, gently, and a pool of light under him. Not an alarm —
   the renderer's square already breathes — just the room clearing its
   throat. */
function check(target, o) {
  o = o || {};
  var L = stageL;
  if (!ready(L)) return 0;
  var w = where(target, 0);
  if (!w) return 0;
  var col = o.color ? hexOf(rgbOf(o.color)) : "#ff9b54";
  var s = w.s, k = flatOf(w), n0 = P.length;
  glow(L, w.an, w.x, w.y, s * 0.9, s * 1.6, 1000, 0.5, col, k, 0);
  for (var i = 0; i < 3; i++) {
    ring(L, w.an, w.x, w.y, s * 0.34, s * 1.3, s * 0.085, s * 0.012, 950, 0.78 - i * 0.18, mixHex(col, "#ffe6c8", 0.35), k, i * 230);
  }
  kick();
  return P.length - n0;
}

/* A promotion: a column of light rising out of the square, and
   sparkles riding up it. `color` is the side or a hex, and tints the
   sparkles; the light itself is always warm. */
function promote(target, o) {
  o = o || {};
  var L = stageL;
  if (!ready(L)) return 0;
  var w = where(target, 0);
  if (!w) return 0;
  var tint = mixHex(pieceColour(o.color), "#ffd98a", 0.55);
  var s = w.s, k = flatOf(w), x = w.x, y = w.y, an = w.an, n0 = P.length, i;
  var b = make(L, BEAM, an);
  if (b) { b.x = x; b.y = y; b.size = s * 0.86; b.size1 = s * 3.4; b.life = 1300; b.a = 1; b.spr = sprite("glow", "#ffd98a"); }
  /* a halo round the new piece, and a pool of light on the square */
  glow(L, an, x + w.up.x, y + w.up.y, s * 0.8, s * 2.1, 900, 0.55, "#ffcf7a", 1, 40);
  glow(L, an, x, y, s * 0.6, s * 1.6, 950, 0.7, "#ffd98a", k, 0);
  ring(L, an, x, y, s * 0.22, s * 1.15, s * 0.1, s * 0.01, 720, 0.9, "#ffe7b8", k, 60);
  var n = Math.round(22 * quality);
  for (i = 0; i < n; i++) {
    star(L, an, x + rnd(-0.34, 0.34) * s, y - rnd(0, 0.5) * s, rnd(-0.2, 0.2) * s, -s * rnd(1.1, 2.9),
         s * 0.55, 0.9, rnd(700, 1400), s * rnd(0.2, 0.42), pick([tint, "#fff4d8", "#ffd98a"]), rnd(0, 460));
  }
  var m = Math.round(12 * quality);
  for (i = 0; i < m; i++) {
    spark(L, an, x + rnd(-0.22, 0.22) * s, y - rnd(0, 0.3) * s, rnd(-0.1, 0.1) * s, -s * rnd(2.4, 4.6),
          s * 1.2, 1.1, rnd(380, 700), s * 0.024, "#fff1cf", 0.05, rnd(0, 300));
  }
  kick();
  return P.length - n0;
}

/* The big one. A burst out of the mated king — a bloom of light, two
   shock rings across the board, a fountain of sparks — and then a band
   of light passing over the whole board, the way a lamp carried across a
   table lights each square in turn. Embers drift up from a win; a loss
   gets fewer, slower sparks in a cool grey-blue, and ash drifting down
   rather than embers rising. Nobody should be punished with fireworks
   for losing. win: true, false, or null for two people at one board. */
function mate(target, o) {
  o = o || {};
  var L = stageL;
  if (!ready(L)) return 0;
  var w = where(target, 0.5);
  if (!w) return 0;
  var mood = o.win === true ? "win" : o.win === false ? "loss" : "even";
  var pal = MOOD[mood], lost = mood === "loss";
  var s = w.s, k = flatOf(w), x = w.x, y = w.y, an = w.an, n0 = P.length, i, a, sp;
  var cx = x + w.up.x, cy = y + w.up.y, q = quality;

  glow(L, an, cx, cy, s * 0.8, s * (lost ? 2.6 : 3.8), lost ? 900 : 780, lost ? 0.75 : 1, pal.glow, 1, 0);
  glow(L, an, cx, cy, s * 0.3, s * 1.5, 420, 1, pal.core, 1, 0);
  ring(L, an, x, y, s * 0.3, s * (lost ? 2.0 : 2.8), s * 0.17, s * 0.012, 950, 0.9, pal.ring, k, 0);
  ring(L, an, x, y, s * 0.3, s * (lost ? 3.0 : 4.4), s * 0.09, s * 0.008, 1350, 0.5, pal.ring, k, 150);

  var ns = Math.round((lost ? 28 : 66) * q);
  for (i = 0; i < ns; i++) {
    a = rnd(0, Math.PI * 2);
    sp = s * (lost ? rnd(1.4, 3.4) : rnd(2.4, 7.2));
    spark(L, an, cx, cy, Math.cos(a) * sp, Math.sin(a) * sp * 0.8 - s * rnd(0.8, lost ? 1.6 : 3.4),
          s * (lost ? 2.4 : 4.6), lost ? 1.8 : 1.45, rnd(700, lost ? 1200 : 1550), s * rnd(0.03, 0.06),
          pick(pal.spark), 0.036, rnd(0, 90));
  }
  var ne = Math.round(24 * q);
  for (i = 0; i < ne; i++) {
    if (lost) {
      /* ash: drifting down out of the air above the king, slowly */
      ember(L, an, cx + rnd(-1.6, 1.6) * s, cy - rnd(0.6, 2.4) * s, rnd(-0.15, 0.15) * s, s * rnd(0.2, 0.55),
            s * 0.05, 0.8, rnd(1500, 2400), s * rnd(0.08, 0.15), pal.ember, rnd(200, 900));
    } else {
      /* embers: rising, swaying, going out */
      ember(L, an, cx + rnd(-0.5, 0.5) * s, cy + rnd(-0.2, 0.3) * s, rnd(-0.4, 0.4) * s, -s * rnd(0.6, 1.5),
            -s * 0.12, 0.7, rnd(1500, 2600), s * rnd(0.08, 0.17), pal.ember, rnd(80, 600));
    }
  }
  var sw = make(L, SWEEP, null);
  if (sw) { sw.life = 1400; sw.a = lost ? 0.32 : 0.55; sw.col = pal.sweep; sw.age = -260; }
  var wa = make(L, WASH, null);
  if (wa) { wa.life = 760; wa.a = lost ? 0.08 : 0.14; wa.spr = sprite("soft", pal.glow); }
  kick();
  return P.length - n0;
}

/* Confetti, the kind that is actually pleasant to watch: two cannons
   from the bottom corners and a gentle fall from the top, each piece a
   little card of paper that tumbles (so it is wide, then edge-on, then
   wide again, and you see its back in shade), sways, and falls slower
   when it is broadside to the air than when it is edge-on — which is the
   flutter. A face turned square to you catches the light for a moment. */
function confetti(o) {
  o = o || {};
  var L = layerFor(o.layer);
  if (!ready(L)) return 0;
  var W = L.w, H = L.h, n0 = P.length, i, p;
  var ms = clamp(+o.ms || 2600, 600, 8000);
  var pal = o.palette && o.palette.length ? o.palette : CONFETTI;
  var sc = clamp(Math.min(W, H) / 560, 0.6, 1.5);
  var cannon = Math.round(52 * quality), rain = Math.round(clamp(ms / 2600, 0.4, 2) * 110 * quality);
  function card(x, y, vx, vy, delay) {
    p = make(L, CONF, null);
    if (!p) return;
    var col = pick(pal);
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.age = -delay;
    p.g = 760 * sc; p.drag = rnd(2.6, 3.6);
    p.life = ms + 1600; p.round = Math.random() < 0.24;
    p.w = rnd(6.5, 11) * sc; p.hh = p.w * rnd(0.42, 0.62);
    p.rot = rnd(0, 6.28); p.vrot = rnd(-3.2, 3.2);
    p.ph = rnd(0, 6.28); p.vph = rnd(5, 11) * (Math.random() < 0.5 ? -1 : 1);
    p.col = col; p.col2 = shade(col, -0.3); p.col3 = shade(col, 0.42);
  }
  for (i = 0; i < cannon; i++) {
    var left = i % 2 === 0;
    var ang = rnd(1.05, 1.42);          /* up and in, from each bottom corner */
    var sp = H * rnd(1.9, 3.0) + 160 * sc;
    card(left ? W * 0.02 : W * 0.98, H + 6, (left ? 1 : -1) * Math.cos(ang) * sp, -Math.sin(ang) * sp,
         rnd(0, 140));
  }
  for (i = 0; i < rain; i++) {
    card(rnd(0, W), -rnd(8, 40), rnd(-40, 40) * sc, rnd(30, 110) * sc, rnd(60, ms * 0.5));
  }
  kick();
  return P.length - n0;
}

/* A few fireworks: a rocket climbs with a fading trail, slows at the
   top, and opens into a shell of sparks that droop, twinkle and go out.
   Staggered, so it reads as a display rather than an explosion. */
function fireworks(o) {
  o = o || {};
  var L = layerFor(o.layer);
  if (!ready(L)) return 0;
  var W = L.w, H = L.h, n0 = P.length;
  var count = clamp(Math.round(+o.count || 3), 1, 6);
  var pal = o.palette && o.palette.length ? o.palette : FIREWORK;
  var g = H * 0.95, t = 0;
  for (var i = 0; i < count; i++) {
    var p = make(L, ROCKET, null);
    if (!p) break;
    var apex = H * rnd(0.14, 0.42), rise = H + 6 - apex;
    var v0 = Math.sqrt(2 * g * rise);
    p.x = W * rnd(0.16, 0.84); p.y = H + 6; p.vx = rnd(-0.06, 0.06) * W; p.vy = -v0;
    p.g = g; p.drag = 0; p.life = (v0 / g) * 1000; p.size = 2.4; p.col = "#fff2d0";
    p.col2 = pick(pal); p.trail = 0.07; p.age = -t;
    t += rnd(260, 480);
  }
  kick();
  return P.length - n0;
}
function burst(L, x, y, hex) {
  var R = Math.min(L.w, L.h), n = Math.round(58 * quality), i, a, sp;
  var sc = clamp(R / 560, 0.6, 1.5);
  glow(L, null, x, y, R * 0.04, R * 0.3, 380, 0.9, hex, 1, 0);
  ring(L, null, x, y, R * 0.01, R * 0.32, 3 * sc, 0.5, 520, 0.32, hex, 1, 0);
  var white = mixHex(hex, "#ffffff", 0.7);
  for (i = 0; i < n; i++) {
    a = (i / n) * Math.PI * 2 + rnd(-0.06, 0.06);
    sp = R * 0.62 * rnd(0.72, 1);
    var p = spark(L, null, x, y, Math.cos(a) * sp, Math.sin(a) * sp, R * 0.32, 1.35, rnd(1000, 1550),
                  rnd(1.6, 2.6) * sc, Math.random() < 0.22 ? white : hex, 0.06, 0);
    /* each one a burning point with a tail, not a dash: a little glow
       rides the head */
    if (p) { p.twinkle = 1; p.ph = rnd(0, 6.28); p.vph = rnd(14, 26); p.spr = sprite("glow", hex); }
  }
  for (i = 0; i < Math.round(10 * quality); i++) {
    a = rnd(0, Math.PI * 2); sp = R * rnd(0.08, 0.26);
    spark(L, null, x, y, Math.cos(a) * sp, Math.sin(a) * sp, R * 0.2, 1.6, rnd(600, 900), 2 * sc, white, 0.05, 0);
  }
}

/* Sparkles around something on the page — the rating on the end card,
   say. Positioned from the element's own box on screen, on the page
   layer, so it works for anything anywhere: inside the stage, on a
   card above it, or nowhere near the board at all. */
function sparkle(el, o) {
  o = o || {};
  if (!el || typeof el.getBoundingClientRect !== "function") return 0;
  var L = pageLayer();
  if (!ready(L)) return 0;
  var r = el.getBoundingClientRect();
  if (!(r.width > 0 || r.height > 0)) return 0;
  var col = o.color ? hexOf(rgbOf(o.color)) : "#ffd36b";
  var cx = r.left + r.width / 2, cy = r.top + r.height / 2, n0 = P.length, i;
  var sc = clamp(Math.max(r.height, 18) / 40, 0.6, 2.2);
  glow(L, null, cx, cy, Math.max(r.width, r.height) * 0.6, Math.max(r.width, r.height) * 1.5, 760, 0.32, col, 1, 0);
  var n = Math.round((o.count || 14) * quality);
  for (i = 0; i < n; i++) {
    var a = rnd(0, Math.PI * 2);
    var ex = r.width / 2 + rnd(2, 16) * sc, ey = r.height / 2 + rnd(2, 12) * sc;
    var x = cx + Math.cos(a) * ex, y = cy + Math.sin(a) * ey;
    star(L, null, x, y, Math.cos(a) * rnd(6, 24) * sc, Math.sin(a) * rnd(4, 14) * sc - rnd(8, 26) * sc,
         -6 * sc, 1.2, rnd(520, 1000), rnd(12, 24) * sc, pick([col, "#fff6dc", mixHex(col, "#ffffff", 0.4)]),
         rnd(0, 420));
  }
  for (i = 0; i < Math.round(8 * quality); i++) {
    var b = rnd(0, Math.PI * 2);
    ember(L, null, cx + Math.cos(b) * r.width * 0.45, cy + Math.sin(b) * r.height * 0.45,
          rnd(-10, 10) * sc, -rnd(18, 46) * sc, -4 * sc, 0.9, rnd(700, 1200), rnd(5, 9) * sc, col, rnd(0, 500));
  }
  kick();
  return P.length - n0;
}

/* a brief wash of light over the board — or over the page */
function flash(color, o) {
  o = o || {};
  var L = layerFor(o.layer);
  if (!ready(L)) return 0;
  var p = make(L, WASH, null);
  if (!p) return 0;
  p.life = clamp(+o.ms || 420, 120, 2000); p.a = clamp(o.alpha == null ? 0.22 : +o.alpha, 0, 1);
  p.spr = sprite("soft", color ? hexOf(rgbOf(color)) : "#fff1d6");
  kick();
  return 1;
}

/* ---------- things that are not particles ----------
   A shake and a count are tweens: a function of time run on the same
   loop, so Fx.busy() knows about them and Fx.clear() can finish them. */
var tweens = [];
function tween(t) { t.t0 = now(); tweens.push(t); kick(); return t; }
/* `cut` is a tween stopped early — by clear(), or by a new count on the
   same number — rather than one that ran its course */
function finishTween(t, cut) {
  var i = tweens.indexOf(t);
  if (i >= 0) tweens.splice(i, 1);
  try { if (t.done) t.done(!!cut); } catch (e) { /* a broken callback never breaks the loop */ }
}

/* a short, damped shiver of an element — the end card when the result
   lands, a clock when it runs out. Two frequencies so it is a shake, not
   a wobble; over in under half a second. */
var shaking = [];
function shake(el, amount) {
  if (!el || !el.style || reduced || !HAS_DOM) return false;
  amount = amount == null ? 6 : clamp(+amount || 0, 0, 40);
  for (var i = shaking.length - 1; i >= 0; i--) if (shaking[i].el === el) finishTween(shaking[i].t, true);
  var base = el.style.transform || "";
  var rec = { el: el, t: null };
  rec.t = tween({
    dur: 460,
    step: function (u) {
      var d = Math.exp(-4.6 * u) * (1 - u);
      var x = amount * d * Math.sin(u * Math.PI * 2 * 5.5);
      var y = amount * 0.35 * d * Math.sin(u * Math.PI * 2 * 7.3 + 1.1);
      var r = amount * 0.12 * d * Math.sin(u * Math.PI * 2 * 4.1);
      el.style.transform = (base ? base + " " : "") +
        "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px) rotate(" + r.toFixed(2) + "deg)";
    },
    done: function () {
      el.style.transform = base;
      var j = shaking.indexOf(rec);
      if (j >= 0) shaking.splice(j, 1);
    }
  });
  shaking.push(rec);
  return true;
}

/* A number that counts to where it is going, fast at first and settling
   — a rating, a score. onTick(i, n, value) fires as it passes each of n
   evenly spaced values (at most `ticks`, 24 by default), which is what a
   sound wants: a run of clicks that slows into the final one. Under
   reduced motion the number is simply set, and onTick fires once, for
   the arrival. Returns a promise of the final value. */
function countUp(el, from, to, o) {
  o = o || {};
  from = +from || 0; to = +to || 0;
  var fmt = typeof o.format === "function" ? o.format : function (v) { return String(Math.round(v)); };
  var onTick = typeof o.onTick === "function" ? o.onTick : null;
  var n = Math.max(1, Math.min(o.ticks || 24, Math.round(Math.abs(to - from)) || 1));
  var ms = o.ms == null ? 1100 : +o.ms;
  function put(v) { if (el) { try { el.textContent = fmt(v); } catch (e) { el.textContent = String(Math.round(v)); } } }
  function tick(i, v) { if (onTick) { try { onTick(i, n, v); } catch (e) { /* the count goes on */ } } }
  var Prom = typeof Promise === "function" ? Promise : null;
  if (reduced || !HAS_DOM || to === from || !(ms > 0)) {
    put(to);
    if (to !== from) tick(n, to);
    return Prom ? Prom.resolve(to) : null;
  }
  /* a new count on a number that is already counting takes over from
     it: the old one lands where it was going, silently */
  for (var c = counting.length - 1; c >= 0; c--) if (counting[c].el === el) finishTween(counting[c].t, true);
  var fired = 0, resolve = null;
  var pr = Prom ? new Prom(function (res) { resolve = res; }) : null;
  var rec = { el: el, t: null };
  put(from);
  rec.t = tween({
    dur: ms,
    step: function (u) {
      var e = easeOutQuart(u);
      put(from + (to - from) * e);
      var k = Math.min(n, Math.floor(e * n + 1e-9));
      while (fired < k) { fired++; tick(fired, from + (to - from) * fired / n); }
    },
    done: function (cut) {
      put(to);
      /* the clicks that are owed are only owed if it ran its course: a
         count cut short does not rattle off the rest in one frame */
      if (!cut) while (fired < n) { fired++; tick(fired, from + (to - from) * fired / n); }
      var j = counting.indexOf(rec);
      if (j >= 0) counting.splice(j, 1);
      if (resolve) resolve(to);
    }
  });
  counting.push(rec);
  return pr;
}
var counting = [];

/* a buzz, where there is anything to buzz. iOS has no vibrate at all,
   which is fine: this is seasoning, never the only way to know. */
var HAPTIC = { tap: [8], capture: [14], check: [10, 50, 10], promote: [8, 40, 16],
               mate: [28, 70, 44, 70, 90], win: [20, 40, 20, 40, 60], loss: [60] };
function haptic(pattern) {
  var nav = root.navigator;
  if (!nav || typeof nav.vibrate !== "function") return false;
  var pat = typeof pattern === "string" ? HAPTIC[pattern] : pattern;
  if (pat == null) return false;
  try { return !!nav.vibrate(pat); } catch (e) { return false; }
}

/* ---------- the loop ----------
   Runs only while something is alive. Each frame: move everything,
   then draw each layer that has anything on it — matter first (dust,
   chips, paper), light added over it. When the last thing goes out the
   layers are cleared and hidden and the loop simply does not ask for
   another frame. */
var raf = function (fn) {
  if (typeof root.requestAnimationFrame === "function") return root.requestAnimationFrame(fn);
  return setTimeout(function () { fn(now()); }, 16);
};
function kick() {
  if (looping) return;
  looping = true;
  lastT = 0;
  var id = ++loopId;
  raf(function (t) { frame(t, id); });
}
function frame(t, id) {
  if (id !== loopId || !looping) return;
  if (!(t > 0)) t = now();
  var dtms = lastT ? clamp(t - lastT, 0, 50) : 16.7;
  lastT = t;
  frames++; frameNo++;
  adapt(dtms);
  step(dtms, t);
  draw();
  if (P.length || tweens.length) raf(function (tt) { frame(tt, id); });
  else stop();
}
function stop() {
  looping = false;
  loopId++;
  wipe(stageL); wipe(pageL);
}
function wipe(L) {
  if (!L.cv || !L.ctx) return;
  if (L.used) {
    L.ctx.setTransform(1, 0, 0, 1, 0, 0);
    L.ctx.clearRect(0, 0, L.cv.width, L.cv.height);
    L.used = false;
  }
  showLayer(L, false);
}

/* A slow device is noticed by its frames, not guessed from its name:
   while frames run long, new effects are made smaller and, if it gets
   bad, the small particles already alive are thinned. It recovers as
   soon as the frames do. */
function adapt(dtms) {
  ema = ema * 0.9 + dtms * 0.1;
  if (frames < 8) return;
  if (ema > 26) quality = Math.max(0.35, quality * 0.96);
  else if (ema < 18.5) quality = Math.min(1, quality + 0.01);
  var t = now();
  if (ema > 42 && P.length > 120 && t - lastCull > 300) {
    lastCull = t;
    for (var i = P.length - 1; i >= 0; i -= 3) if (THIN[P[i].kind]) retire(i);
  }
}

function step(dtms, t) {
  var dt = dtms / 1000, i, p;
  for (i = P.length - 1; i >= 0; i--) {
    p = P[i];
    p.age += dtms;
    if (p.age < 0) continue;
    if (p.age >= p.life) {
      /* a rocket at its apex opens into its shell — retired first, so
         the shell's sparks can never be handed its slot mid-burst */
      var boom = p.kind === ROCKET && p.layer ? { L: p.layer, x: p.x, y: p.y, c: p.col2 } : null;
      retire(i);
      if (boom) burst(boom.L, boom.x, boom.y, boom.c);
      continue;
    }
    var kd = p.kind;
    if (kd === CHIP) {
      /* on the board's plane, with a height above it */
      var fr = p.h > 0 ? 1 : Math.exp(-7 * dt);
      p.vx *= fr; p.vy *= fr;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vh -= p.g * dt; p.h += p.vh * dt;
      if (p.h < 0) {
        p.h = 0;
        if (p.vh < -p.g * 0.045 && p.bounces < 2) {
          p.vh = -p.vh * 0.34; p.vx *= 0.55; p.vy *= 0.55; p.vrot *= 0.5; p.bounces++;
        } else { p.vh = 0; p.vrot *= Math.exp(-10 * dt); p.vph *= Math.exp(-10 * dt); }
      }
      p.rot += p.vrot * dt; p.ph += p.vph * dt;
    } else if (kd === CONF) {
      /* broadside to the air it is slowed hard; edge-on it drops */
      p.ph += p.vph * dt; p.rot += p.vrot * dt;
      var face = Math.abs(Math.cos(p.ph));
      var dr = Math.exp(-p.drag * (0.3 + 0.75 * face) * dt);
      p.vx = p.vx * dr + Math.sin(p.ph * 0.5 + p.seed * 6.28) * 70 * dt;
      p.vy = p.vy * dr + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.layer && p.y > p.layer.h + 40) { retire(i); continue; }
    } else if (kd === SPARK || kd === STAR || kd === EMBER || kd === ROCKET || kd === DUST) {
      var d = p.drag ? Math.exp(-p.drag * dt) : 1;
      p.vx *= d; p.vy = p.vy * d + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (kd === STAR) p.rot += p.vrot * dt;
      if (kd === EMBER) { p.ph += p.vph * dt; p.x += Math.sin(p.ph) * p.size * 0.6 * dt * 4; }
      if (kd === SPARK && p.twinkle) p.ph += p.vph * dt;
    }
  }
  /* tweens on the same clock */
  for (i = tweens.length - 1; i >= 0; i--) {
    var tw = tweens[i];
    if (!tw) continue;
    var u = clamp((now() - tw.t0) / tw.dur, 0, 1);
    try { if (tw.step) tw.step(u); } catch (e) { /* keep going */ }
    if (u >= 1) finishTween(tw);
  }
  void t;
}

/* ---------- drawing ---------- */
var BLEND = { cur: "" };
function blend(ctx, mode) {
  if (BLEND.cur !== mode) { ctx.globalCompositeOperation = mode; BLEND.cur = mode; }
}
function draw() {
  /* anchors: where is each square now, asked once a frame */
  if (projector) {
    for (var i = 0; i < P.length; i++) {
      var an = P[i].an;
      if (!an || an.f === frameNo) continue;
      an.f = frameNo;
      var p = project(an.sq, 0);
      if (p) { an.dx = p.x - an.x0; an.dy = p.y - an.y0; }
    }
  }
  drawLayer(stageL);
  drawLayer(pageL);
}
function drawLayer(L) {
  if (!L.cv || !L.ctx) return;
  var any = false, i;
  for (i = 0; i < P.length; i++) if (P[i].layer === L) { any = true; break; }
  if (!any) { if (L.used) wipe(L); return; }
  if (!sizeLayer(L)) return;
  var ctx = L.ctx, dpr = L.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, L.cv.width, L.cv.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  showLayer(L, true);
  L.used = true;
  BLEND.cur = ""; blend(ctx, "source-over");
  /* matter first, then light over it */
  for (i = 0; i < P.length; i++) { var p = P[i]; if (p.layer === L && p.age >= 0 && !LIGHT[p.kind]) paint(ctx, p, L); }
  blend(ctx, "lighter");
  for (i = 0; i < P.length; i++) { var q = P[i]; if (q.layer === L && q.age >= 0 && LIGHT[q.kind]) paint(ctx, q, L); }
  blend(ctx, "source-over");
  ctx.globalAlpha = 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function paint(ctx, p, L) {
  var u = p.age / p.life, ox = 0, oy = 0, a, sz;
  if (p.an) { ox = p.an.dx; oy = p.an.dy; }
  var x = p.x + ox, y = p.y + oy, dpr = L.dpr;
  switch (p.kind) {
  case GLOW: {
    sz = p.size + (p.size1 - p.size) * easeOutCubic(u);
    a = p.a * (u < 0.12 ? u / 0.12 : Math.pow(1 - (u - 0.12) / 0.88, 1.6));
    if (a <= 0.003) return;
    ctx.globalAlpha = a;
    ctx.drawImage(p.spr, x - sz / 2, y - (sz * p.k) / 2, sz, sz * p.k);
    return;
  }
  case RING: {
    var r = p.size + (p.size1 - p.size) * easeOutCubic(u);
    a = p.a * Math.pow(1 - u, 1.3) * (u < 0.06 ? u / 0.06 : 1);
    if (a <= 0.003) return;
    ctx.globalAlpha = a;
    ctx.strokeStyle = p.col;
    ctx.lineWidth = Math.max(0.5, p.w + (p.hh - p.w) * u);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * p.k, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  case SPARK:
  case ROCKET: {
    a = p.kind === ROCKET ? 1 : Math.pow(1 - u, 1.15);
    if (p.twinkle) a *= 0.55 + 0.45 * Math.sin(p.ph);
    if (p.kind === SPARK && u > 0.7 && p.twinkle) a *= (1 - u) / 0.3;
    if (a <= 0.004) return;
    ctx.globalAlpha = a;
    ctx.strokeStyle = p.col;
    ctx.lineWidth = Math.max(0.6, p.size * (1 - 0.45 * u));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - p.vx * p.trail, y - p.vy * p.trail);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (p.kind === ROCKET) {
      ctx.globalAlpha = 0.85;
      var gs = p.size * 7;
      ctx.drawImage(sprite("glow", p.col2), x - gs / 2, y - gs / 2, gs, gs);
    } else if (p.spr) {
      var hs = p.size * 5.5 * (1 - 0.5 * u);
      ctx.drawImage(p.spr, x - hs / 2, y - hs / 2, hs, hs);
    }
    return;
  }
  case STAR: {
    /* in and out like a glint, turning slowly */
    sz = p.size * Math.pow(Math.sin(Math.PI * u), 0.7);
    if (sz <= 0.3) return;
    ctx.globalAlpha = Math.min(1, 1.6 * Math.sin(Math.PI * u));
    var c = Math.cos(p.rot), s = Math.sin(p.rot);
    ctx.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * x, dpr * y);
    ctx.drawImage(p.spr, -sz / 2, -sz / 2, sz, sz);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return;
  }
  case EMBER: {
    a = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (0.62 + 0.38 * Math.sin(p.ph * 2.3));
    if (a <= 0.004) return;
    ctx.globalAlpha = clamp(a, 0, 1);
    sz = p.size * (1 - 0.4 * u);
    ctx.drawImage(p.spr, x - sz, y - sz, sz * 2, sz * 2);
    return;
  }
  case CHIP: {
    a = u > 0.72 ? (1 - u) / 0.28 : 1;
    if (a <= 0.004) return;
    ctx.globalAlpha = a;
    /* a little card of the piece, tumbling: its width is how much of it
       faces you, and the side you see decides whether it is lit */
    var tum = Math.cos(p.ph), hw = p.size * 0.5, hh = p.w * 0.5 * Math.max(0.18, Math.abs(tum));
    var cr = Math.cos(p.rot), sr = Math.sin(p.rot);
    var cy = y - p.h;
    ctx.fillStyle = tum >= 0 ? p.col : p.col2;
    ctx.beginPath();
    ctx.moveTo(x + (-hw) * cr - (-hh) * sr, cy + (-hw) * sr + (-hh) * cr);
    ctx.lineTo(x + hw * cr - (-hh) * sr, cy + hw * sr + (-hh) * cr);
    ctx.lineTo(x + hw * 0.6 * cr - hh * sr, cy + hw * 0.6 * sr + hh * cr);
    ctx.lineTo(x + (-hw) * cr - hh * sr, cy + (-hw) * sr + hh * cr);
    ctx.closePath();
    ctx.fill();
    /* a broken edge in the piece's own shadow colour, so an ivory chip
       still reads on an ivory square */
    ctx.strokeStyle = p.col3;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    return;
  }
  case DUST: {
    sz = p.size + (p.size1 - p.size) * easeOutCubic(u);
    a = p.a * Math.sin(Math.PI * Math.min(1, u * 1.4 + 0.08)) * (1 - u);
    if (a <= 0.003) return;
    ctx.globalAlpha = a;
    ctx.drawImage(p.spr, x - sz / 2, y - (sz * p.k) / 2, sz, sz * p.k);
    return;
  }
  case CONF: {
    a = p.life - p.age < 500 ? (p.life - p.age) / 500 : 1;
    if (a <= 0.004) return;
    ctx.globalAlpha = a;
    var t2 = Math.cos(p.ph), fa = Math.abs(t2);
    /* the back of the paper is in shade; a face turned square on
       catches the light for an instant */
    ctx.fillStyle = fa > 0.93 ? p.col3 : t2 >= 0 ? p.col : p.col2;
    var co = Math.cos(p.rot), so = Math.sin(p.rot);
    if (p.round) {
      ctx.beginPath();
      ctx.ellipse(x, y, p.w * 0.36, Math.max(0.4, p.w * 0.36 * fa), p.rot, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    var w2 = p.w * 0.5, h2 = Math.max(0.35, p.hh * 0.5 * fa);
    ctx.beginPath();
    ctx.moveTo(x - w2 * co + h2 * so, y - w2 * so - h2 * co);
    ctx.lineTo(x + w2 * co + h2 * so, y + w2 * so - h2 * co);
    ctx.lineTo(x + w2 * co - h2 * so, y + w2 * so + h2 * co);
    ctx.lineTo(x - w2 * co - h2 * so, y - w2 * so + h2 * co);
    ctx.closePath();
    ctx.fill();
    return;
  }
  case BEAM: {
    /* a pillar of light: rises fast, holds, thins away. Two stretched
       glows — a wide faint one and a narrow bright core — make a soft
       edge no gradient rectangle can. */
    var grow = easeOutCubic(Math.min(1, u / 0.32));
    var hgt = p.size1 * (0.25 + 0.75 * grow);
    a = p.a * (u < 0.1 ? u / 0.1 : Math.pow(1 - (u - 0.1) / 0.9, 1.4));
    if (a <= 0.003) return;
    var wid = p.size * (1 - 0.35 * u);
    ctx.globalAlpha = a * 0.55;
    ctx.drawImage(p.spr, x - wid, y - hgt * 1.05, wid * 2, hgt * 1.25);
    ctx.globalAlpha = a;
    ctx.drawImage(p.spr, x - wid * 0.32, y - hgt, wid * 0.64, hgt * 1.12);
    return;
  }
  case SWEEP: {
    paintSweep(ctx, p, u);
    return;
  }
  case WASH: {
    a = p.a * (u < 0.08 ? u / 0.08 : Math.pow(1 - (u - 0.08) / 0.92, 2));
    if (a <= 0.003) return;
    ctx.globalAlpha = a;
    var W = L.w, H = L.h;
    ctx.drawImage(p.spr, -W * 0.3, -H * 0.3, W * 1.6, H * 1.6);
    return;
  }
  }
}

/* the band of light passing over the board after a mate: clipped to the
   board itself (its four outer corners, asked of the projector so the
   band lies on the wood in perspective), moving diagonally across it */
function paintSweep(ctx, p, u) {
  var a1 = project(0x00), b2 = project(0x11), h1 = project(0x07), g2 = project(0x16);
  var h8 = project(0x77), g7 = project(0x66), a8 = project(0x70), b7 = project(0x61);
  if (!a1 || !b2 || !h1 || !g2 || !h8 || !g7 || !a8 || !b7) return;
  function outer(c, inner) { return { x: c.x + (c.x - inner.x) * 0.5, y: c.y + (c.y - inner.y) * 0.5 }; }
  var q = [outer(a1, b2), outer(h1, g2), outer(h8, g7), outer(a8, b7)];
  var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, i;
  for (i = 0; i < 4; i++) {
    minX = Math.min(minX, q[i].x); maxX = Math.max(maxX, q[i].x);
    minY = Math.min(minY, q[i].y); maxY = Math.max(maxY, q[i].y);
  }
  /* only the part of the board that is on screen: pushed in close, most
     of it is not, and a band that spends its time crossing squares
     nobody can see is a band nobody sees */
  var L = p.layer;
  minX = Math.max(minX, 0); minY = Math.max(minY, 0);
  maxX = Math.min(maxX, L.w); maxY = Math.min(maxY, L.h);
  if (maxX - minX < 4 || maxY - minY < 4) return;
  /* a direction across the screen, rising to the right, and the band's
     centre travelling along it */
  var dx = 0.88, dy = -0.47;
  var lo = Math.min(minX * dx + maxY * dy, maxX * dx + minY * dy, minX * dx + minY * dy, maxX * dx + maxY * dy);
  var hi = Math.max(minX * dx + maxY * dy, maxX * dx + minY * dy, minX * dx + minY * dy, maxX * dx + maxY * dy);
  var band = (hi - lo) * 0.17;
  var c = lo - band + (hi - lo + band * 2) * easeInOutSine(u);
  var a = p.a * Math.sin(Math.PI * Math.min(1, u * 1.05));
  if (a <= 0.003) return;
  var g = ctx.createLinearGradient(dx * (c - band), dy * (c - band), dx * (c + band), dy * (c + band));
  var rgb = rgbOf(p.col);
  g.addColorStop(0, rgba(rgb, 0));
  g.addColorStop(0.42, rgba(rgb, 0.55));
  g.addColorStop(0.5, "rgba(255,255,255,0.9)");
  g.addColorStop(0.58, rgba(rgb, 0.55));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(q[0].x, q[0].y);
  for (i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y);
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha = a;
  ctx.fillStyle = g;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  /* and the whole board warms a touch while it passes */
  ctx.globalAlpha = a * 0.16;
  ctx.fillStyle = p.col;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  ctx.restore();
  /* a restore puts back the blend mode with everything else; say so */
  BLEND.cur = ctx.globalCompositeOperation;
}

/* ---------- the door ---------- */
function attach(el, o) {
  o = o || {};
  reduced = o.reduced != null ? !!o.reduced : prefersReduced();
  if (!HAS_DOM || !el) return Fx;
  if (!stageL.cv) {
    stageL.cv = document.createElement("canvas");
    styleLayer(stageL.cv, false);
    stageL.ctx = stageL.cv.getContext("2d");
  }
  stageL.host = el;
  /* after the board canvases, before everything else in the stage */
  var after = null, kids = el.children;
  for (var i = 0; i < kids.length; i++) {
    if (kids[i].tagName === "CANVAS" && kids[i] !== stageL.cv) after = kids[i];
  }
  el.insertBefore(stageL.cv, after ? after.nextSibling : el.firstChild);
  stageL.w = stageL.h = 0;
  return Fx;
}
function setProjector(fn) { projector = typeof fn === "function" ? fn : null; }
function setReduced(on) { reduced = !!on; if (reduced) clear(); }
function clear() {
  while (tweens.length) finishTween(tweens[tweens.length - 1], true);
  while (P.length) retire(P.length - 1);
  stop();
}
function busy() { return P.length > 0 || tweens.length > 0; }
function stats(reset) {
  var out = { alive: P.length, peak: peak, frames: frames, looping: looping, quality: quality,
              dropped: dropped, max: MAX, reduced: reduced, tweens: tweens.length };
  if (reset) { peak = P.length; dropped = 0; }
  return out;
}

if (HAS_DOM && typeof document.addEventListener === "function") {
  /* a hidden tab gets no frames anyway; don't come back to a pile-up */
  document.addEventListener("visibilitychange", function () { if (document.hidden) clear(); });
}

var Fx = {
  MAX: MAX,
  attach: attach, setProjector: setProjector, setReduced: setReduced,
  isReduced: function () { return reduced; },
  capture: capture, check: check, promote: promote, mate: mate,
  confetti: confetti, fireworks: fireworks, sparkle: sparkle, flash: flash,
  shake: shake, countUp: countUp, haptic: haptic,
  clear: clear, busy: busy, stats: stats,
  /* exposed for the checks and the preview page, not for the game */
  _colour: { rgbOf: rgbOf, mixHex: mixHex, shade: shade, pieceColour: pieceColour }
};
if (typeof module !== "undefined" && module.exports) module.exports = Fx;
else root.Fx = Fx;
})(typeof self !== "undefined" ? self : this);
