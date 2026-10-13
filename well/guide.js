/* guide.js — every move, taught on the well itself, for the hands in use.

   A falling-blocks game has seven or eight moves, and a person who never
   finds one of them plays a slower, harder game without knowing why. The
   usual answers are a slideshow before the first game, read once and
   forgotten, or a tip that interrupts play. This file does neither. It
   teaches on the real well, with the real piece, by doing: gravity is held
   while a move is shown, and a step is over when the move has been made,
   by whichever hand made it. Nothing has to be read twice, because nothing
   moves on until the hands have it.

   ## Four kinds of hands

   The same move is a flick on glass, a key on the tray under a thumb, a
   key on a keyboard and a button on a controller, and words for the wrong
   hands teach nothing. The hands are read from the last move the engine
   accepted (input.js says where each one came from), and before any move
   from what the device has. Key names come from the player's own
   bindings, so a player who moved Drop to Enter is told Enter. A
   controller's buttons are named by its own glyphs when we can tell its
   family from its id, and by position — the bottom button, the right
   button — when we can't, because a brand name in a game's interface is
   an advertisement.

   ## Counting, not watching

   What it notices is small and stays on the device: for each kind of
   hands and each move, how many pieces have been placed since the move
   was last used, and in how many runs it was used at all. Counts, capped,
   with no timestamps and nothing about any one run. That is enough to see
   that thirty pieces have gone by without a single drop, and too little
   to know anything else. Steady counts nothing.

   ## When it speaks

   Never during Steady, never in a lesson (the lesson is already
   teaching), and never while a piece is falling unless the guide is the
   one holding gravity. A move to try is offered only at a boundary the
   player chose — the pause sheet they opened, the run card, a chapter's
   rest — or, for the drop alone, as one quiet line under a depth's name.
   One move a run, in at most three runs ever; "Not now" twice and it is
   never offered again; once the move is the player's own it is never
   offered at all. A switch on the Moves page turns the offers off.

   ## Nothing allocates while playing

   G.action and G.event run for every press and every engine event, and
   G.frame on every frame while a lesson of its own is up, so they work on
   things already in place: the counts live in objects whose every field
   exists from the start, the run's scratch is a typed array, and the page
   is written only when something visible changes — a step done, the piece
   passing under the caption. Words are built when a step begins, which is
   a handful of times a run.

   The words themselves, Guide.text and Guide.decide are pure and load in
   node (tools/guide-check.js reads them); the page is touched only inside
   Guide.create's instance, in the browser.                               */
