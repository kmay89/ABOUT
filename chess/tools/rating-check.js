/* rating-check.js — dev-only. Is the score honest?

   A rating is a promise made in numbers, and it is easy to break
   quietly: a win that lowers you, a helped game that counts for more
   than a clean one, a milestone that cheers the same crossing every
   week, a stored score that a stray byte turns into NaN and a white
   screen. None of those crash. All of them teach a player to stop
   trusting the number — which is the only thing the number is for.

   So this checks the arithmetic the way perft checks the rules: the
   ladder is a ladder, the Glicko maths moves the right way by the right
   amounts, help is weighed kindly and symmetrically, accuracy behaves
   like the lichess curve it claims to be, the accuracy → rating table is
   monotone and agrees with the calibration it came from, and storage
   survives anything a browser or a stranger could hand it.

   Pure node, no engine, a fraction of a second.

   Run: node chess/tools/rating-check.js                                */
"use strict";
const Rating = require("../rating.js");

let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-9 : eps);
const L = Rating.LEVELS;
const MATE = 100000;
const DAY = 86400000, T0 = Date.UTC(2026, 0, 1);

/* play a run of games, returning every update */
function run(state, games) {
  const out = [];
  let s = state, at = T0;
  for (const g of games) {
    at += DAY / 4;
    const u = Rating.update(s, Object.assign({ at }, g));
    out.push(u); s = u.state;
  }
  return out;
}
/* a state whose fields are all the right type and inside their ranges */
function sane(s) {
  if (!s || typeof s !== "object" || Object.getPrototypeOf(s) !== Object.prototype) return "not a plain object";
  for (const k of ["r", "rd", "games", "wins", "draws", "losses"]) {
    if (typeof s[k] !== "number" || !isFinite(s[k])) return k + " is " + s[k];
  }
  if (s.r < 100 || s.r > 3000) return "r out of range " + s.r;
  if (s.rd < 50 || s.rd > 350) return "rd out of range " + s.rd;
  if (s.wins + s.draws + s.losses > s.games) return "results exceed games";
  if (!Array.isArray(s.history) || s.history.length > 200) return "history";
  for (const e of s.history) {
    if (!Rating.levelById(e.level)) return "history names an unknown rung";
    if ([0, 0.5, 1].indexOf(e.result) < 0) return "history result " + e.result;
    if (!isFinite(e.r) || !isFinite(e.rd) || !isFinite(e.delta)) return "history numbers";
  }
  if (!Array.isArray(s.reached) || !Array.isArray(s.outgrown)) return "lists";
  if (typeof Rating.display(s) !== "string" || /NaN|undefined/.test(Rating.display(s))) return "display";
  return null;
}

/* ---------- it loads where the room loads it ----------
   The page includes rating.js as a plain script, with no module system,
   and the coach's worker could too: both must find window.Rating (or
   self.Rating) and nothing else on the global object. */
(function () {
  const vm = require("vm");
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "rating.js"), "utf8");
  const page = { };
  page.self = page;
  let threw = null;
  try { vm.runInNewContext(src, page, { filename: "rating.js" }); } catch (e) { threw = e.message; }
  ok("loads as a plain browser script and lands on self.Rating, alone",
     !threw && page.Rating && typeof page.Rating.update === "function" &&
     Object.keys(page).filter((k) => k !== "self").join() === "Rating",
     threw || Object.keys(page).join());
})();

/* ---------- the ladder ---------- */
(function () {
  ok("the ladder has room to move (at least five rungs)", L.length >= 5, L.length + " rungs");
  for (const id of ["sprout", "club", "mentor"]) {
    ok(`saved games can still find "${id}"`, !!Rating.levelById(id));
  }
  ok("an unknown rung is null, not a crash", Rating.levelById("nope") === null && Rating.levelById(undefined) === null);
  const ids = new Set(L.map((x) => x.id));
  ok("every rung has its own id", ids.size === L.length);
  let bad = null;
  for (const x of L) {
    for (const k of ["id", "name", "emoji", "blurb"]) if (typeof x[k] !== "string" || !x[k]) bad = bad || x.id + "." + k;
    for (const k of ["elo", "ms", "maxDepth", "noise", "nodes"]) if (typeof x[k] !== "number" || !isFinite(x[k])) bad = bad || x.id + "." + k;
    if (!(x.nodes > 0) || !(x.ms >= 1000)) bad = bad || x.id + " has no node budget or too tight a clock";
  }
  ok("every rung is complete: name, emoji, a warm line, a rating and a recipe", !bad, bad);
  let order = null, gaps = [];
  for (let i = 1; i < L.length; i++) {
    const a = L[i - 1], b = L[i];
    gaps.push(b.elo - a.elo);
    if (!(b.elo > a.elo)) order = order || `${b.id} (${b.elo}) is not above ${a.id} (${a.elo})`;
    if (b.noise > a.noise) order = order || `${b.id} allows itself more slack than ${a.id}`;
    /* depth, not nodes: a slack-taking rung spends most of its node
       budget scoring every move for the slack to choose from, so a
       weaker rung can need more nodes than a stronger one */
    if (b.maxDepth < a.maxDepth) order = order || `${b.id} reads less deeply than ${a.id}`;
  }
  ok("weakest → strongest, in rating and in every part of the recipe", !order, order);
  ok("adjacent rungs are a real step apart, and not a cliff (120–330)",
     gaps.every((g) => g >= 120 && g <= 330), gaps.join(", "));
  ok("the first rung is anchored where a newcomer starts (≈400)", L[0].elo >= 300 && L[0].elo <= 500, L[0].elo);
  const o = Rating.searchOpts("club");
  ok("searchOpts hands the engine the rung's recipe and nothing else",
     o && o.ms === Rating.levelById("club").ms && o.nodes === Rating.levelById("club").nodes &&
     Object.keys(o).every((k) => ["ms", "maxDepth", "noise", "nodes", "rankDepth"].indexOf(k) >= 0),
     JSON.stringify(o));
  ok("searchOpts for an unknown rung is null", Rating.searchOpts("nope") === null);
})();

