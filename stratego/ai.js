/* ai.js — the other army.

   Stratego cannot be searched. Not "is expensive to search" — cannot. The
   position you would search is one of about 10²³ consistent arrangements of
   forty unseen ranks, and picking one and searching it is not a weak version
   of the right idea, it is a machine confidently solving a board that isn't
   there.

   What a good human does instead is keep a **belief** and act on its
   expectation, and that is what this does. Three parts.

   ## What the board has told you

   Every single thing this player knows is something a person sitting opposite
   would also know, and it comes from three sources:

     · **the dead.** Everything taken is face up in front of both players, so
       the remaining roster is exact arithmetic, not a guess.
     · **the fights.** Both pieces reveal when they strike, so a survivor's
       rank is known to both sides afterwards.
     · **movement.** And this is the big one: **a piece that has moved is not
       a Bomb and is not the Flag.** It is free, it is public, everybody
       watched it happen, and it is most of what separates somebody who has
       played ten games from somebody who has played one.

   Nothing here reads a rank it has not been shown. tools/rules-check.js
   proves the *interface* cannot leak; this file is where it would be tempting
   to cheat anyway, and it doesn't — `AI.choose` takes a view, not a state.

   ## The belief

   For each unknown enemy piece: the multiset of ranks they must still have,
   restricted to the ones consistent with what that square has done. A piece
   that has moved drops Bomb and Flag out of its own distribution; one that
   has sat still for thirty moves is *more* likely to be one of them, and that
   shows up on its own because everything else keeps moving.

   Uniform over what is consistent, rather than an exact conditional — the
   exact answer is a permanent over a bipartite graph and the difference does
   not change a single decision this player makes.

   ## The one thing it is careful about

   An attack reveals the attacker. A Marshal that takes a Scout has told the
   whole board where the Marshal is, and there is a Spy out there. So the cost
   of a strike includes what it gives away, which is why this player will
   sometimes decline a free capture — and that, more than any tactic, is what
   makes it feel like it is playing Stratego rather than draughts.        */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var AI = {};

/* Two players, not three, and that is a finding rather than a shortcut.

   They differ in what they *do*. Recruit is a separate function: it plays the
   way people play their first game — if something is next to you, hit it;
   otherwise walk forwards. It never wonders what the thing it is hitting
   might be, and it has never noticed that a piece which moved cannot be a
   bomb. Officer adds the whole apparatus below: the roster count, every fight
   it has seen, the movement inference, and the expected value of a strike
   against a belief. It takes 68% of games off Recruit.

   A third rung was written and thrown away. It probed with Scouts, came home
   to meet anything walking into its half, attacked with the cheapest piece
   that would do, and traded only when ahead — all four of which are real
   Stratego skills that real players will tell you about. Measured over sixty
   games each, they came to 47%, 49%, 45% and 53%: neutral or slightly
   harmful, every one.

   The honest reading is that a one-ply evaluator is already at the ceiling of
   what it can express in this game, and that beating Officer needs planning
   over several moves rather than a better opinion about one. So there is no
   Colonel. Shipping a third name that loses to the second would be exactly
   the decoration the rest of this repository spends its time avoiding, and
   tools/ai-check.js would have caught it anyway — which is what it is for. */
AI.TIERS = [
  { key: "recruit", name: "Recruit", naive: true, useMoved: false, careful: 0, fuzz: 6,
    blurb: "Hits whatever is next to it and walks forward. Has not noticed that a piece which moved cannot be a bomb." },
  { key: "officer", name: "Officer", naive: false, useMoved: true, careful: 0.4, fuzz: 3,
    blurb: "Counts what is left, remembers every fight, and works out what a strike is worth before making it." }
];
AI.tier = function (k) {
  for (var i = 0; i < AI.TIERS.length; i++) if (AI.TIERS[i].key === k) return AI.TIERS[i];
  return AI.TIERS[1];
};

/* roughly what each rank is worth, in "scouts". Not linear: the Marshal is
   not five Captains, it is the thing that makes your Captains safe. */
var WORTH = { 0: 1000, 1: 14, 2: 4, 3: 12, 4: 6, 5: 8, 6: 11, 7: 15, 8: 20, 9: 30, 10: 42, 11: 9 };
AI.WORTH = WORTH;

