/* prefs.js — the player's settings, and the only door to localStorage.

   Everything well remembers lives under one localStorage key, "well",
   as one small JSON object:

     { v: 1, prefs: {...}, records: {...}, save: {...} }

   prefs is this file's, records belongs to records.js and save is the
   resumable run the app writes on pause. They share a key on purpose: one
   thing to clear, one thing to back up, and no way for the settings to
   survive while the records they describe have gone. Everything else
   reads and writes its section through Prefs.store, and nothing else in
   the room is allowed to touch localStorage at all.

   ## Only what the player changed is written

   The prefs section is sparse. A setting nobody has touched is never
   stored; it is read from DEFAULTS every time. That buys two things. A
   better default reaches everybody who never chose otherwise, instead of
   being frozen into their storage on the first visit. And "has the player
   chosen this?" has a real answer, which the contrast rule below needs: a
   device that asks for more contrast gets the Ink skin, unless the player
   has picked a skin themselves, in which case their pick wins.

   ## Storage is allowed to say no

   A private window, storage switched off, a sandboxed frame, a full quota:
   on some browsers merely *reading* window.localStorage throws. So every
   touch is wrapped, and when storage refuses, the room carries on with an
   in-memory copy and says nothing. The game plays exactly the same; it
   just forgets when the tab closes. Prefs.store.status() reports which
   of those it is, for the one quiet note in Comfort that says so.

   ## A bad value costs one setting, not all of them

   Stored JSON can be truncated, hand-edited, or written by a newer version
   of the room. Unparseable JSON starts fresh. Parseable JSON is checked
   key by key against the kind and range of each setting, and a value
   that does not pass falls back to its default on its own, so one bad
   number does not reset someone's whole carefully tuned handling. Keys
   this version does not know are kept, untouched, so stepping back a
   version (an old service-worker cache, say) never deletes what a newer
   one wrote.

   ## Infinity

   JSON has no Infinity, and the soft-drop factor's top setting is one
   (∞, "sonic": the piece slides straight to the floor without locking).
   JSON.stringify would quietly turn it into null. So the whole stored
   object is written with ±Infinity as the strings "inf" and "-inf", and
   read back the other way. That covers a saved run as well as the
   setting.

   ## Writing is gathered up

   A slider being dragged sets its value dozens of times a second, and
   each write re-serialises the records and the saved run too. So settings
   are written a quarter of a second after the last change, and at once
   whenever the page is hidden or closed. Prefs.store.put writes
   immediately, because the app calls it on pause, which may be the last
   thing the page ever does.

   ## The system's wishes

   prefers-reduced-motion turns motion "system" into "gentle" (Prefs.motion
   resolves it), and prefers-contrast: more selects Ink unless a skin was
   chosen. Both are watched: change them in the device settings with the
   page open and the change arrives through Prefs.on like any other.

   This file loads in node without touching the DOM, so the checks in
   tools/ can read DEFAULTS and exercise the store against a fake
   localStorage handed in on "self".                                      */
