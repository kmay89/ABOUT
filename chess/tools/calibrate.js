/* calibrate.js — dev-only. How strong is each coach, really?

   A rating is a claim about a person, and the only way this room can
   make that claim is by measuring the coach the person played. So every
   number rating.js stores about the ladder comes out of this file:

     1. Adjacent rungs play each other. Every pair starts from the same
        set of short, sound opening lines taken from the lichess opening
        table (eco.js), each opening played twice with the colours
        swapped, so neither the first move nor a lucky opening decides
        the score. The fraction scored becomes an Elo gap:
        Δ = −400·log10(1/p − 1).
     2. The gaps are stacked into a chain, and the chain is pinned at
        both ends: the first rung at 400, about a person who has just
        learned how the pieces move, and the top rung — the whole engine,
        with a few centipawns of slack so it does not play the same game
        twice — at 1800, the cautious end of where engines of its kind
        are found against people. Self-play exaggerates (an
        engine never has an off day, so its edge is collected in every
        game), so the measured gaps are scaled down by one common factor
        to fit between the pins. The spacing is measured; only the scale
        is an assumption, and it is printed beside the result. The scale
        only ever shrinks the gaps — if the chain is shorter than the
        pins, it is left as measured and the top lands where it lands.
     3. A fixed-depth reviewer, the same comparison the app's coach runs
        (best move and played move scored by one call at one depth),
        reads a sample of each rung's moves and turns them into game
        accuracy. Pairing each rung's mean accuracy with its rating gives
        the points of the accuracy → rating table, made monotone and
        printed as data for rating.js.

   Reproducible on purpose. The clock is frozen before the engine loads,
   so no search can be cut short by a busy machine — every rung stops on
   its depth or its node budget, which are the same on every computer —
   and Math.random is replaced by a seeded generator, reseeded per game
   along with a fresh transposition table, so any one game can be
   replayed exactly and the order the games run in changes nothing.

   Run: node chess/tools/calibrate.js [--games 32,32,32,32,24,32,24] [--review 6] [--depth 5]
                                      [--pairs 0-1,4-5] [--seed 7]
                                      [--levels file.json] [--no-review]
                                      [--json out.json] [--from out.json] [--quiet]
   --from (one file, or a comma list) reuses the matches of earlier
   --json runs wherever both rungs' recipes, the seed and the game count
   are unchanged — so after retuning one rung only its two pairings are
   played again, and the result is exactly what a full run would have
   produced.
   A full run is roughly a quarter of an hour of one core.            */
"use strict";

/* ---- freeze time before the engine can read it ---- */
Object.defineProperty(globalThis, "performance", {
  value: { now: function () { return 0; } }, configurable: true, writable: true
});

const fs = require("fs");
const path = require("path");
const C = require("../engine.js");
const Rating = require("../rating.js");

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf("--" + name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
};
/* games a pair: one number for every pair, or a comma list, one per
   pair in order — the strong rungs think for longer, so the pairs at the
   top can be given fewer games without starving the cheap ones */
const GAMES_ARG = String(arg("games", "32,32,32,32,24,32,24")).split(",").map((n) => Math.max(2, (+n) & ~1));
const gamesFor = (k) => GAMES_ARG[Math.min(k, GAMES_ARG.length - 1)];
const GAMES = Math.max.apply(null, GAMES_ARG);
const REVIEW_GAMES = +arg("review", 6);
const REVIEW_DEPTH = +arg("depth", Rating.REVIEW_DEPTH || 5);
const SEED = +arg("seed", 7);
const QUIET = !!arg("quiet", false);
const NO_REVIEW = !!arg("no-review", false);
const JSON_OUT = arg("json", null);
const FROM = arg("from", null);
const priors = FROM ? String(FROM).split(",").map((f) => ({ file: f, data: JSON.parse(fs.readFileSync(f, "utf8")) })) : [];
const LEVELS = arg("levels", null) ? JSON.parse(fs.readFileSync(arg("levels"), "utf8")) : Rating.LEVELS;
const ANCHOR = 400, TOP = 1800;

/* ---- a seeded generator, so a game can be played again exactly ---- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* games are seeded by the names of the rungs playing them, not by where
   they stand on the ladder, so inserting a rung changes nobody else's
   games */