/* What winning is worth *inside an expectation*, and it is emphatically not
   infinity. That was the first version and it broke the whole player: any
   unknown piece that has never moved might be the Flag, at roughly one in
   thirty, and one-in-thirty of a million dwarfs every other term in the
   evaluation. Every strike on every unmoved square then scored the same
   enormous number, the player picked arbitrarily among them, and what came
   out was random play wearing a belief system — it drew with a bot that
   moved at random, which is exactly the symptom you would expect and exactly
   how it was found.

   Four hundred puts a three-percent chance of winning at about +12, against
   a twenty-percent chance of losing a Marshal at about −8. That is a real
   decision with two sides to it, which is what an evaluation is for. */
var WIN = 400;
AI.WIN = WIN;

/* ================================================================
   the belief
   ================================================================ */
/* what the enemy must still be holding, from the dead pile and the reveals */
AI.remaining = function (view, them) {
  var left = {}, i;
  var full = Rules.roster();
  for (i = 0; i < full.length; i++) left[full[i]] = (left[full[i]] || 0) + 1;
  var dead = view.dead[them] || [];
  for (i = 0; i < dead.length; i++) left[dead[i]]--;
  /* anything of theirs already showing is accounted for and not unknown */
  for (i = 0; i < 100; i++) {
    var c = view.cells[i];
    if (c && c.seat === them && c.rank >= 0) left[c.rank]--;
  }
  for (var k in left) if (left[k] <= 0) delete left[k];
  return left;
};

/* a distribution over the ranks one unknown square could be */
AI.guess = function (view, sq, left, tier) {
  var c = view.cells[sq];
  if (!c || c.rank >= 0) return null;
  var pool = {}, total = 0, k;
  for (k in left) {
    var rank = k | 0;
    /* the inference this whole game turns on */
    if (tier.useMoved && c.moved && !Rules.mobile(rank)) continue;
    pool[rank] = left[k];
    total += left[k];
  }
  if (!total) return null;
  var out = {};
  for (k in pool) out[k] = pool[k] / total;
  return out;
};

/* what attacking that square is worth, in expectation */
AI.strikeValue = function (view, from, to, left, tier) {
  var me = view.cells[from], you = view.cells[to];
  if (!me || !you) return 0;
  if (you.rank >= 0) {
    /* known: pure arithmetic */
    var r = Rules.fight(me.rank, you.rank);
    if (r === "flag") return 1e6;        /* certain: nothing else matters */
    if (r === "def") return WORTH[you.rank];
    if (r === "att") return -WORTH[me.rank];
    return WORTH[you.rank] - WORTH[me.rank];
  }
  var dist = AI.guess(view, to, left, tier);
  if (!dist) return 0;
  var v = 0;
  for (var k in dist) {
    var rank = k | 0, p = dist[k];
    var res = Rules.fight(me.rank, rank);
    if (res === "flag") v += p * WIN;
    else if (res === "def") v += p * WORTH[rank];
    else if (res === "att") v += p * -WORTH[me.rank];
    else v += p * (WORTH[rank] - WORTH[me.rank]);
  }
  return v;
};

/* ================================================================
   the deployment
   ================================================================
   Not random. A random forty is a giveaway in two ways at once: the Flag ends
   up in the open where a Scout finds it in four moves, and the Bombs end up
   scattered where they protect nothing.

   So it is built by role, back to front, and then jittered:

     · the Flag goes on the back row, off centre
     · three or four Bombs go around it — three, not four, because a square
       ringed on every side by non-moving pieces is a sign that says FLAG
     · the rest of the Bombs go where a Miner has to walk past something to
       reach them
     · Scouts go forward, because their job is to find things and they are
       cheap to lose
     · the Marshal and the General never start on the front row
     · the Spy starts near the Marshal, which is where it is useful           */
