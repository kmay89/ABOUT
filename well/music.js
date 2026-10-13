/* music.js — the well's music, and every sound the well makes.

   Nothing here is a recording. Every note is computed in the browser as it
   plays, from four ideas that are older than any of us.

   **You play the music.** Every touch is a note in the key of the world you
   are in. A move plucks the column it lands in — the ten columns of the well
   are a two-octave keyboard — a turn rings a chord tone, a lock plucks the
   piece's own degree, low in the well and higher as the stack rises. The
   notes come only from the world's five-note *pool*: an anhemitonic
   pentatonic, which has no semitone and no tritone in it anywhere, so any of
   its notes sound right against any other and against the chord underneath.
   A player who taps continuously hears a melody, not a machine gun. Each
   world's two remaining "colour" tones are kept out of reach of anything
   random or interactive and saved for the pads, the blooms between worlds
   and the Twist — so a Twist sounds like a special note, because it is one.

   **Rewards land on the beat.** Touch sounds are immediate, because a touch
   that answers late feels broken. Rewards — clears, Twists, the Empty Well —
   play a soft shimmer at once and then their melody on the next line of a
   grid no coarser than 120 ms, the trick that made two older music games
   feel like you were conducting them. The bells are not random either: each
   world has a sixteen-note tune and every line you clear reveals the next
   note of it, so over a run the player performs the world's song.

   **The bed never repeats.** Slow four-chord progressions (two or four bars
   a chord) hold the floor; above them a handful of soft bells ring on loops
   whose lengths share no common period — 17.3, 19.7, 23.1… seconds — the
   way Brian Eno built *Music for Airports* from tape loops of different
   lengths. Dawn's five loops line up again after about 2,300 years. The
   worlds descend the circle of fifths, so each shares six or seven of its
   seven notes with the next, and a change of world blooms on the notes the
   two have in common instead of jolting.

   **Two clocks.** JavaScript timers drift by tens of milliseconds; the audio
   hardware clock is exact to the sample. So a coarse timer (every 25 ms, and
   every animation frame) schedules everything due in the next 120 ms on the
   audio clock — Chris Wilson's "A tale of two clocks". Notes land on time
   even when the main thread stalls, and a stall skips whole steps instead of
   bursting every missed note at once.

   ## How the voices are made

   Bells and glass are two-operator FM (Chowning, 1973) whose brightness
   decays faster than their loudness, the way a struck object mellows.
   Plucked strings are Karplus–Strong (1983) — a burst of noise circulating
   in a tiny delay line — but baked into buffers in JavaScript rather than
   built from a DelayNode loop, because a delay inside a feedback cycle is
   clamped to one 128-frame render quantum, which would cap every string at
   375 Hz. Pads are two detuned oscillators of a soft 1/n^1.6 wave, a new set
   per chord overlapping the last one's release, so every chord change is a
   voice-led crossfade and no AudioParam piles up a long event list. Wood
   chimes and the mountain bell are additive, from their measured partials.
   Rain, wind, sea and snow are filters on one shared buffer of pink noise.
   The reverb is one convolver fed a generated impulse response (decorrelated
   noise that darkens as it decays); on slower devices a two-line feedback
   delay stands in for it.

   ## What it will not do

   Nothing here startles. No broadband transient over −30 dBFS anywhere;
   every voice has an attack of at least 3 ms (20 ms with Soften); the hard
   drop is a pitched thump, never a crack; there are no alarms, sirens,
   heartbeats, thunder or crackle in any world; danger adds consonant
   support at bar lines and never tempo or dissonance; a run ends on a line
   that resolves to the tonic, never a buzzer. One gentle compressor and a
   soft clipper sit on the output so that nothing can ever clip. The loudest
   moment in the game is the Empty Well, at −14 dBFS.

   ## The iPhone

   Audio starts only inside a pointerup, touchend, click or keydown — the
   events the HTML standard counts as activation — and `resume()` is never
   awaited, because WebKit holds that promise open while the context is not
   allowed to run. No sample rate is ever forced: every baked buffer is keyed
   by the hardware rate. By default the audio session is "ambient": it
   respects the Silent switch and mixes with whatever the player is already
   listening to. "Play on silent" switches it to "playback", which also
   pauses their music and makes the page Now Playing — so the type is read
   back after setting it, and the context is suspended whenever the page is
   hidden. On first unlock a two-second worst-case scene is rendered offline
   and timed, and slower devices get a lighter tier: a delay network instead
   of the convolver, and lower voice caps.

   Tested by rendering every world through an OfflineAudioContext with a
   scripted stream of play and measuring the samples: loudness, peaks, the
   startle guard, voice and node counts, and that every interactive note
   came from the pool.                                                     */
