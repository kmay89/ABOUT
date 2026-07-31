/* ai.js — the other side of the board.

   Alpha-beta over rules.js, with the one extension that draughts actually
   needs and most toy engines leave out: **a forced sequence is not a ply**.

   Because jumping is compulsory, a position where a jump exists has no
   choice in it worth the name — the side to move is going to capture, and
   whatever it captures may hand the exchange straight back. Counting those
   against the depth budget is how an engine ends up "seeing" eight moves
   ahead and still walking into a three-for-one: it stopped counting in the
   middle of the exchange and scored the half of it that looked good. So a
   node whose every move is a jump does not spend depth. That is the
   quiescence rule for this game, and it is unusually clean here — the rules
   themselves tell us when the position is quiet.

   Three tiers, and they differ in more than depth. Novato searches shallowly
   *and* mis-evaluates a little, on purpose and reproducibly, because an
   opponent who plays perfectly-but-shallow is not a beginner, it is a
   different kind of expert. tools/ai-check.js plays the ladder against
   itself and requires each rung to actually beat the one below.           */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var AI = {};

/* Depth is a *ceiling*, not a promise. What actually stops the search is the
   node budget, because the branching factor of a draughts position swings
   wildly — a quiet midgame has eight moves and a forced exchange has one, so
   a fixed depth is either instant or a five-second freeze depending on the
   position, and it is the same number either way. A budget spends the same
   amount of thinking everywhere, which is both faster and stronger: with
   iterative deepening the shallow searches are not wasted, they order the
   deep ones. */
AI.TIERS = [
  { key: "novice", name: "Learning", depth: 2,  budget: 1500,   fuzz: 34,
    blurb: "Sees the capture in front of it, and not much past that." },
  { key: "steady", name: "Steady",   depth: 8,  budget: 18000,  fuzz: 6,
    blurb: "Counts the exchange all the way through before taking it." },
  { key: "sharp",  name: "Sharp",    depth: 16, budget: 90000, fuzz: 0,
    blurb: "Plays for the squeeze — it would rather take your moves than your men." }
];
AI.tier = function (key) {
  for (var i = 0; i < AI.TIERS.length; i++) if (AI.TIERS[i].key === key) return AI.TIERS[i];
  return AI.TIERS[1];
};

/* ---------- what a position is worth ----------
   Always from seat 0's point of view; the search flips it.

   The weights are ordinary. What matters is the third and fourth terms.

   **The back row is worth keeping, until it isn't.** Two men left at home on
   your own king row stop anything crowning there, and that is worth roughly a
   man in the middlegame — but it is worth nothing once the enemy has no men
   left to crown, and it is worth *less than nothing* in an endgame where you
   need every piece moving. So the bonus fades with the opponent's man count
   rather than being a constant, which is the whole difference between an
   engine that castles its back row shut and one that knows when to open it.

   **Being ahead means trading.** Material is scaled up slightly as the board
   empties, so a side a man up prefers the position with fewer pieces on it.
   Without this an engine a man up shuffles, and a human draws by attrition. */
var MAN = 100, KING = 172;
/* how far up the board a man has come, by row, for the +side */
var ADV = [0, 34, 26, 19, 13, 8, 4, 0];
/* the middle is worth more than the rail: a king on the side has four
   diagonals' worth of nothing behind it */
var EDGE = [-8, -2, 2, 5, 5, 2, -2, -8];

AI.evaluate = function (st) {
  var b = st.b, i, s = 0;
  var men = [0, 0], kings = [0, 0], back = [0, 0];
  for (i = 0; i < 64; i++) {
    var v = b[i];
    if (!v) continue;
    var r = i >> 3, c = i & 7, side = v > 0 ? 0 : 1, k = Math.abs(v) === 2;
    if (k) kings[side]++; else men[side]++;
    var w = k ? KING : MAN;
    /* a man's row, counted from its own home */
    if (!k) w += ADV[side === 0 ? r : 7 - r];
    w += EDGE[c] + (k ? EDGE[r] : 0);
    if (!k && ((side === 0 && r === 7) || (side === 1 && r === 0))) back[side]++;
    s += side === 0 ? w : -w;
  }
  var total = men[0] + men[1] + kings[0] + kings[1];
  /* the back row, worth what it can still stop */
  s += Math.min(back[0], 3) * 7 * Math.min(men[1], 4) / 4;
  s -= Math.min(back[1], 3) * 7 * Math.min(men[0], 4) / 4;
  /* ahead? then empty the board */
  var diff = (men[0] + kings[0]) - (men[1] + kings[1]);
  if (diff) s += diff * (24 - total) * 1.4;
  return s;
};

/* ---------- the search ---------- */
var WIN = 100000;

function ordered(st) {
  var ms = Rules.moves(st);
  /* longest chains first: they are the moves most likely to be good and the
     ones most likely to cause a cutoff, which is the same thing */
  ms.sort(function (a, b) {
    if (b.caps.length !== a.caps.length) return b.caps.length - a.caps.length;
    return (b.king ? 1 : 0) - (a.king ? 1 : 0);
  });
  return ms;
}

