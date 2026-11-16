/* stage-check.js — the soundstage: is it fun, and is it still lovely the
   hundredth time?

   A machine cannot say whether a sound is lovely. It can say most of the
   things that make one tiresome, and it says them here:

   In node, the instruments, the music and the piece voices as data:
     - every instrument renders a finite note that starts and ends in
       silence, at the pitch asked for, and dies away;
     - every place's music is in D major (the key of every other sound in
       the room), keeps to sensible registers, is sparse enough to sit
       under a game, rests every few minutes, never plays the same tune
       twice running, is the same from the same seed and different from
       another;
     - each piece has a voice of its own; a pawn walking up the board
       climbs; yours are brighter than theirs; a capture pays out more
       notes for a bigger piece, starting higher for each in a row, and
       every one of those notes is in the key too;
     - each place has its own small sounds, laid out the same way twice.

   In a browser, rendered into an OfflineAudioContext and measured:
     - every place's music sounds, never clips, and sits well under the
       room's own moments; the places sound unlike each other;
     - the music steps aside (ducks) for a fanfare and comes back, goes
       quiet when a game ends, and is silence when sound is off;
     - a lively move is a fuller sound than a natural one; a capture in a
       row rings higher; the other side's moves are softer and lower;
     - a piece heard in the grand room rings on longer than in the park;
     - every place's room tone, with its small sounds, sounds and never
       clips.

   Run: node chess/tools/stage-check.js                                    */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

global.self = global;
const Sound = require("../sound.js");
const Stage = require("../stage.js");

/* ---------------- node: the instruments ---------------- */
const SR = 44100;
const pitchOf = (a, from, to) => {
  /* the strongest period by autocorrelation, between from and to seconds */
  const s = Math.round(SR * from), n = Math.round(SR * (to - from));
  let best = -1, bl = 0;
  for (let L = 12; L < 1200; L++) {
    let c = 0; for (let i = s; i < s + n; i++) c += a[i] * a[i + L];
    if (c > best) { best = c; bl = L; }
  }
  return SR / bl;
};
const rmsOf = (a, from, to) => {
  let q = 0, n = 0;
  for (let i = Math.round(SR * from); i < Math.min(a.length, Math.round(SR * to)); i++) { q += a[i] * a[i]; n++; }
  return n ? Math.sqrt(q / n) : 0;
};
{
  const bad = [], off = [], live = [];
  for (const id of Stage.INSTRUMENT_IDS) {
    const a = Stage.renderNote(id, 69, SR);
    let peak = 0, nan = 0;
    for (const v of a) { if (!isFinite(v)) nan++; peak = Math.max(peak, Math.abs(v)); }
    if (nan || peak > 1 || peak < 0.1 || Math.abs(a[0]) > 1e-3 || Math.abs(a[a.length - 1]) > 1e-3) bad.push(id);
    if (!(rmsOf(a, a.length / SR * 0.85, a.length / SR) < rmsOf(a, 0, 0.1) * 0.25)) live.push(id);
    /* the pitched ones that are meant to have a pitch you can sing */
    if (["kalimba", "celesta", "harp", "guitar", "bass", "epiano", "piano"].indexOf(id) >= 0) {
      const f = pitchOf(a, 0.05, 0.15), cents = 1200 * Math.log2(f / 440);
      if (Math.abs(cents) > 30 && Math.abs(Math.abs(cents) - 1200) > 30) off.push(id + "=" + f.toFixed(1) + "Hz");
    }
  }
  ok("every instrument plays a finite note that starts and ends in silence", !bad.length, bad.join(", "));
  ok("…in tune: an A is an A", !off.length, off.join(", "));
  ok("…and dies away rather than droning", !live.length, live.join(", "));
  const lo = Stage.renderNote("harp", 50, SR), hi = Stage.renderNote("harp", 86, SR);
  ok("a plucked string is in tune at both ends of the harp",
     Math.abs(1200 * Math.log2(pitchOf(lo, 0.05, 0.2) / Stage.hzOf(50))) < 30 &&
     Math.abs(1200 * Math.log2(pitchOf(hi, 0.02, 0.08) / Stage.hzOf(86))) < 30);
}

