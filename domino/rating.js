/* rating.js — your dominó score, and the ladder it is measured on.

   The same idea as the chess room's rating.js, carried across a table:
   a person who plays a hundred matches deserves to know whether they are
   getting better, with a number that means the same thing next month as
   it does today. Three things make it honest, and they live together
   because none of them means anything without the other two:

     • THE LADDER. Eight parejas at the cantina, weakest to strongest,
       each a fixed recipe for the players in ai.js — whether they count,
       whether they play for their partner, how many imagined deals they
       play out, how much slack they allow themselves. A rung's rating is
       measured, not guessed: tools/calibrate.js plays every pair of
       neighbours seat-swapped from the same seeded deals and turns the
       scores into Elo gaps (CALIBRATION, below). Recipes count playouts,
       never milliseconds, so a rung plays the same on every phone.

     • THE SCORE. Glicko (Glickman, 1995), changed in one way a domino
       table needs: you do not play alone. Your partner is the rung's own
       player, so the match is your pareja — you and a player of rating
       R — against two players of R. A team is taken at the average of
       its two ratings, so your share of the difference is half, and the
       Glicko update carries that half through honestly: a match teaches
       the number half as much as a chess game would, which is right,
       because half of your side's play was not yours.

     • ACCURACY. Every play with a real choice is read by the reviewer in
       ai.js — the same imagined deals for every candidate — and scored
       by how much of your chance it kept. The match is a blend of a
       weighted mean and a harmonic mean, the way lichess and the chess
       room do it, and a calibrated table turns that into "you played like
       about 1100 today": a second opinion beside the result, never part
       of the score.

   Everything here is pure: no DOM, no storage of its own, no clock. The
   caller hands in a finished match and gets a new state back; the old one
   is never touched. Tested by tools/rating-check.js.                    */
