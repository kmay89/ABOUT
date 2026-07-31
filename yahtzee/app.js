/* app.js — the conductor.

   Same shape as every other room here: the host holds the truth, every device
   draws a view of it, and the solo game is the six-phone game with five
   chairs empty.

   Two things are particular to this game.

   **A turn is three decisions, not one.** Everywhere else in this repository
   a turn is "pick a move and it is somebody else's problem". Here it is roll,
   keep, roll, keep, roll, write — and the interface has to make it obvious
   which of the six you are in without a word of instruction. So the tray's
   big button changes its own name (Roll · Roll again · Last roll), the dice
   you are keeping physically lift off the felt, and once you have rolled,
   **every open box on the sheet shows what these dice would score in it**. A
   person who has never played can play well immediately, because the sheet is
   doing the arithmetic that people normally get wrong.

   **Nothing is hidden.** Everybody watches everybody's dice, so the view is
   the state. `Rules.publicView` still exists and is still what gets sent,
   because the day a game in this repository has a secret in it, the machinery
   that keeps it secret should already be the machinery in use.             */
(function () {
"use strict";

Table.configure({
  game: "yahtzee", seats: 6, label: "table",
  roomName: "A Yahtzee table",
  hostWord: "Be the table", joinWord: "Sit down at one",
  lead: "One phone is the table — it holds the sheet and rolls the dice. Everybody else sits down at it by typing four letters, up to six of you. Empty chairs are played by the house.",
  bots: ["You", "Ada", "Bo", "Cleo", "Dev", "Etta"],
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

var P = { tier: "counter", skin: "felt", players: 2, sound: true, best: 0, w: 0, l: 0 };
try {
  var raw = JSON.parse(localStorage.getItem("yahtzee") || "null");
  if (raw) for (var k in P) if (raw[k] !== undefined) P[k] = raw[k];
} catch (e) {}
function save() { try { localStorage.setItem("yahtzee", JSON.stringify(P)); } catch (e) {} }

var G = {
  st: null, view: null, mode: "solo", mySeat: 0,
  anim: null, thinking: -1, ended: null, hint: null, history: []
};
var cv = $("board");

/* the machine's own randomness. One generator for the whole table, held by
   whoever is holding the truth, so a guest can never roll their own dice. */
function rnd() { return Math.random(); }

/* ================================================================
   the truth
   ================================================================ */
function newGame() {
  G.st = Rules.start(G.mode === "solo" ? P.players : Math.max(2, P.players));
  G.history = []; G.ended = null; G.anim = null; G.thinking = -1; G.hint = null;
  publish();
  banner("", "");
  say("");
  step();
}
function publish() {
  if (G.mode === "guest") return;
  G.view = Rules.publicView(G.st, G.mySeat);
  if (G.mode === "host") Table.deal();
  paint(); hud();
}
Table.viewFor = function (seat) { return Rules.publicView(G.st, seat); };

function myTurn() {
  if (G.ended || !G.view) return false;
  if (G.mode === "pass") return true;
  return G.view.turn === G.mySeat;
}
function humanSeat(seat) {
  if (G.mode === "solo") return seat === 0;
  if (G.mode === "pass") return true;
  return Table.isHuman(seat);
}

var thinkT = 0;
function step() {
  if (G.mode === "guest" || !G.st) return;
  if (Rules.over(G.st)) { finish(); return; }
  if (humanSeat(G.st.turn)) { G.thinking = -1; publish(); return; }
  houseTurn();
}

/* the house plays its turn out loud — it rolls, you watch the dice tumble, it
   sets some aside, and only then does it write. A bot that resolves its whole
   turn in one frame is unreadable, and the point of watching a stronger
   player is seeing what they kept. */
function houseTurn() {
  if (G.thinking >= 0) return;
  var seat = G.st.turn;
  G.thinking = seat;
  publish();
  say(Table.nameOf(seat) + " is up…", "thinking");
  botRoll(seat);
}
function botRoll(seat) {
  if (!G.st || G.st.turn !== seat || G.ended) { G.thinking = -1; return; }
  G.st = Rules.roll(G.st, rnd);
  tumble(function () {
    if (!G.st || G.st.turn !== seat || G.ended) { G.thinking = -1; return; }
    var view = Rules.publicView(G.st, seat);
    if (G.st.rolls >= 3) { botWrite(seat); return; }
    var pick = AI.keep(view, botTier());
    for (var i = 0; i < 5; i++) if (G.st.keep[i] !== pick.keep[i]) G.st = Rules.hold(G.st, i);
    publish();
    var all = pick.keep[0] && pick.keep[1] && pick.keep[2] && pick.keep[3] && pick.keep[4];
    say(Table.nameOf(seat) + " keeps " + keptWords(G.st), "them");
    clearTimeout(thinkT);
    thinkT = setTimeout(function () {
      if (all) botWrite(seat); else botRoll(seat);
    }, all ? 380 : 620);
  });
  publish();
}
function botWrite(seat) {
  if (!G.st || G.st.turn !== seat || G.ended) { G.thinking = -1; return; }
  var pick = AI.box(Rules.publicView(G.st, seat), botTier());
  G.thinking = -1;
  commitTake(seat, pick.key);
}
function botTier() { return G.mode === "solo" ? P.tier : "counter"; }
function keptWords(st) {
  var kept = [], i;
  for (i = 0; i < 5; i++) if (st.keep[i]) kept.push(st.dice[i]);
  if (!kept.length) return "nothing";
  kept.sort();
  return kept.join("-");
}

function commitRoll(seat) {
  if (!G.st || G.st.turn !== seat || G.st.rolls >= 3 || G.ended) return false;
  if (G.st.rolls === 0) {
    G.history.push(Rules.clone(G.st));
    if (G.history.length > 20) G.history.shift();
  }
  var n = Rules.roll(G.st, rnd);
  if (!n) return false;
  G.st = n;
  G.hint = null;
  tumble(function () { publish(); shout(); });
  publish();
  rattle();
  return true;
}
function commitHold(seat, i) {
  if (!G.st || G.st.turn !== seat || G.st.rolls === 0 || G.ended) return false;
  G.st = Rules.hold(G.st, i);
  G.hint = null;
  publish();
  tick();
  return true;
}
function commitTake(seat, key) {
  if (!G.st || G.ended) return false;
  var card = G.st.cards[seat];
  var got = Rules.score(key, G.st.dice, card);
  var bonus = Rules.jokerBonus(G.st.dice, card);
  var n = Rules.take(G.st, seat, key);
  if (!n) return false;
  G.st = n;
  G.hint = null;
  say(Table.nameOf(seat) + " writes " + got + " in " + Gfx.SHORT[key] +
      (bonus ? " — and another hundred for the Yahtzee" : ""),
      seat === G.mySeat ? "us" : "them");
  if (bonus) banner("Yahtzee again!", "a hundred more", true);
  chime(got, bonus);
  publish();
  setTimeout(step, 420);
  return true;
}

/* the noise the table makes when somebody rolls something worth noticing */
function shout() {
  var st = G.st;
  if (!st || st.rolls === 0) return;
  var c = Rules.counts(st.dice), f;
  for (f = 1; f <= 6; f++) if (c[f] === 5) { banner("YAHTZEE", "all five", true); return; }
  for (f = 1; f <= 6; f++) if (c[f] === 4 && st.rolls < 3) { say("Four " + f + "s.", "us"); return; }
}

function finish() {
  var w = Rules.winner(G.st);
  G.ended = w;
  var mine = Rules.total(G.st.cards[G.mySeat] || G.st.cards[0]);
  if (G.mode === "solo") {
    if (mine > P.best) P.best = mine;
    if (w.seat === 0 && w.tied.length === 1) P.w++; else P.l++;
    save();
  }
  banner(w.tied.length > 1 ? "A tie" : (w.seat === G.mySeat && G.mode !== "pass" ? "You win" : Table.nameOf(w.seat) + " wins"),
         w.total + " points", true);
  publish();
  if (G.mode === "host") Table.broadcast({ k: "end", end: w });
  setTimeout(function () { showEnd(w); }, 1000);
}

/* ================================================================
   the tumble — half a second of dice actually moving
   ================================================================ */
function tumble(done) {
  G.anim = { t: 0, dur: 480, done: done };
}
var lastFrame = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  var dt = lastFrame ? Math.min(64, ts - lastFrame) : 16;
  lastFrame = ts;
  if (G.anim) {
    G.anim.t += dt;
    if (G.anim.t >= G.anim.dur) {
      var d = G.anim.done;
      G.anim = null;
      paint();
      if (d) d();
      return;
    }
    paint();
  }
}

function paint() {
  if (!G.view) return;
  var ui = {
    seat: G.mode === "pass" ? G.view.turn : (G.view.seat === undefined ? G.mySeat : G.view.seat),
    names: [], live: [], locked: !!G.anim || G.ended,
    rolling: G.anim ? 1 : 0, hint: G.hint,
    thinking: G.thinking, best: G.mode === "solo" ? P.best : 0
  };
  for (var s = 0; s < G.view.seats; s++) {
    ui.names.push(seatName(s));
    ui.live.push(G.mode === "host" || G.mode === "guest" ? Table.isHuman(s) : true);
  }
  Gfx.draw(cv, G.view, ui);
}

/* ================================================================
   touching the table
   ================================================================ */
cv.addEventListener("pointerdown", function (e) {
  if (G.anim || !G.view) return;
  var r = cv.getBoundingClientRect();
  var h = Gfx.hit(e.clientX - r.left, e.clientY - r.top);
  if (!h) return;
  if (!myTurn()) { toast(G.ended ? "The game is over." : Table.nameOf(G.view.turn) + " is up."); return; }
  var seat = G.view.turn;

  if (h.kind === "die") {
    if (G.view.rolls === 0) { toast("Roll first."); return; }
    if (G.view.rolls >= 3) { toast("No rolls left — pick a box."); return; }
    if (G.mode === "guest") { Table.send({ k: "hold", i: h.i }); return; }
    commitHold(seat, h.i);
    return;
  }
  if (h.kind !== "box") return;
  if (h.seat >= 0 && h.seat !== seat) { toast("That's " + seatName(h.seat) + "'s column."); return; }
  if (G.view.rolls === 0) { toast("Roll first."); return; }
  var card = G.view.cards[seat];
  if (card[h.key] !== null && card[h.key] !== undefined) { toast("That box is already written in."); return; }
  var jb = Rules.jokerBoxes(G.view.dice, card);
  if (jb && jb.indexOf(h.key) < 0) {
    toast(jb.length === 1
      ? "A joker goes in its own number first — " + Gfx.SHORT[jb[0]] + "."
      : "The joker can't go there.");
    return;
  }
  if (G.mode === "guest") { Table.send({ k: "take", key: h.key }); return; }
  confirmTake(seat, h.key);
});

/* writing a nought into a box you may want later is the one move in this
   game that is genuinely irreversible and genuinely a mistake, so it is the
   one move that asks */
var pendingBox = null;
function confirmTake(seat, key) {
  var card = G.view.cards[seat];
  var got = Rules.score(key, G.view.dice, card);
  var rollsLeft = 3 - G.view.rolls;
  if (got === 0 && Rules.open(card).length > 1) {
    pendingBox = { seat: seat, key: key };
    $("askTitle").textContent = "Nothing in " + Gfx.SHORT[key] + "?";
    $("askLead").textContent = rollsLeft > 0
      ? "You still have " + rollsLeft + (rollsLeft === 1 ? " roll" : " rolls") + " left, and this writes a nought that stays there."
      : "That writes a nought, and it stays there. Sometimes it is the right move — throw away the cheapest box you own.";
    open("ovAsk");
    return;
  }
  commitTake(seat, key);
}
press($("askYes"), function () {
  shut("ovAsk");
  if (pendingBox) commitTake(pendingBox.seat, pendingBox.key);
  pendingBox = null;
});
press($("askNo"), function () { shut("ovAsk"); pendingBox = null; });

/* ================================================================
   the chrome
   ================================================================ */
function hud() {
  var v = G.view;
  if (!v) return;
  var rolls = v.rolls, up = myTurn() && !G.anim;
  var btn = $("btnRoll");
  btn.disabled = !up || rolls >= 3;
  btn.querySelector(".t").textContent =
    rolls === 0 ? "Roll" : rolls === 1 ? "Roll again" : rolls === 2 ? "Last roll" : "Pick a box";
  btn.classList.toggle("pulse", up && rolls === 0);
  $("btnUndo").disabled = !(G.mode === "solo" && G.history.length && !G.anim && G.thinking < 0);
  $("btnHint").disabled = !up || rolls === 0;
}
function seatName(s) {
  if (G.mode === "solo") return s === 0 ? "You" : AI.tier(P.tier).name;
  if (G.mode === "pass") return Table.nameOf(s);
  return Table.nameOf(s);
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
  if (big && !slam) setTimeout(function () { el.className = ""; }, 1800);
}

/* ---------- noise ---------- */
var actx = null;
function ctx() {
  if (!P.sound) return null;
  try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  return actx;
}
/* five dice hitting a table is five knocks, not one */
function rattle() {
  var a = ctx();
  if (!a) return;
  for (var i = 0; i < 5; i++) {
    var t = a.currentTime + 0.06 + i * 0.055 + Math.random() * 0.03;
    var o = a.createOscillator(), g = a.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(140 + Math.random() * 90, t);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + 0.08);
  }
}
function tick() {
  var a = ctx();
  if (!a) return;
  var t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(760, t);
  g.gain.setValueAtTime(0.03, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + 0.06);
}
function chime(got, bonus) {
  var a = ctx();
  if (!a) return;
  var notes = bonus ? [523, 659, 784, 1047] : got >= 25 ? [523, 784] : got > 0 ? [523] : [300];
  for (var i = 0; i < notes.length; i++) {
    var t = a.currentTime + i * 0.09, o = a.createOscillator(), g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(notes[i], t);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + 0.25);
  }
}

/* ================================================================
   the tray
   ================================================================ */
press($("btnMenu"), function () { menu(); open("ovMenu"); });
press($("btnRoll"), function () {
  if (!myTurn() || G.anim) return;
  if (G.view.rolls >= 3) { toast("No rolls left — tap a box on the sheet."); return; }
  if (G.mode === "guest") { Table.send({ k: "roll" }); return; }
  commitRoll(G.view.turn);
});
press($("btnUndo"), function () {
  if (G.mode !== "solo" || !G.history.length) return;
  G.st = G.history.pop();
  G.ended = null; G.anim = null; G.hint = null;
  clearTimeout(thinkT); G.thinking = -1;
  banner("", "");
  publish(); step();
});
press($("btnHint"), function () {
  if (!myTurn() || !G.view || G.view.rolls === 0) return;
  var view = G.view, h;
  if (view.rolls >= 3) {
    var b = AI.box(view, "ledger");
    G.hint = { box: b.key };
    h = Coach.box(b, view);
  } else {
    var k2 = AI.keep(view, "ledger");
    G.hint = { keep: k2.keep };
    h = Coach.keep(k2, view);
  }
  paint();
  $("coachSay").textContent = h.say;
  $("coachWhy").textContent = h.why;
  /* A hint about which dice to keep marks the dice — so the panel saying so
     must not be sitting on top of them. It parks just above the dice band for
     a keep, and stays at the foot of the stage for a box, where the thing
     being pointed at is up in the sheet. */
  $("coach").style.bottom = G.hint.keep
    ? Math.max(8, cv.clientHeight - Gfx.L.dieY + 12) + "px" : "";
  $("coach").classList.remove("off");
});
press($("coachClose"), function () { $("coach").classList.add("off"); G.hint = null; paint(); });

function menu() {
  $("menuState").textContent =
    G.mode === "solo" ? "You against " + (P.players - 1) + " × " + AI.tier(P.tier).name + "."
    : G.mode === "pass" ? P.players + " of you, one phone."
    : G.mode === "host" ? "You are the table." : "Sat down at a table.";
}
press($("mNew"), function () { shut("ovMenu"); newGame(); });
press($("mSetup"), function () { shut("ovMenu"); setup(); open("ovSetup"); });
press($("mPass"), function () {
  shut("ovMenu");
  if (Table.role !== "off") Table.leave();
  G.mode = "pass"; G.mySeat = 0; newGame();
  toast("Everybody on one phone. Pass it round the table.");
});
press($("mTogether"), function () { shut("ovMenu"); Table.open(); open("ovTogether"); });
press($("mLook"), function () { shut("ovMenu"); looks(); open("ovLook"); });
press($("mLearn"), function () { shut("ovMenu"); open("ovLearn"); });

function setup() {
  var counts = [1, 2, 3, 4, 6], html = "";
  for (var i = 0; i < counts.length; i++) {
    var n = counts[i];
    html += "<button class='opt" + (n === P.players ? " on" : "") + "' data-n='" + n + "'><b>" +
      (n === 1 ? "On your own" : n + " players") + "</b><small>" +
      (n === 1 ? "Just the sheet and your best score." : "You and " + (n - 1) + " of them.") + "</small></button>";
  }
  var tiers = "";
  for (i = 0; i < AI.TIERS.length; i++) {
    var t = AI.TIERS[i];
    tiers += "<button class='opt" + (t.key === P.tier ? " on" : "") + "' data-tier='" + t.key + "'><b>" +
      esc(t.name) + "</b><small>" + esc(t.blurb) + "</small></button>";
  }
  $("setupBody").innerHTML =
    "<div class='fld'><label><b>How many</b></label><div class='opts'>" + html + "</div></div>" +
    "<div class='fld'><label><b>Who you're playing</b></label><div class='opts'>" + tiers + "</div></div>" +
    "<p class='note'>Ledger works out the exact value of every one of the 252 hands two rolls ahead, and prices each box against what that box is normally worth. It averages a little under 240 a game. Nobody needs to beat it to enjoy it.</p>" +
    "<div class='row'><button class='btn primary wide' id='suGo'>Start with these</button></div>";
  Array.prototype.forEach.call($("setupBody").querySelectorAll("[data-n]"), function (b) {
    press(b, function () { P.players = parseInt(b.dataset.n, 10); save(); setup(); });
  });
  Array.prototype.forEach.call($("setupBody").querySelectorAll("[data-tier]"), function (b) {
    press(b, function () { P.tier = b.dataset.tier; save(); setup(); });
  });
  press($("suGo"), function () { shut("ovSetup"); newGame(); });
}
function looks() {
  var names = { felt: "Green felt", oak: "Oak", slate: "Slate" };
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

function showEnd(w) {
  var st = G.mode === "guest" ? G.view : G.st;
  $("endTitle").textContent = w.tied.length > 1 ? "A tie"
    : (w.seat === G.mySeat && G.mode !== "pass" ? "You win" : Table.nameOf(w.seat) + " wins");
  var html = "<table class='tally'><tr><th>Player</th><th>Upper</th><th>Bonus</th><th>Total</th></tr>";
  for (var s = 0; s < st.seats; s++) {
    var card = st.cards[s], up = Rules.upperTotal(card);
    html += "<tr" + (s === w.seat ? " class='win'" : "") + "><td>" + esc(seatName(s)) + "</td><td>" +
      up + "</td><td>" + (up >= Rules.BONUS_AT ? Rules.BONUS : "—") + "</td><td>" +
      Rules.total(card) + "</td></tr>";
  }
  $("endBody").innerHTML = html + "</table>";
  var mine = Rules.total(st.cards[G.mode === "pass" ? w.seat : G.mySeat]);
  $("endLead").textContent = mine >= P.best && G.mode === "solo"
    ? "That's your best yet." : "Your sheet came to " + mine + ".";
  open("ovEnd");
}
press($("endNext"), function () { shut("ovEnd"); newGame(); });

Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
  press(b, function () { shut(b.dataset.close); });
});

