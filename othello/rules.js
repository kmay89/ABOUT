/* rules.js — Othello, complete and pure.

   64 squares indexed r*8+c. 0 empty, +1 the dark side (seat 0, which moves
   first), −1 the light side. No DOM, no clock, no randomness.

   Two rules carry the whole game and both are easy to get subtly wrong.

   **A move must flip something.** Placing a disc next to an enemy disc is not
   a move; the placement must *bracket* — an unbroken run of enemy discs in
   some direction with one of yours at the far end. A square that brackets
   nothing is not merely a bad move, it is not a move, and the difference
   matters because Othello positions routinely have three or four legal
   squares out of thirty empty ones.

   **Passing is not a choice.** A side with no legal move loses its turn
   automatically and silently — it never gets to decline. The game ends only
   when *neither* side can move, which is usually but not always when the
   board is full. Getting this wrong produces a game that either hangs on a
   full board or lets a player skip a turn to improve their position, and the
   second one is not a small bug: half of endgame Othello is manoeuvring your
   opponent into having no move at all.                                     */
(function (root) {
"use strict";

var N = 8;
/* the eight rays, as (dr, dc) */
var DIR = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function on(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
function me(seat) { return seat === 0 ? 1 : -1; }

var Rules = {};
Rules.N = N;

Rules.start = function () {
  var b = new Array(64), i;
  for (i = 0; i < 64; i++) b[i] = 0;
  b[27] = -1; b[28] = 1;      /* d4 light, e4 dark  */
  b[35] = 1;  b[36] = -1;     /* d5 dark,  e5 light */
  return { b: b, turn: 0, ply: 0, passes: 0, log: [] };
};
Rules.clone = function (st) {
  return { b: st.b.slice(), turn: st.turn, ply: st.ply, passes: st.passes, log: st.log.slice() };
};

/* ---------- what one placement would flip ----------
   Returned as a flat list of squares rather than as a count, because the
   renderer wants to turn them over one ray at a time and the AI wants to
   know which. Building it twice would be the obvious cheap thing and it is
   the thing that makes the two disagree. */
/* Two passes down each ray rather than one plus a scratch array. The obvious
   version collects the run as it walks and throws it away when the bracket
   turns out not to close — which allocates once per ray per empty square per
   node, and an Othello search visits a lot of nodes. Counting first and
   filling second allocates exactly the discs that actually turn. */
Rules.flips = function (b, sq, seat) {
  if (b[sq] !== 0) return [];
  var mine = me(seat), them = -mine, out = [], r = sq >> 3, c = sq & 7, d, i;
  for (d = 0; d < 8; d++) {
    var dr = DIR[d][0], dc = DIR[d][1];
    var rr = r + dr, cc = c + dc, n = 0;
    while (on(rr, cc) && b[rr * N + cc] === them) { n++; rr += dr; cc += dc; }
    if (!n || !on(rr, cc) || b[rr * N + cc] !== mine) continue;
    rr = r + dr; cc = c + dc;
    for (i = 0; i < n; i++) { out.push(rr * N + cc); rr += dr; cc += dc; }
  }
  return out;
};

/* the same walk, answering only "is this legal" — no allocation at all, and
   it is what mobility is counted with. Mobility is evaluated at every node of
   the search for both sides, so this is the hottest function in the room. */
Rules.canPlay = function (b, sq, seat) {
  if (b[sq] !== 0) return false;
  var mine = me(seat), them = -mine, r = sq >> 3, c = sq & 7, d;
  for (d = 0; d < 8; d++) {
    var dr = DIR[d][0], dc = DIR[d][1];
    var rr = r + dr, cc = c + dc, n = 0;
    while (on(rr, cc) && b[rr * N + cc] === them) { n++; rr += dr; cc += dc; }
    if (n && on(rr, cc) && b[rr * N + cc] === mine) return true;
  }
  return false;
};
Rules.mobility = function (b, seat) {
  var n = 0, i;
  for (i = 0; i < 64; i++) if (b[i] === 0 && Rules.canPlay(b, i, seat)) n++;
  return n;
};
Rules.hasMove = function (b, seat) {
  for (var i = 0; i < 64; i++) if (b[i] === 0 && Rules.canPlay(b, i, seat)) return true;
  return false;
};

Rules.movesFor = function (st, seat) {
  var out = [], i;
  for (i = 0; i < 64; i++) {
    if (st.b[i] !== 0) continue;
    var f = Rules.flips(st.b, i, seat);
    if (f.length) out.push({ sq: i, flips: f, seat: seat });
  }
  return out;
};
Rules.moves = function (st) { return Rules.movesFor(st, st.turn); };

Rules.find = function (st, mv) {
  if (!mv || mv.sq === undefined) return null;
  var f = Rules.flips(st.b, mv.sq | 0, st.turn);
  return f.length ? { sq: mv.sq | 0, flips: f, seat: st.turn } : null;
};

/* Apply, and hand the turn to whoever can actually use it. `passes` counts
   consecutive turns nobody could take — two of them is the end of the game
   and the only end there is. */
Rules.apply = function (st, mv) {
  var n = Rules.clone(st);
  step(n, mv, st.turn);
  n.log.push({ sq: mv.sq, flips: mv.flips.slice(), by: st.turn });
  if (n.passes === 1) n.log.push({ pass: 1 - st.turn });
  return n;
};
/* the same move without the history — what the search uses, because cloning
   a growing log at every node is most of the cost of a deep search and none
   of the value */
Rules.applyFast = function (st, mv) {
  var n = { b: st.b.slice(), turn: st.turn, ply: st.ply, passes: st.passes, log: st.log };
  step(n, mv, st.turn);
  return n;
};
function step(n, mv, seat) {
  var v = me(seat), i;
  n.b[mv.sq] = v;
  for (i = 0; i < mv.flips.length; i++) n.b[mv.flips[i]] = v;
  n.ply++;
  var next = 1 - seat;
  if (Rules.hasMove(n.b, next)) { n.turn = next; n.passes = 0; }
  else if (Rules.hasMove(n.b, seat)) { n.turn = seat; n.passes = 1; }
  else { n.turn = next; n.passes = 2; }
}

Rules.score = function (st) {
  var s = [0, 0], i;
  for (i = 0; i < 64; i++) {
    if (st.b[i] > 0) s[0]++;
    else if (st.b[i] < 0) s[1]++;
  }
  return s;
};
Rules.empties = function (st) { return 64 - st.b.reduce(function (a, v) { return a + (v ? 1 : 0); }, 0); };

Rules.over = function (st) {
  if (st.passes < 2 && Rules.moves(st).length) return { done: false, winner: -1, why: "" };
  if (st.passes < 2 && !Rules.moves(st).length) {
    /* belt and braces: apply() should have handled this, but a state that
       arrived over the wire did not come from apply() */
    if (Rules.movesFor(st, 1 - st.turn).length) return { done: false, winner: -1, why: "" };
  }
  var s = Rules.score(st);
  return {
    done: true,
    winner: s[0] === s[1] ? -1 : (s[0] > s[1] ? 0 : 1),
    score: s,
    why: Rules.empties(st) === 0 ? "full" : "stuck"
  };
};

/* ---------- notation ----------
   a1 in the far-left corner, the way every Othello book prints it. */
Rules.name = function (mv) {
  if (!mv || mv.sq === undefined) return "pass";
  return "abcdefgh".charAt(mv.sq & 7) + (8 - (mv.sq >> 3));
};
Rules.sqFromName = function (s) {
  var c = "abcdefgh".indexOf(String(s).charAt(0).toLowerCase());
  var r = 8 - parseInt(String(s).charAt(1), 10);
  return (c < 0 || !(r >= 0 && r < 8)) ? -1 : r * 8 + c;
};

/* the corners, and the squares that give them away — named here rather than
   in the AI, because the coach wants the same list */
Rules.CORNERS = [0, 7, 56, 63];
Rules.XSQ = { 9: 0, 14: 7, 49: 56, 54: 63 };        /* diagonal neighbour → the corner it opens */
Rules.CSQ = { 1: 0, 8: 0, 6: 7, 15: 7, 48: 56, 57: 56, 55: 63, 62: 63 };

/* nothing is hidden in Othello; the view exists so Table.deal has a shape
   to send and so a future variant has somewhere to put a secret */
Rules.publicView = function (st, seat) {
  return { b: st.b.slice(), turn: st.turn, ply: st.ply, passes: st.passes,
           last: st.log.length ? st.log[st.log.length - 1] : null, seat: seat };
};

if (typeof module !== "undefined" && module.exports) module.exports = Rules;
else root.Rules = Rules;
})(typeof self !== "undefined" ? self : this);
