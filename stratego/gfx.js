/* gfx.js — the board, painted.

   Canvas 2D, drawn from the same coordinates the rules use.

   The whole design problem in this room is one question: **how much of what
   you are allowed to know should the board show you?**

   In the physical game the answer is "whatever you can remember". Everything
   below is public — it happened in front of both players — but a person has
   to hold it in their head, and most people hold about a third of it. The
   line drawn here is the same one the domino table and the hearts room draw:
   *anything the board said out loud is on the screen; anything you would have
   had to work out is not.*

   So, on an enemy piece:

     · **a dot if it has ever moved.** Public, enormous, and the single thing
       that separates a first game from a tenth: a piece that has moved is not
       a Bomb and is not the Flag. Everybody watched it happen.
     · **its rank if it has been in a fight**, because both pieces turn face
       up when they strike and you were sitting right there.

   And nothing else. Which of the unmoved pieces is the Flag, what the odds
   are on a given square, how many Miners they have left — all derivable, none
   of it drawn. Working that out is the game.                               */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var Gfx = {};
var L = { x: 0, y: 0, cell: 0, size: 0, flip: false };
Gfx.L = L;
var back = null, backKey = "";

Gfx.SKINS = {
  field: { land: "#6b7248", land2: "#5c6340", grid: "rgba(0,0,0,.28)", water: "#2d5f7a",
           water2: "#23485c", frame: "#2f2a1d", me: "#c8452f", meDark: "#8a2718",
           them: "#2f6fa8", themDark: "#1d4670", ink: "#f4efe2" },
  desert: { land: "#b09a6a", land2: "#9d885b", grid: "rgba(0,0,0,.24)", water: "#3c7b8c",
           water2: "#2c5c69", frame: "#4a3b22", me: "#a83a2a", meDark: "#6f2116",
           them: "#3c5f8a", themDark: "#243c59", ink: "#fbf6e8" },
  night: { land: "#3a4250", land2: "#313945", grid: "rgba(0,0,0,.35)", water: "#26455e",
           water2: "#1c3345", frame: "#1b2028", me: "#d05a44", meDark: "#8f3225",
           them: "#5b8fd0", themDark: "#33578a", ink: "#eef2f8" }
};
Gfx.skin = Gfx.SKINS.field;
Gfx.use = function (n) { Gfx.skin = Gfx.SKINS[n] || Gfx.SKINS.field; back = null; };

Gfx.layout = function (cv, flip) {
  var w = cv.clientWidth, h = cv.clientHeight;
  var pad = 6;
  var size = Math.max(80, Math.min(w, h) - pad * 2);
  L.cell = Math.floor(size / 10);
  L.size = L.cell * 10;
  L.x = Math.round((w - L.size) / 2);
  L.y = Math.round((h - L.size) / 2);
  L.flip = !!flip;
  return L;
};
function rc(sq) {
  var r = (sq / 10) | 0, c = sq % 10;
  return L.flip ? { r: 9 - r, c: 9 - c } : { r: r, c: c };
}
Gfx.at = function (sq) {
  var p = rc(sq);
  return { x: L.x + p.c * L.cell, y: L.y + p.r * L.cell, s: L.cell };
};
Gfx.centre = function (sq) {
  var a = Gfx.at(sq);
  return { x: a.x + L.cell / 2, y: a.y + L.cell / 2 };
};
Gfx.hit = function (px, py) {
  var c = Math.floor((px - L.x) / L.cell), r = Math.floor((py - L.y) / L.cell);
  if (r < 0 || r > 9 || c < 0 || c > 9) return -1;
  if (L.flip) { r = 9 - r; c = 9 - c; }
  return r * 10 + c;
};