(function (root) {
"use strict";

var KEY = "well";
var VERSION = 1;

/* A Mac's own Control-arrow shortcuts (Spaces, Mission Control) are taken
   by the system before the page ever sees them, so Control as a turn key
   there turns a quick turn-then-move into a desktop switch and a paused
   run. On a Mac the counter-clockwise default is Z alone; an iPad, which
   also says "Mac", has touch points and keeps both. */
var MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.platform || "") &&
          (navigator.maxTouchPoints || 0) < 2;

/* ---------- the defaults (SPEC §6: exactly these, but Z alone on a Mac) ---------- */
var DEFAULTS = {
  skin: "seaglass", palette: "skin", glyphs: "off", graphics: "auto", motion: "system",
  juice: "medium", nudge: 1, labels: true, grid: "faint", landing: true, lockLight: true,
  previews: 5, keep: true, modern: false, irs: false, ihs: false,
  das: 167, arr: 33, sdf: 20, dcd: 0, hdTouch: 133, hdKeys: 0,
  scheme: "gestures", tap: "sides", sensitivity: 1, lefty: false, btnSize: 64, btnOpacity: 1,
  haptics: true,
  keys: {
    left: ["ArrowLeft"], right: ["ArrowRight"], soft: ["ArrowDown"], hard: ["Space"],
    cw: ["ArrowUp", "KeyX"], ccw: MAC ? ["KeyZ"] : ["KeyZ", "ControlLeft", "ControlRight"], flip: ["KeyA"],
    hold: ["KeyC", "ShiftLeft", "ShiftRight"], breath: ["KeyB"], glass: ["KeyG"],
    pause: ["Escape", "KeyP"]
  },
  master: 0.8, music: 0.7, sfx: 0.8, ambience: 0.6, soften: false, quiet: false,
  playOnSilent: false, muteOnBlur: true, audioQuality: "auto",
  boardSize: 1, textSize: 1, reminder: 30, learner: 1, pbPace: true, scoreHidden: false,
  descentPace: "gentle", driftTide: 2, driftChapter: 40, driftWorld: "dawn", fortyLines: 40,
  steadyLength: 20, steadyPace: "slow", steadyLanding: true, steadySound: "soft",
  steadyWorld: "snowfall",
  seen: { intro: false, touchCards: false, steadyTip: false, silentChip: false,
          landscape: false, homeScreen: false, breath: false }
};

/* The defaults are frozen all the way down. A caller that pushes onto
   Prefs.DEFAULTS.keys.left would otherwise change the default for the rest
   of the session without anything being saved, which is the kind of bug
   that only shows up on the second run. Under "use strict" (every file in
   this room) the attempt throws instead, where it can be seen. */
function freeze(o) {
  if (o && typeof o === "object") {
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) freeze(o[k]);
    Object.freeze(o);
  }
  return o;
}

var WORLD_IDS = ["dawn", "tide", "rain", "bamboo", "aurora", "moonpool", "lanterns",
                 "snowfall", "bells", "starfield"];

/* ---------- what a valid value looks like ----------
   Each checker takes a candidate and returns the value to keep, or
   undefined to fall back to the default. Numbers are clamped rather than
   refused: a DAS of 400 from an old build means "slow", and 333 is the
   nearest honest reading of that. The settings this file's sheets own get
   their exact sets of values; the ones other parts of the room own (the
   Descent pace, the Steady card) are checked for kind only, so this file
   can never quietly undo a value a sibling is entitled to choose. */
function oneOf(list) {
  return function (v) { return list.indexOf(v) >= 0 ? v : undefined; };
}
function num(lo, hi, whole) {
  return function (v) {
    if (typeof v !== "number" || v !== v) return undefined;
    if (whole && isFinite(v)) v = Math.round(v);
    return v < lo ? lo : v > hi ? hi : v;
  };
}
function bool(v) { return typeof v === "boolean" ? v : undefined; }
function str(v) { return typeof v === "string" && v.length ? v : undefined; }
function anyNum(v) { return typeof v === "number" && isFinite(v) ? v : undefined; }

function soft(v) {                       /* 5..40, or Infinity for "sonic" */
  if (v === Infinity || v === "inf") return Infinity;
  return num(5, 40, true)(v);
}

/* the key map: every action keeps a list of KeyboardEvent.code strings */
var MAX_KEYS = 4;
function keymap(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  var out = {}, taken = {}, a, i;
  for (a in DEFAULTS.keys) {
    var src = v[a], list = [];
    if (Array.isArray(src)) {
      for (i = 0; i < src.length && list.length < MAX_KEYS; i++) {
        var c = src[i];
        /* a code bound to two actions would fire both; the first action
           in the list keeps it, which is the order the sheet shows */
        if (typeof c === "string" && c.length && c.length < 40 && !taken[c]) {
          list.push(c); taken[c] = 1;
        }
      }
    } else {
      list = DEFAULTS.keys[a].slice();
      for (i = 0; i < list.length; i++) {
        if (taken[list[i]]) { list.splice(i, 1); i--; } else taken[list[i]] = 1;
      }
    }
    out[a] = list;
  }
  return out;
}
/* one-time flags: the defaults, then any boolean flag a sibling has added */
function flags(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  var out = {}, k;
  for (k in DEFAULTS.seen) out[k] = DEFAULTS.seen[k];
  for (k in v) if (typeof v[k] === "boolean") out[k] = v[k];
  return out;
}

