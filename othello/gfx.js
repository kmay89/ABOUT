/* gfx.js — the board, painted.

   Canvas 2D, no libraries, no images.

   The whole personality of this room is in one effect: **the turn**. A disc
   that changes hands is not repainted, it is rotated — squashed to nothing
   about its own vertical axis, swapped at the moment it is edge-on, and
   opened out again in the other colour. That is what a real disc does, it
   costs one cosine, and without it Othello is a grid of dots that
   inexplicably change colour.

   Two details make it read properly:

   **The ripple.** The discs do not all turn at once. Each one is delayed by
   its distance from the square that was just played, so the flip travels
   outward along the rays that caused it. A six-disc flip then *shows you why
   it happened* — you watch the line run — instead of presenting the result
   and leaving you to work backwards.

   **The edge.** At the halfway point the disc is a line, and a line one pixel
   wide vanishes. So the squash bottoms out at a thin sliver rather than zero
   and the sliver is drawn in the rim colour, which is what you actually see
   when a real counter is edge-on to you.                                  */
(function (root) {
"use strict";

var Gfx = {};
var L = { x: 0, y: 0, cell: 0, size: 0, flip: false };
var back = null, backKey = "";

Gfx.SKINS = {
  felt:   { board: "#186347", board2: "#14563d", line: "rgba(0,0,0,.45)", frame: "#2a1d12",
            dark: "#191919", darkRim: "#000000", light: "#f2f0e8", lightRim: "#b9b5a6" },
  night:  { board: "#20304a", board2: "#1a2740", line: "rgba(0,0,0,.5)",  frame: "#131b28",
            dark: "#12161f", darkRim: "#000000", light: "#e8ecf5", lightRim: "#a7aebd" },
  clay:   { board: "#7a4a34", board2: "#6b3f2c", line: "rgba(0,0,0,.42)", frame: "#3a2015",
            dark: "#241a12", darkRim: "#0d0906", light: "#f4e6cf", lightRim: "#bda98c" }
};
Gfx.skin = Gfx.SKINS.felt;
Gfx.use = function (n) { Gfx.skin = Gfx.SKINS[n] || Gfx.SKINS.felt; back = null; };

Gfx.layout = function (cv, flipped) {
  var w = cv.clientWidth, h = cv.clientHeight;
  var pad = Math.min(w, h) * 0.045 + 6;
  var size = Math.max(80, Math.min(w, h) - pad * 2);
  L.cell = Math.floor(size / 8);
  L.size = L.cell * 8;
  L.x = Math.round((w - L.size) / 2);
  L.y = Math.round((h - L.size) / 2);
  L.flip = !!flipped;
  return L;
};
Gfx.box = function () { return L; };

function rc(sq) {
  var r = sq >> 3, c = sq & 7;
  return L.flip ? { r: 7 - r, c: 7 - c } : { r: r, c: c };
}
Gfx.centre = function (sq) {
  var p = rc(sq);
  return { x: L.x + p.c * L.cell + L.cell / 2, y: L.y + p.r * L.cell + L.cell / 2 };
};
Gfx.hit = function (px, py) {
  var c = Math.floor((px - L.x) / L.cell), r = Math.floor((py - L.y) / L.cell);
  if (r < 0 || r > 7 || c < 0 || c > 7) return -1;
  if (L.flip) { r = 7 - r; c = 7 - c; }
  return r * 8 + c;
};

/* ---------- the board, cached ---------- */
function paintBoard(dpr) {
  var s = Gfx.skin;
  var key = L.size + ":" + s.board + ":" + dpr;
  if (back && backKey === key) return back;
  var m = Math.round(L.cell * 0.24);
  var cv = document.createElement("canvas");
  cv.width = (L.size + m * 2) * dpr; cv.height = (L.size + m * 2) * dpr;
  var g = cv.getContext("2d");
  g.scale(dpr, dpr);

  g.fillStyle = s.frame;
  round(g, 0, 0, L.size + m * 2, L.size + m * 2, m * 0.7);
  g.fill();

  /* the cloth: a broad diagonal wash so the surface has a direction to it,
     rather than being one flat green rectangle */
  var lg = g.createLinearGradient(m, m, m + L.size, m + L.size);
  lg.addColorStop(0, s.board);
  lg.addColorStop(0.5, s.board2);
  lg.addColorStop(1, s.board);
  g.fillStyle = lg;
  g.fillRect(m, m, L.size, L.size);

  /* the weave, faint and regular */
  g.save();
  g.globalAlpha = 0.05;
  g.strokeStyle = "#000";
  g.lineWidth = 1;
  for (var i = 0; i < L.size; i += 3) {
    g.beginPath(); g.moveTo(m + i, m); g.lineTo(m + i, m + L.size); g.stroke();
  }
  g.restore();

  g.strokeStyle = s.line;
  g.lineWidth = Math.max(1, L.cell * 0.026);
  for (var k = 0; k <= 8; k++) {
    g.beginPath();
    g.moveTo(m + k * L.cell, m); g.lineTo(m + k * L.cell, m + L.size); g.stroke();
    g.beginPath();
    g.moveTo(m, m + k * L.cell); g.lineTo(m + L.size, m + k * L.cell); g.stroke();
  }
  /* the four guide dots at the 2-2 intersections, as on every real board */
  g.fillStyle = s.line;
  [[2, 2], [2, 6], [6, 2], [6, 6]].forEach(function (p) {
    g.beginPath();
    g.arc(m + p[1] * L.cell, m + p[0] * L.cell, Math.max(1.5, L.cell * 0.055), 0, 6.284);
    g.fill();
  });

  back = cv; backKey = key; back._m = m;
  return back;
}

/* ---------- one disc ----------
   `turn` runs 0 → 1 across a flip; at 0.5 the disc is edge-on. */
function disc(g, x, y, rad, side, turn) {
  var s = Gfx.skin;
  var t = turn === undefined ? 0 : turn;
  /* which face is showing: the far half of the turn is the new colour */
  var showing = t < 0.5 ? side : 1 - side;
  var squash = Math.abs(Math.cos(t * Math.PI));
  var w = Math.max(rad * 0.06, rad * squash);

  var top = showing === 0 ? s.dark : s.light;
  var rim = showing === 0 ? s.darkRim : s.lightRim;

  g.save();
  g.globalAlpha = 0.35 * (0.4 + squash * 0.6);
  g.fillStyle = "#000";
  g.beginPath();
  g.ellipse(x + rad * 0.09, y + rad * 0.16, w * 0.98, rad * 0.9, 0, 0, 6.284);
  g.fill();
  g.restore();

  /* the rim first, then the face inset — the same stack as a real counter,
     and the reason an edge-on disc still looks like an object */
  g.fillStyle = rim;
  g.beginPath(); g.ellipse(x, y, w, rad, 0, 0, 6.284); g.fill();

  var fr = rad * 0.88, fw = Math.max(rad * 0.03, w * 0.88);
  var rg = g.createRadialGradient(x - fw * 0.35, y - fr * 0.4, fr * 0.08, x, y, fr);
  rg.addColorStop(0, shade(top, 0.3));
  rg.addColorStop(0.6, top);
  rg.addColorStop(1, shade(top, -0.3));
  g.fillStyle = rg;
  g.beginPath(); g.ellipse(x, y, fw, fr, 0, 0, 6.284); g.fill();
}

/* ---------- the frame ---------- */
Gfx.draw = function (cv, view, ui) {
  var dpr = Math.min(3, root.devicePixelRatio || 1);
  var w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    back = null;
  }
  var g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  var bd = paintBoard(dpr), m = bd._m;
  g.drawImage(bd, L.x - m, L.y - m, L.size + m * 2, L.size + m * 2);

  ui = ui || {};
  var rad = L.cell * 0.4, i;

  /* where you may play, and — the thing that teaches the game — how much
     each one would turn over. Shown as a hollow ring rather than a disc, so
     the board never looks like it already has a piece there. */
  if (ui.marks) for (i = 0; i < ui.marks.length; i++) {
    var mk = ui.marks[i], c = Gfx.centre(mk.sq);
    g.save();
    g.strokeStyle = mk.warn ? "rgba(224,106,82,.85)" : "rgba(255,255,255,.5)";
    g.lineWidth = Math.max(1.5, L.cell * 0.045);
    g.setLineDash([L.cell * 0.14, L.cell * 0.1]);
    g.beginPath(); g.arc(c.x, c.y, rad * 0.82, 0, 6.284); g.stroke();
    g.setLineDash([]);
    if (ui.counts && mk.n) {
      g.fillStyle = "rgba(255,255,255,.75)";
      g.font = "700 " + Math.round(L.cell * 0.3) + "px system-ui,sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(mk.n), c.x, c.y);
    }
    g.restore();
  }

  var b = view.b;
  var flips = ui.flips || null;
  for (i = 0; i < 64; i++) {
    if (!b[i]) continue;
    var p = Gfx.centre(i);
    var t = 0, side = b[i] > 0 ? 0 : 1;
    if (flips && flips.at[i] !== undefined) {
      t = flips.at[i];
      /* mid-flip the square still belongs to whoever it belonged to before */
      side = 1 - side;
    }
    /* the disc just played drops in rather than turning */
    if (ui.dropAt !== undefined && ui.drop === i) {
      var k = ui.dropAt;
      g.save();
      g.globalAlpha = Math.min(1, k * 2);
      disc(g, p.x, p.y - (1 - k) * L.cell * 0.7, rad * (0.7 + 0.3 * k), side, 0);
      g.restore();
      continue;
    }
    disc(g, p.x, p.y, rad, side, t);
  }

  /* the last move, ringed — so a move made on somebody else's phone can be
     found without hunting */
  if (ui.last !== null && ui.last !== undefined && ui.last >= 0 && !flips) {
    var lc = Gfx.centre(ui.last);
    g.save();
    g.strokeStyle = "rgba(255,215,122,.9)";
    g.lineWidth = Math.max(2, L.cell * 0.055);
    g.beginPath(); g.arc(lc.x, lc.y, rad * 1.06, 0, 6.284); g.stroke();
    g.restore();
  }

  if (ui.coords) {
    g.save();
    g.fillStyle = "rgba(255,255,255,.34)";
    g.font = "600 " + Math.round(L.cell * 0.22) + "px ui-monospace,Menlo,monospace";
    g.textAlign = "center"; g.textBaseline = "middle";
    for (i = 0; i < 8; i++) {
      var cx = L.flip ? 7 - i : i, ry = L.flip ? 7 - i : i;
      g.fillText("abcdefgh".charAt(i), L.x + cx * L.cell + L.cell / 2, L.y - m * 0.5);
      g.fillText(String(8 - i), L.x - m * 0.5, L.y + ry * L.cell + L.cell / 2);
    }
    g.restore();
  }
};

/* ---------- helpers ---------- */
function round(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function shade(hex, f) {
  var n = parseInt(hex.slice(1), 16);
  var r = (n >> 16) & 255, g2 = (n >> 8) & 255, b = n & 255;
  function ch(c) { return Math.round(Math.max(0, Math.min(255, f > 0 ? c + (255 - c) * f : c * (1 + f)))); }
  return "rgb(" + ch(r) + "," + ch(g2) + "," + ch(b) + ")";
}
Gfx.shade = shade;

/* the ripple: each flipping disc's own progress, delayed by how far it is
   from the square that caused it */
Gfx.ripple = function (from, list, k) {
  var at = {}, i;
  var fr = from >> 3, fc = from & 7;
  var span = 0;
  for (i = 0; i < list.length; i++) {
    var d = Math.max(Math.abs((list[i] >> 3) - fr), Math.abs((list[i] & 7) - fc));
    if (d > span) span = d;
  }
  var lead = span ? 0.45 / span : 0;
  for (i = 0; i < list.length; i++) {
    var dd = Math.max(Math.abs((list[i] >> 3) - fr), Math.abs((list[i] & 7) - fc));
    var t = (k - dd * lead) / Math.max(0.2, 1 - span * lead);
    at[list[i]] = Math.max(0, Math.min(1, t));
  }
  return { at: at };
};

if (typeof module !== "undefined" && module.exports) module.exports = Gfx;
else root.Gfx = Gfx;
})(typeof self !== "undefined" ? self : this);
