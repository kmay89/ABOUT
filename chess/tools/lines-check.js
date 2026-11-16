/* lines-check.js — dev-only. Is every line the room draws the same line?

   lines.js is the grammar both boards draw from: the hint, a nudge, a
   remark about a fork, a note tapped later, your own pen. It is pure
   geometry, so it can be held to account here, in Node, without a
   browser — which matters, because a ribbon that folds back on itself,
   a reveal that overshoots the square or a pen that bends like a knight
   are all things you would only ever see as "the arrow looks a bit off"
   on one board and never on the other.

   What it asks:
     • every kind is a sane shape (it starts at least as wide as it ends,
       its head and alpha are in range, a still kind has no spark);
     • every one of the 64×63 square pairs builds a closed outline with
       no NaN in it, no shorter than the straight line and no longer than
       its bend allows — and a knight bends more than anything else;
     • the pen is a ruler: no bend, knight or not, and an even width;
     • the reveal takes the first part of the line by distance, grows the
       head in only at the end, and runs on one clock (380 ms, eased,
       done exactly once, and instantly for anyone who asked for
       stillness);
     • a ring is round and closed;
     • the spark never rides ahead of what has been drawn;
     • colour is a meaning (a tone), never a number, and the key that
       stops a repaint re-drawing a line is stable.

   Run: node chess/tools/lines-check.js                                   */
"use strict";
const Lines = require("../lines.js");

let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};
const finite = (pts) => pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
const centre = (sq) => ({ x: (sq & 7) + 0.5, y: 7 - (sq >> 4) + 0.5 });
const SQ = [];
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) SQ.push(r * 16 + f);
const isKnight = (a, b) => {
  const df = Math.abs((a & 7) - (b & 7)), dr = Math.abs((a >> 4) - (b >> 4));
  return (df === 1 && dr === 2) || (df === 2 && dr === 1);
};

/* ---------- the kinds ---------- */
{
  const K = Lines.KINDS, bad = [];
  for (const [name, k] of Object.entries(K)) {
    if (!(k.w0 >= k.w1 && k.w1 >= 0)) bad.push(name + " widths");
    if (!(k.head >= 0 && k.headW >= 0)) bad.push(name + " head");
    if (!(k.alpha > 0 && k.alpha <= 1)) bad.push(name + " alpha");
    if (!(k.period >= 0)) bad.push(name + " period");
  }
  ok("every kind starts at least as wide as it ends, with its head and alpha in range", bad.length === 0, bad.join(", "));
  ok("the old four are still here, and the three new words with them",
     ["run", "threat", "lane", "ghost", "ink", "sight", "ring"].every((k) => K[k]));
  ok("a pen, a ray and a ring carry no spark (period 0), so they never ask for a frame",
     K.ink.period === 0 && K.sight.period === 0 && K.ring.period === 0);
  ok("…and the room's own lines all do", ["run", "threat", "lane", "ghost"].every((k) => K[k].period > 0));
  ok("a ray is a reach, not a move: it has no head", K.sight.head === 0 && K.sight.headW === 0);
  ok("a still line's spark rests at its tip rather than dividing by nothing",
     Lines.phase({ period: 0 }, 12345) === 1);
}

/* ---------- every square to every other ---------- */
{
  let built = 0, bad = [], kBend = 0, oBend = 0;
  for (const kind of ["run", "threat", "lane", "ghost", "ink", "sight"]) {
    for (const a of SQ) for (const b of SQ) {
      if (a === b) continue;
      const kn = isKnight(a, b);
      const L = Lines.build(centre(a), centre(b), { kind, knight: kn, scale: 1 });
      built++;
      const straight = Math.hypot(centre(a).x - centre(b).x, centre(a).y - centre(b).y);
      const bend = Lines.bendFor(kind, kn);
      if (!finite(L.poly) || !finite(L.pts) || (L.head && !finite(L.head))) { bad.push(kind + " " + a + ">" + b + " NaN"); continue; }
      if (L.poly.length < 4 || L.poly.length % 2) bad.push(kind + " " + a + ">" + b + " outline");
      /* a quadratic lifted by `bend` of its length is never shorter than
         the chord, and (for the bends this grammar uses) never longer
         than the chord plus that lift */
      if (L.length < straight - 1e-9 || L.length > straight * (1 + bend) + 1e-9) bad.push(kind + " " + a + ">" + b + " length " + L.length.toFixed(3));
      if (bend === 0 && Math.abs(L.length - straight) > 1e-9) bad.push(kind + " " + a + ">" + b + " not straight");
      if (kind === "run") { if (kn) kBend = Math.max(kBend, bend); else oBend = Math.max(oBend, bend); }
      if (L.reveal !== 1) bad.push(kind + " reveal " + L.reveal);
    }
  }
  ok("all " + built + " lines (six kinds × 64×63 square pairs) are closed outlines with no NaN, as long as their bend says",
     bad.length === 0, bad.slice(0, 4).join(" | "));
  ok("a knight's line bends more than any other", kBend > oBend, kBend + " vs " + oBend);
  ok("the pen is a ruler, knight or not", Lines.bendFor("ink", true) === 0 && Lines.bendFor("ink", false) === 0 &&
     Lines.bendFor("sight", true) === 0);
}

