/* app.js — the conductor.

   Same shape as the checkers board next door, and deliberately so: the host
   holds the truth, every device draws a *view* of it, and the solo game is
   the online game with the guest missing. What is different here is entirely
   in the middle of the file — the flip animation, and the fact that a turn
   can come straight back to you because the other side had nothing to
   play.                                                                    */
(function () {
"use strict";

Table.configure({
  game: "othello", seats: 2, label: "board",
  roomName: "An othello board",
  hostWord: "Be the board", joinWord: "Sit down at one",
  lead: "One phone is the board — it holds the position. The other sits down at it by typing four letters.",
  bots: ["You", "The house"],
  seatWord: function (n) { return n === 1 ? "1 sat down" : n + " sat down"; }
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

var P = { tier: "steady", skin: "felt", coords: false, counts: true, sound: true, w: 0, l: 0, d: 0 };
try {
  var raw = JSON.parse(localStorage.getItem("othello") || "null");
  if (raw) for (var k in P) if (raw[k] !== undefined) P[k] = raw[k];
} catch (e) {}
function save() { try { localStorage.setItem("othello", JSON.stringify(P)); } catch (e) {} }

var G = {
  st: null, view: null, mode: "solo", mySeat: 0,
  marks: [], legal: [], anim: null, thinking: false, history: [], ended: null
};
var cv = $("board");

/* ================================================================
   the truth
   ================================================================ */
function newGame() {
  G.st = Rules.start();
  G.history = []; G.ended = null; G.anim = null;
  publish();
  banner("", ""); say("");
  step();
}
function publish() {
  G.view = Rules.publicView(G.st, G.mySeat);
  G.legal = Rules.moves(G.st);
  if (G.mode === "host") Table.deal();
  marks();
  paint(); seats();
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

/* the rings you may play in, with what each would turn over */
function marks() {
  var list = G.mode === "guest" ? (G.view.legal || []) : G.legal;
  G.marks = [];
  if (!myTurn()) return;
  for (var i = 0; i < list.length; i++) {
    var mv = list[i];
    /* an X-square with its corner still empty is flagged, because that one
       mistake costs more games than every other mistake combined */
    var warn = (Rules.XSQ[mv.sq] !== undefined && G.view.b[Rules.XSQ[mv.sq]] === 0);
    G.marks.push({ sq: mv.sq, n: mv.flips.length, mv: mv, warn: warn });
  }
}

function step() {
  if (G.mode === "guest") return;
  var end = Rules.over(G.st);
  if (end.done) { finish(end); return; }
  if (humanSeat(G.st.turn)) { G.thinking = false; seats(); return; }
  houseTurn();
}

var thinkT = 0;
function houseTurn() {
  if (G.thinking) return;
  G.thinking = true;
  seats();
  say(Table.nameOf(G.st.turn) + " is thinking…", "thinking");
  var at = G.st.ply;
  clearTimeout(thinkT);
  thinkT = setTimeout(function () {
    if (!G.st || G.st.ply !== at || G.ended) { G.thinking = false; return; }
    var pick = AI.choose(G.st, P.tier);
    G.thinking = false;
    if (!pick) { step(); return; }
    commit(pick.mv, Table.nameOf(G.st.turn));
  }, 400 + Math.random() * 300);
}

function commit(mv, who) {
  var legal = Rules.find(G.st, mv);
  if (!legal) return false;
  G.history.push(Rules.clone(G.st));
  if (G.history.length > 90) G.history.shift();
  var side = G.st.turn, was = G.st.b.slice();
  G.st = Rules.apply(G.st, legal);
  G.marks = [];
  turnOver(was, legal, side, function () {
    publish();
    say(Coach.narrate(who || Table.nameOf(side), legal), side === G.mySeat ? "us" : "them");
    /* a pass is silent in the rules and must not be silent on the screen */
    if (G.st.passes === 1 && !G.ended) {
      setTimeout(function () { say(Coach.passed(Table.nameOf(1 - G.st.turn)), "thinking"); }, 900);
    }
    beep(legal.flips.length);
    step();
  });
  paint();
  return true;
}

function finish(end) {
  G.ended = end;
  var s = end.score;
  if (G.mode === "solo") {
    if (end.winner < 0) P.d++; else if (end.winner === G.mySeat) P.w++; else P.l++;
    save();
  }
  var title = end.winner < 0 ? "Drawn"
    : (G.mode === "pass" ? Table.nameOf(end.winner) + " wins" : (end.winner === G.mySeat ? "You win" : "You lose"));
  var sub = s[0] + " – " + s[1] + (end.why === "stuck" ? " · neither side had a move" : "");
  banner(title, sub, true);
  publish();
  if (G.mode === "host") Table.broadcast({ k: "end", end: end });
  setTimeout(function () { showEnd(title, sub, s); }, 900);
}

/* ================================================================
   the turn — the animation this room is for
   ================================================================ */
function turnOver(was, mv, side, done) {
  G.anim = { t: 0, dur: 200 + 44 * mv.flips.length, was: was, sq: mv.sq,
             flips: mv.flips.slice(), side: side, done: done };
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
      if (d) d();
    }
  }
  paint();
}

function paint() {
  if (!G.view) return;
  Gfx.layout(cv, G.mySeat === 1);
  var ui = { coords: P.coords, counts: P.counts, marks: G.marks,
             last: G.view.last && G.view.last.sq !== undefined ? G.view.last.sq : -1 };
  var view = G.view;
  if (G.anim) {
    var a = G.anim, k = Math.min(1, a.t / a.dur);
    /* drawn on the *pre-move* board, so the discs about to turn are still
       showing their old colour while they turn */
    view = { b: a.was.slice() };
    view.b[a.sq] = a.side === 0 ? 1 : -1;
    ui.marks = []; ui.last = -1;
    ui.flips = Gfx.ripple(a.sq, a.flips, k);
    ui.drop = a.sq;
    ui.dropAt = Math.min(1, k * 3.2);
  }
  Gfx.draw(cv, view, ui);
}

/* ================================================================
   touching the board
   ================================================================ */
cv.addEventListener("pointerdown", function (e) {
  if (G.anim) return;
  var r = cv.getBoundingClientRect();
  var sq = Gfx.hit(e.clientX - r.left, e.clientY - r.top);
  if (sq < 0) return;
  if (!myTurn()) { toast(G.ended ? "The game is over." : "Not your turn."); return; }
  for (var i = 0; i < G.marks.length; i++) {
    if (G.marks[i].sq === sq) { playMove(G.marks[i].mv); return; }
  }
  if (G.view.b[sq]) toast("There's already a disc there.");
  else toast("That square brackets nothing — a move has to turn something over.");
});

function playMove(mv) {
  if (G.mode === "guest") {
    G.marks = [];
    Table.send({ k: "mv", mv: { sq: mv.sq } });
    say("sent…", "us");
    paint();
    return;
  }
  commit(mv, G.mode === "pass" ? Table.nameOf(G.st.turn) : "You");
}

/* ================================================================
   the chrome
   ================================================================ */
function seats() {
  var el = $("seats"), html = "", i;
  var turn = G.view ? G.view.turn : 0;
  var sc = Rules.score(G.view || G.st);
  for (i = 0; i < 2; i++) {
    var cls = "seat";
    if (i === turn && !G.ended) cls += " turn";
    if (i === G.mySeat && G.mode !== "pass") cls += " you";
    if (G.thinking && i === turn) cls += " thinking";
    if ((G.mode === "host" || G.mode === "guest") && !Table.isHuman(i)) cls += " gone";
    html += "<div class='" + cls + "'><span class='dot' style='background:" +
      (i === 0 ? "#191919;box-shadow:0 0 0 1.5px rgba(255,255,255,.5)" : "#f2f0e8") + "'></span>" +
      "<span class='nm'>" + esc(seatName(i)) + "</span><span class='n'>" + sc[i] + "</span></div>";
  }
  el.innerHTML = html;
  $("scoreUs").innerHTML = "Won <b>" + P.w + "</b>";
  $("scoreThem").innerHTML = "Lost <b>" + P.l + "</b>" + (P.d ? " · drawn " + P.d : "");
  $("btnUndo").disabled = !(G.mode === "solo" && G.history.length && !G.thinking && !G.anim);
  $("btnHint").disabled = !myTurn() || !!G.anim;
}
function seatName(i) {
  if (G.mode === "solo") return i === 0 ? "You" : AI.tier(P.tier).name;
  if (G.mode === "pass") return i === 0 ? "Dark" : "Light";
  return Table.nameOf(i);
}

function say(t, cls) { var el = $("say"); el.className = cls || ""; el.textContent = t || ""; }
var toastT = 0;
function toast(t) {
  var el = $("toast");
  el.textContent = t; el.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(function () { el.classList.remove("on"); }, 2600);
}
function banner(big, sub, slam) {
  var el = $("banner");
  el.querySelector(".big").textContent = big || "";
  el.querySelector(".sub").textContent = sub || "";
  el.className = big ? ("on" + (slam ? " slam" : "")) : "";
  if (big && !slam) setTimeout(function () { el.className = ""; }, 1800);
}

/* the sound of a counter landing on cloth, and a soft sweep for the turn */
var actx = null;
function beep(n) {
  if (!P.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    var t = actx.currentTime;
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + 0.12);
    /* one soft tick per disc turned, so a big flip sounds like a big flip */
    for (var i = 0; i < Math.min(n, 8); i++) {
      var tt = t + 0.09 + i * 0.045;
      var o2 = actx.createOscillator(), g2 = actx.createGain();
      o2.type = "triangle";
      o2.frequency.setValueAtTime(520 + i * 26, tt);
      g2.gain.setValueAtTime(0.028, tt);
      g2.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
      o2.connect(g2); g2.connect(actx.destination);
      o2.start(tt); o2.stop(tt + 0.06);
    }
  } catch (e) {}
}

/* ================================================================
   the tray
   ================================================================ */
press($("btnMenu"), function () { menu(); open("ovMenu"); });
press($("btnUndo"), function () {
  if (G.mode !== "solo" || !G.history.length) return;
  G.st = G.history.pop();
  while (G.st.turn !== 0 && G.history.length) G.st = G.history.pop();
  G.ended = null; G.anim = null;
  clearTimeout(thinkT); G.thinking = false;
  banner("", "");
  publish(); step();
});
press($("btnHint"), function () {
  if (!myTurn()) return;
  var st = G.mode === "guest" ? guestState() : G.st;
  if (!st) return;
  var pick = AI.choose(st, "sharp");
  var h = Coach.hint(pick);
  $("coachSay").textContent = h.say;
  $("coachWhy").textContent = h.why;
  $("coach").classList.remove("off");
  if (pick && pick.mv) {
    for (var i = 0; i < G.marks.length; i++) G.marks[i].hint = (G.marks[i].sq === pick.mv.sq);
    G.marks = G.marks.filter(function (m) { return m.hint; }).concat(G.marks.filter(function (m) { return !m.hint; }));
    paint();
  }
});
press($("coachClose"), function () { $("coach").classList.add("off"); });
function guestState() {
  if (!G.view) return null;
  return { b: G.view.b.slice(), turn: G.view.turn, ply: G.view.ply || 0, passes: G.view.passes || 0, log: [] };
}
press($("btnCounts"), function () {
  P.counts = !P.counts; save();
  toast(P.counts ? "Showing how much each move turns over." : "Numbers off — which is how it should be read anyway.");
  paint();
});

function menu() {
  $("menuState").textContent =
    G.mode === "solo" ? "Alone against " + AI.tier(P.tier).name + "."
    : G.mode === "pass" ? "Two of you, one phone."
    : G.mode === "host" ? "You are the board" + (Table.names[1] ? " — " + Table.names[1] + " is here." : " — waiting for somebody.")
    : "Sat down at " + (Table.names[0] || "a board") + ".";
}
press($("mNew"), function () { shut("ovMenu"); newGame(); });
press($("mLevel"), function () { shut("ovMenu"); levels(); open("ovLevel"); });
press($("mPass"), function () {
  shut("ovMenu");
  if (Table.role !== "off") Table.leave();
  G.mode = "pass"; G.mySeat = 0; newGame();
  toast("Two of you, one phone.");
});
press($("mTogether"), function () { shut("ovMenu"); Table.open(); open("ovTogether"); });
press($("mLook"), function () { shut("ovMenu"); looks(); open("ovLook"); });
press($("mLearn"), function () { shut("ovMenu"); open("ovLearn"); });

function levels() {
  var html = "";
  for (var i = 0; i < AI.TIERS.length; i++) {
    var t = AI.TIERS[i];
    html += "<button class='opt" + (t.key === P.tier ? " on" : "") + "' data-tier='" + t.key + "'>" +
      "<b>" + esc(t.name) + "</b><small>" + esc(t.blurb) + "</small></button>";
  }
  $("levelBody").innerHTML = "<div class='opts'>" + html + "</div>";
  Array.prototype.forEach.call($("levelBody").querySelectorAll(".opt"), function (b) {
    press(b, function () { P.tier = b.dataset.tier; save(); levels(); toast(AI.tier(P.tier).name + " it is."); });
  });
}
function looks() {
  var names = { felt: "Green cloth", night: "Night", clay: "Clay" };
  var html = "";
  for (var key in Gfx.SKINS) {
    html += "<button class='opt" + (key === P.skin ? " on" : "") + "' data-skin='" + key + "'><b>" +
      esc(names[key] || key) + "</b><small>" + esc(Gfx.SKINS[key].board) + "</small></button>";
  }
  $("lookBody").innerHTML = "<div class='opts'>" + html + "</div>" +
    "<div class='row'><button class='btn" + (P.coords ? " on" : "") + "' id='lkCo'>Coordinates</button>" +
    "<button class='btn" + (P.sound ? " on" : "") + "' id='lkSnd'>Sound</button></div>";
  Array.prototype.forEach.call($("lookBody").querySelectorAll(".opt"), function (b) {
    press(b, function () { P.skin = b.dataset.skin; Gfx.use(P.skin); save(); looks(); paint(); });
  });
  press($("lkCo"), function () { P.coords = !P.coords; save(); looks(); paint(); });
  press($("lkSnd"), function () { P.sound = !P.sound; save(); looks(); });
}

function showEnd(title, sub, s) {
  $("endTitle").textContent = title;
  $("endLead").textContent = sub;
  $("endBody").innerHTML =
    "<table class='tally'><tr><th>Dark</th><td>" + s[0] + "</td></tr>" +
    "<tr><th>Light</th><td>" + s[1] + "</td></tr></table>" +
    (G.mode === "solo" ? "<p class='note'>Overall: " + P.w + " won · " + P.l + " lost" + (P.d ? " · " + P.d + " drawn" : "") + "</p>" : "");
  open("ovEnd");
}
press($("endNext"), function () { shut("ovEnd"); newGame(); });

Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
  press(b, function () { shut(b.dataset.close); });
});

