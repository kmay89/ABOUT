/* app.js — input, painting, and the shape of a run.

   game.js does the physics in field units and knows nothing about pixels;
   this file owns the one transform between them and everything you can see.

   ## Aiming with a thumb

   The paddle does not go where your finger is — it goes where your finger
   *moves*. Absolute positioning means your thumb has to sit on the paddle,
   which is at the bottom of the screen, which is exactly where your hand is
   covering the thing you are trying to watch. So a drag is relative: put your
   finger anywhere, move it an inch, the paddle moves an inch's worth. You can
   play with your thumb halfway up the screen and see everything.

   A mouse is the opposite — it has a cursor, and a cursor that the paddle
   ignores feels broken — so a mouse is absolute and a finger is relative, and
   the game decides by pointer type rather than by asking anybody.

   ## The frame

   Fixed timestep, accumulated. A brick game with a variable step is a brick
   game where the ball behaves differently on a 120Hz phone, and where a
   frame-rate hiccup teleports the ball through the wall. The accumulator is
   capped, so a tab that was in the background for a minute resumes rather
   than fast-forwarding through the minute it missed.                       */
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

var P = { best: 0, far: 1, sound: true, relative: null, shake: true };
try {
  var raw = JSON.parse(localStorage.getItem("breaker") || "null");
  if (raw) for (var k in P) if (raw[k] !== undefined) P[k] = raw[k];
} catch (e) {}
function save() { try { localStorage.setItem("breaker", JSON.stringify(P)); } catch (e) {} }

var cv = $("field");
var C = Game.consts;
var g = null, mode = "title", level = 1, lives = 3, total = 0;
var bits = [], shake = 0, flash = 0, note = null;

/* the one transform: field units → pixels */
var F = { x: 0, y: 0, s: 1 };
function fit() {
  var w = cv.clientWidth, h = cv.clientHeight;
  F.s = Math.min(w, h / C.H);
  F.x = (w - F.s) / 2;
  F.y = (h - F.s * C.H) / 2;
}
function px(x) { return F.x + x * F.s; }
function py(y) { return F.y + y * F.s; }

/* ================================================================
   the run
   ================================================================ */
function startRun() {
  level = 1; lives = 3; total = 0;
  begin();
}
function begin() {
  g = Game.start(level, lives);
  g.score = total;
  bits = [];
  mode = "intro";
  note = { t: 0, big: "Level " + level, sub: shapeWord(level) };
  fit();
  hud();
}
function shapeWord(n) {
  var names = ["courses", "a chequer", "a pyramid", "piers", "a diamond", "a door",
               "a zigzag", "a fortress", "rings", "a comb"];
  var w = names[(n - 1) % names.length];
  var round = Math.floor((n - 1) / names.length);
  return round ? w + ", harder" : w;
}

function nextLevel() {
  total = g.score;
  lives = g.lives;
  level++;
  if (level > P.far) { P.far = level; save(); }
  begin();
}
function gameOver() {
  mode = "over";
  if (g.score > P.best) { P.best = g.score; save(); }
  $("endTitle").textContent = "Out of balls";
  $("endLead").textContent = "Level " + level + ", " + g.score + " points" +
    (g.best > 2 ? " · longest run without touching the paddle: " + g.best : "") + ".";
  $("endBody").innerHTML = "<table class='tally'>" +
    "<tr><th>Best score</th><td>" + P.best + "</td></tr>" +
    "<tr><th>Furthest level</th><td>" + P.far + "</td></tr></table>";
  open("ovEnd");
}

/* ================================================================
   the loop
   ================================================================ */
var STEP = 1 / 120, acc = 0, last = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  var dt = last ? (ts - last) / 1000 : 0;
  last = ts;
  if (dt > 0.25) dt = 0.25;              /* back from a background tab */
  if (mode === "play" || mode === "intro") {
    if (note) {
      note.t += dt;
      if (note.t > 1.1) { note = null; if (mode === "intro") mode = "play"; }
    }
    if (mode === "play" && g) {
      acc += dt;
      var guard = 0;
      while (acc >= STEP && guard++ < 12) {
        acc -= STEP;
        react(Game.step(g, STEP));
      }
      if (g.cleared) { mode = "cleared"; note = { t: 0, big: "Cleared", sub: shapeWord(level) }; setTimeout(nextLevel, 1200); }
      else if (g.over) gameOver();
    }
  }
  if (shake > 0) shake = Math.max(0, shake - dt * 3.6);
  if (flash > 0) flash = Math.max(0, flash - dt * 4);
  paintBits(dt);
  draw();
}

