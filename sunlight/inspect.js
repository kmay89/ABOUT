/* inspect.js — holding a thing up to the light and turning it over.

   When something becomes yours, the world goes dark around it, it spins
   in out of nowhere and settles, and you can turn it in your hands —
   drag, arrow keys, the stick — and lean in closer (wheel or pinch).
   A beat later its card arrives: what it is, the science in it, what it
   opens, and how much of the hill's collection you now hold, with the
   empty slots still waiting.

   The objects are real 3D, built from a handful of shapes (lathed
   profiles for jars and lamps, boxes, tubes) and drawn by a small
   painter's-algorithm renderer on a 2D canvas: a warm key light from the
   upper left, a cool rim, a specular glint, see-through glass, and parts
   that glow on their own. No libraries, no files. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio, $ = G.$;
  var I = BS.inspect = {};

  /* ---------------- tiny 3D, with care ----------------
     Meshes are triangles grouped into parts. Curved parts (lathes, tubes,
     spheres) get smooth per-vertex normals; flat parts (boxes) stay crisp.
     Every vertex is shaded on its own — a warm key light, a cool rim, a
     specular glint, a reflection of the room (warm above, dark below) for
     anything shiny — and surfaces carry procedural texture: leather pores,
     wood grain, brushed brass, chalky old plastic, gingham, granite, bark. */
  function mat(color, o) {
    o = o || {};
    return { c: BS.hex(color), a: o.a == null ? 1 : o.a, spec: o.spec == null ? 0.35 : o.spec, glow: o.glow || 0, rough: o.rough || 24, tex: o.tex || null, refl: o.refl || 0, fine: o.fine || 0, bias: o.bias || 0 };
  }
  function Mesh() { this.t = []; this.pid = 0; }
  Mesh.prototype.tri = function (a, b, c, m, ctr, pid, smooth) { this.t.push({ v: [a, b, c], m: m, ctr: ctr || [0, 0, 0], pid: pid || 0, smooth: !!smooth }); };
  Mesh.prototype.quad = function (a, b, c, d, m, ctr, pid, smooth) { this.tri(a, b, c, m, ctr, pid, smooth); this.tri(a, c, d, m, ctr, pid, smooth); };
  /* a big flat face, cut into a grid: the painter's sort stays honest, and
     textured faces get enough points to carry their grain */
  Mesh.prototype.grid = function (a, b, c, d, m, ctr, pid) {
    var cell = m.tex ? (m.fine || 0.11) : 0.3;
    var lu = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), lv = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    var nu = Math.max(1, Math.min(12, Math.ceil(lu / cell))), nv = Math.max(1, Math.min(12, Math.ceil(lv / cell)));
    function at(u, v) { var p = []; for (var i = 0; i < 3; i++) p.push(a[i] * (1 - u) * (1 - v) + b[i] * u * (1 - v) + c[i] * u * v + d[i] * (1 - u) * v); return p; }
    for (var i = 0; i < nu; i++) for (var j = 0; j < nv; j++) this.quad(at(i / nu, j / nv), at((i + 1) / nu, j / nv), at((i + 1) / nu, (j + 1) / nv), at(i / nu, (j + 1) / nv), m, ctr, pid, false);
  };
  /* turn a profile [[r, y], ...] around an axis; a0..a1 limits the sweep */
  Mesh.prototype.lathe = function (prof, segs, m, o) {
    o = o || {}; var a0 = o.a0 || 0, a1 = o.a1 == null ? Math.PI * 2 : o.a1, ax = o.axis || "y", off = o.at || [0, 0, 0], pid = ++this.pid, smooth = o.flat ? false : true;
    function P(r, y, a) {
      var x = Math.cos(a) * r, z = Math.sin(a) * r, p;
      if (ax === "y") p = [x, y, z]; else if (ax === "x") p = [y, x, z]; else p = [x, z, y];
      return [p[0] + off[0], p[1] + off[1], p[2] + off[2]];
    }
    var ymin = 1e9, ymax = -1e9; prof.forEach(function (p) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); });
    var ctr = P(0, (ymin + ymax) / 2, 0);
    for (var i = 0; i < prof.length - 1; i++) for (var j = 0; j < segs; j++) {
      var u0 = a0 + (a1 - a0) * j / segs, u1 = a0 + (a1 - a0) * (j + 1) / segs;
      this.quad(P(prof[i][0], prof[i][1], u0), P(prof[i][0], prof[i][1], u1), P(prof[i + 1][0], prof[i + 1][1], u1), P(prof[i + 1][0], prof[i + 1][1], u0), m, ctr, pid, smooth);
    }
    return this;
  };
  Mesh.prototype.box = function (cx, cy, cz, w, h, d, m, mTop) {
    var x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2, pid = ++this.pid;
    var v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], C = [cx, cy, cz];
    this.grid(v[0], v[1], v[2], v[3], m, C, pid); this.grid(v[5], v[4], v[7], v[6], m, C, pid);
    this.grid(v[4], v[0], v[3], v[7], m, C, pid); this.grid(v[1], v[5], v[6], v[2], m, C, pid);
    this.grid(v[4], v[5], v[1], v[0], mTop || m, C, pid); this.grid(v[3], v[2], v[6], v[7], m, C, pid);
    return this;
  };
  /* a box with its edges rounded over: boards, plastic housings, phones */
  Mesh.prototype.rbox = function (cx, cy, cz, w, h, d, r, m, mTop) {
    this.box(cx, cy, cz, w - 2 * r, h, d - 2 * r, m, mTop).box(cx, cy, cz, w, h - 2 * r, d - 2 * r, m).box(cx, cy, cz, w - 2 * r, h - 2 * r, d, m);
    var self = this;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) { self.lathe([[r, -h / 2 + r], [r, h / 2 - r]], 6, m, { at: [cx + s[0] * (w / 2 - r), cy, cz + s[1] * (d / 2 - r)] }); });
    return this;
  };
  Mesh.prototype.sphere = function (cx, cy, cz, r, m, sy, segs) {
    var prof = []; segs = segs || 10;
    for (var i = 0; i <= segs; i++) { var a = -Math.PI / 2 + Math.PI * i / segs; prof.push([Math.cos(a) * r, Math.sin(a) * r * (sy || 1)]); }
    return this.lathe(prof, segs * 2, m, { at: [cx, cy, cz] });
  };
  /* a tube through points, smooth */
  Mesh.prototype.tube = function (pts, r, m, sides) {
    sides = sides || 6; var pid = ++this.pid;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], d = norm(sub(b, a)), up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      var s = norm(cross(d, up)), t = cross(d, s), mid = scale(add(a, b), 0.5);
      for (var k = 0; k < sides; k++) {
        var q0 = k / sides * 6.2832, q1 = (k + 1) / sides * 6.2832;
        var o0 = add(scale(s, Math.cos(q0) * r), scale(t, Math.sin(q0) * r)), o1 = add(scale(s, Math.cos(q1) * r), scale(t, Math.sin(q1) * r));
        this.quad(add(a, o0), add(a, o1), add(b, o1), add(b, o0), m, mid, pid, true);
      }
    }
    return this;
  };
  /* a lump: a sphere pushed in and out by noise — stones, clumps of moss */
  Mesh.prototype.blob = function (cx, cy, cz, r, sy, m, amp, seed, segs) {
    segs = segs || 14; var pid = ++this.pid, rows = [];
    for (var i = 0; i <= segs; i++) {
      var la = -Math.PI / 2 + Math.PI * i / segs, row = [];
      for (var j = 0; j <= segs * 2; j++) {
        var lo = j / (segs * 2) * Math.PI * 2, d = [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
        var k = 1 + (fbm3(d[0] * 1.6 + seed, d[1] * 1.6, d[2] * 1.6) - 0.5) * amp * 2 + (n3(d[0] * 5 + seed, d[1] * 5, d[2] * 5) - 0.5) * amp * 0.5;
        row.push([cx + d[0] * r * k, cy + d[1] * r * k * sy, cz + d[2] * r * k]);
      }
      rows.push(row);
    }
    for (i = 0; i < segs; i++) for (var j2 = 0; j2 < segs * 2; j2++) this.quad(rows[i][j2], rows[i][j2 + 1], rows[i + 1][j2 + 1], rows[i + 1][j2], m, [cx, cy, cz], pid, true);
    /* the seam where the longitude wraps must share normals: weld it */
    return this;
  };
  /* a ring lying in a plane (axis y by default): torus */
  Mesh.prototype.torus = function (R, r, m, o) {
    o = o || {}; var prof = [], n = o.n || 8;
    for (var i = 0; i <= n; i++) { var a = i / n * Math.PI * 2; prof.push([R + Math.cos(a) * r, Math.sin(a) * r]); }
    return this.lathe(prof, o.segs || 24, m, o);
  };
  /* bake: outward normals, smooth vertex normals per part, and texture */
  Mesh.prototype.bake = function () {
    var acc = {};
    function key(pid, p) { return pid + ":" + Math.round(p[0] * 2000) + "," + Math.round(p[1] * 2000) + "," + Math.round(p[2] * 2000); }
    this.t.forEach(function (t) {
      var a = t.v[0], b = t.v[1], c = t.v[2], n = cross(sub(b, a), sub(c, a)), l = Math.hypot(n[0], n[1], n[2]);
      if (l < 1e-9) { t.dead = true; return; }
      n = scale(n, 1 / l);
      var cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      if (dot(n, sub(cen, t.ctr)) < 0) n = scale(n, -1);           // outward, always
      t.n = n; t.cen = cen;
      if (t.smooth) t.v.forEach(function (p) { var k = key(t.pid, p); acc[k] = acc[k] ? add(acc[k], scale(n, l)) : scale(n, l); });
    });
    this.t = this.t.filter(function (t) { return !t.dead; });
    /* shared vertices are lit once a frame, not once per triangle */
    var uniq = {}, verts = this.verts = [];
    this.t.forEach(function (t) {
      t.vn = t.v.map(function (p) { return t.smooth ? norm(acc[key(t.pid, p)]) : t.n; });
      /* hard creases stay hard: if a vertex normal swings too far from the face, keep the face's */
      t.vn = t.vn.map(function (vn) { return dot(vn, t.n) < 0.55 ? t.n : vn; });
      t.vi = t.v.map(function (p, j) {
        var vn = t.vn[j], k = key(t.pid, p) + "|" + (t.smooth ? "s" : Math.round(vn[0] * 100) + "," + Math.round(vn[1] * 100) + "," + Math.round(vn[2] * 100));
        if (uniq[k] == null) { var tx = null; if (t.m.tex) { var r = t.m.tex(p, t.n); tx = typeof r === "number" ? [r, r, r] : r; } uniq[k] = verts.length; verts.push({ p: p, n: vn, m: t.m, tx: tx }); }
        return uniq[k];
      });
    });
    return this;
  };
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function mix(a, b, k) { return a + (b - a) * k; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------------- surfaces ---------------- */
  function h3(x, y, z) { var s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
  function n3(x, y, z) {
    var X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), u = x - X, v = y - Y, w = z - Z;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
    function L(i, j, k) { return h3(X + i, Y + j, Z + k); }
    return mix(mix(mix(L(0, 0, 0), L(1, 0, 0), u), mix(L(0, 1, 0), L(1, 1, 0), u), v), mix(mix(L(0, 0, 1), L(1, 0, 1), u), mix(L(0, 1, 1), L(1, 1, 1), u), v), w);
  }
  function fbm3(x, y, z) { return n3(x, y, z) * 0.55 + n3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + n3(x * 4.3, y * 4.3, z * 4.3) * 0.15; }
  var TEX = {
    /* old leather: pores, soft mottling, a little darker where hands held it */
    leather: function (p) { var m = fbm3(p[0] * 6, p[1] * 6, p[2] * 6), pore = n3(p[0] * 40, p[1] * 40, p[2] * 40) > 0.78 ? 0.86 : 1; var wear = 1 + Math.max(0, Math.abs(p[0]) - 0.45) * 0.4 + Math.max(0, Math.abs(p[1]) - 0.7) * 0.5; return (0.84 + m * 0.3) * pore * wear; },
    /* paper and cloth */
    paper: function (p) { return 0.95 + n3(p[0] * 30, p[1] * 30, p[2] * 30) * 0.07; },
    /* page edges: fine stripes of leaves */
    leaves: function (p) { return 0.9 + 0.1 * Math.sin(p[2] * 260 + n3(p[0] * 8, p[1] * 8, 0) * 4); },
    /* brushed brass/steel: long fine streaks */
    brushed: function (p) { return 0.88 + n3(p[0] * 2, p[1] * 70, p[2] * 2) * 0.22; },
    /* yellow plastic gone chalky with age */
    chalky: function (p) { var m = fbm3(p[0] * 5, p[1] * 5, p[2] * 5); return [0.9 + m * 0.18, 0.9 + m * 0.16, 0.86 + m * 0.2]; },
    /* sandpaper grip tape */
    grit: function (p) { return 0.7 + h3(Math.floor(p[0] * 60), Math.floor(p[1] * 60), Math.floor(p[2] * 60)) * 0.6; },
    /* wood grain along y */
    woodY: function (p) { var r = Math.hypot(p[0], p[2]) * 18 + fbm3(p[0] * 2, p[1] * 0.6, p[2] * 2) * 6; var g = 0.5 + 0.5 * Math.sin(r * 2); return [0.82 + g * 0.24, 0.8 + g * 0.22, 0.78 + g * 0.2]; },
    /* bark: furrows running the length (x axis) */
    bark: function (p) { var a = Math.atan2(p[2], p[1]), f = Math.abs(Math.sin(a * 7 + fbm3(p[0] * 1.2, Math.cos(a), Math.sin(a)) * 3)); return 0.66 + f * 0.42 + n3(p[0] * 6, p[1] * 6, p[2] * 6) * 0.1; },
    /* end grain: the rings of the years */
    rings: function (p) { var r = Math.hypot(p[1], p[2]) * 30 + fbm3(p[1] * 3, p[2] * 3, 0) * 3; var g = 0.5 + 0.5 * Math.sin(r); return [0.86 + g * 0.18, 0.8 + g * 0.2, 0.72 + g * 0.2]; },
    /* granite: speckles of three minerals */
    granite: function (p) { var m = fbm3(p[0] * 3, p[1] * 3, p[2] * 3), s = n3(p[0] * 9, p[1] * 9, p[2] * 9); return [0.8 + m * 0.26 - Math.max(0, s - 0.7) * 0.6, 0.79 + m * 0.24 - Math.max(0, s - 0.7) * 0.6, 0.76 + m * 0.24 - Math.max(0, s - 0.72) * 0.5]; },
    /* moss: soft, fuzzy, uneven */
    moss: function (p) { return [0.8 + n3(p[0] * 30, p[1] * 30, p[2] * 30) * 0.4, 0.85 + n3(p[0] * 22, p[1] * 22, p[2] * 22) * 0.4, 0.8]; },
    /* gingham: two sets of stripes crossing; red where both, pink where one */
    gingham: function (p) { var a = Math.floor(p[0] * 7 + 100) % 2, b = Math.floor(p[2] * 7 + 100) % 2, k = a + b; return k === 2 ? [0.82, 0.22, 0.24] : k === 1 ? [1, 0.6, 0.6] : [1, 1, 1]; },
    ginghamBlue: function (p) { var a = Math.floor(p[0] * 7 + 100) % 2, b = Math.floor(p[2] * 7 + 100) % 2, k = a + b; return k === 2 ? [0.25, 0.42, 0.8] : k === 1 ? [0.66, 0.78, 1] : [1, 1, 1]; },
    /* a handwritten label: lines of ink with gaps, on paper */
    label: function (p) { var line = Math.abs(((p[1] * 9) % 1 + 1) % 1 - 0.5) < 0.08, ink = line && n3(p[0] * 16 + p[2] * 16, p[1] * 3, 0) > 0.42; return ink ? [0.35, 0.3, 0.42] : 0.95 + n3(p[0] * 30, p[1] * 30, p[2] * 30) * 0.06; },
    /* marbled pen resin: blue swirls */
    resin: function (p) { var s = 0.5 + 0.5 * Math.sin(p[1] * 9 + fbm3(p[0] * 4, p[1] * 2, p[2] * 4) * 7); return [0.7 + s * 0.6, 0.75 + s * 0.5, 0.85 + s * 0.3]; },
    /* knurled metal: a tight diamond pattern */
    knurl: function (p) { var a = Math.atan2(p[2], p[0]); return 0.75 + 0.35 * Math.abs(Math.sin(a * 22 + p[1] * 40) * Math.sin(a * 22 - p[1] * 40)); },
    /* a lamp lens: concentric fresnel rings */
    fresnel: function (p) { var r = Math.hypot(p[0], p[1] - 0.08); return 0.85 + 0.25 * Math.abs(Math.sin(r * 60)); },
    /* kraft paper with a printed band */
    kraft: function (p) { var band = p[1] > -0.1 && p[1] < 0.25; return band ? [1.15, 1.05, 0.7] : 0.9 + fbm3(p[0] * 12, p[1] * 12, p[2] * 12) * 0.2; }
  };

  /* ---------------- render ---------------- */
  var cv, x, W, H, dpr, st = null, raf = 0;
  var L = norm([-0.55, -0.75, -0.6]), RIM = norm([0.7, 0.2, 0.5]);
  /* light one vertex: key, rim, back-fill, specular, the room in reflections */
  function lit(n, V, m, tx) {
    var facing = dot(n, V);
    var lam = Math.max(0, dot(n, L)), wrap = Math.max(0, (dot(n, L) + 0.35) / 1.35);
    var rim = Math.pow(1 - Math.abs(facing), 2.5) * 0.5;
    var Hh = norm(add(L, V)), sp = Math.pow(Math.max(0, dot(n, Hh)), m.rough) * m.spec;
    var back = Math.max(0, dot(n, RIM)) * 0.22, k = 0.26 + 0.5 * lam + 0.3 * wrap + back;
    var c0 = m.c[0], c1 = m.c[1], c2 = m.c[2];
    if (tx) { c0 *= tx[0]; c1 *= tx[1]; c2 *= tx[2]; }
    var r = c0 * k + c0 * m.glow, g = c1 * k + c1 * m.glow, b = c2 * k + c2 * m.glow;
    if (m.refl) {
      /* what a shiny thing sees: warm lamp-lit room above, dark floor below, a bright window to one side */
      var R = sub(scale(n, 2 * dot(n, V)), V), up = clamp(-R[1] * 0.9 + 0.35, 0, 1), win = Math.pow(Math.max(0, dot(R, norm([-0.7, -0.5, -0.5]))), 18);
      var er = mix(36, 255, up) + win * 255, eg = mix(26, 226, up) + win * 245, eb = mix(18, 178, up) + win * 230;
      r = mix(r, er * (c0 / 255 * 0.7 + 0.3), m.refl); g = mix(g, eg * (c1 / 255 * 0.7 + 0.3), m.refl); b = mix(b, eb * (c2 / 255 * 0.7 + 0.3), m.refl);
    }
    r += 255 * sp + 255 * rim * 0.35; g += 245 * sp + 220 * rim * 0.35; b += 225 * sp + 170 * rim * 0.35;
    return [Math.min(255, r), Math.min(255, g), Math.min(255, b), m.a < 1 ? Math.min(1, m.a + sp * 0.6 + rim * 0.3) : 1];
  }
  function rgba(c) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + c[3].toFixed(3) + ")"; }
  function drawMesh(M, yaw, pitch, sc, cx, cy) {
    if (!M.baked) { M.bake(); M.baked = true; }
    var cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), R = 5;
    function T(p) { var X = p[0] * cyw + p[2] * syw, Z = -p[0] * syw + p[2] * cyw, Y = p[1] * cp - Z * sp; Z = p[1] * sp + Z * cp; return [X, Y, Z]; }
    var list = [], cam = [0, 0, -R], VP = M.verts.map(function (v) { return T(v.p); }), VC = new Array(M.verts.length), VCb = {};
    for (var i = 0; i < M.t.length; i++) {
      var t = M.t[i], m = t.m, n = T(t.n), cen = T(t.cen), Vc = norm(sub(cam, cen)), facing = dot(n, Vc), flip = 1;
      if (facing < 0) { if (m.a >= 0.99) continue; flip = -1; }
      var a = VP[t.vi[0]], b = VP[t.vi[1]], c = VP[t.vi[2]];
      list.push({ p: [a, b, c], z: cen[2] - m.bias, t: t, flip: flip });   // decals sit on top of what they're on
    }
    list.sort(function (p, q) { return q.z - p.z; });
    var f = sc;
    function P(v) { var k = R / (R + v[2]); return [cx + v[0] * f * k, cy + v[1] * f * k]; }
    x.lineJoin = "round";
    for (i = 0; i < list.length; i++) {
      var q = list[i], tt = q.t, cols = [];
      for (var j = 0; j < 3; j++) {
        var vi = tt.vi[j], store = q.flip < 0 ? VCb : VC;
        if (!store[vi]) { var V0 = M.verts[vi], vn = T(V0.n); if (q.flip < 0) vn = scale(vn, -1); store[vi] = lit(vn, norm(sub(cam, VP[vi])), V0.m, V0.tx); }
        cols.push(store[vi]);
      }
      var A0 = P(q.p[0]), B0 = P(q.p[1]), C0 = P(q.p[2]), fill;
      var l0 = cols[0][0] + cols[0][1] + cols[0][2], l1 = cols[1][0] + cols[1][1] + cols[1][2], l2 = cols[2][0] + cols[2][1] + cols[2][2];
      var hi = l0 >= l1 && l0 >= l2 ? 0 : l1 >= l2 ? 1 : 2, lo = l0 <= l1 && l0 <= l2 ? 0 : l1 <= l2 ? 1 : 2;
      var avg = [(cols[0][0] + cols[1][0] + cols[2][0]) / 3, (cols[0][1] + cols[1][1] + cols[2][1]) / 3, (cols[0][2] + cols[1][2] + cols[2][2]) / 3, (cols[0][3] + cols[1][3] + cols[2][3]) / 3];
      if (tt.smooth && avg[3] >= 1 && hi !== lo && Math.abs([l0, l1, l2][hi] - [l0, l1, l2][lo]) > 18) {
        var Ph = [A0, B0, C0][hi], Pl = [A0, B0, C0][lo];
        fill = x.createLinearGradient(Ph[0], Ph[1], Pl[0], Pl[1]); fill.addColorStop(0, rgba(cols[hi])); fill.addColorStop(1, rgba(cols[lo]));
      } else fill = rgba(avg);
      x.fillStyle = fill;
      x.beginPath(); x.moveTo(A0[0], A0[1]); x.lineTo(B0[0], B0[1]); x.lineTo(C0[0], C0[1]); x.closePath(); x.fill();
      if (avg[3] >= 1) { x.strokeStyle = fill; x.lineWidth = 0.7; x.stroke(); }      // seal seams; never on glass, where edges would double up
    }
  }

  /* ---------------- the things ---------------- */
  var BRASS = function () { return mat("#c9a040", { spec: 1, rough: 50, refl: 0.45, tex: TEX.brushed }); };
  var GOLD = function (glow) { return mat("#e8b84a", { spec: 1, rough: 60, refl: 0.5, glow: glow || 0 }); };
  /* a mason jar: thick glass with a rim and a threaded neck, a two-piece lid */
  function jarGlass(M, cloth) {
    var glass = mat("#d8eef0", { a: 0.22, spec: 1, rough: 80, refl: 0.35 });
    M.lathe([[0.5, -0.86], [0.6, -0.82], [0.67, -0.62], [0.69, -0.52], [0.705, -0.5], [0.69, -0.48], [0.69, 0.58], [0.7, 0.6], [0.69, 0.62], [0.69, 0.66], [0.64, 0.82], [0.5, 0.88], [0.001, 0.89]], 26, glass);
    /* the threaded neck, and the band with its knurled edge */
    for (var k = 0; k < 3; k++) M.torus(0.6, 0.018, mat("#d8eef0", { a: 0.3, spec: 1 }), { at: [0, -0.9 - k * 0.05, 0], segs: 20, n: 4 });
    M.lathe([[0.001, -1.08], [0.6, -1.08], [0.66, -1.04], [0.67, -0.98], [0.67, -0.86], [0.6, -0.86]], 26, mat("#c9a646", { spec: 1, rough: 50, refl: 0.5, tex: TEX.knurl }));
    if (cloth) {
      /* a square of cloth over the lid, tied down with twine, its corners hanging */
      var cl = mat("#f6f0e6", { spec: 0.05, tex: cloth, fine: 0.06 });
      M.lathe([[0.001, -1.14], [0.45, -1.13], [0.7, -1.06], [0.76, -0.95], [0.74, -0.82], [0.8, -0.72]], 28, cl);
      [0, 1, 2, 3].forEach(function (i) { var a = i * Math.PI / 2 + 0.4; M.tube([[Math.cos(a) * 0.76, -0.78, Math.sin(a) * 0.76], [Math.cos(a) * 0.86, -0.6, Math.sin(a) * 0.86], [Math.cos(a) * 0.82, -0.48, Math.sin(a) * 0.82]], 0.06, cl, 5); });
      M.torus(0.71, 0.022, mat("#c8a870", { spec: 0.1, tex: TEX.paper }), { at: [0, -0.88, 0], segs: 28, n: 5 });
      M.tube([[0.6, -0.88, -0.4], [0.7, -0.7, -0.55], [0.66, -0.5, -0.62]], 0.018, mat("#c8a870", { spec: 0.1 }), 4);
    }
  }
  /* a paper label, wrapped part-way round the jar, written on by hand */
  function jarLabel(M, y0, y1, ink) {
    M.lathe([[0.697, y0], [0.697, y1]], 20, mat("#f4ecd6", { spec: 0.06, tex: TEX.label, fine: 0.05 }), { a0: -2.2, a1: -0.9 });
  }
  var MODELS = {
    jam: function () {
      var M = new Mesh(); jarGlass(M, TEX.gingham);
      M.lathe([[0.001, -0.42], [0.58, -0.42], [0.64, -0.3], [0.64, 0.64], [0.56, 0.8], [0.001, 0.8]], 28, mat("#6e1426", { spec: 0.7, rough: 50, glow: 0.16 }));
      /* a few plum skins against the glass */
      [[0.3, 0.1, -0.55], [-0.35, 0.4, -0.5], [0.05, -0.2, -0.6]].forEach(function (p) { M.sphere(p[0], p[1], p[2], 0.12, mat("#3a0a1a", { spec: 0.6 }), 0.5, 5); });
      jarLabel(M, -0.15, 0.35);
      return M;
    },
    peach: function () {
      var M = new Mesh(); jarGlass(M, TEX.ginghamBlue);
      M.lathe([[0.001, -0.5], [0.58, -0.5], [0.64, -0.38], [0.64, 0.64], [0.56, 0.8], [0.001, 0.8]], 28, mat("#f0a040", { spec: 0.7, rough: 50, glow: 0.22 }));
      var half = mat("#f6b85a", { spec: 0.6, glow: 0.12 });
      [[0.2, 0.1, -0.38], [-0.25, 0.4, -0.32], [0.1, -0.25, -0.42], [-0.15, -0.1, -0.44], [0.32, 0.5, -0.3]].forEach(function (p) { M.sphere(p[0], p[1], p[2], 0.21, half, 0.7, 8); });
      jarLabel(M, -0.1, 0.4);
      return M;
    },
    crumb: function () {
      var M = new Mesh(); jarGlass(M, null);
      M.sphere(0.05, 0.74, 0, 0.16, mat("#b89a48", { spec: 0.2, tex: TEX.moss }), 0.45, 8);
      M.sphere(-0.12, 0.76, 0.06, 0.08, mat("#a88a3a", { spec: 0.2 }), 0.5, 6);
      M.sphere(0.2, 0.78, -0.1, 0.05, mat("#c8aa58", { spec: 0.2 }), 0.5, 5);
      return M;
    },
    book: function () {
      /* Gran's book: old tooled leather over boards, a rounded spine with
         raised bands, gilt page edges, a red silk ribbon, ornate brass
         corners and a clasp, a gold-tooled border with curling corners,
         and in the middle the foxfire she drew, in gold */
      var M = new Mesh(), cov = mat("#5e3a24", { spec: 0.32, rough: 16, tex: TEX.leather }), cov2 = mat("#4a2c1a", { spec: 0.28, rough: 14, tex: TEX.leather });
      var gilt = mat("#e0b050", { spec: 1, rough: 40, refl: 0.4, tex: TEX.leaves, fine: 0.09 });
      M.box(0.04, 0, -0.02, 1.32, 1.8, 0.07, cov).box(0.04, 0, 0.42, 1.32, 1.8, 0.07, cov);
      /* the page block, its three open edges gilded */
      M.box(0.06, 0, 0.2, 1.22, 1.7, 0.37, gilt);
      /* the spine: half a cylinder, with raised bands and gold tooling */
      var sp = { a0: Math.PI * 0.5, a1: Math.PI * 1.5, at: [-0.62, 0, 0.2] };
      M.lathe([[0.25, -0.9], [0.25, 0.9]], 14, cov2, sp);
      M.lathe([[0.001, -0.9], [0.25, -0.9]], 10, cov2, sp); M.lathe([[0.001, 0.9], [0.25, 0.9]], 10, cov2, sp);
      [-0.62, -0.2, 0.22, 0.64].forEach(function (y) {
        M.lathe([[0.25, y - 0.05], [0.285, y - 0.03], [0.285, y + 0.03], [0.25, y + 0.05]], 14, cov2, sp);
        [-0.075, 0.075].forEach(function (d) { M.lathe([[0.262, y + d - 0.006], [0.262, y + d + 0.006]], 14, GOLD(), sp); });
      });
      /* a little gold title panel on the spine */
      M.lathe([[0.258, -0.12], [0.258, 0.12]], 10, mat("#2a1810", { spec: 0.3 }), { a0: Math.PI * 0.85, a1: Math.PI * 1.15, at: [-0.62, 0, 0.2] });
      /* the tooled border: a double gold rule round the front, curling at the corners */
      var z = -0.062, g = mat("#e8b84a", { spec: 1, rough: 60, refl: 0.5, bias: 0.08 });
      [[0.5, 0.74], [0.44, 0.68]].forEach(function (b) { M.tube([[-0.5, -b[1], z], [b[0], -b[1], z], [b[0], b[1], z], [-0.5, b[1], z], [-0.5, -b[1], z]], 0.011, g, 4); });
      [[-0.5, -0.74, 1, 1], [0.5, -0.74, -1, 1], [0.5, 0.74, -1, -1], [-0.5, 0.74, 1, -1]].forEach(function (c) {
        var pts = []; for (var i = 0; i <= 10; i++) { var a = i / 10 * Math.PI * 1.6, r = 0.1 * (1 - i / 14); pts.push([c[0] + c[2] * (0.1 + Math.cos(a) * r), c[1] + c[3] * (0.1 + Math.sin(a) * r), z]); }
        M.tube(pts, 0.009, g, 4); M.sphere(c[0] + c[2] * 0.1, c[1] + c[3] * 0.1, z - 0.005, 0.022, g, 1, 5);
      });
      /* her foxfire, in the middle, glowing */
      var fox = mat("#ffcc55", { glow: 0.9, spec: 0.8, refl: 0.2, bias: 0.08 });
      [[[-0.32, -0.42, -0.064], [-0.1, -0.24, -0.066], [0.1, -0.44, -0.066], [0.32, -0.3, -0.064]], [[-0.32, 0.28, -0.064], [-0.06, 0.1, -0.066], [0.22, 0.34, -0.066], [0.34, 0.18, -0.064]], [[-0.06, 0.1, -0.066], [0.04, 0.4, -0.066], [0.2, 0.56, -0.064]], [[-0.1, -0.24, -0.066], [-0.2, -0.56, -0.064]], [[0.1, -0.44, -0.066], [0.18, -0.6, -0.064]]].forEach(function (p) { M.tube(p, 0.018, fox, 5); });
      M.sphere(-0.06, 0.1, -0.07, 0.035, fox, 1, 6); M.sphere(-0.1, -0.24, -0.07, 0.03, fox, 1, 6);
      /* ornate brass corners with rivets, front and back */
      [[0.68, -0.88, 1, 1], [0.68, 0.88, 1, -1]].forEach(function (c) {
        [-0.07, 0.47].forEach(function (zz) {
          var b = BRASS();
          M.box(c[0] - 0.08, c[1] + c[3] * 0.025, zz, 0.2, 0.05, 0.03, b); M.box(c[0] - 0.025, c[1] + c[3] * 0.08, zz, 0.05, 0.2, 0.03, b);
          M.sphere(c[0] - 0.12, c[1] + c[3] * 0.03, zz - 0.02 * (zz < 0 ? 1 : -1), 0.018, b, 1, 4); M.sphere(c[0] - 0.03, c[1] + c[3] * 0.12, zz - 0.02 * (zz < 0 ? 1 : -1), 0.018, b, 1, 4);
        });
      });
      /* the clasp: a leather strap round the fore-edge to a brass catch */
      M.box(0.73, 0.05, 0.2, 0.05, 0.24, 0.52, cov2); M.box(0.56, 0.05, -0.07, 0.3, 0.24, 0.025, cov2);
      M.box(0.43, 0.05, -0.088, 0.13, 0.17, 0.03, BRASS()); M.sphere(0.43, 0.05, -0.11, 0.03, GOLD(), 1, 6);
      /* the ribbon */
      M.tube([[0.1, 0.84, 0.2], [0.13, 1.0, 0.16], [0.09, 1.16, 0.2], [0.12, 1.3, 0.18]], 0.032, mat("#b8323a", { spec: 0.7, rough: 30, refl: 0.15 }), 5);
      return M;
    },
    lantern: function () {
      /* the crank lantern: yellow plastic gone chalky, a chromed bezel round a
         fresnel lens, a guard cage, the folding crank with a wooden knob, a
         rubber carry handle, and her label underneath */
      var M = new Mesh(), body = mat("#e2c03e", { spec: 0.35, rough: 18, tex: TEX.chalky, fine: 0.2 }), dark = mat("#2e2e30", { spec: 0.4 }), chrome = mat("#c8ccd0", { spec: 1, rough: 70, refl: 0.7 });
      M.rbox(0, 0.1, 0, 1.3, 1.1, 0.9, 0.12, body, mat("#efd46a", { spec: 0.4, tex: TEX.chalky }));
      /* grip ribs down the sides */
      for (var k = 0; k < 5; k++) [-0.66, 0.66].forEach(function (sx) { M.box(sx, -0.15 + k * 0.12, 0.05, 0.03, 0.05, 0.6, dark); });
      /* lens, bezel, guard */
      M.lathe([[0.001, -0.47], [0.38, -0.47], [0.4, -0.5], [0.001, -0.5]], 28, mat("#fff2c0", { glow: 0.55, spec: 1, rough: 90, a: 0.95, tex: TEX.fresnel }), { axis: "z", at: [0, 0.08, 0] });
      M.torus(0.42, 0.05, chrome, { axis: "z", at: [0, 0.08, -0.5], segs: 28, n: 8 });
      M.torus(0.48, 0.02, chrome, { axis: "z", at: [0, 0.08, -0.47], segs: 28, n: 5 });
      for (var g = 0; g < 4; g++) { var a = g / 4 * Math.PI + Math.PI / 8; M.tube([[Math.cos(a) * 0.44, 0.08 + Math.sin(a) * 0.44, -0.52], [Math.cos(a) * 0.3, 0.08 + Math.sin(a) * 0.3, -0.62], [-Math.cos(a) * 0.3, 0.08 - Math.sin(a) * 0.3, -0.62], [-Math.cos(a) * 0.44, 0.08 - Math.sin(a) * 0.44, -0.52]], 0.012, chrome, 4); }
      /* the handle: rubber over steel */
      M.tube([[-0.45, -0.45, 0], [-0.42, -0.8, 0], [-0.25, -0.92, 0], [0.25, -0.92, 0], [0.42, -0.8, 0], [0.45, -0.45, 0]], 0.065, mat("#1d1d1f", { spec: 0.25, rough: 10 }), 8);
      /* the crank: a folding steel arm and a turned wooden knob */
      M.lathe([[0.001, -0.05], [0.12, -0.05], [0.12, 0.05], [0.001, 0.05]], 16, chrome, { axis: "x", at: [0.68, 0.1, 0] });
      M.tube([[0.72, 0.1, 0], [0.92, 0.1, 0], [0.98, 0.32, 0], [0.98, 0.55, 0]], 0.045, chrome, 8);
      M.lathe([[0.001, 0.55], [0.07, 0.56], [0.1, 0.64], [0.1, 0.74], [0.08, 0.8], [0.001, 0.81]], 14, mat("#8a5a30", { spec: 0.5, rough: 30, tex: TEX.woodY }), { at: [0.98, 0, 0] });
      /* the little solar panel on top */
      M.box(0, -0.455, 0.12, 0.6, 0.02, 0.36, mat("#1a2a4a", { spec: 1, rough: 80, refl: 0.6, bias: 0.05 }));
      for (var c = 0; c < 3; c++) M.box(-0.2 + c * 0.2, -0.468, 0.12, 0.004, 0.004, 0.34, mat("#8a9ab8", { spec: 0.6 }));
      /* her label, half peeled: NEVER LET THE DARK WIN */
      M.box(0, 0.66, 0.15, 0.6, 0.01, 0.3, mat("#f6f0e0", { spec: 0.05, tex: TEX.label, fine: 0.05, bias: 0.06 }));
      return M;
    },
    phone: function (bars) {
      /* the phone: a rounded slab of glass and aluminum, a camera bump with
         three lenses, the drop of water still sitting over one of them */
      var M = new Mesh(), alu = mat("#6a6e76", { spec: 1, rough: 50, refl: 0.55, tex: TEX.brushed }), glass = mat(bars ? "#2a4a3a" : "#0e1418", { glow: bars ? 0.45 : 0.06, spec: 1, rough: 90, refl: 0.45, bias: 0.12 });
      M.rbox(0, 0, 0, 0.95, 1.85, 0.13, 0.06, alu);
      M.box(0, 0, -0.071, 0.88, 1.78, 0.008, glass);
      M.box(0, 0, 0.071, 0.88, 1.78, 0.008, mat("#1c1c22", { spec: 1, rough: 70, refl: 0.5, bias: 0.12 }));
      M.box(0, -0.8, -0.077, 0.22, 0.04, 0.004, mat("#050505", { bias: 0.2 }));
      /* the camera bump on the back */
      M.rbox(-0.22, -0.62, 0.1, 0.42, 0.42, 0.05, 0.08, mat("#2a2a30", { spec: 1, rough: 60, refl: 0.5, bias: 0.18 }));
      [[-0.32, -0.72], [-0.12, -0.72], [-0.32, -0.52]].forEach(function (c) { M.torus(0.07, 0.015, mat("#9aa0a8", { spec: 1, refl: 0.7, bias: 0.25 }), { axis: "z", at: [c[0], c[1], 0.12], segs: 18, n: 5 }); M.lathe([[0.001, 0.115], [0.06, 0.115]], 16, mat("#101830", { spec: 1, rough: 90, refl: 0.6, bias: 0.25 }), { axis: "z", at: [c[0], c[1], 0] }); });
      var drop = []; for (var i = 0; i <= 8; i++) { var a = i / 8 * Math.PI / 2; drop.push([Math.cos(a) * 0.12, 0.125 + Math.sin(a) * 0.08]); }
      M.lathe(drop.reverse(), 20, mat("#cfeaff", { a: 0.4, spec: 1, rough: 120, refl: 0.6, bias: 0.3 }), { axis: "z", at: [-0.32, -0.72, 0] });
      if (bars) { var gl = mat("#9fe0a0", { glow: 1 }); for (var b = 0; b < 3; b++) { var r = 0.25 + b * 0.18, p = []; for (var k = 0; k <= 10; k++) { var q = -0.9 + k / 10 * 1.8; p.push([Math.sin(q) * r, -1.15 - Math.cos(q) * r, 0]); } M.tube(p, 0.025, gl, 5); } }
      return M;
    },
    oats: function () {
      var M = new Mesh(), kraft = mat("#c9a774", { spec: 0.12, tex: TEX.kraft, fine: 0.08 });
      M.box(0, 0.15, 0, 1.0, 1.3, 0.55, kraft).box(0, -0.6, 0, 1.0, 0.2, 0.3, mat("#b8955f", { tex: TEX.paper }));
      M.box(0, 0.05, -0.28, 0.6, 0.45, 0.01, mat("#f2e2b0", { spec: 0, tex: TEX.label, fine: 0.05, bias: 0.06 }));
      var flake = mat("#efe2c0", { spec: 0.1, tex: TEX.paper });
      for (var k = 0; k < 9; k++) M.sphere(-0.6 + k * 0.15, 0.85 + (k % 2) * 0.02, -0.45 + (k % 3) * 0.12, 0.08, flake, 0.25, 5);
      return M;
    },
    scooter: function () {
      /* my scooter, after the shed: the crank lantern bungeed onto the front,
         copper wire from its dynamo to the wheel, duct tape round the stem,
         the old grips, a streamer that was there first */
      var M = new Mesh(), red = mat("#d0402c", { spec: 0.8, rough: 40, refl: 0.25 }), grip = mat("#1d1d22", { spec: 0.2, tex: TEX.knurl }), steel = mat("#b8bcc0", { spec: 1, rough: 60, refl: 0.6, tex: TEX.brushed }), tire = mat("#202024", { spec: 0.2, rough: 10 }), hub = mat("#e8e8ea", { spec: 1, rough: 70, refl: 0.7 });
      M.box(0, 0.58, 0.05, 0.46, 0.1, 2.0, red, mat("#2a2a2e", { spec: 0.05, tex: TEX.grit, fine: 0.06 }));
      M.box(0, 0.65, 1.05, 0.3, 0.06, 0.3, red);
      [[-1.02], [1.12]].forEach(function (z) {
        var ring = []; for (var i = 0; i <= 12; i++) { var a = i / 12 * Math.PI * 2; ring.push([0.24 + Math.cos(a) * 0.08, Math.sin(a) * 0.1]); }
        M.lathe(ring, 22, tire, { axis: "x", at: [0, 0.72, z[0]] });
        M.lathe([[0.001, -0.075], [0.15, -0.075], [0.165, -0.06], [0.165, 0.06], [0.15, 0.075], [0.001, 0.075]], 18, hub, { axis: "x", at: [0, 0.72, z[0]] });
        for (var s = 0; s < 5; s++) { var b = s / 5 * Math.PI * 2; M.sphere(0.08, 0.72 + Math.cos(b) * 0.09, z[0] + Math.sin(b) * 0.09, 0.015, mat("#888", { spec: 1, refl: 0.5 }), 1, 4); }
      });
      M.tube([[0, 0.62, -0.98], [0, -0.95, -0.8]], 0.065, steel, 10);
      M.torus(0.085, 0.02, steel, { axis: "y", at: [0, 0.35, -0.95], segs: 14, n: 5 });
      M.tube([[-0.1, 0.72, -1.02], [-0.06, 0.45, -0.98]], 0.035, steel, 6); M.tube([[0.1, 0.72, -1.02], [0.06, 0.45, -0.98]], 0.035, steel, 6);
      M.tube([[-0.46, -0.95, -0.8], [0.46, -0.95, -0.8]], 0.045, steel, 8);
      M.tube([[-0.64, -0.95, -0.8], [-0.4, -0.95, -0.8]], 0.075, grip, 10); M.tube([[0.4, -0.95, -0.8], [0.64, -0.95, -0.8]], 0.075, grip, 10);
      ["#f2d070", "#8ad0e0", "#f08aa0", "#a0e08a"].forEach(function (c, i) { M.tube([[0.65, -0.95, -0.8], [0.78 + i * 0.03, -0.82 + i * 0.05, -0.72], [0.88 + i * 0.05, -0.64 + i * 0.07, -0.66], [0.92 + i * 0.06, -0.5 + i * 0.08, -0.62]], 0.014, mat(c, { spec: 0.4 }), 4); });
      [-0.15, -0.05, 0.05].forEach(function (y) { var u = (y + 0.95) / 1.57; M.tube([[0, y, -0.8 - 0.18 * u - 0.004], [0, y + 0.08, -0.8 - 0.18 * u - 0.016]], 0.085, mat("#a8acb0", { spec: 0.7, rough: 24, refl: 0.3 }), 10); });
      var body = mat("#e2c03e", { spec: 0.4, tex: TEX.chalky, fine: 0.2 });
      M.rbox(0, 0.1, -1.12, 0.6, 0.48, 0.42, 0.06, body, mat("#efd46a", { spec: 0.4, tex: TEX.chalky }));
      M.lathe([[0.001, -0.23], [0.16, -0.23], [0.16, -0.26], [0.001, -0.26]], 18, mat("#fff4c8", { glow: 1, tex: TEX.fresnel }), { axis: "z", at: [0, 0.1, -1.1] });
      M.torus(0.18, 0.025, mat("#c8ccd0", { spec: 1, refl: 0.7 }), { axis: "z", at: [0, 0.1, -1.36], segs: 18, n: 6 });
      M.tube([[0.31, 0.1, -1.0], [0.48, 0.1, -1.0], [0.48, 0.32, -1.0]], 0.03, mat("#c8ccd0", { spec: 1, refl: 0.6 }), 6);
      M.lathe([[0.001, 0.32], [0.05, 0.33], [0.06, 0.4], [0.045, 0.45], [0.001, 0.45]], 10, mat("#8a5a30", { spec: 0.5, tex: TEX.woodY }), { at: [0.48, 0, -1.0] });
      [["#2e8a3a", -0.02], ["#e0702a", 0.22]].forEach(function (b) { M.tube([[-0.33, b[1], -0.92], [-0.33, b[1], -1.35], [0.33, b[1], -1.35], [0.33, b[1], -0.92], [-0.33, b[1], -0.92]], 0.03, mat(b[0], { spec: 0.5 }), 6); M.sphere(0.33, b[1], -0.92, 0.04, mat("#c8ccd0", { spec: 1, refl: 0.6 }), 1, 5); });
      M.tube([[0.3, 0.25, -1.05], [0.28, 0.4, -1.0], [0.24, 0.52, -1.05], [0.2, 0.6, -0.98], [0.16, 0.66, -1.02]], 0.018, mat("#d8804a", { spec: 1, rough: 60, refl: 0.5 }), 5);
      return M;
    },
    rock: function () {
      var M = new Mesh();
      M.blob(0, 0.1, 0, 0.95, 0.62, mat("#dcd6c6", { spec: 0.3, rough: 20, tex: TEX.granite }), 0.16, 3.1, 18);
      var moss = mat("#6e8a46", { spec: 0.05, tex: TEX.moss });
      for (var k = 0; k < 16; k++) { var a = k * 2.4, r = 0.12 + (k % 5) * 0.07; M.blob(Math.cos(a) * r, -0.44 - (k % 3) * 0.03, Math.sin(a) * r, 0.1 + (k % 3) * 0.02, 0.6, moss, 0.25, k, 5); }
      /* tiny moss sporophytes standing up out of it */
      for (var s = 0; s < 8; s++) { var b = s * 1.3, rr = 0.2 + (s % 3) * 0.1; M.tube([[Math.cos(b) * rr, -0.5, Math.sin(b) * rr], [Math.cos(b) * rr + 0.02, -0.72, Math.sin(b) * rr]], 0.008, mat("#a88a3a"), 3); M.sphere(Math.cos(b) * rr + 0.02, -0.74, Math.sin(b) * rr, 0.02, mat("#8a6a2a", { spec: 0.4 }), 1.6, 4); }
      return M;
    },
    log: function () {
      var M = new Mesh(), bark = mat("#6a4a2c", { spec: 0.08, tex: TEX.bark, fine: 0.06 });
      var prof = [[0.001, -1.4], [0.5, -1.4]]; for (var y = -1.3; y <= 1.31; y += 0.16) prof.push([0.55 + Math.sin(y * 3.1) * 0.012, y]); prof.push([0.5, 1.4], [0.001, 1.4]);
      M.lathe(prof, 34, bark, { axis: "x" });
      M.lathe([[0.001, 1.402], [0.48, 1.402]], 22, mat("#d8b88a", { spec: 0.1, tex: TEX.rings }), { axis: "x" });
      M.lathe([[0.001, -1.402], [0.48, -1.402]], 22, mat("#d0b080", { spec: 0.1, tex: TEX.rings }), { axis: "x" });
      var moss = mat("#5e8a36", { spec: 0.05, tex: TEX.moss }), leaf = mat("#8ad05a", { glow: 0.1, spec: 0.4 });
      for (var k = 0; k < 15; k++) M.sphere(-1.2 + k * 0.17, -0.5, (k % 3 - 1) * 0.15, 0.15, moss, 0.55, 4);
      [-0.7, -0.1, 0.5, 1.0].forEach(function (x) { M.tube([[x, -0.55, 0], [x + 0.05, -1.25, 0]], 0.022, mat("#6a5030"), 5); [[-0.12, -1.25], [0.13, -1.1], [-0.1, -1.0]].forEach(function (l) { M.sphere(x + l[0] + 0.05, l[1], 0, 0.09, leaf, 0.35, 6); }); });
      /* bracket fungus on the side */
      [[0.2, 0.1, -0.55], [0.4, 0.25, -0.5]].forEach(function (f) { M.lathe([[0.001, 0], [0.16, 0.01], [0.18, 0.04], [0.001, 0.05]], 14, mat("#e8c890", { spec: 0.3 }), { at: f, a0: Math.PI, a1: Math.PI * 2 }); });
      return M;
    },
    roots: function () {
      var M = new Mesh(), root = mat("#7a5634", { spec: 0.1, tex: TEX.bark }), fuzz = mat("#f4f2ea", { glow: 0.25, spec: 0 });
      M.tube([[-1.2, 0.2, 0], [-0.6, 0.05, 0.1], [-0.1, 0.1, 0], [0.3, 0.25, -0.1], [0.8, 0.12, 0.05], [1.2, 0.05, 0]], 0.2, root, 10);
      M.tube([[0.3, 0.25, -0.1], [0.45, 0.55, 0.05], [0.6, 0.8, 0.1]], 0.09, root, 8);
      M.tube([[-0.6, 0.05, 0.1], [-0.7, 0.4, -0.1], [-0.65, 0.7, 0]], 0.07, root, 8);
      for (var k = 0; k < 34; k++) { var xx = -1.1 + k * 0.066, y = 0.12 + Math.sin(k) * 0.08; M.tube([[xx, y, 0], [xx + Math.sin(k * 3) * 0.3, y + 0.45 + (k % 3) * 0.15, Math.cos(k * 2) * 0.3]], 0.009, fuzz, 3); }
      return M;
    },
    pen: function () {
      /* the fountain pen: marbled resin, gold bands and clip, a gold nib */
      var M = new Mesh(), resin = mat("#2a3a6a", { spec: 0.9, rough: 60, refl: 0.3, tex: TEX.resin, fine: 0.05 }), gold = GOLD();
      M.lathe([[0.001, -1.2], [0.06, -1.19], [0.105, -1.12], [0.11, -0.2], [0.105, 0.0]], 18, resin);
      M.lathe([[0.1, 0.0], [0.095, 0.55], [0.08, 0.7]], 18, resin);
      M.lathe([[0.08, 0.7], [0.05, 0.84], [0.04, 0.9]], 18, mat("#1a1a20", { spec: 0.8, refl: 0.3 }));
      M.lathe([[0.04, 0.9], [0.032, 1.0], [0.012, 1.12], [0.001, 1.16]], 12, gold, { a0: Math.PI, a1: Math.PI * 2 });
      M.box(0, 1.03, -0.02, 0.006, 0.12, 0.002, mat("#2a2010"));
      [[-1.05, 0.02], [-0.2, 0.025], [-0.12, 0.012], [0.0, 0.03]].forEach(function (b) { M.torus(0.112, b[1] * 0.5, gold, { at: [0, b[0], 0], segs: 18, n: 6 }); });
      M.tube([[0.12, -1.0, 0], [0.15, -0.95, 0], [0.15, -0.45, 0], [0.13, -0.38, 0]], 0.02, gold, 6);
      M.sphere(0.13, -0.38, 0, 0.032, gold, 1, 6);
      return M;
    },
    coin: null
  };
  var MODEL_OF = { peach: "peach", book: "book", lantern: "lantern", scooter: "scooter", lens: "phone", oats: "oats", roots: "roots", log: "log", proof: "rock", crumb: "crumb", pen: "pen", onebar: "phonebars", jam: "jam" };

  /* abstract keys (your eyes, stillness…) are minted as gold coins that spin */
  function drawCoin(icon, yaw, sc, cx, cy) {
    var c = Math.cos(yaw), w = Math.abs(c) * sc, r = sc;
    x.save(); x.translate(cx, cy);
    var edge = Math.sin(yaw) * sc * 0.12;
    x.fillStyle = "#8a6a1e"; x.beginPath(); x.ellipse(edge, 0, Math.max(2, w), r, 0, 0, 6.2832); x.fill();
    var g = x.createLinearGradient(-w, -r, w, r); g.addColorStop(0, "#fff0b0"); g.addColorStop(0.45, "#e8b840"); g.addColorStop(1, "#9a6a18");
    x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, Math.max(2, w), r, 0, 0, 6.2832); x.fill();
    x.strokeStyle = "rgba(255,250,220,.7)"; x.lineWidth = r * 0.04; x.beginPath(); x.ellipse(0, 0, Math.max(1, w * 0.86), r * 0.86, 0, 0, 6.2832); x.stroke();
    if (c > 0.05 && icon) { x.scale(c, 1); x.globalAlpha = Math.min(1, c * 1.5); x.drawImage(icon, -r * 0.62, -r * 0.62, r * 1.24, r * 1.24); }
    x.restore();
  }

  /* ---------------- the moment ---------------- */
  I.show = function (o) {
    return new Promise(function (res) {
      cv = $("icv"); x = cv.getContext("2d");
      var ov = $("insp");
      var key = MODEL_OF[o.key || o.icon] || null, M = null;
      if (key === "phonebars") M = MODELS.phone(true); else if (key && MODELS[key]) M = MODELS[key]();
      var icon = null; if (!M) { icon = BS.cv(192, 192); BS.icons[o.icon] && BS.icons[o.icon](icon.getContext("2d"), 192); }
      st = { M: M, icon: icon, t: 0, yaw: Math.PI * 7, pitch: -0.25, vy: 0, vp: 0, zoom: 1, drag: null, res: res, open: performance.now(), parts: [] };
      $("ikick").textContent = o.kind || "Found"; $("iname").textContent = o.name; $("isci").textContent = o.sci || "";
      $("itext").innerHTML = G.fmt(o.text || ""); $("iopens").innerHTML = o.opens ? "<span>Opens</span> " + G.fmt(o.opens) : "";
      /* the collection: how many keys you hold, and the empty slots still out there */
      var S = BS.story, all = S ? Object.keys(S.ITEMS) : [], got = all.filter(function (k) { return G.s.items[k]; }).length;
      if (o.keepsake) { $("iprog").hidden = true; } else {
        $("iprog").hidden = false;
        $("icount").textContent = got + " of " + all.length + " keys";
        var slots = $("islots"); slots.innerHTML = "";
        all.forEach(function (k) { var d = document.createElement("i"); if (G.s.items[k]) d.className = k === o.key ? "new" : "got"; slots.appendChild(d); });
        $("ibar").style.width = "0%"; setTimeout(function () { $("ibar").style.width = (got / all.length * 100).toFixed(1) + "%"; }, 900);
        var left = all.length - got;
        $("itease").textContent = left ? left + (left === 1 ? " key is" : " keys are") + " still out there on the hill." : "Every key on the hill. Look long.";
      }
      ov.hidden = false; requestAnimationFrame(function () { ov.classList.add("on"); });
      A.sfx("whoosh"); setTimeout(function () { A.sfx("land"); }, 820);
      size(); window.addEventListener("resize", size);
      bind();
      cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
      G.modal = close;
      setTimeout(function () { $("iok").focus({ preventScroll: true }); }, 900);
    });
  };
  function close() {
    if (!st || performance.now() - st.open < 950) return;     // no skipping the moment by accident
    var ov = $("insp"); ov.classList.remove("on");
    var r = st.res; st = null; G.modal = null; G.holdUp = null;
    window.removeEventListener("resize", size);
    setTimeout(function () { ov.hidden = true; cancelAnimationFrame(raf); }, 380);
    A.sfx("ui"); r();
  }
  I.close = close;
  /* the world behind is hidden under the dark: no need to keep painting it */
  I.isOpen = function () { return !!st && performance.now() - st.open > 450; };
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr;
  }
  function loop(now) {
    if (!st) return;
    var dt = Math.min(0.05, (now - (st.last || now)) / 1000) || 1 / 60; st.last = now; st.t += dt;
    var t = st.t, intro = Math.min(1, t / 1.1), ease = 1 - Math.pow(1 - intro, 3);
    /* spin in fast, settle, then turn slowly by itself unless held */
    if (!st.drag) {
      if (intro < 1) st.yaw = Math.PI * 7 * (1 - ease) + 0.5;
      else { st.yaw += (st.vy + (Math.abs(st.vy) < 0.02 ? 0.35 : 0)) * dt; st.vy *= 0.94; st.pitch += st.vp * dt; st.vp *= 0.9; st.pitch += (-0.25 - st.pitch) * dt * 0.8; }
    }
    if (G.held("left")) st.yaw -= 2.2 * dt; if (G.held("right")) st.yaw += 2.2 * dt;
    if (G.held("up")) st.pitch = Math.max(-1.2, st.pitch - 1.6 * dt); if (G.held("down")) st.pitch = Math.min(1.2, st.pitch + 1.6 * dt);
    st.yaw += G.input.ax * 2.5 * dt; st.pitch += G.input.ay * 1.6 * dt;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    var wide = W > H * 1.1, cx = wide ? W * 0.36 : W / 2, cy = wide ? H * 0.5 : H * 0.3;
    var sc = Math.min(W * (wide ? 0.22 : 0.3), H * (wide ? 0.3 : 0.2)) * st.zoom * (0.3 + 0.7 * ease) * (intro < 1 ? 1 + Math.sin(intro * Math.PI) * 0.12 : 1);
    var bob = Math.sin(t * 1.4) * sc * 0.03;
    /* a pool of light, and a floor shadow */
    var g = x.createRadialGradient(cx, cy, 0, cx, cy, sc * 2.6); g.addColorStop(0, "rgba(255,214,140,.30)"); g.addColorStop(0.5, "rgba(255,190,100,.08)"); g.addColorStop(1, "rgba(255,190,100,0)");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    var sg = x.createRadialGradient(cx, cy + sc * 1.25, 0, cx, cy + sc * 1.25, sc * 0.9); sg.addColorStop(0, "rgba(0,0,0,.45)"); sg.addColorStop(1, "rgba(0,0,0,0)");
    x.save(); x.translate(cx, cy + sc * 1.25); x.scale(1, 0.22); x.translate(-cx, -cy - sc * 1.25); x.fillStyle = sg; x.fillRect(cx - sc, cy + sc * 0.3, sc * 2, sc * 2); x.restore();
    /* the landing flash */
    if (t > 0.75 && t < 1.5) { var k = 1 - (t - 0.75) / 0.75; x.strokeStyle = "rgba(255,236,170," + (k * 0.8) + ")"; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, sc * (1.1 + (1 - k) * 1.2), 0, 6.2832); x.stroke(); }
    if (st.M) drawMesh(st.M, st.yaw, st.pitch, sc, cx, cy + bob); else drawCoin(st.icon, st.yaw, sc * 0.95, cx, cy + bob);
    /* sparkles drifting off it */
    if (!G.prefs.reduced && Math.random() < 0.5) st.parts.push({ x: cx + (Math.random() - 0.5) * sc * 1.6, y: cy + (Math.random() - 0.3) * sc, vy: -20 - Math.random() * 30, t: 0, r: 1 + Math.random() * 2 });
    x.globalCompositeOperation = "lighter";
    st.parts.forEach(function (p) { p.t += dt; p.y += p.vy * dt; var a = Math.sin(Math.PI * Math.min(1, p.t / 2)) * 0.8; x.fillStyle = "rgba(255,226,150," + a + ")"; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.2832); x.fill(); });
    st.parts = st.parts.filter(function (p) { return p.t < 2; });
    x.globalCompositeOperation = "source-over";
    raf = requestAnimationFrame(loop);
  }
  /* turning it over in your hands */
  var bound = false;
  function bind() {
    if (bound) return; bound = true;
    var c = $("icv"), pts = {};
    c.addEventListener("pointerdown", function (e) { if (!st) return; c.setPointerCapture(e.pointerId); pts[e.pointerId] = [e.clientX, e.clientY]; st.drag = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    c.addEventListener("pointermove", function (e) {
      if (!st || !pts[e.pointerId]) return;
      var ids = Object.keys(pts);
      if (ids.length === 2) {           // pinch to lean in
        var o = pts[ids[0]], p = pts[ids[1]], d0 = Math.hypot(o[0] - p[0], o[1] - p[1]);
        pts[e.pointerId] = [e.clientX, e.clientY];
        o = pts[ids[0]]; p = pts[ids[1]];
        var d1 = Math.hypot(o[0] - p[0], o[1] - p[1]);
        st.zoom = Math.max(0.7, Math.min(1.8, st.zoom * d1 / Math.max(1, d0)));
        return;
      }
      pts[e.pointerId] = [e.clientX, e.clientY];
      if (!st.drag) return;
      var dx = e.clientX - st.drag.x, dy = e.clientY - st.drag.y;
      st.yaw += dx * 0.012; st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch + dy * 0.008));
      var now = performance.now(), dtm = Math.max(1, now - st.drag.t);
      st.vy = dx * 0.012 / dtm * 1000 * 0.6; st.vp = dy * 0.008 / dtm * 1000 * 0.4;
      st.drag = { x: e.clientX, y: e.clientY, t: now };
    });
    function up(e) { delete pts[e.pointerId]; if (st && !Object.keys(pts).length) st.drag = null; }
    c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", function (e) { if (!st) return; e.preventDefault(); st.zoom = Math.max(0.7, Math.min(1.8, st.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); }, { passive: false });
    $("iok").addEventListener("click", close);
  }
})();
