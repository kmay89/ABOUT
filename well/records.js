/* records.js — Stones, personal bests, and the numbers on the run card.

   Everything a player can be told about their own play is decided here,
   and nothing else is: this file never draws, never stores and never
   looks at the clock. The app hands it engine events as they happen and a
   finished run at the end; it hands back which Stones were just found,
   whether a personal best fell, and the handful of numbers worth putting
   on the card. What it keeps lives in one plain object the app saves
   through Prefs.store("records") — JSON in, JSON out.

   ## What gets rewarded, and what never does

   Stones mark *moments*: the first Quad, the first Twist that clears a
   line, three difficult clears in a row, an Empty Well. They also mark
   good places to stop — finishing a Forty, reaching the Surface, and one
   Stone, Knew When to Stop, for choosing Finish when Steady's time is up.
   None of them is for volume or time. There is no "1,000 lines", no
   "ten hours", because a prize for doing more is a prize for not
   stopping, and the whole room is built the other way round.

   So the rules are short:

     only ever add    a Stone or a medal, once found, is kept. Nothing
                      decays, expires or resets, and nothing is hidden —
                      every Stone is listed from the first launch with the
                      one line that says how it is found.
     no calendar      not one date is stored anywhere in here. A record of
                      *when* you played is the raw material of a streak,
                      and streaks are refused (brief §14). Steady keeps
                      exactly two numbers: how many sessions, and how long
                      in total — never which days.
     nothing about    no mood, no reason for playing, no record of opening
     why              the explainer or the help lines. There is
                      deliberately no Stone for reading them.

   ## Personal bests are for clean runs, and every run still counts

   A run with a rest (Descent's "Begin again from this depth"), at learner
   speed, or with a lesson hint is not saved as a personal best. That is
   not a penalty and the card never says it like one: those runs get a
   plain note ("with 1 rest", "learner speed", "with a hint"), they still
   go into the last-ten history and the lifetime totals, and anything you
   *finish* — the Surface, a Forty, a lesson — still earns its Stone. Only
   the marks that claim a performance (a best, a Forty or Three Minutes
   medal, Forty under two minutes) ask for a clean run, because those are
   the ones a slower clock or a hint would make untrue.

   The first clean run in a mode sets the bar quietly. Beating yourself is
   a personal best; having played once is not, and pretending otherwise
   would make the one that matters feel like the hundredth.

   ## The run-scoped scratch

   Some Stones need memory between events: which piece came out of Keep,
   how many finesse-perfect pieces in a row, which world this is. That
   scratch hangs off the records object as a *non-enumerable* property, so
   JSON.stringify never sees it and it can never leak into the save, and
   it resets itself whenever a different game object turns up. observe()
   runs on every engine event at 240 Hz; when nothing is earned it returns
   one shared empty array and allocates nothing.                          */
(function (root) {
"use strict";

/* modes.js is a sibling pure file. Looked up when needed rather than at
   load, so the order the two are evaluated in never matters. */
function modesKit() {
  if (root.Modes) return root.Modes;
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    try { return require("./modes.js"); } catch (e) { return null; }
  }
  return null;
}
function worldsKit() {
  if (root.Worlds) return root.Worlds;
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    try { return require("./worlds.js"); } catch (e) { return null; }
  }
  return null;
}

var Records = {};

/* ---------- the Stones ----------
   Brief §10.4, in its order, every one visible. `line` is what the
   Logbook shows under the name: how it is found, in one sentence. */
Records.STONES = [
  { id: "quad",            name: "Four at Once",
    line: "Clear four rows with one piece: your first Quad." },
  { id: "twist",           name: "A Twist",
    line: "Turn a T piece into a tight spot and clear a line with it." },
  { id: "twistDouble",     name: "Twist Double",
    line: "Clear two rows with a Twist." },
  { id: "twistTriple",     name: "Twist Triple",
    line: "Clear three rows with a Twist." },
  { id: "empty",           name: "Empty Well",
    line: "Clear every last cell, so the well is empty." },
  { id: "unbroken",        name: "Unbroken",
    line: "Three Quads or Twists in a row with no plain clear between: Unbroken \u00d72." },
  { id: "ripples",         name: "Ripples",
    line: "Clear lines with five pieces in a row: Ripple 4." },
  { id: "kept",            name: "Kept for Later",
    line: "Make a Quad with a long piece you took out of Keep." },
  { id: "fewest",          name: "Fewest Moves",
    line: "Place twenty pieces in a row in the fewest possible presses, in any mode." },
  { id: "forty",           name: "Forty",
    line: "Finish a Forty: clear forty lines." },
  { id: "fortyUnder2",     name: "Forty under 2:00",
    line: "Finish a Forty in under two minutes." },
  { id: "fortyUnder1",     name: "Forty under 1:00",
    line: "Finish a Forty in under a minute." },
  { id: "three",           name: "Three Minutes",
    line: "Score 50,000 in Three Minutes." },
  { id: "surfaceGentle",   name: "The Surface \u00b7 Gentle",
    line: "Reach the Surface in Descent at Gentle pace." },
  { id: "surfaceStandard", name: "The Surface \u00b7 Standard",
    line: "Reach the Surface in Descent at Standard pace." },
  { id: "surfaceSwift",    name: "The Surface \u00b7 Swift",
    line: "Reach the Surface in Descent at Swift pace." },
  { id: "silt",            name: "Silt",
    line: "Clear ten rows of silt." },
  { id: "lessons",         name: "Lessons",
    line: "Pass the first four lessons, in any order." },
  { id: "worlds",          name: "Every World",
    line: "Play in each of the ten worlds." },
  { id: "deepBreath",      name: "Deep Breath",
    line: "Take a Breath in Descent at Standard pace with the well more than half full." },
  { id: "breathTaken",     name: "A Breath Taken",
    line: "Breathe along to the end of Steady's minute of breathing." },
  { id: "stopped",         name: "Knew When to Stop",
    line: "Choose Finish when Steady's time is up, or Rest at the end of a Drift chapter." },
  { id: "glass",           name: "Looked Inside",
    line: "Open the Glass Well while you play." }
];
var STONE = {};
(function () { for (var i = 0; i < Records.STONES.length; i++) STONE[Records.STONES[i].id] = Records.STONES[i]; })();
Records.stone = function (id) { return STONE[id] || null; };

