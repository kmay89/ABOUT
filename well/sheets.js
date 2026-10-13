/* sheets.js — Settings: one calm sheet, a short root and a few pages.

   index.html holds one empty shell, #ovSettings: a sheet with a grabber,
   a header (back, title, close) and a body. This file fills the body once,
   at Sheets.init, with every page at once — the root and the pages under
   it, built up front and shown one at a time — and from then on every
   control is a live view of a value in Prefs. Nothing here keeps a copy
   of a setting. A control reads Prefs when it draws and writes Prefs when
   it is touched, and every change from anywhere — this sheet, a mode's
   card, the device's own accessibility settings, another tab — comes back
   through Prefs.on and redraws whatever shows it. That is what lets the
   Ink skin arrive by itself when the system asks for more contrast, and
   its card light up in a sheet that happens to be open.

   ## One screen at the top, short pages under it

   The first version had four sheets, each a long scroll, and the same
   setting in three places. Now the root fits one phone screen: a switch
   for sound, five rows that say where things stand (Gestures · tap the
   sides, Sea Glass, Motion follows your device) and About. Each row opens
   a page that fits in two screens. The words only experts want — DAS,
   ARR, the drop guards — sit one page deeper, in Fine-tuning, where the
   people who look for them find them and everyone else never has to.
   Settings that belong to one mode (Drift's world, hiding its score, the
   Forty pace light) live on that mode's card now, not here.

   A page is pushed the way a phone's own settings push: the title
   changes, a back button appears, and the page comes in from the right by
   a few pixels, not a whole screen. On a desktop the sheet is wide enough
   for both, so the root stays as a column on the left and the page sits
   beside it; only the pages a level deeper push.

   ## One line for every control

   Every control says, in one plain sentence, what it does, because a
   setting you have to look up is a setting nobody uses. Where a control
   has several choices, only the chosen one's sentence shows, so a page
   reads as a handful of lines instead of a manual.

   ## Changes are visible at once

   The sheet sits over a paused game, so there is no Apply button and no
   Cancel. Look opens on the seven pieces painted in the skin, palette and
   marks you would actually get, over the sky of the world you are in, and
   each skin card paints a fused T and S in that skin's material: frosted
   glass is translucent with a lit rim, river stone is matte and speckled,
   jelly has a soft inner glow and a hard highlight, paper lantern glows
   and has fibres, ink is flat with a light outline, moonlight is one pale
   colour that leans on its marks. They are small, but they are honest:
   the drawing reads the same Skins data the renderers do.

   ## Your hands, not every hand

   Controls shows the controls for the hands in use: gestures or the
   button tray on a phone, the keyboard on a computer, a controller once
   one has been seen. A device with more than one kind gets a small switch
   at the top to look at the others. The guide (guide.js) says which hands
   are in use, because it watches which ones actually move the pieces;
   without it, a coarse pointer means touch and anything else means keys.

   ## Keyboard first, touch friendly

   Every group of choices is a real radio group: one Tab stop, arrows to
   move, the choice follows the focus, the way native radio buttons work.
   Switches are role="switch" buttons, sliders are native range inputs
   with spoken values ("80 percent", not "0.8"). Tab is held inside the
   sheet, Esc closes it through its own close button (so the app's close
   logic runs, whatever it is), Alt and the left arrow go back a page, and
   focus returns to whatever opened the sheet. Every target is at least
   44 px, and everything is sized in rem, so Text size, which this file
   applies to the root element, grows the sheet with it.

   ## Remapping keys

   Keys are stored by KeyboardEvent.code — the physical key — so a layout
   change never scrambles the controls, and shown by KeyboardEvent.key, so
   an AZERTY player sees the letter printed on their own keyboard. The name
   comes from the browser's layout map where there is one, from any key
   pressed while the page is open, and from a table otherwise. Choose a
   key, press the new one; Esc cancels and Delete clears. A key already in
   use elsewhere swaps places with the one being replaced, so no two
   actions ever share a key and nothing is lost without being said. Tab is
   never captured, so the page can always be left by keyboard.

   ## Undo, not "Are you sure?"

   Every page ends with Reset this page. It asks nothing: it puts that
   page's settings back, says so, and offers Undo for six seconds. A
   question before every reset would be one more thing to read for the
   many who meant it; Undo costs only the few who didn't a single tap.

   This file touches the document only inside functions, so it loads in
   node without complaint; it does nothing until Sheets.init is called. */
(function (root) {
"use strict";

var Sheets = {};

var doc = null;          /* the document, once init has run               */
var P = null;            /* Prefs                                          */
var hook = null;         /* the app's onChange(key, value)                 */
var G = null;            /* the guide, when guide.js loaded                */
var aboutFn = null;      /* opens the app's About sheet                    */
var ready = false;
var controls = [];       /* {update} for every live control                */
var paints = [];         /* canvases: {canvas, draw, id}                   */
var names = {};          /* e.code -> e.key, learned on this device        */
var keyUI = null;        /* the remap block's parts                        */
var resets = [];         /* each page's "end the Undo" function            */

var ovEl = null, sheetEl = null, bodyEl = null, titleEl = null, backEl = null;
var pages = {};          /* id -> {id, title, parent, el, keys, onShow}    */
var stack = [];          /* page ids, "root" first                         */
var scrolls = [];        /* where each page in the stack was scrolled to   */
var steady = false;      /* opened from Steady: Controls and Moves hidden  */
var split = false;       /* the wide sheet: root on the left, page beside  */
var phoneShape = false;  /* the bottom sheet of a phone                    */
var lastTop = "";        /* the page the wide sheet showed last            */
var opener = null;       /* what had focus before the sheet opened         */
var sawKey = false;      /* a key was pressed on this device               */
var sawPad = false;      /* a controller has been seen                     */
var forView = "";        /* what Controls shows: "touch" | "keys" | "pad"  */

var SVGNS = "http://www.w3.org/2000/svg";

/* ======================================================================
   small helpers
   ====================================================================== */
function $(id) { return doc.getElementById(id); }
function el(tag, cls, text) {
  var e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}
function put(parent, child) { parent.appendChild(child); return child; }
var seq = 0;
function uid(p) { seq++; return "ws-" + p + "-" + seq; }
function later(e) { setTimeout(function () { throw e; }, 0); }
function now() { return root.performance && root.performance.now ? root.performance.now() : Date.now(); }
function frame(fn) {
  if (root.requestAnimationFrame) root.requestAnimationFrame(fn);
  else setTimeout(function () { fn(now()); }, 16);
}
function mq(q) {
  try { return !!(root.matchMedia && root.matchMedia(q).matches); } catch (e) { return false; }
}
function same(a, b) { return a === b || (a !== a && b !== b); }
function focusNode(n) {
  if (!n || !n.focus) return;
  try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); }
}
function kbdMode() { return !!doc && doc.documentElement.classList.contains("kbd"); }

/* an icon from the room's sprite (index.html): <use href="#i-name"> */
function icon(name, cls) {
  var s = doc.createElementNS(SVGNS, "svg");
  s.setAttribute("class", "ic" + (cls ? " " + cls : ""));
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("focusable", "false");
  var u = doc.createElementNS(SVGNS, "use");
  u.setAttribute("href", "#i-" + name);
  s.appendChild(u);
  return s;
}
/* a one-off stroke drawing that the sprite doesn't carry (minus, plus) */
function glyph(d, cls) {
  var s = doc.createElementNS(SVGNS, "svg");
  s.setAttribute("class", "ic" + (cls ? " " + cls : ""));
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("focusable", "false");
  var p = doc.createElementNS(SVGNS, "path");
  p.setAttribute("d", d);
  s.appendChild(p);
  return s;
}

/* write a setting, then tell the app */
function choose(k, v) {
  if (!P.set(k, v)) return false;
  if (hook) { try { hook(k, P.get(k)); } catch (e) { later(e); } }
  return true;
}
function forget(k) {
  if (typeof P.reset === "function") P.reset(k);
  else if (P.DEFAULTS) P.set(k, P.DEFAULTS[k]);
  if (hook) { try { hook(k, P.get(k)); } catch (e) { later(e); } }
}
function chosen(k) { return typeof P.has === "function" ? P.has(k) : true; }
function sys() {
  return typeof P.system === "function" ? P.system() : { reducedMotion: false, moreContrast: false };
}
function motion() {
  return typeof P.motion === "function" ? P.motion() : "full";
}

/* ---------- the device ---------- */
function nav() { return root.navigator || {}; }
function iosLike() {
  var n = nav(), ua = n.userAgent || "";
  return /iPhone|iPad|iPod/.test(ua) || (n.platform === "MacIntel" && n.maxTouchPoints > 1);
}
function iPhone() { return /iPhone|iPod/.test(nav().userAgent || ""); }
function standalone() { return !!nav().standalone || mq("(display-mode: standalone)"); }
function coarse() { return mq("(pointer: coarse)"); }
function hasTouch() { return (nav().maxTouchPoints || 0) > 0 || mq("(any-pointer: coarse)"); }
function hasFine() { return mq("(any-pointer: fine)"); }
function padNow() {
  var n = nav();
  if (typeof n.getGamepads !== "function") return false;
  try {
    var list = n.getGamepads() || [];
    for (var i = 0; i < list.length; i++) if (list[i]) return true;
  } catch (e) {}
  return false;
}

/* ---------- the guide, when it is there ---------- */
var HANDS = { gestures: 1, buttons: 1, keys: 1, pad: 1 };
function hands() {
  if (G && typeof G.hands === "function") {
    try { var h = G.hands(); if (HANDS[h]) return h; } catch (e) { later(e); }
  }
  if (coarse()) return P.get("scheme") === "buttons" ? "buttons" : "gestures";
  return "keys";
}
/* the scheme decides between the two kinds of touch: it is what is set now,
   even before the next touch has told the guide */
function touchHands() { return P.get("scheme") === "buttons" ? "buttons" : "gestures"; }
var PAD_WORDS = { turn: "the bottom button", back: "the right button", flip: "the top button",
                  keep: "a shoulder button", breath: "the left trigger", pause: "Menu" };
function padGlyphs() {
  var g = null, out = {}, k;
  if (G && typeof G.padGlyphs === "function") { try { g = G.padGlyphs(); } catch (e) { later(e); } }
  for (k in PAD_WORDS) out[k] = g && typeof g[k] === "string" && g[k] ? g[k] : PAD_WORDS[k];
  return out;
}

/* ======================================================================
   the stylesheet
   look.css is shared by every room and must stay byte-identical, and the
   room's own kit (index.html) already draws rows, switches, sliders and
   segments. What is left here is what only this sheet has: the page stack
   and its push, the wide two-column sheet, the Look hero, the skins row,
   the key map, the tray miniature and the text-size sample. Colours come
   from the room's tokens, so the sheet takes its light from the world.
   ====================================================================== */