(function (root) {
"use strict";

/* ================================================================
   1. small pure helpers
   ================================================================ */
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function dbToGain(d) { return Math.pow(10, d / 20); }

/* mulberry32: every generative choice is seeded, so a render is repeatable
   and a test can hear the same performance twice */
function rng(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================================================================
   2. theory: pitch classes, modes, pools
   ================================================================ */
var PC = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
           G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
var MODES = {
  ionian:     [0, 2, 4, 5, 7, 9, 11],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  lydian:     [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian:    [0, 2, 3, 5, 7, 8, 10]
};
function pcsOf(names) {
  var out = [], parts = names.split(" ");
  for (var i = 0; i < parts.length; i++) if (parts[i]) out.push(PC[parts[i]]);
  return out;
}
/* the k-th note of a world's pool, counted up from `base` (a MIDI note whose
   pitch class is the tonic). k may run past the five notes into the next
   octave, or below zero into the one under. */
function poolNote(W, k, base) {
  var n = W.semis.length, o = Math.floor(k / n), j = k - o * n;
  return base + W.semis[j] + 12 * o;
}
/* the pool note nearest to a frequency band, for things that have to live in
   a register (birds, crickets, raindrops) but still be in key */
function poolIn(W, lo, hi, r) {
  var hits = [], m;
  for (m = 24; m < 120; m++) {
    var f = mtof(m);
    if (f >= lo && f <= hi && W.poolPc.indexOf(m % 12) >= 0) hits.push(m);
  }
  if (!hits.length) {
    for (m = 24; m < 120; m++) if (mtof(m) >= lo && W.poolPc.indexOf(m % 12) >= 0) return m;
    return 96;
  }
  return hits[Math.floor((r ? r() : 0) * hits.length) % hits.length];
}

function poolNear(W, hz) {
  var best = 0, bd = 1e9;
  for (var m = 12; m < 60; m++) {
    if (W.poolPc.indexOf(m % 12) < 0) continue;
    var d = Math.abs(Math.log(mtof(m) / hz));
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

/* ================================================================
   3. the ten worlds
   ================================================================
   One table per world, in Descent order (the circle of fifths, downwards).
   Every number a sound designer would want to retune lives here and nowhere
   else. Registers are MIDI notes: `keys` is the bottom of the move keyboard
   (the tonic), `bell` the bottom of the melody. `prog` is the pad
   progression as [name, bass, [four upper voices]], voiced so that no upper
   voice moves more than two semitones from one chord to the next (one
   three-semitone step where a progression wraps), and with no two voices a
   semitone apart. `loops` are the Eno layer: [note, period in seconds].
   `melody` is the sixteen-note tune that clears reveal, as pool steps above
   `bell`. `verb` is T60 s / pre-delay s / damping / return level dB.
   `bed` nudges the world's whole music bus so that every bed is equally
   loud (see BED_LIFT). Ambience levels are dBFS at the ambience bus at the
   default slider. */
var WORLDS = {
  dawn: {
    id: "dawn", n: 1, name: "Dawn", bed: -0.2,
    tonic: "D", mode: "lydian", pool: "D E F# A B", color: "G#",
    keys: 62, bell: 74, bpm: 72, bpc: 2,
    prog: [["Dmaj9", 38, [54, 61, 64, 69]], ["E/D", 38, [56, 61, 64, 71]],
           ["Bm11", 35, [54, 62, 64, 69]], ["Dmaj7#11", 38, [54, 61, 64, 68]]],
    pad: { db: -29, cutoff: 1600, attack: 2.5, release: 3, detune: 6, voices: 2, lfo: 0 },
    drone: null,
    lead: { name: "glass", kind: "fm", ratio: 3.5, index: 1.4, end: 0.3, decay: 2.6 },
    pluck: { name: "harp", bright: 0.55, t60: 1.6, tone: 5000 },
    loops: [[74, 17.3], [78, 19.7], [81, 23.1], [83, 29.3], [88, 31.7]],
    amb: [{ k: "wind", type: "bandpass", f: 600, q: 0.8, db: -34, walk: [450, 820], swing: 3, every: [3, 5] },
          { k: "birds", every: [6, 15], db: -40 }],
    verb: { t60: 2.8, pre: 0.020, damp: 0.45, send: -9 },
    lp: 0,
    melody: [0, 1, 2, 1, 3, 4, 3, 2, 1, 2, 3, 4, 5, 4, 3, 2]
  },
  tide: {
    id: "tide", n: 2, name: "Tide", bed: 0.05,
    tonic: "A", mode: "ionian", pool: "A B C# E F#", color: "D G#",
    keys: 57, bell: 69, bpm: 66, bpc: 2,
    prog: [["Asus2", 45, [57, 59, 64, 69]], ["F#m9", 42, [57, 61, 64, 68]],
           ["Dmaj9", 38, [57, 61, 64, 66]], ["Esus4", 40, [57, 59, 64, 66]]],
    pad: { db: -30, cutoff: 1100, attack: 2.8, release: 3.4, detune: 5, voices: 2, lfo: 0 },
    drone: null,
    lead: { name: "glass", kind: "fm", ratio: 2, index: 0.8, end: 0.2, decay: 2.8 },
    pluck: { name: "soft", bright: 0.35, t60: 1.3, tone: 3000 },
    loops: [[69, 18.1], [73, 21.7], [76, 24.3], [78, 27.9]],
    amb: [{ k: "ocean", lo: 280, hi: 1300, dbLo: -42, dbHi: -31, foam: -44 }],
    verb: { t60: 3.4, pre: 0.030, damp: 0.5, send: -8 },
    lp: 0,
    melody: [2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3, 4, 3, 1, 0]
  },
  rain: {
    id: "rain", n: 3, name: "Rain on Leaves", bed: -0.7,
    tonic: "E", mode: "dorian", pool: "E G A B D", color: "C#",
    keys: 64, bell: 76, bpm: 76, bpc: 2,
    prog: [["Em9", 40, [55, 62, 66, 71]], ["A/E", 40, [57, 61, 64, 71]],
           ["Gmaj7", 43, [57, 62, 66, 71]], ["D/F#", 42, [57, 62, 66, 69]]],
    pad: { db: -29, cutoff: 1300, attack: 2.4, release: 3, detune: 6, voices: 2, lfo: 0 },
    drone: null,
    lead: { name: "tine", kind: "tine", decay: 1.8 },
    pluck: { name: "koto", bright: 0.7, t60: 1.0, tone: 4200 },
    loops: [[76, 16.9], [79, 19.3], [83, 22.7], [86, 26.1]],
    amb: [{ k: "rain", db: -42, roof: -46 },
          { k: "drops", rate: [6, 10], db: [-40, -31], inKey: 6 }],
    verb: { t60: 2.2, pre: 0.015, damp: 0.6, send: -10 },
    lp: 0,
    melody: [5, 4, 3, 4, 2, 3, 1, 2, 0, 1, 2, 4, 3, 2, 1, 0]
  },
  bamboo: {
    id: "bamboo", n: 4, name: "Bamboo Grove", bed: 0.55,
    tonic: "B", mode: "aeolian", pool: "B D E F# A", color: "G",
    keys: 59, bell: 71, bpm: 84, bpc: 2,
    prog: [["Bm(add9)", 35, [59, 62, 66, 73]], ["Gmaj7", 43, [57, 62, 66, 71]],
           ["Em9", 40, [55, 62, 66, 71]], ["F#m7", 42, [57, 61, 64, 71]]],
    pad: { db: -30, cutoff: 1400, attack: 2.2, release: 2.6, detune: 7, voices: 2, lfo: 0, air: -40 },
    drone: null,
    lead: { name: "chime", kind: "chime" },
    pluck: { name: "bright", bright: 0.8, t60: 0.75, tone: 5200 },
    loops: [[71, 15.7], [74, 18.9], [78, 21.1], [81, 25.3]],
    amb: [{ k: "wind", type: "bandpass", f: 500, q: 1.0, db: -36, walk: [250, 900], swing: 5, every: [2, 3], gusts: 1 }],
    verb: { t60: 1.8, pre: 0.012, damp: 0.55, send: -11 },
    lp: 0,
    melody: [0, 2, 1, 3, 2, 4, 3, 2, 1, 3, 2, 4, 5, 3, 2, 1]
  },
  aurora: {
    id: "aurora", n: 5, name: "Aurora", bed: -0.1,
    tonic: "G", mode: "lydian", pool: "G A B D E", color: "C#",
    keys: 67, bell: 79, bpm: 60, bpc: 4,
    prog: [["Gmaj9", 43, [57, 59, 62, 66]], ["A/G", 43, [57, 59, 61, 64]],
           ["Em9", 40, [55, 59, 62, 66]], ["Gmaj7#11", 43, [57, 59, 61, 66]]],
    pad: { db: -31, cutoff: 1800, attack: 3.2, release: 4, detune: 9, voices: 4, lfo: 1 },
    drone: [[43, -32], [50, -34]],
    lead: { name: "high glass", kind: "fm", ratio: 3.5, index: 2.0, end: 0.35, decay: 4 },
    pluck: { name: "sparse", bright: 0.45, t60: 1.8, tone: 4500 },
    loops: [[79, 19.9], [83, 23.3], [86, 27.1], [88, 31.3], [93, 35.9]],
    amb: [{ k: "wind", type: "highpass", f: 2500, q: 0.5, db: -48, walk: [2000, 3600], swing: 3, every: [3, 6] },
          { k: "twinkle", rate: 0.7, db: -42 }],
    verb: { t60: 6.0, pre: 0.040, damp: 0.3, send: -6 },
    lp: 0,
    melody: [2, 3, 4, 5, 4, 3, 2, 1, 2, 4, 5, 6, 5, 4, 2, 0]
  },
  moonpool: {
    id: "moonpool", n: 6, name: "Moon Pool", bed: -0.35,
    tonic: "E", mode: "aeolian", pool: "E G A B D", color: "C",
    keys: 52, bell: 64, bpm: 56, bpc: 4,
    prog: [["Em(add9)", 40, [55, 64, 66, 71]], ["Cmaj7", 36, [55, 62, 64, 71]],
           ["Am9", 45, [55, 60, 64, 71]], ["Bm7", 35, [54, 62, 64, 69]]],
    pad: { db: -30, cutoff: 1000, attack: 3.4, release: 4, detune: 5, voices: 2, lfo: 0 },
    drone: [[28, -33], [40, -31]],
    lead: { name: "low glass", kind: "fm", ratio: 2, index: 0.6, end: 0.15, decay: 3.2 },
    pluck: { name: "muted", bright: 0.4, t60: 1.1, tone: 1500 },
    loops: [[64, 21.1], [71, 25.9], [74, 29.7]],
    amb: [{ k: "swell", type: "lowpass", f: 120, q: 0.7, dbLo: -46, dbHi: -40, period: 16.7 },
          { k: "bubbles", rate: 0.35, db: -40 }],
    verb: { t60: 5.0, pre: 0.035, damp: 0.75, send: -8 },
    lp: 2200, glide: 1,
    melody: [0, 1, 0, 2, 1, 3, 2, 1, 0, 2, 3, 4, 3, 2, 1, 0]
  },
  lanterns: {
    id: "lanterns", n: 7, name: "Lanterns", bed: -0.5,
    tonic: "D", mode: "mixolydian", pool: "D E G A C", color: "F# B",
    keys: 62, bell: 74, bpm: 80, bpc: 2,
    prog: [["D", 38, [54, 62, 64, 69]], ["C/D", 38, [55, 60, 64, 69]],
           ["G/D", 38, [55, 59, 62, 69]], ["Am7", 45, [55, 60, 64, 67]]],
    pad: { db: -29, cutoff: 1800, attack: 2.2, release: 2.6, detune: 6, voices: 2, lfo: 0 },
    drone: null,
    lead: { name: "tine", kind: "tine", decay: 1.9 },
    pluck: { name: "nylon", bright: 0.4, t60: 1.4, tone: 3600 },
    loops: [[74, 18.7], [79, 21.9], [81, 25.1], [84, 28.3]],
    amb: [{ k: "wind", type: "lowpass", f: 300, q: 0.5, db: -46, walk: [260, 340], swing: 1.5, every: [4, 7] },
          { k: "crickets", every: [4, 9], db: -46 }],
    verb: { t60: 1.6, pre: 0.008, damp: 0.5, send: -12 },
    lp: 0, bass: 1,
    melody: [0, 2, 3, 2, 4, 3, 2, 1, 0, 1, 2, 3, 2, 4, 5, 3]
  },
  snowfall: {
    id: "snowfall", n: 8, name: "Snowfall", bed: 0.65,
    tonic: "C", mode: "ionian", pool: "C D E G A", color: "F B",
    keys: 60, bell: 72, bpm: 66, bpc: 2,
    prog: [["Cmaj9", 36, [55, 62, 64, 71]], ["Am9", 45, [55, 60, 64, 71]],
           ["Fmaj9", 41, [55, 60, 64, 69]], ["G6sus4", 43, [55, 62, 64, 72]]],
    pad: { db: -30, cutoff: 900, attack: 2.8, release: 3.4, detune: 6, voices: 2, lfo: 0 },
    drone: null,
    lead: { name: "music box", kind: "fm", ratio: 4, index: 1.0, end: 0.2, decay: 1.8 },
    pluck: { name: "glassy", bright: 0.9, t60: 1.6, tone: 6000 },
    loops: [[84, 17.9], [88, 20.3], [91, 23.9], [93, 26.7]],
    amb: [{ k: "wind", type: "bandpass", f: 450, q: 0.45, db: -48, walk: [380, 540], swing: 2, every: [4, 8] },
          { k: "whoosh", every: [8, 20], db: -44 }],
    verb: { t60: 4.0, pre: 0.025, damp: 0.7, send: -9 },
    lp: 0,
    melody: [2, 3, 4, 3, 2, 1, 0, 1, 2, 4, 5, 4, 3, 2, 1, 0]
  },
  bells: {
    id: "bells", n: 9, name: "Mountain Bells", bed: 0.3,
    tonic: "D", mode: "dorian", pool: "D F G A C", color: "B",
    keys: 62, bell: 74, bpm: 52, bpc: 4,
    prog: [["Dm9", 38, [53, 60, 64, 69]], ["G/D", 38, [55, 59, 62, 69]],
           ["Fmaj7", 41, [55, 60, 64, 69]], ["C/E", 40, [55, 60, 64, 67]]],
    pad: { db: -31, cutoff: 1200, attack: 3.4, release: 4, detune: 5, voices: 2, lfo: 0 },
    drone: [[38, -30], [45, -32]],
    lead: { name: "temple glass", kind: "fm", ratio: 3.5, index: 1.0, end: 0.25, decay: 3.6 },
    pluck: { name: "koto", bright: 0.7, t60: 1.2, tone: 4000 },
    loops: [[74, 22.3], [77, 26.9], [81, 31.1], [84, 35.3]],
    amb: [{ k: "wind", type: "bandpass", f: 550, q: 0.9, db: -42, walk: [300, 800], swing: 4, every: [3, 5] },
          { k: "birds", every: [9, 20], db: -44 }],
    verb: { t60: 5.5, pre: 0.060, damp: 0.5, send: -6 },
    lp: 0, temple: 1,
    melody: [0, 3, 2, 3, 1, 2, 0, 1, 3, 4, 5, 4, 3, 2, 1, 0]
  },
  starfield: {
    id: "starfield", n: 10, name: "Starfield", bed: 0.8,
    tonic: "F", mode: "lydian", pool: "F G A C D", color: "B",
    keys: 65, bell: 77, bpm: 90, bpc: 2,
    prog: [["Fmaj9", 41, [55, 60, 64, 69]], ["G/F", 41, [55, 59, 62, 69]],
           ["Dm9", 38, [53, 60, 64, 69]], ["Am7", 45, [55, 60, 64, 67]]],
    pad: { db: -30, cutoff: 2000, attack: 2.6, release: 3.2, detune: 8, voices: 2, lfo: 0 },
    drone: null,
    lead: { name: "glass shimmer", kind: "fm", ratio: 3.5, index: 1.2, end: 0.3, decay: 3.0 },
    pluck: { name: "glass", bright: 0.6, t60: 1.6, tone: 5000 },
    loops: [],
    /* the bed above the pads is a polymetric arpeggio instead of loops:
       five step loops of 7, 9, 11, 13 and 16 sixteenths, each walking its own
       figure through the pool. They realign only after 144,144 steps — about
       six and a half hours at 90 bpm. */
    poly: [[7, [0, 2, 4]], [9, [1, 3]], [11, [2, 4, 5]], [13, [3, 1]], [16, [0, 5]]],
    amb: [{ k: "wind", type: "bandpass", f: 6000, q: 0.5, db: -54, walk: [5000, 7200], swing: 2, every: [5, 9] },
          { k: "twinkle", rate: 0.5, db: -44 }],
    verb: { t60: 4.5, pre: 0.030, damp: 0.35, send: -7 },
    lp: 0,
    melody: [0, 2, 4, 5, 4, 2, 3, 1, 2, 4, 6, 5, 4, 3, 2, 0]
  }
};
var ORDER = ["dawn", "tide", "rain", "bamboo", "aurora", "moonpool", "lanterns", "snowfall", "bells", "starfield"];

/* the grid a reward waits for: a sixteenth, halved until it is no more than
   120 ms, so the longest anyone ever waits for their bell is 120 ms */
var GRID_MAX = 0.12;
function gridUnit(sixteenth) { var u = sixteenth; while (u > GRID_MAX + 1e-9) u /= 2; return u; }

/* derive everything the director needs from the readable table, once */
function derive(W) {
  var tonic = PC[W.tonic], scale = MODES[W.mode], i;
  W.tonicPc = tonic;
  W.scalePc = [];
  for (i = 0; i < scale.length; i++) W.scalePc.push((tonic + scale[i]) % 12);
  W.poolPc = pcsOf(W.pool);
  W.colorPc = pcsOf(W.color);
  W.semis = [];
  for (i = 0; i < W.poolPc.length; i++) W.semis.push((W.poolPc[i] - tonic + 12) % 12);
  W.semis.sort(function (a, b) { return a - b; });
  W.grid = gridUnit(60 / W.bpm / 4);
  W.chordPc = [];
  for (i = 0; i < W.prog.length; i++) {
    var ch = W.prog[i], set = [ch[1] % 12];
    for (var j = 0; j < ch[2].length; j++) if (set.indexOf(ch[2][j] % 12) < 0) set.push(ch[2][j] % 12);
    W.chordPc.push(set);
  }
  /* a Twist's colour tone sits just above the bottom of the melody; its
     partner is a perfect fifth below it, or — where that fifth would fall
     outside the mode — a perfect fourth below, the same consonance upside
     down. Tide's D and Bamboo's G both need the fourth. */
  W.colorMidi = [];
  W.colorLow = [];
  for (i = 0; i < W.colorPc.length; i++) {
    var cm = W.bell + ((W.colorPc[i] - tonic + 12) % 12);
    W.colorMidi.push(cm);
    W.colorLow.push(W.scalePc.indexOf((cm - 7 + 120) % 12) >= 0 ? cm - 7 : cm - 5);
  }
  return W;
}
for (var wi = 0; wi < ORDER.length; wi++) derive(WORLDS[ORDER[wi]]);

/* the pitch classes two worlds share: the notes a modulation blooms on */
function commonTones(A, B) {
  var out = [];
  for (var i = 0; i < A.scalePc.length; i++) if (B.scalePc.indexOf(A.scalePc[i]) >= 0) out.push(A.scalePc[i]);
  return out;
}

/* piece → pool step for the lock pluck (and Keep). I O T S Z J L. */
var PIECE_STEP = [0, 0, 3, 2, 4, 1, 5, 8];
function pieceIndex(type) {
  if (typeof type === "number") return type >= 1 && type <= 7 ? type : 0;
  var i = "IOTSZJL".indexOf(String(type || ""));
  return i >= 0 ? i + 1 : 0;
}

/* ================================================================
   4. bakes: plucked strings, impulse responses, the clip curve, noise
   ================================================================
   Pure arithmetic into Float32Arrays, so node can check it. */

/* Karplus–Strong. The loop o[m] = ρ/2 (o[m−N] + o[m−N+1]) has a period of
   N − 0.5 samples, so N is chosen to land just above the wanted frequency
   and the buffer is played back at a corrected rate (error under a cent).
   ρ is chosen so the fundamental falls 60 dB in t60 seconds; the upper
   harmonics die faster, which is how a real string behaves. The excitation's
   mean is removed, because DC passes the averager untouched and never
   decays. */
function bakePluck(sr, f, t60, bright, seconds, rnd) {
  var N = Math.max(4, Math.round(sr / f + 0.5)), realF = sr / (N - 0.5);
  var rho = Math.pow(10, -3 / (realF * t60)) / Math.cos(Math.PI * realF / sr);
  if (rho > 0.99999) rho = 0.99999;
  var len = Math.floor(sr * seconds), out = new Float32Array(len), buf = new Float32Array(N);
  var i, lp = 0, mean = 0, p = 0, peak = 0;
  for (i = 0; i < N; i++) { lp += bright * ((rnd() * 2 - 1) - lp); buf[i] = lp; mean += lp; }
  mean /= N;
  for (i = 0; i < N; i++) buf[i] -= mean;
  /* the in-place average creeps a little DC in on short loops (high notes
     pass round thousands of times), so the output goes through a one-pole
     DC blocker at about 40 Hz on its way out */
  var x1 = 0, y1 = 0, R = 1 - 250 / sr;
  for (i = 0; i < len; i++) {
    var cur = buf[p], q = p + 1 === N ? 0 : p + 1;
    buf[p] = rho * 0.5 * (cur + buf[q]);
    p = q;
    y1 = cur - x1 + R * y1; x1 = cur;
    out[i] = y1;
    if (y1 > peak) peak = y1; else if (-y1 > peak) peak = -y1;
  }
  if (peak > 0) for (i = 0; i < len; i++) out[i] /= peak;
  /* no click where the buffer runs out */
  for (i = 0; i < 128 && i < len; i++) out[len - 1 - i] *= i / 128;
  return { data: out, rate: f / realF };
}

/* A generated impulse response, built a slice at a time so a world change
   never stalls a frame: independent noise per channel (so the tail is wide),
   an exponential decay that reaches −60 dB at t60, a one-pole low-pass whose
   cut-off falls as the tail decays (rooms darken as they ring), a 4 ms
   fade-in, and six early reflections of opposite sign left and right. */
function irJob(sr, t60, pre, damp, seed) {
  var n = Math.floor(sr * (t60 + pre)), p0 = Math.floor(sr * pre);
  var J = { L: new Float32Array(n), R: new Float32Array(n), n: n, i: p0, done: false,
            sr: sr, t60: t60, pre: p0, damp: damp, k: Math.log(1000) / t60,
            lpL: 0, lpR: 0, rnd: rng(seed) };
  return J;
}
function irWork(J, samples) {
  var end = Math.min(J.n, J.i + samples), sr = J.sr, i;
  for (i = J.i; i < end; i++) {
    var t = (i - J.pre) / sr;
    var a = (t < 0.004 ? t / 0.004 : 1) * Math.exp(-J.k * t);
    var coef = 0.15 + J.damp * 0.8 * (t / J.t60);
    if (coef > 0.97) coef = 0.97;
    J.lpL += (1 - coef) * ((J.rnd() * 2 - 1) - J.lpL);
    J.lpR += (1 - coef) * ((J.rnd() * 2 - 1) - J.lpR);
    J.L[i] = J.lpL * a;
    J.R[i] = J.lpR * a;
  }
  J.i = end;
  if (end >= J.n && !J.done) {
    for (var r = 0; r < 6; r++) {
      var at = J.pre + Math.floor(sr * (0.007 + 0.011 * r + J.rnd() * 0.006));
      if (at < J.n) { J.L[at] += 0.5 * Math.pow(0.7, r); J.R[at] -= 0.5 * Math.pow(0.7, r); }
    }
    J.done = true;
  }
  return J.done;
}

/* the soft clipper: exactly linear up to 0.6, then a tanh knee that tops out
   at 0.905, so the output can never touch full scale */
function softClipCurve(n) {
  var c = new Float32Array(n);
  for (var i = 0; i < n; i++) {
    var x = i / (n - 1) * 2 - 1, a = Math.abs(x);
    var y = a <= 0.6 ? a : 0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4);
    c[i] = x < 0 ? -y : y;
  }
  return c;
}

/* four seconds of stereo pinkish noise (three leaky integrators of white
   noise), the raw material for every wind, wave and rain in the game. It is
   made a slice at a time, like the reverb's rooms, because all at once it
   is tens of milliseconds of work landing on the very tap that wakes the
   sound. */
function noiseJob(L, R, rnd) {
  return { L: L, R: R, n: L.length, X: 512, g: new Float32Array(L.length + 512), ch: 0, i: 0,
           b0: 0, b1: 0, b2: 0, rnd: rnd, done: false };
}
function noiseWork(J, samples) {
  var n = J.n, X = J.X, g = J.g, i;
  while (samples > 0 && !J.done) {
    var end = Math.min(n + X, J.i + samples), b0 = J.b0, b1 = J.b1, b2 = J.b2;
    for (i = J.i; i < end; i++) {
      var w = J.rnd() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      g[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    J.b0 = b0; J.b1 = b1; J.b2 = b2;
    samples -= end - J.i;
    J.i = end;
    if (J.i < n + X) break;
    /* The buffer loops, so its last sample is followed by its first. The
       noise runs X samples past the end, and the first X samples fade from
       that overrun into the real start — so the sample after the wrap is
       exactly the one that would have come next, and the loop never ticks. */
    var d = J.ch ? J.R : J.L, mean = 0;
    for (i = 0; i < n; i++) {
      d[i] = i < X ? g[i] * (i / X) + g[n + i] * (1 - i / X) : g[i];
      mean += d[i];
    }
    mean /= n;
    for (i = 0; i < n; i++) d[i] -= mean;
    samples -= n;
    J.ch++; J.i = 0; J.b0 = J.b1 = J.b2 = 0;
    if (J.ch > 1) { J.done = true; J.g = null; }
  }
  return J.done;
}
function fillNoise(L, R, rnd) { noiseWork(noiseJob(L, R, rnd), Infinity); }

/* ================================================================
   5. levels
   ================================================================
   Targets are peak dBFS at the output with every slider at its default,
   from the design's reward ladder: small sounds frequent and quiet, big
   sounds rare. CAL removes the make-up gain the output compressor applies
   to everything below its threshold: measured through the real chain, a
   centred voice comes out 1.8 dB hotter than it goes in. */
var CAL = -1.8;
var LV = {
  move: -33, rotate: -30, bump: -36, brush: -37.3, thump: -23.5, streak: -33,
  lock: -24.5, keepSwell: -34, keep: -32, shimmer: -31,
  loop: -31, arp: -32, layerBell: -31, poly: -33, modal: -31, bowl: -32, glide: -34, bass: -30,
  bloomWorld: -29, wash: -34, ui: -38, chime: -28
};
function peak(db) { return dbToGain(db + CAL); }

/* The bed — the music bus: pads, drones, the loops, the arpeggio — is
   lifted as a whole over the voices' own levels, so that it carries the
   mix: the whole mix sits at −24 to −20 dBFS RMS in play while every sound
   effect stays on its rung of the ladder above, and the Empty Well, at
   −14 dBFS, is still the loudest moment. Each world then has its own small
   `bed` offset, measured so that all ten beds sit at the same loudness
   (−22.6 LUFS with the sliders at their defaults) and a change of world
   never jumps or sags. */
var BED_LIFT = 4.2;
/* the ear is most sensitive between 2 and 5 kHz, so notes above 1 kHz are
   eased off at 3 dB an octave and a high pluck never pokes out */
function hfTrim(f) { return f > 1000 ? Math.sqrt(1000 / f) : 1; }

/* Sliders map to gain on a gentle power curve, normalised so the default
   position of each slider is exactly the calibrated mix. */
var REF = { master: 0.8, music: 0.7, sfx: 0.8, ambience: 0.6 };
function sliderGain(s, ref) { return s > 0 ? Math.pow(s / ref, 1.5) : 0; }

/* voice caps per tier; the oldest, least important voice is stolen with a
   30 ms fade when a category is full */
var CAPS = {
  full:    { pad: 12, bloom: 8, bell: 6, pluck: 8, tick: 4, amb: 10 },
  lite:    { pad: 8,  bloom: 5, bell: 4, pluck: 6, tick: 3, amb: 6 },
  minimal: { pad: 6,  bloom: 3, bell: 4, pluck: 4, tick: 2, amb: 0 }
};
var NODE_BUDGET = 160;
/* Who gives way when the graph is full. Background texture (loops, the
   arpeggio, rain and birds) is refused first; then touch sounds; rewards
   can push out anything below them; the bed — the chords and drones — is
   never refused and never pushed out by anything but its own next chord,
   because a well that falls silent mid-chord is worse than a missing
   raindrop. When the graph is full the bed makes its own room by taking
   the oldest tail of anything that is not the bed. */
var P_BG = 0, P_TOUCH = 1, P_REWARD = 2, P_BED = 3;
var LOOKAHEAD = 0.12, PUMP_MS = 25, SAFETY = 0.010;

/* ================================================================
   6. the engine: one context, one mixer
   ================================================================ */
var E = null;            /* the live engine: {ctx, M, live, fixed, beds, tier, caps, warm} */
var CLOCKFN = null;      /* tests drive a virtual clock through an OfflineAudioContext */
var TRACE = null;        /* tests listen to every note */
var noiseCache = null;
var everRan = false;

function nowT() { return CLOCKFN ? CLOCKFN() : E.ctx.currentTime; }
function perfNow() {
  return root.performance && root.performance.now ? root.performance.now() : Date.now();
}

/* A Line is a long-lived AudioParam with its automation mirrored in
   JavaScript. Web Audio cannot tell you what a param will be worth at a
   future time, and every change on a long-lived param has to start from
   the exact value it has there or it clicks — so the value is modelled, and
   every change is anchored with setValueAtTime at the modelled value first.
   (One engine was seen to output garbage before an unanchored first
   setTargetAtTime; anchoring avoids the whole class of bug.) */
function Line(param, v) {
  param.value = v;
  return { p: param, t: [0], v: [v], x: [0] };
}
function lineAt(L, t) {
  var n = L.t.length, i;
  if (t <= L.t[0]) return L.v[0];
  for (i = 1; i < n; i++) {
    if (t < L.t[i]) {
      var a = L.v[i - 1], b = L.v[i], k = (t - L.t[i - 1]) / (L.t[i] - L.t[i - 1]);
      if (L.x[i] && a > 0 && b > 0) return a * Math.pow(b / a, k);
      return a + (b - a) * k;
    }
  }
  return L.v[n - 1];
}
/* cut the line at t: forget everything scheduled after it and hold */
function lineCut(L, t) {
  var v = lineAt(L, t), keep = 0, i;
  for (i = 0; i < L.t.length; i++) if (L.t[i] < t) keep = i;
  /* drop history that is long gone, keeping one point before t */
  var from = keep;
  L.t = L.t.slice(from, keep + 1); L.v = L.v.slice(from, keep + 1); L.x = L.x.slice(from, keep + 1);
  L.p.cancelScheduledValues(t);
  L.p.setValueAtTime(v, t);
  L.t.push(t); L.v.push(v); L.x.push(0);
  return v;
}
function lineTo(L, v, t, exp) {
  if (exp) {
    v = Math.max(v, 1e-4);
    L.p.exponentialRampToValueAtTime(v, t);
  } else L.p.linearRampToValueAtTime(v, t);
  L.t.push(t); L.v.push(v); L.x.push(exp ? 1 : 0);
}
function lineHold(L, t) {
  var v = L.v[L.v.length - 1];
  if (t > L.t[L.t.length - 1]) {
    L.p.setValueAtTime(v, t);
    L.t.push(t); L.v.push(v); L.x.push(0);
  }
}
/* the common case: from wherever it is at t, glide to v over d seconds */
function glide(L, v, t, d, exp) {
  lineCut(L, t);
  lineTo(L, v, t + Math.max(0.005, d), exp);
}

var noiseRms = 0.1;
/* begin the noise for a sample rate; the bake slices finish it */
function startNoise(sr) {
  var n = Math.floor(sr * 4);
  D.noiseJob = noiseJob(new Float32Array(n), new Float32Array(n), rng(99));
  D.noiseJob.sr = sr;
  return D.noiseJob;
}
/* the finished noise as a buffer for this context */
function noiseReady(c) {
  var J = D.noiseJob, n = J.n, b = c.createBuffer(2, n, c.sampleRate), e = 0;
  b.getChannelData(0).set(J.L); b.getChannelData(1).set(J.R);
  for (var i = 0; i < n; i++) e += J.L[i] * J.L[i] + J.R[i] * J.R[i];
  noiseRms = Math.sqrt(e / (2 * n));
  noiseCache = b;
  D.noiseJob = null;
  return b;
}
/* needed now: whatever is left of the noise is made at once */
function noiseBuffer(c) {
  if (noiseCache && noiseCache.sampleRate === c.sampleRate) return noiseCache;
  var J = D.noiseJob && D.noiseJob.sr === c.sampleRate ? D.noiseJob : startNoise(c.sampleRate);
  noiseWork(J, Infinity);
  return noiseReady(c);
}
function haveNoise() { return !!(E && noiseCache && noiseCache.sampleRate === E.ctx.sampleRate); }
/* How much of the noise a filter lets through. Pink noise carries equal
   power in every octave, so the power a filter passes is the mean of
   |H(f)|² over a log-spaced grid — which the filter itself will report.
   Dividing by its square root lets every bed's level be written as the
   loudness it actually has, whatever its filter. */
var LOGF = null, MAG = null, PH = null;
function filterPower(f) {
  if (!LOGF) {
    LOGF = new Float32Array(48); MAG = new Float32Array(48); PH = new Float32Array(48);
    for (var i = 0; i < 48; i++) LOGF[i] = 20 * Math.pow(1000, (i + 0.5) / 48);
  }
  try { f.getFrequencyResponse(LOGF, MAG, PH); } catch (x) { return 0.1; }
  var s = 0;
  for (var j = 0; j < 48; j++) s += MAG[j] * MAG[j];
  return Math.max(1e-4, s / 48);
}
/* a bed's gain for a target level in dBFS. Beds are written at the level a
   meter would call their peak; noise sits about 4 dB under that on average. */
function bedGain(db, filt) {
  return dbToGain(db - 4 + CAL) / (noiseRms * Math.sqrt(filterPower(filt)));
}
/* The pads' wave: harmonics at 1/n^1.6, softer than a saw and richer than a
   sine, so a chord still has a pitch on a phone speaker that cannot play
   its fundamentals. The harmonics are given Schroeder's phases rather than
   all starting together: the ear cannot tell the difference in a sustained
   tone, but the waveform loses its sawtooth spike, so a ten-oscillator
   chord peaks several dB lower for the same loudness — headroom the whole
   mix gets to keep. */
function warmWave(e) {
  if (e.warm) return e.warm;
  var N = 24, re = new Float32Array(N), im = new Float32Array(N);
  for (var n = 1; n < N; n++) {
    var a = 1 / Math.pow(n, 1.6), ph = Math.PI * n * (n - 1) / (N - 1);
    re[n] = a * Math.sin(ph);
    im[n] = a * Math.cos(ph);
  }
  e.warm = e.ctx.createPeriodicWave(re, im);
  return e.warm;
}

/* The mixer. Voices feed lanes (dry or wet, per bus); every bus applies its
   slider *before* its reverb send, so a muted bus is silent in the reverb
   too. Pads have their own sub-bus, where the Breath swell and Tide's waves
   act on all of them at once.

     pads → lift → tilt → wave ─┐
     music dry/wet ─────────────┴→ duck → tone (LP) → pause gain ─┐
     sfx dry/wet → gate → shelf (Soften) ─────────────────────────┤
     ui ─────────→ shelf                                           │
     ambience dry/wet ─────────────────────────────────────────────┤
     wet sends → verb in → [convolver | delay net] → verb tone → boost → verb out ┤
     master → fade → high-pass 30 Hz → compressor → soft clip → speakers  */
function buildMixer(e) {
  var c = e.ctx, M = {}, n = 0;
  function G(v) { var g = c.createGain(); g.gain.value = v; n++; return g; }
  function F(type, f, q) {
    var b = c.createBiquadFilter(); b.type = type; b.frequency.value = f;
    if (q !== undefined) b.Q.value = q;
    n++; return b;
  }
  M.master = G(1); M.fade = G(1);
  M.hp = F("highpass", 30, 0.707);
  /* one gentle glue compressor: the spec's defaults (−24 dB, 12:1, a 30 dB
     knee) would pump an ambient mix; this only leans on the loudest moments */
  M.comp = c.createDynamicsCompressor(); n++;
  M.comp.threshold.value = -18; M.comp.knee.value = 12; M.comp.ratio.value = 3;
  M.comp.attack.value = 0.012; M.comp.release.value = 0.3;
  M.clip = c.createWaveShaper(); n++;
  M.clip.curve = softClipCurve(2049); M.clip.oversample = "none";
  M.master.connect(M.fade); M.fade.connect(M.hp); M.hp.connect(M.comp);
  M.comp.connect(M.clip); M.clip.connect(c.destination);

  M.verbIn = G(1); M.verbTone = F("lowpass", 18000, 0.5); M.verbBoost = G(1); M.verbOut = G(0);
  M.verbTone.connect(M.verbBoost); M.verbBoost.connect(M.verbOut); M.verbOut.connect(M.master);

  M.musicDry = G(1); M.musicWet = G(1); M.musicSend = G(0.55);
  M.duck = G(1); M.musicTone = F("lowpass", 18000, 0.5); M.musicPause = G(1);
  M.musicDry.connect(M.duck); M.musicWet.connect(M.duck);
  M.musicWet.connect(M.musicSend); M.musicSend.connect(M.verbIn);
  M.duck.connect(M.musicTone); M.musicTone.connect(M.musicPause); M.musicPause.connect(M.master);

  M.padIn = G(1); M.padTilt = F("highshelf", 1500); M.padTilt.gain.value = 0; M.padWave = G(1);
  M.padIn.connect(M.padTilt); M.padTilt.connect(M.padWave); M.padWave.connect(M.musicWet);
  /* pads share three fixed pan positions instead of a panner each */
  M.padL = c.createStereoPanner(); M.padR = c.createStereoPanner(); n += 2;
  M.padL.pan.value = -0.35; M.padR.pan.value = 0.35;
  M.padL.connect(M.padIn); M.padR.connect(M.padIn);
  M.padL.panned = M.padR.panned = true;

  M.sfxDry = G(1); M.sfxWet = G(1); M.sfxSend = G(0.4); M.gate = G(1);
  M.shelf = F("highshelf", 4000); M.shelf.gain.value = 0;
  M.sfxDry.connect(M.gate); M.sfxWet.connect(M.gate);
  M.sfxWet.connect(M.sfxSend); M.sfxSend.connect(M.verbIn);
  M.gate.connect(M.shelf); M.shelf.connect(M.master);
  M.ui = G(1); M.ui.connect(M.shelf);
  /* reward figures share two pre-panned lanes (and the centre) instead of a
     panner per note: a figure of a dozen bells is a dozen nodes lighter */
  M.sfxL = c.createStereoPanner(); M.sfxR = c.createStereoPanner(); n += 2;
  M.sfxL.pan.value = -0.4; M.sfxR.pan.value = 0.4;
  M.sfxL.connect(M.sfxWet); M.sfxR.connect(M.sfxWet);
  M.sfxL.panned = M.sfxR.panned = true;

  M.ambDry = G(1); M.ambWet = G(1); M.ambSend = G(0.3);
  M.ambDry.connect(M.master); M.ambWet.connect(M.master);
  M.ambWet.connect(M.ambSend); M.ambSend.connect(M.verbIn);

  /* every param that changes over a session is a Line */
  M.Lmaster = Line(M.master.gain, 1); M.Lfade = Line(M.fade.gain, 1);
  M.LmusicDry = Line(M.musicDry.gain, 1); M.LmusicWet = Line(M.musicWet.gain, 1);
  M.LsfxDry = Line(M.sfxDry.gain, 1); M.LsfxWet = Line(M.sfxWet.gain, 1); M.Lui = Line(M.ui.gain, 1);
  M.LambDry = Line(M.ambDry.gain, 1); M.LambWet = Line(M.ambWet.gain, 1);
  M.Lduck = Line(M.duck.gain, 1);
  M.Ltone = Line(M.musicTone.frequency, 18000); M.Lpause = Line(M.musicPause.gain, 1);
  M.LverbTone = Line(M.verbTone.frequency, 18000); M.Lboost = Line(M.verbBoost.gain, 1);
  M.LverbOut = Line(M.verbOut.gain, 0);
  M.Lgate = Line(M.gate.gain, 1); M.Lshelf = Line(M.shelf.gain, 0);
  M.Llift = Line(M.padIn.gain, 1); M.Ltilt = Line(M.padTilt.gain, 0); M.Lwave = Line(M.padWave.gain, 1);
  M.core = null; M.coreKind = ""; M.coreNodes = 0;
  e.fixed = n;
  return M;
}

/* the reverb core sits between verbIn and verbTone, and can be swapped */
function setCore(e, kind, buffer, W) {
  var c = e.ctx, M = e.M, nodes = [], i;
  if (M.core) {
    for (i = 0; i < M.core.length; i++) { try { M.core[i].disconnect(); } catch (x) {} }
    try { M.verbIn.disconnect(); } catch (x2) {}
    M.core = null;
  }
  if (kind === "conv") {
    var cv = c.createConvolver();
    cv.normalize = true;                    /* must be set before the buffer */
    cv.buffer = buffer;
    M.verbIn.connect(cv); cv.connect(M.verbTone);
    nodes.push(cv);
  } else {
    /* the light tier's reverb: two feedback delays of 87 and 131 ms that
       feed each other through a 2.5 kHz low-pass, one per side. The loop
       gain is set from the world's T60 so the tail still has its length.
       The low-passes must not resonate: at the default Q a browser's
       low-pass peaks 2 dB over unity at its cut-off, which inside a loop of
       gain 0.8 is a loop of gain above 1 — a tail that grows instead of
       dying, found by the render tests a minute into Aurora. Q −6 dB is
       flat to the cut-off, so the loop can never gain. */
    var t60 = W ? W.verb.t60 : 3, merge = c.createChannelMerger(2);
    var dl = c.createDelay(0.5), dr = c.createDelay(0.5);
    var fl = c.createBiquadFilter(), fr = c.createBiquadFilter();
    var gl = c.createGain(), gr = c.createGain();
    dl.delayTime.value = 0.087; dr.delayTime.value = 0.131;
    fl.type = fr.type = "lowpass"; fl.frequency.value = fr.frequency.value = 2500;
    fl.Q.value = fr.Q.value = -6;
    gl.gain.value = Math.min(0.8, Math.pow(10, -3 * 0.131 / t60));
    gr.gain.value = Math.min(0.8, Math.pow(10, -3 * 0.087 / t60));
    M.verbIn.connect(dl); M.verbIn.connect(dr);
    dl.connect(fl); fl.connect(gl); gl.connect(dr);
    dr.connect(fr); fr.connect(gr); gr.connect(dl);
    dl.connect(merge, 0, 0); dr.connect(merge, 0, 1);
    merge.connect(M.verbTone);
    nodes.push(merge, dl, dr, fl, fr, gl, gr);
  }
  M.core = nodes; M.coreKind = kind; M.coreNodes = nodes.length;
}

function makeEngine(ctx, tier) {
  var e = { ctx: ctx, tier: tier, caps: CAPS[tier] || CAPS.full, warm: null,
            live: { pad: [], bloom: [], bell: [], pluck: [], tick: [], amb: [] },
            fixed: 0, beds: 0, M: null, peakNodes: 0 };
  e.M = buildMixer(e);
  return e;
}

/* ================================================================
   7. the voice pool: caps, a node budget, stealing
   ================================================================
   Every voice ends in the same small tail: its envelope gain, then a
   private "steal" gain, then (unless it is centred) a stereo panner, then a
   lane. The steal gain has no automation of its own until the moment it is
   needed, so taking a voice away is always a clean 30 ms fade and never
   needs cancelScheduledValues on an envelope already in flight. */
var CATS = ["amb", "tick", "pluck", "bell", "bloom", "pad"];
function liveNodes(t) {
  var n = E.fixed + E.beds + E.M.coreNodes;
  for (var c = 0; c < CATS.length; c++) {
    var L = E.live[CATS[c]];
    for (var i = 0; i < L.length; i++) if (L[i].end > t) n += L[i].nodes;
  }
  return n;
}
function prune(L, t) {
  var w = 0;
  for (var i = 0; i < L.length; i++) if (L[i].end > t) L[w++] = L[i];
  L.length = w;
}
function stealVoice(v, t) {
  var g = v.steal.gain, from = 1;
  if (v.fadeT1 > v.fadeT0) {               /* already fading: start from where it is */
    from = t >= v.fadeT1 ? 0 : t <= v.fadeT0 ? 1 : 1 - (t - v.fadeT0) / (v.fadeT1 - v.fadeT0);
    g.cancelScheduledValues(t);
  }
  g.setValueAtTime(from * v.g0, t);
  g.linearRampToValueAtTime(0, t + 0.03);
  for (var i = 0; i < v.srcs.length; i++) { try { v.srcs[i].stop(t + 0.04); } catch (x) {} }
  v.end = Math.min(v.end, t + 0.04);
}
/* a slower, musical release for a whole voice: pads at a world change */
function fadeVoice(v, t, secs) {
  if (v.fadeT1 > v.fadeT0 || v.end <= t) return;
  var g = v.steal.gain;
  g.setValueAtTime(v.g0, t);
  g.linearRampToValueAtTime(0, t + secs);
  v.fadeT0 = t; v.fadeT1 = t + secs;
  for (var i = 0; i < v.srcs.length; i++) { try { v.srcs[i].stop(t + secs + 0.05); } catch (x) {} }
  v.end = Math.min(v.end, t + secs + 0.05);
}
/* the least important, oldest voice in a list */
function weakest(L) {
  var best = -1;
  for (var i = 0; i < L.length; i++) {
    if (best < 0 || L[i].prio < L[best].prio || (L[i].prio === L[best].prio && L[i].t0 < L[best].t0)) best = i;
  }
  return best;
}
/* May a voice of `cat` with `nodes` nodes start at t? Steals to make room,
   or refuses a background voice when the graph is already full. */
function admit(cat, t, nodes, prio) {
  var cap = E.caps[cat];
  if (cap === 0) return false;
  var L = E.live[cat], k;
  prune(L, t);
  while (L.length >= cap) {
    k = weakest(L);
    if (L[k].prio > prio) return false;     /* never steal a reward for background */
    stealVoice(L[k], t);
    L.splice(k, 1);
  }
  /* Nodes exist from the moment they are made, not from when they sound:
     everything already scheduled counts, even a voice that will have
     finished by t. A little headroom under the budget, too, because a
     stolen voice still exists for the 40 ms of its fade. */
  var at = CLOCKFN || E.ctx.state === "running" ? Math.min(t, nowT()) : t;
  var count = liveNodes(at);
  var budget = NODE_BUDGET - 10;
  if (count + nodes > budget) {
    if (prio === P_BG) return false;
    /* the bed may take the oldest of anything but itself; anything else
       only what ranks no higher than it does */
    var reach = prio === P_BED ? P_REWARD : prio;
    for (var c = 0; c < CATS.length && count + nodes > budget; c++) {
      var M = E.live[CATS[c]];
      while (M.length && count + nodes > budget) {
        k = weakest(M);
        if (M[k].prio > reach) break;
        count -= M[k].end > at ? M[k].nodes : 0;
        stealVoice(M[k], t);
        M.splice(k, 1);
      }
    }
    if (count + nodes > budget && prio !== P_BED) return false;
  }
  return true;
}
/* Wire a voice's tail and register it. A stereo panner spreads a mono voice
   at equal power, so even at the centre each side gets it 3 dB down; a voice
   with no panner anywhere on its way reaches both sides at full level. Such
   voices ride their steal gain at √½, and a voice is equally loud wherever
   it sits. (A voice sent into a panning lane has its panner already.) */
function finish(cat, t, end, srcs, shape, pan, lane, nodes, prio, tag, midi) {
  var c = E.ctx, steal = c.createGain(), g0 = pan || lane.panned ? 1 : Math.SQRT1_2;
  steal.gain.value = g0;
  shape.connect(steal);
  var total = nodes + 1;
  if (pan) {
    var p = c.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    steal.connect(p); p.connect(lane);
    total++;
  } else steal.connect(lane);
  var v = { t0: t, end: end, srcs: srcs, steal: steal, g0: g0, nodes: total, prio: prio, fadeT0: 0, fadeT1: 0, tag: tag };
  E.live[cat].push(v);
  if (TRACE) TRACE({ t: t, cat: cat, tag: tag, midi: midi, end: end, nodes: liveNodes(t), live: E.live[cat].length, w: D.W.id, vn: total });
  var count = liveNodes(t);
  if (count > E.peakNodes) E.peakNodes = count;
  return v;
}

/* ================================================================
   8. the voices
   ================================================================ */
function softenOn() { return S.soften || S.calm; }
/* the shortest attack any voice may have: 3 ms always, 20 ms with Soften */
function atk(a) { return Math.max(a || 0, softenOn() ? 0.02 : 0.003); }
function laneOf(name) {
  var M = E.M;
  return name === "sfxWet" ? M.sfxWet : name === "sfxL" ? M.sfxL : name === "sfxR" ? M.sfxR
       : name === "musicDry" ? M.musicDry : name === "musicWet" ? M.musicWet
       : name === "ambDry" ? M.ambDry : name === "ambWet" ? M.ambWet : name === "ui" ? M.ui : M.sfxDry;
}

/* Every envelope starts from an intrinsic value of zero. A GainNode is
   worth 1 until its first automation event, and a source started at a
   fractional sample time may emit its first frame one frame *before* that
   event — so a gain left at its default lets one full-scale sample through,
   a click as loud as anything in the game. Found by the render tests, on a
   noise burst that happened to start a hair after a frame boundary. */
function envGain() { var g = E.ctx.createGain(); g.gain.value = 0; return g; }

/* FM: bells, glass, the music box, the rotate tick. The index (the
   brightness) decays faster than the amplitude, so a note starts struck and
   ends round. No voice uses a 1:1 ratio: there one sideband lands exactly
   on 0 Hz, and the render tests measured the browser leaving a DC offset of
   up to half the signal in it — which a high-pass anywhere downstream then
   turns into peaks 4 dB over the note's level. The e-piano tines are
   additive instead (below). */
function fm(t, midi, dbPeak, o) {
  var c = E.ctx, f = mtof(midi), fmod = f * o.ratio, dev = o.index * fmod;
  var nyq = c.sampleRate * 0.45;
  if (f + dev + fmod > nyq) dev = Math.max(0, nyq - f - fmod);
  var a = atk(o.attack || 0.005), decay = o.decay, end = t + a + decay * 1.05;
  var nodes = 4;
  if (!admit(o.cat || "bell", t, nodes + 1 + (o.pan ? 1 : 0), o.prio || 0)) return null;
  var car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = envGain();
  car.frequency.setValueAtTime(f, t);
  mod.frequency.setValueAtTime(fmod, t);
  mg.gain.value = 0;
  mg.gain.setValueAtTime(dev, t);
  mg.gain.setTargetAtTime(dev * (o.end / o.index), t, decay * 0.12);
  mod.connect(mg); mg.connect(car.frequency); car.connect(g);
  var pk = peak(dbPeak) * hfTrim(f) * (o.vel || 1);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk, t + a);
  g.gain.setTargetAtTime(0, t + a, decay / 6.9);
  /* the modulator starts a quarter-cycle early, in cosine phase, so its
     integral (Web Audio modulates frequency, not phase) carries no offset;
     its depth is zero until t, so the early quarter-cycle is silent */
  car.start(t); mod.start(Math.max(0, t - 0.25 / fmod)); car.stop(end); mod.stop(end);
  return finish(o.cat || "bell", t, end, [car, mod], g, o.pan, laneOf(o.lane), nodes, o.prio || 0, o.tag, midi);
}

/* additive: sines at measured partial ratios, each with its own decay.
   Wood chimes are a struck bar (1 : 2.76 : 5.40, the house's own model in
   chess/sound.js); the mountain bell is a tuned bell (hum, prime, tierce,
   quint, nominal at 0.5 / 1 / 1.2 / 1.5 / 2 of the prime). */
var CHIME = { ratios: [1, 2.76, 5.40], gains: [1, 0.42, 0.2], decays: [1.2, 0.4, 0.15] };
/* an electric-piano tine: the fundamental, the pickup's second and third
   harmonics dying faster, and a brief high "bark" as the hammer strikes */
var TINE = { ratios: [1, 2, 3, 6.3], gains: [1, 0.38, 0.16, 0.05], decays: [1.9, 1.0, 0.5, 0.08] };
var MODAL = { ratios: [0.5, 1, 1.2, 1.5, 2], gains: [0.55, 1, 0.45, 0.32, 0.28], decays: [7, 5, 3.4, 2.8, 2.2] };
function additive(t, midi, dbPeak, spec, o) {
  var c = E.ctx, f = mtof(midi), n = spec.ratios.length, nyq = c.sampleRate * 0.45, i;
  var a = atk(o.attack || 0.004), longest = 0;
  for (i = 0; i < n; i++) if (spec.decays[i] > longest) longest = spec.decays[i];
  var end = t + a + longest * 1.05, nodes = 1 + 2 * n;
  if (!admit(o.cat || "bell", t, nodes + 1 + (o.pan ? 1 : 0), o.prio || 0)) return null;
  var g = envGain(), srcs = [];
  var pk = peak(dbPeak) * hfTrim(f) * (o.vel || 1) / specPeak(spec);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk, t + a);
  for (i = 0; i < n; i++) {
    var pf = f * spec.ratios[i];
    if (pf > nyq) continue;
    var osc = c.createOscillator(), pg = c.createGain();
    osc.frequency.setValueAtTime(pf, t);
    pg.gain.setValueAtTime(spec.gains[i], t);
    pg.gain.setTargetAtTime(0, t + a, spec.decays[i] / 6.9);
    osc.connect(pg); pg.connect(g);
    osc.start(t); osc.stop(end);
    srcs.push(osc);
  }
  return finish(o.cat || "bell", t, end, srcs, g, o.pan, laneOf(o.lane), nodes, o.prio || 0, o.tag, midi);
}

/* How high a set of partials actually peaks once they start together:
   worked out numerically, once per spec, over the first 60 ms at 440 Hz
   (where the sum is loudest). Dividing by it puts every additive voice's
   heard peak on its target, whatever its partials. */
function specPeak(spec) {
  if (spec.pk) return spec.pk;
  var sr = 48000, f = 440, pk = 1e-3;
  for (var j = 0; j < sr * 0.06; j++) {
    var tt = j / sr, v = 0;
    for (var i = 0; i < spec.ratios.length; i++) {
      v += spec.gains[i] * Math.exp(-tt * 6.9 / spec.decays[i]) * Math.sin(2 * Math.PI * f * spec.ratios[i] * tt);
    }
    if (v > pk) pk = v; else if (-v > pk) pk = -v;
  }
  spec.pk = pk;
  return pk;
}
var scaled = {};
function scaleDecay(spec, k) {
  var key = Math.round(k * 100);
  if (scaled[key]) return scaled[key];
  var d = [];
  for (var i = 0; i < spec.decays.length; i++) d.push(spec.decays[i] * k);
  scaled[key] = { ratios: spec.ratios, gains: spec.gains, decays: d };
  return scaled[key];
}

/* a singing bowl: two sines 0.6 Hz apart, so it beats slowly as it rings,
   and a faint octave above it beating at its own rate */
function bowl(t, midi, dbPeak, o) {
  var c = E.ctx, f = mtof(midi), a = atk(0.45), end = t + a + 7.5;
  if (!admit("bell", t, 7 + 1 + (o.pan ? 1 : 0), 0)) return null;
  var g = envGain(), srcs = [], parts = [[f, 1], [f + 0.6, 1], [2 * f + 0.9, 0.3]];
  for (var i = 0; i < parts.length; i++) {
    var osc = c.createOscillator(), pg = c.createGain();
    osc.frequency.setValueAtTime(parts[i][0], t);
    pg.gain.value = parts[i][1];
    osc.connect(pg); pg.connect(g); osc.start(t); osc.stop(end);
    srcs.push(osc);
  }
  var pk = peak(dbPeak) / 2.3;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk, t + a);
  g.gain.setTargetAtTime(0, t + a, 7 / 6.9);
  return finish("bell", t, end, srcs, g, o.pan, laneOf(o.lane || "musicWet"), 7, 0, "bowl", midi);
}

/* the lead of a world, whatever it is made of */
function lead(t, midi, dbPeak, W, o) {
  var L = W.lead;
  if (L.kind === "chime") return additive(t, midi, dbPeak, CHIME, o);
  if (L.kind === "tine") return additive(t, midi, dbPeak, scaleDecay(TINE, (o.decay || L.decay) / 1.9), o);
  return fm(t, midi, dbPeak, { ratio: L.ratio, index: L.index * (o.bright || 1), end: L.end,
                               decay: (o.decay || L.decay), attack: o.attack, pan: o.pan, lane: o.lane,
                               cat: o.cat, prio: o.prio, tag: o.tag, vel: o.vel });
}

/* PADS. A new set of voices for every chord. `midi` may be one note or
   several: notes that share an envelope, a filter sweep and a side of the
   stereo field share the nodes for them too, which is the same sound for a
   quarter fewer nodes. Released voices stop once they are 40 dB down. */
function pad(t, midi, dur, dbPeak, P, o) {
  var notes = typeof midi === "number" ? [midi] : midi;
  var c = E.ctx, n = E.tier === "full" ? (o.voices || P.voices) : 1;
  var a = atk(o.attack || P.attack), rel = o.release || P.release, hold = Math.max(a, dur);
  var end = o.forever ? Infinity : t + hold + rel * 1.15;
  var cat = o.cat || "pad", nodes = notes.length * n + 2;
  if (!admit(cat, t, nodes + 1, o.prio || 0)) return null;
  var lp = c.createBiquadFilter(), g = envGain(), srcs = [], i;
  var co = o.cutoff || P.cutoff;
  lp.type = "lowpass"; lp.Q.value = 0.5;
  lp.frequency.setValueAtTime(co * 0.5, t);
  lp.frequency.linearRampToValueAtTime(co, t + a);
  if (P.lfo && !o.forever && dur > 4) {
    /* Aurora's pads open and close once over each chord, about 0.05 Hz */
    lp.frequency.linearRampToValueAtTime(co * 1.6, t + a + (dur - a) * 0.5);
    lp.frequency.linearRampToValueAtTime(co, t + dur);
  }
  var spread = n === 4 ? [-9, -3, 3, 9] : n === 2 ? [-P.detune, P.detune] : [0];
  var w = warmWave(E);
  for (var k = 0; k < notes.length; k++) {
    for (i = 0; i < n; i++) {
      var osc = c.createOscillator();
      osc.setPeriodicWave(w);
      osc.frequency.setValueAtTime(mtof(notes[k]), t);
      osc.detune.setValueAtTime(spread[i] * (k % 2 ? -1 : 1), t);
      osc.connect(lp);
      osc.start(t);
      if (end !== Infinity) osc.stop(end);
      srcs.push(osc);
    }
  }
  lp.connect(g);
  var pk = peak(dbPeak) / Math.sqrt(n);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk, t + a);
  if (end !== Infinity) {
    g.gain.setValueAtTime(pk, t + hold);
    g.gain.setTargetAtTime(0, t + hold, rel / 4);
  }
  var lane = o.lane ? laneOf(o.lane) : o.side < 0 ? E.M.padL : o.side > 0 ? E.M.padR : E.M.padIn;
  return finish(cat, t, end, srcs, g, 0, lane, nodes, o.prio || 0, o.tag || "pad", notes[0]);
}

/* PLUCKS: Karplus–Strong, baked per world (five pool notes, two variants
   each, in the keyboard's octave) and reached in other octaves by playback
   rate. A buffer missing at the moment it is needed is baked on the spot. */
var plucks = {};
function bakeOne(W, midi, variant) {
  var P = W.pluck, sr = E.ctx.sampleRate, key = sr + "|" + W.id + "|" + midi + "|" + variant;
  if (plucks[key]) return plucks[key];
  var f = mtof(midi), secs = clamp(P.t60 * 1.25, 0.9, 2.4);
  var b = bakePluck(sr, f, P.t60, P.bright, secs, rng(midi * 131 + variant * 7 + Math.round(P.bright * 100)));
  var ab = E.ctx.createBuffer(1, b.data.length, sr);
  ab.getChannelData(0).set(b.data);
  plucks[key] = { buf: ab, corr: b.rate, midi: midi, secs: secs, data: b.data, norm: {} };
  return plucks[key];
}
function pluckFor(W, midi, variant, tone, attack) {
  var pc = midi % 12, base = W.keys + ((pc - W.tonicPc + 12) % 12);
  var B = bakeOne(W, base, variant), rate = B.corr * Math.pow(2, (midi - base) / 12);
  /* how loud this string will really be once its attack ramp and tone filter
     have had their say, worked out once and remembered */
  var key = Math.round(rate * 1000) + "|" + Math.round(tone) + "|" + Math.round(attack * 1000);
  if (!B.norm[key]) B.norm[key] = 1 / heardPeak(B.data, E.ctx.sampleRate, rate, tone, attack);
  return { buf: B.buf, rate: rate, secs: B.secs, norm: B.norm[key] };
}
/* The first 80 ms of a string as the ear will get it: read from the buffer
   at `rate` with linear interpolation (what the browser's buffer source
   does, and at half speed it smooths the noisy attack audibly), through the
   envelope's attack ramp, then the voice's low-pass — the cookbook biquad
   the browser uses, its Q given in dB as Web Audio's low-pass takes it. */
function heardPeak(d, sr, rate, tone, attack) {
  var fc = Math.min(sr * 0.45, tone), w = 2 * Math.PI * fc / sr, q = Math.pow(10, 0.6 / 20);
  var al = Math.sin(w) / (2 * q), cw = Math.cos(w), a0 = 1 + al;
  var b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, b2 = b0, a1 = -2 * cw / a0, a2 = (1 - al) / a0;
  var x1 = 0, x2 = 0, y1 = 0, y2 = 0, pk = 1e-4, ramp = Math.max(1, attack * sr);
  var n = Math.floor(sr * 0.08);
  for (var j = 0; j < n; j++) {
    var pos = j * rate, i = Math.floor(pos), fr = pos - i;
    if (i + 1 >= d.length) break;
    var x = (d[i] + (d[i + 1] - d[i]) * fr) * (j < ramp ? j / ramp : 1);
    var y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    if (y > pk) pk = y; else if (-y > pk) pk = -y;
  }
  return pk;
}
function pluck(t, midi, dbPeak, W, o) {
  var c = E.ctx, a = atk(o.attack || 0.004), tone = o.tone || W.pluck.tone;
  var B = pluckFor(W, midi, o.variant || 0, tone, a);
  var hold = o.hold || 0.5, rel = o.release || 0.3;
  var natural = B.secs / B.rate, end = t + Math.min(natural, hold + rel * 5);
  var cat = o.cat || "pluck";
  if (!admit(cat, t, 3 + 1 + (o.pan ? 1 : 0), o.prio || 0)) return null;
  var s = c.createBufferSource(), lp = c.createBiquadFilter(), g = envGain();
  s.buffer = B.buf;
  s.playbackRate.setValueAtTime(B.rate, t);
  lp.type = "lowpass"; lp.frequency.value = tone; lp.Q.value = 0.6;
  var pk = peak(dbPeak) * B.norm * hfTrim(mtof(midi)) * (o.vel || 1);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk, t + a);
  if (hold + a < end - t) {
    g.gain.setValueAtTime(pk, t + a + hold * 0.02);
    g.gain.setTargetAtTime(0, t + a + hold, rel);
  }
  s.connect(lp); lp.connect(g);
  s.start(t); s.stop(end);
  return finish(cat, t, end, [s], g, o.pan, laneOf(o.lane), 3, o.prio || 0, o.tag, midi);
}

/* a sine with a glide and a simple envelope: birds, raindrops, bubbles,
   twinkles, crickets, the hard drop's thump, Moon Pool's slow glides */
function ping(t, f0, f1, glideS, dbPeak, o) {
  var c = E.ctx, a = atk(o.attack || 0.003), tail = o.tail || 0.2, end = t + a + (o.hold || 0) + tail * 7;
  if (o.pulses) end = t + o.pulses * (o.pulse + o.gap) + 0.05;
  var cat = o.cat || "amb";
  var nodes = 2 + (o.filter ? 1 : 0) + (o.second ? 2 : 0);
  if (!admit(cat, t, nodes + 1 + (o.pan ? 1 : 0), o.prio || 0)) return null;
  var osc = c.createOscillator(), g = envGain(), srcs = [osc], head = g;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + glideS);
  var pk = peak(dbPeak) * (o.vel || 1) * (o.noTrim ? 1 : hfTrim(f0));
  if (o.pulses) {
    /* a cricket: one oscillator gated into short pulses, every edge soft */
    g.gain.setValueAtTime(0, t);
    for (var i = 0; i < o.pulses; i++) {
      var ts = t + i * (o.pulse + o.gap);
      g.gain.setValueAtTime(0, ts);
      g.gain.linearRampToValueAtTime(pk, ts + 0.003);
      g.gain.linearRampToValueAtTime(0, ts + o.pulse);
    }
  } else {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pk, t + a);
    if (o.hold) g.gain.setValueAtTime(pk, t + a + o.hold);
    g.gain.setTargetAtTime(0, t + a + (o.hold || 0), tail);
  }
  if (o.filter) {
    var bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = o.filter; bp.Q.value = 0.7;
    osc.connect(bp); bp.connect(g);
  } else osc.connect(g);
  if (o.second) {
    /* the thump's second partial, an octave up, so a phone speaker that
       cannot reproduce 50 Hz still hears the pitch */
    var o2 = c.createOscillator(), g2 = c.createGain();
    o2.frequency.setValueAtTime(f0 * 2, t);
    if (f1 !== f0) o2.frequency.exponentialRampToValueAtTime(f1 * 2, t + glideS);
    g2.gain.value = o.second;
    o2.connect(g2); g2.connect(g);
    o2.start(t); o2.stop(end);
    srcs.push(o2);
  }
  osc.start(t); osc.stop(end);
  return finish(cat, t, end, srcs, head, o.pan, laneOf(o.lane), nodes, o.prio || 0, o.tag, o.midi);
}

