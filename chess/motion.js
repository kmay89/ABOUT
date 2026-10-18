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

/* ---------- the king goes over ----------
   Checkmate is the one moment in a game that ends it, and the oldest
   way to say so is to lay your king down. So the mated king is not
   removed or greyed out: it is pushed over and left lying on its side.

   It falls the way a tall, heavy thing does. First a rock back against
   the blow — the beat in which it might still stand — then slowly over
   the lip of its own base and all at once after that, a knock as it
   meets the board, a smaller rebound, and stillness. Three acts, and
   the middle one is a quadratic because that is what gravity draws.

   `rest` is the angle it comes to rest at, which the renderer knows and
   this file does not: a king lies on its base rim and its crown, so it
   rests a little short of flat, and how far short depends on the set.
   The angle never goes past `rest` — past it is through the board. */
var FALL = { teeter: 170, drop: 430, settle: 420, back: 0.055, bounce: 0.11 };
var FALL_MS = FALL.teeter + FALL.drop + FALL.settle;
/* the moment the crown meets the wood, for anything that wants to make
   a sound when it does */
var FALL_IMPACT = FALL.teeter + FALL.drop;
function kingFall(ms, rest) {
  rest = rest == null ? 1.38 : rest;
  if (!(ms > 0)) return { tilt: 0, landed: false, done: false };
  if (ms >= FALL_MS) return { tilt: rest, landed: true, done: true };
  if (ms < FALL.teeter) {
    return { tilt: -FALL.back * Math.sin((ms / FALL.teeter) * Math.PI), landed: false, done: false };
  }
  ms -= FALL.teeter;
  if (ms < FALL.drop) {
    var v = ms / FALL.drop;
    /* a little of it is linear so it leaves upright already moving —
       the teeter handed it that much — and the rest is the drop */
    return { tilt: rest * (0.18 * v + 0.82 * v * v), landed: false, done: false };
  }
  var w = (ms - FALL.drop) / FALL.settle;
  /* two rebounds, each a clean arc off the board, the second a fifth of
     the first. |sin| has a corner at every contact, which is exactly
     what a hard thing hitting a hard thing looks like. */
  return {
    tilt: rest - FALL.bounce * rest * Math.abs(Math.sin(w * Math.PI * 2)) * Math.exp(-3.2 * w),
    landed: true, done: false
  };
}

/* ---------- the men arriving ----------
   A new game used to fade in. Now the men are set down: rank by rank
   from your own side outward, the middle files a beat before the edges,
   each one dropped the last few centimetres onto its square with a
   small hop as it lands. It takes about a second, and it is the room
   saying "your move" without a word.

   cascade() is the schedule — which square lands when — and it is
   handed back to whoever asks, so a sound can be put on every landing
   rather than on a timer that hopes. dropAt() is one piece's fall,
   measured from its own start. Heights are in squares, like every
   other height in this file. */
var DROP = { height: 1.55, fall: 300, hop: 0.075, hopMs: 150, settleMs: 140, settle: 0.05,
             wave: 118, step: 27 };
var DROP_MS = DROP.fall + DROP.hopMs + DROP.settleMs;

function cascade(board, opts) {
  opts = opts || {};
  var orient = opts.orientation === -1 ? -1 : 1;
  var wave = opts.wave == null ? DROP.wave : opts.wave;
  var step = opts.step == null ? DROP.step : opts.step;
  /* the ranks that actually have men on them, nearest the player first:
     a lesson position with three pieces should take a third of a second,
     not the same second a full board does */
  var seen = {}, ranks = [], sq;
  for (sq = 0; sq < 128; sq++) {
    if ((sq & 0x88) || !board[sq]) continue;
    if (!seen[sq >> 4]) { seen[sq >> 4] = true; ranks.push(sq >> 4); }
  }
  ranks.sort(function (a, b) { return orient === 1 ? a - b : b - a; });
  var order = {};
  for (var i = 0; i < ranks.length; i++) order[ranks[i]] = i;
  var out = [];
  for (sq = 0; sq < 128; sq++) {
    if ((sq & 0x88) || !board[sq]) continue;
    /* the centre files first, the edges last: d and e, then c and f… */
    var fromMiddle = Math.abs((sq & 7) - 3.5) - 0.5;
    var delay = order[sq >> 4] * wave + fromMiddle * step;
    out.push({ sq: sq, piece: board[sq], wave: order[sq >> 4], delay: delay, t: delay + DROP.fall });
  }
  out.sort(function (a, b) { return a.t - b.t || a.sq - b.sq; });
  return out;
}
/* how long the whole arrival takes, from the first piece leaving the
   air to the last one coming to rest */