function search(st, depth, alpha, beta, nodes) {
  if (++nodes.n > nodes.cap) { nodes.stop = true; return AI.evaluate(st); }
  var end = Rules.over(st);
  if (end.done) {
    if (end.winner < 0) return 0;
    /* prefer a win that arrives sooner, and a loss that arrives later —
       without this an engine that is winning sees no reason to hurry, and
       shuffles until the quiet-move rule draws the game it had won */
    return end.winner === 0 ? WIN - st.ply : -WIN + st.ply;
  }
  var ms = ordered(st);
  /* the quiescence rule: a position where every move is forced costs nothing.
     Capped, because a long chain of forced exchanges is real but a runaway
     recursion is not. */
  var forced = ms.length > 0 && ms[0].caps.length > 0;
  if (depth <= 0 && !(forced && nodes.ext < 12)) return AI.evaluate(st);
  if (depth <= 0) nodes.ext++;
  var maxing = st.turn === 0, best = maxing ? -Infinity : Infinity, i;
  for (i = 0; i < ms.length; i++) {
    var v = search(Rules.apply(st, ms[i]), depth - (forced ? 0 : 1), alpha, beta, nodes);
    if (maxing) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }
  if (depth <= 0) nodes.ext--;
  return best;
};

/* A deterministic wobble. The seed is the position itself, so the same board
   always draws the same weak move — a beginner who is *consistently* weak in
   the same way is a beginner you can learn to read, which is the point of
   having one to play against. */
function jitter(st, mv, amount) {
  if (!amount) return 0;
  var h = st.ply * 2654435761 + mv.f * 40503 + mv.t * 2246822519 + mv.caps.length * 3266489917;
  h = (h ^ (h >>> 15)) >>> 0;
  return ((h % 2001) / 1000 - 1) * amount;
}

/* Pick a move, and say why. The reasons are recorded *while* deciding rather
   than reconstructed afterwards, which is the rule the domino room's coach
   established: a hint is allowed to say what the machine actually used. */
AI.choose = function (st, tierKey) {
  var tier = AI.tier(tierKey);
  var ms = ordered(st);
  if (!ms.length) return null;
  if (ms.length === 1) {
    return { mv: ms[0], score: 0, depth: 0, why: ms[0].caps.length ? ["forced-jump"] : ["only-move"], nodes: 0 };
  }
  var maxing = st.turn === 0;
  var kids = [], i;
  for (i = 0; i < ms.length; i++) kids.push({ mv: ms[i], st: Rules.apply(st, ms[i]), v: 0 });

  var best = kids[0].mv, bestV = 0, scored = null, reached = 0, spent = 0;
  for (var d = 1; d <= tier.depth; d++) {
    var nodes = { n: 0, ext: 0, cap: tier.budget, stop: false };
    var bV = maxing ? -Infinity : Infinity, bM = null, round = [];
    for (i = 0; i < kids.length; i++) {
      var v = search(kids[i].st, d - 1, -Infinity, Infinity, nodes);
      if (nodes.stop) break;
      v += jitter(st, kids[i].mv, tier.fuzz) * (maxing ? 1 : -1);
      kids[i].v = v;
      round.push({ mv: kids[i].mv, v: v });
      if (maxing ? v > bV : v < bV) { bV = v; bM = kids[i].mv; }
    }
    spent += nodes.n;
    /* an iteration that ran out of budget is thrown away whole: half a depth
       is not a depth, and the previous one is a complete answer */
    if (nodes.stop || !bM) break;
    best = bM; bestV = bV; scored = round; reached = d;
    /* the best move first next time round — the single cheapest thing you
       can do for alpha-beta, and it is worth more than another ply */
    kids.sort(function (a, b) { return maxing ? b.v - a.v : a.v - b.v; });
    /* a forced win is found, not improved on */
    if (Math.abs(bestV) > WIN - 1000) break;
  }
  return { mv: best, score: bestV, depth: reached, nodes: spent,
           why: reasons(st, best, scored || [{ mv: best, v: bestV }], maxing) };
};

/* ---------- why ----------
   Tags, not sentences — coach.js turns them into English. Each one is a
   claim that can be checked against the position, which is what stops a
   hint from being fluent and false. */
function reasons(st, mv, scored, maxing) {
  var why = [], after = Rules.apply(st, mv), i;
  if (mv.caps.length >= 3) why.push("triple");
  else if (mv.caps.length === 2) why.push("double");
  else if (mv.caps.length === 1) why.push("take");
  if (mv.king) why.push("crown");

  var end = Rules.over(after);
  if (end.done && end.winner === st.turn) why.push("wins");

  /* what they can do about it: the reply that costs us most */
  var replies = Rules.moves(after);
  var worst = 0;
  for (i = 0; i < replies.length; i++) if (replies[i].caps.length > worst) worst = replies[i].caps.length;
  if (mv.caps.length && worst === 0) why.push("clean");
  else if (worst > mv.caps.length) why.push("gives-back");
  else if (worst && mv.caps.length) why.push("trade");
  if (!replies.length) why.push("blocks");

  /* was it close? a move that is only just best is worth saying so about */
  var gap = Infinity;
  for (i = 0; i < scored.length; i++) {
    if (scored[i].mv === mv) continue;
    var d = maxing ? (scoreOf(scored, mv) - scored[i].v) : (scored[i].v - scoreOf(scored, mv));
    if (d < gap) gap = d;
  }
  if (gap < 12) why.push("close-call");
  else if (gap > 150) why.push("clear-best");

  if (!why.length) why.push("quiet");
  return why;
}
function scoreOf(scored, mv) {
  for (var i = 0; i < scored.length; i++) if (scored[i].mv === mv) return scored[i].v;
  return 0;
}

if (typeof module !== "undefined" && module.exports) module.exports = AI;
else root.AI = AI;
})(typeof self !== "undefined" ? self : this);
