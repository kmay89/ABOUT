/* haptics.js — what the game feels like in the hand.

   A good phone game is felt as much as it is seen. Not buzzed at — felt:
   the little detent as a picker wheel clicks past a number, the solid
   knock of something landing, a heavier thump when something big is
   hit. The difference between that and a cheap rumble is almost all in
   restraint. A buzz on every touch is noise, and noise is the first
   thing a person switches off; a crisp, short tick at exactly the
   moment the eye sees a thing happen is the one that makes a screen
   feel like an object.

   So this file is a small vocabulary of named moments, each written
   down as data — a vibration pattern, alternating on and off, in
   milliseconds — and three rules for playing them.

   Short is crisp, long is heavy. A phone's motor cannot be asked how
   hard to push, only for how long; six to twelve milliseconds reads as
   a click, twenty or thirty as weight, anything longer as a rumble.
   Picking a piece up is one light tick; carrying it onto a square it
   can go to is the lightest tick there is, the picker's detent; setting
   it down is a knock weighted by what it is, a pawn lighter than a
   queen. A capture is a real hit, harder the more was taken, and a
   queen or a rook taken leaves a short after-rumble, decaying, the way
   a heavy thing settles. Your own moves are felt in full; the other
   side's are felt softly, because the point is to put you in the game
   rather than to startle you every time the coach replies.

   Never smeared. Two ticks closer than about a thirtieth of a second
   run together into a buzz, so nothing here ever plays them that close.
   The two that come in floods — a carried piece crossing squares, a
   number counting up — are simply dropped when they arrive too densely,
   never queued, because a queue of stale ticks is worse than a missing
   one. Anything else that arrives too soon waits the few milliseconds
   it needs. And a game that ends, or a move taken back, takes every
   buzz still waiting with it.

   Seasoning, never the only signal. Every moment here is also seen and
   (if you want) heard. Haptics are off with their own switch, quiet in
   a hidden tab, and simply absent on a device with nothing to buzz.

   Two ways to buzz. Android's browsers have navigator.vibrate, which
   takes a pattern and plays it. iPhones have never had that — but since
   Safari 17.4 a checkbox with the `switch` attribute is drawn as a
   system switch, and toggling one gives the same small tick the
   system's own switches do. Clicking a hidden label does the toggling.
   That cannot be made stronger, so on an iPhone a pattern is played as
   ticks at its beats, and a heavier moment simply gets an extra tick or
   two. It is a trick rather than an API, and Apple may change it; if it
   stops working the game loses a little seasoning and nothing else.

   No DOM is needed to load this, and the backend and the clock can both
   be swapped for fakes: chess/tools/haptics-check.js plays every pattern
   in node.                                                             */
