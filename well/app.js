/* app.js — the room around the well: one loop, the shape of a run, and
   everything you can tap.

   Every other file here is a part with a contract (the build's SPEC): the
   engine knows the rules and nothing about pixels, the renderers draw
   a view and know nothing about rules, the music answers events, the input
   layer turns fingers, keys and pads into actions. This file is the only
   one that knows they all exist. It owns the loop, the life of a run from
   splash to run card, the HUD and the labels beside the well, the pause
   sheet and every sheet the menu opens, saving, the Glass Well, the gentle
   reminder, and the platform guards that stop a phone from eating a game.

   ## One clock, fixed steps

   The simulation runs at a fixed 240 Hz — 1000/240 ms a tick — whatever
   the display does. Each frame asks performance.now() where real time has
   got to and runs as many whole ticks as fit, so a 60 Hz phone runs four a
   frame, a 120 Hz iPad two, and Low Power Mode's 30 Hz eight. The sim
   clock is kept in the same timebase as an input event's timeStamp, which
   is what lets input.js apply every press on the exact tick it happened
   rather than whenever the frame got round to it. A hitch longer than a
   quarter of a second is dropped rather than replayed: a tab coming back
   from the background resumes; it does not fast-forward through the
   minute it missed.

   ## Nothing allocates in the frame

   A garbage collection on a phone is a dropped frame, and a dropped frame
   in a game about timing is a piece in the wrong place. So the frame path
   builds nothing: the view object is reused (Well.view fills it), the app
   events are a handful of objects made once, the HUD writes to the DOM
   only when a number actually changed, the stopwatch is six digit nodes
   whose text is swapped from a table of ten strings, and the Glass Well's
   bars are transforms picked from sixty-five strings built at load, and
   the clocks live in a Float64Array because a double written to an
   ordinary variable is boxed afresh on every write. Text is built when
   something *happens* — a clear, a new depth — which is rare, and never
   on a frame where nothing did. A sampling heap profile of six seconds of
   play finds nothing allocated by this file per frame except the two
   timestamps the browser itself hands over (performance.now() and the
   animation-frame argument), which no script can avoid.

   ## One module's mistake is not the page's

   Nineteen files meet in this one. If any of them throws, the room should
   go without that one thing — a sound, a sparkle — and keep the well. So every
   call across a module boundary in the hot path sits in its own try, the
   first failure of each kind is reported once to the console (loudly
   enough for tools/open-check.js to catch it), and the loop itself is
   wrapped so that a bad frame is one bad frame.

   ## Kind by construction

   Pausing never resumes by itself, from the button, the keyboard, a phone
   call or a switched tab. Resuming gives input back at once and holds
   gravity and the lock for 600 ms, so the first thing after a pause is a
   decision, not a drop. A run ends on "The well rests.", Done has the
   focus, and nothing starts another game for you. There are no "are you
   sure?" dialogs because nothing is at stake: leaving a resumable
   mode saves it, quietly, and the splash offers Continue without ever
   asking you to come back.                                              */