/* ---------------- node: the music ---------------- */
{
  const BARS = 64, out = {}, stray = [], reg = [], dense = [], quiet = [], rest = [];
  for (const p of Stage.PLACES) {
    const ev = Stage.compose(p, 4242, 0, BARS), notes = ev.filter((e) => e.midi != null);
    out[p] = ev;
    notes.forEach((e) => { if (!Stage.inKey(e.midi)) stray.push(p + ":" + e.midi); });
    if (notes.some((e) => e.midi < 33 || e.midi > 100)) reg.push(p);
    const bars = new Set(ev.map((e) => e.bar));
    const perBar = notes.length / Math.max(1, bars.size);
    if (perBar > 16) dense.push(p + "=" + perBar.toFixed(1));
    if (perBar < 2) quiet.push(p + "=" + perBar.toFixed(1));
    /* a rest of at least four bars in every cycle */
    const cycle = Stage.PHRASE * (Stage.REST_EVERY + 1);
    let longest = 0, run = 0;
    for (let b = 0; b < BARS; b++) { if (bars.has(b)) run = 0; else { run++; longest = Math.max(longest, run); } }
    if (longest < 4 || BARS / cycle < 1) rest.push(p + " rests " + longest);
  }
  ok("every place's music is in D major, the key of the whole room", !stray.length, stray.slice(0, 8).join(", "));
  ok("…in registers a phone speaker plays and an ear enjoys", !reg.length, reg.join(", "));
  ok("…sparse enough to sit under a game, never empty", !dense.length && !quiet.length, dense.concat(quiet).join(", "));
  ok("…and it rests every few minutes, to let the room breathe", !rest.length, rest.join(", "));
  const same = JSON.stringify(Stage.compose("park", 9, 0, 16)) === JSON.stringify(Stage.compose("park", 9, 0, 16));
  const diff = JSON.stringify(Stage.compose("park", 9, 0, 16)) !== JSON.stringify(Stage.compose("park", 10, 0, 16));
  ok("the same seed writes the same music, another seed another", same && diff);
  /* the tune of each phrase is not the tune of the phrase before */
  const repeats = [];
  for (const p of Stage.PLACES) {
    const tune = (ph) => out[p].filter((e) => e.tune && Math.floor(e.bar / Stage.PHRASE) === ph).map((e) => e.midi).join(",");
    for (let ph = 2; ph < 8; ph += 2) { const a = tune(ph - 2), b = tune(ph); if (a && b && a === b) repeats.push(p + "@" + ph); }
  }
  ok("a tune is never played twice running", !repeats.length, repeats.join(", "));
  const tempi = Stage.PLACES.map((p) => Stage.PLACE_MUSIC[p].bpm + "/" + Stage.PLACE_MUSIC[p].meter);
  ok("every place has a feel of its own (tempo and metre)", new Set(tempi).size === Stage.PLACES.length, tempi.join(" "));
  const insts = Stage.PLACES.map((p) => [...new Set(out[p].filter((e) => e.inst).map((e) => e.inst))].sort().join("+"));
  ok("…and instruments of its own", new Set(insts).size === Stage.PLACES.length, insts.join(" | "));
  ok("the café swings", out.cafe.some((e) => Math.abs((e.beat % 1) - Stage.PLACE_MUSIC.cafe.swing) < 1e-6));
  ok("a bar can be written without the ones before it",
     JSON.stringify(Stage.compose("salon", 3, 5, 1)) === JSON.stringify(Stage.compose("salon", 3, 0, 6).filter((e) => e.bar === 5)));
}