/* ---------- the pen: even, straight ---------- */
{
  let worst = 0;
  for (const [a, b] of [[0x01, 0x22], [0x14, 0x34], [0x00, 0x77], [0x63, 0x16]]) {
    const L = Lines.build(centre(a), centre(b), { kind: "ink", knight: isKnight(a, b), scale: 1 });
    const half = L.poly.length / 2;
    for (let i = 0; i < half; i++) {
      const l = L.poly[i], r = L.poly[L.poly.length - 1 - i];
      worst = Math.max(worst, Math.abs(Math.hypot(l.x - r.x, l.y - r.y) - Lines.KINDS.ink.w0));
    }
  }
  ok("an ink ribbon is the same width all the way along (to 1e-6)", worst < 1e-6, worst.toExponential(2));
}

/* ---------- the reveal ---------- */
{
  const a = centre(0x01), b = centre(0x22);
  const full = Lines.build(a, b, { kind: "run", knight: true });
  const half = Lines.reveal(full.pts, 0.5);
  const mid = Lines.sparkAt(full.pts, 0.5);
  const end = half[half.length - 1];
  const err = Math.hypot(end.x - mid.x, end.y - mid.y) / full.length;
  ok("half a reveal ends at the line's halfway point by distance (±2%)", err < 0.02, (err * 100).toFixed(3) + "%");
  ok("…and is half as long", Math.abs(Lines.arcLength(half) - full.length / 2) < full.length * 0.02);
  const whole = Lines.reveal(full.pts, 1);
  ok("a whole reveal is the whole line", whole.length === full.pts.length &&
     whole.every((p, i) => p.x === full.pts[i].x && p.y === full.pts[i].y));
  let mono = true, prev = -1;
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const len = Lines.arcLength(Lines.reveal(full.pts, Math.min(1, u)));
    if (len < prev - 1e-9) mono = false;
    prev = len;
  }
  ok("a reveal only ever grows", mono);
  const at = (u) => Lines.build(a, b, { kind: "run", knight: true, reveal: u });
  const headLen = (L) => L.head ? Math.hypot(L.head[1].x - L.head[2].x, L.head[1].y - L.head[2].y) : 0;
  ok("the head is not there for most of the draw (below 85%)", [0.1, 0.5, 0.84].every((u) => headLen(at(u)) === 0));
  ok("…grows in over the last stretch, and is full at the end",
     headLen(at(0.92)) > 0 && headLen(at(0.92)) < headLen(at(1)) && Math.abs(headLen(at(1)) - headLen(full)) < 1e-12);
  const stub = at(0.3), stubEnd = stub.pts[stub.pts.length - 1];
  const stubW = (() => { const n = stub.poly.length / 2; const l = stub.poly[n - 1], r = stub.poly[n]; return Math.hypot(l.x - r.x, l.y - r.y); })();
  const K = Lines.KINDS.run;
  ok("a stub tapers as the whole line will, not to a point of its own", stubW > K.w1 + (K.w0 - K.w1) * 0.5, stubW.toFixed(3));
  void stubEnd;
  let nan = false;
  for (const u of [0, 1e-9, 0.001, 0.5, 0.999, 1]) {
    const L = at(u);
    if (!finite(L.poly) || !finite(L.pts)) nan = true;
  }
  ok("a reveal at nothing, almost nothing and everything has no NaN in it", !nan);
}

