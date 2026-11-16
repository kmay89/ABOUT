/* momentum.js — who has the game, as you can see it.

   A bar that leans toward whoever is doing well is the quickest way to
   feel a game: you see it tilt when you win a piece, you see it come
   back when you hold on, and at the end you can see the moment it
   turned. What it must never be is a hint. An engine's evaluation would
   tell you that the move you just played was a mistake before the coach
   has punished it, and that is the coach's secret to keep. So this reads
   only what anybody can see by looking at the board:

     material   what each side has left, in pawns
     activity   pieces out of bed, pawns and pieces in the middle, a king
                tucked away by castling
     the blow   a capture or a check gives the side that landed it a
                surge that fades over the next few moves, so a trade is a
                swing and back, the way it feels across a table

   squashed into -1..1 (White's way positive) so a piece or two is a
   clear lean and only a rout pins it to the end.

   Then the story of a game, from one side: how low it went, when it
   turned, and whether a win was a comeback.

   Pure, so chess/tools/momentum-check.js reads all of it in node.     */
(function (root) {
"use strict";

/* the same values the rest of the room counts material with */
var VAL = { 1: 1, 2: 3, 3: 3.2, 4: 5, 5: 9, 6: 0 };
var SCALE = 4.5;          /* pawns of advantage at which the bar leans about three quarters of the way */
var LEAD = 0.12;          /* below this, nobody really has it */
var COMEBACK = -0.45;     /* this far behind (about two pawns and the worse game, or a piece) and then a win */
var DECAY = 0.55;         /* how much of a surge is left a move later */

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function sq(file, rank) { return rank * 16 + file; }

/* what the board shows, for each side: { material, activity } and the
   difference, White's way positive */
function measure(board) {
  var mat = { 1: 0, "-1": 0 }, act = { 1: 0, "-1": 0 }, kings = {};
  for (var s = 0; s < 128; s++) {
    if (s & 0x88) continue;
    var p = board[s];
    if (!p) continue;
    var side = p > 0 ? 1 : -1, kind = Math.abs(p), file = s & 7, rank = s >> 4;
    var home = side > 0 ? 0 : 7, rel = side > 0 ? rank : 7 - rank;
    mat[side] += VAL[kind] || 0;
    if (kind === 2 || kind === 3) { if (rank !== home) act[side] += 0.25; }
    if (kind === 6) kings[side] = s;
    /* the middle: the four squares, and the ring around them a little */
    var centre = (file === 3 || file === 4) && (rank === 3 || rank === 4);
    var ring = file >= 2 && file <= 5 && rank >= 2 && rank <= 5;
    if (kind !== 6 && centre) act[side] += kind === 1 ? 0.22 : 0.15;
    else if (kind !== 6 && kind !== 1 && ring && rel >= 2) act[side] += 0.06;
  }
  /* a king that has gone to a corner along its own back rank has castled
     or as good as: tucked in, and its rook on the way to the middle */
  [1, -1].forEach(function (side) {
    var k = kings[side];
    if (k == null) return;
    var home = side > 0 ? 0 : 7;
    if ((k >> 4) === home && ((k & 7) === 6 || (k & 7) === 2 || (k & 7) === 1)) act[side] += 0.4;
  });
  return {
    material: mat[1] - mat[-1], activity: act[1] - act[-1],
    white: { material: mat[1], activity: act[1] }, black: { material: mat[-1], activity: act[-1] }
  };
}
function lean(score) { return Math.tanh(score / SCALE); }

/* a game's momentum, from its first position */
function create(board) {
  var st = { m: 0, surge: 0, pending: 0, hist: [0], plies: 0, lead: 0, last: 0 };
  if (board) st.m = st.hist[0] = lean(score(st, board));
  return st;
}
function score(st, board) {
  var b = measure(board);
  return b.material + 0.6 * b.activity + st.surge + st.pending;
}
/* after a move: info = { board (after), mover (1 or -1), captured (piece
   code or 0), check (bool), retake (bool: the piece that just took can
   be taken straight back), piece (the piece that moved), mate (bool) }. Returns what happened, as a list:
     { type: "lead", side }    somebody has it, for the first time
     { type: "shift", side }   it has turned: the other side had it
     { type: "surge", side, by } a big lean in one move
   and moves st along. */
function step(st, info) {
  var before = st.m, events = [];
  st.surge *= DECAY;
  /* A trade half made is not a swing: a queen taken with a queen that can
     be taken straight back is an even trade, and the bar should not lurch
     to the end and back. So a capture whose piece stands where it can be
     taken counts only what it gains over its own value until the reply
     settles it. It never counts a loss: that would be telling you your
     move was a mistake before the coach has shown it. */
  st.pending = 0;
  if (info.captured && info.retake) {
    var gain = (VAL[Math.abs(info.captured)] || 0), risk = VAL[Math.abs(info.piece)] || 0;
    st.pending = -info.mover * Math.min(gain, risk);
  }
  if (info.captured) st.surge += info.mover * Math.min(3, VAL[Math.abs(info.captured)] || 1) * 0.35 * (info.retake ? 0.4 : 1);
  if (info.check) st.surge += info.mover * 0.5;
  st.m = lean(score(st, info.board));
  /* a mate is the whole game, whatever the material says */
  if (info.mate) st.m = info.mover;
  st.plies++;
  st.hist.push(st.m);
  var now = Math.abs(st.m) >= LEAD ? (st.m > 0 ? 1 : -1) : 0;
  if (now && now !== st.lead) {
    events.push({ type: st.lead ? "shift" : "lead", side: now });
    st.lead = now;
  }
  var d = st.m - before;
  if (Math.abs(d) >= 0.3) events.push({ type: "surge", side: d > 0 ? 1 : -1, by: Math.abs(d) });
  return events;
}

/* the story of a game, as `side` lived it: how low it got and when, how
   high, how many times it turned, and what kind of win (or loss) it was.
   result: 1 White won, -1 Black won, 0 a draw. */
function story(hist, result, side) {
  var low = 0, lowAt = 0, high = 0, highAt = 0, turns = 0, prev = 0;
  for (var i = 0; i < hist.length; i++) {
    var v = hist[i] * side;
    if (v < low) { low = v; lowAt = i; }
    if (v > high) { high = v; highAt = i; }
    var lead = Math.abs(v) >= LEAD ? (v > 0 ? 1 : -1) : 0;
    if (lead && prev && lead !== prev) turns++;
    if (lead) prev = lead;
  }
  var won = result === side, lost = result === -side, long = hist.length >= 16;
  return {
    low: low, lowAt: lowAt, high: high, highAt: highAt, turns: turns,
    /* behind and then won */
    comeback: won && low <= COMEBACK,
    /* never behind at all, in a real game */
    wire: won && long && low > -LEAD,
    /* ahead and then lost: the one that got away */
    slipped: lost && high >= -COMEBACK,
    /* back and forth */
    seesaw: turns >= 3
  };
}

var Momentum = { VAL: VAL, SCALE: SCALE, LEAD: LEAD, COMEBACK: COMEBACK, DECAY: DECAY,
                 measure: measure, lean: lean, create: create, step: step, story: story };
if (typeof module !== "undefined" && module.exports) module.exports = Momentum;
else root.Momentum = Momentum;
})(typeof window !== "undefined" ? window : this);
