/* sound-check.js — dev-only. Does a glass king sound like a glass king?

   There is no way to test a sound except to listen to it, and a machine
   listens by looking at samples. So this does both halves: the model's
   numbers are checked here in node, where they are just arithmetic, and
   then a real browser renders the actual audio into an
   OfflineAudioContext and the samples are measured.

   What it is actually asking:
     - does every material ring for a different length of time, in the
       order the materials suggest — ink and wood dead almost at once,
       glass and metal going on;
     - does a heavier piece land lower and louder than a lighter one;
     - does anything clip;
     - and the one the whole thing was built for: does a piece that
       slides make a noise all the way across the board, while a knight
       — which is carried — makes none.

   And of the room's music — the stings that replaced the beeps:
     - is every moment written down, in one key, with every voice
       starting and ending at silence inside the length its sting
       promises (read off the scores in node, then heard in the browser);
     - does every sting actually sound, never clip, and stop when it
       said it would;
     - is a mate a bigger, longer thing than a plain win, and is the
       check you are in a different figure from the check you give;
     - does the reverb really leave a tail, and is the room wide;
     - does a count climb when it counts up;
     - and is off really off: a muted room renders silence, a mute
       fades what is already playing and its echo, and the room tone,
       switched off, leaves nothing running;
     - and is a moment asked for before anybody has touched the page
       let go, rather than saved up for the first tap.

   Needs `playwright-core` for the second half; the first half runs
   anywhere. A missing browser skips the render and still checks the
   model.

   Run: node chess/tools/sound-check.js [--verbose]                     */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
const VERBOSE = process.argv.indexOf("--verbose") >= 0;
let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what + (VERBOSE && detail != null && detail !== "" ? "  (" + detail + ")" : ""));
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

global.self = global;
const Motion = require("../motion.js");
const Sound = require("../sound.js");

const MATS = ["ink", "wood", "ivory", "porcelain", "glass", "metal"];
const MEN = ["pawn", "knight", "bishop", "rook", "queen", "king"];
const SKIN = { board: { gloss: 0.22, grain: 0.55 }, pieces: { material: "ivory" } };
const SURF = Sound.surfaceOf(SKIN);

/* ================= the model ================= */

/* materials ring for different lengths, in the order a material would */
(function () {
  const tail = MATS.map((m) => Sound.voiceFor(m, "king", SURF).tail);
  let rising = true;
  for (let i = 1; i < tail.length; i++) if (tail[i] <= tail[i - 1]) rising = false;
  ok("each material rings longer than the one before it", rising,
     MATS.map((m, i) => m + " " + tail[i].toFixed(2)).join(", "));
  ok("a dead material is dead inside a fifth of a second",
     Sound.voiceFor("ink", "king", SURF).tail < 0.2 &&
     Sound.voiceFor("wood", "king", SURF).tail < 0.25);
  ok("a ringing one is still going after half a second",
     Sound.voiceFor("glass", "king", SURF).tail > 0.5 &&
     Sound.voiceFor("metal", "king", SURF).tail > 0.5);
  /* A struck block of something homogeneous rings at roughly
     1 : 2.76 : 5.40 : 8.93 — the free-bar series. Porcelain, glass and
     ivory sit on it, which is why they have a pitch you could sing.
     Metal does not, which is why a bell does not. */
  const BAR = [1, 2.76, 5.40, 8.93, 12.4];
  const offBar = (ms) => {
    let n = 0;
    for (let i = 1; i < ms.length; i++) n += Math.abs(ms[i] - BAR[i]) / BAR[i];
    return n / (ms.length - 1);
  };
  const metal = offBar(Sound.MATERIALS.metal.modes);
  const barlike = ["porcelain", "glass"].map((m) => offBar(Sound.MATERIALS[m].modes));
  ok("metal is a bell where the others are bars",
     barlike.every((v) => metal > v * 3),
     "metal " + metal.toFixed(3) + " off the bar series vs " +
     barlike.map((v) => v.toFixed(3)).join(", "));
})();

/* weight: lower and louder, every step up the set */
(function () {
  let lower = true, louder = true, deeper = true;
  for (let i = 1; i < MEN.length; i++) {
    const a = Sound.voiceFor("ivory", MEN[i - 1], SURF);
    const b = Sound.voiceFor("ivory", MEN[i], SURF);
    if (b.f0 > a.f0) lower = false;
    if (b.level < a.level) louder = false;
    if (b.thump.f > a.thump.f) deeper = false;
  }
  ok("every piece up the set rings lower than the last", lower,
     MEN.map((p) => p + " " + Sound.voiceFor("ivory", p, SURF).f0.toFixed(0)).join(", "));
  ok("…and lands harder", louder);
  ok("…and puts more weight through the table", deeper);
  const pawn = Sound.voiceFor("ivory", "pawn", SURF), king = Sound.voiceFor("ivory", "king", SURF);
  ok("a pawn and a king are most of an octave apart",
     pawn.f0 / king.f0 > 1.35 && pawn.f0 / king.f0 < 2.2,
     (pawn.f0 / king.f0).toFixed(2) + "×");
  /* the squat piece is the dull one, whatever it weighs */
  const rook = Sound.voiceFor("glass", "rook", SURF), bishop = Sound.voiceFor("glass", "bishop", SURF);
  ok("the squat rook keeps less shimmer than the slim bishop",
     rook.modes[2].gain < bishop.modes[2].gain,
     rook.modes[2].gain.toFixed(3) + " vs " + bishop.modes[2].gain.toFixed(3));
})();

/* the board is part of the sound */
(function () {
  const matte = Sound.voiceFor("ivory", "king", Sound.surfaceOf({ board: { gloss: 0, grain: 0 } }));
  const gloss = Sound.voiceFor("ivory", "king", Sound.surfaceOf({ board: { gloss: 1, grain: 0 } }));
  ok("a polished board is a harder, brighter contact than a matte one",
     gloss.click.hz > matte.click.hz && gloss.level > matte.level && gloss.click.len < matte.click.len,
     gloss.click.hz.toFixed(0) + "Hz vs " + matte.click.hz.toFixed(0) + "Hz");
  const smooth = Sound.voiceFor("ivory", "king", Sound.surfaceOf({ board: { gloss: 0.2, grain: 0 } }));
  const rough = Sound.voiceFor("ivory", "king", Sound.surfaceOf({ board: { gloss: 0.2, grain: 1 } }));
  ok("a textured board drags noisier", rough.scrape.gain > smooth.scrape.gain * 1.5,
     rough.scrape.gain.toFixed(4) + " vs " + smooth.scrape.gain.toFixed(4));
})();

