/* app.js — the conductor.

   The same shape as the hearts table next door: the host holds the truth,
   every device draws a view of it, and the solo game is the four-phone game
   with three seats empty.

   What is particular here is the **bidding**, which is the only place on this
   site where the interface has to ask a question rather than accept a tap on
   a thing. It is drawn as buttons in the tray rather than as a sheet over the
   table, for one reason: you have to be able to see your hand while you
   answer. A modal that covers the cards while asking "do you want spades?" is
   asking you to remember your own hand, which is exactly the mistake this
   room is meant not to make.                                               */
(function () {
"use strict";

Table.configure({
  game: "euchre", seats: 4, label: "table",
  roomName: "A euchre table",
  hostWord: "Be the table", joinWord: "Sit down at one",
  lead: "One phone is the table — it deals and it keeps the score. The other three sit down at it by typing four letters. Your partner is the seat across from you.",
  bots: ["You", "Nan", "Otto", "Pearl"],
  seatWord: function (n) { return n === 1 ? "1 seated" : n + " seated"; }
});
Table.toast = toast;

var $ = function (id) { return document.getElementById(id); };
function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function press(el, fn) { if (el) el.addEventListener("click", function (e) { e.preventDefault(); fn(e); }); }
function open(id) { $(id).classList.remove("hide"); }
function shut(id) { $(id).classList.add("hide"); }

var P = { tier: "steady", skin: "green", pace: "relaxed", sound: true,
          target: 10, stick: true, alone: true, played: 0, won: 0 };
try {
  var raw = JSON.parse(localStorage.getItem("euchre") || "null");
  if (raw) for (var k in P) if (raw[k] !== undefined) P[k] = raw[k];
} catch (e) {}
function save() { try { localStorage.setItem("euchre", JSON.stringify(P)); } catch (e) {} }

var PACE = { quick: 260, brisk: 520, relaxed: 880 };
function beat(m) { return (PACE[P.pace] || PACE.relaxed) * (m === undefined ? 1 : m); }

var G = {
  st: null, view: null, mode: "solo", mySeat: 0,
  dealer: 0, scores: [0, 0], ended: null,
  over: -1, hint: -1, anim: null, sweep: null, thinking: -1
};
var cv = $("table");
function opts() { return { target: P.target, stick: P.stick, alone: P.alone }; }

/* ================================================================
   the truth
   ================================================================ */
function newMatch() {
  G.dealer = 0; G.scores = [0, 0]; G.ended = null;
  newHand();
}
function newHand() {
  G.st = Rules.deal(G.dealer, Math.random, opts());
  G.st.scores = G.scores.slice();
  G.hint = -1; G.sweep = null; G.anim = null; G.thinking = -1;
  publish();
  banner(Table.nameOf(G.dealer) + " deals", Cards.name(G.st.up) + " is turned up");
  setTimeout(step, beat(0.9));
}
function publish() {
  if (G.mode === "guest") return;
  G.view = Rules.publicView(G.st, G.mySeat);
  if (G.mode === "host") Table.deal();
  layout(); paint(); hud();
}
Table.viewFor = function (seat) { return Rules.publicView(G.st, seat); };
function humanSeat(seat) { return G.mode === "solo" ? seat === 0 : Table.isHuman(seat); }

/* ---------- taking a turn ---------- */
var thinkT = 0;
function step() {
  if (G.mode === "guest" || !G.st) return;
  var st = G.st;
  if (st.phase === "done") { finishHand(); return; }
  if (st.phase === "throw") {
    banner("Thrown in", "nobody wanted it");
    G.dealer = (G.dealer + 1) % 4;
    setTimeout(newHand, beat(1.2));
    return;
  }
  if (st.turn < 0) return;
  if (humanSeat(st.turn)) { G.thinking = -1; publish(); return; }
  houseTurn();
}
function houseTurn() {
  if (G.thinking >= 0) return;
  var seat = G.st.turn;
  G.thinking = seat;
  publish();
  clearTimeout(thinkT);
  var mark = G.st.bids.length + "/" + G.st.log.length + "/" + G.st.phase;
  thinkT = setTimeout(function () {
    if (!G.st || (G.st.bids.length + "/" + G.st.log.length + "/" + G.st.phase) !== mark) { G.thinking = -1; return; }
    G.thinking = -1;
    var st = G.st;
    if (st.phase === "bid1" || st.phase === "bid2") {
      var b = AI.bid(st, seat, P.tier) || { k: "pass" };
      doBid(seat, b);
    } else if (st.phase === "discard") {
      doDiscard(seat, AI.discard(st, seat, P.tier));
    } else if (st.phase === "play") {
      var p = AI.choose(st, seat, P.tier);
      if (p) commit(seat, p.card);
    }
  }, beat(0.5) + Math.random() * beat(0.3));
}

function doBid(seat, b) {
  var next = Rules.bid(G.st, seat, b);
  if (!next) { next = Rules.bid(G.st, seat, { k: "pass" }); if (!next) return; b = { k: "pass" }; }
  var wasPhase = G.st.phase;
  G.st = next;
  say(Table.nameOf(seat) + ": " + bidWords(b, G.st), seat === G.mySeat ? "us" : "them");
  beep("bid");
  if (G.st.trump >= 0 && wasPhase !== "discard") {
    banner(Rules.suitName(G.st.trump) + (G.st.alone ? ", alone" : ""),
           Table.nameOf(G.st.maker) + " calls it", true);
  }
  publish();
  setTimeout(step, beat(0.35));
}
function bidWords(b, st) {
  if (b.k === "pass") return "pass";
  if (b.k === "order") return (b.alone ? "alone in " : "") + Rules.suitName(Cards.suit(st.up)) +
    (st.dealer === st.maker ? " — picks it up" : " — orders it up");
  return (b.alone ? "alone in " : "") + Rules.suitName(b.suit);
}
function doDiscard(seat, card) {
  var next = Rules.discard(G.st, seat, card);
  if (!next) return;
  G.st = next;
  say(Table.nameOf(seat) + " takes it up and discards.", "them");
  publish();
  setTimeout(step, beat(0.4));
}

function commit(seat, card) {
  var next = Rules.play(G.st, seat, card);
  if (!next) return false;
  var spot = Cards.place(seat, G.mySeat);
  var from = (seat === G.mySeat) ? handBoxOf(card) : Cards.L.seats[spot];
  var to = Cards.L.trick[spot];
  G.st = next;
  beep("play");
  G.anim = { t: 0, dur: beat(0.26), card: card, x0: from.x, y0: from.y, x1: to.x, y1: to.y };
  publish();

  if (G.st.won2) {
    var won = G.st.won2;
    G.st.won2 = null;
    setTimeout(function () {
      G.sweep = { t: 0, dur: beat(0.45), seat: won.seat, cards: won.cards };
      say(Table.nameOf(won.seat) + " takes it — " + Cards.name(topOf(won.cards)) +
          (Rules.TEAM[won.seat] === Rules.TEAM[G.mySeat] ? " (yours)" : ""),
          Rules.TEAM[won.seat] === Rules.TEAM[G.mySeat] ? "us" : "them");
      beep("sweep");
      setTimeout(function () { G.sweep = null; publish(); step(); }, beat(0.45));
    }, beat(0.7));
  } else {
    setTimeout(step, beat(0.16));
  }
  return true;
}
function topOf(cards) {
  var w = AI.winnerOf(cards, G.st.trump);
  for (var i = 0; i < cards.length; i++) if (cards[i].seat === w.seat) return cards[i].card;
  return cards[0].card;
}
function handBoxOf(card) {
  var i = G.view.hand.indexOf(card);
  return (i >= 0 && Cards.L.hand[i]) ? Cards.L.hand[i] : { x: Cards.L.w / 2, y: Cards.L.h };
}

function finishHand() {
  var t = Rules.tally(G.st);
  G.scores[t.team] += t.points;
  publish();
  var over = Rules.matchOver(G.scores, opts());
  if (over) {
    G.ended = over;
    if (G.mode === "solo") { P.played++; if (over.winner === Rules.TEAM[G.mySeat]) P.won++; save(); }
  }
  if (t.euchred) { banner("Euchred", Table.nameOf(G.st.maker) + " came up short", true); beep("euchre"); }
  else if (t.points >= 2) { banner(t.points === 4 ? "Alone, all five" : "A march", t.why, true); beep("march"); }
  if (G.mode === "host") Table.broadcast({ k: "hand", tally: t, scores: G.scores, over: over });
  G.dealer = (G.dealer + 1) % 4;
  setTimeout(function () { showHandEnd(t, over); }, beat(1.3));
}

/* ================================================================
   the frame
   ================================================================ */
var lastFrame = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  var dt = lastFrame ? Math.min(64, ts - lastFrame) : 16;
  lastFrame = ts;
  var dirty = false;
  if (G.anim) { G.anim.t += dt / G.anim.dur; if (G.anim.t >= 1) G.anim = null; dirty = true; }
  if (G.sweep) { G.sweep.t = Math.min(1, G.sweep.t + dt / G.sweep.dur); dirty = true; }
  if (dirty) paint();
}
function layout() { if (G.view) Gfx.layout(cv, G.view); }
function paint() {
  if (!G.view) return;
  var ui = {
    names: [Table.nameOf(0), Table.nameOf(1), Table.nameOf(2), Table.nameOf(3)],
    over: G.over, hint: G.hint, thinking: G.thinking, markTrump: true,
    away: [false, false, false, false]
  };
  if (G.mode !== "solo") for (var s = 0; s < 4; s++) ui.away[s] = !Table.isHuman(s);
  if (G.anim) ui.flying = { t: G.anim.t, card: G.anim.card, x0: G.anim.x0, y0: G.anim.y0, x1: G.anim.x1, y1: G.anim.y1 };
  if (G.sweep) ui.sweep = { t: G.sweep.t, seat: G.sweep.seat, cards: G.sweep.cards };
  Gfx.draw(cv, G.view, ui);
}

/* ================================================================
   touching the table
   ================================================================ */
cv.addEventListener("pointerdown", function (e) {
  if (!G.view) return;
  var r = cv.getBoundingClientRect();
  var i = Cards.hit(e.clientX - r.left, e.clientY - r.top, G.view.hand.length);
  if (i < 0) return;
  var card = G.view.hand[i];
  G.hint = -1;

  if (G.view.canDiscard) { sendDiscard(card); return; }
  if (G.view.phase !== "play") { toast("Nothing to play yet — the bidding is still going round."); return; }
  if (G.view.turn !== G.view.seat) { toast("Not your turn."); return; }
  if (G.view.legal.indexOf(card) < 0) { whyNot(card); return; }
  sendPlay(card);
});
cv.addEventListener("pointermove", function (e) {
  if (!G.view) return;
  var r = cv.getBoundingClientRect();
  var i = Cards.hit(e.clientX - r.left, e.clientY - r.top, G.view.hand.length);
  if (i !== G.over) { G.over = i; paint(); }
});
cv.addEventListener("pointerleave", function () { G.over = -1; paint(); });

function whyNot(card) {
  var v = G.view;
  if (!v.trick.length) return;
  var led = Rules.suitOf(v.trick[0].card, v.trump);
  var mine = Rules.suitOf(card, v.trump);
  if (mine !== led) {
    if (led === v.trump && Rules.isBower(card, v.trump)) {
      toast("You have to follow trump — and that jack is trump.");
    } else if (Cards.suit(card) === led && mine === v.trump) {
      toast("That jack is trump now, not " + Cards.SUIT[led] + ". You still have to follow " + Cards.SUIT[led] + ".");
    } else {
      toast("You have to follow " + Cards.SUIT[led] + " while you still can.");
    }
  }
}
function sendPlay(card) {
  if (G.mode === "guest") { Table.send({ k: "play", card: card }); say("sent…", "us"); return; }
  commit(G.mySeat, card);
}
function sendDiscard(card) {
  if (G.mode === "guest") { Table.send({ k: "discard", card: card }); return; }
  doDiscard(G.mySeat, card);
}
function sendBid(b) {
  if (G.mode === "guest") { Table.send({ k: "bid", bid: b }); return; }
  doBid(G.mySeat, b);
}

/* ================================================================
   the bidding tray
   ================================================================ */
function bidTray() {
  var v = G.view, box = $("bidBar");
  if (!v || (v.phase !== "bid1" && v.phase !== "bid2") || v.turn !== v.seat || !v.bidOptions.length) {
    box.classList.add("hide");
    return;
  }
  var html = "", i;
  if (v.phase === "bid1") {
    var s = Cards.suit(v.up);
    var word = v.dealer === v.seat ? "Pick it up" : "Order it up";
    html += "<button class='btn primary' data-b='order'>" + word + " · " + Cards.SUIT[s] + "</button>";
    if (v.opts.alone) html += "<button class='btn' data-b='alone'>Alone · " + Cards.SUIT[s] + "</button>";
    html += "<button class='btn' data-b='pass'>Pass</button>";
  } else {
    for (i = 0; i < 4; i++) {
      if (i === Cards.suit(v.up)) continue;
      html += "<button class='btn suit" + (i === 1 || i === 2 ? " red" : "") + "' data-call='" + i + "'>" + Cards.SUIT[i] + "</button>";
    }
    if (v.opts.alone) html += "<button class='btn' id='bidAlone'>Alone</button>";
    var must = v.opts.stick && v.seat === v.dealer;
    html += must ? "<button class='btn' disabled title='stuck'>Must call</button>"
                 : "<button class='btn' data-b='pass'>Pass</button>";
  }
  box.innerHTML = html;
  box.classList.remove("hide");
  var alone = false;
  var aloneBtn = $("bidAlone");
  if (aloneBtn) press(aloneBtn, function () {
    alone = !alone;
    aloneBtn.classList.toggle("on", alone);
    toast(alone ? "Next suit you tap, you play it without your partner." : "Alone off.");
  });
  Array.prototype.forEach.call(box.querySelectorAll("[data-b]"), function (b) {
    press(b, function () {
      var k = b.dataset.b;
      if (k === "pass") sendBid({ k: "pass" });
      else if (k === "order") sendBid({ k: "order" });
      else sendBid({ k: "order", alone: true });
    });
  });
  Array.prototype.forEach.call(box.querySelectorAll("[data-call]"), function (b) {
    press(b, function () { sendBid({ k: "call", suit: parseInt(b.dataset.call, 10), alone: alone }); });
  });
}

/* ================================================================
   the chrome
   ================================================================ */
function hud() {
  var v = G.view;
  if (!v) return;
  var us = v.team, them = 1 - v.team;
  var sc = v.scores || G.scores;
  $("rail").innerHTML =
    "<div class='score" + (sc[us] >= sc[them] ? " lead" : "") + "'>Us <b>" + sc[us] + "</b></div>" +
    "<div class='score'>" + (v.phase === "play" ? "tricks " + v.won[us] + " – " + v.won[them] : phaseWord(v)) + "</div>" +
    "<div class='score" + (sc[them] > sc[us] ? " lead" : "") + "'>Them <b>" + sc[them] + "</b></div>";
  $("btnHint").disabled = !(v.phase === "play" && v.turn === v.seat) || G.mode === "guest";
  bidTray();
  if (v.canDiscard) say("Tap a card to put it back under.", "us");
}
function phaseWord(v) {
  if (v.phase === "bid1") return "round one";
  if (v.phase === "bid2") return "round two";
  if (v.phase === "discard") return "dealer discards";
  return "&nbsp;";
}
function say(t, cls) { var el = $("say"); el.className = cls || ""; el.textContent = t || ""; }
var toastT = 0;
function toast(t) {
  var el = $("toast");
  el.textContent = t; el.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(function () { el.classList.remove("on"); }, 3000);
}
function banner(big, sub, slam) {
  var el = $("banner");
  el.querySelector(".big").textContent = big || "";
  el.querySelector(".sub").textContent = sub || "";
  el.className = big ? ("on" + (slam ? " slam" : "")) : "";
  if (big) setTimeout(function () { if (el.querySelector(".big").textContent === big) el.className = ""; }, 2400);
}

var actx = null;
function beep(kind) {
  if (!P.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    var t = actx.currentTime;
    if (kind === "march" || kind === "euchre") {
      var notes = kind === "march" ? [523, 659, 784] : [392, 330, 262];
      notes.forEach(function (hz, i) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(hz, t + i * 0.11);
        g.gain.setValueAtTime(0.07, t + i * 0.11);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.11 + 0.28);
        o.connect(g); g.connect(actx.destination);
        o.start(t + i * 0.11); o.stop(t + i * 0.11 + 0.3);
      });
      return;
    }
    var o2 = actx.createOscillator(), g2 = actx.createGain();
    o2.type = kind === "bid" ? "sine" : "triangle";
    var hz2 = kind === "sweep" ? 300 : kind === "bid" ? 560 : 470;
    o2.frequency.setValueAtTime(hz2, t);
    o2.frequency.exponentialRampToValueAtTime(hz2 * 0.62, t + 0.07);
    g2.gain.setValueAtTime(0.045, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o2.connect(g2); g2.connect(actx.destination);
    o2.start(t); o2.stop(t + 0.11);
  } catch (e) {}
}

