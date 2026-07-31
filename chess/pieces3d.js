/* pieces3d.js — the men, carved.

   The 3D board used to turn every piece on one lathe: a profile spun
   around its axis, and a knight that was the same lathe bent forward at
   the neck. It read as chess from across the room and as porridge up
   close. This file replaces that with a small carving shop.

   What's in the shop:

     • a profile language — control points smoothed into a real turned
       silhouette by a Catmull-Rom spline, with creases where a Staunton
       piece has a crisp edge (the foot, the collar, the crown rim) so
       the shading breaks instead of smearing;
     • a lathe that can be warped as it spins, which is how the bishop
       gets a genuine slit cut into its mitre rather than a painted one;
     • a loft, which sweeps a changing cross-section along a curved
       spine — the knight is now an actual carved head with a muzzle,
       a jaw, a mane crest, ears and eyes, not a bent vase;
     • arc blocks, so the rook's battlements are really cut through;
     • boxes and beads and spheres for crosses, coronets and finials;
     • and one baked pass over the finished mesh that darkens crevices
       and the ground contact, so the pieces have depth before a single
       light has been aimed at them.

   Everything is welded into ONE mesh per piece, so a fancier piece
   costs no extra draw calls — the renderer draws exactly what it drew
   before, just with far more to look at.

   Three sets ship. Any number more can be added from outside:

     Pieces3D.register(def)          a set defined as safe, plain JSON
     Pieces3D.registerOBJ(meta, obj) a set from Wavefront .obj text
     Pieces3D.loadOBJSet(meta, urls) the same, fetched

   The JSON form is deliberately data-only — a whitelist of primitives
   with clamped numbers, no code, nothing eval'd — so a set can travel
   between strangers the way a skin does. The OBJ form is the door to
   the wider open-source world: drop in a CC0 or MIT model set, point
   six URLs at it, and it plays. Nothing in this file trusts anything
   that arrives from outside it. */