/* ---------- Glicko ---------- */
(function () {
  let worst = 0;
  for (const a of [100, 400, 800, 1200, 2000]) for (const b of [150, 700, 1650]) for (const rd of [30, 60, 200]) {
    worst = Math.max(worst, Math.abs(Rating.expected(a, b, rd) + Rating.expected(b, a, rd) - 1));
  }
  ok("expected scores are symmetric: E(a,b) + E(b,a) = 1", worst < 1e-12, worst);
  ok("equal ratings expect half a point", near(Rating.expected(1000, 1000, 60), 0.5));
  ok("200 points of advantage expects about three in four",
     near(Rating.expected(1200, 1000, 0), 0.76, 0.01), Rating.expected(1200, 1000, 0).toFixed(3));

  const s = Rating.fresh();
  const club = Rating.levelById("club");
  const at = T0;
  const win = Rating.update(s, { level: "club", result: 1, at });
  const loss = Rating.update(s, { level: "club", result: 0, at });
  const draw = Rating.update(s, { level: "club", result: 0.5, at });
  ok("a win raises the score", win.delta > 0, win.delta);
  ok("a loss lowers it", loss.delta < 0, loss.delta);
  ok("a draw with a stronger coach raises it",
     s.r < club.elo && draw.delta > 0, `${s.r} vs ${club.elo}: ${draw.delta}`);
  const weak = L[0], strong = L[L.length - 1];
  const est = Object.assign(Rating.fresh(), { r: 1000, rd: 80 });
  const beatStrong = Rating.update(est, { level: strong.id, result: 1, at });
  const beatWeak = Rating.update(est, { level: weak.id, result: 1, at });
  const loseWeak = Rating.update(est, { level: weak.id, result: 0, at });
  const loseStrong = Rating.update(est, { level: strong.id, result: 0, at });
  ok("beating a stronger coach moves you further than beating a weaker one",
     beatStrong.delta > beatWeak.delta, `${beatStrong.delta} vs ${beatWeak.delta}`);
  ok("losing to a weaker coach costs more than losing to a stronger one",
     loseWeak.delta < loseStrong.delta, `${loseWeak.delta} vs ${loseStrong.delta}`);
  ok("an established player moves by tens, not hundreds",
     Math.abs(beatWeak.delta) < 40 && Math.abs(loseWeak.delta) < 60, `${beatWeak.delta}, ${loseWeak.delta}`);

  const games = [];
  for (let i = 0; i < 12; i++) games.push({ level: "club", result: i % 2 ? 1 : 0.5 });
  const us = run(Rating.fresh(), games);
  let shrinking = true;
  for (let i = 1; i < us.length; i++) if (!(us[i].state.rd < us[i - 1].state.rd)) shrinking = false;
  ok("the deviation shrinks with every game", shrinking, us.map((u) => Math.round(u.state.rd)).join(" "));
  ok("a newcomer is provisional, shown as ~800?",
     Rating.summary(Rating.fresh()).provisional && Rating.display(Rating.fresh()) === "~" + Rating.START_R + "?",
     Rating.display(Rating.fresh()));
  const settledAt = us.findIndex((u) => !u.provisional);
  ok("…and settles after a handful of games (4–8)", settledAt >= 3 && settledAt <= 7, "after " + (settledAt + 1));
  ok("a settled score is shown plainly", !/[~?]/.test(Rating.display(us[us.length - 1].state)), Rating.display(us[us.length - 1].state));

  const later = Rating.update(us[us.length - 1].state, { level: "club", result: 1, at: T0 + 400 * DAY });
  ok("time away makes the score less sure, so the next game moves it more",
     later.delta > Rating.update(us[us.length - 1].state, { level: "club", result: 1, at: T0 + 4 * DAY }).delta,
     later.delta);
  const backwards = Rating.update(us[us.length - 1].state, { level: "club", result: 1, at: T0 - 99 * DAY });
  ok("a clock that runs backwards changes nothing it should not", isFinite(backwards.after) && !sane(backwards.state));

  let low = Object.assign(Rating.fresh(), { r: 110, rd: 300 });
  for (let i = 0; i < 20; i++) low = Rating.update(low, { level: L[L.length - 1].id, result: 0, at: T0 + i }).state;
  let high = Object.assign(Rating.fresh(), { r: 2950, rd: 300 });
  for (let i = 0; i < 20; i++) high = Rating.update(high, { level: L[0].id, result: 1, at: T0 + i }).state;
  ok("the score has a floor and a ceiling", low.r >= 100 && high.r <= 3000, `${low.r} .. ${high.r}`);

  const a = Rating.update(est, { level: "club", result: 1, at, accuracy: 77 });
  const b = Rating.update(est, { level: "club", result: 1, at, accuracy: 77 });
  ok("the same game scores the same way twice", JSON.stringify(a) === JSON.stringify(b));

  /* Glickman (1995), one game, written out from the paper rather than
     from rating.js: q = ln10/400, g(RD) = 1/√(1 + 3q²RD²/π²),
     E = 1/(1 + 10^(−g(RDj)(r − rj)/400)), d² = 1/(q² g² E(1 − E)),
     r' = r + q/(1/RD² + 1/d²) · g · (s − E), RD' = √(1/(1/RD² + 1/d²)). */
  const q = Math.LN10 / 400, gf = (rd) => 1 / Math.sqrt(1 + 3 * q * q * rd * rd / (Math.PI * Math.PI));
  let glickWorst = 0, glickAt = "";
  for (const [r0, rd0, lvl, s] of [[1500, 200, "pine", 1], [800, 350, "club", 0], [1234, 75, "acorn", 0.5], [400, 120, "mentor", 1]]) {
    const rj = Rating.levelById(lvl).elo, g = gf(Rating.OPP_RD);
    const E = 1 / (1 + Math.pow(10, -g * (r0 - rj) / 400));
    const d2 = 1 / (q * q * g * g * E * (1 - E));
    const r1 = r0 + q / (1 / (rd0 * rd0) + 1 / d2) * g * (s - E), rd1 = Math.sqrt(1 / (1 / (rd0 * rd0) + 1 / d2));
    const u = Rating.update(Object.assign(Rating.fresh(), { r: r0, rd: rd0 }), { level: lvl, result: s, at });
    const err = Math.max(Math.abs(u.state.r - r1), Math.abs(u.state.rd - rd1), Math.abs(u.expected - E));
    if (err > glickWorst) { glickWorst = err; glickAt = `${r0}±${rd0} v ${lvl}: ${u.state.r.toFixed(2)}±${u.state.rd.toFixed(2)}, paper says ${r1.toFixed(2)}±${rd1.toFixed(2)}`; }
  }
  ok("one unhelped game moves r and RD exactly as Glickman's formulas say", glickWorst < 1e-6, glickAt);

  /* a clock set back must not be remembered: the next real game is a day
     after the last one, not a year */
  const last = us[us.length - 1].state;
  ok("a game dated before the last one does not move the last-played date back",
     backwards.state.lastAt === last.lastAt, `${backwards.state.lastAt} vs ${last.lastAt}`);
})();