(function (root) {
"use strict";

var doc = root.document;
if (!doc || !doc.getElementById) return;

/* The parts. Read once: app.js loads last, so everything that loaded is
   here, and anything missing stays missing. */
var Well = root.Well || null, Bot = root.Bot || null, Modes = root.Modes || null,
    Records = root.Records || null, Worlds = root.Worlds || null, Skins = root.Skins || null,
    Layout = root.Layout || null, Prefs = root.Prefs || null, Gfx2D = root.Gfx2D || null,
    Gfx3D = root.Gfx3D || null, Music = root.Music || null, Input = root.Input || null,
    Learn = root.Learn || null, Coach = root.Coach || null, Steady = root.Steady || null,
    Sheets = root.Sheets || null;

/* ================================================================
   small things
   ================================================================ */
function $(id) { return doc.getElementById(id); }
function on(el, type, fn, opt) { if (el) el.addEventListener(type, fn, opt || false); }
function press(el, fn) { on(el, "click", function (e) { e.preventDefault(); fn(e); }); }
/* The buttons that live over the well during play answer a finger on
   pointerup, not on the click that should follow it. Straight after a fast
   flick on the well, Chrome on Android spends the next touch cancelling
   the fling and never sends that click, so Pause would do nothing on the
   first try — just after Keep, which is exactly when it is wanted. The
   tap counts if it lifts inside the button having moved less than 10 px,
   the way a tap on the well is judged. The click that may still follow is
   the same tap: its touchend is cancelled, so no click is made, and a
   guard at the top of the page catches any that comes anyway, so it can't
   land on a sheet that has just opened under the finger. A mouse and the
   keyboard (Enter and Space arrive as a click) are still answered by click. */
var ghost = { on: false, t: 0 };
function tapPress(el, fn) {
  if (!el) return;
  var pid = -1, x0 = 0, y0 = 0;
  on(el, "pointerdown", function (e) {
    if (e.pointerType === "mouse") { pid = -1; return; }
    /* A tap on the iPhone's haptic switch laid over the button (input.js
       hapticize) is left to its click: the switch ticks only for a real
       click, and cancelling the touchend would cancel the click with it.
       The click arrives after the touch is over, so it can't land on the
       sheet it opens. */
    if (e.target && e.target.matches && e.target.matches("input[data-well-hx]")) { pid = -1; return; }
    pid = e.pointerId; x0 = e.clientX; y0 = e.clientY;
  });
  on(el, "pointercancel", function (e) { if (e.pointerId === pid) pid = -1; });
  on(el, "pointerup", function (e) {
    if (e.pointerId !== pid) return;
    pid = -1;
    var dx = e.clientX - x0, dy = e.clientY - y0, r = el.getBoundingClientRect();
    if (dx * dx + dy * dy > 100) return;
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    ghost.on = true; ghost.t = now();
    fn(e);
  });
  on(el, "touchend", function (e) { if (ghost.on && now() - ghost.t < 400) e.preventDefault(); }, { passive: false });
  on(el, "click", function (e) { e.preventDefault(); fn(e); });
}
function wireGhostGuard() {
  /* any new touch, click or key means the tap that was answered is over */
  doc.addEventListener("pointerdown", function () { ghost.on = false; }, true);
  doc.addEventListener("keydown", function () { ghost.on = false; }, true);
  doc.addEventListener("click", function (e) {
    if (!ghost.on) return;
    ghost.on = false;
    if (now() - ghost.t > 900) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}
function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function now() { return root.performance && performance.now ? performance.now() : Date.now(); }

/* Each kind of failure is told once. A sibling that throws every frame
   would otherwise bury the console, and the one line that matters, under
   ten thousand copies of itself. */
var faults = {};
function fault(where, e) {
  if (faults[where]) return;
  faults[where] = 1;
  if (root.console && console.error) console.error("well: " + where + " — " + (e && e.stack ? e.stack : e));
}

function fmtInt(n) {
  var v = Math.round(+n || 0), neg = v < 0, s = String(Math.abs(v)), out = "";
  while (s.length > 3) { out = "," + s.slice(-3) + out; s = s.slice(0, -3); }
  return (neg ? "−" : "") + s + out;
}
/* 58.31 s, or 1:02.45 once a minute has gone by — to the nearest
   hundredth, the same rounding the run card and the end card use, so the
   share line can never disagree with them by one */
function fmtStopwatch(ms) {
  var cs = Math.round(Math.max(0, ms) / 10), s = Math.floor(cs / 100), h = cs % 100, m = Math.floor(s / 60);
  s = s % 60;
  var hh = (h < 10 ? "0" : "") + h;
  return m ? m + ":" + (s < 10 ? "0" : "") + s + "." + hh : s + "." + hh + " s";
}
function fmtDuration(ms) {
  var min = Math.round(Math.max(0, ms) / 60000);
  if (min < 1) return "under a minute";
  if (min < 60) return min + " min";
  var h = Math.floor(min / 60);
  return h + " h" + (min % 60 ? " " + (min % 60) + " min" : "");
}
function copyObj(o) { var c = {}, k; if (o) for (k in o) c[k] = o[k]; return c; }

/* ================================================================
   constants
   ================================================================ */
var TICK = 1000 / 240;
var GRACE_MS = 600, READY_MS = 1500, END_MS = 1600, SURFACE_MS = 3800, SPLASH_FADE_MS = 200;
var LABEL_MS = 1150, SAY_GAP = 2000, BANNER_MS = 2000;
var BREAK_MS = 5 * 60000, QUIET_MS = 30 * 60000;
var WATCH_STEP = 150;
var NAMES = ["", "I", "O", "T", "S", "Z", "J", "L"];
var TYPE_IX = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };
var DIG = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
var SCALEX = [];
(function () { for (var q = 0; q <= 64; q++) SCALEX.push("scaleX(" + (q / 64).toFixed(4) + ")"); })();
function typeIx(t) { return typeof t === "number" ? t : (TYPE_IX[t] || 0); }

/* The app's own events, made once. Renderers and the music read the t field, and
   a few fields; nothing keeps them, so the same object goes round again. */
var EV_START = { t: "start", sync: 0 }, EV_PAUSE = { t: "pause", sync: 0 },
    EV_RESUME = { t: "resume", sync: 0 }, EV_WORLD = { t: "world", world: "dawn", sync: 0 },
    EV_PB = { t: "pb", sync: 0 }, EV_END = { t: "end", why: "", sync: 0 },
    EV_SURFACE = { t: "surface", sync: 0 }, EV_BREATHE = { t: "breathe", phase: 0, sync: 0 },
    EV_CHAPTER = { t: "chapter", sync: 0 }, EV_GLASS = { t: "glass", on: true },
    EV_PASS = { t: "pass", lesson: "", hint: false };

/* ================================================================
   device
   ================================================================ */
var nav = root.navigator || {};
var mm = root.matchMedia ? function (q) { try { return root.matchMedia(q).matches; } catch (e) { return false; } }
                         : function () { return false; };
var TOUCH = ("ontouchstart" in root) || (nav.maxTouchPoints > 0);
var COARSE = mm("(pointer: coarse)");
var FINE = mm("(pointer: fine)");
var UA = nav.userAgent || "";
var IOS = /iP(hone|od|ad)/.test(UA) || (/Macintosh/.test(UA) && nav.maxTouchPoints > 1);
var APPLE = IOS || (/Macintosh/.test(UA) && /AppleWebKit/.test(UA) && !/Chrome|Chromium|Edg|Firefox/.test(UA));
var HAS_AUDIO = !!(root.AudioContext || root.webkitAudioContext);
/* what the first-run cards teach, and what Learn's controls section shows;
   it follows whatever the player last actually used */
var device = (COARSE || (TOUCH && !FINE)) ? "touch" : "keys";

/* ================================================================
   prefs — the real module, or a quiet stand-in that remembers nothing
   ================================================================ */
function memoryPrefs() {
  var D = {
    skin: "seaglass", palette: "skin", glyphs: "off", graphics: "auto", motion: "system",
    juice: "medium", nudge: 1, labels: true, grid: "faint", landing: true, lockLight: true,
    previews: 5, keep: true, modern: false, irs: false, ihs: false, das: 167, arr: 33, sdf: 20,
    dcd: 0, hdTouch: 133, hdKeys: 0, scheme: "gestures", tap: "sides", sensitivity: 1,
    lefty: false, btnSize: 64, btnOpacity: 1, haptics: true, master: 0.8, music: 0.7, sfx: 0.8,
    ambience: 0.6, soften: false, quiet: false, playOnSilent: false, muteOnBlur: true,
    audioQuality: "auto", boardSize: 1, textSize: 1, reminder: 30, learner: 1, pbPace: true,
    scoreHidden: false, descentPace: "gentle", driftTide: 2, driftChapter: 40, driftWorld: "dawn",
    fortyLines: 40, steadyLength: 20, steadyPace: "slow", steadyLanding: true, steadySound: "soft",
    steadyWorld: "snowfall",
    seen: { intro: false, touchCards: false, steadyTip: false, silentChip: false, landscape: false, homeScreen: false, breath: false }
  };
  var subs = [], mem = {};
  return {
    DEFAULTS: D, load: function () { return D; },
    get: function (k) { var v = D[k]; return (v && typeof v === "object") ? copyObj(v) : v; },
    set: function (k, v) { D[k] = v; for (var i = 0; i < subs.length; i++) subs[i](k, v); return true; },
    all: function () { return D; }, on: function (fn) { subs.push(fn); },
    motion: function () { return D.motion === "system" ? (mm("(prefers-reduced-motion: reduce)") ? "gentle" : "full") : D.motion; },
    store: { get: function (s) { return mem[s] || null; }, put: function (s, v) { mem[s] = v; return false; } }
  };
}
if (!Prefs) Prefs = memoryPrefs();
function pref(k) { try { return Prefs.get(k); } catch (e) { fault("Prefs.get", e); return undefined; } }
function setPref(k, v) { try { Prefs.set(k, v); } catch (e) { fault("Prefs.set", e); } }
function motionPref() { try { return Prefs.motion ? Prefs.motion() : "full"; } catch (e) { return "full"; } }
function seen(flag) { var s = pref("seen"); return !!(s && s[flag]); }
function markSeen(flag) {
  var s = pref("seen") || {};
  if (s[flag]) return;
  s[flag] = true;
  setPref("seen", s);
}
function storeGet(section) {
  try { return Prefs.store ? Prefs.store.get(section) : null; } catch (e) { fault("Prefs.store.get", e); return null; }
}
function storePut(section, value) {
  try { if (Prefs.store) Prefs.store.put(section, value); } catch (e) { fault("Prefs.store.put", e); }
}

/* ================================================================
   the state of the room
   ================================================================ */
/* boot | splash | intro (first-run cards) | play | paused |
   rest (a chapter or Steady's time is up; the well is still) |
   ending (the stack dissolving) | over (the run card is up) */
var state = "boot";
var run = null;              /* the live run */
var lastRun = null;          /* the run whose card is showing: Again, Begin again */
var view = null;             /* Well.view's one reusable object */
var R = null, I = null, S = null;
var records = null, saves = null;
/* The clocks live in a typed array, not in plain variables: a double
   written to a closure variable is boxed into a fresh heap number every
   time, and these three are written every frame and every tick. */
var clock = new Float64Array(4), SIM = 0, LAST = 1, FRAME = 2, DT = 3;
var needResize = true, pendingSwap2D = false;
var sheetsOpen = 0, lastToggle = -1e9;
var L = null, vw = 0, vh = 0, dpr = 1;
var safe = { t: 0, r: 0, b: 0, l: 0 };
var curWorld = null;
var glassOn = false;
var splashMusic = false;
var pendingSeed = null;
var tierNow = "";

/* Records' context, the finish context and the demo: objects reused for
   the life of the page */
var rctx = { modeId: "", opts: null, g: null, view: null };
var fctx = { elapsedMs: 0, opts: null, chapters: 0 };

/* ================================================================
   the DOM, looked up once
   ================================================================ */
var stage = $("stage"), cv3 = $("cv3"), cv2 = $("cv2");
var hudEl = $("hud"), hA = $("hudA"), hB = $("hudB"), hC = $("hudC");
var hAk = $("hudAk"), hAv = $("hudAv"), hBk = $("hudBk"), hBv = $("hudBv"), hCk = $("hudCk"), hCv = $("hudCv");
var btnMenu = $("btnMenu"), btnBreath = $("btnBreath"), breathBeads = $("breathBeads");
var labelsEl = $("labels"), LBL = labelsEl ? labelsEl.querySelectorAll(".lbl") : [];
var sayEl = $("say"), toastEl = $("toast"), bannerEl = $("banner"), bannerBig = $("bannerBig"), bannerSub = $("bannerSub");
var veil = $("veil"), veilText = $("veilText"), chip = $("chip"), paceEl = $("pace"), padEl = $("pad");
var glassEl = $("glass"), coachEl = $("coach"), splash = $("splash");

/* the safe-area insets, read from CSS: env() is only visible to style */
var safeProbe = doc.createElement("div");
safeProbe.setAttribute("aria-hidden", "true");
safeProbe.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
  "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
doc.body.appendChild(safeProbe);
function readSafe() {
  var cs = root.getComputedStyle ? getComputedStyle(safeProbe) : null;
  safe.t = cs ? parseFloat(cs.paddingTop) || 0 : 0;
  safe.r = cs ? parseFloat(cs.paddingRight) || 0 : 0;
  safe.b = cs ? parseFloat(cs.paddingBottom) || 0 : 0;
  safe.l = cs ? parseFloat(cs.paddingLeft) || 0 : 0;
}

/* ================================================================
   the renderer: 3D first, 2D when it must be, and live fallback
   ================================================================ */
function forced2D() {
  return /[?&]gfx=2d(&|$)/i.test(root.location ? location.search : "") || pref("graphics") === "2d";
}
function tierPref() {
  var g = pref("graphics");
  return (g === "full" || g === "balanced" || g === "simple") ? g : "auto";
}
var gfxOpts = {
  tier: "auto",
  /* A test hook, never a setting: ?gl=soft lets the 3D renderer accept a
     software GL (SwiftShader in a GPU-less test browser), which it refuses
     by design so a slow machine gets the 2D well rather than a slideshow.
     tools/open-check.js uses it to look at the 3D path at all. */
  allowSoftware: /[?&]gl=soft(&|$)/i.test(root.location ? location.search : ""),
  /* a context lost for good (or three times in a minute): the renderer has
     already said its goodbyes; swap at the top of the next frame, never
     from inside its own callback */
  onLost: function () { pendingSwap2D = true; },
  onTier: function (name) { tierNow = name; },
  onLowPower: function () { lowPowerChip(); }
};
var webglOk = null;      /* null until asked */

function makeRenderer() {
  var r = null;
  if (!forced2D() && Gfx3D) {
    gfxOpts.tier = tierPref();
    try { r = Gfx3D.create(cv3, gfxOpts); } catch (e) { fault("Gfx3D.create", e); r = null; }
    webglOk = !!r;
  }
  if (!r && Gfx2D) {
    try { r = Gfx2D.create(cv2, gfxOpts); } catch (e) { fault("Gfx2D.create", e); r = null; }
  }
  R = r;
  showCanvas();
  if (R) applyLook();
}
function showCanvas() {
  var k = R ? R.kind : "";
  cv3.classList.toggle("hide", k !== "3d");
  cv2.classList.toggle("hide", k !== "2d");
}
function swapTo2D(why) {
  pendingSwap2D = false;
  if (!R || R.kind === "2d" || !Gfx2D) return;
  try { R.dispose(); } catch (e) { fault("R.dispose", e); }
  R = null;
  try { R = Gfx2D.create(cv2, gfxOpts); } catch (e) { fault("Gfx2D.create", e); R = null; }
  showCanvas();
  if (R) applyLook();
  if (why === "lost") toast("The 3D well stepped aside, so this is the 2D one. Your game is just as it was.", 4600);
}
function swapTo3D() {
  if (!R || R.kind === "3d" || !Gfx3D || forced2D()) return;
  var r = null;
  gfxOpts.tier = tierPref();
  /* a canvas that has had a context keeps it, lost or not; if the 3D one
     cannot be made again here, the 2D well simply stays */
  try { r = Gfx3D.create(cv3, gfxOpts); } catch (e) { fault("Gfx3D.create", e); r = null; }
  if (!r) return;
  try { R.dispose(); } catch (e) { fault("R.dispose", e); }
  R = r;
  showCanvas();
  applyLook();
}
function graphicsChanged() {
  if (!R) return;
  if (forced2D()) { swapTo2D("pref"); return; }
  if (R.kind === "2d") { swapTo3D(); return; }
  try { R.setTier(tierPref()); } catch (e) { fault("R.setTier", e); }
}
function applyLook() {
  applySkin();
  if (curWorld && R) { try { R.setWorld(curWorld, true); } catch (e) { fault("R.setWorld", e); } }
  applyRenderOpts();
  needResize = true;
}

function skinNow() {
  if (!Skins) return null;
  try { return Skins.get(pref("skin")) || Skins.list[0]; } catch (e) { fault("Skins.get", e); return null; }
}
function applySkin() {
  var skin = skinNow();
  if (!skin) return;
  var glyphs = pref("glyphs");
  /* Ink and Moonlight carry their glyphs strong whatever the setting says:
     in Moonlight, shape and glyph are the only way to tell pieces apart */
  if (skin.glyphs === "strong") glyphs = "strong";
  if (R) { try { R.setSkin(skin, pref("palette"), glyphs); } catch (e) { fault("R.setSkin", e); } }
  glassColours(skin);
}

var ropt = { landing: true, grid: "faint", lockLight: true, motion: "full", juice: "medium",
             nudge: 1, labels: true, steady: false, previews: 5 };
function applyRenderOpts() {
  var steady = !!(run && run.steady);
  var motion = motionPref();
  ropt.landing = steady ? run.opts.landing !== false : !!pref("landing");
  ropt.grid = pref("grid") || "faint";
  ropt.lockLight = !!pref("lockLight");
  ropt.motion = motion;
  /* Steady forces the calm preset, no nudge and no labels; Drift's nudge
     is 0 by design, and reduced motion always takes the nudge away */
  ropt.juice = steady ? "calm" : (pref("juice") || "medium");
  ropt.nudge = (steady || (run && run.modeId === "drift") || motion !== "full") ? 0 : +pref("nudge");
  ropt.labels = !steady && !!pref("labels");
  ropt.steady = steady;
  ropt.previews = runPreviews();
  if (R) { try { R.setOptions(ropt); } catch (e) { fault("R.setOptions", e); } }
}

function runPreviews() {
  var p = run && run.eo && typeof run.eo.previews === "number" ? run.eo.previews : +pref("previews");
  return p >= 0 ? p : 5;
}

function worldEntry(id) {
  if (!Worlds) return null;
  try { return Worlds.get(id) || Worlds.list[0]; } catch (e) { fault("Worlds.get", e); return null; }
}
function worldName(id) { var w = worldEntry(id); return w ? w.name : ""; }
/* the sky and the music change together: one call, so they never disagree */
function setWorld(id, instant, musicNow) {
  var w = worldEntry(id);
  if (!w) return;
  curWorld = w;
  if (R) { try { R.setWorld(w, !!instant); } catch (e) { fault("R.setWorld", e); } }
  if (Music) { try { Music.setWorld(w.id, !!musicNow); } catch (e) { fault("Music.setWorld", e); } }
}

/* ================================================================
   sound
   ================================================================ */
var levels = { master: 0.8, music: 0.7, sfx: 0.8, ambience: 0.6 };
var aopts = { soften: false, quiet: false, quality: "auto", playOnSilent: false };
function applyAudio() {
  if (!Music) return;
  var st = run && run.steady ? run.opts.sound : "";
  levels.master = +pref("master"); levels.music = +pref("music");
  levels.sfx = +pref("sfx"); levels.ambience = +pref("ambience");
  /* Steady's own choice for the session — "effects" is the notes of each
     move with no music and no ambience, "quiet" every bus at zero — comes
     from Steady.levels, so the entry card and the mixer can never mean
     two different things by the same word */
  if (st && Steady && Steady.levels) {
    var sl = null;
    try { sl = Steady.levels(st, Prefs); } catch (e) { fault("Steady.levels", e); }
    if (sl) { levels.master = sl.master; levels.music = sl.music; levels.sfx = sl.sfx; levels.ambience = sl.ambience; }
  }
  aopts.soften = !!pref("soften") || !!(run && run.steady);
  aopts.quiet = !!pref("quiet") || st === "quiet";
  aopts.quality = pref("audioQuality") || "auto";
  aopts.playOnSilent = !!pref("playOnSilent");
  try { Music.setLevels(levels); } catch (e) { fault("Music.setLevels", e); }
  try { Music.setOptions(aopts); } catch (e) { fault("Music.setOptions", e); }
}
function music(name, arg) {
  if (!Music) return;
  try {
    if (name === "start") Music.start();
    else if (name === "stop") Music.stop();
    else if (name === "pause") Music.pause(arg);
    else if (name === "suspend") Music.suspend();
    else if (name === "resume") Music.resume();
    else if (name === "calm") Music.calm(arg);
    else if (name === "ui") Music.ui(arg);
    else if (name === "unlock") Music.unlock();
  } catch (e) { fault("Music." + name, e); }
}
function musicEvent(ev) {
  if (!Music) return 0;
  try { return +Music.event(ev) || 0; } catch (e) { fault("Music.event", e); return 0; }
}
/* audio may only wake inside a gesture; never awaited */
function unlockAudio() {
  music("unlock");
  var st = "";
  try { st = Music ? Music.state() : "off"; } catch (e) { st = ""; }
  if (st && st !== "locked") {
    root.removeEventListener("pointerup", unlockAudio, true);
    root.removeEventListener("touchend", unlockAudio, true);
    root.removeEventListener("click", unlockAudio, true);
    root.removeEventListener("keydown", unlockAudio, true);
  }
}

/* ================================================================
   layout
   ================================================================ */
var lopt = { previews: 5, keep: true, safe: safe, hudTop: 44, buttons: false, trayH: 0, scale: 1, dpr: 1 };
var padOn = false;
var lblBand = { top: 0, bottom: 0, wide: false };

function fallbackLayout(w, h) {
  var hudTop = 44, c = Math.max(8, Math.floor(Math.min((h - safe.t - safe.b - hudTop - 60) / 23.6, (w - 40) / 12)));
  var ww = c * 10, wh = c * 22, x = Math.round((w - ww) / 2), y = Math.round(safe.t + hudTop + c * 1.2 + c * 0.5);
  return {
    shape: "tall", cell: c, lip: c * 0.5, well: { x: x, y: y, w: ww, h: wh }, keep: null, next: [], side: null,
    hud: { x: safe.l + 8, y: safe.t + 2, w: w - safe.l - safe.r - 66, h: 40 },
    pause: { x: w - safe.r - 50, y: safe.t + 6, w: 44, h: 44 },
    screenToCell: function (px, py, into) { var o = into || {}; o.x = (px - x) / c; o.y = (y + wh - py) / c; return o; }
  };
}

function doResize() {
  needResize = false;
  vw = stage.clientWidth || root.innerWidth || 390;
  vh = stage.clientHeight || root.innerHeight || 844;
  dpr = Math.min(root.devicePixelRatio || 1, 2);
  readSafe();
  /* Keep and the previews are fixed for a run when the engine is made (a
     lesson may turn either off); the niche and the stream follow the run
     in progress, and the settings apply from the next one */
  lopt.previews = runPreviews();
  lopt.keep = run && run.eo ? run.eo.keep !== false : !!pref("keep");
  lopt.scale = +pref("boardSize") || 1;
  lopt.buttons = padOn;
  lopt.trayH = padOn ? (padEl.offsetHeight - safe.b - 24) : 0;
  if (lopt.trayH < 0) lopt.trayH = 0;
  lopt.trayW = padOn ? trayClusterW() : 0;
  lopt.dpr = dpr;
  /* the HUD's band grows with the text size, so big text never runs into
     the Keep niche below it */
  lopt.hudTop = Math.max(44, Math.ceil(42 * (+pref("textSize") || 1)) + 2);
  var nl = null;
  if (Layout) { try { nl = Layout.compute(vw, vh, lopt); } catch (e) { fault("Layout.compute", e); nl = null; } }
  /* a two-row HUD (hudWrapWanted) only ever applies to the tall shape */
  if (nl && hudWrap && run && nl.shape === "tall") {
    lopt.hudTop = 2 * lopt.hudTop + 4;
    try { nl = Layout.compute(vw, vh, lopt); } catch (e) { fault("Layout.compute", e); }
  }
  trayBeside = false;
  if (nl && padOn && vw > vh) {
    var alt = besideTray(nl);
    if (alt) { nl = alt; trayBeside = true; }
  }
  L = nl || fallbackLayout(vw, vh);
  if (R) { try { R.resize(vw, vh, dpr, L); } catch (e) { fault("R.resize", e); } }
  placeChrome();
}

/* A phone on its side with the Buttons scheme: the tray's two clusters sit
   at the far left and right, and reserving the tray's whole height under
   the well would leave cells of nine pixels. If the well laid out as if
   there were no tray fits between the clusters — the well, Keep, the
   previews and the HUD all clear of every button — that layout is used,
   and the side panel is given up (the Glass Well and the coach go over
   the well, as on a phone held upright). */
var trayBeside = false, altOpt = {};
/* the wider of the tray's two clusters, measured from its screen edge, for
   a layout that can seat the well between them */
function trayClusterW() {
  var bs = padEl.querySelectorAll("[role=button]"), l = 0, r = 0;
  for (var i = 0; i < bs.length; i++) {
    var b = bs[i].getBoundingClientRect();
    if (!(b.width > 0)) return 0;
    if (b.left + b.width / 2 < vw / 2) l = Math.max(l, b.right); else r = Math.max(r, vw - b.left);
  }
  return Math.ceil(Math.max(l, r));
}
function besideTray(reserved) {
  var bs = padEl.querySelectorAll("[role=button]");
  if (!bs.length) return null;
  var left = 0, right = vw, top = vh, i, k;
  for (i = 0; i < bs.length; i++) {
    var b = bs[i].getBoundingClientRect();
    if (!(b.width > 0)) return null;
    if (b.left + b.width / 2 < vw / 2) left = Math.max(left, b.right); else right = Math.min(right, b.left);
    top = Math.min(top, b.top);
  }
  for (k in lopt) altOpt[k] = lopt[k];
  altOpt.buttons = false; altOpt.trayH = 0;
  var alt = null;
  try { alt = Layout.compute(vw, vh, altOpt); } catch (e) { fault("Layout.compute", e); return null; }
  if (!alt || !(alt.cell > reserved.cell)) return null;
  function clear(r) {
    return !r || r.y + r.h <= top || (r.x >= left + 6 && r.x + r.w <= right - 6);
  }
  var wall = alt.wall || 0, w = alt.well;
  if (!clear({ x: w.x - wall, y: w.y, w: w.w + 2 * wall, h: w.h + (alt.floor || 0) })) return null;
  if (!clear(alt.keep) || !clear(alt.hud)) return null;
  for (i = 0; alt.next && i < alt.next.length; i++) if (!clear(alt.next[i])) return null;
  return alt;
}

function px(el, prop, v) { el.style[prop] = Math.round(v) + "px"; }

/* the room right of the well and its previews, below the pause button,
   when a wide screen has some (a phone on its side) */
var rpBox = { x: 0, y: 0, w: 0, h: 0 };
function rightPanel(bottom) {
  if (L.shape !== "wide") return null;
  var x = L.well.x + L.well.w + (L.wall || 0) + 10, y = (L.pause ? L.pause.y + L.pause.h : safe.t + 50) + 10;
  for (var i = 0; L.next && i < L.next.length; i++) {
    x = Math.max(x, L.next[i].x + L.next[i].w + 10);
  }
  var w = Math.min(340, vw - safe.r - 8 - x), h = bottom - y;
  if (w < 170 || h < 150) return null;
  rpBox.x = x; rpBox.y = y; rpBox.w = w; rpBox.h = h;
  return rpBox;
}

/* Everything in the DOM that sits on the well is placed from the same
   rectangles the renderers draw from. */
function placeChrome() {
  var w = L.well, c = L.cell;
  var hud = L.hud || { x: safe.l + 8, y: safe.t + 2, w: vw - 70, h: 40 };
  var pz = L.pause || { x: vw - safe.r - 50, y: safe.t + 6, w: 44, h: 44 };

  px(btnMenu, "left", pz.x); px(btnMenu, "top", pz.y);
  btnMenu.style.right = "auto";

  /* the side panel beside a wide well, when nothing else has it */
  var side = L.side && L.side.w >= 170 && !trayBeside ? L.side : null;
  var sideTop = side ? side.y : 0;

  /* Everything in the side panel lines up on one right edge, a short step
     from the well's wall, so on a big screen the numbers sit beside the
     game they describe rather than out in the far corner. */
  var edge = side ? Math.max(side.x + 170, w.x - (L.wall || 0) - 22) : 0;
  function inPanel(width) { return Math.max(side.x, edge - width); }

  /* layout.js already stops the HUD short of the pause button. Where its
     strip beside the Keep niche is too narrow for a world's name, a score
     and the Breath button side by side (an iPad, a Mac, a phone on its
     side), the HUD becomes a column in the side panel instead, with larger
     numbers, and everything else in the panel moves down below it. */
  var colW = side ? Math.min(side.w, Math.round(220 * Math.max(1, +pref("textSize") || 1)), Math.max(170, edge - side.x)) : 0;
  var colX = side ? inPanel(colW) : 0;
  var colY = side ? (L.keep && colX + colW > L.keep.x - 8 && colX < L.keep.x + L.keep.w + 8 ? side.y : hud.y) : 0;
  /* The column must end above whatever is below it: the Buttons tray on a
     phone on its side (its whole band takes taps, so its top, not its
     keys'), else the bottom of the screen. In a mode with Breath it keeps
     room for the button that appears later, under Score, so that button
     can never come up under the tray. Measured against fixed numbers, not
     the HUD's own height, which depends on which shape it is in now. */
  var colBottom = padOn && padEl.offsetHeight ? padEl.getBoundingClientRect().top - 8 : vh - safe.b - 8;
  var colNeed = 210 + (run && run.mode && run.mode.hasBreath ? 58 : 0);
  var hudCol = !!side && hud.w < 480 && colY + colNeed <= colBottom;
  hudEl.classList.toggle("col", hudCol);
  if (hudCol) {
    /* up in the corner when the column clears the Keep niche, else just
       under it */
    px(hudEl, "left", colX); px(hudEl, "top", colY);
    px(hudEl, "width", colW);
    hudEl.style.minHeight = "0px";
    hudEl.style.flexDirection = "column";
    sideTop = Math.max(side.y, colY + (hudEl.offsetHeight || 104) +
      (run && run.mode && run.mode.hasBreath && hudEl.offsetHeight && btnBreath.classList.contains("hide") ? 62 : 0) + 14);
  } else {
    px(hudEl, "left", hud.x); px(hudEl, "top", hud.y);
    px(hudEl, "width", Math.max(120, hud.w > 0 ? hud.w : vw - safe.l - safe.r - 70));
    hudEl.style.minHeight = hudWrap ? "0px" : Math.round(Math.max(36, Math.min(hud.h, 48))) + "px";
    hudEl.style.flexDirection = hud.stack ? "column" : "row";
  }
  hudEl.classList.toggle("wrap", hudWrap && L.shape === "tall" && !hudCol);
  hudRow = !hudCol && !hud.stack;
  var bottom = vh - safe.b - 8;
  var glassShown = glassOn && !glassEl.classList.contains("hide");
  var glassH = glassEl.offsetHeight || 260;

  /* the Glass Well: in the side panel when it fits there below the HUD,
     else in the free strip right of the previews (a phone on its side),
     else a compact card under the Keep niche that steps out of the way */
  var rp = rightPanel(bottom);
  var glassSide = !!side && sideTop + Math.min(glassH, 200) <= bottom;
  var glassRight = !glassSide && !!rp;
  glassBand.over = !glassSide && !glassRight;
  var belowGlass = sideTop + (glassShown && glassSide ? glassH + 12 : 0);

  /* labels: beside the well when there is room beside it (below anything
     already in the panel), otherwise just inside it, on whichever side the
     piece is not */
  var room = w.x - safe.l - 16;
  var lblTop = Math.max(w.y + w.h * 0.48, side ? belowGlass : 0);
  lblBand.wide = room >= 130 && lblTop + 100 <= bottom;
  if (lblBand.wide) {
    labelsEl.className = "r";
    px(labelsEl, "left", safe.l + 8);
    px(labelsEl, "width", room - 4);
    px(labelsEl, "top", lblTop);
  } else {
    px(labelsEl, "left", w.x + 8);
    px(labelsEl, "width", w.w - 16);
    px(labelsEl, "top", w.y + w.h * 0.22);
  }
  /* the band of rows the labels cover, for the dodge test (board y is up) */
  var lt = lblBand.wide ? 0 : (w.y + w.h * 0.22);
  lblBand.top = 22 - (lt - w.y) / c;
  lblBand.bottom = lblBand.top - (4 * 1.3 * 18 * (+pref("textSize") || 1)) / c;

  if (glassSide) {
    px(glassEl, "left", inPanel(Math.min(side.w, 250))); px(glassEl, "top", sideTop); px(glassEl, "width", Math.min(side.w, 250));
  } else if (glassRight) {
    px(glassEl, "left", rp.x); px(glassEl, "top", rp.y); px(glassEl, "width", Math.min(rp.w, 250));
  } else {
    var gy = L.keep ? L.keep.y + L.keep.h + 6 : w.y + 6, gw = Math.min(214, w.w * 0.66);
    px(glassEl, "left", w.x + 4); px(glassEl, "top", gy); px(glassEl, "width", gw);
    /* over the well, it gets out of the active piece's way like the labels
       do; its rectangle in board cells is worked out once here */
    glassBand.x1 = (gw + 4) / c;
    glassBand.top = 22 - (gy - w.y) / c;
    glassBand.bottom = glassBand.top - glassH / c;
  }

  /* the coach: in the side panel below whatever is already there, or in
     the strip right of the previews, or — on a phone — inside the well */
  coachBand.on = false;
  coachSpot.side = false;
  /* measured at the width it would have, since the words wrap */
  function coachFits(box, top) {
    coachEl.classList.remove("compact");
    px(coachEl, "width", Math.min(box.w, 320));
    return top + (coachEl.offsetHeight || 180) <= bottom;
  }
  var cbox = side && coachFits(side, belowGlass) ? side
           : rp && !(glassRight && glassShown) && coachFits(rp, rp.y) ? rp : null;
  if (cbox) {
    px(coachEl, "left", cbox === side ? inPanel(Math.min(side.w, 320)) : cbox.x); px(coachEl, "width", Math.min(cbox.w, 320));
    /* low in the panel, but never past the bottom of the screen: on a
       phone held sideways the panel is short */
    coachSpot.want = cbox === rp ? rp.y : Math.max(belowGlass, w.y + w.h * 0.58);
    coachSpot.min = cbox === rp ? rp.y : belowGlass;
    coachSpot.side = true;
    coachFit();
    coachEl.style.right = "auto";
  } else {
    /* a phone: a passing line inside the well, a third of the way down —
       below the mouth, where a lesson's piece waits to be moved, and above
       the stack — and it fades to a whisper whenever a piece passes under
       it, the way the labels do */
    coachEl.classList.add("compact");
    px(coachEl, "left", w.x + 6); px(coachEl, "width", w.w - 12);
    var cy = w.y + w.h * 0.3;
    px(coachEl, "top", cy);
    coachEl.style.right = "auto";
    coachBand.on = true;
    coachBand.top = 22 - (cy - w.y) / c;
    coachBand.bottom = coachBand.top - Math.max(coachEl.offsetHeight || 0, 3.2 * c) / c;
  }

  px(paceEl, "left", w.x - 2); px(paceEl, "top", w.y - (L.lip || 0) - 2);
  px(paceEl, "width", w.w + 4); px(paceEl, "height", w.h + (L.lip || 0) + 4);

  /* The reminder chip and the toast never sit on the well: the mouth is
     where a piece appears and the bottom is where the stack lives. Beside
     a wide well they take the foot of the side panel (the toast just above
     the chip's place), or on a phone held sideways the strip right of the
     previews; on a phone held upright they sit over the HUD, whose
     numbers can wait a few seconds, clear of the pause button — the chip
     as one solid line that stops above the Keep niche. */
  chip.style.transform = "none";
  chip.classList.remove("compact");
  toastWell.on = false;
  var chipH = chip.offsetHeight || 116;
  if (side && belowGlass + chipH + 60 <= bottom) {
    /* at the foot of the panel, clear of the labels and the coach above */
    var chw = Math.min(side.w, 340), chx = inPanel(chw);
    px(chip, "left", chx); px(chip, "width", chw);
    px(chip, "top", bottom - chipH);
    toastSpot.x = chx + chw / 2; toastSpot.y = bottom - chipH - 52; toastSpot.max = chw;
  } else if (rp) {
    /* a phone on its side: the free strip right of the previews */
    px(chip, "left", rp.x); px(chip, "width", rp.w); px(chip, "top", rp.y);
    toastSpot.x = rp.x + rp.w / 2; toastSpot.y = rp.y; toastSpot.max = rp.w;
  } else {
    var pzw = (L.pause ? L.pause.w : 44) + 14;
    chip.classList.add("compact");
    px(chip, "left", safe.l + 8); px(chip, "width", vw - safe.l - safe.r - 16 - pzw);
    var lim = (L.keep ? L.keep.y : w.y - (L.lip || 0)) - 4;
    px(chip, "top", Math.max(safe.t + 2, Math.min(safe.t + 4, lim - (chip.offsetHeight || 60))));
    toastSpot.x = vw / 2; toastSpot.y = safe.t + 10; toastSpot.max = vw - 2 * (pzw + 8);
    /* a note about something in the HUD (the Breath button) can't cover
       the HUD: it passes through the empty upper well instead, and steps
       out of a falling piece's way */
    toastWell.on = true;
    /* below where a depth's name goes and above an early stack: a piece
       in hand spends the least time here, falling or dropped */
    toastWell.x = w.x + w.w / 2; toastWell.y = w.y + w.h * 0.56; toastWell.max = w.w - 20;
    toastWell.top = 22 - (toastWell.y - w.y) / c;
    toastWell.bottom = toastWell.top - 3.4;
  }
  placeToast();

  /* the splash title floats in the empty upper reach of the well, below
     the mouth, the Keep niche and the drifting previews, where the demo's
     low stack never goes */
  var mouth = w.y + c * 0.9;
  if (L.keep) mouth = Math.max(mouth, L.keep.y + L.keep.h + c * 0.4);
  splash.style.paddingTop = Math.round(Math.max(safe.t + 12, Math.min(mouth, vh * 0.3))) + "px";
  /* a depth's name arrives with the clear that reached it: when the
     labels sit inside the well (a phone) the banner goes below their band
     rather than on top of the words */
  bannerY = w.y + w.h * (lblBand.wide ? 0.24 : 0.42);
  px(bannerEl, "top", bannerY);
}

/* ================================================================
   the HUD — DOM text, written only when a number changes
   ================================================================ */
var hc = { a: -1, b: -1, c: -1, s: "", breathVis: false, breath: -1, breathOn: false, breathLbl: "", clock: -1, ahead: false };
/* A phone's HUD is one row: when space runs short the world's name gives
   way to an ellipsis and every number stays whole. At a large text size
   that row cannot hold three cards and the Breath button at all, so for a
   mode with three cards the HUD takes two rows from the start of the run
   — the name on a line of its own — and the layout gives it the height.
   It is decided when a run begins, never during one: a well that changes
   size mid-run is worse than a shortened name. */
var hudWrap = false, hudRow = true;
function hudWrapWanted(r) {
  return !!r && !r.steady && (+pref("textSize") || 1) >= 1.25 &&
         (r.modeId === "descent" || r.modeId === "drift" || r.modeId === "three");
}
var clockNodes = null, clockDig = [-1, -1, -1, -1, -1, -1], clockM10 = null, clockHund = true;

function setText(el, s) {
  var n = el.firstChild;
  if (n && n.nodeType === 3 && !n.nextSibling) n.nodeValue = s;
  else el.textContent = s;
}
function cell(el, kEl, vEl, cap, val) {
  el.classList.remove("hide");
  setText(kEl, cap);
  setText(vEl, val);
}
/* m:ss.hh as six text nodes — the clock changes every frame, and swapping
   a node's text for one of ten prebuilt strings allocates nothing */
function makeClock(vEl, hundredths) {
  vEl.textContent = "";
  vEl.className = "hv clock";
  clockHund = hundredths;
  clockNodes = [];
  var parts = hundredths ? ["m10", "m1", ":", "s10", "s1", ".", "h10", "h1"] : ["m10", "m1", ":", "s10", "s1"];
  for (var i = 0; i < parts.length; i++) {
    var sp = doc.createElement("span");
    if (parts[i] === ":" || parts[i] === ".") { sp.textContent = parts[i]; vEl.appendChild(sp); continue; }
    sp.className = parts[i];
    sp.appendChild(doc.createTextNode("0"));
    vEl.appendChild(sp);
    clockNodes.push(sp.firstChild);
    if (parts[i] === "m10") clockM10 = sp;
  }
  for (i = 0; i < 6; i++) clockDig[i] = -1;
  /* each digit is a contained box (index.html) as wide as one of this
     font's digits, measured once here in em so it holds at any size */
  try {
    var probe = doc.createElement("span");
    probe.textContent = "0";
    vEl.appendChild(probe);
    var w = probe.getBoundingClientRect().width, fs = parseFloat(root.getComputedStyle(vEl).fontSize);
    vEl.removeChild(probe);
    if (w > 0 && fs > 0) vEl.style.setProperty("--dw", (w / fs).toFixed(3) + "em");
  } catch (e) { /* the CSS default stands */ }
}
function digit(i, d) {
  if (clockDig[i] === d) return;
  clockDig[i] = d;
  clockNodes[i].nodeValue = DIG[d];
  if (i === 0) clockM10.classList.toggle("z", d === 0);
}
function clockSet(ms, countdown) {
  if (!clockNodes) return;
  if (ms < 0) ms = 0;
  var cs = countdown ? Math.ceil(ms / 1000) * 100 : Math.round(ms / 10);
  if (cs === hc.clock) return;
  hc.clock = cs;
  var s = Math.floor(cs / 100), h = cs % 100, m = Math.floor(s / 60);
  s = s % 60;
  if (m > 99) m = 99;
  digit(0, Math.floor(m / 10)); digit(1, m % 10); digit(2, Math.floor(s / 10)); digit(3, s % 10);
  if (clockHund) { digit(4, Math.floor(h / 10)); digit(5, h % 10); }
}

function hudSetup() {
  var r = run;
  var wrapNow = hudWrapWanted(r);
  if (wrapNow !== hudWrap) { hudWrap = wrapNow; needResize = true; }
  hc.a = hc.b = hc.c = hc.clock = hc.breath = -1;
  hc.s = ""; hc.breathVis = false; hc.breathOn = false; hc.ahead = false; hc.breathLbl = "";
  clockNodes = null;
  hAv.className = "hv"; hBv.className = "hv"; hCv.className = "hv";
  hA.classList.add("hide"); hB.classList.add("hide"); hC.classList.add("hide");
  btnBreath.classList.add("hide");
  hudEl.classList.toggle("off", r.steady);
  /* Every label in one case, a capital and then lower case, and the
     first card — the one that grows — always carries a name: the world
     in Descent and Drift, the lesson in a challenge */
  var learner = r.learner ? " · learner speed" : "";
  switch (r.modeId) {
    case "descent":
      cell(hA, hAk, hAv, "Depth " + r.depth + learner, worldName(r.world));
      cell(hB, hBk, hBv, "Lines left", "25");
      cell(hC, hCk, hCv, "Score", "0");
      break;
    case "forty":
      cell(hA, hAk, hAv, "Time" + learner, "");
      makeClock(hAv, true);
      cell(hB, hBk, hBv, "Lines", "0 / " + r.goal);
      break;
    case "three":
      cell(hA, hAk, hAv, "Time left" + learner, "");
      makeClock(hAv, false);
      cell(hB, hBk, hBv, "Score", "0");
      cell(hC, hCk, hCv, "Level", "1");
      break;
    case "drift":
      cell(hA, hAk, hAv, tideLabel(r.tide) + learner, worldName(r.world));
      cell(hB, hBk, hBv, "Chapter", "");
      cell(hC, hCk, hCv, "Score", "0");
      if (pref("scoreHidden")) hC.classList.add("hide");
      break;
    case "challenges":
      cell(hA, hAk, hAv, (r.lesson && r.lesson.name ? r.lesson.name : "Challenge") + learner, "");
      break;
  }
}

function tideLabel(t) { return t > 0 ? "Tide " + t : "Tide off"; }
function displayScore() { return run.scoreBase + (run.g.score || 0); }
function totalLines() { return run.linesBase + (run.g.lines || 0); }

function hudUpdate() {
  var r = run, g = r.g, v;
  switch (r.modeId) {
    case "descent":
      var tl = totalLines();
      v = r.depth >= 10 ? 250 - tl : r.depth * 25 - tl;
      if (v < 0) v = 0;
      if (v !== hc.b) { hc.b = v; setText(hBv, String(v)); }
      v = displayScore();
      if (v !== hc.c) { hc.c = v; setText(hCv, fmtInt(v)); }
      break;
    case "forty":
      clockSet(r.elapsedMs, false);
      v = g.lines || 0;
      if (v !== hc.b) { hc.b = v; setText(hBv, Math.min(v, r.goal) + " / " + r.goal); }
      break;
    case "three":
      clockSet(r.timeLimit - (typeof g.time === "number" ? g.time : r.elapsedMs), true);
      v = g.score || 0;
      if (v !== hc.b) { hc.b = v; setText(hBv, fmtInt(v)); }
      v = g.level || 1;
      if (v !== hc.c) { hc.c = v; setText(hCv, String(v)); }
      break;
    case "drift":
      v = r.tide;
      if (v !== hc.a) { hc.a = v; setText(hAk, tideLabel(v) + (r.learner ? " · learner speed" : "")); }
      v = totalLines() - (r.chapterEnd - r.chapterLen);
      if (v !== hc.b) { hc.b = v; setText(hBv, Math.max(0, Math.min(v, r.chapterLen)) + " / " + r.chapterLen); }
      v = displayScore();
      if (v !== hc.c) { hc.c = v; setText(hCv, fmtInt(v)); }
      break;
  }
  /* the Breath button: shown once the beads can pay for a breath */
  if (r.mode && r.mode.hasBreath && view && view.breath) {
    var ch = Math.floor(view.breath.charge), act = !!view.breath.active;
    var vis = ch >= 10 || act;
    if (vis !== hc.breathVis) {
      hc.breathVis = vis;
      btnBreath.classList.toggle("hide", !vis);
      if (vis && !act && state === "play" && !seen("breath")) breathIntro();
    }
    if (ch === hc.breath && act === hc.breathOn) return;
    if (ch !== hc.breath) { hc.breath = ch; setText(breathBeads, ch + "/20"); }
    if (act !== hc.breathOn) {
      hc.breathOn = act;
      btnBreath.classList.toggle("active", act);
    }
    /* the name a screen reader hears carries the beads the button shows */
    var lbl = act ? "Breathing" : "Take a Breath, " + ch + " of 20 beads";
    if (lbl !== hc.breathLbl) { hc.breathLbl = lbl; btnBreath.setAttribute("aria-label", lbl); }
  }
}
/* The first time Breath is ready, it says what it is, once. On a phone
   the note passes through the empty upper well rather than over the HUD,
   since the button it describes is in the HUD. */
function breathIntro() {
  markSeen("breath");
  var keys = pref("keys"), k = keys && keys.breath && keys.breath[0] ? keyName(keys.breath[0]) : "B";
  var how = device === "keys" ? "press " + k + " (or click it)" : device === "pad" ? "press the left trigger (or tap it)" : "tap it (or press " + k + ")";
  toast("Breath is ready: " + how + " and gravity rests for one long breath. Each line you clear adds a bead.", 6500, true);
}
/* "KeyB" → "B", "Digit1" → "1", "Space" → "Space" */
function keyName(code) { return String(code).replace(/^Key/, "").replace(/^Digit/, ""); }
function hudLesson() {
  if (!run || !run.coach) return;
  var p = null;
  try { p = run.coach.progress(); } catch (e) { fault("Coach.progress", e); }
  var t = p && p.text ? p.text : "";
  if (t !== hc.s) { hc.s = t; setText(hAv, t); setText($("coachProg"), t); }
}

/* ================================================================
   labels, the live region, the banner, the toast
   ================================================================ */
var lblShown = false, lblUntil = 0, lblDodge = false, lblSide = "r";
function labelsAllowed() { return !!run && !run.steady && !!pref("labels"); }
/* a clear's words, as one group: the clear, then Unbroken, Ripple and
   Empty Well beneath it. A second clear inside the window replaces the
   group rather than stacking a tower of words beside the well. */
function labelGroup(n, t0, c0, s0, t1, c1, s1, t2, c2, s2, t3, c3, s3) {
  if (!labelsAllowed()) return;
  if (!lblBand.wide) {
    /* opposite the piece that just landed, so the words never sit on it */
    lblSide = run.lastLockX < 4.5 ? "r" : "l";
    labelsEl.className = lblSide;
  }
  var T = [t0, t1, t2, t3], C = [c0, c1, c2, c3], SC = [s0, s1, s2, s3];
  for (var i = 0; i < 4; i++) {
    var el = LBL[i];
    if (i < n && T[i]) {
      el.textContent = T[i];
      el.className = "lbl on" + (C[i] ? " " + C[i] : "");
      el.style.transform = SC[i] && SC[i] !== 1 ? "scale(" + SC[i].toFixed(3) + ")" : "";
    } else {
      el.className = "lbl";
    }
  }
  lblShown = true;
  lblUntil = clock[FRAME] + LABEL_MS;
}
function labelsTick() {
  if (!lblShown) return;
  if (clock[FRAME] >= lblUntil) {
    for (var i = 0; i < LBL.length; i++) LBL[i].className = "lbl";
    lblShown = false;
    if (lblDodge) { lblDodge = false; labelsEl.classList.remove("dodge"); }
    return;
  }
  /* a falling piece passing under the words: they fade to a whisper */
  if (lblBand.wide || !view || !view.active) return;
  var cs = view.active.cells, d = false;
  for (var k = 0; k < 4; k++) {
    var x = cs[k][0], y = cs[k][1];
    if (y <= lblBand.top + 0.5 && y >= lblBand.bottom - 0.5 && (lblSide === "l" ? x <= 5 : x >= 4)) { d = true; break; }
  }
  if (d !== lblDodge) { lblDodge = d; labelsEl.classList.toggle("dodge", d); }
}
function labelsOff() {
  for (var i = 0; i < LBL.length; i++) LBL[i].className = "lbl";
  lblShown = false;
}

/* The polite live region speaks at most once every two seconds; anything
   that arrives sooner waits, and only the latest waiting line is kept.
   It is the room's one voice: the toast is only seen, and says its words
   here, as a line that is kept (keep) — a clear's word arriving in the
   same moment can wait behind it, but cannot push it out. */
var sayLast = -1e9, sayPending = null, sayKeep = false;
function say(text, keep) {
  if (!text) return;
  var t = now();
  if (t - sayLast >= SAY_GAP) { sayEl.textContent = text; sayLast = t; sayPending = null; sayKeep = false; }
  else if (keep || !sayKeep) { sayPending = text; sayKeep = !!keep; }
}
function sayTick() {
  if (sayPending !== null && clock[FRAME] - sayLast >= SAY_GAP) {
    sayEl.textContent = sayPending; sayLast = clock[FRAME]; sayPending = null; sayKeep = false;
  }
}

/* A depth's name over the well. It sits where it was placed (bannerY),
   and like the labels it fades to a whisper while a falling piece passes
   behind it, so the name of a world never hides the piece in play. */
var bannerUntil = 0, bannerY = 0, bannerDodge = false, bannerRows = { top: 0, bottom: 0 };
function banner(big, sub, ms) {
  bannerBig.textContent = big || "";
  bannerSub.textContent = sub || "";
  bannerEl.classList.add("on");
  bannerUntil = now() + (ms || BANNER_MS);
  if (L && L.cell) {
    bannerRows.top = 22 - (bannerY - L.well.y) / L.cell;
    bannerRows.bottom = bannerRows.top - (bannerEl.offsetHeight || 64) / L.cell;
  }
}
function bannerTick() {
  if (!bannerUntil) return;
  if (clock[FRAME] >= bannerUntil) {
    bannerUntil = 0;
    bannerEl.classList.remove("on");
    if (bannerDodge) { bannerDodge = false; bannerEl.classList.remove("dodge"); }
    return;
  }
  var d = false;
  if (run && view && view.active && state === "play") {
    var cs = view.active.cells;
    for (var i = 0; i < 4; i++) if (cs[i][1] <= bannerRows.top + 0.5 && cs[i][1] >= bannerRows.bottom - 0.5) { d = true; break; }
  }
  if (d !== bannerDodge) { bannerDodge = d; bannerEl.classList.toggle("dodge", d); }
}

/* where a toast goes (placeChrome works both out), and whether the one
   showing is a note for the empty upper well rather than the usual spot */
var toastT = 0, toastIn = false, toastDodge = false;
var toastSpot = { x: 195, y: 10, max: 360 };
var toastWell = { on: false, x: 0, y: 0, max: 0, top: 0, bottom: 0 };
function placeToast() {
  var sp = toastIn && toastWell.on ? toastWell : toastSpot;
  px(toastEl, "left", sp.x); px(toastEl, "top", sp.y); px(toastEl, "maxWidth", sp.max);
}
function toast(text, ms, inWell) {
  toastEl.textContent = text;
  if (!calmNow) say(text, true);
  toastIn = !!inWell;
  toastEl.classList.toggle("inwell", toastIn && toastWell.on);
  placeToast();
  if (toastIn && toastWell.on && L && L.cell) toastWell.bottom = toastWell.top - (toastEl.offsetHeight || 100) / L.cell;
  toastEl.classList.add("on");
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(clearToast, ms || 3400);
}
function clearToast() {
  if (toastT) { clearTimeout(toastT); toastT = 0; }
  toastEl.classList.remove("on");
  if (toastDodge) { toastDodge = false; toastEl.classList.remove("dodge"); }
}
/* the in-well note fades to a whisper while a piece passes under it */
function toastTick() {
  var d = false;
  if (toastIn && toastWell.on && toastT && view && view.active) {
    var cs = view.active.cells;
    for (var i = 0; i < 4; i++) if (cs[i][1] <= toastWell.top + 0.5 && cs[i][1] >= toastWell.bottom - 0.5) { d = true; break; }
  }
  if (d !== toastDodge) { toastDodge = d; toastEl.classList.toggle("dodge", d); }
}
/* Steady shows no text during play (index.html hides the toast and the
   update bar under html.calm); anything shown then waits unseen, and the
   bar comes back by itself at the next pause, rest or end */
var calmNow = false;
function calmTick() {
  var calm = !!run && run.steady && state === "play";
  if (calm !== calmNow) { calmNow = calm; doc.documentElement.classList.toggle("calm", calm); }
}
var lowPowerSaid = false;
/* Low Power Mode is an iPhone, iPad and Mac thing; a steady 30 fps
   anywhere else is just a busy machine, and naming a setting it doesn't
   have would be a puzzle, not a help. Not during Steady's play, where it
   could not be seen: the renderer asks again a minute later. */
function lowPowerChip() {
  if (lowPowerSaid || !APPLE || (run && run.steady && state === "play")) return;
  lowPowerSaid = true;
  toast("Low Power Mode: drawing at 30 fps. Gameplay timing is unaffected.", 5200);
}

/* ================================================================
   the Glass Well — the workings, on the live game
   ================================================================ */
var gBag = [], gPip = [], gBead = [], gLock = $("gLock"), gDas = $("gDas"), gGrav = $("gGrav"),
    gFormula = $("gFormula"), gBreathRow = $("gBreathRow");
var gc = { bag: -1, lock: -1, das: -1, pips: -1, beads: -1, grav: -2, breathRow: null, dodge: false };
var glassBand = { over: false, x1: 0, top: 0, bottom: 0 };
var coachBand = { on: false, top: 0, bottom: 0, dodge: false };
var coachSpot = { side: false, want: 0, min: 0 };
/* the side panel's coach sits low, but never past the bottom of the
   screen, however many lines the coach has to say */
function coachFit() {
  if (!coachSpot.side) return;
  var h = coachEl.offsetHeight || 150;
  px(coachEl, "top", Math.max(coachSpot.min, Math.min(coachSpot.want, vh - safe.b - h - 10)));
}
/* the phone's coach line steps out of the active piece's way */
function coachDodge() {
  var d = false;
  if (coachBand.on && run && run.coach && view && view.active) {
    var cs = view.active.cells;
    for (var i = 0; i < 4; i++) {
      if (cs[i][1] <= coachBand.top + 0.5 && cs[i][1] >= coachBand.bottom - 0.5) { d = true; break; }
    }
  }
  if (d !== coachBand.dodge) { coachBand.dodge = d; coachEl.classList.toggle("dodge", d); }
}
function buildGlass() {
  var bagEl = $("gBag"), pipEl = $("gPips"), beadEl = $("gBeads"), i, s;
  for (i = 1; i <= 7; i++) { s = doc.createElement("span"); s.textContent = NAMES[i]; bagEl.appendChild(s); gBag.push(s); }
  for (i = 0; i < 15; i++) { s = doc.createElement("i"); pipEl.appendChild(s); gPip.push(s); }
  for (i = 0; i < 20; i++) { s = doc.createElement("i"); beadEl.appendChild(s); gBead.push(s); }
}
function glassColours(skin) {
  if (!gBag.length || !Skins || !skin) return;
  var col = null;
  try { col = Skins.resolve(skin, pref("palette")); } catch (e) { fault("Skins.resolve", e); }
  if (!col) return;
  for (var i = 0; i < 7; i++) gBag[i].style.background = col[NAMES[i + 1]] || "#9fb4ff";
}
function setGlass(onOff, fromPlay) {
  glassOn = !!onOff;
  var tog = $("glassToggle");
  if (tog) tog.checked = glassOn;
  showGlass();
  if (glassOn && fromPlay && run && !run.steady && (state === "play" || state === "paused")) observe(EV_GLASS);
  needResize = true;
}
function showGlass() {
  var vis = glassOn && !!run && !run.steady && (state === "play" || state === "paused" || state === "intro" || state === "rest");
  glassEl.classList.toggle("hide", !vis);
  if (vis) { gc.bag = gc.lock = gc.das = gc.pips = gc.beads = gc.grav = -2; gc.breathRow = null; needResize = true; }
}
function glassUpdate() {
  if (!glassOn || !view || glassEl.classList.contains("hide")) return;
  var i, m = 0, b = view.bag, q;
  /* never over the active piece: a whisper while it passes beneath */
  var dodge = false;
  if (glassBand.over && view.active) {
    var cs = view.active.cells;
    for (i = 0; i < 4; i++) {
      if (cs[i][0] < glassBand.x1 && cs[i][1] <= glassBand.top + 0.5 && cs[i][1] >= glassBand.bottom - 0.5) { dodge = true; break; }
    }
  }
  if (dodge !== gc.dodge) { gc.dodge = dodge; glassEl.classList.toggle("dodge", dodge); }
  if (b) for (i = 0; i < b.length; i++) { var ix = typeIx(b[i]); if (ix) m |= 1 << (ix - 1); }
  if (m !== gc.bag) { gc.bag = m; for (i = 0; i < 7; i++) gBag[i].classList.toggle("used", !(m & (1 << i))); }
  q = Math.round(Math.max(0, Math.min(1, view.lock || 0)) * 64);
  if (q !== gc.lock) { gc.lock = q; gLock.style.transform = SCALEX[q]; }
  q = view.lockResets | 0;
  if (q !== gc.pips) { gc.pips = q; for (i = 0; i < 15; i++) gPip[i].classList.toggle("used", i < q); }
  var das = 0;
  if (I) { try { das = +I.dasCharge() || 0; } catch (e) { fault("Input.dasCharge", e); } }
  q = Math.round(Math.max(0, Math.min(1, das)) * 64);
  if (q !== gc.das) { gc.das = q; gDas.style.transform = SCALEX[q]; }
  var gm = -1;
  if (run && run.g) {
    if (view.breath && view.breath.active) gm = -3;
    else { try { gm = Math.round(Well.gravityMs(run.g)); } catch (e) { fault("Well.gravityMs", e); gm = -1; } }
  }
  if (gm !== gc.grav) {
    gc.grav = gm;
    gGrav.textContent = gm === -3 ? "still · Breath" : gm === 0 ? "still" : gm > 0 ? (gm / 1000).toFixed(2) + " s/row" : "—";
  }
  var hasB = !!view.breath;
  if (hasB !== gc.breathRow) { gc.breathRow = hasB; gBreathRow.classList.toggle("hide", !hasB); }
  if (hasB) {
    q = Math.floor(view.breath.charge);
    if (q !== gc.beads) { gc.beads = q; for (i = 0; i < 20; i++) gBead[i].classList.toggle("used", i >= q); }
  }
}
/* "Quad 800 × 4 × 1.5 = 4,800": the real scorer's own numbers, from the
   clear event, so the panel can never disagree with the score */
function formula(ev) {
  var lvl = ev.level || 1, base = +ev.base || 0, ub = +ev.ubBonus || 0, rp = +ev.rippleBonus || 0, ew = +ev.emptyBonus || 0;
  var total = (base + ub + rp + ew) * lvl, s = (ev.label || "Clear") + " ";
  if (!rp && !ew) s += fmtInt(base) + " × " + lvl + (ub ? " × 1.5" : "");
  else {
    s += "(" + fmtInt(base) + (ub ? " × 1.5" : "") + (rp ? " + " + fmtInt(rp) + " Ripple" : "") +
         (ew ? " + " + fmtInt(ew) + " Empty Well" : "") + ") × " + lvl;
  }
  var pts = +ev.points || total;
  if (pts > total) s += " + " + fmtInt(pts - total) + " drop";
  return s + " = " + fmtInt(pts);
}
function toggleGlass() {
  if (!run || run.steady) return;
  setGlass(!glassOn, true);
}

/* ================================================================
   the loop
   ================================================================ */
var rafId = 0;
var perf = root.performance && performance.now ? performance : null;
function frame() {
  rafId = root.requestAnimationFrame(frame);
  /* the frame's times go straight into the typed clock and are read back
     from it below, rather than passed along as arguments: a double handed
     to a function that isn't inlined is boxed on the way in */
  clock[FRAME] = perf ? perf.now() : Date.now();
  clock[DT] = clock[LAST] ? clock[FRAME] - clock[LAST] : 16.7;
  clock[LAST] = clock[FRAME];
  if (clock[DT] > 250) clock[DT] = 250; else if (clock[DT] < 0) clock[DT] = 0;
  try { frameBody(); } catch (e) { fault("frame", e); }
}

function frameBody() {
  var t = clock[FRAME];
  if (needResize) doResize();
  if (pendingSwap2D) swapTo2D("lost");
  if (I) { try { I.poll(); } catch (e) { fault("Input.poll", e); } }
  /* the audio clock pumps on its own timer too; a frame is one more chance
     to keep its look-ahead full */
  if (Music && Music.tick) { try { Music.tick(); } catch (e) { fault("Music.tick", e); } }

  /* the splash's well plays itself only with Motion at Full: it is
     decoration beside the title, with no way to pause it, so Gentle, Still
     and a device that asks for less motion all hold it where it is (it
     carries on from there if the setting comes back to Full) */
  var demoOn = state === "splash" && !!demo.g && motionPref() === "full";
  var live = (state === "play" && run) || demoOn;
  if (live) {
    if (t - clock[SIM] > 250) clock[SIM] = t - 250;
    while (clock[SIM] + TICK <= t) {
      clock[SIM] += TICK;
      if (state === "play" && run) tickRun();
      else if (demoOn) tickDemo();
      else break;
    }
  } else clock[SIM] = t;

  if (state === "play" && run) afterTicks();
  else if (state === "ending" && t >= endAt) showEndCard();
  remindTick();
  calmTick();
  present();
}

/* one 240 Hz tick of a live run */
function tickRun() {
  var r = run, g = r.g;
  if (r.readyMs > 0) {
    /* Forty and Three Minutes: a calm Ready of three soft plucks, and the
       clock waits for the first spawn after it */
    var before = r.readyMs;
    r.readyMs -= TICK;
    if (r.readyShow) {
      if (r.readyMs <= READY_MS) { r.readyShow = false; music("ui", "tap"); banner("Ready", "", READY_MS); }
    } else if ((before >= 1000 && r.readyMs < 1000) || (before >= 500 && r.readyMs < 500)) music("ui", "tap");
    if (r.readyMs <= 0) { r.readyMs = 0; bannerUntil = 1; }
    return;
  }
  /* the clock stops on the tick the run ends: the ticks left in that frame
     come after the last lock, and Forty's time is read to the hundredth */
  if (!r.halted && !g.over) {
    r.elapsedMs += TICK;
    if (I) { try { I.tick(clock[SIM]); } catch (e) { fault("Input.tick", e); } }
  }
  if (r.watching) watchTick();
  if (r.graceMs > 0) r.graceMs -= TICK;
  else { try { Well.step(g, TICK); } catch (e) { fault("Well.step", e); } }
  drainRun(g);
}
function drainRun(g) {
  var evs = null;
  try { evs = Well.drain(g); } catch (e) { fault("Well.drain", e); return; }
  for (var i = 0; i < evs.length; i++) dispatch(evs[i]);
}

/* every engine event, in the SPEC's order: music (which says when its
   note will sound), the renderer (which blooms on that note), the hand,
   the records, the coach, and then the words */
function dispatch(ev) {
  var r = run, t = ev.t;
  ev.sync = musicEvent(ev);
  if (R) { try { R.fx(ev); } catch (e) { fault("R.fx", e); } }
  var hk = hapticFor(ev);
  if (hk) haptic(hk);
  observe(ev);
  if (r.coach) { try { r.coach.event(ev, r.g); } catch (e) { fault("Coach.event", e); } }

  switch (t) {
    case "spawn":
      if (I) { try { I.spawned(clock[SIM]); } catch (e) { fault("Input.spawned", e); } }
      if (r.watching && r.watchType !== null && r.watchType !== ev.type) r.watching = false;
      break;
    case "hard":
      r.lastHard = true;
      break;
    case "lock":
      r.lastHard = false;
      if (ev.cells && ev.cells.length) {
        var sx = 0;
        for (var k = 0; k < ev.cells.length; k++) sx += ev.cells[k][0];
        r.lastLockX = sx / ev.cells.length;
      }
      if (r.coach) hudLesson();
      break;
    case "clear":
      r.askFinish = true;
      onClear(ev);
      break;
    case "twist":
      if (ev.kind === "full" || ev.kind === "mini") {
        var tw = ev.kind === "full" ? "Twist" : "Mini Twist";
        labelGroup(1, tw, "big", 1);
        if (!r.steady) say(tw + ".");
        gFormula.textContent = tw + " = " + fmtInt(ev.points || 0);
      }
      break;
    case "level":
      r.askFinish = true;
      if (r.modeId === "three") say("Level " + ev.level + ".");
      break;
    case "drain":
      r.drains++;
      if (!r.steady) say("The well drains, and settles.");
      break;
    case "breath":
      if (ev.on) { labelGroup(1, "Breath", "", 1); say("Breath. Gravity rests for one long breath."); }
      break;
    case "halt":
      /* Only a well that is halted now, and halted because a chapter or
         Steady's time is up, is resting: a halt still queued from before
         Keep playing or Continue is stale, and a lesson's prepared well
         halts after its one piece while the coach fetches the next. */
      if (r.g.halted && (r.chapterHalting || r.halting)) r.halted = true;
      break;
    case "rewind":
      if (r.coach) hudLesson();
      break;
  }
}

function onClear(ev) {
  var r = run;
  if (r.coach) hudLesson();
  gFormula.textContent = formula(ev);
  if (r.steady) return;
  var main = ev.label || (ev.n === 4 ? "Quad" : ev.n === 3 ? "Triple" : ev.n === 2 ? "Double" : "Single");
  var big = ev.n >= 4 || (ev.twist === "full" && ev.n >= 2);
  var ub = ev.unbroken && ev.unbrokenCount >= 1 ? "Unbroken ×" + ev.unbrokenCount : null;
  var rp = ev.ripple >= 1 ? "Ripple " + ev.ripple : null;
  var rs = rp ? Math.min(1.25, Math.pow(1.05, ev.ripple)) : 1;
  var em = ev.empty ? "Empty Well" : null;
  /* pack the extras up under the clear, skipping the ones that are absent */
  var a = [ub, rp, em], ac = ["small", "small", "big"], as = [1, rs, 1], n = 1;
  var t1 = null, c1 = "", s1 = 1, t2 = null, c2 = "", s2 = 1, t3 = null, c3 = "", s3 = 1;
  for (var i = 0; i < 3; i++) {
    if (!a[i]) continue;
    if (n === 1) { t1 = a[i]; c1 = ac[i]; s1 = as[i]; }
    else if (n === 2) { t2 = a[i]; c2 = ac[i]; s2 = as[i]; }
    else { t3 = a[i]; c3 = ac[i]; s3 = as[i]; }
    n++;
  }
  labelGroup(n, main, big ? "big" : "", 1, t1, c1, s1, t2, c2, s2, t3, c3, s3);
  say(main + "." + (ub ? " " + ub + "." : "") + (rp ? " " + rp + "." : "") + (em ? " Empty Well." : ""));
}

function hapticFor(ev) {
  switch (ev.t) {
    case "rotate": return "rotate";
    case "hard": return "hard";
    case "lock": return run.lastHard ? null : "lock";
    case "hold": return "keep";
    case "twist": return "twist";
    case "clear":
      if (ev.empty) return "empty";
      if (ev.twist === "full" && ev.n >= 2) return "twistBig";
      if (ev.twist && ev.twist !== "none") return "twist";
      return ev.n >= 4 ? "quad" : ev.n === 3 ? "triple" : ev.n === 2 ? "double" : "single";
  }
  return null;
}
function haptic(kind) {
  if (!I) return;
  try { I.haptic(kind); } catch (e) { fault("Input.haptic", e); }
}
function observe(ev) {
  if (!Records || !records || !run) return;
  var got = null;
  try { got = Records.observe(records, ev, rctx); } catch (e) { fault("Records.observe", e); }
  if (got && got.length) {
    for (var i = 0; i < got.length; i++) if (run.newStones.indexOf(got[i]) < 0) run.newStones.push(got[i]);
    run.recordsDirty = true;
  }
}
function appFx(ev, withMusic) {
  ev.sync = withMusic ? musicEvent(ev) : 0;
  if (R) { try { R.fx(ev); } catch (e) { fault("R.fx", e); } }
}

/* once a frame, after the ticks: the things that follow from the state
   rather than from one event */
function afterTicks() {
  var r = run, g = r.g, t = clock[FRAME];
  if (r.modeId === "descent") {
    var d = depthNow();
    if (d !== r.depth) depthChanged(d);
  }
  /* Modes says when a Drift chapter is complete: it is told how many
     chapters this run has finished, and answers "chapter" (a boundary,
     not an ending) once the next one's lines are in */
  fctx.elapsedMs = r.elapsedMs;
  fctx.chapters = r.modeId === "drift" ? Math.max(0, Math.round(r.chapterEnd / r.chapterLen) - 1) : 0;
  /* Modes is asked only when something could have changed its answer —
     an ending, a clear, a level — or once a second for an ending by the
     clock; asking every frame would cost an allocation every frame */
  var fin = null;
  if (Modes && r.mode && r.mode.finish && (g.over || r.askFinish || t - r.askedAt >= 1000)) {
    r.askFinish = false;
    r.askedAt = t;
    try { fin = r.mode.finish(g, fctx); } catch (e) { fault("Modes.finish", e); fin = null; }
  }
  var chapterDue = !!fin && fin.why === "chapter" && !g.over;
  if (fin && fin.why === "chapter") fin = null;
  if (chapterDue && !r.chapterHalting) {
    r.chapterHalting = true;
    try { Well.stopGravity(g, true); } catch (e) { fault("Well.stopGravity", e); }
  }
  if (r.steady && S && !r.halting && !g.over) {
    var st = null;
    try { st = S.tick(r.elapsedMs); } catch (e) { fault("Steady.tick", e); }
    if (st === "timeup") { r.halting = true; r.steadyTimeup = true; r.stopPending = true; }
  }
  /* Steady's time never interrupts a piece: the one in hand falls and
     locks in its own time, with the hands still live, and the well comes
     to rest in the wait before the next one appears */
  if (r.stopPending && !g.active && !g.over) {
    r.stopPending = false;
    try { Well.stopGravity(g, true); } catch (e) { fault("Well.stopGravity", e); }
  }
  /* a save made while the well was resting comes back resting */
  if (g.halted && !r.halted && (r.modeId === "drift" || r.steady)) {
    if (r.modeId === "drift") r.chapterHalting = true; else r.halting = true;
  }
  if ((r.chapterHalting || r.halting) && g.halted) r.halted = true;
  if (r.halted && !r.restShown && !g.over) { restCard(); return; }
  /* a passed lesson's card, a moment after the coach has said so — counted
     in play time, so a pause in that moment only puts it off */
  if (!fin && r.passEndAt && r.elapsedMs >= r.passEndAt) {
    r.passEndAt = 0;
    fin = { why: "pass", title: "Lesson passed", lead: (r.lesson.name || "The lesson") + " — passed. It stays open; come back to it any time." };
  }
  if (fin || g.over) { endRun(fin, t); return; }

  /* a personal best passed mid-run: one soft chime, a mark, no banner */
  if (r.pbScore > 0 && !r.pbPassed && !r.learner && !r.rests && displayScore() > r.pbScore) {
    r.pbPassed = true;
    appFx(EV_PB, true);
    haptic("pb");
    if (hCv && r.modeId !== "three") hCv.classList.add("pb");
    else if (r.modeId === "three") hBv.classList.add("pb");
  }
  /* Forty's pace light: a faint warm rim while ahead of your best */
  if (r.pbTime > 0 && r.modeId === "forty") {
    var lines = g.lines || 0;
    var ahead = r.paceLight && lines > 0 && r.elapsedMs < r.pbTime * lines / r.goal;
    if (ahead !== hc.ahead) { hc.ahead = ahead; paceEl.classList.toggle("on", ahead); }
  }
  if (r.watching && !g.active) r.watching = false;
}

function present() {
  var g = run ? run.g : demo.g, t = clock[FRAME];
  if (!g || !Well) return;
  try { view = Well.view(g, view); } catch (e) { fault("Well.view", e); return; }
  rctx.view = view;
  view.target = run ? run.target : null;
  view.paused = state === "paused";
  view.demo = state === "splash" || (!run && !!demo.g);
  if (R) { try { R.render(view, clock[DT] / 1000, t / 1000); } catch (e) { fault("R.render", e); } }
  if (run) {
    if (state === "play" || state === "paused" || state === "rest" || state === "intro") hudUpdate();
    glassUpdate();
    if (state === "play" && !run.steady && Music) {
      try { Music.setIntensity(view.danger); } catch (e) { fault("Music.setIntensity", e); }
    }
  }
  labelsTick();
  coachDodge();
  toastTick();
  sayTick();
  bannerTick();
}

/* ================================================================
   the splash, and the well playing itself behind it
   ================================================================ */
var demo = { g: null, q: null, qi: 0, target: null, next: 0, steps: 0, held: false };
var DEMO_OPTS = {
  seed: 1, level: 1, gravity: "curve", levelCap: 1, linesPerLevel: 0, lockDelay: 500, moveResets: 15,
  spawnDelay: 140, clearDelay: 320, keep: true, previews: 5, modern: false, irs: false, ihs: false,
  sdf: 20, topOut: "drain", breath: false, scoring: true, timeScale: 1
};
function startDemo() {
  if (!Well) return;
  DEMO_OPTS.seed = newSeed();
  DEMO_OPTS.previews = +pref("previews");
  try { demo.g = Well.create(DEMO_OPTS); } catch (e) { fault("Well.create (demo)", e); demo.g = null; return; }
  demo.q = null; demo.target = null; demo.held = false; demo.next = clock[SIM] + 900;
  /* a fresh well for the renderer too, after whatever dissolved before it */
  appFx(EV_START, false);
  /* the first piece is already there; drain its spawn and plan it */
  var evs = null;
  try { evs = Well.drain(demo.g); } catch (e) { evs = null; }
  if (motionPref() !== "full") { try { settleDemo(); } catch (e) { fault("settleDemo", e); } }
  demoPlan();
}
/* A well that holds still (Motion below Full) is drawn as a well rather
   than an empty shaft: a few of the bot's pieces are placed at once, in
   copies, with nothing drawn or heard for them and stopping short of any
   clear, and nothing is left hanging in the air behind the title. */
function settleDemo() {
  var g = demo.g, kept = null;
  for (var n = 0; n < 12 && g && !g.over; n++) {
    var t = Well.clone(g);
    if (!t.active) { Well.step(t, 1000); Well.drain(t); }
    if (!t.active) break;
    demo.g = t;
    demoPlan();
    for (var k = 0; k < 30 && t.active; k++) demoAct();
    if (t.active) Well.act(t, "hard");
    var evs = Well.drain(t), cleared = t.over;
    for (var i = 0; i < evs.length; i++) if (evs[i].t === "clear") cleared = true;
    if (cleared) break;
    kept = g = t;
  }
  demo.g = kept || g;
  demo.held = false;
}
function stopDemo() { demo.g = null; demo.q = null; demo.target = null; }

/* Bot.plan answers with a route or with a place; either is fine. A list
   of actions is played as it comes; a place is walked towards one press
   at a time, re-reading where the piece really is after every press. */
function demoPlan() {
  var g = demo.g;
  demo.q = null; demo.qi = 0; demo.target = null; demo.steps = 0;
  if (!g || !g.active || !Bot) return;
  var p = null;
  try { p = Bot.plan(g, { style: "quads" }); } catch (e) { fault("Bot.plan", e); p = null; }
  if (!p) return;
  var list = actionList(p) || actionList(p.actions) || actionList(p.inputs) || actionList(p.moves) ||
             actionList(p.keys) || actionList(p.path);
  if (list) { demo.q = list; return; }
  demo.target = { hold: !!(p.hold || p.keep), rot: typeof p.rot === "number" ? p.rot : 0,
                  x: typeof p.x === "number" ? p.x : g.active.x };
}
var ACTIONS = { left: 1, right: 1, cw: 1, ccw: 1, "180": 1, hold: 1, hard: 1, softOn: 1, softOff: 1,
                dasLeft: 1, dasRight: 1 };
function actionList(x) {
  if (!x || typeof x !== "object" || typeof x.length !== "number" || !x.length) return null;
  for (var i = 0; i < x.length; i++) if (!ACTIONS[x[i]]) return null;
  return x;
}
function demoAct() {
  var g = demo.g, a = null, wait = 105;
  if (!g.active) return;
  if (demo.q) {
    a = demo.qi < demo.q.length ? demo.q[demo.qi++] : "hard";
    if (a === "hold") wait = 260;
  } else if (demo.target) {
    var tg = demo.target, cur = g.active;
    demo.steps++;
    if (tg.hold && !g.holdUsed) { a = "hold"; tg.hold = false; wait = 260; }
    else if (demo.steps > 14) a = "hard";
    else if (cur.rot !== tg.rot) a = ((tg.rot - cur.rot + 4) % 4) === 3 ? "ccw" : "cw";
    else if (cur.x < tg.x) a = "right";
    else if (cur.x > tg.x) a = "left";
    else a = "hard";
  } else a = "hard";
  if (a === "hard") wait = 420;
  demo.held = a === "hold";
  try { Well.act(g, a); } catch (e) { fault("Well.act (demo)", e); }
  /* walking to a place: the piece that came out of Keep needs its own */
  if (a === "hold" && !demo.q) demoPlan();
  demo.next = clock[SIM] + wait;
}
function tickDemo() {
  var g = demo.g;
  try { Well.step(g, TICK); } catch (e) { fault("Well.step (demo)", e); stopDemo(); return; }
  var evs = null;
  try { evs = Well.drain(g); } catch (e) { evs = null; }
  if (evs) {
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      ev.sync = 0;
      /* the picture only: the splash's well makes no sound of its own and
         earns nothing — those Quads are the bot's, not yours */
      if (R) { try { R.fx(ev); } catch (e) { fault("R.fx", e); } }
      /* a spawn that is the Keep swap belongs to the plan already running */
      if (ev.t === "spawn") {
        if (demo.held) demo.held = false;
        else { demoPlan(); demo.next = clock[SIM] + 380; }
      }
    }
  }
  if (g.over) { startDemo(); return; }
  if (clock[SIM] >= demo.next && g.active) demoAct();
}

/* The splash's doors. Continue is the run left last. "Enter the well" is
   Descent, so while a Descent is saved it would quietly throw that one
   away, one button from Continue, with no "are you sure?" by design: it
   goes. A saved Descent that isn't the run left last gets its own
   Continue in that place instead; starting Descent afresh is a deliberate
   choice in Modes ("Begin again"), never a slip on the splash. */
function splashRefresh() {
  var last = saves && saves.last && saves.runs[saves.last] ? saves.last : null;
  var desc = !!(saves && saves.runs.descent);
  var cont = $("goContinue"), play = $("goPlay");
  if (last) {
    var m = modeOf(last);
    cont.textContent = "Continue · " + (m ? m.name : last);
    cont.classList.remove("hide");
  } else cont.classList.add("hide");
  play.classList.toggle("hide", desc && last === "descent");
  play.textContent = desc ? "Continue · " + ((modeOf("descent") || {}).name || "Descent") : "Enter the well";
  play.classList.toggle("primary", !last);
  var note = "";
  if (webglOk === false && !HAS_AUDIO && APPLE) note = "Lockdown Mode is on, so here is the quiet version.";
  else if (!R) note = "This browser couldn't draw the well. Reloading the page sometimes helps.";
  else if (!HAS_AUDIO) note = "This browser can't play sound here, so the well is a quiet one.";
  else if (webglOk === false && !forced2D()) note = "This is the 2D well: this browser can't draw the 3D one.";
  $("spNote").textContent = note;
}

var swDeferred = false;
function toSplash() {
  if (swDeferred) { swDeferred = false; saveAll(); location.reload(); return; }
  var was = run;
  if (run && run.coach) { try { run.coach.stop(); } catch (e) { fault("Coach.stop", e); } }
  run = null;
  state = "splash";
  doc.documentElement.classList.remove("playing");
  btnMenu.classList.add("off");
  hudEl.classList.add("off");
  btnBreath.classList.add("hide");
  coachEl.classList.add("off");
  paceEl.classList.remove("on");
  chip.classList.add("hide");
  hideVeil();
  labelsOff();
  bannerUntil = 1;
  showGlass();
  setPad(false);
  freeScreen();
  resetInput();
  if (was) { music("stop"); music("calm", false); }
  splashMusic = false;
  applyAudio();
  closeSheet("ovMenu");
  closeSheet("ovChapter");
  rctx.modeId = ""; rctx.g = null; rctx.opts = null;
  setWorld("dawn", false, true);
  applyRenderOpts();
  splashRefresh();
  splash.classList.remove("gone");
  startDemo();
  needResize = true;
  focusSplash();
}

/* ================================================================
   runs
   ================================================================ */
function modeOf(id) {
  if (!Modes) return null;
  try { return Modes.get(id); } catch (e) { fault("Modes.get", e); return null; }
}
/* the menu's options for each mode, and the settings that remember them */
var PREFMAP = {
  descent: { pace: "descentPace" },
  forty: { lines: "fortyLines" },
  drift: { tide: "driftTide", chapter: "driftChapter", world: "driftWorld" },
  steady: { length: "steadyLength", pace: "steadyPace", landing: "steadyLanding", sound: "steadySound", world: "steadyWorld" }
};
function optsFor(modeId, over) {
  var m = modeOf(modeId), o = {}, k;
  if (m && m.options) for (k in m.options) o[k] = m.options[k];
  var map = PREFMAP[modeId];
  if (map) for (k in map) { var v = pref(map[k]); if (v !== undefined && v !== null) o[k] = v; }
  if (over) for (k in over) o[k] = over[k];
  return o;
}
function newSeed() {
  var v = 0;
  try {
    var c = root.crypto || root.msCrypto, a = new Uint32Array(1);
    c.getRandomValues(a);
    v = a[0];
  } catch (e) { v = Math.floor(Math.random() * 4294967296); }
  /* a well code carries thirty bits */
  v = v & 0x3fffffff;
  return v || 1;
}
function codeOf(seed) {
  if (Modes && Modes.code) { try { return Modes.code.encode(seed); } catch (e) { fault("Modes.code.encode", e); } }
  return "";
}
/* a lesson (Modes.LESSONS) or a silt challenge (Modes.SILT), by id */
function findChallenge(id) {
  if (!Modes || !Modes.lesson) return null;
  try { return Modes.lesson(id); } catch (e) { fault("Modes.lesson", e); return null; }
}
/* the key a challenge's best is kept under, as Modes names it */
function challengeKey(id) {
  var m = modeOf("challenges");
  try { return m && m.pbKey ? m.pbKey({ id: id }) : null; } catch (e) { fault("Modes.pbKey", e); return null; }
}
function levelAtDepth(pace, d) { return pace === "swift" ? d + 5 : d; }
/* Drift's tide is Modes' table, the same one its engine options come
   from, so the slider, the sheet and the falling piece always agree */
function tideMs(n) {
  var t = null;
  if (Modes && Modes.tide) { try { t = Modes.tide(n); } catch (e) { fault("Modes.tide", e); } }
  return t ? t.ms : 0;
}
function tideLevel(n) {
  var t = null;
  if (Modes && Modes.tide) { try { t = Modes.tide(n); } catch (e) { t = null; } }
  return t ? t.level : Math.max(1, n | 0);
}

/* The engine's options: the player's handling, then the mode's (which for
   a challenge includes the lesson's own block from modes.js), then the
   coach's — the same block, plus which prepared well it has reached — then
   whatever this particular start needs. Each later layer wins, so a lesson
   that wants Keep off or no previews gets them whatever the settings say. */
function engineOptions(mode, o, seed, coach, lesson, from) {
  var eo = {}, k, base = null;
  eo.keep = !!pref("keep");
  eo.modern = !!pref("modern");
  eo.irs = !!pref("irs");
  eo.ihs = !!pref("ihs");
  var sdf = pref("sdf");
  eo.sdf = (sdf === "inf" || sdf === Infinity) ? Infinity : (+sdf || 20);
  eo.previews = +pref("previews");
  /* the mode's own options win where a mode has to decide: a lesson that
     turns Keep off, a prepared well with no previews */
  if (mode && mode.engine) { try { base = mode.engine(o); } catch (e) { fault("Modes.engine", e); } }
  if (base) for (k in base) eo[k] = base[k];
  eo.seed = seed;
  var ts = +pref("learner") || 1;
  if (ts < 1) eo.timeScale = ts;
  if (coach && lesson) {
    var ov = null;
    try { ov = coach.engineOpts(lesson); } catch (e) { fault("Coach.engineOpts", e); }
    if (ov) for (k in ov) eo[k] = ov[k];
  }
  if (from && from.engine) for (k in from.engine) eo[k] = from.engine[k];
  return eo;
}

function makeCoach(lesson) {
  if (!Coach || !lesson) return null;
  try {
    return Coach.create({
      onTarget: function (cells) { if (run) run.target = cells || null; },
      onSay: function (text, kind) { coachSay(text, kind); },
      onPass: function (id) { lessonPassed(id); },
      onRewind: function () { if (run && run.g) { try { Well.rewind(run.g); } catch (e) { fault("Well.rewind", e); } } },
      onNext: function (opts) { nextWell(opts); },
      /* corrections are said in the hand in use: gestures or keys */
      device: function () { return device; }
    });
  } catch (e) { fault("Coach.create", e); return null; }
}

function startRun(modeId, opts, from) {
  from = from || {};
  var mode = modeOf(modeId);
  if (!Well || !mode) { toast("That part of the well didn't load. Reloading the page usually brings it back.", 4800); return; }
  if (run) leaveQuietly();
  /* each run starts from what is stored, which another tab may have added to */
  loadRecords();
  stopDemo();
  hideChip();
  var o = optsFor(modeId, opts);
  var seed = from.seed != null ? from.seed : (pendingSeed != null ? pendingSeed : newSeed());
  /* a typed code deals one run; the field is emptied so the next visit to
     Modes doesn't seem to promise the same pieces again */
  clearCode();
  var lesson = null, coach = null;
  if (modeId === "challenges") {
    lesson = findChallenge(o.id || o.lesson);
    if (lesson) { o.id = lesson.id; o.lesson = lesson.id; }
    coach = makeCoach(lesson);
  }
  var eo = engineOptions(mode, o, seed, coach, lesson, from);
  var g = from.g || null;
  if (!g) {
    try { g = Well.create(eo); } catch (e) { fault("Well.create", e); toast("The well couldn't be filled just now.", 3600); toSplash(); return; }
  }
  var steady = modeId === "steady";
  var ts = +pref("learner") || 1;
  run = {
    modeId: modeId, mode: mode, opts: o, seed: seed, code: codeOf(seed), g: g, eo: eo,
    lesson: lesson, coach: coach, steady: steady,
    timed: modeId === "forty" || modeId === "three",
    elapsedMs: from.elapsedMs || 0, readyMs: 0, readyShow: false, graceMs: 0,
    rests: from.rests || 0, linesBase: from.linesBase || 0, scoreBase: from.scoreBase || 0,
    depth: from.depth || 1, depthLines: from.linesBase || 0,
    /* the score a depth began with, which Begin again restores: kept in the
       save, or else (an older save, or a run begun again from a depth) the
       score this run was handed */
    depthScore: finite(from.depthScore, finite(from.scoreBase, 0)),
    world: "dawn", tide: +o.tide || 0,
    chapterLen: +o.chapter || 40, chapterEnd: from.chapterEnd || (+o.chapter || 40),
    chapterHalting: false, halting: !!from.stopPending, halted: false, restShown: false,
    steadyTimeup: !!from.stopPending, stopPending: !!from.stopPending, passEndAt: 0,
    learner: from.learner !== undefined ? !!from.learner : ts < 1, hint: !!from.hint,
    newStones: [], recordsDirty: false, lastHard: false, lastLockX: 4.5, drains: 0,
    goal: +o.lines || (eo.goalLines | 0) || 40, timeLimit: +eo.timeLimit || 180000,
    pbScore: 0, pbTime: 0, pbPassed: false, target: null, watching: false, watchType: null, watchNext: 0,
    passed: false, fin: null, why: "", result: null, surface: false, askFinish: true, askedAt: 0,
    paceLight: !!pref("pbPace")
  };
  /* the world: the mode says, Descent by depth */
  var wid = null;
  try { wid = mode.world ? mode.world(o, run.depth) : null; } catch (e) { fault("Modes.world", e); }
  run.world = wid || o.world || (Worlds && Worlds.at ? (Worlds.at(run.depth) || {}).id : null) || "dawn";

  /* what this run is racing: a best, quietly, if there is one */
  var key = null;
  try { key = mode.pbKey ? mode.pbKey(o) : null; } catch (e) { key = null; }
  var best = key ? bestOf(key) : null;
  if (best && best.value > 0) {
    if (mode.pbBetter === "low") run.pbTime = best.value; else run.pbScore = best.value;
  }

  if (run.scoreBase && g.score >= run.scoreBase) run.scoreBase = 0;
  rctx.modeId = modeId; rctx.opts = o; rctx.g = g; rctx.view = view;
  /* the view still carries the splash's demo flag until the next frame, and
     Records ignores anything the demo does: this run's first moments (its
     world, the Glass Well already open) are the player's */
  if (view) { view.demo = false; view.paused = false; }
  fctx.opts = o; fctx.elapsedMs = run.elapsedMs;

  if (coach) {
    /* cleared first: the coach's opening line arrives during start() */
    $("coachText").textContent = "";
    $("coachName").textContent = lesson.name || "Lesson";
    coachEl.classList.remove("off");
    try { coach.start(lesson, g); } catch (e) { fault("Coach.start", e); }
  } else coachEl.classList.add("off");

  /* the room changes for play; the splash takes a moment to fade (see
     beginPlay) */
  var fromSplash = !splash.classList.contains("gone");
  splash.classList.add("gone");
  doc.documentElement.classList.add("playing");
  btnMenu.classList.remove("off");
  hideVeil();
  labelsOff();
  paceEl.classList.remove("on");
  hudSetup();
  if (coach) hudLesson();
  applyRenderOpts();
  applyAudio();
  setWorld(run.world, false, true);
  music("calm", steady);
  music("start");
  appFx(EV_START, true);
  EV_WORLD.world = run.world;
  observe(EV_WORLD);
  setPad(true);
  showGlass();
  needResize = true;
  replaceHistory();
  resetInput();

  /* the first time, four cards: one idea each. Never in Steady, whose own
     tip card has just been read and which shows no text during play; the
     next run of anything else shows them instead. */
  var cards = device === "touch" ? !seen("touchCards") : !seen("intro");
  if (from.restore || steady) cards = false;
  if (!steady) markSeen("intro");
  if (cards) { state = "intro"; openCards(); }
  else beginPlay(!!from.restore, fromSplash ? SPLASH_FADE_MS : 0);
}

/* wait: how long the splash still has to fade (0 after the cards). The
   first things to read — Ready, a depth's name — and the first fall all
   wait for it, so nothing new appears through the title on its way out. */
function beginPlay(resumed, wait) {
  if (!run) return;
  var r = run;
  wait = wait || 0;
  state = "play";
  if (r.timed) startReady(wait);
  else if (resumed) grace();
  else if (wait) r.graceMs = wait;
  /* a Descent names the world it begins in, as every later depth does */
  if (r.modeId === "descent" && !resumed) {
    var nm = worldName(r.world);
    if (wait) setTimeout(function () { if (run === r && state === "play") banner(nm, "Depth " + r.depth, BANNER_MS); }, wait);
    else banner(nm, "Depth " + r.depth, BANNER_MS);
    say("Depth " + r.depth + ", " + nm + ".");
  }
  holdScreen();
  showGlass();
  /* the Glass Well switched on before the run counts as looking inside
     the moment the run is played with it */
  if (glassOn && !run.steady) observe(EV_GLASS);
  lastToggle = now();
  /* a few things worth saying exactly once — never in Steady, which shows
     no text during play; they wait for the next run of anything else */
  if (!r.steady) {
    if (IOS && HAS_AUDIO && !seen("silentChip")) {
      markSeen("silentChip");
      setTimeout(function () { toast("No sound? Your iPhone may be on silent.", 4200); }, 1400);
    } else if (TOUCH && vw > vh && vh < 520 && !seen("landscape")) {
      markSeen("landscape");
      toast("Turn your phone upright for a bigger well.", 4200);
    }
  }
}
/* Forty and Three Minutes: a calm Ready of three soft plucks, after the
   splash has faded if it was still there */
function startReady(wait) {
  run.readyMs = READY_MS + (wait || 0);
  run.readyShow = !!wait;
  if (!wait) { music("ui", "tap"); banner("Ready", "", READY_MS); }
}
function grace() {
  if (!run) return;
  if (run.timed) { startReady(); return; }
  /* the engine holds gravity and the lock for us when it knows how;
     otherwise the app simply doesn't step it for the same 600 ms */
  if (Well.grace) { try { Well.grace(run.g, GRACE_MS); run.graceMs = 0; return; } catch (e) { fault("Well.grace", e); } }
  run.graceMs = GRACE_MS;
}

/* ---------- pause and resume ---------- */
function pause(how) {
  if (state !== "play" || !run) return false;
  state = "paused";
  lastToggle = now();
  resetInput();
  music("pause", true);
  appFx(EV_PAUSE, false);
  freeScreen();
  saveRun();
  saveRecords();
  labelsOff();
  showVeil("Paused · tap to return");
  if (how !== "quiet") openMenu();
  say("Paused.");
  return true;
}
function resume() {
  if (state !== "paused" || !run) return;
  closeAllSheets();
  hideVeil();
  state = "play";
  lastToggle = now();
  music("pause", false);
  appFx(EV_RESUME, false);
  grace();
  holdScreen();
  replaceHistory();
}
/* paused with nothing open but the pause sheet itself: the pause key
   (or the pad's Menu button) is a plain toggle back to the game */
function onlyMenuOpen() { return sheetsOpen === 0 || (sheetsOpen === 1 && isOpen("ovMenu")); }
function togglePauseFromUI() {
  if (now() - lastToggle < 280) return;
  if (state === "play") pause("menu");
  else if (state === "paused" && onlyMenuOpen()) resume();
}

/* ---------- saving ---------- */
function loadSaves() {
  var s = storeGet("save");
  saves = (s && typeof s === "object" && s.runs && typeof s.runs === "object" && !Array.isArray(s.runs)) ? s : { v: 1, last: null, runs: {} };
}
/* Another tab of the room may have saved or put away a run of its own
   since this one looked: every write starts from what is stored now, so
   it changes only this tab's mode and never puts back a save that tab
   removed. (Prefs keeps its copy of the store fresh across tabs, so this
   costs a copy, not a read.) */
function saveRun() {
  var r = run;
  if (!r || !r.mode || !r.mode.resumable || !Well) return;
  if (state === "ending" || state === "over" || r.g.over) return;
  loadSaves();
  var snap = null;
  try { snap = Well.serialize(r.g); } catch (e) { fault("Well.serialize", e); return; }
  saves.runs[r.modeId] = {
    v: 1, modeId: r.modeId, opts: r.opts, seed: r.seed, state: snap, elapsedMs: r.elapsedMs,
    rests: r.rests, linesBase: r.linesBase, scoreBase: r.scoreBase, depth: r.depth,
    depthScore: r.depthScore, chapterEnd: r.chapterEnd, learner: r.learner, hint: r.hint,
    stopPending: !!r.stopPending
  };
  saves.last = r.modeId;
  storePut("save", saves);
}
function clearSave(modeId) {
  loadSaves();
  if (!saves || !saves.runs[modeId]) return;
  delete saves.runs[modeId];
  if (saves.last === modeId) {
    saves.last = null;
    for (var k in saves.runs) { saves.last = k; break; }
  }
  storePut("save", saves);
}
/* a number from a save, or the default when the save holds anything else */
function finite(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
function continueRun(modeId) {
  var s = saves && saves.runs[modeId];
  if (!s || !Well) return;
  var g = null;
  try { g = Well.restore(s.state); } catch (e) { fault("Well.restore", e); g = null; }
  if (!g) {
    clearSave(modeId);
    splashRefresh();
    toast("That saved well couldn't be read, so it has been put away.", 4200);
    return;
  }
  /* a save keeps the engine exactly, held soft drop included; no finger is
     on the glass after a reload, so let it go */
  try { Well.act(g, "softOff"); Well.drain(g); } catch (e) { fault("Well.act (restore)", e); }
  startRun(modeId, s.opts, {
    g: g, seed: s.seed, restore: true, elapsedMs: finite(s.elapsedMs, 0), rests: finite(s.rests, 0), linesBase: finite(s.linesBase, 0),
    scoreBase: finite(s.scoreBase, 0), depth: Math.max(1, Math.min(10, finite(s.depth, 1) | 0)),
    depthScore: s.depthScore, chapterEnd: finite(s.chapterEnd, 0), learner: s.learner, hint: s.hint,
    stopPending: !!s.stopPending
  });
}
function loadRecords() {
  var d = storeGet("records");
  records = (d && typeof d === "object" && !Array.isArray(d)) ? d : (Records ? Records.blank() : {});
  if (Records && Records.ensure) { try { records = Records.ensure(records); } catch (e) { fault("Records.ensure", e); } }
  lifeBase = lifeOf(records);
}
/* The records are written whole, and another tab of the room may have
   written its own since this one read them: Records.merge folds what is
   stored into ours first, so the last tab to write never undoes a best,
   a Stone or a run the other one recorded (records.js says how). */
var lifeBase = null;
function lifeOf(d) {
  var out = {}, l = d && d.life;
  if (l) for (var k in l) if (typeof l[k] === "number") out[k] = l[k];
  return out;
}
function saveRecords() {
  if (!records) return;
  var disk = storeGet("records");
  if (disk && Records && Records.merge) {
    try { Records.merge(records, disk, lifeBase); } catch (e) { fault("Records.merge", e); }
  }
  storePut("records", records);
  lifeBase = lifeOf(records);
  if (run) run.recordsDirty = false;
}
function bestOf(key) {
  if (!Records || !records || !key) return null;
  try { return Records.best ? Records.best(records, key) : null; } catch (e) { fault("Records.best", e); return null; }
}

/* ---------- leaving ---------- */
/* Leave saves a resumable mode, or ends a timed one; no "are you sure?" */
function leaveQuietly() {
  var r = run;
  if (!r) return;
  if (r.mode && r.mode.resumable && !r.g.over) saveRun();
  else if (state !== "ending" && state !== "over") finishRecords(r, "leave");
  if (r.recordsDirty) saveRecords();
  if (r.coach) { try { r.coach.stop(); } catch (e) { fault("Coach.stop", e); } }
}
function leaveRun() {
  if (!run) { closeAllSheets(); return; }
  leaveQuietly();
  closeAllSheets();
  toSplash();
}

/* ---------- Descent: depths and the Surface ---------- */
function depthNow() {
  var d = 1 + Math.floor(totalLines() / 25);
  return d > 10 ? 10 : d < 1 ? 1 : d;
}
function depthChanged(d) {
  var r = run;
  r.depth = d;
  r.depthScore = displayScore();
  r.depthLines = totalLines();
  var wid = null;
  try { wid = r.mode.world ? r.mode.world(r.opts, d) : null; } catch (e) { fault("Modes.world", e); }
  if (!wid && Worlds && Worlds.at) { var w = Worlds.at(d); wid = w ? w.id : null; }
  wid = wid || "dawn";
  r.world = wid;
  setWorld(wid, false, false);
  var name = worldName(wid);
  /* the world's name large and the depth beneath it: two short lines
     always fit over the well, where one long one ran into the previews */
  banner(name, "Depth " + d, BANNER_MS);
  say("Depth " + d + ", " + name + ".");
  EV_WORLD.world = wid;
  appFx(EV_WORLD, false);
  observe(EV_WORLD);
  haptic("world");
  setText(hAk, "Depth " + d + (r.learner ? " · learner speed" : ""));
  setText(hAv, name);
  remindBoundary("depth");
}

/* ---------- Drift's chapters, and Steady's time ---------- */
function restCard() {
  var r = run;
  r.restShown = true;
  state = "rest";
  freeScreen();
  resetInput();
  labelsOff();
  if (r.steady) {
    if (S) { try { S.timeUp(); } catch (e) { fault("Steady.timeUp", e); } }
    return;
  }
  appFx(EV_CHAPTER, true);
  var n = Math.round((r.chapterEnd) / r.chapterLen);
  $("chapterTitle").textContent = "Chapter complete · " + r.chapterLen + " lines";
  $("chapterLead").textContent = (n > 1 ? "That's chapter " + n + ". " : "") +
    "The well is still. Rest here, or carry on with the board just as it is." + remindLine("chapter");
  say("Chapter complete.");
  saveRun();
  openSheet("ovChapter", "chapterRest");
}
function reopenRest() {
  if (!run || state !== "rest") return;
  if (run.steady) { if (S) { try { S.timeUp(); } catch (e) { fault("Steady.timeUp", e); } } }
  else openSheet("ovChapter", "chapterRest");
}
function continueAfterRest() {
  var r = run;
  if (!r || state !== "rest") return;
  if (r.modeId === "drift") r.chapterEnd += r.chapterLen;
  r.chapterHalting = false; r.halting = false; r.halted = false; r.restShown = false; r.stopPending = false;
  try { Well.resume(r.g); } catch (e) { fault("Well.resume", e); }
  closeSheet("ovChapter");
  hideVeil();
  state = "play";
  lastToggle = now();
  grace();
  holdScreen();
}

/* ---------- Challenges: the coach ---------- */
var coachHideT = 0;
function coachSay(text, kind) {
  if (!text) return;
  $("coachText").textContent = text;
  coachFit();
  say(text);
  if (coachEl.classList.contains("compact")) {
    coachEl.classList.remove("quiet");
    if (coachHideT) clearTimeout(coachHideT);
    coachHideT = setTimeout(function () { coachEl.classList.add("quiet"); coachHideT = 0; }, kind === "pass" ? 6000 : 4200);
  }
}
function lessonPassed(id) {
  var r = run;
  if (!r) return;
  r.passed = true;
  var hinted = r.hint;
  try { if (r.coach && r.coach.hinted && r.coach.hinted()) hinted = true; } catch (e) { hinted = r.hint; }
  r.hint = hinted;
  EV_PASS.lesson = id; EV_PASS.hint = hinted;
  observe(EV_PASS);
  saveRecords();
  /* Fewest Moves carries on as a free-stacking audit; the others are done,
     and get their card a moment after the coach has said so */
  var kind = r.lesson && r.lesson.kind;
  if (kind === "finesse") return;
  r.passEndAt = r.elapsedMs + 1600;
}
/* the Twist Slot lesson's next prepared well */
function nextWell(opts) {
  var r = run;
  if (!r || !r.coach || !Well) return;
  var eo = copyObj(r.eo), k;
  if (opts) for (k in opts) eo[k] = opts[k];
  eo.seed = newSeed();
  var g = null;
  try { g = Well.create(eo); } catch (e) { fault("Well.create (next well)", e); return; }
  r.g = g; r.eo = eo; rctx.g = g;
  r.target = null; r.watching = false;
  try { r.coach.start(r.lesson, g); } catch (e) { fault("Coach.start", e); }
  appFx(EV_START, false);
  hudLesson();
}
function coachHint() {
  var r = run;
  if (!r || !r.coach) return;
  var d = null;
  try { d = r.coach.hint(r.g); } catch (e) { fault("Coach.hint", e); }
  r.hint = true;
  if (d) {
    if (d.cells) r.target = d.cells;
    var words = d.text || "";
    if (d.words) words += (words ? " " : "") + (typeof d.words === "string" ? d.words : d.words.join ? d.words.join(" ") : "");
    if (words) coachSay(words, "tip");
  }
  hudLesson();
}
/* Watch: the coach re-plans every step from wherever the piece really is */
function coachWatch() {
  var r = run;
  if (!r || !r.coach || !r.g.active) return;
  r.hint = true;
  try { if (r.coach.solution) r.coach.solution(r.g); } catch (e) { fault("Coach.solution", e); }
  r.watching = true;
  r.watchType = r.g.active.type;
  r.watchNext = clock[SIM] + 300;
}
function watchTick() {
  var r = run;
  if (clock[SIM] < r.watchNext || !r.g.active) return;
  r.watchNext = clock[SIM] + WATCH_STEP;
  var a = null;
  try { a = r.coach.next ? r.coach.next(r.g) : null; } catch (e) { fault("Coach.next", e); a = null; }
  if (!a) { r.watching = false; return; }
  try {
    if (Coach.apply) Coach.apply(r.g, a);
    else if (a !== "down") Well.act(r.g, a);
  } catch (e) { fault("Coach.apply", e); r.watching = false; }
  if (a === "hard") r.watching = false;
}

/* ---------- the end of a run ---------- */
var endAt = 0;
function endRun(fin, t) {
  var r = run;
  if (!r || state === "ending" || state === "over") return;
  var g = r.g;
  /* the numbers behind the card are the final ones */
  hudUpdate();
  r.fin = fin || null;
  /* One vocabulary (modes.js, "Endings"): Modes' word when it has one,
     the app's own for the endings it chose ("rest", "pass"), and the
     engine's only if neither spoke. records.js keeps its books on the
     same words. */
  r.why = (fin && fin.why) || (g.over ? g.overWhy : "") || "end";
  r.surface = r.modeId === "descent" && r.why === "surface";
  state = "ending";
  lastRun = r;
  resetInput();
  r.watching = false;
  freeScreen();
  labelsOff();
  paceEl.classList.remove("on");
  if (!g.over) { try { Well.stopGravity(g, true); } catch (e) { fault("Well.stopGravity", e); } }
  if (r.surface) {
    /* the Surface: the stack rises as light, the sky goes back to Dawn, and
       the music resolves home */
    appFx(EV_SURFACE, true);
    setWorld("dawn", false, false);
  } else {
    EV_END.why = r.why;
    appFx(EV_END, true);
  }
  r.result = finishRecords(r, r.why);
  clearSave(r.modeId);
  endAt = (t || now()) + (r.surface ? SURFACE_MS : END_MS);
  btnMenu.classList.add("off");
  btnBreath.classList.add("hide");
  showGlass();
  say(r.surface ? "The Surface." : "The well rests.");
}
function finishRecords(r, why) {
  var res = null;
  r.why = why;
  if (Records && records) {
    var rr = {
      modeId: r.modeId, opts: r.opts, g: r.g, elapsedMs: r.elapsedMs, rests: r.rests,
      learner: r.learner, hint: r.hint, why: why, lesson: r.lesson ? r.lesson.id : null,
      passed: r.passed, scoreBase: r.scoreBase, linesBase: r.linesBase, code: r.code,
      scoreHidden: !!pref("scoreHidden")
    };
    try { res = Records.finishRun(records, rr); } catch (e) { fault("Records.finishRun", e); res = null; }
    if (res && !res.card && Records.card) { try { res.card = Records.card(rr); } catch (e) { fault("Records.card", e); } }
    saveRecords();
  }
  if (!res) res = { pb: false, prev: null, medal: null, newStones: [], card: [], notes: [] };
  return res;
}
function topOut(why) { return why === "block" || why === "lock" || why === "silt" || why === "filled"; }

function showEndCard() {
  var r = lastRun;
  state = "over";
  if (!r) { toSplash(); return; }
  var res = r.result || { card: [], notes: [], newStones: [] };
  var fin = r.fin || {};
  /* the mode's own words when it has them; the room's when it doesn't */
  var title = fin.title, lead = fin.lead;
  var filled = topOut(r.why);
  /* at Depth 1 (and at Gentle pace, which drains rather than fills),
     beginning again from this depth is simply Again, so it isn't offered */
  var depthRow = r.modeId === "descent" && filled && r.opts.pace !== "gentle" && r.depth > 1;
  if (r.modeId === "descent" && filled && !depthRow && /this depth/.test(lead || "")) lead = "Rest for a moment, or begin again.";
  if (r.surface) { title = title || "The Surface"; lead = lead || "Ten depths down, and back up into the dawn."; }
  else if (filled) {
    title = title || "The well rests.";
    lead = lead || (r.modeId === "forty" ? "The well filled. Rest, or begin again." : "The well filled. Rest for a moment, or begin again.");
  } else {
    title = title || "The well rests.";
    if (!lead) lead = r.modeId === "three" && r.why === "time" ? "Three minutes, gone by." : "";
  }
  $("endTitle").textContent = title;
  /* Records' plain notes ("with 1 rest", "learner speed") read as plain
     sentences after the lead: facts, never a judgement */
  var notes = [], i;
  if (res.notes) for (i = 0; i < res.notes.length; i++) if (res.notes[i] !== "New personal best") notes.push(sentence(res.notes[i]));
  $("endLead").textContent = lead + (notes.length ? (lead ? " " : "") + notes.join(" ") : "") + remindLine("end");

  var pbEl = $("endPb");
  var pbText = res.pb ? "New personal best" : "";
  if (res.medal && res.medal !== "Reached the Surface") pbText += (pbText ? " · " : "") + (res.medalNew ? "A new medal: " : "Medal: ") + res.medal;
  else if (res.medal) pbText += (pbText ? " · " : "") + "Reached the Surface at " + paceName(r.opts.pace) + " pace";
  pbEl.textContent = pbText;
  pbEl.classList.toggle("hide", !pbText);
  if (res.pb) { appFx(EV_PB, true); haptic("pb"); }

  /* at most eight numbers, large; the first is the one that matters */
  var html = "", strip = "", card = res.card || [];
  for (i = 0; i < card.length; i++) {
    var it = card[i];
    if (it.kind === "strip") {
      var parts = it.strip || [];
      for (var j = 0; j < parts.length; j++) {
        strip += "<span><b>" + esc(parts[j].n) + "</b> " + esc(parts[j].n !== 1 && parts[j].plural ? parts[j].plural : parts[j].label) + "</span>";
      }
      if (!parts.length) strip += "<span>" + esc(it.value) + "</span>";
      continue;
    }
    html += '<div class="' + (i === 0 ? "main" : "") + '" title="' + esc(it.tip || "") + '"><small>' + esc(it.label) +
            '</small><b>' + esc(typeof it.value === "number" ? fmtInt(it.value) : it.value) + "</b>" +
            (it.tip ? '<span class="vh">. ' + esc(it.tip) + "</span>" : "") + "</div>";
  }
  $("endCard").innerHTML = html;
  $("endStrip").innerHTML = strip;

  var stones = [], seenIds = {}, all = (res.newStones || []).concat(r.newStones || []);
  for (i = 0; i < all.length; i++) {
    if (seenIds[all[i]]) continue;
    seenIds[all[i]] = 1;
    var st = Records && Records.stone ? Records.stone(all[i]) : null;
    stones.push(st ? st.name : all[i]);
  }
  var last = stones.length > 1 ? stones.pop() : null;
  $("endStones").innerHTML = !stones.length ? "" : (last ? "New stones for the rim: <b>" + esc(stones.join(", ")) +
    "</b> and <b>" + esc(last) + "</b>." : "A new stone for the rim: <b>" + esc(stones[0]) + "</b>.");

  $("endDepthRow").classList.toggle("hide", !depthRow);
  if (depthRow) $("endDepth").textContent = "Begin again from Depth " + r.depth;
  $("endCode").textContent = r.code ? "well code " + r.code : "";
  $("endShare").classList.toggle("hide", !r.code || r.steady);
  openSheet("ovEnd", "endDone");
  music("stop");
  remindBoundary("end");
}
function sentence(t) {
  t = String(t || "");
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(t) ? t : t + ".";
}
function paceName(p) { return p === "swift" ? "Swift" : p === "standard" ? "Standard" : "Gentle"; }
function doneRun() {
  lastRun = null;
  closeSheet("ovEnd");
  toSplash();
}
function againRun() {
  var r = lastRun;
  if (!r) { doneRun(); return; }
  lastRun = null;
  var o = copyObj(r.opts);
  /* Again is from the top, even after beginning again from a depth */
  if (r.modeId === "descent") o.depth = 1;
  startRun(r.modeId, o);
  closeSheet("ovEnd");
}
/* Standard and Swift: an empty well, the score from the start of the
   depth, the music from that depth's first bar, and "with 1 rest" on the
   card as a plain fact */
function beginAgainFromDepth() {
  var r = lastRun;
  if (!r || r.modeId !== "descent") { doneRun(); return; }
  lastRun = null;
  var d = r.depth, o = copyObj(r.opts);
  var lb = (d - 1) * 25;
  o.depth = d;
  /* the engine can start from a score; if it doesn't, the app carries it */
  startRun("descent", o, {
    rests: r.rests + 1, linesBase: lb, scoreBase: r.depthScore, depth: d,
    engine: { level: levelAtDepth(o.pace, d), goalLines: 250 - lb, score: r.depthScore }
  });
  closeSheet("ovEnd");
}

/* the line people may copy, never prompted */
function shareLine(r) {
  var res = r.result || {}, parts = ["well", r.mode ? r.mode.name : r.modeId], g = r.g;
  if (r.modeId === "forty") {
    if (r.goal !== 40) parts.push(r.goal + " lines");
    if (r.why === "goal") parts.push(fmtStopwatch(r.elapsedMs)); else parts.push((g.lines || 0) + " lines");
  } else if (r.modeId === "three") parts.push(fmtInt(g.score));
  else if (r.modeId === "descent") parts.push((r.surface ? "the Surface" : "Depth " + r.depth) + " · " + fmtInt(displayScoreOf(r)));
  else if (r.modeId === "drift") parts.push((r.linesBase + (g.lines || 0)) + " lines");
  else if (r.lesson) parts.push(r.lesson.name);
  if (res.medal && res.medal !== "Reached the Surface") parts.push(res.medal);
  parts.push("well code " + r.code);
  return parts.join(" · ");
}
function displayScoreOf(r) { return r.scoreBase + (r.g.score || 0); }
function copyText(text) {
  function fallback() {
    var ta = doc.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    doc.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = doc.execCommand("copy"); } catch (e) { ok = false; }
    doc.body.removeChild(ta);
    toast(ok ? "Copied: " + text : text, 5200);
  }
  if (nav.clipboard && nav.clipboard.writeText) {
    nav.clipboard.writeText(text).then(function () { toast("Copied: " + text, 4200); }, fallback);
  } else fallback();
}

/* ================================================================
   the gentle reminder
   ================================================================ */
var remind = { playMs: 0, lastPlay: 0, quietUntil: 0 };
function remindTick() {
  if (state === "play" && run && !run.steady) {
    /* a five-minute break, anywhere, starts the count again */
    if (remind.lastPlay && clock[FRAME] - remind.lastPlay > BREAK_MS) remind.playMs = 0;
    remind.playMs += clock[DT];
    remind.lastPlay = clock[FRAME];
  }
}
function remindDue() {
  var mins = +pref("reminder") || 0;
  if (!mins || (run && run.steady)) return 0;
  if (remind.lastPlay && now() - remind.lastPlay > BREAK_MS) remind.playMs = 0;
  if (now() < remind.quietUntil) return 0;
  return remind.playMs >= mins * 60000 ? mins : 0;
}
function remindWords(mins) {
  return mins === 15 ? "a quarter of an hour" : mins === 30 ? "half an hour" : mins === 45 ? "three quarters of an hour" : "an hour";
}
function remindText(mins) {
  return "You've been at the well for " + remindWords(mins) + ". A good moment to rest your eyes.";
}
function remindSpent() {
  remind.playMs = 0;
  remind.quietUntil = now() + Math.max(QUIET_MS, (+pref("reminder") || 30) * 60000);
}
/* at a natural boundary the reminder joins whatever is already on screen,
   rather than arriving as one more thing to dismiss */
function remindLine(where) {
  var m = remindDue();
  if (!m || (where !== "end" && where !== "chapter")) return "";
  remindSpent();
  return " " + remindText(m);
}
function remindBoundary(where) {
  if (where !== "depth") return;
  var m = remindDue();
  if (!m) return;
  remindSpent();
  /* the full sentence, and the short one a phone's one-line chip shows */
  var mw = remindWords(m);
  $("chipText").innerHTML = '<span class="cl">' + esc(remindText(m)) + '</span><span class="cs">' +
    esc(mw.charAt(0).toUpperCase() + mw.slice(1)) + " at the well — a good moment to rest your eyes.</span>";
  chip.classList.remove("hide");
  needResize = true;
  /* non-modal, and it doesn't linger: left alone, it goes by itself */
  if (chipT) clearTimeout(chipT);
  chipT = setTimeout(function () { chipT = 0; hideChip(); }, CHIP_MS);
}
var chipT = 0, CHIP_MS = 15000;
function hideChip() {
  if (chipT) { clearTimeout(chipT); chipT = 0; }
  chip.classList.add("hide");
}

/* ================================================================
   sheets
   ================================================================ */
var OV = doc.querySelectorAll(".ov");
var lastFocus = null;
function isOpen(id) { var el = $(id); return !!el && !el.classList.contains("hide"); }
function countSheets() {
  var n = 0;
  for (var i = 0; i < OV.length; i++) if (!OV[i].classList.contains("hide")) n++;
  sheetsOpen = n;
  setBehind(n > 0);
  return n;
}
/* can this element take the focus right now? (not hidden, not faded out,
   not inside something closed) */
function canFocus(el) {
  if (!el || el === doc.body || !el.focus || !doc.body.contains(el) || el.offsetParent === null) return false;
  if (el.closest && el.closest(".hide, .off")) return false;
  try { if (getComputedStyle(el).visibility === "hidden") return false; } catch (e) { return false; }
  return true;
}
/* show: let the browser scroll the sheet to it, as a plain Tab does. The
   wrap at either end of a sheet needs that — the last Begin in Modes is a
   long way below the top — where a restore that keeps its place does not. */
function focusEl(f, show) {
  if (!f) return false;
  try { f.focus(show ? undefined : { preventScroll: true }); } catch (e) { try { f.focus(); } catch (e2) { return false; } }
  return doc.activeElement === f;
}
/* a sheet's first stop: the named button, else its primary one, else its
   first button that isn't the ✕ */
function focusIn(el, id) {
  var f = id ? $(id) : null;
  if (!canFocus(f)) f = null;
  if (!f && el) f = el.querySelector(".btn.primary:not(.hide)") || el.querySelector(".btn:not(.hide)") ||
                    el.querySelector("button:not(.close), [href], input");
  if (!f && el) f = el.querySelector("button");
  focusEl(f);
}
function openSheet(id, focusId) {
  var el = $(id);
  if (!el) return;
  if (!sheetsOpen) lastFocus = doc.activeElement;
  /* the sheet opened last sits on top, by document order, the same way
     steady.js stacks its own: no z-index arithmetic between files */
  if (el.parentNode === doc.body && el !== doc.body.lastElementChild) doc.body.appendChild(el);
  el.classList.remove("hide");
  var body = el.querySelector(".sheet");
  if (body) body.scrollTop = 0;
  countSheets();
  resetInput();
  focusIn(el, focusId);
}
function closeSheet(id) {
  var el = $(id);
  if (el && !el.classList.contains("hide")) el.classList.add("hide");
  countSheets();
}
function closeAllSheets() {
  for (var i = 0; i < OV.length; i++) OV[i].classList.add("hide");
  countSheets();
}
function closeTopSheet() {
  /* the live document order, not the order at load: sheets move to the
     end of <body> as they open */
  var open = doc.querySelectorAll(".ov:not(.hide)");
  if (open.length) {
    var top = open[open.length - 1], x = top.querySelector("[data-close]");
    if (x) x.click(); else top.classList.add("hide");
  }
  countSheets();
}

/* A sheet chosen from the menu (Look, Handling, the explainer, Modes…)
   takes the menu's place, and closing it — ✕ or Esc — brings the menu
   back with the focus on the item it came from, so changing two settings
   doesn't mean reopening the menu, and Esc never resumes play from under
   a settings sheet. The way back holds through a chain of sheets (Modes,
   then Steady's card; Breathe, then noticing) and is let go the moment
   anything starts a run or the room moves on. */
var menuReturn = null;
function fromMenu(openerId) {
  if (isOpen("ovMenu")) menuReturn = { opener: openerId || null, state: state, run: run };
  closeSheet("ovMenu");
}

/* While a sheet is up, everything behind it is inert: Tab can't wander
   onto the pause button or the HUD under a modal, a screen reader reads
   only the sheet, and nothing behind can be tapped by accident. Older
   browsers without inert get aria-hidden, which hides it from a screen
   reader at least; the Tab wrap below covers the keyboard. */
var behind = [$("app"), splash], behindInert = false;
function setBehind(onOff) {
  if (onOff === behindInert) return;
  behindInert = onOff;
  for (var i = 0; i < behind.length; i++) {
    var el = behind[i];
    if (!el) continue;
    if ("inert" in el) el.inert = onOff;
    else if (onOff) el.setAttribute("aria-hidden", "true");
    else el.removeAttribute("aria-hidden");
  }
}
/* the last thing focused inside each sheet, and outside them all, so
   closing a sheet gives the focus back to where it was */
var lastIn = {}, lastOut = null;
function noteFocus(e) {
  var t = e.target;
  if (!t || t === doc.body || !t.closest) return;
  var ov = t.closest(".ov");
  if (ov && ov.id) lastIn[ov.id] = t;
  else if (!ov) lastOut = t;
}
function topSheet() {
  var open = doc.querySelectorAll(".ov:not(.hide)");
  return open.length ? open[open.length - 1] : null;
}
/* Tab and Shift-Tab go round the top sheet. sheets.js and steady.js wrap
   their own (and say so with preventDefault); this covers the rest. */
function sheetTab(e) {
  var top = topSheet();
  if (!top) return;
  var all = top.querySelectorAll("button, [href], input, select, textarea, [tabindex]"), list = [];
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    if (n.tabIndex < 0 || n.disabled || !canFocus(n)) continue;
    list.push(n);
  }
  if (!list.length) return;
  var at = doc.activeElement, first = list[0], last = list[list.length - 1];
  if (!top.contains(at)) { e.preventDefault(); focusEl(e.shiftKey ? last : first, true); }
  else if (e.shiftKey && (at === first || list.indexOf(at) < 0 && at === top.querySelector(".sheet"))) { e.preventDefault(); focusEl(last, true); }
  else if (!e.shiftKey && at === last) { e.preventDefault(); focusEl(first, true); }
}
/* the splash's own first door, for someone using the keyboard */
var keyboardLast = device === "keys";
function focusSplash() {
  if (!keyboardLast || state !== "splash" || sheetsOpen) return;
  var c = $("goContinue"), p = $("goPlay");
  focusEl(canFocus(c) ? c : canFocus(p) ? p : $("goModes"));
}

/* Sheets open and close from four files (this one, sheets.js, steady.js and
   learn.js), so the bookkeeping watches the classes rather than trusting
   every caller to report in. */
var sheetsSeen = 0;      /* the count as this function last saw it */
function sheetsChanged() {
  /* not sheetsOpen: openSheet() has usually counted already, before the
     change arrives here */
  var was = sheetsSeen, n = countSheets();
  sheetsSeen = n;
  var top = topSheet();
  if (n > was) {
    resetInput();
    /* a passing note never sits over a sheet's buttons */
    clearToast();
  }
  setBehind(n > 0);
  /* the title and the doors step back while a sheet is over the splash,
     so a card floats over the well playing itself, not over half a title */
  splash.classList.toggle("covered", n > 0);
  /* Breathe is a whole screen of its own: the pause sheet goes while it
     is up, and comes back after (the way back is the menu's) */
  if (isOpen("ovBreathe") && isOpen("ovMenu")) { fromMenu("stxBreathe"); return; }
  /* and nothing to read shows through it: the veil's words and the pause
     button wait behind until it closes */
  doc.documentElement.classList.toggle("breathing", isOpen("ovBreathe"));
  if (top && !top.contains(doc.activeElement)) {
    var back = lastIn[top.id];
    if (!(canFocus(back) && top.contains(back) && focusEl(back))) focusIn(top, null);
  }
  /* a well code belongs to the Modes sheet it was typed into: closing the
     sheet without starting a run lets it go */
  if (!isOpen("ovModes") && (pendingSeed !== null || $("codeIn").value)) clearCode();
  if (state === "over" && !isOpen("ovEnd")) { doneRun(); return; }
  if (state === "intro" && !isOpen("ovCards")) { beginPlay(false); return; }
  if (menuReturn) {
    if (menuReturn.state !== state || menuReturn.run !== run) menuReturn = null;
    else if (n === 0) {
      var op = menuReturn.opener;
      menuReturn = null;
      openMenu(op);
      return;
    }
  }
  if (n === 0) {
    if (state === "paused") showVeil("Paused · tap to return");
    else if (state === "rest") showVeil(run && run.steady ? "Resting · tap for choices" : "Chapter complete · tap for choices");
    var at = doc.activeElement;
    if (!at || at === doc.body || !canFocus(at)) {
      var f = canFocus(lastFocus) ? lastFocus : canFocus(lastOut) ? lastOut : null;
      if (!(f && focusEl(f))) {
        if (state === "paused" || state === "rest") focusEl(veil);
        else if (state === "splash") focusSplash();
      }
    }
    lastFocus = null;
  }
}

function showVeil(text) {
  veilText.textContent = text;
  /* the words on the glass say tap (brief §4.7); the name a screen reader
     hears says how a keyboard does it */
  var parts = text.split(" · "), how = parts[1] || "";
  if (how && device === "keys") how = how.replace("tap", "press Enter or Escape");
  veil.setAttribute("aria-label", parts[0] + (how ? ". " + how.charAt(0).toUpperCase() + how.slice(1) : "") + ".");
  /* in the races the board is hidden while paused, for fairness */
  veil.classList.toggle("full", !!(run && run.timed && state === "paused"));
  veil.classList.remove("hide");
}
function hideVeil() { veil.classList.add("hide"); }

/* ---------- the pause sheet, which is also the menu ---------- */
var GRID_IDS = ["mModes", "mSteady", "mLook", "mHandling", "mSound", "mComfort", "mLearn", "mLog", "mAbout"];
var STEADY_GRID = { mLook: 1, mSound: 1, mComfort: 1, mLearn: 1 };
function openMenu(focusId) {
  var live = !!run && (state === "paused" || state === "rest");
  var steady = live && run.steady;
  $("menuTitle").textContent = live ? "Paused" : "well";
  $("menuLead").textContent = !live ? "Modes, settings, and how it all works."
    : steady ? "Take all the time you like." : "Nothing moves while this is open.";
  $("menuRun").classList.toggle("hide", !live || state !== "paused");
  $("menuLeaveRow").classList.toggle("hide", !live);
  /* Steady's sheet also has Finish, which means something else: there,
     Leave says what it does in small words, as Finish does */
  var lv = $("mLeave");
  lv.classList.toggle("two", !!steady);
  if (steady) lv.innerHTML = 'Leave<small class="bsub">pick up later</small>';
  else lv.textContent = live && run.mode && run.mode.resumable ? "Leave · it's saved" : "Leave";
  for (var i = 0; i < GRID_IDS.length; i++) $(GRID_IDS[i]).classList.toggle("hide", steady && !STEADY_GRID[GRID_IDS[i]]);
  var ex = $("menuExtras");
  ex.innerHTML = "";
  if (live && steady && S) { try { S.pauseExtras(ex); } catch (e) { fault("Steady.pauseExtras", e); } }
  else if (live && run.modeId === "drift") driftExtras(ex);
  else if (live && run.coach) lessonExtras(ex);
  var note = "";
  if (live && run.code) note = "well code " + run.code;
  if (live && run.learner) note += (note ? " · " : "") + "learner speed";
  $("menuNote").textContent = note;
  openSheet("ovMenu", focusId || (live && state === "paused" ? "mResume" : "mModes"));
}
function driftExtras(ex) {
  ex.innerHTML =
    '<div class="fld"><label><b>Tide</b><span class="val" id="xTideVal"></span></label>' +
    '<div class="stepper"><button class="btn" id="xTideDn" aria-label="Slower tide">−</button>' +
    '<output id="xTideOut" aria-live="polite"></output>' +
    '<button class="btn" id="xTideUp" aria-label="Faster tide">+</button></div></div>' +
    '<div class="fld"><label><b>World</b></label><div class="chips" id="xWorlds" role="group" aria-label="World"></div></div>';
  function paint() {
    var t = run ? run.tide : 0;
    $("xTideOut").textContent = t ? "Tide " + t : "Off";
    $("xTideVal").textContent = t ? (tideMs(t) / 1000).toFixed(2) + " s a row" : "the pieces wait for you";
  }
  press($("xTideDn"), function () { setTide(Math.max(0, run.tide - 1)); paint(); });
  press($("xTideUp"), function () { setTide(Math.min(8, run.tide + 1)); paint(); });
  var wl = $("xWorlds"), list = Worlds ? Worlds.list : [];
  for (var i = 0; i < list.length; i++) {
    var b = doc.createElement("button");
    b.textContent = list[i].name;
    b.setAttribute("data-world", list[i].id);
    var cur = !!run && run.world === list[i].id;
    b.className = cur ? "on" : "";
    b.setAttribute("aria-pressed", String(cur));
    wl.appendChild(b);
  }
  on(wl, "click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-world]") : null;
    if (!b || !run) return;
    setPref("driftWorld", b.getAttribute("data-world"));
    var all = wl.querySelectorAll("button");
    for (var j = 0; j < all.length; j++) {
      all[j].className = all[j] === b ? "on" : "";
      all[j].setAttribute("aria-pressed", String(all[j] === b));
    }
  });
  paint();
}
function setTide(t) {
  if (!run || run.modeId !== "drift") return;
  run.tide = t;
  setPref("driftTide", t);
}
function lessonExtras(ex) {
  ex.innerHTML = '<p class="note" id="xLessonProg" style="margin-top:0"></p>' +
    '<div class="row"><button class="btn" id="xHint">Hint</button><button class="btn" id="xWatch">Show me</button></div>';
  $("xLessonProg").textContent = hc.s || (run.lesson && run.lesson.teaches) || "";
  press($("xHint"), function () { resume(); coachHint(); });
  press($("xWatch"), function () { resume(); coachWatch(); });
}

