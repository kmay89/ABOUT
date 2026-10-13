/* app.js — the room around the well: one loop, the shape of a run, and
   everything you can tap.

   Every other file here is a part with a contract (the build's SPEC): the
   engine knows the rules and nothing about pixels, the renderers draw
   a view and know nothing about rules, the music answers events, the input
   layer turns fingers, keys and pads into actions, and the guide teaches
   the moves. This file is the only one that knows they all exist. It owns
   the loop, the life of a run from splash to run card, the HUD and the
   labels beside the well, the pause sheet and every sheet the menu opens,
   saving, the Glass Well, the gentle reminder, and the platform guards
   that stop a phone from eating a game.

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
   whose text is swapped from a table of ten strings, the Breath ring's arc
   and the Glass Well's bars are picked from strings built at load, and
   the clocks live in a Float64Array because a double written to an
   ordinary variable is boxed afresh on every write. Text is built when
   something *happens* — a clear, a new depth — which is rare, and never
   on a frame where nothing did. A sampling heap profile of six seconds of
   play finds nothing allocated by this file per frame except the two
   timestamps the browser itself hands over (performance.now() and the
   animation-frame argument), which no script can avoid.

   ## The chrome takes its light from the world

   Everything around the well — sheets, buttons, the HUD — is coloured by
   a few channel triplets on :root (index.html), and tint() rewrites them
   from the world's own key and rim light whenever the world changes. The
   swap is instant: worlds change during play, when the only chrome on
   screen belongs to the new world anyway. Behind every sheet is the frost
   plate, one tiny snapshot of the live canvas stretched to the screen,
   taken in the frame a sheet opens and never on a timer, so a sheet is
   glass over the very well you left without a blur pass a frame.

   ## One module's mistake is not the page's

   Twenty files meet in this one. If any of them throws, the room should
   go without that one thing — a sound, a sparkle, a lesson — and keep the
   well. So every call across a module boundary in the hot path sits in
   its own try, the first failure of each kind is reported once to the
   console (loudly enough for tools/open-check.js to catch it), and the
   loop itself is wrapped so that a bad frame is one bad frame.

   ## Kind by construction

   Pausing never resumes by itself, from the button, the keyboard, a phone
   call or a switched tab. Resuming gives input back at once and holds
   gravity and the lock for 600 ms, so the first thing after a pause is a
   decision, not a drop. A run ends on "The well rests.", Done has the
   focus, and nothing starts another game for you. There are no "are you
   sure?" dialogs because nothing is at stake: leaving a resumable
   mode saves it, quietly, and the splash offers Continue without ever
   asking you to come back. The first run teaches its moves on the real
   well with gravity held, one move at a time, done by doing; after that
   a move nobody uses is offered once in a while, only between moves —
   at a pause you chose, a run's end, a chapter's rest — and never in
   Steady. Estimates of how long the way takes are said once, when a sheet
   opens, never counted down.                                            */
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
    Sheets = root.Sheets || null, Guide = root.Guide || null;

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
/* one icon from the sprite at the top of index.html */
function ic(name, cls) {
  return '<svg class="ic' + (cls ? " " + cls : "") + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
}
var html = doc.documentElement;

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
/* "under a minute", "1 minute", "23 minutes", "2 hours 10 minutes": time
   at the well said in words, the way the estimates say it */
function fmtLong(ms) {
  var min = Math.round(Math.max(0, ms) / 60000);
  if (min < 1) return "under a minute";
  if (min < 60) return min + (min === 1 ? " minute" : " minutes");
  var h = Math.floor(min / 60), m = min % 60;
  return h + (h === 1 ? " hour" : " hours") + (m ? " " + m + (m === 1 ? " minute" : " minutes") : "");
}
/* 1:12, for a countdown read off a sheet */
function fmtClock(ms) {
  var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60);
  s = s % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
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
/* the Breath ring's arc: twenty beads, as a dash of a 20-long circle */
var DASH = [];
(function () { for (var q = 0; q <= 20; q++) DASH.push(q + " 20"); })();
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
/* the hands the coach and the explainer speak to; it follows whatever the
   player last actually used (the guide keeps its own, finer account) */
var device = (COARSE || (TOUCH && !FINE)) ? "touch" : "keys";
/* the sheet shapes index.html draws (§A10): a phone's bottom sheet, and a
   desk with a mouse */
var PHONE_Q = "(max-width:599px), (pointer:coarse) and (max-width:699px)";
var DESK_Q = "(min-width:900px) and (pointer:fine)";

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
function learnerOn() { return (+pref("learner") || 1) < 1; }

/* ================================================================
   the state of the room
   ================================================================ */
/* boot | splash | play | paused |
   rest (a chapter or Steady's time is up; the well is still) |
   ending (the stack dissolving) | over (the run card is up) */
var state = "boot";
var run = null;              /* the live run */
var lastRun = null;          /* the run whose card is showing: Again, Begin again */
var view = null;             /* Well.view's one reusable object */
var R = null, I = null, S = null, G = null;
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
/* where a practice well goes back to when it is done (§D11) */
var practiceReturn = null;

/* Records' context, the finish context and the demo: objects reused for
   the life of the page */
var rctx = { modeId: "", opts: null, g: null, view: null };
var fctx = { elapsedMs: 0, opts: null, chapters: 0 };

/* ================================================================
   the DOM, looked up once
   ================================================================ */
var stage = $("stage"), cv3 = $("cv3"), cv2 = $("cv2");
var hudEl = $("hud"), hudScrim = $("hudScrim"), hudCap = $("hudCap"), hudName = $("hudName"), hudSub = $("hudSub"),
    hudRail = $("hudRail"), hudWay = $("hudWay"), hudLine = $("hudLine"), hudLineFill = $("hudLineFill"), hudWayV = $("hudWayV");
var hF1 = $("hudF1"), hF1v = $("hudF1v"), hF1k = $("hudF1k"), hF2 = $("hudF2"), hF2v = $("hudF2v"), hF2k = $("hudF2k");
var RAIL = hudRail ? hudRail.querySelectorAll(".wn") : [];
var btnMenu = $("btnMenu"), btnBreath = $("btnBreath"), breathArc = $("breathArc"), breathKey = $("breathKey");
var labelsEl = $("labels"), LBL = labelsEl ? labelsEl.querySelectorAll(".lbl") : [];
var sayEl = $("say"), toastEl = $("toast"), bannerEl = $("banner"), bannerBig = $("bannerBig"), bannerSub = $("bannerSub"),
    bannerWay = $("bannerWay"), bannerWh = $("bannerWh");
var veil = $("veil"), veilText = $("veilText"), chip = $("chip"), paceEl = $("pace"), padEl = $("pad");
var glassEl = $("glass"), coachEl = $("coach"), splash = $("splash"), spCol = $("spCol"), frostEl = $("frost");

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
function worldAt(depth) {
  if (!Worlds || !Worlds.list || !Worlds.list.length) return null;
  return Worlds.list[Math.max(1, Math.min(Worlds.list.length, depth | 0)) - 1] || null;
}
/* the sky and the music change together: one call, so they never disagree */
function setWorld(id, instant, musicNow) {
  var w = worldEntry(id);
  if (!w) return;
  var changed = curWorld !== w;
  curWorld = w;
  tint(w);
  if (R) { try { R.setWorld(w, !!instant); } catch (e) { fault("R.setWorld", e); } }
  if (Music) { try { Music.setWorld(w.id, !!musicNow); } catch (e) { fault("Music.setWorld", e); } }
  /* a sheet open while the world changes is glass over the new one */
  if (changed && sheetsOpen) frostWanted = true;
}

/* ================================================================
   the world's light on the chrome (§A2)
   ================================================================ */
var TINT_INK = [238, 240, 248], TINT_G0 = [16, 19, 29], TINT_G2 = [23, 27, 40];
function rgbOf(h) {
  h = String(h || "#000000").replace("#", "");
  return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
}
function mixC(a, b, k) {
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
}
function trip(c) { return c[0] + " " + c[1] + " " + c[2]; }
var tinted = "";
/* w is a Worlds entry. Tokens swap at once: the only tinted chrome on
   screen when a world changes is the HUD and the banner, which belong to
   the new world. */
function tint(w) {
  if (!w || tinted === w.id) return;
  tinted = w.id;
  var st = html.style, rim = rgbOf(w.rim);
  st.setProperty("--wk", trip(rgbOf(w.key)));
  st.setProperty("--wr", trip(rim));
  st.setProperty("--wa", trip(mixC(rim, TINT_INK, 0.25)));
  st.setProperty("--wsky0", trip(rgbOf(w.sky.top)));
  st.setProperty("--wsky1", trip(rgbOf(w.sky.horizon)));
  st.setProperty("--glass", trip(mixC(TINT_G0, rim, 0.06)));
  st.setProperty("--glass2", trip(mixC(TINT_G2, rim, 0.08)));
}
/* a world's rim light as a triplet, for a passed node on the way down */
function rimTrip(depth) {
  var w = worldAt(depth);
  return w ? trip(rgbOf(w.rim)) : "159 180 255";
}

/* ================================================================
   the frost plate (§A5)
   ================================================================
   Two small canvases: the live picture is drawn into a 128-pixel-wide
   one with the browser's best smoothing, and that into the 32-pixel
   plate, which CSS stretches to the screen — two halvings and a
   stretch make a soft glass with no blur pass at all. It is painted
   once, in the frame right after a sheet opens (a WebGL canvas can be
   read in the same task it was drawn in), again when the world changes
   or a setting that changes the picture is touched, and never on a
   timer. A race that is paused keeps its board hidden: the plate is
   then just the world's sky. */
var frostCtx = null, fA = null, fActx = null, frostWanted = false;
var FROST_W = 32, FROST_A = 128;
function frostSize() {
  if (!frostEl) return;
  var w = Math.max(1, vw), h = Math.max(1, Math.round(FROST_W * vh / w)), ha = Math.max(1, Math.round(FROST_A * vh / w));
  if (frostEl.width !== FROST_W || frostEl.height !== h) {
    frostEl.width = FROST_W; frostEl.height = h; frostCtx = null;
    if (sheetsOpen) frostWanted = true;
  }
  if (!fA) fA = doc.createElement("canvas");
  if (fA.width !== FROST_A || fA.height !== ha) { fA.width = FROST_A; fA.height = ha; fActx = null; }
}
function frostSnap() {
  if (!frostEl) return;
  if (!fA) frostSize();
  if (!frostCtx) { try { frostCtx = frostEl.getContext("2d"); } catch (e) { frostCtx = null; } }
  if (!frostCtx) return;
  var w = frostEl.width, h = frostEl.height, done = false;
  var src = R ? (R.kind === "3d" ? cv3 : cv2) : null;
  if (src && src.width > 0 && src.height > 0 && !(run && run.timed && state === "paused")) {
    try {
      if (!fActx) fActx = fA.getContext("2d");
      fActx.imageSmoothingEnabled = true;
      fActx.imageSmoothingQuality = "high";
      fActx.drawImage(src, 0, 0, fA.width, fA.height);
      frostCtx.imageSmoothingEnabled = true;
      frostCtx.imageSmoothingQuality = "high";
      frostCtx.drawImage(fA, 0, 0, w, h);
      done = true;
    } catch (e) { done = false; }
  }
  if (!done) {
    var sky = curWorld && curWorld.sky ? curWorld.sky : { top: "#141833", horizon: "#4A3552" };
    var gr = frostCtx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, sky.top); gr.addColorStop(1, sky.horizon);
    frostCtx.fillStyle = gr;
    frostCtx.fillRect(0, 0, w, h);
  }
  frostCtx.fillStyle = "rgba(8,10,18,0.30)";
  frostCtx.fillRect(0, 0, w, h);
  html.classList.add("frosted");
}
var frostLater = 0;
/* a setting that changes the picture, touched with a sheet open: the
   glass is retaken once, a moment later, when the picture has caught up */
function frostSoon() {
  if (!sheetsOpen) return;
  if (frostLater) clearTimeout(frostLater);
  frostLater = setTimeout(function () { frostLater = 0; if (sheetsOpen) frostWanted = true; }, 250);
}

/* ================================================================
   which hands, how much motion, how big the words (§A6, §A7)
   ================================================================ */
/* html.kbd while the keyboard is in use, gone at the next touch or
   click: the focus ring shows for keys and never after a tap */
var keyboardLast = device === "keys";
function setKbd(onOff) {
  keyboardLast = onOff;
  if (html.classList.contains("kbd") !== onOff) html.classList.toggle("kbd", onOff);
}
/* html.rm whenever motion is less than Full, the device's own setting
   included (Prefs.motion resolves System) */
function applyMotionClass() {
  html.classList.toggle("rm", motionPref() !== "full");
}
function rmOn() { return html.classList.contains("rm"); }

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
  frostSize();
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
  /* the HUD's band grows with the text size (to 125%, where the HUD stops
     growing), so big text never runs into the Keep niche below it */
  lopt.hudTop = Math.max(44, Math.ceil(42 * Math.min(1.25, +pref("textSize") || 1)) + 2);
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

/* where the guide's caption goes: the coach's own spot (§D9) */
var guideSpot = { L: null, x: 0, y: 0, w: 0, compact: true, side: false };

/* Everything in the DOM that sits on the well is placed from the same
   rectangles the renderers draw from. */
function placeChrome() {
  var w = L.well, c = L.cell;
  var hud = L.hud || { x: safe.l + 8, y: safe.t + 2, w: vw - 70, h: 40 };
  var pz = L.pause || { x: vw - safe.r - 50, y: safe.t + 6, w: 44, h: 44 };
  var hs = Math.max(1, Math.min(1.25, +pref("textSize") || 1));

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
     and the Breath ring side by side (an iPad, a Mac, a phone on its
     side), the HUD becomes a column in the side panel instead, with larger
     numbers — and, where there is height for it, the whole way down drawn
     as a list of the ten worlds — and everything else in the panel moves
     down below it. */
  var colW = side ? Math.min(side.w, Math.round(240 * hs), Math.max(170, edge - side.x)) : 0;
  var colX = side ? inPanel(colW) : 0;
  var colY = side ? (L.keep && colX + colW > L.keep.x - 8 && colX < L.keep.x + L.keep.w + 8 ? side.y : hud.y) : 0;
  /* The column must end above whatever is below it: the Buttons tray on a
     phone on its side (its whole band takes taps, so its top, not its
     keys'), else the bottom of the screen. */
  var colBottom = padOn && padEl.offsetHeight ? padEl.getBoundingClientRect().top - 8 : vh - safe.b - 8;
  var hasBreath = runHasBreath(run);
  var colNeed = Math.round((196 + (hasBreath ? 76 : 0)) * hs);
  var hudCol = !!side && hud.w < 480 && colY + colNeed <= colBottom;
  hudEl.classList.toggle("col", hudCol);
  if (hudCol) {
    px(hudEl, "left", colX); px(hudEl, "top", colY);
    px(hudEl, "width", colW);
    hudEl.style.minHeight = "0px";
    hudEl.style.flexDirection = "";
    /* the way down as a list, when the column is tall and the Glass Well
       isn't wanting the room */
    var vrail = !!run && run.modeId === "descent" && !glassOn && colBottom - colY >= 520;
    hudEl.classList.toggle("vrail", vrail);
    if (vrail && colY + hudEl.offsetHeight > colBottom) hudEl.classList.remove("vrail");
    sideTop = Math.max(side.y, colY + (hudEl.offsetHeight || 140) + 18);
  } else {
    hudEl.classList.remove("vrail");
    px(hudEl, "left", hud.x); px(hudEl, "top", hud.y);
    px(hudEl, "width", Math.max(120, hud.w > 0 ? hud.w : vw - safe.l - safe.r - 70));
    hudEl.style.minHeight = hudWrap ? "0px" : Math.round(Math.max(36, Math.min(hud.h, 48))) + "px";
    hudEl.style.flexDirection = hud.stack ? "column" : "";
  }
  hudEl.classList.toggle("wrap", hudWrap && L.shape === "tall" && !hudCol);
  hudRow = !hudCol && !hud.stack;
  scrimSync();
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
  lblBand.bottom = lblBand.top - (4 * 1.4 * 22 * (+pref("textSize") || 1)) / c;

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
    var cx = cbox === side ? inPanel(Math.min(side.w, 320)) : cbox.x;
    px(coachEl, "left", cx); px(coachEl, "width", Math.min(cbox.w, 320));
    /* low in the panel, but never past the bottom of the screen: on a
       phone held sideways the panel is short */
    coachSpot.want = cbox === rp ? rp.y : Math.max(belowGlass, w.y + w.h * 0.58);
    coachSpot.min = cbox === rp ? rp.y : belowGlass;
    coachSpot.side = true;
    coachFit();
    coachEl.style.right = "auto";
    guideSpot.x = cx; guideSpot.y = coachSpot.want; guideSpot.w = Math.min(cbox.w, 340);
    guideSpot.compact = false; guideSpot.side = true;
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
    guideSpot.x = w.x + 6; guideSpot.y = cy; guideSpot.w = w.w - 12;
    guideSpot.compact = true; guideSpot.side = false;
  }
  guideSpot.L = L;
  if (G) { try { G.layout(guideSpot); } catch (e) { fault("Guide.layout", e); } }

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
    /* a note about something in the HUD (the Breath ring) can't cover
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

  /* The splash. On a wide screen with the sky to spare beside the well,
     the words leave the well and stand in that sky, left of it, so the
     well plays itself unobstructed; otherwise they float in the empty
     upper reach of the well, below the mouth, the Keep niche and the
     drifting previews, where the demo's low stack never goes. */
  var plaque = L.shape === "wide" && w.x - safe.l >= 420;
  splash.classList.toggle("plaque", plaque);
  if (plaque) {
    var pw = Math.min(380, w.x - 112);
    splash.style.paddingTop = "0px";
    spCol.style.width = Math.round(pw) + "px";
    px(spCol, "left", w.x - 56 - pw);
    px(spCol, "top", Math.max(safe.t + 16, w.y + 0.14 * w.h));
  } else {
    spCol.style.width = ""; spCol.style.left = ""; spCol.style.top = "";
    var mouth = w.y + c * 0.9;
    if (L.keep) mouth = Math.max(mouth, L.keep.y + L.keep.h + c * 0.4);
    splash.style.paddingTop = Math.round(Math.max(safe.t + 12, Math.min(mouth, vh * 0.3))) + "px";
  }
  /* a depth's name arrives with the clear that reached it: when the
     labels sit inside the well (a phone) the banner goes below their band
     rather than on top of the words */
  bannerY = w.y + w.h * (lblBand.wide ? 0.24 : 0.42);
  px(bannerEl, "top", bannerY);
}
/* the soft dark band behind a phone's HUD row: only in the tall shape,
   only while the HUD is showing */