/* ---------- help, kindly ---------- */
(function () {
  const est = Object.assign(Rating.fresh(), { r: 1000, rd: 90 });
  const at = T0;
  const clean = Rating.update(est, { level: "club", result: 1, at });
  const helped = Rating.update(est, { level: "club", result: 1, at, assisted: { takebacks: 2, hints: 1 } });
  const cleanL = Rating.update(est, { level: "club", result: 0, at });
  const helpedL = Rating.update(est, { level: "club", result: 0, at, assisted: { takebacks: 2, hints: 1 } });
  ok("a helped win still counts", helped.delta > 0, helped.delta);
  ok("…but for less than a clean one", helped.delta < clean.delta, `${helped.delta} vs ${clean.delta}`);
  ok("a helped loss costs less than a clean one, by the same weight",
     helpedL.delta < 0 && helpedL.delta > cleanL.delta &&
     near(helped.weight, helpedL.weight) && helped.weight < 1, `${helpedL.delta} vs ${cleanL.delta}`);
  ok("…and teaches us less about you: the deviation shrinks less after a helped game",
     helped.state.rd > clean.state.rd && helped.state.rd < est.rd, `${helped.state.rd.toFixed(1)} vs ${clean.state.rd.toFixed(1)}`);
  ok("help is counted in whole take-backs and hints, as the history records it",
     Rating.assistWeight({ takebacks: 1.9 }) === Rating.assistWeight({ takebacks: 1 }));
  ok("no help is full weight", Rating.assistWeight(null) === 1 && Rating.assistWeight({ takebacks: 0, hints: 0 }) === 1);
  ok("more help, less weight", Rating.assistWeight({ takebacks: 1 }) > Rating.assistWeight({ takebacks: 3 }) &&
     Rating.assistWeight({ hints: 1 }) > Rating.assistWeight({ takebacks: 1 }));
  ok("but a helped game never counts for nothing", Rating.assistWeight({ takebacks: 500, hints: 500 }) === 0.25);
  ok("junk help is read as no help",
     Rating.assistWeight({ takebacks: "lots", hints: NaN }) === 1 && Rating.assistWeight({ takebacks: -4 }) === 1);
  ok("the help is written into the history",
     JSON.stringify(helped.state.history[helped.state.history.length - 1].assisted) === '{"takebacks":2,"hints":1}');
})();

/* ---------- leaving a game ---------- */
(function () {
  ok("leaving a game barely begun counts for nothing", Rating.abandonResult({ plies: 6, eval: -900 }) === null);
  ok("leaving a game that is still a game counts for nothing", Rating.abandonResult({ plies: 40, eval: -120 }) === null);
  ok("leaving a lost game is resigning it", Rating.abandonResult({ plies: 40, eval: -450 }) === 0);
  ok("…and so is walking out of a mate", Rating.abandonResult({ plies: 30, eval: -(MATE - 3) }) === 0);
  ok("leaving a won game costs nothing", Rating.abandonResult({ plies: 60, eval: 700 }) === null);
  ok("junk is nothing", Rating.abandonResult(null) === null && Rating.abandonResult({ plies: "x", eval: "y" }) === null);
})();