/* friction, which is the whole point */
(function () {
  const area = (k, from, to) => {
    const c = Sound.frictionCurve(Motion.plan({ piece: k, from, to }), 64);
    let s = 0; for (const v of c) s += v;
    return s / c.length;
  };
  const knight = area(2, 0x01, 0x22);
  const sliders = [[1, 0x14, 0x34], [3, 0x05, 0x32], [4, 0x00, 0x07], [5, 0x03, 0x77], [6, 0x04, 0x05]];
  ok("a carried knight hardly touches the board", knight < 0.1, knight.toFixed(3));
  ok("every piece that slides, drags the whole way",
     sliders.every(([k, f, t]) => area(k, f, t) > knight * 3),
     sliders.map(([k, f, t]) => Sound.KIND[k] + " " + area(k, f, t).toFixed(2)).join(", "));

  /* the shape of the drag is the shape of the move: a rook shoves and
     coasts, a king is slow at both ends */
  const peakAt = (k, from, to) => {
    const c = Sound.frictionCurve(Motion.plan({ piece: k, from, to }), 64);
    let bi = 0; for (let i = 0; i < c.length; i++) if (c[i] > c[bi]) bi = i;
    return bi / (c.length - 1);
  };
  ok("the rook's drag is loudest early and the king's in the middle",
     peakAt(4, 0x00, 0x07) < 0.35 && Math.abs(peakAt(6, 0x04, 0x05) - 0.5) < 0.2,
     "rook " + peakAt(4, 0x00, 0x07).toFixed(2) + ", king " + peakAt(6, 0x04, 0x05).toFixed(2));

  /* a curve that does not start and end at silence is a click */
  let clicky = null, odd = null;
  for (const k of [1, 2, 3, 4, 5, 6]) {
    const c = Sound.frictionCurve(Motion.plan({ piece: k, from: 0x00, to: 0x33 }), 48);
    if (c[0] !== 0 || c[c.length - 1] !== 0) clicky = Sound.KIND[k];
    for (const v of c) if (!(v >= 0 && v <= 1.0001)) odd = Sound.KIND[k] + " " + v;
  }
  ok("no drag starts or stops with a click", !clicky, clicky);
  ok("no drag asks for a gain outside 0..1", !odd, odd);

  /* heavier and further means louder */
  const lvl = (k, from, to, mat) => {
    const pl = Motion.plan({ piece: k, from, to });
    return Sound.frictionLevel(Sound.voiceFor(mat || "ivory", Sound.KIND[k], SURF), pl);
  };
  ok("a queen crossing the board drags louder than a pawn stepping once",
     lvl(5, 0x03, 0x77) > lvl(1, 0x14, 0x34) * 1.6,
     lvl(5, 0x03, 0x77).toFixed(4) + " vs " + lvl(1, 0x14, 0x34).toFixed(4));
  ok("glass slides easier than wood",
     lvl(5, 0x03, 0x77, "glass") < lvl(5, 0x03, 0x77, "wood"));
})();

/* nothing in the model is ever NaN, negative or absurd */
(function () {
  let bad = null;
  for (const m of MATS) for (const p of MEN) for (const g of [0, 0.5, 1]) {
    const v = Sound.voiceFor(m, p, Sound.surfaceOf({ board: { gloss: g, grain: g } }));
    const nums = [v.f0, v.level, v.tail, v.thump.f, v.thump.gain, v.thump.decay,
                  v.click.gain, v.click.hz, v.click.q, v.click.len,
                  v.scrape.hz, v.scrape.q, v.scrape.gain, v.lift.gain, v.lift.hz]
      .concat(v.modes.map((x) => x.f)).concat(v.modes.map((x) => x.gain))
      .concat(v.modes.map((x) => x.decay));
    for (const n of nums) if (!isFinite(n) || n < 0) bad = bad || m + "/" + p + " " + n;
    if (v.f0 < 80 || v.f0 > 4000) bad = bad || m + "/" + p + " f0 " + v.f0;
    for (const md of v.modes) if (md.f > 18000) bad = bad || m + "/" + p + " mode " + md.f;
    if (v.tail > 2) bad = bad || m + "/" + p + " rings for " + v.tail;
  }
  ok("every voice is finite, audible and over inside two seconds", !bad, bad);
  ok("an unknown material falls back rather than throwing",
     Sound.voiceFor("unobtainium", "king", SURF).f0 > 0);
  ok("so does an unknown piece", Sound.voiceFor("ivory", "wizard", SURF).f0 > 0);
  ok("a move with no plan asks for no drag", Sound.frictionLevel(Sound.voiceFor("ivory", "king", SURF), null) === 0);
})();

/* ================= the music, as data ================= */

/* the options each sting can be asked with, so every shape it can
   take is checked rather than only its default */
const VARIANTS = {
  check: [{}, { against: true }],
  "capture-big": [{ piece: 5 }, { piece: -4 }, { piece: "q" }, { piece: "rook" }],
  promote: [{ piece: 5 }, { piece: 4 }, { piece: 3 }, { piece: -2 }, {}],
  "low-time": [{}, { left: 0 }, { left: 5 }, { left: 10 }, { left: 99 }],
  tick: [{}, { tock: true }],
  count: [{ i: 0, n: 10, up: true }, { i: 10, n: 10, up: true }, { i: 3, n: 10, up: false }, { i: 0, n: 0 }]
};
const variantsOf = (k) => VARIANTS[k] || [{}];
const tailOf = (sc) => (sc.send > 0 ? Sound.REVERB.seconds + Sound.REVERB.predelay : 0);
const everyScore = (fn) => {
  for (const k of Sound.STING_KINDS) for (const o of variantsOf(k)) for (const reduced of [false, true]) {
    fn(k, Object.assign({}, o, { reduced }), Sound.score(k, Object.assign({}, o, { reduced })));
  }
};
const pitched = (e) => e.hz == null && Sound.TIMBRES[e.w] && Sound.TIMBRES[e.w].type !== "air";
const meanHz = (sc) => {
  const p = sc.events.filter(pitched);
  return p.reduce((a, e) => a + Sound.noteHz(e.n), 0) / p.length;
};