(function (root) {
"use strict";

/* ---------- the ladder ----------
   Ordered weakest → strongest. The recipe is exactly what ai.js reads:

     counts    tracks the unseen bones and every paso, and builds the
               belief matrix — the single biggest step up the ladder
     partner   plays for two: feeds its partner, starves the other side,
               leaves a door for a partner about to go out
     rollouts  imagined deals played out per move (0 = heuristic only).
               A budget in playouts, the same on every machine
     noise     slack: a random term on every candidate's score, as a
               fraction of a typical swing. This is what makes a weak
               rung weak the way a person is — mostly sensible, sometimes
               loose — rather than random
     focus     how often the player actually uses all of that; the rest
               of the time it plays the bone that merely looks right

   Your partner is always the same rung as the pair you face. That is the
   only fair table: the one seat that differs is yours.

   CALIBRATION — tools/calibrate.js, seed 7. Every pair of neighbours
   played 300 matches to 100, each twice from the same seed with the
   parejas swapped (600 a pair), so the deals and the salida cancel out
   and only the play decides it:

     pair                           matches   won   score    gap
     Los Primos – Los Pollitos          600   386    64%   +102 ±30
     Los Taqueros – Los Primos          600   341    57%    +48 ±29
     Los Mariachis – Los Taqueros       600   330    55%    +35 ±29
     Los Compadres – Los Mariachis      600   351    59%    +60 ±29
     Los Licenciados – Los Compadres    600   341    57%    +48 ±29
     Los Viejos – Los Licenciados       600   340    57%    +47 ±29
     Los Cabrones – Los Viejos          600   386    64%   +102 ±30

   Every step clears its own two-standard-error bar, which is the whole
   point of a rung. (The first ladder did not: a pareja that played for
   each other with a lot of slack measured *level* with one that did
   not, and the step from not counting to counting was a cliff wider
   than the rest of the ladder put together. `focus` exists to fill it.)

   Stacked on an anchor of 400 the chain runs to 842. It is short, and
   that is the truth about dominoes rather than a flaw in the measuring:
   a match is seven or eight deals of twenty-eight bones you did not
   choose, and the best pair at the table still loses a third of their
   matches to the next pair down. The chess room has to shrink its chain
   because an engine never has an off day; this one is left exactly as
   measured, and the anchor is the one assumption.

   Accuracy, each rung's own plays read by the reviewer (ai.js), 16–32
   matches a rung:

     rung               rating   accuracy
     Los Pollitos          400     76.9
     Los Primos            502     79.1
     Los Taqueros          550     81.3
     Los Mariachis         585     84.0
     Los Compadres         645     84.9
     Los Licenciados       693     86.9
     Los Viejos            739     91.0
     Los Cabrones          842     94.1
   */
var LEVELS = [
  { id: "pollitos",   name: "Los Pollitos",   emoji: "🐣", elo: 400, accuracy: 76.9,
    blurb: "Just learned the rules. Plays whatever fits — and forgives you when you do the same.",
    counts: false, partner: false, rollouts: 0,    noise: 1.00, focus: 1 },
  { id: "primos",     name: "Los Primos",     emoji: "🧢", elo: 502, accuracy: 79.1,
    blurb: "Sheds the heavy bones and the mulas first. Not counting anything yet.",
    counts: false, partner: false, rollouts: 0,    noise: 0.35, focus: 1 },
  { id: "taqueros",   name: "Los Taqueros",   emoji: "🌮", elo: 550, accuracy: 81.3,
    blurb: "Know how to count, and do it now and then. When they remember, watch out.",
    counts: true,  partner: true,  rollouts: 0,    noise: 0.60, focus: 0.45 },
  { id: "mariachis",  name: "Los Mariachis",  emoji: "🎺", elo: 585, accuracy: 84.0,
    blurb: "Count most of the time and play for each other — with a loose bone now and then.",
    counts: true,  partner: true,  rollouts: 0,    noise: 0.60, focus: 0.70 },
  { id: "compadres",  name: "Los Compadres",  emoji: "🍺", elo: 645, accuracy: 84.9,
    blurb: "The regulars. Count every bone, hear every paso, look after each other.",
    counts: true,  partner: true,  rollouts: 0,    noise: 0.60, focus: 1 },
  { id: "licenciados", name: "Los Licenciados", emoji: "🎩", elo: 693, accuracy: 86.9,
    blurb: "Everything the regulars do, and they never slip.",
    counts: true,  partner: true,  rollouts: 0,    noise: 0.00, focus: 1 },
  { id: "viejos",     name: "Los Viejos",     emoji: "🦉", elo: 739, accuracy: 91.0,
    blurb: "Forty years at the same table. They play the hand out in their heads before every bone.",
    counts: true,  partner: true,  rollouts: 90,   noise: 0.00, focus: 1 },
  { id: "cabrones",   name: "Los Cabrones",   emoji: "🐍", elo: 842, accuracy: 94.1,
    blurb: "The pair who take your money. Think five times as hard as Los Viejos.",
    counts: true,  partner: true,  rollouts: 1200, noise: 0.00, focus: 1 }
];
LEVELS.forEach(function (L) { L.label = L.emoji + " " + L.name; });

function levelById(id) {
  for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
  return null;
}
function levelIndex(id) {
  for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return i;
  return -1;
}
/* what to hand AI.analyse for a rung — nothing the players do not read,
   so a rung and its calibration cannot drift apart */
function aiLevel(idOrLevel) {
  var L = typeof idOrLevel === "string" ? levelById(idOrLevel) : idOrLevel;
  if (!L) return null;
  return { id: L.id, label: L.name, counts: L.counts, partner: L.partner, rollouts: L.rollouts, noise: L.noise, focus: L.focus };
}
/* the four levels the room had before the ladder, so a saved choice
   still finds a seat at the table */
var OLD = { novato: "pollitos", compadre: "compadres", maestro: "viejos", cabron: "cabrones" };
function migrate(id) { return levelById(id) ? id : (OLD[id] || null); }

/* ---------- accuracy ----------
   A point of the hand is a poor unit on its own: giving away ten points
   when the hand is level matters far more than giving away ten when you
   are already sixty up. So, as in chess, a value is turned into a chance
   first and a play is judged by how much chance it gave away.

   The curve is a logistic over the reviewer's unit (points of the hand,
   with a win counted as its points plus twenty). K is set so a play that
   gives away a typical won hand's swing — about forty — costs about half
   the chance, which is how a table talks about it ("that one cost us the
   hand"). The accuracy curve over the chance is lichess's, unchanged. */
var K = 0.045, V_CAP = 120;
function winPct(v) {
  if (typeof v !== "number" || v !== v) return 50;
  if (v > V_CAP) v = V_CAP; else if (v < -V_CAP) v = -V_CAP;
  return 50 + 50 * (2 / (1 + Math.exp(-K * v)) - 1);
}
function moveAccuracy(best, played) {
  if (typeof best !== "number" || typeof played !== "number" || best !== best || played !== played) return null;
  var before = winPct(best), after = winPct(played);
  if (after >= before) return 100;
  var a = 103.1668 * Math.exp(-0.04354 * (before - after)) - 3.1669;
  return a < 0 ? 0 : (a > 100 ? 100 : a);
}
function stdev(xs) {
  var n = xs.length, m = 0, v = 0, i;
  if (n < 2) return 0;
  for (i = 0; i < n; i++) m += xs[i];
  m /= n;
  for (i = 0; i < n; i++) v += (xs[i] - m) * (xs[i] - m);
  return Math.sqrt(v / n);
}
/* moves: [{ best, played }] in reviewer units, your plays with a real
   choice only, in order. 0..100 to one decimal, or null with too little
   to judge — a forced play is never counted (praise for the only bone
   that fits says nothing), and fewer than eight real choices is not a
   match's worth of evidence. */
var ACCURACY_MIN_MOVES = 8;
function gameAccuracy(moves) {
  if (!moves || typeof moves.length !== "number") return null;
  var accs = [], wins = [], i, m, a;
  for (i = 0; i < moves.length && i < 4000; i++) {
    m = moves[i];
    if (!m || typeof m !== "object") continue;
    a = moveAccuracy(m.best, m.played);
    if (a === null) continue;
    accs.push(a); wins.push(winPct(m.best));
  }
  var n = accs.length;
  if (n < ACCURACY_MIN_MOVES) return null;
  var win = Math.max(2, Math.min(8, Math.floor(n / 10)));
  var wsum = 0, wacc = 0, inv = 0, w, lo;
  for (i = 0; i < n; i++) {
    lo = Math.max(0, Math.min(i - win + 1, n - win));
    w = stdev(wins.slice(lo, lo + win));
    w = w < 0.5 ? 0.5 : (w > 12 ? 12 : w);
    wsum += w; wacc += w * accs[i];
    inv += 1 / Math.max(1, accs[i]);
  }
  return Math.round((wacc / wsum + n / inv) / 2 * 10) / 10;
}
/* a play's verdict, in words — the bands sit on the same accuracy scale
   the match uses, so a run of "sharp" really is a high-accuracy match */
var VERDICTS = [
  { id: "sharp", min: 90, label: "Sharp",  icon: "★" },
  { id: "good",  min: 72, label: "Good",   icon: "✓" },
  { id: "ok",    min: 45, label: "Okay",   icon: "·" },
  { id: "miss",  min: 0,  label: "Costly", icon: "!" }
];
function verdict(acc) {
  for (var i = 0; i < VERDICTS.length; i++) if (acc >= VERDICTS[i].min) return VERDICTS[i];
  return VERDICTS[VERDICTS.length - 1];
}

/* ---------- accuracy → an estimated rating ----------
   Fitted by tools/calibrate.js from every rung's own plays read by the
   reviewer, paired with its measured rating and made monotone. Held to
   at most 300 above the rung the match was played against — a clean
   match against Los Pollitos says you are comfortably better than 400,
   not that you are a legend. (FIDE holds a performance rating the same
   way, and so does the chess room.) */
var PERF_MIN = 100, PERF_MAX = 1400, PERF_ABOVE = 300;
var PERF = [[0, 100]].concat(LEVELS.map(function (L) { return [L.accuracy, L.elo]; })).concat([[100, 1400]]);
(function monotone() {
  for (var i = 1; i < PERF.length; i++) {
    if (PERF[i][0] <= PERF[i - 1][0]) PERF[i][0] = PERF[i - 1][0] + 0.1;
    if (PERF[i][1] <= PERF[i - 1][1]) PERF[i][1] = PERF[i - 1][1] + 1;
  }
})();
function perfFromAccuracy(acc) {
  if (typeof acc !== "number" || acc !== acc) return null;
  if (acc <= PERF[0][0]) return PERF[0][1];
  for (var i = 1; i < PERF.length; i++) {
    if (acc <= PERF[i][0]) {
      var a = PERF[i - 1], b = PERF[i];
      return Math.round(a[1] + (b[1] - a[1]) * (acc - a[0]) / (b[0] - a[0]));
    }
  }
  return PERF[PERF.length - 1][1];
}
function gamePerf(acc, L) {
  var p = perfFromAccuracy(acc);
  if (p === null || !L) return p;
  return p > L.elo + PERF_ABOVE ? L.elo + PERF_ABOVE : p;
}

/* ---------- Glicko, for a pareja ---------- */
var Q = Math.LN10 / 400;
var START_R = 600, START_RD = 250;
var RD_MIN = 40, RD_MAX = 250;
var OPP_RD = 30;            /* the rungs' own measurement error: ±29 a step, above */
var PROVISIONAL_RD = 120;   /* shown as "~650?" until the deviation comes down to here */
var RD_GROWTH_PER_DAY = 100;
var R_FLOOR = 100, R_CEIL = 3000;
var MAX_STEP = 120;         /* the most one match can move the number */
var SHARE = 0.5;            /* your part of your pareja's rating */
var DAY = 86400000;

function gRD(rd) { return 1 / Math.sqrt(1 + 3 * Q * Q * rd * rd / (Math.PI * Math.PI)); }
/* The chance your pareja takes a match against a rung: your side is
   (you + a player of the rung's rating) / 2, theirs is the rung. */
function expected(r, rj, rdj) {
  var team = SHARE * r + (1 - SHARE) * rj;
  return 1 / (1 + Math.pow(10, -gRD(rdj == null ? OPP_RD : rdj) * (team - rj) / 400));
}

/* ---------- help, kindly ----------
   Hints are how this room teaches and they stay free. A match you were
   helped through still counts, for a little less: each hint keeps 92%
   of the match's weight, and no match falls below a quarter. The weight
   cuts both ways, so there is nothing to game. A short match says less
   than a long one, so a match to 50 counts for 0.6 of a match to 100. */
function assistWeight(assisted, target) {
  var h = 0;
  if (assisted && typeof assisted === "object") h = Math.floor(num(assisted.hints, 0, 0, 1000));
  var w = Math.pow(0.92, h);
  var t = num(target, 100, 50, 200);
  w *= Math.min(1, 0.2 + 0.8 * t / 100);
  return w < 0.25 ? 0.25 : w;
}

/* ---------- leaving early ----------
   Starting again is not a crime: a match left behind counts for nothing
   — unless it was already lost. After two hands, behind by more than
   half the target, a match left behind is the loss it already was. */
function abandonResult(info) {
  if (!info || typeof info !== "object") return null;
  var hands = num(info.hands, 0, 0, 1000), us = num(info.us, 0, 0, 10000), them = num(info.them, 0, 0, 10000);
  var target = num(info.target, 100, 1, 10000);
  if (hands < 2) return null;
  return (them - us) > target / 2 ? 0 : null;
}

/* ---------- titles ----------
   A cantina's words for a player, on the rating scale. */
var TITLES = [
  { floor: 0,    name: "Mirón",        emoji: "👀", blurb: "Watching from the next table — the best seat for learning." },
  { floor: 450,  name: "Novato",       emoji: "🌱", blurb: "Knows which end is which." },
  { floor: 550,  name: "Aprendiz",     emoji: "📘", blurb: "Counts the bones, most of the time." },
  { floor: 650,  name: "Jugador",      emoji: "🎲", blurb: "Hears every paso, and remembers it." },
  { floor: 750,  name: "Buena pareja", emoji: "🤝", blurb: "Plays for two." },
  { floor: 850,  name: "Tahúr",        emoji: "🃏", blurb: "Hangs people on purpose." },
  { floor: 950,  name: "Maestro",      emoji: "🎓", blurb: "The table goes quiet when you sit down." },
  { floor: 1100, name: "Leyenda",      emoji: "🏆", blurb: "Beats Los Cabrones more often than not. They tell stories about it." }
];
function titleIndex(r) {
  var i = 0;
  if (typeof r !== "number" || r !== r) return 0;
  while (i + 1 < TITLES.length && r >= TITLES[i + 1].floor) i++;
  return i;
}
function title(r) {
  var i = titleIndex(r), t = TITLES[i], n = TITLES[i + 1] || null;
  return { name: t.name, emoji: t.emoji, floor: t.floor, blurb: t.blurb,
           next: n ? { name: n.name, emoji: n.emoji, floor: n.floor } : null };
}

/* ---------- state ---------- */
var VERSION = 1, KEY = "dominotable.rating", HISTORY_MAX = 200;
var RESULTS = [0, 1];

function num(x, dflt, lo, hi) {
  if (typeof x !== "number" || x !== x) return dflt;
  return x < lo ? lo : (x > hi ? hi : x);
}
function round1(x) { return Math.round(x * 10) / 10; }

function fresh() {
  return { v: VERSION, r: START_R, rd: START_RD, games: 0, wins: 0, losses: 0,
           best: null, settled: false, reached: [], outgrown: [], vs: {}, stars: {}, lastAt: null, history: [] };
}
function isProvisional(rd) { return rd > PROVISIONAL_RD; }

/* Everything read from storage comes through here, field by field, into
   a brand-new object; nothing is ever copied wholesale. */
function clean(o) {
  var s = fresh();
  if (!o || typeof o !== "object" || Array.isArray(o)) return s;
  s.r = num(o.r, START_R, R_FLOOR, R_CEIL);
  s.rd = num(o.rd, START_RD, RD_MIN, RD_MAX);
  s.games = Math.floor(num(o.games, 0, 0, 1e7));
  s.wins = Math.floor(num(o.wins, 0, 0, s.games));
  s.losses = Math.floor(num(o.losses, 0, 0, s.games - s.wins));
  s.best = typeof o.best === "number" && o.best === o.best ? num(o.best, null, R_FLOOR, R_CEIL) : null;
  s.lastAt = typeof o.lastAt === "number" && isFinite(o.lastAt) && o.lastAt >= 0 ? o.lastAt : null;
  s.settled = o.settled === true;
  var i, x;
  if (Array.isArray(o.reached)) for (i = 0; i < TITLES.length; i++) if (o.reached.indexOf(TITLES[i].floor) >= 0) s.reached.push(TITLES[i].floor);
  if (Array.isArray(o.outgrown)) for (i = 0; i < LEVELS.length; i++) if (o.outgrown.indexOf(LEVELS[i].id) >= 0) s.outgrown.push(LEVELS[i].id);
  for (i = 0; i < LEVELS.length; i++) {
    var id = LEVELS[i].id;
    x = o.vs && typeof o.vs === "object" && Object.prototype.hasOwnProperty.call(o.vs, id) ? o.vs[id] : null;
    if (Array.isArray(x) && x.length === 2) s.vs[id] = [Math.floor(num(x[0], 0, 0, 1e7)), Math.floor(num(x[1], 0, 0, 1e7))];
    x = o.stars && typeof o.stars === "object" && Object.prototype.hasOwnProperty.call(o.stars, id) ? o.stars[id] : null;
    if (Array.isArray(x) && x.length === 3) s.stars[id] = [x[0] ? 1 : 0, x[1] ? 1 : 0, x[2] ? 1 : 0];
  }
  if (Array.isArray(o.history)) {
    var h = o.history.slice(-HISTORY_MAX);
    for (i = 0; i < h.length; i++) { var e = cleanEntry(h[i]); if (e) s.history.push(e); }
  }
  return s;
}
function cleanEntry(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  if (!levelById(e.level) || RESULTS.indexOf(e.result) < 0) return null;
  return {
    at: typeof e.at === "number" && isFinite(e.at) && e.at >= 0 ? e.at : null,
    r: round1(num(e.r, START_R, R_FLOOR, R_CEIL)),
    rd: round1(num(e.rd, START_RD, RD_MIN, RD_MAX)),
    delta: round1(num(e.delta, 0, -R_CEIL, R_CEIL)),
    level: e.level, result: e.result,
    acc: typeof e.acc === "number" && e.acc === e.acc ? round1(num(e.acc, null, 0, 100)) : null,
    perf: typeof e.perf === "number" && e.perf === e.perf ? Math.round(num(e.perf, null, PERF_MIN, PERF_MAX)) : null,
    hints: Math.floor(num(e.hints, 0, 0, 1000))
  };
}
function load(getItem) {
  var raw = null;
  try { raw = getItem(KEY); } catch (e) { return fresh(); }
  if (typeof raw !== "string" || raw.length > 400000) return fresh();
  try { return clean(JSON.parse(raw)); } catch (e) { return fresh(); }
}
function save(state, setItem) {
  try { return setItem(KEY, JSON.stringify(clean(state))) !== false; } catch (e) { return false; }
}

/* ---------- one match ----------
   game: { level, result (1 won · 0 lost), at, accuracy, assisted: {hints}, target } */
var OUTGROW = 200;     /* your pareja then expects to win about 64% */
var STAR_ACC = 80;
function update(state, game) {
  var s = clean(state);
  var g = game && typeof game === "object" ? game : {};
  var L = levelById(g.level);
  var result = RESULTS.indexOf(g.result) >= 0 ? g.result : null;
  var before = Math.round(s.r);
  if (!L || result === null) {
    var p0 = isProvisional(s.rd);
    return { state: s, rated: false, before: before, after: before, delta: 0, rd: Math.round(s.rd),
             provisional: p0, wasProvisional: p0, expected: null, weight: 0, accuracy: null,
             perf: null, milestone: null, levelUp: null, next: null, newStars: [] };
  }
  var at = typeof g.at === "number" && isFinite(g.at) && g.at >= 0 ? g.at : s.lastAt;
  var wasProvisional = isProvisional(s.rd);
  var rd = s.rd;
  if (at !== null && s.lastAt !== null && at > s.lastAt) {
    rd = Math.min(RD_MAX, Math.sqrt(rd * rd + RD_GROWTH_PER_DAY * (at - s.lastAt) / DAY));
  }

  /* Glicko with your share of the team carried through: E depends on you
     through SHARE·r, so every place r's influence appears it is SHARE
     times what it would be alone */
  var w = assistWeight(g.assisted, g.target);
  var gg = gRD(OPP_RD) * SHARE, E = expected(s.r, L.elo, OPP_RD);
  var info = w * Q * Q * gg * gg * E * (1 - E);
  var denom = 1 / (rd * rd) + info;
  var step = (Q / denom) * w * gg * (result - E);
  if (step > MAX_STEP) step = MAX_STEP; else if (step < -MAX_STEP) step = -MAX_STEP;
  var r0 = s.r, r1 = num(r0 + step, START_R, R_FLOOR, R_CEIL);
  var rd1 = num(Math.sqrt(1 / denom), START_RD, RD_MIN, RD_MAX);
  s.r = r1; s.rd = rd1;
  if (at !== null && (s.lastAt === null || at > s.lastAt)) s.lastAt = at;
  s.games++;
  if (result === 1) s.wins++; else s.losses++;
  var rec = s.vs[L.id] || [0, 0];
  s.vs[L.id] = [rec[0] + (result === 1 ? 1 : 0), rec[1] + (result === 0 ? 1 : 0)];

  var acc = typeof g.accuracy === "number" && g.accuracy === g.accuracy ? round1(num(g.accuracy, 0, 0, 100)) : null;
  var perf = acc === null ? null : gamePerf(acc, L);
  var hints = g.assisted && typeof g.assisted === "object" ? Math.floor(num(g.assisted.hints, 0, 0, 1000)) : 0;
  var after = Math.round(r1);
  s.history.push({ at: at, r: round1(r1), rd: round1(rd1), delta: round1(r1 - r0), level: L.id,
                   result: result, acc: acc, perf: perf, hints: hints });
  if (s.history.length > HISTORY_MAX) s.history = s.history.slice(-HISTORY_MAX);

  /* three stars on every rung, the way the chess room's coaches carry
     them: ★ win; ★ win without a hint; ★ win without a hint at 80%. The
     third is the one a lucky deal cannot hand you. */
  var st = s.stars[L.id] || [0, 0, 0], newStars = [];
  if (result === 1) {
    if (!st[0]) { st[0] = 1; newStars.push(0); }
    if (!hints && !st[1]) { st[1] = 1; newStars.push(1); }
    if (!hints && acc !== null && acc >= STAR_ACC && !st[2]) { st[2] = 1; newStars.push(2); }
  }
  s.stars[L.id] = st;

  /* milestones, each said once — nothing while the score is provisional */
  var provisional = isProvisional(rd1), milestone = null;
  if (!provisional) {
    var ti = titleIndex(r1), t = TITLES[ti];
    var newTitle = s.reached.indexOf(t.floor) < 0;
    for (var k = 0; k <= ti; k++) if (s.reached.indexOf(TITLES[k].floor) < 0) s.reached.push(TITLES[k].floor);
    s.reached.sort(function (a, b) { return a - b; });
    if (!s.settled) { s.settled = true; milestone = { kind: "settled", name: t.name, emoji: t.emoji, rating: after }; }
    else if (newTitle) milestone = { kind: "title", name: t.name, emoji: t.emoji, rating: after };
    else if (s.best !== null && r1 > s.best && Math.floor(r1 / 50) > Math.floor(s.best / 50)) {
      milestone = { kind: "best", name: "New personal best", emoji: "⭐", rating: after };
    }
    if (s.best === null || r1 > s.best) s.best = round1(r1);
  }

  /* outgrowing a rung: beaten it twice in your last three meetings, and
     sitting far enough above it to expect to win most matches */
  var levelUp = null, idx = levelIndex(L.id);
  if (result === 1 && idx < LEVELS.length - 1 && s.outgrown.indexOf(L.id) < 0 && r1 >= L.elo + OUTGROW) {
    var met = 0, won = 0;
    for (var j = s.history.length - 1; j >= 0 && met < 3; j--) {
      if (s.history[j].level !== L.id) continue;
      met++; if (s.history[j].result === 1) won++;
    }
    if (won >= 2) { levelUp = L.id; s.outgrown.push(L.id); }
  }

  return { state: s, rated: true, before: before, after: after, delta: after - before, rd: Math.round(rd1),
           provisional: provisional, wasProvisional: wasProvisional, expected: E, weight: w, accuracy: acc,
           perf: perf, milestone: milestone, levelUp: levelUp, next: levelUp ? LEVELS[idx + 1].id : null,
           newStars: newStars };
}

/* ---------- what to show ---------- */
function display(stateOrR, rd) {
  var r = stateOrR, d = rd;
  if (stateOrR && typeof stateOrR === "object") { r = stateOrR.r; d = stateOrR.rd; }
  r = Math.round(num(r, START_R, R_FLOOR, R_CEIL));
  d = num(d, START_RD, RD_MIN, RD_MAX);
  return isProvisional(d) ? "~" + r + "?" : String(r);
}
/* The rung that gives a fair fight: the one nearest your score, a step
   gentler while it is provisional, because a first win teaches more
   than a first even match. */
var GENTLE = 100;
function suggestLevel(state) {
  var o = state && typeof state === "object" ? state : {};
  var r = num(o.r, START_R, R_FLOOR, R_CEIL), rd = num(o.rd, START_RD, RD_MIN, RD_MAX);
  var target = r - (isProvisional(rd) ? GENTLE : 0);
  var best = LEVELS[0], gap = Infinity;
  for (var i = 0; i < LEVELS.length; i++) {
    var d = Math.abs(LEVELS[i].elo - target);
    if (d < gap) { gap = d; best = LEVELS[i]; }
  }
  return best.id;
}
function starCount(state, id) {
  var st = state && state.stars && state.stars[id];
  return st ? st[0] + st[1] + st[2] : 0;
}
function summary(state) {
  var s = clean(state), h = s.history, i;
  var streak = { result: null, n: 0 };
  for (i = h.length - 1; i >= 0; i--) {
    if (streak.result === null) { streak.result = h[i].result; streak.n = 1; }
    else if (h[i].result === streak.result) streak.n++;
    else break;
  }
  var accs = [];
  for (i = h.length - 1; i >= 0 && accs.length < 10; i--) if (h[i].acc !== null) accs.push(h[i].acc);
  var stars = 0;
  for (i = 0; i < LEVELS.length; i++) stars += starCount(s, LEVELS[i].id);
  return {
    rating: Math.round(s.r), rd: Math.round(s.rd), provisional: isProvisional(s.rd), display: display(s),
    title: title(s.r), games: s.games, wins: s.wins, losses: s.losses,
    best: s.best === null ? null : Math.round(s.best),
    streak: { kind: streak.result === 1 ? "win" : (streak.result === 0 ? "loss" : null), n: streak.n },
    recentAccuracy: accs.length ? round1(accs.reduce(function (a, b) { return a + b; }, 0) / accs.length) : null,
    suggested: suggestLevel(s), stars: stars, maxStars: LEVELS.length * 3,
    history: h.slice(-HISTORY_MAX)
  };
}

var Rating = {
  VERSION: VERSION, KEY: KEY, LEVELS: LEVELS, TITLES: TITLES, PERF: PERF, VERDICTS: VERDICTS,
  START_R: START_R, START_RD: START_RD, OPP_RD: OPP_RD, PROVISIONAL_RD: PROVISIONAL_RD, SHARE: SHARE,
  ACCURACY_MIN_MOVES: ACCURACY_MIN_MOVES, PERF_ABOVE: PERF_ABOVE, MAX_STEP: MAX_STEP, STAR_ACC: STAR_ACC,
  levelById: levelById, levelIndex: levelIndex, aiLevel: aiLevel, migrate: migrate,
  winPct: winPct, moveAccuracy: moveAccuracy, gameAccuracy: gameAccuracy, verdict: verdict,
  perfFromAccuracy: perfFromAccuracy, gamePerf: gamePerf,
  expected: expected, assistWeight: assistWeight, abandonResult: abandonResult,
  fresh: fresh, load: load, save: save, clean: clean, update: update,
  title: title, display: display, suggestLevel: suggestLevel, starCount: starCount, summary: summary
};
if (typeof module !== "undefined" && module.exports) module.exports = Rating;
else root.Rating = Rating;
})(typeof self !== "undefined" ? self : this);
