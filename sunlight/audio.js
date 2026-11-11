/* audio.js — every sound, synthesized. No files.

   The book is loud in particular ways and quiet in others, and the game
   should be too:
   · the house with the power cut: a silence with edges, the fly on the
     pane, and Dad's tape — rrrip, thunk — like a clock that only knows the
     one hour; the third board from the door that has always groaned;
   · the cellar: cold air, a plink, pause, plink somewhere out in the black,
     your own pulse when it is truly dark;
   · the garden: hot wind in the long grass, bees in the lavender,
     grasshoppers ticking; the shed: warm creaks, a wasp;
   · the hill: wind pouring past and the dynamo singing up out of its grind
     into a high thin whine — almost a note, almost music — so it is snapped,
     gently, toward real notes;
   · the woods: cooler air, leaves, a woodpecker; the hollow: the spring;
   · the pond at night: the frog chorus and crickets;
   · the pit: diesel, a conveyor, a backup beeper, and a radio playing
     country to nobody (an original tune, plucked by Karplus–Strong);
   · Thursday: the pump's roar.
   Positional sounds are panned and attenuated by distance on the map.
   Every sound that carries meaning can raise a caption. */
(function () {
  "use strict";
  var BS = window.BS = window.BS || {};
  var A = BS.audio = {};
  var ctx = null, master, sfxBus, ambBus, musBus, noiseBuf, pinkBuf, brownBuf;
  var vol = { master: 0.8, sfx: 0.9, amb: 0.8, mus: 0.6 };
  var amb = null, ambName = "", loops = {};
  A.captions = null;      // set by the game: function(text)

  A.ready = function () { return !!ctx; };
  A.init = function () {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = vol.master;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = gain(vol.sfx, master); ambBus = gain(vol.amb, master); musBus = gain(vol.mus, master);
    noiseBuf = makeNoise("white"); pinkBuf = makeNoise("pink"); brownBuf = makeNoise("brown");
    A.reverb = makeReverb(2.8);
    A.reverb.connect(master);
  };
  A.setVolume = function (k, v) {
    vol[k] = v;
    if (!ctx) return;
    var b = { master: master, sfx: sfxBus, amb: ambBus, mus: musBus }[k];
    if (b) b.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  };
  A.suspend = function (on) { if (ctx) { if (on) ctx.suspend(); else ctx.resume(); } };

  function gain(v, to) { var g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  function makeNoise(kind) {
    var len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (kind === "white") d[i] = w;
      else if (kind === "pink") { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
      else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return b;
  }
  function makeReverb(sec) {
    var len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) { var d = b.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    var cv = ctx.createConvolver(); cv.buffer = b;
    var out = gain(0.35); cv.connect(out);
    var input = gain(1); input.connect(cv);
    return { node: input, connect: function (to) { out.connect(to); } };
  }
  function noiseSrc(buf, loop) { var s = ctx.createBufferSource(); s.buffer = buf || noiseBuf; s.loop = loop !== false; return s; }
  function filt(type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
  function panner(p) { if (ctx.createStereoPanner) { var s = ctx.createStereoPanner(); s.pan.value = p || 0; return s; } return gain(1); }
  function env(g, t, a, peak, d) {
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  /* where a positional sound sits relative to the listener */
  var listener = { x: 0, y: 0 };
  A.listen = function (x, y) { listener.x = x; listener.y = y; };
  function place(x, y, range) {
    if (x == null) return { g: 1, p: 0 };
    var dx = x - listener.x, dy = y - listener.y, d = Math.sqrt(dx * dx + dy * dy);
    var g = Math.max(0, 1 - d / (range || 220)); g = g * g;
    return { g: g, p: Math.max(-0.9, Math.min(0.9, dx / 140)) };
  }

  /* ---------------- one-shots ---------------- */
  function tone(f, o) {
    if (!ctx) return;
    o = o || {};
    var t = ctx.currentTime + (o.at || 0);
    var os = ctx.createOscillator(); os.type = o.type || "sine"; os.frequency.setValueAtTime(f, t);
    if (o.slide) os.frequency.exponentialRampToValueAtTime(o.slide, t + (o.dur || 0.3));
    var g = gain(0); var pn = panner(o.pan || 0);
    os.connect(g); g.connect(pn); pn.connect(o.bus || sfxBus);
    if (o.verb) g.connect(A.reverb.node);
    env(g, t, o.a || 0.005, o.g || 0.1, o.dur || 0.3);
    os.start(t); os.stop(t + (o.a || 0.005) + (o.dur || 0.3) + 0.05);
  }
  function burst(o) {
    if (!ctx) return;
    var t = ctx.currentTime + (o.at || 0);
    var s = noiseSrc(o.buf, false), f = filt(o.type || "bandpass", o.f || 1000, o.q || 1), g = gain(0), pn = panner(o.pan || 0);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + o.dur);
    s.connect(f); f.connect(g); g.connect(pn); pn.connect(o.bus || sfxBus);
    if (o.verb) g.connect(A.reverb.node);
    env(g, t, o.a || 0.005, o.g || 0.1, o.dur || 0.2);
    s.start(t, Math.random()); s.stop(t + (o.a || 0.005) + (o.dur || 0.2) + 0.05);
  }
  /* a plucked string, Karplus–Strong: for the radio and the music */
  function pluck(f, o) {
    if (!ctx) return;
    o = o || {};
    var t = ctx.currentTime + (o.at || 0), sr = ctx.sampleRate, n = Math.round(sr / f), dur = o.dur || 1.4;
    var len = Math.round(sr * dur), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0), ring = new Float32Array(n);
    for (var i = 0; i < n; i++) ring[i] = Math.random() * 2 - 1;
    var damp = o.damp || 0.996, bright = o.bright == null ? 0.5 : o.bright;
    for (i = 0; i < len; i++) { var k = i % n, nx = (k + 1) % n; var v = ring[k]; ring[k] = damp * (bright * v + (1 - bright) * ring[nx]); d[i] = v; }
    var s = ctx.createBufferSource(); s.buffer = b;
    var g = gain(o.g || 0.12), pn = panner(o.pan || 0), lp = filt("lowpass", o.lp || 3200);
    s.connect(lp); lp.connect(g); g.connect(pn); pn.connect(o.bus || musBus);
    if (o.verb !== false) g.connect(A.reverb.node);
    s.start(t);
  }
  A.pluck = pluck; A.tone = tone; A.burst = burst;

  var cap = function (t) { if (A.captions) A.captions(t); };
  var S = {
    step: function (surf, x, y) {
      var P = place(x, y, 200), g = 0.05 * (x == null ? 1 : P.g);
      var f = { wood: 380, stone: 900, sand: 2600, leaves: 3200, gravel: 2000, mud: 260, grass: 3800 }[surf] || 2000;
      burst({ f: f * (0.9 + Math.random() * 0.2), q: surf === "wood" ? 3 : 0.8, g: g, dur: surf === "sand" ? 0.12 : 0.06, pan: P.p, type: surf === "grass" || surf === "leaves" ? "highpass" : "bandpass" });
      if (surf === "wood") tone(90 + Math.random() * 30, { g: g * 0.6, dur: 0.06 });
    },
    groan: function () { /* the third board from the door */
      tone(140, { type: "sawtooth", slide: 95, g: 0.03, dur: 0.6, a: 0.08 }); tone(147, { type: "triangle", slide: 100, g: 0.03, dur: 0.6, a: 0.1 }); cap("[the floorboard groans]");
    },
    rip: function (x, y) { /* rrrip */
      var P = place(x, y, 260); if (P.g < 0.02) return;
      burst({ f: 900, sweep: 3800, q: 2.5, g: 0.11 * P.g, dur: 0.55, a: 0.02, pan: P.p, type: "bandpass" });
      burst({ f: 2400, q: 6, g: 0.05 * P.g, dur: 0.5, a: 0.03, pan: P.p });
      if (P.g > 0.2) cap("[packing tape: rrrip]");
    },
    thunk: function (x, y) {
      var P = place(x, y, 260); if (P.g < 0.02) return;
      tone(110, { slide: 60, g: 0.2 * P.g, dur: 0.12, pan: P.p }); burst({ f: 300, q: 1, g: 0.06 * P.g, dur: 0.06, pan: P.p });
      if (P.g > 0.2) cap("[thunk]");
    },
    latch: function () { tone(1800, { type: "square", g: 0.02, dur: 0.03 }); tone(240, { g: 0.08, dur: 0.12, at: 0.02 }); burst({ f: 3000, q: 4, g: 0.04, dur: 0.05 }); cap("[the latch lifts with a cold, heavy click]"); },
    door: function () { burst({ f: 500, sweep: 300, q: 4, g: 0.05, dur: 0.5, a: 0.1 }); tone(180, { type: "triangle", slide: 140, g: 0.03, dur: 0.5, a: 0.1 }); },
    haul: function () { burst({ f: 220, q: 2, g: 0.12, dur: 0.18 }); tone(70, { g: 0.15, dur: 0.15 }); cap("[the swollen door sticks]"); },
    drip: function (x, y) { var P = place(x, y, 260); if (P.g < 0.02) return; var f = 1400 + Math.random() * 900; tone(f, { slide: f * 1.6, g: 0.05 * P.g, dur: 0.12, pan: P.p, verb: 1 }); },
    page: function () { burst({ f: 4000, sweep: 1800, type: "bandpass", q: 0.7, g: 0.05, dur: 0.25, a: 0.04 }); },
    blip: function () { tone(1320, { g: 0.03, dur: 0.05 }); },
    ui: function () { tone(660, { type: "triangle", g: 0.04, dur: 0.06 }); },
    back: function () { tone(440, { type: "triangle", g: 0.04, dur: 0.07 }); },
    text: function () { tone(520 + Math.random() * 60, { type: "triangle", g: 0.012, dur: 0.03 }); },
    phone: function () { tone(880, { type: "square", g: 0.015, dur: 0.05 }); tone(1175, { type: "square", g: 0.015, dur: 0.05, at: 0.08 }); },
    buzz: function () { for (var i = 0; i < 3; i++) tone(180, { type: "sawtooth", g: 0.02, dur: 0.08, at: i * 0.12 }); cap("[the phone buzzes]"); },
    dig: function () { burst({ f: 700, q: 1, g: 0.12, dur: 0.12 }); burst({ f: 260, q: 1, g: 0.08, dur: 0.15, at: 0.05 }); },
    plink: function () { tone(1900, { slide: 2600, g: 0.06, dur: 0.15, verb: 1 }); },
    splash: function () { burst({ f: 900, q: 0.6, g: 0.12, dur: 0.4, a: 0.01 }); },
    pick: function () { tone(784, { type: "triangle", g: 0.05, dur: 0.1 }); tone(1175, { type: "triangle", g: 0.05, dur: 0.18, at: 0.08 }); },
    bump: function () { tone(80, { g: 0.2, dur: 0.15 }); burst({ f: 400, q: 1, g: 0.1, dur: 0.1 }); },
    sand: function () { burst({ buf: brownBuf, type: "lowpass", f: 900, g: 0.4, dur: 2.4, a: 0.25 }); burst({ f: 3000, q: 0.5, g: 0.1, dur: 2.2, a: 0.6 }); cap("[the whole face of the pile lets go — a low building roar]"); },
    lunge: function () { burst({ f: 1200, sweep: 300, q: 1, g: 0.2, dur: 0.4 }); },
    knock: function () { for (var i = 0; i < 3; i++) { tone(160, { g: 0.2, dur: 0.08, at: i * 0.22 }); burst({ f: 800, q: 2, g: 0.06, dur: 0.05, at: i * 0.22 }); } cap("[knock, knock, knock]"); },
    horn: function () { tone(311, { type: "sawtooth", g: 0.06, dur: 0.5 }); tone(370, { type: "sawtooth", g: 0.05, dur: 0.5 }); cap("[a truck horn across the pit]"); },
    slam: function () { burst({ f: 200, q: 1, g: 0.3, dur: 0.2 }); tone(60, { g: 0.3, dur: 0.2 }); },
    shout: function () { tone(220, { type: "sawtooth", slide: 300, g: 0.04, dur: 0.3 }); tone(330, { type: "sawtooth", slide: 260, g: 0.03, dur: 0.4, at: 0.3 }); cap("[a man's voice, shouting]"); },
    /* Mo: no direction at all — a soft wide chord, out of nowhere */
    mo: function () {
      [523.25, 659.25, 783.99, 987.77].forEach(function (f, i) { tone(f, { g: 0.018, dur: 2.6, a: 0.6 + i * 0.2, verb: 1, bus: musBus }); tone(f * 1.003, { g: 0.012, dur: 2.6, a: 0.8, verb: 1, bus: musBus, pan: i % 2 ? 0.5 : -0.5 }); });
    },
    cynic: function () { tone(110, { type: "sawtooth", g: 0.012, dur: 0.6, a: 0.2 }); tone(116.5, { type: "sawtooth", g: 0.012, dur: 0.6, a: 0.2 }); },
    /* the discovery: an item becomes yours */
    found: function () {
      var seq = [[587.33, 0], [739.99, 0.14], [880, 0.28], [1174.66, 0.46]];
      seq.forEach(function (n) { pluck(n[0], { at: n[1], g: 0.16, dur: 2, bright: 0.6 }); tone(n[0], { at: n[1], g: 0.03, dur: 1.2, verb: 1, bus: musBus }); });
      tone(587.33 / 2, { at: 0.46, g: 0.05, dur: 2.2, a: 0.3, verb: 1, bus: musBus });
    },
    seen: function () { pluck(1174.66, { g: 0.08, dur: 1.2 }); pluck(1479.98, { g: 0.07, dur: 1.2, at: 0.1 }); },
    chapter: function () { [293.66, 440, 587.33, 739.99].forEach(function (f, i) { pluck(f, { at: i * 0.35, g: 0.12, dur: 3 }); }); },
    signal: function () { tone(1046, { type: "sine", g: 0.04, dur: 0.12 }); tone(1568, { g: 0.04, dur: 0.2, at: 0.12 }); },
    nosignal: function () { tone(523, { type: "triangle", slide: 392, g: 0.04, dur: 0.4 }); },
    ring: function () { for (var i = 0; i < 2; i++) { tone(440, { g: 0.04, dur: 0.4, at: i * 0.5 }); tone(480, { g: 0.04, dur: 0.4, at: i * 0.5 }); } cap("[ringing]"); },
    truck: function () { burst({ buf: brownBuf, type: "lowpass", f: 200, g: 0.5, dur: 3, a: 0.8 }); tone(48, { type: "sawtooth", g: 0.06, dur: 3, a: 0.8 }); cap("[the diesel grind of something big, pulling up the lane]"); },
    lights: function () { tone(120, { type: "square", g: 0.03, dur: 0.05 }); burst({ f: 6000, type: "highpass", g: 0.05, dur: 0.6, a: 0.05 }); cap("[the work lights snap on]"); }
  };
  A.sfx = function (name) {
    if (!ctx) return;
    var f = S[name]; if (f) f.apply(null, Array.prototype.slice.call(arguments, 1));
  };

  /* ---------------- loops (crank, ride, pump) ---------------- */
  /* the dynamo: a grind that sings up into a whine */
  A.dynamo = function (rate) {
    if (!ctx) return;
    var L = loops.dyn;
    if (!L) {
      var o = ctx.createOscillator(); o.type = "sawtooth";
      var o2 = ctx.createOscillator(); o2.type = "triangle";
      var n = noiseSrc(pinkBuf); var nf = filt("bandpass", 600, 2);
      var g = gain(0), lp = filt("lowpass", 1200, 1);
      o.connect(lp); o2.connect(lp); n.connect(nf); nf.connect(g); lp.connect(g); g.connect(sfxBus);
      o.start(); o2.start(); n.start();
      L = loops.dyn = { o: o, o2: o2, g: g, lp: lp, nf: nf, f: 80 };
    }
    var t = ctx.currentTime;
    var target = 60 + rate * 520;
    /* almost a note: drift the pitch toward the nearest note of D major pentatonic */
    if (rate > 0.35) {
      var midi = 69 + 12 * Math.log2(target / 440), scale = [2, 4, 6, 9, 11], base = Math.floor(midi / 12) * 12, best = target, bd = 99;
      for (var oc = -12; oc <= 12; oc += 12) scale.forEach(function (s) { var m = base + oc + s; var d = Math.abs(m - midi); if (d < bd) { bd = d; best = 440 * Math.pow(2, (m - 69) / 12); } });
      var pull = Math.min(1, (rate - 0.35) * 2.2);
      target = target + (best - target) * pull;
    }
    L.o.frequency.setTargetAtTime(target, t, 0.08);
    L.o2.frequency.setTargetAtTime(target * 2, t, 0.08);
    L.lp.frequency.setTargetAtTime(400 + rate * 2600, t, 0.1);
    L.nf.frequency.setTargetAtTime(300 + rate * 900, t, 0.1);
    L.g.gain.setTargetAtTime(rate > 0.01 ? 0.015 + rate * 0.05 : 0, t, 0.08);
  };
  A.wind = function (speed) {
    if (!ctx) return;
    var L = loops.wind;
    if (!L) {
      var n = noiseSrc(pinkBuf), f = filt("bandpass", 500, 0.6), g = gain(0);
      n.connect(f); f.connect(g); g.connect(sfxBus); n.start();
      L = loops.wind = { g: g, f: f };
    }
    var t = ctx.currentTime;
    L.f.frequency.setTargetAtTime(300 + speed * 1800, t, 0.1);
    L.g.gain.setTargetAtTime(speed * 0.22, t, 0.1);
  };
  A.loop = function (name, on, level) {
    if (!ctx) return;
    var L = loops[name], t = ctx.currentTime;
    if (!L && on) {
      if (name === "pump") {
        var n = noiseSrc(brownBuf), f = filt("lowpass", 380, 1), g = gain(0), o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 42;
        var og = gain(0.06); o.connect(og); og.connect(g);
        var lfo = ctx.createOscillator(); lfo.frequency.value = 3.1; var lg = gain(80); lfo.connect(lg); lg.connect(f.frequency);
        n.connect(f); f.connect(g); g.connect(sfxBus); n.start(); o.start(); lfo.start();
        L = loops.pump = { g: g, stop: function () { n.stop(); o.stop(); lfo.stop(); } };
        cap("[the pump roars]");
      } else if (name === "heart") {
        var hg = gain(0); hg.connect(sfxBus);
        var iv = setInterval(function () { if (!ctx) return; var tt = ctx.currentTime; [0, 0.22].forEach(function (d, i) { var o2 = ctx.createOscillator(); o2.frequency.value = 52; var g2 = gain(0); o2.connect(g2); g2.connect(hg); env(g2, tt + d, 0.01, i ? 0.25 : 0.35, 0.16); o2.start(tt + d); o2.stop(tt + d + 0.3); }); }, 1000);
        L = loops.heart = { g: hg, stop: function () { clearInterval(iv); } };
      }
    }
    if (!L) return;
    if (on) L.g.gain.setTargetAtTime(level == null ? 0.5 : level, t, 0.3);
    else { L.g.gain.setTargetAtTime(0, t, 0.4); var LL = L; delete loops[name]; setTimeout(function () { LL.stop(); }, 1600); }
  };

  /* ---------------- ambiences ---------------- */
  function bed(buf, type, f, q, level, lfoRate, lfoDepth) {
    var n = noiseSrc(buf), fl = filt(type, f, q), g = gain(level);
    n.connect(fl); fl.connect(g);
    var parts = [n];
    if (lfoRate) { var l = ctx.createOscillator(); l.frequency.value = lfoRate; var lg = gain(lfoDepth); l.connect(lg); lg.connect(g.gain); l.start(); parts.push(l); }
    n.start(0, Math.random() * 1.5);
    return { out: g, parts: parts, f: fl };
  }
  function drone(f, level, type) {
    var o = ctx.createOscillator(); o.type = type || "sine"; o.frequency.value = f;
    var g = gain(level); o.connect(g); o.start(); return { out: g, parts: [o] };
  }
  /* each ambience is a few beds plus a scheduler of little events */
  var AMB = {
    house: function (ev) {
      var b = [bed(brownBuf, "lowpass", 160, 0.7, 0.05)];       // the silence with edges
      ev(function () { /* Dad's tape, from where Dad is */
        if (A.dad) { S.rip(A.dad.x, A.dad.y); setTimeout(function () { S.thunk(A.dad.x, A.dad.y); }, 650); }
      }, 4.2, 2.5);
      ev(function () { if (A.fly) { var P = place(A.fly.x, A.fly.y, 160); if (P.g > 0.02) { tone(210 + Math.random() * 30, { type: "sawtooth", g: 0.008 * P.g, dur: 1.4, a: 0.2, pan: P.p, slide: 190 }); } } }, 2.2, 1.6);
      ev(function () { tone(60 + Math.random() * 20, { g: 0.01, dur: 0.5, a: 0.1 }); }, 9, 6); // the house ticks as it cools
      return b;
    },
    housequiet: function (ev) { return [bed(brownBuf, "lowpass", 140, 0.7, 0.05)]; },
    cellar: function (ev) {
      var b = [bed(brownBuf, "lowpass", 110, 0.7, 0.16, 0.05, 0.04), drone(55, 0.012), drone(82.4, 0.006, "triangle")];
      ev(function () { var p = A.drips && A.drips[Math.floor(Math.random() * A.drips.length)]; if (p) S.drip(p[0], p[1]); else S.drip(); }, 2.6, 2.2);
      ev(function () { if (A.nearMo && A.nearMo()) S.mo(); }, 14, 6);
      return b;
    },
    garden: function (ev, night) {
      var b = [bed(pinkBuf, "bandpass", 700, 0.5, night ? 0.03 : 0.06, 0.13, 0.03)];
      if (!night) {
        ev(function () { /* bees in the lavender */
          (A.bees || []).forEach(function (bb) { var P = place(bb.x, bb.y, 120); if (P.g > 0.02) tone(220 + Math.random() * 20, { type: "sawtooth", g: 0.012 * P.g, dur: 1.1, a: 0.2, pan: P.p, slide: 235 }); });
        }, 1.1, 0.6);
        ev(function () { var f = 2400 + Math.random() * 1400; for (var i = 0; i < 2 + (Math.random() * 3 | 0); i++) tone(f, { slide: f * 1.4, g: 0.012, dur: 0.07, at: i * 0.12, pan: Math.random() - 0.5 }); }, 3.4, 3);     // a bird
        ev(function () { for (var i = 0; i < 6; i++) burst({ f: 6500, q: 8, g: 0.008, dur: 0.02, at: i * 0.05, pan: 0.6 }); }, 2.5, 2);   // grasshoppers in the heat
      } else {
        ev(function () { for (var i = 0; i < 3; i++) tone(4200, { type: "sine", g: 0.006, dur: 0.04, at: i * 0.07, pan: Math.random() - 0.5 }); }, 0.9, 0.5);   // crickets
      }
      return b;
    },
    shed: function (ev) {
      var b = [bed(pinkBuf, "lowpass", 400, 0.5, 0.04)];
      ev(function () { tone(70 + Math.random() * 30, { type: "triangle", g: 0.015, dur: 0.4, a: 0.1 }); }, 5, 4);   // warm boards creak
      ev(function () { tone(260, { type: "sawtooth", g: 0.008, dur: 1.4, a: 0.3, slide: 290, pan: 0.4 }); }, 7, 5);  // a wasp
      return b;
    },
    woods: function (ev, night) {
      var b = [bed(pinkBuf, "bandpass", 1200, 0.4, 0.035, 0.08, 0.025), bed(brownBuf, "lowpass", 140, 0.7, 0.05)];
      if (!night) {
        ev(function () { var n = 4 + (Math.random() * 6 | 0); for (var i = 0; i < n; i++) burst({ f: 1500, q: 6, g: 0.04, dur: 0.03, at: i * 0.06, pan: -0.4 }); }, 11, 8);   // woodpecker
        ev(function () { tone(1800, { slide: 1400, g: 0.012, dur: 0.4, pan: 0.5 }); tone(1500, { slide: 1100, g: 0.01, dur: 0.5, at: 0.45, pan: 0.5 }); }, 6, 5);
      }
      ev(function () { if (A.spring) { var P = place(A.spring.x, A.spring.y, 220); if (P.g > 0.03) for (var i = 0; i < 4; i++) tone(700 + Math.random() * 900, { g: 0.01 * P.g, dur: 0.06, at: i * 0.09, pan: P.p }); } }, 0.5, 0.4);
      return b;
    },
    pond: function (ev) {
      var b = [bed(pinkBuf, "lowpass", 500, 0.5, 0.03)];
      ev(function () { /* the frog chorus, around the edge */
        var f = 140 + Math.random() * 120, pan = Math.random() * 1.6 - 0.8;
        for (var i = 0; i < 3; i++) { tone(f, { type: "square", g: 0.012, dur: 0.06, at: i * 0.09, pan: pan }); }
      }, 0.35, 0.3);
      ev(function () { for (var i = 0; i < 3; i++) tone(4300, { g: 0.005, dur: 0.04, at: i * 0.07, pan: Math.random() - 0.5 }); }, 0.6, 0.4);
      return b;
    },
    pit: function (ev) {
      var b = [bed(brownBuf, "lowpass", 220, 0.8, 0.12), drone(44, 0.03, "sawtooth")];
      ev(function () { for (var i = 0; i < 8; i++) burst({ f: 1800, q: 3, g: 0.025, dur: 0.03, at: i * 0.11 }); }, 1.4, 0.5);                // the conveyor clattering
      ev(function () { for (var i = 0; i < 4; i++) tone(1046, { type: "square", g: 0.012, dur: 0.25, at: i * 0.5 }); }, 9, 6);           // backing up
      ev(function () { radio(); }, 7.5, 0.5);                                                                                                // country music, to nobody
      return b;
    },
    field: function (ev, night) { return AMB.garden(ev, night); },
    ride: function () { return [bed(pinkBuf, "lowpass", 300, 0.5, 0.02)]; },
    silence: function () { return [bed(brownBuf, "lowpass", 120, 0.7, 0.02)]; }
  };
  /* a little country tune nobody is listening to: I–IV–V in G, plucked */
  var radioBar = 0;
  function radio() {
    if (!A.radio) return;
    var P = place(A.radio.x, A.radio.y, 240); if (P.g < 0.03) return;
    var prog = [[196, 246.94, 293.66], [261.63, 329.63, 392], [293.66, 369.99, 440], [196, 246.94, 293.66]];
    var mel = [[587.33, 493.88, 440, 392], [523.25, 440, 392, 329.63], [587.33, 659.25, 587.33, 493.88], [392, 440, 392, 0]];
    for (var bar = 0; bar < 2; bar++) {
      var ch = prog[(radioBar + bar) % 4], ml = mel[(radioBar + bar) % 4];
      for (var b = 0; b < 4; b++) {
        var t = bar * 1.6 + b * 0.4;
        pluck(b % 2 ? ch[1] : ch[0] / 2, { at: t, g: 0.08 * P.g, dur: 0.8, bright: 0.3, lp: 1800, pan: P.p, bus: ambBus, verb: false });
        if (ml[b]) pluck(ml[b], { at: t + 0.05, g: 0.06 * P.g, dur: 0.6, bright: 0.7, lp: 2400, pan: P.p, bus: ambBus, verb: false });
      }
    }
    radioBar = (radioBar + 2) % 4;
  }

  A.ambience = function (name, night) {
    if (!ctx) { ambName = ""; return; }
    var key = name + (night ? ":n" : "");
    if (key === ambName) return;
    ambName = key;
    var old = amb, t = ctx.currentTime;
    if (old) {
      old.g.gain.setTargetAtTime(0, t, 0.6);
      old.timers.forEach(function (tm) { clearTimeout(tm.id); tm.dead = true; });
      setTimeout(function () { old.beds.forEach(function (b) { b.parts.forEach(function (p) { try { p.stop(); } catch (e) { } }); }); }, 3000);
    }
    var g = gain(0); g.connect(ambBus); g.gain.setTargetAtTime(1, t, 0.8);
    var me = { g: g, timers: [], beds: [] };
    function ev(fn, every, jitter) {
      var tm = { dead: false };
      (function go() {
        tm.id = setTimeout(function () { if (tm.dead) return; try { fn(); } catch (e) { } go(); }, (every + (Math.random() * 2 - 1) * jitter) * 1000);
      })();
      me.timers.push(tm);
    }
    var f = AMB[name] || AMB.silence;
    me.beds = f(ev, night) || [];
    me.beds.forEach(function (b) { b.out.connect(g); });
    amb = me;
  };

  /* ---------------- music: sparse, generative, and the themes ---------------- */
  /* D major pentatonic, played like somebody sitting at a piano in another
     room. It never loops: a phrase every so often, rests between. */
  var musTimer = null, musMood = "";
  A.music = function (mood) {
    if (!ctx || mood === musMood) return;
    musMood = mood;
    if (musTimer) { clearTimeout(musTimer); musTimer = null; }
    if (!mood || mood === "none") return;
    var scales = {
      warm: [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99],
      cool: [220, 246.94, 293.66, 329.63, 369.99, 440, 493.88, 587.33],
      night: [146.83, 220, 246.94, 293.66, 329.63, 369.99, 440],
      dark: [110, 146.83, 164.81, 220, 246.94]
    };
    var sc = scales[mood] || scales.warm;
    (function phrase() {
      var n = 3 + (Math.random() * 4 | 0), at = 0, idx = (Math.random() * sc.length) | 0;
      for (var i = 0; i < n; i++) {
        idx = Math.max(0, Math.min(sc.length - 1, idx + ((Math.random() * 5) | 0) - 2));
        pluck(sc[idx], { at: at, g: mood === "dark" ? 0.05 : 0.07, dur: 2.6, bright: 0.25, damp: 0.998, lp: 2200 });
        if (Math.random() < 0.3) pluck(sc[Math.max(0, idx - 3)] / 2, { at: at, g: 0.05, dur: 3, bright: 0.2, damp: 0.998, lp: 1200 });
        at += [0.5, 0.75, 1, 1.5][(Math.random() * 4) | 0];
      }
      musTimer = setTimeout(phrase, (at + 5 + Math.random() * 9) * 1000);
    })();
  };
  /* Gran's theme, for the title and the end: simple, upright, planted */
  A.theme = function () {
    if (!ctx) return;
    var m = [[587.33, 0, 1], [739.99, 0.6, 0.5], [880, 0.9, 1.2], [783.99, 2.1, 0.6], [739.99, 2.7, 0.6], [659.25, 3.3, 1.4], [587.33, 4.9, 0.6], [659.25, 5.5, 0.6], [739.99, 6.1, 0.6], [880, 6.7, 1.0], [739.99, 7.7, 2.4]];
    m.forEach(function (n) { pluck(n[0], { at: n[1], g: 0.11, dur: n[2] + 1.5, bright: 0.3, damp: 0.998 }); });
    [[146.83, 0], [196, 2.1], [220, 4.9], [146.83, 6.7]].forEach(function (b) { pluck(b[0], { at: b[1], g: 0.08, dur: 3.5, bright: 0.2, damp: 0.999, lp: 1000 }); });
  };
})();