(function () {
  const OLD = ["check", "win", "lose", "draw", "tick", "link", "hint"];
  ok("every signal the room used to beep still has a voice",
     OLD.every((k) => Sound.STINGS[k]), OLD.filter((k) => !Sound.STINGS[k]).join(", "));
  const ASKED = ["start", "check", "capture-big", "promote", "mate-win", "mate-lose", "win", "lose",
                 "draw", "hint", "lesson-right", "lesson-wrong", "lesson-done", "levelup", "rating-up",
                 "rating-down", "milestone", "tap", "open", "close", "low-time", "tick", "link"];
  ok("every moment the room asks for is written down",
     ASKED.every((k) => Sound.STINGS[k]), ASKED.filter((k) => !Sound.STINGS[k]).join(", "));
  ok("an unknown moment scores as nothing rather than throwing", Sound.score("fireworks") === null);

  /* the arithmetic underneath */
  ok("the room's key note is D, and A is 440",
     Math.abs(Sound.noteHz(0) - 293.665) < 0.01 && Math.abs(Sound.noteHz(7) - 440) < 1e-9 &&
     Math.abs(Sound.noteHz(19) - 880) < 1e-9);
  ok("chords are spelled the way a musician would say them",
     JSON.stringify(Sound.chord(0, "maj")) === "[0,4,7]" &&
     JSON.stringify(Sound.chord(-3, "min")) === "[-3,0,4]" &&
     JSON.stringify(Sound.chord(5, "maj7")) === "[5,9,12,16]" &&
     JSON.stringify(Sound.chord(0, "nonsense")) === "[0,4,7]");

  /* every note is a real note on a real instrument */
  let bad = null;
  everyScore((k, o, sc) => {
    if (!sc || !sc.events.length) { bad = bad || k + " " + JSON.stringify(o) + " is empty"; return; }
    for (const e of sc.events) {
      const where = k + " " + JSON.stringify(o) + " " + JSON.stringify(e);
      if (!Sound.TIMBRES[e.w]) bad = bad || where + ": no such instrument";
      if (!(e.t >= 0) || !isFinite(e.t)) bad = bad || where + ": time";
      if (!(e.v > 0 && e.v <= 1.2)) bad = bad || where + ": velocity";
      const atoms = Sound.voicePlan(e);
      if (!atoms.length) bad = bad || where + ": plays nothing";
      for (const a of atoms) {
        const nums = [a.f, a.end].concat(a.f2 ? [a.f2] : []).concat(a.pts.map((p) => p[0])).concat(a.pts.map((p) => p[1]));
        if (nums.some((x) => !isFinite(x) || x < 0)) bad = bad || where + ": " + JSON.stringify(a);
        if (a.f < 20 || a.f > 16000) bad = bad || where + ": " + a.f.toFixed(0) + " Hz";
      }
    }
  });
  ok("every note in every sting names a real instrument and an audible pitch", !bad, bad);

  /* the two places a synth clicks are the first sample and the last */
  let clicky = null;
  everyScore((k, o, sc) => {
    for (const e of sc.events) for (const a of Sound.voicePlan(e)) {
      const first = a.pts[0], last = a.pts[a.pts.length - 1];
      let order = true;
      for (let i = 1; i < a.pts.length; i++) if (a.pts[i][0] < a.pts[i - 1][0]) order = false;
      if (first[1] !== 0 || first[2] !== "set" || last[1] !== 0 || !order)
        clicky = clicky || k + " " + e.w + " " + JSON.stringify(a.pts);
    }
  });
  ok("every voice starts from silence and comes back to it", !clicky, clicky);

  /* the promise each sting makes about its own length */
  let over = null, slack = null;
  const most = {};
  everyScore((k, o, sc) => {
    const need = Sound.dryEnd(sc) + tailOf(sc);
    if (need > sc.len + 1e-9) over = over || k + " " + JSON.stringify(o) + " needs " + need.toFixed(2) + "s, promises " + sc.len;
    most[k] = Math.max(most[k] || 0, need);
  });
  for (const k of Sound.STING_KINDS) if (Sound.STINGS[k].len - most[k] > 0.4)
    slack = slack || k + " promises " + Sound.STINGS[k].len + "s and needs at most " + most[k].toFixed(2) + "s";
  ok("every sting is over, reverb and all, inside the length it promises", !over, over);
  ok("…and promises no more than it needs", !slack, slack);

  /* less motion: the harmony stays, the glitter and the sweeps go */
  let glitter = null, sweep = null, longer = null;
  for (const k of Sound.STING_KINDS) for (const o of variantsOf(k)) {
    const full = Sound.score(k, o), calm = Sound.score(k, Object.assign({}, o, { reduced: true }));
    if (calm.events.some((e) => e.fl)) glitter = glitter || k;
    if (calm.events.some((e) => e.w === "air" && e.to != null && e.to !== e.from)) sweep = sweep || k;
    if (Sound.dryEnd(calm) > Sound.dryEnd(full) + 1e-9) longer = longer || k;
  }
  ok("asking for less motion drops every sparkle", !glitter, glitter);
  ok("…and every sweep", !sweep, sweep);
  ok("…and never makes a sting longer", !longer, longer);
  ok("…but still says something every time",
     Sound.STING_KINDS.every((k) => Sound.score(k, { reduced: true }).events.length > 0));
  ok("the celebrations do have sparkles to drop",
     ["mate-win", "milestone", "levelup", "lesson-done"].every((k) =>
       Sound.score(k, {}).events.some((e) => e.fl)));

  /* One key for the whole room. The single exception is the check you
     are in, which borrows its B-flat from the minor on purpose. */
  const D_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
  let stray = null;
  for (const k of Sound.STING_KINDS) for (const o of variantsOf(k)) {
    if (k === "check" && o.against) continue;
    for (const e of Sound.score(k, o).events) {
      if (!pitched(e)) continue;
      if (!D_MAJOR.has(((e.n % 12) + 12) % 12)) stray = stray || k + " " + JSON.stringify(o) + " note " + e.n;
    }
  }
  ok("every written note is in D major", !stray, stray);
  ok("…except the check you are in, which really is borrowed from the minor",
     Sound.score("check", { against: true }).events.some((e) => pitched(e) && !D_MAJOR.has(((e.n % 12) + 12) % 12)));

  /* the moments that have to mean something particular */
  const given = Sound.score("check", {}), received = Sound.score("check", { against: true });
  ok("the check you give and the check you are in are different figures",
     JSON.stringify(given.events.map((e) => [e.w, e.n])) !== JSON.stringify(received.events.map((e) => [e.w, e.n])));
  ok("…and the one you are in sits lower", meanHz(received) < meanHz(given) * 0.8,
     meanHz(received).toFixed(0) + " Hz vs " + meanHz(given).toFixed(0) + " Hz");
  ok("…and falls where the other rises",
     (() => {
       const top = (sc, t) => Math.max(...sc.events.filter((e) => pitched(e) && Math.abs(e.t - t) < 1e-6).map((e) => e.n));
       return top(given, 0.1) > top(given, 0) && top(received, 0.15) < top(received, 0);
     })());

  const bloomVoices = (sc) => {
    let best = 0;
    for (const e of sc.events) best = Math.max(best, sc.events.filter((x) => x.t >= e.t && x.t < e.t + 0.12).length);
    return best;
  };
  const mate = Sound.score("mate-win", {}), win = Sound.score("win", {});
  ok("a mate is a fanfare: longer than a plain win",
     Sound.dryEnd(mate) > Sound.dryEnd(win) + 0.8 && mate.events[mate.events.length - 1].t > 1,
     Sound.dryEnd(mate).toFixed(2) + "s vs " + Sound.dryEnd(win).toFixed(2) + "s");
  ok("…with more voices in its bloom", bloomVoices(mate) > bloomVoices(win),
     bloomVoices(mate) + " vs " + bloomVoices(win));

  /* being mated: minor chord first, a major chord on the home note last */
  const lose = Sound.score("mate-lose", {}).events.filter((e) => e.w === "felt");
  const first = lose.filter((e) => e.t < 0.2).map((e) => ((e.n % 12) + 12) % 12);
  const lastT = Math.max(...lose.map((e) => e.t));
  const end = lose.filter((e) => e.t > lastT - 0.2);
  const endPc = end.map((e) => ((e.n % 12) + 12) % 12);
  ok("being mated begins in the minor and comes home to the major",
     first.includes(9) && first.includes(0) && first.includes(4) &&                /* B D F# */
     Math.min(...end.map((e) => e.n)) % 12 === 0 && endPc.includes(4) && endPc.includes(7),  /* D F# A */
     "first " + first + ", last " + endPc);

  const cap = (p) => Sound.score("capture-big", { piece: p }).events.find((e) => e.w === "thump").hz;
  ok("a queen coming off the board lands lower than a rook", cap(5) < cap(4) && cap("q") === cap(5),
     cap(5) + " Hz vs " + cap(4) + " Hz");

  const figure = (p) => JSON.stringify(Sound.score("promote", { piece: p }).events.filter((e) => e.w === "chime").map((e) => e.n));
  const figs = [5, 4, 3, 2].map(figure);
  ok("every promotion has its own figure", new Set(figs).size === 4, figs.join(" "));
  ok("…and the queen's is the longest",
     [4, 3, 2].every((p) => JSON.parse(figure(5)).length > JSON.parse(figure(p)).length));

  const beat2 = (left) => Sound.score("low-time", { left }).events[1].t;
  ok("the heartbeat quickens as the clock runs down", beat2(1) < beat2(9) && beat2(0) <= beat2(1),
     beat2(9).toFixed(3) + "s → " + beat2(1).toFixed(3) + "s");

  /* a count climbs when it counts up, and falls when it counts down */
  let climbs = true, falls = true;
  for (const n of [5, 10, 37]) {
    for (let i = 1; i <= n; i++) {
      if (Sound.countTickPitch(i, n, true) < Sound.countTickPitch(i - 1, n, true)) climbs = false;
      if (Sound.countTickPitch(i, n, false) > Sound.countTickPitch(i - 1, n, false)) falls = false;
    }
    if (!(Sound.countTickPitch(n, n, true) > Sound.countTickPitch(0, n, true) * 3)) climbs = false;
    if (!(Sound.countTickPitch(n, n, false) < Sound.countTickPitch(0, n, false) / 3)) falls = false;
  }
  ok("a count climbs as it counts up", climbs,
     [0, 5, 10].map((i) => Sound.countTickPitch(i, 10, true).toFixed(0)).join(" → ") + " Hz");
  ok("…and falls as it counts down", falls);
  ok("…and a count of nothing is still a note",
     [Sound.countTickPitch(0, 0), Sound.countTickPitch(NaN, undefined), Sound.countTickPitch(9, 3, true)]
       .every((f) => isFinite(f) && f >= Sound.noteHz(12) - 1e-9 && f <= Sound.noteHz(36) + 1e-9));

  /* with no audio anywhere (node), the music is a polite no-op */
  let threw = null;
  try {
    ok("with no audio to play into, a sting quietly plays nothing", Sound.sting("mate-win") === 0);
    Sound.countTick(3, 10, true); Sound.ui("check"); Sound.ui("tick");
    ok("the room tone remembers what it was set to", Sound.ambience(0.4) === 0.4 && Sound.ambience() === 0.4);
    ok("…and off is off", Sound.ambience(0) === 0 && !Sound.ambienceLive());
  } catch (e) { threw = e.message; }
  ok("nothing in the music throws without an audio context", !threw, threw);
})();