var CHECK = {
  skin: oneOf(["seaglass", "riverstone", "jelly", "lantern", "ink", "moonlight"]),
  palette: oneOf(["skin", "safe"]),
  glyphs: oneOf(["off", "subtle", "strong"]),
  graphics: oneOf(["auto", "full", "balanced", "simple", "2d"]),
  motion: oneOf(["system", "full", "gentle", "still"]),
  juice: oneOf(["calm", "medium", "vivid"]),
  nudge: num(0, 1),
  labels: bool,
  grid: oneOf(["off", "faint", "full"]),
  landing: bool, lockLight: bool,
  previews: num(0, 6, true),
  keep: bool, modern: bool, irs: bool, ihs: bool,
  das: num(17, 333, true), arr: num(0, 83, true), sdf: soft, dcd: num(0, 83, true),
  hdTouch: num(0, 333, true), hdKeys: num(0, 333, true),
  scheme: oneOf(["gestures", "buttons"]),
  tap: oneOf(["sides", "anywhere"]),
  sensitivity: num(0.6, 1.6),
  lefty: bool,
  btnSize: num(44, 96, true), btnOpacity: num(0.2, 1),
  haptics: bool,
  keys: keymap,
  master: num(0, 1), music: num(0, 1), sfx: num(0, 1), ambience: num(0, 1),
  soften: bool, quiet: bool, playOnSilent: bool, muteOnBlur: bool,
  audioQuality: oneOf(["auto", "full", "lite", "minimal"]),
  boardSize: num(0.9, 1.3), textSize: num(1, 1.5),
  reminder: oneOf([0, 15, 30, 45, 60]),            /* minutes; 0 = off */
  learner: oneOf([0.5, 0.75, 1]),
  pbPace: bool, scoreHidden: bool,
  descentPace: str, driftTide: num(0, 8, true), driftChapter: anyNum,
  driftWorld: oneOf(WORLD_IDS), fortyLines: anyNum,
  steadyLength: anyNum, steadyPace: str, steadyLanding: bool, steadySound: str,
  steadyWorld: oneOf(WORLD_IDS),
  seen: flags
};

/* ---------- small helpers ---------- */
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function isObj(o) { return !!o && typeof o === "object" && !Array.isArray(o); }
/* a deep copy of plain data that, unlike a JSON round trip, keeps Infinity */
function copy(v) {
  if (Array.isArray(v)) {
    var a = new Array(v.length);
    for (var i = 0; i < v.length; i++) a[i] = copy(v[i]);
    return a;
  }
  if (v && typeof v === "object") {
    var o = {};
    for (var k in v) if (has(v, k)) o[k] = copy(v[k]);
    return o;
  }
  return v;
}
function same(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  return encode(a) === encode(b);
}
function later(e) { setTimeout(function () { throw e; }, 0); }

/* ======================================================================
   the store: one key, three sections, never trusted, never fatal
   ====================================================================== */
function encode(o) {
  return JSON.stringify(o, function (k, v) {
    return v === Infinity ? "inf" : v === -Infinity ? "-inf" : v;
  });
}
function decode(s) {
  return JSON.parse(s, function (k, v) {
    return v === "inf" ? Infinity : v === "-inf" ? -Infinity : v;
  });
}

var mem = null;          /* the whole stored object, as this tab knows it */
var status = "ok";       /* "ok" | "off" (no storage) | "full" (quota)    */

function storage() {
  try { return root.localStorage || null; } catch (e) { return null; }
}
function blank() { return { v: VERSION, prefs: {}, records: null, save: null }; }

/* Version steps, oldest first: MIGRATE[n] turns a version-n object into
   version n+1. There is only version 1 so far; the table exists so the
   second version has an obvious place to go. */
var MIGRATE = {};

function shape(o) {
  if (!isObj(o)) return blank();
  var v = typeof o.v === "number" && o.v >= 1 ? Math.floor(o.v) : 1;
  while (v < VERSION && MIGRATE[v]) { o = MIGRATE[v](o); v++; }
  /* A newer version's object is read as well as we can and its number
     kept, so writing it back never claims to be older than it is. */
  o.v = v < VERSION ? VERSION : v;
  if (!isObj(o.prefs)) o.prefs = {};
  if (!isObj(o.records)) o.records = null;
  if (!isObj(o.save)) o.save = null;
  return o;
}

/* read storage afresh: an object, or null when storage is unreachable */
function readRoot() {
  var s = storage(), raw;
  if (!s) { status = "off"; return null; }
  try { raw = s.getItem(KEY); } catch (e) { status = "off"; return null; }
  if (raw === null || raw === undefined) return blank();
  try { return shape(decode(raw)); } catch (e) { return blank(); }
}
function ensureMem() { if (!mem) mem = readRoot() || blank(); }

