/* rating-check.js — dev-only. The score is honest.

   The same promises the chess room's rating-check holds its number to,
   carried across to a table of four:

   · Glicko, computed a second way. The pareja version is checked against
     an independent implementation written from the formulas: a team at
     the average of its two ratings, the derivative carried through.
   · Help weighed the same in both directions, never to nothing.
   · No match moves the number more than MAX_STEP.
   · Accuracy that means something: a perfect play is 100, a worse play
     is never better, one blunder is not averaged away, too few real
     choices gives no number at all.
   · A table that reads every rung back at its own rating, and a clean
     match against a weak pareja not read as a master's.
   · Stars and milestones said once; storage that survives hostile JSON.
   · And the one that matters most: a simulated player of known strength,
     choosing rungs the way the room suggests, is found within a season.

   Run: node tools/rating-check.js [--verbose]                          */
"use strict";
var Rt = require("../rating.js");
var R = require("../rules.js");
var AI = require("../ai.js");

var VERBOSE = process.argv.indexOf("--verbose") >= 0;
var pass = 0, fail = 0, failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; if (VERBOSE) console.log("  ok  " + name); }
  else { fail++; failures.push(name); console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
}
var L = Rt.LEVELS;

/* ---------- the ladder ---------- */
(function () {
  var up = true, accUp = true;
  for (var i = 1; i < L.length; i++) {
    if (!(L[i].elo > L[i - 1].elo)) up = false;
    if (!(L[i].accuracy > L[i - 1].accuracy)) accUp = false;
  }
  ok("every rung is rated above the one below", up);
  ok("and plays more accurately", accUp);
  ok("the ladder starts at its anchor", L[0].elo === 400);
  var lv = AI.level(Rt.aiLevel("taqueros"));
  ok("a rung's recipe reaches the players intact", lv.counts === true && lv.partner === true && lv.focus === 0.45 && lv.rollouts === 0);
  ok("old saved levels still find a seat", Rt.migrate("compadre") === "compadres" && Rt.migrate("cabron") === "cabrones" &&
     Rt.migrate("viejos") === "viejos" && Rt.migrate("nonsense") === null);
  /* a rung plays the same move for the same seed — the property that lets
     it carry a rating at all */
  var st = R.newHand({ seed: 42 }), v = R.publicView(st, st.turn), same = true;
  for (var k = 0; k < L.length; k++) {
    var a = AI.analyse(v, { level: Rt.aiLevel(L[k]), rand: R.rng(9) }).move;
    var b = AI.analyse(v, { level: Rt.aiLevel(L[k]), rand: R.rng(9) }).move;
    if (a.tile !== b.tile || a.end !== b.end) same = false;
  }
  ok("every rung plays the same bone for the same seed", same);
})();

/* ---------- Glicko, a second way ---------- */
(function () {
  function second(r, rd, opp, s, w) {
    var q = Math.log(10) / 400, oppRd = Rt.OPP_RD;
    var g = 1 / Math.sqrt(1 + 3 * q * q * oppRd * oppRd / (Math.PI * Math.PI));
    var team = (r + opp) / 2;
    var E = 1 / (1 + Math.pow(10, -g * (team - opp) / 400));
    var dEdr = 0.5 * g;                       /* ∂(g·(team−opp))/∂r */
    var d2inv = w * q * q * dEdr * dEdr * E * (1 - E);
    var rdNew = Math.sqrt(1 / (1 / (rd * rd) + d2inv));
    var step = q / (1 / (rd * rd) + d2inv) * w * dEdr * (s - E);
    step = Math.max(-Rt.MAX_STEP, Math.min(Rt.MAX_STEP, step));
    return { r: r + step, rd: Math.max(40, Math.min(250, rdNew)) };
  }
  var worst = 0;
  [[600, 250, "compadres", 1], [600, 250, "pollitos", 0], [800, 80, "cabrones", 1], [450, 60, "viejos", 0], [700, 120, "mariachis", 1]].forEach(function (c) {
    var st = Rt.fresh(); st.r = c[0]; st.rd = c[1];
    var u = Rt.update(st, { level: c[2], result: c[3], at: 1 });
    var t = second(c[0], c[1], Rt.levelById(c[2]).elo, c[3], 1);
    worst = Math.max(worst, Math.abs(u.state.r - t.r), Math.abs(u.state.rd - t.rd));
  });
  ok("the pareja Glicko agrees with a second implementation", worst < 1e-6, "off by " + worst);
  var e = Rt.expected(842, 842);
  ok("an even pareja is a coin flip", Math.abs(e - 0.5) < 1e-9);
  ok("a stronger player lifts their pareja, by half their edge",
     Math.abs(Rt.expected(942, 842, 0) - 1 / (1 + Math.pow(10, -50 / 400))) < 1e-9);
})();