/* ---------- accuracy ---------- */
(function () {
  ok("level is a coin flip", near(Rating.winPct(0), 50));
  let sym = 0;
  for (let cp = -1500; cp <= 1500; cp += 37) sym = Math.max(sym, Math.abs(Rating.winPct(cp) + Rating.winPct(-cp) - 100));
  ok("winning chances are symmetric", sym < 1e-9, sym);
  ok("a mate is not a centipawn: winPct stays inside 0..100",
     Rating.winPct(MATE - 1) <= 100 && Rating.winPct(-(MATE - 1)) >= 0 && Rating.winPct(Infinity) <= 100 &&
     Rating.winPct(MATE - 1) === Rating.winPct(1000));
  ok("the best move is 100% accurate", Rating.moveAccuracy(35, 35) === 100 && Rating.moveAccuracy(-400, -400) === 100);
  ok("a move better than the reviewer's is still 100%, not more", Rating.moveAccuracy(10, 60) === 100);
  let mono = true, prev = 101;
  for (let loss = 0; loss <= 1200; loss += 10) {
    const a = Rating.moveAccuracy(50, 50 - loss);
    if (a > prev + 1e-12 || a < 0 || a > 100) mono = false;
    prev = a;
  }
  ok("the more a move gives away, the less accurate it is", mono);
  const wonBlunder = Rating.moveAccuracy(600, 300), evenBlunder = Rating.moveAccuracy(0, -300);
  ok("three pawns dropped while winning costs less than three dropped in a level game",
     wonBlunder > evenBlunder, `${wonBlunder.toFixed(1)} vs ${evenBlunder.toFixed(1)}`);
  ok("missing a mate while staying a queen up is nearly free",
     Rating.moveAccuracy(MATE - 3, 950) > 95, Rating.moveAccuracy(MATE - 3, 950).toFixed(1));
  ok("choosing a slower mate is no loss at all", Rating.moveAccuracy(MATE - 3, MATE - 7) === 100);
  ok("walking into mate from a good position is nearly zero",
     Rating.moveAccuracy(150, -(MATE - 2)) < 8, Rating.moveAccuracy(150, -(MATE - 2)).toFixed(1));
  ok("junk scores are no score", Rating.moveAccuracy("x", 5) === null && Rating.moveAccuracy(NaN, 5) === null);

  const perfect = [];
  for (let i = 0; i < 30; i++) perfect.push({ best: 20 + i, played: 20 + i });
  ok("a game of best moves is 100", Rating.gameAccuracy(perfect) === 100);
  ok("no moves is no accuracy", Rating.gameAccuracy([]) === null && Rating.gameAccuracy(null) === null &&
     Rating.gameAccuracy([{ best: "a" }, null, 4]) === null);
  const oneBlunder = perfect.slice(0, 29).concat([{ best: 40, played: -500 }]);
  const plainMean = oneBlunder.reduce((a, m) => a + Rating.moveAccuracy(m.best, m.played), 0) / oneBlunder.length;
  const ga = Rating.gameAccuracy(oneBlunder);
  ok("one blunder is not averaged away", ga < plainMean - 3, `${ga} vs plain mean ${plainMean.toFixed(1)}`);
  const sloppy = [];
  for (let i = 0; i < 30; i++) sloppy.push({ best: 30, played: 30 - (i % 3) * 60 });
  ok("sloppier play, lower accuracy", Rating.gameAccuracy(sloppy) < ga, `${Rating.gameAccuracy(sloppy)}`);
  const mates = perfect.slice(0, 8).concat([{ best: MATE - 5, played: MATE - 9 }, { best: MATE - 3, played: 900 },
                                             { best: -(MATE - 4), played: -(MATE - 2) }, { best: Infinity, played: -Infinity }]);
  const gm = Rating.gameAccuracy(mates);
  ok("mate scores give a finite, sane accuracy", typeof gm === "number" && gm >= 0 && gm <= 100, gm);
  const few = perfect.slice(0, Rating.ACCURACY_MIN_MOVES - 1);
  ok(`fewer than ${Rating.ACCURACY_MIN_MOVES} moves of your own is too few to judge`,
     Rating.gameAccuracy(few) === null && Rating.gameAccuracy(perfect.slice(0, Rating.ACCURACY_MIN_MOVES)) === 100);

  /* The blend, written out again from lichess's description rather than
     from rating.js: per-move accuracy from the win-chance drop, a window
     of max(2, min(8, ⌊n/10⌋)) moves, each move weighted by the standard
     deviation of the winning chances in its window (held to 0.5..12),
     and the weighted mean averaged with the harmonic mean (each move
     counted as at least 1%). If either side of this drifts — a weight
     flattened, a mean dropped, a window off by one — the two disagree. */
  const wp = (cp) => { const c = Math.max(-1000, Math.min(1000, cp)); return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1); };
  const reference = (moves) => {
    const acc = moves.map((m) => {
      const b = wp(m.best), a = wp(m.played);
      return a >= b ? 100 : Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * (b - a)) - 3.1669));
    });
    const wins = moves.map((m) => wp(m.best)), n = acc.length;
    const size = Math.max(2, Math.min(8, Math.floor(n / 10)));
    let ws = 0, wa = 0, inv = 0;
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, Math.min(i - size + 1, n - size));
      const win = wins.slice(start, start + size);
      const mean = win.reduce((x, y) => x + y, 0) / win.length;
      const sd = Math.sqrt(win.reduce((x, y) => x + (y - mean) * (y - mean), 0) / win.length);
      const w = Math.max(0.5, Math.min(12, sd));
      ws += w; wa += w * acc[i]; inv += 1 / Math.max(1, acc[i]);
    }
    return Math.round(((wa / ws) + n / inv) / 2 * 10) / 10;
  };
  let seed = 99, worst = 0, worstAt = "";
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  /* a game with a move worth exactly nothing in it, where the harmonic
     mean's floor of 1% is the whole difference */
  const games = [perfect.slice(0, 11).concat([{ best: MATE - 3, played: -(MATE - 2) }])];
  for (let t = 0; t < 200; t++) {
    const n = 8 + Math.floor(rnd() * 70), moves = [];
    let ev = 0;
    for (let i = 0; i < n; i++) {
      ev += Math.round((rnd() - 0.5) * 160);
      const drop = rnd() < 0.7 ? 0 : Math.round(rnd() * rnd() * 700);
      moves.push({ best: ev, played: ev - drop });
      ev -= drop;
    }
    games.push(moves);
  }
  for (const moves of games) {
    const d = Math.abs(Rating.gameAccuracy(moves) - reference(moves));
    if (d > worst) { worst = d; worstAt = `${moves.length} moves: ${Rating.gameAccuracy(moves)} vs ${reference(moves)}`; }
  }
  ok("game accuracy is the lichess blend, checked against a second implementation over 200 games",
     worst <= 0.1 + 1e-9, worstAt);

  /* the same slip, once at a quiet moment and once in the middle of a
     storm: the storm is where it counts. Both games hold the same storm
     and the same slip, so only where the slip falls differs. */
  const calm = Array.from({ length: 20 }, () => ({ best: 0, played: 0 }));
  calm[10] = { best: 450, played: 450 }; calm[11] = { best: -450, played: -450 };
  const inStorm = calm.map((m) => Object.assign({}, m)), inCalm = calm.map((m) => Object.assign({}, m));
  inStorm[10] = { best: 450, played: 450 - 200 };
  const target = Rating.moveAccuracy(450, 250);
  let lo2 = 0, hi2 = 1000;
  for (let k = 0; k < 60; k++) { const mid = (lo2 + hi2) / 2; if (Rating.moveAccuracy(0, -mid) > target) lo2 = mid; else hi2 = mid; }
  inCalm[3] = { best: 0, played: -lo2 };
  ok("a slip made while the game is swinging counts for more than the same slip in a quiet spell",
     Rating.gameAccuracy(inStorm) < Rating.gameAccuracy(inCalm),
     `${Rating.gameAccuracy(inStorm)} vs ${Rating.gameAccuracy(inCalm)}`);
})();