function write() {
  var s = storage();
  if (!s) { status = "off"; return false; }
  try {
    s.setItem(KEY, encode(mem));
    status = "ok";
    return true;
  } catch (e) {
    /* QuotaExceededError, or old Safari's private mode, which offered a
       localStorage that refused every write. Either way the copy in
       memory is still right; it just won't outlive the tab. */
    var name = e && (e.name || "");
    status = (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" ||
              (e && (e.code === 22 || e.code === 1014))) ? "full" : "off";
    return false;
  }
}

var store = {
  /* section: "prefs" | "records" | "save". Returns a copy, or null. */
  get: function (section) {
    ensureMem();
    var x = mem[section];
    return x === undefined || x === null ? null : copy(x);
  },
  /* writes immediately; true when it reached storage, false when it is
     being kept in memory only (and will be, for the rest of the visit) */
  put: function (section, value) {
    if (section === "prefs") {
      ensure();
      dirty = false;
      if (timer) { clearTimeout(timer); timer = 0; }
    }
    ensureMem();
    mem[section] = value === undefined || value === null ? null : copy(value);
    if (section === "prefs") {
      /* someone wrote the prefs section wholesale: take it as the new truth */
      if (!mem.prefs) mem.prefs = {};
      readPrefs(mem.prefs, true);
    }
    return write();
  },
  status: function () { ensureMem(); return status; },
  KEY: KEY,
  VERSION: VERSION
};

/* ======================================================================
   the settings
   ====================================================================== */
var chosen = {};         /* validated values the player set, by key       */
var loaded = false;
var dirty = false, timer = 0;
var listeners = [];
var sys = { reducedMotion: false, moreContrast: false };
var installed = false;

/* fill "chosen" from a stored prefs object */
function readPrefs(src, announce) {
  var before = announce ? snapshot() : null;
  var next = {};
  if (isObj(src)) {
    for (var k in src) {
      if (!has(src, k)) continue;
      if (has(CHECK, k)) {
        var v = CHECK[k](src[k]);
        if (v !== undefined) next[k] = v;
      } else {
        next[k] = copy(src[k]);          /* a key from a newer build: keep it */
      }
    }
  }
  chosen = next;
  if (announce) announceChanges(before);
}

function snapshot() {
  var o = {}, k;
  for (k in DEFAULTS) o[k] = value(k);
  for (k in chosen) if (!has(o, k)) o[k] = value(k);
  o["@motion"] = Prefs.motion();
  return o;
}
function announceChanges(before) {
  var after = snapshot(), k;
  for (k in after) {
    if (k.charAt(0) === "@") continue;
    if (!same(before[k], after[k])) emit(k, after[k]);
  }
  for (k in before) if (k.charAt(0) !== "@" && !has(after, k)) emit(k, undefined);
  if (before["@motion"] !== after["@motion"] && same(before.motion, after.motion)) {
    emit("motion", after.motion);
  }
}

/* the value a key has right now, before copying */
function value(k) {
  if (k === "skin" && sys.moreContrast && !has(chosen, "skin")) return "ink";
  if (has(chosen, k)) return chosen[k];
  return has(DEFAULTS, k) ? DEFAULTS[k] : undefined;
}

function emit(k, v) {
  var list = listeners.slice();
  for (var i = 0; i < list.length; i++) {
    /* one broken listener must not stop the others hearing about it;
       the error is rethrown on its own so it still reaches the console */
    try { list[i](k, copy(v)); } catch (e) { later(e); }
  }
}

function saveSoon() {
  dirty = true;
  if (!timer) timer = setTimeout(flush, 250);
}
function flush() {
  if (timer) { clearTimeout(timer); timer = 0; }
  if (!dirty) return status === "ok";
  dirty = false;
  ensureMem();
  mem.prefs = copy(chosen);
  return write();
}

function watch(mq, fn) {
  if (!mq) return;
  if (mq.addEventListener) mq.addEventListener("change", fn);
  else if (mq.addListener) mq.addListener(fn);
}

