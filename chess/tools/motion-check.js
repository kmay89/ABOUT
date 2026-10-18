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

/* ---------- the king going over ----------
   The end of a game is the one animation everybody watches to the
   last frame, so it gets the same treatment as a move: exact at the
   ends, and never anywhere a solid thing could not be. */
(function () {
  const rest = 1.36;
  const a = Motion.kingFall(0, rest), z = Motion.kingFall(Motion.FALL_MS, rest);
  ok("a mated king starts upright", near(a.tilt, 0) && !a.done, JSON.stringify(a));
  ok("…and ends lying exactly at rest", near(z.tilt, rest) && z.done, JSON.stringify(z));
  let past = null, backMost = 0, landedAt = -1, bounced = false, prev = 0, wentDown = false;
  for (let t = 0; t <= Motion.FALL_MS + 40; t += 2) {
    const f = Motion.kingFall(t, rest);
    if (f.tilt > rest + 1e-9) past = past || "tilt " + f.tilt.toFixed(4) + " at " + t + "ms";
    backMost = Math.min(backMost, f.tilt);
    if (f.landed && landedAt < 0) landedAt = t;
    if (landedAt >= 0 && f.tilt < prev - 1e-6) wentDown = true;
    if (wentDown && f.tilt > prev + 1e-6) bounced = true;
    prev = f.tilt;
  }
  ok("it never falls through the board", !past, past);
  ok("it rocks back against the blow, a little", backMost < -0.02 && backMost > -0.09,
     "leans back to " + backMost.toFixed(3));
  ok("it meets the board when the sound is told it will", Math.abs(landedAt - Motion.FALL_IMPACT) <= 2,
     "landed at " + landedAt + "ms, impact said " + Motion.FALL_IMPACT);
  ok("and bounces once off the wood before it lies still", bounced);
  let falling = true, p2 = -1;
  for (let t = 170; t < Motion.FALL_IMPACT; t += 3) {
    const f = Motion.kingFall(t, rest).tilt;
    if (f < p2 - 1e-9) falling = false;
    p2 = f;
  }
  ok("once it goes, it goes one way", falling);
  /* the speed it hits the board with: slow over the lip, fast at the end */
  const early = Motion.kingFall(230, rest).tilt - Motion.kingFall(200, rest).tilt;
  const late = Motion.kingFall(590, rest).tilt - Motion.kingFall(560, rest).tilt;
  ok("it is slow over the lip and fast at the end", late > early * 3,
     "early " + early.toFixed(3) + ", late " + late.toFixed(3));
})();

/* ---------- how he lies ----------
   The fall above is only as honest as the angle it falls to. Guess it
   short and he is left leaning on nothing with his crown in the air;
   guess it long and his head goes through the wood. So the angle is
   measured off the man's own shape, and here it is measured against
   shapes whose answer is known, then turned every way he could fall to
   prove no part of him ends up under the board. */
(function () {
  /* a turned man: a profile of [radius, height] spun round, eight ways */
  function turned(profile) {
    const pts = [];
    for (const [r, y] of profile) for (let a = 0; a < 16; a++) {
      pts.push(r * Math.cos(a * Math.PI / 8), y, r * Math.sin(a * Math.PI / 8));
    }
    return pts;
  }
  /* where every point of him is, laid down at `tilt` toward `dir`,
     turning on the rim of his base `pivot` out, then raised by `lift` */
  function lowest(pts, pivot, tilt, dir, lift, above) {
    const s = Math.sin(tilt), c = Math.cos(tilt);
    let lo = Infinity;
    for (let i = 0; i < pts.length; i += 3) {
      if (pts[i + 1] < (above || 0)) continue;
      const u = pts[i] * Math.cos(dir) + pts[i + 2] * Math.sin(dir);
      lo = Math.min(lo, (pivot - u) * s + pts[i + 1] * c + lift);
    }
    return lo;
  }
  /* a king: a deep foot, a waist, a crown narrower than the foot */
  const king = turned([[0.36, 0], [0.36, 0.08], [0.24, 0.16], [0.14, 0.55], [0.22, 0.86], [0.12, 0.98], [0.03, 1.1]]);
  const k = Motion.lieOf(king, 0.36);
  const exact = Math.PI / 2 + Math.atan2(0.36 - 0.22, 0.86);
  ok("a king whose crown is narrower than his foot lies a little past flat, crown on the wood",
     Math.abs(k.rest - exact) < 1e-9 && k.rest > Math.PI / 2, k.rest.toFixed(4) + " vs " + exact.toFixed(4));
  let sunk = null, floats = Infinity;
  for (let d = 0; d < 32; d++) {
    const dir = d * Math.PI / 16, lo = lowest(king, 0.36, k.rest, dir, k.lift);
    if (lo < -1e-9) sunk = sunk || "dips " + lo.toFixed(4) + " falling at " + dir.toFixed(2);
    /* his head, not the rim he turned on, which touches by definition */
    floats = Math.min(floats, lowest(king, 0.36, k.rest, dir, k.lift, 0.5));
  }
  ok("…and whichever way he falls, no part of him is under the board", !sunk, sunk);
  ok("…nor is his head hovering over it", floats < 0.03, "his head is " + floats.toFixed(4) + " above the board");
  ok("…with the deep foot's top edge lifting him a hair, not a square",
     k.lift > 0 && k.lift < 0.03, "lift " + k.lift.toFixed(4));
  /* a man wider at the top than at the foot comes to rest short of flat */
  const heavy = turned([[0.2, 0], [0.12, 0.4], [0.32, 0.9], [0.2, 1.0]]);
  const h = Motion.lieOf(heavy, 0.2);
  ok("a man wider at the head than the foot rests short of flat",
     h.rest < Math.PI / 2 && lowest(heavy, 0.2, h.rest, 0, h.lift) > -1e-9, h.rest.toFixed(3));
  ok("the lift is nothing short of flat and all of it at rest",
     Motion.lieLift(1.2, k) === 0 && Math.abs(Motion.lieLift(k.rest, k) - k.lift) < 1e-12 &&
     Motion.lieLift(1.0, h) === 0);
  ok("a shape with nothing above its foot still gets an answer", Motion.lieOf([0.3, 0, 0], 0.3).rest > 1);
})();