function react(ev) {
  var i;
  for (i = 0; i < ev.hits.length; i++) {
    if (ev.hits[i] === "paddle") beep(220, 0.05, "square");
    else if (ev.hits[i] === "solid") { beep(120, 0.06, "square"); shake = Math.max(shake, 0.4); }
    else if (ev.hits[i] === "brick") beep(420, 0.03, "square");
    else beep(520, 0.02, "square");
  }
  for (i = 0; i < ev.broke.length; i++) {
    var b = ev.broke[i];
    burst(px(b.x), py(b.y), Levels.COLOUR[b.v] ? Levels.COLOUR[b.v][0] : "#fff");
    beep(520 + Math.min(g.combo, 12) * 45, 0.05, "triangle");
    shake = Math.max(shake, 0.25);
  }
  if (ev.lost) { beep(140, 0.35, "sawtooth"); shake = 1; flash = 1; }
  if (ev.drop) {
    var d = null;
    for (i = 0; i < Game.DROPS.length; i++) if (Game.DROPS[i].k === ev.drop) d = Game.DROPS[i];
    if (d) {
      note = { t: 0, big: d.name, sub: d.say, small: true };
      beep(d.good ? 660 : 200, 0.14, "sine");
    }
  }
  if (ev.caught) beep(330, 0.05, "sine");
  hud();
}

/* ================================================================
   input
   ================================================================ */
var drag = { id: -1, x: 0, base: 0, rel: false };

cv.addEventListener("pointerdown", function (e) {
  if (mode === "title") return;
  cv.setPointerCapture(e.pointerId);
  drag.id = e.pointerId;
  var r = cv.getBoundingClientRect();
  drag.x = e.clientX - r.left;
  drag.base = g ? g.paddle.x : 0.5;
  /* a mouse has a cursor and the paddle must respect it; a finger does not,
     and would otherwise have to sit on top of the thing it is aiming */
  drag.rel = P.relative === null ? (e.pointerType === "touch") : !!P.relative;
  if (drag.rel === false) aimAbs(drag.x);
  if (!g) return;
  if (g.stuck) Game.launch(g);
  else if (g.laser > 0) { if (Game.fire(g)) beep(880, 0.04, "sawtooth"); }
});
cv.addEventListener("pointermove", function (e) {
  if (drag.id !== e.pointerId || !g) return;
  var r = cv.getBoundingClientRect();
  var x = e.clientX - r.left;
  if (drag.rel) {
    /* a touch of gearing: an inch of thumb is a little more than an inch of
       paddle, because a thumb has less room to travel than the screen does */
    Game.aim(g, drag.base + (x - drag.x) / F.s * 1.35);
  } else aimAbs(x);
});
function aimAbs(x) { if (g) Game.aim(g, (x - F.x) / F.s); }
function endDrag(e) { if (drag.id === e.pointerId) drag.id = -1; }
cv.addEventListener("pointerup", endDrag);
cv.addEventListener("pointercancel", endDrag);

var keys = {};
window.addEventListener("keydown", function (e) {
  keys[e.key] = true;
  if (e.key === " " ) {
    e.preventDefault();
    if (mode === "play" && g) { if (g.stuck) Game.launch(g); else Game.fire(g); }
  } else if (e.key === "p" || e.key === "Escape") togglePause();
});
window.addEventListener("keyup", function (e) { keys[e.key] = false; });
setInterval(function () {
  if (mode !== "play" || !g) return;
  var d = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
  if (d) Game.aim(g, g.paddle.x + d * 0.028);
}, 16);