/* ================================================================
   the tray
   ================================================================ */
press($("btnMenu"), function () { menu(); open("ovMenu"); });
press($("btnHint"), function () {
  var v = G.view;
  if (!v || v.phase !== "play" || v.turn !== v.seat || G.mode === "guest") return;
  var pick = AI.choose(G.st, G.mySeat, "sharp");
  if (!pick) return;
  G.hint = pick.card;
  paint();
  var h = Coach.hint(pick, G.st, G.mySeat);
  $("coachSay").textContent = h.say;
  $("coachWhy").textContent = h.why;
  $("coach").classList.remove("off");
});
press($("coachClose"), function () { $("coach").classList.add("off"); G.hint = -1; paint(); });

function menu() {
  $("menuState").textContent =
    G.mode === "solo" ? "You and " + Table.nameOf(2) + " against " + Table.nameOf(1) + " and " + Table.nameOf(3) + ", playing " + AI.tier(P.tier).name + "."
    : G.mode === "host" ? "You are the table." : "Sat down at " + (Table.names[0] || "a table") + ".";
}
press($("mNew"), function () { shut("ovMenu"); newMatch(); });
press($("mLevel"), function () { shut("ovMenu"); levels(); open("ovLevel"); });
press($("mRules"), function () { shut("ovMenu"); houseRules(); open("ovHouse"); });
press($("mTogether"), function () { shut("ovMenu"); Table.open(); open("ovTogether"); });
press($("mLook"), function () { shut("ovMenu"); looks(); open("ovLook"); });
press($("mLearn"), function () { shut("ovMenu"); open("ovLearn"); });

