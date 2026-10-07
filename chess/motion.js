/* motion.js — how a piece moves, as data.

   A chess piece is not a sprite that slides from one square to another.
   A rook goes fast and stops dead. A knight is picked up, carried over
   whatever is in the way, and set down. A king is heavy and arrives
   last. A pawn takes one deliberate step. Those differences are not
   decoration: they are the first thing that tells a beginner the pieces
   are not interchangeable, and they are what makes a replay of a game
   worth watching rather than worth skipping.

   None of that belongs to a renderer. Both boards — the carved one and
   the drawn one — ask this module the same question at the same moment
   ("where is the piece, how high, how tilted, a fraction of a second
   into this move?") and get the same answer, so the 2D board is a
   simpler drawing of the same gesture rather than a different one.

   Everything here is a pure function of a move and a time. No DOM, no
   GL, no state, no clock of its own. Tested by chess/tools/motion-check.js.

   Units: distance is squares, height is squares, time is milliseconds,
   angles are radians. */
(function (root) {
"use strict";

var P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;

/* ---------- the vocabulary ----------
   base    the time a move of no distance would take
   per     milliseconds added for each square travelled
   lift    how far clear of the board the piece is carried
   rise/fall  the fractions of the travel spent going up and coming down;
           what is left between them is time spent at full height, which
           is what makes a knight read as carried rather than lobbed
   settle  how much the piece compresses as it lands, as a fraction
   bank    how far it leans into the direction of travel
   spin    whether it turns to face where it is going (the knight does;
           a rook has no face to turn) */
var CHARACTER = {};
CHARACTER[P] = { name: "pawn",   base: 172, per: 46, lift: 0.105, rise: 0.36, fall: 0.44,
                 settle: 0.030, bank: 0.00,  spin: 0, ease: "step" };
CHARACTER[N] = { name: "knight", base: 268, per: 52, lift: 0.80,  rise: 0.26, fall: 0.32,
                 settle: 0.055, bank: 0.00,  spin: 1, ease: "arc" };
CHARACTER[B] = { name: "bishop", base: 168, per: 30, lift: 0.085, rise: 0.40, fall: 0.44,
                 settle: 0.022, bank: 0.105, spin: 0, ease: "glide" };
CHARACTER[R] = { name: "rook",   base: 140, per: 24, lift: 0.055, rise: 0.42, fall: 0.40,
                 settle: 0.044, bank: 0.00,  spin: 0, ease: "dash" };
CHARACTER[Q] = { name: "queen",  base: 196, per: 33, lift: 0.145, rise: 0.38, fall: 0.42,
                 settle: 0.034, bank: 0.058, spin: 0, ease: "glide" };
CHARACTER[K] = { name: "king",   base: 206, per: 74, lift: 0.075, rise: 0.44, fall: 0.46,
                 settle: 0.052, bank: 0.00,  spin: 0, ease: "heavy" };

/* A move has to be quick enough to play a blitz game through and slow
   enough to watch. Everything lands between these. */
var MIN_DUR = 165, MAX_DUR = 520;
/* the tail: the piece has arrived, and what is still playing is the
   weight of it coming to rest */
var SETTLE_SHARE = 0.17;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function kindOf(p) { return p < 0 ? -p : p; }

/* ---------- easings ----------
   Each one is the shape of a different hand. They all run 0→1 and all
   start and end exactly there, because a move that doesn't finish on
   its square is a bug you only see once a game. */
function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }
function easeInOutQuart(t) { return t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t + 2, 4) / 2; }
function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
function easeInOutQuad(t) { return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; }

var EASE = {
  /* a deliberate step: in and out, no drama */
  step: easeInOutQuad,
  /* a hop: almost even across the ground, because the arc is doing the
     work and an eased hop looks like it is being dragged */
  arc: function (t) { return t * 0.26 + easeInOutCubic(t) * 0.74; },
  /* a glide: long, smooth, unhurried at both ends */
  glide: easeInOutCubic,
  /* a dash: a short shove, then a long coast into a firm stop */
  dash: function (t) {
    if (t < 0.16) return easeInOutQuad(t / 0.16) * 0.10;
    return 0.10 + easeOutQuart((t - 0.16) / 0.84) * 0.90;
  },
  /* weight: slow to start, slow to stop, and nothing in between is fast */
  heavy: easeInOutQuart
};
function ease(name, t) { return (EASE[name] || easeInOutCubic)(clamp(t, 0, 1)); }

