/* core.js — the field, and the solver that guarantees you never have to guess.

   Minesweeper's one real flaw as a game is that a well-played board can still
   kill you. You deduce forty squares perfectly, arrive at a 50/50 in the
   corner, pick wrong, and the last ten minutes are gone — not because you
   played badly but because the board never contained the information. That is
   not difficulty, it is a coin toss wearing difficulty's coat.

   So the field here is *generated against a solver*. A candidate layout is
   played out by a machine that only ever makes deductions a person could
   make, from the same first click; if that machine gets stuck anywhere, the
   layout is thrown away and another is dealt. What you are given is a board
   that can be finished by reasoning alone.

   ## The solver

   Three rules, and the third is the one people leave out.

   **The two obvious ones.** For an open square showing n, with f flagged
   neighbours and U unknown ones: if n − f is 0 every square in U is safe; if
   n − f equals |U| every square in U is a mine.

   **Subsets.** Take two constraints (U₁, n₁) and (U₂, n₂) where U₁ ⊂ U₂. The
   difference U₂∖U₁ must contain exactly n₂ − n₁ mines. If that is 0 they are
   all safe; if it equals |U₂∖U₁| they are all mines. This is the rule behind
   every "1-2-1" and "1-2-2-1" pattern anybody has ever learned by shape, and
   without it a solver rejects boards that are perfectly ordinary to play.

   **The count.** The mines left over. If every remaining unknown square is
   accounted for by the mines still unplaced, they are all mines; if no mines
   remain, every unknown square is safe. Endgames turn on this constantly —
   it is how you finish a board whose last two numbers say nothing.

   The solver is deliberately *not* exhaustive: it does not enumerate every
   consistent mine arrangement, because a board only solvable by exhaustive
   enumeration is not one a person can solve either. Being weaker than perfect
   is the point — it is a model of a good player, and the boards it approves
   are the boards a good player can finish.                                 */
