/* ai.js — the other side of the board.

   Othello punishes a naive engine harder than almost any other simple game,
   and always in the same way: **the side with the most discs in the
   middlegame is usually losing.** Every disc you own is a disc your opponent
   can flip, and a player who greedily takes the biggest flip every turn ends
   up with a huge fragile blob and no legal moves — at which point their
   opponent, who has been quietly keeping a small tidy position, plays the
   corner and turns the whole thing over.

   So the evaluation here barely looks at the count until the end. What it
   looks at is:

     · **corners** — the only permanently safe squares, and the anchor
       everything else is measured against
     · **the squares that give a corner away** — the diagonal neighbour (X)
       and the two edge neighbours (C). Occupying one of these before the
       corner is settled is the commonest way a good position is thrown away,
       and it is weighted like the disaster it is
     · **mobility** — how many moves each side has. Taking your opponent's
       moves away is the whole strategy; a player with two legal moves is
       being steered
     · **frontier discs** — discs next to an empty square, which are the ones
       that can still be flipped. Fewer is better, which is the formal version
       of "don't grab"
     · **the count** — worth almost nothing at ply 20 and worth everything at
       ply 58, so it is ramped rather than fixed

   And with few enough squares left it stops evaluating and *solves*: the
   exact result, searched to the end of the game. Where that becomes free
   depends on the tier — twelve empties for the strongest — and an engine
   that plays the last dozen squares perfectly is a different opponent from
   one that guesses them. The solve is all-or-nothing: if it will not fit in
   the budget it is abandoned for the ordinary search rather than reported
   half-done, because a partial solve is a lie and not an approximation.    */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var AI = {};

/* Depth is a ceiling; the node budget is what actually stops the search. An
   Othello position has anywhere from one legal move to fifteen, and the
   endgame solve is a different animal again, so a fixed depth costs
   milliseconds in one position and seconds in the next. A budget spends the
   same thought everywhere — and because it deepens iteratively, the shallow
   passes are not wasted, they order the deep ones. */
AI.TIERS = [
  { key: "novice", name: "Learning", depth: 1,  budget: 900,   solve: 4,  greed: 0.75, fuzz: 26,
    blurb: "Takes the biggest flip it can see. That is exactly how not to play." },
  { key: "steady", name: "Steady",   depth: 6,  budget: 9000,  solve: 9, greed: 0,    fuzz: 5,
    blurb: "Plays for mobility and won't hand you a corner." },
  { key: "sharp",  name: "Sharp",    depth: 12, budget: 34000, solve: 12, greed: 0,    fuzz: 0,
    blurb: "Steers you into having no move at all, then solves the last dozen squares exactly." }
];
AI.tier = function (k) {
  for (var i = 0; i < AI.TIERS.length; i++) if (AI.TIERS[i].key === k) return AI.TIERS[i];
  return AI.TIERS[1];
};

/* ---------- the board, as opinion ----------
   The classic table, and the numbers are not arbitrary: the corner is
   unflippable, the X-square is the square that hands the corner over, and
   everything else is graded by how easily it can be taken back. */
var W = [
  120, -22,  20,   6,   6,  20, -22, 120,
  -22, -58,  -5,  -4,  -4,  -5, -58, -22,
   20,  -5,  14,   3,   3,  14,  -5,  20,
    6,  -4,   3,   2,   2,   3,  -4,   6,
    6,  -4,   3,   2,   2,   3,  -4,   6,
   20,  -5,  14,   3,   3,  14,  -5,  20,
  -22, -58,  -5,  -4,  -4,  -5, -58, -22,
  120, -22,  20,   6,   6,  20, -22, 120
];

/* a disc is frontier if it touches an empty square — i.e. if it is still in
   play. Counting them is the cheapest honest proxy for stability there is. */
var NB = (function () {
  var t = [], i;
  for (i = 0; i < 64; i++) {
    var r = i >> 3, c = i & 7, l = [];
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      var rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) l.push(rr * 8 + cc);
    }
    t.push(l);
  }
  return t;
})();

