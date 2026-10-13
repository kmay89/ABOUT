/* learn.js — the explainer: why it absorbs you, how it really works, and
   what the research can and can't say.

   This room makes a promise the other rooms only imply: it explains itself
   truthfully. So the "How it works" page does not quote its numbers, it
   measures them. When the page opens it builds small hidden wells with the
   real engine and plays them: a Quad, a quiet piece and a Twist Double at
   level 3, four Singles in a row, a piece left on the floor until it locks,
   a piece shuffled from side to side until it runs out of resets, three
   turns that need a kick. Every number in every table is read back from
   those games, from the engine's own clock and from the same rule tables
   the engine plays by. If somebody retunes the game, the page retunes with
   it; it cannot drift, because it isn't a copy.

   The other half of the promise is restraint. The page on Steady is the
   most carefully worded thing in the room. It says what the research found,
   what the studies actually did, what they did not show, and that this game
   has never been tested and is not a treatment — in that order, in plain
   words, using only the wording that survived a fact-check. It never asks
   anyone to recall anything, and it never records who read it.

   Everything that touches the document happens inside functions the
   browser calls, so node can load this file and read the help lines, the
   copy and the measurements without a page (tools/well-check.js does).

   The diagrams are drawn by hand on small canvases in the player's own
   skin: fused pieces, a stone stack, the well's dark water behind. The kick
   diagram animates its five tests one at a time; with reduced motion it
   becomes a stepper you move through yourself. No diagram here is copied
   from anywhere — they are boards we built and checked against the engine,
   and each one says so when the engine agrees.                            */
(function (root) {
"use strict";

/* ---------- the other modules, read late ---------- */
function mod(name, file) {
  if (root && root[name]) return root[name];
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    try { return require(file); } catch (e) { return null; }
  }
  return null;
}
function Rules() { return mod("Rules", "./rules.js"); }
function Well() { return mod("Well", "./engine.js"); }
function Modes() { return mod("Modes", "./modes.js"); }
function Skins() { return mod("Skins", "./skins.js"); }
function PrefsMod() { return mod("Prefs", "./prefs.js"); }

var LETTERS = ["I", "O", "T", "S", "Z", "J", "L"];

/* ================================================================
   the words
   ================================================================ */

var Learn = {};

Learn.sections = [
  { id: "why", title: "Why it's absorbing", short: "Why it absorbs",
    lead: "A falling-blocks game can hold your attention for an hour with seven shapes and one rule. Here is what is going on underneath, and where the science stops." },
  { id: "how", title: "How it works", short: "How it works",
    lead: "The real rules, read from the game itself as this page opens." },
  { id: "steady", title: "Why this might help — and what it can't do", short: "Might it help?",
    lead: "The research behind the headline, what the studies actually did, and what this game is and isn't." },
  { id: "controls", title: "Controls", short: "Controls",
    lead: "Everything you can press, tap or flick, for the device you're on." },
  { id: "refuses", title: "What The Well won't do", short: "What it won't do",
    lead: "The things this game deliberately leaves out, and why." }
];

/* The in-game credits, as the legal brief wrote them. */
Learn.ABOUT = "The Well is an independent falling-blocks game. Not affiliated with or endorsed by The Tetris Company. Tetris® is a registered trademark of Tetris Holding, LLC.";

/* The paragraph that closes every page that discusses the research. The
   research page cites only studies of the licensed game; the page on why
   it's absorbing also cites slot machines, other games and players in
   general, so its first sentence is only as wide as that is true. The
   legal sentence is the same, word for word, on both. */
Learn.FOOTER = "Studies cited here used Tetris®, the licensed game, inside specific research protocols. The Well is not Tetris, is not a treatment, and makes no health claims.";
Learn.FOOTER_MIXED = "Where studies cited here used Tetris®, they used the licensed game, inside specific research protocols. The Well is not Tetris, is not a treatment, and makes no health claims.";

Learn.CREDIT = "We cross-checked the rotation and scoring tables against the open-source projects cold-clear, Techmino, Triangle.js and python-tetris.";

/* Help lines. Shown only on the Steady page and behind "Help lines" in
   Steady's pause sheet — never as a pop-up, and nothing records that they
   were opened. `tel` and `sms` are digits only, ready for a link; `show` is
   how a number is written for reading; `say`, where there is one, is what
   a screen reader hears after the link's own words, in place of the label. The numbers were checked on the
   date below, and a tools/ check flags the list once it is more than a
   year old: re-check every six to twelve months. The 988 Lifeline's old
   option 3 ended on 17 July 2025 and is deliberately absent. */
Learn.HELP = {
  verified: "2026-10-13",
  lines: [
    { region: "United States", items: [
      { label: "988 Suicide & Crisis Lifeline", tel: "988", sms: "988", url: "https://988lifeline.org",
        note: "Call or text 988, or chat at 988lifeline.org. Spanish: press 2, or text AYUDA to 988." },
      { label: "Veterans Crisis Line", tel: "988", sms: "838255", say: "then press 1 for the Veterans Crisis Line",
        note: "Dial 988 then press 1, or text 838255." },
      { label: "Crisis Text Line", sms: "741741", note: "Text HOME to 741741." }
    ] },
    { region: "UK and Republic of Ireland", items: [
      { label: "Samaritans", tel: "116123", show: "116 123", note: "Call 116 123, free and 24/7." }
    ] },
    { region: "UK", items: [
      { label: "Shout", sms: "85258", note: "Text SHOUT to 85258." },
      { label: "NHS 111 (England)", tel: "111", note: "Call 111 and choose the mental health option." }
    ] },
    { region: "Everywhere else", items: [
      { label: "Find A Helpline", url: "https://findahelpline.com", note: "Free, verified helplines in many countries." }
    ] },
    { region: "If you or someone else is in immediate danger", note: "Call your local emergency number.", compact: true, items: [
      { label: "US and Canada", tel: "911", say: "emergency services, US and Canada", note: "Emergency services." },
      { label: "UK", tel: "999", say: "emergency services, UK", note: "Emergency services." },
      { label: "EU and many other countries", tel: "112", say: "emergency services, EU and many other countries", note: "Emergency services." }
    ] }
  ]
};

/* ---------- small helpers ---------- */
function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt(n) {
  var neg = n < 0, s = String(Math.round(Math.abs(n)));
  s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "−" : "") + s;
}
function num(n, d) { return n.toFixed(d); }
var WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
             "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
function word(n) { return WORDS[n] || String(n); }
function times(r) {
  if (Math.abs(r - 2) < 1e-9) return "double";
  if (Math.abs(r - 3) < 1e-9) return "triple";
  return num(r, r === Math.round(r) ? 0 : 1) + "×";
}
function merge(a, b) {
  var o = {}, k;
  for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
  if (b) for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) o[k] = b[k];
  return o;
}
function pref(ctx, k, dflt) {
  var p = ctx && ctx.prefs, v;
  if (p && typeof p.get === "function") v = p.get(k);
  else if (p && p[k] !== undefined) v = p[k];
  if (v === undefined) {
    var P = PrefsMod();
    if (P && P.DEFAULTS && P.DEFAULTS[k] !== undefined) v = P.DEFAULTS[k];
  }
  return v === undefined ? dflt : v;
}

/* ================================================================
   measuring the game
   ================================================================
   Each measurement builds a tiny hidden well and plays it with the real
   engine. Falls use a quick constant gravity (points don't depend on it);
   drop points are subtracted from score changes using the engine's own
   events, so what is left is exactly what the scorer paid for the clear. */

function names() { var R = Rules(); return (R && R.NAMES) || ["", "I", "O", "T", "S", "Z", "J", "L"]; }
function letterOf(t) { return typeof t === "number" ? (names()[t] || "") : String(t || ""); }

/* How the engine names a piece — by number or by letter — learned once
   from a real spawn, so every call hands it its own kind of name. */
var nameKind = null;
function kindOfName() {
  if (nameKind) return nameKind;
  var W = Well();
  nameKind = "letter";
  if (W) {
    try { var g = W.create({ seed: 1, queue: "T", queueThen: "end", gravity: 0 }); nameKind = typeof g.active.type === "number" ? "number" : "letter"; } catch (e) {}
  }
  return nameKind;
}
function typeOf(letter) { return kindOfName() === "number" ? names().indexOf(letter) : letter; }

/* The shape of a piece, relative to its rotation centre. From the engine
   when it is there; otherwise the published SRS states (y up). */
function rot90(p) { return [p[1], -p[0]]; }
function states(n) {
  var out = [n];
  for (var i = 1; i < 4; i++) {
    var prev = out[i - 1], next = [];
    for (var j = 0; j < prev.length; j++) next.push(rot90(prev[j]));
    out.push(next);
  }
  return out;
}
var FALLBACK = null;
function fallbackShapes() {
  if (FALLBACK) return FALLBACK;
  var sq = [[0, 0], [1, 0], [0, 1], [1, 1]];
  FALLBACK = {
    T: states([[-1, 0], [0, 0], [1, 0], [0, 1]]), J: states([[-1, 1], [-1, 0], [0, 0], [1, 0]]),
    L: states([[1, 1], [-1, 0], [0, 0], [1, 0]]), S: states([[-1, 0], [0, 0], [0, 1], [1, 1]]),
    Z: states([[-1, 1], [0, 1], [0, 0], [1, 0]]),
    I: [[[-1, 0], [0, 0], [1, 0], [2, 0]], [[1, 1], [1, 0], [1, -1], [1, -2]],
        [[-1, -1], [0, -1], [1, -1], [2, -1]], [[0, 1], [0, 0], [0, -1], [0, -2]]],
    O: [sq, sq, sq, sq]
  };
  return FALLBACK;
}
function cellsOf(letter, rot, x, y) {
  var W = Well();
  if (W && W.cells) {
    try { var c = W.cells(typeOf(letter), rot, x, y); if (c && c.length === 4) return c; } catch (e) {}
  }
  var s = fallbackShapes()[letter][rot], out = [];
  for (var i = 0; i < 4; i++) out.push([x + s[i][0], y + s[i][1]]);
  return out;
}

/* The kick tests, as rules.js stores them (y up). */
var ORDER = ["0", "R", "2", "L"];
var KICK_FALLBACK = {
  JLSTZ: { "0R": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], "R0": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
           "R2": [[0,0],[1,0],[1,-1],[0,2],[1,2]],     "2R": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
           "2L": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],    "L2": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
           "L0": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],  "0L": [[0,0],[1,0],[1,1],[0,-2],[1,-2]] },
  I:     { "0R": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],   "R0": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
           "R2": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],   "2R": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
           "2L": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],   "L2": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
           "L0": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],   "0L": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]] }
};
function kickList(letter, from, to) {
  var R = Rules(), key = ORDER[from] + ORDER[to], t = null, src = "rules";
  if (R) t = letter === "I" ? (R.KICKS_I || (R.KICKS && R.KICKS.I)) : (R.KICKS_JLSTZ || (R.KICKS && R.KICKS.JLSTZ));
  if (!t || !t[key]) { t = letter === "I" ? KICK_FALLBACK.I : KICK_FALLBACK.JLSTZ; src = "copy"; }
  return { tests: t[key], source: src };
}

/* the score tables, from rules.js under whichever name it uses */
function scoreTables() {
  var R = Rules() || {};
  var line = R.LINE_SCORE || R.SCORE || R.SCORES || R.LINES || null;
  if (line && !(line.none && line.full)) line = null;
  var empty = R.EMPTY_BONUS || R.EMPTY || null;
  var eq = R.EMPTY_UNBROKEN_QUAD || R.EMPTY_QUAD || null;
  return {
    line: line || { none: [0, 100, 300, 500, 800], mini: [100, 200, 400], full: [400, 800, 1200, 1600] },
    empty: empty || [0, 800, 1200, 1800, 2000], emptyQuad: eq || 3200,
    soft: typeof R.SOFT_POINTS === "number" ? R.SOFT_POINTS : 1,
    hard: typeof R.HARD_POINTS === "number" ? R.HARD_POINTS : 2,
    ripple: typeof R.RIPPLE_POINTS === "number" ? R.RIPPLE_POINTS : 50,
    fromRules: !!line
  };
}

/* ---------- a hidden well, played by script ---------- */
function makeGame(opts) {
  var W = Well();
  var g = W.create(merge({ seed: 1, level: 1, gravity: 20, levelCap: 20, linesPerLevel: 0, lockDelay: 500,
    moveResets: 15, spawnDelay: 0, clearDelay: 0, keep: false, previews: 6, topOut: "end", breath: false,
    scoring: true, queueThen: "end" }, opts));
  W.drain(g);
  return g;
}
function ready(g) {
  var W = Well(), n = 0;
  while (!g.active && !g.over && n++ < 3000) W.step(g, 4);
  return !!g.active;
}
/* Run a script of engine actions plus one of our own, "fall": let gravity
   take the piece down to wherever it rests. Returns every event, and the
   points the scorer paid with drop points taken out. */
