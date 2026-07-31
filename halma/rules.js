/* rules.js — Chinese checkers, complete and pure.

   ## The board

   A hexagram: a hexagon of side five with a ten-hole triangle on each of its
   six edges. 61 + 60 = **121 holes**, which is the board everybody actually
   owns.

   It is built here from one list — the width of each of the seventeen rows —
   and everything else is derived. That matters more than it sounds, because
   the alternative is a hand-written adjacency table with 121 entries and six
   neighbours each, and a hand-written table is a table with a mistake in it.

   Each hole gets a **half-column** coordinate `hx`, with each row centred, so
   that:

     · two holes in the same row are neighbours when their hx differ by 2
     · two holes in adjacent rows are neighbours when their hx differ by 1

   That is the triangular lattice, exactly, in two comparisons. The widths
   alternate parity all the way down the board, which is what makes the
   diagonal rule work without a special case anywhere.

   ## Moving

   A piece **steps** to an adjacent empty hole, or **jumps** a single adjacent
   piece — anybody's — landing on the empty hole directly beyond, in the same
   straight line. Jumps chain, and a chain may turn at every hop, which is the
   whole game: the board is a machine for building ladders, and a good move is
   usually one that leaves a ladder standing for the piece behind it.

   Nothing is ever captured. This is a race.

   ## The two rules that stop it being a farce

   **You may not stop in somebody else's triangle.** Passing through is fine —
   jumping over is fine — but a piece may not end its move in a home triangle
   that is neither where it started nor where it is going. Without this rule
   the strongest strategy is to move into an opponent's destination and sit
   there, and the game becomes a blocking contest rather than a race.

   **You must eventually get out of your own triangle.** The classic spoiler
   is to leave one piece at home forever, so the player whose destination that
   is can never finish. So after a player's twentieth move, if they still have
   pieces at home and any legal move would take one out, those are the only
   moves they have. It costs nothing to anybody playing in good faith and it
   removes the one way this game can be ruined.                             */
(function (root) {
"use strict";

var Rules = {};

/* the seventeen rows of the star */
var WIDTH = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1];
Rules.WIDTH = WIDTH;
Rules.ROWS = WIDTH.length;

/* ---------- the holes ---------- */
var HOLE = [];        /* {r, i, hx} per hole, in row order   */
var AT = {};          /* "r:hx" → index                      */
var NB = [];          /* index → the up-to-six neighbours     */
var LINE = [];        /* index → [{over, land}] per direction */

(function build() {
  var r, i;
  for (r = 0; r < WIDTH.length; r++) {
    var w = WIDTH[r];
    for (i = 0; i < w; i++) {
      var hx = -(w - 1) + 2 * i;
      AT[r + ":" + hx] = HOLE.length;
      HOLE.push({ r: r, i: i, hx: hx });
    }
  }
  /* the six directions, as (row delta, half-column delta) */
  var DIR = [[0, -2], [0, 2], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (i = 0; i < HOLE.length; i++) {
    var h = HOLE[i], nb = [], ln = [];
    for (var d = 0; d < 6; d++) {
      var over = AT[(h.r + DIR[d][0]) + ":" + (h.hx + DIR[d][1])];
      var land = AT[(h.r + DIR[d][0] * 2) + ":" + (h.hx + DIR[d][1] * 2)];
      nb.push(over === undefined ? -1 : over);
      ln.push({ over: over === undefined ? -1 : over,
                land: land === undefined ? -1 : land });
    }
    NB.push(nb);
    LINE.push(ln);
  }
})();

Rules.holes = function () { return HOLE; };
Rules.count = function () { return HOLE.length; };
Rules.neighbours = function (i) { return NB[i]; };

/* ---------- the six points of the star ----------
   Named the way you would point at them, and paired with the one opposite.  */
function triangle(name, rows, side) {
  var out = [];
  for (var k = 0; k < rows.length; k++) {
    var r = rows[k], w = WIDTH[r];
    var n = k < rows.length / 2 ? 0 : 0;
    out.push({ r: r, w: w, side: side });
  }
  return out;
}
/* built explicitly, because the shape of each point is the one thing that
   cannot be derived from the widths alone */
var HOMES = (function () {
  function cells(spec) {
    var out = [], k;
    for (k = 0; k < spec.length; k++) {
      var r = spec[k][0], from = spec[k][1], n = spec[k][2], w = WIDTH[r], i;
      for (i = 0; i < n; i++) out.push(AT[r + ":" + (-(w - 1) + 2 * (from + i))]);
    }
    return out;
  }
  return [
    /* 0 top          */ cells([[0, 0, 1], [1, 0, 2], [2, 0, 3], [3, 0, 4]]),
    /* 1 upper-right  */ cells([[4, 9, 4], [5, 9, 3], [6, 9, 2], [7, 9, 1]]),
    /* 2 lower-right  */ cells([[9, 9, 1], [10, 9, 2], [11, 9, 3], [12, 9, 4]]),
    /* 3 bottom       */ cells([[16, 0, 1], [15, 0, 2], [14, 0, 3], [13, 0, 4]]),
    /* 4 lower-left   */ cells([[9, 0, 1], [10, 0, 2], [11, 0, 3], [12, 0, 4]]),
    /* 5 upper-left   */ cells([[4, 0, 4], [5, 0, 3], [6, 0, 2], [7, 0, 1]])
  ];
})();
Rules.HOMES = HOMES;
Rules.HOME_NAME = ["top", "upper right", "lower right", "bottom", "lower left", "upper left"];
/* directly across the star */
Rules.OPPOSITE = [3, 4, 5, 0, 1, 2];

/* which point of the star, if any, a hole belongs to */
var POINT = (function () {
  var p = new Array(HOLE.length), h, k;
  for (h = 0; h < HOLE.length; h++) p[h] = -1;
  for (k = 0; k < 6; k++) for (h = 0; h < HOMES[k].length; h++) p[HOMES[k][h]] = k;
  return p;
})();
Rules.pointOf = function (hole) { return POINT[hole]; };

/* who sits where, by how many are playing. Opposites are paired so every
   game is a head-on race rather than a scramble. */
Rules.SEATING = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 3, 1, 4],
  6: [0, 1, 2, 3, 4, 5]
};

