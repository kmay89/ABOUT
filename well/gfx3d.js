/* gfx3d.js — the well in the round.

   Raw WebGL 2, no libraries, no build step, in the manner of the chess
   room: every mesh is carved here from arithmetic, every surface is lit
   by a few lines of physically based shading, and the picture is
   finished by a short post chain that is written out longhand because
   there is no engine to hide it in.

   ## What you are looking at

   A shaft of the world's own stone, ten cells wide and twenty-two deep,
   seen from in front and a little above. The camera sits where a camera
   pitched nine degrees down with an eighteen-degree lens would sit, but
   its picture plane is kept parallel to the face of the well — the
   rising front of an architect's view camera. That one choice is why
   the playing face lands *exactly* on the rectangle the layout asked
   for, pixel for pixel, with no keystone: touch, the DOM labels and the
   Keep niche all line up with what is drawn. Depth still reads, because
   perspective still does its work on everything that is not on that
   plane: the tops of the stack, the floor, the inside of the walls.
   The idle "camera breath" moves the eye, not the plane, so the well
   breathes in parallax while the cells you are aiming at hold still.

   Each piece is one body. A cell is drawn from one of 47 meshes picked
   by which of its eight neighbours belong to the same piece: faces
   toward a same-piece neighbour do not exist, outer edges are rounded
   at 0.12 of a cell, and where an L turns its corner the inside of the
   bend is filleted by a small saddle patch, so the body has no seam, no
   notch and no pinhole anywhere. The SPEC asks for 16 variants by the
   four side neighbours; the other 31 exist only because the inside of
   a bend and the middle of an O look the same to a 4-bit mask and must
   not be drawn the same. After a clear the masks are simply recomputed,
   so a broken piece reads as smaller fused fragments.

   Shading is "studio jelly", driven by uniforms so that a skin is a set
   of numbers rather than a program: GGX highlights from a softbox, a
   procedural studio to reflect, a Fresnel rim, a subsurface tint, a
   speckle for stone and a fibre for paper, refraction of the well's own
   back wall through Sea Glass on the Full tier, and for Ink no lighting
   at all — flat fills, a two-pixel light outline on each piece's outer
   edge, and strong glyphs.

   ## The pipeline (05 §9.1, brief §7.6)

     1. the world's sky (sky.js) at a quarter of the pixels, 30 Hz
     2. the scene into a half-float target with a depth buffer: sky,
        the well's stone, the stack, light effects, then the things the
        player must always be able to read
     3. a Karis-averaged bright pass into half resolution, particles
        drawn additively into that same level, and a five-mip
        down/up bloom (Call of Duty 2014's filters)
     4. one composite: bloom, Khronos PBR Neutral, the skin's lift /
        gamma / gain, vignette, a static grain, a five-tap edge AA, and
        Display P3 where the screen has it

   The scene target's alpha channel is not transparency. It is a mask
   of the four things that must never be dimmed or washed — the active
   piece, the landing light, the previews and the Keep niche — and the
   composite keeps bloom, particles, vignette and the danger tint off
   every pixel it marks. Readability is a property of the pipeline, not
   a promise in a comment.

   The Simple tier keeps the same passes minus bloom, at a smaller
   budget, holding its scene in 8-bit sRGB at half value (half the
   bandwidth of a float target, still with room above white) instead of
   drawing straight to the screen: the stack needs a depth buffer to
   look right, and the default framebuffer has none by design.

   Cleared rows do not shatter. Each cell warms toward white and thins
   away in soft clumps, the side the clear came from first, drawn
   blended over the stone while the world's particles lift off it — a
   row of light going out, never a breaking one.

   ## Calm, by construction (brief §8.4)

   Every luminance pulse asks the flash governor first: at most two
   pulses of ΔL ≥ 0.08 in any rolling second, each at least 400 ms rise
   to fall; anything over budget is turned down to a change that is too
   small to be a flash. Effects never add up — the strongest one wins and
   is held a fifth longer. Hit-stop freezes pictures, never the game.
   The kick is a single directional nudge with a spring home, scaled by
   the well-nudge setting and zero under reduced motion or in Steady;
   there is no random shake anywhere. Danger cools and greys the edges
   and never turns red or pulses.

   ## Cheap enough for a phone in Low Power Mode

   Nothing is allocated per frame: instances, sprites and particles live
   in typed arrays sized once; per-frame uniforms go up in a single
   uniform buffer. Every program is compiled when the renderer is
   created and drawn once off screen, so Metal's pipeline states exist
   before the first piece falls. Quality steps itself down from frame
   cadence (Safari has no GPU timers): particles, then bloom, then the
   sky, then resolution, then the tier — and back up after twenty clean
   seconds. A steady 30 fps is recognised as Low Power Mode rather than
   overload and is reported, not fought. A lost context is rebuilt in
   full when the browser gives it back; three losses in a minute, or
   four seconds without it coming back, and the app is told to carry on
   in 2D. dispose() hands the context back to the browser, and a later
   create() on the same canvas asks for it again.

   For tools: opts.allowSoftware lets a software rasteriser through
   (the headless browser in tools/ has nothing else); without it a
   software GL is refused, as failIfMajorPerformanceCaveat intends.
   R.stats counts frames, draws, the flash governor's decisions and the
   cadence it has measured, and Gfx3D._geometry hands the mesh builders
   to a node check that proves every body is watertight.             */
