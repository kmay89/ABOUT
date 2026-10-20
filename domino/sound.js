/* sound.js — the noises a domino table makes.

   No samples, nothing to download: every sound here is built from a few
   oscillators and a burst of filtered noise at the moment it is needed,
   which keeps the room a handful of small scripts and still lets a bone
   land with a *clack*.

   The sounds are the table's, not a video game's:

     clack    a bone put down on the wood. Two transients a few
              milliseconds apart — the leading corner, then the face —
              which is the difference between a click and a domino.
     knock    paso. At a real table you do not say it so much as rap the
              wood twice with your knuckles, and everyone looks up.
     shuffle  "lavar las fichas": a run of soft clacks, face down.
     turn     a quiet two-note nudge that it has come round to you.
     win/lose/rank   short phrases, kept small.

   Browsers will not start audio until somebody has touched the page, so
   the context is made lazily on the first gesture (see `unlock`). Muting
   is a preference the room remembers; a muted table costs nothing.     */
(function (root) {
"use strict";

var S = { on: true, ctx: null, master: null, noise: null };

function ctx() {
  if (S.ctx) return S.ctx;
  var AC = root.AudioContext || root.webkitAudioContext;
  if (!AC) return null;
  try {
    S.ctx = new AC();
    S.master = S.ctx.createGain();
    S.master.gain.value = 0.55;
    S.master.connect(S.ctx.destination);
    /* one second of white noise, reused by every transient */
    var n = S.ctx.sampleRate, buf = S.ctx.createBuffer(1, n, n), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    S.noise = buf;
  } catch (e) { S.ctx = null; }
  return S.ctx;
}

/* the first touch anywhere wakes the audio; iOS insists on it */
S.unlock = function () {
  var c = ctx();
  if (c && c.state === "suspended" && c.resume) c.resume().catch(function () {});
};

function burst(t, dur, freq, q, gain) {
  var c = S.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = S.noise;
  f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(S.master);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}
function tone(t, dur, freq, type, gain, to) {
  var c = S.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type || "sine";
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(S.master);
  o.start(t); o.stop(t + dur + 0.02);
}
function ready() {
  if (!S.on) return null;
  var c = ctx();
  if (!c || c.state !== "running") return null;
  return c.currentTime + 0.01;
}

/* a bone on the wood. `hard` is how firmly — a mula slammed down to
   close the game is louder than a bone slid into place */
S.clack = function (hard) {
  var t = ready(); if (t === null) return;
  var h = hard === undefined ? 0.6 : Math.max(0.2, Math.min(1, hard));
  var pitch = 2300 + Math.random() * 500;
  burst(t, 0.035, pitch, 6, 0.55 * h);
  tone(t, 0.05, 1650 + Math.random() * 120, "triangle", 0.20 * h, 900);
  burst(t + 0.012, 0.06, pitch * 0.55, 3, 0.45 * h);
  tone(t + 0.012, 0.09, 190, "sine", 0.35 * h, 120);      /* the table answers */
};
/* paso: two raps on the wood */
S.knock = function () {
  var t = ready(); if (t === null) return;
  for (var i = 0; i < 2; i++) {
    var at = t + i * 0.15;
    tone(at, 0.12, 150, "sine", 0.6, 85);
    burst(at, 0.05, 700, 2, 0.35);
  }
};
S.shuffle = function () {
  var t = ready(); if (t === null) return;
  for (var i = 0; i < 12; i++) {
    var at = t + i * 0.055 + Math.random() * 0.03;
    burst(at, 0.03, 1800 + Math.random() * 1400, 5, 0.10 + Math.random() * 0.12);
  }
};
S.turn = function () {
  var t = ready(); if (t === null) return;
  tone(t, 0.16, 660, "sine", 0.16);
  tone(t + 0.11, 0.22, 880, "sine", 0.14);
};
S.good = function () {
  var t = ready(); if (t === null) return;
  tone(t, 0.12, 784, "triangle", 0.10);
  tone(t + 0.08, 0.18, 1175, "triangle", 0.09);
};
S.win = function () {
  var t = ready(); if (t === null) return;
  [523, 659, 784, 1047].forEach(function (f, i) { tone(t + i * 0.09, 0.32, f, "triangle", 0.16); });
};
S.lose = function () {
  var t = ready(); if (t === null) return;
  [392, 330, 262].forEach(function (f, i) { tone(t + i * 0.12, 0.3, f, "sine", 0.13); });
};
S.rank = function () {
  var t = ready(); if (t === null) return;
  [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(t + i * 0.07, 0.4, f, "triangle", 0.12); });
};
S.tick = function () {
  var t = ready(); if (t === null) return;
  burst(t, 0.02, 3200, 8, 0.12);
};

/* a short buzz in the hand where the phone can do it */
S.buzz = function (ms) {
  if (!S.on) return;
  try { if (root.navigator && root.navigator.vibrate) root.navigator.vibrate(ms || 12); } catch (e) {}
};

if (typeof module !== "undefined" && module.exports) module.exports = S;
else root.Sound = S;
})(typeof self !== "undefined" ? self : this);