/* App-level moments that reach observe() alongside the engine's events.
   The engine never emits these; app.js does, at the moment they happen:
     {t:"glass"}     the Glass Well was opened during play     -> Looked Inside
     {t:"breathed"}  Steady's breathing outro ran to its end    -> A Breath Taken
     {t:"stop"}      Finish at Steady's timer card, or Rest at a
                     Drift chapter's end                        -> Knew When to Stop
     {t:"pass", lesson, hint}  a lesson was passed (Coach.onPass)
     {t:"world", world}        the world changed (the same event R.fx gets)
   steady.js reports the two Steady ones through its onMoment callback,
   using exactly these names. */
Records.MOMENTS = ["glass", "breathed", "stop", "pass", "world"];

/* the ten worlds, so "Every World" is bounded by real ids */
var WORLD_IDS = ["dawn", "tide", "rain", "bamboo", "aurora", "moonpool", "lanterns", "snowfall", "bells", "starfield"];
function worldIds() {
  var W = worldsKit();
  return (W && W.ids && W.ids.length) ? W.ids : WORLD_IDS;
}

/* ---------- the data ---------- */
var LIFE_KEYS = ["pieces", "lines", "ms", "sessions", "steadySessions", "steadyMs"];

Records.blank = function () {
  return {
    v: 1,
    stones: {},     /* id -> 1                                            */
    best: {},       /* pbKey -> {value, medal}   clean runs only          */
    hist: {},       /* pbKey -> [{v, n}]  last ten finished runs, n = noted */
    medals: {},     /* pbKey -> best medal name ever earned on that key   */
    lessons: {},    /* lesson id -> {pass:1, hint:0|1}                    */
    worlds: {},     /* world id -> 1, for Every World                     */
    life: { pieces: 0, lines: 0, ms: 0, sessions: 0, steadySessions: 0, steadyMs: 0 }
  };
};

/* A save from an older build, a hand-edited one, or null: fill in what is
   missing rather than throw. Cheap enough to run on every call. */
function ensure(d) {
  if (!d.stones || typeof d.stones !== "object") d.stones = {};
  if (!d.best || typeof d.best !== "object") d.best = {};
  if (!d.hist || typeof d.hist !== "object") d.hist = {};
  if (!d.medals || typeof d.medals !== "object") d.medals = {};
  if (!d.lessons || typeof d.lessons !== "object") d.lessons = {};
  if (!d.worlds || typeof d.worlds !== "object") d.worlds = {};
  if (!d.life || typeof d.life !== "object") d.life = {};
  for (var i = 0; i < LIFE_KEYS.length; i++) {
    var k = LIFE_KEYS[i];
    if (typeof d.life[k] !== "number" || !isFinite(d.life[k]) || d.life[k] < 0) d.life[k] = 0;
  }
  if (!d.v) d.v = 1;
  return d;
}
Records.ensure = function (data) { return ensure(data || Records.blank()); };
function goodBest(b) { return !!b && typeof b === "object" && typeof b.value === "number" && isFinite(b.value); }

/* ---------- two tabs, one save ----------
   Every tab of the room keeps the records in memory and writes them back
   whole, so without this the last tab to write wins: an idle tab closed
   after another tab set a best would put the old records back over it.
   So a write first folds in what is on disk. Found things are a union; a
   best keeps the better value (a time is better low, a score high, read
   off the key as resolve() decides it), a medal the higher one, the last
   ten the longer list. The lifetime counters are the one place a tab's
   own additions have to be told apart from the other tab's: base is this
   tab's counters as it last read or wrote them, so what this tab added
   since is laid on top of what the disk now holds. Without a base the
   larger of the two is kept. into is changed in place, so its run-scoped
   scratch survives. */
