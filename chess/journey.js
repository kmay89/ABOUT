/* journey.js — the Chess Room as a game you can finish.

   The ladder was a list. The journey is the same eight coaches as a road
   through the grove: a gate, a seed tray, a meadow, the ferns, a dojo, the
   desert's edge, a frozen ridge, and the old library at the end of it,
   each a chapter with a line of story going in and coming out. Beat a
   coach and its chapter is cleared and the road goes on. Clear all eight
   and the Grove Cup opens: Bamboo, Pine and Oak, one after another, with
   no loss and no draw between them (either one starts the cup again).
   Win it and the room says so properly: an ending, with every coach in
   it, your story in numbers, and a trophy.

   After the ending there is still the whole of it: every star, every
   lesson in the Academy, everything in the collection. That is the
   completion, out of a hundred, and a hundred is the true ending.

   Pure, so chess/tools/journey-check.js can read all of it in node.  */
(function (root) {
"use strict";

var KEY = "chessroom_journey";

/* the road, in order: each coach's chapter. `place` is the scene the
   chapter card is painted in. */
var CHAPTERS = [
  { id: "acorn", n: 1, title: "The Gate", place: "park",
    intro: "Every road through the grove starts at the gate, where the smallest tree is waiting with its very first game.",
    outro: "The gate swings open. Acorn waves you through, still a little amazed." },
  { id: "sprout", n: 2, title: "The Seed Tray", place: "park",
    intro: "Past the gate, rows of seedlings in the sun. Sprout is learning here too, and would love a game.",
    outro: "Sprout grows an inch just from playing you. The path bends toward the meadow." },
  { id: "clover", n: 3, title: "The Meadow", place: "park",
    intro: "A meadow full of four-leaf clovers, and one of them says it is the luckiest player in the grove.",
    outro: "Luck runs out where good moves start. The meadow gives way to deep shade." },
  { id: "club", n: 4, title: "The Fern Shade", place: "cafe",
    intro: "Under the ferns it is cool and quiet, and Fern notices everything you leave loose.",
    outro: "Fern nods, once. Ahead, the sound of wind through hollow stems." },
  { id: "bamboo", n: 5, title: "The Bamboo Dojo", place: "salon",
    intro: "A dojo of pale cane and black lacquer. Bamboo bows, and will not hold back.",
    outro: "Bamboo bows lower than before. Beyond the dojo, the ground turns to sand." },
  { id: "cactus", n: 6, title: "The Desert Edge", place: "cafe",
    intro: "Where the grove meets the desert, a cactus with a drawl has been waiting for a real fight.",
    outro: "Cactus tips an imaginary hat. The path climbs toward the snow." },
  { id: "pine", n: 7, title: "The Frost Ridge", place: "library",
    intro: "High on the ridge the air is cold and clear, and Pine has already counted every move.",
    outro: "Pine's calculations did not include you. Below, a light in the old library." },
  { id: "mentor", n: 8, title: "The Old Library", place: "library",
    intro: "At the end of the road, among the books, the oldest tree of all. Oak has been waiting a long time for you.",
    outro: "Oak closes the book and smiles. “There is one more thing. The Cup.”" }
];
var CUP = ["bamboo", "pine", "mentor"];

function chapterOf(id) {
  for (var i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].id === id) return CHAPTERS[i];
  return null;
}
function fresh() { return { v: 1, cup: { run: 0, won: 0, wonAt: 0, tries: 0, best: 0 }, shown: {}, intro: {}, ending: 0, trueEnding: 0, open: {} }; }
function clean(s) {
  var out = fresh();
  if (!s || typeof s !== "object" || s.v !== 1) return out;
  var c = s.cup || {};
  out.cup.run = Math.max(0, Math.min(CUP.length - 1, c.run | 0));
  out.cup.won = c.won ? 1 : 0;
  out.cup.wonAt = +c.wonAt || 0;
  out.cup.tries = Math.max(0, c.tries | 0);
  out.cup.best = Math.max(0, Math.min(CUP.length, c.best | 0));
  ["shown", "intro", "open"].forEach(function (k) {
    if (s[k] && typeof s[k] === "object") Object.keys(s[k]).forEach(function (id) { if (chapterOf(id)) out[k][id] = 1; });
  });
  out.ending = s.ending ? 1 : 0;
  out.trueEnding = s.trueEnding ? 1 : 0;
  return out;
}
function load(get) { try { return clean(JSON.parse(get(KEY) || "null")); } catch (e) { return fresh(); } }
function save(st, set) { try { set(KEY, JSON.stringify(st)); } catch (e) {} }

/* where you are on the road. ladder: { rungs: { id: { stars } } } */
function cleared(ladder, id) {
  var r = ladder && ladder.rungs && ladder.rungs[id];
  return !!(r && r.stars && r.stars[0]);
}
function road(ladder, st) {
  var done = CHAPTERS.filter(function (c) { return cleared(ladder, c.id); }).map(function (c) { return c.id; });
  var next = null;
  for (var i = 0; i < CHAPTERS.length; i++) if (!cleared(ladder, CHAPTERS[i].id)) { next = CHAPTERS[i].id; break; }
  var all = done.length === CHAPTERS.length;
  return {
    cleared: done, count: done.length, of: CHAPTERS.length, next: next,
    /* a chapter is open once the one before it is cleared (or it is the
       first); you can always go back and play one you have cleared */
    open: CHAPTERS.map(function (c) { return coachOpen(ladder, c.id, st); }),
    cupOpen: all, cupWon: !!(st && st.cup.won),
    at: st && st.cup.won ? "done" : all ? "cup" : next
  };
}

/* who you may play. The road is the only way in: the first coach is
   always there, and every other one opens when you beat the one before
   it. A coach you have already beaten stays open whatever else is true. */
function indexOf(id) { for (var i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].id === id) return i; return -1; }
function coachOpen(ladder, id, st) {
  var i = indexOf(id);
  if (i < 0) return false;
  return i === 0 || cleared(ladder, id) || cleared(ladder, CHAPTERS[i - 1].id) || !!(st && st.open && st.open[id]);
}
/* the road can also be opened ahead of the chapters: a friendly win
   opens the next coach, and a third-star win the one after that
   (pace.js). Open is not cleared: a chapter is still cleared only by
   beating its coach in a rated game, so the map, the stars and the cup
   stay true. Returns the coach it opened, or null if it was open already */
