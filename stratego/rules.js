/* rules.js — Stratego, complete and pure.

   A 10×10 board with two lakes in the middle, forty pieces a side, and the
   thing that makes it the game it is: **you cannot see what anything is.**

   ## The board

   100 squares, indexed r*10+c, row 0 at the far side. Eight of them are
   water — (4,2) (4,3) (5,2) (5,3) and the same four columns mirrored to
   (4,6) (4,7) (5,6) (5,7) — and nothing may enter or cross them.

   ## The pieces

   Rank is a number, which makes combat arithmetic rather than a table:

      1  Spy         ×1     the one that beats the Marshal, and only by attacking
      2  Scout       ×8     moves any distance in a line
      3  Miner       ×5     the only thing that can take a Bomb
      4  Sergeant    ×4
      5  Lieutenant  ×4
      6  Captain     ×4
      7  Major       ×3
      8  Colonel     ×2
      9  General     ×1
     10  Marshal     ×1
     11  Bomb        ×6     never moves; kills anything but a Miner
      0  Flag        ×1     never moves; taking it wins the game

   Forty exactly, which the checks verify rather than assume.

   ## Combat, in four lines

   Higher rank wins. Equal ranks kill each other. A Spy that *attacks* the
   Marshal wins; a Marshal that attacks the Spy wins, because the Spy's
   advantage is the ambush and not the man. A Miner attacking a Bomb defuses
   it; anything else attacking a Bomb dies.

   ## What you are allowed to know

   This is the whole game and it is a networking problem, exactly as it is in
   the card rooms. `publicView` sends each player their own ranks in full, and
   of the enemy only what the board itself has shown:

     · where every enemy piece is
     · whether it has ever moved — which is *public and enormous*, because a
       piece that has moved is not a Bomb and is not the Flag
     · its rank, if and only if it has been in a fight, because both pieces
       reveal when they strike

   Everything else is inference, and inference is the game. The permutation
   test in tools/rules-check.js shuffles the unseen ranks and requires the
   message to come back byte-identical.                                     */