function lowKey(key) { return /^(forty|silt)\./.test(key); }
Records.merge = function (into, other, base) {
  ensure(into);
  if (!other || typeof other !== "object" || other === into) return into;
  other = ensure(other);
  var k, a, b;
  var sets = ["stones", "worlds"];
  for (var i = 0; i < sets.length; i++) {
    for (k in other[sets[i]]) if (other[sets[i]][k] && !into[sets[i]][k]) into[sets[i]][k] = other[sets[i]][k];
  }
  for (k in other.lessons) {
    b = other.lessons[k];
    if (!b || typeof b !== "object") continue;
    a = into.lessons[k];
    if (!a || typeof a !== "object") into.lessons[k] = { pass: 1, hint: b.hint ? 1 : 0 };
    else if (!b.hint) a.hint = 0;
  }
  for (k in other.best) {
    b = other.best[k];
    if (!goodBest(b)) continue;
    a = into.best[k];
    if (!goodBest(a)) { into.best[k] = { value: b.value, medal: typeof b.medal === "string" ? b.medal : null }; continue; }
    if (lowKey(k) ? b.value < a.value : b.value > a.value) a.value = b.value;
    if (typeof b.medal === "string" && medalRank(k.split(".")[0], b.medal) > medalRank(k.split(".")[0], a.medal)) a.medal = b.medal;
  }
  for (k in other.medals) {
    b = other.medals[k];
    if (typeof b !== "string") continue;
    a = into.medals[k];
    if (typeof a !== "string" || medalRank(k.split(".")[0], b) > medalRank(k.split(".")[0], a)) into.medals[k] = b;
  }
  for (k in other.hist) {
    b = other.hist[k];
    if (Array.isArray(b) && (!Array.isArray(into.hist[k]) || b.length > into.hist[k].length)) into.hist[k] = b.slice();
  }
  for (i = 0; i < LIFE_KEYS.length; i++) {
    k = LIFE_KEYS[i];
    var mine = into.life[k], theirs = other.life[k];
    if (base && typeof base[k] === "number") into.life[k] = theirs + Math.max(0, mine - base[k]);
    else into.life[k] = Math.max(mine, theirs);
  }
  return into;
};

/* ---------- the run-scoped scratch ---------- */
function freshLive() {
  return { g: null, kept: 0, fromKeepI: false, lockedKeepI: false,
           fp: 0, ft: 0, fstreak: 0, world: null, silt: 0,
           locks: 0, lastClearAt: -2, rip: 0, chain: 0,
           got: [], done: null };
}
function live(data, g) {
  var L = data._live;
  if (!L) {
    L = freshLive();
    /* invisible to JSON.stringify, so it can never end up in the save */
    Object.defineProperty(data, "_live", { value: L, writable: true, configurable: true, enumerable: false });
  }
  if (g && L.g !== g) {
    L.g = g;
    L.kept = g.hold || 0;
    L.fromKeepI = false; L.lockedKeepI = false;
    var st = g.stats || {};
    L.fp = st.finessePerfect || 0;
    L.ft = st.finesseTotal || 0;
    L.fstreak = 0;
    L.world = null;
    L.silt = 0;
    L.locks = 0; L.lastClearAt = -2; L.rip = 0; L.chain = 0;
    L.got = [];
    L.done = null;
  }
  return L;
}

/* observe() returns this when nothing was earned — which is nearly always.
   Shared, so callers must read it, never push to it. */
var NONE = [];
if (Object.freeze) Object.freeze(NONE);

function earn(data, L, id, out) {
  if (data.stones[id]) return out;
  data.stones[id] = 1;
  L.got.push(id);
  if (out === NONE) out = [];
  out.push(id);
  return out;
}

function isI(t) { return t === 1 || t === "I"; }
function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }

/* highest filled row + 1: how tall the stack is, in rows */
function stackHeight(g) {
  var b = g && g.board;
  if (!b || !b.length) return 0;
  for (var y = Math.floor(b.length / 10) - 1; y >= 0; y--) {
    for (var x = 0; x < 10; x++) if (b[y * 10 + x]) return y + 1;
  }
  return 0;
}

function paceOf(opts) {
  if (!opts) return null;
  var p = opts.pace || opts.descentPace || null;
  return typeof p === "string" ? p.toLowerCase() : null;
}

function idOf(w) {
  if (!w) return null;
  if (typeof w === "string") return w;
  return w.id || null;
}

function worldOf(L, ctx) {
  if (ctx.world) return idOf(ctx.world);
  if (L.world) return L.world;
  var M = modesKit(), mode = M && M.get ? M.get(ctx.modeId) : null;
  if (mode && typeof mode.world === "function") {
    try {
      var depth = typeof mode.depthOf === "function" ? mode.depthOf(ctx.g) : null;
      var w = idOf(mode.world(ctx.opts || {}, depth));
      if (w) return w;
    } catch (e) { /* a sibling's odd input is not worth a thrown frame */ }
  }
  return ctx.opts ? idOf(ctx.opts.world) : null;
}

function markWorld(data, L, w, out) {
  if (!w || data.worlds[w]) return out;
  var ids = worldIds(), known = false, have = 0, i;
  for (i = 0; i < ids.length; i++) if (ids[i] === w) known = true;
  if (!known) return out;
  data.worlds[w] = 1;
  for (i = 0; i < ids.length; i++) if (data.worlds[ids[i]]) have++;
  if (have >= ids.length) out = earn(data, L, "worlds", out);
  return out;
}

/* ---------- lessons ---------- */
var LESSON_FALLBACK = ["finesse", "keep", "clean", "slot"];
/* "Lessons 1-4": the first four lessons that are not silt, in the order
   modes.js lists them. Later lessons (5 and 6) do not move this Stone. */
