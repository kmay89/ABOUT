/* stage.js — the soundstage: what playing here sounds like.

   sound.js makes the pieces sound like the objects they are: wood is
   dead at once, glass rings on, a king lands heavier than a pawn. That
   is the truth of the board, and it stays underneath everything here.
   What it never was is fun. The games people play for years are the
   ones whose every touch answers back with something you want to hear
   again: a bright little note when you move, a pop and a run of notes
   when you take something, a tune for every place you can be. This file
   is that half.

     the pieces   each kind of piece gets a voice of its own on top of its
                  real sound: a pawn is a kalimba "pip", a knight a
                  wooden clip-clop with a hop as it leaves the board, a
                  bishop a little glass "ting", a rook a warm drum, a
                  queen a chime and its fifth, a king a soft low bell.
                  The note is where the piece lands, counted from your
                  side, on the D major pentatonic: a pawn walking up the
                  board climbs a scale. Your moves are bright; the other
                  side's are an octave lower and softer. A capture pops,
                  and pays out a run of notes, more of them for a bigger
                  piece, and each capture in a row starts a step higher.
     the music    each place has its own tune, written fresh as it plays
                  from a progression, a feel and its own instruments: a
                  kalimba and a nylon guitar in the park, an electric
                  piano with a walking bass and brushes in the café, a
                  harp waltz over strings in the grand room, a felt piano
                  in the library, a pad and a celesta in the studio.
                  Everything is in D major, the key of every other sound
                  in the room, so nothing ever clashes.
     the room     every piece and every note is heard in the place: dry
                  in the open air of the park, a small bright room in the
                  café, a long warm one in the grand room.

   And the one rule all of it answers to: it must still be lovely the
   hundredth time. So every note is a hair different from the last (in
   pitch, weight and timing), the music is sparse and breathes (it rests
   for a while every couple of minutes), it steps aside for the room's
   own moments (a check, a mate, a star) and goes quiet when a game
   ends, and nothing sits where the ear is most sensitive for long.

   The instruments are synthesized, not recorded: each note is computed
   once into a buffer (struck bars and tines from their modes, plucked
   strings by Karplus-Strong, the electric piano by FM) and reused, so
   it costs a buffer read to play. Everything that decides what is
   played (the instruments, the compositions, the piece voicings) is a
   pure function and is checked in node by chess/tools/stage-check.js,
   which then renders all of it in a browser and measures it.        */