AI.evaluate = function (st, greed) {
  var b = st.b, i, j;
  var pos = 0, disc = 0, frontier = 0, corners = 0;
  var empties = 0;
  for (i = 0; i < 64; i++) {
    var v = b[i];
    if (!v) { empties++; continue; }
    disc += v;
    pos += v * W[i];
    var open = false;
    for (j = 0; j < NB[i].length; j++) if (b[NB[i][j]] === 0) { open = true; break; }
    if (open) frontier += v;
  }
  for (i = 0; i < 4; i++) corners += b[Rules.CORNERS[i]];

  /* mobility, both sides — the single most predictive term in the whole
     function, and the most expensive. Counted rather than generated
     (Rules.mobility allocates nothing), because this runs at every node. */
  var m0 = Rules.mobility(b, 0), m1 = Rules.mobility(b, 1);
  var mob = (m0 + m1) ? 100 * (m0 - m1) / (m0 + m1) : 0;

  /* the ramp: discs are worth nothing early and everything at the end */
  var late = Math.max(0, Math.min(1, (24 - empties) / 24));
  var early = 1 - late;

  var s = pos * (0.9 * early + 0.25 * late)
        + corners * 42
        + mob * (7.5 * early + 1.5 * late)
        - frontier * (4.2 * early + 0.6 * late)
        + disc * (0.6 * early + 14 * late);

  /* the beginner's mistake, made deliberately and only by the beginner */
  if (greed) s += disc * 26 * greed;
  return s;
};

/* ---------- the search ---------- */
var WIN = 1e7;

function order(st, ms) {
  /* corners first, X-squares last: cheap, and it is most of what move
     ordering can do for you in a game with no captures to sort by */
  return ms.slice().sort(function (a, b) { return W[b.sq] - W[a.sq]; });
}

/* The terminal test is `passes >= 2` rather than a call to Rules.over(),
   because apply() already worked it out — over() would regenerate both
   sides' moves at every node to rediscover a fact we were handed. */
function search(st, depth, alpha, beta, greed, nodes, exact) {
  if (++nodes.n > nodes.cap) { nodes.stop = true; return AI.evaluate(st, greed); }
  if (st.passes >= 2) {
    var s = Rules.score(st);
    /* an exact solve scores by the final margin, so it prefers winning by
       more; the heuristic search only cares who won */
    return (s[0] - s[1]) * (exact ? 1000 : 1) + (s[0] > s[1] ? WIN : s[0] < s[1] ? -WIN : 0);
  }
  if (depth <= 0) return AI.evaluate(st, greed);
  var ms = order(st, Rules.moves(st));
  var maxing = st.turn === 0, best = maxing ? -Infinity : Infinity, i;
  for (i = 0; i < ms.length; i++) {
    var v = search(Rules.applyFast(st, ms[i]), depth - 1, alpha, beta, greed, nodes, exact);
    if (maxing) { if (v > best) best = v; if (best > alpha) alpha = best; }
    else { if (v < best) best = v; if (best < beta) beta = best; }
    if (beta <= alpha) break;
  }
  return best;
}

/* deterministic wobble, seeded by the position — a beginner who is
   consistently weak in the same way is a beginner you can learn to read */
function jitter(st, mv, amount) {
  if (!amount) return 0;
  var h = st.ply * 2654435761 + mv.sq * 40503 + mv.flips.length * 2246822519;
  h = (h ^ (h >>> 15)) >>> 0;
  return ((h % 2001) / 1000 - 1) * amount;
}

