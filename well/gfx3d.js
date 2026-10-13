/* gfx3d.js — the well in the round.

   Raw WebGL 2, no libraries, no build step, in the manner of the chess
   room: every mesh is carved here from arithmetic, every surface is lit
   by a few lines of physically based shading, and the picture is
   finished by a short post chain that is written out longhand because
   there is no engine to hide it in.

   ## What you are looking at

   A shaft of the world's own stone, ten cells wide, twenty-two deep and
   three cells back, seen from in front and a little above. The camera
   sits where a camera pitched nine degrees down with a 24-degree lens
   would sit, but its picture plane is kept parallel to the face of the
   well — the rising front of an architect's view camera. That one choice
   is why the playing face lands *exactly* on the rectangle the layout
   asked for, pixel for pixel, with no keystone: touch, the DOM labels and
   the Keep niche all line up with what is drawn. Depth still reads,
   because perspective does its work on everything off that plane: the
   tops of the stack, the inner walls, the floor at the bottom of the
   shaft, the far wall falling away into the world's own dark. The idle
   "camera breath" moves the eye, not the plane, so the well breathes in
   parallax while the cells you are aiming at hold still.

   The frame is cut from the same stone, dressed smooth: two slim
   pillars, a floor slab with twenty Breath beads set into its face, and
   a coping along the mouth whose chamfered ends sit flush with the face.
   Its outer edges catch the world's rim light, so the well stands out as
   architecture against any sky. On the left of the mouth a block of that
   stone holds the Keep niche — an arched alcove carved into it, a sill
   for the kept piece to rest on — and when Keep is there to use, light
   pools on the sill and climbs the back of the alcove like a lamp in a
   niche in a wall.

   The shaft is lit from its mouth. The key light falls in where the
   stack lets it, the sky overhead falls into the top six rows, and the
   fill takes the colour of the world's horizon, so the well belongs to
   its world (Dawn's shadows go mauve) rather than standing in front of
   it as a coloured box. Down the shaft the light falls away to a little
   over half, and the middle of the shaft stays under a luminance of
   0.02 in every world, so every piece reads against it by 7:1.

   Each piece is one body. A cell is drawn from one of 47 meshes picked
   by which of its eight neighbours belong to the same piece: faces
   toward a same-piece neighbour do not exist, outer edges are rounded
   at 0.12 of a cell, and where an L turns its corner the inside of the
   bend is filleted by a small saddle patch, so the body has no seam, no
   notch and no pinhole anywhere. The SPEC asks for 16 variants by the
   four side neighbours; the other 31 exist only because the inside of
   a bend and the middle of an O look the same to a 4-bit mask and must
   not be drawn the same. After a clear the masks are simply recomputed,
   so a broken piece reads as smaller fused fragments. Where a body meets
   another body or the stone, a soft contact shadow sits in the groove.

   Shading is "studio jelly", driven by uniforms so that a skin is a set
   of numbers rather than a program: GGX highlights from a softbox (and a
   second, harder glint for glass and jelly), a studio made of four
   spherical Gaussians to reflect, a Fresnel rim in the world's rim
   colour, a subsurface tint, a speckle for stone and a fibre for paper,
   and for Ink no lighting at all — flat fills, a two-pixel light outline
   on each piece's outer edge, and strong glyphs. Each material is pushed
   until it reads as itself: Sea Glass lets the key light through a broad
   band inside its edge, is darker through its thick middle, carries a
   frosted sheen and shows the wall's courses blurred through it on the
   Full tier; Jelly has a wet clear coat; Paper Lantern's fibre runs
   across it, three ribs to a cell show through, and it glows from the
   inside out. Glass, jelly and paper lend the stone behind them a little
   of their colour, turned halfway to the world's key light so it is a
   blush and never a halo.

   ## Paying for it: bake what does not move

   The rule for anything drawn every frame is no loops, no noise and no
   pow() where a multiply will do. What is expensive and still is baked:

     - the world's stone, into a 16-by-16-cell tile, when a world arrives;
     - a tile of fine noise, once, for speckle, fibre and the dissolve;
     - the light the stack lets down the shaft and the glow it gives the
       wall (a 40 x 96 texture), when the stack or the piece in hand moves;
     - the back wall itself, lit, grid and haze and all (320 x 720), when
       that light, the world or the danger tint changes.

   The back wall is then not drawn at all. It is a plane square to the
   lens, so screen and wall are one affine map apart, and the composite
   reads it from its cache under whatever the scene left uncovered, the
   same way it lays the sky under the rest. Half a phone's pixels are the
   back wall; none of them is shaded twice.

   ## The pipeline (05 §9.1, brief §7.6)

     1. the world's sky (sky.js) at a fraction of the pixels and 30 Hz,
        drawn as a frame round the well, never under its face
     2. the caches above, when they are stale
     3. the scene into a half-float target with a depth buffer, nearest
        first so the depth test turns away what is hidden: the things the
        player must always be able to read, the stack, the stone, then
        light, motes and effects
     4. a Karis-weighted bright pass into half resolution, particles drawn
        additively into that same level, and a dual-filter down/up bloom
     5. one composite: sky and back wall under the open pixels, bloom,
        Khronos PBR Neutral, the skin's lift / gamma / gain, vignette, a
        static grain, a five-tap edge AA on the Full tier, and Display P3
        where the screen has it

   The scene target's alpha channel is not transparency. It marks what
   was drawn (0 nothing, so the composite fills it; 0.02 the stone; 0.04
   the stack), what must never be dimmed or washed (1: the active piece,
   the previews, the Keep niche), and adds 2 under the landing light — so
   the composite keeps bloom, particles, vignette and the danger tint off
   everything readable, keeps danger's greying off the stack, and still
   knows what lies under a rail of light. Readability is a property of
   the pipeline, not a promise in a comment.

   The Simple tier keeps the same passes minus bloom and edge AA, at a
   smaller budget, holding its scene in 8-bit sRGB at half value (half
   the bandwidth of a float target, still with room above white) and
   drawing its back wall as geometry, because an 8-bit alpha cannot carry
   the marks above.

   Cleared rows do not shatter or flatten. Through the glow's rise each
   cleared body keeps its own shape and shading and lights from within,
   toward a colour halfway between the world's key light and the skin's
   warm white, held to about half luminance. Then, crossfading over 60 ms,
   the cleared cells become one band, whatever pieces they came from; once
   it is fully lit it lets go — each row drawing in toward its own
   midline, its top and bottom soft, keeping more of its light than of its
   body — while the world's particles lift off it: a row of light going
   out, never a breaking one, and never grey. A finished run goes the same
   way, body by body from the top down, each rising a cell or two as it
   goes out.

   ## Calm, by construction (brief §8.4)

   Every luminance pulse asks the flash governor first: at most two
   pulses of ΔL ≥ 0.08 in any rolling second, each at least 400 ms rise
   to fall; anything over budget is turned down to a change that is too
   small to be a flash. Effects never add up — the strongest one wins and
   is held a fifth longer. Hit-stop freezes pictures, never the game.
   The kick is a single directional nudge with a spring home, scaled by
   the well-nudge setting and zero under reduced motion or in Steady;
   there is no random shake anywhere. Danger cools and greys the edges of
   the sky and the stone, never the stack, and never turns red or pulses.

   ## Cheap enough for a phone in Low Power Mode

   Nothing is allocated per frame: instances, sprites and particles live
   in typed arrays sized once; per-frame uniforms go up in a single
   uniform buffer. Every program is compiled when the renderer is
   created and drawn once off screen, so Metal's pipeline states exist
   before the first piece falls. Quality steps itself down from frame
   cadence (Safari has no GPU timers): particles, then bloom, then the
   sky, then resolution, then the tier — and back up after twenty clean
   seconds. A steady 30 fps is recognised as Low Power Mode rather than
   overload and is reported, not fought; a median frame over 40 ms for
   two seconds is overload whatever the cadence did, so a device that
   cannot keep up is never mistaken for one that changed its mind. A lost context is rebuilt in
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
/* The shaft runs well back behind the pieces, which sit at its front:
   deep enough that the floor and the inner walls show in perspective
   and a gap in the stack looks down into shadow, not onto a slab. */
var SHAFT_D = 3.2;
var BACK_Z = -SHAFT_D;         /* the back wall of the shaft */
var LIP = 0.5;                 /* the lip above the mouth */
var LIP_Y = VIS + LIP;
var COPE_H = 0.3;              /* the coping stone along the mouth */
var PITCH = 9 * Math.PI / 180;
var FOV = 24 * Math.PI / 180;
var EYE_D = (LIP_Y * 0.5) / Math.tan(FOV * 0.5);   /* ≈ 53 cells */
var CX = W * 0.5, CY = LIP_Y * 0.5;
/* the frame's thickness comes from the layout (L.wall), so the 2D well,
   the 3D well and every hit test agree on where the stone ends */
var WALL_MIN = 0.18, WALL_MAX = 0.6;

/* ================================================================
   tiers (brief §7.6, 05 §4.4) and the adaptive ladder
   ================================================================ */