/* ---------- the first-touch cards ---------- */
var CARDS_TOUCH = [
  { t: "Drag to move", s: "Slide a finger left or right anywhere on the well. The piece follows, a column at a time.", f: "drag" },
  { t: "Tap to turn", s: "Tap the right side to turn clockwise, the left side to turn back.", f: "tap" },
  { t: "Flick down to drop", s: "A quick flick sends it straight down. A slow drag eases it down instead.", f: "down" },
  { t: "Flick up to keep", s: "The piece goes into the niche by the mouth of the well, for later.", f: "up" }
];
var CARDS_KEYS = [
  { t: "Arrows to move", s: "Press one and leave it down: the piece glides to the wall.", k: ["←", "→"] },
  { t: "Up or X to turn", s: "Z turns it back the other way.", k: ["↑", "X"] },
  { t: "Space to drop", s: "The down arrow eases it down instead.", k: ["Space"] },
  { t: "C or Shift to keep", s: "The piece goes into the niche by the mouth of the well, for later.", k: ["C"] }
];
var cardIx = 0, cardSet = CARDS_TOUCH;
function figure(kind) {
  var s = '<svg viewBox="0 0 120 120" aria-hidden="true">' +
    '<rect x="28" y="6" width="64" height="108" rx="13" fill="#10131f" stroke="#3a4466" stroke-width="2"/>' +
    '<rect x="39" y="20" width="42" height="84" rx="3" fill="#0b0d14" stroke="#2b3249"/>' +
    '<rect x="39" y="96" width="42" height="8" fill="#26304c"/><rect x="39" y="90" width="18" height="6" fill="#26304c"/>' +
    '<rect x="67" y="90" width="14" height="6" fill="#26304c"/>';
  var piece = '<rect x="52" y="34" width="5" height="5" rx="1" fill="#9fb4ff"/><rect x="57" y="34" width="5" height="5" rx="1" fill="#9fb4ff"/>' +
              '<rect x="62" y="34" width="5" height="5" rx="1" fill="#9fb4ff"/><rect x="57" y="29" width="5" height="5" rx="1" fill="#9fb4ff"/>';
  if (kind === "drag") s += '<g class="anim-drag">' + piece + '<circle class="fing" cx="60" cy="72" r="8"/></g>';
  else if (kind === "tap") {
    s += piece + '<path d="M66 26 a10 10 0 0 1 6 12" fill="none" stroke="#ffe2c4" stroke-width="1.6" stroke-linecap="round"/>' +
         '<path d="M70 37 l2.5 2 l1.4 -3" fill="none" stroke="#ffe2c4" stroke-width="1.6" stroke-linecap="round"/>' +
         '<g class="anim-tap"><circle class="fing" cx="72" cy="66" r="8"/></g>';
  } else if (kind === "down") {
    s += '<rect x="52" y="78" width="5" height="5" rx="1" fill="#9fb4ff" opacity=".35"/><rect x="57" y="78" width="5" height="5" rx="1" fill="#9fb4ff" opacity=".35"/>' +
         '<rect x="62" y="78" width="5" height="5" rx="1" fill="#9fb4ff" opacity=".35"/><rect x="57" y="73" width="5" height="5" rx="1" fill="#9fb4ff" opacity=".35"/>' +
         piece + '<g class="anim-down"><circle class="fing" cx="60" cy="60" r="8"/></g>';
  } else {
    s += '<rect x="20" y="8" width="18" height="12" rx="3" fill="none" stroke="#9fb4ff" stroke-width="1.4" opacity=".7"/>' +
         piece + '<g class="anim-up"><circle class="fing" cx="60" cy="64" r="8"/></g>';
  }
  return s + "</svg>";
}
function keycaps(keys) {
  var n = keys.length, wide = n === 1 && keys[0].length > 2, w = wide ? 84 : 38, gap = 10;
  var x = (120 - (n * w + (n - 1) * gap)) / 2, s = '<svg viewBox="0 0 120 120" aria-hidden="true">';
  for (var i = 0; i < n; i++) {
    s += '<rect class="kc" x="' + x + '" y="42" width="' + w + '" height="36" rx="8"/>' +
         '<text class="kt" x="' + (x + w / 2) + '" y="65">' + esc(keys[i]) + "</text>";
    x += w + gap;
  }
  return s + "</svg>";
}
function openCards() {
  cardSet = device === "touch" ? CARDS_TOUCH : CARDS_KEYS;
  cardIx = 0;
  paintCard();
  openSheet("ovCards", "cardsNext");
}
function paintCard() {
  var c = cardSet[cardIx], last = cardIx === cardSet.length - 1;
  var after = !last ? "" : device === "touch" ? "Prefer buttons? Handling → Buttons." : "Esc pauses. Every key can be changed in Handling.";
  $("cardsBody").innerHTML = '<div class="tcard">' + (c.f ? figure(c.f) : keycaps(c.k)) +
    '<p class="tl">' + esc(c.t) + '</p><p class="ts">' + esc(c.s) + "</p>" +
    (after ? '<p class="note" style="text-align:center">' + esc(after) + "</p>" : "") + "</div>";
  var dots = "";
  for (var i = 0; i < cardSet.length; i++) dots += '<i class="' + (i === cardIx ? "on" : "") + '"></i>';
  $("cardsDots").innerHTML = dots;
  $("cardsNext").textContent = last ? "Play" : "Next";
}
function nextCard() {
  if (cardIx < cardSet.length - 1) { cardIx++; paintCard(); return; }
  if (device === "touch") markSeen("touchCards");
  closeSheet("ovCards");
  if (state === "intro") beginPlay(false);
}