/* ================================================================
   two phones
   ================================================================ */
Table.on.message = function (msg, from) {
  if (G.mode === "host") {
    if (msg.k === "mv" && G.st && G.st.turn === from) commit(msg.mv, Table.nameOf(from));
    else if (msg.k === "again") newGame();
    return;
  }
  if (msg.k === "view") {
    var was = G.view ? G.view.b : null;
    G.view = msg.view;
    G.view.legal = Rules.movesFor({ b: msg.view.b }, msg.view.turn);
    G.ended = null;
    marks(); seats();
    /* the guest animates the flip too, worked out from the view it was sent
       rather than from a message about it — one fewer thing to keep in step */
    if (was && G.view.last && G.view.last.flips) {
      G.anim = { t: 0, dur: 200 + 44 * G.view.last.flips.length, was: was,
                 sq: G.view.last.sq, flips: G.view.last.flips.slice(),
                 side: G.view.last.by, done: function () { paint(); } };
      say(Coach.narrate(Table.nameOf(G.view.last.by), G.view.last),
          G.view.last.by === G.mySeat ? "us" : "them");
    }
    paint();
  } else if (msg.k === "end") {
    G.ended = msg.end;
    banner(msg.end.winner < 0 ? "Drawn" : (msg.end.winner === G.mySeat ? "You win" : "You lose"),
           msg.end.score[0] + " – " + msg.end.score[1], true);
    seats();
  }
};
Table.on.hosting = function () { G.mode = "host"; G.mySeat = 0; newGame(); };
Table.on.seated = function (seat) {
  G.mode = "guest"; G.mySeat = seat;
  shut("ovTogether");
  toast("You're playing " + (seat === 0 ? "dark" : "light") + ".");
};
Table.on.link = function () { Table.started(); publish(); };
Table.on.roster = function () { seats(); };
Table.on.drop = function () { seats(); if (G.mode === "host") step(); };

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