function scrimSync() {
  var want = !!L && L.shape === "tall" && !hudEl.classList.contains("off") && !hudEl.classList.contains("col");
  if (hudScrim.classList.contains("on") !== want) hudScrim.classList.toggle("on", want);
  var tall = want && hudEl.classList.contains("wrap");
  if (hudScrim.classList.contains("tall") !== tall) hudScrim.classList.toggle("tall", tall);
}

/* ================================================================
   the HUD — whispers on the sky, written only when something changes
   ================================================================ */
var hc = { cap: -1, f1: -1, f2: -1, line: -1, clock: -1, breath: -1, breathCh: -1, breathOn: false, breathReady: false,
           ahead: false, s: "", tide: -1, chap: -1 };
/* A phone's HUD is one row: when space runs short the world's name gives
   way to an ellipsis and every number stays whole. At a large text size
   that row cannot hold the name, two numbers and the Breath ring at all,
   so for a mode with two numbers the HUD takes two rows from the start of
   the run — the name on a line of its own — and the layout gives it the
   height. It is decided when a run begins, never during one: a well that
   changes size mid-run is worse than a shortened name. */
var hudWrap = false, hudRow = true;
function hudWrapWanted(r) {
  return !!r && !r.steady && (+pref("textSize") || 1) >= 1.25 &&
         (r.modeId === "descent" || r.modeId === "drift" || r.modeId === "three");
}
var clockNodes = null, clockDig = [-1, -1, -1, -1, -1, -1], clockM10 = null, clockHund = true;
var hudWvS = null;           /* the current row's line in the desktop's way down */
var breathGlowed = false;

function setText(el, s) {
  var n = el.firstChild;
  if (n && n.nodeType === 3 && !n.nextSibling) n.nodeValue = s;
  else el.textContent = s;
}
function show(el, onOff) { if (el && el.classList.contains("hide") === !!onOff) el.classList.toggle("hide", !onOff); }
function figure(el, kEl, cap) {
  el.classList.remove("hide");
  setText(kEl, cap);
}
/* m:ss.hh as six text nodes — the clock changes every frame, and swapping
   a node's text for one of ten prebuilt strings allocates nothing */