/* ---------- the Modes sheet ---------- */
var OPTDEF = {
  pace: { label: "Pace", values: ["gentle", "standard", "swift"],
          names: { gentle: "Gentle", standard: "Standard", swift: "Swift" },
          notes: { gentle: "Never faster than 0.47 s a row, and the well drains instead of ending.",
                   standard: "From 1.00 s a row at Dawn to 0.06 s at the Starfield.",
                   swift: "Starts where Standard's sixth depth does." } },
  lines: { label: "Lines", values: [20, 40, 100] },
  chapter: { label: "Chapter", values: [40, 100, 150] },
  tide: { label: "Tide", values: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
  world: { label: "World", values: null }
};
function openModes() {
  renderModes();
  openSheet("ovModes", null);
}
function sparkline(hist, low) {
  if (!hist || hist.length < 2) return "";
  var vals = [], i, mn = Infinity, mx = -Infinity;
  for (i = 0; i < hist.length; i++) { var v = +(hist[i].value != null ? hist[i].value : hist[i]); vals.push(v); if (v < mn) mn = v; if (v > mx) mx = v; }
  var W = 96, H = 22, rng = mx - mn || 1, pts = "", lx = 0, ly = 0;
  for (i = 0; i < vals.length; i++) {
    var x = 2 + (W - 4) * i / (vals.length - 1);
    var f = (vals[i] - mn) / rng;
    /* better is always up: a quicker time and a bigger score both rise */
    var y = 2 + (H - 4) * (low ? f : 1 - f);
    pts += (i ? " " : "") + x.toFixed(1) + "," + y.toFixed(1);
    lx = x; ly = y;
  }
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true">' +
    '<polyline points="' + pts + '" fill="none" stroke="#9fb4ff" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>' +
    '<circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="2.4" fill="#ffe2c4"/></svg>';
}
function fmtBest(mode, v) {
  if (!(v > 0)) return "";
  return mode.pbBetter === "low" ? fmtStopwatch(v) : fmtInt(v);
}
function optionHtml(modeId, key, cur) {
  var d = OPTDEF[key];
  if (!d) return "";
  var vals = d.values, names = d.names || {}, notes = d.notes || {}, h = '<div class="mo"><span class="ok">' + d.label + "</span>";
  /* the mode's own names and lines for its paces, when it has them */
  var paces = key === "pace" && Modes && Modes.DESCENT_PACES && typeof Modes.DESCENT_PACES[0] === "object" ? Modes.DESCENT_PACES : null;
  if (paces) {
    vals = []; names = {}; notes = {};
    for (var p = 0; p < paces.length; p++) { vals.push(paces[p].id); names[paces[p].id] = paces[p].name; notes[paces[p].id] = paces[p].line; }
  }
  if (key === "chapter" && Modes && Modes.DRIFT_CHAPTERS && Modes.DRIFT_CHAPTERS.length) vals = Modes.DRIFT_CHAPTERS;
  if (key === "world") {
    vals = Worlds ? Worlds.ids || [] : [];
    names = {};
    for (var w = 0; Worlds && w < Worlds.list.length; w++) names[Worlds.list[w].id] = Worlds.list[w].name;
  }
  if (key === "tide") {
    h += '<div class="stepper"><button class="btn" data-mode="' + modeId + '" data-opt="tide" data-val="' + Math.max(0, cur - 1) +
         '" aria-label="Slower tide">−</button><output>' + (cur ? "Tide " + cur + " · " + (tideMs(cur) / 1000).toFixed(2) + " s a row" : "Off · the pieces wait for you") +
         '</output><button class="btn" data-mode="' + modeId + '" data-opt="tide" data-val="' + Math.min(8, cur + 1) +
         '" aria-label="Faster tide">+</button></div></div>';
    return h;
  }
  h += '<div class="chips" role="group" aria-label="' + d.label + '">';
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    h += '<button class="' + (String(v) === String(cur) ? "on" : "") + '" aria-pressed="' + (String(v) === String(cur)) +
         '" data-mode="' + modeId + '" data-opt="' + key + '" data-val="' + esc(v) + '">' + esc(names[v] || v) + "</button>";
  }
  h += "</div>";
  if (notes[cur]) h += '<small class="ml" style="display:block;margin:4px 0 0">' + esc(notes[cur]) + "</small>";
  return h + "</div>";
}
function renderModes() {
  var body = $("modesBody"), html = "", list = Modes && Modes.list ? Modes.list : [];
  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    if (m.id === "challenges" || m.group === "learn") continue;
    var o = optsFor(m.id), k, opts = "";
    if (m.id !== "steady") for (k in o) if (OPTDEF[k] && m.options && k in m.options) opts += optionHtml(m.id, k, o[k]);
    var key = null;
    try { key = m.pbKey ? m.pbKey(o) : null; } catch (e) { key = null; }
    var best = key ? bestOf(key) : null, hist = null, medal = null;
    try { hist = key && Records && Records.history ? Records.history(records, key) : null; } catch (e) { hist = null; }
    try { medal = key && Records && Records.medal ? Records.medal(records, key) : null; } catch (e) { medal = null; }
    var stats = "";
    if (m.id === "steady") {
      var life = lifetime();
      stats = life && life.steadySessions ? "Steady sessions: <b>" + life.steadySessions + "</b> · " + esc(fmtDuration(life.steadyMs)) + " in all" : "";
    } else if (best && best.value > 0) {
      stats = "Best <b>" + esc(fmtBest(m, best.value)) + "</b>" + sparkline(hist, m.pbBetter === "low");
    } else if (key && m.scoreShown !== false) stats = "No best yet — the first run sets it, quietly.";
    var save = saves && saves.runs[m.id], mid = esc(m.id);
    /* Each card's name is a heading, and each button is named by its own
       words and then the card's ("Begin Forty", "Continue Descent"), so a
       list of a screen reader's buttons is not thirteen Begins. The visible
       words come first, as voice control needs them to. */
    html += '<div class="mcard' + (m.group === "calm" ? " calm" : "") + '"><div class="mh"><h3 id="mt_' + mid + '">' + esc(m.name) + "</h3>" +
      (medal ? '<span class="medal">' + esc(medal) + "</span>" : "") + "</div>" +
      '<p class="ml">' + esc(m.line) + "</p>" + opts +
      (stats ? '<div class="ms">' + stats + "</div>" : "") +
      /* a saved run: Continue leads, and beginning again is the quieter
         second button beside it, because it lets the saved one go */
      '<div class="row">' + (save ? '<button class="btn primary" id="mc_' + mid + '" aria-labelledby="mc_' + mid + " mt_" + mid +
        '" data-continue="' + mid + '">Continue</button>' : "") +
      '<button class="btn' + (save ? "" : " primary") + '" id="mb_' + mid + '" aria-labelledby="mb_' + mid + " mt_" + mid +
      '" data-begin="' + mid + '">' +
      (m.id === "steady" ? (save ? "Begin again…" : "Begin…") : save ? "Begin again" : "Begin") + "</button></div></div>";
  }
  body.innerHTML = html;
  renderChallenges();
}
/* the lessons in their suggested order, then the silt wells with their
   best times; Modes keeps the two lists apart, so each is listed once */
