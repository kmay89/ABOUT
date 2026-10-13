/* modes.js — the ways to play, as data.

   Every mode here is the same engine with different settings, and this file
   is where those settings live: how fast the well falls and whether it
   speeds up, how long a landed piece waits, what happens when the well
   fills, when a run is over and what the end card says. Nothing in it runs
   a game; the app hands engine(opts) to Well.create and asks finish() when
   the engine reports something.

   ## Honest easing

   The calm modes ease the game in ways that are written down here and said
   out loud in the explainer — never adapted in secret. Gentle Descent caps
   its gravity at level 4 (about two rows a second) and drains a full well
   instead of ending; Steady and Drift fall at a speed the player chose and
   never change it on their own. Nothing watches how well you are doing and
   quietly helps. The bag is the same fair bag in every mode.

   ## Everything is open

   No mode, lesson, world or pace is locked behind another. The order of
   the lessons is a suggestion; every one can be opened first.

   ## Endings, in one vocabulary

   finish(g, ctx) is asked whenever the engine reports something that
   could end a run (a clear, a level, the game being over) and answers
   null or {why, title, lead}. ctx is {elapsedMs, opts, chapters}:
   the run's clock, its options, and — for Drift — how many chapters this
   run has already completed. The words in `why` are the ones the run
   card and records.js are both written against:

     "surface"  Descent came up through all ten depths (the engine's goal)
     "goal"     a goal reached: Forty's lines, the silt cleared, Steady's
                and Drift's rare clean stop
     "time"     Three Minutes ran out
     "filled"   a top-out in a mode that ends rather than drains
     "chapter"  Drift only, and not an ending: a chapter's lines are in.
                The app locks the piece, eases gravity to a stop and shows
                the chapter card; Rest ends the run (the app's own word,
                "rest"), Continue starts the next chapter on the same board.

   The app has three endings of its own that never come from here: "rest"
   (above), "pass" (a lesson passed) and "leave" (left a timed mode).

   ## Well codes

   A run's seed is 30 bits, written as six characters of Douglas
   Crockford's base 32 — digits and capitals without I, L, O or U, so a
   code read aloud or copied by hand survives the trip. Decoding is
   forgiving the same way Crockford meant it to be: lower case is fine,
   O reads as zero, I and L as one, and spaces, dashes and the words around
   a pasted share line are ignored. The same code gives anyone the same
   pieces, on any day — the replacement for a "daily" anything.        */