function levels() {
  var html = "";
  for (var i = 0; i < AI.TIERS.length; i++) {
    var t = AI.TIERS[i];
    html += "<button class='opt" + (t.key === P.tier ? " on" : "") + "' data-tier='" + t.key + "'><b>" +
      esc(t.name) + "</b><small>" + esc(t.blurb) + "</small></button>";
  }
  $("levelBody").innerHTML = "<div class='opts'>" + html + "</div>" +
    "<p class='note'>Your partner plays at the same level you set here — which matters more in euchre than anywhere else on this site, because half of your tricks are theirs.</p>";
  Array.prototype.forEach.call($("levelBody").querySelectorAll(".opt"), function (b) {
    press(b, function () { P.tier = b.dataset.tier; save(); levels(); toast(AI.tier(P.tier).name + " it is."); });
  });
}
function houseRules() {
  $("houseBody").innerHTML =
    "<div class='fld'><label><b>Play to</b></label><div class='opts'>" +
      opt("hr10", P.target === 10, "10", "The usual.") +
      opt("hr5", P.target === 5, "5", "A quick one.") +
    "</div></div>" +
    "<div class='fld'><label><b>If everybody passes twice</b></label><div class='opts'>" +
      opt("hrS1", P.stick, "Stick the dealer", "The dealer has to name something. Makes a much better game — nobody gets to sit out a hand.") +
      opt("hrS0", !P.stick, "Throw it in", "Redeal and start again.") +
    "</div></div>" +
    "<div class='fld'><label><b>Going alone</b></label><div class='opts'>" +
      opt("hrA1", P.alone, "Allowed", "All five alone is four points — the only way to score four.") +
      opt("hrA0", !P.alone, "Not allowed", "") +
    "</div></div>" +
    "<div class='row'><button class='btn primary wide' id='hrGo'>Play by these</button></div>" +
    "<p class='note'>Changing these starts a fresh match.</p>";
  press($("hr10"), function () { P.target = 10; save(); houseRules(); });
  press($("hr5"), function () { P.target = 5; save(); houseRules(); });
  press($("hrS1"), function () { P.stick = true; save(); houseRules(); });
  press($("hrS0"), function () { P.stick = false; save(); houseRules(); });
  press($("hrA1"), function () { P.alone = true; save(); houseRules(); });
  press($("hrA0"), function () { P.alone = false; save(); houseRules(); });
  press($("hrGo"), function () { shut("ovHouse"); newMatch(); });
}
function opt(id, on, title, sub) {
  return "<button class='opt" + (on ? " on" : "") + "' id='" + id + "'><b>" + esc(title) + "</b>" +
    (sub ? "<small>" + esc(sub) + "</small>" : "") + "</button>";
}
function looks() {
  var names = { green: "Green baize", wine: "Wine", night: "Night" };
  var html = "";
  for (var key in Cards.SKINS) {
    html += "<button class='opt" + (key === P.skin ? " on" : "") + "' data-skin='" + key + "'><b>" +
      esc(names[key] || key) + "</b><small>&nbsp;</small></button>";
  }
  var paces = { relaxed: "Relaxed", brisk: "Brisk", quick: "Quick" };
  var ph = "";
  for (var pk in paces) ph += "<button class='opt" + (pk === P.pace ? " on" : "") + "' data-pace='" + pk + "'><b>" + paces[pk] + "</b></button>";
  $("lookBody").innerHTML = "<div class='opts'>" + html + "</div>" +
    "<div class='fld'><label><b>The table's pace</b></label><div class='opts'>" + ph + "</div></div>" +
    "<div class='row'><button class='btn" + (P.sound ? " on" : "") + "' id='lkSnd'>Sound</button></div>";
  Array.prototype.forEach.call($("lookBody").querySelectorAll("[data-skin]"), function (b) {
    press(b, function () { P.skin = b.dataset.skin; Cards.use(P.skin); save(); looks(); paint(); });
  });
  Array.prototype.forEach.call($("lookBody").querySelectorAll("[data-pace]"), function (b) {
    press(b, function () { P.pace = b.dataset.pace; save(); looks(); });
  });
  press($("lkSnd"), function () { P.sound = !P.sound; save(); looks(); });
}

