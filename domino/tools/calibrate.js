/* calibrate.js — dev-only. How strong is each pareja on the ladder, really?

   A rating is a claim about a person, and the only way this room can make
   it is by measuring the opponents the person played. Every number
   rating.js stores about the ladder comes out of this file, the same way
   the chess room's ladder comes out of chess/tools/calibrate.js:

     1. Neighbouring rungs play matches to 100. Every match is played twice
        from the same seed with the parejas swapped, so the same deals fall
        to each side once — the cards and the salida cancel out, and only
        the play is left to decide the pair. The fraction of matches won
        becomes an Elo gap between the two parejas: Δ = −400·log10(1/p − 1).
        Both members of a pareja are the same rung, so a gap between
        parejas is a gap between players (a team is rated at its average).
     2. The gaps are stacked into a chain and the bottom is pinned at 400,
        somebody who has just learned the rules. Domino is a game of
        luck as well as skill, so self-play does not exaggerate the way an
        engine never having an off day does in chess; the chain is only
        scaled if it would run past 1800, and then down, never up. The
        spacing is measured; the anchor is the one assumption.
     3. The reviewer in ai.js — the same one the room grades your plays
        with — reads every real choice each rung made in a sample of its
        matches and turns them into match accuracy. Pairing each rung's
        mean accuracy with its rating gives the accuracy → rating table.

   Reproducible: no clock, no Math.random. Every match is seeded and every
   player is handed its own seeded generator, so any match replays exactly
   and the order things run in changes nothing.

   Run: node domino/tools/calibrate.js [--matches 120] [--pairs 0-1,3-4]
                                       [--review 6] [--seed 7] [--json out.json]
        node domino/tools/calibrate.js --merge a.json,b.json,…   (print the table)
   A full run is a few minutes per pair on one core; run pairs in parallel
   with --pairs and --json, then --merge.                               */
"use strict";
var fs = require("fs");
var R = require("../rules.js");
var AI = require("../ai.js");
var Rating = require("../rating.js");

var argv = process.argv.slice(2);
function flag(n, d) {
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === "--" + n) return argv[i + 1] && argv[i + 1].indexOf("--") !== 0 ? argv[i + 1] : true;
    if (argv[i].indexOf("--" + n + "=") === 0) return argv[i].split("=")[1];
  }
  return d;
}
var MATCHES = parseInt(flag("matches", 120), 10);
var REVIEW = parseInt(flag("review", 6), 10);
var SEED = parseInt(flag("seed", 7), 10);
var L = Rating.LEVELS;

/* one match to 100; team 0 plays `a`, team 1 plays `b`. Returns the
   winning team, and every real choice each seat made if asked to keep them */
function match(a, b, seed, keep) {
  var m = R.newMatch({ seed: seed, rules: { target: 100 } });
  var rand = [R.rng(seed ^ 0x1111), R.rng(seed ^ 0x2222), R.rng(seed ^ 0x3333), R.rng(seed ^ 0x4444)];
  var lv = [Rating.aiLevel(a), Rating.aiLevel(b)];
  var kept = [[], []], guard = 0;
  while (!m.over && guard++ < 80) {
    var st = R.dealHand(m), g = 0;
    while (!st.over && g++ < 240) {
      if (!R.canPlay(st, st.turn)) { R.pass(st); continue; }
      var v = R.publicView(st, st.turn), t = R.team(st.turn);
      var mv = AI.analyse(v, { level: lv[t], rand: rand[st.turn] }).move;
      if (keep && AI.movesFor(v).length > 1) kept[t].push({ view: v, move: mv });
      R.play(st, mv);
    }
    R.settle(m, st);
  }
  return { champion: m.champion, kept: kept };
}

