/* app.js — the room itself.
   Game flow for three ways to play (pass & play, the coach, nearby),
   the tournament clock, the gentle coach, opening stories, history
   browsing, persistence, and the self-healing boot. The rules live in
   engine.js; the boards live in gfx2d.js / gfx3d.js; the nearby link
   lives in net.js; the openings live in book.js. This file only
   conducts. */
/* global Chess, Book, Eco, Teach, Learn, Rating, Skins, Pieces3D, Gfx2D, Gfx3D, Net, Room, Brain, Sound, Fx, Motion */
(function () {
"use strict";

function $(id) { return document.getElementById(id); }
var REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ===== self-healing: catch trouble before it strands anyone ===== */
var errTimes = [];
function panic() {
  var ov = $("ovRecover");
  if (ov) ov.classList.remove("hide");
}
window.addEventListener("error", function () {
  var now = Date.now();
  errTimes.push(now);
  errTimes = errTimes.filter(function (t) { return now - t < 8000; });
  if (errTimes.length >= 3) panic();
});
window.addEventListener("unhandledrejection", function () { /* logged errors only; never strand */ });

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

var PREF_KEY = "chessroom_prefs", SAVE_KEY = "chessroom_save", LAN_KEY = "chessroom_lan";

/* ===== preferences ===== */
var prefs = { skin: null, use3d: true, sound: true, coach: true, helpers: true, clockSkin: "simple", name: "", fx: "auto", coachVoice: "plain", lastClock: {}, autoFlip: false };
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
  if (!prefs.lastClock || typeof prefs.lastClock !== "object") prefs.lastClock = {};
  Object.keys(prefs.lastClock).forEach(function (k) {
    if (["none", "3+2", "5+0", "10+5", "15+10", "30+0"].indexOf(String(prefs.lastClock[k])) < 0) delete prefs.lastClock[k];
  });
})();
function savePrefs() { lsSet(PREF_KEY, JSON.stringify(prefs)); }

/* ===== the look =====
   One skin object drives both renderers and the page chrome. Changing
   it is instant and allowed at any time — including mid-game, which is
   the whole point of the Studio. */
var skin = Skins.clean(prefs.skin || Skins.PRESETS[0], "Walnut Study");
function applySkin(s, save) {
  skin = Skins.clean(s);
  if (R2) R2.setSkin(skin);
  if (R3) R3.setSkin(skin);
  /* the room around the board follows the board */
  var root = document.documentElement;
  root.style.setProperty("--room", skin.room.bg);
  root.style.setProperty("--amber", skin.marks.select);
  root.style.setProperty("--glow", skin.marks.last);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", skin.room.bg);
  /* the pieces' material and the board's finish are both part of how
     they sound, so the synth hears about a skin change too */
  if (typeof Sound !== "undefined") Sound.setSkin(skin);
  if (save !== false) { prefs.skin = skin; savePrefs(); }
  needFrame();
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
  if (!prefs.sound || typeof Sound === "undefined") return;
  Sound.pickUp(piece);
}
/* The whole gesture: the drag for as long as it is on the board, the
   knock of whatever it takes, the rook of a castle in its own weight,
   and the moment it is set down. The plan is the renderer's own, so the
   two cannot drift apart. */
function sndMove(desc, plan, captured) {
  if (!prefs.sound || typeof Sound === "undefined" || !plan) return;
  Sound.move(desc, plan, { captured: captured || 0 });
}

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
    if (!FX) return;
    Fx.capture(sq, { piece: took, power: power, color: took > 0 ? skin.pieces.white : skin.pieces.black });
    if (prefs.sound) Fx.haptic("capture");
  }, plan ? plan.dur * plan.travel : 0);
}
function fxPromote(desc, plan) {
  if (!FX || !desc.promo) return;
  var at = gameTicket;
  /* the pillar rises with the renderer's own promotion flash */
  setTimeout(function () { if (at === gameTicket) Fx.promote(desc.to, { color: desc.piece > 0 ? 1 : -1 }); },
             plan ? plan.dur * 0.3 : 0);
}
function fxCheck(kingSq) {
  if (!FX || kingSq == null || kingSq < 0) return;
  Fx.check(kingSq, { color: skin.marks.check });
  if (prefs.sound) Fx.haptic("check");
}
/* win: true (you delivered it), false (it was delivered to you), null
   (two people on one board — a mate is everyone's moment) */
