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
  if (cond) console.log("ok    " + what);
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

/* ================= the actual audio ================= */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log((CHROME ? "playwright-core is not installed" : "no chromium on this machine") +
              " — the model is checked, the rendering is not.");
  console.log(failed ? "\n" + failed + " problem" + (failed > 1 ? "s" : "") + " with the way the pieces sound"
                     : "\nevery material and every weight has its own voice");
  process.exit(failed ? 1 : 0);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
  ".css": "text/css", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
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
  /* brightness: zero crossings in the first fortieth of a second after
     the piece lands, which is a crude spectral centroid and enough to
     tell a pawn from a king */
  const land = plan.dur / 1000 * plan.travel;
  let lzc = 0, lp = 0;
  for (let i = Math.round(land * SR); i < Math.min(d.length, Math.round((land + 0.025) * SR)); i++) {
    if ((d[i] >= 0) !== (lp >= 0)) lzc++;
    lp = d[i];
  }
  return {
    peak: peak, rms: Math.sqrt(energy / d.length), zc: zc, tail: last,
    /* how long it goes on ringing after it is put down, which is the
       thing a material actually decides — the drag before it is not
       part of the ring */
    ring: Math.max(0, last - land),
    land: land, landZc: lzc,
    travelRms: win(0.01, land * 0.92),
    landRms: win(land, land + 0.06),
    dur: plan.dur
  };
}`;

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
    /* a bare page with just the two modules: no game, no canvas, nothing
       to go wrong but the synth */
    await page.goto(base + "/chess/", { waitUntil: "domcontentloaded" });
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
       MATS.map((m) => m + " " + out[m].ring.toFixed(2) + "s").join(", "));
    ok("glass rings at least three times as long as wood",
       out.glass.ring > out.wood.ring * 3,
       out.glass.ring.toFixed(2) + "s vs " + out.wood.ring.toFixed(2) + "s");
    ok("no material is still ringing after two seconds",
       MATS.every((m) => out[m].tail < 2), MATS.map((m) => out[m].tail.toFixed(2)).join(", "));

    /* weight, heard rather than computed */
    const pawn = await render(Object.assign({}, base0, { material: "ivory", move: MOVE.pawn }));
    const king = await render(Object.assign({}, base0, { material: "ivory", move: MOVE.king }));
    if (VERBOSE) console.log("      pawn", JSON.stringify(pawn), "\n      king", JSON.stringify(king));
    ok("a king lands duller and lower than a pawn", king.landZc < pawn.landZc,
       king.landZc + " crossings vs " + pawn.landZc);
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

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the render check ran", false, e.message);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failed ? "\n" + failed + " problem" + (failed > 1 ? "s" : "") + " with the way the pieces sound"
                     : "\nevery material and every weight has its own voice, and the knight slides on nothing");
  process.exit(failed ? 1 : 0);
})();