/* the room, grown rather than recorded */
(function () {
  const SR = 22050;
  const a = Sound.impulseResponse(SR), b = Sound.impulseResponse(SR);
  const L = a[0], R = a[1];
  ok("the room is the same room every time it is grown",
     L.length === b[0].length && L.every((v, i) => v === b[0][i]));
  ok("it is stereo, and as long as it says",
     a.length === 2 && Math.abs(L.length / SR - Sound.REVERB.seconds) < 0.01);
  const pre = Math.round(SR * Sound.REVERB.predelay);
  ok("the first reflection takes a moment to arrive, and then does",
     L.slice(0, pre).every((v) => v === 0) && L.slice(pre, pre + 400).some((v) => Math.abs(v) > 1e-4));
  ok("it ends in silence rather than a step", L[L.length - 1] === 0 && R[R.length - 1] === 0);
  const rms = (d, s, e) => {
    let q = 0; for (let i = Math.round(s * SR); i < Math.round(e * SR); i++) q += d[i] * d[i];
    return Math.sqrt(q / (Math.round(e * SR) - Math.round(s * SR)));
  };
  /* how bright a stretch of it is: the energy of its slope over the
     energy of itself, which is the width of its spectrum in disguise */
  const bright = (d, s, e) => {
    let a = 0, q = 0;
    for (let i = Math.round(s * SR) + 1; i < Math.round(e * SR); i++) { a += (d[i] - d[i - 1]) ** 2; q += d[i] * d[i]; }
    return Math.sqrt(a / q) * SR / (2 * Math.PI);
  };
  let decays = true;
  const steps = [];
  for (let t = 0.05; t + 0.2 <= 2.0; t += 0.2) {
    steps.push(rms(L, t, t + 0.2));
    if (steps.length > 1 && !(steps[steps.length - 1] < steps[steps.length - 2])) decays = false;
  }
  ok("it dies away, every fifth of a second quieter than the last", decays,
     steps.map((v) => (20 * Math.log10(v)).toFixed(0)).join(" ") + " dB");
  const drop = 20 * Math.log10(rms(L, 0.05, 0.25) / rms(L, 1.45, 1.65));
  ok("…by about the sixty decibels a room loses over its reverberation time",
     drop > 35 && drop < 80, drop.toFixed(0) + " dB over 1.4s");
  ok("…and the highs go first, the way air takes them",
     bright(L, 1.2, 1.6) < bright(L, 0.02, 0.4) * 0.6,
     bright(L, 0.02, 0.4).toFixed(0) + " Hz → " + bright(L, 1.2, 1.6).toFixed(0) + " Hz wide");
  let lr = 0, ll = 0, rr = 0;
  for (let i = 0; i < L.length; i++) { lr += L[i] * R[i]; ll += L[i] * L[i]; rr += R[i] * R[i]; }
  const corr = lr / Math.sqrt(ll * rr);
  ok("the two ears hear different rooms, which is what makes it wide", Math.abs(corr) < 0.1, corr.toFixed(3));
  const energy = (x) => { let e = 0; for (const v of x) e += v * v; return e; };
  const e44 = Sound.impulseResponse(44100), e48 = Sound.impulseResponse(48000);
  ok("it is as loud at 48k as at 44.1k",
     Math.abs(energy(e44[0]) + energy(e44[1]) - 2) < 0.01 && Math.abs(energy(e48[0]) + energy(e48[1]) - 2) < 0.01,
     ((energy(e44[0]) + energy(e44[1])) / 2).toFixed(4) + " vs " + ((energy(e48[0]) + energy(e48[1])) / 2).toFixed(4));
})();

/* ================= the actual audio ================= */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log((CHROME ? "playwright-core is not installed" : "no chromium on this machine") +
              " — the model is checked, the rendering is not.");
  console.log(failed ? "\n" + failed + " problem" + (failed > 1 ? "s" : "") + " with the way the room sounds"
                     : "\nevery material and every weight has its own voice, and every moment its own music");
  process.exit(failed ? 1 : 0);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
  ".css": "text/css", ".ico": "image/x-icon" };
/* A bare page with just the two modules and one big button: no game,
   no canvas, nothing to go wrong but the synth. The button wakes the
   synth on pointerdown, the way the board does in the room. Opened as
   #over, it does what the room does when it restores a game that turns
   out to be finished: asks for the ending as the page loads, before
   anybody has touched anything. (That has to happen in the page's own
   script: the checker's evaluate() counts as a tap.) */
const BARE = "/chess/tools/__sound-check.html";
const BARE_HTML = '<!doctype html><meta charset="utf-8"><title>sound-check</title>' +
  '<button id="tap" style="position:fixed;left:0;top:0;width:100%;height:100%">tap</button>' +
  '<script src="/chess/motion.js"></script><script src="/chess/sound.js"></script>' +
  '<script>document.getElementById("tap").addEventListener("pointerdown", function () {' +
  ' Sound.wake(); if (window.onTap) window.onTap(); });' +
  ' if (location.hash === "#over") { Sound.enable(true); window.said = Sound.sting("mate-win");' +
  ' Sound.countTick(1, 2, true); }</script>';
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === BARE) { res.writeHead(200, { "Content-Type": "text/html" }); res.end(BARE_HTML); return; }
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("not found"); return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