(function (root) {
"use strict";

function kit(name, file) {
  if (root[name]) return root[name];
  if (typeof module !== "undefined" && module.exports && typeof require === "function") return require(file);
  return null;
}
var Rules = kit("Rules", "./rules.js");

var Modes = {};

/* the ten worlds, top of the well to the bottom — the order is the
   contract worlds.js keeps too */
var WORLDS = ["dawn", "tide", "rain", "bamboo", "aurora", "moonpool", "lanterns", "snowfall", "bells", "starfield"];
Modes.WORLDS = WORLDS;
Modes.DEPTHS = 10;
Modes.LINES_PER_DEPTH = 25;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* ---------- time, for end cards and share lines ---------- */
Modes.formatTime = function (ms) {
  ms = Math.max(0, Math.round(ms / 10) * 10);
  var s = Math.floor(ms / 1000), cs = Math.floor((ms % 1000) / 10);
  var m = Math.floor(s / 60);
  s = s % 60;
  var hund = (cs < 10 ? "0" : "") + cs;
  if (!m) return s + "." + hund + " s";
  return m + ":" + (s < 10 ? "0" : "") + s + "." + hund;
};

/* ================================================================
   Descent — ten depths of twenty-five lines, Dawn to the Starfield
   ================================================================ */
Modes.DESCENT_PACES = [
  { id: "gentle", name: "Gentle", levelOffset: 0, gravityCap: 4, levelCap: 10, lockDelay: 750, topOut: "drain",
    line: "Never faster than about two rows a second. A full well drains instead of ending." },
  { id: "standard", name: "Standard", levelOffset: 0, gravityCap: 0, levelCap: 10, lockDelay: 500, topOut: "end",
    line: "A little quicker at every depth, from one row a second to about fifteen." },
  { id: "swift", name: "Swift", levelOffset: 5, gravityCap: 0, levelCap: 15, lockDelay: 500, topOut: "end",
    line: "Starts at about four rows a second and ends past a hundred." }
];
function paceOf(id) {
  for (var i = 0; i < Modes.DESCENT_PACES.length; i++) if (Modes.DESCENT_PACES[i].id === id) return Modes.DESCENT_PACES[i];
  return Modes.DESCENT_PACES[0];
}
Modes.pace = paceOf;

/* ================================================================
   Steady and Drift
   ================================================================ */
Modes.STEADY_PACES = [
  { id: "still", name: "Still", ms: 0, line: "Pieces wait until you drop them." },
  { id: "slow", name: "Slow", ms: 1000, line: "One row a second." },
  { id: "even", name: "Even", ms: 793, line: "A little over a row a second." }
];
/* minutes; 0 is no timer (brief §5.2) */
Modes.STEADY_LENGTHS = [10, 15, 20, 25, 0];
function steadyPace(id) {
  for (var i = 0; i < Modes.STEADY_PACES.length; i++) if (Modes.STEADY_PACES[i].id === id) return Modes.STEADY_PACES[i];
  return Modes.STEADY_PACES[1];
}

/* Drift's tide: off, then the first eight steps of the gravity curve. It
   never moves by itself. Points multiply by the tide, at least one. */
Modes.TIDE = [];
(function () {
  for (var n = 0; n <= 8; n++) {
    Modes.TIDE.push({ n: n, level: Math.max(1, n), ms: n ? Rules.gravityMs(n) : 0,
                      name: n ? "Tide " + n : "Still" });
  }
})();
Modes.tide = function (n) { return Modes.TIDE[clamp(n | 0, 0, 8)]; };
Modes.DRIFT_CHAPTERS = [40, 100, 150];

/* ================================================================
   medals
   ================================================================
   Forty (forty lines only) by time, lower is better; Three Minutes by
   points. The Three Minutes thresholds are provisional until the bot and
   real players have had a go. */
Modes.MEDALS = {
  forty: [["Pebble", 180000], ["Shell", 120000], ["Jade", 75000], ["Pearl", 45000], ["Glass", 30000]],
  three: [["Pebble", 15000], ["Shell", 30000], ["Jade", 60000], ["Pearl", 100000], ["Glass", 160000]]
};
Modes.medalFor = function (modeId, value) {
  var list = Modes.MEDALS[modeId];
  if (!list || typeof value !== "number" || !(value >= 0)) return null;
  var best = null;
  for (var i = 0; i < list.length; i++) {
    var met = modeId === "forty" ? value <= list[i][1] : value >= list[i][1];
    if (met) best = list[i][0];
  }
  return best;
};

/* ================================================================
   lessons, and the silt challenges
   ================================================================
   Lessons 1–4 are v1. Lessons 5 and 6 have no prepared wells yet
   (later:true): they run as free play from an empty well that counts
   Twist Doubles, so they are open like everything else, and their pass
   lines say only what the coach can actually judge — every slot in an
   empty well is one you built, but how many pieces it took is not
   counted, so the pass line doesn't claim it.

   The two silt challenges are kept in their own list, SILT, and appear
   nowhere else — every consumer (the Challenges sheet, the coach, the
   records) reads lessons from LESSONS and silt from SILT, and
   Modes.lesson(id) finds either.

   Each entry's `engine` block is the one truth about how that challenge
   plays. The coach asks for it through challenges.engine() rather than
   keeping its own copy, and the app applies it after the player's
   handling, so a lesson that needs Keep off or no previews gets them.

   Fewest Moves (brief §10.2) is the referee's table played for real: no
   gravity, because the table assumes none; no Keep, because the lesson is
   every piece *as it comes* to its outline; a long lock; and a well that
   drains rather than ends, because after the pass the lesson carries on
   as a free-stacking audit with no natural end.

   The Twist Slot boards are our own, drawn on our 22-row well, and every
   one is checked by tools/rules-check.js: the intended placement must be
   reachable from spawn by turns, moves and soft drop alone, and the real
   engine must call it a full Twist that clears two rows. Each slot needs a
   turn to get into — a T dropped or slid there is not a Twist, and none of
   these slots can be filled that way. Boards are strings, top row first,
   the last string being row 0; letters are pieces, G is old silt. A
   prepared well deals its one T and then halts (queueThen "end"): the
   coach judges the T and asks the app for the next well. */
var SLOT_BOARDS = [
  { board: ["TTT......L",
            "JT...SSLLL",
            "JJJ.SSIIII"],
    queue: "T", intended: { type: 3, rot: 2, x: 3, y: 1, twist: "full", lines: 2 },
    hint: "The roof is on the left. Come down beside it, then turn the T in underneath." },
  { board: ["..J....TTT",
            "OOJJJ...TL",
            "OOIIII.LLL",
            "GGGGGGGG.G",
            "G.GGGGGGGG"],
    queue: "T", intended: { type: 3, rot: 2, x: 6, y: 3, twist: "full", lines: 2 },
    hint: "Higher up this time, with the roof on the right. Three corners around the gap are filled." },
  { board: ["..LLLSS...",
            "..LJSSIIII",
            "...JJJIIII",
            "G.GGGGGGGG"],
    queue: "T", intended: { type: 3, rot: 2, x: 1, y: 1, twist: "full", lines: 2 },
    hint: "Against the left wall. The wall counts as a filled corner." },
  { board: ["LOO...TTT.",
            "LOOT...TLI",
            "LLTTT.LLLI",
            "OO.SSTJJJI",
            "OOSSTTT.JI",
            "GGGG.GGGGG"],
    queue: "T", intended: { type: 3, rot: 2, x: 5, y: 4, twist: "full", lines: 2 },
    hint: "In the middle of a tall well. Find the gap shaped like an upside-down T." },
  { board: ["ZZTTTZZ...",
            "IZZTOOZZ..",
            "IOOJOOT...",
            "IOOJJJTT.L",
            "I.IIIITLLL",
            "GGGGGG.GGG"],
    queue: "T", intended: { type: 3, rot: 2, x: 8, y: 3, twist: "full", lines: 2 },
    hint: "Down the open right-hand side, then turn under the ledge." }
];

Modes.LESSONS = [
  { id: "finesse", n: 1, kind: "finesse", name: "Fewest Moves",
    teaches: "Every piece to any column in the fewest presses.",
    pass: "Twenty pieces in a row placed in the fewest presses.", need: 20, world: "dawn",
    engine: { gravity: 0, keep: false, lockDelay: 1000, topOut: "drain" } },
  { id: "keep", n: 2, kind: "keep", name: "Keep and Look Ahead",
    teaches: "Using Keep and the previews to avoid holes.",
    pass: "Forty pieces with no covered holes.", need: 40, world: "tide",
    engine: { gravity: Rules.gravityMs(1), keep: true, lockDelay: 1000, topOut: "end" } },
  { id: "clean", n: 3, kind: "clean", name: "Clean Stacking",
    teaches: "Keep nine columns flat and the long piece for the tenth.",
    pass: "Three Quads within forty lines.", need: 3, world: "rain",
    engine: { gravity: Rules.gravityMs(1), keep: true, lockDelay: 1000, topOut: "end", goalLines: 40 } },
  { id: "slot", n: 4, kind: "slot", name: "The Twist Slot",
    teaches: "Recognising the three-corner shape.",
    pass: "Five Twist Doubles from five prepared wells.", need: 5, world: "lanterns",
    boards: SLOT_BOARDS,
    engine: { gravity: 0, keep: false, lockDelay: 1000, topOut: "end", queueThen: "end" } },
  { id: "build", n: 5, kind: "slot", name: "Build a Slot", later: true,
    teaches: "Making the overhang yourself.",
    pass: "Five Twist Doubles, each in a slot you built yourself.", need: 5, world: "lanterns",
    engine: { gravity: Rules.gravityMs(1), keep: true, lockDelay: 1000, topOut: "end" } },
  { id: "freestyle", n: 6, kind: "slot", name: "Freestyle Twists", later: true,
    teaches: "Twists without a fixed setup.",
    pass: "Ten Twist Doubles in a row.", need: 10, world: "lanterns",
    engine: { gravity: Rules.gravityMs(1), keep: true, lockDelay: 1000, topOut: "end" } }
];
/* Silt (brief §10.2): clear the rows from a well that starts with them.
   Time is the record, lower is better; a top-out rests the run. */
Modes.SILT = [
  { id: "silt10", kind: "silt", name: "Silt \u00b7 ten rows", rows: 10, world: "moonpool",
    teaches: "Digging: one hole in every row, never two in a column.",
    pass: "Clear all ten rows of silt.", need: 10,
    engine: { gravity: Rules.gravityMs(1), keep: true, lockDelay: 500, topOut: "end", silt: 10 } },
  { id: "silt18", kind: "silt", name: "Silt \u00b7 eighteen rows", rows: 18, world: "moonpool",
    teaches: "Digging deep, most of the well full of silt.",
    pass: "Clear all eighteen rows of silt.", need: 18,
    engine: { gravity: Rules.gravityMs(1), keep: true, lockDelay: 500, topOut: "end", silt: 18 } }
];
/* a lesson or a silt challenge, by id */
Modes.lesson = function (id) {
  var i;
  for (i = 0; i < Modes.LESSONS.length; i++) if (Modes.LESSONS[i].id === id) return Modes.LESSONS[i];
  for (i = 0; i < Modes.SILT.length; i++) if (Modes.SILT[i].id === id) return Modes.SILT[i];
  return null;
};

/* ================================================================
   the modes
   ================================================================ */
function copy(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
function merge(base, extra) { var r = copy(base); for (var k in extra) r[k] = extra[k]; return r; }

/* the shared end cards */
var FILLED = { why: "filled", title: "The well filled.", lead: "Rest for a moment, or begin again." };
var RESTS = { why: "goal", title: "The well rests.", lead: "" };
function overCard(g, goal) {
  if (!g.over) return null;
  if (g.overWhy === "goal" || g.overWhy === "time") return goal;
  return FILLED;
}

var descent = {
  id: "descent", name: "Descent", group: "play",
  line: "Ten depths, from Dawn to the stars at the bottom of the well.",
  hasBreath: true, resumable: true, scoreShown: true, pbBetter: "high",
  options: { pace: "gentle", depth: 1 },
  pbKey: function (opts) { return "descent." + paceOf(opts && opts.pace).id; },
  engine: function (opts) {
    opts = merge(descent.options, opts || {});
    var pace = paceOf(opts.pace), d = clamp(opts.depth | 0, 1, 10);
    return {
      mode: "descent", pace: pace.id, depth: d,
      level: d + pace.levelOffset, levelCap: pace.levelCap,
      gravity: pace.gravityCap ? { cap: pace.gravityCap } : "curve",
      linesPerLevel: Modes.LINES_PER_DEPTH, goalLines: (11 - d) * Modes.LINES_PER_DEPTH,
      lockDelay: pace.lockDelay, moveResets: Rules.MOVE_RESETS,
      spawnDelay: 100, clearDelay: 250, topOut: pace.topOut, breath: true
    };
  },
  world: function (opts, depth) { return WORLDS[clamp((depth | 0) || 1, 1, 10) - 1]; },
  depthOf: function (g) {
    var off = paceOf(g.opts && g.opts.pace).levelOffset;
    return clamp(g.level - off, 1, 10);
  },
  /* lines still to go in the current depth, for the HUD */
  linesLeft: function (g) { return Modes.LINES_PER_DEPTH - (g.lines % Modes.LINES_PER_DEPTH); },
  finish: function (g) {
    if (!g.over) return null;
    if (g.overWhy === "goal") {
      return { why: "surface", title: "The Surface",
               lead: "Down through all ten depths, and back up into the light." };
    }
    /* the card only offers "this depth" below the first one: at Depth 1,
       beginning again from it is simply Again */
    return { why: "filled", title: "The well filled.",
             lead: descent.depthOf(g) > 1 ? "Rest for a moment, or begin again from this depth." : "Rest for a moment, or begin again." };
  }
};

var steady = {
  id: "steady", name: "Steady", group: "calm",
  line: "A quiet twenty minutes. Slow, even, nothing sudden.",
  hasBreath: false, resumable: true, scoreShown: false, pbBetter: "high",
  options: { length: 20, pace: "slow", landing: true, sound: "soft", world: "snowfall" },
  pbKey: function () { return null; },
  engine: function (opts) {
    opts = merge(steady.options, opts || {});
    return {
      mode: "steady", gravity: steadyPace(opts.pace).ms, level: 1, linesPerLevel: 0,
      lockDelay: 1000, moveResets: Rules.MOVE_RESETS, spawnDelay: 200, clearDelay: 400,
      topOut: "drain", breath: false, scoring: true
    };
  },
  world: function (opts) { return (opts && opts.world) || steady.options.world; },
  depthOf: function () { return null; },
  /* Steady never ends by itself: its soft timer belongs to steady.js */
  finish: function (g) { return overCard(g, RESTS); }
};

var drift = {
  id: "drift", name: "Drift", group: "calm",
  line: "Endless, unhurried play in chapters.",
  hasBreath: true, resumable: true, scoreShown: true, pbBetter: "high",
  options: { tide: 2, chapter: 40, world: "dawn" },
  pbKey: function () { return null; },
  engine: function (opts) {
    opts = merge(drift.options, opts || {});
    var t = Modes.tide(opts.tide);
    return {
      mode: "drift", gravity: t.ms, level: t.level, linesPerLevel: 0,
      lockDelay: 1000, moveResets: Rules.MOVE_RESETS, spawnDelay: 150, clearDelay: 300,
      topOut: "drain", breath: true
    };
  },
  world: function (opts) { return (opts && opts.world) || drift.options.world; },
  depthOf: function () { return null; },
  /* ctx.chapters = chapters already completed in this run. A chapter's
     end is "chapter", a boundary rather than an ending (see the header);
     the run itself ends only when the player chooses Rest. */
  finish: function (g, ctx) {
    var opts = merge(drift.options, (ctx && ctx.opts) || {});
    var done = (ctx && ctx.chapters) || 0, size = opts.chapter || 40;
    if (!g.over && g.lines >= (done + 1) * size) {
      return { why: "chapter", title: "Chapter complete", lead: size + " lines" };
    }
    return overCard(g, RESTS);
  }
};

var forty = {
  id: "forty", name: "Forty", group: "race",
  line: "Clear forty lines as smoothly as you can.",
  hasBreath: false, resumable: false, scoreShown: false, pbBetter: "low",
  options: { lines: 40 },
  pbKey: function (opts) { return "forty." + ((opts && opts.lines) || 40); },
  engine: function (opts) {
    opts = merge(forty.options, opts || {});
    return {
      mode: "forty", gravity: Rules.gravityMs(1), level: 1, linesPerLevel: 0,
      lockDelay: 500, moveResets: Rules.MOVE_RESETS, spawnDelay: 0, clearDelay: 0,
      topOut: "end", breath: false, goalLines: opts.lines || 40
    };
  },
  world: function () { return "tide"; },
  depthOf: function () { return null; },
  finish: function (g, ctx) {
    if (!g.over) return null;
    if (g.overWhy === "goal") {
      var lines = (ctx && ctx.opts && ctx.opts.lines) || g.opts.goalLines || 40;
      var t = ctx && typeof ctx.elapsedMs === "number" ? ctx.elapsedMs : g.time;
      return { why: "goal", title: "The well rests.", lead: lines + " lines in " + Modes.formatTime(t) + "." };
    }
    return { why: "filled", title: "The well filled.", lead: "Rest, or begin again." };
  }
};

var three = {
  id: "three", name: "Three Minutes", group: "race",
  line: "Three minutes, as many points as feel good.",
  hasBreath: false, resumable: false, scoreShown: true, pbBetter: "high",
  options: {},
  pbKey: function () { return "three"; },
  engine: function () {
    return {
      mode: "three", gravity: "curve", level: 1, levelCap: Rules.LEVEL_MAX, linesPerLevel: "three",
      lockDelay: 500, moveResets: Rules.MOVE_RESETS, spawnDelay: 0, clearDelay: 0,
      topOut: "end", breath: false, timeLimit: 180000
    };
  },
  world: function () { return "aurora"; },
  depthOf: function () { return null; },
  finish: function (g) {
    if (!g.over) return null;
    if (g.overWhy === "time") return { why: "time", title: "The well rests.", lead: "Three minutes." };
    return { why: "filled", title: "The well filled.", lead: "The points are yours. Rest for a moment, or begin again." };
  }
};

var challenges = {
  id: "challenges", name: "Challenges", group: "learn",
  line: "Lessons, puzzles and silt. Learn the deep stuff at your own pace.",
  hasBreath: false, resumable: false, scoreShown: false, pbBetter: "low",
  options: { id: "finesse", board: 0 },
  pbKey: function (opts) {
    var l = Modes.lesson(opts && opts.id);
    return l && l.kind === "silt" ? "silt." + l.rows : null;
  },
  /* opts.id picks the lesson or silt challenge; opts.board the prepared
     well for a slot lesson */
  engine: function (opts) {
    opts = merge(challenges.options, opts || {});
    var l = Modes.lesson(opts.id) || Modes.LESSONS[0];
    var e = merge({ mode: "challenges", lesson: l.id, level: 1, linesPerLevel: 0,
                    moveResets: Rules.MOVE_RESETS, spawnDelay: 100, clearDelay: 250, breath: false },
                  l.engine || {});
    if (l.boards && l.boards.length) {
      var b = l.boards[clamp(opts.board | 0, 0, l.boards.length - 1)];
      e.board = b.board.slice();
      e.queue = b.queue;
      e.queueThen = "end";
      e.previews = 0;
    }
    return e;
  },
  world: function (opts) {
    var l = Modes.lesson(opts && opts.id);
    return (l && l.world) || "dawn";
  },
  depthOf: function () { return null; },
  finish: function (g, ctx) {
    if (!g.over) return null;
    var l = Modes.lesson((ctx && ctx.opts && ctx.opts.id) || (g.opts && g.opts.lesson));
    if (g.overWhy === "goal") {
      if (l && l.kind === "silt") return { why: "goal", title: "The silt is clear.", lead: l.rows + " rows, dug out." };
      return { why: "goal", title: "The well rests.", lead: "Forty lines." };
    }
    return { why: "filled", title: "The well filled.", lead: "Rest for a moment, or try again." };
  }
};

Modes.list = [descent, steady, drift, forty, three, challenges];
Modes.get = function (id) {
  for (var i = 0; i < Modes.list.length; i++) if (Modes.list[i].id === id) return Modes.list[i];
  return null;
};

/* The whole Well.create option set for a run, less the seed: the player's
   handling settings first (previews, keep, modern, irs, ihs, sdf), then the
   mode's own, which win where a mode must decide — a lesson that turns
   Keep off, a slot board with no previews. */
var HANDLING = ["previews", "keep", "modern", "irs", "ihs", "sdf"];
Modes.options = function (modeId, opts, handling) {
  var m = Modes.get(modeId);
  if (!m) return null;
  var out = {}, i;
  if (handling) for (i = 0; i < HANDLING.length; i++) {
    var k = HANDLING[i];
    if (handling[k] !== undefined) out[k] = handling[k];
  }
  var e = m.engine(opts || {});
  for (var key in e) out[key] = e[key];
  return out;
};

/* ================================================================
   well codes
   ================================================================ */
var ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
Modes.code = {
  ALPHABET: ALPHA,
  BITS: 30,
  encode: function (seed) {
    var s = (seed >>> 0) & 0x3FFFFFFF, out = "";
    for (var i = 5; i >= 0; i--) out += ALPHA.charAt((s >>> (5 * i)) & 31);
    return out;
  },
  decode: function (str) {
    if (typeof str !== "string") return null;
    var t = str.toUpperCase();
    var at = t.lastIndexOf("CODE");
    if (at >= 0) t = t.slice(at + 4);
    t = t.replace(/[\s\-_.,:;#·•–—]/g, "");
    t = t.replace(/O/g, "0").replace(/[IL]/g, "1");
    if (t.length !== 6) return null;
    var v = 0;
    for (var i = 0; i < 6; i++) {
      var n = ALPHA.indexOf(t.charAt(i));
      if (n < 0) return null;
      v = v * 32 + n;
    }
    return v;
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = Modes;
else root.Modes = Modes;
})(typeof self !== "undefined" ? self : this);