/* the hump the piece is carried over: up, along, down. Flat at the top
   rather than pointed, because a hand holds a piece level while it
   crosses. */
function hump(t, rise, fall) {
  if (t <= 0 || t >= 1) return 0;
  if (t < rise) return Math.sin((t / rise) * Math.PI * 0.5);
  if (t > 1 - fall) return Math.sin(((1 - t) / fall) * Math.PI * 0.5);
  return 1;
}

/* the piece coming to rest: one compression and a small rebound, damped
   away to nothing. Wood, not rubber — the numbers are deliberately
   small and the whole thing is over in a sixth of a second. */
function settleAt(s, amount) {
  if (s <= 0 || s >= 1) return 1;
  /* a damped half-cycle rather than a damped cosine: it starts at zero,
     so there is no step the instant the piece touches down — one clear
     compression, a smaller rebound, and gone. 1.93 is what puts the
     first trough at exactly `amount`. */
  return 1 - amount * Math.sin(s * Math.PI * 2.2) * Math.exp(-3.2 * s) * 1.93;
}

/* ---------- planning a move ----------
   `m` is the renderer's move descriptor: piece, from, to, and the extra
   squares for castling, en passant and promotion. Squares are 0x88. */
function fileOf(sq) { return sq & 7; }
function rankOf(sq) { return sq >> 4; }
function span(from, to) {
  var dx = fileOf(to) - fileOf(from), dy = rankOf(to) - rankOf(from);
  return Math.sqrt(dx * dx + dy * dy);
}

function character(piece) { return CHARACTER[kindOf(piece)] || CHARACTER[P]; }

function plan(m, opts) {
  opts = opts || {};
  var c = character(m.piece);
  var dist = span(m.from, m.to);
  var dur = clamp(c.base + dist * c.per, MIN_DUR, MAX_DUR);
  /* a castle is two pieces making one gesture, and the rook has further
     to go than the king does; give the whole thing a little more room */
  if (m.rookFrom != null) dur = clamp(dur * 1.22, MIN_DUR, MAX_DUR + 90);
  /* a promotion has a second act — the pawn leaving and the new piece
     arriving — and rushing it loses the only moment in chess where a
     piece becomes a different piece */
  if (m.promo) dur = clamp(dur * 1.5, MIN_DUR, MAX_DUR + 160);
  if (opts.scale) dur = clamp(dur * opts.scale, 60, 4000);
  if (opts.reduced) dur = 1;

  return {
    kind: c.name,
    dur: dur,
    dist: dist,
    lift: c.lift * (c.name === "knight" ? clamp(0.72 + dist * 0.12, 0.8, 1.25) : 1),
    rise: c.rise, fall: c.fall,
    settle: opts.reduced ? 0 : c.settle,
    bank: opts.reduced ? 0 : c.bank * clamp(dist / 4, 0.35, 1),
    spin: c.spin,
    ease: c.ease,
    /* the share of the clock spent travelling; the rest is the landing */
    travel: opts.reduced ? 1 : 1 - SETTLE_SHARE,
    /* the rook sets off a moment after the king and arrives a moment
       before it, which is what makes a castle read as one move rather
       than as two pieces that happened to go at once */
    rookIn: 0.14, rookOut: 0.84,
    /* the captured piece is pushed over rather than deleted: it tips
       away from whatever took it and is gone by the time the mover has
       finished arriving */
    toppleFor: 0.78
  };
}

/* ---------- reading a plan at a moment ----------
   t is 0..1 across the whole animation. Returns everything a renderer
   needs and nothing it has to work out for itself. */
