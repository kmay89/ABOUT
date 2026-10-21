/* gfx3d.js — the board in the round.
   Raw WebGL 1, no libraries, no build step, in the manner of the
   solving room: the men are carved in pieces3d.js, the board is a
   single textured quad painted on an offscreen canvas, and the camera
   is an orbit on springs so it glides rather than snaps.

   Three passes make the picture. The light draws the scene first, from
   where it hangs, and keeps the distances: that is the shadow map. Then
   the camera draws the room into a texture rather than onto the screen,
   lit in linear space with a Cook-Torrance surface — roughness and
   metalness, a key light that casts, a cool fill that does not, and a
   procedural sky standing in for a cube map we would otherwise have to
   ship. Last, that texture is graded: the bright parts are smeared into
   a bloom, a lens fringe and a vignette go on, an ACES curve rolls the
   highlights off instead of clipping them, and a little grain lands on
   top. The board has a relief map cut from the same canvas as its
   colour, so the grain, the grooves between squares and the engraved
   coordinates catch the light rather than being drawn on; a polished
   board reflects the men standing on it.

   None of it is load-bearing. Floating-point targets, framebuffers and
   even the shadow map are checked rather than assumed, and each one
   that is missing simply drops out — the tone map moves into the
   surface shaders, the effects tier steps down, and the board still
   looks like itself. Three tiers (full, balanced, simple) are picked
   automatically and can be overridden in the Studio.

   Moves slide, knights hop a little arc, captured pieces are pushed
   over the way they were taken, promotions crossfade at the far rank —
   all of it read from motion.js. And the big moments have hooks of
   their own, the same on both boards: the men set down rank by rank at
   the start of a game (with the landings handed back for the sound),
   light pooled on a struck square, the mated king laid down on its
   side, a camera that springs in toward a square and back out, and
   squareToScreen so the effects layer (fx.js) can put light exactly on
   a square. If WebGL is missing or the context is lost, the app is told
   at once and the same game continues in 2D — nothing is allowed to
   strand the player.

   The camera is fitted to whatever it is drawing into, every frame: as
   wide as the screen allows and no taller than the room between the
   player bars, stood up steeper through a longer lens on a phone held
   upright. A tap is answered for what the eye sees under it — the men
   first, then the wood — and a man can be carried by hand, lifted over
   the board with his shadow under him, for drag-to-move. */
(function (root) {
"use strict";

var REDUCED = (typeof matchMedia === "function") && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- a skin, turned into what GL wants ----------
   Colours arrive as hex from skins.js; the shader wants vec3s in 0..1,
   and the board texture wants the hex back again. Derived once per skin
   change rather than per frame. */
function vec3(hex) {
  var n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function mix3(a, b, t) {
  return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t];
}
function scale3(a, k) { return [a[0]*k, a[1]*k, a[2]*k]; }
/* the same sRGB-to-linear the shader does, for the colours that are
   already light by the time they reach it — the lamps and the ambient */
function lin3(c) {
  return [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)];
}
function norm3(v) {
  var l = Math.hypot(v[0], v[1], v[2]);
  return [v[0]/l, v[1]/l, v[2]/l];
}

/* ---------- the room's light rig ----------
   A practical lamp high on one side, a cool bounce from the other, and
   the directions both come from. Fixed in world space rather than stuck
   to the camera, so orbiting the board walks you around the light the
   way walking around a real table does: the near side is lit, the far
   side falls away, and the shadows swing. A camera-locked light is the
   single most reliable way to make a 3D scene look like a diagram. */
var KEY_DIR  = norm3([-0.40, 1.22, 0.44]);
var FILL_DIR = norm3([0.58, 0.30, -0.64]);
var KEY_COL  = [1.00, 0.945, 0.872];     /* tungsten, just off white */
var FILL_COL = [0.68, 0.71, 0.80];       /* daylight through a window */

function derive(skin, place) {
  var b = skin.board, p = skin.pieces, m = skin.marks;
  var surf = (root.Skins && root.Skins.surface) ? root.Skins.surface(skin)
           : { spec: 0.5, power: 34, rim: 0.1, alpha: 1, translucent: false };
  var bgHex = b.light === b.dark ? "#101010" : skin.room.bg;
  var room = vec3(bgHex);
  var th = {
    /* hex, for painting the board texture on a 2D canvas */
    light: b.light, dark: b.dark, rim: b.rim, margin: b.edge, coord: b.coord,
    pattern: b.pattern, grain: b.grain, gloss: b.gloss,
    /* vec3, for the shader */
    bg: room,
    white: vec3(p.white), black: vec3(p.black), rimVec: vec3(b.rim),
    selected: vec3(m.select), legal: vec3(m.legal), capt: vec3(m.capture),
    last: vec3(m.last), check: vec3(m.check), hint: vec3(m.hint),
    /* material: spec and power for the 2D board, rough and metal for
       the 3D one, both describing the same surface */
    spec: surf.spec, power: surf.power, rimLight: surf.rim,
    rough: surf.rough == null ? 0.4 : surf.rough,
    metal: surf.metal == null ? 0 : surf.metal,
    /* how far light gets into the material, and the lacquer over it */
    sss: surf.sss || 0, coat: surf.coat || 0,
    alpha: surf.alpha, translucent: surf.translucent,
    /* the light rig, in linear. The sky is the room's own colour lifted
       toward a neutral so a very dark skin still has somewhere for the
       ambient to come from; the ground is the board bouncing back up,
       which is what stops the underside of a piece going black. */
    keyCol: scale3(lin3(KEY_COL), 1.52),
    fillCol: scale3(lin3(FILL_COL), 0.34),
    sky: scale3(lin3(mix3(room, [0.56, 0.62, 0.74], 0.58)), 0.44),
    ground: scale3(lin3(vec3(b.light)), 0.075),
    /* the far wall, the floor it stands on, and how much of the lamp
       spills onto them */
    skyTop: scale3(lin3(room), 0.72),
    lampGlow: mix3(scale3(lin3(KEY_COL), 0.12), scale3(lin3(room), 1.2), 0.45),
    skyFloor: scale3(lin3(mix3(room, vec3(b.edge), 0.30)), 1.65),
    exposure: 1.0,
    /* the lens. Gloss drives the bloom because a polished board throws
       more light back at it, and the aberration and grain stay small
       enough that you would only notice them switched off. */
    bloom: 0.40 + b.gloss * 0.34,
    bloomCut: 0.72,
    vignette: 0.30,
    /* the lens's grain, not the board's: the two shared a name once,
       and the lens's few thousandths won — which is why the carved
       board never showed the wood its skin asked for */
    filmGrain: REDUCED ? 0 : 0.013,
    /* measured at the corner: a couple of pixels of fringe on a wide
       screen. Anything you can actually see as colour separation is a
       broken lens, not a good one. */
    aberration: 0.006,
    /* how deep to cut the relief, and how much of the board to mirror */
    bump: 0.30 + b.grain * 0.55,
    mirror: Math.max(0, b.gloss - 0.08) * 0.46,
    keyDir: KEY_DIR, fillDir: FILL_DIR, table: null
  };
  return place && place.def && place.def.table ? inPlace(th, place, b) : th;
}

/* The same skin, standing somewhere. The place brings its own light —
   the sun or the lamp, from where it really hangs, in its own colour —
   and the shade under everything takes the colour of the place: the
   ambient sky is the panorama's own average above the horizon, and what
   bounces up from below is the board mixed with the table it stands
   on. The board keeps its colours and its finish; only the light it is
   seen by changes, which is what moving a real board from a café to a
   park does. */
function inPlace(th, place, b) {
  var d = place.def, t = d.table;
  th.keyDir = d.key.dir;
  th.fillDir = d.fill.dir;
  th.keyCol = scale3(lin3(d.key.col), d.key.power);
  th.fillCol = scale3(lin3(d.fill.col), d.fill.power);
  th.sky = scale3(place.sky, 1.15);
  th.ground = mix3(scale3(lin3(vec3(b.light)), 0.06), scale3(lin3(vec3(t.edge)), 0.10), 0.5);
  th.exposure = d.exposure;
  /* the table as a reflection sees it: its average colour, under the
     place's own light */
  var tl = place.tableAvg || lin3(vec3(t.edge)), lit = [0, 0, 0];
  for (var c = 0; c < 3; c++) lit[c] = tl[c] * (th.keyCol[c] * Math.max(0, d.key.dir[1]) / Math.PI * 0.85 + th.sky[c]);
  th.tableLit = lit;
  th.table = t;
  th.cookie = d.cookie;
  th.hot = d.hot;
  th.bgGain = d.bgGain;
  th.lift = d.lift;
  return th;
}

/* ---------- tiny mat4 (column-major, like GL wants) ---------- */
function mIdent() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function mMul(a, b) {
  var o = new Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  }
  return o;
}
function mPersp(fovY, aspect, near, far) {
  var f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
}
function mLookAt(eye, at, up) {
  var zx = eye[0]-at[0], zy = eye[1]-at[1], zz = eye[2]-at[2];
  var zl = Math.hypot(zx,zy,zz); zx/=zl; zy/=zl; zz/=zl;
  var xx = up[1]*zz-up[2]*zy, xy = up[2]*zx-up[0]*zz, xz = up[0]*zy-up[1]*zx;
  var xl = Math.hypot(xx,xy,xz); xx/=xl; xy/=xl; xz/=xl;
  var yx = zy*xz-zz*xy, yy = zz*xx-zx*xz, yz = zx*xy-zy*xx;
  return [xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
          -(xx*eye[0]+xy*eye[1]+xz*eye[2]), -(yx*eye[0]+yy*eye[1]+yz*eye[2]), -(zx*eye[0]+zy*eye[1]+zz*eye[2]), 1];
}
/* The whole inverse, by cofactors. A tap has to be carried back through
   exactly the matrices the picture went out through — lens shift and
   all — and a hand-inverted special case is one more thing that can
   quietly disagree with the projection it is meant to undo. */
function mInvert(m) {
  var a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7],
      a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  var b00 = a00*a11 - a01*a10, b01 = a00*a12 - a02*a10, b02 = a00*a13 - a03*a10,
      b03 = a01*a12 - a02*a11, b04 = a01*a13 - a03*a11, b05 = a02*a13 - a03*a12,
      b06 = a20*a31 - a21*a30, b07 = a20*a32 - a22*a30, b08 = a20*a33 - a23*a30,
      b09 = a21*a32 - a22*a31, b10 = a21*a33 - a23*a31, b11 = a22*a33 - a23*a32;
  var det = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06;
  if (!det) return null;
  det = 1 / det;
  return [(a11*b11 - a12*b10 + a13*b09)*det, (a02*b10 - a01*b11 - a03*b09)*det,
          (a31*b05 - a32*b04 + a33*b03)*det, (a22*b04 - a21*b05 - a23*b03)*det,
          (a12*b08 - a10*b11 - a13*b07)*det, (a00*b11 - a02*b08 + a03*b07)*det,
          (a32*b02 - a30*b05 - a33*b01)*det, (a20*b05 - a22*b02 + a23*b01)*det,
          (a10*b10 - a11*b08 + a13*b06)*det, (a01*b08 - a00*b10 - a03*b06)*det,
          (a30*b04 - a31*b02 + a33*b00)*det, (a21*b02 - a20*b04 - a23*b00)*det,
          (a11*b07 - a10*b09 - a12*b06)*det, (a00*b09 - a01*b07 + a02*b06)*det,
          (a31*b01 - a30*b03 - a32*b00)*det, (a20*b03 - a21*b01 + a22*b00)*det];
}
/* the shadow camera: a light this far away has no perspective to
   speak of, so it sees the board through a box rather than a cone */
function mOrtho(half, near, far) {
  var nf = 1 / (near - far);
  return [1/half,0,0,0, 0,1/half,0,0, 0,0,2*nf,0, 0,0,(far+near)*nf,1];
}
function mModel(x, y, z, s, ry, sy) {
  var c = Math.cos(ry || 0), n = Math.sin(ry || 0);
  return [s*c,0,-s*n,0, 0,(sy == null ? s : sy),0,0, s*n,0,s*c,0, x,y,z,1];
}
/* The same thing, plus a lean. A piece that is banking into a long
   diagonal, or being pushed over by whatever just took it, rotates
   about a horizontal axis through its own base — which is the origin of
   every carved mesh, so the axis passes through the point the piece
   actually stands on and it tips on its edge rather than sinking
   through the board.

   Rodrigues, written out for an axis with no y component, then the yaw
   and the scale folded into the same three columns. The lean is applied
   outside the yaw so that "fall this way" means a direction on the
   board rather than one relative to whichever way the piece is facing. */
function mLean(x, y, z, sxz, sy, ry, ax, az, ang) {
  if (!ang) return mModel(x, y, z, sxz, ry, sy);
  var c = Math.cos(ang), s = Math.sin(ang), k = 1 - c;
  var r00 = c + k*ax*ax, r01 = -s*az,      r02 = k*ax*az,
      r10 = s*az,        r11 = c,          r12 = -s*ax,
      r20 = k*ax*az,     r21 = s*ax,       r22 = c + k*az*az;
  var cy = Math.cos(ry || 0), ny = Math.sin(ry || 0);
  /* R · Ry, column by column, with the scale riding on the columns */
  var m00 = r00*cy + r02*ny, m02 = -r00*ny + r02*cy,
      m10 = r10*cy + r12*ny, m12 = -r10*ny + r12*cy,
      m20 = r20*cy + r22*ny, m22 = -r20*ny + r22*cy;
  return [m00*sxz, m10*sxz, m20*sxz, 0,
          r01*sy,  r11*sy,  r21*sy,  0,
          m02*sxz, m12*sxz, m22*sxz, 0,
          x, y, z, 1];
}

/* ---------- geometry ----------
   The men themselves are carved in pieces3d.js — a whole workshop of
   lathes, lofts and battlements, with several sets on the shelf and a
   door for sets that arrive from outside. What's left here is the flat
   furniture of the board: discs, rings, the quad the wood is painted on,
   and the rim under it. */
/* Looked up when a board is created rather than when this file is
   evaluated, so the two script tags can be in either order. */
function workshop() {
  if (root.Pieces3D) return root.Pieces3D;
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    try { return require("./pieces3d.js"); } catch (e) { return null; }
  }
  return null;
}
/* how a piece moves is shared with the 2D board, so it lives in its own
   file and is looked up the same way the workshop is */
function motionKit() {
  if (root.Motion) return root.Motion;
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    try { return require("./motion.js"); } catch (e) { return null; }
  }
  return null;
}

/* flat disc (shadows, move dots) and ring (capture marks) at y=0 */
function disc(segs) {
  var pos = [0, 0, 0], idx = [];
  for (var i = 0; i <= segs; i++) {
    var a = (i / segs) * Math.PI * 2;
    pos.push(Math.cos(a), 0, Math.sin(a));
    if (i) idx.push(0, i, i + 1);
  }
  return { pos: pos, idx: idx };
}
function ring(segs, inner) {
  var pos = [], idx = [];
  for (var i = 0; i <= segs; i++) {
    var a = (i / segs) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pos.push(c * inner, 0, s * inner, c, 0, s);
    if (i) { var b = (i - 1) * 2; idx.push(b, b+1, b+2, b+1, b+3, b+2); }
  }
  return { pos: pos, idx: idx };
}
/* A disc that fades to nothing at its edge, and a ring that is brightest
   along its middle. The shade attribute, which is baked occlusion on a
   man, is alpha on a marker — so a dot of light on the board is a dot
   of light rather than a coin, and a ring is a ring of light rather than
   a washer. */
function softDisc(segs, rings) {
  var pos = [0, 0, 0], nrm = [0, 1, 0], shade = [1], idx = [], k, i, j;
  for (k = 1; k <= rings; k++) {
    var r = k / rings, sh = k === rings ? 0 : Math.pow(1 - r * r, 1.6);
    for (i = 0; i < segs; i++) {
      var a = (i / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); nrm.push(0, 1, 0); shade.push(sh);
    }
  }
  for (i = 0; i < segs; i++) idx.push(0, 1 + i, 1 + (i + 1) % segs);
  for (k = 1; k < rings; k++) {
    var a0 = 1 + (k - 1) * segs, b0 = 1 + k * segs;
    for (i = 0; i < segs; i++) { j = (i + 1) % segs; idx.push(a0 + i, b0 + i, b0 + j, a0 + i, b0 + j, a0 + j); }
  }
  return { pos: pos, nrm: nrm, shade: shade, idx: idx };
}
function softRing(segs, inner) {
  var radii = [inner, (inner + 1) / 2, 1], sh = [0, 1, 0], pos = [], nrm = [], shade = [], idx = [], k, i, j;
  for (k = 0; k < 3; k++) for (i = 0; i < segs; i++) {
    var a = (i / segs) * Math.PI * 2;
    pos.push(Math.cos(a) * radii[k], 0, Math.sin(a) * radii[k]); nrm.push(0, 1, 0); shade.push(sh[k]);
  }
  for (k = 0; k < 2; k++) {
    var a0 = k * segs, b0 = (k + 1) * segs;
    for (i = 0; i < segs; i++) { j = (i + 1) % segs; idx.push(a0 + i, b0 + i, b0 + j, a0 + i, b0 + j, a0 + j); }
  }
  return { pos: pos, nrm: nrm, shade: shade, idx: idx };
}
function quadXZ() { /* unit square centred on origin */
  return { pos: [-0.5,0,-0.5, 0.5,0,-0.5, 0.5,0,0.5, -0.5,0,0.5], idx: [0,2,1,0,3,2] };
}

/* ---------- shaders ----------

   The old renderer was one lamp, one highlight and a flat board:
   honest, cheap, and about as convincing as a photocopy. What replaced
   it is the pipeline a small game would use, written out longhand
   because there is no engine here to hide it.

   Light is done in linear space and converted back at the very end.
   That one change does more than any effect: a sRGB colour multiplied
   by a light in sRGB space is simply the wrong sum, which is why the
   old board went chalky in the pale squares and muddy in the dark ones.

   The surface model is Cook-Torrance — GGX for the highlight's shape,
   Smith for the shadowing between microfacets, Schlick for the way
   every material turns into a mirror at a grazing angle. Fresnel is why
   a matte wooden piece still catches the light along its silhouette,
   and it is free.

   Ambient is a two-colour sky: the room's own light from above, the
   board's colour bouncing back from below. Lit by one direction and a
   constant, a round piece reads as a cylinder; lit by a gradient it
   reads as round.

   aShade is the occlusion baked into the mesh at carving time —
   crevices, undercuts, the last millimetres above the board. It costs
   one float a vertex, does more for a piece than another lamp would,
   and unlike a lamp it stays put when the camera orbits. */

var GLSL_COMMON = [
  /* sRGB is a storage format, not a light. Everything between these two
     conversions lives in linear. */
  "vec3 toLinear(vec3 c){ return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878); }",
  /* ACES, the filmic curve: it rolls the brightest parts off instead of
     clipping them, which is the whole reason a white king under a lamp
     stops looking like a hole cut in the screen. */
  "vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }",
  "float D_GGX(float NoH, float a){ float a2 = a*a; float d = NoH*NoH*(a2-1.0)+1.0; return a2/(3.14159265*d*d+1e-7); }",
  "float V_Smith(float NoV, float NoL, float a){",
  "  float k = a*0.5;",
  "  float gv = NoV*(1.0-k)+k, gl2 = NoL*(1.0-k)+k;",
  "  return 0.25/(gv*gl2+1e-5);",
  "}",
  "vec3 F_Schlick(vec3 f0, float u){ return f0 + (1.0-f0)*pow(1.0-u, 5.0); }",
  /* the room, as a function rather than a cube map: a sky colour, a
     bounce colour, one soft overhead source that a polished piece can
     find and a matte one cannot, and a band at the horizon standing in
     for the lit wall behind the table. No asset to download, and it
     tints itself from whatever skin is loaded. */
  "vec3 envSample(vec3 d, float rough, vec3 sky, vec3 ground, vec3 keyCol){",
  "  float up = d.y*0.5+0.5;",
  "  vec3 base = mix(ground, sky, smoothstep(0.0, 1.0, up));",
  "  float sharp = mix(26.0, 2.0, rough);",
  "  float spot = pow(max(d.y, 0.0), sharp) * (1.0 - rough*0.6);",
  "  float band = pow(max(1.0 - abs(d.y - 0.10)*2.6, 0.0), mix(8.0, 2.0, rough)) * (1.0 - rough*0.8);",
  "  return base + keyCol * (spot*0.95 + band*0.30);",
  "}",
  /* WebGL 1 with no depth texture to lean on: the shadow pass writes
     distance across four 8-bit channels and reads it back. Portable
     everywhere, and precise enough for a board eight squares wide. */
  "vec4 packDepth(float v){",
  "  vec4 e = vec4(1.0, 255.0, 65025.0, 16581375.0) * v;",
  "  e = fract(e);",
  "  e -= e.yzww * vec4(1.0/255.0, 1.0/255.0, 1.0/255.0, 0.0);",
  "  return e;",
  "}",
  "float unpackDepth(vec4 c){ return dot(c, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }",
  /* a direction as a place in a panorama: round the horizon for u,
     straight up to straight down for v (scenes.js paints them that way) */
  "vec2 equirect(vec3 d){ return vec2(atan(d.z, d.x) * 0.15915494 + 0.5, acos(clamp(d.y, -1.0, 1.0)) * 0.31830989); }",
  /* a panorama is stored as 8-bit paint, so the sun and the bulbs in it
     are pushed past white on the way in — how far is the place's own
     say — or they would sit in a reflection like dabs of cream */
  "vec3 fromPano(vec3 s, float gain, float hot){",
  "  float m = max(s.r, max(s.g, s.b));",
  "  return toLinear(s) * gain * (1.0 + hot * smoothstep(0.80, 1.0, m));",
  "}"
].join("\n");

