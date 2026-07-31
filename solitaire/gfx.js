/* gfx.js — the table, the cards, and where everything is.

   Canvas 2D. This file owns the layout as well as the painting, because in a
   card game they are the same question: a card is where you can drop it, and
   the hit test and the drawing must come from one set of numbers or they will
   disagree the first time somebody rotates their phone.

   ## The layout problem

   Seven tableau piles have to fit across a phone, and the longest of them can
   be nineteen cards deep. Fixed offsets overflow the screen; scaling the
   cards down until the worst case fits makes every ordinary hand tiny. So the
   fan is **elastic**: the face-up offset shrinks only as far as it must for
   the tallest pile currently on the table, with a floor at the point where
   the rank in the corner would be covered. That is the real constraint — a
   card in a fan needs exactly enough of itself showing to be identified and
   hit, and not one pixel more.

   Face-down cards get a much smaller offset than face-up ones, because they
   carry no information: they only need to say "there are four of these".

   ## The card

   Drawn, not imaged. A white rounded rect, a hairline border, the rank and
   suit in the top-left corner — and, when there is room, a large centre pip.
   The corner index is what you actually read while playing, so it is sized
   off the *fan offset* rather than off the card, which keeps it legible
   exactly when it needs to be.                                             */
(function (root) {
"use strict";

var Gfx = {};

var L = {
  cw: 60, ch: 84, gap: 6, pad: 8,
  found: [], stock: null, waste: null, piles: [],
  up: 22, dn: 8, w: 0, h: 0
};
Gfx.L = L;

Gfx.SKINS = {
  green: { felt: "#1b5c3f", felt2: "#164e35", slot: "rgba(0,0,0,.28)", slotLine: "rgba(255,255,255,.2)",
           back: "#25457e", back2: "#16294d", face: "#f7f4ec", edge: "#c9c2b0",
           red: "#c0392b", black: "#1e1e1e" },
  wine:  { felt: "#5c2233", felt2: "#4a1a29", slot: "rgba(0,0,0,.3)",  slotLine: "rgba(255,255,255,.2)",
           back: "#7a3a24", back2: "#4a2113", face: "#f7f2e6", edge: "#cbc0a8",
           red: "#c0392b", black: "#1e1e1e" },
  night: { felt: "#1b2233", felt2: "#161c2a", slot: "rgba(0,0,0,.34)", slotLine: "rgba(255,255,255,.18)",
           back: "#2f3b57", back2: "#1a2233", face: "#eef1f6", edge: "#b6bcc9",
           red: "#d4574a", black: "#1a1a1a" }
};
Gfx.skin = Gfx.SKINS.green;
Gfx.use = function (n) { Gfx.skin = Gfx.SKINS[n] || Gfx.SKINS.green; };

/* ---------- where everything is ---------- */
Gfx.layout = function (cv, g) {
  var W = cv.clientWidth, H = cv.clientHeight;
  L.w = W; L.h = H;
  L.gap = Math.max(4, Math.round(W * 0.014));
  L.cw = Math.floor((W - L.gap * 8) / 7);
  L.ch = Math.round(L.cw * 1.4);
  L.pad = L.gap;

  var top = L.pad;
  L.stock = { x: L.pad, y: top };
  L.waste = { x: L.pad + L.cw + L.gap, y: top };
  L.found = [];
  for (var i = 0; i < 4; i++) {
    L.found.push({ x: L.pad + (3 + i) * (L.cw + L.gap), y: top });
  }

  var pileTop = top + L.ch + Math.round(L.ch * 0.22);
  var room = H - pileTop - L.pad;

  /* the elastic fan: shrink only as far as the tallest pile requires, and
     never past the point where the corner index is covered */
  var deepest = 1, dn = 0;
  for (i = 0; i < 7; i++) {
    var n = g.pile[i].length;
    if (n > deepest) deepest = n;
    if (g.down[i] > dn) dn = g.down[i];
  }
  var minUp = Math.max(9, Math.round(L.ch * 0.19));
  var idealUp = Math.round(L.ch * 0.31);
  L.dn = Math.max(4, Math.round(L.ch * 0.09));
  var upN = Math.max(1, deepest - dn);
  var space = room - L.ch - dn * L.dn;
  L.up = Math.max(minUp, Math.min(idealUp, Math.floor(space / Math.max(1, upN - 1))));

  L.piles = [];
  for (i = 0; i < 7; i++) L.piles.push({ x: L.pad + i * (L.cw + L.gap), y: pileTop });
  return L;
};

/* where card `i` of pile `p` sits */
Gfx.cardAt = function (g, p, i) {
  var base = L.piles[p];
  var d = Math.min(i, g.down[p]);
  var u = Math.max(0, i - g.down[p]);
  return { x: base.x, y: base.y + d * L.dn + u * L.up };
};
/* the waste shows up to three, fanned, so a draw-three hand can be read */
Gfx.wasteAt = function (g, i) {
  var n = g.waste.length, show = Math.min(g.draw, 3);
  var k = i - (n - show);
  if (k < 0) k = 0;
  return { x: L.waste.x + k * Math.round(L.cw * 0.24), y: L.waste.y };
};

/* what is under this point: {kind:"pile"|"found"|"stock"|"waste", p, i} */
Gfx.hit = function (g, px, py) {
  var i, p;
  if (inside(px, py, L.stock.x, L.stock.y)) return { kind: "stock" };
  var n = g.waste.length;
  if (n) {
    var show = Math.min(g.draw, 3);
    for (i = n - 1; i >= Math.max(0, n - show); i--) {
      var w = Gfx.wasteAt(g, i);
      if (inside(px, py, w.x, w.y)) return { kind: "waste", i: i };
    }
  }
  if (inside(px, py, L.waste.x, L.waste.y)) return { kind: "waste", i: n - 1 };
  for (i = 0; i < 4; i++) if (inside(px, py, L.found[i].x, L.found[i].y)) return { kind: "found", p: i };
  for (p = 0; p < 7; p++) {
    var pile = g.pile[p];
    if (!pile.length) {
      if (inside(px, py, L.piles[p].x, L.piles[p].y)) return { kind: "pile", p: p, i: -1 };
      continue;
    }
    for (i = pile.length - 1; i >= 0; i--) {
      var c = Gfx.cardAt(g, p, i);
      /* every card but the last is only as tall as the amount of it showing */
      var h = (i === pile.length - 1) ? L.ch : (i < g.down[p] ? L.dn : L.up);
      if (px >= c.x && px < c.x + L.cw && py >= c.y && py < c.y + h) return { kind: "pile", p: p, i: i };
    }
  }
  return null;
};
function inside(px, py, x, y) { return px >= x && px < x + L.cw && py >= y && py < y + L.ch; }

/* the pile a dragged stack would land on — measured from the *card's* top
   edge rather than the finger, because you aim with the card */
Gfx.drop = function (g, x, y) {
  var cx = x + L.cw / 2, cy = y + L.ch * 0.35, i, best = null, bestD = 1e9;
  for (i = 0; i < 4; i++) {
    var d = dist(cx, cy, L.found[i].x + L.cw / 2, L.found[i].y + L.ch / 2);
    if (d < bestD && d < L.cw * 1.1) { bestD = d; best = { kind: "found", p: i }; }
  }
  for (i = 0; i < 7; i++) {
    var pile = g.pile[i];
    var top = pile.length ? Gfx.cardAt(g, i, pile.length - 1) : L.piles[i];
    var d2 = dist(cx, cy, top.x + L.cw / 2, top.y + L.ch / 2);
    if (d2 < bestD && d2 < L.cw * 1.3) { bestD = d2; best = { kind: "pile", p: i }; }
  }
  return best;
}
function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }

/* ---------- painting ---------- */
function round(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

var PIP = ["♣", "♦", "♥", "♠"];
var RANK = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

Gfx.card = function (g, x, y, c, opts) {
  opts = opts || {};
  var s = Gfx.skin, w = L.cw, h = L.ch, r = Math.max(3, w * 0.11);

  if (opts.shadow) {
    g.save();
    g.shadowColor = "rgba(0,0,0,.45)";
    g.shadowBlur = w * 0.22;
    g.shadowOffsetY = w * 0.09;
    g.fillStyle = "#000";
    round(g, x, y, w, h, r);
    g.fill();
    g.restore();
  }

  if (c < 0) {
    /* the back: two blues and a lattice, so a run of face-down cards has
       texture without competing with the faces */
    var bg = g.createLinearGradient(x, y, x + w, y + h);
    bg.addColorStop(0, s.back);
    bg.addColorStop(1, s.back2);
    g.fillStyle = bg;
    round(g, x, y, w, h, r); g.fill();
    g.save();
    round(g, x + w * 0.08, y + h * 0.06, w * 0.84, h * 0.88, r * 0.6);
    g.clip();
    g.strokeStyle = "rgba(255,255,255,.16)";
    g.lineWidth = Math.max(0.8, w * 0.022);
    for (var k = -h; k < w + h; k += Math.max(5, w * 0.16)) {
      g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + h, y + h); g.stroke();
      g.beginPath(); g.moveTo(x + k + h, y); g.lineTo(x + k, y + h); g.stroke();
    }
    g.restore();
    g.strokeStyle = "rgba(0,0,0,.4)";
    g.lineWidth = 1;
    round(g, x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke();
    return;
  }

  g.fillStyle = s.face;
  round(g, x, y, w, h, r); g.fill();
  g.strokeStyle = s.edge; g.lineWidth = 1;
  round(g, x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke();

  var rk = c % 13, st = (c / 13) | 0;
  var col = (st === 1 || st === 2) ? s.red : s.black;
  g.fillStyle = col;
  g.textAlign = "left";
  g.textBaseline = "top";
  /* the corner index is sized off the fan offset, not the card: it is what
     you read in a stack, and a stack shows only the fan offset */
  var idx = Math.max(9, Math.min(w * 0.4, L.up * 0.72));
  g.font = "800 " + Math.round(idx) + "px system-ui,-apple-system,Segoe UI,sans-serif";
  g.fillText(RANK[rk], x + w * 0.09, y + h * 0.045);
  g.font = "600 " + Math.round(idx * 0.85) + "px system-ui,sans-serif";
  g.fillText(PIP[st], x + w * 0.09, y + h * 0.045 + idx * 0.98);

  if (!opts.tight) {
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "600 " + Math.round(w * 0.52) + "px system-ui,sans-serif";
    g.globalAlpha = 0.92;
    g.fillText(PIP[st], x + w * 0.62, y + h * 0.62);
    g.globalAlpha = 1;
  }
  if (opts.dim) {
    g.fillStyle = "rgba(0,0,0,.35)";
    round(g, x, y, w, h, r); g.fill();
  }
};

function slot(g, x, y, glyph) {
  var s = Gfx.skin, r = Math.max(3, L.cw * 0.11);
  g.fillStyle = s.slot;
  round(g, x, y, L.cw, L.ch, r); g.fill();
  g.strokeStyle = s.slotLine;
  g.lineWidth = Math.max(1, L.cw * 0.02);
  g.setLineDash([L.cw * 0.12, L.cw * 0.09]);
  round(g, x + 1, y + 1, L.cw - 2, L.ch - 2, r); g.stroke();
  g.setLineDash([]);
  if (glyph) {
    g.fillStyle = "rgba(255,255,255,.3)";
    g.font = "600 " + Math.round(L.cw * 0.44) + "px system-ui,sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(glyph, x + L.cw / 2, y + L.ch / 2);
  }
}

Gfx.draw = function (cv, g, ui) {
  var dpr = Math.min(3, root.devicePixelRatio || 1);
  var W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  var ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  var s = Gfx.skin;
  var bg = ctx.createRadialGradient(W * 0.5, H * 0.34, 10, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
  bg.addColorStop(0, s.felt);
  bg.addColorStop(1, s.felt2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ui = ui || {};
  var i, p;

  /* the stock, and how many turns of it are left */
  if (g.stock.length) {
    Gfx.card(ctx, L.stock.x, L.stock.y, -1);
    if (g.stock.length > 1) Gfx.card(ctx, L.stock.x - 1.5, L.stock.y - 1.5, -1);
  } else {
    slot(ctx, L.stock.x, L.stock.y, g.waste.length ? "↻" : "");
  }
  if (g.waste.length) {
    var show = Math.min(g.draw, 3), n = g.waste.length;
    for (i = Math.max(0, n - show); i < n; i++) {
      var w = Gfx.wasteAt(g, i);
      if (ui.carry && ui.carry.from === "w" && i === n - 1) continue;
      Gfx.card(ctx, w.x, w.y, g.waste[i], { tight: false });
    }
  } else {
    slot(ctx, L.waste.x, L.waste.y);
  }

  for (i = 0; i < 4; i++) {
    var f = L.found[i];
    if (g.found[i]) {
      if (g.found[i] > 1) Gfx.card(ctx, f.x, f.y, i * 13 + (g.found[i] - 2), { tight: true });
      Gfx.card(ctx, f.x, f.y, i * 13 + (g.found[i] - 1));
    } else slot(ctx, f.x, f.y, PIP[i]);
  }

  for (p = 0; p < 7; p++) {
    var pile = g.pile[p];
    if (!pile.length) { slot(ctx, L.piles[p].x, L.piles[p].y); continue; }
    for (i = 0; i < pile.length; i++) {
      if (ui.carry && ui.carry.p === p && i >= ui.carry.i) break;
      var c = Gfx.cardAt(g, p, i);
      var faceDown = i < g.down[p];
      var last = (i === pile.length - 1);
      Gfx.card(ctx, c.x, c.y, faceDown ? -1 : pile[i], { tight: !last });
    }
  }

  /* whatever is in the air */
  if (ui.carry) {
    var cs = ui.carry.cards;
    for (i = 0; i < cs.length; i++) {
      Gfx.card(ctx, ui.carry.x, ui.carry.y + i * L.up, cs[i],
               { shadow: i === 0, tight: i < cs.length - 1 });
    }
  }
  /* where it would land */
  if (ui.target) {
    var t = ui.target.kind === "found" ? L.found[ui.target.p]
          : (g.pile[ui.target.p].length ? Gfx.cardAt(g, ui.target.p, g.pile[ui.target.p].length - 1) : L.piles[ui.target.p]);
    ctx.strokeStyle = "rgba(255,215,122,.9)";
    ctx.lineWidth = Math.max(2, L.cw * 0.05);
    round(ctx, t.x - 2, t.y - 2, L.cw + 4, L.ch + 4, Math.max(3, L.cw * 0.11));
    ctx.stroke();
  }
  /* the hint's own halo */
  if (ui.hint) {
    ctx.strokeStyle = "rgba(62,207,142,.95)";
    ctx.lineWidth = Math.max(2, L.cw * 0.06);
    for (i = 0; i < ui.hint.length; i++) {
      round(ctx, ui.hint[i].x - 2, ui.hint[i].y - 2, L.cw + 4, L.ch + 4, Math.max(3, L.cw * 0.11));
      ctx.stroke();
    }
  }
  /* the flight of a card going home by itself */
  if (ui.flights) for (i = 0; i < ui.flights.length; i++) {
    var fl = ui.flights[i];
    Gfx.card(ctx, fl.x, fl.y, fl.c, { shadow: true });
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = Gfx;
else root.Gfx = Gfx;
})(typeof self !== "undefined" ? self : this);