function play(g, ops) {
  var W = Well(), evs = [], before = g.score, dropPts = 0, i, j, e;
  for (i = 0; i < ops.length; i++) {
    if (!ready(g)) break;
    var op = ops[i];
    if (op === "fall") {
      var n = 0;
      while (g.active && W.landingY(g) !== g.active.y && n++ < 20000) {
        W.step(g, 4);
        var fe = W.drain(g);
        for (j = 0; j < fe.length; j++) evs.push(fe[j]);
      }
    } else W.act(g, op);
    var got = W.drain(g);
    for (j = 0; j < got.length; j++) evs.push(got[j]);
  }
  for (j = 0; j < 50 && !g.over && !g.active; j++) { W.step(g, 4); var tail = W.drain(g); for (i = 0; i < tail.length; i++) evs.push(tail[i]); }
  for (j = 0; j < evs.length; j++) {
    e = evs[j];
    if (e.t === "hard") dropPts += 2 * (e.rows || 0);
    if (e.t === "soft") dropPts += (e.rows || 0);
  }
  return { events: evs, points: g.score - before - dropPts, raw: g.score - before };
}
function find(evs, t) { for (var i = evs.length - 1; i >= 0; i--) if (evs[i].t === t) return evs[i]; return null; }
function findAll(evs, t) { var o = []; for (var i = 0; i < evs.length; i++) if (evs[i].t === t) o.push(evs[i]); return o; }

/* The boards the page plays and draws. Ours, built on our coordinates and
   checked against the engine every time the page opens. Rows are written
   top row first; the last string is row 0. */
var BOARDS = {
  /* a slot under an overhang, the classic Twist Double */
  slot: ["XXX.......", "XXXX......", "XXX...XXXX", "XXXX.XXXXX"],
  /* the deep slot that only the fifth test reaches */
  deep: ["XXXX......", "XXX.......", "XXX.XXXXXX", "XXX..XXXXX", "XXX..XXXXX"],
  /* the same, one row filled further, so it clears three */
  deep3: ["XXXX......", "XXX.......", "XXX.XXXXXX", "XXX..XXXXX", "XXX.XXXXXX"],
  /* a T turned against the left wall: three corners, one at the front */
  mini: [".XXXXXXXXX"],
  /* the worked example: four rows for a Quad on top of the deep slot */
  example: ["XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.", "XXXXXXXXX.",
            "XXXX...XXX", "XXX....XXX", "XXX.XXXXXX", "XXX..XXXXX", "XXX..XXXXX"]
};
function rows(n, s) { var o = []; for (var i = 0; i < n; i++) o.push(s); return o; }

/* the kick diagram's three scenes */
var SCENES = [
  { id: "wall", name: "Off a wall", piece: "T", from: 1, to: 2, x: 0, y: 1, board: [".....XXXXX", "...XXXXXXX"],
    script: ["cw", "dasLeft", "fall", "cw"],
    say: "The T stands against the left wall. Turned where it is, it would poke into the wall, so the game slides it one step right." },
  { id: "slot", name: "Into a slot", piece: "T", from: 0, to: 1, x: 4, y: 3, board: BOARDS.deep,
    script: ["right", "fall", "left", "cw"],
    say: "The T has slid under the overhang. The first four tests all collide; the fifth drops it one left and two down, into the slot." },
  { id: "long", name: "The long piece", piece: "I", from: 0, to: 1, x: 7, y: 0, board: [],
    script: ["dasRight", "fall", "cw"],
    say: "The I lies on the floor against the right wall. It has its own list of five, and here only the last one fits: one right and two up." }
];

var cache = null;
/* Every number the How page shows, measured. Safe to call in node. */
Learn.live = function (opts) {
  opts = opts || {};
  if (cache && !opts.fresh && cache.seed === (opts.seed || cache.seed)) return cache;
  var W = Well(), R = Rules() || {}, out = { engine: !!W, checks: [], seed: opts.seed || 0x2C9B71 };
  var T = scoreTables();
  out.tables = T;
  out.W = R.W || 10; out.VISIBLE = R.VISIBLE || 22; out.H = R.H || 40;

  function check(what, want, got) {
    var ok = got !== null && got !== undefined && Math.abs(got - want) < 1e-6;
    out.checks.push({ what: what, want: want, got: got, ok: ok });
    return ok;
  }

  /* gravity, one level at a time, straight from the engine's own clock */
  out.gravity = [];
  for (var L = 1; L <= 15; L++) {
    var ms = null;
    if (W) { try { ms = W.gravityMs(makeGame({ level: L, gravity: "curve", queue: "T" })); } catch (e) { ms = null; } }
    var fn = R.secPerRow || R.secondsPerRow || R.curve;
    var formula = Math.pow(0.8 - (L - 1) * 0.007, L - 1) * 1000;
    if (ms === null && typeof fn === "function") { try { ms = fn(L) * (fn(1) < 10 ? 1000 : 1); } catch (e2) {} }
    if (ms === null) ms = formula;
    out.gravity.push({ level: L, ms: ms, sec: ms / 1000, rps: 1000 / ms });
    check("gravity level " + L, Math.round(formula * 10) / 10, Math.round(ms * 10) / 10);
  }
  if (!W) return (cache = out);

  /* line clears, each played: an I dropped into a well n rows deep */
  out.measured = {};
  var labels = ["", "Single", "Double", "Triple", "Quad"];
  for (var n = 1; n <= 4; n++) {
    try {
      /* a base row that never clears, so no Empty Well bonus joins in */
      var r = play(makeGame({ board: rows(n, "XXXXXXXXX.").concat(["XXXXX....X"]), queue: "I" }), ["cw", "dasRight", "hard"]);
      out.measured[labels[n]] = r.points;
      check(labels[n], T.line.none[n], r.points);
    } catch (e3) {}
  }
  /* four Singles in a row: the Ripple */
  try {
    var r4 = play(makeGame({ board: rows(4, "XXXXXX....").concat(["XXXXXXXXX."]), queue: "IIII" }),
      ["dasRight", "hard", "dasRight", "hard", "dasRight", "hard", "dasRight", "hard"]);
    out.measured.fourSingles = r4.points;
    out.measured.singles = findAll(r4.events, "clear").length;
  } catch (e4) {}
  /* a Single that empties the well */
  try {
    var r5 = play(makeGame({ board: ["XXXXXX...."], queue: "I" }), ["dasRight", "hard"]);
    out.measured.emptySingle = r5.points;
    check("Single with Empty Well", T.line.none[1] + T.empty[1], r5.points);
  } catch (e5) {}
  /* the drops themselves: a hard drop from the top, a short soft drop */
  try {
    var gd = makeGame({ queue: "TT", gravity: 0 });
    var before = gd.score, hr = play(gd, ["hard"]), he = find(hr.events, "hard");
    out.measured.hardPerRow = he && he.rows ? (gd.score - before) / he.rows : null;
    ready(gd);
    var b2 = gd.score, y0 = gd.active.y;
    W.act(gd, "softOn");
    for (var s = 0; s < 400 && gd.active && y0 - gd.active.y < 3; s++) W.step(gd, 1);
    W.act(gd, "softOff");
    var dropped = y0 - gd.active.y;
    out.measured.softPerRow = dropped ? (gd.score - b2) / dropped : null;
    W.drain(gd);
  } catch (e6) {}
  /* the Twists */
  try {
    var mini = play(makeGame({ board: BOARDS.mini, queue: "T" }), ["left", "left", "left", "fall", "cw", "hard"]);
    var ml = find(mini.events, "lock"), mc = find(mini.events, "clear");
    out.twistMini = { twist: ml && ml.twist, label: mc && mc.label, points: mini.points,
                      kick: (find(mini.events, "rotate") || {}).kick };
    check("Mini Twist Single", T.line.mini[1], mini.points);
  } catch (e7) {}
  try {
    var full = play(makeGame({ board: BOARDS.slot, queue: "T" }), ["fall", "cw", "fall", "cw", "hard"]);
    var fl = find(full.events, "lock"), fc = find(full.events, "clear");
    out.twistFull = { twist: fl && fl.twist, label: fc && fc.label, points: full.points };
    check("Twist Double", T.line.full[2], full.points);
  } catch (e8) {}
  try {
    var tri = play(makeGame({ board: BOARDS.deep3, queue: "T" }), ["right", "fall", "left", "cw", "hard"]);
    var tc = find(tri.events, "clear");
    out.twistTriple = { label: tc && tc.label, points: tri.points, kick: (find(tri.events, "rotate") || {}).kick };
    check("Twist Triple", T.line.full[3], tri.points);
  } catch (e9) {}

  /* The worked example: a Quad, a quiet piece, then a Twist Double, all at
     level 3. The quiet piece breaks the Ripple so only Unbroken is left. */
  try {
    var ge = makeGame({ board: BOARDS.example, queue: "IOT", level: 3 });
    play(ge, ["cw", "dasRight", "hard"]);
    play(ge, ["right", "right", "right", "hard"]);
    var ex = play(ge, ["right", "fall", "left", "cw", "hard"]);
    var ec = find(ex.events, "clear");
    var ub = 1.5;
    out.example = { points: ex.points, level: 3, base: T.line.full[2], label: ec && ec.label,
                    unbroken: !!(ec && (ec.unbroken || ec.ubBonus)), multiplier: ub,
                    want: T.line.full[2] * 3 * ub };
    out.measured.unbroken = ex.points / 3 / T.line.full[2];
    check("worked example", T.line.full[2] * 3 * ub, ex.points);
  } catch (e10) {}
  if (out.measured.fourSingles !== undefined) {
    out.measured.rippleStep = (out.measured.fourSingles - 4 * T.line.none[1]) / 6;
    check("four Singles in a row", 4 * T.line.none[1] + 6 * T.ripple, out.measured.fourSingles);
  }
  if (out.measured.hardPerRow !== undefined) check("hard drop", T.hard, out.measured.hardPerRow);
  if (out.measured.softPerRow !== undefined) check("soft drop", T.soft, out.measured.softPerRow);

  /* the lock: how long a resting piece waits, and how many resets */
  try {
    var gl = makeGame({ queue: "TT", gravity: 1000 });
    ready(gl);
    W.act(gl, "softOn");
    for (var f = 0; f < 5000 && gl.active && W.landingY(gl) !== gl.active.y; f++) W.step(gl, 1);
    W.act(gl, "softOff"); W.drain(gl);
    var waited = 0, locked = false;
    while (!locked && waited < 5000) {
      W.step(gl, 1); waited++;
      var le = W.drain(gl);
      for (var q = 0; q < le.length; q++) if (le[q].t === "lock") locked = true;
    }
    out.lockMs = locked ? waited : null;
  } catch (e11) {}
  try {
    var gr = makeGame({ queue: "TT", gravity: 0 });
    ready(gr);
    W.act(gr, "softOn");
    for (var f2 = 0; f2 < 5000 && gr.active && W.landingY(gr) !== gr.active.y; f2++) W.step(gr, 1);
    W.act(gr, "softOff"); W.drain(gr);
    var moves = 0, done = false, dir = "left";
    while (!done && moves < 40) {
      var okm = W.act(gr, dir);
      if (okm) moves++;
      dir = dir === "left" ? "right" : "left";
      var re = W.drain(gr);
      for (var z = 0; z < re.length; z++) if (re[z].t === "lock") done = true;
    }
    out.lockMoves = done ? moves : null;
  } catch (e12) {}

  /* the kick scenes, confirmed by turning a real piece */
  out.scenes = [];
  for (var k = 0; k < SCENES.length; k++) {
    var sc = SCENES[k], conf = null;
    try {
      var gs = makeGame({ board: sc.board, queue: sc.piece });
      var sr = play(gs, sc.script), rot = find(sr.events, "rotate");
      if (rot && gs.active) conf = { kick: rot.kick, x: gs.active.x, y: gs.active.y, rot: gs.active.rot };
    } catch (e13) {}
    out.scenes.push(conf);
  }

  /* the dealer: three sets to show, and fifty more for the longest wait */
  out.bag = Learn.deal(out.seed, 371);
  return (cache = out);
};

/* Deal pieces from the real dealer: the first three sets of seven, and the
   longest wait between two long pieces over fifty sets more. Well.bag is
   the very code the engine deals from, so the pieces are read straight off
   it: playing them out through a game (as this once did, to have somewhere
   to put them) cost a tenth of a second for the same answer. */
Learn.deal = function (seed, count) {
  var W = Well(), out = { seed: seed, first: [], pieces: 0, gap: 0 };
  count = count || 371;
  var M = Modes();
  out.code = M && M.code && M.code.encode ? M.code.encode(seed) : null;
  if (!W || typeof W.bag !== "function") return out;
  try {
    var next = W.bag(seed), last = -1;
    for (var i = 0; i < count; i++) {
      var L = letterOf(next());
      if (out.first.length < 21) out.first.push(L);
      if (L === "I") { if (last >= 0) out.gap = Math.max(out.gap, i - last - 1); last = i; }
    }
    out.pieces = count;
  } catch (e) {}
  return out;
};

/* Mode by mode, what the engine is actually told — read from modes.js,
   and the speeds measured by starting a real game with those options. */