function firstFour() {
  var M = modesKit(), out = [];
  if (M && M.LESSONS && M.LESSONS.length) {
    for (var i = 0; i < M.LESSONS.length && out.length < 4; i++) {
      var l = M.LESSONS[i];
      if (l && l.id && l.kind !== "silt") out.push(l.id);
    }
  }
  return out.length ? out : LESSON_FALLBACK;
}
function isLesson(id) {
  if (!id) return false;
  var M = modesKit();
  if (M && M.LESSONS && M.LESSONS.length) {
    for (var i = 0; i < M.LESSONS.length; i++) if (M.LESSONS[i] && M.LESSONS[i].id === id && M.LESSONS[i].kind !== "silt") return true;
    return false;
  }
  for (var j = 0; j < LESSON_FALLBACK.length; j++) if (LESSON_FALLBACK[j] === id) return true;
  return false;
}
function passLesson(data, L, id, hint, out) {
  if (!isLesson(id)) return out;
  var rec = data.lessons[id];
  /* a later pass without a hint clears the note; a hint never adds one
     to a lesson already passed cleanly */
  if (!rec) data.lessons[id] = { pass: 1, hint: hint ? 1 : 0 };
  else if (!hint) rec.hint = 0;
  var four = firstFour();
  for (var i = 0; i < four.length; i++) if (!data.lessons[four[i]]) return out;
  return earn(data, L, "lessons", out);
}

/* ================================================================
   observe — every engine event, plus the app moments above
   ================================================================ */
var NOCTX = {};
Records.observe = function (data, ev, ctx) {
  if (!data || !ev) return NONE;
  ctx = ctx || NOCTX;
  /* the splash's bot plays Quads behind the title; those are not yours */
  if (ctx.demo || (ctx.view && ctx.view.demo) || ctx.modeId === "demo") return NONE;
  switch (ev.t) {
    case "lock":     return onLock(ensure(data), ev, ctx);
    case "clear":    return onClear(ensure(data), ev, ctx);
    case "hold":     return onHold(ensure(data), ev, ctx);
    case "breath":   return ev.on ? onBreath(ensure(data), ev, ctx) : NONE;
    case "world":    live(data, ctx.g).world = idOf(ev.world); return NONE;
    case "glass":    return onGlass(ensure(data), ev, ctx);
    case "breathed": ensure(data); return earn(data, live(data, ctx.g), "breathTaken", NONE);
    case "stop":     ensure(data); return earn(data, live(data, ctx.g), "stopped", NONE);
    case "pass":
      ensure(data);
      return passLesson(data, live(data, ctx.g), ev.lesson || ev.id || (ctx.opts && ctx.opts.lesson), !!ev.hint, NONE);
  }
  return NONE;
};

function onHold(data, ev, ctx) {
  var g = ctx.g, L = live(data, g);
  /* Whatever Keep held before this swap is what just came out of it (the
     engine says so in `from`; the scratch remembers it too, for an event
     without it). When Keep was empty the next piece came from the queue
     instead, and that one was never "kept for later". */
  var out = ev.from !== undefined && ev.from !== null ? ev.from : L.kept;
  L.fromKeepI = isI(out);
  L.kept = ev.type || (g ? g.hold || 0 : 0);
  return NONE;
}

function onLock(data, ev, ctx) {
  var g = ctx.g, L = live(data, g), out = NONE;
  L.locks++;
  L.lockedKeepI = L.fromKeepI && isI(ev.type);
  L.fromKeepI = false;

  /* Fewest Moves: the engine judges each piece it can (no soft drop, no
     tuck, no spin) and says how many presses it took against the fewest
     possible. A judged piece that was perfect extends the run, an
     imperfect one ends it, and a piece it could not judge leaves the run
     as it was. An event without those fields falls back to the totals. */
  var st = g && g.stats;
  if (typeof ev.optimal === "number" && typeof ev.presses === "number") {
    if (ev.optimal >= 0) L.fstreak = ev.presses <= ev.optimal ? L.fstreak + 1 : 0;
    if (st) { L.ft = st.finesseTotal || 0; L.fp = st.finessePerfect || 0; }
    if (L.fstreak >= 20) out = earn(data, L, "fewest", out);
  } else if (st && typeof st.finesseTotal === "number") {
    var dt = st.finesseTotal - L.ft, dp = (st.finessePerfect || 0) - L.fp;
    if (dt > 0) L.fstreak = dp >= dt ? L.fstreak + dt : 0;
    L.ft = st.finesseTotal; L.fp = st.finessePerfect || 0;
    if (L.fstreak >= 20) out = earn(data, L, "fewest", out);
  }

  /* a locked piece is the proof you played in this world, not merely
     passed through it during a crossfade */
  out = markWorld(data, L, worldOf(L, ctx), out);
  return out;
}

