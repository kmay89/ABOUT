/* gfx.js — the board, painted.

   Canvas 2D, no libraries, no images. Everything is drawn from numbers so it
   is crisp at any pixel ratio and so a colour scheme is six values rather
   than sixteen files.

   Two things here are less obvious than they look.

   **A checker is not a circle.** Drawn as one flat disc it reads as a
   counter printed on the square rather than a thing resting on it. What
   makes it sit down is the stack: a dark ellipse offset a couple of pixels
   for the shadow, the milled rim, then the face inset from the rim with its
   own highlight up and to the left. The rim is where the light actually
   lands on a real piece, so it gets the brightest value on the board — which
   is why a king, which adds rings, still reads as the same object rather
   than as a different piece.

   **The board is drawn once and cached.** The squares, the frame and the
   grain never change, so they are painted into an offscreen canvas whenever
   the size does and blitted every frame after that. On a phone this is the
   difference between a slide animation that glides and one that stutters,
   and it costs one line of bookkeeping.                                   */
(function (root) {
"use strict";

var Gfx = {};
var L = { x: 0, y: 0, cell: 0, size: 0, flip: false };
var back = null, backKey = "";

Gfx.SKINS = {
  wood:   { light: "#d8c09a", dark: "#7a4f31", frame: "#4a2f1c", rim: "#2b1a0f",
            me: "#e8e2d6", meRim: "#b4ac9c", you: "#b8322b", youRim: "#7d1f1a", ink: "#241606" },
  slate:  { light: "#cfd6d9", dark: "#465257", frame: "#2b3438", rim: "#161c1f",
            me: "#f0efe9", meRim: "#b6b6ae", you: "#3f7fb8", youRim: "#1d5580", ink: "#131a1d" },
  cafe:   { light: "#e6d3ac", dark: "#8a5a3a", frame: "#3f2717", rim: "#241408",
            me: "#f4ead6", meRim: "#c0b49a", you: "#2f2a2a", youRim: "#100e0e", ink: "#2a1a0a" }
};

Gfx.skin = Gfx.SKINS.wood;
Gfx.use = function (name) { Gfx.skin = Gfx.SKINS[name] || Gfx.SKINS.wood; back = null; };

/* ---------- where things are ---------- */
Gfx.layout = function (cv, flip) {
  var w = cv.clientWidth, h = cv.clientHeight;
  var pad = Math.min(w, h) * 0.045 + 6;
  var size = Math.min(w, h) - pad * 2;
  size = Math.max(80, size);
  L.cell = Math.floor(size / 8);
  L.size = L.cell * 8;
  L.x = Math.round((w - L.size) / 2);
  L.y = Math.round((h - L.size) / 2);
  L.flip = !!flip;
  return L;
};
Gfx.box = function () { return L; };

/* the board is stored far-row-first; a seat sitting at the far side wants it
   the other way up, and that is the only thing `flip` means */
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

/* ---------- the board itself, cached ---------- */
function paintBoard(dpr) {
  var s = Gfx.skin;
  var key = L.size + ":" + L.flip + ":" + s.dark + ":" + dpr;
  if (back && backKey === key) return back;
  var m = Math.round(L.cell * 0.28);
  var cv = document.createElement("canvas");
  cv.width = (L.size + m * 2) * dpr; cv.height = (L.size + m * 2) * dpr;
  var g = cv.getContext("2d");
  g.scale(dpr, dpr);

  /* the frame, with a bevel that catches the same light as the pieces */
  var fr = g.createLinearGradient(0, 0, L.size, L.size);
  fr.addColorStop(0, shade(s.frame, 0.22));
  fr.addColorStop(0.55, s.frame);
  fr.addColorStop(1, shade(s.frame, -0.25));
  g.fillStyle = fr;
  round(g, 0, 0, L.size + m * 2, L.size + m * 2, m * 0.7);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 1; g.stroke();

  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    var dark = ((r + c) & 1) === 1;
    var x = m + c * L.cell, y = m + r * L.cell;
    g.fillStyle = dark ? s.dark : s.light;
    g.fillRect(x, y, L.cell, L.cell);
    /* grain: two faint strokes per square, angled with the square's parity so
       the board does not read as a single sheet of colour */
    g.save();
    g.beginPath(); g.rect(x, y, L.cell, L.cell); g.clip();
    g.globalAlpha = 0.055;
    g.strokeStyle = dark ? "#fff" : "#000";
    g.lineWidth = Math.max(1, L.cell * 0.04);
    for (var i = 0; i < 3; i++) {
      var o = (i + 0.5) * L.cell / 3;
      g.beginPath();
      g.moveTo(x - L.cell * 0.2, y + o + (dark ? 0 : L.cell * 0.1));
      g.lineTo(x + L.cell * 1.2, y + o - L.cell * 0.16);
      g.stroke();
    }
    g.restore();
  }
  /* the inner shadow line, so the squares sit inside the frame */
  g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 2;
  g.strokeRect(m - 1, m - 1, L.size + 2, L.size + 2);

  back = cv; backKey = key;
  back._m = m;
  return back;
}

/* ---------- one piece ---------- */
function piece(g, x, y, rad, side, king, lift) {
  var s = Gfx.skin;
  var top = side === 0 ? s.me : s.you;
  var rim = side === 0 ? s.meRim : s.youRim;
  lift = lift || 0;

  /* the shadow: an ellipse, squashed, offset down and right, and pushed
     further out while the piece is in the air */
  g.save();
  g.globalAlpha = 0.42 - lift * 0.08;
  g.fillStyle = "#000";
  g.beginPath();
  g.ellipse(x + rad * 0.13 + lift * 3, y + rad * 0.22 + lift * 5, rad * (0.98 + lift * 0.1), rad * (0.72 + lift * 0.08), 0, 0, 6.284);
  g.fill();
  g.restore();

  y -= lift * 3;

  /* the milled rim — the brightest thing on the board */
  var rg = g.createLinearGradient(x - rad, y - rad, x + rad, y + rad);
  rg.addColorStop(0, shade(rim, 0.5));
  rg.addColorStop(0.5, rim);
  rg.addColorStop(1, shade(rim, -0.35));
  g.fillStyle = rg;
  g.beginPath(); g.arc(x, y, rad, 0, 6.284); g.fill();

  /* the milling: little notches around the edge, which is what tells you at a
     glance that this is a stack of a plastic disc and not a painted circle */
  g.save();
  g.globalAlpha = 0.28;
  g.strokeStyle = "#000";
  g.lineWidth = Math.max(1, rad * 0.07);
  for (var i = 0; i < 18; i++) {
    var a = i / 18 * 6.284;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * rad * 0.86, y + Math.sin(a) * rad * 0.86);
    g.lineTo(x + Math.cos(a) * rad * 0.99, y + Math.sin(a) * rad * 0.99);
    g.stroke();
  }
  g.restore();

  /* the face, inset, lit from up-left */
  var fr = rad * 0.8;
  var fg = g.createRadialGradient(x - fr * 0.35, y - fr * 0.4, fr * 0.1, x, y, fr);
  fg.addColorStop(0, shade(top, 0.32));
  fg.addColorStop(0.62, top);
  fg.addColorStop(1, shade(top, -0.28));
  g.fillStyle = fg;
  g.beginPath(); g.arc(x, y, fr, 0, 6.284); g.fill();

  if (king) {
    /* a king is the same piece with a crown pressed into the face: two rings
       and five points, all drawn in the face's own shadow colour so it reads
       as stamped rather than stuck on */
    g.strokeStyle = shade(top, -0.45);
    g.lineWidth = Math.max(1.2, rad * 0.07);
    g.beginPath(); g.arc(x, y, fr * 0.72, 0, 6.284); g.stroke();
    g.fillStyle = shade(top, -0.42);
    g.beginPath();
    var R = fr * 0.5, rr = fr * 0.22;
    for (var k = 0; k < 10; k++) {
      var ang = -Math.PI / 2 + k * Math.PI / 5;
      var q = (k % 2 === 0) ? R : rr;
      var px = x + Math.cos(ang) * q, py = y + Math.sin(ang) * q;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fill();
  }
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
  var s = Gfx.skin, i;

  /* the last move, as a faint trail — where the piece came from and the
     squares it flew over, so a move made on somebody else's phone can be
     read rather than guessed at */
  if (ui.last && ui.last.path) {
    g.save();
    g.globalAlpha = 0.5;
    g.strokeStyle = "rgba(255,215,122,.85)";
    g.lineWidth = Math.max(2, L.cell * 0.07);
    g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath();
    var a = Gfx.centre(ui.last.f);
    g.moveTo(a.x, a.y);
    for (i = 0; i < ui.last.path.length; i++) {
      var p = Gfx.centre(ui.last.path[i]);
      g.lineTo(p.x, p.y);
    }
    g.stroke();
    g.restore();
  }

  /* the piece you have picked up */
  if (ui.from >= 0 && ui.from !== undefined && ui.from !== null) {
    var c0 = Gfx.centre(ui.from);
    g.save();
    g.strokeStyle = "rgba(255,215,122,.95)";
    g.lineWidth = Math.max(2, L.cell * 0.06);
    round(g, c0.x - L.cell / 2 + 2, c0.y - L.cell / 2 + 2, L.cell - 4, L.cell - 4, L.cell * 0.14);
    g.stroke();
    g.restore();
  }

  /* where it may go. A capture destination is ringed rather than dotted,
     because in a game where capture is compulsory the difference is the
     whole move. */
  if (ui.marks) for (i = 0; i < ui.marks.length; i++) {
    var mk = ui.marks[i], cc = Gfx.centre(mk.sq);
    g.save();
    if (mk.cap) {
      g.strokeStyle = "rgba(224,106,82,.95)";
      g.lineWidth = Math.max(2, L.cell * 0.075);
      g.beginPath(); g.arc(cc.x, cc.y, L.cell * 0.34, 0, 6.284); g.stroke();
    } else {
      g.fillStyle = "rgba(62,207,142,.8)";
      g.beginPath(); g.arc(cc.x, cc.y, L.cell * 0.15, 0, 6.284); g.fill();
    }
    g.restore();
  }

  /* the men. A piece being taken fades where it stands; a piece in flight is
     drawn at the animation's position rather than on its square. */
  var rad = L.cell * 0.39;
  var b = view.b;
  for (i = 0; i < 64; i++) {
    if (!b[i]) continue;
    if (ui.fly && ui.fly.sq === i) continue;
    var p = Gfx.centre(i);
    var dying = ui.dying && ui.dying.indexOf(i) >= 0;
    if (dying) { g.save(); g.globalAlpha = Math.max(0, 1 - (ui.dieAt || 0)); }
    piece(g, p.x, p.y, rad, b[i] > 0 ? 0 : 1, Math.abs(b[i]) === 2, 0);
    if (dying) {
      g.strokeStyle = "rgba(224,106,82,.9)";
      g.lineWidth = Math.max(2, rad * 0.16);
      g.beginPath();
      g.moveTo(p.x - rad * 0.5, p.y - rad * 0.5); g.lineTo(p.x + rad * 0.5, p.y + rad * 0.5);
      g.moveTo(p.x + rad * 0.5, p.y - rad * 0.5); g.lineTo(p.x - rad * 0.5, p.y + rad * 0.5);
      g.stroke();
      g.restore();
    }
  }
  if (ui.fly) piece(g, ui.fly.x, ui.fly.y, rad, ui.fly.side, ui.fly.king, ui.fly.lift || 1);

  /* the numbers, for anybody who has read a book */
  if (ui.numbers) {
    g.save();
    g.fillStyle = "rgba(0,0,0,.34)";
    g.font = "600 " + Math.round(L.cell * 0.2) + "px ui-monospace,Menlo,monospace";
    g.textAlign = "left"; g.textBaseline = "top";
    for (i = 0; i < 64; i++) {
      var n = numOf(i);
      if (!n) continue;
      var q = Gfx.centre(i);
      g.fillText(String(n), q.x - L.cell * 0.44, q.y - L.cell * 0.46);
    }
    g.restore();
  }
};
function numOf(sq) {
  var r = sq >> 3, c = sq & 7;
  if (((r + c) & 1) !== 1) return 0;
  return r * 4 + ((c - (r % 2 === 0 ? 1 : 0)) >> 1) + 1;
}

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

if (typeof module !== "undefined" && module.exports) module.exports = Gfx;
else root.Gfx = Gfx;
})(typeof self !== "undefined" ? self : this);