AI.choose = function (st, tierKey) {
  var tier = AI.tier(tierKey);
  var ms = Rules.moves(st);
  if (!ms.length) return null;
  var empties = Rules.empties(st);
  var exact = empties <= tier.solve;
  var ceiling = exact ? empties : tier.depth;
  if (ms.length === 1) return { mv: ms[0], score: 0, depth: 0, exact: exact, why: ["only-move"], nodes: 0 };

  var maxing = st.turn === 0, i;
  var kids = [], ordered = order(st, ms);
  for (i = 0; i < ordered.length; i++) kids.push({ mv: ordered[i], st: Rules.applyFast(st, ordered[i]), v: 0 });

  var best = kids[0].mv, bestV = 0, scored = null, reached = 0, spent = 0, solved = false;
  /* The exact solve is all-or-nothing: a partial one is a lie, not an
     approximation, so it gets the whole budget in a single pass and falls
     back to the heuristic ladder if even that is not enough. */
  var from = exact ? ceiling : 1;
  for (var d = from; d <= ceiling; d++) {
    var nodes = { n: 0, cap: exact ? tier.budget * 6 : tier.budget, stop: false };
    var bV = maxing ? -Infinity : Infinity, bM = null, round = [];
    for (i = 0; i < kids.length; i++) {
      var v = search(kids[i].st, d - 1, -Infinity, Infinity, tier.greed, nodes, exact);
      if (nodes.stop) break;
      if (!exact) v += jitter(st, kids[i].mv, tier.fuzz) * (maxing ? 1 : -1);
      kids[i].v = v;
      round.push({ mv: kids[i].mv, v: v });
      if (maxing ? v > bV : v < bV) { bV = v; bM = kids[i].mv; }
    }
    spent += nodes.n;
    if (nodes.stop || !bM) {
      /* the solve did not fit: drop to the heuristic search rather than
         reporting a half-solved position as solved */
      if (exact) { exact = false; ceiling = tier.depth; d = 0; continue; }
      break;
    }
    best = bM; bestV = bV; scored = round; reached = d; solved = exact;
    kids.sort(function (a, b) { return maxing ? b.v - a.v : a.v - b.v; });
  }
  return { mv: best, score: bestV, depth: reached, exact: solved, nodes: spent,
           why: reasons(st, best, scored || [{ mv: best, v: bestV }], maxing, solved) };
};

/* ---------- why ----------
   Tags recorded while deciding, never reconstructed afterwards. */
function reasons(st, mv, scored, maxing, exact) {
  var why = [], after = Rules.apply(st, mv), i;
  if (Rules.CORNERS.indexOf(mv.sq) >= 0) why.push("corner");
  if (Rules.XSQ[mv.sq] !== undefined && st.b[Rules.XSQ[mv.sq]] === 0) why.push("x-square");
  else if (Rules.CSQ[mv.sq] !== undefined && st.b[Rules.CSQ[mv.sq]] === 0) why.push("c-square");

  var theirs = Rules.movesFor(after, 1 - st.turn).length;
  var mine = Rules.movesFor(after, st.turn).length;
  if (theirs === 0) why.push("no-reply");
  else if (theirs <= 2) why.push("squeeze");
  if (mine > theirs + 2) why.push("mobility");

  /* did it hand a corner over? checked against the position rather than
     inferred, so the sentence can be verified from the board */
  var gives = false;
  var reply = Rules.movesFor(after, 1 - st.turn);
  for (i = 0; i < reply.length; i++) if (Rules.CORNERS.indexOf(reply[i].sq) >= 0) gives = true;
  if (gives) why.push("opens-corner");

  if (mv.flips.length <= 1) why.push("small");
  else if (mv.flips.length >= 8) why.push("big");
  if (exact) why.push("solved");

  var gap = Infinity, own = 0;
  for (i = 0; i < scored.length; i++) if (scored[i].mv === mv) own = scored[i].v;
  for (i = 0; i < scored.length; i++) {
    if (scored[i].mv === mv) continue;
    var d = maxing ? own - scored[i].v : scored[i].v - own;
    if (d < gap) gap = d;
  }
  if (gap < 8) why.push("close-call");
  else if (gap > 120) why.push("clear-best");
  if (!why.length) why.push("quiet");
  return why;
}

if (typeof module !== "undefined" && module.exports) module.exports = AI;
else root.AI = AI;
})(typeof self !== "undefined" ? self : this);