function tuning() {
  var M = Modes(), W = Well(), rowsOut = [];
  if (!M || !M.list) return rowsOut;
  function msAt(o, level) {
    if (!W) return null;
    try {
      var g = W.create(merge(merge(o, { seed: 1, queue: "T", queueThen: "end", board: undefined, silt: 0 }), level ? { level: level } : null));
      return W.gravityMs(g);
    } catch (e) { return null; }
  }
  function secs(ms) { return ms >= 100 ? num(ms / 1000, 2) : ms >= 10 ? num(ms / 1000, 3) : num(ms / 1000, 4); }
  function speed(o) {
    var a = msAt(o, 0);
    if (a === null) return "—";
    if (!a) return "still";
    /* it speeds up if it levels at all and the engine, asked at the top
       level the mode allows, falls faster than at the start */
    var b = o.linesPerLevel ? msAt(o, o.levelCap || 15) : null;
    if (!b || b >= a) return secs(a) + " s a row, constant";
    return secs(a) + " → " + secs(b) + " s a row";
  }
  /* what moves the speed, from the same options, so the rule printed is
     the rule played: a level every so many lines, or Three Minutes' curve */
  function levels(o) {
    if (typeof o.linesPerLevel === "number" && o.linesPerLevel > 0) return "a level every " + o.linesPerLevel + " lines";
    if (o.linesPerLevel === "three") return "a level at 3, 8, 15, 24… lines (level² − 1)";
    return "";
  }
  function add(name, o, chosen) {
    var sp = speed(o);
    rowsOut.push({ name: name, speed: sp, levels: sp.indexOf("→") >= 0 ? levels(o) : "", chosen: chosen || "",
                   lock: o.lockDelay, are: o.spawnDelay || 0,
                   clear: o.clearDelay || 0, ends: o.topOut === "drain" ? "drains" : "rests", breath: !!o.breath });
  }
  /* a speed the player picks says which setting it came from */
  function chosen(m) {
    var op = m.options || {};
    if (op.tide !== undefined) return "Tide " + op.tide + ", the default — the slider sets it";
    if (typeof op.pace === "string") return op.pace.charAt(0).toUpperCase() + op.pace.slice(1) + " pace, the default";
    return "";
  }
  for (var i = 0; i < M.list.length; i++) {
    var m = M.list[i];
    if (!m || typeof m.engine !== "function" || m.id === "challenges") continue;
    try {
      if (m.id === "descent" && M.DESCENT_PACES && M.DESCENT_PACES.length) {
        for (var p = 0; p < M.DESCENT_PACES.length; p++) {
          var pace = M.DESCENT_PACES[p], pid = typeof pace === "string" ? pace : pace.id;
          var pname = typeof pace === "string" ? pace.charAt(0).toUpperCase() + pace.slice(1) : (pace.name || pid);
          add(m.name + " · " + pname, m.engine(merge(m.options, { pace: pid })));
        }
      } else add(m.name, m.engine(merge(m.options, {})), chosen(m));
    } catch (e) {}
  }
  return rowsOut;
}

/* ================================================================
   drawing (browser only)
   ================================================================ */

var PAL = { I: "#F2C36B", O: "#4E6FD0", T: "#3FA58A", S: "#F09AB0", Z: "#7FD3EA", J: "#B5DB86", L: "#B9A3F0" };
function palette(ctx) {
  var S = Skins(), out = merge(PAL, { stone: "#6c7584" });
  if (!S) return out;
  try {
    var skin = S.get ? S.get(pref(ctx, "skin", "seaglass")) : null;
    var res = skin && S.resolve ? S.resolve(skin, pref(ctx, "palette", "skin")) : (skin && skin.colors);
    if (res) for (var i = 0; i < LETTERS.length; i++) if (res[LETTERS[i]]) out[LETTERS[i]] = res[LETTERS[i]];
  } catch (e) {}
  return out;
}
function reduced(ctx) {
  var m = null, P = PrefsMod();
  if (P && typeof P.motion === "function") { try { m = P.motion(); } catch (e) { m = null; } }
  if (!m) m = pref(ctx, "motion", "system");
  if (m === "still" || m === "gentle") return true;
  if (m === "full") return false;
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* A canvas sized to its column at the device's pixel density. The width
   comes from the parent, never from the canvas itself — a canvas measured
   by its own size grows every time it is drawn. */
function Fig(cv, cols, rowsN, maxCell) {
  var f = { cv: cv, cols: cols, rows: rowsN, cell: 10, dpr: 1, ctx: null, w: 0, h: 0, pad: 0 };
  f.fit = function () {
    var host = cv.parentNode, avail = host ? host.clientWidth : 300;
    if (!avail) avail = 300;
    var cell = Math.floor(Math.min(maxCell || 26, avail / (cols + 0.6)));
    if (cell < 8) cell = 8;
    f.cell = cell; f.pad = Math.round(cell * 0.3);
    f.w = cols * cell + 2 * f.pad; f.h = rowsN * cell + 2 * f.pad;
    f.dpr = Math.min(2, (typeof devicePixelRatio === "number" && devicePixelRatio) || 1);
    cv.style.width = f.w + "px"; cv.style.height = f.h + "px";
    cv.width = Math.round(f.w * f.dpr); cv.height = Math.round(f.h * f.dpr);
    f.ctx = cv.getContext("2d");
    f.ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
  };
  f.fit();
  return f;
}

/* the well: dark water, faint cell marks, walls and floor a shade lighter */
function drawWell(f, walls, floor) {
  var c = f.ctx, w = f.w, h = f.h, cell = f.cell, p = f.pad;
  c.clearRect(0, 0, w, h);
  var g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#111829"); g.addColorStop(1, "#070a12");
  c.fillStyle = g;
  rr(c, 0, 0, w, h, Math.min(14, cell * 0.6)); c.fill();
  c.fillStyle = "rgba(160,172,196,0.085)";
  if (walls) {
    c.fillRect(p, p, cell * walls, f.rows * cell);
    c.fillRect(p + (f.cols - walls) * cell, p, cell * walls, f.rows * cell);
  }
  if (floor) c.fillRect(p + cell * (walls || 0), p + (f.rows - floor) * cell, (f.cols - 2 * (walls || 0)) * cell, floor * cell);
  c.fillStyle = "rgba(255,255,255,0.055)";
  for (var y = 0; y < f.rows - (floor || 0); y++) for (var x = walls || 0; x < f.cols - (walls || 0); x++) {
    c.beginPath(); c.arc(p + (x + 0.5) * cell, p + (y + 0.5) * cell, Math.max(1, cell * 0.05), 0, 6.283); c.fill();
  }
}
function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
/* A cell rectangle that reaches its same-body neighbours and rounds only
   the corners that face open space — the fused look of The Well's pieces,
   with no seam or outline inside a piece. */
function addCell(c, px, py, s, m, r) {
  var g = Math.max(1, s * 0.06);
  var l = px + (m & 8 ? 0 : g), t = py + (m & 1 ? 0 : g), rt = px + s - (m & 2 ? 0 : g), b = py + s - (m & 4 ? 0 : g);
  var tl = (m & 1) || (m & 8) ? 0 : r, tr = (m & 1) || (m & 2) ? 0 : r;
  var br = (m & 4) || (m & 2) ? 0 : r, bl = (m & 4) || (m & 8) ? 0 : r;
  c.moveTo(l + tl, t); c.lineTo(rt - tr, t);
  if (tr) c.quadraticCurveTo(rt, t, rt, t + tr); else c.lineTo(rt, t);
  c.lineTo(rt, b - br);
  if (br) c.quadraticCurveTo(rt, b, rt - br, b); else c.lineTo(rt, b);
  c.lineTo(l + bl, b);
  if (bl) c.quadraticCurveTo(l, b, l, b - bl); else c.lineTo(l, b);
  c.lineTo(l, t + tl);
  if (tl) c.quadraticCurveTo(l, t, l + tl, t); else c.lineTo(l, t);
  c.closePath();
}
/* Draw a set of cells as one fused body. `top` is the board row drawn at
   the top of the frame; x0 the board column drawn at the frame's left. */
function body(f, cells, color, o) {
  o = o || {};
  var c = f.ctx, s = f.cell, p = f.pad, top = o.top, x0 = o.x0 || 0, set = {}, i;
  var lo = o.clip === undefined ? -1e9 : o.clip;
  var kept = [];
  for (i = 0; i < cells.length; i++) if (cells[i][1] >= lo && cells[i][1] <= top) kept.push(cells[i]);
  cells = kept;
  if (!cells.length) return;
  for (i = 0; i < cells.length; i++) set[cells[i][0] + "," + cells[i][1]] = 1;
  if (o.ox || o.oy) p = 0;
  var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  c.save();
  if (o.ox || o.oy) c.translate(o.ox || 0, o.oy || 0);
  if (o.alpha !== undefined) c.globalAlpha = o.alpha;
  c.beginPath();
  for (i = 0; i < cells.length; i++) {
    var x = cells[i][0], y = cells[i][1];
    var m = (set[x + "," + (y + 1)] ? 1 : 0) | (set[(x + 1) + "," + y] ? 2 : 0) | (set[x + "," + (y - 1)] ? 4 : 0) | (set[(x - 1) + "," + y] ? 8 : 0);
    var px = p + (x - x0) * s, py = p + (top - y) * s;
    addCell(c, px, py, s, m, s * 0.24);
    if (px < minX) minX = px; if (py < minY) minY = py;
    if (px + s > maxX) maxX = px + s; if (py + s > maxY) maxY = py + s;
  }
  var gr = c.createLinearGradient(0, minY, 0, maxY);
  gr.addColorStop(0, shade(color, 0.16)); gr.addColorStop(1, shade(color, -0.14));
  c.fillStyle = gr;
  if (o.glow) { c.shadowColor = color; c.shadowBlur = s * 0.7; }
  c.fill();
  c.shadowBlur = 0;
  /* stone shows its rows as faint strata, so offsets can be counted */
  if (o.strata) {
    c.save();
    c.clip();
    c.lineWidth = 1;
    for (var sy = p + Math.round((minY - p) / s) * s + s; sy < maxY; sy += s) {
      c.strokeStyle = "rgba(0,0,0,0.22)";
      c.beginPath(); c.moveTo(minX, sy + 0.5); c.lineTo(maxX, sy + 0.5); c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.06)";
      c.beginPath(); c.moveTo(minX, sy + 1.5); c.lineTo(maxX, sy + 1.5); c.stroke();
    }
    c.restore();
  }
  /* a thin light along every top edge, the rim catching the key light */
  c.strokeStyle = "rgba(255,255,255," + (o.flat ? 0.12 : 0.32) + ")";
  c.lineWidth = Math.max(1, s * 0.07);
  c.beginPath();
  for (i = 0; i < cells.length; i++) {
    var cx = cells[i][0], cy = cells[i][1];
    if (set[cx + "," + (cy + 1)]) continue;
    var lx = p + (cx - x0) * s, ly = p + (top - cy) * s + s * 0.12;
    c.moveTo(lx + s * (set[(cx - 1) + "," + cy] ? 0 : 0.26), ly);
    c.lineTo(lx + s * (set[(cx + 1) + "," + cy] ? 1 : 0.74), ly);
  }
  c.stroke();
  c.restore();
}
function shade(hex, k) {
  var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  function ch(v) { v = k > 0 ? v + (255 - v) * k : v * (1 + k); return Math.max(0, Math.min(255, Math.round(v))); }
  return "rgb(" + ch(r) + "," + ch(g) + "," + ch(b) + ")";
}
function boardCells(strs) {
  var out = [];
  for (var r = 0; r < strs.length; r++) {
    var y = strs.length - 1 - r;
    for (var x = 0; x < strs[r].length; x++) if (strs[r].charAt(x) !== ".") out.push([x, y]);
  }
  return out;
}
function filled(strs, x, y) {
  if (x < 0 || x > 9 || y < 0) return true;
  var r = strs.length - 1 - y;
  return r >= 0 && r < strs.length && strs[r].charAt(x) !== ".";
}
function outline(f, cells, o) {
  var c = f.ctx, s = f.cell, p = f.pad;
  c.save();
  c.strokeStyle = o.color || "rgba(255,255,255,0.45)";
  c.lineWidth = Math.max(1, s * 0.08);
  if (c.setLineDash) c.setLineDash([s * 0.18, s * 0.14]);
  for (var i = 0; i < cells.length; i++) {
    var px = p + (cells[i][0] - (o.x0 || 0)) * s, py = p + (o.top - cells[i][1]) * s;
    rr(c, px + s * 0.12, py + s * 0.12, s * 0.76, s * 0.76, s * 0.18); c.stroke();
  }
  c.restore();
}
function ring(f, x, y, o, color, solid) {
  var c = f.ctx, s = f.cell, p = f.pad;
  var cx = p + (x - (o.x0 || 0) + 0.5) * s, cy = p + (o.top - y + 0.5) * s, r = s * 0.2;
  c.save();
  c.beginPath(); c.moveTo(cx, cy - r); c.lineTo(cx + r, cy); c.lineTo(cx, cy + r); c.lineTo(cx - r, cy); c.closePath();
  c.lineWidth = Math.max(1.2, s * 0.08);
  c.strokeStyle = color; c.fillStyle = color;
  if (solid) c.fill(); else { c.fillStyle = "rgba(7,10,18,0.85)"; c.fill(); c.stroke(); }
  c.restore();
}

/* ---------- the figures ---------- */

