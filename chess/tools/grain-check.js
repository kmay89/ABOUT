/* grain-check.js — dev-only. Is the wood still wood?

   grain.js paints the board's surface as a field — a tone and a relief
   for every pixel of the playing area — that both renderers sample. It
   is pure arithmetic, so it is checked the way motion.js is: exactly,
   in node, with no canvas anywhere near it.

   What it asks:
     - every pattern builds, is finite, is centred (a grain is a texture
       on a square's colour, not a darkening of it) and stays inside the
       range the renderers' gains are tuned for;
     - the same pattern and seed paint the same board twice, and both
       boards get it from the one cache rather than painting it again;
     - no two patterns look alike, and no two squares of one pattern
       are the same cut of veneer;
     - laid onto paint, it moves the paint — and a flat fill with no
       grain asked for is left exactly as it was;
     - the drawn board's flip really turns the field round, so the
       grain stays on its square when Black is at the bottom;
     - and a field is cheap enough to paint on a skin change.

   Run: node chess/tools/grain-check.js                                 */
"use strict";
const Grain = require("../grain.js");

let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};
const PATTERNS = Object.keys(Grain.PATTERNS);
const N = 128;

function stats(a) {
  let lo = Infinity, hi = -Infinity, sum = 0, finite = true;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (!Number.isFinite(v)) { finite = false; continue; }
    if (v < lo) lo = v; if (v > hi) hi = v; sum += v;
  }
  return { lo, hi, mean: sum / a.length, finite };
}
function sigOf(a, step) {
  let h = 0;
  for (let i = 0; i < a.length; i += step || 7) h = (h * 31 + Math.round(a[i] * 1000)) | 0;
  return h;
}

/* ---------- every pattern builds, centred and in range ---------- */
(function () {
  const sigs = new Map();
  for (const p of PATTERNS) {
    const f = Grain.field(N, { pattern: p, seed: 1947 });
    const t = stats(f.tone), r = stats(f.relief);
    ok(`${p.padEnd(7)} is finite, centred and in range`,
       t.finite && r.finite && Math.abs(t.mean) < 0.12 && t.lo > -1.6 && t.hi < 1.6 && r.lo > -1.2 && r.hi < 1.2,
       JSON.stringify({ tone: t, relief: r }));
    /* (inlay is plain paper under a line the renderers draw themselves,
       so the two fields are meant to be the same) */
    const sig = sigOf(f.tone);
    if (sigs.has(sig) && p !== "inlay") ok(`…and ${p} does not look like ${sigs.get(sig)}`, false);
    if (p !== "inlay") sigs.set(sig, p);
    ok(`…and has something in it`, t.hi - t.lo > 0.1, (t.hi - t.lo).toFixed(3));
  }
  ok("no two patterns look alike", sigs.size === PATTERNS.length - 1, sigs.size + " of " + (PATTERNS.length - 1));
})();

/* ---------- the same board twice, from the cache ---------- */
(function () {
  const a = Grain.field(N, { pattern: "wood", seed: 7 }), b = Grain.field(N, { pattern: "wood", seed: 7 });
  ok("the same pattern and seed come back from the cache", a === b);
  const c = Grain.field(N, { pattern: "wood", seed: 8 });
  ok("a different seed is a different board", sigOf(a.tone) !== sigOf(c.tone));
  const d = Grain.field(N, { pattern: "wood", seed: 7, tiles: 1 });
  ok("a frame painted as one plank is not the board", d !== a && sigOf(d.tone) !== sigOf(a.tone));
})();

/* ---------- every square its own cut ---------- */
(function () {
  const f = Grain.field(256, { pattern: "wood", seed: 1947 }), cell = 32;
  const seen = new Set();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    let h = 0;
    for (let y = 4; y < cell - 4; y += 3) for (let x = 4; x < cell - 4; x += 3) {
      h = (h * 31 + Math.round(f.tone[(r * cell + y) * 256 + c * cell + x] * 1000)) | 0;
    }
    seen.add(h);
  }
  ok("no two squares are the same cut of veneer", seen.size === 64, seen.size + " distinct of 64");
})();

/* ---------- laid onto paint ---------- */
(function () {
  const W = 96, make = (v) => ({ width: W, height: W, data: new Uint8ClampedArray(W * W * 4).fill(v) });
  const f = Grain.field(64, { pattern: "marble", seed: 3 });
  const img = make(140), before = Array.from(img.data);
  Grain.apply(img, f, { x: 8, y: 8, w: 80, h: 80 }, 0.6, "colour");
  let moved = 0, outside = 0, alpha = true;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, inside = x >= 8 && x < 88 && y >= 8 && y < 88;
    const diff = img.data[o] !== before[o];
    if (inside && diff) moved++;
    if (!inside && diff) outside++;
    if (img.data[o + 3] !== 140) alpha = false;
  }
  ok("grain moves the paint it is laid on", moved > 80 * 80 * 0.5, moved + " px moved");
  ok("…and only inside the region it was given", outside === 0, outside + " px outside");
  ok("…and never touches the alpha", alpha);
  const flat = make(140);
  Grain.apply(flat, f, { x: 0, y: 0, w: W, h: W }, 0, "colour");
  ok("no grain asked for leaves the paint exactly as it was", flat.data.every((v) => v === 140));
  const hgt = make(128);
  Grain.apply(hgt, f, { x: 0, y: 0, w: W, h: W }, 0.6, "height");
  const hs = stats(hgt.data.filter((_, i) => i % 4 === 0));
  ok("in height mode it is a grey relief about the surface", hs.lo < 128 && hs.hi > 128 && hs.lo >= 0 && hs.hi <= 255,
     JSON.stringify(hs));
  let grey = true;
  for (let i = 0; i < hgt.data.length; i += 4) if (hgt.data[i] !== hgt.data[i + 1] || hgt.data[i] !== hgt.data[i + 2]) grey = false;
  ok("…and grey means grey", grey);
})();

/* ---------- the flip ---------- */
(function () {
  const W = 64, f = Grain.field(64, { pattern: "wood", seed: 11 });
  const a = { width: W, height: W, data: new Uint8ClampedArray(W * W * 4).fill(150) };
  const b = { width: W, height: W, data: new Uint8ClampedArray(W * W * 4).fill(150) };
  Grain.apply(a, f, { x: 0, y: 0, w: W, h: W }, 0.8, "colour", false);
  Grain.apply(b, f, { x: 0, y: 0, w: W, h: W }, 0.8, "colour", true);
  let turned = true, same = true;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, p = ((W - 1 - y) * W + (W - 1 - x)) * 4;
    if (Math.abs(a.data[o] - b.data[p]) > 1) turned = false;
    if (a.data[o] !== b.data[o]) same = false;
  }
  ok("a board shown from Black's side gets the field turned round", turned && !same);
})();

/* ---------- cheap enough ---------- */
(function () {
  Grain.field(512, { pattern: "wood", seed: 99 });        /* warm the engine */
  const t0 = Date.now();
  Grain.field(512, { pattern: "wood", seed: 100 });
  Grain.field(512, { pattern: "marble", seed: 100 });
  Grain.field(512, { pattern: "linen", seed: 100 });
  const ms = Date.now() - t0;
  ok("three boards' worth of grain in under a second", ms < 1000, ms + " ms");
})();

console.log(failed ? "\n" + failed + " problem" + (failed > 1 ? "s" : "") + " with the grain"
                   : "\nthe wood is wood, the marble is marble, and the same board twice is the same board");
process.exit(failed ? 1 : 0);