AI.deploy = function (seat, rnd, tier) {
  rnd = rnd || Math.random;
  var rows = Rules.homeRows(seat);
  /* rows[0] is the row nearest the enemy for seat 1, and furthest for seat 0;
     work in "depth from home", so the same code lays out both sides */
  var deep = seat === 0 ? [3, 2, 1, 0] : [0, 1, 2, 3];   /* index into rows, back first */
  var grid = [];                                          /* depth → 10 ranks */
  for (var d = 0; d < 4; d++) grid.push(new Array(10).fill(null));

  function put(depth, col, rank) {
    if (grid[depth][col] === null) { grid[depth][col] = rank; return true; }
    return false;
  }
  function putNear(depth, col, rank) {
    for (var spread = 0; spread < 10; spread++) {
      for (var s = -1; s <= 1; s += 2) {
        var c = col + spread * s;
        if (c >= 0 && c < 10 && put(depth, c, rank)) return c;
      }
      if (spread === 0 && put(depth, col, rank)) return col;
    }
    return -1;
  }
  function putAnywhere(depths, rank) {
    for (var tries = 0; tries < 200; tries++) {
      var d2 = depths[(rnd() * depths.length) | 0];
      var c = (rnd() * 10) | 0;
      if (put(d2, c, rank)) return;
    }
    for (var dd = 0; dd < 4; dd++) for (var cc = 0; cc < 10; cc++) if (put(dd, cc, rank)) return;
  }

  /* the flag, off centre on the back row */
  var flagCol = [0, 1, 8, 9, 2, 7][(rnd() * 6) | 0];
  put(0, flagCol, Rules.FLAG);

  /* three bombs around it — three rather than four, because a fully ringed
     square is a signpost */
  var guard = 0;
  if (flagCol > 0) { put(0, flagCol - 1, Rules.BOMB); guard++; }
  if (flagCol < 9) { put(0, flagCol + 1, Rules.BOMB); guard++; }
  put(1, flagCol, Rules.BOMB); guard++;
  var bombs = 6 - guard;

  /* the rest of the bombs: mostly at depth 1–2, one of them forward as a
     trap, because a bomb nobody ever walks into has done nothing */
  for (var b = 0; b < bombs; b++) {
    putAnywhere(b === 0 ? [2, 3] : [1, 2], Rules.BOMB);
  }

  /* the Marshal and General: never on the front row, and apart from each
     other, so one lost fight does not cost both */
  var marCol = (rnd() * 10) | 0;
  putNear(1 + ((rnd() * 2) | 0), marCol, Rules.MARSHAL);
  putNear(1 + ((rnd() * 2) | 0), (marCol + 5) % 10, 9);
  /* the Spy near the Marshal — its job is to be there when the Marshal is
     attacked, and it cannot do that from the other side of the board */
  putNear(1, Math.max(0, Math.min(9, marCol + (rnd() < 0.5 ? -1 : 1))), Rules.SPY);

  /* scouts forward: cheap eyes */
  for (var s2 = 0; s2 < 8; s2++) putAnywhere(s2 < 5 ? [3] : [2], Rules.SCOUT);
  /* miners back: you need them at the end, for the bombs round their flag */
  for (var m = 0; m < 5; m++) putAnywhere(m < 3 ? [1, 2] : [2, 3], Rules.MINER);
  /* and everybody else wherever there is room */
  var rest = [8, 7, 7, 7, 6, 6, 6, 6, 5, 5, 5, 5, 4, 4, 4, 4, 8];
  for (var i = 0; i < rest.length; i++) putAnywhere([1, 2, 3], rest[i]);

  /* fill any hole with whatever the roster still owes */
  var placed = {}, need = Rules.roster();
  for (var d3 = 0; d3 < 4; d3++) for (var c3 = 0; c3 < 10; c3++) {
    var v = grid[d3][c3];
    if (v !== null) placed[v] = (placed[v] || 0) + 1;
  }
  var owed = [];
  var want = {};
  for (i = 0; i < need.length; i++) want[need[i]] = (want[need[i]] || 0) + 1;
  for (var k2 in want) {
    var short = want[k2] - (placed[k2] || 0);
    for (i = 0; i < short; i++) owed.push(k2 | 0);
  }
  /* and drop anything we over-placed */
  for (d3 = 0; d3 < 4; d3++) for (c3 = 0; c3 < 10; c3++) {
    var vv = grid[d3][c3];
    if (vv === null) continue;
    if ((placed[vv] || 0) > want[vv]) { placed[vv]--; grid[d3][c3] = null; }
  }
  for (d3 = 0; d3 < 4 && owed.length; d3++) {
    for (c3 = 0; c3 < 10 && owed.length; c3++) {
      if (grid[d3][c3] === null) grid[d3][c3] = owed.pop();
    }
  }

  /* flatten into home-square order */
  var out = new Array(40);
  for (d3 = 0; d3 < 4; d3++) {
    var rowIndex = deep[d3];
    for (c3 = 0; c3 < 10; c3++) out[rowIndex * 10 + c3] = grid[d3][c3];
  }
  return out;
};

/* ================================================================
   choosing a move
   ================================================================
   Takes a **view**, not a state: this player literally cannot see what it is
   not entitled to see, which is a stronger guarantee than promising not to
   look. */