/* ================================================================
   six phones
   ================================================================ */
Table.on.message = function (msg, from) {
  if (G.mode === "host") {
    if (!G.st || G.st.turn !== from) return;
    if (msg.k === "roll") commitRoll(from);
    else if (msg.k === "hold") commitHold(from, msg.i | 0);
    else if (msg.k === "take") commitTake(from, msg.key);
    else if (msg.k === "again") newGame();
    return;
  }
  if (msg.k === "view") {
    G.view = msg.view;
    G.mySeat = msg.view.seat;
    G.ended = null;
    paint(); hud();
  } else if (msg.k === "end") {
    G.ended = msg.end;
    banner(msg.end.seat === G.mySeat ? "You win" : Table.nameOf(msg.end.seat) + " wins", msg.end.total + " points", true);
    hud();
    setTimeout(function () { showEnd(msg.end); }, 900);
  }
};
Table.on.hosting = function () { G.mode = "host"; G.mySeat = 0; newGame(); };
Table.on.seated = function (seat) {
  G.mode = "guest"; G.mySeat = seat;
  shut("ovTogether");
  toast("You're in chair " + (seat + 1) + ".");
};
Table.on.link = function () { Table.started(); publish(); };
Table.on.roster = function () { hud(); };
Table.on.drop = function () { hud(); if (G.mode === "host") step(); };

/* ================================================================
   the way in
   ================================================================ */
press($("goSolo"), function () { start("solo"); });
press($("goPass"), function () { start("pass"); });
press($("goTogether"), function () { start("solo"); Table.open(); open("ovTogether"); });
press($("goLearn"), function () { open("ovLearn"); });
function start(mode) {
  G.mode = mode; G.mySeat = 0;
  $("splash").classList.add("gone");
  setTimeout(function () { $("splash").style.display = "none"; }, 520);
  newGame();
}

window.addEventListener("resize", function () { paint(); });

(function boot() {
  Gfx.use(P.skin);
  G.st = Rules.start(P.players);
  G.view = Rules.publicView(G.st, 0);
  paint(); hud();
  requestAnimationFrame(frame);
  var inv = Table.hashInvite();
  if (inv) { start("solo"); Table.join(inv); open("ovTogether"); }
})();

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
window.YAHTZEE = { G: G, Rules: Rules, AI: AI, Table: Table, newGame: newGame };
})();
