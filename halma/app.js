/* app.js — the conductor.

   Same shape as every other room here: the host holds the truth, every
   device draws a view of it, and the solo game is the six-phone game with
   five seats empty.

   The one interface problem particular to this game is that **a destination
   can be reached more than one way**. A jump chain of six hops and a
   different chain of four can end on the same hole, and they are not the
   same move — one of them leaves a rung behind and the other does not. So
   tapping a destination that several chains reach plays the *shortest* one
   by default and offers the others: tap the same hole again and it cycles
   through them, drawing the path each time. Nobody has to know that feature
   exists to play the game, and the people who want it find it in one tap.  */
(function () {
"use strict";

Table.configure({
  game: "halma", seats: 6, label: "board",
  roomName: "A Chinese checkers board",
  hostWord: "Be the board", joinWord: "Sit down at one",
  lead: "One phone is the board. Everybody else sits down at it by typing four letters — up to six of you. Empty points are played by the house.",
  bots: ["You", "Ines", "Jo", "Kit", "Lev", "Mira"],
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

var P = { tier: "steady", skin: "wood", players: 2, noSquat: true, sound: true, w: 0, l: 0 };
try {
  var raw = JSON.parse(localStorage.getItem("halma") || "null");
  if (raw) for (var k in P) if (raw[k] !== undefined) P[k] = raw[k];
} catch (e) {}
function save() { try { localStorage.setItem("halma", JSON.stringify(P)); } catch (e) {} }

var G = {
  st: null, view: null, mode: "solo", mySeat: 0,
  sel: -1, marks: [], chains: {}, cycle: {}, preview: [],
  anim: null, thinking: -1, ended: null, hint: null, history: []
};
var cv = $("board");
function opts() { return { players: P.players, noSquat: P.noSquat, vacate: 20 }; }

/* ================================================================
   the truth
   ================================================================ */
function newGame() {
  G.st = Rules.start(opts());
  G.history = []; G.ended = null; G.anim = null; G.thinking = -1;
  G.sel = -1; G.marks = []; G.preview = [];
  publish();
  banner("", "");
  say("");
  step();
}
function publish() {
  if (G.mode === "guest") return;
  G.view = Rules.publicView(G.st, G.mySeat);
  if (G.mode === "host") Table.deal();
  layout(); paint(); hud();
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
  var end = Rules.over(G.st);
  if (end.done) { finish(end); return; }
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
  var at = G.st.ply;
  thinkT = setTimeout(function () {
    if (!G.st || G.st.ply !== at || G.ended) { G.thinking = -1; return; }
    var pick = AI.choose(G.st, seat, P.tier);
    G.thinking = -1;
    if (!pick) { step(); return; }
    commit(pick.mv, seat);
  }, 340 + Math.random() * 260);
}

function commit(mv, seat) {
  var legal = Rules.find(G.st, mv);
  if (!legal) return false;
  G.history.push(Rules.clone(G.st));
  if (G.history.length > 60) G.history.shift();
  var before = G.st.b.slice();
  G.st = Rules.apply(G.st, legal);
  G.sel = -1; G.marks = []; G.preview = []; G.hint = null;
  fly(before, legal, seat, function () {
    publish();
    say(narrate(seat, legal), seat === G.mySeat ? "us" : "them");
    beep(legal.path.length);
    step();
  });
  publish();
  return true;
}
function narrate(seat, mv) {
  var hops = mv.path.length;
  var who = Table.nameOf(seat);
  if (hops >= 5) return who + " runs the ladder — " + hops + " hops";
  if (hops >= 2) return who + " jumps " + hops;
  return who + " steps";
}

function finish(end) {
  G.ended = end;
  if (G.mode === "solo") {
    if (end.winner === 0) P.w++; else P.l++;
    save();
  }
  var mine = end.winner === G.mySeat;
  banner(G.mode === "pass" ? Table.nameOf(end.winner) + " is home"
        : (mine ? "You're home" : Table.nameOf(end.winner) + " gets there first"),
        "all ten in the far point", true);
  publish();
  if (G.mode === "host") Table.broadcast({ k: "end", end: end });
  setTimeout(function () { showEnd(end); }, 1000);
}

/* ================================================================
   the animation — hop by hop, because a chain is the move
   ================================================================ */
function fly(before, mv, seat, done) {
  var pts = [Gfx.at(mv.f)], i;
  for (i = 0; i < mv.path.length; i++) pts.push(Gfx.at(mv.path[i]));
  G.anim = {
    pts: pts, t: 0, hole: mv.f, seat: seat,
    dur: 120 + 110 * mv.path.length, done: done
  };
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
    paint();
  }
}

function layout() { Gfx.layout(cv, spin()); }
/* turn the board so your own point is at the bottom */
function spin() {
  if (!G.view) return 0;
  var mine = G.view.seats[G.view.seat === undefined ? G.mySeat : G.view.seat];
  if (mine === undefined) return 0;
  /* point 3 is the bottom of the star as drawn, so rotate mine onto it */
  return (3 - mine + 6) % 6;
}

function paint() {
  if (!G.view) return;
  var ui = { from: G.sel, marks: G.marks, preview: G.preview, last: G.view.last };
  if (G.anim) {
    var a = G.anim, k = Math.min(1, a.t / a.dur);
    var segs = a.pts.length - 1;
    var f = k * segs, si = Math.min(segs - 1, Math.floor(f)), sk = f - si;
    var e = sk * sk * (3 - 2 * sk);
    var p0 = a.pts[si], p1 = a.pts[si + 1];
    ui.from = -1; ui.marks = []; ui.preview = []; ui.last = null;
    ui.fly = { hole: a.hole, seat: a.seat,
               x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e,
               lift: Math.sin(sk * Math.PI) * 1.4 + 0.3 };
  }
  if (G.hint) {
    ui.from = G.hint.f;
    ui.preview = G.hint.path;
    ui.marks = [{ sq: G.hint.t, hops: G.hint.path.length }];
  }
  Gfx.draw(cv, G.view, ui);
}

/* ================================================================
   touching the board
   ================================================================ */
cv.addEventListener("pointerdown", function (e) {
  if (G.anim) return;
  var r = cv.getBoundingClientRect();
  var hole = Gfx.hit(e.clientX - r.left, e.clientY - r.top);
  if (hole < 0) return;
  G.hint = null;
  if (!myTurn()) { toast(G.ended ? "The game is over." : "Not your turn."); return; }
  var seat = G.view.turn;

  if (G.sel >= 0) {
    var list = G.chains[hole];
    if (list && list.length) {
      /* the same hole tapped twice cycles through the chains that reach it */
      var n = G.cycle[hole] || 0;
      if (G.preview.length && G.preview[G.preview.length - 1] === hole) {
        n = (n + 1) % list.length;
        G.cycle[hole] = n;
        if (n === 0) { playMove(list[0]); return; }
        G.preview = list[n].path.slice();
        toast("Another way there — " + list[n].path.length + " hops. Tap again to play it.");
        paint();
        return;
      }
      G.cycle[hole] = 0;
      if (list.length === 1) { playMove(list[0]); return; }
      G.preview = list[0].path.slice();
      toast(list.length + " ways to that hole. Tap it again to see the next.");
      paint();
      return;
    }
  }
  if (G.view.b[hole] !== seat) {
    if (G.sel >= 0) { clearPick(); paint(); }
    else if (G.view.b[hole] >= 0) toast("That one isn't yours.");
    return;
  }
  pick(hole);
});

function clearPick() { G.sel = -1; G.marks = []; G.chains = {}; G.cycle = {}; G.preview = []; }

function pick(hole) {
  var all = G.mode === "guest" ? guestMoves(hole) : Rules.movesFrom(G.st, hole);
  /* the anti-squat rule can narrow what is legal, so intersect with it */
  var legal = G.mode === "guest" ? (G.view.legal || null) : Rules.moves(G.st);
  if (legal) {
    all = all.filter(function (m) {
      for (var i = 0; i < legal.length; i++) {
        if (legal[i].f === m.f && legal[i].t === m.t && legal[i].path.length === m.path.length) return true;
      }
      return false;
    });
  }
  if (!all.length) { whyNot(hole); return; }
  clearPick();
  G.sel = hole;
  G.chains = {};
  for (var i = 0; i < all.length; i++) {
    var t = all[i].t;
    if (!G.chains[t]) G.chains[t] = [];
    G.chains[t].push(all[i]);
  }
  /* shortest first: it is the one people mean */
  for (var key in G.chains) {
    G.chains[key].sort(function (a, b) { return a.path.length - b.path.length; });
  }
  G.marks = [];
  for (var t2 in G.chains) {
    G.marks.push({ sq: parseInt(t2, 10), hops: G.chains[t2][0].path.length });
  }
  paint();
}
function guestMoves(hole) {
  var st = { b: G.view.b, turn: G.view.turn, ply: G.view.ply, seats: G.view.seats,
             moves: G.view.moves, opts: G.view.opts, log: [] };
  return Rules.movesFrom(st, hole);
}
function whyNot(hole) {
  var st = G.mode === "guest" ? guestState() : G.st;
  var home = Rules.homeOf(st, st.turn);
  if (st.opts.noSquat && st.moves[st.turn] >= (st.opts.vacate || 20) && home.indexOf(hole) < 0) {
    toast("You still have marbles at home, and by now they have to come out. Move one of those.");
    return;
  }
  toast("That one is boxed in — nothing next to it is empty.");
}
function guestState() {
  return { b: G.view.b, turn: G.view.turn, ply: G.view.ply, seats: G.view.seats,
           moves: G.view.moves, opts: G.view.opts, log: [] };
}

function playMove(mv) {
  if (G.mode === "guest") {
    clearPick();
    Table.send({ k: "mv", mv: { f: mv.f, t: mv.t, path: mv.path } });
    say("sent…", "us");
    paint();
    return;
  }
  commit(mv, G.st.turn);
}

/* ================================================================
   the chrome
   ================================================================ */
function hud() {
  var v = G.view;
  if (!v) return;
  var html = "", s;
  var st = G.mode === "guest" ? guestState() : G.st;
  for (s = 0; s < v.seats.length; s++) {
    var cls = "seat";
    if (s === v.turn && !G.ended) cls += " turn";
    if (s === (v.seat === undefined ? G.mySeat : v.seat) && G.mode !== "pass") cls += " you";
    if (G.thinking === s) cls += " thinking";
    if ((G.mode === "host" || G.mode === "guest") && !Table.isHuman(s)) cls += " gone";
    var col = Gfx.COLOURS[v.seats[s]];
    var home = Rules.homeCount(st, s);
    html += "<div class='" + cls + "'><span class='dot' style='background:" + col.hi + "'></span>" +
      "<span class='nm'>" + esc(seatName(s)) + "</span><span class='n'>" + home + "/10</span></div>";
  }
  $("seats").innerHTML = html;
  $("scoreUs").innerHTML = "Won <b>" + P.w + "</b>";
  $("scoreThem").innerHTML = "Lost <b>" + P.l + "</b>";
  $("btnUndo").disabled = !(G.mode === "solo" && G.history.length && !G.anim && G.thinking < 0);
  $("btnHint").disabled = !myTurn() || !!G.anim;
}
function seatName(s) {
  if (G.mode === "solo") return s === 0 ? "You" : AI.tier(P.tier).name;
  if (G.mode === "pass") return Rules.HOME_NAME[G.view.seats[s]];
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

/* one click per hop, rising — a long chain should sound like a long chain */
var actx = null;
function beep(hops) {
  if (!P.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    var t = actx.currentTime;
    for (var i = 0; i < Math.min(hops, 8); i++) {
      var o = actx.createOscillator(), g = actx.createGain();
      var at = t + i * 0.075;
      o.type = "sine";
      o.frequency.setValueAtTime(420 + i * 55, at);
      g.gain.setValueAtTime(0.05, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      o.connect(g); g.connect(actx.destination);
      o.start(at); o.stop(at + 0.09);
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
  G.ended = null; G.anim = null; clearPick(); G.hint = null;
  clearTimeout(thinkT); G.thinking = -1;
  banner("", "");
  publish(); step();
});
press($("btnHint"), function () {
  if (!myTurn()) return;
  var st = G.mode === "guest" ? guestState() : G.st;
  var pick2 = AI.choose(st, st.turn, "sharp");
  if (!pick2) return;
  G.hint = pick2.mv;
  paint();
  var h = Coach.hint(pick2, st, st.turn);
  $("coachSay").textContent = h.say;
  $("coachWhy").textContent = h.why;
  $("coach").classList.remove("off");
});
press($("coachClose"), function () { $("coach").classList.add("off"); G.hint = null; paint(); });

function menu() {
  $("menuState").textContent =
    G.mode === "solo" ? P.players + " points, you against " + AI.tier(P.tier).name + "."
    : G.mode === "pass" ? P.players + " of you, one phone."
    : G.mode === "host" ? "You are the board." : "Sat down at a board.";
}
press($("mNew"), function () { shut("ovMenu"); newGame(); });
press($("mSetup"), function () { shut("ovMenu"); setup(); open("ovSetup"); });
press($("mPass"), function () {
  shut("ovMenu");
  if (Table.role !== "off") Table.leave();
  G.mode = "pass"; G.mySeat = 0; newGame();
  toast("Everybody on one phone. The board turns to whoever is up.");
});
press($("mTogether"), function () { shut("ovMenu"); Table.open(); open("ovTogether"); });
press($("mLook"), function () { shut("ovMenu"); looks(); open("ovLook"); });
press($("mLearn"), function () { shut("ovMenu"); open("ovLearn"); });

function setup() {
  var counts = [2, 3, 4, 6], html = "";
  for (var i = 0; i < counts.length; i++) {
    var n = counts[i];
    html += "<button class='opt" + (n === P.players ? " on" : "") + "' data-n='" + n + "'><b>" + n + " points</b>" +
      "<small>" + (n === 2 ? "Head to head, right across the star." :
                   n === 3 ? "Every point opposite an empty one." :
                   n === 4 ? "Two pairs, facing." : "The full star.") + "</small></button>";
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
    "<div class='row'><button class='btn" + (P.noSquat ? " on" : "") + "' id='suSquat'>Fair-play rules</button></div>" +
    "<p class='note'>With those on: a marble may not stop in a point that is neither its start nor its destination, and after your twentieth move any marble still at home has to come out. Both exist to stop the one strategy that ruins this game — parking in somebody's destination and waiting.</p>" +
    "<div class='row'><button class='btn primary wide' id='suGo'>Start with these</button></div>";
  Array.prototype.forEach.call($("setupBody").querySelectorAll("[data-n]"), function (b) {
    press(b, function () { P.players = parseInt(b.dataset.n, 10); save(); setup(); });
  });
  Array.prototype.forEach.call($("setupBody").querySelectorAll("[data-tier]"), function (b) {
    press(b, function () { P.tier = b.dataset.tier; save(); setup(); });
  });
  press($("suSquat"), function () { P.noSquat = !P.noSquat; save(); setup(); });
  press($("suGo"), function () { shut("ovSetup"); newGame(); });
}
function looks() {
  var names = { wood: "Wood", slate: "Slate", cream: "Cream" };
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

function showEnd(end) {
  $("endTitle").textContent = end.winner === G.mySeat && G.mode !== "pass" ? "Home" : Table.nameOf(end.winner) + " is home";
  var st = G.mode === "guest" ? guestState() : G.st;
  var html = "<table class='tally'><tr><th>Point</th><th>Home</th><th>Still to travel</th></tr>";
  for (var s = 0; s < st.seats.length; s++) {
    html += "<tr" + (s === end.winner ? " class='win'" : "") + "><td>" + esc(seatName(s)) + "</td><td>" +
      Rules.homeCount(st, s) + "/10</td><td>" + Math.round(Rules.remaining(st, s)) + "</td></tr>";
  }
  $("endBody").innerHTML = html + "</table>";
  $("endLead").textContent = "Took " + st.moves[end.winner] + " moves.";
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
    if (msg.k === "mv" && G.st && G.st.turn === from) commit(msg.mv, from);
    else if (msg.k === "again") newGame();
    return;
  }
  if (msg.k === "view") {
    G.view = msg.view;
    G.mySeat = msg.view.seat;
    G.ended = null;
    clearPick();
    layout(); paint(); hud();
    if (G.view.last) say(narrate(G.view.last.by, G.view.last), G.view.last.by === G.mySeat ? "us" : "them");
  } else if (msg.k === "end") {
    G.ended = msg.end;
    banner(msg.end.winner === G.mySeat ? "You're home" : Table.nameOf(msg.end.winner) + " gets there first", "", true);
    hud();
  }
};
Table.on.hosting = function () { G.mode = "host"; G.mySeat = 0; newGame(); };
Table.on.seated = function (seat) {
  G.mode = "guest"; G.mySeat = seat;
  shut("ovTogether");
  toast("You have the " + (G.view ? Rules.HOME_NAME[G.view.seats[seat]] : "next") + " point.");
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

window.addEventListener("resize", function () { layout(); paint(); });

(function boot() {
  Gfx.use(P.skin);
  G.st = Rules.start(opts());
  G.view = Rules.publicView(G.st, 0);
  layout(); paint(); hud();
  requestAnimationFrame(frame);
  var inv = Table.hashInvite();
  if (inv) { start("solo"); Table.join(inv); open("ovTogether"); }
})();

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
window.HALMA = { G: G, Rules: Rules, AI: AI, Table: Table, newGame: newGame };
})();
