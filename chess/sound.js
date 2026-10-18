/* sound.js — what the pieces sound like.

   The room had one oscillator and a switch statement: every piece, in
   every material, made the same soft blip. That is the audio equivalent
   of drawing all six men as the same cylinder — and the fix is the same
   one motion.js made for movement. A piece set down on a board is a
   struck resonator: a short noisy contact, then a few inharmonic modes
   that ring and die away. Which modes, how fast they die, and how much
   noise there is at the start, is exactly what your ear uses to tell
   glass from wood without being told.

   So three things decide every sound here:

     the material   the modes and how long they ring. Wood is dead in a
                    tenth of a second; glass goes on for the better part
                    of one; metal is inharmonic, which is why a bell
                    does not sound like a note.
     the piece      how low and how loud. A king is about three times
                    the mass of a pawn in a real weighted set, and a
                    heavier body of similar shape rings lower and lands
                    harder. The rook is the squat one and rings duller
                    for it.
     the board      a polished board is a harder, brighter contact than
                    a matte one; a textured one drags noisier.

   And friction, which is the part you only notice when it is missing: a
   piece that slides across the board makes a sound the whole way, and
   the sound follows how fast it is going. The knight makes none,
   because the knight is carried — and that falls straight out of
   motion.js rather than being a special case here. The amplitude is the
   piece's own speed curve, gated by how far off the board it is, read
   from the very plan the renderer is animating.

   The second half of the file is the room's music: every moment that
   is not a piece touching wood — a game beginning, a check, a mate, a
   lesson got right, a rating going up — used to be a sine beep, and is
   now a short piece of music written down as data, played by a small
   synth (struck marimba and felt piano, an FM chime, a soft pad) into a
   reverb whose room is grown from noise rather than recorded.

   Everything is synthesized: no samples, nothing to download, and it
   works on the train. Tested by chess/tools/sound-check.js, which
   checks the numbers in node and then renders the actual audio in a
   browser and measures it.                                            */
(function (root) {
"use strict";

function motionKit() {
  if (root.Motion) return root.Motion;
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    try { return require("./motion.js"); } catch (e) { return null; }
  }
  return null;
}
var Move = motionKit();

var KIND = ["", "pawn", "knight", "bishop", "rook", "queen", "king"];

/* ---------- the materials ----------
   `modes` are the ratios of the partials to the first one. A struck
   block of something homogeneous gives roughly 1 : 2.76 : 5.40; the
   further a material is from that, the less like a note and the more
   like a bell or a thud it sounds. `damping` is how much faster each
   partial above the first dies — a dead material loses its top end
   almost at once, which is the whole difference between a thud and a
   ring. */
var MATERIALS = {
  wood: {
    base: 288, modes: [1, 2.04, 3.28], gains: [1, 0.36, 0.12],
    decay: 0.085, damping: 0.50, thump: 0.95,
    click: 0.95, clickHz: 1250, clickQ: 0.7, clickLen: 0.020,
    scrapeHz: 760, scrapeQ: 1.0, friction: 0.62, lift: 0.30
  },
  ivory: {
    base: 430, modes: [1, 2.71, 4.92], gains: [1, 0.44, 0.17],
    decay: 0.165, damping: 0.56, thump: 0.72,
    click: 0.70, clickHz: 1900, clickQ: 0.9, clickLen: 0.014,
    scrapeHz: 1150, scrapeQ: 1.3, friction: 0.46, lift: 0.26
  },
  porcelain: {
    base: 620, modes: [1, 2.76, 5.40, 8.93], gains: [1, 0.52, 0.26, 0.10],
    decay: 0.330, damping: 0.62, thump: 0.46,
    click: 0.52, clickHz: 3100, clickQ: 1.1, clickLen: 0.010,
    scrapeHz: 2100, scrapeQ: 1.8, friction: 0.34, lift: 0.20
  },
  glass: {
    base: 755, modes: [1, 2.81, 5.43, 8.72, 12.1], gains: [1, 0.56, 0.31, 0.15, 0.06],
    decay: 0.720, damping: 0.68, thump: 0.30,
    click: 0.40, clickHz: 4200, clickQ: 1.4, clickLen: 0.008,
    scrapeHz: 2900, scrapeQ: 2.4, friction: 0.30, lift: 0.17
  },
  /* metal is the odd one: its partials are nowhere near whole-number
     ratios, which is why a bell has no pitch you can sing */
  metal: {
    base: 545, modes: [1, 2.37, 3.71, 5.96, 8.21], gains: [1, 0.64, 0.42, 0.22, 0.11],
    decay: 0.880, damping: 0.78, thump: 0.40,
    click: 0.46, clickHz: 3600, clickQ: 1.2, clickLen: 0.009,
    scrapeHz: 2500, scrapeQ: 2.0, friction: 0.52, lift: 0.22
  },
  ink: {
    base: 250, modes: [1, 2.3], gains: [1, 0.20],
    decay: 0.038, damping: 0.42, thump: 1.00,
    click: 1.00, clickHz: 900, clickQ: 0.6, clickLen: 0.024,
    scrapeHz: 540, scrapeQ: 0.8, friction: 0.70, lift: 0.34
  }
};

/* ---------- the men ----------
   Mass is taken from a real weighted tournament set rather than from
   the carved geometry, because the geometry is whatever set happens to
   be loaded and the ear has an expectation that is older than any of
   them: a pawn is about a third of a king. `slender` is the other half
   of the shape — a tall thin piece rings on, a squat one is duller, and
   the rook is the squat one. `foot` is how much of the piece is in
   contact with the board, which is what drags. */
var PIECES = {
  pawn:   { mass: 0.36, slender: 0.62, foot: 0.70 },
  knight: { mass: 0.60, slender: 0.72, foot: 0.86 },
  bishop: { mass: 0.60, slender: 0.86, foot: 0.82 },
  rook:   { mass: 0.68, slender: 0.62, foot: 0.90 },
  queen:  { mass: 0.88, slender: 0.92, foot: 0.95 },
  king:   { mass: 1.00, slender: 1.00, foot: 1.00 }
};
/* Two similar shapes of different size ring at the cube root of their
   mass ratio. This is a shade steeper than that, because half an octave
   between a pawn and a king is a difference you hear and a third of one
   is a difference you only measure. */
var MASS_TO_PITCH = -0.42;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function kindName(piece) { return KIND[piece < 0 ? -piece : piece] || "pawn"; }

/* the board itself is part of the sound: what you set a piece down on
   decides how hard the contact is and how much the slide rasps */
function surfaceOf(skin) {
  var b = (skin && skin.board) || {};
  var gloss = clamp(b.gloss == null ? 0.2 : b.gloss, 0, 1);
  var grain = clamp(b.grain == null ? 0.4 : b.grain, 0, 1);
  return { hard: 0.58 + gloss * 0.42, tooth: 0.34 + grain * 0.66 };
}
function materialOf(skin) {
  var id = skin && skin.pieces && skin.pieces.material;
  return MATERIALS[id] ? id : "ivory";
}

/* ---------- one piece, on one board: every number the synth needs ----------
   Pulled out as a pure function so it can be checked without an audio
   context anywhere near it. */
function voiceFor(materialId, pieceName, surface) {
  var m = MATERIALS[materialId] || MATERIALS.ivory;
  var p = PIECES[pieceName] || PIECES.pawn;
  var s = surface || { hard: 0.7, tooth: 0.6 };
  var pitch = Math.pow(p.mass, MASS_TO_PITCH);
  var f0 = m.base * pitch;
  var modes = [], i;
  for (i = 0; i < m.modes.length; i++) {
    modes.push({
      f: f0 * m.modes[i],
      /* the upper partials belong to the slim pieces; a squat rook
         keeps its fundamental and loses the shimmer */
      gain: m.gains[i] * (i === 0 ? 1 : Math.pow(p.slender, 0.9 + i * 0.35)),
      decay: m.decay * Math.pow(m.damping, i) * (0.72 + p.slender * 0.42)
    });
  }
  return {
    material: materialId, piece: pieceName,
    f0: f0, modes: modes,
    /* a heavier piece lands harder, and a polished board gives it less
       to sink into */
    level: 0.16 + p.mass * 0.22 * s.hard,
    thump: { f: 78 * Math.pow(p.mass, -0.26), gain: m.thump * p.mass * 0.42,
             decay: 0.055 + p.mass * 0.085 },
    click: { gain: m.click * (0.55 + s.hard * 0.65), hz: m.clickHz * (0.8 + s.hard * 0.35),
             q: m.clickQ, len: m.clickLen * (1.35 - s.hard * 0.45) },
    /* the drag: how wide the foot is, how rough the board, and how
       grabby the material */
    scrape: { hz: m.scrapeHz * Math.pow(p.mass, -0.18), q: m.scrapeQ,
              gain: m.friction * s.tooth * p.foot * 0.085 },
    lift: { gain: m.lift * p.foot * 0.06, hz: m.clickHz * 0.6 },
    /* the longest this voice can still be heard, which is what bounds
       how far ahead anything has to be scheduled */
    tail: Math.max(m.decay, 0.06) * (0.72 + p.slender * 0.42) + 0.08
  };
}

/* ---------- friction, read off the move the renderer is animating ----------
   The amplitude of a slide is how fast the piece is going, gated by how
   far off the board it is. A knight is carried, so its curve is two
   scuffs and silence; a queen crossing the board is a long even rasp
   that rises and falls with her. Nothing here knows which piece is
   which — it reads the same plan the board is drawing. */
/* The lift a sliding piece is given is small — a hand glides rather
   than scrapes — and a lift that small should thin the drag, not stop
   it. Only a genuine carry does that, and the one piece that is
   genuinely carried is lifted five times higher than any of the others.
   So the gate sits between the two, and falls off as the square of the
   clearance the way a contact force does: a queen's glide dips in the
   middle, a knight's hop is two scuffs and silence. */
var AIRBORNE = 0.42;         /* squares of lift at which the drag has gone */
function frictionCurve(plan, n) {
  n = n || 48;
  var out = new Float32Array(n), i, peak = 0;
  if (!Move || !plan || plan.travel <= 0) return out;
  var h = 1 / (n - 1);
  for (i = 0; i < n; i++) {
    var t = (i * h) * plan.travel;
    var a = Move.at(plan, Math.max(0, t - h * plan.travel * 0.5));
    var b = Move.at(plan, Math.min(plan.travel, t + h * plan.travel * 0.5));
    var speed = Math.abs(b.p - a.p) / h;
    var mid = Move.at(plan, t);
    var lifted = clamp(mid.y / AIRBORNE, 0, 1);
    var ground = (1 - lifted) * (1 - lifted);
    out[i] = speed * ground;
    if (out[i] > peak) peak = out[i];
  }
  /* the ends are forced to silence: a curve that starts or stops at a
     non-zero value is a click, and a click is the one thing a slide
     must not have */
  out[0] = 0; out[n - 1] = 0;
  if (peak > 0) for (i = 0; i < n; i++) out[i] /= peak;
  return out;
}
/* how loud that curve should actually be: a long fast slide by a heavy
   piece, on a rough board, in a grabby material */
function frictionLevel(voice, plan) {
  if (!plan) return 0;
  return voice.scrape.gain * clamp(0.45 + plan.dist * 0.16, 0.45, 1.5);
}

/* where in a move each thing can be heard. Sampled from motion.js
   rather than written down twice, so a curve that is retuned there
   moves the sound with it. */
function flashPeak(plan) {
  if (!Move || !plan) return 0.49;
  var best = 0.49, bv = -1;
  for (var i = 0; i <= 60; i++) {
    var t = i / 60, v = Move.promoteAt(plan, t).flash;
    if (v > bv) { bv = v; best = t; }
  }
  return best;
}

/* ================= the audio side ================= */
var AC = null, master = null, noiseBuf = null, on = true;
var skinNow = null, materialNow = "ivory", surfaceNow = surfaceOf(null);

/* one compressor on the way out: two pieces landing together, or a long
   glass ring under a capture, should duck rather than clip */
function buildChain(c) {
  var comp = c.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-16, 0);
  comp.knee.setValueAtTime(14, 0);
  comp.ratio.setValueAtTime(6, 0);
  comp.attack.setValueAtTime(0.003, 0);
  comp.release.setValueAtTime(0.18, 0);
  var g = c.createGain();
  g.gain.setValueAtTime(0.85, 0);
  g.connect(comp); comp.connect(c.destination);
  return g;
}
function ctx() {
  if (typeof window === "undefined") return null;
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
    master = buildChain(AC);
  }
  if (AC.state === "suspended") AC.resume().catch(function () {});
  return AC;
}
function noise(c) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  var n = Math.floor(c.sampleRate * 0.5);
  noiseBuf = c.createBuffer(1, n, c.sampleRate);
  var d = noiseBuf.getChannelData(0);
  for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/* a piece being set down: the contact, the body, and the weight of it */
