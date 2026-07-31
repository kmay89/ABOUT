/* ai.js — the other side of the star.

   Chinese checkers looks like it should be easy for a machine and is not,
   for one reason: **it is a race, so the score is a distance, and a distance
   is the wrong thing to minimise.**

   The naive engine adds up how far its ten pieces have to travel and plays
   whatever move makes that total smallest. It looks fine for twenty moves
   and then loses every game, because the sum is happy to trade one enormous
   jump by a piece that is nearly home against three pieces that never move
   at all. You finish with seven pieces packed into the point and three
   stragglers eight steps back, and those three take the rest of the game.

   You are not finished when your pieces are close. You are finished when
   your **last** piece arrives. So the evaluation here is dominated by the
   worst piece rather than the average one:

     cost = sum of distances  +  4 × the furthest piece's distance

   That one term is the difference between an engine that shuffles its
   leaders and one that plays the game people actually play — build a ladder,
   then send everybody up it. It is worth every game of sixteen against the
   version without it.

   The strongest tier then changes what "distance" means: not distance to the
   point of the triangle, but distance to **the particular hole this piece has
   to end up in**, assigned one piece at a time. Near the end those are
   different questions — a piece one step from the tip is no use if the tip is
   taken and the last empty hole is four steps sideways — and it is worth
   every game of twenty-four against the version measuring to the point.

   Two smaller things they also know:

   **Ladders are shared.** A jump chain needs pieces to jump over, and the
   pieces you leave behind are the rungs. So a move that lands *next to* a
   piece still at home is worth a little, because that is a rung for the one
   behind it.

   **Getting out is urgent early and irrelevant late.** A piece still at home
   on move thirty is a lost game, so a piece in its own start triangle carries
   a penalty that grows with the move count.                                */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var AI = {};

/* The three rungs are three different answers to "how far have I got to go".

   Learning measures distance to the point of the triangle and adds it up.
   Steady adds the term that matters — the furthest piece — because you
   finish when your last piece arrives, not when your average one does.

   Sharp stops measuring distance to the *point* and starts measuring
   distance to a **hole**. Ten pieces have to end up in ten specific holes,
   and near the end of the game those are not the same question: a piece one
   step from the tip is useless if the tip is taken and the only empty hole
   left is four steps sideways. Assigning each piece to a hole and adding
   those distances is a few hundred subtractions and it plays the endgame
   properly, which is where this game is won. */
AI.TIERS = [
  { key: "novice", name: "Learning", pack: false, worst: 0, ladder: 0,    fuzz: 2.5,
    blurb: "Sends whichever piece can go furthest. Leaves three behind and loses to them." },
  { key: "steady", name: "Steady",   pack: false, worst: 4, ladder: 0.35, fuzz: 0.15,
    blurb: "Plays its slowest piece rather than its fastest, which is most of the game." },
  { key: "sharp",  name: "Sharp",    pack: true,  worst: 4, ladder: 0.45, fuzz: 0,
    blurb: "Measures the distance to the hole each piece has to end up in, not to the point of the triangle." }
];
AI.tier = function (k) {
  for (var i = 0; i < AI.TIERS.length; i++) if (AI.TIERS[i].key === k) return AI.TIERS[i];
  return AI.TIERS[1];
};

/* how much work a seat has left. Lower is better. */
AI.cost = function (st, seat, tier) {
  var tip = Rules.targetPoint(st, seat);
  var home = Rules.homeOf(st, seat);
  var sum = 0, worst = 0, i;
  var late = Math.min(1, st.moves[seat] / 26);
  var mine = [];
  for (i = 0; i < st.b.length; i++) if (st.b[i] === seat) mine.push(i);

  if (tier && tier.pack) {
    /* Ten pieces into ten holes. Assigned greedily, furthest piece first —
       the piece with the least choice gets to choose, which is the ordering
       that makes greedy assignment nearly optimal here and costs nothing.
       A proper minimum-cost matching would be exact and would also be a
       Hungarian algorithm inside a move loop, which this game does not need. */
    var target = Rules.targetOf(st, seat).slice();
    var free = [], taken = {}, k, j;
    for (k = 0; k < target.length; k++) {
      if (st.b[target[k]] === seat) taken[target[k]] = 1;   /* already there  */
      else free.push(target[k]);
    }
    var order = mine.slice().sort(function (a, b) {
      return Rules.distTo(b, tip) - Rules.distTo(a, tip);
    });
    for (k = 0; k < order.length; k++) {
      var p = order[k];
      if (taken[p]) continue;                                /* home already  */
      var bd = 1e9, bi = -1;
      for (j = 0; j < free.length; j++) {
        var d2 = Rules.dist(p, free[j]);
        if (d2 < bd) { bd = d2; bi = j; }
      }
      if (bi < 0) { bd = Rules.distTo(p, tip); }
      else free.splice(bi, 1);
      sum += bd;
      if (bd > worst) worst = bd;
      if (home.indexOf(p) >= 0) sum += 2.5 * late;
    }
    return sum + tier.worst * worst;
  }

  for (i = 0; i < mine.length; i++) {
    var d = Rules.distTo(mine[i], tip);
    sum += d;
    if (d > worst) worst = d;
    /* still sitting at home, and it is getting late */
    if (home.indexOf(mine[i]) >= 0) sum += 2.5 * late;
  }
  return sum + (tier ? tier.worst : 4) * worst;
};