/* render one gesture and hand back everything measurable about it */
const RENDER = `async (spec) => {
  const SR = 44100, len = Math.round(SR * spec.seconds);
  const oc = new OfflineAudioContext(1, len, SR);
  Sound.useContext(oc);
  Sound.enable(true);
  Sound.setSkin({ board: { gloss: spec.gloss, grain: spec.grain },
                  pieces: { material: spec.material } });
  const plan = Motion.plan(spec.move, {});
  Sound.move(spec.move, plan, { captured: spec.captured || 0 });
  const buf = await oc.startRendering();
  const d = buf.getChannelData(0);
  let peak = 0, energy = 0, zc = 0, prev = 0;
  const win = (a, b) => {
    let e = 0, n = 0;
    for (let i = Math.max(0, Math.round(a * SR)); i < Math.min(d.length, Math.round(b * SR)); i++) { e += d[i] * d[i]; n++; }
    return n ? Math.sqrt(e / n) : 0;
  };
  for (let i = 0; i < d.length; i++) {
    const v = d[i];
    if (Math.abs(v) > peak) peak = Math.abs(v);
    energy += v * v;
    if ((v >= 0) !== (prev >= 0)) zc++;
    prev = v;
  }
  /* how long after the last impact anything is still audible */
  const floor = peak * 0.0012;
  let last = 0;
  for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) > floor) { last = i / SR; break; }
  /* brightness as the piece lands. Zero crossings in the first
     fortieth of a second used to stand in for it, but a burst of contact
     noise moves them by a dozen either way and a king and a pawn
     overlapped about one run in three. The energy of the slope over the
     energy of the signal, across the first twentieth, is the width of
     the spectrum in disguise and does not wobble. */
  const land = plan.dur / 1000 * plan.travel;
  let lzc = 0, lp = 0, slope = 0, body = 0;
  for (let i = Math.round(land * SR); i < Math.min(d.length, Math.round((land + 0.025) * SR)); i++) {
    if ((d[i] >= 0) !== (lp >= 0)) lzc++;
    lp = d[i];
  }
  for (let i = Math.round(land * SR) + 1; i < Math.min(d.length, Math.round((land + 0.05) * SR)); i++) {
    slope += (d[i] - d[i - 1]) * (d[i] - d[i - 1]); body += d[i] * d[i];
  }
  /* The ring is timed above 200 Hz. Below that is the weight of the
     piece going through the table, which every material shares and
     which lasts longer than ink or wood ring at all — timing the whole
     signal timed the thud, and put ink and wood a millisecond apart. */
  const w0 = 2 * Math.PI * 200 / SR, al = Math.sin(w0) / (2 * Math.SQRT1_2), cw = Math.cos(w0);
  const b0 = (1 + cw) / 2 / (1 + al), b1 = -(1 + cw) / (1 + al), a1 = -2 * cw / (1 + al), a2 = (1 - al) / (1 + al);
  const hi = new Float32Array(d.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, hpeak = 0;
  for (let i = 0; i < d.length; i++) {
    const y = b0 * d[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = d[i]; y2 = y1; y1 = y; hi[i] = y;
    if (Math.abs(y) > hpeak) hpeak = Math.abs(y);
  }
  let hlast = 0;
  for (let i = hi.length - 1; i >= 0; i--) if (Math.abs(hi[i]) > hpeak * 0.0012) { hlast = i / SR; break; }
  return {
    peak: peak, rms: Math.sqrt(energy / d.length), zc: zc, tail: last,
    /* how long the body goes on ringing after it is put down, which is
       the thing a material actually decides — the drag before it is
       not part of the ring, and nor is the thud under it */
    ring: Math.max(0, hlast - land),
    land: land, landZc: lzc, landBright: body ? Math.sqrt(slope / body) * SR / (2 * Math.PI) : 0,
    travelRms: win(0.01, land * 0.92),
    landRms: win(land, land + 0.06),
    dur: plan.dur
  };
}`;

/* ---------- the music, rendered ----------
   Every sting here is played half a second in. A compressor straight
   out of the box starts clamped down and takes a moment to open up —
   the same clock tick measures 13 dB quieter at the very first sample
   than a second later — and in the room it has been running long
   before anything is asked of it. Measuring from a cold start would be
   measuring the compressor. */
const WARM = 0.5;
const MUSIC = `async (spec) => {
  const SR = 44100;
  const oc = new OfflineAudioContext(spec.channels || 1, Math.round(SR * spec.seconds), SR);
  Sound.useContext(oc);
  Sound.enable(true);
  Sound.setReduced(!!spec.reduced);
  let returned = 0;
  const run = (calls) => {
    for (const c of calls) {
      if (c[0] === "sting") returned = Math.max(returned, Sound.sting(c[1], c[2] || {}) || 0);
      else if (c[0] === "ui") Sound.ui(c[1]);
      else if (c[0] === "count") Sound.countTick(c[1], c[2], c[3]);
      else if (c[0] === "ambience") Sound.ambience(c[1]);
      else if (c[0] === "enable") Sound.enable(c[1]);
      else if (c[0] === "move") Sound.move(c[1], Motion.plan(c[1], {}), c[2] || {});
    }
  };
  run(spec.calls || []);
  const busy = Sound.busy();
  for (const [at, calls] of spec.later || []) {
    oc.suspend(at).then(() => { run(calls); oc.resume().catch(() => {}); });
  }
  const buf = await oc.startRendering();
  const ambienceLive = Sound.ambienceLive();
  Sound.ambience(0); Sound.enable(true); Sound.setReduced(null);

  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const d = chans[0];
  const idx = (t) => Math.max(0, Math.min(d.length, Math.round(t * SR)));
  const rmsOf = (a, b) => {
    let q = 0, n = 0;
    for (let i = idx(a); i < idx(b); i++) { q += d[i] * d[i]; n++; }
    return n ? Math.sqrt(q / n) : 0;
  };
  let peak = 0, energy = 0;
  for (const x of chans) for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]); if (v > peak) peak = v; energy += x[i] * x[i];
  }
  /* where it has died to a thousandth of its peak, and where it is
     truly nothing */
  let tail = 0, lastAbs = 0;
  for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) > peak * 1e-3) { tail = i / SR; break; }
  for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) > 1e-6) { lastAbs = i / SR; break; }
  /* the loudest tenth of a second, and the bloom: the six tenths that
     follow it */
  const W = Math.round(SR * 0.1);
  let loud = 0, loudAt = 0;
  for (let s = 0; s + W <= d.length; s += W >> 2) {
    let q = 0; for (let i = s; i < s + W; i++) q += d[i] * d[i];
    q = Math.sqrt(q / W); if (q > loud) { loud = q; loudAt = s / SR; }
  }
  const zcOf = (a, b) => {
    let n = 0; for (let i = idx(a) + 1; i < idx(b); i++) if ((d[i] >= 0) !== (d[i - 1] >= 0)) n++;
    return n / (b - a);
  };
  const stepOf = (a, b) => {
    let m = 0; for (let i = idx(a) + 1; i < idx(b); i++) m = Math.max(m, Math.abs(d[i] - d[i - 1]));
    return m;
  };
  let width = null;
  if (chans.length === 2 && spec.width) {
    let s = 0, df = 0;
    for (let i = idx(spec.width[0]); i < idx(spec.width[1]); i++) {
      const l = chans[0][i], r = chans[1][i]; s += (l + r) * (l + r); df += (l - r) * (l - r);
    }
    width = s ? Math.sqrt(df / s) : 0;
  }
  return {
    returned, busy, ambienceLive, peak, energy, rms: Math.sqrt(energy / (d.length * chans.length)),
    tail, lastAbs, loud, loudAt, bloom: rmsOf(loudAt, loudAt + 0.6),
    windows: (spec.windows || []).map((w) => rmsOf(w[0], w[1])),
    zc: (spec.zc || []).map((w) => zcOf(w[0], w[1])),
    steps: (spec.steps || []).map((w) => stepOf(w[0], w[1])),
    width
  };
}`;