function renderChallenges() {
  var el = $("chalBody"), html = "", i;
  var lessons = Modes && Modes.LESSONS ? Modes.LESSONS : [], silt = Modes && Modes.SILT ? Modes.SILT : [];
  var done = records && records.lessons ? records.lessons : {};
  for (i = 0; i < lessons.length; i++) {
    var ls = lessons[i], lid = esc(ls.id);
    html += '<div class="chal"><div class="ct"><h4 id="ct_' + lid + '">' + (ls.n || i + 1) + ". " + esc(ls.name) + "</h4><small>" + esc(ls.teaches || "") +
      (typeof ls.pass === "string" ? " " + esc(ls.pass) : "") +
      (done[ls.id] ? ' <span class="done">Passed.</span>' : "") + '</small></div><button class="btn" id="lb_' + lid +
      '" aria-labelledby="lb_' + lid + " ct_" + lid + '" data-lesson="' + lid + '">Begin</button></div>';
  }
  for (i = 0; i < silt.length; i++) {
    var s = silt[i], best = bestOf(challengeKey(s.id)), sid = esc(s.id);
    html += '<div class="chal"><div class="ct"><h4 id="ct_' + sid + '">' + esc(s.name || "Silt") + "</h4><small>" +
      esc(s.teaches || "") + (typeof s.pass === "string" ? " " + esc(s.pass) : "") +
      (best && best.value > 0 ? " Best " + esc(fmtStopwatch(best.value)) + "." : "") +
      '</small></div><button class="btn" id="lb_' + sid + '" aria-labelledby="lb_' + sid + " ct_" + sid +
      '" data-lesson="' + sid + '">Begin</button></div>';
  }
  el.innerHTML = html || '<p class="note">The challenges didn\'t load this time.</p>';
}
function modesClick(e) {
  var b = e.target.closest ? e.target.closest("button") : null;
  if (!b) return;
  var opt = b.getAttribute("data-opt");
  if (opt) {
    var modeId = b.getAttribute("data-mode"), map = PREFMAP[modeId], raw = b.getAttribute("data-val");
    var v = /^-?\d+(\.\d+)?$/.test(raw) ? +raw : raw;
    if (map && map[opt]) setPref(map[opt], v);
    var y = $("ovModes").querySelector(".sheet").scrollTop;
    renderModes();
    $("ovModes").querySelector(".sheet").scrollTop = y;
    var again = $("modesBody").querySelector('[data-mode="' + modeId + '"][data-opt="' + opt + '"][data-val="' + raw + '"]') ||
                $("modesBody").querySelector('[data-mode="' + modeId + '"][data-opt="' + opt + '"]');
    if (again) { try { again.focus({ preventScroll: true }); } catch (e2) { /* fine */ } }
    return;
  }
  var begin = b.getAttribute("data-begin"), cont = b.getAttribute("data-continue"), lesson = b.getAttribute("data-lesson");
  if (begin === "steady") { closeSheet("ovModes"); openSteadyEntry(); return; }
  if (begin) { closeAllSheets(); startRun(begin, null); return; }
  if (cont) { closeAllSheets(); if (run) leaveQuietly(); run = null; continueRun(cont); return; }
  if (lesson) { closeAllSheets(); startRun("challenges", { id: lesson }); }
}
function clearCode() {
  pendingSeed = null;
  var el = $("codeIn"), note = $("codeNote");
  if (el) { el.value = ""; el.removeAttribute("aria-invalid"); }
  if (note) { note.textContent = ""; note.className = "note"; }
}
/* The note under the field is a status (index.html), so what it says is
   heard as well as seen; it is only rewritten when its words change, so
   typing the first five letters says "Six letters and numbers" once, not
   five times. A good code is read back as the code itself. */