/* The far tip of a triangle: the hole a piece should aim at, which is what
   makes the pieces pack into the point instead of loitering at its mouth.

   Derived rather than listed. The obvious version is a table of six indices
   into the six HOMES arrays, and the obvious version is wrong: those arrays
   are built row by row, so which end of each is the outer tip depends on
   which way that particular triangle faces. Two of the six came out as the
   *inner* corner, which is a mistake nothing catches until you notice the
   machine steering its pieces into the mouth of the point and stopping. The
   tip is the hole furthest from the middle of the board, and that is true of
   all six without a special case. */
var CENTRE = AT["8:0"];
var TIP = (function () {
  var out = [], k, i;
  for (k = 0; k < 6; k++) {
    var best = HOMES[k][0], bd = -1;
    for (i = 0; i < HOMES[k].length; i++) {
      var d = Rules.dist ? 0 : 0;
      var A = HOLE[HOMES[k][i]], B = HOLE[CENTRE];
      var dr = Math.abs(A.r - B.r), dx = Math.abs(A.hx - B.hx);
      d = dr + Math.max(0, (dx - dr) / 2);
      if (d > bd) { bd = d; best = HOMES[k][i]; }
    }
    out.push(best);
  }
  return out;
})();
Rules.tipOf = function (point) { return TIP[point]; };
Rules.CENTRE = CENTRE;

/* ---------- distance ----------
   Hex distance on the lattice, derived from (row, half-column) rather than
   stored: |Δrow| covers the diagonal part, and whatever horizontal remains
   after the diagonals have done their work costs one step per two half-
   columns. */
Rules.dist = function (a, b) {
  var A = HOLE[a], B = HOLE[b];
  var dr = Math.abs(A.r - B.r), dx = Math.abs(A.hx - B.hx);
  return dr + Math.max(0, (dx - dr) / 2);
};
var DIST = null;
Rules.distTo = function (hole, tip) {
  if (!DIST) {
    DIST = {};
    for (var t = 0; t < 6; t++) {
      var row = new Float32Array(HOLE.length);
      for (var h = 0; h < HOLE.length; h++) row[h] = Rules.dist(h, TIP[t]);
      DIST[t] = row;
    }
  }
  return DIST[tip][hole];
};

/* ---------- a game ---------- */
Rules.DEFAULTS = { players: 2, noSquat: true, vacate: 20 };

Rules.start = function (opts) {
  opts = opts || Rules.DEFAULTS;
  var n = opts.players || 2;
  var seats = Rules.SEATING[n] || Rules.SEATING[2];
  var b = new Array(HOLE.length), i, s;
  for (i = 0; i < b.length; i++) b[i] = -1;
  for (s = 0; s < seats.length; s++) {
    var home = HOMES[seats[s]];
    for (i = 0; i < home.length; i++) b[home[i]] = s;
  }
  return {
    b: b, turn: 0, ply: 0,
    seats: seats.slice(),
    moves: new Array(seats.length).fill(0),
    opts: opts, log: []
  };
};
Rules.clone = function (st) {
  return { b: st.b.slice(), turn: st.turn, ply: st.ply, seats: st.seats.slice(),
           moves: st.moves.slice(), opts: st.opts, log: st.log.slice() };
};
Rules.players = function (st) { return st.seats.length; };
Rules.homeOf = function (st, seat) { return HOMES[st.seats[seat]]; };
Rules.targetOf = function (st, seat) { return HOMES[Rules.OPPOSITE[st.seats[seat]]]; };
Rules.targetPoint = function (st, seat) { return Rules.OPPOSITE[st.seats[seat]]; };

/* ---------- moves ----------
   Returned as {f, t, path}. A step has a two-hole path; a jump chain has one
   entry per landing, which is what the renderer animates and what the coach
   talks about. */