var fxDown = null;     /* the mated king and who mated him, to lay him down again */
function fxMate(kingSq, attackerSq, win) {
  if (!R) return;
  fxDown = { king: kingSq, from: attackerSq };
  if (R.topple) R.topple(kingSq, { from: attackerSq });
  /* a narrow phone is already framed wide; lean in less */
  if (R.focus) R.focus(kingSq, { amount: innerWidth < 600 ? 0.6 : 1 });
  needFrame();
  if (!FX) return;
  Fx.mate(kingSq, { win: win });
  if (prefs.sound) Fx.haptic(win === false ? "loss" : "mate");
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
function toast(html, actions, ms) {
  var el = $("toast");
  /* a remark never replaces a question that is still waiting for an
     answer — the notebook has kept the remark */
  if (!actions && el.classList.contains("show") && el.classList.contains("acts")) return;
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
  toastTimer = setTimeout(hideToast, ms || (actions ? 9000 : 4200));
}
function hideToast() { $("toast").classList.remove("show"); }

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
    fx: prefs.fx && prefs.fx !== "auto" ? prefs.fx : undefined
  };
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
}
function useRenderer(r) {
  R = r;
  $("cv3").classList.toggle("hide", R !== R3);
  $("cv2").classList.toggle("hide", R !== R2);
  R.setSkin(skin);
  R.setOrientation(orientation);
  R.resize();
  if (G) { R.setPosition(currentViewBoard()); syncBoard(); fxRelay(); }
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
var hintArrow = null;
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
var principleN = 0;

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
function clockConfig(str) {
  if (!str || str === "none") { clock.on = false; return; }
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
var PAUSING = ["ovMenu", "ovNew", "ovSettings", "ovAbout", "ovProfile", "ovAcademy", "ovLearn", "ovOpenings", "ovAsk"];
function clockPaused() {
  if (mode === "lan") return false;
  for (var i = 0; i < PAUSING.length; i++) if (!$(PAUSING[i]).classList.contains("hide")) return true;
  return false;
}
function clockTick(now) {
  if (!clock.on || !clock.run || over || !G) return;
  var dt = now - clock.lastT;
  clock.lastT = now;
  if (clockPaused()) return;
  if (dt <= 0 || dt > 3000) return;
  if (clock.run === 1) clock.w -= dt; else clock.b -= dt;
  var ms = clock.run === 1 ? clock.w : clock.b;
  if (ms <= 10500 && ms > 0) {
    var sec = Math.ceil(ms / 1000);
    if (sec !== clock.lowTicked) {
      clock.lowTicked = sec;
      /* the last five seconds are a heartbeat, quickening, not a ticking */
      if (sec <= 5) snd("low-time", { left: sec }); else snd("tick");
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
  if (mode === "coach") return side === humanSide ? "You" : SKILLS[skill].label;
  if (mode === "lan") return side === lanSide ? (lanMy || "You") : lanOpp;
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
  $("nameTop").innerHTML = tagHTML(topSide);
  $("nameBot").innerHTML = tagHTML(botSide);
  var live = G && !over && viewPly < 0 && mode && mode !== "tour";
  $("nameTop").parentNode.classList.toggle("toMove", !!live && G.turn === topSide);
  $("nameBot").parentNode.classList.toggle("toMove", !!live && G.turn === botSide);
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
  syncPanelInfo();
}
function syncTurnStrip() {
  var el = $("turnStrip");
  $("resultChip").classList.toggle("hide", !(over && G && (mode === "coach" || mode === "pass" || mode === "lan") &&
    $("ovEnd").classList.contains("hide")));
  if (!G) { el.textContent = "…"; return; }
  syncTagState();
  if (viewPly >= 0) { el.innerHTML = "<b>Looking back</b> — move " + Math.floor(viewPly / 2 + 1); return; }
  if (mode === "tour" && tourLine) { el.innerHTML = "<b>📖 " + escHtml(tourLine.name) + "</b>"; return; }
  if (mode === "lesson" && lesson) { el.innerHTML = lessonWorked && lessonPaused ? "<b>Watch</b> — then it's yours" : "<b>🎓 " + escHtml(lesson.title) + "</b>"; return; }
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
  if (viewPly < 0) return G.board;
  var t = Chess.create();
  for (var i = 0; i <= viewPly && i < G.played.length; i++) Chess.make(t, G.played[i].m);
  return t.board;
}
function syncBoard() {
  if (!G || !R) return;
  var hi = { selected: sel, legal: [], legalCapt: [], last: null, check: -1, hint: hintArrow };
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
  if (viewPly >= 0) { exitView(); return; }
  if (!canActNow(true)) { clearSel(); syncBoard(); return; }
  if (R.isAnimating && R.isAnimating() && sel >= 0) {
    /* the second tap of a move made while the last one is landing */
    var at = gameTicket, n = G.played.length;
    whenLanded(function () { if (gameTicket === at && G.played.length === n && canActNow()) tapSquare(sq); });
    return;
  }
  hintArrow = null;
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
      if (mv.promo) { askPromotion(sel, sq); return; }
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

function askPromotion(from, to) {
  pendingPromo = { from: from, to: to };
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
  brainTicket++;   /* any search still running is now answering the wrong question */
  var mover = G.turn;
  /* the position as it stood before the move: the review happens on a
     scratch board built from this, so looking at what you could have
     played can never disturb the game you are playing */
  var fenBefore = Chess.fen(G);
  /* look at the move while the position is still the "before" one */
  var lessons = (prefs.coach && mode !== "tour") ? Teach.afterMove(G, m) : [];
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
  hintArrow = null;

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
  fxCapture(desc, took, plan);
  fxPromote(desc, plan);
  needFrame();
  syncMoveList();
  syncBars();
  syncTurnStrip();
  narrateOpening(san, source);

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
  if (source === "local" && prefs.coach && !clock.on && (mode === "coach" || mode === "pass")) {
    setTimeout(function () { gentleCheck(fenBefore, m, san, ply, myTicket); }, 1400);
  }
  /* the coach takes its turn */
  if (mode === "coach" && !over && G.turn !== humanSide) {
    scheduleCoach();
  }
}

/* ===== the practice opponent ===== */
function scheduleCoach() {
  thinking = true;
  syncTurnStrip(); syncButtons();
  clearTimeout(coachTimer);
  coachTimer = setTimeout(function () {
    if (!G || over || mode !== "coach" || G.turn === humanSide) { thinking = false; syncTurnStrip(); return; }
    var ticket = ++brainTicket;
    var answer = function (res) {
      /* the board may have moved on while it was thinking — a take-back,
         a new game, a resign. The ticket says whether this answer is
         still the answer to the question that was asked; an old answer
         says nothing at all, not even "I've stopped thinking", because a
         newer question may be being thought about right now. */
      if (ticket !== brainTicket) return;
      if (!G || over || mode !== "coach" || G.turn === humanSide) { thinking = false; syncTurnStrip(); return; }
      /* you are in the menu: its move waits for you, so you see it land */
      if (clockPaused()) { setTimeout(function () { answer(res); }, 250); return; }
      thinking = false;
      /* what the coach thinks of the position, from your side: the
         abandonment rule asks whether you were clearly losing */
      if (res && typeof res.score === "number") lastEval = -res.score;
      var m = res && res.move && Brain.resolve(G, res.move);
      /* a worker that died mid-thought must not leave the coach staring
         at the board: think again, briefly, here */
      if (!m) {
        try { var r2 = Chess.search(G, { ms: 120, maxDepth: 3 }); m = r2 && r2.move; } catch (e) { m = null; }
        if (!m) m = Chess.moves(G)[0] || null;
      }
      if (m) commitMove(m, "coach");
      syncTurnStrip(); syncButtons();
    };
    /* exactly the settings the rung was measured with — node budget and
       all — or its rating would be a rating of some other opponent */
    Brain.search(G, Rating.searchOpts(skill)).then(answer, function () { answer(null); });
  }, REDUCED ? 60 : 420);
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
    reviewMemo[ply] = { best: res.bestScore, played: res.playedScore };
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

  var side = ply % 2 === 0 ? 1 : -1;
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
        tone: "good", cp: mineScore,
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
    toast(step.tone + " <b>" + san + "</b> was " + step.word + "." + punish + instead + cost,
      [{ label: "\u21a9 Take it back", fn: function () { gentleUndo(ply); } },
       { label: "Play on", fn: function () {}, ghost: true }], 11000);
  }
}
/* every remark about a move goes through here, so the mark on the move
   list and the entry in the notebook can never disagree */
function noteMove(e) { note(e); }
/* rewind to just before the move that was judged — whatever has been
   played since, and whoever played it */
function gentleUndo(ply) {
  if (!G || over || (mode !== "coach" && mode !== "pass")) return;
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
function giveHint() {
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
  var book = Book.suggest(sans);
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
  if (!bookPick && typeof Eco !== "undefined") {
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
  hintArrow = null;
  /* the line *is* the hint: one curve that shows where the idea goes */
  showLines([{ from: chosen.from, to: chosen.to, kind: "run",
               knight: Math.abs(chosen.piece) === Chess.N }], 9000);
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
  toast("💡 <b>" + san + "</b> — " + (why || explainMove(chosen, res)) + ahead + paid, null, 9000);
}

function explainMove(m, res) {
  var kind = Math.abs(m.piece), bits = [];
  if (res && Math.abs(res.score) > Chess.MATE - 200) {
    var n = Math.ceil((Chess.MATE - Math.abs(res.score)) / 2);
    return "it forces checkmate in " + n + "! Follow the checks.";
  }
  Chess.make(G, m);
  var givesCheck = Chess.inCheck(G);
  Chess.unmake(G);
  if (m.flags & Chess.F_CASTLE) return "castling — the king tucks into safety and the rook joins the game. Two good deeds, one move.";
  if (m.promo) return "the pawn becomes a queen — the biggest promotion in board games.";
  if (m.capt) {
    var vc = Chess.VAL[Math.abs(m.capt)], vm = Chess.VAL[kind];
    if (vc > vm) bits.push("it wins material — a " + pieceName(m.capt) + " for a " + pieceName(m.piece));
    else if (Chess.attacked(G, m.from, -G.turn) && vc >= vm) bits.push("a fair trade that relieves the pressure");
    else bits.push("it captures the " + pieceName(m.capt));
  }
  if (Chess.attacked(G, m.from, -G.turn) && !Chess.attacked(G, m.to, -G.turn) && !m.capt) {
    bits.push("it slips the " + pieceName(m.piece) + " out of danger");
  }
  if (givesCheck) bits.push("it gives check, so the reply is forced");
  var toF = m.to & 7, toR = m.to >> 4, fromR = m.from >> 4;
  if (!bits.length) {
    if (kind === Chess.P && (toF === 3 || toF === 4) && (toR === 3 || toR === 4)) bits.push("it claims a share of the centre");
    else if ((kind === Chess.N || kind === Chess.B) && (fromR === 0 || fromR === 7)) bits.push("it develops a piece toward the middle, where it sees the most squares");
    else if (kind === Chess.R && G.played.length > 20) bits.push("rooks love open files — this one finds work");
    else bits.push("it improves the piece's post — " + Book.principle(principleN++));
  }
  return bits.join(", and ") + ".";
}
function pieceName(p) {
  return ["", "pawn", "knight", "bishop", "rook", "queen", "king"][Math.abs(p)];
}

/* ===== opening narration =====
   Two layers: book.js carries the teaching (ideas, per-move reasons)
   for the great openings; eco.js — the full lichess chess-openings
   table, CC0 — carries precise names for the other ~3,800 lines the
   players may wander into. */
function narrateOpening(san, source) {
  if (!G || G.played.length > 36 || mode === "tour") return;
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
      toast("📖 <b>" + entry.name + "</b> — " + entry.idea, null, 6000);
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
  for (var i = 0; i < G.played.length; i += 2) {
    var row = document.createElement("div"); row.className = "mrow";
    var n = document.createElement("span"); n.className = "n"; n.textContent = (i / 2 + 1) + ".";
    row.appendChild(n);
    row.appendChild(moveCell(i));
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
  return (Math.floor(ply / 2) + 1) + (ply % 2 ? "\u2026" : ".") + " " + G.played[ply].san;
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
  if (e.ply != null && G && G.played[e.ply]) viewAt(e.ply);
  if (e.squares && e.squares.length >= 2) {
    hintArrow = [e.squares[0], e.squares[1]];
    syncBoard();
    setTimeout(function () { hintArrow = null; syncBoard(); }, 4200);
  } else if (e.squares && e.squares.length === 1) {
    R.setHighlights({ selected: e.squares[0], legal: [], legalCapt: [],
                      last: R.hi.last, check: R.hi.check, hint: null });
    setTimeout(syncBoard, 3200);
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
  s.appendChild(figurine(san, ply % 2 === 0 ? 1 : -1));
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
  s.addEventListener("click", function () { viewAt(ply); });
  return s;
}
function stripTags(html) { return String(html).replace(/<[^>]*>/g, ""); }
function viewAt(ply) {
  if (!G || ply < 0 || ply >= G.played.length) return;
  viewPly = (ply === G.played.length - 1) ? -1 : ply;
  showViewBanner(viewPly >= 0);
  clearSel(); hintArrow = null;
  R.setPosition(currentViewBoard());
  syncBoard(); syncMoveList(); syncBars(); syncTurnStrip();
}
function exitView() {
  viewPly = -1;
  showViewBanner(false);
  R.setPosition(G.board);
  fxRelay();
  syncBoard(); syncMoveList(); syncBars(); syncTurnStrip();
}

/* ===== replay the last move (again, with feeling) ===== */
function replayLast() {
  if (!G || !G.played.length || thinking || (R.isAnimating && R.isAnimating())) return;
  if (viewPly >= 0) { exitView(); return; }
  var rec = G.played[G.played.length - 1];
  /* rebuild the position just before it, hand it to the renderer, then
     run the same animation slowly with a glow */
  var t = Chess.create();
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
  if (!G || !G.played.length) return;
  if (mode === "lan") return; /* LAN goes through the polite request */
  clearTimeout(coachTimer); thinking = false;
  for (var i = 0; i < n && G.played.length; i++) Chess.takeBack(G);
  over = null;
  /* a move that has been taken back never happened, so neither did
     anything the room said about it */
  forgetNotesAfter(G.played.length - 1);
  Object.keys(reviewMemo).forEach(function (k) { if (+k >= G.played.length) delete reviewMemo[k]; });
  /* the ideas named about undone moves were never part of this game */
  taughtAt = taughtAt.filter(function (t) { return t.ply < G.played.length; });
  teachSeen = {};
  taughtAt.forEach(function (t) { teachSeen[t.concept] = (teachSeen[t.concept] || 0) + 1; });
  closePromo();
  hideToast(); clearLines(); hintShown = null; fxCalm();
  clearSel(); hintArrow = null; viewPly = -1;
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
var reviewMemo = {};            /* ply → {best, played}: the gentle coach's reviews, reused by the look-back */

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
function nextLevel() { return skillOk(Rating.suggestLevel(rating)); }
function levelIndex(id) {
  for (var i = 0; i < Rating.LEVELS.length; i++) if (Rating.LEVELS[i].id === id) return i;
  return -1;
}
function humanMovesMade() {
  if (!G || mode !== "coach") return 0;
  var n = 0;
  for (var i = 0; i < G.played.length; i++) if ((i % 2 === 0 ? 1 : -1) === humanSide) n++;
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
  return !!(sv && sv.mode === "coach" && savedHumanMoves(sv) >= 3 && sv.sans.length >= ABANDON_PLIES);
}
function savedHumanMoves(sv) { var n = sv.sans.length; return sv.humanSide === 1 ? Math.ceil(n / 2) : Math.floor(n / 2); }
/* resigning the shelved game: counted against the coach it was against */
function settleSaved(sv) {
  var a = Array.isArray(sv.assist) ? sv.assist : [0, 0];
  rating = Rating.load(lsGet);
  var out = Rating.update(rating, { level: sv.skill, result: 0, accuracy: null, at: Date.now(),
                                    assisted: { takebacks: a[0] | 0, hints: a[1] | 0 } });
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
        var out = live ? settleRating("resign") : settleSaved(loadSave());
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
function startCoachGame(level, sideChoice, clockStr) {
  var side = sideChoice === "w" ? 1 : sideChoice === "b" ? -1 :
             sideChoice === "r" ? (Math.random() < 0.5 ? 1 : -1) : -ladder.lastSide;
  ladder.lastSide = side; saveLadder();
  startGame("coach", { humanSide: side, skill: skillOk(level), clockStr: clockStr || "none", fresh: true });
  var L = SKILLS[skill];
  toast(L.emoji + " <b>" + escHtml(L.name) + "</b> · " + L.elo + " — " +
        (side === 1 ? "you have White. Your move." : "you have Black; " + escHtml(L.name) + " opens."), null, 3200);
}
function quickPlay(level) {
  leaveGameThen(function () { startCoachGame(level || nextLevel(), "a", "none"); }, "a new game");
}

/* ---- counting a game ---- */
function settleRating(result) {
  if (mode !== "coach" || ratedDone || !G) return null;
  ratedDone = true;
  var s = result === "draw" ? 0.5 : result === "resign" ? 0 :
          ((result === "white") === (humanSide === 1) ? 1 : 0);
  var clean = !assist.takebacks && !assist.hints;
  /* read back first: another tab may have played a game since this one loaded */
  rating = Rating.load(lsGet);
  var out = Rating.update(rating, { level: skill, result: s, accuracy: null, at: Date.now(),
                                    assisted: { takebacks: assist.takebacks, hints: assist.hints } });
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
  for (var i = 0; i < G.played.length; i++) if ((i % 2 === 0 ? 1 : -1) === humanSide) out.push(i);
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
      var pre = Chess.create();
      for (var k = 0; k < ply; k++) Chess.play(pre, G.played[k].m);
      var want = G.played[ply].m, mine = null, list = Chess.moves(pre);
      for (var j = 0; j < list.length; j++) {
        if (list[j].from === want.from && list[j].to === want.to && (list[j].promo || 0) === (want.promo || 0)) { mine = list[j]; break; }
      }
      if (!mine) { i++; next(); return; }
      /* the accuracy table was fitted with a reviewer of this depth */
      Brain.review(pre, mine, { ms: 900, maxDepth: Rating.REVIEW_DEPTH, depth: Rating.REVIEW_DEPTH }).then(function (res) {
        if (ticket !== gameTicket) { resolve(null); return; }
        if (res) { reviewMemo[ply] = { best: res.bestScore, played: res.playedScore }; got.push({ ply: ply, best: res.bestScore, played: res.playedScore }); }
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
    if (((+k) % 2 === 0 ? 1 : -1) !== humanSide) return;
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
  if (!el || (live && !live())) return;
  el.classList.add("on", "pop");
  sting("lesson-right");                 /* each star lands with the ding of a right answer */
  if (FX) Fx.sparkle(el, { count: 18 });
}
function renderEndRating(rs, cardAt) {
  var box = $("endRate"), myGame = gameTicket;
  /* what is earned is kept whatever happens; what is shown and heard
     only happens while this game's card is the one on screen */
  var live = function () { return myGame === gameTicket && !$("ovEnd").classList.contains("hide"); };
  box.classList.toggle("hide", !rs);
  $("endNext").classList.add("hide");
  $("endMile").classList.add("hide");
  if (!rs) return;
  var out = rs.out, before = Math.round(out.before), after = Math.round(out.after);
  $("endRateNum").textContent = before;
  var dEl = $("endRateDelta");
  dEl.className = "erDelta " + (after > before ? "up" : after < before ? "down" : "flat");
  dEl.textContent = fmtDelta(after - before) + (out.provisional ? " ?" : "");
  var t = Rating.title(after);
  $("endRateTitle").textContent = t.emoji + " " + t.name + (out.provisional ? " · still finding your level" : "") +
    (out.weight < 1 ? " · counted as " + Math.round(out.weight * 100) + "% of a game (hints or take-backs)" : "");
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
    $("endNextSub").textContent = "You beat " + SKILLS[rs.level].name + " — the next coach up is waiting.";
    $("endNext").onclick = function () { $("ovEnd").classList.add("hide"); startCoachGame(up.id, "a", clockStrOf()); };
    $("endNext").classList.remove("hide");
  } else if (rs.s === 0 && down && SKILLS[rs.level].elo - me > 220) {
    $("endNextTx").textContent = "Try " + down.emoji + " " + down.name + " · " + down.elo;
    $("endNextSub").textContent = "A step down the ladder is how everyone climbs it.";
    $("endNext").onclick = function () { $("ovEnd").classList.add("hide"); startCoachGame(down.id, "a", clockStrOf()); };
    $("endNext").classList.remove("hide");
  }

  /* the choreography, once the card is up */
  var startAt = REDUCED ? 120 : (cardAt || 1100) + 450;
  setTimeout(function () {
    if (!over || $("ovEnd").classList.contains("hide")) { $("endRateNum").textContent = after; dEl.classList.add("show"); return; }
    countUp($("endRateNum"), before, after, Math.min(1600, 500 + Math.abs(after - before) * 14), function (k, n) {
      if (prefs.sound && typeof Sound !== "undefined" && Sound.countTick && live()) Sound.countTick(k, n, after >= before);
    }).then(function () {
      dEl.classList.add("show");
      if (live()) sting(after > before ? "rating-up" : after < before ? "rating-down" : "tap");
      rs.newStars.forEach(function (si, k) { setTimeout(function () { popStar(si, live); }, 380 + k * 420); });
      var mile = out.milestone, up2 = out.levelUp && Rating.levelById(out.next);
      if (mile || up2) {
        setTimeout(function () {
          if (!live()) return;
          var m = $("endMile"), was = out.levelUp && Rating.levelById(out.levelUp);
          m.textContent = mile ? (mile.emoji || "🏅") + " " + (mile.kind === "settled" ? "Your rating has settled" :
                                  mile.kind === "best" ? "A new personal best" : "You're now: " + mile.name) +
                                  " — " + Math.round(mile.rating || after)
                               : "🌱 You've outgrown " + was.emoji + " " + was.name + " — " + up2.emoji + " " + up2.name + " is next.";
          m.classList.remove("hide");
          sting(mile ? "milestone" : "levelup");
          if (FX) { Fx.confetti({ ms: 3200, layer: "page" }); Fx.fireworks({ count: 2, layer: "page" }); }
        }, 500 + rs.newStars.length * 420);
      }
    });
  }, startAt);

  /* and the look-back, alongside */
  analyseGame(function (k, n) {
    $("endAccBar").style.width = Math.round(k / Math.max(1, n) * 100) + "%";
    $("endAccTx").textContent = "Looking back over your moves… " + k + "/" + n;
  }).then(function (moves) {
    if (!moves || myGame !== gameTicket) return;
    if (!moves.length) { $("endAccTx").textContent = "No moves of yours to look back on."; $("endAccBar").style.width = "0%"; return; }
    var acc = Rating.gameAccuracy(moves);
    var c = qualityCounts(moves);
    if (acc == null) {
      /* a handful of moves is not a game's worth of evidence: say so,
         and still say what the moves were */
      $("endAccTx").textContent = "Too short to measure — accuracy needs " + (Rating.ACCURACY_MIN_MOVES || 8) + " moves of your own after the opening.";
      $("endAccBar").style.width = "0%";
      $("endCounts").innerHTML = countChips(c);
      return;
    }
    /* taking what is handed to you is the best move and an easy one, so a
       game's estimate is held within reach of the coach it was against */
    var perf = Math.min(Rating.perfFromAccuracy(acc), SKILLS[rs.level].elo + (Rating.PERF_ABOVE || 400));
    rememberAccuracy(acc, perf);
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
        setTimeout(function () { popStar(2, live); }, 700);
      }
    }, REDUCED ? 0 : Math.max(0, startAt + 1700 - 0));
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
  if (Rating.annotateLast) rating = Rating.annotateLast(rating, { acc: acc, perf: perf });
  else {
    var h = rating.history;
    if (h && h.length) { h[h.length - 1].acc = acc; h[h.length - 1].perf = perf; }
  }
  Rating.save(rating, lsSet);
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
    : "Next up: " + L.emoji + " " + L.name + " · " + L.elo + " — a fair fight for you.";
  /* the ladder strip */
  var lad = $("mLadder");
  lad.innerHTML = "";
  var total = 0;
  Rating.LEVELS.forEach(function (Lv) {
    var b = document.createElement("button"), r = ladder.rungs[Lv.id], n = starCount(Lv.id);
    total += n;
    b.className = "rung" + (Lv.id === nl ? " next" : "") + (r && r.stars[0] ? " done" : "");
    b.setAttribute("role", "listitem");
    b.setAttribute("aria-label", "Play " + Lv.name + ", rated " + Lv.elo + ", " + n + " of 3 stars");
    b.innerHTML = '<span class="rgE">' + Lv.emoji + "</span><b>" + escHtml(Lv.name) + '</b><span class="rgElo">' + Lv.elo +
      '</span><span class="rgStars">' + starsHTML(Lv.id) + "</span>" +
      (Lv.id === nl ? '<span class="rgTag">next</span>' : (n === 3 ? '<span class="rgTag">mastered</span>' : ""));
    b.addEventListener("click", function () { quickPlay(Lv.id); });
    lad.appendChild(b);
  });
  $("mLadderNote").textContent = total ? total + " of " + Rating.LEVELS.length * 3 + " stars — tap a coach to play it"
                                       : "Beat each coach to earn its stars — tap one to play it";
  /* bring the coach you're up against next into view */
  var nx = lad.querySelector(".rung.next");
  if (nx) lad.scrollLeft = Math.max(0, nx.offsetLeft - 8 - (lad.clientWidth - nx.offsetWidth) / 3);
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
    var b = document.createElement("button");
    b.className = "rungRow";
    b.innerHTML = '<span class="rgE">' + L.emoji + '</span><span class="rgT"><b>' + escHtml(L.name) + "</b><small>" +
      (r.w + r.d + r.l ? r.w + " won · " + r.d + " drawn · " + r.l + " lost" : escHtml(SKILLS[L.id].short)) + '</small></span><span class="rgElo">' + L.elo +
      '</span><span class="rgStars">' + starsHTML(L.id) + "</span>";
    b.addEventListener("click", function () { quickPlay(L.id); });
    list.appendChild(b);
  });
  $("ovProfile").classList.remove("hide");
}

/* ===== game start / end ===== */
function startGame(newMode, opts) {
  brainTicket++; gameTicket++;   /* every search still running is now stale */
  opts = opts || {};
  stopTour();
  lesson = null; lessonDone = false; lessonQueue = [];
  teachSeen = {}; teachCool = 0; taughtAt = [];
  clearNotes(); showPanelTab("moves");
  oddsSpent = { 1: 0, "-1": 0 }; oddsNudged = 0; oddsLastNudge = -99;
  assist = { takebacks: 0, hints: 0 }; ratedDone = false; reviewMemo = {}; lastEval = 0;
  $("lessonBar").classList.add("hide"); document.body.classList.remove("lesson-on"); reflow();
  mode = newMode;
  G = Chess.create();
  over = null;
  closePromo();
  clearTimeout(coachTimer); thinking = false; hintPending = false; hintShown = null;
  hideToast(); clearLines();
  if (R && R.resetView) R.resetView();
  clearSel(); hintArrow = null; viewPly = -1; lastNarratedOpening = ""; thinking = false;
  showViewBanner(false);
  hideOpeningCard();
  humanSide = opts.humanSide || 1;
  skill = skillOk(opts.skill || skill);
  clockConfig(opts.clockStr || "none");
  orientation = (mode === "coach") ? humanSide : (mode === "lan" ? lanSide : 1);
  R.setOrientation(orientation);
  if (FX) Fx.clear();
  fxDown = null;
  R.setPosition(G.board, { flourish: true });
  sndArrival(!!opts.fresh);
  syncAll();
  hideAllOverlays();
  saveGame();
  watchNetChip(mode === "lan" && Net.everLinked);
  if (mode === "coach" && G.turn !== humanSide) scheduleCoach();
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
  var cardAt = REDUCED ? 100 : (reason === "checkmate" ? 1700 : 1100);
  renderEndRating(mode === "coach" ? settleRating(result) : null, cardAt);
  renderOddsReview();
  /* the card waits its turn: if something else was opened in the
     meantime, the Result chip offers it instead of stacking on top */
  setTimeout(function () {
    if (!over) return;
    if (document.querySelector(".ov:not(.hide)") || studioOpen) { syncTurnStrip(); return; }
    $("ovEnd").classList.remove("hide");
    syncTurnStrip();
    /* the room celebrates with you — and for two people on one board, a
       decisive result is everyone's */
    if (FX && result !== "draw" && (iWon || mySide === 0)) {
      Fx.confetti({ ms: iWon ? 2800 : 1800, layer: "page" });
      if (iWon) Fx.fireworks({ count: reason === "checkmate" ? 3 : 2, layer: "page" });
    }
  }, cardAt);
  lsDel(SAVE_KEY);
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
  if (mode === "coach") startCoachGame(skill, humanSide === 1 ? "b" : "w", clockStrOf());
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
    humanSide: humanSide, skill: skill,
    /* the odds ledger is part of the game's story, so it survives a reload */
    odds: [oddsSpent[1], oddsSpent[-1], oddsNudged],
    /* and so is the help taken, or a reload would wash a rated game clean */
    assist: [assist.takebacks, assist.hints],
    /* and the coach's reviews so far, so a reload doesn't throw away the
       look-back's work — or the abandonment rule's sense of the position */
    rv: mode === "coach" ? Object.keys(reviewMemo).map(function (k) { return [+k, reviewMemo[k].best, reviewMemo[k].played]; }) : [],
    ev: lastEval
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
    my: lanMy, opp: lanOpp, title: Room.title || "", at: Date.now()
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
  startGame(s.mode, { humanSide: s.humanSide, skill: s.skill, clockStr: s.clockStr });
  var g = G;
  for (var i = 0; i < s.sans.length; i++) {
    var m = Chess.fromSAN(g, s.sans[i]);
    if (!m) break;
    Chess.play(g, m);
  }
  if (clock.on) { clock.w = s.wMs; clock.b = s.bMs; clock.run = g.played.length >= 2 ? g.turn : 0; clock.lastT = performance.now(); }
  if (s.odds) { oddsSpent[1] = s.odds[0] || 0; oddsSpent[-1] = s.odds[1] || 0; oddsNudged = s.odds[2] || 0; }
  if (Array.isArray(s.assist)) assist = { takebacks: Math.max(0, s.assist[0] | 0), hints: Math.max(0, s.assist[1] | 0) };
  if (Array.isArray(s.rv)) s.rv.forEach(function (t) {
    if (Array.isArray(t) && typeof t[0] === "number" && t[0] < g.played.length && typeof t[1] === "number" && typeof t[2] === "number")
      reviewMemo[t[0]] = { best: t[1], played: t[2] };
  });
  if (typeof s.ev === "number" && isFinite(s.ev)) lastEval = s.ev;
  R.setPosition(G.board);
  syncAll();
  narrateOpening("", "resume");   /* the card belongs to the position, not the last move */
  saveGame();      /* startGame wrote an empty save; restore the real one */
  var st = Chess.status(G);
  if (st.over) { endGame(st.result, st.reason); return; }
  if (mode === "coach" && G.turn !== humanSide) scheduleCoach();
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
                 wMs: lanCfg.wMs, bMs: lanCfg.bMs });
      beginLan(lanCfg.mySide, lanCfg.clockStr, lanCfg.sans || [], lanCfg.wMs, lanCfg.bMs);
      celebrateLink();
    } else {
      /* the joiner waits for the host's greeting: it carries their name
         and which seat we're in, so the celebration can show both */
      Net.send({ t: "hi2", name: lanMy || "Friend" });
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
    if (mode !== "lan") return;
    if (Net.isHost) {
      if (over) return;
      Net.resync({ sans: G.played.map(function (r) { return r.san; }),
                   clock: clockStrOf(), wMs: Math.round(clock.w), bMs: Math.round(clock.b),
                   yourSide: -lanSide, name: lanMy || "Host" });
    } else {
      Net.send({ t: "hi2", name: lanMy || "Friend" });
    }
    toast("📡 Back together — the board is exactly as you left it.");
  };
  Net.onResync = function (msg) {
    var wasLan = (mode === "lan");
    lanOpp = String(msg.name || lanOpp || "Friend").slice(0, 18);
    beginLan(msg.yourSide === 1 ? 1 : -1, msg.clock, msg.sans || [], msg.wMs, msg.bMs);
    if (!wasLan) celebrateLink();
    syncAll();
    saveLan();
  };
  Net.onMessage = function (msg) {
    switch (msg.t) {
      case "hi":
        lanOpp = String(msg.name || "Friend").slice(0, 18);
        if (!Net.isHost) {
          beginLan(msg.yourSide === 1 ? 1 : -1, msg.clock, msg.sans || [], msg.wMs, msg.bMs);
          celebrateLink();
        }
        syncBars(); syncTurnStrip();
        break;
      case "hi2":
        lanOpp = String(msg.name || "Friend").slice(0, 18);
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
  startGame("lan", { clockStr: clockStr || "none" });
  if (sans && sans.length) {
    for (var i = 0; i < sans.length; i++) {
      var m = Chess.fromSAN(G, sans[i]);
      if (!m) break;
      Chess.play(G, m);
    }
    R.setPosition(G.board);
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
  over = null;
  clearSel(); hintArrow = null; viewPly = -1;
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
    Net.roomOpen({ host: lanMy || "Host", name: (lanMy ? lanMy + "'s board" : "A chess board") })
      .then(function (r) {
        if (!r) { hostByHandshake(); return; }
        $("roomCode").textContent = r.code;
        $("roomCode").classList.remove("pending");
        roomWait("waiting for them to type it…", true);
        $("roomHow").innerHTML = "Read these four letters to your friend. On their device: <b>Play together</b> → <b>Join a board</b>.";
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
      ? "On their device: <b>Play together</b> → <b>Join a board</b> → <b>Codes &amp; QR</b>, then point their camera at this code."
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
      roomPanel("join");
      $("roomIn").value = Room.tidy(prefill);
      joinByCode(prefill);
      return;
    }
    linkStage({ step: 1, showCode: false, title: "Joining…", how: "Reading their invite." });
    feedCode(prefill);
    return;
  }
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
      box.innerHTML = '<div class="roomEmpty">No boards waiting yet — when your friend taps <b>Start a board</b>, theirs appears here.</div>';
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
  $("linkedSub").textContent = "Two devices, one board — " + (meWhite ? "you open." : "they open.");
}
function celebrateLink() {
  stopScan();
  hideAllOverlays();
  snd("link");
  $("linkedTitle").textContent = "You're linked!";
  renderSeats();
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
  clearTimeout(coachTimer); thinking = false; hintPending = false;
  closePromo(); hideToast(); clearLines();
  clearNotes(); showPanelTab("moves");
  if (R && R.resetView) R.resetView();
}
function startTour(line) {
  stopTour();
  quietBoard();
  mode = "tour";
  G = Chess.create();
  over = null; clearSel(); hintArrow = null; viewPly = -1;
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
  assist = { takebacks: 0, hints: 0 }; ratedDone = false; reviewMemo = {}; lastEval = 0;
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
  if (pick.squares && pick.squares.length) {
    R.setNet(pick.concept === "backRank" ? [] : []);
    showLines([{ from: pick.squares[0], to: pick.squares[Math.min(1, pick.squares.length - 1)],
                 kind: pick.concept === "hanging" ? "threat" : "ghost" }], 5200);
  }
  toast("🫱 " + pick.text + " <i>(free — you're behind)</i>", null, 7000);
}

/* ---- the lines on the board ---- */
var lineTimer = 0;
function showLines(list, ms) {
  if (R.setLines) R.setLines(list);
  if (R2 && R2.setLines) R2.setLines(list);
  if (R3 && R3.setLines) R3.setLines(list);
  clearTimeout(lineTimer);
  needFrame();
  if (ms) lineTimer = setTimeout(clearLines, ms);
}
function clearLines() {
  clearTimeout(lineTimer);
  if (R2 && R2.setLines) { R2.setLines([]); R2.setNet([]); }
  if (R3 && R3.setLines) { R3.setLines([]); R3.setNet([]); }
  needFrame();
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
    if (item.squares && item.squares.length >= 2) {
      hintArrow = [item.squares[0], item.squares[1]];
      syncBoard();
      setTimeout(function () { hintArrow = null; syncBoard(); }, 4200);
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
    if (major && voice() === "plain") toast("\ud83d\udc41 " + item.text, null, 7000);
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
  tempo: "tempo", overload: "overloaded defender"
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
  $("ovAcademy").classList.remove("hide");
}
function renderAcademy() {
  var p = Learn.load(), st = Learn.stats(p);
  $("aSolved").textContent = st.solved + "/" + st.total;
  $("aDue").textContent = st.due;
  $("aStreak").textContent = st.streak;
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
  clearSel(); hintArrow = null; viewPly = -1;
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
  var m = Chess.fromSAN(G, lesson.best);
  lessonUI('<div class="lkick">Watch first</div>' +
    '<div class="lask">' + esc(lesson.title) + '</div>' +
    '<div class="lsay">Here it is once, so you know what you\'re looking for. Then it\'s yours.</div>');
  setTimeout(function () {
    if (mode !== "lesson" || !m) return;
    var desc = animDescriptor(m);
    var g2 = Chess.create(lesson.fen);
    Chess.play(g2, m);
    var wPlan = R.animateMove(desc, g2.board, { scale: 1.8, glow: true }, function () {
      lessonUI('<div class="lkick">Watch first</div>' +
        '<div class="lask">' + esc(lesson.best) + '</div>' +
        '<div class="lsay">' + lesson.why + '</div>');
      lessonRow([lessonChip("Now let me try →", function () {
        G = Chess.create(lesson.fen);
        R.setPosition(G.board);
        lessonPaused = false;
        clearSel(); syncAll(); askLesson();
      }, true)]);
    });
    sndMove(desc, wPlan, m.capt);
    needFrame();
  }, REDUCED ? 200 : 1500);
}

function askLesson() {
  var side = lesson.side === 1 ? "White" : "Black";
  lessonUI('<div class="lkick">' + esc(chapterName(lesson.chapter)) + " · you are " + side + '</div>' +
    '<div class="lask">' + esc(lesson.ask) + '</div>' +
    (lessonTries ? '<div class="lsay">Have another go — the board is small enough to see all of it.</div>' : ''));
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
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

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
  if (m) { hintArrow = [m.from, m.to]; syncBoard(); }
  lessonUI('<div class="lkick">The answer</div><div class="lask">' + esc(lesson.best) + '</div>' +
    '<div class="lsay">' + lesson.why + '</div>');
  lessonRow([lessonChip("Let me play it", function () {
    hintArrow = null; syncBoard(); askLesson();
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
  hintArrow = null;

  if (verdict.ok) {
    lessonDone = true;
    var okPlan = R.animateMove(desc, g2.board, { scale: 1.0 }, function () {
      G = g2;
      syncBoard();
      celebrateLesson(verdict);
    });
    sndMove(desc, okPlan, m.capt);
    needFrame();
    return;
  }

  /* wrong: play it anyway so they *see* the consequence, then rewind */
  lessonTries++;
  lessonPaused = true;            /* the board shows the wrong move until it is taken back */
  var say = Learn.critique(lesson, G, m);
  var tryPlan = R.animateMove(desc, g2.board, { scale: 0.8 }, function () {
    snd("lesson-wrong");
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
  needFrame();
}

function celebrateLesson(verdict) {
  snd("lesson-right");
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
    var b = document.createElement("button");
    b.className = "stPick" + (skin.pieces.set === s.id ? " sel" : "");
    b.textContent = s.name;
    b.addEventListener("click", function () {
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
        if (lv.id === "auto") R3.setFx(R3.autoFx());
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
    (R3 && prefs.fx === "auto" ? " — running " + R3.fx() : "");

  var pats = $("stPatterns");
  pats.innerHTML = "";
  Object.keys(Skins.PATTERNS).forEach(function (id) {
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

/* ===== overlays & menus ===== */
function hideAllOverlays() {
  ["ovMenu", "ovNew", "ovLink", "ovLinked", "ovEnd", "ovSettings", "ovLearn", "ovOpenings", "ovAbout", "ovAcademy", "ovProfile"].forEach(function (id) {
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
  $("lessonBar").classList.add("hide"); document.body.classList.remove("lesson-on"); reflow();
  hideAllOverlays();
  var lp = Learn.stats(Learn.load());
  $("mAcademySub").textContent = lp.solved
    ? "Learned " + lp.solved + " of " + lp.total + (lp.due ? " · " + lp.due + " due" : "")
    : "Short positions, real feedback.";
  renderLobby();
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
  Array.prototype.forEach.call($("clockChips").children, function (c) {
    c.classList.toggle("sel", c.getAttribute("data-clock") === newCardCtx.clockStr);
  });
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
    b.className = "rungRow" + (L.id === selId ? " sel" : "");
    b.setAttribute("data-skill", L.id);
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", L.id === selId ? "true" : "false");
    b.innerHTML = '<span class="rgE">' + L.emoji + '</span><span class="rgT"><b>' + escHtml(L.name) + "</b>" +
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
function wireInput() {
  var stage = $("stage");
  var pts = new Map(), downSq = -1, downXY = null, dragging = false, pinchD = 0;
  stage.addEventListener("pointerdown", function (e) {
    /* anything you can press that happens to sit on the stage — a lesson's
       buttons, the clock, a question — is not the board. Capturing the
       pointer for those used to swallow every mouse click on them. */
    if (e.target.closest(".clock, #toast, #lessonBar, #netChip, #resultChip, button, a")) return;
    /* a remark lying over the board goes as soon as the board is
       touched; the notebook has kept it */
    if (!$("toast").classList.contains("acts")) hideToast();
    /* the first touch is the gesture a browser wants before it will
       start an audio clock at all. A synth that cannot start is a
       silent board, never a board that ignores the tap. */
    if (prefs.sound && typeof Sound !== "undefined") { try { Sound.wake(); } catch (err) {} }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      downXY = { x: e.clientX, y: e.clientY };
      dragging = false;
      var rect = stage.getBoundingClientRect();
      downSq = R.screenToSquare(e.clientX - rect.left, e.clientY - rect.top);
    } else if (pts.size === 2) {
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
    if (!downXY) return;
    var dx = e.clientX - downXY.x, dy = e.clientY - downXY.y;
    if (!dragging && Math.hypot(dx, dy) > 9) dragging = true;
    if (dragging && R.orbit) {
      R.orbit(e.clientX - prev.x, e.clientY - prev.y);
      needFrame();
    }
  });
  function up(e) {
    pts.delete(e.pointerId);
    if (pts.size > 0) return;
    if (!dragging && downSq >= 0) tapSquare(downSq);
    downSq = -1; downXY = null; dragging = false; pinchD = 0;
  }
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
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
  var canUndo = !!G && G.played.length > 0 && mode !== "tour" && mode !== "lesson" &&
    (!over || (mode === "pass" && !/out of time/.test(over.reason))) && (mode !== "coach" || humanMovesMade() > 0);
  $("btnUndo").toggleAttribute("disabled", !canUndo);
  $("btnHint").toggleAttribute("disabled", !G || !!over || mode === "tour" || hintPending);
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
}

/* ===== settings ===== */
function syncSettingsUI() {
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
  $("setSound").classList.toggle("sel", prefs.sound);
  $("setSound").textContent = prefs.sound ? "On" : "Off";
  $("setHelpers").classList.toggle("sel", prefs.helpers);
  $("setHelpers").textContent = prefs.helpers ? "On" : "Off";
  $("ckSimple").classList.toggle("sel", prefs.clockSkin === "simple");
  $("ckClassic").classList.toggle("sel", prefs.clockSkin === "classic");
  document.body.classList.toggle("clock-classic", prefs.clockSkin === "classic");
}

/* the two ways a configured game begins, shared by the menu and the
   New game button */
function passBegin(o) { leaveGameThen(function () { startGame("pass", { clockStr: o.clockStr, fresh: true }); }); }
function coachBegin(o) { leaveGameThen(function () { startCoachGame(o.skill, o.side, o.clockStr); }); }
/* New game, from the board. Starting over is one tap; it only asks first
   when there is something to lose — moves on the board, or a rated game
   that is properly under way. */
function newGameButton() {
  if (!G || !mode || mode === "tour" || mode === "lesson" || mode === "lan") { showMenu(); return; }
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
  $("btnReplay").addEventListener("click", replayLast);
  $("btnFlip").addEventListener("click", function () {
    orientation = -orientation;
    R.setOrientation(orientation);
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
  $("mPass").addEventListener("click", function () { openNewCard("pass", passBegin); });
  $("mCoach").addEventListener("click", function () { openNewCard("coach", coachBegin); });
  $("mPlay").addEventListener("click", function () { quickPlay(); });
  $("mRating").addEventListener("click", showProfile);
  $("pfBack").addEventListener("click", showMenu);
  $("btnNew").addEventListener("click", newGameButton);
  $("mLan").addEventListener("click", openLink);
  $("mOpenings").addEventListener("click", showOpenings);
  $("mLearn").addEventListener("click", function () { showLearn(0); });
  $("mAcademy").addEventListener("click", openAcademy);
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
  wireChips("clockChips", "clock", function (v) { if (newCardCtx) newCardCtx.clockStr = v; });
  wireChips("flipChips", "flip", function (v) { prefs.autoFlip = v === "1"; savePrefs(); });
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
  ["ovNew", "ovSettings", "ovAbout", "ovProfile", "ovAcademy", "ovLearn", "ovOpenings"].forEach(function (id) {
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
      var open = ["ovNew", "ovSettings", "ovAbout", "ovProfile", "ovAcademy", "ovLearn", "ovOpenings"].filter(function (id) { return !$(id).classList.contains("hide"); });
      if (open.length) { showMenu(); return; }
      if (!$("ovMenu").classList.contains("hide") && G && mode) { hideAllOverlays(); return; }
      if (viewPly >= 0) exitView();
      return;
    }
    if (!G || !G.played.length || document.querySelector(".ov:not(.hide)")) return;
    var at = viewPly >= 0 ? viewPly : G.played.length - 1;
    if (e.key === "ArrowLeft") { viewAt(Math.max(0, at - 1)); e.preventDefault(); }
    else if (e.key === "ArrowRight") { if (viewPly >= 0) { if (at + 1 >= G.played.length - 1) exitView(); else viewAt(at + 1); } e.preventDefault(); }
    else if (e.key === "Home") { viewAt(0); e.preventDefault(); }
    else if (e.key === "End") { if (viewPly >= 0) exitView(); e.preventDefault(); }
  });
  $("resultChip").addEventListener("click", function () { if (over) { exitView(); $("ovEnd").classList.remove("hide"); } });

  /* end card */
  $("endRematch").addEventListener("click", rematch);
  $("endReview").addEventListener("click", function () {
    $("ovEnd").classList.add("hide");
    var down = fxDown;
    fxCalm(); fxDown = down;      /* the light goes; the fallen king comes back with the final position */
    if (G && G.played.length) viewAt(0);
    syncTurnStrip();
    toast("Tap moves in the list to step through (or use ← →). 🏁 Result brings the card back.");
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
  });
  $("setHelpers").addEventListener("click", function () { prefs.helpers = !prefs.helpers; savePrefs(); syncSettingsUI(); syncBoard(); });
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
    share(Net.url(code));
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
  /* a fresh start forgets everything the room ever wrote — the game, the
     settings, the Academy, the score — because any one of them, damaged,
     is enough to strand it, and a recovery card that cannot recover is
     worse than none */
  $("recFresh").addEventListener("click", function () {
    try { Object.keys(localStorage).forEach(function (k) { if (/^chessroom_/.test(k)) lsDel(k); }); } catch (e) {}
    lsDel(SAVE_KEY); lsDel(PREF_KEY);
    location.hash = ""; location.reload();
  });

  window.addEventListener("resize", function () {
    if (R2) R2.resize();
    if (R3) R3.resize();
    needFrame();
  });
  /* a tab coming back from the background repaints and re-arms the clock */
  /* Away from the tab: in a game on this device that is a pause, like the
     menu. In a game between two devices it is time spent thinking — the
     other person waited through it — so it is charged when you return. */
  var hiddenAt = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { hiddenAt = performance.now(); return; }
    if (document.visibilityState === "visible") {
      if (mode === "lan" && clock.on && clock.run && !over && hiddenAt) {
        var away = performance.now() - hiddenAt;
        if (clock.run === 1) clock.w -= away; else clock.b -= away;
      }
      hiddenAt = 0;
      clock.lastT = performance.now();
      if (R) { R.dirty = true; }
      needFrame();
    }
  });
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
    var j = location.hash.match(JOIN_HASH);
    if (j) {
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
function boot() {
  /* the first tap anywhere — not only on the board — is the gesture a
     browser wants before it will start an audio clock, and lets the
     room's reverb grow at idle before the first sting needs it */
  document.addEventListener("pointerdown", function () {
    if (prefs.sound && typeof Sound !== "undefined") { try { Sound.wake(); } catch (e) {} }
  }, { capture: true, passive: true });
  if (typeof Sound !== "undefined" && Sound.setReduced) Sound.setReduced(REDUCED);
  /* who this room is, as far as the shared front door is concerned */
  Room.configure({ game: "chess", seats: 2, label: "board" });
  wireUI();
  lanHandlers();
  initRenderers();
  fxInit();
  applySkin(skin, false);
  wireInput();
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

  /* arriving by invite link? straight into the join flow */
  var joinM = location.hash.match(JOIN_HASH);
  setTimeout(function () {
    $("splash").classList.add("gone");
    if (joinM) {
      history.replaceState(null, "", location.pathname);
      openLink();
      joinFlow(joinM[1]);
    } else {
      showMenu();
    }
  }, REDUCED ? 150 : 900);
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
  feedCode: feedCode, openLink: openLink,   /* the join flow's one door, for tests */
  Room: Room, joinByCode: joinByCode, hostFlow: hostFlow, joinFlow: joinFlow,
  get health() { return Net.health(); }, get lanSave() { return loadLan(); },
  rejoinLan: rejoinLan, syncNetChip: syncNetChip };
})();