/* three sets of seven, as dealt, each piece centred in its own slot */
function drawBag(f, deal, pal) {
  var c = f.ctx, s = f.cell, per = 5;
  drawWell(f, 0, 0);
  for (var i = 0; i < deal.first.length; i++) {
    var L = deal.first[i], row = Math.floor(i / 7), col = i % 7;
    var cs = cellsOf(L, 0, 0, 0), minx = 9, miny = 9, maxx = -9, maxy = -9, j;
    for (j = 0; j < 4; j++) {
      minx = Math.min(minx, cs[j][0]); maxx = Math.max(maxx, cs[j][0]);
      miny = Math.min(miny, cs[j][1]); maxy = Math.max(maxy, cs[j][1]);
    }
    var w = maxx - minx + 1, h = maxy - miny + 1, rel = [];
    for (j = 0; j < 4; j++) rel.push([cs[j][0] - minx, cs[j][1] - miny]);
    var ox = f.pad + (col * per + 0.5 + (4 - w) / 2) * s, oy = f.pad + (row * 3 + 0.5 + (2 - h) / 2) * s;
    body(f, rel, pal[L], { top: h - 1, ox: ox, oy: oy });
  }
  c.fillStyle = "rgba(255,255,255,0.07)";
  for (var r = 1; r < 3; r++) c.fillRect(f.pad, f.pad + r * 3 * s - 1, f.w - 2 * f.pad, 1);
}

/* the Twist corner rule: the piece in place, its four diagonal corners
   marked, front corners in gold */
function drawTwist(f, which, pal) {
  var board = which === "full" ? BOARDS.slot : BOARDS.mini;
  var piece = which === "full" ? { rot: 2, x: 4, y: 1 } : { rot: 1, x: 0, y: 1 };
  var o = { top: f.rows - 2, x0: -1, clip: -1 };
  drawWell(f, 1, 1);
  body(f, boardCells(board), pal.stone, { top: o.top, x0: o.x0, clip: -1, strata: true });
  body(f, cellsOf("T", piece.rot, piece.x, piece.y), pal.T, o);
  var C = [[-1, 1], [1, 1], [1, -1], [-1, -1]], FR = [[0, 1], [1, 2], [2, 3], [3, 0]][piece.rot];
  for (var i = 0; i < 4; i++) {
    var x = piece.x + C[i][0], y = piece.y + C[i][1];
    var front = i === FR[0] || i === FR[1];
    ring(f, x, y, o, front ? "#f2c36b" : "#c9d6ea", filled(board, x, y));
  }
}

/* the kick diagram: one scene, one test at a time */
function drawKick(f, sc, step, pal) {
  var o = { top: f.rows - 2, x0: -1, clip: -1 };
  var tests = kickList(sc.piece, sc.from, sc.to).tests;
  drawWell(f, 1, 1);
  var stone = boardCells(sc.board);
  if (stone.length) body(f, stone, pal.stone, { top: o.top, x0: o.x0, clip: -1, strata: true });
  var start = cellsOf(sc.piece, sc.from, sc.x, sc.y);
  var res = attempt(sc, tests, step);
  if (step < 0) { body(f, start, pal[sc.piece], o); return res; }
  var cells = cellsOf(sc.piece, sc.to, sc.x + tests[step][0], sc.y + tests[step][1]);
  var fit = firstFit(sc);
  if (!(fit >= 0 && step > fit)) outline(f, start, { top: o.top, x0: o.x0, color: "rgba(255,255,255,0.4)" });
  else {
    /* never tried: the turn already happened at an earlier test */
    body(f, cellsOf(sc.piece, sc.to, sc.x + tests[fit][0], sc.y + tests[fit][1]), pal[sc.piece], { top: o.top, x0: o.x0, clip: -1, alpha: 0.55 });
    outline(f, cells, { top: o.top, x0: o.x0, color: "rgba(201,214,234,0.28)" });
    return res;
  }
  if (res.fits) body(f, cells, pal[sc.piece], { top: o.top, x0: o.x0, clip: -1, glow: true });
  else {
    body(f, cells, "#8e9bb0", { top: o.top, x0: o.x0, clip: -1, alpha: 0.42, flat: true });
    for (var j = 0; j < res.hits.length; j++) {
      var h = res.hits[j];
      if (h[1] < -1 || h[1] > o.top) continue;
      cross(f, h[0], h[1], o);
    }
  }
  return res;
}
function attempt(sc, tests, step) {
  if (step < 0) return { fits: false, hits: [] };
  var cells = cellsOf(sc.piece, sc.to, sc.x + tests[step][0], sc.y + tests[step][1]), hits = [];
  for (var i = 0; i < cells.length; i++) {
    var x = cells[i][0], y = cells[i][1];
    var blocked = x < 0 || x > 9 || y < 0 || filled(sc.board, x, y);
    if (blocked) hits.push(cells[i]);
  }
  return { fits: !hits.length, hits: hits };
}
function cross(f, x, y, o) {
  var c = f.ctx, s = f.cell, p = f.pad;
  var cx = p + (x - o.x0 + 0.5) * s, cy = p + (o.top - y + 0.5) * s, r = s * 0.2;
  c.save();
  c.strokeStyle = "#e8eef8"; c.lineWidth = Math.max(1.5, s * 0.09); c.lineCap = "round";
  c.beginPath(); c.moveTo(cx - r, cy - r); c.lineTo(cx + r, cy + r); c.moveTo(cx + r, cy - r); c.lineTo(cx - r, cy + r); c.stroke();
  c.restore();
}
function firstFit(sc) {
  var tests = kickList(sc.piece, sc.from, sc.to).tests;
  for (var i = 0; i < tests.length; i++) if (attempt(sc, tests, i).fits) return i;
  return -1;
}
function offsetWords(d) {
  var x = d[0], y = d[1], parts = [];
  if (!x && !y) return "where it is";
  if (x) parts.push(word(Math.abs(x)) + (x < 0 ? " left" : " right"));
  if (y) parts.push(word(Math.abs(y)) + (y < 0 ? " down" : " up"));
  return parts.join(", ");
}
function sgn(n) { return n < 0 ? "−" + Math.abs(n) : n > 0 ? "+" + n : "0"; }

/* ================================================================
   the pages
   ================================================================ */

function h3(t) { return "<h3>" + t + "</h3>"; }
function p(t, cls) { return "<p class=\"" + (cls || "lrn-p") + "\">" + t + "</p>"; }
function src(t) { return "<p class=\"lrn-src\">" + t + "</p>"; }
function navTo(id, label) { return "<a href=\"#\" data-learn=\"" + id + "\">" + label + "</a>"; }

var PAGES = {};

PAGES.why = function () {
  var R = Rules() || {}, Wd = R.W || 10, per = Math.ceil(40 * Wd / 4);
  return "" +
    h3("Where it came from") +
    p("Alexey Pajitnov wrote the first version of Tetris® in 1984 at the Dorodnitsyn Computing Centre in Moscow, on an Elektronika 60. It was partly inspired by pentomino puzzles. The IBM PC version was written by the teenage Vadim Gerasimov. Rows vanish for a practical reason: the player needs the room to keep going.") +
    p("In 1989 it came packed in with the Game Boy in North America. Henk Rogers told Nintendo of America that Mario would sell the Game Boy to little boys, but Tetris would sell it to everyone. It was also one of the first Game Boy games with head-to-head play over the link cable.") +
    h3("A decision about once a second") +
    p("Forty lines need at least " + per + " pieces: forty rows of " + word(Wd) + " cells, four cells to a piece. At a relaxed pace you place one every 0.6 to 2 seconds, each with two to six small moves. Every decision has perfect information about the present — the whole well is in front of you — and a short look ahead, in the pieces waiting above the mouth.") +
    h3("Turning is thinking") +
    p("Kirsh and Maglio (1994) found that players rotate pieces on screen to find out where they fit, solving some problems more quickly, easily and reliably than by thinking alone. That's why The Well works so hard at instant, smooth response: when a turn shows up late, your thinking tool is slow.") +
    h3("Flow") +
    p("Flow is most likely when goals are clear, feedback is immediate, and the challenge is high but matched to your skill. A row either clears or it doesn't. Speed rises on a fixed, visible curve — " + navTo("how", "the table is on the How page") + ".") +
    h3("Fair dealing") +
    p("Pieces come in shuffled sets of seven, so at most 12 other pieces can come between two long straight pieces. Our dealer never looks at your board. With truly random pieces, mathematicians proved that a game ends with probability 1, though the losing sequence is so long it essentially never happens in real play. Here, games end through speed and mistakes.") +
    h3("Never solved, always solvable locally") +
    p("Even if you knew every piece in advance, computing the best possible play is NP-hard: on large enough boards, no known method does it efficiently. A few pieces of look-ahead is just enough to feel clever.") +
    h3("The open loop") +
    p("The well is never finished, so there is always a next thing to fix. The pull to resume an unfinished task is supported as a general tendency. The famous claim that “you remember unfinished tasks better” mostly hasn't held up (Ghibellini &amp; Meier 2025). The Well lets that loop close: runs end, chapters rest, and nothing calls you back.") +
    h3("Near-misses that are really yours") +
    p("In slot machines, near-misses raise the urge to play (Clark et al. 2009). Here, a row with one hole is information you made. We never manufacture near-misses.") +
    h3("The brain gets more efficient") +
    p("After four to eight weeks of practice, eight young men used <i>less</i> cortical glucose while playing more than seven times better (Haier et al. 1992). Three months of practice changed cortical thickness in two small areas (Haier et al. 2009). That shows efficiency. It doesn't show that the game makes you smarter.") +
    h3("The shapes follow you to sleep") +
    p("After three days of play, most people in a small study saw falling shapes as they fell asleep, including three of five people with amnesia who couldn't remember playing (Stickgold et al. 2000). In a large survey of gamers, almost everyone reported some carry-over after play; about one in five said it had caused them some distress or trouble. That's one reason The Well ends runs naturally and never starts another by itself.") +
    h3("Sound that answers you") +
    p("<i>Tetris Effect</i>'s makers aimed for a “zen-like, relaxed, flow state feeling”, and its music and sound effects respond to every move. <i>Rez</i> and <i>Lumines</i> quantize sounds to the beat. In The Well, every move is a note from a five-note scale with no clashing intervals, and clears wait for the beat — never more than 120 milliseconds.") +
    h3("Juice, in moderation") +
    p("In one controlled study of an action RPG, medium and high amounts of “juice” gave a better experience than none or an extreme amount (Kao 2020). Our effects grow with the rarity of what you did, and they stop growing.") +
    h3("Absorbed, not hooked") +
    p("It's healthy when the task itself is the reward and the game lets you stop. It becomes compulsive when a schedule is the reward — random prizes, streaks, timers — and stopping costs you something. The “machine zone” and “zen flow” can feel alike from inside; the difference is who benefits from the extra minutes. " + navTo("refuses", "Here is everything The Well refuses to do") + ".") +
    src("Sources: Kirsh &amp; Maglio 1994 (Cognitive Science); Csikszentmihalyi 1990 (<i>Flow</i>, Harper &amp; Row); Burgiel 1997 (The Mathematical Gazette); Breukelaar, Demaine et al. 2004 (International Journal of Computational Geometry &amp; Applications); Ghibellini &amp; Meier 2025 (Humanities and Social Sciences Communications); Clark et al. 2009 (Neuron); Haier et al. 1992 (Brain Research); Haier et al. 2009 (BMC Research Notes); Stickgold et al. 2000 (Science); Ortiz de Gortari &amp; Griffiths 2016 (International Journal of Human–Computer Interaction); Kao 2020 (Entertainment Computing); Schüll 2012 (<i>Addiction by Design</i>, Princeton University Press).") +
    src("<i>" + esc(Learn.FOOTER_MIXED) + "</i>") +
    "<p class=\"lrn-about\">" + esc(Learn.ABOUT) + "</p>";
};

function tick(ok) { return ok ? "<span class=\"lrn-ok\" title=\"Checked against the game's scorer as this page opened\">✓</span>" : ""; }
function checked(live, what) {
  for (var i = 0; i < live.checks.length; i++) if (live.checks[i].what === what) return live.checks[i].ok;
  return false;
}

