/* gfx.js — the table, painted.

   Card painting, the deck and your own five at the bottom come from
   `cards.js`, which is byte-identical with the hearts room's copy and checked
   by tools/room-parity.js. Two things are this room's own.

   **A ring for up to six.** `cards.js` seats four, because hearts and euchre
   seat four. Viuda takes two to six, so the other players are placed round
   the top of an ellipse here rather than at the four compass points — and,
   as in the card rooms, **you are always at the bottom**, whichever chair the
   table actually dealt you.

   **The widow is a hand, not a pile.** Once it is face up you may fish a
   single card out of it, so all five have to be separately legible and
   separately hittable, sitting in the middle where everybody can see them.
   Face down they are five backs, and the difference between those two states
   is most of what a player is watching for.

   The selected pair — one of yours, one of theirs — is drawn lifted, because
   a swap is a trade and a trade wants both halves visible at once.         */
(function (root) {
"use strict";

var Cards = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./cards.js") : root.Cards;
var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var Gfx = {};
var L = { widow: [], seats: [], cw: 0, ch: 0 };
Gfx.L = L;

Gfx.SKINS = Cards.SKINS;
Gfx.use = function (n) { Cards.use(n); };

Gfx.layout = function (cv, view) {
  var w = cv.clientWidth, h = cv.clientHeight;
  Cards.layout(cv, 5);
  L.cw = Cards.L.cw; L.ch = Cards.L.ch;

  /* the widow, laid out across the middle. It gets its own, slightly smaller
     card so five of them always fit however narrow the phone. */
  var ww = Math.min(L.cw, (w - 24) / 5.4);
  var wh = Math.round(ww * 1.42);
  var step = Math.min(ww * 1.06, (w - 20 - ww) / 4);
  var span = ww + step * 4;
  var x0 = (w - span) / 2;
  var y0 = Math.round(h * 0.56 - wh / 2);
  L.widow = [];
  for (var i = 0; i < 5; i++) L.widow.push({ x: x0 + i * step, y: y0, w: ww, h: wh });

  /* everybody else, round the top of an ellipse, you at the bottom */
  var n = view ? view.seats : 4;
  L.seats = [];
  /* the ring sits in the top third, the widow in the middle, your own five
     along the bottom — three bands, and nothing overlapping anything */
  var cx = w / 2, cy = h * 0.30, rx = w * 0.38, ry = h * 0.16;
  for (i = 0; i < n; i++) {
    if (i === 0) { L.seats.push({ x: cx, y: h - L.ch - 30 }); continue; }
    /* spot 1..n-1 sweep from the left round the top to the right */
    /* π → 2π sweeps left, over the top, and round to the right */
    var a = Math.PI + (Math.PI * i) / n;
    L.seats.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry * 1.05 });
  }
  return L;
};

Gfx.hitHand = function (px, py) { return Cards.hit(px, py, 5); };
Gfx.hitWidow = function (px, py) {
  for (var i = L.widow.length - 1; i >= 0; i--) {
    var b = L.widow[i];
    var w = (i === L.widow.length - 1) ? b.w : (L.widow[i + 1].x - b.x);
    if (px >= b.x && px < b.x + w && py >= b.y && py < b.y + b.h) return i;
  }
  return -1;
};

function plate(g, x, y, text, sub, opts) {
  opts = opts || {};
  g.font = "700 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  var w1 = g.measureText(text).width;
  g.font = "500 11px system-ui,sans-serif";
  var w2 = sub ? g.measureText(sub).width : 0;
  var w = Math.max(w1, w2) + 18, h = sub ? 34 : 22;
  /* clamped inside the canvas, because a plate centred near the edge is a
     plate with its own name running off the screen */
  var px = Math.max(4, Math.min(L.w - w - 4, x - w / 2));
  Cards.rr(g, px, y - h / 2, w, h, 8);
  g.fillStyle = opts.turn ? "rgba(240,168,60,.20)" : "rgba(10,14,12,.70)";
  g.fill();
  g.strokeStyle = opts.turn ? "#f0a83c" : "rgba(255,255,255,.14)";
  g.lineWidth = opts.turn ? 2 : 1;
  g.stroke();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = opts.out ? "#7b7268" : opts.you ? "#ffd77a" : "#f2ece1";
  g.font = "700 12px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  g.fillText(text, px + w / 2, y - (sub ? 7 : 0));
  if (sub) {
    g.font = "500 11px system-ui,sans-serif";
    g.fillStyle = opts.out ? "#7b7268" : "#a89a86";
    g.fillText(sub, px + w / 2, y + 8);
  }
}

