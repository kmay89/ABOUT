/* app.js — the conductor.

   Game flow, the tray, the sheets, the animation loop, and the four ways two
   people can end up playing: alone against the house, two on one phone, two
   phones over four letters, or a phone that came back to a game it was
   already in.

   The one structural decision worth naming: **the host holds the truth**.
   Even in a solo game there is exactly one authority — this device — and the
   board on screen is always a *view* of it rather than the thing itself. That
   sounds like ceremony for a game with nothing hidden, and it is not: it
   means the guest's code path and the solo code path are the same path, so
   the online game cannot drift away from the offline one. The only difference
   between the two is where `view` came from.                               */
(function () {
"use strict";

/* ---------- the room this is ---------- */
Table.configure({
  game: "checkers", seats: 2, label: "board",
  roomName: "A checkers board",
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

/* ---------- what we keep between visits ---------- */
var P = { tier: "steady", skin: "wood", numbers: false, sound: true, seen: false, w: 0, l: 0, d: 0 };
try {
  var raw = JSON.parse(localStorage.getItem("checkers") || "null");
  if (raw) for (var k in P) if (raw[k] !== undefined) P[k] = raw[k];
} catch (e) {}
function save() { try { localStorage.setItem("checkers", JSON.stringify(P)); } catch (e) {} }

/* ---------- the game ---------- */
var G = {
  st: null,            /* the truth — host and solo only                    */
  view: null,          /* what this device draws                            */
  mode: "solo",        /* solo | pass | host | guest                        */
  mySeat: 0,
  sel: -1,             /* the square whose piece is picked up               */
  marks: [],           /* where it may go                                   */
  legal: [],           /* this turn's legal moves, for the seat to move     */
  anim: null,
  thinking: false,
  history: [],         /* solo only: for undo                               */
  ended: null
};

var cv = $("board");

/* ================================================================
   the truth
   ================================================================ */
function newGame(keepMode) {
  G.st = Rules.start();
  G.history = [];
  G.ended = null;
  G.sel = -1; G.marks = [];
  if (!keepMode) G.anim = null;
  publish();
  banner("", "");
  say("");
  step();
}

/* the host's one job after every change: tell everybody what they may see,
   and tell itself the same way, so the two paths cannot diverge */
function publish() {
  G.view = Rules.publicView(G.st, G.mySeat);
  G.legal = Rules.moves(G.st);
  if (G.mode === "host") Table.deal();
  paint();
  seats();
}
Table.viewFor = function (seat) { return Rules.publicView(G.st, seat); };

/* whose device is allowed to move right now */
function myTurn() {
  if (G.ended) return false;
  if (!G.view) return false;
  if (G.mode === "pass") return true;
  return G.view.turn === G.mySeat;
}
/* is the seat to move played by a person on some phone, or by the house? */
function humanSeat(seat) {
  if (G.mode === "solo") return seat === 0;
  if (G.mode === "pass") return true;
  return Table.isHuman(seat);
}

/* ---------- taking a turn ---------- */
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
  var turnAt = G.st.ply;
  clearTimeout(thinkT);
  /* a beat before and a beat after, because a machine that answers instantly
     turns the board into a flicker you have to reconstruct backwards */
  thinkT = setTimeout(function () {
    if (!G.st || G.st.ply !== turnAt || G.ended) { G.thinking = false; return; }
    var pick = AI.choose(G.st, P.tier);
    G.thinking = false;
    if (!pick) { step(); return; }
    commit(pick.mv, Table.nameOf(turnSeat(turnAt)));
  }, 420 + Math.random() * 320);
}
function turnSeat() { return G.st.turn; }

/* every move on this device goes through here, whoever made it */
function commit(mv, who) {
  var legal = Rules.find(G.st, mv);
  if (!legal) return false;
  var before = Rules.clone(G.st);
  G.history.push(before);
  if (G.history.length > 80) G.history.shift();
  var side = G.st.turn;
  G.st = Rules.apply(G.st, legal);
  G.sel = -1; G.marks = [];
  fly(before, legal, side, function () {
    publish();
    say(Coach.narrate(who || Table.nameOf(side), legal), side === G.mySeat ? "us" : "them");
    beep(legal.caps.length ? "take" : "move");
    step();
  });
  publish();
  return true;
}

function finish(end) {
  G.ended = end;
  var mine = end.winner === G.mySeat;
  if (G.mode === "solo") {
    if (end.winner < 0) P.d++; else if (mine) P.w++; else P.l++;
    save();
  }
  var title = end.winner < 0 ? "Drawn"
    : (G.mode === "pass" ? Table.nameOf(end.winner) + " wins" : (mine ? "You win" : "You lose"));
  var sub = end.why === "swept" ? "Every piece taken."
    : end.why === "blocked" ? "Nothing left to move — and a side with no move has lost."
    : "Forty moves each with nothing taken. That is a draw everywhere it is played.";
  banner(title, sub, true);
  seats();
  if (G.mode === "host") Table.broadcast({ k: "end", end: end });
  setTimeout(function () { showEnd(title, sub); }, 900);
}

/* ================================================================
   the animation
   ================================================================ */
function fly(before, mv, side, done) {
  var pts = [Gfx.centre(mv.f)], i;
  for (i = 0; i < mv.path.length; i++) pts.push(Gfx.centre(mv.path[i]));
  G.anim = {
    pts: pts, t: 0,
    /* a jump takes longer than a slide, and each extra hop adds its own beat */
    dur: mv.caps.length ? 180 + 150 * mv.path.length : 190,
    board: before.b.slice(), sq: mv.f,
    side: side, king: Math.abs(before.b[mv.f]) === 2,
    becomes: !!mv.king, caps: mv.caps.slice(), done: done, at: 0
  };
}

var lastFrame = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  var dt = lastFrame ? Math.min(64, ts - lastFrame) : 16;
  lastFrame = ts;
  if (G.anim) {
    G.anim.t += dt;
    var a = G.anim, k = Math.min(1, a.t / a.dur);
    if (k >= 1) {
      var d = a.done;
      G.anim = null;
      if (d) d();
    }
  }
  paint();
}

function paint() {
  if (!G.view) return;
  Gfx.layout(cv, G.mySeat === 1);
  var ui = { numbers: P.numbers, last: G.view.last, from: G.sel, marks: G.marks };
  var view = G.view;
  if (G.anim) {
    var a = G.anim;
    /* the piece is drawn on the pre-move board so the men it is jumping are
       still there while it jumps them — which is what makes a double read as
       a double rather than as a teleport */
    view = { b: a.board };
    ui.last = null; ui.from = -1; ui.marks = [];
    var k = Math.min(1, a.t / a.dur);
    var segs = a.pts.length - 1;
    var f = k * segs, si = Math.min(segs - 1, Math.floor(f)), sk = f - si;
    var e = sk * sk * (3 - 2 * sk);
    var p0 = a.pts[si], p1 = a.pts[si + 1];
    ui.fly = {
      sq: a.sq, side: a.side, king: a.king || (a.becomes && k > 0.85),
      x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e,
      lift: a.caps.length ? Math.sin(sk * Math.PI) * 1.6 + 0.3 : 0.35
    };
    /* the men being taken fade as the jumper passes over them */
    ui.dying = a.caps.slice(0, Math.max(0, Math.ceil(f)));
    ui.dieAt = Math.min(1, (f - Math.floor(f)) * 1.6);
  }
  Gfx.draw(cv, view, ui);
}

/* ================================================================
   touching the board
   ================================================================ */
function tap(px, py) {
  if (G.anim) return;
  if (!myTurn()) { toast(G.ended ? "The game is over." : "Not your turn."); return; }
  var sq = Gfx.hit(px, py);
  if (sq < 0) return;
  var seat = G.view.turn;
  var mine = seat === 0 ? G.view.b[sq] > 0 : G.view.b[sq] < 0;

  /* second tap: a destination we offered */
  if (G.sel >= 0) {
    for (var i = 0; i < G.marks.length; i++) {
      if (G.marks[i].sq === sq) { playMove(G.marks[i].mv); return; }
    }
  }
  if (!mine) {
    /* tapping an enemy piece or an empty square puts the piece back down,
       and says why if the reason is the compulsory-jump rule */
    if (G.sel >= 0) { G.sel = -1; G.marks = []; paint(); }
    else if (G.view.b[sq]) whyNot(sq);
    return;
  }
  pick(sq);
}

function pick(sq) {
  var moves = movesFrom(sq);
  if (!moves.length) { whyNot(sq); return; }
  G.sel = sq;
  G.marks = moves.map(function (m) { return { sq: m.t, cap: m.caps.length > 0, mv: m }; });
  /* one legal move from a piece that has been picked up on purpose is not
     ambiguous — but it is still a tap, because a piece that moves itself when
     you touch it is a piece you cannot look at */
  paint();
}
function movesFrom(sq) {
  var out = [], list = legalNow(), i;
  for (i = 0; i < list.length; i++) if (list[i].f === sq) out.push(list[i]);
  return out;
}
function legalNow() {
  if (G.mode === "guest") return G.view.legal || [];
  return G.legal;
}
function whyNot(sq) {
  var list = legalNow();
  if (!list.length) return;
  if (list[0].caps.length) {
    var froms = [], i;
    for (i = 0; i < list.length; i++) if (froms.indexOf(list[i].f) < 0) froms.push(list[i].f);
    toast(froms.length === 1
      ? "There's a jump on the board, and jumping is compulsory — only that piece may move."
      : "There are jumps on the board, and jumping is compulsory.");
  } else {
    toast("That one has nowhere to go.");
  }
}

function playMove(mv) {
  if (G.mode === "guest") {
    G.sel = -1; G.marks = [];
    Table.send({ k: "mv", mv: { f: mv.f, t: mv.t, caps: mv.caps, path: mv.path, king: mv.king } });
    say("sent…", "us");
    paint();
    return;
  }
  commit(mv, G.mode === "pass" ? Table.nameOf(G.st.turn) : "You");
}

/* pointer plumbing: one handler, both mice and fingers */
cv.addEventListener("pointerdown", function (e) {
  var r = cv.getBoundingClientRect();
  tap(e.clientX - r.left, e.clientY - r.top);
});

/* ================================================================
   the chrome
   ================================================================ */
function seats() {
  var el = $("seats"), html = "", i;
  var turn = G.view ? G.view.turn : 0;
  for (i = 0; i < 2; i++) {
    var cls = "seat";
    if (i === turn && !G.ended) cls += " turn";
    if (i === G.mySeat && G.mode !== "pass") cls += " you";
    if (G.thinking && i === turn) cls += " thinking";
    if (G.mode !== "solo" && G.mode !== "pass" && !Table.isHuman(i)) cls += " gone";
    var n = Rules.count(G.view || G.st)[i];
    html += "<div class='" + cls + "'><span class='dot'></span>" +
      "<span class='nm'>" + esc(seatName(i)) + "</span>" +
      "<span class='n'>" + (n.men + n.kings) + (n.kings ? " · " + n.kings + "♔" : "") + "</span></div>";
  }
  el.innerHTML = html;
  $("scoreUs").innerHTML = "Won <b>" + P.w + "</b>";
  $("scoreThem").innerHTML = "Lost <b>" + P.l + "</b>" + (P.d ? " · drawn " + P.d : "");
  $("btnUndo").disabled = !(G.mode === "solo" && G.history.length && !G.thinking && !G.anim);
  $("btnHint").disabled = !myTurn() || !!G.anim;
}
function seatName(i) {
  if (G.mode === "solo") return i === 0 ? "You" : AI.tier(P.tier).name;
  if (G.mode === "pass") return i === 0 ? "Near side" : "Far side";
  return Table.nameOf(i) + (i === G.mySeat ? "" : "");
}

var sayT = 0;
function say(t, cls) {
  var el = $("say");
  el.className = cls || "";
  el.textContent = t || "";
}
var toastT = 0;
function toast(t) {
  var el = $("toast");
  el.textContent = t;
  el.classList.add("on");
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

/* a short, dry click rather than a tune — the sound a piece makes */
var actx = null;
function beep(kind) {
  if (!P.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    var t = actx.currentTime;
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(kind === "take" ? 180 : 320, t);
    o.frequency.exponentialRampToValueAtTime(kind === "take" ? 90 : 190, t + 0.09);
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + 0.13);
  } catch (e) {}
}

/* ================================================================
   the tray
   ================================================================ */
press($("btnMenu"), function () { menu(); open("ovMenu"); });
press($("btnUndo"), function () {
  if (G.mode !== "solo" || !G.history.length) return;
  /* back past the house's reply as well as your own move, because undoing
     into a position where it is not your turn is not undoing */
  G.st = G.history.pop();
  if (G.st.turn !== 0 && G.history.length) G.st = G.history.pop();
  G.ended = null; G.sel = -1; G.marks = []; G.anim = null;
  clearTimeout(thinkT); G.thinking = false;
  banner("", "");
  publish();
  step();
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
  if (pick && pick.mv) { G.sel = pick.mv.f; G.marks = [{ sq: pick.mv.t, cap: pick.mv.caps.length > 0, mv: pick.mv }]; paint(); }
});
press($("coachClose"), function () { $("coach").classList.add("off"); });
/* a guest holds a view rather than a state; for the hint's sake that is
   enough, because draughts hides nothing */
function guestState() {
  if (!G.view) return null;
  return { b: G.view.b.slice(), turn: G.view.turn, quiet: G.view.quiet || 0, ply: G.view.ply || 0, log: [] };
}

press($("btnFlip"), function () {
  if (G.mode !== "solo" && G.mode !== "pass") { toast("Your side is where you sat down."); return; }
  G.mySeat = G.mySeat ? 0 : 1;
  publish();
});

/* ---------- the menu ---------- */
function menu() {
  $("menuState").textContent =
    G.mode === "solo" ? "Alone against " + AI.tier(P.tier).name + "."
    : G.mode === "pass" ? "Two of you, one phone."
    : G.mode === "host" ? "You are the board" + (Table.names[1] ? " — " + Table.names[1] + " is here." : " — waiting for somebody.")
    : "Sat down at " + (Table.names[0] || "a board") + ".";
}
press($("mNew"), function () { shut("ovMenu"); newGame(true); });
press($("mLevel"), function () { shut("ovMenu"); levels(); open("ovLevel"); });
press($("mPass"), function () {
  shut("ovMenu");
  if (Table.role !== "off") Table.leave();
  G.mode = "pass"; G.mySeat = 0;
  newGame(); toast("Two of you, one phone. The board turns itself round.");
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
    press(b, function () {
      P.tier = b.dataset.tier; save();
      levels();
      toast(AI.tier(P.tier).name + " it is.");
    });
  });
}

function looks() {
  var names = { wood: "Cantina wood", slate: "Slate", cafe: "Café" };
  var html = "";
  for (var key in Gfx.SKINS) {
    html += "<button class='opt" + (key === P.skin ? " on" : "") + "' data-skin='" + key + "'>" +
      "<b>" + esc(names[key] || key) + "</b><small>" + esc(Gfx.SKINS[key].dark) + " · " + esc(Gfx.SKINS[key].light) + "</small></button>";
  }
  $("lookBody").innerHTML = "<div class='opts'>" + html + "</div>" +
    "<div class='row'><button class='btn" + (P.numbers ? " on" : "") + "' id='lkNum'>Square numbers</button>" +
    "<button class='btn" + (P.sound ? " on" : "") + "' id='lkSnd'>Sound</button></div>";
  Array.prototype.forEach.call($("lookBody").querySelectorAll(".opt"), function (b) {
    press(b, function () { P.skin = b.dataset.skin; Gfx.use(P.skin); save(); looks(); paint(); });
  });
  press($("lkNum"), function () { P.numbers = !P.numbers; save(); looks(); paint(); });
  press($("lkSnd"), function () { P.sound = !P.sound; save(); looks(); });
}

function showEnd(title, sub) {
  $("endTitle").textContent = title;
  $("endLead").textContent = sub;
  $("endBody").innerHTML = G.mode === "solo"
    ? "<table class='tally'><tr><th>Won</th><td>" + P.w + "</td></tr>" +
      "<tr><th>Lost</th><td>" + P.l + "</td></tr>" +
      "<tr><th>Drawn</th><td>" + P.d + "</td></tr></table>"
    : "";
  open("ovEnd");
}
press($("endNext"), function () { shut("ovEnd"); newGame(true); });

Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
  press(b, function () { shut(b.dataset.close); });
});