PAGES.how = function (ctx, live) {
  var T = live.tables, L = T.line, E = T.empty, m = live.measured || {};
  var hidden = live.H - live.VISIBLE, extra = live.VISIBLE - 20;
  var sdf = pref(ctx, "sdf", 20), das = pref(ctx, "das", 167), arr = pref(ctx, "arr", 33);
  if (sdf === "inf") sdf = Infinity;
  var dm = measureDas(das, arr);
  var gv = live.gravity, g15 = gv[gv.length - 1];
  var out = "";

  out += p("The Well plays by the modern rules of the falling-blocks family that Tetris® began: seven pieces, a fair dealer, wall kicks, a forgiving lock, Keep, and the scoring that makes a Quad and a Twist worth chasing. " +
    (live.engine ? "Every number here is read from the game's own rule tables and engine as the page opens, and the ones marked ✓ were played on a hidden well to check them — so the page can't drift from the game, because it is reading the game." : "These numbers come straight from the game's rule tables."));

  out += h3("The well") +
    p("It is " + word(live.W) + " columns wide and " + live.VISIBLE + " rows tall, with " + hidden + " more hidden above it for pieces to appear in. There are seven pieces, each four cells joined edge to edge: I, O, T, S, Z, J and L.") +
    "<div class=\"lrn-aside\"><b>Why " + live.VISIBLE + " rows?</b> Most games in this family use a well 20 rows tall. Ours is " + live.VISIBLE + ": " + word(extra) + " extra rows of headroom make it a little more forgiving, and its shape fits a phone held upright. Line clears, scores and the forty-line race work exactly the same.</div>";

  var bag = live.bag || { first: [] };
  out += h3("The dealer") +
    p("Pieces come in shuffled sets of seven, each holding exactly one of every shape. So at most 12 other pieces can come between two long straight pieces: the next one arrives by the 13th piece at the latest. The dealer never looks at your board — no mercy pieces, and no cruel ones.");
  if (bag.first.length) {
    out += p("Here are the first three sets of " + (bag.code ? "well code <b class=\"lrn-code\">" + esc(bag.code) + "</b>" : "one game") + ", dealt just now by the game's own dealer:") +
      "<div class=\"lrn-fig\"><canvas data-fig=\"bag\" role=\"img\" aria-label=\"" + esc("Three rows of seven pieces: " + bag.first.slice(0, 7).join(" ") + "; " + bag.first.slice(7, 14).join(" ") + "; " + bag.first.slice(14, 21).join(" ")) + "\"></canvas></div>" +
      "<p class=\"lrn-cap\"><span data-dealcap>" + dealCaption(bag) + "</span> <button class=\"lrn-mini\" data-deal>Deal another</button></p>";
  }

  out += h3("How fast pieces fall") +
    p("Speed follows one fixed curve: seconds per row = (0.8 − (level − 1) × 0.007)<sup>level − 1</sup>. At level 1 a piece falls one row a second; by level 15 it falls " + num(g15.rps, 0) + " rows a second — " + num(g15.rps / 60, 2) + " rows every frame on a 60 Hz screen." + (live.engine ? " Read from the engine one level at a time:" : ""));
  var maxLog = Math.log(gv[gv.length - 1].rps), minLog = Math.log(gv[0].rps);
  out += "<table class=\"tally lrn-t\"><thead><tr><th>Level</th><th>Seconds a row</th><th>Rows a second</th><th class=\"lrn-barh\"></th></tr></thead><tbody>";
  for (var i = 0; i < gv.length; i++) {
    var w = 6 + 94 * (Math.log(gv[i].rps) - minLog) / (maxLog - minLog || 1);
    out += "<tr><td>" + gv[i].level + "</td><td>" + num(gv[i].sec, 4) + "</td><td>" + num(gv[i].rps, 2) + "</td><td class=\"lrn-barc\"><span class=\"lrn-bar\" style=\"width:" + w.toFixed(1) + "%\"></span></td></tr>";
  }
  out += "</tbody></table>";
  out += p("Soft drop moves at " + (sdf === Infinity ? "full speed straight to the floor" : sdf + " times the fall speed, and never slower than " + sdf + " rows a second, even when nothing is falling") + ". It doesn't lock the piece; the lock wait still decides. Hard drop is instant and locks at once.");

  var lockMs = live.lockMs ? Math.round(live.lockMs / 10) * 10 : 500;
  var resets = live.lockMoves ? live.lockMoves - 1 : 15;
  out += h3("The lock") +
    p("A piece that lands waits " + lockMs + " ms before locking. Each move or turn restarts that wait. After " + resets + " moves or turns, the piece locks as soon as it rests on something. Dropping to a new lowest row gives all " + resets + " back. " +
      (live.lockMs && live.lockMoves ? "Measured just now: a piece left on the floor locked after " + lockMs + " ms, and one shuffled from side to side locked on move " + live.lockMoves + "." : "")) +
    p("The thin light under a landed piece is that wait, draining. Calmer modes wait longer; the table at the end of this page has every mode's number.");

  /* Breath, from the rule table, so the page and the game can't disagree */
  var Rb = Rules() || {}, bMax = Rb.BREATH_MAX || 20, bCost = Rb.BREATH_COST || 10, bSec = Math.round((Rb.BREATH_MS || 10000) / 1000);
  out += h3("Breath") +
    p("In Descent and Drift, every line you clear adds a bead to a ring of " + word(bMax) + " on the well's rim. Once " + word(bCost) + " are lit, the Breath button appears beside the score (or press " + keyList(ctx, "breath", ["KeyB"]) + "). A Breath spends " + word(bCost) + " beads and gravity rests for " + word(bSec) + " seconds — one long breath, four in and six out — with the lock wait held still. You can still move, turn and drop, and clears, points, Ripple and Unbroken count just as usual; only the falling stops. It is a moment to think, not a bonus: nothing multiplies.");

  out += h3("Turning, and the five tests") +
    p("When you turn a piece, the game first tries it where it is. If it doesn't fit, it tries four other spots in a fixed order — a step sideways, a step up or down — and takes the first that fits. If none does, the piece doesn't turn. Players call these wall kicks. The O never needs one: it looks the same every way round. The I has its own list.") +
    "<div class=\"lrn-kick\" data-kick>" +
      "<div class=\"lrn-tabs\" role=\"tablist\">" + sceneTabs() + "</div>" +
      "<div class=\"lrn-fig\"><canvas data-fig=\"kick\" role=\"img\" aria-label=\"\"></canvas></div>" +
      "<div class=\"lrn-steps\" data-steps></div>" +
      "<p class=\"lrn-cap\" data-kcap aria-live=\"polite\"></p>" +
      "<table class=\"tally lrn-t lrn-kt\" data-ktab></table>" +
    "</div>" +
    p("Modern turning (in Handling, off by default) adds a half-turn and a mirror-symmetric list for the I that some online games call SRS+. Neither is part of the classic rule set.");

  var tm = live.twistMini || {}, tf = live.twistFull || {};
  out += h3("The Twist") +
    p("Only the T can Twist, and only if its last move before locking was a turn. Look at the four cells diagonal to its centre. If at least three are filled — walls and floor count — it's a Twist. If both corners on the side it points to are filled, it's a full Twist; if not, it's a Mini Twist, unless the turn used the fifth test, which always counts as full.") +
    "<div class=\"lrn-pair\">" +
      "<figure><div class=\"lrn-fig\"><canvas data-fig=\"twistFull\" role=\"img\" aria-label=\"A T piece pointing down into a slot. All four of its diagonal corners are filled, including both front corners.\"></canvas></div>" +
      "<figcaption><b>Full Twist.</b> Both front corners (gold) are filled." + (tf.label ? " The game called this one a " + esc(tf.label) + "." : "") + "</figcaption></figure>" +
      "<figure><div class=\"lrn-fig\"><canvas data-fig=\"twistMini\" role=\"img\" aria-label=\"A T piece standing against the left wall. Three diagonal corners are filled, but only one of the two front corners.\"></canvas></div>" +
      "<figcaption><b>Mini Twist.</b> Three corners, but only one at the front." + (tm.label ? " The game called this one a " + esc(tm.label) + "." : "") + "</figcaption></figure>" +
    "</div>";

  out += h3("Points") + p("Everything is multiplied by the level before the clear, except the drops." + (live.engine ? " A ✓ means the game's own scorer paid exactly that when we tried it as this page opened." : ""));
  function cell(v, what) { return "<td>" + (v === null ? "<span class=\"lrn-dim\">—</span>" : fmt(v) + (what ? tick(checked(live, what)) : "")) + "</td>"; }
  out += "<table class=\"tally lrn-t lrn-score\"><thead><tr><th></th><th>Plain</th><th>Mini Twist</th><th>Twist</th></tr></thead><tbody>" +
    "<tr><th>No lines</th>" + cell(null) + cell(L.mini[0]) + cell(L.full[0]) + "</tr>" +
    "<tr><th>Single</th>" + cell(L.none[1], "Single") + cell(L.mini[1], "Mini Twist Single") + cell(L.full[1]) + "</tr>" +
    "<tr><th>Double</th>" + cell(L.none[2], "Double") + cell(L.mini[2]) + cell(L.full[2], "Twist Double") + "</tr>" +
    "<tr><th>Triple</th>" + cell(L.none[3], "Triple") + cell(null) + cell(L.full[3], "Twist Triple") + "</tr>" +
    "<tr><th>Quad</th>" + cell(L.none[4], "Quad") + cell(null) + cell(null) + "</tr>" +
    "</tbody></table>";
  out += "<table class=\"tally lrn-t lrn-bonus\"><tbody>" +
    "<tr><th>Unbroken <small>other games call it back-to-back</small></th><td>× 1.5 on the line points of every difficult clear after the first" + tick(checked(live, "worked example")) + "</td></tr>" +
    "<tr><th>Ripple <small>other games call it a combo</small></th><td>+ " + fmt(T.ripple) + " × n on the nth clear in a row after the first" + tick(checked(live, "four Singles in a row")) + "</td></tr>" +
    "<tr><th>Empty Well <small>a clear that leaves nothing behind</small></th><td>+ " + fmt(E[1]) + tick(checked(live, "Single with Empty Well")) + " · " + fmt(E[2]) + " · " + fmt(E[3]) + " · " + fmt(E[4]) + " for 1–4 lines; " + fmt(T.emptyQuad) + " for an Unbroken Quad</td></tr>" +
    "<tr><th>Drops <small>not multiplied by the level</small></th><td>soft " + fmt(T.soft) + tick(checked(live, "soft drop")) + " · hard " + fmt(T.hard) + tick(checked(live, "hard drop")) + " a row</td></tr>" +
    "</tbody></table>";
  out += p("Difficult clears are Quads and any Twist that clears lines. Only a plain Single, Double or Triple breaks an Unbroken chain; Keep doesn't, and neither does a piece that clears nothing. A piece that clears nothing does end a Ripple.", "lrn-p lrn-soft");

  out += h3("Why the points make sense") +
    p("Four Singles score " + fmt(4 * L.none[1]) + " but one Quad scores " + fmt(L.none[4]) + ": the game pays " + times(L.none[4] / (4 * L.none[1])) + " for the risk of keeping a column open. A Twist Double (" + fmt(L.full[2]) + ") pays " + times(L.full[2] / L.none[4]) + " a Quad for using fewer cells cleverly. Unbroken pays 1.5× for sustaining difficult clears. Ripple rewards clearing on consecutive pieces. Games differ on whether the Empty Well bonus adds to the line score or replaces it; The Well adds it.");
  var ex = live.example;
  if (ex) {
    var exOk = checked(live, "worked example");
    out += "<div class=\"lrn-aside\"><b>A worked example.</b> " +
      (exOk ? "Played just now on a hidden well by the real scorer: a Quad, a quiet piece, then a Twist Double at level 3, Unbroken. <span class=\"lrn-sum\">" + fmt(ex.base) + " × 3 × 1.5 = " + fmt(ex.points) + "</span>"
            : "A Twist Double at level 3, Unbroken: <span class=\"lrn-sum\">" + fmt(ex.base) + " × 3 × 1.5 = " + fmt(ex.want) + "</span>" + (live.engine ? " (the hidden game paid " + fmt(ex.points) + " — the tables above are what it plays by)" : "")) +
      (m.fourSingles !== undefined ? "<br>Four Singles in a row, each one a Ripple further: <span class=\"lrn-sum\">" + fmt(L.none[1]) + " + " + fmt(L.none[1] + T.ripple) + " + " + fmt(L.none[1] + 2 * T.ripple) + " + " + fmt(L.none[1] + 3 * T.ripple) + " = " + fmt(m.fourSingles) + "</span>" : "") +
      "</div>";
  }
  out += p("<b>The Glass Well.</b> Press G during play (View on a controller) and the well turns to glass: what's left in the current set of seven, the lock light with its " + resets + " reset pips, the repeat timer filling, the fall speed in seconds a row, the Breath beads, and after each clear, its sum — Quad " + fmt(L.none[4]) + " × 4 × 1.5 = " + fmt(L.none[4] * 4 * 1.5) + ".");

  out += h3("Holding a direction") +
    p("Press and hold a direction and the piece moves at once, waits " + dm.delay + " ms, then " + (dm.slide ? "slides straight to the wall" : "moves every " + dm.every + " ms") + " until you let go. Press both and the newer one wins; let go of it and the older one takes over, with the full wait again. A piece's repeat carries over to the next, so a held key keeps going. All of it is adjustable in Handling." + (dm.measured ? " Timed just now on the game's own repeat clock." : ""));

  var tu = tuning();
  out += h3("Honesty about tuning") +
    p("Modes that ease say exactly how. Nothing adapts in secret: the dealer never changes, and the speed changes only with the lines you've cleared, by the rule shown for each mode below. Nothing watches the board, your mistakes or how you're coping. These are every mode's numbers, read from the game:");
  if (tu.length) {
    out += "<ul class=\"lrn-modes\">";
    for (var t = 0; t < tu.length; t++) {
      var r = tu[t], chips = [r.speed];
      if (r.levels) chips.push(r.levels);
      if (r.chosen) chips.push(r.chosen);
      if (r.lock) chips.push("lock " + r.lock + " ms");
      if (r.are || r.clear) chips.push(r.are + " ms before a piece, " + r.clear + " ms after a clear");
      else chips.push("no pauses");
      chips.push(r.ends === "drains" ? "drains when full" : "rests when full");
      out += "<li><b>" + esc(r.name) + "</b><span class=\"lrn-chips\"><span>" + chips.map(esc).join("</span><span>") + "</span></span></li>";
    }
    out += "</ul>";
    var Rr = Rules() || {}, dmin = typeof Rr.DRAIN_MIN === "number" ? Rr.DRAIN_MIN : 4, dto = typeof Rr.DRAIN_TO === "number" ? Rr.DRAIN_TO : 10;
    out += p("\u201cDrains\u201d means rows sink away from the bottom — at least " + word(dmin) + ", until the stack is no more than " + word(dto + 1) + " high — and play goes on with your top surface intact. It scores nothing and costs nothing.", "lrn-p lrn-soft");
  }

  out += src(esc(Learn.CREDIT));
  return out;
};

