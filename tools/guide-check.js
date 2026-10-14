/* guide-check.js — dev-only. The guide's manners, checked rather than hoped.

   well/guide.js teaches the moves and, now and then, offers one the player
   hasn't found. Everything calm about that is a rule that breaks silently:
   an offer that slips into Steady, a second move suggested in the same
   run, a "Not now" that is forgotten after a reload, a line under a depth's
   name that runs to two lines, a word another game made famous. So each
   rule is a check here, run against the file as it ships:

     · Guide.decide — never in Steady, a lesson or the practice well, never
       with the offers switched off; one move a run; "Not now" twice, three
       offers, or a move already learned, and it is never offered again;
       the banner line is the drop's alone, in a Descent, from Depth 2; the
       pause sheet needs to have been opened by the player after half a
       minute of play; the drop waits for exactly thirty pieces; the order
       of the moves; the spacing between offers.
       A first game with no first steps in it (a Forty, say) may be asked,
       on its run card only, whether a look at the moves would help.
     · Guide.text — every move, for every kind of hands and every form,
       under every setting that changes the words: no borrowed label, no
       "!", no "you haven't", nothing unresolved in braces, and every line
       meant for a depth's banner short enough to sit under it.
     · where the caption sits on a phone's well — below the piece waiting
       at the mouth, above the taps the demonstration shows, its buttons in
       the well's upper part, away from the thumbs — on the wells layout.js
       draws, at every text size.
     · Guide.repair — anything at all becomes a notebook of the right shape,
       and prefs.js accepts what the guide writes back.
     · an instance, with no page — first steps hold gravity and let it go,
       end by saying what the game is for, and never count as an offer;
       Skip is remembered; a second Keep for one piece is explained; Steady
       counts nothing; an offer comes after thirty pieces without a drop,
       counts once it is seen, outlives a drop made before it, and "Not
       now" holds across a reload; and the paths that run for every press
       and every frame allocate nothing a garbage collector would have to
       come for.

   Run: node tools/guide-check.js                                          */
