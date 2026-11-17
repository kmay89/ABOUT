/* pace.js — how fast this player likes to go, and what the room does
   about it.

   A seven-year-old who has never played and a club player on a lunch
   break want different rooms. The child wants the coach to pause before
   it answers, so they can see what happened; words that stay up long
   enough to read; a celebration they can enjoy; and, when they have been
   staring at the board for a minute, a kind word and a clue, never a
   clock. The club player wants the coach to answer at once, the card to
   get out of the way, and the next coach without five wins against one
   they have already outgrown.

   Nobody is asked which they are. The room watches three things it can
   see honestly:
     - how long you look at the board before you move (the median of
       your last forty moves, never counting time the page was hidden);
     - what the last eight games against the computer were like: won,
       lost, helped;
     - whether you let the end card's celebration play or tap past it.
   Saying "I'm new to chess" at the door counts for your first games.

   From those it reads a pace, gentle, steady or brisk, and each pace is
   a set of dials: how long the coach waits before replying, how long
   words stay up, how long the end card takes, when (and whether) to
   offer a hand to someone who has been thinking a while, how many
   losses in a row to one coach before a friendly game is offered, and
   whether a win good enough for the third star opens the road two
   coaches ahead. Settings can pin the pace; Auto is the default.

   Pure, so chess/tools/pace-check.js can read every rule in node.  */
