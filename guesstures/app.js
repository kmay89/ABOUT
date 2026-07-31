/* app.js — the conductor.

   DOM rather than canvas, for the same reason as the room next door: the
   whole interface is one line of text as large as the phone will draw it, and
   a real element wraps it, respects the reader's font size, and can be read
   out loud by a screen reader. A canvas can do none of those.

   Two things this room does that the describing room does not.

   **The clock is enormous and it is the point.** Next door the timer is
   hidden because the tension is not knowing; here it is shown because the
   tension is watching it go while your team keeps shouting "kettle?" at
   something that is plainly not a kettle. Same component, opposite decision.

   **The rest of the hand is visible.** You can see the three cards behind the
   one you are miming, because knowing that a three-pointer is coming is what
   makes "give up on this one" a real decision rather than an admission.

   As next door, the deadline is a wall-clock timestamp rather than a
   countdown, so a phone that gets pocketed for ten seconds still runs out at
   the right moment.                                                        */
(function () {
"use strict";

var $ = function (id) { return document.getElementById(id); };
function press(el, fn) { if (el) el.addEventListener("click", function (e) { e.preventDefault(); fn(e); }); }
function open(id) { $(id).classList.remove("hide"); }
function shut(id) { $(id).classList.add("hide"); }
function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

var P = { levels: ["easy", "medium", "hard"], target: 20, seconds: 30, sound: true, names: ["Red", "Blue"] };
try {
  var raw = JSON.parse(localStorage.getItem("guesstures") || "null");
  if (raw) for (var k in P) if (raw[k] !== undefined) P[k] = raw[k];
} catch (e) {}
function save() { try { localStorage.setItem("guesstures", JSON.stringify(P)); } catch (e) {} }

var G = { st: null, deadline: 0, raf: 0, lastWhole: -1 };
function rnd() { return Math.random(); }

function newGame() {
  G.st = Rules.start({ target: P.target, seconds: P.seconds, levels: P.levels });
  stopClock();
  show("ready");
  paint();
}
function beginTurn() {
  G.st = Rules.begin(G.st, rnd);
  G.deadline = Date.now() + G.st.seconds * 1000;
  G.lastWhole = -1;
  show("acting");
  paint();
  unlockSound();
  loop();
}
function got() {
  if (!G.st || G.st.phase !== "acting") return;
  var worth = G.st.hand[0] ? G.st.hand[0].worth : 0;
  G.st = Rules.got(G.st);
  ding(worth);
  if (G.st.phase !== "acting") { stopClock(); show(G.st.phase === "over" ? "over" : "tally"); }
  paint();
}
function drop() {
  if (!G.st || G.st.phase !== "acting") return;
  G.st = Rules.pass(G.st);
  thud();
  if (G.st.phase !== "acting") { stopClock(); show(G.st.phase === "over" ? "over" : "tally"); }
  paint();
}
function timeUp() {
  if (!G.st || G.st.phase !== "acting") return;
  G.st = Rules.timeUp(G.st);
  stopClock();
  buzzer();
  show(G.st.phase === "over" ? "over" : "tally");
  paint();
}

function stopClock() {
  if (G.raf) cancelAnimationFrame(G.raf);
  G.raf = 0; G.deadline = 0;
}
function loop() {
  G.raf = requestAnimationFrame(loop);
  if (!G.deadline) return;
  var left = G.deadline - Date.now();
  if (left <= 0) { timeUp(); return; }
  var secs = Math.ceil(left / 1000);
  $("clock").textContent = secs;
  $("clockBar").style.transform = "scaleX(" + (left / (G.st.seconds * 1000)) + ")";
  document.body.classList.toggle("hot", left < 6000);
  if (secs !== G.lastWhole) {
    G.lastWhole = secs;
    if (secs <= 5) tone(1000, 0.05, "square", 0.05);
  }
}
document.addEventListener("visibilitychange", function () {
  if (!document.hidden && G.deadline && Date.now() >= G.deadline) timeUp();
});

/* ================================================================
   the screen
   ================================================================ */
function show(what) {
  $("stageReady").classList.toggle("hide", what !== "ready");
  $("stageAct").classList.toggle("hide", what !== "acting");
  $("stageTally").classList.toggle("hide", what !== "tally" && what !== "over");
  $("clockWrap").classList.toggle("hide", what !== "acting");
  /* a live-looking button that does nothing is worse than no button — the tap
     lands, nothing happens, and the room decides the phone is broken */
  $("btnGot").disabled = what !== "acting";
  if (what !== "acting") document.body.classList.remove("hot");
}
function paint() {
  var st = G.st;
  if (!st) return;
  $("scoreA").textContent = st.scores[0];
  $("scoreB").textContent = st.scores[1];
  $("nameA").textContent = P.names[0];
  $("nameB").textContent = P.names[1];
  $("teamA").classList.toggle("holding", st.team === 0);
  $("teamB").classList.toggle("holding", st.team === 1);

  var card = st.hand[0];
  $("card").textContent = card ? card.word : "";
  $("worth").textContent = card ? (card.worth + (card.worth === 1 ? " point" : " points")) : "";
  $("worth").className = card ? ("worth w" + card.worth) : "worth";

  /* what is still to come — knowing a three-pointer is behind this one is
     what makes giving up a decision */
  var rest = "";
  for (var i = 1; i < st.hand.length; i++) {
    rest += "<span class='pill w" + st.hand[i].worth + "'>" + st.hand[i].worth + "</span>";
  }
  $("queue").innerHTML = st.hand.length > 1
    ? "<span class='qlab'>still to come</span>" + rest : "<span class='qlab'>last one</span>";

  $("readyLead").textContent = P.names[st.team] + " are up";
  $("readySub").textContent = "Four cards, " + st.seconds + " seconds. Anything you don't finish is gone.";
  $("readyScore").textContent = st.scores[0] + " – " + st.scores[1] + ", first to " + st.target;

  if (st.phase === "tally" || st.phase === "over") {
    var gained = Rules.gained(st), dropped = Rules.dropped(st);
    $("tallyTitle").textContent = Rules.over(st)
      ? P.names[Rules.winner(st) < 0 ? st.team : Rules.winner(st)] + " win"
      : gained + (gained === 1 ? " point" : " points") + " to " + P.names[st.team];
    var html = "";
    for (i = 0; i < st.done.length; i++) {
      html += "<li class='got'>" + esc(st.done[i].word) + " <b>+" + st.done[i].worth + "</b></li>";
    }
    for (i = 0; i < st.lost.length; i++) {
      html += "<li class='lost'>" + esc(st.lost[i].word) + " <b>lost</b></li>";
    }
    $("tallyList").innerHTML = html;
    $("tallySub").textContent = dropped
      ? dropped + (dropped === 1 ? " point" : " points") + " left on the table."
      : "Nothing left behind.";
    $("tallyNext").textContent = Rules.over(st) ? "Play again" : P.names[1 - st.team] + " next";
  }
}

/* ================================================================
   noise
   ================================================================ */
var actx = null;
function unlockSound() {
  if (!P.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
  } catch (e) { actx = null; }
}
function tone(f, len, type, vol) {
  if (!P.sound || !actx) return;
  try {
    var t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(vol === undefined ? 0.05 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + len + 0.02);
  } catch (e) {}
}
/* a three-pointer should sound like a three-pointer */
function ding(worth) {
  unlockSound();
  var notes = worth >= 3 ? [523, 659, 880] : worth === 2 ? [523, 784] : [659];
  for (var i = 0; i < notes.length; i++) {
    (function (n, k) { setTimeout(function () { tone(n, 0.18, "sine", 0.06); }, k * 80); })(notes[i], i);
  }
}
function thud() { unlockSound(); tone(150, 0.14, "triangle", 0.05); }
function buzzer() {
  unlockSound();
  if (!P.sound || !actx) return;
  try {
    var t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(95, t + 0.8);
    g.gain.setValueAtTime(0.09, t);
    g.gain.setValueAtTime(0.09, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + 0.95);
  } catch (e) {}
  if (navigator.vibrate) { try { navigator.vibrate([240, 80, 240]); } catch (e) {} }
}

/* ================================================================
   the buttons
   ================================================================ */
press($("btnGo"), beginTurn);
press($("btnGot"), got);
press($("btnDrop"), drop);
press($("tallyNext"), function () {
  if (Rules.over(G.st)) { newGame(); return; }
  G.st = Rules.next(G.st);
  show("ready");
  paint();
});
press($("btnMenu"), function () { open("ovMenu"); });
press($("mNew"), function () { shut("ovMenu"); newGame(); });
press($("mSetup"), function () { shut("ovMenu"); setup(); open("ovSetup"); });
press($("mLearn"), function () { shut("ovMenu"); open("ovLearn"); });

/* the card is the button — a phone held up in front of a room is not aimed at
   a small target. Giving up has its own, because it is a real decision. */
press($("cardWrap"), got);

function setup() {
  var levels = ["easy", "medium", "hard"], html = "", i;
  var pick = { easy: "One point each. Things a body plainly does.",
               medium: "Two points. Needs a bit of staging.",
               hard: "Three points. Somebody is going to be a scarecrow in a gale." };
  for (i = 0; i < levels.length; i++) {
    var lv = levels[i], on = P.levels.indexOf(lv) >= 0;
    html += "<button class='opt" + (on ? " on" : "") + "' data-lv='" + lv + "'><b>" +
      lv.charAt(0).toUpperCase() + lv.slice(1) + " · " + Words.count("act", lv) + " cards</b><small>" +
      pick[lv] + "</small></button>";
  }
  var secs = "";
  for (i = 0; i < 3; i++) {
    var sv = [20, 30, 45][i];
    secs += "<button class='opt" + (sv === P.seconds ? " on" : "") + "' data-s='" + sv + "'><b>" + sv +
      "s</b><small>" + (sv === 20 ? "Frantic" : sv === 30 ? "The usual" : "Generous") + "</small></button>";
  }
  var targets = "";
  for (i = 0; i < 3; i++) {
    var t = [12, 20, 30][i];
    targets += "<button class='opt" + (t === P.target ? " on" : "") + "' data-t='" + t + "'><b>" + t +
      "</b><small>" + (t === 12 ? "Quick" : t === 20 ? "The usual" : "A long one") + "</small></button>";
  }
  $("setupBody").innerHTML =
    "<div class='fld'><label><b>Team names</b></label>" +
    "<input id='nmA' maxlength='12' value='" + esc(P.names[0]) + "'> " +
    "<input id='nmB' maxlength='12' value='" + esc(P.names[1]) + "'></div>" +
    "<div class='fld'><label><b>Which cards</b></label><div class='opts'>" + html + "</div></div>" +
    "<div class='fld'><label><b>Seconds a turn</b></label><div class='opts'>" + secs + "</div></div>" +
    "<div class='fld'><label><b>First to</b></label><div class='opts'>" + targets + "</div></div>" +
    "<div class='row'><button class='btn" + (P.sound ? " on" : "") + "' id='suSnd'>Sound</button></div>" +
    "<div class='row'><button class='btn primary wide' id='suGo'>Start with these</button></div>";
  Array.prototype.forEach.call($("setupBody").querySelectorAll("[data-lv]"), function (b) {
    press(b, function () {
      var lv = b.dataset.lv, at = P.levels.indexOf(lv);
      if (at >= 0) { if (P.levels.length > 1) P.levels.splice(at, 1); }
      else P.levels.push(lv);
      /* keep them in order, so the hand is always easy-first */
      P.levels.sort(function (a, c) { return levels.indexOf(a) - levels.indexOf(c); });
      save(); setup();
    });
  });
  Array.prototype.forEach.call($("setupBody").querySelectorAll("[data-s]"), function (b) {
    press(b, function () { P.seconds = parseInt(b.dataset.s, 10); save(); setup(); });
  });
  Array.prototype.forEach.call($("setupBody").querySelectorAll("[data-t]"), function (b) {
    press(b, function () { P.target = parseInt(b.dataset.t, 10); save(); setup(); });
  });
  press($("suSnd"), function () { P.sound = !P.sound; save(); setup(); });
  press($("suGo"), function () {
    P.names = [($("nmA").value || "Red").trim().slice(0, 12), ($("nmB").value || "Blue").trim().slice(0, 12)];
    save();
    shut("ovSetup");
    newGame();
  });
}

Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
  press(b, function () { shut(b.dataset.close); });
});

press($("goPlay"), function () {
  $("splash").classList.add("gone");
  setTimeout(function () { $("splash").style.display = "none"; }, 520);
  newGame();
});
press($("goLearn"), function () { open("ovLearn"); });

newGame();

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
window.GUESSTURES = { G: G, Rules: Rules, Words: Words, newGame: newGame };
})();
