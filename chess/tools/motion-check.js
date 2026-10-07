/* motion-check.js — dev-only. Does every piece arrive?

   An animation bug is not a crash. A piece that stops a hair short of
   its square, goes backwards for a frame, sinks below the board, or
   never quite reaches full size after a promotion looks like a glitch
   in the game rather than a glitch in the drawing — and the person it
   confuses most is the beginner, who does not yet know which of the two
   it is.

   So the curves get checked the way the rules do: exactly, at the ends,
   and densely in between. No browser and no canvas — motion.js is pure
   arithmetic, which is the whole reason it is its own file.

   Run: node chess/tools/motion-check.js                                */
"use strict";
const Motion = require("../motion.js");

let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};
const KIND = { 1: "pawn", 2: "knight", 3: "bishop", 4: "rook", 5: "queen", 6: "king" };
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 1e-9 : eps);

/* every square pair a piece of this kind could plausibly make */
function pairs() {
  const out = [];
  for (let r0 = 0; r0 < 8; r0++) for (let f0 = 0; f0 < 8; f0++)
    for (let r1 = 0; r1 < 8; r1++) for (let f1 = 0; f1 < 8; f1++) {
      if (r0 === r1 && f0 === f1) continue;
      out.push([r0 * 16 + f0, r1 * 16 + f1]);
    }
  return out;
}
const ALL = pairs();
/* a representative spread rather than all four thousand: corner to
   corner, one square, and a scatter in between */
const SOME = ALL.filter((_, i) => i % 97 === 0);

/* ---------- the ends are exact ---------- */
(function () {
  let bad = null, worstDur = 0, shortDur = 1e9;
  for (const k of [1, 2, 3, 4, 5, 6]) {
    for (const [from, to] of SOME) {
      const pl = Motion.plan({ piece: k, from, to });
      const a0 = Motion.at(pl, 0), a1 = Motion.at(pl, 1);
      if (!near(a0.p, 0) || !near(a1.p, 1)) bad = bad || KIND[k] + " " + from + "→" + to + " p " + a0.p + ".." + a1.p;
      if (!near(a0.y, 0) || !near(a1.y, 0)) bad = bad || KIND[k] + " ends off the board";
      if (!near(a0.squash, 1) || !near(a1.squash, 1)) bad = bad || KIND[k] + " ends squashed";
      if (!near(a0.bank, 0) || !near(a1.bank, 0)) bad = bad || KIND[k] + " ends leaning";
      worstDur = Math.max(worstDur, pl.dur);
      shortDur = Math.min(shortDur, pl.dur);
    }
  }
  ok("every piece starts on its square and ends on the next one", !bad, bad);
  ok("no move is slower than half a second", worstDur <= Motion.MAX_DUR + 1, "worst " + Math.round(worstDur));
  ok("no move is too quick to see", shortDur >= Motion.MIN_DUR - 1, "shortest " + Math.round(shortDur));
})();

/* ---------- nothing goes backwards, or underground ---------- */
(function () {
  let back = null, under = null, flat = null, squashed = null;
  for (const k of [1, 2, 3, 4, 5, 6]) {
    const pl = Motion.plan({ piece: k, from: 0x01, to: 0x44 });
    let prev = -1, peak = 0, minSquash = 1;
    for (let i = 0; i <= 600; i++) {
      const s = Motion.at(pl, i / 600);
      if (s.p < prev - 1e-9) back = back || KIND[k] + " at t=" + (i / 600).toFixed(3);
      if (s.y < -1e-9) under = under || KIND[k] + " y=" + s.y;
      prev = s.p;
      peak = Math.max(peak, s.y);
      minSquash = Math.min(minSquash, s.squash);
    }
    if (peak <= 0.01) flat = flat || KIND[k] + " never leaves the board";
    /* the landing is wood, not rubber: a tenth would read as a cartoon */
    if (minSquash < 0.9) squashed = squashed || KIND[k] + " squashes to " + minSquash.toFixed(3);
  }
  ok("a piece never travels backwards", !back, back);
  ok("a piece never goes through the board", !under, under);
  ok("every piece is lifted clear, not dragged", !flat, flat);
  ok("the landing is wood, not rubber", !squashed, squashed);
})();