var CSS = [
  /* a fixed height, so a page pushed in never makes the sheet jump */
  "#ovSettings>.sheet.set{width:min(640px,100%);height:min(86vh,780px)}",
  "@media (max-width:599px),(pointer:coarse) and (max-width:699px){",
  "  #ovSettings>.sheet.set{width:100%;height:calc(100vh - var(--safe-top) - 40px);height:calc(100dvh - var(--safe-top) - 40px)}",
  "}",
  "@media (max-height:520px){#ovSettings>.sheet.set{height:calc(100vh - 16px)}}",
  /* the header bar runs edge to edge, so nothing scrolls past beside it */
  "#ovSettings>.sheet.set:not(.split)>.shead{margin:0 -24px 8px;padding:8px 16px 4px 24px}",
  "@media (max-width:599px),(pointer:coarse) and (max-width:699px){",
  "  #ovSettings>.sheet.set:not(.split)>.shead{margin:0 -20px 8px;padding:8px 12px 4px 20px}",
  "}",
  ".set .fld{margin:0}",
  /* look.css sizes every range input at 26 px; a slider here is a 44 px target */
  ".set input.sl-r{height:44px}",
  ".set-body{position:relative}",
  /* the pages: one on show, the rest built and waiting */
  ".set-page{display:none}",
  ".set-page.on{display:block}",
  ".set-page.in-r{animation:setInR .26s var(--e-out,ease-out)}",
  ".set-page.in-l{animation:setInL .26s var(--e-out,ease-out)}",
  ".set-page.in-f{animation:setInF .16s var(--e-out,ease-out)}",
  "@keyframes setInR{from{opacity:0;transform:translateX(24px)}}",
  "@keyframes setInL{from{opacity:0;transform:translateX(-24px)}}",
  "@keyframes setInF{from{opacity:0}}",
  /* the rhythm of a page: 24 between groups, 8 from a header, 10 to a footnote */
  ".set-flow>.list,.set-flow>.ocs,.set-flow>.set-hero{margin-top:24px}",
  ".set-flow>.gh+.list,.set-flow>.gh+.ocs,.set-flow>.gh+.set-hero{margin-top:0}",
  ".set-flow>:first-child,.set-flow>.set-side-h+.list{margin-top:4px}",
  ".set-page:not(.nofor)>.set-view>.gh:first-child{margin-top:24px}",
  ".set-flow>.seg-line{margin:10px 4px 0}",
  /* a choice that is its group's only control sits on the glass, no card */
  ".set-flow>.fld{padding:0}",
  ".set-flow>.fld .seg-line{margin:8px 4px 0}",
  ".set-flow>.gh+.fld{margin-top:0}",
  ".set-flow>.fld+.list{margin-top:24px}",
  ".set-flow>.fld+.gf,.set-flow>.seg-line+.gf{margin-left:4px;margin-right:4px}",
  ".set-flow>.gf+.gf{margin-top:6px}",
  ".set-side-h{display:none}",
  ".sw-t .tag{font:500 .75rem/1 var(--sans);letter-spacing:.04em;margin-left:8px}",
  /* the root's rows say where things stand on a second line, in full */
  ".set:not(.split) #setNav .li{min-height:64px}",
  ".set em.nm{font-style:italic}",
  /* the scheme cards: the picture is the world's own sky */
  ".set .oc-pv{display:flex;align-items:center;justify-content:center;overflow:hidden;",
  "  background:linear-gradient(180deg,rgb(var(--wsky0)),rgb(var(--wsky1)))}",
  ".set .oc-pv svg{display:block;width:100%;height:100%}",
  ".set .oc-n{padding:0 4px}",
  ".set-scheme{grid-template-columns:repeat(2,minmax(0,1fr))}",
  /* the five feel presets: names and their milliseconds, in one row */
  /* a segment is a 44 px target here, like every other control */
  ".set .seg>button{min-height:44px}",
  /* the quiet small print (a preset's milliseconds, a slider's ends, an
     expert's tag) in --ink-2: at --ink-3 it dips under 4.5:1 on a chosen
     segment's fill, and close to it on a group over the palest skies */
  ".set .seg>button small,.set .sl-ends,.set .sl-h .tag,.set .sw-t .tag{color:var(--ink-2)}",
  ".set .seg>button[aria-checked=true] small{color:var(--ink)}",
  ".seg.five>button{min-width:-webkit-min-content;min-width:min-content;padding:4px 2px;font-size:.875rem}",
  /* the hero: seven pieces over the world's sky */
  ".set-hero{display:block;width:100%;height:160px;border-radius:var(--r3,16px);",
  "  background:linear-gradient(180deg,rgb(var(--wsky0)),rgb(var(--wsky1)));box-shadow:inset 0 0 0 1px var(--hair)}",
  ".set-hero.small{height:96px}",
  "@media (min-width:900px) and (pointer:fine){.set-hero{height:200px}.set-hero.small{height:96px}}",
  "@media (max-height:520px){.set-hero{height:120px}}",
  /* skins: a row to swipe on a phone, three by two where there is room */
  ".set-skins:not(.scroll){grid-template-columns:repeat(3,minmax(0,1fr))}",
  ".set-skins canvas{background:rgb(var(--wsky0))}",
  /* the snap keeps the sheet's own margin, and "Paper Lantern" its one line */
  ".set-skins.scroll{scroll-padding:0 20px}",
  ".set-skins.scroll>.oc{flex-basis:8rem}",
  /* the stepper's number */
  ".set-step .step output{min-width:2ch}",
  ".set .ibtn[aria-disabled=true]{opacity:.35}",
  /* Sound's levels rest dimmed while sound is off: kept, not gone. The
     sliders dim, their words don't, so every line still reads at 4.5:1 */
  ".set .set-dim .sl-r,.set .set-dim .sl-row .ic{opacity:.45}",
  /* a control's own row of keycaps and words in the controller list */
  ".set-pad .li{min-height:48px}",
  ".set-pad .li-v{max-width:58%;overflow:visible}",
  ".set-pad .li-v kbd.kc{margin-left:2px}",
  /* the key map */
  ".set-keys .kr{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;min-height:56px;",
  "  padding:6px 12px 6px 16px;position:relative}",
  ".set-keys .kr+.kr:before{content:\"\";position:absolute;top:0;left:16px;right:0;height:1px;background:var(--hair)}",
  ".set-keys .kr-n{flex:1 1 7rem;min-width:0;font:500 1.0625rem/1.375rem var(--sans)}",
  ".set-keys .kr-n small{display:block;font:400 .875rem/1.25rem var(--sans);color:var(--ink-2);margin-top:2px}",
  ".set-keys .kr.off .kr-n>span{color:var(--ink-2)}",
  ".set-keys .kr-k{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;margin-left:auto}",
  ".set-keys .nokey{font:400 .875rem/44px var(--sans);color:var(--ink-2)}",
  ".kcb{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0 12px;",
  "  border-radius:var(--r1,8px);background:var(--fill-2);border:1px solid var(--hair-2);",
  "  box-shadow:inset 0 -2px 0 rgb(0 0 0 / .35);font:600 .9375rem/1 var(--sans);color:var(--ink);white-space:nowrap}",
  ".kcb.add{background:none;border-style:dashed;box-shadow:none;color:var(--ink-2);font-weight:500}",
  ".kcb.cap{border-color:rgb(var(--wa));color:rgb(var(--wa));box-shadow:0 0 0 3px rgb(var(--wa) / .18);font-weight:500}",
  ".kcb.cap:after{content:\"\";display:inline-block;width:2px;height:1em;margin-left:6px;background:currentColor;",
  "  animation:setCaret 1s steps(2) infinite}",
  "@keyframes setCaret{50%{opacity:0}}",
  ".set-keys-say{min-height:1.25rem}",
  ".set-row{display:flex;flex-wrap:wrap;gap:4px 8px;margin:14px 0 0}",
  /* the tray, in miniature, at the foot of a phone */
  ".set-tray{position:relative;height:120px;margin:2px 16px 14px;border-radius:var(--r2,12px);overflow:hidden;",
  "  background:var(--fill-1)}",
  ".set-tray .ph{position:absolute;left:50%;bottom:10px;height:140px;border:1.5px solid var(--hair-2);border-top:0;",
  "  border-radius:0 0 24px 24px;transform:translateX(-50%);",
  "  background:linear-gradient(180deg,rgb(var(--wsky0) / .5),rgb(var(--wsky1) / .9))}",
  /* the phone's own home bar, so the strip reads as the foot of a phone */
  ".set-tray .ph:after{content:\"\";position:absolute;left:50%;bottom:4px;width:34%;height:3px;border-radius:2px;",
  "  transform:translateX(-50%);background:var(--ink-3);opacity:.6}",
  ".set-tray .tk{position:absolute;display:flex;align-items:center;justify-content:center;color:var(--ink);",
  "  background:var(--fill-3);border:1px solid var(--hair-2);box-sizing:border-box}",
  ".set-tray .tk .ic{width:52%;height:52%;stroke-width:2}",
  /* text size, shown as it grows */
  ".set-sample{padding:14px 16px 0;font:400 1rem/1.5 var(--sans);color:var(--ink)}",
  ".set-sample b{font:400 1.375rem/1 var(--serif);margin-right:6px}",
  /* the quiet way back to the defaults */
  ".set-reset{display:flex;flex-wrap:wrap;align-items:center;gap:0 4px;margin:28px -12px 0}",
  ".set-reset .btn.quiet[aria-disabled=true]{color:var(--ink-3);cursor:default}",
  ".set-reset .msg{font:400 .875rem/1.25rem var(--sans);color:var(--ink-2);padding:0 4px}",
  ".set-reset .msg:empty{display:none}",
  /* the Home Screen card */
  ".set-home .li{align-items:flex-start}",
  ".set-home .btn{margin:-4px -8px 0 0}",

  /* ---------- the wide sheet: the root as a column, the page beside it ---------- */
  "#ovSettings>.sheet.set.split{display:grid;grid-template-columns:240px minmax(0,1fr);",
  "  grid-template-rows:auto minmax(0,1fr);width:min(760px,100%);padding:0;overflow:hidden}",
  ".set.split>.grab{display:none}",
  ".set.split>.shead{grid-column:2;grid-row:1;margin:0;padding:16px 16px 4px 28px;background:none;position:relative}",
  ".set.split>.shead:after{display:none}",
  ".set.split>.set-body{display:contents}",
  ".set.split .set-page[data-page=root]{display:block;grid-column:1;grid-row:1/3;overflow-y:auto;min-height:0;",
  "  padding:0 12px 20px;border-right:1px solid var(--hair);background:rgb(0 0 0 / .14)}",
  ".set.split .set-page.on:not([data-page=root]){grid-column:2;grid-row:2;overflow-y:auto;min-height:0;",
  "  padding:4px 28px 28px;scroll-padding-top:16px}",
  ".set.split .set-side-h{display:block;margin:0;padding:24px 10px 12px;font:400 1.375rem/1.75rem var(--serif);color:var(--ink)}",
  ".set.split [data-page=root]>.list{background:none;border-radius:0;overflow:visible;margin-top:12px}",
  ".set.split [data-page=root]>.set-side-h+.list{margin-top:0}",
  ".set.split [data-page=root] .li,.set.split [data-page=root] .sw{min-height:44px;padding:8px 10px;border-radius:var(--r2,12px);",
  "  font-size:1rem}",
  ".set.split [data-page=root] .li:before,.set.split [data-page=root] .sw:before{display:none}",
  ".set.split [data-page=root] .li-v,.set.split [data-page=root] .li-s,.set.split [data-page=root] .chev,",
  ".set.split [data-page=root] .sw-s{display:none}",
  ".set.split [data-page=root] .li.cur{background:rgb(var(--wa) / .12)}",
  ".set.split [data-page=root] .gf{margin:16px 10px 0}",
  ".set.split .set-reset{margin-left:-12px}",

  /* reduced motion: the room's own switch (html.rm) and the device's */
  "html.rm .set-page.in-r,html.rm .set-page.in-l,html.rm .set-page.in-f,html.rm .kcb.cap:after{animation:none}",
  "@media (prefers-reduced-motion:reduce){",
  "  .set-page.in-r,.set-page.in-l,.set-page.in-f,.kcb.cap:after{animation:none}",
  "}",
  /* forced colours: the keycap being captured, and the current root row */
  "@media (forced-colors:active){",
  "  .kcb.cap{outline:2px solid Highlight}",
  "  .set.split [data-page=root] .li.cur{outline:2px solid Highlight;outline-offset:-2px}",
  "}"
].join("\n");

function addStyle() {
  if ($("wsxStyle")) return;
  var s = el("style");
  s.id = "wsxStyle";
  s.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(s);
}

/* ======================================================================
   building blocks: the room's kit (index.html), filled in
   ====================================================================== */
function live(fn) {
  var c = { update: fn };
  controls.push(c);
  fn();
  return c;
}
function showIf(node, fn) { live(function () { node.classList.toggle("hide", !fn()); }); }

function gh(parent, text) {
  var h = put(parent, el("div", "gh", text));
  h.id = uid("gh");
  return h.id;
}
function gf(parent, text) {
  var p = put(parent, el("p", "gf", text));
  p.id = uid("gf");
  return p;
}
function group(parent, labelId, cls) {
  var l = put(parent, el("div", "list" + (cls ? " " + cls : "")));
  if (labelId) { l.setAttribute("role", "group"); l.setAttribute("aria-labelledby", labelId); }
  return l;
}

/* A radio group with a roving tab stop. items: [{v, node}]. The choice
   follows the arrow keys, which is how native radios behave, and is what
   makes a skin preview as you arrow through them. Returns the redraw. */
function radios(grp, items, read, pick, labelId, quiet) {
  grp.setAttribute("role", "radiogroup");
  if (labelId) grp.setAttribute("aria-labelledby", labelId);
  function update() {
    var cur = read(), any = false, i;
    for (i = 0; i < items.length; i++) {
      var on = same(items[i].v, cur);
      items[i].node.classList.toggle("on", on);
      items[i].node.setAttribute("aria-checked", on ? "true" : "false");
      items[i].node.tabIndex = on ? 0 : -1;
      if (on) any = true;
    }
    if (!any && items.length) items[0].node.tabIndex = 0;
  }
  items.forEach(function (it, i) {
    it.node.type = "button";
    it.node.setAttribute("role", "radio");
    it.node.setAttribute("data-v", String(it.v));
    it.node.addEventListener("click", function () { pick(it.v); update(); });
    it.node.addEventListener("keydown", function (e) {
      var j = -1, n = items.length;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % n;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i + n - 1) % n;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = n - 1;
      if (j < 0) return;
      e.preventDefault();
      e.stopPropagation();
      items[j].node.focus();
      pick(items[j].v);
      update();
    });
  });
  if (quiet) update(); else live(update);
  return update;
}

/* a segmented choice in a .fld: [{v, name, sub?, speak?, line}].
   o = {name (a visible label) | labelledBy (an id), cls, read, pick, line} */
function choice(parent, k, list, o) {
  o = o || {};
  var f = put(parent, el("div", "fld"));
  var labelId = o.labelledBy || null;
  if (o.name) {
    var h = put(f, el("div", "fld-h", o.name));
    h.id = uid("fh");
    labelId = h.id;
  }
  var row = put(f, el("div", "seg" + (o.cls ? " " + o.cls : "")));
  row.setAttribute("data-k", k);
  var items = [];
  list.forEach(function (it) {
    var b = put(row, el("button"));
    put(b, el("span", null, it.name));
    if (it.sub) put(b, el("small", null, it.sub));
    if (it.speak) b.setAttribute("aria-label", it.speak);
    items.push({ v: it.v, node: b });
  });
  var read = o.read || function () { return P.get(k); };
  radios(row, items, read, o.pick || function (v) { choose(k, v); }, labelId);
  var ln = put(f, el("p", "seg-line"));
  ln.setAttribute("aria-live", "polite");
  live(function () {
    var cur = read(), it = null, i;
    for (i = 0; i < list.length; i++) if (same(list[i].v, cur)) it = list[i];
    var t = o.line ? o.line(cur, it) : it ? (typeof it.line === "function" ? it.line() : it.line || "") : "";
    if (ln.textContent !== t) ln.textContent = t;
  });
  return { node: f, seg: row, line: ln };
}

/* an on/off switch that is the whole row. o = {id, tag, invert} */
function toggle(parent, k, name, text, o) {
  o = o || {};
  var b = put(parent, el("button", "sw"));
  b.type = "button";
  b.setAttribute("role", "switch");
  b.setAttribute("data-k", k);
  if (o.id) b.id = o.id;
  var t = put(b, el("span", "sw-t"));
  var nm = put(t, el("span", null, name));
  nm.id = uid("tn");
  if (o.tag) put(t, el("span", "tag", o.tag)).setAttribute("aria-hidden", "true");
  var sm = null;
  if (text) {
    sm = put(t, el("span", "sw-s", text));
    sm.id = uid("td");
    b.setAttribute("aria-describedby", sm.id);
  }
  put(b, el("span", "sw-k")).setAttribute("aria-hidden", "true");
  b.setAttribute("aria-labelledby", nm.id);
  function on() { var v = !!P.get(k); return o.invert ? !v : v; }
  b.addEventListener("click", function () { choose(k, o.invert ? on() : !on()); });
  live(function () { b.setAttribute("aria-checked", on() ? "true" : "false"); });
  return { node: b, small: sm };
}

/* a range slider. s = {min, max, step, to(pos), from(value), fmt(value),
   speak(value), ends:[left, right], icons:[left, right]} */
function slider(parent, k, name, text, s, tag) {
  var f = put(parent, el("div", "sl"));
  f.setAttribute("data-k", k);
  var h = put(f, el("div", "sl-h"));
  var id = uid("rg");
  var lab = put(h, el("label", null, name));
  lab.setAttribute("for", id);
  if (tag) put(h, el("span", "tag", tag)).setAttribute("aria-hidden", "true");
  /* the value shown beside the name is not part of the name: a screen
     reader has it from aria-valuetext, and a name that changed on every
     step would be read out again on every step */
  var val = put(h, el("span", "sl-v"));
  val.setAttribute("aria-hidden", "true");
  var at = f;
  if (s.icons) { at = put(f, el("div", "sl-row")); at.appendChild(icon(s.icons[0], "s20")); }
  var r = put(at, el("input", "sl-r"));
  r.type = "range"; r.id = id;
  r.min = String(s.min); r.max = String(s.max); r.step = String(s.step);
  if (s.icons) at.appendChild(icon(s.icons[1], "s20"));
  if (s.ends) {
    var e = put(f, el("div", "sl-ends"));
    e.setAttribute("aria-hidden", "true");
    put(e, el("span", null, s.ends[0]));
    put(e, el("span", null, s.ends[1]));
  }
  var ln = null;
  if (text) {
    ln = put(f, el("p", "sl-s", text));
    ln.id = uid("ln");
    r.setAttribute("aria-describedby", ln.id);
  }
  function show() {
    var v = P.get(k), pos = s.from(v);
    var t = s.fmt(v);
    if (val.textContent !== t) val.textContent = t;
    r.setAttribute("aria-valuetext", s.speak ? s.speak(v) : t);
    var p = (pos - s.min) / (s.max - s.min) * 100;
    r.style.setProperty("--p", Math.max(0, Math.min(100, p)).toFixed(1) + "%");
  }
  r.addEventListener("input", function () { choose(k, s.to(+r.value)); show(); });
  live(function () {
    var pos = s.from(P.get(k));
    if (+r.value !== pos) r.value = String(pos);
    show();
  });
  return { node: f, input: r, line: ln };
}