var TIERS = {
  full:     { name: "full",     mp: 2.6, dpr: 2,   mips: 5, bloomDiv: 2, skyDiv: 3, skyHz: 30, live: true, q: 2,
              particles: 1500, motes: 40, haze: 1, refract: true,  fxaa: true,  breath: true,  wobble: true },
  balanced: { name: "balanced", mp: 1.8, dpr: 2,   mips: 4, bloomDiv: 4, skyDiv: 3.5, skyHz: 20, live: true, q: 1,
              particles: 600,  motes: 24, haze: 1, refract: false, fxaa: false, breath: false, wobble: false },
  simple:   { name: "simple",   mp: 1.0, dpr: 1.5, mips: 0, bloomDiv: 0, skyDiv: 4, skyHz: 0,  live: false, q: 0,
              particles: 150,  motes: 0,  haze: 0, refract: false, fxaa: false, breath: false, wobble: false }
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
/* the Empty Well is stillness, so its light is a few dozen lanterns
   rising from the floor (motes) over a small burst from the last rows,
   not the brief's 200 sparks, which read as fizz in a well this size */
var EMPTY_FX = { E: 5, n: 16, motes: 52, kick: 0, rot: 0, hit: 120 };
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

function roundedBody(m, x0, x1, y0, y1, depth, r, key, seg, open, along) {
  var extN = !(key & 1), extE = !(key & 2), extS = !(key & 4), extW = !(key & 8);
  var ix0 = x0 + (extW ? r : 0), ix1 = x1 - (extE ? r : 0);
  var iy0 = y0 + (extS ? r : 0), iy1 = y1 - (extN ? r : 0);
  var zb = -depth, k, c, nv = along || 1;

  /* ---- the front face: a fan from the middle, notched at bends. A
     body with something carved into its front ("open") leaves the face
     to the carver, and splits its edges into "along" pieces so the
     carved face can meet them vertex for vertex. ---- */
  if (!open) {
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
  }

  /* ---- edge rounds along each outer side ---- */
  if (extN) mPatch(m, seg, nv, function (u, v, o) {
    var ph = u * Math.PI / 2, s = Math.sin(ph), cc = Math.cos(ph);
    o[0] = ix0 + (ix1 - ix0) * v; o[1] = iy1 + r * s; o[2] = -r + r * cc; o[3] = 0; o[4] = s; o[5] = cc;
  });
  if (extS) mPatch(m, seg, nv, function (u, v, o) {
    var ph = u * Math.PI / 2, s = Math.sin(ph), cc = Math.cos(ph);
    o[0] = ix0 + (ix1 - ix0) * v; o[1] = iy0 - r * s; o[2] = -r + r * cc; o[3] = 0; o[4] = -s; o[5] = cc;
  });
  if (extE) mPatch(m, seg, nv, function (u, v, o) {
    var ph = u * Math.PI / 2, s = Math.sin(ph), cc = Math.cos(ph);
    o[0] = ix1 + r * s; o[1] = iy0 + (iy1 - iy0) * v; o[2] = -r + r * cc; o[3] = s; o[4] = 0; o[5] = cc;
  });
  if (extW) mPatch(m, seg, nv, function (u, v, o) {
    var ph = u * Math.PI / 2, s = Math.sin(ph), cc = Math.cos(ph);
    o[0] = ix0 - r * s; o[1] = iy0 + (iy1 - iy0) * v; o[2] = -r + r * cc; o[3] = -s; o[4] = 0; o[5] = cc;
  });

  /* ---- the sides themselves, back to the open rear ---- */
  if (depth > r + 1e-4) {
    if (extN) mPatch(m, nv, 1, function (u, v, o) { o[0] = ix0 + (ix1 - ix0) * u; o[1] = y1; o[2] = -r + (zb + r) * v; o[3] = 0; o[4] = 1; o[5] = 0; });
    if (extS) mPatch(m, nv, 1, function (u, v, o) { o[0] = ix0 + (ix1 - ix0) * u; o[1] = y0; o[2] = -r + (zb + r) * v; o[3] = 0; o[4] = -1; o[5] = 0; });
    if (extE) mPatch(m, nv, 1, function (u, v, o) { o[0] = x1; o[1] = iy0 + (iy1 - iy0) * u; o[2] = -r + (zb + r) * v; o[3] = 1; o[4] = 0; o[5] = 0; });
    if (extW) mPatch(m, nv, 1, function (u, v, o) { o[0] = x0; o[1] = iy0 + (iy1 - iy0) * u; o[2] = -r + (zb + r) * v; o[3] = -1; o[4] = 0; o[5] = 0; });
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
   faces are the walls and floor of the shaft, a coping stone along each
   side of the mouth and across its back, and the back wall far behind */
function addBody(m, kind, x0, x1, y0, y1, depth, r, key, zf, open, along) {
  var before = m.pos.length / 3, i;
  roundedBody(m, x0, x1, y0, y1, depth, r, key, SEG, open, along);
  for (i = before; i < m.pos.length / 3; i++) { m.kind.push(kind); if (zf) m.pos[i * 3 + 2] += zf; }
}
function addQuad(m, kind, ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz) {
  /* a, a+b, a+c, a+b+c */
  var i0 = mVert(m, ax, ay, az, nx, ny, nz), i1 = mVert(m, ax + bx, ay + by, az + bz, nx, ny, nz);
  var i2 = mVert(m, ax + cx, ay + cy, az + cz, nx, ny, nz), i3 = mVert(m, ax + bx + cx, ay + by + cy, az + bz + cz, nx, ny, nz);
  m.kind.push(kind, kind, kind, kind);
  mTri(m, i0, i1, i3); mTri(m, i0, i3, i2);
}
function buildShell(wallT, floorT, noLeftCope) {
  var m = newMesh(), d = SHAFT_D, t = wallT, r = Math.min(RAD, t * 0.45), rf = Math.min(RAD, floorT * 0.45);
  var cr = Math.min(0.13, COPE_H * 0.45), ov = Math.min(0.05, t * 0.25), top = LIP_Y + COPE_H * 0.5;
  /* the coping's ends are cut square and finished with a small chamfer,
     flush with the face of the pillar under them: a rounded end there
     read as the end of a pipe, not of a stone */
  var ce = 0.045;
  /* the pillars run up inside the coping, so no seam of sky shows
     between the two where their rounded edges meet */
  addBody(m, 1, -t, 0, 0, top, d, r, 4);                            /* left pillar */
  addBody(m, 1, W, W + t, 0, top, d, r, 4);                         /* right pillar */
  addBody(m, 1, -t, 0, -floorT, 0, d, rf, 1 | 2);                   /* bottom-left */
  addBody(m, 1, 0, W, -floorT, 0, d, rf, 2 | 8);                    /* floor */
  addBody(m, 1, W, W + t, -floorT, 0, d, rf, 1 | 8);                /* bottom-right */
  /* the coping: flush with the face and overhanging the walls a little,
     so its chamfered front edge catches the key light as a line */
  /* where the Keep niche's block sits on the mouth it takes the place
     of the left coping */
  if (!noLeftCope) addBody(m, 5, -t - ov, 0.16, LIP_Y, LIP_Y + COPE_H, d + 0.02, ce, 0, 0.0);
  addBody(m, 5, W - 0.16, W + t + ov, LIP_Y, LIP_Y + COPE_H, d + 0.02, ce, 0, 0.0);
  addBody(m, 5, 0.14, W - 0.14, LIP_Y, LIP_Y + COPE_H, 0.5, cr, 2 | 8, BACK_Z + 0.42);
  /* the back wall is not part of this mesh: it is one quad with a
     shader of its own (VS_BACK), drawn from its lit cache */
  return m;
}

/* The Keep niche: an alcove cut into a block of the well's own stone at
   the mouth, on the left. The block is one body; its front is carved
   here, not built from parts, so it reads as stone with a hollow in it
   rather than a frame round a box. The opening has a rounded, arched
   top and a flat sill for the piece to rest on; a bevel rolls the front
   into the alcove (kind 4, the lip that glows when Keep is there to
   use), and the alcove's walls and back are kind 3. Every point of the
   carved face meets the block's own edge rounds vertex for vertex. */
var NICHE_ALONG = 8, NICHE_BEV = 3;
function holeSd(x, y, h) {
  var px = x - h.cx, py = y - h.cy, r = py > 0 ? h.rt : h.rb;
  var qx = Math.abs(px) - h.hw + r, qy = Math.abs(py) - h.hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.sqrt(Math.max(qx, 0) * Math.max(qx, 0) + Math.max(qy, 0) * Math.max(qy, 0)) - r;
}
function buildNiche(bx0, bx1, by0, by1, ox0, ox1, oy0, oy1, inDepth, blockDepth, key) {
  var m = newMesh(), r = Math.min(RAD, (bx1 - bx0) * 0.2, (by1 - by0) * 0.2);
  var na = NICHE_ALONG, i, k, j;
  key = key || 0;
  addBody(m, 2, bx0, bx1, by0, by1, blockDepth, r, key, 0, true, na);
  var ix0 = bx0 + (key & 8 ? 0 : r), ix1 = bx1 - (key & 2 ? 0 : r), iy0 = by0 + (key & 4 ? 0 : r), iy1 = by1 - (key & 1 ? 0 : r);
  var hw = (ox1 - ox0) * 0.5, hh = (oy1 - oy0) * 0.5;
  var h = { cx: (ox0 + ox1) * 0.5, cy: (oy0 + oy1) * 0.5, hw: hw, hh: hh,
            rt: Math.min(hw, hh) * 0.9, rb: Math.min(hw, hh) * 0.16 };
  var rb = Math.min(0.11, Math.min(ox0 - ix0, ix1 - ox1, oy0 - iy0, iy1 - oy1) * 0.6);
  /* the block's front boundary, counter-clockwise from the bottom-right
     corner, at exactly the points its edge rounds were cut at */
  var A = [];
  for (k = 0; k < na; k++) A.push([ix1, iy0 + (iy1 - iy0) * (k / na)]);
  for (k = 0; k < na; k++) A.push([ix0 + (ix1 - ix0) * ((na - k) / na), iy1]);
  for (k = 0; k < na; k++) A.push([ix0, iy0 + (iy1 - iy0) * ((na - k) / na)]);
  for (k = 0; k < na; k++) A.push([ix0 + (ix1 - ix0) * (k / na), iy0]);
  var n = A.length, O = [], NN = [];
  for (i = 0; i < n; i++) {
    /* where the line from the opening's middle to this boundary point
       leaves the opening, and which way the opening's edge faces there */
    var lo = 0, hi = 1, ax = A[i][0], ay = A[i][1];
    for (j = 0; j < 48; j++) {
      var mid = (lo + hi) * 0.5;
      if (holeSd(h.cx + (ax - h.cx) * mid, h.cy + (ay - h.cy) * mid, h) < 0) lo = mid; else hi = mid;
    }
    var ox = h.cx + (ax - h.cx) * lo, oy = h.cy + (ay - h.cy) * lo, e = 1e-4;
    var gx = holeSd(ox + e, oy, h) - holeSd(ox - e, oy, h), gy = holeSd(ox, oy + e, h) - holeSd(ox, oy - e, h);
    var gl = Math.sqrt(gx * gx + gy * gy) || 1;
    O.push([ox, oy]); NN.push([gx / gl, gy / gl]);
  }
  function ring(i0, i1, zA, zB, fA, fB, kind) { /* a strip between two rings of points */
    for (var q = 0; q < n; q++) {
      var q1 = (q + 1) % n, pa = fA(q), pb = fA(q1), pc = fB(q), pd = fB(q1);
      var a0 = mVert(m, pa[0], pa[1], pa[2], pa[3], pa[4], pa[5]), a1 = mVert(m, pb[0], pb[1], pb[2], pb[3], pb[4], pb[5]);
      var c0 = mVert(m, pc[0], pc[1], pc[2], pc[3], pc[4], pc[5]), c1 = mVert(m, pd[0], pd[1], pd[2], pd[3], pd[4], pd[5]);
      m.kind.push(kind, kind, kind, kind);
      mTri(m, a0, a1, c1); mTri(m, a0, c1, c0);
    }
  }
  /* the carved front: block edge to the start of the bevel */
  ring(0, 0, 0, 0, function (q) { return [A[q][0], A[q][1], 0, 0, 0, 1]; },
       function (q) { return [O[q][0] + NN[q][0] * rb, O[q][1] + NN[q][1] * rb, 0, 0, 0, 1]; }, 2);
  /* the bevel, a quarter round from the front into the opening */
  for (k = 0; k < NICHE_BEV; k++) {
    (function (p0, p1) {
      function at(q, ph) {
        var sp = Math.sin(ph), cp = Math.cos(ph), u = 1 - sp;
        return [O[q][0] + NN[q][0] * rb * u, O[q][1] + NN[q][1] * rb * u, -rb + rb * cp, -NN[q][0] * sp, -NN[q][1] * sp, cp];
      }
      ring(0, 0, 0, 0, function (q) { return at(q, p0); }, function (q) { return at(q, p1); }, 4);
    })(k / NICHE_BEV * Math.PI / 2, (k + 1) / NICHE_BEV * Math.PI / 2);
  }
  /* the alcove's walls, straight back */
  ring(0, 0, 0, 0, function (q) { return [O[q][0], O[q][1], -rb, -NN[q][0], -NN[q][1], 0]; },
       function (q) { return [O[q][0], O[q][1], -inDepth, -NN[q][0], -NN[q][1], 0]; }, 3);
  /* and its back, a fan from the middle */
  var ctr = mVert(m, h.cx, h.cy, -inDepth, 0, 0, 1);
  m.kind.push(3);
  var first = -1, prev = -1;
  for (i = 0; i < n; i++) {
    var vi = mVert(m, O[i][0], O[i][1], -inDepth, 0, 0, 1);
    m.kind.push(3);
    if (first < 0) first = vi; else mTri(m, ctr, prev, vi);
    prev = vi;
  }
  mTri(m, ctr, prev, first);
  return { mesh: m, ox0: ox0, ox1: ox1, oy0: oy0, oy1: oy1, depth: inDepth, h: h };
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
   uniform buffer, written once a frame.

   The rule for anything drawn every frame: no loops, no noise, no pow
   where a multiply will do. Whatever is expensive and does not move is
   baked once into a texture — the world's stone when the world changes,
   a tile of fine noise when the renderer is made, the light the stack
   lets down the shaft when the stack changes — and read back with a
   tap or two. That is what pays for the depth, the glass and the lip. */
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
  vec4 uWallP;     /* stone B mix, landing strength, shaft depth, quality 0 simple 1 balanced 2 full */
  vec4 uMat0;      /* rough, rim, emissive, refract */
  vec4 uMat1;      /* subsurface, speckle, fibre, unlit */
  vec4 uMat2;      /* outline, glyph amount, mono, gloss */
  vec4 uFx0;       /* empty-well breath, a ripple is live, unbroken, end light */
  vec4 uFx1;       /* the skin's edge light, haze, the stone's polish, frame half-thickness */
  vec4 uDeep;      /* what the shaft falls away into, w the lip's height */
  vec4 uRing[4];   /* ripple rings: x, y, age, amplitude */
  vec4 uPal[12];   /* 0 warm white, 1..7 pieces, 8 silt, 9 glyph ink, 10 outline, 11 moon glyph */
  vec4 uMat3;      /* edge transmission, broad (1) or narrow (0), clear coat, paper (fibre across, ribs, lit from inside) */
  vec4 uMat4;      /* frosted sheen, a thicker middle, the wall seen through, spare */
  vec4 uSkyC;      /* the world's horizon, w the shaft's own breath of light */
  vec4 uSkyT;      /* the world's sky overhead, w how far up the shaft the Empty Well's light has risen */
};
`;

var GLSL_COMMON = `
#define PI 3.14159265
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float pow5(float x){ float x2 = x * x; return x2 * x2 * x; }
/* daylight falls in at the mouth and fades on the way down */
float mouth(float y){ float t = clamp((y + 1.0) / 23.5, 0.0, 1.0); return 0.06 + 0.94 * t * t * (1.7 - 0.7 * t); }
`;

/* Noise for the bakes only. Every lattice wraps, so a baked tile
   repeats without a seam: "per" is the period in lattice cells. */
var GLSL_NOISE = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hP(vec2 i, vec2 per){ return hash12(mod(i, per)); }
float vnP(vec2 p, vec2 per){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hP(i, per), hP(i + vec2(1.0, 0.0), per), u.x), mix(hP(i + vec2(0.0, 1.0), per), hP(i + vec2(1.0, 1.0), per), u.x), u.y);
}
float fbmP(vec2 p, vec2 per){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnP(p, per); p *= 2.0; per *= 2.0; a *= 0.5; }
  return s / 0.96875;
}
/* nearest and second-nearest feature of a wrapped cell field: x the
   distance to the nearest, y how far from the edge between two, z which */
vec3 vorP(vec2 p, vec2 per){
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 c = mod(i + g, per);
    vec2 o = vec2(hash12(c), hash12(c + 17.31)) * 0.76 + 0.12;
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash12(c + 5.13); } else if (d < d2) d2 = d;
  }
  d1 = sqrt(d1); d2 = sqrt(d2);
  return vec3(d1, d2 - d1, id);
}
`;

/* Filament's BRDF, the mobile environment-BRDF fit three.js uses
   (05 §9.3), and a studio made of arithmetic: a key softbox above and
   to the left, a strip behind the camera, and two cards at the sides
   for rounded edges to find. Each light is a spherical Gaussian — one
   exp2 apiece, the same shapes the pow() lobes made at a fraction of
   the cost. The studio takes its colours from the world, so a piece in
   Lanterns is lit warm and in Moon Pool cool, while the piece's own
   colour stays the piece's. */
var GLSL_BRDF = `
float D_GGX(float NoH, float a){ float a2 = a * a; float f = (NoH * a2 - NoH) * NoH + 1.0; return a2 / (PI * f * f + 1e-7); }
float V_SmithFast(float NoV, float NoL, float a){ float gv = NoL * (NoV * (1.0 - a) + a); float gl = NoV * (NoL * (1.0 - a) + a); return 0.5 / (gv + gl + 1e-5); }
vec2 DFG(float NoV, float rough){
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  return vec2(-1.04, 1.04) * a004 + r.zw;
}
const vec3 BOX = vec3(-0.3693, 0.8618, 0.4104);
const vec3 STRIP = vec3(0.0498, 0.4183, 0.9069);
const vec3 CARD_R = vec3(0.9465, 0.2618, -0.2014);
const vec3 CARD_L = vec3(-0.9719, 0.1822, -0.1489);
vec3 studioEnv(vec3 r, float rough){
  vec3 c = mix(uEnvLow.rgb, uEnvTop.rgb, clamp(r.y * 0.85 + 0.35, 0.0, 1.0));
  float s = 1.0 / (1.0 + rough * 6.0), q = sqrt(s);
  c += uKeyCol.rgb * (4.2 * q * exp2((dot(r, BOX) - 1.0) * 49.0 * s) + 0.32 * exp2((dot(r, STRIP) - 1.0) * 13.0 * s));
  c += uRimCol.rgb * q * (2.4 * exp2((dot(r, CARD_R) - 1.0) * 32.0 * s) + 1.1 * exp2((dot(r, CARD_L) - 1.0) * 32.0 * s));
  return c;
}
`;

/* The stone, read back. The world's pattern was baked into a tile of
   sixteen cells by sixteen (albedo, relief and polish together), so
   any surface reads it with one tap, two while one world fades into
   the next. The light the stack lets down the shaft lives in a small
   texture over the back wall, redrawn only when the stack moves. */
var GLSL_STONE = `
uniform sampler2D uStoneA, uStoneB, uShade, uOcc;
vec4 stoneAt(vec2 p){
  vec2 uv = p * 0.0625;
  vec4 a = texture(uStoneA, uv);
  if (uWallP.x > 0.002) a = mix(a, texture(uStoneB, uv), uWallP.x);
  return a;
}
/* the stone a little out of focus: the frame is dressed stone, and the
   courses cut for the shaft would only be a ruler's ticks on a pillar a
   fifth of a cell wide */
vec4 stoneLod(vec2 p, float lod){
  vec2 uv = p * 0.0625;
  vec4 a = textureLod(uStoneA, uv, lod);
  if (uWallP.x > 0.002) a = mix(a, textureLod(uStoneB, uv, lod), uWallP.x);
  return a;
}
/* danger cools and greys the stone; it never reddens it */
vec3 coolStone(vec3 c){ return mix(c, vec3(luma(c)) * vec3(0.84, 0.94, 1.12), uKeyCol.w * 0.45); }
float shadeAt(vec2 xy){ return texture(uShade, vec2(xy.x * 0.1, xy.y * (1.0 / 24.0))).r; }
float occAt(vec2 xy){ return texture(uOcc, vec2(xy.x * 0.1, xy.y * (1.0 / 24.0))).r; }
/* How the shaft is lit, shared by the back wall and the inner walls.
   Light comes in at the mouth: the key light only where it reaches past
   the stack, the sky overhead falling into the top six rows, and a fill
   that takes the colour of the world's horizon, so a shadow in Dawn goes
   mauve and one in Tide goes sea-green rather than brown. Down the shaft
   all of it falls from full at the mouth to a little over half at the
   floor, which is what makes it a well and not a box. Kept dark: the
   middle of the shaft stays under a relative luminance of 0.02 in every
   world, so every piece stands out against it by 7:1 or more. */
float shaftDepth(float y){ return mix(0.55, 1.0, clamp(y * 0.0444, 0.0, 1.0)); }
vec3 shaftFill(float fall){ return mix(uDeep.rgb, uSkyC.rgb * 0.55 + uDeep.rgb * 0.45, 0.4 + 0.6 * fall); }
vec3 skyFall(float y){ return uSkyT.rgb * smoothstep(16.0, 22.5, y); }
/* The back wall, lit: its stone, the light from the mouth that gets past
   the stack, the shaft's dark it falls away into, a little shade in the
   corners where it meets the walls and the floor, the faint grid laid on
   it from the eye so it lines up with the face's cells, and the haze of
   light hanging in front of it. None of it moves unless the stack, the
   world or the danger does, so it is drawn into a texture then (uBackC)
   and the wall itself reads one tap a frame. */
vec3 backWallLit(vec2 xy){
  float deep = uWallP.z;
  vec4 st = stoneAt(xy);
  vec3 alb = coolStone(st.rgb);
  vec4 sh = texture(uShade, vec2(xy.x * 0.1, xy.y * (1.0 / 24.0)));
  float lt = sh.r;
  float fall = exp2(-deep * 0.6);
  vec3 col = alb * (uKeyCol.rgb * 0.28 * lt * clamp(uKey.z * 0.5 + 0.55, 0.0, 1.0) * (0.5 + 0.5 * fall)
                  + shaftFill(fall) * 1.75 + skyFall(xy.y) * 2.0);
  float corner = smoothstep(-0.2, 1.2, min(min(xy.x, 10.0 - xy.x), xy.y + 0.2));
  col *= (0.6 + 0.4 * corner) * shaftDepth(xy.y);
  col += mix(uEnvTop.rgb, uKeyCol.rgb * 0.35, 0.5) * st.a * uFx1.z * 0.02 * (0.3 + 0.7 * lt);
  if (uWall.w > 0.0) {
    vec2 f = uEye.xy + (xy - uEye.xy) * (uEye.z / (uEye.z + deep));
    vec2 g = fract(f); vec2 dd = min(g, 1.0 - g); float d = min(dd.x, dd.y);
    col += uWall.rgb * uKeyCol.rgb * (1.0 - smoothstep(0.006, 0.022, d)) * uWall.w * 0.03 * (0.35 + 0.65 * lt);
  }
  if (uFx1.y > 0.0) {
    float yb = 22.5 - xy.y;
    vec2 bx = vec2(xy.x - 1.4 - yb * 0.52, xy.x - 6.6 - yb * 0.52);
    float beam = exp2(-bx.x * bx.x * 0.55) + 0.7 * exp2(-bx.y * bx.y * 0.8);
    col += uKeyCol.rgb * beam * uFx1.y * (0.2 + 0.8 * lt) * smoothstep(-1.0, 6.0, xy.y) * 0.8;
  }
  /* the bodies' own light on the stone behind them */
  col += sh.gba * (alb * 0.9 + 0.012) * uFx1.w;
  return col;
}
`;

var GLSL_LIVE = `
/* What moves in the shaft's light, added every frame over the still
   wall: Breath and a new chapter breathing it from the mouth, and the
   Empty Well's breath, a front of the key light climbing from the floor
   to the mouth and then letting go. Both are held well under the flash
   threshold by construction (ΔL 0.03 and about 0.06). */
vec3 shaftLive(vec3 col, float y){
  /* no branches: this runs on every pixel of the back wall, and a GPU
     that cannot skip a branch would pay for both sides */
  float b = uSkyC.w * (0.25 + 0.75 * clamp((y + 2.0) * 0.04, 0.0, 1.0));
  float e = uFx0.x * clamp((uSkyT.w + 2.5 - y) * 0.2857, 0.0, 1.0) * (1.0 - 0.012 * y);
  return col * (1.0 + 0.9 * b + 1.5 * e) + uKeyCol.rgb * (0.004 * b + 0.017 * e) + uSkyT.rgb * (0.05 * b);
}
`;

/* ---------- the bodies: every cell of every piece ---------- */
var VS_BLOCK = GLSL_HEAD + GLSL_FRAME + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
layout(location = 2) in vec4 iA;   /* pivot xyz, turn about z */
layout(location = 3) in vec4 iB;   /* offset from pivot xy, squash xy */
layout(location = 4) in vec4 iC;   /* colour, light, dissolve, flags */
layout(location = 5) in vec4 iD;   /* tilt x, tilt y, scale, and one more: the haze a
                                      preview hangs in, how opaque a fading body is,
                                      or -1 for the piece in hand */
out vec3 vLocal; out vec3 vLN; out vec3 vN; out vec3 vW; out vec2 vP;
flat out vec4 vC; flat out vec4 vD; flat out vec4 vF; flat out vec4 vE;
void main(){
  vLocal = aPos; vLN = aNrm;
  /* where on its body this point is, the same across all its cells: in
     the stack, the well's own cell grid; for anything that moves, the
     piece's own frame, so speckle and fibre ride with it */
  vP = aPos.xy + iB.xy + (mod(iC.w, 2.0) > 0.5 ? vec2(0.0) : iA.xy);
  /* the flags, unpacked once per vertex rather than per pixel:
     1 never dimmed, 2 / 4 a silt seam left / right, 8 a band of light,
     16..128 another body or the stone against its N, E, S, W side */
  float f = iC.w;
  vF = vec4(mod(f, 2.0), mod(floor(f / 2.0), 2.0), mod(floor(f / 4.0), 2.0), mod(floor(f / 8.0), 2.0));
  vE = vec4(mod(floor(f / 16.0), 2.0), mod(floor(f / 32.0), 2.0), mod(floor(f / 64.0), 2.0), mod(floor(f / 128.0), 2.0));
  vec3 p = aPos;
  /* a band of light going out draws each of its rows in toward the row's
     own midline, so it thins to lines of light rather than breaking up;
     with reduced motion it only fades */
  if (vF.w > 0.5 && iC.z > 0.0 && uRimCol.w > 0.5)
    p.y *= 1.0 - 0.8 * smoothstep(0.35, 0.9, clamp(iC.z * 1.3 - 0.15, 0.0, 1.0));
  p.z += 0.45;
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
  /* the piece in hand (marked -1) wins every depth test within about a
     tenth of a cell, so a row of light going out never covers it */
  if (iD.w < -0.5) gl_Position.z -= 0.03 * gl_Position.w;
}
`;

var FS_BLOCK = GLSL_HEAD + GLSL_FRAME + GLSL_COMMON + GLSL_BRDF + GLSL_STONE + `
uniform vec4 uVarS;         /* this variant's outer sides: N, E, S, W */
uniform vec4 uVarB;         /* and the insides of its bends: NE, SE, SW, NW */
uniform float uFade;        /* 1 while drawing bodies that are fading into light */
uniform sampler2D uDetail;  /* the baked tile of fine noise */
in vec3 vLocal; in vec3 vLN; in vec3 vN; in vec3 vW; in vec2 vP;
flat in vec4 vC; flat in vec4 vD; flat in vec4 vF; flat in vec4 vE;
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
float edgeDist(vec2 l){
  vec4 ds = mix(vec4(1.0), vec4(0.5 - l.y, 0.5 - l.x, l.y + 0.5, l.x + 0.5), uVarS);
  float d = min(min(ds.x, ds.y), min(ds.z, ds.w));
  if (dot(uVarB, uVarB) > 0.0) {
    vec4 db = mix(vec4(1.0), vec4(length(l - vec2(0.5, 0.5)), length(l - vec2(0.5, -0.5)),
                                  length(l + vec2(0.5, 0.5)), length(l - vec2(-0.5, 0.5))), uVarB);
    d = min(d, min(min(db.x, db.y), min(db.z, db.w)));
  }
  return max(d, 0.0);
}

/* the same outline, felt rather than measured: how much of the body's
   edge is near, summed over every outer side and bend, so where two
   edges meet their light adds instead of meeting along a mitred crease.
   Each edge's share falls off as (1 - 1.6 d)², which is within a few
   percent of exp2(-6 d) where it matters and costs no transcendentals. */
float edgeNear(vec2 l){
  vec4 ds = max(1.0 - 1.6 * vec4(0.5 - l.y, 0.5 - l.x, l.y + 0.5, l.x + 0.5), 0.0);
  float e = dot(uVarS, ds * ds);
  if (dot(uVarB, uVarB) > 0.0) {
    vec4 db = max(1.0 - 1.6 * vec4(length(l - vec2(0.5, 0.5)), length(l - vec2(0.5, -0.5)), length(l + vec2(0.5, 0.5)), length(l - vec2(-0.5, 0.5))), 0.0);
    e += dot(uVarB, db * db);
  }
  return e;
}

void main(){
  float fg = vF.x;
  vec3 warm = uPal[0].rgb;
  vec2 l = vLocal.xy;

  /* light from within: a clear, or a run's end, lights a body toward a
     colour between the world's key light and the skin's warm white, then
     lets it go. "fade" is how much of it is left; the clumps it goes out
     in are laid out in the well, not in each cell, and kept faint, so a
     row goes out as one soft band and never as a grid of tiles */
  float lightUp = fg > 0.5 ? 0.0 : vC.y;
  float fade = 1.0, prL = 0.0;
  if (vC.z > 0.0) {
    vec4 nz = texture(uDetail, vW.xy * 0.11 + vec2(vW.z * 0.23, 0.0));
    prL = clamp(vC.z * 1.3 - 0.15, 0.0, 1.0);
    float pr = clamp(prL + (nz.r - 0.5) * 0.12, 0.0, 1.0);
    /* it lets go only once it is fully lit: a band that thins while the
       piece colours still show through it goes grey, not bright */
    fade = 1.0 - smoothstep(0.5, 0.92, pr);
  }
  vec3 base = uPal[int(vC.x + 0.5)].rgb;
  float front = smoothstep(0.85, 0.97, vLN.z);

  /* stone speckle, paper fibre: one tap of the baked noise each */
  if (uMat1.y > 0.0) {
    vec4 dt = texture(uDetail, vP * 0.83 + vec2(vLocal.z * 0.29, 0.0));
    base *= 1.0 + uMat1.y * ((dt.g - 0.5) * 0.3 - dt.a * 0.12);
  }
  if (uMat1.z > 0.0) {
    /* paper: a cloudy, hand-laid sheet with a faint fibre running across
       the body, the way a lantern's paper is laid round its frame, and
       three ribs to a cell showing through it as faint shadows */
    float fb = texture(uDetail, vec2(vP.y * 0.55, vP.x * 0.07 + vLocal.z * 0.11)).b;
    float cloud = texture(uDetail, vP * 0.37 + vec2(vLocal.z * 0.17, 0.5)).r;
    float rd = abs(fract(vP.y * 3.0 + 0.5) - 0.5);
    base *= (1.0 + uMat1.z * ((fb - 0.5) * 0.06 + (cloud - 0.5) * 0.28)) * (1.0 - 0.06 * uMat3.w * (1.0 - smoothstep(0.03, 0.11, rd)));
  }

  /* glyphs: an inner motif on every cell's face */
  int gk = int(vC.x + 0.5);
  if (uMat2.y > 0.0 && gk >= 1 && gk <= 7 && front > 0.0) {
    float aa = max(fwidth(vLocal.x), 1e-4) * 0.9;
    float w = 0.026 + 0.012 * step(0.5, uMat2.y);
    float m = glyph(gk, l, w, aa) * front;
    vec3 gc = luma(base) > 0.3 ? base * 0.38 : mix(base, vec3(1.0), 0.6);
    if (uMat2.z > 0.5) gc = uPal[11].rgb;
    if (uMat1.w > 0.5) gc = uPal[9].rgb;
    base = mix(base, gc, m * min(1.0, uMat2.y));
  }

  /* where this body meets another body or the stone: a soft contact
     shadow in the groove between them, strongest at the meeting line */
  vec4 dside = vec4(0.5 - l.y, 0.5 - l.x, l.y + 0.5, l.x + 0.5);
  vec4 aoV = vE * exp2(-dside * 11.0);
  float contact = clamp(aoV.x + aoV.y + aoV.z + aoV.w, 0.0, 1.0) * (1.0 - front * 0.85);

  vec3 col;
  if (uMat1.w > 0.5) {
    /* Ink: no light at all. Flat fill, the sides a step darker so the
       stack still has a top, and a two-pixel light line round the outer
       edge of each piece, measured in real pixels */
    col = base * mix(0.5, 1.0, smoothstep(0.15, 0.6, vLN.z));
    float wpx = 2.0 / max(uKey.w * vD.z, 1.0);
    float d = edgeDist(l);
    float ol = (1.0 - smoothstep(wpx * 0.75, wpx * 1.25, d)) * step(0.2, vLN.z);
    col = mix(col, uPal[10].rgb, ol);
  } else {
    vec3 N = normalize(vN);
    vec3 V = normalize(uEye.xyz - vW);
    vec3 L = uKey.xyz;
    float NoV = max(dot(N, V), 1e-3);
    float NoL = dot(N, L);
    float rough = uMat0.x;
    float a = max(rough * rough, 0.004);
    vec3 H = normalize(V + L);
    float NoH = max(dot(N, H), 0.0);
    float fresH = pow5(1.0 - max(dot(L, H), 0.0));
    /* the stack sits in the shaft, so the light that reaches it fades a
       little with depth; the piece in hand is never dimmed */
    float shaft = fg > 0.5 ? 1.0 : mix(0.8, 1.0, smoothstep(-1.0, 20.0, vW.y));
    /* the back of a body is in the shaft's shade: its sides darken
       toward the rear, which is what makes a gap in the stack look deep */
    float rear = 1.0 - (1.0 - front) * smoothstep(-0.1, -0.85, vLocal.z) * 0.5;
    float ao = (1.0 - 0.5 * contact) * rear;
    vec3 keyC = uKeyCol.rgb * shaft;
    /* diffuse, wrapped so a piece is lit round its edges the way a
       translucent thing is; a face toward us lands near its own colour */
    float wrap = 0.3 + uMat1.x * 0.5;
    float diffL = max((NoL + wrap) / (1.0 + wrap), 0.0);
    vec3 diff = base * diffL * keyC * 0.36;
    vec3 irr = mix(uEnvLow.rgb, uEnvTop.rgb, N.y * 0.5 + 0.5);
    vec3 amb = base * (irr * 0.55 + 0.035);
    float nl = max(NoL, 0.0);
    vec3 spec = D_GGX(NoH, a) * V_SmithFast(NoV, nl, a) * (0.04 + 0.96 * fresH) * keyC * nl;
    /* glass and jelly carry a second, glassier coat: a small hard glint
       where a rounded edge turns toward the softbox (jelly's is the
       wet clear coat that makes it candy) */
    float coat = uMat2.w;
    if (coat > 0.4) spec += D_GGX(NoH, 0.0144) * V_SmithFast(NoV, nl, 0.12) * (0.04 + 0.96 * fresH) * keyC * nl * uMat3.z * (coat - 0.4);
    /* frosted glass: a broad, soft sheen of the softbox across the face */
    if (uMat4.x > 0.0) spec += exp2((NoH - 1.0) * 9.0) * (0.04 + 0.96 * fresH) * keyC * nl * uMat4.x * 0.9;
    /* the studio, reflected */
    vec3 R = reflect(-V, N);
    vec2 fab = DFG(NoV, rough);
    vec3 env = (uWallP.w > 0.5 ? studioEnv(R, rough) : mix(uEnvLow.rgb, uEnvTop.rgb, clamp(R.y * 0.85 + 0.35, 0.0, 1.0)) * 1.4)
             * ((0.045 + 0.035 * coat) * fab.x + fab.y);
    float f1 = 1.0 - NoV, f2 = f1 * f1, fres = f2 * f2;
    float glint = fg > 0.5 ? vC.y : 0.0;
    /* the world's rim light, from behind and to the right */
    vec3 rim = uRimCol.rgb * fres * uMat0.y * (1.0 + 0.6 * max(N.x, 0.0) + 0.3 * max(N.y, 0.0)) * (1.1 + 2.5 * glint);
    /* light that went in and came back out, saturated by the body */
    vec3 sss = base * base * uMat1.x * keyC * (0.10 + 0.55 * f2 + 0.12 * max(N.y, 0.0));
    /* glass and jelly are thin at their edges, and light comes through
       there: a soft glow just inside the outline of the whole body.
       Paper is lit from inside, so it glows most where it is furthest
       from its frame and least at its edges */
    /* one measure of the edge serves all three: the paper's glow, the
       light through the rim, and the thickness of the glass */
    float e6 = edgeNear(l), nearE = min(e6, 1.0);
    vec3 emi = base * uMat0.z * 0.4 * mix(1.0, 1.2 - 0.6 * nearE, uMat3.w);
    float inner = min(mix(e6 * e6, e6, uMat3.y), 1.3) * uFx1.x;
    vec3 thin = base * keyC * inner * uMat3.x + warm * inner * 0.025;
    col = (diff + amb + sss + emi + thin) * ao + (spec + env + rim) * mix(1.0, ao, 0.6);
    /* a pillow of light across each body's face: a little brighter
       under its top edge, a little deeper toward its bottom one */
    float dTop = mix(2.0, 0.5 - l.y, uVarS.x), dBot = mix(2.0, l.y + 0.5, uVarS.z);
    col *= 1.0 + front * (0.09 * exp2(-dTop * 7.2) - 0.11 * exp2(-dBot * 5.8));
    /* thick glass is darker in the middle of its face than at its edges */
    col *= 1.0 - uMat4.y * front * (1.0 - smoothstep(0.1, 0.7, e6));
    /* Sea Glass on the Full tier: the shaft behind, seen through the
       glass and bent by it, under a frosted, luminous body; the courses
       of the wall show through it faintly, as through real glass */
    if (uMat0.w > 0.0) {
      vec2 off = N.xy * uMat0.w * 40.0 + (vW.xy - uEye.xy) * (uWallP.z / uEye.z);
      vec2 wp = vW.xy + off;
      vec3 seen = stoneLod(wp, 2.4).rgb;
      vec3 behind = coolStone(seen) * (uKeyCol.rgb * 0.2 * shadeAt(wp) + uDeep.rgb * 0.8 + uSkyC.rgb * 0.3);
      float edge = 1.0 - front;
      col = col * (0.84 + 0.1 * edge) + base * behind * 5.5 + base * keyC * 0.03 * (0.5 + edge) + keyC * 0.012 * edge;
      /* frosted, so they come through blurred, and they slide behind the
         glass as it falls, because the wall is three cells further back:
         the stone against its own average brightness (the bake holds every
         world's stone to the wall colour's luminance, up to 0.2) */
      float ref = min(luma(uWall.rgb), 0.2) * 0.93;
      col *= 1.0 + clamp(luma(seen) / max(ref, 1e-3) - 1.0, -0.3, 0.3) * uMat4.z;
    }
    /* a preview hangs further off in the world's air the further it is */
    if (fg > 0.5 && vD.w > 0.0) col = mix(col, uSkyC.rgb * 0.9 + uSkyT.rgb * 0.35, vD.w);
  }
  /* The light a body is lit with: halfway between the world's key light
     and the skin's warm white, never a piece's own colour (brief §8.4.2),
     held to a relative luminance of about half. A cleared body keeps four
     tenths of its own shading as it lights, so it keeps its form until the
     band takes over; the band's colours then give way to the light as it
     goes, so what goes out is one band of light, not a mosaic. */
  if (lightUp > 0.0) {
    vec3 bandCol = (uKeyCol.rgb * 0.41667 + warm) * 0.5;
    col = mix(col, bandCol * 0.6, lightUp * (0.6 + 0.25 * smoothstep(0.0, 0.5, prL))) + bandCol * (lightUp * 0.08);
  }

  /* silt: a soft seam of light where the gap is */
  if (vF.y + vF.z > 0.0) {
    float seam = vF.y * exp2(-(l.x + 0.5) * 23.0) + vF.z * exp2(-(0.5 - l.x) * 23.0);
    col += warm * seam * 0.4;
  }
  /* The scene's alpha is the readability mask: 1 never dimmed, 0.04 the
     stack (free to glow, kept out of the danger tint), 0.02 the stone,
     0 the sky. The fading layer is premultiplied and keeps more of its
     light than of its body (alpha a², colour a(2 - a)), so a thinning
     band reads as light going out and never as smoke; its top and bottom
     are soft, and softer as it draws in; what sinks through the floor in
     a drain goes out of sight there; vD.w is how opaque it is while it
     takes over from the body it was. */
  if (uFade > 0.5) {
    float a = fade * smoothstep(-0.1, 0.08, vW.y);
    if (vF.w > 0.5) {
      float kc = uRimCol.w > 0.5 ? smoothstep(0.35, 0.9, prL) : 0.0;
      float fo = mix(0.2, 0.5, kc), fi = 0.5 * kc;
      /* a seam between two rows of the band is only softened once the
         rows draw apart; until then it is not an edge at all */
      float fN = uVarS.x > 0.5 ? smoothstep(0.0, fo, 0.5 - l.y) : (fi > 0.01 ? smoothstep(0.0, fi, 0.5 - l.y) : 1.0);
      float fS = uVarS.z > 0.5 ? smoothstep(0.0, fo, l.y + 0.5) : (fi > 0.01 ? smoothstep(0.0, fi, l.y + 0.5) : 1.0);
      a *= fN * fS;
    }
    float op = clamp(vD.w, 0.0, 1.0);
    outColor = vec4(col * (uEnvTop.w * op * a * (2.0 - a)), op * a * a);
  } else outColor = vec4(col * uEnvTop.w, mix(0.04, 1.0, fg));
}
`;

/* ---------- the stone: shaft, frame, lip, the niche ----------
   Kinds: 0 the back wall, 1 the frame (pillars, floor slab and the
   shaft's inner faces), 2 the niche's stone, 3 the inside of the niche,
   4 the niche's lip (it glows when Keep is there to use), 5 the coping
   along the mouth, polished by hands that are not there. */
var VS_WALL = GLSL_HEAD + GLSL_FRAME + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
layout(location = 2) in float aKind;
out vec3 vW; out vec3 vN; flat out float vKind;
void main(){ vW = aPos; vN = aNrm; vKind = aKind; gl_Position = uVP * vec4(aPos, 1.0); }
`;
var FS_WALL = GLSL_HEAD + GLSL_FRAME + GLSL_COMMON + GLSL_BRDF + GLSL_STONE + GLSL_LIVE + `
uniform vec4 uNiche;        /* glow, alpha to write, mini-cell scale, the niche's front z */
uniform vec4 uNicheO;       /* the opening: centre x, y, half width, half height */
uniform vec2 uNicheR;       /* its corner radii: top, bottom */
in vec3 vW; in vec3 vN; flat in float vKind;
/* how far outside the niche's opening a point of its face is */
float holeD(vec2 p){
  vec2 q = p - uNicheO.xy;
  float r = q.y > 0.0 ? uNicheR.x : uNicheR.y;
  vec2 d = abs(q) - uNicheO.zw + r;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}
out vec4 outColor;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uEye.xyz - vW);
  float NoV = max(dot(N, V), 1e-3);
  float deep = -vW.z;
  bool inside = vKind < 1.5 && vW.x > -0.01 && vW.x < 10.01 && vW.y > -0.01 && vW.z < -0.03;
  /* which two coordinates of the stone this face shows */
  vec2 p;
  if (abs(N.x) > 0.6) p = vec2(-vW.z + (vW.x < 5.0 ? 3.0 : 9.0), vW.y);
  else if (abs(N.y) > 0.6) p = vec2(vW.x, -vW.z + 5.0);
  else p = vW.xy + vec2(6.0, 0.0);
  if (vKind > 2.5 && vKind < 4.5) p = p * 1.35 + vec2(2.0, 9.0);
  vec4 st = inside ? stoneAt(p) : stoneLod(p, vKind > 1.5 && vKind < 4.5 ? 1.5 : 3.0);
  vec3 alb = coolStone(st.rgb);
  float polish = st.a * uFx1.z;
  vec3 R = reflect(-V, N);
  vec3 col;
  if (inside) {
    /* The shaft's inner walls and its floor. Light comes only from the
       mouth; they darken where a body stands against them, and the
       further in a point is the more it falls away into the world's own
       dark, which is what lets the shaft read as deep. */
    float lt, cont = 0.0, back = deep / uWallP.z;
    if (N.y > 0.6) {
      lt = shadeAt(vec2(vW.x, 0.35)) * 0.95;
      cont = occAt(vec2(vW.x, 0.5)) * smoothstep(-1.55, -0.88, vW.z);
    } else {
      float sx = vW.x < 5.0 ? 0.45 : 9.55;
      lt = shadeAt(vec2(sx, vW.y));
      cont = occAt(vec2(sx, vW.y)) * smoothstep(-1.55, -0.88, vW.z);
    }
    lt *= 1.0 - 0.7 * cont;
    float fall = exp2(-deep * 0.6);
    float wrapL = clamp(dot(N, uKey.xyz) * 0.5 + 0.55, 0.0, 1.0);
    col = alb * (uKeyCol.rgb * 0.3 * lt * wrapL * (0.5 + 0.5 * fall)
               + shaftFill(fall) * 1.8 * (1.0 - 0.45 * cont) + skyFall(vW.y) * 2.0 * (0.4 + 0.6 * fall));
    /* the crease where it meets the back wall */
    col *= (0.62 + 0.38 * smoothstep(1.0, 0.72, back)) * shaftDepth(vW.y);
    /* wet, icy or lacquered stone holds the mouth's light */
    float sheen = exp2((R.y - 1.0) * 5.0) * (0.03 + 0.5 * pow5(1.0 - NoV));
    col += mix(uEnvTop.rgb, uKeyCol.rgb * 0.35, 0.5) * sheen * polish * (0.3 + 0.7 * lt) * 0.7;
    if (N.y > 0.6) {
      /* the floor at the bottom of the shaft: a soft pool of the world's
         light where it lands, brightest toward the front; Breath breathes
         it with the rest of the shaft */
      col += uKeyCol.rgb * (0.003 + 0.016 * lt) * smoothstep(-uWallP.z, -0.2, vW.z) * (1.0 + 1.5 * uSkyC.w);
    }
    if (uFx1.y > 0.0) {
      float yb = 22.5 - vW.y;
      vec2 bx = vec2(vW.x - 1.4 - yb * 0.52, vW.x - 6.6 - yb * 0.52);
      float beam = exp2(-bx.x * bx.x * 0.55) + 0.7 * exp2(-bx.y * bx.y * 0.8);
      col += uKeyCol.rgb * beam * uFx1.y * (0.2 + 0.8 * lt) * smoothstep(-1.0, 6.0, vW.y) * min(deep, 2.0) * 0.4;
    }
    col = shaftLive(col, vW.y);
  } else {
    /* the frame, the lip and the niche, lit by the room */
    float rough = mix(0.72, 0.28, clamp(polish * 1.2, 0.0, 1.0));
    if (vKind > 4.5) rough = min(rough, 0.34);
    float a = rough * rough;
    vec3 L = uKey.xyz;
    float NoL = max(dot(N, L), 0.0);
    vec3 H = normalize(V + L);
    float NoH = max(dot(N, H), 0.0);
    float height = 0.6 + 0.4 * smoothstep(-1.0, 23.0, vW.y);
    vec3 irr = mix(uEnvLow.rgb, uEnvTop.rgb, N.y * 0.5 + 0.5);
    vec3 spec = D_GGX(NoH, a) * V_SmithFast(NoV, NoL, a) * (0.04 + 0.96 * pow5(1.0 - max(dot(L, H), 0.0))) * uKeyCol.rgb * NoL;
    vec2 fab = DFG(NoV, rough);
    vec3 env = mix(uEnvLow.rgb, uEnvTop.rgb, clamp(R.y * 0.85 + 0.35, 0.0, 1.0)) * (0.04 * fab.x + fab.y) * (0.3 + 0.7 * polish);
    if (vKind > 4.5) alb = mix(alb, vec3(luma(alb)) * 1.35, 0.35);
    col = alb * (uKeyCol.rgb * (NoL * 0.4 + 0.1) + irr * 0.6) * height + spec * (vKind > 4.5 ? 1.2 : 0.55) + env;
    /* the frame's own rim, the world's colour, where it turns away */
    col += uRimCol.rgb * pow5(1.0 - NoV) * 0.12;
    if (vKind < 2.5 || vKind > 4.5) {
      /* and its outer edges catch the world's rim light, so the well's
         silhouette reads as cut stone against any sky, even obsidian
         under stars: a line about a pixel and a half wide where the
         rounded edge turns outward */
      vec2 od = (vW.xy - vec2(5.0, 11.3)) / vec2(5.3, 11.9);
      float outward = max(dot(N.xy, normalize(od)), 0.0);
      col += uRimCol.rgb * 0.19 * smoothstep(0.3, 0.85, outward);
    }
    /* the coping breathes with the shaft */
    if (vKind > 4.5) col *= 1.0 + 0.35 * uSkyC.w;
    /* the lamp in the niche: the key light, warmed a little toward the rim */
    vec3 glowC = mix(uKeyCol.rgb * 0.42, uRimCol.rgb, 0.3);
    if (vKind > 1.5 && vKind < 2.5 && uNiche.x > 0.0) {
      /* the stone round the opening catches a little of it */
      col += glowC * uNiche.x * exp2(-max(holeD(vW.xy), 0.0) * 14.0) * 0.06;
    } else if (vKind > 3.5 && vKind < 4.5) {
      /* the bevel into the alcove: a faint edge of it, no more */
      col += glowC * uNiche.x * (0.7 + 0.3 * pow5(1.0 - NoV)) * 0.18;
    } else if (vKind > 2.5 && vKind < 3.5) {
      /* inside the niche: stone in its own shade, lit like the shaft's
         mouth so what is kept there always reads, and when Keep is ready
         light pooled on the sill and climbing the back of the alcove,
         the way a lamp lights the niche it stands in */
      float inD = clamp((uNiche.w - vW.z) / max(uNiche.z * 1.4 + 0.3, 0.3), 0.0, 1.0);
      col = alb * (uKeyCol.rgb * (0.07 + 0.09 * max(N.y, 0.0)) * (1.0 - 0.45 * inD) + (shaftFill(0.6) * 0.8 + irr * 0.35) * (1.0 - 0.3 * inD));
      vec2 q = (vW.xy - uNicheO.xy) / max(uNicheO.zw, vec2(0.05));
      float pool = exp2(-q.x * q.x * 0.8) * exp2(-(q.y + 1.0) * 0.75);
      col += uKeyCol.rgb * 0.45 * uNiche.x * pool * (alb * 3.2 + 0.02) * (0.75 * max(N.y, 0.0) + 0.6 * max(N.z, 0.0) + 0.3);
    }
  }
  outColor = vec4(col * uEnvTop.w, uNiche.y);
}
`;

/* The back wall itself: one quad far behind the pieces, made from
   gl_VertexID, reading its lit cache. It covers most of the well, so its
   shader is kept to a tap and the two effects that move. */
var VS_BACK = GLSL_HEAD + GLSL_FRAME + `
out vec2 vXY;
void main(){
  vXY = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * vec2(10.0, uDeep.w);
  gl_Position = uVP * vec4(vXY, -uWallP.z, 1.0);
}
`;
var FS_BACK = GLSL_HEAD + GLSL_FRAME + GLSL_COMMON + GLSL_LIVE + `
uniform sampler2D uBackC;
in vec2 vXY;
out vec4 outColor;
void main(){
  vec3 col = texture(uBackC, vec2(vXY.x * 0.1, vXY.y * (1.0 / 22.5))).rgb;
  /* a lock's ripple: a broad, faint ring of light through the stone,
     far below anything that could read as a flash */
  if (uFx0.y > 0.0) {
    for (int i = 0; i < 4; i++) {
      vec4 r = uRing[i];
      float d = length(vXY - r.xy) - r.z * 7.0;
      col += uKeyCol.rgb * uWall.rgb * exp2(-d * d * 1.3) * r.w * exp2(-r.z * 3.2) * 0.1;
    }
  }
  /* Breath, the Empty Well's one breath, and the light a finished run
     rises into, all held under the flash threshold by construction */
  col = shaftLive(col, vXY.y) + uKeyCol.rgb * uFx0.w * 0.02 * (0.4 + 0.6 * mouth(vXY.y));
  outColor = vec4(col * uEnvTop.w, 0.02);
}
`;

/* the back wall, lit, into its cache (see backWallLit) */
var FS_BACKC = GLSL_HEAD + GLSL_FRAME + GLSL_COMMON + GLSL_STONE + `
uniform vec2 uRes;
out vec4 outColor;
void main(){
  vec2 xy = gl_FragCoord.xy / uRes * vec2(10.0, 22.5);
  outColor = vec4(backWallLit(xy), 1.0);
}
`;

/* ---------- the stone, baked ----------
   Drawn once into a 16-by-16-cell tile whenever the world changes: the
   world's wall colour, the pattern its stone is cut in, the relief of
   that pattern lit from the mouth, and in alpha how polished it is.
   Nothing here runs per frame, so it may loop and layer noise freely. */
/* the well's soft shadow on the sky, laid into the sky's own small
   target each time the sky is drawn (it multiplies what is there) */
var FS_SKYSHADE = GLSL_HEAD + `
uniform vec2 uRes;
uniform vec4 uFr;      /* the well's frame in uv: x0, x1, y0, y1 */
uniform vec4 uSh;      /* aspect, strength, reach (in screen heights), spare */
out vec4 outColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 h = vec2((uFr.y - uFr.x) * 0.5, (uFr.w - uFr.z) * 0.5);
  vec2 q = abs(uv - vec2((uFr.x + uFr.y) * 0.5, (uFr.z + uFr.w) * 0.5 - h.y * 0.012)) - h;
  q.x *= uSh.x;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  outColor = vec4(0.0, 0.0, 0.0, uSh.y * exp2(-max(d, 0.0) / uSh.z));
}
`;

var FS_BAKE = GLSL_HEAD + GLSL_COMMON + GLSL_NOISE + `
uniform float uPat;
uniform vec3 uCol;
uniform vec2 uRes;
out vec4 outColor;
const float PER = 16.0;
/* ashlar: courses of cut blocks with a chamfer at every joint */
vec3 ashlar(vec2 p, float rows, float perRow){
  float ch = PER / rows;
  float r = floor(p.y / ch);
  float nb = perRow + mod(r, 3.0);
  float bl = PER / nb;
  float xo = p.x + hash12(vec2(mod(r, rows), 3.7)) * bl;
  float bi = floor(xo / bl);
  float fx = fract(xo / bl), fy = fract(p.y / ch);
  float e = min(min(fx, 1.0 - fx) * bl, min(fy, 1.0 - fy) * ch);
  return vec3(e, hash12(vec2(mod(bi, nb), mod(r, rows)) + 0.37), r);
}
void pat(vec2 p, out vec3 alb, out float h, out float gl){
  float id = uPat;
  /* the stone is the stage, never the show: a pale world's wall is held
     a little below the pieces' brightness, and its colour is kept quiet
     (about a third of the world's own saturation) so the world tints the
     shaft through its light, not through a coloured box */
  vec3 w = mix(vec3(luma(uCol)), uCol, 0.36) * min(1.0, 0.2 / max(luma(uCol), 1e-3));
  /* every pattern is larger than a cell and never lines up with the
     cells: the stone behind the game must not look like a second grid */
  if (id < 0.5) {            /* dawn: pale sandstone, big cut blocks, soft strata */
    vec3 a = ashlar(p, 6.0, 4.0);
    float strata = fbmP(vec2(p.x * 0.25, p.y * 1.5), vec2(4.0, 24.0));
    float grain = vnP(p * 8.0, vec2(128.0));
    h = smoothstep(-0.02, 0.14, a.x) * (0.94 + 0.06 * strata);
    alb = w * (0.92 + 0.1 * a.y) * (0.9 + 0.18 * strata + 0.04 * grain) * mix(0.92, 1.0, smoothstep(0.0, 0.12, a.x)) * vec3(1.02, 1.0, 0.98);
    gl = 0.06;
  } else if (id < 1.5) {     /* tide: worn sea stones, wet in the joints */
    vec3 v = vorP(p * 0.5, vec2(8.0));
    float mott = fbmP(p * 1.0, vec2(16.0));
    h = smoothstep(0.0, 0.3, v.y) * (1.0 - 0.2 * v.x);
    alb = w * (0.88 + 0.16 * v.z) * (0.9 + 0.18 * mott) * mix(0.9, 1.0, smoothstep(0.0, 0.22, v.y));
    gl = mix(0.7, 0.32, smoothstep(0.0, 0.14, v.y));
  } else if (id < 2.5) {     /* rain on leaves: rubble stone, moss in the joints */
    vec3 v = vorP(p * 0.625, vec2(10.0));
    float b = fbmP(p * 1.0, vec2(16.0));
    float moss = smoothstep(0.5, 0.75, fbmP(p * 0.5 + 3.0, vec2(8.0))) * 0.5 + (1.0 - smoothstep(0.0, 0.24, v.y)) * 0.3;
    h = smoothstep(0.0, 0.22, v.y) * (0.86 + 0.14 * b);
    alb = w * (0.88 + 0.14 * v.z) * (0.9 + 0.18 * b) * mix(vec3(1.0), vec3(0.86, 1.06, 0.82), clamp(moss, 0.0, 1.0)) * mix(0.92, 1.0, smoothstep(0.0, 0.2, v.y));
    gl = 0.12 + 0.16 * clamp(moss, 0.0, 1.0);
  } else if (id < 3.5) {     /* bamboo: a faint rhythm of upright stalks, in a quiet sage */
    float sw = PER / 10.0;
    float sx = fract(p.x / sw);
    float prof = sqrt(max(1.0 - (2.0 * sx - 1.0) * (2.0 * sx - 1.0), 0.0));
    float k = floor(p.x / sw);
    float ny = fract(p.y * 0.3125 + hash12(vec2(mod(k, 10.0), 1.3)));
    float node = exp2(-pow(abs(ny - 0.5) * 16.0, 2.0));
    float fib = vnP(vec2(p.x * 16.0, p.y * 1.0), vec2(256.0, 16.0));
    h = 0.84 + 0.16 * prof - 0.04 * node;
    alb = vec3(luma(w)) * vec3(0.80, 1.09, 0.70) * (0.9 + 0.1 * prof + 0.04 * fib) * (1.0 - 0.05 * node) * (0.96 + 0.08 * hash12(vec2(mod(k, 10.0), 7.0)));
    gl = 0.2 + 0.06 * prof;
  } else if (id < 4.5) {     /* aurora: ice, long soft streaks and a few held bubbles */
    vec3 v = vorP(p * 0.375, vec2(6.0));
    float s = fbmP(vec2(p.x * 0.5 + p.y * 0.25, p.y * 0.5), vec2(8.0, 8.0));
    float bub = smoothstep(0.08, 0.0, length(fract(p * 2.0) - 0.5) - 0.02) * step(0.95, hash12(mod(floor(p * 2.0), 32.0)));
    h = 0.8 + 0.2 * smoothstep(0.0, 0.3, v.y) - 0.08 * s;
    alb = w * (0.88 + 0.18 * s + 0.06 * v.z) * vec3(0.95, 1.0, 1.08) + bub * 0.1;
    gl = 0.78;
  } else if (id < 5.5) {     /* moon pool: wet basalt columns */
    float cw = PER / 11.0;
    float ci = floor(p.x / cw), fx = fract(p.x / cw);
    float tone = hash12(vec2(mod(ci, 11.0), 3.0));
    float facet = smoothstep(0.0, 0.16, fx) * smoothstep(1.0, 0.84, fx);
    float b = fbmP(p * vec2(0.5, 0.25), vec2(8.0, 4.0));
    h = facet * (0.88 + 0.12 * b) + 0.15 * abs(fx - 0.5);
    alb = w * (0.82 + 0.16 * tone + 0.1 * b) * (0.92 + 0.08 * facet);
    gl = 0.62;
  } else if (id < 6.5) {     /* lanterns: lacquered wooden boards */
    float bw = PER / 10.0;
    float bi = floor(p.x / bw), fx = fract(p.x / bw);
    float grain = fbmP(vec2(p.x * 4.0, p.y * 0.5) + hash12(vec2(mod(bi, 10.0), 2.0)) * 9.0, vec2(64.0, 8.0));
    float ring = 0.5 + 0.5 * sin((p.y * 1.3 + grain * 4.0 + bi * 1.7) * 3.1);
    float gap = smoothstep(0.0, 0.08, fx) * smoothstep(1.0, 0.92, fx);
    h = gap * (0.94 + 0.06 * ring);
    alb = w * (0.86 + 0.1 * ring + 0.08 * grain) * mix(0.88, 1.0, gap) * (0.95 + 0.1 * hash12(vec2(mod(bi, 10.0), 5.0)));
    gl = 0.58 * gap;
  } else if (id < 7.5) {     /* snowfall: frosted blocks, a few fixed glints */
    vec3 a = ashlar(p, 5.0, 3.0);
    float b = fbmP(p * 1.0, vec2(16.0));
    float frost = smoothstep(0.45, 0.8, vnP(p * 6.0, vec2(96.0))) * 0.5 + (1.0 - smoothstep(0.0, 0.2, a.x)) * 0.15;
    float glint = step(0.988, hash12(mod(floor(p * 24.0), 384.0)));
    h = smoothstep(-0.02, 0.14, a.x) * (0.92 + 0.08 * b);
    alb = w * (0.92 + 0.1 * b + 0.06 * a.y) * mix(0.92, 1.0, smoothstep(0.0, 0.12, a.x)) + vec3(0.03, 0.033, 0.04) * frost + glint * 0.2;
    gl = 0.12 + glint * 0.85;
  } else if (id < 8.5) {     /* mountain bells: granite, big blocks, flecked */
    vec3 a = ashlar(p, 4.0, 3.0);
    float b = fbmP(p * 0.75, vec2(12.0));
    float hh = hash12(mod(floor(p * 22.0), 352.0));
    float fleck = hh > 0.9 ? 0.08 : (hh < 0.1 ? -0.07 : 0.0);
    h = smoothstep(-0.02, 0.14, a.x) * (0.94 + 0.06 * b);
    alb = w * (0.9 + 0.12 * b + 0.06 * a.y + fleck) * mix(0.92, 1.0, smoothstep(0.0, 0.12, a.x));
    gl = 0.2;
  } else {                   /* starfield: obsidian, scalloped where it was struck */
    vec3 v = vorP(p * 0.375, vec2(6.0));
    float b = fbmP(p * 0.5, vec2(8.0));
    h = 0.6 + 0.4 * v.x * v.x - 0.15 * smoothstep(0.08, 0.0, v.y);
    alb = w * (0.86 + 0.12 * b + 0.08 * v.z);
    gl = 0.88;
  }
}
void main(){
  vec2 p = gl_FragCoord.xy / uRes * PER;
  vec3 alb, a1, a2; float h, h1, h2, gl, g1, g2;
  float e = PER / uRes.x;
  pat(p, alb, h, gl);
  pat(p + vec2(e, 0.0), a1, h1, g1);
  pat(p + vec2(0.0, e), a2, h2, g2);
  /* relief from the height, lit from above and a little to the left, the
     way the mouth lights the shaft; joints and hollows gather shade */
  vec3 n = normalize(vec3((h - h1) / e * 0.014, (h - h2) / e * 0.014, 1.0));
  vec3 lb = normalize(vec3(-0.35, 0.8, 0.5));
  float relief = clamp(dot(n, lb) / lb.z, 0.92, 1.08);
  float cav = mix(0.95, 1.0, clamp(h, 0.0, 1.0));
  outColor = vec4(clamp(alb * relief * cav, 0.0, 1.0), clamp(gl, 0.0, 1.0));
}
`;

/* a tile of fine noise, baked once: soft (r), finer (g), fibre (b),
   flecks (a). It wraps, so any coordinate reads it. */
var FS_DETAIL = GLSL_HEAD + GLSL_NOISE + `
uniform vec2 uRes;
out vec4 outColor;
void main(){
  vec2 u = gl_FragCoord.xy / uRes;
  float r = fbmP(u * 6.0, vec2(6.0));
  float g = vnP(u * 24.0, vec2(24.0)) * 0.6 + vnP(u * 48.0, vec2(48.0)) * 0.4;
  float b = vnP(vec2(u.x * 64.0, u.y * 6.0), vec2(64.0, 6.0)) * 0.6 + vnP(vec2(u.x * 128.0, u.y * 12.0), vec2(128.0, 12.0)) * 0.4;
  float a = step(0.88, hash12(mod(floor(u * 64.0), 64.0)));
  outColor = vec4(r, g, b, a);
}
`;

/* the light the stack lets down the shaft, onto the back wall: drawn
   into a 40 x 96 texture whenever the stack or the piece in hand moves,
   so the wall reads it in one tap instead of a dozen. Its other three
   channels carry the glow the bodies themselves give the wall behind
   them — glass and paper pass light, and the stone takes on a
   little of their colour, softly, like light through a window. */
var FS_SHADE = GLSL_HEAD + GLSL_COMMON + `
uniform sampler2D uOcc, uOccC;
uniform vec4 uSh;      /* where the key light crosses the stack, as an offset in cells; softness */
out vec4 outColor;
float oc(vec2 xy){ vec2 t = texture(uOcc, vec2(xy.x * 0.1, xy.y * (1.0 / 24.0))).rg; return max(t.r, t.g * 0.85); }
void main(){
  vec2 xy = gl_FragCoord.xy * vec2(0.25, 0.25);
  vec2 k = xy + uSh.xy;
  float s = uSh.z;
  float ks = oc(k) * 0.36 + (oc(k + vec2(s, 0.0)) + oc(k - vec2(s, 0.0)) + oc(k + vec2(0.0, s)) + oc(k - vec2(0.0, s))) * 0.16;
  float so = oc(xy + vec2(0.0, 1.3)) * 0.3 + oc(xy + vec2(0.0, 2.8)) * 0.25 + oc(xy + vec2(0.0, 4.6)) * 0.2
           + (oc(xy + vec2(0.9, 2.2)) + oc(xy - vec2(0.9, 2.2))) * 0.12;
  float light = mouth(xy.y) * (1.0 - clamp(ks * 0.72 + so * 0.42, 0.0, 0.9));
  vec2 u = vec2(xy.x * 0.1, xy.y * (1.0 / 24.0)), e = vec2(0.1, 1.0 / 24.0);
  vec3 glow = texture(uOccC, u).rgb * 0.26
            + (texture(uOccC, u + vec2(e.x, 0.0)).rgb + texture(uOccC, u - vec2(e.x, 0.0)).rgb
             + texture(uOccC, u + vec2(0.0, e.y)).rgb + texture(uOccC, u - vec2(0.0, e.y)).rgb) * 0.12
            + (texture(uOccC, u + e * 1.6).rgb + texture(uOccC, u - e * 1.6).rgb
             + texture(uOccC, u + vec2(e.x, -e.y) * 1.6).rgb + texture(uOccC, u + vec2(-e.x, e.y) * 1.6).rgb) * 0.065;
  outColor = vec4(light, glow);
}
`;

/* ---------- light: pools, rails, ticks, trails, bands, beads ----------
   One instanced quad that knows a dozen shapes. All of it is added
   light. */
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
out vec4 outColor;
void main(){
  vec2 uv = vUV;
  float shape = vB.z, prm = vB.w, a = 0.0;
  if (shape < 0.5) {                       /* soft disc, gone by the quad's edge */
    float r2 = dot(uv, uv);
    a = exp2(-r2 * 4.6) * max(1.0 - r2, 0.0);
  } else if (shape < 1.5) {                /* soft-edged rectangle */
    vec2 e = smoothstep(vec2(1.0), vec2(1.0) - vec2(prm, prm * vB.x / max(vB.y, 1e-3)), abs(uv));
    a = e.x * e.y;
  } else if (shape < 2.5) {                /* a pool of light spilling down a face from its top edge */
    float t = 1.0 - (uv.y * 0.5 + 0.5);
    float x2 = uv.x * uv.x;
    a = exp2(-t * 6.06) * (1.0 - x2 * x2 * x2);
  } else if (shape < 3.5) {                /* hairline: prm px wide, faded along its length */
    float d = abs(uv.x) * vB.x * uKey.w;
    a = (1.0 - smoothstep(prm * 0.5 - 0.6, prm * 0.5 + 0.6, d)) * mix(vD.x, 1.0, uv.y * 0.5 + 0.5);
  } else if (shape < 4.5) {                /* ring */
    float r = (length(uv) - 0.82) * 10.0;
    a = exp2(-r * r * 1.4427);
  } else if (shape < 5.5) {                /* band of soft light */
    float yy = uv.y * uv.y;
    a = exp2(-yy * 5.2) * (1.0 - yy) * smoothstep(1.0, 0.86, abs(uv.x));
  } else if (shape < 6.5) {                /* a bead: a lit pearl and its glow */
    float r2 = dot(uv, uv);
    float body = smoothstep(1.0, 0.82, r2) * (0.35 + 0.65 * (1.0 - r2));
    vec2 hv = uv - vec2(-0.32, 0.38);
    float hi = exp2(-dot(hv, hv) * 31.7);
    a = body * prm * 0.8 + hi * (0.15 + 0.3 * prm) + exp2(-r2 * 1.6) * vD.x;
  } else if (shape < 7.5) {                /* rounded frame line, inset param3 inside its quad */
    vec2 h = vB.xy;
    vec2 q2 = abs(uv * h) - (h - vec2(vD.y) - vec2(prm));
    float d = length(max(q2, 0.0)) + min(max(q2.x, q2.y), 0.0) - prm;
    float w = vD.x;
    a = exp2(-(d * d) / (w * w) * 1.4427);
  } else if (shape < 8.5) {                /* trail: bright where it lands, fading up */
    float t = 1.0 - (uv.y * 0.5 + 0.5);
    a = t * sqrt(t) * smoothstep(1.0, 0.55, abs(uv.x));
  } else {                                 /* pip */
    float r = length(uv);
    float aa = 1.4 / max(vB.x * uKey.w, 1.0);
    a = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  }
  /* light on the never-dimmed layer adds exactly 2 to alpha, so the
     composite can tell it apart from what it lies on (see FS_COMP) */
  outColor = vec4(vC.rgb * vC.a * a * uEnvTop.w, vD.z * 2.0);
}
`;

/* ---------- ribbons: the Twist's pearl light ----------
   A strip of 96 segments whose shape is a function, not a buffer: a
   loop round the T that passes behind it, or a ribbon running the length
   of a cleared row. The row's ribbon is a helix: its face turns once
   round the row as it runs, so it goes edge-on twice and the light on it
   swells and thins the way light does on a turning ribbon of satin. It
   is brightest at its head, its tail goes out over half a row, and its
   colour runs from the world's key light to its rim light. The depth
   test does the rest — where the loop goes behind the piece, the piece
   hides it. */
var RIB_SEG = 96;
var VS_RIBBON = GLSL_HEAD + GLSL_FRAME + `
uniform vec4 uR0;   /* kind, head, tail, width */
uniform vec4 uR1;   /* centre x, y, radius x, radius y */
uniform vec4 uR2;   /* colour, intensity */
uniform vec4 uR3;   /* depth swing, twist rate, phase, turns */
out float vU; out float vSide; out float vS; out float vTw;
vec3 curve(float s){
  if (uR0.x < 0.5) {
    float ang = uR3.w * s * 6.2831853 + uR3.z;
    return vec3(uR1.x + cos(ang) * uR1.z, uR1.y + sin(ang) * uR1.w * 0.55 + (s - 0.5) * 0.9, -0.42 + sin(ang) * uR3.x);
  }
  /* along the row, inside the shaft: it never crosses the frame */
  return vec3(0.06 + s * 9.88, uR1.y + sin(s * 3.14159) * 0.05, 0.32);
}
void main(){
  int seg = gl_VertexID / 2;
  float side = float(gl_VertexID - seg * 2) * 2.0 - 1.0;
  float u = float(seg) / 95.0;
  float s = uR0.y - uR0.z * (1.0 - u);
  vec3 p = curve(s);
  if (uR0.x < 0.5) {
    vec3 p2 = curve(s + 0.004);
    vec2 t = p2.xy - p.xy; t /= max(length(t), 1e-5);
    float tw = cos(s * uR3.y * 1.3 + uR3.z);
    p.xy += vec2(-t.y, t.x) * side * uR0.w * (0.2 + 0.8 * abs(tw));
    vTw = abs(tw);
  } else {
    float th = s * 6.2831853 * uR3.w + uR3.z;
    p.y += side * uR0.w * cos(th);
    p.z += side * uR0.w * sin(th);
    vTw = cos(th);
  }
  vU = u; vSide = side; vS = s;
  gl_Position = uVP * vec4(p, 1.0);
}
`;
var FS_RIBBON = GLSL_HEAD + GLSL_FRAME + `
uniform vec4 uR0;
uniform vec4 uR2;
in float vU; in float vSide; in float vS; in float vTw;
out vec4 outColor;
void main(){
  if (vS < 0.0 || vS > 1.0) discard;
  float across = 1.0 - vSide * vSide;
  vec3 c; float a;
  if (uR0.x < 0.5) {
    a = across * smoothstep(0.0, 0.35, vU) * smoothstep(1.0, 0.92, vU) * 0.6 + smoothstep(0.9, 1.0, vU) * (1.0 - abs(vSide)) * 0.8;
    c = uR2.rgb * (0.82 + 0.18 * cos(6.2831853 * (vS * 1.3 + vec3(0.0, 0.33, 0.67))));
  } else {
    /* how squarely its face is turned to us: edge-on it is a thread of
       light, face-on a broad pearl sheen */
    float face = abs(vTw);
    float f2 = face * face;
    float sheen = 0.12 + 0.88 * face + 0.7 * f2 * f2 * f2;
    float head = exp2(-(1.0 - vU) * (1.0 - vU) * 160.0);
    a = across * (vU * vU * 0.75 + head * 0.9) * sheen;
    vec3 kc = uKeyCol.rgb / max(max(uKeyCol.r, max(uKeyCol.g, uKeyCol.b)), 1e-3);
    vec3 rc = uRimCol.rgb / max(max(uRimCol.r, max(uRimCol.g, uRimCol.b)), 1e-3);
    c = mix(kc, rc, clamp(vS, 0.0, 1.0)) * (0.86 + 0.14 * cos(6.2831853 * (vS * 0.2 + vec3(0.0, 0.33, 0.67))));
    c = mix(c, vec3(1.0), head * 0.35) * uR2.rgb;
  }
  outColor = vec4(c * a * uR2.a * uEnvTop.w, 0.0);
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
  if (kind < 0.5) return exp2(-r2 * 6.5);
  if (kind < 1.5) { float r = sqrt(r2); vec2 hv = uv - vec2(-0.32, 0.36); return smoothstep(1.0, 0.82, r) * (0.18 + 0.82 * smoothstep(0.5, 0.86, r)) + exp2(-dot(hv, hv) * 49.0) * 0.9; }
  if (kind < 2.5) { vec2 q = vec2(uv.x * (1.0 + 0.6 * max(uv.y, 0.0)), uv.y); float d = length(q * vec2(1.35, 1.0)); float rr = (length(uv) - 0.85) / 0.06; return exp2(-d * d * 5.77) + exp2(-rr * rr * 1.4427) * 0.35; }
  if (kind < 3.5) { vec2 q = uv * vec2(1.0, 2.4); return smoothstep(1.0, 0.7, length(q)) * (0.75 + 0.25 * smoothstep(0.1, 0.0, abs(uv.y))); }
  if (kind < 4.5) { float c = exp2(-r2 * 23.0); float x = exp2(-abs(uv.x) * 23.0 - uv.y * uv.y * 4.3) + exp2(-abs(uv.y) * 23.0 - uv.x * uv.x * 4.3); return c + x * 0.55; }
  if (kind < 5.5) return exp2(-r2 * 10.1);
  if (kind < 6.5) { vec2 q = abs(uv); return (1.0 - smoothstep(0.5, 0.72, max(q.x * 0.85, q.y * 1.3))) * 0.85 + exp2(-r2 * 4.3) * 0.3; }
  if (kind < 7.5) return exp2(-r2 * 3.46) * 0.9;
  if (kind < 8.5) { vec2 q = uv * vec2(1.0, 1.65); float d = length(q - vec2(0.0, -0.1)); float xs = uv.x * 6.0; return smoothstep(1.0, 0.72, d) * (1.0 - 0.5 * exp2(-xs * xs * 1.4427) * step(0.55, uv.y)); }
  return exp2(-abs(uv.x * uv.y) * 57.7 - r2 * 2.3) + exp2(-r2 * 26.0);
}
void main(){
  float a = shapeOf(vKind, vUV) * vA;
  outColor = vec4(vCol * a * uEnvTop.w, 0.0);
}
`;

/* ---------- full screen: sky, bloom, composite ---------- */
var VS_FULL = GLSL_HEAD + `
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
/* The sky is drawn as a frame round the well rather than over the whole
   target: the well's face hides everything behind it, and on a phone
   that face is more than half the screen. Four quads, made from
   gl_VertexID alone, with the same vUv the sky's own shader expects. */
var VS_SKYFRAME = GLSL_HEAD + `
uniform vec4 uHole;   /* the face of the well in uv: x0, y0, x1, y1 */
out vec2 vUv;
void main(){
  int q = gl_VertexID / 6, k = gl_VertexID - q * 6;
  float cx = (k == 1 || k == 4 || k == 5) ? 1.0 : 0.0;
  float cy = (k == 2 || k == 3 || k == 5) ? 1.0 : 0.0;
  vec4 r = q == 0 ? vec4(0.0, 0.0, 1.0, uHole.y) : (q == 1 ? vec4(0.0, uHole.w, 1.0, 1.0)
         : (q == 2 ? vec4(0.0, uHole.y, uHole.x, uHole.w) : vec4(uHole.z, uHole.y, 1.0, uHole.w)));
  vec2 p = vec2(mix(r.x, r.z, cx), mix(r.y, r.w, cy));
  vUv = p;
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
  vec2 dv = (uv - uWell) * vec2(uRes.x / uRes.y, 1.0);
  c += hor * (0.22 + 0.1 * uReact) * exp2(-dot(dv, dv) * 3.75);
  c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))) * vec3(0.88, 0.96, 1.1), uDanger * 0.3);
  outColor = vec4(c, 1.0);
}
`;
/* Bloom, the dual filter (ARM's, 05 §9.5): the first step reads four
   bilinear taps of the scene, each already the average of four pixels,
   Karis-weighted so a single hot pixel cannot become a firefly; each
   step down is five taps, each step up four — the same 3 x 3 tent the
   thirteen-tap filters make, for a third of the reads. The first step
   honours the readability mask: what must never be washed does not get
   to wash anything else either. */
var FS_BRIGHT = GLSL_HEAD + `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform vec2 uInv; uniform vec4 uP;  /* threshold, knee, decode, encode */
out vec4 outColor;
vec3 S(vec2 uv){
  vec4 c = texture(uSrc, uv);
  float fg = max(clamp(mod(c.a, 2.0) * 1.0204 - 0.0204, 0.0, 1.0), step(1.5, c.a));
  return c.rgb * uP.z * (1.0 - fg);
}
float karis(vec3 c){ return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
void main(){
  vec2 uv = gl_FragCoord.xy * uInv;
  vec3 a = S(uv + vec2(-1.0, -1.0) * uTexel), b = S(uv + vec2(1.0, -1.0) * uTexel);
  vec3 c = S(uv + vec2(-1.0, 1.0) * uTexel), d = S(uv + vec2(1.0, 1.0) * uTexel);
  float wa = karis(a), wb = karis(b), wc = karis(c), wd = karis(d);
  vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
  float br = max(col.r, max(col.g, col.b));
  float soft = clamp(br - uP.x + uP.y, 0.0, 2.0 * uP.y); soft = soft * soft / (4.0 * uP.y + 1e-4);
  col *= max(soft, br - uP.x) / max(br, 1e-4);
  outColor = vec4(max(col, 0.0) * uP.w, 1.0);
}
`;
var FS_DOWN = GLSL_HEAD + `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform vec2 uInv;
out vec4 outColor;
void main(){
  vec2 uv = gl_FragCoord.xy * uInv;
  vec3 col = texture(uSrc, uv).rgb * 4.0
           + texture(uSrc, uv + vec2(-1.0, -1.0) * uTexel).rgb + texture(uSrc, uv + vec2(1.0, -1.0) * uTexel).rgb
           + texture(uSrc, uv + vec2(-1.0, 1.0) * uTexel).rgb + texture(uSrc, uv + vec2(1.0, 1.0) * uTexel).rgb;
  outColor = vec4(max(col * 0.125, 0.0), 1.0);
}
`;
var FS_UP = GLSL_HEAD + `
uniform sampler2D uSrc; uniform vec2 uR; uniform vec2 uInv; uniform float uGain;
out vec4 outColor;
void main(){
  vec2 uv = gl_FragCoord.xy * uInv;
  vec3 col = texture(uSrc, uv + vec2(-1.0, -1.0) * uR).rgb + texture(uSrc, uv + vec2(1.0, -1.0) * uR).rgb
           + texture(uSrc, uv + vec2(-1.0, 1.0) * uR).rgb + texture(uSrc, uv + vec2(1.0, 1.0) * uR).rgb;
  outColor = vec4(col * 0.25 * uGain, 1.0);
}
`;
/* The last step. The sky goes in under whatever the scene left
   uncovered, with the well's own soft shadow worked out here rather
   than drawn. Khronos PBR Neutral keeps base colours true while rolling
   off highlights (the palette is the pieces' identity, and a per-channel
   filmic curve would shift the yellows); the skin then grades it; the
   vignette and the danger tint stay off the mask; on the Full tier a
   five-tap edge filter takes the stair-steps off silhouettes; grain is
   fixed in place so it dithers the dark gradients without crawling. */
var FS_COMP = GLSL_HEAD + GLSL_FRAME + GLSL_COMMON + GLSL_LIVE + `
uniform sampler2D uScene, uBloom, uSky, uBackC;
uniform vec4 uC0;      /* bloom amount, vignette, grain, edge AA on */
uniform vec4 uC1;      /* exposure, danger, danger edge desaturation, P3 */
uniform vec4 uC2;      /* texel x, y, decode scene, decode bloom */
uniform vec4 uC3;      /* the well's face in uv: x0, x1, y0, y1 */
uniform vec4 uC5;      /* spare, spare, spare, bloom on */
uniform vec4 uB0;      /* the back wall: where its corner lands (uv), its top in its own units, drawn here */
uniform vec4 uB1;      /* and the matrix from screen uv to its own units */
uniform vec3 uLift, uGamma, uGain;
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
/* sRGB's curve from three square roots (Ian Taylor's fit, within a
   quarter of an 8-bit level everywhere): a fraction of the cost of pow()
   on every pixel of the screen */
vec3 encodeSRGB(vec3 c){
  c = clamp(c, 0.0, 1.0);
  vec3 s1 = sqrt(c), s2 = sqrt(s1), s3 = sqrt(s2);
  return mix(c * 12.92, 0.662002687 * s1 + 0.684122060 * s2 - 0.323583601 * s3 - 0.0225411470 * c, step(0.0031308, c));
}
float lumT(vec3 c){ float l = dot(c, vec3(0.299, 0.587, 0.114)); return l / (1.0 + l); }
float hashP(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
/* What lies under a pixel the scene left open. Inside the shaft it is
   the back wall: a plane square to the lens, so screen and wall are one
   affine map apart, and the wall is read from its lit cache here rather
   than drawn — half the well's pixels saved a write. Outside, the sky,
   with the well's soft shadow already laid on it (FS_SKYSHADE). */
vec3 openAt(vec2 uv){
  vec2 t = mat2(uB1.xy, uB1.zw) * (uv - uB0.xy);
  if (uB0.w > 0.5 && t.x >= 0.0 && t.x <= 1.0 && t.y >= 0.0 && t.y <= uB0.z) {
    vec3 col = texture(uBackC, t).rgb;
    vec2 xy = t * vec2(10.0, 22.5);
    /* a lock's ripple: a broad, faint ring of light through the stone,
       far below anything that could read as a flash */
    if (uFx0.y > 0.0) {
      for (int i = 0; i < 4; i++) {
        vec4 r = uRing[i];
        float d = length(xy - r.xy) - r.z * 7.0;
        col += uKeyCol.rgb * uWall.rgb * exp2(-d * d * 1.3) * r.w * exp2(-r.z * 3.2) * 0.1;
      }
    }
    /* Breath, the Empty Well's one breath, and the light a finished run
       rises into, all held under the flash threshold by construction */
    return shaftLive(col, xy.y) + uKeyCol.rgb * uFx0.w * 0.02 * (0.4 + 0.6 * mouth(xy.y));
  }
  return texture(uSky, uv).rgb;
}
/* the scene's alpha: 0 nothing drawn, 0.02 the stone, 0.04 the stack, 1
   never dimmed, and 2 more where never-dimmed light (the landing light)
   lies on any of them */
bool isOpen(float a){ return mod(a, 2.0) < 0.01; }
void main(){
  vec2 uv = gl_FragCoord.xy * uC2.xy;
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(uScene, ip, 0);
  vec3 c = s.rgb * uC2.z;
  float fg = max(clamp(mod(s.a, 2.0) * 1.0204 - 0.0204, 0.0, 1.0), step(1.5, s.a));
  bool open = isOpen(s.a);
  vec3 sk = vec3(0.0);
  if (open) { sk = openAt(uv); c += sk; }
  if (uC0.w > 0.5 && !open) {
    ivec2 hi = textureSize(uScene, 0) - 1;
    vec4 tN = texelFetch(uScene, min(ip + ivec2(0, 1), hi), 0), tS = texelFetch(uScene, max(ip - ivec2(0, 1), ivec2(0)), 0);
    vec4 tE = texelFetch(uScene, min(ip + ivec2(1, 0), hi), 0), tW = texelFetch(uScene, max(ip - ivec2(1, 0), ivec2(0)), 0);
    bool oN = isOpen(tN.a), oS = isOpen(tS.a), oE = isOpen(tE.a), oW = isOpen(tW.a);
    if (oN || oS || oE || oW) sk = openAt(uv);
    vec3 cN = tN.rgb * uC2.z + (oN ? sk : vec3(0.0));
    vec3 cS = tS.rgb * uC2.z + (oS ? sk : vec3(0.0));
    vec3 cE = tE.rgb * uC2.z + (oE ? sk : vec3(0.0));
    vec3 cW = tW.rgb * uC2.z + (oW ? sk : vec3(0.0));
    float lM = lumT(c), lN = lumT(cN), lS = lumT(cS), lE = lumT(cE), lW = lumT(cW);
    float mx = max(lM, max(max(lN, lS), max(lE, lW))), mn = min(lM, min(min(lN, lS), min(lE, lW)));
    if (mx - mn > max(0.0312, 0.125 * mx)) {
      float hz = abs(lN + lS - 2.0 * lM), vt = abs(lE + lW - 2.0 * lM);
      c = mix(c, hz > vt ? (cN + cS) * 0.5 : (cE + cW) * 0.5, 0.36);
    }
  }
  /* bloom is light spilling, not paint: a third of its colour is let go,
     so a pink piece glows warm on the stone rather than throwing a red
     halo */
  if (uC5.w > 0.5) { vec3 bl = texture(uBloom, uv).rgb; c += mix(bl, vec3(dot(bl, vec3(0.2126, 0.7152, 0.0722))), 0.35) * uC2.w * uC0.x * (1.0 - fg); }
  c *= uC1.x;
  vec2 d = uv - 0.5;
  float r2 = dot(d * vec2(1.0, 1.15), d * vec2(1.0, 1.15)) * 2.2;
  /* danger: the edges of the screen and of the well cool and grey —
     the sky and the stone only. The stack is the player's to read, so it
     keeps its colour (scene alpha 0.04 marks it) */
  if (uC1.y > 0.0) {
    float stack = 1.0 - step(0.008, abs(mod(s.a, 2.0) - 0.04));
    float keep = (1.0 - fg) * (1.0 - stack);
    float outside = max(max(uC3.x - uv.x, uv.x - uC3.y), 0.0);
    float nw = min(abs(uv.x - uC3.x), abs(uv.x - uC3.y)) * 26.0;
    float nearWall = exp2(-nw * nw * 1.4427) * step(uC3.z, uv.y) * step(uv.y, uC3.w);
    float edge = clamp(smoothstep(0.12, 0.95, r2) + nearWall * 0.6 + smoothstep(0.0, 0.25, outside) * 0.4, 0.0, 1.0) * keep;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c, vec3(l) * vec3(0.82, 0.93, 1.12), uC1.y * uC1.z * edge);
    c *= 1.0 - uC1.y * 0.22 * smoothstep(0.1, 1.0, r2) * keep;
  }
  c = neutral(max(c, 0.0));
  c = uGain * (c + uLift * (1.0 - c));
  if (uGamma != vec3(1.0)) c = pow(max(c, 0.0), 1.0 / uGamma);
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
var UBO_FLOATS = 152;
var MAXI = 900;           /* body instances */
var MAXS = 256;           /* light sprites, all layers */
/* light sprites go in one list and one draw: added light does not care
   in which order it is added. The last 96 places are kept for the
   never-dimmed layer, so no burst of effects can crowd out the landing
   light. */
var S_FG_RESERVE = 96;
var MAXP = 1500;          /* particles, the Full tier's cap */
var MAXM = 48;            /* motes hanging in the shaft */
var FXC = 520;            /* cells that are dissolving */
var STONE_PX = 512;       /* the baked stone tile, 16 cells a side */
var SHADE_W = 40, SHADE_H = 96;
var BACKC_W = 320, BACKC_H = 720;

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
  var wallT = 0.25, floorT = 0.5, shellNoCope = false;
  var shellGeo = buildShell(wallT, floorT, false);
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
  var spr = new Float32Array(MAXS * 16), sprN = 0;
  var pData = new Float32Array(MAXP * 16), pHead = 0, pLo = MAXP, pHi = -1, pLiveUntil = -1e9;
  var mData = new Float32Array(MAXM * 16), mHead = 0;
  var occData = new Uint8Array(W * 24 * 2), occDirty = true, shadeDirty = true;
  var occCol = new Uint8Array(W * 24 * 4);
  var backDirty = true, backDanger = -1, backGrid = -1, backHaze = -1;
  var Pm = new Float32Array(16), Vm = new Float32Array(16), PV = new Float32Array(16), VP = new Float32Array(16);
  var mirB = new Uint8Array(W * ROWS), mirP = new Uint16Array(W * ROWS);
  var tmpGrid = new Int32Array(W * ROWS), tmpV = new Uint8Array(W * ROWS), tmpKB = new Uint8Array(W * ROWS), tmpFl = new Uint8Array(W * ROWS);
  var rowOff = new Float32Array(ROWS), tmpOff = new Float32Array(ROWS), clearedRow = new Uint8Array(ROWS);
  var hist = new Uint16Array(512), cadence = new Float32Array(240), cadN = 0, cadHead = 0;

  /* ---------- options, skin, world ---------- */
  var O = { landing: true, grid: "faint", lockLight: true, motion: "full", juice: "medium",
            nudge: 1, labels: true, steady: false, previews: 5 };
  var SK = {
    id: "seaglass", unlit: false, outline: false, mono: false, refract: 0.02, bloomCap: 1,
    rough: 0.3, rim: 0.7, emissive: 0, sss: 0.35, speckle: 0, fibre: 0, gloss: 0.4, inner: 0.75, glow: 0.09,
    trans: 0.5, tfall: 1, coatK: 0.35, paper: 0, sheen: 0.25, thick: 0.1, see: 0.8,
    glyph: 0, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], landing: 0.75
  };
  var pal = new Float32Array(48);
  function worldState() {
    return { idx: 0, id: "dawn", pattern: 0, wall: [0, 0, 0], key: [0, 0, 0], rim: [0, 0, 0],
             top: [0, 0, 0], hor: [0, 0, 0], pcol: [0, 0, 0], pkind: 0, pdir: 1, pdrift: 0.4,
             psize: 0.5, motion: 1, skey: "" };
  }
  var WA = worldState(), WB = worldState(), wMix = 1, wT0 = -1, wDur = 2.5;
  var cur = { wall: [0, 0, 0], key: [0, 0, 0], rim: [0, 0, 0], top: [0, 0, 0], hor: [0, 0, 0],
              envTop: [0, 0, 0], envLow: [0, 0, 0], deep: [0, 0, 0] };

  /* ---------- the layout, as world coordinates ---------- */
  var cssW = 1, cssH = 1, dprIn = 1, Lay = null;
  var cellXpx = 30, cellYpx = 30, winL = -1, winT = 23, winR = 11, winB = -1;
  var renderScale = 1, pxPerCell = 30;
  var wellUV = [0.5, 0.5], wellNDC = [0, 0];
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
    /* the sky never passes 1.0 (sky.js keeps it so), and 8-bit sRGB
       holds its dark gradients as well as a float target would */
    F.sky = { fmt: gl.SRGB8_ALPHA8 };
    if (cbf) {
      if (probe(gl.RGBA16F)) F.scene = { fmt: gl.RGBA16F, enc: 1 };
      if (probe(gl.R11F_G11F_B10F)) F.hdr = { fmt: gl.R11F_G11F_B10F, enc: 1 };
      else if (probe(gl.RGBA16F)) F.hdr = { fmt: gl.RGBA16F, enc: 1 };

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
    P.plain = compile(VS_SKYFRAME, FS_SKY_PLAIN);
    P.bright = compile(VS_FULL, FS_BRIGHT);
    P.down = compile(VS_FULL, FS_DOWN);
    P.up = compile(VS_FULL, FS_UP);
    P.comp = compile(VS_FULL, FS_COMP);
    P.bake = compile(VS_FULL, FS_BAKE);
    P.detail = compile(VS_FULL, FS_DETAIL);
    P.shade = compile(VS_FULL, FS_SHADE);
    P.backc = compile(VS_FULL, FS_BACKC);
    P.back = compile(VS_BACK, FS_BACK);
    P.skyshade = compile(VS_FULL, FS_SKYSHADE);
    var SkyMod = root.Sky;
    P.sky = null;
    if (SkyMod && typeof SkyMod.FRAG === "string") {
      /* sky.js's own fragment shader, under our vertex shader: the same
         vUv it expects, drawn only where the well does not cover it */
      try { P.sky = compile(VS_SKYFRAME, SkyMod.FRAG); } catch (e) { P.sky = null; }
    }
    var names = ["block", "wall", "sprite", "ribbon", "part", "plain", "bright", "down", "up", "comp", "bake", "detail", "shade", "backc", "back", "skyshade"];
    for (var i = 0; i < names.length; i++) if (!linked(P[names[i]], names[i])) { R.stats.lastError = lastError; return false; }
    usingFallbackSky = !(P.sky && linked(P.sky, "sky"));
    if (usingFallbackSky) { if (P.sky) gl.deleteProgram(P.sky.p); P.sky = P.plain; }
    R.stats.fallbackSky = usingFallbackSky;

    frameBlock(P.block); frameBlock(P.wall); frameBlock(P.sprite); frameBlock(P.ribbon); frameBlock(P.part); frameBlock(P.backc); frameBlock(P.back);
    var stoneU = ["uStoneA", "uStoneB", "uShade", "uOcc"];
    locs(P.block, ["uVarS", "uVarB", "uFade", "uDetail"].concat(stoneU));
    locs(P.wall, ["uNiche", "uNicheO", "uNicheR"].concat(stoneU));
    locs(P.back, ["uBackC"]);
    locs(P.skyshade, ["uRes", "uFr", "uSh"]);
    locs(P.backc, ["uRes"].concat(stoneU));
    locs(P.ribbon, ["uR0", "uR1", "uR2", "uR3"]);
    locs(P.part, ["uNow"]);
    /* uAnchor and uMouth are offered to sky.js for composing a tall
       screen (see passSky); a sky that does not declare them gets null
       locations, and setting a null location is a no-op */
    var skyU = ["uRes", "uTime", "uA", "uB", "uMix", "uReact", "uMotion", "uDanger", "uTopA", "uHorA", "uTopB", "uHorB", "uWell", "uHole", "uAnchor", "uMouth"];
    locs(P.plain, skyU);
    if (P.sky !== P.plain) locs(P.sky, skyU);
    locs(P.bright, ["uSrc", "uTexel", "uInv", "uP"]);
    locs(P.down, ["uSrc", "uTexel", "uInv"]);
    locs(P.up, ["uSrc", "uR", "uInv", "uGain"]);
    locs(P.comp, ["uScene", "uBloom", "uSky", "uBackC", "uC0", "uC1", "uC2", "uC3", "uC5", "uB0", "uB1", "uLift", "uGamma", "uGain"]);
    frameBlock(P.comp);
    locs(P.bake, ["uPat", "uCol", "uRes"]);
    locs(P.detail, ["uRes"]);
    locs(P.shade, ["uOcc", "uOccC", "uSh"]);
    /* the samplers never move: units 1 occupancy, 2 shade, 3 / 4 stone A
       and B, 5 the noise tile */
    gl.useProgram(P.block.p);
    gl.uniform1i(P.block.u.uOcc, 1); gl.uniform1i(P.block.u.uShade, 2);
    gl.uniform1i(P.block.u.uStoneA, 3); gl.uniform1i(P.block.u.uStoneB, 4); gl.uniform1i(P.block.u.uDetail, 5);
    gl.useProgram(P.wall.p);
    gl.uniform1i(P.wall.u.uOcc, 1); gl.uniform1i(P.wall.u.uShade, 2);
    gl.uniform1i(P.wall.u.uStoneA, 3); gl.uniform1i(P.wall.u.uStoneB, 4);
    gl.useProgram(P.back.p); gl.uniform1i(P.back.u.uBackC, 6);
    gl.useProgram(P.backc.p);
    gl.uniform1i(P.backc.u.uOcc, 1); gl.uniform1i(P.backc.u.uShade, 2);
    gl.uniform1i(P.backc.u.uStoneA, 3); gl.uniform1i(P.backc.u.uStoneB, 4);
    gl.useProgram(P.shade.p); gl.uniform1i(P.shade.u.uOcc, 1); gl.uniform1i(P.shade.u.uOccC, 3);
    gl.useProgram(P.comp.p);
    gl.uniform1i(P.comp.u.uScene, 0); gl.uniform1i(P.comp.u.uBloom, 6); gl.uniform1i(P.comp.u.uSky, 7); gl.uniform1i(P.comp.u.uBackC, 5);
    gl.useProgram(null);

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

    /* where the stack is, for the stone to be shaded by it, and its colours */
    X.occ = texOf(W, 24, gl.RG8, gl.LINEAR, gl.CLAMP_TO_EDGE, 1);
    X.occC = texOf(W, 24, gl.RGBA8, gl.LINEAR, gl.CLAMP_TO_EDGE, 1);
    /* the light that reaches the back wall past the stack */
    X.shade = targetOf(SHADE_W, SHADE_H, gl.RGBA8, gl.LINEAR, gl.CLAMP_TO_EDGE, 1);
    /* the back wall, lit, at 32 texels a cell */
    X.backc = targetOf(BACKC_W, BACKC_H, gl.SRGB8_ALPHA8, gl.LINEAR, gl.CLAMP_TO_EDGE, 1);
    backDirty = true;
    /* the tile of fine noise, baked now and kept */
    X.detail = targetOf(128, 128, gl.RGBA8, gl.LINEAR, gl.REPEAT, 1);
    /* two tiles of stone: the world on show, and the one fading in */
    var levels = Math.floor(Math.log(STONE_PX) / Math.LN2) + 1;
    X.stone = [targetOf(STONE_PX, STONE_PX, gl.SRGB8_ALPHA8, gl.LINEAR_MIPMAP_LINEAR, gl.REPEAT, levels),
               targetOf(STONE_PX, STONE_PX, gl.SRGB8_ALPHA8, gl.LINEAR_MIPMAP_LINEAR, gl.REPEAT, levels)];
    stoneKey[0] = stoneKey[1] = "";
    occDirty = true; shadeDirty = true; pLo = 0; pHi = MAXP - 1;

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    bakeDetail();
    T = {}; targetsKey = "";
    ready = true;
    return true;
  }
  function texOf(w, h, fmt, filt, wrap, levels) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, levels, fmt, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }
  function targetOf(w, h, fmt, filt, wrap, levels) {
    var t = { w: w, h: h, tex: texOf(w, h, fmt, filt, wrap, levels), fb: gl.createFramebuffer(), depth: null };
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return t;
  }
  function bakeDetail() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, X.detail.fb);
    gl.viewport(0, 0, 128, 128);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.useProgram(P.detail.p);
    gl.uniform2f(P.detail.u.uRes, 128, 128);
    gl.bindVertexArray(V.empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  /* The world's stone, baked into slot k: drawn once when a world
     arrives, then mipmapped so the shaft's inner walls, seen edge-on,
     do not shimmer. A few milliseconds on a phone, once per world. */
  var stoneKey = ["", ""], slotA = 0, slotB = 0;
  function bakeStone(k, ws) {
    if (stoneKey[k] === ws.skey) return;
    stoneKey[k] = ws.skey;
    var t = X.stone[k];
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, STONE_PX, STONE_PX);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.useProgram(P.bake.p);
    gl.uniform1f(P.bake.u.uPat, ws.pattern);
    gl.uniform3f(P.bake.u.uCol, ws.wall[0], ws.wall[1], ws.wall[2]);
    gl.uniform2f(P.bake.u.uRes, STONE_PX, STONE_PX);
    gl.bindVertexArray(V.empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    backDirty = true;
  }
  function uploadNiche() {
    gl.bindVertexArray(V.niche);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.nicheV); gl.bufferData(gl.ARRAY_BUFFER, nicheData, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.nicheI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, nicheIdx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }
  function uploadShell() {
    gl.bindVertexArray(V.shell);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.shellV); gl.bufferData(gl.ARRAY_BUFFER, shellData, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.shellI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, shellIdx, gl.STATIC_DRAW);
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
    /* what makes each material read as itself, beyond the brief's numbers:
       glass lets the key light through a broad band inside its edge, is
       darker through its thick middle, carries a frosted sheen and shows
       the wall's courses faintly through it; jelly has a wet clear coat;
       paper's fibre runs across it, its ribs show, and it glows from
       inside. River Stone needs none of it. */
    var glass = id === "seaglass";
    SK.trans = glass ? 0.5 : 0.2; SK.tfall = glass ? 1 : 0;   /* broad band inside the edge, or narrow */
    SK.coatK = id === "jelly" ? 1.2 : 0.35;
    SK.paper = id === "lantern" || (SK.fibre > 0.3 && !glass) ? 1 : 0;
    SK.sheen = glass ? 0.25 : 0; SK.thick = glass ? 0.1 : 0; SK.see = glass ? 0.8 : 0;
    var g = m.grade || {};
    vec3of(g.lift, 0, SK.lift); vec3of(g.gamma, 1, SK.gamma); vec3of(g.gain, 1, SK.gain);
    for (var i = 0; i < 3; i++) if (!(SK.gamma[i] > 0.05)) SK.gamma[i] = 1;
    /* glyphs: the player's choice, unless the skin insists */
    var gl3 = glyphs || "off";
    if (skin.glyphs === "strong" || SK.unlit || SK.mono) gl3 = "strong";
    SK.glyph = gl3 === "strong" ? (SK.unlit ? 1 : 0.62) : (gl3 === "subtle" ? 0.24 : 0);
    SK.landing = SK.unlit ? 1 : 0.8;
    /* how much of its colour a body lends the stone behind it */
    SK.glow = SK.unlit ? 0 : (id === "lantern" || id === "seaglass" || id === "jelly" ? 0.09 : (SK.mono ? 0.05 : 0.025));
    occDirty = true;
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
    /* which baked stone this world needs, worked out once, here */
    ws.skey = ws.pattern + ":" + ws.wall[0].toFixed(4) + "," + ws.wall[1].toFixed(4) + "," + ws.wall[2].toFixed(4);
  }
  function copyWorld(d, s) {
    d.idx = s.idx; d.id = s.id; d.pattern = s.pattern; d.pkind = s.pkind; d.pdir = s.pdir;
    d.pdrift = s.pdrift; d.psize = s.psize; d.motion = s.motion; d.skey = s.skey;
    for (var i = 0; i < 3; i++) {
      d.wall[i] = s.wall[i]; d.key[i] = s.key[i]; d.rim[i] = s.rim[i];
      d.top[i] = s.top[i]; d.hor[i] = s.hor[i]; d.pcol[i] = s.pcol[i];
    }
  }
  function domWorld() { return wMix >= 0.5 ? WB : WA; }
  /* the two stone tiles follow the two worlds: A's stone stays where it
     is, B's goes in the other slot, and a world already baked is never
     baked twice */
  function ensureStone() {
    if (stoneKey[0] === WA.skey) slotA = 0;
    else if (stoneKey[1] === WA.skey) slotA = 1;
    else { slotA = stoneKey[0] === WB.skey ? 1 : 0; bakeStone(slotA, WA); }
    if (WB.skey === WA.skey) { slotB = slotA; return; }
    if (stoneKey[1 - slotA] !== WB.skey) bakeStone(1 - slotA, WB);
    slotB = 1 - slotA;
  }

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
    if (born + life > pLiveUntil) pLiveUntil = born + life;
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
    /* motes in the light of the shaft, like dust in a sunbeam: a small
       ring of their own, drawn as light sprites set back in the shaft
       where the stack can hide them, on real time so a hit-stop never
       freezes the air */
    var cap = motesCap();
    if (cap <= 0) return;
    ambT += dt;
    var every = 10 / cap;
    while (ambT > every) {
      ambT -= every;
      var ws = domWorld(), o = (mHead % cap) * 16;
      mHead = (mHead + 1) % cap;
      mData[o] = 0.3 + rnd() * 9.4; mData[o + 1] = rnd() * 22; mData[o + 2] = 0.12 + rnd() * 0.2; mData[o + 3] = 0.05 + rnd() * 0.06;
      mData[o + 4] = (rnd() - 0.5) * 0.08; mData[o + 5] = ws.pdir * (0.04 + rnd() * 0.1); mData[o + 6] = 0; mData[o + 7] = 0;
      mData[o + 8] = now; mData[o + 9] = 8 + rnd() * 6; mData[o + 10] = rnd(); mData[o + 11] = 0;
      mData[o + 12] = mixf(ws.key[0], ws.pcol[0], 0.3) * 0.9; mData[o + 13] = mixf(ws.key[1], ws.pcol[1], 0.3) * 0.9;
      mData[o + 14] = mixf(ws.key[2], ws.pcol[2], 0.3) * 0.9; mData[o + 15] = -1.0 - rnd() * (SHAFT_D - 1.25);
    }
  }
  function motesCap() { return (motionFull() && TT().motes > 0) ? Math.min(MAXM, TT().motes) : 0; }

  /* ---------- the piece in hand ---------- */
  var A = {
    on: false, type: 0, rot: 0, x: 0, y: 0, tx: 0, ty: 0, px: 0, py: 0,
    yFrom: 0, yTo: 0, yT0: -1e9, yDur: 0.08,
    ang0: 0, angT0: -1e9, angDur: 0.075, tilt: 0,
    glintT0: -1e9, glintAmp: 0, bumpT0: -1e9, bumpDir: 0, bumpRot: 0,
    enterT0: -1e9, enterX: 0, enterY: 0, enterS: 1, enterDur: 0.09,
    ox: new Float32Array(4), oy: new Float32Array(4), key: new Uint8Array(4), ct: new Uint8Array(4), n: 0,
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
  /* A cleared cell's life, from the moment of the clear (t0):
       0 .. rise     it is still its own piece's body, lit from within
                     toward the band's colour (a row glow, brief §8.1)
       swap          over 60 ms the fused band takes over from the body,
                     so the bodies never flatten into a mosaic at once
       d0 .. d0+dur  the band, fully lit, lets go: it draws in toward each
                     row's midline and its light goes out
     A drained cell (sink > 0) has no body phase: it sinks through the
     floor as it goes. */
  var fcX = new Float32Array(FXC), fcY = new Float32Array(FXC), fcV = new Uint8Array(FXC), fcKey = new Uint8Array(FXC);
  var fcKeyB = new Uint8Array(FXC), fcFl = new Uint8Array(FXC), fcRise = new Float32Array(FXC), fcD0 = new Float32Array(FXC);
  var fcT0 = new Float32Array(FXC), fcDur = new Float32Array(FXC), fcSink = new Float32Array(FXC);
  var fcGlow = new Float32Array(FXC), fcOn = new Uint8Array(FXC), fcHead = 0;
  var CLEAR_SWAP = 0.17, CLEAR_XF = 0.06;
  function fxCell(x, y, v, key, keyB, fl, t0, rise, d0, dur, sink, glow) {
    for (var tries = 0; tries < FXC; tries++) {
      var i = fcHead; fcHead = (fcHead + 1) % FXC;
      if (!fcOn[i] || tries === FXC - 1) {
        fcOn[i] = 1; fcX[i] = x; fcY[i] = y; fcV[i] = v; fcKey[i] = key; fcKeyB[i] = keyB; fcFl[i] = fl;
        fcT0[i] = t0; fcRise[i] = rise; fcD0[i] = d0; fcDur[i] = dur; fcSink[i] = sink; fcGlow[i] = glow;
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
  function ribbon(kind, cx, cy, rx, ry, w, turns, rate, dur, amp, swing, delay) {
    for (var i = 0; i < ribbons.length; i++) if (!ribbons[i].on || i === ribbons.length - 1) {
      var r = ribbons[i];
      r.on = true; r.t0 = fxNow + (delay || 0); r.kind = kind; r.cx = cx; r.cy = cy; r.rx = rx; r.ry = ry; r.w = w;
      r.turns = turns; r.rate = rate; r.dur = dur; r.amp = amp; r.phase = rnd() * 6.28; r.swing = swing;
      return;
    }
  }
  var squash = { pid: -1, t0: -1e9, x: 0, y: 0, cleared: false };
  var landVis = 1, bandLive = 0;
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
  var breathOn = false, breathPhase = 0, breatheExt = -1, breatheT = -1e9, shaftBreath = 0;
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

    /* The cleared cells. Through the glow's rise each keeps its own
       piece's body (cut where the clear cuts it), lit from within; then
       all of them fuse into one band of light whatever pieces they came
       from (each keeps its own colour) and the band lets go — left to
       right, a Quad all at once from the bottom up, a Twist behind its
       ribbon. */
    var still = O.motion === "still";
    clearTmp();
    for (i = 0; i < cells.length; i++) {
      var c = cells[i], cx = cellX(c), cy = cellY(c);
      if (cx < 0 || cx >= W || cy < 0 || cy >= ROWS) continue;
      tmpGrid[cy * W + cx] = mirP[cy * W + cx] || 0;
      tmpV[cy * W + cx] = c.v !== undefined ? c.v : (mirB[cy * W + cx] || 1);
    }
    var x, yy;
    for (i = 0; i < W * ROWS; i++) {
      tmpKB[i] = 0; tmpFl[i] = 0;
      if (tmpGrid[i] < 0) continue;
      x = i % W; yy = (i / W) | 0;
      var kb = keyIn(x, yy), fl = 0;
      if (!(kb & 1) && yy + 1 < ROWS && mirB[i + W]) fl |= 16;
      if (!(kb & 2) && (x === W - 1 || mirB[i + 1])) fl |= 32;
      if (!(kb & 4) && (yy === 0 || mirB[i - W])) fl |= 64;
      if (!(kb & 8) && (x === 0 || mirB[i - 1])) fl |= 128;
      tmpKB[i] = kb; tmpFl[i] = fl;
    }
    for (i = 0; i < W * ROWS; i++) if (tmpGrid[i] >= 0) tmpGrid[i] = 1;
    var rise = still ? 0 : (quad ? 0.22 : 0.2);
    var sweep = still ? 0 : (twist ? 0.42 : (quad ? 0.0 : 0.12));
    var start0 = still ? 0.04 : (twist ? 0.04 : (quad ? 0.2 : 0.16));
    var cellDur = still ? 0.15 : (quad ? 0.42 : 0.3);
    for (i = 0; i < W * ROWS; i++) {
      if (tmpGrid[i] < 0) continue;
      x = i % W; yy = (i / W) | 0;
      fxCell(x, yy, tmpV[i], keyIn(x, yy), tmpKB[i], tmpFl[i], fxNow, rise,
             start0 + sweep * ((x + 0.5) / 10) + (quad ? (yy - minRow) * 0.03 : 0), cellDur, 0, 1);
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
        var qa = govern(0.16 * Math.min(1.25, jk), 300, 1100) / 0.9;
        band((minRow + maxRow + 1) * 0.5, 3.0, qa, 0.3, 1.1, 1.6);
      } else if (lead || !twist) {
        var ba = govern(0.12 * Math.min(1.25, jk), 200, 750) / 0.9;
        for (y = minRow; y <= maxRow; y++) if (clearedRow[y]) band(y + 0.5, 1.1, lead ? ba : Math.min(ba, 0.06), 0.2, 0.75, 0);
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
      /* the helix runs each cleared row in 420 ms, starting as the row
         glow rises; the band goes out behind its head */
      for (y = minRow; y <= maxRow; y++) if (clearedRow[y]) ribbon(1, 0, y + 0.5, 0, 0, 0.11, 1, 0, 0.42, 1.6, 0, 0.06);
      if (n >= 2) {
        /* then, once the ribbon has run, a spiral of light round the T */
        var arms = n >= 3 ? 1.6 : 1.1, cnt = pCount(n >= 3 ? 60 : 40), ws = domWorld();
        for (k = 0; k < cnt; k++) {
          var a = k * 0.42, sp = 1.2 + (k / Math.max(1, cnt)) * 2.6 * arms;
          spawnP(lastLockX, lastLockY, Math.cos(a) * sp, Math.sin(a) * sp, -Math.cos(a) * 0.8, -Math.sin(a) * 0.8,
                 fxNow + 0.4 + k * 0.006, 0.8 + rnd() * 0.4, 0.06 + rnd() * 0.04, 4,
                 mixf(ws.pcol[0], 1, 0.4) * 2.4, mixf(ws.pcol[1], 1, 0.4) * 2.4, mixf(ws.pcol[2], 1, 0.4) * 2.4, 0.9, 0);
        }
      }
      if (ev.twist === "mini" && n === 1) ribbon(0, loopX(1.15), lastLockY, 1.15, 1.15, 0.11, 1, 7, 0.5, 1.8, 0.75);
    }
    if (ev.empty) {
      /* stillness: one slow breath of light, and motes rising from the
         floor like lanterns; no kick */
      emptyFx.t0 = fxNow; emptyFx.amp = govern(0.075, 300, 900);
      /* a few dozen lanterns of light, not a fizz: born across the whole
         floor over a second and a half, each setting off slowly and
         gathering pace, swaying a little, until it leaves by the mouth */
      var ne = pCount(EMPTY_FX.motes), w0 = domWorld();
      for (k = 0; k < ne; k++) {
        spawnP(0.3 + rnd() * 9.4, 0.1 + rnd() * 0.5, 0, 0.35 + rnd() * 0.45, 0, 1.3 + rnd() * 0.4,
               fxNow + 0.1 + rnd() * 1.5, 4 + rnd() * 2, 0.32 + rnd() * 0.24, 0,
               mixf(w0.key[0], 1, 0.2) * 1.3, mixf(w0.key[1], 0.86, 0.2) * 1.2, mixf(w0.key[2], 0.6, 0.2) * 1.05, 0.5, 0.15);
      }
    }
  }
  /* a loop of ribbon round the piece that turned, kept inside the shaft
     so it never crosses the stone of the frame */
  function loopX(rx) { return clamp(lastLockX, rx * 1.35 + 0.2, W - rx * 1.35 - 0.2); }
  function onTwist(ev) {
    var mini = ev.kind === "mini";
    var lead = claim(mini ? 1.5 : 2, 0.5);
    ribbon(0, loopX(1.2), lastLockY, 1.2, 1.2, mini ? 0.1 : 0.14, 1, 7, 0.6, mini ? 1.6 : 2.2, 0.75);
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
      fxCell(x, y, tmpV[i], keyIn(x, y), 0, 0, fxNow, 0, still ? 0 : 0.05 * y, still ? 0.15 : 1.2, still ? 0.0001 : rows + 1, 0.06);
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
    pLiveUntil = -1e9;
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
    if (!act || !act.cells || !act.cells.length || endFx.on) {
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
      /* what this cell rests against that is not the piece itself: the
         stack, the walls, the floor (for the contact shadow) */
      var ct = 0, b0 = view.board;
      if (!(k & 1) && b0 && cy + 1 < ROWS && cy + 1 >= 0 && b0[(cy + 1) * W + cx]) ct |= 16;
      if (!(k & 2) && (cx >= W - 1 || (b0 && cy >= 0 && cy < ROWS && b0[cy * W + cx + 1]))) ct |= 32;
      if (!(k & 4) && (cy <= 0 || (b0 && cy - 1 < ROWS && b0[(cy - 1) * W + cx]))) ct |= 64;
      if (!(k & 8) && (cx <= 0 || (b0 && cy >= 0 && cy < ROWS && b0[cy * W + cx - 1]))) ct |= 128;
      A.ct[i] = ct;
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
      /* the dark the shaft falls away into: the world's night, faintly
         its stone */
      cur.deep[k] = cur.top[k] * 0.55 + cur.hor[k] * 0.12 + cur.wall[k] * 0.035;
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
    /* Breath, and a new chapter, breathe the shaft's own light: the back
       wall, the pool on the floor and the coping brighten on the in-breath
       (4 s) and settle on the out-breath (6 s), never by more than a
       luminance change of 0.03. It is a change of light, not of shape, so
       reduced motion keeps it as it is. */
    var ringAmt = 0;
    if (breathPhase >= 0) ringAmt = breathCurve(breathPhase);
    if (breatheExt >= 0) ringAmt = Math.max(ringAmt, breathCurve(breatheExt));
    if (fxNow - chapterT0 < 2.4) ringAmt = Math.max(ringAmt, Math.sin(Math.PI * (fxNow - chapterT0) / 2.4) * 0.6);
    shaftBreath = ringAmt;
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
  function pieceInst(t, cx, cy, cz, sc, ang, tx, ty, layer, glow, sill, haze) {
    if (t < 1 || t > 7 || sc <= 0.001) return;
    var s = SHAPE0[t];
    for (var i = 0; i < 4; i++) {
      /* a piece resting on the niche's sill shades it where it sits */
      var k = SHAPE_KEY[t][i], fl = (layer ? 1 : 0) | (sill && !(k & 4) ? 64 : 0);
      inst(layer, VARIANT_OF[k], cx, cy, cz, ang, s[i][0] - SC_X[t], s[i][1] - SC_Y[t], 1, 1, t, glow, 0, fl, tx, ty, sc, haze || 0);
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
  /* the body this cell belongs to: its highest row (BODY[0]) and its
     middle (BODY[1], BODY[2]). A piece is never more than four cells
     across, so the search stays in a small box. */
  var BODY = new Float32Array(3);
  function bodyOf(b, pa, x, y, pid) {
    var t = y, sx = 0, sy = 0, n = 0;
    for (var yy = Math.max(0, y - 3); yy < y + 4 && yy < DRAW_ROWS; yy++)
      for (var xx = Math.max(0, x - 3); xx <= Math.min(W - 1, x + 3); xx++) {
        var j = yy * W + xx;
        if (b[j] && pa[j] === pid) { if (yy > t) t = yy; sx += xx + 0.5; sy += yy + 0.5; n++; }
      }
    BODY[0] = t; BODY[1] = n ? sx / n : x + 0.5; BODY[2] = n ? sy / n : y + 0.5;
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
          /* the contact shadow: sides against another body or the stone */
          if (!(key & 1) && y + 1 < ROWS && b[i + W]) flags |= 16;
          if (!(key & 2) && (x === W - 1 || b[i + 1])) flags |= 32;
          if (!(key & 4) && (y === 0 || b[i - W])) flags |= 64;
          if (!(key & 8) && (x === 0 || b[i - 1])) flags |= 128;
          if (v === 8) {
            if (x > 0 && !b[i - 1]) flags |= 2;
            if (x < W - 1 && !b[i + 1]) flags |= 4;
          }
          var glow = 0, dis = 0, lay = 0, ey = 0, op = 0;
          if (endFx.on) {
            /* The run ends: the stack rises into light, one body at a
               time from the top down, so nothing ever passes through
               anything. Each lights from within, lifts 1.2 to 1.8 cells
               (the higher, the further) and goes out as it lifts, drawing
               in toward its own middle as it goes. */
            if (pid > 0) bodyOf(b, pa, x, y, pid);
            else { BODY[0] = y; BODY[1] = x + 0.5; BODY[2] = y + 0.5; }
            var rel = top > 0 ? BODY[0] / top : 1;
            var et = endT - (O.motion === "full" ? (1 - rel) * 0.9 : 0);
            if (et > 0) {
              lay = 2; op = 1; flags = flags & 7;
              if (O.motion === "still") { glow = 1; dis = sat(et / 0.15); }
              else {
                glow = smooth(et / 0.25);
                dis = Math.max(0.0006, sat((et - 0.05) / 0.55));
                if (O.motion === "full") ey = (1.2 + 0.6 * rel) * easeOut3(et / 0.6);
              }
              var shrink = O.motion === "full" ? 1 - 0.3 * smooth((dis - 0.3) / 0.7) : 1;
              inst(2, VARIANT_OF[key], BODY[1], BODY[2] + oy + ey, 0, 0, x + 0.5 - BODY[1], y + 0.5 - BODY[2],
                   shrink, shrink, v, glow, dis, flags, 0, 0, 1, op);
              continue;
            }
          }
          if (sqOn && pid === squash.pid) {
            inst(lay, VARIANT_OF[key], squash.x, squash.y + oy, 0, 0, x + 0.5 - squash.x, y + 0.5 - squash.y,
                 1 + 0.012 * sqA, 1 - 0.025 * sqA, v, glow, dis, flags, 0, 0, 1, op);
          } else {
            inst(lay, VARIANT_OF[key], x + 0.5, y + 0.5 + oy + ey, 0, 0, 0, 0, 1, 1, v, glow, dis, flags, 0, 0, 1, op);
          }
        }
      }
      if (endFx.on && !endFx.done && O.motion !== "still" && endT < 1.5) endMotes(b, endT, top);
    }
    /* cells dissolving into light (see fxCell for their life) */
    var pdir = domWorld().pdir;
    bandLive = 0;
    for (i = 0; i < FXC; i++) {
      if (!fcOn[i]) continue;
      var ft = fxNow - fcT0[i], prog = (ft - fcD0[i]) / fcDur[i];
      if (prog >= 1) { fcOn[i] = 0; continue; }
      var dis = prog > 0 ? Math.max(0.0006, prog) : 0;
      if (fcSink[i] > 0) {
        /* drained: it sinks through the floor as it goes */
        var sinkY = fcSink[i] * easeInOut(sat(prog));
        inst(prog > 0 ? 2 : 0, VARIANT_OF[fcKey[i]], fcX[i] + 0.5, fcY[i] + 0.5 - sinkY, 0, 0, 0, 0, 1, 1,
             fcV[i], fcGlow[i] * smooth(ft / 0.2), dis, 0, 0, 0, 1, 1);
        continue;
      }
      var lu = fcRise[i] > 0 ? smooth(ft / fcRise[i]) : 1;
      bandLive = Math.max(bandLive, lu * (1 - smooth(sat(prog * 1.3 - 0.15))));
      /* the band takes over from the bodies at 170 ms, over 60 ms */
      var xf = fcRise[i] > 0 ? smooth((ft - CLEAR_SWAP) / CLEAR_XF) : 1;
      /* Both stand a little proud of the face: when the rows above are let
         go at once (a mode with no clear delay) they settle behind the
         light, which goes out over them, instead of fighting it for the
         same place. The band lifts a little toward the way the world's
         particles travel, keeping its size so no seam opens in it. */
      if (xf < 1) inst(0, VARIANT_OF[fcKeyB[i]], fcX[i] + 0.5, fcY[i] + 0.5, 0.06, 0, 0, 0, 1, 1,
                       fcV[i], lu, 0, fcFl[i], 0, 0, 1, 0);
      if (xf > 0) {
        var lift = 0.12 * pdir * smooth(sat(prog));
        inst(2, VARIANT_OF[fcKey[i]], fcX[i] + 0.5, fcY[i] + 0.5 + lift, 0.064, 0, 0, 0, 1, 1,
             fcV[i], lu, dis, 8, 0, 0, 1, xf);
      }
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
        inst(1, VARIANT_OF[A.key[i]], ppx, ppy, 0, ang, A.ox[i], A.oy[i], 1, 1, A.type, glint, 0, 1 | A.ct[i], tX, tY, sc, -1);
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
      var sl = slots[i], fx0 = sl.x, fy0 = sl.y, fs0 = sl.s, fz0 = sl.z, fh0 = sl.haze;
      if (su < 1) {
        if (i + 1 < slots.length) { var sn = slots[i + 1]; fx0 = sn.x; fy0 = sn.y; fs0 = sn.s; fz0 = sn.z; fh0 = sn.haze; }
        else fs0 = 0;
      }
      /* each one a small object in the air: tipped toward us so its top
         shows (a little less the further off it is), turned a little,
         bobbing on its own slow phase, and hanging further back in the
         world's air the later it comes */
      var bob = full ? Math.sin(now * 0.55 + i * 1.3) * 0.05 : 0;
      var yawP = (-0.16 + (full ? Math.sin(now * 0.37 + i * 0.9) * 0.12 : 0)) * (1 - 0.1 * i);
      pieceInst(qCur[i], mixf(fx0, sl.x, se), mixf(fy0, sl.y, se) + bob, mixf(fz0, sl.z, se), mixf(fs0, sl.s, se) * gone, 0,
                0.26 * (1 - 0.12 * i), yawP, 1, 0, false, mixf(fh0, sl.haze, se));
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
        pieceInst(held, keepSlot.x, keepY(held), keepSlot.z, keepSlot.s * gone, 0, 0.06, 0, 1, 0, true);
      }
    }
    groupInstances();
  }
  function endMotes(b, endT, top) {
    /* rising light: a few motes leave each body as it lifts */
    var ws = domWorld();
    var rate = pCount(120) / 1.2;
    var want = rate * frameDt;
    while (want > 0) {
      if (want < 1 && rnd() > want) break;
      want -= 1;
      var row = Math.floor(rnd() * (top + 1));
      var st = (1 - (top > 0 ? row / top : 1)) * (O.motion === "full" ? 0.9 : 0);
      if (endT < st || endT > st + 0.5) continue;
      var x = rnd() * 10;
      if (!b[row * W + Math.min(9, x | 0)]) continue;
      spawnP(x, row + rnd(), (rnd() - 0.5) * 0.3, 1.0 + rnd() * 1.4, 0, 0.5, fxNow, 1.4 + rnd() * 0.9,
             0.09 + rnd() * 0.07, 0, mixf(ws.key[0], 1, 0.3) * 1.8, mixf(ws.key[1], 0.9, 0.3) * 1.7, mixf(ws.key[2], 0.75, 0.3) * 1.5, 0.85, 0.2);
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
    if (sprN >= (reg === 0 ? MAXS - S_FG_RESERVE : MAXS) || a <= 0.0005) return;
    var o = sprN * 16;
    spr[o] = cx; spr[o + 1] = cy; spr[o + 2] = cz; spr[o + 3] = plane;
    spr[o + 4] = hx; spr[o + 5] = hy; spr[o + 6] = shape; spr[o + 7] = prm;
    spr[o + 8] = r; spr[o + 9] = g; spr[o + 10] = b; spr[o + 11] = a;
    spr[o + 12] = p2; spr[o + 13] = p3; spr[o + 14] = layer; spr[o + 15] = rot;
    sprN++;
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
    sprN = 0;
    var i, k, t, kc = cur.key, wr = 1.0, wg = 0.945, wb = 0.87;
    var full = motionFull();
    /* the motes in the shaft: a soft rise in, a long drift, a soft fade,
       brighter where the mouth's light reaches */
    var mc = motesCap();
    for (i = 0; i < mc; i++) {
      var mo = i * 16, mage = now - mData[mo + 8], mlife = mData[mo + 9];
      if (!(mlife > 0) || mage < 0 || mage > mlife) continue;
      var mk = mage / mlife, ma = smooth(mk / 0.25) * (1 - smooth((mk - 0.7) / 0.3));
      var my = mData[mo + 1] + mData[mo + 5] * mage;
      var mx = mData[mo] + mData[mo + 4] * mage + mData[mo + 2] * Math.sin(mage * (1.1 + mData[mo + 10]) + mData[mo + 10] * 6.2832);
      var mt = clamp((my + 1) / 23.5, 0, 1), mm = 0.06 + 0.94 * mt * mt * (1.7 - 0.7 * mt);
      sprite(0, mx, my, mData[mo + 15], 0, mData[mo + 3], mData[mo + 3], 0, 0,
             mData[mo + 12], mData[mo + 13], mData[mo + 14], 0.55 * ma * (0.3 + 0.7 * mm), 0, 0, 0, 0);
    }
    /* bands of light over cleared rows, and the Quad's rising band */
    for (i = 0; i < bands.length; i++) {
      var bd = bands[i];
      if (!bd.on) continue;
      t = fxNow - bd.t0;
      if (t > bd.rise + bd.fall) { bd.on = false; continue; }
      if (t < 0) continue;
      var env = t < bd.rise ? smooth(t / bd.rise) : 1 - smooth((t - bd.rise) / bd.fall);
      var yb = bd.y + bd.lift * easeOut3(t / (bd.rise + bd.fall));
      /* the same light the band is made of: halfway between the world's
         key light and the skin's warm white, never a piece's colour */
      var bcR = (kc[0] + pal[0]) * 0.5, bcG = (kc[1] + pal[1]) * 0.5, bcB = (kc[2] + pal[2]) * 0.5;
      var bcM = Math.max(bcR, bcG, bcB, 1e-3);
      sprite(0, CX, yb, 0.06, 0, W * 0.5 - 0.1, bd.h, 5, 0, bcR / bcM, bcG / bcM, bcB / bcM, bd.amp * env * 0.7, 0, 0, 0, 0);
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
    /* the rim: Unbroken's gold filament and a Triple's shimmer (Breath breathes the shaft's own light instead; see stepState) */
    if (unbroken > 0.01) {
      /* along the coping, from the niche (when it sits on the mouth) to
         the far side */
      var fx0 = niche && niche.onMouth ? niche.bx1 + 0.2 : -wallT + 0.05, fx1 = W + wallT - 0.05;
      hair(0, fx0, LIP_Y + COPE_H + 0.012, fx1, LIP_Y + COPE_H + 0.012, 0.1, 1.6, 1.0, 0.72, 0.32, 1.6 * unbroken, 1, 0);
      sprite(0, (fx0 + fx1) * 0.5, LIP_Y + COPE_H, 0.1, 0, (fx1 - fx0) * 0.5, 0.09, 1, 0.9, 1.0, 0.7, 0.3, 0.25 * unbroken, 0, 0, 0, 0);
    }
    t = fxNow - shimmer.t0;
    if (t >= 0 && t < 0.75 && O.motion !== "still") {
      var su = easeInOut(t / 0.75);
      var sx = -wallT + (W + 2 * wallT) * su;
      sprite(0, sx, LIP_Y, 0.03, 0, 0.7, 0.22, 0, 0, wr, wg, wb, shimmer.amp * Math.sin(Math.PI * t / 0.75) * 1.4, 0, 0, 0, 0);
    }
    /* Breath beads: twenty pearls set into the floor slab's face, where
       nothing ever covers them (the 2D well puts them in the same place).
       They are light in the stone, not bulbs: a lit bead is the world's
       key light warmed a little toward its rim, and a dark one is barely
       more than the stone it is set in. (Breath itself breathes the
       shaft's own light; see stepState.) */
    if (beadsShown) {
      var rb = Math.min(0.08, floorT * 0.24);
      var ready2 = view && view.breath && view.breath.charge >= 10 ? 1 : 0;
      var bcr = kc[0] * 0.7 + cur.rim[0] * 0.3, bcg = kc[1] * 0.7 + cur.rim[1] * 0.3, bcb = kc[2] * 0.7 + cur.rim[2] * 0.3;
      for (k = 0; k < 20; k++) {
        var lv = beads[k];
        var bx = 0.25 + k * 0.5;
        var br = 0.08 + lv * (0.45 + 0.15 * ready2);
        sprite(0, bx, -floorT * 0.55, 0.015, 0, rb, rb, 6, 0.25 + 0.75 * lv,
               mixf(cur.wall[0] * 2.2 + 0.05, bcr, lv), mixf(cur.wall[1] * 2.2 + 0.05, bcg, lv), mixf(cur.wall[2] * 2.2 + 0.05, bcb, lv),
               br, lv * 0.35, 0, 0, 0);
      }
    }
    /* ---- the never-dimmed layer ---- */
    /* while the rows above a clear settle, the landing light would be
       drawn at a place the stack has not reached yet: it waits; and while
       a band of light is going out it stays faint, so its rails never cut
       seams through the band. It comes back as the light goes. */
    if (setl.kind === SET_CLEAR) landVis = 0;
    else landVis += (1 - 0.85 * bandLive - landVis) * (1 - Math.exp(-frameDt / 0.04));
    if (A.on && view.active) {
      var act = view.active, gh = view.ghost, b = view.board;
      var lt = SK.landing * landVis, cI = A.type * 4;
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
          if (gy > 0) sprite(2, gx + 0.5, gy - 0.3, 0.012, 0, 0.46, 0.3, 2, 0, lr, lg, lb, 0.75 * lt, 0, 0, 1, 0);
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
    var n = ez - 4.5, f = ez + SHAFT_D + 1.5;
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
    ubo[44] = (wMix < 1 && slotA !== slotB) ? smooth(wMix) : 0; ubo[45] = SK.landing; ubo[46] = SHAFT_D; ubo[47] = t.q;
    ubo[48] = SK.rough; ubo[49] = SK.rim; ubo[50] = SK.emissive;
    ubo[51] = (t.refract && !SK.unlit) ? SK.refract : 0;
    ubo[52] = SK.sss; ubo[53] = SK.speckle; ubo[54] = SK.fibre; ubo[55] = SK.unlit ? 1 : 0;
    ubo[56] = SK.outline ? 1 : 0; ubo[57] = SK.glyph; ubo[58] = SK.mono ? 1 : 0; ubo[59] = SK.gloss;
    var et = fxNow - emptyFx.t0, live = 0;
    /* the Empty Well's breath: a front of light climbs from the floor to
       the mouth over the 300 ms rise, and the whole shaft lets it go over
       the 900 ms fall */
    ubo[60] = et >= 0 && et < 1.2 ? emptyFx.amp / 0.075 * (et < 0.3 ? smooth(et / 0.3) : 1 - smooth((et - 0.3) / 0.9)) : 0;
    var front = et >= 0 && et < 1.2 ? 24 * easeOut3(et / 0.3) - 1 : -1;
    ubo[62] = unbroken;
    var endT = fxNow - endFx.t0;
    ubo[63] = endFx.on && endT < 2.2 ? Math.sin(Math.PI * clamp(endT / 2.2, 0, 1)) * 0.6 : 0;
    ubo[64] = SK.unlit ? 0 : SK.inner; ubo[65] = t.haze && O.motion !== "still" ? 0.022 : 0; ubo[66] = 1; ubo[67] = SK.glow;
    ubo[68] = cur.deep[0]; ubo[69] = cur.deep[1]; ubo[70] = cur.deep[2]; ubo[71] = LIP_Y + COPE_H * 0.4;
    for (i = 0; i < 4; i++) {
      var r = rings[i], age = fxNow - r.t0, on = (age >= 0 && age < 1.4) ? r.amp : 0;
      ubo[72 + i * 4] = r.x; ubo[73 + i * 4] = r.y; ubo[74 + i * 4] = age; ubo[75 + i * 4] = on;
      if (on > 0) live = 1;
    }
    ubo[61] = live;
    for (i = 0; i < 48; i++) ubo[88 + i] = pal[i];
    ubo[136] = SK.trans; ubo[137] = SK.tfall; ubo[138] = SK.coatK; ubo[139] = SK.paper;
    ubo[140] = t.refract ? SK.sheen : 0; ubo[141] = SK.thick; ubo[142] = SK.see; ubo[143] = 0;
    ubo[144] = cur.hor[0]; ubo[145] = cur.hor[1]; ubo[146] = cur.hor[2]; ubo[147] = shaftBreath;
    ubo[148] = cur.top[0]; ubo[149] = cur.top[1]; ubo[150] = cur.top[2]; ubo[151] = front;
    gl.bindBuffer(gl.UNIFORM_BUFFER, B.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, ubo);
    /* where the face and the frame land on screen this frame (the kick
       and the Surface's rise move them): the sky is not drawn under the
       face, and the composite shades the sky round the frame */
    rectUV(0, 0, W, VIS, faceUV);
    rectUV(-wallT, -floorT, W + wallT, LIP_Y + COPE_H, frameUV);
    /* the back wall's affine map, screen uv to its own [0,1] units */
    var bx = projU(0, 0, BACK_Z, 0), by = projU(0, 0, BACK_Z, 1);
    var ax = projU(W, 0, BACK_Z, 0) - bx, ay = projU(W, 0, BACK_Z, 1) - by;
    var cx2 = projU(0, 22.5, BACK_Z, 0) - bx, cy2 = projU(0, 22.5, BACK_Z, 1) - by;
    var det = ax * cy2 - cx2 * ay;
    if (Math.abs(det) < 1e-12) det = 1e-12;
    backMap[0] = bx; backMap[1] = by;
    backMap[2] = cy2 / det; backMap[3] = -ay / det; backMap[4] = -cx2 / det; backMap[5] = ax / det;
  }
  var backMap = new Float32Array(6);
  /* where a point in the well lands on screen, in uv: axis 0 x, 1 y */
  function projU(x, y, z, axis) {
    var w = VP[3] * x + VP[7] * y + VP[11] * z + VP[15];
    var v = axis ? VP[1] * x + VP[5] * y + VP[9] * z + VP[13] : VP[0] * x + VP[4] * y + VP[8] * z + VP[12];
    return (v / w) * 0.5 + 0.5;
  }
  var faceUV = new Float32Array(4), frameUV = new Float32Array(4), skyFr = new Float32Array(4);
  function projX(x, y) { var w = VP[3] * x + VP[7] * y + VP[15]; return ((VP[0] * x + VP[4] * y + VP[12]) / w) * 0.5 + 0.5; }
  function projY(x, y) { var w = VP[3] * x + VP[7] * y + VP[15]; return ((VP[1] * x + VP[5] * y + VP[13]) / w) * 0.5 + 0.5; }
  /* a rectangle on the face plane (z = 0), in screen uv: x0, x1, y0, y1 */
  function rectUV(x0, y0, x1, y1, out) {
    var a = projX(x0, y0), b = projX(x1, y1), c = projX(x0, y1), d = projX(x1, y0);
    out[0] = Math.min(a, c); out[1] = Math.max(b, d);
    var e = projY(x0, y0), f = projY(x1, y1), g = projY(x0, y1), h = projY(x1, y0);
    out[2] = Math.min(e, h); out[3] = Math.max(f, g);
  }
  /* where the stack is, for the stone: the board in red, the falling
     piece in green (it shades the shaft below it but leaves no contact
     shadow) */
  var occG = new Uint8Array(W * 24), occT = new Uint8Array(W * 24), keyN = [1, 1, 1];
  function uploadOcc(view) {
    var b = view.board, i, changed = occDirty;
    /* the key light's colour at unit brightness, for the glow's tint */
    var kl = Math.max(1e-3, 0.2126 * cur.key[0] + 0.7152 * cur.key[1] + 0.0722 * cur.key[2]);
    keyN[0] = cur.key[0] / kl; keyN[1] = cur.key[1] / kl; keyN[2] = cur.key[2] / kl;
    for (i = 0; i < W * 24; i++) { occG[i] = 0; occT[i] = 0; }
    if (A.on && view.active && view.active.cells) {
      var cells = view.active.cells;
      for (i = 0; i < cells.length; i++) {
        var x = cellX(cells[i]), y = cellY(cells[i]);
        if (x >= 0 && x < W && y >= 0 && y < 24) { occG[y * W + x] = 200; occT[y * W + x] = A.type; }
      }
    }
    var gone = endFx.on && endFx.done;
    for (i = 0; i < W * 24; i++) {
      var v = (b && b[i] && !gone) ? 255 : 0;
      if (occData[i * 2] !== v) { occData[i * 2] = v; changed = true; }
      if (occData[i * 2 + 1] !== occG[i]) { occData[i * 2 + 1] = occG[i]; changed = true; }
      /* the colour each cell gives the wall behind it: the piece's own,
         half of it turned to the world's key light at the same brightness,
         and never redder than 60% of its light (linear), so a pink piece
         lends the stone a warm blush and never a red halo; nothing for
         silt. Written as 8-bit linear, plenty for a glow this soft. */
      var t = occT[i] || (v ? b[i] : 0), o = i * 4, cr = 0, cg = 0, cb = 0;
      if (t >= 1 && t <= 7) {
        var pr0 = pal[t * 4], pg0 = pal[t * 4 + 1], pb0 = pal[t * 4 + 2];
        var pl = 0.2126 * pr0 + 0.7152 * pg0 + 0.0722 * pb0;
        var tr = mixf(pr0, pl * keyN[0], 0.5), tg = mixf(pg0, pl * keyN[1], 0.5), tb = mixf(pb0, pl * keyN[2], 0.5);
        if (tr > 1.5 * (tg + tb)) tr = 1.5 * (tg + tb);
        cr = (clamp(tr, 0, 1) * 255) | 0; cg = (clamp(tg, 0, 1) * 255) | 0; cb = (clamp(tb, 0, 1) * 255) | 0;
      }
      if (occCol[o] !== cr || occCol[o + 1] !== cg || occCol[o + 2] !== cb) {
        occCol[o] = cr; occCol[o + 1] = cg; occCol[o + 2] = cb; occCol[o + 3] = 255; changed = true;
      }
    }
    if (!changed) return;
    gl.bindTexture(gl.TEXTURE_2D, X.occ);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, 24, gl.RG, gl.UNSIGNED_BYTE, occData);
    gl.bindTexture(gl.TEXTURE_2D, X.occC);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, 24, gl.RGBA, gl.UNSIGNED_BYTE, occCol);
    occDirty = false; shadeDirty = true;
  }

  /* ================================================================
     passes
     ================================================================ */
  var draws = 0;

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
  /* The sky's motion is the player's setting and nothing else. Each
     world's own pace is already in sky.js's shader, applied per scene, so
     passing it here again would apply it twice — and, taken from whichever
     world was "on top", would jump halfway through every crossfade. */
  function skyMotion() { return O.motion === "full" ? (O.steady ? 0.5 : 1) : 0; }

  function passSky() {
    var tS = T.sky;
    if (!tS) return;
    var t = TT(), live = t.live && O.motion !== "still";
    var period = t.skyHz > 0 ? 1 / t.skyHz - 0.004 : 1e9;
    var react = reactNow();
    /* a still sky is redrawn only when something changed — including the
       well moving under its shadow (a kick, the Surface's rise) */
    var moved = Math.abs(frameUV[0] - skyFr[0]) + Math.abs(frameUV[2] - skyFr[2]) > 0.003;
    if (!(skyDirty || moved || ((live || react > 0) && now - skyLast >= period))) return;
    skyLast = now; skyDirty = false; skyFr[0] = frameUV[0]; skyFr[2] = frameUV[2];
    var pr = t.live ? P.sky : P.plain, u = pr.u;
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
    /* On a tall phone the well hides the horizon and the world's motif;
       the visible sky is the band above the mouth. uAnchor says how tall
       the screen is (0 landscape, 1 a phone held upright) and uMouth where
       the top of the coping lands, in the target's uv, so the sky can
       compose its horizon into that band. */
    gl.uniform1f(u.uAnchor, clamp((cssH / Math.max(1, cssW) - 1.3) / 0.8, 0, 1));
    gl.uniform1f(u.uMouth, clamp(projY(0, LIP_Y + COPE_H), 0, 1));
    /* everything but the face of the well, which the shaft covers; the
       hole is pulled in a texel and a half so filtering at its edge never
       reads sky that was not drawn */
    var ix = 1.5 / tS.w, iy = 1.5 / tS.h;
    var h0 = clamp(faceUV[0] + ix, 0, 1), h1 = clamp(faceUV[1] - ix, 0, 1);
    var h2 = clamp(faceUV[2] + iy, 0, 1), h3 = clamp(faceUV[3] - iy, 0, 1);
    if (h1 <= h0 || h3 <= h2) { h0 = h1 = h2 = h3 = 0.5; }
    gl.uniform4f(u.uHole, h0, h2, h1, h3);
    gl.bindVertexArray(V.empty);
    gl.drawArrays(gl.TRIANGLES, 0, 24);
    draws++;
    /* the well's shadow on it: how dark at the stone, and how far it
       reaches, in screen heights */
    gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P.skyshade.p);
    gl.uniform2f(P.skyshade.u.uRes, tS.w, tS.h);
    gl.uniform4f(P.skyshade.u.uFr, frameUV[0], frameUV[1], frameUV[2], frameUV[3]);
    gl.uniform4f(P.skyshade.u.uSh, cssW / cssH, 0.45, 0.03, 0);
    full3();
    gl.disable(gl.BLEND);
  }
  /* where the key light crosses the stack, seen from a point on the back
     wall: up the light's own direction to the middle of the pieces' depth */
  var SH_T = (SHAFT_D - DEPTH * 0.5) / KEY_DIR[2];
  function passShade() {
    if (!shadeDirty) return;
    shadeDirty = false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, X.shade.fb);
    gl.viewport(0, 0, SHADE_W, SHADE_H);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.useProgram(P.shade.p);
    bindTex(1, X.occ); bindTex(3, X.occC);
    gl.uniform4f(P.shade.u.uSh, KEY_DIR[0] * SH_T, KEY_DIR[1] * SH_T, 0.75, 0);
    full3();
    backDirty = true;
  }
  /* the back wall's cache: redrawn when the light on it changed — the
     stack moved, a world is fading in, the danger tint moved on, or the
     grid or the haze was switched */
  function passBackWall() {
    var g = ubo[43], hz = ubo[65];
    if (wMix < 1 || Math.abs(danger - backDanger) > 0.01 || g !== backGrid || hz !== backHaze) backDirty = true;
    if (!backDirty) return;
    backDirty = false; backDanger = danger; backGrid = g; backHaze = hz;
    gl.bindFramebuffer(gl.FRAMEBUFFER, X.backc.fb);
    gl.viewport(0, 0, BACKC_W, BACKC_H);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    gl.useProgram(P.backc.p);
    bindTex(1, X.occ); bindTex(2, X.shade.tex);
    bindTex(3, X.stone[slotA].tex); bindTex(4, X.stone[slotB].tex);
    gl.uniform2f(P.backc.u.uRes, BACKC_W, BACKC_H);
    full3();
  }
  function drawBodies(layer) {
    gl.bindVertexArray(V.block);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.inst);
    var base = layer * NVAR, u = P.block.u;
    for (var v = 0; v < NVAR; v++) {
      var n = bCount[base + v];
      if (!n) continue;
      var off = bStart[base + v] * 64;
      for (var a = 0; a < 4; a++) gl.vertexAttribPointer(2 + a, 4, gl.FLOAT, false, 64, off + a * 16);
      var sd = VT[v].sides, nb = VT[v].notch;
      gl.uniform4f(u.uVarS, sd & 1 ? 1 : 0, sd & 2 ? 1 : 0, sd & 4 ? 1 : 0, sd & 8 ? 1 : 0);
      gl.uniform4f(u.uVarB, nb & 1 ? 1 : 0, nb & 2 ? 1 : 0, nb & 4 ? 1 : 0, nb & 8 ? 1 : 0);
      gl.drawElementsInstanced(gl.TRIANGLES, VT[v].count, gl.UNSIGNED_SHORT, VT[v].first * 2, n);
      draws++;
    }
  }
  function drawSprites() {
    if (sprN <= 0) return;
    gl.useProgram(P.sprite.p);
    gl.bindVertexArray(V.spr);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.spr);
    for (var a = 0; a < 4; a++) gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 64, a * 16);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sprN);
    draws++;
  }
  function drawRibbons() {
    var u = P.ribbon.u, used = false;
    for (var i = 0; i < ribbons.length; i++) {
      var r = ribbons[i];
      if (!r.on) continue;
      var t = fxNow - r.t0, q = t / r.dur, row = r.kind === 1;
      if (q > (row ? 1.5 : 1.3) || O.motion === "still") { r.on = false; continue; }
      if (q < 0) continue;
      if (!used) { gl.useProgram(P.ribbon.p); gl.bindVertexArray(V.empty); used = true; }
      /* the row's ribbon runs the row in its duration and then its tail
         runs out after it; the loop eases round the piece */
      var head = row ? q : easeInOut(Math.min(1, q)) * 1.02;
      var env = row ? (q < 1 ? 1 : 1 - smooth((q - 1) / 0.5)) : (q < 1 ? 1 : 1 - (q - 1) / 0.3);
      var amp = r.amp * env * Math.min(1.3, juiceK() + 0.3);
      gl.uniform4f(u.uR0, r.kind, head, row ? 0.5 : 0.42, r.w);
      gl.uniform4f(u.uR1, r.cx, r.cy, r.rx, r.ry);
      if (row) gl.uniform4f(u.uR2, 1, 1, 1, amp);
      else gl.uniform4f(u.uR2, mixf(pal[0], cur.rim[0], 0.25), mixf(pal[1], cur.rim[1], 0.25), mixf(pal[2], cur.rim[2], 0.25), amp);
      gl.uniform4f(u.uR3, r.swing, r.rate, r.phase, r.turns);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, RIB_SEG * 2);
      draws++;
    }
  }
  function drawParticles() {
    var cap = particleCap();
    /* nothing in flight: no draw at all */
    if (cap <= 0 || fxNow > pLiveUntil) return;
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
    bindTex(1, X.occ); bindTex(2, X.shade.tex);
    bindTex(3, X.stone[slotA].tex); bindTex(4, X.stone[slotB].tex); bindTex(5, X.detail.tex); bindTex(6, X.backc.tex);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    /* nearest first, so the depth test turns away everything they hide:
       what must always be read (the niche, the piece in hand, the
       previews, the kept piece), then the stack, then the stone */
    if (keepVisible(view)) {
      gl.useProgram(P.wall.p);
      gl.uniform4f(P.wall.u.uNiche, Math.min(1.4, nicheGlow * 0.85 + nicheFlash * 0.6), 1, keepSlot.s, niche.zf);
      gl.uniform4f(P.wall.u.uNicheO, niche.h.cx, niche.h.cy, niche.h.hw, niche.h.hh);
      gl.uniform2f(P.wall.u.uNicheR, niche.h.rt, niche.h.rb);
      gl.bindVertexArray(V.niche);
      gl.drawElements(gl.TRIANGLES, nicheIdx.length, gl.UNSIGNED_SHORT, 0);
      draws++;
    }
    gl.useProgram(P.block.p);
    gl.uniform1f(P.block.u.uFade, 0);
    drawBodies(1);
    drawBodies(0);
    gl.useProgram(P.wall.p);
    gl.uniform4f(P.wall.u.uNiche, 0, 0.02, 1, 0);
    gl.bindVertexArray(V.shell);
    gl.drawElements(gl.TRIANGLES, shellIdx.length, gl.UNSIGNED_SHORT, 0);
    draws++;
    /* the back wall: drawn here only on the Simple tier, whose 8-bit
       scene cannot carry the marks the composite reads; elsewhere the
       composite lays it in under whatever the scene left open */
    if (tierName === "simple") {
      gl.useProgram(P.back.p);
      gl.bindVertexArray(V.empty);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      draws++;
    }
    /* bodies fading into light: blended over what is behind them, the
       readability mask left exactly as it was */
    gl.useProgram(P.block.p);
    gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.uniform1f(P.block.u.uFade, 1);
    drawBodies(2);
    gl.uniform1f(P.block.u.uFade, 0);
    /* added light: everything that may glow, the motes in the shaft,
       the landing light (marked never to be washed), and on the Simple
       tier the particles too */
    gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.ONE, gl.ONE);
    drawSprites();
    drawRibbons();
    if (!T.bloom.length) drawParticles();
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
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
    bindTex(0, T.scene.tex);
    bindTex(6, hasBloom ? T.bloom[0].tex : T.sky.tex);
    bindTex(7, T.sky.tex);
    bindTex(5, X.backc.tex);
    var bloomAmt = (0.3 + swellNow()) * Math.min(1, SK.bloomCap);
    gl.uniform4f(u.uC0, bloomAmt, 0.15, 0.02, TT().fxaa ? 1 : 0);
    gl.uniform4f(u.uC1, 1.0, danger, O.steady ? 0.35 : 1.0, p3 ? 1 : 0);
    gl.uniform4f(u.uC2, 1 / canvas.width, 1 / canvas.height, 1 / SC.enc, 1 / F.hdr.enc);
    gl.uniform4f(u.uC3, faceUV[0], faceUV[1], faceUV[2], faceUV[3]);
    gl.uniform4f(u.uC5, 0, 0, 0, hasBloom ? 1 : 0);
    gl.uniform4f(u.uB0, backMap[0], backMap[1], (LIP_Y + COPE_H * 0.4) / 22.5, tierName === "simple" ? 0 : 1);
    gl.uniform4f(u.uB1, backMap[2], backMap[3], backMap[4], backMap[5]);
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
    ensureStone();
    buildInstances(view);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.inst);
    if (instN) gl.bufferSubData(gl.ARRAY_BUFFER, 0, instArr, 0, instN * 16);
    buildSprites(view);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.spr);
    if (sprN) gl.bufferSubData(gl.ARRAY_BUFFER, 0, spr, 0, sprN * 16);
    if (pHi >= pLo) {
      gl.bindBuffer(gl.ARRAY_BUFFER, B.part);
      gl.bufferSubData(gl.ARRAY_BUFFER, pLo * 64, pData, pLo * 16, (pHi - pLo + 1) * 16);
      pLo = MAXP; pHi = -1;
    }
    draws = 0;
    passShade();
    passBackWall();
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
  var qa = { t: 0, lastEval: 0, E: 16.7, overT: -1, cleanT: 0, lastDown: -1e9, lastUp: -1e9, upWait: 20,
             slowT: -1, slow: 0, lpOn: false, lpCalled: -1e9 };
  function observe(dt) {
    var ms = dt * 1000, i;
    if (!(ms > 0)) return;
    /* The app caps a frame at 250 ms, so a tab back from the background
       does not fast-forward the game. That also means a device too slow
       to draw four frames a second arrives here as exactly 250, every
       frame. Counted — capped — such a frame is what lets that device
       step down at all; dropped, as this once did, the slowest machines
       stayed on the Full tier for good. */
    if (ms > 250) ms = 250;
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
    if (med > 40) {
      /* An absolute floor. A median frame slower than 40 ms (under 25
         fps) for two seconds is overload whatever the cadence did: a
         device that cannot keep up looks, to the rule below, exactly
         like one that changed its refresh rate, and would never be
         helped. A steady 33 ms — Low Power Mode's 30 fps — sits well
         inside the floor and is never treated as overload. */
      if (qa.slowT < 0) qa.slowT = qa.t;
      if (qa.t - qa.slowT >= 2) { qa.slowT = qa.t; downNow(); }
    } else qa.slowT = -1;
    if (Math.abs(E - qa.E) > 0.5) {
      /* the cadence itself changed — Low Power Mode, a display moved,
         ProMotion toggled — which is not overload */
      qa.E = E; qa.overT = -1; qa.cleanT = qa.t;
    } else if (share > 0.10) {
      if (qa.overT < 0) qa.overT = qa.t;
      if (qa.t - qa.overT >= 2) { qa.overT = -1; downNow(); }
    } else qa.overT = -1;
    if (share > 0.03 || med > 36) qa.cleanT = qa.t;
    if (qa.t - qa.cleanT >= qa.upWait && qa.t - qa.lastDown >= 10) { stepUp(); qa.cleanT = qa.t; qa.lastUp = qa.t; }
    var lp = Math.abs(qa.E - 33.3) < 0.5 && near / want > 0.85;
    if (lp && !qa.lpOn) {
      qa.lpOn = true;
      if (opts.onLowPower && qa.t - qa.lpCalled > 60) { qa.lpCalled = qa.t; try { opts.onLowPower(); } catch (e) {} }
    } else if (!lp && qa.E < 20) qa.lpOn = false;
    R.stats.cadenceMs = qa.E; R.stats.lowPower = qa.lpOn;
  }
  /* a step down; one that undoes a step up within fifteen seconds
     doubles the clean time the next step up must wait for, so a device
     on the edge settles instead of see-sawing */
  function downNow() {
    if (qa.t - qa.lastUp < 15) qa.upWait = Math.min(160, qa.upWait * 2);
    stepDown(); qa.lastDown = qa.t; qa.cleanT = qa.t;
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
      var c = Math.max(4, Math.floor(Math.min((cssW - 24) / (W + 2 * wallT + 1), (cssH - 24) / (LIP_Y + floorT + 1))));
      ww = c * W; wh = c * VIS; wx = (cssW - ww) * 0.5; wy = (cssH - wh) * 0.5 + c * 0.25;
    }
    cellXpx = ww / W; cellYpx = wh / VIS;
    winL = -wx / cellXpx; winT = VIS + wy / cellYpx;
    winR = winL + cssW / cellXpx; winB = winT - cssH / cellYpx;
    wellUV[0] = (wx + ww * 0.5) / cssW; wellUV[1] = 1 - (wy + wh * 0.5) / cssH;
    wellNDC[0] = wellUV[0] * 2 - 1; wellNDC[1] = wellUV[1] * 2 - 1;
    /* The previews. Beside a wide well each one hangs half a cell further
       back than the one before and 18% further into the world's air; on a
       phone the two that hang over the rim stand a little in front of the
       frame, whose stone they may cross. Each is moved and sized for its
       depth so that it still lands exactly on the rectangle the layout
       gave it. */
    slots = [];
    if (L && L.next && L.next.length) {
      var wideL = L.shape === "wide";
      var ex0 = CX, ey0 = CY + EYE_D * Math.sin(PITCH), ez0 = EYE_D * Math.cos(PITCH);
      for (i = 0; i < L.next.length; i++) {
        var r = L.next[i];
        if (!r || !(r.w > 0)) continue;
        var sx0 = winL + (r.x + r.w * 0.5) / cellXpx, sy0 = winT - (r.y + r.h * 0.5) / cellYpx;
        var z = wideL ? -0.5 * i : (i > 0 ? 0.4 : 0), k = (ez0 - z) / ez0;
        slots.push({ x: ex0 + (sx0 - ex0) * k, y: ey0 + (sy0 - ey0) * k, z: z,
                     s: clamp(num(r.s, 0.6), 0.2, 1.2) * k, haze: Math.min(0.6, (wideL ? 0.18 : 0.1) * i) });
      }
    }
    /* the frame's thickness is the layout's, so the stone ends where
       the 2D well's does and where the previews were told it would */
    var wt = L && L.wall > 0 ? clamp(L.wall / cellXpx, WALL_MIN, WALL_MAX) : 0.25;
    var ft = L && L.floor > 0 ? clamp(L.floor / cellXpx, 0.3, 0.8) : 0.5;
    var mouthNiche = !!(L && L.keep && L.keep.w > 0 && (winL + (L.keep.x + L.keep.w) / cellXpx) > 0.05 &&
                        (winT - (L.keep.y + L.keep.h) / cellYpx) >= VIS - 0.05);
    if (Math.abs(wt - wallT) > 1e-4 || Math.abs(ft - floorT) > 1e-4 || mouthNiche !== shellNoCope) {
      wallT = wt; floorT = ft; shellNoCope = mouthNiche;
      shellGeo = buildShell(wallT, floorT, shellNoCope);
      shellData = packMesh(shellGeo, true); shellIdx = new Uint16Array(shellGeo.idx);
      if (ready && !lost) uploadShell();
    }
    keepSlot = null; niche = null;
    if (L && L.keep && L.keep.w > 0 && L.keep.h > 0) {
      var k = L.keep;
      var kx0 = winL + k.x / cellXpx, kx1 = winL + (k.x + k.w) / cellXpx;
      var ky1 = winT - k.y / cellYpx, ky0 = winT - (k.y + k.h) / cellYpx;
      /* the niche's block is part of the wall: on a phone it sits on the
         mouth over the left pillar and swallows the coping there; beside a
         wide well it reaches across to the pillar, so there is no gap of
         sky between the niche and the stone it is cut into */
      var onMouth = kx1 > 0.05 && ky0 >= VIS - 0.05;
      var bx0 = onMouth ? Math.min(kx0, -wallT) : kx0, bx1 = onMouth ? kx1 : Math.max(kx1, -wallT + 0.02);
      var mg = clamp(Math.min(kx1 - kx0, ky1 - ky0) * 0.13, 0.1, 0.3);
      var ox0 = kx0 + mg, ox1 = kx1 - mg, oy0 = ky0 + mg * 0.85, oy1 = ky1 - mg;
      var s = Math.min(clamp(num(k.s, 0.6), 0.2, 1.2), (ox1 - ox0 - 0.14) / 4, (oy1 - oy0 - 0.1) / 2.15);
      s = Math.max(0.15, s);
      var inD = DEPTH * s + 0.35, zf = 0;
      /* flush with the frame's face; beside a wide well its side against
         the pillar is not rounded, so the two read as one stone */
      niche = buildNiche(bx0, bx1, ky0, ky1, ox0, ox1, oy0, oy1, inD, onMouth ? inD + 0.3 : SHAFT_D, onMouth ? 0 : 2);
      if (zf) for (i = 0; i < niche.mesh.pos.length; i += 3) niche.mesh.pos[i + 2] += zf;
      niche.onMouth = onMouth; niche.bx1 = bx1; niche.zf = zf;
      nicheData = packMesh(niche.mesh, true); nicheIdx = new Uint16Array(niche.mesh.idx);
      if (ready && !lost) uploadNiche();
      keepSlot = { x: (ox0 + ox1) * 0.5, y: oy0 + s, floor: oy0, z: zf - 0.07, s: s };
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
      if (X.occC) gl.deleteTexture(X.occC);
      freeTarget(X.shade); freeTarget(X.detail); freeTarget(X.backc);
      if (X.stone) { freeTarget(X.stone[0]); freeTarget(X.stone[1]); }
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
    fxCell(4, 6, 3, 0, 0, 0, fxNow - 0.3, 0.1, 0.05, 1, 0, 0);   /* the blended, fading layer */
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
