/* ai-check.js — dev-only, and the slow one.

   A strength ladder is the only honest test of a game AI. Anything else —
   node counts, evaluation unit tests, "it looks like it plays well" — measures
   the machinery rather than the play. So each room's three opponents are set
   against each other and each rung is required to actually beat the one below.

   The important part is what the rungs *differ in*. Making a beginner by
   adding noise to an expert is the standard shortcut and it produces an
   opponent nobody recognises: it still ducks, still counts the queen, still
   plays its slowest piece, and merely mistimes them. So in every room here the
   weak player is a **different function**, not a worse one, and this file is
   what stops that claim from being decoration:

     checkers   depth, under a node budget
     othello    depth and an exact endgame solve — plus a beginner that
                greedily takes the biggest flip, which is exactly how not to
                play, on purpose
     the star   what "distance" means: to the point, to the point weighted by
                the slowest piece, or to the particular hole each marble has
                to end up in
     hearts     a beginner that takes tricks because tricks look good, against
                one that ducks; and rollouts on top of that
     euchre     a beginner that calls on any jack, a partner-aware policy on
                top of that, and then a top tier that stops scoring cards and
                deals out the three hands it cannot see — consistent with
                every suit somebody has failed to follow — and plays the whole
                thing to the end before choosing
     la viuda   what "a good hand" means: the best poker hand, or the one
                least likely to be the worst at this particular table
     the sheet  how far ahead the expectation is taken, and whether a box is
                priced against what that box is normally worth

   Sample sizes are small on purpose, and smallest where a game is slowest —
   the strongest checkers and othello players spend a real node budget per
   move, and a ladder nobody runs because it takes a quarter of an hour is a
   ladder that rots. The point is to catch a rung that has stopped being a
   rung, not to publish a rating. A result near 50% is the signal that
   matters: it means two tiers are the same player wearing different names,
   and that shows up in six games as clearly as in sixty.

   Two rules about randomness, both learned here the hard way.

   **A seeded harness measuring an unseeded player measures nothing.** Euchre's
   top tier reached for Math.random inside its own sampling and produced 57%
   one run and 53% the next off identical seeds.

   **And a sampling player must not draw from the deal's generator.** Not for
   secrecy — that is checked below and there is no leak — but because drawing
   from a stream moves it, so the same seed stops producing the same cards
   when the strong side changes chairs, and a paired comparison quietly stops
   being paired.

   Every section prints how long it took, so when one of them grows it is
   obvious which one to trim.

   Run: node tools/ai-check.js                                              */
"use strict";
const path = require("path");
const ROOT = path.join(__dirname, "..");
global.self = global.self || {};

let fails = 0;
function ok(what, cond, detail) {
  if (cond) console.log("  ✓ " + what + (detail ? " — " + detail : ""));
  else { fails++; console.log("  ✗ " + what + (detail ? " — " + detail : "")); }
}
/* A seeded generator, and it has to be a real one.

   The obvious `x = (x * 1103515245 + 12345) & 0x7fffffff` is what was here
   first, and it is broken in JavaScript specifically: the product runs to
   2⁶¹, floats carry 53 bits, so the low bits are gone before the mask ever
   sees them. What comes out has a **cycle of about sixteen thousand**, a four
   per cent bias across the six faces, and — worst of the three — streams from
   adjacent seeds that are visibly correlated with each other.

   That last one is what makes it dangerous here rather than merely untidy.
   Every check in this file runs a few hundred games at seed, seed+1, seed+2,
   and a generator whose neighbouring streams agree turns those into one
   sample wearing several hats. It showed up as four hundred games of Yahtzee
   containing no Yahtzee at all, which should happen about once in three
   thousand runs.

   Mulberry32 instead: integer arithmetic throughout via Math.imul, so nothing
   is silently rounded, full 2³² period, and it scrambles the seed before
   producing anything so neighbouring seeds give unrelated streams. */