function onClear(data, ev, ctx) {
  var g = ctx.g, L = live(data, g), out = NONE;
  var n = ev.n || (ev.rows ? ev.rows.length : 0);
  var tw = ev.twist || "none";
  if (!n) return NONE;

  if (n === 4) {
    out = earn(data, L, "quad", out);
    if (L.lockedKeepI) out = earn(data, L, "kept", out);
  }
  if (tw !== "none") {
    out = earn(data, L, "twist", out);
    if (tw === "full" && n === 2) out = earn(data, L, "twistDouble", out);
    if (tw === "full" && n === 3) out = earn(data, L, "twistTriple", out);
  }
  if (ev.empty) out = earn(data, L, "empty", out);

  /* Unbroken and Ripple fire exactly when the label the player sees
     ("Unbroken ×2", "Ripple 4") does. The fallbacks count the same thing
     from the stream for an engine that leaves the fields off. */
  var difficult = n === 4 || tw !== "none";
  L.chain = difficult ? L.chain + 1 : 0;
  var ub = typeof ev.unbrokenCount === "number" ? ev.unbrokenCount : L.chain - 1;
  if (ub >= 2) out = earn(data, L, "unbroken", out);

  L.rip = L.lastClearAt === L.locks - 1 ? L.rip + 1 : 0;
  L.lastClearAt = L.locks;
  var rp = typeof ev.ripple === "number" ? ev.ripple : L.rip;
  if (rp >= 4) out = earn(data, L, "ripples", out);

  /* silt rows: a cleared row with any silt left in it was a silt row (its
     one hole is the cell the player filled) */
  if (ev.rows && ev.cells && ev.cells.length) {
    for (var r = 0; r < ev.rows.length; r++) {
      for (var i = 0; i < ev.cells.length; i++) {
        if (ev.cells[i].y === ev.rows[r] && ev.cells[i].v === 8) { L.silt++; break; }
      }
    }
  }
  var silt = Math.max(L.silt, g && g.stats ? num(g.stats.siltCleared) : 0);
  if (silt >= 10) out = earn(data, L, "silt", out);
  return out;
}

function onBreath(data, ev, ctx) {
  if (ctx.modeId !== "descent" || paceOf(ctx.opts) !== "standard") return NONE;
  /* "more than half full": taller than 11 of the 22 visible rows */
  if (stackHeight(ctx.g) <= 11) return NONE;
  return earn(data, live(data, ctx.g), "deepBreath", NONE);
}

function onGlass(data, ev, ctx) {
  if (ev.on === false) return NONE;
  /* "during play": a run exists and has not ended */
  if (!ctx.modeId || (ctx.g && ctx.g.over)) return NONE;
  return earn(data, live(data, ctx.g), "glass", NONE);
}

/* ================================================================
   finishing a run
   ================================================================ */
var NOT_FINISHED = { leave: 1, quit: 1, abandon: 1, exit: 1 };

function siltIdOf(run) {
  var M = modesKit(), o = run.opts || {}, cands = [run.modeId, o.challenge, o.id, o.silt, o.kind === "silt" ? o.id : null];
  var ids = [];
  if (M && M.SILT && M.SILT.length) for (var i = 0; i < M.SILT.length; i++) ids.push(M.SILT[i].id);
  else ids = ["silt10", "silt18"];
  for (var c = 0; c < cands.length; c++) {
    for (var k = 0; k < ids.length; k++) if (cands[c] === ids[k]) return ids[k];
  }
  return null;
}
function lessonIdOf(run) {
  var o = run.opts || {}, cands = [run.lesson, o.lesson, o.lessonId, o.challenge, o.id, run.modeId];
  for (var c = 0; c < cands.length; c++) if (cands[c] && isLesson(cands[c])) return cands[c];
  return null;
}

/* What kind of run this was, its PB key, and which way is better. Modes
   decides the key and the direction when it can; the fallbacks keep a
   run countable if it cannot. */
function resolve(run) {
  var M = modesKit(), id = run.modeId, o = run.opts || {};
  var kind = (id === "descent" || id === "steady" || id === "drift" || id === "forty" || id === "three") ? id : null;
  if (!kind) kind = siltIdOf(run) ? "silt" : (lessonIdOf(run) ? "lesson" : "other");
  var mode = M && M.get ? M.get(id) : null;
  var key = null, better = null;
  if (mode && typeof mode.pbKey === "function") {
    try { key = mode.pbKey(o); } catch (e) { key = null; }
    better = mode.pbBetter || null;
  } else {
    if (kind === "descent" && paceOf(o)) key = "descent:" + paceOf(o);
    else if (kind === "forty") key = "forty:" + fortyLines(run);
    else if (kind === "three") key = "three";
    else if (kind === "silt") key = siltIdOf(run);
  }
  if (kind === "steady") key = null;               /* no score, no PB, no medals */
  if (!better) better = (kind === "forty" || kind === "silt") ? "low" : "high";
  return { kind: kind, mode: mode, key: key || null, better: better };
}

function fortyLines(run) {
  var o = run.opts || {};
  var n = o.lines || o.goalLines || o.fortyLines || (run.g && run.g.goalLines) || 0;
  return n || 40;
}

/* After Descent's "Begin again from this depth" the app may start a fresh
   game object and carry the earlier depths' score and lines beside it, so
   a run's totals are its bases plus what this game object holds. */
function runScore(run) { return num(run.scoreBase) + num(run.g && run.g.score); }
function runLines(run) { return num(run.linesBase) + num(run.g && run.g.lines); }

/* The engine says "goal"; Descent's own ending calls the same moment "the
   Surface". Either one means the run got where it was going. */
