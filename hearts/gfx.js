/* gfx.js — the hearts table, painted.

   All the card drawing and the seat geometry live in cards.js, shared with
   the euchre room. What is here is what only hearts needs: the three other
   seats with their names and running points, the trick in the middle, the
   passing tray, and the one piece of furniture this game genuinely wants —
   **the points showing on the table**.

   That last one deserves a note. Hearts is a game of arithmetic done in your
   head, and every implementation has to decide how much of that to do for
   you. Doing all of it makes the game trivial; doing none of it makes it a
   memory test rather than a card game. The line drawn here is the same one
   the domino room draws: **anything the table said out loud is on the
   screen; anything you would have to have worked out is not.** So each
   seat's points-so-far is shown, because everybody watched those tricks get
   taken. Which hearts are still out is not shown, because working that out
   is the game.                                                             */
(function (root) {
"use strict";

var Cards = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./cards.js") : root.Cards;

var Gfx = {};
Gfx.use = function (n) { Cards.use(n); };
Gfx.SKINS = Cards.SKINS;

Gfx.layout = function (cv, view) {
  return Cards.layout(cv, view && view.hand ? view.hand.length : 13);
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
  var L = Cards.L, i;

  /* ---------- the other three ----------
     Drawn as a fan of backs with a name plate under it. The count is shown
     as actual cards up to a point and as a number past it, because eleven
     tiny rectangles is not more informative than "11". */
  for (var spot = 1; spot < 4; spot++) {
    var seat = Cards.seatAt(spot, view.seat);
    var p = L.seats[spot];
    var n = view.counts[seat];
    var cw = L.cw * 0.44, ch = L.ch * 0.44;
    var horiz = (spot === 2);
    var show = Math.min(n, horiz ? 8 : 5);
    var stepx = horiz ? cw * 0.42 : 0, stepy = horiz ? 0 : ch * 0.3;
    var bx = p.x - (horiz ? (cw + stepx * (show - 1)) / 2 : cw / 2);
    var by = p.y - (horiz ? ch / 2 : (ch + stepy * (show - 1)) / 2);
    for (i = 0; i < show; i++) {
      Cards.card(g, bx + i * stepx, by + i * stepy, cw, ch, -1, {});
    }
    plate(g, p.x, by + (horiz ? ch + 8 : ch + stepy * (show - 1) + 8),
          ui.names ? ui.names[seat] : ("Seat " + (seat + 1)),
          n + (n === 1 ? " card" : " cards"),
          view.taken ? view.taken[seat] : 0,
          view.turn === seat, ui.thinking === seat, ui.away && ui.away[seat],
          ui.passReady && !ui.passReady[seat]);
  }

  /* ---------- the trick ---------- */
  for (i = 0; i < view.trick.length; i++) {
    var t = view.trick[i];
    var sp = Cards.place(t.seat, view.seat);
    var slot = L.trick[sp];
    var lift = (ui.winner !== undefined && ui.winner === t.seat) ? L.ch * 0.06 : 0;
    Cards.card(g, slot.x, slot.y - lift, L.cw, L.ch, t.card,
               { glow: (ui.winner !== undefined && ui.winner === t.seat) ? "rgba(255,215,122,.95)" : null });
  }
  /* the trick just won, sliding to whoever took it */
  if (ui.sweep) {
    for (i = 0; i < ui.sweep.cards.length; i++) {
      var sc = ui.sweep.cards[i];
      var from = L.trick[Cards.place(sc.seat, view.seat)];
      var to = L.seats[Cards.place(ui.sweep.seat, view.seat)];
      var k = ui.sweep.t;
      var e = k * k * (3 - 2 * k);
      Cards.card(g, from.x + (to.x - L.cw / 2 - from.x) * e,
                    from.y + (to.y - L.ch / 2 - from.y) * e,
                    L.cw * (1 - e * 0.5), L.ch * (1 - e * 0.5), sc.card, {});
    }
  }

  /* ---------- your hand ---------- */
  var hand = ui.hand || view.hand;
  var legal = {}, chosen = {};
  if (view.legal) for (i = 0; i < view.legal.length; i++) legal[view.legal[i]] = 1;
  if (ui.chosen) for (i = 0; i < ui.chosen.length; i++) chosen[ui.chosen[i]] = 1;
  var yours = (view.turn === view.seat && view.phase === "play");
  for (i = 0; i < hand.length; i++) {
    var box = L.hand[i];
    if (!box) continue;
    if (ui.flying && ui.flying.i === i) continue;
    var c = hand[i];
    var dim = view.phase === "play" && yours && !legal[c];
    var lift = chosen[c] ? L.ch * 0.16 : (ui.over === i && (yours || view.phase === "pass") ? L.ch * 0.07 : 0);
    Cards.card(g, box.x, box.y, L.cw, L.ch, c, {
      lift: lift,
      dim: dim,
      glow: ui.hint === c ? true : (chosen[c] ? "rgba(255,215,122,.95)" : null)
    });
  }
  /* the card on its way to the middle */
  if (ui.flying) {
    var f = ui.flying, kk = f.t, ee = kk * kk * (3 - 2 * kk);
    Cards.card(g, f.x0 + (f.x1 - f.x0) * ee, f.y0 + (f.y1 - f.y0) * ee, L.cw, L.ch, f.card, {});
  }

  /* your own name plate, under the fan's left end */
  plate(g, L.w / 2, L.h - 6, ui.names ? ui.names[view.seat] : "You", "",
        view.taken ? view.taken[view.seat] : 0, view.turn === view.seat, false, false, false, true);
};

/* a seat's plate: who, how many cards, and what they have taken so far */
function plate(g, cx, y, name, sub, points, turn, thinking, away, waiting, tiny) {
  var s = Cards.skin;
  g.textAlign = "center";
  g.textBaseline = "top";
  var pad = 6, fs = Math.max(11, Cards.L.cw * 0.2);
  var txt = name + (sub ? "  ·  " + sub : "");
  g.font = "700 " + Math.round(fs) + "px system-ui,-apple-system,Segoe UI,sans-serif";
  var wid = g.measureText(txt).width + pad * 2 + (points ? fs * 2.2 : 0);
  var hgt = fs * 1.6;
  /* clamped inside the canvas: a plate centred on a seat near the edge runs
     off it, and a name you can only read half of is worse than no name */
  var x = Math.max(2, Math.min(Cards.L.w - wid - 2, cx - wid / 2));
  cx = x + wid / 2;
  if (tiny) y -= hgt;

  g.fillStyle = away ? "rgba(0,0,0,.55)" : "rgba(0,0,0,.42)";
  Cards.rr(g, x, y, wid, hgt, hgt / 2);
  g.fill();
  if (turn || thinking || waiting) {
    g.strokeStyle = thinking || waiting ? "rgba(240,168,60,.95)" : "rgba(62,207,142,.95)";
    g.lineWidth = 2;
    Cards.rr(g, x, y, wid, hgt, hgt / 2);
    g.stroke();
  }
  g.fillStyle = away ? "rgba(255,255,255,.45)" : s.ink;
  g.fillText(txt, cx - (points ? fs * 1.1 : 0), y + hgt * 0.22);
  if (points) {
    g.fillStyle = "#ffd77a";
    g.fillText(String(points), cx + wid / 2 - pad - fs * 0.7, y + hgt * 0.22);
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = Gfx;
else root.Gfx = Gfx;
})(typeof self !== "undefined" ? self : this);