/* ---------------- node: the pieces ---------------- */
{
  const r = () => 0.5;
  const v = (m, o) => Stage.voicing(m, Object.assign({ rnd: r, land: 0.3 }, o || {}));
  const first = (m, o) => v(m, o).filter((n) => !n.hop)[0];
  const sig = [1, 2, 3, 4, 5, 6].map((k) => v({ piece: k, to: 0x34 }).map((n) => n.inst).join("+"));
  ok("every piece has a voice of its own", new Set(sig).size === 6, sig.join(" | "));
  const walk = [1, 2, 3, 4, 5, 6].map((rk) => first({ piece: 1, to: rk * 16 + 4 }).midi);
  ok("a pawn walking up the board climbs a scale", walk.every((m, i) => !i || m > walk[i - 1]), walk.join(" "));
  const bwalk = [6, 5, 4, 3, 2, 1].map((rk) => first({ piece: -1, to: rk * 16 + 4 }).midi);
  ok("…for Black too, from Black's side", bwalk.every((m, i) => !i || m > bwalk[i - 1]), bwalk.join(" "));
  ok("your moves are brighter than theirs, and theirs softer",
     first({ piece: 3, to: 0x22 }).midi - first({ piece: 3, to: 0x22 }, { mine: false }).midi === 12 &&
     first({ piece: 3, to: 0x22 }).vel > first({ piece: 3, to: 0x22 }, { mine: false }).vel);
  ok("the knight leaves the board with a hop and lands clip-clop",
     (() => { const n = v({ piece: 2, to: 0x25 }); return n[0].hop && n[0].at < n[1].at && n.filter((x) => x.inst === "woodblock").length === 3; })());
  const pay = (cap, chain) => v({ piece: 1, to: 0x34 }, { captured: cap, chain: chain }).filter((n) => n.inst === "celesta").map((n) => n.midi);
  ok("a capture pays out more notes for a bigger piece", pay(1, 1).length === 1 && pay(3, 1).length === 2 && pay(4, 1).length === 3 && pay(5, 1).length === 4,
     [1, 3, 4, 5].map((k) => pay(k, 1).length).join(" "));
  const chain = [1, 2, 3, 4, 5].map((c) => pay(5, c)[0]);
  ok("…and each capture in a row starts higher", chain.every((m, i) => !i || m > chain[i - 1]), chain.join(" "));
  ok("…every note of every pay-out a major chord in the key",
     [1, 2, 3, 4, 5].every((c) => { const p = pay(5, c); return p.every(Stage.inKey) && p[1] - p[0] === 4 && p[2] - p[1] === 3; }));
  ok("…and every piece's note, anywhere on the board, is in the key too",
     [1, 2, 3, 4, 5, 6].every((k) => { for (let sq = 0; sq < 128; sq++) if (!(sq & 0x88)) for (const n of v({ piece: k, to: sq }, { captured: 4, chain: 2 })) if (n.inst !== "pop" && !Stage.inKey(n.midi)) return false; return true; }));
  ok("taking from you is a softer, lower thing than taking from them",
     (() => { const mine = v({ piece: 1, to: 0x34 }, { captured: 5 }), theirs = v({ piece: 1, to: 0x34 }, { captured: 5, mine: false });
              return theirs.length < mine.length && Math.max(...theirs.map((n) => n.vel)) < Math.max(...mine.map((n) => n.vel)); })());
  ok("where it lands is where you hear it: a-file left, h-file right",
     first({ piece: 1, to: 0x30 }).pan < 0 && first({ piece: 1, to: 0x37 }).pan > 0);
  ok("a castle brings its rook's drum", v({ piece: 6, to: 0x06, rookFrom: 0x07 }).some((n) => n.inst === "tom"));
}

/* ---------------- node: each place's small sounds ---------------- */
{
  const kinds = {};
  for (const p of Sound.PLACES) kinds[p] = [...new Set(Sound.ambiencePlan(p, 240, 5).map((x) => x.E.kind))].sort().join(",");
  ok("every place but the studio has small sounds of its own", Sound.PLACES.filter((p) => p !== "studio").every((p) => kinds[p].split(",").length >= 3) &&
     new Set(Sound.PLACES.map((p) => kinds[p])).size === Sound.PLACES.length, JSON.stringify(kinds));
  ok("…laid out the same way from the same seed", JSON.stringify(Sound.ambiencePlan("park", 30, 3)) === JSON.stringify(Sound.ambiencePlan("park", 30, 3)));
  const rare = Sound.ambiencePlan("cafe", 600, 2).filter((x) => x.E.kind === "doorbell").length;
  ok("…and the rare ones stay rare (the café's door, in ten minutes)", rare >= 2 && rare <= 10, String(rare));
}