(function (root) {
"use strict";

var Guide = {};

/* ================================================================
   the moves and the hands
   ================================================================ */
var MOVES = ["move", "turn", "turnBack", "drop", "ease", "keep", "breath", "half"];
var NM = MOVES.length;
var HANDS = ["gestures", "buttons", "keys", "pad"];
var NH = HANDS.length;
/* the offers count the moves, and "hands": a new kind of hands to learn */
var OFFER_IDS = MOVES.concat(["hands"]);
/* the engine's words, and the move each one is */
var ACT_MOVE = { left: 0, right: 0, dasLeft: 0, dasRight: 0, cw: 1, ccw: 2, hard: 3, softOn: 4,
                 hold: 5, breath: 6, "180": 7 };
var M_MOVE = 0, M_TURN = 1, M_BACK = 2, M_DROP = 3, M_EASE = 4, M_KEEP = 5, M_BREATH = 6, M_HALF = 7;
/* which move is offered first, when more than one is waiting */
var PRIORITY = ["drop", "keep", "hands", "turnBack", "breath", "ease", "half"];
var PLAY_MS = 30000;          /* an offer waits for half a minute of play             */
var SPACING = 40;             /* ...and forty pieces since the last offer of anything  */
var SHORT_MAX = 44;           /* a line under a depth's name                           */
/* how many times a step wants the move: first steps, and the practice well */
var NEED_FIRST = { move: 2, turn: 2, drop: 1, keep: 1 };
var NEED_PRACTICE = { move: 4, turn: 3, turnBack: 3, drop: 3, ease: 2, keep: 2, breath: 1, half: 2 };

function moveIx(m) { for (var i = 0; i < NM; i++) if (MOVES[i] === m) return i; return -1; }
function handsIx(h) { for (var i = 0; i < NH; i++) if (HANDS[i] === h) return i; return -1; }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ================================================================
   the notebook (prefs.guide)
   ================================================================
   Rebuilt from whatever arrives, the way prefs.js checks it, but with
   every field present: a count that has never moved is a zero that
   exists, so adding one to it during play changes a number and never
   the shape of an object. Prefs keeps the same thing with the zeros left
   out (compact, below). */
function whole(v, hi, dflt) {
  if (typeof v !== "number" || !isFinite(v)) return dflt;
  v = Math.round(v);
  return v < 0 ? 0 : v > hi ? hi : v;
}
function countsOf(src, ids, hi) {
  var out = {}, s = isObj(src) ? src : {};
  for (var i = 0; i < ids.length; i++) out[ids[i]] = whole(s[ids[i]], hi, 0);
  return out;
}
function perHands(src, hi) {
  var out = {}, s = isObj(src) ? src : {};
  for (var i = 0; i < NH; i++) out[HANDS[i]] = countsOf(s[HANDS[i]], MOVES, hi);
  return out;
}
Guide.repair = function (o) {
  var v = isObj(o) ? o : {}, f = isObj(v.first) ? v.first : {}, first = {};
  for (var i = 0; i < NH; i++) first[HANDS[i]] = whole(f[HANDS[i]], 2, 0);
  return {
    v: 1, tips: typeof v.tips === "boolean" ? v.tips : true, first: first,
    dry: perHands(v.dry, 999), runs: perHands(v.runs, 9), done: perHands(v.done, 1),
    offers: countsOf(v.offers, OFFER_IDS, 9), later: countsOf(v.later, OFFER_IDS, 2),
    since: whole(v.since, 999, 999), sinceRuns: whole(v.sinceRuns, 99, 99)
  };
};
Guide.blank = function () { return Guide.repair(null); };
function compactCounts(src, ids) {
  var out = {};
  for (var i = 0; i < ids.length; i++) if (src[ids[i]] > 0) out[ids[i]] = src[ids[i]];
  return out;
}
function compactHands(src) {
  var out = {};
  for (var i = 0; i < NH; i++) out[HANDS[i]] = compactCounts(src[HANDS[i]], MOVES);
  return out;
}
function compact(st) {
  var first = {};
  for (var i = 0; i < NH; i++) first[HANDS[i]] = st.first[HANDS[i]];
  return {
    v: 1, tips: st.tips, first: first, dry: compactHands(st.dry), runs: compactHands(st.runs),
    done: compactHands(st.done), offers: compactCounts(st.offers, OFFER_IDS),
    later: compactCounts(st.later, OFFER_IDS), since: st.since, sinceRuns: st.sinceRuns
  };
}

/* A move is the player's own once it has been used in three runs on
   these hands, or practised to the end once. A kind of hands is known
   once its first steps were taken or skipped. */
function learned(st, m, h) {
  if (m === "hands") return st.first[h] !== 0;
  return (st.runs[h][m] | 0) >= 3 || (st.done[h][m] | 0) === 1;
}
Guide.learned = function (st, m, h) {
  st = Guide.repair(st);
  return handsIx(h) >= 0 && (m === "hands" || moveIx(m) >= 0) ? learned(st, m, h) : false;
};

/* ================================================================
   deciding: which move, if any, to offer (pure)
   ================================================================
   state: the notebook. ctx: where the offer would appear and what the
   run is — {where, modeId, steady, timed, lesson, silt, practice, playMs,
   userOpened, hasBreath, depth, hands, busy (first steps or a practice
   under way), offered (this run's move, or ""), declined ("Not now" this
   run), cw3 (pieces this run turned clockwise three times and never
   back)}. env: the settings that change what a move is — {keep, modern,
   tap}. Answers a move id, "hands", or null. */
function eligible(st, m, h, ctx, env, again) {
  if (m === "hands") {
    if (st.first[h] !== 0) return false;
    if (!again && st.offers.hands >= 3) return false;
    if (st.later.hands >= 2) return false;
    for (var i = 0; i < NH; i++) if (HANDS[i] !== h && st.first[HANDS[i]] >= 1) return true;
    return false;
  }
  if (moveIx(m) < 0 || learned(st, m, h)) return false;
  /* the run that already offered it counted the offer; it may say it again */
  if (!again && st.offers[m] >= 3) return false;
  if (st.later[m] >= 2) return false;
  var d = st.dry[h][m] | 0;
  switch (m) {
    case "drop": return d >= 30;
    case "keep": return env.keep !== false && d >= 120;
    case "turnBack": return d >= 60 && (ctx.cw3 | 0) >= 4;
    case "breath": return !!ctx.hasBreath && d >= 2;
    case "ease": return d >= 200 && (st.runs[h].drop | 0) >= 1;
    case "half": return !!env.modern && h !== "buttons" && !(h === "gestures" && env.tap === "anywhere") && d >= 150;
  }
  return false;
}
Guide.decide = function (state, ctx, env) {
  if (!ctx) return null;
  var st = state && isObj(state.first) && isObj(state.dry) ? state : Guide.repair(state);
  env = env || {};
  var h = ctx.hands, where = ctx.where, mode = ctx.modeId, playMs = +ctx.playMs || 0;
  if (handsIx(h) < 0 || !st.tips) return null;
  if (ctx.steady || ctx.practice || ctx.busy || ctx.declined) return null;
  var silt = !!ctx.silt || mode === "challenges-silt";
  if (ctx.lesson && !silt) return null;
  if (where === "pause") {
    if (!ctx.userOpened || playMs < PLAY_MS || (mode !== "descent" && mode !== "drift")) return null;
  } else if (where === "run") {
    if (playMs < PLAY_MS || !(mode === "descent" || mode === "drift" || mode === "forty" || mode === "three" || silt)) return null;
  } else if (where === "chapter") {
    if (mode !== "drift") return null;
  } else if (where === "banner") {
    if (mode !== "descent" || !((ctx.depth | 0) >= 2)) return null;
  } else return null;
  /* nothing until some hands have had their first steps (or skipped them):
     a player that new is about to be shown the moves anyway */
  var taught = false;
  for (var i = 0; i < NH; i++) if (st.first[HANDS[i]] >= 1) taught = true;
  if (st.first[h] === 0 && !taught) return null;
  /* one move a run: once offered, only that move, and only while it is
     still waiting to be found */
  var offered = typeof ctx.offered === "string" ? ctx.offered : "";
  if (offered) {
    if (where === "banner" && offered !== "drop") return null;
    return eligible(st, offered, h, ctx, env, true) ? offered : null;
  }
  if (!(st.since >= SPACING && st.sinceRuns >= 1)) return null;
  if (where === "banner") return eligible(st, "drop", h, ctx, env, false) ? "drop" : null;
  for (var p = 0; p < PRIORITY.length; p++) if (eligible(st, PRIORITY[p], h, ctx, env, false)) return PRIORITY[p];
  return null;
};

/* ================================================================
   the words
   ================================================================
   One table, used by the first steps, the offers, the practice well, the
   Moves page and (through Guide.text) the explainer, so none of them can
   say a move differently from the others. Each hands' row is
   [title, line, how]. A row can depend on how taps turn ({sides,
   anywhere}). Tokens in braces are filled from the player's keys, the
   controller's glyphs or the tray's own drawings (fill, below). */
var WORDS = {
  move: { name: "Move", why: "Every column is a slide away.",
    gestures: ["Drag to move", "Slide a finger left or right, anywhere on the well.", "Drag left or right"],
    buttons: ["{tl} {tr} to move", "Press one to step; keep it down and it glides to the wall.", "{tl} {tr}"],
    keys: ["{left} {right} to move", "Press one to step; keep it down and it glides to the wall.", "{left} {right}"],
    pad: ["D-pad to move", "Left and right on the D-pad, or the left stick.", "D-pad or left stick"] },
  turn: { name: "Turn", why: "Turning is how you find where it fits.",
    gestures: ["Tap to turn",
      { sides: "Tap the right side to turn it. The left side turns it back.",
        anywhere: "Tap anywhere to turn it. Two fingers turn it back." },
      { sides: "Tap the right side", anywhere: "Tap anywhere" }],
    buttons: ["{tcw} to turn", "{tccw} turns it back the other way.", "{tcw}"],
    keys: ["{cw} to turn", "{ccw} turns it back the other way.", "{cw}"],
    pad: ["{A} to turn", "{B} turns it back the other way.", "{A}"] },
  turnBack: { name: "Turn it back", why: "Three quarter-turns become one.",
    gestures: ["Turn it back", { sides: "Tap the left side.", anywhere: "Tap with two fingers." },
      { sides: "Tap the left side", anywhere: "Two-finger tap" }],
    buttons: ["{tccw} turns it back", "One press instead of three.", "{tccw}"],
    keys: ["{ccw} turns it back", "One press instead of three.", "{ccw}"],
    pad: ["{B} turns it back", "One press instead of three.", "{B}"] },
  drop: { name: "Drop", why: "It lands straight away, so you don't wait for it to fall.",
    gestures: ["Flick down to drop", "A quick flick, and it lands where the light is. A slow drag eases it down instead.", "Flick down"],
    buttons: ["{thard} to drop", "It lands where the light is. {tsoft} eases it down instead.", "{thard}"],
    keys: ["{hard} to drop", "It lands where the light is. {soft} eases it down instead.", "{hard}"],
    pad: ["D-pad up to drop", "It lands where the light is. D-pad down eases it down instead.", "D-pad up"] },
  ease: { name: "Ease down", why: "Slide it down slowly to tuck it under an edge.",
    gestures: ["Drag down slowly", "The piece follows your finger down.", "Drag down slowly"],
    buttons: ["Press and hold {tsoft}", "It eases down while you keep it pressed.", "Press and hold {tsoft}"],
    keys: ["Press and hold {soft}", "It eases down while the key is down.", "Press and hold {soft}"],
    pad: ["Press and hold D-pad down", "It eases down while you keep it pressed.", "Press and hold D-pad down"] },
  keep: { name: "Keep", why: "Set a piece aside, and swap it back when it fits better.",
    gestures: ["Flick up to keep", "It waits in the niche by the mouth of the well. Tapping the niche works too.", "Flick up, or tap the niche"],
    buttons: ["{tkeep} sets it aside", "It waits in the niche until you want it back.", "{tkeep}"],
    keys: ["{hold} to keep", "It waits in the niche until you want it back.", "{hold}"],
    pad: ["{LB} to keep", "Either shoulder button. It waits in the niche until you want it back.", "{LB}"] },
  breath: { name: "Breath", why: "Gravity and the lock rest for one long breath.",
    gestures: ["Tap Breath", "When the ring is full, gravity rests for one long breath.", "Tap the ring when it is full"],
    buttons: "gestures",
    keys: ["{breath} for Breath", "When the ring is full, gravity rests for one long breath.", "{breath}"],
    pad: ["{LT} for Breath", "When the ring is full, gravity rests for one long breath.", "{LT}"] },
  half: { name: "Half-turn", why: "Turns it all the way round at once.",
    gestures: ["Two-finger tap", "Turns it right round in one go.", "Two-finger tap"],
    buttons: null,
    keys: ["{flip} to turn it round", "Turns it right round in one go.", "{flip}"],
    pad: ["{Y} to turn it round", "Turns it right round in one go.", "{Y}"] },
  pause: { name: "Pause", why: "Everything waits until you come back.",
    gestures: ["The pause button", "The pause button, top right.", "The pause button, top right"],
    buttons: "gestures",
    keys: ["{pause} pauses", "{pause} pauses.", "{pause}"],
    pad: ["{menu} pauses", "{menu} pauses.", "{menu}"] }
};
/* the card that offers a move: a title, then one sentence */
var TIPS = {
  drop: { title: "A quicker way down",
    gestures: "Flick down and the piece drops straight to its light.",
    buttons: "{thard} drops the piece straight to its light.",
    keys: "{hard} drops the piece straight to its light.",
    pad: "D-pad up drops the piece straight to its light." },
  keep: { title: "Save a piece for later",
    gestures: "Flick up, or tap the niche, and it waits there.",
    buttons: "The Keep button sets a piece aside until you want it.",
    keys: "{hold} sets a piece aside until you want it.",
    pad: "{LB} sets a piece aside until you want it." },
  turnBack: { title: "Turning the other way",
    gestures: { sides: "Tap the left side: one tap instead of three.",
                anywhere: "Tap with two fingers: one tap instead of three." },
    buttons: "{tccw} turns it back: one press instead of three.",
    keys: "{ccw} turns it back: one press instead of three.",
    pad: "{B} turns it back: one press instead of three." },
  breath: { title: "Breath is yours",
    gestures: "When the ring is full, tap it, and gravity rests for one long breath.",
    buttons: "When the ring is full, tap it, and gravity rests for one long breath.",
    keys: "When the ring is full, {breath} rests gravity for one long breath.",
    pad: "When the ring is full, {LT} rests gravity for one long breath." },
  ease: { title: "Easing a piece down",
    gestures: "Drag down slowly, and the piece follows your finger.",
    buttons: "Press and hold {tsoft}, and the piece eases down.",
    keys: "Press and hold {soft}, and the piece eases down.",
    pad: "Press and hold D-pad down, and the piece eases down." },
  half: { title: "Turning it right round",
    gestures: "A two-finger tap turns it right round.",
    buttons: null,
    keys: "{flip} turns it right round.",
    pad: "{Y} turns it right round." }
};
var HANDS_TIP = {
  gestures: ["On the glass now?", "A half-minute look at the gestures."],
  buttons: ["Using the button tray?", "A half-minute look at the tray."],
  keys: ["Playing with keys now?", "A half-minute look at the keys."],
  pad: ["Playing with a controller?", "A half-minute look at the buttons."]
};
var HANDS_NAME = { gestures: "Gestures", buttons: "Button tray", keys: "Keyboard", pad: "Controller" };
/* One line under a depth's name, so it has to be short. The second form
   is for a binding whose name is long enough to push the first past it. */
var SHORT = {
  drop: {
    gestures: ["Flick down to drop a piece at once."],
    buttons: ["{thard} drops a piece at once."],
    keys: ["{hard} drops a piece at once.", "{hard} drops it at once."],
    pad: ["D-pad up drops a piece at once."] },
  breath: {
    gestures: ["Breath is ready: tap it and gravity rests."],
    buttons: ["Breath is ready: tap it and gravity rests."],
    keys: ["Breath is ready: {breath} rests gravity.", "Breath is ready: press {breath}."],
    pad: ["Breath is ready: press {LT}."] }
};

/* ---------- the names of keys, buttons and the tray's drawings ---------- */
var KEY_NAMES = {
  ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
  Space: "Space", ShiftLeft: "Shift", ShiftRight: "Shift", ControlLeft: "Ctrl", ControlRight: "Ctrl",
  AltLeft: "Alt", AltRight: "Alt", Escape: "Esc", Enter: "Enter", NumpadEnter: "Enter", Tab: "Tab",
  Backspace: "Backspace", Delete: "Delete", CapsLock: "Caps Lock", Comma: ",", Period: ".",
  Slash: "/", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backquote: "`",
  Minus: "-", Equal: "=", Backslash: "\\", Home: "Home", End: "End", PageUp: "Page Up", PageDown: "Page Down"
};
var KEY_SPOKEN = { ArrowLeft: "left arrow", ArrowRight: "right arrow", ArrowUp: "up arrow", ArrowDown: "down arrow" };
/* the room's default keys, for a page that hands us none */
var DEF_KEYS = {
  left: ["ArrowLeft"], right: ["ArrowRight"], soft: ["ArrowDown"], hard: ["Space"],
  cw: ["ArrowUp", "KeyX"], ccw: ["KeyZ"], flip: ["KeyA"], hold: ["KeyC"], breath: ["KeyB"],
  pause: ["Escape", "KeyP"]
};
/* when a control has no key at all, it is still named */
var KEY_FALLBACK = {
  left: "the left key", right: "the right key", soft: "the ease key", hard: "the drop key",
  cw: "the turn key", ccw: "the turn-back key", flip: "the half-turn key", hold: "the Keep key",
  breath: "the Breath key", pause: "the pause key"
};
function keyName(code) {
  code = String(code || "");
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  var m = /^Key([A-Z])$/.exec(code) || /^Digit([0-9])$/.exec(code);
  if (m) return m[1];
  m = /^Numpad([0-9])$/.exec(code);
  if (m) return "Num " + m[1];
  return code;
}
Guide.keyName = keyName;

/* A controller's family, from its id: shapes, letters, or (for one we
   can't place) where the button is. No brand is ever printed. */
var PAD = {
  ps: { A: "✕", B: "○", Y: "△", LB: "L1", RB: "R1", LT: "L2", menu: "Options" },
  letters: { A: "A", B: "B", Y: "Y", LB: "LB", RB: "RB", LT: "LT", menu: "Menu" },
  words: { A: "the bottom button", B: "the right button", Y: "the top button", LB: "a shoulder button",
           RB: "a shoulder button", LT: "the left trigger", menu: "Menu" }
};
var PAD_SPOKEN = { "✕": "Cross", "○": "Circle", "△": "Triangle" };
function padFamily(id) {
  if (id === "ps" || id === "letters" || id === "words") return id;
  if (typeof id !== "string" || !id) return "words";
  /* letters first: one maker's pads also call themselves a "Wireless Controller" */
  if (/045e|Xbox|XInput/i.test(id)) return "letters";
  if (/054c|DualSense|DUALSHOCK|Wireless Controller/i.test(id)) return "ps";
  return "words";
}
Guide.padFamily = padFamily;

/* The tray's keys are drawn, not lettered, so in a sentence on the page
   they are the same little drawings (input.js's own paths), in a keycap;
   in plain text they are the nearest arrows; read aloud, their names. */
var TRAY = {
  tl: ["◀", "the left arrow", '<path d="M14.5 5.5 8 12l6.5 6.5"/>'],
  tr: ["▶", "the right arrow", '<path d="M9.5 5.5 16 12l-6.5 6.5"/>'],
  tsoft: ["▼", "the down arrow", '<path d="M6 9.5l6 6 6-6"/>'],
  thard: ["⤓", "the drop button", '<path d="M12 3.5v11.5M7 10.5l5 5 5-5M5 20.5h14"/>'],
  tcw: ["↻", "the turn button", '<path d="M19.5 9.3A8 8 0 1 1 10.9 4.1"/><path d="M15.6 3.4 10.2 1 11 7.2Z" fill="currentColor" stroke-width="1.4"/>'],
  tccw: ["↺", "the turn-back button", '<g transform="translate(24 0) scale(-1 1)"><path d="M19.5 9.3A8 8 0 1 1 10.9 4.1"/><path d="M15.6 3.4 10.2 1 11 7.2Z" fill="currentColor" stroke-width="1.4"/></g>'],
  tkeep: ["Keep", "the Keep button", null]
};
function kbd(text) { return '<kbd class="kc">' + esc(text) + "</kbd>"; }
function trayKbd(name) {
  var t = TRAY[name];
  if (!t[2]) return kbd(t[0]);
  return '<kbd class="kc gd-tk"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + t[2] +
    '</svg><span class="gd-vh">' + esc(t[1]) + "</span></kbd>";
}

/* mode: 0 plain text, 1 HTML (keycaps), 2 words to be read aloud */
function token(name, env, mode) {
  var i;
  if (KEY_FALLBACK[name]) {
    var src = env.keys && Array.isArray(env.keys[name]) ? env.keys[name] : DEF_KEYS[name];
    var want = name === "cw" ? 2 : 1, out = "", n = 0;
    for (i = 0; i < src.length && n < want; i++) {
      if (typeof src[i] !== "string" || !src[i]) continue;
      var nm = mode === 1 ? kbd(keyName(src[i])) : mode === 2 ? (KEY_SPOKEN[src[i]] || keyName(src[i])) : keyName(src[i]);
      out += (n ? " or " : "") + nm;
      n++;
    }
    return n ? out : KEY_FALLBACK[name];
  }
  if (PAD.letters[name] !== undefined) {
    var fam = padFamily(env.pad), g = PAD[fam][name];
    if (mode === 1) return fam === "words" ? esc(g) : kbd(g);
    if (mode === 2) return PAD_SPOKEN[g] || g;
    return g;
  }
  if (TRAY[name]) return mode === 1 ? trayKbd(name) : mode === 2 ? TRAY[name][1] : TRAY[name][0];
  return "{" + name + "}";
}
function fill(tpl, env, mode) {
  if (!tpl) return "";
  if (mode === 2) tpl = tpl.replace(/\} \{/g, "} and {");
  var s = tpl.replace(/\{([A-Za-z]+)\}/g, function (all, name) { return token(name, env, mode); });
  if (env.landing === false) {
    s = s.replace("where the light is", "where it would land").replace("straight to its light", "straight to where it would land");
  }
  var c = s.charAt(0);
  if (c >= "a" && c <= "z") s = c.toUpperCase() + s.slice(1);
  return s;
}
function byTap(v, env) {
  if (v && typeof v === "object") return env.tap === "anywhere" ? v.anywhere : v.sides;
  return v;
}
/* Whether a move exists on these hands with these settings: the half-turn
   needs Modern turning, is not on the tray, and on glass needs taps to
   turn by side (with Tap anywhere, two fingers turn it back instead). */
function available(move, hands, env) {
  if (move !== "half") return true;
  if (!env.modern || hands === "buttons") return false;
  return !(hands === "gestures" && env.tap === "anywhere");
}
/* Guide.text(move, hands, form, env) -> string
   move: a move id, "pause", "hands" or "first"; form: "name" "title"
   "line" "how" "why" "tip" "tipTitle" "short"; env: {tap, keep, modern,
   landing, keys, pad, html, spoken}. "" when the move doesn't exist on
   these hands. */
Guide.text = function (move, hands, form, env) {
  env = env || {};
  if (handsIx(hands) < 0) hands = "keys";
  var mode = env.html ? 1 : env.spoken ? 2 : 0;
  if (move === "hands") {
    var ht = HANDS_TIP[hands];
    if (form === "name") return "First steps";
    if (form === "line" || form === "tip" || form === "how" || form === "why") return ht[1];
    return ht[0];
  }
  if (move === "first") {
    if (form === "line" || form === "tip" || form === "why") return "Move, turn, drop and keep, one at a time.";
    return "First steps";
  }
  var d = WORDS[move];
  if (!d) return "";
  if (form === "name") return d.name;
  if (!available(move, hands, env)) return "";
  if (form === "why") return d.why;
  var row = d[hands];
  if (typeof row === "string") row = d[row];
  if (!row) return "";
  var tpl;
  if (form === "title") tpl = row[0];
  else if (form === "line") tpl = row[1];
  else if (form === "how") tpl = row[2];
  else if (form === "tipTitle") return TIPS[move] ? TIPS[move].title : fill(byTap(row[0], env), env, mode);
  else if (form === "tip") tpl = TIPS[move] ? TIPS[move][hands] : row[1];
  else if (form === "short") {
    var alts = SHORT[move] ? SHORT[move][hands] : [row[0]];
    for (var i = 0; i < alts.length; i++) {
      if (fill(alts[i], env, 0).length <= SHORT_MAX || i === alts.length - 1) return fill(alts[i], env, mode);
    }
  } else return "";
  return fill(byTap(tpl, env), env, mode);
};
Guide.handsName = function (h) { return HANDS_NAME[h] || HANDS_NAME.keys; };
Guide.MOVES = MOVES.slice();
Guide.HANDS = HANDS.slice();

/* ================================================================
   the drawings (pure: SVG as a string)
   ================================================================
   A small well with a piece in it, in the world's key light, and the
   hands that move it: a fingertip on the glass, a keycap, a tray key or a
   controller's face. They loop three times and rest; with reduced motion
   they are still, with an arrow for what would have moved. */
var ART_WELL = '<rect class="gd-aw" x="10" y="4" width="44" height="56" rx="6"/>' +
  '<rect class="gd-as" x="13" y="51" width="38" height="6.5" rx="1.8"/>' +
  '<rect class="gd-as" x="13" y="44" width="17" height="6.5" rx="1.8"/>' +
  '<rect class="gd-as" x="37" y="44" width="14" height="6.5" rx="1.8"/>';
var ART_PIECE = '<path class="gd-ap" d="M21.5 15h7V8h7v7h7v7h-21z"/>';
function artFinger(x, y, cls) {
  return '<g class="gd-afg' + (cls ? " " + cls : "") + '"><circle class="gd-afh" cx="' + x + '" cy="' + y +
    '" r="7"/><circle class="gd-aft" cx="' + x + '" cy="' + y + '" r="4"/></g>';
}
function artArrow(d) { return '<path class="gd-aar" d="' + d + '"/>'; }
function keycapArt(labels, x0) {
  var s = "", x = x0, i;
  for (i = 0; i < labels.length; i++) {
    var lb = labels[i], w = Math.max(14, Math.round(6 + lb.length * 5));
    s += '<g class="gd-abd' + (i ? " gd-abd2" : "") + '"><rect class="gd-akb" x="' + x + '" y="42" width="' + w +
      '" height="15" rx="3.5"/><text class="gd-akt" x="' + (x + w / 2) + '" y="52.6">' + esc(lb) + "</text></g>";
    x += w + 2;
  }
  return s;
}
function keycapsWidth(labels) {
  var w = 0;
  for (var i = 0; i < labels.length; i++) w += Math.max(14, Math.round(6 + labels[i].length * 5)) + (i ? 2 : 0);
  return w;
}
/* a controller's face: d-pad, four buttons in a diamond, shoulders and a
   trigger, with the control in question lit */
function padArt(lit, x, y, s) {
  function on(k) { return lit.indexOf(k) >= 0 ? " gd-lit" : ""; }
  var g = '<g class="gd-apad" transform="translate(' + x + " " + y + ") scale(" + s + ')">' +
    '<path class="gd-apb" d="M8 6h20c5 0 8 4 8.6 9l.8 7c.4 3-1.7 5-4 5-1.6 0-2.8-.9-3.7-2.4L27 21H9l-2.7 3.6C5.4 26.1 4.2 27 2.6 27c-2.3 0-4.4-2-4-5l.8-7C0 10 3 6 8 6z"/>' +
    '<rect class="gd-apc' + on("LT") + '" x="3" y="-1.5" width="7" height="4" rx="1.6"/>' +
    '<rect class="gd-apc' + on("LB") + '" x="2.5" y="3" width="8" height="2.2" rx="1"/>' +
    '<rect class="gd-apc' + on("LB") + '" x="25.5" y="3" width="8" height="2.2" rx="1"/>' +
    '<path class="gd-apc' + on("U") + '" d="M7.6 9.6h2.8v3h-2.8z"/>' +
    '<path class="gd-apc' + on("D") + '" d="M7.6 15.4h2.8v3h-2.8z"/>' +
    '<path class="gd-apc' + on("L") + '" d="M4.6 12.6h3v2.8h-3z"/>' +
    '<path class="gd-apc' + on("R") + '" d="M10.4 12.6h3v2.8h-3z"/>' +
    '<circle class="gd-apc' + on("Y") + '" cx="27" cy="10.6" r="1.7"/>' +
    '<circle class="gd-apc' + on("A") + '" cx="27" cy="17.4" r="1.7"/>' +
    '<circle class="gd-apc' + on("X") + '" cx="23.6" cy="14" r="1.7"/>' +
    '<circle class="gd-apc' + on("B") + '" cx="30.4" cy="14" r="1.7"/>' +
    "</g>";
  return g;
}
var PAD_LIT = { move: "LR", turn: "A", turnBack: "B", drop: "U", ease: "D", keep: "LB", breath: "LT", half: "Y", pause: "" };
var TRAY_OF = { move: ["tl", "tr"], turn: ["tcw"], turnBack: ["tccw"], drop: ["thard"], ease: ["tsoft"], keep: ["tkeep"] };
function trayArt(names) {
  var s = "", x = 60 - names.length * 18 + 2, i;
  for (i = 0; i < names.length; i++) {
    var t = TRAY[names[i]];
    s += '<g class="gd-abd' + (i ? " gd-abd2" : "") + '"><rect class="gd-akb gd-atk" x="' + x + '" y="41" width="16" height="16" rx="4"/>' +
      (t[2] ? '<g class="gd-ati" transform="translate(' + (x + 3) + ' 44) scale(.42)">' + t[2] + "</g>"
            : '<text class="gd-akt" x="' + (x + 8) + '" y="51.8" style="font-size:5.4px">Keep</text>') + "</g>";
    x += 18;
  }
  return s;
}
function keyLabels(move, env) {
  var keys = env.keys || DEF_KEYS;
  function first(name) {
    var l = Array.isArray(keys[name]) ? keys[name] : DEF_KEYS[name];
    for (var i = 0; i < l.length; i++) if (typeof l[i] === "string" && l[i]) return keyName(l[i]);
    return "";
  }
  var map = { move: ["left", "right"], turn: ["cw"], turnBack: ["ccw"], drop: ["hard"], ease: ["soft"], keep: ["hold"],
              breath: ["breath"], half: ["flip"], pause: ["pause"] };
  var out = [], names = map[move] || [];
  for (var i = 0; i < names.length; i++) { var k = first(names[i]); if (k) out.push(k); }
  return out;
}
/* Guide.art(move, hands, size, env) -> an <svg> string. "scheme-gestures"
   and "scheme-buttons" are the two touch schemes, drawn for Settings. */
Guide.art = function (move, hands, size, env) {
  env = env || {};
  if (move === "scheme-gestures" || move === "scheme-buttons") return schemeArt(move === "scheme-buttons", size);
  if (move === "hands" || move === "first") move = "move";
  if (!WORDS[move]) move = "move";
  if (handsIx(hands) < 0) hands = "keys";
  size = +size > 0 ? +size : 96;
  var any = env.tap === "anywhere";
  var s = '<svg class="gd-art gd-am-' + move + " gd-ah-" + hands + '" viewBox="0 0 64 64" width="' + size + '" height="' + size +
    '" aria-hidden="true" focusable="false">' + ART_WELL;
  var piece = '<g class="gd-apg">' + ART_PIECE + "</g>";
  var touch = hands === "gestures" || hands === "buttons";
  var hand = "";
  switch (move) {
    case "move":
      s += piece + artArrow("M22 26.5h20M25 23.5l-3 3 3 3M39 23.5l3 3-3 3");
      if (hands === "gestures") hand = artFinger(32, 37, "gd-afm");
      break;
    case "turn": case "turnBack": case "half":
      s += piece + artArrow(move === "turnBack" ? "M25.5 3.7A13 13 0 0 0 20.7 21.5M23.8 21.9l-3.1-.4-.2-3.1"
                                                  : "M38.5 3.7A13 13 0 0 1 43.3 21.5M40.2 21.9l3.1-.4.2-3.1");
      if (hands === "gestures") {
        if (move === "half" || (move === "turnBack" && any)) hand = artFinger(27, 38, "gd-aftap") + artFinger(37, 38, "gd-aftap");
        else hand = artFinger(move === "turnBack" ? 21 : any ? 32 : 43, 38, "gd-aftap");
      }
      break;
    case "drop":
      s += '<path class="gd-atr" d="M25 27v5M32 25v7M39 27v5"/>' + piece + artArrow("M32 27v11M28 34l4 4 4-4");
      if (hands === "gestures") hand = artFinger(32, 32, "gd-afd");
      break;
    case "ease":
      s += '<path class="gd-atd" d="M32 25v16"/>' + piece + artArrow("M32 27v11M28 34l4 4 4-4");
      if (hands === "gestures") hand = artFinger(32, 31, "gd-afe");
      break;
    case "keep":
      s += '<rect class="gd-an" x="1.5" y="1.5" width="13" height="11" rx="3"/>' + piece +
        artArrow("M19 9h-3.5M18 6.5L15.5 9l2.5 2.5");
      if (hands === "gestures") hand = artFinger(32, 34, "gd-afk");
      break;
    case "breath":
      s += piece + '<g class="gd-abr"><circle class="gd-abt" cx="32" cy="37" r="8"/><circle class="gd-abf" cx="32" cy="37" r="8" pathLength="20" transform="rotate(-90 32 37)"/>' +
        '<circle class="gd-abc" cx="32" cy="37" r="2.4"/></g>';
      if (touch) hand = artFinger(41, 45, "gd-aftap");
      break;
    case "pause":
      s += '<path class="gd-apz" d="M28.5 25v14M35.5 25v14"/>';
      break;
  }
  if (hands === "keys") {
    var labels = keyLabels(move, env);
    if (labels.length) s += keycapArt(labels, Math.min(36, 61 - keycapsWidth(labels)));
  } else if (hands === "pad") {
    if (move !== "pause") s += padArt(PAD_LIT[move] || "", 37, 40, 0.62);
  } else if (hands === "buttons" && TRAY_OF[move]) s += trayArt(TRAY_OF[move]);
  return s + hand + "</svg>";
};
function schemeArt(buttons, size) {
  var dim = +size > 0 ? ' width="' + size + '" height="' + Math.round(size * 0.75) + '"' : "";
  var s = '<svg class="gd-art oc-pv gd-sch gd-sch-' + (buttons ? "b" : "g") + '" viewBox="0 0 96 72"' + dim +
    ' aria-hidden="true" focusable="false">';
  if (!buttons) {
    s += '<rect class="gd-aw" x="33" y="5" width="30" height="62" rx="5"/>' +
      '<rect class="gd-as" x="35.5" y="58.5" width="25" height="6" rx="1.5"/><rect class="gd-as" x="35.5" y="52" width="9" height="6" rx="1.5"/>' +
      '<g class="gd-sp"><path class="gd-ap" d="M39 16h6v-6h6v6h6v6H39z"/></g>' +
      '<g class="gd-sf"><circle class="gd-afh" cx="48" cy="38" r="7"/><circle class="gd-aft" cx="48" cy="38" r="4"/></g>';
  } else {
    s += '<rect class="gd-aw" x="36" y="4" width="24" height="44" rx="4.5"/>' +
      '<rect class="gd-as" x="38.5" y="40" width="19" height="5.5" rx="1.5"/>' +
      '<g class="gd-sp"><path class="gd-ap" d="M41 14h5v-5h5v5h5v5H41z"/></g>';
    var keys = [[22, 52, "thard", "gd-sk3"], [13, 61, "tl", "gd-sk1"], [22, 61, "tsoft", ""], [31, 61, "tr", ""],
                [71, 52, "tkeep", ""], [62, 61, "tccw", ""], [80, 61, "tcw", "gd-sk2"]];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], t = TRAY[k[2]];
      s += '<g class="gd-sk ' + k[3] + '"><rect class="gd-akb gd-atk" x="' + (k[0] - 4) + '" y="' + (k[1] - 4) + '" width="8" height="8" rx="2"/>' +
        (t[2] ? '<g class="gd-ati" transform="translate(' + (k[0] - 2.6) + " " + (k[1] - 2.6) + ') scale(.216)">' + t[2] + "</g>"
              : '<circle class="gd-akd" cx="' + k[0] + '" cy="' + k[1] + '" r="1.2"/>') + "</g>";
    }
  }
  return s + "</svg>";
}

