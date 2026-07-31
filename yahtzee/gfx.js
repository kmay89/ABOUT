/* gfx.js — the sheet and the cup.

   Yahtzee is not a board, it is a **form**, and the whole design problem is
   that a form with thirteen rows and six columns is a spreadsheet on a phone.
   So two rules run through everything here.

   **The sheet is drawn, not laid out.** It would be easier to build the card
   out of a real HTML table — and then the dice would sit in a different
   coordinate system to the thing they are scoring into, the two would scroll
   independently, and the line connecting "these five dice" to "this box is
   worth 24" would have to be faked. Drawing both on one surface means a box
   can literally light up with the number it would take, which is the entire
   interface: **every open box shows what these dice would score in it, before
   you commit.** Nobody has to know the rules to play well; the sheet says so.

   **Nothing is ever off screen.** Sixteen rows have to fit whatever the phone
   is, so the row height is derived from the space that is left after the dice
   rather than fixed, and the label column shrinks to a short name before
   anything is allowed to overflow. Rules.CATS carries a long name; this file
   carries the short one.

   A zero is drawn differently from an empty box, because they are completely
   different things and confusing them loses games — an empty box is a choice
   you still have, and a nought is a choice you already made.               */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var Gfx = {};
var L = {
  x: 0, y: 0, w: 0, rowH: 0, labelW: 0, colW: 0, cols: 1,
  rows: [], dieY: 0, dieS: 0, dieGap: 0, dice: []
};
Gfx.L = L;

Gfx.SKINS = {
  felt:  { cloth: "#2f5d43", cloth2: "#264c37", rule: "rgba(0,0,0,.30)", head: "#1e3a2b",
           ink: "#f2ece1", dim: "#a9bdae", pip: "#241f19", face: "#f6f1e6", faceEdge: "#cdc4b2",
           held: "#f0a83c", got: "#d9edd6", live: "#ffd77a", zero: "#8d7f6c" },
  oak:   { cloth: "#5a4630", cloth2: "#4a3826", rule: "rgba(0,0,0,.32)", head: "#38291a",
           ink: "#f7efe0", dim: "#c3ac8c", pip: "#2b231a", face: "#fbf6ea", faceEdge: "#d8ceba",
           held: "#e0913a", got: "#f0e4cd", live: "#ffcf6a", zero: "#9b8768" },
  slate: { cloth: "#333b46", cloth2: "#2a313b", rule: "rgba(0,0,0,.36)", head: "#1f242c",
           ink: "#eef2f8", dim: "#9fadbf", pip: "#242a33", face: "#f4f7fb", faceEdge: "#c9d2de",
           held: "#7fb2f0", got: "#dbe7f6", live: "#9fd0ff", zero: "#7f8b9b" }
};
Gfx.skin = Gfx.SKINS.felt;
Gfx.use = function (n) { Gfx.skin = Gfx.SKINS[n] || Gfx.SKINS.felt; };

/* the short names. Rules.CATS holds what a box is called; this holds what
   fits in a column on a phone held in one hand. */
var SHORT = {
  ones: "Ones", twos: "Twos", threes: "Threes", fours: "Fours", fives: "Fives", sixes: "Sixes",
  three: "3 of a kind", four: "4 of a kind", house: "Full house",
  small: "Sm. straight", large: "Lg. straight", yahtzee: "YAHTZEE", chance: "Chance"
};
Gfx.SHORT = SHORT;

/* the sheet's rows, in order, including the three that are arithmetic rather
   than choices. Kept here rather than in rules.js because they are a way of
   showing the card, not a part of the game. */
function rowList() {
  var out = [], i;
  for (i = 0; i < 6; i++) out.push({ kind: "box", key: Rules.CATS[i].key });
  out.push({ kind: "sum", key: "upper" });
  for (i = 6; i < Rules.CATS.length; i++) out.push({ kind: "box", key: Rules.CATS[i].key });
  out.push({ kind: "sum", key: "bonusY" });
  out.push({ kind: "sum", key: "total" });
  return out;
}