async function musicChecks(render) {
  const dB = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(0) + " dB" : "silence");
  const sting = (kind, opts, extra) => render(Object.assign({
    seconds: WARM + Sound.STINGS[kind].len + 0.3,
    calls: [["sting", kind, Object.assign({ delay: WARM }, opts || {})]]
  }, extra || {}));
  const name = (k, o) => k + (Object.keys(o).length ? " " + JSON.stringify(o) : "");

  /* every sting, and every shape of one that sounds different */
  const LIST = Sound.STING_KINDS.map((k) => [k, k === "count" ? { i: 4, n: 10, up: true } : {}])
    .concat([["check", { against: true }], ["capture-big", { piece: 4 }], ["promote", { piece: 2 }],
             ["low-time", { left: 1 }], ["tick", { tock: true }], ["open", { reduced: true }],
             ["mate-win", { reduced: true }]]);
  const got = [];
  for (const [k, o] of LIST) got.push([k, o, await sting(k, o)]);
  if (VERBOSE) for (const [k, o, r] of got) {
    console.log("      " + name(k, o).padEnd(34) + " peak " + r.peak.toFixed(3) + "  loudest " + dB(r.loud) +
                "  died " + (r.tail - WARM).toFixed(2) + "s  silent " + (r.lastAbs - WARM).toFixed(2) +
                "s  promised " + Sound.STINGS[k].len + "s");
  }
  const R = (k, o) => got.find(([kk, oo]) => kk === k && JSON.stringify(oo) === JSON.stringify(o || {}))[2];
  const fails = (pred, show) => got.filter(pred).map(show || (([k, o]) => name(k, o))).join(", ");

  ok("every sting makes a sound", !fails(([, , r]) => !(r.rms > 1e-6)),
     fails(([, , r]) => !(r.rms > 1e-6)));
  ok("no sting clips", !fails(([, , r]) => !(r.peak < 1)),
     fails(([, , r]) => !(r.peak < 1), ([k, o, r]) => name(k, o) + " " + r.peak.toFixed(2)));
  ok("every sting has died away inside the length it promises",
     !fails(([k, , r]) => r.tail > WARM + Sound.STINGS[k].len + 0.01),
     fails(([k, , r]) => r.tail > WARM + Sound.STINGS[k].len + 0.01,
           ([k, o, r]) => name(k, o) + " " + (r.tail - WARM).toFixed(2) + "s > " + Sound.STINGS[k].len));
  ok("…and is nothing at all after it, reverb included",
     !fails(([k, , r]) => r.lastAbs > WARM + Sound.STINGS[k].len + 0.01),
     fails(([k, , r]) => r.lastAbs > WARM + Sound.STINGS[k].len + 0.01,
           ([k, o, r]) => name(k, o) + " " + (r.lastAbs - WARM).toFixed(2) + "s"));
  ok("Sound.sting says how long it will ring",
     !fails(([k, , r]) => r.returned !== Sound.STINGS[k].len),
     fails(([k, , r]) => r.returned !== Sound.STINGS[k].len, ([k, o, r]) => name(k, o) + " said " + r.returned));

  /* the old way in still works, through the new voices */
  const OLD = ["check", "win", "lose", "draw", "tick", "link", "hint"];
  const viaUi = [];
  for (const k of OLD) {
    viaUi.push([k, await render({ seconds: WARM + Sound.STINGS[k].len + 0.2, later: [[WARM, [["ui", k]]]] })]);
  }
  ok("every old Sound.ui kind still plays", viaUi.every(([, r]) => r.rms > 1e-6 && r.peak < 1),
     viaUi.filter(([, r]) => !(r.rms > 1e-6 && r.peak < 1)).map(([k]) => k).join(", "));
  const tickZc = { zc: [[WARM + 0.012, WARM + 0.04]], seconds: WARM + 0.3 };
  const t1 = await render(Object.assign({ later: [[WARM, [["ui", "tick"]]]] }, tickZc));
  const t2 = await render(Object.assign({ later: [[WARM, [["ui", "tick"]]]] }, tickZc));
  ok("the clock goes tick, tock — a different note each second",
     Math.abs(t1.zc[0] - t2.zc[0]) / Math.max(t1.zc[0], t2.zc[0]) > 0.12,
     t1.zc[0].toFixed(0) + " vs " + t2.zc[0].toFixed(0) + " crossings/s");

  /* the moments that have to mean something particular */
  const mate = R("mate-win"), win = R("win");
  ok("a mate rings on longer than a plain win", mate.tail > win.tail + 0.8,
     (mate.tail - WARM).toFixed(2) + "s vs " + (win.tail - WARM).toFixed(2) + "s");
  ok("…and blooms louder", mate.bloom > win.bloom * 1.15 && mate.energy > win.energy * 1.5,
     "bloom " + dB(mate.bloom) + " vs " + dB(win.bloom) + ", energy " + (mate.energy / win.energy).toFixed(1) + "×");
  /* (that the calm one has dropped its sparkles is proved on the score
     above; three quiet chimes are well inside the few percent of
     velocity every note is given, so it is not measured here) */
  const calm = R("mate-win", { reduced: true });
  ok("…and with less motion asked for it is still the whole fanfare",
     calm.bloom > mate.bloom * 0.8 && calm.tail > win.tail + 0.8,
     "bloom " + dB(calm.bloom) + " vs " + dB(mate.bloom) + ", rings " + (calm.tail - WARM).toFixed(2) + "s");

  const zcWin = { zc: [[WARM, WARM + 0.7]] };
  const given = await sting("check", {}, zcWin), received = await sting("check", { against: true }, zcWin);
  ok("the check you are in is heard as a different figure from the check you give",
     given.zc[0] > received.zc[0] * 1.3,
     given.zc[0].toFixed(0) + " vs " + received.zc[0].toFixed(0) + " crossings/s");
  ok("…and is no louder: careful, not alarmed", received.loud < given.loud * 1.25,
     dB(received.loud) + " vs " + dB(given.loud));

  const bigQ = R("capture-big"), bigR = R("capture-big", { piece: 4 });
  ok("a queen coming off lands with more weight than a rook", bigQ.energy > bigR.energy,
     (bigQ.energy / bigR.energy).toFixed(2) + "×");

  /* the room, heard */
  const de = Sound.dryEnd(Sound.score("hint", {}));
  const roomWin = { windows: [[WARM + 0.6, WARM + 1.2], [WARM + de + 0.05, WARM + de + 0.9]] };
  const wet = await sting("hint", {}, roomWin), dry = await sting("hint", { send: 0 }, roomWin);
  ok("the reverb is heard while the notes are dying",
     wet.windows[0] > dry.windows[0] * 2, dB(wet.windows[0]) + " with the room vs " + dB(dry.windows[0]) + " without");
  ok("…and goes on after they have stopped",
     wet.windows[1] > 1e-5 && dry.windows[1] === 0, dB(wet.windows[1]) + " vs " + dB(dry.windows[1]));
  /* Width, measured where only the room can be making it: after the
     last note of a sting whose notes are all in the middle. (The hint
     pans its chimes, which would be wide with a mono room too.) */
  const ding = Sound.dryEnd(Sound.score("lesson-right", {}));
  ok("…the moment heard here has every note in the middle",
     Sound.score("lesson-right", {}).events.every((e) => e.pan === "c"));
  const wide = await sting("lesson-right", {}, { channels: 2, width: [WARM + ding + 0.05, WARM + ding + 1.2] });
  const narrow = await sting("tap", {}, { channels: 2, width: [WARM, WARM + 0.1] });
  ok("the room is wide: the two ears hear different echoes of a centred note", wide.width > 0.3, wide.width.toFixed(2));
  ok("…while a dry, centred tap is the same in both", narrow.width < 0.01, narrow.width.toFixed(3));

  /* a count, climbing */
  const at = (i, up) => render({ seconds: WARM + 0.3, later: [[WARM, [["count", i, 10, up]]]],
                                 zc: [[WARM + 0.012, WARM + 0.04]] });
  const up = [await at(0, true), await at(5, true), await at(10, true)];
  const down = [await at(0, false), await at(10, false)];
  ok("a count rises as it counts up",
     up[0].zc[0] < up[1].zc[0] && up[1].zc[0] < up[2].zc[0],
     up.map((r) => r.zc[0].toFixed(0)).join(" → ") + " crossings/s");
  ok("…and falls as it counts down", down[0].zc[0] > down[1].zc[0] * 2,
     down.map((r) => r.zc[0].toFixed(0)).join(" → "));
  ok("…and is very light", Math.max(...up.map((r) => r.peak)) < R("lesson-right").peak * 0.15,
     Math.max(...up.map((r) => r.peak)).toFixed(3) + " vs a lesson's " + R("lesson-right").peak.toFixed(3));

  /* off is off */
  const muted = await render({ seconds: WARM + 3, calls: [["enable", false],
    ["sting", "mate-win", { delay: WARM }], ["ui", "check"], ["count", 3, 10, true], ["ambience", 0.8],
    ["move", { piece: 5, from: 0x03, to: 0x77 }, { captured: -4 }]] });
  ok("a muted room renders silence — stings, counts, room tone, pieces", muted.peak === 0 && !muted.ambienceLive,
     muted.peak);
  const fadeWin = { windows: [[WARM + 1.0, WARM + 1.6], [WARM + 0.7, WARM + 3]] };
  const playing = await render(Object.assign({ seconds: WARM + 3, calls: [["sting", "mate-win", { delay: WARM }]] }, fadeWin));
  const hushed = await render(Object.assign({ seconds: WARM + 3, calls: [["sting", "mate-win", { delay: WARM }]],
                                              later: [[WARM + 0.6, [["enable", false]]]] }, fadeWin));
  ok("a mute fades a fanfare that is already playing", hushed.windows[0] < playing.windows[0] * 0.2,
     dB(hushed.windows[0]) + " vs " + dB(playing.windows[0]));
  ok("…and a tenth of a second later it is silence, echo and all", hushed.windows[1] === 0,
     dB(hushed.windows[1]) + " after the mute, against " + dB(playing.windows[1]) + " left playing");
  /* and back on, the room has its echo again */
  const tailAt = (t) => [[t + ding + 0.1, t + ding + 1.0]];
  const back = await render({ seconds: 3.4, calls: [["sting", "hint", { delay: 0.1 }]],
    later: [[0.4, [["enable", false]]], [0.6, [["enable", true], ["sting", "lesson-right", {}]]]], windows: tailAt(0.6) });
  const plainly = await render({ seconds: 3.4, later: [[0.6, [["sting", "lesson-right", {}]]]], windows: tailAt(0.6) });
  ok("…and with the sound back on, so is the room's echo",
     back.windows[0] > plainly.windows[0] * 0.5, dB(back.windows[0]) + " vs " + dB(plainly.windows[0]) + " never muted");

  /* the room tone */
  const none = await render({ seconds: 2, calls: [["ambience", 0]] });
  ok("the room tone is silence when it is off", none.peak === 0 && !none.ambienceLive);
  const toneOn = await render({ seconds: 3, calls: [["ambience", 0.6]], windows: [[1.5, 3]] });
  ok("…is there when it is on", toneOn.windows[0] > 1e-5 && toneOn.ambienceLive, dB(toneOn.windows[0]));
  ok("…but barely: far under any moment", toneOn.loud < R("lesson-right").loud * 0.3 && toneOn.peak < 0.2,
     dB(toneOn.loud) + " vs a lesson's " + dB(R("lesson-right").loud));
  const toneOff = await render({ seconds: 3.4, calls: [["ambience", 0.6]], later: [[1.4, [["ambience", 0]]]],
                                 windows: [[1.1, 1.4], [2.45, 3.4]], steps: [[0.9, 1.4], [1.4, 2.45]] });
  ok("…and switched off, it fades, stops, and leaves nothing running",
     toneOff.windows[0] > 1e-5 && toneOff.windows[1] === 0 && !toneOff.ambienceLive,
     dB(toneOff.windows[0]) + " then " + dB(toneOff.windows[1]));
  ok("…without a click", toneOff.steps[1] <= toneOff.steps[0] * 1.5,
     toneOff.steps[1].toExponential(2) + " vs " + toneOff.steps[0].toExponential(2) + " while steady");

  /* everything at once */
  const pile = await render({ seconds: WARM + 6,
    calls: Sound.STING_KINDS.map((k) => ["sting", k, Object.assign({ delay: WARM }, k === "count" ? { i: 1, n: 2 } : {})]),
    later: [[WARM, [["move", { piece: 1, from: 0x60, to: 0x73, promo: 5 }, { captured: -5 }]]]] });
  ok("every moment at once still does not clip", pile.peak < 1, pile.peak.toFixed(2));
  ok("…and stays inside the voice budget", pile.busy <= Sound.MAX_VOICES, pile.busy + " of " + Sound.MAX_VOICES);
  /* the realistic worst case: a pawn takes a queen, promotes, and mates */
  const bloomAt = [[WARM + 1.3, WARM + 1.9]];
  const alone = await render({ seconds: WARM + 2.2, calls: [["sting", "mate-win", { delay: WARM }]], windows: bloomAt });
  const crowded = await render({ seconds: WARM + 2.2, calls: [
      ["move", { piece: 1, from: 0x60, to: 0x71, promo: 5 }, { captured: -5 }],
      ["move", { piece: 5, from: 0x03, to: 0x63 }, { captured: -4 }],
      ["sting", "mate-win", { delay: WARM }]], windows: bloomAt });
  ok("a mate on top of a crowded move still lands its last chord",
     crowded.windows[0] > alone.windows[0] * 0.6, dB(crowded.windows[0]) + " vs " + dB(alone.windows[0]) + " alone");

  /* the pieces themselves */
  const qMove = { piece: 3, from: 0x02, to: 0x46 };
  const withBig = await render({ seconds: WARM + 3, later: [[WARM, [["move", qMove, { captured: -5 }]]]] });
  const without = await render({ seconds: WARM + 3, later: [[WARM, [["move", qMove, { captured: -5, big: false }]]]] });
  ok("taking a queen puts a low weight under the capture", withBig.energy > without.energy * 1.2,
     (withBig.energy / without.energy).toFixed(2) + "×");
  ok("…and still does not clip", withBig.peak < 1, withBig.peak.toFixed(2));
  const pMove = { piece: 1, from: 0x60, to: 0x70, promo: 5 };
  const crowned = await render({ seconds: WARM + 3, later: [[WARM, [["move", pMove, {}]]]] });
  const plain = await render({ seconds: WARM + 3, later: [[WARM, [["move", pMove, { ceremony: false }]]]] });
  ok("a promotion shimmers up out of the flash", crowned.energy > plain.energy * 1.5 && crowned.peak < 1,
     (crowned.energy / plain.energy).toFixed(2) + "×");
}

