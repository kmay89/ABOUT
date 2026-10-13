/* input.js — keys, fingers, buttons and pads, turned into moves.

   Everything a hand does arrives here as an event with a time on it, and
   leaves as one of the engine's words — left, right, cw, hard, softOn —
   delivered on the 240 Hz simulation tick rather than whenever the browser
   got round to it. A falling-blocks game is decided in the few milliseconds
   between "I pressed" and "it moved", and those milliseconds have to be the
   same on a phone drawing thirty frames a second in Low Power Mode as on a
   Mac drawing a hundred and twenty.

   ## Time

   Every key, touch and pad edge is queued with its own timeStamp, and
   I.tick(t) applies the ones that are due, in order, each stamped with the
   moment it happened. The app's simulation clock and the browser's event
   clock are not assumed to be the same clock. The lag between them is
   measured afresh every frame — where the last tick landed against the
   moment that frame began — so a sim clock that started at zero, sat
   paused for a minute, or swallowed a hitch still lines up, and one tick of
   slack on top means nothing that arrived before a frame began has to wait
   for the next one.

   The auto-repeat is not here. DAS, ARR and DCD live in engine.js as a pure
   machine, Well.Das, so tools/rules-check.js can prove its timing in node;
   this file only tells it when a direction went down and when it came up.
   The browser's own key repeat (e.repeat) is ignored completely: it runs at
   whatever rate the operating system was set to, which would make the game
   a different game on every keyboard.

   ## Fingers

   A drag is relative, the way the paddle next door in breaker/ is: put a
   thumb anywhere and slide, and the piece moves one column for every 0.8 of
   a cell the thumb travels, remainder carried, so a slow drag and a quick
   one arrive at the same column. The finger is the auto-repeat. The first
   ten pixels decide the axis. A tap is anything shorter than that and
   quicker than a quarter of a second, judged when the finger lifts: the
   right half of the screen turns clockwise, the left half the other way.

   The hard drop is guarded four ways — speed over the last 80 ms, a cell
   and a half of travel since the stroke began, within thirty degrees of
   straight down, and never in the first moments after a piece appears —
   because a hard drop nobody meant is the most punishing thing a touch game
   can get wrong, and the only one that cannot be taken back. A flick fires
   the moment it is recognised rather than at the lift, and then the touch
   is spent: nothing more comes of it until every finger is off the glass.

   A slow drag down is a soft drop measured in rows, not a switch: a row for
   every 0.8 of a cell. The engine only knows soft drop on and off, so this
   file holds it on until the piece has come down as far as the thumb has —
   watching the piece itself when the app lends it the game (opts.game), and
   timing it from the soft-drop factor when it does not.

   ## Buttons and pads

   The Buttons scheme is a tray of big keys laid out like a gamepad — a
   d-pad under one thumb (up drops, down soft-drops), the turns and Keep
   under the other — with the same DAS, ARR and soft-drop factor as a
   keyboard, mirrored for left hands. Gamepads are polled once a frame (the
   API only ever offers snapshots); their edges become the same queued
   presses keys make, the stick has hysteresis so a thumb resting near the
   threshold cannot chatter, and the Home button is never bound — it belongs
   to the system.

   ## Haptics

   iPhone Safari has no vibration API. What it has is the switch: since
   Safari 18, flipping an <input type="checkbox" switch> plays the system
   tick — but only for a trusted click, which since iOS 26.5 means a real
   finger. So the play surface is a transparent <label> for a hidden switch:
   a real tap on it is a real click on the switch, and the phone ticks with
   the turn. Drags and flicks never click, so they never tick. That is also
   Apple's own advice about not overdoing haptics, and it is the only honest
   way to do it: script never calls label.click(), which would not tick
   anyway, and pretending otherwise is how a page ends up buzzing at people.
   Android gets navigator.vibrate with the brief's patterns, a gamepad gets
   a short rumble for the three biggest moments, and all of it goes quiet
   with the Haptics setting.

   ## Guards

   While a run is live, and only then: no pinch (gesturestart in Safari,
   a ctrl+wheel in Chromium and Firefox), no long-
   press menu, no back-swipe from a screen edge (a touchstart within 24 px
   of either side is cancelled), and no gesture that starts in the strip
   above the home indicator. Menus and the explainer stay zoomable, because
   that is where people read.                                              */
(function (root) {
"use strict";

var Input = {};

/* ================================================================
   vocabulary
   ================================================================ */

/* the engine's words, by index, so the hot path passes small integers */
var ACTIONS = ["left", "right", "cw", "ccw", "180", "hold", "hard", "softOn", "softOff",
               "dasLeft", "dasRight", "breath"];
var A_LEFT = 0, A_RIGHT = 1, A_CW = 2, A_CCW = 3, A_HALF = 4, A_HOLD = 5, A_HARD = 6,
    A_SOFT_ON = 7, A_SOFT_OFF = 8, A_DAS_LEFT = 9, A_DAS_RIGHT = 10, A_BREATH = 11;

/* the things a key can be bound to, in Prefs' own names */
var CONTROLS = ["left", "right", "soft", "hard", "cw", "ccw", "flip", "hold", "breath", "glass", "pause"];
var C_LEFT = 0, C_RIGHT = 1, C_SOFT = 2, C_HARD = 3, C_CW = 4, C_CCW = 5, C_FLIP = 6,
    C_HOLD = 7, C_BREATH = 8, C_GLASS = 9, C_PAUSE = 10, NCTRL = 11;

var SOURCES = ["key", "touch", "pad", "button"];
var S_KEY = 0, S_TOUCH = 1, S_PAD = 2, S_BUTTON = 3;

/* what a missing Prefs falls back to — the same defaults prefs.js ships,
   Control left out of the turn keys on a Mac as it is there */
var MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.platform || "") &&
          (navigator.maxTouchPoints || 0) < 2;
var DEF = {
  das: 167, arr: 33, sdf: 20, dcd: 0, hdTouch: 133, hdKeys: 0,
  irs: false, ihs: false, modern: false, keep: true,
  scheme: "gestures", tap: "sides", sensitivity: 1, lefty: false,
  btnSize: 64, btnOpacity: 1, haptics: true,
  keys: { left: ["ArrowLeft"], right: ["ArrowRight"], soft: ["ArrowDown"], hard: ["Space"],
          cw: ["ArrowUp", "KeyX"], ccw: MAC ? ["KeyZ"] : ["KeyZ", "ControlLeft", "ControlRight"], flip: ["KeyA"],
          hold: ["KeyC", "ShiftLeft", "ShiftRight"], breath: ["KeyB"], glass: ["KeyG"],
          pause: ["Escape", "KeyP"] }
};

/* ---------- the gesture numbers (design brief §9.3) ----------
   Every one of these is a trade between "it did what I meant" and "it did
   something I did not mean", and the brief asks for them to be play-tested
   with real thumbs. They live together here so that is a one-screen job. */
var TICK = 1000 / 240;
var SLOP = 10;              /* px: a finger that wandered less than this was still tapping  */
var TAP_MS = 250;           /* ...and one that stayed longer than this was resting          */
var LOCK_RATIO = 1.2;       /* the axis is horizontal if |dx| ≥ 1.2·|dy| at ten pixels      */
var STEP_CELLS = 0.8;       /* a column per 0.8 cell of travel, divided by sensitivity      */
var REVERSE = 0.35;         /* ...but turning back undoes a column after 0.35 of a step     */
var SOFT_CELLS = 0.8;       /* a row of soft drop per 0.8 cell                              */
var FLICK_MS = 80;          /* the window a flick's speed is measured over                  */
var FLICK_MIN_MS = 8;       /* a "window" shorter than this is two samples and some noise   */
var FLICK_DOWN = 1.1;       /* px/ms down to hard-drop — deliberately high                  */
var FLICK_UP = 1.0;         /* px/ms up to Keep                                             */
var FLICK_CELLS = 1.5;      /* cells of travel since the stroke turned this way             */
var TAN_DOWN = 0.5774;      /* tan 30°: within thirty degrees of straight down              */
var TAN_UP = 0.7002;        /* tan 35°: a little more give upwards, where a slip only Keeps */
var TURN_BACK = 4;          /* px a stroke may wobble back before it counts as reversing    */
var RELOCK_CELLS = 1.5;     /* a sideways drag that then goes plainly down for this long
                               becomes a soft drop without lifting the thumb                */
var EDGE = 24;              /* px from a side edge where a touch might be a back-swipe      */
var BAND = 24;              /* px above the home indicator where no gesture may begin       */
var TWO_DOWN_MS = 150;      /* two fingers that landed this close together might be a tap   */
var TWO_LIFT_MS = 250;      /* ...if they also lift this close together                     */
var TWO_HOLD_MS = 400;      /* ...and neither stayed down longer than this                  */
var KEEP_MIN = 44;          /* the Keep niche answers to at least a 44 pt square            */
var RING = 64;              /* samples per finger: 80 ms at 800 Hz, far beyond any screen   */
var QN = 256;               /* queued events: many seconds of frantic play between ticks    */

/* ---------- gamepads (standard mapping, brief §9.4) ---------- */
var STICK_ON = 0.5, STICK_OFF = 0.35;     /* engage, release: the gap is the hysteresis */
var TRIG_ON = 0.5, TRIG_OFF = 0.3;        /* the left trigger is analogue; half a pull is a press */
var PAD_SLOTS = 4, PAD_BTNS = 17;
/* button index, control — 2 (left face), 7 (right trigger), 10, 11 and
   16 (Home) are deliberately absent */
var PAD_MAP = [14, C_LEFT, 15, C_RIGHT, 13, C_SOFT, 12, C_HARD, 0, C_CW, 1, C_CCW,
               3, C_FLIP, 4, C_HOLD, 5, C_HOLD, 6, C_BREATH, 8, C_GLASS, 9, C_PAUSE];
var RUMBLE = { startDelay: 0, duration: 60, strongMagnitude: 0.2, weakMagnitude: 0.4 };
var RUMBLE_SOFT = { startDelay: 0, duration: 60, strongMagnitude: 0.1, weakMagnitude: 0.2 };

/* ---------- haptic patterns (brief §8.1, the Android column) ----------
   The priority keeps a small event from cutting a big pattern short: vibrate()
   replaces whatever is playing, and the lock that lands a beat after a
   Quad must not swallow the Quad. */
var BUZZ = {
  rotate:   { p: 8, pri: 1 },
  lock:     { p: 8, pri: 1 },
  hard:     { p: 14, pri: 2 },
  keep:     { p: [6, 30, 6], pri: 2 },
  single:   { p: [10, 40, 10], pri: 3 },
  "double": { p: [10, 40, 10, 40, 10, 40, 10], pri: 4 },
  triple:   { p: [10, 40, 10, 40, 10, 40, 10, 40, 10, 40, 10], pri: 5 },
  quad:     { p: [12, 35, 12, 35, 24], pri: 6, rumble: true },
  twist:    { p: [10, 40, 10], pri: 4 },
  twistBig: { p: [12, 35, 12, 35, 24], pri: 6, rumble: true },
  empty:    { p: [15, 60, 15], pri: 7, rumble: true },
  world:    { p: [20, 80, 20], pri: 3 },
  pb:       { p: 15, pri: 5 }
};
(function () {
  /* each pattern's length, and its reduced form — the first pulse alone —
     worked out once rather than per buzz */
  for (var k in BUZZ) {
    var b = BUZZ[k], p = b.p, len = 0, i;
    if (typeof p === "number") { len = p; b.soft = p; }
    else { for (i = 0; i < p.length; i++) len += p[i]; b.soft = p[0]; }
    b.len = len;
  }
})();

/* ---------- the tray's drawings ----------
   Hand-drawn 24-unit icons, stroked in the button's own colour, so the
   tray needs no font to have the right arrows in it and no image files. */
function icon(d, flip) {
  return '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" focusable="false"' +
    ' style="display:block;overflow:visible" fill="none" stroke="currentColor" stroke-width="2.3"' +
    ' stroke-linecap="round" stroke-linejoin="round">' +
    (flip ? '<g transform="translate(24 0) scale(-1 1)">' : '<g>') + d + '</g></svg>';
}
var ICON_LEFT = '<path d="M14.5 5.5 8 12l6.5 6.5"/>';
var ICON_RIGHT = '<path d="M9.5 5.5 16 12l-6.5 6.5"/>';
var ICON_SOFT = '<path d="M6 9.5l6 6 6-6"/>';
var ICON_HARD = '<path d="M12 3.5v11.5M7 10.5l5 5 5-5M5 20.5h14"/>';
/* a turn: most of a circle, travelling clockwise over the top, with a
   solid arrowhead where it is heading (the counter-clockwise key is the
   same drawing in a mirror) */
var ICON_TURN = '<path d="M19.5 9.3A8 8 0 1 1 10.9 4.1"/>' +
  '<path d="M15.6 3.4 10.2 1 11 7.2Z" fill="currentColor" stroke-width="1.4"/>';

/* the tray, as a gamepad: d-pad on one side (up is the drop), turns and
   Keep on the other — the same shape §9.4 gives a real controller, so the
   two schemes teach each other. Each row: control, cluster (0 the d-pad,
   1 the turns), row, right-handed column within the cluster, whether it is
   a haptic label, and its spoken name. */
var TRAY = [
  [C_HARD, 0, 0, 1, false, "Hard drop"],
  [C_LEFT, 0, 1, 0, false, "Move left"],
  [C_SOFT, 0, 1, 1, false, "Soft drop"],
  [C_RIGHT, 0, 1, 2, false, "Move right"],
  [C_HOLD, 1, 0, 1, true, "Keep"],
  [C_CCW, 1, 1, 0, true, "Turn counter-clockwise"],
  [C_CW, 1, 1, 1, true, "Turn clockwise"]
];

/* engine.js is loaded first in the page; in node it is next to us */
function wellKit() {
  if (root.Well) return root.Well;
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    try { return require("./engine.js"); } catch (e) { return null; }
  }
  return null;
}

