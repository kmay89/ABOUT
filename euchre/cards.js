/* cards.js — a deck, and a table for four to play it on.

   Shared between the hearts room and the euchre room, byte-identical, because
   the two games differ entirely in their rules and not at all in what a card
   looks like or where the four seats are. tools/card-parity.js keeps the
   copies honest.

   ## The encoding

   A card is `suit * 13 + rank`, suits in the order ♣ ♦ ♥ ♠ and ranks 0 = two
   through 12 = ace. Euchre uses only ranks 7…12, which is a subset rather
   than a different deck, so both games can share every helper below.

   ## The table

   Four seats, and **you are always at the bottom**. This is the single most
   important decision in the file: the seat index that arrives over the wire
   is absolute, and everything drawn is relative to whoever is looking. So
   there is exactly one function that converts between them (`place`), it is
   used everywhere, and no drawing code anywhere else is allowed to know which
   chair it is drawing for. Get this wrong and a four-phone game shows every
   player somebody else's partner across the table from them.

   ## The fan

   Thirteen cards along the bottom of a phone is about 26 pixels each if they
   do not overlap, which is unreadable and untappable. So the hand is fanned
   with overlap, and the overlap is computed from the count rather than fixed:
   with five cards they barely touch, with thirteen they are stacked to the
   corner index. The hit test walks the fan backwards — the card drawn last is
   the one on top, so it is the one your finger lands on — which is the whole
   reason a fanned hand feels right or wrong.                                */
