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
     euchre     card counting, which changes whether you protect your
                partner's trick or throw your worst card at it

   Sample sizes are small on purpose, and smallest where a game is slowest —
   the strongest checkers and othello players spend a real node budget per
   move, and a ladder nobody runs because it takes a quarter of an hour is a
   ladder that rots. The point is to catch a rung that has stopped being a
   rung, not to publish a rating. A result near 50% is the signal that
   matters: it means two tiers are the same player wearing different names,
   and that shows up in six games as clearly as in sixty.

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
function seeded(s) {
  let x = s;
  return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
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
  function hand(tiers, st) {
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
        st = R.play(st, seat, A.choose(st, seat, tiers[seat]).card);
      }
    }
    return st;
  }
  function match(tA, tB, seed) {
    const rnd = seeded(seed);
    const scores = [0, 0];
    const tiers = [tA, tB, tA, tB];      /* seats 0 and 2 are one partnership */
    let dealer = 0, guard = 0;
    while (scores[0] < 10 && scores[1] < 10 && guard++ < 200) {
      const st = hand(tiers, R.deal(dealer, rnd, R.DEFAULTS));
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
  took();
})();

console.log("");
if (fails) {
  console.log("FAILED: " + fails + " rung" + (fails === 1 ? "" : "s") + " is not a rung");
  process.exit(1);
}
console.log("every ladder holds");