function strike(c, t, voice, force) {
  force = clamp(force == null ? 1 : force, 0.08, 1.6);
  var out = master, i;
  /* the contact itself — filtered noise, a hundredth of a second */
  var src = c.createBufferSource(); src.buffer = noise(c); src.loop = true;
  var bp = c.createBiquadFilter(); bp.type = "bandpass";
  bp.frequency.setValueAtTime(voice.click.hz, t);
  bp.Q.setValueAtTime(voice.click.q, t);
  var cg = c.createGain();
  env(cg, t, voice.level * voice.click.gain * force, 0.001, voice.click.len);
  src.connect(bp); bp.connect(cg); cg.connect(out);
  src.start(t); src.stop(t + voice.click.len + 0.03);
  /* the body ringing */
  for (i = 0; i < voice.modes.length; i++) {
    var md = voice.modes[i];
    var o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(md.f, t);
    var g = c.createGain();
    env(g, t, voice.level * md.gain * force, 0.002, md.decay);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + md.decay + 0.04);
  }
  /* and the weight: the thud a heavy piece puts through the table */
  if (voice.thump.gain > 0.004) {
    var lo = c.createOscillator(); lo.type = "sine";
    lo.frequency.setValueAtTime(voice.thump.f * 1.6, t);
    lo.frequency.exponentialRampToValueAtTime(voice.thump.f, t + 0.05);
    var lg = c.createGain();
    env(lg, t, voice.level * voice.thump.gain * force, 0.004, voice.thump.decay);
    lo.connect(lg); lg.connect(out);
    lo.start(t); lo.stop(t + voice.thump.decay + 0.05);
  }
}

/* the slide: one noise source for the whole travel, shaped by the
   piece's own speed */
function drag(c, t, dur, voice, curve, level) {
  if (!(level > 0.0005) || !(dur > 0.03)) return;
  var src = c.createBufferSource(); src.buffer = noise(c); src.loop = true;
  var bp = c.createBiquadFilter(); bp.type = "bandpass";
  bp.frequency.setValueAtTime(voice.scrape.hz, t);
  bp.Q.setValueAtTime(voice.scrape.q, t);
  var hp = c.createBiquadFilter(); hp.type = "highpass";
  hp.frequency.setValueAtTime(220, t);
  var g = c.createGain();
  var scaled = new Float32Array(curve.length);
  for (var i = 0; i < curve.length; i++) scaled[i] = curve[i] * level;
  g.gain.setValueAtTime(0, t);
  try { g.gain.setValueCurveAtTime(scaled, t, dur); }
  catch (e) { g.gain.setValueAtTime(level * 0.4, t); g.gain.linearRampToValueAtTime(0, t + dur); }
  src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

/* ===================== the room's music =====================

   The pieces are objects, so they are modelled as objects. Everything
   else the room says — a game beginning, a check, a mate, a lesson got
   right — is a signal, and the signals used to be sine beeps. A beep
   can tell you *that* something happened. It cannot tell you how to
   feel about it, which is the whole job of a signal in a game: the same
   two notes that say "check!" when you give it should sound like
   "careful" when it is given to you, and losing a game should sound
   like a friend putting a hand on your shoulder rather than a game
   show buzzer.

   So the signals are music now, and the music is written down as data,
   the way motion.js writes down a gesture: a score per moment (which
   notes, when, how hard, on what instrument), played by a small synth
   into a reverb. Everything a test needs to reason about — the scores,
   the chord maths, the envelopes, the room's impulse response — is a
   pure function that runs in node; only `perform` touches an audio
   context.

   One key for the whole room: D major. Every signal agrees with every
   other one, so a check that lands while the start motif is still
   ringing is a chord rather than a collision, and the room has a home
   note that the endings can come back to. D puts the chimes between
   600 and 2,400 Hz, where a phone speaker is at its best, and keeps the
   felt piano's lowest notes above where small speakers give up. */
var HOME = 62;                       /* D4, as a MIDI note number */
function noteHz(n) { return 440 * Math.pow(2, (HOME + n - 69) / 12); }

/* chords as semitones above a root, so a progression can be written
   the way a musician would say it */
var QUALITY = {
  maj: [0, 4, 7], min: [0, 3, 7], sus2: [0, 2, 7], sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11], add9: [0, 4, 7, 14], min9: [0, 3, 7, 14], fifth: [0, 7]
};
function chord(root, quality) {
  var q = QUALITY[quality] || QUALITY.maj, out = [];
  for (var i = 0; i < q.length; i++) out.push(root + q[i]);
  return out;
}

