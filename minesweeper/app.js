/* app.js — the conductor.

   No network here: minesweeper is one person and a field. What it does need,
   and what most browser versions get wrong, is **touch**.

   A mouse has two buttons and minesweeper needs both. A finger has none, so
   every touch version has to invent the second one, and the usual invention —
   long-press to flag — is the wrong default: flagging is the *rarer* action
   and long-press is the slower gesture, so the common case pays for the rare
   one on every single tap. Here both exist and the tray carries an explicit
   flag mode, because the fastest way to flag twelve squares in a row is to
   stop being asked which you meant.

   The other thing a finger needs is somewhere to put itself. The big board
   is 30×16 and a phone is not, so the field pans and pinches rather than
   being squashed to fit — a 6px cell is not a smaller board, it is an
   unplayable one.

   And one small rule that removes a whole category of misery: **a tap that
   moved is a drag, not a tap.** The pointer has to come up within a few
   pixels and a few hundred milliseconds of where it went down, or the field
   scrolls and nothing is opened. Without it, panning a big board detonates
   it, which is the single most infuriating bug this game can have.        */
(function () {
"use strict";

var $ = function (id) { return document.getElementById(id); };
function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function press(el, fn) { if (el) el.addEventListener("click", function (e) { e.preventDefault(); fn(e); }); }
function open(id) { $(id).classList.remove("hide"); }
function shut(id) { $(id).classList.add("hide"); }

var P = { level: "gentle", skin: "slate", noGuess: true, sound: true, safeFirst: true, best: {}, played: 0, won: 0 };
try {
  var raw = JSON.parse(localStorage.getItem("minesweeper") || "null");
  if (raw) for (var k in P) if (raw[k] !== undefined) P[k] = raw[k];
} catch (e) {}
function save() { try { localStorage.setItem("minesweeper", JSON.stringify(P)); } catch (e) {} }

var cv = $("field");

/* the field. state: 0 hidden · 1 open · 2 flag · 3 maybe */
var G = null;
var UI = { down: -1, chord: null, zoom: 1, reveal: false, boom: -1, mark: -1 };
var started = 0, ticking = 0, elapsed = 0, over = false, flagMode = false;

function level() {
  var L = Core.LEVELS;
  for (var i = 0; i < L.length; i++) if (L[i].key === P.level) return L[i];
  return L[0];
}
function dims() {
  var L = level();
  if (L.key !== "phone") return { w: L.w, h: L.h, mines: L.mines };
  return Core.fit(cv.clientWidth, cv.clientHeight, 34);
}

function newField() {
  var d = dims();
  G = { w: d.w, h: d.h, mines: d.mines, mine: null, adj: null,
        state: new Uint8Array(d.w * d.h), opened: 0, flags: 0, fair: null, dealt: false };
  over = false; UI.reveal = false; UI.boom = -1; UI.chord = null; UI.mark = -1;
  elapsed = 0; started = 0;
  clearInterval(ticking); ticking = 0;
  UI.zoom = 1;
  Gfx.fit(cv, G, UI.zoom);
  banner("", "");
  hud();
  paint();
}

/* The field is not laid out until the first tap, which is what lets the
   first tap be safe *and* lets the whole board be checked for solvability
   from that exact square. Dealing at the start and then moving one mine out
   of the way — the usual trick — cannot promise either. */
function firstTap(i) {
  var d = { w: G.w, h: G.h, mines: G.mines };
  var t0 = Date.now();
  var g = Core.deal(d.w, d.h, d.mines, i, { noGuess: P.noGuess });
  G.mine = g.mine; G.adj = g.adj; G.fair = g.fair; G.dealt = true;
  if (P.noGuess && !g.fair) {
    toast("Couldn't find a no-guess field for this one — you may have to guess at the end.");
  } else if (P.noGuess && Date.now() - t0 > 400) {
    toast("Found you a field with no guessing in it.");
  }
  started = Date.now();
  ticking = setInterval(function () {
    if (over) return;
    elapsed = Math.floor((Date.now() - started) / 1000);
    hud();
  }, 250);
}

/* ---------- opening ---------- */
function openAt(i) {
  if (over || G.state[i] === 1 || G.state[i] === 2) return;
  if (!G.dealt) firstTap(i);
  if (G.mine[i]) { boom(i); return; }
  flood(i);
  hud();
  checkWin();
}
/* iterative rather than recursive: a 40×40 clearing is a deep stack and the
   one board that overflows it is the one somebody is enjoying most */
function flood(start) {
  var stack = [start], seen = {};
  while (stack.length) {
    var i = stack.pop();
    if (seen[i]) continue;
    seen[i] = 1;
    if (G.state[i] === 1 || G.state[i] === 2) continue;
    G.state[i] = 1; G.opened++;
    if (G.adj[i] !== 0) continue;
    var nb = Core.neighbours(G.w, G.h, i);
    for (var j = 0; j < nb.length; j++) if (G.state[nb[j]] === 0) stack.push(nb[j]);
  }
}
function flag(i) {
  if (over || G.state[i] === 1) return;
  /* hidden → flag → maybe → hidden. The maybe is not decoration: on a big
     board it is how you park a deduction you have not finished. */
  if (G.state[i] === 0) { G.state[i] = 2; G.flags++; }
  else if (G.state[i] === 2) { G.state[i] = 3; G.flags--; }
  else { G.state[i] = 0; }
  beep("flag");
  hud();
  paint();
}
/* the chord: tap a number whose flags are all placed and open everything
   else it touches. It is how the game is actually played at speed. */
function chord(i) {
  if (over || G.state[i] !== 1 || !G.adj[i]) return false;
  var nb = Core.neighbours(G.w, G.h, i), f = 0, shut = [], j;
  for (j = 0; j < nb.length; j++) {
    if (G.state[nb[j]] === 2) f++;
    else if (G.state[nb[j]] !== 1) shut.push(nb[j]);
  }
  if (f !== G.adj[i] || !shut.length) return false;
  for (j = 0; j < shut.length; j++) {
    if (G.state[shut[j]] === 3) continue;           /* a maybe is not a decision */
    if (G.mine[shut[j]]) { boom(shut[j]); return true; }
  }
  for (j = 0; j < shut.length; j++) if (G.state[shut[j]] === 0) flood(shut[j]);
  beep("open");
  hud(); paint(); checkWin();
  return true;
}

function boom(i) {
  over = true; UI.reveal = true; UI.boom = i;
  G.state[i] = 1;
  clearInterval(ticking);
  P.played++; save();
  beep("boom");
  banner("Boom", "", true);
  paint();
  setTimeout(function () { showEnd(false); }, 800);
}
function checkWin() {
  if (over) return;
  if (G.opened < G.w * G.h - G.mines) { paint(); return; }
  over = true; UI.reveal = true;
  clearInterval(ticking);
  /* every remaining mine is flagged for you — you found them, the ritual of
     clicking each one is not the game */
  for (var i = 0; i < G.w * G.h; i++) if (G.mine[i] && G.state[i] !== 2) { G.state[i] = 2; G.flags++; }
  P.played++; P.won++;
  var key = level().key;
  var mine = elapsed;
  if (!P.best[key] || mine < P.best[key]) { P.best[key] = mine; toast("Best time for " + level().name + "."); }
  save();
  beep("win");
  banner("Clear", fmt(elapsed), true);
  hud(); paint();
  setTimeout(function () { showEnd(true); }, 800);
}

/* ---------- pointer ----------
   One handler for mouse, pen and finger. A press that moves is a pan. */
var pt = { id: -1, x: 0, y: 0, t: 0, i: -1, moved: false, held: false, holdT: 0, pinch: null };

cv.addEventListener("pointerdown", function (e) {
  cv.setPointerCapture(e.pointerId);
  if (pt.id >= 0) { /* a second finger: this is a pinch, not a tap */
    pt.pinch = { d: 0, zoom: UI.zoom };
    pt.moved = true;
    clearTimeout(pt.holdT);
    UI.down = -1; UI.chord = null;
    paint();
    return;
  }
  pt.id = e.pointerId;
  pt.x = e.clientX; pt.y = e.clientY; pt.t = Date.now(); pt.moved = false; pt.held = false;
  var r = cv.getBoundingClientRect();
  pt.i = Gfx.hit(G, e.clientX - r.left, e.clientY - r.top);
  if (pt.i < 0 || over) return;
  /* the right button is still the right button on a machine that has one */
  if (e.button === 2) { flag(pt.i); pt.held = true; return; }
  showPress(pt.i);
  clearTimeout(pt.holdT);
  pt.holdT = setTimeout(function () {
    if (pt.moved || pt.id < 0) return;
    pt.held = true;
    UI.down = -1; UI.chord = null;
    if (flagMode) openAt(pt.i); else flag(pt.i);
    paint();
    buzz();
  }, 380);
});

cv.addEventListener("pointermove", function (e) {
  if (pt.id < 0) return;
  var dx = e.clientX - pt.x, dy = e.clientY - pt.y;
  if (!pt.moved && dx * dx + dy * dy > 64) {
    pt.moved = true;
    clearTimeout(pt.holdT);
    UI.down = -1; UI.chord = null;
  }
  if (pt.moved && e.pointerId === pt.id) {
    Gfx.view.x += e.clientX - pt.x;
    Gfx.view.y += e.clientY - pt.y;
    pt.x = e.clientX; pt.y = e.clientY;
    Gfx.clamp(cv);
    paint();
  }
});

function endPointer(e) {
  if (e.pointerId !== pt.id) { pt.pinch = null; return; }
  clearTimeout(pt.holdT);
  var quick = Date.now() - pt.t < 380;
  var i = pt.i;
  var moved = pt.moved, held = pt.held;
  pt.id = -1; pt.i = -1; pt.pinch = null;
  UI.down = -1; UI.chord = null;
  if (moved || held || i < 0 || over) { paint(); return; }
  if (!quick) { paint(); return; }
  if (G.state[i] === 1) { if (!chord(i)) paint(); return; }
  if (flagMode) flag(i);
  else if (G.state[i] === 2 || G.state[i] === 3) { paint(); toast("That one's flagged. Tap it again in flag mode to take it off."); }
  else { openAt(i); beep("open"); paint(); }
}
cv.addEventListener("pointerup", endPointer);
cv.addEventListener("pointercancel", endPointer);
cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
/* the wheel zooms, because on a desktop the grim board wants to */
cv.addEventListener("wheel", function (e) {
  e.preventDefault();
  zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
}, { passive: false });

function zoomBy(f) {
  var was = Gfx.view.cell;
  UI.zoom = Math.max(0.6, Math.min(3.2, UI.zoom * f));
  Gfx.fit(cv, G, UI.zoom);
  /* keep the middle of the screen where it was, so zooming does not teleport
     you to a different part of the field */
  var k = Gfx.view.cell / was;
  var pw = cv.clientWidth / 2, ph = cv.clientHeight / 2;
  Gfx.view.x = pw - (pw - Gfx.view.x) * k;
  Gfx.view.y = ph - (ph - Gfx.view.y) * k;
  Gfx.clamp(cv);
  paint();
}

/* the squares that would be opened if you let go here — shown pressed, so a
   chord tells you what it is about to do before it does it */
function showPress(i) {
  if (G.state[i] === 1 && G.adj[i]) {
    var nb = Core.neighbours(G.w, G.h, i), f = 0, list = [], j;
    for (j = 0; j < nb.length; j++) {
      if (G.state[nb[j]] === 2) f++;
      else if (G.state[nb[j]] !== 1) list.push(nb[j]);
    }
    if (f === G.adj[i] && list.length) { UI.chord = list; UI.down = -1; paint(); return; }
  }
  UI.down = i; UI.chord = null;
  paint();
}

/* ---------- the chrome ---------- */
function paint() { if (G) Gfx.draw(cv, G, UI); }
function fmt(s) {
  var m = Math.floor(s / 60), q = s % 60;
  return m ? m + ":" + (q < 10 ? "0" : "") + q : q + "s";
}
function hud() {
  $("hudMines").innerHTML = "⚑ <b>" + (G.mines - G.flags) + "</b>";
  $("hudTime").innerHTML = "⏱ <b>" + fmt(elapsed) + "</b>";
  var b = P.best[level().key];
  $("hudBest").innerHTML = b ? "best <b>" + fmt(b) + "</b>" : "&nbsp;";
  $("btnFlag").classList.toggle("on", flagMode);
  $("btnFlag").innerHTML = "<span class='k'>⚑</span>" + (flagMode ? "Flagging" : "Flag");
}
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
}
function buzz() { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} }