function makeClock(vEl, hundredths) {
  vEl.textContent = "";
  vEl.className = "hname clock";
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
/* does this run have the Breath ring? (a practice well has it only when
   Breath is the move being practised) */
function runHasBreath(r) {
  return !!r && !r.steady && ((r.mode && r.mode.hasBreath) || (r.practice && r.opts && r.opts.move === "breath"));
}
/* the name of the key or button Breath is on, for the desktop's ring */
function breathGlyph() {
  if (device === "keys") {
    var keys = pref("keys"), k = keys && keys.breath && keys.breath[0] ? keyName(keys.breath[0]) : "B";
    return k;
  }
  if (device === "pad") return padGlyph("breath", "LT");
  return "";
}
function padGlyph(what, d) {
  if (G && G.padGlyphs) { try { var g = G.padGlyphs(); if (g && g[what]) return g[what]; } catch (e) { fault("Guide.padGlyphs", e); } }
  return d;
}
/* "KeyB" → "B", "Digit1" → "1", "Space" → "Space" */
function keyName(code) { return String(code).replace(/^Key/, "").replace(/^Digit/, ""); }

/* a move's name, for the HUD and the pause sheet of a practice well */
var MOVE_NAMES = { move: "Move", turn: "Turn", turnBack: "Turn it back", drop: "Drop", ease: "Ease down",
                   keep: "Keep", breath: "Breath", half: "Half-turn", first: "First steps" };
function moveName(m) { return MOVE_NAMES[m] || "A move"; }

function depthOf(r) { return r.depth || 1; }
/* lines in the current depth, 0..25, and what is left of it */
function depthLinesIn(r) { return Math.max(0, Math.min(25, totalLines() - (depthOf(r) - 1) * 25)); }
function depthLeft(r) { var v = (depthOf(r) >= 10 ? 250 : depthOf(r) * 25) - totalLines(); return v < 0 ? 0 : v; }
/* "21 lines to Moon Pool", or at the last depth, "to the Surface" */
function linesToNext(d, left) {
  var nextW = d >= 10 ? null : worldAt(d + 1);
  return left + (left === 1 ? " line" : " lines") + " to " + (nextW ? nextW.name : "the Surface");
}

function hudSetup() {
  var r = run;
  var wrapNow = hudWrapWanted(r);
  if (wrapNow !== hudWrap) { hudWrap = wrapNow; needResize = true; }
  hc.cap = hc.f1 = hc.f2 = hc.line = hc.clock = hc.breath = hc.breathCh = hc.tide = hc.chap = -1;
  hc.s = ""; hc.breathOn = false; hc.breathReady = false; hc.ahead = false;
  clockNodes = null; hudWvS = null;
  hudName.className = "hname"; hudName.style.removeProperty("--dw");
  hF1v.className = "hv"; hF2v.className = "hv";
  setText(hudCap, ""); setText(hudName, ""); setText(hudSub, "");
  show(hudCap, true); show(hudSub, false); show(hudRail, false); show(hudWay, false); show(hudLine, false);
  show(hF1, false); show(hF2, false);
  hudSub.className = "hsub hide";
  hudWayV.innerHTML = ""; hudWay.innerHTML = "";
  hudLineFill.style.transform = SCALEX[0];
  btnBreath.className = "hide";
  hudEl.classList.toggle("off", r.steady);
  /* sentence case everywhere, and the left block always carries a name:
     the world in Descent and Drift, the lesson in a challenge */
  var learner = r.learner ? " · learner speed" : "";
  switch (r.modeId) {
    case "descent":
      setText(hudCap, "Depth " + depthOf(r) + " of 10" + learner);
      setText(hudName, worldName(r.world));
      show(hudRail, true);
      railPaint(r);
      hudWay.innerHTML = wayHtml(depthOf(r), depthLinesIn(r) / 25);
      show(hudWay, true);
      hudSub.className = "hsub hs-rail";
      hudWayV.innerHTML = wayVHtml(depthOf(r), linesToNext(depthOf(r), depthLeft(r)));
      hudWvS = hudWayV.querySelector(".wv-s");
      figure(hF1, hF1k, "Lines to go");
      figure(hF2, hF2k, "Score");
      break;
    case "forty":
      setText(hudCap, "Time" + learner);
      makeClock(hudName, true);
      show(hudLine, true);
      figure(hF1, hF1k, "Lines");
      break;
    case "three":
      setText(hudCap, "Time left" + learner);
      makeClock(hudName, false);
      figure(hF1, hF1k, "Score");
      figure(hF2, hF2k, "Level");
      break;
    case "drift":
      setText(hudCap, driftCap(r) + learner);
      setText(hudName, worldName(r.world));
      show(hudLine, true);
      figure(hF1, hF1k, "This chapter");
      figure(hF2, hF2k, "Score");
      if (pref("scoreHidden")) hF2.classList.add("hide");
      break;
    case "challenges":
      show(hudCap, !!learner);
      setText(hudCap, r.learner ? "Learner speed" : "");
      setText(hudName, r.lesson && r.lesson.name ? r.lesson.name : "Lesson");
      hudSub.className = "hsub";
      break;
    case "practice":
      setText(hudCap, "Practice");
      setText(hudName, moveName(r.opts.move));
      break;
  }
  if (runHasBreath(r)) {
    btnBreath.className = "";
    btnBreath.setAttribute("aria-disabled", "true");
    var k = breathGlyph();
    setText(breathKey, k);
    breathKey.classList.toggle("on", !!k);
  }
  scrimSync();
}
function driftCap(r) { return tideLabel(r.tide) + " · Chapter " + driftChapter(r); }
function driftChapter(r) { return Math.max(1, Math.round(r.chapterEnd / r.chapterLen)); }
/* the HUD's micro rail: passed depths in their own world's light, this
   one filling as its lines clear (written only on a clear) */
function railPaint(r) {
  var d = depthOf(r);
  for (var i = 0; i < RAIL.length; i++) {
    var n = i + 1, el = RAIL[i];
    el.className = "wn" + (n < d ? " past" : n === d ? " now" : "");
    if (n < d) el.style.setProperty("--c", rimTrip(n)); else el.style.removeProperty("--c");
  }
  railFill(r);
}
function railFill(r) {
  var el = RAIL[depthOf(r) - 1];
  if (el) el.style.setProperty("--f", (depthLinesIn(r) / 25).toFixed(3));
  var wl = hudWay.querySelector(".wl.now");
  if (wl) wl.style.setProperty("--f", (depthLinesIn(r) / 25).toFixed(3));
}

function tideLabel(t) { return t > 0 ? "Tide " + t : "Tide off"; }
function displayScore() { return run.scoreBase + (run.g.score || 0); }
function totalLines() { return run.linesBase + (run.g.lines || 0); }

function hudUpdate() {
  var r = run, g = r.g, v;
  switch (r.modeId) {
    case "descent":
      v = depthLeft(r);
      if (v !== hc.f1) {
        hc.f1 = v;
        setText(hF1v, String(v));
        /* the desktop column says where those lines lead */
        var to = linesToNext(depthOf(r), v);
        setText(hudSub, to);
        if (hudWvS) setText(hudWvS, to);
      }
      v = displayScore();
      if (v !== hc.f2) { hc.f2 = v; setText(hF2v, fmtInt(v)); }
      break;
    case "forty":
      clockSet(r.elapsedMs, false);
      v = g.lines || 0;
      if (v !== hc.f1) {
        hc.f1 = v;
        setText(hF1v, Math.min(v, r.goal) + " / " + r.goal);
        hudLineFill.style.transform = SCALEX[Math.round(64 * Math.min(1, v / Math.max(1, r.goal)))];
      }
      break;
    case "three":
      clockSet(r.timeLimit - (typeof g.time === "number" ? g.time : r.elapsedMs), true);
      v = g.score || 0;
      if (v !== hc.f1) { hc.f1 = v; setText(hF1v, fmtInt(v)); }
      v = g.level || 1;
      if (v !== hc.f2) { hc.f2 = v; setText(hF2v, String(v)); }
      break;
    case "drift":
      if (r.tide !== hc.tide || r.chapterEnd !== hc.chap) {
        hc.tide = r.tide; hc.chap = r.chapterEnd;
        setText(hudCap, driftCap(r) + (r.learner ? " · learner speed" : ""));
      }
      v = Math.max(0, Math.min(totalLines() - (r.chapterEnd - r.chapterLen), r.chapterLen));
      if (v !== hc.f1) {
        hc.f1 = v;
        setText(hF1v, v + " / " + r.chapterLen);
        hudLineFill.style.transform = SCALEX[Math.round(64 * v / Math.max(1, r.chapterLen))];
      }
      v = displayScore();
      if (v !== hc.f2) { hc.f2 = v; setText(hF2v, fmtInt(v)); }
      break;
  }
  /* the Breath ring: the beads fill its first half to ready; while
     breathing, the whole ring drains with the breath */
  if (runHasBreath(r) && view && view.breath) {
    var ch = Math.floor(view.breath.charge), act = !!view.breath.active;
    var arc = act ? Math.max(0, Math.min(20, Math.round((1 - view.breath.phase) * 20))) : Math.max(0, Math.min(20, ch));
    if (arc !== hc.breath) { hc.breath = arc; breathArc.setAttribute("stroke-dasharray", DASH[arc]); }
    var ready = ch >= 10 && !act;
    if (ready !== hc.breathReady) {
      hc.breathReady = ready;
      btnBreath.classList.toggle("ready", ready);
      btnBreath.setAttribute("aria-disabled", ready || act ? "false" : "true");
      if (ready && !r.breathNoted) {
        /* the first time in a run: the guide hears of it, and its words
           come at the next depth's name or chapter's end — never now */
        r.breathNoted = true;
        r.breathWasReady = true;
        guideNote("breathReady");
        if (!seen("breath") && !breathGlowed && state === "play") { breathGlowed = true; btnBreath.classList.add("glow"); }
      }
    }
    if (ch === hc.breathCh && act === hc.breathOn) return;
    if (act !== hc.breathOn) { hc.breathOn = act; btnBreath.classList.toggle("active", act); }
    hc.breathCh = ch;
    /* the name a screen reader hears carries the beads the ring shows */
    btnBreath.setAttribute("aria-label", act ? "Breathing" : "Take a Breath, " + ch + " of 20 beads");
  }
}
function hudLesson() {
  if (!run || !run.coach) return;
  var p = null;
  try { p = run.coach.progress(); } catch (e) { fault("Coach.progress", e); }
  var t = p && p.text ? p.text : "";
  if (t !== hc.s) { hc.s = t; setText(hudSub, t); show(hudSub, !!t); setText($("coachProg"), t); }
}

/* ================================================================
   the way down, drawn: ten depths and the Surface (§E)
   ================================================================ */
/* depth: the one you are at (0 none yet, 11 the Surface); f: how far
   through it; deep: the deepest reached, shown dimmer, when nothing is
   current. Returns the nodes only; the caller wraps them. */
function wayHtml(depth, f, deep) {
  var s = "", cur = depth | 0, i, c, cls, lc, surface = cur >= 11;
  deep = deep | 0;
  for (i = 1; i <= 10; i++) {
    c = rimTrip(i);
    cls = i < cur ? "past" : i === cur ? "now" : (i <= deep ? "seen" : "");
    s += '<i class="wn' + (cls ? " " + cls : "") + '"' + (cls === "past" ? ' style="--c:' + c + '"' : "") + "></i>";
    if (i < 10) {
      lc = i < cur ? "past" : i === cur ? "now" : "";
      s += '<i class="wl' + (lc ? " " + lc : "") + '"' +
        (lc === "past" ? ' style="--c:' + c + '"' : lc === "now" ? ' style="--f:' + (+f || 0).toFixed(3) + '"' : "") + "></i>";
    }
  }
  return s + '<i class="ws' + (surface ? " lit" : "") + '"></i>';
}
/* the same, as a whole element with its sentence for a screen reader */
function wayBlock(depth, f, label, deep, ends) {
  return '<div class="way" role="img" aria-label="' + esc(label) + '">' + wayHtml(depth, f, deep) + "</div>" +
    (ends ? '<div class="way-ends" aria-hidden="true"><span>' + esc(worldName("dawn") || "Dawn") + "</span><span>" +
      esc(worldName("starfield") || "Starfield") + "</span></div>" : "");
}
function wayLabel(depth) {
  if (depth >= 11) return "All ten depths, and the Surface.";
  if (depth < 1) return "Ten depths, not yet begun.";
  var w = worldAt(depth);
  return "Depth " + depth + " of 10" + (w ? ", " + w.name : "") + ".";
}
/* the desktop's way down: the Surface at the top, then Dawn down to the
   Starfield, the current depth bright with where its lines lead */
function wayVHtml(depth, sub) {
  var s = '<li class="surf"><i></i>The Surface</li>', list = Worlds && Worlds.list ? Worlds.list : [];
  for (var i = 1; i <= 10 && i <= list.length; i++) {
    var cls = i < depth ? "past" : i === depth ? "now" : "";
    s += '<li' + (cls ? ' class="' + cls + '"' : "") + (cls === "past" ? ' style="--c:' + rimTrip(i) + '"' : "") + "><i></i>" +
      esc(list[i - 1].name) + (cls === "now" ? '<span class="wv-s">' + esc(sub) + "</span>" : "") + "</li>";
  }
  return s;
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

/* A depth's name over the well: the world's name in its own key light,
   "Depth 5 of 10", the way down with this depth lit, and at most one
   whispered line beneath. It sits where it was placed (bannerY), and
   like the labels it fades to a whisper while a falling piece passes
   behind it, so the name of a world never hides the piece in play. A
   whisper keeps the banner up a second longer, so it can be read. */
var bannerUntil = 0, bannerY = 0, bannerDodge = false, bannerRows = { top: 0, bottom: 0 };
function banner(big, sub, ms, way, whisper) {
  bannerBig.textContent = big || "";
  bannerSub.textContent = sub || "";
  bannerWay.innerHTML = way || "";
  bannerWh.textContent = whisper || "";
  bannerEl.classList.add("on");
  bannerUntil = now() + (ms || BANNER_MS) + (whisper ? 1000 : 0);
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
/* a depth's banner, in full */
function depthBanner(d, whisper) {
  var name = worldName(run.world);
  banner(name, "Depth " + d + " of 10", BANNER_MS, wayHtml(d, 0), whisper);
  say("Depth " + d + " of 10, " + name + "." + (whisper ? " " + whisper : ""));
}
/* At most one whispered line under a depth's name, in this order: the
   first run's promise, a move to try (Drop only — the guide decides), the
   first word about a Breath that is ready, then two quiet landmarks. */
function depthWhisper(d, first) {
  if (first && d === 1) return "Ten depths down, then back up to the surface.";
  var o = guideOffer("banner", false);
  if (o && o.short) return o.short;
  if (run.breathWasReady && !seen("breath")) {
    markSeen("breath");
    return breathWords();
  }
  if (d === 6) return "Halfway down.";
  if (d === 10) return "The last depth. Then the Surface.";
  return "";
}
/* what Breath is, said once, in the hands in use */
function breathWords() {
  if (G && G.words) { try { var w = G.words("breath", "short"); if (w) return w; } catch (e) { fault("Guide.words", e); } }
  if (device === "keys") return "Breath is ready: " + (breathGlyph() || "B") + " rests gravity.";
  if (device === "pad") return "Breath is ready: " + padGlyph("breath", "the left trigger") + " rests gravity.";
  return "Breath is ready: tap the ring and gravity rests.";
}

/* where a toast goes (placeChrome works both out), and whether the one
   showing is a note for the empty upper well rather than the usual spot */
var toastT = 0, toastIn = false, toastDodge = false;
var toastSpot = { x: 195, y: 10, max: 360 };
var toastWell = { on: false, x: 0, y: 0, max: 0, top: 0, bottom: 0 };
/* over a sheet ("Copied: …" from the run card) it comes to the top of the
   screen, above the sheet rather than beside it */
var toastTop = { x: 195, y: 12, max: 420 };
function placeToast() {
  var sp = sheetsOpen ? toastTop : toastIn && toastWell.on ? toastWell : toastSpot;
  if (sp === toastTop) { toastTop.x = vw / 2; toastTop.y = safe.t + 12; toastTop.max = Math.min(420, vw - 24); }
  px(toastEl, "left", sp.x); px(toastEl, "top", sp.y); px(toastEl, "maxWidth", sp.max);
}
function toast(text, ms, inWell) {
  toastEl.textContent = text;
  if (!calmNow) say(text, true);
  toastIn = !!inWell;
  placeToast();
  /* a pill for one line; a softer card corner for two */
  toastEl.classList.toggle("two", toastEl.offsetHeight > 50);
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
  if (calm !== calmNow) { calmNow = calm; html.classList.toggle("calm", calm); }
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
  if (tog) tog.setAttribute("aria-checked", glassOn ? "true" : "false");
  showGlass();
  if (glassOn && fromPlay && run && !run.steady && (state === "play" || state === "paused")) observe(EV_GLASS);
  needResize = true;
}
function showGlass() {
  var vis = glassOn && !!run && !run.steady && (state === "play" || state === "paused" || state === "rest");
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
  /* the glass behind a sheet that has just opened: read in the same task
     the picture was drawn in */
  if (frostWanted) { frostWanted = false; try { frostSnap(); } catch (e) { fault("frost", e); } }
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
   the records, the guide, the coach, and then the words */
function dispatch(ev) {
  var r = run, t = ev.t;
  ev.sync = musicEvent(ev);
  if (R) { try { R.fx(ev); } catch (e) { fault("R.fx", e); } }
  var hk = hapticFor(ev);
  if (hk) haptic(hk);
  observe(ev);
  if (G) { try { G.event(ev); } catch (e) { fault("Guide.event", e); } }
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
      paceSample(r, ev);
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

/* How long the way takes, learned from the player's own play: the play
   time since the last clear, and the lines this clear made, added to the
   pace bucket for this depth (records.js, Modes.estimate). Never at
   learner speed, never while the guide is holding gravity, never in a
   practice well, and a gap of more than two minutes (a piece left
   waiting) is not a pace at all. */
function paceSample(r, ev) {
  if (!r.paceKey || r.learner || r.held != null || r.practice || !Records || !records || !Records.paceAdd) return;
  var dt = r.elapsedMs - r.paceMark;
  r.paceMark = r.elapsedMs;
  if (dt > 0 && dt <= 120000 && ev.n > 0) {
    try { Records.paceAdd(records, r.paceKey, r.modeId === "descent" ? depthOf(r) - 1 : 0, dt, ev.n); } catch (e) { fault("Records.paceAdd", e); }
    r.recordsDirty = true;
  }
}

function onClear(ev) {
  var r = run;
  if (r.coach) hudLesson();
  gFormula.textContent = formula(ev);
  if (r.modeId === "descent") railFill(r);
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
/* a practice well keeps nothing: no Stones, no records, no history */
function observe(ev) {
  if (!Records || !records || !run || run.practice) return;
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
    if (r.modeId === "three") hF1v.classList.add("pb");
    else hF2v.classList.add("pb");
  }
  /* Forty's pace light: a faint warm rim while ahead of your best */
  if (r.pbTime > 0 && r.modeId === "forty") {
    var lines = g.lines || 0;
    var ahead = r.paceLight && lines > 0 && r.elapsedMs < r.pbTime * lines / r.goal;
    if (ahead !== hc.ahead) { hc.ahead = ahead; paceEl.classList.toggle("on", ahead); }
  }
  if (r.watching && !g.active) r.watching = false;
  /* the guide's caption, its demonstration, and its patience */
  /* (the clock array and an index, not the time itself: a double handed
     to another file's function is boxed on the way in) */
  if (G) { try { G.frame(view, clock, FRAME); } catch (e) { fault("Guide.frame", e); } }
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
    if (state === "play" || state === "paused" || state === "rest") hudUpdate();
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

/* ---------- estimates, said in words (§E) ---------- */
function estimate(key, depth, left) {
  if (!Modes || !Modes.estimate || !Modes.about) return null;
  try {
    var b = records && records.pace ? records.pace[key] : null;
    return Modes.about(Modes.estimate(b, key, depth, left));
  } catch (e) { fault("Modes.estimate", e); return null; }
}
/* "about 12 minutes to the Surface at your pace" — learner speed says
   nothing at all, since its pace is not the player's */
function aboutText(a, where) {
  if (!a || learnerOn()) return "";
  return a.text + (where ? " " + where : "") + (a.personal ? " at your pace" : "");
}
/* where a saved Descent stands: its depth, and the lines it has made */
function saveSpot(s) {
  var d = Math.max(1, Math.min(10, finite(s && s.depth, 1) | 0));
  var lines = finite(s && s.lines, finite(s && s.linesBase, 0) + (s && s.state ? finite(s.state.lines, 0) : 0));
  return { depth: d, lines: Math.max(0, Math.min(250, lines)), pace: s && s.opts && s.opts.pace ? s.opts.pace : "gentle" };
}
function saveLeft(sp) { return Math.max(0, (sp.depth >= 10 ? 250 : sp.depth * 25) - sp.lines); }
/* the words under a Continue */
function saveLine(id, s) {
  if (id === "descent") { var sp = saveSpot(s); return "Depth " + sp.depth + " of 10 · " + worldName(worldAt(sp.depth) ? worldAt(sp.depth).id : "dawn"); }
  if (id === "drift") {
    var len = finite(s.opts && s.opts.chapter, 40) || 40, ch = Math.max(1, Math.round(finite(s.chapterEnd, len) / len));
    return "Drift · Chapter " + ch + " · " + worldName((s.opts && s.opts.world) || "dawn");
  }
  if (id === "steady") {
    var m = Math.floor(finite(s.elapsedMs, 0) / 60000), L0 = s.opts ? +s.opts.length : 0;
    return "Steady · " + (L0 ? m + " of " + L0 + " minutes" : m + (m === 1 ? " minute" : " minutes"));
  }
  var md = modeOf(id);
  return md ? md.name : id;
}
function descentPaceNow() { return seen("intro") ? (pref("descentPace") || "gentle") : "gentle"; }

/* The splash's doors. Continue is the run left last. "Enter the well" is
   Descent, so while a Descent is saved it would quietly throw that one
   away, one button from Continue, with no "are you sure?" by design: it
   goes. A saved Descent that isn't the run left last gets its own
   Continue in that place instead; starting Descent afresh is a deliberate
   choice in Modes ("Begin again"), never a slip on the splash. Under the
   doors, the goal in a line: how deep the well goes and roughly how long
   it takes — the whole way for a newcomer, the rest of the way for a
   descent in progress. */
function splashRefresh() {
  var last = saves && saves.last && saves.runs[saves.last] ? saves.last : null;
  var desc = saves && saves.runs.descent ? saves.runs.descent : null;
  var cont = $("goContinue"), play = $("goPlay"), way = $("spWay"), facts = $("spFacts"), factsT = $("spFactsT");
  show(cont, !!last);
  show(cont.parentNode, !!last);
  if (last) setText($("goContSub"), saveLine(last, saves.runs[last]));
  show($("spGoal"), !last);
  show($("spStop"), !last);
  if (last === "descent") {
    var sp = saveSpot(desc), a = estimate("descent." + sp.pace, sp.depth, saveLeft(sp));
    way.innerHTML = wayHtml(sp.depth, Math.max(0, Math.min(25, sp.lines - (sp.depth - 1) * 25)) / 25);
    way.setAttribute("aria-label", wayLabel(sp.depth));
    show(way, true);
    var at = aboutText(a, "to the Surface");
    setText(factsT, sp.lines + " of 250 lines" + (at ? " · " + at : ""));
    show(facts, true);
  } else if (last) {
    show(way, false); show(facts, false);
  } else {
    show(way, false);
    var pace = descentPaceNow(), an = aboutText(estimate("descent." + pace, 1, 25), "");
    setText(factsT, "Descent · 250 lines" + (an ? " · " + an : ""));
    show(facts, true);
  }
  show(play, !(desc && last === "descent"));
  setText(play, last ? (desc ? "Continue the descent" : "Enter the well") : "Enter the well");
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
  if (run) guideRunEnd(run, "leave");
  run = null;
  state = "splash";
  html.classList.remove("playing");
  btnMenu.classList.add("off");
  hudEl.classList.add("off");
  btnBreath.className = "hide";
  coachEl.classList.add("off");
  paceEl.classList.remove("on");
  chipCancel();
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
  scrimSync();
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
   from, so the stepper, the sheet and the falling piece always agree */
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
function tideWords(n) { return n ? (tideMs(n) / 1000).toFixed(2) + " s a row" : "the pieces wait"; }

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
  if (ts < 1 && mode && mode.id !== "practice") eo.timeScale = ts;
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
  chipCancel();
  lastRun = null;
  var o = optsFor(modeId, opts);
  var practice = modeId === "practice";
  var seed = from.seed != null ? from.seed : (pendingSeed != null && !practice ? pendingSeed : newSeed());
  /* a typed code deals one run; the field is emptied so the next visit to
     Modes doesn't seem to promise the same pieces again */
  if (!practice) clearCode();
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
    modeId: modeId, mode: mode, opts: o, seed: seed, code: practice ? "" : codeOf(seed), g: g, eo: eo,
    lesson: lesson, coach: coach, steady: steady, practice: practice,
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
    chapterStart: finite(from.chapterStart, -1),
    chapterHalting: false, halting: !!from.stopPending, halted: false, restShown: false,
    steadyTimeup: !!from.stopPending, stopPending: !!from.stopPending, passEndAt: 0,
    learner: practice ? false : from.learner !== undefined ? !!from.learner : ts < 1, hint: !!from.hint,
    newStones: [], recordsDirty: false, lastHard: false, lastLockX: 4.5, drains: 0,
    goal: +o.lines || (eo.goalLines | 0) || 40, timeLimit: +eo.timeLimit || 180000,
    pbScore: 0, pbTime: 0, pbPassed: false, target: null, watching: false, watchType: null, watchNext: 0,
    passed: false, fin: null, why: "", result: null, surface: false, askFinish: true, askedAt: 0,
    paceLight: !!pref("pbPace"),
    /* the guide's hold on gravity (§D6), the pace the estimates learn from,
       and whether Breath has been ready yet this run */
    held: null, paceKey: "", paceMark: 0, breathNoted: false, breathWasReady: false, firstEver: false,
    guideEnded: false, guideMode: ""
  };
  /* a chapter restored from an older save has no known start, and its
     card then says nothing about how long it took */
  if (run.chapterStart < 0 && !from.restore) run.chapterStart = run.elapsedMs;
  run.paceMark = run.elapsedMs;
  if (modeId === "descent") run.paceKey = "descent." + ((o.pace || "gentle") + "").toLowerCase();
  else if (modeId === "drift") run.paceKey = "drift";
  /* the world: the mode says, Descent by depth */
  var wid = null;
  try { wid = mode.world ? mode.world(o, run.depth) : null; } catch (e) { fault("Modes.world", e); }
  run.world = wid || o.world || (Worlds && Worlds.at ? (Worlds.at(run.depth) || {}).id : null) || "dawn";
  /* a practice well's Breath starts full: it is the move being learned */
  if (practice && o.move === "breath" && g.breath) g.breath.charge = Math.max(g.breath.charge, 10);

  /* what this run is racing: a best, quietly, if there is one */
  var key = null;
  try { key = mode.pbKey ? mode.pbKey(o) : null; } catch (e) { key = null; }
  var best = key ? bestOf(key) : null;
  if (best && best.value > 0) {
    if (mode.pbBetter === "low") run.pbTime = best.value; else run.pbScore = best.value;
  }
  /* a depth is reached by being in it */
  if (modeId === "descent") reach(run, run.depth);

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
  html.classList.add("playing");
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

  /* The guide hears of every run. On the very first Descent or Drift it
     answers "first" and takes its first steps on this real well, holding
     gravity while it does; a practice well is its own. The first run's
     depth banner gets its one promise. */
  var first = !seen("intro") && !steady && !practice;
  var gs = "";
  if (G) {
    try {
      gs = G.runStart({ modeId: modeId, steady: steady, timed: run.timed, lesson: !!lesson, practice: practice,
                        move: practice ? o.move : null, restored: !!from.restore, hasBreath: runHasBreath(run),
                        keep: eo.keep !== false, t: clock[FRAME] }) || "";
    } catch (e) { fault("Guide.runStart", e); gs = ""; }
  }
  run.guideMode = gs;
  run.firstEver = gs === "first" || (!G && first && modeId === "descent");
  if (!steady && !practice) markSeen("intro");
  beginPlay(!!from.restore, fromSplash ? SPLASH_FADE_MS : 0);
}

/* wait: how long the splash still has to fade. The first things to read
   — Ready, a depth's name — and the first fall all wait for it, so
   nothing new appears through the title on its way out. */
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
    var d = depthOf(r), wh = depthWhisper(d, r.firstEver);
    if (wait) setTimeout(function () { if (run === r && state === "play") depthBanner(d, wh); }, wait);
    else depthBanner(d, wh);
  }
  holdScreen();
  showGlass();
  /* the Glass Well switched on before the run counts as looking inside
     the moment the run is played with it */
  if (glassOn && !run.steady) observe(EV_GLASS);
  lastToggle = now();
  /* a few things worth saying exactly once — never in Steady, which shows
     no text during play, and never over the first steps; they wait for
     the next run of anything else */
  if (!r.steady && !r.practice && r.guideMode !== "first") {
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
/* The guide's hold on gravity (§D6): the piece waits at the mouth while a
   move is learned, and the lock only runs if the player brings it down.
   Letting go restores the run's own gravity with the usual 600 ms of
   grace, and the pace clock starts afresh, since held time was not
   anybody's pace. */
function holdGravity(onOff) {
  var r = run;
  if (!r || !r.g || !Well) return;
  if (onOff) {
    if (r.held == null) {
      r.held = r.g.opts.gravity;
      try { Well.setGravity(r.g, 0); } catch (e) { fault("Well.setGravity", e); }
    }
  } else if (r.held != null) {
    try { Well.setGravity(r.g, r.held); } catch (e) { fault("Well.setGravity", e); }
    r.held = null;
    r.paceMark = r.elapsedMs;
    if (state === "play") grace();
  }
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
  if (G) { try { G.pause(); } catch (e) { fault("Guide.pause", e); } }
  showVeil("Paused · tap to return");
  if (how !== "quiet") openMenu(null, true);
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
  if (G) { try { G.resume(); } catch (e) { fault("Guide.resume", e); } }
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
   costs a copy, not a read.) A save never holds the guide's held gravity:
   the run's own is written in its place, so a run left mid-way through
   its first steps comes back falling as it should. */
function saveRun() {
  var r = run;
  if (!r || !r.mode || !r.mode.resumable || !Well) return;
  if (state === "ending" || state === "over" || r.g.over) return;
  loadSaves();
  var snap = null, held = r.held != null, keep = r.g.opts.gravity;
  if (held) r.g.opts.gravity = r.held;
  try { snap = Well.serialize(r.g); } catch (e) { fault("Well.serialize", e); }
  if (held) r.g.opts.gravity = keep;
  if (!snap) return;
  saves.runs[r.modeId] = {
    v: 1, modeId: r.modeId, opts: r.opts, seed: r.seed, state: snap, elapsedMs: r.elapsedMs,
    rests: r.rests, linesBase: r.linesBase, scoreBase: r.scoreBase, depth: r.depth,
    depthScore: r.depthScore, chapterEnd: r.chapterEnd, chapterStart: r.chapterStart, learner: r.learner, hint: r.hint,
    stopPending: !!r.stopPending, lines: totalLines()
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
    depthScore: s.depthScore, chapterEnd: finite(s.chapterEnd, 0), chapterStart: finite(s.chapterStart, -1),
    learner: s.learner, hint: s.hint, stopPending: !!s.stopPending
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
/* the deepest depth reached at a pace, kept by records.js */
function reach(r, d) {
  if (!Records || !records || !Records.reach || r.practice || r.learner) return;
  try { Records.reach(records, ((r.opts.pace || "gentle") + "").toLowerCase(), d); } catch (e) { fault("Records.reach", e); }
  r.recordsDirty = true;
}

/* ---------- leaving ---------- */
/* Leave saves a resumable mode, or ends a timed one; no "are you sure?".
   A practice well simply goes. */
function leaveQuietly() {
  var r = run;
  if (!r) return;
  if (r.practice) { guideRunEnd(r, "leave"); return; }
  if (r.mode && r.mode.resumable && !r.g.over) saveRun();
  else if (state !== "ending" && state !== "over") finishRecords(r, "leave");
  if (r.recordsDirty) saveRecords();
  if (r.coach) { try { r.coach.stop(); } catch (e) { fault("Coach.stop", e); } }
  guideRunEnd(r, "leave");
}
function leaveRun() {
  if (!run) { closeAllSheets(); return; }
  if (run.practice) { practiceDone(run.opts.move, false); return; }
  leaveQuietly();
  closeAllSheets();
  toSplash();
}
/* the guide hears that a run is over exactly once */
function guideRunEnd(r, why) {
  if (!G || !r || r.guideEnded) return;
  r.guideEnded = true;
  try { G.runEnd(why); } catch (e) { fault("Guide.runEnd", e); }
}
function guideNote(name) {
  if (!G) return;
  try { G.note(name); } catch (e) { fault("Guide.note", e); }
}
/* the context the guide decides an offer in (§D7) */
var octx = { modeId: "", steady: false, timed: false, lesson: false, practice: false, playMs: 0, userOpened: false, hasBreath: false, depth: 0 };
function offerCtx(userOpened) {
  var r = run || lastRun;
  octx.modeId = r ? r.modeId : "";
  octx.steady = !!(r && r.steady);
  octx.timed = !!(r && r.timed);
  octx.lesson = !!(r && r.lesson);
  octx.practice = !!(r && r.practice);
  octx.playMs = r ? r.elapsedMs : 0;
  octx.userOpened = !!userOpened;
  octx.hasBreath = runHasBreath(r);
  octx.depth = r && r.modeId === "descent" ? depthOf(r) : 0;
  return octx;
}
function guideOffer(where, userOpened) {
  if (!G || !G.offer) return null;
  try { return G.offer(where, offerCtx(userOpened)) || null; } catch (e) { fault("Guide.offer", e); return null; }
}
function guideTip(el, where, userOpened) {
  if (!el) return;
  el.innerHTML = "";
  if (!G || !G.renderTip) return;
  var o = guideOffer(where, userOpened);
  try { G.renderTip(el, o); } catch (e) { fault("Guide.renderTip", e); el.innerHTML = ""; }
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
  reach(r, d);
  /* the world's name large, "Depth 5 of 10" beneath it, the way down
     with this depth lit, and at most one whispered line */
  depthBanner(d, depthWhisper(d, false));
  EV_WORLD.world = wid;
  appFx(EV_WORLD, false);
  observe(EV_WORLD);
  haptic("world");
  setText(hudCap, "Depth " + d + " of 10" + (r.learner ? " · learner speed" : ""));
  setText(hudName, worldName(wid));
  railPaint(r);
  hudWay.innerHTML = wayHtml(d, 0);
  hudWayV.innerHTML = wayVHtml(d, linesToNext(d, depthLeft(r)));
  hudWvS = hudWayV.querySelector(".wv-s");
  hc.f1 = -1;
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
  if (G) { try { G.pause(); } catch (e) { fault("Guide.pause", e); } }
  if (r.steady) {
    if (S) { try { S.timeUp(); } catch (e) { fault("Steady.timeUp", e); } }
    return;
  }
  appFx(EV_CHAPTER, true);
  var n = driftChapter(r), took = r.elapsedMs - r.chapterStart;
  $("chapterEyebrow").textContent = "Chapter " + n + " · " + r.chapterLen + " lines" +
    (r.chapterStart >= 0 && took > 0 ? " · " + fmtLong(took) : "");
  var lead = "The well is still. Rest here, or carry on with the board just as it is.";
  /* the first word about Breath, at a resting moment rather than mid-play */
  if (r.breathWasReady && !seen("breath")) { markSeen("breath"); lead += " " + breathWords(); }
  $("chapterLead").textContent = lead;
  remindRow($("chapterRemind"));
  guideTip($("chapterTip"), "chapter", false);
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
  if (r.modeId === "drift") { r.chapterEnd += r.chapterLen; r.chapterStart = r.elapsedMs; }
  r.chapterHalting = false; r.halting = false; r.halted = false; r.restShown = false; r.stopPending = false;
  try { Well.resume(r.g); } catch (e) { fault("Well.resume", e); }
  closeSheet("ovChapter");
  hideVeil();
  state = "play";
  lastToggle = now();
  grace();
  holdScreen();
  if (G) { try { G.resume(); } catch (e) { fault("Guide.resume", e); } }
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
    reach(r, 11);
    appFx(EV_SURFACE, true);
    setWorld("dawn", false, false);
  } else {
    EV_END.why = r.why;
    appFx(EV_END, true);
  }
  r.result = finishRecords(r, r.why);
  clearSave(r.modeId);
  guideRunEnd(r, r.why);
  endAt = (t || now()) + (r.surface ? SURFACE_MS : END_MS);
  btnMenu.classList.add("off");
  btnBreath.classList.add("hide");
  showGlass();
  say(r.surface ? "The Surface." : "The well rests.");
}
function finishRecords(r, why) {
  var res = null;
  r.why = why;
  if (Records && records && !r.practice) {
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

/* what kind of run a card or a sheet is about, in one line */
function runEyebrow(r) {
  if (r.modeId === "descent") return "Descent · " + paceName(r.opts.pace);
  if (r.modeId === "forty") return "Forty · " + r.goal + " lines";
  if (r.modeId === "three") return "Three Minutes";
  if (r.modeId === "drift") return "Drift · " + tideLabel(r.tide);
  if (r.lesson) return r.lesson.name || "Lesson";
  return r.mode ? r.mode.name : "";
}

/* The run card: a decision, not a menu. The mode's own title and words;
   for a Descent, the way down lit as far as it went; one number large,
   in the world's light; a plain line about a best (never coloured by
   which way it went); a few more numbers, each with its definition a tap
   away; medals as pebbles; new Stones; and Done and Again, the same
   weight, Done first. No estimate of anything here: the run is over. */
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
  $("endEyebrow").textContent = runEyebrow(r);
  $("endTitle").textContent = title;
  /* Records' plain notes ("with 1 rest", "learner speed") read as plain
     sentences after the lead: facts, never a judgement */
  var notes = [], i;
  if (res.notes) for (i = 0; i < res.notes.length; i++) if (res.notes[i] !== "New personal best") notes.push(sentence(res.notes[i]));
  $("endLead").textContent = lead + (notes.length ? (lead ? " " : "") + notes.join(" ") : "");

  /* Descent: how far down, on the way down itself */
  var wayEl = $("endWay");
  if (r.modeId === "descent") {
    var d = r.surface ? 11 : depthOf(r), lines = r.linesBase + (r.g.lines || 0);
    var sub = r.surface ? "All ten depths, and back up into the dawn." :
      worldName(r.world) + " · Depth " + depthOf(r) + " of 10 · " + Math.min(250, lines) + " of 250 lines";
    wayEl.innerHTML = wayBlock(d, r.surface ? 1 : Math.max(0, Math.min(25, lines - (depthOf(r) - 1) * 25)) / 25, wayLabel(d)) +
      '<p class="subl">' + esc(sub) + "</p>" +
      (r.surface ? '<p class="subl" style="margin-top:2px">' + esc(fmtLong(r.elapsedMs)) + " at the well.</p>" : "");
    if (r.surface) $("endLead").textContent = notes.join(" ");
    wayEl.classList.remove("hide");
  } else { wayEl.innerHTML = ""; wayEl.classList.add("hide"); }

  /* the numbers: the first is the one that matters, large */
  var card = res.card || [], hero = null, delta = null, strip = "", grid = "", defs = "", shown = 0;
  for (i = 0; i < card.length; i++) {
    var it = card[i];
    if (it.kind === "strip") {
      var parts = it.strip || [], bits = [];
      for (var j = 0; j < parts.length; j++) bits.push(parts[j].n + " " + (parts[j].n !== 1 && parts[j].plural ? parts[j].plural : parts[j].label));
      strip = bits.length ? bits.join(" · ") : String(it.value || "");
      continue;
    }
    if (it.kind === "delta") { delta = it; continue; }
    if (r.modeId === "descent" && it.label === "Depth") continue;
    var val = typeof it.value === "number" ? fmtInt(it.value) : it.value;
    if (!hero) { hero = it; $("endHeroK").textContent = it.label; $("endHeroV").textContent = val; }
    else if (shown < 8) {
      shown++;
      grid += '<div title="' + esc(it.tip || "") + '"><small>' + esc(it.label) + "</small><b>" + esc(val) + "</b>" +
        (it.tip ? '<span class="vh">. ' + esc(it.tip) + "</span>" : "") + "</div>";
    }
    if (it.tip) defs += "<dt>" + esc(it.label) + "</dt><dd>" + esc(it.tip) + "</dd>";
  }
  $("endHero").classList.toggle("hide", !hero);
  $("endCard").innerHTML = grid;
  $("endStrip").textContent = strip;
  $("endDefsList").innerHTML = defs;
  $("endDefs").classList.toggle("hide", !defs);
  $("endDefs").removeAttribute("open");
  var dEl = $("endDelta");
  dEl.classList.toggle("pb", !!res.pb);
  dEl.textContent = res.pb ? "New personal best" : deltaWords(delta, r);
  if (res.pb) { appFx(EV_PB, true); haptic("pb"); }

  /* medals, as five pebbles along the way to the last */
  medalsInto($("endMedals"), r, res);

  /* new Stones for the rim */
  var stones = [], seenIds = {}, all = (res.newStones || []).concat(r.newStones || []);
  for (i = 0; i < all.length; i++) {
    if (seenIds[all[i]]) continue;
    seenIds[all[i]] = 1;
    var st = Records && Records.stone ? Records.stone(all[i]) : null;
    stones.push(st ? st.name : all[i]);
  }
  var stEl = $("endStones");
  if (stones.length) {
    stEl.innerHTML = ic("stone") + "<span>New on the rim: <b>" + esc(stones.join(", ")) + "</b></span>";
  } else stEl.innerHTML = "";
  stEl.classList.toggle("hide", !stones.length);

  remindRow($("endRemind"));
  guideTip($("endTip"), "run", false);

  $("endDepthRow").classList.toggle("hide", !depthRow);
  if (depthRow) $("endDepth").textContent = "Begin again from Depth " + depthOf(r) + " · " + worldName(r.world);
  $("endCode").innerHTML = r.code && !r.steady ? 'well code <span class="mono">' + esc(r.code) + "</span>" : "";
  $("endShare").classList.toggle("hide", !r.code || r.steady);
  $("endNote").classList.toggle("hide", !r.code || r.steady);
  openSheet("ovEnd", "endDone");
  music("stop");
  remindBoundary("end");
}
/* a plain line against the best before this run: which way, by how much,
   in words — never a colour, never a judgement */
function deltaWords(it, r) {
  if (!it || typeof it.n !== "number") return "";
  var d = it.n, low = r.mode && r.mode.pbBetter === "low";
  if (d === 0) return "Level with your best";
  var mag = low ? fmtStopwatch(Math.abs(d)) : fmtInt(Math.abs(d));
  if (low) return d < 0 ? "↓ " + mag + " quicker than your best" : "↑ " + mag + " slower than your best";
  return d > 0 ? "↑ " + mag + " more than your best" : "↓ " + mag + " below your best";
}
/* Forty (forty lines) and Three Minutes: the five medals in a row, the
   ones held lit in the world's key light, their marks beneath */
function medalsInto(el, r, res) {
  var kind = r.modeId === "forty" && r.goal === 40 ? "forty" : r.modeId === "three" ? "three" : null;
  var list = kind && Modes && Modes.MEDALS ? Modes.MEDALS[kind] : null;
  if (!list) { el.innerHTML = ""; el.classList.add("hide"); return; }
  var key = null;
  try { key = r.mode && r.mode.pbKey ? r.mode.pbKey(r.opts) : null; } catch (e) { key = null; }
  el.innerHTML = medalsHtml(kind, key) + (res && res.medal && res.medalNew ? '<p class="medal-new">A new medal: ' + esc(res.medal) + "</p>" : "");
  el.classList.remove("hide");
}
function medalsHtml(kind, key) {
  var list = Modes && Modes.MEDALS ? Modes.MEDALS[kind] : null;
  if (!list) return "";
  var held = key && Records && Records.medal ? Records.medal(records, key) : null, rank = -1, i;
  for (i = 0; i < list.length; i++) if (list[i][0] === held) rank = i;
  var h = '<div class="medals" role="img" aria-label="' + esc("Medals: " + (held ? held + " held" : "none yet")) + '"><div class="pebs">';
  for (i = 0; i < list.length; i++) {
    var mark = kind === "forty" ? fmtStopwatch(list[i][1]).replace(/\.00( s)?$/, "") : fmtInt(list[i][1]);
    h += '<div class="peb' + (i <= rank ? " got" : "") + '"><i></i><b>' + esc(list[i][0]) + "</b><small>" + esc(mark) + "</small></div>";
  }
  return h + "</div></div>";
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
  /* a reminder due at a depth waits for the depth's name to have gone */
  if (chipAt && clock[FRAME] >= chipAt) { chipAt = 0; chipShow(); }
}
function remindDue() {
  var mins = +pref("reminder") || 0;
  if (!mins || (run && (run.steady || run.practice))) return 0;
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
/* at a natural boundary the reminder joins whatever is already on screen
   as a row of its own, rather than arriving as one more thing to dismiss */
function remindRow(el) {
  if (!el) return;
  var m = remindDue();
  if (!m) { el.innerHTML = ""; el.classList.add("hide"); return; }
  remindSpent();
  el.innerHTML = ic("comfort") + "<span>" + esc(remindText(m)) + "</span>";
  el.classList.remove("hide");
}
var chipT = 0, chipAt = 0, CHIP_MS = 15000;
function remindBoundary(where) {
  if (where !== "depth") return;
  var m = remindDue();
  if (!m) return;
  remindSpent();
  /* the full sentence, and the short one a phone's one-line chip shows */
  var mw = remindWords(m);
  $("chipText").innerHTML = '<span class="cl">' + esc(remindText(m)) + '</span><span class="cs">' +
    esc(mw.charAt(0).toUpperCase() + mw.slice(1)) + " at the well — a good moment to rest your eyes.</span>";
  /* never together with a depth's name: it waits until a second after */
  chipAt = Math.max(clock[FRAME], bannerUntil) + 1000;
}
function chipShow() {
  if (!run || state !== "play") return;
  chip.classList.remove("hide");
  needResize = true;
  /* non-modal, and it doesn't linger: left alone, it goes by itself */
  if (chipT) clearTimeout(chipT);
  chipT = setTimeout(function () { chipT = 0; hideChip(); }, CHIP_MS);
}
function hideChip() {
  if (chipT) { clearTimeout(chipT); chipT = 0; }
  chip.classList.add("hide");
}
function chipCancel() { chipAt = 0; hideChip(); }

/* ================================================================
   sheets
   ================================================================ */
var OV = [];
var lastFocus = null;
function isOpen(id) { var el = $(id); return !!el && !el.classList.contains("hide"); }
function countSheets() {
  var n = 0;
  for (var i = 0; i < OV.length; i++) if (!OV[i].classList.contains("hide")) n++;
  var was = sheetsOpen;
  sheetsOpen = n;
  if ((n > 0) !== (was > 0) || (n > 0) !== html.classList.contains("sheets")) {
    html.classList.toggle("sheets", n > 0);
    /* the glass is taken the frame after the first sheet opens */
    if (n > 0) frostWanted = true;
  }
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
function focusEl(f, show2) {
  if (!f) return false;
  try { f.focus(show2 ? undefined : { preventScroll: true }); } catch (e) { try { f.focus(); } catch (e2) { return false; } }
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
/* Where the focus goes when a sheet opens (§A7): for the keyboard, the
   default button, ring and all; after a tap, the sheet's title, so a
   screen reader starts by reading what the sheet is, and no ring shows
   on a button nobody aimed at. */
function focusSheet(el, focusId) {
  if (!keyboardLast) {
    var h = el.querySelector("h2[tabindex='-1']");
    if (h && canFocus(h) && focusEl(h)) return;
  }
  focusIn(el, focusId);
}
function openSheet(id, focusId) {
  var el = $(id);
  if (!el) return;
  if (!sheetsOpen) lastFocus = doc.activeElement;
  /* the sheet opened last sits on top, by document order, the same way
     steady.js stacks its own: no z-index arithmetic between files */
  if (el.parentNode === doc.body && el !== doc.body.lastElementChild) doc.body.appendChild(el);
  takeSwap(el);
  el.classList.remove("hide");
  var body = el.querySelector(".sheet");
  if (body) { body.scrollTop = 0; body.style.transform = ""; body.classList.remove("scrolled"); }
  countSheets();
  resetInput();
  focusSheet(el, focusId);
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

/* A sheet chosen from the menu (Settings, Moves, the explainer, Modes…)
   takes the menu's place, sliding in from the side rather than rising
   again, and closing it — ✕, Esc or a pull down — brings the menu back
   with the focus on the item it came from, so changing two settings
   doesn't mean reopening the menu, and Esc never resumes play from under
   a settings sheet. The way back holds through a chain of sheets (Modes,
   then Steady's card; Breathe, then noticing) and is let go the moment
   anything starts a run or the room moves on. */
var menuReturn = null, swapNext = false;
function fromMenu(openerId) {
  if (isOpen("ovMenu")) { menuReturn = { opener: openerId || null, state: state, run: run }; swapNext = true; }
  closeSheet("ovMenu");
}
function takeSwap(el) {
  if (!swapNext || !el) return;
  swapNext = false;
  el.classList.add("swap");
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
  var all = top.querySelectorAll("button, [href], input, select, textarea, summary, [tabindex]"), list = [];
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    if (n.tabIndex < 0 || n.disabled || !canFocus(n)) continue;
    list.push(n);
  }
  if (!list.length) return;
  var at = doc.activeElement, first = list[0], last = list[list.length - 1];
  if (!top.contains(at)) { e.preventDefault(); focusEl(e.shiftKey ? last : first, true); }
  else if (e.shiftKey && (at === first || list.indexOf(at) < 0)) { e.preventDefault(); focusEl(last, true); }
  else if (!e.shiftKey && at === last) { e.preventDefault(); focusEl(first, true); }
}
/* the splash's own first door, for someone using the keyboard */
function focusSplash() {
  if (!keyboardLast || state !== "splash" || sheetsOpen) return;
  var c = $("goContinue"), p = $("goPlay");
  focusEl(canFocus(c) ? c : canFocus(p) ? p : $("goModes"));
}

/* Sheets open and close from five files (this one, sheets.js, steady.js,
   learn.js and guide.js), so the bookkeeping watches the classes rather
   than trusting every caller to report in. */
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
  /* a closed sheet forgets how it last arrived, and where it was dragged */
  for (var i = 0; i < OV.length; i++) {
    if (!OV[i].classList.contains("hide")) continue;
    if (OV[i].classList.contains("swap")) OV[i].classList.remove("swap");
    var sh = OV[i].querySelector(".sheet");
    if (sh && sh.style.transform) sh.style.transform = "";
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
  html.classList.toggle("breathing", isOpen("ovBreathe"));
  if (top && !top.contains(doc.activeElement)) {
    var back = lastIn[top.id];
    if (!(canFocus(back) && top.contains(back) && focusEl(back))) focusSheet(top, null);
  }
  /* a well code belongs to the Modes sheet it was typed into: closing the
     sheet without starting a run lets it go */
  if (!isOpen("ovModes") && (pendingSeed !== null || $("codeIn").value)) clearCode();
  if (state === "over" && !isOpen("ovEnd")) { doneRun(); return; }
  if (menuReturn) {
    if (menuReturn.state !== state || menuReturn.run !== run) menuReturn = null;
    else if (n === 0) {
      var op = menuReturn.opener;
      menuReturn = null;
      swapNext = true;
      openMenu(op, false);
      return;
    }
  }
  if (n === 0) {
    swapNext = false;
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

/* ---------- pulling a phone's sheet down to close it (§B11) ----------
   The grabber and the title bar are handles: a sheet follows the finger
   down (and resists going up), and lets go past 96 px, or on a quick
   flick, by pressing its own ✕ — so every way of closing is the same
   way. Decisions (the run card, the chapter's end) and Steady's whole
   screens can't be pulled away. Content that scrolls never starts a
   pull. Under reduced motion nothing follows the finger; a pull past
   the mark still closes. */
var drag = null;
function wireDrag() {
  on(doc, "pointerdown", function (e) {
    if (drag || (e.button && e.button > 0)) return;
    var t = e.target;
    if (!t || !t.closest) return;
    var handle = t.closest(".grab, .shead");
    if (!handle || t.closest("button, a, input, select, textarea, [role=switch], [role=radio]")) return;
    var sheet = handle.closest(".sheet"), ov = sheet ? sheet.parentNode : null;
    if (!sheet || !ov || !ov.classList || !ov.classList.contains("ov") || ov.classList.contains("hide") ||
        ov.classList.contains("decide") || ov.classList.contains("st-full")) return;
    if (!mm(PHONE_Q) || mm("(max-height:520px)")) return;
    drag = { id: e.pointerId, y0: e.clientY, y: e.clientY, t: e.timeStamp, v: 0, sheet: sheet, ov: ov, moved: false, el: handle };
    try { handle.setPointerCapture(e.pointerId); } catch (x) { /* fine without */ }
  });
  on(doc, "pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dy = e.clientY - drag.y0, dt = e.timeStamp - drag.t;
    if (dt > 0) drag.v = 0.6 * drag.v + 0.4 * ((e.clientY - drag.y) / dt);
    drag.y = e.clientY; drag.t = e.timeStamp;
    if (!drag.moved && Math.abs(dy) < 5) return;
    drag.moved = true;
    if (rmOn()) return;
    drag.sheet.classList.add("dragging");
    drag.sheet.style.transform = "translateY(" + (dy >= 0 ? dy : dy * 0.2).toFixed(1) + "px)";
  });
  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag, dy = e.clientY - d.y0;
    drag = null;
    d.sheet.classList.remove("dragging");
    if (d.moved && e.type === "pointerup" && (dy > 96 || (dy > 24 && d.v > 0.6))) {
      var x = d.ov.querySelector("[data-close]");
      d.sheet.style.transform = "";
      if (x) x.click(); else d.ov.classList.add("hide");
      return;
    }
    if (d.moved && !rmOn() && d.sheet.style.transform) {
      d.sheet.classList.add("springing");
      d.sheet.style.transform = "";
      setTimeout(function () { d.sheet.classList.remove("springing"); }, 260);
    } else d.sheet.style.transform = "";
  }
  on(doc, "pointerup", end);
  on(doc, "pointercancel", end);
  /* the title bar frosts over once something scrolls under it */
  on(doc, "scroll", function (e) {
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains("sheet")) return;
    var sc = t.scrollTop > 4;
    if (t.classList.contains("scrolled") !== sc) t.classList.toggle("scrolled", sc);
  }, true);
  /* a sheet that slid in from the side (from the menu) arrives the
     normal way the next time */
  on(doc, "animationend", function (e) {
    var t = e.target;
    if (!t || !t.classList) return;
    var ov = t.classList.contains("ov") ? t : t.classList.contains("sheet") && t.parentNode && t.parentNode.classList ? t.parentNode : null;
    if (ov && ov.classList.contains("swap")) ov.classList.remove("swap");
  }, true);
}

/* ---------- the pause sheet, which is also the menu ---------- */
/* Where you are, said plainly at the top (the world, the depth, the way
   down, roughly how long the rest of the way takes); Resume; at most
   one move to try, when you opened the sheet yourself; then a short list
   — Moves, Settings, other ways to play, the Logbook, how it works — and
   Leave, with what leaving does in two small words. A race says only
   where it stands, and keeps its board hidden. */
var MENU_ROWS = ["mMoves", "mSettings", "mModes", "mLog", "mLearn"];
function menuKind(r) {
  if (r.steady) return "steady";
  if (r.practice) return "practice";
  if (r.lesson || r.modeId === "challenges") return "lesson";
  if (r.timed) return "race";
  return r.modeId === "drift" ? "drift" : "descent";
}
function openMenu(focusId, userOpened) {
  var live = !!run && (state === "paused" || state === "rest");
  if (!live) { swapNext = false; return; }
  var r = run, kind = menuKind(r), where = $("menuWhere"), h = "";
  /* Steady's pause, Moves and anything else another file added to the
     list or the foot last time is cleared away first */
  var list = $("menuList"), foot = $("menuFoot"), i, kids;
  kids = list.children;
  for (i = kids.length - 1; i >= 0; i--) if (MENU_ROWS.indexOf(kids[i].id) < 0) list.removeChild(kids[i]);
  kids = foot.children;
  for (i = kids.length - 1; i >= 0; i--) if (kids[i].id !== "mLeave" && kids[i].id !== "menuNote") foot.removeChild(kids[i]);
  foot.classList.toggle("steady", kind === "steady");

  var est = "";
  if (kind === "descent") {
    var d = depthOf(r), left = depthLeft(r), a = estimate(r.paceKey, d, left);
    var fs = G && G.active ? guideActive() : null;
    est = linesToNext(d, left);
    var at = aboutText(a, d >= 10 ? "" : "to the Surface");
    h = '<p class="eyebrow">Depth ' + d + " of 10</p>" +
      '<p class="t1">' + esc(worldName(r.world)) + "</p>" +
      wayBlock(d, depthLinesIn(r) / 25, wayLabel(d), 0, true) +
      '<p class="subl">' + esc(fs && fs.kind === "first" ? "First steps · " + fs.step + " of " + fs.of : est + (at ? " · " + at : "")) + "</p>" +
      (fs && fs.kind === "first" ? '<button class="btn quiet mw-skip" id="mSkipFirst" type="button">Skip the first steps</button>' :
        '<p class="notel">Leave any time. It keeps your place.</p>');
  } else if (kind === "drift") {
    var inCh = Math.max(0, Math.min(totalLines() - (r.chapterEnd - r.chapterLen), r.chapterLen));
    var ca = aboutText(estimate("drift", 1, r.chapterLen - inCh), "");
    h = '<p class="eyebrow">' + esc(driftCap(r)) + "</p>" +
      '<p class="t1">' + esc(worldName(r.world)) + "</p>" +
      '<div class="mw-line" aria-hidden="true"><i style="width:' + (100 * inCh / Math.max(1, r.chapterLen)).toFixed(1) + '%"></i></div>' +
      '<p class="subl">' + inCh + " of " + r.chapterLen + " lines" + (ca ? " · this chapter rests in " + ca : "") + "</p>";
  } else if (kind === "race") {
    var g = r.g, line = r.modeId === "forty" ? Math.min(g.lines || 0, r.goal) + " of " + r.goal + " lines · " + fmtStopwatch(r.elapsedMs)
      : fmtClock(r.timeLimit - (typeof g.time === "number" ? g.time : r.elapsedMs)) + " left · level " + (g.level || 1) + " · " + fmtInt(g.score || 0);
    h = '<p class="t1">' + esc(r.mode.name) + "</p>" + '<p class="subl">' + esc(line) + "</p>";
  } else if (kind === "lesson") {
    var prog = hc.s || (r.lesson && r.lesson.teaches) || "";
    h = '<p class="t1">' + esc(r.lesson && r.lesson.name ? r.lesson.name : "Lesson") + "</p>" + (prog ? '<p class="subl">' + esc(prog) + "</p>" : "");
  } else if (kind === "practice") {
    h = '<p class="t1">Practice</p><p class="subl">' + esc(moveName(r.opts.move)) + "</p>";
  } else {
    var len = r.opts && +r.opts.length, mins = Math.floor(r.elapsedMs / 60000);
    h = '<p class="subl">Take all the time you like.</p>' + (len ? '<p class="notel">' + mins + " of " + len + " minutes</p>" : "");
  }
  where.innerHTML = h;
  $("menuTitle").textContent = "Paused";
  $("menuRun").classList.toggle("hide", state !== "paused");

  /* a move to try: only on a sheet the player opened, and not in the
     first half-minute of a run */
  var tip = $("menuTip");
  tip.innerHTML = "";
  if (userOpened && (kind === "descent" || kind === "drift") && r.elapsedMs >= 30000) guideTip(tip, "pause", true);

  var ex = $("menuExtras");
  ex.innerHTML = "";
  if (kind === "drift") driftExtras(ex);
  else if (kind === "lesson" && r.coach) lessonExtras(ex);

  /* the list: what each kind of run has room for */
  show($("mMoves"), kind !== "steady" && kind !== "lesson");
  show($("mSettings"), kind !== "practice");
  show($("mModes"), kind === "descent" || kind === "drift" || kind === "race");
  show($("mLog"), kind !== "steady" && kind !== "practice");
  show($("mLearn"), kind !== "steady" && kind !== "practice");
  setText($("mMovesV"), handsName());

  /* Leave says what it does, in two small words */
  var lt = "Leave", ls = "it's saved";
  if (kind === "race") ls = "ends this run";
  else if (kind === "lesson") ls = "ends the lesson";
  else if (kind === "practice") { lt = "End practice"; ls = ""; }
  else if (kind === "steady") ls = "pick up later";
  setText($("mLeaveT"), lt);
  setText($("mLeaveS"), ls);
  show($("mLeaveS"), !!ls);
  $("mLeave").classList.toggle("two", kind === "steady");
  var note = "";
  if (r.code && kind !== "steady" && kind !== "practice") note = 'well code <span class="mono">' + esc(r.code) + "</span>";
  if (r.learner) note += (note ? " · " : "") + "learner speed";
  $("menuNote").innerHTML = note;
  if (kind === "steady" && S) {
    try { S.pauseExtras(list, foot); } catch (e) { fault("Steady.pauseExtras", e); }
  }
  openSheet("ovMenu", focusId || (state === "paused" ? "mResume" : null));
}
function guideActive() {
  if (!G || !G.active) return null;
  try { return G.active(); } catch (e) { fault("Guide.active", e); return null; }
}
/* "Gestures", "Button tray", "Keyboard", "Controller" */
function handsName() {
  if (G && G.handsName) { try { return G.handsName(); } catch (e) { fault("Guide.handsName", e); } }
  if (device === "keys") return "Keyboard";
  if (device === "pad") return "Controller";
  return pref("scheme") === "buttons" ? "Button tray" : "Gestures";
}
/* the world swatch: the world's own sky, top to horizon */
function swatch(w) {
  return "background:linear-gradient(180deg," + w.sky.top + "," + w.sky.horizon + ")";
}
function worldPick(cur, tag) {
  var list = Worlds && Worlds.list ? Worlds.list : [], h = '<div class="wpick" role="radiogroup" aria-label="World">';
  for (var i = 0; i < list.length; i++) {
    var on2 = list[i].id === cur;
    h += '<button class="wp" type="button" role="radio" aria-checked="' + on2 + '" tabindex="' + (on2 ? 0 : -1) + '" ' + tag + '="' +
      esc(list[i].id) + '"><span class="wp-sw" style="' + swatch(list[i]) + '"></span>' + esc(list[i].name) + "</button>";
  }
  return h + "</div>";
}
function swRow(id, on2, title, sub, attr) {
  return '<button class="sw" type="button" role="switch" id="' + id + '" aria-checked="' + !!on2 + '" aria-labelledby="' + id + 'T"' +
    (sub ? ' aria-describedby="' + id + 'S"' : "") + (attr || "") + '><span class="sw-t"><span id="' + id + 'T">' + esc(title) + "</span>" +
    (sub ? '<span class="sw-s" id="' + id + 'S">' + esc(sub) + "</span>" : "") + '</span><span class="sw-k" aria-hidden="true"></span></button>';
}
/* Drift's own settings live with Drift: the tide, the world, and whether
   the score shows, all changed on the run in hand */
function driftExtras(ex) {
  var t = run ? run.tide : 0;
  ex.innerHTML = '<h3 class="gh">This drift</h3><div class="list">' +
    '<div class="li"><span class="li-t">Tide<span class="li-s" id="xTideS">' + esc(tideWords(t)) + '</span></span>' +
    '<div class="step"><button class="ibtn" id="xTideDn" type="button" aria-label="Slower tide">−</button>' +
    '<output id="xTideOut" aria-live="polite">' + (t ? t : "Off") + '</output>' +
    '<button class="ibtn" id="xTideUp" type="button" aria-label="Faster tide">+</button></div></div>' +
    '<button class="li" id="xWorld" type="button" aria-expanded="false" aria-controls="xWorlds"><span class="li-t">World</span>' +
    '<span class="li-v" id="xWorldV">' + esc(worldName(run.world)) + "</span>" + ic("chevron", "chev") + "</button>" +
    '<div class="wpick-wrap hide" id="xWorlds">' + worldPick(run.world, "data-world") + "</div>" +
    swRow("xHide", !!pref("scoreHidden"), "Hide the score", "") + "</div>";
  function paint() {
    var n = run ? run.tide : 0;
    $("xTideOut").textContent = n ? String(n) : "Off";
    $("xTideS").textContent = tideWords(n);
  }
  press($("xTideDn"), function () { setTide(Math.max(0, run.tide - 1)); paint(); });
  press($("xTideUp"), function () { setTide(Math.min(8, run.tide + 1)); paint(); });
  press($("xWorld"), function () {
    var open = $("xWorld").getAttribute("aria-expanded") !== "true";
    $("xWorld").setAttribute("aria-expanded", String(open));
    show($("xWorlds"), open);
  });
  press($("xHide"), function () {
    var v = !pref("scoreHidden");
    setPref("scoreHidden", v);
    $("xHide").setAttribute("aria-checked", String(v));
  });
  on($("xWorlds"), "click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-world]") : null;
    if (!b || !run) return;
    setPref("driftWorld", b.getAttribute("data-world"));
    radioSet(b);
    $("xWorldV").textContent = worldName(b.getAttribute("data-world"));
  });
}
function setTide(t) {
  if (!run || run.modeId !== "drift") return;
  run.tide = t;
  setPref("driftTide", t);
}
function lessonExtras(ex) {
  ex.innerHTML = '<div class="xrow"><button class="btn small" id="xHint" type="button">Hint</button>' +
    '<button class="btn small" id="xWatch" type="button">Show me</button></div>';
  press($("xHint"), function () { resume(); coachHint(); });
  press($("xWatch"), function () { resume(); coachWatch(); });
}
/* one choice in a radio group: chosen, and the group's one tab stop */
function radioSet(b) {
  var g = b.closest ? b.closest("[role=radiogroup]") : null;
  if (!g) return;
  var all = g.querySelectorAll("[role=radio]");
  for (var j = 0; j < all.length; j++) {
    all[j].setAttribute("aria-checked", String(all[j] === b));
    all[j].tabIndex = all[j] === b ? 0 : -1;
  }
}
/* arrows move the choice inside a radio group, as they do in Settings */
function radioKeys(e) {
  var k = e.key;
  if (k !== "ArrowLeft" && k !== "ArrowRight" && k !== "ArrowUp" && k !== "ArrowDown" && k !== "Home" && k !== "End") return;
  var t = e.target, g = t && t.closest ? t.closest("[role=radiogroup]") : null;
  if (!g || t.getAttribute("role") !== "radio") return;
  var all = g.querySelectorAll("[role=radio]"), i = 0, j;
  for (j = 0; j < all.length; j++) if (all[j] === t) i = j;
  var n = k === "Home" ? 0 : k === "End" ? all.length - 1 : (i + (k === "ArrowRight" || k === "ArrowDown" ? 1 : all.length - 1)) % all.length;
  e.preventDefault();
  var b = all[n], id = b.id, sel = radioSel(b);
  b.click();
  /* the click may have redrawn the group: find the same choice again */
  var again = (id && $(id)) || (sel ? doc.querySelector(sel) : null) || b;
  focusEl(again);
}
function radioSel(b) {
  var attrs = ["data-opt", "data-world", "data-dworld"], s = "";
  for (var i = 0; i < attrs.length; i++) if (b.hasAttribute(attrs[i])) s += "[" + attrs[i] + '="' + b.getAttribute(attrs[i]) + '"]';
  if (b.hasAttribute("data-val")) s += '[data-val="' + b.getAttribute("data-val") + '"]';
  return s || null;
}

/* ---------- Ways to play ---------- */
/* One list of cards, one open at a time. Each says in a line what the
   mode is for and how long it is — ten depths, a quiet twenty minutes, a
   rest every forty lines — and opening one shows its choices, an honest
   estimate learned from your own pace, and one pearl button. Steady's
   card is a door to Steady's own entry card. */
var modesOpen = null;
var MODE_ICON = { descent: "m-descent", steady: "m-steady", drift: "m-drift", forty: "m-forty", three: "m-three", lessons: "learn" };
function openModes() {
  var last = saves && saves.last && saves.runs[saves.last] ? saves.last : null;
  modesOpen = last && last !== "steady" ? last : "descent";
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
    '<polyline points="' + pts + '" fill="none" stroke="rgb(var(--wa))" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>' +
    '<circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="2.4" fill="rgb(var(--wk))"/></svg>';
}
function fmtBest(mode, v) {
  if (!(v > 0)) return "";
  return mode.pbBetter === "low" ? fmtStopwatch(v) : fmtInt(v);
}
function segHtml(label, modeId, opt, vals, names, cur, smalls) {
  var id = "sg_" + modeId + "_" + opt, h = '<div class="mopt"><p class="mopt-h" id="' + id + '">' + esc(label) + "</p>" +
    '<div class="seg" role="radiogroup" aria-labelledby="' + id + '">';
  for (var i = 0; i < vals.length; i++) {
    var on2 = String(vals[i]) === String(cur);
    h += '<button type="button" role="radio" aria-checked="' + on2 + '" tabindex="' + (on2 ? 0 : -1) + '" data-mode="' + modeId +
      '" data-opt="' + opt + '" data-val="' + esc(vals[i]) + '">' + esc(names ? names[vals[i]] || vals[i] : vals[i]) +
      (smalls && smalls[vals[i]] ? "<small>" + esc(smalls[vals[i]]) + "</small>" : "") + "</button>";
  }
  return h + "</div>";
}
function bestHtml(m, key) {
  var best = key ? bestOf(key) : null, hist = null;
  if (!best || !(best.value > 0)) return "";
  try { hist = key && Records && Records.history ? Records.history(records, key) : null; } catch (e) { hist = null; }
  return '<div class="mc-best">Best <b>' + esc(fmtBest(m, best.value)) + "</b>" + sparkline(hist, m.pbBetter === "low") + "</div>";
}
function modeGoal(m) {
  var g = m.goal || m.line || "";
  return g.replace("{chapter}", String(pref("driftChapter") || 40));
}
function actsHtml(id, save, beginLabel, contLabel) {
  var mid = esc(id);
  return '<div class="mc-acts">' + (save ? '<button class="btn primary" type="button" id="mc_' + mid + '" aria-describedby="mt_' + mid +
    '" data-continue="' + mid + '">' + esc(contLabel || "Continue") + '</button><button class="btn quiet" type="button" id="mb_' + mid +
    '" aria-describedby="mt_' + mid + '" data-begin="' + mid + '">Begin again</button>' :
    '<button class="btn primary" type="button" id="mb_' + mid + '" aria-describedby="mt_' + mid + '" data-begin="' + mid + '">' +
    esc(beginLabel || "Begin") + "</button>") + "</div>";
}
function cardHead(id, name, goal, value, door) {
  var mid = esc(id), open = !door && modesOpen === id;
  return '<button class="mc-h" type="button" data-mc="' + mid + '"' + (door ? "" : ' aria-expanded="' + open + '" aria-controls="mcb_' + mid + '"') + ">" +
    ic(MODE_ICON[id] || "modes") + '<span class="mc-t"><span class="t3" id="mt_' + mid + '">' + esc(name) + '</span><span class="subl">' +
    esc(goal) + "</span></span>" + (value ? '<span class="mc-v">' + esc(value) + "</span>" : "") + ic("chevron", "chev") + "</button>";
}
function renderModes() {
  var body = $("modesBody"), html2 = "", list = Modes && Modes.list ? Modes.list : [];
  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    if (m.hidden || m.id === "challenges" || m.group === "learn") continue;
    var o = optsFor(m.id), key = null, save = saves && saves.runs[m.id];
    try { key = m.pbKey ? m.pbKey(o) : null; } catch (e) { key = null; }
    var best = key ? bestOf(key) : null, value = "";
    if (save) value = m.id === "descent" ? "Saved · Depth " + saveSpot(save).depth :
      m.id === "drift" ? "Saved · Chapter " + Math.max(1, Math.round(finite(save.chapterEnd, 40) / (finite(save.opts && save.opts.chapter, 40) || 40))) : "Saved";
    else if (best && best.value > 0) value = fmtBest(m, best.value);
    if (m.id === "steady") {
      html2 += '<div class="mc door" id="mcard_steady">' + cardHead("steady", m.name, modeGoal(m), value, true) + "</div>";
      continue;
    }
    var open = modesOpen === m.id;
    html2 += '<div class="mc' + (open ? " open" : "") + '" id="mcard_' + esc(m.id) + '">' + cardHead(m.id, m.name, modeGoal(m), value, false);
    if (open) html2 += '<div class="mc-b" id="mcb_' + esc(m.id) + '" role="group" aria-labelledby="mt_' + esc(m.id) + '">' + modeBody(m, o, key, save) + "</div>";
    html2 += "</div>";
  }
  /* the lessons, as one more card */
  var done = records && records.lessons ? records.lessons : {}, lessons = Modes && Modes.LESSONS ? Modes.LESSONS : [], passed = 0, li;
  for (li = 0; li < lessons.length; li++) if (done[lessons[li].id]) passed++;
  var lm = modeOf("challenges");
  html2 += '<div class="mc' + (modesOpen === "lessons" ? " open" : "") + '" id="mcard_lessons">' +
    cardHead("lessons", "Lessons", lm && lm.goal ? lm.goal : "Six lessons and two silt wells, in any order.", passed ? passed + " of " + lessons.length + " passed" : "", false);
  if (modesOpen === "lessons") html2 += '<div class="mc-b" id="mcb_lessons" role="group" aria-labelledby="mt_lessons">' + lessonsBody() + "</div>";
  html2 += "</div>";
  body.innerHTML = html2;
}
function modeBody(m, o, key, save) {
  var h = "", a, txt;
  if (m.id === "descent") {
    var pace = (o.pace || "gentle"), paces = Modes && Modes.DESCENT_PACES ? Modes.DESCENT_PACES : [], vals = [], names = {}, lines = {};
    for (var p = 0; p < paces.length; p++) { vals.push(paces[p].id); names[paces[p].id] = paces[p].name; lines[paces[p].id] = paces[p].line; }
    var sp = save ? saveSpot(save) : null, deep = deepest(pace);
    h += wayBlock(sp ? sp.depth : 0, sp ? Math.max(0, Math.min(25, sp.lines - (sp.depth - 1) * 25)) / 25 : 0,
      sp ? wayLabel(sp.depth) : deep ? "Deepest at " + paceName(pace) + ": " + (deep >= 11 ? "the Surface." : "Depth " + deep + " of 10.") : wayLabel(0),
      sp ? 0 : deep >= 11 ? 10 : deep, true);
    h += segHtml("Pace", "descent", "pace", vals, names, pace) + '<p class="seg-line">' + esc(lines[pace] || "") + "</p></div>";
    if (sp) {
      a = aboutText(estimate("descent." + sp.pace, sp.depth, saveLeft(sp)), "to the Surface");
      txt = sp.lines + " of 250 lines" + (a ? " · " + a : "") + (sp.pace !== pace ? " at " + paceName(sp.pace) : "");
    } else {
      var e = estimate("descent." + pace, 1, 25);
      a = e && !learnerOn() ? e.text + (e.personal ? " at your pace" : " at " + paceName(pace)) : "";
      txt = "250 lines" + (a ? " · " + a : "");
    }
    h += '<p class="facts">' + ic("clock") + "<span>" + esc(txt) + "</span></p>";
    h += '<p class="notel">Each depth is one world, 25 lines deep. Leave any time; it keeps your place.</p>';
    var dl = deepLine();
    if (dl) h += '<p class="mc-deep">' + dl + "</p>";
    h += bestHtml(m, key);
    h += actsHtml("descent", save, "Begin", save ? "Continue · Depth " + saveSpot(save).depth : "");
  } else if (m.id === "drift") {
    var t = +o.tide || 0, chap = +o.chapter || 40;
    h += '<div class="mc-tide"><span class="tt" id="sg_drift_tide">' + esc(t ? "Tide " + t : "Tide off") + "<small>" + esc(tideWords(t)) + "</small></span>" +
      '<div class="step" role="group" aria-labelledby="sg_drift_tide"><button class="ibtn" type="button" data-tide="-1" aria-label="Slower tide">−</button>' +
      '<button class="ibtn" type="button" data-tide="1" aria-label="Faster tide">+</button></div></div>';
    h += segHtml("Chapter", "drift", "chapter", Modes && Modes.DRIFT_CHAPTERS ? Modes.DRIFT_CHAPTERS : [40, 100, 150], null, chap) + "</div>";
    h += '<div class="mopt"><p class="mopt-h">World</p>' + worldPick(o.world || "dawn", "data-dworld") + "</div>";
    h += '<div class="list">' + swRow("mcHide", !!pref("scoreHidden"), "Hide the score", "", ' data-sw="scoreHidden"') + "</div>";
    a = aboutText(estimate("drift", 1, chap), "");
    h += '<p class="facts">' + ic("clock") + "<span>" + esc("Chapters of " + chap + " lines" + (a ? " · " + a + " each" : "")) + "</span></p>";
    h += '<p class="notel">Each chapter ends in stillness: rest, or carry on.</p>';
    h += actsHtml("drift", save, "Begin");
  } else if (m.id === "forty") {
    var ln = +o.lines || 40;
    h += segHtml("Lines", "forty", "lines", [20, 40, 100], null, ln) + "</div>";
    if (ln === 40) h += medalsHtml("forty", key);
    h += '<p class="notel">Usually 1–3 minutes.</p>';
    h += bestHtml(m, key);
    h += '<div class="list">' + swRow("mcPace", !!pref("pbPace"), "Warm the rim when I'm ahead of my best", "", ' data-sw="pbPace"') + "</div>";
    h += actsHtml("forty", null, "Begin");
  } else if (m.id === "three") {
    h += medalsHtml("three", key);
    h += '<p class="notel">Always exactly three minutes.</p>';
    h += bestHtml(m, key);
    h += actsHtml("three", null, "Begin");
  }
  return h;
}
function deepest(pace) {
  if (!Records || !records || !Records.deepest) return 0;
  try { return Records.deepest(records, pace) | 0; } catch (e) { fault("Records.deepest", e); return 0; }
}
/* "Deepest: Gentle · Depth 6 · Standard · the Surface" */
function deepLine() {
  var ps = ["gentle", "standard", "swift"], parts = [];
  for (var i = 0; i < ps.length; i++) {
    var d = deepest(ps[i]);
    if (!d) continue;
    parts.push(d >= 11 ? '<span class="surf">' + ic("stone") + esc(paceName(ps[i])) + " · the Surface</span>" :
      "<span>" + esc(paceName(ps[i])) + " · Depth " + d + "</span>");
  }
  return parts.length ? "<span>Deepest:</span>" + parts.join("") : "";
}
function lessonsBody() {
  var lessons = Modes && Modes.LESSONS ? Modes.LESSONS : [], silt = Modes && Modes.SILT ? Modes.SILT : [];
  var done = records && records.lessons ? records.lessons : {}, h = "", i;
  h += '<p class="notel">Take them in any order. Retry as often as you like.</p><div class="list">';
  for (i = 0; i < lessons.length; i++) {
    var ls = lessons[i], lid = esc(ls.id), ok2 = !!done[ls.id];
    h += '<button class="li lesson" type="button" data-lesson="' + lid + '"><span class="num" aria-hidden="true">' +
      (ok2 ? ic("check") : String(ls.n || i + 1)) + '</span><span class="li-t">' + esc(ls.name) + '<span class="li-s">' +
      esc(typeof ls.pass === "string" ? ls.pass : ls.teaches || "") + "</span>" +
      (ls.minutes ? '<span class="li-s mins" aria-hidden="true">About ' + ls.minutes + " minutes</span>" : "") + "</span>" +
      (ok2 ? '<span class="vh">Passed.</span>' : "") +
      '<span class="li-v m">' + (ls.minutes ? "about " + ls.minutes + " min" : "") + "</span>" + ic("chevron", "chev") + "</button>";
  }
  for (i = 0; i < silt.length; i++) {
    var s = silt[i], best = bestOf(challengeKey(s.id)), sid = esc(s.id);
    var sb = best && best.value > 0 ? fmtStopwatch(best.value) : "";
    h += '<button class="li lesson" type="button" data-lesson="' + sid + '"><span class="num" aria-hidden="true">' + ic("m-forty") + "</span>" +
      '<span class="li-t">' + esc(s.name || "Silt") + '<span class="li-s">' + esc(typeof s.pass === "string" ? s.pass : s.teaches || "") + "</span>" +
      (!sb && s.minutes ? '<span class="li-s mins" aria-hidden="true">About ' + s.minutes + " minutes</span>" : "") + "</span>" +
      '<span class="li-v' + (sb ? "" : " m") + '">' + (sb ? "Best " + esc(sb) : s.minutes ? "about " + s.minutes + " min" : "") + "</span>" +
      ic("chevron", "chev") + "</button>";
  }
  h += "</div>";
  h += '<button class="btn quiet" type="button" data-go="moves" style="margin-left:-12px">' + ic("moves", "s18") + "Practise any move" + ic("chevron", "s16") + "</button>";
  return h;
}
function modesClick(e) {
  var b = e.target.closest ? e.target.closest("button") : null;
  if (!b) return;
  var sheet = $("ovModes").querySelector(".sheet"), y = sheet.scrollTop;
  function again(sel) {
    renderModes();
    sheet.scrollTop = y;
    var el = sel ? $("modesBody").querySelector(sel) : null;
    if (el) focusEl(el);
  }
  var mc = b.getAttribute("data-mc");
  if (mc) {
    if (mc === "steady") { closeSheet("ovModes"); openSteadyEntry(); return; }
    modesOpen = modesOpen === mc ? null : mc;
    again('[data-mc="' + mc + '"]');
    var card = $("mcard_" + mc);
    if (card && modesOpen === mc) { try { card.scrollIntoView({ block: "nearest", behavior: rmOn() ? "auto" : "smooth" }); } catch (x) { /* old engine */ } }
    return;
  }
  var opt = b.getAttribute("data-opt");
  if (opt) {
    var modeId = b.getAttribute("data-mode"), map = PREFMAP[modeId], raw = b.getAttribute("data-val");
    var v = /^-?\d+(\.\d+)?$/.test(raw) ? +raw : raw;
    if (map && map[opt]) setPref(map[opt], v);
    again('[data-mode="' + modeId + '"][data-opt="' + opt + '"][data-val="' + raw + '"]');
    return;
  }
  var td = b.getAttribute("data-tide");
  if (td) {
    setPref("driftTide", Math.max(0, Math.min(8, (+pref("driftTide") || 0) + (+td))));
    again('[data-tide="' + td + '"]');
    return;
  }
  var dw = b.getAttribute("data-dworld");
  if (dw) { setPref("driftWorld", dw); again('[data-dworld="' + dw + '"]'); return; }
  var sw = b.getAttribute("data-sw");
  if (sw) { setPref(sw, !pref(sw)); again('[data-sw="' + sw + '"]'); return; }
  if (b.getAttribute("data-go") === "moves") { openSettings("moves"); return; }
  var begin = b.getAttribute("data-begin"), cont = b.getAttribute("data-continue"), lesson = b.getAttribute("data-lesson");
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
/* How deep you have been at each pace, on the way down itself; what you
   have done at the well, in one line; the Stones set into the rim; and
   only the bests that exist. Nothing counts days, nothing decays. */
function lifetime() {
  if (!Records || !records) return null;
  try { return Records.lifetime(records); } catch (e) { fault("Records.lifetime", e); return null; }
}
function hasStone(id) {
  if (Records && Records.has) { try { return Records.has(records, id); } catch (e) { return false; } }
  return !!(records && records.stones && records.stones[id]);
}
/* the stones, set into a rim seen from just above, drawn in the world's
   own light: hairline rims, found stones glowing in the key light */
function rimSvg(stones) {
  var n = stones.length, cx = 150, cy = 92, rx = 128, ry = 66, s = "";
  s += '<svg viewBox="0 0 300 184">' +
    '<defs><radialGradient id="lgS" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fffaf2"/><stop offset=".55" stop-color="rgb(var(--wk))"/><stop offset="1" stop-color="rgb(var(--wk))" stop-opacity=".7"/></radialGradient>' +
    '<radialGradient id="lgW" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="rgb(var(--wsky1))" stop-opacity=".35"/><stop offset="1" stop-color="#05060c" stop-opacity="0"/></radialGradient></defs>' +
    '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (rx + 13) + '" ry="' + (ry + 13) + '" fill="none" stroke="rgb(238 240 248 / .14)"/>' +
    '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (rx - 13) + '" ry="' + (ry - 13) + '" fill="url(#lgW)" stroke="rgb(238 240 248 / .14)"/>';
  for (var i = 0; i < n; i++) {
    var a = -Math.PI / 2 + (i + 0.5) * 2 * Math.PI / n;
    var x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry, got = hasStone(stones[i].id);
    if (got) {
      s += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="13" ry="10" fill="rgb(var(--wk))" opacity=".12"/>' +
        '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="7" ry="5.4" fill="url(#lgS)"/>';
    } else {
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.5" fill="none" stroke="rgb(238 240 248 / .28)"/>';
    }
  }
  return s + "</svg>";
}
function openLog() {
  var stones = Records && Records.STONES ? Records.STONES : [], i, have = 0, found = "", rest = "";
  /* the way down, at each pace */
  var ps = ["gentle", "standard", "swift"], wh = "", paceLine = "";
  for (i = 0; i < ps.length; i++) {
    var d = deepest(ps[i]), w = d >= 1 && d <= 10 ? worldAt(d) : null;
    wh += '<div class="log-way"><span class="lw-t">' + esc(paceName(ps[i])) + "</span>" +
      wayBlock(d >= 11 ? 11 : 0, 0, d >= 11 ? "The Surface, at " + paceName(ps[i]) + "." : d ? "Deepest at " + paceName(ps[i]) + ": Depth " + d + " of 10." : "Not yet played at " + paceName(ps[i]) + ".", d >= 11 ? 10 : d) +
      '<span class="lw-s">' + esc(d >= 11 ? "The Surface" : d ? "Deepest: " + (w ? w.name : "Depth " + d) + " · " + d + " of 10" : "Not yet") + "</span></div>";
    var b = records && records.pace ? records.pace["descent." + ps[i]] : null;
    if (!paceLine && b && Modes && Modes.estimate) {
      var e = null;
      try { e = Modes.estimate(b, "descent." + ps[i], 1, 25); } catch (x) { e = null; }
      if (e && e.personal) {
        var per = Modes.about({ ms: e.ms / 10, lo: e.ms / 10, hi: e.ms / 10, personal: true });
        if (per) paceLine = "Your pace at " + paceName(ps[i]) + ": " + per.text + " a depth.";
      }
    }
  }
  $("logWay").innerHTML = wh;
  $("logPace").textContent = paceLine;
  show($("logPace"), !!paceLine);
  /* at the well, so far: one line of plain facts */
  var life = lifetime() || { pieces: 0, lines: 0, ms: 0, sessions: 0, steadySessions: 0, steadyMs: 0 };
  $("logLife").innerHTML = !life.sessions ? '<p class="log-life">Nothing yet. The first run starts the count.</p>' :
    '<p class="log-life">' + esc(fmtInt(life.pieces) + (life.pieces === 1 ? " piece" : " pieces") + " · " +
      fmtInt(life.lines) + (life.lines === 1 ? " line" : " lines") + " · " + fmtLong(life.ms) + " · " +
      fmtInt(life.sessions) + (life.sessions === 1 ? " run" : " runs")) + "</p>" +
    (life.steadySessions ? '<p class="log-life">' + esc("Steady: " + life.steadySessions + (life.steadySessions === 1 ? " session, " : " sessions, ") +
      fmtLong(life.steadyMs) + " in all.") + "</p>" : "");
  /* the Stones: found first, then the rest, every one visible */
  for (i = 0; i < stones.length; i++) {
    var got = hasStone(stones[i].id);
    if (got) have++;
    var prog = "";
    if (!got && Records.progress) {
      var p = null;
      try { p = Records.progress(records, stones[i].id); } catch (e2) { p = null; }
      if (p && p.have) prog = " (" + p.have + " of " + p.need + ")";
    }
    var li = '<li class="stone' + (got ? " got" : "") + '"><i aria-hidden="true"></i><div><b>' + esc(stones[i].name) + "</b><small>" +
      esc(stones[i].line) + esc(prog) + "</small>" + (got ? '<span class="vh">Found.</span>' : "") + "</div></li>";
    if (got) found += li; else rest += li;
  }
  $("logStonesH").textContent = stones.length ? "Stones · " + have + " of " + stones.length : "Stones";
  $("logRim").innerHTML = stones.length ? rimSvg(stones) : "";
  $("logSum").textContent = !stones.length ? "" : !have ? "Stones arrive on their own as you play. These are the ones there are to find."
    : have + " of " + stones.length + " stones set into the rim.";
  $("logStones").innerHTML = found + rest;
  bestsInto($("logBests"), $("logNot"));
  openSheet("ovLog", null);
}
/* only the bests there are; then, in one line, what hasn't been played */
function bestsInto(el, notEl) {
  var rows = "", not = [], m, key;
  function row(label, k, mode, medalKind) {
    var b = bestOf(k);
    if (!(b && b.value > 0)) { not.push(label); return; }
    var md = null;
    try { md = Records && Records.medal ? Records.medal(records, k) : null; } catch (e) { md = null; }
    rows += '<div class="li best"><span class="li-t">' + esc(label) + "</span>" + '<span class="li-v">' + esc(fmtBest(mode, b.value)) +
      (md && md !== "Reached the Surface" && medalKind ? '<span class="peb" aria-hidden="true"></span><span class="vh">, ' + esc(md) + "</span>" : "") + "</span></div>";
  }
  m = modeOf("descent");
  if (m && m.pbKey) {
    var paces = ["gentle", "standard", "swift"];
    for (var i = 0; i < paces.length; i++) {
      try { key = m.pbKey({ pace: paces[i] }); } catch (e) { key = null; }
      if (key) row("Descent · " + paceName(paces[i]), key, m, false);
    }
  }
  m = modeOf("forty");
  if (m && m.pbKey) {
    var ls = [40, 20, 100];
    for (var j = 0; j < ls.length; j++) {
      try { key = m.pbKey({ lines: ls[j] }); } catch (e) { key = null; }
      if (key) row(ls[j] === 40 ? "Forty" : "Forty · " + ls[j] + " lines", key, m, ls[j] === 40);
    }
  }
  m = modeOf("three");
  if (m && m.pbKey) { try { key = m.pbKey(optsFor("three")); } catch (e) { key = null; } if (key) row("Three Minutes", key, m, true); }
  var silt = Modes && Modes.SILT ? Modes.SILT : [];
  for (var s = 0; s < silt.length; s++) row(silt[s].name || "Silt", challengeKey(silt[s].id), { pbBetter: "low" }, false);
  el.innerHTML = rows;
  show(el, !!rows);
  notEl.textContent = not.length ? "Not played yet: " + not.join(", ") + "." : "";
  show(notEl, !!not.length);
}

/* ---------- How it works: an index, then a page ---------- */
/* On a phone the explainer opens on a short index — the five sections,
   each with a line saying what it holds, then Moves and About — and a
   section is a page pushed inside the same sheet, with a way back. On a
   desk the index stays beside the page. */
var learnCur = "", learnReading = false;
var LEARN_ICON = { why: "learn", how: "modes", steady: "comfort", controls: "controls", refuses: "breath" };
function buildLearnIndex() {
  var list = Learn && Learn.sections ? Learn.sections : [], h = "";
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    h += '<button class="li" type="button" data-sec="' + esc(s.id) + '"><span class="li-ic">' + ic(LEARN_ICON[s.id] || "learn") + "</span>" +
      '<span class="li-t">' + esc(s.title) + (s.sum ? '<span class="li-s">' + esc(s.sum) + "</span>" : "") + "</span>" + ic("chevron", "chev") + "</button>";
  }
  $("learnNav").innerHTML = h || '<p class="note" style="padding:12px 16px">The explainer didn\'t load this time.</p>';
}
function learnTitle(id) {
  var list = Learn && Learn.sections ? Learn.sections : [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].title;
  return "The well, explained";
}
function showLearn(id, focusTitle) {
  var list = Learn && Learn.sections ? Learn.sections : [];
  if (!list.length) { $("learnBody").innerHTML = '<p class="note">The explainer didn\'t load this time.</p>'; return; }
  if (!id) id = learnCur || list[0].id;
  learnCur = id;
  learnReading = true;
  $("learnWrap").classList.add("reading");
  show($("learnBack"), true);
  $("learnTitle").textContent = learnTitle(id);
  var body = $("learnBody");
  body.innerHTML = "";
  try {
    Learn.render(body, id, { device: device, prefs: Prefs, title: false,
      onSection: function (sid) { learnCur = sid; $("learnTitle").textContent = learnTitle(sid); learnMark(); glassRow(); } });
  } catch (e) { fault("Learn.render", e); }
  learnMark();
  glassRow();
  var sheet = $("ovLearn").querySelector(".sheet");
  if (sheet) sheet.scrollTop = 0;
  if (focusTitle) focusEl($("learnTitle"));
}
function learnIndex() {
  learnReading = false;
  $("learnWrap").classList.remove("reading");
  show($("learnBack"), false);
  $("learnTitle").textContent = "The well, explained";
  var sheet = $("ovLearn").querySelector(".sheet");
  if (sheet) sheet.scrollTop = 0;
}
function learnMark() {
  var rows = $("learnNav").querySelectorAll("[data-sec]");
  for (var i = 0; i < rows.length; i++) {
    var cur = rows[i].getAttribute("data-sec") === learnCur && learnReading;
    rows[i].classList.toggle("cur", cur);
    if (cur) rows[i].setAttribute("aria-current", "page"); else rows[i].removeAttribute("aria-current");
  }
}
/* the Glass Well's switch closes "How it works", and says which key or
   button turns it on during play */
function glassRow() {
  show($("learnGlass"), learnCur === "how");
  $("glassToggle").setAttribute("aria-checked", glassOn ? "true" : "false");
  $("glassS").textContent = "The rules at work beside the well." +
    (device === "keys" ? " G toggles it." : device === "pad" ? " View toggles it." : "");
}
function openLearn(id) {
  if (id || mm(DESK_Q)) showLearn(id || learnCur || null, false);
  else learnIndex();
  openSheet("ovLearn", null);
}
function openAbout() {
  var a = Learn ? Learn.ABOUT : null, body = $("aboutBody");
  if (!a) body.innerHTML = "";
  else if (typeof a === "string") {
    /* the credits carry inline HTML (the name, in italics); only text
       that brings its own paragraphs goes in bare */
    if (/<(p|div|ul|ol)\b/i.test(a)) body.innerHTML = a;
    else body.innerHTML = "<p>" + (/<[a-z]/i.test(a) ? a : esc(a)).replace(/\n\n+/g, "</p><p>") + "</p>";
  } else if (a.length) {
    var h = "";
    for (var i = 0; i < a.length; i++) h += "<p>" + esc(a[i]) + "</p>";
    body.innerHTML = h;
  } else if (a.text || a.lines) {
    body.innerHTML = "<p>" + esc(a.text || (a.lines.join ? a.lines.join(" ") : "")) + "</p>";
  }
  openSheet("ovAbout", null);
}

/* ---------- Settings, and Steady's sheets ---------- */
/* One Settings sheet (sheets.js fills it), opened at its root or straight
   at a page ("moves", "look", …). From the menu it takes the menu's place;
   in Steady its root leaves out Controls and Moves. */
function openSettings(page) {
  var el = $("ovSettings");
  takeSwap(el);
  var opts = run && run.steady && (state === "paused" || state === "rest") ? { steady: true } : {};
  if (Sheets) {
    try {
      if (el && !el.classList.contains("hide")) { /* already up: just turn the page */ }
      else if (!sheetsOpen) lastFocus = doc.activeElement;
      if (el && el.parentNode === doc.body && el !== doc.body.lastElementChild) doc.body.appendChild(el);
      Sheets.open(page || "settings", opts);
      countSheets();
      return;
    } catch (e) { fault("Sheets.open", e); }
  }
  openSheet("ovSettings", null);
}
function openSteadyEntry() {
  takeSwap($("ovSteady"));
  if (S) { try { S.openEntry(); countSheets(); return; } catch (e) { fault("Steady.openEntry", e); } }
  openSheet("ovSteady", null);
}
/* Moves, from wherever the guide asks for it: a practice well in play is
   paused first, so the page is read over a still well */
function openMovesFrom() {
  if (run && state === "play") pause("quiet");
  openSettings("moves");
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
      onHelp: function () { if (S && S.openHelp) S.openHelp(); },
      /* the entry card shows the world being chosen in its own light;
         null puts back the light of the room as it stands */
      tint: function (wid) { var w = wid ? worldEntry(wid) : curWorld; if (w) { tinted = ""; tint(w); } },
      onMoves: function () { openSettings("moves"); },
      firstStepsDone: function () { return !G || !G.firstDone || G.firstDone(); }
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
  guideRunEnd(r, reason === "timer" ? "timer" : "pause");
  /* Steady's own closing sheet may be up; the splash goes in beneath it */
  closeSheet("ovMenu");
  toSplash();
}

/* ================================================================
   the guide: first steps, a move to try, the practice well (§D)
   ================================================================ */
function makeGuide() {
  if (!Guide || !Guide.create) return;
  try {
    G = Guide.create({
      prefs: Prefs, stage: stage,
      music: function (kind) { music("ui", kind); },
      say: function (text) { say(text); },
      hold: function (onOff) { holdGravity(!!onOff); },
      practice: function (move, from) { startPractice(move, from); },
      done: function (move, finished) { practiceDone(move, finished); },
      openMoves: function () { openMovesFrom(); },
      touch: TOUCH, fine: FINE,
      motion: function () { return motionPref(); }
    });
  } catch (e) { fault("Guide.create", e); G = null; }
}
/* "Try it" from a tip, or "Practise" on the Moves page: the run in hand
   is put away (a Descent or Drift saved, to come straight back to) and a
   practice well opens in the same world. Another practice from inside a
   practice well keeps the first one's way back. */
function startPractice(move, from) {
  if (!(run && run.practice && practiceReturn)) {
    var live = run && (state === "play" || state === "paused" || state === "rest");
    practiceReturn = {
      from: from || "moves",
      modeId: run && live && run.mode && run.mode.resumable && !run.steady ? run.modeId : null,
      world: run && !run.practice ? run.world : "dawn"
    };
  }
  var world = practiceReturn.world || "dawn";
  closeAllSheets();
  lastRun = null;
  startRun("practice", { move: move || "drop", world: world });
}
/* a practice well's end: no records, nothing kept; back to where it came
   from — the run it interrupted, the splash, or the Moves page */
function practiceDone(move, finished) {
  var r = run;
  if (!r || !r.practice) return;
  var ret = practiceReturn || { from: "moves", modeId: null };
  practiceReturn = null;
  guideRunEnd(r, finished ? "done" : "leave");
  closeAllSheets();
  run = null;
  loadSaves();
  if (ret.modeId && ret.from !== "run" && saves && saves.runs[ret.modeId]) { continueRun(ret.modeId); return; }
  toSplash();
  if (ret.from === "moves") openSettings("moves");
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
   to say so. The guide hears every action and its answer, after the
   coach has had its say. */
function onAction(a, meta) {
  var r = run;
  if (!r || state !== "play") return false;
  /* the Breath ring and the tray are pressed by a mouse as often as a
     finger, so only keys, pads and the well itself say what the hands are */
  if (meta && meta.source && meta.source !== "button" && meta.source !== "hud") {
    device = meta.source === "key" ? "keys" : meta.source === "pad" ? "pad" : "touch";
  }
  if (a === "breath" && !runHasBreath(r)) return false;
  if (r.watching && a !== "softOff") r.watching = false;
  if (r.coach) {
    var verdict = "allow";
    try { verdict = r.coach.action(a, meta, r.g); } catch (e) { fault("Coach.action", e); }
    if (verdict === "rewind") { try { Well.rewind(r.g); } catch (e) { fault("Well.rewind", e); } return false; }
  }
  var ok = false;
  try { ok = !!Well.act(r.g, a, meta); } catch (e) { fault("Well.act", e); ok = false; }
  if (G) { try { G.action(a, meta, ok); } catch (e) { fault("Guide.action", e); } }
  return ok;
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
  /* the device's own reduced-motion setting, changed while the room is
     open, reaches html.rm at once when Motion follows the system */
  if (root.matchMedia) {
    try {
      var rq = root.matchMedia("(prefers-reduced-motion: reduce)");
      var rmChange = function () { applyMotionClass(); applyRenderOpts(); };
      if (rq.addEventListener) rq.addEventListener("change", rmChange); else if (rq.addListener) rq.addListener(rmChange);
    } catch (e) { /* an old engine: the setting is read at the next change */ }
  }

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

  /* which hands are in use, for where the focus should land and whether
     a focus ring shows; and what was last focused, in each sheet and
     outside them */
  doc.addEventListener("keydown", function (e) {
    if (e.key !== "Shift" && e.key !== "Control" && e.key !== "Alt" && e.key !== "Meta") setKbd(true);
  }, true);
  doc.addEventListener("pointerdown", function () { setKbd(false); }, true);
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
  /* every sheet in the page now, the ones other files made at their init
     included, so the count and the watcher see them all */
  OV = doc.querySelectorAll(".ov");
  /* every ✕, including ones other files create later */
  on(doc, "click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-close]") : null;
    if (!t) return;
    e.preventDefault();
    closeSheet(t.getAttribute("data-close"));
  });
  var mo = root.MutationObserver ? new MutationObserver(sheetsChanged) : null;
  if (mo) for (var i = 0; i < OV.length; i++) mo.observe(OV[i], { attributes: true, attributeFilter: ["class"] });
  wireDrag();

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
  press($("goMenu"), function () { openSettings("settings"); });
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
    else if (state === "paused" || state === "rest") openMenu(null, true);
  });
  tapPress(btnBreath, function () { onAction("breath", { source: "hud", t: clock[SIM], repeat: false }); });
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
  press($("mSettings"), function () { fromMenu("mSettings"); openSettings("settings"); });
  press($("mMoves"), function () { fromMenu("mMoves"); openSettings("moves"); });
  press($("mLearn"), function () { fromMenu("mLearn"); openLearn(null); });
  press($("mLog"), function () { fromMenu("mLog"); openLog(); });
  on($("ovMenu"), "keydown", radioKeys);
  on($("menuWhere"), "click", function (e) {
    var b = e.target.closest ? e.target.closest("#mSkipFirst") : null;
    if (!b || !G) return;
    try { G.skip(); } catch (x) { fault("Guide.skip", x); }
    resume();
  });

  on($("modesBody"), "click", modesClick);
  on($("modesBody"), "keydown", radioKeys);
  on($("codeIn"), "input", codeInput);
  press($("codeToggle"), function () {
    var open = $("codeToggle").getAttribute("aria-expanded") !== "true";
    $("codeToggle").setAttribute("aria-expanded", String(open));
    show($("codeBox"), open);
    if (open) focusEl($("codeIn"), true);
  });

  on($("learnNav"), "click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-sec]") : null;
    if (b) showLearn(b.getAttribute("data-sec"), true);
  });
  press($("learnBack"), function () {
    learnIndex();
    var row = $("learnNav").querySelector('[data-sec="' + learnCur + '"]');
    focusEl(row || $("learnTitle"));
  });
  press($("learnAbout"), function () { openAbout(); });
  /* "Moves", from the index, from the controls page, from anywhere a
     page says data-go="moves" */
  on($("ovLearn"), "click", function (e) {
    var b = e.target.closest ? e.target.closest('[data-go="moves"]') : null;
    if (!b) return;
    e.preventDefault();
    openSettings("moves");
  });
  press($("glassToggle"), function () { setGlass(!glassOn, true); });

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
      applySkin(); frostSoon(); break;
    case "graphics":
      graphicsChanged(); frostSoon(); break;
    case "motion":
      applyMotionClass(); applyRenderOpts(); break;
    case "juice": case "nudge": case "labels": case "grid": case "landing": case "lockLight":
      applyRenderOpts();
      if (key === "labels" && !value) labelsOff();
      if (key === "grid" || key === "landing" || key === "lockLight") frostSoon();
      break;
    case "previews": case "keep": case "boardSize":
      applyRenderOpts(); needResize = true;
      if (key === "boardSize") frostSoon();
      break;
    case "textSize":
      applyTextSize(); needResize = true; break;
    case "master": case "music": case "sfx": case "ambience":
    case "soften": case "quiet": case "playOnSilent": case "audioQuality":
      applyAudio(); break;
    case "scheme": case "btnSize": case "lefty": case "btnOpacity":
      if (run && (state === "play" || state === "paused")) { setPad(false); setPad(true); }
      needResize = true;
      break;
    case "keys":
      if (run && runHasBreath(run)) { var k = breathGlyph(); setText(breathKey, k); breathKey.classList.toggle("on", !!k); }
      break;
    case "driftTide":
      if (run && run.modeId === "drift") {
        run.tide = +value || 0;
        /* while the guide holds gravity, the new tide waits to be let go */
        if (run.held != null) {
          run.held = tideMs(run.tide);
          try { Well.setGravity(run.g, 0, tideLevel(run.tide)); } catch (e) { fault("Well.setGravity", e); }
        } else {
          try { Well.setGravity(run.g, tideMs(run.tide), tideLevel(run.tide)); } catch (e) { fault("Well.setGravity", e); }
        }
      }
      break;
    case "driftWorld":
      if (run && run.modeId === "drift" && value) {
        run.world = value;
        setText(hudName, worldName(value));
        setWorld(value, false, false);
        EV_WORLD.world = value;
        observe(EV_WORLD);
      }
      break;
    case "scoreHidden":
      if (run && run.modeId === "drift") hF2.classList.toggle("hide", !!value);
      break;
    case "pbPace":
      if (run) run.paceLight = !!value;
      if (!value) { paceEl.classList.remove("on"); hc.ahead = false; }
      break;
    case "learner":
      if (state === "splash") splashRefresh();
      break;
  }
}
function applyTextSize() {
  var ts = Math.max(1, Math.min(1.5, +pref("textSize") || 1));
  html.style.setProperty("--ts", String(ts));
  html.classList.toggle("ts-big", ts >= 1.3);
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
/* a float at the top: a dot of the world's light, one line, and the word
   that does it — the whole bar is the one button */
function updateBar(worker) {
  if ($("updateBar")) return;
  var b = doc.createElement("button");
  b.id = "updateBar";
  b.type = "button";
  b.innerHTML = '<span class="dot" aria-hidden="true"></span><span>A new version of the well is ready</span><b>Refresh</b>';
  b.addEventListener("click", function () {
    if (state === "play") pause("quiet");
    saveAll();
    b.innerHTML = '<span class="dot" aria-hidden="true"></span><span>Refreshing…</span>';
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
  step("motion", applyMotionClass);
  step("records", loadRecords);
  step("saves", loadSaves);
  step("text size", applyTextSize);
  step("tint", function () { tint(worldEntry("dawn")); });
  step("glass", buildGlass);
  step("renderer", makeRenderer);
  step("input", makeInput);
  step("guide", makeGuide);
  step("steady", makeSteady);
  step("sheets", function () {
    if (Sheets) Sheets.init({ prefs: Prefs, guide: G, openAbout: function () { openAbout(); },
                              onChange: function () { /* Prefs.on below is the one place changes land */ } });
  });
  step("learn index", buildLearnIndex);
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
  resume: function () { resume(); },
  /* the guide's book, and what it is doing now */
  guide: function () { return G && G.state ? G.state() : null; },
  guideActive: function () { return guideActive(); },
  /* first steps from the start, as if this browser had never played:
     the guide's first-steps marks are cleared and a Descent begins */
  firstSteps: function (hands) {
    var gp = pref("guide");
    if (gp && typeof gp === "object") {
      gp.first = { gestures: 0, buttons: 0, keys: 0, pad: 0 };
      setPref("guide", gp);
    }
    if (hands === "buttons" || hands === "gestures") setPref("scheme", hands);
    closeAllSheets();
    startRun("descent", { pace: "gentle" });
  },
  practice: function (move) { startPractice(move, "moves"); },
  offer: function (where) { return guideOffer(where, true); },
  estimate: function (key, depth, linesLeft) {
    return Modes && Modes.estimate ? Modes.estimate(records && records.pace ? records.pace[key] : null, key, depth, linesLeft) : null;
  },
  tint: function (id) { tint(worldEntry(id)); },
  settings: function (page) { openSettings(page || "settings"); },
  frost: function () { frostWanted = true; }
};

boot();
})(typeof self !== "undefined" ? self : this);