function mayLand(st, seat, hole) {
  var p = POINT[hole];
  if (p < 0) return true;
  if (!st.opts.noSquat) return true;
  return p === st.seats[seat] || p === Rules.OPPOSITE[st.seats[seat]];
}

function chain(st, seat, origin, at, seen, path, out) {
  var found = false;
  for (var d = 0; d < 6; d++) {
    var l = LINE[at][d];
    if (l.over < 0 || l.land < 0) continue;
    if (st.b[l.over] < 0) continue;                    /* nothing to jump    */
    if (st.b[l.land] >= 0 && l.land !== origin) continue;
    if (seen[l.land]) continue;                        /* no going in circles */
    seen[l.land] = 1;
    found = true;
    var np = path.concat([l.land]);
    if (mayLand(st, seat, l.land)) out.push({ f: origin, t: l.land, path: np.slice() });
    chain(st, seat, origin, l.land, seen, np, out);
  }
  return found;
}

Rules.movesFrom = function (st, hole) {
  var seat = st.b[hole];
  if (seat < 0) return [];
  var out = [], d;
  for (d = 0; d < 6; d++) {
    var n = NB[hole][d];
    if (n >= 0 && st.b[n] < 0 && mayLand(st, seat, n)) out.push({ f: hole, t: n, path: [n] });
  }
  var seen = {};
  seen[hole] = 1;
  chain(st, seat, hole, hole, seen, [], out);
  return out;
};

Rules.moves = function (st) {
  var seat = st.turn, out = [], i;
  var mine = [];
  for (i = 0; i < st.b.length; i++) if (st.b[i] === seat) mine.push(i);
  for (i = 0; i < mine.length; i++) {
    var ms = Rules.movesFrom(st, mine[i]);
    for (var k = 0; k < ms.length; k++) out.push(ms[k]);
  }
  /* the anti-spoiler rule: once you have had your twenty moves, if you still
     have pieces at home and any move would take one out, that is all you may
     do. Nobody playing in good faith ever notices it. */
  if (st.opts.noSquat && st.moves[seat] >= (st.opts.vacate || 20)) {
    var home = Rules.homeOf(st, seat);
    var stuck = [];
    for (i = 0; i < out.length; i++) {
      if (home.indexOf(out[i].f) >= 0 && home.indexOf(out[i].t) < 0) stuck.push(out[i]);
    }
    if (stuck.length) return stuck;
  }
  return out;
};

Rules.find = function (st, mv) {
  if (!mv) return null;
  var list = Rules.movesFrom(st, mv.f | 0), i;
  if (st.b[mv.f | 0] !== st.turn) return null;
  var legal = Rules.moves(st);
  for (i = 0; i < legal.length; i++) {
    if (legal[i].f === mv.f && legal[i].t === mv.t &&
        (!mv.path || same(legal[i].path, mv.path))) return legal[i];
  }
  return null;
};
function same(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

Rules.apply = function (st, mv) {
  var n = Rules.clone(st);
  n.b[mv.f] = -1;
  n.b[mv.t] = st.turn;
  n.moves[st.turn]++;
  n.ply++;
  n.log.push({ f: mv.f, t: mv.t, path: mv.path.slice(), by: st.turn });
  n.turn = (st.turn + 1) % n.seats.length;
  return n;
};

/* ---------- home ---------- */
Rules.homeCount = function (st, seat) {
  var t = Rules.targetOf(st, seat), n = 0;
  for (var i = 0; i < t.length; i++) if (st.b[t[i]] === seat) n++;
  return n;
};
Rules.over = function (st) {
  for (var s = 0; s < st.seats.length; s++) {
    if (Rules.homeCount(st, s) === 10) return { done: true, winner: s };
  }
  return { done: false, winner: -1 };
};

/* how far a seat still has to travel, in total steps — the honest progress
   bar, and the number the machine plays to minimise */
Rules.remaining = function (st, seat) {
  var tip = Rules.targetPoint(st, seat), d = 0;
  for (var i = 0; i < st.b.length; i++) if (st.b[i] === seat) d += Rules.distTo(i, tip);
  return d;
};

Rules.name = function (mv) {
  if (!mv) return "";
  var a = HOLE[mv.f], b = HOLE[mv.t];
  var hops = mv.path.length;
  return "r" + (a.r + 1) + " → r" + (b.r + 1) + (hops > 1 ? " (" + hops + " hops)" : "");
};

/* nothing is hidden in a race; the view exists so Table.deal has a shape */
Rules.publicView = function (st, seat) {
  return { b: st.b.slice(), turn: st.turn, ply: st.ply, seats: st.seats.slice(),
           moves: st.moves.slice(), opts: st.opts, seat: seat,
           last: st.log.length ? st.log[st.log.length - 1] : null };
};

if (typeof module !== "undefined" && module.exports) module.exports = Rules;
else root.Rules = Rules;
})(typeof self !== "undefined" ? self : this);
