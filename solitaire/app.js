/* app.js — the conductor.

   Klondike is easy to make work and hard to make *feel* right, and nearly all
   of the difference is in three places:

   **A tap is not a drag.** Tapping a card should send it somewhere sensible
   without being asked where; dragging should put it exactly where you point.
   Both start with a finger going down on the same card, so the two are told
   apart the same way the minefield tells them apart — by whether the pointer
   moved. A tap that moved four pixels is still a tap.

   **A tap has to guess well.** "Somewhere sensible" is: the foundation if it
   will go, otherwise the pile that uncovers the most, otherwise any pile at
   all — and never a move that simply puts the card back. Guessing wrong once
   is more annoying than not guessing at all, so the order is fixed and
   explainable rather than clever.

   **The end should be a cascade.** Once every card is face up the game is
   over and the remaining clicks are a formality. So it finishes itself, one
   card every eighty milliseconds, in a run up the foundations — which is the
   only reward the game has and it should be spent.                        */
(function () {
"use strict";

var $ = function (id) { return document.getElementById(id); };
function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function press(el, fn) { if (el) el.addEventListener("click", function (e) { e.preventDefault(); fn(e); }); }
function open(id) { $(id).classList.remove("hide"); }
function shut(id) { $(id).classList.add("hide"); }

var P = { draw: 1, passes: 0, skin: "green", kind: true, sound: true, played: 0, won: 0, best: 0, streak: 0 };
try {
  var raw = JSON.parse(localStorage.getItem("solitaire") || "null");
  if (raw) for (var k in P) if (raw[k] !== undefined) P[k] = raw[k];
} catch (e) {}
function save() { try { localStorage.setItem("solitaire", JSON.stringify(P)); } catch (e) {} }

var cv = $("table");
var G = null, HIST = [], UI = { carry: null, target: null, hint: null, flights: null };
var started = 0, ticking = 0, elapsed = 0, over = false, moves = 0, kindDeal = null;

/* ================================================================
   dealing
   ================================================================ */
function newGame(wantKind) {
  var go = function (g, kind) {
    G = g;
    HIST = []; over = false; moves = 0; elapsed = 0;
    kindDeal = kind;
    UI.carry = null; UI.target = null; UI.hint = null; UI.flights = null;
    started = Date.now();
    clearInterval(ticking);
    ticking = setInterval(function () {
      if (over) return;
      elapsed = Math.floor((Date.now() - started) / 1000);
      hud();
    }, 250);
    banner("", "");
    layout(); hud(); paint();
    if (kind === true) toast("This one can be won. Whether it will be is up to you.");
    else if (kind === false) toast("Couldn't find a winnable deal in the time — this one is as it fell.");
  };

  if (wantKind === undefined) wantKind = P.kind;
  if (!wantKind) { go(Core.deal(Core.shuffle(Math.random), P.draw, P.passes), null); return; }

  /* the search is a second or three of solid arithmetic, so say what is
     happening and let the browser paint before starting it */
  banner("Dealing", "looking for one you can win…");
  setTimeout(function () {
    var r = Core.kindDeal(P.draw, P.passes, { ms: 3000, nodes: 150000, tries: 8 });
    go(r.g, r.kind);
  }, 60);
}

function layout() { Gfx.layout(cv, G); }
function push() {
  HIST.push(Core.clone(G));
  if (HIST.length > 400) HIST.shift();
}

/* ================================================================
   moving
   ================================================================ */
function doMove(m, quiet) {
  push();
  G = Core.apply(G, m);
  moves++;
  layout();
  if (!quiet) beep(m.k === "up" ? "up" : "put");
  UI.hint = null;
  paint(); hud();
  checkDone();
}

/* what a tap should do with this card, in a fixed and explainable order */
function autoFor(where) {
  var card, from;
  if (where.kind === "waste") {
    if (!G.waste.length) return null;
    card = G.waste[G.waste.length - 1]; from = "w";
  } else if (where.kind === "pile") {
    var pile = G.pile[where.p];
    if (!pile.length || where.i !== pile.length - 1) return null;
    card = pile[where.i]; from = where.p;
  } else return null;

  if (Core.foundReady(G, card)) return { k: "up", from: from };
  var best = null, bestV = -1;
  for (var q = 0; q < 7; q++) {
    if (q === from) continue;
    var dst = G.pile[q].length ? G.pile[q][G.pile[q].length - 1] : undefined;
    if (!Core.fits(card, dst)) continue;
    /* uncovering something beats filling a space beats anything else */
    var v = (from !== "w" && G.down[from] > 0 && G.pile[from].length === 1) ? 30
          : dst === undefined ? 10 : 20;
    if (v > bestV) { bestV = v; best = q; }
  }
  if (best === null) return null;
  return from === "w" ? { k: "put", to: best } : { k: "move", from: from, i: where.i, to: best };
}

/* ================================================================
   the pointer
   ================================================================ */
var pt = { id: -1, x: 0, y: 0, ox: 0, oy: 0, moved: false, where: null };

cv.addEventListener("pointerdown", function (e) {
  if (over || UI.flights) return;
  cv.setPointerCapture(e.pointerId);
  var r = cv.getBoundingClientRect();
  var x = e.clientX - r.left, y = e.clientY - r.top;
  pt.id = e.pointerId; pt.x = x; pt.y = y; pt.moved = false;
  pt.where = Gfx.hit(G, x, y);
  UI.hint = null;
  if (!pt.where) return;
  if (pt.where.kind === "stock") return;

  /* pick up what could actually be carried, and remember where the finger
     grabbed it so the card does not jump under the thumb */
  var cards = null, p = pt.where.p, i = pt.where.i, at = null;
  if (pt.where.kind === "waste" && G.waste.length && i === G.waste.length - 1) {
    cards = [G.waste[i]];
    at = Gfx.wasteAt(G, i);
    pt.carryFrom = "w";
  } else if (pt.where.kind === "pile" && i >= 0 && i >= G.down[p]) {
    if (Core.runFrom(G, p, i) < 0) return;
    cards = G.pile[p].slice(i);
    at = Gfx.cardAt(G, p, i);
    pt.carryFrom = p;
  }
  if (!cards) return;
  pt.ox = x - at.x; pt.oy = y - at.y;
  UI.carry = { cards: cards, x: at.x, y: at.y, p: p, i: i, from: pt.carryFrom };
  paint();
});

cv.addEventListener("pointermove", function (e) {
  if (pt.id !== e.pointerId) return;
  var r = cv.getBoundingClientRect();
  var x = e.clientX - r.left, y = e.clientY - r.top;
  if (!pt.moved && Math.hypot(x - pt.x, y - pt.y) > 6) pt.moved = true;
  if (!pt.moved || !UI.carry) return;
  UI.carry.x = x - pt.ox;
  UI.carry.y = y - pt.oy;
  var t = Gfx.drop(G, UI.carry.x, UI.carry.y);
  UI.target = t && legalDrop(t) ? t : null;
  paint();
});

function legalDrop(t) {
  if (!UI.carry) return false;
  var card = UI.carry.cards[0];
  if (t.kind === "found") {
    return UI.carry.cards.length === 1 && Core.suit(card) === t.p && G.found[t.p] === Core.rank(card);
  }
  if (t.p === UI.carry.from) return false;
  var dst = G.pile[t.p].length ? G.pile[t.p][G.pile[t.p].length - 1] : undefined;
  return Core.fits(card, dst);
}

function endPointer(e) {
  if (pt.id !== e.pointerId) return;
  var where = pt.where, moved = pt.moved, carry = UI.carry, target = UI.target;
  pt.id = -1; pt.where = null;
  UI.carry = null; UI.target = null;

  if (!where) { paint(); return; }
  if (where.kind === "stock" && !moved) {
    if (G.stock.length) doMove({ k: "draw" });
    else if (G.waste.length && (G.passes === 0 || G.pass < G.passes)) doMove({ k: "redeal" });
    else toast("The stock is out. What's on the table is what you have.");
    return;
  }
  if (moved && carry && target) {
    if (target.kind === "found") {
      doMove(carry.from === "w" ? { k: "up", from: "w" } : { k: "up", from: carry.from });
    } else if (carry.from === "w") {
      doMove({ k: "put", to: target.p });
    } else {
      doMove({ k: "move", from: carry.from, i: carry.i, to: target.p });
    }
    return;
  }
  if (!moved) {
    var m = autoFor(where);
    if (m) { doMove(m); return; }
    if (where.kind === "found" || where.kind === "pile" || where.kind === "waste") {
      /* say nothing on an empty tap of a face-down card: it is not a mistake,
         it is somebody looking */
      if (where.kind === "pile" && where.i >= 0 && where.i < G.down[where.p]) { paint(); return; }
      toast("Nowhere for that one yet.");
    }
  }
  paint();
}
cv.addEventListener("pointerup", endPointer);
cv.addEventListener("pointercancel", endPointer);

/* ================================================================
   finishing
   ================================================================ */
function checkDone() {
  if (over) return;
  if (Core.won(G)) { win(); return; }
  if (Core.allUp(G)) cascade();
}

/* the reward: every remaining card flies home by itself */
function cascade() {
  if (over) return;
  over = true;
  clearInterval(ticking);
  UI.flights = [];
  var tick = setInterval(function () {
    var ms = Core.moves(G), up = null;
    for (var i = 0; i < ms.length; i++) if (ms[i].k === "up") { up = ms[i]; break; }
    if (!up) {
      /* nothing left to send: either it is finished or the stock still holds
         something, which the draw below deals with */
      var d = null;
      for (i = 0; i < ms.length; i++) if (ms[i].k === "draw" || ms[i].k === "redeal") { d = ms[i]; break; }
      if (d) { G = Core.apply(G, d); paint(); return; }
      clearInterval(tick);
      UI.flights = null;
      win();
      return;
    }
    G = Core.apply(G, up);
    layout();
    beep("up");
    paint();
  }, 85);
}

function win() {
  over = true;
  clearInterval(ticking);
  P.played++; P.won++; P.streak++;
  if (!P.best || elapsed < P.best) P.best = elapsed;
  save();
  banner("Out", fmt(elapsed) + " · " + moves + " moves", true);
  hud();
  fireworks();
  setTimeout(function () { showEnd(true); }, 1400);
}
function giveUp() {
  if (over) return;
  over = true;
  clearInterval(ticking);
  P.played++; P.streak = 0;
  save();
  showEnd(false);
}

/* ---------- a small celebration, drawn on the same canvas ---------- */
var spark = [];
function fireworks() {
  spark = [];
  for (var i = 0; i < 90; i++) {
    spark.push({
      x: cv.clientWidth / 2, y: cv.clientHeight * 0.4,
      vx: (Math.random() - 0.5) * 9, vy: (Math.random() - 0.9) * 9,
      life: 1, hue: Math.floor(Math.random() * 60) + 20
    });
  }
}
function sparks(ctx) {
  if (!spark.length) return;
  for (var i = spark.length - 1; i >= 0; i--) {
    var s = spark[i];
    s.x += s.vx; s.y += s.vy; s.vy += 0.28; s.life -= 0.012;
    if (s.life <= 0) { spark.splice(i, 1); continue; }
    ctx.globalAlpha = Math.max(0, s.life);
    ctx.fillStyle = "hsl(" + s.hue + ",90%,62%)";
    ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, 6.284); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ================================================================
   the chrome
   ================================================================ */
function paint() {
  if (!G) return;
  Gfx.draw(cv, G, UI);
  if (spark.length) sparks(cv.getContext("2d"));
}
(function loop() { requestAnimationFrame(loop); if (spark.length) paint(); })();

function fmt(s) {
  var m = Math.floor(s / 60), q = s % 60;
  return m + ":" + (q < 10 ? "0" : "") + q;
}
function hud() {
  $("hudTime").innerHTML = "⏱ <b>" + fmt(elapsed) + "</b>";
  $("hudMoves").innerHTML = "moves <b>" + moves + "</b>";
  $("hudScore").innerHTML = "home <b>" + Core.score(G) + "</b>/52";
  $("btnUndo").disabled = !HIST.length || over;
}
var toastT = 0;
function toast(t) {
  var el = $("toast");
  el.textContent = t; el.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(function () { el.classList.remove("on"); }, 2800);
}
function banner(big, sub, slam) {
  var el = $("banner");
  el.querySelector(".big").textContent = big || "";
  el.querySelector(".sub").textContent = sub || "";
  el.className = big ? ("on" + (slam ? " slam" : "")) : "";
}

var actx = null;
function beep(kind) {
  if (!P.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    var t = actx.currentTime;
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = "triangle";
    var hz = kind === "up" ? 660 : 300;
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(hz * (kind === "up" ? 1.5 : 0.6), t + 0.06);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + 0.11);
  } catch (e) {}
}

/* ================================================================
   the tray
   ================================================================ */
press($("btnMenu"), function () { open("ovMenu"); });
press($("btnUndo"), function () {
  if (!HIST.length || over) return;
  G = HIST.pop();
  moves = Math.max(0, moves - 1);
  layout(); UI.hint = null; paint(); hud();
});
press($("btnHint"), function () {
  if (over) return;
  var m = Core.hint(G);
  if (!m) { toast("Nothing left to do. Try Take it back, or deal again."); return; }
  UI.hint = spots(m);
  paint();
  toast(describe(m));
  setTimeout(function () { UI.hint = null; paint(); }, 3200);
});
press($("btnDeal"), function () { open("ovNew"); });

/* where the hint should glow */
function spots(m) {
  var out = [];
  if (m.k === "draw" || m.k === "redeal") { out.push(Gfx.L.stock); return out; }
  if (m.k === "up") {
    var c = m.from === "w" ? G.waste[G.waste.length - 1] : G.pile[m.from][G.pile[m.from].length - 1];
    out.push(m.from === "w" ? Gfx.wasteAt(G, G.waste.length - 1) : Gfx.cardAt(G, m.from, G.pile[m.from].length - 1));
    out.push(Gfx.L.found[Core.suit(c)]);
    return out;
  }
  if (m.k === "put") { out.push(Gfx.wasteAt(G, G.waste.length - 1)); }
  if (m.k === "move") { out.push(Gfx.cardAt(G, m.from, m.i)); }
  if (m.to !== undefined) {
    var pile = G.pile[m.to];
    out.push(pile.length ? Gfx.cardAt(G, m.to, pile.length - 1) : Gfx.L.piles[m.to]);
  }
  return out;
}
function describe(m) {
  if (m.k === "draw") return "Nothing on the table — turn the stock.";
  if (m.k === "redeal") return "Turn the waste back over and go round again.";
  if (m.k === "up") {
    var c = m.from === "w" ? G.waste[G.waste.length - 1] : G.pile[m.from][G.pile[m.from].length - 1];
    return "Send the " + Core.name(c) + " home.";
  }
  if (m.k === "put") return "Play the " + Core.name(G.waste[G.waste.length - 1]) + " from the waste.";
  var card = G.pile[m.from][m.i];
  var n = G.pile[m.from].length - m.i;
  var uncovers = G.down[m.from] > 0 && m.i === G.down[m.from];
  return "Move the " + Core.name(card) + (n > 1 ? " and the " + (n - 1) + " under it" : "") +
    (uncovers ? " — it turns a card over." : ".");
}

press($("mNew"), function () { shut("ovMenu"); open("ovNew"); });
press($("mLook"), function () { shut("ovMenu"); looks(); open("ovLook"); });
press($("mLearn"), function () { shut("ovMenu"); open("ovLearn"); });
press($("mGiveUp"), function () { shut("ovMenu"); giveUp(); });

press($("nwOne"), function () { P.draw = 1; save(); shut("ovNew"); newGame(); });
press($("nwThree"), function () { P.draw = 3; save(); shut("ovNew"); newGame(); });
press($("nwAny"), function () { shut("ovNew"); newGame(false); });
press($("nwKind"), function () { P.kind = !P.kind; save(); newSheet(); });
function newSheet() {
  $("nwKind").classList.toggle("on", P.kind);
  $("nwKind").textContent = P.kind ? "Only deals I can win ✓" : "Only deals I can win";
  $("nwOne").classList.toggle("on", P.draw === 1);
  $("nwThree").classList.toggle("on", P.draw === 3);
}

function looks() {
  var names = { green: "Green baize", wine: "Wine", night: "Night" };
  var html = "";
  for (var key in Gfx.SKINS) {
    html += "<button class='opt" + (key === P.skin ? " on" : "") + "' data-skin='" + key + "'><b>" +
      esc(names[key] || key) + "</b><small>&nbsp;</small></button>";
  }
  $("lookBody").innerHTML = "<div class='opts'>" + html + "</div>" +
    "<div class='row'><button class='btn" + (P.sound ? " on" : "") + "' id='lkSnd'>Sound</button></div>";
  Array.prototype.forEach.call($("lookBody").querySelectorAll(".opt"), function (b) {
    press(b, function () { P.skin = b.dataset.skin; Gfx.use(P.skin); save(); looks(); paint(); });
  });
  press($("lkSnd"), function () { P.sound = !P.sound; save(); looks(); });
}

function showEnd(won) {
  $("endTitle").textContent = won ? "Out" : "Given up";
  $("endLead").textContent = won
    ? fmt(elapsed) + ", " + moves + " moves."
    : (kindDeal === true
        ? "That one could have been won — the solver found a way through before it was dealt."
        : "Not every deal can be won, and this one may have been one of them.");
  $("endBody").innerHTML = "<table class='tally'>" +
    "<tr><th>Games out</th><td>" + P.won + " of " + P.played + "</td></tr>" +
    "<tr><th>Best time</th><td>" + (P.best ? fmt(P.best) : "—") + "</td></tr>" +
    "<tr><th>On the trot</th><td>" + P.streak + "</td></tr></table>";
  open("ovEnd");
}
press($("endNext"), function () { shut("ovEnd"); newGame(); });

Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
  press(b, function () { shut(b.dataset.close); });
});

press($("goPlay"), function () {
  $("splash").classList.add("gone");
  setTimeout(function () { $("splash").style.display = "none"; }, 520);
  newSheet();
  newGame();
});
press($("goLearn"), function () { open("ovLearn"); });

window.addEventListener("resize", function () { if (G) { layout(); paint(); } });
window.addEventListener("keydown", function (e) {
  if (e.key === "z" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("btnUndo").click(); }
  else if (e.key === "h") $("btnHint").click();
  else if (e.key === "n") open("ovNew");
});

(function boot() {
  Gfx.use(P.skin);
  G = Core.deal(Core.shuffle(Math.random), P.draw, P.passes);
  layout(); hud(); paint();
  newSheet();
})();

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
window.SOLITAIRE = { G: function () { return G; }, Core: Core, newGame: newGame };
})();