/* ---------- accuracy → rating ---------- */
(function () {
  let mono = true, lo = Infinity, hi = -Infinity, prev = -Infinity;
  for (let a = 0; a <= 100; a += 0.25) {
    const p = Rating.perfFromAccuracy(a);
    if (p < prev) mono = false;
    prev = p; lo = Math.min(lo, p); hi = Math.max(hi, p);
  }
  ok("the accuracy → rating table never goes backwards", mono);
  ok("…and stays inside its bounds", lo >= 100 && hi <= 2400, `${lo} .. ${hi}`);
  ok("out-of-range accuracy is held at the ends",
     Rating.perfFromAccuracy(-20) === Rating.perfFromAccuracy(0) && Rating.perfFromAccuracy(140) === Rating.perfFromAccuracy(100));
  ok("no accuracy, no estimate", Rating.perfFromAccuracy(null) === null && Rating.perfFromAccuracy("90") === null &&
     Rating.perfFromAccuracy(NaN) === null);
  const P = Rating.PERF;
  let strict = true;
  for (let i = 1; i < P.length; i++) if (!(P[i][0] > P[i - 1][0] && P[i][1] > P[i - 1][1])) strict = false;
  ok("the table's points rise in both columns", strict, JSON.stringify(P));
  /* the table was fitted to the rungs: a rung's own measured accuracy
     should read back as roughly that rung's rating */
  const measured = L.filter((x) => typeof x.accuracy === "number");
  let worst = 0, who = "";
  for (const x of measured) {
    const d = Math.abs(Rating.perfFromAccuracy(x.accuracy) - x.elo);
    if (d > worst) { worst = d; who = x.id; }
  }
  ok("each rung's measured accuracy reads back as about its rating",
     measured.length === L.length && worst <= 150, measured.length < L.length ? "no measured accuracy stored" : `${who} off by ${worst}`);
  const u = Rating.update(Rating.fresh(), { level: "club", result: 1, at: T0, accuracy: 88 });
  ok("a game with an accuracy carries its estimate", u.perf === Rating.perfFromAccuracy(88));
  const v = Rating.update(Rating.fresh(), { level: "club", result: 1, at: T0, accuracy: null });
  ok("…and a game without one says so", v.perf === null);
  /* a spotless win over Acorn says "comfortably stronger than 400", not
     "2400": the estimate is held within reach of the coach it was earned
     against, and a rough game against Oak is not lifted by the company */
  const acorn = Rating.levelById("acorn");
  const clean = Rating.update(Rating.fresh(), { level: "acorn", result: 1, at: T0, accuracy: 100 });
  ok("a clean win against a weak coach is not read as a master's game",
     clean.perf === acorn.elo + Rating.PERF_ABOVE, clean.perf);
  const rough = Rating.update(Rating.fresh(), { level: "mentor", result: 0, at: T0, accuracy: 55 });
  ok("…and a rough game against a strong one is not flattered", rough.perf === Rating.perfFromAccuracy(55), rough.perf);
})();