/* ---------- the characters really are different ---------- */
(function () {
  const dur = (k, from, to) => Motion.plan({ piece: k, from, to }).dur;
  /* the character of a piece is the time it spends per square, not the
     time it spends in total — a rook crossing the whole board and a king
     stepping once are not comparable, but what each of them costs for
     one more square of travel is exactly the thing being designed */
  const per = (k) => Motion.CHARACTER[k].per;
  ok("the king is the most ponderous piece on the board",
     [1, 2, 3, 4, 5].every((k) => per(6) > per(k)), "king " + per(6) + "ms a square");
  ok("the rook is the most decisive",
     [1, 2, 3, 5, 6].every((k) => per(4) < per(k)), "rook " + per(4) + "ms a square");
  /* a rook crossing the entire board is quicker than a knight hopping
     one square, because one of them slides and the other is picked up,
     carried over whatever is in the way, and set down */
  ok("sliding the whole board beats being carried one hop",
     dur(4, 0x00, 0x07) < dur(2, 0x01, 0x22),
     dur(4, 0x00, 0x07).toFixed(0) + "ms vs " + dur(2, 0x01, 0x22).toFixed(0) + "ms");
  const lift = (k) => Motion.plan({ piece: k, from: 0x01, to: 0x22 }).lift;
  ok("the knight is carried higher than anything else",
     lift(2) > lift(5) * 3 && lift(2) > lift(4) * 5, "knight " + lift(2).toFixed(2));
  ok("a long move takes longer than a short one of the same piece",
     dur(5, 0x03, 0x04) < dur(5, 0x03, 0x77));
  const bank = (d) => Motion.plan({ piece: 3, from: 0x00, to: d }).bank;
  ok("a bishop leans further into a long diagonal than a short one",
     bank(0x11) < bank(0x55), bank(0x11).toFixed(3) + " vs " + bank(0x55).toFixed(3));
  /* every kind should feel different: no two share a duration AND a lift */
  const sigs = new Set();
  for (const k of [1, 2, 3, 4, 5, 6]) {
    const pl = Motion.plan({ piece: k, from: 0x00, to: 0x22 });
    sigs.add(Math.round(pl.dur) + "/" + pl.lift.toFixed(3) + "/" + pl.ease);
  }
  ok("all six men move differently", sigs.size === 6, sigs.size + " distinct of 6");
})();

/* ---------- black and white are the same ---------- */
(function () {
  let bad = null;
  for (const k of [1, 2, 3, 4, 5, 6]) {
    const w = Motion.plan({ piece: k, from: 0x10, to: 0x30 });
    const b = Motion.plan({ piece: -k, from: 0x60, to: 0x40 });
    if (Math.round(w.dur) !== Math.round(b.dur) || w.ease !== b.ease) bad = KIND[k];
  }
  ok("a black piece moves exactly like its white twin", !bad, bad);
})();

