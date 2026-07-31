/* gfx.js — the euchre table, painted.

   The deck, the seat geometry and the card painter come from cards.js,
   shared byte-identical with the hearts room. What is here is what euchre
   needs and hearts does not:

   **The trump has to be visible at all times.** Euchre is unplayable if you
   have to remember what trump is, and it is *doubly* unplayable if you have
   to remember that the left bower is trump. So trump is a badge in the
   middle of the table, and the hand itself is sorted with trump gathered
   first and both bowers sitting in it — the jack of clubs physically moves
   into the spade group when spades are trump. That is not a hint, it is the
   rule made visible, and it removes the one mistake every new player makes.

   **The partnership has to be visible too.** Your partner is the seat across
   from you and their tricks are your tricks, which is easy to say and easy
   to lose track of at speed. So the two partnerships are tinted — yours
   green, theirs red — on the name plates and on the trick counters.

   **The upcard is furniture.** During the bidding it sits by the dealer,
   because who has to pick it up is the whole question being asked.        */
(function (root) {
"use strict";

var Cards = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./cards.js") : root.Cards;
var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var Gfx = {};
Gfx.use = function (n) { Cards.use(n); };
Gfx.SKINS = Cards.SKINS;

Gfx.layout = function (cv, view) {
  return Cards.layout(cv, view && view.hand ? Math.max(5, view.hand.length) : 5);
};

Gfx.draw = function (cv, view, ui) {
  var dpr = Math.min(3, root.devicePixelRatio || 1);
  var w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  var g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  Cards.felt(g, w, h);
  if (!view) return;
  ui = ui || {};
  var L = Cards.L, i, spot;

  /* the three other seats */
  for (spot = 1; spot < 4; spot++) {
    var seat = Cards.seatAt(spot, view.seat);
    var p = L.seats[spot];
    var out = (seat === view.sitting);
    var n = view.counts[seat];
    var cw = L.cw * 0.46, ch = L.ch * 0.46;
    var horiz = (spot === 2);
    var show = out ? 0 : Math.min(n, 5);
    var stepx = horiz ? cw * 0.4 : 0, stepy = horiz ? 0 : ch * 0.3;
    var bx = p.x - (horiz ? (cw + stepx * Math.max(0, show - 1)) / 2 : cw / 2);
    var by = p.y - (horiz ? ch / 2 : (ch + stepy * Math.max(0, show - 1)) / 2);
    for (i = 0; i < show; i++) Cards.card(g, bx + i * stepx, by + i * stepy, cw, ch, -1, {});
    if (out) {
      /* the partner sitting out a lone hand: their cards are face down and
         out of play, and saying so beats an empty space */
      g.save();
      g.globalAlpha = 0.4;
      Cards.card(g, bx, by, cw, ch, -1, {});
      g.restore();
    }

    plate(g, p.x, by + (horiz ? ch + 8 : ch + stepy * Math.max(0, show - 1) + 8),
      ui.names ? ui.names[seat] : ("Seat " + (seat + 1)),
      out ? "sitting out" : (seat === view.dealer ? "deals" : ""),
      Rules.TEAM[seat] === view.team,
      view.turn === seat, ui.thinking === seat, ui.away && ui.away[seat],
      seat === view.maker ? trumpMark(view) : "");
  }

  /* ---------- the middle ---------- */
  if (view.phase === "play" || view.phase === "done") {
    for (i = 0; i < view.trick.length; i++) {
      var t = view.trick[i];
      var sp = Cards.place(t.seat, view.seat);
      var slot = L.trick[sp];
      Cards.card(g, slot.x, slot.y, L.cw, L.ch, t.card, {});
    }
    badge(g, L.w / 2, L.seats[2].y + L.ch * 0.72, view);
  } else {
    /* the bidding: the upcard, by the dealer, because who picks it up is
       the whole question */
    var d = Cards.place(view.dealer, view.seat);
    var dp = L.trick[d];
    var mid = L.trick[0];
    var ux = (dp.x + mid.x) / 2, uy = (dp.y + mid.y) / 2;
    if (!view.turned) {
      Cards.card(g, ux, uy, L.cw, L.ch, view.up, { glow: "rgba(255,215,122,.9)" });
      label(g, ux + L.cw / 2, uy + L.ch + 6, "turned up");
    } else {
      g.save();
      g.globalAlpha = 0.4;
      Cards.card(g, ux, uy, L.cw, L.ch, view.up, {});
      g.restore();
      label(g, ux + L.cw / 2, uy + L.ch + 6, "turned down — " + Cards.SUIT[Cards.suit(view.up)] + " is barred");
    }
  }
  if (ui.sweep) {
    for (i = 0; i < ui.sweep.cards.length; i++) {
      var sc = ui.sweep.cards[i];
      var from = L.trick[Cards.place(sc.seat, view.seat)];
      var to = L.seats[Cards.place(ui.sweep.seat, view.seat)];
      var k = ui.sweep.t, e = k * k * (3 - 2 * k);
      Cards.card(g, from.x + (to.x - L.cw / 2 - from.x) * e,
                    from.y + (to.y - L.ch / 2 - from.y) * e,
                    L.cw * (1 - e * 0.5), L.ch * (1 - e * 0.5), sc.card, {});
    }
  }

  /* ---------- your hand ---------- */
  var hand = view.hand;
  var legal = {};
  if (view.legal) for (i = 0; i < view.legal.length; i++) legal[view.legal[i]] = 1;
  var picking = (view.phase === "play" && view.turn === view.seat) || view.canDiscard;
  for (i = 0; i < hand.length; i++) {
    var box = L.hand[i];
    if (!box) continue;
    if (ui.flying && ui.flying.card === hand[i]) continue;
    var c = hand[i];
    var isTrump = view.trump >= 0 && Rules.suitOf(c, view.trump) === view.trump;
    Cards.card(g, box.x, box.y, L.cw, L.ch, c, {
      lift: (ui.over === i && picking) ? L.ch * 0.08 : 0,
      dim: view.phase === "play" && view.turn === view.seat && !legal[c],
      glow: ui.hint === c ? true : (isTrump && ui.markTrump ? "rgba(255,215,122,.55)" : null)
    });
  }
  if (ui.flying) {
    var f = ui.flying, kk = f.t, ee = kk * kk * (3 - 2 * kk);
    Cards.card(g, f.x0 + (f.x1 - f.x0) * ee, f.y0 + (f.y1 - f.y0) * ee, L.cw, L.ch, f.card, {});
  }

  plate(g, L.w / 2, L.h - 6, ui.names ? ui.names[view.seat] : "You",
        view.seat === view.dealer ? "you deal" : "", true,
        view.turn === view.seat, false, false,
        view.seat === view.maker ? trumpMark(view) : "", true);
};

function trumpMark(view) { return view.trump >= 0 ? Cards.SUIT[view.trump] : "★"; }

/* the badge in the middle: what trump is, who called it, and the tricks */
function badge(g, cx, y, view) {
  var fs = Math.max(12, Cards.L.cw * 0.24);
  var tx = view.trump >= 0 ? Cards.SUIT[view.trump] : "?";
  var red = view.trump === 1 || view.trump === 2;
  var txt = "  " + view.won[view.team] + " – " + view.won[1 - view.team];
  g.font = "800 " + Math.round(fs) + "px system-ui,-apple-system,Segoe UI,sans-serif";
  var wid = g.measureText("trump " + tx + txt).width + 22;
  var hgt = fs * 1.7;
  g.fillStyle = "rgba(0,0,0,.5)";
  Cards.rr(g, cx - wid / 2, y, wid, hgt, hgt / 2);
  g.fill();
  g.textAlign = "left"; g.textBaseline = "middle";
  g.fillStyle = "rgba(255,255,255,.7)";
  g.font = "600 " + Math.round(fs * 0.8) + "px system-ui,sans-serif";
  var x = cx - wid / 2 + 11;
  g.fillText("trump ", x, y + hgt / 2);
  x += g.measureText("trump ").width;
  g.fillStyle = red ? "#e8756a" : "#f2ece1";
  g.font = "800 " + Math.round(fs * 1.15) + "px system-ui,sans-serif";
  g.fillText(tx, x, y + hgt / 2);
  x += g.measureText(tx).width;
  g.fillStyle = "#ffd77a";
  g.font = "800 " + Math.round(fs) + "px system-ui,sans-serif";
  g.fillText(txt, x, y + hgt / 2);
}

function label(g, cx, y, text) {
  g.textAlign = "center"; g.textBaseline = "top";
  g.font = "600 " + Math.round(Math.max(10, Cards.L.cw * 0.17)) + "px system-ui,sans-serif";
  g.fillStyle = "rgba(255,255,255,.6)";
  g.fillText(text, cx, y);
}

function plate(g, cx, y, name, sub, ours, turn, thinking, away, mark, tiny) {
  var s = Cards.skin;
  g.textAlign = "center"; g.textBaseline = "top";
  var fs = Math.max(11, Cards.L.cw * 0.19);
  var txt = name + (sub ? "  ·  " + sub : "") + (mark ? "  " + mark : "");
  g.font = "700 " + Math.round(fs) + "px system-ui,-apple-system,Segoe UI,sans-serif";
  var wid = g.measureText(txt).width + 14;
  var hgt = fs * 1.6;
  /* clamped inside the canvas — see the hearts room's note */
  var x = Math.max(2, Math.min(Cards.L.w - wid - 2, cx - wid / 2));
  cx = x + wid / 2;
  if (tiny) y -= hgt;

  g.fillStyle = away ? "rgba(0,0,0,.55)" : (ours ? "rgba(20,60,42,.68)" : "rgba(62,22,20,.68)");
  Cards.rr(g, x, y, wid, hgt, hgt / 2);
  g.fill();
  g.strokeStyle = ours ? "rgba(62,207,142,.55)" : "rgba(224,106,82,.5)";
  g.lineWidth = 1;
  Cards.rr(g, x, y, wid, hgt, hgt / 2);
  g.stroke();
  if (turn || thinking) {
    g.strokeStyle = thinking ? "rgba(240,168,60,.95)" : "rgba(62,207,142,.95)";
    g.lineWidth = 2.2;
    Cards.rr(g, x, y, wid, hgt, hgt / 2);
    g.stroke();
  }
  g.fillStyle = away ? "rgba(255,255,255,.45)" : s.ink;
  g.fillText(txt, cx, y + hgt * 0.22);
}

if (typeof module !== "undefined" && module.exports) module.exports = Gfx;
else root.Gfx = Gfx;
})(typeof self !== "undefined" ? self : this);