(function (root) {
"use strict";

function soundKit() {
  if (root.Sound) return root.Sound;
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    try { return require("./sound.js"); } catch (e) { return null; }
  }
  return null;
}

/* ---------------- the key ---------------- */
var D4 = 62;                                   /* D4, MIDI */
var MAJOR = [0, 2, 4, 5, 7, 9, 11];
var PENTA = [0, 2, 4, 7, 9];
function hzOf(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function pc(m) { return ((Math.round(m) - D4) % 12 + 12) % 12; }
function inKey(m) { return MAJOR.indexOf(pc(m)) >= 0; }
/* the k-th note of the pentatonic above `base` (k may be negative) */
function penta(base, k) {
  var o = Math.floor(k / 5), i = ((k % 5) + 5) % 5;
  return base + o * 12 + PENTA[i];
}
/* the k-th note of the major scale above D at octave offset */
function degree(k) {
  var o = Math.floor(k / 7), i = ((k % 7) + 7) % 7;
  return D4 + o * 12 + MAJOR[i];
}
/* the notes of the chord on scale degree `deg` (1..7), stacked in thirds
   inside the key, `size` notes (3 a triad, 4 a seventh, 5 a ninth),
   rooted at the octave of `low` or above */
function chordOf(deg, size, low) {
  var out = [], k0 = deg - 1;
  for (var i = 0; i < size; i++) out.push(degree(k0 + i * 2));
  var shift = 0;
  while (out[0] + shift < low) shift += 12;
  while (out[0] + shift - 12 >= low) shift -= 12;
  return out.map(function (m) { return m + shift; });
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function seeded(seed) {
  var s = (seed >>> 0) || 0x9e3779b9;
  return function () {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ================= the instruments =================
   Each is a recipe for one note as samples: `render(f, sr, rnd)` gives a
   Float32Array that starts and ends at silence. Notes are computed per
   zone (every three semitones) and played a semitone either side by
   rate, which no ear can hear on sounds this short. */
function fadeEnds(out, sr) {
  var a = Math.min(out.length, Math.round(sr * 0.0015)), z = Math.min(out.length, Math.round(sr * 0.03));
  for (var i = 0; i < a; i++) out[i] *= i / a;
  for (var j = 0; j < z; j++) out[out.length - 1 - j] *= j / z;
  return out;
}
function normalise(out, to) {
  var p = 0;
  for (var i = 0; i < out.length; i++) { var v = Math.abs(out[i]); if (v > p) p = v; }
  if (p > 0) { var k = to / p; for (var j = 0; j < out.length; j++) out[j] *= k; }
  return out;
}
/* a struck bar or tine: a few modes, each with its own ring, a touch of
   pitch falling into place as it is struck, and a tiny contact click */
function modal(f, sr, len, parts, o) {
  o = o || {};
  var n = Math.round(sr * len), out = new Float32Array(n), nyq = sr * 0.45;
  for (var p = 0; p < parts.length; p++) {
    var fr = f * parts[p][0];
    if (fr >= nyq) continue;
    var amp = parts[p][1], dec = parts[p][2], ph = 0, glide = o.glide || 0, gt = o.glideT || 0.02;
    for (var i = 0; i < n; i++) {
      var t = i / sr;
      ph += 2 * Math.PI * fr * (1 + glide * Math.exp(-t / gt)) / sr;
      out[i] += amp * Math.exp(-t / dec) * Math.sin(ph);
    }
  }
  if (o.click) {
    var cf = Math.min(nyq, o.clickHz || 3200), cl = o.clickLen || 0.004;
    for (var k = 0; k < Math.min(n, Math.round(sr * cl * 6)); k++) {
      var tt = k / sr;
      out[k] += o.click * Math.exp(-tt / cl) * Math.sin(2 * Math.PI * cf * tt);
    }
  }
  return out;
}
/* a plucked string, by Karplus-Strong: a burst of noise, shaped by where
   it was plucked, fed back round a delay one period long and softened a
   little each time round. Tuned with a fractional read so every note is
   in tune, not just the ones whose period is a whole number of samples. */
function plucked(f, sr, len, o, rnd) {
  var n = Math.round(sr * len), y = new Float32Array(n);
  var L = sr / f - 0.5;                     /* the averaging filter adds half a sample */
  var P = Math.max(2, Math.ceil(L) + 2);
  var exc = new Float32Array(P), i;
  for (i = 0; i < P; i++) exc[i] = rnd() * 2 - 1;
  /* where it was plucked: a comb, so a pluck near the end is brighter */
  var at = Math.max(1, Math.round(P * (o.pos || 0.18))), tmp = new Float32Array(P);
  for (i = 0; i < P; i++) tmp[i] = exc[i] - (i >= at ? exc[i - at] : 0) * 0.9;
  /* how soft the finger is: a few passes of smoothing */
  for (var s = 0; s < (o.soft || 1); s++) {
    for (i = 1; i < P - 1; i++) exc[i] = (tmp[i - 1] + 2 * tmp[i] + tmp[i + 1]) * 0.25;
    for (i = 0; i < P; i++) tmp[i] = exc[i];
  }
  var t60 = o.t60 || 2.5, g = Math.pow(10, -3 / (t60 * f)), damp = o.damp == null ? 0.5 : o.damp;
  for (i = 0; i < n; i++) {
    if (i < P) { y[i] = tmp[i]; continue; }
    var x = i - L, x0 = Math.floor(x), fr = x - x0;
    var a = y[x0] * (1 - fr) + y[x0 + 1] * fr;
    var b = y[x0 - 1] * (1 - fr) + y[x0] * fr;
    y[i] = g * ((1 - damp) * a + damp * b);
  }
  /* a body under the string: the fundamental a little louder, so the
     low notes have weight */
  if (o.body) {
    var ph = 0;
    for (i = 0; i < n; i++) { ph += 2 * Math.PI * f / sr; y[i] += o.body * Math.exp(-i / sr / (t60 * 0.35)) * Math.sin(ph) * Math.min(1, i / (sr * 0.004)); }
  }
  return y;
}
/* the electric piano: two operators, the modulator at the same ratio as
   the carrier, its depth falling away after the strike (the bark), and a
   short high tine on top (the bell) */
function epiano(f, sr, len) {
  var n = Math.round(sr * len), out = new Float32Array(n), nyq = sr * 0.45;
  var dec = 1.1 * Math.pow(261.6 / f, 0.35), pc1 = 0, pm = 0, pb = 0, pt = 0;
  var tine = f * 14 < nyq;
  for (var i = 0; i < n; i++) {
    var t = i / sr;
    pm += 2 * Math.PI * f / sr; pc1 += 2 * Math.PI * f / sr; pb += 2 * Math.PI * 2 * f / sr;
    var idx = 1.25 * Math.exp(-t / 0.28) + 0.22;
    var car = Math.sin(pc1 + idx * Math.sin(pm));
    var env = (1 - Math.exp(-t / 0.0025)) * Math.exp(-t / dec);
    var v = env * (car * 0.82 + 0.16 * Math.sin(pb) * Math.exp(-t / 0.6));
    if (tine) { pt += 2 * Math.PI * f * 14 / sr; v += 0.05 * Math.exp(-t / 0.035) * Math.sin(pt); }
    out[i] = Math.tanh(1.3 * v) / Math.tanh(1.3);
  }
  return out;
}
/* a piano with felt over the hammers: a string's partials, very slightly
   stretched the way a real string's are, two strings a hair apart so it
   breathes, and the top taken off by the felt */
function feltPiano(f, sr, len) {
  var n = Math.round(sr * len), out = new Float32Array(n), nyq = sr * 0.45, B = 0.00035;
  var base = 4.2 * Math.pow(196 / f, 0.45);
  for (var h = 1; h <= 10; h++) {
    var fh = h * f * Math.sqrt(1 + B * h * h);
    if (fh >= nyq) break;
    var amp = Math.pow(h, -1.1) * Math.exp(-(h - 1) * 0.42), dec = base / (1 + 0.5 * (h - 1));
    for (var s = -1; s <= 1; s += 2) {
      var fs = fh * (1 + s * 0.0006), ph = h * 0.7;
      for (var i = 0; i < n; i++) {
        ph += 2 * Math.PI * fs / sr;
        out[i] += 0.5 * amp * Math.exp(-i / sr / dec) * Math.sin(ph);
      }
    }
  }
  /* the hammer: a soft low knock under the first moment */
  for (var k = 0; k < Math.min(n, Math.round(sr * 0.05)); k++) {
    var t = k / sr; out[k] += 0.06 * Math.exp(-t / 0.008) * Math.sin(2 * Math.PI * 95 * t);
  }
  return out;
}
/* a bell, by FM with an inharmonic ratio: the king's voice */
function fmBell(f, sr, len) {
  var n = Math.round(sr * len), out = new Float32Array(n), pc1 = 0, pm = 0;
  for (var i = 0; i < n; i++) {
    var t = i / sr;
    pc1 += 2 * Math.PI * f / sr; pm += 2 * Math.PI * f * 3.5 / sr;
    var idx = 1.6 * Math.exp(-t / 0.5);
    out[i] = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 1.1) * Math.sin(pc1 + idx * Math.sin(pm));
  }
  return out;
}
/* a drum with a pitch: the rook's voice — a body that drops into its note */
function tom(f, sr, len) {
  var n = Math.round(sr * len), out = new Float32Array(n), ph = 0, ph2 = 0;
  for (var i = 0; i < n; i++) {
    var t = i / sr, fr = f * (1 + 0.9 * Math.exp(-t / 0.028));
    ph += 2 * Math.PI * fr / sr; ph2 += 2 * Math.PI * fr * 1.59 / sr;
    out[i] = Math.exp(-t / 0.26) * Math.sin(ph) + 0.25 * Math.exp(-t / 0.06) * Math.sin(ph2);
  }
  return out;
}
/* the bubble a capture makes: a note that falls out from under itself */
function pop(sr) {
  var n = Math.round(sr * 0.16), out = new Float32Array(n), ph = 0;
  for (var i = 0; i < n; i++) {
    var t = i / sr, fr = 280 + 820 * Math.exp(-t / 0.018);
    ph += 2 * Math.PI * fr / sr;
    out[i] = (1 - Math.exp(-t / 0.0012)) * Math.exp(-t / 0.045) * (Math.sin(ph) + 0.18 * Math.sin(2 * ph));
  }
  return out;
}

var INSTRUMENTS = {
  kalimba: { len: 1.8, pitched: true, render: function (f, sr) {
    var k = Math.pow(440 / f, 0.3);
    return modal(f, sr, 1.8, [[1, 1, 1.15 * k], [5.95, 0.22, 0.16 * k], [13.1, 0.05, 0.05]],
                 { glide: 0.004, click: 0.06, clickHz: 3400, clickLen: 0.003 });
  } },
  celesta: { len: 1.6, pitched: true, render: function (f, sr) {
    return modal(f, sr, 1.6, [[1, 1, 0.9], [4.0, 0.16, 0.22], [9.9, 0.04, 0.05]], { click: 0.03, clickHz: 5200, clickLen: 0.002 });
  } },
  glass: { len: 1.3, pitched: true, render: function (f, sr) {
    return modal(f, sr, 1.3, [[1, 1, 0.75], [2.76, 0.32, 0.3], [5.4, 0.1, 0.09]], { glide: -0.006, glideT: 0.03, click: 0.02, clickHz: 6000, clickLen: 0.0015 });
  } },
  woodblock: { len: 0.25, pitched: true, render: function (f, sr) {
    return modal(f, sr, 0.25, [[1, 1, 0.045], [1.58, 0.45, 0.028], [2.63, 0.2, 0.016]], { click: 0.25, clickHz: 2600, clickLen: 0.002 });
  } },
  harp: { len: 3.2, pitched: true, render: function (f, sr, rnd) {
    return plucked(f, sr, 3.2, { t60: 3.4 * Math.pow(220 / f, 0.4), soft: 1, pos: 0.2, damp: 0.45, body: 0.15 }, rnd);
  } },
  guitar: { len: 2.4, pitched: true, render: function (f, sr, rnd) {
    return plucked(f, sr, 2.4, { t60: 2.2 * Math.pow(196 / f, 0.35), soft: 3, pos: 0.14, damp: 0.5, body: 0.25 }, rnd);
  } },
  bass: { len: 1.9, pitched: true, render: function (f, sr, rnd) {
    return plucked(f, sr, 1.9, { t60: 1.5, soft: 6, pos: 0.3, damp: 0.5, body: 0.9 }, rnd);
  } },
  epiano: { len: 2.6, pitched: true, render: function (f, sr) { return epiano(f, sr, 2.6); } },
  piano: { len: 3.6, pitched: true, render: function (f, sr) { return feltPiano(f, sr, 3.6); } },
  bell: { len: 2.2, pitched: true, render: function (f, sr) { return fmBell(f, sr, 2.2); } },
  tom: { len: 0.7, pitched: true, render: function (f, sr) { return tom(f, sr, 0.7); } },
  pop: { len: 0.16, pitched: false, render: function (f, sr) { return pop(sr); } }
};
var INSTRUMENT_IDS = Object.keys(INSTRUMENTS);
/* one note of one instrument as samples, ready to play */
function renderNote(id, midi, sr) {
  var I = INSTRUMENTS[id];
  if (!I) return null;
  var out = I.render(hzOf(midi), sr, seeded(midi * 7919 + id.length * 104729));
  return fadeEnds(normalise(out, 0.9), sr);
}
/* the zone a note is played from: every three semitones */
function zoneOf(midi) { return Math.round(midi / 3) * 3; }

/* ================= the music =================
   A place's music is a feel (tempo, metre, swing), a set of chord
   progressions on scale degrees, and parts: who plays what, in which
   register, how often. `compose` writes it a bar at a time from a seed,
   so it never runs out and never repeats itself exactly, and every bar
   of it can be read in node. */
var PLACE_MUSIC = {
  park: {
    name: "Morning in the park", bpm: 76, meter: 4, swing: 0, gain: 0.86,
    progs: [[1, 5, 6, 4], [4, 1, 2, 5], [6, 4, 1, 5]], size: 3,
    parts: [
      { inst: "guitar", role: "bass", low: 38, vel: 0.62, beats: [0, 2], fifthOn: [2] },
      { inst: "guitar", role: "strum", low: 55, vel: 0.26, beats: [1, 3], notes: 3, roll: 0.03 },
      { inst: "kalimba", role: "arp", low: 66, high: 86, vel: 0.36, step: 0.5, chance: 0.5 },
      { inst: "kalimba", role: "tune", low: 74, high: 88, vel: 0.42, every: 2 }
    ] },
  cafe: {
    name: "Corner café", bpm: 84, meter: 4, swing: 0.62, gain: 0.58,
    progs: [[1, 6, 2, 5], [3, 6, 2, 5], [4, 3, 2, 5]], size: 4,
    parts: [
      { inst: "bass", role: "walk", low: 38, vel: 0.62 },
      { inst: "epiano", role: "comp", low: 57, vel: 0.36, patterns: [[0, 1.5], [1.5, 3.5], [0.5, 2.5]], notes: 4 },
      { inst: "epiano", role: "tune", low: 69, high: 84, vel: 0.36, every: 2 },
      { role: "brush", vel: 0.5, beats: [1, 3] }
    ] },
  salon: {
    name: "Waltz by the fire", bpm: 66, meter: 3, swing: 0, gain: 2.0,
    progs: [[1, 6, 4, 5], [1, 3, 4, 5], [4, 5, 3, 6]], size: 3,
    parts: [
      { inst: "harp", role: "bass", low: 38, vel: 0.5, beats: [0] },
      { inst: "harp", role: "arp", low: 55, high: 84, vel: 0.3, step: 0.5, chance: 1, rising: true },
      { role: "pad", low: 50, vel: 0.5 },
      { inst: "celesta", role: "tune", low: 74, high: 88, vel: 0.24, every: 3 }
    ] },
  library: {
    name: "Reading room", bpm: 56, meter: 3, swing: 0, gain: 0.6,
    progs: [[4, 1, 4, 1], [6, 3, 4, 5], [4, 1, 2, 5]], size: 4,
    parts: [
      { inst: "piano", role: "bass", low: 38, vel: 0.5, beats: [0] },
      { inst: "piano", role: "chord", low: 55, vel: 0.28, beats: [1], notes: 3, chance: 0.75 },
      { inst: "piano", role: "tune", low: 69, high: 86, vel: 0.36, every: 2, sparse: true }
    ] },
  studio: {
    name: "The studio", bpm: 70, meter: 4, swing: 0, gain: 1.8,
    progs: [[1, 6, 4, 5], [1, 4, 6, 5]], size: 4,
    parts: [
      { role: "pad", low: 50, vel: 0.55 },
      { inst: "bass", role: "bass", low: 38, vel: 0.42, beats: [0] },
      { inst: "celesta", role: "arp", low: 74, high: 93, vel: 0.22, step: 0.5, chance: 0.32 }
    ] }
};
var MUSIC_PLACES = Object.keys(PLACE_MUSIC);
var PHRASE = 8;          /* bars in a phrase */
var REST_EVERY = 3;      /* phrases between rests */
var REST_BARS = 6;       /* bars the music rests for, to let the room breathe */

/* the tune of one phrase: a walk on the pentatonic that leans on the
   chord, with a shape (up, then home) and a rhythm from a small book */
var RHYTHMS = {
  4: [[0, 1, 2], [0, 1.5, 3], [0.5, 1, 2, 3], [0, 2, 2.5], [0, 3]],
  3: [[0, 1], [0, 2], [0, 1, 1.5], [0]]
};
function tunePhrase(spec, part, rnd) {
  var bars = [], range = Math.max(5, Math.round((part.high - part.low) / 2.4));
  var k = Math.floor(rnd() * 3) + 1;
  for (var b = 0; b < PHRASE; b++) {
    if (b % (part.every || 2) !== 0 && !(b === PHRASE - 2)) { bars.push([]); continue; }
    var book = RHYTHMS[spec.meter], r = book[Math.floor(rnd() * book.length)], notes = [];
    if (part.sparse) r = r.slice(0, 1 + Math.floor(rnd() * 2));
    for (var i = 0; i < r.length; i++) {
      var stepIs = rnd();
      k += stepIs < 0.35 ? 1 : stepIs < 0.6 ? -1 : stepIs < 0.75 ? 2 : stepIs < 0.9 ? -2 : 0;
      /* a phrase climbs in its first half and comes home in its second */
      if (b >= PHRASE / 2 && k > range * 0.5 && rnd() < 0.5) k--;
      k = clamp(k, 0, range);
      notes.push({ beat: r[i], k: k, len: (r[i + 1] != null ? r[i + 1] - r[i] : spec.meter - r[i]) });
    }
    bars.push(notes);
  }
  /* and it ends at home */
  var last = bars[PHRASE - 2];
  if (last && last.length) last[last.length - 1].k = 0;
  return bars;
}
/* the next bass note on the way to a root: a step from below or above */
function approach(toRoot, rnd) {
  var dir = rnd() < 0.6 ? -1 : 1, m = toRoot + dir;
  while (!inKey(m)) m += dir;
  return m;
}

/* Bars `from` to `from + count` of a place's music, from `seed`. Each
   event: { bar, beat (from the bar), inst, midi, vel, len (beats), part }.
   A pad is { pad: [midis], bar, beats }. Everything is a pure function
   of (place, seed, bar), so any bar can be written without the ones
   before it. */
function compose(place, seed, from, count) {
  var spec = PLACE_MUSIC[place] || PLACE_MUSIC.studio, out = [];
  for (var bar = from; bar < from + count; bar++) {
    var cycle = PHRASE * (REST_EVERY + 1), inCycle = ((bar % cycle) + cycle) % cycle;
    var phraseNo = Math.floor(bar / PHRASE), inPhrase = ((bar % PHRASE) + PHRASE) % PHRASE;
    /* the rest: the last stretch of every cycle is left (almost) empty */
    if (inCycle >= cycle - REST_BARS) continue;
    var prnd = seeded(seed * 31 + phraseNo * 977 + 13);
    var prog = spec.progs[Math.floor(prnd() * spec.progs.length)];
    var deg = prog[inPhrase % prog.length], nextDeg = prog[(inPhrase + 1) % prog.length];
    var rnd = seeded(seed * 131 + bar * 7907 + 5);
    /* the first bar back after a rest, and the last of a phrase before
       one, are played more quietly */
    var swell = (inCycle === 0 ? 0.7 : 1) * (inCycle === cycle - REST_BARS - 1 ? 0.75 : 1);
    for (var p = 0; p < spec.parts.length; p++) {
      var part = spec.parts[p], role = part.role;
      var ch = chordOf(deg, spec.size, part.low || 50);
      var v = function (x) { return clamp(part.vel * swell * (0.92 + rnd() * 0.16) * (x || 1), 0, 1); };
      if (role === "pad") {
        out.push({ bar: bar, beat: 0, pad: chordOf(deg, 3, part.low), beats: spec.meter, vel: v(), part: p });
      } else if (role === "bass") {
        var root = chordOf(deg, 1, part.low)[0];
        (part.beats || [0]).forEach(function (b) {
          var m = (part.fifthOn || []).indexOf(b) >= 0 ? degree(deg - 1 + 4) % 12 + (root - root % 12) : root;
          while (m < part.low) m += 12;
          out.push({ bar: bar, beat: b, inst: part.inst, midi: m, vel: v(b ? 0.8 : 1), len: 1, part: p });
        });
      } else if (role === "walk") {
        var r0 = chordOf(deg, 1, part.low)[0], tones = chordOf(deg, 3, part.low), nxt = chordOf(nextDeg, 1, part.low)[0];
        var line = [r0, tones[1 + Math.floor(rnd() * 2)], rnd() < 0.5 ? tones[2] : tones[1], approach(nxt, rnd)];
        line.forEach(function (m, b) {
          if (!inKey(m)) m = m + 1;
          out.push({ bar: bar, beat: b, inst: part.inst, midi: m, vel: v(b ? 0.85 : 1), len: 1, part: p });
        });
      } else if (role === "strum" || role === "chord") {
        if (part.chance != null && rnd() > part.chance) continue;
        var notes = ch.slice(0, part.notes || 3);
        (part.beats || [0]).forEach(function (b) {
          notes.forEach(function (m, i) {
            out.push({ bar: bar, beat: b + i * (part.roll || 0.012) * spec.bpm / 60, inst: part.inst, midi: m, vel: v(0.85), len: spec.meter - b, part: p });
          });
        });
      } else if (role === "comp") {
        var pat = part.patterns[Math.floor(rnd() * part.patterns.length)];
        var voicing = chordOf(deg, part.notes || 4, part.low);
        pat.forEach(function (b) {
          voicing.forEach(function (m) { out.push({ bar: bar, beat: b, inst: part.inst, midi: m, vel: v(0.8), len: 1, part: p }); });
        });
      } else if (role === "arp") {
        var pool = [], m0;
        for (m0 = part.low; m0 <= part.high; m0++) if (ch.some(function (c) { return pc(c) === pc(m0); })) pool.push(m0);
        var steps = Math.round(spec.meter / part.step);
        for (var s = 0; s < steps; s++) {
          if (rnd() > part.chance) continue;
          var at = s * part.step;
          var pick = part.rising ? pool[Math.min(pool.length - 1, s % pool.length)] : pool[Math.floor(rnd() * pool.length)];
          out.push({ bar: bar, beat: at, inst: part.inst, midi: pick, vel: v(s % 2 ? 0.75 : 1), len: part.step * 2, part: p });
        }
      } else if (role === "tune") {
        /* every other phrase, so the tune is something you notice */
        if (phraseNo % 2 === 1) continue;
        var tune = tunePhrase(spec, part, seeded(seed * 17 + phraseNo * 53 + 1));
        var home = chordOf(1, 1, part.low)[0];
        tune[inPhrase].forEach(function (n) {
          out.push({ bar: bar, beat: n.beat, inst: part.inst, midi: penta(home, n.k), vel: v(), len: n.len, part: p, tune: true });
        });
      } else if (role === "brush") {
        (part.beats || []).forEach(function (b) { out.push({ bar: bar, beat: b, brush: true, vel: v(), len: 0.5, part: p }); });
      }
    }
  }
  /* swing: an off-beat quaver is played late */
  if (spec.swing) out.forEach(function (e) {
    var f = e.beat - Math.floor(e.beat);
    if (Math.abs(f - 0.5) < 1e-6) e.beat = Math.floor(e.beat) + spec.swing;
  });
  return out;
}

/* ================= the pieces =================
   What a move adds to the real sound of the piece: a list of notes, each
   { inst, midi, at (seconds from the move's start), vel, pan }. Pure, so
   the checker can read what every piece says in node. */
var PIECE_VOICE = {
  1: { inst: "kalimba", base: 74, span: 1, vel: 0.30 },       /* pawn: a pip */
  2: { inst: "woodblock", base: 74, span: 0.5, vel: 0.34 },   /* knight: clip-clop */
  3: { inst: "glass", base: 81, span: 0.5, vel: 0.26 },       /* bishop: ting */
  4: { inst: "tom", base: 50, span: 0.5, vel: 0.46 },         /* rook: a drum */
  5: { inst: "harp", base: 74, span: 0.5, vel: 0.30 },        /* queen: a chime and its fifth */
  6: { inst: "bell", base: 62, span: 0.4, vel: 0.24 }         /* king: a soft bell */
};
var VALUE_NOTES = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 4, 6: 4 };
var CHAIN_DEGREES = [[1, 0], [4, 0], [5, 0], [1, 12], [4, 12]];
/* m: { piece (signed), to (0x88 square), from, promo, rookFrom }
   o: { mine, captured, chain (captures in a row by this side, this one
        included), land (s), lift (s), rnd } */
function voicing(m, o) {
  o = o || {};
  var rnd = o.rnd || Math.random;
  var kind = Math.abs(m.piece || 1), side = (m.piece || 1) > 0 ? 1 : -1;
  var V = PIECE_VOICE[kind] || PIECE_VOICE[1];
  var to = m.to | 0, file = to & 7, rank = to >> 4;
  var rel = side > 0 ? rank : 7 - rank;
  var down = o.mine === false ? -12 : 0;
  var at = o.land || 0, out = [];
  var jit = function () { return (rnd() - 0.5) * 0.012; };
  var vel = function (x) { return clamp(x * (0.92 + rnd() * 0.16) * (o.mine === false ? 0.55 : 1), 0, 1); };
  /* stereo: where on the board it landed, a little */
  var pan = clamp((file - 3.5) / 3.5 * 0.35, -0.35, 0.35);
  var note = penta(V.base + down, Math.round(rel * V.span));
  if (kind === 2) {
    /* the knight leaves the board with a hop and lands clip-clop */
    out.push({ inst: "woodblock", midi: penta(V.base + down, Math.round(rel * 0.5) + 2), at: (o.lift || 0) + jit(), vel: vel(V.vel * 0.45), pan: pan, hop: true });
    out.push({ inst: "woodblock", midi: note, at: at + jit(), vel: vel(V.vel), pan: pan });
    out.push({ inst: "woodblock", midi: penta(V.base + down, Math.round(rel * V.span) - 2), at: at + 0.085 + jit(), vel: vel(V.vel * 0.7), pan: pan });
  } else if (kind === 5) {
    out.push({ inst: "harp", midi: note, at: at + jit(), vel: vel(V.vel), pan: pan });
    out.push({ inst: "harp", midi: note + 7, at: at + 0.045 + jit(), vel: vel(V.vel * 0.8), pan: pan });
    out.push({ inst: "celesta", midi: note + 12, at: at + 0.09 + jit(), vel: vel(V.vel * 0.45), pan: pan });
  } else if (kind === 6) {
    out.push({ inst: "bell", midi: note, at: at + jit(), vel: vel(V.vel), pan: pan });
  } else {
    out.push({ inst: V.inst, midi: note, at: at + jit(), vel: vel(V.vel), pan: pan });
  }
  /* a castle: the rook arrives on its own drum */
  if (m.rookFrom != null) {
    out.push({ inst: "tom", midi: penta(50 + down, 2), at: at + 0.12 + jit(), vel: vel(0.36), pan: -pan });
  }
  /* a capture: the pop, then the pay-out, more notes for more value, and
     a higher start for every capture in a row */
  if (o.captured) {
    var val = VALUE_NOTES[Math.abs(o.captured)] || 1, chain = clamp((o.chain || 1) - 1, 0, 4);
    if (o.mine === false) {
      out.push({ inst: "pop", midi: 60, at: at + jit(), vel: vel(0.34), pan: pan, rate: 0.8 });
      out.push({ inst: "kalimba", midi: 69 + down + 12, at: at + 0.09, vel: vel(0.16), pan: pan });
      out.push({ inst: "kalimba", midi: 66 + down + 12, at: at + 0.19, vel: vel(0.13), pan: pan });
    } else {
      out.push({ inst: "pop", midi: 60, at: at + jit(), vel: vel(0.42), pan: pan, rate: 1 + chain * 0.06 });
      /* the pay-out is a major chord, spelled upwards; a capture in a
         row moves it up the key (I, IV, V, then the octave) */
      var cd = CHAIN_DEGREES[chain], tri = chordOf(cd[0], 3, 74).map(function (x) { return x + cd[1]; });
      var arp = [tri[0], tri[1], tri[2], tri[0] + 12];
      for (var i = 0; i < val; i++) {
        var mm = arp[i];
        out.push({ inst: "celesta", midi: mm, at: at + 0.07 + i * 0.055, vel: vel(0.22 + i * 0.03), pan: pan + (i - val / 2) * 0.08 });
        out.push({ inst: "kalimba", midi: mm, at: at + 0.07 + i * 0.055, vel: vel(0.16), pan: pan });
      }
    }
  }
  return out;
}

/* ================= the rooms the sound is heard in =================
   How much of each place goes into its echo, and what kind of echo:
   a park is nearly dry, a grand room long and warm. Read by sound.js's
   impulseResponse, so it is the same reverb maths as the music's. */
var ROOMS = {
  park:    { seconds: 0.9, rt60: 0.55, predelay: 0.03, bright: 6500, dark: 1.4, pieces: 0.10, music: 0.20, seed: 31 },
  cafe:    { seconds: 1.1, rt60: 0.75, predelay: 0.008, bright: 7500, dark: 1.2, pieces: 0.20, music: 0.22, seed: 37 },
  salon:   { seconds: 2.8, rt60: 2.2, predelay: 0.02, bright: 5000, dark: 1.9, pieces: 0.30, music: 0.36, seed: 41 },
  library: { seconds: 1.8, rt60: 1.3, predelay: 0.012, bright: 4200, dark: 2.2, pieces: 0.22, music: 0.30, seed: 43 },
  studio:  { seconds: 1.2, rt60: 0.8, predelay: 0.01, bright: 7000, dark: 1.3, pieces: 0.12, music: 0.30, seed: 47 }
};

/* how far the music steps aside for each of the room's own moments */
var DUCK = { start: 0.45, check: 0.5, "capture-big": 0.5, promote: 0.6, "mate-win": 0.8, "mate-lose": 0.8,
             win: 0.7, lose: 0.7, draw: 0.6, hint: 0.35, "lesson-right": 0.4, "lesson-wrong": 0.3, "lesson-done": 0.6,
             levelup: 0.7, "rating-up": 0.5, "rating-down": 0.5, milestone: 0.75, link: 0.4 };

/* ================= the audio side ================= */
var S = null, cache = {}, cacheKeys = [], CACHE_MAX = 72;
var bus = null;              /* { ctx, pieceIn, musicIn, duck, tone, musicGain, verb, place } */
var place = "studio", musicLevel = 0, mood = "calm", lively = true, enabled = true;
var mus = null, seed = (Date.now() / 1000) | 0, watched = false;
var chains = { 1: 0, "-1": 0 }, MUSIC_GAIN = 0.20;

function kit() { S = S || soundKit(); return S && S.kit ? S.kit() : null; }
function bufferFor(c, id, midi) {
  var I = INSTRUMENTS[id], z = I && I.pitched ? zoneOf(midi) : 0;
  var key = id + ":" + z + ":" + c.sampleRate;
  if (cache[key]) return { buf: cache[key], rate: I.pitched ? Math.pow(2, (midi - z) / 12) : 1 };
  var data = renderNote(id, I.pitched ? z : 60, c.sampleRate);
  var b = c.createBuffer(1, data.length, c.sampleRate);
  b.getChannelData(0).set(data);
  cache[key] = b; cacheKeys.push(key);
  if (cacheKeys.length > CACHE_MAX) delete cache[cacheKeys.shift()];
  return { buf: b, rate: I.pitched ? Math.pow(2, (midi - z) / 12) : 1 };
}
function play(c, dest, id, midi, t, vel, pan, len, rate) {
  if (!INSTRUMENTS[id] || !(vel > 0.001)) return;
  var z = bufferFor(c, id, midi), src = c.createBufferSource();
  src.buffer = z.buf;
  /* a hair out every time: no two notes are quite the same */
  src.playbackRate.setValueAtTime(z.rate * (rate || 1) * Math.pow(2, ((Math.random() - 0.5) * 0.12) / 12), t);
  var g = c.createGain();
  g.gain.setValueAtTime(vel, t);
  if (len) {
    g.gain.setValueAtTime(vel, t + len);
    g.gain.setTargetAtTime(0, t + len, 0.12);
  }
  src.connect(g);
  if (pan && typeof c.createStereoPanner === "function") {
    var p = c.createStereoPanner(); p.pan.setValueAtTime(clamp(pan, -1, 1), t); g.connect(p); p.connect(dest);
  } else g.connect(dest);
  src.start(t);
  src.stop(t + Math.min(z.buf.duration / (z.rate * (rate || 1)), len ? len + 0.9 : 99) + 0.02);
}
function noiseBurst(c, dest, t, o) {
  var K = kit(); if (!K) return;
  var s = c.createBufferSource(); s.buffer = K.noise(c); s.loop = true;
  var f = c.createBiquadFilter(); f.type = o.type || "bandpass";
  f.frequency.setValueAtTime(o.hz, t); f.Q.setValueAtTime(o.q || 0.8, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.len);
  var g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vel, t + (o.attack || 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.len);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t); s.stop(t + o.len + 0.02);
}

/* the buses, once per context: pieces and music, each into the room's
   echo and the master; the music through its own ducker and tone */
function busFor(c) {
  var K = kit(); if (!K) return null;
  if (bus && bus.ctx === c) return bus;
  var master = K.master();
  var b = { ctx: c, place: null };
  b.verb = c.createConvolver();
  b.verbOut = c.createGain(); b.verbOut.gain.setValueAtTime(1, 0);
  b.verb.connect(b.verbOut); b.verbOut.connect(master);
  b.pieceIn = c.createGain(); b.pieceIn.connect(master);
  b.pieceSend = c.createGain(); b.pieceIn.connect(b.pieceSend); b.pieceSend.connect(b.verb);
  b.musicIn = c.createGain();
  b.duck = c.createGain(); b.duck.gain.setValueAtTime(1, 0);
  b.tone = c.createBiquadFilter(); b.tone.type = "lowpass"; b.tone.frequency.setValueAtTime(9000, 0); b.tone.Q.setValueAtTime(0.4, 0);
  b.musicGain = c.createGain(); b.musicGain.gain.setValueAtTime(0, 0);
  b.musicIn.connect(b.duck); b.duck.connect(b.tone); b.tone.connect(b.musicGain); b.musicGain.connect(master);
  b.musicSend = c.createGain(); b.musicGain.connect(b.musicSend); b.musicSend.connect(b.verb);
  bus = b;
  roomFor(b, place);
  /* every piece sound, the real one included, is heard in the room */
  if (K.setPieceOut) K.setPieceOut(b.pieceIn);
  return b;
}
function roomFor(b, id) {
  if (b.place === id) return;
  var K = kit(), R = ROOMS[id] || ROOMS.studio, c = b.ctx;
  b.place = id;
  try {
    var ir = K.impulseResponse(c.sampleRate, R);
    var buf = c.createBuffer(2, ir[0].length, c.sampleRate);
    buf.getChannelData(0).set(ir[0]); buf.getChannelData(1).set(ir[1]);
    b.verb.normalize = false;
    b.verb.buffer = buf;
  } catch (e) {}
  var now = c.currentTime;
  b.pieceSend.gain.setTargetAtTime(R.pieces, now, 0.2);
  b.musicSend.gain.setTargetAtTime(R.music, now, 0.2);
}

/* ---------- the music, scheduled ---------- */
function barSecs(spec) { return spec.meter * 60 / spec.bpm; }
function scheduleBar(c, b, spec, events, t0) {
  var beat = 60 / spec.bpm;
  events.forEach(function (e) {
    var t = t0 + e.beat * beat + (Math.random() - 0.5) * 0.012;
    if (e.pad) padChord(c, b.musicIn, e.pad, t, e.beats * beat, e.vel);
    else if (e.brush) noiseBurst(c, b.musicIn, t, { hz: 5200, q: 0.5, vel: 0.05 * e.vel, len: 0.22, attack: 0.04, type: "bandpass" });
    else play(c, b.musicIn, e.inst, e.midi, t, e.vel, e.inst === "bass" || e.part === 0 ? 0 : ((e.midi % 7) - 3) * 0.06, e.len * beat + 0.15);
  });
}
/* the pad: three soft detuned voices per note, slow in and slow out */
function padChord(c, dest, notes, t, len, vel) {
  var g = c.createGain(), f = c.createBiquadFilter();
  f.type = "lowpass"; f.frequency.setValueAtTime(900, t); f.Q.setValueAtTime(0.5, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05 * vel, t + Math.min(1.4, len * 0.4));
  g.gain.setValueAtTime(0.05 * vel, t + len * 0.75);
  g.gain.linearRampToValueAtTime(0.0001, t + len + 0.6);
  f.connect(g); g.connect(dest);
  notes.forEach(function (m) {
    [-7, 0, 7].forEach(function (cents) {
      var o = c.createOscillator(); o.type = cents ? "sawtooth" : "triangle";
      o.frequency.setValueAtTime(hzOf(m) * Math.pow(2, cents / 1200), t);
      var og = c.createGain(); og.gain.setValueAtTime(cents ? 0.25 : 0.6, t);
      o.connect(og); og.connect(f); o.start(t); o.stop(t + len + 0.7);
    });
  });
}
function musicStart(c) {
  var b = busFor(c); if (!b) return null;
  var spec = PLACE_MUSIC[place] || PLACE_MUSIC.studio;
  /* every place's music is trimmed to sit at the same loudness */
  b.musicIn.gain.setValueAtTime(spec.gain || 1, c.currentTime);
  var m = { ctx: c, place: place, spec: spec, bar: 0, next: c.currentTime + 0.4, timer: 0 };
  var K = kit();
  var fill = function () {
    if (mus !== m) return;
    var horizon = c.currentTime + (K.borrowed() ? 1e9 : 1.6), sec = barSecs(spec);
    var limit = K.borrowed() ? Math.ceil((c.length / c.sampleRate) / sec) + 1 : 9999;
    while (m.next < horizon && m.bar < limit) {
      scheduleBar(c, b, spec, compose(place, seed, m.bar, 1), m.next);
      m.bar++; m.next += sec;
    }
  };
  mus = m;
  fill();
  if (!K.borrowed() && typeof root.setInterval === "function") m.timer = root.setInterval(fill, 400);
  return m;
}
function musicStop(fade) {
  if (!mus) return;
  var m = mus; mus = null;
  if (m.timer) { try { root.clearInterval(m.timer); } catch (e) {} }
  /* what is already scheduled rings out under a fade: the bus closes */
  if (bus && bus.ctx === m.ctx) {
    var now = m.ctx.currentTime;
    bus.musicGain.gain.cancelScheduledValues(now);
    bus.musicGain.gain.setValueAtTime(bus.musicGain.gain.value, now);
    bus.musicGain.gain.setTargetAtTime(0, now, fade || 0.4);
  }
}
function musicLevelNow() {
  return enabled && musicLevel > 0 && mood !== "end" && !(typeof document !== "undefined" && document.hidden) ? musicLevel : 0;
}
function syncMusic() {
  var K = kit(); if (!K) return;
  var want = musicLevelNow();
  if (!(want > 0) || !K.enabled()) { musicStop(mood === "end" ? 1.2 : 0.4); return; }
  var c = K.ctx(); if (!c) return;
  if (!K.running(c) && !K.borrowed()) return;          /* starts with the first tap */
  var b = busFor(c); if (!b) return;
  if (mus && (mus.ctx !== c || mus.place !== place)) musicStop(0.6);
  if (!mus) {
    b.musicGain.gain.cancelScheduledValues(c.currentTime);
    b.musicGain.gain.setValueAtTime(0, c.currentTime);
    musicStart(c);
  }
  b.musicGain.gain.setTargetAtTime(want * MUSIC_GAIN, c.currentTime + 0.1, 0.8);
  b.tone.frequency.setTargetAtTime(mood === "tense" ? 1900 : 9000, c.currentTime, 0.4);
}
function watchPage() {
  if (watched || typeof document === "undefined" || !document.addEventListener) return;
  watched = true;
  document.addEventListener("visibilitychange", syncMusic);
}

/* the room's own moments step over the music */
function duck(depth, hold) {
  if (!bus) return;
  var c = bus.ctx, now = c.currentTime;
  bus.duck.gain.cancelScheduledValues(now);
  bus.duck.gain.setValueAtTime(bus.duck.gain.value, now);
  bus.duck.gain.setTargetAtTime(1 - depth, now, 0.03);
  bus.duck.gain.setTargetAtTime(1, now + hold, 0.45);
}

var Stage = {
  /* the pure half, for the checker */
  INSTRUMENTS: INSTRUMENTS, INSTRUMENT_IDS: INSTRUMENT_IDS, PLACE_MUSIC: PLACE_MUSIC, PLACES: MUSIC_PLACES,
  ROOMS: ROOMS, PIECE_VOICE: PIECE_VOICE, DUCK: DUCK, PHRASE: PHRASE, REST_EVERY: REST_EVERY, REST_BARS: REST_BARS,
  hzOf: hzOf, inKey: inKey, penta: penta, chordOf: chordOf, renderNote: renderNote, zoneOf: zoneOf,
  compose: compose, voicing: voicing, seeded: seeded,

  /* "lively" (the default) or "natural": whether the pieces have their
     game voices on top of their real ones */
  setLively: function (v) { lively = v !== false && v !== "natural"; return lively; },
  lively: function () { return lively; },
  /* everything here follows the room's own sound switch; this is for
     the checker, which drives it directly */
  enable: function (v) { enabled = !!v; syncMusic(); },

  /* where the board is: the music, its instruments and the echo follow */
  setPlace: function (id) {
    var next = PLACE_MUSIC[id] ? id : "studio";
    if (next === place) return place;
    place = next;
    if (bus) roomFor(bus, place);
    if (mus) { musicStop(0.8); syncMusic(); }
    return place;
  },
  place: function () { return place; },
  /* hear the pieces in the place from now on, music or not (called
     once the audio clock is running) */
  room: function () {
    var K = kit(); if (!K || !K.enabled()) return false;
    var c = K.ctx(); if (!c || !K.running(c)) return false;
    return !!busFor(c);
  },
  /* the music, 0 (off) to 1; no argument says what it is set to */
  music: function (level) {
    if (level === undefined) return musicLevel;
    musicLevel = clamp(+level || 0, 0, 1);
    watchPage();
    syncMusic();
    return musicLevel;
  },
  musicLive: function () { return !!mus; },
  /* how the game feels: "calm", "tense" (the music closes in a little),
     or "end" (it goes quiet so the ending can be heard; the next game
     brings it back) */
  mood: function (m) {
    var next = m === "tense" || m === "end" ? m : "calm";
    if (next === mood) return mood;
    mood = next;
    syncMusic();
    return mood;
  },
  /* a new game: captures in a row start counting again */
  newGame: function () { chains = { 1: 0, "-1": 0 }; Stage.mood("calm"); },
  duck: duck,

  /* the piece's game voice, on the same clock as its real sound. `m` is
     the move as the board has it, `plan` motion.js's plan for it, and
     o: { mine, captured } */
  move: function (m, plan, o) {
    o = o || {};
    var side = (m && m.piece) > 0 ? 1 : -1;
    /* the chain counts even when the voices are off, so turning them on
       mid-game does not start a streak from nothing */
    chains[side] = o.captured ? chains[side] + 1 : 0;
    var K = kit(); if (!K || !enabled || !K.enabled() || !m || !plan) return;
    var c = K.ctx(); if (!c || !K.running(c)) return;
    /* the room is there for every piece, lively or natural */
    var b = busFor(c); if (!b || !lively) return;
    var secs = plan.dur / 1000, t0 = c.currentTime + 0.004;
    var notes = voicing(m, { mine: o.mine !== false, captured: o.captured, chain: chains[side],
                             land: secs * plan.travel, lift: 0.01 });
    notes.forEach(function (n) {
      play(c, b.pieceIn, n.inst, n.midi, t0 + Math.max(0, n.at), n.vel, n.pan, 0, n.rate);
    });
    /* a castle swishes as the rook goes past */
    if (m.rookFrom != null) noiseBurst(c, b.pieceIn, t0 + secs * (plan.rookIn || 0.3), { hz: 700, to: 2600, q: 0.9, vel: 0.05, len: 0.28, attack: 0.08 });
    if (o.captured && o.mine !== false) duck(0.3, 0.5);
  },
  /* lifting a piece: the smallest note there is */
  pickUp: function (piece) {
    var K = kit(); if (!K || !lively || !enabled || !K.enabled()) return;
    var c = K.ctx(); if (!c || !K.running(c)) return;
    var b = busFor(c); if (!b) return;
    var V = PIECE_VOICE[Math.abs(piece) || 1] || PIECE_VOICE[1];
    play(c, b.pieceIn, "kalimba", penta(V.base, 3), c.currentTime + 0.004, 0.09, 0, 0.12);
  },

  /* for the checker: point at a context sound.js has been lent */
  reset: function () { musicStop(0); bus = null; cache = {}; cacheKeys = []; mus = null; mood = "calm"; chains = { 1: 0, "-1": 0 }; },
  setSeed: function (s) { seed = s >>> 0; },
  busy: function () { return { cached: cacheKeys.length, music: !!mus, mood: mood, place: place }; }
};

/* the room's own moments (a check, a mate, a star) duck the music while
   they ring, so a fanfare is never fighting a tune */
(function hook() {
  var Snd = soundKit();
  if (Snd && Snd.onSting !== undefined) {
    Snd.onSting = function (kind, len) {
      /* only the game's own moments: a card opening or a clock ticking
         must not make the tune pump */
      var depth = DUCK[kind];
      if (depth) duck(depth, Math.min(2.6, Math.max(0.5, len * 0.6)));
    };
  }
})();

if (typeof module !== "undefined" && module.exports) module.exports = Stage;
else root.Stage = Stage;
})(typeof window !== "undefined" ? window : this);