function reachedGoal(run) {
  return run.why === "goal" || run.why === "surface" || !!(run.g && run.g.over && run.g.overWhy === "goal");
}

function elapsed(run) {
  if (typeof run.elapsedMs === "number" && isFinite(run.elapsedMs)) return Math.max(0, run.elapsedMs);
  return run.g ? Math.max(0, num(run.g.time)) : 0;
}

function metric(run, info) {
  return info.better === "low" ? elapsed(run) : runScore(run);
}

/* A time only means something if the goal was reached; a score means
   something however the run ended, as long as it did end. */
function validMetric(run, info, value) {
  if (!(value > 0)) return false;
  if (NOT_FINISHED[run.why]) return false;
  if (info.better === "low") return reachedGoal(run);
  return true;
}

function clean(run) { return !(run.rests > 0) && !run.learner && !run.hint; }

function medalRank(modeId, name) {
  var M = modesKit(), list = M && M.MEDALS ? M.MEDALS[modeId] : null;
  if (!list || !name) return -1;
  for (var i = 0; i < list.length; i++) if (list[i][0] === name) return i;
  return -1;
}

Records.notes = function (run) {
  var out = [], g = run.g || {}, st = g.stats || {};
  if (run.rests > 0) out.push(run.rests === 1 ? "with 1 rest" : "with " + run.rests + " rests");
  if (run.learner) out.push("learner speed");
  if (run.hint) out.push("with a hint");
  var kind = resolve(run).kind, d = num(st.drains);
  if (kind !== "steady" && d > 0) out.push(d === 1 ? "The well drained once." : "The well drained " + d + " times.");
  return out;
};

Records.finishRun = function (data, run) {
  ensure(data);
  run = run || {};
  var g = run.g || {}, st = g.stats || {};
  var L = live(data, run.g);
  if (run.g && L.done) return L.done;   /* the same run twice is still one run */

  var info = resolve(run), ms = elapsed(run);
  function gain(id) { earn(data, L, id, NONE); }

  /* lifetime: every finished run counts, whatever its notes */
  var life = data.life;
  life.pieces += num(st.pieces);
  life.lines += num(g.lines);
  life.ms += ms;
  life.sessions += 1;
  if (info.kind === "steady") { life.steadySessions += 1; life.steadyMs += ms; }

  /* Stones for finishing ask only that you got there. The two that claim
     a performance — a time, a score — ask for a clean run as well. */
  var why = run.why, ok = clean(run), goal = reachedGoal(run);
  if (info.kind === "forty" && goal && fortyLines(run) === 40) {
    gain("forty");
    if (ok && ms < 120000) gain("fortyUnder2");
    if (ok && ms < 60000) gain("fortyUnder1");
  }
  if (info.kind === "three" && ok && runScore(run) >= 50000) gain("three");
  if (info.kind === "descent" && goal) {
    var p = paceOf(run.opts);
    if (p === "gentle") gain("surfaceGentle");
    else if (p === "standard") gain("surfaceStandard");
    else if (p === "swift") gain("surfaceSwift");
  }
  if (info.kind === "silt" && (goal || Math.max(L.silt, num(st.siltCleared)) >= 10)) gain("silt");
  if (why === "pass" || run.passed === true) passLesson(data, L, lessonIdOf(run), !!run.hint, NONE);
  if ((info.kind === "steady" && why === "timer") || (info.kind === "drift" && why === "rest")) gain("stopped");

  /* personal bests, medals and the last ten */
  var value = metric(run, info), valid = !!info.key && validMetric(run, info, value);
  var pb = false, prev = null, medal = null, medalNew = false, first = false;
  if (valid) {
    /* an entry of the wrong shape (a hand-edited save) is replaced as if
       this were the first run on the key, rather than failing every run */
    var h = data.hist[info.key];
    if (!Array.isArray(h)) h = data.hist[info.key] = [];
    h.push({ v: value, n: ok ? 0 : 1 });
    while (h.length > 10) h.shift();

    var best = data.best[info.key];
    if (best && !goodBest(best)) best = data.best[info.key] = null;
    prev = best ? best.value : null;
    if (ok) {
      /* Forty's medals are for forty lines only, and Modes.medalFor is not
         told the variant, so the check is made here */
      var M = modesKit(), medalMode = info.kind === "forty" || info.kind === "three" ? info.kind : run.modeId;
      if (M && M.medalFor && (info.kind !== "forty" || fortyLines(run) === 40) && info.kind !== "descent") {
        medal = M.medalFor(medalMode, value) || null;
      }
      if (!best) { best = data.best[info.key] = { value: value, medal: null }; first = true; }
      else if (info.better === "low" ? value < best.value : value > best.value) { pb = true; best.value = value; }
      if (medal && medalRank(medalMode, medal) > medalRank(medalMode, best.medal)) best.medal = medal;
      if (medal && medalRank(medalMode, medal) > medalRank(medalMode, data.medals[info.key])) {
        data.medals[info.key] = medal; medalNew = true;
      }
    }
  }
  /* Descent's medal is reaching the Surface at a pace: a finishing mark,
     shown as three small marks, so it asks only that you got there */
  if (info.kind === "descent" && goal && info.key) {
    medal = "Reached the Surface";
    if (typeof data.medals[info.key] !== "string") { data.medals[info.key] = medal; medalNew = true; }
  }

  var out = L.got.slice();

  var notes = Records.notes(run);
  if (pb) notes.unshift("New personal best");
  var res = {
    pb: pb, prev: prev, medal: medal, medalNew: medalNew, first: first,
    newStones: out, key: info.key, notes: notes,
    card: card(run, info, valid && prev !== null ? prev : null, value)
  };
  if (run.g) L.done = res;
  return res;
};