/* the lighting every lit surface shares, so the board and the men are
   lit by the same room rather than by two different guesses.

   uDirect is the escape hatch: normally the scene is drawn into a
   floating-point target and tone-mapped once at the end, but on a card
   that cannot give us one, each shader finishes the job itself. Same
   curve either way — a weak browser gets fewer effects, never a
   different-looking board. */
var GLSL_LIGHT = [
  "uniform vec3 uEye, uKeyDir, uKeyCol, uFillDir, uFillCol, uSky, uGround;",
  "uniform float uExposure, uDirect;",
  "uniform sampler2D uShadow; uniform mat4 uLightVP; uniform float uShadowOn, uShadowTexel, uShadowSoft;",
  /* the place: what it looks like in every direction (sharp, and a
     blurred copy for rough surfaces), and what the key light comes
     through on its way in */
  "uniform sampler2D uPano, uEnvTex, uCookie;",
  "uniform float uEnvOn, uEnvGain, uHot, uCookieAmt, uCookieScale;",
  "uniform vec3 uTableLit;",
  /* Leaves or window bars between the light and the world. The tile is
     laid on the ground as the light sees it, so a point is pushed back
     along the light to the board's height before it is looked up: a
     king's crown and the square he stands on, both in the same fleck of
     sun, agree about where that fleck is. */
  "float cookieAt(vec3 world){",
  "  if (uCookieAmt <= 0.0) return 1.0;",
  "  vec2 p = world.xz - uKeyDir.xz / max(uKeyDir.y, 0.2) * world.y;",
  "  return mix(1.0 - uCookieAmt, 1.0, texture2D(uCookie, p * uCookieScale).r);",
  "}",
  /* What a surface reflects: in a place, the place itself — sharp for a
     polish, its blurred copy for anything rougher — and in the studio,
     the two-colour room it always had. */
  "vec3 envLook(vec3 d, float rough){",
  "  if (uEnvOn < 0.5) return envSample(d, rough, uSky, uGround, uKeyCol);",
  "  vec2 uv = equirect(d);",
  "  vec3 soft = fromPano(texture2D(uEnvTex, uv).rgb, uEnvGain, uHot * 0.5);",
  "  vec3 sharp = fromPano(texture2D(uPano, uv).rgb, uEnvGain, uHot);",
  "  vec3 c = mix(sharp, soft, smoothstep(0.08, 0.55, rough));",
  /* a man's skirt looks down at the table he stands on, not past it at
     the lawn: below the horizon the reflection turns to the table's own
     lit colour */
  "  return mix(c, uTableLit, smoothstep(-0.02, -0.30, d.y));",
  "}",
  "float shadowAt(vec3 world, float NoL){",
  "  if (uShadowOn < 0.5) return 1.0;",
  "  vec4 lp = uLightVP * vec4(world, 1.0);",
  "  vec3 c = lp.xyz / lp.w * 0.5 + 0.5;",
  "  if (c.x < 0.002 || c.x > 0.998 || c.y < 0.002 || c.y > 0.998 || c.z > 1.0) return 1.0;",
  "  float bias = max(0.0030 * (1.0 - NoL), 0.0010);",
  "  float sum = 0.0;",
  /* the nine taps are spun by a different angle on every pixel. A fixed
     grid at this resolution gives a shadow edge you can count the steps
     of; a spun one trades those steps for a faint noise, and noise at
     this amplitude is indistinguishable from softness. */
  "  float ra = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;",
  "  float rc = cos(ra), rs = sin(ra);",
  /* How soft the edge is depends on how far away the thing casting it
     is: a lamp is not a point, so a king's foot throws a hard shadow
     and his crown, a hand's height above the board, a soft one. Four
     wide taps find the average depth of whatever is in the way, and
     the gap from there to here sets the spread of the sixteen taps
     that follow. The simpler tiers keep the nine fixed taps below. */
  "  if (uShadowSoft > 0.5){",
  "    float blk = 0.0, nb = 0.0;",
  "    for (int i = 0; i < 4; i++){",
  "      vec2 g = vec2(i < 2 ? -1.0 : 1.0, (i == 0 || i == 3) ? -1.0 : 1.0) * uShadowTexel * 6.0;",
  "      vec2 o = vec2(g.x*rc - g.y*rs, g.x*rs + g.y*rc);",
  "      float d = unpackDepth(texture2D(uShadow, c.xy + o));",
  "      if (d < c.z - bias){ blk += d; nb += 1.0; }",
  "    }",
  "    float spread = nb > 0.0 ? clamp(1.1 + (c.z - blk / nb) * 300.0, 1.1, 9.0) : 1.6;",
  "    float soft = 0.0;",
  "    for (int y = 0; y < 4; y++){",
  "      for (int x = 0; x < 4; x++){",
  "        vec2 g = (vec2(float(x), float(y)) - 1.5) * uShadowTexel * spread * 0.8;",
  "        vec2 o = vec2(g.x*rc - g.y*rs, g.x*rs + g.y*rc);",
  "        float d = unpackDepth(texture2D(uShadow, c.xy + o));",
  "        soft += step(c.z - bias, d);",
  "      }",
  "    }",
  "    return soft * (1.0/16.0);",
  "  }",
  /* a fixed 3x3 tap: WebGL 1 wants its loops counted at compile time,
     and nine samples is the difference between an edge you can see the
     pixels of and one you cannot */
  "  for (int y = -1; y <= 1; y++){",
  "    for (int x = -1; x <= 1; x++){",
  "      vec2 g = vec2(float(x), float(y)) * uShadowTexel * 2.4;",
  "      vec2 o = vec2(g.x*rc - g.y*rs, g.x*rs + g.y*rc);",
  "      float d = unpackDepth(texture2D(uShadow, c.xy + o));",
  "      sum += step(c.z - bias, d);",
  "    }",
  "  }",
  "  return sum * (1.0/9.0);",
  "}",
  "vec3 shade(vec3 albedo, vec3 N, vec3 world, float rough, float metal, float ao, float rim, float sss, float coat){",
  "  vec3 V = normalize(uEye - world);",
  "  float NoV = max(dot(N, V), 1e-4);",
  "  vec3 f0 = mix(vec3(0.04), albedo, metal);",
  "  vec3 diffCol = albedo * (1.0 - metal);",
  "  float a = max(rough*rough, 0.002);",
  "  vec3 col = vec3(0.0);",
  /* the key light, the only one that casts */
  "  vec3 L = uKeyDir;",
  "  float NoLr = dot(N, L);",
  /* Light gets a little way into ivory and porcelain before it comes
     back out, which is why the shadow side of an ivory bishop is warm
     rather than black and the edge of a finial glows. The diffuse term
     is wrapped past the terminator by that much; the highlight is not,
     because the polish is on the outside. */
  "  float wrap = sss * 0.45;",
  "  float NoL = max((NoLr + wrap) / (1.0 + wrap), 0.0);",
  "  float NoLs = max(NoLr, 0.0);",
  "  float cook = cookieAt(world);",
  "  /* a shadow is never quite black: some of the key light arrives",
  "     anyway, off the table and the walls, and a hard zero is the",
  "     thing that makes a rendered shadow look like a sticker */",
  "  float sh = (NoLr > 0.0 ? mix(0.18, 1.0, shadowAt(world, NoLr)) : 0.42) * cook;",
  "  vec3 H = normalize(L + V);",
  "  float NoH = max(dot(N, H), 0.0), VoH = max(dot(V, H), 0.0);",
  "  vec3 spec = F_Schlick(f0, VoH) * D_GGX(NoH, a) * V_Smith(NoV, NoLs, a);",
  /* the clearcoat: a second, glassier lobe over the first, and the
     layer under it loses whatever the coat has already reflected */
  "  float Fc = F_Schlick(vec3(0.04), VoH).x * coat;",
  "  float specC = Fc * D_GGX(NoH, 0.010) * V_Smith(NoV, NoLs, 0.010);",
  "  col += (diffCol * (1.0/3.14159265) * NoL * (1.0 - Fc) + (spec * (1.0 - Fc) + specC) * NoLs) * uKeyCol * sh;",
  /* and through the thin parts: light arriving from behind a finial
     and seen from the front. Nothing here knows how thick a man is, so
     his edges, which are always his thinnest part, get the most of it. */
  "  float trans = pow(clamp(dot(V, -normalize(L + N * 0.35)), 0.0, 1.0), 3.0);",
  "  col += albedo * uKeyCol * trans * sss * 0.22 * (0.4 + 0.6 * (1.0 - NoV)) * (0.35 + 0.65 * ao) * cook;",
  /* fill: no shadow, no highlight to speak of, just the other side of
     the room so nothing falls to pure black */
  "  float NoF = max((dot(N, uFillDir) + wrap) / (1.0 + wrap), 0.0);",
  "  col += diffCol * (1.0/3.14159265) * uFillCol * NoF;",
  /* ambient: a sky above, the board bouncing below, and a reflection of
     both weighted by how polished the surface is. A material light gets
     into is lit a little more evenly from all round. */
  "  vec3 irr = mix(uGround, uSky, mix(N.y*0.5+0.5, 0.62, sss * 0.45));",
  "  col += diffCol * irr * ao;",
  "  vec3 Rv = reflect(-V, N);",
  "  vec3 envc = envLook(Rv, rough);",
  "  vec3 Fr = F_Schlick(f0, NoV);",
  "  col += envc * Fr * mix(ao, 1.0, 0.5) * (1.0 - Fc);",
  /* the coat reflects the room sharply whatever is under it */
  "  float Fcv = F_Schlick(vec3(0.04), NoV).x * coat;",
  "  if (Fcv > 0.0005) col += envLook(Rv, 0.05) * Fcv * mix(ao, 1.0, 0.6);",
  /* the edge of the room caught on a silhouette */
  "  col += uSky * rim * pow(1.0 - NoV, 3.0) * ao;",
  "  return col * uExposure;",
  "}",
  /* one exit for every lit shader: straight out in linear when the post
     chain is going to finish the job, graded here when it isn't */
  "vec4 emit(vec3 c, float alpha){",
  "  if (uDirect > 0.5) return vec4(pow(aces(c), vec3(1.0/2.2)), alpha);",
  "  return vec4(c, alpha);",
  "}"
].join("\n");

/* ---- the men ---- */
var VSH = [
  "attribute vec3 aPos; attribute vec3 aNrm; attribute float aShade;",
  "uniform mat4 uProj, uView, uModel;",
  "varying vec3 vNrm; varying vec3 vWorld; varying float vShade;",
  "void main(){",
  "  vec4 w = uModel * vec4(aPos, 1.0);",
  "  vWorld = w.xyz;",
  "  vNrm = mat3(uModel) * aNrm;",
  "  vShade = aShade;",
  "  gl_Position = uProj * uView * w;",
  "}"].join("\n");
var FSH = [
  "precision highp float;",
  GLSL_COMMON,
  GLSL_LIGHT,
  "uniform vec3 uColor, uHaloCol; uniform float uAlpha, uFlat, uRough, uMetal, uRimAmt, uGlow, uMirror, uSss, uCoat, uHaloAmt;",
  "varying vec3 vNrm; varying vec3 vWorld; varying float vShade;",
  "void main(){",
  /* markers, move dots and racing lines are not surfaces — they are
     light. They skip the whole model and go straight into the frame,
     which is also what lets the bloom pick them up. On a marker the
     shade attribute is alpha, so a soft disc fades out at its edge. */
  "  if (uFlat > 0.5){ gl_FragColor = emit(toLinear(uColor) * uGlow, uAlpha * vShade); return; }",
  "  float alpha = uAlpha;",
  /* the reflection pass draws the same men upside down through the
     board, clipped to the wood and fading as they fall away from it */
  "  if (uMirror > 0.0){",
  "    if (abs(vWorld.x) > 4.26 || abs(vWorld.z) > 4.26) discard;",
  "    alpha *= uMirror * exp(vWorld.y * 2.3);",
  "    if (alpha < 0.004) discard;",
  "  }",
  "  vec3 N = normalize(vNrm);",
  "  vec3 albedo = toLinear(uColor);",
  "  vec3 c = shade(albedo, N, vWorld, uRough, uMetal, vShade, uRimAmt, uSss, uCoat);",
  /* the man in the hand, or the one just touched: lit from within at
     his edges in the skin's own colour, so the eye knows which man the
     board is talking about without a box being drawn round him */
  "  if (uHaloAmt > 0.0){",
  "    float NoV = max(dot(N, normalize(uEye - vWorld)), 0.0);",
  "    c += toLinear(uHaloCol) * uHaloAmt * (pow(1.0 - NoV, 2.2) * 1.7 + 0.10) * (0.5 + 0.5 * vShade) * uExposure;",
  "  }",
  "  gl_FragColor = emit(c, alpha);",
  "}"].join("\n");

/* ---- the board ---- */
var VSH_TEX = [
  "attribute vec3 aPos; attribute vec2 aUV;",
  "uniform mat4 uProj, uView, uModel;",
  "varying vec2 vUV; varying vec3 vWorld;",
  "void main(){",
  "  vUV = aUV;",
  "  vec4 w = uModel * vec4(aPos, 1.0);",
  "  vWorld = w.xyz;",
  "  gl_Position = uProj * uView * w;",
  "}"].join("\n");
var FSH_TEX = [
  "precision highp float;",
  GLSL_COMMON,
  GLSL_LIGHT,
  "uniform sampler2D uTex, uNrmTex;",
  "uniform float uGloss, uBumpAmt, uContact;",
  "varying vec2 vUV; varying vec3 vWorld;",
  "void main(){",
  "  vec3 albedo = toLinear(texture2D(uTex, vUV).rgb);",
  /* the grain is a real surface, not a picture of one: the normal map
     is derived from the same canvas the colour came from, so wood lies
     along the board, marble veins catch the light across it, the
     grooves between squares have a lip, and the coordinates are cut
     into the margin rather than printed on it. The board is flat and
     axis-aligned, so its tangent frame is simply world x and z and
     there is no basis to carry through. */
  "  vec3 nm = texture2D(uNrmTex, vUV).rgb * 2.0 - 1.0;",
  "  vec3 N = normalize(vec3(nm.x * uBumpAmt, 1.0, nm.y * uBumpAmt));",
  "  float rough = mix(0.74, 0.14, uGloss);",
  /* On a table, the board's foot: a soft dark band hugging its edge,
     where the light from the room cannot get under it. This, more than
     the shadow, is what tells the eye the board is resting there rather
     than hovering a hair above. */
  "  float ao = 1.0;",
  "  if (uContact > 0.0){",
  "    vec2 q = max(abs(vWorld.xz) - vec2(uContact), 0.0);",
  "    float dd = length(q);",
  "    ao = 1.0 - 0.62 * exp(-dd * 5.0) - 0.22 * exp(-dd * 1.1);",
  "  }",
  "  vec3 c = shade(albedo, N, vWorld, rough, 0.0, ao, 0.03, 0.0, uGloss * 0.55) * mix(1.0, ao, 0.7);",
  "  gl_FragColor = emit(c, 1.0);",
  "}"].join("\n");

/* ---- shadow pass: distance from the light, and nothing else ---- */
var VSH_SHADOW = [
  "attribute vec3 aPos;",
  "uniform mat4 uLightVP, uModel;",
  "varying float vDepth;",
  "void main(){",
  "  vec4 p = uLightVP * uModel * vec4(aPos, 1.0);",
  "  vDepth = p.z / p.w * 0.5 + 0.5;",
  "  gl_Position = p;",
  "}"].join("\n");
var FSH_SHADOW = [
  "precision highp float;",
  GLSL_COMMON,
  "varying float vDepth;",
  "void main(){ gl_FragColor = packDepth(clamp(vDepth, 0.0, 1.0)); }"].join("\n");

/* ---- post ----
   One big triangle rather than a quad: it covers the screen in three
   vertices and needs no index buffer. */
var VSH_POST = [
  "attribute vec2 aPos;",
  "varying vec2 vUV;",
  "void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }"].join("\n");

/* everything above a threshold, which is what a lens would smear */
var FSH_BRIGHT = [
  "precision mediump float;",
  "uniform sampler2D uTex; uniform float uThreshold;",
  "varying vec2 vUV;",
  "void main(){",
  "  vec3 c = texture2D(uTex, vUV).rgb;",
  "  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));",
  "  float k = max(l - uThreshold, 0.0) / max(l, 1e-4);",
  "  gl_FragColor = vec4(c * k, 1.0);",
  "}"].join("\n");
var FSH_BLUR = [
  "precision mediump float;",
  "uniform sampler2D uTex; uniform vec2 uDir;",
  "varying vec2 vUV;",
  "void main(){",
  /* a nine-tap gaussian folded into five bilinear samples, run once
     across and once down — the separable trick that makes a wide blur
     affordable */
  "  vec3 c = texture2D(uTex, vUV).rgb * 0.2270270270;",
  "  c += texture2D(uTex, vUV + uDir * 1.3846153846).rgb * 0.3162162162;",
  "  c += texture2D(uTex, vUV - uDir * 1.3846153846).rgb * 0.3162162162;",
  "  c += texture2D(uTex, vUV + uDir * 3.2307692308).rgb * 0.0702702703;",
  "  c += texture2D(uTex, vUV - uDir * 3.2307692308).rgb * 0.0702702703;",
  "  gl_FragColor = vec4(c, 1.0);",
  "}"].join("\n");
var FSH_COMPOSITE = [
  "precision highp float;",
  GLSL_COMMON,
  "uniform sampler2D uScene, uBloom, uBloom2;",
  "uniform float uBloomAmt, uBloomAmt2, uVignette, uGrain, uTime, uAberration;",
  "varying vec2 vUV;",
  "float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }",
  "void main(){",
  "  vec2 d = vUV - 0.5;",
  "  float r2 = dot(d, d);",
  /* the faintest colour fringe toward the corners — a real lens does
     it, and leaving it out is one of the things that reads as
     "computer" */
  "  vec2 off = d * r2 * uAberration;",
  "  vec3 c;",
  "  c.r = texture2D(uScene, vUV + off).r;",
  "  c.g = texture2D(uScene, vUV).g;",
  "  c.b = texture2D(uScene, vUV - off).b;",
  /* two blooms: a tight one that puts a halo on a highlight, and a wide
     one, an eighth of the width, that lets a lamp warm the whole corner
     of the frame it hangs in — the second is what a lens really does */
  "  c += texture2D(uBloom, vUV).rgb * uBloomAmt + texture2D(uBloom2, vUV).rgb * uBloomAmt2;",
  "  c *= 1.0 - uVignette * smoothstep(0.06, 0.78, r2);",
  "  c = aces(c);",
  /* back out to sRGB for the screen */
  "  c = pow(c, vec3(1.0/2.2));",
  "  c += (hash(vUV * 1024.0 + uTime) - 0.5) * uGrain;",
  "  gl_FragColor = vec4(c, 1.0);",
  "}"].join("\n");

/* ---------- how big the wood is ----------
   The squares are one unit each, centred on the origin, because that is
   where the men stand, where the markers are laid and where a tap is
   worked out. The board's texture paints a frame round them that is
   MARGIN of its width on each side, so the quad it is painted on has to
   be exactly 4 / (1 - 2·MARGIN) from the middle to the edge — any other
   size stretches the painted squares out from under the men. It used to
   be 4.62, which made every painted square 1.028 units: an h-file rook
   stood a tenth of a square inside its own square, and a highlight on
   h8 sat visibly off the wood it was marking. */