/* ---------- titles ---------- */
(function () {
  const t0 = Rating.title(Rating.START_R);
  ok("a title has a name, a glyph, a floor and the next step",
     t0.name && t0.emoji && typeof t0.floor === "number" && t0.next && t0.next.floor > t0.floor);
  let mono = true, last = -1;
  for (let r = 0; r <= 3000; r += 25) {
    const t = Rating.title(r);
    if (t.floor < last || t.floor > r) mono = false;
    last = t.floor;
  }
  ok("titles climb with the score and never claim more than it says", mono);
  ok("the top title has nowhere further to go", Rating.title(2900).next === null);
  ok("a nonsense score is a newcomer, not a crash", Rating.title(NaN).floor === 0 && Rating.title(-50).floor === 0);
  ok("club player sits where clubs put it (1200)", Rating.title(1250).name === "Club player");
})();

/* ---------- milestones ---------- */
(function () {
  /* settle a player near 1000, then push them over 1200 and back, twice */
  let s = Object.assign(Rating.fresh(), { r: 1150, rd: 120, games: 10, wins: 5, losses: 5, best: 1150,
                                          settled: true, reached: [0, 600, 900] });
  const seen = [];
  let at = T0;
  const step = (level, result) => {
    at += DAY;
    const u = Rating.update(s, { level, result, at });
    s = u.state;
    if (u.milestone) seen.push(u.milestone.kind + ":" + u.milestone.name + "@" + u.milestone.rating);
    return u;
  };
  for (let i = 0; i < 6; i++) step("mentor", 1);
  const crossed = seen.filter((m) => m.indexOf("title:Club player") === 0).length;
  for (let i = 0; i < 10; i++) step("acorn", 0);
  const dropped = s.r;
  for (let i = 0; i < 10; i++) step("mentor", 1);
  const twice = seen.filter((m) => m.indexOf("title:Club player") === 0).length;
  ok("crossing a title is celebrated", crossed === 1, seen.join(" "));
  ok("…once, however often it is crossed again", dropped < 1200 && s.r >= 1200 && twice === 1, `dropped to ${Math.round(dropped)}, back to ${Math.round(s.r)}: ${seen.join(" ")}`);
  ok("a new personal best is noticed", seen.some((m) => m.indexOf("best") === 0), seen.join(" "));
  const bests = seen.filter((m) => m.indexOf("best") === 0).map((m) => +m.split("@")[1]);
  ok("…in steps worth noticing, never the same step twice",
     bests.every((b, i) => i === 0 || Math.floor(b / 50) > Math.floor(bests[i - 1] / 50)), bests.join(" "));
  /* a few points above the old best, inside the same band of fifty, is
     a good day rather than news */
  const nudge = Rating.update(Object.assign(Rating.fresh(), { r: 1210, rd: 60, games: 40, best: 1210, settled: true,
                                                               reached: [0, 600, 900, 1200] }),
                              { level: "pine", result: 0.5, at: T0 });
  ok("a new best inside the same band of fifty is not announced",
     nudge.state.r > 1210 && Math.floor(nudge.state.r / 50) === Math.floor(1210 / 50) && nudge.milestone === null,
     `${nudge.state.r.toFixed(1)}: ${JSON.stringify(nudge.milestone)}`);

  const us = run(Rating.fresh(), [1, 1, 0, 1, 0.5, 1, 0, 1, 1, 1].map((r) => ({ level: "sprout", result: r })));
  const settles = us.filter((u) => u.milestone && u.milestone.kind === "settled");
  ok("a newcomer's score settling is said once", settles.length === 1, us.map((u) => u.milestone && u.milestone.kind).join(" "));
  ok("nothing is celebrated while the score is still provisional",
     us.every((u) => !u.milestone || !u.provisional));
})();

/* ---------- outgrowing a rung ---------- */
(function () {
  let s = Object.assign(Rating.fresh(), { r: 700, rd: 120 });
  const ups = [];
  for (let i = 0; i < 8; i++) {
    const u = Rating.update(s, { level: "acorn", result: 1, at: T0 + i * DAY });
    s = u.state;
    if (u.levelUp) ups.push(u.levelUp + "→" + u.next);
  }
  ok("beating a rung you have outgrown says so, once", ups.length === 1 && ups[0] === "acorn→" + L[1].id, ups.join(" "));
  let top = Object.assign(Rating.fresh(), { r: 2400, rd: 60 });
  let topUp = null;
  for (let i = 0; i < 4; i++) {
    const u = Rating.update(top, { level: "mentor", result: 1, at: T0 + i });
    top = u.state; topUp = topUp || u.levelUp;
  }
  ok("there is nothing to outgrow at the top", topUp === null);
  const one = Rating.update(Object.assign(Rating.fresh(), { r: 1400, rd: 60 }), { level: "acorn", result: 1, at: T0 });
  ok("one win is not enough to call it", one.levelUp === null);
})();