/* ---------- the instruments ----------
   Four pitched voices and three unpitched ones, all cheap: the most
   expensive note in the room is four sine oscillators and a band of
   noise, and most are two or three.

   marimba  the board's own family — a tuned wooden bar, whose first
            overtone is tuned two octaves up (1 : 4 : 10). A soft mallet
            of filtered noise on the front. The workhorse of every motif.
   felt     a felt-damped upright: whole-number partials stretched a
            hair sharp the way real strings are, the top ones dying
            first, a soft hammer underneath. The harmony. (A fourth
            partial was tried; it cost a quarter of the fanfare's
            oscillators for a difference nobody could hear.)
   chime    two-operator FM at 1 : 3.5, the classic tubular bell. The
            modulation dies away within a quarter of a second, so it
            strikes bright and rings pure — the "ding" of every reward.
   pad      two triangle waves a few cents apart, one in each ear: the
            beating between them is the shimmer, and the split is the
            stereo width, for the price of two oscillators.
   thump    a sine that drops in pitch as it hits, with a few harmonics
            so a phone speaker that cannot play 60 Hz still hears the
            weight. The heartbeat and the big capture.
   air      band-passed noise with a moving centre: the whoosh of a card.
   tick     a click and a tiny ping: the clock, a button, a count.

   `ring` is how long the fundamental takes to fall 60 dB at A440;
   `pitchDecay` makes higher notes die sooner, as they do on every real
   instrument. A partial is [ratio, gain, share of the ring]. */
var TIMBRES = {
  marimba: { type: "struck", level: 0.30, attack: 0.002, ring: 0.62, pitchDecay: 0.55,
             partials: [[1, 1, 1], [3.98, 0.18, 0.24], [9.86, 0.045, 0.08]],
             mallet: { filter: "bandpass", mult: 2.4, q: 1.3, gain: 0.30, len: 0.012 } },
  felt:    { type: "struck", level: 0.24, attack: 0.006, ring: 1.35, pitchDecay: 0.5,
             partials: [[1, 1, 1], [2.003, 0.40, 0.58], [3.009, 0.15, 0.36]],
             mallet: { filter: "lowpass", mult: 2.5, q: 0.7, gain: 0.16, len: 0.022 } },
  chime:   { type: "struck", level: 0.20, attack: 0.0015, ring: 1.45, pitchDecay: 0.3,
             partials: [[1, 1, 1]], fm: { ratio: 3.5, index: 1.25, tau: 0.13, floor: 0.04 } },
  pad:     { type: "held", level: 0.085, wave: "triangle", detune: 6,
             attack: 0.14, decay: 0.32, sustain: 0.72, release: 0.6 },
  thump:   { type: "thump", level: 0.42, attack: 0.003, ring: 0.34, glide: 0.055, from: 1.9,
             partials: [[1, 1, 1], [2, 0.55, 0.6], [3, 0.22, 0.45], [4, 0.08, 0.3]],
             noise: { filter: "lowpass", hz: 190, q: 0.8, gain: 0.5, len: 0.06 } },
  air:     { type: "air", level: 0.11, q: 0.85 },
  tick:    { type: "tick", level: 0.16, ring: 0.04,
             click: { hz: 3300, q: 1.5, gain: 0.9, len: 0.006 } }
};

/* ---------- a note, taken apart into the oscillators that play it ----------
   Every voice is planned before anything is built: a list of
   oscillators and noise bands, each with its own gain envelope as a
   list of [time, value, how-to-get-there] points. Planning it as data
   is what lets the checker prove, in node, that every voice starts
   from silence and comes back to silence before the sting says it is
   over — the two places a synth clicks. */
function percussive(at, attack, peak, ring) {
  peak = Math.max(peak, 1e-5);
  return [[at, 0, "set"], [at + attack, peak, "lin"],
          /* sixty decibels down, then a straight line the last of the
             way, because an exponential can never reach zero and a
             voice cut off above it is a click */
          [at + attack + ring, peak * 0.001, "exp"], [at + attack + ring + 0.015, 0, "lin"]];
}
function eventHz(ev) { return ev.hz || noteHz(ev.n || 0); }
function voicePlan(ev) {
  var tb = TIMBRES[ev.w];
  if (!tb) return [];
  var at = Math.max(0, ev.t || 0), lane = ev.pan || "c";
  var v = clamp(ev.v == null ? 0.7 : ev.v, 0, 1.2);
  var f = eventHz(ev), out = [], i, p, r, peak;
  if (!(v > 0) || !(f > 0)) return [];

  if (tb.type === "struck") {
    var base = clamp(tb.ring * Math.pow(440 / f, tb.pitchDecay) * (ev.ring || 1), 0.03, 3);
    for (i = 0; i < tb.partials.length; i++) {
      p = tb.partials[i];
      if (f * p[0] > 15000) continue;       /* nobody can hear it, so nobody pays for it */
      r = Math.max(0.03, base * p[2]);
      out.push({ k: "osc", wave: "sine", f: f * p[0], lane: lane,
                 fm: i === 0 && tb.fm ? tb.fm : null,
                 pts: percussive(at, tb.attack, tb.level * v * p[1], r) });
    }
    if (tb.mallet) {
      var m = tb.mallet;
      out.push({ k: "noise", filter: m.filter, f: clamp(f * m.mult, 200, 9000), q: m.q, lane: lane,
                 pts: percussive(at, 0.001, tb.level * v * m.gain, m.len) });
    }
  } else if (tb.type === "held") {
    var atk = ev.a || tb.attack, rel = ev.r || tb.release;
    var hold = Math.max(ev.d || 0.4, atk + tb.decay + 0.01);
    peak = Math.max(tb.level * v, 1e-5);
    var sus = peak * tb.sustain;
    /* one oscillator a few cents flat in the left ear, one a few cents
       sharp in the right: the width and the shimmer are the same trick */
    for (i = -1; i <= 1; i += 2) {
      out.push({ k: "osc", wave: tb.wave, f: f * Math.pow(2, i * tb.detune / 1200),
                 lane: i < 0 ? "l" : "r",
                 pts: [[at, 0, "set"], [at + atk, peak, "lin"], [at + atk + tb.decay, sus, "lin"],
                       [at + hold, sus, "lin"], [at + hold + rel, sus * 0.001, "exp"],
                       [at + hold + rel + 0.015, 0, "lin"]] });
    }
  } else if (tb.type === "thump") {
    var r0 = tb.ring * (ev.ring || 1);
    for (i = 0; i < tb.partials.length; i++) {
      p = tb.partials[i];
      out.push({ k: "osc", wave: "sine", f: f * p[0] * tb.from, f2: f * p[0], glide: tb.glide, lane: lane,
                 pts: percussive(at, tb.attack, tb.level * v * p[1], Math.max(0.03, r0 * p[2])) });
    }
    var tn = tb.noise;
    out.push({ k: "noise", filter: tn.filter, f: tn.hz, q: tn.q, lane: lane,
               pts: percussive(at, 0.002, tb.level * v * tn.gain, tn.len) });
  } else if (tb.type === "air") {
    var len = ev.len || 0.25, from = ev.from || 400, to = ev.to || from;
    peak = Math.max(tb.level * v, 1e-5);
    out.push({ k: "noise", filter: "bandpass", f: from, f2: to !== from ? to : 0, glide: len,
               q: tb.q, lane: lane,
               /* a swell rather than a hit: most of it spent arriving */
               pts: [[at, 0, "set"], [at + len * 0.62, peak, "lin"], [at + len, peak * 0.03, "exp"],
                     [at + len + 0.03, 0, "lin"]] });
  } else if (tb.type === "tick") {
    var ck = tb.click;
    out.push({ k: "noise", filter: "bandpass", f: ev.cut || ck.hz, q: ck.q, lane: lane,
               pts: percussive(at, 0.0008, tb.level * v * ck.gain, ck.len) });
    out.push({ k: "osc", wave: "sine", f: f, lane: lane,
               pts: percussive(at, 0.001, tb.level * v * 0.6, tb.ring * (ev.ring || 1)) });
  }
  for (i = 0; i < out.length; i++) out[i].end = out[i].pts[out[i].pts.length - 1][0];
  return out;
}
/* when the last thing an event plays has gone quiet */
function eventEnd(ev) {
  var a = voicePlan(ev), end = ev.t || 0;
  for (var i = 0; i < a.length; i++) if (a[i].end > end) end = a[i].end;
  return end;
}