(function (root) {
"use strict";

var Core = {};

Core.LEVELS = [
  { key: "gentle", name: "Gentle",  w: 9,  h: 9,  mines: 10, blurb: "Nine by nine, ten mines. Two minutes." },
  { key: "middle", name: "Middling", w: 16, h: 16, mines: 40, blurb: "The classic middle board." },
  { key: "grim",   name: "Grim",     w: 30, h: 16, mines: 99, blurb: "The big one. Expect a quarter of an hour." },
  { key: "phone",  name: "Fits here", w: 0, h: 0,  mines: 0,  blurb: "As big a board as this screen can hold, at the same density as the middle one." }
];

/* ---------- neighbours ---------- */
function neigh(w, h, i, out) {
  var x = i % w, y = (i / w) | 0, n = 0;
  for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    var xx = x + dx, yy = y + dy;
    if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
    out[n++] = yy * w + xx;
  }
  return n;
}
Core.neighbours = function (w, h, i) {
  var o = [], n = neigh(w, h, i, o);
  o.length = n;
  return o;
};

/* ---------- a layout ---------- */
function layout(w, h, mines, safe, rnd) {
  var n = w * h, mine = new Uint8Array(n), i;
  /* the first click and everything touching it is kept clear, so the opening
     is always a region rather than a single number — which is the difference
     between a board that starts and one that has to be nudged */
  var keep = {}, tmp = [];
  keep[safe] = 1;
  var k = neigh(w, h, safe, tmp);
  for (i = 0; i < k; i++) keep[tmp[i]] = 1;
  var pool = [];
  for (i = 0; i < n; i++) if (!keep[i]) pool.push(i);
  /* Fisher–Yates on the eligible squares, so density is even and the shuffle
     is not biased by the order it walks them in */
  for (i = pool.length - 1; i > 0; i--) {
    var j = (rnd() * (i + 1)) | 0;
    var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  for (i = 0; i < mines && i < pool.length; i++) mine[pool[i]] = 1;
  return mine;
}
function counts(w, h, mine) {
  var n = w * h, adj = new Uint8Array(n), tmp = [], i, j;
  for (i = 0; i < n; i++) {
    if (mine[i]) { adj[i] = 9; continue; }
    var c = 0, k = neigh(w, h, i, tmp);
    for (j = 0; j < k; j++) if (mine[tmp[j]]) c++;
    adj[i] = c;
  }
  return adj;
}

/* ---------- the solver ----------
   Returns true if the whole board can be opened from `start` by deduction
   alone. Plays the board itself; nothing here is shown to anybody. */
Core.solvable = function (w, h, mine, adj, start) {
  var n = w * h;
  var known = new Uint8Array(n);          /* 0 unknown · 1 open · 2 known mine */
  var opened = 0, flagged = 0, tmp = [], i, j;
  var total = 0;
  for (i = 0; i < n; i++) if (mine[i]) total++;
  var wanted = n - total;

  function openCell(i) {
    if (known[i]) return;
    if (mine[i]) { known[i] = 2; flagged++; return; }
    known[i] = 1; opened++;
    if (adj[i] === 0) {
      var k = neigh(w, h, i, tmp), list = tmp.slice(0, k);
      for (var q = 0; q < list.length; q++) openCell(list[q]);
    }
  }
  function flagCell(i) { if (!known[i]) { known[i] = 2; flagged++; } }

  openCell(start);

  var guard = 0;
  while (opened < wanted && guard++ < n * 4) {
    var moved = false;

    /* rules one and two, per open number */
    var cons = [];
    for (i = 0; i < n; i++) {
      if (known[i] !== 1 || adj[i] === 0) continue;
      var k = neigh(w, h, i, tmp), U = [], f = 0;
      for (j = 0; j < k; j++) {
        if (known[tmp[j]] === 2) f++;
        else if (known[tmp[j]] === 0) U.push(tmp[j]);
      }
      if (!U.length) continue;
      var need = adj[i] - f;
      if (need === 0) { for (j = 0; j < U.length; j++) openCell(U[j]); moved = true; continue; }
      if (need === U.length) { for (j = 0; j < U.length; j++) flagCell(U[j]); moved = true; continue; }
      cons.push({ u: U, n: need });
    }
    if (moved) continue;

    /* the subset rule — every 1-2-1 anybody ever learned by shape */
    for (i = 0; i < cons.length && !moved; i++) {
      for (j = 0; j < cons.length; j++) {
        if (i === j) continue;
        var A = cons[i], B = cons[j];
        if (A.u.length >= B.u.length) continue;
        if (!subset(A.u, B.u)) continue;
        var rest = [];
        for (var q = 0; q < B.u.length; q++) if (A.u.indexOf(B.u[q]) < 0) rest.push(B.u[q]);
        var need2 = B.n - A.n;
        if (need2 === 0) { for (q = 0; q < rest.length; q++) openCell(rest[q]); moved = true; break; }
        if (need2 === rest.length) { for (q = 0; q < rest.length; q++) flagCell(rest[q]); moved = true; break; }
      }
    }
    if (moved) continue;

    /* the count: what the mines left over must be */
    var left = total - flagged, unknown = [];
    for (i = 0; i < n; i++) if (known[i] === 0) unknown.push(i);
    if (left === 0 && unknown.length) { for (i = 0; i < unknown.length; i++) openCell(unknown[i]); continue; }
    if (left === unknown.length && unknown.length) { for (i = 0; i < unknown.length; i++) flagCell(unknown[i]); continue; }

    /* the count, applied to a constraint rather than to the whole board: if
       one number's unknowns could account for every remaining mine, the
       squares nobody is looking at are all safe. This is the endgame rule. */
    var edge = {};
    for (i = 0; i < cons.length; i++) for (j = 0; j < cons[i].u.length; j++) edge[cons[i].u[j]] = 1;
    var outer = [];
    for (i = 0; i < unknown.length; i++) if (!edge[unknown[i]]) outer.push(unknown[i]);
    if (outer.length) {
      var lo = 0;
      for (i = 0; i < cons.length; i++) lo = Math.max(lo, cons[i].n);
      /* a lower bound on the mines that must sit on the edge; if it uses them
         all up, everything off the edge is safe */
      if (lo >= left) { for (i = 0; i < outer.length; i++) openCell(outer[i]); continue; }
    }
    break;                                  /* stuck: this board needs a guess */
  }
  return opened >= wanted;
};
function subset(a, b) {
  for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) < 0) return false;
  return true;
}

