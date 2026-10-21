/* cantina.js — what hangs over the table.

   The table is drawn by the renderers; the *room* is drawn here, in
   screen space, over the top of whichever renderer is on: a string of
   festoon bulbs along the top of the stage, and under it a line of
   papel picado — the cut tissue-paper banners strung across every
   cantina, courtyard and street party in the country.

   Screen space rather than the 3D world, on purpose. The camera frames
   the line of play and pulls in close on a short line, so anything
   placed on the far side of the table is off-screen for most of a hand;
   a banner hung over the near edge of the picture is there every
   moment, in both renderers, on every phone, at any pixel ratio, and it
   costs nothing per frame — it is a handful of SVG elements with two CSS
   animations on them. It never catches a tap (pointer-events: none),
   it never covers a plate or a bone (it lives in a strip the layout
   gives it, see --fiestaH in index.html), and it stops moving for
   anyone who has asked their phone for less motion.

   Everything here is built from arithmetic: the cable is a catenary, the
   flags are cut with SVG masks from three patterns, the colours are the
   seven that papel picado is actually sold in. No images.           */
(function (root) {
"use strict";

var NS = "http://www.w3.org/2000/svg";
var PAPER = ["#ff2e88", "#ff8c1a", "#ffd23f", "#2dd4c4", "#8be04a", "#a86cf5", "#ff5a3c"];

function el(tag, attrs, parent) {
  var e = document.createElementNS(NS, tag);
  for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
/* a small deterministic noise so the same screen hangs the same banner */
function nrand(i) { var x = Math.sin(i * 91.7 + 3.1) * 43758.5453; return x - Math.floor(x); }

/* a cable slung between two points, sagging by `sag` in the middle —
   near enough a catenary for a banner */
function cable(x0, x1, y, sag) {
  return {
    at: function (x) {
      var t = (x - x0) / (x1 - x0), s = 4 * t * (1 - t);
      return { x: x, y: y + sag * s, a: Math.atan2(sag * (4 - 8 * t) / (x1 - x0), 1) };
    },
    path: "M" + x0 + " " + y + " Q" + ((x0 + x1) / 2) + " " + (y + sag * 2) + " " + x1 + " " + y
  };
}

/* ---------- the three cuts ----------
   A mask is white where the paper stays and black where it was cut.
   Each flag is `w` wide and `h` tall, hung from its top edge, with a
   scalloped or pointed bottom. */
function cutMask(svg, id, kind, w, h) {
  var defs = svg.querySelector("defs") || el("defs", {}, svg);
  var m = el("mask", { id: id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: w, height: h }, defs);
  /* the sheet, with its bottom edge */
  var bottom;
  if (kind === 0) {
    /* scallops */
    var n = 4, r = w / (n * 2), d = "M0 0 H" + w + " V" + (h - r);
    for (var i = n; i > 0; i--) d += " A" + r + " " + r + " 0 0 1 " + ((i - 1) * 2 * r) + " " + (h - r);
    bottom = d + " Z";
  } else if (kind === 1) {
    /* points */
    bottom = "M0 0 H" + w + " V" + (h - 8) + " L" + (w * 0.75) + " " + h + " L" + (w * 0.5) + " " + (h - 8) +
      " L" + (w * 0.25) + " " + h + " L0 " + (h - 8) + " Z";
  } else {
    /* a shallow V */
    bottom = "M0 0 H" + w + " V" + (h - 9) + " L" + (w / 2) + " " + h + " L0 " + (h - 9) + " Z";
  }
  el("path", { d: bottom, fill: "#fff" }, m);
  var cx = w / 2, cy = h * 0.46;
  if (kind === 0) {
    /* a ring of dots round a diamond, and a lattice along the top */
    el("path", { d: "M" + cx + " " + (cy - h * 0.14) + " l" + (w * 0.13) + " " + (h * 0.14) + " l-" + (w * 0.13) + " " + (h * 0.14) + " l-" + (w * 0.13) + " -" + (h * 0.14) + " Z", fill: "#000" }, m);
    for (var a = 0; a < 8; a++) {
      var an = a * Math.PI / 4;
      el("circle", { cx: cx + Math.cos(an) * w * 0.3, cy: cy + Math.sin(an) * h * 0.26, r: w * 0.045, fill: "#000" }, m);
    }
    for (var x = w * 0.12; x < w; x += w * 0.19) el("rect", { x: x - 2, y: h * 0.07, width: 4, height: 4, transform: "rotate(45 " + x + " " + (h * 0.07 + 2) + ")", fill: "#000" }, m);
  } else if (kind === 1) {
    /* a lattice of small diamonds, the commonest cut there is */
    for (var r2 = 0; r2 < 4; r2++) for (var c2 = 0; c2 < 4; c2++) {
      var px = w * (0.14 + c2 * 0.24), py = h * (0.14 + r2 * 0.19), s = w * 0.055;
      if ((r2 + c2) % 2) continue;
      el("path", { d: "M" + px + " " + (py - s) + " L" + (px + s) + " " + py + " L" + px + " " + (py + s) + " L" + (px - s) + " " + py + " Z", fill: "#000" }, m);
    }
    el("circle", { cx: cx, cy: h * 0.5, r: w * 0.09, fill: "#000" }, m);
  } else {
    /* a flower: a ring of petals round a heart, corner cuts */
    for (var p = 0; p < 6; p++) {
      var pa = p * Math.PI / 3;
      el("ellipse", { cx: cx + Math.cos(pa) * w * 0.17, cy: cy + Math.sin(pa) * w * 0.17, rx: w * 0.085, ry: w * 0.05,
                      transform: "rotate(" + (pa * 180 / Math.PI) + " " + (cx + Math.cos(pa) * w * 0.17) + " " + (cy + Math.sin(pa) * w * 0.17) + ")", fill: "#000" }, m);
    }
    el("circle", { cx: cx, cy: cy, r: w * 0.06, fill: "#000" }, m);
    [[w * 0.1, h * 0.1], [w * 0.9, h * 0.1], [w * 0.1, h * 0.78], [w * 0.9, h * 0.78]].forEach(function (q) {
      el("circle", { cx: q[0], cy: q[1], r: w * 0.04, fill: "#000" }, m);
    });
  }
  return "url(#" + id + ")";
}

/* ---------- hanging it ---------- */
var hung = [];
var uid = 0;

/* `box` is the element to hang the room from — the stage, or the
   splash. The layer is sized to its width and `opts.scale` tall. */
function hang(box, opts) {
  opts = opts || {};
  var old = box.querySelector(":scope > svg.fiesta");
  if (old) old.parentNode.removeChild(old);
  var w = box.clientWidth || 390;
  if (!w) return null;
  var sc = opts.scale || 1, H = Math.round(96 * sc);
  var svg = el("svg", { "class": "fiesta", width: w, height: H, viewBox: "0 0 " + w + " " + H, "aria-hidden": "true" });
  svg.style.cssText = "position:absolute;left:0;top:0;width:" + w + "px;height:" + H + "px;pointer-events:none;overflow:visible;z-index:" + (opts.z || 1);
  var defs = el("defs", {}, svg);
  var id = "fx" + (uid++);
  var glow = el("radialGradient", { id: id + "g" }, defs);
  el("stop", { offset: "0", "stop-color": "#ffd98a", "stop-opacity": "0.85" }, glow);
  el("stop", { offset: "0.45", "stop-color": "#ffb347", "stop-opacity": "0.30" }, glow);
  el("stop", { offset: "1", "stop-color": "#ff9a2e", "stop-opacity": "0" }, glow);
  var masks = [];
  var fw = Math.round(42 * sc), fh = Math.round(46 * sc);
  for (var k = 0; k < 3; k++) masks.push(cutMask(svg, id + "m" + k, k, fw, fh));

  /* the back banner first, on wide screens, so the near one hangs in
     front of it */
  var wide = w > 640;
  var seed = Math.round(w / 37);
  if (wide) banner(svg, cable(-20, w + 20, 18 * sc, 10 * sc), fw * 0.82, fh * 0.82, masks, 0.78, seed + 3, sc);
  banner(svg, cable(-20, w + 20, 8 * sc, 16 * sc), fw, fh, masks, 1, seed, sc);

  /* the bulbs, on their own cable above everything */
  var lights = cable(-10, w + 10, 4 * sc, 9 * sc);
  el("path", { d: lights.path, fill: "none", stroke: "#1a110a", "stroke-width": 1.6 * sc, opacity: 0.9 }, svg);
  var step = Math.max(54, Math.min(84, w / 7)) * sc;
  var n = Math.floor(w / step), x0 = (w - (n - 1) * step) / 2;
  for (var b = 0; b < n; b++) {
    var p = lights.at(x0 + b * step);
    var g = el("g", { transform: "translate(" + p.x.toFixed(1) + " " + p.y.toFixed(1) + ")" }, svg);
    var gl = el("circle", { "class": "glow", cx: 0, cy: 11 * sc, r: 22 * sc, fill: "url(#" + id + "g)" }, g);
    gl.style.cssText = "animation-delay:" + (-nrand(b + seed) * 4).toFixed(2) + "s;animation-duration:" + (2.6 + nrand(b * 3 + 1) * 1.6).toFixed(2) + "s";
    el("rect", { x: -2 * sc, y: 0, width: 4 * sc, height: 5 * sc, rx: 1, fill: "#2a1a10" }, g);
    el("ellipse", { cx: 0, cy: 11 * sc, rx: 4.2 * sc, ry: 6 * sc, fill: "#ffe3a3", stroke: "#f0b45a", "stroke-width": 0.8 }, g);
    el("ellipse", { cx: -1.2 * sc, cy: 9 * sc, rx: 1.2 * sc, ry: 2 * sc, fill: "#fff8e8", opacity: 0.9 }, g);
  }
  box.appendChild(svg);
  hung.push({ box: box, opts: opts, w: w });
  return svg;
}

function banner(svg, c, fw, fh, masks, dim, seed, sc) {
  var w = +svg.getAttribute("width");
  el("path", { d: c.path, fill: "none", stroke: "#2a1a10", "stroke-width": 1.2 * sc, opacity: 0.85 * dim }, svg);
  var gap = 7 * sc, step = fw + gap;
  var n = Math.floor((w + fw) / step), x0 = (w - (n - 1) * step) / 2;
  for (var i = 0; i < n; i++) {
    var p = c.at(x0 + i * step), col = PAPER[(i + seed) % PAPER.length];
    var g = el("g", { transform: "translate(" + p.x.toFixed(1) + " " + p.y.toFixed(1) + ") rotate(" + (p.a * 180 / Math.PI).toFixed(2) + ")" }, svg);
    var f = el("g", { "class": "flag" }, g);
    f.style.cssText = "animation-delay:" + (-nrand(i * 7 + seed) * 3.4).toFixed(2) + "s;animation-duration:" + (3.0 + nrand(i + seed * 2) * 1.4).toFixed(2) + "s";
    var sheet = el("g", { mask: masks[(i + seed) % masks.length], transform: "translate(" + (-fw / 2) + " 0)" }, f);
    el("rect", { x: 0, y: 0, width: fw, height: fh, fill: col, opacity: 0.92 * dim }, sheet);
    /* tissue paper is lighter where the bulbs catch it */
    el("rect", { x: 0, y: 0, width: fw, height: fh * 0.45, fill: "#fff", opacity: 0.14 * dim }, sheet);
    /* the fold over the string */
    el("rect", { x: -fw / 2, y: -1.5 * sc, width: fw, height: 3 * sc, fill: col, opacity: 0.9 * dim }, f);
  }
}

/* on a resize the banners are strung again for the new width */
function refresh() {
  var list = hung.slice(); hung = [];
  list.forEach(function (h) {
    if (!h.box.isConnected) return;
    if (h.box.clientWidth === h.w) { hung.push(h); return; }
    hang(h.box, h.opts);
  });
}

var Cantina = { hang: hang, refresh: refresh, PAPER: PAPER, cable: cable };
if (typeof module !== "undefined" && module.exports) module.exports = Cantina;
else root.Cantina = Cantina;
})(typeof self !== "undefined" ? self : this);