/* the usual mappings for sliders */
function plain(min, max, step) {
  var dp = String(step).indexOf(".") >= 0 ? String(step).split(".")[1].length : 0;
  var m = Math.pow(10, dp);
  return {
    min: min, max: max, step: step,
    to: function (p) { return Math.round(p * m) / m; },
    from: function (v) { return v; }
  };
}
function whole(min, max) {
  return { min: min, max: max, step: 1, to: function (p) { return p; }, from: function (v) { return v; } };
}
function extend(a, b) { for (var k in b) a[k] = b[k]; return a; }
function pct(v) { return Math.round(v * 100) + "%"; }
function ms(v) { return v + " ms"; }
function msOff(v) { return v === 0 ? "Off" : ms(v); }
function msOffSpeak(v) { return v === 0 ? "off" : v + " milliseconds"; }
function level(v) { return v <= 0 ? "Off" : pct(v); }
function levelSpeak(v) { return v <= 0 ? "Off" : Math.round(v * 100) + " percent"; }

/* A row that opens a page (or the About sheet). o = {id, icon, title,
   titleNode, sub, value: fn, go: fn(event), to: page id} */
function navRow(parent, o) {
  var b = put(parent, el("button", "li"));
  b.type = "button";
  if (o.id) b.id = o.id;
  if (o.to) b.setAttribute("data-go", o.to);
  if (o.icon) put(b, el("span", "li-ic")).appendChild(icon(o.icon));
  var t = put(b, el("span", "li-t"));
  var nm = put(t, o.titleNode || el("span", null, o.title));
  nm.id = uid("nt");
  var ids = nm.id;
  if (o.sub) {
    var s = put(t, el("span", "li-s", o.sub));
    s.id = uid("ns");
    b.setAttribute("aria-describedby", s.id);
  }
  var v = null;
  if (o.value) { v = put(o.below ? t : b, el("span", o.below ? "li-s" : "li-v")); v.id = uid("nv"); ids += " " + v.id; }
  b.appendChild(icon("chevron", "chev"));
  b.setAttribute("aria-labelledby", ids);
  b.addEventListener("click", function (e) { if (o.go) o.go(e); else if (o.to) go(o.to, b); });
  if (o.value) {
    live(function () {
      var tx = o.value() || "";
      if (v.textContent !== tx) v.textContent = tx;
      v.classList.toggle("hide", !tx);
    });
  }
  return b;
}

/* a list of choices with a tick, for options with a sentence each */
function radioList(parent, k, list, labelId) {
  var l = put(parent, el("div", "list"));
  l.setAttribute("data-k", k);
  var items = [];
  list.forEach(function (it) {
    var b = put(l, el("button", "li"));
    var t = put(b, el("span", "li-t"));
    var nm = put(t, el("span", null, it.name));
    nm.id = uid("rn");
    b.setAttribute("aria-labelledby", nm.id);
    if (it.line) {
      var s = put(t, el("span", "li-s", it.line));
      s.id = uid("rs");
      b.setAttribute("aria-describedby", s.id);
    }
    b.appendChild(icon("check", "tick"));
    items.push({ v: it.v, node: b });
  });
  radios(l, items, function () { return P.get(k); }, function (v) { choose(k, v); }, labelId);
  return l;
}

/* a whole number with − and + : [name, a line, the buttons] */
function stepper(parent, k, name, text, min, max, noun) {
  var r = put(parent, el("div", "li set-step"));
  var t = put(r, el("span", "li-t"));
  var nm = put(t, el("span", null, name));
  nm.id = uid("sn");
  if (text) put(t, el("span", "li-s", text));
  var st = put(r, el("div", "step"));
  st.setAttribute("role", "group");
  st.setAttribute("aria-labelledby", nm.id);
  var minus = put(st, el("button", "ibtn"));
  minus.type = "button";
  minus.setAttribute("aria-label", "Fewer " + noun);
  minus.appendChild(glyph("M7 12h10", "s20"));
  var out = put(st, el("output"));
  out.setAttribute("aria-live", "polite");
  var plus = put(st, el("button", "ibtn"));
  plus.type = "button";
  plus.setAttribute("aria-label", "More " + noun);
  plus.appendChild(glyph("M12 7v10M7 12h10", "s20"));
  function bump(d) {
    var v = (+P.get(k) || 0) + d;
    if (v < min || v > max) return;
    choose(k, v);
  }
  minus.addEventListener("click", function () { bump(-1); });
  plus.addEventListener("click", function () { bump(1); });
  live(function () {
    var v = +P.get(k) || 0;
    if (out.textContent !== String(v)) out.textContent = String(v);
    minus.setAttribute("aria-disabled", v <= min ? "true" : "false");
    plus.setAttribute("aria-disabled", v >= max ? "true" : "false");
  });
  return r;
}

/* option cards with pictures: [{v, name, pv(node) | canvas}] */
function cards(parent, k, list, labelId, cls, pick) {
  var grid = put(parent, el("div", "ocs" + (cls ? " " + cls : "")));
  grid.setAttribute("data-k", k);
  var items = [];
  list.forEach(function (o) {
    var b = put(grid, el("button", "oc"));
    if (o.canvas) {
      var cv = put(b, el("canvas"));
      cv.setAttribute("aria-hidden", "true");
      o.canvas(cv);
    } else {
      var pv = put(b, el("span", "oc-pv"));
      pv.setAttribute("aria-hidden", "true");
      if (o.pv) o.pv(pv);
    }
    put(b, el("span", "oc-n", o.name));
    items.push({ v: o.v, node: b });
  });
  radios(grid, items, function () { return P.get(k); }, pick || function (v) { choose(k, v); }, labelId);
  return { grid: grid, items: items };
}

/* Every page ends with this. It resets only what the page itself shows,
   says so, and offers Undo for six seconds; nothing asks first. */
function resetRow(sec, id) {
  var keys = pages[id].keys || [];
  var row = put(sec, el("div", "set-reset"));
  var b = put(row, el("button", "btn quiet", "Reset this page"));
  b.type = "button";
  var msg = put(row, el("span", "msg"));
  msg.setAttribute("role", "status");
  var undo = put(row, el("button", "btn quiet hide", "Undo"));
  undo.type = "button";
  var saved = null, timer = 0;
  function differs() {
    var D = P.DEFAULTS || {};
    for (var i = 0; i < keys.length; i++) {
      if (chosen(keys[i]) && !same(P.get(keys[i]), D[keys[i]])) return true;
    }
    return false;
  }
  function end(quietly) {
    if (timer) { clearTimeout(timer); timer = 0; }
    var had = doc.activeElement === undo;
    saved = null;
    undo.classList.add("hide");
    if (!quietly || msg.textContent) msg.textContent = "";
    if (had) focusNode(b);
  }
  b.addEventListener("click", function () {
    if (!differs()) return;
    saved = {};
    for (var i = 0; i < keys.length; i++) if (chosen(keys[i])) saved[keys[i]] = P.get(keys[i]);
    for (i = 0; i < keys.length; i++) forget(keys[i]);
    msg.textContent = "Back to the defaults.";
    undo.classList.remove("hide");
    focusNode(undo);
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { end(false); }, 6000);
  });
  undo.addEventListener("click", function () {
    var was = saved;
    end(true);
    if (was) for (var k in was) choose(k, was[k]);
    msg.textContent = "As you had it.";
    focusNode(b);
    timer = setTimeout(function () { timer = 0; msg.textContent = ""; }, 2400);
  });
  live(function () { b.setAttribute("aria-disabled", differs() ? "false" : "true"); });
  resets.push(function () { end(false); });
  return row;
}

/* ======================================================================
   drawing: fused pieces in a skin's material
   ====================================================================== */
var SHAPE = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]]
};
var GLYPH = { I: "lines", O: "dot", T: "triangle", S: "slash", Z: "backslash", J: "bracket", L: "bracketR" };
var FALLBACK = { I: "#F2C36B", O: "#4E6FD0", T: "#3FA58A", S: "#F09AB0", Z: "#7FD3EA", J: "#B5DB86", L: "#B9A3F0" };

/* The outline of a set of cells, walked clockwise (screen y down), with
   the straight-through corners removed. A piece is drawn as ONE rounded
   body along this outline — never four squares with lines between them. */
function trace(cells) {
  var set = {}, next = {}, i, x, y;
  function key(a, b) { return a + "," + b; }
  for (i = 0; i < cells.length; i++) set[key(cells[i][0], cells[i][1])] = 1;
  function edge(x1, y1, x2, y2) { next[key(x1, y1)] = [x2, y2]; }
  var sx = 99, sy = 99;
  for (i = 0; i < cells.length; i++) {
    x = cells[i][0]; y = cells[i][1];
    if (y < sy || (y === sy && x < sx)) { sx = x; sy = y; }
    if (!set[key(x, y - 1)]) edge(x, y, x + 1, y);
    if (!set[key(x + 1, y)]) edge(x + 1, y, x + 1, y + 1);
    if (!set[key(x, y + 1)]) edge(x + 1, y + 1, x, y + 1);
    if (!set[key(x - 1, y)]) edge(x, y + 1, x, y);
  }
  var pts = [], at = [sx, sy], guard = 0;
  do {
    pts.push(at);
    at = next[key(at[0], at[1])];
  } while (at && (at[0] !== sx || at[1] !== sy) && guard++ < 64);
  var out = [], n = pts.length;
  for (i = 0; i < n; i++) {
    var a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
  }
  return out;
}
var POLY = {};
for (var t in SHAPE) POLY[t] = trace(SHAPE[t]);

function bodyPath(ctx, poly, ox, oy, s, r) {
  var n = poly.length, a = poly[n - 1], b = poly[0];
  ctx.beginPath();
  ctx.moveTo(ox + (a[0] + b[0]) / 2 * s, oy + (a[1] + b[1]) / 2 * s);
  for (var i = 0; i < n; i++) {
    var p = poly[i], q = poly[(i + 1) % n];
    ctx.arcTo(ox + p[0] * s, oy + p[1] * s, ox + (p[0] + q[0]) / 2 * s, oy + (p[1] + q[1]) / 2 * s, r);
  }
  ctx.closePath();
}