AI.choose = function (view, tierKey, rnd) {
  var tier = AI.tier(tierKey);
  rnd = rnd || Math.random;
  var moves = view.legal || [];
  if (!moves.length) return null;
  if (moves.length === 1) return { mv: moves[0], why: ["forced"] };

  var me = view.seat, them = 1 - me;
  var left = AI.remaining(view, them);
  var theirMobile = countMobile(view, them, tier);
  var scored = [], i;

  for (i = 0; i < moves.length; i++) {
    var mv = moves[i];
    scored.push({ mv: mv, v: value(view, mv, left, tier, theirMobile) + jitter(view, mv, tier.fuzz) });
  }
  scored.sort(function (a, b) { return b.v - a.v; });
  return { mv: scored[0].mv, score: scored[0].v,
           why: reasons(view, scored[0].mv, scored, left, tier, theirMobile) };
};

function countMobile(view, seat, tier) {
  var n = 0;
  for (var i = 0; i < 100; i++) {
    var c = view.cells[i];
    if (!c || c.seat !== seat) continue;
    if (c.rank >= 0) { if (Rules.mobile(c.rank)) n++; }
    else if (!tier.useMoved || c.moved) n++;      /* moved ⇒ certainly mobile */
    else n += 0.6;                                 /* unknown and still: maybe */
  }
  return n;
}

function value(view, mv, left, tier, theirMobile) {
  var me = view.cells[mv.f];
  if (!me) return -1e9;
  var v = 0;
  var them = 1 - view.seat;
  var forward = view.seat === 0 ? -1 : 1;

  /* The recruit, playing its first game. Not a worse expert — a different
     reader of the board: a thing next to you is a thing to hit, and the way
     to win is to get to the other end. Both are what everybody believes
     before they lose an army finding out. */
  if (tier.naive) {
    if (mv.strike) {
      var d0 = view.cells[mv.t];
      return 60 + (d0 && d0.rank >= 0 ? WORTH[d0.rank] : 6);
    }
    var dr0 = ((mv.t / 10) | 0) - ((mv.f / 10) | 0);
    return dr0 * forward * 3 + (4.5 - Math.abs((mv.t % 10) - 4.5)) * 0.2;
  }

  /* How impatient we are. Caution is right in Stratego and it is right
     *early*; two armies that stay cautious forever produce a board where
     nothing profitable can move and the quiet rule draws a game neither of
     them lost. So caution decays and the pull forward grows, which is what a
     person does too — you probe for twenty moves and then you commit. */
  var push = Math.min(1, (view.ply || 0) / 90);
  var care = tier.careful * (1 - push * 0.75);
  /* The draw clock, which is public — both players can count the moves since
     anything was taken. As it runs down, a gamble is worth more than a draw,
     because a draw is worth nothing to either of you. Without this term two
     careful armies simply shuffle: attacking an unknown has negative expected
     value on average, so a purely rational player never strikes first, and
     two of them never strike at all. Real players commit for exactly this
     reason — the clock, not the arithmetic. */
  var urgency = Math.min(1, (view.quiet || 0) / ((view.quietMax || 120) * 0.6));

  if (mv.strike) {
    var gain = AI.strikeValue(view, mv.f, mv.t, left, tier);
    v += gain * 3;
    /* What the strike gives away. A Marshal that takes a Scout has announced
       itself to a board with a Spy on it — but this must never grow larger
       than the capture is worth, or the player simply refuses to take
       anything and hands the game to whoever is willing to. It is a discount
       on a good move, not a veto. */
    if (!me.shown && gain > 0) v -= Math.min(care * WORTH[me.rank] * 0.3, gain * 1.2);
    /* and the clock: take something, almost anything, rather than draw */
    v += urgency * 14;
  } else {
    /* getting on with it: forward is where their flag is */
    var dr = ((mv.t / 10) | 0) - ((mv.f / 10) | 0);
    v += dr * forward * (2.2 + push * 3.5);
    /* the middle files are where the game is fought */
    var col = mv.t % 10;
    v += (4.5 - Math.abs(col - 4.5)) * 0.25;
    /* moving a piece tells them it is not a bomb, which matters more the
       more it is worth */
    if (!me.moved && !me.shown) v -= care * WORTH[me.rank] * 0.05;
    /* and walking your Marshal about is how you lose it to a Spy */
    if (me.rank >= 9) v -= care * 3;
    if (me.rank === Rules.SPY) v -= care * 4;
  }

  /* Is the square we are moving to attacked by something we know beats us?
     Weighted well under the piece's own worth: a term that costs a Marshal
     more than a Marshal is worth means the Marshal never leaves home, and a
     Marshal that never leaves home is a Marshal you did not have. */
  v -= threat(view, mv.t, me.rank, left, tier) * (0.35 + tier.careful * 0.25);

  /* the endgame: once their army has stopped being able to move, the game is
     a flag hunt, and a Miner is the tool */
  if (theirMobile <= 10) {
    var still = stillSquares(view, them, tier);
    if (still.length) {
      var best = 1e9;
      for (var k = 0; k < still.length; k++) {
        var d = dist(mv.t, still[k]);
        if (d < best) best = d;
      }
      var was = 1e9;
      for (k = 0; k < still.length; k++) {
        var d2 = dist(mv.f, still[k]);
        if (d2 < was) was = d2;
      }
      if (best < was) v += me.rank === Rules.MINER ? 7 : 2.5;
    }
  }
  return v;
}