/* ---------- castling, capturing, promoting ---------- */
(function () {
  const pl = Motion.plan({ piece: 6, from: 0x04, to: 0x06, rookFrom: 0x07, rookTo: 0x05 });
  const r0 = Motion.rookAt(pl, 0), r1 = Motion.rookAt(pl, 1);
  ok("the castling rook starts home and finishes home", near(r0.p, 0) && near(r1.p, 1),
     r0.p + ".." + r1.p);
  ok("the rook sets off after the king and arrives before it",
     pl.rookIn > 0 && pl.rookOut < 1);
  let rookBack = false, prev = -1;
  for (let i = 0; i <= 400; i++) { const r = Motion.rookAt(pl, i / 400); if (r.p < prev - 1e-9) rookBack = true; prev = r.p; }
  ok("the rook never travels backwards either", !rookBack);

  const cap = Motion.plan({ piece: 4, from: 0x00, to: 0x07 });
  const t0 = Motion.toppleAt(cap, 0), t1 = Motion.toppleAt(cap, 1);
  ok("a captured piece starts upright and solid", near(t0.tilt, 0) && near(t0.alpha, 1),
     JSON.stringify(t0));
  ok("and is gone by the end", near(t1.alpha, 0) && t1.tilt > 1.5, JSON.stringify(t1));
  let capBack = false, pt = -1, pa = 2;
  for (let i = 0; i <= 400; i++) {
    const t = Motion.toppleAt(cap, i / 400);
    if (t.tilt < pt - 1e-9 || t.alpha > pa + 1e-9) capBack = true;
    pt = t.tilt; pa = t.alpha;
  }
  ok("it falls one way and fades one way", !capBack);
  /* it has to be off the square before the mover settles onto it */
  const clearAt = (() => { for (let i = 0; i <= 1000; i++) if (Motion.toppleAt(cap, i / 1000).alpha <= 0.01) return i / 1000; return 1; })();
  ok("the square is clear before the mover lands", clearAt <= cap.travel,
     "clear at " + clearAt.toFixed(2) + ", lands at " + cap.travel.toFixed(2));

  const pro = Motion.plan({ piece: 1, from: 0x60, to: 0x70, promo: 5 });
  const p0 = Motion.promoteAt(pro, 0), p1 = Motion.promoteAt(pro, 1);
  ok("a promotion starts as a whole pawn and no queen",
     near(p0.pawnAlpha, 1) && p0.newScale <= 0, JSON.stringify(p0));
  ok("…and ends as a whole queen and no pawn",
     near(p1.pawnAlpha, 0) && near(p1.newScale, 1, 1e-6) && near(p1.newAlpha, 1),
     JSON.stringify(p1));
  ok("the flash is over before the move is", near(p0.flash, 0) && near(p1.flash, 0));
  let overlap = false;
  for (let i = 0; i <= 400; i++) {
    const q = Motion.promoteAt(pro, i / 400);
    if (q.pawnAlpha > 0.5 && q.newAlpha > 0.5) overlap = true;
  }
  ok("there is never clearly a pawn and a queen on the same square", !overlap);
  ok("a promotion is given more time than the same step without one",
     pro.dur > Motion.plan({ piece: 1, from: 0x60, to: 0x70 }).dur);
})();

/* ---------- the quiet settings ---------- */
(function () {
  for (const k of [1, 2, 3, 4, 5, 6]) {
    const pl = Motion.plan({ piece: k, from: 0x00, to: 0x33 }, { reduced: true });
    if (pl.dur !== 1 || pl.bank !== 0 || pl.settle !== 0) {
      ok("reduced motion stops the room moving", false, KIND[k] + " " + JSON.stringify(pl));
      return;
    }
    const a = Motion.at(pl, 0.5);
    if (!near(a.squash, 1)) { ok("reduced motion stops the room moving", false, KIND[k] + " still squashes"); return; }
  }
  ok("reduced motion stops the room moving", true);
  const slow = Motion.plan({ piece: 4, from: 0x00, to: 0x07 }, { scale: 3 });
  const norm = Motion.plan({ piece: 4, from: 0x00, to: 0x07 });
  ok("a replay can be asked for in slow motion", slow.dur > norm.dur * 2.5);
  const reducedSlow = Motion.plan({ piece: 4, from: 0x00, to: 0x07 }, { scale: 3, reduced: true });
  ok("…but never over somebody who asked for stillness", reducedSlow.dur === 1);
})();

/* ---------- the check pulse ---------- */
(function () {
  const a = Motion.checkPulse(0), b = Motion.checkPulse(Motion.PULSE_MS + 10);
  ok("a new check breathes", a.live && a.amount > 0.5, JSON.stringify(a));
  ok("and then stops asking for frames", !b.live, JSON.stringify(b));
  ok("a king that is not in check does not pulse", !Motion.checkPulse(-1).live);
  let lo = 2, hi = -1;
  for (let t = 0; t < Motion.PULSE_MS; t += 7) {
    const p = Motion.checkPulse(t);
    lo = Math.min(lo, p.amount); hi = Math.max(hi, p.amount);
  }
  ok("the pulse stays inside its bounds", lo >= 0 && hi <= 1.001, lo.toFixed(3) + ".." + hi.toFixed(3));
})();

console.log(failed ? "\n" + failed + " problem" + (failed > 1 ? "s" : "") + " with the way the pieces move"
                   : "\nevery piece arrives, and no two arrive the same way");
process.exit(failed ? 1 : 0);
