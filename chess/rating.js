/* rating.js — the chess ability score, and the ladder it is measured on.

   A person who plays the coach a hundred times deserves to know whether
   they are getting better. Not a pat on the head — a number that means
   the same thing next month as it does today, on the same scale every
   chess site and every club already uses, so that "about 900" is a
   sentence they can carry out of this room.

   Three things make that number honest, and they live here together
   because none of them means anything without the other two:

     • THE LADDER. Eight coaches, weakest to strongest, each a fixed recipe
       for the engine (how deep, how many positions, how much slack it
       allows itself). A rung's rating is not a guess: tools/calibrate.js
       plays every rung against its neighbours from the same openings
       with the colours swapped, turns the scores into Elo gaps, and
       pins the chain at both ends (below, under CALIBRATION, says how
       and why). The recipes count nodes and plies, not milliseconds, so
       a rung plays the same game on a phone as on a laptop — a coach
       whose strength depended on your hardware could not carry a
       rating at all.

     • THE SCORE. Glicko (Glickman, 1995): a rating and a "rating
       deviation" that says how sure we are of it. A newcomer's number
       moves fast because we know little; a regular's moves slowly
       because one game should not undo fifty. The opponent is the rung's
       measured rating, held with a small, fixed uncertainty of its own.

     • ACCURACY. The way modern sites show it: every move scored as how
       much of your winning chance it kept, then the game as a blend of
       a weighted mean (critical moments count more) and a harmonic mean
       (one blunder is not averaged away). A calibrated table turns that
       into "you played like about 1100 today" — a second opinion beside
       the result, never a replacement for it.

   Everything here is pure: no DOM, no storage of its own, no clock. The
   caller hands in when a game ended and gets a new state back; the old
   one is never touched. Tested by chess/tools/rating-check.js. */
