/* gfx.js — the star, painted.

   Canvas 2D. The geometry comes straight from rules.js — every hole already
   knows its row and its half-column, so drawing is one multiply per hole and
   the picture cannot disagree with the rules about where anything is. A
   board drawn from its own coordinate table is a board with two sources of
   truth, and they diverge the first time somebody edits one.

   Two things worth naming.

   **The destination is tinted.** Six colours on a board with six identical
   points is not enough information: you have to be told which point is
   *yours to reach*, every frame, without reading anything. So each player's
   target triangle is washed in that player's colour at low opacity, and the
   holes themselves are ringed in it. It turns "which way am I going" from a
   thing you remember into a thing you see.

   **A jump chain is drawn as a chain.** The path is a line through every
   landing, with a dot at each hop, because the interesting move in this game
   is six hops long and reading it as "the piece went from here to there" is
   losing the whole point. The animation walks it hop by hop for the same
   reason.                                                                  */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var Gfx = {};

/* the six seats' colours, in the order of the star's points */
Gfx.COLOURS = [
  { hi: "#ffd77a", lo: "#c9932c", name: "amber" },
  { hi: "#7ad4a0", lo: "#2f8f5c", name: "green" },
  { hi: "#8fb0ff", lo: "#39549e", name: "blue" },
  { hi: "#f2a0a0", lo: "#a63b3b", name: "red" },
  { hi: "#d8a0f2", lo: "#7d3ba6", name: "violet" },
  { hi: "#f2d6a0", lo: "#a67f3b", name: "sand" }
];

Gfx.SKINS = {
  wood:  { felt: "#2a1c12", felt2: "#1b120b", hole: "#150e08", ring: "rgba(255,255,255,.12)", edge: "#4a3527" },
  slate: { felt: "#232a30", felt2: "#171c21", hole: "#0e1215", ring: "rgba(255,255,255,.11)", edge: "#3b464f" },
  cream: { felt: "#e6dbc6", felt2: "#cfc2a8", hole: "#b7a888", ring: "rgba(0,0,0,.14)", edge: "#9a8a6a" }
};
Gfx.skin = Gfx.SKINS.wood;
Gfx.use = function (n) { Gfx.skin = Gfx.SKINS[n] || Gfx.SKINS.wood; back = null; };

var L = { x: 0, y: 0, step: 10, rad: 6, flip: 0 };
var back = null, backKey = "";
Gfx.L = L;

/* `spin` turns the whole board so your own point is at the bottom — the
   same idea as the card table's "you are always at the bottom", and the same
   rule: one function converts, and nothing else is allowed to know. */
/* The lattice is equilateral, so the rows are `√3/2` apart rather than a
   whole step — the same ratio that makes a hex grid a hex grid. Getting that
   wrong does not break anything and does not throw: it simply draws a star
   stretched fifteen percent vertically, which reads as "not quite right"
   without ever telling you why.

   The board is 24 half-columns wide and 16 row-gaps tall, so a portrait phone
   is always width-limited and the step comes from the width. */
var ROW = 0.8660254;                 /* √3/2 */
Gfx.layout = function (cv, spin) {
  var w = cv.clientWidth, h = cv.clientHeight;
  var pad = 14;
  var stepX = (w - pad * 2) / 12;                 /* 24 half-columns          */
  var stepY = (h - pad * 2) / (16 * ROW);         /* 16 row-gaps, each √3/2   */
  L.step = Math.max(6, Math.min(stepX, stepY));
  L.rad = L.step * 0.4;
  L.x = w / 2;
  L.y = (h - L.step * 16 * ROW) / 2;
  L.spin = spin || 0;
  return L;
};

/* the star has six-fold symmetry, so turning it is a rotation about the
   middle by a multiple of sixty degrees */
function spinPoint(px, py, turns) {
  if (!turns) return { x: px, y: py };
  var a = turns * Math.PI / 3;
  var c = Math.cos(a), s = Math.sin(a);
  return { x: px * c - py * s, y: px * s + py * c };
}

Gfx.at = function (hole) {
  var H = Rules.holes()[hole];
  var px = H.hx * L.step * 0.5;
  var py = (H.r - 8) * L.step * ROW;
  var p = spinPoint(px, py, L.spin);
  return { x: L.x + p.x, y: L.y + L.step * 8 * ROW + p.y };
};