(function (root) {
"use strict";

var Cards = {};

var SUIT = ["♣", "♦", "♥", "♠"];
var RANK = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
Cards.SUIT = SUIT;
Cards.RANK = RANK;
Cards.suit = function (c) { return (c / 13) | 0; };
Cards.rank = function (c) { return c % 13; };
Cards.red = function (c) { var s = (c / 13) | 0; return s === 1 || s === 2; };
Cards.name = function (c) { return RANK[c % 13] + SUIT[(c / 13) | 0]; };
Cards.longName = function (c) {
  var words = ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
               "jack", "queen", "king", "ace"];
  var suits = ["clubs", "diamonds", "hearts", "spades"];
  return words[c % 13] + " of " + suits[(c / 13) | 0];
};

Cards.deck = function (fromRank) {
  var d = [], s, r;
  for (s = 0; s < 4; s++) for (r = (fromRank || 0); r < 13; r++) d.push(s * 13 + r);
  return d;
};
Cards.shuffle = function (d, rnd) {
  rnd = rnd || Math.random;
  for (var i = d.length - 1; i > 0; i--) {
    var j = (rnd() * (i + 1)) | 0;
    var t = d[i]; d[i] = d[j]; d[j] = t;
  }
  return d;
};
/* sorted the way a person holds a hand: suits together, high on the left of
   each suit, and the suits alternating in colour so the boundaries are
   visible without reading anything */
var SUIT_ORDER = [3, 1, 0, 2];      /* ♠ ♦ ♣ ♥ */
Cards.tidy = function (hand) {
  return hand.slice().sort(function (a, b) {
    var sa = SUIT_ORDER.indexOf((a / 13) | 0), sb = SUIT_ORDER.indexOf((b / 13) | 0);
    if (sa !== sb) return sa - sb;
    return (b % 13) - (a % 13);
  });
};

/* ================================================================
   the table
   ================================================================ */
var L = {
  w: 0, h: 0, cw: 0, ch: 0,
  hand: [],          /* one box per card in your hand                     */
  seats: [],         /* where each *screen* position sits: 0 you, 1 left… */
  trick: []          /* where a card played from each screen position goes */
};
Cards.L = L;

/* absolute seat → screen position, with you at the bottom */
Cards.place = function (seat, mySeat, n) {
  return ((seat - mySeat) + (n || 4)) % (n || 4);
};
/* and back */
Cards.seatAt = function (spot, mySeat, n) { return (spot + mySeat) % (n || 4); };

Cards.layout = function (cv, handCount) {
  var w = cv.clientWidth, h = cv.clientHeight;
  L.w = w; L.h = h;
  /* the card size is set by the hand, because the hand is the thing you have
     to be able to read and hit; everything else follows from it */
  L.cw = Math.max(34, Math.min(w * 0.19, h * 0.13));
  L.ch = Math.round(L.cw * 1.42);

  var n = Math.max(1, handCount || 13);
  var room = w - 16;
  /* overlap only as much as necessary, and never past the corner index */
  var step = Math.min(L.cw * 0.92, Math.max(L.cw * 0.28, (room - L.cw) / Math.max(1, n - 1)));
  var span = L.cw + step * (n - 1);
  var x0 = (w - span) / 2;
  var y0 = h - L.ch - 8;
  L.hand = [];
  for (var i = 0; i < n; i++) L.hand.push({ x: x0 + i * step, y: y0, w: L.cw, h: L.ch });

  /* the other three, around the middle */
  var midY = (y0) / 2 + L.ch * 0.1;
  L.seats = [
    { x: w / 2, y: h - L.ch - 26, tag: "bottom" },
    { x: 22 + L.cw * 0.3, y: midY, tag: "left" },
    { x: w / 2, y: 34, tag: "top" },
    { x: w - 22 - L.cw * 0.3, y: midY, tag: "right" }
  ];
  /* where a played card lands: pulled in towards the middle from each seat */
  var cx = w / 2, cy = midY + L.ch * 0.15;
  var dx = Math.min(w * 0.19, L.cw * 0.95), dy = Math.min(h * 0.1, L.ch * 0.62);
  L.trick = [
    { x: cx - L.cw / 2, y: cy + dy * 0.5 },
    { x: cx - L.cw / 2 - dx, y: cy - L.ch / 2 + dy * 0.05 },
    { x: cx - L.cw / 2, y: cy - L.ch - dy * 0.1 },
    { x: cx - L.cw / 2 + dx, y: cy - L.ch / 2 + dy * 0.05 }
  ];
  return L;
};

/* which card in the fan is under this point. Backwards, because the last one
   drawn is the one on top, and the one on top is the one you meant. */
Cards.hit = function (px, py, count) {
  for (var i = Math.min(count, L.hand.length) - 1; i >= 0; i--) {
    var b = L.hand[i];
    /* every card but the last is only as wide as the amount of it showing */
    var w = (i === count - 1) ? b.w : (L.hand[i + 1].x - b.x);
    if (px >= b.x && px < b.x + w && py >= b.y && py < b.y + b.h) return i;
  }
  return -1;
};

/* ================================================================
   painting
   ================================================================ */
Cards.SKINS = {
  green: { felt: "#1d5d43", felt2: "#164a35", face: "#f7f4ec", edge: "#c9c2b0",
           back: "#2c4f8e", back2: "#182d55", red: "#c0392b", black: "#1e1e1e", ink: "#f2ece1" },
  wine:  { felt: "#5a2333", felt2: "#461a27", face: "#f7f2e6", edge: "#cbc0a8",
           back: "#7a3a24", back2: "#4a2113", red: "#c0392b", black: "#1e1e1e", ink: "#f2ece1" },
  night: { felt: "#1c2438", felt2: "#151b2b", face: "#eef1f6", edge: "#b6bcc9",
           back: "#38466a", back2: "#1f2740", red: "#d4574a", black: "#1a1a1a", ink: "#eef1f6" }
};
Cards.skin = Cards.SKINS.green;
Cards.use = function (n) { Cards.skin = Cards.SKINS[n] || Cards.SKINS.green; };

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
Cards.rr = rr;

/* one card. `o.lift` raises it (a chosen card, a card being passed);
   `o.dim` greys it (illegal this trick); `o.glow` rings it (the hint). */
Cards.card = function (g, x, y, w, h, c, o) {
  o = o || {};
  var s = Cards.skin, r = Math.max(3, w * 0.11);
  y -= (o.lift || 0);

  g.save();
  g.shadowColor = "rgba(0,0,0,.45)";
  g.shadowBlur = w * (o.lift ? 0.3 : 0.16);
  g.shadowOffsetY = w * (o.lift ? 0.11 : 0.05);
  g.fillStyle = "#000";
  rr(g, x, y, w, h, r); g.fill();
  g.restore();

  if (c < 0) {
    var bg = g.createLinearGradient(x, y, x + w, y + h);
    bg.addColorStop(0, s.back); bg.addColorStop(1, s.back2);
    g.fillStyle = bg;
    rr(g, x, y, w, h, r); g.fill();
    g.save();
    rr(g, x + w * 0.09, y + h * 0.07, w * 0.82, h * 0.86, r * 0.6);
    g.clip();
    g.strokeStyle = "rgba(255,255,255,.15)";
    g.lineWidth = Math.max(0.8, w * 0.022);
    for (var k = -h; k < w + h; k += Math.max(5, w * 0.17)) {
      g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + h, y + h); g.stroke();
      g.beginPath(); g.moveTo(x + k + h, y); g.lineTo(x + k, y + h); g.stroke();
    }
    g.restore();
    g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 1;
    rr(g, x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke();
    return;
  }

  g.fillStyle = s.face;
  rr(g, x, y, w, h, r); g.fill();
  g.strokeStyle = s.edge; g.lineWidth = 1;
  rr(g, x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke();

  var rk = c % 13, st = (c / 13) | 0;
  g.fillStyle = (st === 1 || st === 2) ? s.red : s.black;
  g.textAlign = "left"; g.textBaseline = "top";
  var idx = Math.max(10, w * 0.36);
  g.font = "800 " + Math.round(idx) + "px system-ui,-apple-system,Segoe UI,sans-serif";
  g.fillText(RANK[rk], x + w * 0.1, y + h * 0.05);
  g.font = "600 " + Math.round(idx * 0.9) + "px system-ui,sans-serif";
  g.fillText(SUIT[st], x + w * 0.1, y + h * 0.05 + idx * 1.02);

  g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "600 " + Math.round(w * 0.46) + "px system-ui,sans-serif";
  g.globalAlpha = 0.9;
  g.fillText(SUIT[st], x + w * 0.66, y + h * 0.68);
  g.globalAlpha = 1;

  if (o.dim) {
    g.fillStyle = "rgba(10,14,10,.55)";
    rr(g, x, y, w, h, r); g.fill();
  }
  if (o.glow) {
    g.strokeStyle = o.glow === true ? "rgba(62,207,142,.95)" : o.glow;
    g.lineWidth = Math.max(2, w * 0.06);
    rr(g, x - 1, y - 1, w + 2, h + 2, r); g.stroke();
  }
};

/* a stack of face-down cards, seen edge-on from another seat */
Cards.fan = function (g, x, y, n, horizontal, w, h) {
  var step = Math.max(2, (horizontal ? w : h) * 0.09);
  for (var i = 0; i < Math.min(n, 13); i++) {
    Cards.card(g, x + (horizontal ? i * step : 0), y + (horizontal ? 0 : i * step),
               w, h, -1, {});
  }
};

Cards.felt = function (g, w, h) {
  var s = Cards.skin;
  var bg = g.createRadialGradient(w * 0.5, h * 0.34, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.82);
  bg.addColorStop(0, s.felt);
  bg.addColorStop(1, s.felt2);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
};

if (typeof module !== "undefined" && module.exports) module.exports = Cards;
else root.Cards = Cards;
})(typeof self !== "undefined" ? self : this);