function seeded(s) {
  let a = (s >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function load(game, file) { return require(path.join(ROOT, game, file)); }
const BAR = 0.6;      /* a rung has to take three games in five to be a rung */
let mark = 0;
function room(name) { mark = Date.now(); console.log("\n──  " + name); }
function took() { console.log("    · " + ((Date.now() - mark) / 1000).toFixed(1) + "s"); }

/* ================================================================
   checkers — alpha-beta under a node budget
   ================================================================ */
room("the checkers board");
(function () {
  const R = load("checkers", "rules.js");
  const A = load("checkers", "ai.js");
  function play(t0, t1, seed) {
    let st = R.start();
    const rnd = seeded(seed);
    /* a few random opening plies so the games differ */
    for (let o = 0; o < 4; o++) {
      const ms = R.moves(st);
      st = R.apply(st, ms[Math.floor(rnd() * ms.length)]);
    }
    for (let n = 0; n < 300; n++) {
      const e = R.over(st);
      if (e.done) return e.winner;
      const p = A.choose(st, st.turn === 0 ? t0 : t1);
      if (!p) return 1 - st.turn;
      st = R.apply(st, R.find(st, p.mv));
    }
    return -1;
  }
  function ladder(hi, lo, games) {
    let w = 0, d = 0;
    for (let i = 0; i < games; i++) {
      const seat = i % 2;
      const win = seat === 0 ? play(hi, lo, i + 7) : play(lo, hi, i + 7);
      if (win < 0) d++; else if (win === seat) w++;
    }
    const score = (w + d / 2) / games;
    ok(hi + " beats " + lo, score >= BAR,
       w + "W " + d + "D " + (games - w - d) + "L over " + games + " · " + Math.round(score * 100) + "%");
  }
  ladder("steady", "novice", 12);
  ladder("sharp", "steady", 6);
  took();
})();

/* ================================================================
   othello — mobility, corners, and an exact endgame
   ================================================================ */
room("the othello board");
(function () {
  const R = load("othello", "rules.js");
  const A = load("othello", "ai.js");
  function play(t0, t1, seed) {
    let st = R.start();
    const rnd = seeded(seed);
    for (let o = 0; o < 4; o++) {
      const ms = R.moves(st);
      st = R.apply(st, ms[Math.floor(rnd() * ms.length)]);
    }
    for (;;) {
      const e = R.over(st);
      if (e.done) return e.winner;
      const p = A.choose(st, st.turn === 0 ? t0 : t1);
      st = R.apply(st, R.find(st, p.mv));
    }
  }
  function ladder(hi, lo, games) {
    let w = 0, d = 0;
    for (let i = 0; i < games; i++) {
      const seat = i % 2;
      const win = seat === 0 ? play(hi, lo, i + 3) : play(lo, hi, i + 3);
      if (win < 0) d++; else if (win === seat) w++;
    }
    const score = (w + d / 2) / games;
    ok(hi + " beats " + lo, score >= BAR,
       w + "W " + d + "D " + (games - w - d) + "L over " + games + " · " + Math.round(score * 100) + "%");
  }
  ladder("steady", "novice", 10);
  ladder("sharp", "steady", 8);
  took();
})();

/* ================================================================
   stratego — a belief, against somebody who has not got one
   ================================================================ */
room("the field");
(function () {
  const R = load("stratego", "rules.js");
  global.Rules = R;
  const A = load("stratego", "ai.js");
  function play(t0, t1, seed) {
    const rnd = seeded(seed);
    let st = R.empty();
    st = R.deploy(st, 0, A.deploy(0, rnd, A.tier(t0)));
    st = R.deploy(st, 1, A.deploy(1, rnd, A.tier(t1)));
    const tiers = [t0, t1];
    for (let n = 0; n < 4000; n++) {
      const e = R.over(st);
      if (e) return e.winner;
      /* the machine is handed a view, exactly like a person in that chair */
      const p = A.choose(R.publicView(st, st.turn), tiers[st.turn], rnd);
      if (!p) return 1 - st.turn;
      st = R.apply(st, R.find(st, p.mv));
    }
    return -1;
  }
  function ladder(hi, lo, games) {
    let w = 0, d = 0;
    for (let i = 0; i < games; i++) {
      const seat = i % 2;
      const win = seat === 0 ? play(hi, lo, i + 11) : play(lo, hi, i + 11);
      if (win < 0) d++; else if (win === seat) w++;
    }
    const score = (w + d / 2) / games;
    ok(hi + " beats " + lo, score >= BAR,
       w + "W " + d + "D " + (games - w - d) + "L over " + games + " · " + Math.round(score * 100) + "%");
  }
  ladder("officer", "recruit", 40);
  took();
})();

/* ================================================================
   the star — three answers to "how far have I got to go"
   ================================================================ */
room("the star");
(function () {
  const R = load("halma", "rules.js");
  global.Rules = R;
  const A = load("halma", "ai.js");
  function play(t0, t1) {
    let st = R.start({ players: 2, noSquat: true, vacate: 20 });
    const tiers = [t0, t1];
    for (let n = 0; n < 700; n++) {
      const e = R.over(st);
      if (e.done) return e.winner;
      const p = A.choose(st, st.turn, tiers[st.turn]);
      if (!p) return 1 - st.turn;
      st = R.apply(st, p.mv);
    }
    /* an unfinished race goes to whoever has less left to travel, which is
       the honest reading of a game the weaker player could not close out */
    return R.remaining(st, 0) < R.remaining(st, 1) ? 0 : 1;
  }
  function ladder(hi, lo, games) {
    let w = 0;
    for (let i = 0; i < games; i++) {
      const seat = i % 2;
      const win = seat === 0 ? play(hi, lo) : play(lo, hi);
      if (win === seat) w++;
    }
    ok(hi + " beats " + lo, w / games >= BAR, w + "/" + games + " · " + Math.round(100 * w / games) + "%");
  }
  ladder("steady", "novice", 12);
  ladder("sharp", "steady", 16);
  took();
})();

/* ================================================================
   hearts — ducking, then rollouts
   ================================================================ */
room("the hearts table");
(function () {
  const Cards = load("hearts", "cards.js");
  global.Cards = Cards;
  const R = load("hearts", "rules.js");
  global.Rules = R;
  const A = load("hearts", "ai.js");
  function match(tiers, seed) {
    const rnd = seeded(seed);
    const scores = [0, 0, 0, 0];
    let round = 0;
    while (Math.max.apply(null, scores) < 100 && round < 40) {
      let st = R.deal(round, rnd);
      st.scores = scores.slice();
      if (st.phase === "pass") {
        for (let s = 0; s < 4; s++) R.choosePass(st, s, A.pass(st, s, tiers[s]));
        st = R.doPass(st);
      }
      let guard = 0;
      while (st.phase === "play" && guard++ < 60) {
        const p = A.choose(st, st.turn, tiers[st.turn], rnd);
        st = R.play(st, st.turn, p.card);
      }
      const t = R.tally(st);
      for (let s = 0; s < 4; s++) scores[s] += t.add[s];
      round++;
    }
    return scores;
  }
  /* one of the stronger player against three of the weaker: the only shape
     that measures anything in a four-handed game */
  function ladder(hero, rest, n) {
    let wins = 0, heroPts = 0, restPts = 0;
    for (let m = 0; m < n; m++) {
      const seat = m % 4;
      const tiers = [rest, rest, rest, rest];
      tiers[seat] = hero;
      const sc = match(tiers, m * 131 + 7);
      if (sc[seat] === Math.min.apply(null, sc)) wins++;
      heroPts += sc[seat];
      for (let i = 0; i < 4; i++) if (i !== seat) restPts += sc[i] / 3;
    }
    /* chance is one in four, and the score is what actually matters in a
       game you win by having the fewest points */
    ok(hero + " among three " + rest + " takes fewer points", heroPts < restPts,
       wins + "/" + n + " matches won (chance is " + (n / 4).toFixed(1) + "), " +
       (heroPts / n).toFixed(1) + " points against " + (restPts / n).toFixed(1));
  }
  ladder("steady", "novice", 12);
  ladder("sharp", "steady", 12);
  took();
})();

/* ================================================================
   euchre — appraisal, then counting
   ================================================================ */
room("the euchre table");
(function () {
  const Cards = load("euchre", "cards.js");
  global.Cards = Cards;
  const R = load("euchre", "rules.js");
  global.Rules = R;
  const A = load("euchre", "ai.js");
  function hand(tiers, st, rnd) {
    let guard = 0;
    while (st.phase !== "done" && st.phase !== "throw" && guard++ < 90) {
      const seat = st.turn;
      if (st.phase === "bid1" || st.phase === "bid2") {
        const view = R.publicView(st, seat);
        const b = A.bid(Object.assign({}, st, { bidOptions: view.bidOptions }), seat, tiers[seat]);
        st = R.bid(st, seat, b) || R.bid(st, seat, { k: "pass" });
      } else if (st.phase === "discard") {
        st = R.discard(st, seat, A.discard(st, seat, tiers[seat]));
      } else {
        st = R.play(st, seat, A.choose(st, seat, tiers[seat], rnd).card);
      }
    }
    return st;
  }
  function match(tA, tB, seed) {
    const rnd = seeded(seed);
    /* The top tier deals out the hands it cannot see, and it gets its own
       generator to do it with. Not for secrecy — the check below measures
       that, and there is no leak either way — but because a player drawing
       from the deal's stream *moves* it, so the same seed stops producing the
       same deals when the strong side changes chairs. The ladder is a paired
       comparison and that quietly un-pairs it: sharing one stream read 65%,
       and the paired figure is 61%. */
    const brain = seeded(seed ^ 0x5bf03635);
    const scores = [0, 0];
    const tiers = [tA, tB, tA, tB];      /* seats 0 and 2 are one partnership */
    let dealer = 0, guard = 0;
    while (scores[0] < 10 && scores[1] < 10 && guard++ < 200) {
      const st = hand(tiers, R.deal(dealer, rnd, R.DEFAULTS), brain);
      if (st.phase !== "throw") {
        const t = R.tally(st);
        scores[t.team] += t.points;
      }
      dealer = (dealer + 1) % 4;
    }
    return scores;
  }
  function ladder(hi, lo, n) {
    let w = 0, margin = 0;
    for (let i = 0; i < n; i++) {
      const team = i % 2;
      const sc = team === 0 ? match(hi, lo, i * 97 + 3) : match(lo, hi, i * 97 + 3);
      if (sc[team] > sc[1 - team]) w++;
      margin += sc[team] - sc[1 - team];
    }
    /* Euchre is a high-variance game and the bar here is lower for it on
       purpose. A partnership that takes 55% of matches to ten is genuinely
       the better partnership; anybody claiming 80% for one skill in this
       game is measuring something other than the skill. */
    ok(hi + " beats " + lo, w / n >= 0.53,
       w + "/" + n + " matches to ten · " + Math.round(100 * w / n) + "% · average margin " +
       (margin / n).toFixed(2) + " points");
  }
  ladder("steady", "novice", 200);
  ladder("sharp", "steady", 400);

  /* The question that matters about any engine that plays out hands it cannot
     see: are the hands it imagines any better than the ones it would get by
     guessing? `AI.determinize` respects every suit somebody has failed to
     follow, which is public, and nothing else. If it ever placed cards better
     than chance, the engine would be reading the deal.

     Measured against itself on two different streams rather than against a
     computed baseline — the baseline depends on the kitty, the voids and how
     far into the hand it is, and a check whose expected value has to be
     derived by hand is a check that will be wrong. Two streams, same rate, no
     artifact. */
  function placement(sameStream, games) {
    let hits = 0, total = 0;
    for (let g = 0; g < games; g++) {
      const rnd = seeded(g * 7919 + 5);
      const brain = sameStream ? rnd : seeded((g * 7919 + 5) ^ 0x5bf03635);
      let st = R.deal(g % 4, rnd, R.DEFAULTS), guard = 0;
      while ((st.phase === "bid1" || st.phase === "bid2" || st.phase === "discard") && guard++ < 40) {
        if (st.phase === "discard") st = R.discard(st, st.turn, A.discard(st, st.turn, "steady"));
        else {
          const v = R.publicView(st, st.turn);
          const b = A.bid(Object.assign({}, st, { bidOptions: v.bidOptions }), st.turn, "steady");
          st = R.bid(st, st.turn, b) || R.bid(st, st.turn, { k: "pass" });
        }
      }
      if (st.phase !== "play") continue;
      const seat = st.turn;
      for (let t = 0; t < 24; t++) {
        const guess = A.determinize(st, seat, brain);
        if (!guess) continue;
        for (let q = 0; q < 4; q++) {
          if (q === seat) continue;
          for (const card of guess[q]) {
            total++;
            if (st.hands[q].indexOf(card) >= 0) hits++;
          }
        }
      }
    }
    return { rate: total ? hits / total : 0, total: total };
  }
  const shared = placement(true, 300), apart = placement(false, 300);
  /* two proportions, one z. Anything past 3 is the engine seeing something. */
  const p = (shared.rate * shared.total + apart.rate * apart.total) / (shared.total + apart.total);
  const se = Math.sqrt(p * (1 - p) * (1 / shared.total + 1 / apart.total));
  const z = se ? (shared.rate - apart.rate) / se : 0;
  ok("the hands it imagines are no better off the dealer's generator than off its own",
     Math.abs(z) < 3.5,
     (100 * shared.rate).toFixed(1) + "% shared vs " + (100 * apart.rate).toFixed(1) +
     "% independent · z = " + z.toFixed(2));
  took();
})();

/* ================================================================
   la viuda — measured by survival, because that is what the game pays

   Only the worst hand loses a life, so a win rate at a table of three is the
   right instrument and one third is the number to beat. As in the euchre
   room, the sampling player gets its own generator: it must not move the
   stream the cards are dealt from, or the same seed stops producing the same
   table when the strong player changes chairs.
   ================================================================ */
room("la viuda");
(function () {
  const Cards = load("viuda", "cards.js");
  global.Cards = Cards;
  const R = load("viuda", "rules.js");
  const A = load("viuda", "ai.js");

  function game(tiers, seed) {
    const rnd = seeded(seed);
    const brain = seeded(seed ^ 0x5bf03635);
    let st = R.start(tiers.length), guard = 0;
    while (!R.over(st) && guard++ < 200) {
      st = R.deal(st, rnd);
      let g2 = 0;
      while (st.phase === "play" && g2++ < 60) {
        const next = A.act(st, st.turn, tiers[st.turn], brain);
        if (!next) return -1;
        st = next;
      }
      if (st.phase !== "show" && st.phase !== "over") return -1;
    }
    return R.winner(st);
  }
  function ladder(hero, rest, n, seats) {
    let w = 0;
    for (let i = 0; i < n; i++) {
      /* the hero moves round the table, because the seat to the dealer's left
         acts first and first is not the same as last */
      const chair = i % seats, tiers = [];
      for (let s = 0; s < seats; s++) tiers.push(s === chair ? hero : rest);
      if (game(tiers, i * 131 + 7) === chair) w++;
    }
    ok(hero + " outlasts " + rest, w / n >= 1 / seats + 0.06,
       w + "/" + n + " games at a table of " + seats + " · " + Math.round(100 * w / n) +
       "% · chance is " + Math.round(100 / seats) + "%");
  }
  ladder("careful", "hopeful", 300, 3);
  ladder("widow", "careful", 150, 3);
  took();
})();

/* ================================================================
   the sheet — measured in points, because Yahtzee is a race against the
   dice rather than against the other player

   A head-to-head win rate is the wrong instrument here. Two players who
   average 210 and 220 split matches nearly evenly, because most of the
   variance in a game of Yahtzee is the dice and not the decisions — so the
   ladder is checked on the thing the tiers actually differ in, the average
   sheet, and a rung has to be worth a clear ten points to count.

   Every tier is given the same seeds, so the first roll of every turn is
   shared. It diverges after that — a tier that keeps different dice consumes
   the stream differently, and there is no way round that short of replaying
   the whole tree. Sixty games is enough for a ten-point gap and nowhere near
   enough for a two-point one, which is why the bar is ten.
   ================================================================ */
room("the sheet");
(function () {
  const R = load("yahtzee", "rules.js");
  const A = load("yahtzee", "ai.js");
  function season(tier, n) {
    let sum = 0, top = 0, bonus = 0;
    for (let g = 0; g < n; g++) {
      const rnd = seeded(g * 7919 + 11);
      let st = R.start(1), guard = 0;
      while (!R.over(st) && guard++ < 30) {
        const next = A.turn(st, tier, rnd);
        if (!next) break;
        st = next;
      }
      const card = st.cards[0], t = R.total(card);
      sum += t;
      if (t > top) top = t;
      if (R.upperTotal(card) >= R.BONUS_AT) bonus++;
    }
    return { avg: sum / n, top: top, bonus: bonus / n };
  }
  const N = 60;
  const runs = {};
  for (const t of ["cup", "counter", "ledger"]) {
    runs[t] = season(t, N);
    console.log("    · " + t.padEnd(8) + " averages " + runs[t].avg.toFixed(1) +
                ", best " + runs[t].top + ", takes the 63 in " +
                Math.round(runs[t].bonus * 100) + "% of games");
  }
  function rung(hi, lo) {
    ok(hi + " out-scores " + lo, runs[hi].avg - runs[lo].avg >= 10,
       runs[hi].avg.toFixed(1) + " vs " + runs[lo].avg.toFixed(1) +
       " over " + N + " games from the same seeds");
  }
  rung("counter", "cup");
  rung("ledger", "counter");
  /* The sixty-three is the thing Cup was not given and the other two were,
     so it is checked directly rather than inferred from the totals. The claim
     is the ordering, not a number — Counter chases the bonus with one roll of
     lookahead and gets it about a fifth of the time, Ledger looks two rolls
     ahead and prices the surplus and gets it about twice as often. Asserting
     a threshold would be asserting something nobody measured. */
  ok("each tier collects the sixty-three more often than the one below",
     runs.cup.bonus < runs.counter.bonus && runs.counter.bonus < runs.ledger.bonus,
     "cup " + Math.round(runs.cup.bonus * 100) + "% · counter " + Math.round(runs.counter.bonus * 100) +
     "% · ledger " + Math.round(runs.ledger.bonus * 100) + "%");
  took();
})();

console.log("");
if (fails) {
  console.log("FAILED: " + fails + " rung" + (fails === 1 ? "" : "s") + " is not a rung");
  process.exit(1);
}
console.log("every ladder holds");
