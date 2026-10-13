/* sheets.js — the four settings sheets: Look, Handling, Sound and Comfort.

   The app writes four empty shells into index.html (#ovLook, #ovHandling,
   #ovSound, #ovComfort, each an .ov holding a .sheet and a body div); this
   file fills them, once, at Sheets.init, and from then on every control
   is a live view of a value in Prefs. Nothing here keeps a copy of a
   setting. A control reads Prefs when it draws and writes Prefs when it is
   touched, and every change from anywhere — a sheet, the pause menu, the
   device's own accessibility settings, another tab — comes back through
   Prefs.on and redraws whatever shows it. That is what lets the Ink skin
   arrive by itself when the system asks for more contrast, and the card
   for it light up in a sheet that happens to be open.

   ## One line for every control

   Every control says, in one plain sentence, what it does, because a
   setting you have to look up is a setting nobody uses. The genre's
   jargon (DAS, ARR, IRS) appears only as a quiet tag after a plain name,
   for the people who already speak it.

   ## Changes are visible at once

   The sheets sit over a paused game, so there is no Apply button and no
   Cancel: a skin is chosen by touching it, and the swatches are drawn in
   the colours, material and glyphs you would actually get. Each skin card
   paints a fused T and S on a canvas with that skin's material: frosted
   glass is translucent with a lit rim, river stone is matte and speckled,
   jelly has a soft inner glow and a hard highlight, paper lantern glows
   and has fibres, ink is flat with a light outline, moonlight is one pale
   colour that leans on its glyphs. They are small, but they are honest:
   the drawing reads the same Skins data the renderers do.

   ## Keyboard first, touch friendly

   Every group of choices is a real radio group: one Tab stop, arrows to
   move, the choice follows the focus, the way native radio buttons work.
   Switches are role="switch" buttons, sliders are native range inputs
   with spoken values ("minus 8 decibels", not "0.8"). Tab is held inside
   an open sheet, Esc closes it through its own close button (so the app's
   close logic runs, whatever it is), and focus returns to whatever opened
   it. Frequent targets are at least 44 px tall, and everything is sized
   in rem so the Text size setting, which this file applies to the root
   element, grows the sheets with it.

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

   This file touches the document only inside functions, so it loads in
   node without complaint; it does nothing until Sheets.init is called. */