/* filtered noise one-shots: the soft-drop brush, the hard-drop streak, the
   Keep swell, the drain's wash, Snowfall's settling whoosh. Every one of
   them has a soft attack; noise is the one material that can startle. */
function hiss(t, dbPeak, o) {
  var c = E.ctx, a = atk(o.attack), hold = o.hold || 0, rel = o.release, end = t + a + hold + rel * 6;
  var cat = o.cat || "tick";
  if (!admit(cat, t, 3 + 1 + (o.pan ? 1 : 0), o.prio || 0)) return null;
  var s = c.createBufferSource(), f = c.createBiquadFilter(), g = envGain();
  s.buffer = noiseBuffer(c); s.loop = true;
  f.type = o.type; f.Q.value = o.q || 0.7;
  f.frequency.setValueAtTime(o.f0, t);
  if (o.f1 && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(o.f1, t + (o.sweep || a + hold));
  var pk = peak(dbPeak) * (o.gain || 1);
  g.gain.setValueAtTime(0, t);
  if (o.expIn) {
    g.gain.setValueAtTime(pk * 0.01, t);
    g.gain.exponentialRampToValueAtTime(pk, t + a);
  } else g.gain.linearRampToValueAtTime(pk, t + a);
  if (hold) g.gain.setValueAtTime(pk, t + a + hold);
  g.gain.setTargetAtTime(0, t + a + hold, rel);
  s.connect(f); f.connect(g);
  s.start(t, (o.offset || 0) % 3.5);
  s.stop(end);
  return finish(cat, t, end, [s], g, o.pan, laneOf(o.lane), 3, o.prio || 0, o.tag, o.midi);
}

/* ================================================================
   9. state
   ================================================================ */
var S = {
  levels: { master: REF.master, music: REF.music, sfx: REF.sfx, ambience: REF.ambience },
  soften: false, quiet: false, quality: "auto", playOnSilent: false,
  tier: "full", probed: false, session: "unsupported",
  calm: false, paused: false, wantBed: false,
  holds: { app: false, hidden: false, quiet: false }
};
var onStateFns = [];

/* the director: what the music is doing */
var D = {
  W: WORLDS.dawn, pending: null, bed: false, r: rng(1),
  chordStart: 0, chord: 0, layer: 0, danger: 0, melody: 0,
  loops: [], amb: [], drones: [], pads: [],
  last: {}, rep: 0, repDir: 0, lastX: 4, softRows: 0, ended: false,
  breathIn: false, breathPhase: -1, breathRate: 0, breathT: 0, breathFrac: 0.4, breathFull: -1,
  worldBar: 0, irFor: "", irJob: null, polyStep: 0, bakeQ: [], verbSwapAt: 0, verbIdle: false, endAt: 0,
  noiseJob: null, probeJob: null, ambAt: 0
};
var K = { on: false, bpm: 72, spb: 60 / 72 / 4, u: gridUnit(60 / 72 / 4), origin: 0, pOrigin: 0, pU: 0.1, next: 0, bar: 0, s: 0 };

function running() {
  if (!E) return false;
  if (CLOCKFN) return true;
  return E.ctx.state === "running";
}
function audible(bus) {
  if (!E || S.quiet || S.levels.master <= 0) return false;
  if (bus === "music") return S.levels.music > 0;
  if (bus === "sfx") return S.levels.sfx > 0;
  if (bus === "amb") return S.levels.ambience > 0;
  return true;
}
function bedPlaying() { return D.bed && audible("music"); }

/* ================================================================
   10. the clock
   ================================================================ */
function sixteenthFor(W) { return 60 / (W.bpm * (S.calm ? 0.85 : 1)) / 4; }
function startClock(t) {
  K.on = true; K.next = t; K.origin = t; K.pOrigin = t; K.bar = 0; K.s = 0;
  K.spb = sixteenthFor(D.W); K.bpm = 60 / K.spb / 4; K.u = gridUnit(K.spb); K.pU = K.u;
}
function gridAfter(t, origin, u) { return origin + Math.ceil((t - origin) / u - 1e-9) * u; }
/* The quantizer: the first grid line at least 10 ms away; if that is more
   than 120 ms off (only possible on the coarsest grids), the line before
   it — which is then still a few milliseconds in the future. */
function quantize(now) {
  if (!K.on) return now + SAFETY;
  var t0 = now + SAFETY, early = t0 < K.origin, u = early ? K.pU : K.u;
  var when = gridAfter(t0, early ? K.pOrigin : K.origin, u);
  if (early && when > K.origin) when = K.origin;
  if (when - now > GRID_MAX) {
    when -= u;
    if (when < now + 0.003) when = now + SAFETY;
  }
  return when;
}
/* re-anchor the grid at a bar line when the tempo changes */
function retempo(when) {
  var spb = sixteenthFor(D.W);
  if (Math.abs(spb - K.spb) < 1e-9 && !D.forceOrigin) return;
  D.forceOrigin = false;
  K.pOrigin = K.origin; K.pU = K.u;
  K.origin = when; K.spb = spb; K.bpm = 60 / spb / 4; K.u = gridUnit(spb);
}

/* Baking (strings, rooms, the probe's room) has one budget per display
   frame, shared by every way in here — the app's frame, this file's own
   frame, the interval, and Music.event inside the game's 240 Hz tick — so
   a frame that pumps four times still bakes for 3 ms, not 12. The tick
   never bakes at all (pump(true)): its time belongs to the game. */
var bakeBudgetMs = 3, bakeUsed = 0, bakeAt = -1e9, tickedAt = -1e9;
function bakeFrame() { bakeUsed = 0; bakeAt = perfNow(); }
function pump(noBake) {
  if (!running() || !K.on) return;
  var now = nowT(), horizon = now + LOOKAHEAD, guard = 0;
  /* stalled past the look-ahead: skip whole steps silently, never burst */
  if (K.next < now - 0.05) {
    while (K.next < now - 0.01 && guard++ < 512) { step(K.next, true); advance(); }
  }
  guard = 0;
  while (K.next < horizon && guard++ < 64) { step(K.next, false); advance(); }
  horizonWork(now, horizon);
  if (noBake !== true) bakeWork(CLOCKFN ? 1e9 : bakeBudgetMs);
}
function advance() {
  K.next += K.spb;
  K.s++;
  if (K.s >= 16) { K.s = 0; K.bar++; }
}

/* ================================================================
   11. the director: what plays on each sixteenth
   ================================================================ */
function step(when, silent) {
  if (D.pending && D.pending.now && K.s !== 0) {
    /* an immediate world change starts a fresh bar right here */
    K.s = 0; K.bar++; D.forceOrigin = true;
  }
  if (D.barAtBeat && K.s !== 0 && K.s % 4 === 0) {
    /* the music starting: the next beat becomes the top of a bar, so the
       first chord never waits more than a beat */
    K.s = 0; K.bar++; D.forceOrigin = true;
  }
  if (K.s === 0) { D.barAtBeat = false; barStart(when, silent); }
  if (silent || !bedPlaying()) return;
  var W = D.W, s = K.s;
  /* layer 1: a supportive pool arpeggio in eighths, a little over half of them */
  if (D.layer >= 1 && s % 2 === 0 && E.tier !== "minimal" && D.r() < 0.55) arpNote(when);
  if (W.poly) polyStep(when);
}

function barStart(when, silent) {
  if (D.pending) applyWorld(when, silent);
  retempo(when);
  /* intensity layers change only here, with 0.1 of hysteresis, so the music
     never flaps when the stack hovers near a threshold */
  var cap = S.calm ? 0 : 2;
  var want = D.danger > 0.70 ? 2 : D.danger > 0.40 ? 1 : 0;
  var hold = D.danger > 0.60 ? 2 : D.danger > 0.30 ? 1 : 0;
  if (want > D.layer) D.layer = want; else if (hold < D.layer) D.layer = hold;
  if (D.layer > cap) D.layer = cap;

  var W = D.W, rel = K.bar - D.chordStart;
  if (rel >= 0 && rel % W.bpc === 0) {
    D.chord = (rel / W.bpc) % W.prog.length;
    if (!silent && bedPlaying()) playChord(when, D.chord);
  }
  if (silent || !bedPlaying()) return;
  var wb = K.bar - D.worldBar;
  if (W.amb[0] && W.amb[0].k === "ocean" && wb % 2 === 0) oceanCycle(when, 32 * K.spb);
  if (D.layer >= 2 && E.tier !== "minimal") {
    /* layer 2: a soft shimmer bell on every bar */
    var tones = chordPool(W, D.chord);
    lead(when, W.bell + 12 + ((tones[K.bar % tones.length] - W.tonicPc + 12) % 12), LV.layerBell, W,
         { lane: "musicWet", cat: "bell", prio: 0, tag: "layer", pan: 0.3 * (K.bar % 2 ? 1 : -1), decay: 2.4 });
  }
  if (W.temple && wb % 2 === 0) {
    additive(when, W.keys, LV.modal, MODAL, { lane: "musicWet", prio: 0, tag: "modal", pan: -0.15 });
  }
  if (W.temple && wb % 4 === 2 && E.tier !== "minimal") bowl(when, W.keys - 12, LV.bowl, { pan: 0.2 });
  if (W.bass && rel >= 0) {
    var root = W.prog[D.chord][1] + 12;
    pluck(when, root, LV.bass, W, { lane: "musicDry", hold: 0.8, release: 0.5, tone: 900, prio: 0, tag: "bass" });
    pluck(when + 8 * K.spb, root + (D.r() < 0.5 ? 7 : 12), LV.bass - 3, W,
          { lane: "musicDry", hold: 0.6, release: 0.4, tone: 900, prio: 0, tag: "bass" });
  }
  if (W.glide && D.r() < 0.22 && E.tier !== "minimal") {
    var k = Math.floor(D.r() * 5), k2 = k + (D.r() < 0.5 ? 1 : -1);
    var m1 = poolNote(W, k, W.keys + 12), m2 = poolNote(W, k2, W.keys + 12);
    ping(when, mtof(m1), mtof(m2), 1.5, LV.glide, { cat: "bell", lane: "musicWet", attack: 0.8, hold: 1.4,
         tail: 0.6, filter: 800, tag: "glide", midi: m1, noTrim: 1, pan: D.r() * 0.6 - 0.3 });
  }
}

/* the chord tones that are also pool notes: what a rotate may ring */
function chordPool(W, idx) {
  var set = W.chordPc[idx % W.chordPc.length], out = [];
  for (var i = 0; i < set.length; i++) if (W.poolPc.indexOf(set[i]) >= 0 && out.indexOf(set[i]) < 0) out.push(set[i]);
  if (out.length < 2) out = [W.poolPc[0], W.poolPc[3]];
  out.sort(function (a, b) { return ((a - W.tonicPc + 12) % 12) - ((b - W.tonicPc + 12) % 12); });
  return out;
}

function playChord(when, idx) {
  var W = D.W, P = W.pad, i;
  var co = P.cutoff * (D.layer >= 2 ? 1.5 : 1);
  prunePads();
  var first = D.pads.length === 0;
  var attack = first ? P.attack * 1.4 : P.attack;
  /* Each chord holds a little past its bar line, into the next chord's
     attack, before it lets go. Released exactly on the bar line, the old
     chord would be fading while the new one was still climbing, and the bed
     would dip 4–5 dB at every change — a gap you can hear breathe. Held
     for about half the next attack, the total stays within a decibel. */
  var ch = W.prog[idx], dur = W.bpc * 16 * K.spb + P.attack * 0.55;
  D.pads.push(pad(when, ch[1], dur, P.db - 1, P, { side: 0, voices: 1, cutoff: co, attack: attack, tag: "pad", prio: P_BED }));
  D.pads.push(pad(when, [ch[2][0], ch[2][2]], dur, P.db, P, { side: -1, cutoff: co, attack: attack, tag: "pad", prio: P_BED }));
  D.pads.push(pad(when, [ch[2][1], ch[2][3]], dur, P.db, P, { side: 1, cutoff: co, attack: attack, tag: "pad", prio: P_BED }));
  if (P.air && E.tier === "full") {
    /* Bamboo's pads breathe: a little band of noise riding on the chord */
    hiss(when, P.air, { type: "bandpass", f0: mtof(ch[2][3]) * 2, q: 2, attack: attack, hold: dur,
                        release: P.release / 4, lane: "musicWet", cat: "pad", prio: 0, tag: "air", offset: D.r() * 3 });
  }
}
function prunePads() {
  var t = running() ? nowT() : 0, w = 0;
  for (var i = 0; i < D.pads.length; i++) if (D.pads[i] && D.pads[i].end > t) D.pads[w++] = D.pads[i];
  D.pads.length = w;
}
/* let every sounding pad go, over `secs` */
function releasePads(t, secs) {
  for (var i = 0; i < D.pads.length; i++) if (D.pads[i]) fadeVoice(D.pads[i], t, secs);
  D.pads.length = 0;
}
function startDrones(t) {
  stopDrones(t, 2);
  var W = D.W;
  if (!W.drone || !bedPlaying()) return;
  for (var i = 0; i < W.drone.length; i++) {
    D.drones.push(pad(t, W.drone[i][0], 0, W.drone[i][1], W.pad,
                      { forever: true, voices: 1, attack: 5, cutoff: 600, side: 0, tag: "drone", prio: P_BED }));
  }
}
function stopDrones(t, secs) {
  for (var i = 0; i < D.drones.length; i++) if (D.drones[i]) fadeVoice(D.drones[i], t, secs);
  D.drones.length = 0;
}

function arpNote(when) {
  var W = D.W, tones = chordPool(W, D.chord);
  D.arp = (D.arp || 0) + 1;
  /* up and down the chord's pool tones over two octaves */
  var span = tones.length * 2, k = D.arp % (span * 2 - 2), idx = k < span ? k : span * 2 - 2 - k;
  var pc = tones[idx % tones.length], oct = Math.floor(idx / tones.length);
  var midi = W.keys + ((pc - W.tonicPc + 12) % 12) + 12 * oct;
  pluck(when, midi, LV.arp, W, { lane: "musicDry", hold: 0.25, release: 0.18, vel: 0.85 + 0.3 * D.r(),
         pan: (D.r() * 1.2 - 0.6), prio: 0, tag: "arp", variant: D.arp % 2 });
}

/* Starfield's polymeter */
function polyStep(when) {
  var W = D.W, c = D.polyStep++, i;
  for (i = 0; i < W.poly.length; i++) {
    var len = W.poly[i][0], fig = W.poly[i][1];
    if (c % len !== 0) continue;
    var hit = c / len;
    if ((S.calm || E.tier === "minimal") && hit % 2) continue;      /* halved when calm */
    var k = fig[hit % fig.length], midi = poolNote(W, k, W.keys + 12);
    pluck(when, midi, LV.poly, W, { lane: "musicWet", hold: 0.4, release: 0.5, vel: 0.8 + 0.2 * D.r(),
          pan: (i / (W.poly.length - 1) - 0.5) * 1.1, prio: 0, tag: "poly", variant: hit % 2 });
  }
}

/* the free timeline, in seconds rather than steps: Eno's loops, and the
   ambience, which has no business being on the beat */
function horizonWork(now, horizon) {
  var i;
  if (bedPlaying() && E.tier !== "minimal") {
    var W = D.W, f = (D.layer >= 2 ? 1 / 1.5 : 1) * (S.calm ? 2 : 1);
    for (i = 0; i < D.loops.length; i++) {
      var L = D.loops[i], guard = 0;
      while (L.next < horizon && guard++ < 8) {
        if (L.next >= now - 0.02) {
          lead(L.next, L.midi, LV.loop, W, { lane: "musicWet", cat: "bell", prio: 0, tag: "loop",
               pan: (i / Math.max(1, D.loops.length - 1) - 0.5) * 0.9, decay: Math.max(3.2, W.lead.decay || 3),
               bright: 0.6, vel: 0.85 + 0.15 * D.r() });
        }
        L.next += L.secs * f;
      }
    }
  }
  if (D.ambAt && D.bed && haveNoise()) { swapAmbience(Math.max(now + 0.02, D.ambAt)); D.ambAt = 0; }
  for (i = 0; i < D.amb.length; i++) D.amb[i].tick(now, horizon);
  /* reverb swap waits for its fade-out, and then for a quiet moment:
     handing a convolver its room is a synchronous FFT of the whole
     impulse on the main thread (10-60 ms for a long room), so it is done
     in an idle callback, or a task after this frame, never inside the
     frame or the game's tick. The return is already faded to nothing, so
     the wait is silent; the music is just dry a moment longer. */
  if (D.verbSwapAt && now >= D.verbSwapAt) {
    D.verbSwapAt = 0;
    if (CLOCKFN) installVerb(now);
    else if (!D.verbIdle) {
      D.verbIdle = true;
      var e = E, fn = function () { D.verbIdle = false; if (E === e && E) installVerb(nowT()); };
      if (root.requestIdleCallback) root.requestIdleCallback(fn, { timeout: 500 });
      else setTimeoutSafe(fn, 0);
    }
  }
  settleBeds(now);
}

function startLoops(t) {
  var W = D.W;
  D.loops = [];
  for (var i = 0; i < W.loops.length; i++) {
    /* a random phase, but never all at once at the top */
    D.loops.push({ midi: W.loops[i][0], secs: W.loops[i][1], next: t + 2 + D.r() * W.loops[i][1] });
  }
}

/* ================================================================
   12. changing worlds
   ================================================================ */
function applyWorld(when, silent) {
  var nw = D.pending.W, immediate = D.pending.now, old = D.W, M = E.M;
  D.pending = null;
  D.W = nw;
  D.melody = 0;
  D.worldBar = K.bar;
  D.polyStep = 0;
  D.forceOrigin = true;
  var playing = bedPlaying() && !silent;
  if (playing && old && old !== nw && !immediate) {
    /* bloom on the notes the two worlds share. Neighbours share six or seven
       and the bloom lasts a bar; the long way round, from the Starfield back
       up to Dawn, shares four and takes two. */
    var common = commonTones(old, nw), bars = common.length < 6 ? 2 : 1;
    releasePads(when, 2.5);
    bloomCommon(when, common, nw, bars);
    D.chordStart = K.bar + bars;
  } else {
    if (playing) releasePads(when, immediate ? 1.2 : 2.5);
    D.chordStart = K.bar;
  }
  stopDrones(when, 2.5);
  if (playing) startDrones(when);
  if (D.bed) startLoops(when);
  if (D.amb.length || D.bed) swapAmbience(when);
  glide(M.Ltone, nw.lp || 18000, when, 2.5, true);
  retrimBed(when, 2.5);
  requestVerb(nw);
  queuePlucks(nw);
  forgetPlucks([nw, old]);
  updateMedia();
}

function bloomCommon(when, common, W, bars) {
  /* up to four shared tones, preferring the new world's pool, voiced from
     the middle of the piano upwards */
  var pick = [], i, m;
  for (i = 0; i < common.length && pick.length < 4; i++) if (W.poolPc.indexOf(common[i]) >= 0) pick.push(common[i]);
  for (i = 0; i < common.length && pick.length < 4; i++) if (pick.indexOf(common[i]) < 0) pick.push(common[i]);
  var dur = bars * 16 * sixteenthFor(W), lo = 60;
  for (i = 0; i < pick.length; i++) {
    m = lo + ((pick[i] - lo % 12 + 24) % 12);
    if (i && m <= lo) m += 12;
    lo = m + 2;
    pad(when, m, dur, LV.bloomWorld, W.pad, { cat: "bloom", voices: 1, attack: 0.7, release: 3.5,
        cutoff: 2200, side: i % 2 ? 1 : -1, prio: 1, tag: "bloom" });
  }
}

/* The reverb follows the world. On the full tier the new impulse response
   is baked a slice at a time; on the lighter tiers the delay network is
   retuned. Either way the return is faded out before the core is swapped
   and faded back in after — disconnecting a node that is carrying a tail
   would click. */
function requestVerb(W) {
  if (!E) return;
  D.verbW = W;
  if (E.tier === "full") {
    if (D.irJob && D.irJob.W === W) return;
    if (D.irBuf && D.irW === W) { if (E.M.coreKind !== "conv") swapVerb(); return; }
    D.irJob = irJob(E.ctx.sampleRate, W.verb.t60, W.verb.pre, W.verb.damp, 7 + W.n);
    D.irJob.W = W;
  } else swapVerb();
}
function irReady() {
  var J = D.irJob;
  D.irJob = null;
  if (!J || J.W !== D.verbW) return;
  var c = E.ctx, b = c.createBuffer(2, J.n, c.sampleRate);
  b.getChannelData(0).set(J.L); b.getChannelData(1).set(J.R);
  D.irBuf = b; D.irW = J.W;
  swapVerb();
}
function swapVerb() {
  var now = nowT();
  if (!E.M.core) { installVerb(now); return; }
  /* one already on its way installs whatever room is newest when it lands */
  if (D.verbSwapAt || D.verbIdle) return;
  glide(E.M.LverbOut, 0, now, 0.8);
  D.verbSwapAt = now + 0.85;
}
function installVerb(now) {
  D.verbSwapAt = 0;
  var W = D.verbW || D.W;
  if (E.tier === "full") {
    if (!D.irBuf) return;
    setCore(E, "conv", D.irBuf, D.irW);
    W = D.irW;
  } else setCore(E, "delay", null, W);
  glide(E.M.LverbOut, dbToGain(W.verb.send + (E.M.coreKind === "delay" ? delayTrim(W.verb.t60) : 0)), now + 0.02, 1.5);
}
/* The delay network rings hotter than the normalised convolver for the
   same send — by 7.5 dB for a short room, 3.7 for the longest, because the
   convolver's tail grows with its length and the network's cannot (its
   loop gain is capped for safety). Measured with steady noise into both in
   every world, the gap is a straight line in T60 to within half a decibel,
   so the lighter tiers turn their return down by it — otherwise an older
   phone would hear every world drenched. */
function delayTrim(t60) { return clamp(-9.1 + 0.95 * t60, -8, -3.5); }
function queuePlucks(W) {
  for (var i = 0; i < W.semis.length; i++) {
    D.bakeQ.push([W, W.keys + W.semis[i], 0]);
    D.bakeQ.push([W, W.keys + W.semis[i], 1]);
  }
}
/* a few milliseconds of baking per frame, never more (a single string may
   still run over: it is baked whole) */
function bakeWork(budget) {
  var t0 = perfNow();
  if (!CLOCKFN && budget < 1e9) {
    /* no frame lately (a hidden tab, rAF throttled): the interval bakes */
    if (t0 - bakeAt > 20) bakeFrame();
    budget = Math.min(budget, bakeBudgetMs - bakeUsed);
    if (budget <= 0) return;
  }
  try { bakeSlice(budget, t0); } finally { bakeUsed += perfNow() - t0; }
}
function bakeSlice(budget, t0) {
  while (D.noiseJob && !D.noiseJob.done) {
    noiseWork(D.noiseJob, 12000);
    if (perfNow() - t0 > budget) return;
  }
  if (D.noiseJob && D.noiseJob.done && E && D.noiseJob.sr === E.ctx.sampleRate) noiseReady(E.ctx);
  while (D.irJob && !D.irJob.done) {
    irWork(D.irJob, 6000);
    if (perfNow() - t0 > budget) return;
  }
  if (D.irJob && D.irJob.done) irReady();
  while (D.probeJob && !D.probeJob.done) {
    irWork(D.probeJob, 6000);
    if (perfNow() - t0 > budget) return;
  }
  if (D.probeJob && D.probeJob.done && E) {
    var P = D.probeJob;
    D.probeJob = null;
    PROBE_IR = E.ctx.createBuffer(2, P.n, P.sr);
    PROBE_IR.getChannelData(0).set(P.L); PROBE_IR.getChannelData(1).set(P.R);
    /* in a task of its own, after this frame, not inside it */
    setTimeoutSafe(probe, 0);
  }
  while (D.bakeQ.length && perfNow() - t0 < budget) {
    var j = D.bakeQ.shift();
    bakeOne(j[0], j[1], j[2]);
  }
}
/* drop the strings of worlds we have left (voices still ringing keep their
   own reference, so nothing is cut short) */
function forgetPlucks(keep) {
  for (var k in plucks) {
    if (!plucks.hasOwnProperty(k)) continue;
    var hit = false;
    for (var i = 0; i < keep.length; i++) if (k.indexOf("|" + keep[i].id + "|") >= 0) hit = true;
    if (!hit) delete plucks[k];
  }
}

/* ================================================================
   13. ambience
   ================================================================
   Beds are long-lived: one looping noise source, a filter, a gain. Their
   movement is appended as back-to-back ramps one step ahead, so nothing is
   ever cancelled and every ramp starts exactly where the last one ended.
   One-shots (birds, drops, twinkles) arrive as Poisson processes. */
function swapAmbience(t) {
  var i;
  for (i = 0; i < D.amb.length; i++) D.amb[i].stop(t);
  D.ambOld = (D.ambOld || []).concat(D.amb);
  D.amb = [];
  if (!D.bed) return;
  var W = D.W;
  for (i = 0; i < W.amb.length; i++) {
    var a = makeAmb(W.amb[i], W, t);
    if (a) D.amb.push(a);
  }
}
function stopAmbience(t) {
  for (var i = 0; i < D.amb.length; i++) D.amb[i].stop(t);
  D.ambOld = (D.ambOld || []).concat(D.amb);
  D.amb = [];
}
function expo(r, rate) { return -Math.log(1 - r * 0.999) / rate; }

function bedNodes(src, filt, gain, extra) {
  var b = { src: src, f: filt, g: gain, nodes: 3 + (extra || 0) };
  E.beds += b.nodes;
  return b;
}
function bedEnd(b, at) {
  try { b.src.stop(at); } catch (x) {}
  var e = E;
  /* the nodes are counted out once the fade is really over */
  b.release = at;
  b.engine = e;
}
function settleBeds(now) {
  if (!D.ambOld || !D.ambOld.length) return;
  var w = 0;
  for (var i = 0; i < D.ambOld.length; i++) {
    var a = D.ambOld[i];
    if (a.bed && a.bed.release && now > a.bed.release) { if (a.bed.engine === E) E.beds -= a.bed.nodes; a.bed = null; }
    if (a.bed && a.bed.release) D.ambOld[w++] = a;
  }
  D.ambOld.length = w;
}

function makeBed(type, f, q, wet) {
  var c = E.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuffer(c); s.loop = true;
  fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  g.gain.value = 0;
  s.connect(fl); fl.connect(g); g.connect(wet ? E.M.ambWet : E.M.ambDry);
  return bedNodes(s, fl, g);
}

function makeAmb(spec, W, t) {
  var r = D.r, k = spec.k, A = { k: k, bed: null, stopped: false };
  var minimal = E.tier === "minimal", lite = E.tier === "lite";
  if (k === "wind" || k === "swell") {
    var b = makeBed(spec.type, spec.f, spec.q, true);
    b.src.start(t, r() * 3.5);
    A.bed = b;
    var Lg = Line(b.g.gain, 0), Lf = Line(b.f.frequency, spec.f);
    b.g.gain.setValueAtTime(0, t); Lg.t = [t]; Lg.v = [0]; Lg.x = [0];
    b.f.frequency.setValueAtTime(spec.f, t); Lf.t = [t]; Lf.v = [spec.f]; Lf.x = [0];
    var base = k === "swell" ? spec.dbLo : spec.db, norm = bedGain(0, b.f);
    lineTo(Lg, norm * dbToGain(base), t + 4);
    A.nextWalk = t + 4;
    A.tick = function (now, horizon) {
      if (A.stopped) return;
      var guard = 0;
      while (A.nextWalk < horizon && guard++ < 4) {
        var t0 = A.nextWalk, d, gdb, fv;
        if (k === "swell") {
          /* a slow swell, about 0.06 Hz: Moon Pool's deep water */
          d = spec.period / 2;
          A.up = !A.up;
          gdb = A.up ? spec.dbHi : spec.dbLo;
          fv = spec.f * (A.up ? 1.3 : 1);
        } else {
          d = spec.every[0] + r() * (spec.every[1] - spec.every[0]);
          gdb = spec.db + (r() * 2 - 1) * spec.swing;
          fv = spec.walk[0] + r() * (spec.walk[1] - spec.walk[0]);
          if (spec.gusts && gdb > spec.db + spec.swing * 0.45) gust(t0 + d * 0.55, W);
        }
        lineHold(Lg, t0); lineTo(Lg, norm * dbToGain(gdb), t0 + d);
        lineHold(Lf, t0); lineTo(Lf, fv, t0 + d, true);
        A.nextWalk = t0 + d;
      }
    };
    A.stop = function (at) {
      if (A.stopped) return;
      A.stopped = true;
      var from = Math.max(at, A.nextWalk);
      lineHold(Lg, from); lineTo(Lg, 0, from + 4);
      bedEnd(b, from + 4.1);
    };
    return A;
  }
  if (k === "ocean") {
    /* the sea breathes with the music: one swell every two bars, the filter
       opening and the level rising together, foam a moment after the crest */
    var ob = makeBed("lowpass", spec.lo, 0.7, true);
    var foamF = E.ctx.createBiquadFilter(), foamG = E.ctx.createGain();
    foamF.type = "highpass"; foamF.frequency.value = 3000; foamG.gain.value = 0;
    ob.src.connect(foamF); foamF.connect(foamG); foamG.connect(E.M.ambWet);
    ob.nodes += 2; E.beds += 2;
    ob.src.start(t, r() * 3.5);
    A.bed = ob;
    A.Lg = Line(ob.g.gain, 0); A.Lf = Line(ob.f.frequency, spec.lo); A.Lfoam = Line(foamG.gain, 0);
    ob.g.gain.setValueAtTime(0, t); A.Lg.t = [t]; A.Lg.v = [0]; A.Lg.x = [0];
    ob.f.frequency.setValueAtTime(spec.lo, t); A.Lf.t = [t]; A.Lf.v = [spec.lo]; A.Lf.x = [0];
    foamG.gain.setValueAtTime(0, t); A.Lfoam.t = [t]; A.Lfoam.v = [0]; A.Lfoam.x = [0];
    var mid = E.ctx.createBiquadFilter();
    mid.type = "lowpass"; mid.frequency.value = Math.sqrt(spec.lo * spec.hi); mid.Q.value = 0.7;
    A.norm = bedGain(0, mid);
    A.foamNorm = bedGain(0, foamF);
    lineTo(A.Lg, A.norm * dbToGain(spec.dbLo), t + 3);
    A.spec = spec;
    A.cycleEnd = t + 3;
    A.tick = function () {};
    A.stop = function (at) {
      if (A.stopped) return;
      A.stopped = true;
      var from = Math.max(at, A.cycleEnd);
      lineHold(A.Lg, from); lineTo(A.Lg, 0, from + 4);
      lineHold(A.Lfoam, from); lineTo(A.Lfoam, 0, from + 1);
      bedEnd(ob, from + 4.1);
    };
    D.ocean = A;
    return A;
  }
  if (k === "rain") {
    /* the rain bed: a hiss of distant drops above, the roof's low murmur
       under it, both from one noise source */
    var rb = makeBed("bandpass", 2500, 0.6, false);
    var roofF = E.ctx.createBiquadFilter(), roofG = E.ctx.createGain();
    roofF.type = "lowpass"; roofF.frequency.value = 500; roofG.gain.value = 0;
    rb.src.connect(roofF); roofF.connect(roofG); roofG.connect(E.M.ambWet);
    rb.nodes += 2; E.beds += 2;
    rb.src.start(t, r() * 3.5);
    A.bed = rb;
    var Lr = Line(rb.g.gain, 0), Lroof = Line(roofG.gain, 0);
    rb.g.gain.setValueAtTime(0, t); Lr.t = [t]; Lr.v = [0]; Lr.x = [0];
    roofG.gain.setValueAtTime(0, t); Lroof.t = [t]; Lroof.v = [0]; Lroof.x = [0];
    var rn = bedGain(0, rb.f), roofN = bedGain(0, roofF);
    lineTo(Lr, rn * dbToGain(spec.db), t + 4);
    lineTo(Lroof, roofN * dbToGain(spec.roof), t + 4);
    A.nextWalk = t + 4;
    A.tick = function (now, horizon) {
      if (A.stopped) return;
      while (A.nextWalk < horizon) {
        var d = 3 + r() * 3, t0 = A.nextWalk;
        lineHold(Lr, t0); lineTo(Lr, rn * dbToGain(spec.db + (r() * 2 - 1) * 1.5), t0 + d);
        A.nextWalk = t0 + d;
      }
    };
    A.stop = function (at) {
      if (A.stopped) return;
      A.stopped = true;
      var from = Math.max(at, A.nextWalk);
      lineHold(Lr, from); lineTo(Lr, 0, from + 4);
      lineHold(Lroof, from); lineTo(Lroof, 0, from + 4);
      bedEnd(rb, from + 4.1);
    };
    return A;
  }
  /* the one-shot kinds: none at all on the minimal tier */
  if (minimal) return null;
  A.next = t + 1 + r() * 2;
  A.stop = function () { A.stopped = true; };
  if (k === "drops") {
    var rate = (spec.rate[0] + r() * (spec.rate[1] - spec.rate[0])) * (lite ? 0.5 : 1);
    A.tick = function (now, horizon) {
      if (A.stopped) return;
      var guard = 0;
      while (A.next < horizon && guard++ < 16) {
        if (A.next >= now - 0.01 && audible("amb")) raindrop(A.next, W, spec);
        A.next += expo(r(), rate);
      }
    };
    return A;
  }
  if (k === "twinkle") {
    A.tick = function (now, horizon) {
      if (A.stopped) return;
      while (A.next < horizon) {
        if (A.next >= now - 0.01 && audible("amb")) {
          var m = poolIn(W, 3000, 6000, r);
          ping(A.next, mtof(m), mtof(m), 0, spec.db, { attack: 0.004, tail: 0.4 / 4, pan: r() * 1.6 - 0.8,
               lane: "ambWet", tag: "twinkle", midi: m, prio: 0 });
        }
        A.next += expo(r(), spec.rate * (lite ? 0.6 : 1));
      }
    };
    return A;
  }
  if (k === "birds") {
    A.next = t + spec.every[0] * 0.5 + r() * spec.every[0];
    A.tick = function (now, horizon) {
      if (A.stopped) return;
      while (A.next < horizon) {
        if (A.next >= now - 0.01 && audible("amb")) birdPhrase(A.next, W, spec);
        A.next += spec.every[0] + r() * (spec.every[1] - spec.every[0]);
      }
    };
    return A;
  }
  if (k === "crickets") {
    A.next = t + spec.every[0] * 0.5 + r() * spec.every[0];
    A.tick = function (now, horizon) {
      if (A.stopped) return;
      while (A.next < horizon) {
        if (A.next >= now - 0.01 && audible("amb")) {
          var m = poolIn(W, 4000, 5000, r);
          ping(A.next, mtof(m), mtof(m), 0, spec.db, { pulses: 3 + Math.floor(r() * 2), pulse: 0.016, gap: 0.026,
               pan: r() * 1.2 - 0.6, lane: "ambWet", tag: "cricket", midi: m, prio: 0 });
        }
        A.next += spec.every[0] + r() * (spec.every[1] - spec.every[0]);
      }
    };
    return A;
  }
  if (k === "bubbles") {
    A.tick = function (now, horizon) {
      if (A.stopped) return;
      while (A.next < horizon) {
        if (A.next >= now - 0.01 && audible("amb")) {
          var n = 2 + Math.floor(r() * 4), tt = A.next;
          for (var i = 0; i < n; i++) {
            var m = poolIn(W, 600, 2000, r), m2 = m + 3;
            ping(tt, mtof(m), mtof(m2), 0.03 + r() * 0.03, spec.db + (r() * 4 - 4), {
                 attack: 0.003, tail: 0.012, pan: r() * 1.2 - 0.6, lane: "ambWet", tag: "bubble", midi: m, prio: 0 });
            tt += 0.04 + r() * 0.08;
          }
        }
        A.next += expo(r(), spec.rate);
      }
    };
    return A;
  }
  if (k === "whoosh") {
    A.next = t + spec.every[0] * 0.5 + r() * spec.every[0];
    A.tick = function (now, horizon) {
      if (A.stopped) return;
      while (A.next < horizon) {
        if (A.next >= now - 0.01 && audible("amb")) {
          hiss(A.next, spec.db, { type: "bandpass", f0: 2000, f1: 800, sweep: 1.5, q: 1.2, attack: 0.5, hold: 0.4,
               release: 0.3, lane: "ambWet", cat: "amb", prio: 0, tag: "whoosh", pan: r() * 0.8 - 0.4, offset: r() * 3 });
        }
        A.next += spec.every[0] + r() * (spec.every[1] - spec.every[0]);
      }
    };
    return A;
  }
  return null;
}

function oceanCycle(when, period) {
  var A = D.ocean;
  if (!A || A.stopped || !A.bed) return;
  var s = A.spec, t0 = Math.max(when, A.cycleEnd);
  lineHold(A.Lf, t0); lineTo(A.Lf, s.hi, t0 + period * 0.42, true); lineTo(A.Lf, s.lo, t0 + period, true);
  lineHold(A.Lg, t0); lineTo(A.Lg, A.norm * dbToGain(s.dbHi), t0 + period * 0.38);
  lineTo(A.Lg, A.norm * dbToGain(s.dbLo), t0 + period);
  lineHold(A.Lfoam, t0 + period * 0.38);
  lineTo(A.Lfoam, A.foamNorm * dbToGain(s.foam), t0 + period * 0.38 + 0.5);
  lineTo(A.Lfoam, 0, t0 + period * 0.38 + 2.2);
  A.cycleEnd = t0 + period;
  /* the pads rise a little with each wave */
  var L = E.M.Lwave;
  lineHold(L, t0); lineTo(L, dbToGain(1.2), t0 + period * 0.4); lineTo(L, 1, t0 + period);
}

/* a drop of rain is an air bubble ringing at its Minnaert frequency and
   rising as it shrinks; one in six is tuned to a pool note, so the rain
   plays in key */
function raindrop(t, W, spec) {
  var r = D.r, inKey = r() * spec.inKey < 1, f, m;
  if (inKey) { m = poolIn(W, 1500, 3200, r); f = mtof(m); }
  else { var radius = 0.7 + r() * 1.5; f = 3280 / radius; m = 0; }
  var d = 0.02 + r() * 0.04;
  ping(t, f, f * (1.15 + r() * 0.2), d, spec.db[0] + r() * (spec.db[1] - spec.db[0]),
       { attack: 0.003, tail: d / 4, pan: r() * 1.6 - 0.8, lane: "ambWet", tag: inKey ? "dropKey" : "drop", midi: m, prio: 0 });
}
function birdPhrase(t, W, spec) {
  var r = D.r, n = 2 + Math.floor(r() * 4), tt = t, pan = r() * 1.4 - 0.7;
  for (var i = 0; i < n; i++) {
    var m = poolIn(W, 2200, 3600, r), f = mtof(m), len = 0.06 + r() * 0.06;
    ping(tt, f, f * (1.4 + r() * 0.5), len, spec.db + (r() * 3 - 3), { attack: 0.005, tail: len / 3, pan: pan,
         lane: "ambWet", tag: "bird", midi: m, prio: 0 });
    tt += 0.09 + r() * 0.13;
  }
}
/* Bamboo's wood chimes, struck by the gusts */
function gust(t, W) {
  if (!audible("amb")) return;
  var r = D.r, n = 1 + Math.floor(r() * 3), tt = t;
  for (var i = 0; i < n; i++) {
    var m = poolNote(W, Math.floor(r() * 6), W.bell);
    additive(tt, m, -36 + r() * 3, CHIME, { cat: "amb", lane: "ambWet", prio: 0, tag: "chime", pan: r() * 1.2 - 0.6 });
    tt += 0.09 + r() * 0.17;
  }
}

/* ================================================================
   14. the bed: start and stop
   ================================================================ */
function bedOn(t) {
  D.bed = true;
  D.pads.length = 0;
  D.chordStart = K.s === 0 ? K.bar : K.bar + 1;
  D.barAtBeat = K.s !== 0;
  D.worldBar = D.chordStart;
  startLoops(t);
  startDrones(t + 0.5);
  /* the ambience fades in over seconds anyway; if its noise is still being
     made it waits the fraction of a second that takes */
  if (haveNoise() || CLOCKFN) swapAmbience(t); else D.ambAt = t;
}
function bedOff(t) {
  D.bed = false;
  D.ambAt = 0;
  releasePads(t, 3);
  stopDrones(t, 3);
  D.loops = [];
  stopAmbience(t);
}

/* ================================================================
   15. ducking, swells, the Breath
   ================================================================ */
/* No sidechain exists in Web Audio, so ducking is a dip on the music bus,
   modelled in JavaScript and anchored where it starts. */
function duck(t, db, hold) {
  var L = E.M.Lduck, v = lineCut(L, t), low = Math.min(v, dbToGain(db));
  lineTo(L, low, t + 0.06);
  lineHold(L, t + hold);
  lineTo(L, 1, t + hold + 1.2, true);
}
function verbLift(t, db, hold) {
  var L = E.M.Lboost;
  lineCut(L, t);
  lineTo(L, dbToGain(db), t + 0.3);
  lineHold(L, t + hold);
  lineTo(L, 1, t + hold + 1.5);
}
/* the pads swell and brighten on an in-breath: +3 dB, a gentle high shelf */
function breathe(t, inhale, secs) {
  var M = E.M;
  glide(M.Llift, inhale ? dbToGain(3) : 1, t, secs);
  glide(M.Ltilt, inhale ? 4 : 0, t, secs);
}

/* ================================================================
   16. what every event sounds like
   ================================================================ */
var GAP = { move: 0.04, rotate: 0.05, bump: 0.15, soft: 0.12 };
function limited(kind, now) {
  var last = D.last[kind];
  if (last !== undefined && now - last < GAP[kind] && now >= last) return true;
  D.last[kind] = now;
  return false;
}
function jit() { return D.flat ? 1 : 0.85 + 0.3 * D.r(); }
function colPan(x) { return clamp((x - 4.5) / 4.5 * 0.6, -0.6, 0.6); }
function meanX(cells) {
  if (!cells || !cells.length) return D.lastX;
  var s = 0, n = 0;
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i];
    if (c && c.length >= 2) { s += c[0]; n++; } else if (c && c.x !== undefined) { s += c.x; n++; }
  }
  return n ? s / n : D.lastX;
}
function minY(cells) {
  var y = 99;
  if (!cells) return 0;
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i], cy = c && c.length >= 2 ? c[1] : c && c.y !== undefined ? c.y : 99;
    if (cy < y) y = cy;
  }
  return y === 99 ? 0 : y;
}