function togglePause() {
  if (mode === "play") { mode = "paused"; open("ovPause"); }
  else if (mode === "paused") { shut("ovPause"); mode = "play"; last = 0; acc = 0; }
}
/* a phone that rings mid-level should not cost you a ball */
document.addEventListener("visibilitychange", function () {
  if (document.hidden && mode === "play") togglePause();
});

/* ================================================================
   painting
   ================================================================ */
function draw() {
  var dpr = Math.min(3, root_dpr());
  var w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    fit();
  }
  var x = cv.getContext("2d");
  x.setTransform(dpr, 0, 0, dpr, 0, 0);

  var sx = 0, sy = 0;
  if (shake > 0 && P.shake) {
    sx = (Math.random() - 0.5) * shake * F.s * 0.02;
    sy = (Math.random() - 0.5) * shake * F.s * 0.02;
  }
  x.save();
  x.translate(sx, sy);

  /* the room behind the field */
  var bg = x.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#0d1018");
  bg.addColorStop(1, "#07090e");
  x.fillStyle = bg;
  x.fillRect(-sx, -sy, w, h);

  if (!g) { x.restore(); return; }

  /* the field, with its own faint floor so the bottom edge is somewhere
     rather than nowhere */
  var fx = px(0), fy = py(0), fw = F.s, fh = F.s * C.H;
  x.fillStyle = "#111623";
  x.fillRect(fx, fy, fw, fh);
  var floor = x.createLinearGradient(0, fy + fh - F.s * 0.12, 0, fy + fh);
  floor.addColorStop(0, "rgba(224,106,82,0)");
  floor.addColorStop(1, "rgba(224,106,82,.22)");
  x.fillStyle = floor;
  x.fillRect(fx, fy + fh - F.s * 0.12, fw, F.s * 0.12);
  x.strokeStyle = "rgba(255,255,255,.09)";
  x.lineWidth = 2;
  x.strokeRect(fx + 1, fy + 1, fw - 2, fh - 2);

  bricks(x);
  drops(x);
  shots(x);
  paddle(x);
  balls(x);
  bitsDraw(x);

  x.restore();

  if (flash > 0) {
    x.fillStyle = "rgba(224,106,82," + (flash * 0.3).toFixed(3) + ")";
    x.fillRect(0, 0, w, h);
  }
  if (note) {
    var k = Math.min(1, note.t * 4), out = Math.max(0, 1 - (note.t - 0.75) * 4);
    x.globalAlpha = Math.min(k, out);
    x.textAlign = "center";
    x.fillStyle = "#ffd77a";
    x.font = "800 " + Math.round(F.s * (note.small ? 0.09 : 0.14)) + "px system-ui,sans-serif";
    x.fillText(note.big, w / 2, h * 0.42);
    x.fillStyle = "rgba(255,255,255,.8)";
    x.font = "600 " + Math.round(F.s * 0.05) + "px system-ui,sans-serif";
    x.fillText(note.sub, w / 2, h * 0.42 + F.s * 0.075);
    x.globalAlpha = 1;
  }
}
function root_dpr() { return window.devicePixelRatio || 1; }

function bricks(x) {
  var L = g.L, bw = F.s / L.cols, bh = C.BRICK_H * F.s;
  for (var r = 0; r < L.rows; r++) for (var c = 0; c < L.cols; c++) {
    var v = L.grid[r][c];
    if (!v) continue;
    var bx = px(c / L.cols), by = py(C.WALL_TOP + r * C.BRICK_H);
    var col = Levels.COLOUR[v] || Levels.COLOUR[1];
    var gap = Math.max(1, bw * 0.045);
    /* the bevel: a lit top edge and a dark bottom, which is what makes a
       flat rectangle read as a solid object */
    x.fillStyle = col[1];
    x.fillRect(bx + gap, by + gap, bw - gap * 2, bh - gap * 2);
    var lg = x.createLinearGradient(0, by, 0, by + bh);
    lg.addColorStop(0, col[0]);
    lg.addColorStop(1, col[1]);
    x.fillStyle = lg;
    x.fillRect(bx + gap, by + gap, bw - gap * 2, bh - gap * 2.6);
    x.fillStyle = "rgba(255,255,255,.22)";
    x.fillRect(bx + gap, by + gap, bw - gap * 2, Math.max(1, bh * 0.09));
    if (v === 9) {
      /* the hatching that says "this one never breaks" */
      x.save();
      x.beginPath(); x.rect(bx + gap, by + gap, bw - gap * 2, bh - gap * 2); x.clip();
      x.strokeStyle = "rgba(0,0,0,.3)";
      x.lineWidth = Math.max(1, bw * 0.05);
      for (var q = -bh; q < bw + bh; q += Math.max(4, bw * 0.18)) {
        x.beginPath(); x.moveTo(bx + q, by); x.lineTo(bx + q + bh, by + bh); x.stroke();
      }
      x.restore();
    } else if (v > 1) {
      x.fillStyle = "rgba(0,0,0,.4)";
      x.textAlign = "center"; x.textBaseline = "middle";
      x.font = "800 " + Math.round(bh * 0.5) + "px system-ui,sans-serif";
      x.fillText(String(v), bx + bw / 2, by + bh / 2);
    }
  }
}