var MARGIN = 0.055;
var HALF = 4 / (1 - 2 * MARGIN);
var RIM_DEPTH = 0.30;                    /* how far the edge of the board drops */

/* ---------- board texture (painted on an offscreen canvas) ----------
   The same five patterns the 2D board knows, so a skin looks like
   itself whichever way you're playing. */
function paintPattern(g, x, y, cell, dark, th, f, r) {
  /* wood, marble and linen are fields now (grain.js), laid over the
     squares in one pass below; what is left to draw by hand is the
     inlay's bright line round each square */
  if (th.grain <= 0.02 || th.pattern !== "inlay") return;
  g.save();
  g.beginPath(); g.rect(x, y, cell, cell); g.clip();
  g.globalAlpha = 0.25 + th.grain * 0.5;
  g.strokeStyle = dark ? "#fff" : "#000";
  g.lineWidth = Math.max(2, cell * 0.03);
  g.strokeRect(x + cell * 0.08, y + cell * 0.08, cell * 0.84, cell * 0.84);
  g.restore();
}

/* ---- the grain, as a field ----
   grain.js paints the sixty-four squares as one field — tone for the
   colour, relief for the height map — and the frame round them as one
   long plank, so the carved board's light reads the very grain its
   colour shows. Both canvases call this: once in colour, once in grey. */
var GRAIN_SEED = 1947, FRAME_SEED = 5;
function grainOver(g, th, S, margin, mode) {
  var Gr = root.Grain;
  if (!Gr || !(th.grain > 0.02)) return;
  /* the frame first, under everything: wood whatever the squares are,
     because a board's frame is, and at a longer run of rings */
  var all = g.getImageData(0, 0, S, S);
  Gr.apply(all, Gr.field(256, { pattern: "wood", tiles: 1, seed: FRAME_SEED, lines: 30 }),
           { x: 0, y: 0, w: S, h: S }, th.grain * (mode === "height" ? 0.5 : 0.7), mode);
  g.putImageData(all, 0, 0);
}
function grainSquares(g, th, S, margin, mode) {
  var Gr = root.Grain;
  if (!Gr || !(th.grain > 0.02)) return;
  var m = Math.round(margin), w = S - m * 2;
  var sq = g.getImageData(m, m, w, w);
  Gr.apply(sq, Gr.field(512, { pattern: th.pattern, seed: GRAIN_SEED }), { x: 0, y: 0, w: w, h: w }, th.grain, mode);
  g.putImageData(sq, m, m);
}

function boardTexture(th) {
  var S = 1024, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  var g = cv.getContext("2d", { willReadFrequently: true });
  var margin = S * MARGIN, cell = (S - margin * 2) / 8;
  g.fillStyle = th.margin; g.fillRect(0, 0, S, S);
  /* the frame: one long plank, grain running the length of it */
  grainOver(g, th, S, margin, "colour");
  for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
    /* canvas row 0 is the top of the texture = rank 8 */
    var x = margin + f * cell, y = margin + r * cell;
    var isDark = ((f + (7 - r)) % 2 === 0);
    g.fillStyle = isDark ? th.dark : th.light;
    g.fillRect(x, y, cell + 1, cell + 1);
  }
  /* the sixty-four, each its own cut of veneer */
  grainSquares(g, th, S, margin, "colour");
  for (var r2 = 0; r2 < 8; r2++) for (var f2 = 0; f2 < 8; f2++) {
    paintPattern(g, margin + f2 * cell, margin + r2 * cell, cell, ((f2 + (7 - r2)) % 2 === 0), th, f2, r2);
  }
  /* The sheen used to be painted in here, because there was no light to
     make one. There is now, so what is left is a whisper of unevenness
     in the finish rather than a highlight — a real one would fight the
     computed one and win, in the wrong direction. */
  if (th.gloss > 0.02) {
    var gl2 = g.createLinearGradient(margin, margin, S - margin, S - margin);
    gl2.addColorStop(0, "rgba(255,255,255," + (0.055 * th.gloss).toFixed(3) + ")");
    gl2.addColorStop(0.45, "rgba(255,255,255,0)");
    gl2.addColorStop(1, "rgba(0,0,0," + (0.05 * th.gloss).toFixed(3) + ")");
    g.fillStyle = gl2;
    g.fillRect(margin, margin, S - margin * 2, S - margin * 2);
  }
  g.fillStyle = th.coord;
  g.font = "600 " + Math.round(margin * 0.62) + "px system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  for (var k = 0; k < 8; k++) {
    g.fillText("abcdefgh"[k], margin + (k + 0.5) * cell, S - margin * 0.48);
    g.fillText(String(8 - k), margin * 0.48, margin + (k + 0.5) * cell);
  }
  return cv;
}

/* ---- the room behind the board ----
   A flat clear colour is the one thing in a 3D scene that can never be
   mistaken for a photograph: real rooms have a floor, a far wall and a
   lamp in them. This is all three, in about as few instructions as a
   clear would have cost — a vertical gradient with a pool of light
   where the key light would be hanging. */
var FSH_SKY = [
  "precision mediump float;",
  GLSL_COMMON,
  "uniform vec3 uTop, uBottom, uGlowCol;",
  "uniform float uGlowAmt, uDirect;",
  "varying vec2 vUV;",
  "void main(){",
  "  vec3 c = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUV.y));",
  "  vec2 d = (vUV - vec2(0.42, 0.74)) * vec2(1.0, 1.35);",
  "  c += uGlowCol * uGlowAmt * exp(-dot(d, d) * 5.5);",
  "  if (uDirect > 0.5) c = pow(aces(c), vec3(1.0/2.2));",
  "  gl_FragColor = vec4(c, 1.0);",
  "}"].join("\n");

/* ---- the place around the board ----
   Every pixel of the background is a direction, worked out from the
   camera's own inverse, and the panorama is looked up there: orbit the
   board and the park turns behind it. One cheat, on purpose: the camera
   looks down at the board from well above it, which in honest
   perspective would show nothing behind the table but grass or floor.
   So the backdrop's elevation is lifted by uLift — roughly, the camera
   is told it is looking at the horizon while the table is drawn from
   where it really is. It is what a photographer does with a long lens
   and a low shot, and it is the difference between a lawn and a park. */
var FSH_PANO = [
  "precision highp float;",
  GLSL_COMMON,
  "uniform sampler2D uPano;",
  "uniform mat4 uInvVP;",
  "uniform vec3 uEye;",
  "uniform float uLift, uGain, uHot, uDirect;",
  "varying vec2 vUV;",
  "void main(){",
  "  vec4 p = uInvVP * vec4(vUV * 2.0 - 1.0, 1.0, 1.0);",
  "  vec3 d = normalize(p.xyz / p.w - uEye);",
  "  float el = clamp(asin(clamp(d.y, -1.0, 1.0)) + uLift, -1.5707, 1.5707);",
  "  vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, 0.5 - el * 0.31830989);",
  "  vec3 c = fromPano(texture2D(uPano, uv).rgb, uGain, uHot);",
  "  if (uDirect > 0.5) c = pow(aces(c), vec3(1.0/2.2));",
  "  gl_FragColor = vec4(c, 1.0);",
  "}"].join("\n");

/* ---------- the board's relief ----------
   The same board painted again, in grey, as a height field: 128 is the
   surface, lighter is proud of it and darker is cut into it. The
   squares get a shallow groove between them and sit a hair apart in
   height the way an inlaid board does, the pattern strokes become real
   grain rather than a drawing of grain, the margin is routed with a
   step, and the coordinates are engraved instead of printed.

   paintPattern does double duty here: its strokes are already black and
   white at low opacity, which on a grey base is exactly a height delta.
   One function, two jobs, and the grain can never drift out of
   agreement with the colour it belongs to. */
function heightCanvas(th, S) {
  var cv = document.createElement("canvas");
  cv.width = cv.height = S;
  var g = cv.getContext("2d", { willReadFrequently: true });
  var margin = S * MARGIN, cell = (S - margin * 2) / 8;
  g.fillStyle = "#808080"; g.fillRect(0, 0, S, S);
  /* margin: the plank's own grain, then a routed step just inside the frame */
  grainOver(g, th, S, margin, "height");
  g.strokeStyle = "#5a5a5a"; g.lineWidth = Math.max(3, S * 0.004);
  g.strokeRect(margin * 0.55, margin * 0.55, S - margin * 1.1, S - margin * 1.1);
  g.strokeStyle = "#9a9a9a"; g.lineWidth = Math.max(2, S * 0.0025);
  g.strokeRect(margin * 0.66, margin * 0.66, S - margin * 1.32, S - margin * 1.32);
  for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
    var x = margin + f * cell, y = margin + r * cell;
    var isDark = ((f + (7 - r)) % 2 === 0);
    /* dark squares a touch lower: two woods, two thicknesses */
    g.fillStyle = isDark ? "#7b7b7b" : "#848484";
    g.fillRect(x, y, cell + 1, cell + 1);
  }
  /* the grain itself, cut in: pores and year-lines, veins, the weave */
  grainSquares(g, th, S, margin, "height");
  for (var r2 = 0; r2 < 8; r2++) for (var f2 = 0; f2 < 8; f2++) {
    var x2 = margin + f2 * cell, y2 = margin + r2 * cell;
    paintPattern(g, x2, y2, cell, ((f2 + (7 - r2)) % 2 === 0), th, f2, r2);
    /* the groove where two squares meet */
    g.strokeStyle = "#6c6c6c";
    g.lineWidth = Math.max(1.5, cell * 0.012);
    g.strokeRect(x2 + 0.5, y2 + 0.5, cell, cell);
  }
  /* engraved coordinates — cut in, so the light catches one edge */
  g.fillStyle = "#636363";
  g.font = "600 " + Math.round(margin * 0.62) + "px system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  for (var k = 0; k < 8; k++) {
    g.fillText("abcdefgh"[k], margin + (k + 0.5) * cell, S - margin * 0.48);
    g.fillText(String(8 - k), margin * 0.48, margin + (k + 0.5) * cell);
  }
  return cv;
}

/* height field to normal map, by Sobel. The board is flat and
   axis-aligned, so there is no tangent basis to work out: x in the
   texture is x in the world and y is z, and the shader can tilt the
   normal straight off the two slopes. Stored with the slopes biased
   into 0..1 the way every normal map is, so it can live in an ordinary
   8-bit texture. */
function normalMapFrom(cv, strength) {
  var S = cv.width, g = cv.getContext("2d");
  var src = g.getImageData(0, 0, S, S).data;
  var out = new Uint8Array(S * S * 4);
  function h(x, y) {
    if (x < 0) x = 0; else if (x >= S) x = S - 1;
    if (y < 0) y = 0; else if (y >= S) y = S - 1;
    return src[(y * S + x) * 4] * (1 / 255);
  }
  for (var y = 0; y < S; y++) for (var x = 0; x < S; x++) {
    var dx = (h(x+1,y-1) + 2*h(x+1,y) + h(x+1,y+1)) - (h(x-1,y-1) + 2*h(x-1,y) + h(x-1,y+1));
    var dy = (h(x-1,y+1) + 2*h(x,y+1) + h(x+1,y+1)) - (h(x-1,y-1) + 2*h(x,y-1) + h(x+1,y-1));
    var o = (y * S + x) * 4;
    out[o]   = Math.max(0, Math.min(255, Math.round(128 - dx * strength * 127)));
    out[o+1] = Math.max(0, Math.min(255, Math.round(128 - dy * strength * 127)));
    out[o+2] = 255;
    out[o+3] = 255;
  }
  return { data: out, size: S };
}