/* ---------- help, both ways ---------- */
(function () {
  var base = Rt.fresh(); base.rd = 100; base.r = 600;
  var w0 = Rt.update(base, { level: "compadres", result: 1 }).delta;
  var w3 = Rt.update(base, { level: "compadres", result: 1, assisted: { hints: 3 } }).delta;
  var l0 = Rt.update(base, { level: "compadres", result: 0 }).delta;
  var l3 = Rt.update(base, { level: "compadres", result: 0, assisted: { hints: 3 } }).delta;
  ok("a helped win lifts you a little less", w3 > 0 && w3 < w0, w3 + " vs " + w0);
  ok("and a helped loss costs you a little less", l3 < 0 && l3 > l0, l3 + " vs " + l0);
  ok("help never takes a match to nothing", Rt.assistWeight({ hints: 999 }) === 0.25);
  ok("a short match counts for less", Rt.assistWeight(null, 50) < Rt.assistWeight(null, 100) && Rt.assistWeight(null, 200) === 1);
})();

/* ---------- caps ---------- */
(function () {
  var big = 0;
  ["pollitos", "cabrones"].forEach(function (id) {
    [0, 1].forEach(function (res) {
      var u = Rt.update(Rt.fresh(), { level: id, result: res });
      big = Math.max(big, Math.abs(u.state.r - Rt.START_R));
    });
  });
  ok("no single match moves a newcomer more than the cap", big <= Rt.MAX_STEP + 1e-9, big.toFixed(1));
  var u = Rt.update(Rt.fresh(), { level: "pollitos", result: 1 });
  ok("beating the weakest pareja as a newcomer still counts for something", u.delta > 0);
  ok("an unknown rung rates nothing", Rt.update(Rt.fresh(), { level: "x", result: 1 }).rated === false);
})();

/* ---------- accuracy ---------- */
(function () {
  ok("the best play is 100%", Rt.moveAccuracy(10, 10) === 100 && Rt.moveAccuracy(10, 12) === 100);
  var mono = true, last = 101;
  for (var gap = 0; gap <= 80; gap += 2) { var a = Rt.moveAccuracy(0, -gap); if (a > last) mono = false; last = a; }
  ok("a worse play is never scored better", mono);
  ok("a big blunder is near zero", Rt.moveAccuracy(30, -60) < 10);
  var few = [];
  for (var i = 0; i < Rt.ACCURACY_MIN_MOVES - 1; i++) few.push({ best: 5, played: 5 });
  ok("too few real choices gives no number", Rt.gameAccuracy(few) === null);
  var clean = [], blunder = [];
  for (i = 0; i < 20; i++) { clean.push({ best: 5, played: 5 }); blunder.push({ best: 5, played: i === 10 ? -70 : 5 }); }
  ok("a clean match is 100", Rt.gameAccuracy(clean) === 100);
  ok("one blunder is not averaged away", Rt.gameAccuracy(blunder) < 93, Rt.gameAccuracy(blunder) + "");
  ok("junk in the list is skipped", Rt.gameAccuracy(clean.concat([null, 5, { best: "x" }])) === 100);
  ok("verdicts climb with accuracy", Rt.verdict(99).id === "sharp" && Rt.verdict(80).id === "good" &&
     Rt.verdict(50).id === "ok" && Rt.verdict(10).id === "miss");
})();

/* ---------- accuracy → rating ---------- */
(function () {
  var mono = true;
  for (var i = 1; i < Rt.PERF.length; i++) if (!(Rt.PERF[i][0] > Rt.PERF[i - 1][0] && Rt.PERF[i][1] > Rt.PERF[i - 1][1])) mono = false;
  ok("the accuracy table climbs on both axes", mono);
  var own = L.every(function (l) { return Math.abs(Rt.perfFromAccuracy(l.accuracy) - l.elo) <= 1; });
  ok("each rung's own accuracy reads back as its own rating", own);
  ok("a clean match against a weak pareja is not a master's", Rt.gamePerf(100, Rt.levelById("pollitos")) === 400 + Rt.PERF_ABOVE);
  ok("and a rough match against a strong one is still rough", Rt.gamePerf(60, Rt.levelById("cabrones")) < 400);
})();