(function (root) {
"use strict";

var Gfx3D = { kind: "3d" };

/* ================================================================
   the well, measured in cells
   ================================================================ */
var W = 10, VIS = 22, ROWS = 40;
var DRAW_ROWS = 26;            /* a piece may lock peeking above the face */
var RAD = 0.12;                /* outer edge radius of every body */
var DEPTH = 0.9;               /* how deep a cell is */
var SEG = 4;                   /* segments in a quarter round */
var BACK_Z = -1.05;            /* the back wall of the shaft */
var WALL_T = 0.5;              /* side walls, as seen from the front */
var FLOOR_T = 0.62;            /* the floor slab under row 0 */
var LIP = 0.5;                 /* the lip above the mouth */
var LIP_Y = VIS + LIP;
var PITCH = 9 * Math.PI / 180;
var FOV = 18 * Math.PI / 180;
var EYE_D = (LIP_Y * 0.5) / Math.tan(FOV * 0.5);   /* ≈ 71 cells */
var CX = W * 0.5, CY = LIP_Y * 0.5;

/* ================================================================
   tiers (brief §7.6, 05 §4.4) and the adaptive ladder
   ================================================================ */
var TIERS = {
  full:     { name: "full",     mp: 2.6, dpr: 2,   mips: 5, bloomDiv: 2, skyDiv: 2, live: true,
              particles: 1500, refract: true,  fxaa: true,  breath: true,  wobble: true },
  balanced: { name: "balanced", mp: 1.8, dpr: 2,   mips: 4, bloomDiv: 4, skyDiv: 3, live: true,
              particles: 600,  refract: false, fxaa: true,  breath: false, wobble: false },
  simple:   { name: "simple",   mp: 1.0, dpr: 1.5, mips: 0, bloomDiv: 0, skyDiv: 4, live: false,
              particles: 150,  refract: false, fxaa: false, breath: false, wobble: false }
};
var TIER_ORDER = ["full", "balanced", "simple"];
/* step 0 is the tier as designed; each step down gives up one thing, in
   the order 05 §4.3 gives: particles, a bloom mip, the sky's resolution,
   then the scene's. */
var STEP_MAX = 6;
var STEP_SCALE = [1, 1, 1, 1, 0.85, 0.7, 0.55];

/* ================================================================
   the juice ladder (brief §8.1, Medium preset). E is relative intensity
   on 0..5; n is particles; kick in CSS px; rot in degrees; hit in ms.
   ================================================================ */
var LADDER = {
  "Single":            { E: 2,    n: 24,  kick: 2, rot: 0,   hit: 0 },
  "Double":            { E: 2.5,  n: 40,  kick: 3, rot: 0,   hit: 0 },
  "Triple":            { E: 3,    n: 64,  kick: 4, rot: 0,   hit: 30 },
  "Quad":              { E: 4,    n: 120, kick: 5, rot: 0,   hit: 60 },
  "Twist":             { E: 2,    n: 16,  kick: 0, rot: 0,   hit: 30 },
  "Mini Twist":        { E: 1.5,  n: 8,   kick: 0, rot: 0,   hit: 30 },
  "Mini Twist Single": { E: 2.5,  n: 40,  kick: 2, rot: 0,   hit: 30 },
  "Mini Twist Double": { E: 3,    n: 64,  kick: 3, rot: 0,   hit: 40 },
  "Twist Single":      { E: 4,    n: 80,  kick: 3, rot: 0.6, hit: 50 },
  "Twist Double":      { E: 4.5,  n: 120, kick: 4, rot: 0.6, hit: 70 },
  "Twist Triple":      { E: 4.75, n: 150, kick: 5, rot: 0.6, hit: 80 }
};
var EMPTY_FX = { E: 5, n: 200, kick: 0, rot: 0, hit: 120 };
var PRESET = { calm: 0.5, medium: 1, vivid: 1.5 };

/* the world's stone, as a pattern the wall shader knows how to draw */
var WALL_PATTERN = {
  dawn: 0, tide: 1, rain: 2, bamboo: 3, aurora: 4,
  moonpool: 5, lanterns: 6, snowfall: 7, bells: 8, starfield: 9
};
var PARTICLE_KIND = {
  mote: 0, bubble: 1, drop: 2, leaf: 3, spark: 4,
  plankton: 5, flake: 6, snow: 7, petal: 8, star: 9
};

/* until the app says otherwise: Dawn, and Sea Glass */
var DEFAULT_WORLD = {
  id: "dawn", n: 1, name: "Dawn",
  sky: { top: "#141833", horizon: "#4A3552" }, key: "#FFE2C4", rim: "#9FB4FF", wall: "#8C7B6A",
  particle: { kind: "mote", color: "#F2C9A0", dir: 1, drift: 0.4, size: 0.5 }, motion: 1
};
var DEFAULT_SKIN = {
  id: "seaglass", name: "Sea Glass",
  colors: { I: "#F2C36B", O: "#4E6FD0", T: "#3FA58A", S: "#F09AB0", Z: "#7FD3EA", J: "#B5DB86", L: "#B9A3F0" },
  silt: "#5C6470",
  mat: { rough: 0.3, rim: 0.7, emissive: 0, refract: 0.02, sss: 0.35, speckle: 0, fibre: 0,
         unlit: false, outline: false, bloomCap: 1, grade: { lift: 0, gamma: 1, gain: 1 } },
  glyphs: "off"
};
/* what each skin is made of when skins.js leaves a number out */
var MAT_FALLBACK = {
  seaglass:   { rough: 0.3,  rim: 0.7, emissive: 0,   refract: 0.02, sss: 0.35, speckle: 0,   fibre: 0 },
  riverstone: { rough: 0.55, rim: 0.2, emissive: 0,   refract: 0,    sss: 0,    speckle: 0.7, fibre: 0 },
  jelly:      { rough: 0.35, rim: 0.6, emissive: 0,   refract: 0,    sss: 0.65, speckle: 0,   fibre: 0 },
  lantern:    { rough: 0.4,  rim: 0.3, emissive: 0.8, refract: 0,    sss: 0.3,  speckle: 0,   fibre: 0.7 },
  ink:        { rough: 0.5,  rim: 0,   emissive: 0,   refract: 0,    sss: 0,    speckle: 0,   fibre: 0, unlit: true, outline: true, bloomCap: 0.3 },
  moonlight:  { rough: 0.42, rim: 0.55, emissive: 0,  refract: 0,    sss: 0.2,  speckle: 0,   fibre: 0 }
};
var NAMES = "IOTSZJL";

/* north-facing cells of each piece (brief §3.3), relative to the SRS
   centre: the previews and the niche draw from these, never from a
   call that would allocate */
var SHAPE0 = [
  null,
  [[-1, 0], [0, 0], [1, 0], [2, 0]],     /* I */
  [[0, 0], [1, 0], [0, 1], [1, 1]],      /* O */
  [[-1, 0], [0, 0], [1, 0], [0, 1]],     /* T */
  [[-1, 0], [0, 0], [0, 1], [1, 1]],     /* S */
  [[-1, 1], [0, 1], [0, 0], [1, 0]],     /* Z */
  [[-1, 1], [-1, 0], [0, 0], [1, 0]],    /* J */
  [[1, 1], [-1, 0], [0, 0], [1, 0]]      /* L */
];

/* ================================================================
   small things
   ================================================================ */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function sat(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
function smooth(t) { t = sat(t); return t * t * (3 - 2 * t); }
function easeOut3(t) { t = sat(t); var u = 1 - t; return 1 - u * u * u; }
function easeInOut(t) { t = sat(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) * 0.5; }
function mixf(a, b, t) { return a + (b - a) * t; }
function srgbToLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
/* "#RRGGBB" into three linear floats. Only ever called when a skin or a
   world changes, never per frame. */
function hexLin(hex, out, o) {
  var s = (typeof hex === "string" && hex.charAt(0) === "#") ? hex : "#808080";
  if (s.length === 4) s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  var n = parseInt(s.slice(1, 7), 16);
  if (!(n >= 0)) n = 0x808080;
  out[o] = srgbToLin(((n >> 16) & 255) / 255);
  out[o + 1] = srgbToLin(((n >> 8) & 255) / 255);
  out[o + 2] = srgbToLin((n & 255) / 255);
  return out;
}
function lumOf(a, o) { return 0.2126 * a[o] + 0.7152 * a[o + 1] + 0.0722 * a[o + 2]; }
/* a piece type to 1..7, whether the engine hands us a number or a
   letter — read by char code so that nothing is allocated */
function tix(t) {
  if (typeof t === "number") return (t >= 0 && t <= 8) ? (t | 0) : 0;
  if (typeof t === "string" && t.length) {
    switch (t.charCodeAt(0)) {
      case 73: return 1; case 79: return 2; case 84: return 3; case 83: return 4;
      case 90: return 5; case 74: return 6; case 76: return 7; case 71: return 8;
    }
  }
  return 0;
}
function cellX(c) { return c ? (c.length !== undefined ? c[0] : c.x) : 0; }
function cellY(c) { return c ? (c.length !== undefined ? c[1] : c.y) : 0; }
/* a renderer may use Math.random, but a seeded stream makes a test
   screenshot the same screenshot twice */
var rngState = 0x2F6E2B1;
function rnd() {
  rngState = (rngState + 0x6D2B79F5) | 0;
  var t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function perfNow() {
  return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
}

/* ---------- column-major 4x4, written into arrays made once ---------- */
function mFrustum(o, l, r, b, t, n, f) {
  o[0] = 2 * n / (r - l); o[1] = 0; o[2] = 0; o[3] = 0;
  o[4] = 0; o[5] = 2 * n / (t - b); o[6] = 0; o[7] = 0;
  o[8] = (r + l) / (r - l); o[9] = (t + b) / (t - b); o[10] = -(f + n) / (f - n); o[11] = -1;
  o[12] = 0; o[13] = 0; o[14] = -2 * f * n / (f - n); o[15] = 0;
}
function mMul(o, a, b) {
  for (var c = 0; c < 4; c++) {
    var b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    o[c * 4]     = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
}

/* ================================================================
   geometry, carved once
   ================================================================

   One builder makes every rounded body in the room — a cell, a pillar
   of the well's frame, a bar of the Keep niche — because they are all
   the same shape: a box whose front is rounded wherever it meets the
   outside, flat and open wherever it meets a neighbour of its own kind.

   `key` says which neighbours are its own: bits 1 N, 2 E, 4 S, 8 W for
   the sides, and 16 NE, 32 SE, 64 SW, 128 NW for the diagonals, which
   only matter at a corner where both sides are its own. Such a corner
   with its diagonal missing is the inside of a bend: the front face is
   cut back by a quarter circle there and a saddle patch rolls the two
   neighbours' edge rounds into each other, so the bend is filleted
   rather than notched. The back of a body is never visible from in
   front and is not built. */
function newMesh() { return { pos: [], nrm: [], idx: [], kind: [] }; }
function mVert(m, x, y, z, nx, ny, nz) {
  var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  m.pos.push(x, y, z); m.nrm.push(nx / l, ny / l, nz / l);
  return m.pos.length / 3 - 1;
}
/* a triangle, turned to face the way its vertex normals say; slivers
   that collapse at a pole are dropped */
function mTri(m, a, b, c) {
  var p = m.pos, n = m.nrm;
  var ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
  var vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  var fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
  var area = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (area < 1e-9) return;
  var sx = n[a * 3] + n[b * 3] + n[c * 3], sy = n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1],
      sz = n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2];
  if (fx * sx + fy * sy + fz * sz < 0) m.idx.push(a, c, b); else m.idx.push(a, b, c);
}
/* a (nu+1) x (nv+1) patch from a function that writes position and
   normal for (u, v) in 0..1 */
var patchTmp = [0, 0, 0, 0, 0, 0];
function mPatch(m, nu, nv, fn) {
  var base = m.pos.length / 3, i, j;
  for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
    fn(i / nu, j / nv, patchTmp);
    mVert(m, patchTmp[0], patchTmp[1], patchTmp[2], patchTmp[3], patchTmp[4], patchTmp[5]);
  }
  for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
    var a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    mTri(m, a, b, d); mTri(m, a, d, c);
  }
}

/* the corners, in the order a counter-clockwise walk round the front
   face meets them: where the walk arrives from and leaves along */
var CORNERS = [
  { sx: 1,  sy: -1, a: [1, 0],  d: [0, 1],  sides: [4, 2], diag: 32 },   /* SE */
  { sx: 1,  sy: 1,  a: [0, 1],  d: [-1, 0], sides: [2, 1], diag: 16 },   /* NE */
  { sx: -1, sy: 1,  a: [-1, 0], d: [0, -1], sides: [1, 8], diag: 128 },  /* NW */
  { sx: -1, sy: -1, a: [0, -1], d: [1, 0],  sides: [8, 4], diag: 64 }    /* SW */
];

/* a bend's quarter circle goes the way round that passes through the
   inside of the cell, i.e. whose midpoint faces away from the corner */
function bendEnd(ta, sx, sy) {
  var a = ta + Math.PI / 4, b = ta - Math.PI / 4;
  var da = Math.cos(a) * -sx + Math.sin(a) * -sy, db = Math.cos(b) * -sx + Math.sin(b) * -sy;
  return da >= db ? ta + Math.PI / 2 : ta - Math.PI / 2;
}

function roundedBody(m, x0, x1, y0, y1, depth, r, key, seg) {
  var extN = !(key & 1), extE = !(key & 2), extS = !(key & 4), extW = !(key & 8);
  var ix0 = x0 + (extW ? r : 0), ix1 = x1 - (extE ? r : 0);
  var iy0 = y0 + (extS ? r : 0), iy1 = y1 - (extN ? r : 0);
  var zb = -depth, k, c;

  /* ---- the front face: a fan from the middle, notched at bends ---- */
  var ring = [];
  for (k = 0; k < 4; k++) {
    c = CORNERS[k];
    var s1 = c.sides[0], s2 = c.sides[1];
    var notch = (key & s1) && (key & s2) && !(key & c.diag);
    if (notch) {
      var Cx = c.sx > 0 ? x1 : x0, Cy = c.sy > 0 ? y1 : y0;
      var ax = Cx - c.a[0] * r, ay = Cy - c.a[1] * r;
      var ta = Math.atan2(ay - Cy, ax - Cx), td = bendEnd(ta, c.sx, c.sy);
      for (var q = 0; q <= seg; q++) {
        var th = ta + (td - ta) * q / seg;
        ring.push(Cx + Math.cos(th) * r, Cy + Math.sin(th) * r);
      }
    } else {
      ring.push(c.sx > 0 ? ix1 : ix0, c.sy > 0 ? iy1 : iy0);
    }
  }
  var mx = (x0 + x1) * 0.5, my = (y0 + y1) * 0.5;
  var ctr = mVert(m, mx, my, 0, 0, 0, 1), first = -1, prev = -1;
  for (k = 0; k < ring.length; k += 2) {
    var vi = mVert(m, ring[k], ring[k + 1], 0, 0, 0, 1);
    if (first < 0) first = vi; else mTri(m, ctr, prev, vi);
    prev = vi;
  }
  mTri(m, ctr, prev, first);

  /* ---- edge rounds along each outer side ---- */
  if (extN) mPatch(m, seg, 1, function (u, v, o) {
    var ph = u * Math.PI / 2, s = Math.sin(ph), cc = Math.cos(ph);
    o[0] = ix0 + (ix1 - ix0) * v; o[1] = iy1 + r * s; o[2] = -r + r * cc; o[3] = 0; o[4] = s; o[5] = cc;
  });
  if (extS) mPatch(m, seg, 1, function (u, v, o) {
    var ph = u * Math.PI / 2, s = Math.sin(ph), cc = Math.cos(ph);
    o[0] = ix0 + (ix1 - ix0) * v; o[1] = iy0 - r * s; o[2] = -r + r * cc; o[3] = 0; o[4] = -s; o[5] = cc;
  });
  if (extE) mPatch(m, seg, 1, function (u, v, o) {
    var ph = u * Math.PI / 2, s = Math.sin(ph), cc = Math.cos(ph);
    o[0] = ix1 + r * s; o[1] = iy0 + (iy1 - iy0) * v; o[2] = -r + r * cc; o[3] = s; o[4] = 0; o[5] = cc;
  });
  if (extW) mPatch(m, seg, 1, function (u, v, o) {
    var ph = u * Math.PI / 2, s = Math.sin(ph), cc = Math.cos(ph);
    o[0] = ix0 - r * s; o[1] = iy0 + (iy1 - iy0) * v; o[2] = -r + r * cc; o[3] = -s; o[4] = 0; o[5] = cc;
  });

  /* ---- the sides themselves, back to the open rear ---- */
  if (depth > r + 1e-4) {
    if (extN) mPatch(m, 1, 1, function (u, v, o) { o[0] = ix0 + (ix1 - ix0) * u; o[1] = y1; o[2] = -r + (zb + r) * v; o[3] = 0; o[4] = 1; o[5] = 0; });
    if (extS) mPatch(m, 1, 1, function (u, v, o) { o[0] = ix0 + (ix1 - ix0) * u; o[1] = y0; o[2] = -r + (zb + r) * v; o[3] = 0; o[4] = -1; o[5] = 0; });
    if (extE) mPatch(m, 1, 1, function (u, v, o) { o[0] = x1; o[1] = iy0 + (iy1 - iy0) * u; o[2] = -r + (zb + r) * v; o[3] = 1; o[4] = 0; o[5] = 0; });
    if (extW) mPatch(m, 1, 1, function (u, v, o) { o[0] = x0; o[1] = iy0 + (iy1 - iy0) * u; o[2] = -r + (zb + r) * v; o[3] = -1; o[4] = 0; o[5] = 0; });
  }

  /* ---- outer corners: a quarter round down the side, an eighth of a
     sphere at the front ---- */
  for (k = 0; k < 4; k++) {
    c = CORNERS[k];
    var e1 = !(key & c.sides[0]), e2 = !(key & c.sides[1]);
    if (!(e1 && e2)) continue;
    (function (sx, sy) {
      var px = sx > 0 ? ix1 : ix0, py = sy > 0 ? iy1 : iy0;
      if (depth > r + 1e-4) mPatch(m, seg, 1, function (u, v, o) {
        var al = u * Math.PI / 2, nx = sx * Math.cos(al), ny = sy * Math.sin(al);
        o[0] = px + r * nx; o[1] = py + r * ny; o[2] = -r + (zb + r) * v; o[3] = nx; o[4] = ny; o[5] = 0;
      });
      mPatch(m, seg, seg, function (u, v, o) {
        var al = u * Math.PI / 2, ph = v * Math.PI / 2, sp = Math.sin(ph);
        var nx = sx * sp * Math.cos(al), ny = sy * sp * Math.sin(al), nz = Math.cos(ph);
        o[0] = px + r * nx; o[1] = py + r * ny; o[2] = -r + r * nz; o[3] = nx; o[4] = ny; o[5] = nz;
      });
    })(c.sx, c.sy);
  }

  /* ---- inside of a bend: the saddle that joins two edge rounds ---- */
  for (k = 0; k < 4; k++) {
    c = CORNERS[k];
    if (!((key & c.sides[0]) && (key & c.sides[1]) && !(key & c.diag))) continue;
    (function (cc) {
      var Cx = cc.sx > 0 ? x1 : x0, Cy = cc.sy > 0 ? y1 : y0;
      var ax = Cx - cc.a[0] * r, ay = Cy - cc.a[1] * r;
      var ta = Math.atan2(ay - Cy, ax - Cx), td = bendEnd(ta, cc.sx, cc.sy);
      mPatch(m, seg, seg, function (u, v, o) {
        var th = ta + (td - ta) * u, ux = -Math.cos(th), uy = -Math.sin(th);
        var ph = v * Math.PI / 2, sp = Math.sin(ph), cp = Math.cos(ph);
        var nx = ux * sp, ny = uy * sp, nz = cp;
        o[0] = Cx + r * Math.cos(th) + r * nx; o[1] = Cy + r * Math.sin(th) + r * ny;
        o[2] = -r + r * nz; o[3] = nx; o[4] = ny; o[5] = nz;
      });
    })(c);
  }
}

/* The 47 distinct cells. A diagonal bit only counts at a corner whose
   two sides are both the piece's own; everything else folds onto the
   same mesh. VARIANT_OF[key8] -> index, VARIANT_KEY[index] -> key. */
var VARIANT_OF = new Int16Array(256), VARIANT_KEY = [];
(function () {
  var seen = {};
  for (var key = 0; key < 256; key++) {
    var k = key & 15;
    if ((key & 1) && (key & 2) && (key & 16)) k |= 16;
    if ((key & 2) && (key & 4) && (key & 32)) k |= 32;
    if ((key & 4) && (key & 8) && (key & 64)) k |= 64;
    if ((key & 8) && (key & 1) && (key & 128)) k |= 128;
    if (seen[k] === undefined) { seen[k] = VARIANT_KEY.length; VARIANT_KEY.push(k); }
    VARIANT_OF[key] = seen[k];
  }
})();
var NVAR = VARIANT_KEY.length;   /* 47 */

/* the bends a variant has, for the outline shader */
function notchBits(k) {
  var b = 0;
  if ((k & 1) && (k & 2) && !(k & 16)) b |= 1;
  if ((k & 2) && (k & 4) && !(k & 32)) b |= 2;
  if ((k & 4) && (k & 8) && !(k & 64)) b |= 4;
  if ((k & 8) && (k & 1) && !(k & 128)) b |= 8;
  return b;
}

function buildCells() {
  var m = newMesh(), table = [];
  for (var v = 0; v < NVAR; v++) {
    var start = m.idx.length;
    roundedBody(m, -0.5, 0.5, -0.5, 0.5, DEPTH, RAD, VARIANT_KEY[v], SEG);
    table.push({ first: start, count: m.idx.length - start,
                 sides: (~VARIANT_KEY[v]) & 15, notch: notchBits(VARIANT_KEY[v]) });
  }
  return { mesh: m, table: table };
}

/* the well's own stone: a U-shaped frame of five bodies whose inner
   faces are the walls and floor of the shaft, and a back wall */
function addBody(m, kind, x0, x1, y0, y1, depth, r, key) {
  var before = m.pos.length / 3;
  roundedBody(m, x0, x1, y0, y1, depth, r, key, SEG);
  for (var i = before; i < m.pos.length / 3; i++) m.kind.push(kind);
}
function addQuad(m, kind, ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz) {
  /* a, a+b, a+c, a+b+c */
  var i0 = mVert(m, ax, ay, az, nx, ny, nz), i1 = mVert(m, ax + bx, ay + by, az + bz, nx, ny, nz);
  var i2 = mVert(m, ax + cx, ay + cy, az + cz, nx, ny, nz), i3 = mVert(m, ax + bx + cx, ay + by + cy, az + bz + cz, nx, ny, nz);
  m.kind.push(kind, kind, kind, kind);
  mTri(m, i0, i1, i3); mTri(m, i0, i3, i2);
}
function buildShell() {
  var m = newMesh(), d = -BACK_Z, r = RAD;
  addBody(m, 1, -WALL_T, 0, 0, LIP_Y, d, r, 4);                    /* left pillar */
  addBody(m, 1, W, W + WALL_T, 0, LIP_Y, d, r, 4);                 /* right pillar */
  addBody(m, 1, -WALL_T, 0, -FLOOR_T, 0, d, r, 1 | 2);             /* bottom-left */
  addBody(m, 1, 0, W, -FLOOR_T, 0, d, r, 2 | 8);                   /* floor */
  addBody(m, 1, W, W + WALL_T, -FLOOR_T, 0, d, r, 1 | 8);          /* bottom-right */
  addQuad(m, 0, 0, 0, BACK_Z, W, 0, 0, 0, LIP_Y, 0, 0, 0, 1);      /* back wall */
  return m;
}
/* The Keep niche, carved to whatever rectangle the layout gives it: a
   ring of eight bodies round an opening, and a back panel set in. The
   faces that look into the opening are marked as the inside (kind 3)
   so they are lit as a recess and can glow at the lip. */
function buildNiche(ox0, ox1, oy0, oy1, t, depth) {
  var m = newMesh(), r = Math.min(RAD, t * 0.45);
  var ix0 = ox0 + t, ix1 = ox1 - t, iy0 = oy0 + t, iy1 = oy1 - t;
  addBody(m, 2, ox0, ix0, iy1, oy1, depth, r, 2 | 4);   /* top-left */
  addBody(m, 2, ix0, ix1, iy1, oy1, depth, r, 2 | 8);   /* top */
  addBody(m, 2, ix1, ox1, iy1, oy1, depth, r, 4 | 8);   /* top-right */
  addBody(m, 2, ix1, ox1, iy0, iy1, depth, r, 1 | 4);   /* right */
  addBody(m, 2, ix1, ox1, oy0, iy0, depth, r, 1 | 8);   /* bottom-right */
  addBody(m, 2, ix0, ix1, oy0, iy0, depth, r, 2 | 8);   /* bottom */
  addBody(m, 2, ox0, ix0, oy0, iy0, depth, r, 1 | 2);   /* bottom-left */
  addBody(m, 2, ox0, ix0, iy0, iy1, depth, r, 1 | 4);   /* left */
  var cx = (ix0 + ix1) * 0.5, cy = (iy0 + iy1) * 0.5;
  for (var i = 0; i < m.kind.length; i++) {
    var px = m.pos[i * 3], py = m.pos[i * 3 + 1];
    var nx = m.nrm[i * 3], ny = m.nrm[i * 3 + 1], nz = m.nrm[i * 3 + 2];
    var inward = nx * (cx - px) + ny * (cy - py);
    if (inward > 0 && nz < 0.75 && px > ix0 - 1e-3 && px < ix1 + 1e-3 && py > iy0 - 1e-3 && py < iy1 + 1e-3) m.kind[i] = 3;
  }
  addQuad(m, 3, ix0, iy0, -depth, ix1 - ix0, 0, 0, 0, iy1 - iy0, 0, 0, 0, 1);
  return { mesh: m, ix0: ix0, ix1: ix1, iy0: iy0, iy1: iy1, depth: depth };
}
function packMesh(m, withKind) {
  var n = m.pos.length / 3, stride = withKind ? 7 : 6, out = new Float32Array(n * stride);
  for (var i = 0; i < n; i++) {
    out[i * stride] = m.pos[i * 3]; out[i * stride + 1] = m.pos[i * 3 + 1]; out[i * stride + 2] = m.pos[i * 3 + 2];
    out[i * stride + 3] = m.nrm[i * 3]; out[i * stride + 4] = m.nrm[i * 3 + 1]; out[i * stride + 5] = m.nrm[i * 3 + 2];
    if (withKind) out[i * stride + 6] = m.kind[i];
  }
  return out;
}

/* ================================================================
   shaders
   ================================================================

   Everything is lit in linear light and turned back into something a
   screen can show only in the composite. Per-frame values every
   program shares — the camera, the world's light, the skin's material,
   the palette, the effects the stone itself responds to — arrive in one
   uniform buffer, written once a frame. */
var GLSL_HEAD = "#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n";

var GLSL_FRAME = `
layout(std140) uniform Frame {
  mat4 uVP;        /* view-projection, kick included */
  vec4 uEye;       /* xyz eye, w seconds */
  vec4 uKey;       /* xyz key light direction, w device px per cell */
  vec4 uKeyCol;    /* key light, w danger 0..1 */
  vec4 uRimCol;    /* rim light, w motion 0..1 */
  vec4 uEnvTop;    /* studio above, w scene encode scale */
  vec4 uEnvLow;    /* studio below, w effect seconds */
  vec4 uWall;      /* the world's stone, w grid amount */
  vec4 uWallP;     /* pattern A, pattern B, mix, landing strength */
  vec4 uMat0;      /* rough, rim, emissive, refract */
  vec4 uMat1;      /* subsurface, speckle, fibre, unlit */
  vec4 uMat2;      /* outline, glyph amount, mono, gloss */
  vec4 uFx0;       /* empty-well breath, breath ring, unbroken, end light */
  vec4 uFx1;       /* the skin's edge light, spare, spare, spare */
  vec4 uRing[4];   /* ripple rings: x, y, age, amplitude */
  vec4 uPal[12];   /* 0 warm white, 1..7 pieces, 8 silt, 9 glyph ink, 10 outline, 11 moon glyph */
};
`;

var GLSL_COMMON = `
#define PI 3.14159265
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float bitOf(float v, float b){ return mod(floor(v / b + 0.001), 2.0); }
`;

/* Filament's BRDF and the mobile environment-BRDF fit three.js uses
   (05 §9.3), and a studio made of arithmetic: a key softbox above and
   to the left, a broad fill behind the camera so the fronts of the
   bodies have a soft sheen to show, and two cards at the sides for the
   rounded edges to catch. The studio takes its colours from the world,
   so a piece in Lanterns is lit warm and in Moon Pool cool, while the
   piece's own colour stays the piece's. */
var GLSL_BRDF = `
float D_GGX(float NoH, float a){ float a2 = a * a; float f = (NoH * a2 - NoH) * NoH + 1.0; return a2 / (PI * f * f + 1e-7); }
float V_SmithFast(float NoV, float NoL, float a){ float gv = NoL * (NoV * (1.0 - a) + a); float gl = NoV * (NoL * (1.0 - a) + a); return 0.5 / (gv + gl + 1e-5); }
vec3 F_Schlick(vec3 f0, float u){ return f0 + (1.0 - f0) * pow(1.0 - u, 5.0); }
vec2 DFG(float NoV, float rough){
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  return vec2(-1.04, 1.04) * a004 + r.zw;
}
vec3 studioEnv(vec3 r, float rough){
  /* a dark room with a few bright, sized lights in it: rounded edges
     find them, flat faces mostly do not, which is what makes a glossy
     object read as glossy */
  vec3 c = mix(uEnvLow.rgb, uEnvTop.rgb, smoothstep(-0.3, 0.7, r.y));
  float soft = 1.0 + rough * 6.0;
  float key = pow(max(dot(r, normalize(vec3(-0.36, 0.84, 0.40))), 0.0), 34.0 / soft);
  c += uKeyCol.rgb * key * 4.2 / sqrt(soft);
  float strip = pow(max(dot(r, normalize(vec3(0.05, 0.42, 0.91))), 0.0), 9.0 / soft);
  c += uKeyCol.rgb * strip * 0.32;
  float rimR = pow(max(dot(r, normalize(vec3(0.94, 0.26, -0.2))), 0.0), 22.0 / soft);
  float rimL = pow(max(dot(r, normalize(vec3(-0.96, 0.18, -0.16))), 0.0), 22.0 / soft);
  c += uRimCol.rgb * (rimR * 2.4 + rimL * 1.1) / sqrt(soft);
  return c;
}
`;

/* The stone. Ten worlds, ten patterns, each a few octaves of value
   noise bent into strata, moss, a lattice of stalks, ice, wet basalt
   columns, lacquered grain, frost, granite or obsidian. All of them
   are quiet: the stone is the stage, never the show. Returns a colour
   multiplier and a gloss. Cracks are deliberately absent — cracking
   glass is on the brief's list of things that never appear. */
var GLSL_STONE = `
uniform sampler2D uOcc;
vec4 stonePattern(float id, vec2 p){
  if (id < 0.5) {            /* dawn: pale sandstone strata */
    float b = fbm(vec2(p.x * 0.28, p.y * 1.9));
    float g = vnoise(p * 13.0);
    return vec4(vec3(0.82 + 0.32 * b + 0.06 * g) * vec3(1.02, 1.0, 0.97), 0.08);
  } else if (id < 1.5) {     /* tide: sea-glass stone, softly mottled */
    float b = fbm(p * 0.8 + vec2(3.1, 1.2));
    return vec4(vec3(0.84 + 0.26 * b + 0.05 * vnoise(p * 9.0)), 0.22);
  } else if (id < 2.5) {     /* rain on leaves: mossy stone */
    float b = fbm(p * 0.9);
    float moss = smoothstep(0.52, 0.72, fbm(p * 0.55 + vec2(7.0, 2.0)));
    vec3 c = vec3(0.86 + 0.24 * b) * mix(vec3(1.0), vec3(0.78, 1.16, 0.72), moss);
    return vec4(c, 0.12 + 0.18 * moss);
  } else if (id < 3.5) {     /* bamboo: a lattice of stalks with nodes */
    float sx = fract(p.x / 1.25 + 0.5);
    float stalk = smoothstep(0.0, 0.12, sx) * smoothstep(1.0, 0.88, sx);
    float node = 1.0 - 0.35 * exp(-pow((fract(p.y / 3.3 + 0.37 * floor(p.x / 1.25)) - 0.5) * 9.0, 2.0));
    float g = vnoise(vec2(p.x * 3.0, p.y * 0.4));
    return vec4(vec3((0.70 + 0.34 * stalk + 0.08 * g) * node), 0.18);
  } else if (id < 4.5) {     /* aurora: ice glass, long soft streaks */
    float s = fbm(vec2(p.x * 0.35 + p.y * 0.22, p.y * 0.5));
    return vec4(vec3(0.88 + 0.2 * s) * vec3(0.96, 1.0, 1.06), 0.6);
  } else if (id < 5.5) {     /* moon pool: wet basalt columns */
    float col = hash12(vec2(floor(p.x / 0.85), 3.0));
    float facet = smoothstep(0.0, 0.08, fract(p.x / 0.85)) * smoothstep(1.0, 0.92, fract(p.x / 0.85));
    float b = fbm(p * vec2(0.6, 0.25));
    return vec4(vec3(0.72 + 0.22 * col + 0.14 * b) * (0.82 + 0.18 * facet), 0.55);
  } else if (id < 6.5) {     /* lanterns: lacquered wood */
    float w = fbm(vec2(p.x * 0.45, p.y * 2.6));
    float ring = 0.5 + 0.5 * sin((p.y * 2.2 + w * 3.0) * 3.1);
    return vec4(vec3(0.80 + 0.16 * ring + 0.1 * w), 0.5);
  } else if (id < 7.5) {     /* snowfall: frosted stone, a few fixed glints */
    float b = fbm(p * 1.1);
    float glint = step(0.992, hash12(floor(p * 26.0))) * 0.5;
    return vec4(vec3(0.9 + 0.14 * b + glint), 0.1);
  } else if (id < 8.5) {     /* mountain bells: granite */
    float b = fbm(p * 0.7);
    float h = hash12(floor(p * 22.0));
    float fleck = (h > 0.9 ? 0.25 : (h < 0.1 ? -0.2 : 0.0));
    return vec4(vec3(0.86 + 0.16 * b + fleck), 0.2);
  }
  /* starfield: obsidian */
  float b = fbm(p * 0.45);
  return vec4(vec3(0.85 + 0.12 * b), 0.85);
}
vec4 stone(vec2 p){
  vec4 a = stonePattern(uWallP.x, p);
  if (uWallP.z <= 0.001) return a;
  return mix(a, stonePattern(uWallP.y, p), uWallP.z);
}
float occS(vec2 xy){ return texture(uOcc, vec2(xy.x * 0.1, xy.y * (1.0 / 24.0))).r; }
float occA(vec2 xy){ return texture(uOcc, vec2(xy.x * 0.1, xy.y * (1.0 / 24.0))).g; }
/* daylight falls in at the mouth and fades on the way down */
float mouth(float y){ float t = clamp((y + 1.0) / 23.5, 0.0, 1.0); return 0.05 + 0.95 * pow(t, 2.3); }
vec3 coolStone(vec3 c){ return mix(c, vec3(luma(c)) * vec3(0.84, 0.94, 1.12), uKeyCol.w * 0.45); }
/* the world's stone, quieted: most of its colour kept, a little of its
   saturation given up so the pieces own the colour in the room */
vec3 stoneAlbedo(vec3 pat){ vec3 w = mix(vec3(luma(uWall.rgb)), uWall.rgb, 0.62); return coolStone(w * pat); }
/* The back wall of the shaft at a point. The stack shades it: light
   from the mouth is blocked by whatever sits above, so a hole under an
   overhang is darker than open water, and every body leaves a soft
   contact shadow on the stone just behind it. */
vec3 backWallG(vec2 xy, out float gloss){
  vec4 st = stone(xy);
  gloss = st.a;
  vec3 alb = stoneAlbedo(st.rgb);
  float sh = occS(xy + vec2(0.0, 1.05)) * 0.30 + occS(xy + vec2(0.0, 2.3)) * 0.22 + occS(xy + vec2(0.0, 4.0)) * 0.14
           + occA(xy + vec2(0.0, 1.1)) * 0.22 + occA(xy + vec2(0.0, 2.6)) * 0.12;
  float ao = occS(xy) * 0.5 + (occS(xy + vec2(0.42, 0.0)) + occS(xy - vec2(0.42, 0.0)) + occS(xy + vec2(0.0, 0.42)) + occS(xy - vec2(0.0, 0.42))) * 0.11;
  float light = mouth(xy.y) * (1.0 - clamp(sh, 0.0, 0.72));
  float edge = smoothstep(-0.1, 1.6, xy.x) * smoothstep(-0.1, 1.6, 10.0 - xy.x) * smoothstep(-0.3, 1.4, xy.y);
  light *= mix(0.45, 1.0, edge);
  vec3 cool = uEnvLow.rgb * 1.6 + uEnvTop.rgb * 0.12;
  return alb * (uKeyCol.rgb * 0.095 * light + cool * (0.55 + 0.45 * edge)) * (1.0 - 0.6 * clamp(ao, 0.0, 1.0));
}
vec3 backWall(vec2 xy){ float g; return backWallG(xy, g); }
`;

/* ---------- the bodies: every cell of every piece ---------- */
var VS_BLOCK = GLSL_HEAD + GLSL_FRAME + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
layout(location = 2) in vec4 iA;   /* pivot xyz, turn about z */
layout(location = 3) in vec4 iB;   /* offset from pivot xy, squash xy */
layout(location = 4) in vec4 iC;   /* colour, glow, dissolve, flags */
layout(location = 5) in vec4 iD;   /* tilt x, tilt y, scale, seed */
out vec3 vLocal; out vec3 vLN; out vec3 vN; out vec3 vW;
flat out vec4 vC; flat out vec4 vD;
void main(){
  vLocal = aPos; vLN = aNrm;
  vec3 p = aPos; p.z += 0.45;
  p.xy = (p.xy + iB.xy) * iB.zw;
  vec3 n = aNrm;
  float c = cos(iA.w), s = sin(iA.w);
  p.xy = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  n.xy = vec2(c * n.x - s * n.y, s * n.x + c * n.y);
  float cx = cos(iD.x), sx = sin(iD.x);
  p.yz = vec2(cx * p.y - sx * p.z, sx * p.y + cx * p.z);
  n.yz = vec2(cx * n.y - sx * n.z, sx * n.y + cx * n.z);
  float cy = cos(iD.y), sy = sin(iD.y);
  p.xz = vec2(cy * p.x + sy * p.z, -sy * p.x + cy * p.z);
  n.xz = vec2(cy * n.x + sy * n.z, -sy * n.x + cy * n.z);
  p *= iD.z;
  p.z -= 0.45 * iD.z;
  vW = iA.xyz + p; vN = n; vC = iC; vD = iD;
  gl_Position = uVP * vec4(vW, 1.0);
}
`;

var FS_BLOCK = GLSL_HEAD + GLSL_FRAME + GLSL_COMMON + GLSL_BRDF + GLSL_STONE + `
uniform vec2 uVar;          /* outer sides of this variant, bends of this variant */
uniform float uFade;        /* 1 while drawing bodies that are fading into light */
in vec3 vLocal; in vec3 vLN; in vec3 vN; in vec3 vW;
flat in vec4 vC; flat in vec4 vD;
out vec4 outColor;

float segD(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float triD(vec2 p, float r){
  const float k = 1.7320508;
  p.y += 0.04;
  p.x = abs(p.x) - r; p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
/* the motifs of brief §7.4, drawn as distance fields so they stay crisp
   at any size: lines, a dot, a triangle, two diagonals, two brackets */
float glyph(int k, vec2 p, float w, float aa){
  float d;
  if (k == 1) d = max(min(abs(p.y - 0.12), abs(p.y + 0.12)) - w, abs(p.x) - 0.26);
  else if (k == 2) d = length(p) - 0.12;
  else if (k == 3) d = abs(triD(p, 0.2)) - w;
  else if (k == 4) d = segD(p, vec2(-0.21, -0.21), vec2(0.21, 0.21)) - w;
  else if (k == 5) d = segD(p, vec2(-0.21, 0.21), vec2(0.21, -0.21)) - w;
  else if (k == 6) d = min(segD(p, vec2(-0.18, 0.22), vec2(-0.18, -0.18)), segD(p, vec2(-0.18, -0.18), vec2(0.22, -0.18))) - w;
  else if (k == 7) d = min(segD(p, vec2(0.18, 0.22), vec2(0.18, -0.18)), segD(p, vec2(0.18, -0.18), vec2(-0.22, -0.18))) - w;
  else return 0.0;
  return 1.0 - smoothstep(-aa, aa, d);
}

/* distance, in cells, from this fragment to the piece's own outer
   silhouette: only the sides and bends that face outside count, so the
   measure runs on unbroken across the cells of one body */
float edgeDist(){
  float d = 1.0, sides = uVar.x, bends = uVar.y;
  if (bitOf(sides, 1.0) > 0.5) d = min(d, 0.5 - vLocal.y);
  if (bitOf(sides, 2.0) > 0.5) d = min(d, 0.5 - vLocal.x);
  if (bitOf(sides, 4.0) > 0.5) d = min(d, vLocal.y + 0.5);
  if (bitOf(sides, 8.0) > 0.5) d = min(d, vLocal.x + 0.5);
  if (bitOf(bends, 1.0) > 0.5) d = min(d, length(vLocal.xy - vec2(0.5, 0.5)));
  if (bitOf(bends, 2.0) > 0.5) d = min(d, length(vLocal.xy - vec2(0.5, -0.5)));
  if (bitOf(bends, 4.0) > 0.5) d = min(d, length(vLocal.xy - vec2(-0.5, -0.5)));
  if (bitOf(bends, 8.0) > 0.5) d = min(d, length(vLocal.xy - vec2(-0.5, 0.5)));
  return max(d, 0.0);
}

void main(){
  float flags = vC.w;
  float fg = bitOf(flags, 1.0);
  float seamL = bitOf(flags, 2.0), seamR = bitOf(flags, 4.0), sweepY = bitOf(flags, 8.0);
  float ci = vC.x;
  vec3 warm = uPal[0].rgb;

  /* dissolving into light: the body warms toward white and thins away
     in soft clumps, the side the clear comes from first. No hard edges
     and no sparkle at the seam — a row of light, not a breaking one. */
  float fade = 1.0, lightUp = 0.0;
  if (vC.z > 0.0) {
    float n = vnoise3(vLocal * 2.6 + vD.w * 7.1) * 0.7 + vnoise3(vLocal * 5.5 + vD.w * 2.3) * 0.3;
    float g = sweepY > 0.5 ? (vLocal.y + 0.5) : (vLocal.x + 0.5);
    float p = clamp(vC.z * 1.35 - 0.2 + (0.5 - g) * 0.35 + (n - 0.5) * 0.5, 0.0, 1.0);
    lightUp = smoothstep(0.0, 0.45, p);
    fade = 1.0 - smoothstep(0.25, 1.0, p);
  }
  vec3 base = uPal[int(ci + 0.5)].rgb;
  float front = smoothstep(0.85, 0.97, vLN.z);

  /* stone speckle, paper fibre */
  if (uMat1.y > 0.0) {
    float sp = vnoise3(vLocal * 34.0 + vD.w * 7.0);
    float fl = step(0.86, hash13(floor(vLocal * 55.0) + vD.w * 3.0));
    base *= 1.0 + uMat1.y * ((sp - 0.5) * 0.24 - fl * 0.1);
  }
  if (uMat1.z > 0.0) {
    float f1 = vnoise(vec2(vLocal.x * 5.0 + vD.w * 3.0, vLocal.y * 62.0 + vLocal.z * 9.0));
    float f2 = vnoise(vec2(vLocal.x * 70.0 + vLocal.y * 8.0, vLocal.y * 4.0 + vD.w));
    base *= 1.0 + uMat1.z * ((f1 - 0.5) * 0.16 + (f2 - 0.5) * 0.1);
  }

  /* glyphs: an inner motif on every cell's face */
  int gk = int(ci + 0.5);
  if (uMat2.y > 0.0 && gk >= 1 && gk <= 7 && front > 0.0) {
    float aa = max(fwidth(vLocal.x), 1e-4) * 0.9;
    float w = 0.026 + 0.012 * step(0.5, uMat2.y);
    float m = glyph(gk, vLocal.xy, w, aa) * front;
    vec3 gc = luma(base) > 0.3 ? base * 0.38 : mix(base, vec3(1.0), 0.6);
    if (uMat2.z > 0.5) gc = uPal[11].rgb;
    if (uMat1.w > 0.5) gc = uPal[9].rgb;
    base = mix(base, gc, m * min(1.0, uMat2.y));
  }

  vec3 col;
  if (uMat1.w > 0.5) {
    /* Ink: no light at all. Flat fill, the sides a step darker so the
       stack still has a top, and a two-pixel light line round the outer
       edge of each piece, measured in real pixels */
    col = base * mix(0.5, 1.0, smoothstep(0.15, 0.6, vLN.z));
    float wpx = 2.0 / max(uKey.w * vD.z, 1.0);
    float d = edgeDist();
    float ol = (1.0 - smoothstep(wpx * 0.75, wpx * 1.25, d)) * step(0.2, vLN.z);
    col = mix(col, uPal[10].rgb, ol);
    col += warm * vC.y * 0.6;
  } else {
    vec3 N = normalize(vN);
    vec3 V = normalize(uEye.xyz - vW);
    vec3 L = uKey.xyz;
    float NoV = max(dot(N, V), 1e-3);
    float NoL = dot(N, L);
    float rough = uMat0.x;
    float a = max(rough * rough, 0.004);
    vec3 H = normalize(V + L);
    float NoH = max(dot(N, H), 0.0), LoH = max(dot(L, H), 0.0);
    /* the stack sits in the shaft, so the light that reaches it fades a
       little with depth; the piece in hand is never dimmed */
    float shaft = fg > 0.5 ? 1.0 : mix(0.84, 1.0, smoothstep(-1.0, 20.0, vW.y));
    vec3 keyC = uKeyCol.rgb * shaft;
    /* diffuse, wrapped so a piece is lit round its edges the way a
       translucent thing is; a face toward us lands near its own colour */
    float wrap = 0.3 + uMat1.x * 0.5;
    float diffL = max((NoL + wrap) / (1.0 + wrap), 0.0);
    vec3 diff = base * diffL * keyC * 0.36;
    vec3 irr = mix(uEnvLow.rgb, uEnvTop.rgb, N.y * 0.5 + 0.5);
    vec3 amb = base * (irr * 0.55 + 0.035);
    vec3 spec = D_GGX(NoH, a) * V_SmithFast(NoV, max(NoL, 0.0), a) * F_Schlick(vec3(0.04), LoH) * keyC * max(NoL, 0.0);
    /* a clear coat over everything but stone: the studio, reflected */
    vec3 R = reflect(-V, N);
    vec2 fab = DFG(NoV, rough);
    float coat = 0.045 + 0.035 * uMat2.w;
    vec3 env = studioEnv(R, rough) * (coat * fab.x + fab.y);
    float fres = pow(1.0 - NoV, 4.0);
    float glint = fg > 0.5 ? vC.y : 0.0;
    vec3 rim = uRimCol.rgb * fres * uMat0.y * (1.1 + 2.5 * glint);
    /* light that went in and came back out, saturated by the body */
    vec3 sss = base * base * uMat1.x * keyC * (0.10 + 0.55 * pow(1.0 - NoV, 2.0) + 0.12 * max(N.y, 0.0));
    vec3 emi = base * uMat0.z * 0.4;
    /* glass and jelly are thin at their edges, and light comes through
       there: a soft glow just inside the outline of the whole body */
    float inner = exp(-edgeDist() * 7.5) * uFx1.x;
    vec3 thin = base * keyC * inner * 0.2 + warm * inner * 0.025;
    col = diff + amb + spec + env + rim + sss + emi + thin;
    /* a pillow of light across each body's face: a little brighter
       under its top edge, a little deeper toward its bottom one */
    float dTop = bitOf(uVar.x, 1.0) > 0.5 ? 0.5 - vLocal.y : 2.0;
    float dBot = bitOf(uVar.x, 4.0) > 0.5 ? vLocal.y + 0.5 : 2.0;
    col *= 1.0 + front * (0.09 * exp(-dTop * 5.0) - 0.11 * exp(-dBot * 4.0));
    /* Sea Glass on the Full tier: the well's own back wall, seen through
       the glass and bent by it, under a frosted, luminous body */
    if (uMat0.w > 0.0) {
      vec2 off = N.xy * uMat0.w * 26.0 + (vW.xy - uEye.xy) * 0.006;
      vec3 behind = backWall(vW.xy + off);
      float edge = 1.0 - front;
      col = col * (0.86 + 0.1 * edge) + base * behind * 7.0 + base * keyC * 0.03 * (0.5 + edge) + keyC * 0.012 * edge;
    }
    if (fg < 0.5) col += warm * vC.y;
  }

  /* silt: a soft seam of light where the gap is */
  if (seamL + seamR > 0.0) {
    float seam = seamL * exp(-(vLocal.x + 0.5) * 16.0) + seamR * exp(-(0.5 - vLocal.x) * 16.0);
    col += warm * seam * 0.4;
  }
  if (vC.z > 0.0) col = mix(col, warm * (0.9 + 0.6 * lightUp), lightUp * 0.65) + warm * lightUp * 0.25;
  outColor = vec4(col * uEnvTop.w, uFade > 0.5 ? fade : fg);
}
`;

/* ---------- the stone: shaft, frame, back wall, the niche ---------- */
var VS_WALL = GLSL_HEAD + GLSL_FRAME + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
layout(location = 2) in float aKind;
out vec3 vW; out vec3 vN; flat out float vKind;
void main(){ vW = aPos; vN = aNrm; vKind = aKind; gl_Position = uVP * vec4(aPos, 1.0); }
`;
var FS_WALL = GLSL_HEAD + GLSL_FRAME + GLSL_COMMON + GLSL_BRDF + GLSL_STONE + `
uniform vec4 uNiche;        /* glow, layer (1 = never dimmed), mini-cell scale, spare */
uniform vec4 uNicheRect;    /* the opening: x0, x1, y0, y1 */
in vec3 vW; in vec3 vN; flat in float vKind;
out vec4 outColor;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uEye.xyz - vW);
  vec3 col;
  if (vKind < 0.5) {
    /* the back wall; polished stone (ice, basalt, lacquer, obsidian)
       also holds a faint reflection of the room */
    float gl0;
    col = backWallG(vW.xy, gl0);
    if (gl0 > 0.3) {
      vec3 Rb = reflect(-V, N);
      col += studioEnv(Rb, 0.35) * (gl0 - 0.3) * 0.02 * (0.4 + 0.6 * mouth(vW.y));
    }
    if (uWall.w > 0.0) {
      vec2 f = fract(vW.xy); vec2 dd = min(f, 1.0 - f); float d = min(dd.x, dd.y);
      float px = max(fwidth(vW.x), 1e-4);
      float ln = 1.0 - smoothstep(0.4 * px, 1.4 * px, d);
      col += uWall.rgb * uKeyCol.rgb * ln * uWall.w * 0.03 * (0.35 + 0.65 * mouth(vW.y));
    }
    for (int i = 0; i < 4; i++) {
      vec4 r = uRing[i];
      if (r.w <= 0.0) continue;
      /* a lock's ripple: a broad, faint ring of light through the stone,
         far below anything that could read as a flash */
      float d = length(vW.xy - r.xy) - r.z * 7.0;
      col += uKeyCol.rgb * uWall.rgb * exp(-d * d * 0.9) * r.w * exp(-r.z * 2.2) * 0.05;
    }
    /* the Empty Well's one breath, and the light a finished run rises
       into: warm light welling up the shaft from the floor, held under
       the flash threshold by construction (ΔL < 0.08) */
    float well = exp(-vW.y * 0.09) * (0.75 + 0.25 * smoothstep(0.0, 2.0, vW.x) * smoothstep(0.0, 2.0, 10.0 - vW.x));
    col += uKeyCol.rgb * (uFx0.x * 0.022 * well + uFx0.w * 0.014 * (0.4 + 0.6 * mouth(vW.y)));
  } else {
    vec2 p = abs(N.x) > 0.6 ? vec2(vW.z * 1.7 + 31.0, vW.y) : (abs(N.y) > 0.6 ? vec2(vW.x, vW.z * 1.7 + 57.0) : vW.xy);
    if (vKind > 1.5) p = p * 1.6 + vec2(13.0, 7.0);
    vec4 st = stone(p);
    vec3 alb = stoneAlbedo(st.rgb);
    float inside = (vW.x > -0.02 && vW.x < 10.02 && vW.z < -0.06 && vKind < 1.5) ? 1.0 : 0.0;
    float rough = mix(0.7, 0.25, st.a);
    float a = rough * rough;
    vec3 L = uKey.xyz;
    float NoL = max(dot(N, L), 0.0), NoV = max(dot(N, V), 1e-3);
    vec3 H = normalize(V + L);
    float NoH = max(dot(N, H), 0.0), LoH = max(dot(L, H), 0.0);
    float lit = inside > 0.5 ? mouth(vW.y) * 0.7 : 1.0;
    if (inside > 0.5 && N.y > 0.6) lit *= 1.0 - 0.6 * clamp(occS(vec2(vW.x, 0.45)) * 0.7 + occS(vec2(vW.x + 0.45, 0.45)) * 0.15 + occS(vec2(vW.x - 0.45, 0.45)) * 0.15, 0.0, 1.0);
    if (inside > 0.5 && abs(N.x) > 0.6) lit *= 1.0 - 0.5 * clamp(occS(vec2(vW.x < 5.0 ? 0.45 : 9.55, vW.y)), 0.0, 1.0);
    vec3 keyC = uKeyCol.rgb * lit;
    /* the frame is lit by the room, a little more on its upper parts */
    float height = 0.65 + 0.35 * smoothstep(-1.0, 22.0, vW.y);
    vec3 diff = alb * keyC * NoL * (inside > 0.5 ? 0.07 : 0.13) * height;
    vec3 spec = D_GGX(NoH, a) * V_SmithFast(NoV, NoL, a) * F_Schlick(vec3(0.04), LoH) * keyC * NoL * 0.5;
    vec3 irr = mix(uEnvLow.rgb, uEnvTop.rgb, N.y * 0.5 + 0.5);
    vec2 fab = DFG(NoV, rough);
    vec3 env = studioEnv(reflect(-V, N), rough) * (0.04 * fab.x + fab.y) * (0.25 + 0.75 * st.a) * (inside > 0.5 ? 0.3 : 1.0);
    col = diff + spec + alb * irr * (inside > 0.5 ? 0.12 : 0.42) * height + env;
    if (vKind > 2.5) {
      /* inside the niche: a little light of its own, so what is kept
         there is always readable, and a lip that glows when Keep is
         ready to use */
      col = alb * (uKeyCol.rgb * 0.05 + irr * 0.2) * (0.6 + 0.4 * smoothstep(-0.6, 0.0, vW.z));
      col += uRimCol.rgb * uNiche.x * exp(vW.z * 9.0 / max(uNiche.z, 0.3)) * 0.55;
    } else if (vKind > 1.5) {
      /* the niche's lip: light gathered round the opening when Keep is
         there to be used */
      vec2 q = vW.xy;
      float dx = max(max(uNicheRect.x - q.x, q.x - uNicheRect.y), 0.0);
      float dy = max(max(uNicheRect.z - q.y, q.y - uNicheRect.w), 0.0);
      float d = length(vec2(dx, dy));
      float lip = exp(-d * 7.0 / max(uNiche.z, 0.3));
      col += uRimCol.rgb * uNiche.x * (lip * 0.5 + pow(1.0 - NoV, 2.0) * 0.08);
    }
  }
  outColor = vec4(col * uEnvTop.w, uNiche.y);
}
`;

/* ---------- light: pools, rails, ticks, trails, bands, beads ----------
   One instanced quad that knows a dozen shapes. All of it is added
   light; the shadow behind the well is the one exception and is drawn
   with its own blend. */
var VS_SPRITE = GLSL_HEAD + GLSL_FRAME + `
layout(location = 0) in vec4 iA;   /* centre xyz, plane (0 facing us, 1 lying flat) */
layout(location = 1) in vec4 iB;   /* half size xy, shape, param */
layout(location = 2) in vec4 iC;   /* colour, intensity */
layout(location = 3) in vec4 iD;   /* param2, param3, layer, turn */
out vec2 vUV; flat out vec4 vB; flat out vec4 vC; flat out vec4 vD;
const vec2 Q[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
void main(){
  vec2 q = Q[gl_VertexID];
  vec2 l = q * iB.xy;
  float c = cos(iD.w), s = sin(iD.w);
  l = vec2(c * l.x - s * l.y, s * l.x + c * l.y);
  vec3 w = iA.xyz + (iA.w < 0.5 ? vec3(l, 0.0) : vec3(l.x, 0.0, -l.y));
  vUV = q; vB = iB; vC = iC; vD = iD;
  gl_Position = uVP * vec4(w, 1.0);
}
`;
var FS_SPRITE = GLSL_HEAD + GLSL_FRAME + `
in vec2 vUV; flat in vec4 vB; flat in vec4 vC; flat in vec4 vD;
uniform float uShadow;
out vec4 outColor;
void main(){
  vec2 uv = vUV;
  float shape = vB.z, prm = vB.w, a = 0.0;
  if (shape < 0.5) {                       /* soft disc, gone by the quad's edge */
    float r2 = dot(uv, uv);
    a = exp(-r2 * 3.2) * max(1.0 - r2, 0.0);
  } else if (shape < 1.5) {                /* soft-edged rectangle */
    vec2 e = smoothstep(vec2(1.0), vec2(1.0) - vec2(prm, prm * vB.x / max(vB.y, 1e-3)), abs(uv));
    a = e.x * e.y;
  } else if (shape < 2.5) {                /* a pool of light spilling down a face from its top edge */
    float t = 1.0 - (uv.y * 0.5 + 0.5);
    a = exp(-t * 4.2) * (1.0 - pow(abs(uv.x), 6.0));
  } else if (shape < 3.5) {                /* hairline: prm px wide, faded along its length */
    float d = abs(uv.x) * vB.x * uKey.w;
    a = (1.0 - smoothstep(prm * 0.5 - 0.6, prm * 0.5 + 0.6, d)) * mix(vD.x, 1.0, uv.y * 0.5 + 0.5);
  } else if (shape < 4.5) {                /* ring */
    float r = length(uv);
    a = exp(-pow((r - 0.82) / 0.1, 2.0));
  } else if (shape < 5.5) {                /* band of soft light */
    float yy = uv.y * uv.y;
    a = exp(-yy * 3.6) * (1.0 - yy) * smoothstep(1.0, 0.86, abs(uv.x));
  } else if (shape < 6.5) {                /* a bead: a lit pearl and its glow */
    float r2 = dot(uv, uv);
    float body = smoothstep(1.0, 0.82, r2) * (0.35 + 0.65 * (1.0 - r2));
    float hi = exp(-dot(uv - vec2(-0.32, 0.38), uv - vec2(-0.32, 0.38)) * 22.0);
    a = body * prm + hi * (0.4 + 0.6 * prm) + exp(-r2 * 1.1) * vD.x;
  } else if (shape < 7.5) {                /* rounded frame line, inset param3 inside its quad */
    vec2 h = vB.xy;
    vec2 q2 = abs(uv * h) - (h - vec2(vD.y) - vec2(prm));
    float d = length(max(q2, 0.0)) + min(max(q2.x, q2.y), 0.0) - prm;
    float w = vD.x;
    a = exp(-(d * d) / (w * w));
  } else if (shape < 8.5) {                /* trail: bright where it lands, fading up */
    float t = uv.y * 0.5 + 0.5;
    a = pow(1.0 - t, 1.6) * smoothstep(1.0, 0.55, abs(uv.x));
  } else if (shape < 9.5) {                /* soft shadow, falling to nothing before its quad ends */
    vec2 h = vB.xy;
    vec2 q2 = abs(uv * h) - (h - vec2(vD.x) - vec2(prm));
    float d = length(max(q2, 0.0)) + min(max(q2.x, q2.y), 0.0) - prm;
    a = 1.0 - smoothstep(-vD.x, vD.x, d);
  } else {                                 /* pip */
    float r = length(uv);
    float aa = 1.4 / max(vB.x * uKey.w, 1.0);
    a = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  }
  if (uShadow > 0.5) { outColor = vec4(0.0, 0.0, 0.0, a * vC.a); return; }
  outColor = vec4(vC.rgb * vC.a * a * uEnvTop.w, vD.z * clamp(a * 4.0, 0.0, 1.0));
}
`;

/* ---------- ribbons: the Twist's pearl light ----------
   A strip of 96 segments whose shape is a function, not a buffer: a
   loop round the T that passes behind it, or a band running along a
   cleared row that twists as it goes. The depth test does the rest —
   where the loop goes behind the piece, the piece hides it. */
var RIB_SEG = 96;
var VS_RIBBON = GLSL_HEAD + GLSL_FRAME + `
uniform vec4 uR0;   /* kind, head, tail, width */
uniform vec4 uR1;   /* centre x, y, radius x, radius y */
uniform vec4 uR2;   /* colour, intensity */
uniform vec4 uR3;   /* depth swing, twist rate, phase, turns */
out float vU; out float vSide; out float vS;
vec3 curve(float s){
  if (uR0.x < 0.5) {
    float ang = uR3.w * s * 6.2831853 + uR3.z;
    return vec3(uR1.x + cos(ang) * uR1.z, uR1.y + sin(ang) * uR1.w * 0.55 + (s - 0.5) * 0.9, -0.42 + sin(ang) * uR3.x);
  }
  float x = -0.6 + s * 11.2;
  return vec3(x, uR1.y + sin(s * uR3.y + uR3.z) * 0.18, 0.28 + 0.16 * cos(s * uR3.y * 0.7 + uR3.z));
}
void main(){
  int seg = gl_VertexID / 2;
  float side = float(gl_VertexID - seg * 2) * 2.0 - 1.0;
  float u = float(seg) / 95.0;
  float s = uR0.y - uR0.z * (1.0 - u);
  vec3 p = curve(s), p2 = curve(s + 0.004);
  vec2 t = p2.xy - p.xy; t /= max(length(t), 1e-5);
  vec2 nrm = vec2(-t.y, t.x);
  float tw = cos(s * uR3.y * 1.3 + uR3.z);
  float w = uR0.w * (0.2 + 0.8 * abs(tw));
  p.xy += nrm * side * w;
  vU = u; vSide = side; vS = s;
  gl_Position = uVP * vec4(p, 1.0);
}
`;
var FS_RIBBON = GLSL_HEAD + GLSL_FRAME + `
uniform vec4 uR2;
in float vU; in float vSide; in float vS;
out vec4 outColor;
void main(){
  if (vS < 0.0 || vS > 1.0) discard;
  float a = (1.0 - vSide * vSide) * smoothstep(0.0, 0.35, vU) * smoothstep(1.0, 0.92, vU) * 0.6 + smoothstep(0.9, 1.0, vU) * (1.0 - abs(vSide)) * 0.8;
  vec3 pearl = uR2.rgb * (0.82 + 0.18 * cos(6.2831853 * (vS * 1.3 + vec3(0.0, 0.33, 0.67))));
  outColor = vec4(pearl * a * uR2.a * uEnvTop.w, 0.0);
}
`;

/* ---------- particles ----------
   Written once, at birth; the vertex shader integrates
   p = p0 + v t + ½ a t² and adds a sway, so the CPU never touches a
   particle again. The shape is the world's: motes, bubbles, drops with
   rings, leaves, sparks, plankton, paper flakes, snow, petals, stars. */
var VS_PART = GLSL_HEAD + GLSL_FRAME + `
layout(location = 0) in vec4 iP;   /* x, y, sway, size */
layout(location = 1) in vec4 iV;   /* vx, vy, ax, ay */
layout(location = 2) in vec4 iT;   /* born, life, seed, kind */
layout(location = 3) in vec4 iK;   /* colour, alpha */
uniform float uNow;
out vec2 vUV; flat out float vKind; out float vA; flat out vec3 vCol;
const vec2 Q[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
void main(){
  float age = uNow - iT.x;
  if (age < 0.0 || age > iT.y || iT.y <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; vKind = 0.0; vCol = vec3(0.0); vUV = vec2(0.0); return; }
  float k = age / iT.y;
  vec2 p = iP.xy + iV.xy * age + 0.5 * iV.zw * age * age;
  p.x += iP.z * sin(age * (1.1 + iT.z) + iT.z * 6.2831853);
  float sz = iP.w * mix(1.0, 0.55, k);
  if (iT.w > 6.5 && iT.w < 7.5) sz = iP.w * (0.8 + 0.4 * k);
  vec2 q = Q[gl_VertexID];
  float ang = iT.z * 6.2831853 + age * (iT.w > 2.5 && iT.w < 3.5 || iT.w > 7.5 && iT.w < 8.5 || iT.w > 5.5 && iT.w < 6.5 ? (1.4 + iT.z * 2.0) : 0.0);
  float c = cos(ang), s = sin(ang);
  vec2 l = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * sz;
  vUV = q; vKind = iT.w; vCol = iK.rgb;
  vA = smoothstep(0.0, 0.06, k) * (1.0 - smoothstep(0.55, 1.0, k)) * iK.a;
  gl_Position = uVP * vec4(p + l, 0.3, 1.0);
}
`;
var FS_PART = GLSL_HEAD + GLSL_FRAME + `
in vec2 vUV; flat in float vKind; in float vA; flat in vec3 vCol;
out vec4 outColor;
float shapeOf(float kind, vec2 uv){
  float r2 = dot(uv, uv);
  if (kind < 0.5) return exp(-r2 * 4.5);
  if (kind < 1.5) { float r = sqrt(r2); return smoothstep(1.0, 0.82, r) * (0.18 + 0.82 * smoothstep(0.5, 0.86, r)) + exp(-dot(uv - vec2(-0.32, 0.36), uv - vec2(-0.32, 0.36)) * 34.0) * 0.9; }
  if (kind < 2.5) { vec2 q = vec2(uv.x * (1.0 + 0.6 * max(uv.y, 0.0)), uv.y); float d = length(q * vec2(1.35, 1.0)); float ring = exp(-pow((length(uv) - 0.85) / 0.06, 2.0)) * 0.35; return exp(-d * d * 4.0) + ring; }
  if (kind < 3.5) { vec2 q = uv * vec2(1.0, 2.4); return smoothstep(1.0, 0.7, length(q)) * (0.75 + 0.25 * smoothstep(0.1, 0.0, abs(uv.y))); }
  if (kind < 4.5) { float c = exp(-r2 * 16.0); float x = exp(-abs(uv.x) * 16.0) * exp(-uv.y * uv.y * 3.0) + exp(-abs(uv.y) * 16.0) * exp(-uv.x * uv.x * 3.0); return c + x * 0.55; }
  if (kind < 5.5) return exp(-r2 * 7.0);
  if (kind < 6.5) { vec2 q = abs(uv); return (1.0 - smoothstep(0.5, 0.72, max(q.x * 0.85, q.y * 1.3))) * 0.85 + exp(-r2 * 3.0) * 0.3; }
  if (kind < 7.5) return exp(-r2 * 2.4) * 0.9;
  if (kind < 8.5) { vec2 q = uv * vec2(1.0, 1.65); float d = length(q - vec2(0.0, -0.1)); return smoothstep(1.0, 0.72, d) * (1.0 - 0.5 * exp(-pow(abs(uv.x) * 6.0, 2.0)) * step(0.55, uv.y)); }
  return exp(-abs(uv.x * uv.y) * 40.0) * exp(-r2 * 1.6) + exp(-r2 * 18.0);
}
void main(){
  float a = shapeOf(vKind, vUV) * vA;
  outColor = vec4(vCol * a * uEnvTop.w, 0.0);
}
`;

/* ---------- full screen: sky, blit, bloom, composite ---------- */
var VS_FULL = GLSL_HEAD + `
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
/* the stand-in sky, and the Simple tier's still gradient: used when
   sky.js is missing or its shader will not compile, so a broken
   backdrop can never take the well down with it */
var FS_SKY_PLAIN = GLSL_HEAD + `
uniform vec2 uRes; uniform float uMix, uDanger, uReact;
uniform vec3 uTopA, uHorA, uTopB, uHorB;
uniform vec2 uWell;
out vec4 outColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 top = mix(uTopA, uTopB, uMix), hor = mix(uHorA, uHorB, uMix);
  vec3 c = mix(hor, top, smoothstep(0.0, 1.0, uv.y));
  float d = length((uv - uWell) * vec2(uRes.x / uRes.y, 1.0));
  c += hor * (0.22 + 0.1 * uReact) * exp(-d * d * 2.6);
  c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))) * vec3(0.88, 0.96, 1.1), uDanger * 0.3);
  outColor = vec4(c, 1.0);
}
`;
var FS_BLIT = GLSL_HEAD + `
uniform sampler2D uSrc; uniform vec2 uInv; uniform float uEnc;
out vec4 outColor;
void main(){ outColor = vec4(texture(uSrc, gl_FragCoord.xy * uInv).rgb * uEnc, 0.0); }
`;
/* bloom, after Call of Duty (2014) by way of LearnOpenGL: a 13-tap
   downsample, Karis-averaged on the first step so a single hot pixel
   cannot become a firefly, and a 3x3 tent on the way back up. The
   first step also honours the readability mask: what must never be
   washed does not get to wash anything else either. */
var FS_BRIGHT = GLSL_HEAD + `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform vec2 uInv; uniform vec4 uP;  /* threshold, knee, decode, encode */
out vec4 outColor;
vec3 S(vec2 uv, vec2 d){ vec4 c = texture(uSrc, uv + d * uTexel); return c.rgb * uP.z * (1.0 - clamp(c.a, 0.0, 1.0)); }
float karis(vec3 c){ return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * 0.25); }
void main(){
  vec2 uv = gl_FragCoord.xy * uInv;
  vec3 a = S(uv, vec2(-2.0, 2.0)), b = S(uv, vec2(0.0, 2.0)), c = S(uv, vec2(2.0, 2.0));
  vec3 d = S(uv, vec2(-2.0, 0.0)), e = S(uv, vec2(0.0)), f = S(uv, vec2(2.0, 0.0));
  vec3 g = S(uv, vec2(-2.0, -2.0)), h = S(uv, vec2(0.0, -2.0)), i = S(uv, vec2(2.0, -2.0));
  vec3 j = S(uv, vec2(-1.0, 1.0)), k = S(uv, vec2(1.0, 1.0)), l = S(uv, vec2(-1.0, -1.0)), m = S(uv, vec2(1.0, -1.0));
  vec3 g0 = (a + b + d + e) * 0.03125, g1 = (b + c + e + f) * 0.03125, g2 = (d + e + g + h) * 0.03125, g3 = (e + f + h + i) * 0.03125, g4 = (j + k + l + m) * 0.125;
  vec3 col = g0 * karis(g0 * 4.0) + g1 * karis(g1 * 4.0) + g2 * karis(g2 * 4.0) + g3 * karis(g3 * 4.0) + g4 * karis(g4 * 2.0);
  float br = max(col.r, max(col.g, col.b));
  float soft = clamp(br - uP.x + uP.y, 0.0, 2.0 * uP.y); soft = soft * soft / (4.0 * uP.y + 1e-4);
  col *= max(soft, br - uP.x) / max(br, 1e-4);
  outColor = vec4(max(col, 0.0) * uP.w, 1.0);
}
`;
var FS_DOWN = GLSL_HEAD + `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform vec2 uInv;
out vec4 outColor;
vec3 S(vec2 uv, vec2 d){ return texture(uSrc, uv + d * uTexel).rgb; }
void main(){
  vec2 uv = gl_FragCoord.xy * uInv;
  vec3 a = S(uv, vec2(-2.0, 2.0)), b = S(uv, vec2(0.0, 2.0)), c = S(uv, vec2(2.0, 2.0));
  vec3 d = S(uv, vec2(-2.0, 0.0)), e = S(uv, vec2(0.0)), f = S(uv, vec2(2.0, 0.0));
  vec3 g = S(uv, vec2(-2.0, -2.0)), h = S(uv, vec2(0.0, -2.0)), i = S(uv, vec2(2.0, -2.0));
  vec3 j = S(uv, vec2(-1.0, 1.0)), k = S(uv, vec2(1.0, 1.0)), l = S(uv, vec2(-1.0, -1.0)), m = S(uv, vec2(1.0, -1.0));
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  outColor = vec4(max(col, 0.0), 1.0);
}
`;
var FS_UP = GLSL_HEAD + `
uniform sampler2D uSrc; uniform vec2 uR; uniform vec2 uInv; uniform float uGain;
out vec4 outColor;
vec3 S(vec2 uv, vec2 d){ return texture(uSrc, uv + d * uR).rgb; }
void main(){
  vec2 uv = gl_FragCoord.xy * uInv;
  vec3 col = S(uv, vec2(0.0)) * 4.0
           + (S(uv, vec2(0.0, 1.0)) + S(uv, vec2(-1.0, 0.0)) + S(uv, vec2(1.0, 0.0)) + S(uv, vec2(0.0, -1.0))) * 2.0
           + S(uv, vec2(-1.0, 1.0)) + S(uv, vec2(1.0, 1.0)) + S(uv, vec2(-1.0, -1.0)) + S(uv, vec2(1.0, -1.0));
  outColor = vec4(col * (1.0 / 16.0) * uGain, 1.0);
}
`;
/* The last step. Khronos PBR Neutral keeps base colours true while
   rolling off highlights (the palette is the pieces' identity, and a
   per-channel filmic curve would shift the yellows); the skin then
   grades it; the vignette and the danger tint stay off the mask; a
   five-tap edge filter takes the stair-steps off silhouettes; grain is
   fixed in place so it dithers the dark gradients without crawling. */
var FS_COMP = GLSL_HEAD + `
uniform sampler2D uScene, uBloom;
uniform vec4 uC0;      /* bloom amount, vignette, grain, edge AA on */
uniform vec4 uC1;      /* exposure, danger, danger edge desaturation, P3 */
uniform vec4 uC2;      /* texel x, y, decode scene, decode bloom */
uniform vec4 uC3;      /* well rect in uv: x0, x1, y0, y1 */
uniform vec3 uLift, uGamma, uGain;
uniform float uBloomOn;
out vec4 outColor;
vec3 neutral(vec3 color){
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, newPeak * vec3(1.0), g);
}
vec3 encodeSRGB(vec3 c){
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float lumT(vec3 c){ c = c / (1.0 + c); return dot(c, vec3(0.299, 0.587, 0.114)); }
float hashP(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 uv = gl_FragCoord.xy * uC2.xy;
  vec4 s = texture(uScene, uv);
  vec3 c = s.rgb * uC2.z;
  float fg = clamp(s.a, 0.0, 1.0);
  if (uC0.w > 0.5) {
    vec3 cN = texture(uScene, uv + vec2(0.0, uC2.y)).rgb * uC2.z;
    vec3 cS = texture(uScene, uv - vec2(0.0, uC2.y)).rgb * uC2.z;
    vec3 cE = texture(uScene, uv + vec2(uC2.x, 0.0)).rgb * uC2.z;
    vec3 cW = texture(uScene, uv - vec2(uC2.x, 0.0)).rgb * uC2.z;
    float lM = lumT(c), lN = lumT(cN), lS = lumT(cS), lE = lumT(cE), lW = lumT(cW);
    float mx = max(lM, max(max(lN, lS), max(lE, lW))), mn = min(lM, min(min(lN, lS), min(lE, lW)));
    if (mx - mn > max(0.0312, 0.125 * mx)) {
      float hz = abs(lN + lS - 2.0 * lM), vt = abs(lE + lW - 2.0 * lM);
      c = mix(c, hz > vt ? (cN + cS) * 0.5 : (cE + cW) * 0.5, 0.36);
    }
  }
  if (uBloomOn > 0.5) c += texture(uBloom, uv).rgb * uC2.w * uC0.x * (1.0 - fg);
  c *= uC1.x;
  vec2 d = uv - 0.5;
  float r2 = dot(d * vec2(1.0, 1.15), d * vec2(1.0, 1.15)) * 2.2;
  /* danger: the edges of the screen and of the well cool and grey */
  if (uC1.y > 0.0) {
    float outside = max(max(uC3.x - uv.x, uv.x - uC3.y), 0.0);
    float nearWall = exp(-pow(min(abs(uv.x - uC3.x), abs(uv.x - uC3.y)) * 26.0, 2.0)) * step(uC3.z, uv.y) * step(uv.y, uC3.w);
    float edge = clamp(smoothstep(0.12, 0.95, r2) + nearWall * 0.6 + smoothstep(0.0, 0.25, outside) * 0.4, 0.0, 1.0) * (1.0 - fg);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c, vec3(l) * vec3(0.82, 0.93, 1.12), uC1.y * uC1.z * edge);
    c *= 1.0 - uC1.y * 0.22 * smoothstep(0.1, 1.0, r2) * (1.0 - fg);
  }
  c = neutral(max(c, 0.0));
  c = uGain * (c + uLift * (1.0 - c));
  c = pow(max(c, 0.0), 1.0 / uGamma);
  c *= 1.0 - uC0.y * smoothstep(0.2, 1.0, r2) * (1.0 - fg);
  if (uC1.w > 0.5) c = mat3(0.8224621, 0.0331941, 0.0170827, 0.177538, 0.9668058, 0.0723974, 0.0, 0.0, 0.9105199) * c;
  c = encodeSRGB(c);
  c += (hashP(gl_FragCoord.xy) - 0.5) * uC0.z;
  outColor = vec4(c, 1.0);
}
`;

/* ================================================================
   the renderer
   ================================================================ */
var UBO_FLOATS = 132;
var MAXI = 900;           /* body instances */
var MAXS = 256;           /* light sprites, all layers */
var S_SCENE = 0, S_SHADOW = 160, S_FG = 168, S_END = MAXS;
var MAXP = 1500;          /* particles, the Full tier's cap */
var FXC = 520;            /* cells that are dissolving */

/* A canvas keeps its context for life. When a renderer is disposed it
   releases that context (WebKit allows sixteen per page), and remembers
   how to ask for it back, so the same canvas can carry the well again
   when the player switches back to 3D. A released context can only come
   back if its "lost" event was cancelled, so a small listener stays on
   the canvas to do exactly that, and to make the request if a new
   renderer asked before the event had arrived. */
var RELEASED = [];
function releasedFor(canvas) {
  for (var i = 0; i < RELEASED.length; i++) if (RELEASED[i].c === canvas) return RELEASED[i];
  return null;
}
function forget(rec) {
  for (var i = 0; i < RELEASED.length; i++) if (RELEASED[i] === rec) { RELEASED.splice(i, 1); return; }
}
function askBack(rec) {
  /* only after the lost event has finished dispatching: until then the
     browser has not yet noted that it was cancelled */
  forget(rec);
  setTimeout(function () { try { rec.x.restoreContext(); } catch (e) {} }, 0);
}
function holdForReuse(e) {
  if (e && e.preventDefault) e.preventDefault();
  var cv = e && e.target;
  if (!cv) return;
  cv.removeEventListener("webglcontextlost", holdForReuse, false);
  var rec = releasedFor(cv);
  if (!rec) return;
  rec.held = true;
  if (rec.want) askBack(rec);
}

Gfx3D.create = function (canvas, opts) {
  opts = opts || {};
  if (!canvas || !canvas.getContext) return null;
  var attrs = {
    antialias: false, depth: false, stencil: false, alpha: true, premultipliedAlpha: true,
    preserveDrawingBuffer: false, powerPreference: "default",
    failIfMajorPerformanceCaveat: !opts.allowSoftware
  };
  var gl = null;
  try { gl = canvas.getContext("webgl2", attrs); } catch (e) { gl = null; }
  if (!gl) return null;
  var revive = null;
  if (gl.isContextLost()) {
    revive = releasedFor(canvas);
    if (!revive) return null;
  }

  /* ---------- geometry made once, in JS, and kept for every rebuild ---------- */
  var cellGeo = buildCells();
  var cellData = packMesh(cellGeo.mesh, false), cellIdx = new Uint16Array(cellGeo.mesh.idx);
  var VT = cellGeo.table;
  var shellGeo = buildShell();
  var shellData = packMesh(shellGeo, true), shellIdx = new Uint16Array(shellGeo.idx);
  var niche = null, nicheData = null, nicheIdx = null;

  /* ---------- everything that lives on the GPU, rebuilt after a loss ---------- */
  var P = {}, B = {}, V = {}, X = {}, T = {}, F = {};
  var ready = false, lost = false, gaveUp = false, disposed = false, lastError = "";
  var lossTimes = [], lostWait = 0;
  var usingFallbackSky = false;

  var R = {
    kind: "3d", tier: "full",
    stats: { cpuMs: 0, frames: 0, tier: "full", step: 0, scale: 1, width: 0, height: 0,
             particles: 0, flashGranted: 0, flashDenied: 0, cadenceMs: 0, lowPower: false,
             fallbackSky: false, lastError: "", draws: 0 }
  };

  /* ---------- typed arrays, sized once ---------- */
  var ubo = new Float32Array(UBO_FLOATS);
  var instTmp = new Float32Array(MAXI * 16), instArr = new Float32Array(MAXI * 16);
  var instBucket = new Int16Array(MAXI), instN = 0;
  var NB = NVAR * 3;    /* layers: the stack, the never-dimmed, the fading */
  var bCount = new Int32Array(NB), bStart = new Int32Array(NB), bFill = new Int32Array(NB);
  var spr = new Float32Array(MAXS * 16), sprN = [S_SCENE, S_SHADOW, S_FG];
  var pData = new Float32Array(MAXP * 16), pHead = 0, pLo = MAXP, pHi = -1;
  var occData = new Uint8Array(W * 24 * 2), occDirty = true;
  var Pm = new Float32Array(16), Vm = new Float32Array(16), PV = new Float32Array(16), VP = new Float32Array(16);
  var mirB = new Uint8Array(W * ROWS), mirP = new Uint16Array(W * ROWS);
  var tmpGrid = new Int32Array(W * ROWS), tmpV = new Uint8Array(W * ROWS);
  var rowOff = new Float32Array(ROWS), tmpOff = new Float32Array(ROWS), clearedRow = new Uint8Array(ROWS);
  var hist = new Uint16Array(512), cadence = new Float32Array(240), cadN = 0, cadHead = 0;

  /* ---------- options, skin, world ---------- */
  var O = { landing: true, grid: "faint", lockLight: true, motion: "full", juice: "medium",
            nudge: 1, labels: true, steady: false, previews: 5 };
  var SK = {
    id: "seaglass", unlit: false, outline: false, mono: false, refract: 0.02, bloomCap: 1,
    rough: 0.3, rim: 0.7, emissive: 0, sss: 0.35, speckle: 0, fibre: 0, gloss: 0.4, inner: 0.75,
    glyph: 0, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], landing: 0.75
  };
  var pal = new Float32Array(48);
  function worldState() {
    return { idx: 0, id: "dawn", pattern: 0, wall: [0, 0, 0], key: [0, 0, 0], rim: [0, 0, 0],
             top: [0, 0, 0], hor: [0, 0, 0], pcol: [0, 0, 0], pkind: 0, pdir: 1, pdrift: 0.4,
             psize: 0.5, motion: 1 };
  }
  var WA = worldState(), WB = worldState(), wMix = 1, wT0 = -1, wDur = 2.5;
  var cur = { wall: [0, 0, 0], key: [0, 0, 0], rim: [0, 0, 0], top: [0, 0, 0], hor: [0, 0, 0],
              envTop: [0, 0, 0], envLow: [0, 0, 0] };

  /* ---------- the layout, as world coordinates ---------- */
  var cssW = 1, cssH = 1, dprIn = 1, Lay = null;
  var cellXpx = 30, cellYpx = 30, winL = -1, winT = 23, winR = 11, winB = -1;
  var renderScale = 1, pxPerCell = 30;
  var wellUV = [0.5, 0.5], wellRectUV = [0, 1, 0, 1], wellNDC = [0, 0];
  var slots = [];          /* previews: {x, y, s} world centre and scale */
  var keepSlot = null;     /* {x, y, s} where the kept piece rests */

  /* ---------- tiers ---------- */
  var tierMode = "auto", tierName = "full", tierBase = "full", step = 0;
  (function () {
    var t = opts.tier;
    if (t === "full" || t === "balanced" || t === "simple") { tierMode = t; tierName = t; }
    else {
      var nav = (typeof navigator !== "undefined") ? navigator : {};
      var mem = nav.deviceMemory, cores = nav.hardwareConcurrency;
      tierName = ((mem && mem <= 2) || (cores && cores <= 2)) ? "balanced" : "full";
    }
    tierBase = tierName;
    R.tier = tierName;
  })();
  function TT() { return TIERS[tierName]; }

  /* ================================================================
     programs, buffers, targets
     ================================================================ */
  function compile(vs, fs) {
    var v = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(v, vs); gl.compileShader(v);
    var f = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(f, fs); gl.compileShader(f);
    var p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    return { p: p, v: v, f: f, u: {} };
  }
  function linked(pr, name) {
    if (gl.getProgramParameter(pr.p, gl.LINK_STATUS)) return true;
    lastError = name + ": " + (gl.getShaderInfoLog(pr.v) || "") + " " + (gl.getShaderInfoLog(pr.f) || "") +
                " " + (gl.getProgramInfoLog(pr.p) || "");
    return false;
  }
  function locs(pr, names) {
    for (var i = 0; i < names.length; i++) pr.u[names[i]] = gl.getUniformLocation(pr.p, names[i]);
  }
  function frameBlock(pr) {
    var i = gl.getUniformBlockIndex(pr.p, "Frame");
    if (i !== gl.INVALID_INDEX) gl.uniformBlockBinding(pr.p, i, 0);
  }

  /* Which float formats this GPU can render to is asked once, with a
     tiny framebuffer per candidate. The answer decides how much light
     the scene can hold: half floats, or 8-bit sRGB storing half the
     value so there is still headroom above white. */
  function probe(internal) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, internal, 4, 4);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb); gl.deleteTexture(t);
    return ok;
  }
  function pickFormats() {
    var cbf = gl.getExtension("EXT_color_buffer_float");
    F.scene = { fmt: gl.SRGB8_ALPHA8, enc: 0.5 };
    F.ldr = { fmt: gl.SRGB8_ALPHA8, enc: 0.5 };
    F.hdr = { fmt: gl.SRGB8_ALPHA8, enc: 0.5 };
    F.sky = { fmt: gl.SRGB8_ALPHA8 };
    if (cbf) {
      if (probe(gl.RGBA16F)) F.scene = { fmt: gl.RGBA16F, enc: 1 };
      if (probe(gl.R11F_G11F_B10F)) F.hdr = { fmt: gl.R11F_G11F_B10F, enc: 1 };
      else if (probe(gl.RGBA16F)) F.hdr = { fmt: gl.RGBA16F, enc: 1 };
      F.sky = { fmt: F.hdr.enc === 1 ? F.hdr.fmt : gl.SRGB8_ALPHA8 };
    }
  }

  function build() {
    ready = false;
    gl.getExtension("KHR_parallel_shader_compile");
    pickFormats();
    /* compile everything, then link everything, then ask: the order
       that lets a driver work on all of them at once */
    P.block = compile(VS_BLOCK, FS_BLOCK);
    P.wall = compile(VS_WALL, FS_WALL);
    P.sprite = compile(VS_SPRITE, FS_SPRITE);
    P.ribbon = compile(VS_RIBBON, FS_RIBBON);
    P.part = compile(VS_PART, FS_PART);
    P.plain = compile(VS_FULL, FS_SKY_PLAIN);
    P.blit = compile(VS_FULL, FS_BLIT);
    P.bright = compile(VS_FULL, FS_BRIGHT);
    P.down = compile(VS_FULL, FS_DOWN);
    P.up = compile(VS_FULL, FS_UP);
    P.comp = compile(VS_FULL, FS_COMP);
    var SkyMod = root.Sky;
    P.sky = null;
    if (SkyMod && typeof SkyMod.VERT === "string" && typeof SkyMod.FRAG === "string") {
      try { P.sky = compile(SkyMod.VERT, SkyMod.FRAG); } catch (e) { P.sky = null; }
    }
    var names = ["block", "wall", "sprite", "ribbon", "part", "plain", "blit", "bright", "down", "up", "comp"];
    for (var i = 0; i < names.length; i++) if (!linked(P[names[i]], names[i])) { R.stats.lastError = lastError; return false; }
    usingFallbackSky = !(P.sky && linked(P.sky, "sky"));
    if (usingFallbackSky) { if (P.sky) gl.deleteProgram(P.sky.p); P.sky = P.plain; }
    R.stats.fallbackSky = usingFallbackSky;

    frameBlock(P.block); frameBlock(P.wall); frameBlock(P.sprite); frameBlock(P.ribbon); frameBlock(P.part);
    locs(P.block, ["uVar", "uOcc", "uFade"]);
    locs(P.wall, ["uNiche", "uOcc", "uNicheRect"]);
    locs(P.sprite, ["uShadow"]);
    locs(P.ribbon, ["uR0", "uR1", "uR2", "uR3"]);
    locs(P.part, ["uNow"]);
    var skyU = ["uRes", "uTime", "uA", "uB", "uMix", "uReact", "uMotion", "uDanger", "uTopA", "uHorA", "uTopB", "uHorB", "uWell"];
    locs(P.plain, skyU);
    if (P.sky !== P.plain) locs(P.sky, skyU);
    locs(P.blit, ["uSrc", "uInv", "uEnc"]);
    locs(P.bright, ["uSrc", "uTexel", "uInv", "uP"]);
    locs(P.down, ["uSrc", "uTexel", "uInv"]);
    locs(P.up, ["uSrc", "uR", "uInv", "uGain"]);
    locs(P.comp, ["uScene", "uBloom", "uC0", "uC1", "uC2", "uC3", "uLift", "uGamma", "uGain", "uBloomOn"]);

    /* the per-frame uniform buffer, bound once to slot 0 */
    B.ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, B.ubo);
    var need = UBO_FLOATS * 4;
    var bi = gl.getUniformBlockIndex(P.block.p, "Frame");
    if (bi !== gl.INVALID_INDEX) need = Math.max(need, gl.getActiveUniformBlockParameter(P.block.p, bi, gl.UNIFORM_BLOCK_DATA_SIZE));
    gl.bufferData(gl.UNIFORM_BUFFER, need, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, B.ubo);

    /* bodies: one vertex buffer holding all 47 cells, one index buffer,
       and the instance buffer the vertex shader turns them with */
    B.cellV = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, B.cellV); gl.bufferData(gl.ARRAY_BUFFER, cellData, gl.STATIC_DRAW);
    B.cellI = gl.createBuffer();
    B.inst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, B.inst); gl.bufferData(gl.ARRAY_BUFFER, instArr.byteLength, gl.DYNAMIC_DRAW);
    V.block = gl.createVertexArray();
    gl.bindVertexArray(V.block);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.cellI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cellIdx, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.cellV);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.inst);
    for (var a = 2; a < 6; a++) {
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 64, (a - 2) * 16);
      gl.vertexAttribDivisor(a, 1);
    }

    /* the stone */
    B.shellV = gl.createBuffer(); B.shellI = gl.createBuffer();
    V.shell = gl.createVertexArray();
    gl.bindVertexArray(V.shell);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.shellV); gl.bufferData(gl.ARRAY_BUFFER, shellData, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.shellI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, shellIdx, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    B.nicheV = gl.createBuffer(); B.nicheI = gl.createBuffer();
    V.niche = gl.createVertexArray();
    gl.bindVertexArray(V.niche);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.nicheV);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.nicheI);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    if (niche) uploadNiche();

    /* light sprites and particles: per-instance data only */
    B.spr = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, B.spr); gl.bufferData(gl.ARRAY_BUFFER, spr.byteLength, gl.DYNAMIC_DRAW);
    V.spr = gl.createVertexArray();
    gl.bindVertexArray(V.spr);
    for (a = 0; a < 4; a++) {
      gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 64, a * 16); gl.vertexAttribDivisor(a, 1);
    }
    B.part = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, B.part); gl.bufferData(gl.ARRAY_BUFFER, pData, gl.DYNAMIC_DRAW);
    V.part = gl.createVertexArray();
    gl.bindVertexArray(V.part);
    for (a = 0; a < 4; a++) {
      gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 64, a * 16); gl.vertexAttribDivisor(a, 1);
    }
    V.empty = gl.createVertexArray();
    gl.bindVertexArray(null);

    /* where the stack is, for the stone to be shaded by it */
    X.occ = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, X.occ);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG8, W, 24);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    occDirty = true; pLo = 0; pHi = MAXP - 1;

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    T = {}; targetsKey = "";
    ready = true;
    return true;
  }
  function uploadNiche() {
    gl.bindVertexArray(V.niche);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.nicheV); gl.bufferData(gl.ARRAY_BUFFER, nicheData, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.nicheI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, nicheIdx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  function makeTarget(w, h, fmt, depth) {
    var t = { w: w, h: h, tex: gl.createTexture(), fb: gl.createFramebuffer(), depth: null };
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    if (depth) {
      t.depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, t.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.depth);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return t;
  }
  function freeTarget(t) {
    if (!t) return;
    if (t.fb) gl.deleteFramebuffer(t.fb);
    if (t.tex) gl.deleteTexture(t.tex);
    if (t.depth) gl.deleteRenderbuffer(t.depth);
  }
  function freeTargets() {
    freeTarget(T.scene); freeTarget(T.sky);
    if (T.bloom) for (var i = 0; i < T.bloom.length; i++) freeTarget(T.bloom[i]);
    T = {};
  }
  var targetsKey = "", SC = { fmt: 0, enc: 1 };
  function mipsNow() { var t = TT(); return t.mips ? Math.max(0, t.mips - (step >= 2 ? 1 : 0)) : 0; }
  function skyDivNow() { return TT().skyDiv * (step >= 3 ? 2 : 1); }
  function particleCap() {
    if (O.motion === "still") return 0;
    return Math.max(16, Math.floor(TT().particles * (step >= 1 ? 0.5 : 1) * partHalf));
  }
  /* sizes are decided here and nowhere else: DPR capped by the tier, the
     scene held to its megapixel budget, then the adaptive scale step */
  function sizeCanvas() {
    var t = TT();
    var s = Math.min(dprIn, t.dpr) * STEP_SCALE[step];
    var mp = cssW * s * cssH * s / 1e6;
    if (mp > t.mp) s *= Math.sqrt(t.mp / mp);
    var w = Math.max(1, Math.round(cssW * s)), h = Math.max(1, Math.round(cssH * s));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    renderScale = w / Math.max(1, cssW);
    pxPerCell = cellXpx * renderScale;
    var key = w + "x" + h + ":" + mipsNow() + ":" + skyDivNow() + ":" + tierName;
    if (key !== targetsKey && ready && !lost) {
      freeTargets();
      targetsKey = key;
      /* Simple holds its scene in 8-bit sRGB at half value: half the
         bandwidth of a float target, and still some room above white */
      SC = tierName === "simple" ? F.ldr : F.scene;
      T.scene = makeTarget(w, h, SC.fmt, true);
      var sd = skyDivNow();
      T.sky = makeTarget(Math.max(4, Math.round(w / sd)), Math.max(4, Math.round(h / sd)), F.sky.fmt, false);
      T.bloom = [];
      var n = mipsNow(), bw = Math.max(4, Math.round(w / t.bloomDiv)), bh = Math.max(4, Math.round(h / t.bloomDiv));
      for (var i = 0; i < n; i++) {
        T.bloom.push(makeTarget(bw, bh, F.hdr.fmt, false));
        bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
      }
      skyDirty = true;
    }
    R.stats.width = w; R.stats.height = h; R.stats.scale = renderScale;
  }

  /* ================================================================
     skin and world
     ================================================================ */
  function num(v, d) { return (typeof v === "number" && isFinite(v)) ? v : d; }
  function vec3of(v, d, out) {
    if (typeof v === "number") { out[0] = out[1] = out[2] = v; }
    else if (v && v.length >= 3) { out[0] = num(v[0], d); out[1] = num(v[1], d); out[2] = num(v[2], d); }
    else { out[0] = out[1] = out[2] = d; }
  }
  function applySkin(skin, palette, glyphs) {
    skin = skin || DEFAULT_SKIN;
    var id = skin.id || "seaglass";
    var fb = MAT_FALLBACK[id] || MAT_FALLBACK.seaglass;
    var m = skin.mat || {};
    SK.id = id;
    SK.rough = num(m.rough, fb.rough); SK.rim = num(m.rim, fb.rim);
    SK.emissive = num(m.emissive, fb.emissive); SK.refract = num(m.refract, fb.refract);
    SK.sss = num(m.sss, fb.sss); SK.speckle = num(m.speckle, fb.speckle); SK.fibre = num(m.fibre, fb.fibre);
    SK.unlit = m.unlit !== undefined ? !!m.unlit : !!fb.unlit;
    SK.outline = m.outline !== undefined ? !!m.outline : !!fb.outline;
    SK.mono = !!skin.mono || id === "moonlight";
    SK.bloomCap = num(m.bloomCap, num(fb.bloomCap, 1));
    if (SK.unlit) SK.bloomCap = Math.min(SK.bloomCap, 0.3);
    SK.gloss = clamp(0.9 - SK.rough, 0, 1) * (id === "jelly" ? 1.4 : (id === "seaglass" ? 1.2 : 0.7));
    /* how much light gathers at a body's thin outer edge */
    SK.inner = id === "seaglass" ? 0.75 : (id === "jelly" ? 0.55 : (id === "lantern" ? 0.45 : (id === "moonlight" ? 0.35 : 0.08)));
    var g = m.grade || {};
    vec3of(g.lift, 0, SK.lift); vec3of(g.gamma, 1, SK.gamma); vec3of(g.gain, 1, SK.gain);
    for (var i = 0; i < 3; i++) if (!(SK.gamma[i] > 0.05)) SK.gamma[i] = 1;
    /* glyphs: the player's choice, unless the skin insists */
    var gl3 = glyphs || "off";
    if (skin.glyphs === "strong" || SK.unlit || SK.mono) gl3 = "strong";
    SK.glyph = gl3 === "strong" ? (SK.unlit ? 1 : 0.62) : (gl3 === "subtle" ? 0.24 : 0);
    SK.landing = SK.unlit ? 1 : 0.8;
    /* the colours actually drawn */
    var cols = null;
    var Sk = root.Skins;
    if (Sk && typeof Sk.resolve === "function") { try { cols = Sk.resolve(skin, palette || "skin"); } catch (e) { cols = null; } }
    if (!cols) cols = skin.colors || DEFAULT_SKIN.colors;
    for (i = 0; i < 7; i++) {
      var hx = cols[NAMES.charAt(i)];
      if (SK.mono && !hx) hx = "#C9D6EA";
      hexLin(hx || DEFAULT_SKIN.colors[NAMES.charAt(i)], pal, (i + 1) * 4);
      pal[(i + 1) * 4 + 3] = 1;
    }
    hexLin(cols.silt || skin.silt || "#5C6470", pal, 32);
    hexLin("#FFF1DE", pal, 0);                       /* warm white: what a clear turns into */
    hexLin("#0B0E16", pal, 36);                      /* Ink's glyphs */
    hexLin("#F4F7FF", pal, 40);                      /* Ink's outline */
    hexLin("#4E5D78", pal, 44);                      /* Moonlight's glyphs */
  }
  function fillWorld(ws, w) {
    w = w || DEFAULT_WORLD;
    ws.id = w.id || "dawn";
    var Wd = root.Worlds, idx = -1;
    if (Wd && Wd.list) for (var i = 0; i < Wd.list.length; i++) if (Wd.list[i] === w || Wd.list[i].id === ws.id) { idx = i; break; }
    if (idx < 0) idx = Math.max(0, (w.n | 0) - 1);
    ws.idx = idx;
    ws.pattern = WALL_PATTERN[ws.id] !== undefined ? WALL_PATTERN[ws.id] : (idx % 10);
    var sky = w.sky || DEFAULT_WORLD.sky;
    var Sy = root.Sky, su = null;
    if (Sy && typeof Sy.uniforms === "function") { try { su = Sy.uniforms(w); } catch (e) { su = null; } }
    if (su && su.top && su.horizon) {
      ws.top[0] = su.top[0]; ws.top[1] = su.top[1]; ws.top[2] = su.top[2];
      ws.hor[0] = su.horizon[0]; ws.hor[1] = su.horizon[1]; ws.hor[2] = su.horizon[2];
    } else { hexLin(sky.top, ws.top, 0); hexLin(sky.horizon, ws.hor, 0); }
    hexLin(w.wall || DEFAULT_WORLD.wall, ws.wall, 0);
    hexLin(w.key || DEFAULT_WORLD.key, ws.key, 0);
    hexLin(w.rim || DEFAULT_WORLD.rim, ws.rim, 0);
    var pt = w.particle || DEFAULT_WORLD.particle;
    hexLin(pt.color || "#FFFFFF", ws.pcol, 0);
    ws.pkind = PARTICLE_KIND[pt.kind] !== undefined ? PARTICLE_KIND[pt.kind] : 0;
    ws.pdir = pt.dir < 0 ? -1 : 1;
    ws.pdrift = num(pt.drift, 0.4); ws.psize = num(pt.size, 0.5);
    ws.motion = num(w.motion, 1);
  }
  function copyWorld(d, s) {
    d.idx = s.idx; d.id = s.id; d.pattern = s.pattern; d.pkind = s.pkind; d.pdir = s.pdir;
    d.pdrift = s.pdrift; d.psize = s.psize; d.motion = s.motion;
    for (var i = 0; i < 3; i++) {
      d.wall[i] = s.wall[i]; d.key[i] = s.key[i]; d.rim[i] = s.rim[i];
      d.top[i] = s.top[i]; d.hor[i] = s.hor[i]; d.pcol[i] = s.pcol[i];
    }
  }
  function domWorld() { return wMix >= 0.5 ? WB : WA; }

  /* ================================================================
     what is happening: clocks and effects
     ================================================================ */
  var now = 0, fxNow = 0, hitUntil = 0, paused = false, frameDt = 1 / 60;
  var skyDirty = true, skyLast = -1e9, partHalf = 1;
  var danger = 0, dangerS = 0;

  /* the strongest effect in flight, so that effects never add up */
  var major = { E: 0, t0: -1e9, dur: 0, base: 0 };
  function claim(E, dur) {
    var live = fxNow < major.t0 + major.dur;
    if (live && E <= major.E) {
      /* absorbed: the stronger effect already playing lasts a fifth
         longer instead, once, however many smaller ones land on it */
      if (major.dur < major.base * 1.19) { major.dur = major.base * 1.2; stretchLead(1.2); }
      return false;
    }
    major.E = E; major.t0 = fxNow; major.base = dur; major.dur = live ? dur * 1.2 : dur;
    return true;
  }
  function stretchLead(k) {
    var i;
    for (i = 0; i < bands.length; i++) if (bands[i].on && Math.abs(bands[i].t0 - major.t0) < 1e-6) bands[i].fall *= k;
    for (i = 0; i < ribbons.length; i++) if (ribbons[i].on && Math.abs(ribbons[i].t0 - major.t0) < 1e-6) ribbons[i].dur *= k;
    if (Math.abs(swell.t0 - major.t0) < 1e-6) swell.tail *= k;
  }

  /* the flash governor (brief §8.4.1): pulses that would change
     luminance by 0.08 or more queue for one of two places per rolling
     second, and must rise and fall over 400 ms or longer; the rest are
     turned down below the threshold, where they are colour, not flash */
  var govT = new Float64Array(8), govN = 0;
  function govern(dL, riseMs, fallMs) {
    if (dL < 0.08) return dL;
    var k = 0, i;
    for (i = 0; i < govN; i++) if (now - govT[i] < 1.0) govT[k++] = govT[i];
    govN = k;
    if (govN < 2 && riseMs + fallMs >= 400 && riseMs >= 150) {
      govT[govN++] = now;
      R.stats.flashGranted++;
      return dL;
    }
    R.stats.flashDenied++;
    return 0.072;
  }

  function juiceK() { return O.steady ? 0.5 : (PRESET[O.juice] || 1); }
  function kickK() {
    if (O.motion !== "full" || O.steady) return 0;
    return clamp(O.nudge, 0, 1) * (PRESET[O.juice] || 1);
  }
  function hitK() { return O.steady ? 0 : 1; }
  function motionFull() { return O.motion === "full"; }

  /* the kick: one push in one direction, sprung home (no random shake) */
  var kick = { px: 0, rot: 0, t0: -1e9 };
  function startKick(px, rotDeg, sign) {
    var k = kickK();
    if (k <= 0 || (px <= 0 && rotDeg <= 0)) return;
    kick.px = px * k; kick.rot = rotDeg * (sign || 1) * Math.min(1, k); kick.t0 = fxNow;
  }
  function kickShape(t) { if (t < 0 || t > 0.3) return 0; var w = t / 0.024; return w * Math.exp(1 - w); }
  function hitStop(ms) {
    ms = Math.min(120, ms * hitK());
    if (ms > 0) hitUntil = Math.max(hitUntil, now + ms / 1000);
  }
  /* a bloom swell that peaks on the music's note (ev.sync) */
  var swell = { amp: 0, t0: -1e9, peak: 0.1, tail: 0.28 };
  function startSwell(amp, sync) {
    swell.amp = Math.max(swell.amp * Math.max(0, 1 - (fxNow - swell.t0) / 0.8), amp);
    swell.t0 = fxNow; swell.peak = clamp(sync || 0, 0.06, 0.25); swell.tail = 0.28;
  }
  function swellNow() {
    var t = fxNow - swell.t0;
    if (t < 0 || t > swell.peak + swell.tail * 3.4) return 0;
    return swell.amp * (t < swell.peak ? smooth(t / swell.peak) : Math.exp(-(t - swell.peak) / swell.tail));
  }

  /* ---------- particles ---------- */
  function spawnP(x, y, vx, vy, ax, ay, born, life, size, kind, r, g, b, a, sway) {
    var cap = particleCap();
    if (cap <= 0) return;
    if (O.motion === "gentle") { vx = 0; vy = 0; ax = 0; ay = 0; sway = 0; life = 0.3; }
    if (pHead >= cap) pHead = 0;
    var i = pHead, o = i * 16;
    pHead = (pHead + 1) % cap;
    pData[o] = x; pData[o + 1] = y; pData[o + 2] = sway; pData[o + 3] = size;
    pData[o + 4] = vx; pData[o + 5] = vy; pData[o + 6] = ax; pData[o + 7] = ay;
    pData[o + 8] = born; pData[o + 9] = life; pData[o + 10] = rnd(); pData[o + 11] = kind;
    pData[o + 12] = r; pData[o + 13] = g; pData[o + 14] = b; pData[o + 15] = a;
    if (i < pLo) pLo = i;
    if (i > pHi) pHi = i;
  }
  /* how many particles an effect gets, after the preset, the motion
     setting and the tier have had their say */
  function pCount(n) {
    if (O.motion === "still") return 0;
    var k = juiceK() * (O.motion === "gentle" ? 0.2 : 1);
    var c = Math.round(n * k);
    return Math.min(c, Math.floor(particleCap() * 0.5));
  }
  var warmP = [0, 0, 0];
  /* the world's clear particles, a little warmer for each Ripple step */
  function worldBurst(x0, y0, w, h, n, born, spread, warmth, upward) {
    var ws = domWorld();
    var kind = ws.pkind, dir = upward ? 1 : ws.pdir;
    var wm = clamp(warmth, 0, 0.45);
    warmP[0] = mixf(ws.pcol[0], 1.0, wm); warmP[1] = mixf(ws.pcol[1], 0.78, wm); warmP[2] = mixf(ws.pcol[2], 0.5, wm);
    for (var i = 0; i < n; i++) {
      var x = x0 + rnd() * w, y = y0 + rnd() * h;
      var sp = 0.6 + rnd() * 1.6;
      var vx = (rnd() - 0.5) * 2.2 * spread, vy = dir * sp * (0.6 + 0.6 * rnd());
      var size = (0.07 + ws.psize * 0.12) * (0.6 + rnd() * 0.8);
      spawnP(x, y, vx, vy, -vx * 0.4, dir * 0.35, born + rnd() * 0.08, 0.9 + rnd() * 1.0, size, kind,
             warmP[0] * 2.2, warmP[1] * 2.2, warmP[2] * 2.2, 0.9, ws.pdrift * 0.25);
    }
  }
  var ambT = 0;
  function ambient(dt) {
    /* a few motes in the light of the shaft, like dust in a sunbeam */
    if (!motionFull() || !TT().live) return;
    ambT += dt;
    var every = 0.45;
    while (ambT > every) {
      ambT -= every;
      var ws = domWorld();
      spawnP(0.4 + rnd() * 9.2, rnd() * 21, (rnd() - 0.5) * 0.12, ws.pdir * (0.08 + rnd() * 0.12), 0, 0,
             fxNow, 7 + rnd() * 5, 0.05 + rnd() * 0.05, 0, ws.key[0] * 0.5, ws.key[1] * 0.5, ws.key[2] * 0.5, 0.4, 0.15);
    }
  }

  /* ---------- the piece in hand ---------- */
  var A = {
    on: false, type: 0, rot: 0, x: 0, y: 0, tx: 0, ty: 0, px: 0, py: 0,
    yFrom: 0, yTo: 0, yT0: -1e9, yDur: 0.08,
    ang0: 0, angT0: -1e9, angDur: 0.075, tilt: 0,
    glintT0: -1e9, glintAmp: 0, bumpT0: -1e9, bumpDir: 0, bumpRot: 0,
    enterT0: -1e9, enterX: 0, enterY: 0, enterS: 1, enterDur: 0.09,
    ox: new Float32Array(4), oy: new Float32Array(4), key: new Uint8Array(4), n: 0,
    bcx: 0, bcy: 0
  };
  var spawnFlag = false, enterFrom = 0, hardFlag = false;
  var rotDir = 0, rotKick = 0, rotPending = false, bumpPending = 0, lastMoveDir = 1;
  var lastFallT = -1e9, fallInt = 0.5;
  function noteFall(rows) {
    var dt = now - lastFallT;
    lastFallT = now;
    if (dt > 0 && dt < 2) fallInt = mixf(fallInt, dt / Math.max(1, rows), 0.5);
  }

  /* ---------- previews and Keep ---------- */
  var qCur = new Uint8Array(8), qN = 0, qShiftT0 = -1e9;
  var flyer = { on: false, t0: -1e9, type: 0, fx: 0, fy: 0, fa: 0, fs: 1 };
  var nicheGlow = 0, nicheFlash = 0;

  /* ---------- clears, dissolves, settling ---------- */
  var fcX = new Float32Array(FXC), fcY = new Float32Array(FXC), fcV = new Uint8Array(FXC), fcKey = new Uint8Array(FXC);
  var fcT0 = new Float32Array(FXC), fcDur = new Float32Array(FXC), fcSink = new Float32Array(FXC);
  var fcGlow = new Float32Array(FXC), fcSweepY = new Uint8Array(FXC), fcOn = new Uint8Array(FXC), fcHead = 0;
  function fxCell(x, y, v, key, t0, dur, sink, glow, sweepY) {
    for (var tries = 0; tries < FXC; tries++) {
      var i = fcHead; fcHead = (fcHead + 1) % FXC;
      if (!fcOn[i] || tries === FXC - 1) {
        fcOn[i] = 1; fcX[i] = x; fcY[i] = y; fcV[i] = v; fcKey[i] = key; fcT0[i] = t0; fcDur[i] = dur;
        fcSink[i] = sink; fcGlow[i] = glow; fcSweepY[i] = sweepY ? 1 : 0;
        return;
      }
    }
  }
  /* bands of light over cleared rows; the Quad band; the Empty Well */
  var bands = []; for (var bi0 = 0; bi0 < 6; bi0++) bands.push({ on: false, t0: 0, y: 0, h: 0.75, amp: 0, rise: 0.2, fall: 0.5, lift: 0 });
  function band(y, h, amp, rise, fall, lift) {
    for (var i = 0; i < bands.length; i++) if (!bands[i].on || i === bands.length - 1) {
      var b = bands[i];
      b.on = true; b.t0 = fxNow; b.y = y; b.h = h; b.amp = amp; b.rise = rise; b.fall = fall; b.lift = lift;
      return;
    }
  }
  var emptyFx = { t0: -1e9, amp: 0 };
  var shimmer = { t0: -1e9, amp: 0 };
  function shimmerStart(a) { shimmer.t0 = fxNow; shimmer.amp = a; }
  var reactFx = { t0: -1e9, amp: 0 };
  var unbroken = 0, unbrokenTarget = 0;
  var rings = []; for (var ri0 = 0; ri0 < 4; ri0++) rings.push({ x: 0, y: 0, t0: -1e9, amp: 0 });
  var ringHead = 0;
  var trails = []; for (var ti0 = 0; ti0 < 8; ti0++) trails.push({ t0: -1e9, x: 0, y0: 0, y1: 0, amp: 0 });
  var trailHead = 0, softT0 = -1e9;
  var ribbons = []; for (var rb0 = 0; rb0 < 4; rb0++) ribbons.push({ on: false, t0: 0, dur: 0.5, kind: 0, cx: 0, cy: 0, rx: 1, ry: 1, w: 0.08, turns: 1, rate: 8, phase: 0, swing: 0.8, amp: 1 });
  function ribbon(kind, cx, cy, rx, ry, w, turns, rate, dur, amp, swing) {
    for (var i = 0; i < ribbons.length; i++) if (!ribbons[i].on || i === ribbons.length - 1) {
      var r = ribbons[i];
      r.on = true; r.t0 = fxNow; r.kind = kind; r.cx = cx; r.cy = cy; r.rx = rx; r.ry = ry; r.w = w;
      r.turns = turns; r.rate = rate; r.dur = dur; r.amp = amp; r.phase = rnd() * 6.28; r.swing = swing;
      return;
    }
  }
  var squash = { pid: -1, t0: -1e9, x: 0, y: 0, cleared: false };
  var lastLockX = 5, lastLockY = 5;
  /* the stack's display offset per row, in rows: after a clear the rows
     above hold their place a moment and then spring down; after a drain
     they settle over a second and a half; silt pushes them up */
  var SET_NONE = 0, SET_CLEAR = 1, SET_DRAIN = 2, SET_SILT = 3;
  var setl = { kind: SET_NONE, t0: 0, hold: 0, off0: new Float32Array(ROWS) };
  function settleCurve(t) {
    if (setl.kind === SET_NONE || O.motion !== "full") return 0;
    if (setl.kind === SET_CLEAR) {
      if (t < setl.hold) return 1;
      var u = (t - setl.hold) / 0.11;
      if (u >= 1.35) return 0;
      return Math.exp(-5.2 * u) * Math.cos(u * 2.5);
    }
    if (setl.kind === SET_DRAIN) { if (t >= 1.5) return 0; return Math.exp(-t / 0.3) * (1 - smooth(t / 1.5)); }
    if (t >= 0.35) return 0;
    return 1 - easeOut3(t / 0.35);
  }
  function evalRows(out) {
    var f = settleCurve(fxNow - setl.t0);
    for (var y = 0; y < ROWS; y++) out[y] = setl.off0[y] * f;
    if (f === 0 && setl.kind !== SET_NONE && fxNow - setl.t0 > 0.05) setl.kind = SET_NONE;
  }
  function releaseHold() {
    if (setl.kind === SET_CLEAR) {
      var t = fxNow - setl.t0;
      if (t < setl.hold) setl.hold = Math.max(0.035, t);
    }
  }
  var endFx = { on: false, t0: -1e9, surface: false, amp: 0, done: false };
  var rise = 0, riseT0 = -1e9;
  var breathOn = false, breathPhase = 0, breatheExt = -1, breatheT = -1e9;
  var beads = new Float32Array(20), beadsShown = 0;
  var chapterT0 = -1e9;

  /* ---------- the mirror: our own copy of the board, so a drain can
     show the rows it took away ---------- */
  function stampMirror(cells, v, pid) {
    if (!cells) return;
    for (var i = 0; i < cells.length; i++) {
      var x = cellX(cells[i]), y = cellY(cells[i]);
      if (x >= 0 && x < W && y >= 0 && y < ROWS) { mirB[y * W + x] = v; mirP[y * W + x] = pid; }
    }
  }
  /* fuse a set of cells held in tmpGrid (pid, or -1 for empty) */
  function sameTmp(p, v, y, xx, yy) {
    if (xx < 0 || xx >= W || yy < 0 || yy >= ROWS) return false;
    var j = yy * W + xx;
    if (tmpGrid[j] < 0) return false;
    if (p > 0) return tmpGrid[j] === p;
    return tmpGrid[j] === 0 && tmpV[j] === v && yy === y;
  }
  function keyIn(x, y) {
    var i = y * W + x, p = tmpGrid[i], v = tmpV[i], k = 0;
    if (sameTmp(p, v, y, x, y + 1)) k |= 1;
    if (sameTmp(p, v, y, x + 1, y)) k |= 2;
    if (sameTmp(p, v, y, x, y - 1)) k |= 4;
    if (sameTmp(p, v, y, x - 1, y)) k |= 8;
    if (sameTmp(p, v, y, x + 1, y + 1)) k |= 16;
    if (sameTmp(p, v, y, x + 1, y - 1)) k |= 32;
    if (sameTmp(p, v, y, x - 1, y - 1)) k |= 64;
    if (sameTmp(p, v, y, x - 1, y + 1)) k |= 128;
    return k;
  }
  function clearTmp() { for (var i = 0; i < W * ROWS; i++) tmpGrid[i] = -1; }

  /* ================================================================
     events
     ================================================================ */
  function onSpawn() {
    spawnFlag = true;
    if (!enterFrom) enterFrom = 1;
    releaseHold();
  }
  function onHard(ev) {
    hardFlag = true;
    var cells = ev.cells, rows = ev.rows || 0;
    if (cells && cells.length) {
      /* a streak of light where the piece passed, per column */
      if (rows > 0) for (var i = 0; i < cells.length; i++) {
        var x = cellX(cells[i]), y = cellY(cells[i]), top = true;
        for (var j = 0; j < cells.length; j++) if (cellX(cells[j]) === x && cellY(cells[j]) > y) top = false;
        if (!top) continue;
        var tr = trails[trailHead]; trailHead = (trailHead + 1) % trails.length;
        tr.t0 = fxNow; tr.x = x + 0.5; tr.y0 = y + 1; tr.y1 = y + 1 + rows; tr.amp = 1;
      }
      /* dust where it lands */
      var n = pCount(8), ws = domWorld();
      for (var k = 0; k < n; k++) {
        var c = cells[(rnd() * cells.length) | 0], cx = cellX(c), cy = cellY(c);
        var low = true;
        for (var q = 0; q < cells.length; q++) if (cellX(cells[q]) === cx && cellY(cells[q]) < cy) low = false;
        if (!low) continue;
        var side = rnd() < 0.5 ? -1 : 1;
        spawnP(cx + 0.5 + side * 0.4 * rnd(), cy + 0.04, side * (0.7 + rnd() * 0.9), 0.25 + rnd() * 0.5, -side * 0.9, -1.2,
               fxNow, 0.45 + rnd() * 0.25, 0.05 + rnd() * 0.04, 0,
               ws.key[0] * 0.9, ws.key[1] * 0.85, ws.key[2] * 0.8, 0.8, 0);
      }
    }
    if (claim(1, 0.3)) startKick(3, 0, 1);
  }
  function onLock(ev) {
    var cells = ev.cells, v = tix(ev.type);
    stampMirror(cells, v, ev.pid || 0);
    if (!cells || !cells.length) return;
    var sx = 0, sy = 0, miny = 99;
    for (var i = 0; i < cells.length; i++) { sx += cellX(cells[i]) + 0.5; sy += cellY(cells[i]) + 0.5; miny = Math.min(miny, cellY(cells[i])); }
    sx /= cells.length; sy /= cells.length;
    lastLockX = sx; lastLockY = sy;
    if (ev.pid) { squash.pid = ev.pid; squash.t0 = fxNow; squash.x = sx; squash.y = miny; squash.cleared = false; }
    var r = rings[ringHead]; ringHead = (ringHead + 1) % rings.length;
    r.x = sx; r.y = sy; r.t0 = fxNow; r.amp = O.motion === "still" ? 0 : 1;
    claim(0.6, 0.2);
  }
  function baseLabel(s) {
    if (typeof s !== "string") return "Single";
    var k = s.indexOf(" ·");
    return k > 0 ? s.slice(0, k) : s;
  }
  function onClear(ev) {
    var rows = ev.rows || [], n = ev.n || rows.length, cells = ev.cells || [], i, y;
    if (!n) return;
    var label = baseLabel(ev.label);
    var L = LADDER[label] || (n >= 4 ? LADDER.Quad : (n === 3 ? LADDER.Triple : (n === 2 ? LADDER.Double : LADDER.Single)));
    var E = L.E, parts = L.n, kpx = L.kick, rot = L.rot, hit = L.hit;
    var twist = ev.twist === "full" || ev.twist === "mini";
    if (ev.empty) { E = EMPTY_FX.E; parts = EMPTY_FX.n; kpx = 0; rot = 0; hit = EMPTY_FX.hit; }
    if (ev.unbroken) { E += 0.5; parts *= 1.25; if (kpx) kpx += 1; }
    var rp = ev.ripple > 0 ? ev.ripple : 0;
    if (rp) { E += Math.min(1, 0.25 * rp); parts *= 1 + 0.1 * Math.min(rp, 10); if (kpx) kpx += Math.min(2, 0.5 * rp); }
    E = Math.min(5, E);
    var difficult = n >= 4 || twist;
    unbrokenTarget = difficult ? 1 : 0;
    var dur = 0.4 + E * 0.18;
    var lead = claim(E, dur);
    squash.cleared = true;

    var quad = n >= 4 && !twist;
    var minRow = 99, maxRow = -1;
    for (i = 0; i < ROWS; i++) clearedRow[i] = 0;
    for (i = 0; i < rows.length; i++) { y = rows[i]; if (y >= 0 && y < ROWS) { clearedRow[y] = 1; minRow = Math.min(minRow, y); maxRow = Math.max(maxRow, y); } }

    /* the cleared cells, fused among themselves, dissolving left to
       right (a Quad all at once, upward; a Twist behind its ribbon) */
    clearTmp();
    for (i = 0; i < cells.length; i++) {
      var c = cells[i], cx = cellX(c), cy = cellY(c);
      if (cx < 0 || cx >= W || cy < 0 || cy >= ROWS) continue;
      tmpGrid[cy * W + cx] = c.pid !== undefined ? c.pid : (mirP[cy * W + cx] || 0);
      tmpV[cy * W + cx] = c.v !== undefined ? c.v : (mirB[cy * W + cx] || 1);
    }
    var still = O.motion === "still";
    var sweep = twist ? 0.42 : (quad ? 0.0 : 0.08);
    var cellDur = still ? 0.15 : (quad ? 0.32 : 0.12);
    var start0 = still ? 0 : (quad ? 0.16 : 0.05);
    var glowCell = still ? 0 : 0.07 / 0.9;
    for (i = 0; i < W * ROWS; i++) {
      if (tmpGrid[i] < 0) continue;
      var x = i % W, yy = (i / W) | 0;
      fxCell(x, yy, tmpV[i], keyIn(x, yy), fxNow + start0 + sweep * (x / 9) + (quad ? (yy - minRow) * 0.03 : 0),
             cellDur, 0, glowCell, quad);
    }

    /* the rows above: hold, then spring down (released early the moment
       the next piece appears, so the stack is never untrue for long) */
    evalRows(rowOff);
    var yn = 0;
    for (var yo = 0; yo < ROWS; yo++) {
      if (clearedRow[yo]) continue;
      tmpOff[yn] = rowOff[yo] + (yo - yn);
      yn++;
    }
    for (; yn < ROWS; yn++) tmpOff[yn] = 0;
    for (i = 0; i < ROWS; i++) setl.off0[i] = tmpOff[i];
    setl.kind = SET_CLEAR; setl.t0 = fxNow; setl.hold = still ? 0 : (quad ? 0.26 : (twist ? 0.3 : 0.2));
    /* the mirror follows */
    yn = 0;
    for (yo = 0; yo < ROWS; yo++) {
      if (clearedRow[yo]) continue;
      for (x = 0; x < W; x++) { mirB[yn * W + x] = mirB[yo * W + x]; mirP[yn * W + x] = mirP[yo * W + x]; }
      yn++;
    }
    for (; yn < ROWS; yn++) for (x = 0; x < W; x++) { mirB[yn * W + x] = 0; mirP[yn * W + x] = 0; }

    /* light over the cleared rows: governed, because a row of light is a
       large-area change whatever the cell size (brief §8.4.1) */
    var jk = juiceK();
    if (!still) {
      if (quad) {
        var qa = govern(0.16 * Math.min(1.25, jk), 300, 900) / 0.9;
        band((minRow + maxRow + 1) * 0.5, 2.2, qa, 0.3, 0.9, 2.6);
      } else if (lead || !twist) {
        var ba = govern(0.12 * Math.min(1.25, jk), 200, 500) / 0.9;
        for (y = minRow; y <= maxRow; y++) if (clearedRow[y]) band(y + 0.5, 0.75, lead ? ba : Math.min(ba, 0.06), 0.2, 0.5, 0);
      }
    }
    /* particles, along the sweep */
    var np = pCount(parts * (lead ? 1 : 0.25));
    var warmth = 0.08 * Math.min(rp, 5);
    if (np > 0) {
      var perRow = Math.max(1, Math.round(np / n));
      for (y = minRow; y <= maxRow; y++) if (clearedRow[y]) {
        for (var k = 0; k < perRow; k++) {
          var fxp = rnd();
          worldBurst(fxp * 10, y + 0.1, 0, 0.8, 1, fxNow + start0 + sweep * fxp, ev.empty ? 0.6 : 1, warmth, quad);
        }
      }
    }
    if (!lead) return;
    hitStop(hit);
    startSwell(0.25 + 0.1 * E, ev.sync);
    if (kpx || rot) startKick(kpx, rot, rnd() < 0.5 ? -1 : 1);
    if (label === "Triple" || n === 3) shimmerStart(1);
    if (quad && !O.steady) { reactFx.t0 = fxNow; reactFx.amp = 1; }
    if (twist) {
      /* a twisting ribbon along each cleared row, and a spiral of
         particles round the T that made it */
      for (y = minRow; y <= maxRow; y++) if (clearedRow[y]) ribbon(1, 0, y + 0.5, 0, 0, 0.16, 1, 22, 0.6, 2.2, 0);
      if (n >= 2) {
        var arms = n >= 3 ? 1.6 : 1.1, cnt = pCount(n >= 3 ? 60 : 40), ws = domWorld();
        for (k = 0; k < cnt; k++) {
          var a = k * 0.42, sp = 1.2 + (k / Math.max(1, cnt)) * 2.6 * arms;
          spawnP(lastLockX, lastLockY, Math.cos(a) * sp, Math.sin(a) * sp, -Math.cos(a) * 0.8, -Math.sin(a) * 0.8,
                 fxNow + k * 0.006, 0.8 + rnd() * 0.4, 0.06 + rnd() * 0.04, 4,
                 mixf(ws.pcol[0], 1, 0.4) * 2.4, mixf(ws.pcol[1], 1, 0.4) * 2.4, mixf(ws.pcol[2], 1, 0.4) * 2.4, 0.9, 0);
        }
      }
      if (ev.twist === "mini" && n === 1) ribbon(0, lastLockX, lastLockY, 1.15, 1.15, 0.11, 1, 7, 0.5, 1.8, 0.75);
    }
    if (ev.empty) {
      /* stillness: one slow breath of light, and motes rising from the
         floor like lanterns; no kick */
      emptyFx.t0 = fxNow; emptyFx.amp = govern(0.075, 300, 900);
      var ne = pCount(200), w0 = domWorld();
      for (k = 0; k < ne; k++) {
        spawnP(0.3 + rnd() * 9.4, rnd() * 0.6, (rnd() - 0.5) * 0.25, 0.7 + rnd() * 1.6, 0, 0.25,
               fxNow + 0.12 + rnd() * 0.9, 2.2 + rnd() * 1.6, 0.08 + rnd() * 0.07, 0,
               mixf(w0.key[0], 1, 0.2) * 1.6, mixf(w0.key[1], 0.86, 0.2) * 1.5, mixf(w0.key[2], 0.6, 0.2) * 1.3, 0.8, 0.25);
      }
    }
  }
  function onTwist(ev) {
    var mini = ev.kind === "mini";
    var lead = claim(mini ? 1.5 : 2, 0.5);
    ribbon(0, lastLockX, lastLockY, 1.2, 1.2, mini ? 0.1 : 0.14, 1, 7, 0.6, mini ? 1.6 : 2.2, 0.75);
    var n = pCount(mini ? 8 : 16), ws = domWorld();
    for (var k = 0; k < n; k++) {
      var a = rnd() * 6.283;
      spawnP(lastLockX + Math.cos(a) * 1.1, lastLockY + Math.sin(a) * 0.7, Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0, 0,
             fxNow + rnd() * 0.3, 0.7, 0.05, 4, ws.pcol[0] * 2, ws.pcol[1] * 2, ws.pcol[2] * 2, 0.8, 0);
    }
    if (lead) { hitStop(30); startSwell(0.25, ev.sync); }
  }
  function onHold(ev) {
    /* the piece glides into the niche; whatever comes out glides from it */
    if (A.on) {
      flyer.on = true; flyer.t0 = fxNow; flyer.type = tix(ev.type) || A.type;
      flyer.fx = A.bcx; flyer.fy = A.bcy; flyer.fa = -A.rot * Math.PI / 2; flyer.fs = 1;
    }
    nicheFlash = 1;
    enterFrom = tix(ev.from) ? 2 : 1;
    spawnFlag = true;
    claim(0.3, 0.15);
  }
  function onDrain(ev) {
    var rows = ev.rows | 0;
    if (rows <= 0) return;
    /* the bottom strata dissolve and sink through the floor */
    clearTmp();
    for (var y = 0; y < rows && y < ROWS; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x;
      if (mirB[i]) { tmpGrid[i] = mirP[i]; tmpV[i] = mirB[i]; }
    }
    var still = O.motion === "still";
    for (y = 0; y < rows && y < ROWS; y++) for (x = 0; x < W; x++) {
      i = y * W + x;
      if (tmpGrid[i] < 0) continue;
      fxCell(x, y, tmpV[i], keyIn(x, y), fxNow + (still ? 0 : 0.05 * y), still ? 0.15 : 1.2, still ? 0 : rows + 1, 0.06, true);
    }
    evalRows(rowOff);
    for (y = 0; y < ROWS; y++) setl.off0[y] = (y + rows < ROWS ? rowOff[y + rows] : 0) + rows;
    setl.kind = SET_DRAIN; setl.t0 = fxNow; setl.hold = 0;
    for (y = 0; y < ROWS; y++) for (x = 0; x < W; x++) {
      var s = y + rows;
      mirB[y * W + x] = s < ROWS ? mirB[s * W + x] : 0;
      mirP[y * W + x] = s < ROWS ? mirP[s * W + x] : 0;
    }
  }
  function onSilt(ev) {
    var rows = ev.rows | 0;
    if (rows <= 0) return;
    evalRows(rowOff);
    for (var y = 0; y < ROWS; y++) setl.off0[y] = (y - rows >= 0 ? rowOff[y - rows] : 0) - rows;
    setl.kind = SET_SILT; setl.t0 = fxNow; setl.hold = 0;
  }
  function startEnd(surface) {
    endFx.on = true; endFx.done = false; endFx.t0 = fxNow; endFx.surface = surface;
    endFx.amp = govern(0.14, 600, 900) / 0.9;
    if (surface) { riseT0 = fxNow; }
    claim(3, 1.5);
  }
  function resetAll() {
    var i;
    endFx.on = false; endFx.done = false; rise = 0; riseT0 = -1e9;
    A.on = false; spawnFlag = false; enterFrom = 0; flyer.on = false;
    setl.kind = SET_NONE; major.E = 0; major.dur = 0; kick.t0 = -1e9; hitUntil = 0;
    for (i = 0; i < FXC; i++) fcOn[i] = 0;
    for (i = 0; i < bands.length; i++) bands[i].on = false;
    for (i = 0; i < ribbons.length; i++) ribbons[i].on = false;
    for (i = 0; i < rings.length; i++) rings[i].t0 = -1e9;
    for (i = 0; i < trails.length; i++) trails[i].t0 = -1e9;
    for (i = 0; i < MAXP; i++) pData[i * 16 + 9] = 0;
    pLo = 0; pHi = MAXP - 1;
    emptyFx.t0 = -1e9; shimmer.t0 = -1e9; reactFx.t0 = -1e9; swell.amp = 0;
    unbroken = 0; unbrokenTarget = 0; breathOn = false; breatheExt = -1;
    squash.pid = -1; paused = false;
  }

  R.fx = function (ev) {
    if (!ev || disposed) return;
    switch (ev.t) {
      case "spawn": onSpawn(ev); break;
      case "move": if (ev.dx) lastMoveDir = ev.dx < 0 ? -1 : 1; break;
      case "rotate":
        rotDir = ev.dir === "ccw" ? -1 : (ev.dir === "180" ? 2 : 1);
        rotKick = ev.kick ? 1 : 0; rotPending = true; break;
      case "bump": bumpPending = ev.what === "rotate" ? 2 : 1; break;
      case "fall": noteFall(ev.rows || 1); break;
      case "soft": noteFall(ev.rows || 1); softT0 = fxNow; break;
      case "hard": onHard(ev); break;
      case "lock": onLock(ev); break;
      case "clear": onClear(ev); break;
      case "twist": onTwist(ev); break;
      case "hold": onHold(ev); break;
      case "silt": onSilt(ev); break;
      case "drain": onDrain(ev); break;
      case "breath": breathOn = !!ev.on; break;
      case "rewind": spawnFlag = true; enterFrom = 0; break;
      case "start": resetAll(); break;
      case "pause": paused = true; break;
      case "resume": paused = false; break;
      case "world": if (ev.world) R.setWorld(ev.world, false); break;
      case "pb": shimmerStart(0.45); break;
      case "end": startEnd(false); break;
      case "surface": startEnd(true); break;
      case "breathe": breatheExt = clamp(+ev.phase || 0, 0, 1); breatheT = now; break;
      case "chapter": chapterT0 = fxNow; break;
    }
  };

  /* ================================================================
     each frame: follow the view
     ================================================================ */
  function pivotFor(type, x, y) {
    /* the SRS turning point: a cell's centre for J L S T Z, a corner for
       I and O (brief §3.3) */
    if (type === 1) { A.tx = x + 1; A.ty = y; }
    else if (type === 2) { A.tx = x + 1; A.ty = y + 1; }
    else { A.tx = x + 0.5; A.ty = y + 0.5; }
  }
  function currentAngle() {
    if (A.angT0 < -1e8) return 0;
    var u = (now - A.angT0) / A.angDur;
    if (u >= 1.4) { A.angT0 = -1e9; return 0; }
    /* a sprung quarter-turn: most of it in the first half, a breath of
       overshoot, settled by the end */
    return A.ang0 * Math.exp(-3.4 * u) * (Math.cos(2.2 * u) + 0.4 * Math.sin(2.2 * u));
  }
  function currentPy() {
    if (A.yT0 < -1e8) return A.ty;
    var u = (now - A.yT0) / A.yDur;
    if (u >= 1) { A.yT0 = -1e9; return A.ty; }
    return A.yFrom + (A.ty - A.yFrom) * easeOut3(u);
  }
  function blockedDir(view) {
    var b = view.board, act = view.active, L0 = false, R0 = false;
    if (!b || !act || !act.cells) return lastMoveDir;
    for (var i = 0; i < act.cells.length; i++) {
      var x = cellX(act.cells[i]), y = cellY(act.cells[i]);
      if (x - 1 < 0 || (y < ROWS && b[y * W + x - 1])) L0 = true;
      if (x + 1 >= W || (y < ROWS && b[y * W + x + 1])) R0 = true;
    }
    if (L0 && !R0) return -1;
    if (R0 && !L0) return 1;
    return lastMoveDir;
  }
  var tiltSign = 1;
  function trackActive(view, dt) {
    var act = view.active;
    if (!act || !act.cells || !act.cells.length || (endFx.on && endFx.done)) {
      A.on = false; hardFlag = false; rotPending = false; bumpPending = 0;
      return;
    }
    var type = tix(act.type), rot = act.rot | 0, x = act.x, y = act.y, i, j;
    pivotFor(type, x, y);
    var n = Math.min(4, act.cells.length);
    var mnx = 99, mxx = -99, mny = 99, mxy = -99;
    for (i = 0; i < n; i++) {
      var cx = cellX(act.cells[i]), cy = cellY(act.cells[i]);
      A.ox[i] = cx + 0.5 - A.tx; A.oy[i] = cy + 0.5 - A.ty;
      if (A.ox[i] < mnx) mnx = A.ox[i]; if (A.ox[i] > mxx) mxx = A.ox[i];
      if (A.oy[i] < mny) mny = A.oy[i]; if (A.oy[i] > mxy) mxy = A.oy[i];
      var k = 0;
      for (j = 0; j < n; j++) {
        if (j === i) continue;
        var dx = cellX(act.cells[j]) - cx, dy = cellY(act.cells[j]) - cy;
        if (dx === 0 && dy === 1) k |= 1; else if (dx === 1 && dy === 0) k |= 2;
        else if (dx === 0 && dy === -1) k |= 4; else if (dx === -1 && dy === 0) k |= 8;
        else if (dx === 1 && dy === 1) k |= 16; else if (dx === 1 && dy === -1) k |= 32;
        else if (dx === -1 && dy === -1) k |= 64; else if (dx === -1 && dy === 1) k |= 128;
      }
      A.key[i] = k;
    }
    var bxo = (mnx + mxx) * 0.5, byo = (mny + mxy) * 0.5;
    var full = motionFull();
    var fresh = !A.on || spawnFlag || type !== A.type;
    if (fresh) {
      A.px = A.tx; A.py = A.ty; A.yT0 = -1e9; A.angT0 = -1e9; A.bumpT0 = -1e9; A.glintT0 = -1e9; A.enterT0 = -1e9;
      if (full) {
        var sx = 0, sy = 0, ss = 0;
        if (enterFrom === 2 && keepSlot) { sx = keepSlot.x; sy = keepY(type); ss = keepSlot.s; }
        else if (enterFrom === 1 && slots.length && O.previews > 0) { sx = slots[0].x; sy = slots[0].y; ss = slots[0].s; }
        if (ss > 0) { A.enterT0 = now; A.enterX = sx - bxo * ss; A.enterY = sy - byo * ss; A.enterS = ss; }
      }
      spawnFlag = false; enterFrom = 0; rotPending = false; hardFlag = false;
    } else {
      if (rot !== A.rot && type !== 2) {
        var d = rotPending ? rotDir : (((rot - A.rot + 4) % 4) === 1 ? 1 : ((((rot - A.rot + 4) % 4) === 3) ? -1 : 2));
        if (full) {
          A.ang0 = currentAngle() + (d === 2 ? Math.PI : d * Math.PI / 2);
          A.angT0 = now; A.angDur = d === 2 ? 0.095 : 0.075;
          tiltSign = d === -1 ? -1 : 1;
          A.glintT0 = now; A.glintAmp = rotKick ? 1 : 0.5;
        }
      }
      rotPending = false;
      if (y !== A.y) {
        if (hardFlag || !full) { A.yT0 = -1e9; }
        else {
          A.yFrom = A.py;
          A.yT0 = now;
          A.yDur = y < A.y ? clamp(Math.min(0.09, 0.5 * fallInt), 0, 0.09) : 0.06;
          if (A.yDur < 0.012) A.yT0 = -1e9;
        }
      }
      hardFlag = false;
    }
    if (bumpPending) {
      if (full) { A.bumpT0 = now; A.bumpRot = bumpPending === 2 ? 1 : 0; A.bumpDir = blockedDir(view); }
      bumpPending = 0;
    }
    A.on = true; A.type = type; A.rot = rot; A.x = x; A.y = y; A.n = n;
    if (full) {
      A.px += (A.tx - A.px) * (1 - Math.exp(-dt / 0.015));
      if (Math.abs(A.tx - A.px) < 2e-4) A.px = A.tx;
    } else A.px = A.tx;
    A.py = currentPy();
    A.bcx = A.px + bxo; A.bcy = A.py + byo;
  }
  var qNew = new Uint8Array(8);
  function trackQueue(view) {
    var q = view.queue, n = q ? Math.min(6, q.length) : 0, i, changed = n !== qN;
    for (i = 0; i < n; i++) { qNew[i] = tix(q[i]); if (qNew[i] !== qCur[i]) changed = true; }
    if (!changed) return;
    var shifted = qN > 1 && n > 1;
    for (i = 0; i < n - 1 && shifted; i++) if (qNew[i] !== qCur[i + 1]) shifted = false;
    for (i = 0; i < 8; i++) qCur[i] = i < n ? qNew[i] : 0;
    qN = n;
    if (shifted && motionFull()) qShiftT0 = now;
  }

  /* the slow state: fades, glows, the danger, the beads */
  function stepState(view, dt) {
    var k;
    if (wMix < 1) {
      wMix = wDur > 0 ? sat((now - wT0) / wDur) : 1;
      if (wMix >= 1) { copyWorld(WA, WB); wMix = 1; }
      skyDirty = true;
    }
    var e = smooth(wMix);
    for (k = 0; k < 3; k++) {
      cur.wall[k] = mixf(WA.wall[k], WB.wall[k], e); cur.key[k] = mixf(WA.key[k], WB.key[k], e);
      cur.rim[k] = mixf(WA.rim[k], WB.rim[k], e); cur.top[k] = mixf(WA.top[k], WB.top[k], e);
      cur.hor[k] = mixf(WA.hor[k], WB.hor[k], e);
      cur.envTop[k] = cur.hor[k] * 1.6 + cur.key[k] * 0.16 + 0.012;
      cur.envLow[k] = cur.top[k] * 0.8 + cur.wall[k] * 0.025;
    }
    var dg = (view && typeof view.danger === "number") ? clamp(view.danger, 0, 1) : 0;
    if (endFx.on) dg = 0;
    dangerS += (dg - dangerS) * (1 - Math.exp(-dt / 1.2));
    /* the edges cool from about 70% full, fully by 85% */
    var dA = smooth((dangerS - 0.6) / 0.28);
    if (Math.abs(dA - danger) > 0.002) skyDirty = true;
    danger = dA;
    /* the niche: ready when there is a piece to keep and Keep is free */
    var ready = view && view.keep && view.active && !view.holdUsed && !view.over ? 1 : 0;
    nicheGlow += (ready - nicheGlow) * (1 - Math.exp(-dt / 0.14));
    nicheFlash *= Math.exp(-dt / 0.25);
    unbroken += (unbrokenTarget - unbroken) * (1 - Math.exp(-dt / (unbrokenTarget > unbroken ? 0.2 : 0.25)));
    /* breath: beads fill as charge arrives; the ring breathes 4 s in, 6 s out */
    var br = view ? view.breath : null;
    beadsShown = br ? 1 : 0;
    var charge = br ? clamp(br.charge | 0, 0, 20) : 0;
    for (k = 0; k < 20; k++) beads[k] += ((k < charge ? 1 : 0) - beads[k]) * (1 - Math.exp(-dt / 0.3));
    breathPhase = (br && br.active) ? clamp(+br.phase || 0, 0, 1) : -1;
    if (breatheExt >= 0 && now - breatheT > 0.6) breatheExt = -1;
    /* the run ends: once the stack has risen into light, it is gone */
    if (endFx.on && !endFx.done && fxNow - endFx.t0 > 1.6) endFx.done = true;
    if (endFx.on && endFx.surface) rise = 26 * easeInOut((fxNow - riseT0) / 4.0);
    if (endFx.on && view && view.board && !anyFilled(view.board) && !view.over && fxNow - endFx.t0 > 2) { endFx.on = false; endFx.done = false; rise = 0; }
  }
  function anyFilled(b) { for (var i = 0; i < W * VIS; i++) if (b[i]) return true; return false; }
  function breathCurve(p) { return p < 0.4 ? smooth(p / 0.4) : 1 - smooth((p - 0.4) / 0.6); }

  /* ================================================================
     bodies: build this frame's instances
     ================================================================ */
  function inst(layer, variant, px, py, pz, ang, ox, oy, sx, sy, col, glow, dis, flags, tx, ty, sc, seed) {
    if (instN >= MAXI) return;
    var o = instN * 16;
    instTmp[o] = px; instTmp[o + 1] = py; instTmp[o + 2] = pz; instTmp[o + 3] = ang;
    instTmp[o + 4] = ox; instTmp[o + 5] = oy; instTmp[o + 6] = sx; instTmp[o + 7] = sy;
    instTmp[o + 8] = col; instTmp[o + 9] = glow; instTmp[o + 10] = dis; instTmp[o + 11] = flags;
    instTmp[o + 12] = tx; instTmp[o + 13] = ty; instTmp[o + 14] = sc; instTmp[o + 15] = seed;
    instBucket[instN] = layer * NVAR + variant;
    instN++;
  }
  /* a whole piece, north-facing, centred on (cx, cy) at a scale: the
     previews, the kept piece and the piece flying into the niche */
  var SHAPE_KEY = [];
  (function () {
    for (var t = 0; t < 8; t++) {
      var ks = [0, 0, 0, 0], s = SHAPE0[t];
      if (s) for (var i = 0; i < 4; i++) {
        var k = 0;
        for (var j = 0; j < 4; j++) {
          if (i === j) continue;
          var dx = s[j][0] - s[i][0], dy = s[j][1] - s[i][1];
          if (dx === 0 && dy === 1) k |= 1; else if (dx === 1 && dy === 0) k |= 2;
          else if (dx === 0 && dy === -1) k |= 4; else if (dx === -1 && dy === 0) k |= 8;
          else if (dx === 1 && dy === 1) k |= 16; else if (dx === 1 && dy === -1) k |= 32;
          else if (dx === -1 && dy === -1) k |= 64; else if (dx === -1 && dy === 1) k |= 128;
        }
        ks[i] = k;
      }
      SHAPE_KEY.push(ks);
    }
  })();
  function shapeCentre(t, axis) {
    var s = SHAPE0[t], mn = 99, mx = -99;
    for (var i = 0; i < 4; i++) { var v = s[i][axis]; if (v < mn) mn = v; if (v > mx) mx = v; }
    return (mn + mx) * 0.5;
  }
  var SC_X = [0], SC_Y = [0];
  for (var sci = 1; sci < 8; sci++) { SC_X.push(shapeCentre(sci, 0)); SC_Y.push(shapeCentre(sci, 1)); }
  function pieceInst(t, cx, cy, cz, sc, ang, tx, ty, layer, glow) {
    if (t < 1 || t > 7 || sc <= 0.001) return;
    var s = SHAPE0[t];
    for (var i = 0; i < 4; i++) {
      inst(layer, VARIANT_OF[SHAPE_KEY[t][i]], cx, cy, cz, ang,
           s[i][0] - SC_X[t], s[i][1] - SC_Y[t], 1, 1, t, glow, 0, layer ? 1 : 0, tx, ty, sc, i * 0.37 + t);
    }
  }
  function stackKey(b, pa, x, y, i, v, pid) {
    var k = 0;
    if (pa && pid > 0) {
      if (y + 1 < ROWS && b[i + W] && pa[i + W] === pid) k |= 1;
      if (x + 1 < W && b[i + 1] && pa[i + 1] === pid) k |= 2;
      if (y > 0 && b[i - W] && pa[i - W] === pid) k |= 4;
      if (x > 0 && b[i - 1] && pa[i - 1] === pid) k |= 8;
      if ((k & 3) === 3 && b[i + W + 1] && pa[i + W + 1] === pid) k |= 16;
      if ((k & 6) === 6 && b[i - W + 1] && pa[i - W + 1] === pid) k |= 32;
      if ((k & 12) === 12 && b[i - W - 1] && pa[i - W - 1] === pid) k |= 64;
      if ((k & 9) === 9 && b[i + W - 1] && pa[i + W - 1] === pid) k |= 128;
    } else if (pa) {
      /* silt and preset rows fuse sideways into strata */
      if (x + 1 < W && b[i + 1] === v && !pa[i + 1]) k |= 2;
      if (x > 0 && b[i - 1] === v && !pa[i - 1]) k |= 8;
    }
    return k;
  }
  function buildInstances(view) {
    instN = 0;
    var b = view.board, pa = view.pid, x, y, i;
    var full = motionFull();
    evalRows(rowOff);
    /* the stack */
    if (b && !(endFx.on && endFx.done)) {
      var sqT = fxNow - squash.t0, sqOn = squash.pid > 0 && !squash.cleared && sqT >= 0 && sqT < 0.14 && full;
      var sqA = sqOn ? Math.exp(-sqT / 0.045) * Math.sin(Math.PI * 2 * sqT / 0.1) : 0;
      var endT = fxNow - endFx.t0, top = 0;
      if (endFx.on) { for (i = W * DRAW_ROWS - 1; i >= 0; i--) if (b[i]) { top = (i / W) | 0; break; } }
      for (y = 0; y < DRAW_ROWS; y++) {
        var oy = rowOff[y];
        for (x = 0; x < W; x++) {
          i = y * W + x;
          var v = b[i];
          if (!v) continue;
          var pid = pa ? pa[i] : 0;
          var key = stackKey(b, pa, x, y, i, v, pid);
          var flags = 0;
          if (v === 8) {
            if (x > 0 && !b[i - 1]) flags |= 2;
            if (x < W - 1 && !b[i + 1]) flags |= 4;
          }
          var glow = 0, dis = 0;
          if (endFx.on) {
            /* the stack rises into light, from the floor up */
            var st = 0.25 + (top > 0 ? y / top : 0) * 0.75;
            glow = endFx.amp * smooth(endT / 0.55);
            dis = O.motion === "still" ? sat(endT / 0.15) : sat((endT - st) / 0.45);
            flags |= 8;
          }
          var lay = endFx.on ? 2 : 0;
          if (sqOn && pid === squash.pid) {
            inst(lay, VARIANT_OF[key], squash.x, squash.y + oy, 0, 0, x + 0.5 - squash.x, y + 0.5 - squash.y,
                 1 + 0.012 * sqA, 1 - 0.025 * sqA, v, glow, dis, flags, 0, 0, 1, (i * 0.618) % 7);
          } else {
            inst(lay, VARIANT_OF[key], x + 0.5, y + 0.5 + oy, 0, 0, 0, 0, 1, 1, v, glow, dis, flags, 0, 0, 1, (i * 0.618) % 7);
          }
        }
      }
      if (endFx.on && !endFx.done && O.motion !== "still" && endT < 1.5) endMotes(b, endT, top);
    }
    /* cells dissolving into light */
    for (i = 0; i < FXC; i++) {
      if (!fcOn[i]) continue;
      var u = (fxNow - fcT0[i]) / fcDur[i];
      if (u >= 1) { fcOn[i] = 0; continue; }
      var prog = sat(u), g0 = fcGlow[i] * smooth((fxNow - fcT0[i] + 0.2) / 0.2);
      var sinkY = fcSink[i] > 0 ? fcSink[i] * easeInOut(prog) : 0;
      /* as it goes, a cell gives a little ground and lifts toward the
         way the world's particles travel */
      var shrink = fcSink[i] > 0 ? 1 : 1 - 0.14 * smooth(prog);
      var lift = fcSink[i] > 0 ? 0 : 0.12 * domWorld().pdir * smooth(prog);
      inst(u < 0 ? 0 : 2, VARIANT_OF[fcKey[i]], fcX[i] + 0.5, fcY[i] + 0.5 - sinkY + lift, 0, 0, 0, 0, shrink, shrink,
           fcV[i], g0, u < 0 ? 0 : Math.max(0.0006, prog), fcSweepY[i] ? 8 : 0, 0, 0, 1, (i * 0.37) % 5);
    }
    /* the piece in hand */
    if (A.on) {
      var ang = currentAngle(), tX = 0, tY = 0, sc = 1, ppx = A.px, ppy = A.py;
      if (full && TT().wobble && A.angT0 > -1e8) {
        var wu = (now - A.angT0) / A.angDur;
        var wob = wu < 1.4 ? Math.sin(Math.PI * Math.min(1, wu / 1.2)) * Math.exp(-0.6 * wu) : 0;
        tY = tiltSign * wob * 3 * Math.PI / 180; tX = wob * 1.2 * Math.PI / 180;
      }
      if (A.bumpT0 > -1e8) {
        var bt = now - A.bumpT0;
        if (bt < 0.06) {
          var bs = Math.sin(Math.PI * bt / 0.06);
          if (A.bumpRot) ang += bs * 0.035 * (rotDir === -1 ? -1 : 1);
          else ppx += A.bumpDir * bs / Math.max(pxPerCell / renderScale, 8);
        } else A.bumpT0 = -1e9;
      }
      if (A.enterT0 > -1e8) {
        var eu = (now - A.enterT0) / A.enterDur;
        if (eu < 1) {
          var ee = easeOut3(eu);
          sc = mixf(A.enterS, 1, ee);
          ppx = mixf(A.enterX + (A.px - A.bcx) * A.enterS, ppx, ee);
          ppy = mixf(A.enterY + (A.py - A.bcy) * A.enterS, ppy, ee);
        } else A.enterT0 = -1e9;
      }
      var glint = A.glintT0 > -1e8 ? A.glintAmp * Math.exp(-(now - A.glintT0) / 0.12) : 0;
      if (glint < 0.01) glint = 0;
      for (i = 0; i < A.n; i++) {
        inst(1, VARIANT_OF[A.key[i]], ppx, ppy, 0, ang, A.ox[i], A.oy[i], 1, 1, A.type, glint, 0, 1, tX, tY, sc, i * 0.31 + A.type);
      }
    }
    /* previews, drifting above the mouth; when a run ends they go with
       the stack */
    var gone = endFx.on ? 1 - easeInOut((fxNow - endFx.t0 - 0.2) / 0.7) : 1;
    var shown = gone > 0.001 ? Math.min(O.previews | 0, slots.length, qN) : 0;
    var su = qShiftT0 > -1e8 ? (now - qShiftT0) / 0.2 : 1;
    if (su >= 1) qShiftT0 = -1e9;
    var se = easeOut3(su);
    for (i = 0; i < shown; i++) {
      var sl = slots[i], fx0 = sl.x, fy0 = sl.y, fs0 = sl.s;
      if (su < 1) {
        if (i + 1 < slots.length) { fx0 = slots[i + 1].x; fy0 = slots[i + 1].y; fs0 = slots[i + 1].s; }
        else fs0 = 0;
      }
      var bob = full ? Math.sin(now * 0.55 + i * 1.3) * 0.05 : 0;
      var yawP = full ? Math.sin(now * 0.37 + i * 0.9) * 0.1 : 0;
      pieceInst(qCur[i], mixf(fx0, sl.x, se), mixf(fy0, sl.y, se) + bob, 0, mixf(fs0, sl.s, se) * gone, 0,
                full ? 0.05 : 0, yawP, 1, 0);
    }
    /* Keep: the kept piece in its niche, and the one flying there */
    var held = tix(view.hold);
    var fu = flyer.on ? (fxNow - flyer.t0) / 0.12 : 1;
    if (flyer.on && (fu >= 1 || !full || !keepSlot)) flyer.on = false;
    if (keepSlot && view.keep !== false) {
      if (flyer.on) {
        var fe = easeOut3(fu);
        pieceInst(flyer.type, mixf(flyer.fx, keepSlot.x, fe), mixf(flyer.fy, keepY(flyer.type), fe), mixf(0, keepSlot.z, fe),
                  mixf(1, keepSlot.s, fe), mixf(flyer.fa, 0, fe), 0, 0, 1, 0);
      } else if (held && gone > 0.001) {
        pieceInst(held, keepSlot.x, keepY(held), keepSlot.z, keepSlot.s * gone, 0, 0, 0, 1, 0);
      }
    }
    groupInstances();
  }
  function endMotes(b, endT, top) {
    /* rising light: a few motes leave each row as it goes */
    var ws = domWorld();
    var rate = pCount(160) / 1.2;
    var want = rate * frameDt;
    while (want > 0) {
      if (want < 1 && rnd() > want) break;
      want -= 1;
      var row = Math.floor(rnd() * (top + 1));
      var st = 0.25 + (top > 0 ? row / top : 0) * 0.75;
      if (endT < st || endT > st + 0.5) continue;
      var x = rnd() * 10;
      if (!b[row * W + Math.min(9, x | 0)]) continue;
      spawnP(x, row + rnd(), (rnd() - 0.5) * 0.3, 1.2 + rnd() * 1.8, 0, 0.8, fxNow, 1.2 + rnd() * 0.8,
             0.07 + rnd() * 0.05, 0, mixf(ws.key[0], 1, 0.3) * 1.8, mixf(ws.key[1], 0.9, 0.3) * 1.7, mixf(ws.key[2], 0.75, 0.3) * 1.5, 0.85, 0.2);
    }
  }
  function groupInstances() {
    var i;
    for (i = 0; i < NB; i++) bCount[i] = 0;
    for (i = 0; i < instN; i++) bCount[instBucket[i]]++;
    var acc = 0;
    for (i = 0; i < NB; i++) { bStart[i] = acc; bFill[i] = acc; acc += bCount[i]; }
    for (i = 0; i < instN; i++) {
      var d = bFill[instBucket[i]]++, so = i * 16, o = d * 16;
      for (var k = 0; k < 16; k++) instArr[o + k] = instTmp[so + k];
    }
  }

  /* ================================================================
     light: build this frame's sprites
     ================================================================ */
  function sprite(reg, cx, cy, cz, plane, hx, hy, shape, prm, r, g, b, a, p2, p3, layer, rot) {
    var lim = reg === 0 ? S_SHADOW : (reg === 1 ? S_FG : S_END);
    if (sprN[reg] >= lim || a <= 0.0005) return;
    var o = sprN[reg] * 16;
    spr[o] = cx; spr[o + 1] = cy; spr[o + 2] = cz; spr[o + 3] = plane;
    spr[o + 4] = hx; spr[o + 5] = hy; spr[o + 6] = shape; spr[o + 7] = prm;
    spr[o + 8] = r; spr[o + 9] = g; spr[o + 10] = b; spr[o + 11] = a;
    spr[o + 12] = p2; spr[o + 13] = p3; spr[o + 14] = layer; spr[o + 15] = rot;
    sprN[reg]++;
  }
  /* a hairline from one point to another, px device pixels wide */
  function hair(reg, x0, y0, x1, y1, z, px, r, g, b, a, fade0, layer) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-4) return;
    var w = (px + 2.5) / Math.max(pxPerCell, 1);
    sprite(reg, (x0 + x1) * 0.5, (y0 + y1) * 0.5, z, 0, w, len * 0.5, 3, px, r, g, b, a, fade0, 0, layer,
           Math.atan2(dy, dx) - Math.PI / 2);
  }
  function buildSprites(view) {
    sprN[0] = S_SCENE; sprN[1] = S_SHADOW; sprN[2] = S_FG;
    var i, k, t, kc = cur.key, wr = 1.0, wg = 0.945, wb = 0.87;
    var full = motionFull();
    /* the well sits on its own soft shadow */
    sprite(1, CX, (LIP_Y - FLOOR_T) * 0.5 - 0.45, BACK_Z - 0.3, 0, W * 0.5 + WALL_T + 1.6, (LIP_Y + FLOOR_T) * 0.5 + 1.6,
           9, 1.1, 0, 0, 0, 0.5, 1.4, 0, 0, 0);
    /* bands of light over cleared rows, and the Quad's rising band */
    for (i = 0; i < bands.length; i++) {
      var bd = bands[i];
      if (!bd.on) continue;
      t = fxNow - bd.t0;
      if (t > bd.rise + bd.fall) { bd.on = false; continue; }
      if (t < 0) continue;
      var env = t < bd.rise ? smooth(t / bd.rise) : 1 - smooth((t - bd.rise) / bd.fall);
      var yb = bd.y + bd.lift * easeOut3(t / (bd.rise + bd.fall));
      sprite(0, CX, yb, 0.06, 0, W * 0.5 + 0.25, bd.h, 5, 0, wr, wg, wb, bd.amp * env, 0, 0, 0, 0);
    }
    /* hard-drop trails */
    for (i = 0; i < trails.length; i++) {
      var tr = trails[i];
      t = fxNow - tr.t0;
      if (t < 0 || t > 0.14 || O.motion === "still") continue;
      var ta = (1 - t / 0.14) * 0.32 * Math.min(1.3, juiceK());
      sprite(0, tr.x, (tr.y0 + tr.y1) * 0.5, 0.04, 0, 0.4, (tr.y1 - tr.y0) * 0.5, 8, 0, kc[0], kc[1], kc[2], ta, 0, 0, 0, 0);
    }
    /* a faint streak above a soft-dropping piece */
    if (A.on && full && fxNow - softT0 < 0.15) {
      var sa = (1 - (fxNow - softT0) / 0.15) * 0.07;
      sprite(0, A.bcx, A.py + 2.2, 0.03, 0, 0.5, 1.6, 8, 0, kc[0], kc[1], kc[2], sa, 0, 0, 0, Math.PI);
    }
    /* the rim: Unbroken's gold filament, a Triple's shimmer, the breath ring */
    if (unbroken > 0.01) {
      hair(0, -WALL_T + 0.05, LIP_Y + 0.015, W + WALL_T - 0.05, LIP_Y + 0.015, 0.02, 1.6, 1.0, 0.72, 0.32, 1.6 * unbroken, 1, 0);
      sprite(0, CX, LIP_Y, 0.02, 0, W * 0.5 + WALL_T, 0.09, 1, 0.9, 1.0, 0.7, 0.3, 0.25 * unbroken, 0, 0, 0, 0);
    }
    t = fxNow - shimmer.t0;
    if (t >= 0 && t < 0.75 && O.motion !== "still") {
      var su = easeInOut(t / 0.75);
      var sx = -WALL_T + (W + 2 * WALL_T) * su;
      sprite(0, sx, LIP_Y, 0.03, 0, 0.7, 0.22, 0, 0, wr, wg, wb, shimmer.amp * Math.sin(Math.PI * t / 0.75) * 1.4, 0, 0, 0, 0);
    }
    var ringAmt = 0;
    if (breathPhase >= 0) ringAmt = breathCurve(breathPhase);
    if (breatheExt >= 0) ringAmt = Math.max(ringAmt, breathCurve(breatheExt));
    if (fxNow - chapterT0 < 2.4) ringAmt = Math.max(ringAmt, Math.sin(Math.PI * (fxNow - chapterT0) / 2.4) * 0.6);
    if (ringAmt > 0.005 || breathPhase >= 0) {
      /* a soft light hugging the rim, swelling outward on the in-breath
         (or, under reduced motion, only brightening) */
      var scl = full ? 1 + 0.01 * ringAmt : 1;
      var hx = (W * 0.5 + WALL_T + 0.04) * scl, hy = ((LIP_Y + FLOOR_T) * 0.5 + 0.04) * scl;
      var aR = (full ? 0.18 + 0.34 * ringAmt : 0.08 + 0.44 * ringAmt) * 0.75;
      /* the world's rim colour, softened a quarter toward the key light so
         it reads as light on the stone rather than a lit sign */
      sprite(0, CX, (LIP_Y - FLOOR_T) * 0.5, 0.05, 0, hx + 0.6, hy + 0.6, 7, 0.2,
             mixf(cur.rim[0], kc[0], 0.25), mixf(cur.rim[1], kc[1], 0.25), mixf(cur.rim[2], kc[2], 0.25), aR, 0.18, 0.6, 0, 0);
    }
    /* Breath beads: twenty pearls along the back of the mouth */
    if (beadsShown) {
      for (k = 0; k < 20; k++) {
        var lv = beads[k];
        var bx = 0.27 + k * (9.46 / 19);
        var ready2 = view && view.breath && view.breath.charge >= 10 ? 1 : 0;
        var br = 0.12 + lv * (1.1 + 0.25 * ready2);
        sprite(0, bx, VIS + 0.25, BACK_Z + 0.04, 0, 0.11, 0.11, 6, 0.25 + 0.75 * lv,
               mixf(0.55, kc[0], lv), mixf(0.58, kc[1], lv), mixf(0.62, kc[2], lv), br, lv * 0.5, 0, 0, 0);
      }
    }
    /* ---- the never-dimmed layer ---- */
    if (A.on && view.active) {
      var act = view.active, gh = view.ghost, b = view.board;
      var lt = SK.landing, cI = A.type * 4;
      var lr = mixf(kc[0], pal[cI], 0.18), lg = mixf(kc[1], pal[cI + 1], 0.18) * 0.96, lb = mixf(kc[2], pal[cI + 2], 0.18) * 0.88;
      var lmax = Math.max(lr, Math.max(lg, lb), 1e-3);
      lr /= lmax; lg /= lmax; lb /= lmax;
      if (O.landing && gh && gh.length) {
        var gx0 = 99, gx1 = -99, gy0 = 99, gy1 = -99;
        for (i = 0; i < gh.length; i++) {
          var gx = cellX(gh[i]), gy = cellY(gh[i]);
          if (gx < gx0) gx0 = gx; if (gx > gx1) gx1 = gx; if (gy < gy0) gy0 = gy; if (gy > gy1) gy1 = gy;
        }
        /* (1) light pools on the exact cells it will rest on */
        for (i = 0; i < gh.length; i++) {
          gx = cellX(gh[i]); gy = cellY(gh[i]);
          var lowest = true;
          for (k = 0; k < gh.length; k++) if (cellX(gh[k]) === gx && cellY(gh[k]) < gy) lowest = false;
          if (!lowest) continue;
          var supported = gy === 0 || (b && b[(gy - 1) * W + gx]);
          if (!supported) continue;
          sprite(2, gx + 0.5, gy - 0.3, 0.012, 0, 0.46, 0.3, 2, 0, lr, lg, lb, 0.75 * lt, 0, 0, 1, 0);
          sprite(2, gx + 0.5, gy + 0.015, -0.45, 1, 0.62, 0.62, 0, 0, lr, lg, lb, 0.8 * lt, 0, 0, 1, 0);
        }
        /* (2) two hairline rails from the piece's outer columns */
        var amin = 99;
        for (i = 0; i < act.cells.length; i++) amin = Math.min(amin, cellY(act.cells[i]));
        var dispBottom = amin + (A.py - A.ty);
        if (dispBottom - gy0 > 0.3) {
          hair(2, gx0 + 0.04, dispBottom, gx0 + 0.04, gy0, 0.01, 1.2, lr, lg, lb, 0.5 * lt, 0.15, 1);
          hair(2, gx1 + 0.96, dispBottom, gx1 + 0.96, gy0, 0.01, 1.2, lr, lg, lb, 0.5 * lt, 0.15, 1);
          /* (3) small ticks at the corners of the landing box */
          var tl = 0.22, ta2 = 0.85 * lt, x0 = gx0 + 0.04, x1 = gx1 + 0.96, y0 = gy0 + 0.04, y1 = gy1 + 0.96;
          hair(2, x0, y0, x0 + tl, y0, 0.012, 1.6, lr, lg, lb, ta2, 1, 1); hair(2, x0, y0, x0, y0 + tl, 0.012, 1.6, lr, lg, lb, ta2, 1, 1);
          hair(2, x1, y0, x1 - tl, y0, 0.012, 1.6, lr, lg, lb, ta2, 1, 1); hair(2, x1, y0, x1, y0 + tl, 0.012, 1.6, lr, lg, lb, ta2, 1, 1);
          hair(2, x0, y1, x0 + tl, y1, 0.012, 1.6, lr, lg, lb, ta2, 1, 1); hair(2, x0, y1, x0, y1 - tl, 0.012, 1.6, lr, lg, lb, ta2, 1, 1);
          hair(2, x1, y1, x1 - tl, y1, 0.012, 1.6, lr, lg, lb, ta2, 1, 1); hair(2, x1, y1, x1, y1 - tl, 0.012, 1.6, lr, lg, lb, ta2, 1, 1);
        }
      }
      /* the lock light: a thin light under the piece that drains as the
         lock timer runs, and the fifteen resets as pips */
      if (O.lockLight && gh && gh.length) {
        var am = 99, gm = 99;
        for (i = 0; i < act.cells.length; i++) am = Math.min(am, cellY(act.cells[i]));
        for (i = 0; i < gh.length; i++) gm = Math.min(gm, cellY(gh[i]));
        var lk = typeof view.lock === "number" ? clamp(view.lock, 0, 1) : 0;
        var used = typeof view.lockResets === "number" ? clamp(view.lockResets, 0, 15) : 0;
        if (am === gm && (lk > 0 || used > 0)) {
          var bx0 = 99, bx1 = -99;
          for (i = 0; i < act.cells.length; i++) if (cellY(act.cells[i]) === am) {
            bx0 = Math.min(bx0, cellX(act.cells[i])); bx1 = Math.max(bx1, cellX(act.cells[i]) + 1);
          }
          var off = A.px - A.tx, mid = (bx0 + bx1) * 0.5 + off, half = (bx1 - bx0) * 0.5 - 0.1;
          sprite(2, mid, am + 0.02, 0.02, 0, Math.max(0.02, half * (1 - lk)), 0.045, 1, 0.8, kc[0], kc[1], kc[2], 1.1, 0, 0, 1, 0);
          for (k = 0; k < 15; k++) {
            var on = k < 15 - used ? 1 : 0;
            sprite(2, mid + (k - 7) * 0.1, am - 0.1, 0.02, 0, 0.026, 0.026, 10, 0, kc[0], kc[1], kc[2], on ? 0.9 : 0.16, 0, 0, 1, 0);
          }
        }
      }
    }
    /* the lesson's target: an outline of where the piece should go */
    var tg = view.target;
    if (tg && tg.length) {
      var rr = cur.rim[0], rg2 = cur.rim[1], rb = cur.rim[2], m = Math.max(rr, rg2, rb, 1e-3);
      rr /= m; rg2 /= m; rb /= m;
      var pulse = full ? 0.8 + 0.2 * Math.sin(now * 0.6) : 0.9;
      for (i = 0; i < tg.length; i++) {
        var tx = cellX(tg[i]), ty = cellY(tg[i]);
        var hasN = false, hasE = false, hasS = false, hasW = false;
        for (k = 0; k < tg.length; k++) {
          var dx = cellX(tg[k]) - tx, dy = cellY(tg[k]) - ty;
          if (dx === 0 && dy === 1) hasN = true; if (dx === 1 && dy === 0) hasE = true;
          if (dx === 0 && dy === -1) hasS = true; if (dx === -1 && dy === 0) hasW = true;
        }
        var e0 = 0.05;
        if (!hasN) hair(2, tx + (hasW ? 0 : e0), ty + 1 - e0, tx + 1 - (hasE ? 0 : e0), ty + 1 - e0, 0.015, 2, rr, rg2, rb, pulse, 1, 1);
        if (!hasS) hair(2, tx + (hasW ? 0 : e0), ty + e0, tx + 1 - (hasE ? 0 : e0), ty + e0, 0.015, 2, rr, rg2, rb, pulse, 1, 1);
        if (!hasE) hair(2, tx + 1 - e0, ty + (hasS ? 0 : e0), tx + 1 - e0, ty + 1 - (hasN ? 0 : e0), 0.015, 2, rr, rg2, rb, pulse, 1, 1);
        if (!hasW) hair(2, tx + e0, ty + (hasS ? 0 : e0), tx + e0, ty + 1 - (hasN ? 0 : e0), 0.015, 2, rr, rg2, rb, pulse, 1, 1);
      }
    }
  }

  /* ================================================================
     the frame's shared uniforms
     ================================================================ */
  var KEY_DIR = [-0.38, 0.72, 0.58];
  (function () { var l = Math.sqrt(KEY_DIR[0] * KEY_DIR[0] + KEY_DIR[1] * KEY_DIR[1] + KEY_DIR[2] * KEY_DIR[2]); KEY_DIR[0] /= l; KEY_DIR[1] /= l; KEY_DIR[2] /= l; })();
  function writeFrame() {
    var full = motionFull(), t = TT();
    var amp = (full && t.breath && !paused) ? (O.steady ? 0.5 : 1) : 0;
    var yaw = amp * 0.4 * Math.PI / 180 * Math.sin(2 * Math.PI * 0.1 * now);
    var pitch = PITCH + amp * 0.25 * Math.PI / 180 * Math.sin(2 * Math.PI * 0.07 * now + 1.1);
    var ex = CX + EYE_D * Math.sin(yaw) * Math.cos(pitch);
    var ey = CY + EYE_D * Math.sin(pitch) + rise;
    var ez = EYE_D * Math.cos(pitch) * Math.cos(yaw);
    var n = ez - 3.5, f = ez + 3.5;
    mFrustum(Pm, (winL - ex) * n / ez, (winR - ex) * n / ez, (winB + rise - ey) * n / ez, (winT + rise - ey) * n / ez, n, f);
    Vm[0] = 1; Vm[1] = 0; Vm[2] = 0; Vm[3] = 0; Vm[4] = 0; Vm[5] = 1; Vm[6] = 0; Vm[7] = 0;
    Vm[8] = 0; Vm[9] = 0; Vm[10] = 1; Vm[11] = 0; Vm[12] = -ex; Vm[13] = -ey; Vm[14] = -ez; Vm[15] = 1;
    mMul(PV, Pm, Vm);
    /* the kick, applied after projection so the face stays where the
       layout put it and only moves as a whole */
    var ks = kickShape(fxNow - kick.t0);
    var ty = -(kick.px * ks) * 2 / cssH;
    var th = kick.rot * ks * Math.PI / 180;
    var a = cssW / cssH, c = Math.cos(th), s = Math.sin(th), cx = wellNDC[0], cy = wellNDC[1];
    var k0 = cx - c * cx + (s / a) * cy, k1 = cy - a * s * cx - c * cy + ty;
    for (var col = 0; col < 4; col++) {
      var v0 = PV[col * 4], v1 = PV[col * 4 + 1], v3 = PV[col * 4 + 3];
      VP[col * 4] = c * v0 - (s / a) * v1 + k0 * v3;
      VP[col * 4 + 1] = a * s * v0 + c * v1 + k1 * v3;
      VP[col * 4 + 2] = PV[col * 4 + 2]; VP[col * 4 + 3] = v3;
    }
    var i;
    for (i = 0; i < 16; i++) ubo[i] = VP[i];
    ubo[16] = ex; ubo[17] = ey; ubo[18] = ez; ubo[19] = now;
    ubo[20] = KEY_DIR[0]; ubo[21] = KEY_DIR[1]; ubo[22] = KEY_DIR[2]; ubo[23] = pxPerCell;
    ubo[24] = cur.key[0] * 2.4; ubo[25] = cur.key[1] * 2.4; ubo[26] = cur.key[2] * 2.4; ubo[27] = danger;
    ubo[28] = cur.rim[0] * 0.8; ubo[29] = cur.rim[1] * 0.8; ubo[30] = cur.rim[2] * 0.8; ubo[31] = full ? 1 : 0;
    ubo[32] = cur.envTop[0]; ubo[33] = cur.envTop[1]; ubo[34] = cur.envTop[2]; ubo[35] = SC.enc;
    ubo[36] = cur.envLow[0]; ubo[37] = cur.envLow[1]; ubo[38] = cur.envLow[2]; ubo[39] = fxNow;
    ubo[40] = cur.wall[0]; ubo[41] = cur.wall[1]; ubo[42] = cur.wall[2];
    ubo[43] = O.grid === "full" ? 1 : (O.grid === "faint" ? 0.45 : 0);
    ubo[44] = WA.pattern; ubo[45] = WB.pattern; ubo[46] = wMix < 1 ? smooth(wMix) : 0; ubo[47] = SK.landing;
    if (wMix >= 1) { ubo[44] = WB.pattern; }
    ubo[48] = SK.rough; ubo[49] = SK.rim; ubo[50] = SK.emissive;
    ubo[51] = (t.refract && !SK.unlit) ? SK.refract : 0;
    ubo[52] = SK.sss; ubo[53] = SK.speckle; ubo[54] = SK.fibre; ubo[55] = SK.unlit ? 1 : 0;
    ubo[56] = SK.outline ? 1 : 0; ubo[57] = SK.glyph; ubo[58] = SK.mono ? 1 : 0; ubo[59] = SK.gloss;
    var et = fxNow - emptyFx.t0;
    ubo[60] = et >= 0 && et < 1.2 ? emptyFx.amp / 0.075 * (et < 0.3 ? smooth(et / 0.3) : 1 - smooth((et - 0.3) / 0.9)) : 0;
    ubo[61] = 0; ubo[62] = unbroken;
    var endT = fxNow - endFx.t0;
    ubo[63] = endFx.on && endT < 2.2 ? Math.sin(Math.PI * clamp(endT / 2.2, 0, 1)) * 0.6 : 0;
    ubo[64] = SK.unlit ? 0 : SK.inner; ubo[65] = 0; ubo[66] = 0; ubo[67] = 0;
    for (i = 0; i < 4; i++) {
      var r = rings[i], age = fxNow - r.t0;
      ubo[68 + i * 4] = r.x; ubo[69 + i * 4] = r.y; ubo[70 + i * 4] = age;
      ubo[71 + i * 4] = (age >= 0 && age < 1.4) ? r.amp : 0;
    }
    for (i = 0; i < 48; i++) ubo[84 + i] = pal[i];
    gl.bindBuffer(gl.UNIFORM_BUFFER, B.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, ubo);
  }
  /* where the stack is, for the stone: the board in red, the falling
     piece in green (it shades the shaft below it but leaves no contact
     shadow) */
  var occG = new Uint8Array(W * 24);
  function uploadOcc(view) {
    var b = view.board, i, changed = occDirty;
    for (i = 0; i < W * 24; i++) occG[i] = 0;
    if (A.on && view.active && view.active.cells) {
      var cells = view.active.cells;
      for (i = 0; i < cells.length; i++) {
        var x = cellX(cells[i]), y = cellY(cells[i]);
        if (x >= 0 && x < W && y >= 0 && y < 24) occG[y * W + x] = 200;
      }
    }
    var gone = endFx.on && endFx.done;
    for (i = 0; i < W * 24; i++) {
      var v = (b && b[i] && !gone) ? 255 : 0;
      if (occData[i * 2] !== v) { occData[i * 2] = v; changed = true; }
      if (occData[i * 2 + 1] !== occG[i]) { occData[i * 2 + 1] = occG[i]; changed = true; }
    }
    if (!changed) return;
    gl.bindTexture(gl.TEXTURE_2D, X.occ);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, 24, gl.RG, gl.UNSIGNED_BYTE, occData);
    occDirty = false;
  }

  /* ================================================================
     passes
     ================================================================ */
  var draws = 0;
  var SREG = [S_SCENE, S_SHADOW, S_FG];
  function bindTex(unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }
  function full3() { gl.bindVertexArray(V.empty); gl.drawArrays(gl.TRIANGLES, 0, 3); draws++; }
  /* the world's Quad response: sky.js says which envelope its motifs
     were drawn for (a 0.6 s rise, a 2.4 s fall), so ask it */
  function reactNow() {
    var t = fxNow - reactFx.t0;
    if (t < 0 || t > 3.0 || O.steady) return 0;
    var Sy = root.Sky;
    if (Sy && typeof Sy.react === "function") return reactFx.amp * clamp(+Sy.react(t) || 0, 0, 1);
    return reactFx.amp * (t < 0.6 ? smooth(t / 0.6) : 1 - smooth((t - 0.6) / 2.4));
  }
  function skyMotion() { return O.motion === "full" ? domWorld().motion * (O.steady ? 0.5 : 1) : 0; }

  function passSky() {
    var tS = T.sky;
    if (!tS) return;
    var live = TT().live && O.motion !== "still";
    var react = reactNow();
    if (!(skyDirty || react > 0 || (live && now - skyLast >= 1 / 30 - 0.004))) return;
    skyLast = now; skyDirty = false;
    var pr = TT().live ? P.sky : P.plain, u = pr.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER, tS.fb);
    gl.viewport(0, 0, tS.w, tS.h);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.useProgram(pr.p);
    gl.uniform2f(u.uRes, tS.w, tS.h);
    gl.uniform1f(u.uTime, now);
    gl.uniform1i(u.uA, WA.idx); gl.uniform1i(u.uB, WB.idx);
    gl.uniform1f(u.uMix, wMix < 1 ? smooth(wMix) : 1);
    gl.uniform1f(u.uReact, react);
    gl.uniform1f(u.uMotion, skyMotion());
    gl.uniform1f(u.uDanger, O.steady ? 0 : danger);
    gl.uniform3f(u.uTopA, WA.top[0], WA.top[1], WA.top[2]); gl.uniform3f(u.uHorA, WA.hor[0], WA.hor[1], WA.hor[2]);
    gl.uniform3f(u.uTopB, WB.top[0], WB.top[1], WB.top[2]); gl.uniform3f(u.uHorB, WB.hor[0], WB.hor[1], WB.hor[2]);
    gl.uniform2f(u.uWell, wellUV[0], wellUV[1]);
    full3();
  }
  function drawBodies(layer) {
    gl.bindVertexArray(V.block);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.inst);
    var base = layer * NVAR;
    for (var v = 0; v < NVAR; v++) {
      var n = bCount[base + v];
      if (!n) continue;
      var off = bStart[base + v] * 64;
      for (var a = 0; a < 4; a++) gl.vertexAttribPointer(2 + a, 4, gl.FLOAT, false, 64, off + a * 16);
      gl.uniform2f(P.block.u.uVar, VT[v].sides, VT[v].notch);
      gl.drawElementsInstanced(gl.TRIANGLES, VT[v].count, gl.UNSIGNED_SHORT, VT[v].first * 2, n);
      draws++;
    }
  }
  function drawSprites(reg) {
    var start = SREG[reg], n = sprN[reg] - start;
    if (n <= 0) return;
    gl.bindVertexArray(V.spr);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.spr);
    for (var a = 0; a < 4; a++) gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 64, start * 64 + a * 16);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    draws++;
  }
  function drawRibbons() {
    var u = P.ribbon.u, used = false;
    for (var i = 0; i < ribbons.length; i++) {
      var r = ribbons[i];
      if (!r.on) continue;
      var t = fxNow - r.t0, q = t / r.dur;
      if (q > 1.3 || O.motion === "still") { r.on = false; continue; }
      if (q < 0) continue;
      if (!used) { gl.useProgram(P.ribbon.p); gl.bindVertexArray(V.empty); used = true; }
      var head = r.kind === 0 ? easeInOut(Math.min(1, q)) * 1.02 : Math.min(1.25, q * 1.25);
      var env = q < 1 ? 1 : 1 - (q - 1) / 0.3;
      gl.uniform4f(u.uR0, r.kind, head, r.kind === 0 ? 0.42 : 0.34, r.w);
      gl.uniform4f(u.uR1, r.cx, r.cy, r.rx, r.ry);
      gl.uniform4f(u.uR2, mixf(pal[0], cur.rim[0], 0.25), mixf(pal[1], cur.rim[1], 0.25), mixf(pal[2], cur.rim[2], 0.25),
                   r.amp * env * Math.min(1.3, juiceK() + 0.3));
      gl.uniform4f(u.uR3, r.swing, r.rate, r.phase, r.turns);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, RIB_SEG * 2);
      draws++;
    }
  }
  function drawParticles() {
    var cap = particleCap();
    if (cap <= 0) return;
    gl.useProgram(P.part.p);
    gl.uniform1f(P.part.u.uNow, fxNow);
    gl.bindVertexArray(V.part);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cap);
    draws++;
  }
  function keepVisible(view) { return niche && keepSlot && view && view.keep !== false; }
  function passScene(view) {
    var tS = T.scene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, tS.fb);
    gl.viewport(0, 0, tS.w, tS.h);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    /* the sky, upsampled */
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.useProgram(P.blit.p);
    bindTex(0, T.sky.tex);
    gl.uniform1i(P.blit.u.uSrc, 0);
    gl.uniform2f(P.blit.u.uInv, 1 / tS.w, 1 / tS.h);
    gl.uniform1f(P.blit.u.uEnc, SC.enc);
    full3();
    /* the well's shadow on the sky behind it */
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.useProgram(P.sprite.p); gl.uniform1f(P.sprite.u.uShadow, 1);
    drawSprites(1);
    /* the stone */
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    bindTex(1, X.occ);
    gl.useProgram(P.wall.p);
    gl.uniform1i(P.wall.u.uOcc, 1);
    gl.uniform4f(P.wall.u.uNiche, 0, 0, 1, 0);
    gl.bindVertexArray(V.shell);
    gl.drawElements(gl.TRIANGLES, shellIdx.length, gl.UNSIGNED_SHORT, 0);
    draws++;
    /* the stack */
    gl.useProgram(P.block.p);
    gl.uniform1i(P.block.u.uOcc, 1);
    gl.uniform1f(P.block.u.uFade, 0);
    drawBodies(0);
    /* bodies fading into light: blended over what is behind them, the
       readability mask left exactly as it was */
    gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.uniform1f(P.block.u.uFade, 1);
    drawBodies(2);
    gl.uniform1f(P.block.u.uFade, 0);
    gl.disable(gl.BLEND); gl.depthMask(true);
    /* light that may glow and may be washed by bloom */
    gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P.sprite.p); gl.uniform1f(P.sprite.u.uShadow, 0);
    drawSprites(0);
    drawRibbons();
    if (!T.bloom.length) drawParticles();
    /* what must always be read: the niche, the piece in hand, the
       previews, the kept piece — then the landing light over them */
    gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.CULL_FACE);
    if (keepVisible(view)) {
      gl.useProgram(P.wall.p);
      gl.uniform4f(P.wall.u.uNiche, Math.min(1.4, nicheGlow * 0.85 + nicheFlash * 0.6), 1, keepSlot.s, 0);
      gl.uniform4f(P.wall.u.uNicheRect, niche.ix0, niche.ix1, niche.iy0, niche.iy1);
      gl.bindVertexArray(V.niche);
      gl.drawElements(gl.TRIANGLES, nicheIdx.length, gl.UNSIGNED_SHORT, 0);
      draws++;
    }
    gl.useProgram(P.block.p);
    drawBodies(1);
    gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P.sprite.p); gl.uniform1f(P.sprite.u.uShadow, 0);
    drawSprites(2);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }
  function passBloom() {
    var mips = T.bloom, n = mips.length, i, s, d;
    if (!n) return;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.depthMask(false); gl.disable(gl.BLEND);
    var m0 = mips[0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, m0.fb);
    gl.viewport(0, 0, m0.w, m0.h);
    gl.useProgram(P.bright.p);
    bindTex(0, T.scene.tex);
    gl.uniform1i(P.bright.u.uSrc, 0);
    gl.uniform2f(P.bright.u.uTexel, 1 / T.scene.w, 1 / T.scene.h);
    gl.uniform2f(P.bright.u.uInv, 1 / m0.w, 1 / m0.h);
    gl.uniform4f(P.bright.u.uP, 0.85, 0.45, 1 / SC.enc, F.hdr.enc);
    full3();
    /* particles go straight into the half-resolution level: they glow,
       and they cost a quarter of the fill */
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    drawParticles();
    gl.disable(gl.BLEND);
    gl.useProgram(P.down.p);
    gl.uniform1i(P.down.u.uSrc, 0);
    for (i = 1; i < n; i++) {
      s = mips[i - 1]; d = mips[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, d.fb);
      gl.viewport(0, 0, d.w, d.h);
      bindTex(0, s.tex);
      gl.uniform2f(P.down.u.uTexel, 1 / s.w, 1 / s.h);
      gl.uniform2f(P.down.u.uInv, 1 / d.w, 1 / d.h);
      full3();
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P.up.p);
    gl.uniform1i(P.up.u.uSrc, 0);
    gl.uniform1f(P.up.u.uGain, 1);
    for (i = n - 1; i > 0; i--) {
      s = mips[i]; d = mips[i - 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, d.fb);
      gl.viewport(0, 0, d.w, d.h);
      bindTex(0, s.tex);
      gl.uniform2f(P.up.u.uR, 1 / s.w, 1 / s.h);
      gl.uniform2f(P.up.u.uInv, 1 / d.w, 1 / d.h);
      full3();
    }
    gl.disable(gl.BLEND);
  }
  var p3 = false;
  function passComposite() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    var u = P.comp.u, hasBloom = T.bloom.length > 0;
    gl.useProgram(P.comp.p);
    bindTex(0, T.scene.tex); gl.uniform1i(u.uScene, 0);
    bindTex(1, hasBloom ? T.bloom[0].tex : T.scene.tex); gl.uniform1i(u.uBloom, 1);
    gl.uniform1f(u.uBloomOn, hasBloom ? 1 : 0);
    var bloomAmt = (0.3 + swellNow()) * Math.min(1, SK.bloomCap);
    gl.uniform4f(u.uC0, bloomAmt, 0.15, 0.02, TT().fxaa ? 1 : 0);
    gl.uniform4f(u.uC1, 1.0, danger, O.steady ? 0.35 : 1.0, p3 ? 1 : 0);
    gl.uniform4f(u.uC2, 1 / canvas.width, 1 / canvas.height, 1 / SC.enc, 1 / F.hdr.enc);
    gl.uniform4f(u.uC3, wellRectUV[0], wellRectUV[1], wellRectUV[2], wellRectUV[3]);
    gl.uniform3f(u.uLift, SK.lift[0], SK.lift[1], SK.lift[2]);
    gl.uniform3f(u.uGamma, SK.gamma[0], SK.gamma[1], SK.gamma[2]);
    gl.uniform3f(u.uGain, SK.gain[0], SK.gain[1], SK.gain[2]);
    full3();
  }

  /* ================================================================
     the frame
     ================================================================ */
  /* the mirror follows the engine every frame; between frames, the
     events edit it so a drain can show what it took */
  function syncMirror(view) {
    var b = view.board, pa = view.pid, n = W * ROWS;
    if (!b) return;
    for (var i = 0; i < n; i++) { mirB[i] = b[i] || 0; mirP[i] = pa ? (pa[i] || 0) : 0; }
  }
  var EMPTY_VIEW = { board: new Uint8Array(W * ROWS), pid: new Uint16Array(W * ROWS), active: null, ghost: null,
                     hold: 0, holdUsed: false, keep: false, queue: null, danger: 0, breath: null, target: null,
                     over: false, paused: false };
  R.render = function (view, dt, time) {
    if (lost && !gaveUp && !disposed) {
      /* counted from the first frame the app asks for while the context
         is away, not from the loss itself: a page that lost it in the
         background must not give up the moment it is looked at again.
         Four seconds of asking without it, and the app is told to carry
         on in 2D rather than show an empty well. */
      var tw = perfNow();
      if (!lostWait) lostWait = tw;
      else if (tw - lostWait > 4000) {
        gaveUp = true;
        if (opts.onLost) { try { opts.onLost(); } catch (er) {} }
      }
    }
    if (disposed || lost || !ready || !T.scene) return;
    var c0 = perfNow();
    if (!(dt >= 0)) dt = 0;
    if (dt > 0.25) dt = 0.25;
    now = (typeof time === "number" && isFinite(time)) ? time : now + dt;
    frameDt = dt;
    observe(dt);
    var hold = paused || !!(view && view.paused);
    if (!hold && now >= hitUntil) fxNow += Math.min(dt, 0.05);
    view = view || EMPTY_VIEW;
    syncMirror(view);
    trackActive(view, dt);
    trackQueue(view);
    stepState(view, dt);
    if (!hold) ambient(dt);
    writeFrame();
    uploadOcc(view);
    buildInstances(view);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.inst);
    if (instN) gl.bufferSubData(gl.ARRAY_BUFFER, 0, instArr, 0, instN * 16);
    buildSprites(view);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.spr);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, spr, 0, sprN[2] * 16);
    if (pHi >= pLo) {
      gl.bindBuffer(gl.ARRAY_BUFFER, B.part);
      gl.bufferSubData(gl.ARRAY_BUFFER, pLo * 64, pData, pLo * 16, (pHi - pLo + 1) * 16);
      pLo = MAXP; pHi = -1;
    }
    draws = 0;
    passSky();
    passScene(view);
    passBloom();
    passComposite();
    var st = R.stats;
    st.frames++; st.draws = draws; st.particles = particleCap(); st.step = step; st.tier = tierName;
    st.cpuMs = st.cpuMs * 0.9 + (perfNow() - c0) * 0.1;
  };

  /* ================================================================
     quality, from the cadence of frames
     ================================================================ */
  var SNAP = [8.3, 11.1, 13.9, 16.7, 33.3];
  var qa = { t: 0, lastEval: 0, E: 16.7, overT: -1, cleanT: 0, lastDown: -1e9, slow: 0, lpOn: false, lpCalled: -1e9 };
  function observe(dt) {
    var ms = dt * 1000, i;
    if (!(ms > 0) || ms >= 250) return;
    qa.t += dt;
    cadence[cadHead] = ms; cadHead = (cadHead + 1) % 240; if (cadN < 240) cadN++;
    /* frame-time safety (brief §8.4.7): thirty slow frames in a row halve
       the particles — measured against the cadence, so a steady 30 Hz is
       not mistaken for thirty slow frames */
    if (ms > Math.max(20, qa.E * 1.3)) { if (++qa.slow >= 30) { partHalf = Math.max(0.125, partHalf * 0.5); qa.slow = 0; } }
    else qa.slow = 0;
    if (qa.t - qa.lastEval < 0.5 || cadN < 30) return;
    qa.lastEval = qa.t;
    var want = Math.min(cadN, Math.max(30, Math.round(2000 / qa.E)));
    for (i = 0; i < 512; i++) hist[i] = 0;
    for (i = 0; i < want; i++) {
      var v = cadence[(cadHead - 1 - i + 480) % 240];
      hist[Math.min(511, Math.round(v * 2))]++;
    }
    var acc = 0, med = 16.7;
    for (i = 0; i < 512; i++) { acc += hist[i]; if (acc * 2 >= want) { med = i / 2; break; } }
    var E = med;
    if (med < 45) { var best = 99; for (i = 0; i < SNAP.length; i++) if (Math.abs(SNAP[i] - med) < best) { best = Math.abs(SNAP[i] - med); E = SNAP[i]; } }
    var over = 0, near = 0;
    for (i = 0; i < want; i++) {
      var w2 = cadence[(cadHead - 1 - i + 480) % 240];
      if (w2 > 1.5 * E) over++;
      if (Math.abs(w2 - E) < 0.18 * E) near++;
    }
    var share = over / want;
    if (Math.abs(E - qa.E) > 0.5) {
      /* the cadence itself changed — Low Power Mode, a display moved,
         ProMotion toggled — which is not overload */
      qa.E = E; qa.overT = -1; qa.cleanT = qa.t;
    } else if (share > 0.10) {
      if (qa.overT < 0) qa.overT = qa.t;
      if (qa.t - qa.overT >= 2) { stepDown(); qa.overT = -1; qa.lastDown = qa.t; qa.cleanT = qa.t; }
    } else qa.overT = -1;
    if (share > 0.03) qa.cleanT = qa.t;
    if (qa.t - qa.cleanT >= 20 && qa.t - qa.lastDown >= 10) { stepUp(); qa.cleanT = qa.t; }
    var lp = Math.abs(qa.E - 33.3) < 0.5 && near / want > 0.85;
    if (lp && !qa.lpOn) {
      qa.lpOn = true;
      if (opts.onLowPower && qa.t - qa.lpCalled > 60) { qa.lpCalled = qa.t; try { opts.onLowPower(); } catch (e) {} }
    } else if (!lp && qa.E < 20) qa.lpOn = false;
    R.stats.cadenceMs = qa.E; R.stats.lowPower = qa.lpOn;
  }
  function tierChanged() {
    R.tier = tierName; R.stats.tier = tierName; skyDirty = true;
    if (opts.onTier) { try { opts.onTier(tierName); } catch (e) {} }
  }
  function stepDown() {
    if (step < STEP_MAX) step++;
    else if (tierMode === "auto") {
      var i = TIER_ORDER.indexOf(tierName);
      if (i < TIER_ORDER.length - 1) { tierName = TIER_ORDER[i + 1]; step = 0; tierChanged(); }
      else return;
    } else return;
    R.stats.step = step;
    sizeCanvas();
  }
  function stepUp() {
    if (step > 0) step--;
    else if (tierMode === "auto") {
      var i = TIER_ORDER.indexOf(tierName), b = TIER_ORDER.indexOf(tierBase);
      if (i > b) { tierName = TIER_ORDER[i - 1]; step = STEP_MAX; tierChanged(); }
      else return;
    } else return;
    R.stats.step = step;
    sizeCanvas();
  }

  /* ================================================================
     layout: the CSS rectangles turned into the world
     ================================================================ */
  function layoutWorld() {
    var L = Lay, wx, wy, ww, wh, i;
    if (L && L.well && L.well.w > 0 && L.well.h > 0) { wx = L.well.x; wy = L.well.y; ww = L.well.w; wh = L.well.h; }
    else {
      var c = Math.max(4, Math.floor(Math.min((cssW - 24) / (W + 2 * WALL_T + 1), (cssH - 24) / (LIP_Y + FLOOR_T + 1))));
      ww = c * W; wh = c * VIS; wx = (cssW - ww) * 0.5; wy = (cssH - wh) * 0.5 + c * 0.25;
    }
    cellXpx = ww / W; cellYpx = wh / VIS;
    winL = -wx / cellXpx; winT = VIS + wy / cellYpx;
    winR = winL + cssW / cellXpx; winB = winT - cssH / cellYpx;
    wellUV[0] = (wx + ww * 0.5) / cssW; wellUV[1] = 1 - (wy + wh * 0.5) / cssH;
    wellRectUV[0] = wx / cssW; wellRectUV[1] = (wx + ww) / cssW;
    wellRectUV[2] = 1 - (wy + wh) / cssH; wellRectUV[3] = 1 - wy / cssH;
    wellNDC[0] = wellUV[0] * 2 - 1; wellNDC[1] = wellUV[1] * 2 - 1;
    slots = [];
    if (L && L.next && L.next.length) {
      for (i = 0; i < L.next.length; i++) {
        var r = L.next[i];
        if (!r || !(r.w > 0)) continue;
        slots.push({ x: winL + (r.x + r.w * 0.5) / cellXpx, y: winT - (r.y + r.h * 0.5) / cellYpx,
                     s: clamp(num(r.s, 0.6), 0.2, 1.2) });
      }
    }
    keepSlot = null; niche = null;
    if (L && L.keep && L.keep.w > 0 && L.keep.h > 0) {
      var k = L.keep;
      var kx0 = winL + k.x / cellXpx, kx1 = winL + (k.x + k.w) / cellXpx;
      var ky1 = winT - k.y / cellYpx, ky0 = winT - (k.y + k.h) / cellYpx;
      var t = clamp(Math.min(kx1 - kx0, ky1 - ky0) * 0.14, 0.14, 0.34);
      var innerW = (kx1 - kx0) - 2 * t, innerH = (ky1 - ky0) - 2 * t;
      var s = Math.min(clamp(num(k.s, 0.6), 0.2, 1.2), (innerW - 0.16) / 4, (innerH - 0.16) / 2.2);
      s = Math.max(0.15, s);
      var depth = DEPTH * s + 0.3;
      niche = buildNiche(kx0, kx1, ky0, ky1, t, depth);
      nicheData = packMesh(niche.mesh, true); nicheIdx = new Uint16Array(niche.mesh.idx);
      if (ready && !lost) uploadNiche();
      keepSlot = { x: (niche.ix0 + niche.ix1) * 0.5, y: niche.iy0 + 0.06 + s, floor: niche.iy0 + 0.06, z: -0.16, s: s };
    }
  }
  /* the kept piece rests on the niche's floor: lift it by half its own
     height, which depends on the piece (an I is one row tall) */
  function keepY(t) { return keepSlot ? keepSlot.floor + (t === 1 ? 0.5 : 1) * keepSlot.s : 0; }

  /* ================================================================
     the public face
     ================================================================ */
  var primed = false;
  R.resize = function (w, h, dpr, L) {
    if (disposed) return;
    cssW = Math.max(1, +w || 1); cssH = Math.max(1, +h || 1);
    dprIn = dpr > 0 ? dpr : 1;
    Lay = L || null;
    layoutWorld();
    sizeCanvas();
    if (!primed) prime();
  };
  R.setSkin = function (skin, palette, glyphs) { applySkin(skin, palette, glyphs); };
  var seenWorld = false;
  R.setWorld = function (world, instant) {
    if (typeof world === "string" && root.Worlds && typeof root.Worlds.get === "function") world = root.Worlds.get(world);
    if (!world || typeof world !== "object") return;
    if (instant || !seenWorld || O.motion === "still" && false) {
      fillWorld(WA, world); copyWorld(WB, WA); wMix = 1; seenWorld = true; skyDirty = true;
      return;
    }
    if (wMix < 1 && wMix >= 0.5) copyWorld(WA, WB);
    else if (wMix >= 1) copyWorld(WA, WB);
    fillWorld(WB, world);
    if (WB.id === WA.id) { copyWorld(WA, WB); wMix = 1; skyDirty = true; return; }
    wMix = 0; wT0 = now; wDur = O.motion === "still" ? 0.15 : 2.5; skyDirty = true;
  };
  R.setOptions = function (o) {
    if (!o) return;
    if (o.landing !== undefined) O.landing = !!o.landing;
    if (o.grid === "off" || o.grid === "faint" || o.grid === "full") O.grid = o.grid;
    if (o.lockLight !== undefined) O.lockLight = !!o.lockLight;
    if (o.motion === "full" || o.motion === "gentle" || o.motion === "still") { O.motion = o.motion; skyDirty = true; }
    if (o.juice === "calm" || o.juice === "medium" || o.juice === "vivid") O.juice = o.juice;
    if (typeof o.nudge === "number" && isFinite(o.nudge)) O.nudge = clamp(o.nudge, 0, 1);
    if (o.labels !== undefined) O.labels = !!o.labels;
    if (o.steady !== undefined) O.steady = !!o.steady;
    if (typeof o.previews === "number" && isFinite(o.previews)) O.previews = clamp(o.previews | 0, 0, 6);
  };
  var autoPick = tierName;
  R.setTier = function (name) {
    if (name !== "auto" && !TIERS[name]) return;
    tierMode = name;
    tierName = name === "auto" ? autoPick : name;
    tierBase = tierName; step = 0; partHalf = 1;
    tierChanged();
    sizeCanvas();
  };
  R.dispose = function () {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener("webglcontextlost", onLostEv, false);
    canvas.removeEventListener("webglcontextrestored", onRestoredEv, false);
    if (!lost && ready) {
      freeTargets();
      for (var k in P) if (P[k] && P[k].p && gl.isProgram(P[k].p)) gl.deleteProgram(P[k].p);
      for (k in B) if (B[k]) gl.deleteBuffer(B[k]);
      for (k in V) if (V[k]) gl.deleteVertexArray(V[k]);
      if (X.occ) gl.deleteTexture(X.occ);
    }
    ready = false;
    var ext = lost ? null : gl.getExtension("WEBGL_lose_context");
    if (ext) {
      var old = releasedFor(canvas);
      if (old) forget(old);
      RELEASED.push({ c: canvas, x: ext, held: false, want: false });
      canvas.addEventListener("webglcontextlost", holdForReuse, false);
      try { ext.loseContext(); } catch (e) {}
    }
  };

  /* Draw one frame with one of everything in it before the player ever
     sees one, so the GPU's pipeline states exist before the first
     piece falls (05 §2.6), then wipe it. */
  var PRIME_VIEW = (function () {
    var b = new Uint8Array(W * ROWS), p = new Uint16Array(W * ROWS);
    var c = [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [3, 0, 1, 1], [5, 0, 3, 2], [6, 0, 3, 2], [7, 0, 3, 2], [6, 1, 3, 2], [9, 0, 8, 0], [8, 0, 8, 0]];
    for (var i = 0; i < c.length; i++) { b[c[i][1] * W + c[i][0]] = c[i][2]; p[c[i][1] * W + c[i][0]] = c[i][3]; }
    return { board: b, pid: p, W: 10, H: 40, visible: 22,
             active: { type: 6, rot: 0, x: 4, y: 12, cells: [[3, 13], [3, 12], [4, 12], [5, 12]] },
             ghost: [[3, 2], [3, 1], [4, 1], [5, 1]], hold: 3, holdUsed: false, keep: true, queue: [1, 2, 3, 4, 5, 6],
             fall: 0, lock: 0.3, lockResets: 2, danger: 0.8, delay: false, halted: false,
             breath: { charge: 12, active: true, phase: 0.3 }, bag: [], target: [[0, 5], [1, 5], [2, 5], [1, 6]],
             over: false, paused: false, demo: false };
  })();
  function prime() {
    if (primed || !ready || lost || !T.scene) return;
    primed = true;
    spawnP(5, 5, 0, 0, 0, 0, fxNow, 0.05, 0.1, 0, 1, 1, 1, 0.01, 0);
    ribbon(0, 5, 5, 1, 1, 0.05, 1, 7, 0.05, 0.001, 0.5);
    band(5, 0.5, 0.0001, 0.02, 0.02, 0);
    fxCell(4, 6, 3, 0, fxNow - 0.01, 1, 0, 0, false);   /* the blended, fading layer */
    var t0 = now;
    R.render(PRIME_VIEW, 0, t0);
    resetAll();
    A.on = false; qN = 0; nicheGlow = 0; dangerS = 0; danger = 0;
    for (var i = 0; i < 20; i++) beads[i] = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    R.stats.frames = 0;
    skyDirty = true;
  }

  /* ================================================================
     a lost context, and its return
     ================================================================ */
  function onLostEv(e) {
    if (e && e.preventDefault) e.preventDefault();
    lost = true; ready = false; lostWait = 0;
    var t = perfNow() / 1000;
    lossTimes.push(t);
    while (lossTimes.length && t - lossTimes[0] > 60) lossTimes.shift();
    if (lossTimes.length >= 3 && !gaveUp) {
      gaveUp = true;
      if (opts.onLost) { try { opts.onLost(); } catch (er) {} }
    }
  }
  function onRestoredEv() {
    if (gaveUp || disposed) return;
    lost = false; lostWait = 0;
    T = {}; targetsKey = "";
    if (!build()) {
      gaveUp = true;
      if (opts.onLost) { try { opts.onLost(); } catch (er) {} }
      return;
    }
    applyColorSpace();
    sizeCanvas();
    primed = false; prime();
    occDirty = true; skyDirty = true;
  }
  canvas.addEventListener("webglcontextlost", onLostEv, false);
  canvas.addEventListener("webglcontextrestored", onRestoredEv, false);

  /* Display P3 where the screen has it: the scene is still graded in
     sRGB primaries and converted exactly, so the palette that passed the
     lint is the palette on screen, with room for highlights beyond it */
  function applyColorSpace() {
    p3 = false;
    try {
      if ("drawingBufferColorSpace" in gl && typeof matchMedia === "function" && matchMedia("(color-gamut: p3)").matches) {
        gl.drawingBufferColorSpace = "display-p3";
        p3 = gl.drawingBufferColorSpace === "display-p3";
      }
    } catch (e) { p3 = false; }
  }

  /* ---------- start ---------- */
  var Sk0 = root.Skins, Wd0 = root.Worlds;
  applySkin((Sk0 && Sk0.get && Sk0.get("seaglass")) || (Sk0 && Sk0.list && Sk0.list[0]) || DEFAULT_SKIN, "skin", "off");
  fillWorld(WA, (Wd0 && Wd0.list && Wd0.list[0]) || DEFAULT_WORLD);
  copyWorld(WB, WA);
  for (var ci = 0; ci < 3; ci++) { cur.key[ci] = WA.key[ci]; cur.rim[ci] = WA.rim[ci]; }
  if (revive) {
    /* this canvas's context was released by an earlier renderer: ask for
       it back and build everything when it arrives */
    lost = true; lostWait = 0;
    if (revive.held) askBack(revive);
    else revive.want = true;
    return R;
  }
  if (!build()) {
    var lc = gl.getExtension("WEBGL_lose_context");
    if (lc) { try { lc.loseContext(); } catch (e) {} }
    canvas.removeEventListener("webglcontextlost", onLostEv, false);
    canvas.removeEventListener("webglcontextrestored", onRestoredEv, false);
    Gfx3D.lastError = lastError;
    return null;
  }
  applyColorSpace();
  return R;
};

Gfx3D.TIERS = TIERS;
Gfx3D.VARIANTS = NVAR;
Gfx3D.lastError = "";
/* for tools: the meshes, so a node check can prove every body is closed */
Gfx3D._geometry = { cells: buildCells, shell: buildShell, niche: buildNiche, VARIANT_OF: VARIANT_OF, VARIANT_KEY: VARIANT_KEY };

if (typeof module !== "undefined" && module.exports) module.exports = Gfx3D;
else root.Gfx3D = Gfx3D;
})(typeof self !== "undefined" ? self : this);