function paddle(x) {
  var pw = g.paddle.w * F.s, ph = F.s * 0.022;
  var pxx = px(g.paddle.x) - pw / 2, pyy = py(C.PADDLE_Y);
  var lg = x.createLinearGradient(0, pyy, 0, pyy + ph);
  lg.addColorStop(0, g.catching ? "#8fd7b0" : "#e8e2d6");
  lg.addColorStop(1, g.catching ? "#3f9c72" : "#8d857a");
  x.fillStyle = lg;
  rr(x, pxx, pyy, pw, ph, ph / 2);
  x.fill();
  if (g.laser > 0) {
    x.fillStyle = "#e06a52";
    x.fillRect(pxx + pw * 0.08, pyy - ph * 0.6, pw * 0.08, ph * 0.7);
    x.fillRect(pxx + pw * 0.84, pyy - ph * 0.6, pw * 0.08, ph * 0.7);
  }
}

function balls(x) {
  for (var i = 0; i < g.balls.length; i++) {
    var b = g.balls[i];
    var bx = px(b.x), by = py(b.y), r = C.BALL_R * F.s;
    /* a short trail behind the direction of travel — cheap, and it is what
       makes a fast ball readable at all */
    if (!b.held) {
      var tg = x.createLinearGradient(bx - b.vx * r * 5, by - b.vy * r * 5, bx, by);
      tg.addColorStop(0, "rgba(255,215,122,0)");
      tg.addColorStop(1, "rgba(255,215,122,.5)");
      x.strokeStyle = tg;
      x.lineWidth = r * 1.5;
      x.lineCap = "round";
      x.beginPath();
      x.moveTo(bx - b.vx * r * 5, by - b.vy * r * 5);
      x.lineTo(bx, by);
      x.stroke();
    }
    var rg = x.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.1, bx, by, r);
    rg.addColorStop(0, "#ffffff");
    rg.addColorStop(1, "#ffd77a");
    x.fillStyle = rg;
    x.beginPath(); x.arc(bx, by, r, 0, 6.284); x.fill();
  }
}

function drops(x) {
  for (var i = 0; i < g.drops.length; i++) {
    var d = g.drops[i], info = null;
    for (var j = 0; j < Game.DROPS.length; j++) if (Game.DROPS[j].k === d.k) info = Game.DROPS[j];
    var w = F.s * 0.062, h = F.s * 0.03;
    var dx = px(d.x) - w / 2, dy = py(d.y) - h / 2;
    x.fillStyle = info && info.good ? "#3ecf8e" : "#e06a52";
    rr(x, dx, dy, w, h, h / 2);
    x.fill();
    x.fillStyle = "rgba(0,0,0,.72)";
    x.textAlign = "center"; x.textBaseline = "middle";
    x.font = "800 " + Math.round(h * 0.66) + "px system-ui,sans-serif";
    x.fillText(info ? info.name.charAt(0) : "?", dx + w / 2, dy + h / 2 + 1);
  }
}
function shots(x) {
  x.fillStyle = "#e06a52";
  for (var i = 0; i < g.shots.length; i++) {
    var s = g.shots[i];
    x.fillRect(px(s.x) - F.s * 0.004, py(s.y) - F.s * 0.03, F.s * 0.008, F.s * 0.03);
  }
}