/* ---------- stars and milestones ---------- */
(function () {
  var s = Rt.fresh();
  var u = Rt.update(s, { level: "compadres", result: 1, accuracy: 85 });
  ok("a clean, accurate win earns all three stars", u.newStars.join() === "0,1,2", u.newStars.join());
  var u2 = Rt.update(u.state, { level: "compadres", result: 1, accuracy: 90 });
  ok("and never earns them twice", u2.newStars.length === 0);
  var h = Rt.update(Rt.fresh(), { level: "primos", result: 1, accuracy: 95, assisted: { hints: 1 } });
  ok("a helped win earns only the first", h.newStars.join() === "0");
  var lo = Rt.update(Rt.fresh(), { level: "primos", result: 0, accuracy: 99 });
  ok("a loss earns none", lo.newStars.length === 0);
  ok("star counts add up", Rt.starCount(u.state, "compadres") === 3 && Rt.summary(u.state).stars === 3);

  /* nothing said while provisional; settling said once */
  var st = Rt.fresh(), said = [], at = 0;
  for (var i = 0; i < 40; i++) {
    var r = Rt.update(st, { level: "compadres", result: i % 3 ? 1 : 0, at: at += 3600000 });
    st = r.state;
    if (r.milestone) said.push(r.milestone.kind + (r.wasProvisional ? "(p)" : ""));
  }
  ok("settling is announced exactly once", said.filter(function (x) { return x.indexOf("settled") === 0; }).length === 1, said.join(","));
})();

/* ---------- leaving early ---------- */
(function () {
  ok("a young match left behind counts for nothing", Rt.abandonResult({ hands: 1, us: 0, them: 80, target: 100 }) === null);
  ok("a lost one is the loss it already was", Rt.abandonResult({ hands: 4, us: 10, them: 70, target: 100 }) === 0);
  ok("a close one counts for nothing", Rt.abandonResult({ hands: 4, us: 40, them: 60, target: 100 }) === null);
})();

/* ---------- hostile storage ---------- */
(function () {
  var junk = ['{"r":"9999"}', '{"r":-5,"rd":1e9,"games":-3}', '[]', 'null', '{"__proto__":{"r":1}}',
              '{"history":[{"level":"x","result":1},{"level":"compadres","result":7},{"level":"compadres","result":1,"acc":900}]}',
              '{"stars":{"compadres":[1,1,1,1],"viejos":[1,0,1]},"vs":{"viejos":["a",2]}}', '{', 'x'.repeat(500001)];
  var bad = 0;
  junk.forEach(function (j) {
    var s = Rt.load(function () { return j; });
    if (!(s.r >= 100 && s.r <= 3000 && s.rd >= 40 && s.rd <= 250 && s.games >= 0)) bad++;
    s.history.forEach(function (e) { if (!Rt.levelById(e.level) || (e.acc !== null && e.acc > 100)) bad++; });
    Object.keys(s.stars).forEach(function (k) { if (!Rt.levelById(k) || s.stars[k].length !== 3) bad++; });
  });
  ok("nothing hostile survives being read back", bad === 0, bad + " bad");
  ok("a throwing store is a fresh start", Rt.load(function () { throw new Error("no"); }).games === 0);
  ok("a failed write says so", Rt.save(Rt.fresh(), function () { return false; }) === false &&
     Rt.save(Rt.fresh(), function () { throw new Error("quota"); }) === false);
})();

/* ---------- a season ----------
   Players of known strength sit down and play whatever the room
   suggests. Each match is won with exactly the chance the pareja model
   gives — which is all a rating can promise to recover. Within forty
   matches the number must be within reach of the truth: the halved
   information a pareja gives (half your side's play is not yours) makes
   this slower than the chess room's, and it is checked rather than
   hoped. */
(function () {
  var worst = 0, detail = [];
  [450, 600, 750, 900].forEach(function (truth, ti) {
    var errs = [];
    for (var run = 0; run < 30; run++) {
      var s = Rt.fresh(), rnd = R.rng(1000 + ti * 100 + run), at = 0;
      for (var m = 0; m < 40; m++) {
        var lv = Rt.levelById(Rt.suggestLevel(s));
        var p = Rt.expected(truth, lv.elo, 0);
        s = Rt.update(s, { level: lv.id, result: rnd() < p ? 1 : 0, at: at += 7200000 }).state;
      }
      errs.push(Math.abs(s.r - truth));
    }
    errs.sort(function (a, b) { return a - b; });
    var median = errs[Math.floor(errs.length / 2)];
    detail.push(truth + ": ±" + Math.round(median));
    worst = Math.max(worst, median);
  });
  ok("a player is found within a season of forty matches", worst < 110, detail.join(", "));
  console.log("      after 40 matches the typical miss is " + detail.join(", "));
})();

console.log("\n" + (fail === 0
  ? "the score is honest — " + pass + " checks passed"
  : fail + " of " + (pass + fail) + " checks FAILED"));
if (fail) { failures.forEach(function (f) { console.log("  · " + f); }); process.exit(1); }