function dealCaption(b) {
  return "Each row holds all seven shapes once. Across " + fmt(b.pieces) + " pieces from the same dealer, the longest wait between two I pieces was " + b.gap + ".";
}
function sceneTabs() {
  var s = "";
  for (var i = 0; i < SCENES.length; i++) s += "<button class=\"lrn-tab\" role=\"tab\" data-scene=\"" + i + "\">" + SCENES[i].name + "</button>";
  return s;
}
function measureDas(das, arr) {
  var W = Well(), out = { delay: das, every: arr, slide: arr === 0, measured: false };
  if (!W || !W.Das) return out;
  try {
    var d = W.Das.create({ das: das, arr: arr, dcd: 0 }), at = [];
    function rec(a, t) { at.push({ a: a, t: t }); }
    d.press(-1, 0, rec);
    for (var t = 1; t <= das + 4 * Math.max(arr, 1) + 4 && at.length < 4; t++) d.tick(t, rec);
    if (at.length >= 2) { out.delay = at[1].t - at[0].t; out.measured = true; }
    if (at.length >= 3 && arr > 0) out.every = at[2].t - at[1].t;
    if (at.length >= 2 && /^das/.test(at[1].a)) out.slide = true;
  } catch (e) {}
  return out;
}

PAGES.steady = function () {
  return "" +
    p("You may have heard that playing Tetris® can help with flashbacks. There is real science behind that headline, and more nuance than a headline can hold. Here is the honest version.") +
    h3("What researchers found") +
    p("Since 2009, psychologist Emily Holmes and colleagues in the UK and Sweden have studied <i>intrusive memories</i>: vivid images of a frightening event that come to mind uninvited, sometimes called flashbacks.") +
    p("Their idea is that the mind's eye has limited room. Tetris is visual and spatial: you picture shapes turning and fitting together. Doing that kind of mental work at the right time may compete with the sensory images of a bad memory, so that it is less likely to keep intruding. In lab studies, the procedure reduced intrusive memories without reducing people's deliberate memory of what they had seen.") +
    "<ul class=\"lrn-ul\">" +
      "<li>After road accidents, people in a hospital emergency department who did a short guided procedure within six hours reported about 62% fewer intrusive memories over the next week than people given a different activity. It was a small early trial of 71 people, and it found no difference in other symptoms, or at one month.</li>" +
      "<li>In trials with healthcare workers who already had distressing intrusive memories from their work, people who did a guided version reported roughly a third as many intrusive memories a few weeks later as people in the comparison groups.</li>" +
    "</ul>" +
    h3("What the studies actually did") +
    p("It wasn't “just play Tetris”. People were screened, supported and followed up by the research teams. In the procedure, people:") +
    "<ol class=\"lrn-ul\">" +
      "<li>briefly brought one specific memory to mind: a few words or a quick image, not reliving it;</li>" +
      "<li>then played for about 20 minutes, deliberately turning the pieces in the mind's eye before placing them.</li>" +
    "</ol>" +
    p("Some studies turned the game's sound off and hid the guide that shows where a piece will land.") +
    h3("What it can't do") +
    "<ul class=\"lrn-ul\">" +
      "<li><b>It isn't a treatment for PTSD as a whole.</b> The clearest effect was on how <i>often</i> intrusive memories happened. Other difficulties, such as avoidance, low mood or feeling constantly on edge, did not reliably change in the early trials.</li>" +
      "<li><b>It doesn't erase memories.</b></li>" +
      "<li><b>It isn't settled science.</b> Lab replications have been inconsistent. A 2025 replication study found fewer intrusions while people played, but not over the following week. In another lab study, playing on three days was no better than playing once.</li>" +
      "<li><b>Timing and the reminder matter.</b> In a lab study where the film had been seen a day earlier, only the reminder plus the game reduced intrusions; neither alone did. Played within hours of the film, the game helped without a separate reminder.</li>" +
      "<li><b>The Well is not Tetris, and it has never been tested in any study.</b> We made it to be calm and kind. It is not a therapy.</li>" +
    "</ul>" +
    h3("So what is The Well for?") +
    p("It's a quiet place to fit shapes together. Many people find steady, focused play settling, and you're welcome to use it that way. Steady mode is built for that: twenty minutes, slow and even, nothing sudden, and an easy way to stop. <b>We will never ask you to think about something painful.</b> Please don't use this game to try the memory part of the procedure on your own; that part was always done with support. If you'd like to play the way some research versions did, turn on <i>Mind's eye</i> (no landing light) and turn the sound off.") +
    p("<b>Cravings, briefly.</b> In two small studies, three minutes of Tetris reduced the strength of everyday cravings (food, drink, nicotine and others), once in a lab and once over a week of daily life. This game itself hasn't been tested.") +
    h3("This is not treatment") +
    p("If intrusive memories, nightmares or feeling on guard are getting in the way of your life, please talk to a doctor, psychologist or another clinician. Effective help exists, including trauma-focused talking therapies. Researchers are developing guided versions of this procedure, and a clinician can tell you whether one might suit you.") +
    h3("If you need someone right now") +
    helpHTML() +
    src("<i>Sources: Holmes et al. 2009 and 2010 (PLoS ONE); James et al. 2015 (Psychological Science); Iyadurai et al. 2018 (Molecular Psychiatry); Iyadurai et al. 2023 (Translational Psychiatry); Kanstrup et al. 2024 (BMC Medicine); Wessel et al. 2025 (Collabra: Psychology); Broughill et al. 2025 (Journal of Traumatic Stress); Skorka-Brown et al. 2014 (Appetite) and 2015 (Addictive Behaviors).</i>") +
    src("<i>" + esc(Learn.FOOTER) + "</i>");
};

/* ---------- help lines ---------- */
function verifiedWords() {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(Learn.HELP.verified);
  if (!m) return Learn.HELP.verified;
  var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return (+m[3]) + " " + months[+m[2] - 1] + " " + m[1];
}
/* A link's name starts with the words on it ("Call 911"), so a voice that
   reads it, or a voice that asks for it, finds what is on the screen; what
   it is for follows ("emergency services, US and Canada"). */
function telLink(it, cls, inner) {
  return "<a class=\"" + cls + "\" href=\"tel:" + esc(it.tel) + "\" aria-label=\"" + esc("Call " + (it.show || it.tel) + ", " + (it.say || it.label)) + "\">" + inner + "</a>";
}
/* tag: the regions' heading level, h4 under the explainer's own h3, h3
   when the list is a sheet of its own (Steady's Help lines) */
function helpHTML(tag) {
  tag = tag || "h4";
  var h = "<div class=\"lrn-help\">";
  for (var i = 0; i < Learn.HELP.lines.length; i++) {
    var reg = Learn.HELP.lines[i];
    h += "<section class=\"lrn-region\"><" + tag + ">" + esc(reg.region) + "</" + tag + ">" + (reg.note ? "<p class=\"lrn-note\">" + esc(reg.note) + "</p>" : "");
    if (reg.compact) {
      /* the emergency numbers: one row of buttons, each with where it works */
      h += "<div class=\"lrn-links\">";
      for (var k = 0; k < reg.items.length; k++) {
        var e = reg.items[k];
        h += telLink(e, "lrn-call lrn-call2", "Call " + esc(e.tel) + "<small>" + esc(e.label) + "</small>");
      }
      h += "</div></section>";
      continue;
    }
    h += "<ul>";
    for (var j = 0; j < reg.items.length; j++) {
      var it = reg.items[j], links = [];
      if (it.tel) links.push(telLink(it, "lrn-call", "Call " + esc(it.show || it.tel)));
      var host = it.url ? it.url.replace(/^https?:\/\//, "").replace(/\/$/, "") : "";
      if (it.sms) links.push("<a class=\"lrn-call\" href=\"sms:" + esc(it.sms) + "\" aria-label=\"" + esc("Text " + it.sms + ", " + it.label) + "\">Text " + esc(it.sms) + "</a>");
      if (it.url) links.push("<a class=\"lrn-call\" href=\"" + esc(it.url) + "\" target=\"_blank\" rel=\"noopener noreferrer\" aria-label=\"" + esc(host + ", " + it.label + ", opens in a new tab") + "\">" + esc(host) + "</a>");
      h += "<li><b>" + esc(it.label) + "</b><span class=\"lrn-note\">" + esc(it.note) + "</span>" + (links.length ? "<span class=\"lrn-links\">" + links.join("") + "</span>" : "") + "</li>";
    }
    h += "</ul></section>";
  }
  h += "<p class=\"lrn-src\">Numbers last checked " + verifiedWords() + ".</p></div>";
  return h;
}
Learn.renderHelp = function (el) {
  if (!el) return;
  style();
  el.innerHTML = "<div class=\"lrn\">" + helpHTML("h3") + "</div>";
};

/* ---------- controls ---------- */
var KEYNAME = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Space: "Space", Escape: "Esc",
  ShiftLeft: "Shift", ShiftRight: "Shift", ControlLeft: "Ctrl", ControlRight: "Ctrl", AltLeft: "Option", AltRight: "Option",
  Enter: "Return", Backspace: "Delete", Tab: "Tab", Slash: "/", Period: ".", Comma: ",", Semicolon: ";", Quote: "'",
  BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Backquote: "`", Backslash: "\\" };
function keyName(code) {
  if (KEYNAME[code]) return KEYNAME[code];
  var m = /^Key([A-Z])$/.exec(code) || /^Digit(\d)$/.exec(code) || /^Numpad(\d)$/.exec(code);
  return m ? m[1] : code;
}
function keyList(ctx, k, dflt) {
  var keys = pref(ctx, "keys", null), list = keys && keys[k] ? keys[k] : dflt, seen = {}, out = [];
  for (var i = 0; i < list.length; i++) { var n = keyName(list[i]); if (!seen[n]) { seen[n] = 1; out.push("<kbd>" + esc(n) + "</kbd>"); } }
  return out.join(" or ");
}
function detect() {
  try {
    if (typeof navigator !== "undefined" && navigator.getGamepads) {
      var pads = navigator.getGamepads();
      for (var i = 0; pads && i < pads.length; i++) if (pads[i] && pads[i].connected) return "pad";
    }
    if (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) return "touch";
  } catch (e) {}
  return "keys";
}
function row(a, b) { return "<tr><th>" + a + "</th><td>" + b + "</td></tr>"; }
/* a Mac leaves Control out of the turn keys (prefs.js says why) */
var ON_MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.platform || "") &&
             (navigator.maxTouchPoints || 0) < 2;