/* one short line, broken at spaces rather than clipped — the seat plates
   already taught this file that text laid out by hand runs off the edge */
function wrap(g, text, cx, y, max, lh) {
  var words = String(text).split(" "), line = "", lines = [], i;
  for (i = 0; i < words.length; i++) {
    var t = line ? line + " " + words[i] : words[i];
    if (g.measureText(t).width > max && line) { lines.push(line); line = words[i]; }
    else line = t;
  }
  if (line) lines.push(line);
  for (i = 0; i < lines.length; i++) g.fillText(lines[i], cx, y + i * lh);
}

/* the lives, as pips rather than a number — three of them is a glance and
   "3" is a read */
function pips(g, x, y, n, max) {
  var r = 3.2, gap = 9;
  var w = (max - 1) * gap;
  for (var i = 0; i < max; i++) {
    g.beginPath();
    g.arc(x - w / 2 + i * gap, y, r, 0, Math.PI * 2);
    if (i < n) { g.fillStyle = "#e05a44"; g.fill(); }
    else { g.strokeStyle = "rgba(255,255,255,.22)"; g.lineWidth = 1; g.stroke(); }
  }
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
  Cards.felt(g, w, h);
  if (!view) return;
  Gfx.layout(cv, view);
  L.w = w; L.h = h;

  var maxLives = ui.maxLives || Rules.LIVES;
  var i, s, spot;

  /* At the showdown the hands come down and that is the only thing on the
     table worth looking at — so it is drawn instead of the widow, the seat
     ring and your own fan rather than over the top of them. Painting it as an
     overlay left the widow's caption and the table-state line legible through
     it, crossing the rows they sat behind. */
  if ((view.phase === "show" || view.phase === "over") && view.hands) {
    showdown(g, view, ui, w, h);
    return;
  }

  /* ---------- the widow ---------- */
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = "rgba(255,255,255,.5)";
  g.font = "600 11px system-ui,sans-serif";
  g.fillText(view.shown ? "THE WIDOW — TAP A CARD TO TRADE FOR IT" : "THE WIDOW — FACE DOWN",
             w / 2, L.widow[0].y - 9);
  for (i = 0; i < 5; i++) {
    var b = L.widow[i];
    var card = view.shown && view.widow.length === 5 ? view.widow[i] : -1;
    var lift = (ui.pickWidow === i) ? 8 : 0;
    if (card < 0) Cards.card(g, b.x, b.y - lift, b.w, b.h, -1, {});
    else Cards.card(g, b.x, b.y - lift, b.w, b.h, card, { glow: ui.pickWidow === i });
  }

  /* What the table is waiting for, under the widow. It is the one thing a
     new player cannot work out from the cards — whether anybody has knocked,
     and therefore how long this deal has left. */
  var state = !view.shown
    ? "Nobody has taken it yet."
    : view.knocker >= 0
      ? ((ui.names && ui.names[view.knocker]) || "Somebody") + " knocked — one more turn each, then they come down."
      : "It's face up. Trade a card, take the lot, or knock.";
  g.fillStyle = "rgba(255,255,255,.42)";
  g.font = "500 12px system-ui,sans-serif";
  g.textAlign = "center";
  wrap(g, state, w / 2, L.widow[0].y + L.widow[0].h + 24, w - 48, 16);

  /* ---------- everybody else ---------- */
  for (s = 0; s < view.seats; s++) {
    spot = (s - (view.seat || 0) + view.seats) % view.seats;
    if (spot === 0) continue;
    var p = L.seats[spot];
    if (!p) continue;
    var out = view.lives[s] <= 0;
    var name = (ui.names && ui.names[s]) || ("Seat " + (s + 1));
    var sub = out ? "out" : (view.knocker === s ? "knocked" : null);
    /* their five, small and face down, over the plate */
    if (!out) {
      var bw = Math.max(14, L.cw * 0.32), bh = Math.round(bw * 1.42);
      var run = bw + bw * 0.42 * 4;
      for (i = 0; i < (view.counts[s] || 0); i++) {
        Cards.card(g, p.x - run / 2 + i * bw * 0.42, p.y - bh - 20, bw, bh, -1, {});
      }
    }
    plate(g, p.x, p.y, name, sub, { turn: view.turn === s, out: out });
    if (!out) pips(g, p.x, p.y + 24, view.lives[s], maxLives);
  }

  /* ---------- yours ---------- */
  var hand = view.hand || [];
  for (i = 0; i < hand.length; i++) {
    var hb = Cards.L.hand[i];
    if (!hb) continue;
    var up = (ui.pickHand === i) ? 12 : 0;
    Cards.card(g, hb.x, hb.y - up, hb.w, hb.h, hand[i], { glow: ui.pickHand === i });
  }
  if (hand.length === 5) {
    g.textAlign = "center";
    g.fillStyle = "#f2ece1";
    g.font = "700 13px system-ui,sans-serif";
    g.fillText(Rules.describe(hand), w / 2, Cards.L.hand[0].y - 10);
  }
  var me = L.seats[0];
  if (me) pips(g, 26, me.y - 8, view.lives[view.seat] || 0, maxLives);

};