function showHandEnd(t, over) {
  var mine = G.view ? G.view.team : 0;
  $("endTitle").textContent = over
    ? (over.winner === mine ? "You win the match" : "They win the match")
    : (t.euchred ? "Euchred" : (t.team === mine ? "Your hand" : "Their hand"));
  $("endLead").textContent = t.why + " · " + t.points + (t.points === 1 ? " point" : " points") +
    " to " + (t.team === mine ? "you" : "them") + ".";
  $("endBody").innerHTML = "<table class='tally'>" +
    "<tr" + (G.scores[mine] >= G.scores[1 - mine] ? " class='win'" : "") + "><th>Us</th><td>" + G.scores[mine] + "</td></tr>" +
    "<tr" + (G.scores[1 - mine] > G.scores[mine] ? " class='win'" : "") + "><th>Them</th><td>" + G.scores[1 - mine] + "</td></tr>" +
    "</table>";
  $("endNext").textContent = over ? "Play again" : "Deal the next";
  open("ovEnd");
}
press($("endNext"), function () {
  shut("ovEnd");
  if (G.mode === "guest") { Table.send({ k: "again" }); return; }
  if (G.ended) newMatch(); else newHand();
});

Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
  press(b, function () { shut(b.dataset.close); });
});

/* ================================================================
   four phones
   ================================================================ */