/* colour arithmetic, in sRGB 0..255 — plenty for a swatch */
function rgb(hex) {
  var h = String(hex || "#888888").replace("#", "");
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  var n = parseInt(h.slice(0, 6), 16);
  if (n !== n) n = 0x888888;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(c, d, k) { return [c[0] + (d[0] - c[0]) * k, c[1] + (d[1] - c[1]) * k, c[2] + (d[2] - c[2]) * k]; }
function rgba(c, a) {
  return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," +
         (a === undefined ? 1 : Math.max(0, Math.min(1, a)).toFixed(3)) + ")";
}
function luma(c) {
  function ch(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
}
var WHITE = [255, 255, 255], BLACK = [0, 0, 0], WARM = [255, 244, 226];

/* a fixed little random stream, so a stone's speckle is the same speckle
   every time it is drawn and nothing shimmers between repaints */
function stream(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var r = a;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }

function drawGlyph(ctx, kind, x, y, s, c, lvl) {
  var a = lvl === "strong" ? 0.66 : 0.32;
  var ink = luma(c) < 0.3 ? "rgba(255,255,255," + a + ")" : "rgba(10,14,24," + a + ")";
  var L = x + s * 0.3, R = x + s * 0.7, T = y + s * 0.3, B = y + s * 0.7, M = x + s * 0.5, N = y + s * 0.5;
  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1, s * (lvl === "strong" ? 0.09 : 0.075));
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  if (kind === "lines") {
    ctx.moveTo(L, y + s * 0.36); ctx.lineTo(R, y + s * 0.36);
    ctx.moveTo(L, N); ctx.lineTo(R, N);
    ctx.moveTo(L, y + s * 0.64); ctx.lineTo(R, y + s * 0.64);
    ctx.stroke();
  } else if (kind === "dot") {
    ctx.arc(M, N, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "triangle") {
    ctx.moveTo(M, y + s * 0.31); ctx.lineTo(x + s * 0.71, y + s * 0.67); ctx.lineTo(x + s * 0.29, y + s * 0.67);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "slash") {
    ctx.moveTo(L, B); ctx.lineTo(R, T); ctx.stroke();
  } else if (kind === "backslash") {
    ctx.moveTo(L, T); ctx.lineTo(R, B); ctx.stroke();
  } else if (kind === "bracket") {
    ctx.moveTo(L, T); ctx.lineTo(L, B); ctx.lineTo(R, B); ctx.stroke();
  } else if (kind === "bracketR") {
    ctx.moveTo(R, T); ctx.lineTo(R, B); ctx.lineTo(L, B); ctx.stroke();
  }
}

/* One piece, as one body, in one material. The material numbers are the
   same ones the 3D renderer feeds its shader (roughness, rim, emissive,
   refraction, subsurface, speckle, fibre, unlit, outline); this is their
   2D shorthand, not a second definition of the skin. */
function paintPiece(ctx, type, ox, oy, s, hex, mat, glyphs, seed, sheen) {
  var cells = SHAPE[type], poly = POLY[type], m = mat || {};
  var c = rgb(hex);
  var rough = num(m.rough, 0.4), rim = num(m.rim, 0.4), emis = num(m.emissive, 0);
  var refr = num(m.refract, 0), sss = num(m.sss, 0), speck = num(m.speckle, 0), fib = num(m.fibre, 0);
  var unlit = !!m.unlit, line = !!m.outline;
  var r = s * (unlit ? 0.1 : 0.13 + 0.1 * Math.min(1, sss));
  var w = 0, h = 0, cx = 0, cy = 0, i;
  for (i = 0; i < cells.length; i++) {
    w = Math.max(w, cells[i][0] + 1); h = Math.max(h, cells[i][1] + 1);
    cx += cells[i][0] + 0.5; cy += cells[i][1] + 0.5;
  }
  cx = ox + cx / cells.length * s; cy = oy + cy / cells.length * s;
  var bw = w * s, bh = h * s;
  var rnd = stream(seed);

  /* the shadow it casts, and a lantern's glow around itself */
  ctx.save();
  bodyPath(ctx, poly, ox, oy, s, r);
  ctx.shadowColor = "rgba(0,0,0,.6)";
  ctx.shadowBlur = s * 0.5;
  ctx.shadowOffsetY = s * 0.16;
  ctx.fillStyle = rgba(mix(c, BLACK, 0.55));
  ctx.fill();
  ctx.restore();
  if (emis > 0) {
    ctx.save();
    bodyPath(ctx, poly, ox, oy, s, r);
    ctx.shadowColor = rgba(mix(c, WARM, 0.35), 0.6 * emis);
    ctx.shadowBlur = s * 1.3 * emis;
    ctx.fillStyle = rgba(c);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  bodyPath(ctx, poly, ox, oy, s, r);
  ctx.clip();
  if (unlit) {
    ctx.fillStyle = rgba(c);
    ctx.fillRect(ox, oy, bw, bh);
  } else {
    /* glass lets a little of the dark behind it through */
    if (refr > 0) { ctx.fillStyle = rgba(mix(c, BLACK, 0.5)); ctx.fillRect(ox, oy, bw, bh); }
    /* a lit-from-inside body is lighter all through, and darkens less */
    var lit = emis > 0.3 ? mix(c, WARM, 0.22 * emis) : c;
    var g = ctx.createLinearGradient(0, oy, 0, oy + bh);
    g.addColorStop(0, rgba(mix(lit, WHITE, 0.08 + 0.22 * (1 - rough))));
    g.addColorStop(0.55, rgba(lit));
    g.addColorStop(1, rgba(mix(lit, BLACK, 0.3 - 0.18 * emis)));
    ctx.globalAlpha = refr > 0 ? 0.84 : 1;
    ctx.fillStyle = g;
    ctx.fillRect(ox, oy, bw, bh);
    ctx.globalAlpha = 1;
    /* light from inside: jelly's subsurface, the lantern's flame-free glow */
    var inner = Math.max(sss, emis);
    if (inner > 0) {
      var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 1.8);
      rg.addColorStop(0, rgba(mix(c, WARM, 0.6), 0.6 * inner));
      rg.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(ox, oy, bw, bh);
    }
    var n, k;
    if (speck > 0) {                       /* stone: fine grains, light and dark */
      n = Math.round(cells.length * s * s / 9 * speck);
      for (k = 0; k < n; k++) {
        var lightGrain = rnd() < 0.45;
        ctx.fillStyle = lightGrain ? rgba(WHITE, 0.1 + rnd() * 0.12) : rgba(BLACK, 0.12 + rnd() * 0.14);
        var gs = 0.5 + rnd() * 1.1;
        ctx.fillRect(ox + rnd() * bw, oy + rnd() * bh, gs, gs);
      }
    }
    if (fib > 0) {                         /* paper: short fibres, mostly level */
      n = Math.round(cells.length * 26 * fib);
      ctx.lineWidth = 0.6;
      for (k = 0; k < n; k++) {
        var fx = ox + rnd() * bw, fy = oy + rnd() * bh, len = s * (0.15 + rnd() * 0.35);
        var ang = (rnd() - 0.5) * 0.9;
        ctx.strokeStyle = rnd() < 0.5 ? rgba(WHITE, 0.14) : rgba(mix(c, BLACK, 0.5), 0.14);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + Math.cos(ang) * len, fy + Math.sin(ang) * len);
        ctx.stroke();
      }
    }
    if (refr > 0) {                        /* frost, and one band of bent light */
      n = Math.round(cells.length * s * s / 14);
      for (k = 0; k < n; k++) {
        ctx.fillStyle = rgba(WHITE, 0.04 + rnd() * 0.05);
        ctx.fillRect(ox + rnd() * bw, oy + rnd() * bh, 1, 1);
      }
      var band = ctx.createLinearGradient(ox, oy, ox + bw, oy + bh);
      band.addColorStop(0.32, rgba(WHITE, 0));
      band.addColorStop(0.42, rgba(WHITE, 0.07 + refr * 1.5));
      band.addColorStop(0.5, rgba(WHITE, 0));
      ctx.fillStyle = band;
      ctx.fillRect(ox, oy, bw, bh);
    }
    var gloss = 1 - rough;                 /* the studio light's reflection */
    if (gloss > 0.05) {
      var hx = ox + s * 0.75, hy = oy + s * 0.3;
      var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, s * (0.9 + gloss));
      hg.addColorStop(0, rgba(WHITE, 0.45 * gloss));
      hg.addColorStop(1, rgba(WHITE, 0));
      ctx.fillStyle = hg;
      ctx.fillRect(ox, oy, bw, bh);
      if (sss > 0.2 && gloss > 0.5) {      /* candy: a crisp window highlight */
        ctx.fillStyle = rgba(WHITE, 0.55 * gloss);
        var top = SHAPE[type][0];
        var wx = ox + top[0] * s + s * 0.2, wy = oy + top[1] * s + s * 0.16;
        ctx.beginPath();
        ctx.moveTo(wx + s * 0.08, wy);
        ctx.arcTo(wx + s * 0.42, wy, wx + s * 0.42, wy + s * 0.13, s * 0.07);
        ctx.arcTo(wx + s * 0.42, wy + s * 0.13, wx, wy + s * 0.13, s * 0.07);
        ctx.arcTo(wx, wy + s * 0.13, wx, wy, s * 0.07);
        ctx.arcTo(wx, wy, wx + s * 0.42, wy, s * 0.07);
        ctx.fill();
      }
    }
  }
  if (glyphs && glyphs !== "off") {
    for (i = 0; i < cells.length; i++) {
      drawGlyph(ctx, GLYPH[type], ox + cells[i][0] * s, oy + cells[i][1] * s, s, c, glyphs);
    }
  }
  /* the sweep of light that answers a tap */
  if (sheen > -0.3 && sheen < 1.3) {
    var sx = ox - bw * 0.6 + sheen * bw * 2.2;
    var sg = ctx.createLinearGradient(sx - s, oy, sx + s, oy + bh);
    sg.addColorStop(0, rgba(WHITE, 0));
    sg.addColorStop(0.5, rgba(WHITE, unlit ? 0.22 : 0.32));
    sg.addColorStop(1, rgba(WHITE, 0));
    ctx.fillStyle = sg;
    ctx.fillRect(ox, oy, bw, bh);
  }
  /* the rim light, on the upper edges, and a darker turn underneath */
  if (!unlit) {
    bodyPath(ctx, poly, ox, oy, s, r);
    var lg = ctx.createLinearGradient(ox, oy, ox + bw * 0.7, oy + bh);
    lg.addColorStop(0, rgba(WHITE, 0.8 * rim + 0.1));
    lg.addColorStop(0.45, rgba(WHITE, 0.1 * rim));
    lg.addColorStop(1, rgba(WHITE, 0));
    ctx.lineWidth = Math.max(2, s * 0.15);
    ctx.strokeStyle = lg;
    ctx.stroke();
    var dg = ctx.createLinearGradient(0, oy, 0, oy + bh);
    dg.addColorStop(0.45, rgba(BLACK, 0));
    dg.addColorStop(1, rgba(BLACK, 0.32));
    ctx.lineWidth = Math.max(2, s * 0.18);
    ctx.strokeStyle = dg;
    ctx.stroke();
  }
  ctx.restore();
  if (line) {                              /* ink: a light line round the outside only */
    bodyPath(ctx, poly, ox, oy, s, r);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#F4F1EA";
    ctx.stroke();
  }
}

/* the colours a skin will actually be drawn in, with this palette */
function colours(sk) {
  var S = root.Skins, pal = P.get("palette"), out = null;
  if (S && typeof S.resolve === "function") {
    try { out = S.resolve(sk, pal); } catch (e) { out = null; }
    if (!out || !out.T) { try { out = S.resolve(sk.id, pal); } catch (e2) { out = null; } }
  }
  if (out && out.T) return out;
  if (pal === "safe" && S && S.SAFE) return S.SAFE;
  return sk.colors || FALLBACK;
}
var RANK = { off: 0, subtle: 1, strong: 2 };
/* a skin's mark setting is a floor: Moonlight and Ink always mark */
function glyphsFor(sk) {
  var S = root.Skins, g = P.get("glyphs");
  if (S && typeof S.glyphs === "function") { try { return S.glyphs(sk, g); } catch (e) {} }
  var f = sk && sk.glyphs;
  return (RANK[f] || 0) > (RANK[g] || 0) ? f : g;
}
function skinById(id) {
  var S = root.Skins;
  if (!S || !S.list) return null;
  for (var i = 0; i < S.list.length; i++) if (S.list[i].id === id) return S.list[i];
  return null;
}

/* the world's light, as the room's tint has set it on :root ("20 24 51") */
function token(name, d) {
  var v = "";
  try { v = root.getComputedStyle(doc.documentElement).getPropertyValue(name); } catch (e) {}
  var m = String(v || "").match(/(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/);
  return m ? [+m[1], +m[2], +m[3]] : d;
}
/* the sky of the world you're in, its key light low and to one side */
function backdrop(ctx, w, h) {
  var top = token("--wsky0", [22, 27, 43]), hor = token("--wsky1", [8, 10, 17]);
  var key = token("--wk", [255, 236, 214]);
  var bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, rgba(mix(top, BLACK, 0.15)));
  bg.addColorStop(1, rgba(hor));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  var kl = ctx.createRadialGradient(w * 0.24, -h * 0.25, 0, w * 0.24, -h * 0.25, Math.max(w, h) * 0.95);
  kl.addColorStop(0, rgba(key, 0.12));
  kl.addColorStop(1, rgba(key, 0));
  ctx.fillStyle = kl;
  ctx.fillRect(0, 0, w, h);
}

/* a skin card: an S come to rest on a T's shoulder, the way two pieces
   actually meet in the well — two bodies, each one fused, touching */
function paintSwatch(ctx, w, h, sk, sheen) {
  backdrop(ctx, w, h);
  var col = colours(sk), gl = glyphsFor(sk);
  var gap = 0.08;                          /* cells of air between the two */
  var s = Math.floor(Math.min((w - 18) / (5 + gap), (h - 14) / (3 + gap)));
  if (s < 4) return;
  var ox = Math.round((w - (5 + gap) * s) / 2), oy = Math.round((h - (3 + gap) * s) / 2);
  var seed = hash(sk.id);
  paintPiece(ctx, "S", ox + (2 + gap) * s, oy, s, col.S, sk.mat, gl, seed + 7, sheen - 0.18);
  paintPiece(ctx, "T", ox, oy + (1 + gap) * s, s, col.T, sk.mat, gl, seed, sheen);
}

/* the seven pieces in the chosen skin, palette and marks */
function paintPreview(ctx, w, h) {
  backdrop(ctx, w, h);
  var sk = skinById(P.get("skin"));
  if (!sk) return;
  var col = colours(sk), gl = glyphsFor(sk);
  var rows = [["I", "O", "T", "S"], ["Z", "J", "L"]];
  var gapU = 0.8;
  var s = Math.floor(Math.min((w - 28) / (12 + 3 * gapU), (h - 22) / 4.9, 30));
  if (s < 4) return;
  var y = Math.round((h - 4.9 * s) / 2), seed = hash(sk.id) + 99;
  for (var r = 0; r < rows.length; r++) {
    var width = 0, i;
    for (i = 0; i < rows[r].length; i++) width += widthOf(rows[r][i]) + (i ? gapU : 0);
    var x = Math.round((w - width * s) / 2);
    for (i = 0; i < rows[r].length; i++) {
      var p = rows[r][i], dy = p === "I" ? 0.5 * s : 0;
      paintPiece(ctx, p, x, y + dy, s, col[p], sk.mat, gl, seed + i + r * 10, -1);
      x += (widthOf(p) + gapU) * s;
    }
    y += Math.round(2.9 * s);
  }
}
function widthOf(p) {
  var m = 0;
  for (var i = 0; i < SHAPE[p].length; i++) m = Math.max(m, SHAPE[p][i][0] + 1);
  return m;
}

/* size a canvas to its box at the device's pixel ratio, then draw */
function paintCanvas(cv, draw) {
  var w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return false;
  var dpr = Math.min(3, root.devicePixelRatio || 1);
  var W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  var ctx = cv.getContext("2d");
  if (!ctx) return false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  return true;
}

var sheenAnim = null, paintQueued = false;
/* paint every canvas that is on show, or just the one named; a canvas on
   a page that isn't showing has no size, and is passed over */
function paintAll(only) {
  if (typeof only !== "string") { only = null; paintQueued = false; }
  if (!isOpen()) return;
  for (var i = 0; i < paints.length; i++) {
    if (only && paints[i].id !== only) continue;
    (function (p) {
      var t = -1;
      if (sheenAnim && sheenAnim.id === p.id) t = sheenAnim.t;
      paintCanvas(p.canvas, function (ctx, w, h) { p.draw(ctx, w, h, t); });
    })(paints[i]);
  }
}
function paintSoon() {
  if (paintQueued) return;
  paintQueued = true;
  frame(paintAll);
}
/* a single sweep of light across the skin just chosen — once, short, and
   only when motion is Full */
function sheen(id) {
  if (motion() !== "full" || doc.documentElement.classList.contains("rm")) return;
  var start = now(), dur = 720;
  sheenAnim = { id: id, t: -0.3 };
  function step() {
    if (!sheenAnim || sheenAnim.id !== id) return;
    var k = (now() - start) / dur;
    if (k >= 1 || !isOpen()) { sheenAnim = null; paintAll(id); return; }
    sheenAnim.t = -0.3 + k * 1.6;
    paintAll(id);
    frame(step);
  }
  frame(step);
}

/* The two ways to play by touch, when guide.js can't draw them: a small
   well with a piece at its mouth, and either a fingertip on the glass or
   the tray of keys beneath. Still pictures, in the room's own strokes. */
function schemeArt(node, kind) {
  var svg = null;
  if (G && typeof G.art === "function") {
    try { svg = G.art(kind === "buttons" ? "scheme-buttons" : "scheme-gestures"); } catch (e) { later(e); svg = null; }
  }
  if (typeof svg !== "string" || svg.indexOf("<svg") < 0) {
    var ink = "style=\"stroke:var(--ink-3);fill:none\"", key = "style=\"fill:rgb(var(--wk))\"";
    var cell = function (x, y) { return "<rect x=\"" + x + "\" y=\"" + y + "\" width=\"6\" height=\"6\" rx=\"1.4\" " + key + "/>"; };
    var piece = cell(54, 16) + cell(60, 16) + cell(66, 16) + cell(60, 10);
    if (kind === "buttons") {
      var tk = function (x, y, w) {
        return "<rect x=\"" + x + "\" y=\"" + y + "\" width=\"" + (w || 9) + "\" height=\"9\" rx=\"2.5\" " +
          "style=\"fill:var(--fill-3);stroke:var(--hair-2)\"/>";
      };
      svg = "<svg viewBox=\"0 0 120 90\" xmlns=\"http://www.w3.org/2000/svg\">" +
        "<rect x=\"44\" y=\"6\" width=\"32\" height=\"52\" rx=\"3\" stroke-width=\"1.5\" " + ink + "/>" + piece +
        tk(30, 64) + tk(19, 75) + tk(30, 75) + tk(41, 75) + tk(87, 64) + tk(76, 75) + tk(87, 75) + "</svg>";
    } else {
      svg = "<svg viewBox=\"0 0 120 90\" xmlns=\"http://www.w3.org/2000/svg\">" +
        "<rect x=\"44\" y=\"8\" width=\"32\" height=\"66\" rx=\"3\" stroke-width=\"1.5\" " + ink + "/>" + piece +
        "<circle cx=\"66\" cy=\"52\" r=\"9\" style=\"fill:none;stroke:rgb(var(--wk) / .3)\" stroke-width=\"1.5\"/>" +
        "<circle cx=\"66\" cy=\"52\" r=\"4.5\" style=\"fill:rgb(var(--wk) / .85)\"/>" +
        "<path d=\"M50 52h-6M47 49l-3 3 3 3M82 52h6M85 49l3 3-3 3\" stroke-width=\"1.4\" stroke-linecap=\"round\" " +
        "stroke-linejoin=\"round\" " + ink + "/></svg>";
    }
  }
  node.innerHTML = svg;
}