/* ---------- the crumbs a brick leaves ---------- */
function burst(x, y, col) {
  for (var i = 0; i < 9; i++) {
    bits.push({ x: x, y: y, vx: (Math.random() - 0.5) * F.s * 0.7,
                vy: (Math.random() - 0.6) * F.s * 0.7, life: 1, c: col,
                s: F.s * (0.005 + Math.random() * 0.007) });
  }
  if (bits.length > 400) bits.splice(0, bits.length - 400);
}
function paintBits(dt) {
  for (var i = bits.length - 1; i >= 0; i--) {
    var b = bits[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.vy += F.s * 1.4 * dt;
    b.life -= dt * 1.6;
    if (b.life <= 0) bits.splice(i, 1);
  }
}
function bitsDraw(x) {
  for (var i = 0; i < bits.length; i++) {
    var b = bits[i];
    x.globalAlpha = Math.max(0, b.life);
    x.fillStyle = b.c;
    x.fillRect(b.x - b.s / 2, b.y - b.s / 2, b.s, b.s);
  }
  x.globalAlpha = 1;
}
function rr(x, a, b, w, h, r) {
  x.beginPath();
  x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r);
  x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r);
  x.arcTo(a, b, a + w, b, r);
  x.closePath();
}

/* ================================================================
   the chrome
   ================================================================ */
function hud() {
  if (!g) return;
  $("hudScore").innerHTML = "<b>" + g.score + "</b>";
  $("hudLevel").innerHTML = "level <b>" + level + "</b>";
  var l = "";
  for (var i = 0; i < Math.min(g.lives, 6); i++) l += "●";
  if (g.lives > 6) l += " ×" + g.lives;
  $("hudLives").innerHTML = l || "—";
  $("hudCombo").innerHTML = g.combo > 1 ? "×<b>" + g.combo + "</b>" : "&nbsp;";
}

var actx = null;
function beep(hz, len, type) {
  if (!P.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    var t = actx.currentTime;
    var o = actx.createOscillator(), gg = actx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(hz, t);
    if (type === "sawtooth") o.frequency.exponentialRampToValueAtTime(hz * 0.4, t + len);
    gg.gain.setValueAtTime(0.035, t);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(gg); gg.connect(actx.destination);
    o.start(t); o.stop(t + len + 0.02);
  } catch (e) {}
}

press($("btnPause"), togglePause);
press($("btnMenu"), function () { if (mode === "play") togglePause(); else open("ovPause"); });
press($("pResume"), function () { shut("ovPause"); if (g && !g.over) { mode = "play"; last = 0; acc = 0; } });
press($("pRestart"), function () { shut("ovPause"); startRun(); });
press($("pHow"), function () { shut("ovPause"); open("ovLearn"); });
press($("pSound"), function () { P.sound = !P.sound; save(); $("pSound").classList.toggle("on", P.sound); });
press($("pAim"), function () {
  P.relative = P.relative === null ? false : (P.relative ? null : true);
  save();
  aimLabel();
});
function aimLabel() {
  $("pAim").textContent = P.relative === null ? "Aim: by touch type"
    : P.relative ? "Aim: always drag" : "Aim: always follow";
}
press($("endNext"), function () { shut("ovEnd"); startRun(); });
press($("goPlay"), function () {
  $("splash").classList.add("gone");
  setTimeout(function () { $("splash").style.display = "none"; }, 520);
  startRun();
});
press($("goLearn"), function () { open("ovLearn"); });
Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (b) {
  press(b, function () { shut(b.dataset.close); });
});

window.addEventListener("resize", fit);

(function boot() {
  fit();
  $("pSound").classList.toggle("on", P.sound);
  aimLabel();
  if (P.best) $("splashBest").textContent = "best " + P.best + " · furthest level " + P.far;
  requestAnimationFrame(loop);
})();

if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  navigator.serviceWorker.register("sw.js").catch(function () {});
}
window.BREAKER = { get: function () { return g; }, Game: Game, Levels: Levels };
})();
