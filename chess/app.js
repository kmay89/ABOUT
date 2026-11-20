/* app.js — the room itself.
   Game flow for three ways to play (pass & play, the coach, nearby),
   the tournament clock, the gentle coach, opening stories, history
   browsing, persistence, and the self-healing boot. The rules live in
   engine.js; the boards live in gfx2d.js / gfx3d.js; the nearby link
   lives in net.js; the openings live in book.js. This file only
   conducts. */
/* global Chess, Book, Eco, Teach, Learn, Rating, Skins, Pieces3D, Gfx2D, Gfx3D, Net, Room, Brain, Sound, Fx, Motion, Scenes, Haptics, Press, Help, Games, Feats, Goals, Share, Friends, Ink, Pgn, Access, Cast, Avatar, Stage, Momentum, Unlocks, Journey */
(function () {
"use strict";

function $(id) { return document.getElementById(id); }
var REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ===== self-healing: catch trouble before it strands anyone =====
   Three errors inside eight seconds bring up the recovery card. A
   promise that fails with nobody listening counts too, when it is the
   kind of failure a bug makes (see recRejectionCounts in the recovery
   block near the end); a network hiccup or a refused permission is not
   one, and never strands anybody. */
var errTimes = [];
function panic() {
  var ov = $("ovRecover");
  if (!ov) return;
  try { recFill(); } catch (e) {}
  ov.classList.remove("hide");
}
function recCount(info) {
  recNote(info);
  var now = Date.now();
  errTimes.push(now);
  errTimes = errTimes.filter(function (t) { return now - t < 8000; });
  if (errTimes.length >= 3) panic();
}
window.addEventListener("error", function (e) {
  recCount({ msg: e && e.message, src: e && e.filename, line: e && e.lineno, col: e && e.colno });
});
window.addEventListener("unhandledrejection", function (e) {
  var r = e && e.reason;
  if (!recRejectionCounts(r)) return;
  recCount({ msg: "a promise failed: " + (r && r.message ? r.name + ": " + r.message : String(r)),
             src: r && r.stack ? String(r.stack).split("\n").slice(1, 2).join("").trim() : "" });
});

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { recStoreFailed(); return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

var PREF_KEY = "chessroom_prefs", SAVE_KEY = "chessroom_save", LAN_KEY = "chessroom_lan";

/* ===== preferences ===== */
var prefs = { skin: null, use3d: true, sound: true, haptics: true, coach: true, helpers: true, clockSkin: "simple", name: "", fx: "auto", coachVoice: "plain", lastClock: {}, autoFlip: false, scene: "park", tilt: true, roomTone: true, music: true, pieceVoice: "lively" };
(function () {
  try {
    var p = JSON.parse(lsGet(PREF_KEY) || "{}");
    for (var k in prefs) if (p[k] !== undefined) prefs[k] = p[k];
  } catch (e) {}
  if (location.hash === "#force2d") { prefs.use3d = false; }
  /* a hand-edited store should not be able to name an effects tier the
     renderer has never heard of */
  if (["auto", "high", "medium", "low"].indexOf(prefs.fx) < 0) prefs.fx = "auto";
  if (["plain", "brief"].indexOf(prefs.coachVoice) < 0) prefs.coachVoice = "plain";
  prefs.haptics = prefs.haptics !== false;
  if (typeof Scenes === "undefined" || !Scenes.has(prefs.scene)) prefs.scene = "park";
  if (!prefs.lastClock || typeof prefs.lastClock !== "object") prefs.lastClock = {};
  Object.keys(prefs.lastClock).forEach(function (k) {
    if (!clkOk(prefs.lastClock[k])) delete prefs.lastClock[k];
  });
})();
function savePrefs() { lsSet(PREF_KEY, JSON.stringify(prefs)); }
/* ===== edge: preferences read here, not in the literal above =====
   A switch kept as a word in a hand-edited store ("false") is truthy, so
   every on/off preference is made a real boolean, falling back to its
   default when it is anything else. New switches are read here too. */
(function () {
  var stored = {};
  try { stored = JSON.parse(lsGet(PREF_KEY) || "{}") || {}; } catch (e) {}
  [["use3d", true], ["sound", true], ["coach", true], ["helpers", true], ["autoFlip", false],
   ["tilt", true], ["roomTone", true], ["music", true]].forEach(function (b) {
    var v = prefs[b[0]];
    prefs[b[0]] = v === true || v === "true" ? true : v === false || v === "false" ? false : b[1];
  });
  if (location.hash === "#force2d") prefs.use3d = false;
  /* auto-queen: off unless asked for — the picker exists for the rare
     underpromotion, and a convenience must not take that away unasked */
  prefs.autoQueen = stored.autoQueen === true;
  /* the pieces' game voices (stage.js): lively unless asked for natural */
  prefs.pieceVoice = stored.pieceVoice === "natural" ? "natural" : "lively";
})();

/* ===== the look =====
   One skin object drives both renderers and the page chrome. Changing
   it is instant and allowed at any time — including mid-game, which is
   the whole point of the Studio. */
var skin = Skins.clean(prefs.skin || Skins.PRESETS[0], "Walnut Study");
/* `skin` is always your own choice. What is on the table can be someone
   else's: a coach plays you on its own board (see "the coaches' boards"),
   and wornHome names that coach while it does. */
var wornHome = null, homeOff = null;
function look() { return (wornHome && Skins.homeOf(wornHome)) || skin; }
function paintSkin(s) {
  if (R2) R2.setSkin(s);
  if (R3) R3.setSkin(s);
  /* the room around the board follows the board */
  var root = document.documentElement;
  root.style.setProperty("--room", s.room.bg);
  root.style.setProperty("--amber", s.marks.select);
  root.style.setProperty("--glow", s.marks.last);
  root.style.setProperty("--plan", s.marks.plan);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", s.room.bg);
  /* the pieces' material and the board's finish are both part of how
     they sound, so the synth hears about a skin change too */
  if (typeof Sound !== "undefined") Sound.setSkin(s);
  needFrame();
}
function applySkin(s, save) {
  skin = Skins.clean(s);
  /* choosing a look is choosing it now: the coach's board steps aside
     for the rest of this game */
  wornHome = null;
  /* (the game itself, not a ticket: a take-back must not bring it back) */
  if (G && mode === "coach") homeOff = G;
  paintSkin(skin);
  if (save !== false) { prefs.skin = skin; savePrefs(); }
}

/* ===== sound =====
   The pieces have their own voices now — a material, a weight and a
   friction, modelled in sound.js off the very plan the board is
   animating. What is left here is the thin layer between the game and
   that: the signals (a clock tick, a link, the end of a game) go
   straight through, and a move hands over its plan so the slide and the
   set-down can be scheduled on the audio clock rather than hoped for on
   a timer. */
function snd(kind, opts) {
  if (!prefs.sound || typeof Sound === "undefined") return 0;
  return Sound.ui(kind, opts) || 0;
}
/* a piece being lifted off the board: not a move yet, but the first
   thing you hear when you touch one */
function sndPickUp(piece) {
  hap("select");
  if (!prefs.sound || typeof Sound === "undefined") return;
  Sound.pickUp(piece);
  if (typeof Stage !== "undefined") Stage.pickUp(piece);
}
/* The whole gesture: the drag for as long as it is on the board, the
   knock of whatever it takes, the rook of a castle in its own weight,
   and the moment it is set down. The plan is the renderer's own, so the
   two cannot drift apart. */
function sndMove(desc, plan, captured) {
  if (!prefs.sound || typeof Sound === "undefined" || !plan) return;
  Sound.move(desc, plan, { captured: captured || 0 });
  /* and its game voice: bright for yours, lower and softer for theirs */
  if (typeof Stage !== "undefined") Stage.move(desc, plan, { captured: captured || 0, mine: sideIsMine(desc.piece > 0 ? 1 : -1) });
}
/* whose a move is, for how it sounds: on one screen every move is yours */
function sideIsMine(side) {
  if (mode === "coach") return side === humanSide;
  if (mode === "lan") return side === lanSide;
  if (mode === "lesson" && lesson) return side === lesson.side;
  if (mode === "pass") return true;
  return side === orientation;
}

/* ===== touch (haptics.js) =====
   The hand's half of every moment, on the same instants as the eye's and
   the ear's: a move is felt as it lands, not when it is decided. It has
   its own switch, apart from sound — plenty of people play muted and
   still want to feel the board, and the other way round. Your own moves
   are felt in full and the other side's softly: the point is to put you
   in the game, not to jolt you every time the coach replies. */
var HAP = typeof Haptics !== "undefined";
function hap(kind, opts) { return HAP && prefs.haptics ? Haptics.play(kind, opts) : false; }
function hapAt(kind, ms, opts) { if (HAP && prefs.haptics) Haptics.at(kind, ms, opts); }
/* a man (or a clock) that belongs to whoever is across the table. Two
   people on one screen are both "you"; a story playing itself is nobody's. */
function hapTheirs(piece) {
  if (mode === "tour") return true;
  var me = mode === "coach" ? humanSide : mode === "lan" ? lanSide : (mode === "lesson" && lesson) ? lesson.side : 0;
  return !!me && (piece > 0 ? 1 : -1) !== me;
}
/* a move, timed off the very plan the board is animating: the knock as
   it lands, the rook and then the king of a castle, the rising triplet
   with the promotion's pillar. A capture in a game is felt at
   fxCapture's instant instead; elsewhere (a lesson) it is felt here. */
function hapMove(desc, plan, took, withCapture) {
  if (!HAP || !prefs.haptics || !desc) return;
  var soft = hapTheirs(desc.piece), dur = plan ? plan.dur : 0;
  var landAt = plan ? dur * plan.travel : 0;
  if (desc.rookFrom != null) {
    var rookAt = plan ? dur * plan.rookOut : 0;
    hapAt("castle", Math.min(rookAt, landAt), { gap: Math.abs(landAt - rookAt), soft: soft });
    return;
  }
  if (desc.promo) hapAt("promote", dur * 0.3, { soft: soft });
  if (took) { if (withCapture) hapAt("capture", landAt, { power: FX ? Fx.powerOf(took) : 0.5, soft: soft }); return; }
  if (!desc.promo) hapAt("land", landAt, { piece: desc.piece, soft: soft });
}
/* Buttons answer a press the way a real key does: it goes down, it
   clicks under the thumb, and it makes a small dry sound whose pitch
   says what kind of key it was. press.js decides the moment (so a
   finger starting a scroll presses nothing, and the quickest tap still
   shows the whole press); the look is the stylesheet's ("the keys").
   Anything that already has its own feel says so with data-feel="own". */
var PRESS_KEYS = ".bigbtn, .tile, .rung, .rungRow, .lrow2, .gameRow, .preset, .abtn, .chip, .lchip, .stPick, .askRow button, .tact, " +
  "#inkPill button, #promoRow button, .playBtn, .ptab, .pftab, .linkish, .ghostbtn";
var PRESS_HZ = { key: 1320, bright: 1568, play: 1175, tab: 1480, quiet: 988 };
function wirePress() {
  if (typeof Press === "undefined") return;
  Press.attach(document, { selector: PRESS_KEYS, onDown: function (el, kind) {
    if (el.getAttribute("data-feel") !== "own") hap("tick");
    /* a switch speaks once it has flipped, and says which way */
    if (kind !== "switch") snd("tap", { hz: PRESS_HZ[kind] || PRESS_HZ.key });
  } });
  Press.switches(document);
  document.addEventListener("click", function (e) {
    var s = e.target && e.target.closest ? e.target.closest(".sw") : null;
    if (s) setTimeout(function () { snd("tap", { hz: s.classList.contains("sel") ? 1760 : 1047 }); }, 0);
  });
}
wirePress();

/* ===== the big moments (fx.js) =====
   The board's half (a struck square, a king laid down, a camera that
   leans in) and the light's half (sparks, rings, a sweep, confetti) are
   fired together at the instant each thing happens — which is when the
   piece lands, not when the move is decided. All of it is optional: a
   room without fx.js, or with reduced motion, simply has none of it. */
var FX = typeof Fx !== "undefined";
function fxInit() {
  if (!FX) return;
  Fx.attach($("stage"), { reduced: REDUCED });
  Fx.setProjector(function (sq, lift) {
    if (!R || !R.squareToScreen) return null;
    var p = R.squareToScreen(sq, lift);
    if (!p) return null;
    var cv = R === R3 ? $("cv3") : $("cv2");
    return { x: p.x + cv.offsetLeft, y: p.y + cv.offsetTop, s: p.s, sy: p.sy };
  });
}
/* a capture lands when the taker does — the same instant the synth sets
   it down, louder for a capture */
function fxCapture(desc, took, plan) {
  if (!took) return;
  var power = FX ? Fx.powerOf(took) : 0.5, at = gameTicket;
  var sq = desc.epSq != null ? desc.epSq : desc.to;    /* en passant: the pawn taken stands beside the landing square */
  setTimeout(function () {
    if (!R || at !== gameTicket) return;
    if (R.impact) { R.impact(sq, power); needFrame(); }
    /* the weight of it: the board holds its breath for a few frames
       while the camera takes the blow — longer and harder for a queen
       than for a pawn */
    if (R.hitStop) R.hitStop(45 + 50 * power);
    if (R.kick) R.kick(0.35 + 0.65 * power, sq);
    if (!FX) return;
    Fx.capture(sq, { piece: took, power: power, color: took > 0 ? look().pieces.white : look().pieces.black });
    hap("capture", { power: power, soft: hapTheirs(desc.piece) });
  }, plan ? plan.dur * plan.travel : 0);
}
/* A heavy man set down without taking anything still has weight: a
   king, a queen or a rook landing gives the camera the smallest of
   nudges. The light pieces land without one, so it means something. */
var LAND_WEIGHT = [0, 0, 0, 0, 0.13, 0.16, 0.16];
function feelLand(desc, took, plan) {
  if (took || !R || !R.kick || !plan) return;
  var w = LAND_WEIGHT[Math.abs(desc.piece)] || 0;
  if (!w) return;
  var at = gameTicket;
  setTimeout(function () { if (R && at === gameTicket) { R.kick(w, desc.to); needFrame(); } },
             plan.dur * plan.travel);
}
function fxPromote(desc, plan) {
  if (!FX || !desc.promo) return;
  var at = gameTicket;
  /* the pillar rises with the renderer's own promotion flash */
  setTimeout(function () { if (at === gameTicket) Fx.promote(desc.to, { color: desc.piece > 0 ? 1 : -1 }); },
             plan ? plan.dur * 0.3 : 0);
}
function fxCheck(kingSq) {
  if (kingSq != null && kingSq >= 0 && R && R.kick) { R.kick(0.24, kingSq); needFrame(); }
  if (!FX || kingSq == null || kingSq < 0) return;
  Fx.check(kingSq, { color: look().marks.check });
  hap("check");
}
/* win: true (you delivered it), false (it was delivered to you), null
   (two people on one board — a mate is everyone's moment) */
var fxDown = null;     /* the mated king and who mated him, to lay him down again */
function fxMate(kingSq, attackerSq, win) {
  if (!R) return;
  fxDown = { king: kingSq, from: attackerSq };
  if (R.topple) R.topple(kingSq, { from: attackerSq });
  /* a narrow phone is already framed wide; lean in less */
  /* a narrow phone's 3D view is already framed wide; lean in less. (The
     drawn board's lean is its own small zoom, left at its default.) */
  if (R.focus) R.focus(kingSq, R.kind === "3d" ? { amount: innerWidth < 600 ? 0.6 : 1 } : undefined);
  /* the camera takes the blow as the king hits the wood, then walks
     slowly round him while the result sinks in */
  var at = gameTicket;
  setTimeout(function () { if (R && at === gameTicket && R.kick) { R.kick(0.9, kingSq); needFrame(); } },
             typeof Motion !== "undefined" && Motion.kingFallKnock ? Motion.kingFallKnock() : 600);
  if (R.drift) R.drift(true);
  needFrame();
  if (!FX) return;
  Fx.mate(kingSq, { win: win });
  hap(win === false ? "mateLoss" : "mateWin");
}
/* the board was redrawn under a finished game — a switch between 2D and
   3D, a return from looking back — so he is laid down again, without the
   fall: a mated king does not get up */
function fxRelay() {
  if (fxDown && over && viewPly < 0 && R && R.topple) {
    R.topple(fxDown.king, { from: fxDown.from, still: true });
    needFrame();
  }
}
/* leaving a finished game behind: a take-back, the look-back, the menu */
function fxCalm() {
  fxDown = null;
  if (R && R.untopple) R.untopple();
  if (R && R.focus) R.focus(null);
  if (R && R.drift) R.drift(false);
  if (FX) Fx.clear();
  needFrame();
}
function mateMood(result) {
  var me = mode === "coach" ? humanSide : mode === "lan" ? lanSide : (mode === "lesson" && lesson) ? lesson.side : 0;
  if (!me) return null;
  return (result === "white") === (me === 1);
}
/* the men arriving: one soft knock per rank as it lands, and the game's
   opening motif once the last of them is still */
function sndArrival(fresh) {
  var landings = R && R.flourishPlan ? R.flourishPlan() : [];
  if (!fresh) return;
  var felt = {};
  landings.forEach(function (l) { if (!felt[l.wave]) { felt[l.wave] = true; hapAt("arrive", l.t); } });
  if (!landings.length) { snd("start"); return; }
  if (!prefs.sound || typeof Sound === "undefined") return;
  var seen = {}, at = gameTicket;
  landings.forEach(function (l) {
    if (seen[l.wave]) return;
    seen[l.wave] = true;
    setTimeout(function () { if (at === gameTicket && Sound.tap) Sound.tap(Math.abs(l.piece), 0.4); }, l.t);
  });
  var still = landings[landings.length - 1].t +
    (typeof Motion !== "undefined" && Motion.DROP_MS ? Motion.DROP_MS - Motion.DROP.fall : 300);
  setTimeout(function () { if (at === gameTicket) snd("start"); }, still);
}

/* ===== toast — the one funnel for every message ===== */
var toastTimer = 0;
function toast(html, actions, ms, extras) {
  var el = $("toast");
  /* a remark never replaces a question that is still waiting for an
     answer — the notebook has kept the remark. But buttons that are
     only extras (a hint's "Show the line", the help lamp's menu) are
     not a question, and what you ask for next takes their place. */
  if (!actions && el.classList.contains("show") && el.classList.contains("acts") &&
      !el.classList.contains("lamp") && !toastExtras) return;
  toastExtras = !!(actions && extras);
  accToast(html, actions);
  el.classList.remove("lamp");
  el.innerHTML = html;
  el.classList.toggle("acts", !!actions);
  if (actions) {
    var row = document.createElement("div");
    actions.forEach(function (a) {
      var b = document.createElement("button");
      b.className = "tact" + (a.ghost ? " ghost" : "");
      b.textContent = a.label;
      b.addEventListener("click", function () { hideToast(); a.fn(); });
      row.appendChild(b);
    });
    el.appendChild(row);
  }
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms || paceWords(actions ? 9000 : 4200));
}
function hideToast() { $("toast").classList.remove("show"); }
var toastExtras = false;   /* the toast on show has buttons, but waits for no answer */

/* A question that needs an answer before anything else happens: above
   every card (a question asked from the lobby used to be drawn beneath
   it), never overwritten by a remark, and answered by Escape or a tap
   outside with its last, gentlest choice. */
var askCancel = null;
function ask(html, actions) {
  $("askBody").innerHTML = html;
  var row = $("askRow");
  row.innerHTML = "";
  actions.forEach(function (a, i) {
    var b = document.createElement("button");
    b.textContent = a.label;
    if (i === 0) b.className = "go";
    b.addEventListener("click", function () { closeAsk(); a.fn(); });
    row.appendChild(b);
  });
  askCancel = actions[actions.length - 1].fn;
  $("ovAsk").classList.remove("hide");
  snd("open");
}
function closeAsk() { $("ovAsk").classList.add("hide"); askCancel = null; }

/* ===== renderers ===== */
var R2 = null, R3 = null, R = null;
/* How much of the 3D board's lighting to actually run. "Auto" lets the
   renderer read the device and decide, which is right nearly always;
   the other three are there for the player who knows their machine
   better than we do — a laptop that runs hot, or a desktop that would
   rather have everything. It is a property of the device rather than of
   the look, so it rides in prefs and never in a shared skin code. */
var FX_LEVELS = [
  { id: "auto", label: "Auto", note: "picks what this device can carry" },
  { id: "high", label: "Full", note: "shadows, reflections, bloom, grain — everything" },
  { id: "medium", label: "Balanced", note: "softer shadows, no reflections" },
  { id: "low", label: "Simple", note: "no shadows or bloom; kindest to a battery" }
];
function gfxOpts() {
  return {
    onContextLost: function () { retire3D(); switchDim(false, true); },
    fx: prefs.fx && prefs.fx !== "auto" ? prefs.fx : undefined,
    scene: prefs.scene
  };
}
/* ===== where the board is =====
   A place from scenes.js. The 3D board stands on its table with the
   place all round it; the flat board lies on the same table, seen from
   straight above. It is a choice about the room rather than about the
   board, so it rides in prefs and never in a shared skin code. */
var tableLooks = {};
function setScene(id) {
  if (!Scenes.has(id)) id = Scenes.DEFAULT;
  prefs.scene = id; savePrefs();
  if (R3) R3.setScene(id);
  syncStageBackdrop();
  syncRoomTone();
  needFrame();
}
/* the place's own quiet — birds in the park, the murmur of the café,
   the fire in the grand room — under the game, if sound is on and the
   room tone has not been switched off in the Studio. Level, not a
   switch: sound.js fades it in and out. */
var audioWoken = false;
function syncRoomTone() {
  if (typeof Sound === "undefined" || !Sound.setPlace) return;
  Sound.setPlace(prefs.scene);
  /* not before the first tap: a browser will not start the audio clock
     until somebody has touched the page, and asking for a room tone
     before then would only open a clock that cannot run yet */
  if (typeof Stage !== "undefined") {
    Stage.setPlace(prefs.scene);
    Stage.setLively(prefs.pieceVoice !== "natural");
  }
  if (!audioWoken) return;
  Sound.ambience(prefs.sound && prefs.roomTone ? 0.7 : 0);
  /* the place's own music, under everything, and its echo on every
     piece (stage.js) */
  if (typeof Stage !== "undefined") { Stage.room(); Stage.music(prefs.sound && prefs.music ? 1 : 0); }
}
function syncStageBackdrop() {
  var st = $("stage");
  if (!st) return;
  var url = "";
  /* only the flat board shows it: the 3D one brings its own table, and
     the strip a drawer leaves under the 3D canvas should stay the room
     colour rather than show a second table from above */
  if (prefs.scene !== "studio" && R && R === R2) {
    if (!(prefs.scene in tableLooks)) {
      var b = null;
      try { b = Scenes.build(prefs.scene); } catch (e) { b = null; }
      tableLooks[prefs.scene] = b && b.table ? tableFromAbove(b.table.color) : "";
    }
    url = tableLooks[prefs.scene];
  }
  st.style.backgroundImage = url ? 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.35)), url("' + url + '")' : "";
}
/* the table top, smaller and as a picture the page can wear */
function tableFromAbove(src) {
  try {
    var cv = document.createElement("canvas");
    cv.width = cv.height = 512;
    cv.getContext("2d").drawImage(src, 0, 0, 512, 512);
    return cv.toDataURL("image/jpeg", 0.82);
  } catch (e) { return ""; }
}
function initRenderers() {
  R2 = Gfx2D.create($("cv2"));
  if (prefs.use3d) {
    try {
      R3 = Gfx3D.create($("cv3"), gfxOpts());
    } catch (e) { R3 = null; }
  }
  if (!R3 && prefs.use3d) prefs.use3d = false;
  useRenderer(prefs.use3d && R3 ? R3 : R2);
  syncDimButton();
  syncStageBackdrop();
}
function useRenderer(r) {
  R = r;
  $("cv3").classList.toggle("hide", R !== R3);
  $("cv2").classList.toggle("hide", R !== R2);
  if (typeof syncTilt === "function") syncTilt();
  R.setSkin(look());
  R.setOrientation(orientation);
  R.resize();
  if (G) { R.setPosition(currentViewBoard()); syncBoard(); fxRelay(); }
  syncStageBackdrop();
  needFrame();
}
/* A canvas whose context has been lost keeps handing the same dead
   context back, so trying 3D again on it drew a blank board for ever.
   The renderer is let go and its canvas replaced, and the next try
   builds both from scratch. */
function retire3D() {
  if (!R3) return;
  try { R3.destroy(); } catch (e) {}
  R3 = null;
  var old = $("cv3"), cv = document.createElement("canvas");
  cv.id = "cv3"; cv.className = old.className;
  old.parentNode.replaceChild(cv, old);
}
function switchDim(to3d, becauseLost) {
  if (to3d && !R3) {
    try { R3 = Gfx3D.create($("cv3"), gfxOpts()); } catch (e) { R3 = null; }
    if (!R3) { toast("3D isn't available on this device — the 2D board is just as sharp."); return; }
  }
  prefs.use3d = !!(to3d && R3); savePrefs();
  useRenderer(prefs.use3d ? R3 : R2);
  tableSync();
  syncDimButton();
  if (becauseLost) toast("The 3D view stumbled, so the game moved to the 2D board — nothing was lost. You can try 3D again from the button below.");
}
/* the button names what it will do, not what is already on screen */
function syncDimButton() {
  $("dimLbl").textContent = prefs.use3d ? "2D" : "3D";
  $("dimIc").textContent = prefs.use3d ? "②" : "③";
  $("btnDim").title = prefs.use3d ? "Switch to the flat board" : "Switch to the 3D board";
}

/* ===== game state ===== */
var G = null;                  /* the Chess game object */
var mode = null;               /* 'pass' | 'coach' | 'lan' | 'tour' */
var over = null;               /* {result, reason} once finished */
var humanSide = 1;             /* coach mode: which colour is the person */
var skill = "sprout";
var lanSide = 1, lanMy = "", lanOpp = "Friend", lanCfg = null;
var orientation = 1;
var sel = -1, legalMoves = [];
var viewPly = -1;              /* -1 = live; else index into G.played shown */
var pendingPromo = null;       /* {from, to} awaiting picker */
var lastNarratedOpening = "";
var tourTimer = 0, tourLine = null, tourStep = 0;
var coachTimer = 0, thinking = false;
/* Two different kinds of stale.

   brainTicket bumps on every move: an answer about *this position* —
   the coach's reply, a hint — is worthless once the position has moved
   on, so anything carrying an old one is dropped.

   gameTicket bumps only when the game itself changes underneath, on a
   new game or a take-back. A review is a remark about a move that has
   already been played, and stays worth saying after the opponent has
   replied — which in coach mode it always has. Guarding the review with
   brainTicket silently throws it away in the one mode it matters most. */
var brainTicket = 0, gameTicket = 0;

/* The ladder. Depth is capped as well as time so a level plays the same
   way on a fast laptop and a slow phone — a coach whose strength depends
   on your hardware cannot be practised against. The slack (noise) is
   what actually sets the level now that the ranked list it draws from is
   a real search: at the bottom it will walk into things, at mentor it
   will not. The rungs themselves, and the rating each one carries, live
   in rating.js, where they were measured by playing them off against
   each other. */
var SKILLS = {};
Rating.LEVELS.forEach(function (L) {
  SKILLS[L.id] = { ms: L.ms, maxDepth: L.maxDepth, noise: L.noise, label: L.emoji + " " + L.name,
                   name: L.name, emoji: L.emoji, elo: L.elo, blurb: L.blurb,
                   /* the first sentence, for a row that has room for one */
                   short: String(L.blurb || "").replace(/([.!?])\s.*$/, "$1") };
});
/* a save from before the ladder grew may name a rung by an old id; it
   still has to open */
function skillOk(id) { return SKILLS[id] ? id : "sprout"; }

/* ===== clock ===== */
var clock = { on: false, base: 0, inc: 0, w: 0, b: 0, run: 0 /* 0 none, 1 white, -1 black */, lastT: 0, lowTicked: -1 };
/* ----- clk: one list of presets, one rule for what a clock may be -----
   The chips on the new-game card are drawn from CLK_PRESETS, and every
   clock that arrives from anywhere — a chip, the two custom fields, a
   save, a remembered preference, the other device — passes clkOk before
   it is used: "none", or whole minutes (1–180) plus whole seconds a move
   (0–60). */
var CLK_PRESETS = [
  { v: "none", label: "No clock" }, { v: "3+2", label: "3+2 blitz" }, { v: "5+0", label: "5 min" },
  { v: "10+5", label: "10+5 rapid" }, { v: "15+10", label: "15+10" }, { v: "30+0", label: "30 min" }
];
var CLK_MAX_MIN = 180, CLK_MAX_INC = 60;     /* the same bounds clkOk holds to */
function clkOk(str) {
  if (str === "none") return true;
  var m = /^(\d{1,3})\+(\d{1,2})$/.exec(String(str));
  /* literal bounds: the preferences are read with this before CLK_MAX_* are set */
  return !!m && +m[1] >= 1 && +m[1] <= 180 && +m[2] <= 60;
}
function clockConfig(str) {
  if (!str || str === "none" || !clkOk(str)) { clock.on = false; return; }
  var m = str.split("+");
  clock.on = true;
  clock.base = (+m[0]) * 60000;
  clock.inc = (+(m[1] || 0)) * 1000;
  clock.w = clock.base; clock.b = clock.base;
  clock.run = 0; clock.lowTicked = -1;
}
function fmtClock(ms) {
  if (ms < 0) ms = 0;
  var s = Math.ceil(ms / 1000);
  if (ms < 20000) { /* show tenths under 20s, the tournament way */
    return (ms / 1000).toFixed(1);
  }
  var mm = Math.floor(s / 60), ss = s % 60;
  if (mm >= 60) return Math.floor(mm / 60) + ":" + String(mm % 60).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
  return mm + ":" + String(ss).padStart(2, "0");
}
/* A game on this device stops its clock while you are somewhere else —
   the menu, the settings, your record. Nobody asked the room to charge
   them for choosing a board colour. The Studio is a drawer beside a game
   that goes on, so it does not stop anything. A game between two devices
   keeps running: the other person is still sitting there. */
function clockPaused() {
  if (mode === "lan") return false;
  if (clkHiddenAt) return true;      /* out of sight: see clkAway */
  var ids = cardIds("pause");
  for (var i = 0; i < ids.length; i++) if (!$(ids[i]).classList.contains("hide")) return true;
  return false;
}
/* The clock is charged by the wall clock: whatever time really passed
   since it was last read. It used to add up frame gaps and drop any gap
   over three seconds, so a tab the browser stopped drawing — hidden, or
   just stalled — stopped costing time. Pauses are now said, not
   guessed: a card that pauses (above) and, in a game on this device,
   the tab being out of sight (clkAway near the end) move lastT on
   instead. */
function clockTick(now) {
  if (!clock.on || !clock.run || over || !G) return;
  var dt = now - clock.lastT;
  clock.lastT = now;
  if (clockPaused()) return;
  if (dt <= 0) return;
  if (clock.run === 1) clock.w -= dt; else clock.b -= dt;
  var ms = clock.run === 1 ? clock.w : clock.b;
  if (ms <= 10500 && ms > 0) {
    var sec = Math.ceil(ms / 1000);
    if (sec !== clock.lowTicked) {
      clock.lowTicked = sec;
      /* the last five seconds are a heartbeat, quickening, not a ticking */
      if (sec <= 5) snd("low-time", { left: sec }); else snd("tick");
      if (sec <= 5 && !hapTheirs(clock.run)) hap("heartbeat");
    }
  }
  if (ms <= 0) flagFall(clock.run);
  syncClocks();
}
function flagFall(side) {
  if (over) return;
  /* the pro rule: a flag falls to a WIN only if the other side could
     still in principle mate; otherwise it's a draw */
  var other = -side;
  var winner = sideHasMatingMaterial(other, side) ? other : 0;
  var who = side === 1 ? "White" : "Black";
  if (mode === "coach" && side === humanSide) who = "You";
  endGame(winner === 0 ? "draw" : (winner === 1 ? "white" : "black"),
    winner === 0 ? who + (who === "You" ? " ran" : " ran") + " out of time — but " + sideName(other) + " had no way to mate, so it's a draw (the real rule!)"
                 : who + " ran out of time");
}
/* Could `side` still mate at all? A lone knight or bishop cannot on an
   empty board — but it can when the other side has men of its own to
   get in their king's way, which is why the rule asks about both. */
function sideHasMatingMaterial(side, against) {
  var n = 0, i, p, theirs = 0;
  for (i = 0; i < 128; i++) {
    if (i & 0x88) continue;
    p = G.board[i];
    if (!p) continue;
    var k = Math.abs(p);
    if ((p > 0 ? 1 : -1) !== side) { if (k !== Chess.K) theirs++; continue; }
    if (k === Chess.P || k === Chess.R || k === Chess.Q) return true;
    if (k !== Chess.K) n++;
  }
  return n >= 2 || (n === 1 && against != null && theirs > 0);
}
function afterMoveClock(mover) {
  if (!clock.on) return;
  /* before each side's first move its time doesn't run (the friendly
     online convention) — so neither clock starts until both sides have
     moved, and a first move that cost no time earns no increment */
  if (G.played.length > 2) { if (mover === 1) clock.w += clock.inc; else clock.b += clock.inc; }
  clock.lowTicked = -1;
  clock.run = (G.played.length >= 2 && !over) ? G.turn : 0;
  clock.lastT = performance.now();
  syncClocks();
}
/* sixty times a second the clock is asked how it looks; it only touches
   the page when the answer has changed */
var clockLook = { clockTop: "", clockBot: "" };
function syncClocks() {
  var topSide = -orientation, botSide = orientation;
  [["clockTop", topSide], ["clockBot", botSide]].forEach(function (pair) {
    var id = pair[0], side = pair[1], el = $(id);
    var ms = side === 1 ? clock.w : clock.b;
    var txt = clock.on ? fmtClock(ms) : "";
    var look = [clock.on, txt, clock.run === side && !over, ms < 20000, ms <= 0].join("|");
    if (look === clockLook[id]) return;
    clockLook[id] = look;
    el.classList.toggle("off", !clock.on);
    if (!clock.on) return;
    el.textContent = txt;
    el.classList.toggle("run", clock.run === side && !over);
    el.classList.toggle("low", ms < 20000);
    el.classList.toggle("flag", ms <= 0);
  });
}

/* ===== names, bars, captured ===== */
function sideName(side) {
  if (mode === "review" && reviewNames) return reviewNames[side === 1 ? 0 : 1];
  if (mode === "coach") return side === humanSide ? "You" : SKILLS[skill].label;
  if (mode === "lan") return side === lanSide ? (lanMy || "You") : lanOpp;
  if (mode === "review" && sharedView) return side === 1 ? sharedView.white : sharedView.black;
  return side === 1 ? "White" : "Black";
}
var GLYPH = { 1: "♙", 2: "♘", 3: "♗", 4: "♖", 5: "♕", 6: "♔" };
var GLYPHB = { 1: "♟", 2: "♞", 3: "♝", 4: "♜", 5: "♛", 6: "♚" };
/* A tag says who is sitting there, how strong they are when that is
   known, and — because a phone has no room for a separate strip —
   whether it is their move, whether they are thinking, and whether
   their king is in check. */
function tagHTML(side) {
  var n = sideName(side), c = side === 1 ? "White" : "Black";
  /* against the computer the colours are plain from the board — yours are
     the near ones — and the room is better spent on the ratings */
  var h = escHtml(n === c || mode === "coach" ? n : n + " · " + c);
  if (mode === "coach") {
    if (side === humanSide) {
      if (Rating.summary(rating).games) h += '<span class="elo">' + ratingText() + "</span>";
      var ttl = unl && unl.equip.title && Unlocks.byId(unl.equip.title);
      if (ttl) h += '<span class="ttl">' + ttl.emoji + " " + escHtml(ttl.name) + "</span>";
    } else h += '<span class="elo">' + SKILLS[skill].elo + "</span>";
  }
  if (G && !over && viewPly < 0 && G.turn === side) {
    if (thinking) h += '<span class="think" aria-label="thinking"><i>·</i><i>·</i><i>·</i></span>';
    else if (Chess.inCheck(G)) h += '<span class="inCheck">check!</span>';
  }
  return h;
}
function syncTagState() {
  var topSide = -orientation, botSide = orientation;
  castPlace();                 /* the coach's face follows its tag when the board turns */
  homeSync();                  /* and a coach game is played on the coach's board */
  moSync(false);               /* and the momentum bar follows the board round */
  unlEmoteSync();              /* and you can send the coach a face, if you have won some */
  $("nameTop").innerHTML = tagHTML(topSide);
  $("nameBot").innerHTML = tagHTML(botSide);
  talentTagSync();            /* and the coach's name opens its card */
  var live = G && !over && viewPly < 0 && mode && mode !== "tour" && mode !== "setup";
  $("nameTop").parentNode.classList.toggle("toMove", !!live && G.turn === topSide);
  $("nameBot").parentNode.classList.toggle("toMove", !!live && G.turn === botSide);
  /* at the table each bar says it to its own player, check and all */
  var chk = !!live && Chess.inCheck(G, G.turn);
  $("nameTop").parentNode.classList.toggle("inCheck", chk && G.turn === topSide);
  $("nameBot").parentNode.classList.toggle("inCheck", chk && G.turn === botSide);
}
function syncBars() {
  var topSide = -orientation, botSide = orientation;
  syncTagState();
  /* captured pieces: what each side has taken, plus the material lead.
     While you're looking back the tally looks back with you — a score
     from a position that isn't on the board would only mislead. */
  var takenByW = [], takenByB = [], diff = 0;
  var upto = G ? (viewPly >= 0 ? viewPly + 1 : G.played.length) : 0;
  if (G) G.played.slice(0, upto).forEach(function (rec) {
    var c = rec.m.capt;
    if (!c) return;
    var k = Math.abs(c);
    diff += (c < 0 ? 1 : -1) * Chess.VAL[k];
    (c < 0 ? takenByW : takenByB).push(k);
  });
  /* a pawn that became a queen is eight pawns of material nobody captured */
  if (G) G.played.slice(0, upto).forEach(function (rec) {
    var pr = rec.m.promo;
    if (pr) diff += (pr > 0 ? 1 : -1) * (Chess.VAL[Math.abs(pr)] - Chess.VAL[Chess.P]);
  });
  var wStr = takenByW.sort().map(function (k) { return GLYPHB[k]; }).join("");
  var bStr = takenByB.sort().map(function (k) { return GLYPH[k]; }).join("");
  var wLead = diff > 0 ? " +" + Math.round(diff / 100) : "";
  var bLead = diff < 0 ? " +" + Math.round(-diff / 100) : "";
  function taken(side) { return side === 1 ? wStr : bStr; }
  function lead(side) { return side === 1 ? wLead : bLead; }
  $("capTop").textContent = taken(topSide) + lead(topSide);
  $("capBot").textContent = taken(botSide) + lead(botSide);
  /* the same tally again in the panel, in board order and at a size you
     can read without leaning in — the bars over the board are a glance,
     this is the one you actually count from */
  matRow(1, topSide, taken(topSide), lead(topSide));
  matRow(2, botSide, taken(botSide), lead(botSide));
  $("matStrip").classList.toggle("hide", !wStr && !bStr);
  syncPanelInfo();
}
function matRow(row, side, taken, lead) {
  $("matDot" + row).className = "dot " + (side === 1 ? "w" : "b");
  $("matWho" + row).textContent = sideName(side);
  $("matTaken" + row).textContent = taken;
  $("matLead" + row).textContent = lead.trim();
}
/* the panel's top block earns its space or gets out of the way, so an
   opening-less game gives the whole panel over to the moves */
function syncPanelInfo() {
  var live = ["openingCard", "matStrip", "viewBanner"].some(function (id) {
    return !$(id).classList.contains("hide");
  });
  $("pInfo").classList.toggle("hide", !live);
}
function showViewBanner(on) {
  $("viewBanner").classList.toggle("hide", !on);
  /* across a table the panel is away: the strip over the board says it */
  document.body.classList.toggle("looking", !!on);
  syncPanelInfo();
}
function syncTurnStrip() {
  var el = $("turnStrip");
  $("resultChip").classList.toggle("hide", !(over && G && (mode === "coach" || mode === "pass" || mode === "lan") &&
    $("ovEnd").classList.contains("hide")));
  if (!G) { el.textContent = "…"; return; }
  syncTagState();
  if (viewPly >= 0) { el.innerHTML = "<b>Looking back</b> — move " + notationMoveNo(viewPly); return; }
  if (mode === "tour" && tourLine) { el.innerHTML = "<b>📖 " + escHtml(tourLine.name) + "</b>"; return; }
  if (mode === "lesson" && lesson) { el.innerHTML = lessonWorked && lessonPaused ? "<b>Watch</b> — then it's yours" : "<b>🎓 " + escHtml(lesson.title) + "</b>"; return; }
  if (mode === "setup") { el.innerHTML = "<b>🧩 Setting up the board</b>"; return; }
  if (over) { el.innerHTML = "<b>" + endShort() + "</b>"; return; }
  var st = Chess.status(G);
  var who = sideName(G.turn);
  if (thinking) el.innerHTML = "<b>" + who + "</b> is thinking…";
  else el.innerHTML = "<b>" + who + (who === "You" ? "r" : "'s") + " move</b>" + (st.reason === "check" ? " — <b style='color:var(--bad)'>check!</b>" : "");
}
function endShort() {
  if (!over) return "";
  if (over.result === "draw") return "Drawn — " + over.reason;
  return (over.result === "white" ? "White" : "Black") + " wins — " + over.reason;
}

/* ===== board sync & input ===== */
function currentViewBoard() {
  if (!G) return new Int8Array(128);
  if (mode === "setup" && setupSt) return Setup.board(setupSt, setupSt.mirrored);
  if (viewPly < 0) return G.board;
  var t = Chess.create(G.startFen);
  for (var i = 0; i <= viewPly && i < G.played.length; i++) Chess.make(t, G.played[i].m);
  return t.board;
}
/* what has been taken so far, in the order it was taken, up to the ply
   being looked at: the row beside the 3D board is drawn from this rather
   than worked out from the position, so a promoted pawn never turns a
   captured queen into a pawn and a lesson's sparse position has no
   phantom row */
function takenSoFar() {
  var out = [];
  if (!G) return out;
  var upTo = viewPly < 0 ? G.played.length : Math.min(G.played.length, viewPly + 1);
  for (var i = 0; i < upTo; i++) { var m = G.played[i].m; if (m.capt) out.push(m.capt); }
  return out;
}
function syncBoard() {
  if (!G || !R) return;
  if (mode === "setup") { setupGlow(); return; }
  if (R.setTaken) R.setTaken(takenSoFar());
  var hi = { selected: sel, legal: [], legalCapt: [], last: null, check: -1 };
  if (viewPly < 0) {
    if (prefs.helpers) legalMoves.forEach(function (m) {
      var isCapt = m.capt || (m.flags & Chess.F_EP);
      (isCapt ? hi.legalCapt : hi.legal).push(m.to);
    });
    var lastRec = G.played[G.played.length - 1];
    if (lastRec) hi.last = [lastRec.m.from, lastRec.m.to];
    /* a mated king keeps its mark: the final position should say how it ended */
    if (Chess.inCheck(G) && (!over || over.reason === "checkmate")) hi.check = G.kings[G.turn === 1 ? 0 : 1];
  } else {
    var rec = G.played[viewPly];
    if (rec) hi.last = [rec.m.from, rec.m.to];
    hi.selected = -1;
  }
  helpMarks(hi);
  syncInk();
  R.setHighlights(hi);
  needFrame();
}
function clearSel() { sel = -1; legalMoves = []; }

/* A piece still landing is not a reason to ignore the next player's
   finger: you may pick a piece up while the last move settles, and the
   move you make waits for it to land. */
function canActNow(evenWhileMoving) {
  if (!G || over || viewPly >= 0 || pendingPromo) return false;
  if (!evenWhileMoving && R.isAnimating && R.isAnimating()) return false;
  if (mode === "pass") return true;
  if (mode === "coach") return G.turn === humanSide && !thinking;
  if (mode === "lan") return G.turn === lanSide && Net.linked();
  if (mode === "lesson") return !!lesson && !lessonDone && !lessonPaused && G.turn === lesson.side;
  return false; /* tour or menu */
}

function whenLanded(fn) {
  if (R.isAnimating && R.isAnimating()) { setTimeout(function () { whenLanded(fn); }, 40); return; }
  fn();
}
function tapSquare(sq) {
  if (!G) return;
  if (mode === "setup") { setupTap(sq); return; }
  if (viewPly >= 0) { exitView(); return; }
  if (sel < 0 && !G.board[sq] && clearInkHere()) return;
  if (!canActNow(true)) { clearSel(); syncBoard(); return; }
  if (R.isAnimating && R.isAnimating() && sel >= 0) {
    /* the second tap of a move made while the last one is landing */
    var at = gameTicket, n = G.played.length;
    whenLanded(function () { if (gameTicket === at && G.played.length === n && canActNow()) tapSquare(sq); });
    return;
  }
  var p = G.board[sq];
  if (sel >= 0) {
    var mv = null;
    for (var i = 0; i < legalMoves.length; i++) if (legalMoves[i].to === sq) { mv = legalMoves[i]; break; }
    /* king, then its own rook: what most people mean by "castle" */
    if (!mv && p && Math.abs(G.board[sel]) === Chess.K && p === Chess.R * G.turn) {
      for (i = 0; i < legalMoves.length; i++) {
        var c = legalMoves[i];
        if ((c.flags & Chess.F_CASTLE) && ((c.to > c.from) === (sq > sel))) { mv = c; break; }
      }
    }
    if (mv) {
      if (mv.promo && !(mv = aqChoose(sel, sq))) return;   /* the picker, or a queen at once */
      clearSel();
      if (mode === "lesson") { lessonAttempt(mv); return; }
      commitMove(mv, "local");
      return;
    }
    if (sq === sel) { clearSel(); syncBoard(); sndPickUp(G.board[sq]); return; }
  }
  if (p && (p > 0 ? 1 : -1) === G.turn) {
    sel = sq;
    legalMoves = Chess.movesFrom(G, sq);
    if (!legalMoves.length) {
      var why = Chess.inCheck(G) ? "That piece can't help right now — your king is in check and needs the rescue first." :
        "That piece has nowhere legal to go just now — it may be blocked, or pinned to your king.";
      toast(why);
    }
    sndPickUp(p);
  } else {
    clearSel();
  }
  syncBoard();
}

function askPromotion(from, to, why) {
  pendingPromo = { from: from, to: to };
  $("aqWhy").textContent = why || "";
  $("aqWhy").classList.toggle("hide", !why);
  var row = $("promoRow");
  row.innerHTML = "";
  var glyphs = G.turn === 1 ? GLYPH : GLYPHB;
  [Chess.Q, Chess.N, Chess.R, Chess.B].forEach(function (kind) {
    var b = document.createElement("button");
    b.textContent = glyphs[kind];
    b.addEventListener("click", function () {
      $("ovPromo").classList.add("hide");
      var want = kind * G.turn, mvv = null;
      for (var i = 0; i < legalMoves.length; i++) {
        if (legalMoves[i].to === to && legalMoves[i].promo === want) { mvv = legalMoves[i]; break; }
      }
      pendingPromo = null;
      clearSel();
      if (mvv) { if (mode === "lesson") lessonAttempt(mvv); else commitMove(mvv, "local"); }
    });
    b.setAttribute("aria-label", { 5: "Queen", 2: "Knight", 4: "Rook", 3: "Bishop" }[kind]);
    b.title = b.getAttribute("aria-label");
    row.appendChild(b);
  });
  $("ovPromo").classList.remove("hide");
}
/* a misclick onto the last rank can be taken back before it is a move */
function cancelPromo() {
  if (!pendingPromo) return;
  var from = pendingPromo.from;
  closePromo();
  sel = from; legalMoves = Chess.movesFrom(G, from);
  syncBoard();
}

/* ===== the one move pipeline ===== */
function animDescriptor(m) {
  var d = { from: m.from, to: m.to, piece: m.piece, promo: m.promo, capt: m.capt };
  if (m.flags & Chess.F_CASTLE) {
    if (m.to > m.from) { d.rookFrom = m.from + 3; d.rookTo = m.from + 1; }
    else { d.rookFrom = m.from - 4; d.rookTo = m.from - 1; }
  }
  if (m.flags & Chess.F_EP) d.epSq = m.to - 16 * (m.piece > 0 ? 1 : -1);
  return d;
}

function commitMove(m, source, animOpts) {
  if (!G || over) return;
  if (source === "local") paceTurnEnd(true);
  brainTicket++;   /* any search still running is now answering the wrong question */
  var mover = G.turn;
  /* the position as it stood before the move: the review happens on a
     scratch board built from this, so looking at what you could have
     played can never disturb the game you are playing */
  var fenBefore = Chess.fen(G);
  /* look at the move while the position is still the "before" one */
  var lessons = (prefs.coach && mode !== "tour") ? Teach.afterMove(G, m) : [];
  /* what the move shows, for the coach's signature trick */
  var persL = mode === "coach" ? (prefs.coach ? lessons : Teach.afterMove(G, m)) : null;
  featMove(m, mover, source, lessons);
  var desc = animDescriptor(m);
  var san = Chess.play(G, m);
  var ply = G.played.length - 1;

  /* clock presses the button as the piece lands */
  afterMoveClock(mover);

  /* net: tell the other chair */
  if (mode === "lan" && source === "local") {
    Net.send({ t: "mv", n: ply, from: m.from, to: m.to, promo: m.promo || 0,
               wMs: Math.round(clock.w), bMs: Math.round(clock.b) });
  }

  var st = Chess.status(G);
  accAfterMove(m, san, st);
  castAfterMove(m, st);
  if (persL) persAfterMove(m, persL);
  moAfterMove(m);
  /* the music closes in a little while a king is in check */
  if (typeof Stage !== "undefined" && !st.over) Stage.mood(st.reason === "check" ? "tense" : "calm");

  /* what was taken, so it can be heard being knocked over in its own
     voice rather than as a generic thump */
  var took = m.capt || ((m.flags & Chess.F_EP) ? (m.piece > 0 ? -1 : 1) : 0);
  var hurtKing = (st.reason === "check" || st.reason === "checkmate") ? G.kings[G.turn === 1 ? 0 : 1] : -1;
  var landTicket = gameTicket;
  var plan = R.animateMove(desc, G.board, animOpts || {}, function () {
    /* the mate waits for the mating move to land, so the king does not
       start to fall under a piece still in the air */
    if (landTicket === gameTicket && st.reason === "checkmate") fxMate(hurtKing, desc.to, mateMood(st.result));
    /* two people sharing one screen: the board turns to whoever is next,
       once the piece has landed rather than under it */
    if (mode === "pass" && prefs.autoFlip && !over && orientation !== G.turn) {
      orientation = G.turn; R.setOrientation(orientation); syncBars(); syncClocks();
    }
    syncBoard();
    syncButtons();     /* the hint's price depends on whose move it now is */
    /* giving check rises; being in check falls — the same two notes
       never mean both */
    if (!over && st.reason === "check" && landTicket === gameTicket) {
      var mine = mode === "coach" ? humanSide : mode === "lan" ? lanSide :
                 (mode === "lesson" && lesson) ? lesson.side : G.turn;
      snd("check", { against: G.turn === mine });
      fxCheck(hurtKing);
    }
  });
  sndMove(desc, plan, took);
  hapMove(desc, plan, took);
  fxCapture(desc, took, plan);
  unlMove(desc, plan, took);
  feelLand(desc, took, plan);
  fxPromote(desc, plan);
  syncInk();         /* what you drew belongs to the position just left */
  needFrame();
  syncMoveList();
  syncBars();
  syncTurnStrip();
  narrateOpening(san, source);
  helpAfterMove(ply, source);

  if (st.over) {
    endGame(st.result, st.reason, lessons.length ? lessons[0] : null);
    saveGame();
    return;
  }
  /* friendly automatic draw calls (both devices reach the same conclusion) */
  if (st.canClaim3) { endGame("draw", "the same position appeared three times"); saveGame(); return; }
  if (G.half >= 100) { endGame("draw", "fifty moves passed with no capture or pawn move"); saveGame(); return; }

  saveGame();
  syncButtons();

  clearLines();
  /* Everything said about this move later is said about *this* move:
     the coach will usually have replied by the time a review comes back,
     so the ply and the game are fixed now, and a remark that arrives
     after a take-back or a new game is simply dropped. */
  var myTicket = gameTicket;
  /* name what just happened, while it's still on screen */
  if (lessons.length) setTimeout(function () {
    if (myTicket === gameTicket && G && G.played.length > ply) teachMoment(lessons, mover, source, ply);
  }, 520);
  /* and give the player who's behind a free word before their turn */
  setTimeout(function () { if (myTicket === gameTicket && G && G.played.length === ply + 1) oddsNudge(); }, 1500);
  /* when a king is nearly caged, show the cage: it explains mate better
     than any sentence can */
  if (st.reason === "check") setTimeout(function () {
    if (!over && myTicket === gameTicket && G && G.played.length === ply + 1) showMateNet(G.turn);
  }, 700);

  /* the gentle coach looks over the human's shoulder */
  if (source === "local" && prefs.coach && !clock.on && (mode === "coach" || (mode === "pass" && !tableFacing()))) {
    setTimeout(function () { gentleCheck(fenBefore, m, san, ply, myTicket); }, 1400);
  }
  /* the coach takes its turn */
  if (mode === "coach" && !over && G.turn !== humanSide) {
    scheduleCoach();
  }
  /* and when it has, yours begins */
  if (mode === "coach" && !over && G.turn === humanSide && source !== "local") paceTurnStart();
}

/* ===== the practice opponent ===== */
function scheduleCoach() {
  var askedAt = Date.now(), dial = paceDial();
  thinking = true;
  castThinking(true);
  syncTurnStrip(); syncButtons();
  clearTimeout(coachTimer);
  coachTimer = setTimeout(function () {
    if (!G || over || mode !== "coach" || G.turn === humanSide) { thinking = false; syncTurnStrip(); syncBoard(); return; }
    var ticket = ++brainTicket;
    var answer = function (res) {
      /* the board may have moved on while it was thinking — a take-back,
         a new game, a resign. The ticket says whether this answer is
         still the answer to the question that was asked; an old answer
         says nothing at all, not even "I've stopped thinking", because a
         newer question may be being thought about right now. */
      if (ticket !== brainTicket) return;
      /* a thought nobody needs any more: the board is yours again, and
         what waits on "not thinking" (the training wheels) gets its turn */
      if (!G || over || mode !== "coach" || G.turn === humanSide) { thinking = false; syncTurnStrip(); syncBoard(); return; }
      /* you are in the menu: its move waits for you, so you see it land */
      if (clockPaused()) { setTimeout(function () { answer(res); }, 250); return; }
      /* and at your pace: someone taking their time sees the coach take a
         breath before it answers; someone quick is not kept waiting */
      var hold = REDUCED ? 0 : dial.reply - (Date.now() - askedAt);
      if (hold > 30) { setTimeout(function () { answer(res); }, hold); return; }
      thinking = false;
      castThinking(false);
      /* what the coach thinks of the position, from your side: the
         abandonment rule asks whether you were clearly losing */
      if (res && typeof res.score === "number") { lastEval = -res.score; trackLow(); }
      var m = res && res.move && Brain.resolve(G, res.move);
      /* a worker that died mid-thought must not leave the coach staring
         at the board: think again, briefly, here */
      if (!m) {
        try { var r2 = Chess.search(G, { ms: 120, maxDepth: 3 }); m = r2 && r2.move; } catch (e) { m = null; }
        if (!m) m = Chess.moves(G)[0] || null;
      }
      if (m) rememberCoachPlan(res, m);
      if (m) commitMove(m, "coach");
      syncTurnStrip(); syncButtons();
    };
    /* exactly the settings the rung was measured with — node budget and
       all — or its rating would be a rating of some other opponent */
    Brain.search(G, persSearchOpts()).then(answer, function () { answer(null); });
  }, REDUCED ? 60 : dial.reply <= 200 ? 100 : 420);
}

/* ===== the gentle coach (the quiet word) =====
   The old version asked "is the opponent's best reply good for them?",
   which flags every move made in a bad position and stays silent when
   you throw away a winning one. The question that actually teaches is
   "how much worse was that than the best you had?" — so the review runs
   on the position *before* the move, scores the move you played and the
   move the engine wanted with the same yardstick, and subtracts.

   That difference has a name chess players already use, and using their
   words means the feedback transfers to every book and every board you
   ever sit at afterwards. */
/* Roughly where club players draw these lines: half a pawn is a slip,
   a pawn is a mistake, two and a half is the kind of thing you want to
   be told about. */
var LOSS_STEPS = [
  { at: 250, word: "a blunder", tone: "🫤", mark: "??" },
  { at: 110, word: "a mistake", tone: "🤔", mark: "?" },
  { at: 50,  word: "an inaccuracy", tone: "💭", mark: "?!" }
];
function pawnsWorth(cp) {
  if (cp >= 900) return "about a queen's worth";
  var p = cp / 100;
  if (p < 1.2) return "about a pawn";
  return "about " + (p < 3 ? p.toFixed(1) : Math.round(p)) + " pawns";
}
function gentleCheck(fenBefore, played, san, ply, ticket) {
  if (!G || over || ticket !== gameTicket || G.played.length <= ply) return;
  var pre;
  try { pre = Chess.create(fenBefore); } catch (e) { return; }
  var mine = null, list = Chess.moves(pre), i;
  for (i = 0; i < list.length; i++) {
    if (list[i].from === played.from && list[i].to === played.to &&
        (list[i].promo || 0) === (played.promo || 0)) { mine = list[i]; break; }
  }
  if (!mine) return;
  /* one call, both sides of the comparison measured the same way */
  Brain.review(pre, mine, { ms: 900, mark: true, maxDepth: Rating.REVIEW_DEPTH, depth: Rating.REVIEW_DEPTH }).then(function (res) {
    if (ticket !== gameTicket || !G) return;
    if (!res) return;
    reviewMemo[ply] = reviewEntry(pre, mine, res);
    saveGame();     /* the squares it named survive a reload from now, not from the next move */
    showReview(pre, san, res, mine, ply);
  });
}
/* Praise has to mean something or it means nothing, and a coach that
   calls a forced recapture brilliant teaches a beginner to mistake
   obligation for insight — and loses a strong player's attention on the
   first move it says it about.

   So: not while you were in check (getting out of it is not a choice),
   not taking back on the square they just took on, not when there was
   barely anything else legal, and not in the opening, where the good
   move is usually something somebody told you rather than something you
   found. What is left is a move that was genuinely there to be missed. */
function worthPraising(pre, played, ply) {
  if (!pre || !played) return false;
  if (ply < 12) return false;                       /* the first six moves each */
  if (Chess.inCheck(pre)) return false;
  if (Chess.moves(pre).length <= 3) return false;
  if (ply >= 1 && G.played[ply - 1] && G.played[ply - 1].m &&
      G.played[ply - 1].m.to === played.to) return false;   /* a recapture */
  return true;
}
function showReview(pre, san, res, played, ply) {
  var i;
  var bestScore = res.bestScore, mineScore = res.playedScore, loss = res.loss;

  /* Say nothing when the game was already decided either way: a person
     three pieces down does not need to hear about a fourth, and a person
     three pieces up does not need to hear about a rounding error. */
  if (bestScore < -650 || mineScore > 650) return;

  var side = notationSideOf(ply);
  var better = res.bestSAN;

  var step = null;
  for (i = 0; i < LOSS_STEPS.length; i++) if (loss >= LOSS_STEPS[i].at) { step = LOSS_STEPS[i]; break; }

  if (!step) {
    /* Nothing went wrong — which is most moves, and most moves deserve
       no remark at all. But a move that was not merely fine and instead
       was the one move that held the position together is worth saying
       so, and saying so to the person who found it rather than only
       ever to the person who did not. `only` is how far clear of the
       next-best move it stood, measured the same way the loss is. */
    if (loss <= 0 && res.only != null && res.only >= 150 && worthPraising(pre, played, ply)) {
      var brilliant = res.only >= 320;
      noteMove({
        ply: ply, side: side, mark: brilliant ? "!!" : "!", icon: brilliant ? "\u2728" : "\u2714",
        tone: "good", cp: mineScore, viewPly: ply > 0 ? ply - 1 : null, squares: [played.from, played.to],
        text: "<b>" + san + "</b> was the move \u2014 and the only one that really worked. " +
              "Everything else here was worth " + pawnsWorth(res.only) + " less. " +
              (brilliant ? "That is the kind of move people remember." : "Well spotted."),
        brief: "only move \u00b7 " + pawnsWorth(res.only) + " clear of " + (res.altSAN || "the rest")
      });
    }
    return;
  }

  /* an inaccuracy is not worth interrupting for unless it actually
     changed who stands better */
  if (step.at < 110 && !(mineScore < 40 && bestScore > 90)) return;

  /* what they'll be hit with comes first, because that is the thing
     worth spotting next time; the better move comes second */
  var punish = res.refute ? " <b>" + res.refute.san + "</b> is the problem." : "";
  var instead = " <b>" + better + "</b> was the move" +
    (res.pv && res.pv.length > 1 ? ", and after it " + res.pv.slice(1, 3).join(" ") + "." : ".");
  var cost = " <i>(" + pawnsWorth(loss) + ")</i>";

  noteMove({
    ply: ply, side: side, mark: step.mark, icon: step.tone,
    tone: loss >= 250 ? "bad" : "warn", cp: mineScore,
    viewPly: ply > 0 ? ply - 1 : null, squares: res.best ? [res.best.from, res.best.to] : null,
    text: "<b>" + san + "</b> was " + step.word + "." + punish + instead + cost +
          " No shame \u2014 this is how everyone learns.",
    brief: step.mark + " " + (res.refute ? res.refute.san + "! \u00b7 " : "") + better +
           " was better by " + (loss / 100).toFixed(1)
  });

  /* The interruption is reserved for the one case where stopping is
     worth more than reading later: a blunder you can still take back,
     said while the position is still on the board. Everything quieter
     than that is in the notebook, where it can be read twice. */
  /* …and only while it can still be taken back cleanly: once the game has
     moved two plies past it, the offer would undo more than the blunder */
  if (loss >= 250 && voice() === "plain" && !over && G.played.length - ply <= 2) {
    toast(step.tone + " <b>" + san + "</b> was " + step.word + "." + punish + instead + cost + helpTipLine("undo"),
      [{ label: "\u21a9 Take it back", fn: function () { gentleUndo(ply); } },
       { label: "\ud83d\udc40 Show me", fn: function () { showMeReview(ply); }, ghost: true },
       { label: "Play on", fn: function () {}, ghost: true }].concat(wheelsOfferAction()), 11000);
    /* the problem, drawn while the words are on the screen — but only on
       the position it is true of: the one right after your move */
    drawRefutation(ply, 11000);
  }
}
/* every remark about a move goes through here, so the mark on the move
   list and the entry in the notebook can never disagree */
function noteMove(e) { note(e); }
/* rewind to just before the move that was judged — whatever has been
   played since, and whoever played it */
function gentleUndo(ply) {
  if (!G || over || (mode !== "coach" && mode !== "pass")) return;
  if (viewPly >= 0) exitView();
  var n = G.played.length - ply;
  if (n < 1 || n > 2) return;
  if (mode === "coach") assist.takebacks++;
  undoPly(n);
}

/* ===== hints ===== */
/* A hint is paid for when it arrives, not when it is asked for — a move
   made while it was being worked out would otherwise pay for nothing —
   and asking twice in the same position shows the same hint again for
   free. */
var hintPending = false, hintShown = null;
/* the lamp's third chip (and the whole of 💡 in the notation voice) —
   the lamp itself is giveHint(), in the help block below */
function giveMoveHint() {
  if (mode === "lesson") { if (lesson && !lessonDone && !lessonPaused) giveLessonHint(); return; }
  if (!G || over) { return; }
  if (!canActNow()) { toast(mode === "lan" && G.turn !== lanSide ? "It's your opponent's move — the hint lamp lights on your turn." : "Hints come on your turn."); return; }
  if (hintPending) return;
  var here = gameTicket + ":" + G.played.length;
  if (hintShown && hintShown.at === here) { hintShown.show(); return; }
  var odds = oddsFor(G.turn);
  /* can they afford it? asked now, paid later */
  if (!odds.free && clock.on && (G.turn === 1 ? clock.w : clock.b) < (odds.cost + 5) * 1000) {
    toast("Not enough clock left to buy that — but it's free again the moment you're behind.");
    return;
  }
  hintPending = true; syncButtons();
  var sans = G.played.map(function (r) { return r.san.replace(/[+#]$/, ""); });
  var book = G.startFen ? [] : Book.suggest(sans);
  /* rank: the book-agreement test below compares real scores, so the
     ranked list has to be real too. It used to be a one-ply glance,
     which meant "the engine doesn't mind this book move" was a coin
     toss — and a hint you can't trust is worse than no hint. */
  var ticket = brainTicket;
  var done = function () { hintPending = false; syncButtons(); };
  Brain.search(G, { ms: 800, rank: true, rankDepth: 6 }).then(function (raw) {
    done();
    if (ticket !== brainTicket || !G || over || !canActNow()) return;
    if (!raw || !raw.move) return;
    if (!oddsPay(G.turn)) return;
    if (mode === "coach") { assist.hints++; saveGame(); }
    showHint(raw, odds, book, sans);
    hintShown = { at: here, show: function () { showHint(raw, { free: true, cost: 0, mood: odds.mood }, book, sans, true); } };
  }, done);
}
function showHint(raw, odds, book, sans, again) {
  var res = { move: Brain.resolve(G, raw.move), score: raw.score, pv: raw.pv,
              ranked: raw.ranked.map(function (x) {
                return { move: Brain.resolve(G, x.move), score: x.score, shallow: x.shallow };
              }).filter(function (x) { return !!x.move; }) };
  if (!res.move) return;
  var topScore = res.ranked.length ? res.ranked[0].score : res.score;
  var chosen = res.move, why = null, bookPick = null;
  for (var i = 0; i < book.length; i++) {
    var bm = Chess.fromSAN(G, book[i].san);
    if (!bm) continue;
    /* prefer the book move when the engine doesn't strongly disagree */
    for (var j = 0; j < res.ranked.length; j++) {
      var r = res.ranked[j];
      if (r.move.from === bm.from && r.move.to === bm.to && topScore - r.score < 70) {
        bookPick = { m: bm, entry: book[i] };
      }
    }
    if (bookPick) break;
  }
  if (bookPick) { chosen = bookPick.m; why = bookPick.entry.why || ("a main road of the " + bookPick.entry.name + "."); }
  /* no curated line? the full ECO table may still know a named path */
  if (!bookPick && typeof Eco !== "undefined" && !G.startFen) {
    var ecoNext = Eco.next(sans);
    for (var e1 = 0; e1 < ecoNext.length && !bookPick; e1++) {
      var em = Chess.fromSAN(G, ecoNext[e1].san);
      if (!em) continue;
      for (var e2 = 0; e2 < res.ranked.length; e2++) {
        var er = res.ranked[e2];
        if (er.move.from === em.from && er.move.to === em.to && topScore - er.score < 70) {
          chosen = em;
          why = "a known road — this is the " + ecoNext[e1].name + ".";
          bookPick = { m: em };
          break;
        }
      }
    }
  }
  var san = Chess.toSAN(G, chosen);
  /* the line *is* the hint: one curve that shows where the idea goes */
  showLines([{ from: chosen.from, to: chosen.to, kind: "run", tone: "hint",
               knight: Math.abs(chosen.piece) === Chess.N }], 9000, "main");
  syncBoard();
  snd("hint");
  var paid = again ? " <i>(the same hint — no charge twice)</i>" : odds.free ? (odds.mood === "behind" ? " <i>(free — you're behind)</i>" : "") :
    " <i>(" + (clock.on ? odds.cost + " seconds" : odds.cost + " mark" + (odds.cost > 1 ? "s" : "")) +
    (odds.mood === "ahead" ? " — you're ahead" : " — it's level") + ")</i>";
  if (mode === "coach" && !again) paid += " <i>A hint makes this game count for a little less.</i>";
  /* the line the engine is actually counting on, when the hint is the
     engine's own move: seeing the next two plies is most of what turns a
     hint into a lesson */
  var ahead = "";
  if (!bookPick && res.pv && res.pv.length > 2 && res.pv[0] === san) {
    ahead = " Then likely " + res.pv.slice(1, 3).join(" ") + ".";
  }
  var pvMoves = !bookPick && res.pv && res.pv[0] === san ? pvLine(res.pv) : [];
  /* the reason a hint gives is the concrete one when there is one — what
     the move attacks, wins, forks or threatens — and a principle only
     when nothing concrete applies */
  var told = why;
  if (!told && res && chosen === res.move && Math.abs(res.score) > Chess.MATE - 200) told = explainMove(chosen, res);
  if (!told && Teach.explainMove) {
    try { var ex = Teach.explainMove(G, chosen); if (ex && ex.text) told = ex.text.charAt(0).toLowerCase() + ex.text.slice(1); } catch (e) {}
  }
  /* nothing the teacher can prove: say so, rather than dressing a
     principle up as a reason */
  if (!told) told = "the engine's choice here — a quiet move with no tactic the teacher can prove yet. Ask what it prepares.";
  /* the words "then likely…" can be drawn, a ply at a time, when asked */
  toast("💡 <b>" + san + "</b> — " + told + ahead + paid,
        pvMoves.length > 1 ? [{ label: "Show the line", fn: function () { showPV(pvMoves); } },
                              { label: "OK", fn: function () {}, ghost: true }] : null, 9000, true);
}

/* the one reason the engine can vouch for that the teacher cannot see:
   a forced mate in its own line. Everything else about a hinted move
   comes from Teach.explainMove, which says nothing it has not proved —
   the old rule-of-thumb reasons ("rooks love open files") are gone. */
function explainMove(m, res) {
  if (res && Math.abs(res.score) > Chess.MATE - 200) {
    var n = Math.ceil((Chess.MATE - Math.abs(res.score)) / 2);
    return "it forces checkmate in " + n + "! Follow the checks.";
  }
  return null;
}
function pieceName(p) {
  return ["", "pawn", "knight", "bishop", "rook", "queen", "king"][Math.abs(p)];
}

/* ===================== help & teaching (help.js) =====================
   Three things live here, and only here, so the rest of the room calls
   them from one line each:

   The help lamp. 💡 used to sell one thing, a move. A coach across a
   table asks "what does that threaten?" far more often than they name a
   move, so the lamp now offers three: Think (the questions a coach
   asks, built from this position — free), Their idea (what their last
   move did, in true words, with its line on the board — free), and A
   move (the hint that was always there, at the price it always had).
   Every move the coach plays also leaves a quiet "why" in the notebook
   when there is something true to say, and tapping the last move in the
   list asks the same question of it; the view banner asks it of any
   move in the game. Nothing here is charged unless the priced chip is
   pressed, and nothing is said that teach.js has not proved — when the
   honest answer would hand over a threat the person has not paid for,
   it becomes a question instead (help.js says how).

   The first five minutes. A newcomer used to meet "Not rated yet" and
   twelve tiles. Now the lobby asks one question — do you know how the
   pieces move? — and the first games carry four pointers, each said
   once, at the moment it helps. The welcome goes away when its job is
   done (a finished game against the computer), never on a timer.

   Training wheels. Opt-in stabilisers for the first games: at the start
   of your turn, your pieces that can really be won breathe and the
   attacker's line is drawn; a lifted piece marks the squares where it
   would be lost instead of dotting them. Never with a clock, never
   against a friend on another device, counted honestly (a rated game
   played with them counts as 75%), and offered off again the first
   game they were not needed. */

/* the parts of the preferences this block owns: read and checked here,
   so a hand-edited store cannot name a tip nobody gives */
var TIP_IDS = ["notes", "price", "undo", "why", "wheels", "move", "reply"];
(function () {
  var p = {};
  try { p = JSON.parse(lsGet(PREF_KEY) || "{}") || {}; } catch (e) { p = {}; }
  prefs.welcomed = p.welcomed === true;
  prefs.wheels = p.wheels === true;
  prefs.wheelsOffered = p.wheelsOffered === true;
  prefs.wheelsOffOffered = p.wheelsOffOffered === true;
  prefs.tips = {};
  if (p.tips && typeof p.tips === "object") TIP_IDS.forEach(function (k) { if (p.tips[k]) prefs.tips[k] = 1; });
})();

/* ---- the pointers: four, each once, each tied to the moment ---- */
var TIPS = {
  notes: "📓 The coach keeps what it notices in <b>Notes</b> — tap one to go back to that moment.",
  price: "💡 Help costs a mark when you're ahead, and is free when you're behind.",
  why: "❓ Tap the coach's move in the list to ask why it played that.",
  wheels: "🛟 Training wheels are on for your first games — they show what's in danger. Take them off in Settings whenever you like."
};
var tipQueued = {};
/* said once, ever: written down before it is shown, and only when it
   really is shown — a question waiting for an answer is never covered */
function coachmark(id, html, el) {
  if (prefs.tips[id]) return false;
  var t = $("toast");
  if (t.classList.contains("show") && t.classList.contains("acts")) return false;
  prefs.tips[id] = 1; savePrefs();
  toast(html, null, 8000);
  if (FX && el) { try { Fx.sparkle(el, { count: 12 }); } catch (e) {} }
  return true;
}
/* A pointer waits for the toast to be free rather than talking over the
   remark that triggered it, and gives up quietly if the game moves on.
   The four belong to the first two games against the computer; the
   wheels' own word is said whenever they first show. */
function helpTip(id, elFn) {
  if (!TIPS[id] || prefs.tips[id] || tipQueued[id]) return;
  if (id !== "wheels" && (mode !== "coach" || Rating.summary(rating).games >= 2)) return;
  tipQueued[id] = true;
  var at = gameTicket, tries = 0;
  /* never in the same breath as the thing that prompted it: whatever
     that thing says first gets said first */
  setTimeout(function later() {
    if (at !== gameTicket || prefs.tips[id]) { tipQueued[id] = false; return; }
    if ($("toast").classList.contains("show") && tries++ < 8) { setTimeout(later, 1500); return; }
    coachmark(id, TIPS[id], elFn ? elFn() : null);
    tipQueued[id] = false;
  }, 700);
}
/* the take-back pointer rides inside the blunder toast it is about,
   because a remark could not replace a toast with buttons on it */
function helpTipLine(id) {
  if (id !== "undo" || prefs.tips.undo || mode !== "coach") return "";
  prefs.tips.undo = 1; savePrefs();
  return "<small class='lampLine'>A take-back makes the game count for a little less — the number stays honest.</small>";
}

/* ---- the welcome ---- */
function isNewcomer() {
  if (prefs.welcomed) return false;
  if (Rating.summary(rating).games) return false;
  try { if (Learn.stats(Learn.load()).solved) return false; } catch (e) {}
  return !loadSave();
}
function syncWelcome() {
  var fresh = isNewcomer();
  $("mWelcome").classList.toggle("hide", !fresh);
  $("mRating").classList.toggle("hide", fresh);
}
function welcomeNew() {
  /* the gentlest start: the rules, then the gentlest coach — with the
     wheels on, said once when they first show */
  if (!prefs.wheels && !prefs.wheelsOffered) { prefs.wheels = true; prefs.wheelsOffered = true; savePrefs(); }
  /* and a gentle pace, until the room has seen how you play */
  if (pace && !pace.newDoor) { pace.newDoor = 1; paceSave(); }
  /* the very first lesson: which piece is which, and where it lives */
  startSetup({ then: "rules" });
}
function welcomeKnow() { quickPlay(nextLevel()); }

/* ---- the coach's plan, kept for the "why" ----
   The search that chose the coach's move also knew what it expected
   next. It was thrown away; now it is kept in memory for this game, so
   "why did it play that?" can say what it was counting on. A reload
   forgets it, and the why simply leaves that clause out. */
var coachMemo = {}, coachMemoGame = null;
function rememberCoachPlan(res, m) {
  if (!G || !res || !res.pv || !res.pv.length) return;
  if (coachMemoGame !== G) { coachMemo = {}; coachMemoGame = G; }
  var san = Chess.toSAN(G, m).replace(/[+#]$/, "");
  if (String(res.pv[0]).replace(/[+#]$/, "") !== san) return;
  coachMemo[G.played.length] = { fen: Chess.fen(G), pv: res.pv.slice(0, 8), score: res.score, depth: res.depth };
}
function coachPlanFor(ply, pre) {
  if (coachMemoGame !== G || !coachMemo[ply]) return null;
  return coachMemo[ply].fen === Chess.fen(pre) ? coachMemo[ply] : null;
}

/* ---- the lamp ---- */
function lampLabel() {
  var l = oddsLabel(G.turn);
  return "💡 A move " + (l === "free" ? "· free" : l);
}
function giveHint() {
  if (mode === "setup") { setupHint(); return; }
  if (mode === "lesson" || !G || over || !canActNow() || hintPending) { giveMoveHint(); return; }
  /* notation voice: the person who asked for one line per remark wants
     the move, not a menu */
  if (voice() === "brief") { giveMoveHint(); return; }
  toast("<span class='lampLine'>Think it through, see what they're up to — or buy the move.</span>",
    [{ label: "🧭 Think", fn: thinkPrompt },
     { label: "👁 Their idea", fn: theirIdea },
     { label: lampLabel(), fn: giveMoveHint, ghost: true }], 12000);
  $("toast").classList.add("lamp");
  hap("select");
}
/* whose eyes the lamp is for: the person whose turn it is on this
   screen (both people, in pass and play) */
function lampSide() { return mode === "pass" ? G.turn : mySide(); }
/* behind, or the game is over, or this is not a live game: nothing is
   being sold, so nothing is held back */
function lampReveal(side) {
  if (!G || over || (mode !== "coach" && mode !== "pass" && mode !== "lan")) return true;
  return oddsFor(side).mood === "behind";
}
function thinkPrompt() {
  if (!G || over || !canActNow()) return;
  var side = lampSide(), last = G.played[G.played.length - 1];
  var lastMine = last && notationSideOf(G.played.length - 1) === side;
  var t;
  try { t = Help.think(G, side, { reveal: lampReveal(side), last: last && !lastMine ? { san: last.san } : null }); }
  catch (e) { return; }
  if (!t.lines.length) return;
  snd("hint"); hap("select");
  toast("🧭 " + t.lines.join("<br>"), null, 11000);
  note({ ply: G.played.length ? G.played.length - 1 : null, head: G.played.length ? null : "before the first move",
         icon: "🧭", tone: "note", key: "think", text: t.lines.join(" "),
         brief: "think: checks, captures, threats" });
}
function theirIdea() {
  if (!G || !G.played.length) { toast("Nothing has been played yet — the first idea is yours."); return; }
  var side = lampSide(), ply = G.played.length - 1;
  /* in pass and play the last move may be your own: then ask about the
     one before it, which is theirs */
  if (notationSideOf(ply) === side && ply > 0) ply--;
  if (notationSideOf(ply) === side) { toast("Nothing of theirs has been played yet — the first idea is yours."); return; }
  showWhy(ply);
}
/* The words for one move of this game, from the chair of the person
   asking. `pre` is rebuilt by playing the game forward, not from a FEN,
   so a recapture is still known to be one. */
function explainPly(ply) {
  if (!G || ply < 0 || ply >= G.played.length) return null;
  var pre = Chess.create(G.startFen), i;
  for (i = 0; i < ply; i++) Chess.make(pre, G.played[i].m);
  var want = G.played[ply].m, list = Chess.moves(pre), m = null;
  for (i = 0; i < list.length; i++) {
    if (list[i].from === want.from && list[i].to === want.to && (list[i].promo || 0) === (want.promo || 0)) { m = list[i]; break; }
  }
  if (!m) return null;
  var side = lampSide(), reveal = lampReveal(side);
  var sans = G.played.slice(0, ply + 1).map(function (r) { return r.san.replace(/[+#]$/, ""); });
  var memo = coachPlanFor(ply, pre);
  /* what the coach was counting on includes its guess at your best
     reply — which, while that reply is still yours to find, is a hint
     nobody paid for. It is told once the move has been answered. */
  var plan = memo && (reveal || ply !== G.played.length - 1) ? memo.pv : null;
  var r = Help.theirs(pre, m, side, { reveal: reveal, reason: Book.reason && !G.startFen ? Book.reason(sans) : null, plan: plan,
                                       hush: reveal ? {} : Help.hushFor(G, side) });
  r.ply = ply;
  r.mover = notationSideOf(ply);
  r.side = side;
  return r;
}
function showWhy(ply) {
  var r = null;
  try { r = explainPly(ply); } catch (e) { r = null; }
  if (!r) return;
  snd("hint"); hap("select");
  var price = r.asked && !over ? " <i>(" + lampLabel() + " shows the answer.)</i>" : "";
  toast("❓ " + r.text + price, null, 9000);
  showLines([{ from: r.line.from, to: r.line.to, kind: r.line.kind, tone: r.line.kind === "threat" ? "threat" : "plan",
               knight: !!r.line.knight }], 6000, "help");
  if (r.mate && ply === G.played.length - 1 && !over) showMateNet(r.side);
  whyNote(r);
}
function whyNote(r) {
  note({ ply: r.ply, side: r.mover, icon: r.mate ? "⚠️" : "❓", tone: r.mate ? "warn" : "note", key: "theirs",
         squares: [r.line.from, r.line.to], text: r.text,
         brief: G.played[r.ply].san + " · " + (r.mate ? "threatens " + r.mateSan : r.concept ? conceptLabel(r.concept) : "book") });
}
/* After a move from across the table — the coach, or the other device
   — one quiet line in the notebook, but only when there is something
   true to say: a quiet move is left for the lamp, and a fact that would
   hand over a threat for free is not written at all. Pass and play has
   the teacher speaking for both sides already. */
function helpAfterMove(ply, source) {
  if (source !== "coach" && source !== "net") return;
  if (voice() === "off" || mode === "pass") return;
  var at = gameTicket;
  setTimeout(function () {
    if (at !== gameTicket || !G || G.played.length !== ply + 1) return;
    var r = null;
    try { r = explainPly(ply); } catch (e) { r = null; }
    if (r && !r.quiet && !r.asked) whyNote(r);
    if (source === "coach") helpTip("why", function () { return document.querySelector("#moveList .m.cur"); });
  }, 650);
}
/* a tap on the move list: the last move answers "why?", any other move
   shows its position as it always did */
function tapMoveCell(ply) {
  var askable = mode === "coach" || mode === "pass" || mode === "lan";
  if (askable && G && ply === G.played.length - 1 && viewPly < 0) { showWhy(ply); return; }
  viewAt(ply);
}

/* ---- training wheels ---- */
var wheelsAt = "", wheelsSeen = null, wheelsGame = null, wheelsFired = 0;
var hotAt = "", hotSeen = null, hotSlow = false;
function wheelsOn() {
  return !!prefs.wheels && !!G && viewPly < 0 && !over && !clock.on &&
    (mode === "coach" || mode === "pass") && canActNow(true);
}
/* Called by syncBoard with the highlight object it is about to hand the
   renderer: fills in what is in danger and where a lifted piece would
   be lost. Bookkeeping only; what is said about it is said once per
   position, after the frame. */
function helpMarks(hi) {
  hi.danger = []; hi.hot = []; hi.hotCapt = [];
  if (!wheelsOn()) return;
  if (wheelsGame !== G) { wheelsGame = G; wheelsFired = 0; }
  var here = gameTicket + ":" + G.played.length;
  if (wheelsAt !== here) {
    wheelsAt = here;
    try { wheelsSeen = Help.danger(G, G.turn); } catch (e) { wheelsSeen = { pieces: [], mate: null }; }
    if (wheelsSeen.pieces.length || wheelsSeen.mate) setTimeout(function () { wheelsSpeak(here); }, 0);
    helpTip("wheels");
  }
  hi.danger = wheelsSeen.pieces.map(function (p) { return p.sq; });
  if (sel >= 0 && legalMoves.length && !hotSlow) {
    var key = here + ":" + sel;
    if (hotAt !== key) {
      var t0 = performance.now();
      try { hotSeen = Help.hot(G, legalMoves); } catch (e) { hotSeen = { hot: [], hotCapt: [] }; }
      /* a slow phone loses the hot marks for the session rather than a
         beat on every touch */
      if (performance.now() - t0 > 80) hotSlow = true;
      hotAt = key;
    }
    hi.hot = hotSeen.hot.slice(); hi.hotCapt = hotSeen.hotCapt.slice();
    hi.legal = hi.legal.filter(function (q) { return hi.hot.indexOf(q) < 0; });
    hi.legalCapt = hi.legalCapt.filter(function (q) { return hi.hotCapt.indexOf(q) < 0; });
  }
}
function wheelsSpeak(here) {
  if (!wheelsOn() || here !== gameTicket + ":" + G.played.length || !wheelsSeen) return;
  var side = G.turn, w = wheelsSeen, text;
  if (w.mate) {
    showLines([{ from: w.mate.from, to: w.mate.to, kind: "threat", tone: "threat",
                 knight: Math.abs(G.board[w.mate.from]) === Chess.N }], 0, "help");
    showMateNet(side);
    text = "They threaten mate: <b>" + w.mate.san.replace(/#$/, "") + "</b> would be checkmate.";
  } else {
    var p = w.pieces[0];
    showLines([{ from: p.from, to: p.sq, kind: "threat", tone: "threat",
                 knight: Math.abs(G.board[p.from]) === Chess.N }], 0, "help");
    text = "Your " + Teach.pieceName(p.piece) + " on " + Chess.sqName(p.sq) + " can be won — the " +
      Teach.pieceName(G.board[p.from]) + " on " + Chess.sqName(p.from) + " is after it." +
      (w.pieces.length > 1 ? " " + (w.pieces.length - 1 === 1 ? "One more piece is" : (w.pieces.length - 1) + " more pieces are") + " marked too." : "");
  }
  wheelsFired++;
  /* help is help: against the computer it is counted, like a hint;
     two people sharing a board pay nothing for a shared lesson */
  if (mode === "coach") { assist.wheels = (assist.wheels | 0) + 1; saveGame(); }
  note({ ply: G.played.length ? G.played.length - 1 : null, icon: "🛟", tone: "warn", key: "wheel",
         squares: w.mate ? [w.mate.from, w.mate.to] : [w.pieces[0].from, w.pieces[0].sq], text: text,
         brief: "wheels · " + (w.mate ? "mate threat " + w.mate.san : w.pieces.map(function (q) { return Chess.sqName(q.sq); }).join(" ")) });
}
/* the blunder toast's offer, once, when the wheels are off */
function wheelsOfferAction() {
  if (prefs.wheels || prefs.wheelsOffered || clock.on || (mode !== "coach" && mode !== "pass")) return [];
  prefs.wheelsOffered = true; savePrefs();
  return [{ label: "🛟 Warn me first", ghost: true, fn: function () {
    prefs.wheels = true; savePrefs(); syncSettingsUI(); wheelsAt = ""; syncBoard();
    toast("🛟 Training wheels on — what's in danger shows before you move. Settings takes them off.", null, 6000);
  } }];
}
/* the end of a game: the welcome's job may be done, and wheels that
   were never needed are offered off — once */
function helpAtEnd() {
  if (mode === "coach" && !prefs.welcomed) { prefs.welcomed = true; savePrefs(); }
  if (prefs.wheels && wheelsGame === G && wheelsFired === 0 && G && G.played.length >= 20 && !prefs.wheelsOffOffered &&
      (mode === "coach" || mode === "pass")) {
    prefs.wheelsOffOffered = true; savePrefs();
    var at = gameTicket;
    setTimeout(function () {
      if (at !== gameTicket) return;
      ask("🛟 Nothing of yours was in danger all game. <b>Try the next one without the training wheels?</b>",
        [{ label: "Take them off", fn: function () { prefs.wheels = false; savePrefs(); syncSettingsUI(); } },
         { label: "Keep them", fn: function () {} }]);
    }, 4200);
  }
}
function syncHelpSettings() {
  $("setWheels").classList.toggle("sel", !!prefs.wheels);
  $("setWheels").textContent = prefs.wheels ? "On" : "Off";
}
function wireHelp() {
  $("mNew").addEventListener("click", welcomeNew);
  $("mKnow").addEventListener("click", welcomeKnow);
  $("whyChip").addEventListener("click", function (e) {
    e.stopPropagation();
    if (G && viewPly >= 0) showWhy(viewPly);
  });
  $("setWheels").addEventListener("click", function () {
    prefs.wheels = !prefs.wheels; prefs.wheelsOffered = true; savePrefs(); syncSettingsUI();
    wheelsAt = ""; hotAt = "";
    syncBoard();
  });
}
/* dev handles, for chess/tools/lamp-check.js, welcome-check.js and
   wheels-check.js */
function helpTestHooks(cr) {
  cr.Help = Help;
  cr.helpForTest = {
    think: function () { var s = lampSide(); return Help.think(G, s, { reveal: lampReveal(s) }); },
    theirs: function (ply) { return explainPly(ply == null ? G.played.length - 1 : ply); },
    explainPly: explainPly, showWhy: showWhy, lamp: giveHint,
    coachMemo: function () { return coachMemoGame === G ? coachMemo : {}; }
  };
  /* every once-only word is unsaid again: the pointers, and the offer of the wheels */
  cr.tipsResetForTest = function () { prefs.tips = {}; tipQueued = {}; prefs.wheelsOffered = false; savePrefs(); };
  cr.wheelsForTest = function (on) { prefs.wheels = !!on; savePrefs(); wheelsAt = ""; hotAt = ""; hotSlow = false; syncSettingsUI(); syncBoard(); };
  cr.assistForTest = function () { return { takebacks: assist.takebacks, hints: assist.hints, wheels: assist.wheels | 0 }; };
  cr.toastForTest = function (html, actions, ms, extras) { toast(html, actions, ms, extras); };
  cr.isNewcomerForTest = isNewcomer;
}

/* ===== opening narration =====
   Two layers: book.js carries the teaching (ideas, per-move reasons)
   for the great openings; eco.js — the full lichess chess-openings
   table, CC0 — carries precise names for the other ~3,800 lines the
   players may wander into. */
function narrateOpening(san, source) {
  if (!G || G.played.length > 36 || mode === "tour" || G.startFen) return;
  var sans = G.played.map(function (r) { return r.san.replace(/[+#]$/, ""); });
  var entry = Book.match(sans);
  var eco = (typeof Eco !== "undefined") ? Eco.match(sans) : null;
  var title = null, code = "", idea = entry ? entry.idea : "";
  if (eco && (!entry || eco.seq.split(" ").length >= entry.seq.split(" ").length)) {
    title = eco.name; code = eco.eco;
  } else if (entry) {
    title = entry.name;
  }
  if (title) showOpeningCard(title, code, idea, (entry && entry.name !== title) ? entry.name : "");
  if (entry && entry.name !== lastNarratedOpening && sans.length >= 2) {
    lastNarratedOpening = entry.name;
    /* a move played elsewhere, or a game picked back up, fills the card
       without also announcing an opening you were already in */
    if (source !== "net" && source !== "resume") {
      /* across a table a toast faces one of the two: the notebook keeps it */
      if (!tableFacing()) toast("📖 <b>" + entry.name + "</b> — " + entry.idea, null, 6000);
      note({ ply: G.played.length - 1, icon: "\ud83d\udcd6", tone: "note", key: "opening:" + entry.name,
             text: "<b>" + entry.name + "</b> — " + entry.idea,
             brief: (code ? code + " \u00b7 " : "") + entry.name });
    }
  }
}

/* the opening card, written in one place so a live game and a guided
   tour always put the same shape on the panel */
function showOpeningCard(name, eco, idea, ideaFrom) {
  $("ocName").textContent = name;
  $("ocName").title = name;              /* the long ECO names get clipped on a phone */
  $("ocEco").textContent = eco || "";
  $("ocIdea").textContent = idea || "";
  $("ocFrom").textContent = ideaFrom ? "— the idea behind the " + ideaFrom.replace(/^the /i, "") : "";
  $("openingCard").classList.remove("hide");
  syncPanelInfo();
}
function hideOpeningCard() {
  $("openingCard").classList.add("hide");
  syncPanelInfo();
}

/* ===== move list & history browsing ===== */
function syncMoveList() {
  var ml = $("moveList");
  ml.innerHTML = "";
  if (!G) return;
  if (!G.played.length) {
    var empty = document.createElement("div");
    empty.className = "mlEmpty";
    empty.textContent = "The moves land here as you play — tap any one to look back at it.";
    ml.appendChild(empty);
    return;
  }
  /* one slab per move pair: the number, white's move, black's reply */
  for (var i = -notationOff(); i < G.played.length; i += 2) {
    var row = document.createElement("div"); row.className = "mrow";
    var n = document.createElement("span"); n.className = "n"; n.textContent = notationMoveNo(Math.max(0, i)) + ".";
    row.appendChild(n);
    row.appendChild(i < 0 ? document.createElement("span") : moveCell(i));
    if (i + 1 < G.played.length) row.appendChild(moveCell(i + 1));
    else row.appendChild(document.createElement("span"));
    ml.appendChild(row);
  }
  /* live play follows the game to the bottom; browsing follows your eye.
     Both wait a frame: a panel that has just changed shape (a game picked
     back up, a phone rotating) reports its old height until layout runs. */
  var cur = ml.querySelector(".m.cur");
  var browsing = viewPly >= 0;
  requestAnimationFrame(function () {
    var wrap = $("moveListWrap");
    if (browsing && cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
    else wrap.scrollTop = wrap.scrollHeight;
  });
}
/* ===== the coach's notebook =====
   Everything the room notices — a fork that appeared, a move that cost
   a pawn, the opening you have wandered into, the reason the game ended
   — used to live for seven seconds in a toast and then be gone. That is
   no use to a beginner, who wanted to read it twice and could not, and
   no use to a strong player, who wanted the whole game at once and got
   a sentence at a time.

   So it is kept. One list per game, beside the moves, on its own tab;
   every entry remembers which move it belongs to, so tapping it takes
   the board back to that position and draws the squares it is about.
   The same observation, in two languages: full sentences for somebody
   learning the idea, and the notation a club player already reads for
   somebody who only wants to know what it cost.

   A mark (?!, ?, ??, !) rides along to the move list, because that one
   piece of notation means the same thing on your fifth game and your
   five thousandth. */
var notes = [], marks = {}, panelTab = "moves", notesUnread = 0;
var MARK_CLASS = { "!!": "brilliant", "!": "good", "?!": "dubious", "?": "mistake", "??": "blunder" };

function voice() { return prefs.coach ? (prefs.coachVoice === "brief" ? "brief" : "plain") : "off"; }

function clearNotes() {
  notes = []; marks = {}; notesUnread = 0;
  renderNotes(); syncNoteBadge();
}
function forgetNotesAfter(lastPly) {
  notes = notes.filter(function (e) { return e.ply == null || e.ply <= lastPly; });
  for (var k in marks) if (+k > lastPly) delete marks[k];
  renderNotes();
}
/* `e`: { ply, icon, tone, move, text, brief, cp, squares, mark } */
function note(e) {
  if (voice() === "off") return;
  if (!e || !e.text) return;
  e.at = Date.now();
  /* one remark per move per concept: a coach that says the same thing
     twice about the same move is a coach you stop reading */
  var key = e.ply + ":" + (e.key || e.text);
  for (var i = 0; i < notes.length; i++) if (notes[i].k === key) return;
  e.k = key;
  notes.push(e);
  if (notes.length > 60) notes.shift();
  if (e.mark && e.ply != null) { marks[e.ply] = e.mark; syncMoveList(); }
  if (panelTab !== "notes") { notesUnread++; syncNoteBadge(); }
  renderNotes();
  helpTip("notes", function () { return $("tabNotes"); });
}
function syncNoteBadge() {
  $("notesDot").classList.toggle("hide", notesUnread === 0 || panelTab === "notes");
}
function showPanelTab(which) {
  panelTab = which === "notes" ? "notes" : "moves";
  $("tabMoves").classList.toggle("sel", panelTab === "moves");
  $("tabNotes").classList.toggle("sel", panelTab === "notes");
  $("moveListWrap").classList.toggle("hide", panelTab !== "moves");
  $("noteListWrap").classList.toggle("hide", panelTab !== "notes");
  if (panelTab === "notes") { notesUnread = 0; renderNotes(); }
  syncNoteBadge();
}
/* a score from the mover's side of the board, in the units players use */
function cpText(cp, side) {
  if (cp == null) return "";
  var v = (side === -1 ? -cp : cp) / 100;
  if (Math.abs(v) < 0.05) return "0.0";
  return (v > 0 ? "+" : "\u2212") + Math.abs(v).toFixed(1);
}
function moveLabel(ply) {
  if (!G || !G.played[ply]) return "";
  return notationMoveNo(ply) + (notationSideOf(ply) === -1 ? "\u2026" : ".") + " " + G.played[ply].san;
}
function renderNotes() {
  var box = $("noteList");
  if (!box) return;
  box.innerHTML = "";
  /* with the coach off the room says nothing and shows nothing — what
     it noticed earlier is kept, and comes straight back when the voice
     is turned on again mid-game */
  if (!notes.length || voice() === "off") {
    var empty = document.createElement("div");
    empty.className = "nlEmpty";
    empty.textContent = voice() === "off"
      ? "The coach is off. Turn its voice back on in Settings and everything it notices lands here."
      : "Whatever the room notices lands here \u2014 openings, tactics, and what a move cost. Tap one to go back and look.";
    box.appendChild(empty);
    return;
  }
  var brief = voice() === "brief";
  for (var i = notes.length - 1; i >= 0; i--) {
    var e = notes[i];
    var row = document.createElement("button");
    row.className = "note t-" + (e.tone || "note");
    var ic = document.createElement("span");
    ic.className = "ni"; ic.textContent = e.icon || "\u2022";
    var body = document.createElement("span"); body.className = "nb";
    var head = document.createElement("span"); head.className = "nh";
    if (e.ply != null && G && G.played[e.ply]) {
      var mv = document.createElement("span"); mv.className = "nmove";
      mv.textContent = moveLabel(e.ply) + (e.mark || "");
      head.appendChild(mv);
    } else if (e.head) {
      head.appendChild(document.createTextNode(e.head));
    }
    if (e.cp != null) {
      var cp = document.createElement("span"); cp.className = "ncp";
      cp.textContent = cpText(e.cp, e.side || 1);
      head.appendChild(cp);
    }
    if (head.childNodes.length) body.appendChild(head);
    var txt = document.createElement("span"); txt.className = "nt";
    txt.innerHTML = brief && e.brief ? e.brief : e.text;
    body.appendChild(txt);
    row.appendChild(ic); row.appendChild(body);
    (function (entry) {
      row.addEventListener("click", function () { openNote(entry); });
    })(e);
    box.appendChild(row);
  }
}
/* a note is a way back into the game: the board goes to the position the
   remark is about and draws the squares it is about */
function openNote(e) {
  var at = e.viewPly != null ? e.viewPly : e.ply;
  if (at != null && G && G.played[at]) viewAt(at);
  /* a remark about how good a move was opens on the position before it,
     and the look-back draws its lines there itself */
  if (e.viewPly != null && viewPly === e.viewPly) return;
  /* drawn again from nothing, so the eye is pulled the same way twice */
  clearLines("teach");
  if (e.squares && e.squares.length >= 2) {
    showLines([{ from: e.squares[0], to: e.squares[1], kind: "run",
                 tone: e.tone === "bad" || e.tone === "warn" ? "threat" : "hint",
                 knight: knightHop(e.squares[0], e.squares[1]) }], 4200, "teach");
  } else if (e.squares && e.squares.length === 1) {
    /* one square is a place: circled, not lifted */
    showLines([{ sq: e.squares[0], kind: "ring", tone: "hint" }], 3200, "teach");
  }
}

/* figurine notation: a knight reads as a knight faster than "N" does.
   White's men keep the open glyphs, black's the filled ones — the same
   pairing the captured piles over the board already use. */
var FIG_W = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
var FIG_B = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞" };
function figurine(san, side) {
  var fig = side === 1 ? FIG_W : FIG_B;
  var out = document.createDocumentFragment(), rest = san;
  function glyph(ch) { var i = document.createElement("i"); i.className = "fig"; i.textContent = fig[ch]; return i; }
  if (fig[san.charAt(0)]) { out.appendChild(glyph(san.charAt(0))); rest = san.slice(1); }
  var eq = rest.indexOf("=");
  if (eq >= 0 && fig[rest.charAt(eq + 1)]) {
    out.appendChild(document.createTextNode(rest.slice(0, eq + 1)));
    out.appendChild(glyph(rest.charAt(eq + 1)));
    out.appendChild(document.createTextNode(rest.slice(eq + 2)));
  } else {
    out.appendChild(document.createTextNode(rest));
  }
  return out;
}
function moveCell(ply) {
  var s = document.createElement("span");
  s.className = "m" + ((viewPly === ply || (viewPly < 0 && ply === G.played.length - 1)) ? " cur" : "");
  var san = G.played[ply].san;
  s.appendChild(figurine(san, notationSideOf(ply)));
  s.title = san;                        /* the plain letters, for anyone who wants them */
  var mk = voice() === "off" ? null : marks[ply];
  if (mk) {
    var i = document.createElement("i");
    i.className = "mk mk-" + MARK_CLASS[mk];
    i.textContent = mk;
    s.appendChild(i);
    /* the words behind the mark, for whoever has not met it before */
    for (var n = 0; n < notes.length; n++) {
      if (notes[n].ply === ply && notes[n].mark) { s.title = san + " " + mk + " \u2014 " + stripTags(notes[n].text); break; }
    }
  }
  if (ply === G.played.length - 1 && (mode === "coach" || mode === "pass" || mode === "lan")) s.title += " \u00b7 tap to ask why";
  s.addEventListener("click", function () { tapMoveCell(ply); });
  accCell(s, ply, san);
  return s;
}
function stripTags(html) { return String(html).replace(/<[^>]*>/g, ""); }
function viewAt(ply) {
  if (!G || ply < 0 || ply >= G.played.length) return;
  viewPly = (ply === G.played.length - 1) ? -1 : ply;
  showViewBanner(viewPly >= 0);
  clearSel();
  R.setPosition(currentViewBoard());
  syncBoard(); syncMoveList(); syncBars(); syncTurnStrip();
  syncLookBack();
}
function exitView() {
  viewPly = -1;
  showViewBanner(false);
  R.setPosition(G.board);
  fxRelay();
  syncBoard(); syncMoveList(); syncBars(); syncTurnStrip();
  syncLookBack();
}

/* ===== after the game, a beat at a time =====
   The best games don't hand you a results screen; they hand you the
   result, then let each thing it earned have its moment: the result,
   then your rating, then how you played, then your experience, then each
   thing unlocked, then the presents, and only then the card with what to
   do next. So the end card is told over, as beats:
     result   you won / good game, and how it ended
     rating   the number counting to its new place, the stars slamming in
     look     how you played: accuracy, the brilliant and the slips
     xp       experience filling the bar, LEVEL UP if it did
     (one beat for each thing the game did: a chapter cleared, a coach
      unlocked, a new level, a feat, a personal best)
     tale     a new tale to read, now or later
     gifts    presents to open
   and then the card, everything on it already settled.
   A beat arrives, plays, and waits for you: the first tap finishes what
   is still moving, the next goes on, and Skip goes straight to the card.
   The end card is under the beats all along, quietly doing its sums, so
   nothing it earns is lost if you skip. */
var beatsOn = false, beatList = [], beatAt = -1, beatCur = null, beatCtx = null, beatTicket = 0, endLook = null;
function beatsStart(result, reason, rs, iWon) {
  if (!G || !(mode === "coach" || mode === "pass" || mode === "lan") || G.startFen) return false;
  beatTicket++;
  beatCtx = { ticket: gameTicket, result: result, reason: reason, rs: rs, won: iWon, shownMiles: 0 };
  beatList = ["result"];
  if (rs) beatList.push("rating", "look");
  beatList.push("xp", "miles", "tale", "gifts");
  beatAt = -1;
  beatsOn = true;
  $("ovBeat").classList.remove("hide");
  beatNext();
  return true;
}
function beatLive() { return beatsOn && beatCtx && beatCtx.ticket === gameTicket; }
/* is there anything to say for this kind of beat, now? */
function beatHas(kind) {
  var c = beatCtx;
  if (kind === "result" || kind === "rating" || kind === "look") return true;
  if (kind === "xp") return !!(unlGameXp && unlGameXp.ticket === gameTicket && unlGameXp.from && unlGameXp.to);
  if (kind === "mile") return true;
  if (kind === "tale") return !$("endTale").classList.contains("hide");
  if (kind === "gifts") return unlQueue.length > 0;
  return false;
}
function beatNext() {
  if (!beatLive()) { beatsEnd(); return; }
  if (beatCur && beatCur.busy) { beatCur.finish(); return; }
  for (;;) {
    beatAt++;
    if (beatAt >= beatList.length) { beatsEnd(); return; }
    var k = beatList[beatAt];
    if (k === "miles") {
      /* what the game did, each its own beat: whatever has been told so
         far on the card, and whatever was still waiting to be */
      milesFlush();
      var lines = [].slice.call($("endMiles").querySelectorAll(".erMile")).slice(beatCtx.shownMiles);
      beatCtx.shownMiles += lines.length;
      var add = lines.map(function (l) { return { kind: "mile", html: l.innerHTML, cls: l.className }; });
      beatList.splice.apply(beatList, [beatAt + 1, 0].concat(add));
      continue;
    }
    if (typeof k === "object" || beatHas(k)) break;
  }
  beatShow(beatList[beatAt]);
}
function beatsEnd() {
  if (!beatsOn) return;
  beatsOn = false; beatTicket++;
  if (beatCur && beatCur.stop) beatCur.stop();
  beatCur = null;
  var ov = $("ovBeat");
  if (uimOn() && !ov.classList.contains("hide")) {
    ov.classList.add("out");
    setTimeout(function () { ov.classList.add("hide"); ov.classList.remove("out"); }, 260);
  } else ov.classList.add("hide");
  /* the card the beats were telling: hurry it to where it would be */
  milesFlush();
}
function beatsSkip() { if (beatsOn) { hap("tick"); beatsEnd(); } }
/* one beat on the screen */
function beatShow(b) {
  var kind = typeof b === "object" ? b.kind : b, my = beatTicket, timers = [];
  /* this beat, and only while it is the one on the screen */
  var alive = function () { return beatsOn && my === beatTicket && beatCur === cur; };
  var later = function (fn, ms) { timers.push(setTimeout(function () { if (alive()) fn(); }, REDUCED ? 0 : ms)); };
  var body = $("btBody"), ov = $("ovBeat"), head = $("btHead"), kick = $("btKick"), sub = $("btSub"), acts = $("btActs");
  acts.innerHTML = ""; sub.textContent = ""; body.innerHTML = "";
  ov.className = "ov beatOv b-" + kind;
  /* how far through: a dot per beat still to come */
  var rest = beatList.slice(beatAt).filter(function (x) { return typeof x === "object" || x === "miles" || beatHas(x); }).length;
  var done = beatAt;
  $("btDots").innerHTML = new Array(Math.min(12, done + rest)).fill(0).map(function (_, i) { return '<i class="' + (i <= done ? "on" : "") + '"></i>'; }).join("");
  var cur;
  cur = { busy: true, finishers: [], finish: null, stop: function () { timers.forEach(clearTimeout); } };
  cur.finish = function () { timers.forEach(clearTimeout); cur.finishers.forEach(function (f) { f(); }); beatReady(cur); };
  beatCur = cur;
  var hint = $("btHint");
  hint.classList.remove("on");
  var c = beatCtx, rs = c.rs;
  if (kind === "result") {
    var em = $("endEmoji").textContent, t = $("endTitle").textContent;
    kick.textContent = c.reason ? c.reason.charAt(0).toUpperCase() + c.reason.slice(1).replace(/-/g, " ") : "Game over";
    head.textContent = t;
    sub.textContent = $("endSub").textContent;
    body.innerHTML = '<div class="btBig" aria-hidden="true">' + escHtml(em) + "</div>";
    ov.classList.add(c.won ? "win" : c.result === "draw" ? "draw" : mode === "pass" ? "win" : "loss");
    snd(c.won ? "open" : "tap");
    later(function () { beatReady(cur); }, 900);
  } else if (kind === "rating") {
    var out = rs.out, before = Math.round(out.before), after = Math.round(out.after), tt = Rating.title(after);
    kick.textContent = "Your rating";
    head.textContent = tt.emoji + " " + tt.name;
    body.innerHTML = '<div class="btNum"><b id="btRate">' + before + '</b><span class="btDelta ' + (after > before ? "up" : after < before ? "down" : "flat") + '" id="btDelta">' +
      fmtDelta(after - before) + (out.provisional ? " ?" : "") + "</span></div>" +
      '<div class="btStars" id="btStars">' + [0, 1, 2].map(function (i) { var r = rungOf(rs.level); return '<i class="' + (r.stars[i] && rs.newStars.indexOf(i) < 0 ? "on" : "") + '">★</i>'; }).join("") + "</div>";
    sub.textContent = rs.newStars.length ? (rs.newStars.length === 1 ? "A new star against " : rs.newStars.length + " new stars against ") + SKILLS[rs.level].name + "!" :
      out.provisional ? "Still finding your level: every game tells it more." : "Against " + SKILLS[rs.level].name + ".";
    var finalRate = function () {
      $("btRate").textContent = after; $("btDelta").classList.add("show");
      rs.newStars.forEach(function (si) { $("btStars").children[si].classList.add("on"); });
    };
    cur.finishers.push(finalRate);
    later(function () {
      countUp($("btRate"), before, after, Math.min(1500, 500 + Math.abs(after - before) * 14), function (k, n) {
        if (prefs.sound && typeof Sound !== "undefined" && Sound.countTick) Sound.countTick(k, n, after >= before);
        hap("count");
      }).then(function () {
        if (!alive()) return;
        $("btDelta").classList.add("show");
        sting(after > before ? "rating-up" : after < before ? "rating-down" : "tap");
        rs.newStars.forEach(function (si, k) {
          later(function () {
            var el = $("btStars").children[si];
            el.classList.add("on", "pop"); sting("lesson-right"); hap("star");
            if (FX) Fx.sparkle(el, { count: 20 });
          }, 380 + k * 420);
        });
        later(function () { finalRate(); beatReady(cur); }, 500 + rs.newStars.length * 420);
      });
    }, 450);
  } else if (kind === "look") {
    kick.textContent = "How you played";
    head.textContent = "Looking back over your moves…";
    body.innerHTML = '<div class="btRing" id="btRing" style="--p:0"><b id="btAcc">…</b></div><div class="btChips" id="btChips"></div>';
    var shown = false;
    var fill = function (animate) {
      if (shown) return;
      var L = endLook;
      if (!L || L.ticket !== c.ticket || !L.done) return false;
      shown = true;
      if (L.acc == null) {
        head.textContent = L.moves ? "Too short to measure" : "Nothing to look back on";
        $("btAcc").textContent = "—";
        sub.textContent = L.moves ? "Accuracy needs " + (Rating.ACCURACY_MIN_MOVES || 8) + " moves of your own after the opening." : "";
      } else {
        var acc = Math.round(L.acc);
        head.textContent = acc >= 90 ? "Superb!" : acc >= 80 ? "Really well played" : acc >= 65 ? "Nicely played" : acc >= 50 ? "Some good moves" : "Every game teaches something";
        sub.textContent = L.perf ? "You played like about " + Math.round(L.perf) + "." : "";
        if (animate && !REDUCED) {
          countUp($("btAcc"), 0, acc, 900).then(function () { if (alive()) $("btAcc").textContent = acc + "%"; });
          var t0 = performance.now();
          (function ring() {
            if (!alive()) return;
            var f = Math.min(1, (performance.now() - t0) / 900);
            $("btRing").style.setProperty("--p", (acc * (1 - Math.pow(1 - f, 3))).toFixed(1));
            if (f < 1) requestAnimationFrame(ring);
          })();
        } else { $("btAcc").textContent = acc + "%"; $("btRing").style.setProperty("--p", acc); }
        if (L.third) { later(function () { var x = document.createElement("div"); x.className = "btThird"; x.textContent = "★ Third star: no help, and played well!"; body.appendChild(x); sting("lesson-right"); hap("star"); }, animate ? 1000 : 0); }
      }
      if (L.counts) $("btChips").innerHTML = countChips(L.counts);
      later(function () { beatReady(cur); }, animate ? 1100 : 0);
      return true;
    };
    /* the look-back may still be counting: show it counting, and the
       answer when it comes; a tap meanwhile moves on */
    cur.finishers.push(function () { fill(false); });
    if (!fill(true)) {
      var wait = function () {
        if (!alive()) return;
        if (endLook && endLook.n) $("btAcc").textContent = endLook.k + "/" + endLook.n;
        if (!fill(true)) timers.push(setTimeout(wait, 120));
      };
      wait();
    }
  } else if (kind === "xp") {
    var X = unlGameXp, from = X.from, to = X.to, total = 0;
    X.parts.forEach(function (p) { total += p.xp; });
    kick.textContent = "Experience";
    head.textContent = "+" + total + " XP";
    sub.textContent = X.parts.map(function (p) { return p.why + " +" + p.xp; }).join(" · ");
    body.innerHTML = '<div class="btXp"><span class="btLv" id="btLv">' + from.level + '</span><div class="btBar"><i id="btBar" style="width:' + (from.frac * 100).toFixed(1) + '%"></i></div></div><div class="btUp hide" id="btUp">LEVEL UP!</div>';
    var steps = [];
    for (var lv = from.level; lv < to.level; lv++) steps.push(lv + 1);
    var xpFinal = function () {
      var bar = $("btBar");
      bar.style.transition = "none"; bar.style.width = (to.frac * 100).toFixed(1) + "%";
      $("btLv").textContent = to.level;
      if (to.level > from.level) $("btUp").classList.remove("hide");
    };
    cur.finishers.push(xpFinal);
    var fillXp = function () {
      if (!alive()) return;
      var bar = $("btBar");
      if (!steps.length) {
        bar.style.transition = "width .8s cubic-bezier(.2,.8,.3,1)"; bar.style.width = (to.frac * 100).toFixed(1) + "%";
        later(function () { beatReady(cur); }, 850);
        return;
      }
      var nx = steps.shift();
      bar.style.transition = "width .6s cubic-bezier(.3,.6,.4,1)"; bar.style.width = "100%";
      later(function () {
        var lvEl = $("btLv");
        lvEl.textContent = nx; lvEl.classList.remove("up"); void lvEl.offsetWidth; lvEl.classList.add("up");
        var up = $("btUp"); up.classList.add("hide"); void up.offsetWidth; up.classList.remove("hide");
        sting("levelup"); hap("success");
        if (FX) { try { Fx.sparkle(lvEl, { count: 30 }); Fx.confetti({ ms: 1600, layer: "page" }); } catch (e) {} }
        bar.style.transition = "none"; bar.style.width = "0%"; void bar.offsetWidth;
        later(fillXp, 260);
      }, 640);
    };
    later(fillXp, 450);
  } else if (kind === "mile") {
    var tmp = document.createElement("div");
    tmp.innerHTML = b.html;
    var icon = tmp.querySelector(".em"), iconTx = icon ? icon.textContent : "✨";
    if (icon) icon.remove();
    /* its own buttons (Use it, Sit there) still work from here */
    var btns = [].slice.call(tmp.querySelectorAll("button"));
    btns.forEach(function (x) { x.remove(); });
    var big = /levelup|chapter|cupwon|unlock/.test(b.cls || "");
    kick.textContent = /chapter/.test(b.cls || "") ? "Chapter cleared" : /levelup/.test(b.cls || "") ? "Level up" : /feat/.test(b.cls || "") ? "Achievement" : "Well done";
    /* the line's bold part is the headline; a "Feat:" label is the kicker
       and what follows it the headline; a line with no bold part is all
       headline */
    var strong = tmp.querySelector("b"), st = strong ? strong.textContent.trim() : "";
    if (strong && /:$/.test(st)) {
      kick.textContent = st.replace(/:$/, "");
      strong.remove();
      head.textContent = tmp.textContent.trim();
      sub.textContent = "";
    } else if (strong) {
      head.textContent = st;
      strong.remove();
      sub.innerHTML = tmp.innerHTML.trim();
    } else {
      head.textContent = tmp.textContent.trim();
      sub.textContent = "";
    }
    body.innerHTML = '<div class="btRays" aria-hidden="true"></div><div class="btBig btIcon" aria-hidden="true">' + escHtml(iconTx) + "</div>";
    btns.forEach(function (x) {
      var y = x.cloneNode(true);
      y.classList.add("btAct");
      /* a tap here is a tap on the card's own button (the card does the work) */
      y.addEventListener("click", function (e) {
        e.stopPropagation();
        var key = x.getAttribute("data-home") != null ? '[data-home="' + x.getAttribute("data-home") + '"]' : '[data-place="' + x.getAttribute("data-place") + '"]';
        var orig = $("endMiles").querySelector(key);
        if (orig) { orig.click(); y.textContent = orig.textContent; y.disabled = orig.disabled; }
      });
      acts.appendChild(y);
    });
    sting(big ? "milestone" : "lesson-right"); hap("success");
    if (FX && big) { later(function () { Fx.confetti({ ms: 2200, layer: "page" }); Fx.fireworks({ count: 2, layer: "page" }); }, 250); }
    later(function () { beatReady(cur); }, 700);
  } else if (kind === "tale") {
    var tid = skill, tl = typeof Tales !== "undefined" && Tales.get(tid);
    kick.textContent = "A new tale";
    head.textContent = tl ? tl.title : $("endTaleTx").textContent;
    sub.textContent = taleName(tid) + " has a story for you, from the history of chess.";
    body.innerHTML = '<div class="btBig" aria-hidden="true">' + escHtml(tl ? tl.art : "📜") + "</div>";
    var read = document.createElement("button");
    read.className = "bigbtn primaryBtn btAct"; read.innerHTML = "📜 Read it now";
    read.addEventListener("click", function (e) { e.stopPropagation(); beatsEnd(); $("endTale").click(); });
    var lat = document.createElement("button");
    lat.className = "ghostbtn btAct"; lat.textContent = "Later";
    lat.addEventListener("click", function (e) { e.stopPropagation(); cur.busy = false; beatNext(); });
    acts.appendChild(read); acts.appendChild(lat);
    snd("open");
    later(function () { beatReady(cur); }, 600);
  } else if (kind === "gifts") {
    var n = unlQueue.length;
    kick.textContent = "Prizes";
    head.textContent = n > 1 ? "You won " + n + " prizes!" : "You won a prize!";
    sub.textContent = "Something new for your collection.";
    body.innerHTML = '<div class="btBig btGift" aria-hidden="true">🎁</div>';
    var openB = document.createElement("button");
    openB.className = "bigbtn primaryBtn btAct"; openB.innerHTML = "🎁 Open " + (n > 1 ? "them" : "it") + "!";
    openB.addEventListener("click", function (e) { e.stopPropagation(); beatsEnd(); unlOpenBoxes(); });
    var lat2 = document.createElement("button");
    lat2.className = "ghostbtn btAct"; lat2.textContent = "Later";
    lat2.addEventListener("click", function (e) { e.stopPropagation(); cur.busy = false; beatNext(); });
    acts.appendChild(openB); acts.appendChild(lat2);
    hap("tick");
    later(function () { beatReady(cur); }, 600);
  }
  /* the beat arrives: the panel springs up, its parts follow on a beat */
  var stage = ov.querySelector(".btStage");
  stage.classList.remove("in"); void stage.offsetWidth; stage.classList.add("in");
}
function beatReady(cur) {
  if (beatCur !== cur || !cur.busy) return;
  cur.busy = false;
  $("btHint").classList.add("on");
}
function beatsWire() {
  var ov = $("ovBeat");
  ov.addEventListener("click", function (e) {
    if (e.target.closest("#btSkip")) { beatsSkip(); return; }
    if (e.target.closest(".btAct")) return;
    beatNext();
  });
  document.addEventListener("keydown", function (e) {
    if (!beatsOn || ov.classList.contains("hide")) return;
    if (e.key === "Escape") { e.preventDefault(); beatsSkip(); }
    else if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") { if (!(e.target.closest && e.target.closest(".btAct"))) { e.preventDefault(); beatNext(); } }
  }, true);
}
function beatsForTest() {
  return { beatState: function () { var k = beatList[beatAt]; return { on: beatsOn, at: beatAt, kind: typeof k === "object" ? k.kind : k, busy: !!(beatCur && beatCur.busy),
             list: beatList.map(function (x) { return typeof x === "object" ? x.kind : x; }), head: $("btHead").textContent, kick: $("btKick").textContent,
             sub: $("btSub").textContent, body: $("btBody").textContent, acts: [].map.call($("btActs").children, function (x) { return x.textContent; }) }; },
           beatNext: beatNext, beatsSkip: beatsSkip, endLook: function () { return endLook; } };
}

/* ===== replay the last move (again, with feeling) ===== */
function replayLast() {
  if (!G || !G.played.length || thinking || (R.isAnimating && R.isAnimating())) return;
  if (viewPly >= 0) { exitView(); return; }
  var rec = G.played[G.played.length - 1];
  /* rebuild the position just before it, hand it to the renderer, then
     run the same animation slowly with a glow */
  var t = Chess.create(G.startFen);
  for (var i = 0; i < G.played.length - 1; i++) Chess.make(t, G.played[i].m);
  R.setPosition(t.board);
  clearSel();
  R.setHighlights({ last: null });
  toast("🔁 <b>" + rec.san + "</b> — once more, slowly.");
  R.animateMove(animDescriptor(rec.m), G.board, { scale: 2.1, glow: true }, function () {
    syncBoard();
  });
  needFrame();
}

/* ===== undo / takeback ===== */
function undoPly(n) {
  brainTicket++; gameTicket++;   /* every search still running is now stale */
  if (HAP) Haptics.cancel();     /* …and so is every buzz still waiting to land */
  if (!G || !G.played.length) return;
  if (mode === "lan") return; /* LAN goes through the polite request */
  clearTimeout(coachTimer); thinking = false;
  Brain.cancel();
  for (var i = 0; i < n && G.played.length; i++) Chess.takeBack(G);
  over = null;
  /* a move that has been taken back never happened, so neither did
     anything the room said about it */
  forgetNotesAfter(G.played.length - 1);
  Ink.dropAfter(ink, G.played.length);
  Object.keys(reviewMemo).forEach(function (k) { if (+k >= G.played.length) delete reviewMemo[k]; });
  /* the ideas named about undone moves were never part of this game */
  taughtAt = taughtAt.filter(function (t) { return t.ply < G.played.length; });
  teachSeen = {};
  taughtAt.forEach(function (t) { teachSeen[t.concept] = (teachSeen[t.concept] || 0) + 1; });
  closePromo();
  hideToast(); clearLines(); hintShown = null; fxCalm();
  clearSel(); viewPly = -1;
  showViewBanner(false);
  if (clock.on) { clock.run = G.played.length >= 2 ? G.turn : 0; clock.lastT = performance.now(); }
  R.setPosition(G.board);
  /* the opening card belongs to the position that is left */
  if (G.played.length) narrateOpening("", "resume"); else hideOpeningCard();
  syncAll();
  saveGame();
  /* a take-back that leaves it the computer's turn (you had Black and
     took back before your first move) must not leave it sitting there */
  if (mode === "coach" && !over && G.turn !== humanSide) scheduleCoach();
}
/* the promotion picker never outlives the position it was asked in */
function closePromo() {
  pendingPromo = null;
  $("ovPromo").classList.add("hide");
}
function undoSmart() {
  if (!G || !G.played.length) { toast("Nothing to undo yet."); return; }
  if (mode === "coach" && !humanMovesMade()) { toast("Nothing of yours to take back yet."); return; }
  if (mode === "lan") {
    if (!Net.linked()) { toast("The link is down — nothing to ask."); return; }
    var n = (G.turn === lanSide) ? 2 : 1;
    if (G.played.length < n) { toast("Nothing of yours to take back yet."); return; }
    Net.send({ t: "undoReq", n: n });
    toast("A polite takeback request is on its way…");
    return;
  }
  if (mode === "coach") {
    /* undo to the human's previous turn */
    var k = (G.turn === humanSide) ? 2 : 1;
    assist.takebacks++;
    undoPly(Math.min(k, G.played.length));
    toast("Rewound. Chess deserves second thoughts. <i>(A take-back makes this game count for a little less.)</i>");
  } else {
    if (over && mode === "pass") { over = null; $("ovEnd").classList.add("hide"); }
    undoPly(1);
  }
}

/* ===== your chess: the number, the ladder, the reasons to come back =====
   A game against the computer used to end and leave nothing behind. A
   person who plays alone needs what a club gives you: a number that is
   yours, somebody a little stronger to beat next, and a record of having
   beaten them. So every game against the computer is rated (rating.js
   holds the arithmetic), every coach on the ladder carries three stars,
   and a day you play is a day on your streak. */
var LADDER_KEY = "chessroom_ladder";
var rating = Rating.load(lsGet);
var ladder = loadLadder();
/* the help a player took in this game: kept so the score can say what
   you can do on your own, without ever refusing the help */
var assist = { takebacks: 0, hints: 0 };
var ratedDone = false;          /* this game has been counted */
var lastEval = 0;               /* the coach's last word on the position, from your side, in cp */
var reviewMemo = {};            /* ply → {best, played, bm, rf}: the gentle coach's reviews, reused by the look-back */

function loadLadder() {
  var fresh = { v: 1, rungs: {}, lastSide: -1, day: "", days: 0, bestDays: 0 };
  try {
    var s = JSON.parse(lsGet(LADDER_KEY) || "null");
    if (!s || s.v !== 1 || !s.rungs || typeof s.rungs !== "object") return fresh;
    var out = { v: 1, rungs: {}, lastSide: s.lastSide === 1 ? 1 : -1,
                day: typeof s.day === "string" ? s.day.slice(0, 10) : "",
                days: Math.max(0, Math.min(99999, s.days | 0)), bestDays: Math.max(0, Math.min(99999, s.bestDays | 0)) };
    Rating.LEVELS.forEach(function (L) {
      var r = s.rungs[L.id];
      if (!r || typeof r !== "object") return;
      var st = Array.isArray(r.stars) ? r.stars : [];
      out.rungs[L.id] = { w: Math.max(0, r.w | 0), d: Math.max(0, r.d | 0), l: Math.max(0, r.l | 0),
                          stars: [st[0] ? 1 : 0, st[1] ? 1 : 0, st[2] ? 1 : 0] };
    });
    return out;
  } catch (e) { return fresh; }
}
function saveLadder() { lsSet(LADDER_KEY, JSON.stringify(ladder)); }
function rungOf(id) {
  if (!ladder.rungs[id]) ladder.rungs[id] = { w: 0, d: 0, l: 0, stars: [0, 0, 0] };
  return ladder.rungs[id];
}
function starCount(id) { var r = ladder.rungs[id]; return r ? r.stars[0] + r.stars[1] + r.stars[2] : 0; }
function starsHTML(id) {
  var r = ladder.rungs[id], h = "";
  for (var i = 0; i < 3; i++) h += '<i class="' + (r && r.stars[i] ? "on" : "") + '">★</i>';
  return h;
}
/* a day you play is a day on the streak — a lesson counts as much as a game */
function dayKey(t) {
  var d = new Date(t);
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}
function markDay() {
  var now = Date.now(), today = dayKey(now), yest = dayKey(now - 86400000);
  if (ladder.day === today) return;
  ladder.days = ladder.day === yest ? ladder.days + 1 : 1;
  ladder.bestDays = Math.max(ladder.bestDays, ladder.days);
  ladder.day = today;
  saveLadder();
}
function streakDays() {
  var now = Date.now();
  return (ladder.day === dayKey(now) || ladder.day === dayKey(now - 86400000)) ? ladder.days : 0;
}
function ratingText() {
  var sm = Rating.summary(rating);
  return sm.rating + (sm.provisional ? "?" : "");
}
/* who to play next: a fair fight — and while the room is still finding
   your level, a slightly gentle one */
/* who you may play. The road decides (journey.js): the first coach, any
   you have beaten, and the next one along. The fair fight the rating
   suggests is offered only if it is open; otherwise the coach to beat. */
function coachOpen(id) { return !!SKILLS[id] && (typeof Journey === "undefined" || Journey.coachOpen(ladder, id, jrn)); }
function nextLevel() {
  var s = skillOk(Rating.suggestLevel(rating));
  return typeof Journey === "undefined" ? s : Journey.clampCoach(ladder, s, jrn);
}
/* why a coach is still a shadow, without giving away who the shadows
   are: the one to beat is named only if you can already play them */
function lockWhy(id) {
  var by = Journey.openedBy(id), ch = Journey.chapterOf(id);
  return by && coachOpen(by) ? { short: "Beat " + SKILLS[by].name + " to unlock", html: "🔒 Beat " + SKILLS[by].emoji + " <b>" + escHtml(SKILLS[by].name) + "</b> to unlock the next coach." }
                             : { short: "Chapter " + ch.n + " · further up the road", html: "🔒 Further up the road. Beat <b>" + escHtml(SKILLS[Journey.frontier(ladder)].name) + "</b> first." };
}
/* a coach just unlocked and never played yet: it says NEW! until you do */
function rungNew(id) {
  var r = ladder.rungs[id];
  return levelIndex(id) > 0 && coachOpen(id) && !(r && r.w + r.d + r.l) && !Journey.cleared(ladder, id);
}
/* and where you may sit: the park from the start, every other place
   once the road has reached it */
function placeOpen(id) { return typeof Journey === "undefined" || Journey.placeOpen(ladder, id, jrn); }
function placeGuard() { if (!placeOpen(prefs.scene)) setScene("park"); }
/* a locked coach, asked for: a shadow behind a padlock, who to beat to
   meet them, and a button straight to that game */
function coachLocked(id) {
  var by = Journey.openedBy(id) || Journey.frontier(ladder), B = SKILLS[by], ch = Journey.chapterOf(id);
  var play = coachOpen(by) ? by : Journey.frontier(ladder), P = SKILLS[play];
  var url = typeof Avatar !== "undefined" && Avatar.portrait ? Avatar.portrait(id, 160) : "";
  hap("nope");
  var away = levelIndex(id) - levelIndex(play);
  ask('<div class="lockCard"><span class="lkPic">' + (url ? '<img alt="" src="' + url + '">' : "<em>?</em>") +
      '<i class="lkPad" aria-hidden="true">🔒</i></span>' +
      "<b>Chapter " + ch.n + " is still locked</b>" +
      (coachOpen(by)
        ? "<p>Someone is waiting further up the road. Beat " + B.emoji + " <b>" + escHtml(B.name) + "</b> to unlock " + escHtml(ch.title) + " and meet them.</p>"
        : "<p>Someone is waiting " + away + " chapters up the road. Beat " + P.emoji + " <b>" + escHtml(P.name) + "</b> first, and keep going.</p>") +
      "</div>",
    [{ label: "▶ Play " + P.name, fn: function () { quickPlay(play); } },
     { label: "🗺️ See the road", ghost: true, fn: function () { openJourney(); } },
     { label: "Not now", ghost: true, fn: function () {} }]);
}
function levelIndex(id) {
  for (var i = 0; i < Rating.LEVELS.length; i++) if (Rating.LEVELS[i].id === id) return i;
  return -1;
}
function humanMovesMade() {
  if (!G || mode !== "coach") return 0;
  var n = 0;
  for (var i = 0; i < G.played.length; i++) if (notationSideOf(i) === humanSide) n++;
  return n;
}
/* Walking away from a rated game you are losing is the oldest way to
   keep a number up, so a game that is properly under way counts as a
   resignation if you start another. Before your third move it is free:
   a misclick on the colour, a change of heart about the opponent. */
/* Starting over is free while a game is young and level. It counts as a
   loss once the game is properly under way, or once you are clearly
   losing — the two moments walking away would be a way of keeping a
   number up rather than of starting fresh. */
var ABANDON_PLIES = 20, ABANDON_EVAL = -300;
function ratedAtStake() {
  if (mode === "coach" && G && !over && !ratedDone)
    return humanMovesMade() >= 3 && (G.played.length >= ABANDON_PLIES || lastEval <= ABANDON_EVAL);
  /* a rated game left on the shelf while you did a lesson is still a game */
  var sv = mode !== "coach" ? loadSave() : null;
  return !!(sv && sv.mode === "coach" && sv.fr !== 1 && !sv.fen && savedHumanMoves(sv) >= 3 && sv.sans.length >= ABANDON_PLIES);
}
function savedHumanMoves(sv) { var n = sv.sans.length; return sv.humanSide === 1 ? Math.ceil(n / 2) : Math.floor(n / 2); }
/* resigning the shelved game: counted against the coach it was against */
function settleSaved(sv) {
  var a = Array.isArray(sv.assist) ? sv.assist : [0, 0];
  rating = Rating.load(lsGet);
  var out = Rating.update(rating, { level: sv.skill, result: 0, accuracy: null, at: Date.now(),
                                    assisted: { takebacks: a[0] | 0, hints: a[1] | 0, wheels: a[2] | 0 } });
  if (out.rated) { rating = out.state; Rating.save(rating, lsSet); }
  rungOf(sv.skill).l++; markDay(); saveLadder();
  lsDel(SAVE_KEY);
  return { out: out };
}
function leaveGameThen(fn, verb) {
  if (!ratedAtStake()) { fn(); return; }
  var why = (mode === "coach" && lastEval <= ABANDON_EVAL && G && !over) ? "You're behind in a rated game" : "This rated game is well under way";
  ask(why + " — " + (verb || "starting another") + " now counts as a loss.<br><b>Resign and go on?</b>",
    [{ label: "🏳️ Resign & go on", fn: function () {
        /* the game may have ended while the question was up */
        if (!ratedAtStake()) { fn(); return; }
        var live = mode === "coach" && G && !over;
        var sv0 = live ? null : loadSave();
        var out = live ? settleRating("resign") : settleSaved(sv0);
        journalResigned(sv0);
        if (live) over = { result: humanSide === 1 ? "black" : "white", reason: "you resigned" };
        lsDel(SAVE_KEY);
        fn();
        if (out) toast("Counted as a loss (" + fmtDelta(out.out.delta) + "). On to the next one.", null, 3800);
      } },
     { label: "Keep playing", ghost: true, fn: function () { hideAllOverlays(); } }]);
}
function fmtDelta(d) { d = Math.round(d); return (d > 0 ? "+" : d < 0 ? "−" : "±") + Math.abs(d); }

/* start a game against the computer. "a" takes turns: the colour you did
   not have last time */
function startCoachGame(level, sideChoice, clockStr, o) {
  /* the last gate: every way into a coach game comes through here */
  if (!coachOpen(skillOk(level))) { showMenu(); coachLocked(skillOk(level)); return; }
  var side = sideChoice === "w" ? 1 : sideChoice === "b" ? -1 :
             sideChoice === "r" ? (Math.random() < 0.5 ? 1 : -1) : -ladder.lastSide;
  ladder.lastSide = side; saveLadder();
  startGame("coach", { humanSide: side, skill: skillOk(level), clockStr: clockStr || "none", fresh: true, friendly: !!(o && o.friendly) });
  var L = SKILLS[skill];
  if (friendly) {
    toast("🤝 <b>A friendly game</b> with " + L.emoji + " " + escHtml(L.name) + ": they go easy, and nothing is rated. " +
          (side === 1 ? "You have White." : "You have Black."), null, paceWords(4200));
    setTimeout(function () { if (friendly && !over) castSay("friendly", "happy"); }, 900);
    return;
  }
  toast(L.emoji + " <b>" + escHtml(L.name) + "</b> · " + L.elo + " — " +
        (side === 1 ? "you have White. Your move." : "you have Black; " + escHtml(L.name) + " opens."), null, 3200);
}
function quickPlay(level) {
  level = level || nextLevel();
  if (!coachOpen(level)) { coachLocked(level); return; }
  leaveGameThen(function () { startCoachGame(level, "a", "none"); }, "a new game");
}

/* ---- counting a game ---- */
function settleRating(result) {
  if (mode !== "coach" || ratedDone || !G || G.startFen) return null;
  ratedDone = true;
  var s = result === "draw" ? 0.5 : result === "resign" ? 0 :
          ((result === "white") === (humanSide === 1) ? 1 : 0);
  var clean = !assist.takebacks && !assist.hints && !assist.wheels;
  /* read back first: another tab may have played a game since this one loaded */
  rating = Rating.load(lsGet);
  var out = Rating.update(rating, { level: skill, result: s, accuracy: null, at: Date.now(),
                                    assisted: { takebacks: assist.takebacks, hints: assist.hints, wheels: assist.wheels | 0 } });
  if (!out.rated) return null;
  rating = out.state;
  Rating.save(rating, lsSet);
  var rung = rungOf(skill), newStars = [];
  if (s === 1) rung.w++; else if (s === 0) rung.l++; else rung.d++;
  if (s === 1 && !rung.stars[0]) { rung.stars[0] = 1; newStars.push(0); }
  if (s === 1 && clean && !rung.stars[1]) { rung.stars[1] = 1; newStars.push(1); }
  markDay();
  saveLadder();
  return { out: out, s: s, clean: clean, newStars: newStars, level: skill };
}

/* ---- looking back over your moves ----
   The accuracy is the same like-for-like comparison the gentle coach
   already makes after each of your moves — the move you played against
   the move the engine wanted, scored by the same call — so anything the
   coach already looked at is reused rather than thought about twice. */
function humanPlies() {
  var out = [];
  for (var i = 0; i < G.played.length; i++) if (notationSideOf(i) === humanSide) out.push(i);
  return out;
}
function analyseGame(onStep) {
  var ticket = gameTicket, plies = humanPlies(), got = [], i = 0;
  return new Promise(function (resolve) {
    function next() {
      if (ticket !== gameTicket || !G) { resolve(null); return; }
      if (i >= plies.length) { resolve(got); return; }
      var ply = plies[i];
      if (reviewMemo[ply]) { got.push({ ply: ply, best: reviewMemo[ply].best, played: reviewMemo[ply].played }); i++; onStep(i, plies.length); setTimeout(next, 0); return; }
      var pre = Chess.create(G.startFen);
      for (var k = 0; k < ply; k++) Chess.play(pre, G.played[k].m);
      var want = G.played[ply].m, mine = null, list = Chess.moves(pre);
      for (var j = 0; j < list.length; j++) {
        if (list[j].from === want.from && list[j].to === want.to && (list[j].promo || 0) === (want.promo || 0)) { mine = list[j]; break; }
      }
      if (!mine) { i++; next(); return; }
      /* the accuracy table was fitted with a reviewer of this depth */
      Brain.review(pre, mine, { ms: 900, maxDepth: Rating.REVIEW_DEPTH, depth: Rating.REVIEW_DEPTH }).then(function (res) {
        if (ticket !== gameTicket) { resolve(null); return; }
        if (res) { reviewMemo[ply] = reviewEntry(pre, mine, res); got.push({ ply: ply, best: res.bestScore, played: res.playedScore }); }
        i++; onStep(i, plies.length); next();
      });
    }
    next();
  });
}
/* the same three words the coach uses during the game, counted */
function qualityCounts(moves) {
  var c = { blunder: 0, mistake: 0, inaccuracy: 0 };
  moves.forEach(function (e) {
    if (e.best < -650 || e.played > 650) return;       /* already decided: nothing to count */
    var loss = e.best - e.played;
    if (loss >= 250) c.blunder++; else if (loss >= 110) c.mistake++; else if (loss >= 50) c.inaccuracy++;
  });
  var good = 0, brilliant = 0;
  Object.keys(marks).forEach(function (k) {
    if (notationSideOf(+k) !== humanSide) return;
    if (marks[k] === "!!") brilliant++; else if (marks[k] === "!") good++;
  });
  c.brilliant = brilliant; c.good = good;
  return c;
}

/* ---- the reveal ----
   The result is the headline, so the number moves first and on its own;
   then the stars land one at a time; then the look-back fills its bar
   while it works, which is the honest way to show a computer thinking. */
function countUp(el, from, to, ms, onTick) {
  if (typeof Fx !== "undefined" && Fx.countUp) return Fx.countUp(el, from, to, { ms: ms, onTick: onTick });
  return new Promise(function (resolve) {
    if (REDUCED || from === to) { el.textContent = Math.round(to); resolve(); return; }
    var t0 = performance.now(), last = -1, n = Math.abs(Math.round(to) - Math.round(from));
    (function step(t) {
      var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      var v = Math.round(from + (to - from) * e);
      el.textContent = v;
      var i = Math.round(e * n);
      if (i !== last && onTick) { last = i; onTick(i, n, v); }
      if (k < 1) requestAnimationFrame(step); else resolve();
    })(t0);
  });
}
function sting(kind, o) {
  if (!prefs.sound || typeof Sound === "undefined") return;
  if (Sound.sting) Sound.sting(kind, o || {}); else Sound.ui(kind);
}
function popStar(i, live) {
  var el = $("endStars").children[i];
  if (!el) return;
  el.classList.add("on");
  if (live && !live()) return;
  el.classList.add("pop");
  sting("lesson-right");                 /* each star lands with the ding of a right answer */
  hap("star");
  if (FX) Fx.sparkle(el, { count: 18 });
}
function renderEndRating(rs, cardAt) {
  var box = $("endRate"), myGame = gameTicket;
  /* what is earned is kept whatever happens; what is shown and heard
     only happens while this game's card is the one on screen */
  var live = function () { return myGame === gameTicket && !$("ovEnd").classList.contains("hide") && !beatsOn; };
  box.classList.toggle("hide", !rs);
  $("endNext").classList.add("hide");
  milesReset(cardAt, rs);
  homeOnEnd(rs);
  if (!rs) return;
  var out = rs.out, before = Math.round(out.before), after = Math.round(out.after);
  $("endRateNum").textContent = before;
  var dEl = $("endRateDelta");
  dEl.className = "erDelta " + (after > before ? "up" : after < before ? "down" : "flat");
  dEl.textContent = fmtDelta(after - before) + (out.provisional ? " ?" : "");
  var t = Rating.title(after);
  $("endRateTitle").textContent = t.emoji + " " + t.name + (out.provisional ? " · still finding your level" : "") +
    (out.weight < 1 ? " · counted as " + Math.round(out.weight * 100) + "% of a game (" + (assist.wheels ? (assist.hints || assist.takebacks ? "help and training wheels" : "training wheels") : "hints or take-backs") + ")" : "");
  var stars = $("endStars").children, rung = rungOf(rs.level);
  for (var i = 0; i < 3; i++) {
    var already = rung.stars[i] && rs.newStars.indexOf(i) < 0;
    stars[i].className = already ? "on" : "";
  }
  $("endAccTx").textContent = "Looking back over your moves…";
  $("endAccNum").textContent = "";
  $("endAccBar").style.width = "0%";
  $("endCounts").innerHTML = "";

  /* what to do next is part of the result */
  var idx = levelIndex(rs.level), up = Rating.LEVELS[idx + 1], down = Rating.LEVELS[idx - 1];
  var me = after;
  if (rs.s === 1 && up) {
    $("endNextTx").textContent = "Next: " + up.emoji + " " + up.name + " · " + up.elo;
    $("endNextSub").textContent = rs.newStars.indexOf(0) >= 0 && Journey.openedBy(up.id) === rs.level && !(jrn && jrn.open && jrn.open[up.id])
      ? "🔓 Just unlocked! You beat " + SKILLS[rs.level].name + " — come and meet them."
      : "You beat " + SKILLS[rs.level].name + " — the next coach up is waiting.";
    $("endNext").onclick = function () { $("ovEnd").classList.add("hide"); startCoachGame(up.id, "a", clockStrOf()); };
    $("endNext").classList.remove("hide");
  } else if (rs.s === 0 && down && SKILLS[rs.level].elo - me > 220) {
    $("endNextTx").textContent = "Try " + down.emoji + " " + down.name + " · " + down.elo;
    $("endNextSub").textContent = "A step down the ladder is how everyone climbs it.";
    $("endNext").onclick = function () { $("ovEnd").classList.add("hide"); startCoachGame(down.id, "a", clockStrOf()); };
    $("endNext").classList.remove("hide");
  } else goalOnEndCard();

  /* the choreography, once the card is up */
  var startAt = REDUCED ? 120 : (cardAt || 1100) + paceCardMs(450);
  setTimeout(function () {
    if (!over || $("ovEnd").classList.contains("hide")) {
      $("endRateNum").textContent = after; dEl.classList.add("show");
      rs.newStars.forEach(function (si) { popStar(si, live); });
      return;
    }
    countUp($("endRateNum"), before, after, Math.min(1600, 500 + Math.abs(after - before) * 14), function (k, n) {
      if (prefs.sound && typeof Sound !== "undefined" && Sound.countTick && live()) Sound.countTick(k, n, after >= before);
      if (live()) hap("count");
    }).then(function () {
      dEl.classList.add("show");
      if (live()) sting(after > before ? "rating-up" : after < before ? "rating-down" : "tap");
      if (live() && after > before) hap("success");
      rs.newStars.forEach(function (si, k) { setTimeout(function () { popStar(si, live); }, 380 + k * 420); });
      var mile = out.milestone, up2 = out.levelUp && Rating.levelById(out.next);
      if (mile || up2) {
        setTimeout(function () {
          if (myGame !== gameTicket) return;
          var was = out.levelUp && Rating.levelById(out.levelUp);
          /* the number's own milestone heads the stack, whatever else this game did */
          if (mile) pushMile(escHtml(mile.emoji || "🏅"), escHtml((mile.kind === "settled" ? "Your rating has settled" :
                                  mile.kind === "best" ? "A new personal best" : "You're now: " + mile.name) +
                                  " — " + Math.round(mile.rating || after)), { first: true, sting: "milestone", hap: "success", big: true });
          else pushMile("🌱", escHtml("You've outgrown " + was.emoji + " " + was.name + " — " + up2.emoji + " " + up2.name + " is next."),
                        { first: true, sting: "levelup", hap: "success", big: true });
        }, 500 + rs.newStars.length * 420);
      }
    });
  }, startAt);

  /* and the look-back, alongside (kept in endLook for the beats too) */
  endLook = { ticket: myGame, done: false, k: 0, n: 0, acc: null, perf: null, counts: null, moves: 0, third: false };
  analyseGame(function (k, n) {
    if (endLook.ticket === myGame) { endLook.k = k; endLook.n = n; }
    $("endAccBar").style.width = Math.round(k / Math.max(1, n) * 100) + "%";
    $("endAccTx").textContent = "Looking back over your moves… " + k + "/" + n;
  }).then(function (moves) {
    if (!moves || myGame !== gameTicket) return;
    if (!moves.length) { endLook.done = true; $("endAccTx").textContent = "No moves of yours to look back on."; $("endAccBar").style.width = "0%"; return; }
    var acc = Rating.gameAccuracy(moves);
    var c = qualityCounts(moves);
    endLook.counts = c; endLook.moves = moves.length; endLook.acc = acc;
    if (acc == null) {
      /* a handful of moves is not a game's worth of evidence: say so,
         and still say what the moves were */
      endLook.done = true;
      $("endAccTx").textContent = "Too short to measure — accuracy needs " + (Rating.ACCURACY_MIN_MOVES || 8) + " moves of your own after the opening.";
      $("endAccBar").style.width = "0%";
      $("endCounts").innerHTML = countChips(c);
      return;
    }
    /* taking what is handed to you is the best move and an easy one, so a
       game's estimate is held within reach of the coach it was against */
    var perf = Math.min(Rating.perfFromAccuracy(acc), SKILLS[rs.level].elo + (Rating.PERF_ABOVE || 400));
    rememberAccuracy(acc, perf);
    endLook.perf = moves.length >= 10 ? perf : null;
    endLook.third = rs.s === 1 && rs.clean && acc >= 80 && !rungOf(rs.level).stars[2];
    endLook.done = true;
    setTimeout(function () {
      /* a performance read off four moves is a guess, so it waits for a game */
      $("endAccTx").innerHTML = moves.length >= 10 ? "Accuracy · you played like <b>~" + Math.round(perf) + "</b>" : "Accuracy";
      countUp($("endAccNum"), 0, Math.round(acc), REDUCED ? 0 : 900).then(function () { $("endAccNum").textContent = Math.round(acc) + "%"; });
      $("endAccBar").style.width = Math.round(acc) + "%";
      $("endCounts").innerHTML = countChips(c);
      /* the third star is the hard one: a win, on your own, played well */
      var rung = rungOf(rs.level);
      if (rs.s === 1 && rs.clean && acc >= 80 && !rung.stars[2]) {
        rung.stars[2] = 1; saveLadder();
        unlBonus("A third star", 40);
        setTimeout(function () { popStar(2, live); }, 700);
      }
      /* and a win that good, at a quick player's pace, opens the road ahead */
      if (rs.s === 1 && rs.clean && acc >= 80) paceFastTrack(rs.level, acc);
      progressAfterLook(rs, acc, c);
    }, REDUCED ? 0 : startAt + paceCardMs(1700));
  });
}
function countChips(c) {
  var chips = [];
  if (c.brilliant) chips.push('<span><b class="k" style="color:var(--blue)">!!</b>' + c.brilliant + " brilliant</span>");
  if (c.good) chips.push('<span><b class="k" style="color:var(--good)">!</b>' + c.good + " great</span>");
  if (c.inaccuracy) chips.push('<span><b class="k">?!</b>' + c.inaccuracy + " inaccurac" + (c.inaccuracy > 1 ? "ies" : "y") + "</span>");
  if (c.mistake) chips.push('<span><b class="k" style="color:var(--amber)">?</b>' + c.mistake + " mistake" + (c.mistake > 1 ? "s" : "") + "</span>");
  if (c.blunder) chips.push('<span><b class="k" style="color:var(--bad)">??</b>' + c.blunder + " blunder" + (c.blunder > 1 ? "s" : "") + "</span>");
  if (!chips.length) chips.push("<span>✨ not a single slip</span>");
  return chips.join("");
}
/* the look-back finishes after the game has been counted, so its
   accuracy is written onto the record afterwards */
function rememberAccuracy(acc, perf) {
  /* read back first, as settleRating does: another tab may have written since */
  rating = Rating.annotateLast(Rating.load(lsGet), { acc: acc, perf: perf });
  Rating.save(rating, lsSet);
  journalAccuracy(acc, perf);
}

/* ---- the lobby ---- */
function sparkPath(vals, w, h, pad) {
  if (vals.length < 2) return null;
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  if (hi - lo < 40) { var mid = (hi + lo) / 2; lo = mid - 20; hi = mid + 20; }
  var pts = vals.map(function (v, i) {
    return [pad + (w - 2 * pad) * i / (vals.length - 1), h - pad - (h - 2 * pad) * (v - lo) / (hi - lo)];
  });
  return { pts: pts, lo: lo, hi: hi,
           d: "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L") };
}
function renderLobby() {
  syncWelcome();
  var sm = Rating.summary(rating), t = sm.title;
  var num = $("mRateNum"), streak = streakDays();
  if (!sm.games) {
    num.textContent = "—";
    $("mRateTitle").textContent = "Not rated yet";
    $("mRateSub").textContent = "Play the computer — your first game sets your starting point.";
    $("mRateSpark").innerHTML = "";
    $("mRateSpark").classList.add("hide");
  } else {
    $("mRateSpark").classList.remove("hide");
    num.innerHTML = sm.rating + (sm.provisional ? '<span class="prov">?</span>' : "");
    $("mRateTitle").textContent = t.emoji + " " + t.name;
    var bits = [sm.games + (sm.games === 1 ? " game" : " games")];
    if (sm.best) bits.push("best " + sm.best);
    if (streak > 1) bits.push("🔥 " + streak + "-day streak");
    else if (sm.provisional) bits.push("still finding your level");
    $("mRateSub").textContent = bits.join(" · ");
    var hist = (sm.history || []).slice(-24).map(function (e) { return e.r; });
    var sp = sparkPath(hist, 100, 34, 3);
    $("mRateSpark").innerHTML = sp ? '<path class="area" d="' + sp.d + " L97 31 L3 31 Z" + '"></path><path d="' + sp.d + '"></path>' +
      '<circle r="2.6" cx="' + sp.pts[sp.pts.length - 1][0] + '" cy="' + sp.pts[sp.pts.length - 1][1] + '"></circle>' : "";
  }
  var nl = nextLevel(), L = SKILLS[nl];
  $("mPlaySub").textContent = !sm.games ? "A gentle first game against " + L.emoji + " " + L.name + "."
    : skillOk(Rating.suggestLevel(rating)) !== nl
      ? "Next on the road: " + L.emoji + " " + L.name + " · " + L.elo + " — beat them to unlock the next coach."
      : "Next up: " + L.emoji + " " + L.name + " · " + L.elo + " — a fair fight for you.";
  /* the ladder strip */
  var lad = $("mLadder");
  lad.innerHTML = "";
  var total = 0;
  Rating.LEVELS.forEach(function (Lv) {
    var b = document.createElement("button"), r = ladder.rungs[Lv.id], n = starCount(Lv.id);
    total += n;
    var shut = !coachOpen(Lv.id), fresh = !shut && rungNew(Lv.id);
    b.className = "rung" + (Lv.id === nl ? " next" : "") + (r && r.stars[0] ? " done" : "") + (shut ? " locked" : "") + (fresh ? " fresh" : "");
    b.setAttribute("role", "listitem");
    b.setAttribute("aria-label", shut ? "Locked coach: " + lockWhy(Lv.id).short
                                      : "Play " + Lv.name + ", rated " + Lv.elo + ", " + n + " of 3 stars");
    b.innerHTML = shut
      ? '<span class="rgE">' + Lv.emoji + '</span><b>???</b><span class="rgElo">🔒</span><span class="rgStars"></span>'
      : '<span class="rgE">' + Lv.emoji + "</span><b>" + escHtml(Lv.name) + '</b><span class="rgElo">' + Lv.elo +
        '</span><span class="rgStars">' + starsHTML(Lv.id) + "</span>" + homeLadderChip(Lv.id) + unlRungPeek(Lv.id) +
        (fresh ? '<span class="rgTag new">NEW!</span>' : Lv.id === nl ? '<span class="rgTag">next</span>' : (n === 3 ? '<span class="rgTag">mastered</span>' : ""));
    b.addEventListener("click", function () { quickPlay(Lv.id); });
    lad.appendChild(b);
  });
  castLadderFaces(lad);
  var opened = Rating.LEVELS.filter(function (Lv) { return coachOpen(Lv.id); }).length;
  $("mLadderNote").textContent = (total ? total + " of " + Rating.LEVELS.length * 3 + " stars" : "Beat each coach to earn its stars") +
    (opened < Rating.LEVELS.length ? " · " + opened + " of " + Rating.LEVELS.length + " coaches unlocked — beat one to meet the next"
                                   : " — tap a coach to play it");
  /* bring the coach you're up against next into view */
  var nx = lad.querySelector(".rung.next");
  if (nx) lad.scrollLeft = Math.max(0, nx.offsetLeft - 8 - (lad.clientWidth - nx.offsetWidth) / 3);
  renderGoal();
}

/* ---- your record ---- */
function showProfile() {
  hideAllOverlays();
  var sm = Rating.summary(rating), t = sm.title;
  $("pfRate").textContent = sm.games ? sm.rating + (sm.provisional ? "?" : "") : "—";
  $("pfRd").textContent = sm.games ? (sm.provisional ? "provisional — a few more games to settle it" : "give or take " + 2 * sm.rd) : "no games yet";
  $("pfTitle").textContent = t.emoji + " " + t.name;
  if (t.next) {
    var span = t.next.floor - t.floor, k = Math.max(0, Math.min(1, (sm.rating - t.floor) / span));
    $("pfNext").textContent = Math.max(1, t.next.floor - sm.rating) + " to " + t.next.emoji + " " + t.next.name;
    setTimeout(function () { $("pfBar").style.width = Math.round(k * 100) + "%"; }, 60);
  } else { $("pfNext").textContent = "the top of the scale"; $("pfBar").style.width = "100%"; }
  /* the chart */
  var hist = (sm.history || []).slice(-60).map(function (e) { return e.r; });
  var ch = $("pfChart");
  if (hist.length >= 2) {
    var sp = sparkPath(hist, 320, 120, 10), g = "";
    for (var gi = 0; gi < 4; gi++) { var y = 10 + gi * 100 / 3; g += '<line class="grid" x1="0" x2="320" y1="' + y + '" y2="' + y + '"></line>'; }
    ch.innerHTML = g + '<path class="area" d="' + sp.d + " L310 110 L10 110 Z" + '"></path><path class="line" d="' + sp.d + '"></path>' +
      '<text x="6" y="12">' + Math.round(sp.hi) + '</text><text x="6" y="116">' + Math.round(sp.lo) + "</text>";
  } else {
    ch.innerHTML = '<text x="160" y="64" text-anchor="middle">your rating will draw itself here, game by game</text>';
  }
  var accAvg = sm.recentAccuracy != null ? Math.round(sm.recentAccuracy) + "%" : "—";
  var stars = 0;
  Rating.LEVELS.forEach(function (L) { stars += starCount(L.id); });
  $("pfStats").innerHTML = [
    [sm.games || 0, "games"], [sm.wins + "·" + sm.draws + "·" + sm.losses, "W · D · L"],
    [sm.best || "—", "best"], [accAvg, "accuracy"],
    [streakDays() || 0, "day streak"], [ladder.bestDays || 0, "longest"],
    [stars + "/" + Rating.LEVELS.length * 3, "stars"], [sm.streak.kind === "win" ? sm.streak.n : 0, "win run"]
  ].map(function (x) { return "<div><b>" + x[0] + "</b><span>" + x[1] + "</span></div>"; }).join("");
  var list = $("pfLadder");
  list.innerHTML = "";
  Rating.LEVELS.forEach(function (L) {
    var r = ladder.rungs[L.id] || { w: 0, d: 0, l: 0 };
    var b = document.createElement("button"), shut = !coachOpen(L.id);
    b.className = "rungRow" + (shut ? " locked" : "");
    b.innerHTML = shut
      ? '<span class="rgE">🔒</span><span class="rgT"><b>???</b><small>' + escHtml(lockWhy(L.id).short) + '</small></span><span class="rgElo"></span><span class="rgStars"></span>'
      : '<span class="rgE">' + L.emoji + '</span><span class="rgT"><b>' + escHtml(L.name) + "</b><small>" +
      (r.w + r.d + r.l ? r.w + " won · " + r.d + " drawn · " + r.l + " lost" : escHtml(SKILLS[L.id].short)) + '</small></span><span class="rgElo">' + L.elo +
      '</span><span class="rgStars">' + starsHTML(L.id) + "</span>";
    b.addEventListener("click", function () { quickPlay(L.id); });
    list.appendChild(b);
  });
  showProfileTab(profileTab);
  $("ovProfile").classList.remove("hide");
}

/* ===== progression: the journal, the feats, the next step =====
   games.js, feats.js and goals.js hold the rules and are checked in
   node; this block only hands them the board and puts what they say on
   the cards. Three promises hold it together: every number is a fact
   about chess or about turning up; a thing is said once, at the moment,
   and then kept on your record; and games with people count as play —
   kept in the journal, a day on the streak, feats if you earn them —
   but never as rating. */
var lowEval = 0;                    /* the coach's worst word on the position this game, from your side */
var featPly = {};                   /* ply → what the teaching eyes saw in that move of yours */
var currentGameId = null;           /* the journal's id for the game just finished */
var keptGame = null, reviewNames = null;   /* a kept game, open on the board */
var profileTab = "record", gamesShown = 10, featsAll = false, FEATS_AHEAD = 6;
var miles = { ticket: -1, next: 0, n: 0, reserved: false, stung: false };

function progressNewGame() { lowEval = 0; featPly = {}; currentGameId = null; keptGame = null; reviewNames = null; }
function trackLow() { if (lastEval < lowEval) lowEval = lastEval; }
/* your own move, looked at while the position is still the one before
   it: the teacher may be quiet (the coach's voice off), but its eyes
   are still what can tell a fork from a lucky capture */
function featMove(m, mover, source, lessons) {
  var mine = mode === "coach" ? mover === humanSide : mode === "lan" ? source === "local" : false;
  if (!mine || !G) return;
  try { featPly[G.played.length] = Feats.onMove({}, m, prefs.coach ? lessons : Teach.afterMove(G, m)); } catch (e) {}
}

/* ---- the end card's stack: at most three lines, one sting ---- */
function milesReset(cardAt, rs) {
  var box = $("endMiles");
  box.innerHTML = ""; box.classList.add("hide");
  var em = $("endNext").querySelector(".em");
  if (em) em.textContent = "⬆️";
  /* a rated game reveals its number and stars first; what else the game
     did waits until they have landed */
  var after = REDUCED ? 150 : (cardAt || 1100) + paceCardMs(rs ? 3000 + rs.newStars.length * 420 : 700);
  /* and the number's own milestone, when there is one, keeps its place
     at the top of the stack whatever arrives before it */
  var reserved = !!(rs && rs.out && (rs.out.milestone || (rs.out.levelUp && rs.out.next)));
  milesFlush(true);
  miles = { ticket: gameTicket, next: Date.now() + after, n: reserved ? 1 : 0, reserved: reserved, stung: false, q: [] };
}
function pushMile(icon, html, o) {
  o = o || {};
  if (miles.ticket !== gameTicket) return false;
  if (o.first && miles.reserved) miles.reserved = false;
  else { if (miles.n >= 3) return false; miles.n++; }
  var now = Date.now(), at = o.first ? now : Math.max(now, miles.next), my = miles.ticket;
  if (!o.first) miles.next = at + paceCardMs(500);
  var job = { fn: function () {
    if (my !== gameTicket || !over) return;
    var box = $("endMiles"), line = document.createElement("div");
    line.className = "erMile" + (o.cls ? " " + o.cls : "");
    line.innerHTML = '<span class="em">' + icon + "</span> " + html;
    if (o.first) box.insertBefore(line, box.firstChild); else box.appendChild(line);
    box.classList.remove("hide");
    /* kept for when the card comes back, but only heard while it is up
       (and not while the beats are telling it, one at a time) */
    if ($("ovEnd").classList.contains("hide") || beatsOn) return;
    if (!miles.stung) { miles.stung = true; sting(o.sting || "lesson-right"); }
    hap(o.hap || "star");
    if (FX) {
      Fx.sparkle(line, { count: 14 });
      if (o.big) { Fx.confetti({ ms: 3200, layer: "page" }); Fx.fireworks({ count: 2, layer: "page" }); }
    }
  } };
  var q = miles.q || (miles.q = []);
  job.t = setTimeout(function () { var i = q.indexOf(job); if (i >= 0) q.splice(i, 1); job.fn(); }, Math.max(0, at - now));
  q.push(job);
  return true;
}
/* the end card's lines, all at once: a tap on the card hurries the
   celebration along (and says something about the player's pace) */
function milesPending() { return !!(miles && miles.q && miles.q.length); }
function milesFlush(drop) {
  if (!miles || !miles.q) return;
  var q = miles.q.splice(0);
  q.forEach(function (j) { clearTimeout(j.t); if (!drop) j.fn(); });
  if (!drop) miles.next = Date.now();
}

/* ---- the journal ---- */
function journalEntry(result, reason) {
  var sans = G.played.map(function (r) { return r.san; });
  var mk = {};
  Object.keys(marks).forEach(function (k) { mk[k] = marks[k]; });
  return { at: Date.now(), mode: mode, skill: mode === "coach" ? skill : null,
           humanSide: mode === "coach" ? humanSide : mode === "lan" ? lanSide : 0,
           result: result, reason: reason, sans: sans,
           rv: Object.keys(reviewMemo).map(function (k) { return [+k, reviewMemo[k].best, reviewMemo[k].played]; }),
           marks: mk, eco: Games.openingOf(sans), opp: mode === "lan" ? lanOpp : null,
           clockStr: clockStrOf(), assist: [assist.takebacks, assist.hints],
           low: mode === "coach" ? lowEval : null };
}
function recordGame(e) {
  var r = Games.add(Games.load(lsGet), e);
  Games.save(r.state, lsSet);
  return r.id;
}
/* a rated game left by starting another is counted as a loss, so it is
   kept as one — from the board if it was live, from the shelf if not */
function journalResigned(sv) {
  try {
    if (sv) recordGame({ at: Date.now(), mode: "coach", skill: sv.skill, humanSide: sv.humanSide,
                         result: sv.humanSide === 1 ? "black" : "white", reason: "resigned by starting another game",
                         sans: sv.sans, assist: sv.assist, clockStr: sv.clockStr,
                         rv: sv.rv, low: typeof sv.lo === "number" ? sv.lo : null, eco: Games.openingOf(sv.sans) });
    else if (G && mode === "coach" && G.played.length) recordGame(journalEntry(humanSide === 1 ? "black" : "white", "resigned by starting another game"));
  } catch (e) {}
}
function journalAccuracy(acc, perf) {
  if (!currentGameId) return;
  Games.save(Games.annotate(Games.load(lsGet), currentGameId, { acc: acc, perf: perf }), lsSet);
}

/* ---- feats ---- */
function awardFeats(got) {
  if (!got || !got.length) return;
  unlBonus(got.length > 1 ? got.length + " feats" : "A feat", 30 * got.length);
  Feats.save(Feats.award(Feats.load(lsGet), got, Date.now(), currentGameId), lsSet);
  if (currentGameId) Games.save(Games.annotate(Games.load(lsGet), currentGameId, { feats: got }), lsSet);
  got.forEach(function (id) {
    var f = Feats.byId(id);
    if (!f) return;
    note({ ply: G && G.played.length ? G.played.length - 1 : null, icon: "🏅", tone: "good", key: "feat:" + id,
           text: "<b>Feat: " + escHtml(f.name) + "</b> — kept in your record.", brief: "Feat · " + escHtml(f.name) });
    /* the fourth and later still count — they wait on your record */
    pushMile(f.emoji, "<b>Feat:</b> " + escHtml(f.name), { cls: "feat", sting: "lesson-right" });
  });
}

/* ---- the next step ---- */
function goalCtx() {
  var lp = null, st = { due: 0 }, nx = null, solved = {};
  try { lp = Learn.load(); st = Learn.stats(lp); nx = Learn.next(lp); } catch (e) {}
  if (lp && lp.lessons) Object.keys(lp.lessons).forEach(function (k) { if (lp.lessons[k].solved > 0) solved[k] = 1; });
  var fd = Feats.load(lsGet);
  return { rating: rating, ladder: ladder, learn: { due: st.due }, lesson: nx ? { id: nx.id, title: nx.title } : null,
           feat: Feats.nextFor(fd, Rating.titleIndex(rating.r)), featsDone: fd.done, solved: solved };
}
function goalGo(a) {
  if (!a) return;
  if (a.type === "practise") { startPractice(); return; }
  if (a.type === "lesson") { var L = Learn.byId(a.id); if (L) startLesson(L, []); return; }
  var lv = a.level && coachOpen(a.level) ? a.level : nextLevel();
  leaveGameThen(function () { startCoachGame(lv, a.side || "a", "none"); }, "a new game");
}
function renderGoal() {
  var btn = $("mGoal");
  if (!btn) return;
  var g = null;
  try {
    var r = Goals.choose(Goals.load(lsGet), goalCtx(), dayKey(Date.now()));
    Goals.save(r.state, lsSet);
    g = r.goal;
  } catch (e) { g = null; }
  btn.classList.toggle("hide", !g);
  btn.parentNode.classList.toggle("withGoal", !!g);
  if (!g) return;
  $("mGoalEm").textContent = g.icon;
  $("mGoalTx").innerHTML = g.text;          /* goals.js escapes; only <b> rides along */
  btn.setAttribute("aria-label", "Next step: " + stripTags(g.text));
  btn.onclick = function () { goalGo(g.action); };
}
/* a game just ended: if the step the lobby named has been taken, say so
   once; and when the end card has no next coach to offer, offer the
   next step instead of nothing */
function goalAtEnd() {
  try {
    var said = Goals.settle(Goals.load(lsGet), goalCtx());
    if (said) { Goals.save(said.state, lsSet); if (said.text) pushMile("✓", escHtml(said.text.replace(/^✓\s*/, "")), { cls: "done", sting: "lesson-done", hap: "success" }); }
  } catch (e) {}
}
function goalOnEndCard() {
  var g = null;
  try { g = Goals.pick(goalCtx(), Goals.load(lsGet).skip); } catch (e) { g = null; }
  if (!g || g.kind === "play") return;     /* "Play again" already says that */
  $("endNext").querySelector(".em").textContent = g.icon;
  $("endNextTx").textContent = "Next: " + stripTags(g.text);
  $("endNextSub").textContent = "The nearest step from here.";
  $("endNext").onclick = function () { $("ovEnd").classList.add("hide"); goalGo(g.action); };
  $("endNext").classList.remove("hide");
}

/* ---- the moment a game ends ---- */
function progressAtEnd(result, reason, rs) {
  if (G && G.startFen) { notationAtEnd(); return; }
  if (!G || (mode !== "coach" && mode !== "pass" && mode !== "lan")) return;
  var plies = G.played.length;
  try {
    /* a game with people is a day you played, once it was properly a game */
    if ((mode === "pass" || mode === "lan") && plies >= ABANDON_PLIES) markDay();
    /* a rated game is kept from its first move; a game between people
       once both have moved */
    currentGameId = plies >= (mode === "coach" ? 1 : 2) ? recordGame(journalEntry(result, reason)) : null;
    /* the step the lobby pointed at comes first: it is why you played */
    if (rs) goalAtEnd();
    if (mode === "coach" || mode === "lan") {
      var flags = {};
      Object.keys(featPly).forEach(function (k) {
        if (+k < plies) for (var f in featPly[k]) flags[f] = 1;
      });
      awardFeats(Feats.onGame(Feats.load(lsGet), flags, {
        g: G, mode: mode, mySide: mode === "coach" ? humanSide : lanSide, result: result,
        low: mode === "coach" ? lowEval : null, level: skill, ladder: ladder, marks: marks, levels: Rating.LEVELS }));
    }
  } catch (e) { /* what the game did is a bonus; the game itself is already counted */ }
}
/* the look-back has measured the game: what only it can say */
function progressAfterLook(rs, acc, counts) {
  try {
    goalAtEnd();     /* the third star lands here */
    awardFeats(Feats.onAfter(Feats.load(lsGet), { mode: "coach", won: rs.s === 1, acc: acc, counts: counts, ladder: ladder }));
  } catch (e) {}
}

/* ---- the record's faces ----
   Each face is a .pftab and a .pfPane with the same data-tab; a face
   that draws itself registers here. Another face (your people, say)
   needs only its two elements and, if it draws, one line below. */
var PROFILE_TABS = { games: renderGamesTab, feats: renderFeatsTab };
function showProfileTab(name) {
  if (!document.querySelector('#pfTabs .pftab[data-tab="' + name + '"]')) name = "record";
  profileTab = name;
  [].forEach.call(document.querySelectorAll("#pfTabs .pftab"), function (b) {
    var on = b.getAttribute("data-tab") === name;
    b.classList.toggle("sel", on); b.setAttribute("aria-selected", on ? "true" : "false");
  });
  [].forEach.call(document.querySelectorAll("#ovProfile .pfPane"), function (p) {
    p.classList.toggle("hide", p.getAttribute("data-tab") !== name);
  });
  if (PROFILE_TABS[name]) PROFILE_TABS[name]();
}
function myName() { return (prefs.name && String(prefs.name).trim()) || "You"; }
function renderGamesTab() {
  var st = Games.load(lsGet), list = st.list.slice().reverse(), box = $("pfGamesList");
  $("pfGamesNote").textContent = list.length ? list.length + (list.length === 1 ? " game" : " games") + " kept · the last " + Games.MAX + " stay" : "";
  box.innerHTML = "";
  if (!list.length) {
    box.innerHTML = '<p class="pfEmpty">Every game you finish is kept here — against a coach, across the table, or with a friend nearby — to step back through, move by move, or copy out for anyone.</p>';
  }
  list.slice(0, gamesShown).forEach(function (e) {
    var n = Games.names(e, Rating.LEVELS, myName()), o = Games.outcome(e);
    var b = document.createElement("button");
    b.className = "gameRow";
    b.innerHTML = '<span class="rgE">' + escHtml(n.icon) + '</span><span class="rgT"><b>' +
      escHtml(e.mode === "pass" ? "Two players" : (e.mode === "lan" ? "Nearby · " : "") + n.who) +
      "</b><small>" + escHtml(Games.summaryLine(e)) + '</small></span><span class="gRes' +
      (/^(won|lost|drew)$/.test(o) ? " " + o : "") + '">' + escHtml(o) + "</span>";
    b.addEventListener("click", function () { openRecord(e); });
    box.appendChild(b);
  });
  $("pfGamesMore").classList.toggle("hide", list.length <= gamesShown);
  $("pfPgnAll").classList.toggle("hide", !list.length);
}
function renderFeatsTab() {
  var sm = Feats.summary(Feats.load(lsGet)), games = Games.load(lsGet), box = $("pfFeatsList");
  $("pfFeatsNote").textContent = sm.earned ? sm.earned + " of " + sm.total + " — each one a fact about a game you played"
                                           : "Things done on the board, kept the first time they happen";
  box.innerHTML = "";
  /* what you have done, then the next few not done yet — the gentlest
     first — and the rest behind one tap, so the face stays a face */
  var undone = 0;
  sm.rows.forEach(function (r) {
    if (!r.done && !featsAll && ++undone > FEATS_AHEAD) return;
    var e = r.done && r.done.game ? Games.get(games, r.done.game) : null;
    var t = document.createElement(e ? "button" : "div");
    t.className = "featTile" + (r.done ? " on" : "");
    var sub = r.done ? Games.fmtDay(r.done.at) + (e ? " · " + Games.names(e, Rating.LEVELS).who : "") : r.how;
    t.innerHTML = '<span class="em">' + escHtml(r.emoji) + "</span><b>" + escHtml(r.name) + "</b><small>" + escHtml(sub) + "</small>";
    if (r.done) t.setAttribute("aria-label", r.name + ", done " + Games.fmtDay(r.done.at));
    if (e) t.addEventListener("click", function () { openRecord(e); });
    box.appendChild(t);
  });
  var rest = sm.total - sm.earned - FEATS_AHEAD;
  $("pfFeatsMore").classList.toggle("hide", featsAll || rest <= 0);
  $("pfFeatsMore").textContent = "Show the other " + Math.max(0, rest);
}

/* ---- a kept game, on the board ----
   Opened the way a lesson is: the game you were playing stays on the
   shelf (it was saved after every move), and the board becomes a
   read-only replay with the lesson bar as its navigator. */
function shareText(text, title) {
  if (navigator.share && (navigator.maxTouchPoints || 0) > 0) navigator.share({ title: title, text: text }).catch(function () {});
  else clip(text);
}
function openRecord(e) {
  if (!e) return;
  if (mode === "lan" && G && !over && Net.linked()) { toast("Finish or leave the game with your friend first — then it's all here."); return; }
  var g = Chess.create();
  for (var i = 0; i < e.sans.length; i++) { var m = Chess.fromSAN(g, e.sans[i]); if (!m) break; Chess.play(g, m); }
  if (!g.played.length) { toast("That game couldn't be read back — its moves don't add up."); return; }
  stopTour(); quietBoard(); hideAllOverlays(); closeStudio();
  leaveSharedView();   /* a sent game being looked at gives way to this one */
  lesson = null; lessonDone = false; lessonQueue = [];
  mode = "review"; G = g; over = { result: e.result, reason: e.reason || "" };
  keptGame = e;
  var nm = Games.names(e, Rating.LEVELS, myName());
  reviewNames = [nm.white, nm.black];
  thinking = false; clockConfig("none"); clearSel(); clearLines(); viewPly = -1;
  reviewMemo = {};
  e.rv.forEach(function (t) { reviewMemo[t[0]] = { best: t[1], played: t[2] }; });
  Object.keys(e.marks).forEach(function (k) { marks[k] = e.marks[k]; });
  orientation = e.humanSide || 1;
  R.setOrientation(orientation);
  if (FX) Fx.clear();
  fxDown = null;
  hideOpeningCard();
  if (e.eco) showOpeningCard(e.eco.name, e.eco.code, "", "");
  R.setPosition(G.board);
  syncAll();
  viewAt(0);
  reviewBar();
  needFrame();
}
function reviewBar() {
  var e = keptGame, n = Games.names(e, Rating.LEVELS, myName()), o = Games.outcome(e);
  var head = e.mode === "pass" ? "Two players · " + o : "Against " + n.them + " — you " + o;
  var bits = [cap(e.reason || "")];
  if (e.eco) bits.push(e.eco.name.split(":")[0]);
  if (e.acc != null) bits.push(Math.round(e.acc) + "% accuracy");
  lessonUI('<div class="lkick">From your games · ' + escHtml(Games.fmtDay(e.at)) + "</div>" +
           '<div class="lask">' + escHtml(head) + "</div>" +
           '<div class="lsay">' + escHtml(bits.filter(Boolean).join(" · ")) + "</div>");
  lessonRow([lessonChip("◀", function () { reviewStep(-1); }), lessonChip("▶", function () { reviewStep(1); }),
             lessonChip("📨 Send", function () { shareGame(recordToSend(e), "journal"); }),
             notationChip(),
             lessonChip("Done", showMenu, true)]);
}
/* a kept game in the shape the sender wants */
function recordToSend(e) {
  var n = Games.names(e, Rating.LEVELS, myName());
  return { sans: e.sans.slice(), white: n.white, black: n.black, result: e.result || null, reason: e.reason || "",
           clock: "", day: e.at ? new Date(e.at).toISOString().slice(0, 10) : "", ply: -1, ask: "", from: prefs.name || "" };
}
function reviewStep(d) {
  if (!G || !G.played.length) return;
  var at = viewPly >= 0 ? viewPly : G.played.length - 1;
  if (d < 0) viewAt(Math.max(0, at - 1));
  else if (viewPly >= 0) { if (at + 1 >= G.played.length - 1) exitView(); else viewAt(at + 1); }
}
function wireProgression() {
  /* what the score and the ladder already prove goes in the cabinet
     quietly, before any game could announce it as new */
  try {
    var back = Feats.fromRecord(Feats.load(lsGet), { history: rating.history, ladder: ladder, levels: Rating.LEVELS, now: Date.now() });
    if (back.ids.length) Feats.save(back.state, lsSet);
  } catch (e) {}
  [].forEach.call(document.querySelectorAll("#pfTabs .pftab"), function (b) {
    b.addEventListener("click", function () { showProfileTab(b.getAttribute("data-tab")); });
  });
  $("pfGamesMore").addEventListener("click", function () { gamesShown += 10; renderGamesTab(); });
  $("pfFeatsMore").addEventListener("click", function () { featsAll = true; renderFeatsTab(); });
  $("pfPgnAll").addEventListener("click", function () { shareText(Games.pgnAll(Games.load(lsGet), Rating.LEVELS, myName()), "My chess games"); });
}
function progressionForTest() {
  return { Games: Games, Feats: Feats, Goals: Goals,
    goalForTest: function () { return Goals.pick(goalCtx(), Goals.load(lsGet).skip); },
    gamesForTest: function () { return Games.load(lsGet); },
    featsForTest: function () { return Feats.load(lsGet); },
    lowEvalForTest: function (v) { if (typeof v === "number") lowEval = v; return lowEval; },
    reviewForTest: function () { return keptGame; },
    openRecord: openRecord, showProfileTab: showProfileTab, renderLobby: renderLobby };
}

/* ===== game start / end ===== */
function startGame(newMode, opts) {
  brainTicket++; gameTicket++;   /* every search still running is now stale */
  if (HAP) Haptics.cancel();     /* …and so is every buzz still waiting to land */
  Brain.cancel();                /* …and stops, rather than holding up the next one */
  opts = opts || {};
  stopTour();
  lesson = null; lessonDone = false; lessonQueue = [];
  teachSeen = {}; teachCool = 0; taughtAt = [];
  clearNotes(); showPanelTab("moves");
  oddsSpent = { 1: 0, "-1": 0 }; oddsNudged = 0; oddsLastNudge = -99;
  assist = { takebacks: 0, hints: 0 }; ratedDone = false; reviewMemo = {}; lastEval = 0; progressNewGame();
  ink = Ink.create();
  $("lessonBar").classList.add("hide"); document.body.classList.remove("lesson-on"); reflow();
  mode = newMode;
  setupSt = null;
  G = notationGame(opts.fen); if (G.startFen) ratedDone = true;    /* a set-up position is never rated */
  over = null;
  closePromo();
  clearTimeout(coachTimer); thinking = false; hintPending = false; hintShown = null;
  hideToast(); clearLines();
  $("tableEnd").classList.add("hide");
  if (R && R.resetView) R.resetView();
  clearSel(); viewPly = -1; lastNarratedOpening = ""; thinking = false;
  showViewBanner(false);
  hideOpeningCard();
  humanSide = opts.humanSide || 1;
  skill = skillOk(opts.skill || skill);
  /* a friendly game: the coach goes easy and nothing is rated (pace.js) */
  friendly = mode === "coach" && !!opts.friendly;
  if (friendly) ratedDone = true;
  paceTurnEnd(false); paceNudged = 0;
  clockConfig(opts.clockStr || "none");
  orientation = (mode === "coach") ? humanSide : (mode === "lan" ? lanSide : (opts.orientation === -1 ? -1 : 1));
  R.setOrientation(orientation);
  tableSync();
  if (FX) Fx.clear();
  fxDown = null;
  R.setPosition(G.board, { flourish: true });
  sndArrival(!!opts.fresh);
  syncAll();
  hideAllOverlays();
  saveGame();
  watchNetChip(mode === "lan" && Net.everLinked);
  castStart();
  if (typeof Stage !== "undefined") Stage.newGame();
  moStart();
  if (mode === "coach" && G.turn !== humanSide) scheduleCoach();
  else if (mode === "coach") paceTurnStart();
  uimGameStarted(!!opts.fresh);
  needFrame();
}
/* the engine names an ending in a word; a person deserves a sentence */
var REASON_WORDS = {
  insufficient: "neither side has enough left to checkmate",
  "75-move rule": "seventy-five moves passed with no capture or pawn move",
  "fivefold repetition": "the same position came round five times",
  agreed: "agreed between the players"
};
function endGame(result, reason, taught) {
  if (over) return;
  reason = REASON_WORDS[reason] || reason;
  closePromo();
  /* the last move's lesson counts toward "what this game was about" */
  if (taught && taught.concept) teachSeen[taught.concept] = (teachSeen[taught.concept] || 0) + 1;
  over = { result: result, reason: reason };
  castAtEnd(result);
  /* the tune steps out so the ending can be heard; the next game brings it back */
  if (typeof Stage !== "undefined") Stage.mood("end");
  moAtEnd(result);
  clock.run = 0;
  clearSel();
  note({ ply: G && G.played.length ? G.played.length - 1 : null,
         icon: result === "draw" ? "\ud83e\udd1d" : "\ud83c\udfc1", tone: "note", key: "end",
         head: "the game",
         text: "<b>" + (result === "draw" ? "A draw" : (result === "white" ? "White wins" : "Black wins")) +
               "</b> \u2014 " + reason + "." +
               (taught && taught.text ? " " + taught.text : ""),
         brief: (result === "draw" ? "\u00bd\u2013\u00bd" : (result === "white" ? "1\u20130" : "0\u20131")) + " \u00b7 " + reason });
  syncAll();
  var mySide = mode === "coach" ? humanSide : (mode === "lan" ? lanSide : 0);
  var iWon = (result === "white" && mySide === 1) || (result === "black" && mySide === -1);
  var iLost = (result === "white" && mySide === -1) || (result === "black" && mySide === 1);
  var mated = reason === "checkmate";
  snd(result === "draw" ? "draw" : iLost ? (mated ? "mate-lose" : "lose") : (mated ? "mate-win" : "win"));
  if (result === "draw") hap("draw");
  var em = "🤝", title = "A draw!", sub = "";
  if (result === "draw") {
    sub = cap(reason) + ". Draws are real results — half a point each, and often the fairest one.";
  } else {
    var winner = result === "white" ? "White" : "Black";
    if (mySide === 0) { em = "🏆"; title = winner + " wins!"; }
    else if (iWon) { em = "🎉"; title = "You won!"; }
    else { em = "🌱"; title = "This one goes to " + sideName(-mySide) + "."; }
    sub = cap(reason) + "." + (iLost ? " Every strong player has lost thousands of games — this one taught you something specific. Peek back through the moves and find where it turned." : (reason === "checkmate" && !(taught && taught.text) ? " The king had no escape, no shield, and no rescue — that's all a checkmate is." : ""));
  }
  $("endEmoji").textContent = em;
  $("endTitle").textContent = title;
  $("endSub").textContent = sub;
  accAtEnd(result, reason, title);
  /* the final move is the best teaching moment there is — say the thing */
  var lessonLine = $("endLesson");
  if (lessonLine) {
    if (taught && taught.text) { lessonLine.innerHTML = "👁 " + taught.text; lessonLine.classList.remove("hide"); }
    else lessonLine.classList.add("hide");
  }
  $("endRematchSub").textContent = "Same setup" + (mode !== "pass" ? ", colours swapped." : ".");
  $("endRematchTx").textContent = "Rematch";
  if (mode === "coach") {
    $("endRematchTx").textContent = "Play again";
    $("endRematchSub").textContent = "Same coach — you'll have " + (humanSide === 1 ? "Black" : "White") + " this time.";
  }
  /* a mate gets a moment on the board — the king laid down, the camera
     leaning in — before the card comes up over it */
  var cardAt = REDUCED ? 100 : paceCardMs(reason === "checkmate" ? 1700 : 1100);
  paceTurnEnd(false);
  var rs = mode === "coach" ? settleRating(result) : null;
  renderEndRating(rs, cardAt);
  moEndCard();
  jrnAtEnd(result, rs);
  taleAtEnd();
  paceAtEnd(result, rs);
  unlAtEnd(result, rs);
  progressAtEnd(result, reason, rs);
  renderOddsReview();
  helpAtEnd();
  friendsAtEnd(result, mySide);
  /* the card waits its turn: if something else was opened in the
     meantime, the Result chip offers it instead of stacking on top */
  setTimeout(function () {
    if (!over) return;
    if (document.querySelector(".ov:not(.hide)") || studioOpen) { syncTurnStrip(); return; }
    /* two people across a table: each seat is told, the right way up */
    if (tableFacing()) { tableEnd(result, reason); return; }
    $("ovEnd").classList.remove("hide");
    syncTurnStrip();
    /* and over it, the result told a beat at a time (see beatsStart) */
    beatsStart(result, reason, rs, iWon);
    /* the room celebrates with you — and for two people on one board, a
       decisive result is everyone's */
    if (FX && result !== "draw" && (iWon || mySide === 0)) {
      Fx.confetti({ ms: iWon ? 2800 : 1800, layer: "page" });
      if (iWon) Fx.fireworks({ count: reason === "checkmate" ? 3 : 2, layer: "page" });
    }
  }, cardAt);
  /* a game with a friend that ended must not take with it the coach game
     that was shelved when they arrived — saveGame looks after its own */
  if (mode !== "lan") lsDel(SAVE_KEY);
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* The review turns the game into next week's practice: whatever the
   room had to explain along the way becomes a lesson you can do now,
   which is also how it enters the spacing schedule. */
function renderOddsReview() {
  var box = $("endReview2");
  if (!box) return;
  var bits = [];
  var w = oddsSpent[1], b = oddsSpent[-1];
  if (w || b) {
    var unit = clock.on ? "s" : "";
    bits.push("<b>Odds given:</b> White " + (w ? w + unit : "none") +
              " · Black " + (b ? b + unit : "none") +
              " <small>(help is free for whoever is behind)</small>");
  }
  var seen = Object.keys(teachSeen);
  if (seen.length) {
    var names = { fork: "forks", pin: "pins", skewer: "skewers", hanging: "loose pieces",
                  backRank: "the back rank", checkmate: "checkmate", stalemate: "stalemate",
                  castling: "castling", promotion: "promotion", centre: "the centre",
                  development: "development", check: "check" };
    bits.push("<b>This game was about:</b> " +
      seen.map(function (c) { return names[c] || c; }).join(", ") + ".");
  }
  box.innerHTML = bits.join("<br>");
  box.classList.toggle("hide", !bits.length);
  /* offer the matching lesson, if there is one */
  var btn = $("endPractise");
  if (!btn) return;
  /* some things the room names in a game are taught in the course under
     a nearer name — checkmate is met through the back rank, and so on */
  var ALIAS = { checkmate: "backRank", check: "mate-support", stalemate: "promotion",
                centre: "development" };
  /* not the first idea named, which was nearly always the opening's: the
     most important one the game turned on, and of those the one you know
     least */
  var WEIGHT = ["hanging", "backRank", "checkmate", "fork", "pin", "skewer", "overload", "discovered",
                "promotion", "stalemate", "castling", "trade", "tempo", "development", "centre", "check"];
  var prog = null;
  try { prog = Learn.load(); } catch (e) { prog = null; }
  seen.sort(function (a, b) {
    var wa = WEIGHT.indexOf(a), wb = WEIGHT.indexOf(b);
    wa = wa < 0 ? 99 : wa; wb = wb < 0 ? 99 : wb;
    if (wa !== wb) return wa - wb;
    try { return Learn.mastery(prog, a) - Learn.mastery(prog, b); } catch (e) { return 0; }
  });
  var target = null;
  for (var i = 0; i < seen.length && !target; i++) {
    var want = seen[i];
    for (var pass = 0; pass < 2 && !target; pass++) {
      for (var j = 0; j < Learn.LESSONS.length; j++) {
        if (Learn.LESSONS[j].concept === want) { target = Learn.LESSONS[j]; break; }
      }
      want = ALIAS[seen[i]];
      if (!want) break;
    }
  }
  btn.classList.toggle("hide", !target);
  if (target) {
    $("endPractiseSub").textContent = target.title;
    btn.onclick = function () { $("ovEnd").classList.add("hide"); startLesson(target, []); };
  }
}

function rematch() {
  $("ovEnd").classList.add("hide");
  if (mode === "coach") { castRematch = true; startCoachGame(skill, humanSide === 1 ? "b" : "w", clockStrOf()); }
  else if (mode === "pass") startGame("pass", { clockStr: clockStrOf(), fresh: true });
  else if (mode === "lan") {
    if (!Net.linked()) { toast("The link closed. Host or join again to keep playing — the room remembers you."); return; }
    Net.send({ t: "rematch" });
    toast("Rematch offered — waiting for your opponent…");
  }
}
function clockStrOf() { return clock.on ? (clock.base / 60000) + "+" + (clock.inc / 1000) : "none"; }

/* ===== persistence ===== */
function saveGame() {
  if (mode === "lan") { saveLan(); return; }
  /* lessons and stories are not games: saving one used to overwrite the
     game you had left to go and do it */
  if (!G || (mode !== "pass" && mode !== "coach")) return;
  if (over) { lsDel(SAVE_KEY); return; }
  lsSet(SAVE_KEY, JSON.stringify({
    v: 1, mode: mode, sans: G.played.map(function (r) { return r.san; }),
    clockStr: clockStrOf(), wMs: Math.round(clock.w), bMs: Math.round(clock.b),
    humanSide: humanSide, skill: skill, fen: G.startFen || undefined,
    /* the odds ledger is part of the game's story, so it survives a reload */
    odds: [oddsSpent[1], oddsSpent[-1], oddsNudged],
    /* and so is the help taken, or a reload would wash a rated game clean */
    assist: [assist.takebacks, assist.hints, assist.wheels | 0],
    /* and the coach's reviews so far, so a reload doesn't throw away the
       look-back's work — or the abandonment rule's sense of the position */
    rv: mode === "coach" ? Object.keys(reviewMemo).map(function (k) { return rvPack(+k); }) : [],
    ev: lastEval, lo: lowEval,
    /* a game played on from a sent position is friendly, and stays so */
    fr: mode === "coach" && ratedDone ? 1 : 0,
    ez: friendly ? 1 : 0,
    /* what you drew, filed by position */
    ink: Ink.pack(ink)
  }));
}
function loadSave() {
  try {
    var s = JSON.parse(lsGet(SAVE_KEY) || "null");
    if (!s || s.v !== 1 || (s.mode !== "pass" && s.mode !== "coach")) return null;
    /* a save that parses but lies — hand-edited, half-written, from an
       older room — is retired rather than trusted */
    var okClock = s.clockStr === "none" || /^\d{1,3}\+\d{1,3}$/.test(String(s.clockStr));
    var timed = okClock && s.clockStr !== "none";
    if (!Array.isArray(s.sans) || s.sans.length > 1200 || !s.sans.every(function (x) { return typeof x === "string" && x.length < 12; }) ||
        !okClock || (timed && !(typeof s.wMs === "number" && typeof s.bMs === "number" && isFinite(s.wMs) && isFinite(s.bMs) && s.wMs >= 0 && s.bMs >= 0)) ||
        (s.mode === "coach" && (s.humanSide !== 1 && s.humanSide !== -1))) { lsDel(SAVE_KEY); return null; }
    if (s.fen != null && (typeof s.fen !== "string" || !Pgn.validFen(s.fen, Chess).ok)) { lsDel(SAVE_KEY); return null; }
    s.skill = skillOk(s.skill);
    return s;
  } catch (e) { lsDel(SAVE_KEY); return null; }
}
/* A game played across two devices is kept separately, because it is a
   different kind of thing: it needs the four letters and which chair I
   was in, not just the moves. It is what "Rejoin your board" is made of,
   and it is why a flat battery is an inconvenience rather than a loss. */
function saveLan() {
  if (mode !== "lan" || !G) return;
  if (over) { lsDel(LAN_KEY); return; }
  if (!Net.code) return;                  /* a paste/QR game has no address */
  lsSet(LAN_KEY, JSON.stringify({
    v: 1, code: Net.code, host: !!Net.isHost, side: lanSide,
    sans: G.played.map(function (r) { return r.san; }),
    clockStr: clockStrOf(), wMs: Math.round(clock.w), bMs: Math.round(clock.b),
    my: lanMy, opp: lanOpp, title: Room.title || "", at: Date.now(),
    ink: Ink.pack(ink)
  }));
}
function loadLan() {
  try {
    var s = JSON.parse(lsGet(LAN_KEY) || "null");
    if (!s || s.v !== 1 || !s.code || !s.at) return null;
    if (Date.now() - s.at > 8 * 60 * 60 * 1000) { lsDel(LAN_KEY); return null; }
    return s;
  } catch (e) { lsDel(LAN_KEY); return null; }
}
function resumeSave(s) {
  try { resumeSaveInner(s); }
  catch (e) { lsDel(SAVE_KEY); startGame(s.mode === "coach" ? "coach" : "pass", {}); toast("That saved game couldn't be read back, so here is a fresh board."); }
}
function resumeSaveInner(s) {
  startGame(s.mode, { humanSide: s.humanSide, skill: s.skill, clockStr: s.clockStr, fen: s.fen, friendly: s.ez === 1 });
  var g = G;
  for (var i = 0; i < s.sans.length; i++) {
    var m = Chess.fromSAN(g, s.sans[i]);
    if (!m) break;
    Chess.play(g, m);
  }
  if (clock.on) { clock.w = s.wMs; clock.b = s.bMs; clock.run = g.played.length >= 2 ? g.turn : 0; clock.lastT = performance.now(); }
  if (s.odds) { oddsSpent[1] = s.odds[0] || 0; oddsSpent[-1] = s.odds[1] || 0; oddsNudged = s.odds[2] || 0; }
  if (Array.isArray(s.assist)) assist = { takebacks: Math.max(0, s.assist[0] | 0), hints: Math.max(0, s.assist[1] | 0), wheels: Math.max(0, s.assist[2] | 0) };
  if (Array.isArray(s.rv)) s.rv.forEach(function (t) { rvUnpack(t, g.played.length); });
  if (typeof s.ev === "number" && isFinite(s.ev)) lastEval = s.ev;
  if (typeof s.lo === "number" && isFinite(s.lo)) lowEval = Math.max(-100000, Math.min(0, s.lo));
  if (s.fr === 1 && mode === "coach") ratedDone = true;
  ink = Ink.unpack(s.ink, g.played.length);
  R.setPosition(G.board);
  syncAll();
  narrateOpening("", "resume");   /* the card belongs to the position, not the last move */
  saveGame();      /* startGame wrote an empty save; restore the real one */
  var st = Chess.status(G);
  if (st.over) { endGame(st.result, st.reason); return; }
  if (mode === "coach" && G.turn !== humanSide) scheduleCoach();
  else if (mode === "coach") paceTurnStart();
  toast("🕯️ Welcome back — the board is exactly as you left it.");
}

/* ===== nearby (LAN) play ===== */
var scanStream = null;
function lanHandlers() {
  Net.onLink = function () {
    stopScan();
    if (Net.isHost) {
      Net.send({ t: "hi", name: lanMy || "Host", clock: lanCfg.clockStr,
                 yourSide: lanCfg.mySide === 1 ? -1 : 1, sans: lanCfg.sans || [],
                 wMs: lanCfg.wMs, bMs: lanCfg.bMs, fid: myFid() });
      beginLan(lanCfg.mySide, lanCfg.clockStr, lanCfg.sans || [], lanCfg.wMs, lanCfg.bMs);
      celebrateLink();
    } else {
      /* the joiner waits for the host's greeting: it carries their name
         and which seat we're in, so the celebration can show both */
      Net.send({ t: "hi2", name: lanMy || "Friend", fid: myFid() });
      $("linkTitle").textContent = "Linked — setting up the board…";
      codeBusy("dealing the pieces…");
    }
  };
  /* Only reached when there is nothing to be done automatically — a
     paste/QR game has no address to come back to, so it asks. A game
     with four letters heals instead, and says so on the chip. */
  Net.onDrop = function () {
    if (mode !== "lan" || over) return;
    clock.run = 0;
    syncNetChip();
    toast("📡 The link was lost. Nothing is gone — either of you can host a fresh invite and the game resumes exactly here.",
      [{ label: "Host & resume", fn: function () { openLink(); hostFlow(true); } },
       { label: "Menu", fn: function () { showMenu(); }, ghost: true }], 30000);
  };
  /* the pulse on the board: what the link is actually doing */
  Net.onHealth = function (state) {
    syncNetChip();
    if (mode !== "lan" || over) return;
    if (state === "healing" || state === "lost") {
      /* nobody's clock should run down inside a tunnel */
      if (clock.on && clock.run) { clock.run = 0; syncAll(); }
    } else if (state === "live" || state === "slow") {
      if (clock.on && !clock.run && G && G.played.length >= 1) {
        clock.run = G.turn; clock.lastT = performance.now(); syncAll();
      }
    }
  };
  /* the boards found each other again. Rather than reason about what was
     missed while somebody was in a tunnel, the host simply re-states the
     whole game — it is a few hundred bytes and it cannot drift. */
  Net.onRelink = function () {
    /* The joiner says who it is every time the boards meet — also when
       the link was re-made before the host's first greeting had landed
       (two knocks answered, the first channel replaced). Its first
       hello went down with that first channel, and without this one the
       host would play a nameless "Friend" it could never recognise. */
    if (!Net.isHost) Net.send({ t: "hi2", name: lanMy || "Friend", fid: myFid() });
    if (mode !== "lan") return;
    if (Net.isHost) {
      if (over) return;
      Net.resync({ sans: G.played.map(function (r) { return r.san; }),
                   clock: clockStrOf(), wMs: Math.round(clock.w), bMs: Math.round(clock.b),
                   yourSide: -lanSide, name: lanMy || "Host", fid: myFid() });
    }
    toast("📡 Back together — the board is exactly as you left it.");
  };
  Net.onResync = function (msg) {
    var wasLan = (mode === "lan");
    lanOpp = String(msg.name || lanOpp || "Friend").slice(0, 18);
    takeOppId(msg);
    beginLan(msg.yourSide === 1 ? 1 : -1, msg.clock, msg.sans || [], msg.wMs, msg.bMs);
    if (!wasLan) celebrateLink();
    syncAll();
    saveLan();
  };
  Net.onMessage = function (msg) {
    switch (msg.t) {
      case "hi":
        lanOpp = String(msg.name || "Friend").slice(0, 18);
        takeOppId(msg);
        if (!Net.isHost) {
          beginLan(msg.yourSide === 1 ? 1 : -1, msg.clock, msg.sans || [], msg.wMs, msg.bMs);
          celebrateLink();
        }
        syncBars(); syncTurnStrip();
        break;
      case "hi2":
        lanOpp = String(msg.name || "Friend").slice(0, 18);
        takeOppId(msg);
        renderSeats();      /* the host may already be celebrating — keep it true */
        syncBars(); syncTurnStrip();
        break;
      case "mv": onNetMove(msg); break;
      case "undoReq":
        toast("↩ " + lanOpp + " asks to take back a move. Allow it?",
          [{ label: "Allow", fn: function () { Net.send({ t: "undoOk", n: msg.n }); lanUndo(msg.n); } },
           { label: "Not this time", fn: function () { Net.send({ t: "undoNo" }); }, ghost: true }], 20000);
        break;
      case "undoOk": lanUndo(msg.n); toast("Your opponent kindly allowed the takeback."); break;
      case "undoNo": toast("No takeback this time — play on."); break;
      case "draw":
        toast("🤝 " + lanOpp + " offers a draw.",
          [{ label: "Accept", fn: function () { Net.send({ t: "drawOk" }); endGame("draw", "agreed"); } },
           { label: "Play on", fn: function () { Net.send({ t: "drawNo" }); }, ghost: true }], 20000);
        break;
      case "drawOk": endGame("draw", "agreed"); break;
      case "drawNo": toast("The game goes on."); break;
      case "resign": endGame(lanSide === 1 ? "white" : "black", sideName(-lanSide) + " resigned"); break;
      case "rematch":
        toast("🔄 " + lanOpp + " offers a rematch, colours swapped.",
          [{ label: "Play", fn: function () { Net.send({ t: "rematchOk" }); lanRematch(); } },
           { label: "Not now", fn: function () {}, ghost: true }], 20000);
        break;
      case "rematchOk": lanRematch(); break;
    }
  };
}
function beginLan(mySide, clockStr, sans, wMs, bMs) {
  lanSide = mySide;
  lanGameStart(sans);
  startGame("lan", { clockStr: clockStr || "none" });
  if (sans && sans.length) {
    for (var i = 0; i < sans.length; i++) {
      var m = Chess.fromSAN(G, sans[i]);
      if (!m) break;
      Chess.play(G, m);
    }
    R.setPosition(G.board);
    /* a rejoin keeps the notes you drew on this board, too */
    var kept = loadLan();
    if (kept && kept.code && kept.code === Net.code) ink = Ink.unpack(kept.ink, G.played.length);
    if (clock.on && wMs != null) { clock.w = wMs; clock.b = bMs; }
    if (clock.on) { clock.run = G.played.length >= 2 ? G.turn : 0; clock.lastT = performance.now(); }
    narrateOpening("", "resume");
    toast("📡 Resumed exactly where you left off.");
  }
  orientation = lanSide;
  R.setOrientation(orientation);
  /* the board is dealt — the room stops advertising itself but keeps its
     four letters, because that is the address anybody coming back uses */
  Net.roomStarted();
  watchNetChip(true);
  saveLan();
  syncAll();
}
/* ----- monitoring: the chip above the board -----
   Two devices playing chess have exactly one thing that can silently go
   wrong, and it is the link. So the link is the one thing with a light
   on it: green while the round trip is comfortable, amber the moment it
   isn't, and a live account of what is being done about it. Tapping it
   stops waiting and tries this instant. */
var netChipT = 0;
function syncNetChip() {
  var el = $("netChip");
  if (!el) return;
  if (mode !== "lan" || !Net.everLinked) { el.className = "hide"; return; }
  var h = Net.health();
  el.className = h.state;
  $("netChipTx").textContent = h.words + (Net.code ? " · " + Net.code : "");
}
function watchNetChip(on) {
  if (netChipT) { clearInterval(netChipT); netChipT = 0; }
  if (on) netChipT = setInterval(syncNetChip, 2500);
  syncNetChip();
}
function onNetMove(msg) {
  if (mode !== "lan" || !G || over) return;
  if (msg.n !== G.played.length) return;              /* stale or duplicate */
  if (G.turn === lanSide) return;                     /* it must be their turn */
  var all = Chess.moves(G), m = null;
  for (var i = 0; i < all.length; i++) {
    if (all[i].from === msg.from && all[i].to === msg.to && (all[i].promo || 0) === (msg.promo || 0)) { m = all[i]; break; }
  }
  if (!m) { toast("The boards disagreed for a moment — if it happens again, re-link to resync."); return; }
  if (clock.on && msg.wMs != null) { clock.w = msg.wMs; clock.b = msg.bMs; }
  commitMove(m, "net");
}
function lanUndo(n) {
  for (var i = 0; i < n && G.played.length; i++) Chess.takeBack(G);
  Ink.dropAfter(ink, G.played.length);
  over = null;
  clearSel(); viewPly = -1;
  if (clock.on) { clock.run = G.played.length >= 2 ? G.turn : 0; clock.lastT = performance.now(); }
  R.setPosition(G.board);
  syncAll();
}
function lanRematch() {
  $("ovEnd").classList.add("hide");
  lanSide = -lanSide;
  beginLan(lanSide, clockStrOf(), []);
  toast("🔄 Rematch! You have " + (lanSide === 1 ? "white" : "black") + " this time.");
}

/* ----- the join flow -----
   One shell, two roles. Whichever side you are, the room shows your
   code and (when the camera is available) watches for theirs at the
   same time — so two people at a table just hold their phones up and
   it happens. Every code that reaches the app, however it arrives
   (scanned, pasted, shared-link, typed, or found on the clipboard),
   goes through feedCode() and advances the handshake by itself.
   `linkStep`: 0 choosing · 1 showing my code · 2 waiting to connect */
var linkStep = 0, linkRole = null, scanOn = false, scanStop = null, clipWatch = 0;
/* guards against doing the handshake twice: what I'm showing (so I never
   feed myself my own code), the last code I acted on, whether an async
   step is in flight, and a random token used to settle it when both
   people happen to open a board at the same moment. */
var myCodeRaw = "", lastFed = "", lastFedAt = 0, linkBusy = false, lanNonce = "";

function scanSupported() {
  return ("BarcodeDetector" in window) && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}
function openLink() {
  hideAllOverlays();
  stopScan();
  linkStep = 0; linkRole = null;
  myCodeRaw = ""; lastFed = ""; linkBusy = false; roomJoining = false;
  $("ovLink").classList.remove("hide");
  roomPanel("choose");
  $("lanName").value = prefs.name || "";
  $("linkCodeIn").value = "";
  $("codeDrop").open = false;
  offerRejoin();
  renderLinkPeople();
}
/* A board you were in the middle of, offered back to you. This is the
   whole point of remembering the code: a phone that died, a tab that was
   closed, a browser that decided to reload — none of them should cost
   anybody a game. */
function offerRejoin() {
  var btn = $("linkResume"), s = loadLan();
  if (!btn) return;
  if (!s) { btn.classList.add("hide"); return; }
  var moves = s.sans ? s.sans.length : 0;
  $("linkResumeSub").textContent = s.code + " · " + (s.opp ? "with " + s.opp + " · " : "") +
    (moves ? moves + (moves === 1 ? " move in" : " moves in") : "not started yet");
  btn.classList.remove("hide");
}
function rejoinLan() {
  var s = loadLan();
  if (!s) { toast("That board has faded — start a fresh one."); offerRejoin(); return; }
  grabName();
  Room.resume();                       /* the code, and the host's key */
  lanOpp = s.opp || "";
  if (s.host) {
    /* Re-open under the same four letters. Nobody re-reads anything: the
       code on the other person's screen is still the right code. */
    linkRole = "host"; linkStep = 1;
    lanCfg = { mySide: s.side, clockStr: s.clockStr, sans: s.sans || [], wMs: s.wMs, bMs: s.bMs };
    beginLan(s.side, s.clockStr, s.sans || [], s.wMs, s.bMs);
    $("ovLink").classList.remove("hide");
    roomPanel("host");
    $("roomCode").textContent = s.code;
    $("roomCode").classList.remove("pending");
    $("roomTitle").textContent = "Your board is open again";
    $("roomHow").innerHTML = "Same four letters as before — nothing to re-read. Your opponent's board finds its own way back.";
    roomWait("waiting for them…", true);
    Net.name = lanMy || "Host";
    Net.roomOpen({ host: lanMy || "Host", name: s.title || "A chess board" }).then(function (r) {
      if (!r) { toast("Couldn't reopen that board — the mailbox is out of reach."); hostByHandshake(); return; }
      $("roomCode").textContent = r.code;
    });
    return;
  }
  $("ovLink").classList.remove("hide");
  roomPanel("join");
  $("roomIn").value = s.code;
  joinByCode(s.code);
}
function grabName() {
  lanMy = ($("lanName").value || "").trim().slice(0, 18);
  prefs.name = lanMy; savePrefs();
}
/* one card, four faces: choose · the host's four letters · the joiner's
   keypad · the paste/QR handshake underneath them all */
function roomPanel(which) {
  $("linkChoose").classList.toggle("hide", which !== "choose");
  $("linkRoom").classList.toggle("hide", which !== "host");
  $("linkJoinRoom").classList.toggle("hide", which !== "join");
  $("linkStage").classList.toggle("hide", which !== "stage");
  if (which !== "join") stopRoomList();
}
/* paint the shared stage for the current step */
function linkStage(opts) {
  roomPanel("stage");
  $("linkTitle").textContent = opts.title;
  $("linkHow").innerHTML = opts.how;
  $("linkNote").textContent = opts.note || "The camera stays on this device and stops the moment it sees a code.";
  $("linkStage").classList.toggle("waiting", !!opts.waiting);
  $("qrFrame").classList.toggle("hide", !opts.showCode);
  $("linkCam").classList.toggle("hide", !scanSupported());
  /* until I have a code of my own there is nothing to send or copy —
     offering it anyway is what made the no-camera screen confusing */
  var mine = !!opts.showCode;
  $("linkShare").classList.toggle("hide", !mine);
  $("linkCopy").classList.toggle("hide", !mine);
  $("linkCodeOut").classList.toggle("hide", !mine);
  $("codeDropLabel").textContent = mine
    ? "Type or copy the code by hand"
    : "Paste their code by hand";
  var r1 = $("rail1"), r2 = $("rail2"), r3 = $("rail3");
  r1.className = "railStep" + (opts.step === 1 ? " on" : " done");
  r2.className = "railStep" + (opts.step === 2 ? " on" : (opts.step > 2 ? " done" : ""));
  r3.className = "railStep" + (opts.step === 3 ? " on" : "");
}
/* Show my half of the handshake.
   The host's invite travels as a tappable link — tapping it on the other
   phone opens the room and joins in one motion, the nicest path there is.
   The joiner's reply travels as a bare code on purpose: it is only ever
   consumed by a host who is already mid-handshake, and a link would
   reload their page and throw the connection away. */
function showMyCode(rawCode, asLink) {
  myCodeRaw = normCode(rawCode) || "";
  var shown = asLink ? Net.url(rawCode) : rawCode;
  $("linkCodeOut").value = shown;
  $("qrWait").classList.add("hide");
  Net.drawQR($("qrCanvas"), shown);
  $("qrFrame").classList.remove("hide");
}
function codeBusy(msg) {
  $("qrWait").classList.remove("hide");
  $("qrWait").innerHTML = '<span class="spin"></span>' + msg;
}

/* --- host ---
   Four letters first, because reading four letters across a table beats
   every other way in. The QR/paste handshake is still there, one tap
   below, and it is what happens by itself when there is no mailbox to
   mint a code (offline, file://, a fork of this without the function). */
function hostFlow(resume) {
  grabName();
  var doHost = function (clockStr, side) {
    var s = side === "r" ? (Math.random() < 0.5 ? 1 : -1) : (side === "b" ? -1 : 1);
    linkRole = "host"; linkStep = 1;
    lanNonce = String(Math.floor(Math.random() * 2147483647));
    lanCfg = { mySide: s, clockStr: clockStr,
               sans: resume && G && mode === "lan" ? G.played.map(function (r) { return r.san; }) : [],
               wMs: resume && clock.on ? Math.round(clock.w) : undefined,
               bMs: resume && clock.on ? Math.round(clock.b) : undefined };
    $("ovLink").classList.remove("hide");
    roomPanel("host");
    $("roomCode").textContent = "····";
    $("roomCode").classList.add("pending");
    $("roomTitle").textContent = "Your board is open";
    roomWait("opening the board…", true);
    Net.name = lanMy || "Host";
    /* a new board is a new board: the letters of the last game would be
       reclaimed still marked as started, and its opponent's healing would
       walk straight into it */
    if (!resume && Net.isHost && Room.code) Net.roomLeave();
    Net.roomOpen({ host: lanMy || "Host", name: roomTitleFor() })
      .then(function (r) {
        if (!r) { hostByHandshake(); return; }
        $("roomCode").textContent = r.code;
        $("roomCode").classList.remove("pending");
        roomWait("waiting for them to type it…", true);
        $("roomHow").innerHTML = "Read these four letters to your friend. On their device: <b>Play a friend</b> → <b>Join a board</b>.";
        roomOpened(r.code);
      })
      .catch(function () { hostByHandshake(); });
  };
  if (resume) { doHost(clockStrOf(), lanSide === 1 ? "w" : "b"); return; }
  openNewCard("lanhost", function (opts) { doHost(opts.clockStr, opts.side); });
}
/* the way in that needs no server at all */
function hostByHandshake() {
  linkRole = "host"; linkStep = 1;
  linkStage({ step: 1, showCode: true, title: "Show this to your friend",
    how: scanSupported()
      ? "On their device: <b>Play a friend</b> → <b>Join a board</b> → <b>Codes &amp; QR</b>, then point their camera at this code."
      : "Tap <b>Share</b> to send them the link — tapping it opens their board already joining. Then they'll send you a short answer code to paste." });
  codeBusy("making your code…");
  Net.host({ name: lanMy, n: lanNonce }).then(function (code) {
    showMyCode(code, true);           /* invite: a tappable link */
    /* the host watches for the reply straight away, so the two phones
       can simply face each other; where there's no camera, the
       clipboard watcher is what catches their pasted answer */
    if (scanSupported()) startScan();
    else $("codeDrop").open = true;
    startClipWatch();
  }).catch(function () {
    codeBusy("that didn't work — close and try again");
  });
}
function roomWait(text, spinning) {
  $("roomWaitTx").textContent = text;
  var s = $("roomWait").querySelector(".spin");
  if (s) s.classList.toggle("hide", !spinning);
}

/* --- joiner --- */
function joinFlow(prefill) {
  grabName();
  linkRole = "join"; linkStep = 1; myCodeRaw = ""; lastFed = "";
  $("ovLink").classList.remove("hide");
  Net.name = lanMy || "Friend";
  if (prefill) {
    /* a four-letter code (a tapped link, a typed hash) needs no handshake
       screen at all — it goes straight in */
    if (Room.isCode(prefill)) {
      showJoinExtras();
      roomPanel("join");
      $("roomIn").value = Room.tidy(prefill);
      joinByCode(prefill);
      return;
    }
    linkStage({ step: 1, showCode: false, title: "Joining…", how: "Reading their invite." });
    feedCode(prefill);
    return;
  }
  showJoinExtras();
  roomPanel("join");
  $("roomIn").value = "";
  joinNote("four letters and you're in");
  refreshRoomList();
  startRoomList();
  setTimeout(function () { try { $("roomIn").focus(); } catch (e) {} }, 250);
}
/* the paste/QR way in, for when there is no mailbox — or when somebody
   would simply rather scan */
function joinByHandshake() {
  roomPanel("stage");
  linkRole = "join"; linkStep = 1;
  if (scanSupported()) {
    linkStage({ step: 1, showCode: false,
      title: "Point at their code",
      how: "Hold your camera up to your friend's screen — or tap <b>Paste a code</b> if they sent it to you." });
    startScan();               /* the camera opens itself: nothing to tap */
  } else {
    /* no camera here (iPhones can't scan inside a web page) — so lead
       with the way that does work rather than showing an empty frame */
    pasteFirst("Paste their invite",
      "This browser can't use the camera inside a page. Ask them to tap <b>Share</b> on their board and send you the link — then paste it below (or just tap the link they send).");
  }
  startClipWatch();
}

/* ----- the four-letter door ----- */
var roomListT = 0, roomJoining = false;
function joinNote(t) { $("joinWaitTx").textContent = t; }
function startRoomList() {
  stopRoomList();
  roomListT = setInterval(refreshRoomList, 3500);
}
function stopRoomList() { if (roomListT) { clearInterval(roomListT); roomListT = 0; } }
/* Boards waiting nearby, so nobody has to read anything out at all if
   they'd rather just tap. A mailbox that isn't there sends the whole
   screen back to the handshake rather than showing an empty list. */
function refreshRoomList() {
  Net.roomList().then(function (rooms) {
    if (rooms === null) { noMailbox(); return; }
    var box = $("roomList");
    if (!box) return;
    if (!rooms.length) {
      box.innerHTML = '<div class="roomEmpty">No boards waiting yet — when your friend taps <b>Invite a friend</b>, theirs appears here.</div>';
      return;
    }
    box.innerHTML = rooms.map(function (r) {
      return '<button class="roomRow" data-code="' + esc(r.code) + '">' +
        '<span class="rrCode">' + esc(r.code) + '</span>' +
        '<span class="rrTx"><b>' + esc(r.name || "A board") + '</b><i>' + esc(r.host || "someone") +
        " · " + (r.age < 60 ? "just now" : (Math.round(r.age / 60) + "m ago")) + '</i></span>' +
        '<span class="rrGo">join ▸</span></button>';
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll(".roomRow"), function (b) {
      b.addEventListener("click", function () { joinByCode(b.dataset.code); });
    });
  });
}
function noMailbox() {
  stopRoomList();
  toast("No four-letter codes here — falling back to scanning and pasting, which always works.");
  joinByHandshake();
}
function joinByCode(code, retry) {
  code = Room.tidy(code);
  if (!Room.looksLikeCode(code)) return;
  if (roomJoining) return;
  if (Room.impossible(code)) {
    joinNote("codes never use I or O — they'd read as 1 and 0. Check it with your host.");
    return;
  }
  roomJoining = true;
  stopRoomList();
  $("roomList").innerHTML = "";
  joinNote("knocking on " + code + "…");
  Net.roomJoin(code, lanMy).then(function (r) {
    roomJoining = false;
    if (!r) { noMailbox(); return; }
    if (r.error) {
      /* "full" is almost always a spare pigeonhole still being minted —
         one patient retry is kinder than making them type it again */
      if (/full/i.test(r.error) && !retry) {
        joinNote("that board is making room for you…");
        setTimeout(function () { joinByCode(code, true); }, 1600);
        return;
      }
      joinNote(r.error);
      startRoomList();
      return;
    }
    joinNote("found " + (r.name || code) + " — setting up the board…");
    watchJoinStall(code);
  }, function () {
    roomJoining = false;
    joinNote("that didn't take — try the code again");
    startRoomList();
  });
}

/* the paste-led version of a step, used whenever scanning isn't possible */
function pasteFirst(title, how) {
  linkStage({ step: 1, showCode: false, title: title, how: how,
    note: "Tip: if you copy the code, this page picks it up on its own." });
  $("codeDrop").open = true;
  var box = $("linkCodeIn");
  if (box) setTimeout(function () { try { box.focus(); } catch (e) {} }, 250);
}
/* shown once the joiner has an answer but no camera to be scanned with */
function sendItInstead(line) {
  $("linkHow").innerHTML = line + " tap <b>Share</b> or <b>Copy</b> below — they'll paste it on their board.";
  $("codeDrop").open = true;
}

/* --- the one door every code comes through ---
   Everything (scanned, pasted, clipboard, typed, tapped link) arrives
   here. Three things kept going wrong before, and each has a guard now:

     · It used to decide what to do from *my role* rather than from what
       the code actually is, so a host who scanned another invite tried
       to treat it as an answer and failed forever.
     · Two people can both tap "Host" — then both phones show an invite
       and neither is listening for one. Rather than make anyone start
       over, each invite carries a random token; whoever's is larger
       silently gives up hosting and joins the other. Both sides work it
       out the same way without a word passing between them.
     · The same code could be fed twice (camera + clipboard, or a second
       glance at the same screen), which tore down a half-built
       connection. Now a code in flight, a repeat, or my own code are
       all ignored. */
function normCode(text) {
  var m = String(text || "").replace(/\s+/g, "").match(/CHESS(1|2)\.[A-Za-z0-9_-]+/);
  return m ? m[0] : null;
}
function feedCode(text) {
  var code = normCode(text);
  if (!code) return false;
  if (linkBusy) return true;                                   /* one at a time */
  if (code === myCodeRaw) return true;                         /* that's mine */
  if (code === lastFed && Date.now() - lastFedAt < 30000) return true;
  lastFed = code; lastFedAt = Date.now();
  linkBusy = true;
  Net.decode(code).then(function (o) {
    linkBusy = false;
    if (!o || !o.k) { linkOops("That code was unreadable — ask for a fresh one."); return; }
    if (o.k === "invite") return takeInvite(code, o);
    if (o.k === "reply") return takeReply(code);
    linkOops("That code isn't one of ours.");
  }).catch(function () {
    linkBusy = false;
    linkOops("That code was unreadable — ask for a fresh one.");
  });
  return true;
}
function linkOops(msg) {
  toast(msg);
  lastFed = "";                    /* let them try the same code again */
  if (linkRole && linkStep < 3) startScan();
}

/* an invite: I become the joiner — unless I'm already hosting, in which
   case the tokens decide which of us yields */
function takeInvite(code, o) {
  if (linkRole === "host") {
    var theirs = (o.meta && o.meta.n) ? String(o.meta.n) : "";
    if (!theirs || theirs === lanNonce) { startScan(); return; }
    if (lanNonce < theirs) {
      /* I keep the board; they'll stand down on their side the same way */
      $("linkHow").innerHTML = "You both opened a board — keeping <b>yours</b>. Their phone is standing down; just keep facing each other.";
      startScan();
      return;
    }
    /* I yield: close my half-built board and join theirs instead */
    Net.close();
    linkRole = "join"; linkStep = 1; myCodeRaw = "";
    toast("You both opened a board — joining theirs instead.");
  }
  if (linkStep >= 2 && linkRole === "join") { startScan(); return; }  /* already answered */
  linkRole = "join";
  stopScan();
  linkStep = 2;
  linkStage({ step: 2, showCode: true, waiting: true, title: "Now show them yours",
    how: "Almost there — let your friend's camera see this code and you're playing.",
    note: "Keep this open; the boards link themselves the moment they see it." });
  codeBusy("answering…");
  Net.join(code).then(function (res) {
    if (!res) { linkStep = 1; linkOops("Couldn't read that invite — ask for a fresh one."); joinFlow(null); return; }
    var host = res.meta && res.meta.name ? String(res.meta.name).slice(0, 18) : "";
    if (host) {
      lanOpp = host;
      $("linkTitle").textContent = "Found " + host + " — now show them yours";
      $("linkHow").innerHTML = "Let <b>" + escHtml(host) + "</b>'s camera see this code and you're playing.";
    }
    showMyCode(res.reply, false);      /* reply: a bare code, never a link */
    if (!scanSupported()) sendItInstead("Send this answer back to them:");
  }).catch(function () {
    linkStep = 1;
    linkOops("Couldn't read that invite — try again.");
    joinFlow(null);
  });
}

/* an answer: only the host who made the matching invite can use it */
function takeReply(code) {
  if (linkRole !== "host") {
    linkOops("That's an answer code — it only works on the board that made the invite.");
    return;
  }
  stopScan();
  linkStep = 2;
  linkStage({ step: 2, showCode: true, waiting: true, title: "Got it — linking…",
    how: "Their answer came through. Shaking hands…" });
  codeBusy("linking…");
  Net.acceptReply(code).then(function (ok) {
    if (!ok) {
      linkStep = 1;
      lastFed = "";
      linkStage({ step: 1, showCode: true, title: "Show this to your friend",
        how: "That answer was for a different board — here's yours again." });
      showMyCode(myCodeRaw, true);
      startScan();
    }
    /* success continues in Net.onLink → celebrateLink() */
  }).catch(function () {
    linkStep = 1; lastFed = "";
    linkOops("That answer didn't fit this board.");
  });
}

/* --- the live camera --- */
function startScan() {
  if (!scanSupported() || scanOn) return;
  var video = $("scanVideo"), frame = $("camFrame");
  scanOn = true;
  frame.classList.remove("hide", "found");
  $("camHint").textContent = "looking for their code…";
  var stopped = false;
  scanStop = function () {
    stopped = true; scanOn = false;
    if (scanStream) { scanStream.getTracks().forEach(function (t) { t.stop(); }); scanStream = null; }
    try { video.srcObject = null; } catch (e) {}
    frame.classList.add("hide");
  };
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function (stream) {
    if (stopped) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    scanStream = stream;
    video.srcObject = stream;
    video.play().catch(function () {});
    var det = new window.BarcodeDetector({ formats: ["qr_code"] });
    (function poll() {
      if (stopped) return;
      det.detect(video).then(function (codes) {
        if (stopped) return;
        var hit = codes && codes.filter(function (c) { return /CHESS(1|2)\./.test(c.rawValue); })[0];
        if (hit) {
          var mine = normCode(hit.rawValue) === myCodeRaw;
          if (!mine) {
            frame.classList.add("found");
            $("camHint").textContent = "got it!";
            snd("hint");
            feedCode(hit.rawValue);
          }
          /* keep looking: if that code wasn't for us (our own screen in
             shot, or a board that stood down) the hunt must go on */
          setTimeout(function () {
            if (stopped) return;
            frame.classList.remove("found");
            $("camHint").textContent = "looking for their code…";
            poll();
          }, mine ? 400 : 1500);
          return;
        }
        setTimeout(poll, 220);
      }).catch(function () { setTimeout(poll, 400); });
    })();
  }).catch(function () {
    scanStop();
    /* permission refused or no lens: switch to the path that still works */
    if (linkRole === "join" && linkStep === 1) {
      pasteFirst("Paste their invite",
        "No camera available — ask them to tap <b>Share</b> on their board and send you the link, then paste it here.");
    } else {
      $("linkNote").textContent = "No camera here — use Share or Copy, and paste what they send back.";
      $("codeDrop").open = true;
    }
  });
}
function stopScan() {
  if (scanStop) { scanStop(); scanStop = null; }
  scanOn = false;
  stopClipWatch();
}
/* a friend who AirDropped/messaged the code has it on the clipboard —
   glance at it (only where the browser allows a silent read) so the
   code lands without anyone tapping anything */
function startClipWatch() {
  stopClipWatch();
  if (!(navigator.clipboard && navigator.clipboard.readText)) return;
  clipWatch = setInterval(function () {
    if (document.visibilityState !== "visible") return;
    navigator.clipboard.readText().then(function (t) {
      var c = normCode(t);
      if (c && c !== myCodeRaw) feedCode(c);
    }).catch(function () { stopClipWatch(); });   /* permission denied: stop asking */
  }, 1200);
}
function stopClipWatch() { if (clipWatch) { clearInterval(clipWatch); clipWatch = 0; } }

/* --- the celebration ---
   The two greetings ("hi" carries the host's name, "hi2" the joiner's)
   can land either side of this card appearing, so the seats are always
   re-rendered from current state rather than patched in place. */
function renderSeats() {
  var meWhite = lanSide === 1;
  $("seatRow").innerHTML =
    '<div class="seat me"><span class="who">' + escHtml(lanMy || "You") + '</span><span class="side">' + (meWhite ? "♔ White" : "♚ Black") + '</span></div>' +
    '<div class="seat"><span class="who">' + escHtml(lanOpp || "Your friend") + '</span><span class="side">' + (meWhite ? "♚ Black" : "♔ White") + '</span></div>';
  $("linkedSub").textContent = linkedLine(meWhite);
}
function celebrateLink() {
  stopScan();
  hideAllOverlays();
  snd("link");
  $("linkedTitle").textContent = "You're linked!";
  renderSeats();
  greetFriend();
  $("ovLinked").classList.remove("hide");
  var meWhite = lanSide === 1;
  setTimeout(function () {
    $("ovLinked").classList.add("hide");
    toast(meWhite ? "Your move — white goes first." : "They move first. Watch the centre.");
  }, REDUCED ? 1200 : 2600);
}
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function clip(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast("Copied. Send it however you like."); },
      function () { toast("Couldn't reach the clipboard — long-press the code to copy it."); });
  } else toast("Long-press the code to copy it.");
}
function pasteCode() {
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(function (t) {
      if (!feedCode(t)) { $("codeDrop").open = true; toast("No code on the clipboard — paste it into the box."); }
    }, function () { $("codeDrop").open = true; toast("Paste the code into the box below."); });
  } else { $("codeDrop").open = true; toast("Paste the code into the box below."); }
}
function share(text) {
  if (!text) return;
  var isLink = /^https?:/.test(text);
  if (navigator.share) {
    /* a link shares as a link (tap it and the board opens, already
       joining); a bare reply code shares as text */
    var msg = isLink
      ? { title: "Chess?", text: "Tap to join my board:", url: text }
      : { title: "My reply code", text: text };
    navigator.share(msg).catch(function () {});
  } else clip(text);
}

/* ===== friends: the challenge that waits, a game you can send, your people =====
   Three things two people who play each other actually do, none of which
   needs anything but the two phones and the mailbox's four letters:

     • A CHALLENGE THAT WAITS. Opening a board used to park you on four
       letters until somebody typed them. Now the board stays open while
       you go back to the room and play the computer; the invite is a
       sentence ("Sam challenges you — 10+5, you're Black") with a link
       and a QR that open the same board, nearby or across the country;
       and the moment they arrive, whatever you were doing is shelved
       exactly as a lesson shelves it, and the game begins.
     • A GAME YOU CAN SEND. Any game becomes a link (share.js) that opens
       on any phone, replayable, and is read on arrival by the receiver's
       own coach — or a link to one moment of it, with a question.
     • YOUR PEOPLE. Everyone you have played on another device, the score
       between you, and the games themselves (friends.js), said where it
       matters: on the linked card, on the rematch button, and on a card
       of its own. A profile tab could later hold the same rows —
       renderPeople() draws into whatever box it is given.

   Everything here stays on the two devices. The id that keeps two Sams
   apart crosses only the direct link; the mailbox sees what it always
   saw, a handshake. */
var friends = Friends.load(lsGet);
var lanOppId = "";        /* the other board's quiet id, when its room sent one  */
var lanGameId = "";       /* this game's own name in the record                   */
var hostFor = "";         /* a board opened "For" a particular friend             */
var joinExtras = null;    /* what an invite link said about the board it opens    */
var sharedView = null;    /* the game being looked through from a link            */
var shareFrom = null;     /* which card the share sheet should go back to         */
var peopleFrom = null;    /* …and the people card                                 */

function myFid() {
  if (!friends.me) { friends = Friends.me(friends); Friends.save(friends, lsSet); }
  return friends.me;
}
/* whatever greeting arrives (hi, hi2, a resync), believe only an id of
   the right shape; a board too old to send one is remembered by name */
function takeOppId(msg) {
  lanOppId = msg && Friends.isId(msg.fid) && msg.fid !== friends.me ? msg.fid : "";
  if (lanOppId && lanOpp && Friends.find(friends, lanOppId)) {
    friends = Friends.rename(friends, lanOppId, lanOpp);
    Friends.save(friends, lsSet);
  }
}
/* a new game gets a new name; a game put back together after a tunnel
   keeps the one it had, so it is never counted twice */
function lanGameStart(sans) {
  if (!lanGameId || !sans || !sans.length) {
    lanGameId = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }
}
function oppRecord() { return Friends.find(friends, lanOppId, lanOppId ? null : lanOpp); }

/* "Sam again! You lead 3–2." — said once, as the boards join */
function linkedLine(meWhite) {
  var f = oppRecord(), t = Friends.tally(f);
  var opens = meWhite ? "you open." : "they open.";
  if (f && t.games) return (lanOpp || f.name) + " again! " + t.text + " — " + opens;
  return "Two devices, one board — " + opens;
}
function greetFriend() {
  var t = Friends.tally(oppRecord());
  if (!t.games) return;
  hap("success");
  if (FX && !REDUCED) Fx.sparkle($("seatRow"), { count: 14 });
}

/* A game between two devices has ended: the score between you moves,
   and the rematch button says what it now stands at. Only games that
   were actually played count — a board resigned before anybody moved is
   not a result between friends. */
function friendsAtEnd(result, mySide) {
  var row = $("endShareRow");
  if (row) row.classList.toggle("hide", !(mode === "coach" || mode === "pass" || mode === "lan") || !G || !G.played.length);
  var pb = $("endPeople");
  if (pb) pb.classList.add("hide");
  if (mode !== "lan" || !mySide) return;
  var mine = result === "draw" ? "d" : ((result === "white") === (mySide === 1) ? "w" : "l");
  var out = null;
  if (G && G.played.length) {
    out = Friends.record(friends, {
      id: lanOppId, name: lanOpp || "A friend", result: mine, at: Date.now(), side: mySide,
      sans: G.played.map(function (r) { return r.san; }), reason: over ? over.reason : "", gid: lanGameId
    });
    friends = out.state;
    Friends.save(friends, lsSet);
  }
  var f = out ? out.f : oppRecord(), t = Friends.tally(f);
  if (!t.games) return;
  var nextSide = mySide === 1 ? "Black" : "White";
  $("endRematchSub").textContent = out && out.decider
    ? "Level, 1–1 — the decider? You'll have " + nextSide + "."
    : t.text + " · you'll have " + nextSide + " next.";
  if (pb) {
    $("endPeopleTx").textContent = "👥 You and " + f.name + " ›";
    pb.classList.remove("hide");
  }
}

/* ----- the challenge that waits ----- */
function roomTitleFor() {
  if (hostFor) return "For " + hostFor;
  return lanMy ? lanMy + "'s board" : "A chess board";
}
/* where the invite points, and what it says about the board before
   anybody sits down: who asked, the clock, and which colour is theirs */
function inviteUrl(code) {
  var u = Net.url(code);
  if (!/^https?:/.test(u)) return u;
  var bits = [];
  if (lanMy) bits.push("n=" + encodeURIComponent(lanMy));
  if (lanCfg && lanCfg.clockStr) bits.push("c=" + encodeURIComponent(lanCfg.clockStr));
  if (lanCfg && lanCfg.mySide) bits.push("s=" + (lanCfg.mySide === 1 ? "b" : "w"));
  return u + (bits.length ? "&" + bits.join("&") : "");
}
function clockWords(c) {
  if (!c || c === "none") return "no clock";
  var p = String(c).split("+");
  return p[0] + " min" + (+p[1] ? " + " + p[1] + "s a move" : "");
}
function challengeText() {
  var who = lanMy || "Someone";
  var side = lanCfg && lanCfg.mySide ? (lanCfg.mySide === 1 ? "you're Black" : "you're White") : "";
  return "♟ " + (hostFor ? hostFor + ", " : "") + who + " challenges you to a game of chess — " +
    clockWords(lanCfg && lanCfg.clockStr) + (side ? ", " + side : "") + ". Tap to sit down:";
}
function shareChallenge(code) {
  var url = inviteUrl(code), text = challengeText();
  if (!/^https?:/.test(url)) { clip(code); return; }
  if (navigator.share) navigator.share({ title: "Chess?", text: text, url: url }).catch(function () {});
  else clip(text + " " + url);
}
/* the board is open: the QR of the invite under the letters, and the
   way back to the room while it waits */
function roomOpened(code) {
  var url = inviteUrl(code), web = /^https?:/.test(url);
  var qr = $("roomQR");
  if (qr) {
    var drawn = web && Net.drawQR(qr, url);
    $("roomQRWrap").classList.toggle("hide", !drawn);
  }
  $("roomKeep").classList.remove("hide");
  $("roomHow").innerHTML = (hostFor ? "Opened for <b>" + escHtml(hostFor) + "</b>. " : "") +
    (web ? "Send the invite, let them scan it, or read the four letters out — all three open this board, nearby or anywhere."
         : "Read these four letters to your friend.") +
    " You can go back to the room and play while you wait.";
}
/* the lobby's row for a board that is open and waiting */
function syncOpenBoard() {
  var b = $("mOpenBoard");
  if (!b) return;
  var open = Net.isHost && Net.state === "hosting" && !!Room.code && mode !== "lan";
  b.classList.toggle("hide", !open);
  if (!open) return;
  var title = Room.title || "";
  var forWho = /^For /.test(title) ? title.slice(4) : "";
  $("mOpenBoardTx").textContent = "Your board " + Room.code + " is open";
  $("mOpenBoardSub").textContent = "Waiting for " + (forWho || "your friend") + " — tap to show the code, or play while you wait.";
}
function showOpenBoard() {
  if (!(Net.isHost && Room.code)) { syncOpenBoard(); return; }
  hideAllOverlays();
  linkRole = "host"; linkStep = 1;
  $("ovLink").classList.remove("hide");
  roomPanel("host");
  $("roomCode").textContent = Room.code;
  $("roomCode").classList.remove("pending");
  $("roomTitle").textContent = "Your board is open";
  roomWait("waiting for them…", true);
  roomOpened(Room.code);
}
function keepBoardOpen() {
  stopScan();
  showMenu();
  toast("📡 Your board stays open. Play while you wait — when they arrive, the room takes you straight to it.");
}
/* the joiner's side of an invite link: who is asking, before knocking */
function takeJoinExtras(hash) {
  joinExtras = null;
  if (!/#join=[A-Za-z]{4}&/.test(hash || "")) return;
  var o = {}, re = /[&](n|c|s)=([^&]*)/g, m;
  while ((m = re.exec(hash))) {
    var v = "";
    try { v = decodeURIComponent(m[2]); } catch (e) { v = ""; }
    o[m[1]] = v;
  }
  var n = String(o.n || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 18);
  var c = /^(none|\d{1,3}\+\d{1,3})$/.test(o.c || "") ? o.c : "";
  var s = o.s === "w" || o.s === "b" ? o.s : "";
  if (n || c || s) joinExtras = { n: n, c: c, s: s };
}
function showJoinExtras() {
  var how = $("joinHow");
  if (!how) return;
  var x = joinExtras;
  joinExtras = null;
  if (!x) { how.innerHTML = "Ask your friend to tap <b>Invite a friend</b> — they'll send a link or read you four letters."; return; }
  how.innerHTML = "<b>" + escHtml(x.n || "A friend") + "</b> challenges you — " + escHtml(clockWords(x.c)) +
    (x.s ? ", you'll have <b>" + (x.s === "w" ? "White" : "Black") + "</b>" : "") + ".";
}
/* Two phones on different networks usually find each other through
   the mailbox; some pairs (some mobile data, some office Wi-Fi) cannot
   talk directly at all, and there is no relay here to carry them. Rather
   than knock forever, the room says so — once, plainly. */
var joinStallT = 0;
function watchJoinStall(code) {
  clearTimeout(joinStallT);
  joinStallT = setTimeout(function () {
    if (Net.everLinked || mode === "lan" || linkRole !== "join" || $("ovLink").classList.contains("hide")) return;
    joinNote("still reaching " + code + "… Two phones on different networks sometimes can't talk directly " +
      "(some mobile data and office Wi-Fi block it). On the same Wi-Fi it always works — so does one phone's hotspot.");
  }, 22000);
}

/* ----- the link card's people strip ----- */
function renderLinkPeople() {
  hostFor = "";
  var box = $("linkPeople");
  if (!box) return;
  var rows = Friends.table(friends).slice(0, 3);
  var html = "", any = false;
  if (Net.isHost && Net.state === "hosting" && Room.code && mode !== "lan") {
    any = true;
    html +='<button class="roomRow" data-act="open"><span class="rrCode">' + escHtml(Room.code) +
      '</span><span class="rrTx"><b>Your board is still open</b><i>waiting — tap to show the code</i></span><span class="rrGo">show ▸</span></button>';
  }
  html += '<div class="friendOpen hide" id="friendOpen"></div>';
  if (rows.length) {
    any = true;
    html +='<div class="peopleChips">' + rows.map(function (r, i) {
      return '<button class="chip" data-act="challenge" data-i="' + i + '">⚔ ' + escHtml(r.name) + "</button>";
    }).join("") + '<button class="linkish" data-act="people">Your people ›</button></div>';
  }
  box.innerHTML = html;
  box.classList.toggle("hide", !any);
  Array.prototype.forEach.call(box.querySelectorAll("[data-act]"), function (b) {
    b.addEventListener("click", function () {
      var act = b.dataset.act;
      if (act === "open") showOpenBoard();
      else if (act === "people") showPeople(null, "link");
      else if (act === "challenge") challengeFriend(rows[+b.dataset.i].name);
    });
  });
  /* one look at the public list of waiting boards, never polled: a name
     already on your table, or a board opened "For" you */
  if (!friends.list.length || Room.live === false) return;
  Net.roomList().then(function (rooms) {
    var h = rooms ? Friends.hosting(friends, rooms, prefs.name) : null;
    var el = $("friendOpen");
    if (!h || !el || $("ovLink").classList.contains("hide")) return;
    el.innerHTML = '<button class="roomRow"><span class="rrCode">' + escHtml(h.code) + '</span><span class="rrTx"><b>' +
      escHtml(h.name) + (h.forYou ? " opened a board for you" : " has a board open") + '</b><i>right now</i></span><span class="rrGo">join ▸</span></button>';
    el.classList.remove("hide");
    box.classList.remove("hide");
    el.querySelector("button").addEventListener("click", function () { grabName(); joinFlow(h.code); });
  }).catch(function () {});
}
function challengeFriend(name) {
  openLink();
  hostFor = String(name || "").slice(0, 18);
  hostFlow(false);
}

/* ----- your people: the card ----- */
function relDay(t) {
  if (!t) return "";
  var days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return days + " days ago";
  var d = new Date(t);
  return d.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
}
var RESULT_WORD = { w: "you won", d: "drawn", l: "they won" };
function renderPeople(box, focus) {
  var list = friends.list;
  if (!list.length) {
    box.innerHTML = '<div class="roomEmpty">Nobody yet. Play someone on another device — a board you open from <b>Play a friend</b> — and they are kept here, with the score between you.</div>';
    return;
  }
  box.innerHTML = "";
  list.forEach(function (f, idx) {
    var t = Friends.tally(f);
    var wrap = document.createElement("div");
    wrap.className = "personRow" + (focus && (focus === f.id || focus === f.name) ? " open" : "");
    var head = document.createElement("button");
    head.className = "personHead";
    head.innerHTML = '<span class="pnName"><b>' + escHtml(f.name) + "</b><small>" + escHtml(t.text || "No games yet") +
      " · " + escHtml(relDay(f.last)) + '</small></span><span class="pnScore">' + f.w + "–" + f.d + "–" + f.l +
      '<small>' + escHtml(Friends.recent(f, 5)) + "</small></span>";
    head.addEventListener("click", function () { wrap.classList.toggle("open"); });
    wrap.appendChild(head);
    var more = document.createElement("div");
    more.className = "personMore";
    var acts = document.createElement("div");
    acts.className = "rowbtns";
    acts.appendChild(chipBtn("⚔ Challenge " + f.name, function () { challengeFriend(f.name); }));
    acts.appendChild(chipBtn("Forget", function () {
      ask("Forget " + escHtml(f.name) + " and your games together? This phone is the only place they are kept.",
        [{ label: "Forget", fn: function () {
            friends = Friends.forget(friends, f.id, f.id ? null : f.name);
            Friends.save(friends, lsSet);
            renderPeople(box, null);
          } },
         { label: "Keep", fn: function () {}, ghost: true }]);
    }));
    more.appendChild(acts);
    f.games.forEach(function (g) {
      var line = document.createElement("div");
      line.className = "pgRow";
      var plies = g.s.length;
      line.innerHTML = '<span class="pgTx"><b>' + RESULT_WORD[g.r] + "</b> · " + (g.side === 1 ? "you had White" : "you had Black") +
        " · " + (plies ? Math.ceil(plies / 2) + (plies > 2 ? " moves" : " move") : "") + "<small>" + escHtml(relDay(g.at)) + (g.y ? " · " + escHtml(g.y) : "") + "</small></span>";
      if (plies) {
        var me = prefs.name || "You";
        var game = { sans: g.s.slice(), white: g.side === 1 ? me : f.name, black: g.side === 1 ? f.name : me,
                     result: g.r === "d" ? "draw" : ((g.r === "w") === (g.side === 1) ? "white" : "black"),
                     reason: g.y, clock: "none", day: "", ply: -1, ask: "", from: "" };
        line.appendChild(chipBtn("▶ Look", function () { openShared(game); }));
        line.appendChild(chipBtn("📨", function () { shareGame(game, "people"); }));
      }
      more.appendChild(line);
    });
    wrap.appendChild(more);
    box.appendChild(wrap);
    if (idx === 0 && !focus && list.length === 1) wrap.classList.add("open");
  });
}
function showPeople(focus, from) {
  peopleFrom = from || "menu";
  hideAllOverlays();
  renderPeople($("peopleList"), focus);
  $("peopleMe").textContent = prefs.name ? "Kept on this phone for " + prefs.name + "." : "Kept on this phone.";
  $("ovPeople").classList.remove("hide");
}
function peopleBack() {
  $("ovPeople").classList.add("hide");
  if (peopleFrom === "end" && over) { $("ovEnd").classList.remove("hide"); syncTurnStrip(); return; }
  if (peopleFrom === "link") { openLink(); return; }
  showMenu();
}

/* ----- a game you can send ----- */
function shareName(side) {
  if (mode === "coach") return side === humanSide ? (prefs.name || "A player") : SKILLS[skill].label;
  if (mode === "lan") return side === lanSide ? (lanMy || prefs.name || "A player") : (lanOpp || "A friend");
  if (mode === "review" && sharedView) return side === 1 ? sharedView.white : sharedView.black;
  return side === 1 ? "White" : "Black";
}
/* the game on the board, as a sendable thing; `ply` points at one move */
function liveGame(ply) {
  if (!G) return null;
  return { sans: G.played.map(function (r) { return r.san; }), white: shareName(1), black: shareName(-1),
           result: over ? over.result : null, reason: over ? over.reason : "", clock: clockStrOf(),
           day: mode === "review" && sharedView ? sharedView.day : "", ply: ply == null ? -1 : ply, ask: "", from: prefs.name || "", fen: G.startFen || null };
}
function openingOf(sans) {
  var s = sans.slice(0, 36).map(function (x) { return x.replace(/[+#]$/, ""); });
  var eco = (typeof Eco !== "undefined") ? Eco.match(s) : null, entry = Book.match(s);
  if (eco && (!entry || eco.seq.split(" ").length >= entry.seq.split(" ").length)) return eco.name;
  return entry ? entry.name : "";
}
var lastShare = null;      /* the last sheet's words, for the check */
function shareGame(game, from) {
  if (game && game.fen) { notationSendFen(game); return; }
  if (!game || !game.sans || (!game.sans.length && game.ply < 0)) { toast("Nothing to send yet — play a move first."); return; }
  var at = game.day ? Date.parse(game.day + "T12:00:00") : Date.now();
  var payload = Share.gamePayload({ sans: game.sans, white: game.white, black: game.black, result: game.result,
    reason: game.reason, clock: game.clock, at: at, ply: game.ply, ask: game.ask, from: game.from || prefs.name });
  Share.pack("GAME", payload).then(function (code) {
    var url = Share.url(code);
    var clean = Share.cleanGame(payload, Chess) || game;
    var opening = openingOf(game.sans);
    var text = Share.text(clean, { opening: opening, url: url });
    lastShare = { code: code, url: url, text: text };
    openShareCard({
      title: game.ply >= 0 ? "Send this position" : (game.result ? "Send this game" : "Send this game so far"),
      sub: game.ply >= 0 ? "The link opens the board at this move, with your question — their coach does the judging."
                         : "The whole game rides in the link. It opens on any phone, ready to step through, and their own coach reads it on arrival.",
      text: text, url: url, pgn: Share.pgn(clean, { opening: opening, site: location.host ? location.host + location.pathname : "" })
    }, from);
  }, function () { toast("That game wouldn't pack into a link — copy its moves from the list instead."); });
}
function openShareCard(o, from) {
  shareFrom = from || null;
  hideAllOverlays();
  $("shareTitle").textContent = o.title;
  $("shareSub").textContent = o.sub;
  $("shareTx").value = o.text;
  $("shareTx").dataset.url = o.url;
  $("shareTx").dataset.pgn = o.pgn || "";
  var web = /^https?:/.test(o.url);
  var drawn = web && o.url.length <= 1600 && Net.drawQR($("shareQR"), o.url);
  $("shareQRWrap").classList.toggle("hide", !drawn);
  $("sharePgn").classList.toggle("hide", !o.pgn);
  $("ovShare").classList.remove("hide");
  snd("open");
}
function closeShare() {
  $("ovShare").classList.add("hide");
  if (shareFrom === "end" && over) { $("ovEnd").classList.remove("hide"); syncTurnStrip(); return; }
  if (shareFrom === "menu") { showMenu(); return; }
  if (shareFrom === "people") { $("ovPeople").classList.remove("hide"); return; }
  syncTurnStrip();
}
/* a chip in the lobby for the game in progress — sent as it stands */
function gameOpsSend(ops, hasLive) {
  if (!hasLive || !G || !G.played.length || (mode !== "coach" && mode !== "pass" && mode !== "lan")) return;
  var row = document.createElement("div"); row.className = "rowbtns";
  row.appendChild(chipBtn("📨 Send this game so far", function () { shareGame(liveGame(), "menu"); }));
  ops.appendChild(row);
}

/* ----- arriving by link: always an offer, never applied behind your back ----- */
var GAME_HASH = /#game=(GAME[01]\.[A-Za-z0-9_-]+)/;
function offerSharedGame(delay) {
  var m = (location.hash || "").match(GAME_HASH);
  if (!m) return false;
  history.replaceState(null, "", location.pathname);
  Share.unpack(m[1]).then(function (p) {
    var g = p && p.kind === "GAME" ? Share.cleanGame(p.obj, Chess) : null;
    setTimeout(function () {
      if (!g) { toast("That game link looks damaged — ask for a fresh one."); return; }
      var from = g.from ? escHtml(g.from) : "a friend";
      var head = "<b>" + escHtml(g.white) + " vs " + escHtml(g.black) + "</b>";
      toast(g.ply >= 0
        ? "📨 From " + from + ": a position from " + head + ", move " + (Math.floor(g.ply / 2) + 1) + ". Have a look?"
        : "📨 " + head + " · " + Share.scoreText(g.result) + " · " + Math.ceil(g.sans.length / 2) + " moves — a game sent to you. Open it?",
        [{ label: "Open", fn: function () { openShared(g); } },
         { label: "Not now", fn: function () {}, ghost: true }], 20000);
    }, delay || 0);
  });
  return true;
}

/* ----- the viewer -----
   A sent game opens on the board as a game that has already happened:
   the moves in the list, the names in the bar, ◀ ▶ to step, and — while
   you look — this room's own coach reading it move by move, the same
   reading it gives your own games, its marks landing in the list as it
   goes. Nothing about it is saved unless you play on from it. */
function openShared(g) {
  if (mode === "lan" && Net.linked() && !over) { toast("Finish (or leave) the game you're linked in first — the link will keep."); return; }
  stopTour(); quietBoard(); hideAllOverlays(); closeStudio();
  lesson = null; lessonDone = false; lessonQueue = [];
  teachSeen = {}; teachCool = 0; taughtAt = [];
  reviewMemo = {}; assist = { takebacks: 0, hints: 0 }; ratedDone = true; lastEval = 0;
  keptGame = null; reviewNames = null;   /* a kept game being looked at gives way to this one */
  mode = "review";
  G = notationGame(g.fen);
  for (var i = 0; i < g.sans.length; i++) {
    var m = Chess.fromSAN(G, g.sans[i]);
    if (!m) break;
    Chess.play(G, m);
  }
  over = g.result ? { result: g.result, reason: REASON_WORDS[g.reason] || g.reason || "" } : null;
  sharedView = { white: g.white, black: g.black, result: g.result, reason: over ? over.reason : "", day: g.day || "",
                 ask: g.ask || "", from: g.from || "", ply: g.ply, read: 0, total: G.played.length, done: false };
  clearSel(); clearLines(); viewPly = -1; lastNarratedOpening = "";
  clockConfig("none");
  hideOpeningCard();
  /* a position is seen from the side that has to find the move */
  orientation = g.ply >= 0 && g.ply % 2 === 0 ? -1 : 1;
  R.setOrientation(orientation);
  if (FX) Fx.clear();
  narrateOpening("", "resume");
  var start = g.ply >= 0 ? g.ply : 0;
  if (G.played.length) viewAt(Math.min(start, G.played.length - 1));
  R.setPosition(currentViewBoard(), { flourish: true });
  syncAll();
  sharedBar();
  snd("open");
  readSharedGame(gameTicket);
}
function sharedBar() {
  if (mode !== "review" || !sharedView) return;
  var v = sharedView;
  var day = v.day ? " · " + relDay(Date.parse(v.day + "T12:00:00")) : "";
  var res = v.result ? Share.scoreText(v.result) + (v.reason ? " (" + esc(v.reason) + ")" : "") : "unfinished";
  var said;
  if (v.ply >= 0) said = "<b>" + esc(v.ask || (v.ply % 2 === 0 ? "Black" : "White") + " to play. What would you do?") + "</b>" +
    (v.from ? " — from " + esc(v.from) + "." : "");
  else said = v.say || "Step through with ◀ ▶, or tap any move in the list.";
  var reading = voice() === "off" ? " The coach is off, so nothing is marked."
    : (v.done ? " The coach has read it" + (Object.keys(marks).length ? " — the marked moves have a note." : ": nothing it needed to say.")
              : " The coach is reading it… " + v.read + " of " + v.total + ".");
  lessonUI('<div class="lkick">' + (v.kick || "📨 " + esc(v.white) + " vs " + esc(v.black) + " · " + res + day) + "</div>" +
           '<div class="lsay">' + said + (v.total ? '<small class="lread">' + reading + "</small>" : "") + "</div>");
  lessonRow([
    lessonChip("◀", function () { sharedStep(-1); }),
    lessonChip("▶", function () { sharedStep(1); }),
    lessonChip("▶ Play from here", playFromShared, true),
    lessonChip("📨 Send", function () { shareGame(liveGame(viewPly >= 0 && v.ply >= 0 ? viewPly : v.ply), null); }),
    notationChip(),
    lessonChip("Done", showMenu)
  ]);
}
function sharedStep(d) {
  if (!G || !G.played.length) return;
  var at = viewPly >= 0 ? viewPly : G.played.length - 1;
  var to = Math.max(0, Math.min(G.played.length - 1, at + d));
  if (to === at && viewPly >= 0 && d > 0) { exitView(); return; }
  if (d > 0 && to === at + 1 && !REDUCED) {
    /* one step forward is a move being played: it is seen moving */
    var rec = G.played[to];
    viewAt(at);
    viewPly = to === G.played.length - 1 ? -1 : to;
    showViewBanner(viewPly >= 0);
    var t = Chess.create(G.startFen);
    for (var i = 0; i <= to; i++) Chess.make(t, G.played[i].m);
    var desc = animDescriptor(rec.m);
    sndMove(desc, R.animateMove(desc, t.board, { scale: 1.3 }, function () { syncBoard(); }), rec.m.capt);
    syncMoveList(); syncBars(); syncTurnStrip();
    needFrame();
    return;
  }
  viewAt(to);
}
/* the receiver's own coach reads every move, both sides, at the depth it
   reads your games — so the marks are a second opinion, never the
   sender's claim about their own play */
function readSharedGame(ticket) {
  var v = sharedView, ply = 0;
  if (!v || voice() === "off") { if (v) { v.done = true; sharedBar(); } return; }
  function next() {
    if (ticket !== gameTicket || mode !== "review" || sharedView !== v) return;
    if (ply >= G.played.length) { v.done = true; sharedBar(); return; }
    var p = ply, pre = Chess.create(G.startFen);
    for (var k = 0; k < p; k++) Chess.play(pre, G.played[k].m);
    var want = G.played[p].m, mine = null, list = Chess.moves(pre);
    for (var j = 0; j < list.length; j++) {
      if (list[j].from === want.from && list[j].to === want.to && (list[j].promo || 0) === (want.promo || 0)) { mine = list[j]; break; }
    }
    ply++;
    if (!mine) { next(); return; }
    Brain.review(pre, mine, { ms: 600, mark: true, maxDepth: Rating.REVIEW_DEPTH, depth: Rating.REVIEW_DEPTH }).then(function (res) {
      if (ticket !== gameTicket || mode !== "review" || sharedView !== v) return;
      if (res) {
        reviewMemo[p] = { best: res.bestScore, played: res.playedScore };
        showReview(pre, G.played[p].san, res, mine, p);
      }
      v.read = ply;
      if (ply % 4 === 0 || ply >= G.played.length) sharedBar();
      setTimeout(next, 0);
    }, function () { if (ticket === gameTicket) setTimeout(next, 0); });
  }
  next();
}
/* Take the game over from the move on the board: against the coach (a
   friendly game — the position was not a fair start, so it is never
   rated) or with somebody on this screen. */
function playFromShared() {
  if (mode !== "review" || !G) return;
  var upto = viewPly >= 0 ? viewPly : G.played.length - 1;
  var sans = G.played.slice(0, upto + 1).map(function (r) { return r.san; });
  var fen0 = G.startFen, probe = Chess.create(fen0);
  sans.forEach(function (s) { var m = Chess.fromSAN(probe, s); if (m) Chess.play(probe, m); });
  if (Chess.status(probe).over) { toast("That position is already over — step back a move or two and play on from there."); return; }
  var side = probe.turn;
  ask("Play on from move " + notationMoveNo(sans.length) + ", as " + (side === 1 ? "White" : "Black") + "?",
    [{ label: "🤖 Against the coach", fn: function () { playOnFrom("coach", sans, side, fen0); } },
     { label: "🤝 Two players, one device", fn: function () { playOnFrom("pass", sans, side, fen0); } },
     { label: "Not now", fn: function () {}, ghost: true }]);
}
function playOnFrom(kind, sans, side, fen) {
  sharedView = null;
  startGame(kind, { humanSide: side, skill: nextLevel(), clockStr: "none", fen: fen });
  for (var i = 0; i < sans.length; i++) {
    var m = Chess.fromSAN(G, sans[i]);
    if (!m) break;
    Chess.play(G, m);
  }
  /* startGame may have asked the coach for a first move from the empty
     board; that question is about a position nobody is playing now */
  brainTicket++; clearTimeout(coachTimer); thinking = false; Brain.cancel();
  if (kind === "coach") ratedDone = true;     /* friendly: never rated */
  R.setPosition(G.board);
  syncAll();
  narrateOpening("", "resume");
  saveGame();
  toast(kind === "coach"
    ? "You're " + (side === 1 ? "White" : "Black") + ", playing on against " + SKILLS[skill].label + " — a friendly game, not rated."
    : "Playing on from here — " + (side === 1 ? "White" : "Black") + " to move.");
}
function leaveSharedView() {
  if (mode !== "review") return;
  gameTicket++; Brain.cancel();
  sharedView = null; mode = null;
}

function wireFriends() {
  $("roomKeep").addEventListener("click", keepBoardOpen);
  $("mOpenBoard").addEventListener("click", showOpenBoard);
  $("endSend").addEventListener("click", function () { shareGame(liveGame(), "end"); });
  $("endPeople").addEventListener("click", function () { showPeople(lanOppId || lanOpp, "end"); });
  $("peopleBack").addEventListener("click", peopleBack);
  $("shareBack").addEventListener("click", closeShare);
  $("shareSend").addEventListener("click", function () {
    var tx = $("shareTx").value, url = $("shareTx").dataset.url || "";
    var words = tx.replace(url, "").trim();
    if (navigator.share && /^https?:/.test(url)) navigator.share({ title: "A chess game", text: words, url: url }).catch(function () {});
    else clip(tx);
  });
  $("shareCopy").addEventListener("click", function () { clip($("shareTx").value); });
  $("sharePgn").addEventListener("click", function () { clip($("shareTx").dataset.pgn || ""); });
  ["ovShare", "ovPeople"].forEach(function (id) {
    $(id).addEventListener("click", function (e) { if (e.target === this) (id === "ovShare" ? closeShare : peopleBack)(); });
  });
  /* Escape backs out of these two the way their own buttons do — ahead
     of the room's general Escape, which would go to the lobby */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || askCancel) return;
    if (!$("ovShare").classList.contains("hide")) { closeShare(); e.stopImmediatePropagation(); }
    else if (!$("ovPeople").classList.contains("hide")) { peopleBack(); e.stopImmediatePropagation(); }
  }, true);
}

/* ===== notation: PGN and FEN, out and in (pgn.js) =====
   The room's games used to leave it only as a link to another room. A
   player who already plays keeps their games somewhere else too — a
   club's database, lichess's analysis board, a notebook — and brings
   positions back from books and puzzles. So any game on the board copies
   out as PGN and any position as FEN, and any PGN or FEN comes back in:
   a game opens in the same read-only viewer a sent game does (the coach
   reads it on arrival, ◀ ▶ to step, Play from here), and a position opens
   on the same board, ready to be played on against the coach or by two
   people on this screen.

   A game that did not begin from the usual position carries that
   position with it (G.startFen) wherever the room rebuilds a board from
   the moves — the look-back, the save, a reload, a take-back. Such a
   game is never rated: a position from somewhere else is not a fair
   start, and a set-up position can make any result easy. Nor is it kept
   in the journal, whose games, feats and next steps are all about whole
   games of your own; the end card says so, and its Send copies the PGN
   instead, because a game link carries only moves from the start. */
var notationTimer = 0, notationLast = null;

/* a board for a game that starts here: the usual one, or a set-up one
   that remembers where it began */
function notationGame(fen) {
  var g = Chess.create(fen || undefined);
  if (fen && !Pgn.isStart(fen)) g.startFen = Chess.fen(g);
  return g;
}
/* which side made a ply, and the number it is written with — from a
   set-up position Black may have moved first, at move 30 */
function notationOff() { return G && G.startFen && G.startFen.split(" ")[1] === "b" ? 1 : 0; }
function notationMoveNo(ply) { return Pgn.moveNo(ply, G && G.startFen); }
function notationSideOf(ply) {
  var r = G && G.played[ply];
  return r ? (r.m.piece > 0 ? 1 : -1) : ((ply + notationOff()) % 2 === 0 ? 1 : -1);
}

/* ---- out ---- */
function notationDay() {
  var d = new Date();
  return d.getFullYear() + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + ("0" + d.getDate()).slice(-2);
}
function notationPgnText() {
  if (!G) return "";
  /* a kept game has the journal's own fuller PGN: the coach's rating, the opening */
  if (mode === "review" && keptGame) return Games.pgn(keptGame, Rating.LEVELS, myName());
  var res = over ? (over.result === "white" ? "1-0" : over.result === "black" ? "0-1" : "1/2-1/2") : "*";
  var v = mode === "review" ? sharedView : null, tags = v && v.tags ? v.tags : {};
  var headers = [["Event", tags.Event || "The Chess Room"], ["Site", tags.Site || "kmay89.com/chess"],
    ["Date", tags.Date || (v && v.day ? v.day.replace(/-/g, ".") : notationDay())], ["Round", tags.Round || "-"],
    ["White", shareName(1)], ["Black", shareName(-1)]];
  Object.keys(tags).forEach(function (k) {
    if (Pgn.ROSTER.indexOf(k) < 0 && k !== "SetUp" && k !== "FEN") headers.push([k, tags[k]]);
  });
  if (clock.on && mode !== "review") headers.push(["TimeControl", (clock.base / 1000) + "+" + (clock.inc / 1000)]);
  if (over && over.reason && !tags.Termination) headers.push(["Termination", over.reason]);
  return Pgn.write({ headers: headers, sans: G.played.map(function (r) { return r.san; }), result: res,
                     fen: G.startFen || null, marks: voice() === "off" ? {} : marks });
}
/* the position on the board: when looking back, the one being looked at */
function notationFenText() {
  if (!G) return "";
  if (viewPly < 0) return Chess.fen(G);
  var rec = G.played[viewPly];
  if (rec && rec.fen) return rec.fen;
  var t = Chess.create(G.startFen);
  for (var i = 0; i <= viewPly && i < G.played.length; i++) Chess.make(t, G.played[i].m);
  return Chess.fen(t);
}
var notationCopied = null;      /* the last thing copied out, for the check */
function notationCopy(text, what, from) {
  if (!text) return;
  notationCopied = text;
  /* where the clipboard is out of reach, the share card shows the text to copy by hand */
  var fallback = function () {
    openShareCard({ title: "Copy " + what, sub: "Select it and copy — every chess program reads it.", text: text, url: "", pgn: "" }, from || null);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { toast("📋 Copied " + what + "."); }, fallback);
  } else fallback();
}
/* the one chip, wherever the moves are: Copy PGN or FEN */
function notationOffer(from) {
  if (!G) return;
  var n = G.played.length, mv = Math.ceil(n / 2), at = viewPly >= 0 ? viewPly : n - 1;
  var where = at < 0 ? "as it stands now" : "after " + Pgn.label(at, G.startFen, G.played[at].san);
  ask("<b>This game as text</b><br>" + (n ? "PGN is the whole game — " + mv + (mv === 1 ? " move" : " moves") +
      " — and every chess program reads it. FEN is the position on the board, " + esc(where) + "."
      : "FEN is the position on the board; PGN is the same position as a game with no moves yet. Every chess program reads both."),
    [{ label: "📋 Copy PGN", fn: function () { notationCopy(notationPgnText(), "the game as PGN", from); } },
     { label: "📋 Copy FEN", fn: function () { notationCopy(notationFenText(), "the position as FEN", from); } },
     { label: "Not now", fn: function () {} }]);
}
function notationChip() { return lessonChip("📋 PGN · FEN", function () { notationOffer(null); }); }
/* in the lobby, beside "Send this game so far" */
function notationOps(ops, hasLive) {
  if (!hasLive || !G || (!G.played.length && !G.startFen) || (mode !== "coach" && mode !== "pass" && mode !== "lan")) return;
  var row = ops.lastElementChild;
  if (!row || !row.classList.contains("rowbtns")) { row = document.createElement("div"); row.className = "rowbtns"; ops.appendChild(row); }
  row.appendChild(chipBtn("📋 PGN · FEN", function () { notationOffer("menu"); }));
}
/* a game link carries moves from the usual start only, so a game from a
   set-up position goes out as PGN */
function notationSendFen(game) {
  notationCopy(Share.pgn(game, {}), "this game as PGN (a game from a set-up position travels as PGN, not as a link)");
}
/* the end of a game from a set-up position: said plainly on the card */
function notationAtEnd() {
  var sub = $("endSub");
  if (sub) sub.textContent = (sub.textContent ? sub.textContent + " " : "") +
    "A game from a set-up position isn't rated or kept in your journal — Send copies its PGN.";
  /* and the rematch is a whole game again, from the usual start */
  var rs = $("endRematchSub");
  if (rs) rs.textContent = "A fresh game from the usual start" + (mode === "coach" ? ", against the same coach." : ".");
}

/* ---- in ---- */
function openNotation(text) {
  hideAllOverlays();
  $("notationIn").value = text || "";
  notationReadNow();
  $("ovNotation").classList.remove("hide");
  snd("open");
}
function closeNotation() {
  $("ovNotation").classList.add("hide");
  showMenu();
}
function notationReadNow() {
  clearTimeout(notationTimer);
  var text = $("notationIn").value, says = $("notationSays"), go = $("notationGo");
  var p = text.trim() ? Pgn.read(text, Chess) : null;
  notationLast = p;
  says.textContent = p ? Pgn.summary(p) : "";
  says.classList.toggle("bad", !!(p && !p.ok));
  go.disabled = !(p && p.ok);
  $("notationGoTx").textContent = p && p.ok && p.kind === "position" ? "Look at it" : "Step through it";
  $("notationGoSub").textContent = !p ? "Paste something first." : !p.ok ? "Nothing to open yet." :
    p.kind === "position" ? "Then play from here — against the coach, or two players on this screen."
                          : "On the board, read-only — then play on from any move.";
}
function notationFile(file) {
  if (!file) return;
  if (file.size > 2000000) { toast("That file is too big to be a game."); return; }
  var r = new FileReader();
  r.onload = function () { $("notationIn").value = String(r.result || ""); notationReadNow(); };
  r.onerror = function () { toast("That file couldn't be read."); };
  r.readAsText(file);
}
function notationPaste() {
  var box = $("notationIn");
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(function (t) {
      if (t && t.trim()) { box.value = t; notationReadNow(); } else { box.focus(); toast("Nothing on the clipboard — paste into the box."); }
    }, function () { box.focus(); toast("Paste into the box (long-press, then Paste)."); });
  } else { box.focus(); toast("Paste into the box (long-press, then Paste)."); }
}
/* what was read → the viewer a sent game uses: one viewer, not a third */
function notationOpen(p) {
  if (!p || !p.ok) return;
  var res = p.result === "1-0" ? "white" : p.result === "0-1" ? "black" : p.result === "1/2-1/2" ? "draw" : null;
  var date = p.headers.Date || "", day = /^\d{4}\.\d{2}\.\d{2}$/.test(date) ? date.replace(/\./g, "-") : "";
  var white = p.white.slice(0, 40), black = p.black.slice(0, 40);
  $("ovNotation").classList.add("hide");
  openShared({ sans: p.sans, white: white, black: black, result: res, reason: p.reason, day: day,
               ply: -1, ask: "", from: "", fen: p.fen });
  if (mode !== "review" || !sharedView) return;
  var v = sharedView;
  v.tags = p.headers;
  if (p.kind === "position") {
    var side = p.turn === -1 ? "Black" : "White";
    v.kick = "📋 A position · " + side + " to move";
    v.say = "<b>" + side + " to move.</b> Look it over, then <b>▶ Play from here</b> — against the coach, or two players on this screen." +
            (p.notes.length ? " <small>" + esc(p.notes.join(" ")) + "</small>" : "");
    orientation = p.turn === -1 ? -1 : 1;
    R.setOrientation(orientation);
    syncAll();
  } else {
    v.kick = "📋 " + esc(white) + " vs " + esc(black) + " · " +
      (res ? Share.scoreText(res) + (p.reason ? " (" + esc(p.reason) + ")" : "") : "no result") + (p.fen ? " · from a set-up position" : "");
    v.say = (p.error ? "It stops at <b>" + esc(p.error.at) + "</b>: " + esc(p.error.why) + ". " : "") +
            "Step through with ◀ ▶, or tap any move in the list." + (p.notes.length ? " <small>" + esc(p.notes.join(" ")) + "</small>" : "");
  }
  sharedBar();
  needFrame();
}

/* ---- links: #fen=… and #pgn=… are offered, never opened behind your back ---- */
var NOTATION_HASH = /#(fen|pgn)=([^&]*)/;
function notationOfferHash(delay) {
  var m = (location.hash || "").match(NOTATION_HASH);
  if (!m) return false;
  history.replaceState(null, "", location.pathname);
  var text = "";
  try { text = decodeURIComponent(m[2]); } catch (e) { text = ""; }
  if (m[1] === "fen") text = text.replace(/_/g, " ");
  if (text.length > 20000) text = "";
  var p = text ? Pgn.read(text, Chess) : null;
  setTimeout(function () {
    if (!p || !p.ok) {
      toast("That " + (m[1] === "fen" ? "position" : "game") + " link doesn't read" + (p && p.error ? " — " + esc(p.error.why) : ".")); return;
    }
    var mv = Math.ceil(p.plies / 2);
    var what = p.kind === "position" ? "a position, " + (p.turn === -1 ? "Black" : "White") + " to move"
                                     : "a game, " + mv + (mv === 1 ? " move" : " moves");
    toast("📋 A link with " + what + ". Open it?",
      [{ label: "Open", fn: function () { openNotation(text); } },
       { label: "Not now", fn: function () {}, ghost: true }], 20000);
  }, delay || 0);
  return true;
}

function wireNotation() {
  $("mNotation").addEventListener("click", function () { openNotation(""); });
  $("notationIn").addEventListener("input", function () { clearTimeout(notationTimer); notationTimer = setTimeout(notationReadNow, 160); });
  $("notationIn").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); notationReadNow(); notationOpen(notationLast); }
  });
  $("notationPaste").addEventListener("click", notationPaste);
  $("notationFile").addEventListener("click", function () { $("notationFileIn").click(); });
  $("notationFileIn").addEventListener("change", function () { notationFile(this.files && this.files[0]); this.value = ""; });
  $("notationGo").addEventListener("click", function () { notationReadNow(); notationOpen(notationLast); });
  $("notationBack").addEventListener("click", closeNotation);
  var ov = $("ovNotation");
  ov.addEventListener("click", function (e) { if (e.target === this) closeNotation(); });
  ov.addEventListener("dragover", function (e) { e.preventDefault(); });
  ov.addEventListener("drop", function (e) {
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) notationFile(f);
  });
  /* Escape backs out to the lobby, even from inside the box */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || askCancel || ov.classList.contains("hide")) return;
    closeNotation(); e.stopImmediatePropagation();
  }, true);
}
function notationForTest() {
  return { Pgn: Pgn, openNotation: openNotation, notationOpen: notationOpen,
    notationPgnText: notationPgnText, notationFenText: notationFenText,
    notationCopiedForTest: function () { return notationCopied; },
    startFenForTest: function () { return G ? G.startFen || null : null; },
    ratedDoneForTest: function () { return ratedDone; } };
}

/* ===== opening stories (the tour) ===== */
function buildOpeningList() {
  var box = $("openingList");
  box.innerHTML = "";
  /* show the lines that have at least 2 moves — the named stories */
  Book.LINES.filter(function (l) { return l.seq.split(" ").length >= 2; }).forEach(function (l) {
    var d = document.createElement("div");
    d.className = "oline";
    d.setAttribute("role", "button"); d.tabIndex = 0;
    d.innerHTML = "<b>" + l.name + "</b><span class='seq'>" + l.seq + "</span><small>" + l.idea + "</small>";
    d.addEventListener("click", function () { startTour(l); });
    d.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startTour(l); } });
    box.appendChild(d);
  });
}
/* a story or a lesson takes the board over completely: nothing still
   thinking or waiting to speak about the last game may follow it in */
function quietBoard() {
  brainTicket++; gameTicket++;
  if (HAP) Haptics.cancel();
  Brain.cancel();
  clearTimeout(coachTimer); thinking = false; hintPending = false;
  closePromo(); hideToast(); clearLines();
  clearNotes(); showPanelTab("moves");
  ink = Ink.create();
  if (R && R.resetView) R.resetView();
}
function startTour(line) {
  stopTour();
  quietBoard();
  mode = "tour";
  G = Chess.create();
  over = null; clearSel(); viewPly = -1;
  clockConfig("none");
  orientation = 1;
  R.setOrientation(1);
  R.setPosition(G.board, { flourish: true });
  hideAllOverlays();
  syncAll();
  tourLine = line; tourStep = 0; tourPaused = false;
  showOpeningCard(line.name, "", line.idea);
  tourBar();
  tourTimer = setTimeout(tourNext, REDUCED ? 600 : 2200);
}
/* A story used to flash each move's reason in a toast for under three
   seconds, with no way to stop it, go back, or read it again. Now it
   sits in a bar of its own — paused, stepped, rewound — stays on screen
   for as long as it takes to read, and is kept in the notebook. */
var tourPaused = false;
function tourSans() { return tourLine ? tourLine.seq.split(" ") : []; }
function tourBar() {
  if (mode !== "tour" || !tourLine) return;
  var n = tourSans().length, i = tourStep;
  var why = i > 0 && tourLine.why ? tourLine.why[i - 1] : null;
  var said = i === 0 ? (tourLine.idea || "Watch — each move explains itself.")
                     : "<b>" + esc(G.played[i - 1].san) + "</b>" + (why ? " — " + why : "");
  lessonUI('<div class="lkick">📖 ' + esc(tourLine.name) + " · " + (i >= n ? "the end of the story" : "move " + (i + 1) + " of " + n) + "</div>" +
           '<div class="lsay">' + said + "</div>");
  var row = [
    lessonChip("◀", tourBack),
    i < n ? lessonChip(tourPaused ? "▶ Play" : "⏸ Pause", function () {
      tourPaused = !tourPaused; clearTimeout(tourTimer);
      if (!tourPaused) tourTimer = setTimeout(tourNext, 400);
      tourBar();
    }, !tourPaused ? false : true) : null,
    i < n ? lessonChip("Next ▶", function () { clearTimeout(tourTimer); tourNext(); }) : null,
    i >= n ? lessonChip("▶ Play on from here", tourPlayOn, true) : null,
    lessonChip(i >= n ? "📖 Another story" : "Leave", function () { stopTour(); showOpenings(); })
  ];
  lessonRow(row);
}
function tourBack() {
  if (mode !== "tour" || !tourLine || !tourStep) return;
  clearTimeout(tourTimer); tourPaused = true;
  if (viewPly >= 0) exitView();
  Chess.takeBack(G); tourStep--;
  forgetNotesAfter(G.played.length - 1);
  R.setPosition(G.board);
  syncMoveList(); syncBars(); syncTurnStrip(); syncBoard();
  tourBar(); needFrame();
}
function tourPlayOn() {
  if (viewPly >= 0) exitView();
  var side = G.turn;
  stopTour();
  $("lessonBar").classList.add("hide"); document.body.classList.remove("lesson-on"); reflow();
  /* the book's moves were nobody's: a fresh, rated game from here, against
     the coach that gives you a fair fight */
  mode = "coach"; humanSide = side; skill = nextLevel();
  assist = { takebacks: 0, hints: 0 }; ratedDone = false; reviewMemo = {}; lastEval = 0; progressNewGame();
  orientation = side; R.setOrientation(side);
  syncAll(); saveGame();
  toast("You're " + (side === 1 ? "White" : "Black") + ", picking up where the book ends, against " + SKILLS[skill].label + ".");
}
function tourNext() {
  if (mode !== "tour" || !tourLine || tourPaused) return;
  /* browsing the move list pauses the story rather than moving the board
     underneath the position being looked at */
  if (viewPly >= 0) { tourTimer = setTimeout(tourNext, 600); return; }
  var sans = tourSans();
  if (tourStep >= sans.length) { tourBar(); return; }
  var m = Chess.fromSAN(G, sans[tourStep]);
  if (!m) { toast("(This story lost its page — that's a bug worth reporting.)"); return; }
  var why = tourLine.why && tourLine.why[tourStep];
  var desc = animDescriptor(m);
  var san = Chess.play(G, m);
  sndMove(desc, R.animateMove(desc, G.board, { scale: 1.7 }, null), m.capt);
  syncMoveList(); syncBars(); syncTurnStrip();
  if (why) note({ ply: G.played.length - 1, icon: "📖", tone: "note", key: "story", head: tourLine.name,
                  text: "<b>" + esc(san) + "</b> — " + why, brief: san + " · " + stripTags(why).slice(0, 60) });
  tourStep++;
  tourBar();
  /* long enough to read what was said, at an unhurried pace */
  var words = why ? stripTags(why).split(/\s+/).length : 0;
  if (tourStep >= sans.length) { snd("lesson-done"); return; }
  tourTimer = setTimeout(tourNext, REDUCED ? 500 : Math.max(2200, Math.min(8000, 1400 + words * 260)));
  needFrame();
}
function stopTour() {
  clearTimeout(tourTimer); tourLine = null; tourPaused = false;
  if (mode === "tour") { $("lessonBar").classList.add("hide"); document.body.classList.remove("lesson-on"); reflow(); }
}

/* ===== learn (the rules, gently) ===== */
var LEARN = [
  ["The idea of the game", "Chess is a conversation between two armies. The whole game is about one piece: the <b>king</b>. Trap the other king so it cannot escape capture — that's <b>checkmate</b> — and the game is over. Nothing else wins. You never actually capture the king; you corner it."],
  ["The board", "64 squares, 8×8. A square's name is its file (a–h, left to right from White's side) plus its rank (1–8, from White's side). White's queen starts on d1 — <i>queen on her own colour</i>. The board always sits with a light square in each player's right-hand corner."],
  ["The pawn ♙", "Walks one square forward, but <b>captures diagonally</b> — one square, forward-left or forward-right. On its very first move it may walk two. It can never go backward. Reach the far side, and it <b>promotes</b> — it becomes a queen (or knight, rook, or bishop). The humblest piece, with the biggest dream."],
  ["The knight ♘", "Moves in an L: two squares one way, then one square sideways. It is the only piece that <b>jumps over</b> others. Knights love the middle of the board and crowded positions where nothing else can move."],
  ["The bishop ♗", "Slides any distance along diagonals. Each bishop lives its whole life on one colour of squares. Your two bishops together cover everything — they work best as a pair, on open diagonals."],
  ["The rook ♖", "Slides any distance along ranks and files. Worth about five pawns. Rooks start in the corners and wake up late — give them open files and they win endgames."],
  ["The queen ♕", "Rook and bishop combined — the strongest piece, worth about nine pawns. Because she's so precious, bringing her out early lets your opponent develop pieces <i>while attacking her</i>. Let her enter like royalty: a little late, and decisively."],
  ["The king ♔", "One square in any direction. He can never move onto an attacked square. When he's attacked, that's <b>check</b> — and you must fix it immediately: move him, block the attack, or capture the attacker. If none of those exist, it's checkmate."],
  ["Castling", "Once per game, if neither piece has moved and the way is clear and safe: the king steps <b>two squares</b> toward a rook, and the rook hops to the far side of him. The only move where two of your pieces move at once. Castle early — a tucked-in king wins games."],
  ["En passant", "The strangest rule, and real: if an enemy pawn uses its two-square first move to land <i>beside</i> your pawn, you may capture it as if it had moved only one — but only on the very next move. The name is French for 'in passing'."],
  ["Draws", "Not every game has a winner. It's a draw when: the side to move has no legal move but isn't in check (<b>stalemate</b>); the same position occurs three times; fifty moves pass with no capture or pawn move; or neither side has enough pieces left to ever mate. Half a point each."],
  ["How to start well", "Three habits beat most beginners' tricks: <b>1.</b> Take a share of the centre. <b>2.</b> Develop knights and bishops before adventures. <b>3.</b> Castle. Then look at every enemy move and ask the magic question: <i>what does that threaten?</i> You're ready — go play."]
];
var learnAt = 0;
function showLearn(n) {
  hideAllOverlays();
  learnAt = Math.max(0, Math.min(LEARN.length - 1, n));
  $("learnBody").innerHTML = "<h2 style='margin-top:0'>" + LEARN[learnAt][0] + "</h2><p>" + LEARN[learnAt][1] + "</p>" +
    "<p style='text-align:center;color:var(--soft)'>" + (learnAt + 1) + " / " + LEARN.length + "</p>";
  $("learnPrev").style.visibility = learnAt === 0 ? "hidden" : "visible";
  $("learnNext").textContent = learnAt === LEARN.length - 1 ? "Play your first game →" : "Next →";
  $("ovLearn").classList.remove("hide");
}



/* ===================== odds =====================
   Chess has an old and generous tradition: the stronger player gives
   *odds* — a pawn, a piece, a slice of the clock — so that a lopsided
   game is still a real game. This is that idea, moved from before the
   game to during it, and paid in help rather than material.

   The player who is behind gets the racing line, the threat warnings
   and the nudges for nothing, offered before they ask. The player who
   is ahead can have exactly the same help, but it costs them: seconds
   off their clock if one is running, otherwise a mark against their
   name in the review at the end. The price rises with the lead.

   The effect is that a game between mismatched players keeps its shape
   — and both people are being coached the whole way, because the one in
   front is constantly being asked whether the help is worth the price,
   which is its own kind of thinking. */
var oddsSpent = { 1: 0, "-1": 0 };     /* seconds (or marks) each side has paid */
var oddsNudged = 0, oddsLastNudge = -99;

/* how far ahead `side` is, in pawns, from the position alone */
function lead(side) {
  if (!G) return 0;
  var ev = Chess.evaluate(G);                 /* from the side to move */
  var white = G.turn === 1 ? ev : -ev;
  return (side === 1 ? white : -white) / 100;
}

/* what help costs this side right now */
function oddsFor(side) {
  var d = lead(side);
  if (d <= -1.2) {
    return { free: true, cost: 0, mood: "behind",
             why: "You're behind — help is free while it is." };
  }
  if (d < 1.2) {
    return { free: false, cost: clock.on ? 10 : 1, mood: "level",
             why: "It's about level — a small price." };
  }
  var steep = Math.min(4, 1 + Math.floor((d - 1.2) / 1.5));
  return { free: false, cost: clock.on ? 10 * steep : steep, mood: "ahead",
           why: "You're ahead by about " + d.toFixed(1) + " — help costs more from here." };
}
function oddsLabel(side) {
  var o = oddsFor(side);
  if (o.free) return "free";
  return clock.on ? ("−" + o.cost + "s") : ("−" + o.cost);
}
/* take the payment; returns false if they can't afford it */
function oddsPay(side) {
  var o = oddsFor(side);
  if (o.free) return true;
  if (clock.on) {
    var have = side === 1 ? clock.w : clock.b;
    if (have < (o.cost + 5) * 1000) {
      toast("Not enough clock left to buy that — but it's free again the moment you're behind.");
      return false;
    }
    if (side === 1) clock.w -= o.cost * 1000; else clock.b -= o.cost * 1000;
    syncClocks();
  }
  oddsSpent[side] += o.cost;
  return true;
}
/* the side the local person is playing (pass & play: whoever is to move) */
function mySide() {
  if (mode === "coach") return humanSide;
  if (mode === "lan") return lanSide;
  return G ? G.turn : 1;
}

/* the free coaching the trailing player gets without asking: one quiet
   word at a time, never twice in a row, and only when actually behind */
function oddsNudge() {
  if (!prefs.coach || !G || over || mode === "lesson" || mode === "tour") return;
  var side = G.turn;
  if (mode === "coach" && side !== humanSide) return;
  if (mode === "lan" && side !== lanSide) return;
  if (!oddsFor(side).free) return;                      /* only for the one behind */
  if (G.played.length - oddsLastNudge < 4) return;      /* not every move */
  var warn = Teach.warnings(G, side);
  var chance = Teach.opportunities(G, side);
  var pick = (warn.length && warn[0].weight >= 90) ? warn[0] : (chance.length ? chance[0] : null);
  if (!pick) return;
  oddsLastNudge = G.played.length;
  oddsNudged++;
  /* drawn only on the live board: a nudge is about the position in play,
     not one being looked back at */
  if (pick.squares && pick.squares.length && viewPly < 0) {
    /* a back rank's squares come as [landing, king, other landings…]:
       the landings are the net, the line runs from the first to the king */
    var net = pick.concept === "backRank" ? [pick.squares[0]].concat(pick.squares.slice(2)) : [];
    if (R2 && R2.setNet) R2.setNet(net);
    if (R3 && R3.setNet) R3.setNet(net);
    var nTo = pick.squares[Math.min(1, pick.squares.length - 1)];
    showLines([{ from: pick.squares[0], to: nTo, kind: pick.concept === "hanging" ? "threat" : "ghost",
                 tone: pick.concept === "hanging" ? "threat" : "hint", knight: knightHop(pick.squares[0], nTo) }], 5200, "main");
  }
  var say = "🫱 " + pick.text + " <i>(free — you're behind)</i>";
  /* across a table, said to the one it is for, the right way up for them */
  if (tableFacing()) { tableSay(side === -orientation ? say : "", side === orientation ? say : "", 7000, true); return; }
  toast(say, null, 7000);
}

/* ---- the lines on the board ----
   Every line the room draws goes through here, in layers, each with its
   own timer: a hint ("main"), a remark or a note ("teach"), a lesson's
   answer, the look-back's lines ("review"), the line behind a hint
   ("pv"), and room for what comes later. A free nudge arriving while a
   hint is up no longer wipes the hint; both stay, and each goes when it
   is done. The boards get the union, in this order, the later on top.
   `clearLines()` with no layer is the old clean sweep (a move, a new
   game, a take-back), and takes the mate net with it. */
var LINE_LAYERS = ["review", "lesson", "teach", "help", "ideas", "pv", "sight", "main"];
var lineLayers = {}, lineTimers = {};
function showLines(list, ms, key) {
  key = key || "main";
  clearTimeout(lineTimers[key]);
  lineLayers[key] = list || [];
  if (ms) lineTimers[key] = setTimeout(function () { clearLines(key); }, ms);
  pushLines();
}
function clearLines(key) {
  if (key == null) {
    for (var k in lineTimers) clearTimeout(lineTimers[k]);
    lineLayers = {}; lineTimers = {};
    if (R2 && R2.setNet) R2.setNet([]);
    if (R3 && R3.setNet) R3.setNet([]);
  } else {
    clearTimeout(lineTimers[key]);
    delete lineLayers[key]; delete lineTimers[key];
  }
  pushLines();
}
function pushLines() {
  var all = [];
  for (var i = 0; i < LINE_LAYERS.length; i++) if (lineLayers[LINE_LAYERS[i]]) all = all.concat(lineLayers[LINE_LAYERS[i]]);
  if (R2 && R2.setLines) R2.setLines(all);
  if (R3 && R3.setLines) R3.setLines(all);
  needFrame();
}
/* a knight's line arcs over the traffic, so whoever draws one says so */
function knightHop(a, b) {
  var df = Math.abs((a & 7) - (b & 7)), dr = Math.abs((a >> 4) - (b >> 4));
  return (df === 1 && dr === 2) || (df === 2 && dr === 1);
}

/* ===================== the pen =====================
   Your own arrows and rings (ink.js keeps them, the boards draw them).
   Hold a square and drag on a phone, or right-drag with a mouse: a
   ribbon grows under your finger and snaps to the square you reach; let
   go where you started and it is a ring instead; draw the same shape
   again to rub it out. The board decides what you meant — a stroke from
   one of their men is a threat, anything else your plan — and on a desk
   Shift and Alt say it outright.

   A drawing belongs to the position it was made on: play on and the
   live board is clean, step back and it is exactly where you left it,
   reload and it is still there. There is no toolbar and no colour to
   pick — the skin's plan colour is the pen. */
var PEN_HOLD_MS = 420;
var ink = Ink.create(), pen = null;
/* the two pen preferences are read here rather than in the list above,
   so the pen can be taken out in one piece: on unless switched off, and
   whether the one-time word about it has been said */
(function () {
  var p = {};
  try { p = JSON.parse(lsGet(PREF_KEY) || "{}") || {}; } catch (e) { p = {}; }
  prefs.pen = p.pen !== false;
  prefs.sawPen = p.sawPen === true;
})();
/* which position is on the board: 0 is the start, n is after n moves */
function posIndex() { return !G ? 0 : viewPly >= 0 ? viewPly + 1 : G.played.length; }
function penActive() { return !!pen; }
function penMod(e) { return e && e.shiftKey ? 1 : e && e.altKey ? 0 : null; }
function penTone() { return (pen.mod != null ? pen.mod : pen.t) ? "threat" : "plan"; }
function penTap() {
  if (prefs.sound && typeof Sound !== "undefined" && Sound.tap) { try { Sound.tap(6, 0.8); } catch (e) {} }
}
/* the pen comes down: a man that was in the hand settles back quietly */
function penStart(sq, mod) {
  if (!G || sq == null || sq < 0) return false;
  if (sel >= 0) { clearSel(); syncBoard(); }
  pen = { from: sq, to: sq, t: Ink.toneFor(currentViewBoard(), sq, mySide()), mod: mod };
  if (R.setSketch) R.setSketch({ from: sq, to: sq, tone: penTone() });
  hap("select"); penTap();
  needFrame();
  return true;
}
/* …follows the finger, a detent at each square the head crosses onto… */
function penTo(sq) {
  if (!pen || sq === pen.to) return;
  pen.to = sq;
  if (R.setSketch) R.setSketch({ from: pen.from, to: sq >= 0 ? sq : pen.from, tone: penTone() });
  if (sq >= 0) hap("hover");
  needFrame();
}
/* …and is lifted: the shape is set (or rubbed out) on this position */
function penEnd(commit) {
  if (!pen) return;
  var p = pen; pen = null;
  if (R.setSketch) R.setSketch(null);
  needFrame();
  if (!commit || !G) return;
  var to = p.to < 0 ? p.from : p.to;
  var got = Ink.toggle(ink, posIndex(), { from: p.from, to: to, t: p.mod != null ? p.mod : p.t });
  syncInk();
  hap("tick"); penTap();
  saveGame();
  if (got === "full") toast("That is as much as one position holds — tap an empty square to clear it.");
  else if (got === "added" && !prefs.sawPen) {
    prefs.sawPen = true; savePrefs();
    toast("✎ Your arrows stay with this position. Tap an empty square to clear them.", null, 6000);
  }
}
/* the drawing of the position on the board, on both boards, and the
   small pill that says it is there and takes it away */
function syncInk() {
  var list = G ? Ink.at(ink, posIndex()).map(function (sh) {
    return { from: sh.from, to: sh.to, tone: sh.t ? "threat" : "plan" };
  }) : [];
  if (R2 && R2.setInk) R2.setInk(list);
  if (R3 && R3.setInk) R3.setInk(list);
  var pill = $("inkPill");
  if (pill) {
    pill.classList.toggle("hide", !list.length);
    $("inkCount").textContent = String(list.length);
  }
}
function clearInkHere() {
  if (!G || !Ink.clear(ink, posIndex())) return false;
  syncInk(); hap("tick"); saveGame(); needFrame();
  return true;
}
function syncPenSetting() {
  var b = $("setPen");
  if (!b) return;
  b.classList.toggle("sel", prefs.pen);
  b.textContent = prefs.pen ? "On" : "Off";
}
function wirePen() {
  $("inkClear").addEventListener("click", function () { clearInkHere(); });
  $("setPen").addEventListener("click", function () { prefs.pen = !prefs.pen; savePrefs(); syncPenSetting(); });
}

/* ===================== the line behind the words =====================
   Every sentence the coach says that names a move can be drawn: the
   better move on the position *before* the slip (where its squares are
   true), the problem it ran into on the position *after* (where the
   piece that punishes it is actually standing), and the line behind a
   hint, a ply at a time. Nothing is drawn that the room has not already
   said in words — the notebook, the mark, the toast — and no line ever
   starts on an empty square, because each is drawn only on the position
   it is true of. At most three on the board at once, all in kinds the
   grammar already has: a ghost for what you did, a run for what was
   better, a threat for what hits you. */
var BAD_MARK = { "??": 1, "?": 1, "?!": 1 };
/* what a review named, as squares: the better move, and the reply that
   punishes the one played (Brain.review only finds one when it cost a
   pawn or more) */
function reviewEntry(pre, mine, res) {
  var e = { best: res.bestScore, played: res.playedScore, bm: null, rf: null };
  if (res.best && Chess.onBoard(res.best.from) && Chess.onBoard(res.best.to)) e.bm = [res.best.from, res.best.to];
  if (res.refute && res.refute.san) {
    try {
      var after = Chess.create(Chess.fen(pre));
      Chess.play(after, mine);
      var rm = Chess.fromSAN(after, res.refute.san);
      if (rm) e.rf = [rm.from, rm.to];
    } catch (err) { e.rf = null; }
  }
  return e;
}
/* the save: [ply, best, played, bmFrom, bmTo, rfFrom, rfTo], -1 for none.
   An older save's three-long entries still read, with no squares. */
function rvPack(k) {
  var r = reviewMemo[k], bm = r.bm || [-1, -1], rf = r.rf || [-1, -1];
  return [k, r.best, r.played, bm[0], bm[1], rf[0], rf[1]];
}
function rvUnpack(t, plies) {
  if (!Array.isArray(t) || (t.length !== 3 && t.length !== 7)) return;
  if (typeof t[0] !== "number" || t[0] !== (t[0] | 0) || t[0] < 0 || t[0] >= plies) return;
  if (typeof t[1] !== "number" || typeof t[2] !== "number" || !isFinite(t[1]) || !isFinite(t[2])) return;
  /* a pair of squares, or none (-1, -1); anything else is a save that
     lies, and the entry goes rather than a line to nowhere */
  var bad = false, sq = function (a, b) {
    if (a === -1 && b === -1) return null;
    if (typeof a === "number" && typeof b === "number" && a === (a | 0) && b === (b | 0) &&
        a >= 0 && b >= 0 && a < 128 && b < 128 && Chess.onBoard(a) && Chess.onBoard(b)) return [a, b];
    bad = true; return null;
  };
  var bm = t.length === 7 ? sq(t[3], t[4]) : null, rf = t.length === 7 ? sq(t[5], t[6]) : null;
  if (!bad) reviewMemo[t[0]] = { best: t[1], played: t[2], bm: bm, rf: rf };
}
/* the mark a move carries: the coach's, or — for a game nobody reviewed
   aloud, like a clocked one — the one the look-back's numbers give it,
   by the same yardstick the end card counts with */
function markAt(ply) {
  if (voice() === "off") return null;
  if (marks[ply]) return marks[ply];
  var r = reviewMemo[ply];
  if (!r || r.best < -650 || r.played > 650) return null;
  var loss = r.best - r.played;
  return loss >= 250 ? "??" : loss >= 110 ? "?" : null;
}
function markedPlies() {
  var out = [];
  if (!G) return out;
  for (var p = 1; p < G.played.length; p++) if (markAt(p)) out.push(p);
  return out;
}
/* the lines for one position (0 = the start, n = after n moves) */
function reviewLinesFor(pos) {
  var out = [];
  if (!G) return out;
  var here = reviewMemo[pos], mk = markAt(pos), rec = G.played[pos];
  if (here && mk && rec) {
    if (mk === "!" || mk === "!!") out.push({ sq: rec.m.to, kind: "ring", tone: "hint" });
    else if (here.bm && !(here.bm[0] === rec.m.from && here.bm[1] === rec.m.to)) {
      out.push({ from: rec.m.from, to: rec.m.to, kind: "ghost", tone: "hint", knight: knightHop(rec.m.from, rec.m.to) });
      out.push({ from: here.bm[0], to: here.bm[1], kind: "run", tone: "hint", knight: knightHop(here.bm[0], here.bm[1]) });
    }
  }
  var prev = reviewMemo[pos - 1], pm = markAt(pos - 1);
  if (prev && prev.rf && BAD_MARK[pm]) out.push({ from: prev.rf[0], to: prev.rf[1], kind: "threat", tone: "threat", knight: knightHop(prev.rf[0], prev.rf[1]) });
  return out;
}
/* the refutation, live, for as long as the toast that names it — while
   the board still shows the position right after the move it punishes */
function drawRefutation(ply, ms) {
  var r = reviewMemo[ply];
  if (!G || !r || !r.rf || viewPly >= 0 || G.played.length !== ply + 1) return;
  showLines([{ from: r.rf[0], to: r.rf[1], kind: "threat", tone: "threat", knight: knightHop(r.rf[0], r.rf[1]) }], ms, "review");
}
/* "Show me": the position before the slip, your move faint and the better
   one drawn; → steps on to the problem, → again back to the game */
function showMeReview(ply) {
  if (!G || !G.played[ply]) return;
  if (ply > 0) viewAt(ply - 1);
}
/* Looking back: the lines that belong to this position, the remark that
   belongs to it in the banner, and a way to walk from one marked move to
   the next. The room's other lines (a hint, a nudge, a note's arrow) are
   about some other position, so they go. */
function syncLookBack() {
  clearLines("main"); clearLines("pv"); clearLines("teach"); clearLines("review");
  if (G && viewPly >= 0) {
    var lines = reviewLinesFor(viewPly + 1);
    if (lines.length) showLines(lines, 0, "review");
  }
  syncViewBanner();
}
function noteBriefFor(ply) {
  for (var i = notes.length - 1; i >= 0; i--) if (notes[i].ply === ply && notes[i].mark) return stripTags(notes[i].brief || notes[i].text);
  return "";
}
function syncViewBanner() {
  var txt = $("vbText"), nav = $("reviewNav");
  if (!txt || !nav) return;
  var looking = G && viewPly >= 0;
  var said = looking ? noteBriefFor(viewPly + 1) || noteBriefFor(viewPly) : "";
  txt.textContent = said ? said + " \u00b7 tap to return" : "Looking back \u2014 tap to return \u00b7 hold a square to draw";
  var marked = looking ? markedPlies() : [];
  nav.innerHTML = "";
  nav.classList.toggle("hide", !marked.length);
  if (!marked.length) return;
  var here = viewPly + 1, idx = marked.indexOf(here);
  var prev = null, next = null, i;
  for (i = marked.length - 1; i >= 0; i--) if (marked[i] < here) { prev = marked[i]; break; }
  for (i = 0; i < marked.length; i++) if (marked[i] > here) { next = marked[i]; break; }
  var chip = function (label, to, aria) {
    var b = document.createElement("button");
    b.className = "lchip"; b.textContent = label; b.setAttribute("aria-label", aria);
    if (to == null) b.disabled = true;
    else b.addEventListener("click", function (e) { e.stopPropagation(); viewAt(Math.max(0, to - 1)); });
    return b;
  };
  nav.appendChild(chip("\u25c0", prev, "The previous move worth a second look"));
  var n = document.createElement("span");
  n.className = "rnN"; n.textContent = (idx >= 0 ? idx + 1 : "\u00b7") + " of " + marked.length;
  nav.appendChild(n);
  nav.appendChild(chip("\u25b6", next, "The next move worth a second look"));
}
/* the line a hint is counting on, as moves on a scratch board */
function pvLine(pv) {
  var out = [];
  try {
    var g = Chess.create(Chess.fen(G));
    for (var i = 0; i < pv.length && i < 6; i++) {
      var m = Chess.fromSAN(g, pv[i]);
      if (!m) break;
      out.push(m); Chess.play(g, m);
    }
  } catch (e) { return out; }
  return out;
}
/* …drawn a ply at a time: theirs coming at you, yours as a ghost */
function showPV(moves) {
  if (!G || viewPly >= 0) return;
  showLines(moves.slice(1, 4).map(function (m, i) {
    return { from: m.from, to: m.to, kind: i % 2 ? "ghost" : "threat", tone: i % 2 ? "hint" : "threat",
             delay: i * 260, knight: Math.abs(m.piece) === Chess.N };
  }), 7000, "pv");
}
/* the mate net: every square around the king that is denied to it */
function showMateNet(side) {
  if (!G) return;
  var kingSq = G.kings[side === 1 ? 0 : 1], out = [];
  var K = [17, 16, 15, 1, -17, -16, -15, -1], i, t;
  /* Ask the rules rather than the attack map. A square can be denied for
     reasons a simple "is it attacked?" misses — most famously the square
     directly behind the king along the checking line, which only looks
     safe because the king itself is standing in the way. */
  var legal = {};
  if (G.turn === side) {
    var ms = Chess.movesFrom(G, kingSq);
    for (i = 0; i < ms.length; i++) legal[ms[i].to] = true;
  }
  for (i = 0; i < 8; i++) {
    t = kingSq + K[i];
    if (t & 0x88) continue;
    var occ = G.board[t];
    if (occ && (occ > 0 ? 1 : -1) === side) continue;      /* own piece: not an escape anyway */
    if (G.turn === side ? !legal[t] : Chess.attacked(G, t, -side)) out.push(t);
  }
  if (R2 && R2.setNet) R2.setNet(out);
  if (R3 && R3.setNet) R3.setNet(out);
  needFrame();
  return out.length;
}

/* ===================== teachable moments =====================
   The best teaching in the app happens inside your own game: the
   instant a fork appears on the board you made it on, it gets named.
   Two rules keep it a teacher rather than a nag — it says one thing per
   move at most, and it goes quiet on ideas you've shown you know
   (mastery comes from the Academy's spacing data, so the room really
   does stop explaining forks once forks are yours). */
var teachSeen = {}, teachCool = 0;
/* which idea was named at which move, so a take-back can forget it */
var taughtAt = [];
function teachMoment(list, mover, source, ply) {
  if (!prefs.coach || !G || over || mode === "lesson" || mode === "tour") return;
  /* in a two-player game, only speak about the move the local player made */
  if (mode === "lan" && source !== "local") return;
  if (mode === "coach" && mover !== humanSide) return;
  /* A cooldown keeps the room from chattering, but it must never silence
     a hanging piece or a mate because a remark about a centre pawn came
     a move earlier: the big moments go first and skip the queue. */
  var hasMajor = list.some(function (x) { return x.weight >= 90; });
  if (teachCool > 0 && !hasMajor) { teachCool--; return; }
  var prog = Learn.load();
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (teachCool > 0 && item.weight < 90) continue;
    var m = Learn.mastery(prog, item.concept);
    var shown = teachSeen[item.concept] || 0;
    /* big moments (mate, stalemate, a hanging piece) always get said */
    var major = item.weight >= 90;
    if (!major && (m > 0.6 || shown >= 2)) continue;
    if (major && shown >= 3) continue;
    teachSeen[item.concept] = shown + 1;
    taughtAt.push({ concept: item.concept, ply: ply });
    teachCool = major ? 0 : 2;
    if (item.squares && item.squares.length >= 2 && viewPly < 0) {
      showLines([{ from: item.squares[0], to: item.squares[1], kind: "run", tone: "hint",
                   knight: knightHop(item.squares[0], item.squares[1]) }], 4200, "teach");
    }
    /* Named, kept, and re-readable. Naming is what turns a thing that
       happened into a pattern you can recognise again, and keeping it is
       what lets you look at the name twice. */
    note({ ply: ply, icon: "\ud83d\udc41", tone: "note", key: item.concept,
           squares: item.squares || null, text: item.text,
           brief: conceptLabel(item.concept) + (item.squares && item.squares.length
                  ? " \u00b7 " + item.squares.map(Chess.sqName).join("\u2013") : "") });
    /* the board only gets interrupted for something that changes what
       you should do right now */
    /* across a table a toast faces one of the two; the notebook and the
       lines on the board are for both */
    if (major && voice() === "plain" && !tableFacing()) toast("\ud83d\udc41 " + item.text, null, 7000);
    return;
  }
}

/* the same idea, named the way a book would name it — which is what a
   strong player wants on the line and a beginner meets in the plain
   words above it */
var CONCEPT_LABEL = {
  fork: "fork", pin: "pin", skewer: "skewer", hanging: "hanging piece",
  backRank: "back rank", checkmate: "mate", stalemate: "stalemate",
  discovered: "discovered attack", trade: "trade", development: "development",
  centre: "the centre", castling: "king safety", promotion: "promotion",
  tempo: "tempo", overload: "overloaded defender", mateThreat: "mate threat", sacrifice: "sacrifice"
};
function conceptLabel(c) {
  return CONCEPT_LABEL[c] || String(c || "note").replace(/([A-Z])/g, " $1").toLowerCase();
}

/* ===================== the Academy =====================
   Lessons run on the real board with the real pieces, because a
   position you can touch is remembered and a diagram is not. */
/* lessonPaused: the board is showing something other than the question
   (a wrong move playing out, the demonstration, the revealed answer), so
   a tap on it must not act on the position underneath. lessonRevealed:
   the answer was shown, so a solve afterwards is not a solve. */
var lessonPaused = false, lessonRevealed = false;
var lesson = null, lessonDone = false, lessonTries = 0, lessonHints = 0,
    lessonQueue = [], lessonWorked = false, lessonPrev = null;

function openAcademy() {
  hideAllOverlays();
  closeStudio();
  renderAcademy();
  setupAcademySync();
  $("ovAcademy").classList.remove("hide");
}
function renderAcademy() {
  var p = Learn.load(), st = Learn.stats(p);
  $("aSolved").textContent = st.solved + "/" + st.total;
  $("aDue").textContent = st.due;
  $("aStreak").textContent = streakDays();
  $("aPractise").classList.toggle("hide", st.due === 0);
  $("aPractiseSub").textContent = st.due + " idea" + (st.due === 1 ? "" : "s") + " ready to come back.";
  var nx = Learn.next(p);
  $("aNext").classList.toggle("hide", !nx);
  if (nx) $("aNextSub").textContent = nx.title;

  var box = $("academyList");
  box.innerHTML = "";
  Learn.CHAPTERS.forEach(function (ch) {
    var h = document.createElement("div");
    h.className = "chapTitle";
    h.textContent = ch.name;
    box.appendChild(h);
    var b = document.createElement("div");
    b.className = "chapBlurb";
    b.textContent = ch.blurb;
    box.appendChild(b);
    Learn.inChapter(ch.id).forEach(function (L) {
      var solved = (p.lessons[L.id] || {}).solved;
      var m = Learn.mastery(p, L.concept);
      var row = document.createElement("button");
      row.className = "lrow2";
      row.innerHTML = '<span class="tick">' + (solved ? "✅" : "○") + "</span>" +
        '<span class="lt"><b></b><small></small></span>' +
        '<span class="mBar"><i style="width:' + Math.round(m * 100) + '%"></i></span>';
      row.querySelector("b").textContent = L.title;
      row.querySelector("small").textContent = L.ask;
      row.addEventListener("click", function () { startLesson(L, []); });
      box.appendChild(row);
    });
  });
}

function startPractice() {
  var p = Learn.load(), list = Learn.due(p);
  if (!list.length) { toast("Nothing is due just yet — that's the spacing working. Come back tomorrow."); return; }
  startLesson(list[0], list.slice(1));
}
function startNextLesson() {
  var nx = Learn.next(Learn.load());
  if (!nx) { toast("🎓 You've been through every lesson. Practice keeps them — check back for what's due."); return; }
  startLesson(nx, []);
}

function startLesson(L, queue) {
  stopTour();
  quietBoard();
  hideAllOverlays();
  closeStudio();
  lesson = L; lessonQueue = queue || []; lessonDone = false; lessonTries = 0; lessonHints = 0;
  lessonWorked = false; lessonPaused = false; lessonRevealed = false;
  mode = "lesson"; over = null; thinking = false;
  G = Chess.create(L.fen);
  lessonPrev = null;
  clockConfig("none");
  clearSel(); viewPly = -1;
  orientation = L.side;
  R.setOrientation(orientation);
  R.setPosition(G.board, { flourish: true });
  hideOpeningCard();
  showViewBanner(false);
  syncAll();
  needFrame();
  /* a brand-new idea is demonstrated once, then handed straight back */
  var p = Learn.load();
  if (L.worked && !(p.lessons[L.id] || {}).solved) showWorkedExample();
  else askLesson();
}

/* the stage gives up room for the bar/drawer instead of being covered */
function reflow() {
  /* the player bars hide in a lesson or a story, so the board may use
     their strips */
  var bars = document.body.classList.contains("lesson-on") ? 0 : 48;
  [R2, R3].forEach(function (r) { if (r && r.setInsets) r.setInsets(bars, bars); });
  if (R2) R2.resize();
  if (R3) R3.resize();
  needFrame();
}
function lessonUI(html, cls) {
  document.body.classList.add("lesson-on");
  var bar = $("lessonBar");
  bar.className = "lessonBar" + (cls ? " " + cls : "");
  bar.innerHTML = html;
  bar.classList.remove("hide");
  measureLessonBar();
}
/* the board above a lesson is exactly as tall as the room the bar leaves */
var SIDE_LESSON = matchMedia("(orientation:landscape) and (max-height:500px)");
var lessonH = -1;
function measureLessonBar() {
  var bar = $("lessonBar");
  var h = (bar.classList.contains("hide") || SIDE_LESSON.matches) ? 0 : bar.offsetHeight + 20;
  if (h === lessonH) return;
  lessonH = h;
  document.documentElement.style.setProperty("--lesson-h", h + "px");
  reflow();
}
if (typeof ResizeObserver !== "undefined") {
  try { new ResizeObserver(function () { if (document.body.classList.contains("lesson-on")) measureLessonBar(); }).observe($("lessonBar")); } catch (e) {}
}
function lessonChip(label, fn, go) {
  var b = document.createElement("button");
  b.className = "lchip" + (go ? " go" : "");
  b.textContent = label;
  b.addEventListener("click", fn);
  return b;
}
function lessonRow(chips) {
  var row = document.createElement("div");
  row.className = "lrow";
  chips.forEach(function (c) { if (c) row.appendChild(c); });
  $("lessonBar").appendChild(row);
  return row;
}

function showWorkedExample() {
  lessonWorked = true;
  lessonPaused = true;
  var m = Chess.fromSAN(G, lesson.best), L0 = lesson;
  lessonUI('<div class="lkick">Watch first</div>' +
    '<div class="lask">' + esc(lesson.title) + '</div>' +
    '<div class="lsay">Here it is once, so you know what you\'re looking for. Then it\'s yours.</div>');
  lessonRow([lessonChip("Leave", exitLesson)]);
  setTimeout(function () {
    /* a different lesson started in the meantime: this one's answer is not its demonstration */
    if (mode !== "lesson" || lesson !== L0 || !m) return;
    var desc = animDescriptor(m);
    var g2 = Chess.create(lesson.fen);
    Chess.play(g2, m);
    var wPlan = R.animateMove(desc, g2.board, { scale: 1.8, glow: true }, function () {
      /* Leave was tapped while the man was still moving: nothing to show */
      if (mode !== "lesson" || lesson !== L0) return;
      lessonUI('<div class="lkick">Watch first</div>' +
        '<div class="lask">' + esc(lesson.best) + '</div>' +
        '<div class="lsay">' + lesson.why + '</div>');
      lessonRow([lessonChip("Now let me try →", function () {
        G = Chess.create(lesson.fen);
        R.setPosition(G.board);
        lessonPaused = false;
        clearSel(); syncAll(); askLesson();
      }, true), lessonChip("Leave", exitLesson)]);
    });
    sndMove(desc, wPlan, m.capt);
    needFrame();
  }, REDUCED ? 200 : 1500);
}

function askLesson() {
  var side = lesson.side === 1 ? "White" : "Black";
  lessonUI('<div class="lkick">' + esc(chapterName(lesson.chapter)) + " · you are " + side + '</div>' +
    '<div class="lask">' + esc(lesson.ask) + '</div>' +
    (lessonTries ? '<div class="lsay">' + (lesson.chapter === "opening" ? "Have another go — look for a move that does two jobs at once." :
                                           "Have another go — the board is small enough to see all of it.") + '</div>' : ''));
  lessonRow([
    lessonChip(lessonHints ? "Another nudge" : "💡 Nudge", giveLessonHint),
    lessonChip("Show me", revealLesson),
    lessonChip("Leave", exitLesson)
  ]);
}
function chapterName(id) {
  for (var i = 0; i < Learn.CHAPTERS.length; i++) if (Learn.CHAPTERS[i].id === id) return Learn.CHAPTERS[i].name;
  return "Lesson";
}
/* the same escaping as escHtml, by its shorter name — one rule, two names,
   because both are called from all over the file */
function esc(s) { return escHtml(s); }

/* hints fade in three steps: a question, then where to look, then the move */
function giveLessonHint() {
  lessonHints++;
  if (lessonHints === 1) {
    lessonUI('<div class="lkick">A nudge</div><div class="lask">' + esc(lesson.ask) + '</div>' +
      '<div class="lsay">' + lesson.hint + '</div>');
    lessonRow([lessonChip("Show me where", giveLessonHint), lessonChip("Leave", exitLesson)]);
  } else {
    var m = Chess.fromSAN(G, lesson.best);
    if (m) { sel = m.from; legalMoves = Chess.movesFrom(G, m.from); syncBoard(); }
    lessonUI('<div class="lkick">A nudge</div><div class="lask">' + esc(lesson.ask) + '</div>' +
      '<div class="lsay">This is the piece. Where does it want to go?</div>');
    lessonRow([lessonChip("Just show me the move", revealLesson), lessonChip("Leave", exitLesson)]);
  }
  snd("hint");
}
function revealLesson() {
  var m = Chess.fromSAN(G, lesson.best);
  lessonRevealed = true;
  if (m) showLines([{ from: m.from, to: m.to, kind: "run", tone: "hint", knight: Math.abs(m.piece) === Chess.N }], 0, "lesson");
  lessonUI('<div class="lkick">The answer</div><div class="lask">' + esc(lesson.best) + '</div>' +
    '<div class="lsay">' + lesson.why + '</div>');
  lessonRow([lessonChip("Let me play it", function () {
    clearLines("lesson"); askLesson();
  }, true), lessonChip("Leave", exitLesson)]);
  /* the arrow is on the board; the board is still the question, so it
     can be played straight from here */
  /* revealing counts as not knowing it — the schedule should hear that */
  var p = Learn.load();
  Learn.grade(p, lesson, false, null);
  Learn.save(p);
}

function lessonAttempt(m) {
  if (!lesson || lessonDone) return;
  var verdict = Learn.accepts(lesson, G, m);
  var desc = animDescriptor(m);
  var before = Chess.fen(G);
  var g2 = Chess.create(before);
  Chess.play(g2, m);
  clearLines("lesson");

  if (verdict.ok) {
    lessonDone = true;
    var okPlan = R.animateMove(desc, g2.board, { scale: 1.0 }, function () {
      G = g2;
      syncBoard();
      celebrateLesson(verdict);
    });
    sndMove(desc, okPlan, m.capt);
    hapMove(desc, okPlan, m.capt, true);
    needFrame();
    return;
  }

  /* wrong: play it anyway so they *see* the consequence, then rewind */
  lessonTries++;
  lessonPaused = true;            /* the board shows the wrong move until it is taken back */
  var say = Learn.critique(lesson, G, m);
  var tryPlan = R.animateMove(desc, g2.board, { scale: 0.8 }, function () {
    snd("lesson-wrong");
    hap("lessonWrong");
    lessonUI('<div class="lkick">Not that one</div>' +
      '<div class="lask">' + esc(Chess.toSAN(Chess.create(before), m)) + '</div>' +
      '<div class="lsay">' + say + '</div>', "bad");
    lessonRow([lessonChip("Take it back", function () {
      R.setPosition(Chess.create(before).board);
      lessonPaused = false;
      clearSel(); syncBoard(); askLesson(); needFrame();
    }, true), lessonChip("Show me", function () {
      R.setPosition(Chess.create(before).board);
      lessonPaused = false;
      clearSel(); syncBoard(); revealLesson(); needFrame();
    })]);
  });
  sndMove(desc, tryPlan, m.capt);
  hapMove(desc, tryPlan, m.capt, true);
  needFrame();
}

function celebrateLesson(verdict) {
  snd("lesson-right");
  hap("lessonRight");
  var why = verdict.best ? lesson.why : (lesson.alsoWhy || lesson.why);
  if (lessonRevealed) {
    /* it was shown first, and the schedule has already heard so: asking
       "did you see it?" now would only invite a kind lie */
    lessonUI('<div class="lkick">Now you know it</div>' +
      '<div class="lask">' + esc(lesson.title) + '</div>' +
      '<div class="lsay">' + why + ' It\'ll come back tomorrow, and you\'ll find it on your own.</div>', "good");
    markDay();
    var nextQ = lessonQueue.shift();
    lessonRow([
      nextQ ? lessonChip("Next →", function () { startLesson(nextQ, lessonQueue); }, true)
            : lessonChip("Next lesson →", function () { startNextLesson(); }, true),
      lessonChip("The Academy", openAcademy)
    ]);
    return;
  }
  lessonUI('<div class="lkick">' + (verdict.best ? "That's it" : "That works") + '</div>' +
    '<div class="lask">' + esc(lesson.title) + '</div>' +
    '<div class="lsay">' + why + '</div>', "good");
  /* metacognition: the learner's own read is what schedules the review */
  var ask = document.createElement("div");
  ask.className = "lsay";
  ask.style.marginTop = "8px";
  ask.textContent = "Honestly — did you see it, or was it a guess?";
  $("lessonBar").appendChild(ask);
  lessonRow([
    lessonChip("I saw it", function () { finishLesson("sure"); }, true),
    lessonChip("Half-guessed", function () { finishLesson("shaky"); }),
    lessonChip("Lucky guess", function () { finishLesson("guess"); })
  ]);
}

function finishLesson(confidence) {
  var p = Learn.load();
  /* needing hints or several tries is honest information too */
  var clean = lessonTries === 0 && lessonHints === 0;
  Learn.grade(p, lesson, true, clean ? confidence : (confidence === "sure" ? "shaky" : "guess"));
  Learn.save(p);
  markDay();                           /* a lesson keeps the streak alive as much as a game */
  var nextUp = lessonQueue.shift();
  if (nextUp) { startLesson(nextUp, lessonQueue); return; }
  var st = Learn.stats(p);
  snd("lesson-done");
  lessonUI('<div class="lkick">Done</div>' +
    '<div class="lask">Learned ' + st.solved + " of " + st.total + '</div>' +
    '<div class="lsay">This comes back in a few days — that gap is what turns it into something you just <i>see</i>.</div>', "good");
  lessonRow([
    lessonChip("Next lesson →", function () { startNextLesson(); }, true),
    lessonChip("The Academy", openAcademy),
    lessonChip("Play a game", showMenu)
  ]);
}

function exitLesson() {
  lesson = null; lessonDone = false; lessonQueue = [];
  $("lessonBar").classList.add("hide"); document.body.classList.remove("lesson-on"); reflow();
  mode = null;
  openAcademy();
}

/* ===================== the Skin Studio =====================
   A drawer, not a wall: the game keeps playing behind it and every
   control writes straight into the live skin. */
var studioOpen = false;
function openStudio() {
  studioOpen = true;
  $("studio").classList.add("open");
  $("studio").setAttribute("aria-hidden", "false");
  document.body.classList.add("studio-on");
  renderStudio();
  setTimeout(reflow, 300);          /* after the drawer has slid in */
  reflow();
}
function closeStudio() {
  if (!studioOpen) return;
  studioOpen = false;
  var el = $("studio");
  if (el) { el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); }
  document.body.classList.remove("studio-on");
  setTimeout(reflow, 300);
  reflow();
}
function swatchOf(s) {
  return '<span class="swatch">' +
    '<i style="background:' + s.board.light + '"></i><i style="background:' + s.board.dark + '"></i>' +
    '<i style="background:' + s.pieces.black + '"></i><i style="background:' + s.pieces.white + '"></i></span>';
}
function renderStudio() {
  /* where the board is: a park, a café, a grand room, a library, or the
     studio's plain backdrop */
  var scBox = $("stScenes");
  scBox.innerHTML = "";
  Scenes.LIST.forEach(function (sc) {
    var b = document.createElement("button"), shut = !placeOpen(sc.id);
    b.className = "stPick" + (prefs.scene === sc.id ? " sel" : "") + (shut ? " locked" : "");
    b.textContent = (shut ? "🔒 " : "") + sc.label;
    b.addEventListener("click", function () {
      /* a place is travelled to, not picked: the road gets you there */
      if (!placeOpen(sc.id)) {
        var ch = Journey.chapterOf(Journey.PLACE_FROM[sc.id]), byId = Journey.openedBy(ch.id), by = SKILLS[byId];
        hap("nope");
        toast("🔒 The " + escHtml(sc.label.toLowerCase()) + " is further up the road, at chapter " + ch.n + ". " +
              (coachOpen(byId) ? "Beat " + by.emoji + " <b>" + escHtml(by.name) + "</b> to get there."
                               : "Keep beating coaches to get there: <b>" + escHtml(SKILLS[Journey.frontier(ladder)].name) + "</b> is next."), null, 3800);
        return;
      }
      setScene(sc.id); renderStudio();
    });
    scBox.appendChild(b);
  });
  $("stSceneNote").textContent = Scenes.get(prefs.scene).note;
  /* and whether the place can be heard as well as seen */
  var tone = $("stTone");
  if (tone) {
    tone.classList.toggle("sel", !!prefs.roomTone);
    tone.textContent = prefs.roomTone ? "\ud83d\udd0a Room tone on" : "\ud83d\udd07 Room tone off";
    tone.onclick = function () { prefs.roomTone = !prefs.roomTone; savePrefs(); syncRoomTone(); renderStudio(); };
  }
  var toneNote = $("stToneNote");
  if (toneNote) toneNote.textContent = prefs.roomTone
    ? "The place, quietly, under the game: birds, a breeze and a fountain; a café\u2019s talk, a cup, the door; a fire and a clock; rain on the library windows."
    : "The place is seen and not heard.";
  /* and its own music */
  var mu = $("stMusic");
  if (mu) {
    mu.classList.toggle("sel", !!prefs.music);
    mu.textContent = prefs.music ? "\ud83c\udfb5 Music on" : "\ud83c\udfb5 Music off";
    mu.onclick = function () { prefs.music = !prefs.music; savePrefs(); syncRoomTone(); renderStudio(); };
  }
  var muNote = $("stMusicNote");
  if (muNote) muNote.textContent = prefs.music && typeof Stage !== "undefined"
    ? "\u266b " + Stage.PLACE_MUSIC[Stage.PLACES.indexOf(prefs.scene) >= 0 ? prefs.scene : "studio"].name + ": written as it plays, so it never repeats. It rests now and then, and steps aside for the game\u2019s big moments."
    : "No music: just the place and the pieces.";

  /* the coaches' boards: won, not chosen */
  homeStudio();

  /* gallery: the house set, then anything you saved or a friend sent */
  var box = $("stPresets");
  box.innerHTML = "";
  var mine = Skins.loadMine();
  var all = Skins.PRESETS.concat(mine);
  all.forEach(function (s, i) {
    var b = document.createElement("button");
    b.className = "preset" + (s.name === skin.name ? " sel" : "");
    b.innerHTML = swatchOf(s) + '<span class="pt"><b></b><small></small></span>';
    b.querySelector("b").textContent = s.name;
    b.querySelector("small").textContent = (i >= Skins.PRESETS.length ? "yours · " : "") + s.note;
    b.addEventListener("click", function () { applySkin(s); renderStudio(); });
    box.appendChild(b);
  });

  /* the carved set — 3D only, and honest about it. The list comes from
     the workshop rather than from skins.js, so a set someone injected at
     runtime appears here beside the house ones. */
  var sets = $("stSets");
  sets.innerHTML = "";
  var shelf = (typeof Pieces3D !== "undefined" && Pieces3D.list)
    ? Pieces3D.list()
    : Object.keys(Skins.PIECE_SETS).map(function (id) {
        return { id: id, name: Skins.PIECE_SETS[id].label, note: Skins.PIECE_SETS[id].note };
      });
  shelf.forEach(function (s) {
    var b = document.createElement("button"), mine = unlSetOwned(s.id);
    b.className = "stPick" + (skin.pieces.set === s.id ? " sel" : "") + (mine ? "" : " locked");
    b.textContent = (mine ? "" : "\ud83d\udd12 ") + s.name;
    b.addEventListener("click", function () {
      /* a carved set is won, not picked: beat its coach well to have it */
      if (!mine) { hap("nope"); toast("\ud83d\udd12 " + escHtml(Unlocks.howTo(Unlocks.byId("set-" + s.id))) + " to unlock the " + escHtml(s.name) + " pieces.", null, 3200); return; }
      skin.pieces.set = s.id; applySkin(skin); renderStudio();
      if (!prefs.use3d) toast("Carved sets show on the 3D board — tap <b>3D</b> below to see them.", null, 3800);
    });
    sets.appendChild(b);
  });
  var here = null;
  shelf.forEach(function (s) { if (s.id === skin.pieces.set) here = s; });
  $("stSetNote").textContent = here
    ? here.note + " — 3D board"
    : "“" + skin.pieces.set + "” isn't installed here, so the 3D board falls back to the house set.";

  /* materials + patterns */
  var mats = $("stMaterials");
  mats.innerHTML = "";
  Object.keys(Skins.MATERIALS).forEach(function (id) {
    var b = document.createElement("button");
    b.className = "stPick" + (skin.pieces.material === id ? " sel" : "");
    b.textContent = Skins.MATERIALS[id].label;
    b.addEventListener("click", function () {
      skin.pieces.material = id; applySkin(skin); renderStudio();
    });
    mats.appendChild(b);
  });
  $("stMatNote").textContent = Skins.MATERIALS[skin.pieces.material].note;

  var fxBox = $("stFx");
  fxBox.innerHTML = "";
  FX_LEVELS.forEach(function (lv) {
    var b = document.createElement("button");
    b.className = "stPick" + (prefs.fx === lv.id ? " sel" : "");
    b.textContent = lv.label;
    b.addEventListener("click", function () {
      prefs.fx = lv.id; savePrefs();
      if (R3) {
        if (lv.id === "auto") R3.setFx("auto");
        else R3.setFx(lv.id);
      }
      renderStudio(); needFrame();
      if (!prefs.use3d) toast("Lighting settings show on the 3D board — tap <b>3D</b> below to see them.", null, 3800);
    });
    fxBox.appendChild(b);
  });
  var lvHere = null;
  FX_LEVELS.forEach(function (lv) { if (lv.id === prefs.fx) lvHere = lv; });
  $("stFxNote").textContent = (lvHere ? lvHere.note : "") +
    (R3 && prefs.fx === "auto" ? " — running " + ({ high: "Full", medium: "Balanced", low: "Simple" }[R3.fx()] || R3.fx()) +
      (R3.fxReason && R3.fxReason() === "frame rate" ? ", stepped down because frames were coming slowly" : "") +
      /* pixels go before effects (gfx3d.js "holding the frame rate"), and the Studio says so */
      (R3.stats && R3.stats().scale < 1 ? ", drawn a little smaller to keep the frames smooth" : "") : "");

  var pats = $("stPatterns");
  pats.innerHTML = "";
  /* the arenas (grass, ice…) are won with a coach's board, not picked here */
  Object.keys(Skins.PATTERNS).filter(function (id) { return !Skins.PATTERNS[id].arena || skin.board.pattern === id; }).forEach(function (id) {
    var b = document.createElement("button");
    b.className = "stPick" + (skin.board.pattern === id ? " sel" : "");
    b.textContent = Skins.PATTERNS[id].label;
    b.addEventListener("click", function () {
      skin.board.pattern = id; applySkin(skin); renderStudio();
    });
    pats.appendChild(b);
  });

  /* the colour wells and sliders */
  var C = [["cLight", "board", "light"], ["cDark", "board", "dark"], ["cEdge", "board", "edge"],
           ["cRim", "board", "rim"], ["cWhite", "pieces", "white"], ["cBlack", "pieces", "black"],
           ["cBg", "room", "bg"], ["cSelect", "marks", "select"], ["cLegal", "marks", "legal"],
           ["cCapture", "marks", "capture"], ["cLast", "marks", "last"], ["cCheck", "marks", "check"],
           ["cHint", "marks", "hint"]];
  C.forEach(function (row) { $(row[0]).value = skin[row[1]][row[2]]; });
  $("sGrain").value = Math.round(skin.board.grain * 100);
  $("sGloss").value = Math.round(skin.board.gloss * 100);
  $("sShine").value = Math.round(skin.pieces.shine * 100);
  $("sRim").value = Math.round(skin.pieces.rim * 100);
}
function wireStudio() {
  var C = [["cLight", "board", "light"], ["cDark", "board", "dark"], ["cEdge", "board", "edge"],
           ["cRim", "board", "rim"], ["cWhite", "pieces", "white"], ["cBlack", "pieces", "black"],
           ["cBg", "room", "bg"], ["cSelect", "marks", "select"], ["cLegal", "marks", "legal"],
           ["cCapture", "marks", "capture"], ["cLast", "marks", "last"], ["cCheck", "marks", "check"],
           ["cHint", "marks", "hint"]];
  /* A colour well or a slider fires dozens of times a second while it is
     being dragged, and every apply used to repaint the board's texture,
     recut its relief and write the preferences. Now a drag applies once a
     frame without saving, and letting go saves once. */
  var dragApply = 0;
  function applySoon() {
    if (dragApply) return;
    dragApply = requestAnimationFrame(function () { dragApply = 0; applySkin(skin, false); });
  }
  function applyNow() { if (dragApply) { cancelAnimationFrame(dragApply); dragApply = 0; } applySkin(skin); }
  C.forEach(function (row) {
    $(row[0]).addEventListener("input", function () {
      skin[row[1]][row[2]] = this.value;
      skin.name = skin.name.indexOf("(edited)") >= 0 ? skin.name : skin.name + " (edited)";
      applySoon();
    });
    $(row[0]).addEventListener("change", applyNow);
  });
  var S = [["sGrain", "board", "grain"], ["sGloss", "board", "gloss"],
           ["sShine", "pieces", "shine"], ["sRim", "pieces", "rim"]];
  S.forEach(function (row) {
    $(row[0]).addEventListener("input", function () {
      skin[row[1]][row[2]] = (+this.value) / 100;
      applySoon();
    });
    $(row[0]).addEventListener("change", applyNow);
  });
  $("stRandom").addEventListener("click", function () {
    applySkin(Skins.random()); renderStudio();
    toast("🎲 " + skin.name + " — keep it with <b>Save to gallery</b>, or roll again.", null, 3500);
  });
  $("stClose").addEventListener("click", closeStudio);
  $("stSave").addEventListener("click", function () {
    var saved = Skins.addMine(skin);
    applySkin(saved);
    renderStudio();
    toast("💾 Saved to your gallery as <b>" + esc(saved.name) + "</b>.");
  });
  $("stExport").addEventListener("click", function () {
    var code = Skins.encode(skin);
    var web = (location.protocol === "https:" || location.protocol === "http:");
    var out = web ? (location.origin + location.pathname + "#skin=" + code) : code;
    $("stCode").value = out;
    $("stCode").focus();
    $("stCode").select();
    if (navigator.share) navigator.share({ title: "A chess board look", text: skin.name, url: out }).catch(function () {});
    else clip(out);
  });
  $("stImport").addEventListener("click", function () {
    var got = Skins.decode($("stCode").value);
    if (!got) {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (t) {
          var g2 = Skins.decode(t);
          if (g2) { adoptSkin(g2); } else { toast("That doesn't look like a skin code — they start with SKIN1."); }
        }, function () { toast("Paste the code into the box first, then tap Import."); });
        return;
      }
      toast("That doesn't look like a skin code — they start with SKIN1.");
      return;
    }
    adoptSkin(got);
  });
}
function adoptSkin(s) {
  var saved = Skins.addMine(s);
  applySkin(saved);
  renderStudio();
  toast("🎨 <b>" + esc(saved.name) + "</b> by " + esc(saved.maker) + " is now in your gallery.");
}

/* ===== overlays & menus =====
   CARDS is the one list of the room's cards. `hide`: hideAllOverlays
   closes it. `pause`: a game on this device stops its clock while it is
   open (clockPaused). `back`: Escape and a tap on the dim room around
   it go back to the lobby. The question (ovAsk) pauses but has its own
   way out; the picker, the recovery card and the Studio are not cards
   here on purpose. Adding a card is one line. */
var CARDS = [
  { id: "ovMenu", hide: 1, pause: 1 },
  { id: "ovNew", hide: 1, pause: 1, back: 1 },
  { id: "ovLink", hide: 1, pause: 1 },
  { id: "ovLinked", hide: 1, pause: 1 },
  { id: "ovEnd", hide: 1 },
  { id: "ovSettings", hide: 1, pause: 1, back: 1 },
  { id: "ovLearn", hide: 1, pause: 1, back: 1 },
  { id: "ovOpenings", hide: 1, pause: 1, back: 1 },
  { id: "ovAbout", hide: 1, pause: 1, back: 1 },
  { id: "ovAcademy", hide: 1, pause: 1, back: 1 },
  { id: "ovProfile", hide: 1, pause: 1, back: 1 },
  { id: "ovShare", hide: 1, pause: 1 },
  { id: "ovPeople", hide: 1, pause: 1 },
  { id: "ovNotation", hide: 1, pause: 1 },   /* it has its own Escape and backdrop, as the friends cards do */
  { id: "ovAsk", pause: 1 },
  { id: "ovCollect", hide: 1, pause: 1, back: 1 },
  { id: "ovUnlock", pause: 1 },
  { id: "ovJourney", hide: 1, pause: 1, back: 1 },
  { id: "ovChapter", hide: 1, pause: 1, back: 1 },
  { id: "ovCredits", hide: 1, pause: 1 },
  { id: "ovTale", hide: 1, pause: 1, back: 1 },
  { id: "ovTales", hide: 1, pause: 1, back: 1 },
  { id: "ovBeat", hide: 1 }
];
function cardIds(flag) {
  return CARDS.filter(function (c) { return c[flag]; }).map(function (c) { return c.id; });
}
function hideAllOverlays() {
  if (beatsOn) beatsEnd();
  cardIds("hide").forEach(function (id) {
    $(id).classList.add("hide");
  });
  /* the picker is not just hidden but closed: a picker that is hidden
     while still pending is a board that refuses every tap */
  closePromo();
  if (G) syncTurnStrip();
}
function showMenu() {
  stopTour();
  closeStudio();
  if (FX) Fx.clear();
  if (mode === "lesson") { lesson = null; mode = null; }
  if (mode === "review") { keptGame = null; reviewNames = null; }
  leaveSharedView();
  if (mode === "review") mode = null;
  $("lessonBar").classList.add("hide"); document.body.classList.remove("lesson-on"); reflow();
  hideAllOverlays();
  syncOpenBoard();
  var lp = Learn.stats(Learn.load());
  $("mAcademySub").textContent = lp.solved
    ? "Learned " + lp.solved + " of " + lp.total + (lp.due ? " · " + lp.due + " due" : "")
    : "Short positions, real feedback.";
  renderLobby();
  unlLobby();
  jrnLobby();
  /* a game nobody has moved in yet is not worth coming back to — it
     used to be offered as "0 moves in" */
  var s = loadSave();
  if (s && !s.sans.length) s = null;
  var hasLive = G && !over && mode && mode !== "tour" && mode !== "lesson";
  $("mResume").classList.toggle("hide", !s && !hasLive);
  function against(m, sk) { return m === "coach" ? "Against " + SKILLS[skillOk(sk)].label : "Two players"; }
  function movesIn(n) { return n ? Math.ceil(n / 2) + (Math.ceil(n / 2) === 1 ? " move" : " moves") + " in" : "not started yet"; }
  if (hasLive) $("mResumeSub").textContent = against(mode, skill) + " — " + movesIn(G.played.length) + ".";
  else if (s) $("mResumeSub").textContent = against(s.mode, s.skill) + " — " + movesIn(s.sans.length) + ".";
  /* contextual resign / draw offers for a live game */
  var ops = $("gameOps");
  if (!ops) {
    ops = document.createElement("div");
    ops.id = "gameOps";
    $("mResume").parentNode.insertBefore(ops, $("mResume").nextSibling);
  }
  ops.innerHTML = "";
  if (hasLive && mode === "pass" && G.played.length) {
    var prow = document.createElement("div"); prow.className = "rowbtns";
    var who = G.turn === 1 ? "White" : "Black";
    prow.appendChild(chipBtn("🏳️ " + who + " resigns", function () {
      hideAllOverlays();
      endGame(G.turn === 1 ? "black" : "white", who + " resigned");
    }));
    prow.appendChild(chipBtn("🤝 Agree a draw", function () { hideAllOverlays(); endGame("draw", "agreed"); }));
    ops.appendChild(prow);
  }
  if (hasLive && (mode === "lan" || mode === "coach")) {
    var row = document.createElement("div"); row.className = "rowbtns";
    if (mode === "lan" && Net.linked()) {
      row.appendChild(chipBtn("🤝 Offer a draw", function () { Net.send({ t: "draw" }); hideAllOverlays(); toast("Draw offered."); }));
    }
    row.appendChild(chipBtn("🏳️ Resign this game", function () {
      hideAllOverlays();
      ask("Resign — really? Tipping the king is honourable, but so is fighting on a pawn down.",
        [{ label: "🏳️ Yes, resign", fn: function () {
            if (mode === "lan") Net.send({ t: "resign" });
            var meSide = mode === "lan" ? lanSide : humanSide;
            endGame(meSide === 1 ? "black" : "white", sideName(meSide) + " resigned");
          } },
         { label: "Fight on", fn: function () {}, ghost: true }]);
    }));
    ops.appendChild(row);
  }
  gameOpsSend(ops, hasLive);
  notationOps(ops, hasLive);
  $("ovMenu").classList.remove("hide");
  snd("open");
}
function chipBtn(label, fn) {
  var b = document.createElement("button");
  b.className = "chip"; b.textContent = label;
  b.addEventListener("click", fn);
  return b;
}
function showOpenings() {
  hideAllOverlays();
  buildOpeningList();
  $("ovOpenings").classList.remove("hide");
}

/* new-game card (shared by pass/coach/lan-host) */
var newCardCtx = null;
function openNewCard(kind, cb) {
  /* the card starts what it shows: every chip is set from this, and the
     clock you chose last time for this kind of game is chosen again */
  var lastClock = (prefs.lastClock && prefs.lastClock[kind]) || "none";
  newCardCtx = { kind: kind, cb: cb, side: kind === "coach" ? "a" : "w", skill: nextLevel(), clockStr: lastClock };
  clkShowCard(newCardCtx.clockStr);
  $("newTitle").textContent = kind === "pass" ? "Two players, one device" : kind === "coach" ? "Play the computer" : "Host a board";
  /* the colour chips: taking turns only means something against the computer */
  Array.prototype.forEach.call($("sideChips").children, function (c) {
    var v = c.getAttribute("data-side");
    c.classList.toggle("hide", v === "a" && kind !== "coach");
    c.classList.toggle("sel", v === newCardCtx.side);
  });
  if (kind === "coach") renderRungChoices(newCardCtx.skill);
  $("flipRow").classList.toggle("hide", kind !== "pass");
  Array.prototype.forEach.call($("flipChips").children, function (c) {
    c.classList.toggle("sel", (c.getAttribute("data-flip") === "1") === !!prefs.autoFlip);
  });
  $("sideRow").classList.toggle("hide", kind === "pass");
  $("skillRow").classList.toggle("hide", kind !== "coach");
  hideAllOverlays();
  $("ovNew").classList.remove("hide");
}
/* every coach on the ladder, with your record against it and the one
   that would give you a fair fight marked */
function renderRungChoices(selId) {
  var row = $("skillChips"), fair = nextLevel();
  row.innerHTML = "";
  Rating.LEVELS.forEach(function (L) {
    var b = document.createElement("button"), r = ladder.rungs[L.id];
    b.setAttribute("data-skill", L.id);
    b.setAttribute("role", "radio");
    if (!coachOpen(L.id)) {
      /* a shadow on the road: who it is, you find out by getting there */
      var why = lockWhy(L.id);
      b.className = "rungRow locked";
      b.setAttribute("aria-disabled", "true");
      b.setAttribute("aria-checked", "false");
      b.setAttribute("data-why", why.html);
      b.innerHTML = '<span class="rgE">🔒</span><span class="rgT"><b>???</b><small>' + escHtml(why.short) + '</small></span><span class="rgElo"></span><span class="rgStars"></span>';
      row.appendChild(b);
      return;
    }
    b.className = "rungRow" + (L.id === selId ? " sel" : "");
    b.setAttribute("aria-checked", L.id === selId ? "true" : "false");
    b.innerHTML = '<span class="rgE">' + L.emoji + '</span><span class="rgT"><b>' + escHtml(L.name) + "</b>" + (rungNew(L.id) ? '<span class="fair new">NEW!</span>' : "") +
      (L.id === fair ? '<span class="fair">fair fight</span>' : "") + "<small>" + escHtml(SKILLS[L.id].short) +
      (r && r.w + r.d + r.l ? " · " + r.w + "–" + r.d + "–" + r.l : "") + '</small></span><span class="rgElo">' + L.elo +
      '</span><span class="rgStars">' + starsHTML(L.id) + "</span>";
    row.appendChild(b);
  });
}
function wireChips(rowId, attr, set) {
  $(rowId).addEventListener("click", function (e) {
    var b = e.target.closest("button[data-" + attr + "]");
    if (!b) return;
    if (b.classList.contains("locked")) { hap("nope"); toast(b.getAttribute("data-why") || "🔒 Not yet.", null, 2600); return; }
    Array.prototype.forEach.call($(rowId).children, function (c) { c.classList.remove("sel"); });
    b.classList.add("sel");
    set(b.getAttribute("data-" + attr));
  });
}

/* ===== the frame loop (with a soft landing if drawing ever throws) ===== */
var rafPending = false, drawErrs = 0;
function needFrame() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(loop);
}
var lastClockSync = 0;
function loop(t) {
  rafPending = false;
  var more = false;
  try {
    clockTick(t);
    if (R) more = R.frame(t);
    drawErrs = 0;
  } catch (e) {
    drawErrs++;
    if (drawErrs > 4) {
      if (R === R3) { switchDim(false, true); drawErrs = 0; }
      else { panic(); return; }
    }
  }
  /* keep ticking while a clock runs, an animation plays, or the camera drifts */
  if (clock.on && clock.run && !over && t - lastClockSync > 5000) {
    lastClockSync = t;
    saveGame();     /* clock times survive a closed tab */
  }
  if (more || (clock.on && clock.run && !over)) needFrame();
}

/* ===== input: taps move pieces, drags orbit the 3D camera ===== */
/* A piece can be tapped and then tapped to where it goes, or picked up
   and carried there — people do both, often in the same game. Pressing
   on one of your own men picks it up at once, so its squares light while
   you decide; dragging it carries it; letting go on a square it can reach
   plays the move, and anywhere else puts it back. A drag that starts
   anywhere else still turns the 3D board, and two fingers still zoom. */
function wireInput() {
  var stage = $("stage");
  var pts = new Map(), downSq = -1, downXY = null, dragging = false, pinchD = 0;
  var carry = null;      /* { from, picked } while a press began on a man of the side to move */
  var holdT = 0;         /* a finger held still long enough becomes a pen (see penStart) */
  function local(e) { var r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function ownMan(sq) {
    if (!G || sq < 0 || !canActNow(true)) return false;
    var p = G.board[sq];
    return !!p && (p > 0 ? 1 : -1) === G.turn;
  }
  function dropCarry() {
    if (R.setDrag) R.setDrag(null);
    if (R.dragHover) R.dragHover(-1);
    needFrame();
  }
  stage.addEventListener("pointerdown", function (e) {
    /* anything you can press that happens to sit on the stage — a lesson's
       buttons, the clock, a question — is not the board. Capturing the
       pointer for those used to swallow every mouse click on them. */
    if (e.target.closest(".clock, #toast, #lessonBar, #netChip, #resultChip, #inkPill, .ptag.tcTap, #tcPop, button, a")) return;
    /* a remark lying over the board goes as soon as the board is
       touched; the notebook has kept it */
    if (!$("toast").classList.contains("acts") || $("toast").classList.contains("lamp")) hideToast();
    /* the first touch is the gesture a browser wants before it will
       start an audio clock at all. A synth that cannot start is a
       silent board, never a board that ignores the tap. */
    if (prefs.sound && typeof Sound !== "undefined") { try { Sound.wake(); } catch (err) {} }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      downXY = { x: e.clientX, y: e.clientY };
      dragging = false;
      var at = local(e);
      downSq = R.screenToSquare(at.x, at.y);
      carry = null;
      clearTimeout(holdT);
      /* the right button is the pen, at once: it never picks a man up
         and never turns the camera (that stays on the left button) */
      if (e.button === 2) {
        penStart(downSq, penMod(e));
        try { stage.setPointerCapture(e.pointerId); } catch (err) {}
        return;
      }
      if (viewPly < 0 && ownMan(downSq)) {
        /* already in hand: the release decides (a tap puts it down) */
        var already = sel === downSq;
        if (!already) { tapSquare(downSq); }
        carry = { from: downSq, picked: !already };
      }
      /* a finger held still becomes the pen; one that moves first is a
         carry or a turn of the board, as it always was */
      if (e.pointerType !== "mouse" && prefs.pen && downSq >= 0) {
        var heldSq = downSq;
        holdT = setTimeout(function () {
          holdT = 0;
          if (pts.size !== 1 || dragging) return;
          if (carry) { dropCarry(); carry = null; }
          penStart(heldSq, null);
        }, PEN_HOLD_MS);
      }
    } else if (pts.size === 2) {
      /* a second finger means zoom, never a move — and never a drawing */
      clearTimeout(holdT);
      if (penActive()) penEnd(false);
      if (carry) { dropCarry(); carry = null; }
      var arr = Array.from(pts.values());
      pinchD = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
    }
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });
  stage.addEventListener("pointermove", function (e) {
    if (!pts.has(e.pointerId)) return;
    var prev = pts.get(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      var arr = Array.from(pts.values());
      var d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
      if (pinchD > 0 && R.zoom) R.zoom(pinchD / d);
      pinchD = d;
      dragging = true;
      needFrame();
      return;
    }
    if (penActive()) {
      /* the head reads the wood, not the men: a tall piece leaning into
         the pointer must not steal the square you are reaching for */
      var pat = local(e);
      penTo(R.screenToSquare(pat.x, pat.y, { plane: true }));
      return;
    }
    if (!downXY) return;
    var dx = e.clientX - downXY.x, dy = e.clientY - downXY.y;
    if (!dragging && Math.hypot(dx, dy) > 9) { dragging = true; clearTimeout(holdT); }
    if (!dragging) return;
    if (carry && sel === carry.from) {
      /* the piece goes with the finger; the square it is over is the
         renderer's answer (in 3D it is carried above the board, so the
         wood under the pointer can be a different square) */
      var at = local(e);
      var over = R.setDrag ? R.setDrag(carry.from, at.x, at.y) : R.screenToSquare(at.x, at.y);
      var legal = false;
      for (var i = 0; i < legalMoves.length; i++) if (legalMoves[i].to === over) { legal = true; break; }
      if (R.dragHover) R.dragHover(legal ? over : -1);
      /* the detent: once per square it can go to, as it crosses onto it */
      if (legal && over !== carry.felt) hap("hover");
      carry.felt = legal ? over : -1;
      needFrame();
      return;
    }
    if (R.orbit) {
      R.orbit(e.clientX - prev.x, e.clientY - prev.y);
      needFrame();
    }
  });
  function up(e) {
    var last = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (pts.size > 0) return;
    clearTimeout(holdT);
    /* a stroke ends where the finger lifts — keyed off the pen itself,
       not the button, which some trackpads report differently on the
       way up */
    if (penActive()) {
      penEnd(e.type !== "pointercancel");
      carry = null; downSq = -1; downXY = null; dragging = false; pinchD = 0;
      return;
    }
    if (carry) {
      var c = carry; carry = null;
      if (dragging && last && e.type !== "pointercancel") {
        /* let go: on a square it can reach, that is the move — set down
           from under the finger, so it is asked before the drag ends */
        var r = stage.getBoundingClientRect();
        var to = R.setDrag ? R.setDrag(c.from, last.x - r.left, last.y - r.top) : R.screenToSquare(last.x - r.left, last.y - r.top);
        dropCarry();
        /* let go on a square it cannot reach (and not on another of its
           own men, which simply picks that one up instead): a head shake */
        if (to >= 0 && to !== c.from && sel === c.from && !ownMan(to) &&
            !legalMoves.some(function (lm) { return lm.to === to; })) hap("nope");
        if (to >= 0 && to !== c.from && sel === c.from) tapSquare(to);
      } else {
        dropCarry();
        if (!dragging && !c.picked) tapSquare(downSq);   /* a tap on the man already in hand puts it down */
      }
    } else if (!dragging && downSq >= 0) tapSquare(downSq);
    downSq = -1; downXY = null; dragging = false; pinchD = 0;
  }
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  /* the board is a page you draw on: no menu ever opens over it */
  stage.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  stage.addEventListener("wheel", function (e) {
    if (R.zoom) { R.zoom(e.deltaY > 0 ? 1.07 : 0.93); needFrame(); e.preventDefault(); }
  }, { passive: false });
}

/* ===== sync everything ===== */
function syncAll() {
  syncBoard(); syncMoveList(); syncBars(); syncClocks(); syncTurnStrip(); syncButtons();
}
function syncButtons() {
  syncOddsUI();
  $("undoLbl").textContent = mode === "lan" ? "Takeback" : "Undo";
  /* Undo needs a move of yours to take back; after the end of a game
     between two people on one screen it stays, because that is exactly
     when a person playing both sides wants to try the other line */
  var canUndo = !!G && G.played.length > 0 && mode !== "tour" && mode !== "lesson" && mode !== "review" &&
    (!over || (mode === "pass" && !/out of time/.test(over.reason))) && (mode !== "coach" || humanMovesMade() > 0);
  $("btnUndo").toggleAttribute("disabled", !canUndo);
  $("btnHint").toggleAttribute("disabled", !G || !!over || mode === "tour" || mode === "review" || hintPending);
  $("btnReplay").toggleAttribute("disabled", !G || !G.played.length || thinking);
}

/* the hint button says what it will cost before you press it */
function syncOddsUI() {
  var lbl = $("hintCost");
  if (!lbl) return;
  if (!G || over || mode === "lesson" || mode === "tour" || !canActNow()) {
    lbl.textContent = ""; lbl.className = "hintCost"; return;
  }
  var o = oddsFor(G.turn);
  lbl.textContent = oddsLabel(G.turn);
  lbl.className = "hintCost " + o.mood;
  lbl.title = o.why;
  if (o.mood === "ahead") helpTip("price", function () { return $("btnHint"); });
}

/* ===== settings ===== */
function syncSettingsUI() {
  aqSync();
  $("setSkinName").textContent = "Currently: " + skin.name + " · " +
    Skins.MATERIALS[skin.pieces.material].label.toLowerCase() + " pieces.";
  var v = voice();
  $("vcPlain").classList.toggle("sel", v === "plain");
  $("vcBrief").classList.toggle("sel", v === "brief");
  $("vcOff").classList.toggle("sel", v === "off");
  $("setVoiceNote").textContent =
    v === "plain" ? "Full sentences, with the idea named — everything it notices is kept in the Notes tab, so you can read it twice."
    : v === "brief" ? "One line per remark, in notation, with what the move cost. Marks still ride along on the move list."
    : "The room says nothing and marks nothing. You can turn it back on mid-game.";
  if (typeof Sound !== "undefined") Sound.enable(prefs.sound);
  syncRoomTone();
  $("setSound").classList.toggle("sel", prefs.sound);
  $("setSound").textContent = prefs.sound ? "On" : "Off";
  $("pvLively").classList.toggle("sel", prefs.pieceVoice !== "natural");
  $("pvNatural").classList.toggle("sel", prefs.pieceVoice === "natural");
  if (HAP) Haptics.setEnabled(prefs.haptics);
  /* tilt is a phone thing: no row at all on a desk */
  var tiltable = typeof window.DeviceOrientationEvent !== "undefined" && (navigator.maxTouchPoints || 0) > 0;
  $("tiltRow").classList.toggle("hide", !tiltable || REDUCED);
  var tiltOn = prefs.tilt && !(tiltNeedsAsk() && !tiltAllowed);
  $("setTilt").classList.toggle("sel", tiltOn);
  $("setTilt").textContent = tiltOn ? "On" : "Off";
  $("setTiltNote").classList.toggle("hide", !(tiltNeedsAsk() && !tiltAllowed));
  $("setHaptics").classList.toggle("sel", prefs.haptics);
  $("setHaptics").textContent = prefs.haptics ? "On" : "Off";
  $("setHapticsNote").classList.toggle("hide", HAP && Haptics.supported() !== "none");
  $("setHelpers").classList.toggle("sel", prefs.helpers);
  $("setHelpers").textContent = prefs.helpers ? "On" : "Off";
  syncPenSetting();
  $("ckSimple").classList.toggle("sel", prefs.clockSkin === "simple");
  $("ckClassic").classList.toggle("sel", prefs.clockSkin === "classic");
  document.body.classList.toggle("clock-classic", prefs.clockSkin === "classic");
  syncHelpSettings();
  paceSync();
}

/* the two ways a configured game begins, shared by the menu and the
   New game button */
function passBegin(o) { leaveGameThen(function () { startGame("pass", { clockStr: o.clockStr, fresh: true }); tableHello(); }); }
function coachBegin(o) { leaveGameThen(function () { startCoachGame(o.skill, o.side, o.clockStr); }); }
/* New game, from the board. Starting over is one tap; it only asks first
   when there is something to lose — moves on the board, or a rated game
   that is properly under way. */
function newGameButton() {
  if (!G || !mode || mode === "tour" || mode === "lesson" || mode === "lan" || mode === "review" || mode === "setup") { showMenu(); return; }
  var kind = mode;
  var again = function () {
    if (kind === "coach") startCoachGame(skill, "a", clockStrOf());
    else startGame("pass", { clockStr: clockStrOf(), fresh: true });
  };
  if (over || !G.played.length) { again(); return; }
  if (ratedAtStake()) { leaveGameThen(again, "starting over"); return; }
  ask("Start a new game? This one ends here.",
    [{ label: "✚ New game", fn: again },
     { label: kind === "coach" ? "Change opponent…" : "Change the clock…", ghost: true, fn: function () { openNewCard(kind, kind === "coach" ? coachBegin : passBegin); } },
     { label: "Keep playing", ghost: true, fn: function () {} }]);
}

/* ===== boot ===== */
function wireUI() {
  $("btnMenu").addEventListener("click", showMenu);
  $("btnUndo").addEventListener("click", undoSmart);
  $("btnHint").addEventListener("click", giveHint);
  wireHelp();
  $("btnReplay").addEventListener("click", replayLast);
  $("btnFlip").addEventListener("click", function () {
    orientation = -orientation;
    R.setOrientation(orientation);
    tableSync();
    syncBars(); syncClocks(); syncBoard();
    needFrame();
  });
  $("btnDim").addEventListener("click", function () { switchDim(!prefs.use3d); });

  /* menu */
  $("mResume").addEventListener("click", function () {
    var hasLive = G && !over && mode && mode !== "tour";
    if (hasLive) { hideAllOverlays(); return; }
    var s = loadSave();
    if (s) resumeSave(s);
  });
  $("mPass").addEventListener("click", tableBegin);
  $("mPassOpts").addEventListener("click", function () { openNewCard("pass", passBegin); });
  $("mCoach").addEventListener("click", function () { openNewCard("coach", coachBegin); });
  $("mPlay").addEventListener("click", function () { quickPlay(); });
  $("mRating").addEventListener("click", showProfile);
  $("pfBack").addEventListener("click", showMenu);
  wireProgression();
  $("btnNew").addEventListener("click", newGameButton);
  $("mLan").addEventListener("click", openLink);
  $("mOpenings").addEventListener("click", showOpenings);
  $("mLearn").addEventListener("click", function () { startSetup({ then: "rules" }); });
  $("mAcademy").addEventListener("click", openAcademy);
  $("aSetup").addEventListener("click", function () { startSetup({ memory: !!(setupRec && (setupRec.learned || setupRec.tries)), then: "academy" }); });
  $("academyBack").addEventListener("click", showMenu);
  $("aPractise").addEventListener("click", startPractice);
  $("aNext").addEventListener("click", startNextLesson);
  $("btnStudio").addEventListener("click", function () {
    if (studioOpen) closeStudio(); else openStudio();
  });
  wireStudio();
  $("mSettings").addEventListener("click", function () { hideAllOverlays(); syncSettingsUI(); $("ovSettings").classList.remove("hide"); });
  $("mAbout").addEventListener("click", function () { hideAllOverlays(); $("ovAbout").classList.remove("hide"); });
  $("aboutBack").addEventListener("click", showMenu);

  /* new game card */
  wireChips("sideChips", "side", function (v) { if (newCardCtx) newCardCtx.side = v; });
  wireChips("skillChips", "skill", function (v) { if (newCardCtx) newCardCtx.skill = v; });
  clkWire();
  aqWire();
  castWire();
  talentWire();
  homeWire();
  moWire();
  jrnWire();
  beatsWire();
  taleWire();
  paceWire();
  tableWire();
  unlWire();
  wireChips("flipChips", "flip", function (v) { prefs.autoFlip = v === "1"; savePrefs(); tableSync(); });
  $("newStart").addEventListener("click", function () {
    if (!newCardCtx) return;
    var ctx = newCardCtx; newCardCtx = null;
    if (!prefs.lastClock || typeof prefs.lastClock !== "object") prefs.lastClock = {};
    prefs.lastClock[ctx.kind] = ctx.clockStr; savePrefs();
    skill = skillOk(ctx.skill);
    hideAllOverlays();
    ctx.cb({ side: ctx.side, skill: ctx.skill, clockStr: ctx.clockStr });
  });
  $("newBack").addEventListener("click", showMenu);

  /* a tap on the dimmed room around a card closes it, the way Escape does:
     the side cards go back to the lobby, and the lobby itself goes back
     to a game that is waiting */
  cardIds("back").forEach(function (id) {
    $(id).addEventListener("click", function (e) { if (e.target === this) showMenu(); });
  });
  $("ovMenu").addEventListener("click", function (e) {
    if (e.target === this && G && mode && mode !== "tour" && mode !== "lesson" && (!over || G.played.length)) hideAllOverlays();
  });
  $("ovEnd").addEventListener("click", function (e) { if (e.target === this) { this.classList.add("hide"); syncTurnStrip(); } });

  /* promotion: a way back out */
  $("promoCancel").addEventListener("click", cancelPromo);
  $("ovAsk").addEventListener("click", function (e) { if (e.target === this && askCancel) { var c = askCancel; closeAsk(); c(); } });
  $("ovPromo").addEventListener("click", function (e) { if (e.target === this) cancelPromo(); });
  /* the keyboard: Escape backs out of whatever is open; the arrows walk
     through the game */
  document.addEventListener("keydown", function (e) {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === "Escape") {
      if (askCancel) { var c = askCancel; closeAsk(); c(); return; }
      if (pendingPromo) { cancelPromo(); return; }
      if (!$("ovEnd").classList.contains("hide")) { $("ovEnd").classList.add("hide"); syncTurnStrip(); return; }
      if (studioOpen) { closeStudio(); return; }
      var open = cardIds("back").filter(function (id) { return !$(id).classList.contains("hide"); });
      if (open.length) { showMenu(); return; }
      if (!$("ovMenu").classList.contains("hide") && G && mode) { hideAllOverlays(); return; }
      if (clearInkHere()) return;
      if (viewPly >= 0) exitView();
      return;
    }
    if (!G || !G.played.length || document.querySelector(".ov:not(.hide)")) return;
    var at = viewPly >= 0 ? viewPly : G.played.length - 1;
    if (e.key === "ArrowLeft") { viewAt(Math.max(0, at - 1)); e.preventDefault(); }
    else if (e.key === "ArrowRight") { if (viewPly >= 0) { if (at + 1 >= G.played.length - 1) exitView(); else viewAt(at + 1); } e.preventDefault(); }
    else if (e.key === "Home") { viewAt(0); e.preventDefault(); }
    else if (e.key === "End") { if (viewPly >= 0) exitView(); e.preventDefault(); }
    else if (e.key === "?") { showWhy(at); e.preventDefault(); }
  });
  $("resultChip").addEventListener("click", function () { if (over) { exitView(); $("ovEnd").classList.remove("hide"); } });

  /* end card */
  $("endRematch").addEventListener("click", rematch);
  $("endReview").addEventListener("click", function () {
    $("ovEnd").classList.add("hide");
    var down = fxDown;
    fxCalm(); fxDown = down;      /* the light goes; the fallen king comes back with the final position */
    var marked = G ? markedPlies() : [];
    if (G && G.played.length) viewAt(marked.length ? Math.max(0, marked[0] - 1) : 0);
    syncTurnStrip();
    toast(marked.length ? "\u25c0 \u25b6 step between the moves worth a second look \u2014 or tap any move in the list. 🏁 Result brings the card back."
                        : "Tap moves in the list to step through (or use ← →). 🏁 Result brings the card back.");
  });
  $("endMenu").addEventListener("click", showMenu);

  /* settings */
  $("setOpenStudio").addEventListener("click", function () { hideAllOverlays(); openStudio(); });
  function setVoice(v) {
    prefs.coach = v !== "off";
    if (v !== "off") prefs.coachVoice = v;
    savePrefs(); syncSettingsUI(); renderNotes(); syncMoveList();
  }
  $("vcPlain").addEventListener("click", function () { setVoice("plain"); });
  $("vcBrief").addEventListener("click", function () { setVoice("brief"); });
  $("vcOff").addEventListener("click", function () { setVoice("off"); });
  $("tabMoves").addEventListener("click", function () { showPanelTab("moves"); });
  $("tabNotes").addEventListener("click", function () { showPanelTab("notes"); });
  $("setSound").addEventListener("click", function () {
    prefs.sound = !prefs.sound; savePrefs(); syncSettingsUI();
    if (typeof Sound !== "undefined") Sound.enable(prefs.sound);
    /* the switch is a click, which is the gesture a browser wants
       before it will start an audio clock at all */
    if (prefs.sound) { Sound.wake(); Sound.tap(6, 0.8); }
    syncRoomTone();
  });
  ["pvLively", "pvNatural"].forEach(function (id) {
    $(id).addEventListener("click", function () {
      prefs.pieceVoice = id === "pvNatural" ? "natural" : "lively"; savePrefs(); syncSettingsUI(); syncRoomTone();
      /* a pawn set down, so you hear what you chose */
      if (prefs.sound && typeof Sound !== "undefined") {
        Sound.wake(); Sound.tap(1, 0.8);
        if (typeof Stage !== "undefined" && prefs.pieceVoice === "lively") Stage.move({ piece: 1, to: 0x34, from: 0x14 }, { dur: 120, travel: 1 }, { mine: true });
      }
    });
  });
  /* tilt: on iOS the phone only sends it after a tap has asked, so the
     switch is that tap; elsewhere it simply turns it on and off */
  $("setTilt").addEventListener("click", function () {
    var DOE = window.DeviceOrientationEvent;
    var on = prefs.tilt && !(tiltNeedsAsk() && !tiltAllowed);
    if (!on && DOE && typeof DOE.requestPermission === "function") {
      DOE.requestPermission().then(function (r) {
        tiltAllowed = r === "granted";
        if (tiltAllowed) lsSet(TILT_OK_KEY, "1"); else lsDel(TILT_OK_KEY);
        prefs.tilt = tiltAllowed; savePrefs(); syncSettingsUI(); syncTilt();
      }).catch(function () { tiltAllowed = false; syncSettingsUI(); });
      return;
    }
    prefs.tilt = !on; savePrefs(); syncSettingsUI(); syncTilt();
  });
  $("setHaptics").addEventListener("click", function () {
    prefs.haptics = !prefs.haptics; savePrefs(); syncSettingsUI();
    hap("select");      /* switched on, it says so the only way it can */
  });
  $("setHelpers").addEventListener("click", function () { prefs.helpers = !prefs.helpers; savePrefs(); syncSettingsUI(); syncBoard(); });
  wirePen();
  $("ckSimple").addEventListener("click", function () { prefs.clockSkin = "simple"; savePrefs(); syncSettingsUI(); });
  $("ckClassic").addEventListener("click", function () { prefs.clockSkin = "classic"; savePrefs(); syncSettingsUI(); });
  $("setBack").addEventListener("click", showMenu);

  /* learn */
  $("learnPrev").addEventListener("click", function () { showLearn(learnAt - 1); });
  $("learnNext").addEventListener("click", function () {
    /* the rules end where they are for: a first game, against the gentlest coach */
    if (learnAt === LEARN.length - 1) { hideAllOverlays(); quickPlay(Rating.LEVELS[0].id); }
    else showLearn(learnAt + 1);
  });
  $("learnClose").addEventListener("click", showMenu);

  /* openings */
  $("openingsBack").addEventListener("click", showMenu);

  /* view banner */
  $("viewBanner").addEventListener("click", exitView);

  /* a phone clips the longer opening names and ideas to keep the score in
     view; tapping a clipped card says the whole thing through the usual
     funnel. A card with room to breathe stays quiet under the finger. */
  $("openingCard").addEventListener("click", function () {
    var name = $("ocName"), idea = $("ocIdea");
    var clipped = name.scrollHeight > name.clientHeight + 1 || idea.scrollHeight > idea.clientHeight + 1;
    if (!name.textContent || !clipped) return;
    toast("📖 <b>" + escHtml(name.textContent) + "</b>" +
      (idea.textContent ? " — " + escHtml(idea.textContent) : ""), null, 7000);
  });

  /* link overlay */
  $("linkHostBtn").addEventListener("click", function () { hostFlow(false); });
  $("linkJoinBtn").addEventListener("click", function () { joinFlow(null); });
  $("linkResume").addEventListener("click", rejoinLan);
  $("linkBack").addEventListener("click", function () {
    stopScan();
    stopRoomList();
    /* backing out of a board that never got going should take its four
       letters down with it; a game under way is left exactly alone */
    if (mode !== "lan") Net.roomLeave();
    Net.close();
    showMenu();
  });
  /* --- the four-letter door --- */
  $("roomShare").addEventListener("click", function () {
    var code = $("roomCode").textContent.trim();
    if (!Room.looksLikeCode(code)) { toast("The code isn't ready yet — one moment."); return; }
    shareChallenge(code);
  });
  $("roomOther").addEventListener("click", hostByHandshake);
  $("joinOther").addEventListener("click", joinByHandshake);
  $("roomIn").addEventListener("input", function () {
    var v = Room.tidy(this.value);
    this.value = v;
    /* four letters in and you're off — there is no "go" button to find */
    if (v.length === 4) joinByCode(v);
  });
  $("roomIn").addEventListener("keydown", function (e) {
    if (e.key === "Enter") joinByCode(this.value);
  });
  /* the chip is a button: stop waiting, try them now */
  $("netChip").addEventListener("click", function () {
    if (Net.vitals) Net.vitals.tick(true);
    syncNetChip();
    toast(Net.healing()
      ? "Reaching for them again now — the four letters haven't changed."
      : "The link is " + Net.health().words + ".");
  });
  $("linkShare").addEventListener("click", function () { share($("linkCodeOut").value); });
  $("linkPaste").addEventListener("click", pasteCode);
  $("linkCam").addEventListener("click", function () { scanOn ? stopScan() : startScan(); });
  $("linkCopy").addEventListener("click", function () { clip($("linkCodeOut").value); });
  /* typing or pasting into the box links as soon as the code is complete */
  $("linkCodeIn").addEventListener("input", function () { feedCode(this.value); });

  /* recovery */
  $("recReload").addEventListener("click", function () { location.reload(); });
  $("rec2D").addEventListener("click", function () { prefs.use3d = false; savePrefs(); location.hash = "#force2d"; location.reload(); });
  recWire();

  window.addEventListener("resize", function () {
    if (R2) R2.resize();
    if (R3) R3.resize();
    needFrame();
  });
  /* a tab coming back from the background repaints and settles the clock */
  document.addEventListener("visibilitychange", function () {
    clkAway(document.visibilityState === "hidden", performance.now());
    if (document.visibilityState === "visible") {
      if (R) { R.dirty = true; }
      needFrame();
    }
  });
}
/* ----- clk: time away from the tab -----
   In a game on this device, out of sight is a pause, like the menu: the
   time up to the moment the tab went is charged, the time it was gone is
   not, and the room says so when you are back. In a game between two
   devices it is time spent thinking — the other person waited through
   it — so it is charged in full the moment you return, by the same
   wall-clock arithmetic as every other second, and a flag that fell
   while you were gone falls then, before anything else can happen. The
   charge runs from the last time the clock was read, not from when the
   tab was hidden: a move that arrived while you were away resynced both
   clocks and restarted yours from that moment, and only the time since
   is yours to pay. */
var clkHiddenAt = 0;
function clkAway(hidden, now) {
  if (!clock.on || !clock.run || over || !G) { clkHiddenAt = hidden ? now : 0; return; }
  if (hidden) { clockTick(now); clkHiddenAt = now; return; }
  var gone = clkHiddenAt ? now - clkHiddenAt : 0;
  clkHiddenAt = 0;
  if (mode === "lan") {
    clockTick(now);
    if (!over && gone >= 3000) toast("You were away " + Math.round(gone / 1000) + " s — the clocks kept running.");
    return;
  }
  clock.lastT = now;
  if (gone >= 3000 && !clockPaused()) toast("The clock waited while you were away.");
}

/* ===================== clk: the custom clock on the new-game card =====================
   Six presets and "Other…": whole minutes (1–180) and whole seconds a
   move (0–60). The chips are drawn here from CLK_PRESETS, so the list
   exists once; whatever is typed is held to clkOk's bounds as it is
   typed, and the card says in words what it will start. A custom clock
   is remembered per kind of game like a preset, and opens the card with
   "Other…" chosen and the fields filled in. */
function clkRender() {
  var row = $("clockChips");
  row.innerHTML = "";
  CLK_PRESETS.concat([{ v: "custom", label: "Other…" }]).forEach(function (p) {
    var b = document.createElement("button");
    b.className = "chip";
    b.setAttribute("data-clock", p.v);
    b.textContent = p.label;
    row.appendChild(b);
  });
}
function clkIsPreset(str) {
  for (var i = 0; i < CLK_PRESETS.length; i++) if (CLK_PRESETS[i].v === str) return true;
  return false;
}
function clkClamp(v, lo, hi, dflt) {
  v = Math.round(+v);
  if (!isFinite(v)) return dflt;
  return Math.max(lo, Math.min(hi, v));
}
/* the two fields, read as a clock that always passes clkOk */
function clkFromFields() {
  var mn = clkClamp($("clkMin").value, 1, CLK_MAX_MIN, 10), inc = clkClamp($("clkInc").value, 0, CLK_MAX_INC, 0);
  return mn + "+" + inc;
}
function clkSay(str) {
  var p = String(str).split("+"), mn = +p[0], inc = +p[1];
  return mn + (mn === 1 ? " minute" : " minutes") + " each" +
    (inc ? ", plus " + inc + (inc === 1 ? " second" : " seconds") + " back after every move." : ", no time added back.");
}
function clkShowCard(str) {
  var custom = str !== "none" && clkOk(str) && !clkIsPreset(str);
  Array.prototype.forEach.call($("clockChips").children, function (c) {
    var v = c.getAttribute("data-clock");
    c.classList.toggle("sel", custom ? v === "custom" : v === str);
  });
  if (custom) { var p = str.split("+"); $("clkMin").value = p[0]; $("clkInc").value = p[1]; }
  $("clkCustom").classList.toggle("hide", !custom);
  if (custom) $("clkSay").textContent = clkSay(str);
}
function clkWire() {
  clkRender();
  wireChips("clockChips", "clock", function (v) {
    var custom = v === "custom";
    $("clkCustom").classList.toggle("hide", !custom);
    if (custom) { $("clkSay").textContent = clkSay(clkFromFields()); if (!$("clkMin").value) $("clkMin").value = 10; }
    if (newCardCtx) newCardCtx.clockStr = custom ? clkFromFields() : v;
  });
  ["clkMin", "clkInc"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      var str = clkFromFields();
      $("clkSay").textContent = clkSay(str);
      if (newCardCtx) newCardCtx.clockStr = str;
    });
    /* leaving a field shows the number that will really be used */
    $(id).addEventListener("change", function () {
      var p = clkFromFields().split("+");
      $("clkMin").value = p[0]; $("clkInc").value = p[1];
    });
  });
}

/* ===================== aq: always a queen =====================
   Off by default: the picker is there for the rare underpromotion, and a
   convenience should not quietly take that away. Switched on, a pawn
   reaching the last rank becomes a queen in the same gesture — except
   when the queen would be the wrong answer the board can prove: another
   piece mates and the queen doesn't, or the queen stalemates and another
   piece doesn't. Then the picker opens anyway, with one line saying why.
   Lessons always ask (an Academy answer can be an underpromotion). */
var AQ_NAMES = { 2: "knight", 3: "bishop", 4: "rook", 5: "queen" };
/* what each promotion on from→to would do: "mate", "stalemate" or "" */
function aqOutcomes(g, from, to) {
  var out = {}, copy = Chess.create(Chess.fen(g));
  Chess.movesFrom(copy, from).forEach(function (m) {
    if (m.to !== to || !m.promo) return;
    Chess.make(copy, m);
    var none = !Chess.moves(copy).length;
    out[Math.abs(m.promo)] = none ? (Chess.inCheck(copy) ? "mate" : "stalemate") : "";
    Chess.unmake(copy);
  });
  return out;
}
/* the sentence that says why the room is asking after all, or null */
function aqWhyFor(g, from, to) {
  var o = aqOutcomes(g, from, to), k, order = [2, 4, 3];
  if (o[5] !== "mate") {
    for (k = 0; k < order.length; k++) if (o[order[k]] === "mate")
      return "A " + AQ_NAMES[order[k]] + " here is checkmate — the queen isn't.";
  }
  if (o[5] === "stalemate") {
    for (k = 0; k < 3; k++) if (o[[4, 3, 2][k]] === "")
      return "A queen here is stalemate — a draw. A " + AQ_NAMES[[4, 3, 2][k]] + " keeps the game going.";
  }
  return null;
}
/* tapSquare's promotion: the queen's move to play now, or null when the
   picker has been opened instead */
function aqChoose(from, to) {
  var why = prefs.autoQueen && mode !== "lesson" ? aqWhyFor(G, from, to) : null;
  if (!prefs.autoQueen || mode === "lesson" || why) { askPromotion(from, to, why); return null; }
  for (var i = 0; i < legalMoves.length; i++) {
    if (legalMoves[i].to === to && legalMoves[i].promo === Chess.Q * G.turn) return legalMoves[i];
  }
  askPromotion(from, to);
  return null;
}
function aqSync() {
  $("aqAsk").classList.toggle("sel", !prefs.autoQueen);
  $("aqQueen").classList.toggle("sel", !!prefs.autoQueen);
}
function aqWire() {
  $("aqAsk").addEventListener("click", function () { prefs.autoQueen = false; savePrefs(); aqSync(); });
  $("aqQueen").addEventListener("click", function () { prefs.autoQueen = true; savePrefs(); aqSync(); });
  aqSync();
}

/* ===================== the cast: a face across the board =====================
   Playing the computer is playing somebody. Each coach on the ladder is a
   character (cast.js: a name, a look, a voice, a way of talking), drawn
   as a little plant in a pot in its own name tag (avatar.js), and it
   behaves like someone sitting across the table: it introduces itself
   the first time you meet, says hello when you come back, thinks with
   its eyes up, looks at the move that was just made, is pleased with a
   capture and put out by losing one, says check, and has something to
   say at the end.

   It never says anything about the position you could not see for
   yourself: the lines are about how it feels to be in the game. "I'm
   ahead" is said only when the material on the board already says so.
   Everything it says is in a bubble that goes away by itself (or at a
   tap), and the Settings switch "Opponents talk" quiets the words; the
   face still reacts. */
var castFace = null, castFaceFailed = false, castMeetFace = null, castSaid = {}, castSayT = 0, castTypeT = 0;
var castMoves = 0, castFelt = { ahead: false, behind: false }, castRematch = false, castSeed = 0, castLastSay = 0;
(function () {
  var stored = {};
  try { stored = JSON.parse(lsGet(PREF_KEY) || "{}") || {}; } catch (e) {}
  prefs.chatter = !(stored.chatter === false || stored.chatter === "false");
  prefs.met = stored.met && typeof stored.met === "object" ? stored.met : {};
})();
function castWho() { return mode === "coach" && typeof Cast !== "undefined" ? Cast.get(skill) : null; }
function castLevel() { return Rating.levelById ? Rating.levelById(skill) : null; }
/* the face goes in the coach's own name tag, wherever the board has put it */
function castPlace() {
  var wrap = $("oppFaceWrap"), say = $("oppSay"), who = castWho();
  if (!who) { wrap.classList.add("hide"); castHush(); return; }
  var top = -humanSide === -orientation;
  var bar = document.querySelector(top ? ".pbar.top" : ".pbar.bot");
  if (bar && wrap.parentNode !== bar) bar.insertBefore(wrap, bar.firstChild);
  say.classList.toggle("below", !top);
  wrap.classList.remove("hide");
  if (!castFace && !castFaceFailed && typeof Avatar !== "undefined") {
    try { castFace = Avatar.create($("oppFace")); } catch (e) { castFace = null; }
    if (!castFace) castFaceFailed = true;
  }
  wrap.classList.toggle("flat", !castFace);
  var lv = castLevel();
  $("oppEmoji").textContent = lv ? lv.emoji : "";
  if (castFace && castFace.id !== skill) castFace.set(skill);
}
/* one line of a kind, in a bubble, with the mouth moving and a babble
   under it at the coach's own pitch */
function castSay(kind, mood, vars) {
  var who = castWho();
  if (!who) return false;
  if (castFace && mood) castFace.mood(mood, 1600);
  if (!prefs.chatter) return false;
  var n = castSaid[kind] = (castSaid[kind] || 0) + 1;
  var text = Cast.line(skill, kind, n - 1 + castSeed);
  if (!text) return false;
  if (vars) text = text.replace(/\{(\w+)\}/g, function (all, k) { return vars[k] != null ? String(vars[k]) : all; });
  var say = $("oppSay");
  say.innerHTML = '<span class="who">' + escHtml(who.name) + "</span>" + escHtml(text);
  say.classList.remove("hide");
  clearTimeout(castSayT);
  var ms = paceWords(Cast.readMs(text)), syl = Cast.syllables(text);
  castSayT = setTimeout(castHush, ms);
  castLastSay = Date.now();
  if (castFace) { castFace.talk(Math.min(ms - 300, 250 + syl * 1000 / who.voice.rate), who.voice.rate); if (mood) castFace.mood(mood, ms); }
  snd("babble", { hz: who.voice.hz, n: Math.min(10, syl), rate: who.voice.rate, seed: n * 31 + text.length });
  return true;
}
function castHush() { clearTimeout(castSayT); $("oppSay").classList.add("hide"); }
/* the eyes go to a square: where it is on the screen, as the face sees it */
function castLook(sq) {
  if (!castFace || !R || !R.squareToScreen) return;
  var p = R.squareToScreen(sq), st = $("stage").getBoundingClientRect();
  if (!p || !st.width) return;
  var top = -humanSide === -orientation;
  castFace.lookAt((p.x / st.width) * 2 - 1, top ? -0.75 : 0.75);
}
/* material on the board, from the coach's side, in pawns: what anyone
   can count for themselves */
function castMaterial() {
  var sum = 0, cs = -humanSide;
  for (var sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    var pc = G.board[sq];
    if (pc && Math.abs(pc) !== 6) sum += (pc * cs > 0 ? 1 : -1) * Chess.VAL[Math.abs(pc)];
  }
  return sum / 100;
}
/* a new game: hello (the first time, the whole introduction), or hello
   again, or "again?" after a rematch */
function castStart() {
  castSaid = {}; castMoves = 0; castFelt = { ahead: false, behind: false };
  if (castMeetOn) castMeetDone();
  castSeed = Math.floor(Date.now() / 60000) % 3;
  castHush();
  clearTimeout(castTypeT);
  castPlace();
  var who = castWho(), was = castRematch;
  castRematch = false;
  if (!who) return;
  if (castFace) { castFace.mood("happy", 1300); castFace.wake(2400); castFace.lookAt(0, -0.2); }
  tcPopHide();
  if (!prefs.met[skill]) { castMeet(); return; }
  if (!was) hiShow(); else if (hiOn) hiDone();
  var t = gameTicket, gr = persGreeting(was);
  setTimeout(function () {
    if (t !== gameTicket || castWho() !== who || over) return;
    castSay(gr.kind, "happy", gr);
    if (castFace) castFace.quirk();
  }, 950);
  persIdle();
}
/* meeting a coach for the first time: it comes in large over the board,
   introduces itself (typed out as it is said), and goes to its seat. Not
   a card: nothing waits on it, the board under it takes a move, and any
   touch sends it to its seat early. */
var castMeetT = 0, castMeetOn = false;
function castMeet() {
  var who = castWho(), lv = castLevel();
  if (!who) return;
  $("meetName").textContent = (lv ? lv.emoji + " " : "") + who.name;
  $("meetTitle").textContent = who.title.charAt(0).toUpperCase() + who.title.slice(1) + (lv ? " · rated " + lv.elo : "");
  $("meetHint").textContent = humanSide === 1 ? "You have White: your move." : "You have Black: " + who.name + " opens.";
  /* its tell: what to watch for, in its own words */
  var tip = Cast.line(skill, "tip", 0);
  $("meetTip").textContent = tip ? "\u201c" + tip + "\u201d" : "";
  $("meetTip").classList.toggle("hide", !tip);
  /* and its talents: they light up, and what it is still learning */
  $("meetCard").innerHTML = talentHTML(skill, { mini: true });
  $("castMeet").classList.toggle("hasCard", !!$("meetCard").innerHTML);
  homeSync();
  homeMeetLine();
  var text = Cast.line(skill, "hello", 0), box = $("meetSay"), card = $("castMeet");
  box.textContent = "";
  card.classList.remove("leave");
  card.classList.toggle("below", -humanSide !== -orientation);
  card.classList.remove("hide");
  castMeetOn = true;
  prefs.met[skill] = 1; savePrefs();
  clearTimeout(castMeetT);
  castMeetT = setTimeout(castMeetDone, Cast.readMs(text) + 1600 + Math.round(2400 * paceDial().words));
  /* face, name and words first; the talents rise in as the words are said */
  talentGo($("meetCard"), REDUCED ? 0 : 1100);
  if (!castMeetFace && typeof Avatar !== "undefined") { try { castMeetFace = Avatar.create($("meetFace")); } catch (e) { castMeetFace = null; } }
  if (castMeetFace) { castMeetFace.resize(); castMeetFace.set(skill); castMeetFace.lookAt(0, 0); castMeetFace.mood("happy", 1500); castMeetFace.wake(4000); }
  var syl = Cast.syllables(text);
  if (castMeetFace) castMeetFace.talk(300 + syl * 1000 / who.voice.rate, who.voice.rate);
  if (prefs.chatter) snd("babble", { hz: who.voice.hz, n: Math.min(10, syl), rate: who.voice.rate, seed: text.length });
  if (REDUCED) { box.textContent = text; return; }
  var i = 0;
  (function type() {
    i = Math.min(text.length, i + 2);
    box.textContent = text.slice(0, i);
    if (i < text.length) castTypeT = setTimeout(type, 38);
  })();
}
function castMeetDone() {
  if (!castMeetOn) return;
  castMeetOn = false;
  clearTimeout(castTypeT); clearTimeout(castMeetT);
  var card = $("castMeet");
  card.classList.add("leave");
  setTimeout(function () { if (!castMeetOn) { card.classList.add("hide"); card.classList.remove("leave"); if (castMeetFace) castMeetFace.sleep(); } }, 560);
  if (castFace) { castFace.mood("happy", 900); castFace.lookAt(0, -0.6); }
}
/* ===== talent cards =====
   Every coach has a card that shows what it is gifted at, the way a game
   shows a character's skills: four talents out of five (bold, steady,
   clever, wise) that light up a pip at a time, what it is great at, and
   what it is still learning, said as something you can try and learn
   from. It comes with the first meeting, fills the chapter card, says a
   friendly hello when a game with a coach you know begins, and opens any
   time you tap the coach's name. None of it waits on you or stands in
   the way of a move. */
/* how the talents light up: one pip after another, across the whole
   card (row by row), so the card counts up like a stat screen. TC_STEP
   is the gap between pips; a pip pops TC_POP into its animation, which
   is when its tick sounds and the total goes up by one */
var TC_STEP = 62, TC_POP = 120;
function hexA(hex, a) {
  var m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "rgba(240,160,32," + a + ")";
  var v = parseInt(m[1], 16);
  return "rgba(" + (v >> 16) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + a + ")";
}
function talentHTML(id, o) {
  o = o || {};
  var c = typeof Cast !== "undefined" && Cast.card ? Cast.card(id) : null;
  if (!c) return "";
  var who = Cast.get(id), order = 0;
  var h = '<div class="tcard' + (o.mini ? " mini" : "") + '" style="--tc:' + who.look.col + ";--tcGlow:" + hexA(who.look.col, 0.45) + '">';
  /* the total, top right: every pip the coach has, counted up as they light */
  h += '<span class="tcTotal" aria-label="' + c.total + ' talent stars"><em aria-hidden="true">✨</em><b aria-hidden="true">' + c.total + "</b></span>";
  if (o.style) h += '<div class="tcStyle"><b>Style</b><span>' + escHtml(c.style) + "</span><small>" + escHtml(who.style.desc) + "</small></div>";
  h += '<div class="tcStats" data-id="' + id + '">' + c.talents.map(function (t) {
    var pips = "", max = t.v >= Cast.TALENT_MAX;
    for (var k = 0; k < Cast.TALENT_MAX; k++) {
      if (k < t.v) { pips += '<i class="on" data-o="' + order + '" style="--d:calc(var(--t0, 0ms) + ' + order * TC_STEP + 'ms)"></i>'; order++; }
      else pips += "<i></i>";
    }
    /* a talent at its very top gets a glint and a star when its last pip lands */
    var md = 'style="--md:calc(var(--t0, 0ms) + ' + ((order - 1) * TC_STEP + 260) + 'ms)"';
    return '<span class="tcStat' + (max ? " max" : "") + '" ' + (max ? md + " " : "") + 'role="button" tabindex="0" data-k="' + t.key + '" title="' + escHtml(t.label + ": " + t.what) + '" aria-label="' + t.label + " " + t.v + " out of " + Cast.TALENT_MAX + '"><em aria-hidden="true">' + t.emoji +
      "</em><b>" + t.label + (max ? '<small class="tcMaxTag" aria-hidden="true">★MAX</small>' : "") + '</b><span class="tcPips" aria-hidden="true">' + pips + "</span></span>";
  }).join("") + "</div>";
  if (!o.mini) h += '<div class="tcLine great"><em aria-hidden="true">🌟</em><span><b>Great at</b>' + escHtml(c.great) + "</span></div>";
  h += '<div class="tcLine growing"><em aria-hidden="true">🌱</em><span><b>Still growing</b>' + escHtml(c.growing) + "</span></div>";
  if (o.trick) h += '<div class="tcLine trick"><em aria-hidden="true">' + c.trick.emoji + "</em><span><b>Favourite trick</b>" + escHtml(c.trick.name) +
    (o.trick === "tip" && Cast.line(id, "tip", 0) ? "<small>“" + escHtml(Cast.line(id, "tip", 0)) + "”</small>" : "") + "</span></div>";
  return h + "</div>";
}
/* a talent, explained: tap it and a line opens under the talents saying
   what it means and how much of it this coach has, kindly. Tap it again
   (or another) to change or close it */
var TC_HOW = ["", "just getting started", "learning it", "good at it", "really good at it", "the very best at it"];
function talentInfo(stat) {
  var grid = stat && stat.closest(".tcStats"), id = grid && grid.dataset.id;
  var c = id && Cast.card ? Cast.card(id) : null;
  if (!c) return false;
  var t = c.talents.filter(function (x) { return x.key === stat.dataset.k; })[0];
  var old = grid.querySelector(".tcInfo"), same = old && old.dataset.k === t.key;
  if (old) old.remove();
  Array.prototype.forEach.call(grid.querySelectorAll(".tcStat.sel"), function (x) { x.classList.remove("sel"); x.setAttribute("aria-expanded", "false"); });
  hap("tick");
  if (same) return true;
  var box = document.createElement("div");
  box.className = "tcInfo";
  box.dataset.k = t.key;
  box.setAttribute("role", "status");
  box.style.setProperty("--sc", getComputedStyle(stat).getPropertyValue("--sc"));
  box.innerHTML = '<em aria-hidden="true">' + t.emoji + "</em><span><b>" + t.label + "</b> means it " + escHtml(t.what) + ". " +
    escHtml(c.name) + " is " + TC_HOW[Math.max(1, Math.min(5, t.v))] + " (" + t.v + " of " + Cast.TALENT_MAX + ").</span>";
  grid.appendChild(box);
  stat.classList.add("sel");
  stat.setAttribute("aria-expanded", "true");
  return true;
}
/* the reveal. `t0` is when the first pip lands (ms from now): the card
   rises just before it, the pips light one after another with a tick
   that climbs the scale and a tap in the hand, the total counts up with
   them, a talent at its top glints, and a sheen crosses the card at the
   end. With reduced motion it is simply all there. */
function talentGo(el, t0) {
  var f = el && el.querySelector(".tcard");
  if (!f) return;
  t0 = Math.max(0, t0 | 0);
  (f._tcT || []).forEach(clearTimeout);
  f._tcT = [];
  f.style.setProperty("--t0", t0 + "ms");
  f.classList.remove("go"); f.classList.remove("shine");
  void f.offsetWidth;
  f.classList.add("go");
  var lit = f.querySelectorAll(".tcPips i.on"), n = lit.length, num = f.querySelector(".tcTotal b");
  if (!uimOn()) { if (num) num.textContent = String(n); return; }
  if (num) num.textContent = "0";
  f.dataset.count = "0";
  Array.prototype.forEach.call(lit, function (p, k) {
    f._tcT.push(setTimeout(function () {
      if (!f.isConnected) return;
      f.dataset.count = String(k + 1);
      if (num) { num.textContent = String(k + 1); uimRun(num, [{ transform: "scale(1.45)" }, { transform: "none" }], { duration: 170, easing: "cubic-bezier(.2,1.4,.4,1)" }); }
      if (prefs.sound && typeof Sound !== "undefined" && Sound.countTick) Sound.countTick(k + 1, n, true);
      hap("count");
    }, t0 + k * TC_STEP + TC_POP));
  });
  f._tcT.push(setTimeout(function () {
    if (!f.isConnected) return;
    if (num) num.textContent = String(n);
    f.classList.add("shine");
    if (f.querySelector(".tcStat.max")) hap("star");
  }, t0 + Math.max(0, n - 1) * TC_STEP + 300));
}
/* the hello: a coach you have met before, a new game. You and the coach
   side by side, and one thing it is still learning. A friendly beat,
   never a wall: it sits over the middle of the board without taking a
   touch, any touch sends it off, and it lasts as long as your pace likes
   words to stay up */
var hiT = 0, hiOn = false;
function hiShow() {
  var who = castWho(), c = who && Cast.card ? Cast.card(skill) : null, ban = $("hiBan");
  if (!c || !ban) return false;
  var lv = castLevel();
  $("hiYou").textContent = sideName(humanSide);
  var face = jrnPortrait(skill, 112);
  $("hiThem").innerHTML = (face ? '<img class="hiFace" alt="" src="' + face + '">' : "") +
    '<span class="hiName">' + (lv ? lv.emoji + " " : "") + escHtml(who.name) + "<small>" + escHtml(c.style) + "</small></span>";
  ban.style.setProperty("--tc", who.look.col);
  ban.style.setProperty("--tcGlow", hexA(who.look.col, 0.55));
  $("hiTip").innerHTML = '<em aria-hidden="true">\ud83c\udf31</em> <b>Still growing:</b> ' + escHtml(c.growing);
  ban.classList.remove("leave");
  ban.classList.remove("hide");
  void ban.offsetWidth;
  ban.classList.add("on");
  hiOn = true;
  clearTimeout(hiT);
  hiT = setTimeout(hiDone, Math.round(2800 * paceDial().words));
  return true;
}
function hiDone() {
  if (!hiOn) return;
  hiOn = false;
  clearTimeout(hiT);
  var ban = $("hiBan");
  /* the entrance lets go, so the exit's transitions can play */
  ban.classList.remove("on");
  ban.classList.add("leave");
  setTimeout(function () { if (!hiOn) { ban.classList.add("hide"); ban.classList.remove("leave"); } }, 460);
}
/* the coach's own card, any time: tap its name */
var tcPopOn = false;
function tcPopShow() {
  var who = castWho();
  if (!who) return false;
  var lv = castLevel(), rec = persRecord(skill);
  $("tcPopName").textContent = (lv ? lv.emoji + " " : "") + who.name;
  $("tcPopSub").textContent = who.title.charAt(0).toUpperCase() + who.title.slice(1) + " \u00b7 " + SKILLS[skill].elo +
    (rec.n ? " \u00b7 you " + rec.w + "\u2013" + rec.l + (rec.d ? "\u2013" + rec.d : "") : "");
  var face = jrnPortrait(skill, 144);
  $("tcPopFace").innerHTML = face ? '<img alt="" src="' + face + '">' : "<em>" + (lv ? lv.emoji : "") + "</em>";
  $("tcPopBody").innerHTML = talentHTML(skill, { style: true, trick: true });
  var pop = $("tcPop");
  clearTimeout(tcPopT);
  pop.style.setProperty("--tc", who.look.col);
  pop.style.setProperty("--tcGlow", hexA(who.look.col, 0.5));
  pop.classList.toggle("below", -humanSide !== -orientation);
  pop.classList.remove("out");
  pop.classList.remove("hide");
  tcPopOn = true;
  /* the card flips up first; the talents start lighting as it lands */
  talentGo($("tcPopBody"), 330);
  snd("open");
  hap("select");
  return true;
}
/* it flips back down rather than vanishing */
var tcPopT = 0;
function tcPopHide() {
  if (!tcPopOn) return;
  tcPopOn = false;
  var pop = $("tcPop"), f = pop.querySelector(".tcard");
  if (f && f._tcT) f._tcT.forEach(clearTimeout);
  if (!uimOn()) { pop.classList.add("hide"); return; }
  pop.classList.add("out");
  clearTimeout(tcPopT);
  tcPopT = setTimeout(function () { if (!tcPopOn) { pop.classList.add("hide"); pop.classList.remove("out"); } }, 200);
}
function talentWire() {
  ["nameTop", "nameBot"].forEach(function (nid) {
    var tag = $(nid).parentNode;
    tag.addEventListener("click", function (e) {
      if (!tag.classList.contains("tcTap")) return;
      e.stopPropagation();
      if (tcPopOn) tcPopHide(); else tcPopShow();
    });
    tag.addEventListener("keydown", function (e) {
      if (tag.classList.contains("tcTap") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); if (tcPopOn) tcPopHide(); else tcPopShow(); }
    });
  });
  /* any touch elsewhere puts it away (and still does what it was for) */
  document.addEventListener("pointerdown", function (e) {
    if (hiOn) hiDone();
    if (tcPopOn && !e.target.closest("#tcPop") && !e.target.closest(".ptag.tcTap")) tcPopHide();
  }, true);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && tcPopOn) tcPopHide(); }, true);
  /* a tap on a talent explains it; a tap anywhere else on the card puts it away */
  $("tcPop").addEventListener("click", function (e) { if (!e.target.closest(".tcStat, .tcInfo")) tcPopHide(); });
  document.addEventListener("click", function (e) {
    var st = e.target.closest && e.target.closest(".tcStat");
    if (st) { e.stopPropagation(); talentInfo(st); }
  }, true);
  document.addEventListener("keydown", function (e) {
    var st = e.target.closest && e.target.closest(".tcStat");
    if (st && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); talentInfo(st); }
  });
}
/* the coach's tag says it can be tapped */
function talentTagSync() {
  var coachSide = castWho() ? -humanSide : 0, who = castWho();
  [["nameTop", -orientation], ["nameBot", orientation]].forEach(function (p) {
    var tag = $(p[0]).parentNode, on = !!coachSide && p[1] === coachSide;
    tag.classList.toggle("tcTap", on);
    if (on) { tag.setAttribute("role", "button"); tag.tabIndex = 0; tag.setAttribute("aria-label", "About " + who.name + ": see its talents"); }
    else { tag.removeAttribute("role"); tag.removeAttribute("tabindex"); tag.removeAttribute("aria-label"); }
  });
  if (!coachSide) { tcPopHide(); if (hiOn) hiDone(); }
}
/* after any move: look at it, and say something if there is something to say */
function castAfterMove(m, st) {
  if (!castWho()) return;
  var t = gameTicket, coachSide = -humanSide, byCoach = m.piece * coachSide > 0;
  var took = m.capt ? Math.abs(m.capt) : (m.flags & Chess.F_EP) ? 1 : 0;
  if (byCoach) castMoves++;
  /* as the piece lands, not as it sets off */
  setTimeout(function () {
    if (t !== gameTicket || !castWho()) return;
    castLook(m.to);
    if (over) return;                       /* the end has its own words */
    var said = false;
    if (st.reason === "check") said = castSay(byCoach ? "check" : "checked", byCoach ? "happy" : "surprised");
    if (!said && took) {
      if (byCoach && (took >= 2 || castMoves % 3 === 0)) said = castSay("took", "happy");
      else if (!byCoach && (took >= 2 || !castSaid.lost)) said = castSay("lost", took >= 5 ? "sad" : "surprised");
      else if (castFace) castFace.mood(byCoach ? "happy" : "surprised", 900);
    }
    /* how it is going, once each way, and only when the board shows it */
    if (!said && byCoach && Date.now() - castLastSay > 6000) {
      var mat = castMaterial();
      if (mat >= 3 && !castFelt.ahead) { castFelt.ahead = true; castSay("ahead", "happy"); }
      else if (mat <= -3 && !castFelt.behind) { castFelt.behind = true; castSay("behind", "sad"); }
    }
  }, REDUCED ? 60 : 380);
}
/* thinking: eyes up, head on one side, now and then a word */
function castThinking(on) {
  if (!castFace || !castWho()) return;
  if (on) {
    castFace.mood("think", 0); castFace.wake(30000);
    /* Pine can't help counting out loud with its eyes */
    if (castWho().quirk === "tick" && Math.random() < 0.5) castFace.quirk("tick", 1200);
    if (castMoves > 1 && castMoves % 5 === 2 && Date.now() - castLastSay > 6000) castSay("think");
  } else {
    castFace.mood("idle", 1); castFace.sleep();
  }
}
/* the end: pleased, put out, or content with half */
function castAtEnd(result) {
  var who = castWho();
  if (!who) return;
  castHush();
  var coachWon = (result === "white" && humanSide === -1) || (result === "black" && humanSide === 1);
  var kind = result === "draw" ? "draw" : coachWon ? "win" : "lose", lvl = skill;
  setTimeout(function () {
    if (castWho() !== who) return;
    /* beaten for the first time, it hands over its board instead */
    if (kind === "lose" && homeJust === lvl) castSay("gift", "lose");
    else if (kind === "lose" && moStory && moStory.comeback) castSay("comeback", "shocked");
    else castSay(kind, kind === "win" ? "win" : kind === "lose" ? "lose" : "happy");
    /* and its own way of winning or losing: a victory hop or twirl; a
       sulky tap, a recalculation, a gracious bow */
    if (castFace) {
      if (kind === "win") setTimeout(function () { if (castWho() === who && castFace) castFace.quirk(null, 1600); }, 900);
      else if (kind === "lose" && /tap|tick|bow|nod/.test(who.quirk)) setTimeout(function () { if (castWho() === who && castFace) castFace.quirk(); }, 1400);
    }
  }, REDUCED ? 100 : 900);
  if (castFace) castFace.wake(3000);
}
/* the ladder shows who you would be playing: each coach's face, as a
   still, in place of its emoji (drawn once a session, a moment after
   the lobby is up, so it never holds the lobby up) */
var castStillsT = 0;
function castLadderFaces(lad) {
  if (typeof Avatar === "undefined" || !Avatar.portrait) return;
  clearTimeout(castStillsT);
  castStillsT = setTimeout(function () {
    var spots = lad.querySelectorAll(".rung .rgE");
    Rating.LEVELS.forEach(function (Lv, i) {
      var el = spots[i], url = Avatar.portrait(Lv.id, 112);
      if (!el || !url) return;
      el.innerHTML = '<img class="rgFace" alt="" src="' + url + '">';
    });
  }, 60);
}
function castSync() {
  $("setChatter").classList.toggle("sel", !!prefs.chatter);
  $("setChatter").textContent = prefs.chatter ? "On" : "Off";
}
function castWire() {
  /* any touch, anywhere, sends a coach that is still introducing itself
     to its seat (and still does whatever else the touch was for) */
  document.addEventListener("pointerdown", function () { if (castMeetOn) castMeetDone(); }, true);
  document.addEventListener("keydown", function () { if (castMeetOn) castMeetDone(); }, true);
  $("oppSay").addEventListener("click", castHush);
  $("setChatter").addEventListener("click", function () {
    prefs.chatter = !prefs.chatter; savePrefs(); castSync();
    if (!prefs.chatter) castHush();
  });
  castSync();
}
/* ===== the coaches' boards =====
   Every coach plays you on its own board: Acorn on a cut stump, Cactus
   on sand and terracotta, Pine on frost, Oak at the library table. The
   first time you beat one in a rated game, its board is yours to use
   anywhere (the first star on the ladder, made into something you can
   see). Your own look is never changed by this: `skin` stays yours, and
   the coach's board is only worn (`wornHome`) while you play that coach.
   Settings can turn it off, and choosing anything in the Studio during
   a game keeps your choice for the rest of that game. */
var homeJust = null;            /* the coach whose board this game has just won */
(function () {
  var stored = {};
  try { stored = JSON.parse(lsGet(PREF_KEY) || "{}") || {}; } catch (e) {}
  prefs.homeBoards = !(stored.homeBoards === false || stored.homeBoards === "false");
})();
function homeUnlocked(id) { var r = ladder.rungs[id]; return !!(r && r.stars[0]); }
function homesWon() { return Rating.LEVELS.filter(function (Lv) { return homeUnlocked(Lv.id); }).length; }
function homeWanted() {
  if (mode !== "coach" || !G || !prefs.homeBoards || homeOff === G) return null;
  return Skins.homeOf(skill) ? skill : null;
}
function homeSync() {
  var want = homeWanted();
  if (want === wornHome) return;
  wornHome = want;
  paintSkin(look());
}
function homeSwatch(h, cls) {
  return '<span class="' + (cls || "swatch") + '" aria-hidden="true">' +
    '<i style="background:' + h.board.light + '"></i><i style="background:' + h.board.dark + '"></i>' +
    '<i style="background:' + h.board.dark + '"></i><i style="background:' + h.board.light + '"></i>' +
    '<b style="background:' + h.pieces.white + ';border-color:' + h.board.rim + '"></b>' +
    '<b style="background:' + h.pieces.black + ';border-color:' + h.board.rim + '"></b></span>';
}
/* what the meeting says about the board you are sitting at */
function homeMeetLine() {
  var el = $("meetBoard"), h = wornHome && Skins.homeOf(wornHome);
  if (!el) return;
  el.classList.toggle("hide", !h);
  if (!h) return;
  el.innerHTML = homeSwatch(h, "mbSw") + "<span></span>";
  el.querySelector("span:last-child").textContent = homeUnlocked(wornHome)
    ? "On " + h.name + " — already yours."
    : "On " + h.name + " — win and it’s yours.";
}
/* the end card: called once the game has been counted */
function homeOnEnd(rs) {
  homeJust = null;
  if (!rs || rs.s !== 1 || rs.newStars.indexOf(0) < 0) return;
  var h = Skins.homeOf(rs.level);
  if (!h) return;
  homeJust = rs.level;
  var mine = skin.name === h.name;
  /* on the journey the board is part of clearing the chapter: that line
     carries it (and its Use it), so the card's three lines go further */
  if (typeof Journey !== "undefined" && Journey.chapterOf(rs.level)) return;
  pushMile("🎨", "<b>Board won:</b> " + escHtml(h.name) + " — yours to play on anywhere. " +
           (mine ? "" : '<button class="chip erUse" data-home="' + escHtml(rs.level) + '">Use it</button>'),
           { cls: "unlock", sting: "milestone", hap: "success", big: true });
}
/* the ladder: each coach's board, small, under its stars — in colour
   once it is yours, behind a lock until then */
function homeLadderChip(id) {
  var h = Skins.homeOf(id);
  if (!h) return "";
  var got = homeUnlocked(id);
  return '<span class="rgBoard' + (got ? " got" : "") + '" title="' + escHtml(h.name + (got ? " — yours" : " — win to take it home")) + '">' +
         homeSwatch(h, "rbSw") + (got ? "" : '<em aria-hidden="true">🔒</em>') + "</span>";
}
/* the Studio: the coaches' boards as a shelf of their own */
function homeStudio() {
  var box = $("stHomes");
  if (!box) return;
  box.innerHTML = "";
  var n = homesWon();
  $("stHomesNote").textContent = (wornHome && Skins.homeOf(wornHome)
    ? "You're on " + Skins.homeOf(wornHome).name + " for this game. Choose anything here to play on it instead. "
    : "") + (n ? n + " of " + Rating.LEVELS.length + " won." : "Beat a coach in a rated game to take its board home.");
  Rating.LEVELS.forEach(function (Lv) {
    var h = Skins.homeOf(Lv.id);
    if (!h) return;
    var got = homeUnlocked(Lv.id), b = document.createElement("button");
    b.className = "preset home" + (got ? "" : " locked") + (got && h.name === skin.name ? " sel" : "");
    b.innerHTML = homeSwatch(h) + '<span class="pt"><b></b><small></small></span>' + (got ? "" : '<span class="lock" aria-hidden="true">🔒</span>');
    b.querySelector(".pt b").textContent = h.name;
    b.querySelector(".pt small").textContent = got ? h.note : "Beat " + Lv.emoji + " " + Lv.name + " (" + Lv.elo + ") to take this board home.";
    b.setAttribute("aria-label", h.name + (got ? "" : ", locked: beat " + Lv.name + " to unlock it"));
    b.addEventListener("click", function () {
      if (!homeUnlocked(Lv.id)) {
        hap("nope");
        toast(Lv.emoji + " " + escHtml(Lv.name) + "’s board is won, not chosen. You play on it every time you play " +
              escHtml(Lv.name) + " — beat " + escHtml(Lv.name) + " once and it’s yours.", null, 3600);
        return;
      }
      applySkin(Skins.homeOf(Lv.id)); renderStudio();
    });
    box.appendChild(b);
  });
}
function homeSyncSetting() {
  var b = $("setHomes");
  if (!b) return;
  b.classList.toggle("sel", !!prefs.homeBoards);
  b.textContent = prefs.homeBoards ? "On" : "Off";
}
function homeWire() {
  $("setHomes").addEventListener("click", function () {
    prefs.homeBoards = !prefs.homeBoards; savePrefs(); homeSyncSetting();
    homeOff = null;
    homeSync();
  });
  /* "Use it" on the end card makes the board just won your own look */
  $("endMiles").addEventListener("click", function (ev) {
    /* "Sit there": a place the road just reached */
    var pl = ev.target.closest && ev.target.closest("[data-place]");
    if (pl) {
      var where = pl.getAttribute("data-place");
      if (!placeOpen(where)) return;
      setScene(where);
      pl.textContent = "✓ You're there"; pl.disabled = true;
      toast("🗺️ Welcome to the " + escHtml(Scenes.get(where).label.toLowerCase()) + ". Change places any time in 🎨 The look.", null, 3000);
      return;
    }
    var b = ev.target.closest && ev.target.closest("[data-home]");
    if (!b) return;
    var id = b.getAttribute("data-home"), h = Skins.homeOf(id);
    if (!h || !homeUnlocked(id)) return;
    applySkin(h);
    b.textContent = "✓ Yours"; b.disabled = true;
    toast("🎨 " + escHtml(h.name) + " is your board now, for every game. Change it any time in 🎨 The look.", null, 3200);
  });
  homeSyncSetting();
}
function homeForTest() {
  return {
    homeState: function () {
      return { worn: wornHome, wornName: look().name, own: skin.name, on: !!prefs.homeBoards,
               unlocked: Rating.LEVELS.filter(function (Lv) { return homeUnlocked(Lv.id); }).map(function (Lv) { return Lv.id; }),
               just: homeJust };
    }
  };
}

/* ===== momentum (momentum.js) =====
   A bar in the top player row that leans toward whoever has the game,
   read only off what anybody can see on the board (so it is never a
   hint), with a glowing star where the two sides meet that springs to
   its new place after every move. When the game turns, it says so: a
   banner, a harp running up (or three soft notes down), and the coach
   feels it, nervous and sweating when you have it and pleased with
   itself when it does. At the end, the story of the game is drawn on
   the card, and a win from behind is a comeback, and is celebrated as
   one. */
var moSt = null, moX = 0.5, moV = 0, moGoal = 0.5, moRaf = 0, moLast = 0, moSparkAt = 0;
var moStory = null, moBannerAt = 0, moBannerT = 0;
(function () {
  var stored = {};
  try { stored = JSON.parse(lsGet(PREF_KEY) || "{}") || {}; } catch (e) {}
  prefs.momentum = !(stored.momentum === false || stored.momentum === "false");
})();
function moMode() { return mode === "coach" || mode === "pass" || mode === "lan"; }
function moOn() { return !!(prefs.momentum && G && moSt && moMode() && typeof Momentum !== "undefined"); }
/* the history, rebuilt from the moves themselves whenever it is out of
   step with the board: a take-back, a saved game picked up, a rejoin */
function moRebuild() {
  if (typeof Momentum === "undefined" || !G) { moSt = null; return; }
  var g = Chess.create(G.startFen || undefined);
  var st = Momentum.create(g.board);
  for (var i = 0; i < G.played.length; i++) {
    var m = G.played[i].m;
    var took = m.capt || ((m.flags & Chess.F_EP) ? (m.piece > 0 ? -1 : 1) : 0);
    Chess.play(g, m);
    var s = Chess.status(g);
    Momentum.step(st, { board: g.board, mover: m.piece > 0 ? 1 : -1, captured: took, check: s.reason === "check" || s.reason === "checkmate", mate: s.reason === "checkmate",
                        piece: m.promo ? (m.piece > 0 ? m.promo : -m.promo) : m.piece, retake: !!took && Chess.attacked(g, m.to, m.piece > 0 ? -1 : 1) });
  }
  moSt = st;
}
/* who sits where on the bar: the top side's share fills from the left,
   the bottom side's from the right, and the star is where they meet */
function moWho(side) {
  if (mode === "coach") return side === humanSide ? "you" : "coach";
  if (mode === "lan") return side === lanSide ? "you" : "friend";
  return side > 0 ? "white" : "black";
}
var MO_COLS = { you: ["#ffd166", "#f0a020"], white: ["#fbf4e6", "#cdbb9b"], black: ["#5b6475", "#2b3140"], friend: ["#9cc0ff", "#4a6fd0"] };
function moCols(who) {
  if (who === "coach" && typeof Cast !== "undefined" && Cast.get(skill)) { var L = Cast.get(skill).look; return [L.col, L.col2 || L.col]; }
  return MO_COLS[who] || MO_COLS.white;
}
function moCap(el, side) {
  var who = moWho(side), key = who + ":" + (who === "coach" ? skill : side);
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  el.className = "moCap" + (who === "you" ? " you" : "");
  el.innerHTML = "";
  if (who === "coach" && typeof Avatar !== "undefined" && Avatar.portrait) {
    var url = null;
    try { url = Avatar.portrait(skill, 64); } catch (e) { url = null; }
    if (url) { var im = document.createElement("img"); im.alt = ""; im.src = url; el.appendChild(im); return; }
  }
  el.textContent = who === "coach" ? (SKILLS[skill] ? SKILLS[skill].emoji : "") : side > 0 ? "♔" : "♚";
}
function moSync(snap) {
  var bar = $("mo");
  if (!bar) return;
  if (G && moMode() && typeof Momentum !== "undefined" && (!moSt || moSt.hist.length !== G.played.length + 1)) moRebuild();
  var show = moOn();
  bar.classList.toggle("hide", !show);
  if (!show) return;
  var top = -orientation, bot = orientation;
  moCap($("moCapTop"), top); moCap($("moCapBot"), bot);
  var ct = moCols(moWho(top)), cb = moCols(moWho(bot));
  bar.style.setProperty("--moT1", ct[0]); bar.style.setProperty("--moT2", ct[1]);
  bar.style.setProperty("--moB1", cb[0]); bar.style.setProperty("--moB2", cb[1]);
  moAim(snap);
}
/* the star's place: 0.5 is even; the bottom side leading moves it left */
function moAim(snap) {
  if (!moSt) return;
  var m = moSt.m * orientation;
  moGoal = Math.max(0.04, Math.min(0.96, 0.5 - 0.5 * m));
  var bar = $("mo");
  bar.classList.toggle("hotB", m >= 0.6);
  bar.classList.toggle("hotT", m <= -0.6);
  if (snap || REDUCED) { moX = moGoal; moV = 0; moDraw(); return; }
  if (!moRaf) { moLast = 0; moRaf = requestAnimationFrame(moTick); }
}
function moDraw() {
  $("moFillT").style.transform = "scaleX(" + moX.toFixed(4) + ")";
  $("moFillB").style.transform = "scaleX(" + (1 - moX).toFixed(4) + ")";
  var orb = $("moOrb"), sp = Math.min(1, Math.abs(moV) * 1.4);
  orb.style.left = (moX * 100).toFixed(3) + "%";
  orb.style.transform = "scale(" + (1 + sp * 0.45).toFixed(3) + "," + (1 - sp * 0.25).toFixed(3) + ")";
}
/* a spring with a little overshoot: it arrives, goes a hair past, and settles */
function moTick(ts) {
  moRaf = 0;
  var dt = moLast ? Math.min(0.05, (ts - moLast) / 1000) : 0.016;
  moLast = ts;
  var a = 150 * (moGoal - moX) - 13 * moV;
  moV += a * dt; moX += moV * dt;
  if (Math.abs(moV) > 0.35 && ts - moSparkAt > 40) { moSparkAt = ts; moSpark(moV); }
  if (Math.abs(moGoal - moX) < 0.0008 && Math.abs(moV) < 0.002) { moX = moGoal; moV = 0; moDraw(); return; }
  moDraw();
  moRaf = requestAnimationFrame(moTick);
}
/* sparks thrown off the back of the star as it runs */
function moSpark(v) {
  var tr = $("moTrack");
  if (!tr || tr.querySelectorAll(".moSpark").length > 12) return;
  var s = document.createElement("i");
  s.className = "moSpark";
  s.style.left = (moX * 100) + "%";
  s.style.setProperty("--dx", (-Math.sign(v) * (10 + Math.random() * 16)).toFixed(1) + "px");
  s.style.setProperty("--dy", ((Math.random() - 0.5) * 22).toFixed(1) + "px");
  s.addEventListener("animationend", function () { s.remove(); });
  tr.appendChild(s);
}
function moFlash() {
  var o = $("moOrb");
  o.classList.remove("flash"); void o.offsetWidth; o.classList.add("flash");
  for (var i = 0; i < 6; i++) moSpark(i % 2 ? 1 : -1);
}
/* the big words over the board */
function moBanner(text, sub, cls, ms) {
  var b = $("moBanner");
  clearTimeout(moBannerT);
  $("moBannerTx").textContent = text;
  $("moBannerSub").textContent = sub || "";
  $("moBannerSub").classList.toggle("hide", !sub);
  b.className = "moBanner " + (cls || "");
  void b.offsetWidth;
  b.classList.add("go");
  moBannerAt = Date.now();
  if (FX) { try { Fx.sparkle($("moBannerTx"), { count: cls === "comeback" ? 30 : 18 }); } catch (e) {} }
  moBannerT = setTimeout(function () { b.className = "moBanner hide"; }, ms || 1950);
}
/* a little bubble over the coach's head: ❗ 💦 ✨ ♪ 💢 */
function castEmote(sym) {
  var w = $("oppFaceWrap");
  if (!sym || !w || w.classList.contains("hide")) return;
  var old = w.querySelector(".emote"); if (old) old.remove();
  var e = document.createElement("span");
  e.className = "emote"; e.textContent = sym;
  w.appendChild(e);
  setTimeout(function () { e.remove(); }, 1800);
}
function moName(side) {
  var who = moWho(side);
  return who === "you" ? "you" : who === "coach" ? SKILLS[skill].name : who === "friend" ? (lanOpp && lanOpp.name) || "your friend" : side > 0 ? "White" : "Black";
}
/* after a move: the bar, and what the game turning means to everybody */
function moAfterMove(m) {
  if (!moOn()) { if (G && moMode() && typeof Momentum !== "undefined") moSync(true); return; }
  var mover = m.piece > 0 ? 1 : -1;
  var took = m.capt || ((m.flags & Chess.F_EP) ? (m.piece > 0 ? -1 : 1) : 0);
  var s = Chess.status(G), ev = [];
  /* the history is one short of the board here; if something has already
     rebuilt it, this move is in it and must not be counted twice */
  if (moSt.hist.length === G.played.length) {
    ev = Momentum.step(moSt, { board: G.board, mover: mover, captured: took, check: s.reason === "check" || s.reason === "checkmate", mate: s.reason === "checkmate",
                               piece: m.promo ? (m.piece > 0 ? m.promo : -m.promo) : m.piece, retake: !!took && Chess.attacked(G, m.to, mover > 0 ? -1 : 1) });
  }
  else moRebuild();
  var t = gameTicket;
  /* as the piece lands */
  setTimeout(function () {
    if (t !== gameTicket || !moSt) return;
    moAim(false);
    var shift = null, surge = null;
    ev.forEach(function (e) { if (e.type === "shift") shift = e; else if (e.type === "surge") surge = e; else if (e.type === "lead") moFlash(); });
    if (surge) moFlash();
    /* a swing that big in one move is a turning point too, even from level */
    if (!shift && surge && surge.by >= 0.45) shift = { type: "shift", side: surge.side };
    var who = castWho(), coachSide = -humanSide;
    if (shift && !over) {
      var mine = sideIsMine(shift.side);
      if (Date.now() - moBannerAt > 6000) {
        moBanner("MOMENTUM!", mode === "pass" ? (shift.side > 0 ? "White" : "Black") + " takes it" :
                 mine ? "It’s swinging your way" : moName(shift.side) + " has it now", mine || mode === "pass" ? "" : "them");
      }
      if (prefs.sound && typeof Stage !== "undefined") Stage.swing(mine);
      hap(mine ? "success" : "tick");
      if (who && castFace) {
        if (shift.side === coachSide) { castFace.mood("gleeful", 1500); castEmote(who.emotes && who.emotes.pleased); }
        else { castFace.mood("shocked", 1300); castEmote(who.emotes && who.emotes.worried); }
        if (Date.now() - castLastSay > 2500) castSay(shift.side === coachSide ? "rally" : "slipping", shift.side === coachSide ? "gleeful" : "shocked");
      }
    } else if (who && castFace && took && !over) {
      var v = Momentum.VAL[Math.abs(took)] || 1;
      if (v >= 3 && mover !== coachSide) { castFace.mood("shocked", 1200); castEmote("❗"); }
      else if (v >= 3 && mover === coachSide) { castFace.mood("gleeful", 1200); castEmote(who.emotes && who.emotes.pleased); }
    }
    moFeel();
  }, REDUCED ? 60 : 380);
}
/* how the coach carries itself between moves: pleased with itself when
   the game is its, nervous when it is yours */
function moFeel() {
  if (!castFace || !castWho() || !moSt) { if (castFace) castFace.base("calm"); return; }
  var v = moSt.m * -humanSide;
  castFace.base(v >= 0.35 ? "smug" : v <= -0.35 ? "nervous" : "calm");
  if (v <= -0.35) castFace.wake(2600);
}
function moStart() {
  moSt = null; moStory = null;
  clearTimeout(moBannerT); $("moBanner").className = "moBanner hide";
  moSync(true);
  if (castFace) castFace.base("calm");
}
/* the end: the story, and whether it was a comeback */
function moAtEnd(result) {
  moStory = null;
  if (!moSt || !moMode() || typeof Momentum === "undefined") return null;
  var winner = result === "white" ? 1 : result === "black" ? -1 : 0;
  var side = mode === "coach" ? humanSide : mode === "lan" ? lanSide : (winner || orientation);
  moStory = Momentum.story(moSt.hist, winner, side);
  moStory.side = side; moStory.winner = winner; moStory.hist = moSt.hist.slice();
  if (castFace) castFace.base("calm");
  if (moStory.comeback && prefs.momentum) {
    var t = gameTicket;
    setTimeout(function () {
      if (t !== gameTicket) return;
      moBanner("COMEBACK!", mode === "pass" ? (winner > 0 ? "White" : "Black") + " turned it around" : "You turned it around", "comeback", 2300);
      if (prefs.sound && typeof Stage !== "undefined") Stage.swing(true, true);
      hap("success");
      if (FX) { try { Fx.confetti({ ms: 2600, layer: "page" }); } catch (e) {} }
    }, REDUCED ? 100 : 700);
  }
  return moStory;
}
/* on the card: a line in the stack, and the story drawn */
function moEndCard() {
  var box = $("endStory");
  box.classList.add("hide");
  if (!moStory || !prefs.momentum) return;
  var S = moStory, h = S.hist, n = h.length;
  /* two people on one screen: both chairs are you, so no line says one of
     you was "never behind" (the COMEBACK! banner still celebrates) */
  if (mode === "pass") { /* no lines */ }
  else if (S.comeback) pushMile("🔥", "<b>Comeback!</b> You were behind, and turned it around.", { cls: "comeback", sting: "milestone", hap: "success", big: true });
  else if (S.wire) pushMile("⭐", "<b>Never behind:</b> yours from the first move to the last.", { cls: "wire" });
  if (n < 6) return;
  var mv = function (ply) { return Math.max(1, Math.ceil(ply / 2)); };
  var won = S.winner === S.side, lost = S.winner === -S.side;
  $("endStoryTx").textContent = S.comeback ? "Behind at move " + mv(S.lowAt) + ", and back from it." :
    S.wire ? "Ahead from the first blow to the last." :
    S.slipped ? "Ahead at move " + mv(S.highAt) + ", and it got away." :
    S.seesaw ? "It swung " + S.turns + " times." :
    won ? "Yours, more and more." : lost ? "Theirs, in the end." : "Level, more often than not.";
  var W = 300, H = 70, mid = 35, pts = [];
  for (var i = 0; i < n; i++) pts.push([(i / (n - 1)) * W, mid - h[i] * S.side * 30]);
  var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
  var area = "M0," + mid + line.replace(/^M/, "L") + "L" + W + "," + mid + "Z";
  var you = mode === "pass" ? (S.side > 0 ? "#f3e9d6" : "#8a96ad") : "#ffd166";
  var them = mode === "coach" && Cast.get(skill) ? Cast.get(skill).look.col : "#7f93b8";
  var low = S.low <= -Momentum.LEAD ? pts[S.lowAt] : null, end = pts[n - 1];
  var svg = $("endStoryG");
  svg.innerHTML =
    '<defs><clipPath id="esUp"><rect x="0" y="0" width="' + W + '" height="' + mid + '"/></clipPath>' +
    '<clipPath id="esDn"><rect x="0" y="' + mid + '" width="' + W + '" height="' + mid + '"/></clipPath>' +
    '<clipPath id="esRev"><rect id="esRevR" x="0" y="-10" width="0" height="' + (H + 20) + '"/></clipPath></defs>' +
    '<line class="mid" x1="0" y1="' + mid + '" x2="' + W + '" y2="' + mid + '"/>' +
    '<g clip-path="url(#esRev)">' +
    '<path d="' + area + '" fill="' + you + '" fill-opacity=".55" clip-path="url(#esUp)"/>' +
    '<path d="' + area + '" fill="' + them + '" fill-opacity=".55" clip-path="url(#esDn)"/>' +
    '<path class="line" d="' + line + '"/>' +
    (low ? '<circle cx="' + low[0].toFixed(1) + '" cy="' + low[1].toFixed(1) + '" r="3.5" fill="#fff" stroke="#3a1c00" stroke-width="1.5"/>' : "") +
    '<text x="' + Math.min(W - 4, Math.max(4, end[0])).toFixed(1) + '" y="' + Math.max(10, Math.min(H - 2, end[1] + 4)).toFixed(1) +
      '" text-anchor="end" font-size="12" fill="#fff">' + (won ? "★" : "") + "</text></g>";
  box.classList.remove("hide");
  /* drawn left to right, as the game was played */
  var r = $("esRevR"), t0 = 0, dur = REDUCED ? 1 : 1300;
  var grow = function (ts) {
    if (!t0) t0 = ts;
    var k = Math.min(1, (ts - t0) / dur);
    r.setAttribute("width", (W * (1 - Math.pow(1 - k, 3))).toFixed(1));
    if (k < 1) requestAnimationFrame(grow);
  };
  setTimeout(function () { requestAnimationFrame(grow); }, REDUCED ? 0 : 900);
}
function moWire() {
  $("setMomentum").addEventListener("click", function () {
    prefs.momentum = !prefs.momentum; savePrefs(); moSyncSetting(); moSync(true); moFeel();
  });
  window.addEventListener("resize", function () { moSync(true); });
  moSyncSetting();
}
function moSyncSetting() {
  $("setMomentum").classList.toggle("sel", !!prefs.momentum);
  $("setMomentum").textContent = prefs.momentum ? "On" : "Off";
}
function momentumForTest() {
  return {
    moState: function () {
      return { on: moOn(), shown: !$("mo").classList.contains("hide"), m: moSt ? moSt.m : null, x: moX, goal: moGoal,
               plies: moSt ? moSt.hist.length - 1 : -1, lead: moSt ? moSt.lead : 0, story: moStory,
               base: castFace ? castFace.state().base : null, banner: $("moBanner").classList.contains("hide") ? "" : $("moBannerTx").textContent };
    },
    moBannerForTest: function () { moBannerAt = 0; }
  };
}

/* ===== the collection (unlocks.js) =====
   Everything there is to win, kept on this device: every coach has a
   board, a secret, a set of colours and something special to give (one
   for each of its stars), and every game played earns experience toward
   a level that brings something new. When something is won it is not a
   line of text: a box drops onto the screen, shakes, and bursts open, and
   what was in it can be put on there and then. The Collection shows all
   of it, what is yours (equip it) and what is still to win (and how). */
var unl = null, unlQueue = [], unlShowing = null, unlGameXp = null, unlRevealT = 0, unlEmoteAt = 0;
var UNL_FX = { "trail-sparkle": "sparkle", "trail-leaves": "leaves", "trail-wind": "wind", "trail-bubbles": "bubbles",
               "trail-rainbow": "rainbow", "trail-comet": "comet", "trail-victory": "victory", "burst-confetti": "confetti", "burst-clover": "clover",
               "burst-prickle": "prickle", "burst-gold": "gold", "burst-stars": "stars", "burst-hearts": "hearts" };
function unlOk() { return typeof Unlocks !== "undefined"; }
function unlLoad() {
  if (!unlOk()) return;
  unl = Unlocks.load(lsGet);
  if (unl.migrated) return;
  /* the first time: what has been played before counts, quietly — no
     boxes for old games, just the things marked NEW in the collection */
  try {
    var list = (Games.load(lsGet).list || []);
    list.forEach(function (e) {
      if (e.mode === "coach" && e.skill) {
        var won = (e.result === "white") === (e.humanSide === 1) && e.result !== "draw";
        unl.xp += Unlocks.xpFor({ mode: "coach", result: e.result === "draw" ? "draw" : won ? "win" : "loss", tier: levelIndex(e.skill), rated: true }).total;
      } else unl.xp += 20;
    });
  } catch (e) {}
  Unlocks.grant(unl, ladder, Date.now(), true, jrnExtra());
  /* a set of pieces already in use stays yours */
  var set = skin && skin.pieces && skin.pieces.set;
  if (set && set !== "classic" && Unlocks.byId("set-" + set)) unl.owned["set-" + set] = unl.owned["set-" + set] || 1;
  unl.migrated = true;
  unlSave();
}
function unlSave() { if (unl) Unlocks.save(unl, lsSet); }
function unlLevel() { return unl ? Unlocks.levelOf(unl.xp) : { level: 1, into: 0, need: 100, frac: 0 }; }
function unlOwned(id) { return !!(unl && unl.owned[id]); }
function unlSetOwned(setId) { return setId === "classic" || !Unlocks.byId("set-" + setId) || unlOwned("set-" + setId); }

/* ---- after a game: experience, then whatever it unlocked ---- */
function unlAtEnd(result, rs) {
  if (!unl || !G || !(mode === "coach" || mode === "pass" || mode === "lan")) { unlGameXp = null; return; }
  var mine = mode === "coach" ? humanSide : mode === "lan" ? lanSide : 0;
  var res = result === "draw" ? "draw" : mine === 0 ? "win" : ((result === "white") === (mine === 1) ? "win" : "loss");
  if (mode === "pass") res = "played";
  var x = Unlocks.xpFor({ mode: mode, result: res, tier: levelIndex(skill), rated: !!rs,
                          stars: rs ? rs.newStars.length : 0,
                          comeback: !!(moStory && moStory.comeback), wire: !!(moStory && moStory.wire) });
  if (persStole === gameTicket && castWho()) {
    x.parts.push({ why: "Used " + castWho().name + "\u2019s own trick", xp: 25 }); x.total += 25;
  }
  unlGameXp = { ticket: gameTicket, parts: x.parts.slice(), shown: 0 };
  $("endGift").classList.add("hide");
  unlGain(x.total, true);
  /* anything still waiting from before is offered on this card too */
  if (unlQueue.length) unlGiftSoon(2600);
}
/* more experience for this game, later (a third star once the moves
   have been looked back over, a feat) */
function unlBonus(why, xp) {
  if (!unl || !unlGameXp || unlGameXp.ticket !== gameTicket) return;
  unlGameXp.parts.push({ why: why, xp: xp });
  unlGain(xp, false);
}
function unlGain(xp, first) {
  var ch = Unlocks.addXp(unl, xp);
  var got = Unlocks.grant(unl, ladder, Date.now(), false, jrnExtra());
  unlSave();
  unlQueue = unlQueue.concat(got);
  unlXpRow(ch, first);
  /* the present on the card, once the card has had its say */
  if (got.length) unlGiftSoon(first ? 2600 : 300);
}
/* the line on the card: +80 XP, the bar filling, LEVEL UP */
function unlXpRow(ch, first) {
  var box = $("endXp");
  if (!box || !unlGameXp) return;
  box.classList.remove("hide");
  var total = 0;
  unlGameXp.parts.forEach(function (p) { total += p.xp; });
  $("endXpWhy").textContent = unlGameXp.parts.map(function (p) { return p.why + " +" + p.xp; }).join(" · ");
  var lvEl = $("endXpLv"), bar = $("endXpBar"), num = $("endXpNum");
  var from = ch.before, to = ch.after, my = gameTicket;
  if (first || !unlGameXp.from) unlGameXp.from = from;
  unlGameXp.to = to;
  if (first) { lvEl.textContent = from.level; bar.style.width = (from.frac * 100).toFixed(1) + "%"; num.textContent = "+0 XP"; $("endXpUp").classList.add("hide"); }
  var go = function () {
    if (my !== gameTicket) return;
    num.textContent = "+" + total + " XP";
    num.classList.remove("pop"); void num.offsetWidth; num.classList.add("pop");
    var steps = [];
    for (var lv = from.level; lv < to.level; lv++) steps.push(lv + 1);
    var fill = function () {
      if (my !== gameTicket) return;
      if (!steps.length) { bar.style.transition = REDUCED ? "none" : "width .7s cubic-bezier(.2,.8,.3,1)"; bar.style.width = (to.frac * 100).toFixed(1) + "%"; return; }
      var next = steps.shift();
      bar.style.transition = REDUCED ? "none" : "width .55s cubic-bezier(.3,.6,.4,1)";
      bar.style.width = "100%";
      setTimeout(function () {
        if (my !== gameTicket) return;
        lvEl.textContent = next;
        lvEl.classList.remove("up"); void lvEl.offsetWidth; lvEl.classList.add("up");
        var upEl = $("endXpUp");
        upEl.classList.add("hide"); void upEl.offsetWidth; upEl.classList.remove("hide");
        if (!beatsOn) {
          sting("levelup"); hap("success");
          if (FX) { try { Fx.sparkle(lvEl, { count: 24 }); } catch (e) {} }
        }
        pushMile("🆙", "<b>Level " + next + "!</b> " + escHtml(unlLevelGift(next)), { cls: "levelup", sting: "levelup", hap: "success", big: true });
        bar.style.transition = "none"; bar.style.width = "0%"; void bar.offsetWidth;
        setTimeout(fill, 160);
      }, REDUCED ? 0 : 600);
    };
    fill();
  };
  setTimeout(go, first ? (REDUCED ? 200 : 2600) : 100);
}
function unlLevelGift(lv) {
  var it = Unlocks.ITEMS.filter(function (x) { return x.from.level === lv; })[0];
  return it ? "Unlocked: " + it.emoji + " " + it.name + "." : "Keep going: there is more to win.";
}

/* ---- the box: dropped in, shaken, burst open ---- */
/* never sooner than already promised: a feat's experience arriving a
   moment after the game's must not open the box over the card early */
var unlRevealDue = 0;
function unlRevealSoon(ms) {
  var due = Date.now() + (REDUCED ? 300 : ms);
  if (unlRevealT && unlRevealDue > due) return;
  clearTimeout(unlRevealT);
  unlRevealDue = due;
  unlRevealT = setTimeout(function () { unlRevealT = 0; unlReveal(); }, due - Date.now());
}
/* A box is opened, never dropped on you: it would land on whatever you
   were about to tap (Rematch, a game just started). What you have won
   waits as a present, shaking, on the end card and on the lobby's
   collection button, and opens when you tap it. */
var unlAsked = false;
function unlCanReveal() { return unlAsked; }
/* the present on the end card: shaking, counted, a tap away */
function unlGiftSoon(ms) {
  var my = gameTicket;
  setTimeout(function () { if (my === gameTicket) unlGiftSync(); }, REDUCED ? 0 : ms);
}
function unlGiftSync() {
  var g = $("endGift"), n = unlQueue.length + (unlShowing ? 1 : 0);
  if (!g) return;
  g.classList.toggle("hide", !n);
  if (!n) return;
  $("endGiftTx").textContent = n > 1 ? "Open your " + n + " prizes!" : "Open your prize!";
  $("endGiftSub").textContent = unlQueue.length ? "Something new for your collection." : "";
  if (g.dataset.pop !== String(n)) {
    g.dataset.pop = String(n);
    g.classList.remove("pop"); void g.offsetWidth; g.classList.add("pop");
    hap("tick");
  }
}
function unlOpenBoxes() {
  if (!unlQueue.length || unlShowing) return;
  unlAsked = true;
  unlReveal();
}
function unlReveal() {
  if (unlShowing || !unlQueue.length) return;
  if (!unlCanReveal()) return;
  var it = unlQueue.shift();
  unlShowing = it;
  var ov = $("ovUnlock");
  ov.className = "ov ulOv";
  $("ulKick").textContent = it.kind === "title" ? "NEW TITLE!" : it.kind === "skill" ? "NEW SKILL!" : "NEW!";
  $("ulName").textContent = it.name;
  $("ulKind").textContent = Unlocks.KINDS.filter(function (k) { return k.id === it.kind; })[0].name.replace(/s$/, "").toUpperCase();
  $("ulHow").textContent = unlHowWon(it);
  $("ulCount").textContent = unlQueue.length ? "+" + unlQueue.length + " more" : "";
  $("ulIcon").innerHTML = unlIcon(it, true);
  $("ulUse").innerHTML = it.kind === "skill" ? "📘 Learn it!" : it.kind === "emote" ? "👍 Got it!" : "✨ Use it!";
  ov.classList.add("drop");
  hap("tick");
  if (prefs.sound) snd("open");
  var my = it;
  var open1 = function () {
    if (unlShowing !== my || ov.classList.contains("burst")) return;
    ov.classList.remove("drop"); ov.classList.add("burst");
    if (prefs.sound) { sting("milestone"); if (typeof Stage !== "undefined") Stage.swing(true, true); }
    hap("success");
    if (FX) { try { Fx.confetti({ ms: 1800, layer: "page" }); Fx.sparkle($("ulIcon"), { count: 30 }); } catch (e) {} }
  };
  ov.onclick = function (e) { if (!ov.classList.contains("burst")) open1(); };
  setTimeout(open1, REDUCED ? 50 : 1500);
}
function unlHowWon(it) {
  var f = it.from;
  if (f.level != null) return "For reaching level " + f.level;
  if (f.all != null) return f.all === 2 ? "For every star of every coach" : "For beating every coach on the ladder";
  var c = SKILLS[f.coach], who = c ? c.emoji + " " + c.name : f.coach;
  return "From " + who + (f.star === 0 ? ", for beating it" : f.star === 1 ? ", for beating it with no help" : ", for beating it with no help, and well");
}
function unlDone(use) {
  var it = unlShowing;
  if (!it) return;
  unlShowing = null;
  $("ovUnlock").className = "ov ulOv hide";
  if (unl.fresh[it.id]) { delete unl.fresh[it.id]; unlSave(); }
  if (use) unlUse(it);
  if (unlQueue.length) unlRevealSoon(450); else unlAsked = false;
  unlLobby(); unlGiftSync();
}
/* what equipping a thing does */
function unlUse(it) {
  var u = it.use || {};
  if (it.kind === "board" && u.home && Skins.homeOf(u.home)) { applySkin(Skins.homeOf(u.home)); toast("🎨 " + escHtml(it.name) + " is your board now.", null, 2600); }
  else if (it.kind === "pieces" && u.set) {
    var s2 = JSON.parse(JSON.stringify(skin)); s2.pieces.set = u.set; applySkin(s2);
    toast(it.emoji + " " + escHtml(it.name) + (prefs.use3d ? " on the board." : " — they show on the 3D board."), null, 2800);
  } else if (it.kind === "colors" && Unlocks.COLORS[it.id]) {
    var c = Unlocks.COLORS[it.id], s3 = JSON.parse(JSON.stringify(skin));
    s3.pieces.white = c.white; s3.pieces.black = c.black; s3.pieces.material = c.material; s3.pieces.shine = c.shine; s3.pieces.rim = c.rim;
    applySkin(s3); unl.equip.colors = it.id; unlSave();
    toast(it.emoji + " " + escHtml(it.name) + " pieces.", null, 2400);
  } else if (it.kind === "trail" || it.kind === "burst" || it.kind === "title") {
    unl.equip[it.kind] = unl.equip[it.kind] === it.id ? null : it.id; unlSave();
    toast(unl.equip[it.kind] ? it.emoji + " " + escHtml(it.name) + " on." : escHtml(it.name) + " off.", null, 2200);
    syncTagState();
  } else if (it.kind === "skill" && u.lesson) {
    var L = Learn.byId(u.lesson);
    if (L) { hideAllOverlays(); startLesson(L, []); }
  }
  if ($("ovCollect") && !$("ovCollect").classList.contains("hide")) renderCollection();
}
/* the picture of a thing, for the box and the collection */
function unlIcon(it, big) {
  var u = it.use || {};
  if (it.kind === "board" && Skins.homeOf(u.home)) return homeSwatch(Skins.homeOf(u.home), "ulSw");
  if (it.kind === "colors" && Unlocks.COLORS[it.id]) {
    var c = Unlocks.COLORS[it.id];
    return '<span class="ulCol"><b style="color:' + c.white + '">♟</b><b style="color:' + c.black + '">♟</b></span>';
  }
  if (it.kind === "pieces") return '<span class="ulGlyph ulSet">' + ({ nordic: "♜", modern: "♝", staunton: "♚" }[u.set] || "♞") + "</span>";
  if (it.kind === "emote") return '<span class="ulEm">' + u.emotes.join("") + "</span>";
  if (it.kind === "title") return '<span class="ulTitle">' + it.emoji + " " + escHtml(it.name) + "</span>";
  if (it.kind === "skill" && it.from.coach && typeof Avatar !== "undefined" && Avatar.portrait) {
    var url = null; try { url = Avatar.portrait(it.from.coach, big ? 160 : 96); } catch (e) {}
    if (url) return '<span class="ulSkill"><img alt="" src="' + url + '"><i>' + it.emoji + "</i></span>";
  }
  return '<span class="ulGlyph">' + it.emoji + "</span>";
}

/* on the ladder: what this coach still has to give you, the next one */
function unlRungPeek(id) {
  if (!unl || !unlOk()) return "";
  var it = Unlocks.ITEMS.filter(function (x) { return x.from.coach === id && !unl.owned[x.id] && x.kind !== "skill" && x.kind !== "board"; })
    .sort(function (a, b) { return a.from.star - b.from.star; })[0];
  if (!it) return '<span class="rgGift done" title="Everything this coach has to give is yours">\u2713</span>';
  return '<span class="rgGift" title="' + escHtml("Next from this coach: " + it.name + " \u2014 " + Unlocks.howTo(it)) + '">\ud83c\udf81<i>' + it.emoji + "</i></span>";
}
/* ---- the collection ---- */
var unlTab = "board";
function openCollection(tab) {
  hideAllOverlays(); closeStudio();
  if (tab) unlTab = tab;
  renderCollection();
  $("ovCollect").classList.remove("hide");
}
function renderCollection() {
  if (!unl) return;
  var lv = unlLevel(), nx = Unlocks.nextReward(unl), all = Unlocks.countOwned(unl);
  $("coLv").textContent = lv.level;
  $("coXpBar").style.width = (lv.frac * 100).toFixed(1) + "%";
  $("coXpTx").textContent = lv.into + " / " + lv.need + " XP to level " + (lv.level + 1);
  $("coNext").innerHTML = nx ? "Next: " + nx.emoji + " <b>" + escHtml(nx.name) + "</b> at level " + nx.from.level : "Every level reward is yours.";
  $("coCount").textContent = all.n + " of " + all.of + " collected";
  var tabs = $("coTabs");
  tabs.innerHTML = "";
  Unlocks.KINDS.forEach(function (k) {
    var c = Unlocks.countOwned(unl, k.id), fresh = Unlocks.ITEMS.some(function (it) { return it.kind === k.id && unl.fresh[it.id]; });
    var b = document.createElement("button");
    b.className = "coTab" + (k.id === unlTab ? " sel" : "") + (fresh ? " new" : "");
    b.innerHTML = '<span class="em">' + k.emoji + "</span><span>" + escHtml(k.name) + "</span><small>" + c.n + "/" + c.of + "</small>";
    b.addEventListener("click", function () { unlTab = k.id; renderCollection(); });
    tabs.appendChild(b);
  });
  var kind = Unlocks.KINDS.filter(function (k) { return k.id === unlTab; })[0];
  $("coKindNote").textContent = kind.note;
  var grid = $("coGrid");
  grid.innerHTML = "";
  Unlocks.ITEMS.filter(function (it) { return it.kind === unlTab; }).forEach(function (it) {
    var own = unlOwned(it.id), on = unlEquipped(it);
    var b = document.createElement("button");
    b.className = "coCard" + (own ? " own" : " locked") + (on ? " on" : "") + (unl.fresh[it.id] ? " fresh" : "");
    b.innerHTML = '<span class="coPic">' + unlIcon(it, false) + (own ? "" : '<em class="coLock" aria-hidden="true">🔒</em>') + "</span>" +
      '<b class="coName"></b><small class="coHow"></small>' + (unl.fresh[it.id] ? '<span class="coNew">NEW!</span>' : "");
    b.querySelector(".coName").textContent = own ? it.name : "???";
    b.querySelector(".coHow").textContent = own ? (it.note || unlActionWord(it, on)) : Unlocks.howTo(it);
    b.setAttribute("aria-label", own ? it.name + (on ? ", in use" : "") : "Locked: " + Unlocks.howTo(it));
    b.addEventListener("click", function () {
      if (!own) { hap("nope"); toast("🔒 " + escHtml(Unlocks.howTo(it)) + " to unlock this.", null, 2600); return; }
      if (unl.fresh[it.id]) { delete unl.fresh[it.id]; unlSave(); }
      unlUse(it);
      renderCollection(); unlLobby();
    });
    grid.appendChild(b);
  });
}
function unlEquipped(it) {
  var u = it.use || {};
  if (it.kind === "trail" || it.kind === "burst" || it.kind === "title") return unl.equip[it.kind] === it.id;
  if (it.kind === "colors") return unl.equip.colors === it.id && Unlocks.COLORS[it.id].white === skin.pieces.white;
  if (it.kind === "board") return Skins.homeOf(u.home) && Skins.homeOf(u.home).name === skin.name;
  if (it.kind === "pieces") return skin.pieces.set === u.set;
  return false;
}
function unlActionWord(it, on) {
  if (it.kind === "skill") return "Tap to learn it";
  if (it.kind === "emote") return "Send them in a game";
  return on ? "In use ✓ (tap to take off)" : "Tap to use";
}
/* the lobby: your level and how much is waiting to be seen */
function unlLobby() {
  if (!unl || !$("mCollect")) return;
  var lv = unlLevel(), all = Unlocks.countOwned(unl), fresh = Object.keys(unl.fresh).length;
  $("mLv").textContent = lv.level;
  $("mLvBar").style.width = (lv.frac * 100).toFixed(1) + "%";
  var boxes = unlQueue.length + (unlShowing ? 1 : 0);
  $("mCollectSub").textContent = boxes ? "\ud83c\udf81 " + boxes + (boxes > 1 ? " boxes" : " box") + " to open!" :
    all.n + " of " + all.of + " collected" + (fresh ? " \u00b7 " + fresh + " new" : "");
  $("mCollect").classList.toggle("fresh", fresh > 0 || boxes > 0);
  $("mCollect").classList.toggle("boxes", boxes > 0);
}

/* ---- in play: trails, bursts, and emotes ---- */
function unlMove(desc, plan, took) {
  if (!unl || !FX || !plan || !G) return;
  if (!sideIsMine(desc.piece > 0 ? 1 : -1) || mode === "lesson") return;
  var tr = unl.equip.trail && UNL_FX[unl.equip.trail], bu = unl.equip.burst && UNL_FX[unl.equip.burst];
  var ms = plan.dur * (plan.travel || 1);
  if (tr) { try { Fx.trail(desc.from, desc.to, { style: tr, ms: ms, hop: Math.abs(desc.piece) === 2 }); } catch (e) {} }
  if (bu && took) {
    var t = gameTicket;
    setTimeout(function () { if (t === gameTicket) { try { Fx.flair(desc.to, { style: bu }); } catch (e) {} } }, ms);
  }
}
/* send a face across the board, and see what the coach makes of it */
var EMOTE_REPLY = {
  "👋": ["happy", "👋"], "👍": ["happy", "♪"], "😮": ["surprised", "❗"],
  "😂": ["gleeful", "😂"], "🔥": ["shocked", "💦"], "😎": ["gleeful", "😏"],
  "🥳": ["gleeful", "✨"], "💪": ["think", "💪"], "🤔": ["think", "❓"]
};
function unlEmoteSync() {
  var btn = $("emoteBtn"); if (!btn) return;
  var have = unl ? Unlocks.emotes(unl) : [];
  btn.classList.toggle("hide", !(have.length && castWho() && G && !over));
  if (btn.classList.contains("hide")) $("emoteFan").classList.add("hide");
}
function unlEmoteOpen() {
  var fan = $("emoteFan"), have = Unlocks.emotes(unl);
  if (!fan.classList.contains("hide")) { fan.classList.add("hide"); return; }
  fan.innerHTML = "";
  have.forEach(function (e, i) {
    var b = document.createElement("button");
    b.className = "emPick"; b.textContent = e; b.style.animationDelay = (i * 35) + "ms";
    b.setAttribute("aria-label", "Send " + e);
    b.addEventListener("click", function (ev) { ev.stopPropagation(); unlSendEmote(e); });
    fan.appendChild(b);
  });
  fan.classList.remove("hide");
}
function unlSendEmote(e) {
  $("emoteFan").classList.add("hide");
  if (Date.now() - unlEmoteAt < 1200) return;
  unlEmoteAt = Date.now();
  var mine = document.createElement("span");
  mine.className = "emote mine"; mine.textContent = e;
  $("emoteBtn").parentNode.appendChild(mine);
  setTimeout(function () { mine.remove(); }, 1800);
  hap("tick");
  var rep = EMOTE_REPLY[e] || ["happy", "♪"];
  setTimeout(function () {
    if (!castWho() || !castFace) return;
    castFace.mood(rep[0], 1400); castFace.wake(1600);
    castEmote(rep[1]);
  }, 650);
}
function unlWire() {
  unlLoad();
  $("ulUse").addEventListener("click", function (ev) { ev.stopPropagation(); unlDone(true); });
  $("endGift").addEventListener("click", unlOpenBoxes);
  $("ulNext").addEventListener("click", function (ev) { ev.stopPropagation(); unlDone(false); });
  $("mCollect").addEventListener("click", function () {
    /* boxes waiting: open them, here and now */
    if (unlQueue.length && !unlShowing) { unlOpenBoxes(); return; }
    openCollection();
  });
  $("coClose").addEventListener("click", function () { $("ovCollect").classList.add("hide"); showMenu(); });
  $("emoteBtn").addEventListener("click", function (ev) { ev.stopPropagation(); unlEmoteOpen(); });
  document.addEventListener("click", function () { if ($("emoteFan")) $("emoteFan").classList.add("hide"); });
  unlLobby();
}
function unlocksForTest() {
  return {
    unlState: function () { return JSON.parse(JSON.stringify(unl)); },
    unlQueue: function () { return { queue: unlQueue.map(function (i) { return i.id; }), showing: unlShowing ? unlShowing.id : null }; },
    unlGiveXpForTest: function (n) { unlGameXp = unlGameXp || { ticket: gameTicket, parts: [], shown: 0 }; unlGain(n, false); },
    unlResetForTest: function () { unl = Unlocks.fresh(); unl.migrated = true; unlQueue = []; unlShowing = null; unlSave(); unlLobby(); },
    openCollection: openCollection
  };
}

/* ===== the journey (journey.js) =====
   The ladder as a road you travel and can finish: a map with a stop for
   each coach, a chapter card going in, CHAPTER CLEARED coming out, the
   Grove Cup at the end of the road, and an ending that says you beat the
   room. Then the completion, to a hundred. */
var jrn = null, jrnCupTicket = -1, jrnCupCoach = null, jrnEndT = 0, jrnFwT = 0;
function jrnOk() { return typeof Journey !== "undefined"; }
function jrnLoad() { if (jrnOk()) jrn = Journey.load(lsGet); }
function jrnSave() { if (jrn) Journey.save(jrn, lsSet); }
function jrnStars() { var n = 0; Rating.LEVELS.forEach(function (L) { n += starCount(L.id); }); return n; }
function jrnCompletion() {
  if (!jrnOk() || !jrn) return { pct: 0, parts: [], whole: false };
  var ls = { solved: 0, total: 1 };
  try { ls = Learn.stats(Learn.load()); } catch (e) {}
  return Journey.completion({ stars: jrnStars(), lessons: { solved: ls.solved, total: ls.total },
                              collect: unl && unlOk() ? Unlocks.countOwned(unl) : { n: 0, of: 1 }, cupWon: !!jrn.cup.won });
}
/* what the collection needs to know about the road */
function jrnExtra() { return jrn ? { cupWon: !!jrn.cup.won, completion: jrnCompletion().pct } : {}; }
function jrnName(id) { return SKILLS[id] ? SKILLS[id].emoji + " " + SKILLS[id].name : id; }
function jrnPortrait(id, px) {
  if (typeof Avatar === "undefined" || !Avatar.portrait) return "";
  try { return Avatar.portrait(id, px || 96) || ""; } catch (e) { return ""; }
}

/* ---- the lobby's road sign ---- */
function jrnLobby() {
  if (!jrn || !$("mJourney")) return;
  var r = Journey.road(ladder, jrn), c = jrnCompletion();
  var ch = r.next && Journey.chapterOf(r.next);
  $("mJourneyTx").textContent = r.at === "done" ? "You beat the Chess Room!" : r.at === "cup" ? "The Grove Cup is open!" :
    "Chapter " + ch.n + ": " + ch.title;
  $("mJourneySub").textContent = r.at === "done" ? "Completion " + c.pct + "% — can you reach a hundred?" :
    r.at === "cup" ? "Bamboo, Pine and Oak, in a row. Win it and you have beaten the room." :
    jrnName(r.next) + " is waiting. " + r.count + " of " + r.of + " chapters cleared.";
  $("mJourneyBar").style.width = (r.at === "done" ? c.pct : Math.round(r.count / (r.of + 1) * 100)) + "%";
  $("mJourneyPct").textContent = c.pct + "%";
  $("mJourney").classList.toggle("cup", r.at === "cup");
  $("mJourney").classList.toggle("done", r.at === "done");
}

/* ---- the map ---- */
function openJourney() {
  hideAllOverlays(); closeStudio();
  renderJourney();
  $("ovJourney").classList.remove("hide");
  /* the road you have travelled draws itself in, and anything newly
     cleared gets its stamp */
  var fresh = $("jrMap").querySelector(".jrNode.stamp");
  if (fresh) setTimeout(function () { fresh.scrollIntoView({ block: "center", behavior: REDUCED ? "auto" : "smooth" }); }, 120);
  else { var here = $("jrMap").querySelector(".jrNode.here"); if (here) here.scrollIntoView({ block: "center" }); }
}
function renderJourney() {
  var r = Journey.road(ladder, jrn), c = jrnCompletion(), map = $("jrMap");
  taleJourneySync();
  $("jrPct").textContent = c.pct + "%";
  $("jrPctRing").style.setProperty("--p", c.pct);
  $("jrSub").textContent = r.at === "done" ? "The road is travelled. Now: everything, to a hundred." :
    r.at === "cup" ? "Every chapter cleared. One thing left: the Grove Cup." : r.count + " of " + r.of + " chapters cleared";
  map.innerHTML = "";
  var stops = Journey.CHAPTERS.map(function (ch, i) { return { kind: "chapter", ch: ch, i: i }; });
  stops.push({ kind: "cup", i: stops.length }, { kind: "end", i: stops.length + 1 });
  var GAP = 132, TOP = 70, H = TOP * 2 + GAP * (stops.length - 1);
  map.style.height = H + "px";
  var pts = stops.map(function (s, i) { return [i % 2 ? 72 : 28, TOP + i * GAP]; });
  /* the road: gold where you have been, a dotted line where you have not */
  var reached = r.at === "done" ? stops.length - 1 : r.at === "cup" ? 8 : r.count;
  var seg = function (a, b) { var p = pts[a], q = pts[b], my = (p[1] + q[1]) / 2; return "M" + p[0] + "," + p[1] + " C" + p[0] + "," + my + " " + q[0] + "," + my + " " + q[0] + "," + q[1]; };
  var svg = '<svg class="jrRoad" viewBox="0 0 100 ' + H + '" preserveAspectRatio="none" aria-hidden="true">';
  for (var k = 0; k < pts.length - 1; k++) {
    var walked = k < reached, newly = walked && k === reached - 1 && stops[k].kind === "chapter" && !jrn.shown[stops[k].ch.id];
    svg += '<path class="' + (walked ? "walked" : "ahead") + (newly ? " draw" : "") + '" d="' + seg(k, k + 1) + '"/>';
  }
  map.innerHTML = svg + "</svg>";
  stops.forEach(function (s, i) {
    var b = document.createElement("button"), p = pts[i];
    b.className = "jrNode";
    b.style.left = p[0] + "%"; b.style.top = p[1] + "px";
    if (s.kind === "chapter") {
      var ch = s.ch, done = Journey.cleared(ladder, ch.id), open = r.open[i], here = r.next === ch.id;
      b.className += done ? " done" : open ? " open" : " locked";
      if (here) b.className += " here";
      if (done && !jrn.shown[ch.id]) { b.className += " stamp"; jrn.shown[ch.id] = 1; }
      var url = open ? jrnPortrait(ch.id, 112) : "";
      b.innerHTML = '<span class="jrPic">' + (url ? '<img alt="" src="' + url + '">' : '<em>' + (open ? SKILLS[ch.id].emoji : "🔒") + "</em>") + "</span>" +
        '<span class="jrLbl"><small>Chapter ' + ch.n + "</small><b></b></span>" +
        (open ? '<span class="jrStars">' + starsHTML(ch.id) + "</span>" : "") +
        (done ? '<span class="jrStamp">CLEARED!</span>' : "") + (here ? '<span class="jrHere">▼</span>' : "");
      b.querySelector(".jrLbl b").textContent = open ? ch.title : "???";
      b.setAttribute("aria-label", "Chapter " + ch.n + (open ? ", " + ch.title + ", " + jrnName(ch.id) + (done ? ", cleared" : "") : ", locked"));
      b.addEventListener("click", function () { if (open) openChapter(ch.id); else { hap("nope"); toast("🔒 Clear chapter " + (ch.n - 1) + " first.", null, 2000); } });
    } else if (s.kind === "cup") {
      b.className += " cup" + (r.cupWon ? " done" : r.cupOpen ? " open" : " locked") + (r.at === "cup" ? " here" : "");
      b.innerHTML = '<span class="jrPic"><em>🏆</em></span><span class="jrLbl"><small>The finale</small><b>The Grove Cup</b></span>' +
        (r.cupOpen && !r.cupWon ? '<span class="jrDots">' + Journey.CUP.map(function (c2, j) { return '<i class="' + (j < jrn.cup.run ? "on" : "") + '"></i>'; }).join("") + "</span>" : "") +
        (r.cupWon ? '<span class="jrStamp">WON!</span>' : "") + (r.at === "cup" ? '<span class="jrHere">▼</span>' : "");
      b.addEventListener("click", function () { if (r.cupOpen) openCup(); else { hap("nope"); toast("🔒 Clear all eight chapters to open the Grove Cup.", null, 2400); } });
    } else {
      b.className += " end" + (r.cupWon ? " open" : " locked");
      b.innerHTML = '<span class="jrPic"><em>' + (c.whole ? "🌰" : "🎬") + '</em></span><span class="jrLbl"><small>' +
        (r.cupWon ? "Completion " + c.pct + "%" : "The end of the road") + "</small><b>" + (r.cupWon ? "Watch the ending" : "???") + "</b></span>";
      b.addEventListener("click", function () { if (r.cupWon) showCredits(c.whole); else { hap("nope"); toast("🔒 Win the Grove Cup to reach the end.", null, 2200); } });
    }
    map.appendChild(b);
  });
  jrnSave();
  /* what is left, to a hundred */
  $("jrLeft").innerHTML = c.parts.map(function (p) {
    return '<span class="' + (p.frac >= 1 ? "full" : "") + '"><i>' + p.emoji + "</i><b>" + escHtml(p.name) + "</b><small>" + p.have + "/" + p.of + "</small><em style=\"--f:" + (p.frac * 100).toFixed(0) + '%"></em></span>';
  }).join("");
}

/* ---- a chapter card: the story going in, the stars, what it gives ---- */
function openChapter(id) {
  var ch = Journey.chapterOf(id), done = Journey.cleared(ladder, id), card = $("ovChapter");
  $("chKick").textContent = "Chapter " + ch.n;
  $("chTitle").textContent = ch.title;
  $("chWho").textContent = jrnName(id) + " · " + SKILLS[id].elo;
  $("chStory").textContent = done ? ch.outro : ch.intro;
  var who = typeof Cast !== "undefined" ? Cast.get(id) : null, rec = persRecord(id);
  /* the coach's talent card: style, talents, great at, still growing, its trick */
  $("chPersona").innerHTML = who ? talentHTML(id, { style: true, trick: "tip" }) +
    (rec.n ? '<div class="tcRec"><b>You &amp; ' + escHtml(who.name) + "</b>" + rec.w + "\u2013" + rec.l + (rec.d ? "\u2013" + rec.d : "") + "<small>" + rec.n + (rec.n > 1 ? " games" : " game") + "</small></div>" : "") : "";
  /* the card deals itself in (uimCardIn); the talents light once it has */
  talentGo($("chPersona"), 520);
  var url = jrnPortrait(id, 200);
  $("chPic").innerHTML = url ? '<img alt="" src="' + url + '">' : "<em>" + SKILLS[id].emoji + "</em>";
  card.style.setProperty("--chBg", "url(" + "data:," + ")");
  card.dataset.place = ch.place;
  var r = ladder.rungs[id], st = r ? r.stars : [0, 0, 0];
  $("chStars").innerHTML = ["Beat " + SKILLS[id].name, "Beat it with no help", "No help, and play well (80%+)"].map(function (t, i) {
    var gift = unl && unlOk() ? Unlocks.ITEMS.filter(function (x) { return x.from.coach === id && x.from.star === i; }) : [];
    return '<div class="chStar' + (st[i] ? " on" : "") + '"><i>★</i><span>' + escHtml(t) + "</span><b>" +
      gift.map(function (g) { return '<em title="' + escHtml(g.name) + '" class="' + (unlOwned(g.id) ? "own" : "") + '">' + g.emoji + "</em>"; }).join("") + "</b></div>";
  }).join("");
  taleChapterBtn(id);
  $("chPlay").innerHTML = done ? "▶ Play again" : "▶ Play";
  $("chPlay").onclick = function () { jrnPlay(id, false); };
  $("ovJourney").classList.add("hide");
  card.classList.remove("cupCard");
  card.classList.remove("hide");
  jrn.intro[id] = 1; jrnSave();
}
function openCup() {
  var card = $("ovChapter"), next = Journey.cupNext(jrn);
  $("chTale").classList.add("hide");
  $("chKick").textContent = "The finale";
  $("chTitle").textContent = "The Grove Cup";
  $("chWho").textContent = jrn.cup.won ? "Won" : "Match " + (jrn.cup.run + 1) + " of 3";
  $("chStory").textContent = jrn.cup.won
    ? "You won the Grove Cup. The coaches still talk about it."
    : "Three of the grove's best, one after another: Bamboo, Pine, and Oak. Lose or draw one and the Cup starts again from the first. Win all three and you have beaten the Chess Room.";
  $("chPic").innerHTML = "<em>🏆</em>";
  $("chStars").innerHTML = Journey.CUP.map(function (id, i) {
    var url = jrnPortrait(id, 96), won = jrn.cup.won || i < jrn.cup.run, now = !jrn.cup.won && i === jrn.cup.run;
    return '<div class="chStar cupStep' + (won ? " on" : "") + (now ? " now" : "") + '"><i>' + (won ? "✔" : i + 1) + "</i><span>" +
      escHtml(jrnName(id)) + (now ? " — next" : "") + "</span><b>" + (url ? '<img alt="" src="' + url + '">' : "") + "</b></div>";
  }).join("");
  $("chPlay").innerHTML = jrn.cup.won ? "🎬 Watch the ending" : "▶ Play " + escHtml(jrnName(next));
  $("chPlay").onclick = function () { if (jrn.cup.won) showCredits(jrnCompletion().whole); else jrnPlay(next, true); };
  $("ovJourney").classList.add("hide");
  card.classList.add("cupCard");
  card.classList.remove("hide");
}
function jrnPlay(id, cup) {
  $("ovChapter").classList.add("hide");
  if (!coachOpen(id)) { coachLocked(id); return; }
  leaveGameThen(function () {
    startCoachGame(id, "a", "none");
    jrnCupTicket = cup ? gameTicket : -1;
    jrnCupCoach = cup ? id : null;
    if (cup) toast("🏆 <b>Grove Cup</b>, match " + (jrn.cup.run + 1) + " of 3: " + escHtml(jrnName(id)), null, 3200);
  }, "a journey game");
}

/* ---- the end of a game: a chapter cleared, a cup match, the cup ---- */
function jrnAtEnd(result, rs) {
  var btn = $("endCup");
  btn.classList.add("hide"); btn.classList.remove("won");
  btn.querySelector(".em").textContent = "\ud83d\uddfa\ufe0f";
  if (!jrn || mode !== "coach") return;
  var won = (result === "white") === (humanSide === 1) && result !== "draw";
  /* the cup */
  if (jrnCupTicket === gameTicket && jrnCupCoach === skill) {
    var res = Journey.cupResult(jrn, skill, won, Date.now());
    jrnCupTicket = -1;
    jrnSave();
    if (res.won) {
      pushMile("🏆", "<b>The Grove Cup is yours!</b> You have beaten the Chess Room.", { first: true, cls: "cupwon", sting: "milestone", hap: "success", big: true });
      $("endCupTx").textContent = "You won the Grove Cup!";
      $("endCupSub").textContent = "Watch the ending ▶";
      btn.onclick = function () { showCredits(false); };
      btn.classList.add("won");
      $("endCup").querySelector(".em").textContent = "\ud83c\udfc6";
      btn.classList.remove("hide");
    } else if (res.advanced) {
      pushMile("🏆", "<b>Cup: " + res.step + " of 3 won.</b> Next: " + escHtml(jrnName(res.next)) + ".", { cls: "cup", sting: "lesson-right" });
      $("endCupTx").textContent = "Cup match " + (res.step + 1) + " of 3: " + jrnName(res.next);
      $("endCupSub").textContent = "Keep the run going ▶";
      btn.onclick = function () { $("ovEnd").classList.add("hide"); jrnPlay(res.next, true); };
      btn.classList.remove("hide");
    } else if (res.reset) {
      pushMile("🏆", "The Cup starts again: you reached match " + (res.reached + 1) + " of 3. " + escHtml(jrnName(Journey.CUP[0])) + " is first again.", { cls: "cup" });
      $("endCupTx").textContent = "Try the Grove Cup again";
      $("endCupSub").textContent = "From the first match: " + jrnName(Journey.CUP[0]) + " ▶";
      btn.onclick = function () { $("ovEnd").classList.add("hide"); jrnPlay(Journey.CUP[0], true); };
      btn.classList.remove("hide");
    }
    return;
  }
  /* a chapter cleared, the first time */
  var ch = Journey.chapterOf(skill);
  if (ch && rs && rs.s === 1 && rs.newStars.indexOf(0) >= 0) {
    var r = Journey.road(ladder, jrn), next = r.next && Journey.chapterOf(r.next);
    var hb = homeJust === skill && Skins.homeOf(skill);
    /* what the win opened: the next coach on the road, and the place
       its chapter is set in, if the road has never been there before */
    var opened = next && Journey.openedBy(next.id) === skill && !(jrn.open && jrn.open[next.id]) ? next : null;
    var newPlace = opened && Journey.PLACE_FROM[opened.place] === opened.id ? opened.place : null;
    var placeName = newPlace && Scenes.get(newPlace) ? Scenes.get(newPlace).label : "";
    pushMile("🗺️", "<b>Chapter " + ch.n + " cleared!</b> " + (hb ? escHtml(hb.name) + " is yours. " : "") +
             (opened ? "🔓 <b>" + escHtml(jrnName(opened.id)) + " unlocked</b> in " + escHtml(opened.title) + "." +
                       (newPlace ? " A new place too: the " + escHtml(placeName.toLowerCase()) + "." : "")
                     : next ? "Next on the road: " + escHtml(next.title) + "." : "The Grove Cup is open!") +
             (hb && skin.name !== hb.name ? ' <button class="chip erUse" data-home="' + escHtml(skill) + '">Use it</button>' : "") +
             (newPlace ? ' <button class="chip erUse" data-place="' + escHtml(newPlace) + '">Sit there</button>' : ""),
             { cls: "chapter unlock", sting: "levelup", hap: "success", big: !next });
    $("endCupTx").textContent = opened ? "🔓 Meet " + jrnName(opened.id) + ": chapter " + opened.n
                              : next ? "On to chapter " + next.n + ": " + next.title : "The Grove Cup is open!";
    /* straight to the next chapter's card, Play and all (Back is the map) */
    $("endCupSub").textContent = next ? "Their chapter card, and Play ▶" : "See it on the map ▶";
    btn.onclick = function () { $("ovEnd").classList.add("hide"); if (next) openChapter(next.id); else openJourney(); };
    btn.classList.remove("hide");
  }
}

/* ---- the ending ---- */
function showCredits(trueEnding) {
  hideAllOverlays(); closeStudio();
  var ov = $("ovCredits"), c = jrnCompletion();
  var games = [];
  try { games = Games.load(lsGet).list || []; } catch (e) {}
  var wins = games.filter(function (g) { return g.mode === "coach" && g.result !== "draw" && (g.result === "white") === (g.humanSide === 1); }).length;
  var sm = Rating.summary(rating), lv = unlLevel();
  $("crKick").textContent = trueEnding ? "100% — everything" : "The end of the road";
  $("crTitle").textContent = trueEnding ? "THE GOLDEN ACORN" : "YOU BEAT THE CHESS ROOM!";
  $("crTrophy").textContent = trueEnding ? "🌰" : "🏆";
  $("crCast").innerHTML = Rating.LEVELS.map(function (L, i) {
    var url = jrnPortrait(L.id, 112);
    return '<span style="--i:' + i + '">' + (url ? '<img alt="" src="' + url + '">' : "<em>" + L.emoji + "</em>") + "<b>" + escHtml(L.name) + "</b></span>";
  }).join("");
  $("crStats").innerHTML = [
    ["♟", games.length, "games played"], ["🏅", wins, "wins against the coaches"],
    ["⭐", jrnStars() + "/24", "stars"], ["📈", sm.rating, "your rating"],
    ["🎁", Unlocks.countOwned(unl).n + "/" + Unlocks.countOwned(unl).of, "collected"], ["🆙", lv.level, "your level"]
  ].map(function (r) { return "<span><i>" + r[0] + "</i><b>" + escHtml(String(r[1])) + "</b><small>" + escHtml(r[2]) + "</small></span>"; }).join("");
  $("crRoll").innerHTML = "<p class=crHead>Starring</p>" + Rating.LEVELS.map(function (L) {
    var who = typeof Cast !== "undefined" && Cast.get(L.id);
    return "<p><b>" + escHtml(L.emoji + " " + L.name) + "</b><small>" + escHtml(who ? who.title : "") + "</small></p>";
  }).join("") + "<p class=crHead>And you</p><p><b>" + escHtml(prefs.name || "The player") + "</b><small>" +
    (trueEnding ? "who did all of it" : "who beat every one of them") + "</small></p>" +
    (trueEnding ? "" : "<p class=crHead>Still to find</p><p><small>Completion " + c.pct + "%: every star, every lesson, everything in the collection. A hundred has its own ending.</small></p>") +
    "<p class=crHead>Thank you for playing</p>";
  ov.classList.remove("hide", "go"); void ov.offsetWidth; ov.classList.add("go");
  if (trueEnding) jrn.trueEnding = 1; else jrn.ending = 1;
  jrnSave();
  sting("mate-win"); hap("success");
  if (prefs.sound && typeof Stage !== "undefined") Stage.swing(true, true);
  if (FX) {
    try { Fx.confetti({ ms: 4200, layer: "page" }); } catch (e) {}
    clearInterval(jrnFwT);
    var n = 0;
    jrnFwT = setInterval(function () {
      if (ov.classList.contains("hide") || ++n > 8) { clearInterval(jrnFwT); return; }
      try { Fx.fireworks({ count: 2, layer: "page" }); } catch (e) {}
    }, 1400);
  }
}
/* ===== tales: the story of chess, told by the grove (tales.js) =====
   Each coach has a tale from the real history of the game. It opens
   after your first game against that coach, whatever the result (it is
   a story you are told for sitting down, not a prize), and it is read
   like a picture book: the coach says hello in its own voice, three
   short pages turn, and a "did you know?" closes it. The tales you have
   heard line up on a timeline, "the story of chess", reached from the
   journey map; each chapter card has its coach's tale on it. */
var tales = null, taleAt = { id: null, page: 0, back: null };
function taleSave() { if (tales && typeof Tales !== "undefined") Tales.save(tales, lsSet); }
function taleLoad() {
  if (typeof Tales === "undefined") return;
  tales = Tales.load(lsGet);
  /* games played before tales existed still count */
  var changed = false;
  Rating.LEVELS.forEach(function (Lv) {
    var r = ladder.rungs[Lv.id];
    if (r && (r.w + r.d + r.l) > 0 && Tales.open(tales, Lv.id, 1)) changed = true;
  });
  if (changed) taleSave();
}
function taleOk() { return !!tales && typeof Tales !== "undefined"; }
function taleName(id) { var c = typeof Cast !== "undefined" && Cast.get(id); return c ? c.name : (SKILLS[id] ? SKILLS[id].name : id); }
/* the storybook */
function taleOpen(id, back) {
  var t = taleOk() && Tales.get(id);
  if (!t || !Tales.has(tales, id)) return false;
  taleAt = { id: id, page: 0, back: back || null };
  var url = jrnPortrait(id, 168), c = typeof Cast !== "undefined" ? Cast.get(id) : null;
  $("taFace").innerHTML = url ? '<img alt="" src="' + url + '">' : "<em>" + (SKILLS[id] ? SKILLS[id].emoji : "📜") + "</em>";
  $("taArt").textContent = t.art;
  $("taKick").textContent = "📜 " + taleName(id) + "'s tale";
  $("taTitle").textContent = t.title;
  $("taWhen").textContent = t.when;
  hideAllOverlays();
  $("ovTale").classList.remove("hide");
  taleShow(0, 0);
  snd("open");
  return true;
}
function talePages(t) { return 2 + t.pages.length; }       /* hello, the pages, did you know */
function taleShow(p, dir) {
  var t = Tales.get(taleAt.id), n = talePages(t), id = taleAt.id, c = typeof Cast !== "undefined" ? Cast.get(id) : null;
  p = Math.max(0, Math.min(n - 1, p));
  taleAt.page = p;
  var page = $("taPage"), h;
  if (p === 0) h = '<div class="taSay"><span><b>' + escHtml(taleName(id)) + " says</b>" + escHtml(t.hello) + "</span></div>";
  else if (p === n - 1) h = '<div class="taFact"><b>💡 Did you know?</b>' + escHtml(t.fact) + "</div>";
  else h = '<p class="tap' + p + '" style="margin:0">' + escHtml(t.pages[p - 1]) + "</p>";
  page.innerHTML = h;
  page.classList.remove("turn"); page.classList.remove("back");
  if (dir && !REDUCED) { void page.offsetWidth; page.classList.add(dir > 0 ? "turn" : "back"); }
  var dots = "";
  for (var i = 0; i < n; i++) dots += '<i class="' + (i === p ? "on" : "") + '"></i>';
  $("taDots").innerHTML = dots;
  $("taPrev").disabled = p === 0;
  $("taNext").innerHTML = p === n - 1 ? "The end ✓" : p === 0 ? "Tell me ▶" : "Next ▶";
  /* the coach says hello in its own voice */
  if (p === 0 && c && prefs.chatter && dir !== -1) {
    var syl = Cast.syllables(t.hello);
    snd("babble", { hz: c.voice.hz, n: Math.min(10, syl), rate: c.voice.rate, seed: t.hello.length });
  } else if (dir) snd("tap", { hz: 880 + p * 110 });
  if (dir) hap("tick");
}
function taleNext() {
  var t = Tales.get(taleAt.id);
  if (taleAt.page < talePages(t) - 1) { taleShow(taleAt.page + 1, 1); return; }
  /* the end: read, and back to wherever it was opened from */
  Tales.markRead(tales, taleAt.id); taleSave();
  hap("star");
  taleClose();
}
function taleClose() {
  $("ovTale").classList.add("hide");
  var back = taleAt.back;
  taleAt.back = null;
  if (typeof back === "function") back(); else openTales();
}
/* the timeline: every tale in the order it happened */
function openTales() {
  if (!taleOk()) return;
  hideAllOverlays();
  var have = Tales.count(tales);
  $("tsSub").textContent = have === Tales.TALES.length ? "Every tale heard. You know the whole story!" :
    have + " of " + Tales.TALES.length + " tales heard. Play a coach to hear theirs.";
  $("tsLine").innerHTML = Tales.timeline().map(function (t) {
    var got = Tales.has(tales, t.id), nw = got && Tales.unread(tales, t.id);
    return '<button class="tsNode' + (got ? "" : " locked") + '" data-tale="' + t.id + '"><span class="tsArt" aria-hidden="true">' + (got ? t.art : "📜") +
      '</span><span><span class="tsYr">' + escHtml(t.when) + "</span><b>" + escHtml(got ? t.title : "A tale not told yet") + "</b><small>" +
      escHtml(got ? "Told by " + taleName(t.id) : "🔒 Play " + taleName(t.id) + " to hear this one") + "</small></span>" +
      (nw ? '<span class="taNew">NEW</span>' : "") + "</button>";
  }).join("");
  $("ovTales").classList.remove("hide");
}
/* the chapter card's button */
function taleChapterBtn(id) {
  var b = $("chTale"), t = taleOk() && Tales.get(id);
  if (!t) { b.classList.add("hide"); return; }
  var got = Tales.has(tales, id), nm = taleName(id);
  b.className = "chTale" + (got ? "" : " locked");
  b.innerHTML = '<span class="em" aria-hidden="true">' + (got ? "📜" : "🔒") + "</span><span>" +
    (got ? escHtml(nm) + "'s tale: " + escHtml(t.title) + "<small>" + escHtml(t.when) + " · tap to read</small>"
         : escHtml(nm) + " has a tale to tell<small>Play " + escHtml(nm) + " once, any result, to hear it</small>") + "</span>" +
    (got && Tales.unread(tales, id) ? '<span class="taNew">NEW</span>' : "");
  b.onclick = got ? function () { taleOpen(id, function () { openChapter(id); }); } : function () { hap("nope"); };
}
/* a game against a coach: its tale opens, the first time */
function taleAtEnd() {
  var b = $("endTale");
  b.classList.add("hide");
  if (!taleOk() || mode !== "coach" || !Tales.get(skill)) return;
  if (!Tales.open(tales, skill, Date.now())) return;
  taleSave();
  var t = Tales.get(skill), id = skill;
  $("endTaleTx").textContent = "New tale: " + t.title;
  $("endTaleSub").textContent = taleName(id) + " has a story for you ▶";
  b.onclick = function () { $("ovEnd").classList.add("hide"); taleOpen(id, function () { $("ovEnd").classList.remove("hide"); b.classList.add("hide"); }); };
  b.classList.remove("hide");
}
function taleJourneySync() {
  if (!taleOk() || !$("jrTalesSub")) return;
  var have = Tales.count(tales), unread = Tales.TALES.filter(function (t) { return Tales.unread(tales, t.id); }).length;
  $("jrTalesSub").textContent = have + " of " + Tales.TALES.length + " tales heard" + (unread ? " · " + unread + " new!" : "");
}
function taleWire() {
  taleLoad();
  $("taNext").addEventListener("click", taleNext);
  $("taPrev").addEventListener("click", function () { if (taleAt.page > 0) taleShow(taleAt.page - 1, -1); });
  $("taX").addEventListener("click", taleClose);
  $("jrTales").addEventListener("click", openTales);
  $("tsClose").addEventListener("click", function () { $("ovTales").classList.add("hide"); openJourney(); });
  $("tsX").addEventListener("click", function () { $("ovTales").classList.add("hide"); openJourney(); });
  $("tsLine").addEventListener("click", function (e) {
    var n = e.target.closest(".tsNode");
    if (!n) return;
    if (n.classList.contains("locked")) { hap("nope"); toast("🔒 Play " + escHtml(taleName(n.dataset.tale)) + " once to hear this tale.", null, 2200); return; }
    taleOpen(n.dataset.tale, openTales);
  });
  /* the page turns with a swipe, too */
  var sx = null;
  $("taPage").addEventListener("pointerdown", function (e) { sx = e.clientX; });
  $("taPage").addEventListener("pointerup", function (e) {
    if (sx == null) return;
    var dx = e.clientX - sx; sx = null;
    if (dx < -40) taleNext(); else if (dx > 40 && taleAt.page > 0) taleShow(taleAt.page - 1, -1);
  });
}
function taleForTest() {
  return { taleState: function () { return { st: tales ? JSON.parse(JSON.stringify(tales)) : null, at: { id: taleAt.id, page: taleAt.page } }; },
           taleOpen: taleOpen, openTales: openTales, taleReload: taleLoad };
}
function jrnWire() {
  jrnLoad();
  $("mJourney").addEventListener("click", openJourney);
  $("jrClose").addEventListener("click", function () { $("ovJourney").classList.add("hide"); showMenu(); });
  $("chBack").addEventListener("click", function () { $("ovChapter").classList.add("hide"); openJourney(); });
  $("chX").addEventListener("click", function () { $("ovChapter").classList.add("hide"); openJourney(); });
  $("crDone").addEventListener("click", function () { clearInterval(jrnFwT); $("ovCredits").classList.add("hide"); openJourney(); });
  jrnLobby();
}
function journeyForTest() {
  return {
    jrnState: function () { return { st: JSON.parse(JSON.stringify(jrn)), road: Journey.road(ladder, jrn), completion: jrnCompletion() }; },
    openJourney: openJourney, openChapter: openChapter, openCup: openCup, jrnPlay: jrnPlay, showCredits: showCredits,
    reloadLadderForTest: function () { ladder = loadLadder(); placeGuard(); jrnLobby(); }
  };
}

/* ===== the personas (cast.js) =====
   Each coach is a player with a style you can feel across the board (its
   taste among the moves it thinks good enough: Acorn reaches for its
   knights, Cactus for checks and captures, Fern castles and defends,
   Clover plays whatever feels lucky), a habit it can't help (a bounce, a
   wave, a twirl, a bow, a nod), and a signature trick — the one its
   skill card teaches. When it plays the trick on you, the room names it;
   when you play it back at the coach, the room makes a fuss of you. And
   it remembers you: how many games you have played it, and what the
   other coaches have been saying. */
var persSigAt = 0, persStole = -1, persIdleT = 0;
/* ===== setting up the board (setup.js) =====
   The first lesson there is: which piece is which, and where it starts.
   Your pieces are handed to you one kind at a time, each named with a
   line on how it moves; you put them down, each flies from your hand to
   its square and lands with a sparkle, and Black then sets up across the
   board by itself. From memory (the Academy) it is the same with no
   words, no glow, a clock and a best time. */
var setupSt = null, setupT0 = 0, setupThen = null, setupBusy = false, setupClockT = 0;
var setupRec = typeof Setup !== "undefined" ? Setup.load(lsGet) : null;
function startSetup(o) {
  o = o || {};
  stopTour();
  quietBoard();
  hideAllOverlays();
  closeStudio();
  lesson = null; lessonQueue = []; over = null; thinking = false;
  mode = "setup";
  G = Chess.create();
  clockConfig("none");
  clearSel(); viewPly = -1;
  setupSt = Setup.begin({ memory: !!o.memory });
  setupThen = o.then || null; setupBusy = false;
  orientation = 1;
  R.setOrientation(1);
  tableSync();
  R.setPosition(Setup.board(setupSt, false));
  hideOpeningCard();
  showViewBanner(false);
  syncAll();
  setupT0 = Date.now();
  setupShow();
  clearInterval(setupClockT);
  if (setupSt.memory) setupClockT = setInterval(function () {
    var c = $("suClock");
    if (!setupSt || mode !== "setup" || setupSt.done || !c) { clearInterval(setupClockT); return; }
    c.textContent = Setup.fmt(Date.now() - setupT0);
  }, 100);
  needFrame();
}
function setupGentle() { return paceRead().pace === "gentle"; }
function setupDots() {
  return '<span class="suDots" aria-hidden="true">' + Setup.STEPS.map(function (s, i) {
    return '<i class="' + (i < setupSt.at ? "on" : i === setupSt.at ? "now" : "") + '">' + GLYPH[s.kind] + "</i>";
  }).join("") + "</span>";
}
function setupShow(say) {
  var s = Setup.step(setupSt);
  if (!s) return;
  var left = Setup.targets(setupSt).length, mem = setupSt.memory;
  var title = s.squares.length > 1 && !s.group ? "Your " + s.plural.toLowerCase() : s.group ? "Your pawns" : "Your " + s.name.toLowerCase();
  lessonUI('<div class="suCard"><span class="suPiece" id="suPiece">' + GLYPH[s.kind] + "</span>" +
    '<div class="suTx"><b>' + (mem ? escHtml(s.plural) : s.emoji + " " + escHtml(title)) + "</b>" +
    (mem ? '<small>Where do they go? <span class="suClock">⏱ <span id="suClock">' + Setup.fmt(Date.now() - setupT0) + "</span></span></small>"
         : "<small>" + escHtml(s.is) + "</small>") +
    (mem && !say ? "" : '<em id="suSay">' + escHtml(say || s.where) + (left > 1 && !s.group && !say ? " (" + left + " to place)" : "") + "</em>") +
    "</div>" + (mem ? "" : '<button class="suSkip" id="suSkip">Skip ›</button>') + "</div>" + setupDots(), "setup");
  var sk = $("suSkip");
  if (sk) sk.addEventListener("click", setupSkip);
  setupGlow();
}
/* not everyone wants the walk-through: on to wherever it was leading */
function setupSkip() {
  var then = setupThen;
  setupEnd();
  if (then === "rules") showLearn(0);
  else if (then === "academy") openAcademy();
  else showMenu();
}
function setupGlow(force) {
  if (!R || !setupSt) return;
  var on = force || Setup.glow(setupSt, setupGentle());
  R.setHighlights({ selected: -1, legal: on && !setupSt.done ? Setup.targets(setupSt) : [], legalCapt: [], last: null, check: -1 });
  needFrame();
}
/* Help, in a set-up: where this piece goes. From memory it costs what a
   miss costs */
function setupHint() {
  if (!setupSt || setupSt.done) return;
  var s = Setup.step(setupSt);
  if (setupSt.memory) setupSt.misses++;
  setupShow(s.where + (setupSt.memory ? " (+3 s)" : ""));
  setupGlow(true);
}
function setupTap(sq) {
  if (!setupSt || setupSt.done || setupBusy) return;
  var res = Setup.place(setupSt, sq);
  if (!res.ok) {
    hap("nope");
    var bar = $("lessonBar");
    bar.classList.remove("suNope"); void bar.offsetWidth; bar.classList.add("suNope");
    setupShow(res.why);
    return;
  }
  setupBusy = true;
  hap("select");
  var mine = setupSt;
  setupFly(res.sq, res.piece, function () {
    if (setupSt !== mine || mode !== "setup") return;
    var b = Setup.board(setupSt, false);
    res.rest.forEach(function (q) { b[q] = 0; });
    R.setPosition(b.slice ? b.slice() : b);
    hap("land");
    snd("tap", { hz: 520 + res.piece * 60 });
    if (FX) { try { Fx.flair(res.sq, { style: "stars" }); } catch (e) {} }
    needFrame();
    /* the rest of a group marches in, one after another */
    var i = 0;
    (function march() {
      if (setupSt !== mine || mode !== "setup") return;
      if (i < res.rest.length) {
        b[res.rest[i]] = res.piece; i++;
        R.setPosition(b.slice ? b.slice() : b);
        snd("tap", { hz: 600 + i * 40 });
        needFrame();
        setTimeout(march, REDUCED ? 0 : 90);
        return;
      }
      setupBusy = false;
      if (res.finished) setupBlack();
      else if (res.stepDone) { sting("lesson-right"); setupShow(); }
      else setupShow();
    })();
  });
}
/* the piece leaves your hand (the card) and lands on its square */
function setupFly(sq, piece, done) {
  var from = $("suPiece"), stage = $("stage"), to = R.squareToScreen ? R.squareToScreen(sq, 0.3) : null;
  if (!from || !to || REDUCED || typeof Element === "undefined" || !Element.prototype.animate) { done(); return; }
  var sr = stage.getBoundingClientRect(), fr = from.getBoundingClientRect(), cr = $(R === R3 ? "cv3" : "cv2").getBoundingClientRect();
  var fx = fr.left + fr.width / 2 - sr.left, fy = fr.top + fr.height / 2 - sr.top;
  var tx = to.x + cr.left - sr.left, ty = to.y + cr.top - sr.top;
  var el = document.createElement("div");
  el.className = "suFly";
  el.textContent = GLYPH[piece];
  el.style.left = fx + "px"; el.style.top = fy + "px";
  el.style.fontSize = Math.max(28, Math.round((to.s || 40) * 0.95)) + "px";
  stage.appendChild(el);
  from.classList.add("gone");
  var dx = tx - fx, dy = ty - fy;
  var a = el.animate([
    { transform: "translate(-50%,-50%) translate(0px,0px) scale(1.35) rotate(-8deg)", opacity: 1 },
    { transform: "translate(-50%,-50%) translate(" + dx * 0.55 + "px," + (dy * 0.55 - 70) + "px) scale(1.2) rotate(6deg)", opacity: 1, offset: 0.55 },
    { transform: "translate(-50%,-50%) translate(" + dx + "px," + dy + "px) scale(1) rotate(0deg)", opacity: 1 }
  ], { duration: 560, easing: "cubic-bezier(.3,.7,.35,1)" });
  var fin = false, end = function () { if (fin) return; fin = true; el.remove(); done(); };
  a.onfinish = end;
  setTimeout(end, 900);
}
/* Black sets up across the board, the same way, by itself */
function setupBlack() {
  setupSt.mirrored = true;
  lessonUI('<div class="suCard"><span class="suPiece">' + GLYPHB[6] + '</span><div class="suTx"><b>Black sets up the same way</b>' +
    "<small>Every piece straight across the board from yours, and the black queen on her own colour: the dark square.</small></div></div>" + setupDots(), "setup");
  var list = Setup.mirror(), b = Setup.board(setupSt, false), i = 0, mine = setupSt;
  setupGlow();
  (function next() {
    if (setupSt !== mine || mode !== "setup") return;
    if (i >= list.length) { setTimeout(function () { if (setupSt === mine && mode === "setup") setupDone(); }, REDUCED ? 0 : 350); return; }
    b[list[i][0]] = list[i][1]; i++;
    R.setPosition(b.slice ? b.slice() : b);
    if (i % 2) snd("tap", { hz: 420 + i * 14 });
    needFrame();
    setTimeout(next, REDUCED ? 0 : 60);
  })();
}
function setupDone() {
  var st = setupSt, ms = Date.now() - setupT0, out = Setup.finish(setupRec, st, ms);
  Setup.save(setupRec, lsSet);
  clearInterval(setupClockT);
  sting(st.memory && out.best ? "levelup" : "lesson-done");
  hap("success");
  if (FX) { try { Fx.confetti({ ms: 2400, layer: "page" }); } catch (e) {} }
  var html;
  if (st.memory) {
    html = '<div class="suCard done"><span class="suPiece">⏱</span><div class="suTx"><b>' + Setup.fmt(out.score) + (out.best ? " — a new best!" : "") + "</b>" +
      "<small>" + (st.misses ? st.misses + (st.misses > 1 ? " misses" : " miss") + " (3 s each)" : "Not a single miss") + " · your best " + Setup.fmt(out.record) + "</small></div></div>" +
      '<div class="suBtns"><button class="chip sel" id="suAgain">⏱ Again</button><button class="chip" id="suPlay">▶ Play a game</button><button class="chip" id="suBack">Back</button></div>';
  } else {
    html = '<div class="suCard done"><span class="suPiece">' + GLYPH[6] + "</span><div class=\"suTx\"><b>That's how every game of chess begins!</b>" +
      "<small>Rooks in the corners, then knights, bishops, the queen on her own colour, the king, and a wall of pawns. Now you know who's who.</small></div></div>" +
      '<div class="suBtns">' + (setupThen === "rules" ? '<button class="chip sel" id="suRules">🐣 How they move →</button>' : "") +
      '<button class="chip' + (setupThen === "rules" ? "" : " sel") + '" id="suPlay">▶ Play a game</button><button class="chip" id="suAgain">⏱ From memory</button></div>';
  }
  lessonUI(html, "setup done");
  var on = function (id, fn) { var b = $(id); if (b) b.addEventListener("click", fn); };
  on("suRules", function () { setupEnd(); showLearn(0); });
  on("suPlay", function () { setupEnd(); quickPlay(nextLevel()); });
  on("suAgain", function () { startSetup({ memory: true, then: setupThen }); });
  on("suBack", function () { setupEnd(); openAcademy(); });
}
function setupEnd() {
  clearInterval(setupClockT);
  setupSt = null;
  $("lessonBar").classList.add("hide");
  document.body.classList.remove("lesson-on");
  reflow();
}
function setupAcademySync() {
  var b = $("aSetupSub");
  if (!b || !setupRec) return;
  b.textContent = !setupRec.learned && !setupRec.tries ? "Which piece is which, and where it lives. Then race the clock."
    : "From memory, against the clock." + (setupRec.best ? " Your best: " + Setup.fmt(setupRec.best) + "." : "");
}
function setupForTest() {
  return { setupState: function () { return setupSt ? JSON.parse(JSON.stringify(setupSt)) : null; },
           setupRecord: function () { return JSON.parse(JSON.stringify(setupRec)); },
           startSetup: startSetup, setupTap: setupTap, setupBusy: function () { return setupBusy; } };
}

/* ===== the room's motion: how cards, words and games arrive =====
   The board already moves like a thing with weight (motion.js, the
   renderers); this is the same care for everything around it. One rule,
   kept in one place, so every card in the room arrives the same way:
   - the room dims in, and the card springs up into place with a little
     overshoot, the way a real card is put down on a table;
   - its contents follow one after another on a beat, so the eye reads
     them in order rather than all at once (the beat follows the pace:
     slower for a gentle player, quicker for a brisk one);
   - the lobby's ladder deals its coaches in one by one;
   - a game started with a tap opens from that tap, an iris out of the
     lobby onto the new board, while the game itself is already there
     underneath (nothing waits on the animation; a tap goes through it).
   All of it is Web Animations on top of the styles, so nothing here can
   leave a card stuck half-shown, and none of it runs with reduced motion. */
var uimTap = null;
var UIM_SKIP = { ovCredits: 1, ovUnlock: 1, ovPromo: 1, ovBeat: 1 };   /* these have entrances of their own */
function uimOn() { return !REDUCED && typeof Element !== "undefined" && !!Element.prototype.animate; }
function uimRun(el, frames, o) { if (!el || !uimOn()) return null; try { return el.animate(frames, o); } catch (e) { return null; } }
function uimBeat() { return Math.round(46 * Math.max(0.55, Math.min(1.3, paceDial().card))); }
function uimShown(el) { return el && el.offsetParent !== null && getComputedStyle(el).display !== "none"; }
function uimCardIn(ov) {
  if (!uimOn() || UIM_SKIP[ov.id]) return;
  var card = ov.firstElementChild;
  if (!card) return;
  var beat = uimBeat();
  uimRun(ov, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
  uimRun(card, [
    { transform: "translateY(22px) scale(.93)", opacity: 0 },
    { transform: "translateY(-4px) scale(1.015)", opacity: 1, offset: 0.6 },
    { transform: "translateY(1px) scale(.998)", offset: 0.82 },
    { transform: "none", opacity: 1 }
  ], { duration: 460, easing: "cubic-bezier(.25,.8,.3,1)" });
  var kids = Array.prototype.filter.call(card.children, uimShown).slice(0, 16);
  kids.forEach(function (k, i) {
    uimRun(k, [{ transform: "translateY(12px)", opacity: 0 }, { transform: "none", opacity: 1 }],
           { duration: 340, delay: 90 + i * beat, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
  });
  /* the lobby deals its coaches */
  if (ov.id === "ovMenu") {
    Array.prototype.forEach.call(document.querySelectorAll("#mLadder .rung"), function (r, i) {
      uimRun(r, [{ transform: "translateY(16px) rotate(-3deg) scale(.86)", opacity: 0 },
                 { transform: "translateY(-3px) rotate(1deg) scale(1.03)", opacity: 1, offset: 0.65 },
                 { transform: "none", opacity: 1 }],
             { duration: 420, delay: 160 + i * Math.round(beat * 0.8), easing: "cubic-bezier(.25,.8,.3,1)", fill: "backwards" });
    });
  }
}
/* a game, opening out of the tap that started it */
function uimIris(x, y) {
  if (!uimOn()) return;
  var w = window.innerWidth, h = window.innerHeight;
  var far = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
  var el = document.createElement("div");
  el.className = "uimIris";
  el.style.left = x + "px"; el.style.top = y + "px";
  document.body.appendChild(el);
  var gone = false, done = function () { if (!gone) { gone = true; el.remove(); } };
  var a = uimRun(el, [{ width: "36px", height: "36px", opacity: 1 }, { width: far * 2 + 60 + "px", height: far * 2 + 60 + "px", opacity: 1, offset: 0.86 },
                      { width: far * 2 + 120 + "px", height: far * 2 + 120 + "px", opacity: 0 }],
                 { duration: 640, easing: "cubic-bezier(.6,.04,.3,1)" });
  if (a) a.onfinish = done; else done();
  setTimeout(done, 1200);
}
function uimGameStarted(fresh) {
  var t = uimTap;
  uimTap = null;
  /* the tap that started it: the first tap of a visit also wakes the
     sound, which can hold the page a moment, so the window is generous */
  if (fresh && t && Date.now() - t.t < 5000) uimIris(t.x, t.y);
}
function uimWire() {
  document.addEventListener("pointerdown", function (e) { uimTap = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
  if (typeof MutationObserver === "undefined") return;
  var mo = new MutationObserver(function (list) {
    list.forEach(function (m) {
      var el = m.target;
      if (!el.classList.contains("hide") && /(^|\s)hide(\s|$)/.test(m.oldValue || "")) uimCardIn(el);
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll(".ov"), function (ov) {
    mo.observe(ov, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
  });
}
function uimForTest() {
  return { uimOn: uimOn, uimBeat: uimBeat, uimIris: uimIris,
           running: function (sel) { var el = document.querySelector(sel); return el && el.getAnimations ? el.getAnimations().length : 0; } };
}

/* ===== the table: two people, one device =====
   A phone or a tablet flat on the table between two people. Neither of
   them is "the player" the rest of the room is built round, so here:
   - one tap from the lobby sits you down (the clock you chose last time,
     and the seating you chose: clock and seating are a link underneath);
   - across the table (the default), the board stays put and the far bar
     is turned to face its player: name, clock, what they have taken, and
     "Your move" on whichever bar is to move. On the flat board their
     men are drawn the right way up for them; the 3D camera stands right
     over the middle, so it is the same picture from both sides;
   - the moves and notes panel steps aside for the board, and the quiet
     coach keeps its remarks in the notebook rather than in a toast that
     would face one of them;
   - and at the end each seat is told, the right way up, with a button
     on each side to play again (seats stay, colours swap).
   Passing the device back and forth (the other seating) is the old way:
   the board turns to whoever moves, and the room talks as usual. */
function tableFacing() { return mode === "pass" && !prefs.autoFlip; }
function tableSync() {
  var on = mode === "pass", face = tableFacing();
  document.body.classList.toggle("table", on);
  document.body.classList.toggle("facing", face);
  if (R2 && R2.setFaceToFace) R2.setFaceToFace(face ? -orientation : 0);
  if (R3 && R3.setOverhead) R3.setOverhead(face);
  if (!face) $("tableSay").classList.add("hide");
  reflow();
}
function tableBegin() {
  var clk = (prefs.lastClock && prefs.lastClock.pass) || "none";
  leaveGameThen(function () { startGame("pass", { clockStr: clkOk(clk) ? clk : "none", fresh: true }); tableHello(); });
}
/* who sits where, said to both, the right way up, as the game begins */
var tableSayT = 0;
function tableHello() {
  if (!tableFacing()) return;
  var top = -orientation, bot = orientation;
  tableSay(sideName(top) + ", you're on this side" + (top === 1 ? ": you start." : "."),
           sideName(bot) + ", you're on this side" + (bot === 1 ? ": you start." : "."), 3600);
}
function tableSay(topTx, botTx, ms, html) {
  var el = $("tableSay");
  $("tsTop")[html ? "innerHTML" : "textContent"] = topTx; $("tsBot")[html ? "innerHTML" : "textContent"] = botTx;
  $("tsTop").parentNode.classList.toggle("hide", !topTx);
  $("tsBot").parentNode.classList.toggle("hide", !botTx);
  el.classList.remove("hide");
  clearTimeout(tableSayT);
  tableSayT = setTimeout(function () { el.classList.add("hide"); }, ms || 3000);
}
function tableEnd(result, reason) {
  var top = -orientation, bot = orientation;
  function says(side) {
    if (result === "draw") return ["🤝 A draw!", cap(reason) + "."];
    var won = (result === "white") === (side === 1);
    return won ? ["🎉 You won!", cap(reason) + "."] : ["🌱 Good game", sideName(-side) + " won — " + reason + "."];
  }
  var t = says(top), b = says(bot);
  $("teTopTx").textContent = t[0]; $("teTopSub").textContent = t[1];
  $("teBotTx").textContent = b[0]; $("teBotSub").textContent = b[1];
  $("tableEnd").classList.remove("hide");
  $("tableSay").classList.add("hide");
  /* and it takes focus, as the end card does: a keyboard or a screen
     reader lands on the near seat's Play again */
  var again = document.querySelector("#tableEnd .teHalf.bot .teAgain");
  if (again) { try { again.focus({ preventScroll: true }); } catch (e) { again.focus(); } }
  syncTurnStrip();
  if (FX && result !== "draw") { Fx.confetti({ ms: 2400, layer: "page" }); Fx.fireworks({ count: 2, layer: "page" }); }
}
function tableAgain() {
  $("tableEnd").classList.add("hide");
  /* the same seats, the colours swapped: the board turns to the new White */
  var turn = -orientation, clk = clockStrOf();
  startGame("pass", { clockStr: clk, fresh: true, orientation: turn });
  tableHello();
}
function tableWire() {
  Array.prototype.forEach.call(document.querySelectorAll("#tableEnd .teAgain"), function (b) { b.addEventListener("click", tableAgain); });
  $("teLook").addEventListener("click", function () { $("tableEnd").classList.add("hide"); $("ovEnd").classList.remove("hide"); syncTurnStrip(); });
  $("teMenu").addEventListener("click", function () { $("tableEnd").classList.add("hide"); showMenu(); });
  $("tableSay").addEventListener("click", function () { this.classList.add("hide"); });
}
function tableForTest() {
  return { tableFacing: tableFacing, tableBegin: tableBegin, tableAgain: tableAgain,
           face2d: function () { return R2 ? R2.face : null; }, get orientation() { return orientation; } };
}

/* ===== the room's pace: gentle, steady or brisk (pace.js) =====
   How long the coach waits before it answers, how long words stay up,
   how long the end card takes, whether to offer a hand to someone who
   has been thinking a while, when to offer a friendly game, and whether
   a superb win opens the road ahead. Read from how you play; pinned in
   Settings if you prefer. */
var pace = typeof Pace !== "undefined" ? Pace.load(lsGet) : null;
var paceTurn = null;          /* { at, hid, ticket } while it is your move against the computer */
var paceNudgeT = 0, paceNudged = 0, paceNudgeMs = 0;    /* paceNudgeMs: a test's shortcut */
var friendly = false;         /* this coach game is a friendly one: easy, and never rated */
var paceCardT = -1;           /* the game whose end card has been tapped past already */
var PACE_STILL = { pace: "steady", auto: "steady", mode: "auto", think: null, tempo: null, why: [] };
function paceSave() { if (pace) Pace.save(pace, lsSet); }
function paceRead() { return pace ? Pace.read(pace) : PACE_STILL; }
function paceDial() { return typeof Pace !== "undefined" ? Pace.dials(paceRead().pace) : { reply: 500, words: 1, card: 1, nudge: null, friendlyAfter: 3, fastTrack: true }; }
function paceWords(ms) { return Math.round(ms * paceDial().words); }
function paceCardMs(ms) { return Math.round(ms * paceDial().card); }

/* your turn against the computer: how long you look before you move is
   the one honest measure of the pace you like. Time the page spends
   hidden is not thinking, so that turn is not counted at all */
function paceTurnStart() {
  paceTurnEnd(false);
  if (!pace || mode !== "coach" || over || !G || G.turn !== humanSide) return;
  paceTurn = { at: Date.now(), hid: !!document.hidden, ticket: gameTicket };
  paceArmNudge();
}
function paceTurnEnd(played) {
  clearTimeout(paceNudgeT);
  var t = paceTurn;
  paceTurn = null;
  if (!played || !t || !pace || t.ticket !== gameTicket || t.hid) return;
  if (Pace.think(pace, Date.now() - t.at)) paceSave();
}
function paceNudgesAllowed() { return paceRead().pace === "gentle" ? 2 : 1; }
function paceArmNudge() {
  clearTimeout(paceNudgeT);
  var natural = Pace.nudgeAfter(paceRead()), wait = paceNudgeMs || natural;
  /* never with a clock (a hand on the shoulder while time runs is
     pressure), and never for a brisk player, who has not asked for one */
  if (!natural || clock.on || paceNudged >= paceNudgesAllowed()) return;
  paceNudgeT = setTimeout(paceNudge, paceNudged ? wait * 2 : wait);
}
/* someone has been looking at the board for a good while: no hurry,
   says the coach, and here is a clue if you'd like one */
function paceNudge() {
  var t = paceTurn;
  if (!t || t.ticket !== gameTicket || over || mode !== "coach" || !G || G.turn !== humanSide || thinking) return;
  /* not over anything: a card, a question, a page that is away */
  if (document.hidden || document.querySelector(".ov:not(.hide)") || studioOpen ||
      ($("toast").classList.contains("show") && $("toast").classList.contains("acts"))) { paceNudgeT = setTimeout(paceNudge, 8000); return; }
  paceNudged++;
  castSay("patient", "happy");
  toast("🌱 <b>Take your time.</b> There's no clock, and thinking is how it's learned. Would a clue help?",
    [{ label: "🧭 A clue", fn: function () { thinkPrompt(); } },
     { label: "I'm fine", ghost: true, fn: function () {} }], paceWords(14000));
  paceArmNudge();
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", function () { if (document.hidden && paceTurn) paceTurn.hid = true; });

/* the end of a coach game: what it says about the pace, a friendly game
   for someone who keeps losing to one coach, and the road a friendly win
   opens */
function paceAtEnd(result, rs) {
  var fb = $("endFriendly");
  if (fb) fb.classList.add("hide");
  if (!pace || mode !== "coach" || !G) return;
  var won = result !== "draw" && (result === "white") === (humanSide === 1), lost = result !== "draw" && !won;
  var helped = !!(assist.takebacks || assist.hints || assist.wheels);
  Pace.game(pace, { coach: skill, won: won, lost: lost, helped: helped, plies: G.played.length, friendly: friendly });
  Pace.card(pace, false);
  paceSave();
  if (friendly) {
    $("endRematchTx").textContent = "Play for real";
    $("endRematchSub").textContent = "The same coach, at full strength, rated — you'll have " + (humanSide === 1 ? "Black" : "White") + ".";
    if (won) {
      var nx = Journey.after(skill, 1), opened = nx ? Journey.openAhead(ladder, jrn, nx) : null;
      if (opened) {
        jrnSave();
        var place = Object.keys(Journey.PLACE_FROM).filter(function (k) { return Journey.PLACE_FROM[k] === opened; })[0];
        pushMile("🤝", "<b>A friendly win!</b> 🔓 " + escHtml(jrnName(opened)) + " is open now." +
                 (place ? " A new place too: the " + escHtml(Scenes.get(place).label.toLowerCase()) + "." : "") +
                 " Beat " + escHtml(SKILLS[skill].name) + " in a real game to clear the chapter.",
                 { cls: "unlock", sting: "levelup", hap: "success" });
      } else pushMile("🤝", "<b>A friendly win!</b> Ready for a real one?", { cls: "unlock" });
    }
    return;
  }
  /* a run of losses to one coach: a friendly game, offered, never forced */
  if (lost && fb && coachOpen(skill) && Pace.friendlyDue(pace, paceRead(), skill)) {
    var L = SKILLS[skill];
    $("endFriendlyTx").textContent = "A friendly game with " + L.name;
    $("endFriendlySub").textContent = L.name + " goes easy and nothing's rated. Win it and the road opens ▶";
    fb.onclick = function () { $("ovEnd").classList.add("hide"); paceFriendly(skill); };
    fb.classList.remove("hide");
  }
}
function paceFriendly(id) {
  if (!coachOpen(id)) { coachLocked(id); return; }
  leaveGameThen(function () { startCoachGame(id, "a", "none", { friendly: true }); }, "a friendly game");
}
/* a win good enough for the third star: for anyone not taking it
   gently, the road two coaches ahead opens too */
function paceFastTrack(level, acc) {
  if (!pace || friendly || !Pace.fastTrack(paceRead(), { won: true, helped: false, acc: acc })) return;
  var two = Journey.after(level, 2);
  if (!two || !coachOpen(Journey.after(level, 1))) return;
  var opened = Journey.openAhead(ladder, jrn, two);
  if (!opened) return;
  jrnSave();
  var line = "<b>Fast track!</b> You played so well that " + escHtml(jrnName(opened)) + " is open too.";
  if (!pushMile("⚡", line, { cls: "unlock", sting: "levelup", hap: "success" })) toast("⚡ " + line, null, paceWords(5000));
}
/* a tap on the end card while it is still celebrating: hurry it along */
function paceCardTap(e) {
  if (!over || !milesPending()) return;
  if (e && e.target && e.target.closest && e.target.closest("button, a, input")) return;
  milesFlush(false);
  if (pace && paceCardT !== gameTicket && mode === "coach") { paceCardT = gameTicket; Pace.skip(pace); paceSave(); }
}

/* Settings: Auto, or pinned */
var PACE_SAYS = {
  gentle: "The coach pauses before it answers, words stay up longer, and if you've been thinking a while it offers a clue. Never a clock.",
  steady: "The room's usual pace. A win good enough for the third star also opens the road two coaches ahead.",
  brisk: "The coach answers at once, the end card gets out of the way, and a third-star win opens the road two coaches ahead."
};
function paceSync() {
  var r = paceRead();
  ["auto", "gentle", "steady", "brisk"].forEach(function (m) {
    var b = $("pa" + m.charAt(0).toUpperCase() + m.slice(1));
    if (b) b.classList.toggle("sel", r.mode === m);
  });
  var note = $("setPaceNote");
  if (note) note.innerHTML = (r.mode === "auto"
    ? "Auto: reading you as <b>" + cap(r.pace) + "</b>" + (r.why.length ? ", because " + escHtml(r.why.join(" and ")) : " until it has seen you play") + ". "
    : "") + escHtml(PACE_SAYS[r.pace]);
}
function paceWire() {
  ["auto", "gentle", "steady", "brisk"].forEach(function (m) {
    var b = $("pa" + m.charAt(0).toUpperCase() + m.slice(1));
    if (b) b.addEventListener("click", function () { if (!pace) return; Pace.setMode(pace, m); paceSave(); paceSync(); });
  });
  $("ovEnd").addEventListener("click", paceCardTap);
  paceSync();
}
function paceForTest() {
  return {
    paceState: function () { return JSON.parse(JSON.stringify(pace)); },
    paceRead: paceRead, paceDial: paceDial,
    paceSet: function (st) { pace = Pace.clean(st); paceSave(); paceSync(); },
    setNudgeMs: function (ms) { paceNudgeMs = ms; if (paceTurn) paceArmNudge(); },
    friendly: function () { return friendly; }, paceFriendly: paceFriendly,
    coachSearchOpts: function () { return persSearchOpts(); },
    paceFastTrackForTest: paceFastTrack, syncSettingsUI: syncSettingsUI
  };
}

function persSearchOpts() {
  var o = Rating.searchOpts(skill), who = castWho();
  if (friendly && typeof Pace !== "undefined") o = Pace.easy(o);
  if (who && who.style && who.style.w) {
    var c = {}, k;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k];
    c.style = who.style.w;
    return c;
  }
  return o;
}
/* does this move show the coach's trick? concepts: what teach.js saw */
function persSigHit(sig, m, concepts, after) {
  if (!sig || !m) return false;
  var kind = Math.abs(m.piece);
  var con = (concepts || []).map(function (l) { return l.concept; });
  if (sig.concepts && sig.concepts.some(function (c) { return con.indexOf(c) >= 0; }) && (!sig.piece || sig.piece === kind)) return true;
  if (sig.piece && sig.capture && kind === sig.piece && m.capt) return true;
  if (sig.free && m.capt && after && !Chess.attacked(after, m.to, m.piece > 0 ? -1 : 1)) return true;
  if (sig.castle && (m.flags & Chess.F_CASTLE)) return true;
  if (sig.promo && m.promo) return true;
  if (sig.check && m.capt && after && Chess.inCheck(after)) return true;
  return false;
}
/* games played against this coach, from the journal */
function persRecord(id) {
  var r = { n: 0, w: 0, l: 0, d: 0 };
  try {
    (Games.load(lsGet).list || []).forEach(function (g) {
      if (g.mode !== "coach" || g.skill !== id) return;
      r.n++;
      if (g.result === "draw") r.d++;
      else if ((g.result === "white") === (g.humanSide === 1)) r.w++; else r.l++;
    });
  } catch (e) {}
  return r;
}
/* after every move of a coach game */
function persAfterMove(m, concepts) {
  var who = castWho();
  if (!who || !who.signature || over) return;
  var coachSide = -humanSide, byCoach = m.piece * coachSide > 0;
  if (!persSigHit(who.signature, m, concepts, G)) return;
  var t = gameTicket, sig = who.signature;
  setTimeout(function () {
    if (t !== gameTicket || !castWho()) return;
    if (byCoach) {
      if (Date.now() - persSigAt < 15000) return;
      persSigAt = Date.now();
      persBanner(sig.emoji + " " + sig.name, who.name + "’s signature", "sig");
      if (castFace) { castFace.mood("gleeful", 1300); castFace.quirk(); }
      castSay("sig", "gleeful");
    } else {
      /* you played the coach's own trick back at it */
      persBanner("🎯 " + sig.name + "!", "You used " + who.name + "’s own trick", "stolen");
      if (persStole !== gameTicket) { persStole = gameTicket; hap("success"); }
      if (castFace) { castFace.mood("shocked", 1400); castEmote("❗"); }
      castSay("stolen", "shocked");
      if (prefs.sound && typeof Stage !== "undefined") Stage.swing(true);
    }
  }, REDUCED ? 80 : 520);
}
function persBanner(text, sub, cls) {
  if (typeof moBanner === "function") moBanner(text, sub, cls, 2100);
}
/* the coach's habit, now and then while it waits for you */
function persIdle() {
  clearTimeout(persIdleT);
  var t = gameTicket;
  persIdleT = setTimeout(function () {
    if (t !== gameTicket) return;
    if (castFace && castWho() && !over && !thinking && !castMeetOn && !document.hidden) castFace.quirk();
    if (castWho() && !over) persIdle();
  }, 9000 + Math.random() * 8000);
}
/* the greeting, as the game begins: hello again, a rivalry, or gossip */
function persGreeting(was) {
  var who = castWho();
  if (!who) return null;
  var rec = persRecord(skill), idx = levelIndex(skill), prev = idx > 0 ? Rating.LEVELS[idx - 1] : null;
  var prevBeaten = prev && ladder.rungs[prev.id] && ladder.rungs[prev.id].stars[0];
  var beatThis = ladder.rungs[skill] && ladder.rungs[skill].stars[0];
  if (was) return { kind: "again" };
  if (prevBeaten && !beatThis && rec.n < 2 && !castSaid.heard) return { kind: "heard" };
  /* a rivalry, two games in three once you have played it a few times */
  if (rec.n >= 2 && rec.n % 3 !== 1) return { kind: "rival", n: rec.n + 1 };
  return { kind: "greet" };
}

function castForTest() {
  return {
    persRecord: persRecord, persGreeting: persGreeting, persSearchOpts: persSearchOpts,
    castState: function () {
      return { on: !!castWho(), id: skill, face: castFace ? castFace.state() : null, flat: $("oppFaceWrap").classList.contains("flat"),
               shown: !$("oppFaceWrap").classList.contains("hide"), saying: $("oppSay").classList.contains("hide") ? "" : $("oppSay").textContent,
               meeting: castMeetOn, met: Object.keys(prefs.met), said: castSaid,
               bar: $("oppFaceWrap").parentNode && $("oppFaceWrap").parentNode.className };
    },
    castMaterial: castMaterial,
    castMeetDone: castMeetDone,
    talentState: function () {
      var tap = document.querySelector(".ptag.tcTap");
      return { hi: hiOn, hiText: hiOn ? $("hiBan").textContent : "", pop: tcPopOn, popText: tcPopOn ? $("tcPop").textContent : "",
               tap: tap ? (tap.querySelector("#nameTop") ? "top" : "bot") : null, meetCard: $("meetCard").textContent,
               hiMs: Math.round(2800 * paceDial().words) };
    },
    tcPopShow: tcPopShow, tcPopHide: tcPopHide, hiDone: hiDone, rematchForTest: rematch
  };
}

/* ===================== rec: a recovery card that tells the truth =====================
   It says what happened in plain words, keeps the technical line one tap
   away (and copyable, for a bug report), and its choices say what they
   cost: try again, try again in 2D, clear only the unfinished game, and —
   behind a second tap that names everything it erases — erase it all.
   The last few errors are kept for this tab only (sessionStorage), so
   nothing about a crash outlives the tab unless the player copies it. */
var REC_LOG = "chess.errors";
function recNote(info) {
  try {
    var log = JSON.parse(sessionStorage.getItem(REC_LOG) || "[]");
    if (!Array.isArray(log)) log = [];
    log.push({ at: Date.now(), msg: String((info && info.msg) || "unknown error").slice(0, 300),
               src: String((info && info.src) || "").slice(0, 200), line: (info && info.line) || 0, col: (info && info.col) || 0 });
    sessionStorage.setItem(REC_LOG, JSON.stringify(log.slice(-5)));
  } catch (e) {}
}
function recLog() {
  try { var l = JSON.parse(sessionStorage.getItem(REC_LOG) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
/* A rejected promise counts when it is the kind of failure a bug makes
   (a TypeError, a ReferenceError…). A network that is down, a permission
   refused, a share sheet dismissed, a fetch aborted: none of those is
   the room breaking, and three of them must never raise the card. */
function recRejectionCounts(r) {
  if (!r || typeof r !== "object" || !r.name) return false;
  if (["TypeError", "ReferenceError", "RangeError", "SyntaxError", "URIError", "EvalError"].indexOf(r.name) < 0) return false;
  return !/fetch|network|load failed|abort/i.test(String(r.message || ""));
}
function recWhere(src) {
  src = String(src || "");
  if (/gfx3d|pieces3d|scenes/.test(src)) return " while drawing the 3D board";
  if (/gfx2d|grain/.test(src)) return " while drawing the board";
  if (/net\.js|room\.js/.test(src)) return " in the link between devices";
  if (/brain|engine/.test(src)) return " while the coach was thinking";
  if (/sound/.test(src)) return " while making a sound";
  return "";
}
function recDetails() {
  var last = recLog().slice(-1)[0] || {};
  var file = String(last.src || "").replace(/^.*\//, "");
  return (last.msg || "no message") + (file ? " @ " + file + (last.line ? ":" + last.line + (last.col ? ":" + last.col : "") : "") : "") +
    " · " + (prefs.use3d ? "3D" : "2D") + " · mode " + (mode || "lobby") + " · ply " + (G && G.played ? G.played.length : 0) +
    " · " + recLog().length + " in this tab · " + navigator.userAgent;
}
function recFill() {
  var last = recLog().slice(-1)[0] || {};
  $("recWhy").textContent = "The room ran into trouble three times in a few seconds" + recWhere(last.src) +
    ", so it stopped here rather than carry on wrong. Your game is saved after every move, so nothing is lost. Pick a way back in:";
  $("recTechTx").textContent = recDetails();
  $("recWipeAsk").classList.add("hide");
  $("recWipe").classList.remove("hide");
}
/* what "erase everything" would take, said with numbers where there are some */
function recWipeWords() {
  var bits = [];
  try {
    var r = Rating.load(lsGet);
    if (r && r.games) bits.push("a rating of " + Math.round(r.r) + " from " + r.games + (r.games === 1 ? " game" : " games"));
  } catch (e) {}
  try { var ls = Learn.stats(Learn.load()); if (ls && ls.solved) bits.push(ls.solved + (ls.solved === 1 ? " lesson" : " lessons") + " learned"); } catch (e) {}
  return (bits.length ? "This device holds " + bits.join(" and ") + ". " : "") +
    "Erasing removes your rating and its history, your ladder stars, Academy lessons, the journal of your games, feats, friends, saved skins and settings, and any game in progress. It can't be undone.";
}
/* only the unfinished game: the one on this device, the one between two
   devices, and the four letters that game was reached by */
function recClearGame() {
  lsDel(SAVE_KEY); lsDel(LAN_KEY);
  try { localStorage.removeItem("room:chess"); } catch (e) {}
}
function recEraseAll() {
  try {
    Object.keys(localStorage).forEach(function (k) { if (/^chessroom_/.test(k) || k === "room:chess") lsDel(k); });
  } catch (e) {}
  try { sessionStorage.removeItem("chess.fx.stepped"); sessionStorage.removeItem(REC_LOG); } catch (e) {}
}
var recStoreWarned = false;
/* a browser that will not keep what the room writes (a private window,
   a full disk) is said once, not discovered after a reload */
function recStoreFailed() {
  if (recStoreWarned) return;
  recStoreWarned = true;
  setTimeout(function () {
    try { toast("This browser isn't keeping what the room saves — a private window, or no space left? A reload would lose this game."); } catch (e) {}
  }, 0);
}
function recWire() {
  $("recReload").addEventListener("click", function () { location.reload(); });
  $("rec2D").addEventListener("click", function () { prefs.use3d = false; savePrefs(); location.hash = "#force2d"; location.reload(); });
  $("recGame").addEventListener("click", function () { recClearGame(); location.hash = ""; location.reload(); });
  $("recWipe").addEventListener("click", function () {
    $("recWipeTx").textContent = recWipeWords();
    $("recWipeAsk").classList.remove("hide");
    $("recWipe").classList.add("hide");
  });
  $("recWipeNo").addEventListener("click", function () { $("recWipeAsk").classList.add("hide"); $("recWipe").classList.remove("hide"); });
  $("recWipeGo").addEventListener("click", function () { recEraseAll(); location.hash = ""; location.reload(); });
  $("recCopy").addEventListener("click", function () {
    var text = $("recTechTx").textContent, btn = this;
    var done = function (ok) { btn.textContent = ok ? "Copied" : "Select the line to copy it"; };
    try { navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
  });
}

/* the edges' handles for chess/tools/edges-check.js */
function edgeTestHooks() {
  return {
    clockForTest: function () { return clock; },
    clkOk: clkOk, CLK_PRESETS: CLK_PRESETS,
    clkAwayForTest: clkAway,
    aqWhyForTest: function (fen, from, to) { return aqWhyFor(Chess.create(fen), Chess.sqIndex(from), Chess.sqIndex(to)); },
    get prefsForTest() { return prefs; },
    recLogForTest: recLog, recDetailsForTest: recDetails, recWipeWordsForTest: recWipeWords,
    cardIdsForTest: cardIds, clockPausedForTest: clockPaused,
    overForTest: function () { return over; }
  };
}

/* a skin link can arrive on first load, or be pasted into a tab that's
   already open — both end up here. It is always an offer, never applied
   behind your back. */
function offerSharedSkin(delay) {
  var m = location.hash.match(/#skin=(SKIN1\.[A-Za-z0-9_-]+)/);
  if (!m) return false;
  var shared = Skins.decode(m[1]);
  history.replaceState(null, "", location.pathname);
  if (!shared) { toast("That skin link looks damaged — ask for a fresh one."); return false; }
  setTimeout(function () {
    toast("🎨 <b>" + esc(shared.name) + "</b> — a board look from " + esc(shared.maker) + ". Try it?",
      [{ label: "Use it", fn: function () { adoptSkin(shared); openStudio(); } },
       { label: "No thanks", fn: function () {}, ghost: true }], 15000);
  }, delay || 0);
  return true;
}
/* Both kinds of invite arrive the same way: four letters (#join=BUZZ) or
   a whole handshake (#join=CHESS2.…). joinFlow() tells them apart. */
var JOIN_HASH = /#join=(CHESS(?:1|2)\.[A-Za-z0-9_-]+|[A-Za-z]{4})(?:$|&)/;
function wireHashLinks() {
  window.addEventListener("hashchange", function () {
    if (offerSharedSkin(0)) return;
    if (offerSharedGame(0)) return;
    if (notationOfferHash(0)) return;
    var j = location.hash.match(JOIN_HASH);
    if (j) {
      takeJoinExtras(location.hash);
      history.replaceState(null, "", location.pathname);
      openLink();
      joinFlow(j[1]);
    }
  });
}

/* ===== service worker: offline + the update whisper ===== */
function wireSW() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").then(function (reg) {
    function watch(worker) {
      worker.addEventListener("statechange", function () {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateBar(worker);
      });
    }
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg.waiting);
    /* a room left open on a phone for days never navigates, so it never
       asks whether there is a new release; coming back to it is a good
       moment to ask */
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") { try { reg.update(); } catch (e) {} }
    });
    if (reg.installing) watch(reg.installing);
    reg.addEventListener("updatefound", function () { if (reg.installing) watch(reg.installing); });
  }).catch(function () {});
  /* on a first visit clients.claim() also fires controllerchange — only
     reload when a controller existed at load (a genuine version swap) */
  var hadController = !!navigator.serviceWorker.controller;
  var reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}
function showUpdateBar(worker) {
  if ($("updateBar")) return;
  var b = document.createElement("button");
  b.id = "updateBar";
  b.textContent = "✨ A new version of the room is ready — tap to refresh";
  b.addEventListener("click", function () { worker.postMessage({ type: "SKIP_WAITING" }); });
  document.body.appendChild(b);
}

/* ===== go ===== */
/* ===== tilt to look round =====
   On a phone the board answers how you hold it: tip the phone and the
   camera steps a degree or two the same way, as if you had moved your
   head over a real board. It follows movement rather than angle — the
   level it measures from drifts slowly to however you are holding the
   phone, so lying down or sitting up is level within a second or two —
   and it ignores the tremble of a hand, so a still phone means a still
   board and the loop is allowed to sleep. iOS only sends tilt once it
   has been asked for in a tap (the Settings switch does that). */
var tiltAllowed = false, TILT_OK_KEY = "chessroom_tilt_ok";
function tiltNeedsAsk() {
  return !!(window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === "function");
}
/* true while the phone should be sending tilt at all */
function tiltWanted() {
  return !!(prefs.tilt && R3 && R === R3 && R3.parallax && !document.hidden && !REDUCED &&
            !(tiltNeedsAsk() && !tiltAllowed));
}
/* The listener is the switch: with one registered the phone keeps its
   orientation sensor powered and wakes the page sixty times a second, so
   it is only there while tilt is on, the 3D board is up and the tab is
   visible — and goes the moment any of those stops being true. */
var tiltOn = null, tiltBase = null;
function syncTilt() {
  var want = tiltWanted();
  if (want === !!tiltOn) return;
  if (want) { tiltBase = null; window.addEventListener("deviceorientation", onTilt); tiltOn = true; }
  else {
    window.removeEventListener("deviceorientation", onTilt); tiltOn = false;
    if (R3 && R3.parallax) { R3.parallax(0, 0); needFrame(); }
  }
}
/* iOS forgets nothing but tells nothing: once a tap has been allowed
   here, the next visit asks again — quietly, from the first tap, which
   is answered without a prompt while the permission still stands */
function tiltRetry() {
  if (!prefs.tilt || !tiltNeedsAsk() || tiltAllowed || lsGet(TILT_OK_KEY) !== "1") return;
  try {
    window.DeviceOrientationEvent.requestPermission().then(function (r) {
      tiltAllowed = r === "granted";
      if (!tiltAllowed) lsDel(TILT_OK_KEY);
      syncSettingsUI(); syncTilt();
    }).catch(function () {});
  } catch (e) {}
}
function onTilt(e) {
    if (!tiltWanted()) { syncTilt(); return; }
    if (e.beta == null || e.gamma == null) return;
    var base = tiltBase, sent = onTilt.sent || (onTilt.sent = { x: 0, y: 0 });
    var angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    /* across and along the screen as it is being held */
    var across = e.gamma, along = e.beta;
    if (angle === 90) { across = e.beta; along = -e.gamma; }
    else if (angle === -90 || angle === 270) { across = -e.beta; along = e.gamma; }
    if (!base) base = tiltBase = { a: across, b: along };
    base.a += (across - base.a) * 0.012; base.b += (along - base.b) * 0.012;
    var nx = Math.max(-1, Math.min(1, (across - base.a) / 14));
    var ny = Math.max(-1, Math.min(1, (along - base.b) / 14));
    if (Math.abs(nx - sent.x) < 0.05 && Math.abs(ny - sent.y) < 0.05) return;
    sent.x = nx; sent.y = ny;
    R3.parallax(nx, -ny);
    needFrame();
}
function wireParallax() {
  if (REDUCED || typeof window.DeviceOrientationEvent === "undefined") return;
  syncTilt();
  document.addEventListener("visibilitychange", syncTilt);
  document.addEventListener("pointerdown", tiltRetry, { once: true, passive: true });
}
/* ===== keys and words: focus that behaves, a spoken board, keyboard play =====
   Everything a keyboard or a screen reader needs, in one place, so the
   rest of the room only has to call in at five doors: toast(),
   commitMove(), endGame(), moveCell() and the dev handle. The pure half
   — words for moves and squares, the reader for typed moves — is
   access.js.

   Focus. Every card is a body-level .ov, shown and hidden by its class
   from two dozen places; rather than change each of them, one observer
   watches the cards' classes. While any card is up, everything else on
   the page is inert (Tab cannot reach the game beneath, a screen reader
   cannot wander into it), focus goes into the card — its first button
   for a question or the promotion picker, its heading otherwise — and
   when the last card goes, focus goes back to where it was. The closed
   Studio is inert too: it is aria-hidden, and its twenty inputs used to
   be in the tab order anyway.

   Words. One polite live region, #accSay, outside everything that can
   be made inert. It reads each move ("White: knight to f3, check"), the
   result, a toast that asks something, and anything said in answer to
   a key. prefs.speak: "moves" (the default — a screen-reader user hears
   the game without hunting for a setting, and nobody else hears
   anything), "all" (every remark too), "off".

   Keys. Tab reaches the board: the arrows walk a square cursor (drawn
   by both boards, R.setCursor), Enter or Space picks up and sets down,
   Escape puts back. Typing a move anywhere outside a text box opens a
   small entry over the board. Shift + a letter that is not a piece does
   what a button does; "/" shows the keys. Plain letters belong to
   notation, "?" to the help lamp's "why", Escape to the cards and the
   pen. */
var accSaid = [], accQueue = [], accSayTimer = 0;
var accKeyAt = 0, accPointerAt = 0;
var accTop = null, accBack = null;
var accCur = -1;                 /* the keyboard's square, 0x88; -1 until the board is first focused */
var kbTypeBack = null, kbBusy = false;
/* read straight from the store: prefs only keeps the keys its own
   literal names, and this one is ours */
(function () {
  var p = {};
  try { p = JSON.parse(lsGet(PREF_KEY) || "{}") || {}; } catch (e) { p = {}; }
  prefs.speak = ["moves", "all", "off"].indexOf(p.speak) >= 0 ? p.speak : "moves";
})();

function accText(html) {
  try { return new DOMParser().parseFromString(String(html), "text/html").body.textContent.replace(/\s+/g, " ").trim(); }
  catch (e) { return stripTags(html); }
}
/* one sentence at a time, joined if several land together; cleared and
   set a beat later so the same words said twice are heard twice */
function accSay(text) {
  if (!text || prefs.speak === "off") return;
  accSaid.push(text);
  if (accSaid.length > 30) accSaid.shift();
  accQueue.push(text);
  clearTimeout(accSayTimer);
  accSayTimer = setTimeout(function () {
    var el = $("accSay");
    if (!el) return;
    var words = accQueue.join(" ");
    accQueue = [];
    el.textContent = "";
    setTimeout(function () { el.textContent = words; }, 40);
  }, 80);
}
/* from toast(): a question always, every remark if asked for, and
   whatever answers a key just pressed (a piece with nowhere to go, the
   lamp's chips) */
function accToast(html, actions) {
  if (prefs.speak === "off") return;
  if (!(actions || prefs.speak === "all" || Date.now() - accKeyAt < 900)) return;
  accSay(accText(html) + (actions ? " " + actions.map(function (a) { return a.label; }).join(", ") + "." : ""));
}
/* from commitMove(), with the position already after the move */
function accAfterMove(m, san, st) {
  var mine = mode === "coach" ? humanSide : mode === "lan" ? lanSide : 0;
  accSay(Access.sayMove(m, san) + "." + (mine && !st.over && G.turn === mine ? " Your move." : ""));
}
/* from endGame() */
function accAtEnd(result, reason, title) {
  accSay("Game over. " + title + " " + Access.resultWords(result, reason));
}
/* from moveCell(): the cell gets a name a screen reader can say, and the
   current move is the one stop the move list has in the tab order */
function accCell(s, ply, san) {
  var rec = G.played[ply];
  var cur = s.classList.contains("cur");
  s.setAttribute("role", "button");
  s.tabIndex = cur ? 0 : -1;
  if (cur) s.setAttribute("aria-current", "true");
  s.setAttribute("aria-label", (Math.floor(ply / 2) + 1) + ". " + Access.sayMove(rec.m, san) +
    (s.title && s.title.indexOf(" — ") > 0 ? ". " + s.title.slice(s.title.indexOf(" — ") + 3) : ""));
  s.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); s.click(); }
  });
}

/* ---- focus: the one door every card goes through ---- */
function accVisible(el) { return !!el && el.getClientRects().length > 0; }
function accOverlayTop() {
  var first = ["ovRecover", "ovAsk", "ovPromo"];
  for (var i = 0; i < first.length; i++) { var o = $(first[i]); if (o && !o.classList.contains("hide")) return o; }
  var open = document.querySelectorAll("body > .ov:not(.hide)");
  return open.length ? open[open.length - 1] : null;
}
function accFocusInto(ov) {
  var t = null;
  if (ov.id === "ovAsk" || ov.id === "ovPromo") {
    t = [].filter.call(ov.querySelectorAll("button"), accVisible)[0] || null;
  }
  if (!t) {
    t = [].filter.call(ov.querySelectorAll("h1, h2"), accVisible)[0] || null;
    if (t && !t.hasAttribute("tabindex")) t.setAttribute("tabindex", "-1");
  }
  if (!t) t = [].filter.call(ov.querySelectorAll("button, [tabindex], input"), accVisible)[0] || null;
  if (t) try { t.focus({ preventScroll: true }); } catch (e) {}
}
function accSyncFocus() {
  var top = accOverlayTop();
  var kids = document.body.children;
  for (var i = 0; i < kids.length; i++) {
    var k = kids[i];
    /* the room and the other cards; never a bar that asks to be tapped
       over everything (the update bar), nor the live region */
    if (!(k.id === "app" || k.id === "studio" || k.id === "splash" || k.classList.contains("ov"))) continue;
    var want = !!top && k !== top;
    if (k.id === "studio" && k.getAttribute("aria-hidden") === "true") want = true;
    if (k.inert !== want) k.inert = want;
  }
  if (top) {
    if (!accTop) accBack = document.activeElement;
    var fresh = top !== accTop;
    accTop = top;
    if (fresh && !top.contains(document.activeElement)) accFocusInto(top);
    return;
  }
  if (!accTop) return;
  accTop = null;
  var back = accBack; accBack = null;
  var now = document.activeElement;
  if (now && now !== document.body && accVisible(now)) return;   /* something already took it */
  if (back && back !== document.body && document.contains(back) && accVisible(back)) {
    try { back.focus({ preventScroll: true }); } catch (e) {}
  }
}

/* ---- the board under the keyboard ---- */
function accBoardFocused() { var a = document.activeElement; return !!a && (a === $("cv2") || a === $("cv3")); }
function accShowCursor() {
  if (!R || !R.setCursor) return;
  R.setCursor(accBoardFocused() && G ? accCur : -1);
  needFrame();
}
function accSquareSay(sq) {
  var board = viewPly >= 0 ? currentViewBoard() : G.board;
  var w = Access.squareWords(board, sq);
  if (viewPly < 0 && sel >= 0) {
    if (sq === sel) w += ", in your hand";
    else if (legalMoves.some(function (m) { return m.to === sq; })) w += ", you can go here";
  }
  accSay(w + ".");
}
function accBoardKey(e) {
  if (!G) return false;
  var k = e.key;
  if (/^Arrow/.test(k)) {
    if (accCur < 0) accCur = G.kings[G.turn === 1 ? 0 : 1];
    accCur = Access.step(accCur, k, orientation);
    accShowCursor();
    accSquareSay(accCur);
    return true;
  }
  if (k === "Enter" || k === " ") {
    if (accCur < 0) return true;
    if (viewPly >= 0) { exitView(); accSay("Back to the game."); return true; }
    if (!canActNow(true)) { accSay(accWhyNot()); return true; }
    var before = sel, n = G.played.length;
    tapSquare(accCur);
    if (G.played.length !== n || pendingPromo) return true;     /* the move speaks for itself */
    if (sel >= 0 && sel !== before) {
      var to = legalMoves.map(function (m) { return Chess.sqName(m.to); })
        .filter(function (v, i, a) { return a.indexOf(v) === i; });
      accSay("Picked up the " + Access.NAME[Math.abs(G.board[sel])] + " on " + Chess.sqName(sel) + "." +
        (to.length ? " It can go to " + (to.length > 6 ? to.slice(0, 6).join(", ") + " and " + (to.length - 6) + " more" : to.join(", ")) + "." : ""));
    } else if (sel < 0 && before >= 0) accSay("Put back.");
    else if (sel < 0) accSquareSay(accCur);
    return true;
  }
  if (k === "Escape" && sel >= 0 && viewPly < 0) {
    tapSquare(sel);
    accSay("Put back.");
    return true;
  }
  if (k === "[" || k === "]") {
    if (!G.played.length) return true;
    var at = viewPly >= 0 ? viewPly : G.played.length - 1;
    if (k === "[") viewAt(Math.max(0, at - 1));
    else if (viewPly >= 0) { if (at + 1 >= G.played.length - 1) exitView(); else viewAt(at + 1); }
    var rec = G.played[viewPly >= 0 ? viewPly : G.played.length - 1];
    accSay((viewPly >= 0 ? "Looking back. " : "The game now. ") + "After " + Access.sayMove(rec.m, rec.san) + ".");
    return true;
  }
  return false;
}
function accWhyNot() {
  if (!G || over) return "The game is over.";
  if (pendingPromo) return "Choose a piece for the pawn first.";
  if (mode === "coach" && thinking) return SKILLS[skill].label + " is thinking.";
  if (mode === "lan" && !Net.linked()) return "Your friend isn't connected.";
  if (mode === "coach" || mode === "lan") return "It isn't your move.";
  return "There's nothing to move just now.";
}

/* ---- typing a move ---- */
function kbTypeOpen(first) {
  var box = $("kbType"), inp = $("kbIn");
  if (!box || !inp) return;
  kbTypeBack = document.activeElement;
  box.classList.remove("hide");
  $("kbMsg").textContent = "";
  inp.value = first || "";
  inp.focus({ preventScroll: true });
  try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
}
function kbTypeClose(refocus) {
  var box = $("kbType");
  if (!box || box.classList.contains("hide")) return;
  box.classList.add("hide");
  var back = kbTypeBack; kbTypeBack = null;
  if (refocus && back && back !== document.body && document.contains(back) && accVisible(back)) {
    try { back.focus({ preventScroll: true }); } catch (e) {}
  } else if (document.activeElement === $("kbIn")) $("kbIn").blur();
}
function kbTypeFail(msg) {
  $("kbMsg").textContent = msg;
  accSay(msg);
  hap("nope");
  try { $("kbIn").select(); } catch (e) {}
}
/* the typed move goes in through the same door as two taps, so a lesson,
   a promotion, a friend's board and the whole move pipeline see nothing
   new — and it sounds and feels exactly like a tap */
function kbPlay(from, to, promoKind) {
  whenLanded(function () {
    if (!G || !canActNow()) return;
    clearSel();
    tapSquare(from);
    if (sel !== from) return;
    if (promoKind) {
      askPromotion(from, to);
      var b = $("promoRow").children[[Chess.Q, Chess.N, Chess.R, Chess.B].indexOf(promoKind)];
      if (b) b.click();
      return;
    }
    tapSquare(to);
  });
}
function kbSubmit(text) {
  if (!G || over) { kbTypeClose(true); return false; }
  if (viewPly >= 0) exitView();
  if (!canActNow(true)) { kbTypeFail(accWhyNot()); return false; }
  var r = Access.parse(G, text);
  if (r.error) { kbTypeFail(r.error); return false; }
  kbTypeClose(true);
  if (r.promote) kbPlay(r.promote.from, r.promote.to, 0);
  else kbPlay(r.move.from, r.move.to, r.move.promo ? Math.abs(r.move.promo) : 0);
  return true;
}

/* ---- the key card ---- */
function kbShowKeys() {
  var html = "<b>The keys</b>";
  Access.KEYS.forEach(function (grp) {
    html += '<span class="kbGroup">' + grp[0] + "</span>";
    grp[1].forEach(function (row) {
      html += '<span class="kbRow"><kbd>' + escHtml(row[0]) + "</kbd><span>" + escHtml(row[1]) + "</span></span>";
    });
  });
  ask(html, [{ label: "Done", fn: function () {} }]);
}
function accWhere() {
  if (!G) return;
  var last = G.played[G.played.length - 1];
  accSay(Access.position(G) + (last ? " The last move: " + Access.sayMove(last.m, last.san) + "." : ""));
}
var KB_SHORT = { U: "btnUndo", H: "btnHint", F: "btnFlip", L: "btnReplay", M: "btnMenu" };

function accSyncSettings() {
  [["accMoves", "moves"], ["accAll", "all"], ["accOff", "off"]].forEach(function (p) {
    var b = $(p[0]);
    if (b) { b.classList.toggle("sel", prefs.speak === p[1]); b.setAttribute("aria-pressed", prefs.speak === p[1] ? "true" : "false"); }
  });
}

function accWire() {
  /* every card a dialog, named by its heading */
  [].forEach.call(document.querySelectorAll("body > .ov"), function (ov) {
    if (!ov.hasAttribute("role")) ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    if (!ov.hasAttribute("aria-labelledby")) {
      var h = ov.querySelector("h1, h2");
      if (h) { if (!h.id) h.id = "accH_" + ov.id; ov.setAttribute("aria-labelledby", h.id); }
      else ov.setAttribute("aria-label", ov.id === "ovProfile" ? "Your record" : "A card");
    }
    new MutationObserver(accSyncFocus).observe(ov, { attributes: true, attributeFilter: ["class"] });
  });
  if ($("studio")) new MutationObserver(accSyncFocus).observe($("studio"), { attributes: true, attributeFilter: ["aria-hidden"] });
  accSyncFocus();

  /* the boards: something a screen reader can name and a keyboard can
     reach. A click is not an invitation: the board only keeps focus that
     came from the keyboard, so ← → still step through the game for a
     mouse (and a finger) exactly as before. */
  ["cv2", "cv3"].forEach(function (id) {
    var cv = $(id);
    if (!cv) return;
    cv.tabIndex = 0;
    cv.setAttribute("role", "application");
    cv.setAttribute("aria-roledescription", "chess board");
    cv.setAttribute("aria-label", "Chess board. Arrow keys move around it, Enter picks up and sets down, " +
      "or type a move such as Nf3. Shift W reads the position; slash lists the keys.");
    cv.addEventListener("focus", function () {
      if (Date.now() - accPointerAt < 400) { cv.blur(); return; }
      if (!G) return;
      if (accCur < 0) accCur = sel >= 0 ? sel : G.kings[(mode === "coach" ? humanSide : G.turn) === 1 ? 0 : 1];
      accShowCursor();
      accSquareSay(accCur);
    });
    cv.addEventListener("blur", function () { if (R && R.setCursor) { R.setCursor(-1); needFrame(); } });
  });
  document.addEventListener("pointerdown", function () { accPointerAt = Date.now(); }, true);

  /* the move list keeps its place under the keyboard while it is redrawn */
  var listHadFocus = false;
  document.addEventListener("focusin", function (e) { listHadFocus = !!(e.target.closest && e.target.closest("#moveList")); });
  document.addEventListener("pointerdown", function (e) { if (!(e.target.closest && e.target.closest("#moveList"))) listHadFocus = false; }, true);
  if ($("moveList")) new MutationObserver(function () {
    var a = document.activeElement;
    if (!listHadFocus || (a && a !== document.body && document.contains(a))) return;
    var c = $("moveList").querySelector(".m.cur") || $("moveList").querySelector(".m:last-of-type");
    if (c) c.focus({ preventScroll: true });
  }).observe($("moveList"), { childList: true });

  /* the entry for a typed move */
  var inp = $("kbIn");
  if (inp) {
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); kbBusy = true; kbSubmit(inp.value); kbBusy = false; }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); kbTypeClose(true); }
      else if (e.key === "Backspace" && !inp.value) { e.preventDefault(); kbTypeClose(true); }
    });
    inp.addEventListener("input", function () { $("kbMsg").textContent = ""; });
    inp.addEventListener("blur", function () { if (!kbBusy) setTimeout(function () { if (document.activeElement !== inp) kbTypeClose(false); }, 0); });
  }

  /* settings: the spoken board, and the way to the key card */
  [["accMoves", "moves"], ["accAll", "all"], ["accOff", "off"]].forEach(function (p) {
    var b = $(p[0]);
    if (b) b.addEventListener("click", function () {
      prefs.speak = p[1]; savePrefs(); accSyncSettings();
      if (p[1] !== "off") accSay(p[1] === "all" ? "Moves and every remark will be read." : "Moves will be read.");
    });
  });
  if ($("accKeys")) $("accKeys").addEventListener("click", kbShowKeys);
  accSyncSettings();

  /* the keys — ahead of the room's own handler, which still has Escape,
     the arrows, Home, End and "?" for everything not taken here */
  document.addEventListener("keydown", function (e) {
    if (!/^(Shift|Control|Alt|Meta|CapsLock|Tab)$/.test(e.key)) accKeyAt = Date.now();
    var t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var card = accOverlayTop();
    /* the promotion picker answers to the pieces' letters */
    if (card && card.id === "ovPromo") {
      var pi = "qnrb".indexOf(e.key.toLowerCase());
      if (pi >= 0 && $("promoRow").children[pi]) { e.preventDefault(); e.stopImmediatePropagation(); $("promoRow").children[pi].click(); }
      return;
    }
    if (card) return;
    if (t && t.closest && t.closest("#studio")) return;
    if (accBoardFocused() && accBoardKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === "/") { e.preventDefault(); kbShowKeys(); return; }
    if (e.shiftKey && !e.repeat && KB_SHORT[e.key]) {
      var b = $(KB_SHORT[e.key]);
      if (b && !b.disabled && accVisible(b)) { e.preventDefault(); b.click(); }
      return;
    }
    if (e.shiftKey && e.key === "W") { e.preventDefault(); accWhere(); return; }
    if (e.key.length === 1 && /[a-hKQRBNOnrqko0]/.test(e.key) && G && !over &&
        (mode === "coach" || mode === "pass" || mode === "lan" || mode === "lesson")) {
      e.preventDefault();
      if (viewPly < 0 && !canActNow(true)) { accSay(accWhyNot()); return; }
      kbTypeOpen(e.key);
    }
  }, true);
}
accWire();

/* for chess/tools/access-check.js */
function accForTest() {
  return {
    saidForTest: function () { return accSaid.slice(); },
    typeForTest: function (text) { return kbSubmit(text); },
    cursorForTest: function () { return accCur; },
    Access: Access
  };
}

function boot() {
  /* the first tap anywhere — not only on the board — is the gesture a
     browser wants before it will start an audio clock, and lets the
     room's reverb grow at idle before the first sting needs it */
  document.addEventListener("pointerdown", function () {
    if (prefs.sound && typeof Sound !== "undefined") { try { Sound.wake(); audioWoken = true; syncRoomTone(); } catch (e) {} }
  }, { capture: true, passive: true });
  if (typeof Sound !== "undefined" && Sound.setReduced) Sound.setReduced(REDUCED);
  /* who this room is, as far as the shared front door is concerned */
  Room.configure({ game: "chess", seats: 2, label: "board" });
  /* a place the road has not reached yet is not where you sit down */
  if (!placeOpen(prefs.scene)) { prefs.scene = "park"; savePrefs(); }
  uimWire();
  wireUI();
  lanHandlers();
  wireFriends();
  wireNotation();
  initRenderers();
  fxInit();
  applySkin(skin, false);
  wireInput();
  wireParallax();
  syncSettingsUI();
  wireSW();
  wireHashLinks();
  clearNotes(); showPanelTab("moves");
  G = Chess.create();          /* an idle board behind the menu */
  R.setPosition(G.board, { flourish: true });
  mode = null;
  syncAll();
  needFrame();

  /* somebody shared a board look with you */
  offerSharedSkin(1200);
  /* …or a game, or one moment of one */
  offerSharedGame(1400);
  /* …or a game or position in notation */
  notationOfferHash(1400);

  /* arriving by invite link? straight into the join flow */
  var joinM = location.hash.match(JOIN_HASH);
  setTimeout(function () {
    $("splash").classList.add("gone");
    if (joinM) {
      takeJoinExtras(location.hash);
      history.replaceState(null, "", location.pathname);
      openLink();
      joinFlow(joinM[1]);
    } else {
      showMenu();
    }
  }, REDUCED ? 150 : Math.max(150, 900 - performance.now()));   /* the splash is a moment, not a wait on top of the load */
}

try { boot(); } catch (e) { panic(); throw e; }

/* dev handle, in the house style */
window.__cr = { get game() { return G; }, Chess: Chess, Book: Book, Net: Net,
  Teach: Teach, Learn: Learn, Skins: Skins,
  get skin() { return skin; }, applySkin: applySkin,
  get lesson() { return lesson; }, startLesson: startLesson, openAcademy: openAcademy,
  openStudio: openStudio, openLink: openLink, feedCode: feedCode,
  scanSupported: scanSupported, commitMove: commitMove,
  get lanNonce() { return lanNonce; }, get lanSide() { return lanSide; },
  lead: lead, oddsFor: oddsFor, oddsNudge: oddsNudge, showMateNet: showMateNet,
  get oddsSpent() { return oddsSpent; }, syncAll: syncAll,
  clockMs: function (side) { return side === 1 ? clock.w : clock.b; },
  oddsResetForTest: function () { oddsLastNudge = -99; teachSeen = {}; teachCool = 0; },
  /* the notebook, for chess/tools/coach-check.js — the voice switch and
     the take-back are the two places its bookkeeping can go wrong, and
     neither is reachable from a click the checker can make reliably */
  setVoiceForTest: function (v) {
    prefs.coach = v !== "off";
    if (v !== "off") prefs.coachVoice = v;
    savePrefs(); syncSettingsUI(); renderNotes(); syncMoveList();
  },
  undoPlyForTest: undoPly,
  /* run a clock down to its last millisecond, for play-check.js */
  flagForTest: function (side) { if (side === 1) clock.w = 1; else clock.b = 1; clock.lastT = performance.now(); needFrame(); },
  marksForTest: function () { return marks; },
  notesForTest: function () { return notes; },
  get mode() { return mode; }, startGame: startGame, get renderer() { return R; },
  Room: Room, joinByCode: joinByCode, hostFlow: hostFlow, joinFlow: joinFlow,
  get health() { return Net.health(); }, get lanSave() { return loadLan(); },
  rejoinLan: rejoinLan, syncNetChip: syncNetChip,
  /* for friends-check.js: a meeting that happens before the board is dealt */
  setModeForTest: function (m) { mode = m; },
  /* friends, for chess/tools/friends-check.js and share-check.js */
  Share: Share, Friends: Friends, get friends() { return friends; }, get lanOppId() { return lanOppId; },
  get sharedView() { return sharedView; }, get lastShare() { return lastShare; }, get viewPly() { return viewPly; },
  shareGame: shareGame, liveGame: liveGame, openShared: openShared, challengeFriend: challengeFriend,
  showPeople: showPeople, showMenu: showMenu,
  /* the pen, for chess/tools/ink-check.js: a check that cannot hold a
     finger down can still draw through the same door the finger does */
  inkForTest: function (pos) { return Ink.at(ink, pos == null ? posIndex() : pos); },
  penForTest: function (from, to, t) {
    var got = Ink.toggle(ink, posIndex(), { from: from, to: to == null ? from : to, t: t ? 1 : 0 });
    syncInk(); saveGame(); needFrame(); return got;
  },
  posIndexForTest: function () { return posIndex(); }, PEN_HOLD_MS: PEN_HOLD_MS,
  /* the coach's reviews with the squares they name, for lookback-check.js */
  reviewMemoForTest: function () { return reviewMemo; },
  /* a machine drawing in software can take longer than a held finger to
     deliver a quick tap; a check that means "a tap" can say so */
  penHoldForTest: function (ms) { PEN_HOLD_MS = ms > 0 ? ms : 420; } };
helpTestHooks(window.__cr);
Object.assign(window.__cr, progressionForTest());
Object.assign(window.__cr, notationForTest());
Object.assign(window.__cr, accForTest());
Object.assign(window.__cr, castForTest(), homeForTest(), momentumForTest(), unlocksForTest(), journeyForTest(), taleForTest(), beatsForTest(), paceForTest(), tableForTest(), setupForTest(), uimForTest());
Object.assign(window.__cr, edgeTestHooks());
})();
