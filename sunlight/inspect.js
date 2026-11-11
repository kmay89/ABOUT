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

  /* ---------------- tiny 3D ---------------- */
  function mat(color, o) { o = o || {}; return { c: BS.hex(color), a: o.a == null ? 1 : o.a, spec: o.spec == null ? 0.35 : o.spec, glow: o.glow || 0, rough: o.rough || 24 }; }
  function Mesh() { this.t = []; }
  Mesh.prototype.tri = function (a, b, c, m) { this.t.push([a, b, c, m]); };
  Mesh.prototype.quad = function (a, b, c, d, m) { this.tri(a, b, c, m); this.tri(a, c, d, m); };
  /* turn a profile [[r, y], ...] around an axis; a0..a1 limits the sweep */
  Mesh.prototype.lathe = function (prof, segs, m, o) {
    o = o || {}; var a0 = o.a0 || 0, a1 = o.a1 == null ? Math.PI * 2 : o.a1, ax = o.axis || "y", off = o.at || [0, 0, 0];
    function P(r, y, a) {
      var x = Math.cos(a) * r, z = Math.sin(a) * r, p;
      if (ax === "y") p = [x, y, z]; else if (ax === "x") p = [y, x, z]; else p = [x, z, y];
      return [p[0] + off[0], p[1] + off[1], p[2] + off[2]];
    }
    for (var i = 0; i < prof.length - 1; i++) for (var j = 0; j < segs; j++) {
      var u0 = a0 + (a1 - a0) * j / segs, u1 = a0 + (a1 - a0) * (j + 1) / segs;
      var A0 = P(prof[i][0], prof[i][1], u0), B0 = P(prof[i][0], prof[i][1], u1), A1 = P(prof[i + 1][0], prof[i + 1][1], u0), B1 = P(prof[i + 1][0], prof[i + 1][1], u1);
      this.quad(A0, B0, B1, A1, m);
    }
    return this;
  };
  Mesh.prototype.box = function (cx, cy, cz, w, h, d, m, mTop) {
    var x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    var v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    this.quad(v[0], v[1], v[2], v[3], m); this.quad(v[5], v[4], v[7], v[6], m);
    this.quad(v[4], v[0], v[3], v[7], m); this.quad(v[1], v[5], v[6], v[2], m);
    this.quad(v[4], v[5], v[1], v[0], mTop || m); this.quad(v[3], v[2], v[6], v[7], m);
    return this;
  };
  Mesh.prototype.sphere = function (cx, cy, cz, r, m, sy, segs) {
    var prof = []; segs = segs || 10;
    for (var i = 0; i <= segs; i++) { var a = -Math.PI / 2 + Math.PI * i / segs; prof.push([Math.cos(a) * r, Math.sin(a) * r * (sy || 1)]); }
    return this.lathe(prof, segs * 2, m, { at: [cx, cy, cz] });
  };
  /* a tube through points */
  Mesh.prototype.tube = function (pts, r, m, sides) {
    sides = sides || 6;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], d = norm(sub(b, a)), up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      var s = norm(cross(d, up)), t = cross(d, s);
      for (var k = 0; k < sides; k++) {
        var q0 = k / sides * 6.2832, q1 = (k + 1) / sides * 6.2832;
        var o0 = add(scale(s, Math.cos(q0) * r), scale(t, Math.sin(q0) * r)), o1 = add(scale(s, Math.cos(q1) * r), scale(t, Math.sin(q1) * r));
        this.quad(add(a, o0), add(a, o1), add(b, o1), add(b, o0), m);
      }
    }
    return this;
  };
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  /* ---------------- the things ---------------- */
  function jarGlass(M) {
    var glass = mat("#d8eef0", { a: 0.26, spec: 1, rough: 60 });
    M.lathe([[0.5, -0.86], [0.62, -0.8], [0.68, -0.55], [0.68, 0.7], [0.6, 0.86], [0.001, 0.88]], 26, glass);
    M.lathe([[0.001, -1.06], [0.6, -1.06], [0.66, -1.0], [0.66, -0.84], [0.52, -0.84]], 26, mat("#c9a646", { spec: 0.9, rough: 30 }));
    for (var k = 0; k < 6; k++) { var y = -1.0 + k * 0.025; M.lathe([[0.665, y], [0.665, y + 0.012]], 26, mat("#8a6a2a")); }
  }
  var MODELS = {
    jam: function () {
      var M = new Mesh(); jarGlass(M);
      M.lathe([[0.001, -0.42], [0.58, -0.42], [0.63, -0.3], [0.63, 0.64], [0.55, 0.8], [0.001, 0.8]], 24, mat("#6e1426", { a: 0.94, spec: 0.6, rough: 40, glow: 0.12 }));
      M.lathe([[0.695, -0.05], [0.695, 0.45]], 18, mat("#f2e8d0", { spec: 0.1 }), { a0: -0.95, a1: 0.95 });
      M.lathe([[0.698, 0.06], [0.698, 0.1]], 18, mat("#a83a3a", { spec: 0.1 }), { a0: -0.95, a1: 0.95 });
      return M;
    },
    crumb: function () {
      var M = new Mesh(); jarGlass(M);
      M.sphere(0.05, 0.74, 0, 0.16, mat("#b89a48", { spec: 0.2 }), 0.45, 6);
      M.sphere(-0.12, 0.76, 0.06, 0.08, mat("#a88a3a", { spec: 0.2 }), 0.5, 5);
      return M;
    },
    book: function () {
      var M = new Mesh(), cov = mat("#5a3a26", { spec: 0.25 }), pg = mat("#efe4c8", { spec: 0.05 });
      M.box(0, 0, 0, 1.3, 1.75, 0.08, cov).box(0, 0, 0.36, 1.3, 1.75, 0.08, cov).box(0.05, 0, 0.18, 1.2, 1.65, 0.3, pg).box(-0.62, 0, 0.18, 0.08, 1.75, 0.44, cov);
      var gold = mat("#ffcc55", { glow: 0.9, spec: 0.8 });
      [[[-0.6, -0.5, -0.05], [-0.2, -0.3, -0.06], [0.1, -0.55, -0.06], [0.62, -0.4, -0.05]], [[-0.62, 0.3, -0.05], [-0.1, 0.1, -0.06], [0.3, 0.4, -0.06], [0.64, 0.2, -0.05]], [[-0.1, 0.1, -0.06], [0.05, 0.6, -0.06], [0.3, 0.86, -0.05]]].forEach(function (p) { M.tube(p, 0.02, gold, 4); });
      return M;
    },
    lantern: function () {
      var M = new Mesh(), body = mat("#e2c03e", { spec: 0.5 }), dark = mat("#3a3a3a", { spec: 0.4 });
      M.box(0, 0.1, 0, 1.3, 1.1, 0.9, body, mat("#efd46a", { spec: 0.6 }));
      M.lathe([[0.001, -0.48], [0.42, -0.48], [0.42, -0.6], [0.001, -0.6]], 24, mat("#f2c86a", { glow: 0.45, spec: 1, rough: 70, a: 0.95 }), { axis: "z", at: [0, 0.08, 0] });
      M.lathe([[0.46, -0.45], [0.48, -0.52], [0.44, -0.6]], 24, dark, { axis: "z", at: [0, 0.08, 0] });
      M.tube([[-0.45, -0.45, 0], [-0.4, -0.85, 0], [0.4, -0.85, 0], [0.45, -0.45, 0]], 0.06, dark, 6);
      M.tube([[0.66, 0.1, 0], [0.95, 0.1, 0], [0.95, 0.55, 0]], 0.05, dark, 6);
      M.lathe([[0.001, 0.55], [0.09, 0.55], [0.09, 0.8], [0.001, 0.8]], 10, mat("#b33a2a"), { at: [0.95, 0, 0] });
      M.box(0, 0.66, 0.2, 0.5, 0.01, 0.28, mat("#f6f0e0", { spec: 0 }));
      return M;
    },
    phone: function (bars) {
      var M = new Mesh();
      M.box(0, 0, 0, 0.95, 1.85, 0.12, mat("#1c1c22", { spec: 0.8, rough: 50 }));
      M.box(0, 0, -0.065, 0.85, 1.65, 0.01, mat(bars ? "#2a4a3a" : "#0e1418", { glow: bars ? 0.4 : 0.08, spec: 1, rough: 80 }));
      M.lathe([[0.001, 0.07], [0.08, 0.07], [0.08, 0.1], [0.001, 0.1]], 16, mat("#0a0a0a"), { axis: "z", at: [-0.25, -0.65, 0] });
      var drop = []; for (var i = 0; i <= 8; i++) { var a = i / 8 * Math.PI / 2; drop.push([Math.cos(a) * 0.16, 0.07 + Math.sin(a) * 0.11]); }
      M.lathe(drop.reverse(), 18, mat("#cfeaff", { a: 0.45, spec: 1, rough: 90 }), { axis: "z", at: [-0.25, -0.65, 0] });
      if (bars) { var g = mat("#9fe0a0", { glow: 1 }); for (var b = 0; b < 3; b++) { var r = 0.25 + b * 0.18, p = []; for (var k = 0; k <= 8; k++) { var q = -0.9 + k / 8 * 1.8; p.push([Math.sin(q) * r, -1.15 - Math.cos(q) * r, 0]); } M.tube(p, 0.025, g, 4); } }
      return M;
    },
    oats: function () {
      var M = new Mesh(), kraft = mat("#c9a774", { spec: 0.15 });
      M.box(0, 0.15, 0, 1.0, 1.3, 0.55, kraft).box(0, -0.6, 0, 1.0, 0.2, 0.3, mat("#b8955f"));
      M.box(0, 0.05, -0.28, 0.6, 0.45, 0.01, mat("#f2e2b0", { spec: 0 }));
      var flake = mat("#efe2c0", { spec: 0.1 });
      for (var k = 0; k < 7; k++) M.sphere(-0.6 + k * 0.2, 0.85 + (k % 2) * 0.02, -0.45 + (k % 3) * 0.12, 0.09, flake, 0.25, 4);
      return M;
    },
    scooter: function () {
      var M = new Mesh(), red = mat("#c8402e", { spec: 0.6 }), dark = mat("#222", { spec: 0.5 });
      M.box(0, 0.55, 0, 0.42, 0.08, 2.2, red);
      [[-1.05], [1.05]].forEach(function (z) { M.lathe([[0.001, -0.08], [0.28, -0.08], [0.3, 0], [0.28, 0.08], [0.001, 0.08]], 18, dark, { axis: "x", at: [0, 0.68, z[0]] }); });
      M.tube([[0, 0.5, -1.0], [0, -0.9, -0.85]], 0.06, mat("#9a9da0", { spec: 0.9 }), 6);
      M.tube([[-0.45, -0.9, -0.85], [0.45, -0.9, -0.85]], 0.05, dark, 6);
      M.box(0, 0.3, -0.75, 0.55, 0.42, 0.4, mat("#e2c03e"));
      M.lathe([[0.001, -0.21], [0.13, -0.21], [0.13, -0.25], [0.001, -0.25]], 12, mat("#fff4c8", { glow: 1 }), { axis: "z", at: [0, 0.3, -0.76] });
      M.box(0, 0.42, -0.5, 0.6, 0.03, 0.12, mat("#222", { spec: 0.1 }));
      return M;
    },
    rock: function () {
      var M = new Mesh();
      M.sphere(0, 0.1, 0, 0.95, mat("#dcd6c6", { spec: 0.2 }), 0.62, 12);
      var moss = mat("#7a8a5a", { spec: 0.05 });
      for (var k = 0; k < 16; k++) { var a = k * 2.4, r = 0.18 + (k % 4) * 0.08; M.sphere(Math.cos(a) * r, -0.45 - (k % 3) * 0.03, Math.sin(a) * r, 0.1, moss, 0.6, 4); }
      return M;
    },
    log: function () {
      var M = new Mesh(), bark = mat("#6a4a2c", { spec: 0.1 });
      M.lathe([[0.001, -1.4], [0.5, -1.4], [0.55, -1.2], [0.55, 1.2], [0.5, 1.4], [0.001, 1.4]], 16, bark, { axis: "x" });
      M.lathe([[0.001, 1.401], [0.48, 1.401]], 16, mat("#d8b88a"), { axis: "x" });
      var moss = mat("#5e8a36", { spec: 0.05 }), leaf = mat("#8ad05a", { glow: 0.1 });
      for (var k = 0; k < 18; k++) M.sphere(-1.2 + k * 0.14, -0.5, (k % 3 - 1) * 0.15, 0.13, moss, 0.6, 4);
      [-0.6, 0, 0.6].forEach(function (x) { M.tube([[x, -0.55, 0], [x + 0.05, -1.2, 0]], 0.025, mat("#6a5030"), 4); M.box(x - 0.1, -1.2, 0, 0.2, 0.04, 0.1, leaf); M.box(x + 0.12, -1.05, 0, 0.18, 0.04, 0.1, leaf); });
      return M;
    },
    roots: function () {
      var M = new Mesh(), root = mat("#7a5634", { spec: 0.1 }), fuzz = mat("#f4f2ea", { glow: 0.25, spec: 0 });
      M.tube([[-1.2, 0.2, 0], [-0.4, 0, 0.1], [0.3, 0.25, -0.1], [1.2, 0.05, 0]], 0.22, root, 8);
      M.tube([[0.3, 0.25, -0.1], [0.6, 0.8, 0.1]], 0.1, root, 6);
      for (var k = 0; k < 22; k++) { var x = -1.1 + k * 0.1, y = 0.1 + Math.sin(k) * 0.1; M.tube([[x, y, 0], [x + Math.sin(k * 3) * 0.3, y + 0.5 + (k % 3) * 0.15, Math.cos(k * 2) * 0.3]], 0.01, fuzz, 3); }
      return M;
    },
    pen: function () {
      var M = new Mesh();
      M.lathe([[0.001, -1.2], [0.1, -1.15], [0.1, 0.9], [0.06, 1.05], [0.001, 1.2]], 14, mat("#2a3a6a", { spec: 0.8 }));
      M.lathe([[0.104, -1.1], [0.104, -0.95]], 14, mat("#d8b860", { spec: 1 }));
      M.box(0.12, -0.75, 0, 0.03, 0.6, 0.06, mat("#d8b860", { spec: 1 }));
      return M;
    },
    coin: null
  };
  var MODEL_OF = { book: "book", lantern: "lantern", scooter: "scooter", lens: "phone", oats: "oats", roots: "roots", log: "log", proof: "rock", crumb: "crumb", pen: "pen", onebar: "phonebars", jam: "jam" };

  /* ---------------- render ---------------- */
  var cv, x, W, H, dpr, st = null, raf = 0;
  var L = norm([-0.55, -0.75, -0.6]), RIM = norm([0.7, 0.2, 0.5]);
  function shadeTri(t, R) {
    var a = t[0], b = t[1], c = t[2], m = t[3];
    var n = norm(cross(sub(b, a), sub(c, a)));
    var cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    var V = norm(sub([0, 0, -R], cen));
    var facing = dot(n, V);
    if (facing < 0) { if (m.a >= 0.99) return null; n = scale(n, -1); facing = -facing; }
    var lam = Math.max(0, dot(n, L)), rim = Math.pow(1 - facing, 2.5) * 0.55, Hh = norm(add(L, V)), sp = Math.pow(Math.max(0, dot(n, Hh)), m.rough) * m.spec;
    var back = Math.max(0, dot(n, RIM)) * 0.25;
    var k = 0.32 + 0.78 * lam + back;
    var r = m.c[0] * k + 255 * sp + 255 * rim * 0.4 + m.c[0] * m.glow, g = m.c[1] * k + 245 * sp + 220 * rim * 0.4 + m.c[1] * m.glow, bl = m.c[2] * k + 225 * sp + 170 * rim * 0.4 + m.c[2] * m.glow;
    return { col: "rgba(" + Math.min(255, r | 0) + "," + Math.min(255, g | 0) + "," + Math.min(255, bl | 0) + "," + (m.a < 1 ? Math.min(1, m.a + sp * 0.6 + rim * 0.3) : 1) + ")", z: cen[2] };
  }
  function drawMesh(M, yaw, pitch, sc, cx, cy) {
    var cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), R = 5;
    function T(p) { var X = p[0] * cyw + p[2] * syw, Z = -p[0] * syw + p[2] * cyw, Y = p[1] * cp - Z * sp; Z = p[1] * sp + Z * cp; return [X, Y, Z]; }
    var list = [];
    for (var i = 0; i < M.t.length; i++) {
      var t = M.t[i], a = T(t[0]), b = T(t[1]), c = T(t[2]), s = shadeTri([a, b, c, t[3]], R);
      if (s) list.push([a, b, c, s]);
    }
    list.sort(function (p, q) { return q[3].z - p[3].z; });
    var f = sc;
    function P(v) { var k = R / (R + v[2]); return [cx + v[0] * f * k, cy + v[1] * f * k]; }
    x.lineJoin = "round";
    for (i = 0; i < list.length; i++) {
      var q = list[i], A0 = P(q[0]), B0 = P(q[1]), C0 = P(q[2]);
      x.fillStyle = q[3].col; x.strokeStyle = q[3].col; x.lineWidth = 0.6;
      x.beginPath(); x.moveTo(A0[0], A0[1]); x.lineTo(B0[0], B0[1]); x.lineTo(C0[0], C0[1]); x.closePath(); x.fill(); x.stroke();
    }
  }
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