(function (root) {
"use strict";

/* ---------- the ladder ----------
   Ordered weakest → strongest. The ids sprout, club and mentor are older
   than this file and saved games still name them, so they stay (club
   and mentor now answer to Fern and Oak); the five new rungs fill the
   gaps a growing player would otherwise have to jump. Three of them sit
   between Fern and Oak because that is where the ladder is steepest:
   the old jump from club to mentor was the size of the whole bottom
   half of the ladder put together, and a rung nobody can climb to is
   not a rung.

   The engine recipe:
     maxDepth  how many plies the coach reads before it chooses
     nodes     how many positions it may look at, in all — the budget
               that makes a rung the same on every machine
     noise     centipawns of slack: the coach chooses, weighted toward
               the better end, among moves within this much of its best.
               This is what makes a weak rung weak in the way a person
               is weak — mostly sensible, sometimes loose — rather than
               random
     ms        a ceiling on thinking time, set well above what the nodes
               need, so it only binds on a very slow device (where the
               rung plays a little below its rating rather than making
               the player wait)
     rankDepth how deep the slack's candidates are read, where that is
               shallower than the search (Oak only: reading every move
               as deeply as Oak reads its best one would cost more than
               its whole budget, and ten centipawns of slack only needs
               to tell near-equals apart)

   CALIBRATION — tools/calibrate.js, seed 7: neighbours played from
   sound six- and eight-ply lines out of the lichess opening table, each
   opening twice with the colours swapped, the clock frozen and the dice
   seeded, adjudicated once both searches agree for ten plies that one
   side is ten pawns up.

     pair              games  score         self-play gap   on the ladder
     Sprout – Acorn       32   28      88%   +338 ±87      +176
     Clover – Sprout      32   27½     86%   +314 ±87      +164
     Fern – Clover        32   28      88%   +338 ±80      +176
     Bamboo – Fern        32   29      91%   +394 ±85      +205
     Cactus – Bamboo      24   22½     94%   +470 ±136     +245
     Pine – Cactus        32   28½     89%   +364 ±77      +190
     Oak – Pine           24   22½     94%   +470 ±136     +245

   Stacked, those gaps make a chain 2690 points long from Acorn to Oak.
   Stacked raw on an anchor of 400 they would put Oak at 3090, far above
   where an engine of this kind — tens of thousands of positions a move,
   no opening book — is found against people. Self-play exaggerates: an
   engine never has an off day, so it collects its whole edge in every
   game, and the gap a person would feel is smaller. So the chain is
   pinned at both ends instead. Acorn is 400, a person who has just
   learned how the pieces move (it leaves pieces hanging, and walks
   straight past most of the ones you leave). Oak is 1800, the cautious
   end of where engines like it are found against people. Every gap
   between is scaled by the same ×0.520. The spacing is measured; the
   scale is the one assumption, and it is written down here so it can
   be argued with.

   Accuracy, each rung's moves read by a depth-5 reviewer (the same
   comparison as Chess.review), 6 games a rung:

     rung     rating   accuracy
     Acorn      400     66.3   (sd 10.1 over 6 games, 279 moves)
     Sprout     580     70.9   (sd  7.3 over 6 games, 451 moves)
     Clover     740     75.8   (sd  5.0 over 6 games, 195 moves)
     Fern       920     84.0   (sd  7.1 over 6 games, 177 moves)
     Bamboo    1120     85.2   (sd  4.7 over 6 games, 241 moves)
     Cactus    1370     91.6   (sd  2.2 over 6 games, 281 moves)
     Pine      1560     94.6   (sd  1.8 over 6 games, 390 moves)
     Oak       1800     97.8   (sd  1.4 over 6 games, 262 moves)
   */
var LEVELS = [
  { id: "acorn",   name: "Acorn",   emoji: "🌰", elo: 400, accuracy: 66.3,
    blurb: "Knows how the pieces move, and not much else yet. Leaves pieces hanging — and forgives you when you do.",
    ms: 1500, maxDepth: 1,  noise: 400, nodes: 30000 },
  { id: "sprout",  name: "Sprout",  emoji: "🌱", elo: 580, accuracy: 70.9,
    blurb: "Learning together. Takes what you leave lying about, and sometimes forgets to look after its own.",
    ms: 1500, maxDepth: 2,  noise: 300, nodes: 30000 },
  { id: "clover",  name: "Clover",  emoji: "🍀", elo: 740, accuracy: 75.8,
    blurb: "Has found the tricks, and still trusts to luck now and then. A good first real opponent.",
    ms: 1500, maxDepth: 2,  noise: 190, nodes: 30000 },
  { id: "club",    name: "Fern",    emoji: "🌿", elo: 920, accuracy: 84.0,
    blurb: "A fair fight for a casual player: few gifts, and it notices yours.",
    ms: 1500, maxDepth: 2,  noise: 130, nodes: 30000 },
  { id: "bamboo",  name: "Bamboo",  emoji: "🎋", elo: 1120, accuracy: 85.2,
    blurb: "Reads a move further than Fern, and bends rather than breaks. Loose pieces do not stay loose for long.",
    ms: 2500, maxDepth: 3,  noise: 130, nodes: 150000 },
  { id: "cactus",  name: "Cactus",  emoji: "🌵", elo: 1370, accuracy: 91.6,
    blurb: "Plays like a club regular: prickly, hard to get hold of, and quick to punish a careless hand.",
    ms: 2500, maxDepth: 3,  noise: 70,  nodes: 150000 },
  { id: "pine",    name: "Pine",    emoji: "🌲", elo: 1560, accuracy: 94.6,
    blurb: "Calculates cleanly and rarely lets an advantage go. Bring a plan.",
    ms: 2500, maxDepth: 4,  noise: 55,  nodes: 200000 },
  { id: "mentor",  name: "Oak",     emoji: "🌳", elo: 1800, accuracy: 97.8,
    blurb: "The whole engine, with only enough slack to vary its play. Bring your best — and keep the notebook open.",
    ms: 3000, maxDepth: 64, noise: 10,  nodes: 80000, rankDepth: 4 }
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
/* exactly what to hand Brain.search for a rung — nothing the engine
   does not read, so a level and its calibration cannot drift apart */
function searchOpts(idOrLevel) {
  var L = typeof idOrLevel === "string" ? levelById(idOrLevel) : idOrLevel;
  if (!L) return null;
  var o = { ms: L.ms, maxDepth: L.maxDepth, noise: L.noise, nodes: L.nodes };
  if (L.rankDepth) o.rankDepth = L.rankDepth;
  return o;
}

/* ---------- accuracy ----------
   A centipawn is a poor unit for a person: losing a pawn when the game
   is level matters enormously, losing one when you are a rook up barely
   matters at all. So scores are turned into a winning chance first —
   lichess's logistic, fitted to millions of real games — and a move is
   judged by how much of that chance it gave away.

   The engine writes a forced mate as ±(100000 − plies to mate). Those
   are not centipawns and would blow the curve apart, so mates and huge
   scores alike are held at ±1000, where the winning chance is already
   97.5%: missing a mate while staying a queen up costs you very little,
   walking into one costs you nearly everything. */
var CP_CAP = 1000;
function clampCp(cp) {
  if (typeof cp !== "number" || cp !== cp) return null;
  if (cp > CP_CAP) return CP_CAP;          /* includes mates and Infinity */
  if (cp < -CP_CAP) return -CP_CAP;
  return cp;
}
function winPct(cp) {
  var c = clampCp(cp);
  if (c === null) return 50;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}
/* both scores from the mover's point of view, as Chess.review gives them */
function moveAccuracy(bestCp, playedCp) {
  if (clampCp(bestCp) === null || clampCp(playedCp) === null) return null;
  var before = winPct(bestCp), after = winPct(playedCp);
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
/* moves: [{ best, played }] in centipawns, the player's moves only, in
   order. Returns 0..100 to one decimal, or null with nothing to judge.

   Two means, averaged, the way lichess does it. The weighted mean counts
   a move by how turbulent the game was around it — the standard
   deviation of the winning chances in a small window — because a quiet
   move in a quiet position says less about you than one made while the
   game was swinging. The harmonic mean is there so a single blunder
   cannot be averaged away by thirty easy recaptures. */
function gameAccuracy(moves) {
  if (!moves || typeof moves.length !== "number") return null;
  var accs = [], wins = [], i, m, a;
  for (i = 0; i < moves.length && i < 2000; i++) {
    m = moves[i];
    if (!m || typeof m !== "object") continue;
    a = moveAccuracy(m.best, m.played);
    if (a === null) continue;
    accs.push(a); wins.push(winPct(m.best));
  }
  var n = accs.length;
  if (!n) return null;
  var win = Math.max(2, Math.min(8, Math.floor(n / 10)));
  var wsum = 0, wacc = 0, inv = 0, w, lo;
  for (i = 0; i < n; i++) {
    lo = Math.max(0, Math.min(i - win + 1, n - win));
    w = stdev(wins.slice(lo, lo + win));
    w = w < 0.5 ? 0.5 : (w > 12 ? 12 : w);
    wsum += w; wacc += w * accs[i];
    inv += 1 / Math.max(1, accs[i]);
  }
  var out = (wacc / wsum + n / inv) / 2;
  return Math.round(out * 10) / 10;
}

/* ---------- accuracy → an estimated rating ----------
   Fitted in tools/calibrate.js: every rung's moves were reviewed by a
   fixed-depth reviewer (the same comparison the coach's notebook runs),
   each rung's mean game accuracy was paired with its measured rating,
   and the points were made monotone. The ends are held: no single game,
   however clean or however wild, is read as more than the table can
   honestly say. */
var PERF_MIN = 100, PERF_MAX = 2400;
/* the depth the table was fitted at: the app's accuracy review should
   read moves at this depth too, or it is measuring with another ruler */
var REVIEW_DEPTH = 5;
var PERF = [[0, 100], [66.3, 400], [70.9, 580], [75.8, 740], [84, 920], [85.2, 1120], [91.6, 1370], [94.6, 1560], [97.8, 1800], [100, 2400]];
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

/* ---------- Glicko ---------- */
var Q = Math.LN10 / 400;
var START_R = 800, START_RD = 350;
var RD_MIN = 50, RD_MAX = 350;
/* The coach's rating is measured, not perfect: the calibration's own
   error bars are roughly this wide, and saying so keeps one surprising
   result against it from counting for more than it should. */
var OPP_RD = 60;
/* Provisional until the deviation comes down to here — about the first
   five or six games — shown as "~850?" until then. */
var PROVISIONAL_RD = 150;
/* Time away makes us less sure, not less kind: the deviation grows back
   by this much variance a day, so a month off brings back about half a
   provisional's wobble and a long absence is a fresh start in all but
   the history. */
var RD_GROWTH_PER_DAY = 100;
var R_FLOOR = 100, R_CEIL = 3000;
var DAY = 86400000;

function gRD(rd) { return 1 / Math.sqrt(1 + 3 * Q * Q * rd * rd / (Math.PI * Math.PI)); }
/* the score r is expected to take off an opponent rated rj ± rdj */
function expected(r, rj, rdj) {
  return 1 / (1 + Math.pow(10, -gRD(rdj == null ? OPP_RD : rdj) * (r - rj) / 400));
}

/* ---------- help, kindly ----------
   The room hands out take-backs and hints freely and should keep doing
   so: learning with a hand on your shoulder is still learning. But a
   game you were helped through says less about what you can do alone,
   so it counts for less — never nothing. Each take-back keeps 80% of
   the game's weight, each hint 90%, and no game falls below a quarter.
   The weight scales how much the game teaches the rating (it is played
   as that fraction of a game), so a helped win lifts you a little, and
   a helped loss costs you a little: the same in both directions. */
function assistWeight(assisted) {
  var t = 0, h = 0;
  if (assisted && typeof assisted === "object") {
    t = num(assisted.takebacks, 0, 0, 1000);
    h = num(assisted.hints, 0, 0, 1000);
  }
  var w = Math.pow(0.8, t) * Math.pow(0.9, h);
  return w < 0.25 ? 0.25 : w;
}

/* ---------- leaving early ----------
   Resigning is a loss; that one is easy. Walking away is harder. A new
   game started over a game that was still a game — or one barely begun —
   counts for nothing: starting again is not a crime, and nobody should
   have to finish a game they did not enjoy. But leaving a game that was
   already lost is resigning it, and if it counted for nothing the score
   would quietly reward never losing. So: after ten moves each, three
   pawns down or facing mate, a game left behind is scored as the loss
   it already was. The caller supplies the evaluation from the player's
   side (the coach's last search score, negated) — returns 0 to record a
   loss, or null to record nothing. */
var ABANDON_PLIES = 20, ABANDON_CP = -300;
function abandonResult(info) {
  if (!info || typeof info !== "object") return null;
  var plies = num(info.plies, 0, 0, 10000);
  var ev = typeof info.eval === "number" && info.eval === info.eval ? info.eval : null;
  if (plies < ABANDON_PLIES || ev === null) return null;
  return ev <= ABANDON_CP ? 0 : null;
}

/* ---------- titles ----------
   Names a person would recognise from a club noticeboard, on the scale
   every site uses, and none of them flattering beyond what the number
   says. The glyphs climb the pieces in value; the hollow pawn is a
   player still being filled in. (U+FE0E asks for the plain chess glyph
   rather than an emoji, so the set looks like one set everywhere.) */
var T = "\uFE0E";
var TITLES = [
  { floor: 0,    name: "Newcomer",           emoji: "♙" + T, blurb: "Learning how the pieces move — the best part." },
  { floor: 600,  name: "Improver",           emoji: "♟" + T, blurb: "The pieces make sense now; the plans are coming." },
  { floor: 900,  name: "Casual player",      emoji: "♞" + T, blurb: "You'd hold your own across a café table." },
  { floor: 1200, name: "Club player",        emoji: "♝" + T, blurb: "The strength of a regular at a chess club." },
  { floor: 1500, name: "Strong club player", emoji: "♜" + T, blurb: "The player the club regulars want to beat." },
  { floor: 1800, name: "Advanced",           emoji: "♛" + T, blurb: "Tournament strength. Few casual players will trouble you." },
  { floor: 2000, name: "Expert",             emoji: "♚" + T, blurb: "Expert, on the scale national federations use." }
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
var VERSION = 1, KEY = "chessroom_rating", HISTORY_MAX = 200;
var RESULTS = [0, 0.5, 1];

/* a number, or the fallback, held inside [lo, hi] */
function num(x, dflt, lo, hi) {
  if (typeof x !== "number" || x !== x) return dflt;
  return x < lo ? lo : (x > hi ? hi : x);
}
function round1(x) { return Math.round(x * 10) / 10; }

function fresh() {
  return { v: VERSION, r: START_R, rd: START_RD, games: 0, wins: 0, draws: 0, losses: 0,
           best: null, settled: false, reached: [], outgrown: [], vs: {}, lastAt: null, history: [] };
}
function isProvisional(rd) { return rd > PROVISIONAL_RD; }

/* Everything read from storage goes through here, field by field, into
   a brand-new object: strings where numbers belong, numbers out of
   range, unknown rungs, a history ten thousand entries long, keys like
   __proto__ — each one is dropped or clamped, and nothing is ever
   copied wholesale. A state that went through clean() can be trusted by
   the code that draws it. */
function clean(o) {
  var s = fresh();
  if (!o || typeof o !== "object" || Array.isArray(o)) return s;
  /* the shape before there was a version: { rating, rd|dev, games } */
  var legacy = typeof o.v !== "number";
  s.r = num(legacy && typeof o.r !== "number" ? o.rating : o.r, START_R, R_FLOOR, R_CEIL);
  s.rd = num(legacy && typeof o.rd !== "number" ? o.dev : o.rd, START_RD, RD_MIN, RD_MAX);
  s.games = Math.floor(num(o.games, 0, 0, 1e7));
  s.wins = Math.floor(num(o.wins, 0, 0, s.games));
  s.draws = Math.floor(num(o.draws, 0, 0, s.games - s.wins));
  s.losses = Math.floor(num(o.losses, 0, 0, s.games - s.wins - s.draws));
  s.best = typeof o.best === "number" && o.best === o.best ? num(o.best, null, R_FLOOR, R_CEIL) : null;
  s.lastAt = typeof o.lastAt === "number" && isFinite(o.lastAt) && o.lastAt >= 0 ? o.lastAt : null;
  /* a score carried over from before there was a "settled" flag, and
     already sure of itself, has settled — saying so again would be news
     to nobody */
  s.settled = o.settled === true || (legacy && !isProvisional(s.rd) && s.games > 0);
  var i, x;
  if (Array.isArray(o.reached)) {
    for (i = 0; i < TITLES.length; i++) {
      if (o.reached.indexOf(TITLES[i].floor) >= 0) s.reached.push(TITLES[i].floor);
    }
  }
  if (Array.isArray(o.outgrown)) {
    for (i = 0; i < LEVELS.length; i++) {
      if (o.outgrown.indexOf(LEVELS[i].id) >= 0) s.outgrown.push(LEVELS[i].id);
    }
  }
  if (o.vs && typeof o.vs === "object" && !Array.isArray(o.vs)) {
    for (i = 0; i < LEVELS.length; i++) {
      x = Object.prototype.hasOwnProperty.call(o.vs, LEVELS[i].id) ? o.vs[LEVELS[i].id] : null;
      if (Array.isArray(x) && x.length === 3) {
        s.vs[LEVELS[i].id] = [Math.floor(num(x[0], 0, 0, 1e7)), Math.floor(num(x[1], 0, 0, 1e7)),
                              Math.floor(num(x[2], 0, 0, 1e7))];
      }
    }
  }
  if (Array.isArray(o.history)) {
    var h = o.history.slice(-HISTORY_MAX);
    for (i = 0; i < h.length; i++) {
      var e = cleanEntry(h[i]);
      if (e) s.history.push(e);
    }
  }
  return s;
}
function cleanEntry(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  if (!levelById(e.level) || RESULTS.indexOf(e.result) < 0) return null;
  var out = {
    at: typeof e.at === "number" && isFinite(e.at) && e.at >= 0 ? e.at : null,
    r: round1(num(e.r, START_R, R_FLOOR, R_CEIL)),
    rd: round1(num(e.rd, START_RD, RD_MIN, RD_MAX)),
    delta: round1(num(e.delta, 0, -R_CEIL, R_CEIL)),
    level: e.level,
    result: e.result,
    acc: typeof e.acc === "number" && e.acc === e.acc ? round1(num(e.acc, null, 0, 100)) : null,
    perf: typeof e.perf === "number" && e.perf === e.perf ? Math.round(num(e.perf, null, PERF_MIN, PERF_MAX)) : null,
    assisted: null
  };
  if (e.assisted && typeof e.assisted === "object") {
    var t = Math.floor(num(e.assisted.takebacks, 0, 0, 1000)), hh = Math.floor(num(e.assisted.hints, 0, 0, 1000));
    if (t || hh) out.assisted = { takebacks: t, hints: hh };
  }
  return out;
}

function load(getItem) {
  var raw = null;
  try { raw = getItem(KEY); } catch (e) { return fresh(); }
  if (typeof raw !== "string" || raw.length > 400000) return fresh();
  try { return clean(JSON.parse(raw)); } catch (e) { return fresh(); }
}
function save(state, setItem) {
  try { setItem(KEY, JSON.stringify(clean(state))); return true; } catch (e) { return false; }
}

/* ---------- one game ---------- */
var OUTGROW = 200;      /* expect to win three games in four */
function update(state, game) {
  var s = clean(state);
  var g = game && typeof game === "object" ? game : {};
  var L = levelById(g.level);
  var result = RESULTS.indexOf(g.result) >= 0 ? g.result : null;
  var before = Math.round(s.r);
  if (!L || result === null) {
    /* nothing rateable happened: the state comes back as it was */
    return { state: s, rated: false, before: before, after: before, delta: 0, rd: s.rd,
             provisional: isProvisional(s.rd), perf: null, milestone: null, levelUp: null };
  }
  var at = typeof g.at === "number" && isFinite(g.at) && g.at >= 0 ? g.at : s.lastAt;
  var wasProvisional = isProvisional(s.rd);

  /* time away widens the deviation before the game is counted */
  var rd = s.rd;
  if (at !== null && s.lastAt !== null && at > s.lastAt) {
    rd = Math.min(RD_MAX, Math.sqrt(rd * rd + RD_GROWTH_PER_DAY * (at - s.lastAt) / DAY));
  }

  var w = assistWeight(g.assisted);
  var gg = gRD(OPP_RD), E = expected(s.r, L.elo, OPP_RD);
  var info = w * Q * Q * gg * gg * E * (1 - E);
  var denom = 1 / (rd * rd) + info;
  var r0 = s.r;
  var r1 = num(r0 + (Q / denom) * w * gg * (result - E), START_R, R_FLOOR, R_CEIL);
  var rd1 = num(Math.sqrt(1 / denom), START_RD, RD_MIN, RD_MAX);

  s.r = r1; s.rd = rd1;
  /* a clock set backwards must not make the next gap look like a year */
  if (at !== null && (s.lastAt === null || at > s.lastAt)) s.lastAt = at;
  s.games++;
  if (result === 1) s.wins++; else if (result === 0) s.losses++; else s.draws++;
  var rec = s.vs[L.id] || [0, 0, 0];
  rec = [rec[0] + (result === 1 ? 1 : 0), rec[1] + (result === 0.5 ? 1 : 0), rec[2] + (result === 0 ? 1 : 0)];
  s.vs[L.id] = rec;

  var acc = typeof g.accuracy === "number" && g.accuracy === g.accuracy ? round1(num(g.accuracy, 0, 0, 100)) : null;
  var perf = acc === null ? null : perfFromAccuracy(acc);
  var after = Math.round(r1);
  var assisted = null;
  if (g.assisted && typeof g.assisted === "object") {
    var tb = Math.floor(num(g.assisted.takebacks, 0, 0, 1000)), hn = Math.floor(num(g.assisted.hints, 0, 0, 1000));
    if (tb || hn) assisted = { takebacks: tb, hints: hn };
  }
  s.history.push({ at: at, r: round1(r1), rd: round1(rd1), delta: round1(r1 - r0), level: L.id,
                   result: result, acc: acc, perf: perf, assisted: assisted });
  if (s.history.length > HISTORY_MAX) s.history = s.history.slice(-HISTORY_MAX);

  /* ---- milestones: each one is said once ---- */
  /* Nothing is celebrated while the score is still finding its level:
     a provisional number swings by hundreds, and a cheer for a swing is
     taken back by the next one. The first settled score is its own
     moment ("settled") and counts every title at or below it as
     reached, so a 1300 who settles is told "Club player" once and never
     "Casual player" on the way back up from a bad week. After that, a
     title is announced the first time it is reached and never again,
     and a personal best is noticed each time it climbs into a new band
     of fifty — often enough to feel, rarely enough to mean something. */
  var provisional = isProvisional(rd1), milestone = null;
  if (!provisional) {
    var ti = titleIndex(r1), t = TITLES[ti];
    var newTitle = s.reached.indexOf(t.floor) < 0;
    for (var k = 0; k <= ti; k++) if (s.reached.indexOf(TITLES[k].floor) < 0) s.reached.push(TITLES[k].floor);
    s.reached.sort(function (a, b) { return a - b; });
    if (!s.settled) {
      s.settled = true;
      milestone = { kind: "settled", name: t.name, emoji: t.emoji, rating: after };
    } else if (newTitle) {
      milestone = { kind: "title", name: t.name, emoji: t.emoji, rating: after };
    } else if (s.best !== null && r1 > s.best && Math.floor(r1 / 50) > Math.floor(s.best / 50)) {
      milestone = { kind: "best", name: "New personal best", emoji: "⭐", rating: after };
    }
    if (s.best === null || r1 > s.best) s.best = round1(r1);
  }

  /* ---- outgrowing a rung ----
     Beaten it twice in your last three meetings, and your score now
     sits far enough above it that you would expect to win three games
     in four: time to try the next one. Said once per rung. */
  var levelUp = null, idx = levelIndex(L.id);
  if (result === 1 && idx < LEVELS.length - 1 && s.outgrown.indexOf(L.id) < 0 && r1 >= L.elo + OUTGROW) {
    var met = 0, won = 0;
    for (var j = s.history.length - 1; j >= 0 && met < 3; j--) {
      if (s.history[j].level !== L.id) continue;
      met++;
      if (s.history[j].result === 1) won++;
    }
    if (won >= 2) { levelUp = L.id; s.outgrown.push(L.id); }
  }

  return { state: s, rated: true, before: before, after: after, delta: after - before, rd: Math.round(rd1),
           provisional: provisional, wasProvisional: wasProvisional, expected: E, weight: w,
           perf: perf, milestone: milestone, levelUp: levelUp,
           next: levelUp ? LEVELS[idx + 1].id : null };
}

/* ---------- what to show ---------- */
function display(stateOrR, rd) {
  var r = stateOrR, d = rd;
  if (stateOrR && typeof stateOrR === "object") { r = stateOrR.r; d = stateOrR.rd; }
  r = Math.round(num(r, START_R, R_FLOOR, R_CEIL));
  d = num(d, START_RD, RD_MIN, RD_MAX);
  return isProvisional(d) ? "~" + r + "?" : String(r);
}
/* The rung that gives a fair fight: the one nearest your score. While
   the score is still provisional it leans a step gentler — a newcomer
   starting at ~800 is offered Sprout rather than Clover, because a
   first win teaches more than a first even game, and the score finds
   its own level within a few games either way. */
var GENTLE = 200;
function suggestLevel(state) {
  var s = clean(state);
  var target = s.r - (isProvisional(s.rd) ? GENTLE : 0);
  var best = LEVELS[0], gap = Infinity, i, d;
  for (i = 0; i < LEVELS.length; i++) {
    d = Math.abs(LEVELS[i].elo - target);
    if (d < gap) { gap = d; best = LEVELS[i]; }
  }
  return best.id;
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
  var recent = accs.length ? round1(accs.reduce(function (a, b) { return a + b; }, 0) / accs.length) : null;
  return {
    rating: Math.round(s.r), rd: Math.round(s.rd), provisional: isProvisional(s.rd), display: display(s),
    title: title(s.r), games: s.games, wins: s.wins, draws: s.draws, losses: s.losses,
    best: s.best === null ? null : Math.round(s.best),
    streak: { kind: streak.result === 1 ? "win" : (streak.result === 0 ? "loss" : (streak.result === 0.5 ? "draw" : null)),
              n: streak.n },
    recentAccuracy: recent, suggested: suggestLevel(s), outgrown: s.outgrown.slice(),
    vs: JSON.parse(JSON.stringify(s.vs)), history: h.slice(-HISTORY_MAX)
  };
}

var Rating = {
  VERSION: VERSION, KEY: KEY, LEVELS: LEVELS, TITLES: TITLES, PERF: PERF,
  START_R: START_R, START_RD: START_RD, OPP_RD: OPP_RD, PROVISIONAL_RD: PROVISIONAL_RD,
  REVIEW_DEPTH: REVIEW_DEPTH,
  levelById: levelById, searchOpts: searchOpts,
  winPct: winPct, moveAccuracy: moveAccuracy, gameAccuracy: gameAccuracy, perfFromAccuracy: perfFromAccuracy,
  expected: expected, assistWeight: assistWeight, abandonResult: abandonResult,
  fresh: fresh, load: load, save: save, clean: clean, update: update,
  title: title, display: display, suggestLevel: suggestLevel, summary: summary
};

if (typeof module !== "undefined" && module.exports) module.exports = Rating;
else root.Rating = Rating;
})(typeof self !== "undefined" ? self : this);