/* ---------- the room ----------
   A reverb is what turns a set of oscillators into instruments in a
   place. A real room's impulse response is, to a very good
   approximation, noise that decays exponentially and loses its top end
   faster than its bottom (air and soft furnishings soak up the highs
   first), after a short gap while the first reflection is still on its
   way. So that is what this grows, from a seeded generator, once per
   audio context: no recording, nothing to download, the same room on
   every device. A different seed per ear is what makes it wide. */
var REVERB = { seconds: 2.4, rt60: 2.0, predelay: 0.014, bright: 6000, dark: 1.1, wet: 1.6, seed: 1789 };
function seeded(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function impulseResponse(sampleRate, o) {
  o = o || {};
  var sr = sampleRate || 44100;
  var secs = o.seconds || REVERB.seconds, rt = o.rt60 || REVERB.rt60;
  var bright = o.bright || REVERB.bright, dark = o.dark || REVERB.dark;
  var n = Math.max(64, Math.round(sr * secs));
  var p0 = Math.min(n - 32, Math.round(sr * (o.predelay == null ? REVERB.predelay : o.predelay)));
  var fadeIn = Math.max(1, Math.round(sr * 0.003)), fadeOut = Math.round(n * 0.12);
  var out = [], energy = 0, ch, i;
  /* sixty decibels down at rt60, as a per-sample multiplier so a phone
     is not asked for a quarter of a million exponentials */
  var fall = Math.exp(-6.9078 / (rt * sr));
  for (ch = 0; ch < 2; ch++) {
    var d = new Float32Array(n), r = seeded((o.seed || REVERB.seed) + ch * 7919);
    var lp = 0, amp = 1, coef = 0;
    for (i = p0; i < n; i++) {
      /* the lowpass closes as the tail goes on: a dark tail is a warm
         room, a bright one is a bathroom. Moving it every 64 samples
         is far finer than anybody can hear. */
      if (((i - p0) & 63) === 0) {
        var cut = Math.min(bright * Math.exp(-(i - p0) / sr * dark) + 500, sr * 0.45);
        coef = 1 - Math.exp(-2 * Math.PI * cut / sr);
      }
      lp += coef * ((r() * 2 - 1) - lp);
      amp *= fall;
      var k = i - p0 < fadeIn ? (i - p0) / fadeIn : 1;
      if (i >= n - fadeOut) k *= 0.5 - 0.5 * Math.cos(Math.PI * (n - 1 - i) / fadeOut);
      d[i] = lp * amp * k;
      energy += d[i] * d[i];
    }
    out.push(d);
  }
  /* the same energy whatever the sample rate, so the room is as loud
     on a 48k phone as on a 44.1k laptop */
  var scale = Math.sqrt((o.energy || 1) / (energy / 2 || 1));
  for (ch = 0; ch < 2; ch++) for (i = 0; i < n; i++) out[ch][i] *= scale;
  return out;
}

/* ---------- the scores ----------
   Times are seconds from the moment the sting is asked for; notes are
   semitones above the room's D4. A note marked `fl` is a flourish — a
   sparkle on top that the moment does not need — and is dropped for
   anybody who has asked their device for less motion, along with every
   sweep. The harmony stays; the glitter goes. */
var EVENT_KEYS = ["pan", "fl", "d", "a", "r", "ring", "hz", "from", "to", "len", "cut"];
function N(s, t, w, n, v, o) {
  var e = { t: t, w: w, n: n, v: v, pan: "c" };
  if (o) for (var i = 0; i < EVENT_KEYS.length; i++) if (o[EVENT_KEYS[i]] != null) e[EVENT_KEYS[i]] = o[EVENT_KEYS[i]];
  s.push(e);
  return s;
}
/* a chord, optionally rolled the way a hand spreads one on a piano */
function CH(s, t, w, notes, v, o) {
  var strum = (o && o.strum) || 0;
  for (var i = 0; i < notes.length; i++) N(s, t + i * strum, w, notes[i], v, o);
  return s;
}
/* a run, getting louder as it climbs; `sway` walks it across the
   stereo field and brings the last note home to the middle */
function RUN(s, t, step, w, notes, v0, v1, o) {
  for (var i = 0; i < notes.length; i++) {
    var f = notes.length > 1 ? i / (notes.length - 1) : 1;
    var pan = o && o.sway ? (i === notes.length - 1 ? "c" : (i % 2 ? "r" : "l")) : ((o && o.pan) || "c");
    var e = {}; if (o) for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) e[k] = o[k];
    e.pan = pan;
    N(s, t + i * step, w, notes[i], v0 + (v1 - v0) * f, e);
  }
  return s;
}
function pieceName(p) {
  if (typeof p === "number") return KIND[p < 0 ? -p : p] || "";
  p = String(p || "").toLowerCase();
  var letter = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
  return letter[p] || p;
}

/* Each sting promises a length: when the last of it, reverb tail and
   all, has fallen silent. The checker holds it to that. */