/* ---------- a fair fight ---------- */
(function () {
  let mono = true, prev = -1, bad = null;
  for (let r = 100; r <= 2600; r += 20) {
    const idx = L.findIndex((x) => x.id === Rating.suggestLevel(Object.assign(Rating.fresh(), { r, rd: 60 })));
    if (idx < prev) mono = false;
    prev = idx;
  }
  ok("the suggested rung climbs with the score", mono);
  for (const x of L) {
    const id = Rating.suggestLevel(Object.assign(Rating.fresh(), { r: x.elo, rd: 60 }));
    if (id !== x.id) bad = bad || `${x.elo} suggests ${id}, not ${x.id}`;
  }
  ok("a settled score at a rung's rating is offered that rung", !bad, bad);
  const first = Rating.suggestLevel(Rating.fresh());
  ok("a newcomer is offered a gentle first game", L.findIndex((x) => x.id === first) <= 1, first);
})();

/* ---------- the whole loop ----------
   A make-believe player of known strength takes the fair fight the room
   suggests every time, wins and loses as often as the Elo curve says
   they should, and sometimes asks for help. After a season their score
   should have found them — from a cold start, from either side. */
(function () {
  let seed = 12345;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  let worst = 0, who = "";
  for (const truth of [450, 800, 1150, 1500, 1750]) {
    let s = Rating.fresh();
    const tail = [];
    for (let i = 0; i < 80; i++) {
      const lvl = Rating.levelById(Rating.suggestLevel(s));
      const p = 1 / (1 + Math.pow(10, (lvl.elo - truth) / 400));
      const roll = rnd();
      const result = roll < p * 0.9 ? 1 : (roll < p * 0.9 + 0.1 ? 0.5 : 0);
      const helped = rnd() < 0.2 ? { takebacks: 1, hints: 1 } : null;
      s = Rating.update(s, { level: lvl.id, result, assisted: helped, at: T0 + i * DAY }).state;
      if (i >= 50) tail.push(s.r);
    }
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    if (Math.abs(mean - truth) > worst) { worst = Math.abs(mean - truth); who = `${truth} settled at ${Math.round(mean)}`; }
  }
  ok("a player of known strength is found within a season (±150)", worst <= 150, who);
})();

/* ---------- purity ---------- */
(function () {
  const s = run(Rating.fresh(), [{ level: "club", result: 1 }, { level: "sprout", result: 0, accuracy: 70 }])[1].state;
  const before = JSON.stringify(s);
  const deepFreeze = (o) => { Object.freeze(o); for (const k in o) if (o[k] && typeof o[k] === "object") deepFreeze(o[k]); return o; };
  let threw = null, u;
  try { u = Rating.update(deepFreeze(JSON.parse(before)), { level: "mentor", result: 0.5, at: T0 + 9 * DAY, accuracy: 81 }); }
  catch (e) { threw = e.message; }
  ok("update() never writes to the state it was given", !threw, threw);
  ok("…and hands back a new one", u && u.state !== s && JSON.stringify(s) === before && u.state.games === s.games + 1);
  const junk = Rating.update(s, { level: "grandmaster", result: 1, at: T0 });
  const junk2 = Rating.update(s, { level: "club", result: 2, at: T0 });
  ok("an unknown rung or result is not rated", !junk.rated && !junk2.rated && junk.delta === 0 &&
     junk.state.games === s.games);
  ok("…and comes back in the same shape a rated game does",
     Object.keys(junk).sort().join() === Object.keys(u).sort().join() && Number.isInteger(junk.rd),
     Object.keys(junk).sort().join());
  ok("update() survives being handed nothing at all",
     Rating.update(null, null).rated === false && !sane(Rating.update(undefined, {}).state));
})();