/* ---------- the board, cached ---------- */
function paintBoard(dpr) {
  var s = Gfx.skin;
  var key = L.size + ":" + L.flip + ":" + s.land + ":" + dpr;
  if (back && backKey === key) return back;
  var m = Math.round(L.cell * 0.18);
  var cv = document.createElement("canvas");
  cv.width = (L.size + m * 2) * dpr; cv.height = (L.size + m * 2) * dpr;
  var g = cv.getContext("2d");
  g.scale(dpr, dpr);

  g.fillStyle = s.frame;
  round(g, 0, 0, L.size + m * 2, L.size + m * 2, m * 0.8);
  g.fill();

  for (var r = 0; r < 10; r++) for (var c = 0; c < 10; c++) {
    var sq = (L.flip ? (9 - r) * 10 + (9 - c) : r * 10 + c);
    var x = m + c * L.cell, y = m + r * L.cell;
    if (Rules.isWater(sq)) {
      var wg = g.createLinearGradient(x, y, x, y + L.cell);
      wg.addColorStop(0, s.water);
      wg.addColorStop(1, s.water2);
      g.fillStyle = wg;
      g.fillRect(x, y, L.cell, L.cell);
      /* three ripples, so the lakes read as water rather than as blue holes */
      g.save();
      g.globalAlpha = 0.3;
      g.strokeStyle = "#fff";
      g.lineWidth = Math.max(1, L.cell * 0.035);
      for (var k = 1; k <= 3; k++) {
        var yy = y + L.cell * (k / 4);
        g.beginPath();
        g.moveTo(x + L.cell * 0.12, yy);
        g.bezierCurveTo(x + L.cell * 0.35, yy - L.cell * 0.06,
                        x + L.cell * 0.65, yy + L.cell * 0.06,
                        x + L.cell * 0.88, yy);
        g.stroke();
      }
      g.restore();
    } else {
      g.fillStyle = ((r + c) & 1) ? s.land : s.land2;
      g.fillRect(x, y, L.cell, L.cell);
    }
    g.strokeStyle = s.grid;
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, L.cell - 1, L.cell - 1);
  }
  back = cv; backKey = key; back._m = m;
  return back;
}

/* ---------- one piece ----------
   Yours is a card with a number and a name on it. Theirs is the back of the
   same card, with a dot if it has ever moved. */