var STINGS = {
  /* a game begins: up the chord and out, quick and bright */
  start: { len: 4.0, send: 0.22, gain: 1, score: function (s) {
    RUN(s, 0, 0.065, "marimba", [7, 12, 16], 0.5, 0.66, { sway: true });
    CH(s, 0.2, "chime", [19, 24], 0.48);
    N(s, 0.2, "marimba", 24, 0.55);
    CH(s, 0.2, "felt", [0, 7], 0.3, { ring: 0.7 });
    N(s, 0.34, "chime", 31, 0.24, { fl: true, pan: "r" });
  } },

  /* Check is two beats with the weight on the second. Given, it rises
     a fourth to the A — open, unresolved, a question put to the other
     side. Received, the same two beats turn round to face you: lower,
     falling, borrowed from the minor so it reads as "careful" rather
     than "wrong", with a soft pulse under it. Never a siren. */
  check: { len: 4.2, send: 0.14, gain: 1, score: function (s, o) {
    if (o.against) {
      N(s, 0, "thump", 0, 0.28, { hz: 82, ring: 0.6 });
      N(s, 0, "felt", 8, 0.5); N(s, 0, "marimba", 8, 0.34);
      N(s, 0.15, "felt", 5, 0.58); N(s, 0.15, "marimba", 5, 0.4);
      N(s, 0.15, "felt", -12, 0.3, { ring: 0.6 });
    } else {
      N(s, 0, "marimba", 14, 0.5); N(s, 0, "chime", 14, 0.36);
      N(s, 0.1, "marimba", 19, 0.6); N(s, 0.1, "chime", 19, 0.62);
      N(s, 0.1, "felt", 7, 0.26, { ring: 0.7 });
    }
  } },

  /* a queen or a rook coming off the board deserves to be felt as well
     as heard: a drop in pitch through the floor, and a low string
     under it. Laid under the capture by Sound.move itself. */
  "capture-big": { len: 3.6, send: 0.12, gain: 1, score: function (s, o) {
    var q = pieceName(o.piece) !== "rook";
    N(s, 0, "thump", 0, q ? 0.95 : 0.8, { hz: q ? 52 : 64, ring: q ? 1.35 : 1 });
    N(s, 0.004, "felt", q ? -24 : -19, q ? 0.5 : 0.42, { ring: 0.32 });
    N(s, 0.004, "felt", q ? -12 : -7, 0.22, { ring: 0.3 });
  } },

  /* A promotion is the only move in chess where a piece becomes a
     different piece, so each one arrives with its own figure: the
     queen climbs the whole chord, the rook goes up in straight fifths,
     the bishop on a slant of stacked fourths, and the knight's
     arpeggio jumps, steps sideways, and jumps again. */
  promote: { len: 4.0, send: 0.34, gain: 1, score: function (s, o) {
    var k = pieceName(o.piece || 5);
    var notes = k === "rook" ? [12, 19, 24, 31] : k === "bishop" ? [12, 16, 21, 26]
              : k === "knight" ? [12, 19, 17, 24] : [12, 16, 19, 24, 28];
    var step = 0.055, top = step * notes.length;
    RUN(s, 0, step, "chime", notes, 0.42, 0.7, { sway: true });
    CH(s, 0, "pad", [0, 7, 12, 16], 0.55, { a: 0.22, d: 0.5 });
    CH(s, top, "felt", [0, 7, 12], 0.3, { strum: 0.015, ring: 0.7 });
    if (k !== "rook" && k !== "bishop" && k !== "knight") N(s, top + 0.05, "chime", 31, 0.4, { fl: true, pan: "r" });
  } },

  /* The real thing. The call — three quick notes on the dominant, the
     way fanfares have started since the hunting horn — then I, IV, V,
     with the tune climbing a step on each chord, and the arrival: the
     home chord spread across four octaves, a low weight under it and
     bells over it. About two seconds of music before the room rings. */
  "mate-win": { len: 5.7, send: 0.3, gain: 1, score: function (s) {
    RUN(s, 0, 0.09, "marimba", [7, 7, 7], 0.48, 0.62);
    var at = [0.3, 0.62, 0.94];
    var chords = [[-12, 4, 7, 12], [-19, 5, 9, 12], [-17, 7, 11, 14]];
    var tune = [19, 21, 23];
    for (var i = 0; i < 3; i++) {
      CH(s, at[i], "felt", chords[i], 0.44, { strum: 0.01, ring: 0.35 });
      N(s, at[i], "chime", tune[i], 0.58);
      N(s, at[i], "marimba", tune[i], 0.38);
    }
    var b = 1.3;
    N(s, b, "thump", 0, 0.5, { hz: 73.4, ring: 1.6 });
    CH(s, b, "felt", [-24, -12, 4, 7, 14, 16], 0.48, { strum: 0.022, ring: 0.55 });
    N(s, b, "chime", 24, 0.75);
    N(s, b, "marimba", 24, 0.5);
    CH(s, b - 0.05, "pad", [-12, 0, 7, 16], 0.85, { a: 0.18, d: 0.95, r: 0.8 });
    N(s, b + 0.16, "chime", 31, 0.42, { fl: true, pan: "l" });
    N(s, b + 0.28, "chime", 36, 0.32, { fl: true, pan: "r" });
    N(s, b + 0.42, "chime", 28, 0.28, { fl: true });
  } },

  /* Being mated is the moment the room most needs to be kind. B minor
     admits it; G major with its seventh softens it; D, with the tune
     rising to the ninth, is home — and the next game starts from home.
     Slow, rolled, and quieter than the win. Never a sad trombone. */
  "mate-lose": { len: 5.5, send: 0.3, gain: 0.9, score: function (s) {
    CH(s, 0, "felt", [-15, 0, 4, 11], 0.38, { strum: 0.03, ring: 0.6 });
    CH(s, 0, "pad", [-3, 0, 4], 0.42, { a: 0.2, d: 0.5 });
    CH(s, 0.62, "felt", [-19, 0, 4, 9], 0.38, { strum: 0.03, ring: 0.6 });
    CH(s, 0.62, "pad", [-7, -3, 0], 0.42, { a: 0.2, d: 0.5 });
    CH(s, 1.24, "felt", [-12, 4, 7, 14], 0.42, { strum: 0.035, ring: 0.7 });
    CH(s, 1.24, "pad", [-12, -5, 4], 0.46, { a: 0.22, d: 0.7, r: 0.8 });
    N(s, 1.42, "chime", 19, 0.22, { fl: true });
  } },

  /* a game won some other way — on time, by resignation */
  win: { len: 4.0, send: 0.24, gain: 1, score: function (s) {
    RUN(s, 0, 0.1, "marimba", [12, 16, 19], 0.55, 0.68, { sway: true });
    N(s, 0.32, "chime", 24, 0.62);
    N(s, 0.32, "marimba", 24, 0.5);
    CH(s, 0.32, "felt", [-12, 4, 7, 12], 0.38, { strum: 0.012, ring: 0.45 });
    CH(s, 0.3, "pad", [0, 7, 16], 0.5, { d: 0.4 });
  } },

  /* a gentle step down to a soft home chord */
  lose: { len: 4.4, send: 0.26, gain: 0.85, score: function (s) {
    N(s, 0, "felt", 7, 0.44);
    N(s, 0.2, "felt", 4, 0.42);
    CH(s, 0.42, "felt", [-12, -5, 2, 4], 0.36, { strum: 0.025, ring: 0.6 });
    CH(s, 0.4, "pad", [-12, -5, 4], 0.45, { a: 0.2, d: 0.5 });
  } },

  /* two halves of equal weight: an open chord that could go either
     way, and the same chord settled — the E falls to D and the third
     fills in. Nobody won and nothing is left hanging. */
  draw: { len: 4.3, send: 0.24, gain: 0.8, score: function (s) {
    CH(s, 0, "felt", [-12, 7, 14], 0.42, { strum: 0.012, ring: 0.5 });
    N(s, 0, "marimba", 14, 0.36);
    CH(s, 0.36, "felt", [-12, 4, 7, 12], 0.42, { strum: 0.012, ring: 0.6 });
    N(s, 0.36, "marimba", 12, 0.36);
    CH(s, 0.34, "pad", [-12, 7, 12], 0.45, { d: 0.45 });
  } },

  /* a soft glint up high, with plenty of room around it */
  hint: { len: 3.8, send: 0.45, gain: 0.85, score: function (s) {
    N(s, 0, "chime", 19, 0.5);
    N(s, 0.07, "chime", 26, 0.36, { pan: "r" });
    N(s, 0.14, "chime", 31, 0.24, { pan: "l", fl: true });
    CH(s, 0, "pad", [12, 19], 0.28, { a: 0.08, d: 0.25 });
  } },

  /* dominant to tonic is the most resolved two notes in music, which
     is exactly what "yes, that's it" should sound like */
  "lesson-right": { len: 3.8, send: 0.22, gain: 1, score: function (s) {
    N(s, 0, "chime", 19, 0.46); N(s, 0, "marimba", 19, 0.4);
    N(s, 0.085, "chime", 24, 0.74); N(s, 0.085, "marimba", 24, 0.5);
  } },

  /* An open fifth, low and short: neither major nor minor, so it
     carries no verdict at all — just "not that one". A wrong answer in
     a lesson is how a lesson works, and must never sound like a
     punishment. */
  "lesson-wrong": { len: 3.4, send: 0.12, gain: 0.65, score: function (s) {
    CH(s, 0, "felt", [-5, 2], 0.42, { ring: 0.45 });
    N(s, 0, "marimba", -5, 0.2, { ring: 0.6 });
  } },

  /* ta-da: two quick pick-up notes and the chord */
  "lesson-done": { len: 4.0, send: 0.28, gain: 1, score: function (s) {
    N(s, 0, "marimba", 7, 0.46, { ring: 0.4 });
    N(s, 0.1, "marimba", 7, 0.52, { ring: 0.4 });
    var b = 0.22;
    N(s, b, "chime", 24, 0.66); N(s, b, "marimba", 24, 0.5);
    CH(s, b, "felt", [-12, 4, 7, 12, 16], 0.4, { strum: 0.014, ring: 0.5 });
    CH(s, b - 0.02, "pad", [0, 7, 16], 0.55, { d: 0.5 });
    N(s, b + 0.14, "chime", 28, 0.38, { fl: true, pan: "r" });
    N(s, b + 0.26, "chime", 31, 0.3, { fl: true, pan: "l" });
  } },

  /* nine chimes up two octaves of the pentatonic, which has no wrong
     notes in it, so however fast it goes it sparkles rather than smears */
  levelup: { len: 4.1, send: 0.34, gain: 1, score: function (s) {
    RUN(s, 0, 0.042, "chime", [12, 14, 16, 19, 21, 24, 26, 28, 31], 0.3, 0.62, { sway: true });
    CH(s, 0, "pad", [0, 7, 12, 16], 0.5, { a: 0.3, d: 0.5 });
    CH(s, 0.38, "felt", [-12, 7, 12, 16], 0.38, { strum: 0.012, ring: 0.5 });
    N(s, 0.46, "chime", 36, 0.3, { fl: true });
  } },

  /* the rating moving: up is a quick bright arpeggio; down is one soft
     step home — information, not a scolding */
  "rating-up": { len: 3.9, send: 0.2, gain: 0.9, score: function (s) {
    RUN(s, 0, 0.07, "marimba", [12, 16, 19], 0.42, 0.56);
    N(s, 0.14, "chime", 19, 0.34);
    N(s, 0.24, "chime", 24, 0.2, { fl: true });
  } },
  "rating-down": { len: 3.7, send: 0.2, gain: 0.8, score: function (s) {
    N(s, 0, "felt", 14, 0.36, { ring: 0.6 });
    N(s, 0.16, "felt", 12, 0.34, { ring: 0.7 });
    N(s, 0.16, "felt", 0, 0.18, { ring: 0.6 });
  } },

  /* A milestone rings like a tower: down the bells and back up, then
     the whole chord at once with the low weight under it and bells
     spilling over the top. Bigger than anything else in the room. */
  milestone: { len: 5.1, send: 0.36, gain: 1, score: function (s) {
    RUN(s, 0, 0.1, "chime", [24, 19, 16, 12], 0.46, 0.5, { sway: true });
    RUN(s, 0.42, 0.05, "marimba", [12, 16, 19, 24, 28], 0.45, 0.65, { sway: true });
    var b = 0.72;
    N(s, b, "thump", 0, 0.45, { hz: 73.4, ring: 1.4 });
    CH(s, b, "felt", [-24, -12, 4, 7, 14, 16], 0.48, { strum: 0.02, ring: 0.55 });
    CH(s, b, "chime", [24, 31], 0.5);
    CH(s, b - 0.05, "pad", [-12, 0, 7, 16], 0.8, { a: 0.16, d: 1.0, r: 0.8 });
    N(s, b + 0.18, "chime", 36, 0.32, { fl: true, pan: "r" });
    N(s, b + 0.34, "chime", 33, 0.28, { fl: true, pan: "l" });
    N(s, b + 0.5, "chime", 40, 0.2, { fl: true });
  } },

  /* a button: barely there, and dry — a room echo on every tap would
     be the room talking over you */
  tap: { len: 0.15, send: 0, gain: 0.7, score: function (s) {
    N(s, 0, "tick", 0, 0.55, { hz: 1320, ring: 0.8, cut: 2400 });
  } },
  /* a card arriving is air moving, rising into one quiet note */
  open: { len: 3.4, send: 0.2, gain: 0.9, score: function (s, o) {
    if (o.reduced) { N(s, 0, "air", 0, 0.45, { from: 900, len: 0.12 }); N(s, 0.04, "chime", 19, 0.14, { ring: 0.5 }); return; }
    N(s, 0, "air", 0, 0.7, { from: 380, to: 2200, len: 0.26 });
    N(s, 0.2, "chime", 19, 0.14, { ring: 0.5 });
  } },
  close: { len: 3.1, send: 0.12, gain: 0.85, score: function (s, o) {
    if (o.reduced) { N(s, 0, "air", 0, 0.36, { from: 700, len: 0.1 }); return; }
    N(s, 0, "air", 0, 0.55, { from: 1800, to: 420, len: 0.2 });
    N(s, 0.16, "marimba", 0, 0.14, { ring: 0.5 });
  } },

  /* The last seconds on a clock: a heartbeat rather than an alarm.
     `left` is the seconds remaining; as it runs down the second beat
     comes sooner and the whole thing sits a little higher and harder,
     the way your own does. Dry, so one beat never smears into the next. */
  "low-time": { len: 0.5, send: 0, gain: 1, score: function (s, o) {
    var left = o.left == null ? 5 : clamp(+o.left || 0, 0, 10), u = 1 - left / 10;
    N(s, 0, "thump", 0, 0.62 + 0.3 * u, { hz: 64 + 10 * u, ring: 0.55 });
    N(s, 0.2 - 0.05 * u, "thump", 0, 0.42 + 0.22 * u, { hz: 58 + 8 * u, ring: 0.5 });
  } },
  /* the clock: tick and tock a third apart, like a real escapement */
  tick: { len: 0.15, send: 0, gain: 0.8, score: function (s, o) {
    N(s, 0, "tick", 0, 0.5, { hz: o.tock ? 1568 : 1976 });
  } },

  /* two devices finding each other: one note from each side, then
     both together in the middle */
  link: { len: 3.9, send: 0.3, gain: 0.95, score: function (s) {
    N(s, 0, "chime", 12, 0.5, { pan: "l" }); N(s, 0, "marimba", 12, 0.34, { pan: "l" });
    N(s, 0.13, "chime", 19, 0.5, { pan: "r" }); N(s, 0.13, "marimba", 19, 0.34, { pan: "r" });
    N(s, 0.28, "chime", 24, 0.55);
    CH(s, 0.28, "felt", [0, 7, 12], 0.28, { ring: 0.6 });
    N(s, 0.4, "chime", 31, 0.2, { fl: true });
  } },

  /* one step of a number counting (see countTick) */
  count: { len: 0.15, send: 0, gain: 0.7, score: function (s, o) {
    var n = +o.n || 0, f = n > 0 ? clamp((+o.i || 0) / n, 0, 1) : 1;
    N(s, 0, "tick", 0, 0.28 + 0.14 * f, { hz: countTickPitch(o.i, o.n, o.up), ring: 0.8, cut: 2600 });
  } }
};
var STING_KINDS = Object.keys(STINGS);