/* everything that needs a browser, done once, on first use */
function install() {
  if (installed) return;
  installed = true;
  if (typeof root.matchMedia === "function") {
    var rm = null, mc = null;
    try { rm = root.matchMedia("(prefers-reduced-motion: reduce)"); } catch (e) {}
    try { mc = root.matchMedia("(prefers-contrast: more)"); } catch (e) {}
    sys.reducedMotion = !!(rm && rm.matches);
    sys.moreContrast = !!(mc && mc.matches);
    watch(rm, function () {
      var before = snapshot();
      sys.reducedMotion = !!rm.matches;
      announceChanges(before);
    });
    watch(mc, function () {
      var before = snapshot();
      sys.moreContrast = !!mc.matches;
      announceChanges(before);
    });
  }
  if (typeof root.addEventListener === "function") {
    root.addEventListener("pagehide", flush);
    var d = root.document;
    if (d && d.addEventListener) {
      d.addEventListener("visibilitychange", function () { if (d.hidden) flush(); });
    }
    /* Another tab of the room wrote. Take its sections, and its settings
       too unless this tab has a change of its own still waiting to be
       written — the newest change should win, and here that is ours. */
    root.addEventListener("storage", function (e) {
      if (e.key !== null && e.key !== KEY) return;
      var o = null;
      try { o = e.newValue ? shape(decode(e.newValue)) : blank(); } catch (x) { o = blank(); }
      var mine = mem && mem.prefs;
      mem = o;
      if (dirty) mem.prefs = mine || {};
      else readPrefs(mem.prefs, true);
    });
  }
}

function ensure() { if (!loaded) Prefs.load(); }

/* ======================================================================
   the public face
   ====================================================================== */
var Prefs = {
  DEFAULTS: freeze(copy(DEFAULTS)),
  WORLD_IDS: freeze(WORLD_IDS.slice()),

  /* read storage, check every value, apply the system's wishes. Safe to
     call again: it re-reads storage, keeping listeners. Returns all(). */
  load: function () {
    install();
    if (dirty) flush();                  /* never drop a change still waiting */
    var fresh = readRoot();
    if (fresh) mem = fresh;
    else ensureMem();
    loaded = true;
    readPrefs(mem.prefs, false);
    dirty = false;
    return Prefs.all();
  },

  /* the current value; objects (keys, seen) come back as copies, so
     changing one means handing it back through set */
  get: function (k) { ensure(); return copy(value(k)); },

  /* returns true when the value was accepted. A value of the wrong kind
     is refused and changes nothing; a number out of range is clamped.
     Keys the room doesn't know yet are accepted as they are. */
  set: function (k, v) {
    ensure();
    var keep = v;
    if (has(CHECK, k)) {
      keep = CHECK[k](v);
      if (keep === undefined) return false;
    } else if (typeof k !== "string" || !k) return false;
    else keep = copy(v);
    chosen[k] = keep;
    saveSoon();
    emit(k, value(k));
    return true;
  },

  /* forget the player's choice: the key reads its default again */
  reset: function (k) {
    ensure();
    if (!has(chosen, k)) return false;
    delete chosen[k];
    saveSoon();
    emit(k, value(k));
    return true;
  },

  /* true when the player has set k (rather than it being the default) */
  has: function (k) { ensure(); return has(chosen, k); },

  all: function () {
    ensure();
    var o = {}, k;
    for (k in DEFAULTS) o[k] = copy(value(k));
    for (k in chosen) if (!has(o, k)) o[k] = copy(chosen[k]);
    return o;
  },

  /* fn(key, value) after every set, reset, and every change the system
     or another tab makes to a value. Returns a function that unsubscribes. */
  on: function (fn) {
    if (typeof fn !== "function") return function () {};
    listeners.push(fn);
    return function () { Prefs.off(fn); };
  },
  off: function (fn) {
    var i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  },

  /* motion as the renderers want it: "system" resolved against the device */
  motion: function () {
    ensure();
    var m = value("motion");
    if (m === "system") return sys.reducedMotion ? "gentle" : "full";
    return m;
  },

  /* what the device is asking for: {reducedMotion, moreContrast} */
  system: function () {
    ensure();
    return { reducedMotion: sys.reducedMotion, moreContrast: sys.moreContrast };
  },

  /* write any waiting change now; true when it reached storage */
  save: function () { ensure(); dirty = true; return flush(); },

  store: store
};

if (typeof module !== "undefined" && module.exports) module.exports = Prefs;
else root.Prefs = Prefs;
})(typeof self !== "undefined" ? self : this);