function piece(g, x, y, cell, seat, mine, rank, moved, dim) {
  var s = Gfx.skin;
  var pad = cell * 0.07, w = cell - pad * 2, r = cell * 0.13;
  var top = mine ? s.me : s.them;
  var low = mine ? s.meDark : s.themDark;

  g.save();
  g.globalAlpha = dim ? 0.45 : 1;
  g.shadowColor = "rgba(0,0,0,.45)";
  g.shadowBlur = cell * 0.1;
  g.shadowOffsetY = cell * 0.03;
  var lg = g.createLinearGradient(x, y, x, y + cell);
  lg.addColorStop(0, top);
  lg.addColorStop(1, low);
  g.fillStyle = lg;
  round(g, x + pad, y + pad, w, w, r);
  g.fill();
  g.restore();

  g.save();
  g.globalAlpha = dim ? 0.5 : 1;
  g.strokeStyle = "rgba(0,0,0,.35)";
  g.lineWidth = 1;
  round(g, x + pad, y + pad, w, w, r);
  g.stroke();

  if (rank >= 0) {
    var label = Rules.SHORT[rank];
    g.fillStyle = s.ink;
    g.textAlign = "center";
    g.textBaseline = "middle";
    var big = rank === Rules.BOMB || rank === Rules.FLAG;
    g.font = "800 " + Math.round(cell * (label.length > 1 ? 0.34 : 0.44)) + "px system-ui,-apple-system,sans-serif";
    g.fillText(label, x + cell / 2, y + cell * 0.44);
    /* the name underneath, when there is room for it — a "3" that says MINER
       is the difference between knowing the rules and having to learn them */
    if (cell > 34 && !big) {
      g.font = "700 " + Math.round(cell * 0.155) + "px system-ui,sans-serif";
      g.globalAlpha *= 0.75;
      g.fillText(Rules.TINY[rank], x + cell / 2, y + cell * 0.76);
    }
  } else {
    /* the back: a plain field, and the one thing you are entitled to know */
    g.strokeStyle = "rgba(255,255,255,.16)";
    g.lineWidth = Math.max(1, cell * 0.03);
    g.beginPath();
    g.moveTo(x + cell * 0.28, y + cell * 0.5);
    g.lineTo(x + cell * 0.72, y + cell * 0.5);
    g.stroke();
    if (moved) {
      g.fillStyle = "rgba(255,215,122,.95)";
      g.beginPath();
      g.arc(x + cell * 0.78, y + cell * 0.24, cell * 0.075, 0, 6.284);
      g.fill();
    }
  }
  g.restore();
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

  var bd = paintBoard(dpr), m = bd._m;
  g.drawImage(bd, L.x - m, L.y - m, L.size + m * 2, L.size + m * 2);

  var i;
  /* the squares you may set up in, while you are setting up */
  if (ui.home) {
    g.save();
    g.globalAlpha = 0.16;
    g.fillStyle = "#ffd77a";
    for (i = 0; i < ui.home.length; i++) {
      var hp = Gfx.at(ui.home[i]);
      g.fillRect(hp.x, hp.y, L.cell, L.cell);
    }
    g.restore();
  }

  /* the last move, as a line from where to where */
  if (ui.last && ui.last.f !== undefined) {
    var a = Gfx.centre(ui.last.f), b = Gfx.centre(ui.last.t);
    g.save();
    g.globalAlpha = 0.6;
    g.strokeStyle = ui.last.by === view.seat ? "rgba(255,215,122,.9)" : "rgba(255,140,120,.9)";
    g.lineWidth = Math.max(2, L.cell * 0.09);
    g.lineCap = "round";
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.restore();
  }

  /* the piece you have picked up, and where it may go */
  if (ui.from >= 0) {
    var f = Gfx.at(ui.from);
    g.strokeStyle = "rgba(255,255,255,.95)";
    g.lineWidth = Math.max(2, L.cell * 0.07);
    round(g, f.x + 2, f.y + 2, L.cell - 4, L.cell - 4, L.cell * 0.12);
    g.stroke();
  }
  if (ui.marks) for (i = 0; i < ui.marks.length; i++) {
    var mk = ui.marks[i], mc = Gfx.centre(mk.sq);
    g.save();
    if (mk.strike) {
      g.strokeStyle = "rgba(224,106,82,.95)";
      g.lineWidth = Math.max(2, L.cell * 0.08);
      g.beginPath(); g.arc(mc.x, mc.y, L.cell * 0.36, 0, 6.284); g.stroke();
    } else {
      g.fillStyle = "rgba(255,255,255,.55)";
      g.beginPath(); g.arc(mc.x, mc.y, L.cell * 0.13, 0, 6.284); g.fill();
    }
    g.restore();
  }

  /* the pieces */
  for (i = 0; i < 100; i++) {
    var c = view.cells[i];
    if (!c) continue;
    if (ui.fly && ui.fly.sq === i) continue;
    var p = Gfx.at(i);
    piece(g, p.x, p.y, L.cell, c.seat, c.mine, c.mine || c.rank >= 0 ? c.rank : -1,
          c.moved, ui.dying && ui.dying.indexOf(i) >= 0);
  }
  if (ui.fly) {
    piece(g, ui.fly.x, ui.fly.y, L.cell, ui.fly.seat, ui.fly.mine, ui.fly.rank, false, false);
  }

  /* a fight, held on the screen for a moment: both ranks, because both of
     them turned face up and you are entitled to have seen it */
  if (ui.fight) {
    var fc = Gfx.centre(ui.fight.sq);
    var bw = L.cell * 2.4, bh = L.cell * 0.9;
    var bx = Math.max(4, Math.min(w - bw - 4, fc.x - bw / 2));
    var by = Math.max(4, Math.min(h - bh - 4, fc.y - bh / 2));
    g.save();
    g.fillStyle = "rgba(10,10,8,.9)";
    round(g, bx, by, bw, bh, bh * 0.28);
    g.fill();
    g.strokeStyle = "rgba(255,215,122,.9)";
    g.lineWidth = 2;
    round(g, bx, by, bw, bh, bh * 0.28);
    g.stroke();
    g.fillStyle = "#f4efe2";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "800 " + Math.round(bh * 0.4) + "px system-ui,sans-serif";
    var txt = Rules.NAME[ui.fight.att] + "  ×  " + Rules.NAME[ui.fight.def];
    g.fillText(txt, bx + bw / 2, by + bh * 0.36);
    g.font = "600 " + Math.round(bh * 0.28) + "px system-ui,sans-serif";
    g.fillStyle = "#ffd77a";
    g.fillText(ui.fight.words, bx + bw / 2, by + bh * 0.72);
    g.restore();
  }
};

function round(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

if (typeof module !== "undefined" && module.exports) module.exports = Gfx;
else root.Gfx = Gfx;
})(typeof self !== "undefined" ? self : this);