/* ================================================================
   the page's part (browser only)
   ================================================================ */
var CSS = [
  /* the caption: a float card, on the well on a phone, in the side panel beside a wide one */
  "#guide{position:absolute;left:0;top:0;z-index:7;box-sizing:border-box;display:flex;gap:14px;align-items:flex-start;",
  "width:340px;padding:14px 16px;border-radius:16px;background:rgb(14 16 26 / .88);border:1px solid var(--hair);",
  "box-shadow:0 12px 32px rgb(0 0 0 / .4);color:var(--ink);pointer-events:none;text-align:left;",
  "opacity:0;visibility:hidden;transform:translateY(6px);",
  "transition:opacity .4s var(--e-out),transform .4s var(--e-out),visibility 0s linear .4s}",
  "#guide.on{opacity:1;visibility:visible;transform:none;transition:opacity .4s var(--e-out),transform .4s var(--e-out)}",
  "#guide.on.dodge{opacity:.14;transition:opacity .2s linear}",
  "#guide .gd-b{flex:1 1 auto;min-width:0}",
  "#guide .gd-eb{font:500 .75rem/1rem var(--sans);letter-spacing:.02em;color:var(--ink-2);font-variant-numeric:tabular-nums}",
  "#guide .gd-t{margin:4px 0 0;font:400 1.1875rem/1.5rem var(--serif);color:rgb(var(--wk));text-wrap:balance}",
  "#guide .gd-t kbd.kc{font-size:.8125rem;vertical-align:.12em;margin:0 1px}",
  "#guide .gd-l{margin:4px 0 0;font:400 .9375rem/1.25rem var(--sans);color:var(--ink-2)}",
  "#guide .gd-n{margin:6px 0 0;font:400 .8125rem/1.125rem var(--sans);color:var(--ink-2)}",
  "#guide .gd-n:empty{display:none}",
  "#guide .gd-ft{display:flex;align-items:center;gap:2px;min-height:20px;margin:10px -10px -8px 0}",
  "#guide .gd-dots{flex:1 1 auto;display:flex;align-items:center;gap:8px;min-height:20px}",
  "#guide .btn{pointer-events:auto;flex:none}",
  "#guide .btn.quiet{min-height:44px;padding:0 10px;font-size:.9375rem}",
  "#guide .btn.small{min-height:44px;font-size:.9375rem}",
  "#guide .gd-fin{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0 0}",
  "#guide .gd-fin .btn.quiet{margin-left:-2px}",
  "#guide .gd-fin:empty{display:none}",
  "#guide .gd-swap{animation:gdIn .5s var(--e-out)}",
  "#guide.compact{padding:12px 14px}",
  "#guide.compact .gd-t{font-size:1.125rem;line-height:1.375rem}",
  ".gd-dot{flex:none;display:block;width:6px;height:6px;border-radius:50%;box-shadow:inset 0 0 0 1px rgb(238 240 248 / .32)}",
  ".gd-dot.now{width:8px;height:8px;background:rgb(var(--wk));box-shadow:0 0 0 3px rgb(var(--wk) / .16)}",
  ".gd-dot .gd-ck{display:none}",
  ".gd-dot.ok{width:12px;height:12px;box-shadow:none}",
  ".gd-dot.ok .gd-ck{display:block;width:12px;height:12px;fill:none;stroke:rgb(var(--wk));stroke-width:2;stroke-linecap:round;stroke-linejoin:round}",
  "@keyframes gdIn{from{opacity:0}}",
  /* the art column for keys and controllers */
  "#guide .gd-col{flex:none;width:76px;display:flex;flex-wrap:wrap;justify-content:center;align-content:center;gap:6px;min-height:72px;padding-top:2px}",
  "#guide .gd-col:empty{display:none}",
  ".gd-kc{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:34px;height:34px;padding:0 8px;",
  "border-radius:8px;background:var(--fill-2);border:1px solid var(--hair-2);box-shadow:inset 0 -3px 0 rgb(0 0 0 / .35);",
  "font:600 .9375rem/1 var(--sans);color:var(--ink);white-space:nowrap}",
  ".gd-kc.wide{min-width:72px}",
  ".gd-col.go .gd-kc{animation:gdKey 1.2s var(--e-out) 6}",
  ".gd-col.go .gd-kc+.gd-kc{animation-delay:.6s}",
  "@keyframes gdKey{0%,40%,100%{transform:none}10%{transform:translateY(2px);box-shadow:inset 0 -1px 0 rgb(0 0 0 / .35);",
  "border-color:rgb(var(--wk) / .7);color:rgb(var(--wk))}24%{transform:none}}",
  ".gd-col svg.gd-padf{width:72px;height:56px;display:block}",
  ".gd-padf .gd-apb{fill:none;stroke:var(--ink-3);stroke-width:1.1}",
  ".gd-padf .gd-apc{fill:none;stroke:var(--ink-3);stroke-width:.9}",
  ".gd-padf .gd-apc.gd-lit{fill:rgb(var(--wk));stroke:rgb(var(--wk))}",
  ".gd-col.go .gd-lit{animation:gdGlow 1.2s ease-in-out 6}",
  "@keyframes gdGlow{50%{opacity:.45}}",
  /* the demonstration on the glass: a fingertip of light */
  "#guideFx{position:absolute;left:0;top:0;width:0;height:0;z-index:7;pointer-events:none;--c:30px;--ww:300px}",
  "#guideFx .gd-f,#guideFx .gd-ring{position:absolute;left:0;top:0;width:0;height:0;display:none}",
  "#guideFx .gd-in{position:absolute;left:-22px;top:-22px;width:44px;height:44px;opacity:0}",
  "#guideFx .gd-halo{position:absolute;inset:0;border-radius:50%;background:rgb(var(--wk) / .10);box-shadow:inset 0 0 0 1.5px rgb(var(--wk) / .28)}",
  "#guideFx .gd-tip{position:absolute;left:9px;top:9px;width:26px;height:26px;border-radius:50%;background:rgb(var(--wk) / .85);",
  "box-shadow:0 0 0 1px rgb(255 255 255 / .18) inset}",
  "#guideFx .gd-tr{position:absolute;left:20px;bottom:46px;display:none;flex-direction:column;align-items:center;gap:5px;opacity:0}",
  "#guideFx .gd-tr i{display:block;width:3px;height:8px;border-radius:2px;background:rgb(var(--wk) / .55)}",
  "#guideFx .gd-arw{position:absolute;left:-22px;top:-22px;width:88px;height:88px;display:none;fill:none;stroke:rgb(var(--wk));",
  "stroke-width:2;stroke-linecap:round;stroke-linejoin:round;overflow:visible}",
  "#guideFx .gd-ring{box-sizing:border-box;border-radius:16px;box-shadow:0 0 0 2px rgb(var(--wk) / .55),0 0 18px rgb(var(--wk) / .3)}",
  "#guideFx.on .gd-f.on,#guideFx.on .gd-ring.on{display:block}",
  "#guideFx.k-move .gd-f1 .gd-in{animation:gdMove 2.4s 3 both}",
  "#guideFx.k-turn .gd-f1 .gd-in,#guideFx.k-tapA .gd-f1 .gd-in{animation:gdTapA 2.4s 3 both}",
  "#guideFx.k-turn .gd-f2 .gd-in,#guideFx.k-turn .gd-f3 .gd-in,#guideFx.k-tapB .gd-f2 .gd-in,#guideFx.k-tapB .gd-f3 .gd-in{animation:gdTapB 2.4s 3 both}",
  "#guideFx.k-tap .gd-in{animation:gdTapA 2.4s 3 both}",
  "#guideFx.k-turn .gd-halo,#guideFx.k-tap .gd-halo{animation:gdHaloA 2.4s 3 both}",
  "#guideFx.k-turn .gd-f2 .gd-halo,#guideFx.k-turn .gd-f3 .gd-halo{animation-name:gdHaloB}",
  "#guideFx.k-tapB .gd-halo{animation:gdHaloB 2.4s 3 both}",
  "#guideFx.k-drop .gd-f1 .gd-in{animation:gdFlickD 2.4s 3 both}",
  "#guideFx.k-drop .gd-tr,#guideFx.k-ease .gd-tr{display:flex}",
  "#guideFx.k-drop .gd-tr{animation:gdTrail 2.4s 3 both}",
  "#guideFx.k-ease .gd-f1 .gd-in{animation:gdEase 2.4s 3 both}",
  "#guideFx.k-ease .gd-tr{animation:gdTrailE 2.4s 3 both}",
  "#guideFx.k-ease .gd-tr i{width:4px;height:4px}",
  "#guideFx.k-keep .gd-f1 .gd-in{animation:gdFlickU 4.8s 2 both}",
  "#guideFx.k-keep .gd-f2 .gd-in{animation:gdNiche 4.8s 2 both}",
  "#guideFx.k-keep .gd-ring{animation:gdRingK 4.8s 2 both}",
  "#guideFx.k-breath .gd-ring{border-radius:50%;animation:gdRingB 2.4s ease-in-out 3 both}",
  "@keyframes gdMove{0%{opacity:0;transform:translateX(0)}8%{opacity:1;transform:translateX(0);animation-timing-function:ease-in-out}",
  "36%{transform:translateX(calc(var(--c) * 1.5));animation-timing-function:ease-in-out}",
  "70%{transform:translateX(calc(var(--c) * -1.5));animation-timing-function:ease-in-out}",
  "86%{opacity:1;transform:translateX(0)}100%{opacity:0;transform:translateX(0)}}",
  "@keyframes gdTapA{0%{opacity:0;transform:scale(1)}5%{opacity:1;transform:scale(1)}11%{transform:scale(.85)}",
  "18%{transform:scale(1)}32%{opacity:1}42%,100%{opacity:0;transform:scale(1)}}",
  "@keyframes gdTapB{0%,50%{opacity:0;transform:scale(1)}55%{opacity:1;transform:scale(1)}61%{transform:scale(.85)}",
  "68%{transform:scale(1)}82%{opacity:1}92%,100%{opacity:0;transform:scale(1)}}",
  "@keyframes gdHaloA{0%,11%{transform:scale(1);opacity:1}30%,100%{transform:scale(1.6);opacity:0}}",
  "@keyframes gdHaloB{0%,61%{transform:scale(1);opacity:1}80%,100%{transform:scale(1.6);opacity:0}}",
  "@keyframes gdFlickD{0%{opacity:0;transform:translateY(0)}12%{opacity:1;transform:translateY(0)}",
  "40%{transform:translateY(0);animation-timing-function:cubic-bezier(.4,0,1,1)}46%{transform:translateY(calc(var(--c) * 2))}",
  "62%{opacity:1}76%,100%{opacity:0;transform:translateY(calc(var(--c) * 2))}}",
  "@keyframes gdTrail{0%,42%{opacity:0;transform:translateY(0)}47%{opacity:1;transform:translateY(calc(var(--c) * 2))}",
  "64%,100%{opacity:0;transform:translateY(calc(var(--c) * 2))}}",
  "@keyframes gdEase{0%{opacity:0;transform:translateY(0)}10%{opacity:1;transform:translateY(0);animation-timing-function:ease-in-out}",
  "68%{transform:translateY(calc(var(--c) * 3))}84%{opacity:1}96%,100%{opacity:0;transform:translateY(calc(var(--c) * 3))}}",
  "@keyframes gdTrailE{0%,14%{opacity:0;transform:translateY(0)}30%{opacity:1}68%{opacity:1;transform:translateY(calc(var(--c) * 3))}",
  "90%,100%{opacity:0;transform:translateY(calc(var(--c) * 3))}}",
  "@keyframes gdFlickU{0%{opacity:0;transform:translateY(0)}6%{opacity:1;transform:translateY(0)}",
  "20%{transform:translateY(0);animation-timing-function:cubic-bezier(.4,0,1,1)}23%{transform:translateY(calc(var(--c) * -2))}",
  "31%{opacity:1}38%,100%{opacity:0;transform:translateY(calc(var(--c) * -2))}}",
  "@keyframes gdNiche{0%,54%{opacity:0;transform:scale(1)}58%{opacity:1;transform:scale(1)}63%{transform:scale(.85)}",
  "69%{transform:scale(1)}80%{opacity:1}88%,100%{opacity:0}}",
  "@keyframes gdRingK{0%,22%{opacity:0}26%{opacity:1}38%{opacity:1}46%,60%{opacity:0}64%{opacity:1}78%{opacity:1}86%,100%{opacity:0}}",
  "@keyframes gdRingB{0%{opacity:0}20%{opacity:1}50%{opacity:.4}80%{opacity:1}100%{opacity:0}}",
  /* still: the fingertip where it would end, an arrow for the way it would go */
  "#guideFx.still .gd-in{animation:none !important;opacity:1}",
  "#guideFx.still .gd-tr{animation:none !important;opacity:1}",
  "#guideFx.still .gd-arw{display:block}",
  "#guideFx.still .gd-ring{animation:none !important;opacity:1}",
  "#guideFx.still.k-keep .gd-f2{display:none}",
  /* the tray key being taught */
  ".gd-teach{box-shadow:0 0 0 2px rgb(var(--wk)),0 0 18px rgb(var(--wk) / .35) !important;transition:box-shadow .6s var(--e-out) !important}",
  /* the drawings */
  ".gd-art{display:block;overflow:visible}",
  ".gd-art .gd-aw{fill:rgb(238 240 248 / .03);stroke:var(--ink-3);stroke-width:1.5}",
  ".gd-art .gd-as{fill:var(--ink-3);opacity:.32}",
  ".gd-art .gd-ap{fill:rgb(var(--wk));stroke:rgb(var(--wk));stroke-width:1.2;stroke-linejoin:round}",
  ".gd-art .gd-apg,.gd-art .gd-afg,.gd-art .gd-sp,.gd-art .gd-sf{transform-box:view-box;transform-origin:32px 15.5px}",
  ".gd-art .gd-afh{fill:rgb(var(--wk) / .14);stroke:rgb(var(--wk) / .35);stroke-width:.9}",
  ".gd-art .gd-aft{fill:rgb(var(--wk) / .9)}",
  ".gd-art .gd-aar{fill:none;stroke:rgb(var(--wk));stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;opacity:0}",
  ".gd-art .gd-atr{fill:none;stroke:rgb(var(--wk) / .6);stroke-width:1.4;stroke-linecap:round;opacity:0}",
  ".gd-art .gd-atd{fill:none;stroke:rgb(var(--wk) / .55);stroke-width:1.4;stroke-linecap:round;stroke-dasharray:.1 3;opacity:0}",
  ".gd-art .gd-an{fill:none;stroke:var(--ink-3);stroke-width:1.2;stroke-dasharray:2 1.6}",
  ".gd-art .gd-abt{fill:none;stroke:var(--hair-2);stroke-width:1.6}",
  ".gd-art .gd-abf{fill:none;stroke:rgb(var(--wa));stroke-width:1.6;stroke-dasharray:20 20}",
  ".gd-art .gd-abc{fill:rgb(var(--wk))}",
  ".gd-art .gd-apz{fill:none;stroke:var(--ink-2);stroke-width:2.4;stroke-linecap:round}",
  ".gd-art .gd-akb{fill:rgb(var(--glass2));stroke:var(--hair-2);stroke-width:.8}",
  ".gd-art .gd-atk{stroke:rgb(var(--wk) / .7)}",
  ".gd-art .gd-akt{fill:var(--ink);font:600 8px var(--sans);text-anchor:middle}",
  ".gd-art .gd-ati{fill:none;stroke:var(--ink);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}",
  ".gd-art .gd-akd{fill:var(--ink)}",
  ".gd-art .gd-abd{transform-box:fill-box;transform-origin:center}",
  ".gd-art .gd-apb{fill:rgb(var(--glass2));stroke:var(--ink-3);stroke-width:1.2}",
  ".gd-art .gd-apc{fill:none;stroke:var(--ink-3);stroke-width:1}",
  ".gd-art .gd-apc.gd-lit{fill:rgb(var(--wk));stroke:rgb(var(--wk))}",
  ".gd-art.gd-am-move .gd-apg,.gd-art.gd-am-move .gd-afm{animation:gdAMove 2.4s ease-in-out 3}",
  ".gd-art.gd-am-turn .gd-apg{animation:gdATurn 2.4s 3}",
  ".gd-art.gd-am-turnBack .gd-apg{animation:gdABack 2.4s 3}",
  ".gd-art.gd-am-half .gd-apg{animation:gdAHalf 2.4s 3}",
  ".gd-art .gd-aftap{transform-box:fill-box;transform-origin:center;animation:gdATap 1.2s 6}",
  ".gd-art.gd-am-drop .gd-apg{animation:gdADrop 2.4s 3}",
  ".gd-art.gd-am-drop .gd-atr{animation:gdATrail 2.4s 3}",
  ".gd-art.gd-am-drop .gd-afd{animation:gdAFlick 2.4s 3}",
  ".gd-art.gd-am-ease .gd-apg,.gd-art.gd-am-ease .gd-afe{animation:gdAEase 2.4s 3}",
  ".gd-art.gd-am-ease .gd-atd{animation:gdATrailE 2.4s 3}",
  ".gd-art.gd-am-keep .gd-apg{animation:gdAKeep 2.4s 3}",
  ".gd-art.gd-am-keep .gd-afk{animation:gdAFlickU 2.4s 3}",
  ".gd-art.gd-am-breath .gd-abf{animation:gdAFill 2.4s 3}",
  ".gd-art.gd-am-breath .gd-apg{animation:gdAFloat 2.4s ease-in-out 3}",
  ".gd-art .gd-abd{animation:gdAPress 1.2s 6}",
  ".gd-art .gd-abd2{animation-delay:.6s}",
  ".gd-art .gd-apc.gd-lit{animation:gdGlow 1.2s ease-in-out 6}",
  "@keyframes gdAMove{0%,100%{transform:translateX(0)}30%{transform:translateX(7px)}70%{transform:translateX(-7px)}}",
  "@keyframes gdATurn{0%,14%{transform:rotate(0);opacity:1}20%,48%{transform:rotate(90deg)}54%,82%{transform:rotate(180deg);opacity:1}",
  "90%{transform:rotate(180deg);opacity:0}96%{transform:rotate(0);opacity:0}100%{transform:rotate(0);opacity:1}}",
  "@keyframes gdABack{0%,14%{transform:rotate(0);opacity:1}20%,48%{transform:rotate(-90deg)}54%,82%{transform:rotate(-180deg);opacity:1}",
  "90%{transform:rotate(-180deg);opacity:0}96%{transform:rotate(0);opacity:0}100%{transform:rotate(0);opacity:1}}",
  "@keyframes gdAHalf{0%,20%{transform:rotate(0);opacity:1}30%,82%{transform:rotate(180deg);opacity:1}",
  "90%{transform:rotate(180deg);opacity:0}96%{transform:rotate(0);opacity:0}100%{transform:rotate(0);opacity:1}}",
  "@keyframes gdATap{0%,100%{opacity:0;transform:scale(1)}8%{opacity:1}14%{transform:scale(.8)}22%{transform:scale(1)}40%{opacity:1}55%{opacity:0}}",
  "@keyframes gdADrop{0%,40%{transform:translateY(0);opacity:1}45%,80%{transform:translateY(22px);opacity:1}",
  "90%{transform:translateY(22px);opacity:0}96%{transform:translateY(0);opacity:0}100%{opacity:1}}",
  "@keyframes gdATrail{0%,42%{opacity:0}46%{opacity:1}64%,100%{opacity:0}}",
  "@keyframes gdAFlick{0%,100%{opacity:0;transform:translateY(0)}10%,40%{opacity:1;transform:translateY(0)}",
  "45%{transform:translateY(9px);opacity:1}62%{opacity:0;transform:translateY(9px)}}",
  "@keyframes gdAEase{0%,10%{transform:translateY(0);opacity:1}70%,82%{transform:translateY(19px);opacity:1}",
  "90%{transform:translateY(19px);opacity:0}96%{transform:translateY(0);opacity:0}100%{opacity:1}}",
  "@keyframes gdATrailE{0%,14%{opacity:0}40%,74%{opacity:1}90%,100%{opacity:0}}",
  "@keyframes gdAKeep{0%,40%{transform:translate(0,0) scale(1);opacity:1}46%,78%{transform:translate(-24px,-8px) scale(.45);opacity:1}",
  "88%{transform:translate(-24px,-8px) scale(.45);opacity:0}94%{transform:translate(0,0) scale(1);opacity:0}100%{opacity:1}}",
  "@keyframes gdAFlickU{0%,100%{opacity:0;transform:translateY(0)}10%,38%{opacity:1;transform:translateY(0)}",
  "44%{transform:translateY(-9px);opacity:1}60%{opacity:0;transform:translateY(-9px)}}",
  "@keyframes gdAFill{0%{stroke-dasharray:4 20}50%,80%{stroke-dasharray:20 20}100%{stroke-dasharray:4 20}}",
  "@keyframes gdAFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(1.5px)}}",
  "@keyframes gdAPress{0%,45%,100%{transform:none}12%{transform:translateY(1.2px)}26%{transform:none}}",
  /* Settings' two touch schemes */
  ".gd-sch{width:100%;height:auto}",
  ".gd-sch-g .gd-sp{transform-origin:48px 16px;animation:gdSG 2.4s 3}",
  ".gd-sch-g .gd-sf{animation:gdSGF 2.4s 3}",
  ".gd-sch-b .gd-sp{transform-origin:48px 14px;animation:gdSB 2.4s 3}",
  ".gd-sch-b .gd-sk1 .gd-akb{animation:gdSK1 2.4s 3}",
  ".gd-sch-b .gd-sk2 .gd-akb{animation:gdSK2 2.4s 3}",
  ".gd-sch-b .gd-sk3 .gd-akb{animation:gdSK3 2.4s 3}",
  ".gd-sch .gd-akb{stroke:var(--hair-2)}",
  "@keyframes gdSG{0%,8%{transform:translate(0,0) rotate(0);opacity:1}26%,40%{transform:translate(-6px,0) rotate(0)}",
  "46%,62%{transform:translate(-6px,0) rotate(90deg)}68%,86%{transform:translate(-6px,27px) rotate(90deg);opacity:1}",
  "94%{opacity:0;transform:translate(-6px,27px) rotate(90deg)}97%{opacity:0;transform:none}100%{opacity:1;transform:none}}",
  "@keyframes gdSGF{0%{opacity:0;transform:translate(0,0)}8%{opacity:1;transform:translate(0,0)}26%{transform:translate(-6px,0);opacity:1}",
  "34%{opacity:0;transform:translate(-6px,0)}38%{opacity:0;transform:translate(6px,6px) scale(1)}42%{opacity:1;transform:translate(6px,6px) scale(1)}",
  "46%{transform:translate(6px,6px) scale(.8)}52%{transform:translate(6px,6px) scale(1);opacity:1}58%{opacity:0}",
  "60%{opacity:0;transform:translate(-6px,-8px)}63%{opacity:1;transform:translate(-6px,-8px);animation-timing-function:cubic-bezier(.4,0,1,1)}",
  "68%{transform:translate(-6px,6px);opacity:1}80%,100%{opacity:0;transform:translate(-6px,6px)}}",
  "@keyframes gdSB{0%,14%{transform:translate(0,0) rotate(0);opacity:1}20%,44%{transform:translate(-5px,0) rotate(0)}",
  "50%,66%{transform:translate(-5px,0) rotate(90deg)}72%,86%{transform:translate(-5px,18px) rotate(90deg);opacity:1}",
  "94%{opacity:0;transform:translate(-5px,18px) rotate(90deg)}97%{opacity:0;transform:none}100%{opacity:1;transform:none}}",
  "@keyframes gdSK1{0%,10%,30%,100%{fill:rgb(var(--glass2));stroke:var(--hair-2)}14%,24%{fill:rgb(var(--wk) / .35);stroke:rgb(var(--wk))}}",
  "@keyframes gdSK2{0%,40%,60%,100%{fill:rgb(var(--glass2));stroke:var(--hair-2)}44%,54%{fill:rgb(var(--wk) / .35);stroke:rgb(var(--wk))}}",
  "@keyframes gdSK3{0%,62%,82%,100%{fill:rgb(var(--glass2));stroke:var(--hair-2)}66%,76%{fill:rgb(var(--wk) / .35);stroke:rgb(var(--wk))}}",
  /* still drawings: no movement, the arrow says what would move */
  "html.rm .gd-art *,html.rm .gd-col *,html.rm .gd-sch *{animation:none !important}",
  "html.rm .gd-art .gd-aar{opacity:1}",
  "html.rm .gd-art .gd-aftap,html.rm .gd-art .gd-afm{opacity:1}",
  "@media (prefers-reduced-motion:reduce){.gd-art *,.gd-col *,.gd-sch *,#guideFx *{animation:none !important}",
  ".gd-art .gd-aar{opacity:1}#guide{transform:none !important;transition:opacity .15s linear,visibility 0s linear .15s}}",
  "html.rm #guide{transform:none;transition:opacity .15s linear,visibility 0s linear .15s}",
  "html.rm #guide.on{transition:opacity .15s linear}",
  /* the card that offers a move */
  ".gd-tip{display:grid;grid-template-columns:56px 1fr;gap:12px 14px;align-items:start;box-sizing:border-box;padding:14px 16px;",
  "border-radius:16px;background:var(--fill-1);border:1px solid var(--hair);color:var(--ink);text-align:left;overflow:hidden;",
  "max-height:40rem;transition:opacity .2s var(--e-out),max-height .2s var(--e-out),padding .2s var(--e-out),margin .2s var(--e-out)}",
  ".gd-tip.gone{opacity:0;max-height:0;padding-top:0;padding-bottom:0;margin:0;border-width:0}",
  "html.rm .gd-tip{transition:opacity .15s linear}",
  ".gd-tip-art svg{width:56px;height:56px}",
  ".gd-tip .gd-eb{font:500 .75rem/1rem var(--sans);letter-spacing:.02em;color:var(--ink-2)}",
  ".gd-tip-t{margin:2px 0 0;font:600 1.0625rem/1.375rem var(--sans);color:var(--ink)}",
  ".gd-tip-s{margin:4px 0 0;font:400 .9375rem/1.25rem var(--sans);color:var(--ink-2)}",
  ".gd-tip-a{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;margin:12px 0 0 -2px}",
  ".gd-tip-a .btn.quiet{padding:0 12px}",
  /* the Moves page */
  ".gd-mv .gd-mv-lead{margin:0 4px 16px;font:400 1rem/1.5 var(--sans);color:var(--ink-2)}",
  ".gd-mv .gd-mv-for{margin:0 0 16px}",
  ".gd-mv .gd-mv-list .li{min-height:72px;gap:14px;align-items:center;padding-top:10px;padding-bottom:10px}",
  ".gd-mv .gd-mv-list .li + .li:before{left:78px}",
  ".gd-mv .gd-mv-art{flex:none;width:48px;height:48px;display:flex;align-items:center;justify-content:center}",
  ".gd-mv .gd-mv-art svg{width:48px;height:48px}",
  ".gd-mv .gd-mv-n{display:flex;align-items:center;gap:6px;font:500 1.0625rem/1.375rem var(--sans);color:var(--ink)}",
  ".gd-mv .gd-mv-how{display:block;margin-top:2px;font:400 .9375rem/1.375rem var(--sans);color:var(--ink-2)}",
  ".gd-mv .gd-mv-how kbd.kc{margin:0 1px}",
  /* the why line in --ink-2: --ink-3 on a row's fill fell to 4.4:1 over the brightest frost */
  ".gd-mv .gd-mv-why{display:block;margin-top:2px;font:400 .8125rem/1.125rem var(--sans);color:var(--ink-2)}",
  ".gd-mv .gd-mv-r{flex:none;display:flex;align-items:center;justify-content:flex-end;min-width:44px}",
  ".gd-mv .gd-mv-ok{display:inline-flex;align-items:center;gap:3px;margin-left:2px;font:500 .8125rem/1 var(--sans);color:rgb(var(--wk))}",
  ".gd-mv .gd-stone{flex:none;width:18px;height:18px;fill:rgb(var(--wk));display:block}",
  /* large text: Practise moves under the words, which get the row's width */
  "html.ts-big .gd-mv .gd-mv-row{flex-wrap:wrap;align-items:flex-start}",
  "html.ts-big .gd-mv .gd-mv-row .li-t{flex:1 1 calc(100% - 62px)}",
  "html.ts-big .gd-mv .gd-mv-r{width:100%;justify-content:flex-start;padding-left:62px}",
  "html.ts-big .gd-mv .gd-mv-r:empty{display:none}",
  ".gd-mv .gd-mv-again{display:flex;width:100%;margin:16px 0 0}",
  ".gd-mv .gd-mv-tips{margin:24px 0 0}",
  ".gd-mv .gd-mv-forget{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;margin:8px 0 0}",
  ".gd-mv .gd-mv-st{font:400 .8125rem/1.125rem var(--sans);color:var(--ink-2)}",
  ".gd-mv .gd-mv-note{margin:8px 4px 0;font:400 .8125rem/1.125rem var(--sans);color:var(--ink-2)}",
  ".gd-mv .gd-mv-ro{margin:10px 4px 0;font:400 .8125rem/1.125rem var(--sans);color:var(--ink-2)}",
  "kbd.kc.gd-tk{padding:0 .3em}",
  "kbd.kc.gd-tk svg{width:1.15em;height:1.15em;display:block;fill:none;stroke:currentColor;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}",
  ".gd-vh{position:absolute !important;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}",
  "@media (min-width:900px) and (pointer:fine){#guide .gd-l,.gd-tip-s{font-size:.875rem}}",
  "@media (forced-colors:active){#guide,.gd-tip{border:1px solid CanvasText}.gd-teach{outline:3px solid Highlight !important}",
  ".gd-dot.now{background:Highlight}#guideFx .gd-tip{background:Highlight}}"
].join("\n");