/* the melody: the next n notes of the world's tune, the whole figure lifted
   by the Ripple count — so a chain of clears climbs the pool like a ladder */
function melodyNotes(n, lift) {
  var W = D.W, out = [];
  for (var k = 0; k < n; k++) {
    var idx = W.melody[(D.melody + k) % W.melody.length] + lift, m = poolNote(W, idx, W.bell);
    while (m > 98) m -= 12;
    out.push(m);
  }
  D.melody += n;
  return out;
}

function eventSound(ev, now) {
  var W = D.W, t = now + 0.004, x, m, v;
  switch (ev.t) {
    case "spawn":
      D.lastX = 4; D.softRows = 0; D.rep = 0;
      return 0;
    case "move":
      x = clamp(Math.round(ev.x === undefined ? D.lastX : ev.x), 0, 9);
      var dir = ev.dx < 0 ? -1 : 1, gap = now - (D.last.moveAny || -1);
      D.last.moveAny = now;
      /* auto-repeat fades: each repeat in the same direction is 0.7× the last */
      if (ev.repeat === true || (ev.repeat === undefined && dir === D.repDir && gap < 0.075)) D.rep++;
      else D.rep = 0;
      D.repDir = dir;
      D.lastX = x;
      if (limited("move", now)) return 0;
      v = Math.max(0.2, Math.pow(0.7, D.rep)) * jit();
      pluck(t, poolNote(W, x, W.keys), LV.move, W, { pan: colPan(x), hold: 0.18, release: 0.12, vel: v,
            variant: D.r() < 0.5 ? 0 : 1, prio: 1, tag: "move" });
      return 0;
    case "rotate":
      if (limited("rotate", now)) return 0;
      /* two octaves over the keyboard: a glass tick has to sit above the
         chords, where the pads have let go, or the bed swallows it */
      var tones = chordPool(W, D.chord), to = ((ev.to | 0) % 4 + 4) % 4;
      m = W.keys + 24 + ((tones[to % tones.length] - W.tonicPc + 12) % 12);
      while (m > 96) m -= 12;
      fm(t, m, LV.rotate, { ratio: 2, index: ev.kick ? 0.95 : 0.6, end: 0.1, decay: 0.35, attack: 0.004,
         cat: "tick", prio: 1, tag: "rotate", pan: colPan(D.lastX), vel: jit(), lane: "sfxDry" });
      return 0;
    case "bump":
      if (limited("bump", now)) return 0;
      /* muted, low and short — but with enough of its knock left above
         600 Hz that the chords do not swallow it */
      pluck(t, W.keys - 12, LV.bump, W, { tone: 1000, hold: 0.08, release: 0.06, vel: jit(), prio: 1,
            tag: "bump", pan: colPan(D.lastX) });
      return 0;
    case "soft":
      D.softRows += ev.rows || 1;
      if (D.softRows < 4) return 0;
      if (limited("soft", now)) return 0;
      D.softRows -= 4;
      hiss(t, LV.brush, { type: "highpass", f0: 4000, q: 0.5, attack: 0.008, release: 0.012, hold: 0.012,
           prio: 1, tag: "brush", pan: colPan(D.lastX), offset: D.r() * 3 });
      return 0;
    case "hard":
      x = meanX(ev.cells);
      D.softRows = 0;
      /* a thump, pitched: a sine gliding down onto the pool note nearest
         50 Hz, with its octave for small speakers — never a crack */
      var lowM = poolNear(W, 52), lf = mtof(lowM);
      ping(t, lf * 1.4, lf, 0.06, LV.thump, { attack: 0.004, tail: 0.05, second: 0.35, cat: "tick", prio: 1,
           tag: "thump", midi: lowM, lane: "sfxDry", noTrim: 1 });
      var rows = clamp(ev.rows || 1, 1, 20);
      hiss(t, LV.streak - (rows < 4 ? 4 : 0), { type: "bandpass", f0: 2000, f1: 600, sweep: 0.12, q: 0.9, attack: 0.006,
           release: 0.03, hold: 0.02, prio: 1, tag: "streak", pan: colPan(x), offset: D.r() * 3 });
      return 0;
    case "lock":
      x = meanX(ev.cells);
      var y = minY(ev.cells), pi = pieceIndex(ev.type);
      D.softRows = 0;
      m = poolNote(W, PIECE_STEP[pi], W.keys - 12 + (y >= 8 ? 12 : 0));
      pluck(t, m, LV.lock, W, { pan: colPan(x), hold: 0.5, release: 0.35, vel: jit(), lane: "sfxWet",
            variant: D.r() < 0.5 ? 0 : 1, prio: 1, tag: "lock" });
      return 0;
    case "hold":
      /* Keep: a breath drawn in on the piece's own note, then the note */
      var hp = pieceIndex(ev.type);
      m = poolNote(W, PIECE_STEP[hp], W.keys);
      hiss(t, LV.keepSwell, { type: "bandpass", f0: mtof(m), q: 4, attack: 0.12, expIn: 1, release: 0.02,
           prio: 1, tag: "keep", midi: m, offset: D.r() * 3, lane: "sfxWet" });
      pluck(t + 0.12, m, LV.keep, W, { hold: 0.3, release: 0.25, vel: jit(), prio: 1, tag: "keep",
            lane: "sfxWet", pan: -0.25 });
      return 0;
    case "rewind":
      m = W.keys + 12;
      hiss(t, LV.keepSwell - 3, { type: "bandpass", f0: mtof(m), q: 4, attack: 0.16, expIn: 1, release: 0.03,
           prio: 1, tag: "rewind", midi: m, offset: D.r() * 3, lane: "sfxWet" });
      return 0;
    case "clear":
      return reward(ev, now);
    case "twist":
      return twistAlone(ev.kind === "mini" ? "mini" : "full", now);
    case "drain":
      return drainSound(now);
    case "silt":
      /* silt rising: a soft low swell, "the tide rises", never an alarm */
      var qs = quantize(now), Fs = figure();
      fSwell(Fs, 0, W.keys - 24, 0, 0.6, 0.4, 1.2, { cutoff: 500, tag: "silt", prio: 1 });
      playFigure(qs, Fs, RUNG.silt);
      return qs - now;
    case "breath":
      if (ev.on) {
        var ms = ev.ms || 10000;
        /* one breath: four seconds in, six out */
        breathe(now, true, ms * 0.0004);
        D.breathOutAt = now + ms * 0.0004;
        D.breathOutLen = ms * 0.0006;
        lineHold(E.M.Llift, D.breathOutAt); lineTo(E.M.Llift, 1, D.breathOutAt + D.breathOutLen);
        lineHold(E.M.Ltilt, D.breathOutAt); lineTo(E.M.Ltilt, 0, D.breathOutAt + D.breathOutLen);
      } else if (lineAt(E.M.Llift, now) > 1.001) breathe(now, false, 1.5);
      return 0;
    case "over":
    case "end":
      return runEnd(now);
    case "pb":
      /* passed mid-run: one soft chime. At the end of a run (the app says
         so after the run's last line), the warm phrase instead */
      return ev.final || ev.end || D.ended ? pbPhrase(now) : chime(now, RUNG.pbChime);
    case "chapter":
      return chime(now, RUNG.pbChime);
    case "surface":
      return surface(now);
  }
  return 0;
}