/* ======================================================================
   key names
   ====================================================================== */
var KEYNAME = {
  ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
  Space: "Space", Escape: "Esc", Enter: "Return", NumpadEnter: "Num Enter",
  ShiftLeft: "Shift L", ShiftRight: "Shift R", ControlLeft: "Ctrl L", ControlRight: "Ctrl R",
  AltLeft: "Alt L", AltRight: "Alt R", Backquote: String.fromCharCode(96), Minus: "-", Equal: "=",
  BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'",
  Comma: ",", Period: ".", Slash: "/", IntlBackslash: "§", Home: "Home", End: "End",
  PageUp: "Page Up", PageDown: "Page Down", Insert: "Ins", Pause: "Pause",
  NumpadAdd: "Num +", NumpadSubtract: "Num −", NumpadMultiply: "Num ×",
  NumpadDivide: "Num ÷", NumpadDecimal: "Num ."
};
var KEYSPEAK = {
  ArrowLeft: "Left arrow", ArrowRight: "Right arrow", ArrowUp: "Up arrow", ArrowDown: "Down arrow",
  ShiftLeft: "Left Shift", ShiftRight: "Right Shift", ControlLeft: "Left Control",
  ControlRight: "Right Control", AltLeft: "Left Alt", AltRight: "Right Alt", Escape: "Escape"
};
/* keys the browser or the system owns; capturing them would trap someone */
var REFUSE = {
  CapsLock: "Caps Lock doesn't always say when it is released, so it can't steer a piece.",
  ContextMenu: "That key opens menus. Try another.",
  F5: "F5 reloads the page. Try another.",
  F11: "F11 belongs to the browser. Try another.",
  F12: "F12 belongs to the browser. Try another.",
  PrintScreen: "That key belongs to the system. Try another.",
  NumLock: "Num Lock changes what other keys do. Try another.",
  ScrollLock: "That key belongs to the system. Try another.",
  Fn: "That key belongs to the system. Try another."
};
function keyLabel(code) {
  if (KEYNAME[code]) return KEYNAME[code];
  var n = names[code];
  if (n) return n.length === 1 ? n.toUpperCase() : n;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return "Num " + code.slice(6);
  return code;
}
/* the short form, for a row's value: one word per key, no left and right */
function keyShort(code) {
  if (/^Shift/.test(code)) return "Shift";
  if (/^Control/.test(code)) return "Ctrl";
  if (/^Alt/.test(code)) return "Alt";
  return keyLabel(code);
}
function keySpeak(code) {
  if (KEYSPEAK[code]) return KEYSPEAK[code];
  if (code === "Space") return "Space bar";
  return keyLabel(code);
}
function learnKey(e) {
  if (!e || !e.code || typeof e.key !== "string") return;
  /* typing a well code on a phone's own keyboard is not playing by keys */
  var tg = e.target, typing = tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName || "") || tg.isContentEditable);
  if (!typing) sawKey = true;
  if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (names[e.code] === e.key) return;
    var was = keyLabel(e.code);
    names[e.code] = e.key;
    if (keyUI && !cap && was !== keyLabel(e.code) && isOpen()) renderKeys();
  }
}
function layoutNames() {
  var kb = nav().keyboard;
  if (!kb || typeof kb.getLayoutMap !== "function") return;
  try {
    kb.getLayoutMap().then(function (map) {
      map.forEach(function (v, k) { if (!names[k] && typeof v === "string" && v.length) names[k] = v; });
      if (keyUI && !cap) renderKeys();
    }, function () {});
  } catch (e) {}
}

/* ======================================================================
   the root: one switch, five rows, About
   ====================================================================== */
var DAS_PRESETS = [
  { v: 267, name: "Gentle" }, { v: 183, name: "Calm" }, { v: 167, name: "Standard" },
  { v: 133, name: "Quick" }, { v: 100, name: "Sharp" }
];
function feelName() {
  var v = P.get("das");
  for (var i = 0; i < DAS_PRESETS.length; i++) if (DAS_PRESETS[i].v === v) return DAS_PRESETS[i].name;
  return "";
}
function controlsValue() {
  var h = hands();
  if (h === "gestures" || h === "buttons") h = touchHands();
  if (h === "gestures") return "Gestures · " + (P.get("tap") === "anywhere" ? "tap anywhere" : "tap the sides");
  if (h === "buttons") return "Button tray" + (P.get("lefty") ? " · left-handed" : "");
  if (h === "pad") return "Controller";
  return "Keyboard · " + (feelName() || "Custom") + " feel";
}
var MOTION_NAME = { full: "Full", gentle: "Gentle", still: "Still" };

function buildRoot(sec) {
  var side = put(sec, el("div", "set-side-h", "Settings"));
  side.setAttribute("role", "heading");
  side.setAttribute("aria-level", "2");
  toggle(group(sec, null), "quiet", "Sound", "Off silences everything. Your levels are kept.",
         { invert: true, id: "setQuiet" });
  var l = put(sec, el("div", "list icons"));
  l.id = "setNav";
  var rc = navRow(l, { id: "setControls", icon: "controls", below: true, title: "Controls", to: "controls", value: controlsValue,
                       go: function (e) { rootGo("controls", e); } });
  var rm = navRow(l, { id: "setMoves", icon: "moves", below: true, title: "Moves", to: "moves",
                       value: function () { return "Practise any move"; }, go: function (e) { rootGo("moves", e); } });
  navRow(l, { id: "setLook", icon: "look", below: true, title: "Look", to: "look", go: function (e) { rootGo("look", e); },
              value: function () { var sk = skinById(P.get("skin")); return sk ? sk.name : ""; } });
  navRow(l, { id: "setSound", icon: "sound", below: true, title: "Sound", to: "sound", go: function (e) { rootGo("sound", e); },
              value: function () { return P.get("quiet") ? "Off" : P.get("soften") ? "Soft" : "On"; } });
  navRow(l, { id: "setComfort", icon: "comfort", below: true, title: "Comfort", to: "comfort", go: function (e) { rootGo("comfort", e); },
              value: function () {
                var m = P.get("motion");
                return m === "system" || !MOTION_NAME[m] ? "Motion follows your device" : "Motion: " + MOTION_NAME[m];
              } });
  showIf(rc, function () { return !steady; });
  showIf(rm, function () { return !steady; });
  var a = put(sec, el("div", "list icons"));
  var nm = el("span");
  nm.appendChild(doc.createTextNode("About "));
  put(nm, el("em", "nm", "well"));
  navRow(a, { id: "setAbout", icon: "about", titleNode: nm, go: function () {
    if (aboutFn) { try { aboutFn(); } catch (e) { later(e); } }
  } });
  gf(sec, "Everything here stays on this device.");

  /* the wide sheet: up and down walk the rows, and the page follows; Enter
     or the right arrow step into the page */
  sec.addEventListener("keydown", function (e) {
    if (!split || e.altKey || e.ctrlKey || e.metaKey) return;
    var k = e.key;
    if (k !== "ArrowDown" && k !== "ArrowUp" && k !== "ArrowRight") return;
    var rows = rootStops(), i = rows.indexOf(doc.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (k === "ArrowRight") {
      var to = rows[i].getAttribute("data-go");
      if (to) { rootGo(to, null); intoPage(); }
      return;
    }
    var j = (i + (k === "ArrowDown" ? 1 : rows.length - 1)) % rows.length;
    focusNode(rows[j]);
    var go2 = rows[j].getAttribute("data-go");
    if (go2) rootGo(go2, null);
  });
}
function rootStops() {
  var all = pages.root.el.querySelectorAll("button"), out = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].closest(".hide")) continue;
    out.push(all[i]);
  }
  return out;
}

/* ======================================================================
   Controls
   ====================================================================== */
function kinds() {
  var out = [];
  if (hasTouch()) out.push("touch");
  if (hasFine() || sawKey || !hasTouch()) out.push("keys");
  if (sawPad || padNow() || hands() === "pad") out.push("pad");
  return out;
}
function viewOf(h) { return h === "keys" ? "keys" : h === "pad" ? "pad" : "touch"; }

function buildControls(sec) {
  /* which hands to show, when this device has more than one kind */
  var forBox = put(sec, el("div", "set-for"));
  var KIND = [{ v: "touch", name: "Touch" }, { v: "keys", name: "Keyboard" }, { v: "pad", name: "Controller" }];
  var forSig = "", views = {};
  function renderFor() {
    var ks = kinds(), want = viewOf(hands());
    if (ks.indexOf(want) < 0) ks.push(want);
    if (!forView || ks.indexOf(forView) < 0) forView = want;
    sec.classList.toggle("nofor", ks.length < 2);
    forBox.classList.toggle("hide", ks.length < 2);
    var sig = ks.join(",");
    if (sig !== forSig) {
      forSig = sig;
      while (forBox.firstChild) forBox.removeChild(forBox.firstChild);
      var seg = put(forBox, el("div", "seg"));
      seg.setAttribute("aria-label", "Show the controls for");
      var items = [];
      KIND.forEach(function (k) {
        if (ks.indexOf(k.v) < 0) return;
        items.push({ v: k.v, node: put(seg, el("button", null, k.name)) });
      });
      forBox.upd = radios(seg, items, function () { return forView; },
                          function (v) { forView = v; showViews(true); }, null, true);
    }
    if (forBox.upd) forBox.upd();
    showViews(false);
  }
  /* art: draw the scheme pictures again, so their short loop plays each
     time the page is opened, and not on every change made on it */
  function showViews(art) {
    for (var v in views) views[v].classList.toggle("hide", v !== forView);
    if (forView === "pad") padRows();
    if (forView === "touch" && (art || !artG.firstChild)) { schemeArt(artG, "gestures"); schemeArt(artB, "buttons"); }
  }

  /* touch */
  var vt = views.touch = put(sec, el("div", "set-view set-flow"));
  var hh = gh(vt, "How you play");
  var artG = null, artB = null;
  cards(vt, "scheme", [
    { v: "gestures", name: "Gestures", pv: function (n) { artG = n; } },
    { v: "buttons", name: "Buttons", pv: function (n) { artB = n; } }
  ], hh, "set-scheme");
  var sline = put(vt, el("p", "seg-line"));
  sline.setAttribute("aria-live", "polite");
  live(function () {
    var t = P.get("scheme") === "buttons" ? "A tray of big buttons under the well." : "Drag, tap and flick, anywhere on the well.";
    if (sline.textContent !== t) sline.textContent = t;
  });
  var ges = group(vt, null);
  choice(ges, "tap", [
    { v: "sides", name: "Sides", line: "Right side turns it, left side turns it back." },
    { v: "anywhere", name: "Anywhere", line: "Any tap turns it. Two fingers turn it back." }
  ], { name: "Tap to turn" });
  slider(ges, "sensitivity", "Drag sensitivity", "How far a drag carries the piece.", extend(plain(0.6, 1.6, 0.1), {
    fmt: function (v) { return v.toFixed(1) + "×"; },
    speak: function (v) { return v.toFixed(1) + " times"; } }));
  showIf(ges, function () { return P.get("scheme") !== "buttons"; });
  var btn = group(vt, null);
  toggle(btn, "lefty", "Left-handed", "The turns sit under your left thumb.");
  slider(btn, "btnSize", "Button size", null, extend(whole(44, 96), { step: 2,
    fmt: function (v) { return v + " px"; }, speak: function (v) { return v + " pixels"; } }));
  slider(btn, "btnOpacity", "Button opacity", null, extend(plain(0.2, 1, 0.05), {
    fmt: pct, speak: function (v) { return Math.round(v * 100) + " percent"; } }));
  trayMini(btn);
  showIf(btn, function () { return P.get("scheme") === "buttons"; });
  toggle(group(vt, null), "haptics", "Haptics", "A light tap you can feel when a piece turns.");

  /* keyboard */
  var vk = views.keys = put(sec, el("div", "set-view set-flow"));
  var fk = gh(vk, "Feel");
  var kl = group(vk, fk);
  feel(kl, fk);
  navRow(kl, { title: "Keys", to: "keys", value: keysValue });

  /* controller */
  var vp = views.pad = put(sec, el("div", "set-view set-flow"));
  var bh = gh(vp, "Buttons");
  var pl = put(vp, el("div", "list set-pad"));
  pl.setAttribute("role", "list");
  pl.setAttribute("aria-labelledby", bh);
  var padSig = "";
  function padRows() {
    var g = padGlyphs(), modern = !!P.get("modern");
    var rows = [["Move", "D-pad or left stick"], ["Turn", g.turn], ["Turn back", g.back]];
    if (modern) rows.push(["Half-turn", g.flip]);
    rows.push(["Drop", "D-pad up"], ["Ease down", "D-pad down"], ["Keep", g.keep],
              ["Breath", g.breath], ["Pause", g.pause]);
    var sig = JSON.stringify(rows);
    if (sig === padSig) return;
    padSig = sig;
    while (pl.firstChild) pl.removeChild(pl.firstChild);
    rows.forEach(function (r) {
      var row = put(pl, el("div", "li"));
      row.setAttribute("role", "listitem");
      put(row, el("span", "li-t", r[0]));
      var v = put(row, el("span", "li-v"));
      /* a button's own letter or symbol reads as a keycap; words stay words */
      if (/^\S{1,7}$/.test(r[1])) put(v, el("kbd", "kc", r[1]));
      else v.textContent = r[1];
    });
  }
  var fp = gh(vp, "Feel");
  feel(group(vp, fp), fp);

  /* for every kind */
  var ph = gh(sec, "Pieces");
  var pp = group(sec, ph);
  toggle(pp, "keep", "Keep", "Set a piece aside, and swap it back later.");
  stepper(pp, "previews", "Pieces to come", "A narrow phone may show three.", 0, 6, "pieces to come");
  var nl = group(sec, null);
  navRow(nl, { title: "Fine-tuning", to: "fine", value: fineValue });
  navRow(nl, { title: "Moves", to: "moves", value: function () { return "Practise any move"; } });
  resetRow(sec, "controls");

  pages.controls.onShow = function (fresh) {
    if (fresh) forView = "";
    renderFor();
    if (fresh) showViews(true);
  };
  live(function () { if (isOpen() && current() === "controls") { renderFor(); } });
}

