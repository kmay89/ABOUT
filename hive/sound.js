/* sound.js — the meadow, by ear. No files: every sound is made as it plays.

   The rule is that the game should be a pleasure to listen to with your
   eyes shut. Every load of nectar a bee brings home is a plucked note, and
   the notes climb a five-note scale while they keep coming, so a hive that
   is working well plays itself a tune and a hive that is not goes quiet.
   That is the score, in the old sense of the word.

   Nothing here starts until the first tap: a browser will not let a page
   make a sound before somebody has touched it, and it is right not to.     */
(function (root) {
"use strict";

/* a major pentatonic, two octaves: there is no wrong note in it */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const ROOT = { spring: 261.63, summer: 293.66, autumn: 220, winter: 196 };

function create() {
  let ac = null, master = null, on = true, music = true;
  let streak = 0, lastDeliver = 0, season = "spring";
  let hum = null, pad = null, rain = null, wind = null, crickets = null;
  const A = {};

  function boot() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return; }
    const Ctx = root.AudioContext || root.webkitAudioContext;
    if (!Ctx) return;
    try { ac = new Ctx(); } catch (e) { ac = null; return; }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5;
    master = ac.createGain(); master.gain.value = on ? 0.9 : 0;
    master.connect(comp); comp.connect(ac.destination);
    beds();
  }
  function now() { return ac.currentTime; }
  function note(semi) { return ROOT[season] * Math.pow(2, semi / 12); }

  /* one voice: an oscillator through its own envelope */
  function tone(freq, o) {
    if (!ac || !on) return;
    o = o || {};
    const t = now() + (o.at || 0), osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || "sine"; osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.dur || 0.2));
    const vol = o.vol === undefined ? 0.12 : o.vol, dur = o.dur || 0.2, att = o.att || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + att + dur);
    osc.connect(g); g.connect(o.dest || master);
    osc.start(t); osc.stop(t + att + dur + 0.05);
  }
  /* a pluck: a bright start and a soft body, like a thumb piano */
  function pluck(freq, vol, at) {
    tone(freq, { type: "triangle", vol: vol, dur: 0.5, at: at });
    tone(freq * 2, { type: "sine", vol: vol * 0.35, dur: 0.16, at: at });
    tone(freq * 3.01, { type: "sine", vol: vol * 0.12, dur: 0.07, at: at });
  }
  function noise(o) {
    if (!ac || !on) return null;
    const len = Math.ceil(ac.sampleRate * (o.dur || 0.3)), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = now() + (o.at || 0);
    src.buffer = buf; f.type = o.type || "bandpass"; f.frequency.setValueAtTime(o.freq || 1200, t); f.Q.value = o.q || 1;
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + (o.dur || 0.3));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + (o.att || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.3));
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
    return src;
  }

  /* the beds: things that are always there and only change how loud they are */
  function loopNoise(type, freq, q) {
    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf; src.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.value = 0; src.connect(f); f.connect(g); g.connect(master); src.start();
    return { g: g, f: f };
  }
  function beds() {
    /* the hum of the hive: two saws a few cycles apart, kept behind everything */
    const g = ac.createGain(), f = ac.createBiquadFilter();
    g.gain.value = 0; f.type = "lowpass"; f.frequency.value = 520;
    for (const hz of [226, 231.5]) { const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = hz; o.connect(f); o.start(); }
    f.connect(g); g.connect(master);
    hum = { g: g, f: f };
    /* a held chord under the day, slow enough not to be noticed arriving */
    const pg = ac.createGain(); pg.gain.value = 0; pg.connect(master);
    const voices = [];
    for (let i = 0; i < 3; i++) {
      const o = ac.createOscillator(), og = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
      o.type = "sine"; og.gain.value = 0.33;
      lfo.frequency.value = 0.07 + i * 0.045; lg.gain.value = 0.16;
      lfo.connect(lg); lg.connect(og.gain); o.connect(og); og.connect(pg); o.start(); lfo.start();
      voices.push(o);
    }
    pad = { g: pg, v: voices };
    rain = loopNoise("highpass", 2600, 0.4);
    wind = loopNoise("bandpass", 420, 0.7);
    crickets = loopNoise("bandpass", 4300, 14);
    /* crickets chirp: the band is opened and shut a few times a second */
    const cl = ac.createOscillator(), cg = ac.createGain();
    cl.type = "square"; cl.frequency.value = 5.5; cg.gain.value = 0;
    cl.connect(cg); cg.connect(crickets.g.gain); cl.start();
    crickets.depth = cg;
    setSeason(season);
  }
  function ramp(param, v, secs) {
    if (!ac) return;
    param.cancelScheduledValues(now());
    param.setTargetAtTime(v, now(), secs / 3);
  }
  function setSeason(sn) {
    season = sn;
    if (!pad) return;
    const chord = sn === "winter" ? [-12, -5, 3] : sn === "autumn" ? [-12, -5, 2] : [-12, -5, 4];
    pad.v.forEach(function (o, i) { ramp(o.frequency, note(chord[i]), 2.5); });
  }
  /* called every frame with what the scene is like right now */
  function mixTo(o) {
    if (!ac) return;
    const m = music && on ? 1 : 0;
    ramp(hum.g.gain, on ? 0.012 + 0.03 * Math.min(1, o.flying / 30) : 0, 0.6);
    ramp(pad.g.gain, 0.05 * m * (o.night ? 0.6 : 1), 1.5);
    ramp(rain.g.gain, on ? 0.05 * o.rain : 0, 0.8);
    ramp(wind.g.gain, on ? 0.02 * o.winter + 0.13 * o.gust : 0, 0.4);
    ramp(wind.f.frequency, 380 + 500 * o.gust, 0.3);
    ramp(crickets.depth.gain, on ? 0.012 * o.night * (o.winter ? 0 : 1) : 0, 1.2);
  }

  /* ---------- the sounds, by what happened ---------- */
  A.tap = function () { tone(520, { type: "sine", vol: 0.07, dur: 0.07, to: 380 }); };
  A.miss = function () { tone(180, { type: "sine", vol: 0.05, dur: 0.09, to: 140 }); };
  A.bloom = function () { tone(note(12), { vol: 0.05, dur: 0.25, to: note(19), att: 0.02 }); noise({ freq: 3000, q: 2, vol: 0.02, dur: 0.12 }); };
  A.flowerOn = function () { pluck(note(7), 0.1); pluck(note(12), 0.1, 0.07); };
  A.flowerOff = function () { pluck(note(7), 0.07); pluck(note(2), 0.07, 0.07); };
  A.deliver = function (amt) {
    if (!ac) return;
    /* keep coming and the tune climbs; pause and it starts again from the bottom */
    const t = now();
    streak = t - lastDeliver < 1.6 ? streak + 1 : 0;
    lastDeliver = t;
    const i = streak % (SCALE.length * 2 - 2), up = i < SCALE.length ? i : SCALE.length * 2 - 2 - i;
    pluck(note(SCALE[up]), 0.075 + 0.02 * Math.min(2, amt));
  };
  A.cell = function () { tone(note(24), { type: "sine", vol: 0.07, dur: 0.6 }); tone(note(31), { type: "sine", vol: 0.04, dur: 0.5, at: 0.05 }); };
  A.ring = function () { [0, 4, 7, 12, 16].forEach(function (n, i) { pluck(note(n + 12), 0.1, i * 0.07); }); };
  A.lay = function () { tone(330, { vol: 0.1, dur: 0.12, to: 220 }); tone(660, { vol: 0.05, dur: 0.1, at: 0.08 }); };
  A.hatch = function () { pluck(note(12), 0.13); pluck(note(16), 0.13, 0.09); pluck(note(19), 0.13, 0.18); noise({ freq: 240, q: 6, vol: 0.05, dur: 0.3, at: 0.1 }); };
  A.no = function () { tone(196, { type: "triangle", vol: 0.08, dur: 0.1 }); tone(175, { type: "triangle", vol: 0.08, dur: 0.14, at: 0.1 }); };
  A.dry = function () { tone(note(9), { vol: 0.04, dur: 0.3, to: note(4) }); };
  A.wilt = function () { tone(note(4), { vol: 0.045, dur: 0.4, to: note(-3) }); };
  A.recruit = function () { tone(note(14), { type: "triangle", vol: 0.05, dur: 0.06 }); tone(note(14), { type: "triangle", vol: 0.05, dur: 0.06, at: 0.09 }); tone(note(16), { type: "triangle", vol: 0.05, dur: 0.08, at: 0.18 }); };
  A.hornetWarn = function () { for (let i = 0; i < 3; i++) tone(92, { type: "sawtooth", vol: 0.1, dur: 0.22, at: i * 0.3, to: 80 }); };
  A.snatch = function () { tone(240, { type: "sawtooth", vol: 0.13, dur: 0.16, to: 90 }); noise({ freq: 900, vol: 0.08, dur: 0.14 }); };
  A.ballCall = function () { for (let i = 0; i < 4; i++) tone(300 + i * 40, { type: "square", vol: 0.035, dur: 0.05, at: i * 0.05 }); };
  A.hornetDown = function () { noise({ type: "lowpass", freq: 300, vol: 0.2, dur: 0.3 }); [0, 7, 12, 19].forEach(function (n, i) { pluck(note(n), 0.13, 0.12 + i * 0.08); }); };
  A.rain = function () { noise({ type: "lowpass", freq: 180, vol: 0.1, dur: 1.4, att: 0.3 }); };
  A.refresh = function () { [16, 19, 24].forEach(function (n, i) { tone(note(n), { vol: 0.05, dur: 0.3, at: i * 0.06 }); }); };
  A.dusk = function () { [12, 9, 7, 4, 0].forEach(function (n, i) { pluck(note(n), 0.09, i * 0.22); }); };
  A.dawn = function () { [0, 4, 7, 12].forEach(function (n, i) { pluck(note(n), 0.09, i * 0.16); }); for (let i = 0; i < 3; i++) tone(2400 + i * 300, { vol: 0.03, dur: 0.09, at: 0.7 + i * 0.13, to: 3000 + i * 250 }); };
  A.learn = function () { [0, 7, 12, 16, 19].forEach(function (n, i) { pluck(note(n), 0.11, i * 0.06); }); };
  A.card = function () { tone(700, { vol: 0.05, dur: 0.06, to: 900 }); };
  A.goal = function () { [7, 12, 16, 19, 24].forEach(function (n, i) { pluck(note(n), 0.12, i * 0.09); }); };
  A.gust = function () { noise({ freq: 300, to: 900, q: 1.2, vol: 0.16, dur: 1.3, att: 0.5 }); };
  A.huddle = function () { [-12, -5, 0, 4].forEach(function (n) { tone(note(n), { type: "triangle", vol: 0.1, dur: 0.9, att: 0.03 }); }); };
  A.huddleMiss = function () { tone(110, { type: "sine", vol: 0.1, dur: 0.35, to: 80 }); };
  A.shiver = function () { noise({ freq: 220, q: 5, vol: 0.05, dur: 0.15 }); };
  A.dead = function () { [7, 4, 0, -5].forEach(function (n, i) { tone(note(n - 12), { type: "sine", vol: 0.1, dur: 1.4, at: i * 0.5, att: 0.1 }); }); };
  A.spring = function () { [0, 4, 7, 12, 16, 19, 24].forEach(function (n, i) { pluck(note(n), 0.12, i * 0.11); }); };
  A.jar = function () { tone(1500, { vol: 0.07, dur: 0.25 }); tone(2250, { vol: 0.04, dur: 0.3, at: 0.03 }); };
  A.note = function () { tone(note(19), { vol: 0.05, dur: 0.18 }); tone(note(24), { vol: 0.05, dur: 0.26, at: 0.1 }); };

  return {
    boot: boot, play: function (name, arg) { if (A[name]) A[name](arg); },
    setSeason: setSeason, mix: mixTo,
    setOn: function (v) { on = !!v; if (master) ramp(master.gain, on ? 0.9 : 0, 0.1); },
    setMusic: function (v) { music = !!v; },
    suspend: function () { if (ac && ac.state === "running") ac.suspend(); },
    resume: function () { if (ac && ac.state === "suspended") ac.resume(); }
  };
}

root.HiveSound = { create: create };
})(typeof self !== "undefined" ? self : this);