/* ================================================================
   two phones
   ================================================================ */
Table.on.message = function (msg, from) {
  if (G.mode === "host") {
    if (msg.k === "mv" && G.st && G.st.turn === from) {
      commit(msg.mv, Table.nameOf(from));
    } else if (msg.k === "again") {
      newGame(true);
    }
    return;
  }
  /* a guest draws what it is told and nothing else */
  if (msg.k === "view") {
    G.view = msg.view;
    G.view.legal = guestLegal(msg.view);
    G.ended = null;
    G.sel = -1; G.marks = [];
    seats(); paint();
    if (G.view.last) say(Coach.narrate(Table.nameOf(1 - G.view.turn), G.view.last),
                         G.view.turn === G.mySeat ? "them" : "us");
  } else if (msg.k === "end") {
    G.ended = msg.end;
    var mine = msg.end.winner === G.mySeat;
    banner(msg.end.winner < 0 ? "Drawn" : (mine ? "You win" : "You lose"), "", true);
    seats();
  }
};
/* the guest works out its own legal moves from the position it was sent, so
   picking a piece up is instant instead of a round trip. The host still
   decides — anything the guest sends is checked there before it counts. */
function guestLegal(view) {
  return Rules.moves({ b: view.b, turn: view.turn, quiet: view.quiet || 0, ply: view.ply || 0, log: [] });
}
Table.on.hosting = function () {
  G.mode = "host"; G.mySeat = 0;
  newGame(true);
};
Table.on.seated = function (seat) {
  G.mode = "guest"; G.mySeat = seat;
  shut("ovTogether");
  toast("You're the " + (seat === 0 ? "near" : "far") + " side.");
};
Table.on.link = function () { Table.started(); publish(); };
Table.on.roster = function () { seats(); };
Table.on.drop = function () { seats(); if (G.mode === "host") step(); };