/* A number counting up walks up the pentatonic from D5, two octaves
   over the whole count, so you can hear how far through it is; a
   number counting down walks down. Quantised to the scale rather than
   gliding, because a glide is a siren and a scale is a tune. */
var COUNT_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
function countTickPitch(i, n, up) {
  n = +n || 0;
  var f = n > 0 ? clamp((+i || 0) / n, 0, 1) : 1;
  if (up === false) f = 1 - f;
  return noteHz(12 + COUNT_STEPS[Math.round(f * (COUNT_STEPS.length - 1))]);
}

/* the whole of one sting, ready to be played or checked */
function score(kind, opts) {
  var st = STINGS[kind];
  if (!st) return null;
  var o = opts || {}, list = [];
  st.score(list, o);
  if (o.reduced) list = list.filter(function (e) { return !e.fl; });
  list.sort(function (a, b) { return a.t - b.t; });
  return { kind: kind, len: st.len, gain: st.gain,
           send: o.send != null ? clamp(+o.send || 0, 0, st.send) : st.send,
           events: list };
}
/* when the last dry voice of a sting has stopped; the reverb, if it
   has any, rings on for REVERB.seconds after that */
function dryEnd(sc) {
  var end = 0;
  for (var i = 0; sc && i < sc.events.length; i++) end = Math.max(end, eventEnd(sc.events[i]));
  return end;
}

/* ---------- playing it ----------
   Everything below here needs an audio context; everything above it
   is arithmetic. */
var room = null;                 /* the reverb: built once per context, on first use */
var live = [];                   /* end times of the voices still sounding */
var outs = [];                   /* each sting's own output, so a mute can fade them */
var lastSting = {}, lastCount = -1, tockNow = false, reducedPref = null, growing = false;
/* a phone can play a great many oscillators, but not an unlimited
   number; past this the sparkles are the first thing to go */
var MAX_LIVE = 140;
/* how far the panned lanes sit from the middle, and the little they
   are lifted to make up for equal-power panning putting less in each
   ear than a centred note does */
var WIDTH = 0.55, LANE_TRIM = 1.3;

/* The room's echo, grown on first use (or earlier, at an idle moment
   after wake). Growing it is the one expensive thing in this file —
   a few tens of milliseconds the first time — so it happens once per
   context and never again. */
function verb(c) {
  if (room && room.ctx === c) return room.node;
  room = { ctx: c, node: null };
  try {
    var ir = impulseResponse(c.sampleRate);
    var buf = c.createBuffer(2, ir[0].length, c.sampleRate);
    buf.getChannelData(0).set(ir[0]);
    buf.getChannelData(1).set(ir[1]);
    var conv = c.createConvolver();
    /* the room is already normalised, and the browser's own guess at
       it differs between engines */
    conv.normalize = false;
    conv.buffer = buf;
    var wet = c.createGain();
    wet.gain.value = REVERB.wet;
    conv.connect(wet); wet.connect(master);
    room.node = conv;
  } catch (e) { room.node = null; /* a room without an echo is still a room */ }
  return room.node;
}