/* ================================================================
   the run card — at most eight numbers, each with a tip saying what it is
   ================================================================ */
function commas(n) {
  var s = String(Math.round(Math.abs(n))), out = "";
  while (s.length > 3) { out = "," + s.slice(-3) + out; s = s.slice(0, -3); }
  return (n < 0 ? "-" : "") + s + out;
}
function pad2(n) { return n < 10 ? "0" + n : String(n); }
/* 58.31 s, or 1:58.31 once a minute has gone by — to the hundredth */
function stopwatch(ms) {
  var cs = Math.round(ms / 10), s = Math.floor(cs / 100), h = cs % 100;
  if (s < 60) return s + "." + pad2(h) + " s";
  return Math.floor(s / 60) + ":" + pad2(s % 60) + "." + pad2(h);
}
/* 20:00, or 1:02:03 — whole seconds */
function clock(ms) {
  var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? h + ":" + pad2(m) + ":" + pad2(s % 60) : m + ":" + pad2(s % 60);
}
Records.fmt = { commas: commas, stopwatch: stopwatch, clock: clock };

var TIP = {
  score:   "Points from clears, Twists, Ripples and drops. Bigger clears are worth more, and deeper levels multiply them.",
  time:    "How long the run lasted.",
  silt:    "From the first piece to the last row of silt, to the hundredth of a second.",
  pieces:  "How many pieces you placed.",
  lines:   "How many rows you cleared.",
  pps:     "PPS, pieces per second: pieces \u00f7 seconds.",
  kpp:     "KPP, keys per piece: presses \u00f7 pieces. Fewer presses is smoother placing.",
  finesse: "Finesse: the share of pieces placed in the fewest possible presses. Only pieces placed without soft drop, tucks or spins are judged.",
  ripple:  "Your best Ripple: clearing lines with piece after piece. Ripple 1 is two clearing pieces in a row.",
  unbroken:"Your best Unbroken chain: Quads and Twists in a row with no plain clear between. \u00d71 is two in a row.",
  depth:   "How deep you went: ten depths of 25 lines each, then the Surface.",
  siltRows:"Rows of silt you cleared.",
  vsLow:   "Compared with your personal best before this run. \u2193 means quicker, \u2191 slower.",
  vsHigh:  "Compared with your personal best before this run. \u2191 means more, \u2193 fewer.",
  clears:  "How many of each kind of clear you made this run."
};

/* Forty's time tip names the run's own goal: a 20-line run isn't "the
   forty lines" */
function fortyTip(n) {
  var w = n === 20 ? "twenty" : n === 40 ? "forty" : n === 100 ? "hundred" : String(n);
  return "From the first piece to the last of the " + w + " lines, to the hundredth of a second.";
}

var STRIP = [
  ["singles", "Single", "Singles"], ["doubles", "Double", "Doubles"],
  ["triples", "Triple", "Triples"], ["quads", "Quad", "Quads"],
  ["twMini", "Mini Twist", "Mini Twists"], ["twSingle", "Twist Single", "Twist Singles"],
  ["twDouble", "Twist Double", "Twist Doubles"], ["twTriple", "Twist Triple", "Twist Triples"],
  ["empties", "Empty Well", "Empty Wells"]
];