function codeInput() {
  var el = $("codeIn"), note = $("codeNote");
  var raw = (el.value || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (el.value !== raw) el.value = raw;
  pendingSeed = null;
  var txt = "", cls = "note", bad = false;
  if (raw && raw.length < 6) txt = "Six letters and numbers.";
  else if (raw) {
    var seed = null;
    try { seed = Modes && Modes.code ? Modes.code.decode(raw) : null; } catch (e) { seed = null; }
    if (seed === null || seed === undefined || seed === false) {
      txt = "That code doesn't look quite right — check it and try again.";
      bad = true;
    } else {
      pendingSeed = seed;
      var shown = raw;
      try { if (Modes.code.encode) shown = Modes.code.encode(seed) || raw; } catch (e) { shown = raw; }
      cls = "note ok";
      txt = "Pieces from well code " + shown + ". Pick a mode and they're yours.";
    }
  }
  if (bad) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
  if (note.className !== cls) note.className = cls;
  if (note.textContent !== txt) note.textContent = txt;
}

/* ---------- the Logbook ---------- */
function lifetime() {
  if (!Records || !records) return null;
  try { return Records.lifetime(records); } catch (e) { fault("Records.lifetime", e); return null; }
}
function hasStone(id) {
  if (Records && Records.has) { try { return Records.has(records, id); } catch (e) { return false; } }
  return !!(records && records.stones && records.stones[id]);
}
/* the stones, set into a rim seen from just above */
function rimSvg(stones) {
  var n = stones.length, cx = 150, cy = 92, rx = 128, ry = 66, s = "";
  s += '<svg viewBox="0 0 300 184" role="img">' +
    '<defs><radialGradient id="lgW" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#1b2340"/><stop offset=".7" stop-color="#0b0e1a"/><stop offset="1" stop-color="#05060c"/></radialGradient>' +
    '<radialGradient id="lgS" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff6ea"/><stop offset=".5" stop-color="#ffe2c4"/><stop offset="1" stop-color="#b98f69"/></radialGradient></defs>' +
    '<ellipse cx="' + cx + '" cy="' + (cy + 6) + '" rx="' + (rx + 14) + '" ry="' + (ry + 14) + '" fill="#262b3d"/>' +
    '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (rx + 12) + '" ry="' + (ry + 12) + '" fill="#3a3f52"/>' +
    '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (rx - 12) + '" ry="' + (ry - 12) + '" fill="url(#lgW)"/>' +
    '<ellipse cx="' + cx + '" cy="' + (cy + 18) + '" rx="' + (rx * 0.42) + '" ry="' + (ry * 0.2) + '" fill="#9fb4ff" opacity=".07"/>';
  for (var i = 0; i < n; i++) {
    var a = -Math.PI / 2 + (i + 0.5) * 2 * Math.PI / n;
    var x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry, got = hasStone(stones[i].id);
    s += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="7.5" ry="5.6" ' +
      (got ? 'fill="url(#lgS)" stroke="#ffe2c4" stroke-width=".8"' : 'fill="#22273a" stroke="#4a5170" stroke-width=".8"') + "/>";
    if (got) s += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="12" ry="9" fill="#ffe2c4" opacity=".12"/>';
  }
  return s + "</svg>";
}
function openLog() {
  var stones = Records && Records.STONES ? Records.STONES : [], i, have = 0, html = "";
  for (i = 0; i < stones.length; i++) {
    var got = hasStone(stones[i].id);
    if (got) have++;
    var prog = "";
    if (!got && Records.progress) {
      var p = null;
      try { p = Records.progress(records, stones[i].id); } catch (e) { p = null; }
      if (p && p.have) prog = " (" + p.have + " of " + p.need + ")";
    }
    /* a stone not yet found is simply dimmer: the list is what there is
       to find, not a row of things still to do, so only a found one says so */
    html += '<li class="stone' + (got ? " got" : "") + '"><i></i><div><b>' + esc(stones[i].name) + "</b><small>" +
      esc(stones[i].line) + esc(prog) + "</small>" + (got ? '<span class="vh">Found.</span>' : "") + "</div></li>";
  }
  $("logRim").innerHTML = stones.length ? rimSvg(stones) : "";
  $("logSum").textContent = !stones.length ? "" : !have ? "Stones arrive on their own as you play. These are the ones there are to find."
    : have + " of " + stones.length + " stones set into the rim.";
  $("logStones").innerHTML = html;
  var life = lifetime() || { pieces: 0, lines: 0, ms: 0, sessions: 0, steadySessions: 0, steadyMs: 0 };
  $("logLife").innerHTML =
    '<div><small>Pieces placed</small><b>' + fmtInt(life.pieces) + "</b></div>" +
    '<div><small>Lines cleared</small><b>' + fmtInt(life.lines) + "</b></div>" +
    '<div><small>Time at the well</small><b>' + esc(fmtDuration(life.ms)) + "</b></div>" +
    '<div><small>Runs</small><b>' + fmtInt(life.sessions) + "</b></div>" +
    (life.steadySessions ? '<div><small>Steady sessions</small><b>' + fmtInt(life.steadySessions) + "</b></div>" +
      '<div><small>Steady time</small><b>' + esc(fmtDuration(life.steadyMs)) + "</b></div>" : "");
  $("logBests").innerHTML = bestsHtml();
  openSheet("ovLog", null);
}
function bestsHtml() {
  var rows = [], m, o, key, b, md;
  function row(label, k, mode) {
    b = bestOf(k);
    md = null;
    try { md = Records && Records.medal ? Records.medal(records, k) : null; } catch (e) { md = null; }
    rows.push('<tr><th scope="row">' + esc(label) + "</th><td>" + (b && b.value > 0 ? esc(fmtBest(mode, b.value)) : "—") + "</td><td>" + esc(md || "") + "</td></tr>");
  }
  m = modeOf("descent");
  if (m && m.pbKey) {
    var paces = ["gentle", "standard", "swift"];
    for (var i = 0; i < paces.length; i++) {
      try { key = m.pbKey({ pace: paces[i] }); } catch (e) { key = null; }
      if (key) row("Descent · " + paceName(paces[i]), key, m);
    }
  }
  m = modeOf("forty");
  if (m && m.pbKey) {
    var ls = [40, 20, 100];
    for (var j = 0; j < ls.length; j++) {
      try { key = m.pbKey({ lines: ls[j] }); } catch (e) { key = null; }
      if (key) row(ls[j] === 40 ? "Forty" : "Forty · " + ls[j] + " lines", key, m);
    }
  }
  m = modeOf("three");
  if (m && m.pbKey) { try { key = m.pbKey(optsFor("three")); } catch (e) { key = null; } if (key) row("Three Minutes", key, m); }
  m = modeOf("drift");
  if (m && m.pbKey) { try { key = m.pbKey(optsFor("drift")); } catch (e) { key = null; } if (key) row("Drift", key, m); }
  var silt = Modes && Modes.SILT ? Modes.SILT : [];
  for (var s = 0; s < silt.length; s++) row(silt[s].name || "Silt", challengeKey(silt[s].id), { pbBetter: "low" });
  if (!rows.length) return '<p class="note">Your bests will appear here.</p>';
  return '<table class="tally"><thead><tr><th scope="col">Mode</th><th scope="col">Best</th><th scope="col">Medal</th></tr></thead><tbody>' +
    rows.join("") + "</tbody></table>";
}

/* ---------- How it works ---------- */
var learnTab = "";
function buildLearnTabs() {
  var tabs = $("learnTabs"), list = Learn && Learn.sections ? Learn.sections : [];
  var h = "";
  for (var i = 0; i < list.length; i++) {
    /* the short label on the tab, because the long titles wrap a phone's
       row of tabs; the full title heads the panel itself (showLearn) */
    var s = list[i];
    h += '<button role="tab" id="lt_' + esc(s.id) + '" data-tab="' + esc(s.id) + '" aria-selected="false">' +
         esc(s.short || s.title) + "</button>";
  }
  tabs.innerHTML = h;
}
function showLearn(id) {
  var list = Learn && Learn.sections ? Learn.sections : [];
  if (!list.length) { $("learnBody").innerHTML = '<p class="note">The explainer didn\'t load this time.</p>'; return; }
  if (!id) id = learnTab || list[0].id;
  learnTab = id;
  var btns = $("learnTabs").querySelectorAll("button");
  for (var i = 0; i < btns.length; i++) btns[i].setAttribute("aria-selected", String(btns[i].getAttribute("data-tab") === id));
  var body = $("learnBody");
  body.setAttribute("aria-labelledby", "lt_" + id);
  body.innerHTML = "";
  try { Learn.render(body, id, { device: device, prefs: Prefs, title: true }); } catch (e) { fault("Learn.render", e); }
}
function openLearn(id) {
  showLearn(id);
  $("glassToggle").checked = glassOn;
  openSheet("ovLearn", null);
}
function openAbout() {
  var a = Learn ? Learn.ABOUT : null, body = $("aboutBody");
  if (!a) body.innerHTML = "";
  else if (typeof a === "string") {
    /* the credits carry inline HTML (the name, in italics); only text
       that brings its own paragraphs goes in bare */
    if (/<(p|div|ul|ol)\b/i.test(a)) body.innerHTML = a;
    else body.innerHTML = '<p class="note">' + (/<[a-z]/i.test(a) ? a : esc(a)).replace(/\n\n+/g, '</p><p class="note">') + "</p>";
  } else if (a.length) {
    var h = "";
    for (var i = 0; i < a.length; i++) h += '<p class="note">' + esc(a[i]) + "</p>";
    body.innerHTML = h;
  } else if (a.text || a.lines) {
    body.innerHTML = '<p class="note">' + esc(a.text || (a.lines.join ? a.lines.join(" ") : "")) + "</p>";
  }
  openSheet("ovAbout", null);
}

/* ---------- the settings sheets, and Steady's ---------- */
function openSettings(which) {
  if (Sheets) { try { Sheets.open(which); countSheets(); return; } catch (e) { fault("Sheets.open", e); } }
  openSheet("ov" + which.charAt(0).toUpperCase() + which.slice(1), null);
}
function openSteadyEntry() {
  if (S) { try { S.openEntry(); countSheets(); return; } catch (e) { fault("Steady.openEntry", e); } }
  openSheet("ovSteady", null);
}

/* ================================================================
   Steady: the module draws its sheets; the app runs the session
   ================================================================ */
function makeSteady() {
  if (!Steady) return;
  try {
    S = Steady.create({
      prefs: Prefs, music: Music, learn: Learn,
      onBegin: function (o) {
        closeAllSheets();
        if (run) leaveQuietly();
        run = null;
        startRun("steady", o || null);
      },
      onFinish: function (reason) { finishSteady(reason); },
      onKeepPlaying: function () { continueAfterRest(); },
      onBreathe: function (phase) {
        EV_BREATHE.phase = +phase || 0;
        appFx(EV_BREATHE, false);
      },
      /* {t:"breathed"} and {t:"stop"}: already the events records.js reads */
      onMoment: function (ev) { if (ev && ev.t) momentObserve(ev); },
      onWhy: function () { openLearn("steady"); },
      /* the tip teaches the gestures to a first session on glass */
      device: function () { return device; },
      onHelp: function () { if (S && S.openHelp) S.openHelp(); }
    });
  } catch (e) { fault("Steady.create", e); S = null; }
}
/* Steady's moments (the breathing finished, Finish at the chime) may come
   after the run has already closed, so they go straight to the records */
function momentObserve(ev) {
  if (!Records || !records) return;
  var got = null;
  try { got = Records.observe(records, ev, rctx.modeId ? rctx : { modeId: "steady", opts: null, g: null, view: null }); } catch (e) { fault("Records.observe", e); }
  if (got && got.length && run) for (var i = 0; i < got.length; i++) if (run.newStones.indexOf(got[i]) < 0) run.newStones.push(got[i]);
  saveRecords();
}
function finishSteady(reason) {
  var r = run;
  if (!r || !r.steady) return;
  /* "timer" is Finish once the time was up (the Stone for knowing when to
     stop has already come through onMoment); "pause" is Finish from the
     pause sheet, which is just as welcome and simply earlier */
  finishRecords(r, reason === "timer" ? "timer" : "pause");
  clearSave("steady");
  if (r.coach) { try { r.coach.stop(); } catch (e) { fault("Coach.stop", e); } }
  /* Steady's own closing sheet may be up; the splash goes in beneath it */
  closeSheet("ovMenu");
  toSplash();
}

/* ================================================================
   input
   ================================================================ */
function inputEnabled() {
  return state === "play" && !!run && run.readyMs <= 0 && !run.halted && sheetsOpen === 0;
}
/* the same, through a Ready: input.js remembers what is held then and
   counts it at Go, so a direction held through the countdown is charged */
function inputArmed() {
  return state === "play" && !!run && !run.halted && sheetsOpen === 0;
}
/* Returns what the engine said: input.js cuts DAS (DCD) only after a turn
   or Keep that actually happened against a wall, so a refused press has
   to say so. */
function onAction(a, meta) {
  var r = run;
  if (!r || state !== "play") return false;
  /* the Breath button and the tray are pressed by a mouse as often as a
     finger, so only keys, pads and the well itself say what the hands are */
  if (meta && meta.source && meta.source !== "button") device = meta.source === "key" ? "keys" : meta.source === "pad" ? "pad" : "touch";
  if (a === "breath" && !(r.mode && r.mode.hasBreath)) return false;
  if (r.watching && a !== "softOff") r.watching = false;
  if (r.coach) {
    var verdict = "allow";
    try { verdict = r.coach.action(a, meta, r.g); } catch (e) { fault("Coach.action", e); }
    if (verdict === "rewind") { try { Well.rewind(r.g); } catch (e) { fault("Well.rewind", e); } return false; }
  }
  try { return !!Well.act(r.g, a, meta); } catch (e) { fault("Well.act", e); return false; }
}
function onUI(name) {
  if (name === "pause") { togglePauseFromUI(); return; }
  if (name === "glass") { if (state === "play" || state === "paused") toggleGlass(); return; }
  /* "keepTap": the niche itself already arrived as the hold action */
}
function makeInput() {
  if (!Input) return;
  try {
    I = Input.create({
      el: stage, layout: function () { return L; }, prefs: Prefs,
      onAction: onAction, onUI: onUI, enabled: inputEnabled, armed: inputArmed,
      /* lent so a slow drag can soft-drop exactly as far as the thumb went */
      game: function () { return run && state === "play" ? run.g : null; }
    });
  } catch (e) { fault("Input.create", e); I = null; }
}
/* Let go of everything. The input layer forgets what it was holding, and
   the engine's soft drop is released here too: input.js reports a release
   through onAction, which only listens during play, so a soft drop held
   into a pause, a sheet or a chapter's end would otherwise come back on
   its own when play resumed, with no finger on the glass. */
function resetInput() {
  if (I) { try { I.reset(); } catch (e) { fault("Input.reset", e); } }
  if (run && run.g && run.g.soft && Well) { try { Well.act(run.g, "softOff"); } catch (e) { fault("Well.act (release)", e); } }
}
function setPad(onOff) {
  var want = !!onOff && TOUCH && pref("scheme") === "buttons" && !!run && !run.steady;
  if (want === padOn) return;
  padOn = want;
  padEl.classList.toggle("on", want);
  if (I) { try { I.buttons(want); } catch (e) { fault("Input.buttons", e); } }
  needResize = true;
}

/* ================================================================
   platform guards
   ================================================================ */
var wake = null, wantWake = false;
function holdScreen() {
  wantWake = true;
  if (wake || !nav.wakeLock || !nav.wakeLock.request || doc.hidden) return;
  try {
    nav.wakeLock.request("screen").then(function (w) {
      if (!wantWake) { try { w.release(); } catch (e) { /* already gone */ } return; }
      wake = w;
      w.addEventListener("release", function () { if (wake === w) wake = null; });
    }, function () { /* refused: the screen may sleep, nothing else changes */ });
  } catch (e) { wake = null; }
}
function freeScreen() {
  wantWake = false;
  if (wake) { try { wake.release(); } catch (e) { /* already released */ } wake = null; }
}
/* in-game screens replace rather than push, so "back" has nothing to eat */
function replaceHistory() {
  try { if (root.history && history.replaceState) history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* file:// */ }
}
function saveAll() {
  if (run && (state === "play" || state === "paused" || state === "rest")) saveRun();
  /* a tab with no run open has changed nothing since its last write, and
     writing its copy back on every hide is how an idle tab used to undo a
     best set in another */
  if (run) saveRecords();
  try { if (Prefs.save) Prefs.save(); } catch (e) { fault("Prefs.save", e); }
}

function wirePlatform() {
  doc.addEventListener("visibilitychange", function () {
    if (doc.hidden) {
      pause("quiet");
      resetInput();
      music("suspend");
      saveAll();
    } else {
      music("resume");
      clock[LAST] = 0;
      needResize = true;
    }
  });
  on(root, "pagehide", function () { pause("quiet"); saveAll(); });
  /* another tab of the room wrote: a tab with no run open takes up its
     records and saves at once, so Continue and the Logbook stay true */
  on(root, "storage", function (e) {
    if ((e.key !== null && e.key !== (Prefs.store && Prefs.store.KEY)) || run) return;
    loadRecords();
    loadSaves();
    if (state === "splash") splashRefresh();
  });
  on(root, "blur", function () {
    pause("quiet");
    resetInput();
    if (pref("muteOnBlur")) music("suspend");
  });
  on(root, "focus", function () { if (!doc.hidden && pref("muteOnBlur")) music("resume"); });
  on(root, "resize", function () { needResize = true; });
  on(root, "orientationchange", function () { needResize = true; });
  if (root.visualViewport) on(root.visualViewport, "resize", function () { needResize = true; });

  /* while playing: no edge swipe back, no pinch, no long-press menu */
  on(stage, "touchstart", function (e) {
    if (state !== "play") return;
    var t = e.changedTouches && e.changedTouches[0];
    if (t && (t.clientX < 24 || t.clientX > vw - 24)) e.preventDefault();
  }, { passive: false });
  on(stage, "gesturestart", function (e) { if (state === "play" || state === "paused") e.preventDefault(); });
  on(stage, "contextmenu", function (e) { if (state === "play" || state === "paused") e.preventDefault(); });

  root.addEventListener("pointerup", unlockAudio, true);
  root.addEventListener("touchend", unlockAudio, true);
  root.addEventListener("click", unlockAudio, true);
  root.addEventListener("keydown", unlockAudio, true);

  /* which hands are in use, for where the focus should land; and what
     was last focused, in each sheet and outside them */
  doc.addEventListener("keydown", function (e) {
    if (e.key !== "Shift" && e.key !== "Control" && e.key !== "Alt" && e.key !== "Meta") keyboardLast = true;
  }, true);
  doc.addEventListener("pointerdown", function () { keyboardLast = false; }, true);
  doc.addEventListener("focusin", noteFocus, true);

  /* the keys that belong to the room rather than the game */
  on(doc, "keydown", function (e) {
    /* a sheet that handled its own Escape has had its say */
    if (e.defaultPrevented) return;
    var k = e.key, code = e.code;
    if (k === "Tab") { if (sheetsOpen) sheetTab(e); return; }
    if (k === "Escape" || code === "Escape") {
      if (state === "paused" && sheetsOpen && onlyMenuOpen()) {
        e.preventDefault();
        if (now() - lastToggle > 280) resume();
        return;
      }
      if (sheetsOpen) { e.preventDefault(); closeTopSheet(); lastToggle = now(); return; }
      if (state === "paused" || state === "rest") { e.preventDefault(); if (state === "paused") { if (now() - lastToggle > 280) resume(); } else reopenRest(); return; }
      if (state === "play" && !I) { e.preventDefault(); pause("menu"); }
      return;
    }
    if (code === "KeyP" && onlyMenuOpen()) {
      if (state === "paused" && now() - lastToggle > 280) { e.preventDefault(); resume(); }
      else if (state === "play" && !I) { e.preventDefault(); pause("menu"); }
      return;
    }
    if (!I && state === "play" && (code === "KeyG")) toggleGlass();
  });
}

/* ================================================================
   wiring the buttons
   ================================================================ */
function wireUI() {
  /* every ✕, including ones other files create later */
  on(doc, "click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-close]") : null;
    if (!t) return;
    e.preventDefault();
    var id = t.getAttribute("data-close");
    if (id === "ovCards" && device === "touch") markSeen("touchCards");
    closeSheet(id);
  });
  var mo = root.MutationObserver ? new MutationObserver(sheetsChanged) : null;
  if (mo) for (var i = 0; i < OV.length; i++) mo.observe(OV[i], { attributes: true, attributeFilter: ["class"] });

  press($("goPlay"), function () {
    /* a saved Descent is carried on, never replaced (splashRefresh) */
    if (saves && saves.runs.descent) { continueRun("descent"); return; }
    /* the first time, Descent at Gentle pace; after that, whatever pace
       was chosen last */
    var o = seen("intro") ? null : { pace: "gentle" };
    startRun("descent", o);
  });
  press($("goContinue"), function () { if (saves && saves.last) continueRun(saves.last); });
  press($("goModes"), function () { openModes(); });
  press($("goLearn"), function () { openLearn(null); });
  press($("goLog"), function () { openLog(); });
  press($("goMenu"), function () { openMenu(); });
  press($("goAbout"), function () { openAbout(); });
  /* the splash is silent until the first tap; that tap wakes Dawn */
  on(splash, "pointerup", function (e) {
    if (state !== "splash" || splashMusic) return;
    if (e.target && e.target.closest && e.target.closest("button")) return;
    splashMusic = true;
    unlockAudio();
    setWorld("dawn", true, true);
    music("start");
  });

  wireGhostGuard();
  tapPress(btnMenu, function () {
    if (state === "play") pause("menu");
    else if (state === "paused" || state === "rest") openMenu();
  });
  tapPress(btnBreath, function () { onAction("breath", { source: "button", t: clock[SIM], repeat: false }); });
  tapPress(veil, function () {
    if (state === "paused") { if (now() - lastToggle > 200) resume(); }
    else if (state === "rest") reopenRest();
  });
  /* the veil is a div with role=button, so Enter and Space don't click it
     by themselves. The key stops here: Space is also the hard drop, and
     on the window it would resume the run and drop the piece in one press. */
  on(veil, "keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) veil.click();
  });

  press($("mResume"), function () { resume(); });
  press($("mLeave"), function () { leaveRun(); });
  press($("mModes"), function () { fromMenu("mModes"); openModes(); });
  press($("mSteady"), function () { fromMenu("mSteady"); openSteadyEntry(); });
  press($("mLook"), function () { fromMenu("mLook"); openSettings("look"); });
  press($("mHandling"), function () { fromMenu("mHandling"); openSettings("handling"); });
  press($("mSound"), function () { fromMenu("mSound"); openSettings("sound"); });
  press($("mComfort"), function () { fromMenu("mComfort"); openSettings("comfort"); });
  press($("mLearn"), function () { fromMenu("mLearn"); openLearn(null); });
  press($("mLog"), function () { fromMenu("mLog"); openLog(); });
  press($("mAbout"), function () { fromMenu("mAbout"); openAbout(); });

  on($("modesBody"), "click", modesClick);
  on($("chalBody"), "click", modesClick);
  on($("codeIn"), "input", codeInput);

  on($("learnTabs"), "click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-tab]") : null;
    if (b) showLearn(b.getAttribute("data-tab"));
  });
  on($("learnTabs"), "keydown", function (e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    var btns = $("learnTabs").querySelectorAll("button"), i, cur = 0;
    for (i = 0; i < btns.length; i++) if (btns[i].getAttribute("data-tab") === learnTab) cur = i;
    cur = (cur + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length;
    showLearn(btns[cur].getAttribute("data-tab"));
    btns[cur].focus();
    e.preventDefault();
  });
  on($("glassToggle"), "change", function () { setGlass(this.checked, true); });

  press($("endDone"), function () { doneRun(); });
  press($("endAgain"), function () { againRun(); });
  press($("endDepth"), function () { beginAgainFromDepth(); });
  press($("endShare"), function () { if (lastRun) copyText(shareLine(lastRun)); });

  press($("chapterRest"), function () {
    if (!run || state !== "rest") return;
    /* Rest at a chapter's end is the other way to earn Knew When to Stop;
       records.js gives it for a Drift run that ends with "rest" */
    closeSheet("ovChapter");
    endRun({ why: "rest", title: "The well rests.", lead: "A chapter is a good place to stop." }, now());
  });
  press($("chapterGo"), function () { continueAfterRest(); });

  press($("cardsNext"), function () { nextCard(); });

  press($("coachHint"), function () { coachHint(); });
  press($("coachWatch"), function () { coachWatch(); });

  tapPress($("chipRest"), function () {
    hideChip();
    if (run && state === "play") { pause("quiet"); leaveRun(); }
  });
  tapPress($("chipKeep"), function () { hideChip(); });
}