Table.on.message = function (msg, from) {
  if (G.mode === "host") {
    if (!G.st) return;
    if (msg.k === "play" && G.st.phase === "play" && G.st.turn === from) commit(from, msg.card);
    else if (msg.k === "bid" && G.st.turn === from) doBid(from, msg.bid);
    else if (msg.k === "discard" && G.st.phase === "discard" && from === G.st.dealer) doDiscard(from, msg.card);
    else if (msg.k === "again") { if (G.ended) newMatch(); else newHand(); }
    return;
  }
  if (msg.k === "view") {
    G.view = msg.view;
    G.mySeat = msg.view.seat;
    layout(); paint(); hud();
    if (G.view.won2) {
      G.sweep = { t: 0, dur: beat(0.45), seat: G.view.won2.seat, cards: G.view.won2.cards };
      setTimeout(function () { G.sweep = null; paint(); }, beat(0.45));
    }
  } else if (msg.k === "hand") {
    G.scores = msg.scores;
    if (msg.over) G.ended = msg.over;
    showHandEnd(msg.tally, msg.over);
  }
};
Table.on.hosting = function () { G.mode = "host"; G.mySeat = 0; newMatch(); };
Table.on.seated = function (seat) {
  G.mode = "guest"; G.mySeat = seat;
  shut("ovTogether");
  toast("You're seat " + (seat + 1) + ". Your partner is across the table.");
};
Table.on.link = function () { Table.started(); publish(); };
Table.on.roster = function () { paint(); hud(); };
Table.on.drop = function () { paint(); if (G.mode === "host") step(); };

/* ================================================================
   the way in
   ================================================================ */
press($("goSolo"), function () { start("solo"); });
press($("goTogether"), function () { start("solo"); Table.open(); open("ovTogether"); });
press($("goLearn"), function () { open("ovLearn"); });
function start(mode) {
  G.mode = mode; G.mySeat = 0;
  $("splash").classList.add("gone");
  setTimeout(function () { $("splash").style.display = "none"; }, 520);
  newMatch();
}

window.addEventListener("resize", function () { layout(); paint(); });

(function boot() {
  Cards.use(P.skin);
  G.st = Rules.deal(0, Math.random, opts());
  G.view = Rules.publicView(G.st, 0);
  layout(); paint(); hud();
  requestAnimationFrame(frame);
  var inv = Table.hashInvite();
  if (inv) { start("solo"); Table.join(inv); open("ovTogether"); }
})();

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
window.EUCHRE = { G: G, Rules: Rules, AI: AI, Table: Table, newMatch: newMatch };
})();