/* the hands, face up, worst one ringed */
function showdown(g, view, ui, w, h) {
  var s, i, q;
  var live = [];
  for (s = 0; s < view.seats; s++) {
    if (view.lives[s] > 0 || (view.result && view.result.losers.indexOf(s) >= 0)) live.push(s);
  }
  var rows = live.length;
  var rh = Math.min((h - 40) / Math.max(1, rows), 120);
  var cw2 = Math.min((rh - 16) / 1.42, (w - 140) / 5.3), ch2 = Math.round(cw2 * 1.42);
  var top = (h - rh * rows) / 2 + rh / 2;

  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = "rgba(255,255,255,.45)";
  g.font = "600 11px system-ui,sans-serif";
  g.fillText("THE HANDS COME DOWN", w / 2, Math.max(18, top - rh / 2 - 12));

  for (i = 0; i < rows; i++) {
    s = live[i];
    var y = top + i * rh;
    var lost = view.result && view.result.losers.indexOf(s) >= 0;
    var won = view.result && view.result.winners.indexOf(s) >= 0;
    if (lost) {
      g.fillStyle = "rgba(224,80,63,.13)";
      Cards.rr(g, 6, y - rh / 2 + 3, w - 12, rh - 6, 10);
      g.fill();
      g.strokeStyle = "#e05a44"; g.lineWidth = 2; g.stroke();
    }
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillStyle = lost ? "#e05a44" : won ? "#3ecf8e" : "#f2ece1";
    g.font = "700 13px system-ui,sans-serif";
    g.fillText((ui.names && ui.names[s]) || ("Seat " + (s + 1)), 12, y - 11);
    g.fillStyle = lost ? "rgba(224,90,68,.85)" : "#a89a86";
    g.font = "500 11px system-ui,sans-serif";
    g.fillText(Rules.describe(view.hands[s]), 12, y + 8);
    var hx = w - 10 - (cw2 + cw2 * 0.88 * 4);
    for (q = 0; q < view.hands[s].length; q++) {
      Cards.card(g, hx + q * cw2 * 0.88, y - ch2 / 2, cw2, ch2, view.hands[s][q], {});
    }
  }
}
if (typeof module !== "undefined" && module.exports) module.exports = Gfx;
else root.Gfx = Gfx;
})(typeof self !== "undefined" ? self : this);