/* immediate: a soft shimmer the moment a reward happens, before its beat */
function shimmer(t) {
  var W = D.W, m = poolNote(W, 2 + Math.floor(D.r() * 3), W.bell + 12);
  fm(t, m, LV.shimmer, { ratio: 3.01, index: 0.5, end: 0.1, decay: 0.8, attack: 0.012, cat: "tick",
     prio: 2, tag: "shimmer", pan: 0.15, lane: "sfxWet" });
}

/* ---------- figures ----------
   A reward is planned before it is played: a list of bells and swells with
   their offsets, their levels relative to each other and how long each
   rings. How loud a figure peaks depends on how much its notes overlap, and
   that depends on the world — Bamboo's chimes are gone in a second, Aurora's
   glass rings for four — so the same figure written at the same levels would
   be 5 dB apart from one world to another, and in some worlds a Twist would
   outshout the Empty Well. So the envelope sum is worked out at every note's
   peak, and the whole figure is played at the one trim that puts its peak on
   its rung of the ladder (RUNG). Its shape stays the composer's; its height
   is the ladder's.

   Measured over all ten worlds, every chord of each and two places in each
   tune (eighty renders a rung), the rungs land within about ±1.2 dB — the
   honest limit of predicting where a sum of decaying tones crests. So the
   Empty Well's rung is set to put its loudest case at −14.2 dBFS, never
   over −14; and the Quad, whose bloom crests the most variably, sits a
   little under the brief's −16, so that in every world its loudest case
   stays below the Empty Well's. */