(function (root) {
"use strict";

var KEY = "chessroom_pace";
var MODES = ["auto", "gentle", "steady", "brisk"];
var KEEP_MOVES = 40, KEEP_GAMES = 12, MAX_THINK = 10 * 60000;

function fresh() {
  return { v: 1, mode: "auto", moves: [], games: [], newDoor: 0, cards: 0, skips: 0, run: { coach: null, n: 0 } };
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function clean(s) {
  var out = fresh();
  if (!s || typeof s !== "object" || s.v !== 1) return out;
  out.mode = MODES.indexOf(s.mode) >= 0 ? s.mode : "auto";
  if (Array.isArray(s.moves)) out.moves = s.moves.filter(function (x) { return typeof x === "number" && x > 0 && x <= MAX_THINK; })
    .map(Math.round).slice(-KEEP_MOVES);
  if (Array.isArray(s.games)) out.games = s.games.filter(function (g) { return g && typeof g === "object"; }).slice(-KEEP_GAMES)
    .map(function (g) { return { won: g.won ? 1 : 0, lost: g.lost ? 1 : 0, helped: g.helped ? 1 : 0, plies: Math.max(0, g.plies | 0) }; });
  out.newDoor = s.newDoor ? 1 : 0;
  out.cards = Math.max(0, s.cards | 0);
  out.skips = Math.max(0, Math.min(out.cards, s.skips | 0));
  if (s.run && typeof s.run === "object" && typeof s.run.coach === "string")
    out.run = { coach: s.run.coach.slice(0, 20), n: Math.max(0, Math.min(99, s.run.n | 0)) };
  return out;
}
function load(get) { try { return clean(JSON.parse(get(KEY) || "null")); } catch (e) { return fresh(); } }
function save(st, set) { try { set(KEY, JSON.stringify(st)); } catch (e) {} }

/* ---- what the room sees ---- */

/* a move of yours: how long you looked at the board before playing it */
function think(st, ms) {
  if (!(ms >= 300)) return false;                  /* a premove or a double tap is not a think */
  st.moves.push(Math.round(Math.min(ms, MAX_THINK)));
  if (st.moves.length > KEEP_MOVES) st.moves.splice(0, st.moves.length - KEEP_MOVES);
  return true;
}
/* a game against the computer, finished: { coach, won, lost, helped, plies, friendly } */
function game(st, g) {
  st.games.push({ won: g.won ? 1 : 0, lost: g.lost ? 1 : 0, helped: g.helped ? 1 : 0, plies: Math.max(0, g.plies | 0) });
  if (st.games.length > KEEP_GAMES) st.games.splice(0, st.games.length - KEEP_GAMES);
  /* losses in a row to one coach: a win against them ends the run; a
     friendly loss is not a loss; a draw leaves it where it was */
  if (g.won) st.run = { coach: g.coach, n: 0 };
  else if (g.lost && !g.friendly) st.run = st.run.coach === g.coach ? { coach: g.coach, n: st.run.n + 1 } : { coach: g.coach, n: 1 };
}
/* an end card shown, and whether you tapped past its celebration */
function card(st, skipped) { st.cards++; if (skipped) st.skips++; }
function skip(st) { if (st.skips < st.cards) st.skips++; }
function setMode(st, m) { st.mode = MODES.indexOf(m) >= 0 ? m : "auto"; return st.mode; }

function median(a) {
  if (!a.length) return null;
  var s = a.slice().sort(function (x, y) { return x - y; }), h = s.length >> 1;
  return s.length % 2 ? s[h] : Math.round((s[h - 1] + s[h]) / 2);
}

/* ---- what it makes of it ---- */
var SLOW = 20000, QUICK = 6000;
function read(st) {
  var med = st.moves.length >= 6 ? median(st.moves) : null;
  var tempo = med == null ? null : med >= SLOW ? "slow" : med <= QUICK ? "quick" : "even";
  var g = st.games.slice(-8), n = g.length;
  var wins = g.filter(function (x) { return x.won; }).length, helped = g.filter(function (x) { return x.helped; }).length;
  var score = 0, why = [];
  if (tempo === "slow") { score -= 1; why.push("you like to take your time"); }
  if (tempo === "quick") { score += 1; why.push("you play quickly"); }
  if (st.newDoor && n < 5) { score -= 1; why.push("you're new to chess"); }
  if (n >= 3 && helped / n > 0.5) { score -= 0.5; why.push("you like a hand"); }
  if (n >= 3 && wins / n >= 0.7) { score += 0.5; why.push("you're winning most games"); }
  if (st.cards >= 4 && st.skips / st.cards >= 0.5) { score += 0.5; why.push("you tap past the celebrations"); }
  var auto = score <= -1 ? "gentle" : score >= 1 ? "brisk" : "steady";
  return { pace: st.mode !== "auto" ? st.mode : auto, auto: auto, mode: st.mode, think: med, tempo: tempo, why: why };
}

/* ---- the dials ----
   reply   ms from your move to the coach's answer, at the least (it may
           take longer to think; it never answers sooner)
   words   how long words stay up, against the room's usual
   card    how long the end card's choreography takes, against usual
   nudge   when to offer a hand to someone thinking: a multiple of how
           long they usually take, between a floor and a ceiling (none
           at all for a brisk player, who does not need it)
   friendlyAfter  losses in a row to one coach before a friendly game
   fastTrack      a third-star win opens the road two coaches ahead */
var DIALS = {
  gentle: { reply: 1300, words: 1.5, card: 1.25, nudge: { factor: 2.5, min: 45000, max: 120000 }, friendlyAfter: 2, fastTrack: false },
  steady: { reply: 650,  words: 1,   card: 1,    nudge: { factor: 3,   min: 90000, max: 240000 }, friendlyAfter: 3, fastTrack: true },
  brisk:  { reply: 150,  words: 0.8, card: 0.5,  nudge: null,                                     friendlyAfter: 3, fastTrack: true }
};
function dials(pace) { return DIALS[pace] || DIALS.steady; }
function nudgeAfter(r) {
  var k = dials(r.pace).nudge;
  if (!k) return 0;
  return Math.round(clamp(r.think == null ? k.min * 1.5 : r.think * k.factor, k.min, k.max));
}
function friendlyDue(st, r, coach) { return st.run.coach === coach && st.run.n >= dials(r.pace).friendlyAfter; }
/* the friendly coach: the same coach going easy, a good deal looser and
   a ply shallower. Never rated, so nobody's number is a number against
   some other opponent */
function easy(opts) {
  var o = {}, k;
  for (k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
  o.noise = Math.round((o.noise || 0) * 1.8 + 150);
  o.maxDepth = Math.max(1, (o.maxDepth || 2) - 1);
  return o;
}
/* a win good enough for the third star (no help at all, 80% or better) */
function fastTrack(r, g) { return !!(dials(r.pace).fastTrack && g.won && !g.helped && !g.friendly && g.acc != null && g.acc >= 80); }

var Pace = { KEY: KEY, MODES: MODES, DIALS: DIALS, SLOW: SLOW, QUICK: QUICK,
             fresh: fresh, clean: clean, load: load, save: save, think: think, game: game, card: card, skip: skip, setMode: setMode,
             median: median, read: read, dials: dials, nudgeAfter: nudgeAfter, friendlyDue: friendlyDue, easy: easy, fastTrack: fastTrack };
if (typeof module !== "undefined" && module.exports) module.exports = Pace;
else root.Pace = Pace;
})(typeof window !== "undefined" ? window : this);