function applyPts(param, pts, t0, scale) {
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i], when = t0 + p[0], v = p[1] * scale;
    if (p[2] === "set") param.setValueAtTime(v, when);
    else if (p[2] === "exp") param.exponentialRampToValueAtTime(Math.max(v, 1e-6), when);
    else param.linearRampToValueAtTime(v, when);
  }
}
/* one planned voice, made real */
function build(c, a, t0, dest, tune, vel) {
  var T = t0 + a.pts[0][0], end = t0 + a.end + 0.02, src;
  var g = c.createGain();
  g.gain.value = 0;
  applyPts(g.gain, a.pts, t0, vel);
  if (a.k === "osc") {
    src = c.createOscillator();
    src.type = a.wave;
    src.frequency.setValueAtTime(a.f * tune, T);
    if (a.f2) src.frequency.exponentialRampToValueAtTime(a.f2 * tune, T + a.glide);
    if (a.fm) {
      /* the bell: a second oscillator wobbling the first one's pitch,
         hard at the strike and dying away, which is what makes it go
         from a clang to a ring */
      var mo = c.createOscillator(), mg = c.createGain();
      var dev = a.fm.index * a.f * a.fm.ratio;
      mo.frequency.setValueAtTime(a.f * a.fm.ratio * tune, T);
      mg.gain.setValueAtTime(dev, T);
      mg.gain.setTargetAtTime(dev * a.fm.floor, T + 0.002, a.fm.tau);
      mo.connect(mg); mg.connect(src.frequency);
      mo.start(T); mo.stop(end);
    }
    src.connect(g);
  } else {
    src = c.createBufferSource();
    src.buffer = noise(c); src.loop = true;
    var fl = c.createBiquadFilter();
    fl.type = a.filter;
    fl.frequency.setValueAtTime(a.f, T);
    fl.Q.setValueAtTime(a.q, T);
    if (a.f2) fl.frequency.exponentialRampToValueAtTime(a.f2, T + a.glide);
    src.connect(fl); fl.connect(g);
  }
  g.connect(dest);
  if (a.k === "osc") src.start(T); else src.start(T, Math.random() * 0.4);
  src.stop(end);
  return end;
}

/* Play a score, starting at t0 on the audio clock. Each sting gets its
   own output (so a mute can fade it, and so its reverb send is its
   own), panned lanes made only if a note asks for one, and everything
   ends in the master compressor the pieces use. Returns the length the
   score promised. */
function perform(c, sc, t0) {
  if (!sc || !sc.events.length) return 0;
  var now = c.currentTime, i, j;
  live = live.filter(function (e) { return e > now; });
  outs = outs.filter(function (o) { return o.end > now; });

  var out = c.createGain();
  out.gain.value = sc.gain;
  out.connect(master);
  if (sc.send > 0) {
    var rv = verb(c);
    if (rv) { var s = c.createGain(); s.gain.value = sc.send; out.connect(s); s.connect(rv); }
  }
  outs.push({ g: out, end: t0 + sc.len });

  var lanes = { c: out };
  function lane(id) {
    if (lanes[id]) return lanes[id];
    var trim = c.createGain(), pan = null;
    trim.gain.value = LANE_TRIM;
    try { if (c.createStereoPanner) { pan = c.createStereoPanner(); pan.pan.value = id === "l" ? -WIDTH : WIDTH; } }
    catch (e) { pan = null; }
    /* no panner (old Safari): the note still plays, just in the middle */
    if (pan) { trim.connect(pan); pan.connect(out); } else { trim.gain.value = 1; trim.connect(out); }
    lanes[id] = trim;
    return trim;
  }

  /* plan everything first, so a busy room can drop the sparkles before
     it drops a note of the tune */
  var plans = [], total = 0;
  for (i = 0; i < sc.events.length; i++) {
    var vp = voicePlan(sc.events[i]);
    plans.push(vp); total += vp.length;
  }
  var budget = MAX_LIVE - live.length;
  var thin = total > budget;
  for (i = 0; i < plans.length; i++) {
    if (thin && sc.events[i].fl) continue;
    if (plans[i].length > budget) continue;
    budget -= plans[i].length;
    /* a hair of difference every time — two cents and a few percent of
       velocity — so the same sting twice sounds played rather than
       pasted */
    var tune = 1 + (Math.random() - 0.5) * 0.0024, vel = 1 - Math.random() * 0.06;
    for (j = 0; j < plans[i].length; j++) {
      var a = plans[i][j];
      live.push(build(c, a, t0, lane(a.lane === "l" || a.lane === "r" ? a.lane : "c"), tune, vel));
    }
  }
  return sc.len;
}
/* a mute fades what is already playing rather than letting a fanfare
   finish over somebody who has just asked for quiet */
function hush(c) {
  if (!c) return;
  var now = c.currentTime;
  for (var i = 0; i < outs.length; i++) {
    if (outs[i].end <= now) continue;
    var p = outs[i].g.gain;
    try {
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0, now + 0.08);
    } catch (e) {}
  }
  outs = []; live = [];
}

function reducedNow() {
  if (reducedPref != null) return reducedPref;
  try {
    return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) { return false; }
}

/* ---------- the room tone ----------
   Off unless asked for. A room with nobody talking in it is not
   silent: there is a low wash of air and, here, a slow two-note pad
   that breathes about once every twenty seconds. Turned up, it sits
   just above the threshold of noticing; turned off, every node is
   stopped and let go, so it costs nothing at all. */
var amb = null, ambLevel = 0, AMB_GAIN = 0.06;
function ambStart(c) {
  var now = c.currentTime, a = { ctx: c, srcs: [] };
  a.g = c.createGain();
  a.g.gain.setValueAtTime(0, now);
  a.g.connect(master);
  /* the air: noise with everything above a murmur taken out */
  var n = c.createBufferSource(); n.buffer = noise(c); n.loop = true;
  var lp = c.createBiquadFilter(); lp.type = "lowpass";
  lp.frequency.setValueAtTime(320, now); lp.Q.setValueAtTime(0.5, now);
  var ng = c.createGain(); ng.gain.value = 0.6;
  n.connect(lp); lp.connect(ng); ng.connect(a.g);
  /* the pad: D and A, very low, the A a breath sharp so the two of
     them drift in and out of each other */
  var pg = c.createGain(); pg.gain.value = 0.22;
  var lfo = c.createOscillator(), lg = c.createGain();
  lfo.frequency.setValueAtTime(0.05, now); lg.gain.value = 0.09;
  lfo.connect(lg); lg.connect(pg.gain);
  var o1 = c.createOscillator(); o1.type = "triangle"; o1.frequency.setValueAtTime(noteHz(-24), now);
  var o2 = c.createOscillator(); o2.type = "sine"; o2.frequency.setValueAtTime(noteHz(-17) + 0.13, now);
  o1.connect(pg); o2.connect(pg); pg.connect(a.g);
  [n, lfo, o1, o2].forEach(function (s) { s.start(now); a.srcs.push(s); });
  /* when the last source stops, let go of the output too */
  o2.onended = function () { try { a.g.disconnect(); } catch (e) {} };
  return a;
}
function ambStop() {
  if (!amb) return;
  var a = amb, c = a.ctx, now = c.currentTime;
  amb = null;
  try {
    a.g.gain.cancelScheduledValues(now);
    a.g.gain.setValueAtTime(a.g.gain.value, now);
    a.g.gain.setTargetAtTime(0, now, 0.12);
    for (var i = 0; i < a.srcs.length; i++) a.srcs[i].stop(now + 0.9);
  } catch (e) {}
}