function openAhead(ladder, st, id) {
  if (indexOf(id) < 0 || coachOpen(ladder, id, st)) return null;
  st.open = st.open || {};
  st.open[id] = 1;
  return id;
}
function after(id, n) { var i = indexOf(id); return i >= 0 && CHAPTERS[i + (n || 1)] ? CHAPTERS[i + (n || 1)].id : null; }
/* the one to beat next: the first coach on the road you have not beaten
   (or the last, once you have beaten them all) */
function frontier(ladder) {
  for (var i = 0; i < CHAPTERS.length; i++) if (!cleared(ladder, CHAPTERS[i].id)) return CHAPTERS[i].id;
  return CHAPTERS[CHAPTERS.length - 1].id;
}
/* whoever has to be beaten to open `id` (null for the first) */
function openedBy(id) { var i = indexOf(id); return i > 0 ? CHAPTERS[i - 1].id : null; }
/* a coach you may play: `id` if it is open, the frontier if not */
function clampCoach(ladder, id, st) { return coachOpen(ladder, id, st) ? id : frontier(ladder); }

/* and where you may play. The park (and the plain studio) are yours from
   the start; every other place opens with the first chapter set there,
   so you travel to a place before you can sit down in it. */
var PLACE_FROM = (function () {
  var out = { park: null, studio: null };
  CHAPTERS.forEach(function (c) { if (!(c.place in out)) out[c.place] = c.id; });
  return out;
})();
function placeOpen(ladder, place, st) {
  if (!(place in PLACE_FROM)) return true;
  var c = PLACE_FROM[place];
  return !c || coachOpen(ladder, c, st);
}
/* the places a win just opened: what was shut before the ladder changed
   and is open after it */
function placesOpened(before, after) {
  return Object.keys(PLACE_FROM).filter(function (p) { return !placeOpen(before, p) && placeOpen(after, p); });
}

/* the cup: who is next, and what a result does to the run */
function cupNext(st) { return CUP[st.cup.run] || CUP[0]; }
function cupResult(st, coach, won, at) {
  if (st.cup.won || coach !== cupNext(st)) return { counted: false };
  if (!won) {
    var reached = st.cup.run;
    st.cup.run = 0; st.cup.tries++;
    return { counted: true, reset: true, reached: reached };
  }
  st.cup.run++;
  st.cup.best = Math.max(st.cup.best, st.cup.run);
  if (st.cup.run >= CUP.length) {
    st.cup.won = 1; st.cup.wonAt = at || 1; st.cup.run = 0;
    return { counted: true, won: true };
  }
  return { counted: true, advanced: true, step: st.cup.run, next: CUP[st.cup.run] };
}

/* the completion: out of a hundred, and what is left of each part.
   x: { stars, lessons: {solved, total}, collect: {n, of}, cupWon } */
var WEIGHTS = { stars: 40, collect: 30, lessons: 20, cup: 10 };
function completion(x) {
  x = x || {};
  var parts = [
    { id: "stars", name: "Stars", have: x.stars | 0, of: 24, w: WEIGHTS.stars, emoji: "⭐" },
    { id: "collect", name: "Collection", have: (x.collect && x.collect.n) | 0, of: (x.collect && x.collect.of) || 1, w: WEIGHTS.collect, emoji: "🎁" },
    { id: "lessons", name: "Academy lessons", have: (x.lessons && x.lessons.solved) | 0, of: (x.lessons && x.lessons.total) || 1, w: WEIGHTS.lessons, emoji: "🎓" },
    { id: "cup", name: "The Grove Cup", have: x.cupWon ? 1 : 0, of: 1, w: WEIGHTS.cup, emoji: "🏆" }
  ];
  var pct = 0;
  parts.forEach(function (p) { p.frac = Math.max(0, Math.min(1, p.have / p.of)); pct += p.frac * p.w; });
  /* a hundred only when everything is done, never by rounding */
  var whole = parts.every(function (p) { return p.frac >= 1; });
  return { pct: whole ? 100 : Math.min(99, Math.floor(pct)), parts: parts, whole: whole };
}

var Journey = { KEY: KEY, CHAPTERS: CHAPTERS, CUP: CUP, WEIGHTS: WEIGHTS,
                chapterOf: chapterOf, fresh: fresh, clean: clean, load: load, save: save,
                cleared: cleared, road: road, cupNext: cupNext, cupResult: cupResult, completion: completion,
                coachOpen: coachOpen, frontier: frontier, openedBy: openedBy, clampCoach: clampCoach, openAhead: openAhead, after: after,
                PLACE_FROM: PLACE_FROM, placeOpen: placeOpen, placesOpened: placesOpened };
if (typeof module !== "undefined" && module.exports) module.exports = Journey;
else root.Journey = Journey;
})(typeof window !== "undefined" ? window : this);