/* ---------------- a browser: hearing it ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." :
    "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe soundstage is right on paper (it was not played)");
  process.exit(failed ? 1 : 0);
}

const PAGE = "<!doctype html><meta charset=utf-8><script src=/chess/motion.js></script><script src=/chess/sound.js></script><script src=/chess/stage.js></script>";
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/stage-test.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(PAGE); return; }
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css",
                  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const RENDER = `async (spec) => {
  const SR = 44100;
  const oc = new OfflineAudioContext(2, Math.round(SR * spec.seconds), SR);
  Sound.useContext(oc); Stage.reset(); Stage.setSeed(spec.seed || 7);
  Sound.enable(true); Stage.enable(true);
  Sound.layOutAmbience(!!spec.layout);
  Stage.setLively(spec.lively !== false);
  Sound.setPlace(spec.place || "studio"); Stage.setPlace(spec.place || "studio");
  /* as the room does once the audio clock runs: the place's echo is there */
  Stage.room();
  const run = (calls) => {
    for (const c of calls) {
      if (c[0] === "music") Stage.music(c[1]);
      else if (c[0] === "ambience") Sound.ambience(c[1]);
      else if (c[0] === "mood") Stage.mood(c[1]);
      else if (c[0] === "duck") Stage.duck(c[1], c[2]);
      else if (c[0] === "enable") { Sound.enable(c[1]); Stage.enable(c[1]); }
      else if (c[0] === "sting") Sound.sting(c[1], c[2] || {});
      else if (c[0] === "voice") Stage.move(c[1], Motion.plan(c[1], {}), c[2] || {});
      else if (c[0] === "move") {
        const m = c[1], plan = Motion.plan(m, {});
        Sound.move(m, plan, c[2] || {});
        Stage.move(m, plan, c[2] || {});
      }
    }
  };
  run(spec.calls || []);
  for (const [at, calls] of spec.later || []) oc.suspend(at).then(() => { run(calls); oc.resume().catch(() => {}); });
  const buf = await oc.startRendering();
  Sound.ambience(0); Stage.music(0); Stage.mood("calm"); Sound.layOutAmbience(false);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const idx = (t) => Math.max(0, Math.min(L.length, Math.round(t * SR)));
  const rms = (a, b) => { let q = 0, n = 0; for (let i = idx(a); i < idx(b); i++) { q += L[i] * L[i] + R[i] * R[i]; n += 2; } return n ? Math.sqrt(q / n) : 0; };
  const zc = (a, b) => { let n = 0; for (let i = idx(a) + 1; i < idx(b); i++) if ((L[i] >= 0) !== (L[i - 1] >= 0)) n++; return n / (b - a); };
  let peak = 0; for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  let tail = 0; for (let i = L.length - 1; i >= 0; i--) if (Math.abs(L[i]) > peak * 1e-3) { tail = i / SR; break; }
  const slices = []; for (let t = 0; t + 1 <= spec.seconds; t += 1) slices.push(rms(t, t + 1));
  return { peak, tail, rms: rms(0, spec.seconds), windows: (spec.windows || []).map((w) => rms(w[0], w[1])),
           zc: (spec.zc || []).map((w) => zc(w[0], w[1])), slices };
}`;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  try {
    await page.goto(base + "/stage-test.html");
    await page.waitForFunction(() => window.Stage && window.Sound && window.Motion, null, { timeout: 30000 });
    const render = (spec) => page.evaluate(([f, s]) => eval(f)(s), [RENDER, spec]);
    const dB = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) + " dB" : "silence");

    /* every place's music */
    const music = {};
    for (const p of Stage.PLACES) music[p] = await render({ seconds: 16, place: p, calls: [["music", 1]], zc: [[1, 16]] });
    const bad = Stage.PLACES.filter((p) => !(music[p].rms > 2e-3 && music[p].peak < 0.9));
    ok("every place's music sounds, and never clips", !bad.length,
       Stage.PLACES.map((p) => p + " " + dB(music[p].rms) + " pk " + music[p].peak.toFixed(2)).join(", "));
    const gaps = Stage.PLACES.filter((p) => music[p].slices.slice(2).filter((x) => x < 1e-4).length > 3);
    ok("…and keeps playing (no dead seconds before its rest)", !gaps.length, gaps.join(", "));
    const fan = await render({ seconds: 6, calls: [["sting", "mate-win"]] });
    ok("…well under the room's own moments", Stage.PLACES.every((p) => music[p].rms < fan.rms * 0.8),
       "fanfare " + dB(fan.rms) + "; " + Stage.PLACES.map((p) => p + " " + dB(music[p].rms)).join(", "));
    const zcs = Stage.PLACES.map((p) => Math.round(music[p].zc[0]));
    ok("the places' music sounds unlike each other", new Set(zcs.map((z) => Math.round(z / 40))).size >= 4, zcs.join(" "));

    /* stepping aside */
    const plain = await render({ seconds: 9, place: "cafe", calls: [["music", 1]], windows: [[5.1, 6.4]] });
    const ducked = await render({ seconds: 9, place: "cafe", calls: [["music", 1]], later: [[5, [["duck", 0.65, 1.5]]]], windows: [[5.1, 6.4], [8, 9]] });
    ok("the music steps aside for a fanfare", ducked.windows[0] < plain.windows[0] * 0.6, dB(plain.windows[0]) + " → " + dB(ducked.windows[0]));
    ok("…and comes back after it", ducked.windows[1] > ducked.windows[0] * 1.5, dB(ducked.windows[0]) + " → " + dB(ducked.windows[1]));
    const ended = await render({ seconds: 12, place: "park", calls: [["music", 1]], later: [[4, [["mood", "end"]]]], windows: [[2, 4], [9, 12]] });
    ok("it goes quiet when a game ends", ended.windows[1] < ended.windows[0] * 0.08, dB(ended.windows[0]) + " → " + dB(ended.windows[1]));
    const tense = await render({ seconds: 8, place: "park", calls: [["music", 1], ["mood", "tense"]], zc: [[2, 8]] });
    const calm = await render({ seconds: 8, place: "park", calls: [["music", 1]], zc: [[2, 8]] });
    ok("…and closes in, darker, while a king is in check", tense.zc[0] < calm.zc[0], Math.round(calm.zc[0]) + " → " + Math.round(tense.zc[0]));
    const card = await render({ seconds: 9, place: "cafe", calls: [["music", 1]], later: [[5, [["sting", "open"]]]], windows: [[5.1, 6.4]] });
    ok("…but not for a card opening: only the game's own moments", card.windows[0] > plain.windows[0] * 0.75, dB(plain.windows[0]) + " → " + dB(card.windows[0]));
    const stung = await render({ seconds: 9, place: "cafe", calls: [["music", 1]], later: [[5, [["sting", "check"]]]] });
    ok("…and a check really does step it aside", Stage.DUCK.check > 0.3 && stung.peak < 0.95);
    const off = await render({ seconds: 6, place: "salon", calls: [["enable", false], ["music", 1]] });
    ok("sound off is silence, music and all", off.peak === 0);

    /* the pieces */
    const pawn = { piece: 1, from: 0x14, to: 0x34 };
    const lively = await render({ seconds: 2.5, place: "studio", calls: [["move", pawn, { mine: true }]] });
    const natural = await render({ seconds: 2.5, place: "studio", lively: false, calls: [["move", pawn, { mine: true }]] });
    ok("a lively move is a fuller sound than a natural one, and rings a little on",
       lively.rms > natural.rms * 1.2 && lively.tail > natural.tail, dB(natural.rms) + " → " + dB(lively.rms) + ", tail " + natural.tail.toFixed(2) + " → " + lively.tail.toFixed(2));
    ok("…and never clips", lively.peak < 0.95, lively.peak.toFixed(3));
    /* the game voice alone, yours and theirs, the same move from each side */
    const myVoice = await render({ seconds: 2.5, place: "studio", calls: [["voice", pawn, { mine: true }]], zc: [[0.1, 0.6]] });
    const theirVoice = await render({ seconds: 2.5, place: "studio", calls: [["voice", { piece: -1, from: 0x64, to: 0x44 }, { mine: false }]], zc: [[0.1, 0.6]] });
    ok("the other side's moves are softer and lower than yours", theirVoice.rms < myVoice.rms * 0.85 && theirVoice.zc[0] < myVoice.zc[0] * 0.75,
       dB(theirVoice.rms) + " vs " + dB(myVoice.rms) + ", " + Math.round(theirVoice.zc[0]) + " vs " + Math.round(myVoice.zc[0]) + " crossings/s");
    const cap = (n) => {
      const calls = [];
      for (let i = 0; i < n; i++) calls.push(["move", { piece: 1, from: 0x33, to: 0x44 }, { mine: true, captured: -5 }]);
      return render({ seconds: 2.5, place: "studio", calls: calls.slice(0, n - 1), later: [[0.5, calls.slice(n - 1)]], zc: [[0.9, 1.4]] });
    };
    const c1 = await cap(1), c3 = await cap(3);
    ok("a capture in a row rings higher than the first", c3.zc[0] > c1.zc[0] * 1.05, Math.round(c1.zc[0]) + " → " + Math.round(c3.zc[0]));
    const park = await render({ seconds: 3, place: "park", lively: false, calls: [["move", { piece: 6, from: 0x04, to: 0x14 }, { mine: true }]] });
    const salon = await render({ seconds: 3, place: "salon", lively: false, calls: [["move", { piece: 6, from: 0x04, to: 0x14 }, { mine: true }]] });
    ok("a piece set down in the grand room rings on longer than in the park", salon.tail > park.tail + 0.15, park.tail.toFixed(2) + "s → " + salon.tail.toFixed(2) + "s");

    /* the room tone, with its small sounds */
    const tone = {};
    for (const p of Sound.PLACES) tone[p] = await render({ seconds: 10, place: p, layout: true, calls: [["ambience", 0.7]], windows: [[1.5, 10]] });
    const quietBad = Sound.PLACES.filter((p) => !(tone[p].windows[0] > 1e-5 && tone[p].peak < 0.25));
    ok("every place's room tone sounds, with its small sounds, and never shouts", !quietBad.length,
       Sound.PLACES.map((p) => p + " " + dB(tone[p].windows[0]) + " pk " + tone[p].peak.toFixed(3)).join(", "));
    ok("…under the music, not over it", Stage.PLACES.every((p) => tone[p].windows[0] < music[p].rms * 1.5),
       Stage.PLACES.map((p) => p + " " + dB(tone[p].windows[0]) + "/" + dB(music[p].rms)).join(", "));

    if (process.argv.includes("--verbose")) {
      console.log("      the mix (RMS):  fanfare " + dB(fan.rms) + ",  a lively pawn " + dB(lively.rms));
      for (const p of Stage.PLACES) console.log("      " + p.padEnd(8) + " music " + dB(music[p].rms).padEnd(9) + " room tone " + dB(tone[p].windows[0]));
    }
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }

  /* ---------------- the room itself: the switches, and the game ---------------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => {
      try { const p = JSON.parse(localStorage.getItem("chessroom_prefs") || "{}"); p.welcomed = true; p.tips = { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 }; localStorage.setItem("chessroom_prefs", JSON.stringify(p)); } catch (e) {}
    });
    const pg = await ctx.newPage(), aerrs = [];
    pg.on("pageerror", (e) => aerrs.push(e.message));
    const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await pg.evaluate(fn); if (v) return v; await pg.waitForTimeout(100); } return null; };
    const prefs = () => pg.evaluate(() => JSON.parse(localStorage.getItem("chessroom_prefs") || "{}"));
    try {
      await pg.goto(base + "/chess/#force2d");
      await pg.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
      ok("before anybody touches the page, there is no music (a browser would not play it)", await pg.evaluate(() => !Stage.musicLive()));
      await pg.mouse.click(195, 300);
      ok("the first touch starts the place's music", !!(await until(() => Stage.musicLive(), 4000)));
      ok("…for the place the board is in", await pg.evaluate(() => Stage.place() === (JSON.parse(localStorage.getItem("chessroom_prefs") || "{}").scene || "park")));
      await pg.evaluate(() => { document.getElementById("ovMenu").classList.add("hide"); __cr.openStudio(); });
      await pg.waitForTimeout(300);
      const note = await pg.evaluate(() => document.getElementById("stMusicNote").textContent);
      ok("the Studio names the tune that is playing", /Morning in the park|Corner café|Waltz by the fire|Reading room|The studio/.test(note), note);
      await pg.evaluate(() => document.getElementById("stMusic").click());
      ok("…and its Music switch stops it", !!(await until(() => !Stage.musicLive(), 3000)) && (await prefs()).music === false);
      await pg.evaluate(() => document.getElementById("stMusic").click());
      ok("…and starts it again", !!(await until(() => Stage.musicLive(), 3000)) && (await prefs()).music === true);
      const salon = await pg.evaluate(() => { const b = [...document.querySelectorAll("#stScenes .stPick")].find((x) => /grand/i.test(x.textContent)); if (b) b.click(); return !!b; });
      ok("moving the board to another place moves the music and its echo with it",
         salon && !!(await until(() => Stage.place() === "salon" && Stage.musicLive(), 3000)));
      await pg.evaluate(() => document.getElementById("stClose").click());
      await pg.evaluate(() => document.getElementById("pvNatural").click());
      ok("Piece sounds: Natural turns the game voices off, and is remembered", await pg.evaluate(() => !Stage.lively()) && (await prefs()).pieceVoice === "natural");
      await pg.evaluate(() => document.getElementById("pvLively").click());
      ok("…and Lively brings them back", await pg.evaluate(() => Stage.lively()) && (await prefs()).pieceVoice === "lively");
      await pg.evaluate(() => __cr.startGame("pass", { clockStr: "none", fresh: true }));
      ok("a new game starts calm", await pg.evaluate(() => Stage.busy().mood === "calm"));
      const PLAY = (san) => pg.evaluate((x) => { const g = __cr.game; const mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, "") === x); __cr.commitMove(mv, "local"); }, san);
      for (const s of ["f3", "e5", "g4"]) { await PLAY(s); await pg.waitForTimeout(150); }
      await PLAY("Qh4");
      ok("a game's end lets the music go quiet", !!(await until(() => Stage.busy().mood === "end" && !Stage.musicLive(), 4000)));
      await pg.evaluate(() => __cr.startGame("pass", { clockStr: "none", fresh: true }));
      ok("…and the next game brings it back", !!(await until(() => Stage.busy().mood === "calm" && Stage.musicLive(), 4000)));
      await pg.evaluate(() => document.getElementById("setSound").click());
      ok("sound off stops the music too", !!(await until(() => !Stage.musicLive(), 3000)));
      await pg.evaluate(() => document.getElementById("setSound").click());
      ok("…and sound on brings it back", !!(await until(() => Stage.musicLive(), 3000)));
      ok("nothing shouted at the console in the room", aerrs.length === 0, aerrs.slice(0, 3).join(" | "));
    } catch (e) {
      ok("the room check fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nevery place has its music, every piece its voice, and none of it wears thin");
  process.exit(failed ? 1 : 0);
})();