Gfx.layout = function (cv, seats) {
  var w = cv.clientWidth, h = cv.clientHeight;
  L.rows = rowList();
  L.cols = Math.max(1, Math.min(6, seats || 1));

  /* the dice get a band at the bottom, sized to the width but never allowed
     to eat more than a third of the height. The strip along the very top is
     left clear for the running commentary, which is the one piece of chrome
     this room keeps in HTML — everything else about who is playing is in the
     sheet's own header, where the columns already are. */
  var band = Math.min(h * 0.30, w * 0.20 + 34);
  var top = 26;
  var pad = 8;
  var sheetH = h - band - top - pad;
  L.rowH = Math.max(15, Math.floor(sheetH / (L.rows.length + 1)));   /* +1 = the header */
  L.w = w - pad * 2;
  L.x = pad;
  L.y = top;

  /* the label column takes what it needs and no more, so six players still
     get a readable number each */
  var want = L.cols >= 5 ? 0.30 : L.cols >= 3 ? 0.38 : 0.48;
  L.labelW = Math.round(L.w * want);
  L.colW = Math.floor((L.w - L.labelW) / L.cols);
  L.labelW = L.w - L.colW * L.cols;

  /* Five dice and four gaps have to fit the width, and the gap is a fraction
     of the die — so the die is solved for out of 5 + 4×0.22 of itself. Sizing
     it against a guessed gap and *then* computing the real one is how the
     outer two ended up half off the screen. */
  var sheetBottom = L.y + L.rowH * (L.rows.length + 1);
  L.dieS = Math.min(Math.floor((w - pad * 2) / 5.88), Math.floor((h - sheetBottom) * 0.58));
  L.dieS = Math.max(20, L.dieS);
  L.dieGap = Math.round(L.dieS * 0.22);
  var run = L.dieS * 5 + L.dieGap * 4;
  var dx = Math.round((w - run) / 2);
  L.dieY = Math.round(sheetBottom + (h - sheetBottom - L.dieS) / 2);
  L.dice = [];
  for (var i = 0; i < 5; i++) L.dice.push({ x: dx + i * (L.dieS + L.dieGap), y: L.dieY, s: L.dieS });
  return L;
};

/* which row and which column a tap landed in */
Gfx.hit = function (px, py) {
  var i;
  for (i = 0; i < 5; i++) {
    var d = L.dice[i];
    if (px >= d.x - 4 && px <= d.x + d.s + 4 && py >= d.y - 6 && py <= d.y + d.s + 6)
      return { kind: "die", i: i };
  }
  var r = Math.floor((py - L.y - L.rowH) / L.rowH);
  if (r < 0 || r >= L.rows.length) return null;
  var col = Math.floor((px - L.x - L.labelW) / L.colW);
  if (px < L.x + L.labelW) col = -1;
  if (col >= L.cols) col = L.cols - 1;
  var row = L.rows[r];
  if (row.kind !== "box") return { kind: "sum", key: row.key, seat: col };
  return { kind: "box", key: row.key, seat: col };
};

/* ================================================================
   the drawing
   ================================================================ */
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* a die. The pips are the real arrangement, because a die with the five in
   the wrong place is the sort of thing nobody can name and everybody sees. */