/* what could hit this square next move, that we know or believe beats us */
function threat(view, sq, myRank, left, tier) {
  var them = 1 - view.seat, worst = 0;
  var steps = [-10, 10, -1, 1];
  for (var d = 0; d < 4; d++) {
    var q = sq + steps[d];
    if (q < 0 || q > 99) continue;
    if ((steps[d] === -1 || steps[d] === 1) && ((q / 10) | 0) !== ((sq / 10) | 0)) continue;
    var c = view.cells[q];
    if (!c || c.seat !== them) continue;
    if (c.rank >= 0) {
      if (Rules.fight(c.rank, myRank) === "def") worst = Math.max(worst, WORTH[myRank] * 0.8);
      continue;
    }
    var dist2 = AI.guess(view, q, left, tier);
    if (!dist2) continue;
    var p = 0;
    for (var k in dist2) if (Rules.fight(k | 0, myRank) === "def") p += dist2[k];
    worst = Math.max(worst, p * WORTH[myRank] * 0.8);
  }
  return worst;
}
/* enemy pieces that have never moved — the flag is under one of these */
function stillSquares(view, them, tier) {
  var out = [];
  for (var i = 0; i < 100; i++) {
    var c = view.cells[i];
    if (c && c.seat === them && !c.moved && c.rank < 0) out.push(i);
  }
  return out;
}
function dist(a, b) {
  return Math.abs(((a / 10) | 0) - ((b / 10) | 0)) + Math.abs((a % 10) - (b % 10));
}

function jitter(view, mv, amount) {
  if (!amount) return 0;
  var h = view.ply * 2654435761 + mv.f * 40503 + mv.t * 2246822519;
  h = (h ^ (h >>> 15)) >>> 0;
  return ((h % 2001) / 1000 - 1) * amount;
}

/* ---------- why ----------
   Tags recorded while deciding, never reconstructed — and none of them can
   say anything about a rank this player has not been shown. */
function reasons(view, mv, scored, left, tier, theirMobile) {
  var why = [], me = view.cells[mv.f], you = view.cells[mv.t];
  if (tier.naive) return [mv.strike ? "charge" : "advance"];
  if (mv.strike) {
    if (you && you.rank >= 0) {
      why.push(Rules.fight(me.rank, you.rank) === "def" ? "known-win" : "known-trade");
    } else {
      var d = AI.guess(view, mv.t, left, tier);
      var p = 0;
      if (d) for (var k in d) if (Rules.fight(me.rank, k | 0) === "def") p += d[k];
      why.push(p > 0.7 ? "likely-win" : p > 0.4 ? "even-odds" : "long-shot");
    }
    if (!me.shown && me.rank >= 8) why.push("reveals-me");
    if (you && !you.moved) why.push("never-moved");
  } else {
    if (me.rank === Rules.SCOUT) why.push("scout-run");
    var dr = ((mv.t / 10) | 0) - ((mv.f / 10) | 0);
    if (dr * (view.seat === 0 ? -1 : 1) > 0) why.push("advance");
    else why.push("reposition");
    if (!me.moved) why.push("first-move");
  }
  if (theirMobile <= 6) why.push("flag-hunt");
  if (scored.length > 1 && scored[0].v - scored[1].v < 1.5) why.push("close-call");
  return why;
}

if (typeof module !== "undefined" && module.exports) module.exports = AI;
else root.AI = AI;
})(typeof self !== "undefined" ? self : this);