/* the five named feels of a held key, and what the chosen one does */
function feel(parent, labelId) {
  choice(parent, "das", DAS_PRESETS.map(function (p) {
    return { v: p.v, name: p.name, sub: String(p.v), speak: p.name + ", " + p.v + " milliseconds" };
  }), { labelledBy: labelId, cls: "five", line: function () {
    var d = P.get("das"), a = P.get("arr");
    return "Waits " + d + " ms, then " + (a === 0 ? "goes straight to the wall." : "slides a column every " + a + " ms.");
  } });
}
function keysValue() {
  var k = P.get("keys") || {}, out = [];
  ["left", "right", "cw", "hard", "hold"].forEach(function (a) {
    if (k[a] && k[a].length) out.push(keyShort(k[a][0]));
  });
  return out.join(" ");
}
var FINE = ["arr", "dcd", "sdf", "hdTouch", "hdKeys", "irs", "ihs", "modern"];
function fineValue() {
  var D = P.DEFAULTS || {};
  for (var i = 0; i < FINE.length; i++) if (!same(P.get(FINE[i]), D[FINE[i]])) return "Custom";
  return feelName() || "Custom";
}

/* The tray as it will sit at the foot of a phone: the same seven keys,
   at the size, opacity and side chosen, scaled down into a strip. The
   arithmetic is input.js's own (five keys and a thumb's gap across the
   screen), so a size the screen can't hold shows as the size you'd get. */
var TRAY = [   /* [icon, cluster, row, col, round] — the clusters input.js lays out */
  ["drop", 0, 0, 1], ["back", 0, 1, 0], ["M6 9.5l6 6 6-6", 0, 1, 1], ["chevron", 0, 1, 2],
  ["keep", 1, 0, 1], ["turn-back", 1, 1, 0, 1], ["turn", 1, 1, 1, 1]
];
function trayMini(parent) {
  var box = put(parent, el("div", "set-tray"));
  box.setAttribute("role", "img");
  var ph = put(box, el("div", "ph"));
  var K = 0.5, PW = 390, keys = [];
  ph.style.width = Math.round(PW * K) + "px";
  for (var i = 0; i < TRAY.length; i++) {
    var d = put(ph, el("div", "tk"));
    d.appendChild(TRAY[i][0].charAt(0) === "M" ? glyph(TRAY[i][0]) : icon(TRAY[i][0]));
    keys.push(d);
  }
  live(function () {
    var want = Math.max(44, Math.min(96, +P.get("btnSize") || 64));
    var op = Math.max(0.2, Math.min(1, +P.get("btnOpacity") || 1));
    var lefty = !!P.get("lefty");
    var avail = PW - 20, gap = Math.round(Math.max(8, want * 0.16));
    var S = Math.max(40, Math.floor(Math.min(want, (avail - 3 * gap) / 5.6)));
    var moveW = 3 * S + 2 * gap, turnW = 2 * S + gap, top = 6;
    var moveX = lefty ? avail - moveW : 0, turnX = lefty ? 0 : avail - turnW;
    var bottom = 26 + 2 * S + gap + top;          /* the tray and the gap under it */
    for (var j = 0; j < TRAY.length; j++) {
      var t = TRAY[j], col = t[3];
      if (t[1] === 1 && lefty) col = 1 - col;
      var x = 10 + (t[1] === 0 ? moveX : turnX) + col * (S + gap);
      var y = top + t[2] * (S + gap), h = S;
      if (t[0] === "keep") { h = Math.min(S, Math.max(44, Math.round(S * 0.72))); y += S - h; }
      if (t[0] === "drop") { h = Math.min(S, Math.max(44, Math.round(S * 0.86))); y += S - h; }
      var st = keys[j].style;
      st.left = (x * K).toFixed(1) + "px";
      st.bottom = ((bottom - y - h) * K).toFixed(1) + "px";
      st.width = (S * K).toFixed(1) + "px";
      st.height = (h * K).toFixed(1) + "px";
      st.borderRadius = t[4] ? "50%" : (S * 0.3 * K).toFixed(1) + "px";
      st.opacity = String(op);
    }
    box.setAttribute("aria-label", "The button tray: " + S + " pixel buttons, " + Math.round(op * 100) +
      " percent opaque, with the turns on the " + (lefty ? "left." : "right."));
  });
}

/* ---------- Fine-tuning ---------- */
function buildFine(sec) {
  var sh = gh(sec, "Sliding");
  var sl = group(sec, sh);
  slider(sl, "das", "Delay before sliding", "How long a held direction waits before sliding.",
    extend(whole(17, 333), { fmt: ms, speak: function (v) { return v + " milliseconds"; }, ends: ["17 ms", "333 ms"] }), "DAS");
  slider(sl, "arr", "Slide speed", "The gap between steps while sliding.", extend(whole(0, 83), {
    fmt: function (v) { return v === 0 ? "0 · to the wall" : ms(v); },
    speak: function (v) { return v === 0 ? "0, straight to the wall" : v + " milliseconds"; },
    ends: ["0", "83 ms"] }), "ARR");
  slider(sl, "dcd", "Pause after a turn", "After a turn or Keep, sliding waits this much longer.",
    extend(whole(0, 83), { fmt: msOff, speak: msOffSpeak, ends: ["Off", "83 ms"] }), "DCD");
  gf(sec, "Both directions held: the newer one wins.");

  var dh = gh(sec, "Dropping");
  var dl = group(sec, dh);
  slider(dl, "sdf", "Soft drop speed", "How much faster than gravity a soft drop falls.", {
    min: 5, max: 41, step: 1,
    to: function (p) { return p > 40 ? Infinity : p; },
    from: function (v) { return v === Infinity ? 41 : v; },
    fmt: function (v) { return v === Infinity ? "∞ · straight down" : v + "×"; },
    speak: function (v) { return v === Infinity ? "infinite, straight down" : v + " times"; } }, "SDF");
  slider(dl, "hdTouch", "Drop guard for touch", "A flick this soon after a piece appears is ignored.",
    extend(whole(0, 333), { fmt: msOff, speak: msOffSpeak, ends: ["Off", "333 ms"] }));
  slider(dl, "hdKeys", "Drop guard for keys and controllers", "The same guard for the drop key and button.",
    extend(whole(0, 333), { fmt: msOff, speak: msOffSpeak, ends: ["Off", "333 ms"] }));

  var th = gh(sec, "Turning");
  var tl = group(sec, th);
  toggle(tl, "irs", "Turn as it appears", "A turn held as a piece appears turns it on arrival.", { tag: "IRS" });
  toggle(tl, "ihs", "Keep as it appears", "Keep held as a piece appears sends it to the niche.", { tag: "IHS" });
  toggle(tl, "modern", "Modern turning", "Adds a half-turn and mirrored kicks. Not in the classic rules.");
  resetRow(sec, "fine");
}

/* ---------- the key map ---------- */
var ACTIONS = [
  { a: "left", name: "Move left" }, { a: "right", name: "Move right" },
  { a: "soft", name: "Ease down" }, { a: "hard", name: "Drop" },
  { a: "cw", name: "Turn" }, { a: "ccw", name: "Turn back" },
  { a: "flip", name: "Half-turn", note: "with Modern turning" },
  { a: "hold", name: "Keep" },
  { a: "breath", name: "Breath", note: "Descent and Drift" },
  { a: "glass", name: "Glass Well", note: "the rules at work, beside the well" },
  { a: "pause", name: "Pause" }
];
var SLOTS = 3;
function actionName(a) {
  for (var i = 0; i < ACTIONS.length; i++) if (ACTIONS[i].a === a) return ACTIONS[i].name;
  return a;
}

function buildKeys(sec) {
  var list = put(sec, el("div", "list set-keys"));
  gf(sec, "Choose a key, then press the new one. Esc cancels, Delete clears.");
  var status = put(sec, el("p", "gf set-keys-say", ""));
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  var row = put(sec, el("div", "set-row"));
  var reset = put(row, el("button", "btn quiet", "Default keys"));
  reset.type = "button";
  var undo = put(row, el("button", "btn quiet hide", "Undo"));
  undo.type = "button";
  keyUI = { list: list, status: status, undo: undo, before: null };
  reset.addEventListener("click", function () {
    stopCapture(false);
    keyUI.before = P.get("keys");
    forget("keys");
    renderKeys();
    undo.classList.remove("hide");
    say("Every key is back where it started.");
  });
  undo.addEventListener("click", function () {
    if (keyUI.before) choose("keys", keyUI.before);
    keyUI.before = null;
    undo.classList.add("hide");
    renderKeys();
    say("Your keys are back.");
    focusNode(reset);
  });
  renderKeys();
  live(function () { if (!cap) renderKeys(); });
}
function say(text) { if (keyUI) keyUI.status.textContent = text; }

function renderKeys(force) {
  if (!keyUI) return;
  var keys = P.get("keys"), list = keyUI.list, modern = P.get("modern");
  /* rebuild only when something shown has changed, so focus and a
     screen reader's place are left alone the rest of the time */
  var sig = JSON.stringify(keys) + modern;
  for (var a in keys) for (var q = 0; q < keys[a].length; q++) sig += "|" + keyLabel(keys[a][q]);
  if (!force && sig === keyUI.sig) return;
  keyUI.sig = sig;
  var focus = doc.activeElement, fa = null, fs = null;
  if (focus && focus.getAttribute && list.contains(focus)) {
    fa = focus.getAttribute("data-a"); fs = focus.getAttribute("data-s");
  }
  while (list.firstChild) list.removeChild(list.firstChild);
  ACTIONS.forEach(function (A) {
    var codes = keys[A.a] || [];
    var r = put(list, el("div", "kr" + (A.a === "flip" && !modern ? " off" : "")));
    r.setAttribute("data-a", A.a);
    var an = put(r, el("div", "kr-n"));
    var nm = put(an, el("span", null, A.name));
    nm.id = uid("ka");
    if (A.note) put(an, el("small", null, A.note));
    var kk = put(r, el("div", "kr-k"));
    kk.setAttribute("role", "group");
    kk.setAttribute("aria-labelledby", nm.id);
    if (!codes.length) put(kk, el("span", "nokey", "no key"));
    codes.forEach(function (code, i) {
      var b = put(kk, el("button", "kcb", keyLabel(code)));
      b.type = "button";
      b.setAttribute("data-a", A.a);
      b.setAttribute("data-s", String(i));
      b.setAttribute("aria-label", A.name + ": " + keySpeak(code) + ". Choose to change.");
      b.addEventListener("click", function () { startCapture(A.a, i, b); });
    });
    if (codes.length < SLOTS) {
      var add = put(kk, el("button", "kcb add", "+"));
      add.type = "button";
      add.setAttribute("data-a", A.a);
      add.setAttribute("data-s", "+");
      add.setAttribute("aria-label", "Add a key for " + A.name);
      add.addEventListener("click", function () { startCapture(A.a, -1, add); });
    }
  });
  if (fa) {
    var back = list.querySelector('[data-a="' + fa + '"][data-s="' + fs + '"]') ||
               list.querySelector('[data-a="' + fa + '"][data-s]');
    if (back) back.focus();
  }
}

var cap = null;          /* {a, slot, chip} while waiting for a key */
function startCapture(a, slot, chip) {
  if (cap && cap.chip === chip) { stopCapture(true); say("Left as it was."); return; }
  stopCapture(false);
  cap = { a: a, slot: slot, chip: chip };
  chip.classList.add("cap");
  chip.textContent = "Press a key";
  chip.setAttribute("aria-pressed", "true");
  say("Press the key you want for " + actionName(a) + ". Esc cancels" +
      (slot >= 0 ? "; Delete clears it." : "."));
  root.addEventListener("keydown", onCaptureKey, true);
  doc.addEventListener("pointerdown", onCapturePointer, true);
}
function stopCapture(refocus) {
  if (!cap) return;
  var a = cap.a, s = cap.slot;
  cap = null;
  root.removeEventListener("keydown", onCaptureKey, true);
  doc.removeEventListener("pointerdown", onCapturePointer, true);
  renderKeys(true);
  if (refocus && keyUI) {
    var b = keyUI.list.querySelector('[data-a="' + a + '"][data-s="' + (s >= 0 ? s : "+") + '"]') ||
            keyUI.list.querySelector('[data-a="' + a + '"][data-s]');
    if (b) b.focus();
  }
}
function onCapturePointer(e) {
  if (cap && e.target !== cap.chip) stopCapture(false);
}
function onCaptureKey(e) {
  if (!cap) return;
  var code = e.code || "";
  /* Tab is never taken: it is how a keyboard leaves the sheet */
  if (code === "Tab") { stopCapture(false); return; }
  e.preventDefault();
  e.stopPropagation();
  if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  if (e.repeat || e.isComposing || e.keyCode === 229) return;
  if (code === "Escape") { stopCapture(true); say("Left as it was."); return; }
  if (e.metaKey || /^(Meta|OS)/.test(code)) {
    say("⌘ keys belong to your computer. Try another.");
    return;
  }
  if (!code || code === "Unidentified") { say("That key doesn't tell the browser which one it is. Try another."); return; }
  if (code === "Backspace" || code === "Delete") { clearSlot(); return; }
  if (REFUSE[code]) { say(REFUSE[code]); return; }
  learnKey(e);
  assign(cap.a, cap.slot, code);
}
function clearSlot() {
  var a = cap.a, s = cap.slot;
  if (s < 0) { stopCapture(true); say("Left as it was."); return; }
  var keys = P.get("keys");
  var gone = keys[a][s];
  keys[a].splice(s, 1);
  choose("keys", keys);
  keyUI.before = null; keyUI.undo.classList.add("hide");
  stopCapture(false);
  var b = keyUI.list.querySelector('[data-a="' + a + '"][data-s]');
  if (b) b.focus();
  say(keys[a].length ? actionName(a) + " no longer uses " + keySpeak(gone) + "."
                     : actionName(a) + " has no key now.");
}
/* Put "code" on action a. If another action had it, that action takes
   the key being replaced (a swap), or simply lets it go when this was a
   new slot; either way it is said out loud. */
function assign(a, slot, code) {
  var keys = P.get("keys"), mine = keys[a];
  var old = slot >= 0 ? mine[slot] : null;
  if (old === code || (slot < 0 && mine.indexOf(code) >= 0)) {
    stopCapture(true);
    say(actionName(a) + " already uses " + keySpeak(code) + ".");
    return;
  }
  var other = null, gave = null;
  for (var b in keys) {
    if (b === a) continue;
    var j = keys[b].indexOf(code);
    if (j < 0) continue;
    other = b;
    if (old && keys[b].indexOf(old) < 0) { keys[b][j] = old; gave = old; }
    else keys[b].splice(j, 1);
  }
  /* a key moving between two slots of the same action */
  var k = mine.indexOf(code);
  if (k >= 0) { mine.splice(k, 1); if (slot > k) slot--; }
  if (slot >= 0) mine[slot] = code;
  else mine.push(code);
  choose("keys", keys);
  keyUI.before = null; keyUI.undo.classList.add("hide");
  stopCapture(true);
  var msg = actionName(a) + ": " + keySpeak(code) + ".";
  if (other) {
    msg += gave ? " " + actionName(other) + " now uses " + keySpeak(gave) + " instead."
                : keys[other].length ? " " + actionName(other) + " lets it go."
                                     : " " + actionName(other) + " has no key now.";
  }
  /* allowed, but said: the system takes Control with an arrow first */
  if (ON_MAC && /^Control/.test(code)) msg += " On a Mac, Control with the arrows belongs to Mission Control and Spaces.";
  say(msg);
}
var ON_MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.platform || "") &&
             (navigator.maxTouchPoints || 0) < 2;