/* ---------- the clock of a reveal ---------- */
{
  const R = Lines.REVEAL_MS;
  ok("a line is drawn on in 380 ms", R === 380);
  const r0 = Lines.revealAt(0, R), rEnd = Lines.revealAt(R, R), rAfter = Lines.revealAt(R + 500, R);
  ok("it starts at nothing and arrives exactly once", r0.u === 0 && r0.live && rEnd.u === 1 && !rEnd.live && rAfter.u === 1 && !rAfter.live);
  let mono = true, prev = -1;
  for (let ms = 0; ms <= R; ms += 5) { const u = Lines.revealAt(ms, R).u; if (u < prev) mono = false; prev = u; }
  ok("…without ever turning back", mono);
  ok("…fast off the piece and settling onto the square (eased out)", Lines.revealAt(R / 2, R).u > 0.75);
  ok("a line waiting its turn (a delay) is not drawn yet but is still coming", Lines.revealAt(-120, R).u === 0 && Lines.revealAt(-120, R).live);
  const red = Lines.revealAt(0, R, true);
  ok("asked for stillness, it is simply there", red.u === 1 && !red.live);
  ok("a pen line, once drawn, asks for nothing; a hint keeps its spark",
     !Lines.lively("ink", 1, false) && Lines.lively("run", 1, false) && Lines.lively("ink", 0.5, false));
  ok("…and nothing moves at all for anyone who asked for stillness",
     !Lines.lively("run", 1, true) && !Lines.lively("ink", 0.5, true));
}

/* ---------- the ring ---------- */
{
  const c = { x: 3.5, y: 2.5 };
  const pts = Lines.ring(c, 0.4, 48);
  const radiusErr = Math.max(...pts.map((p) => Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - 0.4)));
  ok("a ring is round", radiusErr < 1e-9, radiusErr.toExponential(2));
  ok("…and closed", Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-9);
  const R = Lines.buildRing(c, { scale: 2 });
  ok("a built ring is an outline with no head, scaled with the square", R.kind === "ring" && !R.head &&
     Math.abs(R.r - 0.8) < 1e-12 && finite(R.poly) && R.poly.length % 2 === 0);
  const halfRing = Lines.buildRing(c, { reveal: 0.5 });
  ok("a ring draws on too, going round", Math.abs(halfRing.length - R.length / 4) < R.length * 0.02,
     halfRing.length.toFixed(3) + " vs " + (R.length / 4).toFixed(3));
}

/* ---------- the spark never runs ahead ---------- */
{
  const full = Lines.build(centre(0x06), centre(0x25), { kind: "run", knight: true });
  let worst = 0;
  for (const u of [0.3, 0.6, 0.9, 1]) {
    const L = Lines.build(centre(0x06), centre(0x25), { kind: "run", knight: true, reveal: u });
    for (let ph = 0; ph <= 1; ph += 0.1) {
      const sp = Lines.sparkAt(L.pts, ph);
      /* distance from the spark to the drawn part of the curve */
      let d = Infinity;
      for (const p of L.pts) d = Math.min(d, Math.hypot(p.x - sp.x, p.y - sp.y));
      const along = Lines.arcLength(Lines.reveal(full.pts, u));
      if (Lines.arcLength(L.pts) > along + 1e-9) worst = Infinity;
      worst = Math.max(worst, d);
    }
  }
  ok("the spark only ever rides the part already drawn", worst < 0.2, String(worst));
}

/* ---------- tone and key ---------- */
{
  ok("colour is a meaning: six tones, and every kind has one",
     Lines.TONES.length === 6 && Object.keys(Lines.KINDS).every((k) => Lines.TONES.indexOf(Lines.toneOf({ kind: k })) >= 0));
  ok("a hint is the hint tone, a threat the threat tone, your pen the plan tone",
     Lines.toneOf({ kind: "run" }) === "hint" && Lines.toneOf({ kind: "threat" }) === "threat" && Lines.toneOf({ kind: "ink" }) === "plan");
  ok("a tone asked for is the tone drawn — and a made-up one is not",
     Lines.toneOf({ kind: "run", tone: "threat" }) === "threat" && Lines.toneOf({ kind: "run", tone: "#ff0000" }) === "hint");
  const a = { from: 0x14, to: 0x34, kind: "run" }, b = { from: 0x14, to: 0x34, kind: "run", tone: "hint" };
  ok("the same line has the same key, however it was written", Lines.keyOf(a) === Lines.keyOf(b));
  ok("…and a different line a different one",
     Lines.keyOf(a) !== Lines.keyOf({ from: 0x14, to: 0x34, kind: "ghost" }) &&
     Lines.keyOf(a) !== Lines.keyOf({ from: 0x14, to: 0x34, kind: "run", tone: "threat" }) &&
     Lines.keyOf({ sq: 0x33, kind: "ring" }) !== Lines.keyOf({ sq: 0x34, kind: "ring" }));
}

console.log(failed ? "\nFAILED: " + failed + " problem" + (failed === 1 ? "" : "s") : "\nlines: one grammar, every square to every other, drawn on and still");
process.exit(failed ? 1 : 0);