/* ---------- the men arriving ---------- */
(function () {
  const start = new Int8Array(128);
  const back = [4, 2, 3, 5, 6, 3, 2, 4];
  for (let f = 0; f < 8; f++) {
    start[f] = back[f]; start[0x10 + f] = 1;
    start[0x60 + f] = -1; start[0x70 + f] = -back[f];
  }
  const plan = Motion.cascade(start, { orientation: 1 });
  ok("every man in the starting position is set down once", plan.length === 32 &&
     new Set(plan.map((p) => p.sq)).size === 32, plan.length + " landings");
  let sorted = true;
  for (let i = 1; i < plan.length; i++) if (plan[i].t < plan[i - 1].t) sorted = false;
  ok("the landings come back in the order they happen", sorted);
  const firstRank = (pl) => pl[0].sq >> 4;
  ok("they arrive from the player's own side outward", firstRank(plan) === 0 &&
     firstRank(Motion.cascade(start, { orientation: -1 })) === 7);
  const centre = plan.filter((p) => (p.sq >> 4) === 0);
  ok("the middle files land before the edges",
     centre[0].sq === 3 || centre[0].sq === 4, "first on the back rank: " + centre[0].sq.toString(16));
  const end = Motion.cascadeEnd(plan);
  ok("the whole board is set in about a second", end > 700 && end < 1300, Math.round(end) + "ms");
  const few = new Int8Array(128); few[0x04] = 6; few[0x74] = -6;
  ok("a nearly empty board is set faster than a full one",
     Motion.cascadeEnd(Motion.cascade(few, {})) < end * 0.75);

  const d0 = Motion.dropAt(0), d1 = Motion.dropAt(Motion.DROP_MS);
  ok("a falling man starts in the air and unseen", d0.y > 1 && near(d0.alpha, 0), JSON.stringify(d0));
  ok("…and ends on its square, whole and still", near(d1.y, 0) && near(d1.squash, 1) &&
     near(d1.alpha, 1) && d1.done, JSON.stringify(d1));
  let under = null, minSq = 1, hop = false;
  for (let t = 0; t <= Motion.DROP_MS; t += 2) {
    const s = Motion.dropAt(t);
    if (s.y < -1e-9) under = under || "y " + s.y + " at " + t;
    minSq = Math.min(minSq, s.squash);
    if (t > Motion.DROP.fall + 20 && s.y > 0.02) hop = true;
  }
  ok("it never lands below the board", !under, under);
  ok("it lands with a soft hop", hop);
  ok("and gives like wood, not rubber", minSq >= 0.9, "squash " + minSq.toFixed(3));
  const land = Motion.dropAt(Motion.DROP.fall + 0.01);
  ok("the landing the sound is told about is the moment it touches", land.landed && land.y < 0.01,
     JSON.stringify(land));
})();

/* ---------- the camera's spring ---------- */
(function () {
  let s = { x: 0, v: 0 }, over = false, steps = 0;
  while (!Motion.springAtRest(s.x, s.v, 1) && steps < 2000) {
    s = Motion.spring(s.x, s.v, 1, 1 / 60, 5);
    if (s.x > 1 + 1e-6) over = true;
    steps++;
  }
  ok("the camera's spring arrives", steps < 2000, steps + " frames");
  ok("…without going past where it was sent", !over);
  ok("…in a second or two, not a moment and not an age", steps > 30 && steps < 150, steps + " frames at 60Hz");
  const big = Motion.spring(0, 0, 1, 5, 5);
  ok("a long stall lands it rather than flinging it", Math.abs(big.x - 1) < 1e-3 && Math.abs(big.v) < 1e-2,
     JSON.stringify(big));
  const none = Motion.spring(0.3, 0.2, 1, 0, 5);
  ok("no time, no movement", none.x === 0.3 && none.v === 0.2);
})();

/* ---------- light under a capture ---------- */
(function () {
  const pawn = Motion.impactAt(60, 0.1), queen = Motion.impactAt(60, 1);
  ok("a capture lights its square", pawn.live && pawn.amount > 0.5);
  let lastPawn = 0, lastQueen = 0;
  for (let t = 0; t < 2000; t += 5) {
    if (Motion.impactAt(t, 0.1).live) lastPawn = t;
    if (Motion.impactAt(t, 1).live) lastQueen = t;
  }
  ok("a queen's capture holds the light longer than a pawn's", lastQueen > lastPawn,
     lastPawn + "ms vs " + lastQueen + "ms");
  ok("and both go dark on their own", !Motion.impactAt(5000, 1).live && !Motion.impactAt(-1, 1).live);
  let lo = 2, hi = -1;
  for (let t = 0; t < 700; t += 3) { const m = Motion.impactAt(t, 0.7); lo = Math.min(lo, m.amount); hi = Math.max(hi, m.amount); }
  ok("the flash stays inside its bounds", lo >= 0 && hi <= 1 + 1e-9, lo.toFixed(3) + ".." + hi.toFixed(3));
  void queen;
})();

console.log(failed ? "\n" + failed + " problem" + (failed > 1 ? "s" : "") + " with the way the pieces move"
                   : "\nevery piece arrives, and no two arrive the same way");
process.exit(failed ? 1 : 0);