function controlsBody(ctx, dev) {
  var modern = !!pref(ctx, "modern", false), keepOn = pref(ctx, "keep", true) !== false;
  var hd = pref(ctx, "hdTouch", 133), tap = pref(ctx, "tap", "sides"), lefty = !!pref(ctx, "lefty", false);
  var das = pref(ctx, "das", 167), arr = pref(ctx, "arr", 33);
  var out = "";
  if (dev === "keys") {
    out += "<table class=\"tally lrn-t lrn-ctl\"><tbody>" +
      row("Move", keyList(ctx, "left", ["ArrowLeft"]) + " / " + keyList(ctx, "right", ["ArrowRight"])) +
      row("Soft drop", keyList(ctx, "soft", ["ArrowDown"])) +
      row("Hard drop", keyList(ctx, "hard", ["Space"])) +
      row("Turn clockwise", keyList(ctx, "cw", ["ArrowUp", "KeyX"])) +
      row("Turn counter-clockwise", keyList(ctx, "ccw", ON_MAC ? ["KeyZ"] : ["KeyZ", "ControlLeft"])) +
      row("Half-turn", keyList(ctx, "flip", ["KeyA"]) + (modern ? "" : " <small>with Modern turning on</small>")) +
      row("Keep", keyList(ctx, "hold", ["KeyC", "ShiftLeft"]) + (keepOn ? "" : " <small>Keep is off in Handling</small>")) +
      row("Breath", keyList(ctx, "breath", ["KeyB"]) + " <small>Descent and Drift</small>") +
      row("Glass Well", keyList(ctx, "glass", ["KeyG"])) +
      row("Pause", keyList(ctx, "pause", ["Escape", "KeyP"])) +
      "</tbody></table>" +
      p("Press and hold a direction and the piece waits " + das + " ms, then " + (arr === 0 ? "slides to the wall" : "moves every " + arr + " ms") + ". Every key can be changed in Handling, by the key's position on the keyboard. While you play, arrows and Space never scroll the page, and every key is let go if the window loses focus. There are no ⌘ shortcuts.");
  } else if (dev === "touch") {
    out += "<div class=\"lrn-cards\">" +
      "<div class=\"lrn-card\"><span class=\"lrn-glyph\">↔</span><b>Drag to move</b><small>The piece follows your finger, a column at a time.</small></div>" +
      "<div class=\"lrn-card\"><span class=\"lrn-glyph\">↻</span><b>Tap to turn</b><small>" + (tap === "anywhere" ? "Anywhere turns clockwise." : (lefty ? "Left half clockwise, right half back." : "Right half clockwise, left half back.")) + "</small></div>" +
      "<div class=\"lrn-card\"><span class=\"lrn-glyph\">⤓</span><b>Flick down to drop</b><small>A slow drag down is a soft drop.</small></div>" +
      "<div class=\"lrn-card\"><span class=\"lrn-glyph\">⤒</span><b>Flick up to keep</b><small>Or tap the Keep niche.</small></div>" +
      "</div>" +
      "<table class=\"tally lrn-t lrn-ctl\"><tbody>" +
      row("Tap", "turn — " + (tap === "anywhere" ? "clockwise anywhere" : (lefty ? "left half clockwise, right half counter-clockwise" : "right half clockwise, left half counter-clockwise"))) +
      row("Two-finger tap", modern && tap !== "anywhere" ? "half-turn" : "turn counter-clockwise") +
      row("Drag sideways", "move, one column per short stretch of travel; the finger is the repeat") +
      row("Drag down slowly", "soft drop") +
      row("Flick down", "hard drop") +
      row("Flick up", "Keep") +
      row("Breath button", "beside the score, once ten beads are lit — gravity rests for one long breath <small>Descent and Drift</small>") +
      row("Pause button", "top corner, inside the safe area; there is no pause gesture, so it can't happen by accident") +
      "</tbody></table>" +
      p("<b>Hard-drop protection.</b> A flick within " + hd + " ms of a new piece appearing is ignored, so a drop meant for the last piece can't land the next one.") +
      p("Prefer buttons? Handling → Buttons puts a tray of big controls under the well, with left-handed mirroring and adjustable size.");
  } else {
    out += "<table class=\"tally lrn-t lrn-ctl\"><tbody>" +
      row("D-pad ← → or left stick", "move") +
      row("D-pad ↓ or stick down", "soft drop") +
      row("D-pad ↑", "hard drop") +
      row("Bottom face button", "turn clockwise") +
      row("Right face button", "turn counter-clockwise") +
      row("Top face button", "half-turn" + (modern ? "" : " <small>with Modern turning on</small>")) +
      row("Shoulder buttons", "Keep") +
      row("Left trigger", "Breath <small>Descent and Drift</small>") +
      row("View / Select", "Glass Well") +
      row("Menu / Start", "pause") +
      "</tbody></table>" +
      p("The Home button is never used. Directions repeat on the same timer as the keyboard: a wait of " + das + " ms, then " + (arr === 0 ? "straight to the wall" : "a step every " + arr + " ms") + ".");
  }
  return out;
}
PAGES.controls = function (ctx) {
  var dev = ctx.device || detect();
  if (dev !== "keys" && dev !== "touch" && dev !== "pad") dev = "keys";
  var tabs = [["keys", "Keyboard"], ["touch", "Touch"], ["pad", "Controller"]], t = "";
  for (var i = 0; i < tabs.length; i++) {
    t += "<button class=\"lrn-tab" + (tabs[i][0] === dev ? " on" : "") + "\" role=\"tab\" aria-selected=\"" + (tabs[i][0] === dev) + "\" data-device=\"" + tabs[i][0] + "\">" + tabs[i][1] + "</button>";
  }
  return "<div class=\"lrn-tabs\" role=\"tablist\">" + t + "</div><div data-ctl>" + controlsBody(ctx, dev) + "</div>";
};

PAGES.refuses = function () {
  var items = [
    ["No streaks, no daily rewards, no “come back tomorrow”.", "People start playing to keep the streak alive rather than for the game itself, and once it breaks they tend to play less afterwards. Nothing here is tied to days."],
    ["No daily challenges and no limited-time anything.", "Appointment play runs on the fear of missing out. Instead, every run has a well code anyone can play, any day."],
    ["No random prizes, loot or mystery boxes.", "Rewards on an unpredictable schedule drive compulsive play. Scoring is fixed and written down on the How page."],
    ["No ads, no accounts, no purchases, no currencies, no energy or lives.", "It's free, all of it, and nothing is for sale."],
    ["Nothing to unlock by grinding.", "Every mode, world and skin is open from the first launch. Stones mark skill moments and good stopping points, never hours played."],
    ["No rigged or “adaptive” dealer, and no “So close!”", "Manufactured near-misses raise the urge to play. The dealer is a fair, shuffled set of seven that never looks at your board."],
    ["It never starts another game for you.", "No countdowns, no auto-restart. When a run ends, the button with the focus is Done."],
    ["No notifications, no emails, no “your game is waiting”.", "Your run saves quietly. The game never contacts you."],
    ["No “game over”, no buzzers, no red alarms, no heartbeat sounds.", "Loss framing and sudden noises aren't kind, and a startle is no fun for anyone. The well rests."],
    ["No ever-bigger explosions, no screen shake, no full-screen flashes.", "Extreme effects measurably feel worse, and flashes are a seizure risk. Effects are capped, and the flash governor is always on."],
    ["No secret difficulty.", "Every mode says exactly how it eases, on the How page. Speed rises only with lines cleared, by a published rule; nothing eases off or tightens up by watching how you play."],
    ["No leaderboards and no multiplayer.", "A static site can't check anyone's score, and status anxiety isn't the point. Personal bests and share codes instead."],
    ["Nothing tracked.", "No analytics, no mood logs, no diary, no record of why you play. Settings and records live on your device and nowhere else."],
    ["No memory exercises.", "The Well will never ask you to think about something painful."],
    ["No health claims.", "The Well has never been tested in any study. " + navTo("steady", "What the research does and doesn't say") + " has its own page."],
    ["No borrowed names, colours, music or look.", "The rules are the genre's; every word, colour, material and note is our own."],
    ["No fire, thunder, sirens, weapons or emergency imagery, in any world.", "They are common reminders of frightening things, so none of the ten worlds uses them."]
  ];
  var h = "<ul class=\"lrn-refuse\">";
  for (var i = 0; i < items.length; i++) h += "<li><b>" + items[i][0] + "</b> <span>" + items[i][1] + "</span></li>";
  return h + "</ul>";
};

/* ================================================================
   rendering and wiring
   ================================================================ */

var STYLE = "" +
".lrn{-webkit-user-select:text;user-select:text}" +
".lrn .lrn-nav{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px;padding:0 0 10px;border-bottom:1px solid var(--line)}" +
".lrn .lrn-nav button{font-size:.8rem;padding:6px 11px;border-radius:999px;border:1px solid var(--line);background:var(--card2);color:var(--soft);min-height:32px}" +
".lrn .lrn-nav button.on{color:var(--ink);border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}" +
".lrn h3{font-size:1.02rem;margin:1.35em 0 .35em}" +
".lrn h4{font-size:.92rem;margin:0 0 .3em;color:var(--ink)}" +
".lrn .lrn-p{font-size:.92rem;line-height:1.55;margin:.45em 0;color:var(--ink);opacity:.92}" +
".lrn .lrn-soft{color:var(--soft);opacity:1;font-size:.86rem}" +
".lrn .lrn-src{font-size:.78rem;line-height:1.5;color:var(--soft);margin:1.2em 0 .4em}" +
".lrn .lrn-about{font-size:.76rem;color:var(--soft);border-top:1px solid var(--line);padding-top:10px;margin-top:1.2em}" +
".lrn .lrn-ul{margin:.4em 0 .6em;padding-left:1.25em;font-size:.92rem;line-height:1.55}" +
".lrn .lrn-ul li{margin:.35em 0}" +
".lrn a{color:var(--glow)}" +
".lrn .lrn-aside{margin:.8em 0;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid var(--line);font-size:.9rem;line-height:1.5}" +
".lrn .lrn-sum{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--glow)}" +
".lrn .lrn-code{font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em;color:var(--glow)}" +
".lrn .lrn-fig{display:flex;justify-content:center;margin:10px 0 4px}" +
".lrn .lrn-fig canvas{display:block;border-radius:12px;max-width:100%}" +
".lrn .lrn-cap{font-size:.82rem;color:var(--soft);text-align:center;margin:.3em 0 .8em;line-height:1.45;min-height:1.45em}" +
".lrn .lrn-mini{font-size:.78rem;padding:3px 10px;border-radius:999px;border:1px solid var(--line);background:var(--card2);color:var(--ink);margin-left:4px}" +
".lrn .lrn-t{font-size:.84rem;margin:8px 0}" +
".lrn .lrn-t th,.lrn .lrn-t td{font-variant-numeric:tabular-nums}" +
".lrn .lrn-t tbody th{font-weight:600;text-align:left;color:var(--ink)}" +
".lrn .lrn-t tbody th small,.lrn .lrn-t td small{display:block;color:var(--soft);font-weight:400;font-size:.76rem}" +
".lrn .lrn-t thead th{color:var(--soft);font-weight:600;font-size:.76rem}" +
".lrn .lrn-barh{width:34%}" +
".lrn .lrn-barc{text-align:left!important;padding-left:2px}" +
".lrn .lrn-bar{display:inline-block;height:6px;border-radius:3px;background:linear-gradient(90deg,var(--accent),var(--glow));opacity:.75;vertical-align:middle}" +
".lrn .lrn-ok{color:var(--good);font-size:.8em;margin-left:3px}" +
".lrn .lrn-dim{color:var(--soft);opacity:.6}" +
".lrn .lrn-score th,.lrn .lrn-score td{text-align:right}" +
".lrn .lrn-score thead th{font-size:.76rem}" +
".lrn .lrn-score tbody th{text-align:left}" +
".lrn .lrn-bonus td{text-align:left!important;color:var(--ink)}" +
".lrn .lrn-bonus th{width:38%;vertical-align:top}" +
".lrn .lrn-modes{list-style:none;margin:8px 0;padding:0}" +
".lrn .lrn-modes li{padding:8px 0;border-bottom:1px solid var(--line);font-size:.9rem}" +
".lrn .lrn-modes li:last-child{border-bottom:0}" +
".lrn .lrn-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}" +
".lrn .lrn-chips span{font-size:.78rem;padding:2px 9px;border-radius:999px;background:rgba(255,255,255,.045);border:1px solid var(--line);color:var(--soft);font-variant-numeric:tabular-nums}" +
".lrn .lrn-chips span:first-child{color:var(--ink)}" +
".lrn .lrn-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -4px}" +
".lrn .lrn-tu td,.lrn .lrn-tu th{text-align:left!important;font-size:.78rem;vertical-align:top}" +
".lrn .lrn-tu td:first-child{font-weight:600;white-space:nowrap}" +
".lrn .lrn-tabs{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:10px 0 2px}" +
".lrn .lrn-tab{font-size:.84rem;padding:7px 13px;border-radius:999px;border:1px solid var(--line);background:var(--card2);color:var(--soft);min-height:36px}" +
".lrn .lrn-tab.on{color:var(--ink);border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}" +
".lrn .lrn-steps{display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap;margin:4px 0}" +
".lrn .lrn-step{min-width:40px;min-height:36px;border-radius:10px;border:1px solid var(--line);background:var(--card2);color:var(--soft);font-size:.82rem;font-variant-numeric:tabular-nums}" +
".lrn .lrn-step.on{color:var(--ink);border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}" +
".lrn .lrn-step.fit{color:var(--good)}" +
".lrn .lrn-step.nav{color:var(--ink)}" +
".lrn .lrn-kt td,.lrn .lrn-kt th{text-align:left!important}" +
".lrn .lrn-kt tbody th,.lrn .lrn-kt td:nth-child(2){white-space:nowrap}" +
".lrn .lrn-kt tr.on td,.lrn .lrn-kt tr.on th{background:rgba(255,255,255,.05)}" +
".lrn .lrn-kt td.r{text-align:right!important;color:var(--soft)}" +
".lrn .lrn-kt tr.fit td.r{color:var(--good)}" +
".lrn .lrn-pair{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}" +
".lrn .lrn-pair figure{margin:0;flex:1 1 220px;max-width:300px}" +
".lrn .lrn-pair figcaption{font-size:.82rem;color:var(--soft);line-height:1.45;text-align:center}" +
".lrn .lrn-pair figcaption b{color:var(--ink)}" +
".lrn .lrn-help{margin:.4em 0;padding:12px 14px 4px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid var(--line)}" +
".lrn .lrn-region{margin:0 0 14px}" +
".lrn .lrn-region h4,.lrn .lrn-region h3{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);font-weight:650;margin:0 0 2px}" +
".lrn .lrn-region ul{list-style:none;margin:0;padding:0}" +
".lrn .lrn-region li{padding:8px 0;border-bottom:1px solid var(--line);font-size:.9rem;line-height:1.45}" +
".lrn .lrn-region li:last-child{border-bottom:0}" +
".lrn .lrn-note{display:block;color:var(--soft);font-size:.85rem}" +
".lrn .lrn-links{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}" +
".lrn .lrn-call{display:inline-flex;align-items:center;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--card2);color:var(--ink);text-decoration:none;font-weight:600;font-size:.88rem}" +
".lrn .lrn-call2{flex-direction:column;align-items:flex-start;justify-content:center;padding:6px 14px;line-height:1.2}" +
".lrn .lrn-call2 small{font-weight:400;color:var(--soft);font-size:.74rem}" +
".lrn .lrn-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:10px 0}" +
".lrn .lrn-card{border:1px solid var(--line);border-radius:13px;background:var(--card2);padding:10px;display:flex;flex-direction:column;gap:2px;font-size:.88rem}" +
".lrn .lrn-card small{color:var(--soft);font-size:.78rem;line-height:1.35}" +
".lrn .lrn-glyph{font-size:1.4rem;line-height:1;color:var(--glow)}" +
".lrn kbd{font-family:inherit;font-size:.82rem;padding:1px 7px;border-radius:6px;border:1px solid var(--line);background:var(--card2);box-shadow:0 1px 0 rgba(0,0,0,.4)}" +
".lrn .lrn-refuse{list-style:none;margin:0;padding:0}" +
".lrn .lrn-refuse li{padding:9px 0;border-bottom:1px solid var(--line);font-size:.9rem;line-height:1.5}" +
".lrn .lrn-refuse li span{color:var(--soft)}" +
".lrn button:focus-visible,.lrn a:focus-visible{outline:2px solid var(--glow);outline-offset:2px}" +
"@media (prefers-reduced-motion:reduce){.lrn *{transition:none!important}}";