(function (root) {
"use strict";

var Sheets = {};

var doc = null;          /* the document, once init has run               */
var P = null;            /* Prefs                                          */
var hook = null;         /* the app's onChange(key, value)                 */
var ready = false;
var controls = [];       /* {update} for every live control                */
var paints = [];         /* canvases on the Look sheet: {canvas, draw, id} */
var names = {};          /* e.code -> e.key, learned on this device        */
var opener = {};         /* what had focus before each sheet opened        */
var keyUI = null;        /* the remap block's parts                        */

var IDS = ["look", "handling", "sound", "comfort"];
var OV = { look: "ovLook", handling: "ovHandling", sound: "ovSound", comfort: "ovComfort" };
var BODY = { look: "lookBody", handling: "handlingBody", sound: "soundBody", comfort: "comfortBody" };
var TITLE = { look: "Look", handling: "Handling", sound: "Sound", comfort: "Comfort" };

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

/* ======================================================================
   the stylesheet
   look.css is shared by every room and must stay byte-identical, so the
   few things these sheets need beyond it — switches, segmented rows,
   keycaps, the swatch canvases — are added here, once, scoped to .wsx
   (which every sheet body carries). Colours come from look.css's own
   custom properties, so the room's palette carries straight through.
   ====================================================================== */
var CSS = [
  ".wsx{font-size:1rem}",
  ".wsx .lead{margin:0 0 4px}",
  ".wsx h3{margin:26px 0 4px;padding-top:16px;border-top:1px solid var(--line);",
  "  font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:700}",
  ".wsx h3.wfirst{border-top:0;padding-top:0;margin-top:12px}",
  /* a folded section: its summary is the section's heading */
  ".wsx details.wfold{margin:26px 0 4px;padding-top:6px;border-top:1px solid var(--line)}",
  ".wsx details.wfold.wfirst{border-top:0;margin-top:6px}",
  ".wsx details.wfold>summary{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;list-style:none;",
  "  font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);font-weight:700}",
  ".wsx details.wfold>summary::-webkit-details-marker{display:none}",
  ".wsx details.wfold>summary:after{content:\"\";width:7px;height:7px;margin-left:2px;border:solid currentColor;border-width:0 1.5px 1.5px 0;",
  "  transform:rotate(-45deg);transition:transform .2s}",
  ".wsx details.wfold[open]>summary:after{transform:rotate(45deg) translate(-2px,-2px)}",
  ".wsx details.wfold>.note{margin:0 2px 12px}",
  ".wsx .note{color:var(--soft);font-size:.82rem;line-height:1.45;margin:6px 2px 0}",
  ".wsx h3 + .note{margin:0 2px 12px}",
  ".wsx .wgrp{margin:16px 0}",
  ".wsx .wlbl{display:flex;align-items:baseline;gap:8px;font-size:.86rem;color:var(--soft);margin:0 2px 7px}",
  ".wsx .wlbl b,.wsx .fld>label b{color:var(--ink);font-weight:650;font-size:.95rem}",
  ".wsx .wlbl i,.wsx .fld>label i{font-style:normal;font-size:.72rem;letter-spacing:.06em;color:var(--soft);opacity:.8}",
  ".wsx .val{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}",
  ".wsx .fld{margin:18px 0}",
  ".wsx .fld>label{align-items:baseline;margin:0 2px 2px}",
  /* at a large text size a long name keeps its line and the value steps down */
  ".wsx .fld>label,.wsx .wlbl{flex-wrap:wrap;row-gap:0}",
  ".wsx input[type=range]{display:block;width:100%;height:36px;margin:0;background:transparent;",
  "  accent-color:var(--accent);cursor:pointer}",
  ".wsx .wends{display:flex;justify-content:space-between;font-size:.7rem;color:var(--soft);",
  "  opacity:.75;margin:1px 2px 0;font-variant-numeric:tabular-nums}",
  /* cards */
  ".wsx .opts{gap:8px}",
  ".wsx .opt{display:flex;flex-direction:column;justify-content:flex-start;align-items:stretch;",
  "  width:100%;min-height:48px;position:relative;color:var(--ink)}",
  ".wsx .opt.on{background:var(--card2)}",
  /* the chosen card's tint sits under its content, never over the swatch */
  ".wsx .opt,.wsx .wseg .btn{isolation:isolate}",
  ".wsx .opt.on::before,.wsx .wseg .btn.on::before{content:'';position:absolute;inset:0;border-radius:inherit;",
  "  background:var(--accent);opacity:.12;pointer-events:none;z-index:-1}",
  ".wsx .opt small{margin-top:3px}",
  ".wsx .wskins{grid-template-columns:repeat(auto-fit,minmax(9.2rem,1fr))}",
  ".wsx .wtwo{grid-template-columns:repeat(2,minmax(0,1fr))}",
  ".wsx .wgfx .opt:first-child{grid-column:1/-1}",
  ".wsx .opt canvas{display:block;width:100%;height:5.4rem;border-radius:9px;margin:0 0 10px;",
  "  background:#0b0e16}",
  /* segmented rows */
  ".wsx .wseg{display:flex;gap:6px}",
  ".wsx .wseg .btn{flex:1 1 0;min-width:0;min-height:46px;font-size:.88rem;padding:6px 6px;",
  "  position:relative;box-shadow:none}",
  ".wsx .wseg.wgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(3.7rem,1fr))}",
  ".wsx .wseg.wgrid .btn{font-size:.78rem;padding:6px 1px;letter-spacing:-.01em}",
  ".wsx .wseg .btn.wstack{flex-direction:column;gap:0;line-height:1.15}",
  ".wsx .wseg .btn small{font-size:.72rem;color:var(--soft);font-weight:500;font-variant-numeric:tabular-nums}",
  ".wsx .wseg .btn.on{border-color:var(--accent)}",
  /* switches */
  ".wsx .wtg{display:flex;align-items:center;gap:14px;width:100%;text-align:left;margin:8px 0;",
  "  padding:11px 13px;min-height:56px;border:1px solid var(--line);border-radius:13px;background:var(--card2);",
  "  color:var(--ink);transition:border-color .15s}",
  ".wsx .wtg .wtx{flex:1;min-width:0}",
  ".wsx .wtg b{display:block;font-weight:650;font-size:.95rem}",
  ".wsx .wtg b i{font-style:normal;font-size:.72rem;font-weight:600;letter-spacing:.06em;color:var(--soft);margin-left:6px}",
  ".wsx .wtg small{display:block;color:var(--soft);font-size:.8rem;line-height:1.4;margin-top:2px}",
  ".wsx .wsw{flex:none;position:relative;width:48px;height:30px;border-radius:15px;",
  "  background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px var(--line);transition:background .2s}",
  ".wsx .wsw::after{content:'';position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;",
  "  background:#f3efe8;box-shadow:0 1px 3px rgba(0,0,0,.55);transition:transform .22s cubic-bezier(.3,1.35,.5,1)}",
  ".wsx .wtg[aria-checked=true] .wsw{background:var(--accent);box-shadow:none}",
  ".wsx .wtg[aria-checked=true] .wsw::after{transform:translateX(18px)}",
  /* worlds */
  /* ten worlds: two even columns on a phone, one row of five on a wide sheet */
  ".wsx .wworlds{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}",
  "@media (min-width:600px){.wsx .wworlds{grid-template-columns:repeat(5,minmax(0,1fr))}}",
  ".wsx .wworlds .opt{padding:6px 6px 8px;text-align:center}",
  ".wsx .wworlds .opt canvas{height:3.6rem;border-radius:8px;margin:0 0 7px}",
  ".wsx .wworlds .opt b{font-size:.8rem;line-height:1.2;font-weight:650}",
  /* the piece preview */
  ".wsx canvas.wpv{display:block;width:100%;height:7.6rem;border-radius:12px;margin:12px 0 0;background:#0b0e16}",
  /* keys */
  ".wsx .wkeys{margin:8px 0 0}",
  ".wsx .wkr{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:7px 2px;",
  "  border-bottom:1px solid var(--line)}",
  ".wsx .wkr:last-child{border-bottom:0}",
  ".wsx .wkr .wan{flex:1 1 8.5rem;min-width:0;font-size:.9rem}",
  ".wsx .wkr .wan small{display:block;color:var(--soft);font-size:.74rem;line-height:1.3}",
  ".wsx .wkr.woff .wan{opacity:.55}",
  ".wsx .wkr .wkk{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;margin-left:auto}",
  ".wsx .wkc{min-width:44px;min-height:44px;padding:4px 11px;border-radius:10px;color:var(--ink);",
  "  background:var(--room);border:1px solid var(--line);",
  "  box-shadow:inset 0 -3px 0 rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06);",
  "  font-size:.86rem;font-weight:650;line-height:1;white-space:nowrap}",
  ".wsx .wkc.wadd{color:var(--soft);background:transparent;border-style:dashed;box-shadow:none}",
  ".wsx .wkc.wcap{border-color:var(--accent);color:var(--accent);box-shadow:0 0 0 3px rgba(255,255,255,.07);",
  "  font-weight:600}",
  ".wsx .wkc.wcap::after{content:'';display:inline-block;width:2px;height:1em;margin-left:5px;vertical-align:-2px;",
  "  background:currentColor;animation:wsxBlink 1s steps(2) infinite}",
  "@keyframes wsxBlink{50%{opacity:0}}",
  ".wsx .wnokey{color:var(--soft);font-size:.78rem;font-style:italic}",
  ".wsx .row .btn{min-height:46px}",
  /* the notes that only appear sometimes */
  ".wsx .wtip{margin:18px 0 0;padding:12px 14px;border:1px solid var(--line);border-radius:13px;",
  "  background:var(--card2);font-size:.86rem;line-height:1.5}",
  ".wsx .wtip b{display:block;margin-bottom:2px}",
  ".wsx .wtip .row{margin-top:8px}",
  ".wsx .wdim{opacity:.5}",
  /* look.css's close button is sticky, so it rides over the content as
     the sheet scrolls; give it the sheet's own colour behind it and a
     full 44 px target, which changes nothing at rest */
  ".wsheet .close{display:flex;align-items:center;justify-content:center;width:44px;height:44px;",
  "  margin:-8px -10px 0 8px;padding:0;border-radius:50%;background:var(--card)}",
  /* focus that shows for keyboards and stays quiet for fingers */
  ".wsx :focus,.wsheet .close:focus{outline:2px solid var(--glow);outline-offset:2px}",
  ".wsx :focus:not(:focus-visible),.wsheet .close:focus:not(:focus-visible){outline:none}",
  ".wsx input[type=range]:focus{outline-offset:0;border-radius:8px}",
  ".wsheet:focus{outline:none}",
  /* the device's wish, and the player's own Gentle or Still, both stop the
     sheets' small movements: the switch's slide, the keycap's caret */
  "@media (prefers-reduced-motion:reduce){.wsx *,.wsx *::after{transition:none!important;animation:none!important}}",
  ".wsx.wstill *,.wsx.wstill *::after{transition:none!important;animation:none!important}",
  /* Forced colours (Windows High Contrast) flatten the tint and the accent
     border that say which card is chosen, and the switch's track and thumb
     with them. The chosen card's tint becomes an inner ring in Highlight
     (never an outline: that is the focus ring, and the focused card is
     usually the chosen one), and the switch is drawn in system colours. */
  "@media (forced-colors:active){",
  "  .wsx .opt.on::before,.wsx .wseg .btn.on::before{opacity:1;background:none;border:3px solid Highlight;inset:2px}",
  "  .wsx .wsw{border:2px solid CanvasText}",
  "  .wsx .wsw::after{top:2px;left:2px;background:CanvasText;box-shadow:none}",
  "  .wsx .wtg[aria-checked=true] .wsw{border-color:Highlight;background:Highlight}",
  "  .wsx .wtg[aria-checked=true] .wsw::after{background:HighlightText}",
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
   building blocks
   ====================================================================== */
function section(body, title, text, first) {
  var h = put(body, el("h3", first ? "wfirst" : null, title));
  h.id = uid("h");
  if (text) put(body, el("p", "note", text));
  return h.id;
}
function note(parent, text, cls) {
  var p = put(parent, el("p", "note" + (cls ? " " + cls : ""), text));
  p.id = uid("ln");
  return p;
}
/* a visible label for a group that isn't a single input */
function groupLabel(parent, name, tag) {
  var d = put(parent, el("div", "wlbl"));
  var b = put(d, el("b", null, name));
  b.id = uid("gl");
  if (tag) put(d, el("i", null, tag));
  var v = put(d, el("span", "val"));
  return { id: b.id, val: v };
}
function live(fn) {
  var c = { update: fn };
  controls.push(c);
  fn();
  return c;
}
function showIf(node, fn) { live(function () { node.classList.toggle("hide", !fn()); }); }

/* A radio group with a roving tab stop. items: [{v, node}]. The choice
   follows the arrow keys, which is how native radios behave, and is what
   makes a skin preview as you arrow through them. */
function radios(group, items, read, pick, labelId) {
  group.setAttribute("role", "radiogroup");
  if (labelId) group.setAttribute("aria-labelledby", labelId);
  function update() {
    var cur = read(), any = false, i;
    for (i = 0; i < items.length; i++) {
      var on = items[i].v === cur;
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
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % n;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i + n - 1) % n;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = n - 1;
      if (j < 0) return;
      e.preventDefault();
      items[j].node.focus();
      pick(items[j].v);
      update();
    });
  });
  live(update);
}

/* option cards: [{v, name, line}] in an .opts grid */
function cards(parent, k, list, labelId, cls) {
  var grid = put(parent, el("div", "opts" + (cls ? " " + cls : "")));
  grid.setAttribute("data-k", k);
  var items = [];
  list.forEach(function (o) {
    var b = put(grid, el("button", "opt"));
    put(b, el("b", null, o.name));
    var sm = put(b, el("small", null, o.line || ""));
    items.push({ v: o.v, node: b, small: sm });
  });
  radios(grid, items, function () { return P.get(k); }, function (v) { choose(k, v); }, labelId);
  return items;
}

