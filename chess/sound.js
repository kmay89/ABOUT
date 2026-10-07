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

/* a plain two-parameter beep, for the things that are signals rather
   than objects: a clock tick, a link, the end of a game */
function tone(freq, dur, type, vol, when, sweep) {
  var c = ctx(); if (!c) return;
  var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + (when || 0);
  o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
  if (sweep) o.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  env(g, t, vol || 0.12, 0.008, dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

/* ================= what the room asks for ================= */
var Sound = {
  MATERIALS: MATERIALS, PIECES: PIECES, KIND: KIND,
  voiceFor: voiceFor, surfaceOf: surfaceOf, materialOf: materialOf,
  frictionCurve: frictionCurve, frictionLevel: frictionLevel, flashPeak: flashPeak,

  /* Point the whole synth at a context somebody else made. The only
     caller is chess/tools/sound-check.js, which renders moves into an
     OfflineAudioContext and measures the samples that come out — there
     is no way to test a sound except to listen to it, and a machine
     listens by looking. */
  useContext: function (c) {
    AC = c; noiseBuf = null;
    master = buildChain(c);
    return master;
  },

  enable: function (v) { on = !!v; },
  enabled: function () { return on; },
  /* calling this inside a click is what lets the browser start the
     audio clock at all */
  wake: function () { ctx(); },
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
         rings in on the flash, in its own voice. */
      var nv = voiceFor(materialNow, kindName(m.promo), surfaceNow);
      var tf = t0 + secs * flashPeak(plan);
      strike(c, tf, nv, 1.15);
      tone(nv.f0 * 2, 0.26, "sine", 0.045, tf - c.currentTime + 0.02);
      tone(nv.f0 * 3, 0.34, "sine", 0.030, tf - c.currentTime + 0.09);
    } else {
      strike(c, t0 + secs * plan.travel, voice, o.captured ? 1.1 : 1);
    }
  },

  /* the signals: not objects, so not modelled as any */
  ui: function (kind) {
    if (!on) return;
    switch (kind) {
      case "check": tone(660, 0.16, "sine", 0.08); tone(880, 0.2, "sine", 0.06, 0.08); break;
      case "win":   tone(523, 0.15, "sine", 0.09); tone(659, 0.15, "sine", 0.09, 0.14); tone(784, 0.3, "sine", 0.1, 0.28); break;
      case "lose":  tone(330, 0.2, "sine", 0.08); tone(262, 0.35, "sine", 0.08, 0.18); break;
      case "draw":  tone(392, 0.2, "sine", 0.07); tone(392, 0.25, "sine", 0.07, 0.22); break;
      case "tick":  tone(1100, 0.03, "square", 0.03); break;
      case "link":  tone(523, 0.09, "sine", 0.08); tone(784, 0.14, "sine", 0.08, 0.09); break;
      case "hint":  tone(587, 0.1, "sine", 0.06); break;
    }
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