function style() {
  if (typeof document === "undefined" || document.getElementById("lrnStyle")) return;
  var s = document.createElement("style");
  s.id = "lrnStyle";
  s.textContent = STYLE;
  (document.head || document.documentElement).appendChild(s);
}

function sectionOf(id) {
  for (var i = 0; i < Learn.sections.length; i++) if (Learn.sections[i].id === id) return Learn.sections[i];
  return Learn.sections[0];
}

/* Every live figure on screen, so one resize listener can redraw them. */
var live = [];
var resizeHooked = false;
function hookResize() {
  if (resizeHooked || typeof window === "undefined") return;
  resizeHooked = true;
  var pending = 0;
  window.addEventListener("resize", function () {
    if (pending) return;
    pending = requestAnimationFrame(function () {
      pending = 0;
      var keep = [];
      for (var i = 0; i < live.length; i++) if (live[i].cv.isConnected !== false && document.contains(live[i].cv)) { live[i].redraw(true); keep.push(live[i]); }
      live = keep;
    });
  });
}

Learn.render = function (el, id, ctx) {
  if (!el) return;
  ctx = ctx || {};
  style();
  hookResize();
  if (el.__lrnStop) el.__lrnStop();
  var sec = sectionOf(id), data = null;
  if (sec.id === "how") { try { data = Learn.live(); } catch (e) { data = null; } }
  /* Hosted in a tab panel, the host already shows the sections and their
     titles; on its own (Steady's "Why this game?"), the page titles itself.
     A row of section buttons is there for any host that asks for it. */
  var hosted = el.getAttribute && el.getAttribute("role") === "tabpanel";
  var nav = "";
  if (ctx.nav === true) {
    nav = "<nav class=\"lrn-nav\" aria-label=\"The Well, explained\">";
    for (var i = 0; i < Learn.sections.length; i++) {
      var s = Learn.sections[i];
      nav += "<button data-learn=\"" + s.id + "\"" + (s.id === sec.id ? " class=\"on\" aria-current=\"page\"" : "") + ">" + esc(s.short || s.title) + "</button>";
    }
    nav += "</nav>";
  }
  var head = (ctx.title === false || (hosted && ctx.title !== true) ? "" : "<h2>" + esc(sec.title) + "</h2>") + "<p class=\"lead\">" + esc(sec.lead) + "</p>";
  var bodyHTML = sec.id === "how" ? (data ? PAGES.how(ctx, data) : p("The rules tables couldn't be read just now.")) : PAGES[sec.id](ctx);
  el.innerHTML = "<div class=\"lrn\">" + nav + head + bodyHTML + "</div>";
  var stops = [];
  el.__lrnStop = function () { for (var k = 0; k < stops.length; k++) stops[k](); stops = []; };
  wire(el, sec.id, ctx, data, stops);
  if (typeof ctx.onSection === "function") ctx.onSection(sec.id);
};

function wire(el, id, ctx, data, stops) {
  var links = el.querySelectorAll("[data-learn]");
  for (var i = 0; i < links.length; i++) {
    links[i].addEventListener("click", function (e) {
      e.preventDefault();
      var to = this.getAttribute("data-learn");
      /* if the host has a tab for it, let the host switch, so its tabs and
         this page never disagree about where you are */
      var host = el.parentNode && el.parentNode.querySelector ? el.parentNode.querySelector("[role=tablist] [data-tab=\"" + to + "\"]") : null;
      if (host && host !== this) { host.click(); return; }
      Learn.render(el, to, ctx);
      /* back to the top of whatever is scrolling the sheet */
      for (var sc = el; sc && sc.nodeType === 1; sc = sc.parentNode) {
        if (sc.scrollTop > 0) { sc.scrollTop = 0; break; }
      }
    });
  }
  var pal = palette(ctx);
  if (id === "how" && data) wireHow(el, ctx, data, pal, stops);
  if (id === "controls") {
    var tabs = el.querySelectorAll("[data-device]");
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].addEventListener("click", function () {
        var dev = this.getAttribute("data-device");
        for (var u = 0; u < tabs.length; u++) { var on = tabs[u] === this; tabs[u].classList.toggle("on", on); tabs[u].setAttribute("aria-selected", on ? "true" : "false"); }
        el.querySelector("[data-ctl]").innerHTML = controlsBody(ctx, dev);
      });
    }
  }
}

function mountFig(cv, cols, rowsN, maxCell, draw) {
  var keep = [];
  for (var i = 0; i < live.length; i++) if (document.contains(live[i].cv)) keep.push(live[i]);
  live = keep;
  var f = Fig(cv, cols, rowsN, maxCell);
  var entry = { cv: cv, redraw: function (refit) { if (refit) f.fit(); draw(f); } };
  live.push(entry);
  draw(f);
  return entry;
}

function wireHow(el, ctx, data, pal, stops) {
  var bagCv = el.querySelector("[data-fig=bag]");
  if (bagCv && data.bag) {
    var bagEntry = mountFig(bagCv, 34, 9, 13, function (f) { drawBag(f, data.bag, pal); });
    var dealBtn = el.querySelector("[data-deal]");
    var paintDeal = function () {
      var codeEl = el.querySelector(".lrn-code"), capEl = el.querySelector("[data-dealcap]"), b = data.bag;
      if (codeEl && b.code) codeEl.textContent = b.code;
      if (capEl) capEl.textContent = dealCaption(b);
      bagCv.setAttribute("aria-label", "Three rows of seven pieces: " + b.first.slice(0, 7).join(" ") + "; " + b.first.slice(7, 14).join(" ") + "; " + b.first.slice(14, 21).join(" "));
    };
    if (dealBtn) dealBtn.addEventListener("click", function () {
      data.bag = Learn.deal((Math.random() * 1073741823) >>> 0 || 1, 371);
      bagEntry.redraw(false);
      paintDeal();
    });
  }
  var tf = el.querySelector("[data-fig=twistFull]"), tm = el.querySelector("[data-fig=twistMini]");
  if (tf) mountFig(tf, 12, 6, 22, function (f) { drawTwist(f, "full", pal); });
  if (tm) mountFig(tm, 12, 6, 22, function (f) { drawTwist(f, "mini", pal); });
  var kick = el.querySelector("[data-kick]");
  if (kick) wireKick(kick, ctx, data, pal, stops);
}

/* The kick diagram. It plays its tests one at a time — the piece where it
   started drawn as a dotted outline, each attempt either blocked (pale,
   with the cells that collide crossed) or fitting (in colour, glowing) —
   holds on the one that fits, and goes round again. With reduced motion it
   never moves by itself: the numbered buttons and the arrows step it. */
function wireKick(box, ctx, data, pal, stops) {
  var cv = box.querySelector("canvas"), stepsEl = box.querySelector("[data-steps]");
  var cap = box.querySelector("[data-kcap]"), tab = box.querySelector("[data-ktab]");
  var tabs = box.querySelectorAll("[data-scene]");
  var still = reduced(ctx);
  var scene = 1, step = -1, auto = !still, timer = 0, raf = 0, visible = true, entry = null;

  function sc() { return SCENES[scene]; }
  function tests() { return kickList(sc().piece, sc().from, sc().to).tests; }
  function fitIndex() { return firstFit(sc()); }
  function render() {
    var s = sc(), ts = tests(), fit = fitIndex(), conf = data.scenes ? data.scenes[scene] : null;
    entry.redraw(false);
    var label = s.name + ": ", c;
    var later = fit >= 0 && step > fit;
    if (step < 0) label += "the " + s.piece + " before it turns.";
    else label += "test " + (step + 1) + " of " + ts.length + ", " + offsetWords(ts[step]) + " — " +
      (later ? "never tried." : attempt(s, ts, step).fits ? "it fits." : "blocked.");
    cv.setAttribute("aria-label", label);
    if (step < 0) c = s.say;
    else if (later) c = "Test " + (step + 1) + " of " + ts.length + ": " + offsetWords(ts[step]) + ". Never tried — test " + (fit + 1) + " already fitted, and the first fit wins.";
    else c = "Test " + (step + 1) + " of " + ts.length + ": " + offsetWords(ts[step]) + ". " +
      (attempt(s, ts, step).fits ? "It fits, so the turn happens here." : "Blocked.");
    if (step === fit && conf && conf.kick === fit) c += " The game agrees: turning this piece for real used test " + (conf.kick + 1) + ".";
    cap.textContent = c;
    var h = "";
    for (var i = 0; i < ts.length; i++) {
      var cls = (i === step ? "on" : "") + (i === fit ? " fit" : "");
      h += "<tr class=\"" + cls + "\"><th>Test " + (i + 1) + "</th><td>(" + sgn(ts[i][0]) + ", " + sgn(ts[i][1]) + ")</td><td>" + offsetWords(ts[i]) + "</td><td class=\"r\">" +
        (i < fit ? "blocked" : i === fit ? "fits" : "unused") + "</td></tr>";
    }
    tab.innerHTML = "<thead><tr><th colspan=\"4\">" + esc(s.piece) + " turning " + (s.to === ((s.from + 1) & 3) ? "clockwise" : "counter-clockwise") + ", " + ORDER[s.from] + " → " + ORDER[s.to] + (kickList(s.piece, s.from, s.to).source === "rules" ? ", read from the game's rule table" : "") + "</th></tr></thead><tbody>" + h + "</tbody>";
    var b = "";
    if (still) b += "<button class=\"lrn-step nav\" data-k=\"prev\" aria-label=\"Previous test\">‹</button>";
    b += "<button class=\"lrn-step" + (step < 0 ? " on" : "") + "\" data-k=\"-1\" aria-label=\"Before the turn\">Start</button>";
    for (var j = 0; j < ts.length; j++) b += "<button class=\"lrn-step" + (j === step ? " on" : "") + (j === fit ? " fit" : "") + "\" data-k=\"" + j + "\" aria-label=\"Test " + (j + 1) + "\">" + (j + 1) + "</button>";
    if (still) b += "<button class=\"lrn-step nav\" data-k=\"next\" aria-label=\"Next test\">›</button>";
    else b += "<button class=\"lrn-step nav\" data-k=\"play\" aria-label=\"" + (auto ? "Pause" : "Play") + "\">" + (auto ? "❚❚" : "▶") + "</button>";
    stepsEl.innerHTML = b;
    for (var t = 0; t < tabs.length; t++) {
      var on = +tabs[t].getAttribute("data-scene") === scene;
      tabs[t].classList.toggle("on", on); tabs[t].setAttribute("aria-selected", on ? "true" : "false");
    }
  }
  entry = mountFig(cv, 12, 8, 26, function (f) { drawKick(f, sc(), step, pal); });

  /* the timeline: each test holds for a beat; the fitting one holds longer */
  var last = 0, wait = 1300;
  function frame(ts) {
    raf = 0;
    if (!auto || !visible) return;
    if (!document.contains(cv)) { stop(); return; }
    if (!last) last = ts;
    if (ts - last >= wait) {
      last = ts;
      var fit = fitIndex();
      if (step >= fit) { step = -1; wait = 1700; }
      else { step++; wait = step === fit ? 2600 : 1150; }
      render();
    }
    raf = requestAnimationFrame(frame);
  }
  function go() { if (auto && !raf && visible) { last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; if (timer) clearTimeout(timer); timer = 0; }
  stops.push(stop);

  stepsEl.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-k]") : null;
    if (!b) return;
    var k = b.getAttribute("data-k"), n = tests().length;
    if (k === "play") { auto = !auto; if (auto) go(); else stop(); render(); return; }
    if (k === "prev") step = Math.max(-1, step - 1);
    else if (k === "next") step = step + 1 >= n ? -1 : step + 1;
    else { step = +k; if (auto) { auto = false; stop(); } }
    render();
  });
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener("click", function () {
      scene = +this.getAttribute("data-scene");
      step = -1;
      render();
      if (auto) { stop(); go(); }
    });
  }
  if (typeof IntersectionObserver === "function") {
    var io = new IntersectionObserver(function (en) {
      visible = en[0].isIntersecting;
      if (visible) go(); else stop();
    });
    io.observe(cv);
    stops.push(function () { io.disconnect(); });
  }
  render();
  go();
}

if (typeof module !== "undefined" && module.exports) module.exports = Learn;
else root.Learn = Learn;
})(typeof self !== "undefined" ? self : this);
