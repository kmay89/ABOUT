/* app.js — the conductor.

   The same shape as every other room here: the host holds the truth, every
   device draws a *view* of it, and the solo game is the four-phone game with
   three seats empty. Two things are particular to a card game.

   **The view is not a convenience, it is the security model.** In draughts
   the view is the whole board and the indirection costs nothing. Here it is
   the difference between a game and a game with everybody's hand in it: the
   host sends each phone `Rules.publicView(state, thatSeat)` and never
   broadcasts the state, so the other three hands are not on the wire to be
   found. tools/net-check.js proves it by rearranging the hidden hands and
   requiring the message to come back byte-identical.

   **The table has a rhythm, and it is a setting.** Three machines deciding
   as fast as a machine can decide is not a game you can follow — cards
   appear and you are left working out backwards who played them. So a trick
   is beats rather than instants: the seat whose turn it is says it is
   thinking, the card lands, and the completed trick sits on the table for a
   moment before it is swept. The domino table learned this and it is the
   single biggest difference between a card game that feels like a table and
   one that feels like a log file.                                          */
(function () {
"use strict";

Table.configure({
  game: "hearts", seats: 4, label: "table",
  roomName: "A hearts table",
  hostWord: "Be the table", joinWord: "Sit down at one",
  lead: "One phone is the table — it deals and it keeps the score. The other three sit down at it by typing four letters. Empty chairs are played by the house until somebody takes them.",
  bots: ["You", "Ada", "Bram", "Cleo"],
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
          target: 100, moonMode: "add", jack: false, played: 0, won: 0 };
try {
  var raw = JSON.parse(localStorage.getItem("hearts") || "null");
  if (raw) for (var k in P) if (raw[k] !== undefined) P[k] = raw[k];
} catch (e) {}
function save() { try { localStorage.setItem("hearts", JSON.stringify(P)); } catch (e) {} }

var PACE = { quick: 260, brisk: 520, relaxed: 900 };
function beat(mult) { return (PACE[P.pace] || PACE.relaxed) * (mult === undefined ? 1 : mult); }

var G = {
  st: null, view: null, mode: "solo", mySeat: 0,
  chosen: [], over: -1, hint: -1,
  anim: null, sweep: null, thinking: -1,
  round: 0, scores: [0, 0, 0, 0], ended: null
};
var cv = $("table");

function opts() {
  return { target: P.target, moonMode: P.moonMode, jackOfDiamonds: P.jack };
}

/* ================================================================
   the truth
   ================================================================ */
function newMatch() {
  G.round = 0;
  G.scores = [0, 0, 0, 0];
  G.ended = null;
  newHand();
}
function newHand() {
  G.st = Rules.deal(G.round, Math.random, opts());
  G.st.scores = G.scores.slice();
  G.chosen = []; G.hint = -1; G.sweep = null; G.anim = null; G.thinking = -1;
  publish();
  if (G.st.phase === "pass") {
    banner("Pass three", Rules.PASS_NAME[Rules.passDir(G.round)]);
    housePass();
  } else {
    banner("No pass", "this hand you keep what you were dealt");
    setTimeout(step, beat(0.8));
  }
}

function publish() {
  if (G.mode === "guest") return;
  G.view = Rules.publicView(G.st, G.mySeat);
  if (G.mode === "host") Table.deal();
  layout(); paint(); hud();
}
Table.viewFor = function (seat) { return Rules.publicView(G.st, seat); };

function humanSeat(seat) {
  if (G.mode === "solo") return seat === 0;
  return Table.isHuman(seat);
}

/* ---------- passing ---------- */
function housePass() {
  for (var s = 0; s < 4; s++) {
    if (humanSeat(s)) continue;
    Rules.choosePass(G.st, s, AI.pass(G.st, s, P.tier));
  }
  publish();
  maybePass();
}
function maybePass() {
  if (G.st.phase !== "pass" || !Rules.passReady(G.st)) return;
  setTimeout(function () {
    G.st = Rules.doPass(G.st);
    G.chosen = [];
    publish();
    var got = G.view.got;
    banner("", "");
    say(got ? "You were handed " + got.map(Cards.name).join(", ") + "." : "", "us");
    setTimeout(step, beat(0.9));
  }, beat(0.5));
}

/* ---------- the play ---------- */
var thinkT = 0;
function step() {
  if (G.mode === "guest" || !G.st) return;
  if (G.st.phase === "done") { finishHand(); return; }
  if (G.st.phase !== "play") return;
  if (humanSeat(G.st.turn)) {
    G.thinking = -1;
    /* the two of clubs is not a decision; play it and say so */
    if (G.st.tricks === 0 && G.st.trick.length === 0 && G.st.turn === G.mySeat) {
      say("You have the two of clubs, so you lead.", "us");
    }
    publish();
    return;
  }
  houseTurn();
}
function houseTurn() {
  if (G.thinking >= 0) return;
  var seat = G.st.turn;
  G.thinking = seat;
  publish();
  clearTimeout(thinkT);
  var at = G.st.log.length;
  thinkT = setTimeout(function () {
    if (!G.st || G.st.log.length !== at || G.st.phase !== "play") { G.thinking = -1; return; }
    var pick = AI.choose(G.st, seat, P.tier);
    G.thinking = -1;
    if (!pick) return;
    commit(seat, pick.card);
  }, beat(0.55) + Math.random() * beat(0.35));
}

function commit(seat, card) {
  var next = Rules.play(G.st, seat, card);
  if (!next) return false;
  var spot = Cards.place(seat, G.mySeat);
  var from = (seat === G.mySeat) ? handBoxOf(card) : Cards.L.seats[spot];
  var to = Cards.L.trick[spot];
  G.st = next;
  beep("play");
  /* the card flies from wherever it came from to its place in the trick */
  G.anim = { t: 0, dur: beat(0.28), card: card,
             x0: from.x, y0: from.y, x1: to.x, y1: to.y, i: -1 };
  publish();

  if (G.st.won) {
    var won = G.st.won;
    G.st.won = null;
    /* the completed trick sits there for a moment: without this the fourth
       card and the sweep happen in the same frame and nobody sees the trick */
    setTimeout(function () {
      G.sweep = { t: 0, dur: beat(0.5), seat: won.seat, cards: won.cards };
      say(Table.nameOf(won.seat) + " takes it" + trickWorth(won.cards), won.seat === G.mySeat ? "them" : "us");
      beep("sweep");
      setTimeout(function () {
        G.sweep = null;
        publish();
        step();
      }, beat(0.5));
    }, beat(0.75));
  } else {
    setTimeout(step, beat(0.18));
  }
  return true;
}
function trickWorth(cards) {
  var p = Rules.points(cards, opts());
  if (!p) return "";
  var q = cards.indexOf(Rules.QS) >= 0;
  return q ? " — with the queen" : " — " + p + (p === 1 ? " heart" : " hearts");
}
function handBoxOf(card) {
  var i = G.view.hand.indexOf(card);
  return (i >= 0 && Cards.L.hand[i]) ? Cards.L.hand[i] : { x: Cards.L.w / 2, y: Cards.L.h };
}

function finishHand() {
  var t = Rules.tally(G.st);
  for (var s = 0; s < 4; s++) G.scores[s] += t.add[s];
  G.round++;
  publish();
  if (t.shooter >= 0) {
    banner("The moon", Table.nameOf(t.shooter) + " took every point", true);
    beep("moon");
  }
  var over = Rules.matchOver(G.scores, opts());
  if (over) {
    G.ended = over;
    if (G.mode === "solo") { P.played++; if (over.winner === G.mySeat) P.won++; save(); }
    if (G.mode === "host") Table.broadcast({ k: "match", scores: G.scores, over: over });
  } else if (G.mode === "host") {
    Table.broadcast({ k: "hand", add: t.add, scores: G.scores, shooter: t.shooter });
  }
  setTimeout(function () { showHandEnd(t, over); }, t.shooter >= 0 ? beat(1.6) : beat(0.9));
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
  if (G.anim) {
    G.anim.t += dt / G.anim.dur;
    if (G.anim.t >= 1) G.anim = null;
    dirty = true;
  }
  if (G.sweep) {
    G.sweep.t += dt / G.sweep.dur;
    if (G.sweep.t > 1) G.sweep.t = 1;
    dirty = true;
  }
  if (dirty) paint();
}

function layout() { if (G.view) Gfx.layout(cv, G.view); }
function paint() {
  if (!G.view) return;
  var ui = {
    names: [Table.nameOf(0), Table.nameOf(1), Table.nameOf(2), Table.nameOf(3)],
    chosen: G.chosen, over: G.over, hint: G.hint,
    thinking: G.thinking,
    away: [false, false, false, false],
    winner: undefined
  };
  if (G.mode !== "solo") {
    for (var s = 0; s < 4; s++) ui.away[s] = !Table.isHuman(s);
  }
  if (G.view.phase === "pass" && G.view.waiting) ui.passReady = G.view.waiting;
  if (G.anim) {
    ui.flying = { t: G.anim.t, card: G.anim.card, x0: G.anim.x0, y0: G.anim.y0,
                  x1: G.anim.x1, y1: G.anim.y1, i: -1 };
  }
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

  if (G.view.phase === "pass") {
    if (G.view.chosen) { toast("Your three are in — waiting for the others."); return; }
    var at = G.chosen.indexOf(card);
    if (at >= 0) G.chosen.splice(at, 1);
    else if (G.chosen.length < 3) G.chosen.push(card);
    else { toast("Three is three. Tap one to take it back."); return; }
    paint();
    $("btnAct").disabled = G.chosen.length !== 3;
    return;
  }

  if (G.view.turn !== G.view.seat) { toast("Not your turn."); return; }
  if (G.view.legal.indexOf(card) < 0) { whyNot(card); return; }
  playCard(card);
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
  if (!v.trick.length) {
    if (v.tricks === 0) { toast("The two of clubs leads the first trick, and nothing else does."); return; }
    if (Cards.suit(card) === 2 && !v.broken) {
      toast("Hearts haven't been broken yet — somebody has to discard one first.");
      return;
    }
  } else {
    var led = Cards.suit(v.trick[0].card);
    if (Cards.suit(card) !== led) {
      toast("You have to follow " + Cards.SUIT[led] + " while you still can.");
      return;
    }
    if (v.tricks === 0) { toast("No points on the first trick — not the queen, not a heart."); return; }
  }
  toast("Not that one.");
}

function playCard(card) {
  if (G.mode === "guest") {
    Table.send({ k: "play", card: card });
    say("sent…", "us");
    return;
  }
  commit(G.mySeat, card);
}

/* ================================================================
   the chrome
   ================================================================ */
function hud() {
  var v = G.view;
  if (!v) return;
  var html = "", s;
  for (s = 0; s < 4; s++) {
    var sc = (v.scores || G.scores)[s];
    var lead = sc === Math.min.apply(null, v.scores || G.scores);
    html += "<div class='score" + (lead ? " lead" : "") + "'>" + esc(shortName(s)) + " <b>" + sc + "</b></div>";
  }
  $("rail").innerHTML = html;

  var act = $("btnAct");
  if (v.phase === "pass") {
    act.classList.remove("hide");
    act.textContent = v.chosen ? "Passed — waiting" : "Pass these three " + Rules.PASS_NAME[v.passDir];
    act.disabled = !!v.chosen || G.chosen.length !== 3;
    act.classList.toggle("primary", !v.chosen && G.chosen.length === 3);
  } else {
    act.classList.add("hide");
  }
  $("btnHint").disabled = !(v.phase === "play" && v.turn === v.seat);
}
function shortName(s) {
  var n = Table.nameOf(s);
  return n.length > 7 ? n.slice(0, 6) + "…" : n;
}

function say(t, cls) { var el = $("say"); el.className = cls || ""; el.textContent = t || ""; }
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
  if (big && !slam) setTimeout(function () { if (el.querySelector(".big").textContent === big) el.className = ""; }, 2200);
}

var actx = null;
function beep(kind) {
  if (!P.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    var t = actx.currentTime;
    if (kind === "moon") {
      [523, 659, 784, 1047].forEach(function (hz, i) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(hz, t + i * 0.1);
        g.gain.setValueAtTime(0.07, t + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.1 + 0.3);
        o.connect(g); g.connect(actx.destination);
        o.start(t + i * 0.1); o.stop(t + i * 0.1 + 0.32);
      });
      return;
    }
    var o2 = actx.createOscillator(), g2 = actx.createGain();
    o2.type = kind === "sweep" ? "sine" : "triangle";
    o2.frequency.setValueAtTime(kind === "sweep" ? 300 : 480, t);
    o2.frequency.exponentialRampToValueAtTime(kind === "sweep" ? 180 : 300, t + 0.08);
    g2.gain.setValueAtTime(0.05, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o2.connect(g2); g2.connect(actx.destination);
    o2.start(t); o2.stop(t + 0.12);
  } catch (e) {}
}

/* ================================================================
   the tray
   ================================================================ */
press($("btnMenu"), function () { menu(); open("ovMenu"); });
press($("btnAct"), function () {
  if (!G.view || G.view.phase !== "pass" || G.chosen.length !== 3) return;
  if (G.mode === "guest") { Table.send({ k: "pass", cards: G.chosen.slice() }); return; }
  Rules.choosePass(G.st, G.mySeat, G.chosen.slice());
  G.chosen = [];
  publish();
  maybePass();
});
press($("btnHint"), function () {
  if (!G.view || G.view.phase !== "play" || G.view.turn !== G.view.seat) return;
  if (G.mode === "guest") { toast("The hint reads the whole table, and a guest only holds its own hand."); return; }
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
press($("btnTaken"), function () { showTaken(); open("ovTaken"); });

function menu() {
  $("menuState").textContent =
    G.mode === "solo" ? "You and three of the house, playing " + AI.tier(P.tier).name + "."
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
  $("levelBody").innerHTML = "<div class='opts'>" + html + "</div>";
  Array.prototype.forEach.call($("levelBody").querySelectorAll(".opt"), function (b) {
    press(b, function () { P.tier = b.dataset.tier; save(); levels(); toast(AI.tier(P.tier).name + " it is."); });
  });
}
function houseRules() {
  $("houseBody").innerHTML =
    "<div class='fld'><label><b>Play to</b></label><div class='opts'>" +
      opt("hrT50", P.target === 50, "50", "A short game — twenty minutes.") +
      opt("hrT100", P.target === 100, "100", "The usual.") +
    "</div></div>" +
    "<div class='fld'><label><b>Shooting the moon</b></label><div class='opts'>" +
      opt("hrMA", P.moonMode === "add", "26 to everybody else", "The common rule.") +
      opt("hrMS", P.moonMode === "sub", "−26 to the shooter", "Kinder to a table where somebody is running away with it.") +
    "</div></div>" +
    "<div class='fld'><label><b>The jack of diamonds</b></label><div class='opts'>" +
      opt("hrJ0", !P.jack, "Just a card", "") +
      opt("hrJ1", P.jack, "Worth −10", "A house rule that gives you a reason to take a trick.") +
    "</div></div>" +
    "<div class='row'><button class='btn primary wide' id='hrGo'>Play by these</button></div>" +
    "<p class='note'>Changing these starts a fresh match.</p>";
  press($("hrT50"), function () { P.target = 50; save(); houseRules(); });
  press($("hrT100"), function () { P.target = 100; save(); houseRules(); });
  press($("hrMA"), function () { P.moonMode = "add"; save(); houseRules(); });
  press($("hrMS"), function () { P.moonMode = "sub"; save(); houseRules(); });
  press($("hrJ0"), function () { P.jack = false; save(); houseRules(); });
  press($("hrJ1"), function () { P.jack = true; save(); houseRules(); });
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
    "<p class='note'>Three machines deciding as fast as a machine can decide is not a game you can follow — cards appear and you work out backwards who played them. A turn here is three beats rather than one.</p>" +
    "<div class='row'><button class='btn" + (P.sound ? " on" : "") + "' id='lkSnd'>Sound</button></div>";
  Array.prototype.forEach.call($("lookBody").querySelectorAll("[data-skin]"), function (b) {
    press(b, function () { P.skin = b.dataset.skin; Cards.use(P.skin); save(); looks(); paint(); });
  });
  Array.prototype.forEach.call($("lookBody").querySelectorAll("[data-pace]"), function (b) {
    press(b, function () { P.pace = b.dataset.pace; save(); looks(); });
  });
  press($("lkSnd"), function () { P.sound = !P.sound; save(); looks(); });
}

/* what the table has actually said out loud, and nothing else */
function showTaken() {
  var v = G.view;
  var html = "<table class='tally'><tr><th>Seat</th><th>This hand</th><th>Match</th></tr>";
  for (var s = 0; s < 4; s++) {
    html += "<tr" + (s === v.seat ? " class='win'" : "") + "><td>" + esc(Table.nameOf(s)) +
      "</td><td>" + v.taken[s] + "</td><td>" + (v.scores || G.scores)[s] + "</td></tr>";
  }
  html += "</table>";
  html += "<p class='note'>Hearts " + (v.broken ? "have been broken" : "have not been broken yet") +
    ". " + (13 - v.tricks) + " tricks left.</p>" +
    "<p class='note'>Everything here is something the table did in front of you. Which hearts are still out is not shown, because working that out is the game.</p>";
  $("takenBody").innerHTML = html;
}

function showHandEnd(t, over) {
  $("endTitle").textContent = over ? (over.winner === G.mySeat ? "You win" : Table.nameOf(over.winner) + " wins")
    : (t.shooter >= 0 ? Table.nameOf(t.shooter) + " shot the moon" : "Hand over");
  $("endLead").textContent = over ? "Lowest score takes it."
    : "Passing " + Rules.PASS_NAME[Rules.passDir(G.round)] + " next hand.";
  var html = "<table class='tally'><tr><th>Seat</th><th>Hand</th><th>Match</th></tr>";
  for (var s = 0; s < 4; s++) {
    var low = G.scores[s] === Math.min.apply(null, G.scores);
    html += "<tr" + (low ? " class='win'" : "") + "><td>" + esc(Table.nameOf(s)) + "</td><td>" +
      (t.add[s] >= 0 ? "+" : "") + t.add[s] + "</td><td>" + G.scores[s] + "</td></tr>";
  }
  html += "</table>";
  $("endBody").innerHTML = html;
  $("endNext").textContent = over ? "Play again" : "Next hand";
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
    if (msg.k === "play" && G.st && G.st.phase === "play" && G.st.turn === from) commit(from, msg.card);
    else if (msg.k === "pass" && G.st && G.st.phase === "pass") {
      if (Rules.choosePass(G.st, from, msg.cards)) { publish(); maybePass(); }
    } else if (msg.k === "again") {
      if (G.ended) newMatch(); else newHand();
    }
    return;
  }
  if (msg.k === "view") {
    var was = G.view;
    G.view = msg.view;
    G.mySeat = msg.view.seat;
    G.chosen = [];
    layout(); paint(); hud();
    if (G.view.won) {
      G.sweep = { t: 0, dur: beat(0.5), seat: G.view.won.seat, cards: G.view.won.cards };
      setTimeout(function () { G.sweep = null; paint(); }, beat(0.5));
    }
  } else if (msg.k === "hand" || msg.k === "match") {
    G.scores = msg.scores;
    if (msg.over) G.ended = msg.over;
    showHandEnd({ add: msg.add || [0, 0, 0, 0], shooter: msg.shooter === undefined ? -1 : msg.shooter }, msg.over);
  }
};
Table.on.hosting = function () { G.mode = "host"; G.mySeat = 0; newMatch(); };
Table.on.seated = function (seat) {
  G.mode = "guest"; G.mySeat = seat;
  shut("ovTogether");
  toast("You're seat " + (seat + 1) + ".");
};
Table.on.link = function () { Table.started(); publish(); };
Table.on.roster = function () { paint(); hud(); };
Table.on.drop = function () {
  paint();
  if (G.mode === "host") {
    /* a chair that emptied mid-pass has to be played by the house or the
       hand never starts */
    if (G.st && G.st.phase === "pass") housePass();
    else step();
  }
};

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
window.HEARTS = { G: G, Rules: Rules, AI: AI, Table: Table, newMatch: newMatch };
})();
