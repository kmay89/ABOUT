/* setup.js — setting up the board, as a first lesson and a warm-up.

   Before anyone can play chess they have to know which piece is which
   and where it starts, and the way people actually learn that is by
   doing it: a rook in each corner, the knights beside them, then the
   bishops, the queen on her own colour, the king, and a row of pawns in
   front of them all. So the room hands you your pieces one kind at a
   time, says what each one is, and lets you put them
   down. Black then sets up the same way across the board, by itself.

   Two ways to do it:
     - learning (the "I'm new" door, and "New to chess?"): each piece is
       named in a few words (how it moves is the next lesson, and is
       shown there rather than said: rules.js), where it goes is said, and its
       squares glow after a miss (or straight away, at a gentle pace);
     - from memory (the Academy): no words, no glow, a clock, and your
       best time to beat.

   A miss is never a buzzer: it says where that piece really lives.
   Pure, so chess/tools/setup-check.js can read all of it in node.   */
(function (root) {
"use strict";

var KEY = "chessroom_setup";

/* the steps, White's side; Black's is the same squares across the board
   (square ^ 0x70). Squares are 0x88: a1 = 0, h1 = 7, a2 = 16. */
var STEPS = [
  { kind: 4, name: "Rook", plural: "Rooks", emoji: "🏰", squares: [0, 7],
    what: "The rook is the castle tower.",
    where: "Rooks go in the corners.",
    miss: "Not there: rooks live in the corners, at each end of your back row." },
  { kind: 2, name: "Knight", plural: "Knights", emoji: "🐴", squares: [1, 6],
    what: "The knight is the horse.",
    where: "Knights stand next to the rooks.",
    miss: "Not quite: each knight stands right next to a rook." },
  { kind: 3, name: "Bishop", plural: "Bishops", emoji: "⛪", squares: [2, 5],
    what: "The bishop has the pointed hat.",
    where: "Bishops go next to the knights.",
    miss: "Not quite: each bishop stands next to a knight." },
  { kind: 5, name: "Queen", plural: "Queen", emoji: "👑", squares: [3],
    what: "The queen is the strongest piece.",
    where: "The queen goes on her own colour: the white queen on the light square in the middle.",
    miss: "Look for the light square in the middle of the back row. The queen goes on her own colour!" },
  { kind: 6, name: "King", plural: "King", emoji: "🤴", squares: [4],
    what: "The king is the one to keep safe.",
    where: "The king takes the last square, next to his queen.",
    miss: "The king takes the one square left in the back row, beside his queen." },
  { kind: 1, name: "Pawn", plural: "Pawns", emoji: "🌱", squares: [16, 17, 18, 19, 20, 21, 22, 23], group: true,
    what: "The pawns are your foot soldiers.",
    where: "Pawns fill the whole second row, in front of everyone.",
    miss: "Pawns go on the second row, the one right in front of your other pieces." }
];
var FILES = "abcdefgh";
function sqName(sq) { return FILES.charAt(sq & 7) + ((sq >> 4) + 1); }
function across(sq) { return sq ^ 0x70; }

function begin(o) {
  o = o || {};
  return { at: 0, placed: {}, misses: 0, stepMisses: 0, memory: !!o.memory, done: false, mirrored: false };
}
function step(st) { return STEPS[st.at] || null; }
/* the squares this step still needs filled */
function targets(st) {
  var s = step(st);
  if (!s) return [];
  return s.squares.filter(function (q) { return !st.placed[q]; });
}
/* put the current piece down on `sq`. Returns:
   { ok, piece, sq, stepDone, finished, rest (for a group: the squares
     that fill themselves), why (on a miss) } */
function place(st, sq) {
  var s = step(st);
  if (!s || st.done) return { ok: false, why: "" };
  if (targets(st).indexOf(sq) < 0) {
    st.misses++; st.stepMisses++;
    return { ok: false, why: st.placed[sq] ? "That square is taken." : s.miss };
  }
  st.placed[sq] = s.kind;
  var out = { ok: true, piece: s.kind, sq: sq, rest: [] };
  /* a group (the pawns): one placed by hand and the rest march in */
  if (s.group) {
    out.rest = targets(st);
    out.rest.forEach(function (q) { st.placed[q] = s.kind; });
  }
  if (!targets(st).length) {
    out.stepDone = true;
    st.at++; st.stepMisses = 0;
    if (st.at >= STEPS.length) { st.done = true; out.finished = true; }
  }
  return out;
}
/* should the squares glow? Learning: after a miss, or from the start at
   a gentle pace. From memory: never */
function glow(st, gentle) { return !st.memory && (!!gentle || st.stepMisses > 0); }
/* Black, setting up across the board in the same order */
function mirror() {
  var out = [];
  STEPS.forEach(function (s) { s.squares.forEach(function (q) { out.push([across(q), -s.kind]); }); });
  return out;
}
/* everything on the board so far (and Black's side, once it is there) */
function board(st, withBlack) {
  var b = typeof Int8Array !== "undefined" ? new Int8Array(128) : [];
  if (!(b instanceof Int8Array)) for (var i = 0; i < 128; i++) b[i] = 0;
  Object.keys(st.placed).forEach(function (k) { b[+k] = st.placed[k]; });
  if (withBlack) mirror().forEach(function (x) { b[x[0]] = x[1]; });
  return b;
}

/* the record: how many times, and the best time from memory */
function fresh() { return { v: 1, learned: 0, tries: 0, best: 0, bestMisses: 0 }; }
function clean(s) {
  var out = fresh();
  if (!s || typeof s !== "object" || s.v !== 1) return out;
  out.learned = Math.max(0, Math.min(9999, s.learned | 0));
  out.tries = Math.max(0, Math.min(9999, s.tries | 0));
  out.best = typeof s.best === "number" && s.best > 0 && s.best < 3600000 ? Math.round(s.best) : 0;
  out.bestMisses = Math.max(0, s.bestMisses | 0);
  return out;
}
function load(get) { try { return clean(JSON.parse(get(KEY) || "null")); } catch (e) { return fresh(); } }
function save(rec, set) { try { set(KEY, JSON.stringify(rec)); } catch (e) {} }
/* a finished set-up: learning counts it; from memory it is timed, and a
   miss costs three seconds */
var MISS_MS = 3000;
function finish(rec, st, ms) {
  if (!st.memory) { rec.learned++; return { learned: rec.learned }; }
  rec.tries++;
  var score = Math.round(ms + st.misses * MISS_MS), best = !rec.best || score < rec.best;
  if (best) { rec.best = score; rec.bestMisses = st.misses; }
  return { score: score, best: best, record: rec.best };
}
function fmt(ms) { return (Math.round(ms / 100) / 10).toFixed(1) + " s"; }

var Setup = { KEY: KEY, STEPS: STEPS, MISS_MS: MISS_MS, sqName: sqName, across: across,
              begin: begin, step: step, targets: targets, place: place, glow: glow, mirror: mirror, board: board,
              fresh: fresh, clean: clean, load: load, save: save, finish: finish, fmt: fmt };
if (typeof module !== "undefined" && module.exports) module.exports = Setup;
else root.Setup = Setup;
})(typeof window !== "undefined" ? window : this);