(function (root) {
"use strict";

var N = 10;
var Rules = {};
Rules.N = N;

/* the two lakes */
var WATER = {};
[[4, 2], [4, 3], [5, 2], [5, 3], [4, 6], [4, 7], [5, 6], [5, 7]]
  .forEach(function (p) { WATER[p[0] * N + p[1]] = 1; });
Rules.isWater = function (sq) { return !!WATER[sq]; };
Rules.WATER = Object.keys(WATER).map(Number);

/* plies with nothing captured before the board is called a draw */
var QUIET = 120;
Rules.QUIET = QUIET;

Rules.FLAG = 0;
Rules.SPY = 1;
Rules.SCOUT = 2;
Rules.MINER = 3;
Rules.MARSHAL = 10;
Rules.BOMB = 11;

/* how many of each, and what to call them */
/* `tiny` is the label that goes under the number on a 38-pixel tile. It is a
   separate field rather than a substring, because "Lieutenant" cut to eight
   characters is "LIEUTENA", which is not a word and does not help anybody. */
Rules.ARMY = [
  { rank: 1, n: 1, name: "Spy", short: "S", tiny: "SPY" },
  { rank: 2, n: 8, name: "Scout", short: "2", tiny: "SCOUT" },
  { rank: 3, n: 5, name: "Miner", short: "3", tiny: "MINER" },
  { rank: 4, n: 4, name: "Sergeant", short: "4", tiny: "SERGT" },
  { rank: 5, n: 4, name: "Lieutenant", short: "5", tiny: "LIEUT" },
  { rank: 6, n: 4, name: "Captain", short: "6", tiny: "CAPT" },
  { rank: 7, n: 3, name: "Major", short: "7", tiny: "MAJOR" },
  { rank: 8, n: 2, name: "Colonel", short: "8", tiny: "COLNL" },
  { rank: 9, n: 1, name: "General", short: "9", tiny: "GENL" },
  { rank: 10, n: 1, name: "Marshal", short: "10", tiny: "MARSH" },
  { rank: 11, n: 6, name: "Bomb", short: "B", tiny: "BOMB" },
  { rank: 0, n: 1, name: "Flag", short: "F", tiny: "FLAG" }
];
Rules.TINY = (function () {
  var m = {};
  for (var i = 0; i < Rules.ARMY.length; i++) m[Rules.ARMY[i].rank] = Rules.ARMY[i].tiny;
  return m;
})();
Rules.NAME = (function () {
  var m = {};
  for (var i = 0; i < Rules.ARMY.length; i++) m[Rules.ARMY[i].rank] = Rules.ARMY[i].name;
  return m;
})();
Rules.SHORT = (function () {
  var m = {};
  for (var i = 0; i < Rules.ARMY.length; i++) m[Rules.ARMY[i].rank] = Rules.ARMY[i].short;
  return m;
})();
Rules.mobile = function (rank) { return rank !== Rules.FLAG && rank !== Rules.BOMB; };

/* which four rows each side sets up in */
Rules.homeRows = function (seat) { return seat === 0 ? [6, 7, 8, 9] : [0, 1, 2, 3]; };
Rules.homeSquares = function (seat) {
  var rows = Rules.homeRows(seat), out = [];
  for (var i = 0; i < rows.length; i++) for (var c = 0; c < N; c++) out.push(rows[i] * N + c);
  return out;
};

/* the full roster, as a flat list of ranks — what a deployment must contain */
Rules.roster = function () {
  var out = [];
  for (var i = 0; i < Rules.ARMY.length; i++) {
    for (var k = 0; k < Rules.ARMY[i].n; k++) out.push(Rules.ARMY[i].rank);
  }
  return out;
};

/* ---------- a game ---------- */
Rules.empty = function () {
  return {
    b: new Array(100).fill(-1),   /* square → piece index, or -1            */
    p: [],                        /* every piece ever, dead ones included   */
    turn: 0, ply: 0, quiet: 0, phase: "setup",
    ready: [false, false],
    dead: [[], []],               /* ranks taken from each side, in order   */
    log: [], last: null, fight: null,
    over: null
  };
};
Rules.clone = function (st) {
  return {
    b: st.b.slice(),
    p: st.p.map(function (q) {
      return { seat: q.seat, rank: q.rank, sq: q.sq, moved: q.moved, shown: q.shown, dead: q.dead };
    }),
    turn: st.turn, ply: st.ply, quiet: st.quiet || 0, phase: st.phase,
    ready: st.ready.slice(),
    dead: [st.dead[0].slice(), st.dead[1].slice()],
    log: st.log.slice(), last: st.last, fight: st.fight,
    over: st.over
  };
};

/* Put an army down. `ranks` is 40 entries in home-square order, so a
   deployment is a flat list and the interface can shuffle it freely. */
Rules.deploy = function (st, seat, ranks) {
  var home = Rules.homeSquares(seat);
  if (!ranks || ranks.length !== 40) return null;
  var want = Rules.roster().slice().sort(), got = ranks.slice().sort();
  for (var i = 0; i < 40; i++) if (want[i] !== got[i]) return null;   /* wrong army */
  var n = Rules.clone(st);
  /* clear anything this seat already had down */
  for (i = 0; i < n.p.length; i++) {
    if (n.p[i].seat === seat && !n.p[i].dead) { n.b[n.p[i].sq] = -1; n.p[i].dead = true; }
  }
  for (i = 0; i < 40; i++) {
    var sq = home[i];
    n.p.push({ seat: seat, rank: ranks[i], sq: sq, moved: false, shown: false, dead: false });
    n.b[sq] = n.p.length - 1;
  }
  n.ready[seat] = true;
  if (n.ready[0] && n.ready[1]) { n.phase = "play"; n.turn = 0; }
  return n;
};

/* ---------- moving ---------- */
var STEP = [-N, N, -1, 1];
function on(sq) { return sq >= 0 && sq < 100; }
function sameRow(a, b) { return ((a / N) | 0) === ((b / N) | 0); }

Rules.movesFrom = function (st, sq) {
  var i = st.b[sq];
  if (i < 0) return [];
  var pc = st.p[i];
  if (!Rules.mobile(pc.rank)) return [];
  var out = [], d;
  for (d = 0; d < 4; d++) {
    var step = STEP[d];
    var cur = sq;
    for (;;) {
      var next = cur + step;
      if (!on(next)) break;
      /* left and right must not wrap round the edge of the board */
      if ((step === -1 || step === 1) && !sameRow(cur, next)) break;
      if (WATER[next]) break;
      var t = st.b[next];
      if (t < 0) {
        out.push({ f: sq, t: next, strike: false });
        /* only a Scout keeps going */
        if (pc.rank !== Rules.SCOUT) break;
        cur = next;
        continue;
      }
      if (st.p[t].seat !== pc.seat) out.push({ f: sq, t: next, strike: true });
      break;                                   /* anything occupied stops you */
    }
  }
  /* the two-squares rule: a piece may not shuttle between the same pair of
     squares a third time. Without it a threatened piece simply rocks back and
     forth forever and no position ever resolves. */
  return out.filter(function (m) { return !shuttling(st, m); });
};

/* the last few moves by this piece, to see whether it is rocking */
function shuttling(st, mv) {
  var seat = st.p[st.b[mv.f]].seat;
  var mine = [];
  for (var i = st.log.length - 1; i >= 0 && mine.length < 6; i--) {
    if (st.log[i].by === seat) mine.push(st.log[i]);
  }
  /* mine[0] is my previous move. Rocking looks like: t→f, f→t, t→f … */
  if (mine.length < 3) return false;
  if (!(mine[0].f === mv.t && mine[0].t === mv.f)) return false;
  if (!(mine[1].f === mv.f && mine[1].t === mv.t)) return false;
  if (!(mine[2].f === mv.t && mine[2].t === mv.f)) return false;
  return true;
}

Rules.moves = function (st) {
  if (st.phase !== "play") return [];
  var out = [], sq;
  for (sq = 0; sq < 100; sq++) {
    var i = st.b[sq];
    if (i < 0 || st.p[i].seat !== st.turn) continue;
    var ms = Rules.movesFrom(st, sq);
    for (var k = 0; k < ms.length; k++) out.push(ms[k]);
  }
  return out;
};

Rules.find = function (st, mv) {
  if (!mv) return null;
  var list = Rules.moves(st);
  for (var i = 0; i < list.length; i++) {
    if (list[i].f === (mv.f | 0) && list[i].t === (mv.t | 0)) return list[i];
  }
  return null;
};

/* ---------- combat ----------
   Returns what happens, without changing anything: "att" the attacker dies,
   "def" the defender dies, "both", or "flag". */
Rules.fight = function (a, d) {
  if (d === Rules.FLAG) return "flag";
  if (d === Rules.BOMB) return a === Rules.MINER ? "def" : "att";
  if (a === Rules.SPY && d === Rules.MARSHAL) return "def";
  if (a === d) return "both";
  return a > d ? "def" : "att";
};

Rules.apply = function (st, mv) {
  var n = Rules.clone(st);
  var i = n.b[mv.f], pc = n.p[i];
  var j = n.b[mv.t];
  var rec = { f: mv.f, t: mv.t, by: pc.seat, rank: pc.rank, strike: j >= 0 };

  n.b[mv.f] = -1;
  pc.moved = true;

  if (j < 0) {
    pc.sq = mv.t;
    n.b[mv.t] = i;
    n.fight = null;
  } else {
    var def = n.p[j];
    var r = Rules.fight(pc.rank, def.rank);
    /* both pieces show themselves in a fight — that is the rule everybody
       plays and it is where all the information in this game comes from */
    pc.shown = true;
    def.shown = true;
    rec.def = def.rank;
    rec.result = r;
    n.fight = { sq: mv.t, att: pc.rank, def: def.rank, result: r, by: pc.seat };

    if (r === "flag") {
      def.dead = true;
      n.dead[def.seat].push(def.rank);
      pc.sq = mv.t; n.b[mv.t] = i;
      n.over = { winner: pc.seat, why: "flag" };
      n.phase = "done";
    } else if (r === "def") {
      def.dead = true;
      n.dead[def.seat].push(def.rank);
      pc.sq = mv.t; n.b[mv.t] = i;
    } else if (r === "att") {
      pc.dead = true;
      n.dead[pc.seat].push(pc.rank);
      n.b[mv.t] = j;
    } else {
      pc.dead = true; def.dead = true;
      n.dead[pc.seat].push(pc.rank);
      n.dead[def.seat].push(def.rank);
      n.b[mv.t] = -1;
    }
  }

  n.log.push(rec);
  n.last = rec;
  n.ply++;
  n.quiet = (j >= 0) ? 0 : (st.quiet || 0) + 1;
  if (n.phase === "play") {
    n.turn = 1 - n.turn;
    /* a side with nothing left to move has lost, and so has a side with
       nothing left that *can* move — an army of bombs is a lost army */
    if (!Rules.moves(n).length) {
      n.over = { winner: 1 - n.turn, why: "stuck" };
      n.phase = "done";
    } else if (n.quiet >= QUIET) {
      /* Two armies that have both decided to wait. It happens: Stratego
         rewards not committing, and two players who both take that to its
         conclusion produce a board where nothing can profitably move. A
         hundred and twenty plies — sixty moves each — with nothing taken is
         not a position that is going anywhere, and calling it a draw is
         better than pretending otherwise. */
      n.over = { winner: -1, why: "quiet" };
      n.phase = "done";
    }
  }
  return n;
};

Rules.over = function (st) { return st.over || null; };

/* how many of each rank a side still has on the board */
Rules.census = function (st, seat) {
  var m = {};
  for (var i = 0; i < st.p.length; i++) {
    var q = st.p[i];
    if (q.seat !== seat || q.dead) continue;
    m[q.rank] = (m[q.rank] || 0) + 1;
  }
  return m;
};
Rules.alive = function (st, seat) {
  var n = 0;
  for (var i = 0; i < st.p.length; i++) if (st.p[i].seat === seat && !st.p[i].dead) n++;
  return n;
};

Rules.name = function (mv, st) {
  if (!mv) return "";
  var a = "abcdefghij".charAt(mv.f % N) + (N - ((mv.f / N) | 0));
  var b = "abcdefghij".charAt(mv.t % N) + (N - ((mv.t / N) | 0));
  return a + (mv.strike ? "×" : "–") + b;
};

/* ================================================================
   what a seat may see
   ================================================================
   Your own army in full. Of theirs: where each piece is, whether it has ever
   moved, and its rank only if it has been in a fight.

   `moved` being public is not a concession, it is the game. A piece that has
   moved is not a Bomb and is not the Flag, and everybody at the board watched
   it happen. Hiding it would be hiding something the physical game shows.  */
Rules.publicView = function (st, seat) {
  var cells = new Array(100), i;
  for (i = 0; i < 100; i++) cells[i] = null;
  for (i = 0; i < st.p.length; i++) {
    var q = st.p[i];
    if (q.dead) continue;
    if (q.seat === seat) {
      cells[q.sq] = { seat: q.seat, rank: q.rank, moved: q.moved, shown: q.shown, mine: true };
    } else {
      cells[q.sq] = { seat: q.seat, rank: q.shown ? q.rank : -1, moved: q.moved, shown: q.shown, mine: false };
    }
  }
  return {
    seat: seat, cells: cells,
    turn: st.turn, ply: st.ply, quiet: st.quiet || 0, quietMax: QUIET, phase: st.phase,
    ready: st.ready.slice(),
    dead: [st.dead[0].slice(), st.dead[1].slice()],
    last: st.last ? {
      f: st.last.f, t: st.last.t, by: st.last.by, strike: st.last.strike,
      /* the ranks in a fight are shown to everybody, because they were */
      rank: st.last.strike ? st.last.rank : (st.last.by === seat ? st.last.rank : -1),
      def: st.last.def === undefined ? undefined : st.last.def,
      result: st.last.result
    } : null,
    fight: st.fight,
    over: st.over,
    legal: st.phase === "play" && st.turn === seat ? Rules.moves(st) : []
  };
};

if (typeof module !== "undefined" && module.exports) module.exports = Rules;
else root.Rules = Rules;
})(typeof self !== "undefined" ? self : this);
