/* The Chess Room — a face across the board.
   Each coach on the ladder is a little plant in a pot with a face, drawn
   here in its own small WebGL canvas next to its name: an acorn in its
   cap, a sprout with two leaves, a clover, a fern, a stem of bamboo in a
   headband, a cactus with a flower and a frown, a pine in tiers, and an
   old oak in spectacles. What each one looks like is data (cast.js,
   `look`); this file only knows how to build those shapes and how a face
   moves: it breathes, it blinks, it looks toward the move, it tilts its
   head while it thinks, it hops when it is pleased and droops when it is
   not, and its mouth moves while it talks.

   It costs very little and sleeps when it can. The canvas is small, the
   shapes are a few thousand triangles, and the loop only runs while
   something is moving: a reaction, a line being said, the coach
   thinking. Between those it holds still and wakes for a blink every
   few seconds. With reduced motion it holds still altogether (it still
   changes expression, and still blinks, which is not motion so much as
   being alive).

   No WebGL, no face: create() returns null and the room shows the
   coach's emoji instead. */
(function (root) {
"use strict";

/* ---------- a little linear algebra ---------- */
function m4() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function mul(a, b) {
  var o = new Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function T(x, y, z) { var m = m4(); m[12] = x; m[13] = y; m[14] = z; return m; }
function S(x, y, z) { var m = m4(); m[0] = x; m[5] = y == null ? x : y; m[10] = z == null ? x : z; return m; }
function RX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
function RY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
function RZ(a) { var c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function chain() { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }
function persp(fov, asp, n, f) {
  var t = 1 / Math.tan(fov / 2), nf = 1 / (n - f);
  return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0];
}
function look(e, c, u) {
  var zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], zl = Math.hypot(zx, zy, zz);
  zx /= zl; zy /= zl; zz /= zl;
  var xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx, xl = Math.hypot(xx, xy, xz);
  xx /= xl; xy /= xl; xz /= xl;
  var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
          -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
}
/* the matrix that carries a normal: the inverse transpose of the model's
   upper three by three, so a squashed sphere is still lit as one */
function nrm3(m) {
  var a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
  var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  var det = a * A + b * B + c * C || 1e-9, k = 1 / det;
  return [A * k, B * k, C * k,
          -(b * i - c * h) * k, (a * i - c * g) * k, -(a * h - b * g) * k,
          (b * f - c * e) * k, -(a * f - c * d) * k, (a * e - b * d) * k];
}
function hex3(h) { var n = parseInt(String(h).slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

/* ---------- shapes ----------
   Everything is a lathe (a profile turned round the y axis) or a flat
   leaf, built once and placed by a matrix. A profile is [radius, y]
   pairs from the bottom up; normals are worked out from the profile so
   a lathe is smooth all the way round. */
function lathe(prof, segs) {
  var pos = [], nrm = [], idx = [], n = prof.length;
  for (var i = 0; i < n; i++) {
    var p0 = prof[Math.max(0, i - 1)], p1 = prof[Math.min(n - 1, i + 1)];
    var dr = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dr, dy) || 1;
    var nr = dy / l, ny = -dr / l;
    for (var s = 0; s <= segs; s++) {
      var a = s / segs * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      pos.push(prof[i][0] * ca, prof[i][1], prof[i][0] * sa);
      nrm.push(nr * ca, ny, nr * sa);
    }
  }
  for (var j = 0; j < n - 1; j++) for (var k = 0; k < segs; k++) {
    var q = j * (segs + 1) + k, w = q + segs + 1;
    idx.push(q, w, q + 1, q + 1, w, w + 1);
  }
  return { pos: pos, nrm: nrm, idx: idx };
}
function sphereProf(r, rings, squashBot) {
  var p = [];
  for (var i = 0; i <= rings; i++) {
    var a = -Math.PI / 2 + Math.PI * i / rings;
    var y = Math.sin(a) * r;
    p.push([Math.max(1e-4, Math.cos(a) * r), y < 0 && squashBot ? y * squashBot : y]);
  }
  return p;
}
function torus(R, r, segs, rings) {
  var pos = [], nrm = [], idx = [];
  for (var j = 0; j <= rings; j++) {
    var v = j / rings * Math.PI * 2, cv = Math.cos(v), sv = Math.sin(v);
    for (var i = 0; i <= segs; i++) {
      var u = i / segs * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
      pos.push((R + r * cv) * cu, r * sv, (R + r * cv) * su);
      nrm.push(cv * cu, sv, cv * su);
    }
  }
  for (var b = 0; b < rings; b++) for (var a2 = 0; a2 < segs; a2++) {
    var q = b * (segs + 1) + a2, w = q + segs + 1;
    idx.push(q, w, q + 1, q + 1, w, w + 1);
  }
  return { pos: pos, nrm: nrm, idx: idx };
}
/* a leaf: a pointed oval in the xy plane, base at the origin, tip at
   y = 1, cupped a little so the light runs along it; both faces */
function leaf(w, cup, heart) {
  var pos = [], nrm = [], idx = [], L = 10, W = 4;
  for (var i = 0; i <= L; i++) {
    var t = i / L, half = heart ? w * Math.sin(Math.PI * t) * (1 + 0.6 * Math.max(0, 1 - Math.abs(t - 0.75) * 4)) : w * Math.sin(Math.PI * Math.pow(t, 0.8));
    for (var j = 0; j <= W; j++) {
      var u = j / W * 2 - 1, x = u * half, z = cup * (u * u) * half;
      pos.push(x, t, z);
      var nx = -2 * cup * u, nz = 1, nl = Math.hypot(nx, nz);
      nrm.push(nx / nl, 0, nz / nl);
    }
  }
  for (var a = 0; a < L; a++) for (var b = 0; b < W; b++) {
    var q = a * (W + 1) + b, w2 = q + W + 1;
    idx.push(q, w2, q + 1, q + 1, w2, w2 + 1);
    idx.push(q, q + 1, w2, q + 1, w2 + 1, w2);
  }
  return { pos: pos, nrm: nrm, idx: idx };
}

/* the bodies, by name (cast.js look.body): each a profile, its height,
   and where on it the face sits (fy) and how far out it is there (fr) */
var BODIES = {
  acorn:    { prof: [[0.02, -0.5], [0.24, -0.42], [0.36, -0.22], [0.40, 0.0], [0.38, 0.18], [0.30, 0.30]], fy: -0.07, fr: 0.40 },
  seed:     { prof: [[0.02, -0.5], [0.26, -0.44], [0.38, -0.22], [0.40, 0.02], [0.33, 0.24], [0.16, 0.36], [0.02, 0.40]], fy: 0.0, fr: 0.40 },
  round:    { prof: sphereProf(0.42, 12, 0.85).map(function (p) { return [p[0], p[1] - 0.08]; }), fy: -0.02, fr: 0.42 },
  tall:     { prof: [[0.02, -0.5], [0.28, -0.46], [0.34, -0.2], [0.34, 0.25], [0.28, 0.48], [0.12, 0.58], [0.02, 0.60]], fy: 0.1, fr: 0.34 },
  segments: { prof: [[0.02, -0.5], [0.27, -0.5], [0.27, 0.62], [0.24, 0.66], [0.02, 0.67]], fy: 0.12, fr: 0.27 },
  cactus:   { prof: [[0.02, -0.5], [0.30, -0.48], [0.32, -0.2], [0.32, 0.38], [0.26, 0.58], [0.12, 0.66], [0.02, 0.68]], fy: 0.14, fr: 0.32 },
  cone:     { prof: [[0.02, -0.5], [0.46, -0.48], [0.40, -0.2], [0.10, 0.12]], fy: -0.18, fr: 0.43 },
  trunk:    { prof: [[0.02, -0.5], [0.38, -0.5], [0.33, -0.2], [0.31, 0.2], [0.34, 0.34]], fy: -0.04, fr: 0.33 }
};

/* ---------- the shader ----------
   A vinyl toy rather than a photograph: a soft wrapped key light from
   the upper left, a cool sky and a warm floor, a bright rim from behind
   so the silhouette lifts off whatever it is in front of, and a tight
   highlight on anything shiny (eyes, the pot's glaze, spectacles). */
var VS = [
  "attribute vec3 aPos; attribute vec3 aNrm;",
  "uniform mat4 uVP, uM; uniform mat3 uN;",
  "varying vec3 vN; varying vec3 vW;",
  "void main(){ vec4 w = uM * vec4(aPos, 1.0); vW = w.xyz; vN = uN * aNrm; gl_Position = uVP * w; }"].join("\n");
var FS = [
  "precision mediump float;",
  "uniform vec3 uCol, uEye; uniform float uShine, uGlow, uAlpha;",
  "varying vec3 vN; varying vec3 vW;",
  "void main(){",
  "  vec3 N = normalize(vN); vec3 V = normalize(uEye - vW);",
  "  if (dot(N, V) < 0.0) N = -N;",
  "  vec3 L = normalize(vec3(-0.55, 0.85, 0.75));",
  "  float d = smoothstep(-0.25, 0.85, dot(N, L));",
  "  vec3 hemi = mix(vec3(0.52, 0.46, 0.42), vec3(0.78, 0.84, 0.95), N.y * 0.5 + 0.5);",
  "  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);",
  "  float sp = pow(max(dot(N, normalize(L + V)), 0.0), 60.0) * uShine;",
  "  vec3 c = uCol * (0.42 * hemi + 0.78 * d) + vec3(1.0, 0.95, 0.88) * rim * 0.42 + vec3(sp);",
  "  c = mix(c, uCol, uGlow);",
  "  gl_FragColor = vec4(c, uAlpha);",
  "}"].join("\n");

var REDUCED = false;
try { REDUCED = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) {}

function create(canvas, opts) {
  opts = opts || {};
  var gl = null;
  try { gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true }) ||
             canvas.getContext("experimental-webgl", { alpha: true, antialias: true, premultipliedAlpha: true }); } catch (e) { gl = null; }
  if (!gl) return null;

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  var U = {}, names = ["uVP", "uM", "uN", "uCol", "uEye", "uShine", "uGlow", "uAlpha"];
  names.forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
  var aPos = gl.getAttribLocation(prog, "aPos"), aNrm = gl.getAttribLocation(prog, "aNrm");

  var meshes = [];
  function upload(g) {
    var n = g.pos.length / 3, data = new Float32Array(n * 6);
    for (var i = 0; i < n; i++) {
      data[i * 6] = g.pos[i * 3]; data[i * 6 + 1] = g.pos[i * 3 + 1]; data[i * 6 + 2] = g.pos[i * 3 + 2];
      data[i * 6 + 3] = g.nrm[i * 3]; data[i * 6 + 4] = g.nrm[i * 3 + 1]; data[i * 6 + 5] = g.nrm[i * 3 + 2];
    }
    var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(g.idx), gl.STATIC_DRAW);
    var m = { vb: vb, ib: ib, n: g.idx.length };
    meshes.push(m);
    return m;
  }
  /* the shared shapes */
  var SPH = upload(lathe(sphereProf(1, 14), 22));
  var CYL = upload(lathe([[0.001, 0], [1, 0], [1, 1], [0.001, 1]], 18));
  var CONE = upload(lathe([[0.001, 0], [1, 0], [0.001, 1]], 18));
  var POT = upload(lathe([[0.001, -1.0], [0.30, -1.0], [0.36, -0.62], [0.41, -0.58], [0.42, -0.5], [0.38, -0.48], [0.001, -0.48]], 24));
  var LEAF = upload(leaf(0.32, 0.35, false));
  var HEART = upload(leaf(0.42, 0.25, true));
  var RING = upload(torus(1, 0.08, 20, 8));
  var bodies = {};

  var A = { canvas: canvas, gl: gl, look: null, id: null };
  var st = {
    t0: 0, mood: "idle", moodAt: 0, moodMs: 0, talkUntil: 0, talkRate: 10,
    gx: 0, gy: 0, lx: 0, ly: 0, blinkAt: 0, awakeUntil: 0, raf: 0, timer: 0
  };

  /* ---------- the face and the plant, as a list of things to draw ---------- */
  var draws = [];
  function put(mesh, M, col, shine, alpha, glow) {
    draws.push({ mesh: mesh, M: M, col: col, shine: shine || 0, alpha: alpha == null ? 1 : alpha, glow: glow || 0 });
  }
  function build(t) {
    draws.length = 0;
    var L = A.look; if (!L) return;
    var body = BODIES[L.body] || BODIES.seed, bm = bodies[L.body] || (bodies[L.body] = upload(lathe(body.prof, 26)));
    var c1 = hex3(L.col), c2 = hex3(L.col2 || L.col), pot = hex3(L.pot || "#c8663d");
    var m = st.mood, ma = moodAmount(t);
    /* the whole plant: breathing, swaying, and whatever the mood asks */
    var breathe = REDUCED ? 0 : Math.sin(t * 2.1) * 0.012;
    var sway = REDUCED ? 0 : Math.sin(t * 0.9) * 0.035;
    var hop = 0, squash = 1, tiltZ = sway, tiltX = 0;
    if (!REDUCED) {
      if (m === "happy" || m === "win") { var hp = Math.abs(Math.sin(t * (m === "win" ? 9 : 11))); hop = hp * 0.12 * ma; squash = 1 - (1 - hp) * 0.08 * ma; }
      if (m === "think") tiltZ += 0.16 * ma;
      if (m === "surprised") squash = 1 + 0.07 * ma;
    }
    if (m === "sad" || m === "lose") tiltX = 0.22 * ma;
    var root2 = chain(T(0, hop, 0), RZ(tiltZ * 0.6));
    /* the pot, which does not breathe */
    put(POT, chain(T(0, hop * 0.3, 0)), pot, 0.5);
    put(SPH, chain(T(0, -0.49 + hop * 0.3, 0), S(0.36, 0.035, 0.36)), mix3(hex3("#3b2a1e"), pot, 0.15), 0);
    /* the plant, bending at its base */
    var P = chain(root2, T(0, -0.5, 0), RX(-tiltX), S(1 + (1 - squash) * 0.5 - breathe, squash + breathe * 1.5, 1 + (1 - squash) * 0.5 - breathe), T(0, 0.5, 0));
    put(bm, P, c1, 0.12);
    tops(L, P, c1, c2, t, ma);
    face(L, P, body, t, ma);
  }
  function tops(L, P, c1, c2, t, ma) {
    var w = REDUCED ? 0 : Math.sin(t * 2.6) * 0.06;
    var droop = (st.mood === "sad" || st.mood === "lose") ? 0.45 * ma : 0;
    switch (L.top) {
      case "cap": {
        put(SPH, chain(P, T(0, 0.30, 0), S(0.43, 0.22, 0.43)), c2, 0.05);
        put(RING, chain(P, T(0, 0.29, 0), S(0.42, 0.42, 0.42)), mix3(c2, [0, 0, 0], 0.2), 0.05);
        put(CYL, chain(P, T(0, 0.48, 0), RZ(0.3 + w), S(0.035, 0.16, 0.035)), mix3(c2, [0, 0, 0], 0.3), 0);
        break;
      }
      case "sprout": {
        put(CYL, chain(P, T(0, 0.36, 0), RZ(w * 0.5), S(0.025, 0.24, 0.025)), c2, 0);
        put(LEAF, chain(P, T(0, 0.58, 0), RZ(0.95 + w + droop), RY(0.2), S(0.95, 0.42, 1)), c2, 0.15);
        put(LEAF, chain(P, T(0, 0.58, 0), RZ(-0.95 + w - droop), RY(-0.2), S(0.95, 0.42, 1)), c2, 0.15);
        break;
      }
      case "clover": {
        put(CYL, chain(P, T(0, 0.30, 0), S(0.025, 0.2, 0.025)), c2, 0);
        /* four hearts fanned toward you, the way a clover is drawn, the
           fourth (the lucky one) a touch brighter */
        var fan = [-1.15, -0.4, 0.4, 1.15];
        for (var i = 0; i < 4; i++) {
          put(HEART, chain(P, T(0, 0.47, 0.02), RZ(fan[i] + w * 0.5 + (fan[i] < 0 ? droop : -droop)), RX(0.35), S(0.6, 0.44, 0.6)),
              i === 3 ? mix3(c1, [1, 1, 0.7], 0.25) : mix3(c1, c2, i % 2 ? 0.2 : 0.5), 0.15);
        }
        break;
      }
      case "fronds": {
        for (var f = 0; f < 5; f++) {
          var af = (f - 2) * 0.42;
          put(LEAF, chain(P, T(0, 0.52, 0), RZ(af + w * (f % 2 ? 1 : -1)), RX(-0.25 + droop), S(0.55, 0.62, 1)), f % 2 ? c2 : c1, 0.1);
        }
        break;
      }
      case "leaves": {
        put(LEAF, chain(P, T(0.05, 0.62, 0), RZ(-0.9 + w), S(0.5, 0.55, 1)), c2, 0.1);
        put(LEAF, chain(P, T(-0.05, 0.62, 0), RZ(0.7 - w), S(0.45, 0.48, 1)), c2, 0.1);
        /* the segments: rings round the stem */
        put(RING, chain(P, T(0, -0.12, 0), S(0.275, 0.4, 0.275)), mix3(c1, [0.2, 0.3, 0.1], 0.35), 0.1);
        put(RING, chain(P, T(0, 0.30, 0), S(0.275, 0.4, 0.275)), mix3(c1, [0.2, 0.3, 0.1], 0.35), 0.1);
        if (L.band) {
          put(CYL, chain(P, T(0, 0.38, 0), S(0.285, 0.07, 0.285)), hex3(L.band), 0.1);
          put(LEAF, chain(P, T(-0.27, 0.42, -0.05), RY(-1.4), RZ(1.9 + w), S(0.25, 0.3, 1)), hex3(L.band), 0.1);
        }
        break;
      }
      case "flower": {
        for (var p = 0; p < 5; p++) {
          var ap = p / 5 * Math.PI * 2;
          put(SPH, chain(P, T(Math.cos(ap) * 0.09, 0.68, Math.sin(ap) * 0.09), S(0.08, 0.04, 0.08)), hex3("#ff7aa8"), 0.2);
        }
        put(SPH, chain(P, T(0, 0.70, 0), S(0.05)), hex3("#ffd54a"), 0.3);
        /* arms, one up and one down, as a cactus's are */
        put(SPH, chain(P, T(0.33, 0.0, 0), S(0.12, 0.12, 0.12)), c1, 0.1);
        put(CYL, chain(P, T(0.40, 0.0, 0), S(0.10, 0.28, 0.10)), c1, 0.1);
        put(SPH, chain(P, T(0.40, 0.28, 0), S(0.10)), c1, 0.1);
        put(SPH, chain(P, T(-0.33, -0.1, 0), S(0.11)), c1, 0.1);
        put(CYL, chain(P, T(-0.39, -0.1, 0), RZ(Math.PI), S(0.09, 0.18, 0.09)), c1, 0.1);
        put(SPH, chain(P, T(-0.39, -0.28, 0), S(0.09)), c1, 0.1);
        /* a few spines, pale against the green */
        for (var sp = 0; sp < 8; sp++) {
          var sa = sp / 8 * Math.PI * 2 + 0.3, sy = -0.3 + (sp % 3) * 0.28;
          if (Math.cos(sa) > 0.7 && sy > 0) continue;   /* not across the face */
          put(CONE, chain(P, T(Math.cos(sa) * 0.31, sy, Math.sin(sa) * 0.31), RY(-sa), RZ(-Math.PI / 2), S(0.012, 0.06, 0.012)), hex3("#f3ecd6"), 0);
        }
        break;
      }
      case "tip": {
        put(CONE, chain(P, T(0, -0.02, 0), S(0.36, 0.36, 0.36)), c1, 0.08);
        put(CONE, chain(P, T(0, 0.22, 0), S(0.27, 0.32, 0.27)), c1, 0.08);
        put(CONE, chain(P, T(0, 0.44, 0), S(0.17, 0.26, 0.17)), c2, 0.08);
        break;
      }
      case "crown": {
        var green = c2, g2 = mix3(c2, [1, 1, 0.6], 0.15);
        var lumps = [[0, 0.62, 0, 0.36], [-0.3, 0.48, 0.05, 0.26], [0.3, 0.5, 0.05, 0.27], [-0.16, 0.74, 0.08, 0.24],
                     [0.18, 0.76, 0.06, 0.25], [0, 0.48, 0.22, 0.24], [0, 0.82, -0.08, 0.22]];
        for (var k = 0; k < lumps.length; k++) {
          var q = lumps[k];
          put(SPH, chain(P, T(q[0] + w * 0.15, q[1] - droop * 0.1, q[2]), S(q[3])), k % 2 ? g2 : green, 0.05);
        }
        break;
      }
      default: break;
    }
  }
  function face(L, P, body, t, ma) {
    var m = st.mood, e = L.eyes || { gap: 0.2, size: 1 };
    var fy = body.fy, fr = body.fr, gap = e.gap, er = 0.085 * (e.size || 1);
    if (m === "surprised") er *= 1 + 0.18 * ma;
    /* blink: a hundred and twenty milliseconds, every few seconds */
    var bl = st.blinkAt && t * 1000 - st.blinkAt < 130 ? 0.12 : 1;
    if (m === "sad" || m === "lose") bl = Math.min(bl, 1 - 0.45 * ma);
    if (m === "happy" || m === "win") bl = Math.min(bl, 1 - 0.25 * ma);
    var lx = st.lx, ly = st.ly;
    if (m === "think") { lx = -0.5; ly = 0.7; }
    var white = [0.98, 0.97, 0.95], dark = [0.1, 0.08, 0.07];
    for (var s = -1; s <= 1; s += 2) {
      var ex = s * gap, ez = Math.sqrt(Math.max(0, fr * fr - ex * ex)) - 0.01;
      var E = chain(P, T(ex, fy + 0.08, ez), RY(Math.atan2(ex, ez)));
      put(SPH, chain(E, S(er, er * 1.12 * bl, er * 0.55)), white, 0.9);
      if (bl > 0.3) {
        put(SPH, chain(E, T(lx * er * 0.32, ly * er * 0.3, er * 0.42), S(er * 0.55, er * 0.62 * bl, er * 0.3)), dark, 0.9);
        put(SPH, chain(E, T(lx * er * 0.32 - er * 0.18, ly * er * 0.3 + er * 0.26, er * 0.62), S(er * 0.16)), [1, 1, 1], 0, 1, 1);
      }
      if (L.brow) {
        var bz = ez + 0.02;
        put(SPH, chain(P, T(ex, fy + 0.08 + er * 1.25, bz), RZ(s * (m === "sad" || m === "lose" ? -0.35 : 0.35)), S(er * 1.1, er * 0.22, er * 0.3)), dark, 0);
      }
      if (L.specs) {
        put(RING, chain(E, T(0, 0, er * 0.35), RX(Math.PI / 2), S(er * 1.45)), [0.78, 0.66, 0.38], 1.0);
      }
      if (L.blush > 0) {
        var cx = s * (gap + er * 0.9), cz = Math.sqrt(Math.max(0, fr * fr - cx * cx)) + 0.005;
        put(SPH, chain(P, T(cx, fy - 0.04, cz), RY(Math.atan2(cx, cz)), S(er * 0.8, er * 0.45, er * 0.12)), [1, 0.45, 0.5], 0, L.blush * 0.55, 0.3);
      }
    }
    if (L.specs) put(CYL, chain(P, T(0, fy + 0.09, fr + 0.02), RZ(Math.PI / 2), S(0.012, gap * 0.6, 0.012), T(0, -0.5, 0)), [0.78, 0.66, 0.38], 1.0);
    /* the mouth: a little arc of dark beads, smiling or not, or an open
       oval while it talks or is surprised */
    var my = fy - 0.11, open = 0;
    if (st.talkUntil && t * 1000 < st.talkUntil) open = Math.max(0, Math.sin(t * Math.PI * st.talkRate)) * 0.8 + 0.2;
    if (m === "surprised") open = Math.max(open, 0.9 * ma);
    if (m === "think") open = Math.max(open, 0.25);
    var curve = (m === "happy" || m === "win") ? 0.05 : (m === "sad" || m === "lose") ? -0.045 : 0.025;
    var mz = Math.sqrt(Math.max(0, fr * fr - 0.01)) + 0.005;
    if (open > 0.15) {
      put(SPH, chain(P, T(0, my - 0.005, mz - 0.01), S(0.055 + (m === "think" ? -0.02 : 0), 0.025 + 0.045 * open, 0.03)), [0.35, 0.08, 0.1], 0);
    } else {
      for (var b = -3; b <= 3; b++) {
        var bx = b * 0.022, by = my + curve * (bx * bx) / (0.066 * 0.066) - curve;
        var bz2 = Math.sqrt(Math.max(0, fr * fr - bx * bx)) + 0.003;
        put(SPH, chain(P, T(bx, by, bz2), S(0.013)), dark, 0);
      }
    }
  }

  /* how far into its mood the face is: up quickly, then easing out */
  function moodAmount(t) {
    if (st.mood === "idle") return 0;
    var e = t * 1000 - st.moodAt;
    if (!st.moodMs) return Math.min(1, e / 200);
    if (e > st.moodMs) return 0;
    var up = Math.min(1, e / 180), down = Math.min(1, (st.moodMs - e) / 400);
    return Math.min(up, down);
  }

  /* ---------- drawing ---------- */
  var dpr = 1;
  A.resize = function () {
    if (opts.fixed) { A.dirty = true; return; }     /* a canvas that is not on the page keeps the size it was given */
    dpr = Math.min(2, root.devicePixelRatio || 1);
    var w = canvas.clientWidth || 64, h = canvas.clientHeight || 64;
    canvas.width = Math.max(2, Math.round(w * dpr)); canvas.height = Math.max(2, Math.round(h * dpr));
    A.dirty = true;
  };
  A.dirty = true;
  function now() { return (root.performance ? performance.now() : Date.now()); }
  function draw(t) {
    build(t);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(prog);
    var eye = [0, 0.34, 4.1];
    var VP = mul(persp(0.6, canvas.width / canvas.height, 0.5, 12), look(eye, [0, 0.02, 0], [0, 1, 0]));
    gl.uniformMatrix4fv(U.uVP, false, VP);
    gl.uniform3fv(U.uEye, eye);
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aNrm);
    for (var pass = 0; pass < 2; pass++) {
      if (pass === 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      for (var i = 0; i < draws.length; i++) {
        var d = draws[i];
        if ((d.alpha < 1) !== (pass === 1)) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, d.mesh.vb);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 24, 12);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, d.mesh.ib);
        gl.uniformMatrix4fv(U.uM, false, d.M);
        gl.uniformMatrix3fv(U.uN, false, nrm3(d.M));
        gl.uniform3fv(U.uCol, d.col);
        gl.uniform1f(U.uShine, d.shine);
        gl.uniform1f(U.uGlow, d.glow);
        gl.uniform1f(U.uAlpha, d.alpha);
        gl.drawElements(gl.TRIANGLES, d.mesh.n, gl.UNSIGNED_SHORT, 0);
      }
    }
    gl.disable(gl.BLEND); gl.depthMask(true);
    A.drawn = (A.drawn || 0) + 1;
  }
  /* one frame: true while there is still something moving */
  A.frame = function () {
    var ms = now(), t = (ms - st.t0) / 1000;
    if (!opts.fixed && canvas.clientWidth && Math.abs(canvas.clientWidth * dpr - canvas.width) > 1) A.resize();
    /* the eyes follow where they were told to look, a little behind */
    var k = REDUCED ? 1 : 0.18;
    st.lx += (st.gx - st.lx) * k; st.ly += (st.gy - st.ly) * k;
    var el = ms - st.t0;
    var moving = ms < st.awakeUntil || el < st.talkUntil ||
                 (st.mood !== "idle" && (!st.moodMs || el - st.moodAt < st.moodMs + 450)) ||
                 Math.abs(st.gx - st.lx) + Math.abs(st.gy - st.ly) > 0.01 ||
                 (st.blinkAt && el - st.blinkAt < 160);
    if (A.dirty || moving) draw(t);
    A.dirty = false;
    if (st.mood !== "idle" && st.moodMs && el - st.moodAt > st.moodMs + 450) { st.mood = "idle"; A.dirty = true; }
    return moving && !REDUCED;
  };
  function loop() {
    st.raf = 0;
    if (A.dead) return;
    var more = A.frame();
    if (more) st.raf = root.requestAnimationFrame(loop);
  }
  function kick() { if (!st.raf && !A.dead && root.requestAnimationFrame) st.raf = root.requestAnimationFrame(loop); }
  function scheduleBlink() {
    clearTimeout(st.timer);
    if (A.dead) return;
    st.timer = setTimeout(function () {
      if (A.dead) return;
      if (!root.document || !root.document.hidden) { st.blinkAt = now() - st.t0; A.dirty = true; kick(); }
      scheduleBlink();
    }, 2600 + Math.random() * 3400);
  }

  /* ---------- what the room tells it ---------- */
  /* who it is: an id from cast.js, or a look of its own */
  A.set = function (id, look2) {
    A.id = id;
    A.look = look2 || (root.Cast && root.Cast.get(id) ? root.Cast.get(id).look : null);
    A.dirty = true; kick();
  };
  /* a mood for a while (ms; 0 holds it until the next one) */
  A.mood = function (kind, ms) {
    st.mood = kind || "idle"; st.moodAt = now() - st.t0; st.moodMs = ms == null ? 1400 : ms;
    A.dirty = true;
    kick();
  };
  /* its mouth moves for ms, at `rate` syllables a second */
  A.talk = function (ms, rate) {
    st.talkUntil = now() - st.t0 + (ms || 1200); st.talkRate = rate || 10;
    st.awakeUntil = Math.max(st.awakeUntil, now() + (ms || 1200) + 200);
    kick();
  };
  /* where its eyes go: x and y in -1..1, as it sees the board */
  A.lookAt = function (x, y) {
    st.gx = Math.max(-1, Math.min(1, x || 0)); st.gy = Math.max(-1, Math.min(1, y || 0));
    kick();
  };
  /* stay lively for a while (breathing, swaying) */
  A.wake = function (ms) { st.awakeUntil = Math.max(st.awakeUntil, now() + (ms || 2500)); kick(); };
  /* and settle: whatever wake asked for is over (a mood or a line still runs out) */
  A.sleep = function () { st.awakeUntil = 0; A.dirty = true; kick(); };
  A.state = function () {
    return { id: A.id, mood: st.mood, talking: now() - st.t0 < st.talkUntil, drawn: A.drawn || 0,
             sleeping: !st.raf, look: [st.gx, st.gy] };
  };
  A.destroy = function () {
    A.dead = true; clearTimeout(st.timer);
    if (st.raf && root.cancelAnimationFrame) root.cancelAnimationFrame(st.raf);
    meshes.forEach(function (m) { gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); });
  };

  st.t0 = now();
  A.resize();
  if (opts.id) A.set(opts.id);
  scheduleBlink();
  kick();
  return A;
}

/* A still of each face, for places that show several at once (the
   lobby's ladder): one renderer, off the page, drawing each in turn and
   handing back a picture. Eight live faces would be eight WebGL
   contexts, which is more than a phone will give a page. */
var stills = {}, stillR = null;
function portrait(id, px) {
  px = px || 128;
  var key = id + "@" + px;
  if (stills[key]) return stills[key];
  if (typeof document === "undefined") return null;
  try {
    if (!stillR || stillR.px !== px) {
      if (stillR) stillR.destroy();
      var c = document.createElement("canvas");
      c.width = px; c.height = Math.round(px * 1.1);
      stillR = create(c, { fixed: true });
      if (!stillR) return null;
      stillR.px = px;
      stillR.sleep();
    }
    stillR.set(id);
    stillR.mood("happy", 0);
    stillR.frame();
    stills[key] = stillR.canvas.toDataURL("image/png");
    return stills[key];
  } catch (e) { return null; }
}

var Avatar = { create: create, portrait: portrait, BODIES: BODIES };
if (typeof module !== "undefined" && module.exports) module.exports = Avatar;
else root.Avatar = Avatar;
})(typeof self !== "undefined" ? self : this);