/* ---------- Moves: the guide draws it ---------- */
function buildMoves(sec) {
  var box = put(sec, el("div", "set-moves"));
  pages.moves.onShow = function () {
    if (G && typeof G.renderMoves === "function") {
      try { G.renderMoves(box, { from: "settings" }); return; } catch (e) { later(e); }
    }
    while (box.firstChild) box.removeChild(box.firstChild);
    put(box, el("p", "gf", "Moves didn't load this time."));
  };
}

/* ======================================================================
   Look
   ====================================================================== */
function hero(parent, id, small) {
  var cv = put(parent, el("canvas", "set-hero" + (small ? " small" : "")));
  cv.setAttribute("role", "img");
  paints.push({ canvas: cv, id: id, draw: function (ctx, w, h) { paintPreview(ctx, w, h); } });
  live(function () {
    var sk = skinById(P.get("skin"));
    var g = sk ? glyphsFor(sk) : P.get("glyphs");
    cv.setAttribute("aria-label", "The seven pieces in " + (sk ? sk.name : "this skin") +
      (P.get("palette") === "safe" ? ", colour-safe colours" : "") +
      (g === "off" ? ", no marks." : ", " + g + " marks."));
  });
  return cv;
}

var skinRow = null;
function buildLook(sec) {
  var S = root.Skins;
  hero(sec, "@hero", false);
  var ph = gh(sec, "Pieces");
  var list = [];
  ((S && S.list) || []).forEach(function (sk) {
    list.push({ v: sk.id, name: sk.name, canvas: function (cv) {
      paints.push({ canvas: cv, id: sk.id, draw: function (ctx, w, h, t) { paintSwatch(ctx, w, h, sk, t); } });
    } });
  });
  var c = cards(sec, "skin", list, ph, "set-skins", function (v) {
    var was = P.get("skin");
    choose("skin", v);
    if (v !== was) sheen(v);
  });
  skinRow = c.grid;
  var line = put(sec, el("p", "seg-line"));
  line.setAttribute("aria-live", "polite");
  live(function () {
    var sk = skinById(P.get("skin"));
    var t = sk && sk.line ? sk.line : "";
    if (line.textContent !== t) line.textContent = t;
  });
  var ink = gf(sec, "Ink was chosen for you because your device asks for more contrast. Choose any skin to change it.");
  showIf(ink, function () { return sys().moreContrast && !chosen("skin"); });

  var wh = gh(sec, "In the well");
  var wl = group(sec, wh);
  toggle(wl, "landing", "Landing light", "Light pools where the piece will land. Off is Mind's eye.");
  toggle(wl, "lockLight", "Lock light", "A thin light drains as a resting piece settles.");
  choice(wl, "grid", [
    { v: "off", name: "Off", line: "No lines; the pieces' edges are enough." },
    { v: "faint", name: "Faint", line: "Barely-there column lines, enough to count by." },
    { v: "full", name: "Full", line: "Clear lines between every row and column." }
  ], { name: "Grid" });

  var nl = group(sec, null);
  navRow(nl, { title: "Colour help", to: "colour", value: function () {
    var sk = skinById(P.get("skin")), g = sk ? glyphsFor(sk) : P.get("glyphs");
    return (P.get("palette") === "safe" ? "Colour-safe" : "Skin colours") + " · " +
      (g === "strong" ? "strong marks" : g === "subtle" ? "subtle marks" : "no marks");
  } });
  navRow(nl, { title: "Graphics", to: "graphics", value: function () { return GFX_NAME[P.get("graphics")] || ""; } });
  resetRow(sec, "look");
  pages.look.onShow = function () { frame(scrollSkin); };
}
/* on a phone the skins are a row to swipe: bring the chosen one into view */
function scrollSkin() {
  if (!skinRow || !skinRow.classList.contains("scroll")) return;
  var on = skinRow.querySelector('[aria-checked="true"]');
  if (!on) return;
  var l = on.offsetLeft - skinRow.offsetLeft, r = l + on.offsetWidth;
  if (l < skinRow.scrollLeft + 20 || r > skinRow.scrollLeft + skinRow.clientWidth - 20) {
    skinRow.scrollLeft = Math.max(0, l - 20);
  }
}

function buildColour(sec) {
  hero(sec, "@hero-s", true);
  var l = group(sec, null);
  choice(l, "palette", [
    { v: "skin", name: "Skin colours", line: "Each skin's own seven colours." },
    { v: "safe", name: "Colour-safe", line: "Seven colours that stay apart for every kind of colour vision." }
  ], { name: "Palette" });
  choice(l, "glyphs", [
    { v: "off", name: "Off", line: "Colour and shape only." },
    { v: "subtle", name: "Subtle", line: "A faint mark in every block." },
    { v: "strong", name: "Strong", line: "Marks clear enough to play by without colour." }
  ], { name: "Marks" });
  var forced = gf(sec, "");
  live(function () {
    var sk = skinById(P.get("skin"));
    var f = sk && sk.glyphs && (RANK[sk.glyphs] || 0) > (RANK[P.get("glyphs")] || 0);
    forced.classList.toggle("hide", !f);
    if (f) {
      forced.textContent = sk.mono && P.get("palette") !== "safe"
        ? sk.name + " always shows strong marks: its pieces share one colour, so the marks tell them apart."
        : sk.name + " always shows strong marks, for the clearest reading.";
    }
  });
  gf(sec, "Shape alone tells every piece apart. These help when colour can't.");
  resetRow(sec, "colour");
}

var GFX_NAME = { auto: "Auto", full: "Full", balanced: "Balanced", simple: "Simple", "2d": "2D" };
function buildGraphics(sec) {
  radioList(sec, "graphics", [
    { v: "auto", name: "Auto", line: "The best this device holds, stepping down if frames run late." },
    { v: "full", name: "Full", line: "The lit 3D well, every particle." },
    { v: "balanced", name: "Balanced", line: "3D with lighter bloom." },
    { v: "simple", name: "Simple", line: "3D under a still sky." },
    { v: "2d", name: "2D", line: "Flat and light, kindest to older devices." }
  ], "setTitle");
  gf(sec, "Timing is identical on every setting.");
  resetRow(sec, "graphics");
}

/* ======================================================================
   Sound
   ====================================================================== */
var QUALITY_NAME = { auto: "Auto", full: "Full", lite: "Lite", minimal: "Minimal" };
function buildSound(sec) {
  toggle(group(sec, null), "quiet", "Sound", "Off silences everything. Your levels are kept.", { invert: true });
  var vl = group(sec, null);
  slider(vl, "master", "Volume", null, extend(plain(0, 1, 0.05), {
    fmt: level, speak: levelSpeak, icons: ["sound-off", "sound"] }));
  var mh = gh(sec, "Mix");
  var ml = group(sec, mh);
  slider(ml, "music", "Music", "Pads and the world's own tune.", extend(plain(0, 1, 0.05), { fmt: level, speak: levelSpeak }));
  slider(ml, "sfx", "Effects", "The notes your moves play.", extend(plain(0, 1, 0.05), { fmt: level, speak: levelSpeak }));
  slider(ml, "ambience", "Ambience", "Wind, water and birds around the well.", extend(plain(0, 1, 0.05), { fmt: level, speak: levelSpeak }));
  live(function () { var q = !!P.get("quiet"); vl.classList.toggle("set-dim", q); ml.classList.toggle("set-dim", q); });
  var cl = group(sec, null);
  toggle(cl, "soften", "Soften", "Rounder, softer notes. Steady always softens.");
  navRow(cl, { title: "Quality", to: "quality", value: function () { return QUALITY_NAME[P.get("audioQuality")] || ""; } });
  var dh = gh(sec, "This device");
  var dl = group(sec, dh);
  if (iosLike() && "audioSession" in nav()) {
    var dev = /iPad/.test(nav().userAgent || "") || nav().platform === "MacIntel" ? "iPad" : "iPhone";
    toggle(dl, "playOnSilent", "Play when the " + dev + " is on silent",
      "Plays through the silent switch and pauses other audio.");
  }
  toggle(dl, "muteOnBlur", "Mute when you look away", "Sound fades while you're in another app.");
  gf(sec, "Sound never carries anything you need; everything is also shown.");
  resetRow(sec, "sound");
}
function buildQuality(sec) {
  radioList(sec, "audioQuality", [
    { v: "auto", name: "Auto", line: "Measured on this device the first time sound starts." },
    { v: "full", name: "Full", line: "Real room reverb and every voice." },
    { v: "lite", name: "Lite", line: "Lighter reverb and fewer voices." },
    { v: "minimal", name: "Minimal", line: "Just the notes. Lightest on the battery." }
  ], "setTitle");
  resetRow(sec, "quality");
}

/* ======================================================================
   Comfort
   ====================================================================== */
function buildComfort(sec) {
  var mh = gh(sec, "Motion");
  choice(sec, "motion", [
    { v: "system", name: "System", line: function () {
      return "Follows your device. Right now: " + (sys().reducedMotion ? "Gentle." : "Full.");
    } },
    { v: "full", name: "Full", line: "Every glide and drift of light." },
    { v: "gentle", name: "Gentle", line: "Pieces snap; the camera holds still." },
    { v: "still", name: "Still", line: "No camera motion, no nudge, no particles." }
  ], { labelledBy: mh });
  var ch = gh(sec, "Celebration");
  choice(sec, "juice", [
    { v: "calm", name: "Calm", line: "Clears glow and settle quietly." },
    { v: "medium", name: "Medium", line: "Enough light to feel every clear." },
    { v: "vivid", name: "Vivid", line: "More sparkle, always inside the flash guard." }
  ], { labelledBy: ch });
  gf(sec, "The flash guard is always on. Steady is always Calm.");
  var nl = group(sec, null);
  choice(nl, "nudge", [
    { v: 0, name: "Off" }, { v: 0.25, name: "25%" }, { v: 0.5, name: "50%" }, { v: 0.75, name: "75%" }, { v: 1, name: "100%" }
  ], { name: "Well nudge", line: function () { return "How far the well dips on a hard landing. Never random."; } });
  toggle(nl, "labels", "Labels", "Words like Double or Twist, beside the well for a moment.");

  var sh = gh(sec, "Size");
  var sl = group(sec, sh);
  var sample = put(sl, el("p", "set-sample"));
  sample.setAttribute("aria-hidden", "true");
  put(sample, el("b", null, "Aa"));
  sample.appendChild(doc.createTextNode("— the well, explained"));
  slider(sl, "textSize", "Text size", "Menus and pages grow as you slide.", extend(plain(1, 1.5, 0.05), {
    fmt: pct, speak: function (v) { return Math.round(v * 100) + " percent"; }, ends: ["100%", "150%"] }));
  slider(sl, "boardSize", "Board size", "Bigger or smaller than the screen would choose.", extend(plain(0.9, 1.3, 0.05), {
    fmt: pct, speak: function (v) { return Math.round(v * 100) + " percent"; }, ends: ["90%", "130%"] }));

  gh(sec, "Rest");
  var rl = group(sec, null);
  choice(rl, "reminder", [
    { v: 15, name: "15", speak: "15 minutes" }, { v: 30, name: "30", speak: "30 minutes" },
    { v: 45, name: "45", speak: "45 minutes" }, { v: 60, name: "60", speak: "60 minutes" },
    { v: 0, name: "Off" }
  ], { name: "Gentle reminder", line: function (v) {
    return v ? "A quiet note after " + v + " minutes without a five-minute break."
             : "No reminders. Stopping is always one tap away.";
  } });

  gh(sec, "Pace");
  var pl = group(sec, null);
  choice(pl, "learner", [
    { v: 0.5, name: "½×", speak: "half speed" },
    { v: 0.75, name: "¾×", speak: "three-quarter speed" },
    { v: 1, name: "1×", speak: "full speed" }
  ], { name: "Learner speed", line: function (v) {
    return v < 1 ? "Slower play while you learn. Not kept as a best." : "Full speed.";
  } });

  /* the one, gentle mention of the Home Screen, on iPhone in Safari */
  if (iPhone() && !standalone()) {
    var card = put(sec, el("div", "list set-home"));
    var row = put(card, el("div", "li"));
    var t = put(row, el("span", "li-t"));
    put(t, el("span", null, "Best from the Home Screen"));
    put(t, el("span", "li-s", "Tap Share, then Add to Home Screen. Full screen, and it works offline."));
    var ok = put(row, el("button", "btn quiet small", "Got it"));
    ok.type = "button";
    ok.addEventListener("click", function () {
      var seen = P.get("seen") || {};
      seen.homeScreen = true;
      choose("seen", seen);
      if (titleEl) focusNode(titleEl);
    });
    showIf(card, function () { var s = P.get("seen"); return !(s && s.homeScreen); });
  }

  /* and the honest word when nothing can be kept */
  if (P.store && typeof P.store.status === "function") {
    var st = gf(sec, "");
    live(function () {
      var s = P.store.status();
      st.classList.toggle("hide", s === "ok");
      st.textContent = s === "full"
        ? "This browser's storage for the site is full, so changes here last until you close the page."
        : "This window isn't keeping anything (private browsing, or storage turned off), so changes here last until you close it.";
    });
  }
  resetRow(sec, "comfort");
}

/* ======================================================================
   the pages, and moving between them
   ====================================================================== */
var PAGE_LIST = [
  { id: "root", title: "Settings", build: buildRoot },
  { id: "controls", title: "Controls", parent: "root", build: buildControls,
    keys: ["scheme", "tap", "sensitivity", "lefty", "btnSize", "btnOpacity", "haptics", "keep", "previews", "das"] },
  { id: "keys", title: "Keys", parent: "controls", build: buildKeys },
  { id: "fine", title: "Fine-tuning", parent: "controls", build: buildFine,
    keys: ["das", "arr", "dcd", "sdf", "hdTouch", "hdKeys", "irs", "ihs", "modern"] },
  { id: "moves", title: "Moves", parent: "root", build: buildMoves },
  { id: "look", title: "Look", parent: "root", build: buildLook, keys: ["skin", "landing", "lockLight", "grid"] },
  { id: "colour", title: "Colour help", parent: "look", build: buildColour, keys: ["palette", "glyphs"] },
  { id: "graphics", title: "Graphics", parent: "look", build: buildGraphics, keys: ["graphics"] },
  { id: "sound", title: "Sound", parent: "root", build: buildSound,
    keys: ["quiet", "master", "music", "sfx", "ambience", "soften", "playOnSilent", "muteOnBlur"] },
  { id: "quality", title: "Sound quality", parent: "sound", build: buildQuality, keys: ["audioQuality"] },
  { id: "comfort", title: "Comfort", parent: "root", build: buildComfort,
    keys: ["motion", "juice", "nudge", "labels", "textSize", "boardSize", "reminder", "learner"] }
];
/* the old sheet names still open the right page */
var ALIAS = { settings: "root", handling: "controls" };
var TOPS = ["controls", "moves", "look", "sound", "comfort"];