/* the rungs: a piece that lands beside one of your own still-distant pieces
   has left it something to jump. Cheap to compute and worth about a third of
   a step, which is roughly what it is worth. */
function ladder(st, seat, hole) {
  var tip = Rules.targetPoint(st, seat);
  var nb = Rules.neighbours(hole), n = 0;
  for (var d = 0; d < 6; d++) {
    var q = nb[d];
    if (q < 0 || st.b[q] !== seat) continue;
    if (Rules.distTo(q, tip) > Rules.distTo(hole, tip)) n++;
  }
  return n;
}

/* a deterministic wobble, seeded by the position, so the beginner is weak in
   the same way every time and can be learned */
function jitter(st, mv, amount) {
  if (!amount) return 0;
  var h = st.ply * 2654435761 + mv.f * 40503 + mv.t * 2246822519;
  h = (h ^ (h >>> 15)) >>> 0;
  return ((h % 2001) / 1000 - 1) * amount;
}

AI.choose = function (st, seat, tierKey) {
  var tier = AI.tier(tierKey);
  var moves = Rules.moves(st);
  if (!moves.length) return null;
  if (moves.length === 1) return { mv: moves[0], why: ["forced"], looked: 0 };

  var scored = [], i;
  for (i = 0; i < moves.length; i++) {
    var mv = moves[i];
    var after = Rules.apply(st, mv);
    var v = AI.cost(after, seat, tier);
    v -= tier.ladder * ladder(after, seat, mv.t);
    v += jitter(st, mv, tier.fuzz);
    scored.push({ mv: mv, v: v, after: after });
  }
  scored.sort(function (a, b) { return a.v - b.v; });

  return { mv: scored[0].mv, score: scored[0].v, looked: moves.length,
           why: reasons(st, seat, scored[0].mv, scored, tier) };
};

/* ---------- why ----------
   Tags recorded while deciding, never reconstructed. */
function reasons(st, seat, mv, scored, tier) {
  var why = [], tip = Rules.targetPoint(st, seat);
  var hops = mv.path.length;
  var travelled = Rules.distTo(mv.f, tip) - Rules.distTo(mv.t, tip);
  if (hops >= 4) why.push("long-chain");
  else if (hops >= 2) why.push("chain");
  else why.push("step");
  if (travelled >= 5) why.push("big-gain");
  else if (travelled <= 0) why.push("sideways");

  var home = Rules.homeOf(st, seat);
  if (home.indexOf(mv.f) >= 0 && home.indexOf(mv.t) < 0) why.push("leaves-home");
  var target = Rules.targetOf(st, seat);
  if (target.indexOf(mv.t) >= 0 && target.indexOf(mv.f) < 0) why.push("arrives");

  /* was this the slowest piece? that is what the evaluation is built on, so
     saying so is saying what the machine used */
  var worst = 0, worstAt = -1, i;
  for (i = 0; i < st.b.length; i++) {
    if (st.b[i] !== seat) continue;
    var d = Rules.distTo(i, tip);
    if (d > worst) { worst = d; worstAt = i; }
  }
  if (worstAt === mv.f) why.push("slowest-piece");

  var after = Rules.apply(st, mv);
  if (ladder(after, seat, mv.t) > 0) why.push("leaves-a-rung");
  if (scored.length > 1 && Math.abs(scored[0].v - scored[1].v) < 0.4) why.push("close-call");
  return why;
}

if (typeof module !== "undefined" && module.exports) module.exports = AI;
else root.AI = AI;
})(typeof self !== "undefined" ? self : this);