var RUNG = {
  single: -22, double: -21, triple: -19.5, quad: -18,
  twist: -20, miniTwist: -23.5, miniSingle: -20.5, miniDouble: -19.5,
  twistSingle: -18, twistDouble: -17.6, twistTriple: -17.6,
  empty: -15.45, calm: -23,
  /* the drain's chord and the run's last line are slow swells and long
     tails, which the model reads less well than struck bells; these are the
     rungs that measure as −25 and −24 */
  drain: -28.4, end: -23, pbChime: -27, pbPhrase: -24, surface: -17, silt: -30
};
/* what the output meter reads over a note's nominal level, measured: a
   bell comes out about 2 dB over it (the immediate shimmer and the reverb
   ride on top), a swell about 1 dB under (its low fundamental meets the
   30 Hz high-pass) */
var FIG_BELL = dbToGain(2), FIG_PAD = dbToGain(-1), FIG_CAL = 0, FIG_COH = 0.8;
var FIG = [];
function figure() { FIG.length = 0; return FIG; }
/* how long a lead note effectively rings, for the model: a chime's upper
   partials are gone in a fraction of a second, so it overlaps its
   neighbours as if it rang for about 0.75 s, not its fundamental's 1.2 */
function leadDecay(W, d) {
  if (W.lead.kind === "chime") return 0.75;
  return d || W.lead.decay;
}
/* a bell of the world's lead voice */
function fNote(F, dt, midi, rel, o) {
  o = o || {};
  while (midi > 98) midi -= 12;
  F.push({ kind: "bell", dt: dt, midi: midi, rel: rel, decay: o.spec ? o.spec.decays[0] : o.sine ? o.decay : leadDecay(D.W, o.decay), o: o });
}
/* a swell: a soft pad note that blooms and lets go */
function fSwell(F, dt, midi, rel, attack, hold, release, o) {
  F.push({ kind: "pad", dt: dt, midi: midi, rel: rel, attack: attack, hold: hold, release: release, o: o || {} });
}
function itemLevel(it, d) {
  if (d < 0) return 0;
  var a = dbToGain(it.rel) * (it.kind === "pad" ? (it.o.coh ? padPeak(it) : FIG_PAD) : FIG_BELL * hfTrim(mtof(it.midi)));
  if (it.kind === "pad") {
    if (d < it.attack) return a * d / it.attack;
    if (d < it.attack + it.hold) return a;
    return a * Math.exp(-(d - it.attack - it.hold) * 4 / it.release);
  }
  return a * Math.exp(-d * 6.9 / it.decay);
}
/* How high a held pad note really peaks: its soft wave, normalised to
   peak at 1, loses its upper harmonics in the pad's low-pass, and what is
   left peaks wherever its partials happen to line up. Worked out from the
   wave's own partials and the filter's response at each of them, once per
   pitch and cut-off (a few thousand multiplications), and averaged over the
   notes of a swell. */
var PADPK = {};
function wavePeak(midi, cutoff) {
  var sr = E ? E.ctx.sampleRate : 48000, key = midi + "|" + Math.round(cutoff) + "|" + sr;
  if (PADPK[key]) return PADPK[key];
  var f = mtof(midi), N = 24, P = 256, x = new Float32Array(P), y = new Float32Array(P), n, j;
  var w0 = 2 * Math.PI * Math.min(cutoff, sr * 0.45) / sr, q = Math.pow(10, 0.5 / 20), al = Math.sin(w0) / (2 * q), cw = Math.cos(w0);
  var b0 = (1 - cw) / 2, b1 = 1 - cw, a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  for (n = 1; n < N; n++) {
    if (f * n > sr * 0.5) break;
    var amp = 1 / Math.pow(n, 1.6), ph = Math.PI * n * (n - 1) / (N - 1), w = 2 * Math.PI * f * n / sr;
    /* the biquad's response at this partial: H = B(e^jw) / A(e^jw) */
    var br = b0 + b1 * Math.cos(w) + b0 * Math.cos(2 * w), bi = -b1 * Math.sin(w) - b0 * Math.sin(2 * w);
    var ar = a0 + a1 * Math.cos(w) + a2 * Math.cos(2 * w), ai = -a1 * Math.sin(w) - a2 * Math.sin(2 * w);
    var den = ar * ar + ai * ai, hr = (br * ar + bi * ai) / den, hi = (bi * ar - br * ai) / den;
    var mag = Math.sqrt(hr * hr + hi * hi), arg = Math.atan2(hi, hr);
    for (j = 0; j < P; j++) {
      var th = 2 * Math.PI * j / P;
      x[j] += amp * Math.sin(n * th + ph);
      y[j] += amp * mag * Math.sin(n * th + ph + arg);
    }
  }
  var mx = 1e-6, my = 0;
  for (j = 0; j < P; j++) { mx = Math.max(mx, Math.abs(x[j])); my = Math.max(my, Math.abs(y[j])); }
  PADPK[key] = my / mx;
  return PADPK[key];
}
function padPeak(it) {
  var notes = typeof it.midi === "number" ? [it.midi] : it.midi, s = 0;
  for (var i = 0; i < notes.length; i++) s += wavePeak(notes[i], it.o.cutoff || 2600);
  return s / notes.length;
}
/* The model works per side, through the same equal-power law as the
   panners (normalised to the centre, which is what the levels mean), at the
   moment each note peaks. Notes of different pitches seldom crest together,
   so the true peak sits between the plain sum and the power sum: measured
   across all ten worlds, it is the plain sum times n^−0.3, where n is the
   number of notes effectively sounding — except that a chord of two or
   three bells struck at the same instant starts in phase and adds in full,
   so it counts as one. */
