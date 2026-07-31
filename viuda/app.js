/* app.js — the conductor.

   Same shape as every other room here: the host holds the truth, every device
   draws a view of it, and the solo game is the six-phone game with five
   chairs empty. The hands are a real secret, so the host never broadcasts the
   state — each phone is sent `Rules.publicView(state, thatSeat)` and nothing
   else, and tools/rules-check.js proves that message cannot encode anybody
   else's cards.

   One thing is particular to this game. **A trade is two taps and no button.**
   Tap one of yours, tap one of theirs, and the swap happens — because that is
   what a trade is, and a Trade button that lights up after you have already
   said what you want is a button that exists to be pressed. Taking the whole
   widow and knocking are the two things that are not trades, so those are the
   two things in the tray.                                                  */
(function () {
"use strict";

Table.configure({
  game: "viuda", seats: 6, label: "table",
  roomName: "A game of Viuda",
  hostWord: "Be the table", joinWord: "Sit down at one",
  lead: "One phone is the table — it deals, and sends each of you only your own five cards. Everybody else sits down at it by typing four letters, up to six of you. Empty chairs are played by the house.",
  bots: ["You", "Rosa", "Tino", "Paz", "Nando", "Chela"],
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

var P = { tier: "careful", skin: "green", players: 4, lives: 3, sound: true, w: 0, l: 0 };
try {
  var raw = JSON.parse(localStorage.getItem("viuda") || "null");
  if (raw) for (var k in P) if (raw[k] !== undefined) P[k] = raw[k];
} catch (e) {}
function save() { try { localStorage.setItem("viuda", JSON.stringify(P)); } catch (e) {} }

var G = {
  st: null, view: null, mode: "solo", mySeat: 0,
  pickHand: -1, pickWidow: -1, thinking: -1, ended: false, hint: null
};
var cv = $("table");
function rnd() { return Math.random(); }
function opts() { return { lives: P.lives }; }

/* ================================================================
   the truth
   ================================================================ */
function newGame() {
  G.st = Rules.deal(Rules.start(seatCount(), opts()), rnd);
  G.ended = false; G.pickHand = -1; G.pickWidow = -1; G.thinking = -1; G.hint = null;
  publish();
  banner("", "");
  say("");
  step();
}
function seatCount() { return G.mode === "solo" || G.mode === "pass" ? P.players : Math.max(2, P.players); }
function nextDeal() {
  if (!G.st || Rules.over(G.st)) { newGame(); return; }
  G.st = Rules.deal(G.st, rnd);
  G.pickHand = -1; G.pickWidow = -1; G.hint = null;
  publish();
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
  if (!G.view || G.view.phase !== "play") return false;
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
  if (G.st.phase === "show" || G.st.phase === "over") { finishDeal(); return; }
  if (humanSeat(G.st.turn)) { G.thinking = -1; publish(); return; }
  houseTurn();
}
function houseTurn() {
  if (G.thinking >= 0) return;
  var seat = G.st.turn;
  G.thinking = seat;
  publish();
  say(Table.nameOf(seat) + " is thinking…", "thinking");
  clearTimeout(thinkT);
  var at = G.st.log.length;
  thinkT = setTimeout(function () {
    if (!G.st || G.st.log.length !== at || G.st.turn !== seat) { G.thinking = -1; return; }
    var pick = AI.choose(Rules.publicView(G.st, seat), botTier(), rnd);
    G.thinking = -1;
    if (!pick) { G.st = Rules.knock(G.st, seat) || G.st; publish(); step(); return; }
    apply(seat, pick);
  }, 420 + Math.random() * 320);
}
function botTier() { return G.mode === "solo" ? P.tier : "careful"; }

function apply(seat, pick) {
  var n = pick.k === "take" ? Rules.take(G.st, seat)
        : pick.k === "swap" ? Rules.swap(G.st, seat, pick.mine, pick.theirs)
        : Rules.knock(G.st, seat);
  if (!n) { n = Rules.knock(G.st, seat); }
  if (!n) return false;
  G.st = n;
  G.pickHand = -1; G.pickWidow = -1; G.hint = null;
  say(narrate(seat, pick), seat === G.mySeat ? "us" : "them");
  note(pick.k);
  publish();
  setTimeout(step, 380);
  return true;
}
/* "You knocks" is the sort of thing nobody writes on purpose and everybody
   ships: the seat's own name is "You", which takes a plural verb. */
function verb(who, stem) {
  var plural = who === "You" || (who && who.length !== undefined && who.indexOf && who.length > 1 && typeof who !== "string");
  if (typeof who !== "string") return who.length > 1 ? stem : stem + "s";
  return who === "You" ? stem : stem + "s";
}
function narrate(seat, pick) {
  var who = Table.nameOf(seat);
  if (pick.k === "take") return who + " " + verb(who, "take") + " the widow";
  if (pick.k === "knock") return who + " " + verb(who, "knock") + " — one more turn each";
  return who + " " + verb(who, "trade") + " a card";
}

function finishDeal() {
  var r = G.st.result;
  G.pickHand = -1; G.pickWidow = -1;
  publish();
  if (r) {
    var names = r.losers.map(function (s) { return Table.nameOf(s); }).join(" and ");
    /* announced, then got out of the way — the hands underneath are the
       thing worth reading and a slammed banner never clears itself */
    banner(r.losers.length ? names + " " + verb(r.losers, "pay") : "Nobody pays",
           r.losers.length ? "worst hand loses a life" : "all square", true);
    setTimeout(function () { banner("", ""); }, 1500);
    chime(r.losers.indexOf(G.mySeat) < 0);
  }
  if (G.mode === "host") Table.broadcast({ k: "deal-done", view: null });
  if (Rules.over(G.st)) {
    G.ended = true;
    var w = Rules.winner(G.st);
    if (G.mode === "solo") { if (w === 0) P.w++; else P.l++; save(); }
    setTimeout(function () { showEnd(w); }, 1200);
  } else {
    setTimeout(function () {
      $("nextWrap").classList.remove("hide");
    }, 900);
  }
}

/* ================================================================
   drawing and touching
   ================================================================ */
function paint() {
  if (!G.view) return;
  var names = [], s;
  for (s = 0; s < G.view.seats; s++) names.push(seatName(s));
  Gfx.draw(cv, G.view, {
    names: names, pickHand: G.pickHand, pickWidow: G.pickWidow,
    maxLives: P.lives, hint: G.hint
  });
}
function seatName(s) {
  if (G.mode === "solo") return s === 0 ? "You" : Table.nameOf(s);
  return Table.nameOf(s);
}

cv.addEventListener("pointerdown", function (e) {
  if (!G.view) return;
  var r = cv.getBoundingClientRect();
  var x = e.clientX - r.left, y = e.clientY - r.top;
  if (G.view.phase !== "play") return;
  if (!myTurn()) { toast(Table.nameOf(G.view.turn) + " is up."); return; }

  var hi = Gfx.hitHand(x, y);
  if (hi >= 0) {
    G.pickHand = (G.pickHand === hi) ? -1 : hi;
    tryTrade();
    return;
  }
  var wi = Gfx.hitWidow(x, y);
  if (wi >= 0) {
    if (!G.view.shown) { toast("The widow is face down. Take the whole thing, or knock."); return; }
    G.pickWidow = (G.pickWidow === wi) ? -1 : wi;
    tryTrade();
    return;
  }
  G.pickHand = -1; G.pickWidow = -1;
  paint();
});

/* one of yours and one of theirs is a trade, and there is nothing else it
   could mean — so it happens rather than lighting up a button */
function tryTrade() {
  paint();
  if (G.pickHand < 0 || G.pickWidow < 0) { hud(); return; }
  var mine = G.view.hand[G.pickHand], theirs = G.view.widow[G.pickWidow];
  if (G.mode === "guest") {
    Table.send({ k: "swap", mine: mine, theirs: theirs });
    G.pickHand = -1; G.pickWidow = -1;
    say("sent…", "us");
    paint();
    return;
  }
  apply(G.view.turn, { k: "swap", mine: mine, theirs: theirs, why: ["yours"] });
}

/* ================================================================
   the chrome
   ================================================================ */
function hud() {
  var v = G.view;
  if (!v) return;
  var html = "", s;
  for (s = 0; s < v.seats; s++) {
    var cls = "seat";
    if (s === v.turn && v.phase === "play") cls += " turn";
    if (s === (v.seat === undefined ? G.mySeat : v.seat) && G.mode !== "pass") cls += " you";
    if (G.thinking === s) cls += " thinking";
    if (v.lives[s] <= 0) cls += " gone";
    html += "<div class='" + cls + "'><span class='dot'></span><span class='nm'>" + esc(seatName(s)) +
      "</span><span class='n'>" + v.lives[s] + "</span></div>";
  }
  $("seats").innerHTML = html;
  var up = myTurn();
  $("btnTake").disabled = !up;
  $("btnKnock").disabled = !up;
  $("btnHint").disabled = !up;
  $("btnKnock").querySelector(".t").textContent = (G.view.knocker >= 0) ? "Pass" : "Knock";
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
var actx = null;
function ctx() {
  if (!P.sound) return null;
  try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  return actx;
}
function note(kind) {
  var a = ctx();
  if (!a) return;
  var f = kind === "take" ? 330 : kind === "swap" ? 520 : 240;
  var t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + 0.15);
}
function chime(good) {
  var a = ctx();
  if (!a) return;
  var notes = good ? [523, 659, 784] : [392, 294];
  for (var i = 0; i < notes.length; i++) {
    var t = a.currentTime + i * 0.1, o = a.createOscillator(), g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(notes[i], t);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + 0.28);
  }
}

/* ================================================================
   the tray
   ================================================================ */
press($("btnMenu"), function () { menu(); open("ovMenu"); });
press($("btnTake"), function () {
  if (!myTurn()) return;
  if (G.mode === "guest") { Table.send({ k: "take" }); return; }
  apply(G.view.turn, { k: "take", why: ["yours"] });
});
press($("btnKnock"), function () {
  if (!myTurn()) return;
  if (G.mode === "guest") { Table.send({ k: "knock" }); return; }
  apply(G.view.turn, { k: "knock", why: ["yours"] });
});
press($("btnHint"), function () {
  if (!myTurn() || !G.view) return;
  var pick = AI.choose(G.view, "widow", rnd);
  if (!pick) return;
  G.hint = pick;
  var h = Coach.hint(pick, G.view);
  paint();
  $("coachSay").textContent = h.say;
  $("coachWhy").textContent = h.why;
  $("coach").classList.remove("off");
});
press($("coachClose"), function () { $("coach").classList.add("off"); G.hint = null; paint(); });
press($("btnNext"), function () {
  $("nextWrap").classList.add("hide");
  if (G.mode === "guest") { Table.send({ k: "next" }); return; }
  nextDeal();
});

function menu() {
  $("menuState").textContent =
    (G.mode === "solo" ? P.players + " at the table, against " + AI.tier(P.tier).name + "."
    : G.mode === "pass" ? P.players + " of you, one phone."
    : G.mode === "host" ? "You are the table." : "Sat down at a table.") +
    "  ·  won " + P.w + ", lost " + P.l + ".";
}
press($("mNew"), function () { shut("ovMenu"); $("nextWrap").classList.add("hide"); newGame(); });
press($("mSetup"), function () { shut("ovMenu"); setup(); open("ovSetup"); });
press($("mPass"), function () {
  shut("ovMenu");
  if (Table.role !== "off") Table.leave();
  G.mode = "pass"; G.mySeat = 0; newGame();
  toast("Everybody on one phone. Pass it round — and don't look.");
});
press($("mTogether"), function () { shut("ovMenu"); Table.open(); open("ovTogether"); });
press($("mLook"), function () { shut("ovMenu"); looks(); open("ovLook"); });
press($("mLearn"), function () { shut("ovMenu"); open("ovLearn"); });

function setup() {
  var counts = [2, 3, 4, 5, 6], html = "";
  for (var i = 0; i < counts.length; i++) {
    var n = counts[i];
    html += "<button class='opt" + (n === P.players ? " on" : "") + "' data-n='" + n + "'><b>" + n + "</b>" +
      "<small>" + (n === 2 ? "Heads up — the worst hand is a coin toss." :
                   n <= 4 ? "A pair is usually enough." :
                   "Somebody will have two pair.") + "</small></button>";
  }
  var tiers = "";
  for (i = 0; i < AI.TIERS.length; i++) {
    var t = AI.TIERS[i];
    tiers += "<button class='opt" + (t.key === P.tier ? " on" : "") + "' data-tier='" + t.key + "'><b>" +
      esc(t.name) + "</b><small>" + esc(t.blurb) + "</small></button>";
  }
  var lives = "";
  for (i = 0; i < 3; i++) {
    var lv = [2, 3, 5][i];
    lives += "<button class='opt" + (lv === P.lives ? " on" : "") + "' data-lives='" + lv + "'><b>" + lv +
      "</b><small>" + (lv === 2 ? "Short" : lv === 3 ? "The usual" : "A long evening") + "</small></button>";
  }
  $("setupBody").innerHTML =
    "<div class='fld'><label><b>How many at the table</b></label><div class='opts'>" + html + "</div></div>" +
    "<div class='fld'><label><b>Lives each</b></label><div class='opts'>" + lives + "</div></div>" +
    "<div class='fld'><label><b>Who you're playing</b></label><div class='opts'>" + tiers + "</div></div>" +
    "<div class='row'><button class='btn primary wide' id='suGo'>Start with these</button></div>";
  Array.prototype.forEach.call($("setupBody").querySelectorAll("[data-n]"), function (b) {
    press(b, function () { P.players = parseInt(b.dataset.n, 10); save(); setup(); });
  });
  Array.prototype.forEach.call($("setupBody").querySelectorAll("[data-lives]"), function (b) {
    press(b, function () { P.lives = parseInt(b.dataset.lives, 10); save(); setup(); });
  });
  Array.prototype.forEach.call($("setupBody").querySelectorAll("[data-tier]"), function (b) {
    press(b, function () { P.tier = b.dataset.tier; save(); setup(); });
  });
  press($("suGo"), function () { shut("ovSetup"); $("nextWrap").classList.add("hide"); newGame(); });
}
function looks() {
  var names = { green: "Green felt", wine: "Wine", night: "Night" };
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

function showEnd(winner) {
  $("endTitle").textContent = winner === G.mySeat && G.mode !== "pass" ? "You're the last one standing"
    : Table.nameOf(winner) + " is the last one standing";
  $("endLead").textContent = "Everybody else ran out of lives.";
  $("endBody").innerHTML = "";
  open("ovEnd");
}
press($("endNext"), function () { shut("ovEnd"); $("nextWrap").classList.add("hide"); newGame(); });

Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
  press(b, function () { shut(b.dataset.close); });
});

/* ================================================================
   six phones
   ================================================================ */
Table.on.message = function (msg, from) {
  if (G.mode === "host") {
    if (msg.k === "next") { $("nextWrap").classList.add("hide"); nextDeal(); return; }
    if (!G.st || G.st.turn !== from || G.st.phase !== "play") return;
    if (msg.k === "take") apply(from, { k: "take", why: [] });
    else if (msg.k === "knock") apply(from, { k: "knock", why: [] });
    else if (msg.k === "swap") apply(from, { k: "swap", mine: msg.mine, theirs: msg.theirs, why: [] });
    return;
  }
  if (msg.k === "view") {
    G.view = msg.view;
    G.mySeat = msg.view.seat;
    G.pickHand = -1; G.pickWidow = -1;
    paint(); hud();
    if (G.view.phase === "show" && G.view.result) {
      var names = G.view.result.losers.map(function (s) { return Table.nameOf(s); }).join(" and ");
      banner(names ? names + " " + verb(G.view.result.losers, "pay") : "Nobody pays", "", true);
      setTimeout(function () { banner("", ""); }, 1500);
      $("nextWrap").classList.remove("hide");
    } else {
      $("nextWrap").classList.add("hide");
    }
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
  G.st = Rules.deal(Rules.start(P.players, opts()), rnd);
  G.view = Rules.publicView(G.st, 0);
  paint(); hud();
  var inv = Table.hashInvite();
  if (inv) { start("solo"); Table.join(inv); open("ovTogether"); }
})();

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
window.VIUDA = { G: G, Rules: Rules, AI: AI, Table: Table, newGame: newGame };
})();
