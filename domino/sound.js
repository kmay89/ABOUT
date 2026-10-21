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

/* ---------- a guitar, for the moments that earn one ----------
   A plucked string by Karplus–Strong: a burst of noise run round a
   delay line one period long and averaged as it goes, which is the
   whole of how a nylon string decays — bright for a few milliseconds,
   then warm, then gone. A few hundred lines of samples made on the
   spot, no recording. `strum` rakes six of them a few milliseconds
   apart, the way a thumb does. */
function pluck(t, freq, dur, gain) {
  var c = S.ctx, sr = c.sampleRate, n = Math.floor(sr * dur), N = Math.max(2, Math.round(sr / freq));
  var buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0);
  var ring = new Float32Array(N), i;
  for (i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
  var idx = 0;
  for (i = 0; i < n; i++) {
    var v = ring[idx], nx = ring[(idx + 1) % N];
    ring[idx] = (v + nx) * 0.5 * 0.996;
    d[i] = v;
    idx = (idx + 1) % N;
  }
  var src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
  src.buffer = buf;
  f.type = "lowpass"; f.frequency.value = 3200; f.Q.value = 0.5;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(S.master);
  src.start(t); src.stop(t + dur + 0.02);
}
function strum(t, notes, spacing, dur, gain) {
  for (var i = 0; i < notes.length; i++) pluck(t + i * spacing, notes[i], dur, gain);
}
/* open-position chords, low string first */
var E_MAJ = [164.81, 246.94, 329.63, 415.30, 493.88, 659.26];
var A_MAJ = [220.00, 329.63, 440.00, 554.37, 659.26];
var A_MIN = [220.00, 329.63, 440.00, 523.25, 659.26];
var E_MIN = [164.81, 246.94, 329.63, 392.00, 493.88, 659.26];

S.win = function () {
  var t = ready(); if (t === null) return;
  strum(t, A_MAJ, 0.028, 1.1, 0.16);
  strum(t + 0.34, E_MAJ, 0.024, 1.6, 0.18);
};
/* a capicúa or a match won gets the full rasgueado */
S.fiesta = function () {
  var t = ready(); if (t === null) return;
  strum(t, A_MAJ, 0.03, 0.6, 0.14);
  strum(t + 0.22, A_MAJ, 0.02, 0.6, 0.12);
  strum(t + 0.40, E_MAJ, 0.028, 0.7, 0.15);
  strum(t + 0.62, E_MAJ, 0.02, 0.6, 0.12);
  strum(t + 0.86, A_MAJ, 0.034, 1.8, 0.20);
  [880, 1108.7, 1318.5].forEach(function (f, i) { tone(t + 0.9 + i * 0.1, 0.28, f, "triangle", 0.07); });
};
S.lose = function () {
  var t = ready(); if (t === null) return;
  strum(t, E_MIN, 0.045, 1.3, 0.10);
  pluck(t + 0.5, 164.81, 1.2, 0.09);
};
S.rank = function () {
  var t = ready(); if (t === null) return;
  [220, 277.18, 329.63, 440, 554.37, 659.26].forEach(function (f, i) { pluck(t + i * 0.07, f, 0.9, 0.12); });
  strum(t + 0.5, A_MAJ, 0.026, 1.8, 0.18);
};
/* the deal: a chord dampened under the hand, then the wash of bones */
S.deal = function () {
  var t = ready(); if (t === null) return;
  strum(t, A_MIN, 0.03, 0.35, 0.08);
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