/* where a figure item actually sits: on the left, centre or right lane */
function laneGain(it) {
  var p = it.o.pan || it.o.side || 0;
  return p < -0.12 ? -0.4 : p > 0.12 ? 0.4 : 0;
}
function sideGain(pan, right) {
  var x = (clamp(pan || 0, -1, 1) + 1) / 2;
  return (right ? Math.sin(x * Math.PI / 2) : Math.cos(x * Math.PI / 2)) / Math.SQRT1_2;
}
function figurePeak(F) {
  var best = 1e-6, i, j, side;
  for (j = 0; j < F.length; j++) {
    var at = F[j].dt + (F[j].kind === "pad" ? F[j].attack : 0.006);
    for (side = 0; side < 2; side++) {
      var sum = 0, sq = 0, coh = 0, k;
      for (i = 0; i < F.length; i++) {
        if (F[i].grouped) continue;
        /* a chord of up to three bells struck together is one contributor;
           a swell of several notes is several */
        var grp = 0, together = 0, many = F[i].kind === "pad" && typeof F[i].midi !== "number" ? F[i].midi.length : 1;
        for (k = 0; k < F.length; k++) if (F[k].kind === "bell" && F[k].dt === F[i].dt) together++;
        for (k = i; k < F.length; k++) {
          if (k > i && (F[i].kind !== "bell" || together > 3 || F[k].kind !== "bell" || F[k].dt !== F[i].dt)) continue;
          grp += itemLevel(F[k], at - F[k].dt) * sideGain(laneGain(F[k]), side);
          if (k > i) F[k].grouped = true;
        }
        /* long-held swells drift into line with one another over their
           hold, so together they peak at nearly the plain sum of their
           notes: one contributor, as loud as all of them */
        if (F[i].o.coh) coh += grp * many * FIG_COH;
        else { sum += grp * many; sq += grp * grp * many; }
      }
      if (coh > 0) { sum += coh; sq += coh * coh; }
      for (i = 0; i < F.length; i++) F[i].grouped = false;
      if (sum <= 0) continue;
      var est = sum * Math.pow(sum * sum / sq, -0.3);
      if (est > best) best = est;
    }
  }
  D.lastFig = best;
  return best;
}
function figLane(pan) { return pan < -0.12 ? "sfxL" : pan > 0.12 ? "sfxR" : "sfxWet"; }
function playFigure(when, F, rung) {
  var W = D.W, trim = rung + FIG_CAL - 20 * Math.log10(figurePeak(F)), i;
  for (i = 0; i < F.length; i++) {
    var it = F[i], o = it.o, t = when + it.dt, db = it.rel + trim, lane = figLane(o.pan || o.side || 0);
    var prio = o.prio || P_REWARD;
    if (it.kind === "pad") {
      pad(t, it.midi, it.hold, db, W.pad, { cat: "bloom", voices: 1, attack: it.attack, release: it.release,
          cutoff: o.cutoff || 2600, prio: prio, tag: o.tag || "bloom", lane: lane });
    } else if (o.sine) {
      /* a pure, long-ringing tone: the lightest bell there is */
      ping(t, mtof(it.midi), mtof(it.midi), 0, db, { cat: o.cat || "bloom", attack: 0.006, tail: it.decay / 6.9,
           lane: lane, prio: prio, tag: o.tag || "melody", midi: it.midi });
    } else if (o.spec) {
      additive(t, it.midi, db, o.spec, { lane: lane, cat: o.cat || "bell", prio: prio, tag: o.tag || "melody" });
    } else {
      lead(t, it.midi, db, W, { lane: lane, cat: o.cat || "bell", prio: prio, tag: o.tag || "melody",
           decay: o.decay, attack: o.attack });
    }
  }
}
/* the current chord, an octave up, as swells: two of them, one on each
   side, two notes apiece */
function fBloom(F, dt, rel, attack, hold, release, chord, coh) {
  var ch = D.W.prog[chord === undefined ? D.chord : chord];
  fSwell(F, dt, [ch[2][0] + 12, ch[2][2] + 12], rel, attack, hold, release, { side: -1, cutoff: 3000, coh: coh });
  fSwell(F, dt, [ch[2][1] + 12, ch[2][3] + 12], rel, attack, hold, release, { side: 1, cutoff: 3000, coh: coh });
}

function reward(ev, now) {
  var W = D.W, n = clamp(ev.n || (ev.rows ? ev.rows.length : 1), 1, 4);
  var twist = ev.twist === "full" || ev.twist === "mini" ? ev.twist : "none";
  var lift = Math.min(10, Math.max(0, ev.ripple | 0));
  shimmer(now + 0.004);
  var when = quantize(now), u = K.u, notes = melodyNotes(n, lift), F = figure(), i, rung;
  if (S.calm) {
    /* Steady: a reward is a single bell, never a chord */
    fNote(F, 0, notes[0], 0);
    playFigure(when, F, RUNG.calm);
    return when - now;
  }
  if (ev.empty) return emptyWell(when, now, notes);
  if (twist !== "none") rung = twistFigure(F, when, u, n, twist, notes);
  else {
    /* the tune's next n notes, one per grid line */
    for (i = 0; i < n; i++) fNote(F, i * u, notes[i], 0, { pan: (i / Math.max(1, n - 1) - 0.5) * 0.5 });
    rung = n === 1 ? RUNG.single : n === 2 ? RUNG.double : n === 3 ? RUNG.triple : RUNG.quad;
    if (n === 3) duck(when, -2, 1);
    if (n >= 4) {
      /* a Quad: the chord blooms an octave up under the four bells, the
         room opens 3 dB, the music steps back */
      fBloom(F, 0, -9, 0.3, 0.5, 4);
      verbLift(when, 3, 2);
      duck(when, -4, 1);
    }
  }
  /* Unbroken: the first note again, an octave up, one grid line later */
  if (ev.unbroken) fNote(F, u, notes[0] + 12, -4, { tag: "unbroken", pan: 0.3, decay: 2.2 });
  playFigure(when, F, rung);
  return when - now;
}
function twistFigure(F, when, u, n, kind, notes) {
  var W = D.W, c = W.colorMidi[0], low = W.colorLow[0], i;
  if (kind === "mini") {
    /* Mini Twist Single / Double: the colour tone, then the tune */
    fNote(F, 0, c, 0, { tag: "twist", pan: -0.2 });
    for (i = 0; i < n; i++) fNote(F, (i + 1) * u, notes[i], 0, { pan: 0.2 });
    return n === 1 ? RUNG.miniSingle : RUNG.miniDouble;
  }
  if (n === 1) {
    /* Twist Single: a three-note turn — the colour tone, its neighbour in
       the pool, and the tune's next note */
    fNote(F, 0, c, 0, { tag: "twist", pan: -0.25 });
    fNote(F, u, nearestPool(W, c), -1, { tag: "twist" });
    fNote(F, 2 * u, notes[0], -0.5, { pan: 0.25 });
    return RUNG.twistSingle;
  }
  /* Twist Double and Triple: the colour chord struck whole with a low swell
     under it, then the tune; the Triple adds the colour an octave up */
  fNote(F, 0, c, 0, { tag: "twist", pan: -0.3, cat: "bloom" });
  fNote(F, 0, low, -1, { tag: "twist", pan: 0.3, cat: "bloom" });
  if (W.colorMidi[1]) fNote(F, 0, W.colorMidi[1], -3, { tag: "twist", cat: "bloom" });
  fSwell(F, 0, W.keys - 24, -4, 0.25, 0.35, 1.5, { tag: "sub", cutoff: 400 });
  for (i = 0; i < n; i++) fNote(F, (i + 1) * u, notes[i], -2, { pan: (i - 1) * 0.2 });
  if (n >= 3) fNote(F, (n + 1) * u, c + 12, -3, { tag: "twist", pan: 0.1 });
  duck(when, -3, 1);
  return n === 2 ? RUNG.twistDouble : RUNG.twistTriple;
}
function nearestPool(W, m) {
  for (var d = 1; d < 4; d++) {
    if (W.poolPc.indexOf((m - d + 120) % 12) >= 0) return m - d;
    if (W.poolPc.indexOf((m + d) % 12) >= 0) return m + d;
  }
  return m;
}
/* a Twist with no lines: the colour tone with a fifth under it */
function twistAlone(kind, now) {
  var W = D.W, when = quantize(now), F = figure();
  shimmer(now + 0.004);
  fNote(F, 0, W.colorMidi[0], 0, { tag: "twist", pan: -0.2 });
  if (kind === "full" && !S.calm) fNote(F, 0, W.colorLow[0], -2, { tag: "twist", pan: 0.2 });
  playFigure(when, F, S.calm ? RUNG.calm : kind === "mini" ? RUNG.miniTwist : RUNG.twist);
  return when - now;
}
/* The Empty Well, in two breaths. In: an eight-note cascade falls through
   the pool on thirty-seconds to rest on the tune's next note, every loop
   voice of the world ringing in between its notes, while the music steps
   back 5 dB so the cascade rings out alone. Out: as the cascade lands, the
   chord blooms across both sides of the well, the room opens, and the
   music comes back up past where it was under it. Each breath peaks under
   −14 dBFS; the second one, all sustain, is the loudest moment in the game
   by the ear's measure — louder than the bed, louder than any Quad or
   Twist — because it is long and full rather than sharp. */
function emptyWell(when, now, notes) {
  var W = D.W, F = figure(), i, loops = [];
  var thirty = 60 / K.bpm / 8, landed = 8 * thirty;
  var startIdx = W.melody[(D.melody - notes.length + 160) % W.melody.length] + 7;
  for (i = 0; i < W.loops.length; i++) loops.push(W.loops[i][0]);
  if (!loops.length && W.poly) for (i = 0; i < W.poly.length; i++) loops.push(poolNote(W, W.poly[i][1][0], W.keys + 12));
  for (i = 0; i < loops.length; i++) {
    fNote(F, (i * 2 + 1) * thirty, loops[i], -4, { tag: "loop", pan: (i / Math.max(1, loops.length - 1) - 0.5) * 0.9,
          decay: 4, cat: "bloom", sine: 1 });
  }
  for (i = 0; i < 8; i++) {
    fNote(F, i * thirty, poolNote(W, startIdx - i, W.bell), 0,
          { tag: "cascade", pan: (0.5 - i / 7) * 0.6, decay: i === 7 ? 2.6 : 0.9 });
  }
  /* the bloom rises through the last notes of the cascade and holds: the
     chord's four upper voices an octave up, on both sides. (Two more, low
     in the middle, made it fuller on paper and less predictable in fact:
     six held notes drift into line with each other so differently from one
     chord to the next that the Empty Well's crest wandered by 2 dB.) */
  fBloom(F, landed - 0.25, EW_BLOOM, 0.6, 2.4, 5, D.chord, true);
  playFigure(when, F, RUNG.empty);
  /* the music's own breath: 5 dB back for the cascade, then up past where
     it was as the bloom opens, and home again two seconds later */
  var L = E.M.Lduck, v = lineCut(L, when);
  lineTo(L, Math.min(v, dbToGain(-5)), when + 0.06);
  lineHold(L, when + landed - 0.15);
  lineTo(L, dbToGain(EW_SWELL), when + landed + 0.6);
  lineHold(L, when + landed + 2.2);
  lineTo(L, 1, when + landed + 4.2);
  verbLift(when, 3, 3);
  return when - now;
}
/* the bloom's level against the cascade's, and how far the music rises
   past where it was as the bloom opens (dB) */
var EW_BLOOM = 0, EW_SWELL = 2;
function drainSound(now) {
  var W = D.W, when = quantize(now), F = figure();
  /* the bottom of the well washes away: noise low-passed from 4 kHz down to
     300 Hz over three seconds, and the home chord settling under it */
  hiss(now + 0.004, LV.wash, { type: "lowpass", f0: 4000, f1: 300, sweep: 3, q: 0.5, attack: 0.5, hold: 1.5,
       release: 0.5, lane: "sfxWet", prio: 1, tag: "wash", offset: D.r() * 3 });
  var ch = W.prog[0];
  fSwell(F, 0, [ch[2][0], ch[2][2]], 0, 0.9, 1.5, 3, { side: -1, cutoff: 1600, tag: "resolve", prio: P_TOUCH });
  fSwell(F, 0, [ch[2][1], ch[2][3]], 0, 0.9, 1.5, 3, { side: 1, cutoff: 1600, tag: "resolve", prio: P_TOUCH });
  playFigure(when, F, RUNG.drain);
  return when - now;
}
/* the run ends on a line falling through the pool to the tonic */
function runEnd(now) {
  if (D.ended) return 0;
  D.ended = true;
  var W = D.W, when = quantize(now), eighth = 60 / K.bpm / 2, F = figure();
  for (var i = 0; i < 5; i++) {
    fNote(F, i * eighth, poolNote(W, 4 - i, W.bell), i === 4 ? 0 : -1, { tag: "end", pan: 0.4 - i * 0.2, decay: i === 4 ? 4 : 2.2 });
  }
  fSwell(F, 4 * eighth, W.keys - 12, -4, 0.8, 2, 4, { cutoff: 900, tag: "resolve", prio: 1 });
  playFigure(when, F, RUNG.end);
  D.endAt = when + 4 * eighth;
  return when - now;
}
function chime(now, rung) {
  var W = D.W, when = quantize(now), F = figure();
  fNote(F, 0, poolNote(W, 2, W.bell), 0, { tag: "chime", pan: -0.15 });
  fNote(F, K.u * 2, poolNote(W, 5, W.bell), -2, { tag: "chime", pan: 0.15 });
  playFigure(when, F, rung);
  return when - now;
}
/* a new personal best: a warm three-note phrase — fifth, sixth (or flat
   seventh), home — on the electric-piano tine whatever the world */
function pbPhrase(now) {
  var W = D.W, when = quantize(now), eighth = 60 / K.bpm / 2, F = figure();
  /* after a run's last line, the phrase waits for that line to come home */
  if (D.ended && D.endAt + 2 * eighth > when) when = D.endAt + 2 * eighth;
  for (var i = 0; i < 3; i++) {
    fNote(F, i * eighth, poolNote(W, 3 + i, W.bell), 0, { spec: scaleDecay(TINE, i === 2 ? 1.4 : 0.85), tag: "pb", pan: (i - 1) * 0.25 });
  }
  playFigure(when, F, RUNG.pbPhrase);
  return when - now;
}
/* the surface, at the end of a Descent: the home chord opens and a line
   rises through the pool */
function surface(now) {
  var W = D.W, when = quantize(now), F = figure(), i;
  fBloom(F, 0, -6, 0.6, 2.5, 5, 0);
  for (i = 0; i < 6; i++) fNote(F, i * K.spb * 2, poolNote(W, i, W.bell), 0, { tag: "surface", pan: (i / 5 - 0.5) * 0.6 });
  playFigure(when, F, RUNG.surface);
  verbLift(when, 3, 3);
  /* the Surface is the end of the run: a best set on it answers after it */
  D.ended = true;
  D.endAt = when + 5 * K.spb * 2;
  return when - now;
}

/* ================================================================
   17. interface sounds
   ================================================================ */
function uiSound(kind) {
  if (!running() || !audible("sfx")) return;
  pump();
  var W = D.W, now = nowT(), t = now + 0.004, m = W.keys + 24;
  var tick = { ratio: 2, index: 0.4, end: 0.05, decay: 0.25, attack: 0.004, cat: "tick", prio: 1, lane: "ui" };
  if (kind === "tap") { tick.tag = "ui"; fm(t, m, LV.ui, tick); }
  else if (kind === "open") {
    tick.tag = "ui"; fm(t, poolNote(W, 0, m), LV.ui + 1, tick);
    fm(t + 0.06, poolNote(W, 2, m), LV.ui, tick);
  } else if (kind === "close") {
    tick.tag = "ui"; fm(t, poolNote(W, 2, m), LV.ui, tick);
    fm(t + 0.06, poolNote(W, 0, m), LV.ui + 1, tick);
  } else if (kind === "toggle") { tick.tag = "ui"; fm(t, poolNote(W, 3, m), LV.ui, tick); }
  else if (kind === "chime") {
    /* the end of a Steady session: two soft bells, never a buzzer */
    lead(t, poolNote(W, 0, W.bell), LV.chime, W, { lane: "ui", cat: "bell", prio: 2, tag: "chime", pan: -0.15, decay: 3, attack: 0.02 });
    lead(t + 0.32, poolNote(W, 3, W.bell), LV.chime - 2, W, { lane: "ui", cat: "bell", prio: 2, tag: "chime", pan: 0.15, decay: 3.4, attack: 0.02 });
  }
}

/* ================================================================
   18. the platform: unlock, the iPhone's session, visibility
   ================================================================ */
var timer = 0, rafOn = false, listening = false;
function ctor() { return root.AudioContext || root.webkitAudioContext || null; }
function haveAudio() { return !!ctor(); }

function makeContext() {
  if (E) return E;
  var C = ctor();
  if (!C) return null;
  var c;
  try { c = new C(); } catch (x) { return null; }     /* never a sampleRate: the hardware's rate */
  E = makeEngine(c, tierFor());
  c.onstatechange = onCtxState;
  applyLevels(0);
  applyOptions();
  return E;
}
function tierFor() {
  if (S.quality === "full" || S.quality === "lite" || S.quality === "minimal") return S.quality;
  return S.tier;
}

function onCtxState() {
  if (!E) return;
  var st = E.ctx.state;
  if (st === "running") {
    everRan = true;
    if (!K.on) boot();
  }
  if (st === "interrupted" && !anyHold()) {
    /* a phone call, Siri, another app: nothing to do but wait and nudge */
    setTimeoutSafe(nudge, 600);
  }
  for (var i = 0; i < onStateFns.length; i++) { try { onStateFns[i](state()); } catch (x) {} }
}
function setTimeoutSafe(fn, ms) { if (root.setTimeout) root.setTimeout(fn, ms); }
/* WebKit has been seen to leave a context "interrupted" after the page comes
   back; suspend() then resume() shakes it loose */
function nudge() {
  if (!E || anyHold()) return;
  var c = E.ctx;
  if (c.state === "interrupted" || c.state === "suspended") {
    try {
      var p = c.suspend();
      if (p && p.then) p.then(function () { var q = c.resume(); if (q && q.catch) q.catch(function () {}); }, function () {});
    } catch (x) {}
  }
}

/* the first time the context runs: start the clock and everything waiting */
function boot() {
  var now = nowT();
  startClock(now + 0.08);
  D.pads.length = 0;
  if (!haveNoise() && !D.noiseJob) startNoise(E.ctx.sampleRate);
  requestVerb(D.W);
  queuePlucks(D.W);
  if (S.wantBed) bedOn(now + 0.08);
  if (!timer && root.setInterval) timer = root.setInterval(pump, PUMP_MS);
  if (!rafOn && root.requestAnimationFrame) {
    rafOn = true;
    /* this file's own frame starts a frame's bake budget only when the app
       is not already calling tick() every frame */
    var frame = function () {
      if (perfNow() - tickedAt > 12) bakeFrame();
      pump(); root.requestAnimationFrame(frame);
    };
    root.requestAnimationFrame(frame);
  }
  if (S.quality === "auto" && !S.probed) setTimeoutSafe(probe, PROBE_FIRST);
}

function unlock() {
  if (!haveAudio()) return;
  if (!E) setSession();
  if (!makeContext()) return;
  var c = E.ctx;
  if (c.state !== "running" && c.state !== "closed" && !anyHold()) {
    try { var p = c.resume(); if (p && p.catch) p.catch(function () {}); } catch (x) {}
  }
  /* belt and braces: a one-sample silent buffer started inside the gesture */
  try {
    var b = c.createBuffer(1, 1, c.sampleRate), s = c.createBufferSource();
    s.buffer = b; s.connect(c.destination); s.start(0);
  } catch (x2) {}
  if (!listening) listen();
  if (c.state === "running") { everRan = true; if (!K.on) boot(); }
}

