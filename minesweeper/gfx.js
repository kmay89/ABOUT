/* gfx.js — the field, painted.

   Canvas 2D. The whole board is redrawn every frame rather than patched,
   because a 30×16 field is 480 rounded rectangles and that is nothing; the
   moment you start patching you own a dirty-rectangle bug forever.

   Two things worth naming.

   **The bevel is the interface.** A minesweeper tile has to say "press me"
   without a label, and the only thing that does that is the light: a lit top
   and left edge, a dark bottom and right, and a face between them. An opened
   square inverts it — sunk, flat, no highlight — so the board reads as a
   surface with holes punched in it rather than as two colours of square. Get
   the bevel wrong and no amount of colour makes the grid legible.

   **The numbers are the classic ones**, and not out of nostalgia. 1 blue,
   2 green, 3 red, 4 navy, 5 maroon… is a palette where every adjacent pair
   is separable at a glance and at small sizes, which matters enormously when
   you are scanning a dense field for a 2 next to a 1. It was a good palette
   in 1990 and nobody has beaten it since.                                  */
(function (root) {
"use strict";

var Gfx = {};

Gfx.NUM = ["", "#3f76e8", "#2f9d55", "#e0503f", "#2b3f8f", "#a03a2c",
           "#2a9d9d", "#2b2b2b", "#7a7a7a"];

Gfx.SKINS = {
  slate: { bg: "#171512", up: "#3b362f", face: "#4a443b", lip: "#615a4e", low: "#241f1a",
           open: "#1e1b17", grid: "rgba(0,0,0,.45)", flag: "#e06a52", mine: "#201c18" },
  paper: { bg: "#1a1815", up: "#cfc6b4", face: "#ded5c2", lip: "#f2ead8", low: "#8f8878",
           open: "#26221d", grid: "rgba(0,0,0,.4)", flag: "#c0392b", mine: "#1b1815" },
  moss:  { bg: "#12160f", up: "#33402c", face: "#3f4e36", lip: "#57694a", low: "#1d251a",
           open: "#181d14", grid: "rgba(0,0,0,.45)", flag: "#e8a33d", mine: "#12160f" }
};
Gfx.skin = Gfx.SKINS.slate;
Gfx.use = function (n) { Gfx.skin = Gfx.SKINS[n] || Gfx.SKINS.slate; };

/* the view: where the field sits and how big a cell is. A grim board does
   not fit a phone, so this is pannable and zoomable rather than stretched —
   a 6px cell is not a smaller board, it is an unplayable one. */
var V = { cell: 28, x: 0, y: 0, w: 0, h: 0 };
Gfx.view = V;

Gfx.fit = function (cv, g, zoom) {
  var pw = cv.clientWidth, ph = cv.clientHeight;
  var ideal = Math.min(pw / g.w, ph / g.h);
  /* never below the size a fingertip can hit, never so large it is silly */
  V.cell = Math.max(16, Math.min(56, ideal)) * (zoom || 1);
  V.w = V.cell * g.w; V.h = V.cell * g.h;
  Gfx.clamp(cv);
};
Gfx.clamp = function (cv) {
  var pw = cv.clientWidth, ph = cv.clientHeight;
  if (V.w <= pw) V.x = (pw - V.w) / 2; else V.x = Math.max(pw - V.w, Math.min(0, V.x));
  if (V.h <= ph) V.y = (ph - V.h) / 2; else V.y = Math.max(ph - V.h, Math.min(0, V.y));
};
Gfx.hit = function (g, px, py) {
  var c = Math.floor((px - V.x) / V.cell), r = Math.floor((py - V.y) / V.cell);
  if (c < 0 || c >= g.w || r < 0 || r >= g.h) return -1;
  return r * g.w + c;
};
Gfx.at = function (g, i) {
  return { x: V.x + (i % g.w) * V.cell, y: V.y + ((i / g.w) | 0) * V.cell, s: V.cell };
};

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

Gfx.draw = function (cv, g, ui) {
  var dpr = Math.min(3, root.devicePixelRatio || 1);
  var pw = cv.clientWidth, ph = cv.clientHeight;
  if (cv.width !== Math.round(pw * dpr) || cv.height !== Math.round(ph * dpr)) {
    cv.width = Math.round(pw * dpr); cv.height = Math.round(ph * dpr);
  }
  var ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  var s = Gfx.skin;
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, pw, ph);
  ui = ui || {};

  var cell = V.cell, pad = Math.max(1, cell * 0.045), rr = Math.max(1.5, cell * 0.14);
  /* only draw what is on screen — the grim board at full zoom is four times
     the viewport, and the off-screen three quarters cost nothing to skip */
  var c0 = Math.max(0, Math.floor(-V.x / cell)), c1 = Math.min(g.w - 1, Math.ceil((pw - V.x) / cell));
  var r0 = Math.max(0, Math.floor(-V.y / cell)), r1 = Math.min(g.h - 1, Math.ceil((ph - V.y) / cell));

  ctx.font = "700 " + Math.round(cell * 0.56) + "px system-ui,-apple-system,Segoe UI,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
    var i = r * g.w + c;
    var x = V.x + c * cell, y = V.y + r * cell;
    var st = g.state[i];
    var cx = x + cell / 2, cy = y + cell / 2;

    if (st === 1) {
      /* opened: sunk, flat, and gridded so a big empty region still has
         structure rather than becoming one grey lake */
      ctx.fillStyle = s.open;
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = s.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      var n = g.adj[i];
      if (n > 0 && n < 9) {
        ctx.fillStyle = Gfx.NUM[n];
        ctx.fillText(String(n), cx, cy + cell * 0.03);
      }
      if (ui.chord && ui.chord.indexOf(i) >= 0) {
        ctx.fillStyle = "rgba(255,255,255,.14)";
        ctx.fillRect(x, y, cell, cell);
      }
      continue;
    }

    /* hidden: the bevel. Lit top-left, dark bottom-right, face between. */
    var pressed = ui.down === i || (ui.chord && ui.chord.indexOf(i) >= 0);
    ctx.fillStyle = pressed ? s.up : s.low;
    round(ctx, x + pad, y + pad, cell - pad * 2, cell - pad * 2, rr);
    ctx.fill();
    if (!pressed) {
      var lg = ctx.createLinearGradient(x, y, x + cell, y + cell);
      lg.addColorStop(0, s.lip);
      lg.addColorStop(0.42, s.face);
      lg.addColorStop(1, s.up);
      ctx.fillStyle = lg;
      round(ctx, x + pad, y + pad, cell - pad * 2, cell - pad * 2.6, rr);
      ctx.fill();
    }

    if (st === 2 || st === 3) {
      var wrong = ui.reveal && st === 2 && !g.mine[i];
      flag(ctx, cx, cy, cell, st === 3 ? "?" : null, wrong ? "#8d8d8d" : s.flag);
      if (wrong) cross(ctx, cx, cy, cell);
      continue;
    }
    /* a mine, at the end, on a board that was lost */
    if (ui.reveal && g.mine[i]) mine(ctx, cx, cy, cell, i === ui.boom, s);
  }

  /* the cursor's own square, so a board being played with a keyboard or read
     out loud has somewhere to point */
  if (ui.mark !== undefined && ui.mark >= 0) {
    var p = Gfx.at(g, ui.mark);
    ctx.strokeStyle = "rgba(255,215,122,.95)";
    ctx.lineWidth = Math.max(2, cell * 0.08);
    round(ctx, p.x + pad, p.y + pad, cell - pad * 2, cell - pad * 2, rr);
    ctx.stroke();
  }
};