var STONE = '<svg class="gd-stone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M5.5 13.2c0-3 2.9-5.4 6.6-5.4 3.6 0 6.4 2.2 6.4 5 0 2.7-2.8 4.4-6.5 4.4-3.8 0-6.5-1.4-6.5-4z"/></svg>';
/* a full stop only a screen reader hears, so a row reads "Drop. Flick down." */
var VH_STOP = '<span class="gd-vh">.</span>';
var CHECK = '<svg class="gd-ck" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.4 6.4l2.4 2.4 4.8-5.2"/></svg>';
/* where a still fingertip says which way it would go */
/* drawn in an 88 px box centred on the fingertip, so each sits beside it */
var STILL_ARROW = {
  move: '<path d="M22 76h44M28 70l-6 6 6 6M60 70l6 6-6 6"/>',
  tap: '<path d="M30 15a17 17 0 0 1 28 0M58 8v7h-7"/>',
  tapBack: '<path d="M58 15a17 17 0 0 0-28 0M30 8v7h7"/>',
  drop: '<path d="M44 70v12M38 77l6 6 6-6M36 87h16"/>',
  ease: '<path d="M44 70v12M38 77l6 6 6-6"/>',
  keep: '<path d="M44 19V5M38 11l6-6 6 6"/>'
};
var FX_HTML = (function () {
  var f = '<div class="gd-in"><span class="gd-halo"></span><span class="gd-tip"></span>' +
    '<span class="gd-tr"><i></i><i></i><i></i></span><svg class="gd-arw" viewBox="0 0 88 88"></svg></div>';
  return '<div class="gd-f gd-f1">' + f + '</div><div class="gd-f gd-f2">' + f + '</div><div class="gd-f gd-f3">' + f +
    '</div><div class="gd-ring"></div>';
})();