/* global module */
(function (root) {
"use strict";

var HAS_DOM = typeof document !== "undefined" && typeof document.createElement === "function";

/* the closest two ticks may ever be, and the longest any moment may go on */
var GAP = 35;
var MAX_MS = 1200;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/* ---------- the vocabulary ----------
   `p` is the pattern: on, off, on, … in milliseconds, always starting
   and ending on a pulse. `drop` marks the kinds that come in floods and
   are dropped rather than queued when they crowd; `every` is the least
   time between two of the same kind. */
var KINDS = {
  /* picking a man up: one crisp light tick */
  select:      { p: [10] },
  /* the carried man crossing onto a square it can go to: the detent */
  hover:       { p: [5], drop: true, every: GAP },
  /* a move landing — weighted by the piece, below */
  land:        { p: [9] },
  /* a capture — weighted by what was taken, below */
  capture:     { p: [18] },
  /* the rook, then the king, at the gap the board really leaves */
  castle:      { p: [8, 90, 12] },
  /* two sharp beats */
  check:       { p: [14, 70, 14] },
  /* a rising triplet: the pawn becoming something heavier */
  promote:     { p: [7, 55, 10, 55, 16] },
  /* a crescendo, each beat a little heavier and a little sooner */
  mateWin:     { p: [8, 80, 11, 70, 15, 60, 20, 50, 28, 90, 60] },
  /* one low, long one: nothing to celebrate, but it happened */
  mateLoss:    { p: [90] },
  /* two even, soft beats: honours shared */
  draw:        { p: [10, 140, 10] },
  /* a piece let go where it cannot go: two quick soft buzzes, a head shake */
  nope:        { p: [14, 45, 14] },
  /* the last seconds on the clock: lub-dub */
  heartbeat:   { p: [22, 110, 12] },
  /* a press on a button */
  tick:        { p: [7] },
  /* a number counting up, one tick per step it is allowed */
  count:       { p: [5], drop: true, every: 45 },
  /* a star landing on the end card: a small pop */
  star:        { p: [6, 40, 14] },
  /* the rating going up, a level gained */
  success:     { p: [8, 60, 10, 60, 24] },
  /* a lesson got right: up, like a nod */
  lessonRight: { p: [8, 70, 16] },
  /* a lesson got wrong: down, gently */
  lessonWrong: { p: [18, 80, 10] },
  /* each rank of men landing at the start of a game: barely there */
  arrive:      { p: [5] }
};

/* how heavy each man is to set down, pawn to king. A king is about three
   times a pawn's weight in a real set, but the motor's range is narrow,
   so the scale is too. */
var LAND_MS = [9, 7, 9, 9, 11, 13, 13];

/* ---------- the shaping ----------
   Most moments are exactly what the table says. Three take the moment's
   own details: what landed, how much was taken, how far apart the rook
   and the king really arrive. */
function shape(kind, base, o) {
  if (kind === "land") {
    var k = Math.abs(o.piece | 0);
    return [LAND_MS[k] || LAND_MS[0]];
  }
  if (kind === "capture") {
    var pw = typeof o.power === "number" && isFinite(o.power) ? clamp(o.power, 0, 1) : 0.5;
    var hit = Math.round(14 + 16 * pw);
    /* a big piece leaves the table shaking a moment — unless it was the
       other side's doing, which is felt but not dwelt on */
    if (pw >= 0.7 && !o.soft) return [hit, 45, Math.round(9 + 6 * pw), 55, Math.round(5 + 3 * pw)];
    return [hit];
  }
  if (kind === "castle") {
    var g = typeof o.gap === "number" && isFinite(o.gap) ? Math.round(clamp(o.gap, GAP, 260)) : base[1];
    return [base[0], g, base[2]];
  }
  return base.slice();
}

/* The pattern for a moment, or null for a moment that does not exist.
   Soft is the same shape with shorter pulses: lighter, never longer. */
function pattern(kind, opts) {
  var spec = Object.prototype.hasOwnProperty.call(KINDS, kind) ? KINDS[kind] : null;
  if (!spec) return null;
  var o = opts || {};
  var pat = shape(kind, spec.p, o);
  if (o.soft) for (var i = 0; i < pat.length; i += 2) pat[i] = Math.max(4, Math.round(pat[i] * 0.65));
  return pat;
}
function total(pat) {
  var s = 0;
  for (var i = 0; i < pat.length; i++) s += pat[i];
  return s;
}

/* The beats of a pattern, for the backend that can only tick: one at the
   start of every pulse, and an extra one or two inside a long pulse,
   because on an iPhone more ticks is the only way to say heavier. Never
   two closer than the gap. */
function beats(pat) {
  var out = [], t = 0;
  for (var i = 0; i < pat.length; i += 2) {
    var on = pat[i], extra = on >= 50 ? 2 : on >= 24 ? 1 : 0;
    out.push(t);
    for (var k = 1; k <= extra; k++) out.push(t + GAP * k);
    t += on + (pat[i + 1] || 0);
  }
  var kept = [];
  for (var j = 0; j < out.length; j++) {
    if (!kept.length || out[j] - kept[kept.length - 1] >= GAP) kept.push(out[j]);
  }
  return kept;
}

/* ---------- the clock ----------
   Real timers in the page; a fake one in the check, so a second of
   haptics can be played in no time at all. */
var clock = {
  now: function () {
    return root.performance && typeof root.performance.now === "function" ? root.performance.now() : Date.now();
  },
  setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
  clearTimeout: function (id) { clearTimeout(id); }
};

/* ---------- the backends ---------- */
function touchy() {
  var nav = root.navigator;
  if (nav && nav.maxTouchPoints > 0) return true;
  try { return !!(root.matchMedia && root.matchMedia("(pointer: coarse)").matches); } catch (e) { return false; }
}
/* Android and friends. A desktop browser often has vibrate() too, with no
   motor behind it, so it only counts on something you touch. Chrome also
   ignores it until the page has had its first tap — which is fine, since
   every moment here follows one. */
function vibrateBackend() {
  return {
    name: "vibrate",
    play: function (pat) { try { root.navigator.vibrate(pat); } catch (e) {} },
    stop: function () { try { root.navigator.vibrate(0); } catch (e) {} }
  };
}
/* iPhone: one hidden system switch, made the first time it is needed and
   kept. It is never seen, never reachable by Tab or by a screen reader,
   never under a finger, and takes no room, so it cannot move the page.
   Its clicks are stopped where they start, so nothing else on the page
   ever hears them. */
var switchLabel = null;
function switchBackend() {
  return {
    name: "switch",
    tick: function () {
      if (!switchLabel) {
        var label = document.createElement("label"), input = document.createElement("input");
        input.type = "checkbox";
        input.setAttribute("switch", "");
        input.tabIndex = -1;
        input.setAttribute("aria-hidden", "true");
        label.setAttribute("aria-hidden", "true");
        label.style.cssText = "position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;" +
          "opacity:0;pointer-events:none;contain:strict";
        label.appendChild(input);
        label.addEventListener("click", function (e) { e.stopPropagation(); });
        (document.body || document.documentElement).appendChild(label);
        switchLabel = label;
      }
      /* clicking a label hands focus to its control in some browsers;
         whatever had focus (a name being typed, a button reached by Tab)
         gets it straight back, without a scroll */
      var had = document.activeElement, sw = switchLabel.firstChild;
      try { switchLabel.click(); } catch (e) {}
      if (document.activeElement === sw) {
        try { sw.blur(); } catch (e) {}
        if (had && had !== document.body && had !== sw && typeof had.focus === "function") {
          try { had.focus({ preventScroll: true }); } catch (e) {}
        }
      }
    }
  };
}
/* Conservative on purpose: a switch that exists on a Mac (no motor) or a
   vibrate() on a laptop (no motor either) is not a haptic device. */
function detect() {
  var nav = root.navigator;
  if (!nav || !touchy()) return null;
  if (typeof nav.vibrate === "function") return vibrateBackend();
  if (HAS_DOM && root.HTMLInputElement && "switch" in root.HTMLInputElement.prototype) return switchBackend();
  return null;
}
var backend;          /* undefined: not looked for yet; null: nothing to buzz */
function be() {
  if (backend === undefined) backend = detect();
  return backend;
}

/* ---------- playing ---------- */
var on = true;
var lastAt = -1e9;        /* when the last pattern began */
var busyUntil = -1e9;     /* when it ends */
var lastKind = {};        /* when each kind last played */
var beatTimers = [];      /* the ticks of the pattern playing now, on the ticking backend */
var timers = {};          /* everything scheduled with at(), and anything waiting its turn */
var seq = 0;

function hidden() {
  var d = typeof document !== "undefined" ? document : root.document;
  return !!(d && d.hidden);
}
function clearBeats() {
  for (var i = 0; i < beatTimers.length; i++) clock.clearTimeout(beatTimers[i]);
  beatTimers = [];
}
function fire(kind, pat) {
  var b = be();
  if (!b || !on || hidden()) return;
  var t = clock.now();
  lastAt = t; busyUntil = t + total(pat); lastKind[kind] = t;
  /* the newer moment wins, the way vibrate() itself behaves: what is left
     of an older pattern is not played over the top of it */
  clearBeats();
  if (typeof b.play === "function") { b.play(pat); return; }
  var bs = beats(pat);
  b.tick();
  for (var i = 1; i < bs.length; i++) beatTimers.push(clock.setTimeout(b.tick, bs[i]));
}
function later(fn, ms) {
  var id = ++seq;
  timers[id] = clock.setTimeout(function () { delete timers[id]; fn(); }, ms);
  return id;
}

function play(kind, opts) {
  if (!on || hidden() || !be()) return false;
  var spec = Object.prototype.hasOwnProperty.call(KINDS, kind) ? KINDS[kind] : null;
  var pat = spec && pattern(kind, opts);
  if (!pat) return false;
  var t = clock.now();
  if (spec.every && lastKind[kind] != null && t - lastKind[kind] < spec.every) return false;
  if (spec.drop) {
    /* a flood never crowds, and never cuts into, anything still playing */
    if (t < busyUntil + GAP) return false;
    fire(kind, pat);
    return true;
  }
  var wait = lastAt + GAP - t;
  if (wait > 0) {
    /* its slot is kept for it, so a third moment waits behind this one
       rather than landing on top of it */
    lastAt = t + wait;
    later(function () { fire(kind, pat); }, wait);
    return true;
  }
  fire(kind, pat);
  return true;
}

/* A moment in time with something on screen: `delay` is when the eye
   will see it. The token cancels this one; cancel() with nothing
   cancels everything. */
function at(kind, delay, opts) {
  if (!on || !be() || !Object.prototype.hasOwnProperty.call(KINDS, kind)) return 0;
  if (!(delay > 0)) { play(kind, opts); return 0; }
  return later(function () { play(kind, opts); }, delay);
}
function cancel(token) {
  if (token) {
    if (timers[token] != null) { clock.clearTimeout(timers[token]); delete timers[token]; }
    return;
  }
  for (var id in timers) clock.clearTimeout(timers[id]);
  timers = {};
  clearBeats();
  if (clock.now() < busyUntil && backend && typeof backend.stop === "function") backend.stop();
  busyUntil = -1e9;
}

if (HAS_DOM && typeof document.addEventListener === "function") {
  /* a hidden tab is not holding anyone's attention; nothing waits for it */
  document.addEventListener("visibilitychange", function () { if (document.hidden) cancel(); });
}

var Haptics = {
  GAP: GAP, MAX_MS: MAX_MS,
  KINDS: Object.keys(KINDS),
  play: play, at: at, cancel: cancel,
  setEnabled: function (v) { on = !!v; if (!on) cancel(); },
  enabled: function () { return on; },
  /* "vibrate", "switch", or "none" */
  supported: function () { var b = be(); return b ? b.name : "none"; },
  pattern: pattern, beats: beats, total: total,
  /* for chess/tools/haptics-check.js: a fake motor, a fake clock, a clean slate */
  _setBackend: function (b) { backend = b; },
  _setClock: function (c) { clock = c; },
  _reset: function () {
    cancel(); on = true; lastAt = -1e9; busyUntil = -1e9; lastKind = {}; seq = 0;
  }
};
if (typeof module !== "undefined" && module.exports) module.exports = Haptics;
else root.Haptics = Haptics;
})(typeof self !== "undefined" ? self : this);