/* Only reached if engine.js failed to load: a held direction then moves
   once and never repeats, which is a worse game but still a game, rather
   than a page that throws on the first key. */
function stillDas() {
  function none() {}
  return {
    set: none, cut: none, tick: none, reset: none,
    press: function (dir, t, emit) { if (emit) emit(dir < 0 ? "left" : "right", t, false); },
    release: none, charge: function () { return 0; }
  };
}

function noop() {}
var made = 0;              /* instances, so each one's switch has its own id */

/* ================================================================
   Input.create
   ================================================================ */
Input.create = function (opts) {
  opts = opts || {};
  var I = {};
  var doc = typeof document !== "undefined" ? document : null;
  var win = typeof window !== "undefined" ? window : null;
  var nav = typeof navigator !== "undefined" ? navigator : null;
  var prefs = opts.prefs || null;
  var onAction = typeof opts.onAction === "function" ? opts.onAction : null;
  var onUI = typeof opts.onUI === "function" ? opts.onUI : null;
  var enabledFn = typeof opts.enabled === "function" ? opts.enabled : null;
  /* armed: a run is about to be live (Forty's and Three Minutes' Ready).
     A key, button or stick held then is remembered, never acted on, and
     becomes a press at the first live tick — already charged, as holding
     a direction through a countdown is meant to be. */
  var armedFn = typeof opts.armed === "function" ? opts.armed : null;
  var early = Object.create(null), earlyN = 0;   /* held through Ready, not yet counted */
  var layoutFn = typeof opts.layout === "function" ? opts.layout : null;
  var gameFn = typeof opts.game === "function" ? opts.game : null;
  var now = typeof opts.now === "function" ? opts.now
    : (typeof performance !== "undefined" && typeof performance.now === "function")
      ? function () { return performance.now(); } : function () { return Date.now(); };
  var Well = opts.well || wellKit();
  var disposed = false;

  function pref(k) {
    var v = prefs && typeof prefs.get === "function" ? prefs.get(k) : undefined;
    return v === undefined || v === null ? DEF[k] : v;
  }
  function live() { return !disposed && (!enabledFn || !!enabledFn()); }
  function hapticsOn() { var h = pref("haptics"); return h !== false && h !== "off"; }

  /* the one meta object every action carries — reused, so a long run of
     auto-repeat allocates nothing. Copy the fields if you keep them. */
  var meta = { source: "key", t: 0, repeat: false };
  var uiMeta = { source: "key", t: 0, playing: true };

  /* An event's timeStamp is on the same clock as performance.now() in
     every browser this room supports. Anything else — missing, epoch-based,
     or absurd — is replaced by now, which costs at most a frame of
     precision and never strands an event in the queue. */
  function evTime(e) {
    var w = now(), t = e && e.timeStamp;
    if (!(t > 0) || t > w + 50 || t < w - 5000) return w;
    return t;
  }

  /* ================================================================
     the queue: typed-array ring, nothing allocated per event
     ================================================================ */
  var Q_DOWN = 1, Q_UP = 2, Q_ACT = 3, Q_SOFT = 4, Q_SOFT_END = 5, Q_SOFT_CANCEL = 6;
  var qKind = new Uint8Array(QN), qArg = new Uint8Array(QN), qSrc = new Uint8Array(QN),
      qRep = new Uint8Array(QN), qTime = new Float64Array(QN);
  var qHead = 0, qLen = 0;
  function push(kind, arg, src, rep, t) {
    /* full only if the app stopped ticking without calling reset(); then the
       newest presses are the ones to lose — they were made blind */
    if (qLen >= QN) return;
    var i = (qHead + qLen) % QN;
    qKind[i] = kind; qArg[i] = arg; qSrc[i] = src; qRep[i] = rep ? 1 : 0; qTime[i] = t;
    qLen++;
  }

  /* ================================================================
     emitting
     ================================================================ */
  var lastSrc = -1;          /* the hand the player is using now, for haptics */
  var shiftBlocked = false, shiftKnown = false;
  var tapTurnAt = -1e9;      /* wall time of the last turn a finger made */

  function emit(a, src, t, rep) {
    meta.source = SOURCES[src]; meta.t = t; meta.repeat = !!rep;
    var r = onAction ? onAction(ACTIONS[a], meta) : undefined;
    if (a === A_LEFT || a === A_RIGHT || a === A_DAS_LEFT || a === A_DAS_RIGHT) {
      shiftKnown = r === true || r === false;
      shiftBlocked = r === false;
    } else if ((a === A_CW || a === A_CCW || a === A_HALF) && (src === S_TOUCH || src === S_BUTTON)) {
      tapTurnAt = now();
    }
    return r;
  }
  function ui(name, src, t, playing) {
    uiMeta.source = SOURCES[src]; uiMeta.t = t; uiMeta.playing = playing;
    if (onUI) onUI(name, uiMeta);
  }

  /* ================================================================
     the auto-repeat — Well.Das from engine.js, fed by every held source
     ================================================================ */
  var das = (Well && Well.Das && typeof Well.Das.create === "function")
    ? Well.Das.create({ das: +pref("das"), arr: +pref("arr"), dcd: +pref("dcd") }) : stillDas();
  var held = new Int16Array(NCTRL);       /* how many physical inputs hold each control */
  var pressT = new Float64Array(NCTRL);   /* when each control last went down (sim ms) */
  var pressSrc = new Uint8Array(NCTRL);
  var inWait = new Uint8Array(NCTRL);     /* pressed with no piece in the well (engine buffered it) */
  var dirSrc = [S_KEY, S_KEY];            /* who is holding left [0] and right [1] */
  var dasRep = false;

  function emitDas(name, t, rep) {
    var a = name === "left" ? A_LEFT : name === "right" ? A_RIGHT
          : name === "dasLeft" ? A_DAS_LEFT : name === "dasRight" ? A_DAS_RIGHT : -1;
    if (a < 0) return;
    var left = a === A_LEFT || a === A_DAS_LEFT;
    emit(a, dirSrc[left ? 0 : 1], t, typeof rep === "boolean" ? rep : dasRep);
  }
  function syncHandling() {
    das.set({ das: +pref("das"), arr: +pref("arr"), dcd: +pref("dcd") });
  }
  /* DCD: a turn or Keep against a wall pauses a charged auto-repeat for a
     moment, so the piece that was pinned to the wall does not leave it the
     instant it fits. "Against a wall" is the last shift having failed when
     the app tells us (onAction returning false); when it does not say, a
     fully charged repeat is taken to mean the wall was reached. */
  function cutAfterTurn(m) {
    if (!(+pref("dcd") > 0) || (held[C_LEFT] <= 0 && held[C_RIGHT] <= 0)) return;
    if (shiftBlocked || (!shiftKnown && das.charge(m) >= 1)) das.cut(m);
  }

  /* ================================================================
     soft drop: one switch the engine sees, many hands behind it
     ================================================================ */
  var softIsOn = false;
  /* the touch soft drop, counted in rows */
  var ts = { live: false, open: false, on: false, want: 0, got: 0, base: 0, hasBase: false,
             onAt: 0, gotAtOn: 0, rep: false };

  function softSync(src, t, rep) {
    var want = held[C_SOFT] > 0 || ts.on;
    if (want === softIsOn) return;
    softIsOn = want;
    emit(want ? A_SOFT_ON : A_SOFT_OFF, src, t, rep);
  }
  function pieceY() {
    var g = gameFn ? gameFn() : null;
    return g && g.active ? g.active.y : null;
  }
  function softStop(t) {
    ts.live = ts.open = false; ts.want = ts.got = 0; ts.hasBase = false; ts.rep = false;
    if (ts.on) { ts.on = false; softSync(S_TOUCH, t, true); }
  }
  /* Run once a tick, after the queue. With the game in hand the rows are
     read off the piece itself — exact at any gravity, and a piece that has
     reached the floor is simply done. Without it, the engine's own rule is
     the estimate: the first row comes with the press, then SDF rows a
     second (the floor of the soft-drop speed, brief §3.7). */
  function softControl(t) {
    if (!ts.live) return;
    if (gameFn) {
      var g = gameFn(), a = g ? g.active : null;
      if (!a) ts.got = ts.want;
      else {
        if (!ts.hasBase) { ts.base = a.y; ts.hasBase = true; }
        var got = ts.base - a.y;
        if (got < 0) { ts.base = a.y; got = 0; }
        var land = Well && typeof Well.landingY === "function" ? Well.landingY(g) : null;
        if (land !== null && land !== undefined && a.y <= land) got = ts.want;
        ts.got = got;
      }
    } else if (ts.on) {
      var sdf = +pref("sdf");
      ts.got = !(sdf < 1e6) ? ts.want : ts.gotAtOn + 1 + Math.floor((t - ts.onAt) * sdf / 1000);
    }
    if (ts.got < ts.want) {
      if (!ts.on) {
        ts.on = true; ts.onAt = t; ts.gotAtOn = ts.got;
        softSync(S_TOUCH, t, ts.rep);
        ts.rep = true;
      }
    } else {
      if (ts.on) { ts.on = false; softSync(S_TOUCH, t, true); }
      if (!ts.open) { ts.live = false; ts.want = ts.got = 0; ts.hasBase = false; ts.rep = false; }
    }
  }

  /* ================================================================
     hard-drop protection, IRS and IHS
     ================================================================ */
  var spawnT = -1e12;        /* sim time of the latest spawn (or of our own drop or Keep) */
  var ihsSkip = false, ihsT = 0;

  /* A hard drop within hdTouch of a spawn, from a finger, is a flick or a
     double tap carried over from the piece before: dropped, not deferred.
     Keys and pads get their own window, 0 by default — a key press is not
     ambiguous. */
  function guarded(src, m) {
    var w = (src === S_TOUCH || src === S_BUTTON) ? +pref("hdTouch") : +pref("hdKeys");
    return w > 0 && m - spawnT < w;
  }
  function anyPiece() {
    if (!gameFn) return true;
    var g = gameFn();
    return !!(g && g.active);
  }

  /* A Keep brings a piece out, which is a spawn like any other: the drop
     protection counts from it, and the spawn it causes must not answer a
     Keep key that is still down with another Keep (IHS) — unless the
     engine said the Keep did not happen. */
  function keep(src, m, rep) {
    spawnT = m;
    ihsSkip = true; ihsT = m;
    if (emit(A_HOLD, src, m, rep) === false) ihsSkip = false;
  }

  /* ================================================================
     applying one queued event
     ================================================================ */
  function apply(i, m) {
    var kind = qKind[i], arg = qArg[i], src = qSrc[i], rep = qRep[i] === 1;
    if (kind === Q_DOWN) {
      held[arg]++;
      pressT[arg] = m; pressSrc[arg] = src;
      inWait[arg] = anyPiece() ? 0 : 1;
      if (arg === C_LEFT || arg === C_RIGHT) {
        if (held[arg] === 1) {
          var dir = arg === C_LEFT ? -1 : 1;
          dirSrc[arg === C_LEFT ? 0 : 1] = src;
          dasRep = false;
          das.press(dir, m, emitDas);
          dasRep = true;
        }
      } else if (arg === C_SOFT) {
        softSync(src, m, false);
      } else if (arg === C_HARD) {
        if (!guarded(src, m)) { if (ts.live) softStop(m); spawnT = m; emit(A_HARD, src, m, false); }
      } else if (arg === C_CW || arg === C_CCW) {
        emit(arg === C_CW ? A_CW : A_CCW, src, m, false);
        cutAfterTurn(m);
      } else if (arg === C_FLIP) {
        if (pref("modern")) { emit(A_HALF, src, m, false); cutAfterTurn(m); }
      } else if (arg === C_HOLD) {
        keep(src, m, false);
        cutAfterTurn(m);
      } else if (arg === C_BREATH) {
        emit(A_BREATH, src, m, false);
      }
    } else if (kind === Q_UP) {
      if (held[arg] <= 0) return;
      held[arg]--;
      if (held[arg] > 0) return;
      if (arg === C_LEFT || arg === C_RIGHT) {
        dasRep = true;
        das.release(arg === C_LEFT ? -1 : 1, m, emitDas);
      } else if (arg === C_SOFT) {
        softSync(src, m, false);
      }
    } else if (kind === Q_ACT) {
      if (arg === A_HARD) {
        if (ts.live) softStop(m);
        if (guarded(src, m)) return;
        spawnT = m;
      } else if (arg === A_HOLD) {
        if (ts.live) softStop(m);
        keep(src, m, rep);
        return;
      }
      emit(arg, src, m, rep);
    } else if (kind === Q_SOFT) {
      /* rows the thumb asked for before the piece they were meant for
         locked are not owed to the next one */
      if (m < spawnT) return;
      if (!ts.live) { ts.live = true; ts.want = 0; ts.got = 0; ts.hasBase = false; ts.rep = false; }
      ts.open = true;
      if (!ts.hasBase) { var y = pieceY(); if (y !== null) { ts.base = y; ts.hasBase = true; } }
      ts.want++;
    } else if (kind === Q_SOFT_END) {
      ts.open = false;
    } else if (kind === Q_SOFT_CANCEL) {
      if (ts.live) softStop(m);
    }
  }

  /* ================================================================
     the clocks
     ================================================================ */
  var lag = null;            /* event clock minus sim clock */
  var pollWall = -1, ticksSince = 0;
  var lastT = null, lastM = -Infinity;

  /* the sim clock went backwards: a new run that restarted it. Re-measure,
     and re-arm any direction still held so its charge counts from now. */
  function rebase(t) {
    lag = null; lastM = -Infinity; spawnT = -1e12;
    das.reset();
    var hl = held[C_LEFT] > 0, hr = held[C_RIGHT] > 0;
    if (hl && hr) {
      if (pressT[C_LEFT] <= pressT[C_RIGHT]) { das.press(-1, t, null); das.press(1, t, null); }
      else { das.press(1, t, null); das.press(-1, t, null); }
    } else if (hl) das.press(-1, t, null);
    else if (hr) das.press(1, t, null);
  }

  /* ================================================================
     public: the frame and the tick
     ================================================================ */
  I.poll = function () {
    if (disposed) return;
    var w = now();
    /* where the previous frame's last tick landed, against when that frame
       began: that difference is the lag, measured fresh every frame */
    if (ticksSince > 0 && pollWall >= 0 && lastT !== null) lag = pollWall - lastT;
    pollWall = w; ticksSince = 0;
    guardSync();
    pendingTimeout(w);
    pollPads(w);
  };

  /* Held across Ready: each becomes held now. A direction's charge is
     already full, so the press and its first repeat come at Go and then the
     usual ARR — not a burst replaying the whole countdown. Soft drop starts
     now, and a held turn or Keep is simply held, for IRS/IHS at the spawn.
     A tap made during Ready, or a hold let go before Go, does nothing. */
  function holdNow(c, src, t) {
    held[c]++; pressT[c] = t; pressSrc[c] = src; inWait[c] = 0; lastSrc = src;
    if ((c === C_LEFT || c === C_RIGHT) && held[c] === 1) {
      dirSrc[c === C_LEFT ? 0 : 1] = src;
      var d = +pref("das"); if (!(d >= 0)) d = 0;
      dasRep = false; das.press(c === C_LEFT ? -1 : 1, Math.max(lastM, t - d), emitDas); dasRep = true;
    } else if (c === C_SOFT) softSync(src, t, false);
  }
  function goLive(t) {
    for (var code in early) {
      if (!early[code]) continue;
      early[code] = 0;
      var c = keyHeld[code];
      if (c >= 0) holdNow(c, S_KEY, t);
    }
    for (var i = 0; i < padBtn.length; i++) if (padBtn[i] === 3) { padBtn[i] = 1; holdNow(padCtl(i % PAD_BTNS), S_PAD, t); }
    for (var s = 0; s < PAD_SLOTS; s++) {
      if (padSX[s] === 3 || padSX[s] === -3) { padSX[s] = padSX[s] / 3; holdNow(padSX[s] < 0 ? C_LEFT : C_RIGHT, S_PAD, t); }
      if (padSY[s] === 3) { padSY[s] = 1; holdNow(C_SOFT, S_PAD, t); }
    }
    earlyN = 0;
  }
  I.tick = function (t) {
    if (disposed) return;
    var w = now();
    if (lastT !== null && t < lastT - 0.5) rebase(t);
    if (earlyN > 0) goLive(t);
    /* never polled, or polling stopped: measure from this tick instead */
    if (lag === null || pollWall < 0 || w - pollWall > 250) lag = w - t;
    ticksSince++;
    while (qLen > 0) {
      var i = qHead, due = qTime[i] - lag - TICK;
      if (due > t) {
        /* an event a second ahead of the sim cannot be real: the clocks
           moved under us, so take it as happening now */
        if (due > t + 1000) lag = qTime[i] - t;
        else break;
      }
      /* stamped with when it happened on the sim's clock, never before a
         tick already run nor after this one */
      var m = qTime[i] - lag;
      if (m > t) m = t;
      if (m < lastM) m = lastM;
      das.tick(m, emitDas);              /* repeats that fell due before this event */
      qHead = (qHead + 1) % QN; qLen--;
      apply(i, m);
      lastM = m;
    }
    das.tick(t, emitDas);
    softControl(t);
    lastT = t;
    if (lastM < t) lastM = t;
  };

  /* A piece appeared. Hard-drop protection counts from here; a held slide
     with ARR 0 is asked for again (the engine's renew()); and with IRS or
     IHS on, a turn or Keep that is *held* — pressed while the last piece
     was still in play and never released — is applied now. One pressed during
     the wait itself was already remembered by the engine, which applies it
     as the piece appears, so it is not sent twice. */
  I.spawned = function (tMs) {
    if (disposed) return;
    var t = +tMs;
    if (!(t === t)) t = lastT === null ? 0 : lastT;
    spawnT = t;
    if (ts.live) softStop(t);
    var p0 = ptrs[0], p1 = ptrs[1];
    if (p0.on && p0.axis === AX_V) restartSoft(p0);
    if (p1.on && p1.axis === AX_V) restartSoft(p1);
    if (typeof das.renew === "function") { dasRep = true; das.renew(t, emitDas); }

    /* without the game we cannot tell a press made in the wait (which the
       engine already has) from one held over it, so the engine's own
       remembering is the whole of IRS and IHS */
    if (!gameFn) return;
    var turned = false;
    if (ihsSkip && t - ihsT < 500) { ihsSkip = false; }
    else {
      ihsSkip = false;
      if (pref("ihs") && pref("keep") !== false && held[C_HOLD] > 0 && !inWait[C_HOLD]) {
        keep(pressSrc[C_HOLD], t, false);
        turned = true;
      }
    }
    if (!turned && pref("irs")) {
      var best = -1, bt = -Infinity, c, k, cands = pref("modern") ? 3 : 2;
      for (k = 0; k < cands; k++) {
        c = k === 0 ? C_CW : k === 1 ? C_CCW : C_FLIP;
        if (held[c] > 0 && !inWait[c] && pressT[c] > bt) { bt = pressT[c]; best = c; }
      }
      if (best >= 0) emit(best === C_CW ? A_CW : best === C_CCW ? A_CCW : A_HALF, pressSrc[best], t, false);
    }
    /* a key the engine remembered for this piece, still held, is ours to
       answer for the next one */
    inWait[C_CW] = inWait[C_CCW] = inWait[C_FLIP] = inWait[C_HOLD] = 0;
  };

  I.dasCharge = function () { return das.charge(lastT === null ? 0 : lastT); };

  /* ================================================================
     keyboard
     ================================================================ */
  var codeMap = Object.create(null);     /* e.code → control */
  var keyHeld = Object.create(null);     /* e.code → control while down, -1 when up */
  function buildKeys() {
    codeMap = Object.create(null);
    var map = pref("keys") || DEF.keys;
    for (var c = 0; c < NCTRL; c++) {
      var list = map[CONTROLS[c]];
      if (!list || typeof list.length !== "number") continue;
      for (var j = 0; j < list.length; j++) if (typeof list[j] === "string") codeMap[list[j]] = c;
    }
  }
  buildKeys();

  function typingInto(t) {
    if (!t || !t.tagName) return false;
    if (t.isContentEditable) return true;
    var tag = t.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag !== "INPUT") return false;
    var ty = (t.type || "").toLowerCase();
    return ty !== "checkbox" && ty !== "radio" && ty !== "range" && ty !== "button" &&
           ty !== "submit" && ty !== "reset" && ty !== "color";
  }
  function isMeta(code) {
    return code === "MetaLeft" || code === "MetaRight" || code === "OSLeft" || code === "OSRight";
  }
  /* macOS sends no keyup for a key released while ⌘ is down, so the moment ⌘
     goes down every held key is released here — otherwise ⌘-Tab away with
     an arrow held comes back to a piece sliding into the wall forever */
  function releaseKeys(t) {
    for (var code in keyHeld) {
      var c = keyHeld[code];
      if (c >= 0) { keyHeld[code] = -1; if (early[code]) { early[code] = 0; earlyN--; continue; } if (c !== C_PAUSE && c !== C_GLASS) push(Q_UP, c, S_KEY, 0, t); }
    }
  }
  function onKeyDown(e) {
    if (disposed) return;
    var code = e.code;
    if (isMeta(code)) { releaseKeys(evTime(e)); return; }
    if (e.metaKey || typingInto(e.target)) return;   /* ⌘ belongs to the browser */
    var c = codeMap[code];
    if (c === undefined) return;
    if (!live()) {
      /* Ready: a held key is remembered, never acted on; it becomes a press,
         already charged, at the first live tick */
      if (c === C_PAUSE || c === C_GLASS || c === C_HARD || !(armedFn && armedFn())) return;
      e.preventDefault();
      if (e.repeat || keyHeld[code] >= 0) return;
      keyHeld[code] = c; early[code] = 1; earlyN++;
      return;
    }
    /* our keys only, and only while playing: arrows and Space never scroll
       the page under the well, and never press a focused menu button */
    e.preventDefault();
    if (e.repeat) return;
    if (keyHeld[code] >= 0) return;                    /* a keyup went missing; wait for it */
    var t = evTime(e);
    lastSrc = S_KEY;
    keyHeld[code] = c;
    if (c === C_PAUSE) ui("pause", S_KEY, t, true);
    else if (c === C_GLASS) ui("glass", S_KEY, t, true);
    else push(Q_DOWN, c, S_KEY, 0, t);
  }
  function onKeyUp(e) {
    if (disposed) return;
    var code = e.code;
    if (isMeta(code)) { releaseKeys(evTime(e)); return; }
    var c = keyHeld[code];
    if (c === undefined || c < 0) return;
    keyHeld[code] = -1;
    if (early[code]) { early[code] = 0; earlyN--; return; }
    if (live() && !typingInto(e.target)) e.preventDefault();
    if (c !== C_PAUSE && c !== C_GLASS) push(Q_UP, c, S_KEY, 0, evTime(e));
  }

  /* ================================================================
     fingers
     ================================================================ */
  var AX_NONE = 0, AX_H = 1, AX_V = 2;
  var M_FULL = 0, M_TAP = 1, M_DEAD = 2;
  function makePtr() {
    return {
      id: -1, on: false, mode: M_FULL, used: false, keep: false, pending: false,
      x0: 0, y0: 0, t0: 0, x: 0, y: 0, t: 0, upT: 0, travel: 0,
      axis: AX_NONE, accX: 0, ax: 0, ay: 0, lastDir: 0,
      softY0: 0, lowY: 0, rows: 0,
      dTop: 0, dLow: 0, uBot: 0, uHigh: 0, restT: 0, sx: 0, sy: 0, st: 0, prov: false,
      rx: new Float32Array(RING), ry: new Float32Array(RING), rt: new Float64Array(RING), rn: 0, ri: 0
    };
  }
  var ptrs = [makePtr(), makePtr()];
  var owner = -1;                        /* the pointer that drives the piece, once one does */
  var downIds = new Int32Array(16), nDown = 0;   /* every finger on the surface, tracked or not */
  var ox = 0, oy = 0, ow = 0;            /* the surface's rect, taken when a gesture begins */
  var clickOK = false, clickAt = -1e9;
  var FW = { dx: 0, dy: 0, span: 0 };    /* the flick window, reused */

  /* a live finger first: a pending one may share an id the browser has
     since handed to a new touch */
  function ptrById(id) {
    if (ptrs[0].id === id && ptrs[0].on) return ptrs[0];
    if (ptrs[1].id === id && ptrs[1].on) return ptrs[1];
    return null;
  }
  function freePtr() {
    if (!ptrs[0].on && !ptrs[0].pending) return ptrs[0];
    if (!ptrs[1].on && !ptrs[1].pending) return ptrs[1];
    return null;
  }
  function otherOf(p) { return p === ptrs[0] ? ptrs[1] : ptrs[0]; }
  function addDown(id) { if (nDown < 16) downIds[nDown++] = id; }
  function removeDown(id) {
    for (var i = 0; i < nDown; i++) if (downIds[i] === id) { downIds[i] = downIds[--nDown]; return true; }
    return false;
  }

  function cellPx() {
    var L = layoutFn ? layoutFn() : null;
    return L && L.cell > 0 ? L.cell : 30;
  }
  function stepPx() {
    var s = +pref("sensitivity");
    if (!(s > 0)) s = 1;
    return STEP_CELLS * cellPx() / s;
  }
  function softPx() { return SOFT_CELLS * cellPx(); }

  /* the Keep niche, as a target: its own box, grown to 44 pt if smaller */
  function inKeep(x, y) {
    if (pref("keep") === false) return false;
    var L = layoutFn ? layoutFn() : null, k = L ? L.keep : null;
    if (!k || !(k.w > 0)) return false;
    var cx = k.x + k.w / 2, cy = k.y + k.h / 2;
    var hw = Math.max(k.w / 2 + 6, KEEP_MIN / 2), hh = Math.max(k.h / 2 + 6, KEEP_MIN / 2);
    return Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh;
  }
  /* the strip above the home indicator, measured from the viewport */
  var safeB = 0, safeAt = -1;
  function inBand(clientY) {
    if (!win) return false;
    var w = now();
    if (w - safeAt > 1000 && probe) { safeB = probe.offsetHeight || 0; safeAt = w; }
    return clientY > win.innerHeight - safeB - BAND;
  }

  function initPtr(p, id, x, y, t) {
    p.id = id; p.on = true; p.mode = M_FULL; p.used = false; p.keep = false; p.pending = false;
    p.x0 = p.x = x; p.y0 = p.y = y; p.t0 = p.t = t; p.travel = 0; p.upT = 0;
    p.axis = AX_NONE; p.accX = 0; p.ax = x; p.ay = y; p.lastDir = 0; p.prov = false;
    p.softY0 = y; p.lowY = y; p.rows = 0;
    p.dTop = p.dLow = p.uBot = p.uHigh = y;
    p.restT = p.st = t; p.sx = x; p.sy = y;
    p.rn = 0; p.ri = 0;
    ring(p, x, y, t);
  }
  function ring(p, x, y, t) {
    p.rx[p.ri] = x; p.ry[p.ri] = y; p.rt[p.ri] = t;
    p.ri = (p.ri + 1) % RING;
    if (p.rn < RING) p.rn++;
  }
  /* Displacement over the last FLICK_MS, interpolated to the window's start
     so a flick reads the same at 60, 120 or 240 touch samples a second.
     The window never reaches back past the end of a rest (restT, kept by
     track()): a thumb that lands, settles and then flicks is judged on the
     flick, not on the flick averaged with the stillness before it — which
     asked a flick from rest to cover three cells rather than a cell and a
     half. It is never shorter than 30 ms, so a twitch is still a twitch. */
  function flickWindow(p) {
    var tEnd = p.t, tStart = Math.min(tEnd - 30, Math.max(tEnd - FLICK_MS, p.restT));
    var x0 = p.x, y0 = p.y, t0 = tEnd, newer = -1;
    for (var k = 0; k < p.rn; k++) {
      var i = (p.ri - 1 - k + RING) % RING;
      if (p.rt[i] <= tStart) {
        if (newer >= 0 && p.rt[newer] > p.rt[i]) {
          var f = (tStart - p.rt[i]) / (p.rt[newer] - p.rt[i]);
          x0 = p.rx[i] + (p.rx[newer] - p.rx[i]) * f;
          y0 = p.ry[i] + (p.ry[newer] - p.ry[i]) * f;
          t0 = tStart;
        } else { x0 = p.rx[i]; y0 = p.ry[i]; t0 = p.rt[i]; }
        break;
      }
      x0 = p.rx[i]; y0 = p.ry[i]; t0 = p.rt[i]; newer = i;
    }
    FW.dx = p.x - x0; FW.dy = p.y - y0; FW.span = tEnd - t0;
  }
  /* The stroke so far, each way: a downward stroke begins at the highest
     point since the finger last turned down, an upward one at the lowest
     point since it last turned up, and a wobble of a few pixels is not a
     turn. "1.5 cells since the motion began" means since *this* stroke. */
  function strokes(p, y) {
    if (y < p.dTop) { p.dTop = y; p.dLow = y; }
    else if (y > p.dLow) p.dLow = y;
    else if (y < p.dLow - TURN_BACK) { p.dTop = y; p.dLow = y; }
    if (y > p.uBot) { p.uBot = y; p.uHigh = y; }
    else if (y < p.uHigh) p.uHigh = y;
    else if (y > p.uHigh + TURN_BACK) { p.uBot = y; p.uHigh = y; }
  }

  /* spent: every finger present goes quiet until it lifts */
  function consume(t) {
    for (var k = 0; k < 2; k++) {
      var q = ptrs[k];
      if (q.on) { q.used = true; if (q.axis === AX_V) q.axis = AX_NONE; }
      if (q.pending) q.pending = false;
    }
    push(Q_SOFT_CANCEL, 0, S_TOUCH, 0, t);
  }
  function flick(p) {
    if (p.used || p.mode !== M_FULL) return false;
    flickWindow(p);
    if (FW.span < FLICK_MIN_MS) return false;
    var c = cellPx(), vy = FW.dy / FW.span;
    if (vy >= FLICK_DOWN && p.y - p.dTop >= FLICK_CELLS * c && Math.abs(FW.dx) <= TAN_DOWN * FW.dy) {
      consume(p.t);
      push(Q_ACT, A_HARD, S_TOUCH, 0, p.t);
      return true;
    }
    if (vy <= -FLICK_UP && p.uBot - p.y >= FLICK_CELLS * c && Math.abs(FW.dx) <= TAN_UP * -FW.dy) {
      consume(p.t);
      push(Q_ACT, A_HOLD, S_TOUCH, 0, p.t);
      return true;
    }
    return false;
  }
  function stepTo(p, dir, t) {
    /* the first column of a run is a press; the rest of the same run are
       the finger's auto-repeat (the engine neither counts nor bumps those) */
    push(Q_ACT, dir < 0 ? A_LEFT : A_RIGHT, S_TOUCH, p.lastDir === dir ? 1 : 0, t);
    p.lastDir = dir;
    p.ax = p.x; p.ay = p.y;
  }
  /* Columns from travel. Going on the same way costs a whole step, the
     remainder carried, so a slow drag and a quick one arrive at the same
     column. Coming back costs only REVERSE of a step past the point where
     the last column changed — without that, a thumb that overshoots by one
     has to travel back a step and a third before anything happens, which
     reads as the piece ignoring it. The small dead band that is left is
     what stops a resting thumb's tremor from rocking the piece. */
  function steps(p, step, t) {
    for (;;) {
      var r = p.lastDir < 0 ? REVERSE * step : step;
      var l = p.lastDir > 0 ? REVERSE * step : step;
      if (p.accX >= r) { p.accX -= r; stepTo(p, 1, t); }
      else if (p.accX <= -l) { p.accX += l; stepTo(p, -1, t); }
      else return;
    }
  }
  function startSoft(p, fromY) {
    p.axis = AX_V; p.softY0 = fromY; p.lowY = fromY; p.rows = 0; p.accX = 0;
  }
  /* a new piece mid-drag: the rows already travelled were for the last one */
  function restartSoft(p) { p.softY0 = p.y; p.lowY = p.y; p.rows = 0; p.ax = p.x; p.ay = p.y; }

  function track(p, x, y, t) {
    if (t < p.t) t = p.t;
    var dx = x - p.x;
    /* Rest is a silence (Safari sends nothing for a finger held still) or
       24 ms within 2 px of one spot. It is judged by how far the finger
       moved, not by the speed of single samples: the lift repeats the last
       position, and that zero-speed sample is not a rest. */
    if (t - p.t > 30) { p.restT = t - 8; p.sx = x; p.sy = y; p.st = t; }
    else if (Math.abs(x - p.sx) > 2 || Math.abs(y - p.sy) > 2) { p.sx = x; p.sy = y; p.st = t; }
    else if (t - p.st >= 24) p.restT = t;
    p.x = x; p.y = y; p.t = t;
    ring(p, x, y, t);
    var ddx = x - p.x0, ddy = y - p.y0, d = Math.sqrt(ddx * ddx + ddy * ddy);
    if (d > p.travel) p.travel = d;
    strokes(p, y);
    if (p.used) return;
    if (p.mode === M_TAP) { if (p.travel >= SLOP) p.mode = M_DEAD; return; }
    if (p.mode !== M_FULL) return;

    if (p.axis === AX_NONE) {
      if (p.travel < SLOP) return;
      /* one finger drives at a time; a second that wanders is a palm */
      if (owner !== -1 && owner !== p.id) { p.mode = M_DEAD; return; }
      owner = p.id;
      releasePending(p, t);
      if (Math.abs(ddx) >= LOCK_RATIO * Math.abs(ddy)) {
        p.axis = AX_H; p.accX = ddx; dx = 0; p.ax = x; p.ay = y;
      } else {
        startSoft(p, p.y0); p.ax = x; p.ay = y; p.prov = true;
      }
    }
    if (flick(p)) return;

    var step = stepPx();
    if (p.axis === AX_H) {
      p.accX += dx;
      steps(p, step, t);
      /* Sideways and then plainly down, without lifting: the thumb has
         changed its mind, and the soft drop follows it. The bar is high —
         a cell and a half, almost vertical — because a thumb sweeping
         sideways traces an arc, and an arc is not a request. */
      var ady = y - p.ay, adx = Math.abs(x - p.ax);
      if (ady >= RELOCK_CELLS * cellPx() && adx <= 0.35 * ady) startSoft(p, p.ay);
      else return;
    }
    if (p.axis === AX_V) {
      /* The ten-pixel verdict is only a guess until it has dropped a row: a
         few pixels of roll as the thumb lands can tip a sideways sweep at
         30-40 degrees into the soft drop, and the way back from there to a
         move is deliberately stricter. So while no row has dropped, a
         stroke that, taken whole, is inside the sideways cone is a move,
         with all its travel. (Not after a move turned soft, which also
         starts at no rows: prov marks the first verdict only.) */
      if (p.prov && p.rows === 0 && Math.abs(ddx) >= LOCK_RATIO * Math.abs(ddy)) {
        p.prov = false; push(Q_SOFT_END, 0, S_TOUCH, 0, t);
        p.axis = AX_H; p.accX = ddx; p.ax = x; p.ay = y; p.lastDir = 0;
        steps(p, step, t);
        return;
      }
      if (y > p.lowY) {
        p.lowY = y;
        /* A stroke already moving at flick speed, not yet far enough to be
           judged, is probably about to become a hard drop: its rows wait.
           If it turns out not to be a flick they are all still owed, and
           arrive on the next sample. */
        var c = cellPx();
        var racing = FW.span >= FLICK_MIN_MS && FW.dy >= 0.75 * FLICK_DOWN * FW.span &&
                     p.y - p.dTop < FLICK_CELLS * c;
        var want = racing ? p.rows : Math.floor((p.lowY - p.softY0) / softPx());
        while (p.rows < want) { p.rows++; p.prov = false; push(Q_SOFT, 0, S_TOUCH, 0, t); p.ax = x; p.ay = y; }
      }
      /* and the other way: a soft drop that turns plainly sideways for a
         whole column is a move again */
      var hdx = x - p.ax, hdy = Math.abs(y - p.ay);
      if (Math.abs(hdx) >= step && hdy <= 0.5 * Math.abs(hdx)) {
        push(Q_SOFT_END, 0, S_TOUCH, 0, t);
        p.prov = false; p.axis = AX_H; p.accX = hdx; p.ax = x; p.ay = y; p.lastDir = 0;
        steps(p, step, t);
      }
    }
  }

  /* ---------- taps ---------- */
  function singleTap(p, t, late) {
    if (p.keep) {
      push(Q_ACT, A_HOLD, S_TOUCH, 0, t);
      ui("keepTap", S_TOUCH, t, true);
    } else if (p.mode === M_FULL) {
      var cw = pref("tap") !== "sides" || p.x >= ow / 2;
      push(Q_ACT, cw ? A_CW : A_CCW, S_TOUCH, 0, t);
    } else return;
    /* a real tap, judged as the finger lifts: iOS may click, and tick */
    if (!late) { clickOK = true; clickAt = now(); }
  }
  function twoTap(t) {
    var half = pref("modern") && pref("tap") === "sides";
    push(Q_ACT, half ? A_HALF : A_CCW, S_TOUCH, 0, t);
  }
  /* A tap held back in case it was half of a two-finger tap, settled as
     the single tap it turned out to be — if it was quick enough to be a
     tap at all. Every way out of waiting comes through here. */
  function settleTap(q) {
    q.pending = false;
    if (q.upT - q.t0 < TAP_MS) singleTap(q, q.upT, true);
  }
  /* the partner of a pending tap turned out to be a drag: the tap was a
     tap after all, and is late by however long that took to show */
  function releasePending(p, t) {
    var o = otherOf(p);
    if (o.pending) settleTap(o);
  }
  /* Two fingers down together, one lifted, and the other neither lifted nor
     moved in time, or held past the point a two-finger tap could still
     happen: the lifted one was a plain tap, and turns by its side of the
     screen, as the rules for a tap say. The price is that a sloppy
     two-finger tap (the second lift far too late) turns one way rather
     than the other; dropping the tap instead lost every turn a thumb made
     while the other thumb rested on the glass. */
  function pendingTimeout(w) {
    for (var k = 0; k < 2; k++) {
      var p = ptrs[k], o = otherOf(p);
      if (p.pending && (w - p.upT > TWO_LIFT_MS || (o.on && w - o.t0 >= TWO_HOLD_MS))) settleTap(p);
    }
  }

  function surfaceTarget(tg) {
    if (!tg) return false;
    if (tg === lab || tg === host || tg === el) return true;
    return tg.tagName === "CANVAS" && !!host && host.contains(tg);
  }
  function scheme() { return pref("scheme"); }

  function onPDown(e) {
    if (disposed || !surfaceTarget(e.target)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    addDown(e.pointerId);
    if (!live()) return;
    lastSrc = S_TOUCH;
    var p = freePtr();
    if (!p) {
      /* a slot still waiting on a tap is settled, and the new touch takes
         it; a third finger otherwise is a palm, not a command */
      for (var k = 0; k < 2; k++) if (ptrs[k].pending) { settleTap(ptrs[k]); p = ptrs[k]; break; }
      if (!p) return;
    }
    var r = host.getBoundingClientRect();
    if (ptrs[0].on === false && ptrs[1].on === false) { ox = r.left; oy = r.top; ow = r.width; }
    var x = e.clientX - ox, y = e.clientY - oy, t = evTime(e);
    initPtr(p, e.pointerId, x, y, t);
    p.keep = inKeep(x, y);
    if (inBand(e.clientY)) p.mode = M_DEAD;
    else if (scheme() === "buttons") p.mode = p.keep ? M_TAP : M_DEAD;
    /* capture to the element actually touched, not to the stage: the click
       that follows a tap must still land on the label, which is what makes
       an iPhone tick */
    if (e.target && e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    }
  }
  function onPMove(e) {
    var p = ptrById(e.pointerId);
    if (!p || !p.on) return;
    if (!live()) { dropFingers(); return; }
    var list = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
    if (list && list.length > 1) {
      for (var i = 0; i < list.length && p.on; i++) track(p, list[i].clientX - ox, list[i].clientY - oy, evTime(list[i]));
    } else track(p, e.clientX - ox, e.clientY - oy, evTime(e));
  }
  function onPUp(e) {
    removeDown(e.pointerId);
    var p = ptrById(e.pointerId);
    if (!p || !p.on) { if (nDown === 0) owner = -1; return; }
    var t = evTime(e);
    if (live() && p.mode !== M_DEAD) {
      track(p, e.clientX - ox, e.clientY - oy, t);   /* the lift is a sample: most flicks end here */
      var o = otherOf(p);
      var tapish = !p.used && p.mode !== M_DEAD && p.travel < SLOP;
      var dur = t - p.t0;
      p.on = false; p.upT = t;
      if (owner === p.id) owner = -1;
      if (p.axis === AX_V && !p.used) push(Q_SOFT_END, 0, S_TOUCH, 0, t);
      if (tapish && o.pending) {
        if (t - o.upT <= TWO_LIFT_MS && dur < TWO_HOLD_MS && Math.abs(o.t0 - p.t0) <= TWO_DOWN_MS && !p.keep && !o.keep) {
          o.pending = false;
          twoTap(t);
          return;
        }
        settleTap(o);
      }
      if (tapish && o.on && o.mode !== M_DEAD && !o.used && o.travel < SLOP &&
          Math.abs(o.t0 - p.t0) <= TWO_DOWN_MS && dur < TWO_HOLD_MS && !p.keep) {
        p.pending = true;                 /* wait and see whether the other lifts too */
        return;
      }
      if (tapish && dur < TAP_MS) singleTap(p, t);
    } else {
      p.on = false;
      if (owner === p.id) owner = -1;
      if (p.axis === AX_V) push(Q_SOFT_END, 0, S_TOUCH, 0, t);
    }
    if (nDown === 0) owner = -1;
  }
  /* the system took the touch (a call, a swipe it wanted): forget it all,
     do nothing, and make sure no soft drop is left running */
  function onPCancel(e) {
    removeDown(e.pointerId);
    var p = ptrById(e.pointerId);
    if (!p) return;
    var wasSoft = p.on && p.axis === AX_V;
    p.on = false; p.pending = false; p.used = true;
    if (owner === p.id) owner = -1;
    if (wasSoft) push(Q_SOFT_CANCEL, 0, S_TOUCH, 0, evTime(e));
  }
  function dropFingers() {
    for (var k = 0; k < 2; k++) {
      var p = ptrs[k];
      if (p.on && p.axis === AX_V) push(Q_SOFT_CANCEL, 0, S_TOUCH, 0, now());
      p.on = false; p.pending = false; p.used = true;
    }
    owner = -1;
  }

  /* iOS: the click goes through only for the taps that did something, so
     the switch ticks for a turn or a Keep and for nothing else */
  function touchWouldTap(e) {
    if (e.touches && e.touches.length > 0) return false;
    var t = evTime(e);
    for (var k = 0; k < 2; k++) {
      var p = ptrs[k];
      if (p.on && p.mode !== M_DEAD && !p.used && p.travel < SLOP && t - p.t0 < TAP_MS &&
          (p.keep || p.mode === M_FULL)) return true;
    }
    return false;
  }
  function onTouchEnd(e) {
    if (disposed || !live() || !surfaceTarget(e.target)) return;
    if (clickOK && now() - clickAt < 500) { clickOK = false; return; }
    if (touchWouldTap(e)) return;
    e.preventDefault();
  }
  /* the edge guard: on the surface itself, and on the tray, whose outer
     keys sit near the glass — never on the app's own buttons, whose clicks
     it would swallow */
  function onTouchStart(e) {
    if (!surfaceTarget(e.target)) return;
    edgeGuard(e);
  }
  function edgeGuard(e) {
    if (disposed || !live() || !win) return;
    var list = e.changedTouches, W = win.innerWidth;
    for (var i = 0; list && i < list.length; i++) {
      var x = list[i].clientX;
      if (x < EDGE || x > W - EDGE) { e.preventDefault(); return; }
    }
  }
  function onGuard(e) { if (!disposed && live()) e.preventDefault(); }
  /* a trackpad pinch reaches Chromium and Firefox as a wheel with ctrlKey
     (Safari sends gesturestart instead); only while a run is live */
  function onWheelGuard(e) { if (e.ctrlKey && !disposed && live()) e.preventDefault(); }

  /* ================================================================
     the Buttons tray
     ================================================================ */
  var padEl = opts.padEl || (doc ? doc.getElementById("pad") : null);
  var tray = null, trayBtns = [], trayShown = false, trayH = 0;
  var trayPid = new Int32Array(8), trayOf = new Int8Array(8), nTray = 0;

  function trayBuild() {
    if (tray || !padEl || !doc) return;
    tray = doc.createElement("div");
    tray.setAttribute("role", "group");
    tray.setAttribute("aria-label", "Controls");
    tray.style.cssText = "position:relative;width:100%;touch-action:none;-webkit-user-select:none;" +
      "user-select:none;-webkit-touch-callout:none;pointer-events:none";
    for (var i = 0; i < TRAY.length; i++) {
      var d = TRAY[i], c = d[0];
      /* turns and Keep are labels for the haptic switch, so a real press
         ticks on an iPhone; the rest are plain, because a tick for every
         step would be the overuse Apple asks us not to commit */
      var b = doc.createElement(d[4] ? "label" : "div");
      if (d[4]) b.htmlFor = hxId;
      b.className = "btn";
      b.setAttribute("role", "button");
      b.setAttribute("aria-label", d[5]);
      b.setAttribute("data-c", String(c));
      var round = c === C_CW || c === C_CCW;
      b.style.cssText = "position:absolute;margin:0;padding:0;flex:none;min-height:0;cursor:pointer;" +
        "pointer-events:auto;touch-action:none;color:var(--ink,#eef0f8);box-sizing:border-box;" +
        "-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;" +
        (round ? "border-radius:50%;" : "") +
        /* the one key that cannot be taken back wears a faint ring */
        (c === C_HARD ? "border-color:rgba(159,180,255,.34);" : "") +
        "transition:transform .09s cubic-bezier(.2,.9,.3,1.4),opacity .15s,background .15s,box-shadow .15s";
      var inner;
      if (c === C_HOLD) inner = '<span style="font-weight:700;letter-spacing:.04em;pointer-events:none">Keep</span>';
      else {
        var ic = c === C_LEFT ? ICON_LEFT : c === C_RIGHT ? ICON_RIGHT : c === C_SOFT ? ICON_SOFT
               : c === C_HARD ? ICON_HARD : ICON_TURN;
        inner = '<span style="display:block;pointer-events:none">' + icon(ic, c === C_CCW) + '</span>';
      }
      b.innerHTML = inner;
      tray.appendChild(b);
      trayBtns.push({ el: b, c: c, cl: d[1], row: d[2], col: d[3], pid: -1, x: 0, y: 0, w: 0, h: 0, upAt: -1e9 });
    }
    padEl.appendChild(tray);
    tray.addEventListener("pointerdown", onTrayDown);
    tray.addEventListener("pointermove", onTrayMove);
    tray.addEventListener("pointerup", onTrayUp);
    tray.addEventListener("pointercancel", onTrayUp);
    tray.addEventListener("lostpointercapture", onTrayLost);
    tray.addEventListener("click", onTrayClick);
    tray.addEventListener("contextmenu", onGuard);
    tray.addEventListener("touchstart", edgeGuard, { passive: false });
    trayLayout();
  }

  /* Sizes from Prefs (44–96 px), shrunk only if the screen cannot hold
     five keys and a thumb's gap between the clusters; mirrored for left
     hands by swapping the clusters and the turn pair inside its own — the
     arrows themselves never mirror, because left must stay left. */
  var TS = { S: 64, gap: 10, avail: 390, top: 6 };
  function traySizes() {
    var want = Math.max(44, Math.min(96, +pref("btnSize") || 64));
    var avail = padEl && padEl.clientWidth > 0 ? padEl.clientWidth : (win ? win.innerWidth : 390);
    var cs = padEl && win && win.getComputedStyle ? win.getComputedStyle(padEl) : null;
    if (cs) avail -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var gap = Math.round(Math.max(8, want * 0.16));
    var S = Math.floor(Math.min(want, (avail - 3 * gap) / 5.6));
    if (S < 40) S = 40;
    TS.S = S; TS.gap = gap; TS.avail = avail;
    return TS;
  }
  function trayLayout() {
    if (!tray) return;
    var op = +pref("btnOpacity");
    if (!(op >= 0.2)) op = op < 0.2 ? 0.2 : 1;
    if (op > 1) op = 1;
    var lefty = !!pref("lefty");
    var z = traySizes(), S = z.S, gap = z.gap, avail = z.avail, top = z.top;
    trayH = top + 2 * S + gap;
    tray.style.height = trayH + "px";
    var moveW = 3 * S + 2 * gap, turnW = 2 * S + gap;
    var moveX = lefty ? Math.max(0, avail - moveW) : 0;
    var turnX = lefty ? 0 : Math.max(0, avail - turnW);
    for (var i = 0; i < trayBtns.length; i++) {
      var b = trayBtns[i], col = b.col;
      if (b.cl === 1 && lefty) col = 1 - col;
      var x = (b.cl === 0 ? moveX : turnX) + col * (S + gap);
      var y = top + b.row * (S + gap);
      var w = S, h = S;
      /* Keep and the drop are a little shorter than the rest, to tell
         them apart by feel, but never below the 44 px a thumb needs */
      if (b.c === C_HOLD) { h = Math.min(S, Math.max(44, Math.round(S * 0.72))); y += S - h; }
      if (b.c === C_HARD) { h = Math.min(S, Math.max(44, Math.round(S * 0.86))); y += S - h; }
      var st = b.el.style;
      st.left = x + "px"; st.top = y + "px"; st.width = w + "px"; st.height = h + "px";
      if (b.c !== C_CW && b.c !== C_CCW) st.borderRadius = Math.round(S * 0.3) + "px";
      st.fontSize = Math.max(12, Math.round(S * 0.24)) + "px";
      var span = b.el.firstChild;
      if (span && b.c !== C_HOLD) {
        var ic = Math.round(S * (b.c === C_CW || b.c === C_CCW ? 0.48 : 0.42));
        span.style.width = ic + "px"; span.style.height = ic + "px";
      }
      b.op = op;
      st.opacity = String(b.pid >= 0 ? Math.max(op, 0.75) : op);
      b.x = x; b.y = y; b.w = w; b.h = h;
    }
  }
  function trayHit(tg) {
    for (var i = 0; i < trayBtns.length; i++) if (trayBtns[i].el === tg || trayBtns[i].el.contains(tg)) return trayBtns[i];
    return null;
  }
  function trayDownLook(b, on) {
    if (on) b.el.classList.add("down"); else b.el.classList.remove("down");
    b.el.style.opacity = String(on ? Math.max(b.op || 1, 0.75) : (b.op || 1));
  }
  function trayPress(b, pid, t) {
    b.pid = pid;
    trayDownLook(b, true);
    push(Q_DOWN, b.c, S_BUTTON, 0, t);
  }
  function trayRelease(b, t) {
    if (b.pid < 0) return;
    b.pid = -1; b.upAt = now();
    trayDownLook(b, false);
    push(Q_UP, b.c, S_BUTTON, 0, t);
  }
  function trayIndex(pid) { for (var i = 0; i < nTray; i++) if (trayPid[i] === pid) return i; return -1; }
  function onTrayDown(e) {
    if (disposed) return;
    var b = trayHit(e.target);
    if (!b || !live()) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (b.pid >= 0 || nTray >= 8) return;          /* already under another finger */
    lastSrc = S_BUTTON;
    /* captured to the key itself, so the click after a tap still lands on
       the label (the iPhone tick) and a thumb that drifts keeps its key */
    try { b.el.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    trayPid[nTray] = e.pointerId; trayOf[nTray] = trayBtns.indexOf(b); nTray++;
    trayPress(b, e.pointerId, evTime(e));
  }
  /* A thumb rolling from ← to → on a d-pad means "now the other way", so a
     sliding finger hands a held direction over to the other one — and from
     the soft-drop key to either. Nothing slides *onto* soft drop (rolling
     ← to → crosses it, and its first row comes with the press) and nothing
     slides onto the drop key, ever. */
  function onTrayMove(e) {
    var k = trayIndex(e.pointerId);
    if (k < 0) return;
    var cur = trayBtns[trayOf[k]];
    if (cur.c !== C_LEFT && cur.c !== C_RIGHT && cur.c !== C_SOFT) return;
    var r = tray.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (var i = 0; i < trayBtns.length; i++) {
      var b = trayBtns[i];
      if (b === cur || b.pid >= 0 || (b.c !== C_LEFT && b.c !== C_RIGHT)) continue;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        var t = evTime(e);
        trayRelease(cur, t);
        trayOf[k] = i;
        trayPress(b, e.pointerId, t);
        return;
      }
    }
  }
  function trayLift(pid, t) {
    var k = trayIndex(pid);
    if (k < 0) return;
    trayRelease(trayBtns[trayOf[k]], t);
    nTray--;
    trayPid[k] = trayPid[nTray]; trayOf[k] = trayOf[nTray];
  }
  function onTrayUp(e) { trayLift(e.pointerId, evTime(e)); }
  function onTrayLost(e) { trayLift(e.pointerId, evTime(e)); }
  /* A click with no press behind it is VoiceOver, Switch Control or some
     other assistive route activating the key: treat it as a tap of it. */
  function onTrayClick(e) {
    var b = trayHit(e.target);
    if (!b || !live() || b.pid >= 0 || now() - b.upAt < 600) return;
    var t = evTime(e);
    lastSrc = S_BUTTON;
    push(Q_DOWN, b.c, S_BUTTON, 0, t);
    push(Q_UP, b.c, S_BUTTON, 0, t + (b.c === C_SOFT ? 50 : 0));
  }
  function trayReleaseAll() {
    var t = now();
    while (nTray > 0) trayLift(trayPid[0], t);
  }

  I.buttons = function (on) {
    if (disposed || !padEl) return;
    on = !!on;
    if (on) trayBuild();
    trayShown = on;
    if (on) { padEl.classList.remove("hide"); trayLayout(); }
    else { trayReleaseAll(); padEl.classList.add("hide"); }
  };

  /* ================================================================
     gamepads
     ================================================================ */
  /* Every physical input remembers whether its press was counted: 0 up,
     1 down and counted, 2 down but not counted (pressed while paused, or
     still held across a reset), 3 held through a Ready and counted at the
     first live tick (goLive). Only a counted press is ever released, so
     a pad button released after a pause can never release a key that the
     keyboard is holding. Sticks use ±1 / ±2 / ±3 the same way. */
  var padSeen = false, padLast = -1;
  var padBtn = new Uint8Array(PAD_SLOTS * PAD_BTNS);
  var padSX = new Int8Array(PAD_SLOTS), padSY = new Int8Array(PAD_SLOTS);
  var padOn = new Uint8Array(PAD_SLOTS);

  /* returns whether the press was counted, or 3 for one held through Ready */
  function padPress(slot, c, t, playing) {
    if (c === C_PAUSE || c === C_GLASS) {
      /* Start pauses — and, because a pad has no other way into a paused
         game, it is passed on while paused too, marked playing:false */
      if (playing || c === C_PAUSE) { padLast = slot; ui(c === C_PAUSE ? "pause" : "glass", S_PAD, t, playing); }
      return false;
    }
    if (!playing) { if (c !== C_HARD && armedFn && armedFn()) { earlyN++; return 3; } return false; }
    padLast = slot; lastSrc = S_PAD;
    push(Q_DOWN, c, S_PAD, 0, t);
    return true;
  }
  function padCtl(b) { for (var j = 0; j < PAD_MAP.length; j += 2) if (PAD_MAP[j] === b) return PAD_MAP[j + 1]; return -1; }
  function padRelease(c, t) { push(Q_UP, c, S_PAD, 0, t); }
  /* a pad that vanished lets go of everything it was holding */
  function padForget(slot, t) {
    var base = slot * PAD_BTNS;
    for (var j = 0; j < PAD_MAP.length; j += 2) {
      var b = PAD_MAP[j];
      if (padBtn[base + b] === 1) padRelease(PAD_MAP[j + 1], t);
      padBtn[base + b] = 0;
    }
    if (padSX[slot] === -1) padRelease(C_LEFT, t);
    if (padSX[slot] === 1) padRelease(C_RIGHT, t);
    if (padSY[slot] === 1) padRelease(C_SOFT, t);
    padSX[slot] = 0; padSY[slot] = 0; padOn[slot] = 0;
  }
  function padLatch() {
    for (var i = 0; i < padBtn.length; i++) if (padBtn[i] === 1 || padBtn[i] === 3) padBtn[i] = 2;
    for (var s = 0; s < PAD_SLOTS; s++) {
      if (padSX[s] === 1 || padSX[s] === -1) padSX[s] *= 2;
      if (padSX[s] === 3 || padSX[s] === -3) padSX[s] = padSX[s] / 3 * 2;
      if (padSY[s] === 1 || padSY[s] === 3) padSY[s] = 2;
    }
  }
  function pollPads(w) {
    if (!padSeen || !nav || typeof nav.getGamepads !== "function") return;
    var list;
    try { list = nav.getGamepads(); } catch (e) { return; }
    if (!list) return;
    var playing = live();
    for (var s = 0; s < PAD_SLOTS; s++) {
      var gp = s < list.length ? list[s] : null;
      if (!gp || gp.connected === false || gp.mapping !== "standard") {
        if (padOn[s]) padForget(s, w);
        continue;
      }
      padOn[s] = 1;
      var t = gp.timestamp > 0 && gp.timestamp <= w + 50 && gp.timestamp > w - 100 ? gp.timestamp : w;
      var base = s * PAD_BTNS, bs = gp.buttons;
      for (var j = 0; j < PAD_MAP.length; j += 2) {
        var bi = PAD_MAP[j], c = PAD_MAP[j + 1];
        var btn = bs && bi < bs.length ? bs[bi] : null;
        var st = padBtn[base + bi], was = st !== 0, is;
        if (!btn) is = false;
        else if (bi === 6) {
          var v = typeof btn.value === "number" ? btn.value : (btn.pressed ? 1 : 0);
          is = was ? v > TRIG_OFF : v >= TRIG_ON;
        } else is = !!btn.pressed;
        if (is === was) continue;
        if (is) { var pr = padPress(s, c, t, playing); padBtn[base + bi] = pr === 3 ? 3 : pr ? 1 : 2; }
        else { if (st === 1) padRelease(c, t); if (st === 3) earlyN = Math.max(0, earlyN - 1); padBtn[base + bi] = 0; }
      }
      /* the left stick: engage at 0.5, release only below 0.35, so a thumb
         resting at the threshold produces one press rather than a stutter */
      var ax = gp.axes && gp.axes.length > 1 ? gp.axes[0] : 0, ay = gp.axes && gp.axes.length > 1 ? gp.axes[1] : 0;
      var sx = padSX[s], dx = sx < 0 ? -1 : sx > 0 ? 1 : 0, nx;
      if (dx === 0) nx = ax <= -STICK_ON ? -1 : ax >= STICK_ON ? 1 : 0;
      else if (dx < 0) nx = ax >= STICK_ON ? 1 : ax > -STICK_OFF ? 0 : -1;
      else nx = ax <= -STICK_ON ? -1 : ax < STICK_OFF ? 0 : 1;
      if (nx !== dx) {
        if (sx === -1) padRelease(C_LEFT, t);
        if (sx === 1) padRelease(C_RIGHT, t);
        if (sx === 3 || sx === -3) earlyN = Math.max(0, earlyN - 1);
        var prx = nx === 0 ? 0 : padPress(s, nx < 0 ? C_LEFT : C_RIGHT, t, playing);
        padSX[s] = nx === 0 ? 0 : prx === 3 ? nx * 3 : prx ? nx : nx * 2;
      }
      var sy = padSY[s], dy = sy ? 1 : 0, ny = dy ? (ay > STICK_OFF ? 1 : 0) : (ay >= STICK_ON ? 1 : 0);
      if (ny !== dy) {
        if (sy === 1) padRelease(C_SOFT, t);
        var pry = ny === 0 ? 0 : padPress(s, C_SOFT, t, playing);
        padSY[s] = ny === 0 ? 0 : pry === 3 ? 3 : pry ? 1 : 2;
      }
    }
  }
  function onPadConnect() { padSeen = true; }
  function onPadDisconnect(e) {
    var gp = e && e.gamepad;
    if (gp && gp.index >= 0 && gp.index < PAD_SLOTS && padOn[gp.index]) padForget(gp.index, now());
  }

  /* ================================================================
     haptics
     ================================================================ */
  var canVibrate = !!(nav && typeof nav.vibrate === "function");
  var busyUntil = 0, busyPri = 0, hardAt = -1e9;
  var mqReduce = win && win.matchMedia ? win.matchMedia("(prefers-reduced-motion: reduce)") : null;
  /* "reduce haptics" follows reduced motion: the system's setting, or the
     game's own Still */
  function reduced() {
    if (mqReduce && mqReduce.matches) return true;
    return !!(prefs && typeof prefs.motion === "function" && prefs.motion() === "still");
  }
  function rumble() {
    if (padLast < 0 || lastSrc !== S_PAD || !nav || typeof nav.getGamepads !== "function") return;
    try {
      var list = nav.getGamepads(), gp = list && list[padLast], va = gp && gp.vibrationActuator;
      if (!va || typeof va.playEffect !== "function") return;
      var pr = va.playEffect("dual-rumble", reduced() ? RUMBLE_SOFT : RUMBLE);
      if (pr && typeof pr.then === "function") pr.then(noop, noop);
    } catch (e) { /* a pad that cannot rumble simply does not */ }
  }
  I.haptic = function (kind) {
    if (disposed) return;
    var b = BUZZ[kind];
    if (!b) return;
    var w = now();
    if (kind === "hard") hardAt = w;
    if (!hapticsOn()) return;
    /* the turn tick is for a turn a finger asked for; a keyboard turn is
       silent to the hand. A lock right after a hard drop is the same event
       felt twice, so it is felt once. */
    if (kind === "rotate" && w - tapTurnAt > 250) return;
    if (kind === "lock" && w - hardAt < 150) return;
    if (b.rumble) rumble();
    if (!canVibrate || (lastSrc !== S_TOUCH && lastSrc !== S_BUTTON)) return;
    if (w < busyUntil && b.pri < busyPri) return;
    try { nav.vibrate(reduced() ? b.soft : b.p); } catch (e) { return; }
    busyUntil = w + b.len; busyPri = b.pri;
  };

  /* ================================================================
     the DOM: the haptic switch, the surface label, the guards
     ================================================================ */
  var el = opts.el || null;
  var host = el && el.tagName === "CANVAS" ? el.parentNode : el;
  var hx = null, lab = null, probe = null, hxId = "", overlays = [];
  var guardOn = null;

  function guardSync() {
    var on = live();
    if (on === guardOn) return;
    guardOn = on;
    /* the label only catches touches while a run is live; otherwise the
       canvases and the app's own handlers get them, untouched */
    if (lab) lab.style.pointerEvents = on ? "auto" : "none";
  }
  function hapticSync() {
    var on = hapticsOn();
    /* Haptics off: a disabled switch ignores the label's click, which is the
       brief's off switch. The overlays inside other buttons get out of the
       way entirely, so the button underneath takes the tap itself. */
    if (hx) hx.disabled = !on;
    for (var i = 0; i < overlays.length; i++) overlays[i].style.display = on ? "block" : "none";
  }

  /* Give any button the iPhone tick, by laying an invisible switch over it.
     A real tap lands on the switch, which ticks before the click is even
     dispatched, so it ticks whatever the button's own handler does with the
     event; the click then bubbles to the button as usual. Used for Pause. */
  I.hapticize = function (target) {
    if (disposed || !doc || !target || target.querySelector && target.querySelector("input[data-well-hx]")) return;
    /* where vibrate() exists the switch never ticks, so it would only sit
       over the button for nothing */
    if (canVibrate) return;
    var sw = doc.createElement("input");
    sw.type = "checkbox";
    sw.setAttribute("switch", "");
    sw.setAttribute("data-well-hx", "");
    sw.setAttribute("aria-hidden", "true");
    sw.tabIndex = -1;
    sw.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;margin:0;padding:0;" +
      "opacity:0;z-index:1;cursor:pointer;-webkit-tap-highlight-color:transparent";
    /* keep focus off it: a hidden checkbox must never be what Space presses */
    sw.addEventListener("mousedown", function (e) { e.preventDefault(); });
    sw.addEventListener("focus", function () { sw.blur(); });
    if (win && win.getComputedStyle && win.getComputedStyle(target).position === "static") target.style.position = "relative";
    target.appendChild(sw);
    overlays.push(sw);
    hapticSync();
  };

  if (doc && doc.body) {
    hxId = "wellHx" + (++made);
    hx = doc.createElement("input");
    hx.type = "checkbox";
    hx.setAttribute("switch", "");
    hx.id = hxId;
    hx.tabIndex = -1;
    hx.setAttribute("aria-hidden", "true");
    /* rendered, not display:none — a switch that is not drawn may not tick */
    hx.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;margin:0;opacity:0;pointer-events:none";
    /* a label click focuses its control in some browsers; an invisible
       checkbox holding focus would be what Space toggles in a menu */
    hx.addEventListener("focus", function () { hx.blur(); });
    doc.body.appendChild(hx);

    probe = doc.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;left:0;bottom:0;width:0;visibility:hidden;pointer-events:none;" +
      "height:env(safe-area-inset-bottom, 0px)";
    doc.body.appendChild(probe);

    if (host) {
      lab = doc.createElement("label");
      lab.htmlFor = hxId;
      lab.setAttribute("aria-hidden", "true");
      lab.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;margin:0;" +
        "touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;" +
        "-webkit-tap-highlight-color:transparent;cursor:default;pointer-events:none";
      /* just above the canvases, below everything the app puts after them */
      var canv = host.getElementsByTagName("canvas"), after = null;
      for (var ci = 0; ci < canv.length; ci++) if (canv[ci].parentNode === host) after = canv[ci];
      if (el && el.tagName === "CANVAS") after = el;
      if (after && after.nextSibling) host.insertBefore(lab, after.nextSibling);
      else if (after) host.appendChild(lab);
      else host.insertBefore(lab, host.firstChild);

      host.addEventListener("pointerdown", onPDown);
      host.addEventListener("pointermove", onPMove);
      host.addEventListener("pointerup", onPUp);
      host.addEventListener("pointercancel", onPCancel);
      host.addEventListener("touchstart", onTouchStart, { passive: false });
      host.addEventListener("touchend", onTouchEnd, { passive: false });
      host.addEventListener("gesturestart", onGuard);
      host.addEventListener("gesturechange", onGuard);
      host.addEventListener("contextmenu", onGuard);
      host.addEventListener("wheel", onWheelGuard, { passive: false });
    }
    var hapList = opts.hapticButtons !== undefined ? opts.hapticButtons : ["btnMenu"];
    for (var hb = 0; hapList && hb < hapList.length; hb++) {
      var target = typeof hapList[hb] === "string" ? doc.getElementById(hapList[hb]) : hapList[hb];
      if (target) I.hapticize(target);
    }
    hapticSync();
    guardSync();
  }

  /* ================================================================
     page lifecycle
     ================================================================ */
  function onBlur() { I.reset(); }
  function onVis() { if (doc && doc.hidden) I.reset(); }
  function onResize() { safeAt = -1; if (trayShown) trayLayout(); }
  if (win) {
    win.addEventListener("keydown", onKeyDown);
    win.addEventListener("keyup", onKeyUp);
    win.addEventListener("blur", onBlur);
    win.addEventListener("pagehide", onBlur);
    win.addEventListener("resize", onResize);
    win.addEventListener("orientationchange", onResize);
    win.addEventListener("gamepadconnected", onPadConnect);
    win.addEventListener("gamepaddisconnected", onPadDisconnect);
  }
  if (doc) doc.addEventListener("visibilitychange", onVis);
  /* a pad already connected before the page loaded may never announce
     itself; one look at the list says whether polling is worth it */
  if (nav && typeof nav.getGamepads === "function") {
    try { var gl = nav.getGamepads(); for (var gi = 0; gl && gi < gl.length; gi++) if (gl[gi]) padSeen = true; } catch (e) { /* not allowed here */ }
  }

  var unsub = null;
  if (prefs && typeof prefs.on === "function") {
    unsub = prefs.on(function (k) {
      if (disposed) return;
      if (k === "keys") buildKeys();
      else if (k === "das" || k === "arr" || k === "dcd") syncHandling();
      else if (k === "btnSize" || k === "btnOpacity" || k === "lefty") { if (trayShown) trayLayout(); }
      else if (k === "haptics") hapticSync();
    });
  }

  /* ================================================================
     public: letting go of everything
     ================================================================ */
  I.reset = function () {
    if (disposed) return;
    var t = lastT === null ? now() : lastT;
    qHead = 0; qLen = 0;
    for (var code in keyHeld) keyHeld[code] = -1;
    early = Object.create(null); earlyN = 0;
    for (var c = 0; c < NCTRL; c++) { held[c] = 0; inWait[c] = 0; }
    das.reset();
    ts.live = ts.open = ts.on = false; ts.want = ts.got = 0; ts.hasBase = false;
    if (softIsOn) { softIsOn = false; emit(A_SOFT_OFF, S_KEY, t, false); }
    for (var k = 0; k < 2; k++) {
      var p = ptrs[k];
      p.pending = false;
      if (p.on) { p.used = true; p.on = false; }
    }
    owner = -1;
    clickOK = false;
    /* tray keys still under a thumb are released and must be pressed again */
    for (var i = 0; i < trayBtns.length; i++) if (trayBtns[i].pid >= 0) { trayBtns[i].pid = -1; trayDownLook(trayBtns[i], false); }
    nTray = 0;
    /* pad inputs still held stay down but stop counting: they neither fire
       again on resume (Start held to pause must not unpause) nor, when the
       thumb comes off at last, undo a press the keyboard is still making */
    padLatch();
    ihsSkip = false;
  };

  /* ================================================================
     public: small conveniences for the app
     ================================================================ */
  /* what the player is touching the game with now — "key" "touch" "pad"
     "button", or null before anything — for the first-touch cards and the
     explainer's controls page */
  I.lastSource = function () { return lastSrc < 0 ? null : SOURCES[lastSrc]; };
  /* 0 none, 1 a sideways drag, 2 a soft drop — for the drag rail */
  I.dragging = function () {
    var p = owner === ptrs[0].id && ptrs[0].on ? ptrs[0] : owner === ptrs[1].id && ptrs[1].on ? ptrs[1] : null;
    return p && !p.used ? p.axis : 0;
  };
  /* the tray's own height, without #pad's padding: Layout's trayH */
  I.trayHeight = function () {
    var z = traySizes();
    return z.top + 2 * z.S + z.gap;
  };

  I.dispose = function () {
    if (disposed) return;
    I.reset();
    disposed = true;
    if (win) {
      win.removeEventListener("keydown", onKeyDown);
      win.removeEventListener("keyup", onKeyUp);
      win.removeEventListener("blur", onBlur);
      win.removeEventListener("pagehide", onBlur);
      win.removeEventListener("resize", onResize);
      win.removeEventListener("orientationchange", onResize);
      win.removeEventListener("gamepadconnected", onPadConnect);
      win.removeEventListener("gamepaddisconnected", onPadDisconnect);
    }
    if (doc) doc.removeEventListener("visibilitychange", onVis);
    if (host) {
      host.removeEventListener("pointerdown", onPDown);
      host.removeEventListener("pointermove", onPMove);
      host.removeEventListener("pointerup", onPUp);
      host.removeEventListener("pointercancel", onPCancel);
      host.removeEventListener("touchstart", onTouchStart, { passive: false });
      host.removeEventListener("touchend", onTouchEnd, { passive: false });
      host.removeEventListener("gesturestart", onGuard);
      host.removeEventListener("gesturechange", onGuard);
      host.removeEventListener("contextmenu", onGuard);
      host.removeEventListener("wheel", onWheelGuard, { passive: false });
    }
    if (tray && tray.parentNode) tray.parentNode.removeChild(tray);
    if (lab && lab.parentNode) lab.parentNode.removeChild(lab);
    if (hx && hx.parentNode) hx.parentNode.removeChild(hx);
    if (probe && probe.parentNode) probe.parentNode.removeChild(probe);
    for (var i = 0; i < overlays.length; i++) if (overlays[i].parentNode) overlays[i].parentNode.removeChild(overlays[i]);
    overlays.length = 0;
    if (typeof unsub === "function") unsub();
  };

  return I;
};

if (typeof module !== "undefined" && module.exports) module.exports = Input;
else root.Input = Input;
})(typeof self !== "undefined" ? self : this);