var uid = 0;

/* ================================================================
   Guide.create — the instance the app talks to
   ================================================================ */
Guide.create = function (o) {
  o = o || {};
  var prefs = o.prefs || null;
  var doc = root.document && root.document.createElement ? root.document : null;
  var stage = doc && o.stage ? o.stage : null;
  var G = {};

  function call(fn, a, b) {
    if (typeof fn !== "function") return undefined;
    try { return fn(a, b); } catch (e) { tell(e); return undefined; }
  }
  var told = false;
  function tell(e) { if (!told && root.console && console.error) { told = true; console.error("guide.js:", e); } }
  function pget(k, d) {
    if (!prefs || !prefs.get) return d;
    try { var v = prefs.get(k); return v === undefined ? d : v; } catch (e) { return d; }
  }

  /* ---------- the notebook, in memory ---------- */
  var st = Guide.repair(pget("guide", null));
  var writing = false;
  function persist() {
    if (!prefs || !prefs.set) return;
    writing = true;
    try { prefs.set("guide", compact(st)); } catch (e) { tell(e); }
    writing = false;
  }
  function reload() { st = Guide.repair(pget("guide", null)); }

  /* ---------- the hands ---------- */
  var curHands = "", scheme = pget("scheme", "gestures"), padId = "";
  function padNow() {
    var nav = root.navigator;
    if (!nav || typeof nav.getGamepads !== "function") return null;
    try {
      var l = nav.getGamepads();
      for (var i = 0; l && i < l.length; i++) if (l[i] && l[i].connected !== false) return l[i];
    } catch (e) {}
    return null;
  }
  function detect() {
    var p = padNow();
    if (p) { padId = String(p.id || ""); return "pad"; }
    if (o.touch && !o.fine) return scheme === "buttons" ? "buttons" : "gestures";
    return "keys";
  }
  function handsNow() { return curHands || R.hands0 || detect(); }
  function padFam() { var p = padNow(); if (p) padId = String(p.id || ""); return padFamily(padId); }
  function env() {
    return { tap: pget("tap", "sides"), keep: pget("keep", true) !== false, modern: !!pget("modern", false),
             landing: pget("landing", true) !== false, keys: pget("keys", null), pad: padFam(),
             html: false, spoken: false };
  }
  function words(move, form, h, mode) {
    var e = env();
    if (mode === 1) e.html = true; else if (mode === 2) e.spoken = true;
    return Guide.text(move, h || handsNow(), form, e);
  }

  /* Migration, once: a player from before the guide has met the moves.
     Only when the guide has never written its notebook — first steps
     write it as they begin, so a new player who closes the tab half-way
     through them is shown them again, not taken for an old hand. */
  (function migrate() {
    for (var i = 0; i < NH; i++) if (st.first[HANDS[i]] !== 0) return;
    if (prefs && typeof prefs.has === "function") {
      try { if (prefs.has("guide")) return; } catch (e) {}
    }
    var seen = pget("seen", null) || {};
    if (seen.touchCards) st.first.gestures = 1;
    else if (seen.intro) st.first[detect()] = 1;
    else return;
    persist();
  })();

  /* ---------- this run ---------- */
  var used = new Uint8Array(NH * NM);
  var R = { live: false, ended: true, inert: false, practice: false, modeId: "", hasBreath: false,
            hands0: "", cwPiece: 0, ccwPiece: 0, cw3: 0, breathReady: false, breathUsed: false,
            offered: "", declined: false, softPiece: 0, softCounted: false };
  /* An offer appears at most once at each kind of boundary. The epoch
     moves on whenever play resumes after one was shown, so the same pause
     sheet drawn twice shows the same card, and the next pause shows none. */
  var epoch = 0, bump = false, bannerAt = -1, cardAt = -1;
  var paused = false, lastView = null;
  /* Frame times are doubles, and a double written to an ordinary variable
     is boxed afresh on every write; these live in a typed array instead
     (as app.js keeps its clocks): now, a phase's end, the run's start,
     when a depth's name was last seen, the last counted press, the end
     of the demonstration's loops. */
  var TM = new Float64Array(6), T_NOW = 0, T_UNTIL = 1, T_START = 2, T_BANNER = 3, T_ACT = 4, T_DEMO = 5;

  /* ---------- the page ---------- */
  var cap = null, capEb = null, capT = null, capL = null, capN = null, capDots = null, capFt = null,
      capCol = null, capFin = null, btnSkip = null, btnAlt = null, fx = null, fxF = [], fxRing = null,
      bannerEl = null, styled = false;
  var spot = { L: null, x: 0, y: 0, w: 300, compact: true, side: false, have: false };
  var band = { on: false, top: 0, bottom: 0, dodge: false };
  var teachEls = [];
  var fxPos = { kind: "", rel: false, x: -1, y: -1 };

  function ensureStyle() {
    if (styled || !doc) return;
    styled = true;
    if (doc.getElementById("guideStyle")) return;
    var s = doc.createElement("style");
    s.id = "guideStyle";
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }
  function ensureDom() {
    if (cap || !stage) return !!cap;
    ensureStyle();
    cap = doc.createElement("div");
    cap.id = "guide";
    cap.setAttribute("role", "group");
    cap.setAttribute("aria-label", "First steps");
    cap.innerHTML = '<div class="gd-col" aria-hidden="true"></div><div class="gd-b"><div class="gd-eb"></div>' +
      '<div class="gd-t"></div><div class="gd-l"></div><div class="gd-n"></div><div class="gd-fin"></div>' +
      '<div class="gd-ft"><span class="gd-dots" aria-hidden="true"></span>' +
      '<button class="btn quiet gd-alt" type="button" tabindex="-1">Prefer buttons?</button>' +
      '<button class="btn quiet gd-skip" type="button" tabindex="-1">Skip</button></div></div>';
    capCol = cap.firstChild;
    var b = cap.lastChild;
    capEb = b.childNodes[0]; capT = b.childNodes[1]; capL = b.childNodes[2]; capN = b.childNodes[3];
    capFin = b.childNodes[4]; capFt = b.childNodes[5];
    capDots = capFt.childNodes[0]; btnAlt = capFt.childNodes[1]; btnSkip = capFt.childNodes[2];
    btnSkip.addEventListener("click", function (e) { e.preventDefault(); G.skip(); });
    btnAlt.addEventListener("click", function (e) { e.preventDefault(); preferButtons(); });
    capFin.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-gd]") : null;
      if (!t) return;
      e.preventDefault();
      var m = A.move, act = t.getAttribute("data-gd");
      if (act === "done") call(o.done, m, true);
      else if (act === "another") call(o.openMoves);
    });
    stage.appendChild(cap);
    fx = doc.createElement("div");
    fx.id = "guideFx";
    fx.className = "gd-fx";
    fx.setAttribute("aria-hidden", "true");
    fx.innerHTML = FX_HTML;
    fxF = [fx.childNodes[0], fx.childNodes[1], fx.childNodes[2]];
    fxRing = fx.childNodes[3];
    stage.appendChild(fx);
    bannerEl = doc.getElementById("banner");
    return true;
  }
  function still() {
    var m = typeof o.motion === "function" ? call(o.motion) : "full";
    var rm = doc && doc.documentElement.classList.contains("rm");
    return rm || (m !== undefined && m !== "full");
  }

  /* ================================================================
     first steps and the practice well
     ================================================================ */
  var W_WAIT = 1, W_STEP = 2, W_GOOD = 3, W_END = 4, W_FIN = 5;
  var GOOD_MS = 1100, END_MS = 2400, LOOP_MS = 2400, LOOPS = 3, IDLE_MS = 10000, REPLAYS = 2;
  var A = { kind: "", move: "", firstLike: false, steps: null, step: 0, sm: -1, n: 0, need: 1, phase: 0,
            until: 0, t0: -1, delay: 300, banner: false, bannerSeen: 0, lastAct: 0, demoEnd: 0,
            replays: 0, hands: "", ebs: null };

  function stepsFor(firstLike, move) {
    if (!firstLike) return [move];
    return pget("keep", true) !== false ? ["move", "turn", "drop", "keep"] : ["move", "turn", "drop"];
  }
  function needOf(s) { return A.firstLike ? (NEED_FIRST[s] || 1) : (NEED_PRACTICE[s] || 1); }
  function startActive(kind, move, t, banner) {
    A.kind = kind;
    A.move = move;
    A.firstLike = kind === "first" || move === "first";
    A.steps = stepsFor(A.firstLike, move);
    A.step = 0;
    A.n = 0;
    A.sm = moveIx(A.steps[0]);
    A.need = needOf(A.steps[0]);
    A.phase = W_WAIT;
    TM[T_START] = typeof t === "number" && t > 0 ? t : -1;
    A.delay = banner ? 2900 : 300;
    A.banner = !!banner;
    TM[T_BANNER] = 0;
    TM[T_ACT] = 0;
    TM[T_DEMO] = 0;
    A.replays = 0;
    A.hands = handsNow();
    if (kind === "first") persist();
    ensureDom();
    if (!(kind === "practice" && move === "breath")) call(o.hold, true);
  }
  function endActive() {
    A.kind = "";
    A.phase = 0;
    hideCaption();
    stopDemo();
  }

  /* a counted action, during a step */
  function stepAction(a, m) {
    TM[T_ACT] = TM[T_NOW];
    if (A.phase === W_END) { finishFirst(); return; }
    if (A.phase !== W_STEP) return;
    var s = A.steps[A.step], inc = 0;
    if (A.firstLike) {
      if (s === "move") { if (m === M_MOVE) inc = a === "dasLeft" || a === "dasRight" ? 2 : 1; }
      else if (s === "turn") { if (m === M_TURN || m === M_BACK || m === M_HALF) inc = 1; }
      else if (m === A.sm) inc = 1;
    } else if (m === A.sm && m !== M_EASE) inc = m === M_MOVE && (a === "dasLeft" || a === "dasRight") ? 2 : 1;
    if (inc) progress(inc);
  }
  function progress(inc) {
    A.n += inc;
    if (A.n >= A.need) { stepDone(); return; }
    if (!A.firstLike && capEb && A.ebs) { capEb.textContent = A.ebs[A.n]; markDots(A.n); }
  }
  function stepDone() {
    A.phase = W_GOOD;
    TM[T_UNTIL] = TM[T_NOW] + GOOD_MS;
    stopDemo();
    if (cap) {
      /* the card keeps its height while it says so, and grows again with the next step */
      cap.style.minHeight = (cap.offsetHeight || 0) + "px";
      capT.textContent = "That's it.";
      swapIn(capT);
      capL.textContent = "";
      capN.textContent = "";
      markDots(A.firstLike ? A.step + 1 : A.need);
      if (A.ebs && !A.firstLike) capEb.textContent = A.ebs[A.need - 1];
      btnAlt.style.display = "none";
      placeCaption();
    }
    call(o.music, "tap");
    call(o.say, "Done.");
  }
  function nextStep() {
    if (A.step + 1 < A.steps.length) {
      A.step++;
      A.n = 0;
      A.sm = moveIx(A.steps[A.step]);
      A.need = needOf(A.steps[A.step]);
      A.phase = W_STEP;
      paintStep(true);
      return;
    }
    if (A.kind === "first") {
      A.phase = W_END;
      TM[T_UNTIL] = TM[T_NOW] + END_MS;
      paintEnd();
      call(o.music, "chime");
      return;
    }
    /* the practice well: the move is the player's now */
    var h = A.hands;
    if (A.firstLike) st.first[h] = 1;
    else if (moveIx(A.move) >= 0) st.done[h][A.move] = 1;
    persist();
    A.phase = W_FIN;
    paintFin();
    call(o.music, "chime");
  }
  function finishFirst() {
    if (A.kind !== "first") return;
    var h = A.hands;
    st.first[h] = 1;
    st.since = 0;
    persist();
    endActive();
    call(o.hold, false);
  }
  function preferButtons() {
    if (!prefs || !prefs.set) return;
    try { prefs.set("scheme", "buttons"); } catch (e) { tell(e); }
    scheme = "buttons";
    curHands = "buttons";
    A.hands = "buttons";
    if (A.kind && A.phase === W_STEP) { A.step = 0; A.n = 0; A.sm = moveIx(A.steps[0]); A.need = needOf(A.steps[0]); paintStep(true); }
  }
  G.skip = function () {
    if (A.kind !== "first") return;
    st.first[A.hands || handsNow()] = 2;
    st.since = 0;
    persist();
    endActive();
    call(o.hold, false);
  };

  /* ---------- painting the caption (when something changes; never per frame) ---------- */
  function swapIn(el) {
    el.classList.remove("gd-swap");
    void el.offsetWidth;
    el.classList.add("gd-swap");
  }
  /* the dots are drawn once a step; after that only their classes change */
  function paintDots(doneUpTo) {
    if (!capDots) return;
    var s = "", n = A.firstLike ? A.steps.length : A.need;
    if (n <= 1) { capDots.innerHTML = ""; return; }
    for (var i = 0; i < n; i++) s += '<span class="gd-dot">' + CHECK + "</span>";
    capDots.innerHTML = s;
    markDots(doneUpTo);
  }
  function markDots(doneUpTo) {
    var l = capDots ? capDots.childNodes : null;
    if (!l) return;
    for (var i = 0; i < l.length; i++) l[i].className = i < doneUpTo ? "gd-dot ok" : i === doneUpTo ? "gd-dot now" : "gd-dot";
  }
  function eyebrows() {
    var out = [], name = A.firstLike ? "First steps" : "Practice", i;
    if (A.firstLike) out.push(name + " · " + (A.step + 1) + " of " + A.steps.length);
    else for (i = 0; i < A.need; i++) out.push(name + " · " + (i + 1) + " of " + A.need);
    return out;
  }
  function artColumn(s, h) {
    if (h === "keys") {
      var e = env(), labels = keyLabels(s, e), out = "";
      /* turning: the key that turns, and the one that turns it back */
      if (s === "turn") { var back = keyLabels("turnBack", e); if (back.length) labels.push(back[0]); }
      for (var i = 0; i < labels.length; i++) out += '<span class="gd-kc' + (labels[i].length > 3 ? " wide" : "") + '">' + esc(labels[i]) + "</span>";
      return out;
    }
    if (h === "pad") {
      return '<svg class="gd-padf" viewBox="-3 -4 42 34" aria-hidden="true" focusable="false">' +
        padArt(PAD_LIT[s] || "", 0, 0, 1) + "</svg>";
    }
    return "";
  }
  function paintStep(swap) {
    if (!ensureDom()) { sayStep(); return; }
    var h = A.hands = handsNow(), s = A.steps[A.step];
    cap.setAttribute("aria-label", A.firstLike ? "First steps" : "Practice");
    A.ebs = eyebrows();
    capEb.textContent = A.firstLike ? A.ebs[0] : A.ebs[Math.min(A.n, A.need - 1)];
    /* keys and controllers have the keycaps (or the controller) drawn
       large beside the words, so the title says them as plain text */
    capT.innerHTML = h === "keys" || h === "pad" ? esc(words(s, "title", h, 0)) : words(s, "title", h, 1);
    capL.innerHTML = words(s, "line", h, 1);
    capN.textContent = "";
    capFin.innerHTML = "";
    capCol.innerHTML = artColumn(s, h);
    capCol.classList.remove("go");
    if (capCol.innerHTML && !still()) { void capCol.offsetWidth; capCol.classList.add("go"); }
    cap.style.minHeight = "";
    paintDots(A.firstLike ? A.step : A.n);
    btnSkip.style.display = A.kind === "first" ? "" : "none";
    btnAlt.style.display = A.kind === "first" && A.step === 0 && h === "gestures" && o.touch ? "" : "none";
    capFt.style.display = "";
    if (swap) { swapIn(capT); swapIn(capL); }
    placeCaption();
    startDemo(s, h);
    sayStep();
  }
  function sayStep() {
    var h = handsNow(), s = A.steps[A.step];
    var pre = A.phase === W_STEP && A.step === 0 && A.n === 0 ? (A.firstLike ? "First steps. " : "Practice. ") : "";
    call(o.say, pre + words(s, "title", h, 2) + ". " + words(s, "line", h, 2));
  }
  function paintEnd() {
    if (!ensureDom()) return;
    var h = A.hands;
    capEb.textContent = "First steps";
    capT.textContent = "That's all you need.";
    capL.textContent = "The rest comes when it's useful.";
    capN.innerHTML = h === "keys" ? words("pause", "line", h, 1) + " Every key can be changed." : h === "pad" ? words("pause", "line", h, 1) : "";
    capCol.innerHTML = "";
    cap.style.minHeight = "";
    markDots(A.steps.length);
    btnSkip.style.display = "none";
    btnAlt.style.display = "none";
    swapIn(capT); swapIn(capL);
    stopDemo();
    placeCaption();
    call(o.say, "That's all you need. The rest comes when it's useful." +
      (h === "keys" ? " " + words("pause", "line", h, 2) + " Every key can be changed." : h === "pad" ? " " + words("pause", "line", h, 2) : ""));
  }
  function paintFin() {
    if (!ensureDom()) return;
    capEb.textContent = A.firstLike ? "First steps" : "Practice";
    capT.textContent = A.firstLike ? "That's all you need." : "That's it.";
    capL.textContent = A.firstLike ? "The rest comes when it's useful." : "It's yours now.";
    capN.textContent = "";
    capCol.innerHTML = "";
    cap.style.minHeight = "";
    capFt.style.display = "none";
    capFin.innerHTML = '<button class="btn small primary" type="button" data-gd="done">Done</button>' +
      '<button class="btn quiet" type="button" data-gd="another">Practise another</button>';
    swapIn(capT); swapIn(capL);
    stopDemo();
    placeCaption();
    call(o.say, (A.firstLike ? "That's all you need." : "That's it. It's yours now.") + " Done, or practise another.");
    /* keys: Enter finishes (the game's own keys never press a button) */
    if (A.hands === "keys" && capFin.firstChild && capFin.firstChild.focus) {
      try { capFin.firstChild.focus({ preventScroll: true }); } catch (e) { capFin.firstChild.focus(); }
    }
  }
  function showCaption() {
    if (!cap) return;
    cap.classList.add("on");
  }
  function hideCaption() {
    if (!cap) return;
    cap.classList.remove("on");
    if (band.dodge) { band.dodge = false; cap.classList.remove("dodge"); }
    if (doc && cap.contains(doc.activeElement) && doc.activeElement.blur) doc.activeElement.blur();
  }

  /* ---------- where the caption goes ---------- */
  G.layout = function (s) {
    if (!s) return;
    spot.L = s.L || spot.L;
    spot.x = +s.x || 0; spot.y = +s.y || 0; spot.w = +s.w || 300;
    spot.compact = !!s.compact; spot.side = !!s.side; spot.have = true;
    if (fx && spot.L && spot.L.cell) {
      fx.style.setProperty("--c", Math.round(spot.L.cell) + "px");
    }
    fxPos.x = -1; fxPos.y = -1;
    if (A.kind && cap && cap.classList.contains("on")) { placeCaption(); placeStatic(); }
  };
  function placeCaption() {
    if (!cap || !spot.have) return;
    var L = spot.L, w, x, y;
    cap.classList.toggle("compact", spot.compact);
    if (spot.compact && L && L.well) {
      w = Math.max(200, Math.min(L.well.w - 12, 340));
      x = L.well.x + (L.well.w - w) / 2;
      cap.style.width = Math.round(w) + "px";
      y = spot.y || (L.well.y + L.well.h * 0.3);
    } else {
      w = Math.min(spot.w, 340);
      x = spot.x;
      cap.style.width = Math.round(w) + "px";
      y = spot.y;
      var vh = stage.clientHeight || (root.innerHeight || 800), hh = cap.offsetHeight || 150;
      /* never over the numbers (or the Breath ring) in a side column */
      var hud = doc.getElementById("hud");
      if (hud && !hud.classList.contains("off") && hud.offsetHeight) {
        var hr = hud.getBoundingClientRect(), sr = stage.getBoundingClientRect();
        var hl = hr.left - sr.left, ht = hr.top - sr.top, hb = hr.bottom - sr.top;
        if (hl < x + w && hl + hr.width > x && ht < y + hh && hb > y) y = hb + 16;
      }
      if (y + hh > vh - 10) y = Math.max(8, vh - 10 - hh);
    }
    cap.style.left = Math.round(x) + "px";
    cap.style.top = Math.round(y) + "px";
    band.on = !!(spot.compact && L && L.cell);
    if (band.on) {
      band.top = 22 - (y - L.well.y) / L.cell;
      band.bottom = band.top - (cap.offsetHeight || 150) / L.cell;
    }
  }
  function dodge(view) {
    if (!band.on || !cap) return;
    var d = false, a = view && view.active;
    if (a && A.phase !== W_WAIT) {
      var cs = a.cells;
      for (var i = 0; i < 4; i++) if (cs[i][1] <= band.top + 0.5 && cs[i][1] >= band.bottom - 0.5) { d = true; break; }
    }
    if (d !== band.dodge) { band.dodge = d; cap.classList.toggle("dodge", d); }
  }

  /* ---------- the demonstration ---------- */
  function setTeach(on, list) {
    var i;
    for (i = 0; i < teachEls.length; i++) teachEls[i].classList.remove("gd-teach");
    teachEls.length = 0;
    if (!on || !stage) return;
    for (i = 0; i < list.length; i++) {
      var el = stage.querySelector('#pad [data-c="' + list[i] + '"]');
      if (el) { el.classList.add("gd-teach"); teachEls.push(el); }
    }
  }
  var TEACH = { move: [0, 1], ease: [2], drop: [3], turn: [4], turnBack: [5], keep: [7] };
  function stopDemo() {
    setTeach(false);
    if (fx) {
      fx.className = "gd-fx";
      for (var i = 0; i < 3; i++) fxF[i].classList.remove("on");
      fxRing.classList.remove("on");
    }
    if (capCol) capCol.classList.remove("go");
    fxPos.kind = ""; fxPos.rel = false;
    TM[T_DEMO] = 0;
  }
  function startDemo(s, h) {
    stopDemo();
    TM[T_DEMO] = TM[T_NOW] + LOOPS * LOOP_MS;
    A.replays = 0;
    /* Breath is the ring in the HUD, whatever the hands */
    if (s === "breath") { ringOn(breathRect()); return; }
    if (h === "buttons") { if (TEACH[s]) setTeach(true, TEACH[s]); return; }
    if (h !== "gestures" || !fx) return;
    var any = pget("tap", "sides") === "anywhere", kind = s, rel = false;
    if (s === "move" || s === "drop" || s === "ease" || s === "keep") rel = true;
    if (s === "turn") kind = any ? "tapAB" : "turn";
    else if (s === "turnBack") kind = any ? "tapB2" : "tapB";
    else if (s === "half") kind = "tapB2";
    fxPos.kind = kind; fxPos.rel = rel; fxPos.x = -1; fxPos.y = -1;
    var cls = "gd-fx on k-" + (kind === "tapAB" ? "turn" : kind === "tapB2" ? "tapB" : kind) + (still() ? " still" : "");
    fx.className = cls;
    placeStatic();
    placeRel(lastView);
    arrows(s, any);
  }
  /* which arrow each still fingertip carries: f1 is the piece's own (or
     the right-hand tap), f2 the left-hand tap or the niche, f3 a second finger */
  function arrows(s, any) {
    var a1 = s === "move" ? STILL_ARROW.move : s === "drop" ? STILL_ARROW.drop : s === "ease" ? STILL_ARROW.ease
           : s === "keep" ? STILL_ARROW.keep : s === "turn" ? STILL_ARROW.tap : "";
    var a2 = (s === "turn" && !any) || (s === "turnBack" && !any) ? STILL_ARROW.tapBack : "";
    var list = [a1, a2, ""];
    for (var i = 0; i < 3; i++) {
      var svg = fxF[i].querySelector(".gd-arw");
      if (svg) svg.innerHTML = list[i];
    }
  }
  function breathRect() {
    var b = doc ? doc.getElementById("btnBreath") : null;
    if (!b || !stage) return null;
    var r = b.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    if (!(r.width > 0)) return null;
    return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height };
  }
  function ringOn(r) {
    if (!r || !fx) return;
    var pad = 5, size = Math.max(r.w, r.h) + pad * 2;
    fxRing.style.width = Math.round(size) + "px";
    fxRing.style.height = Math.round(size) + "px";
    fxRing.style.transform = "translate3d(" + Math.round(r.x + r.w / 2 - size / 2) + "px," + Math.round(r.y + r.h / 2 - size / 2) + "px,0)";
    fxRing.classList.add("on");
    fx.className = "gd-fx on k-breath" + (still() ? " still" : "");
  }
  function at(el, x, y) { el.style.transform = "translate3d(" + Math.round(x) + "px," + Math.round(y) + "px,0)"; }
  /* the fingertips that don't follow the piece: taps on the halves of the
     well (low, below the caption and above an early stack), the niche */
  function placeStatic() {
    if (!fx || !fxPos.kind || !spot.L || !spot.L.well) return;
    var L = spot.L, w = L.well, c = L.cell || 30, ty = w.y + w.h * 0.74, k = fxPos.kind;
    fx.style.setProperty("--c", Math.round(c) + "px");
    for (var i = 0; i < 3; i++) fxF[i].classList.remove("on");
    if (k === "turn") {
      at(fxF[0], w.x + w.w * 0.75, ty); at(fxF[1], w.x + w.w * 0.25, ty);
      fxF[0].classList.add("on"); fxF[1].classList.add("on");
    } else if (k === "tapAB") {
      at(fxF[0], w.x + w.w * 0.5, ty); at(fxF[1], w.x + w.w * 0.5 - c * 0.6, ty); at(fxF[2], w.x + w.w * 0.5 + c * 0.6, ty);
      fxF[0].classList.add("on"); fxF[1].classList.add("on"); fxF[2].classList.add("on");
    } else if (k === "tapB") {
      at(fxF[1], w.x + w.w * 0.25, ty); fxF[1].classList.add("on");
    } else if (k === "tapB2") {
      at(fxF[1], w.x + w.w * 0.5 - c * 0.6, ty); at(fxF[2], w.x + w.w * 0.5 + c * 0.6, ty);
      fxF[1].classList.add("on"); fxF[2].classList.add("on");
    } else if (k === "keep" && L.keep) {
      var kr = L.keep, size = Math.max(kr.w, kr.h) + 10;
      fxRing.style.width = Math.round(size) + "px"; fxRing.style.height = Math.round(size) + "px";
      at(fxRing, kr.x + kr.w / 2 - size / 2, kr.y + kr.h / 2 - size / 2);
      fxRing.classList.add("on");
      at(fxF[1], kr.x + kr.w / 2, kr.y + kr.h / 2);
      fxF[1].classList.add("on");
    }
    if (fxPos.rel) fxF[0].classList.add("on");
  }
  /* the fingertip that follows the piece: placed under it, written only
     when the piece has moved a whole pixel */
  function placeRel(view) {
    if (!fxPos.rel || !view || !view.active || !spot.L || !spot.L.well) return;
    var L = spot.L, c = L.cell || 30, cs = view.active.cells, sx = 0, lo = 99;
    for (var i = 0; i < 4; i++) { sx += cs[i][0]; if (cs[i][1] < lo) lo = cs[i][1]; }
    var x = Math.round(L.well.x + (sx / 4 + 0.5) * c);
    var bottom = L.well.y + (22 - lo) * c;
    var y = Math.round(bottom + (fxPos.kind === "move" ? c * 2 + 22 : c * 0.55 + 22));
    if (x === fxPos.x && y === fxPos.y) return;
    fxPos.x = x; fxPos.y = y;
    fxF[0].style.transform = "translate3d(" + x + "px," + y + "px,0)";
  }
  function replay() {
    A.replays++;
    TM[T_DEMO] = TM[T_NOW] + LOOPS * LOOP_MS;
    if (fx && fxPos.kind && !still()) {
      var cls = fx.className;
      fx.className = "gd-fx";
      void fx.offsetWidth;
      fx.className = cls;
    }
    if (capCol && capCol.innerHTML && !still()) { capCol.classList.remove("go"); void capCol.offsetWidth; capCol.classList.add("go"); }
  }

  /* ================================================================
     the app's calls
     ================================================================ */
  G.hands = function () { return handsNow(); };
  G.handsName = function (h) { return Guide.handsName(h || handsNow()); };
  G.setHands = function (h) {
    if (handsIx(h) < 0) return;
    curHands = h;
    if (A.kind && A.phase === W_STEP) paintStep(false);
  };
  G.padGlyphs = function () {
    var fam = padFam(), f = PAD[fam];
    return { turn: f.A, back: f.B, flip: f.Y, keep: fam === "words" ? f.LB : f.LB + " or " + f.RB,
             breath: f.LT, pause: f.menu, family: fam };
  };
  G.words = function (move, form, hands) { return words(move, form, hands || handsNow(), 0); };
  G.art = function (move, hands, size) { ensureStyle(); return Guide.art(move, hands || handsNow(), size, env()); };
  G.state = function () { return JSON.parse(JSON.stringify(st)); };
  G.active = function () {
    if (!A.kind) return null;
    return { kind: A.kind, move: A.firstLike && A.kind === "first" ? A.steps[A.step] : A.move,
             step: A.firstLike ? A.step + 1 : Math.min(A.n + 1, A.need),
             of: A.firstLike ? A.steps.length : A.need };
  };
  G.firstDone = function (h) { var x = h && handsIx(h) >= 0 ? h : handsNow(); return st.first[x] !== 0; };

  G.runStart = function (ctx) {
    ctx = ctx || {};
    if (!R.ended && R.live) G.runEnd("restart");
    if (A.kind) endActive();
    reload();
    scheme = pget("scheme", "gestures");
    for (var i = 0; i < used.length; i++) used[i] = 0;
    R.live = true; R.ended = false;
    R.inert = !!ctx.steady;
    R.practice = !!ctx.practice || ctx.modeId === "practice";
    R.modeId = String(ctx.modeId || "");
    R.hasBreath = !!ctx.hasBreath;
    R.hands0 = detect();
    R.cwPiece = 0; R.ccwPiece = 0; R.cw3 = 0; R.breathReady = false; R.breathUsed = false;
    R.offered = ""; R.declined = false; R.softPiece = 0; R.softCounted = false;
    epoch++; bump = false; bannerAt = -1; cardAt = -1; paused = false;
    if (R.inert) return "";
    if (R.practice) {
      var mv = ctx.move === "first" || moveIx(ctx.move) >= 0 ? ctx.move : "drop";
      startActive("practice", mv, ctx.t, false);
      return "practice";
    }
    if ((R.modeId === "descent" || R.modeId === "drift") && !ctx.restored && !ctx.timed && !ctx.lesson) {
      for (var h = 0; h < NH; h++) if (st.first[HANDS[h]] !== 0) return "";
      startActive("first", "first", ctx.t, R.modeId === "descent");
      return "first";
    }
    return "";
  };
  G.runEnd = function (why) {
    if (R.ended) return;
    R.ended = true;
    R.live = false;
    if (R.inert) { if (A.kind) endActive(); return; }
    var h = handsNow();
    if (A.kind === "first") {
      /* left part-way: the Moves page has them whenever they're wanted */
      st.first[A.hands || h] = 2;
      st.since = 0;
    }
    if (A.kind) endActive();
    if (!R.practice) {
      for (var hi = 0; hi < NH; hi++) {
        for (var m = 0; m < NM; m++) {
          if (!used[hi * NM + m]) continue;
          var r = st.runs[HANDS[hi]];
          if (r[MOVES[m]] < 9) r[MOVES[m]]++;
        }
      }
      var d = st.dry[h];
      if (R.breathUsed) d.breath = 0;
      else if (R.breathReady && d.breath < 999) d.breath++;
      if (st.sinceRuns < 99) st.sinceRuns++;
    }
    persist();
  };
  G.action = function (a, meta, ok) {
    if (!ok || !R.live || R.inert) return;
    var src = meta ? meta.source : null;
    if (src) {
      var nh = src === "touch" ? (scheme === "buttons" ? "buttons" : "gestures") : src === "button" ? "buttons"
             : src === "key" ? "keys" : src === "pad" ? "pad" : "";
      if (nh && nh !== curHands) {
        curHands = nh;
        if (A.kind && (A.phase === W_STEP || A.phase === W_END) && nh !== A.hands) {
          A.hands = nh;
          if (A.phase === W_STEP) paintStep(false); else paintEnd();
        }
      }
    }
    var m = ACT_MOVE[a];
    if (m === undefined) return;
    var hi = handsIx(curHands || R.hands0);
    if (hi < 0) hi = 2;
    used[hi * NM + m] = 1;
    st.dry[HANDS[hi]][MOVES[m]] = 0;
    if (m === M_TURN) R.cwPiece++;
    else if (m === M_BACK) R.ccwPiece++;
    else if (m === M_BREATH) R.breathUsed = true;
    if (A.kind) stepAction(a, m);
  };
  G.event = function (ev) {
    if (!ev || !R.live || R.inert) return;
    var t = ev.t;
    if (t === "lock") {
      if (!R.practice) {
        var d = st.dry[curHands || R.hands0 || "keys"];
        if (d) {
          for (var i = 0; i < NM; i++) {
            if (i === M_BREATH) continue;
            var k = MOVES[i];
            if (d[k] < 999) d[k]++;
          }
        }
        if (st.since < 999) st.since++;
      }
      if (R.cwPiece === 3 && R.ccwPiece === 0) R.cw3++;
      R.cwPiece = 0; R.ccwPiece = 0; R.softPiece = 0; R.softCounted = false;
    } else if (t === "spawn" || t === "hold") {
      R.softPiece = 0; R.softCounted = false;
    } else if (t === "soft") {
      R.softPiece += ev.rows | 0;
      if (!R.softCounted && R.softPiece >= 3) {
        R.softCounted = true;
        if (A.kind && A.phase === W_STEP && A.sm === M_EASE && !A.firstLike) { TM[T_ACT] = TM[T_NOW]; progress(1); }
      }
    }
  };
  G.note = function (name) {
    if (name === "breathReady" && R.live && !R.inert) R.breathReady = true;
  };
  G.pause = function () {
    paused = true;
    if (A.kind) { hideCaption(); stopDemo(); }
    if (R.live && !R.inert) persist();
  };
  G.resume = function () {
    if (!paused) return;
    paused = false;
    epoch++;
    scheme = pget("scheme", scheme);
    if (!A.kind || !cap) return;
    if (A.phase === W_STEP) { paintStep(false); showCaption(); }
    else if (A.phase === W_GOOD || A.phase === W_END || A.phase === W_FIN) {
      if (A.phase === W_FIN) paintFin(); else if (A.phase === W_END) paintEnd();
      showCaption();
    }
  };
  /* tMs: the frame's time; or, so nothing is boxed on the way in, the
     app's own clock array and the index of the frame's time in it */
  G.frame = function (view, tMs, ix) {
    if (bump) { epoch++; bump = false; }
    if (!A.kind) return;
    /* two plain stores, never one expression that could be either kind:
       a value that might be a boxed number or a raw double is boxed */
    if (typeof tMs === "number") TM[T_NOW] = tMs;
    else if (tMs && typeof ix === "number") TM[T_NOW] = tMs[ix];
    if (TM[T_START] < 0) TM[T_START] = TM[T_NOW];
    if (A.phase === W_WAIT) {
      if (TM[T_NOW] < TM[T_START] + A.delay) return;
      /* on a phone the caption shares the well with a depth's name: it
         waits for the name to have faded (700 ms), and a moment more */
      if (spot.compact && bannerEl && bannerEl.classList.contains("on") && TM[T_NOW] < TM[T_START] + 9000) {
        TM[T_BANNER] = TM[T_NOW];
        return;
      }
      if (TM[T_BANNER] > 0 && TM[T_NOW] < TM[T_BANNER] + 900) return;
      A.phase = W_STEP;
      paintStep(false);
      showCaption();
      TM[T_ACT] = TM[T_NOW];
      return;
    }
    if (A.phase === W_GOOD) { if (TM[T_NOW] >= TM[T_UNTIL]) nextStep(); }
    else if (A.phase === W_END) { if (TM[T_NOW] >= TM[T_UNTIL]) { finishFirst(); return; } }
    else if (A.phase === W_STEP && TM[T_DEMO] > 0 && TM[T_NOW] > TM[T_DEMO] && A.replays < REPLAYS &&
             TM[T_NOW] - (TM[T_ACT] > TM[T_DEMO] ? TM[T_ACT] : TM[T_DEMO]) >= IDLE_MS) replay();
    lastView = view || lastView;
    if (view && cap) { dodge(view); if (A.phase === W_STEP) placeRel(view); }
  };

  /* ================================================================
     a move to try
     ================================================================ */
  G.offer = function (where, ctx) {
    ctx = ctx || {};
    if (R.inert || ctx.steady) return null;
    var card = where === "pause" || where === "run" || where === "chapter";
    if (where === "banner" && bannerAt >= 0 && bannerAt !== epoch) return null;
    if (card && cardAt >= 0 && cardAt !== epoch) return null;
    if (R.offered && R.offered !== "hands") {
      var mi = moveIx(R.offered);
      for (var hi = 0; mi >= 0 && hi < NH; hi++) if (used[hi * NM + mi]) return null;
    }
    var h = handsNow();
    var dctx = {
      where: where, modeId: ctx.modeId || R.modeId, steady: !!ctx.steady, timed: !!ctx.timed,
      lesson: !!ctx.lesson, silt: !!ctx.silt, practice: !!ctx.practice || R.practice,
      playMs: +ctx.playMs || 0, userOpened: !!ctx.userOpened,
      hasBreath: ctx.hasBreath !== undefined ? !!ctx.hasBreath : R.hasBreath,
      depth: ctx.depth | 0, hands: h, busy: !!A.kind, offered: R.offered, declined: R.declined, cw3: R.cw3
    };
    var e = env();
    var m = Guide.decide(st, dctx, e);
    if (!m) return null;
    if (!R.offered) {
      if (st.offers[m] < 9) st.offers[m]++;
      st.since = 0;
      st.sinceRuns = 0;
      R.offered = m;
      persist();
    }
    if (where === "banner") bannerAt = epoch; else cardAt = epoch;
    bump = true;
    return { move: m, where: where, title: Guide.text(m, h, "tipTitle", e), text: Guide.text(m, h, "tip", e),
             short: m === "drop" ? Guide.text(m, h, "short", e) : "" };
  };
  /* "Not now": remembered (twice and the move is never offered again),
     and nothing else is offered for the rest of this run */
  G.notNow = function (m) {
    if (OFFER_IDS.indexOf(m) < 0) return;
    if (st.later[m] < 2) st.later[m]++;
    R.declined = true;
    persist();
  };
  G.renderTip = function (el, offer) {
    if (!el) return;
    if (!offer || !doc) { el.innerHTML = ""; return; }
    ensureStyle();
    var h = handsNow(), e = env(), m = offer.move, id = "gdTip" + (++uid);
    e.html = true;
    el.innerHTML = '<div class="gd-tip" role="group" aria-labelledby="' + id + '">' +
      '<div class="gd-tip-art" aria-hidden="true">' + Guide.art(m === "hands" ? "move" : m, h, 56, e) + "</div>" +
      '<div class="gd-tip-b"><div class="gd-eb">A move to try</div>' +
      '<div class="gd-tip-t" id="' + id + '">' + esc(offer.title) + "</div>" +
      '<p class="gd-tip-s">' + Guide.text(m, h, "tip", e) + "</p>" +
      '<div class="gd-tip-a"><button class="btn small" type="button" data-gd="try">Try it</button>' +
      '<button class="btn quiet" type="button" data-gd="later">Not now</button></div></div></div>';
    var card = el.firstChild, where = offer.where;
    card.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("[data-gd]") : null;
      if (!b) return;
      ev.preventDefault();
      if (b.getAttribute("data-gd") === "try") { call(o.practice, m === "hands" ? "first" : m, where); return; }
      G.notNow(m);
      /* the card folds away; focus goes to whatever comes next */
      var had = doc.activeElement && card.contains(doc.activeElement);
      var next = had && card.parentNode ? card.parentNode.nextElementSibling : null;
      card.classList.add("gone");
      card.setAttribute("aria-hidden", "true");
      var btns = card.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
      setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 260);
      if (next && next.querySelector) {
        var f = next.querySelector("button, [href], [tabindex]");
        if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch (x) { f.focus(); } }
      }
    });
    var sp = env();
    sp.spoken = true;
    call(o.say, "A move to try. " + offer.title + ". " + Guide.text(m, h, "tip", sp));
  };

  /* ================================================================
     the Moves page
     ================================================================ */
  var mvView = "";
  function kindsHere() {
    var out = [], i;
    for (i = 0; i < NH; i++) {
      var hh = HANDS[i], have = false;
      if (hh === "gestures" || hh === "buttons") have = !!o.touch;
      else if (hh === "keys") have = !!o.fine || !o.touch || curHands === "keys";
      else have = !!padNow() || curHands === "pad";
      if (!have) {
        if (st.first[hh] >= 1) have = true;
        for (var m = 0; !have && m < NM; m++) if (st.runs[hh][MOVES[m]] > 0) have = true;
      }
      if (have || hh === handsNow()) out.push(hh);
    }
    return out;
  }
  G.renderMoves = function (el, opts) {
    if (!el || !doc) return;
    ensureStyle();
    opts = opts || {};
    var cur = handsNow(), kinds = kindsHere();
    if (kinds.indexOf(mvView) < 0) mvView = cur;
    var h = mvView, mine = h === cur, e = env(), i;
    e.html = true;
    var lead = { gestures: "With gestures, on this device.", buttons: "With the button tray.",
                 keys: "With the keyboard.", pad: "With a controller." };
    var s = '<div class="gd-mv"><p class="gd-mv-lead">' + lead[h] + "</p>";
    if (kinds.length > 1) {
      s += '<div class="gd-mv-for"><div class="seg" role="radiogroup" aria-label="Show the moves for">';
      for (i = 0; i < kinds.length; i++) {
        var on = kinds[i] === h;
        s += '<button type="button" role="radio" aria-checked="' + on + '" tabindex="' + (on ? 0 : -1) +
          '" data-gd-h="' + kinds[i] + '">' + HANDS_NAME[kinds[i]] + "</button>";
      }
      s += "</div>" + (mine ? "" : '<p class="gd-mv-ro">For reference. Practice is for the hands in use: ' +
        esc(HANDS_NAME[cur].toLowerCase()) + ".</p>") + "</div>";
    }
    s += '<div class="list gd-mv-list">';
    var order = ["move", "turn", "turnBack", "drop", "ease", "keep", "breath", "half", "pause"];
    for (i = 0; i < order.length; i++) {
      var mv = order[i];
      if (mv === "half" && !available("half", h, e)) continue;
      var how = Guide.text(mv, h, "how", e);
      if (!how) continue;
      var nid = "gdMv" + (++uid);
      s += '<div class="li gd-mv-row"><span class="gd-mv-art" aria-hidden="true">' + Guide.art(mv, h, 48, e) + "</span>" +
        '<span class="li-t"><span class="gd-mv-n" id="' + nid + '">' + esc(WORDS[mv].name) + VH_STOP +
        (mv !== "pause" && learned(st, mv, h) ? '<span class="gd-mv-ok">' + STONE + "Learned" + VH_STOP + "</span>" : "") + "</span>" +
        '<span class="gd-mv-how">' + how + VH_STOP + "</span>" +
        '<span class="gd-mv-why">' + esc(WORDS[mv].why) + "</span></span><span class=\"gd-mv-r\">";
      if (mv !== "pause" && mine) {
        s += '<button class="btn small" type="button" data-gd-p="' + mv + '" aria-describedby="' + nid + '">Practise</button>';
      }
      s += "</span></div>";
    }
    s += "</div>";
    if (mine) s += '<button class="btn gd-mv-again" type="button" data-gd-p="first">Take the first steps again</button>';
    s += '<div class="list gd-mv-tips"><button class="sw" type="button" role="switch" aria-checked="' + !!st.tips +
      '" data-gd="tips" aria-labelledby="gdTipsT" aria-describedby="gdTipsD"><span class="sw-t"><span id="gdTipsT">Suggest moves I haven’t tried</span>' +
      '<span class="sw-s" id="gdTipsD">Now and then, between runs. Never in Steady.</span></span>' +
      '<span class="sw-k" aria-hidden="true"></span></button></div>' +
      '<div class="gd-mv-forget"><button class="btn quiet" type="button" data-gd="forget">Forget what the well noticed</button>' +
      '<span class="gd-mv-st" role="status"></span></div>' +
      '<p class="gd-mv-note">Counted on this device only. Nothing is sent anywhere.</p></div>';
    el.innerHTML = s;
    if (!el.getAttribute("data-gd-wired")) {
      el.setAttribute("data-gd-wired", "1");
      el.addEventListener("click", function (ev) { movesClick(el, ev); });
      el.addEventListener("keydown", function (ev) { movesKey(el, ev); });
    }
    el._gdOpts = opts;
  };
  function movesClick(el, ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest("[data-gd-p],[data-gd],[data-gd-h]") : null;
    if (!t || !el.contains(t)) return;
    ev.preventDefault();
    var opts = el._gdOpts || {};
    var from = opts.from === "pause" || opts.from === "run" || opts.from === "chapter" ? opts.from : "moves";
    if (t.hasAttribute("data-gd-p")) { call(o.practice, t.getAttribute("data-gd-p"), from); return; }
    if (t.hasAttribute("data-gd-h")) {
      mvView = t.getAttribute("data-gd-h");
      G.renderMoves(el, opts);
      var b = el.querySelector('[data-gd-h="' + mvView + '"]');
      if (b) b.focus();
      return;
    }
    var act = t.getAttribute("data-gd");
    if (act === "tips") {
      st.tips = !st.tips;
      persist();
      t.setAttribute("aria-checked", String(st.tips));
    } else if (act === "forget") {
      var keepTips = st.tips, keepFirst = st.first;
      st = Guide.blank();
      st.tips = keepTips;
      st.first = keepFirst;
      for (var i = 0; i < used.length; i++) used[i] = 0;
      persist();
      G.renderMoves(el, opts);
      var stEl = el.querySelector(".gd-mv-st"), f = el.querySelector('[data-gd="forget"]');
      if (f) f.focus();
      if (stEl) stEl.textContent = "Done.";
    }
  }
  /* the hands switch is a radio group: arrows move along it */
  function movesKey(el, ev) {
    var t = ev.target;
    if (!t || !t.hasAttribute || !t.hasAttribute("data-gd-h")) return;
    var k = ev.key, d = k === "ArrowRight" || k === "ArrowDown" ? 1 : k === "ArrowLeft" || k === "ArrowUp" ? -1 : 0;
    if (!d) return;
    ev.preventDefault();
    var all = el.querySelectorAll("[data-gd-h]"), i = 0;
    for (; i < all.length; i++) if (all[i] === t) break;
    var next = all[(i + d + all.length) % all.length];
    if (next) next.click();
  }

  /* the drawings and cards may be asked for before anything is shown */
  ensureStyle();

  /* Another tab, a tool or a reset wrote the notebook: take it, unless
     this run is still counting (the next run start reads it again). The
     keys and touch settings change the words, so a caption showing redraws. */
  if (prefs && typeof prefs.on === "function") {
    prefs.on(function (k) {
      if (k === "guide") { if (!writing && !R.live) reload(); return; }
      if (k === "scheme") scheme = pget("scheme", scheme);
      if ((k === "keys" || k === "tap" || k === "landing" || k === "scheme") && A.kind && A.phase === W_STEP && !paused) paintStep(false);
    });
  }
  return G;
};

if (typeof module !== "undefined" && module.exports) module.exports = Guide;
else root.Guide = Guide;
})(typeof self !== "undefined" ? self : this);