/* a segmented row: [{v, name, sub?}] */
function segs(parent, k, list, labelId, onPick) {
  var row = put(parent, el("div", "wseg"));
  row.setAttribute("data-k", k);
  var items = [];
  list.forEach(function (o) {
    var b = put(row, el("button", "btn" + (o.sub ? " wstack" : "")));
    put(b, el("span", null, o.name));
    if (o.sub) put(b, el("small", null, o.sub));
    if (o.speak) b.setAttribute("aria-label", o.speak);
    items.push({ v: o.v, node: b });
  });
  radios(row, items, function () { return P.get(k); },
         onPick || function (v) { choose(k, v); }, labelId);
  return row;
}

/* a labelled segmented choice, with a value readout and one line that
   explains the option that is currently chosen */
function choice(parent, k, name, tag, list, text) {
  var g = put(parent, el("div", "wgrp"));
  var lab = groupLabel(g, name, tag);
  segs(g, k, list, lab.id);
  var ln = note(g, "");
  live(function () {
    var cur = P.get(k), o = null;
    for (var i = 0; i < list.length; i++) if (list[i].v === cur) o = list[i];
    lab.val.textContent = o && o.val ? o.val : "";
    ln.textContent = (o && o.line) ? o.line : text;
  });
  return g;
}

/* an on/off switch that is the whole row */
function toggle(parent, k, name, text, tag) {
  var b = put(parent, el("button", "wtg"));
  b.type = "button";
  b.setAttribute("role", "switch");
  b.setAttribute("data-k", k);
  var tx = put(b, el("span", "wtx"));
  var nm = put(tx, el("b", null, name));
  nm.id = uid("tn");
  var sm = put(tx, el("small", null, text));
  sm.id = uid("td");
  put(b, el("span", "wsw")).setAttribute("aria-hidden", "true");
  b.setAttribute("aria-labelledby", nm.id);
  b.setAttribute("aria-describedby", sm.id);
  if (tag) nm.appendChild(el("i", null, tag));
  b.addEventListener("click", function () { choose(k, !P.get(k)); });
  live(function () { b.setAttribute("aria-checked", P.get(k) ? "true" : "false"); });
  return { node: b, small: sm };
}

/* a range slider. s = {min, max, step, to(pos), from(value), fmt(value),
   speak(value), ends:[left, right]} */