/* ================================================================
   prefs, as they change
   ================================================================ */
function onPref(key, value) {
  switch (key) {
    case "skin": case "palette": case "glyphs":
      applySkin(); break;
    case "graphics":
      graphicsChanged(); break;
    case "motion": case "juice": case "nudge": case "labels": case "grid": case "landing": case "lockLight":
      applyRenderOpts();
      if (key === "labels" && !value) labelsOff();
      break;
    case "previews": case "keep": case "boardSize":
      applyRenderOpts(); needResize = true; break;
    case "textSize":
      applyTextSize(); needResize = true; break;
    case "master": case "music": case "sfx": case "ambience":
    case "soften": case "quiet": case "playOnSilent": case "audioQuality":
      applyAudio(); break;
    case "scheme": case "btnSize": case "lefty": case "btnOpacity":
      if (run && (state === "play" || state === "paused" || state === "intro")) { setPad(false); setPad(true); }
      needResize = true;
      break;
    case "driftTide":
      if (run && run.modeId === "drift") {
        run.tide = +value || 0;
        try { Well.setGravity(run.g, tideMs(run.tide), tideLevel(run.tide)); } catch (e) { fault("Well.setGravity", e); }
      }
      break;
    case "driftWorld":
      if (run && run.modeId === "drift" && value) {
        run.world = value;
        setText(hAv, worldName(value));
        setWorld(value, false, false);
        EV_WORLD.world = value;
        observe(EV_WORLD);
      }
      break;
    case "scoreHidden":
      if (run && run.modeId === "drift") hC.classList.toggle("hide", !!value);
      break;
    case "pbPace":
      if (run) run.paceLight = !!value;
      if (!value) { paceEl.classList.remove("on"); hc.ahead = false; }
      break;
  }
}
function applyTextSize() {
  var ts = +pref("textSize") || 1;
  doc.documentElement.style.setProperty("--ts", String(Math.max(1, Math.min(1.5, ts))));
}