/* ---------- storage ---------- */
(function () {
  const store = {};
  const get = (k) => (k in store ? store[k] : null), set = (k, v) => { store[k] = v; };
  const played = run(Rating.fresh(), [{ level: "club", result: 1, accuracy: 74.2, assisted: { takebacks: 1, hints: 0 } },
                                      { level: "sprout", result: 0.5 }, { level: "mentor", result: 0 }]);
  const s = played[played.length - 1].state;
  ok("save() reports success", Rating.save(s, set) === true && typeof store[Rating.KEY] === "string");
  ok("load(save(x)) is x", JSON.stringify(Rating.load(get)) === JSON.stringify(s));
  ok("save() never throws, even when storage is full",
     Rating.save(s, () => { throw new Error("QuotaExceeded"); }) === false);
  ok("…and a setter that swallows the failure and answers false is a failed save too",
     Rating.save(s, () => false) === false && Rating.save(s, () => undefined) === true);
  ok("nothing stored is a fresh start", JSON.stringify(Rating.load(() => null)) === JSON.stringify(Rating.fresh()));
  ok("storage that throws is a fresh start", !sane(Rating.load(() => { throw new Error("SecurityError"); })));

  const hostile = [
    "", "{", "[]", "[1,2,3]", "123", "null", "true", '"a string"', "{}", "{\"r\":\"1500\"}",
    "{\"v\":1,\"r\":1e999,\"rd\":-5,\"games\":-3}", "{\"v\":1,\"r\":null,\"rd\":{},\"history\":\"lots\"}",
    "{\"v\":1,\"r\":1200,\"wins\":50,\"games\":3}",
    "{\"v\":1,\"__proto__\":{\"polluted\":true},\"constructor\":{\"prototype\":{\"polluted\":true}},\"r\":900}",
    "{\"v\":1,\"vs\":{\"__proto__\":[1,1,1],\"club\":[\"x\",2,3],\"nope\":[1,1,1]},\"reached\":[\"<b>\",900,12345],\"outgrown\":[\"acorn\",\"<script>\"]}",
    "{\"v\":1,\"history\":[null,1,\"x\",{\"level\":\"<img src=x>\",\"result\":1},{\"level\":\"club\",\"result\":7},{\"level\":\"club\",\"result\":1,\"r\":\"NaN\",\"acc\":1e400,\"assisted\":{\"takebacks\":\"many\"}}]}",
    JSON.stringify({ v: 1, history: Array.from({ length: 5000 }, (_, i) => ({ level: "club", result: 1, r: 1000 + i })) }),
    "x".repeat(500000),
    "{\"v\":1,\"r\":" + "[".repeat(3000) + "]".repeat(3000) + "}"
  ];
  let bad = null;
  for (const raw of hostile) {
    let st, threw = null;
    try { st = Rating.load(() => raw); } catch (e) { threw = e.message; }
    const why = threw || sane(st);
    if (why) bad = bad || `${raw.slice(0, 40)} → ${why}`;
    try { Rating.update(st, { level: "club", result: 1, at: T0 }); Rating.summary(st); }
    catch (e) { bad = bad || `${raw.slice(0, 40)} → later use threw ${e.message}`; }
  }
  ok("load() survives junk, hostile and absurd input, and what it returns is usable", !bad, bad);
  ok("nothing leaked into Object.prototype", ({}).polluted === undefined && Object.prototype.polluted === undefined);
  const big = Rating.load(() => hostile[16]);
  ok("a history too long to keep is trimmed to the last 200", big.history.length === 200 && big.history[199].r === 3000,
     big.history.length);
  const xss = Rating.load(() => hostile[14]);
  ok("unknown rungs and titles are dropped, not kept",
     JSON.stringify(xss.outgrown) === '["acorn"]' && JSON.stringify(xss.reached) === "[900]" &&
     Object.keys(xss.vs).join() === "club" && xss.vs.club[0] === 0);

  const legacy = Rating.load(() => JSON.stringify({ rating: 1234, dev: 80, games: 30 }));
  ok("an older, unversioned score is carried over", legacy.r === 1234 && legacy.rd === 80 && legacy.games === 30 &&
     legacy.v === Rating.VERSION, JSON.stringify(legacy).slice(0, 80));
  const after = Rating.update(legacy, { level: "cactus", result: 0.5, at: T0 });
  ok("…already settled, so its next game is not announced as settling",
     !after.milestone || after.milestone.kind !== "settled", JSON.stringify(after.milestone));
  const future = Rating.load(() => JSON.stringify({ v: 99, r: 1500, rd: 70, games: 40, wins: 20, draws: 5, losses: 15, newThing: { x: 1 } }));
  ok("a newer version's score keeps what this version understands", future.r === 1500 && future.games === 40 && !sane(future));

  const sm = Rating.summary(s);
  ok("summary counts the games and the results",
     sm.games === 3 && sm.wins === 1 && sm.draws === 1 && sm.losses === 1 && sm.history.length === 3);
  ok("summary knows the current streak", sm.streak.kind === "loss" && sm.streak.n === 1, JSON.stringify(sm.streak));
  ok("summary averages recent accuracy over the games that had one", sm.recentAccuracy === 74.2, sm.recentAccuracy);
  /* recent means recent: twelve games, the first two dreadful, the last
     ten all at 80 — the two from long ago are no longer in it */
  const accRun = run(Rating.fresh(), Array.from({ length: 12 }, (_, i) => ({ level: "club", result: 1, accuracy: i < 2 ? 20 : 80 })));
  const recent = Rating.summary(accRun[accRun.length - 1].state).recentAccuracy;
  ok("recent accuracy is the last ten games that had one, not the whole history", recent === 80, recent);
  let many = Rating.fresh();
  for (let i = 0; i < 230; i++) many = Rating.update(many, { level: "club", result: i % 2, at: T0 + i * DAY }).state;
  ok("the history keeps the last 200 games", many.history.length === 200 && many.games === 230 &&
     Rating.summary(many).history.length === 200);
  ok("a summary is a copy, not a window into the state",
     (() => { const m = Rating.summary(many); m.history.length = 0; m.vs.club[0] = -1; return many.history.length === 200 && many.vs.club[0] >= 0; })());
})();

console.log(failed ? `\n${failed} problem${failed > 1 ? "s" : ""} with the score`
                   : "\nthe score is honest: it moves the right way, weighs help kindly, and survives anything");
process.exit(failed ? 1 : 0);