/* ---------- renderer ---------- */
function create(canvas, opts) {
  opts = opts || {};
  var gl = canvas.getContext("webgl", { antialias: true, alpha: false }) ||
           canvas.getContext("experimental-webgl", { antialias: true, alpha: false });
  if (!gl) return null;
  /* no workshop, no pieces — the caller falls back to 2D, which is the
     same road a lost context takes */
  var Kit = workshop();
  if (!Kit) throw new Error("gfx3d: pieces3d.js has not loaded");
  var Move = motionKit();
  if (!Move) throw new Error("gfx3d: motion.js has not loaded");
  var computeNormals = Kit.kit.computeNormals;

  var R = {
    kind: "3d", skin: null, pal: null, orientation: 1,
    board: new Int8Array(128),
    hi: { selected: -1, legal: [], legalCapt: [], last: null, check: -1, hint: null },
    checkAt: -1,
    /* when the squares were last asked to open out, when a man was
       last touched, and when a move last landed — each a short moment
       of light that then holds still */
    hiAt: -1, selAt: -1, lastAt: -1,
    lines: [], net: [],
    anim: null, lost: false, dirty: true,
    /* the big moments: the men arriving at the start of a game, a king
       lying where it was mated, light under a capture, and the small
       ring every landing leaves */
    cascade: null, toppled: null, impacts: [], lands: []
  };

  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    R.lost = true;
    if (opts.onContextLost) opts.onContextLost();
  }, false);

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
    return p;
  }
  /* the lighting uniforms every lit program shares, looked up once and
     sent the same way to both, so the board and the men can never end
     up standing in two different rooms */
  function lightLocs(pr) {
    return {
      eye: gl.getUniformLocation(pr, "uEye"),
      keyDir: gl.getUniformLocation(pr, "uKeyDir"), keyCol: gl.getUniformLocation(pr, "uKeyCol"),
      fillDir: gl.getUniformLocation(pr, "uFillDir"), fillCol: gl.getUniformLocation(pr, "uFillCol"),
      sky: gl.getUniformLocation(pr, "uSky"), ground: gl.getUniformLocation(pr, "uGround"),
      exposure: gl.getUniformLocation(pr, "uExposure"), direct: gl.getUniformLocation(pr, "uDirect"),
      shadow: gl.getUniformLocation(pr, "uShadow"), lightVP: gl.getUniformLocation(pr, "uLightVP"),
      shadowOn: gl.getUniformLocation(pr, "uShadowOn"),
      shadowTexel: gl.getUniformLocation(pr, "uShadowTexel"),
      shadowSoft: gl.getUniformLocation(pr, "uShadowSoft"),
      pano: gl.getUniformLocation(pr, "uPano"), envTex: gl.getUniformLocation(pr, "uEnvTex"),
      cookie: gl.getUniformLocation(pr, "uCookie"),
      envOn: gl.getUniformLocation(pr, "uEnvOn"), envGain: gl.getUniformLocation(pr, "uEnvGain"),
      hot: gl.getUniformLocation(pr, "uHot"), tableLit: gl.getUniformLocation(pr, "uTableLit"),
      cookieAmt: gl.getUniformLocation(pr, "uCookieAmt"), cookieScale: gl.getUniformLocation(pr, "uCookieScale")
    };
  }

  var prog = program(VSH, FSH);
  var progTex = program(VSH_TEX, FSH_TEX);
  var progShadow = program(VSH_SHADOW, FSH_SHADOW);
  var U = {
    proj: gl.getUniformLocation(prog, "uProj"), view: gl.getUniformLocation(prog, "uView"),
    model: gl.getUniformLocation(prog, "uModel"), color: gl.getUniformLocation(prog, "uColor"),
    alpha: gl.getUniformLocation(prog, "uAlpha"),
    flat: gl.getUniformLocation(prog, "uFlat"), rough: gl.getUniformLocation(prog, "uRough"),
    metal: gl.getUniformLocation(prog, "uMetal"), rimAmt: gl.getUniformLocation(prog, "uRimAmt"),
    glow: gl.getUniformLocation(prog, "uGlow"), mirror: gl.getUniformLocation(prog, "uMirror"),
    sss: gl.getUniformLocation(prog, "uSss"), coat: gl.getUniformLocation(prog, "uCoat"),
    haloCol: gl.getUniformLocation(prog, "uHaloCol"), haloAmt: gl.getUniformLocation(prog, "uHaloAmt"),
    L: lightLocs(prog),
    aPos: gl.getAttribLocation(prog, "aPos"), aNrm: gl.getAttribLocation(prog, "aNrm"),
    aShade: gl.getAttribLocation(prog, "aShade")
  };
  var UT = {
    proj: gl.getUniformLocation(progTex, "uProj"), view: gl.getUniformLocation(progTex, "uView"),
    model: gl.getUniformLocation(progTex, "uModel"), tex: gl.getUniformLocation(progTex, "uTex"),
    nrmTex: gl.getUniformLocation(progTex, "uNrmTex"),
    gloss: gl.getUniformLocation(progTex, "uGloss"), bump: gl.getUniformLocation(progTex, "uBumpAmt"),
    contact: gl.getUniformLocation(progTex, "uContact"),
    L: lightLocs(progTex),
    aPos: gl.getAttribLocation(progTex, "aPos"), aUV: gl.getAttribLocation(progTex, "aUV")
  };
  var US = {
    lightVP: gl.getUniformLocation(progShadow, "uLightVP"),
    model: gl.getUniformLocation(progShadow, "uModel"),
    aPos: gl.getAttribLocation(progShadow, "aPos")
  };

  /* ---------- the post chain ----------
     The scene is drawn into a texture rather than onto the screen, and
     the last thing that happens to it is a tone map. That ordering is
     what buys everything else: a highlight is allowed to go brighter
     than white on the way through, the bloom has something to find when
     it does, and the roll-off at the top end means a pale king under a
     lamp keeps its shape instead of flaring into a white blob.

     Floating-point targets are an extension in WebGL 1 and some cards
     still say no. When that happens the scene target is a plain 8-bit
     one — the bloom has less to work with, and the grade happens in the
     surface shaders instead (uDirect) — and when even that fails the
     whole chain steps aside and the board draws straight to the screen.
     Fewer effects, never a broken picture. */
  var progBright = program(VSH_POST, FSH_BRIGHT);
  var progBlur = program(VSH_POST, FSH_BLUR);
  var progComp = program(VSH_POST, FSH_COMPOSITE);
  var UB = { tex: gl.getUniformLocation(progBright, "uTex"),
             threshold: gl.getUniformLocation(progBright, "uThreshold"),
             aPos: gl.getAttribLocation(progBright, "aPos") };
  var UL = { tex: gl.getUniformLocation(progBlur, "uTex"),
             dir: gl.getUniformLocation(progBlur, "uDir"),
             aPos: gl.getAttribLocation(progBlur, "aPos") };
  var UC = { scene: gl.getUniformLocation(progComp, "uScene"),
             bloom: gl.getUniformLocation(progComp, "uBloom"),
             bloomAmt: gl.getUniformLocation(progComp, "uBloomAmt"),
             bloom2: gl.getUniformLocation(progComp, "uBloom2"),
             bloomAmt2: gl.getUniformLocation(progComp, "uBloomAmt2"),
             vignette: gl.getUniformLocation(progComp, "uVignette"),
             grain: gl.getUniformLocation(progComp, "uGrain"),
             time: gl.getUniformLocation(progComp, "uTime"),
             aberration: gl.getUniformLocation(progComp, "uAberration"),
             aPos: gl.getAttribLocation(progComp, "aPos") };

  var progSky = program(VSH_POST, FSH_SKY);
  var UK = { top: gl.getUniformLocation(progSky, "uTop"),
             bottom: gl.getUniformLocation(progSky, "uBottom"),
             glowCol: gl.getUniformLocation(progSky, "uGlowCol"),
             glowAmt: gl.getUniformLocation(progSky, "uGlowAmt"),
             direct: gl.getUniformLocation(progSky, "uDirect"),
             aPos: gl.getAttribLocation(progSky, "aPos") };
  var progPano = program(VSH_POST, FSH_PANO);
  var UP = { pano: gl.getUniformLocation(progPano, "uPano"),
             invVP: gl.getUniformLocation(progPano, "uInvVP"),
             eye: gl.getUniformLocation(progPano, "uEye"),
             lift: gl.getUniformLocation(progPano, "uLift"),
             gain: gl.getUniformLocation(progPano, "uGain"),
             hot: gl.getUniformLocation(progPano, "uHot"),
             direct: gl.getUniformLocation(progPano, "uDirect"),
             aPos: gl.getAttribLocation(progPano, "aPos") };

  /* the board and the table are seen at a slant, and a slanted texture
     sampled the plain way smears its grain into streaks; anisotropic
     filtering is the fix, where the card has it */
  var extAniso = gl.getExtension("EXT_texture_filter_anisotropic") ||
                 gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
  var ANISO = extAniso ? Math.min(8, gl.getParameter(extAniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1) : 0;
  function aniso() { if (ANISO > 1) gl.texParameterf(gl.TEXTURE_2D, extAniso.TEXTURE_MAX_ANISOTROPY_EXT, ANISO); }
  var extHalf = gl.getExtension("OES_texture_half_float");
  var halfLinear = !!gl.getExtension("OES_texture_half_float_linear");
  var HDR_TYPE = (extHalf && halfLinear) ? extHalf.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;

  function makeTex(w, h, type, filter) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function freeTarget(t) {
    if (!t) return;
    if (t.fb) gl.deleteFramebuffer(t.fb);
    if (t.tex) gl.deleteTexture(t.tex);
    if (t.depth) gl.deleteRenderbuffer(t.depth);
  }
  function makeTarget(w, h, type, filter, wantDepth) {
    var t = { w: w, h: h, type: type };
    t.tex = makeTex(w, h, type, filter);
    t.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    if (wantDepth) {
      t.depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, t.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.depth);
    }
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (ok) return t;
    freeTarget(t);
    return null;
  }

  /* one big triangle, three vertices, no index buffer: it covers the
     screen with the corners falling outside it */
  var postTri = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, postTri);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  /* attribute slots are global state, not per-program: a leftover
     pointer into a 28-byte mesh would read off the end of a two-float
     buffer, so every pass says exactly which slots it wants */
  function onlyAttrib(loc) {
    for (var i = 0; i < 4; i++) if (i !== loc) gl.disableVertexAttribArray(i);
    gl.enableVertexAttribArray(loc);
  }
  function fullscreen(loc) {
    gl.bindBuffer(gl.ARRAY_BUFFER, postTri);
    onlyAttrib(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---------- how much of all this to actually run ----------
     The same three tiers the carving shop uses, named the same way, so
     a phone that gets a simpler set of men also gets a simpler room.
     Nothing here changes what the board means — only how much light it
     is drawn with. */
  var TIERS = {
    high:   { shadow: 1024, soft: true,  bloom: true,  wide: true,  grain: true,  aberration: true,  mirror: true,  bump: 1024 },
    medium: { shadow: 512,  soft: false, bloom: true,  wide: false, grain: true,  aberration: false, mirror: false, bump: 512 },
    low:    { shadow: 0,    soft: false, bloom: false, wide: false, grain: false, aberration: false, mirror: false, bump: 256 }
  };
  var quality = Kit.autoQuality();
  /* What the device looks able for — cores and screen, read before a
     single frame has been drawn. A good guess, and only a guess: a phone
     with eight cores and a hot battery can still drop to twenty frames a
     second the moment the shadows and the bloom go on. */
  function deviceFx() { return quality.segs < 30 ? "medium" : "high"; }
  var ORDER = ["low", "medium", "high"], STEP_KEY = "chess.fx.stepped";
  function remembered() {
    try { var s = root.sessionStorage && root.sessionStorage.getItem(STEP_KEY); return TIERS[s] ? s : null; }
    catch (e) { return null; }
  }
  /* what Auto runs: the device's tier, or lower if this session has
     already watched it struggle — never higher than either */
  function autoFx() {
    var d = deviceFx(), s = remembered();
    return s && ORDER.indexOf(s) < ORDER.indexOf(d) ? s : d;
  }
  /* An explicit choice (opts.fx from the Studio) always wins and is never
     second-guessed; only Auto is watched. */
  var fxMode = TIERS[opts.fx] ? "chosen" : "auto";
  var fxName = fxMode === "chosen" ? opts.fx : autoFx();
  var FX = TIERS[fxName];

  /* ---------- watching the frame rate, once ----------
     The first few times something moves — the men arriving, a move, the
     camera easing round — the gap between one frame and the next is
     written down. Once there is a fair sample (enough frames, over more
     than one animation, so a single hiccup cannot convict a phone), the
     slowest quarter is looked at: if three frames in four took longer
     than 40 ms (under 25 a second, where a slide starts to judder) the
     room steps one tier down, between moves, and remembers it for the
     rest of the session. It never steps back up by itself: a device that
     was slow a minute ago will be slow again the moment it warms up, and
     a board that flips between looks is worse than either look. A device
     that keeps up is left alone and no longer watched at all. */
  var FRAME_SLOW = 40, SAMPLE_MIN = 45, RUNS_MIN = 2;
  var perf = { on: fxMode === "auto" && fxName !== "low", gaps: [], runs: 0, last: 0 };
  function sampleFrame(now, busy) {
    if (!perf.on) return;
    if (!busy) { perf.last = 0; return; }          /* a single redraw is not a frame rate */
    if (perf.last) {
      var g = now - perf.last;
      /* two calls in one tick, or a tab that was hidden, say nothing
         about how fast this device draws */
      if (g > 4 && g < 500 && perf.gaps.length < 600) perf.gaps.push(g);
    } else perf.runs++;
    perf.last = now;
  }
  function sampleEnd() {
    perf.last = 0;
    if (!perf.on || perf.gaps.length < SAMPLE_MIN || perf.runs < RUNS_MIN) return;
    var g = perf.gaps.slice().sort(function (x, y) { return x - y; });
    var p75 = g[Math.floor(g.length * 0.75)];
    perf.gaps = []; perf.runs = 0;
    var i = ORDER.indexOf(fxName);
    if (p75 <= FRAME_SLOW || i <= 0) { perf.on = false; return; }
    var next = ORDER[i - 1];
    try { if (root.sessionStorage) root.sessionStorage.setItem(STEP_KEY, next); } catch (e) {}
    applyFx(next);
    /* the new tier gets a fair sample of its own before it can step again */
    perf.on = next !== "low";
  }

  var scene = null, bloomA = null, bloomB = null, bloomC = null, bloomD = null;
  var postOk = false, bloomOk = false, wideOk = false;
  /* A card that cannot give us an off-screen target will not change its
     mind, and retrying every frame would cost more than the chain ever
     saved. One failure is remembered and the renderer carries on
     drawing straight to the screen. */
  var postDead = false;
  function sizeTargets() {
    var w = canvas.width, h = canvas.height;
    if (!w || !h || postDead) return;
    if (scene && scene.w === w && scene.h === h) return;
    freeTarget(scene); freeTarget(bloomA); freeTarget(bloomB); freeTarget(bloomC); freeTarget(bloomD);
    scene = bloomA = bloomB = bloomC = bloomD = null;
    scene = makeTarget(w, h, HDR_TYPE, gl.LINEAR, true);
    if (!scene && HDR_TYPE !== gl.UNSIGNED_BYTE) scene = makeTarget(w, h, gl.UNSIGNED_BYTE, gl.LINEAR, true);
    postOk = !!scene;
    if (!postOk) postDead = true;
    bloomOk = false;
    if (postOk && FX.bloom) {
      var bw = Math.max(4, w >> 2), bh = Math.max(4, h >> 2);
      bloomA = makeTarget(bw, bh, scene.type, gl.LINEAR, false);
      bloomB = bloomA ? makeTarget(bw, bh, scene.type, gl.LINEAR, false) : null;
      bloomOk = !!bloomB;
    }
    wideOk = false;
    if (bloomOk && FX.wide) {
      var cw = Math.max(4, w >> 3), ch = Math.max(4, h >> 3);
      bloomC = makeTarget(cw, ch, scene.type, gl.LINEAR, false);
      bloomD = bloomC ? makeTarget(cw, ch, scene.type, gl.LINEAR, false) : null;
      wideOk = !!bloomD;
    }
  }

  /* the shadow map. Packed depth has to be read with NEAREST — the
     four bytes of a packed float mean nothing halfway between two
     texels — so the softening is the nine-tap filter in the shader
     rather than anything the sampler does. */
  var shadowT = null, shadowSize = 0;
  function sizeShadow() {
    var want = FX.shadow;
    if (shadowSize === want) return;
    freeTarget(shadowT); shadowT = null; shadowSize = 0;
    if (!want) return;
    shadowT = makeTarget(want, want, gl.UNSIGNED_BYTE, gl.NEAREST, true);
    shadowSize = shadowT ? want : 0;
  }
  sizeShadow();
  /* something valid to leave in the shadow slot when there is no map:
     a sampler with nothing bound is undefined behaviour even when the
     shader never reaches it */
  var blankTex = (function () {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                  new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  })();

  /* the light's own camera: far enough away that a box sees the board
     as well as a cone would, and sized to hold the whole frame plus the
     tallest king's worth of shadow leaning off the edge */
  function lightFrom(dir) {
    var at = [0, 0.15, 0];
    var eye = [dir[0]*18, dir[1]*18, dir[2]*18];
    return mMul(mOrtho(7.2, 1, 40), mLookAt(eye, at, [0, 1, 0]));
  }
  /* it moves when the place does: the sun in the park and the lamp in
     the library hang in different parts of the sky */
  var lightVP = lightFrom(KEY_DIR);

  /* mesh upload: interleave pos + normal + baked shade (7 floats, 28
     bytes). Board furniture has no baked shade, so it uploads as 1. */
  function uploadRaw(pos, nrm, shade, idx) {
    var n = pos.length / 3, inter = new Float32Array(n * 7), i, v;
    for (i = 0, v = 0; i < pos.length; i += 3, v += 7) {
      inter[v] = pos[i]; inter[v+1] = pos[i+1]; inter[v+2] = pos[i+2];
      inter[v+3] = nrm[i]; inter[v+4] = nrm[i+1]; inter[v+5] = nrm[i+2];
      inter[v+6] = shade ? shade[i / 3] : 1;
    }
    var vb = gl.createBuffer(), ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
      idx.BYTES_PER_ELEMENT ? idx : new Uint16Array(idx), gl.STATIC_DRAW);
    return { vb: vb, ib: ib, n: idx.length };
  }
  function upload(geo) {
    return uploadRaw(geo.pos, computeNormals(geo.pos, geo.idx), null, geo.idx);
  }

  /* ---------- the men ----------
     A set is carved once, uploaded once, and drawn with exactly the same
     number of calls as the old one-lathe-per-piece set: everything a
     piece is made of is welded into a single mesh before it gets here.
     Swapping sets frees the old buffers so a curious player can try all
     of them without the card filling up. */
  var PIECES = null;      /* { 1..6: {mesh, radius, height, lie, girth} } */
  /* A man as a tap sees him: a stack of short upright cylinders, one per
     band of his height, each as wide as the widest part of the mesh in
     that band. A single cylinder 0.36 wide all the way up is the right
     size for a pawn's foot and twice the size of a king's cross, and the
     difference is the square behind him you could see and could not
     tap. Each band is padded a little for a fingertip and kept between
     a fifth and four tenths of a square, so a thin finial is still
     something to aim at and nothing reaches into the next square. */
  var GIRTH_BANDS = 8;
  function girthOf(pos, height) {
    var h = height > 0 ? height : 1, r = [], i, b, top = 0, wide = 0;
    for (b = 0; b < GIRTH_BANDS; b++) r.push(0);
    for (i = 0; i < pos.length; i += 3) {
      b = Math.floor(pos[i + 1] / h * GIRTH_BANDS);
      if (b < 0) b = 0; else if (b >= GIRTH_BANDS) b = GIRTH_BANDS - 1;
      var d = Math.sqrt(pos[i] * pos[i] + pos[i + 2] * pos[i + 2]);
      if (d > r[b]) r[b] = d;
      if (d > wide) wide = d;
      if (pos[i + 1] > top) top = pos[i + 1];
    }
    for (b = 0; b < GIRTH_BANDS; b++) r[b] = Math.max(0.2, Math.min(0.4, r[b] + 0.05));
    /* and the plain can he fits in, unpadded, for deciding whether the
       ray is worth trying against his triangles at all */
    return { h: h, r: r, can: { h: Math.max(h, top) + 1e-3, r: [wide + 1e-3] } };
  }
  var setId = null, setFaces = "", setName = "";
  function freePieces() {
    if (!PIECES) return;
    for (var k = 1; k <= 6; k++) {
      if (!PIECES[k]) continue;
      gl.deleteBuffer(PIECES[k].mesh.vb);
      gl.deleteBuffer(PIECES[k].mesh.ib);
    }
    PIECES = null;
  }
  function loadPieces(id) {
    if (setId === id && PIECES) return;
    var built;
    try { built = Kit.build(id, quality); }
    catch (e) {
      if (id === Kit.DEFAULT_ID) throw e;
      built = Kit.build(Kit.DEFAULT_ID, quality);   /* a bad set is never fatal */
    }
    freePieces();
    PIECES = {};
    for (var k = 1; k <= 6; k++) {
      var m = built.pieces[k];
      PIECES[k] = { mesh: uploadRaw(m.pos, m.nrm, m.shade, m.idx),
                    radius: m.radius, height: m.height,
                    /* how this set's man lies when he is laid down, measured
                       once off the mesh rather than guessed per frame */
                    lie: Move.lieOf(m.pos, m.radius),
                    /* and how much of the picture he takes up, for a tap:
                       his rough outline, and the triangles themselves */
                    girth: girthOf(m.pos, m.height), pos: m.pos, idx: m.idx };
    }
    setId = built.id;
    setFaces = built.faces || "";
    setName = built.name;
  }
  loadPieces(Kit.DEFAULT_ID);
  var FACE_LETTER = { 1: "p", 2: "n", 3: "b", 4: "r", 5: "q", 6: "k" };

  var MESH_DISC = upload(disc(36));
  var MESH_RING = upload(ring(40, 0.82));
  var MESH_QUAD = upload(quadXZ());
  var softD = softDisc(36, 5), softR = softRing(40, 0.58);
  var MESH_SOFT = uploadRaw(softD.pos, softD.nrm, softD.shade, softD.idx);
  var MESH_SOFTRING = uploadRaw(softR.pos, softR.nrm, softR.shade, softR.idx);

  /* rim: a shallow box under the board, drawn with the lit shader */
  var rimGeo = (function () {
    var w = HALF, h = RIM_DEPTH, pos = [], idx = [];
    var pts = [[-w,-w],[w,-w],[w,w],[-w,w]];
    for (var i = 0; i < 4; i++) {
      var a = pts[i], b = pts[(i+1)%4];
      var s = pos.length / 3;
      pos.push(a[0], 0.0, a[1],  b[0], 0.0, b[1],  b[0], -h, b[1],  a[0], -h, a[1]);
      idx.push(s, s+1, s+2, s, s+2, s+3);
    }
    var s2 = pos.length / 3;   /* bottom cap */
    pos.push(-w,-h,-w, w,-h,-w, w,-h,w, -w,-h,w);
    idx.push(s2, s2+2, s2+1, s2, s2+3, s2+2);
    /* top margin lip: thin ring around the texture quad */
    return { pos: pos, idx: idx };
  })();
  var MESH_RIM = upload(rimGeo);

  /* board texture quad: the squares and the painted frame round them */
  var texQuad = (function () {
    var s = HALF;
    var vb = gl.createBuffer(), ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -s, 0, -s, 0, 0,   s, 0, -s, 1, 0,   s, 0, s, 1, 1,   -s, 0, s, 0, 1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 2, 1, 0, 3, 2]), gl.STATIC_DRAW);
    return { vb: vb, ib: ib, n: 6 };
  })();

  var boardTex = gl.createTexture();
  var boardNrm = gl.createTexture();
  function loadBoardTex() {
    if (!R.pal) return;          /* nothing to paint until a skin arrives */
    gl.bindTexture(gl.TEXTURE_2D, boardTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, boardTexture(R.pal));
    aniso();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    /* the relief, from the same recipe. Sobel over a megapixel is a few
       tens of milliseconds, which is fine once per skin change and
       would not be fine once per frame — hence a texture. */
    var nm = normalMapFrom(heightCanvas(R.pal, FX.bump), 1.5);
    gl.bindTexture(gl.TEXTURE_2D, boardNrm);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nm.size, nm.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, nm.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
  }
  loadBoardTex();

  /* ---------- the place ----------
     A scene from scenes.js, made into what the card needs: the panorama
     and its blurred copy (repeating round the horizon, so the seam
     behind Black's chair is not a seam), the leaf or window cookie, the
     table's paint and its relief, and the table itself as two meshes —
     the top the board stands on, and the edge you see round it. The
     Studio is the absence of all of this, and draws as it always did. */
  var place = { id: "studio", built: null, ready: false, cookie: false, top: null, edge: null, half: 0 };
  var panoTex = gl.createTexture(), envTex = gl.createTexture(), cookieTex = gl.createTexture();
  var tableTex = gl.createTexture(), tableNrm = gl.createTexture();
  function fill(t, src, repeatS, repeatT, mip) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (src.data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, src.size, src.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeatS ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeatT ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    if (mip) { aniso(); gl.generateMipmap(gl.TEXTURE_2D); }
  }
  function freeMesh(m) { if (m) { gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); } }
  /* the outline of the table top, anticlockwise from above: a circle, or
     a square with its corners rounded off the way a joiner would */
  function tableOutline(t) {
    var pts = [], i;
    if (t.shape === "round") {
      for (i = 0; i < 96; i++) {
        var a = -i / 96 * Math.PI * 2;
        pts.push([Math.cos(a) * t.half, Math.sin(a) * t.half]);
      }
      return pts;
    }
    var rc = Math.min(0.9, t.half * 0.12), h = t.half - rc;
    /* each corner's arc runs from the edge before it to the edge after
       it, the same way round as the outline */
    var corners = [[h, -h, 0], [-h, -h, -Math.PI / 2], [-h, h, Math.PI], [h, h, Math.PI / 2]];
    for (var c = 0; c < 4; c++) {
      for (i = 0; i <= 8; i++) {
        var b = corners[c][2] - i / 8 * Math.PI / 2;
        pts.push([corners[c][0] + Math.cos(b) * rc, corners[c][1] + Math.sin(b) * rc]);
      }
    }
    return pts;
  }
  function buildTable(t) {
    var y = -RIM_DEPTH, pts = tableOutline(t), n = pts.length, i;
    /* the top: a fan from the middle, as position + texture coordinate,
       the same layout the board's own quad uses so the same program
       draws both */
    var top = [0, y, 0, 0.5, 0.5], idx = [];
    for (i = 0; i < n; i++) {
      top.push(pts[i][0], y, pts[i][1], pts[i][0] / t.half * 0.5 + 0.5, pts[i][1] / t.half * 0.5 + 0.5);
      idx.push(0, 1 + i, 1 + (i + 1) % n);
    }
    var vb = gl.createBuffer(), ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(top), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    place.top = { vb: vb, ib: ib, n: idx.length };
    /* the edge: a band round the outline, each column's normal pointing
       straight out from the middle of its two neighbours, so a round
       table's edge is smooth and a square one's corners are */
    var pos = [], nrm = [], eidx = [];
    for (i = 0; i <= n; i++) {
      var p = pts[i % n], pr = pts[(i + n - 1) % n], nx = pts[(i + 1) % n];
      var tx = nx[0] - pr[0], tz = nx[1] - pr[1], l = Math.hypot(tx, tz) || 1;
      var ox = tz / l, oz = -tx / l;
      if (ox * p[0] + oz * p[1] < 0) { ox = -ox; oz = -oz; }
      pos.push(p[0], y, p[1], p[0], y - t.thick, p[1]);
      nrm.push(ox, 0.25, oz, ox, -0.2, oz);
      if (i) { var b = (i - 1) * 2; eidx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    place.edge = uploadRaw(pos, nrm, null, eidx);
    place.half = t.half;
  }
  function loadPlace(id) {
    var S = root.Scenes, b = null;
    try { b = S ? S.build(id) : null; } catch (e) { b = null; }
    freeMesh(place.top); freeMesh(place.edge);
    place.top = place.edge = null;
    place.ready = false; place.cookie = false;
    place.built = b;
    place.id = b && b.def ? b.def.id : "studio";
    if (!b || !b.def.table || !b.pano) return;
    fill(panoTex, b.pano, true, false, false);
    fill(envTex, b.env, true, false, false);
    if (b.cookie) { fill(cookieTex, b.cookie, true, true, false); place.cookie = true; }
    if (b.table) {
      fill(tableTex, b.table.color, false, false, true);
      /* the relief at the same size the board's is cut at, so a phone
         that gets a lighter board gets a lighter table too */
      var hc = b.table.height, size = FX.bump;
      if (hc.width !== size && typeof document !== "undefined") {
        var small = document.createElement("canvas");
        small.width = small.height = size;
        small.getContext("2d").drawImage(hc, 0, 0, size, size);
        hc = small;
      }
      fill(tableNrm, normalMapFrom(hc, 1.6), false, false, true);
    }
    buildTable(b.def.table);
    place.ready = true;
  }
  /* until a place is chosen, the slots hold something valid */
  [panoTex, envTex, cookieTex].forEach(function (t) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  });
  loadPlace(opts.scene || "studio");

  /* ---------- camera: an orbit on springs ----------
     The player owns a yaw, a pitch and a zoom; the canvas owns the rest.
     Every frame the camera is fitted to the shape it is drawing into, so
     a phone held upright and a laptop held open both get the whole board
     as large as it will go, with nothing under the player bars. */
  var PITCH_HOME = 0.98, DIST_HOME = 12.6;
  /* Below about 0.55 the board turns edge-on: the far ranks crush into a
     sliver and the men hide each other, and nothing ever brought it back
     up. That is the floor now, and Flip and a new game both ease home. */
  var PITCH_MIN = 0.55, PITCH_MAX = 1.35;
  /* A portrait screen has height to spare and no width to spare, so the
     board is stood up to meet it: a steeper look (the far ranks open out
     instead of being foreshortened into a strip) through a longer lens
     (less perspective, so the far rank is nearly the size of the near
     one). Both ease in with how tall the canvas is, from nothing at 1.3:1
     wide to all of it at 3:4 or narrower. */
  var FOV_WIDE = 0.72, FOV_TALL = 0.50, PITCH_TALL = 0.22, PITCH_CEIL = 1.45;
  /* How much of the width the board may take, frame and all: the
     squares come to about nine tenths of it, and the wood stops a few
     pixels short of the glass on a phone (the drawn board keeps the
     same margin). And the strips at the top and bottom of the canvas the
     player bars sit in, in css px. */
  var FILL = 0.97;
  var insets = { top: 48, bottom: 48 };
  var cam = {
    yaw: Math.PI / 2, pitch: PITCH_HOME, dist: DIST_HOME,
    tYaw: Math.PI / 2, tPitch: PITCH_HOME, tDist: DIST_HOME,
    eye: [0, 0, 0], look: [0, 0, 0], fov: FOV_WIDE,
    /* The cinematic push-in, kept as a layer on top of the player's own
       orbit rather than written into it: `amt` springs between 0 (the
       view they chose) and 1 (closer, a little lower, the square in the
       middle of the frame). Because it never touches yaw, pitch or
       distance, orbit and pinch keep working through it, and easing it
       back to 0 returns them to exactly the view they left. */
    focus: { amt: 0, vel: 0, target: 0, x: 0, z: 0, vx: 0, vz: 0, tx: 0, tz: 0, last: 0 }
  };
  var camPlaced = false, vp = mIdent(), invVP = mIdent();

  /* 0 on a landscape canvas, 1 on a portrait one, eased between */
  function tallness(aspect) { return Math.max(0, Math.min(1, (1.3 - aspect) / 0.55)); }
  /* the strip between the player bars, in clip space (+1 is the top).
     The bars never take more than three tenths of the height between
     them, so a short canvas (the Studio drawer open on a phone) still
     gets a board rather than a postage stamp. */
  function bandOf(hPx) {
    var t = insets.top + 4, b = insets.bottom + 4, room = hPx * 0.3;
    if (t + b > room) { var k = room / (t + b); t *= k; b *= k; }
    return { top: 1 - 2 * t / hPx, bottom: -1 + 2 * b / hPx };
  }
  /* What has to be seen, relative to the middle of the board as the
     camera sees it from the white side: the four corners of the frame,
     the dark edge of the rim along the near side, and the crowns of the
     far rank, which stand up past the far edge of the wood. Black's view
     is the mirror image, so one list does for both. */
  function fitPoints() {
    var crown = 0;
    if (PIECES) for (var k = 1; k <= 6; k++) if (PIECES[k]) crown = Math.max(crown, PIECES[k].height);
    if (!(crown > 0)) crown = 1.3;
    return [[-HALF, 0, -HALF], [HALF, 0, -HALF], [-HALF, 0, HALF], [HALF, 0, HALF],
            [-HALF, -RIM_DEPTH, HALF], [HALF, -RIM_DEPTH, HALF],
            [-3.5, crown, -3.5], [3.5, crown, -3.5], [0, crown, -3.5]];
  }
  /* those points through a camera `d` back at `pitch`, as clip-space
     extents: the widest |x|, and the lowest and highest y */
  function extents(pts, d, pitch, tanX, tanY) {
    var c = Math.cos(pitch), s = Math.sin(pitch), out = { x: 0, lo: 9, hi: -9, ok: true };
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], depth = d - (p[1] * s + p[2] * c);
      if (depth < 0.25) { out.ok = false; continue; }
      var x = Math.abs(p[0]) / (depth * tanX), y = (p[1] * c - p[2] * s) / (depth * tanY);
      if (x > out.x) out.x = x;
      if (y < out.lo) out.lo = y;
      if (y > out.hi) out.hi = y;
    }
    return out;
  }
  /* The distance at which the board just fits: as wide as FILL of the
     canvas, or as tall as the strip between the bars, whichever comes
     first. Halving rather than a formula, because perspective makes the
     near edge and the far crowns shrink at different rates and the
     answer is wherever the last of them comes inside — thirty steps is a
     millionth of a unit, and costs less than drawing one pawn. Kept
     until the canvas, the pitch, the lens or the set changes. */
  var fitMemo = { key: "", d: DIST_HOME };
  function fitDistance(pts, pitch, tanX, tanY, band) {
    var key = [pitch.toFixed(5), tanX.toFixed(5), tanY.toFixed(5), band.top.toFixed(4), band.bottom.toFixed(4),
               pts[6][1].toFixed(3)].join("|");
    if (fitMemo.key === key) return fitMemo.d;
    var lo = 1, hi = 400, room = band.top - band.bottom;
    for (var i = 0; i < 30; i++) {
      var d = (lo + hi) / 2, e = extents(pts, d, pitch, tanX, tanY);
      if (e.ok && e.x <= FILL && e.hi - e.lo <= room) hi = d; else lo = d;
    }
    fitMemo.key = key; fitMemo.d = hi;
    return hi;
  }

  /* where the camera stands and what it looks at, from the orbit and the
     push-in together. Called once a frame, and by squareToScreen and
     screenToSquare if they are asked before the first frame has drawn. */
  function placeCamera() {
    var aspect = canvas.width / Math.max(1, canvas.height);
    var hPx = canvas.clientHeight || canvas.height || 1;
    var tall = tallness(aspect);
    var fov = FOV_WIDE + (FOV_TALL - FOV_WIDE) * tall;
    var tanY = Math.tan(fov / 2), tanX = tanY * aspect;
    var pitch = Math.min(PITCH_CEIL, cam.pitch + PITCH_TALL * tall);
    var band = bandOf(hPx), pts = fitPoints();
    /* the player's zoom is a ratio of the fitted distance, so pinching
       means the same thing on every screen */
    var dist = fitDistance(pts, pitch, tanX, tanY, band) * (cam.dist / DIST_HOME);
    /* The lens is shifted rather than the camera turned: the board's
       picture slides up or down until it sits in the middle of the strip
       between the bars, without the perspective changing at all. Worked
       out from the white side whatever the yaw, so orbiting turns the
       board in place rather than sliding it about the screen. The push-in
       hands the middle of the frame to its square instead. */
    var e = extents(pts, dist, pitch, tanX, tanY);
    var fo = cam.focus, f = fo.amt;
    var shift = (1 - f) * ((band.top + band.bottom) / 2 - (e.lo + e.hi) / 2);
    dist *= 1 - 0.27 * f;
    pitch = Math.max(0.30, pitch - 0.09 * f);
    var ex = Math.cos(cam.yaw) * Math.cos(pitch) * dist;
    var ey = Math.sin(pitch) * dist;
    var ez = Math.sin(cam.yaw) * Math.cos(pitch) * dist;
    /* eye and target travel together toward the square, so the camera
       trucks in rather than swinging round to stare at it */
    var k = 0.94 * f;
    var sx = fo.x * k, sy = 0.30 * k, sz = fo.z * k;
    cam.eye = [ex + sx, ey + sy, ez + sz];
    cam.look = [sx, sy, sz];
    cam.fov = fov;
    cam.lookPitch = pitch;
    /* The near plane follows the camera out. A long lens stands well
       back, and a near plane left at half a unit would spend nearly all
       of a 16-bit depth buffer on empty air in front of the board — the
       markers a few hundredths above the wood would start to flicker
       through it. Nothing in the room is nearer than the board's corner
       plus a king, about seven units in from the target. */
    var near = Math.max(0.5, (dist - 7.5) * 0.8);
    proj = mPersp(fov, aspect, near, dist + 14);
    proj[9] = -shift;
    view = mLookAt(cam.eye, cam.look, [0, 1, 0]);
    vp = mMul(proj, view);
    invVP = mInvert(vp) || invVP;
    camPlaced = true;
  }
  /* Whatever the camera's tilt and lens shift, the top edge of the
     picture is made to land a little above the horizon — the treetops,
     the top of the café window — so every screen gets the same strip of
     place above the table rather than a phone getting the clouds and a
     laptop the lawn. */
  function backdropLift() {
    var LIFT_TOP = (R.pal && R.pal.lift) || 0.13;
    var a = mul4(invVP, [0, 1, -1, 1]), b = mul4(invVP, [0, 1, 1, 1]);
    var dx = b[0] / b[3] - a[0] / a[3], dy = b[1] / b[3] - a[1] / a[3], dz = b[2] / b[3] - a[2] / a[3];
    var el = Math.asin(Math.max(-1, Math.min(1, dy / (Math.hypot(dx, dy, dz) || 1))));
    return Math.max(0, LIFT_TOP - el);
  }
  function mul4(m, v) {
    return [m[0]*v[0] + m[4]*v[1] + m[8]*v[2] + m[12]*v[3], m[1]*v[0] + m[5]*v[1] + m[9]*v[2] + m[13]*v[3],
            m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14]*v[3], m[3]*v[0] + m[7]*v[1] + m[11]*v[2] + m[15]*v[3]];
  }
  R.orbit = function (dx, dy) {
    cam.tYaw -= dx * 0.008;
    cam.tPitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, cam.tPitch + dy * 0.006));
    R.dirty = true;
  };
  R.zoom = function (f) {
    cam.tDist = Math.min(17, Math.max(6.5, cam.tDist * f));
    R.dirty = true;
  };
  /* home for a side: the yaw that puts it at the bottom, taken the short
     way round from wherever a long orbit has wound the camera to, so a
     flip after a few laps of the board is half a turn and not three */
  function homeYaw(color) {
    var base = color === 1 ? Math.PI / 2 : -Math.PI / 2, turn = Math.PI * 2;
    return base + turn * Math.round((cam.tYaw - base) / turn);
  }
  /* Flip turns the board and brings the camera home with it: a flip is
     "show me this from the other side", and the other side seen from a
     tilt and a zoom somebody left an hour ago is not what was asked for. */
  R.setOrientation = function (color) {
    R.orientation = color;
    cam.tYaw = homeYaw(color);
    cam.tPitch = PITCH_HOME; cam.tDist = DIST_HOME;
    R.dirty = true;
  };
  R.resetView = function () {
    cam.tPitch = PITCH_HOME; cam.tDist = DIST_HOME;
    cam.tYaw = homeYaw(R.orientation);
    R.focus(null);
    R.dirty = true;
  };
  /* The strips at the top and bottom of the canvas that the player bars
     take, in css pixels (48 each unless told otherwise). The board is
     fitted between them; pass 0s when the bars are hidden, as they are in
     a lesson, and the board takes the room back. */
  R.setInsets = function (top, bottom) {
    insets.top = Math.max(0, +top || 0);
    insets.bottom = Math.max(0, +(bottom == null ? top : bottom) || 0);
    camPlaced = false;
    R.dirty = true;
  };
  /* Lean the camera in toward a square — the push-in on a mate — or,
     with null, ease back out to the player's own view. Springs, never
     snaps; under reduced motion it does nothing at all, because a
     camera that moves on its own is exactly what that setting is for. */
  R.focus = function (sq, opts) {
    var fo = cam.focus;
    if (sq == null || sq < 0 || !onSq(sq) || REDUCED) {
      if (fo.target !== 0) { fo.target = 0; fo.last = 0; R.dirty = true; }
      return;
    }
    fo.tx = sqX(sq); fo.tz = sqZ(sq);
    /* from rest the square is simply where it is; mid-push it is
       sprung toward, like everything else the camera does */
    if (fo.amt < 1e-3) { fo.x = fo.tx; fo.z = fo.tz; fo.vx = fo.vz = 0; }
    var amount = opts && opts.amount != null ? opts.amount : 1;
    fo.target = Math.max(0, Math.min(1, amount));
    fo.last = 0;
    R.dirty = true;
  };
  /* one step of the push-in's springs; true while it is still moving */
  function stepFocus(nowMs) {
    var fo = cam.focus;
    if (fo.amt === fo.target && fo.vel === 0 && fo.x === fo.tx && fo.z === fo.tz) return false;
    /* the spring is stepped exactly, so a long frame is safe to take whole:
       a slow device still arrives in the same wall-clock time */
    var ts = nowMs / 1000, dt = fo.last ? Math.min(0.25, ts - fo.last) : 1 / 60;
    fo.last = ts;
    var a = Move.spring(fo.amt, fo.vel, fo.target, dt, 4.2);
    var x = Move.spring(fo.x, fo.vx, fo.tx, dt, 4.2);
    var z = Move.spring(fo.z, fo.vz, fo.tz, dt, 4.2);
    fo.amt = a.x; fo.vel = a.v; fo.x = x.x; fo.vx = x.v; fo.z = z.x; fo.vz = z.v;
    if (Move.springAtRest(fo.amt, fo.vel, fo.target) && Move.springAtRest(fo.x, fo.vx, fo.tx) &&
        Move.springAtRest(fo.z, fo.vz, fo.tz)) {
      fo.amt = fo.target; fo.vel = 0; fo.x = fo.tx; fo.z = fo.tz; fo.vx = fo.vz = 0; fo.last = 0;
      R.dirty = true;                    /* one more frame, at exactly where it came to rest */
      return false;
    }
    return true;
  }

  function fileOf(sq) { return sq & 7; }
  function rankOf(sq) { return sq >> 4; }
  function onSq(sq) { return (sq & 0x88) === 0; }
  function sqX(sq) { return fileOf(sq) - 3.5; }
  function sqZ(sq) { return 3.5 - rankOf(sq); }

  var proj = mIdent(), view = mIdent();

  /* The stage can change size without the window changing (starting a
     game puts a cost under the Hint button and takes eleven pixels off
     it), and the app only resizes on a window resize: the old drawing
     buffer was stretched to the new box, a squashed board under a
     camera fitted to the wrong shape. So a frame checks its box first. */
  var seenW = 0, seenH = 0;
  function refit() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h && (w !== seenW || h !== seenH)) R.resize();
  }
  R.resize = function () {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    seenW = w; seenH = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    sizeTargets();
    /* the old projection is for the old shape: anything that asks where
       a square is before the next frame gets the new answer */
    camPlaced = false;
    R.dirty = true;
  };
  /* the effects tier, for a settings switch or a weak-looking frame
     rate. Changing it rebuilds the targets and recuts the relief, so it
     is a thing you do between moves, not every frame. */
  R.fx = function () { return fxName; };
  R.autoFx = autoFx;
  /* why this tier, in a word the Studio can put in a sentence: "device"
     (Auto, from what the device looked able for), "frame rate" (Auto,
     stepped down after watching it draw) or "chosen" (somebody picked it) */
  R.fxReason = function () {
    if (fxMode === "chosen") return "chosen";
    return ORDER.indexOf(fxName) < ORDER.indexOf(deviceFx()) ? "frame rate" : "device";
  };
  function applyFx(name) {
    if (!TIERS[name] || name === fxName) return;
    fxName = name; FX = TIERS[name];
    freeTarget(scene); freeTarget(bloomA); freeTarget(bloomB); freeTarget(bloomC); freeTarget(bloomD);
    scene = bloomA = bloomB = bloomC = bloomD = null;
    sizeShadow(); sizeTargets(); loadBoardTex();
    R.dirty = true;
  }
  /* setFx("high" | "medium" | "low") is a choice and is kept; setFx("auto")
     hands it back to the device and the frame rate */
  R.setFx = function (name) {
    if (name === "auto") {
      fxMode = "auto";
      applyFx(autoFx());
      perf.on = fxName !== "low"; perf.gaps = []; perf.runs = 0; perf.last = 0;
      R.dirty = true;
      return;
    }
    if (!TIERS[name]) return;
    fxMode = "chosen";
    perf.on = false;
    applyFx(name);
  };

  R.setLines = function (list) { R.lines = list || []; R.dirty = true; };
  R.setNet = function (squares) { R.net = squares || []; R.dirty = true; };

  R.setSkin = function (skin) {
    R.skin = skin;
    R.pal = derive(skin, place.ready ? place.built : null);
    lightVP = lightFrom(R.pal.keyDir);
    /* the carved set travels with the skin, so a look someone sent you
       arrives with its men as well as its colours */
    loadPieces((skin.pieces && skin.pieces.set) || Kit.DEFAULT_ID);
    loadBoardTex();
    R.dirty = true;
  };
  /* where the board is: a scene id from scenes.js ("park", "cafe", …)
     or "studio" for the board on its own. Painting a place the first
     time takes a moment, so it is a thing you choose rather than
     something that changes under a move. */
  R.setScene = function (id) {
    if (id === place.id && (place.ready || id === "studio")) return;
    loadPlace(id);
    if (R.skin) {
      R.pal = derive(R.skin, place.ready ? place.built : null);
      lightVP = lightFrom(R.pal.keyDir);
    }
    R.dirty = true;
  };
  R.scene = function () { return place.ready ? place.id : "studio"; };
  /* the board as it is painted before the light touches it, for the
     checks: the squares' colour and their relief, as canvases */
  R.boardPaint = function () {
    return R.pal ? { colour: boardTexture(R.pal), height: heightCanvas(R.pal, FX.bump) } : null;
  };
  /* which set is actually on the board — not always the one the skin
     asked for, if that skin named a set this browser doesn't have */
  R.pieceSet = function () { return { id: setId, name: setName }; };
  /* how tall the man on a square stands, in squares (0 for an empty
     square) — so something aiming at his head, rather than his feet,
     can ask squareToScreen(sq, heightOf(sq) * 0.8) */
  R.heightOf = function (sq) {
    if (sq == null || sq < 0 || !onSq(sq)) return 0;
    var p = (R.anim ? R.anim.after : R.board)[sq], P = p && PIECES && PIECES[Math.abs(p)];
    return P ? P.height : 0;
  };
  R.setPosition = function (board, o) {
    R.board.set(board);
    R.anim = null;
    settling = null;
    R.toppled = null;
    R.cascade = null;
    R.lands.length = 0;
    R.lastAt = -1;
    if (o && o.flourish) {
      /* a new game starts from the player's own view, whatever the last
         one ended on */
      R.focus(null);
      if (!REDUCED) {
        var plan = Move.cascade(R.board, { orientation: R.orientation });
        var delay = {};
        for (var i = 0; i < plan.length; i++) delay[plan[i].sq] = plan[i].delay;
        R.cascade = { t0: performance.now(), plan: plan, delay: delay, end: Move.cascadeEnd(plan), rung: {} };
      }
    }
    R.dirty = true;
  };
  /* the landings of the arrival just started, as [{sq, t, piece, wave}]
     with t in ms from the setPosition call — so a sound can be put on
     each one. Empty when there is no arrival (reduced motion, or a
     position set without a flourish). */
  R.flourishPlan = function () {
    if (!R.cascade) return [];
    return R.cascade.plan.map(function (p) { return { sq: p.sq, t: p.t, piece: p.piece, wave: p.wave }; });
  };

  /* The mated king, laid down: it rocks, tips over the rim of its own
     base away from whatever mated it, knocks on the board and lies
     there until the position changes. With no attacker given it falls
     outward, off the board rather than across it. `still: true` lays
     him down without the fall — for showing a finished game again
     after the board has been reset under it. */
  R.topple = function (sq, opts) {
    opts = opts || {};
    if (sq == null || sq < 0 || !onSq(sq)) return;
    var dx, dz;
    if (opts.from != null && opts.from >= 0 && onSq(opts.from) && opts.from !== sq) {
      dx = sqX(sq) - sqX(opts.from); dz = sqZ(sq) - sqZ(opts.from);
    } else {
      dx = sqX(sq); dz = sqZ(sq);
      if (Math.hypot(dx, dz) < 0.1) { dx = 1; dz = 0; }
    }
    var l = Math.hypot(dx, dz);
    /* what is lying there is read off the set every frame, so a set
       changed in the Studio lies down in its own shape */
    var kind = Math.abs(R.board[sq]) || 6, P = PIECES && PIECES[kind];
    R.toppled = { sq: sq, kind: kind, dx: dx / l, dz: dz / l,
                  rest: P && P.lie ? P.lie.rest : 1.7,
                  t0: opts.still ? -Infinity : performance.now() };
    R.dirty = true;
  };
  R.untopple = function () { if (R.toppled) { R.toppled = null; R.dirty = true; } };

  /* light under a capture: the square flashes like a struck surface and
     a ring of light runs out of it, bright enough for the bloom to find */
  R.impact = function (sq, power) {
    if (REDUCED || sq == null || sq < 0 || !onSq(sq)) return;
    R.impacts.push({ sq: sq, t0: performance.now(), power: power == null ? 0.5 : Math.max(0, Math.min(1, power)) });
    if (R.impacts.length > 6) R.impacts.shift();
    R.dirty = true;
  };
  R.setHighlights = function (hi) {
    /* a king that has just been put in check gets a few seconds of slow
       breathing on its square; one that has been in check all along does
       not, or a board nobody is touching would never stop redrawing */
    var nextCheck = hi.check != null ? hi.check : -1;
    if (nextCheck >= 0 && nextCheck !== R.hi.check) R.checkAt = performance.now();
    else if (nextCheck < 0) R.checkAt = -1;
    var nextSel = hi.selected != null ? hi.selected : -1, now = performance.now();
    /* a new touch: the man lights and his squares open out from him. The
       same selection repeated (a redraw) keeps its clocks, so a marker
       half-open does not start again from nothing. */
    if (nextSel >= 0 && nextSel !== R.hi.selected) { R.selAt = now; R.hiAt = now; }
    else if (nextSel < 0) { R.selAt = -1; R.hiAt = -1; }
    R.hi.selected = nextSel;
    R.hi.legal = hi.legal || [];
    R.hi.legalCapt = hi.legalCapt || [];
    R.hi.last = hi.last || null;
    R.hi.check = hi.check != null ? hi.check : -1;
    R.hi.hint = hi.hint || null;
    R.dirty = true;
  };
  R.animateMove = function (m, after, o, done) {
    o = o || {};
    /* A move played by letting go of a carried man starts where he is —
       over his new square, or on his way back from it — and is only the
       setting down; any other move travels the whole way from its square. */
    var drop = null;
    if (settling && settling.sq === m.from) {
      var at = settleAt(performance.now());
      drop = { x: at.x, z: at.z, y: at.y };
    }
    settling = null;
    if (drag && drag.sq === m.from) drag = null;
    /* the character of the move is worked out once, here, rather than
       sampled out of a table every frame */
    var pl = drop ? Move.setDown(m, { reduced: REDUCED, scale: o.scale,
                                      reach: Math.hypot(sqX(m.to) - drop.x, sqZ(m.to) - drop.z) })
                  : Move.plan(m, { reduced: REDUCED, scale: o.scale });
    if (o.dur) pl.dur = REDUCED ? 1 : o.dur;   /* a caller that insists */
    /* a move means the game goes on, so a king lying down gets up; the
       men still arriving keep arriving round it, rather than thirty of
       them popping into place because an engine was quick off the mark */
    R.toppled = null;
    R.anim = { m: m, pl: pl, after: new Int8Array(after), t0: performance.now(),
               dur: pl.dur, glow: !!o.glow, done: done || null, drop: drop };
    R.dirty = true;
    /* handed back so the caller can put a sound on the same plan: both
       are measured from this moment, on clocks that do not drift apart */
    return pl;
  };
  R.isAnimating = function () { return !!R.anim; };

  /* The other direction: a square's centre, through the camera as it
     was last drawn, in css pixels from the canvas's top-left — what an
     effects layer over the board needs to put a spark on the right
     square while the camera orbits or pushes in. `s` is how long one
     edge of that square is on screen along the files, `sy` along the
     ranks, so sy/s is how much a ring on the board is foreshortened.
     `lift` (in squares, optional) asks for a point that far above the
     square instead: the middle of a piece rather than its feet. */
  R.squareToScreen = function (sq, lift) {
    if (sq == null || sq < 0 || !onSq(sq)) return null;
    if (!camPlaced) placeCamera();
    var m = vp, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    function at(x, y, z) {
      var cw = m[3]*x + m[7]*y + m[11]*z + m[15];
      if (cw <= 1e-6) return null;
      return { x: ((m[0]*x + m[4]*y + m[8]*z + m[12]) / cw * 0.5 + 0.5) * w,
               y: (0.5 - (m[1]*x + m[5]*y + m[9]*z + m[13]) / cw * 0.5) * h };
    }
    var x = sqX(sq), z = sqZ(sq), y = lift || 0;
    var c = at(x, y, z);
    if (!c) return null;
    var a = at(x - 0.5, y, z), b = at(x + 0.5, y, z), n = at(x, y, z - 0.5), f = at(x, y, z + 0.5);
    var s = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    var sy = n && f ? Math.hypot(f.x - n.x, f.y - n.y) : s;
    return { x: c.x, y: c.y, s: s, sy: sy };
  };

  /* a ray from the eye through a point on the canvas (css px), carried
     back through exactly the matrices the picture went out through */
  function rayAt(px, py) {
    if (!camPlaced) placeCamera();
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    var nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2, m = invVP;
    var X = m[0]*nx + m[4]*ny + m[8] + m[12], Y = m[1]*nx + m[5]*ny + m[9] + m[13],
        Z = m[2]*nx + m[6]*ny + m[10] + m[14], W = m[3]*nx + m[7]*ny + m[11] + m[15];
    if (!W) return null;
    var e = cam.eye;
    return { o: e, d: [X / W - e[0], Y / W - e[1], Z / W - e[2]] };
  }
  /* the square a point on the board's plane is over, clamped onto it */
  function squareAt(x, z) {
    var f = Math.max(0, Math.min(7, Math.floor(x + 4)));
    var r = Math.max(0, Math.min(7, Math.floor(4 - z)));
    return r * 16 + f;
  }
  /* How far along a ray it first touches a man standing at (cx, cz):
     the earliest point that is inside one band's cylinder while inside
     that band's slice of height, or Infinity. Each band is a circle in
     plan (a quadratic in t) and a slab in height (two planes), and the
     ray is inside the band where both intervals overlap. */
  function hitMan(o, d, cx, cz, g) {
    var px = o[0] - cx, pz = o[2] - cz;
    var a = d[0]*d[0] + d[2]*d[2], b = px*d[0] + pz*d[2], c0 = px*px + pz*pz;
    var best = Infinity, n = g.r.length, bh = g.h / n;
    for (var i = 0; i < n; i++) {
      var r = g.r[i], t0, t1;
      if (a < 1e-12) {
        if (c0 > r * r) continue;
        t0 = -Infinity; t1 = Infinity;
      } else {
        var disc = b * b - a * (c0 - r * r);
        if (disc < 0) continue;
        var rt = Math.sqrt(disc);
        t0 = (-b - rt) / a; t1 = (-b + rt) / a;
      }
      var s0, s1;
      if (Math.abs(d[1]) < 1e-12) {
        if (o[1] < i * bh || o[1] > (i + 1) * bh) continue;
        s0 = -Infinity; s1 = Infinity;
      } else {
        s0 = (i * bh - o[1]) / d[1]; s1 = ((i + 1) * bh - o[1]) / d[1];
        if (s0 > s1) { var sw = s0; s0 = s1; s1 = sw; }
      }
      var lo = Math.max(t0, s0, 0), hi = Math.min(t1, s1);
      if (lo <= hi && lo < best) best = lo;
    }
    return best;
  }

  /* Where a ray first meets a man's actual surface, or Infinity: the ray
     carried into his own frame (he stands at (cx, cz), turned `ry` about
     his axis, exactly as he is drawn) and tried against every triangle,
     both faces, by Möller and Trumbore. A few thousand triangles for each
     of the two or three men a ray passes near — a millisecond or two, once
     a tap, which is nothing beside being told the wrong man. */
  function hitMesh(o, d, cx, cz, ry, P) {
    var c = Math.cos(ry || 0), n = Math.sin(ry || 0);
    var wx = o[0] - cx, wz = o[2] - cz;
    var ox = c * wx - n * wz, oy = o[1], oz = n * wx + c * wz;
    var dx = c * d[0] - n * d[2], dy = d[1], dz = n * d[0] + c * d[2];
    var pos = P.pos, idx = P.idx, best = Infinity;
    for (var i = 0; i < idx.length; i += 3) {
      var a = idx[i] * 3, b = idx[i + 1] * 3, e = idx[i + 2] * 3;
      var ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
      var e1x = pos[b] - ax, e1y = pos[b + 1] - ay, e1z = pos[b + 2] - az;
      var e2x = pos[e] - ax, e2y = pos[e + 1] - ay, e2z = pos[e + 2] - az;
      var px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      var det = e1x * px + e1y * py + e1z * pz;
      if (det > -1e-12 && det < 1e-12) continue;
      var inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az;
      var u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      var qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      var v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      var t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 0 && t < best) best = t;
    }
    return best;
  }

  /* A tap, to the square of whatever the player can see under it. The
     men are tall, and seen from the near side a back-rank piece stands
     over the pawn in front of it and a pawn over the square behind — so
     the ray is tried against every man on the board first (the board as
     it will be once a move in flight has landed), nearest one wins, and
     only if it misses them all does it go on down to the wood. Without
     that, the head of the g1 knight was g2 and the queen's crown was d2.

     Two tries, in order. First the men's real surfaces: the nearest
     triangle the ray meets decides, so a pawn peeping out beside a king
     in front of him is the pawn wherever you can actually see him (the
     padded outlines alone gave half of him to the king, seen low).
     Only if the ray slips between every man's triangles — through the
     openwork of a spiral, or a hair to the side of a king's cross — do
     the padded outlines get their say, nearest first: a fingertip is
     wider than a finial, and a near miss on a man's head should still
     pick the man rather than the square behind him.
     `{ plane: true }` skips the men and answers for the wood alone —
     what an effects check wants when it asks whether the projector and
     its inverse agree. */
  R.screenToSquare = function (px, py, o) {
    var ray = rayAt(px, py);
    if (!ray) return -1;
    var O = ray.o, D = ray.d;
    if (!(o && o.plane) && PIECES) {
      var b = R.anim ? R.anim.after : R.board, near = -1, nearT = Infinity, cands = [];
      var down = R.toppled && !R.anim ? R.toppled.sq : -1;
      for (var sq = 0; sq < 128; sq++) {
        if ((sq & 0x88) || !b[sq] || sq === down || (drag && sq === drag.sq)) continue;
        var P = PIECES[Math.abs(b[sq])];
        if (!P || !P.girth) continue;
        var cx = sqX(sq), cz = sqZ(sq);
        var t = hitMan(O, D, cx, cz, P.girth);
        if (t < nearT) { nearT = t; near = sq; }
        var tc = hitMan(O, D, cx, cz, P.girth.can);
        if (tc < Infinity) cands.push({ sq: sq, t: tc, P: P, ry: faceAngle(Math.abs(b[sq]), b[sq] > 0) });
      }
      /* nearest can first; a man whose can starts beyond the best hit so
         far cannot be in front of it */
      cands.sort(function (x, y) { return x.t - y.t; });
      var hit = -1, hitT = Infinity;
      for (var ci = 0; ci < cands.length && cands[ci].t < hitT; ci++) {
        var C = cands[ci];
        if (!C.P.pos || !C.P.idx) continue;
        var te = hitMesh(O, D, sqX(C.sq), sqZ(C.sq), C.ry, C.P);
        if (te < hitT) { hitT = te; hit = C.sq; }
      }
      if (hit >= 0) return hit;
      if (near >= 0) return near;
    }
    if (D[1] > -1e-9) return -1;
    var tp = -O[1] / D[1];
    var x = O[0] + D[0] * tp, z = O[2] + D[2] * tp;
    var f = Math.round(x + 3.5), r = Math.round(3.5 - z);
    if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
    return r * 16 + f;
  };

  /* ---------- a man carried by hand ----------
     Drag-to-move: while a finger has a piece, the piece leaves its square
     and travels with the finger, lifted clear of the others so it can be
     carried over them, its shadow on the board under it. It is held at
     the point where the ray under the finger meets the plane at its own
     height, so the finger is always on the piece's foot — and that point
     is what decides the square it is over, rather than the wood further
     along the same ray. Clamped to the board: dragged off the edge, it
     waits at the edge. */
  var DRAG_LIFT = 0.6;
  var drag = null, hover = -1;
  function carry(now) {
    var t = REDUCED ? 1 : Math.min(1, (now - drag.t0) / 140);
    var lift = DRAG_LIFT * (1 - (1 - t) * (1 - t));
    drag.lift = lift;
    var ray = rayAt(drag.x, drag.y);
    if (!ray || ray.d[1] > -1e-6) return;            /* pointing at the sky: he stays put */
    var k = (lift - ray.o[1]) / ray.d[1];
    if (!(k > 0)) return;
    var x = ray.o[0] + ray.d[0] * k, z = ray.o[2] + ray.d[2] * k;
    drag.off = Math.abs(x) > 4 || Math.abs(z) > 4;
    drag.wx = Math.max(-4, Math.min(4, x));
    drag.wz = Math.max(-4, Math.min(4, z));
  }
  /* Let go of, he is never simply teleported. If the app plays the move
     there and then, the move sets him down from where the hand left him
     (see animateMove) instead of snapping him home and sliding him all
     the way across again; if it does not — a drop on a square he cannot
     go to — he glides back to his own square. `settling` is that glide:
     where he was let go, and when. */
  var SETTLE_MS = 170;
  var settling = null;
  function settleAt(now) {
    var u = REDUCED ? 1 : Math.min(1, (now - settling.t0) / SETTLE_MS);
    var e = 1 - (1 - u) * (1 - u) * (1 - u);
    var hx = sqX(settling.sq), hz = sqZ(settling.sq);
    return { x: settling.x + (hx - settling.x) * e, z: settling.z + (hz - settling.z) * e,
             y: settling.y * (1 - e), done: u >= 1 };
  }
  /* setDrag(sq, x, y): the man on sq is in the hand, the pointer at (x, y)
     css px from the canvas's top-left; call it again as the pointer
     moves. Hands back the square he is over (-1 off the board), which is
     the square a drop lands on. setDrag(null) puts the hand away — the
     app then either plays the move, which sets him down from where he
     was let go, or leaves him be, and he glides home. */
  R.setDrag = function (sq, x, y) {
    var now = performance.now();
    if (sq == null || sq < 0 || !onSq(sq)) {
      if (drag) {
        settling = REDUCED ? null : { sq: drag.sq, x: drag.wx, z: drag.wz, y: drag.lift, t0: now };
        drag = null; R.dirty = true;
      }
      return -1;
    }
    if (!drag || drag.sq !== sq) {
      /* picked up again on his way home: from where he is now */
      var from = settling && settling.sq === sq ? settleAt(now) : null;
      drag = { sq: sq, t0: now, wx: from ? from.x : sqX(sq), wz: from ? from.z : sqZ(sq), lift: 0, off: false };
    }
    settling = null;
    drag.x = +x || 0; drag.y = +y || 0;
    carry(now);
    R.dirty = true;
    return drag.off ? -1 : squareAt(drag.wx, drag.wz);
  };
  R.dragging = function () { return drag ? drag.sq : -1; };
  /* a soft outline on the square a carried man would land on, or -1 */
  R.dragHover = function (sq) {
    var next = sq != null && sq >= 0 && onSq(sq) ? sq : -1;
    if (next !== hover) { hover = next; R.dirty = true; }
  };

  var STRIDE = 28;                       /* pos(3) + normal(3) + shade(1) */
  function bindMesh(mesh) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
    gl.enableVertexAttribArray(U.aPos);
    gl.vertexAttribPointer(U.aPos, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(U.aNrm);
    gl.vertexAttribPointer(U.aNrm, 3, gl.FLOAT, false, STRIDE, 12);
    gl.enableVertexAttribArray(U.aShade);
    gl.vertexAttribPointer(U.aShade, 1, gl.FLOAT, false, STRIDE, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
  }
  /* rough and metal replace the old single "spec" number: the first is
     how wide the highlight is, the second whether the reflection takes
     the material's colour or the room's. Markers pass flat, which skips
     the surface model entirely and emits light — glow above 1 is what
     the bloom pass later finds. */
  function drawMesh(mesh, model, color, alpha, flat, rough, metal, glow) {
    gl.uniformMatrix4fv(U.model, false, model);
    gl.uniform3fv(U.color, color);
    gl.uniform1f(U.alpha, alpha);
    gl.uniform1f(U.flat, flat ? 1 : 0);
    gl.uniform1f(U.rough, rough == null ? 0.45 : rough);
    gl.uniform1f(U.metal, metal || 0);
    gl.uniform1f(U.glow, glow == null ? 1 : glow);
    gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
  }
  /* the man's material under his colour, and the light inside him */
  function setMaterial(th) {
    gl.uniform1f(U.sss, th.sss || 0);
    gl.uniform1f(U.coat, th.coat || 0);
  }
  function setHalo(col, amt) {
    gl.uniform1f(U.haloAmt, amt > 0 ? amt : 0);
    if (amt > 0) gl.uniform3fv(U.haloCol, col);
  }
  function sendLights(L, th) {
    gl.uniform3fv(L.eye, cam.eye);
    gl.uniform3fv(L.keyDir, th.keyDir);
    gl.uniform3fv(L.keyCol, th.keyCol);
    gl.uniform3fv(L.fillDir, th.fillDir);
    gl.uniform3fv(L.fillCol, th.fillCol);
    gl.uniform3fv(L.sky, th.sky);
    gl.uniform3fv(L.ground, th.ground);
    gl.uniform1f(L.exposure, th.exposure);
    gl.uniform1f(L.direct, postOk ? 0 : 1);
    gl.uniformMatrix4fv(L.lightVP, false, lightVP);
    gl.uniform1f(L.shadowOn, shadowSize ? 1 : 0);
    gl.uniform1f(L.shadowTexel, shadowSize ? 1 / shadowSize : 0);
    gl.uniform1f(L.shadowSoft, shadowSize && FX.soft ? 1 : 0);
    gl.uniform1i(L.shadow, 1);
    var on = !!(th.table && place.ready);
    gl.uniform1i(L.pano, 3); gl.uniform1i(L.envTex, 4); gl.uniform1i(L.cookie, 5);
    gl.uniform1f(L.envOn, on ? 1 : 0);
    gl.uniform1f(L.envGain, on ? th.bgGain : 1);
    gl.uniform1f(L.hot, on ? th.hot : 0);
    gl.uniform1f(L.cookieAmt, on && th.cookie && place.cookie ? th.cookie.amount : 0);
    gl.uniform1f(L.cookieScale, on && th.cookie ? th.cookie.scale : 1);
    gl.uniform3fv(L.tableLit, on ? th.tableLit : th.ground);
  }

  function hexToVec(h) {
    return [parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255];
  }

  /* which men the set says have a front — knights always, and bishops
     when the set has cut a slit worth pointing at someone */
  function faceAngle(kind, white) {
    return setFaces.indexOf(FACE_LETTER[kind]) >= 0 ? (white ? Math.PI / 2 : -Math.PI / 2) : 0;
  }

  /* Every piece on the board, worked out once a frame and then drawn
     two or three times over: into the shadow map, reflected in the
     wood, and finally itself. Collecting them first is what makes the
     extra passes nearly free to write — and it is also the only way to
     sort a set of glass pieces back to front, which they need or the
     ones behind simply vanish. */
  var instances = [];
  /* A piece on the board is a pose, not a position: where it stands, how
     far off the board it has been lifted, how much it is squashed by the
     weight of landing, and which way it is leaning. Standing still, all
     of those are their resting values and the extra fields cost nothing;
     mid-move they are what makes the gesture. */
  function pushPiece(piece, x, z, yLift, alpha, scaleMul, pose) {
    var kind = Math.abs(piece);
    var P = PIECES && PIECES[kind];
    if (!P) return;
    var s = scaleMul || 1;
    var dx = x - cam.eye[0], dy = (yLift || 0) - cam.eye[1], dz = z - cam.eye[2];
    var q = { P: P, white: piece > 0, x: x, z: z, y: yLift || 0,
              a: alpha == null ? 1 : alpha, s: s, sy: s,
              ry: faceAngle(kind, piece > 0),
              ax: 0, az: 0, lean: 0,
              d: dx * dx + dy * dy + dz * dz };
    if (pose) {
      /* squash keeps the piece's volume roughly honest: what it loses in
         height it gains, less than half as much, around the middle */
      if (pose.squash != null && pose.squash !== 1) {
        q.sy = s * pose.squash;
        q.s = s * (1 + (1 - pose.squash) * 0.42);
      }
      if (pose.lean) { q.lean = pose.lean; q.ax = pose.ax || 0; q.az = pose.az || 0; }
      if (pose.ry != null) q.ry += pose.ry;
      if (pose.pivot && pose.lean) {
        /* Going over the rim of its base rather than about its middle:
           the base centre rises and swings out as the piece tips, which
           is the whole difference between falling and sinking into the
           board. A lean backwards turns on the back rim instead. */
        var tilt = pose.lean, sg = tilt >= 0 ? 1 : -1, lie = Math.abs(Math.sin(tilt));
        var out = pose.pivot * (1 - Math.cos(tilt)) * sg;
        q.x += pose.dirx * out; q.z += pose.dirz * out;
        q.y += pose.pivot * lie + (pose.lift || 0);
        /* and its contact shadow slides out under the length of it: from
           the rim it turns on to the crown, a body's height further on */
        var reach = (pose.pivot + P.height * 0.42) * lie;
        q.shx = x + pose.dirx * reach; q.shz = z + pose.dirz * reach; q.shr = 1 + lie * 0.9;
      }
    }
    instances.push(q);
    return q;
  }
  function poseModel(q, mirror) {
    return mLean(q.x, mirror ? -q.y - 0.004 : q.y, q.z,
                 q.s, mirror ? -q.sy : q.sy, q.ry, q.ax, q.az, mirror ? -q.lean : q.lean);
  }

  function drawPiece(q, th) {
    var al = q.a * th.alpha;
    /* A soft disc under each piece. With a real shadow map it is no
       longer doing the work of a shadow — it is the contact darkening
       right at the base, which a 1024-pixel map an eighth of a square
       wide cannot resolve on its own. Without one it is still the only
       shadow there is, so it stays correspondingly darker. */
    var contact = shadowSize ? 0.075 : 0.24;
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    bindMesh(MESH_DISC);
    /* the contact darkening tightens and fades as the piece lifts, which
       is the cheapest cue there is that something is off the board */
    drawMesh(MESH_DISC, mModel(q.shx != null ? q.shx : q.x, 0.012, q.shz != null ? q.shz : q.z,
      q.P.radius * (shadowSize ? 0.86 : 1.12) * q.s * (q.shr || 1), 0),
      [0, 0, 0], contact * al / (1 + Math.max(0, q.y) * 1.6), true, 0, 0, 1);
    if (al >= 1) { gl.depthMask(true); gl.disable(gl.BLEND); }
    bindMesh(q.P.mesh);
    setHalo(th.selected, q.halo || 0);
    drawMesh(q.P.mesh, poseModel(q, false),
      q.white ? th.white : th.black, al, false, th.rough, th.metal);
    if (q.halo) setHalo(null, 0);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /* the men again, upside down, clipped to the wood and fading as they
     fall away from it. Additive and after the board, because a
     reflection is light arriving on a surface rather than a thing
     sitting behind it — and because the alternative, a see-through
     board, would blend the room in underneath the whole eight ranks. */
  function drawReflections(th) {
    if (!FX.mirror || th.mirror <= 0.01 || th.translucent) return;
    gl.useProgram(prog);
    gl.uniform1f(U.mirror, th.mirror);
    setHalo(null, 0);
    setMaterial(th);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    for (var i = 0; i < instances.length; i++) {
      var q = instances[i];
      bindMesh(q.P.mesh);
      drawMesh(q.P.mesh, poseModel(q, true),
        q.white ? th.white : th.black, q.a * th.alpha, false, Math.max(th.rough, 0.22), th.metal);
    }
    gl.uniform1f(U.mirror, 0);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }

  /* The depth pass. Only the men go in: the board is flat and would
     shadow itself into stripes, and the markers are light rather than
     matter. Back faces are the ones recorded — the standard dodge for
     self-shadowing acne, which works here because every carved piece is
     a closed solid with its winding already checked. */
  function shadowPass() {
    var onTable = !!(place.ready && R.pal && R.pal.table);
    if (!shadowSize || (!instances.length && !onTable)) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowT.fb);
    gl.viewport(0, 0, shadowSize, shadowSize);
    gl.clearColor(1, 1, 1, 1);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(progShadow);
    gl.uniformMatrix4fv(US.lightVP, false, lightVP);
    /* on a table, the board itself is in the light's way: its box goes
       in first, both faces, so its shadow lies across the table on the
       side away from the lamp. Its top is left out — that is the
       surface the men's shadows land on, and it cannot shade itself. */
    if (onTable) {
      gl.bindBuffer(gl.ARRAY_BUFFER, MESH_RIM.vb);
      onlyAttrib(US.aPos);
      gl.vertexAttribPointer(US.aPos, 3, gl.FLOAT, false, STRIDE, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, MESH_RIM.ib);
      gl.uniformMatrix4fv(US.model, false, mModel(0, -0.002, 0, 1, 0));
      gl.drawElements(gl.TRIANGLES, MESH_RIM.n, gl.UNSIGNED_SHORT, 0);
    }
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    for (var i = 0; i < instances.length; i++) {
      var q = instances[i];
      if (q.a < 0.35) continue;         /* a piece mid-fade casts nothing */
      gl.bindBuffer(gl.ARRAY_BUFFER, q.P.mesh.vb);
      onlyAttrib(US.aPos);
      gl.vertexAttribPointer(US.aPos, 3, gl.FLOAT, false, STRIDE, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, q.P.mesh.ib);
      gl.uniformMatrix4fv(US.model, false, poseModel(q, false));
      gl.drawElements(gl.TRIANGLES, q.P.mesh.n, gl.UNSIGNED_SHORT, 0);
    }
    gl.disable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function drawAllPieces(th) {
    setMaterial(th);
    /* glass has to go far to near; everything else can draw as it comes */
    if (th.translucent) instances.sort(function (a, b) { return b.d - a.d; });
    for (var i = 0; i < instances.length; i++) drawPiece(instances[i], th);
  }

  function drawFlatSq(sq, color, alpha, mesh, scale, y) {
    drawMesh(mesh || MESH_QUAD, mModel(sqX(sq), y || 0.015, sqZ(sq), scale || 0.98, 0),
      color, alpha, true, 0, 0, 1.45);
  }

  /* dynamic meshes: the hint and the racing lines, one buffer between
     them, rebuilt as drawn. They're drawn flat, so their normals are
     along for the ride only and their shade is alpha — but the attribute
     layout has to match the static meshes all the same. */
  var lineBuf = gl.createBuffer(), lineIdx = gl.createBuffer();
  function bindDynamic() {
    gl.enableVertexAttribArray(U.aPos);
    gl.vertexAttribPointer(U.aPos, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(U.aNrm);
    gl.vertexAttribPointer(U.aNrm, 3, gl.FLOAT, false, STRIDE, 12);
    gl.enableVertexAttribArray(U.aShade);
    gl.vertexAttribPointer(U.aShade, 1, gl.FLOAT, false, STRIDE, 24);
  }

  /* One racing line, flat on the board. The ribbon comes back as a
     polygon whose first half is the left edge and second half the right
     edge reversed, so it triangulates as a strip without any clever
     geometry — and the arrowhead is simply one more triangle. */
  /* A ribbon of light on the board: Lines' outline, triangulated with a
     spine down the middle so the shade attribute — alpha, for a marker —
     runs from nothing at one edge to full on the spine and back to
     nothing. A soft-edged stroke rather than a cut-out, and the head
     fades toward its two back corners while its tip stays sharp. */
  function drawRibbon(L, colour, alpha, glow, y) {
    var half = L.poly.length / 2, verts = [], idx = [], i;
    for (i = 0; i < half; i++) {
      var l = L.poly[i], r = L.poly[L.poly.length - 1 - i];
      verts.push(l.x, y, l.y, 0, 1, 0, 0);
      verts.push((l.x + r.x) / 2, y, (l.y + r.y) / 2, 0, 1, 0, 1);
      verts.push(r.x, y, r.y, 0, 1, 0, 0);
    }
    for (i = 0; i < half - 1; i++) {
      var v = i * 3;
      idx.push(v, v + 1, v + 4, v, v + 4, v + 3, v + 1, v + 2, v + 5, v + 1, v + 5, v + 4);
    }
    if (L.head) {
      var base = verts.length / 7, tip = L.head[0], hl = L.head[1], hr = L.head[2];
      verts.push(tip.x, y, tip.y, 0, 1, 0, 1, hl.x, y, hl.y, 0, 1, 0, 0,
                 hr.x, y, hr.y, 0, 1, 0, 0, (hl.x + hr.x) / 2, y, (hl.y + hr.y) / 2, 0, 1, 0, 1);
      idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    bindDynamic();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(U.model, false, mIdent());
    gl.uniform3fv(U.color, colour);
    gl.uniform1f(U.alpha, alpha);
    gl.uniform1f(U.flat, 1);
    gl.uniform1f(U.glow, glow);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
  }

  /* One racing line, flat on the board, and the spark riding it. */
  function drawLine(spec, now, th) {
    var a = { x: sqX(spec.from), y: sqZ(spec.from) };
    var b = { x: sqX(spec.to), y: sqZ(spec.to) };
    var L = root.Lines.build(a, b, { kind: spec.kind, scale: 1, knight: spec.knight, alpha: spec.alpha });
    var colour = spec.colour ||
      (spec.kind === "threat" ? th.capt : spec.kind === "lane" ? th.last : th.hint);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    drawRibbon(L, colour, L.alpha, 1.5 + 0.4 * L.glow, 0.03);

    /* the spark: a small bright disc riding the line. Well over white,
       on purpose — this is the one thing in the scene that is meant to
       bloom, and the tone map at the end keeps it from flaring out. */
    var sp = root.Lines.sparkAt(L.pts, root.Lines.phase(L, now));
    bindMesh(MESH_SOFT);
    drawMesh(MESH_SOFT, mModel(sp.x, 0.04, sp.y, 0.34, 0), colour, 0.55 * L.alpha, true, 0, 0, 2.6);
    bindMesh(MESH_DISC);
    drawMesh(MESH_DISC, mModel(sp.x, 0.045, sp.y, 0.15, 0), [1, 1, 1], 0.95 * L.alpha, true, 0, 0, 5.5);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
  /* the hint: the same ribbon the racing line is drawn with, bent over
     the traffic for a knight, standing still, with its tip lit so the
     eye lands where the idea does */
  function drawArrow(from, to, color) {
    if (!root.Lines) return;
    var df = Math.abs(fileOf(to) - fileOf(from)), dr = Math.abs(rankOf(to) - rankOf(from));
    var knight = (df === 1 && dr === 2) || (df === 2 && dr === 1);
    var L = root.Lines.build({ x: sqX(from), y: sqZ(from) }, { x: sqX(to), y: sqZ(to) },
                             { kind: "run", scale: 1, knight: knight, alpha: 0.95 });
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    drawRibbon(L, color, L.alpha, 2.3, 0.02);
    /* and once more, narrower and brighter, for a spine the eye can
       follow across a pale board */
    drawRibbon(root.Lines.build({ x: sqX(from), y: sqZ(from) }, { x: sqX(to), y: sqZ(to) },
                                { kind: "ghost", scale: 1, knight: knight, alpha: 0.9 }), color, 0.9, 3.0, 0.021);
    bindMesh(MESH_SOFT);
    drawMesh(MESH_SOFT, mModel(sqX(to), 0.022, sqZ(to), 0.42, 0), color, 0.34, true, 0, 0, 2.2);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /* the colour of a struck square: warm lamplight, hotter at the core —
     and of the air a landing moves, which is no colour in particular */
  var IMPACT_CORE = [1.0, 0.93, 0.80], IMPACT_COL = [1.0, 0.80, 0.52], IMPACT_EDGE = [0.95, 0.62, 0.34];
  var LAND_COL = [1.0, 0.96, 0.90];
  /* a thin lit edge round a square: the selected one, and the one a
     carried man would land on */
  function drawEdge(sq, col, alpha, glow) {
    var hx = sqX(sq), hz = sqZ(sq);
    var edge = [[0, -0.46, 0.94, 0.05], [0, 0.46, 0.94, 0.05], [-0.46, 0, 0.05, 0.84], [0.46, 0, 0.05, 0.84]];
    bindMesh(MESH_QUAD);
    for (var he = 0; he < 4; he++) {
      var E = edge[he];
      drawMesh(MESH_QUAD, [E[2], 0, 0, 0, 0, 1, 0, 0, 0, 0, E[3], 0, hx + E[0], 0.019, hz + E[1], 1],
        col, alpha, true, 0, 0, glow);
    }
  }

  R.frame = function () {
    if (R.lost) return false;
    var th = R.pal;
    if (!th) return false;
    /* camera springs */
    var moving = false;
    var k = REDUCED ? 1 : 0.14;
    var dy = cam.tYaw - cam.yaw, dp = cam.tPitch - cam.pitch, dd = cam.tDist - cam.dist;
    if (Math.abs(dy) + Math.abs(dp) + Math.abs(dd) > 0.0008) {
      cam.yaw += dy * k; cam.pitch += dp * k; cam.dist += dd * k;
      moving = true;
    } else { cam.yaw = cam.tYaw; cam.pitch = cam.tPitch; cam.dist = cam.tDist; }

    var nowMs = performance.now();
    if (stepFocus(nowMs)) moving = true;

    var a = R.anim, aprog = 0, animating = false;
    if (a) {
      aprog = Math.min(1, (nowMs - a.t0) / a.dur);
      animating = aprog < 1;
    }
    /* the men arriving at the start of a game */
    var casc = R.cascade, cascMs = 0, dropping = false;
    if (casc) {
      cascMs = nowMs - casc.t0;
      if (cascMs >= casc.end) R.cascade = casc = null; else dropping = true;
    }
    /* the mated king, going over or lying down */
    var down = a ? null : R.toppled, fall = null, falling = false, downP = null;
    if (down) {
      downP = PIECES && PIECES[down.kind];
      if (downP && downP.lie) down.rest = downP.lie.rest;
      fall = Move.kingFall(REDUCED ? Infinity : nowMs - down.t0, down.rest);
      falling = !fall.done;
    }
    var flashing = R.impacts.length > 0;
    /* film grain moves, so a still frame is never quite still — but
       only while something else is already asking for frames. It is
       never a reason on its own to keep the loop awake. */
    if (!R.dirty && !moving && !animating && !dropping && !falling && !flashing) {
      sampleEnd();                         /* (which may ask for one frame at a new tier) */
      return R.dirty;
    }
    sampleFrame(nowMs, moving || animating || dropping || falling);

    refit();
    placeCamera();
    /* the man in the hand follows the camera as well as the finger: if
       the view is still settling, so is the point under the finger */
    var lifting = false, home = null;
    if (drag) { carry(nowMs); lifting = drag.lift < DRAG_LIFT; }
    if (settling) {
      home = settleAt(nowMs);
      if (home.done) { settling = null; home = null; } else lifting = true;
    }

    /* ---- who is standing where, once, for all the passes ---- */
    instances.length = 0;
    /* the touched man's halo: a flare on the touch, two breaths, a glow */
    var selP = R.hi.selected >= 0 && R.selAt >= 0 ? Move.selectPulse(REDUCED ? Infinity : nowMs - R.selAt)
                                                   : { amount: 0, live: false };
    var skip = {};
    if (a) {
      skip[a.m.from] = true; skip[a.m.to] = true;
      if (a.m.rookFrom != null) { skip[a.m.rookFrom] = true; skip[a.m.rookTo] = true; }
      if (a.m.epSq != null) skip[a.m.epSq] = true;
    }
    /* his own square is empty while he is in the hand */
    if (drag) skip[drag.sq] = true;
    if (home) skip[settling.sq] = true;
    for (var sq = 0; sq < 128; sq++) {
      if (!onSq(sq) || skip[sq]) continue;
      var piece = a ? (a.after[sq] || 0) : R.board[sq];
      if (!piece) continue;
      var lift = 0, alph = 1, still = null;
      if (casc && casc.delay[sq] != null) {
        /* set down rank by rank from the player's side, with a hop as
           each one lands — the schedule is the one flourishPlan() hands
           to the sound, so every knock is under the man that made it */
        var dp = Move.dropAt(cascMs - casc.delay[sq]);
        if (dp.alpha <= 0.004) continue;
        lift = dp.y; alph = dp.alpha; still = { squash: dp.squash };
        /* each man's landing leaves its ring on the wood */
        if (dp.landed && !casc.rung[sq]) { casc.rung[sq] = true; R.lands.push({ x: sqX(sq), z: sqZ(sq), t0: nowMs, k: 0.42 }); }
      } else if (down && sq === down.sq && downP) {
        /* across the push, in the board plane: positive tips the crown
           toward (dx, dz), away from whatever mated it — turning on the
           very rim the rest angle was measured from */
        still = { lean: fall.tilt, ax: down.dz, az: -down.dx,
                  pivot: downP.radius, dirx: down.dx, dirz: down.dz,
                  lift: Move.lieLift(fall.tilt, downP.lie) };
      }
      var standing = pushPiece(piece, sqX(sq), sqZ(sq), lift, alph, 1, still);
      if (standing && sq === R.hi.selected && selP.amount > 0) standing.halo = selP.amount;
    }
    var promoFlash = 0, promoAt = null;
    if (a) {
      var pl = a.pl, st = Move.at(pl, aprog);
      var fx = sqX(a.m.from), fz = sqZ(a.m.from), tx = sqX(a.m.to), tz = sqZ(a.m.to);
      /* the unit vector the move travels along: the bank leans across
         it, and a captured piece is pushed over along it */
      var vx = tx - fx, vz = tz - fz, vl = Math.hypot(vx, vz) || 1;
      vx /= vl; vz /= vl;
      /* the moment he touches down, a ring runs out from under him —
         and from under the rook of a castle at its own moment. A
         promotion has a ceremony of its own and gets no ring. */
      if (!REDUCED && !a.m.promo && !a.landed && aprog >= pl.travel) {
        a.landed = true;
        R.lands.push({ x: tx, z: tz, t0: nowMs, k: Move.landPower(pl) });
      }
      if (!REDUCED && a.m.rookFrom != null && !a.rookLanded && aprog >= pl.rookOut) {
        a.rookLanded = true;
        R.lands.push({ x: sqX(a.m.rookTo), z: sqZ(a.m.rookTo), t0: nowMs, k: 0.5 });
      }
      if (R.lands.length > 40) R.lands.splice(0, R.lands.length - 40);

      /* whatever was taken is pushed over rather than deleted. It tips
         away from the piece that took it, skids a little, and is off the
         square before the mover has finished arriving — so you see what
         happened without the board ever being ambiguous. An en-passant
         capture topples on its own square, which is the clearest
         possible explanation of a rule that confuses everybody. */
      var captPiece = a.m.epSq != null ? R.board[a.m.epSq] : R.board[a.m.to];
      if (captPiece) {
        var cx = a.m.epSq != null ? sqX(a.m.epSq) : tx;
        var cz = a.m.epSq != null ? sqZ(a.m.epSq) : tz;
        var tp = Move.toppleAt(pl, aprog);
        if (tp.alpha > 0.004) {
          /* the axis it turns about is across the push, in the board
             plane, and points the way that sends the crown along the
             push: (vz, -vx). The other sign tipped it back into the
             piece that took it while it skidded away — a piece falling
             upstream of its own slide. */
          pushPiece(captPiece, cx + vx * tp.slide, cz + vz * tp.slide, tp.y,
            tp.alpha, 1, { lean: tp.tilt, ax: vz, az: -vx });
        }
      }

      /* a castle is one gesture by two pieces: the rook sets off a
         moment after the king and arrives a moment before it */
      if (a.m.rookFrom != null) {
        var rk = Move.rookAt(pl, aprog);
        pushPiece(a.after[a.m.rookTo],
          sqX(a.m.rookFrom) + (sqX(a.m.rookTo) - sqX(a.m.rookFrom)) * rk.p,
          sqZ(a.m.rookFrom) + (sqZ(a.m.rookTo) - sqZ(a.m.rookFrom)) * rk.p,
          rk.y, 1, 1);
      }

      /* a move let go of by hand sets down from where the hand left him */
      var sx = a.drop ? a.drop.x : fx, sz = a.drop ? a.drop.z : fz;
      var mx = sx + (tx - sx) * st.p, mz = sz + (tz - sz) * st.p;
      if (a.drop) st.y += a.drop.y * (1 - st.p);
      /* the lean is about the axis across the travel — a long diagonal
         gets a little roll into it, a one-square step gets none */
      var pose = { squash: st.squash, lean: st.bank, ax: vz, az: -vx };
      if (pl.spin) {
        /* the knight turns toward where it is going and back again, so
           the one piece with a face uses it */
        pose.ry = Math.sin(Math.PI * Math.min(1, aprog / pl.travel)) * 0.30 *
                  (a.m.piece > 0 ? 1 : -1);
      }
      if (a.m.promo) {
        /* the only move in chess where a piece becomes a different
           piece, so it gets the only moment of ceremony: the pawn turns
           and goes, there is a flash, and the new piece grows in */
        var pr = Move.promoteAt(pl, aprog);
        if (pr.pawnAlpha > 0.004) {
          pushPiece(a.m.piece, mx, mz, st.y + (1 - pr.pawnAlpha) * 0.22,
            pr.pawnAlpha, pr.pawnScale, { squash: st.squash, ry: pr.pawnSpin });
        }
        if (pr.newScale > 0.01) {
          pushPiece(a.m.promo, tx, tz, 0, pr.newAlpha, pr.newScale, null);
        }
        promoFlash = pr.flash;
        promoAt = [tx, tz];
      } else if ((!drag || drag.sq !== a.m.to) && !(home && settling.sq === a.m.to)) {
        /* (a man picked up while he is still landing is in the hand
           already, and is drawn there rather than twice) */
        pushPiece(a.m.piece, mx, mz, st.y, 1, 1, pose);
      }
    }
    /* the man in the hand, last, so he is over everything he is carried
       across — and in the instance list, so he casts a real shadow */
    if (drag) {
      var held = (a ? a.after : R.board)[drag.sq];
      if (held) { var inHand = pushPiece(held, drag.wx, drag.wz, drag.lift, 1, 1, null); if (inHand) inHand.halo = 0.8; }
    }
    if (home) {
      var going = (a ? a.after : R.board)[settling.sq];
      if (going) { var onWay = pushPiece(going, home.x, home.z, home.y, 1, 1, null); if (onWay) onWay.halo = 0.45; }
    }

    /* ---- pass one: what the light can see ---- */
    shadowPass();

    /* ---- pass two: the room, into a texture if we have one ---- */
    sizeTargets();
    gl.bindFramebuffer(gl.FRAMEBUFFER, postOk ? scene.fb : null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    /* the background is a colour on screen and a light in the target:
       in linear space it has to be converted, or a dark room comes out
       several times too bright once the tone map has had its say */
    var bg = postOk ? lin3(th.bg) : th.bg;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    /* the room, before anything in it: the place, if the board is
       somewhere, or the studio's backdrop if it is not */
    var there = !!(place.ready && th.table);
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, panoTex);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, envTex);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, cookieTex);
    if (there) {
      gl.useProgram(progPano);
      gl.uniform1i(UP.pano, 3);
      gl.uniformMatrix4fv(UP.invVP, false, invVP);
      gl.uniform3fv(UP.eye, cam.eye);
      /* how far the backdrop is lifted toward the horizon: most of the
         way the camera is tipped down, so a steep phone view and a low
         laptop one both find the trees above the table's far edge */
      gl.uniform1f(UP.lift, backdropLift());
      gl.uniform1f(UP.gain, th.bgGain);
      gl.uniform1f(UP.hot, th.hot);
      gl.uniform1f(UP.direct, postOk ? 0 : 1);
      fullscreen(UP.aPos);
    } else {
      gl.useProgram(progSky);
      gl.uniform3fv(UK.top, th.skyTop);
      gl.uniform3fv(UK.bottom, th.skyFloor);
      gl.uniform3fv(UK.glowCol, th.lampGlow);
      gl.uniform1f(UK.glowAmt, 0.55);
      gl.uniform1f(UK.direct, postOk ? 0 : 1);
      fullscreen(UK.aPos);
    }
    gl.depthMask(true);
    gl.enable(gl.BLEND);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, shadowSize ? shadowT.tex : blankTex);

    if (there) {
      /* the table: its top with the board's own program (paint, relief,
         and the contact shade round the board's foot), then its edge */
      gl.disable(gl.BLEND);
      gl.useProgram(progTex);
      gl.uniformMatrix4fv(UT.proj, false, proj);
      gl.uniformMatrix4fv(UT.view, false, view);
      gl.uniformMatrix4fv(UT.model, false, mIdent());
      gl.uniform1f(UT.gloss, th.table.gloss);
      gl.uniform1f(UT.bump, th.table.bump);
      gl.uniform1f(UT.contact, HALF);
      sendLights(UT.L, th);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tableTex);
      gl.uniform1i(UT.tex, 0);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, tableNrm);
      gl.uniform1i(UT.nrmTex, 2);
      gl.bindBuffer(gl.ARRAY_BUFFER, place.top.vb);
      onlyAttrib(UT.aPos);
      gl.vertexAttribPointer(UT.aPos, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(UT.aUV);
      gl.vertexAttribPointer(UT.aUV, 2, gl.FLOAT, false, 20, 12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, place.top.ib);
      gl.drawElements(gl.TRIANGLES, place.top.n, gl.UNSIGNED_SHORT, 0);
      gl.useProgram(prog);
      gl.uniformMatrix4fv(U.proj, false, proj);
      gl.uniformMatrix4fv(U.view, false, view);
      gl.uniform1f(U.mirror, 0);
      gl.uniform1f(U.rimAmt, 0.2);
      sendLights(U.L, th);
      setMaterial({ sss: 0, coat: th.table.gloss * 0.5 });
      bindMesh(place.edge);
      drawMesh(place.edge, mIdent(), hexToVec(th.table.edge), 1, false, Math.max(0.2, 0.8 - th.table.gloss), 0);
      gl.enable(gl.BLEND);
    }

    /* the rim under the board: a lacquered edge, so a wide highlight
       and no metal in it */
    gl.useProgram(prog);
    gl.uniformMatrix4fv(U.proj, false, proj);
    gl.uniformMatrix4fv(U.view, false, view);
    gl.uniform1f(U.mirror, 0);
    gl.uniform1f(U.rimAmt, th.rimLight);
    sendLights(U.L, th);
    setMaterial({ sss: 0, coat: 0.35 });
    bindMesh(MESH_RIM);
    drawMesh(MESH_RIM, mModel(0, -0.002, 0, 1, 0), hexToVec(th.rim), 1, false, 0.52, 0);

    /* board top */
    gl.useProgram(progTex);
    gl.uniformMatrix4fv(UT.proj, false, proj);
    gl.uniformMatrix4fv(UT.view, false, view);
    gl.uniformMatrix4fv(UT.model, false, mIdent());
    gl.uniform1f(UT.gloss, th.gloss);
    gl.uniform1f(UT.bump, th.bump);
    gl.uniform1f(UT.contact, 0);
    sendLights(UT.L, th);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, boardTex);
    gl.uniform1i(UT.tex, 0);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, boardNrm);
    gl.uniform1i(UT.nrmTex, 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, texQuad.vb);
    onlyAttrib(UT.aPos);
    gl.vertexAttribPointer(UT.aPos, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(UT.aUV);
    gl.vertexAttribPointer(UT.aUV, 2, gl.FLOAT, false, 20, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, texQuad.ib);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    /* the men reflected in the polish, before anything is drawn on top */
    drawReflections(th);

    /* highlights (flat, just above the wood) */
    gl.useProgram(prog);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    var glowLive = selP.live, sel = R.hi.selected;
    /* the square a move has just landed on, a shade brighter for a moment */
    var ag = R.lastAt >= 0 ? Move.afterglow(nowMs - R.lastAt) : { amount: 0, live: false };
    glowLive = glowLive || ag.live;
    /* a king in check breathes for a few seconds rather than blinking:
       a blink is an alarm, and an alarm is the one thing a beginner
       being shown a new idea does not need more of */
    var pulse = { amount: 1, live: false };
    if (R.hi.check >= 0 && R.checkAt >= 0) pulse = Move.checkPulse(nowMs - R.checkAt);
    bindMesh(MESH_QUAD);
    if (R.hi.last) {
      drawFlatSq(R.hi.last[0], th.last, 0.26);
      drawFlatSq(R.hi.last[1], th.last, 0.38 + 0.26 * ag.amount);
    }
    if (sel >= 0) drawFlatSq(sel, th.selected, 0.34);
    if (hover >= 0) drawFlatSq(hover, th.selected, 0.16, null, 0.96, 0.017);
    if (R.hi.check >= 0) drawFlatSq(R.hi.check, th.check, 0.26 + 0.30 * pulse.amount);
    /* and under each of them a pool of light, added rather than laid
       over, because it is light arriving on the wood */
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    bindMesh(MESH_SOFT);
    if (R.hi.last) {
      drawMesh(MESH_SOFT, mModel(sqX(R.hi.last[1]), 0.018, sqZ(R.hi.last[1]), 0.74, 0),
        th.last, 0.14 + 0.34 * ag.amount, true, 0, 0, 1.6 + 0.8 * ag.amount);
    }
    if (sel >= 0) drawMesh(MESH_SOFT, mModel(sqX(sel), 0.019, sqZ(sel), 0.82, 0), th.selected, 0.22, true, 0, 0, 1.7);
    if (R.hi.check >= 0) {
      drawMesh(MESH_SOFT, mModel(sqX(R.hi.check), 0.019, sqZ(R.hi.check), 0.78, 0),
        th.check, 0.18 + 0.26 * pulse.amount, true, 0, 0, 1.9);
      if (pulse.amount > 0.5) {
        bindMesh(MESH_SOFTRING);
        drawMesh(MESH_SOFTRING, mModel(sqX(R.hi.check), 0.024, sqZ(R.hi.check),
          0.42 + 0.24 * pulse.amount, 0), th.check, 0.55 * pulse.amount, true, 0, 0, 2.2);
      }
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    /* a thin lit edge: round the touched square, and round the one a
       carried man would land on, so it reads as "here" without hiding
       the square's own colour */
    if (sel >= 0) drawEdge(sel, th.selected, 0.72, 1.6);
    if (hover >= 0) drawEdge(hover, th.selected, 0.85, 1.7);
    /* the squares a touched man can go to, opening out from under him:
       the nearest first, a few milliseconds a square, each a pool of
       light with a bright heart — and a ring of light round whatever
       he could take */
    var rvAt = R.hiAt;
    function revealOf(sq) {
      if (REDUCED || rvAt < 0) return { scale: 1, alpha: 1, live: false };
      var d = sel >= 0 ? Math.max(Math.abs(fileOf(sq) - fileOf(sel)), Math.abs(rankOf(sq) - rankOf(sel))) : 0;
      return Move.reveal(nowMs - rvAt - d * Move.REVEAL.step);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    for (var li = 0; li < R.hi.legal.length; li++) {
      var lsq = R.hi.legal[li], lr = revealOf(lsq);
      glowLive = glowLive || lr.live;
      if (lr.scale < 0.01) continue;
      bindMesh(MESH_SOFT);
      drawMesh(MESH_SOFT, mModel(sqX(lsq), 0.02, sqZ(lsq), 0.26 * lr.scale, 0), th.legal, 0.44 * lr.alpha, true, 0, 0, 2.0);
      bindMesh(MESH_DISC);
      drawMesh(MESH_DISC, mModel(sqX(lsq), 0.021, sqZ(lsq), 0.085 * lr.scale, 0), th.legal, 0.8 * lr.alpha, true, 0, 0, 1.7);
    }
    for (var ci = 0; ci < R.hi.legalCapt.length; ci++) {
      var csq = R.hi.legalCapt[ci], cr = revealOf(csq);
      glowLive = glowLive || cr.live;
      if (cr.scale < 0.01) continue;
      bindMesh(MESH_SOFTRING);
      drawMesh(MESH_SOFTRING, mModel(sqX(csq), 0.02, sqZ(csq), 0.47 * cr.scale, 0), th.capt, 0.72 * cr.alpha, true, 0, 0, 2.2);
      bindMesh(MESH_SOFT);
      drawMesh(MESH_SOFT, mModel(sqX(csq), 0.019, sqZ(csq), 0.40 * cr.scale, 0), th.capt, 0.12 * cr.alpha, true, 0, 0, 1.5);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (R.hi.hint && !R.lines.length) drawArrow(R.hi.hint[0], R.hi.hint[1], th.hint);
    /* the mate net: squares the king can't use */
    if (R.net.length) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      bindMesh(MESH_SOFTRING);
      for (var nn = 0; nn < R.net.length; nn++) {
        drawMesh(MESH_SOFTRING, mModel(sqX(R.net[nn]), 0.022, sqZ(R.net[nn]), 0.36, 0), th.capt, 0.55, true, 0, 0, 1.8);
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    /* the promotion flash: a ring of light opening out of the square the
       new piece is arriving on, bright enough for the bloom to catch */
    if (promoFlash > 0.01 && promoAt) {
      bindMesh(MESH_RING);
      drawMesh(MESH_RING, mModel(promoAt[0], 0.03, promoAt[1], 0.34 + promoFlash * 0.66, 0),
        th.selected, 0.75 * promoFlash, true, 0, 0, 3.4 + promoFlash * 4.0);
      bindMesh(MESH_DISC);
      drawMesh(MESH_DISC, mModel(promoAt[0], 0.026, promoAt[1], 0.30 + promoFlash * 0.46, 0),
        th.selected, 0.34 * promoFlash, true, 0, 0, 2.2);
    }
    /* light under a capture. Added rather than laid over, because it is
       light arriving on the wood: three discs stacked into a soft pool,
       well over white at the core so the bloom spreads it, and a ring
       running out across the square like the ripple of the blow. */
    if (R.impacts.length) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      for (var ii = R.impacts.length - 1; ii >= 0; ii--) {
        var im = R.impacts[ii], ia = Move.impactAt(nowMs - im.t0, im.power);
        if (!ia.live) { R.impacts.splice(ii, 1); continue; }
        var ix = sqX(im.sq), iz = sqZ(im.sq), ip = im.power, amt = ia.amount;
        bindMesh(MESH_DISC);
        drawMesh(MESH_DISC, mModel(ix, 0.024, iz, 0.62 + 0.30 * ip, 0), IMPACT_EDGE, 0.16 * amt, true, 0, 0, 1.4);
        drawMesh(MESH_DISC, mModel(ix, 0.026, iz, 0.40 + 0.18 * ip, 0), IMPACT_COL, 0.24 * amt, true, 0, 0, 2.0 + 1.6 * ip);
        drawMesh(MESH_DISC, mModel(ix, 0.028, iz, 0.20 + 0.08 * ip, 0), IMPACT_CORE, 0.45 * amt, true, 0, 0, 3.0 + 4.0 * ip);
        var ringFade = (1 - ia.ring) * Math.min(1, amt * 3);
        if (ringFade > 0.01) {
          bindMesh(MESH_RING);
          drawMesh(MESH_RING, mModel(ix, 0.03, iz, 0.28 + ia.ring * (0.50 + 0.62 * ip), 0),
            IMPACT_COL, 0.55 * ringFade, true, 0, 0, 2.6 + 2.0 * ip);
        }
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    /* the ring every landing leaves: thin, pale, gone in a quarter of a
       second, and bigger for a knight dropped from his hop or a king's
       weight than for a bishop's glide */
    if (R.lands.length) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      bindMesh(MESH_SOFTRING);
      for (var ln = R.lands.length - 1; ln >= 0; ln--) {
        var ld = R.lands[ln], la = Move.landRing(nowMs - ld.t0, ld.k);
        if (!la.live) { R.lands.splice(ln, 1); continue; }
        drawMesh(MESH_SOFTRING, mModel(ld.x, 0.022, ld.z, la.r, 0), LAND_COL, la.alpha, true, 0, 0, 1.5);
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    if (R.lines.length && root.Lines) {
      var lnow = performance.now();
      for (var ll = 0; ll < R.lines.length; ll++) drawLine(R.lines[ll], lnow, th);
    }
    gl.uniform1f(U.glow, 1);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    /* pieces */
    drawAllPieces(th);

    if (a && !animating) {
      R.board.set(a.after);
      R.anim = null;
      if (!REDUCED) R.lastAt = nowMs;
      if (a.done) { var cb = a.done; a.done = null; setTimeout(cb, 0); }
    }

    /* ---- pass three: the lens ---- */
    if (postOk) post(th);

    R.dirty = animating || moving || dropping || falling || lifting || R.impacts.length > 0 ||
              R.lands.length > 0 || R.lines.length > 0 || pulse.live || glowLive;
    /* a slow card, found out, steps down between moves rather than in
       the middle of one */
    if (!R.dirty) sampleEnd();
    return R.dirty;
  };

  /* Bright pass, two blurs, then one composite that does the whole
     grade: the colour fringe, the bloom, the vignette, the tone map and
     the grain, in that order, because that is the order a camera does
     them in. The blur runs at a quarter of the width, which is four
     times less work and — since it is a blur — no visible difference. */
  function post(th) {
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    var haveBloom = bloomOk && FX.bloom;
    if (haveBloom) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
      gl.viewport(0, 0, bloomA.w, bloomA.h);
      gl.useProgram(progBright);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, scene.tex);
      gl.uniform1i(UB.tex, 0);
      gl.uniform1f(UB.threshold, th.bloomCut);
      fullscreen(UB.aPos);

      gl.useProgram(progBlur);
      gl.uniform1i(UL.tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.fb);
      gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
      gl.uniform2f(UL.dir, 1 / bloomA.w, 0);
      fullscreen(UL.aPos);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
      gl.bindTexture(gl.TEXTURE_2D, bloomB.tex);
      gl.uniform2f(UL.dir, 0, 1 / bloomA.h);
      fullscreen(UL.aPos);
      /* the wide one: the tight bloom taken down again to an eighth of
         the width and blurred twice more, so a lamp's light reaches
         across the corner of the frame it hangs in */
      if (wideOk) {
        gl.viewport(0, 0, bloomC.w, bloomC.h);
        var pass = [[bloomD, bloomA], [bloomC, bloomD], [bloomD, bloomC], [bloomC, bloomD]];
        for (var wp = 0; wp < 4; wp++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, pass[wp][0].fb);
          gl.bindTexture(gl.TEXTURE_2D, pass[wp][1].tex);
          if (wp % 2 === 0) gl.uniform2f(UL.dir, 1 / bloomC.w, 0); else gl.uniform2f(UL.dir, 0, 1 / bloomC.h);
          fullscreen(UL.aPos);
        }
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(progComp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.uniform1i(UC.scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, haveBloom ? bloomA.tex : blankTex);
    gl.uniform1i(UC.bloom, 1);
    var haveWide = haveBloom && wideOk;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, haveWide ? bloomC.tex : blankTex);
    gl.uniform1i(UC.bloom2, 2);
    gl.uniform1f(UC.bloomAmt, haveBloom ? th.bloom * (haveWide ? 0.78 : 1) : 0);
    gl.uniform1f(UC.bloomAmt2, haveWide ? th.bloom * 0.55 : 0);
    gl.uniform1f(UC.vignette, th.vignette);
    gl.uniform1f(UC.grain, FX.grain ? th.filmGrain : 0);
    gl.uniform1f(UC.aberration, FX.aberration ? th.aberration : 0);
    gl.uniform1f(UC.time, (performance.now() % 10000) * 0.001);
    fullscreen(UC.aPos);
    gl.enable(gl.DEPTH_TEST);
  }

  R.destroy = function () {
    R.anim = null;
    freePieces();
    freeTarget(scene); freeTarget(bloomA); freeTarget(bloomB); freeTarget(bloomC); freeTarget(bloomD); freeTarget(shadowT);
    scene = bloomA = bloomB = bloomC = bloomD = shadowT = null;
    shadowSize = 0; postOk = bloomOk = false;
  };
  R.resize();
  return R;
}

var Gfx3D = { create: create, derive: derive };
if (typeof module !== "undefined" && module.exports) module.exports = Gfx3D;
else root.Gfx3D = Gfx3D;
})(typeof self !== "undefined" ? self : this);