Gfx.hit = function (px, py) {
  var best = -1, bd = L.rad * 1.35;
  var holes = Rules.holes();
  for (var i = 0; i < holes.length; i++) {
    var p = Gfx.at(i);
    var d = Math.hypot(p.x - px, p.y - py);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
};

/* ---------- the board, cached ---------- */
function paintBoard(cv, dpr, view) {
  var s = Gfx.skin;
  var key = L.step.toFixed(2) + ":" + L.spin + ":" + s.felt + ":" + dpr + ":" + (view.seats || []).join(",");
  if (back && backKey === key) return back;
  var w = cv.clientWidth, h = cv.clientHeight;
  var c = document.createElement("canvas");
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  var g = c.getContext("2d");
  g.scale(dpr, dpr);

  var bg = g.createRadialGradient(L.x, L.y + L.step * 8, L.step, L.x, L.y + L.step * 8, L.step * 10);
  bg.addColorStop(0, s.felt);
  bg.addColorStop(1, s.felt2);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  /* the outline of the star, so the board has an edge rather than being a
     scatter of holes on a rectangle */
  var holes = Rules.holes(), i;
  g.strokeStyle = s.edge;
  g.lineWidth = Math.max(1, L.step * 0.09);
  g.lineJoin = "round";
  g.beginPath();
  hull(g);
  g.stroke();

  /* the six destinations, washed in their owner's colour */
  if (view.seats) {
    for (var q = 0; q < view.seats.length; q++) {
      var target = Rules.OPPOSITE[view.seats[q]];
      var col = Gfx.COLOURS[view.seats[q]];
      var cells = Rules.HOMES[target];
      g.save();
      g.globalAlpha = 0.14;
      g.fillStyle = col.hi;
      for (i = 0; i < cells.length; i++) {
        var p = Gfx.at(cells[i]);
        g.beginPath(); g.arc(p.x, p.y, L.rad * 1.5, 0, 6.284); g.fill();
      }
      g.restore();
      g.strokeStyle = col.lo;
      g.lineWidth = Math.max(1, L.step * 0.05);
      for (i = 0; i < cells.length; i++) {
        var p2 = Gfx.at(cells[i]);
        g.beginPath(); g.arc(p2.x, p2.y, L.rad * 0.98, 0, 6.284); g.stroke();
      }
    }
  }

  /* the holes: a dark disc with a lit lower rim, so they read as drilled */
  for (i = 0; i < holes.length; i++) {
    var pt = Gfx.at(i);
    g.fillStyle = s.hole;
    g.beginPath(); g.arc(pt.x, pt.y, L.rad * 0.72, 0, 6.284); g.fill();
    g.strokeStyle = s.ring;
    g.lineWidth = Math.max(0.8, L.step * 0.035);
    g.beginPath(); g.arc(pt.x, pt.y, L.rad * 0.72, 0.6, 2.6); g.stroke();
  }

  back = c; backKey = key;
  return back;
}
/* the outline: the outermost hole of each row, both sides, walked round */
function hull(g) {
  var holes = Rules.holes(), rows = Rules.WIDTH.length;
  var left = [], right = [], r, i;
  for (r = 0; r < rows; r++) { left.push(-1); right.push(-1); }
  for (i = 0; i < holes.length; i++) {
    var H = holes[i];
    if (left[H.r] < 0 || holes[left[H.r]].hx > H.hx) left[H.r] = i;
    if (right[H.r] < 0 || holes[right[H.r]].hx < H.hx) right[H.r] = i;
  }
  var pts = [];
  for (r = 0; r < rows; r++) pts.push(Gfx.at(right[r]));
  for (r = rows - 1; r >= 0; r--) pts.push(Gfx.at(left[r]));
  g.moveTo(pts[0].x, pts[0].y);
  for (i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
}

/* ---------- one marble ---------- */
function marble(g, x, y, rad, col, lift) {
  lift = lift || 0;
  g.save();
  g.globalAlpha = 0.4;
  g.fillStyle = "#000";
  g.beginPath();
  g.ellipse(x + rad * 0.12 + lift * 2, y + rad * 0.26 + lift * 3, rad * 0.96, rad * 0.7, 0, 0, 6.284);
  g.fill();
  g.restore();
  y -= lift * 2.4;

  var rg = g.createRadialGradient(x - rad * 0.36, y - rad * 0.42, rad * 0.08, x, y, rad);
  rg.addColorStop(0, "#ffffff");
  rg.addColorStop(0.22, col.hi);
  rg.addColorStop(0.8, col.lo);
  rg.addColorStop(1, "rgba(0,0,0,.7)");
  g.fillStyle = rg;
  g.beginPath(); g.arc(x, y, rad, 0, 6.284); g.fill();
  /* the glint: a glass marble is defined by exactly one of these */
  g.fillStyle = "rgba(255,255,255,.75)";
  g.beginPath();
  g.ellipse(x - rad * 0.34, y - rad * 0.4, rad * 0.2, rad * 0.14, -0.6, 0, 6.284);
  g.fill();
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
  if (!view) return;
  ui = ui || {};
  var i;

  g.drawImage(paintBoard(cv, dpr, view), 0, 0, w, h);

  /* the last move, as a chain */
  if (ui.last && ui.last.path && ui.last.path.length) {
    g.save();
    g.globalAlpha = 0.55;
    g.strokeStyle = Gfx.COLOURS[view.seats[ui.last.by]].hi;
    g.lineWidth = Math.max(1.5, L.step * 0.1);
    g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath();
    var a = Gfx.at(ui.last.f);
    g.moveTo(a.x, a.y);
    for (i = 0; i < ui.last.path.length; i++) {
      var p = Gfx.at(ui.last.path[i]);
      g.lineTo(p.x, p.y);
    }
    g.stroke();
    for (i = 0; i < ui.last.path.length; i++) {
      var q = Gfx.at(ui.last.path[i]);
      g.fillStyle = Gfx.COLOURS[view.seats[ui.last.by]].hi;
      g.beginPath(); g.arc(q.x, q.y, L.rad * 0.22, 0, 6.284); g.fill();
    }
    g.restore();
  }

  /* the piece you have picked up, and where it may go */
  if (ui.from >= 0) {
    var f = Gfx.at(ui.from);
    g.strokeStyle = "rgba(255,255,255,.9)";
    g.lineWidth = Math.max(2, L.step * 0.08);
    g.beginPath(); g.arc(f.x, f.y, L.rad * 1.28, 0, 6.284); g.stroke();
  }
  if (ui.marks) for (i = 0; i < ui.marks.length; i++) {
    var mk = ui.marks[i], c = Gfx.at(mk.sq);
    g.save();
    if (mk.hops > 1) {
      g.strokeStyle = "rgba(255,215,122,.95)";
      g.lineWidth = Math.max(1.6, L.step * 0.07);
      g.beginPath(); g.arc(c.x, c.y, L.rad * 0.9, 0, 6.284); g.stroke();
      g.fillStyle = "rgba(255,215,122,.95)";
      g.font = "700 " + Math.round(L.step * 0.38) + "px system-ui,sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(mk.hops), c.x, c.y);
    } else {
      g.fillStyle = "rgba(62,207,142,.85)";
      g.beginPath(); g.arc(c.x, c.y, L.rad * 0.34, 0, 6.284); g.fill();
    }
    g.restore();
  }
  /* the chain the highlighted destination would take */
  if (ui.preview && ui.preview.length && ui.from >= 0) {
    g.save();
    g.setLineDash([L.step * 0.2, L.step * 0.16]);
    g.strokeStyle = "rgba(255,215,122,.8)";
    g.lineWidth = Math.max(1.4, L.step * 0.06);
    g.beginPath();
    var s0 = Gfx.at(ui.from);
    g.moveTo(s0.x, s0.y);
    for (i = 0; i < ui.preview.length; i++) {
      var pv = Gfx.at(ui.preview[i]);
      g.lineTo(pv.x, pv.y);
    }
    g.stroke();
    g.restore();
  }

  /* the marbles */
  for (i = 0; i < view.b.length; i++) {
    if (view.b[i] < 0) continue;
    if (ui.fly && ui.fly.hole === i) continue;
    var pos = Gfx.at(i);
    marble(g, pos.x, pos.y, L.rad, Gfx.COLOURS[view.seats[view.b[i]]], 0);
  }
  if (ui.fly) marble(g, ui.fly.x, ui.fly.y, L.rad, Gfx.COLOURS[view.seats[ui.fly.seat]], ui.fly.lift || 1);
};

if (typeof module !== "undefined" && module.exports) module.exports = Gfx;
else root.Gfx = Gfx;
})(typeof self !== "undefined" ? self : this);