function card(run, info, prev, value) {
  var g = run.g || {}, st = g.stats || {}, ms = elapsed(run), secs = ms / 1000;
  var pieces = num(st.pieces), lines = runLines(run), score = runScore(run);
  var items = [];
  function add(label, val, tip, n, kind) {
    var it = { label: label, value: val, tip: tip, n: n };
    if (kind) it.kind = kind;
    items.push(it);
  }
  function scoreItem() { add("Score", commas(score), TIP.score, score); }
  function piecesItem() { add("Pieces", commas(pieces), TIP.pieces, pieces); }
  function linesItem() { add("Lines", commas(lines), TIP.lines, lines); }
  function ppsItem() { if (secs > 0 && pieces) add("PPS", (pieces / secs).toFixed(2), TIP.pps, pieces / secs); }
  function kppItem() { if (pieces && typeof st.keys === "number") add("KPP", (st.keys / pieces).toFixed(2), TIP.kpp, st.keys / pieces); }
  function finesseItem() {
    var t = num(st.finesseTotal);
    if (t > 0) { var f = Math.round(100 * num(st.finessePerfect) / t); add("Finesse", f + "%", TIP.finesse, f); }
  }
  function rippleItem() { var r = num(st.maxRipple); if (r > 0) add("Best Ripple", String(r), TIP.ripple, r); }
  function unbrokenItem() { var u = num(st.maxUnbroken); if (u > 0) add("Best Unbroken", "\u00d7" + u, TIP.unbroken, u); }
  function vsItem() {
    if (prev === null || prev === undefined || !(value > 0)) return;
    var d = value - prev, low = info.better === "low";
    var mag = low ? stopwatch(Math.abs(d)) : commas(Math.abs(d));
    var v = d === 0 ? "level with it" : (d < 0 ? "\u2193 " : "\u2191 ") + mag;
    add("vs best", v, low ? TIP.vsLow : TIP.vsHigh, d, "delta");
  }
  function stripItem() {
    var parts = [], strip = [];
    for (var i = 0; i < STRIP.length; i++) {
      var k = num(st[STRIP[i][0]]);
      if (k > 0) { parts.push(k + " " + (k === 1 ? STRIP[i][1] : STRIP[i][2])); strip.push({ label: STRIP[i][1], plural: STRIP[i][2], n: k }); }
    }
    if (parts.length) { add("Clears", parts.join(" \u00b7 "), TIP.clears, strip.length, "strip"); items[items.length - 1].strip = strip; }
  }

  switch (info.kind) {
    case "steady":
      /* only these three: Steady keeps no score and makes no comparisons */
      add("Time", clock(ms), TIP.time, ms);
      piecesItem(); linesItem();
      break;
    case "forty":
      add("Time", stopwatch(ms), fortyTip(fortyLines(run)), ms);
      vsItem(); piecesItem(); ppsItem(); kppItem(); finesseItem(); stripItem();
      break;
    case "three":
      scoreItem(); vsItem(); linesItem(); piecesItem(); ppsItem(); rippleItem(); unbrokenItem(); stripItem();
      break;
    case "descent":
      scoreItem();
      var depth = null, M = modesKit(), mode = M && M.get ? M.get("descent") : null;
      if (reachedGoal(run)) depth = "The Surface";
      else {
        var d = null;
        try { d = mode && mode.depthOf ? mode.depthOf(run.g) : null; } catch (e) { d = null; }
        if (!d) d = Math.min(10, Math.floor(lines / 25) + 1);
        depth = d + " of 10";
      }
      add("Depth", depth, TIP.depth, reachedGoal(run) ? 10 : parseInt(depth, 10));
      vsItem(); linesItem(); piecesItem(); rippleItem(); unbrokenItem(); stripItem();
      break;
    case "drift":
      if (!(run.opts && (run.opts.scoreHidden || run.opts.hideScore)) && !run.scoreHidden) scoreItem();
      linesItem(); piecesItem(); ppsItem(); kppItem(); rippleItem(); unbrokenItem(); stripItem();
      break;
    case "silt":
      add("Time", stopwatch(ms), TIP.silt, ms);
      vsItem();
      var sr = num(st.siltCleared);
      if (sr) add("Silt rows", String(sr), TIP.siltRows, sr);
      piecesItem(); ppsItem(); kppItem(); finesseItem(); stripItem();
      break;
    case "lesson":
      piecesItem(); linesItem(); kppItem(); finesseItem();
      add("Time", clock(ms), TIP.time, ms);
      break;
    default:
      scoreItem(); linesItem(); piecesItem(); ppsItem(); kppItem(); finesseItem(); stripItem();
  }
  if (items.length > 8) items.length = 8;
  return items;
}

/* card(run) on its own, for a card shown before or without finishRun:
   the same numbers, without the comparison to a best */
Records.card = function (run) {
  run = run || {};
  return card(run, resolve(run), null, 0);
};

/* ---------- reading the records ---------- */
Records.lifetime = function (data) {
  var l = ensure(data || Records.blank()).life;
  return { pieces: l.pieces, lines: l.lines, ms: l.ms, sessions: l.sessions,
           steadySessions: l.steadySessions, steadyMs: l.steadyMs };
};
Records.has = function (data, id) { return !!(data && data.stones && data.stones[id]); };
Records.best = function (data, key) {
  var b = data && data.best ? data.best[key] : null;
  return goodBest(b) ? { value: b.value, medal: typeof b.medal === "string" ? b.medal : null } : null;
};
/* the last ten finished runs on a key, oldest first, for the sparkline;
   `noted` marks a run with a rest, learner speed or a hint */
Records.history = function (data, key) {
  var h = data && data.hist ? data.hist[key] : null, out = [];
  if (Array.isArray(h)) {
    for (var i = 0; i < h.length; i++) if (h[i] && num(h[i].v) === h[i].v) out.push({ value: h[i].v, noted: !!h[i].n });
  }
  return out;
};
Records.medal = function (data, key) {
  var m = data && data.medals ? data.medals[key] : null;
  return typeof m === "string" ? m : null;
};
/* for the two Stones that are found a piece at a time */
Records.progress = function (data, id) {
  ensure(data);
  var have = 0, i, list;
  if (id === "worlds") {
    list = worldIds();
    for (i = 0; i < list.length; i++) if (data.worlds[list[i]]) have++;
    return { have: have, need: list.length };
  }
  if (id === "lessons") {
    list = firstFour();
    for (i = 0; i < list.length; i++) if (data.lessons[list[i]]) have++;
    return { have: have, need: list.length };
  }
  return null;
};

if (typeof module !== "undefined" && module.exports) module.exports = Records;
else root.Records = Records;
})(typeof self !== "undefined" ? self : this);