/* ---------- before anybody has touched the page ----------
   A browser will not start an audio clock until somebody touches the
   page, and the checker's browser is let off that rule. So this page
   puts it back: an AudioContext that stays stopped until it is resumed
   inside a real tap, and whose earlier resume() calls wait until then,
   the way the specification says they do. */
const STOPPED_UNTIL_TAPPED = `(() => {
  const Real = window.AudioContext;
  const stateOf = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "state").get;
  let open = false;
  const waiting = [];
  window.AudioContext = function (o) {
    const c = new Real(o), resume = c.resume.bind(c);
    c.suspend();
    Object.defineProperty(c, "state", { get: () => (open ? stateOf.call(c) : "suspended") });
    c.resume = function () {
      if (navigator.userActivation && navigator.userActivation.isActive) {
        open = true;
        return resume().then(() => { waiting.splice(0).forEach((f) => f()); });
      }
      return new Promise((res) => waiting.push(res));
    };
    window.__ac = c;
    return c;
  };
  window.AudioContext.prototype = Real.prototype;
})();`;

async function wakeChecks(browser, base, errs) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errs.push("" + e.message));
  await page.addInitScript(STOPPED_UNTIL_TAPPED);
  const open = async (hash) => {
    await page.goto(base + BARE + (hash || ""), { waitUntil: "load" });
    await page.waitForFunction("typeof Sound !== 'undefined'");
  };
  const state = () => page.evaluate(() => ({ busy: Sound.busy(), clock: window.__ac ? window.__ac.state : "none" }));

  /* a game restored at boot that turns out to be over asks for its
     ending before anybody has touched anything */
  await open("#over");
  const atBoot = await state();
  await page.waitForTimeout(900);
  await page.click("#tap");
  await page.waitForTimeout(400);
  const firstTap = await state();
  ok("a moment asked for before anybody has touched the page is not saved up for the first tap",
     atBoot.busy === 0 && firstTap.clock === "running" && firstTap.busy === 0,
     "at boot " + JSON.stringify(atBoot) + ", after the first tap " + JSON.stringify(firstTap));

  /* and the one that matters: the very first sound of the session, asked
     for inside the tap that starts the clock */
  await open();
  await page.evaluate(() => { Sound.enable(true); window.onTap = () => { window.said = Sound.sting("check"); }; });
  await page.click("#tap");
  await page.waitForTimeout(300);
  const inTap = await state();
  const said = await page.evaluate(() => window.said);
  ok("…while one asked for inside the tap that starts the clock is heard",
     inTap.clock === "running" && inTap.busy > 0 && said === Sound.STINGS.check.len,
     JSON.stringify(inTap) + ", said " + said);
  await page.close();
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME, args: ["--mute-audio"] });
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("" + e.message));

  const render = (spec) => page.evaluate(`(${RENDER})(${JSON.stringify(spec)})`);
  const MOVE = { pawn: { piece: 1, from: 0x14, to: 0x34 }, knight: { piece: 2, from: 0x01, to: 0x22 },
                 rook: { piece: 4, from: 0x00, to: 0x07 }, queen: { piece: 5, from: 0x03, to: 0x77 },
                 king: { piece: 6, from: 0x04, to: 0x05 } };

  try {
    await page.goto(base + BARE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction("typeof Sound !== 'undefined' && typeof Motion !== 'undefined'");

    const base0 = { seconds: 3, gloss: 0.22, grain: 0.55 };
    const out = {};
    for (const m of MATS) out[m] = await render(Object.assign({}, base0, { material: m, move: MOVE.king }));
    if (VERBOSE) for (const m of MATS) console.log("      ", m, JSON.stringify(out[m]));

    ok("every material actually makes a sound",
       MATS.every((m) => out[m].rms > 1e-5), JSON.stringify(MATS.map((m) => out[m].rms.toFixed(5))));
    ok("nothing clips", MATS.every((m) => out[m].peak < 1),
       MATS.map((m) => m + " " + out[m].peak.toFixed(2)).join(", "));
    let ringing = true;
    for (let i = 1; i < MATS.length; i++) if (out[MATS[i]].ring <= out[MATS[i - 1]].ring) ringing = false;
    ok("rendered, each material rings longer than the one before it", ringing,
       MATS.map((m) => m + " " + out[m].ring.toFixed(3) + "s").join(", "));
    ok("glass rings at least three times as long as wood",
       out.glass.ring > out.wood.ring * 3,
       out.glass.ring.toFixed(2) + "s vs " + out.wood.ring.toFixed(2) + "s");
    ok("no material is still ringing after two seconds",
       MATS.every((m) => out[m].tail < 2), MATS.map((m) => out[m].tail.toFixed(2)).join(", "));

    /* weight, heard rather than computed */
    const pawn = await render(Object.assign({}, base0, { material: "ivory", move: MOVE.pawn }));
    const king = await render(Object.assign({}, base0, { material: "ivory", move: MOVE.king }));
    if (VERBOSE) console.log("      pawn", JSON.stringify(pawn), "\n      king", JSON.stringify(king));
    ok("a king lands duller and lower than a pawn", king.landBright < pawn.landBright * 0.9,
       king.landBright.toFixed(0) + " Hz wide vs " + pawn.landBright.toFixed(0));
    ok("…and lands louder", king.landRms > pawn.landRms,
       king.landRms.toFixed(4) + " vs " + pawn.landRms.toFixed(4));

    /* the friction claim, in samples: a rook sliding the whole board is
       audible the whole way, a knight being carried is not */
    const rook = await render(Object.assign({}, base0, { material: "wood", move: MOVE.rook }));
    const knight = await render(Object.assign({}, base0, { material: "wood", move: MOVE.knight }));
    if (VERBOSE) console.log("      rook", JSON.stringify(rook), "\n      knight", JSON.stringify(knight));
    ok("a sliding rook is heard the whole way across the board",
       rook.travelRms > 1e-5, rook.travelRms.toFixed(6));
    ok("a carried knight is silent until it lands",
       knight.travelRms < rook.travelRms * 0.4,
       knight.travelRms.toFixed(6) + " vs " + rook.travelRms.toFixed(6));
    ok("both of them are clearly heard landing",
       knight.landRms > knight.travelRms && rook.landRms > 1e-4);

    /* the board under them */
    const matte = await render({ seconds: 3, gloss: 0, grain: 0, material: "ivory", move: MOVE.queen });
    const polished = await render({ seconds: 3, gloss: 1, grain: 1, material: "ivory", move: MOVE.queen });
    ok("a polished, textured board is louder than a bare matte one",
       polished.rms > matte.rms, polished.rms.toFixed(5) + " vs " + matte.rms.toFixed(5));

    /* a capture is three impacts, not one, and still does not clip */
    const quiet = await render(Object.assign({}, base0, { material: "glass", move: MOVE.queen }));
    const capture = await render(Object.assign({}, base0, { material: "glass", move: MOVE.queen, captured: -5 }));
    ok("a capture is louder than the same move without one",
       capture.rms > quiet.rms * 1.1, capture.rms.toFixed(5) + " vs " + quiet.rms.toFixed(5));
    ok("…and still does not clip", capture.peak < 1, capture.peak.toFixed(2));

    /* castling and promotion render without blowing up */
    const castle = await render({ seconds: 3, gloss: 0.22, grain: 0.55, material: "metal",
      move: { piece: 6, from: 0x04, to: 0x06, rookFrom: 0x07, rookTo: 0x05 } });
    ok("a castle is two pieces and sounds like it", castle.rms > 1e-5 && castle.peak < 1,
       JSON.stringify(castle));
    const promo = await render({ seconds: 3, gloss: 0.22, grain: 0.55, material: "porcelain",
      move: { piece: 1, from: 0x60, to: 0x70, promo: 5 } });
    ok("a promotion rings in the new piece", promo.rms > 1e-5 && promo.peak < 1, JSON.stringify(promo));

    await musicChecks((spec) => page.evaluate(`(${MUSIC})(${JSON.stringify(spec)})`), page);
    await wakeChecks(browser, base, errs);

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the render check ran", false, e.message);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failed ? "\n" + failed + " problem" + (failed > 1 ? "s" : "") + " with the way the room sounds"
                     : "\nevery material and every weight has its own voice, the knight slides on nothing," +
                       " and every moment in the room has its own music");
  process.exit(failed ? 1 : 0);
})();