"use strict";
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "well");
let fails = 0;
function ok(what, cond, detail) {
  if (cond) console.log("  ✓ " + what);
  else { fails++; console.log("  ✗ " + what + (detail ? " — " + detail : "")); }
}
function section(title) { console.log("\n──  " + title); }
function guarded(title, fn) {
  section(title);
  try { fn(); } catch (e) { ok("could check this at all", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")); }
}

global.self = global.self || {};
let Guide = null;
section("the guide loads in node, with no page around it");
try {
  Guide = require(path.join(DIR, "guide.js"));
  ok("well/guide.js loads and exports Guide", !!Guide && typeof Guide.decide === "function" &&
     typeof Guide.text === "function" && typeof Guide.repair === "function" && typeof Guide.create === "function");
} catch (e) {
  ok("well/guide.js loads", false, String(e && e.message || e).split("\n")[0]);
}
if (!Guide) { console.log("\nFAILED: guide.js didn't load"); process.exit(1); }

const MOVES = Guide.MOVES, HANDS = Guide.HANDS;

/* a notebook in a known state: everyone has had their first steps */
function book(over) {
  const b = Guide.blank();
  for (const h of HANDS) b.first[h] = 1;
  b.since = 999; b.sinceRuns = 99;
  if (over) over(b);
  return b;
}
const ENV = { keep: true, modern: false, tap: "sides" };
function ctx(over) {
  return Object.assign({ where: "pause", modeId: "descent", steady: false, timed: false, lesson: false, silt: false,
    practice: false, playMs: 60000, userOpened: true, hasBreath: true, depth: 3, hands: "gestures",
    busy: false, offered: "", declined: false, cw3: 0 }, over || {});
}
const dryDrop = (n) => book((b) => { b.dry.gestures.drop = n; });

/* ================================================================
   1. deciding
   ================================================================ */
guarded("Guide.decide: when, and when never", () => {
  const b = dryDrop(30);
  ok("thirty pieces without a drop, at a pause the player opened: the drop", Guide.decide(b, ctx(), ENV) === "drop");
  ok("…and not at twenty-nine", Guide.decide(dryDrop(29), ctx(), ENV) === null);
  ok("never in Steady", Guide.decide(b, ctx({ steady: true }), ENV) === null);
  ok("never in a lesson", Guide.decide(b, ctx({ modeId: "challenges", lesson: true, where: "run" }), ENV) === null);
  ok("…but a silt well's run card may", Guide.decide(b, ctx({ modeId: "challenges", lesson: true, silt: true, where: "run" }), ENV) === "drop");
  ok("never in the practice well", Guide.decide(b, ctx({ practice: true }), ENV) === null);
  ok("never while first steps or a practice are under way", Guide.decide(b, ctx({ busy: true }), ENV) === null);
  const off = dryDrop(30); off.tips = false;
  for (const where of ["pause", "run", "chapter", "banner"]) {
    ok("never with the offers switched off (" + where + ")",
       Guide.decide(off, ctx({ where, modeId: where === "chapter" ? "drift" : "descent" }), ENV) === null);
  }
  ok("the pause sheet needs the player to have opened it", Guide.decide(b, ctx({ userOpened: false }), ENV) === null);
  ok("…and half a minute of play", Guide.decide(b, ctx({ playMs: 29999 }), ENV) === null &&
     Guide.decide(b, ctx({ playMs: 30000 }), ENV) === "drop");
  ok("…in a Descent or a Drift only", Guide.decide(b, ctx({ modeId: "forty" }), ENV) === null &&
     Guide.decide(b, ctx({ modeId: "drift" }), ENV) === "drop");
  ok("the run card: Descent, Drift, Forty, Three Minutes, after half a minute",
     ["descent", "drift", "forty", "three"].every((m) => Guide.decide(b, ctx({ where: "run", modeId: m }), ENV) === "drop") &&
     Guide.decide(b, ctx({ where: "run", playMs: 20000 }), ENV) === null &&
     Guide.decide(b, ctx({ where: "run", modeId: "steady" }), ENV) === null);
  ok("the chapter card is Drift's alone", Guide.decide(b, ctx({ where: "chapter", modeId: "drift" }), ENV) === "drop" &&
     Guide.decide(b, ctx({ where: "chapter", modeId: "descent" }), ENV) === null);
  ok("a place nobody asked for gets nothing", Guide.decide(b, ctx({ where: "hud" }), ENV) === null);
  ok("a brand-new player gets nothing: their first steps are coming",
     Guide.decide(Object.assign(Guide.blank(), { dry: dryDrop(30).dry }), ctx(), ENV) === null);
  const fresh = (over) => { const b = Guide.blank(); if (over) over(b); return b; };
  ok("…unless the first game had no first steps in it: a Forty's run card asks about the moves",
     Guide.decide(fresh(), ctx({ where: "run", modeId: "forty" }), ENV) === "hands" &&
     Guide.decide(fresh(), ctx({ where: "run", modeId: "three" }), ENV) === "hands" &&
     ["pause", "banner", "chapter"].every((w) => Guide.decide(fresh(), ctx({ where: w, modeId: w === "chapter" ? "drift" : "descent" }), ENV) === null));
  ok("…at most three times, and never after Not now twice, or with the offers off",
     Guide.decide(fresh((b) => { b.offers.hands = 3; }), ctx({ where: "run", modeId: "forty" }), ENV) === null &&
     Guide.decide(fresh((b) => { b.later.hands = 2; }), ctx({ where: "run", modeId: "forty" }), ENV) === null &&
     Guide.decide(fresh((b) => { b.tips = false; }), ctx({ where: "run", modeId: "forty" }), ENV) === null &&
     Guide.decide(fresh(), ctx({ where: "run", modeId: "forty", steady: true }), ENV) === null);
});

guarded("Guide.decide: the line under a depth's name", () => {
  const b = dryDrop(30);
  ok("in a Descent from Depth 2, the drop", Guide.decide(b, ctx({ where: "banner", depth: 2 }), ENV) === "drop");
  ok("not at Depth 1", Guide.decide(b, ctx({ where: "banner", depth: 1 }), ENV) === null);
  ok("not in a Drift", Guide.decide(b, ctx({ where: "banner", modeId: "drift", depth: 4 }), ENV) === null);
  const k = book((x) => { x.dry.gestures.keep = 500; });
  ok("only ever the drop: a waiting Keep is not a banner line",
     Guide.decide(k, ctx({ where: "banner", depth: 5 }), ENV) === null && Guide.decide(k, ctx(), ENV) === "keep");
  ok("…and not after another move was offered this run",
     Guide.decide(dryDrop(30), ctx({ where: "banner", depth: 3, offered: "keep" }), ENV) === null);
});

guarded("Guide.decide: one move a run, and never again when it's done", () => {
  const all = book((x) => {
    x.dry.gestures.drop = 999; x.dry.gestures.keep = 999; x.dry.gestures.turnBack = 999;
    x.dry.gestures.breath = 9; x.dry.gestures.ease = 999; x.dry.gestures.half = 999; x.runs.gestures.drop = 1;
  });
  let second = true;
  for (const m of MOVES.concat(["hands"])) {
    for (const where of ["pause", "run", "banner"]) {
      const got = Guide.decide(all, ctx({ where, offered: m, cw3: 9 }), Object.assign({}, ENV, { modern: true }));
      if (got !== null && got !== m) second = false;
    }
  }
  ok("a second ask in the same run gives the same move or nothing", second);
  ok("…and nothing after Not now this run", Guide.decide(all, ctx({ declined: true }), ENV) === null);
  ok("the run that offered it may say it again, even on its third offer",
     Guide.decide(book((x) => { x.dry.gestures.drop = 40; x.offers.drop = 3; }), ctx({ offered: "drop" }), ENV) === "drop");
  ok("Not now twice: never again", Guide.decide(book((x) => { x.dry.gestures.drop = 999; x.later.drop = 2; }), ctx(), ENV) === null);
  ok("…once is not twice", Guide.decide(book((x) => { x.dry.gestures.drop = 999; x.later.drop = 1; }), ctx(), ENV) === "drop");
  ok("three offers: never again", Guide.decide(book((x) => { x.dry.gestures.drop = 999; x.offers.drop = 3; }), ctx(), ENV) === null);
  ok("learned in three runs: never", Guide.decide(book((x) => { x.dry.gestures.drop = 999; x.runs.gestures.drop = 3; }), ctx(), ENV) === null);
  ok("learned by practice: never", Guide.decide(book((x) => { x.dry.gestures.drop = 999; x.done.gestures.drop = 1; }), ctx(), ENV) === null);
  ok("learned on glass says nothing about the keys",
     Guide.decide(book((x) => { x.dry.keys.drop = 999; x.runs.gestures.drop = 3; }), ctx({ hands: "keys" }), ENV) === "drop");
});

guarded("Guide.decide: which first, and how far apart", () => {
  const E = Object.assign({}, ENV, { modern: true });
  const full = (x) => {
    x.dry.gestures.drop = 999; x.dry.gestures.keep = 999; x.dry.gestures.turnBack = 999; x.dry.gestures.breath = 9;
    x.dry.gestures.ease = 999; x.dry.gestures.half = 999; x.runs.gestures.drop = 1; x.first.gestures = 0;
  };
  const order = [];
  const b = book(full);
  for (let i = 0; i < 8; i++) {
    const m = Guide.decide(b, ctx({ cw3: 4 }), E);
    if (!m) break;
    order.push(m);
    b.later[m] = 2;
  }
  ok("drop, keep, hands, turn it back, breath, ease, half-turn", order.join(" ") === "drop keep hands turnBack breath ease half", order.join(" "));
  ok("Keep waits for 120 pieces, and only while Keep is on",
     Guide.decide(book((x) => { x.dry.gestures.keep = 119; }), ctx(), ENV) === null &&
     Guide.decide(book((x) => { x.dry.gestures.keep = 120; }), ctx(), ENV) === "keep" &&
     Guide.decide(book((x) => { x.dry.gestures.keep = 999; }), ctx(), Object.assign({}, ENV, { keep: false })) === null);
  ok("turning back needs four three-turn pieces in this run",
     Guide.decide(book((x) => { x.dry.gestures.turnBack = 999; }), ctx({ cw3: 3 }), ENV) === null &&
     Guide.decide(book((x) => { x.dry.gestures.turnBack = 60; }), ctx({ cw3: 4 }), ENV) === "turnBack");
  ok("Breath needs a mode with Breath, and two runs it filled unused",
     Guide.decide(book((x) => { x.dry.gestures.breath = 2; }), ctx({ hasBreath: false }), ENV) === null &&
     Guide.decide(book((x) => { x.dry.gestures.breath = 1; }), ctx(), ENV) === null &&
     Guide.decide(book((x) => { x.dry.gestures.breath = 2; }), ctx(), ENV) === "breath");
  ok("easing down waits until the drop is known",
     Guide.decide(book((x) => { x.dry.gestures.ease = 999; }), ctx(), ENV) === null &&
     Guide.decide(book((x) => { x.dry.gestures.ease = 200; x.runs.gestures.drop = 1; }), ctx(), ENV) === "ease");
  ok("the half-turn: Modern turning, not the tray, not with Tap anywhere",
     Guide.decide(book((x) => { x.dry.gestures.half = 150; }), ctx(), ENV) === null &&
     Guide.decide(book((x) => { x.dry.gestures.half = 150; }), ctx(), E) === "half" &&
     Guide.decide(book((x) => { x.dry.buttons.half = 999; }), ctx({ hands: "buttons" }), E) === null &&
     Guide.decide(book((x) => { x.dry.gestures.half = 999; }), ctx(), Object.assign({}, E, { tap: "anywhere" })) === null);
  ok("a new kind of hands, once another has been taught",
     Guide.decide(book((x) => { x.first.pad = 0; }), ctx({ hands: "pad" }), ENV) === "hands" &&
     Guide.decide(book((x) => { x.first.pad = 0; x.later.hands = 2; }), ctx({ hands: "pad" }), ENV) === null);
  ok("forty pieces and a run since the last offer",
     Guide.decide(dryDrop(30).since === 999 && book((x) => { x.dry.gestures.drop = 99; x.since = 39; }), ctx(), ENV) === null &&
     Guide.decide(book((x) => { x.dry.gestures.drop = 99; x.since = 40; x.sinceRuns = 0; }), ctx(), ENV) === null &&
     Guide.decide(book((x) => { x.dry.gestures.drop = 99; x.since = 40; x.sinceRuns = 1; }), ctx(), ENV) === "drop");
});

/* ================================================================
   2. the words
   ================================================================ */
const LABELS_RE = /\b(Marathon|Sprint|Ultra|Matrix|Zone|Journey|Ghost|Hold|NEXT)\b|GAME OVER|game\s+over/i;
const LABELS_CASE = /\b(Marathon|Sprint|Ultra|Matrix|Zone|Journey|Ghost|Hold|NEXT)\b|GAME OVER/;
const HARSH = /\b(fail\w*|lose|lost|loser|kill\w*|die|dies|died|dead|death|shoot\w*|bomb\w*|hurry|almost|missed|wrong)\b/i;
const BORROWED = /tetris|tetrimino|t-spin|tspin|korobeiniki|xbox|playstation|dualshock|dualsense|nintendo|switch pro/i;
guarded("Guide.text: every move, every hand, every form", () => {
  const FORMS = ["name", "title", "line", "how", "why", "tip", "tipTitle", "short"];
  const keymaps = [
    null,
    { left: ["KeyA"], right: ["KeyD"], soft: ["KeyS"], hard: ["Enter"], cw: ["KeyW", "ArrowUp"], ccw: ["KeyQ"],
      flip: ["KeyE"], hold: ["ShiftLeft"], breath: ["Digit1"], pause: ["Backquote"] },
    { left: [], right: [], soft: [], hard: [], cw: [], ccw: [], flip: [], hold: [], breath: [], pause: [] },
    { left: ["Numpad4"], right: ["Numpad6"], soft: ["Numpad2"], hard: ["IntlBackslash"], cw: ["Numpad8"], ccw: ["Numpad7"],
      flip: ["Numpad9"], hold: ["CapsLock"], breath: ["ContextMenu"], pause: ["F1"] }
  ];
  const envs = [];
  for (const tap of ["sides", "anywhere"]) for (const landing of [true, false]) for (const modern of [false, true])
    for (const keys of keymaps) for (const pad of ["ps", "letters", "words", "Wireless Controller (STANDARD GAMEPAD Vendor: 054c)", "Unknown Pad"])
      for (const mode of ["plain", "html", "spoken"]) envs.push({ tap, landing, modern, keep: true, keys, pad, html: mode === "html", spoken: mode === "spoken" });
  const bad = [], longShort = [], braces = [], empties = [];
  let n = 0;
  for (const env of envs) {
    for (const move of MOVES.concat(["pause", "hands", "first"])) {
      for (const hands of HANDS) {
        for (const form of FORMS) {
          const s = Guide.text(move, hands, form, env);
          n++;
          if (typeof s !== "string") { bad.push(move + "/" + hands + "/" + form + " not a string"); continue; }
          const plain = s.replace(/<[^>]*>/g, "");
          if (LABELS_CASE.test(plain) || /game\s+over/i.test(plain)) bad.push(move + "/" + hands + "/" + form + ": “" + plain + "”");
          if (/!/.test(plain)) bad.push("“!” in " + move + "/" + hands + "/" + form);
          if (/you haven[’']t/i.test(plain)) bad.push("“you haven't” in " + move + "/" + hands + "/" + form);
          if (HARSH.test(plain)) bad.push("a harsh word in " + move + "/" + hands + "/" + form + ": “" + plain + "”");
          if (BORROWED.test(plain)) bad.push("a borrowed or brand name in " + move + "/" + hands + "/" + form + ": “" + plain + "”");
          if (/[{}]/.test(plain)) braces.push(move + "/" + hands + "/" + form + ": “" + plain + "”");
          if (form === "short" && !env.html && !env.spoken && s.length > 44) longShort.push(s.length + ": “" + s + "”");
          const exists = !(move === "half" && (hands === "buttons" || !env.modern || (hands === "gestures" && env.tap === "anywhere")));
          if (exists && !s && form !== "name") empties.push(move + "/" + hands + "/" + form);
        }
      }
    }
  }
  ok("checked " + n + " lines: none says a borrowed label, a harsh word, a “!” or “you haven't”", bad.length === 0, bad.slice(0, 4).join("; "));
  ok("every {token} resolves, for every keymap and every controller", braces.length === 0, braces.slice(0, 4).join("; "));
  ok("every line under a depth's name is 44 characters or fewer", longShort.length === 0, longShort.slice(0, 4).join("; "));
  ok("every move that exists on these hands has its words", empties.length === 0, empties.slice(0, 6).join(", "));
  ok("the half-turn has no words where it doesn't exist (tray; Tap anywhere; Modern off)",
     Guide.text("half", "buttons", "title", { modern: true }) === "" &&
     Guide.text("half", "gestures", "title", { modern: true, tap: "anywhere" }) === "" &&
     Guide.text("half", "keys", "title", { modern: false }) === "");
});

guarded("Guide.text: the words themselves", () => {
  const T = (m, h, f, e) => Guide.text(m, h, f, e || { modern: true });
  const cases = [
    [T("move", "gestures", "title"), "Drag to move"],
    [T("drop", "gestures", "title"), "Flick down to drop"],
    [T("drop", "gestures", "line"), "A quick flick, and it lands where the light is. A slow drag eases it down instead."],
    [T("drop", "gestures", "line", { landing: false }), "A quick flick, and it lands where it would land. A slow drag eases it down instead."],
    [T("turn", "gestures", "line", { tap: "anywhere" }), "Tap anywhere to turn it. Two fingers turn it back."],
    [T("move", "keys", "title"), "← → to move"],
    [T("turn", "keys", "title"), "↑ or X to turn"],
    [T("drop", "keys", "title"), "Space to drop"],
    [T("ease", "keys", "title"), "Press and hold ↓"],
    [T("keep", "keys", "title"), "C to keep"],
    [T("drop", "buttons", "title"), "⤓ to drop"],
    [T("turn", "pad", "title", { pad: "ps" }), "✕ to turn"],
    [T("turn", "pad", "title", { pad: "letters" }), "A to turn"],
    [T("turn", "pad", "title", { pad: "words" }), "The bottom button to turn"],
    [T("keep", "pad", "title", { pad: "ps" }), "L1 to keep"],
    [T("pause", "pad", "line", { pad: "ps" }), "Options pauses."],
    [T("drop", "gestures", "tipTitle"), "A quicker way down"],
    [T("drop", "keys", "tip"), "Space drops the piece straight to its light."],
    [T("drop", "gestures", "short"), "Flick down to drop a piece at once."],
    [T("breath", "keys", "short"), "Breath is ready: B rests gravity."],
    [T("breath", "pad", "short", { pad: "words" }), "Breath is ready: press the left trigger."],
    [T("hands", "pad", "tipTitle"), "Playing with a controller?"],
    [T("move", "keys", "title", { spoken: true }), "Left arrow and right arrow to move"],
    [T("drop", "keys", "title", { html: true }), '<span class="gd-nw"><kbd class="kc">Space</kbd> to</span> drop'],
    [T("drop", "keys", "line", { spoken: true }), "It lands where the light is. Down arrow eases it down instead."],
    [T("drop", "keys", "line", { keys: { soft: [] } }), "It lands where the light is. The ease key eases it down instead."],
    [T("keep", "pad", "line", { pad: "words" }), "It waits in the niche until you want it back."],
    [T("keep", "pad", "line", { pad: "letters" }), "Either shoulder button. It waits in the niche until you want it back."],
    [T("breath", "gestures", "short"), "Breath is ready: tap the ring to rest."],
    [T("hands", "keys", "tipTitle", { fresh: true }), "New to the moves?"],
    [Guide.goal("descent"), "Fill a row from wall to wall and it clears. Twenty-five lines take you one depth down."],
    [Guide.goal("drift"), "Fill a row from wall to wall and it clears. No end here, just a rest between chapters."],
    [T("drop", "keys", "title", { keys: { hard: ["Enter"] } }), "Enter to drop"],
    [T("drop", "keys", "title", { keys: { hard: [] } }), "The drop key to drop"]
  ];
  for (const [got, want] of cases) ok("“" + want + "”", got === want, "got “" + got + "”");
  ok("a controller's family comes from its id, never its brand",
     Guide.padFamily("054c-0ce6-Wireless Controller") === "ps" && Guide.padFamily("Xbox 360 Controller (XInput STANDARD GAMEPAD)") === "letters" &&
     Guide.padFamily("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)") === "letters" &&
     Guide.padFamily("Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)") === "ps" &&
     Guide.padFamily("8BitDo Pro 2") === "words" && Guide.padFamily("") === "words");
  ok("key names: arrows, letters, digits, and the code when we have no better",
     Guide.keyName("ArrowUp") === "↑" && Guide.keyName("KeyX") === "X" && Guide.keyName("Digit7") === "7" &&
     Guide.keyName("ControlLeft") === "Ctrl" && Guide.keyName("Escape") === "Esc" && Guide.keyName("F13") === "F13");
});

guarded("the drawings", () => {
  let fine = true, which = [];
  for (const m of MOVES.concat(["pause", "hands", "first", "scheme-gestures", "scheme-buttons"])) {
    for (const h of HANDS) {
      const s = Guide.art(m, h, 40, { modern: true });
      if (typeof s !== "string" || !/^<svg[^>]*aria-hidden="true"/.test(s) || !/<\/svg>$/.test(s)) { fine = false; which.push(m + "/" + h); }
    }
  }
  ok("every move draws, for every kind of hands, hidden from screen readers", fine, which.join(", "));
  ok("a drawing has no words of its own a reader would miss",
     !/<text[^>]*>[^<]{4,}/.test(Guide.art("drop", "gestures", 56)) && /Space/.test(Guide.art("drop", "keys", 96)));
});

/* Where the caption sits on a phone's well, against where the moves are
   made. The wells are the ones layout.js draws (iPhone 390×844 and
   430×932 with their safe areas, a 375×667, the tray's smaller well, an
   iPad), and the caption's height runs from a one-line step to the
   tallest at 150% text. A fingertip is taken as 44 px across. */
guarded("the caption is never where a move is made", () => {
  const wells = [
    { name: "390×844", L: { cell: 29, well: { x: 30, y: 148, w: 290, h: 638 } } },
    { name: "430×932", L: { cell: 32.5, well: { x: 30, y: 159, w: 325, h: 715 } } },
    { name: "375×667", L: { cell: 21.5, well: { x: 80, y: 136, w: 215, h: 473 } } },
    { name: "tray", L: { cell: 26.5, well: { x: 59.5, y: 88, w: 265, h: 583 } } },
    { name: "iPad", L: { cell: 46.5, well: { x: 177.5, y: 90, w: 465, h: 1023 } } }
  ];
  const bad = [], high = [];
  for (const { name, L } of wells) {
    const w = Math.max(200, Math.min(L.well.w - 12, 340));
    for (const h of [120, 160, 200, 240]) {
      const c = Guide.capSpot(L, w, h), wl = L.well, tapY = Guide.tapY(L, c.y + h);
      if (c.y < wl.y + 3 * L.cell) bad.push(name + "/" + h + ": over a piece turned upright at the mouth (top " + c.y + ")");
      if (c.y + h + 22 > tapY - 22) bad.push(name + "/" + h + ": reaches the taps it shows (bottom " + (c.y + h) + ", taps at " + tapY + ")");
      if (c.x < wl.x || c.x + w > wl.x + wl.w || c.y + h > wl.y + wl.h) bad.push(name + "/" + h + ": outside the well");
      /* Skip (its top row) and Prefer buttons? (its foot) in the well's upper part, away from the thumbs */
      if (c.y + h > wl.y + wl.h * (h > 200 ? 0.7 : 0.6)) high.push(name + "/" + h + ": foot at " + Math.round((c.y + h - wl.y) / wl.h * 100) + "%");
    }
  }
  ok("below the waiting piece, above the demonstrated taps and a fingertip's width, inside the well", bad.length === 0, bad.slice(0, 3).join("; "));
  ok("its buttons sit in the upper part of the well (the upper 60%; 70% at 150% text), away from the thumbs", high.length === 0, high.slice(0, 3).join("; "));
});

/* ================================================================
   3. the notebook
   ================================================================ */
function shapeOk(g) {
  if (!g || g.v !== 1 || typeof g.tips !== "boolean") return "top";
  for (const h of HANDS) {
    if (![0, 1, 2].includes(g.first[h])) return "first." + h;
    for (const [k, hi] of [["dry", 999], ["runs", 9], ["done", 1]]) {
      for (const m of MOVES) { const v = g[k][h][m]; if (!Number.isInteger(v) || v < 0 || v > hi) return k + "." + h + "." + m; }
      if (Object.keys(g[k][h]).some((x) => !MOVES.includes(x))) return k + "." + h + " extra";
    }
  }
  for (const [k, hi] of [["offers", 9], ["later", 2]]) {
    for (const m of MOVES.concat(["hands"])) { const v = g[k][m]; if (!Number.isInteger(v) || v < 0 || v > hi) return k + "." + m; }
  }
  if (!Number.isInteger(g.since) || g.since < 0 || g.since > 999) return "since";
  if (!Number.isInteger(g.sinceRuns) || g.sinceRuns < 0 || g.sinceRuns > 99) return "sinceRuns";
  return "";
}
guarded("Guide.repair: anything becomes a notebook", () => {
  const junk = [undefined, null, 0, "guide", [], [1, 2], true, { v: 9 }, { first: "x", dry: [], runs: { gestures: { drop: "3" } } },
    { tips: "yes", first: { gestures: 7, keys: -2, pad: 1.6 }, dry: { keys: { drop: 1e9, spin: 4 } }, offers: { drop: -1, hands: 99 },
      later: { drop: NaN }, since: Infinity, sinceRuns: -5 },
    { first: { gestures: 1 }, dry: { gestures: { move: 3.4 } }, extra: { deep: [1] } }, JSON.parse('{"__proto__":{"x":1}}')];
  const bad = [];
  for (const j of junk) { const r = shapeOk(Guide.repair(j)); if (r) bad.push(JSON.stringify(j) + " → " + r); }
  ok("garbage in, a valid notebook out (" + junk.length + " kinds)", bad.length === 0, bad.slice(0, 3).join("; "));
  const b = Guide.blank();
  ok("the blank one: offers on, nothing counted, the first offer free to come",
     b.tips === true && HANDS.every((h) => b.first[h] === 0) && b.since === 999 && b.sinceRuns === 99 && !shapeOk(b));
  const r = Guide.repair({ first: { keys: 2 }, dry: { keys: { drop: 1e9 } }, since: 12 });
  ok("numbers are kept inside their caps, and repair is idempotent",
     r.first.keys === 2 && r.dry.keys.drop === 999 && r.since === 12 &&
     JSON.stringify(Guide.repair(r)) === JSON.stringify(r));
  let Prefs = null;
  try { Prefs = require(path.join(DIR, "prefs.js")); } catch (e) { Prefs = null; }
  if (Prefs && Prefs.set) {
    const g = Guide.create({ prefs: Prefs });
    let accepted = false;
    try { accepted = Prefs.set("guide", g.state()) !== false; } catch (e) { accepted = false; }
    ok("prefs.js accepts what the guide writes", accepted);
  } else console.log("  · prefs.js didn't load in node here; its own check covers its side");
});

/* ================================================================
   4. an instance, with no page
   ================================================================ */
function fakePrefs(initial) {
  const data = Object.assign({ scheme: "gestures", tap: "sides", keep: true, modern: false, landing: true, keys: null,
    seen: {}, guide: null }, initial || {});
  return {
    data,
    get(k) { return data[k] === undefined ? undefined : JSON.parse(JSON.stringify(data[k])); },
    set(k, v) { data[k] = JSON.parse(JSON.stringify(v)); return true; },
    on() { return function () {}; }
  };
}
function make(prefs, extra) {
  const log = { hold: [], say: [], music: [], practice: [], done: [] };
  const g = Guide.create(Object.assign({
    prefs, touch: true, fine: false,
    hold: (on) => log.hold.push(on), say: (t) => log.say.push(t), music: (k) => log.music.push(k),
    practice: (m, f) => log.practice.push([m, f]), done: (m, f) => log.done.push([m, f]), openMoves: () => {},
    motion: () => "full"
  }, extra || {}));
  return { g, log };
}
const META = { touch: { source: "touch" }, key: { source: "key" }, pad: { source: "pad" }, hud: { source: "hud" } };
const LOCK = { t: "lock" }, SPAWN = { t: "spawn" };

guarded("first steps, on a phone, with no page", () => {
  const p = fakePrefs();
  const { g, log } = make(p);
  ok("a new player on glass: gestures", g.hands() === "gestures");
  ok("a Forty, a Steady or a restored run never begins with first steps",
     g.runStart({ modeId: "forty", timed: true, t: 1 }) === "" && (g.runEnd("leave"), true) &&
     g.runStart({ modeId: "steady", steady: true, t: 1 }) === "" && (g.runEnd("leave"), true) &&
     g.runStart({ modeId: "descent", restored: true, t: 1 }) === "" && (g.runEnd("leave"), true));
  const t0 = 1000;
  ok("a new Descent begins with them", g.runStart({ modeId: "descent", hasBreath: true, t: t0 }) === "first");
  ok("…and gravity is held at once", log.hold.length === 1 && log.hold[0] === true);
  g.frame(null, t0 + 100);
  ok("nothing is said before the depth's name has had its moment", log.say.length === 0);
  g.frame(null, t0 + 3000);
  const a = g.active();
  ok("then step one of four, the move: “" + (log.say[0] || "") + "”", a && a.kind === "first" && a.step === 1 && a.of === 4 &&
     /Drag to move/.test(log.say[0] || ""));
  g.action("hard", META.touch, true);
  ok("a drop during the move step doesn't count for it", g.active().step === 1);
  g.action("left", META.touch, true); g.action("right", META.touch, true);
  g.frame(null, t0 + 3100);
  ok("two moves: “That's it.”, a tap of sound", log.music.includes("tap") && g.active().step === 1);
  g.frame(null, t0 + 4300);
  ok("then the turn, said with the praise so a quick player hears the step: “" + log.say[log.say.length - 1] + "”",
     g.active().step === 2 && /^That's it\. Tap to turn/.test(log.say[log.say.length - 1]) && !log.say.includes("Done."));
  g.action("cw", META.touch, true); g.action("ccw", META.touch, true);
  g.frame(null, t0 + 4400); g.frame(null, t0 + 5600);
  g.action("hard", META.touch, true); g.event(LOCK); g.event(SPAWN);
  g.frame(null, t0 + 5700); g.frame(null, t0 + 6900);
  ok("then Keep", g.active().step === 4 && /Flick up to keep/.test(log.say[log.say.length - 1]));
  g.action("hold", META.touch, true);
  g.frame(null, t0 + 7000); g.frame(null, t0 + 8200);
  ok("then the last word, still holding gravity", g.active() && log.hold.length === 1);
  ok("the last word says what the game is for: “" + log.say[log.say.length - 1] + "”",
     /^That's all you need\. Fill a row from wall to wall and it clears\. Twenty-five lines take you one depth down\./.test(log.say[log.say.length - 1]));
  g.frame(null, t0 + 8200 + 4000);
  ok("…and stays long enough to read", g.active() !== null);
  g.frame(null, t0 + 8200 + 5100);
  ok("…and gravity is let go", g.active() === null && log.hold[log.hold.length - 1] === false);
  ok("gestures are marked done, in Prefs", p.data.guide.first.gestures === 1);
  ok("first steps are not an offer: the spacing to the first offer is untouched", p.data.guide.since === 999);
  g.runEnd("leave");
  ok("the next Descent goes straight in", g.runStart({ modeId: "descent", t: 1 }) === "");
  g.runEnd("leave");
});

guarded("Skip, leaving part-way, and the other hands", () => {
  let p = fakePrefs(), m = make(p);
  m.g.runStart({ modeId: "drift", t: 10 });
  m.g.frame(null, 400);
  m.g.skip();
  ok("Skip lets gravity go and remembers it as skipped", m.log.hold.join() === "true,false" && p.data.guide.first.gestures === 2);
  p = fakePrefs(); m = make(p, { touch: false, fine: true });
  ok("a Mac: the keys", m.g.hands() === "keys");
  m.g.runStart({ modeId: "descent", t: 10 });
  m.g.frame(null, 4000);
  ok("the keys' words: “" + (m.log.say[0] || "") + "”", /left arrow and right arrow to move/i.test(m.log.say[0] || ""));
  m.g.action("left", META.key, true);
  m.g.runEnd("leave");
  ok("leaving part-way counts as skipped", p.data.guide.first.keys === 2);
  p = fakePrefs({ seen: { touchCards: true } }); m = make(p);
  ok("a player who saw the old cards on glass is not shown first steps", m.g.firstDone("gestures") && m.g.runStart({ modeId: "descent", t: 1 }) === "");
  /* a Prefs that knows which keys were ever written, as prefs.js does */
  p = fakePrefs(); p.has = function (k) { return this.data[k] !== null && this.data[k] !== undefined; };
  m = make(p);
  m.g.runStart({ modeId: "descent", t: 1 });
  p.data.seen = { intro: true };                     /* the app marks a run begun */
  m = make(p);                                      /* the tab closed half-way: a reload */
  ok("a new player who closed the tab during first steps is shown them again", m.g.runStart({ modeId: "descent", t: 1 }) === "first");
  p = fakePrefs({ seen: { intro: true } }); p.has = function (k) { return this.data[k] !== null && this.data[k] !== undefined; };
  m = make(p);
  ok("…while a player from before the guide, with no notebook, is not", m.g.firstDone() && m.g.runStart({ modeId: "descent", t: 1 }) === "");
  p = fakePrefs(); m = make(p);
  m.g.runStart({ modeId: "descent", t: 10 });
  m.g.frame(null, 4000);
  m.g.action("left", META.pad, true);
  ok("a pad's press switches the words to the pad's, live", m.g.hands() === "pad" && /D-pad/.test(m.log.say[m.log.say.length - 1] || ""));
});

guarded("first steps, asked about ahead of time; old players; a second Keep", () => {
  let p = fakePrefs(), m = make(p);
  ok("a new player's Descent or Drift will begin with them, a Forty or a restored run won't",
     m.g.wantsFirst({ modeId: "descent" }) && m.g.wantsFirst({ modeId: "drift" }) &&
     !m.g.wantsFirst({ modeId: "forty" }) && !m.g.wantsFirst({ modeId: "descent", restored: true }));
  m.g.runStart({ modeId: "descent", t: 1 }); m.g.frame(null, 4000); m.g.skip(); m.g.runEnd("leave");
  ok("…and once skipped, no longer", !m.g.wantsFirst({ modeId: "descent" }) && p.data.guide.since === 999);
  p = fakePrefs({ seen: { touchCards: true, intro: true } }); m = make(p);
  ok("a player from the old touch cards knows the glass and the tray alike", m.g.firstDone("gestures") && m.g.firstDone("buttons"));
  p = fakePrefs({ guide: book() }); m = make(p);
  m.g.runStart({ modeId: "practice", practice: true, move: "keep", t: 1 });
  m.g.frame(null, 500);
  m.g.action("hold", META.touch, true);
  m.g.action("hold", META.touch, false);
  ok("a second Keep for the same piece is explained, not ignored: “" + m.log.say[m.log.say.length - 1] + "”",
     /^One keep per piece\./.test(m.log.say[m.log.say.length - 1]) && m.g.active().step === 2);
  m.g.action("hold", META.touch, false);
  ok("…once a piece", m.log.say.filter((x) => /^One keep/.test(x)).length === 1);
  m.g.action("hard", META.touch, true); m.g.event(LOCK); m.g.event(SPAWN);
  m.g.action("hold", META.touch, true);
  m.g.frame(null, 2000);
  ok("…and the next piece's Keep finishes it", m.g.state().done.gestures.keep === 1);
  m.g.runEnd("practice");
});

guarded("Steady counts nothing; the practice well", () => {
  const p = fakePrefs({ guide: book() }), { g, log } = make(p);
  g.runStart({ modeId: "steady", steady: true, t: 1 });
  for (let i = 0; i < 50; i++) { g.action("left", META.touch, true); g.event(LOCK); }
  g.note("breathReady");
  const before = JSON.stringify(g.state());
  ok("no offer of any kind in Steady",
     ["pause", "run", "chapter", "banner"].every((w) => g.offer(w, { modeId: "steady", steady: true, playMs: 9e5, userOpened: true, depth: 5 }) === null));
  g.runEnd("pause");
  ok("and nothing counted or written", JSON.stringify(g.state()) === before && log.hold.length === 0);
  ok("the practice well holds gravity for a move", g.runStart({ modeId: "practice", practice: true, move: "drop", t: 1 }) === "practice" && log.hold[0] === true);
  g.frame(null, 500);
  for (let i = 0; i < 3; i++) { g.action("hard", META.touch, true); g.event(LOCK); g.event(SPAWN); }
  g.frame(null, 2000);
  ok("three drops, and the drop is the player's own", g.state().done.gestures.drop === 1 && log.music.includes("chime"));
  ok("…with no offer in the practice well", g.offer("run", { modeId: "practice", practice: true, playMs: 9e5 }) === null);
  g.runEnd("practice");
  ok("Breath's practice leaves gravity alone", g.runStart({ modeId: "practice", practice: true, move: "breath", t: 1 }) === "practice" && log.hold.length === 1);
  g.runEnd("practice");
  g.runStart({ modeId: "practice", practice: true, move: "ease", t: 1 });
  g.frame(null, 500);
  g.action("softOn", META.touch, true); g.event({ t: "soft", rows: 2 }); g.event(LOCK); g.event(SPAWN);
  g.action("softOn", META.touch, true); g.event({ t: "soft", rows: 1 }); g.event({ t: "soft", rows: 2 }); g.event(LOCK); g.event(SPAWN);
  g.action("softOn", META.touch, true); g.event({ t: "soft", rows: 5 });
  g.frame(null, 2000);
  ok("easing down is counted in rows: two pieces eased three rows or more", g.state().done.gestures.ease === 1);
  g.runEnd("practice");
});

guarded("a move to try, in a real sequence", () => {
  const p = fakePrefs({ guide: book((x) => { for (const h of HANDS) x.first[h] = 1; }) });
  let { g } = make(p);
  g.runStart({ modeId: "descent", hasBreath: true, t: 1 });
  for (let i = 0; i < 29; i++) { g.action("left", META.touch, true); g.event(LOCK); }
  const c = { modeId: "descent", playMs: 60000, userOpened: true, hasBreath: true, depth: 2 };
  ok("twenty-nine pieces without a drop: nothing yet", g.offer("pause", c) === null);
  g.action("left", META.touch, true); g.event(LOCK);
  const banner = g.offer("banner", c);
  ok("the thirtieth: the line under Depth 2 — “" + (banner && banner.short) + "”", banner && banner.move === "drop" && banner.short === "Flick down to drop a piece at once.");
  g.frame(null, 100);
  ok("…once a run", g.offer("banner", Object.assign({}, c, { depth: 3 })) === null);
  g.pause();
  const card = g.offer("pause", c);
  ok("the pause the player opened: the same move, as a card", card && card.move === "drop" && card.title === "A quicker way down");
  ok("…drawn twice, the same card", JSON.stringify(g.offer("pause", c)) === JSON.stringify(card));
  g.resume(); g.frame(null, 200); g.pause();
  ok("…and not at the next pause", g.offer("pause", c) === null);
  ok("counted once for the run", g.state().offers.drop === 1 && g.state().since === 0 && g.state().sinceRuns === 0);
  g.runEnd("leave");
  /* two more runs, each saying Not now */
  for (let run = 0; run < 2; run++) {
    ({ g } = make(p));
    g.runStart({ modeId: "descent", hasBreath: true, t: 1 });
    for (let i = 0; i < 45; i++) { g.action("left", META.touch, true); g.event(LOCK); }
    g.pause();
    const o = g.offer("pause", c);
    ok("run " + (run + 2) + ": offered again", o && o.move === "drop");
    g.notNow(o.move);
    ok("…and after Not now, nothing else this run", g.offer("run", c) === null);
    g.runEnd("leave");
  }
  ({ g } = make(p));
  g.runStart({ modeId: "descent", hasBreath: true, t: 1 });
  for (let i = 0; i < 99; i++) { g.action("left", META.touch, true); g.event(LOCK); }
  g.pause();
  const later = g.offer("pause", c);
  ok("Not now twice, then a reload: the drop never again (Keep, waiting longer, may come instead: " +
     (later ? later.move : "nothing") + ")", !later || later.move !== "drop");
  g.runEnd("leave");
  ok("“Not now” is remembered in Prefs, not just in memory", p.data.guide.later.drop === 2);
  /* a card counts once it is seen (on a page, once it has been in view;
     Not now and Try it are seen by definition), not merely decided */
  {
    const r = fakePrefs({ guide: book((x) => { x.dry.gestures.drop = 50; }) });
    const { g: g2 } = make(r);
    g2.runStart({ modeId: "descent", hasBreath: true, t: 1 });
    g2.pause();
    const o = g2.offer("pause", c);
    ok("a card decided but not yet seen hasn't used up an offer", !!o && o.move === "drop" && g2.state().offers.drop === 0 && g2.state().since === 999);
    g2.notNow("drop");
    ok("…and once answered, it has", g2.state().offers.drop === 1 && g2.state().since === 0 && g2.state().later.drop === 1);
    g2.runEnd("leave");
  }
  /* a drop made before the offer (in first steps, say) doesn't silence it */
  {
    const r = fakePrefs({ guide: book() });
    const { g: g3 } = make(r);
    g3.runStart({ modeId: "descent", hasBreath: true, t: 1 });
    g3.action("hard", META.touch, true); g3.event(LOCK);
    for (let i = 0; i < 30; i++) { g3.action("left", META.touch, true); g3.event(LOCK); }
    const b1 = g3.offer("banner", c);
    g3.frame(null, 100); g3.pause();
    const p1 = g3.offer("pause", c);
    ok("a drop early in the run, then thirty pieces without: the line under the depth and the pause card both say it",
       b1 && b1.move === "drop" && p1 && p1.move === "drop");
    g3.resume(); g3.frame(null, 200);
    g3.action("hard", META.touch, true);
    g3.pause();
    ok("…and once it's made after the offer, nothing more is said", g3.offer("pause", c) === null);
    g3.runEnd("leave");
  }
  const q = fakePrefs({ guide: book() });
  ({ g } = make(q));
  g.runStart({ modeId: "descent", hasBreath: true, t: 1 });
  for (let i = 0; i < 45; i++) g.event(LOCK);
  const mid = g.state().dry.gestures;
  g.action("hard", META.touch, true);
  ok("a piece placed counts for every move but Breath", mid.drop === 45 && mid.move === 45 && mid.breath === 0);
  ok("a drop used is a drop whose count starts again", g.state().dry.gestures.drop === 0 && g.state().dry.gestures.move === 45);
  g.note("breathReady");
  g.runEnd("end");
  const after = g.state();
  ok("a run in which it was used is counted, once", after.runs.gestures.drop === 1 && after.runs.gestures.move === 0);
  ok("a run in which Breath filled and wasn't taken counts for Breath", after.dry.gestures.breath === 1);
  ok("the counts reach Prefs at the end of the run", q.data.guide.runs.gestures.drop === 1 && q.data.guide.dry.gestures.move === 45);
});

/* The heap is measured in a child node whose young generation is too big
   to fill, so no collection can hide an allocation. A run of the engine's
   own optimising leaves a fixed few hundred kilobytes whatever the count,
   so the loop runs a million and a half times and everything the heap
   grew by is charged to it — a generous upper bound, still far below the
   sixteen bytes one small object a turn would cost. A loop that does
   allocate is measured the same way, to prove the measure sees one. */
function allocBurst(kind, control) {
  const p = fakePrefs({ guide: kind === "first" ? null : book() });
  const { g } = make(p);
  g.runStart({ modeId: "descent", hasBreath: true, t: 1 });
  /* the app hands over its typed clock and the index of the frame's time */
  const clock = new Float64Array(4);
  clock[2] = 5000.25;
  if (kind === "first") g.frame(null, clock, 2);        /* first steps showing: step one, the move */
  const view = { active: { cells: [[3, 20], [4, 20], [5, 20], [4, 21]] } };
  const metas = [META.touch, META.touch, META.touch];
  /* in first steps, the presses that don't finish the move step */
  const acts = kind === "first" ? ["cw", "ccw", "softOn", "softOff", "180", "breath", "softOn", "softOff"]
                                : ["left", "right", "cw", "ccw", "hard", "softOn", "softOff", "hold"];
  const evs = [{ t: "move" }, { t: "rotate" }, LOCK, SPAWN, { t: "soft", rows: 1 }];
  const sink = [];
  function burst(n) {
    for (let i = 0; i < n; i++) {
      g.action(acts[i & 7], metas[i % 3], true);
      g.event(evs[i % 5]);
      clock[2] += 0.37;
      g.frame(view, clock, 2);
      if (control) sink[i & 1023] = { i };
    }
  }
  burst(400000);                                      /* warm, and let the engine settle */
  function grow(n) {
    global.gc();
    const before = process.memoryUsage().heapUsed;
    burst(n);
    return process.memoryUsage().heapUsed - before;
  }
  /* everything the heap grew by, over the calls: an upper bound, since it
     includes the engine's own fixed costs */
  grow(300000);                                       /* the first measure carries the compiler's costs */
  return grow(1500000) / 1500000;
}
if (process.argv[2] === "--alloc") {
  console.log(JSON.stringify({ control: allocBurst("play", true), play: allocBurst("play", false), first: allocBurst("first", false) }));
  process.exit(0);
}
guarded("nothing allocates for a press, an event or a frame", () => {
  const r = require("child_process").spawnSync(process.execPath,
    ["--expose-gc", "--min-semi-space-size=64", "--max-semi-space-size=256", __filename, "--alloc"], { encoding: "utf8" });
  const line = (r.stdout || "").trim().split("\n").pop();
  let m = null;
  try { m = JSON.parse(line); } catch (e) { m = null; }
  if (!m) { ok("the heap could be measured", false, (r.stderr || r.stdout || "").split("\n")[0]); return; }
  const b = (x) => x.toFixed(2) + " bytes a turn";
  ok("the measure sees an allocation: a loop that makes one small object a turn shows " + b(m.control), m.control > 8);
  ok("presses, engine events and frames during play allocate nothing (" + b(m.play) + ")", m.play < 2,
     "the per-press path is allocating");
  ok("…nor during first steps, while a step waits for its move (" + b(m.first) + ")", m.first < 2,
     "the first-steps path is allocating");
});

console.log("");
if (fails) { console.log("FAILED: " + fails + " problem" + (fails === 1 ? "" : "s")); process.exit(1); }
console.log("the guide keeps its manners");