function flag(ctx, cx, cy, cell, glyph, colour) {
  if (glyph) {
    ctx.fillStyle = "#e8dcc4";
    ctx.font = "700 " + Math.round(cell * 0.56) + "px system-ui,sans-serif";
    ctx.fillText(glyph, cx, cy + cell * 0.03);
    return;
  }
  var s = cell * 0.3;
  ctx.strokeStyle = "#2a241c";
  ctx.lineWidth = Math.max(1.4, cell * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.28, cy - s * 1.05);
  ctx.lineTo(cx + s * 0.28, cy + s * 0.9);
  ctx.stroke();
  /* the base, so the pole stands on something */
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.62, cy + s * 0.92);
  ctx.lineTo(cx + s * 0.85, cy + s * 0.92);
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.22, cy - s * 1.05);
  ctx.lineTo(cx - s * 0.85, cy - s * 0.44);
  ctx.lineTo(cx + s * 0.22, cy + s * 0.12);
  ctx.closePath();
  ctx.fill();
}
function cross(ctx, cx, cy, cell) {
  var s = cell * 0.32;
  ctx.strokeStyle = "#e06a52";
  ctx.lineWidth = Math.max(2, cell * 0.09);
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s);
  ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s);
  ctx.stroke();
}
function mine(ctx, cx, cy, cell, boom, s) {
  var rad = cell * 0.27;
  if (boom) {
    ctx.fillStyle = "#e0503f";
    ctx.fillRect(cx - cell / 2, cy - cell / 2, cell, cell);
  }
  ctx.fillStyle = boom ? "#2a1410" : s.mine;
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 6.284); ctx.fill();
  ctx.strokeStyle = boom ? "#2a1410" : s.mine;
  ctx.lineWidth = Math.max(1.4, cell * 0.07);
  for (var k = 0; k < 4; k++) {
    var a = k * Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * rad * 1.55, cy - Math.sin(a) * rad * 1.55);
    ctx.lineTo(cx + Math.cos(a) * rad * 1.55, cy + Math.sin(a) * rad * 1.55);
    ctx.stroke();
  }
  /* the glint, which is the only thing that stops it reading as a blob */
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.beginPath();
  ctx.arc(cx - rad * 0.32, cy - rad * 0.36, rad * 0.2, 0, 6.284);
  ctx.fill();
}

if (typeof module !== "undefined" && module.exports) module.exports = Gfx;
else root.Gfx = Gfx;
})(typeof self !== "undefined" ? self : this);
