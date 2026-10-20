/* career-check.js — dev-only. Proves the rank ladder is fair and sane.

   Three properties matter about a progression system, and none of them
   can be eyeballed from the code:

   · it cannot be corrupted — a hand-edited or damaged save comes back as
     numbers, never as NaN, a negative, or a badge that does not exist;
   · it only goes up, and every rank is reachable;
   · it rewards playing *well* more than playing *lots*. A player who
     wins two matches in three and plays sharply should climb clearly
     faster than one who loses two in three — but the losing player must
     still climb, or the table stops being somewhere you come back to.

   Run: node tools/career-check.js [--verbose]                          */
"use strict";
var Car = require("../career.js");
var R = require("../rules.js");

var VERBOSE = process.argv.indexOf("--verbose") >= 0;
var pass = 0, fail = 0, failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; if (VERBOSE) console.log("  ok  " + name); }
  else { fail++; failures.push(name); console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
}

/* ---------- the ladder itself ---------- */
(function () {
  var up = true;
  for (var i = 1; i < Car.RANKS.length; i++) if (!(Car.RANKS[i].xp > Car.RANKS[i - 1].xp)) up = false;
  ok("every rank asks for more than the one before", up);
  ok("and the first one is free", Car.RANKS[0].xp === 0);
  ok("rankOf puts 0 xp at the bottom", Car.rankOf(0).i === 0);
  ok("and a lot of xp at the top", Car.rankOf(1e6).i === Car.RANKS.length - 1 && Car.rankOf(1e6).frac === 1);
  var ids = {};
  Car.BADGES.forEach(function (b) { ids[b.id] = 1; });
  ok("badges have distinct ids", Object.keys(ids).length === Car.BADGES.length);
})();

/* ---------- hostile saves ---------- */
(function () {
  var junk = [null, undefined, 7, "x", [], { xp: -50 }, { xp: "NaN" }, { xp: 1e99, hands: -3 },
              { badges: { notABadge: 1, domino: 1 } }, { xp: "12", matches: {} }];
  var bad = 0;
  junk.forEach(function (j) {
    var c = Car.clean(j);
    for (var k in c) {
      if (k === "badges") { for (var b in c.badges) if (!Car.BADGES.some(function (x) { return x.id === b; })) bad++; continue; }
      if (typeof c[k] !== "number" || !isFinite(c[k]) || c[k] < 0) bad++;
    }
  });
  ok("nothing hostile survives a save being read back", bad === 0, bad + " bad fields");
  ok("a real number in a string is kept", Car.clean({ xp: "12" }).xp === 12);
  ok("and a real badge is kept", Car.clean({ badges: { domino: 1 } }).badges.domino === 1);
})();

/* ---------- the events ---------- */
(function () {
  var c = Car.fresh();
  var r = Car.record(c, { k: "hand", won: true, mine: true, how: "domino", capicua: true, points: 40 });
  ok("a capicúa hand pays for winning, going out and the capicúa", r.gain.length === 3, JSON.stringify(r.gain));
  ok("and earns its badges once", r.badges.length >= 3);
  var r2 = Car.record(c, { k: "hand", won: true, mine: true, how: "domino", capicua: true, points: 40 });
  ok("but never twice", r2.badges.length === 0);
  var before = c.xp;
  Car.record(c, { k: "match", won: false, level: "compadre" });
  ok("a lost match still moves you forward", c.xp > before);
  ok("and breaks the streak", c.streak === 0);
  var x0 = Car.fresh(), x1 = Car.fresh();
  Car.record(x0, { k: "match", won: true, level: "novato" });
  Car.record(x1, { k: "match", won: true, level: "cabron" });
  ok("a win against stronger players pays more", x1.xp > x0.xp, x0.xp + " vs " + x1.xp);
})();

/* ---------- the long run ----------
   Two players, two hundred matches each, the same rules: one wins two
   matches in three and plays sharply, one loses two in three and does
   not. Hands are simulated from match results rather than played out —
   this is a check on the arithmetic of the ladder, not on the AI. */
(function () {
  function career(winRate, sharpRate, seed) {
    var c = Car.fresh(), rnd = R.rng(seed), seen = {};
    for (var m = 0; m < 200; m++) {
      var mw = rnd() < winRate;
      for (var h = 0; h < 6; h++) {
        var hw = rnd() < (mw ? 0.62 : 0.38);
        for (var p = 0; p < 4; p++) { Car.record(c, { k: "graded" }); if (rnd() < sharpRate) Car.record(c, { k: "sharp" }); }
        Car.record(c, { k: "hand", won: hw, mine: hw && rnd() < 0.5, how: rnd() < 0.8 ? "domino" : "tranca",
                        capicua: hw && rnd() < 0.05, points: 10 + Math.floor(rnd() * 40) });
      }
      Car.record(c, { k: "match", won: mw, level: "compadre", zapatero: mw && rnd() < 0.05 });
      seen[Car.rankOf(c.xp).i] = 1;
      if (!isFinite(c.xp)) return null;
    }
    return { c: c, ranks: Object.keys(seen).length };
  }
  var good = career(0.66, 0.6, 11), poor = career(0.33, 0.2, 12);
  ok("the arithmetic never goes wrong over a long career", !!good && !!poor);
  if (good && poor) {
    ok("playing well climbs clearly faster", good.c.xp > poor.c.xp * 1.4, good.c.xp + " vs " + poor.c.xp);
    ok("but losing still climbs", Car.rankOf(poor.c.xp).i >= 3, "reached " + Car.rankOf(poor.c.xp).rank.name);
    ok("and two hundred good matches reach the top", Car.rankOf(good.c.xp).i === Car.RANKS.length - 1,
       "reached " + Car.rankOf(good.c.xp).rank.name);
    console.log("      200 matches: a strong player reaches " + Car.rankOf(good.c.xp).rank.name + " (" + good.c.xp +
                " xp), a struggling one " + Car.rankOf(poor.c.xp).rank.name + " (" + poor.c.xp + " xp)");
    /* and not instantly: the first rank-up should take a few hands, the
       top should take a good many evenings */
    var quick = Car.fresh(), hands = 0;
    while (Car.rankOf(quick.xp).i === 0 && hands < 100) { Car.record(quick, { k: "hand", won: true, mine: false, how: "domino", points: 20 }); hands++; }
    ok("the first rank comes within an evening", hands >= 3 && hands <= 15, hands + " winning hands");
  }
})();

console.log("\n" + (fail === 0
  ? "the ladder is fair — " + pass + " checks passed"
  : fail + " of " + (pass + fail) + " checks FAILED"));
if (fail) { failures.forEach(function (f) { console.log("  · " + f); }); process.exit(1); }