function current() { return stack.length ? stack[stack.length - 1] : "root"; }
function chain(id) {
  var out = [], p = pages[id], guard = 0;
  while (p && guard++ < 8) { out.unshift(p.id); p = p.parent ? pages[p.parent] : null; }
  if (out[0] !== "root") out.unshift("root");
  return out;
}
function topOf(id) { var c = chain(id); return c.length > 1 ? c[1] : "root"; }
function allowed(id) {
  if (!pages[id]) return false;
  return !(steady && (topOf(id) === "controls" || id === "moves" || id === "keys" || id === "fine"));
}
function firstTop() {
  if (lastTop && allowed(lastTop)) return lastTop;
  for (var i = 0; i < TOPS.length; i++) if (allowed(TOPS[i])) return TOPS[i];
  return "look";
}
function scroller() {
  if (split) { var p = pages[current()]; return p ? p.el : sheetEl; }
  return sheetEl;
}

/* draw the stack: which page is on, the title, the back button */
function render(dir, fresh) {
  if (split && stack.length < 2) stack.push(firstTop());
  var cur = current(), id;
  for (id in pages) {
    var p = pages[id], on = id === cur || (split && id === "root");
    var was = p.el.classList.contains("on");
    p.el.classList.toggle("on", on);
    p.el.classList.remove("in-r", "in-l", "in-f");
    if (on && id === cur && dir && (!was || dir !== "f")) {
      void p.el.offsetWidth;                         /* restart the entrance */
      p.el.classList.add(dir === "l" ? "in-l" : dir === "f" ? "in-f" : "in-r");
    }
  }
  if (split) lastTop = stack[1];
  if (titleEl) titleEl.textContent = pages[cur].title;
  if (backEl) backEl.classList.toggle("hide", stack.length <= (split ? 2 : 1));
  /* the wide sheet marks the root row whose page is showing */
  var rows = pages.root.el.querySelectorAll("[data-go]");
  for (var i = 0; i < rows.length; i++) {
    var mine = split && rows[i].getAttribute("data-go") === stack[1];
    rows[i].classList.toggle("cur", mine);
    if (mine) rows[i].setAttribute("aria-current", "page"); else rows[i].removeAttribute("aria-current");
  }
  if (pages[cur].onShow) { try { pages[cur].onShow(fresh); } catch (e) { later(e); } }
  paintSoon();
}
function endAnim(e) {
  var t = e.target;
  if (t && t.classList && t.classList.contains("set-page")) t.classList.remove("in-r", "in-l", "in-f");
}

/* push a page; "from" is the row that asked, for the way back */
function go(id, from) {
  if (!allowed(id)) return;
  stopCapture(false);
  if (split && pages[id].parent === "root") { rootGo(id, null); focusNode(titleEl); return; }
  scrolls[stack.length - 1] = scroller().scrollTop;
  stack.push(id);
  render("r", true);
  scroller().scrollTop = 0;
  if (from) from.blur();
  focusNode(titleEl);
}
function back() {
  if (stack.length <= (split ? 2 : 1)) return false;
  stopCapture(false);
  var gone = stack.pop();
  render("l", false);
  var sc = scroller(), y = scrolls[stack.length - 1] || 0;
  sc.scrollTop = y;
  /* back onto the row that led away, the way a phone's settings do */
  var row = pages[current()].el.querySelector('[data-go="' + gone + '"]');
  if (row && !row.closest(".hide")) focusNode(row); else focusNode(titleEl);
  sc.scrollTop = y;
  return true;
}
/* a root row: on a phone a push; on the wide sheet, the page beside */
function rootGo(id, e) {
  if (!allowed(id)) return;
  if (!split) { go(id, e && e.currentTarget); return; }
  stopCapture(false);
  var same2 = stack[1] === id && stack.length === 2;
  stack = ["root", id];
  render(same2 ? "" : "f", !same2);
  scroller().scrollTop = 0;
  /* a press by keyboard (Enter, Space) steps into the page */
  if (e && e.detail === 0) intoPage();
}
function intoPage() {
  var p = pages[current()];
  var f = p && focusables(p.el)[0];
  focusNode(f || titleEl);
}

/* which shape the sheet takes: the bottom sheet, the panel, or the wide two-column one */
function shape() {
  var s = mq("(min-width:900px) and (pointer:fine)");
  phoneShape = mq("(max-width:599px), (pointer:coarse) and (max-width:699px)");
  if (skinRow) skinRow.classList.toggle("scroll", phoneShape);
  if (s === split) return false;
  split = s;
  if (sheetEl) sheetEl.classList.toggle("split", s);
  return true;
}

/* ======================================================================
   the shell, opening, closing, focus
   ====================================================================== */
function isOpen() { return !!ovEl && !ovEl.classList.contains("hide"); }

/* find the app's shell (index.html), or make one if it is missing */
function shell() {
  ovEl = $("ovSettings");
  if (!ovEl) {
    ovEl = el("div", "ov hide");
    ovEl.id = "ovSettings";
    ovEl.setAttribute("role", "dialog");
    ovEl.setAttribute("aria-modal", "true");
    ovEl.setAttribute("aria-labelledby", "setTitle");
    var sh = put(ovEl, el("div", "sheet set"));
    put(sh, el("div", "grab")).setAttribute("aria-hidden", "true");
    var hd = put(sh, el("div", "shead"));
    var bk = put(hd, el("button", "ibtn back hide"));
    bk.type = "button";
    bk.setAttribute("data-back", "");
    bk.setAttribute("aria-label", "Back");
    bk.appendChild(icon("back"));
    var h2 = put(hd, el("h2", null, "Settings"));
    h2.id = "setTitle";
    h2.tabIndex = -1;
    var x = put(hd, el("button", "ibtn close"));
    x.type = "button";
    x.setAttribute("data-close", "ovSettings");
    x.setAttribute("aria-label", "Close settings");
    x.appendChild(icon("close"));
    x.addEventListener("click", function () { ovEl.classList.add("hide"); });
    put(sh, el("div", "set-body")).id = "setBody";
    doc.body.appendChild(ovEl);
  }
  sheetEl = ovEl.querySelector(".sheet");
  sheetEl.classList.add("set");
  bodyEl = $("setBody") || put(sheetEl, el("div", "set-body"));
  if (!bodyEl.id) bodyEl.id = "setBody";
  bodyEl.classList.add("set-body");
  titleEl = $("setTitle") || sheetEl.querySelector("h2");
  if (titleEl && !titleEl.hasAttribute("tabindex")) titleEl.tabIndex = -1;
  backEl = sheetEl.querySelector("[data-back]");
  if (backEl) backEl.addEventListener("click", function () { back(); });
  if (!sheetEl.hasAttribute("tabindex")) sheetEl.tabIndex = -1;

  ovEl.addEventListener("keydown", function (e) {
    if (cap) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      var x2 = sheetEl.querySelector("[data-close]");
      if (x2) x2.click(); else ovEl.classList.add("hide");
      return;
    }
    if (e.altKey && e.key === "ArrowLeft") {
      if (back()) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if (e.key === "Tab") trap(e, sheetEl);
  });
  ovEl.addEventListener("animationend", endAnim);
  /* the app opens and closes sheets by toggling .hide; listen for the
     close so a half-finished key capture never outlives the sheet, and so
     focus goes back where it came from */
  if (root.MutationObserver) {
    var was = isOpen();
    new root.MutationObserver(function () {
      var open = isOpen();
      if (was && !open) closed();
      if (!was && open) opened();
      was = open;
    }).observe(ovEl, { attributes: true, attributeFilter: ["class"] });
  }
}

function focusables(scope) {
  var all = scope.querySelectorAll("button, [href], input, select, textarea, [tabindex]");
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    if (n.tabIndex < 0 || n.disabled) continue;
    if (!n.offsetWidth && !n.offsetHeight && !n.getClientRects().length) continue;
    out.push(n);
  }
  return out;
}
/* Tab wraps inside the sheet. "Nothing focusable before (or after) where
   the focus is" covers the title, which takes focus but is not a stop. */
function trap(e, scope) {
  var f = focusables(scope);
  if (!f.length) return;
  var at = doc.activeElement, before = false, after = false;
  for (var i = 0; i < f.length; i++) {
    if (f[i] === at) continue;
    var pos = at && at.compareDocumentPosition ? at.compareDocumentPosition(f[i]) : 0;
    if (pos & 2) before = true;
    if (pos & 4) after = true;
  }
  if (!scope.contains(at) || at === scope) { before = after = false; }
  if (e.shiftKey && !before) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && !after) { e.preventDefault(); f[0].focus(); }
}

/* where the eyes start: the title for a finger (a screen reader starts
   there too), the first thing to press for a keyboard */
function entryFocus() {
  var t = null;
  if (kbdMode()) {
    if (split && stack.length === 2) t = pages.root.el.querySelector('[data-go="' + stack[1] + '"]');
    if (!t || t.closest(".hide")) t = focusables(pages[current()].el)[0] || null;
  }
  focusNode(t || titleEl || sheetEl);
}

var viaOpen = false;     /* Sheets.open did the work; the observer need not */
function opened() {
  if (viaOpen) { viaOpen = false; return; }
  if (!opener) opener = doc.activeElement;
  shape();
  if (!stack.length) stack = ["root"];
  sawPad = sawPad || padNow();
  Sheets.refresh();
  render("", true);
  if (!sheetEl.contains(doc.activeElement)) entryFocus();
}
function closed() {
  stopCapture(false);
  sheenAnim = null;
  for (var i = 0; i < resets.length; i++) { try { resets[i](); } catch (e) { later(e); } }
  if (keyUI) { keyUI.before = null; keyUI.undo.classList.add("hide"); say(""); }
  stack = [];
  scrolls = [];
  var b = opener;
  opener = null;
  var at = doc.activeElement;
  if (b && b.focus && doc.contains(b) && (!at || at === doc.body || sheetEl.contains(at))) {
    if (b.offsetWidth || b.offsetHeight || b.getClientRects().length) focusNode(b);
  }
}

/* Text size scales the root font, so everything sized in rem — the
   sheets, the buttons, the HUD — grows together. The room's stylesheet
   does the scaling from --ts (html{font-size:calc(16px * var(--ts))});
   --text-scale is the same number under a plainer name. If a page has no
   such rule, the root font is set directly instead, so the setting works
   either way. */
function applyText() {
  var s = P.get("textSize") || 1, de = doc.documentElement;
  de.style.setProperty("--ts", String(s));
  de.style.setProperty("--text-scale", String(s));
  de.style.fontSize = "";
  var cs = root.getComputedStyle ? root.getComputedStyle(de) : null;
  var px = cs ? parseFloat(cs.fontSize) : 0;
  if (s !== 1 && px && Math.abs(px - 16 * s) > 0.5) de.style.fontSize = (Math.round(s * 1000) / 10) + "%";
  de.classList.toggle("ts-big", s >= 1.3);
}

/* Every change from anywhere arrives here. With the sheet closed there
   is nothing to redraw, so the work waits until it opens — a setting
   changed mid-run never costs the frame it happens in. */
function onPref(k) {
  if (k === "textSize") applyText();
  if (!isOpen()) return;                   /* opening refreshes everything */
  Sheets.refresh();
}

/* ======================================================================
   the public face
   ====================================================================== */

/* o = {prefs, onChange(key, value), guide, openAbout}. Builds every page
   into the #ovSettings shell; safe to call twice (the second call takes
   the new options and refreshes). */
Sheets.init = function (o) {
  o = o || {};
  if (ready) {
    if (typeof o.onChange === "function") hook = o.onChange;
    if (o.guide !== undefined) G = o.guide || null;
    if (typeof o.openAbout === "function") aboutFn = o.openAbout;
    Sheets.refresh();
    return true;
  }
  P = o.prefs || root.Prefs;
  doc = root.document;
  if (!P || !doc || !doc.body) return false;
  hook = typeof o.onChange === "function" ? o.onChange : null;
  G = o.guide || null;
  aboutFn = typeof o.openAbout === "function" ? o.openAbout : null;
  ready = true;
  addStyle();
  layoutNames();
  root.addEventListener("keydown", learnKey, true);
  root.addEventListener("gamepadconnected", function () { sawPad = true; });
  shell();
  while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
  var i;
  for (i = 0; i < PAGE_LIST.length; i++) {
    var d = PAGE_LIST[i];
    var sec = put(bodyEl, el("section", "set-page set-flow"));
    sec.setAttribute("data-page", d.id);
    pages[d.id] = { id: d.id, title: d.title, parent: d.parent || null, el: sec, keys: d.keys || null, onShow: null };
  }
  for (i = 0; i < PAGE_LIST.length; i++) PAGE_LIST[i].build(pages[PAGE_LIST[i].id].el);
  shape();
  if (typeof P.on === "function") P.on(onPref);
  root.addEventListener("resize", function () {
    if (shape() && isOpen()) render("", false);
    if (isOpen()) paintSoon();
  });
  applyText();
  Sheets.refresh();
  return true;
};

/* Show the sheet, on a page: "settings" (the root), "controls" (or the
   old "handling"), "moves", "look", "sound", "comfort", "keys", "fine",
   "colour", "graphics", "quality". A deep page opens with its way back
   built under it. o.steady hides Controls and Moves (Steady's own pause). */
Sheets.open = function (id, o) {
  if (!ready && !Sheets.init({})) return false;
  o = o || {};
  steady = !!o.steady;
  var pid = ALIAS[id] || id;
  if (!pages[pid] || !allowed(pid)) pid = "root";
  stopCapture(false);
  if (!isOpen()) opener = doc.activeElement;
  shape();
  sawPad = sawPad || padNow();
  stack = chain(pid);
  scrolls = [];
  Sheets.refresh();
  /* the sheet opened last sits on top, by document order */
  if (ovEl.parentNode === doc.body && ovEl !== doc.body.lastElementChild) doc.body.appendChild(ovEl);
  if (!isOpen()) viaOpen = true;
  ovEl.classList.remove("hide");
  render("", true);
  sheetEl.scrollTop = 0;
  scroller().scrollTop = 0;
  entryFocus();
  return true;
};

/* hide the sheet directly (its close button is the usual way) */
Sheets.close = function () {
  if (!ovEl) return false;
  stopCapture(false);
  ovEl.classList.add("hide");
  return true;
};

Sheets.isOpen = function () { return ready && isOpen(); };

/* the page on show, for the app and its tests ("root", "look", ...) */
Sheets.page = function () { return isOpen() ? current() : null; };

/* re-read every value from Prefs and redraw */
Sheets.refresh = function () {
  if (!ready) return;
  for (var i = 0; i < controls.length; i++) {
    try { controls[i].update(); } catch (e) { later(e); }
  }
  if (isOpen()) paintSoon();
};

if (typeof module !== "undefined" && module.exports) module.exports = Sheets;
else root.Sheets = Sheets;
})(typeof self !== "undefined" ? self : this);