/* ================================================================
   offline, and the quiet note that a new version is ready
   ================================================================ */
function wireSW() {
  if (!("serviceWorker" in nav) || !root.location || location.protocol.indexOf("http") !== 0) return;
  var sw = nav.serviceWorker, hadController = !!sw.controller, reloading = false;
  sw.register("sw.js").then(function (reg) {
    function watch(w) {
      w.addEventListener("statechange", function () {
        if (w.state === "installed" && sw.controller) updateBar(w);
      });
    }
    if (reg.waiting && sw.controller) updateBar(reg.waiting);
    if (reg.installing) watch(reg.installing);
    reg.addEventListener("updatefound", function () { if (reg.installing) watch(reg.installing); });
  }).catch(function () { /* offline play is a bonus, never a requirement */ });
  /* On a first visit clients.claim() also fires controllerchange: only a
     genuine version swap reloads, and never with a run unsaved. The swap
     may have been asked for by another tab of the room. A run that can be
     saved is saved and reloads at once (the splash offers Continue); a
     Forty, Three Minutes or lesson cannot be, so this tab finishes it under
     the new worker — every script it needs is already loaded — and
     reloads when it gets back to the splash. */
  sw.addEventListener("controllerchange", function () {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    if (run && !(run.mode && run.mode.resumable) && state !== "over") { swDeferred = true; return; }
    reloading = true;
    saveAll();
    location.reload();
  });
}
function updateBar(worker) {
  if ($("updateBar")) return;
  var b = doc.createElement("button");
  b.id = "updateBar";
  b.textContent = "A new version of the well is ready — tap to refresh";
  b.addEventListener("click", function () {
    if (state === "play") pause("quiet");
    saveAll();
    b.textContent = "Refreshing…";
    worker.postMessage("skipWaiting");
  });
  doc.body.appendChild(b);
}

/* ================================================================
   boot
   ================================================================ */
function step(name, fn) { try { fn(); } catch (e) { fault("boot: " + name, e); } }

function boot() {
  step("prefs", function () { if (Prefs.load) Prefs.load(); });
  step("records", loadRecords);
  step("saves", loadSaves);
  step("text size", applyTextSize);
  step("glass", buildGlass);
  step("renderer", makeRenderer);
  step("input", makeInput);
  step("steady", makeSteady);
  step("sheets", function () {
    if (Sheets) Sheets.init({ prefs: Prefs, onChange: function () { /* Prefs.on below is the one place changes land */ } });
  });
  step("learn tabs", buildLearnTabs);
  step("ui", wireUI);
  step("platform", wirePlatform);
  step("prefs.on", function () { if (Prefs.on) Prefs.on(onPref); });
  step("audio", applyAudio);
  /* the lock screen's pause button, under Play on silent, pauses the well
     too; its play button does not resume it — only the player does that */
  step("music state", function () {
    if (Music && Music.onState) Music.onState(function (st, cmd) { if (cmd === "pause") pause("quiet"); });
  });
  step("layout", doResize);
  step("splash", toSplash);
  clock[LAST] = 0;
  clock[SIM] = now();
  rafId = root.requestAnimationFrame(frame);
  step("sw", wireSW);
}

/* the room's own handles, for tools/ and for anyone curious */
root.WELL = {
  state: function () { return state; },
  run: function () { return run; },
  view: function () { return view; },
  renderer: function () { return R; },
  layout: function () { return L; },
  records: function () { return records; },
  saves: function () { return saves; },
  faults: function () { return faults; },
  /* the gentle reminder's clock, so a tool can stand at the thirty-minute
     mark without playing for thirty minutes */
  reminder: function () { return remind; },
  start: function (modeId, opts) { closeAllSheets(); startRun(modeId, opts || null); },
  pause: function () { return pause("menu"); },
  resume: function () { resume(); }
};

boot();
})(typeof self !== "undefined" ? self : this);