function idHash(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seedFor() {
  let h = 2166136261;
  for (const n of arguments) { h ^= n; h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function reseed(s) {
  Math.random = mulberry32(s);
  C.setHashBits(16);          /* a fresh table: no game inherits another's memory */
}

/* ---- openings: short, sound, and many of them ---- */
function openings(count) {
  const src = fs.readFileSync(path.join(__dirname, "..", "eco.js"), "utf8");
  const lit = src.match(/var DATA = ("(?:[^"\\]|\\.)*");/);
  const rows = JSON.parse(lit[1]).split("\n").map((l) => l.split("\t")).filter((r) => r.length === 3);
  const seen = new Set(), pool = [];
  for (const [, , seq] of rows) {
    const sans = seq.split(" ");
    if (!/^(e4|d4|c4|Nf3)$/.test(sans[0])) continue;
    for (const len of [6, 8]) {
      if (sans.length < len) continue;
      const key = sans.slice(0, len).join(" ");
      if (!seen.has(key)) { seen.add(key); pool.push(key); }
    }
  }
  /* a seeded shuffle, then keep only lines a sound engine calls level —
     a gambit that drops a pawn would hand one colour the result */
  const rnd = mulberry32(SEED * 7919 + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  const out = [];
  for (const line of pool) {
    if (out.length >= count) break;
    reseed(1);
    const g = C.create();
    let ok = true;
    for (const san of line.split(" ")) {
      const m = C.fromSAN(g, san);
      if (!m) { ok = false; break; }
      C.play(g, m);
    }
    if (!ok) continue;
    const r = C.search(g, { ms: 1e9, maxDepth: 5 });
    if (Math.abs(r.score) <= 70) out.push(line.split(" "));
  }
  return out;
}

/* exactly the options the app hands the engine for a rung */
function optsOf(L) {
  const o = { ms: L.ms, maxDepth: L.maxDepth, noise: L.noise };
  if (L.nodes) o.nodes = L.nodes;
  if (L.rankDepth) o.rankDepth = L.rankDepth;
  return o;
}

/* ---- one game, from an opening, to a result ----
   Adjudicated the way engine matches are: once both players' own
   searches have agreed for ten plies running that one side is more than
   ten pawns ahead (or mating), the game is scored. It is what a person
   would do — resign — and it spares the weakest rungs from a hundred
   moves of failing to mate with two queens. */
const ADJ_CP = 1000, ADJ_PLIES = 10, MAX_PLIES = 300;
function playGame(A, B, opening, aWhite, seed) {
  reseed(seed);
  const g = C.create();
  const sans = [];
  for (const san of opening) { const m = C.fromSAN(g, san); sans.push(C.toSAN(g, m)); C.play(g, m); }
  let run = 0, runSign = 0, result = null, reason = "";
  for (let ply = opening.length; ply < MAX_PLIES; ply++) {
    const st = C.status(g);
    if (st.over) { result = st.result; reason = st.reason; break; }
    if (st.canClaim3) { result = "draw"; reason = "repetition"; break; }
    if (st.canClaim50) { result = "draw"; reason = "fifty moves"; break; }
    const aToMove = (g.turn === C.WHITE) === aWhite;
    const r = C.search(g, optsOf(aToMove ? A : B));
    if (!r.move) { result = "draw"; reason = "no move"; break; }
    const white = g.turn === C.WHITE ? r.score : -r.score;
    const sign = white >= ADJ_CP ? 1 : (white <= -ADJ_CP ? -1 : 0);
    if (sign && sign === runSign) run++; else { run = sign ? 1 : 0; runSign = sign; }
    sans.push(C.toSAN(g, r.move));
    C.play(g, r.move);
    if (run >= ADJ_PLIES) { result = runSign > 0 ? "white" : "black"; reason = "adjudicated"; break; }
  }
  if (!result) { result = "draw"; reason = "move cap"; }
  const aScore = result === "draw" ? 0.5 : ((result === "white") === aWhite ? 1 : 0);
  return { sans, result, reason, aWhite, aScore, plies: sans.length };
}

/* p → Elo gap. A clean sweep says "at least this much", not "infinitely
   much", so the score is held half a game away from 0% and 100%. */
function eloGap(points, n) {
  const p = Math.min(Math.max(points, 0.5), n - 0.5) / n;
  return -400 * Math.log10(1 / p - 1);
}
/* one standard error, from the spread of the actual game results */
function eloErr(scores) {
  const n = scores.length, mean = scores.reduce((a, b) => a + b, 0) / n;
  const p = Math.min(Math.max(mean, 0.5 / n), 1 - 0.5 / n);
  const v = scores.reduce((a, s) => a + (s - mean) * (s - mean), 0) / Math.max(1, n - 1);
  const se = Math.sqrt(Math.max(v, 0.25 / n) / n);
  return 400 / Math.LN10 * se / (p * (1 - p));
}

const log = (s) => { if (!QUIET) console.log(s); };
const t0 = Date.now();
const OPEN = openings(GAMES / 2);
log(`calibrating ${LEVELS.length} rungs · ${GAMES_ARG.join("/")} games a pair · ${OPEN.length} openings · seed ${SEED}`);

/* ---- the matches ---- */
let pairs = [];
for (let i = 0; i + 1 < LEVELS.length; i++) pairs.push([i, i + 1]);
if (arg("pairs", null)) pairs = String(arg("pairs")).split(",").map((s) => s.split("-").map(Number));

const games = [];          /* every game played, for the accuracy pass */
const gaps = {};
const recipes = {};        /* every recipe that played, ladder or bridge */
const recipeOf = (L) => (L ? L.id + JSON.stringify(optsOf(L)) : "");
const keyOf = (W, S) => W.id + "-" + S.id;

/* Stepping stones. Where two neighbours are too far apart to measure
   directly — one wins nearly every game, and a clean sweep says only
   "at least this much" — the gap is measured through a recipe that sits
   between them but is not on the ladder: W against the stone, the stone
   against S, and the two half-steps added. Each half is a match the
   stronger side wins three or four games in five, which is where a
   score says the most.
   None is needed on today's ladder; the door is left here for the day a
   recipe changes and a gap opens up. Keyed "weaker-stronger" by id:
     "cactus-pine": { id: "stone-cactus-pine", ms: 2500, maxDepth: 4, noise: 90, nodes: 200000 } */
const BRIDGES = {};

/* an earlier run's match, if it was played under exactly these terms */
function reusable(W, S, N) {
  for (const { file, data: prior } of priors) {
    if (prior.seed !== SEED || !prior.gaps) continue;
    const g = prior.gaps[keyOf(W, S)];
    if (!g || g.n !== N || g.via) continue;
    const was = (id) => (prior.recipes && prior.recipes[id]) || (prior.levels || []).find((x) => x.id === id);
    if (recipeOf(was(W.id)) !== recipeOf(W) || recipeOf(was(S.id)) !== recipeOf(S)) continue;
    const ids = [W.id, S.id];
    const gs = (prior.games || []).filter((x) => ids.indexOf(x.white) >= 0 && ids.indexOf(x.black) >= 0 && x.white !== x.black);
    if (gs.length !== N) continue;
    return { file, gap: g, games: gs.map((x) => ({ white: x.white, black: x.black, k: x.k, result: x.result, reason: x.reason, sans: x.sans.split(" ") })) };
  }
  return null;
}
/* N games between W (weaker) and S, half with each colour; the gap is S's */
function match(W, S, N) {
  recipes[W.id] = W; recipes[S.id] = S;
  const old = reusable(W, S, N);
  if (old) {
    old.games.forEach((g) => games.push(g));
    log(`${(S.id + " vs " + W.id).padEnd(26)} ${old.gap.pts}/${old.gap.n}  gap +${Math.round(old.gap.gap)} ±${Math.round(old.gap.err)}  (reused from ${path.basename(old.file)})`);
    return old.gap;
  }
  const t = Date.now();
  let pts = 0, wins = 0, draws = 0, losses = 0, plies = 0;
  const scores = [], reasons = {};
  for (let k = 0; k < N; k++) {
    const open = OPEN[(k >> 1) % OPEN.length];
    const strongWhite = (k & 1) === 0;
    const gm = playGame(S, W, open, strongWhite, seedFor(SEED, idHash(W.id), idHash(S.id), k));
    gm.white = strongWhite ? S.id : W.id; gm.black = strongWhite ? W.id : S.id; gm.k = k;
    games.push(gm);
    pts += gm.aScore; scores.push(gm.aScore); plies += gm.plies;
    if (gm.aScore === 1) wins++; else if (gm.aScore === 0) losses++; else draws++;
    reasons[gm.reason] = (reasons[gm.reason] || 0) + 1;
  }
  const gap = eloGap(pts, N), err = eloErr(scores);
  log(`${(S.id + " vs " + W.id).padEnd(26)} +${wins} =${draws} −${losses}  ` +
      `${(100 * pts / N).toFixed(0).padStart(3)}%  gap ${gap >= 0 ? "+" : ""}${Math.round(gap)} ±${Math.round(err)}  ` +
      `avg ${Math.round(plies / N)} plies  ${Object.keys(reasons).map((r) => r + ":" + reasons[r]).join(" ")}  ` +
      `${((Date.now() - t) / 1000).toFixed(0)}s`);
  return { gap, err, pts, n: N, wins, draws, losses };
}
pairs.forEach(([lo, hi], pairNo) => {
  const W = LEVELS[lo], S = LEVELS[hi], N = gamesFor(pairNo);
  const B = BRIDGES[keyOf(W, S)];
  if (!B) { gaps[keyOf(W, S)] = match(W, S, N); return; }
  const a = match(W, B, N), b = match(B, S, N);
  gaps[keyOf(W, B)] = a; gaps[keyOf(B, S)] = b;
  const g = { gap: a.gap + b.gap, err: Math.sqrt(a.err * a.err + b.err * b.err), pts: a.pts + "+" + b.pts, n: N, via: B.id };
  gaps[keyOf(W, S)] = g;
  log(`${(S.id + " vs " + W.id).padEnd(26)} through ${B.id}: gap +${Math.round(g.gap)} ±${Math.round(g.err)}`);
});

/* ---- stack the gaps, then pin the chain at both ends ---- */
const chain = [0];
let complete = true;
for (let i = 1; i < LEVELS.length; i++) {
  const g = gaps[keyOf(LEVELS[i - 1], LEVELS[i])];
  if (!g) { complete = false; break; }
  chain.push(chain[i - 1] + g.gap);
}
let elo = null, scale = 1;
if (complete) {
  const span = chain[chain.length - 1];
  scale = span > TOP - ANCHOR ? (TOP - ANCHOR) / span : 1;
  elo = chain.map((c) => ANCHOR + c * scale);
  log(`\nladder: measured self-play chain ${Math.round(span)}, scaled ×${scale.toFixed(3)} between ` +
      `${LEVELS[0].id} = ${ANCHOR} and ${LEVELS[LEVELS.length - 1].id} = ${Math.round(elo[elo.length - 1])}`);
  LEVELS.forEach((L, i) => {
    const g = i ? gaps[keyOf(LEVELS[i - 1], LEVELS[i])] : null;
    log(`  ${L.id.padEnd(8)} ${String(Math.round(elo[i])).padStart(5)}` +
        (g ? `   step +${Math.round(g.gap * scale)} ±${Math.round(g.err * scale)}   (self-play +${Math.round(g.gap)} ±${Math.round(g.err)}, ` +
             `${g.pts}/${g.n})` : ""));
  });
}

/* ---- the accuracy pass ----
   The same comparison Chess.review makes — the reviewer's best and the
   move played, scored by one call at one depth — minus the refutation
   search, which the accuracy does not need. */
function sameMove(a, b) { return a.from === b.from && a.to === b.to && (a.promo || 0) === (b.promo || 0); }
function reviewOne(g, played) {
  const r = C.search(g, { ms: 1e9, maxDepth: REVIEW_DEPTH });
  if (!r.move) return null;
  const same = sameMove(r.move, played);
  const sc = C.scoreMoves(g, same ? [played] : [r.move, played], { depth: REVIEW_DEPTH, ms: 1e9 });
  let best = null, mine = null;
  for (const x of sc) {
    if (sameMove(x.move, played)) mine = x.score;
    if (x.move === r.move) best = x.score;
  }
  if (same) best = mine;
  if (best === null || mine === null) return null;
  return { best: Math.max(best, mine), played: mine };
}
const accOf = {};
if (!NO_REVIEW && typeof Rating.gameAccuracy === "function") {
  log(`\naccuracy (reviewer at depth ${REVIEW_DEPTH}, up to ${REVIEW_GAMES} games a rung)`);
  for (const L of LEVELS) {
    const t = Date.now();
    const mine = games.filter((gm) => gm.white === L.id || gm.black === L.id);
    /* take them evenly from both of the rung's pairings */
    const pick = [];
    const step = Math.max(1, Math.floor(mine.length / Math.max(1, REVIEW_GAMES)));
    for (let i = 0; i < mine.length && pick.length < REVIEW_GAMES; i += step) pick.push(mine[i]);
    const accs = [], moveAccs = [];
    for (const gm of pick) {
      reseed(seedFor(SEED, 99, idHash(gm.white), idHash(gm.black), gm.k));
      const side = gm.white === L.id ? C.WHITE : C.BLACK;
      const g = C.create(), rev = [];
      /* the opening was handed to both players, so it is nobody's accuracy */
      const book = OPEN[(gm.k >> 1) % OPEN.length].length;
      gm.sans.forEach((san, ply) => {
        const m = C.fromSAN(g, san);
        if (ply >= book && g.turn === side) {
          const rv = reviewOne(g, m);
          if (rv) rev.push(rv);
        }
        C.play(g, m);
      });
      const a = Rating.gameAccuracy(rev);
      if (a !== null) accs.push(a);
      for (const rv of rev) moveAccs.push(Rating.moveAccuracy(rv.best, rv.played));
    }
    const mean = accs.reduce((a, b) => a + b, 0) / Math.max(1, accs.length);
    const sd = Math.sqrt(accs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, accs.length - 1));
    const mv = moveAccs.reduce((a, b) => a + b, 0) / Math.max(1, moveAccs.length);
    accOf[L.id] = { mean, sd, games: accs.length, moves: moveAccs.length, perMove: mv };
    log(`  ${L.id.padEnd(8)} game accuracy ${mean.toFixed(1)} (sd ${sd.toFixed(1)}, ${accs.length} games, ` +
        `${moveAccs.length} moves; mean per move ${mv.toFixed(1)})  ${((Date.now() - t) / 1000).toFixed(0)}s`);
  }
}

/* ---- a monotone accuracy → rating table ----
   More accurate should never mean a lower estimate, whatever the
   sampling noise says, so the points are pooled where they disagree
   (pool-adjacent-violators) before they are written down. */
function monotone(points) {
  const blocks = points.map((p) => ({ acc: p.acc, elo: p.elo, n: 1 }));
  for (let i = 1; i < blocks.length; ) {
    if (blocks[i].acc <= blocks[i - 1].acc) {
      const a = blocks[i - 1], b = blocks[i], n = a.n + b.n;
      blocks.splice(i - 1, 2, { acc: (a.acc * a.n + b.acc * b.n) / n, elo: (a.elo * a.n + b.elo * b.n) / n, n });
      i = Math.max(1, i - 1);
    } else i++;
  }
  return blocks;
}
/* the ends are held rather than extrapolated: 0% reads as the floor of
   the scale, 100% as the most any single game will be credited with */
const PERF_LO = [0, 100], PERF_HI = [100, 2400];
let table = null;
if (complete && Object.keys(accOf).length === LEVELS.length) {
  const pts = LEVELS.map((L, i) => ({ acc: accOf[L.id].mean, elo: elo[i] }));
  const mid = monotone(pts).map((b) => [+b.acc.toFixed(1), Math.round(b.elo / 10) * 10]);
  table = [PERF_LO];
  for (const p of mid.concat([PERF_HI])) {
    const last = table[table.length - 1];
    if (p[0] > last[0] && p[1] > last[1]) table.push(p);
  }
  log("\naccuracy → rating table (monotone, ends held): " + JSON.stringify(table));
}

if (complete) {
  log("\nfor rating.js:");
  LEVELS.forEach((L, i) => log(`  ${L.id}: elo ${Math.round(elo[i] / 10) * 10}` +
                               (accOf[L.id] ? `, accuracy ${accOf[L.id].mean.toFixed(1)}` : "")));
}
log(`\n${games.length} games, ${((Date.now() - t0) / 60000).toFixed(1)} minutes`);

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({ seed: SEED, gamesPerPair: GAMES_ARG, reviewDepth: REVIEW_DEPTH,
    levels: LEVELS, recipes, gaps, chain: complete ? chain : null, scale, elo, accuracy: accOf, table,
    games: games.map((g) => ({ white: g.white, black: g.black, k: g.k, result: g.result, reason: g.reason, sans: g.sans.join(" ") })) }, null, 1));
  log("wrote " + JSON_OUT);
}
