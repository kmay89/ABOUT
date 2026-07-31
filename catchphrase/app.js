/* app.js — the conductor.

   The only room here with no canvas in it, and that is deliberate: the whole
   interface is one word, as large as the phone will draw it, and a real
   `<div>` renders text better than a canvas ever will — it wraps, it respects
   the reader's font size, and a screen reader can say it out loud.

   The clock is the interesting part.

   **It is never shown.** `Rules.roundLength` picks a number between
   forty-five and seventy-five seconds and nothing on the screen is a function
   of it — not a bar, not a number, not a colour. What the phone does instead
   is *tick*, and the ticks get closer together, so the room knows it is
   coming and cannot know when. That asymmetry is the game.

   **It survives the screen locking.** A phone being passed round a room gets
   dropped, pocketed and backgrounded, and a countdown built on setInterval
   silently stops when it is. So the deadline is a wall-clock timestamp,
   checked on every frame and again whenever the page comes back — the buzzer
   goes off at the right moment even if the phone was asleep for ten seconds
   of it.                                                                   */
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

var P = { levels: ["easy", "medium"], target: 7, sound: true, names: ["Red", "Blue"], plays: 0 };
try {
  var raw = JSON.parse(localStorage.getItem("catchphrase") || "null");
  if (raw) for (var k in P) if (raw[k] !== undefined) P[k] = raw[k];
} catch (e) {}
function save() { try { localStorage.setItem("catchphrase", JSON.stringify(P)); } catch (e) {} }

var G = { st: null, deadline: 0, nextTick: 0, length: 0, raf: 0 };
function rnd() { return Math.random(); }

/* ================================================================
   the game
   ================================================================ */
function newGame() {
  G.st = Rules.start({ target: P.target, levels: P.levels });
  stopClock();
  show("ready");
  paint();
}
function beginRound() {
  G.st = Rules.begin(G.st, rnd);
  G.length = Rules.roundLength(G.st, rnd);
  /* a timestamp, not a countdown — see the note at the top */
  G.deadline = Date.now() + G.length * 1000;
  G.nextTick = Date.now() + 900;
  show("running");
  paint();
  unlockSound();
  loop();
}
function got() {
  if (!G.st || G.st.phase !== "running") return;
  G.st = Rules.got(G.st, rnd);
  blip(660);
  paint();
}
function skip() {
  if (!G.st || G.st.phase !== "running") return;
  G.st = Rules.skip(G.st, rnd);
  blip(300);
  paint();
}
function buzz() {
  if (!G.st || G.st.phase !== "running") return;
  G.st = Rules.buzz(G.st);
  stopClock();
  buzzer();
  show(G.st.phase === "over" ? "over" : "buzzed");
  paint();
}

function stopClock() {
  if (G.raf) cancelAnimationFrame(G.raf);
  G.raf = 0; G.deadline = 0;
}
function loop() {
  G.raf = requestAnimationFrame(loop);
  if (!G.deadline) return;
  var now = Date.now(), left = G.deadline - now;
  if (left <= 0) { buzz(); return; }
  if (now >= G.nextTick) {
    /* the ticks close up as the end approaches — from about one a second
       down to four a second. The room can hear the shape of it without
       anybody being able to count it. */
    var frac = Math.max(0, Math.min(1, left / (G.length * 1000)));
    var gap = 220 + 780 * frac * frac;
    G.nextTick = now + gap;
    tick(frac);
    document.body.classList.toggle("hot", frac < 0.22);
  }
}
/* a phone that was in a pocket for ten seconds must still buzz on time */
document.addEventListener("visibilitychange", function () {
  if (!document.hidden && G.deadline && Date.now() >= G.deadline) buzz();
});

/* ================================================================
   the screen
   ================================================================ */
function show(what) {
  $("stageReady").classList.toggle("hide", what !== "ready");
  $("stagePlay").classList.toggle("hide", what !== "running");
  $("stageBuzz").classList.toggle("hide", what !== "buzzed" && what !== "over");
  document.body.classList.toggle("live", what === "running");
  /* a live-looking button that does nothing is worse than no button */
  $("btnGot").disabled = what !== "running";
  if (what !== "running") document.body.classList.remove("hot");
}
function paint() {
  var st = G.st;
  if (!st) return;
  $("scoreA").textContent = st.scores[0];
  $("scoreB").textContent = st.scores[1];
  $("nameA").textContent = P.names[0];
  $("nameB").textContent = P.names[1];
  $("teamA").classList.toggle("holding", st.phase === "running" && st.holder === 0);
  $("teamB").classList.toggle("holding", st.phase === "running" && st.holder === 1);

  $("word").textContent = st.word || "";
  $("level").textContent = st.level ? st.level : "";
  $("holder").textContent = st.phase === "running"
    ? P.names[st.holder] + " — describe it" : "";
  $("tally").textContent = st.passes
    ? st.passes + (st.passes === 1 ? " word" : " words") + " this round" +
      (st.skipped ? " · " + st.skipped + " skipped" : "")
    : "";

  $("readyLead").textContent = st.round === 0
    ? P.names[st.starter] + " starts. Hand the phone to them."
    : "Hand the phone to " + P.names[st.starter] + ".";
  $("readyRound").textContent = st.round === 0 ? "First to " + st.target
    : st.scores[0] + " – " + st.scores[1] + ", first to " + st.target;

  if (st.last && st.last.k === "buzz") {
    var caught = P.names[st.last.caught], scored = P.names[st.last.scored];
    $("buzzTitle").textContent = Rules.over(st) ? scored + " win" : "Caught out";
    $("buzzLead").textContent = Rules.over(st)
      ? scored + " get there " + st.scores[st.last.scored] + " – " + st.scores[st.last.caught] + "."
      : caught + " were holding it, so " + scored + " take the point. It was “" + st.last.word + "”.";
    $("buzzNext").textContent = Rules.over(st) ? "Play again" : "Next round";
  }
}

