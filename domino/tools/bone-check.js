/* bone-check.js — dev-only. Proves the bone is wound the right way out.

   A closed solid drawn with back-face culling has one rule: every face's
   corner order must wind anticlockwise seen from the side its normal
   points. Break it and the renderer throws away exactly the faces you
   meant to see and keeps the ones you meant to hide — and it does so
   silently, because nothing errors and the shape still draws.

   All eight side and chamfer quads of the domino were wound backwards.
   The faces and the back were right, so a bone looked correct from
   directly above; but its edges were culled and you saw through them
   into the far inner wall, which appeared as grey wedges hanging off
   *both* ends of every bone. Both ends at once is impossible for a solid
   box, and that is what gave it away.

   Run: node tools/bone-check.js [--verbose]                            */
"use strict";
var Gfx3D = require("../gfx3d.js");

var VERBOSE = process.argv.indexOf("--verbose") >= 0;
var pass = 0, fail = 0, failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; if (VERBOSE) console.log("  ok  " + name); }
  else { fail++; failures.push(name); console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
}

var g = Gfx3D.boneGeometry();
var P = g.P, N = g.N, I = g.I;
function v(i) { return [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]; }
function nrm(i) { return [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

ok("the bone is built", P.length > 0 && I.length > 0);
ok("a normal for every corner", N.length === P.length);
/* two faces, four chamfers mitred at their corners, four sides, a back */
ok("eleven quads make a bone", P.length / 3 === 11 * 4, (P.length / 3 / 4) + " quads");

/* ---------- and it is closed ----------
   The bone is a solid, and a solid has no holes. The test is the vector
   area: add up (b-a)×(c-a) over every triangle and a closed surface
   sums to exactly zero, because every outward-facing patch is cancelled
   by the rest of the shape facing the other way. Leave a hole and the
   sum is what is missing — twice the vector area of the gap.

   This is not hypothetical. The chamfers used to stop short of the
   bone's corners by the chamfer width, so adjacent cuts touched at a
   single point with an open triangle between them, and the side walls
   below them left an open sliver besides — eight holes in all. At the
   original 0.055 bevel each was a pixel or two and went unnoticed for
   the life of the room; widening the bevel so the edges would read
   turned all four corners into notches with the felt showing through.
   Mitring the chamfers out to the true corners closes every one.

   Pairing up edges instead would be the more obvious test and it is the
   wrong one here: the top face is two quads so that each half can carry
   its own pips, and their shared boundary meets the chamfer's single
   long edge as two half-edges. Those T-junctions are legitimate — the
   surface is covered — but they fail edge-pairing, and a check that
   cries wolf on correct geometry gets deleted. Vector area does not
   care how a face is subdivided.

   What it cannot catch is a set of holes whose areas happen to cancel
   exactly. The four corners do not: all of them face upwards, so their
   z components add rather than cancel. */
(function () {
  var s = [0, 0, 0];
  for (var t = 0; t < I.length; t += 3) {
    var a = v(I[t]), b = v(I[t + 1]), c = v(I[t + 2]);
    var f = cross(sub(b, a), sub(c, a));
    s[0] += f[0]; s[1] += f[1]; s[2] += f[2];
  }
  var mag = Math.hypot(s[0], s[1], s[2]);
  ok("the surface closes — no gaps at the corners", mag < 1e-9,
     "vector area off by " + mag.toExponential(2));
})();

/* ---------- the winding rule, triangle by triangle ---------- */
(function () {
  var wrong = [], flat = 0;
  for (var t = 0; t < I.length; t += 3) {
    var a = v(I[t]), b = v(I[t + 1]), c = v(I[t + 2]);
    var n = nrm(I[t]);
    var face = cross(sub(b, a), sub(c, a));
    var mag = Math.hypot(face[0], face[1], face[2]);
    if (mag < 1e-9) { flat++; continue; }
    if (dot(face, n) <= 0) wrong.push((t / 3) + " [" + n.join(",") + "]");
  }
  ok("every triangle winds the way its normal points", wrong.length === 0,
     wrong.length + " backwards: " + wrong.slice(0, 6).join(" "));
  ok("and none is degenerate", flat === 0, flat + " flat");
})();

/* ---------- the shape is a closed, convex-ish solid ----------
   Every face plane must have the whole solid on one side of it. That is
   what makes back-face culling correct in the first place, and it also
   catches a corner typed in wrong. */
(function () {
  var bad = 0;
  for (var q = 0; q < P.length / 3; q += 4) {
    var n = nrm(q), p0 = v(q);
    var d = dot(n, p0);
    for (var i = 0; i < P.length / 3; i++) {
      if (dot(n, v(i)) > d + 1e-6) { bad++; break; }
    }
  }
  ok("no corner pokes out through any face", bad === 0, bad + " faces with points outside");
})();

/* ---------- and it is the shape of a domino ---------- */
(function () {
  var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (var i = 0; i < P.length / 3; i++) {
    var p = v(i);
    for (var k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
  }
  var w = hi[0] - lo[0], d = hi[1] - lo[1], h = hi[2] - lo[2];
  ok("twice as long as it is wide", Math.abs(w / d - 2) < 1e-6, w + " × " + d);
  ok("and much thinner than it is wide", h < d * 0.4, "thickness " + h.toFixed(2));
  ok("centred on the origin",
     Math.abs(lo[0] + hi[0]) < 1e-6 && Math.abs(lo[1] + hi[1]) < 1e-6 && Math.abs(lo[2] + hi[2]) < 1e-6);
  /* The chamfer must actually cut the top edge back: nothing at full
     height may reach the bone's full width. (Counting corners at full
     height does not test this — the chamfer quads each contribute two
     of their own, so the count is 16 whether or not they are inset.) */
  var reach = 0;
  for (var j = 0; j < P.length / 3; j++) {
    var p = v(j);
    if (Math.abs(p[2] - hi[2]) < 1e-9) {
      reach = Math.max(reach, Math.abs(p[0]) / (w / 2), Math.abs(p[1]) / (d / 2));
    }
  }
  ok("the face is inset from the edge by a chamfer", reach < 0.99,
     "the face reaches " + (reach * 100).toFixed(0) + "% of the way out");
})();


/* ---------- and the table it lies on ----------
   The table (gfx3d.js, tableGeometry) is built with the same quads and
   the same rules. The cloth and the frame are two meshes because they
   wear different textures, but together they are one closed solid: the
   frame's lip walls run down to the cloth's edge and the cloth seals the
   opening. So the two are checked as one surface. The table is not
   convex — the cloth is let into the frame — so the one test that does
   not apply is the one above about corners poking through faces. */
(function () {
  var t = Gfx3D.tableGeometry(10, 13);
  var P2 = t.wood.P.concat(t.cloth.P), N2 = t.wood.N.concat(t.cloth.N);
  var off = t.wood.P.length / 3;
  var I2 = t.wood.I.concat(t.cloth.I.map(function (i) { return i + off; }));
  function v2(i) { return [P2[i * 3], P2[i * 3 + 1], P2[i * 3 + 2]]; }
  function n2(i) { return [N2[i * 3], N2[i * 3 + 1], N2[i * 3 + 2]]; }
  ok("the table is built", P2.length > 0 && I2.length === (t.wood.P.length / 12 + 1) * 6);
  var s = [0, 0, 0], wrong = 0, flat = 0;
  for (var k = 0; k < I2.length; k += 3) {
    var a = v2(I2[k]), b = v2(I2[k + 1]), c = v2(I2[k + 2]);
    var f = cross(sub(b, a), sub(c, a));
    s[0] += f[0]; s[1] += f[1]; s[2] += f[2];
    var mag = Math.hypot(f[0], f[1], f[2]);
    if (mag < 1e-9) { flat++; continue; }
    if (dot(f, n2(I2[k])) <= 0) wrong++;
  }
  ok("the cloth and the frame close into one solid", Math.hypot(s[0], s[1], s[2]) < 1e-6,
     "vector area off by " + Math.hypot(s[0], s[1], s[2]).toExponential(2));
  ok("every face of the table winds the way its normal points", wrong === 0, wrong + " backwards");
  ok("and none is degenerate", flat === 0, flat + " flat");
  /* the cloth is where the bones lie, at z = 0, and the frame stands above it */
  var lo = 1e9, hi = -1e9, topWood = -1e9;
  for (var i = 0; i < t.cloth.P.length; i += 3) { lo = Math.min(lo, t.cloth.P[i + 2]); hi = Math.max(hi, t.cloth.P[i + 2]); }
  for (var j = 0; j < t.wood.P.length; j += 3) topWood = Math.max(topWood, t.wood.P[j + 2]);
  ok("the cloth is flat at the height the bones rest on", lo === 0 && hi === 0);
  ok("and the frame stands a lip above it", topWood > 0 && topWood < 0.3, "lip " + topWood);
  /* a 10 × 13 cloth holds the widest and deepest line ever measured
     (bound + 2 across, 11 deep) with air to spare */
  var cx = 0, cy = 0;
  for (var m = 0; m < t.cloth.P.length; m += 3) { cx = Math.max(cx, Math.abs(t.cloth.P[m])); cy = Math.max(cy, Math.abs(t.cloth.P[m + 1])); }
  ok("the cloth is as big as it was asked for", cx === 10 && cy === 13, cx + " × " + cy);
})();

console.log("\n" + (fail === 0
  ? "the bone is solid and the table holds it — " + pass + " checks passed"
  : fail + " of " + (pass + fail) + " checks FAILED"));
if (fail) { failures.forEach(function (f) { console.log("  · " + f); }); process.exit(1); }