var PIPS = {
  1: [[.5, .5]],
  2: [[.28, .28], [.72, .72]],
  3: [[.28, .28], [.5, .5], [.72, .72]],
  4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
  5: [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]],
  6: [[.28, .25], [.72, .25], [.28, .5], [.72, .5], [.28, .75], [.72, .75]]
};
Gfx.die = function (g, x, y, s, face, held, lift) {
  var k = Gfx.skin;
  g.save();
  g.translate(0, -(lift || 0));
  g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = s * 0.18; g.shadowOffsetY = s * 0.08;
  var grad = g.createLinearGradient(x, y, x, y + s);
  grad.addColorStop(0, k.face); grad.addColorStop(1, k.faceEdge);
  g.fillStyle = grad;
  roundRect(g, x, y, s, s, s * 0.19);
  g.fill();
  g.shadowColor = "transparent";
  if (held) {
    g.strokeStyle = k.held; g.lineWidth = Math.max(2, s * 0.07);
    roundRect(g, x + 1, y + 1, s - 2, s - 2, s * 0.18);
    g.stroke();
  }
  var pips = PIPS[face] || [];
  g.fillStyle = k.pip;
  for (var i = 0; i < pips.length; i++) {
    g.beginPath();
    g.arc(x + pips[i][0] * s, y + pips[i][1] * s, s * 0.085, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
};

function fit(g, text, max, px, weight) {
  var size = px;
  while (size > 8) {
    g.font = (weight || "600") + " " + size + "px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    if (g.measureText(text).width <= max) return size;
    size -= 1;
  }
  return size;
}

Gfx.draw = function (cv, view, ui) {
  ui = ui || {};
  var dpr = Math.min(3, root.devicePixelRatio || 1);
  var w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  var g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  var k = Gfx.skin;

  var bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, k.cloth); bg.addColorStop(1, k.cloth2);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (!view) return;

  Gfx.layout(cv, view.seats);
  var names = ui.names || [];
  var rowH = L.rowH, y0 = L.y;

  /* the sheet's own paper */
  g.fillStyle = "rgba(0,0,0,.16)";
  roundRect(g, L.x, y0, L.w, rowH * (L.rows.length + 1), 10);
  g.fill();

  /* ---------- the header ---------- */
  g.fillStyle = k.head;
  roundRect(g, L.x, y0, L.w, rowH, 10);
  g.fill();
  g.fillStyle = k.dim;
  g.textBaseline = "middle";
  g.textAlign = "left";
  fit(g, "THE SHEET", L.labelW - 12, Math.min(13, rowH * 0.5), "700");
  g.fillText("THE SHEET", L.x + 8, y0 + rowH / 2);
  /* The names live in the sheet's own header rather than in a strip of chips
     above it, because the columns are already here and two lists of the same
     players is one list too many. The state each chip used to carry comes
     with them: gold for whoever is up, a ring under a chair whose phone has
     gone, and a pulse under one that is thinking. */
  for (var c = 0; c < L.cols; c++) {
    var cx = L.x + L.labelW + c * L.colW;
    var nm = names[c] || ("P" + (c + 1));
    g.textAlign = "center";
    g.fillStyle = (c === view.turn) ? k.live : k.dim;
    fit(g, nm, L.colW - 6, Math.min(13, rowH * 0.5), "700");
    g.fillText(nm, cx + L.colW / 2, y0 + rowH / 2 - (rowH > 26 ? 3 : 0));
    if (rowH > 26) {
      var live = !ui.live || ui.live[c];
      var dy = y0 + rowH - 6, dx = cx + L.colW / 2;
      g.beginPath();
      g.arc(dx, dy, 3, 0, Math.PI * 2);
      if (ui.thinking === c) { g.fillStyle = k.held; g.fill(); }
      else if (live) { g.fillStyle = c === view.turn ? k.live : "rgba(255,255,255,.28)"; g.fill(); }
      else { g.strokeStyle = k.zero; g.lineWidth = 1.2; g.stroke(); }
    }
  }

  /* ---------- the rows ---------- */
  var dice = view.dice, rolled = view.rolls > 0;
  var mine = ui.seat === undefined ? view.turn : ui.seat;
  var canWrite = rolled && view.turn === mine && !ui.locked;
  var joker = rolled ? Rules.jokerBoxes(dice, view.cards[view.turn]) : null;

  for (var r = 0; r < L.rows.length; r++) {
    var row = L.rows[r], ry = y0 + rowH * (r + 1);
    var sum = row.kind === "sum";
    if (r % 2 === 0 && !sum) { g.fillStyle = "rgba(255,255,255,.035)"; g.fillRect(L.x, ry, L.w, rowH); }
    if (sum) { g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(L.x, ry, L.w, rowH); }

    g.strokeStyle = k.rule; g.lineWidth = 1;
    g.beginPath(); g.moveTo(L.x, ry + 0.5); g.lineTo(L.x + L.w, ry + 0.5); g.stroke();

    var label = sum
      ? (row.key === "upper" ? "Upper + 35 at 63" : row.key === "bonusY" ? "Extra Yahtzees" : "TOTAL")
      : SHORT[row.key];
    g.textAlign = "left";
    g.fillStyle = sum ? k.dim : k.ink;
    var lp = fit(g, label, L.labelW - 12, Math.min(rowH * 0.52, 15), sum ? "700" : "600");
    g.fillText(label, L.x + 8, ry + rowH / 2);

    for (c = 0; c < L.cols; c++) {
      var cx2 = L.x + L.labelW + c * L.colW, card = view.cards[c];
      g.strokeStyle = k.rule;
      g.beginPath(); g.moveTo(cx2 + 0.5, ry); g.lineTo(cx2 + 0.5, ry + rowH); g.stroke();
      g.textAlign = "center";
      var mid = cx2 + L.colW / 2, my = ry + rowH / 2;

      if (sum) {
        var val = row.key === "upper"
          ? Rules.upperTotal(card) + (Rules.upperTotal(card) >= Rules.BONUS_AT ? Rules.BONUS : 0)
          : row.key === "bonusY" ? (card.bonusYahtzees || 0) * Rules.JOKER
          : Rules.total(card);
        g.fillStyle = row.key === "total" ? k.ink : k.dim;
        fit(g, String(val), L.colW - 6, Math.min(rowH * 0.6, 16), "700");
        g.fillText(String(val), mid, my);
        if (row.key === "upper" && Rules.upperTotal(card) < Rules.BONUS_AT) {
          /* how far off the sixty-three is — the number the upper half is
             actually about, and nobody wants to do the subtraction */
          var need = Rules.BONUS_AT - Rules.upperTotal(card);
          g.fillStyle = k.zero;
          g.font = "500 " + Math.max(8, Math.round(rowH * 0.36)) + "px system-ui,sans-serif";
          g.fillText("−" + need, mid + L.colW * 0.31, my);
        }
        continue;
      }

      var v = card[row.key];
      if (v !== null && v !== undefined) {
        g.fillStyle = v === 0 ? k.zero : k.got;
        fit(g, String(v), L.colW - 6, Math.min(rowH * 0.6, 17), v === 0 ? "500" : "700");
        g.fillText(v === 0 ? "—" : String(v), mid, my);
        continue;
      }
      /* open. If it is this player's turn and dice are on the table, show
         what they would score here — the whole point of the sheet. */
      if (canWrite && c === view.turn) {
        var allowed = !joker || joker.indexOf(row.key) >= 0;
        if (allowed) {
          var would = Rules.score(row.key, dice, card);
          g.fillStyle = would > 0 ? k.live : k.zero;
          roundRect(g, cx2 + 3, ry + 2, L.colW - 6, rowH - 4, 5);
          g.strokeStyle = would > 0 ? "rgba(255,215,122,.45)" : "rgba(255,255,255,.10)";
          g.lineWidth = 1; g.stroke();
          if (ui.hint && ui.hint.box === row.key) {
            /* the coach's answer, drawn where the answer goes */
            g.fillStyle = "rgba(255,215,122,.22)";
            g.fillRect(cx2 + 3, ry + 2, L.colW - 6, rowH - 4);
            g.strokeStyle = k.live; g.lineWidth = 2; g.stroke();
            g.fillStyle = k.live;
          }
          fit(g, String(would), L.colW - 8, Math.min(rowH * 0.58, 16), "700");
          g.fillText(String(would), mid, my);
        } else {
          g.fillStyle = "rgba(255,255,255,.06)";
          g.fillRect(cx2 + 3, ry + 2, L.colW - 6, rowH - 4);
        }
      }
    }
  }
  g.strokeStyle = k.rule; g.lineWidth = 1;
  roundRect(g, L.x + 0.5, y0 + 0.5, L.w - 1, rowH * (L.rows.length + 1) - 1, 10);
  g.stroke();

  /* ---------- the dice ---------- */
  for (var i = 0; i < 5; i++) {
    var d = L.dice[i];
    if (!rolled) {
      g.fillStyle = "rgba(0,0,0,.18)";
      roundRect(g, d.x, d.y, d.s, d.s, d.s * 0.19);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,.10)"; g.lineWidth = 1; g.stroke();
      continue;
    }
    var jitter = ui.rolling && !view.keep[i] ? ui.rolling : 0;
    var face = jitter ? (1 + ((Math.random() * 6) | 0)) : dice[i];
    /* the coach's suggested keeps, marked under the die rather than on it —
       so you can still see what you yourself have set aside */
    if (ui.hint && ui.hint.keep && ui.hint.keep[i]) {
      g.fillStyle = k.live;
      g.beginPath();
      g.arc(d.x + d.s / 2, d.y + d.s + Math.max(5, d.s * 0.13), Math.max(2.5, d.s * 0.055), 0, Math.PI * 2);
      g.fill();
    }
    Gfx.die(g, d.x, d.y, d.s, face, view.keep[i] && view.rolls > 0, view.keep[i] ? d.s * 0.10 : 0);
  }

  /* what the dice band is telling you to do */
  g.textAlign = "center";
  g.fillStyle = k.dim;
  g.font = "600 " + Math.max(10, Math.round(L.dieS * 0.22)) + "px system-ui,sans-serif";
  var note = !rolled ? "Roll to start"
    : view.rolls >= 3 ? "No rolls left — pick a box"
    : "Tap the dice you keep · " + (3 - view.rolls) + (3 - view.rolls === 1 ? " roll left" : " rolls left");
  var ny = L.dieY + L.dieS + Math.max(12, L.dieS * 0.28);
  if (ny < h - 4) g.fillText(note, w / 2, ny);

  /* your best sheet, in the corner. It used to be a chip floating over the
     top rows, which is exactly where the sheet needs the room. */
  if (ui.best) {
    g.textAlign = "left";
    g.fillStyle = k.zero;
    g.font = "600 " + Math.max(9, Math.round(L.dieS * 0.2)) + "px system-ui,sans-serif";
    g.fillText("best " + ui.best, 10, h - 10);
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = Gfx;
else root.Gfx = Gfx;
})(typeof self !== "undefined" ? self : this);