/* ================= what the room asks for ================= */
var Sound = {
  MATERIALS: MATERIALS, PIECES: PIECES, KIND: KIND,
  voiceFor: voiceFor, surfaceOf: surfaceOf, materialOf: materialOf,
  frictionCurve: frictionCurve, frictionLevel: frictionLevel, flashPeak: flashPeak,
  /* the music, as data: pure, so the checker can read the scores in
     node before it ever renders one */
  HOME: HOME, QUALITY: QUALITY, TIMBRES: TIMBRES, STINGS: STINGS, STING_KINDS: STING_KINDS,
  REVERB: REVERB, noteHz: noteHz, chord: chord, score: score, voicePlan: voicePlan,
  eventEnd: eventEnd, dryEnd: dryEnd, impulseResponse: impulseResponse,
  countTickPitch: countTickPitch,

  /* Point the whole synth at a context somebody else made. The only
     caller is chess/tools/sound-check.js, which renders moves into an
     OfflineAudioContext and measures the samples that come out — there
     is no way to test a sound except to listen to it, and a machine
     listens by looking. */
  useContext: function (c) {
    AC = c; noiseBuf = null;
    master = buildChain(c);
    room = null; live = []; outs = []; lastSting = {}; lastCount = -1; amb = null;
    return master;
  },

  /* Off means off for everything: the pieces, the music already
     playing (faded, not cut), and the room tone. Back on, the room tone
     comes back at the level it was left at. */
  enable: function (v) {
    var was = on;
    on = !!v;
    if (was && !on) { hush(AC); ambStop(); }
    if (!was && on && ambLevel > 0) Sound.ambience(ambLevel);
  },
  enabled: function () { return on; },
  /* Less motion asked for means fewer sparkles and no sweeps; the
     harmony of every moment stays. Follows the system setting unless
     told otherwise (null goes back to following it). */
  setReduced: function (v) { reducedPref = v == null ? null : !!v; },
  /* calling this inside a click is what lets the browser start the
     audio clock at all — and it is the moment to grow the room, at the
     next idle moment rather than in the middle of the first fanfare */
  wake: function () {
    var c = ctx();
    if (c && !(room && room.ctx === c) && !growing) {
      growing = true;
      var later = typeof root.requestIdleCallback === "function"
        ? function (f) { root.requestIdleCallback(f, { timeout: 1500 }); }
        : function (f) { setTimeout(f, 400); };
      later(function () { growing = false; if (AC === c) { try { verb(c); } catch (e) {} } });
    }
  },
  setSkin: function (skin) {
    skinNow = skin;
    materialNow = materialOf(skin);
    surfaceNow = surfaceOf(skin);
  },
  voice: function (piece) { return voiceFor(materialNow, kindName(piece), surfaceNow); },

  /* The whole move, scheduled in one go off the same plan the renderer
     is animating. Both are measured from the moment this is called, on
     clocks that do not drift apart, so the sound of a piece landing is
     the sound of that piece landing rather than a timer that hopes. */
  move: function (m, plan, o) {
    if (!on || !m || !plan) return;
    var c = ctx(); if (!c) return;
    o = o || {};
    var t0 = c.currentTime + 0.004;
    var secs = plan.dur / 1000;
    var voice = voiceFor(materialNow, kindName(m.piece), surfaceNow);

    /* the drag, for as long as the piece is on the board */
    if (secs > 0.05) {
      drag(c, t0, secs * plan.travel, voice, frictionCurve(plan, 48), frictionLevel(voice, plan));
      /* and the scuff of picking it up, for the piece that is lifted */
      if (plan.lift > AIRBORNE * 2 && voice.lift.gain > 0.002) {
        var ls = c.createBufferSource(); ls.buffer = noise(c); ls.loop = true;
        var lf = c.createBiquadFilter(); lf.type = "bandpass";
        lf.frequency.setValueAtTime(voice.lift.hz, t0); lf.Q.setValueAtTime(0.9, t0);
        var lg = c.createGain(); env(lg, t0, voice.lift.gain, 0.004, 0.045);
        ls.connect(lf); lf.connect(lg); lg.connect(master);
        ls.start(t0); ls.stop(t0 + 0.09);
      }
    }

    /* whatever was taken, hitting the board on its side. It is struck
       first and lands before the mover does, which is the order you
       hear it in over a real board. */
    if (o.captured) {
      var cv = voiceFor(materialNow, kindName(o.captured), surfaceNow);
      var tc = t0 + secs * plan.toppleFor * 0.16;
      strike(c, tc, cv, 0.55);                                  /* the knock */
      strike(c, t0 + secs * plan.toppleFor * 0.66, cv, 0.80);   /* going over */
      /* and if it was a queen or a rook, the floor feels it, at the
         moment the taker lands on the square */
      var big = kindName(o.captured);
      if ((big === "queen" || big === "rook") && o.big !== false) {
        perform(c, score("capture-big", { piece: big, reduced: reducedNow() }), t0 + secs * plan.travel);
      }
    }

    /* the rook of a castle has its own weight and its own moment */
    if (m.rookFrom != null) {
      var rv = voiceFor(materialNow, "rook", surfaceNow);
      drag(c, t0 + secs * plan.rookIn, secs * (plan.rookOut - plan.rookIn), rv,
           frictionCurve({ travel: 1, dur: plan.dur, lift: 0, ease: "glide",
                           rise: 0.4, fall: 0.4, settle: 0, bank: 0, dist: 2 }, 32),
           frictionLevel(rv, { dist: 2.6 }));
      strike(c, t0 + secs * plan.rookOut, rv, 0.85);
    }

    /* the mover arriving */
    if (m.promo) {
      /* the pawn never lands: it becomes something else. The new piece
         rings in on the flash, in its own voice, and its own figure
         shimmers up out of it. */
      var nv = voiceFor(materialNow, kindName(m.promo), surfaceNow);
      var tf = t0 + secs * flashPeak(plan);
      strike(c, tf, nv, 1.15);
      if (o.ceremony !== false) perform(c, score("promote", { piece: m.promo, reduced: reducedNow() }), tf);
    } else {
      strike(c, t0 + secs * plan.travel, voice, o.captured ? 1.1 : 1);
    }
  },

  /* The old name for the signals, kept so nothing that calls it has to
     change: every kind it ever took (check, win, lose, draw, tick,
     link, hint) is a sting now, and so is every new one. A clock tick
     through here alternates tick and tock by itself. */
  ui: function (kind, opts) {
    if (!on) return 0;
    if (kind === "tick" && !(opts && opts.tock != null)) {
      tockNow = !tockNow;
      return Sound.sting("tick", { tock: tockNow });
    }
    return Sound.sting(kind, opts);
  },

  /* A moment of music: see STINGS for the kinds and what each takes.
     Scheduled on the audio clock, `opts.delay` seconds from now; the
     same kind asked for twice inside a twentieth of a second plays once.
     Returns how long it will ring, reverb and all, in seconds (0 if it
     did not play). */
  sting: function (kind, opts) {
    if (!on || !STINGS[kind]) return 0;
    var c = ctx(); if (!c) return 0;
    var o = {}, k;
    if (opts) for (k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    if (o.reduced == null) o.reduced = reducedNow();
    var now = c.currentTime;
    if (lastSting[kind] != null && now >= lastSting[kind] && now - lastSting[kind] < 0.05) return 0;
    lastSting[kind] = now;
    return perform(c, score(kind, o), now + 0.006 + Math.max(0, +o.delay || 0));
  },

  /* One tick of a number counting — a rating being revealed, say:
     `i` of `n`, rising up the scale if `up`, falling if not. Light
     enough to call on every step; if the steps come faster than the ear
     can separate them, the in-between ones are skipped, but the last
     one always sounds. */
  countTick: function (i, n, up) {
    if (!on) return;
    var c = ctx(); if (!c) return;
    var now = c.currentTime;
    if (lastCount >= 0 && now >= lastCount && now - lastCount < 0.028 && i !== n) return;
    lastCount = now;
    perform(c, score("count", { i: i, n: n, up: up !== false }), now + 0.004);
  },

  /* The room tone, 0 (off, the default) to 1. With no argument, says
     what it is set to. */
  ambience: function (level) {
    if (level === undefined) return ambLevel;
    ambLevel = clamp(+level || 0, 0, 1);
    if (!on || ambLevel <= 0) { ambStop(); return ambLevel; }
    var c = ctx(); if (!c) return ambLevel;
    if (amb && amb.ctx !== c) ambStop();
    if (!amb) amb = ambStart(c);
    amb.g.gain.setTargetAtTime(ambLevel * AMB_GAIN, c.currentTime, 0.6);
    return ambLevel;
  },
  /* whether any room tone is actually playing — the checker asks this
     to prove "off" means nothing is left running */
  ambienceLive: function () { return !!amb; },
  /* how many synth voices are still sounding — the checker asks, to
     prove a pile-up of moments stays inside the budget */
  busy: function () {
    var now = AC ? AC.currentTime : 0;
    live = live.filter(function (e) { return e > now; });
    return live.length;
  },

  /* picking a piece up, and putting it back down again unmoved: the
     two sounds a board makes that are not a move */
  pickUp: function (piece) {
    if (!on) return;
    var c = ctx(); if (!c) return;
    var v = voiceFor(materialNow, kindName(piece), surfaceNow);
    var s = c.createBufferSource(); s.buffer = noise(c); s.loop = true;
    var f = c.createBiquadFilter(); f.type = "bandpass";
    var t = c.currentTime + 0.003;
    f.frequency.setValueAtTime(v.lift.hz, t); f.Q.setValueAtTime(1.1, t);
    var g = c.createGain(); env(g, t, v.lift.gain * 1.6, 0.003, 0.038);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + 0.08);
  },
  /* a single tap, for an impact with no move behind it */
  tap: function (piece, force) {
    if (!on) return;
    var c = ctx(); if (!c) return;
    strike(c, c.currentTime + 0.003, voiceFor(materialNow, kindName(piece), surfaceNow), force);
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = Sound;
else root.Sound = Sound;
})(typeof self !== "undefined" ? self : this);