/* ================================================================
   the splash, and the way in
   ================================================================ */
press($("goSolo"), function () { start("solo"); });
press($("goPass"), function () { start("pass"); });
press($("goTogether"), function () { start("solo"); Table.open(); open("ovTogether"); });
press($("goLearn"), function () { open("ovLearn"); });

function start(mode) {
  G.mode = mode; G.mySeat = 0;
  $("splash").classList.add("gone");
  setTimeout(function () { $("splash").style.display = "none"; }, 520);
  P.seen = true; save();
  newGame();
}

/* an invite that arrived as a link goes straight to the door */
(function boot() {
  Gfx.use(P.skin);
  G.st = Rules.start();
  G.view = Rules.publicView(G.st, 0);
  G.legal = Rules.moves(G.st);
  seats();
  requestAnimationFrame(frame);
  window.addEventListener("resize", function () { paint(); });

  splashArt();

  var inv = Table.hashInvite();
  if (inv) {
    start("solo");
    Table.join(inv);
    open("ovTogether");
  }
})();

/* the splash's little board: the position after 11-15, drawn with the same
   painter as the game so the splash cannot look like a different product */
function splashArt() {
  var c = $("splashCv");
  if (!c) return;
  var g = c.getContext("2d");
  var n = 4, cell = Math.floor(Math.min(c.width / 8, c.height / 4));
  var ox = (c.width - cell * 8) / 2, oy = (c.height - cell * n) / 2;
  var s = Gfx.SKINS[P.skin] || Gfx.SKINS.wood;
  for (var r = 0; r < n; r++) for (var col = 0; col < 8; col++) {
    g.fillStyle = ((r + col) & 1) ? s.dark : s.light;
    g.fillRect(ox + col * cell, oy + r * cell, cell, cell);
  }
  var men = [[0, 1], [0, 5], [1, 2], [1, 6], [2, 3], [3, 0], [3, 4], [2, 7]];
  for (var i = 0; i < men.length; i++) {
    var r2 = men[i][0], c2 = men[i][1];
    if (((r2 + c2) & 1) === 0) continue;
    var x = ox + c2 * cell + cell / 2, y = oy + r2 * cell + cell / 2;
    var side = r2 < 2 ? 1 : 0;
    var top = side === 0 ? s.me : s.you, rim = side === 0 ? s.meRim : s.youRim;
    g.fillStyle = rim;
    g.beginPath(); g.arc(x, y, cell * 0.39, 0, 6.284); g.fill();
    g.fillStyle = top;
    g.beginPath(); g.arc(x, y, cell * 0.31, 0, 6.284); g.fill();
  }
}

/* ---------- the service worker ---------- */
if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}

/* a small door for the checks to knock on */
window.CHECKERS = { G: G, Rules: Rules, AI: AI, Table: Table, newGame: newGame, commit: commit };
})();