(function boot() {
  Gfx.use(P.skin);
  G.st = Rules.start();
  G.view = Rules.publicView(G.st, 0);
  G.legal = Rules.moves(G.st);
  seats();
  requestAnimationFrame(frame);
  window.addEventListener("resize", paint);
  splashArt();
  var inv = Table.hashInvite();
  if (inv) { start("solo"); Table.join(inv); open("ovTogether"); }
})();

/* the splash's little board: the opening four, mid-turn, so the one effect
   this room is built around is the first thing anybody sees */
function splashArt() {
  var c = $("splashCv");
  if (!c) return;
  var g = c.getContext("2d");
  var s = Gfx.SKINS[P.skin] || Gfx.SKINS.felt;
  var cell = Math.floor(Math.min(c.width / 6, c.height / 4));
  var ox = (c.width - cell * 6) / 2, oy = (c.height - cell * 4) / 2;
  g.fillStyle = s.board;
  g.fillRect(ox, oy, cell * 6, cell * 4);
  g.strokeStyle = s.line; g.lineWidth = 2;
  for (var i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(ox + i * cell, oy); g.lineTo(ox + i * cell, oy + cell * 4); g.stroke(); }
  for (var j = 0; j <= 4; j++) { g.beginPath(); g.moveTo(ox, oy + j * cell); g.lineTo(ox + cell * 6, oy + j * cell); g.stroke(); }
  var put = [[1, 2, 1, 0], [2, 2, 1, 0], [3, 2, 1, 0.5], [4, 2, 0, 0], [2, 1, 0, 0], [3, 1, 1, 0]];
  for (var k = 0; k < put.length; k++) {
    var col = put[k][0], row = put[k][1], side = put[k][2], turn = put[k][3];
    var x = ox + col * cell + cell / 2, y = oy + row * cell + cell / 2, rad = cell * 0.4;
    var showing = turn < 0.5 ? side : 1 - side;
    var w = Math.max(rad * 0.07, rad * Math.abs(Math.cos(turn * Math.PI)));
    g.fillStyle = showing === 0 ? s.darkRim : s.lightRim;
    g.beginPath(); g.ellipse(x, y, w, rad, 0, 0, 6.284); g.fill();
    g.fillStyle = showing === 0 ? s.dark : s.light;
    g.beginPath(); g.ellipse(x, y, Math.max(rad * 0.03, w * 0.86), rad * 0.86, 0, 0, 6.284); g.fill();
  }
}

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
window.OTHELLO = { G: G, Rules: Rules, AI: AI, Table: Table, newGame: newGame, commit: commit };
})();
