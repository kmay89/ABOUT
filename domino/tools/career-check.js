/* career-check.js — dev-only. The record keeps true numbers.

   The score is rating.js and tools/rating-check.js; this is the rest of
   the record — counts and logros — and the two things it must never do:
   come back from a damaged save as NaN, a negative or a badge that does
   not exist, and say the same logro twice.

   Run: node tools/career-check.js [--verbose]                          */
"use strict";
var Car = require("../career.js");

var VERBOSE = process.argv.indexOf("--verbose") >= 0;
var pass = 0, fail = 0, failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; if (VERBOSE) console.log("  ok  " + name); }
  else { fail++; failures.push(name); console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
}

(function () {
  var ids = {};
  Car.BADGES.forEach(function (b) { ids[b.id] = 1; });
  ok("logros have distinct ids", Object.keys(ids).length === Car.BADGES.length);
  ok("and every one has words", Car.BADGES.every(function (b) { return b.name && b.note; }));
})();

(function () {
  var junk = [null, undefined, 7, "x", [], { hands: -50 }, { hands: "NaN" }, { matches: 1e99, hands: -3 },
              { badges: { notABadge: 1, domino: 1 } }, { sharp: "12", matches: {} }, { xp: 400 }];
  var bad = 0;
  junk.forEach(function (j) {
    var c = Car.clean(j);
    for (var k in c) {
      if (k === "badges") { for (var b in c.badges) if (!Car.BADGES.some(function (x) { return x.id === b; })) bad++; continue; }
      if (typeof c[k] !== "number" || !isFinite(c[k]) || c[k] < 0) bad++;
    }
  });
  ok("nothing hostile survives a save being read back", bad === 0, bad + " bad fields");
  ok("a real number in a string is kept", Car.clean({ sharp: "12" }).sharp === 12);
  ok("and a real logro is kept", Car.clean({ badges: { domino: 1 } }).badges.domino === 1);
  ok("an old save's points are quietly retired", Car.clean({ xp: 400 }).xp === undefined);
})();

(function () {
  var c = Car.fresh();
  var r = Car.record(c, { k: "hand", won: true, mine: true, how: "domino", capicua: true });
  ok("a capicúa hand earns its logros", r.badges.length >= 3 && c.capicuas === 1 && c.dominos === 1);
  ok("but never twice", Car.record(c, { k: "hand", won: true, mine: true, how: "domino", capicua: true }).badges.length === 0);
  ok("your partner's capicúa is not yours", (function () { var d = Car.fresh(); Car.record(d, { k: "hand", won: true, mine: false, how: "domino", capicua: true }); return d.capicuas === 0; })());
  for (var i = 0; i < 3; i++) Car.record(c, { k: "match", won: true, level: "compadres" });
  ok("three in a row is a streak", c.badges.streak3 === 1 && c.best === 3);
  Car.record(c, { k: "match", won: false, level: "compadres" });
  ok("a loss ends it, and the best is kept", c.streak === 0 && c.best === 3);
  var d = Car.fresh();
  Car.record(d, { k: "match", won: true, level: "cabrones" });
  ok("beating the strongest pareja earns both of its logros", d.badges.maestro === 1 && d.badges.cabron === 1);
})();

console.log("\n" + (fail === 0
  ? "the record keeps true numbers — " + pass + " checks passed"
  : fail + " of " + (pass + fail) + " checks FAILED"));
if (fail) { failures.forEach(function (f) { console.log("  · " + f); }); process.exit(1); }