/* ---------- dealing ----------
   Tries until it finds a field the solver can finish. The cap is real: at
   high density a no-guess board does not always exist, and spinning forever
   looking for one would be worse than the honest fallback. When it gives up
   it says so, and the game says so too rather than pretending.            */
Core.deal = function (w, h, mines, first, opts) {
  opts = opts || {};
  var rnd = opts.rnd || Math.random;
  var tries = opts.noGuess === false ? 1 : (opts.tries || 400);
  var mine = null, adj = null, fair = false, used = 0;
  for (var t = 0; t < tries; t++) {
    used = t + 1;
    mine = layout(w, h, mines, first, rnd);
    adj = counts(w, h, mine);
    if (opts.noGuess === false) { fair = false; break; }
    if (Core.solvable(w, h, mine, adj, first)) { fair = true; break; }
  }
  return { w: w, h: h, mines: mines, mine: mine, adj: adj, fair: fair, tries: used };
};

/* a board that fits the screen, at the middle board's density (40/256) */
Core.fit = function (px, py, cell) {
  var w = Math.max(8, Math.min(40, Math.floor(px / cell)));
  var h = Math.max(8, Math.min(40, Math.floor(py / cell)));
  return { w: w, h: h, mines: Math.max(6, Math.round(w * h * 0.156)) };
};

/* ---------- what the player can be told ----------
   The same solver, run against what the player actually knows, answering one
   question: is there a square you can be sure about? It is the hint, and it
   is also how the game can promise "there is always something to find". */
Core.deduce = function (g) {
  var w = g.w, h = g.h, n = w * h, tmp = [], i, j;
  var cons = [];
  for (i = 0; i < n; i++) {
    if (g.state[i] !== 1 || g.adj[i] === 0) continue;
    var k = neigh(w, h, i, tmp), U = [], f = 0;
    for (j = 0; j < k; j++) {
      if (g.state[tmp[j]] === 2) f++;
      else if (g.state[tmp[j]] !== 1) U.push(tmp[j]);
    }
    if (!U.length) continue;
    var need = g.adj[i] - f;
    if (need === 0) return { sq: U[0], mine: false, from: i, rule: "count-met" };
    if (need === U.length) return { sq: U[0], mine: true, from: i, rule: "count-full" };
    cons.push({ u: U, n: need, from: i });
  }
  for (i = 0; i < cons.length; i++) for (j = 0; j < cons.length; j++) {
    if (i === j || cons[i].u.length >= cons[j].u.length) continue;
    if (!subset(cons[i].u, cons[j].u)) continue;
    var rest = [];
    for (var q = 0; q < cons[j].u.length; q++) if (cons[i].u.indexOf(cons[j].u[q]) < 0) rest.push(cons[j].u[q]);
    var need2 = cons[j].n - cons[i].n;
    if (need2 === 0 && rest.length) return { sq: rest[0], mine: false, from: cons[j].from, other: cons[i].from, rule: "subset" };
    if (need2 === rest.length && rest.length) return { sq: rest[0], mine: true, from: cons[j].from, other: cons[i].from, rule: "subset" };
  }
  var left = g.mines, unknown = [];
  for (i = 0; i < n; i++) {
    if (g.state[i] === 2) left--;
    else if (g.state[i] !== 1) unknown.push(i);
  }
  if (unknown.length && left === 0) return { sq: unknown[0], mine: false, rule: "no-mines-left" };
  if (unknown.length && left === unknown.length) return { sq: unknown[0], mine: true, rule: "all-mines-left" };
  return null;
};

if (typeof module !== "undefined" && module.exports) module.exports = Core;
else root.Core = Core;
})(typeof self !== "undefined" ? self : this);