function pair(i, j) {
  var wins = 0, games = 0, samples = { a: [], b: [] };
  for (var k = 0; k < MATCHES; k++) {
    var seed = (SEED * 100003 + i * 7919 + k * 31337) >>> 0;
    var keep = k < REVIEW;
    var x = match(L[j].id, L[i].id, seed, keep);        /* j on team 0 */
    var y = match(L[i].id, L[j].id, seed, keep);        /* the same deals, swapped */
    if (x.champion === 0) wins++;
    if (y.champion === 1) wins++;
    games += 2;
    if (keep) { samples.b.push(x.kept[0], y.kept[1]); samples.a.push(x.kept[1], y.kept[0]); }
  }
  return { i: i, j: j, a: L[i].id, b: L[j].id, wins: wins, games: games,
           accA: accuracyOf(samples.a), accB: accuracyOf(samples.b) };
}
/* the reviewer reads each kept match's plays into one accuracy apiece */
function accuracyOf(matches) {
  var out = [];
  matches.forEach(function (plays) {
    var moves = plays.map(function (p) {
      var rv = AI.review(p.view);
      return { best: rv.bestValue, played: AI.valueOf(rv, p.move) };
    });
    var a = Rating.gameAccuracy(moves);
    if (a !== null) out.push(a);
  });
  return out;
}
function gap(p) { p = Math.min(0.995, Math.max(0.005, p)); return -400 * Math.log10(1 / p - 1); }
function mean(xs) { return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null; }

function report(results) {
  results.sort(function (x, y) { return x.i - y.i; });
  var elo = [400], acc = {}, lines = [];
  results.forEach(function (r) {
    var p = r.wins / r.games, se = Math.sqrt(p * (1 - p) / r.games);
    var d = gap(p), lo = gap(p - 2 * se), hi = gap(p + 2 * se);
    elo[r.j] = elo[r.i] + d;
    lines.push({ r: r, p: p, d: d, pm: (hi - lo) / 2 });
    (acc[r.a] = acc[r.a] || []).push.apply(acc[r.a], r.accA);
    (acc[r.b] = acc[r.b] || []).push.apply(acc[r.b], r.accB);
  });
  var top = elo[elo.length - 1], scale = top > 1800 ? (1800 - 400) / (top - 400) : 1;
  console.log("\n  pair                          matches  won    score   gap");
  lines.forEach(function (x) {
    console.log("  " + (L[x.r.j].name + " – " + L[x.r.i].name).padEnd(30) + String(x.r.games).padStart(6) +
                String(x.r.wins).padStart(6) + (" " + (100 * x.p).toFixed(0) + "%").padStart(8) +
                ("  +" + x.d.toFixed(0) + " ±" + x.pm.toFixed(0)).padStart(12));
  });
  console.log("\n  scale ×" + scale.toFixed(3) + "\n\n  rung               rating  accuracy");
  for (var i = 0; i < elo.length; i++) {
    if (elo[i] === undefined) continue;
    var a = acc[L[i].id] || [];
    console.log("  " + L[i].name.padEnd(18) + String(Math.round(400 + (elo[i] - 400) * scale)).padStart(6) +
                (a.length ? (mean(a).toFixed(1) + "  (" + a.length + " matches)").padStart(20) : "".padStart(20)));
  }
}

if (flag("merge", null)) {
  var all = [];
  String(flag("merge")).split(",").forEach(function (f) { all = all.concat(JSON.parse(fs.readFileSync(f, "utf8"))); });
  report(all);
} else {
  var pairs = [];
  var want = flag("pairs", null);
  if (want && want !== true) String(want).split(",").forEach(function (s) { var p = s.split("-"); pairs.push([+p[0], +p[1]]); });
  else for (var i = 0; i + 1 < L.length; i++) pairs.push([i, i + 1]);
  var res = pairs.map(function (p) {
    var t0 = Date.now(), r = pair(p[0], p[1]);
    if (!flag("quiet", false)) console.log("  " + L[p[1]].name + " – " + L[p[0]].name + ": " + r.wins + "/" + r.games +
                                             "  (" + ((Date.now() - t0) / 1000).toFixed(0) + "s)");
    return r;
  });
  if (flag("json", null)) fs.writeFileSync(flag("json"), JSON.stringify(res));
  report(res);
}