(function (root) {
"use strict";

/* ---------- small helpers ---------- */
function sgn(v) { return v < 0 ? -1 : 1; }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function fin(v, fallback) { return (typeof v === "number" && isFinite(v)) ? v : fallback; }

/* Catmull-Rom through N-component control points. The profiles below are
   written as a handful of points you could sketch on paper; this is what
   turns them into something a lathe would actually produce. */
function crAt(p0, p1, p2, p3, t, n) {
  var out = new Array(n), t2 = t * t, t3 = t2 * t;
  for (var i = 0; i < n; i++) {
    out[i] = 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t +
      (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
      (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
  }
  return out;
}
function crPath(pts, sub, n) {
  if (pts.length < 2) return pts.slice();
  var out = [], i, s;
  for (i = 0; i < pts.length - 1; i++) {
    var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1];
    var p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (s = 0; s < sub; s++) out.push(crAt(p0, p1, p2, p3, s / sub, n));
  }
  out.push(pts[pts.length - 1].slice(0, n));
  return out;
}

/* A profile is [radius, height] control points; a third entry of "c"
   means "this is a hard edge, don't smooth across it". Runs between
   creases are splined separately, which is exactly how a turner's
   parting tool behaves.

   Subdivision is adaptive: a long sweeping curve earns every extra ring,
   a 2mm bead does not. Without this a king costs three times the
   triangles of a pawn for detail nobody can see. */
/* Profiles are written as helpers stitched together (a foot, then a
   bead that starts where the foot ended), so the same ring often gets
   named twice. Two identical rings make a band with no area, which makes
   a vertex with no normal, which makes a black speck on the piece. */
function dedupe(ctrl) {
  var out = [], i;
  for (i = 0; i < ctrl.length; i++) {
    var p = ctrl[i], last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6) {
      if (p[2] === "c") last[2] = "c";
      continue;
    }
    out.push([p[0], p[1], p[2]]);
  }
  return out;
}
function smoothProfile(ctrl, q) {
  var sub = typeof q === "number" ? q : ((q && q.sub) || 3);
  var step = (q && q.step) || 0.072 / sub;
  var runs = [], cur = [], i, k, s;
  ctrl = dedupe(ctrl);
  for (i = 0; i < ctrl.length; i++) {
    cur.push(ctrl[i]);
    if (ctrl[i][2] === "c" && i > 0 && i < ctrl.length - 1) { runs.push(cur); cur = [ctrl[i]]; }
  }
  runs.push(cur);
  var out = [];
  for (k = 0; k < runs.length; k++) {
    var pts = runs[k], seg = [];
    for (i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1];
      var p3 = pts[Math.min(pts.length - 1, i + 2)];
      var len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      var n = Math.max(1, Math.min(sub, Math.round(len / step)));
      for (s = 0; s < n; s++) seg.push(crAt(p0, p1, p2, p3, s / n, 2));
    }
    seg.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
    if (k > 0) seg.shift();                       /* the shared point is already down */
    if (k < runs.length - 1) seg[seg.length - 1] = [seg[seg.length - 1][0], seg[seg.length - 1][1], "c"];
    for (i = 0; i < seg.length; i++) out.push(seg[i]);
  }
  /* a spline can overshoot; a piece that dips under the board would show
     a sliver of itself through the wood */
  for (i = 0; i < out.length; i++) {
    if (out[i][0] < 0) out[i][0] = 0;
    if (out[i][1] < 0) out[i][1] = 0;
  }
  return dedupe(out);
}

/* scale a control list so the piece finishes at exactly this height */
function fit(ctrl, height) {
  var top = 0, i;
  for (i = 0; i < ctrl.length; i++) if (ctrl[i][1] > top) top = ctrl[i][1];
  if (top <= 0) return ctrl;
  var k = height / top, out = [];
  for (i = 0; i < ctrl.length; i++) out.push([ctrl[i][0], ctrl[i][1] * k, ctrl[i][2]]);
  return out;
}

/* a creased row becomes two rows with a dead band between them, so the
   two sides of the edge keep their own normals */
function expandCreases(rows) {
  var out = [], skip = [], i;
  for (i = 0; i < rows.length; i++) {
    out.push(rows[i]);
    if (rows[i][2] === "c" && i > 0 && i < rows.length - 1) {
      skip[out.length - 1] = true;
      out.push(rows[i]);
    }
  }
  return { rows: out, skip: skip };
}

/* ---------- the geometry kit ----------
   Every function returns a plain { pos, idx } (and sometimes weld
   groups: vertices that sit on top of each other on an axis and want
   one shared normal, or the tip of a cone shows a little star). */

function ringAngles(segs, extra) {
  var a = [], i;
  for (i = 0; i < segs; i++) a.push((i / segs) * Math.PI * 2);
  if (extra) {
    for (i = 0; i < extra.length; i++) {
      var v = ((extra[i] % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      a.push(v);
    }
    a.sort(function (x, y) { return x - y; });
    var out = [a[0]];
    for (i = 1; i < a.length; i++) if (a[i] - out[out.length - 1] > 1e-4) out.push(a[i]);
    if (Math.PI * 2 - out[out.length - 1] < 1e-4) out.pop();
    a = out;
  }
  return a;
}

/* Spin a profile. `warp(r, y, angle) -> [r, y]` lets a piece be
   something other than a solid of revolution while still being turned —
   the bishop's slit is one line of arithmetic here. */
function lathe(profile, segs, o) {
  o = o || {};
  var ex = expandCreases(profile), rows = ex.rows, skip = ex.skip;
  var ang = o.angles || ringAngles(segs, o.extraAngles);
  var w = ang.length, pos = [], idx = [], weld = [], i, j;
  for (j = 0; j < rows.length; j++) {
    var axis = rows[j][0] < 1e-6, group = axis ? [] : null;
    for (i = 0; i < w; i++) {
      var r = rows[j][0], y = rows[j][1];
      if (o.warp) { var d = o.warp(r, y, ang[i]); r = d[0]; y = d[1]; }
      if (group) group.push(pos.length / 3);
      pos.push(Math.cos(ang[i]) * r, y, Math.sin(ang[i]) * r);
    }
    if (group && group.length > 1) weld.push(group);
  }
  for (j = 0; j < rows.length - 1; j++) {
    if (skip[j]) continue;
    /* on the axis the quad folds shut, so only one of its two triangles
       has any area — emitting the other leaves vertices with no normal */
    var lo = rows[j][0] < 1e-6, hi = rows[j + 1][0] < 1e-6;
    if (lo && hi) continue;
    for (i = 0; i < w; i++) {
      var i2 = (i + 1) % w;
      var a0 = j * w + i, b0 = j * w + i2, c0 = (j + 1) * w + i, d0 = (j + 1) * w + i2;
      if (!lo) idx.push(a0, c0, b0);
      if (!hi) idx.push(b0, c0, d0);
    }
  }
  return { pos: pos, idx: idx, weld: weld };
}

/* Sweep a closed cross-section along a path of frames. Each frame is
   { o:[x,y,z], u:[..], v:[..], s:[[a,b],...] } and the section rides the
   frame's own two axes, so the shape can lean, twist and taper. This is
   the knight. */
function loft(frames, o) {
  o = o || {};
  var pos = [], idx = [], weld = [], K = frames[0].s.length, i, j;
  for (j = 0; j < frames.length; j++) {
    var f = frames[j];
    for (i = 0; i < K; i++) {
      var a = f.s[i][0], b = f.s[i][1];
      pos.push(f.o[0] + f.u[0] * a + f.v[0] * b,
               f.o[1] + f.u[1] * a + f.v[1] * b,
               f.o[2] + f.u[2] * a + f.v[2] * b);
    }
  }
  for (j = 0; j < frames.length - 1; j++) for (i = 0; i < K; i++) {
    var i2 = (i + 1) % K;
    var a0 = j * K + i, b0 = j * K + i2, c0 = (j + 1) * K + i, d0 = (j + 1) * K + i2;
    idx.push(a0, c0, b0, b0, c0, d0);
  }
  if (o.capStart !== false) {
    var s0 = pos.length / 3, p = o.startAt || frames[0].o;
    pos.push(p[0], p[1], p[2]);
    var g0 = [];
    for (i = 0; i < K; i++) { idx.push(s0, (i + 1) % K, i); }
    g0.push(s0); weld.push(g0);
  }
  if (o.capEnd !== false) {
    var last = (frames.length - 1) * K, s1 = pos.length / 3;
    var q = o.endAt || frames[frames.length - 1].o;
    pos.push(q[0], q[1], q[2]);
    for (i = 0; i < K; i++) { idx.push(s1, last + i, last + (i + 1) % K); }
  }
  return { pos: pos, idx: idx, weld: weld };
}

function box(w, h, d) {                       /* centred in x/z, y in ±h/2 */
  var x = w / 2, y = h / 2, z = d / 2;
  var v = [[-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z],[-x,y,-z],[x,y,-z],[x,y,z],[-x,y,z]];
  var faces = [[0,1,2,3],[4,7,6,5],[1,0,4,5],[3,2,6,7],[2,1,5,6],[0,3,7,4]];
  var pos = [], idx = [], i, k;
  for (i = 0; i < v.length; i++) pos.push(v[i][0], v[i][1], v[i][2]);
  for (k = 0; k < faces.length; k++) {
    var f = faces[k];
    idx.push(f[0], f[1], f[2], f[0], f[2], f[3]);
  }
  return { pos: pos, idx: idx, weld: [] };
}

/* a box with its corners taken off — a cross arm that catches light on
   more than six faces, which is most of what makes a king look carved */
function bevelBox(w, h, d, b) {
  var prof = [], hw = w / 2;
  prof.push([0, 0], [hw - b, 0, "c"], [hw, b, "c"], [hw, h - b, "c"], [hw - b, h, "c"], [0, h]);
  var g = lathe(prof, 4, { angles: [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4] });
  /* a four-sided lathe is a square prism whose corner radius is hw; pull
     the z axis in so w and d can differ */
  var k = (d / 2) / (hw), i;
  var s = Math.SQRT2;
  for (i = 0; i < g.pos.length; i += 3) { g.pos[i] *= s; g.pos[i + 2] *= s * k; g.pos[i + 1] -= h / 2; }
  return g;
}

function sphere(r, segs, rings) {
  var prof = [], i;
  rings = rings || Math.max(6, Math.round(segs / 2));
  for (i = 0; i <= rings; i++) {
    var a = (i / rings) * Math.PI;
    prof.push([Math.sin(a) * r, -Math.cos(a) * r]);
  }
  return lathe(prof, segs);
}
function cone(r, h, segs) {
  return lathe([[0, 0], [r, 0, "c"], [0, h]], segs);
}
function cylinder(r, h, segs) {
  return lathe([[0, 0], [r, 0, "c"], [r, h, "c"], [0, h]], segs);
}
function torus(R, r, segs, rings) {
  var frames = [], i, j;
  rings = rings || Math.max(8, Math.round(segs / 2));
  for (j = 0; j < segs; j++) {
    var a = (j / segs) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    var sec = [];
    for (i = 0; i < rings; i++) {
      var b = (i / rings) * Math.PI * 2;
      sec.push([Math.cos(b) * r, Math.sin(b) * r]);
    }
    frames.push({ o: [ca * R, 0, sa * R], u: [ca, 0, sa], v: [0, 1, 0], s: sec });
  }
  /* close the ring by repeating the first frame */
  frames.push(frames[0]);
  return loft(frames, { capStart: false, capEnd: false });
}

/* One battlement. The rook's top is a ring of these with the gaps left
   open, so you can see daylight through the crenellations. */
function arcBlock(a0, a1, rIn, rOut, y0, y1, sub) {
  var pos = [], idx = [], i;
  sub = Math.max(1, sub || 3);
  for (i = 0; i <= sub; i++) {
    var a = a0 + (a1 - a0) * (i / sub), c = Math.cos(a), s = Math.sin(a);
    pos.push(c * rOut, y0, s * rOut, c * rOut, y1, s * rOut,
             c * rIn,  y0, s * rIn,  c * rIn,  y1, s * rIn);
  }
  var st = 4;
  function quad(a, b, c, d) { idx.push(a, b, c, a, c, d); }
  for (i = 0; i < sub; i++) {
    var o0 = i * st, o1 = (i + 1) * st;
    quad(o0 + 0, o0 + 1, o1 + 1, o1 + 0);       /* outer wall */
    quad(o1 + 2, o1 + 3, o0 + 3, o0 + 2);       /* inner wall */
    quad(o0 + 1, o0 + 3, o1 + 3, o1 + 1);       /* top */
    quad(o1 + 0, o1 + 2, o0 + 2, o0 + 0);       /* underside */
  }
  var e = sub * st;
  quad(0, 2, 3, 1);                              /* the two cut ends */
  quad(e + 1, e + 3, e + 2, e + 0);
  return { pos: pos, idx: idx, weld: [] };
}

/* ---------- shared turned details ---------- */
/* the wide Staunton foot: a disc, a chamfer, then the ogee into the stem */
function foot(R, u) {
  return [
    [0, 0], [R * 0.50, 0], [R * 0.93, 0.010 * u],
    [R, 0.075 * u, "c"], [R, 0.300 * u, "c"],
    [R * 0.985, 0.400 * u], [R * 0.945, 0.480 * u], [R * 0.880, 0.550 * u],
    [R * 0.780, 0.640 * u], [R * 0.660, 0.780 * u], [R * 0.575, 0.900 * u],
    [R * 0.530, u]
  ];
}
/* a bead: the little half-round ring a turner leaves where a stem starts */
function bead(r, y, t, steps) {
  var out = [[r, y, "c"]], i;
  steps = steps || 5;
  for (i = 1; i <= steps; i++) {
    var a = (i / steps) * Math.PI;
    out.push([r + Math.sin(a) * t, y + t - Math.cos(a) * t]);
  }
  out[out.length - 1] = [r, y + 2 * t, "c"];
  return out;
}
/* the collar under a bishop's mitre or a king's crown: a flared disc */
function collar(r, y, out_, th) {
  return [
    [r, y, "c"], [r + out_ * 0.55, y + th * 0.16], [r + out_, y + th * 0.42, "c"],
    [r + out_, y + th * 0.70, "c"], [r + out_ * 0.70, y + th * 0.92],
    [r * 0.96, y + th * 1.10, "c"]
  ];
}
function cat() {
  var out = [], i, j;
  for (i = 0; i < arguments.length; i++) {
    var a = arguments[i];
    for (j = 0; j < a.length; j++) out.push(a[j]);
  }
  return out;
}

/* ---------- the mesh builder ---------- */
function Builder() {
  this.pos = []; this.shade = []; this.idx = []; this.weld = [];
}
function signedVolume(pos, idx) {
  var v = 0;
  for (var i = 0; i < idx.length; i += 3) {
    var a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
       - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
       + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  return v / 6;
}
/* Every primitive here is a closed solid, so "is it inside out?" has an
   arithmetic answer rather than a staring-at-it answer. Parts that come
   out negative are flipped on the way in, which is why adding a new
   shape to a set never turns into a normals hunt. */
Builder.prototype.add = function (geo, o) {
  o = o || {};
  var i, j, k;
  var s = o.s == null ? 1 : o.s;
  var sx = s.length ? s[0] : s, sy = s.length ? s[1] : s, sz = s.length ? s[2] : s;
  var tr = o.t || [0, 0, 0];
  var rx = o.rx || 0, ry = o.ry || 0, rz = o.rz || 0;
  var mz = o.mirrorZ ? -1 : 1;
  var shade = o.shade == null ? 1 : o.shade;
  var cx = Math.cos(rx), sxr = Math.sin(rx);
  var cy = Math.cos(ry), syr = Math.sin(ry);
  var cz = Math.cos(rz), szr = Math.sin(rz);
  var p = geo.pos, tp = new Array(p.length);
  for (i = 0; i < p.length; i += 3) {
    var x = p[i] * sx, y = p[i + 1] * sy, z = p[i + 2] * sz * mz;
    var x1 = x * cz - y * szr, y1 = x * szr + y * cz, z1 = z;          /* Rz */
    var y2 = y1 * cx - z1 * sxr, z2 = y1 * sxr + z1 * cx, x2 = x1;     /* Rx */
    var x3 = x2 * cy + z2 * syr, z3 = -x2 * syr + z2 * cy, y3 = y2;    /* Ry */
    tp[i] = x3 + tr[0]; tp[i + 1] = y3 + tr[1]; tp[i + 2] = z3 + tr[2];
  }
  if (geo._vol == null) geo._vol = signedVolume(geo.pos, geo.idx);
  var flip = (o.wind !== false && geo._vol < -1e-9) !== (mz < 0);
  var idx = geo.idx;
  if (o.flat) {
    /* unweld: every triangle keeps its own three vertices, so the facets
       stay crisp — which is the whole point of a modernist set */
    for (i = 0; i < idx.length; i += 3) {
      var tri = flip ? [idx[i], idx[i + 2], idx[i + 1]] : [idx[i], idx[i + 1], idx[i + 2]];
      for (k = 0; k < 3; k++) {
        var v = tri[k] * 3;
        this.pos.push(tp[v], tp[v + 1], tp[v + 2]);
        this.shade.push(shade);
        this.idx.push(this.pos.length / 3 - 1);
      }
    }
  } else {
    var base = this.pos.length / 3;
    for (i = 0; i < tp.length; i += 3) {
      this.pos.push(tp[i], tp[i + 1], tp[i + 2]);
      this.shade.push(shade);
    }
    for (i = 0; i < idx.length; i += 3) {
      if (flip) this.idx.push(base + idx[i], base + idx[i + 2], base + idx[i + 1]);
      else this.idx.push(base + idx[i], base + idx[i + 1], base + idx[i + 2]);
    }
    if (geo.weld) for (i = 0; i < geo.weld.length; i++) {
      var g = geo.weld[i], gg = [];
      for (j = 0; j < g.length; j++) gg.push(base + g[j]);
      this.weld.push(gg);
    }
  }
  return this;
};

function computeNormals(pos, idx) {
  var n = new Float32Array(pos.length), i;
  for (i = 0; i < idx.length; i += 3) {
    var a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    var ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    var vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
    n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
    n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
  }
  for (i = 0; i < n.length; i += 3) {
    var l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/* Baked shading, computed once at build time and stored per vertex.
   Two effects, both cheap and both worth more than another light:
   crevices go dark because a vertex whose neighbours sit *along* its own
   normal is at the bottom of a groove; and the last few millimetres
   above the board go dark because that's where a piece meets its own
   shadow. Undersides lose a little sky. */
function bakeShade(pos, nrm, idx, shade, o) {
  o = o || {};
  var n = pos.length / 3, i;
  var sx = new Float64Array(n), sy = new Float64Array(n), sz = new Float64Array(n), cnt = new Float64Array(n);
  function acc(a, b) { sx[a] += pos[b * 3]; sy[a] += pos[b * 3 + 1]; sz[a] += pos[b * 3 + 2]; cnt[a]++; }
  for (i = 0; i < idx.length; i += 3) {
    var a = idx[i], b = idx[i + 1], c = idx[i + 2];
    acc(a, b); acc(a, c); acc(b, a); acc(b, c); acc(c, a); acc(c, b);
  }
  var cav = o.cavity == null ? 0.50 : o.cavity;
  var ground = o.ground == null ? 0.34 : o.ground;
  var gh = o.groundHeight == null ? 0.11 : o.groundHeight;
  var sky = o.sky == null ? 0.20 : o.sky;
  for (i = 0; i < n; i++) {
    var k = 1;
    if (cnt[i]) {
      var dx = sx[i] / cnt[i] - pos[i * 3];
      var dy = sy[i] / cnt[i] - pos[i * 3 + 1];
      var dz = sz[i] / cnt[i] - pos[i * 3 + 2];
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l > 1e-7) {
        var d = (dx * nrm[i * 3] + dy * nrm[i * 3 + 1] + dz * nrm[i * 3 + 2]) / l;
        if (d > 0) k *= 1 - cav * Math.min(1, d * 1.7);
      }
    }
    var y = pos[i * 3 + 1];
    if (y < gh) { var f = 1 - y / gh; k *= 1 - ground * f * f; }
    k *= (1 - sky) + sky * (nrm[i * 3 + 1] * 0.5 + 0.5);
    shade[i] = clamp(shade[i] * k, 0.04, 1);
  }
}

Builder.prototype.finish = function (o) {
  o = o || {};
  var pos = new Float32Array(this.pos);
  var big = this.pos.length / 3 > 65535;
  var idx = big ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
  var shade = new Float32Array(this.shade);
  var nrm = computeNormals(pos, this.idx);
  var i, j;
  /* an axis of revolution ends in a fan of coincident points; one shared
     normal there is the difference between a smooth tip and a star */
  for (i = 0; i < this.weld.length; i++) {
    var g = this.weld[i], ax = 0, ay = 0, az = 0;
    for (j = 0; j < g.length; j++) { ax += nrm[g[j] * 3]; ay += nrm[g[j] * 3 + 1]; az += nrm[g[j] * 3 + 2]; }
    var l = Math.hypot(ax, ay, az) || 1;
    ax /= l; ay /= l; az /= l;
    for (j = 0; j < g.length; j++) { nrm[g[j] * 3] = ax; nrm[g[j] * 3 + 1] = ay; nrm[g[j] * 3 + 2] = az; }
  }
  bakeShade(pos, nrm, this.idx, shade, o.shading);
  var top = 0, rad = 0;
  for (i = 0; i < pos.length; i += 3) {
    if (pos[i + 1] > top) top = pos[i + 1];
    var r = Math.hypot(pos[i], pos[i + 2]);
    if (pos[i + 1] < 0.06 && r > rad) rad = r;
  }
  return { pos: pos, nrm: nrm, shade: shade, idx: idx, big: big,
           verts: pos.length / 3, tris: this.idx.length / 3, height: top, radius: rad };
};

/* ===================================================================
   SET ONE — Staunton Classic
   The 1849 pattern, turned honestly: a weighted foot, an ogee stem, a
   bead where the stem starts, a collar under the head, and a head that
   actually says which piece it is.
   =================================================================== */

var STAUNTON_H = { p: 0.68, n: 0.94, b: 1.00, r: 0.80, q: 1.14, k: 1.30 };
var STAUNTON_R = { p: 0.255, n: 0.290, b: 0.288, r: 0.286, q: 0.318, k: 0.334 };

function stPawn(q) {
  var R = STAUNTON_R.p, u = 0.100, B = new Builder();
  var prof = cat(
    foot(R, u),
    [[0.118, 0.140], [0.100, 0.190], [0.093, 0.232]],
    bead(0.093, 0.232, 0.016),
    [[0.086, 0.286]],
    collar(0.086, 0.286, 0.048, 0.062),
    [[0.072, 0.372], [0.062, 0.392]],
    /* the ball, met tangentially so the neck flows into it */
    [[0.084, 0.410], [0.100, 0.437], [0.107, 0.472], [0.104, 0.512],
     [0.088, 0.548], [0.062, 0.578], [0.032, 0.598], [0, 0.604]]
  );
  B.add(lathe(smoothProfile(fit(prof, STAUNTON_H.p), q), q.segs));
  return B.finish({ shading: q.shading });
}

function stRook(q) {
  var R = STAUNTON_R.r, u = 0.112, B = new Builder();
  var H = STAUNTON_H.r;
  var prof = cat(
    foot(R, u),
    [[0.150, 0.150], [0.142, 0.230], [0.139, 0.310], [0.142, 0.380]],
    bead(0.142, 0.380, 0.015),
    [[0.150, 0.440], [0.164, 0.487]],
    /* the flared course of masonry the battlements stand on */
    [[0.184, 0.523, "c"], [0.190, 0.540, "c"], [0.181, 0.556, "c"], [0.176, 0.578]],
    [[0.176, 0.640, "c"]],
    /* over the parapet and back down inside: a rook you can see into */
    [[0.150, 0.646], [0.124, 0.650, "c"], [0.120, 0.620], [0.118, 0.560, "c"],
     [0.070, 0.550], [0, 0.546]]
  );
  prof = fit(prof, H * 0.808);                 /* the wall; merlons take the rest */
  B.add(lathe(smoothProfile(prof, q), q.segs));
  /* six merlons, cut right through */
  var wall = H * 0.808 * (0.640 / 0.650), yTop = H;
  var n = 6, gap = 0.34, i;
  for (i = 0; i < n; i++) {
    var mid = (i / n) * Math.PI * 2, half = (Math.PI / n) * (1 - gap);
    B.add(arcBlock(mid - half, mid + half, 0.122 * (H / 0.80), 0.176 * (H / 0.80),
                   wall - 0.012, yTop, Math.max(2, Math.round(q.segs / 8))));
  }
  return B.finish({ shading: q.shading });
}

function stBishop(q) {
  var R = STAUNTON_R.b, u = 0.120, B = new Builder();
  var H = STAUNTON_H.b;
  var prof = cat(
    foot(R, u),
    [[0.136, 0.164], [0.118, 0.226], [0.109, 0.292], [0.106, 0.348]],
    bead(0.106, 0.348, 0.017),
    [[0.101, 0.412]],
    collar(0.101, 0.412, 0.052, 0.078),
    [[0.086, 0.520], [0.079, 0.545]],
    /* the mitre: a swelling ogee that draws in to a point */
    [[0.099, 0.578], [0.117, 0.622], [0.124, 0.664], [0.120, 0.708],
     [0.106, 0.752], [0.084, 0.796], [0.056, 0.838], [0.031, 0.868, "c"]],
    /* the little finial on top */
    [[0.036, 0.878], [0.047, 0.897], [0.046, 0.919], [0.033, 0.936], [0.017, 0.946], [0, 0.950]]
  );
  prof = fit(prof, H);
  var y0 = H * 0.60, y1 = H * 0.875, half = 0.36, depth = 0.078;
  /* the slit: the lathe is warped as it spins rather than a stripe
     painted on afterwards, so it catches light like a real cut */
  function warp(r, y, a) {
    if (y < y0 || y > y1 || r < 0.02) return [r, y];
    var d = Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (d > half) return [r, y];
    var k = 1 - d / half;
    var t = Math.sin(((y - y0) / (y1 - y0)) * Math.PI);
    return [Math.max(0.006, r - depth * k * k * t), y];
  }
  var extra = [0, half, -half, half * 0.5, -half * 0.5, half * 0.25, -half * 0.25];
  B.add(lathe(smoothProfile(prof, q), q.segs, { warp: warp, extraAngles: extra }));
  return B.finish({ shading: q.shading });
}

function stQueen(q) {
  var R = STAUNTON_R.q, u = 0.130, B = new Builder();
  var H = STAUNTON_H.q;
  var prof = cat(
    foot(R, u),
    [[0.152, 0.180], [0.130, 0.256], [0.120, 0.336], [0.116, 0.404]],
    bead(0.116, 0.404, 0.018),
    [[0.112, 0.470]],
    collar(0.112, 0.470, 0.056, 0.086),
    [[0.101, 0.596], [0.098, 0.626]],
    /* the cup of the coronet */
    [[0.114, 0.664], [0.144, 0.714], [0.174, 0.766], [0.193, 0.808, "c"],
     [0.197, 0.822, "c"], [0.191, 0.834, "c"]],
    /* back down inside the cup, then up the stem of the finial */
    [[0.168, 0.816], [0.146, 0.796, "c"], [0.108, 0.802], [0.070, 0.818], [0.049, 0.844],
     [0.044, 0.868, "c"]],
    [[0.058, 0.884], [0.070, 0.910], [0.068, 0.940], [0.052, 0.962], [0.028, 0.977], [0, 0.982]]
  );
  prof = fit(prof, H);
  B.add(lathe(smoothProfile(prof, q), q.segs));
  /* the coronet: eight points standing up off the rim. Leaned outwards
     just enough to catch the light — any further and a crown becomes a
     ring of thorns. */
  var n = 8, i, rim = 0.182 * (H / 1.14), yRim = 0.806 * H;
  for (i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2 + Math.PI / n;
    B.add(cone(0.040, 0.088, 4), {
      s: [1, 1, 0.78], rz: -0.16, ry: -a, t: [Math.cos(a) * rim, yRim, Math.sin(a) * rim]
    });
  }
  return B.finish({ shading: q.shading });
}

function stKing(q) {
  var R = STAUNTON_R.k, u = 0.140, B = new Builder();
  var H = STAUNTON_H.k;
  var prof = cat(
    foot(R, u),
    [[0.160, 0.196], [0.138, 0.288], [0.128, 0.382], [0.124, 0.462]],
    bead(0.124, 0.462, 0.019),
    [[0.120, 0.534]],
    collar(0.120, 0.534, 0.058, 0.094),
    [[0.110, 0.672], [0.107, 0.706]],
    /* the crown */
    [[0.122, 0.748], [0.152, 0.802], [0.180, 0.856], [0.196, 0.900, "c"],
     [0.200, 0.916, "c"], [0.193, 0.929, "c"]],
    [[0.170, 0.912], [0.148, 0.892, "c"]],
    /* the dome inside the crown, then the bearing for the cross */
    [[0.118, 0.900], [0.086, 0.918], [0.062, 0.942], [0.051, 0.966, "c"]],
    [[0.063, 0.982], [0.071, 1.004], [0.064, 1.026], [0.047, 1.040, "c"]],
    [[0.030, 1.050, "c"], [0.030, 1.075], [0, 1.078]]
  );
  prof = fit(prof, H * 0.829);
  B.add(lathe(smoothProfile(prof, q), q.segs));
  /* the cross: two bevelled arms, so it reads from every angle */
  var y0 = H * 0.800, w = 0.055, d = 0.046;
  B.add(bevelBox(w, H - y0 + 0.02, d, 0.013), { t: [0, (y0 + H) / 2, 0] });
  B.add(bevelBox(0.166, 0.056, d * 0.94, 0.012), { t: [0, H * 0.900, 0] });
  return B.finish({ shading: q.shading });
}

/* ---------- the knight ----------
   Not a lathe with a bend in it. A cross-section is swept along a spine
   that rises out of the pedestal, leans forward, and finishes at the
   nose; the section is wide and crested at the neck, narrow and square
   at the muzzle. Ears, eyes and nostrils are placed on the same spine,
   so they land on the head wherever the head happens to be. */
function headSection(dF, dB, w, sharp, K) {
  var out = [], i;
  for (i = 0; i < K; i++) {
    var a = (i / K) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    var d = c >= 0 ? dF : dB;
    var p = c >= 0 ? 0.88 : sharp;
    out.push([sgn(c) * d * Math.pow(Math.abs(c), p), sgn(s) * w * Math.pow(Math.abs(s), p)]);
  }
  return out;
}
/* spine control points: x forward, y up, then the section's front depth,
   back depth, half-width, and how sharp the mane crest is */
var KNIGHT_SPINE = [
  [-0.048, 0.235, 0.136, 0.172, 0.126, 1.05],
  [-0.034, 0.350, 0.128, 0.163, 0.120, 1.15],
  [-0.012, 0.470, 0.120, 0.150, 0.112, 1.30],
  [ 0.016, 0.575, 0.124, 0.142, 0.104, 1.45],
  [ 0.056, 0.660, 0.143, 0.130, 0.099, 1.55],
  [ 0.126, 0.722, 0.147, 0.116, 0.094, 1.40],
  [ 0.212, 0.756, 0.122, 0.096, 0.081, 1.20],
  [ 0.290, 0.763, 0.095, 0.079, 0.067, 1.05],
  [ 0.346, 0.752, 0.074, 0.066, 0.055, 1.00]
];
function stKnight(q) {
  var B = new Builder(), i;
  var H = STAUNTON_H.n, R = STAUNTON_R.n, u = 0.116;
  /* the pedestal the head grows out of */
  var prof = cat(
    foot(R, u),
    [[0.148, 0.160], [0.138, 0.220], [0.133, 0.268]],
    bead(0.133, 0.268, 0.015),
    [[0.140, 0.322], [0.150, 0.352, "c"], [0.152, 0.368, "c"]],
    [[0.132, 0.386], [0.096, 0.398], [0.048, 0.404], [0, 0.406]]
  );
  var scale = H / 0.94;
  B.add(lathe(smoothProfile(fit(prof, 0.406 * scale), q), q.segs));

  /* the head: a swept section along a splined spine */
  var K = Math.max(12, Math.min(28, Math.round(q.segs * 0.55) * 2));
  var path = crPath(KNIGHT_SPINE, q.sub + 1, 6);
  var frames = [];
  for (i = 0; i < path.length; i++) {
    var a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    var tx = b[0] - a[0], ty = b[1] - a[1];
    var tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    var nx = ty, ny = -tx;                       /* in-plane normal, pointing forward */
    var p = path[i];
    frames.push({
      o: [p[0] * scale, p[1] * scale, 0],
      u: [nx * scale, ny * scale, 0],
      v: [0, 0, scale],
      s: headSection(p[2], p[3], p[4], p[5], K)
    });
  }
  var tip = path[path.length - 1];
  B.add(loft(frames, {
    startAt: [frames[0].o[0], frames[0].o[1] - 0.05 * scale, 0],
    /* the muzzle is blunted rather than pointed: a horse has a nose, not
       a beak, and a sharp tip is the one thing that reads as a mistake */
    endAt: [(tip[0] + 0.016) * scale, (tip[1] - 0.004) * scale, 0]
  }));

  /* ears — a pair of thin blades at the back of the poll */
  var ear = path[Math.round(path.length * 0.64)];
  for (i = 0; i < 2; i++) {
    B.add(cone(0.040, 0.128, Math.max(5, Math.round(q.segs / 5))), {
      s: [0.62, 1, 0.40], rz: 0.42, rx: (i ? -1 : 1) * 0.34,
      t: [(ear[0] - 0.042) * scale, (ear[1] + 0.076) * scale, (i ? -1 : 1) * 0.050 * scale]
    });
  }
  /* eyes and nostrils: dark, so the head reads at a glance */
  var eye = path[Math.round(path.length * 0.74)];
  var nose = path[path.length - 2];
  for (i = 0; i < 2; i++) {
    B.add(sphere(0.025, Math.max(6, Math.round(q.segs / 3))), {
      shade: 0.30, mirrorZ: !!i,
      t: [(eye[0] + 0.024) * scale, (eye[1] + 0.028) * scale, 0.068 * scale]
    });
    B.add(sphere(0.014, Math.max(5, Math.round(q.segs / 4))), {
      shade: 0.34, mirrorZ: !!i,
      t: [(nose[0] + 0.036) * scale, (nose[1] - 0.016) * scale, 0.032 * scale]
    });
  }
  /* the mane: three cut notches down the crest of the neck */
  for (i = 0; i < 3; i++) {
    var m = path[Math.round(path.length * (0.30 + i * 0.13))];
    B.add(box(0.058, 0.026, 0.066), {
      shade: 0.70, rz: -0.55,
      t: [(m[0] - m[3] * 0.88) * scale, (m[1] + 0.010) * scale, 0]
    });
  }
  return B.finish({ shading: q.shading });
}

/* ===================================================================
   SET TWO — Modern Studio
   Flat-shaded geometry, in the spirit of the Bauhaus sets: every piece
   is the smallest arrangement of solids that still says its name. Low
   segment counts on purpose — the facets are the design.
   =================================================================== */
var MOD_R = 0.29, MOD_SEG = 12;
function modBase(B, r, h, seg) {
  B.add(cylinder(r, h, seg), { flat: true });
  B.add(cylinder(r * 0.80, h * 1.9, seg), { flat: true });
}
function modPawn(q) {
  var B = new Builder(), s = MOD_SEG;
  modBase(B, MOD_R * 0.80, 0.055, s);
  B.add(lathe([[0, 0], [0.115, 0, "c"], [0.075, 0.30, "c"], [0, 0.30]], s), { flat: true, t: [0, 0.10, 0] });
  B.add(sphere(0.105, s, 6), { flat: true, t: [0, 0.485, 0] });
  return B.finish({ shading: q.shading });
}
function modRook(q) {
  var B = new Builder(), s = MOD_SEG;
  modBase(B, MOD_R * 0.92, 0.06, s);
  B.add(box(0.30, 0.40, 0.30), { flat: true, t: [0, 0.32, 0] });
  var i;
  for (i = 0; i < 4; i++) {
    B.add(box(0.105, 0.12, 0.105), { flat: true, ry: 0,
      t: [(i < 2 ? 1 : -1) * 0.088, 0.575, (i % 2 ? 1 : -1) * 0.088] });
  }
  return B.finish({ shading: q.shading });
}
/* the knight, as few blocks as it takes: a neck, a head laid across the
   top of it, a muzzle, one ear */
function modKnight(q) {
  var B = new Builder(), s = MOD_SEG;
  modBase(B, MOD_R * 0.92, 0.06, s);
  B.add(box(0.25, 0.42, 0.25), { flat: true, rz: -0.10, t: [0.020, 0.320, 0] });
  B.add(box(0.34, 0.19, 0.215), { flat: true, rz: -0.14, t: [0.078, 0.600, 0] });
  B.add(box(0.15, 0.13, 0.175), { flat: true, rz: -0.50, t: [0.222, 0.612, 0] });
  B.add(box(0.075, 0.135, 0.062), { flat: true, rz: 0.34, t: [-0.055, 0.712, 0] });
  for (var i = 0; i < 2; i++) {
    B.add(box(0.048, 0.048, 0.048), { flat: true, shade: 0.32, mirrorZ: !!i,
      t: [0.115, 0.648, 0.092] });
  }
  return B.finish({ shading: q.shading });
}
function modBishop(q) {
  var B = new Builder(), s = MOD_SEG;
  modBase(B, MOD_R * 0.86, 0.055, s);
  /* a cone with its point taken off, then the ball that replaces it —
     and a wedge taken out of one face, the way the mitre is slit */
  B.add(lathe([[0, 0], [0.145, 0, "c"], [0.052, 0.60, "c"], [0, 0.60]], s, {
    extraAngles: [0, 0.42, -0.42],
    warp: function (r, y, a) {
      if (y < 0.16 || y > 0.50 || r < 0.02) return [r, y];
      var d = Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (d > 0.42) return [r, y];
      return [Math.max(0.012, r - 0.06 * (1 - d / 0.42)), y];
    }
  }), { flat: true, t: [0, 0.10, 0] });
  B.add(sphere(0.080, s, 6), { flat: true, t: [0, 0.745, 0] });
  return B.finish({ shading: q.shading });
}
function modQueen(q) {
  var B = new Builder(), s = MOD_SEG;
  modBase(B, MOD_R, 0.065, s);
  B.add(lathe([[0, 0], [0.150, 0, "c"], [0.100, 0.58, "c"], [0, 0.58]], s), { flat: true, t: [0, 0.11, 0] });
  var i, n = 6;
  for (i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2;
    B.add(box(0.062, 0.125, 0.062), { flat: true, ry: -a,
      t: [Math.cos(a) * 0.094, 0.712, Math.sin(a) * 0.094] });
  }
  B.add(sphere(0.090, s, 6), { flat: true, t: [0, 0.790, 0] });
  return B.finish({ shading: q.shading });
}
function modKing(q) {
  var B = new Builder(), s = MOD_SEG;
  modBase(B, MOD_R * 1.05, 0.07, s);
  B.add(lathe([[0, 0], [0.155, 0, "c"], [0.115, 0.70, "c"], [0, 0.70]], s), { flat: true, t: [0, 0.12, 0] });
  B.add(box(0.075, 0.30, 0.075), { flat: true, t: [0, 0.96, 0] });
  B.add(box(0.22, 0.075, 0.072), { flat: true, t: [0, 0.99, 0] });
  return B.finish({ shading: q.shading });
}

/* ===================================================================
   SET THREE — Soft Nordic
   Round, thick, hand-sized. No sharp edge anywhere; the kind of set a
   child can't chip. Fewer creases, softer baking.
   =================================================================== */
function nordSoft(R, H, top) {
  /* a fat teardrop body: wide foot, gentle waist, and whatever `top`
     adds on the end */
  return cat(
    [[0, 0], [R * 0.6, 0], [R, 0.012, "c"], [R, 0.052],
     [R * 0.95, 0.085], [R * 0.80, 0.125], [R * 0.66, 0.175],
     [R * 0.56, 0.245], [R * 0.51, 0.33]],
    top
  );
}
function nordPawn(q) {
  var B = new Builder(), R = 0.255;
  var prof = nordSoft(R, 0.62, [[0.132, 0.40], [0.124, 0.45],
    [0.148, 0.50], [0.160, 0.555], [0.150, 0.615], [0.116, 0.665], [0.062, 0.700], [0, 0.712]]);
  B.add(lathe(smoothProfile(fit(prof, 0.66), q), q.segs));
  return B.finish({ shading: q.shading });
}
function nordRook(q) {
  var B = new Builder(), R = 0.288, i;
  var prof = nordSoft(R, 0.78, [[0.152, 0.44], [0.150, 0.58], [0.166, 0.66, "c"],
    [0.168, 0.70, "c"], [0.140, 0.716], [0.090, 0.722], [0, 0.724]]);
  B.add(lathe(smoothProfile(fit(prof, 0.74), q), q.segs));
  /* four soft battlements: the roundest a crenellation can get */
  for (i = 0; i < 4; i++) {
    var a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    B.add(sphere(0.068, Math.max(8, Math.round(q.segs / 2))), { s: [1, 0.86, 1],
      t: [Math.cos(a) * 0.126, 0.732, Math.sin(a) * 0.126] });
  }
  return B.finish({ shading: q.shading });
}
function nordKnight(q) {
  var B = new Builder(), R = 0.290, i;
  var prof = nordSoft(R, 0.86, [[0.150, 0.40], [0.148, 0.46], [0.142, 0.50], [0.100, 0.525], [0, 0.530]]);
  B.add(lathe(smoothProfile(fit(prof, 0.530), q), q.segs));
  /* one rounded wedge of a head, leaning forward. It starts well inside
     the body so the two never part company at the neck. */
  var K = Math.max(10, Math.min(24, Math.round(q.segs * 0.5) * 2));
  var spine = [
    [-0.014, 0.300, 0.150, 0.156, 0.140, 1.0],
    [ 0.000, 0.430, 0.146, 0.154, 0.132, 1.0],
    [ 0.020, 0.545, 0.142, 0.150, 0.124, 1.0],
    [ 0.062, 0.650, 0.138, 0.138, 0.116, 1.0],
    [ 0.150, 0.734, 0.124, 0.118, 0.104, 1.0],
    [ 0.252, 0.778, 0.100, 0.096, 0.086, 1.0],
    [ 0.332, 0.772, 0.070, 0.068, 0.060, 1.0]
  ];
  var path = crPath(spine, q.sub + 1, 6), frames = [];
  for (i = 0; i < path.length; i++) {
    var a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    var tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    var p = path[i];
    frames.push({ o: [p[0], p[1], 0], u: [ty, -tx, 0], v: [0, 0, 1],
                  s: headSection(p[2], p[3], p[4], p[5], K) });
  }
  var tip = path[path.length - 1];
  B.add(loft(frames, { startAt: [frames[0].o[0], frames[0].o[1] - 0.12, 0],
                       endAt: [tip[0] + 0.020, tip[1] - 0.006, 0] }));
  for (i = 0; i < 2; i++) {
    B.add(sphere(0.030, Math.max(6, Math.round(q.segs / 3))), { shade: 0.30, mirrorZ: !!i,
      t: [0.208, 0.802, 0.086] });
    B.add(sphere(0.050, Math.max(6, Math.round(q.segs / 3))), { mirrorZ: !!i,
      s: [0.7, 1.5, 0.5], t: [0.062, 0.858, 0.055] });
  }
  return B.finish({ shading: q.shading });
}
function nordBishop(q) {
  var B = new Builder(), R = 0.286;
  var prof = nordSoft(R, 0.98, [[0.146, 0.40], [0.134, 0.47],
    [0.152, 0.545], [0.164, 0.630], [0.155, 0.720], [0.128, 0.800], [0.088, 0.865],
    [0.046, 0.910], [0, 0.930]]);
  prof = fit(prof, 0.96);
  var y0 = 0.62, y1 = 0.90;
  B.add(lathe(smoothProfile(prof, q), q.segs, {
    extraAngles: [0, 0.26, -0.26, 0.13, -0.13],
    warp: function (r, y, a) {
      if (y < y0 || y > y1 || r < 0.02) return [r, y];
      var d = Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (d > 0.26) return [r, y];
      var k = 1 - d / 0.26;
      return [Math.max(0.008, r - 0.05 * k * k * Math.sin(((y - y0) / (y1 - y0)) * Math.PI)), y];
    }
  }));
  return B.finish({ shading: q.shading });
}
function nordQueen(q) {
  var B = new Builder(), R = 0.316, i;
  var prof = nordSoft(R, 1.08, [[0.158, 0.42], [0.146, 0.52],
    [0.166, 0.62], [0.182, 0.72], [0.176, 0.80, "c"], [0.150, 0.845], [0.104, 0.870],
    [0.070, 0.900], [0.076, 0.940], [0.056, 0.980], [0, 0.995]]);
  B.add(lathe(smoothProfile(fit(prof, 1.06), q), q.segs));
  for (i = 0; i < 6; i++) {
    var a = (i / 6) * Math.PI * 2;
    B.add(sphere(0.046, Math.max(8, Math.round(q.segs / 2))), {
      t: [Math.cos(a) * 0.170, 0.855, Math.sin(a) * 0.170] });
  }
  return B.finish({ shading: q.shading });
}
function nordKing(q) {
  var B = new Builder(), R = 0.332;
  var prof = nordSoft(R, 1.22, [[0.168, 0.44], [0.154, 0.56],
    [0.176, 0.68], [0.192, 0.80], [0.184, 0.885, "c"], [0.152, 0.930], [0.100, 0.960],
    [0.056, 0.985], [0.048, 1.010, "c"], [0, 1.016]]);
  B.add(lathe(smoothProfile(fit(prof, 1.06), q), q.segs));
  /* a cross with the corners rounded off, like everything else here */
  B.add(bevelBox(0.086, 0.30, 0.076, 0.030), { t: [0, 1.155, 0] });
  B.add(bevelBox(0.230, 0.084, 0.074, 0.030), { t: [0, 1.190, 0] });
  return B.finish({ shading: q.shading });
}

/* ---------- the built-in shelf ---------- */
var KIND = { 1: "p", 2: "n", 3: "b", 4: "r", 5: "q", 6: "k" };

var BUILTIN = [
  { id: "staunton", name: "Staunton Classic", maker: "The Chess Room",
    note: "The tournament pattern: weighted feet, turned collars, a carved horse, a rook you can see through.",
    license: "MIT — original geometry", faces: "nb",
    build: { p: stPawn, n: stKnight, b: stBishop, r: stRook, q: stQueen, k: stKing } },

  { id: "modern", name: "Modern Studio", maker: "The Chess Room",
    note: "Flat-shaded geometry in the Bauhaus spirit — the smallest set of solids that still says which piece it is.",
    license: "MIT — original geometry", faces: "n",
    shading: { cavity: 0.34, ground: 0.28, sky: 0.16 },
    build: { p: modPawn, n: modKnight, b: modBishop, r: modRook, q: modQueen, k: modKing } },

  { id: "nordic", name: "Soft Nordic", maker: "The Chess Room",
    note: "Round, thick and hand-sized. No sharp edge anywhere — the set you'd hand a child.",
    license: "MIT — original geometry", faces: "n",
    shading: { cavity: 0.42, ground: 0.30, sky: 0.22 },
    build: { p: nordPawn, n: nordKnight, b: nordBishop, r: nordRook, q: nordQueen, k: nordKing } }
];

var SETS = {};
var ORDER = [];
function shelve(def) { if (!SETS[def.id]) ORDER.push(def.id); SETS[def.id] = def; return def; }
BUILTIN.forEach(shelve);

var DEFAULT_ID = "staunton";

/* ---------- quality: the same set, sized to the machine ---------- */
function quality(o) {
  o = o || {};
  var segs = Math.round(clamp(fin(o.segs, 40), 8, 96));
  var sub = Math.round(clamp(fin(o.sub, 3), 1, 6));
  return { segs: segs, sub: sub, step: clamp(fin(o.step, 0.072 / sub), 0.004, 0.4), shading: o.shading };
}
/* A phone doesn't want a 7,000-triangle bishop and a laptop doesn't want
   a faceted one, so the same profiles are sampled differently. */
function autoQuality() {
  var small = false;
  try {
    small = (typeof window !== "undefined") &&
            (window.innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4);
  } catch (e) {}
  return small ? { segs: 22, sub: 2 } : { segs: 40, sub: 3 };
}

/* ---------- building a set ---------- */
var VERT_BUDGET = 65535;      /* one Uint16 index buffer per piece */

function build(id, opts) {
  var def = SETS[id] || SETS[DEFAULT_ID];
  var q = quality(opts);
  q.shading = def.shading || q.shading;
  var out = { id: def.id, name: def.name, maker: def.maker, note: def.note,
              license: def.license, faces: def.faces || "", pieces: {}, verts: 0, tris: 0 };
  for (var k = 1; k <= 6; k++) {
    var letter = KIND[k];
    var mesh = def.meshes ? def.meshes[letter] : def.build[letter](q);
    if (!mesh || mesh.verts > VERT_BUDGET) throw new Error("piece set " + def.id + ": " + letter + " is too heavy");
    out.pieces[k] = mesh;
    out.verts += mesh.verts;
    out.tris += mesh.tris;
  }
  return out;
}

/* ===================================================================
   Bringing a set in from outside.

   Two doors, both of which treat their input as hostile.

   The JSON door takes a whitelist of primitives with clamped numbers —
   no functions, nothing evaluated — so a set is as safe to paste from a
   stranger as a skin code is.

   The OBJ door takes Wavefront text, which is how most of the free and
   open model sets in the world arrive. Positions and faces only; the
   mesh is re-centred, stood on the board, scaled to the height this set
   asks for, and given the same baked shading as everything else.
   =================================================================== */

var PART_TYPES = {
  lathe: 1, sphere: 1, cone: 1, cylinder: 1, box: 1, torus: 1, arc: 1
};
function nclamp(v, lo, hi, d) { var n = fin(typeof v === "string" ? parseFloat(v) : v, d); return clamp(n, lo, hi); }
function vec3of(v, d) {
  if (!v || typeof v.length !== "number") return d;
  return [nclamp(v[0], -8, 8, d[0]), nclamp(v[1], -8, 8, d[1]), nclamp(v[2], -8, 8, d[2])];
}
function safeProfile(raw) {
  var out = [], i;
  if (!raw || typeof raw.length !== "number") return null;
  for (i = 0; i < Math.min(raw.length, 200); i++) {
    var p = raw[i];
    if (!p || typeof p.length !== "number" || p.length < 2) return null;
    out.push([nclamp(p[0], 0, 4, 0), nclamp(p[1], -4, 8, 0), p[2] === "c" ? "c" : undefined]);
  }
  return out.length >= 2 ? out : null;
}
/* one declared part → geometry, or null if it doesn't make sense */
function partGeo(p, q) {
  var seg = Math.round(nclamp(p.segs, 3, 64, q.segs));
  if (p.type === "lathe") {
    var prof = safeProfile(p.profile);
    if (!prof) return null;
    return lathe(p.smooth === false ? prof : smoothProfile(prof, q), seg);
  }
  if (p.type === "sphere") return sphere(nclamp(p.r, 0.002, 3, 0.1), seg, Math.round(nclamp(p.rings, 3, 48, seg / 2)));
  if (p.type === "cone") return cone(nclamp(p.r, 0.002, 3, 0.1), nclamp(p.h, 0.002, 4, 0.2), seg);
  if (p.type === "cylinder") return cylinder(nclamp(p.r, 0.002, 3, 0.1), nclamp(p.h, 0.002, 4, 0.2), seg);
  if (p.type === "box") return box(nclamp(p.w, 0.002, 3, 0.1), nclamp(p.h, 0.002, 4, 0.1), nclamp(p.d, 0.002, 3, 0.1));
  if (p.type === "torus") return torus(nclamp(p.R, 0.01, 3, 0.12), nclamp(p.r, 0.002, 1, 0.02), seg,
                                       Math.round(nclamp(p.rings, 3, 32, 10)));
  if (p.type === "arc") {
    return arcBlock(nclamp(p.a0, -7, 7, 0), nclamp(p.a1, -7, 7, 1),
                    nclamp(p.rIn, 0.002, 3, 0.08), nclamp(p.rOut, 0.004, 3, 0.16),
                    nclamp(p.y0, -1, 4, 0), nclamp(p.y1, -1, 4, 0.1), 3);
  }
  return null;
}
function meshFromParts(parts, q, shading) {
  var B = new Builder(), used = 0, i;
  if (!parts || typeof parts.length !== "number" || !parts.length) return null;
  for (i = 0; i < Math.min(parts.length, 60); i++) {
    var p = parts[i];
    if (!p || !PART_TYPES[p.type]) continue;
    var g = partGeo(p, q);
    if (!g) continue;
    used++;
    B.add(g, {
      t: vec3of(p.at, [0, 0, 0]),
      s: p.scale == null ? 1 : (typeof p.scale === "number" ? nclamp(p.scale, 0.01, 8, 1) : vec3of(p.scale, [1, 1, 1])),
      rx: nclamp(p.rx, -7, 7, 0), ry: nclamp(p.ry, -7, 7, 0), rz: nclamp(p.rz, -7, 7, 0),
      mirrorZ: !!p.mirrorZ, flat: !!p.flat,
      shade: nclamp(p.shade, 0.04, 1, 1)
    });
    if (B.pos.length / 3 > VERT_BUDGET) return null;
  }
  return used ? B.finish({ shading: shading }) : null;
}

/* stand a mesh on the board and size it, whatever units it arrived in */
function normalize(pos, height, radius) {
  var i, minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (i = 0; i < pos.length; i += 3) {
    if (pos[i] < minX) minX = pos[i]; if (pos[i] > maxX) maxX = pos[i];
    if (pos[i + 1] < minY) minY = pos[i + 1]; if (pos[i + 1] > maxY) maxY = pos[i + 1];
    if (pos[i + 2] < minZ) minZ = pos[i + 2]; if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
  }
  var cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  var h = maxY - minY;
  if (!(h > 1e-6)) return false;
  var k = height / h;
  var wide = Math.max(maxX - minX, maxZ - minZ) * k;
  if (radius && wide > radius * 2) k *= (radius * 2) / wide;   /* never wider than its square */
  for (i = 0; i < pos.length; i += 3) {
    pos[i] = (pos[i] - cx) * k;
    pos[i + 1] = (pos[i + 1] - minY) * k;
    pos[i + 2] = (pos[i + 2] - cz) * k;
  }
  return true;
}

/* Wavefront OBJ: v / f only, polygons fanned, everything else ignored.
   Deliberately small — this is a door, not a scene loader. */
function fromOBJ(text, o) {
  o = o || {};
  if (typeof text !== "string" || text.length > 24e6) return null;
  var lines = text.split("\n"), pos = [], idx = [], i, j;
  for (i = 0; i < lines.length; i++) {
    var ln = lines[i];
    if (ln.charCodeAt(0) === 118 && ln.charCodeAt(1) === 32) {          /* "v " */
      var t = ln.split(/\s+/);
      var x = parseFloat(t[1]), y = parseFloat(t[2]), z = parseFloat(t[3]);
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return null;
      pos.push(x, y, z);
    } else if (ln.charCodeAt(0) === 102 && ln.charCodeAt(1) === 32) {   /* "f " */
      var f = ln.trim().split(/\s+/), ring = [];
      for (j = 1; j < f.length; j++) {
        var v = parseInt(f[j].split("/")[0], 10);
        if (!isFinite(v) || v === 0) return null;
        ring.push(v > 0 ? v - 1 : (pos.length / 3) + v);
      }
      for (j = 1; j + 1 < ring.length; j++) idx.push(ring[0], ring[j], ring[j + 1]);
    }
  }
  var n = pos.length / 3;
  if (!n || !idx.length || n > VERT_BUDGET) return null;
  for (i = 0; i < idx.length; i++) if (idx[i] < 0 || idx[i] >= n) return null;
  var P = new Float32Array(pos);
  if (!normalize(P, nclamp(o.height, 0.2, 2.4, 1), nclamp(o.radius, 0.1, 0.6, 0.34))) return null;
  if (signedVolume(P, idx) < 0 && o.wind !== false) {
    for (i = 0; i < idx.length; i += 3) { var s = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = s; }
  }
  var I = new Uint16Array(idx);
  var nrm = computeNormals(P, idx);
  var shade = new Float32Array(n);
  for (i = 0; i < n; i++) shade[i] = 1;
  bakeShade(P, nrm, idx, shade, o.shading);
  var top = 0, rad = 0;
  for (i = 0; i < P.length; i += 3) {
    if (P[i + 1] > top) top = P[i + 1];
    var r = Math.hypot(P[i], P[i + 2]);
    if (P[i + 1] < 0.06 && r > rad) rad = r;
  }
  return { pos: P, nrm: nrm, shade: shade, idx: I, big: false,
           verts: n, tris: idx.length / 3, height: top, radius: rad || 0.3 };
}

function safeMeta(def, fallbackId) {
  function txt(v, max, d) {
    if (typeof v !== "string") return d;
    var s = v.replace(/[<>&"'`\\|]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
    return s || d;
  }
  var id = txt(def && def.id, 24, fallbackId).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  return {
    id: id || fallbackId,
    name: txt(def && def.name, 28, "Untitled set"),
    maker: txt(def && def.maker, 24, "Someone"),
    note: txt(def && def.note, 140, ""),
    license: txt(def && def.license, 60, "unstated"),
    faces: (typeof (def && def.faces) === "string" ? def.faces : "").replace(/[^pnbrqk]/g, "").slice(0, 6)
  };
}

/* Register a set described as plain data. Heights default to the
   Staunton family so a lazy set still stands in proportion. */
function register(def) {
  var meta = safeMeta(def, "custom");
  if (!def || !def.pieces) return null;
  var heights = { p: 0.68, n: 0.94, b: 1.00, r: 0.80, q: 1.14, k: 1.30 };
  var built = { id: meta.id, name: meta.name, maker: meta.maker, note: meta.note,
                license: meta.license, faces: meta.faces, custom: true, build: {} };
  var shading = def.shading && typeof def.shading === "object" ? {
    cavity: nclamp(def.shading.cavity, 0, 0.9, 0.5),
    ground: nclamp(def.shading.ground, 0, 0.8, 0.34),
    sky: nclamp(def.shading.sky, 0, 0.6, 0.2)
  } : null;
  built.shading = shading;
  var letters = ["p", "n", "b", "r", "q", "k"], i, ok = 0;
  for (i = 0; i < letters.length; i++) {
    (function (L) {
      var spec = def.pieces[L];
      if (!spec) return;
      var h = nclamp(spec.height, 0.2, 2.4, heights[L]);
      built.build[L] = function (q) {
        var m = meshFromParts(spec.parts, q, shading);
        if (!m) throw new Error("piece set " + meta.id + ": " + L + " has no usable parts");
        if (spec.fit !== false && m.height > 1e-6) {
          var k = h / m.height;
          for (var v = 0; v < m.pos.length; v++) m.pos[v] *= k;
          m.height *= k; m.radius *= k;
        }
        return m;
      };
      ok++;
    })(letters[i]);
  }
  if (ok !== 6) return null;
  return shelve(built);
}

/* Register a set from six blobs of OBJ text (or a promise-free object
   of already-fetched strings). */
function registerOBJ(def, objText) {
  var meta = safeMeta(def, "obj-set");
  var heights = (def && def.heights) || {};
  var base = { p: 0.68, n: 0.94, b: 1.00, r: 0.80, q: 1.14, k: 1.30 };
  var radii = { p: 0.26, n: 0.30, b: 0.30, r: 0.30, q: 0.33, k: 0.345 };
  var letters = ["p", "n", "b", "r", "q", "k"], meshes = {}, i;
  for (i = 0; i < letters.length; i++) {
    var L = letters[i];
    var m = objText && typeof objText[L] === "string"
      ? fromOBJ(objText[L], { height: nclamp(heights[L], 0.2, 2.4, base[L]), radius: radii[L],
                              shading: def && def.shading })
      : null;
    if (!m) return null;
    meshes[L] = m;
  }
  return shelve({ id: meta.id, name: meta.name, maker: meta.maker, note: meta.note,
                  license: meta.license, faces: meta.faces, custom: true, meshes: meshes });
}

/* the same, fetched. Same-origin or CORS-clean URLs only — whatever the
   page's own fetch is allowed to do. */
function loadOBJSet(def, urls) {
  var letters = ["p", "n", "b", "r", "q", "k"];
  return Promise.all(letters.map(function (L) {
    return fetch(urls[L]).then(function (r) {
      if (!r.ok) throw new Error("piece set: " + L + " → HTTP " + r.status);
      return r.text();
    });
  })).then(function (texts) {
    var obj = {};
    letters.forEach(function (L, i) { obj[L] = texts[i]; });
    var set = registerOBJ(def, obj);
    if (!set) throw new Error("piece set: the models didn't load into anything drawable");
    return set;
  });
}

function list() {
  return ORDER.map(function (id) {
    var s = SETS[id];
    return { id: s.id, name: s.name, maker: s.maker, note: s.note, license: s.license, custom: !!s.custom };
  });
}

var Pieces3D = {
  SETS: SETS, DEFAULT_ID: DEFAULT_ID, KIND: KIND, VERT_BUDGET: VERT_BUDGET,
  list: list,
  has: function (id) { return !!SETS[id]; },
  get: function (id) { return SETS[id] || SETS[DEFAULT_ID]; },
  build: build,
  autoQuality: autoQuality,
  register: register, registerOBJ: registerOBJ, loadOBJSet: loadOBJSet, fromOBJ: fromOBJ,
  /* the shop itself, so a set defined elsewhere can carve rather than
     assemble — this is the escape hatch the JSON form deliberately isn't */
  kit: {
    Builder: Builder, lathe: lathe, loft: loft, box: box, bevelBox: bevelBox,
    sphere: sphere, cone: cone, cylinder: cylinder, torus: torus, arcBlock: arcBlock,
    smoothProfile: smoothProfile, crPath: crPath, fit: fit, foot: foot, bead: bead,
    collar: collar, headSection: headSection, cat: cat,
    computeNormals: computeNormals, bakeShade: bakeShade, signedVolume: signedVolume,
    normalize: normalize
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = Pieces3D;
else root.Pieces3D = Pieces3D;
})(typeof self !== "undefined" ? self : this);