/* ================================================================
   noise — and it is most of the interface
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
    o.type = type || "square";
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(vol === undefined ? 0.05 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + len + 0.02);
  } catch (e) {}
}
function tick(frac) {
  tone(frac < 0.22 ? 1100 : 820, 0.035, "square", 0.035);
  if (navigator.vibrate && frac < 0.22) { try { navigator.vibrate(8); } catch (e) {} }
}
function blip(f) { unlockSound(); tone(f, 0.09, "sine", 0.06); }
function buzzer() {
  unlockSound();
  if (!P.sound || !actx) return;
  try {
    var t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.9);
    g.gain.setValueAtTime(0.09, t);
    g.gain.setValueAtTime(0.09, t + 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + 1.05);
  } catch (e) {}
  if (navigator.vibrate) { try { navigator.vibrate([260, 90, 260]); } catch (e) {} }
}

/* ================================================================
   the buttons
   ================================================================ */
press($("btnGo"), beginRound);
press($("btnGot"), got);
press($("btnSkip"), skip);
press($("buzzNext"), function () {
  if (Rules.over(G.st)) { newGame(); return; }
  show("ready");
  paint();
});
press($("btnMenu"), function () { open("ovMenu"); });
press($("mNew"), function () { shut("ovMenu"); newGame(); });
press($("mSetup"), function () { shut("ovMenu"); setup(); open("ovSetup"); });
press($("mLearn"), function () { shut("ovMenu"); open("ovLearn"); });

/* the whole word is the button, because a phone being passed round a room in
   the dark is not a phone anybody is going to aim at a small target */
press($("stagePlay"), function (e) {
  if (e.target && e.target.id === "btnSkip") return;
  got();
});

function setup() {
  var levels = ["easy", "medium", "hard"], html = "", i;
  var pick = { easy: "Short and concrete. Fine for children.",
               medium: "Everyday phrases. This is the game.",
               hard: "Abstractions and idioms. Bring a thesaurus." };
  for (i = 0; i < levels.length; i++) {
    var lv = levels[i], on = P.levels.indexOf(lv) >= 0;
    html += "<button class='opt" + (on ? " on" : "") + "' data-lv='" + lv + "'><b>" +
      lv.charAt(0).toUpperCase() + lv.slice(1) + " · " + Words.count("say", lv) + " words</b><small>" +
      pick[lv] + "</small></button>";
  }
  var targets = "";
  for (i = 0; i < 3; i++) {
    var t = [5, 7, 10][i];
    targets += "<button class='opt" + (t === P.target ? " on" : "") + "' data-t='" + t + "'><b>" + t +
      "</b><small>" + (t === 5 ? "Quick" : t === 7 ? "The usual" : "A long one") + "</small></button>";
  }
  $("setupBody").innerHTML =
    "<div class='fld'><label><b>Team names</b></label>" +
    "<input id='nmA' maxlength='12' value='" + esc(P.names[0]) + "'> " +
    "<input id='nmB' maxlength='12' value='" + esc(P.names[1]) + "'></div>" +
    "<div class='fld'><label><b>Which words</b></label><div class='opts'>" + html + "</div></div>" +
    "<div class='fld'><label><b>First to</b></label><div class='opts'>" + targets + "</div></div>" +
    "<div class='row'><button class='btn" + (P.sound ? " on" : "") + "' id='suSnd'>Sound</button></div>" +
    "<p class='note'>The sound is not decoration here — the ticking is the only thing telling the room the buzzer is coming, and it is what makes the last ten seconds worth playing for. With it off, the phone still buzzes and still vibrates.</p>" +
    "<div class='row'><button class='btn primary wide' id='suGo'>Start with these</button></div>";
  Array.prototype.forEach.call($("setupBody").querySelectorAll("[data-lv]"), function (b) {
    press(b, function () {
      var lv = b.dataset.lv, at = P.levels.indexOf(lv);
      if (at >= 0) { if (P.levels.length > 1) P.levels.splice(at, 1); }
      else P.levels.push(lv);
      save(); setup();
    });
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
window.CATCHPHRASE = { G: G, Rules: Rules, Words: Words, newGame: newGame };
})();
