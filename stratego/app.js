/* app.js — the conductor.

   Same shape as every other room here: the host holds the truth, every device
   draws a *view* of it, and the solo game is the two-phone game with the
   guest missing. In this room that indirection is not ceremony — it is the
   only reason a two-phone game is possible at all, because the whole point of
   Stratego is that the other side cannot see your ranks. The host sends each
   player `Rules.publicView(state, thatSeat)` and never broadcasts the state.

   Two things are particular to this game.

   **There is a phase before the game.** Forty pieces have to go down before
   anybody moves, and asking somebody to place forty pieces one at a time is
   asking them to close the tab. So the default is a deployment that is
   already good — flag off centre on the back row, three bombs around it, the
   Spy near the Marshal, Scouts forward — and the editing is tap-two-to-swap
   on top of that. Shuffle until you like it; swap the four you care about.

   **The machine plays from a view, not from the state.** `AI.choose` is
   handed exactly what a person in that chair would see. It is a stronger
   guarantee than promising not to peek, and it is the only version of that
   promise worth making.                                                    */
(function () {
"use strict";

Table.configure({
  game: "stratego", seats: 2, label: "board",
  roomName: "A stratego board",
  hostWord: "Be the board", joinWord: "Sit down at one",
  lead: "One phone is the board — it holds both armies and shows each of you only your own. The other sits down at it by typing four letters.",
  bots: ["You", "The other side"],
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

var P = { tier: "officer", skin: "field", sound: true, w: 0, l: 0, d: 0 };
try {
  var raw = JSON.parse(localStorage.getItem("stratego") || "null");
  if (raw) for (var k in P) if (raw[k] !== undefined) P[k] = raw[k];
} catch (e) {}
function save() { try { localStorage.setItem("stratego", JSON.stringify(P)); } catch (e) {} }

var G = {
  st: null, view: null, mode: "solo", mySeat: 0,
  sel: -1, marks: [], anim: null, fight: null, thinking: false,
  setup: null,        /* 40 ranks in home-square order, while deploying     */
  swapFrom: -1,
  ended: null
};
var cv = $("board");

/* ================================================================
   the truth
   ================================================================ */
function newGame() {
  G.st = Rules.empty();
  G.ended = null; G.sel = -1; G.marks = []; G.anim = null; G.fight = null;
  G.thinking = false; G.swapFrom = -1;
  G.setup = AI.deploy(G.mySeat, Math.random, AI.tier(P.tier));
  showView();
  banner("Set your army out", "tap two to swap them round");
  chrome();
}

/* the board a deploying player is looking at: their own draft army down, and
   nothing of the other side yet */
function draftState() {
  var st = Rules.empty();
  var d = Rules.deploy(st, G.mySeat, G.setup);
  return d || st;
}
function showView() {
  if (G.st && G.st.phase !== "setup") {
    G.view = Rules.publicView(G.st, G.mySeat);
  } else {
    G.view = Rules.publicView(draftState(), G.mySeat);
  }
  layout(); paint();
}
function publish() {
  if (G.mode === "guest") return;
  G.view = Rules.publicView(G.st, G.mySeat);
  if (G.mode === "host") Table.deal();
  layout(); paint(); chrome();
}
Table.viewFor = function (seat) { return Rules.publicView(G.st, seat); };

function myTurn() {
  return G.view && G.view.phase === "play" && G.view.turn === G.mySeat && !G.ended;
}
function humanSeat(seat) {
  if (G.mode === "solo") return seat === G.mySeat;
  return Table.isHuman(seat);
}

/* ---------- deploying ---------- */
function commitSetup() {
  if (G.mode === "guest") { Table.send({ k: "army", ranks: G.setup }); armyWait(); return; }
  var next = Rules.deploy(G.st, G.mySeat, G.setup);
  if (!next) { toast("That isn't a full army — try Deploy for me."); return; }
  G.st = next;
  /* in a solo game the house sets itself out at the same moment */
  if (G.mode === "solo") {
    var them = 1 - G.mySeat;
    G.st = Rules.deploy(G.st, them, AI.deploy(them, Math.random, AI.tier(P.tier)));
  }
  publish();
  if (G.st.phase === "play") {
    banner("Go", "");
    step();
  } else {
    armyWait();
  }
}
function armyWait() {
  banner("Army set", "waiting for the other side…");
  chrome();
}

/* ---------- taking a turn ---------- */
var thinkT = 0;
function step() {
  if (G.mode === "guest" || !G.st || G.st.phase !== "play") return;
  var e = Rules.over(G.st);
  if (e) { finish(e); return; }
  if (humanSeat(G.st.turn)) { G.thinking = false; chrome(); return; }
  houseTurn();
}
function houseTurn() {
  if (G.thinking) return;
  var seat = G.st.turn;
  G.thinking = true;
  chrome();
  say(Table.nameOf(seat) + " is thinking…", "thinking");
  clearTimeout(thinkT);
  var at = G.st.ply;
  thinkT = setTimeout(function () {
    if (!G.st || G.st.ply !== at || G.ended) { G.thinking = false; return; }
    /* the machine is handed a view, exactly like a person in that chair */
    var pick = AI.choose(Rules.publicView(G.st, seat), P.tier);
    G.thinking = false;
    if (!pick) { step(); return; }
    commit(pick.mv, seat);
  }, 380 + Math.random() * 300);
}

function commit(mv, seat) {
  var legal = Rules.find(G.st, mv);
  if (!legal) return false;
  var before = G.st;
  var pc = before.p[before.b[legal.f]];
  G.st = Rules.apply(before, legal);
  G.sel = -1; G.marks = [];

  var mine = seat === G.mySeat;
  var f = Gfx.at(legal.f), t = Gfx.at(legal.t);
  G.anim = {
    t: 0, dur: 200 + 14 * dist(legal.f, legal.t),
    sq: legal.f, from: f, to: t,
    seat: seat, mine: mine,
    /* you see your own rank fly; theirs is a back unless it was already shown */
    rank: mine ? pc.rank : (pc.shown ? pc.rank : -1),
    done: function () {
      var fg = G.st.fight;
      if (fg) {
        G.fight = { sq: fg.sq, att: fg.att, def: fg.def, words: fightWords(fg, seat) };
        beep(fg.result === "flag" ? "flag" : "fight");
        setTimeout(function () { G.fight = null; publish(); after(); }, 1400);
      } else {
        beep("move");
        after();
      }
      publish();
    }
  };
  publish();
  return true;
}
function after() {
  var e = Rules.over(G.st);
  if (e) { finish(e); return; }
  say(narrate(), G.st.turn === G.mySeat ? "them" : "us");
  step();
}
function dist(a, b) {
  return Math.abs(((a / 10) | 0) - ((b / 10) | 0)) + Math.abs((a % 10) - (b % 10));
}
function fightWords(fg, seat) {
  var mine = seat === G.mySeat;
  if (fg.result === "flag") return (mine ? "you take the flag" : "your flag is taken");
  if (fg.result === "both") return "both are lost";
  if (fg.result === "def") return Rules.NAME[fg.def] + " falls";
  return Rules.NAME[fg.att] + " falls";
}
function narrate() {
  var l = G.st.last;
  if (!l) return "";
  var who = Table.nameOf(l.by);
  if (!l.strike) return who + " moves";
  return who + " strikes — " + Rules.NAME[l.rank] + " on " + Rules.NAME[l.def];
}

function finish(e) {
  G.ended = e;
  if (G.mode === "solo") {
    if (e.winner < 0) P.d++; else if (e.winner === G.mySeat) P.w++; else P.l++;
    save();
  }
  var title = e.winner < 0 ? "Drawn" : (e.winner === G.mySeat ? "You win" : "You lose");
  var sub = e.why === "flag" ? "the flag is taken"
          : e.why === "stuck" ? "no legal move left"
          : "sixty moves each with nothing taken";
  banner(title, sub, true);
  publish();
  if (G.mode === "host") Table.broadcast({ k: "end", end: e });
  setTimeout(function () { showEnd(title, sub); }, 1000);
}

/* ================================================================
   the frame
   ================================================================ */
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
    paint();
  }
}
function layout() { Gfx.layout(cv, G.mySeat === 1); }
function paint() {
  if (!G.view) return;
  var ui = { from: G.sel, marks: G.marks, last: G.view.last, fight: G.fight };
  if (G.view.phase === "setup") {
    ui.home = Rules.homeSquares(G.mySeat);
    ui.from = G.swapFrom;
    ui.last = null;
  }
  if (G.anim) {
    var a = G.anim, k = Math.min(1, a.t / a.dur);
    var e = k * k * (3 - 2 * k);
    ui.fly = { sq: a.sq, seat: a.seat, mine: a.mine, rank: a.rank,
               x: a.from.x + (a.to.x - a.from.x) * e,
               y: a.from.y + (a.to.y - a.from.y) * e };
    ui.from = -1; ui.marks = [];
  }
  Gfx.draw(cv, G.view, ui);
}

/* ================================================================
   touching the board
   ================================================================ */
cv.addEventListener("pointerdown", function (e) {
  if (G.anim || G.fight) return;
  var r = cv.getBoundingClientRect();
  var sq = Gfx.hit(e.clientX - r.left, e.clientY - r.top);
  if (sq < 0) return;

  if (G.view.phase === "setup") { tapSetup(sq); return; }
  if (!myTurn()) { toast(G.ended ? "The game is over." : "Not your turn."); return; }

  if (G.sel >= 0) {
    for (var i = 0; i < G.marks.length; i++) {
      if (G.marks[i].sq === sq) { playMove(G.marks[i].mv); return; }
    }
  }
  var c = G.view.cells[sq];
  if (!c || !c.mine) {
    if (G.sel >= 0) { G.sel = -1; G.marks = []; paint(); }
    else if (c) whyNot(c);
    return;
  }
  pick(sq);
});

function pick(sq) {
  var list = (G.view.legal || []).filter(function (m) { return m.f === sq; });
  if (!list.length) {
    var c = G.view.cells[sq];
    toast(!Rules.mobile(c.rank)
      ? Rules.NAME[c.rank] + "s never move. That is what they are for."
      : "That one is boxed in.");
    return;
  }
  G.sel = sq;
  G.marks = list.map(function (m) { return { sq: m.t, strike: m.strike, mv: m }; });
  paint();
}
function whyNot(c) {
  toast(c.rank >= 0
    ? "That is their " + Rules.NAME[c.rank] + " — you have seen it in a fight."
    : "You cannot see what that is. That is rather the point.");
}
function playMove(mv) {
  if (G.mode === "guest") {
    G.sel = -1; G.marks = [];
    Table.send({ k: "mv", mv: { f: mv.f, t: mv.t } });
    say("sent…", "us");
    paint();
    return;
  }
  commit(mv, G.mySeat);
}

/* ---------- setting out ---------- */
function tapSetup(sq) {
  var home = Rules.homeSquares(G.mySeat);
  var idx = home.indexOf(sq);
  if (idx < 0) { toast("Your army goes in the four rows nearest you."); return; }
  if (G.swapFrom < 0) { G.swapFrom = sq; paint(); return; }
  if (G.swapFrom === sq) { G.swapFrom = -1; paint(); return; }
  var a = home.indexOf(G.swapFrom);
  var t = G.setup[a]; G.setup[a] = G.setup[idx]; G.setup[idx] = t;
  G.swapFrom = -1;
  beep("place");
  showView();
  chrome();
}

/* ================================================================
   the chrome
   ================================================================ */
function chrome() {
  var v = G.view;
  if (!v) return;
  var setting = v.phase === "setup";
  $("btnAct").classList.toggle("hide", !setting);
  $("btnShuffle").classList.toggle("hide", !setting);
  $("btnHint").classList.toggle("hide", setting);
  $("btnGiveUp").classList.toggle("hide", setting);
  if (setting) $("btnAct").disabled = !!(G.st && G.st.ready && G.st.ready[G.mySeat]);

  var seats = "", i;
  for (i = 0; i < 2; i++) {
    var cls = "seat";
    if (v.phase === "play" && i === v.turn && !G.ended) cls += " turn";
    if (i === G.mySeat) cls += " you";
    if (G.thinking && i === v.turn) cls += " thinking";
    if (G.mode !== "solo" && !Table.isHuman(i)) cls += " gone";
    var lost = v.dead[i].length;
    seats += "<div class='" + cls + "'><span class='dot' style='background:" +
      (i === G.mySeat ? Gfx.skin.me : Gfx.skin.them) + "'></span><span class='nm'>" +
      esc(seatName(i)) + "</span><span class='n'>" + (40 - lost) + "</span></div>";
  }
  $("seats").innerHTML = seats;
  $("scoreUs").innerHTML = "Won <b>" + P.w + "</b>";
  $("scoreThem").innerHTML = "Lost <b>" + P.l + "</b>" + (P.d ? " · drawn " + P.d : "");
  $("btnHint").disabled = !myTurn();
}
function seatName(i) {
  if (G.mode === "solo") return i === G.mySeat ? "You" : AI.tier(P.tier).name;
  return Table.nameOf(i);
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
  if (big && !slam) setTimeout(function () {
    if (el.querySelector(".big").textContent === big) el.className = "";
  }, 2400);
}
var actx = null;
function beep(kind) {
  if (!P.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    var t = actx.currentTime;
    if (kind === "fight" || kind === "flag") {
      var n = actx.createBufferSource();
      var buf = actx.createBuffer(1, actx.sampleRate * 0.3, actx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
      n.buffer = buf;
      var f = actx.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = kind === "flag" ? 900 : 420;
      var g = actx.createGain(); g.gain.value = 0.3;
      n.connect(f); f.connect(g); g.connect(actx.destination);
      n.start(t);
      return;
    }
    var o = actx.createOscillator(), g2 = actx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(kind === "place" ? 520 : 300, t);
    o.frequency.exponentialRampToValueAtTime(kind === "place" ? 700 : 210, t + 0.06);
    g2.gain.setValueAtTime(0.05, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g2); g2.connect(actx.destination);
    o.start(t); o.stop(t + 0.1);
  } catch (e) {}
}

/* ================================================================
   the tray
   ================================================================ */
press($("btnMenu"), function () { menu(); open("ovMenu"); });
press($("btnAct"), commitSetup);
press($("btnShuffle"), function () {
  G.setup = AI.deploy(G.mySeat, Math.random, AI.tier(P.tier));
  G.swapFrom = -1;
  showView();
  toast("A fresh deployment. Tap two squares to swap them round.");
});
press($("btnHint"), function () {
  if (!myTurn()) return;
  var pick2 = AI.choose(G.view, "officer");
  if (!pick2) return;
  G.sel = pick2.mv.f;
  G.marks = [{ sq: pick2.mv.t, strike: pick2.mv.strike, mv: pick2.mv }];
  paint();
  var h = Coach.hint(pick2, G.view);
  $("coachSay").textContent = h.say;
  $("coachWhy").textContent = h.why;
  $("coach").classList.remove("off");
});
press($("coachClose"), function () { $("coach").classList.add("off"); });
press($("btnGiveUp"), function () {
  if (G.ended || !G.st || G.st.phase !== "play") return;
  finish({ winner: 1 - G.mySeat, why: "resigned" });
});

function menu() {
  $("menuState").textContent =
    G.mode === "solo" ? "Alone against " + AI.tier(P.tier).name + "."
    : G.mode === "host" ? "You are the board." : "Sat down at a board.";
}
press($("mNew"), function () { shut("ovMenu"); newGame(); });
press($("mLevel"), function () { shut("ovMenu"); levels(); open("ovLevel"); });
press($("mTogether"), function () { shut("ovMenu"); Table.open(); open("ovTogether"); });
press($("mLook"), function () { shut("ovMenu"); looks(); open("ovLook"); });
press($("mLearn"), function () { shut("ovMenu"); open("ovLearn"); });
press($("mArmy"), function () { shut("ovMenu"); armySheet(); open("ovArmy"); });

function levels() {
  var html = "";
  for (var i = 0; i < AI.TIERS.length; i++) {
    var t = AI.TIERS[i];
    html += "<button class='opt" + (t.key === P.tier ? " on" : "") + "' data-tier='" + t.key + "'><b>" +
      esc(t.name) + "</b><small>" + esc(t.blurb) + "</small></button>";
  }
  $("levelBody").innerHTML = "<div class='opts'>" + html + "</div>" +
    "<p class='note'>There are two, and that is a result rather than a shortcut. A third was written — it probed with Scouts, came home to meet anything walking into its half, attacked with the cheapest piece that would do, and traded only when ahead. Measured over sixty games each, those four came to 47%, 49%, 45% and 53% against the Officer: neutral or slightly harmful, every one. So there is no third. The check would have caught it anyway, which is what it is for.</p>";
  Array.prototype.forEach.call($("levelBody").querySelectorAll(".opt"), function (b) {
    press(b, function () { P.tier = b.dataset.tier; save(); levels(); toast(AI.tier(P.tier).name + " it is."); });
  });
}
function looks() {
  var names = { field: "Field", desert: "Desert", night: "Night" };
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

/* what is left, on both sides — all of it public, all of it counted for you */
function armySheet() {
  var v = G.view;
  if (!v) return;
  var mineLeft = {}, theirsGone = {}, i;
  for (i = 0; i < 100; i++) {
    var c = v.cells[i];
    if (c && c.mine) mineLeft[c.rank] = (mineLeft[c.rank] || 0) + 1;
  }
  var them = 1 - G.mySeat;
  for (i = 0; i < v.dead[them].length; i++) theirsGone[v.dead[them][i]] = (theirsGone[v.dead[them][i]] || 0) + 1;
  var html = "<table class='tally'><tr><th>Rank</th><th>Yours left</th><th>Theirs taken</th><th>Theirs left</th></tr>";
  for (i = 0; i < Rules.ARMY.length; i++) {
    var a = Rules.ARMY[i];
    var gone = theirsGone[a.rank] || 0;
    html += "<tr><td>" + esc(a.name) + "</td><td>" + (mineLeft[a.rank] || 0) + "</td><td>" +
      gone + "</td><td>" + (a.n - gone) + "</td></tr>";
  }
  html += "</table>" +
    "<p class='note'>Every number here is arithmetic on the pieces lying face up beside the board. What it does <b>not</b> tell you is <i>where</i> any of them is — and the dot on an enemy piece means it has moved at some point, which is the other thing you were entitled to notice.</p>";
  $("armyBody").innerHTML = html;
}

function showEnd(title, sub) {
  $("endTitle").textContent = title;
  $("endLead").textContent = sub;
  $("endBody").innerHTML = G.mode === "solo"
    ? "<table class='tally'><tr><th>Won</th><td>" + P.w + "</td></tr><tr><th>Lost</th><td>" + P.l +
      "</td></tr><tr><th>Drawn</th><td>" + P.d + "</td></tr></table>" : "";
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
    if (!G.st) return;
    if (msg.k === "army") {
      var next = Rules.deploy(G.st, from, msg.ranks);
      if (!next) return;
      G.st = next;
      publish();
      if (G.st.phase === "play") { banner("Go", ""); step(); }
      return;
    }
    if (msg.k === "mv" && G.st.phase === "play" && G.st.turn === from) commit(msg.mv, from);
    else if (msg.k === "again") newGame();
    return;
  }
  if (msg.k === "view") {
    G.view = msg.view;
    G.mySeat = msg.view.seat;
    G.sel = -1; G.marks = [];
    if (G.view.fight) {
      var fg = G.view.fight;
      G.fight = { sq: fg.sq, att: fg.att, def: fg.def, words: fightWords(fg, fg.by) };
      setTimeout(function () { G.fight = null; paint(); }, 1400);
    }
    layout(); paint(); chrome();
    if (G.view.phase === "play" && G.view.last) say(narrateView(), G.view.turn === G.mySeat ? "them" : "us");
  } else if (msg.k === "end") {
    G.ended = msg.end;
    banner(msg.end.winner === G.mySeat ? "You win" : (msg.end.winner < 0 ? "Drawn" : "You lose"), "", true);
    chrome();
  }
};
function narrateView() {
  var l = G.view.last;
  if (!l) return "";
  var who = Table.nameOf(l.by);
  if (!l.strike) return who + " moves";
  return who + " strikes";
}
Table.on.hosting = function () { G.mode = "host"; G.mySeat = 0; newGame(); };
Table.on.seated = function (seat) {
  G.mode = "guest"; G.mySeat = seat;
  shut("ovTogether");
  toast("You're the " + (seat === 0 ? "red" : "blue") + " army. Set it out.");
  G.setup = AI.deploy(seat, Math.random, AI.tier(P.tier));
  layout(); paint(); chrome();
};
Table.on.link = function () { Table.started(); publish(); };
Table.on.roster = function () { chrome(); };
Table.on.drop = function () { chrome(); if (G.mode === "host") step(); };

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
  newGame();
}

window.addEventListener("resize", function () { layout(); paint(); });

(function boot() {
  Gfx.use(P.skin);
  G.st = Rules.empty();
  G.setup = AI.deploy(0, Math.random, AI.tier(P.tier));
  showView(); chrome();
  requestAnimationFrame(frame);
  var inv = Table.hashInvite();
  if (inv) { start("solo"); Table.join(inv); open("ovTogether"); }
})();

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
window.STRATEGO = { G: G, Rules: Rules, AI: AI, Table: Table, newGame: newGame };
})();