function listen() {
  listening = true;
  var doc = root.document;
  if (doc && doc.addEventListener) {
    doc.addEventListener("visibilitychange", function () {
      S.holds.hidden = doc.visibilityState === "hidden";
      applyHolds();
    });
  }
  if (root.addEventListener) {
    root.addEventListener("pagehide", function () { S.holds.hidden = true; applyHolds(true); });
    root.addEventListener("pageshow", function () {
      if (!doc || doc.visibilityState !== "hidden") { S.holds.hidden = false; applyHolds(); }
    });
    /* After a phone call, Siri or an alarm, iOS can leave the context
       suspended until the page is touched again — and Quiet chosen before
       the very first tap means the context has never been allowed to start.
       Either way the next gesture is the moment to wake it, so every
       activating gesture gets a look, for the life of the page. The look
       costs one property read. */
    var opt = { capture: true, passive: true }, ev = ["pointerup", "touchend", "click", "keydown"];
    for (var i = 0; i < ev.length; i++) root.addEventListener(ev[i], rearm, opt);
  }
}
function rearm() {
  if (!E || CLOCKFN || anyHold()) return;
  var c = E.ctx;
  if (c.state === "suspended" || c.state === "interrupted") {
    try { var p = c.resume(); if (p && p.catch) p.catch(function () {}); } catch (x) {}
    if (!everRan) {
      /* still never started: the same belt and braces as the first unlock */
      try { var b = c.createBuffer(1, 1, c.sampleRate), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (x2) {}
    }
  }
}
function anyHold() { return S.holds.app || S.holds.hidden || S.holds.quiet; }
/* Hidden, suspended by the app, or Quiet: fade out over 120 ms (a suspend
   mid-waveform can click), then suspend, so nothing runs in the background.
   Otherwise resume — WebKit needs no fresh gesture once audio has started —
   and fade back in over 600 ms. */
function applyHolds(immediate) {
  if (!E || CLOCKFN) return;
  var c = E.ctx, M = E.M, t = c.currentTime;
  if (anyHold()) {
    glide(M.Lfade, 0, t, 0.12);
    var go = function () {
      if (anyHold() && c.state === "running") { try { var p = c.suspend(); if (p && p.catch) p.catch(function () {}); } catch (x) {} }
    };
    if (immediate) go(); else setTimeoutSafe(go, 160);
  } else {
    if (c.state !== "running" && c.state !== "closed") {
      try { var q = c.resume(); if (q && q.catch) q.catch(function () {}); } catch (x2) {}
    }
    glide(M.Lfade, 1, t, 0.6);
    setTimeoutSafe(function () { if (E && E.ctx.state === "interrupted") nudge(); }, 500);
  }
}

/* the iPhone's audio session: "ambient" respects the Silent switch and mixes
   with the player's own music; "playback" plays through the switch and
   pauses their music. The type is read back, because WebKit refuses the
   setter silently in some embeddings and then reports "auto". */
function setSession() {
  var nav = root.navigator;
  if (!nav || !nav.audioSession) { S.session = "unsupported"; return S.session; }
  var want = S.playOnSilent ? "playback" : "ambient";
  try {
    if (nav.audioSession.type !== want) nav.audioSession.type = want;
    S.session = nav.audioSession.type;
  } catch (x) { S.session = "error"; }
  updateMedia();
  return S.session;
}
function updateMedia() {
  var nav = root.navigator;
  if (!nav || !nav.mediaSession) return;
  try {
    if (S.session === "playback" && typeof root.MediaMetadata === "function") {
      nav.mediaSession.metadata = new root.MediaMetadata({ title: "The Well — " + D.W.name, artist: "kmay89.com", album: "The Well" });
      nav.mediaSession.setActionHandler("play", function () { Music.resume(); remote("play"); });
      nav.mediaSession.setActionHandler("pause", function () { Music.suspend(); remote("pause"); });
    } else if (S.session !== "playback") {
      nav.mediaSession.metadata = null;
    }
  } catch (x) {}
}
function remote(kind) {
  for (var i = 0; i < onStateFns.length; i++) { try { onStateFns[i](state(), kind); } catch (x) {} }
}

function state() {
  if (!haveAudio() && !CLOCKFN) return "off";
  if (S.quiet || S.levels.master <= 0) return "off";
  if (!E || !everRan) return "locked";
  if (CLOCKFN) return "running";
  return E.ctx.state === "running" && !S.holds.app && !S.holds.hidden ? "running" : "suspended";
}

/* ================================================================
   19. levels, options, tiers
   ================================================================ */
function applyLevels(ramp) {
  if (!E) return;
  var M = E.M, t = nowT(), d = ramp === undefined ? 0.05 : ramp, q = S.quiet ? 0 : 1, L = S.levels;
  var mg = sliderGain(L.master, REF.master) * q, mu = sliderGain(L.music, REF.music) * bedGainOf(D.W);
  var sf = sliderGain(L.sfx, REF.sfx) * bareTrim(), am = sliderGain(L.ambience, REF.ambience);
  glide(M.Lmaster, mg, t, d);
  glide(M.LmusicDry, mu, t, d); glide(M.LmusicWet, mu, t, d);
  glide(M.LsfxDry, sf, t, d); glide(M.LsfxWet, sf, t, d); glide(M.Lui, sf, t, d);
  glide(M.LambDry, am, t, d); glide(M.LambWet, am, t, d);
}
/* The effects were balanced against the bed. With the music turned right
   down they would land on silence instead, and the same pluck that sits
   gently in the music would jump out of nothing — the startle guard
   measures exactly that. So as the music slider goes below half its
   default level the effects ease down with it, by up to 6 dB with the
   music off ("Effects only"). */
function bareTrim() {
  var mu = sliderGain(S.levels.music, REF.music), db = mu > 0 ? 20 * Math.log10(mu) : -99;
  return dbToGain(clamp((db + 6) * 0.5, -6, 0));
}
/* the music bus at a world's own level (see BED_LIFT) */
function bedGainOf(W) { return dbToGain(BED_LIFT + (W.bed || 0)); }
/* a new world's bed settles to its own level over the crossfade */
function retrimBed(t, secs) {
  var M = E.M, mu = sliderGain(S.levels.music, REF.music) * bedGainOf(D.W);
  glide(M.LmusicDry, mu, t, secs); glide(M.LmusicWet, mu, t, secs);
}
function applyOptions() {
  if (!E) return;
  var t = nowT();
  glide(E.M.Lshelf, softenOn() ? -6 : 0, t, 0.1);
}
function setTier(name) {
  if (!CAPS[name]) return;
  S.tier = name;
  if (!E || E.tier === name) return;
  E.tier = name;
  E.caps = CAPS[name];
  if (name === "full") { requestVerb(D.W); }
  else {
    glide(E.M.LverbOut, 0, nowT(), 0.4);
    setTimeoutSafe(function () { if (E && E.tier !== "full") requestVerb(D.W); }, 450);
  }
}

/* The CPU probe. Two seconds of the worst scene a world can produce —
   intensity at the top, a chord changing over, eight plucks, four bells,
   rain — rendered offline and timed. Faster than 0.15 of real time is the
   full tier; under 0.35 is lite; anything slower is minimal. Offline
   rendering is not the real-time thread, so the Sound sheet keeps a manual
   setting too. The clock that times it is the main thread's, which is
   busiest in the first second of the page, so the probe waits a moment
   before it runs, and a device that does not reach the full tier the first
   time is asked once more at the next pause or stop (reprobe()); the
   better of the two counts. */
var PROBE_FIRST = 1200, PROBE_IR = null;
function reprobe() {
  if (S.reprobe && S.quality === "auto") { S.reprobe = false; setTimeoutSafe(probe, 250); }
}
function probe() {
  S.probed = true;
  var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
  if (!OAC || !E || CLOCKFN) return;
  var sr = E.ctx.sampleRate, secs = 2, oc;
  /* always the same room, a four-second one, whatever tier is playing now:
     the probe asks what the full tier would cost. The room is baked in the
     background first, and the probe comes back when it is ready. */
  if (!PROBE_IR || PROBE_IR.sampleRate !== sr) {
    if (!D.probeJob) { D.probeJob = irJob(sr, 4, 0.025, 0.5, 5); D.probeJob.sr = sr; }
    return;
  }
  S.probes = (S.probes || 0) + 1;
  try { oc = new OAC(2, Math.floor(sr * secs), sr); } catch (x) { return; }
  var saved = E, W = D.W;
  try {
    E = makeEngine(oc, "full");
    setCore(E, "conv", PROBE_IR, W);
    E.M.verbOut.gain.value = 0.3;
    var i, ch0 = W.prog[0], ch1 = W.prog[1];
    for (i = 0; i < 4; i++) {
      pad(0, ch0[2][i], 1, -34, W.pad, { side: i % 2 ? 1 : -1, voices: 4, tag: "probe" });
      pad(1, ch1[2][i], 1, -34, W.pad, { side: i % 2 ? 1 : -1, voices: 4, tag: "probe" });
    }
    for (i = 0; i < 8; i++) pluck(0.1 + i * 0.2, poolNote(W, i, W.keys), -30, W, { pan: 0.3, hold: 0.6, tag: "probe" });
    for (i = 0; i < 4; i++) fm(0.2 + i * 0.3, poolNote(W, i, W.bell), -26, { ratio: 3.5, index: 1.4, end: 0.3, decay: 2, pan: -0.3, tag: "probe" });
    var rb = makeBed("bandpass", 2500, 0.6, true);
    rb.g.gain.value = 0.01; rb.src.start(0);
    for (i = 0; i < 16; i++) ping(i * 0.12, 2000 + i * 50, 2400 + i * 50, 0.04, -36, { pan: 0.5, tag: "probe" });
  } catch (x2) {
    E = saved;
    return;
  }
  E = saved;
  var t0 = perfNow();
  try {
    var pr = oc.startRendering();
    var done = function () {
      var rtf = (perfNow() - t0) / 1000 / secs;
      S.rtf = S.rtf ? Math.min(S.rtf, rtf) : rtf;
      S.autoTier = S.rtf < 0.15 ? "full" : S.rtf < 0.35 ? "lite" : "minimal";
      if (S.quality === "auto") setTier(S.autoTier);
      /* the second asking waits for a pause, a run's end or the splash:
         a device that is not full already plays on the lighter tier, and
         the probe's own work is a dropped frame in the middle of a run */
      if (S.autoTier !== "full" && S.probes < 2) S.reprobe = true;
      else PROBE_IR = null;
    };
    if (pr && pr.then) pr.then(done, function () {});
    else oc.oncomplete = done;
  } catch (x3) {}
}

/* ================================================================
   20. the public face
   ================================================================ */
var Music = {
  WORLDS: WORLDS,
  ORDER: ORDER,

  unlock: unlock,

  setWorld: function (id, now) {
    var W = WORLDS[id && id.id ? id.id : id];
    if (!W) return;
    if (E && K.on && running() && D.bed) {
      /* the bed is playing: modulate at the next bar (or the next step) */
      if (W === D.W) { D.pending = null; return; }
      D.pending = { W: W, now: !!now };
      requestVerb(W);
      queuePlucks(W);
      return;
    }
    /* nothing is sounding: change at once, quietly */
    D.pending = null;
    if (W !== D.W) { D.W = W; D.melody = 0; }
    if (E) {
      requestVerb(W);
      queuePlucks(W);
      glide(E.M.Ltone, W.lp || 18000, nowT(), 0.1, true);
      retrimBed(nowT(), 0.1);
      updateMedia();
    }
  },

  setLevels: function (o) {
    if (!o) return;
    var L = S.levels;
    if (typeof o.master === "number") L.master = clamp(o.master, 0, 1);
    if (typeof o.music === "number") L.music = clamp(o.music, 0, 1);
    if (typeof o.sfx === "number") L.sfx = clamp(o.sfx, 0, 1);
    if (typeof o.ambience === "number") L.ambience = clamp(o.ambience, 0, 1);
    applyLevels();
    /* music turned back up mid-run: the drones it skipped come back */
    if (E && running() && D.bed && bedPlaying() && D.W.drone && !D.drones.length) startDrones(nowT());
  },

  /* The app hands over every sound option whenever any one of them
     changes, so each is acted on only when it really differs: dragging a
     volume slider must not re-route the iPhone's audio session under a fade
     forty times a second. */
  setOptions: function (o) {
    if (!o) return {};
    if (o.soften !== undefined) S.soften = !!o.soften;
    if (o.quiet !== undefined && !!o.quiet !== S.quiet) {
      S.quiet = !!o.quiet;
      S.holds.quiet = S.quiet;
      applyLevels(0.25);
      applyHolds();
    }
    if (o.quality && o.quality !== S.quality) {
      S.quality = o.quality;
      if (o.quality === "auto") {
        if (!S.probed && E && everRan) setTimeoutSafe(probe, PROBE_FIRST);
        else if (S.autoTier) setTier(S.autoTier);
      } else setTier(o.quality);
    }
    if (o.playOnSilent !== undefined && !!o.playOnSilent !== S.playOnSilent) {
      S.playOnSilent = !!o.playOnSilent;
      if (E) {
        /* change the session under a short fade, in case the route glitches */
        var M = E.M, t = nowT();
        glide(M.Lfade, 0, t, 0.06);
        setSession();
        if (!anyHold()) glide(M.Lfade, 1, t + 0.08, 0.3);
      }
    }
    applyOptions();
    return { session: S.session, tier: E ? E.tier : S.tier };
  },

  event: function (ev) {
    if (!ev || !ev.t) return 0;
    var t = ev.t;
    if (t === "pause") { Music.pause(true); return 0; }
    if (t === "resume") { Music.pause(false); return 0; }
    if (t === "world") { Music.setWorld(ev.world, ev.now); return 0; }
    if (t === "breathe") { Music.breath(ev.phase); return 0; }
    if (!running() || !K.on) return 0;
    /* the Breath swells the pads: it belongs to the music, and is heard
       whenever the music is, whatever the effects slider says */
    if (t === "breath") { if (audible("music")) eventSound(ev, nowT()); return 0; }
    if (!audible("sfx")) return 0;
    if (S.paused && t !== "over" && t !== "end") return 0;
    pump(true);
    var sync = eventSound(ev, nowT());
    return sync > 0 ? sync : 0;
  },

  setIntensity: function (danger) { D.danger = clamp(+danger || 0, 0, 1); },

  calm: function (on) {
    /* tempo eases by 0.85 at the next bar; the layers, the arpeggio and the
       loops thin; Soften goes on; rewards become single bells */
    S.calm = !!on;
    applyOptions();
  },

  /* Steady's closing breath. `phase` runs 0..1 through one breath, and
     `full` — how full the breath is, 0 empty to 1 full, which is what
     Steady's circle draws — says which half of it we are in: rising is the
     in-breath, falling the out-breath. Only the turns are acted on: one
     ramp per half-breath, lasting as long as that half will, never an
     automation event per frame. The length of the in-breath is learned at
     the first turn, so "longer out" and "even" both come out right.
     (0, 0) — nothing drawn, before the first breath or after the last —
     lets the pad settle. Called with no fullness, the turn is taken to come
     four tenths of the way through, four seconds in and six out. */
  breath: function (phase, full) {
    if (!E || !running()) return;
    var now = nowT(), has = typeof full === "number";
    if (typeof phase !== "number" || phase < 0 || (has && full <= 0.001 && phase <= 0.001)) {
      if (D.breathIn || D.breathPhase >= 0) breathe(now, false, 1.5);
      D.breathIn = false; D.breathPhase = -1; D.breathFull = -1;
      return;
    }
    phase = clamp(phase, 0, 1);
    var last = D.breathPhase, dt = now - D.breathT, f = D.breathFrac;
    /* how fast the phase moves, so each ramp lasts as long as the
       half-breath it belongs to (a ten-second breath until it is measured) */
    if (last >= 0 && dt > 0.02 && phase > last) {
      var r = (phase - last) / dt;
      D.breathRate = D.breathRate ? D.breathRate * 0.7 + r * 0.3 : r;
    }
    D.breathT = now;
    var rate = D.breathRate || 0.1, fresh = last < 0 || phase < last - 0.5;
    var rising = has ? (D.breathFull < 0 ? full < 0.98 : full > D.breathFull + 1e-4) : phase < f;
    var falling = has ? D.breathFull >= 0 && full < D.breathFull - 1e-4 : phase >= f;
    if ((fresh || !D.breathIn) && rising && !falling) {
      breathe(now, true, Math.max(0.4, (f - phase) / rate));
      D.breathIn = true;
    } else if (D.breathIn && falling) {
      /* the turn: this is where the in-breath really ended */
      if (has && phase > 0.15 && phase < 0.85) D.breathFrac = f = phase;
      breathe(now, false, Math.max(0.4, (1 - phase) / rate));
      D.breathIn = false;
    }
    D.breathPhase = phase;
    if (has) D.breathFull = full;
  },

  pause: function (on) {
    on = !!on;
    if (S.paused === on) return;
    S.paused = on;
    if (!E) return;
    if (on) reprobe();
    var M = E.M, t = nowT();
    if (on) {
      /* the music steps back behind a 500 Hz low-pass and 8 dB; effects
         stop; the ambience keeps breathing */
      glide(M.Ltone, 500, t, 0.6, true);
      glide(M.LverbTone, 500, t, 0.6, true);
      glide(M.Lpause, dbToGain(-8), t, 0.6);
      glide(M.Lgate, 0, t, 0.08);
      var L = E.live, cats = ["bell", "pluck", "tick", "bloom"];
      for (var c = 0; c < cats.length; c++) {
        var A = L[cats[c]], w = 0;
        for (var i = 0; i < A.length; i++) {
          if (A[i].tag === "loop" || A[i].tag === "layer" || A[i].tag === "modal" || A[i].tag === "bowl" ||
              A[i].tag === "arp" || A[i].tag === "poly" || A[i].tag === "bass" || A[i].tag === "glide" ||
              A[i].tag === "bloom" && A[i].prio < 2) { A[w++] = A[i]; continue; }
          stealVoice(A[i], t + 0.08);
        }
        A.length = w;
      }
    } else {
      glide(M.Ltone, D.W.lp || 18000, t, 0.6, true);
      glide(M.LverbTone, 18000, t, 0.6, true);
      glide(M.Lpause, 1, t, 0.6);
      glide(M.Lgate, 1, t, 0.05);
    }
  },

  start: function () {
    S.wantBed = true;
    D.ended = false;
    D.melody = 0;
    if (!E || !K.on || !running()) return;
    pump();
    if (D.pending && !D.bed) {
      /* a world chosen while silent takes effect before the first chord */
      D.W = D.pending.W; D.pending = null; requestVerb(D.W); queuePlucks(D.W);
      glide(E.M.Ltone, D.W.lp || 18000, nowT(), 0.2, true);
      retrimBed(nowT(), 0.2);
      updateMedia();
    } else if (D.pending) {
      /* the bed is already playing (the splash's Dawn): the run's world
         takes over at the very next step, loops, drones, ambience and all */
      D.pending.now = true;
    }
    if (!D.bed) bedOn(nowT());
  },

  stop: function () {
    S.wantBed = false;
    reprobe();
    if (!E || !D.bed) { D.bed = false; return; }
    bedOff(nowT());
  },

  suspend: function () { S.holds.app = true; applyHolds(); },
  resume: function () {
    S.holds.app = false;
    if (!E) return;
    applyHolds();
  },

  ui: uiSound,
  state: state,

  /* called by the app's frame loop; harmless to call as often as you like */
  tick: function () {
    bakeFrame(); tickedAt = perfNow();
    pump(); settleBeds(running() ? nowT() : 0);
  },

  /* Notified with state() whenever the context changes state, and with a
     second argument "play" or "pause" when the lock screen's controls are
     used under Play on silent — so the game can pause along with the sound. */
  onState: function (fn) { if (typeof fn === "function") onStateFns.push(fn); },

  info: function () {
    return { state: state(), tier: E ? E.tier : S.tier, rtf: S.rtf || 0, session: S.session,
             sampleRate: E ? E.ctx.sampleRate : 0, nodes: E && running() ? liveNodes(nowT()) : 0,
             peakNodes: E ? E.peakNodes : 0, world: D.W.id, layer: D.layer, bpm: K.bpm, grid: K.u };
  },

  /* pure pieces, for tools/ checks in node */
  theory: { mtof: mtof, poolNote: poolNote, gridUnit: gridUnit, commonTones: commonTones,
            bakePluck: bakePluck, irJob: irJob, irWork: irWork, softClipCurve: softClipCurve,
            fillNoise: fillNoise, rng: rng, sliderGain: sliderGain, heardPeak: heardPeak, PIECE_STEP: PIECE_STEP, LV: LV, CAPS: CAPS, RUNG: RUNG },

  /* Point the whole engine at a context somebody else made — an
     OfflineAudioContext, with a clock the caller advances — and listen to
     every note it plays. The only callers are the checks in tools/, which
     render the music and measure the samples: there is no way to test a
     sound except to listen to it, and a machine listens by looking. */
  debug: {
    useContext: function (ctx, clockFn, o) {
      o = o || {};
      CLOCKFN = clockFn || null;
      E = makeEngine(ctx, o.tier || "full");
      everRan = true;
      D.r = rng(o.seed || 1);
      D.flat = !!o.flat;
      plucks = {};
      noiseCache = null;
      D.pads.length = 0; D.drones.length = 0; D.amb = []; D.ambOld = []; D.loops = [];
      D.melody = 0; D.lastX = 4; D.softRows = 0; D.rep = 0; D.repDir = 0; D.chord = 0; D.arp = 0; D.polyStep = 0;
      D.breathPhase = -1; D.breathRate = 0; D.breathIn = false; D.breathFull = -1; D.breathFrac = 0.4; D.irJob = null; D.noiseJob = null; D.probeJob = null; D.ambAt = 0; D.irBuf = null; D.verbSwapAt = 0; D.verbIdle = false;
      D.bed = false; D.pending = null; D.ended = false; D.layer = 0; D.danger = 0; D.last = {};
      S.paused = false; S.calm = false; S.wantBed = false;
      applyLevels(0);
      applyOptions();
      startClock(nowT() + 0.05);
      requestVerb(D.W);
      queuePlucks(D.W);
      bakeWork(1e9);
      return E;
    },
    trace: function (fn) { TRACE = fn || null; },
    engine: function () { return E; },
    clock: function () { return K; },
    director: function () { return D; },
    quantize: function (t) { return quantize(t); },
    nodes: function (t) { return E ? liveNodes(t === undefined ? nowT() : t) : 0; }
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = Music;
else root.Music = Music;
})(typeof self !== "undefined" ? self : this);