function slider(parent, k, name, text, s, tag) {
  var f = put(parent, el("div", "fld"));
  var lab = put(f, el("label"));
  var id = uid("rg");
  lab.setAttribute("for", id);
  put(lab, el("b", null, name));
  if (tag) put(lab, el("i", null, tag));
  /* the value shown beside the name is not part of the name: a screen
     reader has it from aria-valuetext, and a name that changed on every
     step would be read out again on every step */
  var val = put(lab, el("span", "val"));
  val.setAttribute("aria-hidden", "true");
  var r = put(f, el("input"));
  r.type = "range"; r.id = id;
  r.min = String(s.min); r.max = String(s.max); r.step = String(s.step);
  r.setAttribute("data-k", k);
  if (s.ends) {
    var e = put(f, el("div", "wends"));
    e.setAttribute("aria-hidden", "true");
    put(e, el("span", null, s.ends[0]));
    put(e, el("span", null, s.ends[1]));
  }
  var ln = note(f, text);
  r.setAttribute("aria-describedby", ln.id);
  function show() {
    var v = P.get(k);
    val.textContent = s.fmt(v);
    r.setAttribute("aria-valuetext", s.speak ? s.speak(v) : s.fmt(v));
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
function pct(v) { return Math.round(v * 100) + "%"; }
function ms(v) { return v + " ms"; }
function db(v) { return v <= 0 ? "Off" : v >= 1 ? "0 dB" : "−" + Math.round((1 - v) * 40) + " dB"; }
function dbSpeak(v) { return v <= 0 ? "off" : v >= 1 ? "full, 0 decibels" : "minus " + Math.round((1 - v) * 40) + " decibels"; }
function extend(a, b) { for (var k in b) a[k] = b[k]; return a; }

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
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }

function drawGlyph(ctx, kind, x, y, s, c, level) {
  var a = level === "strong" ? 0.66 : 0.32;
  var ink = luma(c) < 0.3 ? "rgba(255,255,255," + a + ")" : "rgba(10,14,24," + a + ")";
  var L = x + s * 0.3, R = x + s * 0.7, T = y + s * 0.3, B = y + s * 0.7, M = x + s * 0.5, N = y + s * 0.5;
  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1, s * (level === "strong" ? 0.09 : 0.075));
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
function paintPiece(ctx, type, ox, oy, s, hex, mat, glyph, seed, sheen) {
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
  if (glyph && glyph !== "off") {
    for (i = 0; i < cells.length; i++) {
      drawGlyph(ctx, GLYPH[type], ox + cells[i][0] * s, oy + cells[i][1] * s, s, c, glyph);
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
/* a skin's glyph setting is a floor: Moonlight and Ink always mark */
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

function backdrop(ctx, w, h) {
  var bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#161b2b");
  bg.addColorStop(1, "#080a11");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  var kl = ctx.createRadialGradient(w * 0.22, -h * 0.25, 0, w * 0.22, -h * 0.25, Math.max(w, h) * 0.95);
  kl.addColorStop(0, "rgba(255,236,214,.11)");
  kl.addColorStop(1, "rgba(255,236,214,0)");
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

/* the seven pieces in the chosen skin, palette and glyphs */
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
      var t = rows[r][i], dy = t === "I" ? 0.5 * s : 0;
      paintPiece(ctx, t, x, y + dy, s, col[t], sk.mat, gl, seed + i + r * 10, -1);
      x += (widthOf(t) + gapU) * s;
    }
    y += Math.round(2.9 * s);
  }
}
function widthOf(t) {
  var m = 0;
  for (var i = 0; i < SHAPE[t].length; i++) m = Math.max(m, SHAPE[t][i][0] + 1);
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
/* paint every canvas on the Look sheet, or just the one named */
function paintAll(only) {
  if (typeof only !== "string") { only = null; paintQueued = false; }
  if (!isOpen("look")) return;
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
  if (motion() !== "full") return;
  var start = now(), dur = 720;
  sheenAnim = { id: id, t: -0.3 };
  function step() {
    if (!sheenAnim || sheenAnim.id !== id) return;
    var k = (now() - start) / dur;
    if (k >= 1 || !isOpen("look")) { sheenAnim = null; paintAll(id); return; }
    sheenAnim.t = -0.3 + k * 1.6;
    paintAll(id);
    frame(step);
  }
  frame(step);
}

/* A world card: the world's sky, its key light low on the horizon, and
   the one motif the brief gives it (§6.2), small enough to read at the
   size of a thumbnail — mist and a pale sun for Dawn, ribbons for Aurora,
   paper lanterns rising for Lanterns. Coloured from the Worlds data, so a
   retuned world retunes its card. Never a flame, never lightning. */
function paintWorld(ctx, w, h, W) {
  var sky = W.sky || {}, top = rgb(sky.top || "#101420"), hor = rgb(sky.horizon || "#202838");
  var key = rgb(W.key || "#ffffff"), rim = rgb(W.rim || "#9fb4ff");
  var pc = rgb((W.particle && W.particle.color) || W.key || "#ffffff");
  var g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(top));
  g.addColorStop(1, rgba(hor));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  var rnd = stream(hash(W.id || "w"));
  var i, x, y, r, k;
  function glow(cx, cy, rad, c, a) {
    var q = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    q.addColorStop(0, rgba(c, a));
    q.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = q;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  function dots(n, c, a, size, yTop, yBot) {
    for (k = 0; k < n; k++) {
      ctx.fillStyle = rgba(c, a * (0.5 + rnd() * 0.5));
      ctx.beginPath();
      ctx.arc(rnd() * w, yTop + rnd() * (yBot - yTop), size * (0.5 + rnd() * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.lineCap = "round";
  switch (W.id) {
    case "dawn":                           /* a pale sun low, mist lifting, far birds */
      glow(w * 0.62, h * 1.02, h * 0.95, key, 0.42);
      glow(w * 0.62, h * 0.9, h * 0.16, key, 0.75);
      for (i = 0; i < 3; i++) {
        ctx.fillStyle = rgba(mix(hor, key, 0.4), 0.13);
        ctx.fillRect(0, h * (0.55 + i * 0.13), w, h * 0.06);
      }
      ctx.strokeStyle = rgba(mix(top, key, 0.5), 0.6);
      ctx.lineWidth = 0.9;
      [[0.24, 0.3], [0.31, 0.24], [0.36, 0.33]].forEach(function (b) {
        ctx.beginPath();
        ctx.moveTo(w * b[0] - 3, h * b[1] - 1.5); ctx.lineTo(w * b[0], h * b[1]); ctx.lineTo(w * b[0] + 3, h * b[1] - 1.5);
        ctx.stroke();
      });
      break;
    case "tide":                           /* caustics, and one ring of light */
      ctx.lineWidth = 1;
      for (i = 0; i < 4; i++) {
        ctx.strokeStyle = rgba(rim, 0.16 + i * 0.05);
        ctx.beginPath();
        for (x = 0; x <= w; x += 4) {
          y = h * (0.45 + i * 0.14) + Math.sin(x * 0.09 + i * 1.7) * 2.2;
          if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(key, 0.35);
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.62, w * 0.22, h * 0.08, 0, 0, Math.PI * 2);
      ctx.stroke();
      dots(6, pc, 0.8, 1.3, h * 0.1, h * 0.9);
      break;
    case "rain":                           /* soft rain, leaf shapes in the corners */
      ctx.lineWidth = 0.8;
      for (k = 0; k < 22; k++) {
        x = rnd() * w * 1.1; y = rnd() * h;
        ctx.strokeStyle = rgba(key, 0.12 + rnd() * 0.12);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2.5, y + 8); ctx.stroke();
      }
      ctx.fillStyle = rgba(mix(top, BLACK, 0.4), 0.9);
      [[0.02, 0.85, 0.5], [0.95, 0.15, 2.4], [0.9, 0.95, -0.4]].forEach(function (l) {
        ctx.beginPath();
        ctx.ellipse(w * l[0], h * l[1], h * 0.34, h * 0.13, l[2], 0, Math.PI * 2);
        ctx.fill();
      });
      dots(5, pc, 0.7, 1.1, h * 0.2, h * 0.8);
      break;
    case "bamboo":                         /* stalks, a shaft of light */
      ctx.fillStyle = rgba(key, 0.06);
      ctx.beginPath();
      ctx.moveTo(w * 0.42, 0); ctx.lineTo(w * 0.58, 0); ctx.lineTo(w * 0.75, h); ctx.lineTo(w * 0.5, h);
      ctx.fill();
      for (i = 0; i < 6; i++) {
        x = w * (0.08 + i * 0.17 + (rnd() - 0.5) * 0.05);
        ctx.strokeStyle = rgba(mix(hor, BLACK, 0.45), 0.95);
        ctx.lineWidth = 2.2 + rnd() * 1.4;
        ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + (rnd() - 0.5) * 3, 0); ctx.stroke();
        ctx.strokeStyle = rgba(rim, 0.25);
        ctx.lineWidth = 0.8;
        for (y = h * (0.2 + rnd() * 0.15); y < h; y += h * 0.3) {
          ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 2, y); ctx.stroke();
        }
      }
      dots(5, pc, 0.8, 1.2, h * 0.1, h * 0.9);
      break;
    case "aurora":                         /* stars, and a ribbon unfurling */
      dots(14, WHITE, 0.55, 0.6, 0, h * 0.7);
      for (i = 0; i < 3; i++) {
        var ag = ctx.createLinearGradient(0, 0, w, 0);
        ag.addColorStop(0, rgba(rim, 0));
        ag.addColorStop(0.35, rgba(rim, 0.3 - i * 0.07));
        ag.addColorStop(0.75, rgba([196, 168, 255], 0.22 - i * 0.05));
        ag.addColorStop(1, rgba([196, 168, 255], 0));
        ctx.strokeStyle = ag;
        ctx.lineWidth = 5 - i * 1.2;
        ctx.beginPath();
        ctx.moveTo(-4, h * (0.5 + i * 0.07));
        ctx.bezierCurveTo(w * 0.3, h * (0.05 + i * 0.08), w * 0.6, h * (0.75 + i * 0.05), w + 4, h * (0.22 + i * 0.07));
        ctx.stroke();
      }
      break;
    case "moonpool":                       /* moonlight down through water, a reflection below */
      for (i = 0; i < 3; i++) {
        ctx.fillStyle = rgba(key, 0.05);
        ctx.beginPath();
        x = w * (0.3 + i * 0.18);
        ctx.moveTo(x, 0); ctx.lineTo(x + w * 0.05, 0); ctx.lineTo(x + w * 0.16, h); ctx.lineTo(x + w * 0.06, h);
        ctx.fill();
      }
      glow(w * 0.55, h * 0.9, h * 0.35, key, 0.3);
      ctx.fillStyle = rgba(key, 0.5);
      ctx.beginPath(); ctx.ellipse(w * 0.55, h * 0.9, w * 0.08, h * 0.03, 0, 0, Math.PI * 2); ctx.fill();
      dots(10, pc, 0.75, 0.9, h * 0.05, h * 0.8);
      break;
    case "lanterns":                       /* paper lanterns far away, rising: warm bokeh */
      glow(w * 0.5, h * 1.1, h * 0.9, key, 0.18);
      for (k = 0; k < 9; k++) {
        x = w * (0.08 + rnd() * 0.84); y = h * (0.12 + rnd() * 0.72); r = 1.6 + rnd() * 2.6;
        glow(x, y, r * 2.6, key, 0.22);
        ctx.fillStyle = rgba(mix(key, [255, 176, 138], rnd() * 0.6), 0.55 + rnd() * 0.3);
        ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case "snowfall":                       /* snow in three depths */
      dots(10, WHITE, 0.35, 0.6, 0, h);
      dots(8, pc, 0.6, 1.1, 0, h);
      dots(4, pc, 0.85, 1.8, 0, h);
      glow(w * 0.5, h * 1.05, h * 0.7, rim, 0.14);
      break;
    case "bells":                          /* a ridge in the mist, a ring moving through it */
      ctx.strokeStyle = rgba(rim, 0.3);
      ctx.lineWidth = 0.9;
      for (i = 1; i <= 3; i++) {
        ctx.beginPath(); ctx.ellipse(w * 0.36, h * 0.5, w * 0.1 * i, h * 0.09 * i, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = rgba(mix(top, BLACK, 0.3), 0.95);
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.72); ctx.lineTo(w * 0.22, h * 0.55); ctx.lineTo(w * 0.38, h * 0.68);
      ctx.lineTo(w * 0.6, h * 0.46); ctx.lineTo(w * 0.82, h * 0.66); ctx.lineTo(w, h * 0.58); ctx.lineTo(w, h);
      ctx.fill();
      ctx.fillStyle = rgba(mix(hor, key, 0.3), 0.14);
      ctx.fillRect(0, h * 0.72, w, h * 0.1);
      dots(4, pc, 0.8, 1.2, h * 0.1, h * 0.5);
      break;
    case "starfield":                      /* the still water at the bottom, reflecting the sky */
      glow(w * 0.7, h * 0.3, h * 0.6, [154, 168, 255], 0.12);
      var stars = [];
      for (k = 0; k < 16; k++) stars.push([rnd() * w, rnd() * h * 0.58, 0.4 + rnd() * 0.9, 0.4 + rnd() * 0.5]);
      for (k = 0; k < stars.length; k++) {
        ctx.fillStyle = rgba(k % 4 ? WHITE : pc, stars[k][3]);
        ctx.beginPath(); ctx.arc(stars[k][0], stars[k][1], stars[k][2], 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgba(WHITE, stars[k][3] * 0.25);
        ctx.beginPath(); ctx.arc(stars[k][0], h * 1.28 - stars[k][1] * 0.5, stars[k][2] * 0.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = rgba(rim, 0.25);
      ctx.fillRect(0, h * 0.64, w, 1);
      break;
    default:
      dots(8, pc, 0.8, 1.1, 0, h);
  }
  /* the horizon's rim light, and a soft vignette so every card sits alike */
  ctx.fillStyle = rgba(rim, 0.55);
  ctx.fillRect(0, h - 1.5, w, 1.5);
  var v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,.35)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
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
function keySpeak(code) {
  if (KEYSPEAK[code]) return KEYSPEAK[code];
  if (code === "Space") return "Space bar";
  return keyLabel(code);
}
function learnKey(e) {
  if (!e || !e.code || typeof e.key !== "string") return;
  if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (names[e.code] === e.key) return;
    var was = keyLabel(e.code);
    names[e.code] = e.key;
    if (keyUI && !cap && was !== keyLabel(e.code) && isOpen("handling")) renderKeys();
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
   Look
   ====================================================================== */
function buildLook(body) {
  var S = root.Skins, Wd = root.Worlds;

  var h = section(body, "Pieces",
    "Six materials, every one open from the start. A piece keeps its colours in every world.", true);
  var grid = put(body, el("div", "opts wskins"));
  grid.setAttribute("data-k", "skin");
  var items = [];
  ((S && S.list) || []).forEach(function (sk) {
    var b = put(grid, el("button", "opt"));
    var cv = put(b, el("canvas"));
    cv.setAttribute("aria-hidden", "true");
    put(b, el("b", null, sk.name));
    if (sk.line) put(b, el("small", null, sk.line));
    items.push({ v: sk.id, node: b });
    paints.push({ canvas: cv, id: sk.id, draw: function (ctx, w, hh, t) { paintSwatch(ctx, w, hh, sk, t); } });
  });
  radios(grid, items, function () { return P.get("skin"); }, function (v) {
    var was = P.get("skin");
    choose("skin", v);
    if (v !== was) sheen(v);
  }, h);
  var ink = note(body, "Ink was chosen for you because your device asks for more contrast. Choose any skin to change it.");
  showIf(ink, function () { return sys().moreContrast && typeof P.has === "function" && !P.has("skin"); });

  section(body, "Colour help",
    "Shape alone tells every piece apart. These help when colour can't.");
  choice(body, "palette", "Palette", null, [
    { v: "skin", name: "Skin colours", line: "Each skin's own seven colours." },
    { v: "safe", name: "Colour-safe", line: "Seven colours chosen to stay distinct for every kind of colour vision, in your skin's material." }
  ], "");
  choice(body, "glyphs", "Glyphs", null, [
    { v: "off", name: "Off", line: "No marks: colour and shape only." },
    { v: "subtle", name: "Subtle", line: "A faint mark inside every block: lines, dot, triangle, slashes and brackets name the seven pieces." },
    { v: "strong", name: "Strong", line: "The same marks, clear enough to play by without colour at all." }
  ], "");
  var pv = put(body, el("canvas", "wpv"));
  pv.setAttribute("role", "img");
  paints.push({ canvas: pv, id: "@preview", draw: function (ctx, w, hh) { paintPreview(ctx, w, hh); } });
  live(function () {
    var sk = skinById(P.get("skin"));
    pv.setAttribute("aria-label", "The seven pieces in " + (sk ? sk.name : "this skin") +
      (P.get("palette") === "safe" ? ", colour-safe palette" : "") +
      ", glyphs " + (sk ? glyphsFor(sk) : P.get("glyphs")) + ".");
  });
  var forced = note(body, "");
  live(function () {
    var sk = skinById(P.get("skin"));
    var f = sk && sk.glyphs && (RANK[sk.glyphs] || 0) > (RANK[P.get("glyphs")] || 0);
    forced.classList.toggle("hide", !f);
    if (f) {
      forced.textContent = sk.mono && P.get("palette") !== "safe"
        ? sk.name + " always shows strong glyphs: its pieces share one colour, so the marks tell them apart."
        : sk.name + " always shows strong glyphs, for the clearest reading.";
    }
  });

  var wh = section(body, "World for Drift",
    "Drift stays in one world as long as you like; you can change it from the pause sheet too. Descent travels through all ten.");
  var wg = put(body, el("div", "wworlds"));
  wg.setAttribute("data-k", "driftWorld");
  var witems = [];
  ((Wd && Wd.list) || []).forEach(function (w) {
    var b = put(wg, el("button", "opt"));
    var cv = put(b, el("canvas"));
    cv.setAttribute("aria-hidden", "true");
    paints.push({ canvas: cv, id: "@w-" + w.id, draw: function (ctx, cw, ch) { paintWorld(ctx, cw, ch, w); } });
    put(b, el("b", null, w.name));
    witems.push({ v: w.id, node: b });
  });
  radios(wg, witems, function () { return P.get("driftWorld"); }, function (v) { choose("driftWorld", v); }, wh);
  var wl = note(body, "");
  live(function () {
    var w = Wd && typeof Wd.get === "function" ? Wd.get(P.get("driftWorld")) : null;
    wl.textContent = w ? w.name + ": " + (w.line || "") : "";
  });

  var dh = section(body, "Drawing", "Gameplay timing is identical on every setting; only the pictures change.");
  cards(body, "graphics", [
    { v: "auto", name: "Auto", line: "Starts with the best your device can hold, and steps down quietly if frames run late." },
    { v: "full", name: "Full", line: "The lit 3D well: glass, bloom and every particle." },
    { v: "balanced", name: "Balanced", line: "3D with lighter bloom and fewer particles." },
    { v: "simple", name: "Simple", line: "3D and plain: a still sky and few particles." },
    { v: "2d", name: "2D", line: "Simple graphics: flat and light, for older devices and a longer battery." }
  ], dh, "wtwo wgfx");
  choice(body, "grid", "Grid", null, [
    { v: "off", name: "Off", line: "No lines in the well; the pieces' own edges are enough." },
    { v: "faint", name: "Faint", line: "Barely-there column lines, enough to count by." },
    { v: "full", name: "Full", line: "Clear lines between every column and row." }
  ], "");
  toggle(body, "landing", "Landing light",
    "Light pools on the cells where the piece will land, with two thin rails down to them. Off is Mind's eye: you picture the landing yourself.");
  toggle(body, "lockLight", "Lock light",
    "A thin light under a resting piece drains as it settles, so you can see how long you have before it locks.");
}

/* ======================================================================
   Handling
   ====================================================================== */
var DAS_PRESETS = [
  { v: 267, name: "Gentle" }, { v: 183, name: "Calm" }, { v: 167, name: "Standard" },
  { v: 133, name: "Quick" }, { v: 100, name: "Sharp" }
];

function buildHandling(body) {
  var touchFirst = coarse();
  var parts = {
    sliding: function (first) {
      section(body, "Sliding",
        "For keys, gamepads and held buttons. With gestures, your finger is the slide.", first);
      /* the delay, with its five named presets */
      var g = put(body, el("div", "fld"));
      var lab = put(g, el("label"));
      var id = uid("rg");
      lab.setAttribute("for", id);
      put(lab, el("b", null, "Delay before sliding"));
      put(lab, el("i", null, "DAS"));
      var val = put(lab, el("span", "val"));
      val.setAttribute("aria-hidden", "true");
      var pre = put(g, el("div", "wseg wgrid"));
      pre.style.margin = "4px 0 2px";
      var items = [];
      DAS_PRESETS.forEach(function (p) {
        var b = put(pre, el("button", "btn wstack"));
        put(b, el("span", null, p.name));
        put(b, el("small", null, String(p.v)));
        b.setAttribute("aria-label", p.name + ", " + p.v + " milliseconds");
        items.push({ v: p.v, node: b });
      });
      var preLabel = uid("pl");
      var hiddenLabel = put(g, el("span", "hide", "Delay presets"));
      hiddenLabel.id = preLabel;
      radios(pre, items, function () { return P.get("das"); }, function (v) { choose("das", v); }, preLabel);
      var r = put(g, el("input"));
      r.type = "range"; r.id = id; r.min = "17"; r.max = "333"; r.step = "1";
      r.setAttribute("data-k", "das");
      var ends = put(g, el("div", "wends"));
      ends.setAttribute("aria-hidden", "true");
      put(ends, el("span", null, "17 ms"));
      put(ends, el("span", null, "333 ms"));
      var ln = note(g, "How long a held direction waits before the piece starts to slide on its own. The classic rules ask for about 300 ms; most modern games use 167.");
      r.setAttribute("aria-describedby", ln.id);
      r.addEventListener("input", function () { choose("das", +r.value); });
      live(function () {
        var v = P.get("das"), nm = "your own";
        for (var i = 0; i < DAS_PRESETS.length; i++) if (DAS_PRESETS[i].v === v) nm = DAS_PRESETS[i].name;
        if (+r.value !== v) r.value = String(v);
        val.textContent = v + " ms · " + nm;
        r.setAttribute("aria-valuetext", v + " milliseconds, " + nm);
      });

      slider(body, "arr", "Slide speed", "The gap between steps once it slides. At 0 it goes straight to the wall.", {
        min: 0, max: 83, step: 1, to: function (p) { return p; }, from: function (v) { return v; },
        fmt: function (v) { return v === 0 ? "0 · to the wall" : ms(v); },
        speak: function (v) { return v === 0 ? "0, straight to the wall" : v + " milliseconds"; },
        ends: ["0", "83 ms"] }, "ARR");
      slider(body, "dcd", "Pause after a turn", "After a turn or a Keep, sliding waits this much longer, so a held key doesn't carry the new position past where you meant.", {
        min: 0, max: 83, step: 1, to: function (p) { return p; }, from: function (v) { return v; },
        fmt: function (v) { return v === 0 ? "Off" : ms(v); },
        speak: function (v) { return v === 0 ? "off" : v + " milliseconds"; },
        ends: ["Off", "83 ms"] }, "DCD");
      note(body, "With both directions down, the newest one wins, and waits the full delay. Release it and the one still down takes over, after the delay again.");
    },
    dropping: function (first) {
      section(body, "Dropping", null, first);
      slider(body, "sdf", "Soft drop speed", "How many times faster than gravity a soft drop falls, and at least that many rows a second even when gravity is still. ∞ slides straight to the floor without locking.", {
        min: 5, max: 41, step: 1,
        to: function (p) { return p > 40 ? Infinity : p; },
        from: function (v) { return v === Infinity ? 41 : v; },
        fmt: function (v) { return v === Infinity ? "∞ · straight down" : v + "×"; },
        speak: function (v) { return v === Infinity ? "infinite, straight to the floor" : v + " times"; },
        ends: ["5×", "∞"] }, "SDF");
      slider(body, "hdTouch", "Drop guard for touch", "For this long after a piece appears, a flick down is ignored, so a flick meant for the last piece can't drop the next.", {
        min: 0, max: 333, step: 1, to: function (p) { return p; }, from: function (v) { return v; },
        fmt: function (v) { return v === 0 ? "Off" : ms(v); },
        speak: function (v) { return v === 0 ? "off" : v + " milliseconds"; },
        ends: ["Off", "333 ms"] });
      slider(body, "hdKeys", "Drop guard for keys and gamepads", "The same guard for the hard-drop key and button. Off unless double drops keep catching you out.", {
        min: 0, max: 333, step: 1, to: function (p) { return p; }, from: function (v) { return v; },
        fmt: function (v) { return v === 0 ? "Off" : ms(v); },
        speak: function (v) { return v === 0 ? "off" : v + " milliseconds"; },
        ends: ["Off", "333 ms"] });
    },
    turning: function (first) {
      section(body, "Turning and Keep", null, first);
      toggle(body, "modern", "Modern turning",
        "Adds a half-turn (A, the gamepad's top button, or a two-finger tap) and mirrored kicks for the long piece. Not part of the classic rules.");
      toggle(body, "irs", "Turn as it appears",
        "If a turn key is down when a piece appears, it arrives already turned.", "IRS");
      toggle(body, "ihs", "Keep as it appears",
        "If Keep is down when a piece appears, it goes straight into the niche.", "IHS");
      toggle(body, "keep", "Keep",
        "Set one piece aside in the niche by the mouth of the well, and swap it back later. Once per piece.");
      slider(body, "previews", "Pieces to come", "How many of the coming pieces drift above the well. A narrow phone may show three.", {
        min: 0, max: 6, step: 1, to: function (p) { return p; }, from: function (v) { return v; },
        fmt: function (v) { return v === 0 ? "None" : String(v); },
        speak: function (v) { return v === 0 ? "none" : v + " pieces"; },
        ends: ["None", "6"] });
    },
    touch: function (first) {
      var th = section(body, "Touch", null, first);
      cards(body, "scheme", [
        { v: "gestures", name: "Gestures", line: "Drag to move, tap to turn, flick down to drop, flick up to keep." },
        { v: "buttons", name: "Buttons", line: "A tray of big buttons under the well. Held buttons slide like keys." }
      ], th, "wtwo");
      var ges = put(body, el("div"));
      choice(ges, "tap", "Tap to turn", null, [
        { v: "sides", name: "Sides", line: "Tap the right half to turn clockwise, the left half counter-clockwise." },
        { v: "anywhere", name: "Anywhere", line: "A tap anywhere turns clockwise." }
      ], "");
      slider(ges, "sensitivity", "Drag sensitivity", "How far a drag carries the piece. Higher moves further for the same swipe.", extend(plain(0.6, 1.6, 0.1), {
        fmt: function (v) { return v.toFixed(1) + "×"; },
        speak: function (v) { return v.toFixed(1) + " times"; },
        ends: ["0.6×", "1.6×"] }));
      showIf(ges, function () { return P.get("scheme") === "gestures"; });
      var btn = put(body, el("div"));
      toggle(btn, "lefty", "Left-handed", "Mirrors the button tray, so the turns sit under your left thumb.");
      slider(btn, "btnSize", "Button size", "How big the tray's buttons are.", {
        min: 44, max: 96, step: 2, to: function (p) { return p; }, from: function (v) { return v; },
        fmt: function (v) { return v + " px"; }, ends: ["44", "96 px"] });
      slider(btn, "btnOpacity", "Button opacity", "How solid they look. Lower lets the well show through.", extend(plain(0.2, 1, 0.05), {
        fmt: pct, ends: ["20%", "100%"] }));
      showIf(btn, function () { return P.get("scheme") === "buttons"; });
    },
    keys: function (first) {
      /* On a touch screen the key map is two screens of something most
         people there will never need, so it waits folded under its
         heading; with a mouse or trackpad it starts open. */
      var fold = put(body, el("details", "wfold" + (first ? " wfirst" : "")));
      fold.open = !touchFirst;
      put(fold, el("summary", null, "Keyboard"));
      put(fold, el("p", "note", "Choose a key, then press the one you want. Esc cancels, Delete clears, and a key already in use swaps places."));
      buildKeys(fold);
    }
  };
  var order = touchFirst
    ? ["touch", "turning", "dropping", "sliding", "keys"]
    : ["sliding", "dropping", "turning", "keys", "touch"];
  for (var i = 0; i < order.length; i++) parts[order[i]](i === 0);
  section(body, "Feel");
  toggle(body, "haptics", "Haptics",
    "A light tap you can feel when you turn a piece, and on big clears where your device allows it.");
}

/* ---------- the key map ---------- */
var ACTIONS = [
  { a: "left", name: "Move left" }, { a: "right", name: "Move right" },
  { a: "soft", name: "Soft drop" }, { a: "hard", name: "Hard drop" },
  { a: "cw", name: "Turn clockwise" }, { a: "ccw", name: "Turn counter-clockwise" },
  { a: "flip", name: "Half-turn", note: "with Modern turning" },
  { a: "hold", name: "Keep" },
  { a: "breath", name: "Breath", note: "Descent and Drift" },
  { a: "glass", name: "Glass Well", note: "the rules, live, beside the well" },
  { a: "pause", name: "Pause" }
];
var SLOTS = 3;
function actionName(a) {
  for (var i = 0; i < ACTIONS.length; i++) if (ACTIONS[i].a === a) return ACTIONS[i].name;
  return a;
}

function buildKeys(body) {
  var list = put(body, el("div", "wkeys"));
  var status = put(body, el("p", "note", ""));
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  var row = put(body, el("div", "row"));
  var reset = put(row, el("button", "btn", "Default keys"));
  reset.type = "button";
  var undo = put(row, el("button", "btn hide", "Undo"));
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
    reset.focus();
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
    var r = put(list, el("div", "wkr" + (A.a === "flip" && !modern ? " woff" : "")));
    r.setAttribute("data-a", A.a);
    var an = put(r, el("div", "wan"));
    var nm = put(an, el("span", null, A.name));
    nm.id = uid("ka");
    if (A.note) put(an, el("small", null, A.note));
    var kk = put(r, el("div", "wkk"));
    kk.setAttribute("role", "group");
    kk.setAttribute("aria-labelledby", nm.id);
    if (!codes.length) put(kk, el("span", "wnokey", "no key"));
    codes.forEach(function (code, i) {
      var b = put(kk, el("button", "wkc", keyLabel(code)));
      b.type = "button";
      b.setAttribute("data-a", A.a);
      b.setAttribute("data-s", String(i));
      b.setAttribute("aria-label", A.name + ": " + keySpeak(code) + ". Choose to change.");
      b.addEventListener("click", function () { startCapture(A.a, i, b); });
    });
    if (codes.length < SLOTS) {
      var add = put(kk, el("button", "wkc wadd", "+"));
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
  chip.classList.add("wcap");
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

/* ======================================================================
   Sound
   ====================================================================== */
function buildSound(body) {
  section(body, "Levels", null, true);
  toggle(body, "quiet", "Quiet",
    "Silence everything at once. The sliders keep their places for when you come back.");
  var lv = put(body, el("div"));
  var lev = function (k, name, text) {
    slider(lv, k, name, text, extend(plain(0, 1, 0.05), { fmt: db, speak: dbSpeak, ends: ["Off", "0 dB"] }));
  };
  lev("master", "Everything", "One slider for all of it.");
  lev("music", "Music", "The bed: pads, the slow melodies, and the world's own tune that your clears reveal.");
  lev("sfx", "Effects", "The notes your moves play, and the bells on every clear.");
  lev("ambience", "Ambience", "Wind, rain and water: the world around the well.");
  live(function () { lv.classList.toggle("wdim", !!P.get("quiet")); });

  section(body, "Character");
  toggle(body, "soften", "Soften",
    "Rounds off the start of every sound and takes a little brightness off the top. Steady always softens.");
  var qh = uid("gl");
  var ql = put(body, el("div", "wlbl"));
  ql.id = qh;
  put(ql, el("b", null, "Sound quality"));
  cards(body, "audioQuality", [
    { v: "auto", name: "Auto", line: "Measured on your device the first time sound starts." },
    { v: "full", name: "Full", line: "Real room reverb and every voice." },
    { v: "lite", name: "Lite", line: "A lighter reverb and fewer voices, for older phones." },
    { v: "minimal", name: "Minimal", line: "Just the notes. The lightest on the battery." }
  ], qh, "wtwo");

  section(body, "This device");
  if (iosLike() && "audioSession" in nav()) {
    var dev = /iPad/.test(nav().userAgent || "") || nav().platform === "MacIntel" ? "iPad" : "iPhone";
    toggle(body, "playOnSilent", "Play sound when " + dev + " is on silent",
      "Normally the silent setting quiets the well, and your own music keeps playing. This plays through it, and pauses other audio.");
  }
  toggle(body, "muteOnBlur", "Mute when you look away",
    "Sound fades when you switch to another app or window, and comes back with you.");
  note(body, "Sound never carries anything you need: everything it tells you is also shown.");
}

/* ======================================================================
   Comfort
   ====================================================================== */
function buildComfort(body) {
  var mh = section(body, "Motion", null, true);
  var mc = cards(body, "motion", [
    { v: "system", name: "System", line: "" },
    { v: "full", name: "Full", line: "Every glide, spring and drift of light." },
    { v: "gentle", name: "Gentle", line: "Pieces snap instead of gliding, the camera holds still, and particles fade where they are. The well on the title screen holds still." },
    { v: "still", name: "Still", line: "No camera motion, no nudge, no particles. Changes cross-fade. The well on the title screen holds still." }
  ], mh, "wtwo");
  live(function () {
    var r = sys().reducedMotion;
    mc[0].small.textContent = "Follows your device's Reduce Motion setting. Right now: " +
      (r ? "Gentle." : "Full.");
    mc[1].small.textContent = P.get("motion") === "full" && r
      ? "Every glide, spring and drift of light, even though your device asks for less."
      : "Every glide, spring and drift of light.";
  });

  choice(body, "juice", "Celebration", null, [
    { v: "calm", name: "Calm", line: "Half the particles and half the nudge: clears glow and settle quietly." },
    { v: "medium", name: "Medium", line: "As tuned: enough light and sparkle to feel every clear, never more." },
    { v: "vivid", name: "Vivid", line: "Half as many particles again, as far as your device can draw them." }
  ], "");
  note(body, "Whatever you choose, the flash guard stays on: no strobes, no full-screen flashes, no bright red. Steady is always Calm.");
  slider(body, "nudge", "Well nudge", "How far the well dips when a piece lands hard or a big clear rings out. There is never any random shaking, and reduced motion keeps it still.", extend(plain(0, 1, 0.25), {
    fmt: function (v) { return v === 0 ? "Off" : pct(v); },
    speak: function (v) { return v === 0 ? "off" : pct(v); },
    ends: ["Off", "100%"] }));
  toggle(body, "labels", "Labels",
    "Short words like Double, Twist or Ripple 2 appear beside the well for a moment, and are read politely to screen readers.");

  section(body, "Size");
  slider(body, "boardSize", "Board size", "Make the well bigger or smaller than the screen would choose.", extend(plain(0.9, 1.3, 0.05), {
    fmt: pct, ends: ["90%", "130%"] }));
  slider(body, "textSize", "Text size", "Menus, sheets and the explainer. This text grows as you slide.", extend(plain(1, 1.5, 0.05), {
    fmt: pct, ends: ["100%", "150%"] }));

  section(body, "Pace");
  choice(body, "learner", "Learner speed", null, [
    { v: 0.5, name: "0.5×", speak: "half speed", line: "Half speed. Runs below full speed are marked learner speed, and aren't kept as personal bests." },
    { v: 0.75, name: "0.75×", speak: "three-quarter speed", line: "Three-quarter speed. Runs below full speed are marked learner speed, and aren't kept as personal bests." },
    { v: 1, name: "1×", speak: "full speed", line: "Full speed. Slow the whole game down while you learn; runs below 1× aren't kept as personal bests." }
  ], "");
  var rem = function (m) {
    return "After " + m + " minutes at the well without a five-minute break, a quiet note suggests resting your eyes, at the next natural pause. Steady keeps its own timer.";
  };
  choice(body, "reminder", "Gentle reminder", null, [
    { v: 15, name: "15", val: "15 min", speak: "15 minutes", line: rem(15) },
    { v: 30, name: "30", val: "30 min", speak: "30 minutes", line: rem(30) },
    { v: 45, name: "45", val: "45 min", speak: "45 minutes", line: rem(45) },
    { v: 60, name: "60", val: "60 min", speak: "60 minutes", line: rem(60) },
    { v: 0, name: "Off", line: "No reminders. Stopping is always one tap away, and costs nothing." }
  ], "");

  section(body, "Numbers");
  toggle(body, "pbPace", "Personal-best pace",
    "In Forty, the well's rim warms very slightly while you are ahead of your best time.");
  toggle(body, "scoreHidden", "Hide the score in Drift",
    "Drift without numbers. Your lines still count; the score just stays out of sight.");

  /* the one, gentle mention of the Home Screen, on iPhone in Safari */
  if (iPhone() && !standalone()) {
    var tip = put(body, el("div", "wtip"));
    put(tip, el("b", null, "Best from the Home Screen"));
    put(tip, el("span", null, "On iPhone, tap Share, then Add to Home Screen. The game opens full screen, without Safari's bars, and works offline."));
    var tr = put(tip, el("div", "row"));
    var ok = put(tr, el("button", "btn", "Got it"));
    ok.type = "button";
    ok.addEventListener("click", function () {
      var seen = P.get("seen") || {};
      seen.homeScreen = true;
      choose("seen", seen);
    });
    showIf(tip, function () { var s = P.get("seen"); return !(s && s.homeScreen); });
  }

  /* and the honest word when nothing can be kept */
  if (P.store && typeof P.store.status === "function") {
    var st = note(body, "");
    live(function () {
      var s = P.store.status();
      st.classList.toggle("hide", s === "ok");
      st.textContent = s === "full"
        ? "This browser's storage for the site is full, so changes here last until you close the page."
        : "This window isn't keeping anything (private browsing, or storage turned off), so changes here last until you close it.";
    });
  }
}

/* ======================================================================
   shells, opening, closing, focus
   ====================================================================== */
function isOpen(id) {
  var ov = doc && $(OV[id]);
  return !!ov && !ov.classList.contains("hide");
}

/* find the app's shell, or make one if it is missing, and dress it */
function shell(id) {
  var ov = $(OV[id]), body = $(BODY[id]), made = false;
  if (!ov) {
    ov = el("div", "ov hide");
    ov.id = OV[id];
    put(ov, el("div", "sheet"));
    doc.body.appendChild(ov);
    made = true;
  }
  var sheet = ov.querySelector(".sheet") || put(ov, el("div", "sheet"));
  if (!body) {
    body = el("div");
    body.id = BODY[id];
    sheet.appendChild(body);
  }
  var close = sheet.querySelector("[data-close]");
  if (!close) {
    close = el("button", "close", "✕");
    close.type = "button";
    close.setAttribute("data-close", OV[id]);
    sheet.insertBefore(close, sheet.firstChild);
    made = true;
  }
  if (made) close.addEventListener("click", function () { ov.classList.add("hide"); });
  if (!close.getAttribute("aria-label")) close.setAttribute("aria-label", "Close " + TITLE[id]);
  var h2 = sheet.querySelector("h2");
  if (!h2) {
    h2 = el("h2", null, TITLE[id]);
    sheet.insertBefore(h2, body);
  }
  if (!h2.id) h2.id = uid("t");
  sheet.classList.add("wsheet");
  /* one dialog role, wherever the shell put it (the overlay or the sheet) */
  var dlg = ov.getAttribute("role") === "dialog" ? ov : sheet;
  dlg.setAttribute("role", "dialog");
  dlg.setAttribute("aria-modal", "true");
  if (!dlg.getAttribute("aria-labelledby") || !$(dlg.getAttribute("aria-labelledby"))) {
    dlg.setAttribute("aria-labelledby", h2.id);
  }
  if (!sheet.hasAttribute("tabindex")) sheet.tabIndex = -1;
  body.classList.add("wsx");

  ov.addEventListener("keydown", function (e) {
    if (cap) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      var x = sheet.querySelector("[data-close]");
      if (x) x.click(); else ov.classList.add("hide");
      return;
    }
    if (e.key === "Tab") trap(e, sheet);
  });
  /* the app opens and closes sheets by toggling .hide; listen for the
     close so a half-finished key capture never outlives its sheet, and so
     focus goes back where it came from */
  if (root.MutationObserver) {
    var was = !ov.classList.contains("hide");
    new root.MutationObserver(function () {
      var open = !ov.classList.contains("hide");
      if (was && !open) closed(id, sheet);
      if (!was && open) opened(id);
      was = open;
    }).observe(ov, { attributes: true, attributeFilter: ["class"] });
  }
  return body;
}

function focusables(sheet) {
  var all = sheet.querySelectorAll("button, [href], input, select, textarea, [tabindex]");
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var n = all[i];
    if (n.tabIndex < 0 || n.disabled) continue;
    if (!n.offsetWidth && !n.offsetHeight && !n.getClientRects().length) continue;
    out.push(n);
  }
  return out;
}
function trap(e, sheet) {
  var f = focusables(sheet);
  if (!f.length) return;
  var first = f[0], last = f[f.length - 1], at = doc.activeElement;
  if (e.shiftKey && (at === first || at === sheet)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
}

function opened(id) {
  if (!opener[id]) opener[id] = doc.activeElement;
  Sheets.refresh();
  if (id === "look") paintSoon();
  /* opened by the app directly rather than through Sheets.open: still
     take focus into the sheet, so a keyboard starts where the eyes do */
  var ov = $(OV[id]), sheet = ov && ov.querySelector(".sheet");
  if (sheet && !sheet.contains(doc.activeElement)) {
    try { sheet.focus({ preventScroll: true }); } catch (e) { sheet.focus(); }
  }
}
function closed(id, sheet) {
  stopCapture(false);
  if (id === "look") sheenAnim = null;
  if (id === "handling" && keyUI) { keyUI.before = null; keyUI.undo.classList.add("hide"); say(""); }
  var back = opener[id];
  opener[id] = null;
  var at = doc.activeElement;
  if (back && back.focus && doc.contains(back) && (!at || at === doc.body || sheet.contains(at))) {
    if (back.offsetWidth || back.offsetHeight || back.getClientRects().length) {
      try { back.focus({ preventScroll: true }); } catch (e) { back.focus(); }
    }
  }
}

/* Text size scales the root font, so everything sized in rem — look.css's
   sheets and buttons, the HUD, and all of these — grows together. The
   room's stylesheet does the scaling from --ts (html{font-size:calc(16px *
   var(--ts))}); --text-scale is the same number under a plainer name. If a
   page has no such rule, the root font is set directly instead, so the
   setting works either way. */
function applyText() {
  var s = P.get("textSize") || 1, de = doc.documentElement;
  de.style.setProperty("--ts", String(s));
  de.style.setProperty("--text-scale", String(s));
  de.style.fontSize = "";
  var cs = root.getComputedStyle ? root.getComputedStyle(de) : null;
  var px = cs ? parseFloat(cs.fontSize) : 0;
  if (s !== 1 && px && Math.abs(px - 16 * s) > 0.5) de.style.fontSize = (Math.round(s * 1000) / 10) + "%";
}

/* Every change from anywhere arrives here. With no sheet open there is
   nothing to redraw, so the work waits until one opens — a setting
   changed mid-run never costs the frame it happens in. */
function onPref(k) {
  if (k === "textSize") applyText();
  var open = false;
  for (var i = 0; i < IDS.length; i++) if (isOpen(IDS[i])) open = true;
  if (!open) return;                       /* Sheets.open refreshes everything */
  Sheets.refresh();
}

/* ======================================================================
   the public face
   ====================================================================== */

/* o = {prefs, onChange(key, value)}. Builds all four sheets into their
   shells; safe to call twice (the second call only refreshes). */
Sheets.init = function (o) {
  o = o || {};
  if (ready) {
    if (typeof o.onChange === "function") hook = o.onChange;
    Sheets.refresh();
    return true;
  }
  P = o.prefs || root.Prefs;
  doc = root.document;
  if (!P || !doc || !doc.body) return false;
  hook = typeof o.onChange === "function" ? o.onChange : null;
  ready = true;
  addStyle();
  layoutNames();
  root.addEventListener("keydown", learnKey, true);
  var build = { look: buildLook, handling: buildHandling, sound: buildSound, comfort: buildComfort };
  for (var i = 0; i < IDS.length; i++) {
    var id = IDS[i], body = shell(id);
    while (body.firstChild) body.removeChild(body.firstChild);
    var sheet = body.parentNode;
    if (sheet && !sheet.querySelector(".lead")) put(body, el("p", "lead", LEAD[id]));
    build[id](body);
  }
  if (typeof P.on === "function") P.on(onPref);
  root.addEventListener("resize", function () { if (isOpen("look")) paintSoon(); });
  applyText();
  Sheets.refresh();
  return true;
};

var LEAD = {
  look: "How the well looks, never how it plays. Every change shows at once.",
  handling: "How the pieces answer your hands. Timings are in milliseconds, so they feel the same on every screen.",
  sound: "Every move plays a note in the key of the world you're in. Turn any of it down, or all of it off.",
  comfort: "Motion, size, pace and the gentle reminder: make the well as easy on you as you like."
};

/* show a sheet: "look" | "handling" | "sound" | "comfort" */
Sheets.open = function (id) {
  if (!ready && !Sheets.init({})) return false;
  var ov = $(OV[id]);
  if (!ov) return false;
  stopCapture(false);
  if (ov.classList.contains("hide")) opener[id] = doc.activeElement;
  Sheets.refresh();
  ov.classList.remove("hide");
  var sheet = ov.querySelector(".sheet");
  if (sheet) {
    sheet.scrollTop = 0;
    try { sheet.focus({ preventScroll: true }); } catch (e) { sheet.focus(); }
  }
  if (id === "look") paintSoon();
  return true;
};

/* hide a sheet directly (the [data-close] button is the usual way) */
Sheets.close = function (id) {
  var ov = doc && $(OV[id]);
  if (!ov) return false;
  stopCapture(false);
  ov.classList.add("hide");
  return true;
};

/* re-read every value from Prefs and redraw */
Sheets.refresh = function () {
  if (!ready) return;
  var still = motion() !== "full";
  for (var j = 0; j < IDS.length; j++) {
    var b = $(BODY[IDS[j]]);
    if (b) b.classList.toggle("wstill", still);
  }
  for (var i = 0; i < controls.length; i++) {
    try { controls[i].update(); } catch (e) { later(e); }
  }
  if (isOpen("look")) paintSoon();
};

if (typeof module !== "undefined" && module.exports) module.exports = Sheets;
else root.Sheets = Sheets;
})(typeof self !== "undefined" ? self : this);