var actx = null;
function beep(kind) {
  if (!P.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    var t = actx.currentTime;
    if (kind === "boom") {
      /* noise, not a tone — a burst of filtered white */
      var n = actx.createBufferSource();
      var buf = actx.createBuffer(1, actx.sampleRate * 0.4, actx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
      n.buffer = buf;
      var f = actx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(90, t + 0.4);
      var g = actx.createGain(); g.gain.value = 0.35;
      n.connect(f); f.connect(g); g.connect(actx.destination);
      n.start(t);
      return;
    }
    var o = actx.createOscillator(), g2 = actx.createGain();
    o.type = kind === "win" ? "sine" : "square";
    var hz = kind === "flag" ? 620 : kind === "win" ? 520 : 380;
    o.frequency.setValueAtTime(hz, t);
    if (kind === "win") o.frequency.setValueAtTime(784, t + 0.11);
    g2.gain.setValueAtTime(kind === "win" ? 0.09 : 0.045, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + (kind === "win" ? 0.3 : 0.06));
    o.connect(g2); g2.connect(actx.destination);
    o.start(t); o.stop(t + (kind === "win" ? 0.32 : 0.08));
  } catch (e) {}
}

/* ---------- the tray ---------- */
press($("btnMenu"), function () { open("ovMenu"); });
press($("btnFlag"), function () { flagMode = !flagMode; hud(); toast(flagMode ? "Tap to flag. Hold to open." : "Tap to open. Hold to flag."); });
press($("btnNew"), function () { newField(); });
press($("btnHint"), function () {
  if (over) return;
  if (!G.dealt) { toast("Tap anywhere to start — the first square is always safe."); return; }
  var d = Core.deduce(G);
  if (!d) {
    toast(P.noGuess && G.fair
      ? "Nothing follows from what's open — but this field can be finished without guessing, so look wider."
      : "Nothing follows from what's open. This one may need a guess.");
    return;
  }
  UI.mark = d.sq;
  paint();
  var where = d.from !== undefined ? " It follows from the " + G.adj[d.from] + " next to it." : "";
  toast((d.mine ? "That one is a mine." : "That one is safe.") + where);
  setTimeout(function () { UI.mark = -1; paint(); }, 3200);
});

press($("mNew"), function () { shut("ovMenu"); newField(); });
press($("mLevel"), function () { shut("ovMenu"); levels(); open("ovLevel"); });
press($("mLook"), function () { shut("ovMenu"); looks(); open("ovLook"); });
press($("mLearn"), function () { shut("ovMenu"); open("ovLearn"); });

function levels() {
  var html = "";
  for (var i = 0; i < Core.LEVELS.length; i++) {
    var L = Core.LEVELS[i];
    var b = P.best[L.key];
    html += "<button class='opt" + (L.key === P.level ? " on" : "") + "' data-l='" + L.key + "'><b>" +
      esc(L.name) + "</b><small>" + esc(L.blurb) + (b ? " · best " + fmt(b) : "") + "</small></button>";
  }
  $("levelBody").innerHTML = "<div class='opts'>" + html + "</div>" +
    "<div class='row'><button class='btn wide" + (P.noGuess ? " on" : "") + "' id='lvNG'>No guessing</button></div>" +
    "<p class='note'>With <b>no guessing</b> on, a field is dealt over and over until one turns up that can be finished by reasoning alone — checked by a solver that only makes deductions you could make. It is on by default because the alternative is losing a good game to a coin toss.</p>";
  Array.prototype.forEach.call($("levelBody").querySelectorAll(".opt"), function (b2) {
    press(b2, function () { P.level = b2.dataset.l; save(); shut("ovLevel"); newField(); });
  });
  press($("lvNG"), function () { P.noGuess = !P.noGuess; save(); levels(); });
}
function looks() {
  var names = { slate: "Slate", paper: "Paper", moss: "Moss" };
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

function showEnd(won) {
  $("endTitle").textContent = won ? "Cleared" : "Boom";
  $("endLead").textContent = won
    ? level().name + " in " + fmt(elapsed) + "."
    : (G.fair ? "That field could have been finished without a guess." : "That field had a guess in it. Bad luck rather than bad play.");
  var b = P.best[level().key];
  $("endBody").innerHTML = "<table class='tally'>" +
    "<tr><th>Best on " + esc(level().name) + "</th><td>" + (b ? fmt(b) : "—") + "</td></tr>" +
    "<tr><th>Cleared</th><td>" + P.won + " of " + P.played + "</td></tr></table>";
  open("ovEnd");
}
press($("endNext"), function () { shut("ovEnd"); newField(); });

Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
  press(b, function () { shut(b.dataset.close); });
});

press($("goPlay"), function () {
  $("splash").classList.add("gone");
  setTimeout(function () { $("splash").style.display = "none"; }, 520);
  newField();
});
press($("goLearn"), function () { open("ovLearn"); });

/* the keyboard, for anybody on a laptop */
window.addEventListener("keydown", function (e) {
  if (e.key === "n" || e.key === "N") newField();
  else if (e.key === "f" || e.key === "F") { flagMode = !flagMode; hud(); }
  else if (e.key === "h" || e.key === "H") $("btnHint").click();
  else if (e.key === "+" || e.key === "=") zoomBy(1.15);
  else if (e.key === "-") zoomBy(1 / 1.15);
});

window.addEventListener("resize", function () {
  if (!G) return;
  if (level().key === "phone" && !G.dealt) { newField(); return; }
  Gfx.fit(cv, G, UI.zoom);
  paint();
});

(function boot() {
  Gfx.use(P.skin);
  newField();
})();

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
window.MINESWEEPER = { G: function () { return G; }, Core: Core, newField: newField };
})();