function cascadeEnd(list) {
  var end = 0;
  for (var i = 0; i < list.length; i++) end = Math.max(end, list[i].delay + DROP_MS);
  return end;
}
function dropAt(ms) {
  if (!(ms > 0)) return { y: DROP.height, squash: 1, alpha: 0, landed: false, done: false };
  if (ms >= DROP_MS) return { y: 0, squash: 1, alpha: 1, landed: true, done: true };
  if (ms < DROP.fall) {
    var u = ms / DROP.fall;
    return { y: DROP.height * (1 - u * u), squash: 1, alpha: clamp(u / 0.4, 0, 1),
             landed: false, done: false };
  }
  ms -= DROP.fall;
  if (ms < DROP.hopMs) {
    var v = ms / DROP.hopMs;
    /* it touches, gives a little, and hops — the give is over in the
       first quarter of the hop, so it is in the air again un-squashed */
    return { y: DROP.hop * Math.sin(Math.PI * v), squash: 1 - DROP.settle * Math.max(0, 1 - v * 4),
             alpha: 1, landed: true, done: false };
  }
  return { y: 0, squash: settleAt((ms - DROP.hopMs) / DROP.settleMs, DROP.settle * 0.7),
           alpha: 1, landed: true, done: false };
}

/* ---------- a camera that eases rather than lerps ----------
   A critically damped spring, stepped exactly rather than by Euler, so
   a long frame on a slow phone lands the camera where a short one
   would have instead of flinging it past. Critically damped is the one
   setting that arrives as quickly as it can without going past: a push-
   in that overshoots and comes back reads as the camera operator
   flinching. dt is seconds, omega is how stiff (roughly 4/omega seconds
   to settle). */
function spring(x, v, target, dt, omega) {
  if (!(dt > 0)) return { x: x, v: v };
  var d = x - target, c = v + omega * d, e = Math.exp(-omega * dt);
  return { x: target + (d + c * dt) * e, v: (v - omega * c * dt) * e };
}
function springAtRest(x, v, target) {
  return Math.abs(x - target) < 1e-3 && Math.abs(v) < 1e-3;
}

/* ---------- light where something was taken ----------
   The square under a capture flashes like a struck surface: a fast
   attack and a decay a heavier capture holds a little longer, with a
   ring of light running out from it. `power` is 0..1, a pawn to a
   queen. */
function impactAt(ms, power) {
  power = clamp(power == null ? 0.5 : power, 0, 1);
  var dur = 300 + 280 * power;
  if (!(ms >= 0) || ms >= dur) return { amount: 0, ring: 1, live: false };
  var attack = 38;
  var amount = ms < attack ? ms / attack : Math.pow(1 - (ms - attack) / (dur - attack), 2);
  return { amount: amount, ring: easeOutQuart(ms / dur), live: true };
}

var Motion = {
  CHARACTER: CHARACTER, MIN_DUR: MIN_DUR, MAX_DUR: MAX_DUR, PULSE_MS: PULSE_MS,
  FALL_MS: FALL_MS, FALL_IMPACT: FALL_IMPACT, DROP: DROP, DROP_MS: DROP_MS,
  plan: plan, at: at, rookAt: rookAt, toppleAt: toppleAt, promoteAt: promoteAt,
  checkPulse: checkPulse, character: character, ease: ease, hump: hump, span: span,
  kingFall: kingFall, cascade: cascade, cascadeEnd: cascadeEnd, dropAt: dropAt,
  spring: spring, springAtRest: springAtRest, impactAt: impactAt
};
if (typeof module !== "undefined" && module.exports) module.exports = Motion;
else root.Motion = Motion;
})(typeof self !== "undefined" ? self : this);