function at(pl, t) {
  t = clamp(t, 0, 1);
  var tt = pl.travel >= 1 ? t : clamp(t / pl.travel, 0, 1);
  var s = pl.travel >= 1 ? 1 : clamp((t - pl.travel) / (1 - pl.travel), 0, 1);
  var moving = tt < 1;
  return {
    /* how far along the line from `from` to `to`, 0..1 */
    p: ease(pl.ease, tt),
    /* how far off the board */
    y: pl.lift * hump(tt, pl.rise, pl.fall),
    /* the lean into the travel, which falls away as the piece sets down */
    bank: pl.bank * Math.sin(Math.PI * tt),
    /* vertical scale as it lands: 1 while it is in the air */
    squash: settleAt(s, pl.settle),
    /* true while the piece is still off its square */
    moving: moving,
    /* 0 before touchdown, 0..1 through the landing */
    landed: moving ? 0 : s
  };
}

/* where the second piece of a castle is at the same moment */
function rookAt(pl, t) {
  var u = clamp((t - pl.rookIn) / Math.max(0.02, pl.rookOut - pl.rookIn), 0, 1);
  return {
    p: easeInOutCubic(u),
    y: 0.055 * hump(u, 0.4, 0.4),
    squash: u < 1 ? 1 : 1,
    moving: u < 1
  };
}

/* the captured piece, pushed over. `away` is the direction it falls,
   as a fraction of a right angle past flat — a piece that tips exactly
   to horizontal looks like it is lying down on purpose. */
function toppleAt(pl, t) {
  var u = clamp(t / pl.toppleFor, 0, 1);
  /* it goes over the lip of its own base quickly and then falls, which
     is what a pushed object actually does */
  var fall = u * u * (3 - 2 * u);
  return {
    tilt: fall * 1.92,
    /* it skids a little in the direction it is pushed */
    slide: fall * 0.26,
    /* and is gone before the mover has settled, so the square is clear */
    alpha: clamp(1 - Math.pow(u, 1.7), 0, 1),
    /* the lifted base, so it pivots on an edge rather than through
       the board */
    y: Math.sin(fall * Math.PI) * 0.06
  };
}

/* a pawn becoming something else: the pawn leaves, the new piece
   arrives, and for a moment in the middle there is a flash of light.
   Returns the two scales and the flash so a renderer can draw all
   three without inventing its own timing. */
function promoteAt(pl, t) {
  var out = clamp(t / 0.46, 0, 1);
  var inn = clamp((t - 0.38) / 0.62, 0, 1);
  var grow = 1 - Math.pow(1 - inn, 3);
  return {
    pawnScale: 1 - out * 0.55,
    pawnAlpha: clamp(1 - out * out, 0, 1),
    pawnSpin: out * 2.4,
    /* a touch past full size and back: the only overshoot in the file,
       and it is here because this is the one move worth celebrating */
    newScale: inn <= 0 ? 0 : grow * (1 + 0.14 * Math.sin(inn * Math.PI)),
    newAlpha: clamp(inn * 2.2, 0, 1),
    flash: Math.pow(Math.sin(clamp((t - 0.26) / 0.46, 0, 1) * Math.PI), 1.6)
  };
}

/* The king's square while it is in check: a slow breath rather than a
   blink, because a blinking square is an alarm and an alarm is the one
   thing a beginner does not need more of. Runs for a few seconds and
   then holds, so a board nobody is touching stops asking to be redrawn. */
var PULSE_MS = 2600;
function checkPulse(sinceMs) {
  if (!(sinceMs >= 0)) return { amount: 0, live: false };
  var a = clamp(1 - sinceMs / PULSE_MS, 0, 1);
  return {
    amount: 0.42 + 0.58 * (0.5 + 0.5 * Math.cos(sinceMs / 1000 * Math.PI * 2.2)) * a,
    live: sinceMs < PULSE_MS
  };
}

var Motion = {
  CHARACTER: CHARACTER, MIN_DUR: MIN_DUR, MAX_DUR: MAX_DUR, PULSE_MS: PULSE_MS,
  plan: plan, at: at, rookAt: rookAt, toppleAt: toppleAt, promoteAt: promoteAt,
  checkPulse: checkPulse, character: character, ease: ease, hump: hump, span: span
};
if (typeof module !== "undefined" && module.exports) module.exports = Motion;
else root.Motion = Motion;
})(typeof self !== "undefined" ? self : this);
