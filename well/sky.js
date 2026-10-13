/* sky.js — the backdrops: one shader for all ten worlds, and a painter for 2D.

   Everything behind the well is drawn here, and nothing in it is a picture.
   Each world is a few hundred instructions of GLSL that paint a scene from
   noise, distance and time — mist over water, light crawling over stone,
   rain through leaves — so the room ships no textures, works offline from
   the first visit, and can be any size without a single blurry pixel. The
   Canvas2D tier gets the same ten scenes as cached gradient layers with a
   handful of shapes moving over them: less detail, the same moods.

   ## One program, ten worlds

   A shader per world would mean ten programs to compile on the splash and a
   program switch on every crossfade. Instead there is one, and uA/uB
   say which worlds to draw. They are uniforms, so every pixel takes the same
   branch and the branch is close to free. A crossfade computes both scenes
   only while uMix is strictly between 0 and 1 — the other 99% of the time
   exactly one scene is drawn. gfx3d renders this into a quarter-resolution
   target at 30 Hz and upsamples it; the scenes are designed for that. Every
   shape is soft at the scale of a few target pixels, every star is a small
   Gaussian rather than a point, and nothing has a hard edge that would
   crawl as it moves between pixels. A backdrop that shimmers is worse than
   no backdrop.

   ## The rules every scene obeys

   Dark. The sky gradients all sit at or under a relative luminance of 0.05
   (Sky.luma, checked by tools/well-check.js), and the scenes are tuned so the
   mean of the whole frame stays under that too. Light comes from small
   things — a sun, a lantern, a reflection — never from the sky. That keeps
   every crossfade and every Quad response far below anything that could
   count as a flash.

   Slow. Every motif moves at 0.12 Hz or less: mist rises over minutes,
   bamboo sways at 0.08 Hz, the bell is struck about every quarter of a
   minute and its rings take most of one to cross the valley. The
   one deliberate exception is Tide, whose caustics swell with the music's
   two-bar wave (66 bpm, 7.27 s, so 0.14 Hz), because the light and the
   sound of the same sea should rise together. Nothing flickers: brightness
   changes are slower than a breath.

   Quiet around the well. uWell is the well's centre; a soft capsule
   around it dims the scene and turns its motifs down, so the pieces always
   read first and the scene happens around them.

   Composed for the screen it is on. On a wide screen the well stands in
   the middle of its world and the scenes are laid out around it. On a
   phone held upright the well covers nearly everything: what is left is a
   band above its mouth, a sliver either side and a strip under its foot.
   A sky composed for a wide screen puts its horizon, its sun and its ridge
   line behind the well there, and the player sees only a tint. So every
   scene places its horizon, its light and its one feature relative to the
   well's mouth when the screen is tall (uAnchor, uMouth): the sun rises
   just above the coping, the far ridge and its bell stand there, the
   aurora hangs over the hills along it, and the foreground of each world
   fills the slivers below. The quiet capsule stops at the coping on a
   phone, because the band above it is all the world there is to see.

   Few points of light. A sky full of evenly bright specks reads as noise,
   or as static, behind a game made of small bright shapes. The star
   fields hold about four in ten of what they first did, their brightness
   on a power law — most faint, a few bright, as a real sky is — and each
   star breathes on a cycle of ten seconds or more. The lanterns are fewer
   by about the same, in three clear depths.

   Safe. No lightning in the rain, no flames in the lanterns, no creatures in
   the pool. Danger cools and desaturates the scene gently — never red, never
   faster.

   ## The uniforms

     uRes      target size in pixels (for aspect and pixel size)
     uTime     seconds, the backdrop's own clock
     uA, uB    world index 0..9 (Worlds.list order); uMix 0 = A, 1 = B
     uReact    0..1, the envelope of the current world's Quad response
     uMotion   0..1, the player's motion setting: 1 full, about 0.5 gentle,
               0 a still image. The world's own motion (worlds.js) is
               applied inside, per scene, so a crossfade between a fast and a
               slow world never makes either jump. Change it in steps (it
               multiplies the clock), not as an animation.
     uDanger   0..1
     uTopA, uHorA, uTopB, uHorB   linear sky colours (Sky.uniforms)
     uWell     the well's centre in the target's uv, origin bottom-left as
               in gl_FragCoord (so v = 1 - cssY / cssH)
     uAnchor   0..1, how tall the screen is: 0 for anything wide or square,
               1 for a phone held upright. The scenes commit to the tall
               composition once it is clearly a phone (smoothstep 0.1..0.7).
     uMouth    the height of the top of the well's coping in the same uv:
               the line every scene's horizon sits on when the screen is
               tall. A renderer that sets neither gets the wide composition,
               so the shader runs as well without them as with them.

   uReact is an envelope, not a clock: the shader cannot know when the Quad
   happened, only how strong the response is now. So the responses that
   travel — a ring rolling, a falling star, a cluster of lanterns lifting —
   move on the backdrop's own clock, and the envelope only reveals them.
   Each comes from two emitters half a cycle apart whose windows (sin² and
   cos²) always add to one, so whenever a Quad lands there is exactly one
   travelling thing's worth of light to reveal, already in motion. The
   envelope it was designed for is Sky.react(age): a 0.6 s rise and a 2.4 s
   fall, about one slow breath. Snowfall's pause is the one response that
   leans on its exact shape: the snow's clock is held back by the rise read
   backwards, so under this envelope the snow stands still for the whole
   0.6 s rise and then catches up, a quarter faster, over the fall. Under
   another envelope it still slows and recovers; it never runs backwards.

   This file has to load in node (tools/well-check.js reads Sky.luma), so it
   touches the document only inside paint2D, which only runs in the page. */
(function (root) {
"use strict";

/* worlds.js loads first in the page; in node it is next door */
function worldsKit() {
  if (root.Worlds) return root.Worlds;
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    try { return require("./worlds.js"); } catch (e) { return null; }
  }
  return null;
}
var Worlds = worldsKit();
var WORLDS = Worlds ? Worlds.list : [];

/* ---------- colour ----------
   Hex in, linear light out. The exact sRGB curve rather than a 2.2 power:
   the difference is invisible in a bright colour and is most of the colour
   in a sky this dark, where the curve's linear toe is doing the work. */
function linear(hex) {
  var n = parseInt(String(hex || "#000000").replace("#", ""), 16) || 0;
  var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  for (var i = 0; i < 3; i++) {
    var v = c[i] / 255;
    c[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  return c;
}
/* WCAG relative luminance of a linear colour */
function luminance(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }

/* ---------- the shader's per-world constants ----------
   The scenes need more of each world than its sky — the sun is the key
   light, the aurora is the rim colour, the motes are the particle colour —
   and they need its speed. Rather than retype any of that in GLSL, the
   table is written into the source from worlds.js when this file loads, so
   changing a colour there changes it here, and there is no second copy to
   drift. A world that is missing (it never should be) falls back to a
   neutral grey light at a moderate speed rather than failing to compile. */
function glf(x) { return (+x || 0).toFixed(4); }
function glv(c) { return "vec3(" + glf(c[0]) + ", " + glf(c[1]) + ", " + glf(c[2]) + ")"; }
function worldTable() {
  var out = [];
  for (var i = 0; i < 10; i++) {
    var w = WORLDS[i];
    var key = w ? linear(w.key) : [0.6, 0.6, 0.6];
    var rim = w ? linear(w.rim) : [0.4, 0.4, 0.45];
    var par = w ? linear(w.particle.color) : [0.6, 0.6, 0.6];
    var mot = w && typeof w.motion === "number" ? w.motion : 0.7;
    out.push("const vec3 KEY" + i + " = " + glv(key) + ";");
    out.push("const vec3 RIM" + i + " = " + glv(rim) + ";");
    out.push("const vec3 PAR" + i + " = " + glv(par) + ";");
    out.push("const float MOT" + i + " = " + glf(mot) + ";");
  }
  return out.join("\n");
}

/* ---------- the vertex shader ----------
   One triangle that covers the screen, made from gl_VertexID alone: no
   buffer, no attribute, nothing to rebuild after a lost context. */
var VERT = [
  "#version 300 es",
  "precision highp float;",
  "out vec2 vUv;",
  "void main(){",
  "  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));",
  "  vUv = p;",
  "  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);",
  "}"
].join("\n");

/* ---------- shared pieces ----------
   Hashes without sine (sine hashes fall apart on some mobile GPUs at large
   arguments, and the clock only grows), value noise, and the few shapes
   every scene borrows. All of it highp: on Apple every precision is fp32
   anyway, and on the Android parts where mediump is fp16 a clock measured
   in thousands of seconds would quantise the motion into visible steps. */
var GLSL_COMMON = [
  /* the frame's composition. Every scene is handed fr: fr.x (AN) is how
     far the screen is a phone held upright (0 on anything wide, 1 on a tall
     phone), fr.y (MO) the height of the well's mouth. On a tall phone the well
     covers all but a band above its mouth and a sliver either side, so every
     scene moves its horizon, its light and its one feature up into that band:
     the world frames the well instead of hiding behind it. They travel as a
     parameter rather than as globals, which some compilers keep in memory.
     anchorY is a height in a scene: where the design puts it on a wide
     screen, and on a tall one that far above the mouth. */
  "#define anchorY(y, above) mix(y, MO + (above), AN)",
  "float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }",
  "float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }",
  "vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }",
  "float vnoise1(float x){ float i = floor(x), f = fract(x); return mix(hash11(i), hash11(i + 1.0), f * f * (3.0 - 2.0 * f)); }",
  "float vnoise(vec2 p){",
  "  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);",
  "  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));",
  "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
  "}",
  /* three octaves is the most any scene spends on texture */
  "float fbm3(vec2 p){ float s = 0.5 * vnoise(p); p = p * 2.03 + 17.17; s += 0.25 * vnoise(p); p = p * 2.01 + 31.31; s += 0.125 * vnoise(p); return s / 0.875; }",
  "float fbm1(float x){ return (0.5 * vnoise1(x) + 0.25 * vnoise1(x * 2.07 + 7.1) + 0.125 * vnoise1(x * 4.13 + 3.3)) / 0.875; }",
  /* a Gaussian bump. Written out rather than as pow(x, 2.0), because pow
     is undefined for a negative base in GLSL and on Metal it really does
     return nothing useful */
  "float gauss(float x){ return exp(-x * x); }",
  /* a smoothed triangle wave, 0..1 with period 1: as round as a sine to the
     eye wherever it only shapes a slow brightness, at a fraction of its cost */
  "float tri(float x){ float f = abs(fract(x) * 2.0 - 1.0); return f * f * (3.0 - 2.0 * f); }",
  "float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }",
  "mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }",
  /* the reveal window of a travelling response: sin² of its phase. Two
     emitters half a phase apart have windows that sum to exactly one. */
  "float win(float ph){ float s = sin(3.14159265 * ph); return s * s; }",
  /* distance to a segment, for birds, streaks and stems */
  "float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }",
  /* a field of soft points, one per cell, kept off the cell's edges so the
     Gaussian never gets clipped by its neighbour. r is in target pixels:
     never under ~1.3, which is what lets a point move without twinkling. */
  "float points(vec2 p, float scale, float density, float rpx, float px, float seed){",
  "  vec2 g = p * scale; vec2 id = floor(g); vec2 f = fract(g) - 0.5;",
  "  float on = step(1.0 - density, hash12(id + seed));",
  "  vec2 o = (hash22(id * 1.37 + seed) - 0.5) * 0.56;",
  "  float r = rpx * px * scale;",
  "  float b = 0.25 + 0.75 * hash12(id * 2.11 + seed + 5.0); b *= b;",
  "  vec2 d = f - o;",
  "  return on * b * exp(-dot(d, d) / (r * r));",
  "}",
  /* stars as a sky really has them: most faint, a few bright. Brightness
     follows a steep power of a uniform number (nine in ten at a quarter of the
     brightest or less), the bright ones a little larger, and each breathes on
     a slow wave of its own, never quicker than a tenth of a hertz, so it reads
     as air moving, not as flicker. */
  "float stars(vec2 p, float scale, float density, float rpx, float px, float seed, float t){",
  "  vec2 g = p * scale; vec2 id = floor(g); vec2 f = fract(g) - 0.5;",
  "  float h = hash12(id + seed);",
  "  vec2 k = hash22(id * 1.37 + seed);",
  "  float u = fract(h * 37.13 + k.x * 3.7);",
  "  float u2 = u * u, u4 = u2 * u2, u8 = u4 * u4;",
  "  float b = 0.08 + 0.92 * u8 * u8;",
  "  vec2 o = (k - 0.5) * 0.56;",
  "  float r = rpx * px * scale * (0.8 + 0.7 * b);",
  "  float tw = 0.7 + 0.6 * tri(t * (0.03 + 0.06 * k.y) + k.x);",
  "  vec2 d = f - o;",
  "  return step(1.0 - density, h) * b * tw * exp(-dot(d, d) / (r * r));",
  "}",
  /* a leaf in its own frame: x runs from the stem (0) to the tip (len),
     y across. Not an exact distance, but its zero line is the leaf's edge
     and its slope is close enough to one that a smoothstep over a couple of
     pixels gives a clean soft edge. */
  "float leafD(vec2 p, float len, float wid){",
  "  float u = clamp(p.x / len, 0.0, 1.0);",
  "  float w = wid * pow(max(sin(3.14159265 * u), 0.0), 0.7) * (1.0 - 0.35 * u);",
  "  return max(max(abs(p.y) - w, -p.x), p.x - len);",
  "}",
  /* a spray of five leaves from one point, swaying together. Returns the
     coverage, and in rim how close the pixel is to a lit upper edge. */
  "float spray(vec2 q, vec2 o, float a0, float spread, float len, float wid, float sway, float soft, float seed, out float rim){",
  "  vec2 d = q - o;",
  "  rim = 0.0;",
  "  if (dot(d, d) > len * len * 1.4) return 0.0;",
  "  float cov = 0.0;",
  "  for (int k = 0; k < 5; k++){",
  "    float fk = float(k);",
  "    float h = hash11(fk * 3.7 + seed);",
  "    float a = a0 + (fk - 2.0) * spread + sway * (0.7 + 0.15 * fk) + (h - 0.5) * 0.3;",
  "    vec2 dir = vec2(cos(a), sin(a));",
  "    vec2 lp = vec2(dot(d, dir), dot(d, vec2(-dir.y, dir.x)));",
  "    float L = len * (0.62 + 0.38 * h);",
  /* the leaf droops a little along its length, the way a wet leaf does */
  "    lp.y += 0.22 * lp.x * lp.x / L * sign(dir.x + 0.001);",
  "    float sd = leafD(lp, L, wid * (0.8 + 0.4 * h));",
  "    float c = 1.0 - smoothstep(-soft, soft, sd);",
  "    cov = max(cov, c);",
  "    rim = max(rim, c * smoothstep(-soft * 4.0, 0.0, sd) * step(0.0, lp.y));",
  "  }",
  "  return cov;",
  "}"
].join("\n");

/* ---------- 1 · Dawn ----------
   A lake at first light. The sky is the brief's indigo to mauve; the sun
   sits just above the horizon, beside the well on a wide screen and on a
   phone just above the coping, a little left of the well's middle, clear
   of the Keep and of the piece waiting on the rim, as a small pale disc in
   a wide warm bloom. Mist
   lies in bands over the water and lifts off it, thinning as it rises. A
   few birds glide across very far off, wings held, so there is life in the
   scene without anything that flaps. For a Quad the mist parts around the
   well for one breath and the sun comes through. */
var GLSL_DAWN = [
  /* a far bird, wings held: two short strokes per wing, bent at the elbow,
     the elbow lifting and settling as the bird soars */
  "float bird(vec2 d, float sz, float lift){",
  "  vec2 a = vec2(abs(d.x), d.y);",
  "  vec2 elbow = vec2(0.42 * sz, sz * (0.16 + 0.30 * lift));",
  "  vec2 tip = vec2(sz, sz * (0.0 + 0.20 * lift));",
  "  return min(seg(a, vec2(0.0), elbow), seg(a, elbow, tip));",
  "}",
  /* the dawn sky at a height above the horizon: shared by the sky and its
     reflection, so the water always agrees with what is above it */
  "vec3 dawnSky(float y, float dx, float hz, vec3 top, vec3 hor){",
  "  vec3 s = mix(hor, top, pow(smoothstep(hz - 0.01, 1.0, y), 0.55));",
  "  float lift = y - hz;",
  "  s += KEY0 * 0.020 * exp(-lift / 0.07) * (0.35 + 0.65 * exp(-dx / 0.45));",
  "  s += vec3(0.020, 0.004, 0.012) * gauss((lift - 0.13) / 0.11) * exp(-dx / 0.9);",
  "  return s;",
  "}",
  "vec3 dawn(vec2 q, float asp, float px, float calm, float wx, float t, float r, vec3 top, vec3 hor, vec2 fr){",
  "  float AN = fr.x, MO = fr.y;",
  "  float mk = 1.0 - 0.35 * calm;",
  /* on a tall phone the horizon lies just above the coping and the sun
     sits on it a little left of the well's middle, clear of the Keep and of
     the piece waiting on the rim; everything that hangs above the horizon is
     pulled down by vs so it fits the band */
  "  float hz = anchorY(0.27, 0.024);",
  "  float vs = mix(1.0, 0.42, AN);",
  "  float sx = mix(min(0.55, 0.5 * asp - 0.12), wx - 0.045, AN);",
  "  vec2 sp = vec2(sx, hz + 0.032);",
  "  float dx = abs(q.x - sx);",
  "  vec3 c;",
  "  if (q.y >= hz){",
  "    c = dawnSky(q.y, dx, hz, top, hor);",
  /* high thin cloud, catching the light from below before anything else
     does: rose on the sun's side, fading to nothing overhead */
  "    float cl = fbm3(vec2(q.x * 0.55 + t * 0.003, q.y * 13.0 + q.x * 0.6));",
  "    cl = smoothstep(0.52, 0.86, cl) * gauss((q.y - anchorY(0.60, 0.085)) / (0.15 * vs));",
  "    vec3 cloudCol = c * 1.25 + vec3(0.030, 0.010, 0.016) * (0.4 + 0.6 * exp(-dx / 0.6)) + KEY0 * 0.012 * exp(-dx / 0.35);",
  "    c = mix(c, cloudCol, cl * 0.8 * mk);",
  /* the sun: a small pale disc, not a white hole — its brightness lives in
     the wide warm bloom around it, which brightens a little for a Quad */
  "    float dist = length(q - sp);",
  /* on a phone the band above the mouth is small, so the sun is too */
  "    float sr = mix(0.016, 0.0125, AN);",
  "    float disc = 1.0 - smoothstep(sr - 1.5 * px, sr + 1.5 * px, dist);",
  "    disc *= smoothstep(hz, hz + 0.010, q.y);",
  "    float bloom = exp(-dist / 0.032) * 0.22 + exp(-dist / 0.13) * 0.07;",
  "    c += KEY0 * (bloom * (1.0 + 0.3 * r) * mk + disc * mix(0.50, 0.40, AN));",
  /* a far shore: low islands along the horizon, the darkest thing in the
     scene, and what the mist will lie in front of */
  "    float isl = smoothstep(0.42, 0.62, vnoise1(q.x * 1.3 + 4.0));",
  "    float shore = hz + 0.004 + (0.010 + 0.016 * fbm1(q.x * 6.0 + 2.0)) * isl;",
  "    float sc = 1.0 - smoothstep(shore - px, shore + px, q.y);",
  "    c = mix(c, top * 0.55 + hor * 0.30, sc * 0.85);",
  "  } else {",
  /* the water: the sky at the mirrored height, darker, with the sun laid
     on it as a column broken into slow bands. The bands drift at a few
     hundredths of a hertz; anything quicker would read as glitter. */
  "    float depth = hz - q.y;",
  "    c = dawnSky(hz + depth, dx, hz, top, hor) * max(0.60 - 0.55 * depth, 0.22);",
  "    float col = gauss((q.x - sx) / (0.012 + depth * 0.30));",
  "    float bands = 0.5 + 0.5 * sin(0.9 / (depth + 0.06) - t * 0.35 + vnoise1(q.x * 14.0 + depth * 5.0) * 2.0);",
  "    bands = mix(0.6, bands, smoothstep(0.0, 0.03, depth));",
  "    c += KEY0 * col * bands * 0.11 * exp(-depth / 0.10) * mk;",
  "    c += KEY0 * 0.010 * exp(-depth / 0.012);",
  "  }",
  /* the mist: horizontal bands of noise rising slowly, densest where it
     lies on the water and thinning as it lifts, lit warm on the sun's side */
  "  float mn = fbm3(vec2(q.x * 0.9 + t * 0.005, (q.y - t * 0.004) * 9.0));",
  "  float m = smoothstep(0.40, 0.78, mn);",
  /* a low bank lies along the horizon itself, veiling the far shore and
     the foot of the sun; above it the bands lift and thin. One noise serves
     both, read at two thresholds. */
  "  float bank = smoothstep(0.28, 0.70, mn) * gauss((q.y - hz - 0.012) / 0.03);",
  "  float dens = max(bank, m * (gauss((q.y - hz - 0.05 * vs) / (0.08 * vs)) * 0.80 + gauss((q.y - hz - 0.22 * vs) / (0.13 * vs)) * 0.40));",
  "  float part = gauss((q.x - wx) / 0.30);",
  "  dens *= 1.0 - 0.85 * r * part;",
  "  vec3 mistCol = hor * 1.45 + KEY0 * (0.010 + 0.07 * exp(-dx / 0.30) * exp(-abs(q.y - sp.y) / 0.12));",
  "  c = mix(c, mistCol, dens * 0.72);",
  /* the birds: four, gliding left to right across the whole width once in
     a minute and a half, elbows flexing at a tenth of a hertz */
  "  float span = 0.5 * asp + 0.12;",
  "  float bx = mix(-span, span, fract(t / 95.0 + 0.62));",
  "  float by = anchorY(0.45, 0.060);",
  "  float bd = 1.0;",
  "  for (int i = 0; i < 4; i++){",
  "    float fi = float(i);",
  "    vec2 o = vec2(bx - fi * 0.030 - 0.005 * fi * fi, by + 0.012 * sin(fi * 2.3) - fi * 0.006 + 0.012 * tri(t * 0.0334 + fi * 0.159) - 0.006);",
  "    float lift = tri(t * 0.0955 + fi * 0.27);",
  "    bd = min(bd, bird(q - o, 0.0080 - fi * 0.0005, lift));",
  "  }",
  "  float bc = 1.0 - smoothstep(0.5 * px, 1.5 * px, bd);",
  "  c = mix(c, top * 0.45, bc * 0.6 * mk);",
  "  return c;",
  "}"
].join("\n");

/* ---------- 2 · Tide ----------
   Shallow water over a floor of sea-glass stone, the floor laid out in
   perspective so the light on it shrinks toward a hazy distance. The
   caustics are the edges of a moving Voronoi diagram — where two cells
   meet is where the curved surface above focuses the light — taken twice
   at different scales so the network crawls in two directions at once. The
   whole field swells with the music's two-bar wave. For a Quad, a ring of
   light rolls out across the floor, brightening the caustics it passes. */
var GLSL_TIDE = [
  /* the edges of a Voronoi diagram whose points wander on slow circles:
     F2 - F1 is zero exactly where two cells meet, which is where a curved
     water surface focuses light into lines */
  "float cellEdge(vec2 p, float t){",
  "  vec2 i = floor(p), f = fract(p);",
  "  float d1 = 8.0, d2 = 8.0;",
  "  for (int y = -1; y <= 1; y++){",
  "    for (int x = -1; x <= 1; x++){",
  "      vec2 g = vec2(float(x), float(y));",
  "      vec2 h = hash22(i + g);",
  /* each point swings on a smoothed triangle wave rather than a sine: the
     same slow back-and-forth, and this loop runs twenty-seven times a pixel */
  "      vec2 w = abs(fract(t * (0.30 + 0.25 * h.yx) * 0.15915 + h) * 2.0 - 1.0);",
  "      vec2 o = 0.14 + 0.72 * w * w * (3.0 - 2.0 * w);",
  "      vec2 v = g + o - f;",
  "      float d = dot(v, v);",
  "      if (d < d1){ d2 = d1; d1 = d; } else if (d < d2){ d2 = d; }",
  "    }",
  "  }",
  "  return sqrt(d2) - sqrt(d1);",
  "}",
  "vec3 tide(vec2 q, float asp, float px, float calm, vec2 wq, float t, float tu, float r, vec3 top, vec3 hor, vec2 fr){",
  "  float AN = fr.x, MO = fr.y;",
  "  float mk = 1.0 - 0.35 * calm;",
  /* on a tall phone the floor's horizon drops behind the top of the well
     and the surface's comes down to the coping, so the band above the mouth
     is the bright ceiling of the sea and the slivers beside and below the
     well are the near floor */
  "  float hz = anchorY(0.60, -0.05);",
  /* 66 bpm, two bars of four: 7.27 s, with the music's swell. It runs on
     the player's motion setting only, not the world's, so it stays with the
     sound. */
  "  float sw = 6.2831853 * tu / 7.2727;",
  "  vec3 c = mix(hor, top, pow(smoothstep(0.0, 1.0, q.y), 0.8));",
  /* both planes are laid out before any branch: screen-space derivatives
     are only defined where every pixel of a 2x2 quad runs the same code, and
     the horizon of each plane cuts straight through quads */
  "  float sy = anchorY(0.78, 0.004);",
  "  float h = max(q.y - sy, 0.002);",
  /* on a phone the ceiling is all the sky there is, so it is brought
     nearer: its light reads as a wrinkled surface rather than a far haze */
  "  float zc = 0.15 / h * mix(1.0, 0.45, AN);",
  "  vec2 cp = vec2(q.x * zc, zc) * 1.5 + vec2(t * 0.020, t * 0.012);",
  "  float fwc = fwidth(cp.y) * 1.7;",
  "  float depth = max(hz - q.y, 0.002);",
  "  float z = 0.30 / depth;",
  "  vec2 fp = vec2(q.x * z, z) * 1.7;",
  "  float fw = fwidth(fp.y) * 3.3;",
  /* the surface overhead, seen from below: a wrinkled ceiling of light
     receding to its own horizon, brightest where it is nearest */
  "  if (q.y > sy){",
  "    float e = cellEdge(cp * 1.7, t * 1.2 + 5.0);",
  "    float lines = 1.0 - smoothstep(0.0, 0.20 + fwc * 2.5, e);",
  "    float fade = 1.0 - smoothstep(0.15, 0.7, fwc * 5.0);",
  "    float near = smoothstep(0.0, mix(0.16, 0.07, AN), q.y - sy);",
  "    c += mix(RIM1, KEY1, 0.5) * (0.006 + lines * mix(0.030, 0.040, AN) * fade) * near * (0.85 + 0.15 * sin(sw)) * mk;",
  "  }",
  /* the floor: stone and sand in perspective, fogging toward the blue */
  "  if (q.y < hz){",
  "    fp += vec2(0.05, 0.025) * sin(sw + 1.2);",
  "    float e1 = cellEdge(fp * 2.2 + vec2(t * 0.03, 0.0), t);",
  "    float e2 = cellEdge(fp * 3.3 * rot(0.7) + vec2(0.0, t * 0.025) + 7.0, t * 1.13 + 3.0);",
  /* thin lines far away would alias at a quarter of the screen's
     resolution, so the lines widen and fade as the cells shrink */
  "    float c1 = 1.0 - smoothstep(0.0, 0.14 + fw * 2.0, e1);",
  "    float c2 = 1.0 - smoothstep(0.0, 0.16 + fw * 3.0, e2);",
  "    float caus = c1 * 0.55 + c1 * c2 * 0.9 + c2 * 0.18;",
  "    float fog = exp(-(z - 0.5) * 0.55);",
  "    float fade = 1.0 - smoothstep(0.25, 0.9, fw * 6.0);",
  /* the swell rolls in toward the viewer: a slow crest of brighter light
     crossing the floor once every two bars */
  "    float crest = 0.5 + 0.5 * sin(sw + z * 1.3);",
  /* the ring: two emitters half a cycle apart, each rolling out from just
     below the well across the floor, revealed by the response envelope */
  "    float ring = 0.0;",
  "    vec2 rc = vec2(wq.x * 0.625, 0.625) * 1.7;",
  "    for (int k = 0; k < 2; k++){",
  "      float ph = fract(t / 3.4 + 0.5 * float(k));",
  "      float rad = 0.1 + 3.4 * ph;",
  "      float rd = length(fp - rc);",
  "      ring += win(ph) * gauss((rd - rad) / (0.30 + 0.30 * ph)) * (1.0 - 0.5 * ph);",
  "    }",
  "    ring *= r;",
  "    vec3 floorCol = hor * (1.05 + 0.35 * (vnoise(fp * 1.2) - 0.5)) + RIM1 * 0.004;",
  "    vec3 fc = mix(c, floorCol, fog);",
  "    float gain = (0.55 + 0.45 * crest) * fog * fade * mk;",
  "    fc += mix(RIM1, KEY1, 0.4) * caus * 0.075 * gain * (1.0 + 2.5 * ring);",
  "    fc += mix(RIM1, KEY1, 0.6) * ring * 0.060 * fog;",
  "    c = mix(c, fc, smoothstep(0.0, 0.03, depth));",
  "  }",
  "  return c;",
  "}"
].join("\n");

/* ---------- 3 · Rain on Leaves ----------
   Night under a canopy. Far leaves hang in the fog, soft and pale; near
   ones are dark silhouettes that frame the edges of the screen with a thin
   rim of light, all swaying at a few hundredths of a hertz. The rain is two
   layers of long, faint streaks, slanted a little by the wind: fixed in
   their columns, so they never shimmer sideways, and too faint to read as
   anything but rain. There is no lightning — not as a flash, not as a
   brightening, not ever. For a Quad the near leaves shed their water. */
var GLSL_RAIN = [
  /* one layer of rain: a streak per slanted column, each column on its own
     period and speed. The column never moves sideways, so the streaks cannot
     shimmer, and each streak fades in at its head and out along its tail. */
  "float rainL(vec2 q, float t, float cols, float speed, float len, float seed, float px){",
  "  vec2 p = q;",
  "  p.x += p.y * 0.12;",
  "  float cx = floor(p.x * cols);",
  "  float h = hash11(cx * 1.37 + seed);",
  "  float fx = (fract(p.x * cols) - 0.5 - (h - 0.5) * 0.5) / cols;",
  "  float period = len * (2.0 + 2.5 * hash11(cx * 2.9 + seed));",
  "  float y = p.y + t * speed * (0.85 + 0.3 * h) + h * 11.0;",
  "  float along = fract(y / period) * period / len;",
  "  float body = smoothstep(0.0, 0.12, along) * (1.0 - smoothstep(0.35, 1.0, along)) * step(along, 1.0);",
  "  float w = 1.1 * px;",
  "  return body * exp(-fx * fx / (w * w)) * step(0.3, hash11(cx * 5.3 + seed));",
  "}",
  "vec3 rain(vec2 q, float asp, float px, float calm, float t, float r, vec3 top, vec3 hor, vec2 fr){",
  "  float AN = fr.x, MO = fr.y;",
  "  float mk = 1.0 - 0.35 * calm;",
  "  float e = 0.5 * asp;",
  /* leaves are sized for a wide screen; on a phone they shrink, so they
     frame the well instead of covering it */
  "  float s = clamp(asp * 1.25, 0.62, 1.0);",
  "  vec3 c = mix(hor, top, pow(smoothstep(0.0, 1.0, q.y), 0.7));",
  /* the fog glows a little where the light comes from, low and far */
  "  float fogN = vnoise(vec2(q.x * 1.6 + t * 0.012, q.y * 2.5));",
  /* on a tall phone that glow lies just above the coping, behind the near
     sprays, so the band above the mouth is the lit gap in the canopy */
  "  c += hor * (0.30 + 0.25 * fogN) * gauss((q.y - anchorY(0.36, 0.03)) / mix(0.30, 0.10, AN));",
  "  float rimF;",
  "  float sw = sin(t * 0.32);",
  "  float far = spray(q, vec2(-e - 0.05, 0.84), -0.30, 0.42, 0.42 * s, 0.055 * s, sw * 0.03, 0.016, 1.0, rimF);",
  "  far = max(far, spray(q, vec2(e + 0.06, 0.66), 3.50, 0.40, 0.40 * s, 0.050 * s, -sw * 0.03, 0.016, 2.0, rimF));",
  "  far = max(far, spray(q, vec2(-0.12 * s, 1.14), -1.35, 0.50, 0.36 * s, 0.050 * s, sw * 0.025, 0.018, 3.0, rimF));",
  "  c = mix(c, c * 0.50 + top * 0.20, far * 0.70);",
  "  float rf = rainL(q, t, 64.0, 0.20, 0.10, 3.0, px);",
  "  float rn = rainL(q, t, 30.0, 0.34, 0.16, 9.0, px * 1.4);",
  "  c += KEY2 * (rf * 0.020 + rn * 0.034) * mk;",
  /* the near leaves, darkest, with a hair of light along their upper edges */
  "  float sn = sin(t * 0.41 + 1.3);",
  "  float r1, r2, r3, r4;",
  "  float n1 = spray(q, vec2(-e - 0.02, 1.02), -0.55, 0.38, 0.30 * s, 0.042 * s, sn * 0.05, 0.004, 11.0, r1);",
  "  float n2 = spray(q, vec2(e + 0.02, 0.96), 3.75, 0.36, 0.28 * s, 0.040 * s, -sn * 0.05, 0.004, 12.0, r2);",
  "  float n3 = spray(q, vec2(e + 0.04, 0.40), 3.05, 0.40, 0.25 * s, 0.038 * s, sn * 0.04, 0.004, 13.0, r3);",
  "  float n4 = spray(q, vec2(-e - 0.04, 0.22), 0.15, 0.40, 0.24 * s, 0.036 * s, -sn * 0.04, 0.004, 14.0, r4);",
  "  float near = max(max(n1, n2), max(n3, n4));",
  "  float rimN = max(max(r1, r2), max(r3, r4));",
  "  c = mix(c, top * 0.30, near);",
  "  c += RIM2 * rimN * 0.016;",
  /* the Quad: short bright drops falling from beneath the near sprays.
     They fall on the backdrop's clock; the envelope only lets them be seen. */
  "  if (r > 0.001){",
  "    float under = gauss((q.x + e) / (0.22 * s)) * smoothstep(0.35, 0.95, q.y) + gauss((q.x - e) / (0.22 * s)) * smoothstep(0.15, 0.9, q.y);",
  "    float drops = rainL(q + vec2(0.0, 0.3), t * 1.6, 44.0, 0.55, 0.035, 21.0, px * 1.3);",
  "    c += KEY2 * drops * under * r * 0.10 * (1.0 - near);",
  "  }",
  "  return c;",
  "}"
].join("\n");

/* ---------- 4 · Bamboo Grove ----------
   Three depths of stalks: a far rank pale with fog, a middle rank, and a
   few near stalks dark against the light. Every stalk sways at 0.08 Hz,
   bending more the higher it goes, each with its own phase so the grove
   moves like a grove rather than a metronome. Light comes in from the
   upper left in broad shafts that drift in strength over half a minute.
   For a Quad a gust crosses the screen and each stalk leans as it passes. */
var GLSL_BAMBOO = [
  /* the brief's 0.08 Hz, in seconds of real time at full motion: the
     world's own motion scale is divided back out of the sway, so it slows
     the rest of the grove but never the stalks */
  "#define SWAY (0.50265 / MOT3)",
  /* one stalk of a rank: column id, its lean on its own 0.08 Hz sine,
     bending more the higher it goes, plus whatever gust is
     passing. Returns coverage; a is the position across the stalk (-1 left
     edge, +1 right) for shading, node the ring where two segments meet. */
  "float stalk(float id, vec2 q, float t, float cell, float wmin, float wmax, float sway, float seed, float px, float gx, float gust, float keep, out float a, out float node){",
  "  float h = hash11(id * 1.31 + seed);",
  "  float x0 = (id + 0.3 + 0.4 * h) * cell;",
  "  float yy = clamp(q.y + 0.1, 0.0, 1.3);",
  "  float lean = sway * sin(t * SWAY + h * 6.2831) + (h - 0.5) * 0.03;",
  "  lean += gust * gauss((x0 - gx) / 0.30);",
  "  float xc = x0 + lean * yy * yy;",
  "  float w = mix(wmin, wmax, hash11(id * 2.77 + seed));",
  "  float dx = q.x - xc;",
  "  float cov = 1.0 - smoothstep(w - px, w + px, abs(dx));",
  "  cov *= step(1.0 - keep, hash11(id * 3.19 + seed));",
  "  a = clamp(dx / w, -1.0, 1.0);",
  "  float segL = 0.15 + 0.07 * h;",
  "  float ny = fract((q.y + h * 3.0) / segL);",
  "  float sd = (ny < 0.5 ? ny : ny - 1.0) * segL;",
  "  float nw = 1.4 * px;",
  "  node = gauss(sd / nw) - 0.6 * gauss((sd - 2.4 * nw) / nw);",
  "  return cov;",
  "}",
  /* a rank of stalks. A leaning stalk can cross into the next column, so
     the column is found from where the pixel would be without the gust's lean,
     and its nearer neighbour is asked too: no stalk is ever cut off by the
     edge of its own cell, however hard the wind blows. */
  "float stalks(vec2 q, float t, float cell, float wmin, float wmax, float sway, float seed, float px, float gx, float gust, float keep, out float a, out float node){",
  "  float yy = clamp(q.y + 0.1, 0.0, 1.3);",
  "  float u = (q.x - gust * gauss((q.x - gx) / 0.30) * yy * yy) / cell;",
  "  float id0 = floor(u);",
  "  float id1 = id0 + (fract(u) < 0.5 ? -1.0 : 1.0);",
  "  float a1, n1;",
  "  float c0 = stalk(id0, q, t, cell, wmin, wmax, sway, seed, px, gx, gust, keep, a, node);",
  "  float c1 = stalk(id1, q, t, cell, wmin, wmax, sway, seed, px, gx, gust, keep, a1, n1);",
  "  if (c1 > c0){ a = a1; node = n1; return c1; }",
  "  return c0;",
  "}",
  "vec3 bamboo(vec2 q, float asp, float px, float calm, float t, float r, vec3 top, vec3 hor, vec2 fr){",
  "  float AN = fr.x, MO = fr.y;",
  "  float mk = 1.0 - 0.35 * calm;",
  "  float e = 0.5 * asp;",
  "  float s = clamp(asp * 1.25, 0.62, 1.0);",
  "  vec3 c = mix(hor, top, pow(smoothstep(0.0, 1.05, q.y), 0.75));",
  /* the grove is backlit: a pale fog low in the middle distance, so every
     stalk stands against something lighter than itself */
  "  c += hor * 0.60 * gauss((q.y - anchorY(0.28, 0.025)) / mix(0.26, 0.10, AN)) * (0.85 + 0.15 * vnoise(vec2(q.x * 2.0 + t * 0.01, q.y * 3.0)));",
  /* the gust: two emitters half a cycle apart, crossing left to right */
  "  float gx = 0.0;",
  "  for (int k = 0; k < 2; k++){",
  "    float ph = fract(t / 4.2 + 0.5 * float(k));",
  "    gx += win(ph) * mix(-e - 0.3, e + 0.3, ph);",
  "  }",
  "  float gust = 0.10 * r;",
  "  float a, nd;",
  /* the far rank: thin, only a little darker than the fog they stand in */
  /* fewer than a real grove would hold: every stalk is a vertical line
     beside a well of columns, so the ranks are thinned until the grove reads
     as depth and light rather than as a second grid */
  "  float f = stalks(q, t, 0.10, 0.0045, 0.0075, 0.010, 1.0, px, gx, gust * 0.5, 0.62, a, nd);",
  "  vec3 farCol = c * 0.66 + RIM3 * 0.003 * (1.0 - a);",
  /* behind the well the stalks fade further than the other motifs do:
     they are vertical lines, and vertical lines behind a grid of columns are
     the one thing here that could be mistaken for part of the game */
  "  c = mix(c, farCol, f * 0.85 * (1.0 - 0.4 * calm));",
  /* the light, slanting in from the upper left between the far rank and
     the middle one, each shaft drifting in strength over half a minute */
  "  vec2 bd = normalize(vec2(0.42, -1.0));",
  "  float u = dot(q - vec2(-e, 1.0), vec2(-bd.y, bd.x));",
  "  float beams = 0.0;",
  "  for (int k = 0; k < 3; k++){",
  "    float fk = float(k);",
  "    float uk = (0.16 + 0.31 * fk) * 2.0 * e + 0.06 + 0.03 * sin(t * 0.05 + fk * 2.0);",
  "    float wk = (0.035 + 0.015 * fk) * clamp(2.0 * e, 0.6, 1.4);",
  "    beams += gauss((u - uk) / wk) * (0.5 + 0.5 * vnoise1(t * 0.035 + fk * 7.0));",
  "  }",
  "  beams *= smoothstep(-0.1, 0.9, q.y);",
  "  c += mix(KEY3, RIM3, 0.25) * beams * 0.034 * mk;",
  /* the middle rank: rounded by the light from the left, ringed at the nodes */
  "  float m = stalks(q, t, 0.20, 0.010, 0.016, 0.016, 7.0, px, gx, gust * 0.8, 0.55, a, nd);",
  "  float sh = 0.55 + 0.45 * sqrt(max(0.0, 1.0 - a * a)) - 0.2 * a;",
  "  float lit = smoothstep(-0.95, -0.6, a) * (1.0 - smoothstep(-0.6, -0.25, a));",
  "  vec3 midCol = (hor * 0.40 + top * 0.30) * sh + KEY3 * 0.020 * lit - hor * 0.16 * max(nd, 0.0) + KEY3 * 0.008 * max(-nd, 0.0);",
  "  c = mix(c, midCol, m * (1.0 - 0.6 * calm));",
  /* the near rank: a few dark stalks with a thin lit edge */
  "  float n = stalks(q, t, 0.48, 0.022, 0.034, 0.020, 13.0, px, gx, gust, 0.70, a, nd);",
  "  sh = 0.55 + 0.45 * sqrt(max(0.0, 1.0 - a * a)) - 0.2 * a;",
  "  lit = smoothstep(-0.97, -0.75, a) * (1.0 - smoothstep(-0.75, -0.45, a));",
  "  vec3 nearCol = top * (0.30 + 0.40 * sh) + KEY3 * 0.014 * lit - top * 0.25 * max(nd, 0.0);",
  "  c = mix(c, nearCol, n * (1.0 - 0.65 * calm));",
  /* leaves at the top corners, narrow and pointed */
  "  float rl;",
  "  float sl = sin(t * SWAY + 0.7);",
  "  float lv = spray(q, vec2(-e - 0.03, 1.04), -0.35, 0.30, 0.22 * s, 0.016 * s, sl * 0.04, 0.003, 31.0, rl);",
  "  lv = max(lv, spray(q, vec2(e + 0.03, 1.02), 3.55, 0.30, 0.22 * s, 0.016 * s, -sl * 0.04, 0.003, 32.0, rl));",
  "  lv = max(lv, spray(q, vec2(-0.25 * e, 1.10), -1.75, 0.32, 0.18 * s, 0.014 * s, sl * 0.03, 0.003, 33.0, rl));",
  "  c = mix(c, top * 0.35, lv);",
  "  return c;",
  "}"
].join("\n");

/* ---------- 5 · Aurora ----------
   A clear polar night: quiet stars, a low line of dark hills, and two
   curtains of aurora. Each curtain is a lit lower edge that folds slowly
   across the sky, gathering and thinning along its length, with a long
   tail rising from it, combed into vertical rays, green at the edge and
   violet at the top — and dim, because the real thing is dim and so is
   everything here. The curtain is made only of smooth waves and
   exponentials:
   an earlier one combed its rays with value noise and drew its edge two
   pixels sharp, and at a third of the screen's resolution that showed as
   blocks. This one has no lattice to show and no edge under three pixels
   of the target, so stretched to the screen it stays silk, and it costs
   no more than the one it replaced, so it needs no baked texture. For a
   Quad a third, brighter ribbon unfurls across the top of the sky and
   fades. */
var GLSL_AURORA = [
  /* one curtain of aurora: a lower edge that wanders in slow folds, lit
     where it is lowest, with a long tail rising from it combed into rays. It
     is built only from smooth periodic waves and exponentials, with no edge
     sharper than a few pixels of the target: no noise lattice to show its
     cells, so drawn at a third of the screen and stretched, the curtain stays
     silk rather than steps. Green where it is lowest and brightest, violet where the tail thins.
     tall scales the tail, so a curtain fits the band above a phone's well. */
  "vec3 curtain(vec2 q, float t, float y0, float tall, float seed, float px){",
  "  float x = q.x;",
  "  float a1 = x * 2.9 + t * 0.050 + seed;",
  "  float s1 = sin(a1), c1 = cos(a1), s2 = sin(x * 6.1 - t * 0.070 + seed * 1.7);",
  "  float yc = y0 + (0.048 * s1 + 0.022 * s2) * tall;",
  /* where the sheet turns toward us it is seen edge-on, and brighter; and
     along its length it gathers and thins, so it is never one even band. The
     slow shapings are triangle waves, the folds the only true sines. */
  "  float fold = 0.5 + 0.5 * (0.62 * s1 + 0.78 * c1) * (0.75 + 0.25 * s2);",
  "  float seg = 0.3 + 0.7 * smoothstep(0.15, 0.85, 0.62 * tri(x * 0.18 + t * 0.005 + seed * 0.37) + 0.38 * tri(x * 0.43 - t * 0.003 + seed * 0.16));",
  /* the rays bend with the folds; two incommensurate waves never repeat */
  "  float rx = x * 5.4 + 0.4 * s1 + seed * 0.48;",
  "  float rays = 0.30 + 0.70 * tri(rx) * (0.45 + 0.55 * tri(rx * 1.618 + t * 0.008 + 0.2));",
  "  float dy = q.y - yc;",
  "  float soft = max(0.016, 4.0 * px);",
  "  float under = exp(-dy * dy / (soft * soft));",
  "  float up = max(dy, 0.0);",
  "  float tail = exp(-up / (tall * (0.08 + 0.07 * fold))) * (0.50 + 0.50 * exp(-up / (0.030 * tall)));",
  "  float body = dy < 0.0 ? under : tail;",
  "  vec3 col = mix(RIM4, vec3(0.32, 0.15, 0.80), smoothstep(0.02 * tall, 0.24 * tall, dy));",
  "  return col * body * rays * (0.3 + 0.7 * fold) * seg;",
  "}",
  "vec3 aurora(vec2 q, float asp, float px, float calm, float t, float r, vec3 top, vec3 hor, vec2 fr){",
  "  float AN = fr.x, MO = fr.y;",
  "  float mk = 1.0 - 0.35 * calm;",
  "  float e = 0.5 * asp;",
  /* on a tall phone the hills run along the coping and the curtains hang
     just above them, their tails cut to the band above the mouth */
  "  float tall = mix(1.0, 0.5, AN);",
  "  float hill0 = anchorY(0.085, -0.022);",
  "  vec3 c = mix(hor, top, pow(smoothstep(hill0 - 0.03, 1.0, q.y), 0.8));",
  "  float st = stars(q, 38.0, 0.26, 1.35, px, 1.0, t) + stars(q, 74.0, 0.13, 1.25, px, 4.0, t) * 0.7;",
  "  c += vec3(0.85, 0.9, 1.0) * st * 0.17 * smoothstep(hill0 + 0.02, hill0 + 0.36 * tall, q.y);",
  "  vec3 a = curtain(q, t, anchorY(0.58, 0.040), tall, 0.0, px) * 0.100",
  "         + curtain(q * vec2(0.65, 1.0) + vec2(1.3, 0.0), t * 0.8, anchorY(0.40, 0.016), tall * 0.8, 3.7, px) * 0.042;",
  /* the unfurling ribbon: it opens from the left as the envelope rises,
     stays open while it falls, and only closes again once it is faint */
  "  float open = smoothstep(0.0, 0.4, r);",
  "  float reach = mix(-e - 0.2, e + 0.2, open);",
  "  float lead = 1.0 - smoothstep(reach - 0.25, reach, q.x);",
  "  a += curtain(q * vec2(0.9, 1.0) + vec2(4.1, 0.0), t * 1.2, anchorY(0.76, 0.068), tall * 0.8, 8.3, px) * 0.090 * r * lead;",
  "  c += a * mk;",
  /* hills: dark, with the faintest green on the snow along their crest */
  "  float hill = hill0 + 0.055 * fbm1(q.x * 2.2 + 4.0) * mix(1.0, 0.55, AN);",
  "  float hc = 1.0 - smoothstep(hill - px, hill + px, q.y);",
  "  vec3 hillCol = top * 0.55 + RIM4 * 0.006 * exp(-max(hill - q.y, 0.0) / 0.015);",
  "  c = mix(c, hillCol, hc);",
  "  return c;",
  "}"
].join("\n");

/* ---------- 6 · Moon Pool ----------
   Deep, still water lit from above. Shafts of moonlight fan down from a
   surface out of sight, each one breathing in strength over most of a
   minute. On the floor far below lies the moon's reflection, a soft oval
   rippling very slowly, beside the well where it can be seen (on a phone,
   under the well's foot). Plankton drift up through the shafts as cyan
   motes, two depths of them, sparse. Nothing lives here that has eyes.
   For a Quad the reflection brightens for one breath. */
var GLSL_MOON = [
  "vec3 moonpool(vec2 q, float asp, float px, float calm, float wx, float t, float r, vec3 top, vec3 hor, vec2 fr){",
  "  float AN = fr.x, MO = fr.y;",
  "  float mk = 1.0 - 0.35 * calm;",
  "  vec3 c = mix(hor, top, pow(smoothstep(0.0, 1.0, q.y), 0.65));",
  /* the surface far overhead, only a faint wavering brightness */
  "  c += KEY5 * mix(0.016, 0.022, AN) * smoothstep(0.70, 1.02, q.y) * (0.6 + 0.4 * vnoise(vec2(q.x * 4.0 + t * 0.03, t * 0.02)));",
  /* the shafts: a fan from a point above the screen, each ray's strength
     a slow noise in angle, so they lean and breathe over most of a minute */
  "  vec2 src = vec2(-0.12 * asp, 1.45);",
  "  vec2 d = q - src;",
  "  float ang = atan(d.x, -d.y);",
  "  float ra = vnoise1(ang * 11.0 + t * 0.03), rb = vnoise1(ang * 23.0 - t * 0.022 + 4.0);",
  "  float rays = ra * ra * 0.85 + rb * rb * rb * 0.45;",
  "  float reach = (1.0 - smoothstep(0.35, 1.75, length(d))) * smoothstep(0.0, 0.5, q.y);",
  "  c += mix(KEY5, RIM5, 0.35) * rays * reach * mix(0.045, 0.060, AN) * mk;",
  /* the floor: pale sand far below, with long soft ripples in it. On a
     tall phone it is the strip under the well's foot, so it is drawn a
     little shallower there. */
  "  float fl = (1.0 - smoothstep(0.0, mix(0.16, 0.11, AN), q.y));",
  "  float sand = 0.8 + 0.2 * sin(q.x * 40.0 + 6.0 * tri(q.y * 3.0 + q.x * 0.7));",
  "  c += hor * 0.45 * fl * sand;",
  /* the moon on the floor: a flattened oval, its light broken into slow
     wavering lines by the water above it. It lies beside the well on a wide
     screen, and on a tall one straight under its foot, where the floor shows. */
  "  float e = 0.5 * asp;",
  "  vec2 mp = vec2(mix(wx + clamp(0.6 * e, 0.30, 0.46), wx + 0.02, AN), mix(0.065, 0.040, AN));",
  "  vec2 dm = (q - mp) * vec2(1.0, 3.4);",
  "  dm.x += 0.010 * sin(q.y * 70.0 + t * 0.45) + 0.006 * sin(q.y * 31.0 - t * 0.3);",
  "  float rr = dot(dm, dm);",
  "  float moon = exp(-rr / 0.010) * 0.55 + exp(-rr / 0.0020) * 0.55;",
  "  moon *= 0.80 + 0.20 * sin(dm.y * 55.0 + 4.0 * vnoise(dm * 9.0 + t * 0.05));",
  "  float floorGlow = gauss((q.y - 0.05) / 0.08) * exp(-abs(q.x - mp.x) / 0.6);",
  "  c += KEY5 * (moon * (0.085 + 0.11 * r) + floorGlow * (0.012 + 0.010 * r)) * (0.75 + 0.25 * mk);",
  /* plankton, rising and meandering, at two depths */
  "  vec2 p1 = q + vec2(0.02 * sin(t * 0.11 + q.y * 3.0), -t * 0.010);",
  "  vec2 p2 = q + vec2(0.03 * sin(t * 0.08 + q.y * 2.0 + 1.0), -t * 0.018);",
  "  float mo = points(p1, 22.0, 0.24, 1.5, px, 2.0) * 0.6 + points(p2, 11.0, 0.26, 2.4, px, 6.0);",
  "  c += PAR5 * mo * 0.12 * (0.55 + 0.45 * rays) * mk;",
  "  return c;",
  "}"
].join("\n");

/* ---------- 7 · Lanterns ----------
   A warm night over low hills, and paper lanterns rising far away. They
   are drawn the way a camera sees lights it is not focused on: soft discs
   with a slightly brighter rim, larger and softer the nearer they are, in
   three distinct depths — many small far ones, some middle ones, and a
   very few near ones, large and faint — and few enough that each one is a
   light rather than part of a swarm. Each glows steadily, breathing a
   little over half a minute — never a flicker, never a flame. For a Quad a
   close cluster lifts together. */
var GLSL_LANTERNS = [
  /* a lantern out of focus: a soft disc a touch taller than it is wide, a
     little brighter toward its rim and its lower half, where the light sits
     inside the paper, and a faint halo. Never a flame. */
  "float lantern(vec2 f, vec2 o, float R, float soft){",
  "  vec2 v = (f - o) * vec2(1.0, 0.86);",
  "  float d = length(v);",
  "  float disc = 1.0 - smoothstep(R - soft, R + soft, d);",
  "  float edge = smoothstep(R - 3.0 * soft, R, d) * disc;",
  "  float low = 0.85 + 0.3 * clamp(-v.y / R, -1.0, 1.0);",
  "  return disc * (0.7 + 0.3 * edge) * low + exp(-d * d / (R * R * 5.0)) * 0.20;",
  "}",
  /* one depth of lanterns, one cell each, the grid rising on the clock.
     They are thickest just above the hills where they were let go (base), and
     thin out as they climb toward the top of the sky (base + span): each one
     fades away smoothly at its own height, so none of them ever simply
     vanishes. */
  "float lanternField(vec2 q, float t, float scale, float rise, float rad, float spx, float px, float seed, float prob, float base, float span, out float warm){",
  "  vec2 p = q * scale;",
  "  p.y -= t * rise * scale;",
  "  vec2 id = floor(p); vec2 f = fract(p) - 0.5;",
  "  vec2 h = hash22(id * 1.7 + seed);",
  "  warm = h.y;",
  "  float cy = (id.y + 0.5) / scale + t * rise;",
  "  float dens = prob * (1.0 - 0.8 * smoothstep(base, base + 0.9 * span, cy));",
  "  float on = smoothstep(0.0, 0.06, dens - hash12(id + seed));",
  "  vec2 o = (h - 0.5) * 0.4;",
  "  o.x += 0.14 * tri(t * 0.035 + h.y) - 0.07;",
  "  float R = rad * (0.75 + 0.5 * h.x);",
  "  float breathe = 0.7 + 0.3 * tri(t * 0.03 + h.x);",
  "  return on * lantern(f, o, R, spx * px * scale) * breathe;",
  "}",
  "vec3 lanterns(vec2 q, float asp, float px, float calm, float t, float r, vec3 top, vec3 hor, vec2 fr){",
  "  float AN = fr.x, MO = fr.y;",
  "  float mk = 1.0 - 0.35 * calm;",
  /* on a tall phone the hills lie along the coping and the lanterns rise
     from behind them into the band above the mouth */
  "  float base = anchorY(0.055, -0.008);",
  "  float span = 1.0 - base;",
  "  vec3 c = mix(hor, top, pow(smoothstep(base, 1.0, q.y), 0.6));",
  "  float hill = base + 0.04 * (0.62 * vnoise1(q.x * 1.6 + 2.0) + 0.38 * vnoise1(q.x * 3.3 + 9.1)) * mix(1.0, 0.6, AN);",
  /* the glow of the town the lanterns came from, low behind the hills */
  /* one falloff serves both glows: its cube is the near one */
  "  float gw = exp(-max(q.y - hill, 0.0) / 0.30);",
  "  c += RIM6 * 0.012 * gw * gw * gw * (0.7 + 0.3 * tri(q.x * 0.32 + 0.4));",
  "  float lift = smoothstep(hill - 0.01, hill + mix(0.12, 0.03, AN), q.y);",
  "  float high = 1.0 - 0.55 * smoothstep(base + 0.5 * span, base + 1.05 * span, q.y);",
  /* three depths, and few of each: far ones small, dim and a little cooler
     in the haze; middle ones; and a handful of near ones, large, soft and
     faint, out of focus. Between them about forty in a hundred fewer than the
     sky once held, so the eye rests on single lights instead of a swarm. */
  "  float w1, w2, w3;",
  "  float dm = mix(1.0, 1.6, AN);",
  "  float l1 = lanternField(q, t, 26.0, 0.005, 0.10, 1.0, px, 1.0, 0.15 * dm, base, span, w1);",
  "  float l2 = lanternField(q + vec2(0.37, 0.0), t, 11.0, 0.010, 0.11, 1.6, px, 5.0, 0.17 * dm, base, span, w2);",
  "  float l3 = lanternField(q + vec2(0.11, 0.0), t, 4.2, 0.017, 0.12, 7.0, px, 9.0, 0.12 * dm, base, span, w3);",
  "  vec3 lc = mix(RIM6, PAR6, w1 * 0.6) * l1 * 0.19 + mix(RIM6, PAR6, w2) * l2 * 0.24 + mix(RIM6, PAR6, w3) * l3 * 0.085;",
  "  c += lc * lift * high * mk;",
  /* where they are thickest, the air itself is warm with them */
  "  c += RIM6 * 0.008 * gw * mk;",
  /* the Quad: a cluster of six, nearer and brighter, lifting together on
     the backdrop's clock, beside the well on a wide screen */
  "  if (r > 0.001){",
  "    vec3 cl = vec3(0.0);",
  "    for (int k = 0; k < 2; k++){",
  "      float cyc = t / 10.0 + 0.5 * float(k);",
  "      float ph = fract(cyc);",
  "      float hc = hash11(floor(cyc) * 7.13 + float(k));",
  "      float side = hc < 0.5 ? -1.0 : 1.0;",
  "      vec2 cc = vec2(side * mix(0.25, 0.42, fract(hc * 7.0)) * asp, 0.12 + 0.55 * ph);",
  "      cc = mix(cc, vec2(side * 0.11 - 0.02, base + 0.02 + 0.12 * ph), AN);",
  "      float wk = win(ph);",
  "      for (int j = 0; j < 6; j++){",
  "        float fj = float(j);",
  "        vec2 o = cc + vec2(sin(fj * 2.4) * 0.05, cos(fj * 1.9) * 0.04 + fj * 0.006) + vec2(0.006 * sin(t * 0.3 + fj), 0.0);",
  "        float R = 0.010 + 0.004 * hash11(fj + 3.0);",
  "        cl += mix(RIM6, PAR6, hash11(fj * 1.7)) * lantern(q, o, R, 1.6 * px) * wk;",
  "      }",
  "    }",
  "    c += cl * 0.30 * r;",
  "  }",
  "  float hc2 = 1.0 - smoothstep(hill - px, hill + px, q.y);",
  "  c = mix(c, top * 0.45 + RIM6 * 0.003, hc2);",
  "  return c;",
  "}"
].join("\n");

/* ---------- 8 · Snowfall ----------
   Night snow in three layers: far flakes small, dim and slow; middle ones;
   a few near flakes large and soft, almost out of focus. Every flake sways
   on its own slow sine and is drawn a little taller than wide, as a flake
   in motion is, and the far layer is kept sparse, so the snow never reads
   as a sky of stars. A treeline stands in haze at the bottom. For a
   Quad the snow pauses in the air: its clock is held back by the response
   envelope, so the flakes stop dead for the length of the rise, hang there
   catching a little more light, and then drift on. */
var GLSL_SNOW = [
  /* one layer of snow, one flake per cell at most, the grid falling on the
     clock and every flake swaying on its own slow sine */
  "float flakes(vec2 q, float t, float scale, float fall, float rpx, float px, float seed, float prob){",
  "  vec2 p = q * scale;",
  "  p.y += t * fall * scale;",
  "  vec2 id = floor(p); vec2 f = fract(p) - 0.5;",
  "  float on = step(1.0 - prob, hash12(id + seed));",
  "  vec2 h = hash22(id * 1.3 + seed);",
  "  vec2 o = (h - 0.5) * 0.36;",
  "  o.x += 0.28 * tri(t * 0.0557 * (0.6 + 0.8 * h.y) + h.x) - 0.14;",
  "  float R = rpx * px * scale * (0.7 + 0.6 * h.y);",
  /* drawn a little taller than wide: the blur of a flake in motion, and
     what tells falling snow from a sky of stars */
  "  vec2 d = (f - o) * vec2(1.0, 0.72);",
  "  return on * exp(-dot(d, d) / (R * R)) * (0.55 + 0.45 * h.x);",
  "}",
  /* the skyline of a stand of firs: one triangle per narrow cell, its
     neighbours taken too so the trees can overlap */
  "float firs(float x, float base, float cell, float hmin, float hmax, float seed){",
  "  float id = floor(x / cell);",
  "  float best = 0.0;",
  "  for (int k = -1; k <= 1; k++){",
  "    float j = id + float(k);",
  "    float h = hash11(j * 1.91 + seed);",
  "    float cx = (j + 0.3 + 0.4 * h) * cell;",
  "    float H = mix(hmin, hmax, hash11(j * 3.7 + seed));",
  "    float hw = cell * (0.55 + 0.25 * h);",
  "    best = max(best, H * (1.0 - abs(x - cx) / hw));",
  "  }",
  "  return base + best;",
  "}",
  "vec3 snowfall(vec2 q, float asp, float px, float calm, float t, float ts, float r, vec3 top, vec3 hor, vec2 fr){",
  "  float AN = fr.x, MO = fr.y;",
  "  float mk = 1.0 - 0.35 * calm;",
  "  vec3 c = mix(hor, top, pow(smoothstep(0.0, 1.0, q.y), 0.55));",
  "  c *= 0.80;",
  /* on a tall phone the treeline stands along the coping, a little
     shorter, and the snowfield runs down beside and under the well */
  "  float th = mix(1.0, 0.7, AN);",
  /* the ground under the snow barely rolls: a slow wave is enough */
  "  float ground = anchorY(0.045, -0.014) + 0.012 * tri(q.x * 0.35 + 0.2);",
  "  float far = firs(q.x, ground + 0.018 * th, 0.022, 0.012 * th, 0.035 * th, 3.0);",
  "  float near = firs(q.x + 0.5, ground, 0.034, 0.02 * th, 0.065 * th, 7.0);",
  /* haze along the treeline: the town light on the snow clouds */
  "  c += hor * 0.22 * exp(-max(q.y - far, 0.0) / 0.10);",
  "  float fc = 1.0 - smoothstep(far - 1.2 * px, far + 1.2 * px, q.y);",
  "  c = mix(c, mix(top, hor, 0.45) * 0.85, fc * 0.9);",
  "  float nc = 1.0 - smoothstep(near - 1.2 * px, near + 1.2 * px, q.y);",
  "  c = mix(c, top * 0.55, nc);",
  /* the snow on the ground, pale under the trees and darkening toward us,
     so a field that fills the sides of a phone is not a pale wall */
  "  float gc = 1.0 - smoothstep(ground - 0.012 - px, ground - 0.012 + px, q.y);",
  "  c = mix(c, hor * (0.85 - 0.45 * smoothstep(0.0, 0.5, ground - 0.012 - q.y)), gc);",
  /* the flakes run on ts, the clock the Quad holds back */
  /* fewer far flakes than a sky has stars, so it never reads as one */
  "  float sn = flakes(q, ts, 30.0, 0.016, 1.3, px, 1.0, 0.22) * 0.42",
  "           + flakes(q + vec2(0.31, 0.0), ts, 13.0, 0.032, 2.2, px, 4.0, 0.34) * 0.85",
  "           + flakes(q + vec2(0.13, 0.0), ts, 5.5, 0.060, 4.6, px, 8.0, 0.26) * 0.7;",
  "  c += KEY7 * sn * 0.19 * (1.0 + 0.25 * r) * mk;",
  "  return c;",
  "}"
].join("\n");

/* ---------- 9 · Mountain Bells ----------
   Ridges behind ridges, each darker than the one behind it, and mist
   lying level in the valleys between them, so each ridge stands dark
   against the pale mist behind it and sinks into the mist at its foot —
   the old painters' way of drawing distance — with the mist drifting
   sideways in its bands. Somewhere on the far ridge a bell is
   struck every nine seconds or so; its sound is drawn as rings spreading
   across the valley, visible only where they pass through mist, because
   that is what would carry them. For a Quad one great ring rolls out from
   the same place across the whole sky. */
var GLSL_BELLS = [
  /* a mountain skyline: rolling noise with a few sharper peaks folded in */
  "float ridge(float x, float base, float amp, float f, float seed){",
  "  float n = fbm1(x * f + seed);",
  "  float peak = 1.0 - abs(2.0 * vnoise1(x * f * 0.7 + seed * 1.3) - 1.0);",
  "  return base + amp * (0.65 * n + 0.35 * peak * peak);",
  "}",
  "vec3 bells(vec2 q, float asp, float px, float calm, float t, float r, vec3 top, vec3 hor, vec2 fr){",
  "  float AN = fr.x, MO = fr.y;",
  "  float mk = 1.0 - 0.35 * calm;",
  "  float e = 0.5 * asp;",
  /* on a tall phone the far ridge rises from the coping and the nearer two
     sit behind the well, lower and flatter; their mist goes with them */
  "  float vs = mix(1.0, 0.45, AN);",
  "  float b1 = anchorY(0.40, 0.012), b2 = anchorY(0.27, -0.030), b3 = anchorY(0.12, -0.085);",
  /* the sky is palest just above the far ridge, where the mist thins into it */
  "  vec3 c = mix(hor * 1.30, top, pow(smoothstep(b1 - 0.02 + 0.06 * AN, 1.0 + 0.5 * AN, q.y), 0.8));",
  "  vec3 mistCol = hor * 1.60 + RIM8 * 0.010;",
  "  float mist = fbm3(vec2(q.x * 1.3 + t * 0.010, q.y * 6.0 / vs - t * 0.002));",
  "  float h1 = ridge(q.x, b1, 0.14 * vs, 1.6, 2.0);",
  "  float h2 = ridge(q.x, b2, 0.11 * vs, 2.3, 9.0);",
  "  float h3 = ridge(q.x, b3, 0.09 * vs, 3.1, 17.0);",
  /* far to near, each ridge darker than the last, its crest catching a
     little of the sky's light. Mist lies in the valleys as level bands, just
     below the crest of the next ridge forward, so every ridge stands dark
     against the pale mist behind it and sinks into the mist at its own foot:
     the old way of painting distance, and what makes this a range rather
     than a smudge. */
  "  float c1 = 1.0 - smoothstep(h1 - px, h1 + px, q.y);",
  "  c = mix(c, hor * 0.66 + RIM8 * 0.010 * smoothstep(h1 - 0.014, h1, q.y), c1);",
  "  float m1 = smoothstep(0.30, 0.78, mist) * gauss((q.y - b2 - 0.085 * vs) / (0.045 * vs));",
  "  c = mix(c, mistCol, m1 * 0.75);",
  "  float c2 = 1.0 - smoothstep(h2 - px, h2 + px, q.y);",
  "  c = mix(c, hor * 0.34 + top * 0.12 + RIM8 * 0.007 * smoothstep(h2 - 0.014, h2, q.y), c2);",
  "  float m2 = smoothstep(0.30, 0.80, mist) * gauss((q.y - b3 - 0.07 * vs) / (0.040 * vs));",
  "  c = mix(c, mistCol * 0.82, m2 * 0.70);",
  "  float c3 = 1.0 - smoothstep(h3 - px, h3 + px, q.y);",
  "  c = mix(c, hor * 0.06 + top * 0.42, c3);",
  "  float m3 = smoothstep(0.30, 0.85, mist) * gauss((q.y - b3 + 0.02 * vs) / (0.04 * vs));",
  "  c = mix(c, mistCol * 0.55, m3 * 0.45);",
  "  float high = 0.4 * smoothstep(0.40, 0.90, mist) * gauss((q.y - anchorY(0.62, 0.075)) / (0.16 * vs));",
  "  c = mix(c, mistCol * 0.9, high * 0.5);",
  "  float mistAll = max(max(m1, m2), max(m3, high));",
  /* the bell: struck on the far ridge, a small warm light where it hangs,
     its sound drawn as rings spreading flat across the valley. On a phone it
     hangs above the coping, left of the middle, clear of the pieces. */
  "  float bx = mix(-min(e - 0.16, 0.48), (uWell.x - 0.5) * asp - 0.06, AN);",
  /* it hangs a little below the crest, never above it, so it is a light on
     the mountainside and can never be taken for a star */
  "  vec2 bp = vec2(bx, b1 + 0.14 * vs * 0.12);",
  "  vec2 bd = (q - bp) * vec2(1.0, 2.4);",
  "  float bdist = length(bd);",
  /* on a phone the rings spread more slowly, so they cross the band above
     the mouth instead of leaving it at once */
  "  float rs = mix(1.0, 0.4, AN);",
  "  float rings = 0.0;",
  "  for (int k = 0; k < 3; k++){",
  "    float ph = fract(t / 27.0 + float(k) / 3.0);",
  "    float rad = 0.03 + 1.1 * ph * rs;",
  "    float fade = 1.0 - ph;",
  "    rings += gauss((bdist - rad) / (0.012 + 0.03 * ph)) * fade * sqrt(fade) * smoothstep(0.0, 0.05, ph);",
  "  }",
  /* the Quad: one great ring, from two emitters half a cycle apart */
  "  float big = 0.0;",
  "  for (int k = 0; k < 2; k++){",
  "    float ph = fract(t / 5.0 + 0.5 * float(k));",
  "    float rad = 0.05 + 1.7 * ph * rs;",
  "    big += win(ph) * gauss((bdist - rad) / (0.025 + 0.05 * ph));",
  "  }",
  "  float ringLight = (rings * 0.8 + big * r * 1.5) * (0.30 + 0.70 * clamp(mistAll * 1.8, 0.0, 1.0));",
  "  c += mix(RIM8, KEY8, 0.5) * ringLight * 0.032 * mk;",
  "  c += KEY8 * 0.05 * exp(-dot(bd, bd) / 0.00025) * mk;",
  "  return c;",
  "}"
].join("\n");

/* ---------- 10 · Starfield ----------
   The bottom of the well. Still water across the lower third holds a sky
   that turns about a pole above the well, a full turn in twenty-odd
   minutes, with a faint violet nebula in it. The stars are few, mostly
   faint, a little thicker where the nebula is, and each breathes slowly. The reflection is the same sky
   evaluated at the mirrored height, darkened and very faintly rippled — so
   the water is right by construction, and costs nothing extra. For a Quad
   a falling star crosses low over the water, and crosses its reflection. */
var GLSL_STARS = [
  /* the turning sky, at any height above the water line. vs pulls the
     falling star's path down into a phone's band above the mouth. */
  "vec3 starSky(vec2 q, float t, float r, float hz, float vs, float asp, float px, vec3 top, vec3 hor){",
  "  vec3 c = mix(hor, top, pow(smoothstep(hz, 1.0, q.y), 0.6));",
  "  c += hor * 0.8 * exp(-(q.y - hz) / 0.025);",
  "  vec2 pole = vec2(0.0, 1.25);",
  "  vec2 d = rot(t * 0.0105) * (q - pole);",
  /* a faint nebula, two colours of it, turning with the stars */
  "  float n = fbm3(d * 1.6 + 5.0);",
  "  vec3 neb = mix(vec3(0.22, 0.08, 0.45), vec3(0.06, 0.14, 0.45), tri(d.x * 0.45 + d.y * 0.3 + n * 0.8)) * smoothstep(0.45, 0.88, n);",
  "  c += neb * 0.10;",
  "  float band = smoothstep(0.45, 0.88, n);",
  /* the stars: about four in ten of what this sky once held, most of them
     faint, a few bright, a few more where the nebula thickens, each breathing
     slowly on its own */
  "  float st = stars(d, 30.0, 0.22, 1.6, px, 3.0, t) + stars(d, 70.0, 0.05 + 0.17 * band, 1.3, px, 8.0, t) * 0.5;",
  "  c += vec3(1.0, 0.96, 0.9) * st * 0.45 * (0.75 + 0.5 * band);",
  /* the falling star: two emitters, each a bright head and a fading tail on
     a path low over the water, revealed by the response envelope */
  "  if (r > 0.001){",
  "    float e = 0.5 * asp;",
  "    for (int k = 0; k < 2; k++){",
  "      float cyc = t / 4.0 + 0.5 * float(k);",
  "      float ph = fract(cyc);",
  "      float hs = hash11(floor(cyc) * 3.17 + float(k) * 1.1);",
  "      float dir = hs < 0.5 ? 1.0 : -1.0;",
  "      vec2 a = vec2(-dir * (e + 0.1), hz + (0.20 + 0.10 * fract(hs * 5.0)) * vs);",
  "      vec2 b = vec2(dir * (e + 0.1), hz + (0.05 + 0.05 * fract(hs * 9.0)) * vs);",
  "      vec2 head = mix(a, b, ph);",
  "      vec2 tail = head - normalize(b - a) * 0.12;",
  "      vec2 pa = q - tail, ba = head - tail;",
  "      float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);",
  "      float dd = length(pa - ba * hh);",
  "      float w = 1.3 * px;",
  "      c += KEY9 * exp(-dd * dd / (w * w)) * hh * hh * win(ph) * r * 0.55;",
  "    }",
  "  }",
  "  return c;",
  "}",
  /* the water is the same sky evaluated at the mirrored height, darkened
     and very faintly rippled — right by construction, and no extra cost. On
     a tall phone the water line lies just above the coping: the stars are in
     the band over the mouth and the water holds them everywhere else. */
  "vec3 starfield(vec2 q, float asp, float px, float calm, float t, float r, vec3 top, vec3 hor, vec2 fr){",
  "  float AN = fr.x, MO = fr.y;",
  "  float mk = 1.0 - 0.35 * calm;",
  "  float hz = anchorY(0.33, 0.030);",
  "  float vs = mix(1.0, 0.25, AN);",
  "  vec3 dim = mix(hor, top, 0.6);",
  "  if (q.y >= hz){",
  "    return mix(dim, starSky(q, t, r, hz, vs, asp, px, top, hor), mk);",
  "  }",
  "  float depth = hz - q.y;",
  "  vec2 m = vec2(q.x + 0.003 * sin(0.9 / (depth + 0.05) + t * 0.2), hz + depth);",
  "  vec3 w = starSky(m, t, r, hz, vs, asp, px, top, hor) * max(0.78 - 0.6 * depth, 0.30) * vec3(0.90, 0.95, 1.06);",
  "  w += hor * 0.6 * exp(-depth / 0.008);",
  "  return mix(dim * 0.7, w, mk);",
  "}"
].join("\n");

/* ---------- the dispatcher and the frame ----------
   scene draws one world; main draws one or two and finishes the frame:
   the quiet capsule around the well, danger's cooling, and a fixed dither.
   The dither is static on purpose — it breaks up banding in skies this
   smooth and this dark, and a dither that moved would be a shimmer. */
var GLSL_MAIN = [
  /* the inverse of smoothstep. Snowfall holds its clock back by the
     envelope's own rise, read backwards: while Sky.react climbs, the snow's
     clock stands exactly still, and while it falls the snow drifts a quarter
     faster until it has caught up. Nothing ever moves backwards. */
  "float invSmooth(float y){ return 0.5 - sin(asin(1.0 - 2.0 * clamp(y, 0.0, 1.0)) / 3.0); }",
  "vec3 scene(int id, vec2 q, float asp, float px, float calm, vec2 wq, vec3 top, vec3 hor, vec2 fr){",
  "  float tm = uTime * uMotion;",
  "  if (id == 0) return dawn(q, asp, px, calm, wq.x, tm * MOT0, uReact, top, hor, fr);",
  "  if (id == 1) return tide(q, asp, px, calm, wq, tm * MOT1, tm, uReact, top, hor, fr);",
  "  if (id == 2) return rain(q, asp, px, calm, tm * MOT2, uReact, top, hor, fr);",
  "  if (id == 3) return bamboo(q, asp, px, calm, tm * MOT3, uReact, top, hor, fr);",
  "  if (id == 4) return aurora(q, asp, px, calm, tm * MOT4, uReact, top, hor, fr);",
  "  if (id == 5) return moonpool(q, asp, px, calm, wq.x, tm * MOT5, uReact, top, hor, fr);",
  "  if (id == 6) return lanterns(q, asp, px, calm, tm * MOT6, uReact, top, hor, fr);",
  "  if (id == 7) return snowfall(q, asp, px, calm, tm * MOT7, (uTime - 0.6 * invSmooth(uReact)) * uMotion * MOT7, uReact, top, hor, fr);",
  "  if (id == 8) return bells(q, asp, px, calm, tm * MOT8, uReact, top, hor, fr);",
  "  return starfield(q, asp, px, calm, tm * MOT9, uReact, top, hor, fr);",
  "}",
  "void main(){",
  "  vec2 uv = vUv;",
  "  float asp = uRes.x / max(uRes.y, 1.0);",
  "  float px = 1.0 / max(uRes.y, 1.0);",
  "  vec2 q = vec2((uv.x - 0.5) * asp, uv.y);",
  "  vec2 wq = vec2((uWell.x - 0.5) * asp, uWell.y);",
  /* uAnchor ramps from a squarish screen (0) to a phone (1); the
     composition commits once a screen is clearly tall. A renderer that sets
     neither uniform, or no mouth, gets the wide composition everywhere. */
  "  vec2 fr = vec2(smoothstep(0.1, 0.7, uAnchor) * step(0.3, uMouth), uMouth);",
  /* the quiet capsule: roughly the well's own shape on any screen. On a
     tall one it stops at the coping, because the band above the mouth is all
     of the world there is to see. */
  "  vec2 b = abs(q - wq) - vec2(0.20, 0.40);",
  "  float bd = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);",
  "  float calm = (1.0 - smoothstep(-0.05, 0.16, bd)) * (1.0 - fr.x * smoothstep(0.0, 0.035, q.y - fr.y));",
  "  vec3 c;",
  "  if (uMix <= 0.0) c = scene(uA, q, asp, px, calm, wq, uTopA, uHorA, fr);",
  "  else if (uMix >= 1.0) c = scene(uB, q, asp, px, calm, wq, uTopB, uHorB, fr);",
  "  else c = mix(scene(uA, q, asp, px, calm, wq, uTopA, uHorA, fr), scene(uB, q, asp, px, calm, wq, uTopB, uHorB, fr), uMix);",
  "  c *= 1.0 - 0.12 * calm;",
  /* danger: cooler, greyer, a touch darker at the edges. Never red. */
  "  float l = lum(c);",
  "  c = mix(c, vec3(l) * vec3(0.80, 0.94, 1.22), 0.55 * uDanger);",
  "  c *= 1.0 - 0.12 * uDanger * smoothstep(0.25, 0.9, length((uv - 0.5) * vec2(1.0, 1.2)) * 1.6);",
  "  float n = hash12(floor(gl_FragCoord.xy)) - 0.5;",
  "  c += n * (0.03 * c + 0.0004);",
  "  outColor = vec4(max(c, vec3(0.0)), 1.0);",
  "}"
].join("\n");

var FRAG = [
  "#version 300 es",
  "precision highp float;",
  "precision highp int;",
  "uniform vec2 uRes;",
  "uniform float uTime;",
  "uniform int uA, uB;",
  "uniform float uMix, uReact, uMotion, uDanger;",
  "uniform vec3 uTopA, uHorA, uTopB, uHorB;",
  "uniform vec2 uWell;",
  "uniform float uAnchor, uMouth;",
  "in vec2 vUv;",
  "out vec4 outColor;",
  worldTable(),
  GLSL_COMMON,
  GLSL_DAWN,
  GLSL_TIDE,
  GLSL_RAIN,
  GLSL_BAMBOO,
  GLSL_AURORA,
  GLSL_MOON,
  GLSL_LANTERNS,
  GLSL_SNOW,
  GLSL_BELLS,
  GLSL_STARS,
  GLSL_MAIN
].join("\n");

/* ---------- the Canvas2D painter ----------
   The 2D tier gets the same ten places, built the way a stage set is:
   everything that does not move is painted once into a cached layer per
   world (the sky, the hills, the sun, the far leaves), and each frame lays
   that layer down with one drawImage and then moves a handful of things over
   it — mist sprites, strokes of rain, stalks, lanterns, flakes. Gradients,
   sprites and colour strings are all made when a world is first shown, never
   per frame, so a frame is a few dozen draw calls (a hundred at most, for
   snow on a wide screen) and no garbage. It is meant to be drawn the way
   gfx2d draws it: into a canvas a quarter of the screen's pixels, at 15 Hz.

   The cached layers are painted at no more than 1100 pixels on their long
   side and stretched to fit. Everything in them is soft, so the stretch is
   invisible, and it keeps three worlds' worth of cache to a few megabytes
   on a phone rather than a hundred. Three are kept — the world on screen,
   the one fading in, and the one just left — and rebuilt only when the size
   changes.

   The 2D backdrop composes itself the way the shader does: a tall screen
   lifts each world's horizon and feature into the band above the well's
   mouth. It works out how tall the screen is from the size it is given;
   where the mouth is, and the well's centre, a caller may pass as a last
   argument ({mouth, wellX}, in uv), and otherwise it takes them from where
   the layout puts the well on a phone. The quiet capsule is the middle of
   the screen, stopping at the mouth on a phone. Danger is gfx2d's vignette
   to draw, not this. */

/* small numeric helpers: a sine hash is fine here, in JavaScript's double
   precision, where it is not on a GPU */
function h1(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function vn1(x) {
  var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return h1(i) + (h1(i + 1) - h1(i)) * u;
}
function fbm(x) { return (0.5 * vn1(x) + 0.25 * vn1(x * 2.07 + 7.1) + 0.125 * vn1(x * 4.13 + 3.3)) / 0.875; }
function sstep(a, b, x) { var t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
function fract(x) { return x - Math.floor(x); }
/* the inverse of smoothstep, for Snowfall's pause (see the shader's) */
function invSmooth(y) { y = y < 0 ? 0 : y > 1 ? 1 : y; return 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3); }
function win(ph) { var s = Math.sin(Math.PI * ph); return s * s; }
/* mulberry32: the layouts are the same every visit, like everything else here */
function rng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* colours, in sRGB 0..255, because that is what a 2D canvas blends in */
function rgb(hex) {
  var n = parseInt(String(hex || "#000000").replace("#", ""), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function mulc(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function css(c, a) {
  return "rgba(" + Math.round(Math.max(0, Math.min(255, c[0]))) + "," + Math.round(Math.max(0, Math.min(255, c[1]))) + "," +
    Math.round(Math.max(0, Math.min(255, c[2]))) + "," + (a === undefined ? 1 : +a.toFixed(4)) + ")";
}

function makeCanvas(w, h) {
  var c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
/* a layer the size of the screen in screen units, stored at most 1100 px */
function layer(w, h) {
  var k = Math.min(1, 1100 / Math.max(w, h));
  var c = makeCanvas(w * k, h * k);
  var g = c.getContext("2d");
  g.setTransform(k, 0, 0, k, 0, 0);
  return { c: c, g: g, k: k };
}
/* a soft round sprite: the workhorse of every glow, mote, flake and lantern */
function dotSprite(size, c, a, hard) {
  var s = Math.max(4, Math.round(size));
  var cv = makeCanvas(s, s), g = cv.getContext("2d");
  var gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  if (hard) {
    gr.addColorStop(0, css(c, a * 0.85));
    gr.addColorStop(0.55, css(c, a * 0.95));
    gr.addColorStop(0.72, css(c, a * 0.55));
    gr.addColorStop(0.86, css(c, a * 0.10));
  } else {
    gr.addColorStop(0, css(c, a));
    gr.addColorStop(0.35, css(c, a * 0.55));
  }
  gr.addColorStop(1, css(c, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
  return cv;
}
/* a vertical sky gradient from top at the top of the screen to hor at
   height hz (0 the bottom, 1 the top) */
function skyFill(g, w, h, top, hor, hz) {
  var gr = g.createLinearGradient(0, 0, 0, h * (1 - hz));
  gr.addColorStop(0, css(top));
  gr.addColorStop(0.55, css(mixc(top, hor, 0.42)));
  gr.addColorStop(1, css(hor));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h * (1 - hz) + 1);
}
/* a soft horizontal smear: an ellipse of light (or mist) rx by ry */
function smear(g, x, y, rx, ry, c, a) {
  g.save();
  g.translate(x, y);
  g.scale(rx / ry, 1);
  var gr = g.createRadialGradient(0, 0, 0, 0, 0, ry);
  gr.addColorStop(0, css(c, a));
  gr.addColorStop(0.5, css(c, a * 0.45));
  gr.addColorStop(1, css(c, 0));
  g.fillStyle = gr;
  g.fillRect(-ry, -ry, ry * 2, ry * 2);
  g.restore();
}
/* the same smear three times, a strip's width apart, so a strip that is
   drawn wrapped around the screen never shows a seam */
function smearWrap(g, x, y, rx, ry, c, a, sw) {
  smear(g, x - sw, y, rx, ry, c, a);
  smear(g, x, y, rx, ry, c, a);
  smear(g, x + sw, y, rx, ry, c, a);
}
/* a leaf, the same shape as the shader's: pointed at both ends, fuller near
   the stem, drooping a little along its length */
function leafPath(g, len, wid, droop) {
  g.beginPath();
  g.moveTo(0, 0);
  var i, u, x, y, wv;
  for (i = 0; i <= 12; i++) {
    u = i / 12; x = u * len;
    wv = wid * Math.pow(Math.sin(Math.PI * u), 0.7) * (1 - 0.35 * u);
    y = droop * u * u * len - wv;
    g.lineTo(x, y);
  }
  for (i = 12; i >= 0; i--) {
    u = i / 12; x = u * len;
    wv = wid * Math.pow(Math.sin(Math.PI * u), 0.7) * (1 - 0.35 * u);
    y = droop * u * u * len + wv;
    g.lineTo(x, y);
  }
  g.closePath();
}
/* a spray of five leaves on its own canvas, stem at the canvas centre, so
   it can be swayed with a rotation about the stem */
function spraySprite(len, wid, spread, fill, rim, seed) {
  var s = Math.ceil(len * 2.3);
  var cv = makeCanvas(s, s), g = cv.getContext("2d");
  var R = rng(seed);
  g.translate(s / 2, s / 2);
  for (var k = 0; k < 5; k++) {
    var hh = R();
    var a = (k - 2) * spread + (hh - 0.5) * 0.3;
    var L = len * (0.62 + 0.38 * hh);
    g.save();
    g.rotate(a);
    leafPath(g, L, wid * (0.8 + 0.4 * hh), 0.22);
    g.fillStyle = fill;
    g.fill();
    if (rim) { g.strokeStyle = rim; g.lineWidth = Math.max(1, wid * 0.08); g.stroke(); }
    g.restore();
  }
  return cv;
}
function drawSpray(ctx, cv, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(cv, -cv.width / 2, -cv.height / 2);
  ctx.restore();
}

/* The ten scenes. Each has build(E, w, h, W), which paints E.base and makes
   whatever sprites it needs, and draw(ctx, E, w, h, t, r, al, tu, ts),
   which moves things over the base: t is the world's clock (already scaled
   by the player's and the world's motion), r the Quad envelope, al the
   crossfade alpha, tu the clock scaled by the player's motion only (Tide's
   swell keeps time with the music), ts the clock Snowfall's Quad holds
   back. Positions are in the shader's coordinates — height units, x from
   the middle of the screen, y up from the bottom — so a point (qx, qy) is
   at (w / 2 + qx * h, h - qy * h) in pixels.

   E also carries the frame's composition, as the shader's AN and MO do:
   E.an is how far the screen is a phone held upright, E.mo the height of
   the well's mouth, E.wx the well's centre. ay() places a height the way
   the shader's anchorY does, so on a phone every scene lifts its horizon
   and its feature into the band above the mouth, here as there. */
var SCENES = [];
function ay(E, y, above) { return y + (E.mo + above - y) * E.an; }
function lerp(a, b, t) { return a + (b - a) * t; }
/* the stars' slow breath: a smoothed triangle wave, 0..1 */
function breath(x) { var w = Math.abs(fract(x) * 2 - 1); return w * w * (3 - 2 * w); }
/* a star's brightness on the power law the shader uses: nine in ten at a
   quarter of the brightest or less */
function starB(u) { return Math.min(1, 0.08 / Math.sqrt(Math.max(1 - u, 0.0064))); }

/* 1 · Dawn */
SCENES[0] = {
  build: function (E, w, h, W) {
    var L = layer(w, h), g = L.g;
    var top = E.top, hor = E.hor, key = E.key;
    var e = w / h / 2;
    var hz = ay(E, 0.27, 0.024), vs = 1 - 0.58 * E.an;
    var sx = lerp(Math.min(0.55, e - 0.12), E.wx - 0.045, E.an);
    E.hz = hz; E.vs = vs; E.sx = sx;
    var X = function (q) { return w / 2 + q * h; }, Y = function (q) { return h - q * h; };
    skyFill(g, w, h, top, hor, hz);
    var gr = g.createLinearGradient(0, Y(hz), 0, h);
    gr.addColorStop(0, css(mulc(hor, 0.66)));
    gr.addColorStop(1, css(mulc(mixc(top, hor, 0.3), 0.40)));
    g.fillStyle = gr; g.fillRect(0, Y(hz), w, h - Y(hz));
    /* the warm band along the horizon, strongest by the sun */
    smear(g, X(sx), Y(hz), 0.9 * h, 0.08 * h * vs, key, 0.14);
    smear(g, X(0), Y(hz + 0.13 * vs), 1.2 * h, 0.10 * h * vs, [120, 60, 90], 0.10);
    /* the far shore */
    g.beginPath(); g.moveTo(0, Y(hz));
    for (var x = 0; x <= w + 4; x += 4) {
      var qx = (x - w / 2) / h;
      var isl = sstep(0.42, 0.62, vn1(qx * 1.3 + 4.0));
      g.lineTo(x, Y(hz + 0.004 + (0.010 + 0.016 * fbm(qx * 6.0 + 2.0)) * isl));
    }
    g.lineTo(w, Y(hz)); g.closePath();
    g.fillStyle = css(mixc(mulc(top, 0.9), hor, 0.38)); g.fill();
    /* the sun and its bloom, and its column on the water; smaller on a
       phone, where the band it sits in is small */
    var sp = Y(hz + 0.032), sr = (0.016 - 0.0035 * E.an) * h;
    gr = g.createRadialGradient(X(sx), sp, 0, X(sx), sp, 0.15 * h);
    gr.addColorStop(0, css(key, 0.42)); gr.addColorStop(0.18, css(key, 0.16)); gr.addColorStop(1, css(key, 0));
    g.fillStyle = gr; g.fillRect(X(sx) - 0.15 * h, sp - 0.15 * h, 0.3 * h, 0.15 * h + (Y(hz) - sp));
    g.save(); g.beginPath(); g.rect(0, 0, w, Y(hz)); g.clip();
    g.beginPath(); g.arc(X(sx), sp, sr, 0, Math.PI * 2);
    g.fillStyle = css(mixc(key, [255, 255, 255], 0.35), 0.92 - 0.15 * E.an); g.fill();
    g.restore();
    for (var i = 0; i < 16; i++) {
      var d = Math.pow((i + 0.5) / 16, 1.5) * 0.22;
      smear(g, X(sx), Y(hz - d), (0.012 + d * 0.3) * h, 0.004 * h, key, 0.20 * (1 - i / 16) * (i % 2 ? 0.55 : 1));
    }
    E.base = L.c;
    /* high cloud, drifting: a strip twice nothing, wrapped */
    E.cloud = layer(w, 0.32 * h);
    var R = rng(11);
    for (i = 0; i < 9; i++) {
      smearWrap(E.cloud.g, R() * w, (0.2 + 0.6 * R()) * 0.32 * h, (0.30 + 0.35 * R()) * Math.min(w, 1.4 * h), 0.010 * h + 0.014 * h * R(),
        mixc([150, 80, 110], key, 0.2), 0.06 + 0.05 * R(), w);
    }
    /* mist: a long soft band of overlapping smears in the mist colour */
    E.mist = layer(w, 0.12 * h);
    var mc = mixc(mulc(hor, 1.15), key, 0.12);
    for (i = 0; i < 14; i++) smearWrap(E.mist.g, R() * w, (0.35 + 0.3 * R()) * 0.12 * h, (0.12 + 0.2 * R()) * h, 0.02 * h, mc, 0.20, w);
    E.bloom = dotSprite(0.3 * h, key, 0.35);
    E.bird = css(mulc(top, 0.5), 0.55);
  },
  draw: function (ctx, E, w, h, t, r, al) {
    var hz = E.hz, vs = E.vs, e = w / h / 2, sx = E.sx;
    var ox = -fract(t * 0.003 / Math.max(0.5, w / h)) * w;
    var ch = 0.32 * h * vs, cy = h - (ay(E, 0.62, 0.085) + 0.16 * vs) * h;
    ctx.globalAlpha = al;
    ctx.drawImage(E.cloud.c, ox, cy, w, ch);
    ctx.drawImage(E.cloud.c, ox + w, cy, w, ch);
    /* three mist bands, rising from the water and thinning as they lift;
       a Quad parts them for one breath */
    var mh = 0.12 * h * (1 - 0.4 * E.an);
    for (var k = 0; k < 3; k++) {
      var ph = fract(t * 0.004 / 0.32 + k / 3);
      var qy = hz - 0.03 + ph * 0.32 * vs;
      var mx = -fract(t * 0.005 + k * 0.37) * w;
      ctx.globalAlpha = al * Math.sin(Math.PI * ph) * (1 - ph * 0.5) * (1 - 0.6 * r);
      ctx.drawImage(E.mist.c, mx, h - qy * h - mh / 2, w, mh);
      ctx.drawImage(E.mist.c, mx + w, h - qy * h - mh / 2, w, mh);
    }
    if (r > 0.001) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = al * r * 0.35;
      var s = E.bloom.width;
      ctx.drawImage(E.bloom, w / 2 + sx * h - s / 2, h - (hz + 0.032) * h - s / 2);
      ctx.globalCompositeOperation = "source-over";
    }
    /* four far birds, gliding */
    var span = e + 0.12, bx = -span + 2 * span * fract(t / 95 + 0.62), by = ay(E, 0.45, 0.060);
    ctx.globalAlpha = al;
    ctx.strokeStyle = E.bird;
    ctx.lineWidth = Math.max(1, h * 0.0016);
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var sz = (0.008 - i * 0.0005) * h, lift = 0.5 + 0.5 * Math.sin(t * 0.6 + i * 1.7);
      var x = w / 2 + (bx - i * 0.030 - 0.005 * i * i) * h;
      var y = h - (by + 0.012 * Math.sin(i * 2.3) - i * 0.006 + 0.006 * Math.sin(t * 0.21 + i)) * h;
      var ey = sz * (0.16 + 0.30 * lift), ty = sz * 0.20 * lift;
      ctx.moveTo(x - sz, y - ty); ctx.lineTo(x - 0.42 * sz, y - ey); ctx.lineTo(x, y);
      ctx.lineTo(x + 0.42 * sz, y - ey); ctx.lineTo(x + sz, y - ty);
    }
    ctx.stroke();
  }
};

/* the Voronoi edge tile behind Tide's caustics, computed once and tileable
   (the cell grid wraps), so the pattern repeats without a seam */
function causticTile(n, cells, c, seed) {
  var cv = makeCanvas(n, n), g = cv.getContext("2d");
  var img = g.createImageData(n, n), d = img.data;
  var pts = [], i, j;
  var R = rng(seed);
  for (i = 0; i < cells * cells; i++) pts.push([R(), R()]);
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      var px = x / n * cells, py = y / n * cells;
      var ix = Math.floor(px), iy = Math.floor(py);
      var d1 = 9, d2 = 9;
      for (j = -1; j <= 1; j++) {
        for (i = -1; i <= 1; i++) {
          var cx = ix + i, cy = iy + j;
          var p = pts[((cy + cells) % cells) * cells + ((cx + cells) % cells)];
          var vx = cx + p[0] - px, vy = cy + p[1] - py;
          var dd = Math.sqrt(vx * vx + vy * vy);
          if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
        }
      }
      var line = 1 - sstep(0, 0.20, d2 - d1);
      line *= line;
      var o = (y * n + x) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = Math.round(255 * line);
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/* 2 · Tide */
SCENES[1] = {
  build: function (E, w, h, W) {
    var L = layer(w, h), g = L.g;
    var top = E.top, hor = E.hor;
    /* on a phone the floor's horizon drops behind the top of the well and
       the surface comes down to the coping, as in the shader */
    var hz = ay(E, 0.60, -0.05), sy = ay(E, 0.78, 0.004);
    E.hz = hz;
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, css(top)); gr.addColorStop(0.45, css(mixc(top, hor, 0.45))); gr.addColorStop(1, css(mulc(hor, 1.08)));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    /* the surface overhead, and the floor's distance haze */
    var sh = (1 - sy) * h + 0.02 * h;
    gr = g.createLinearGradient(0, 0, 0, sh);
    gr.addColorStop(0, css(mixc(E.rim, E.key, 0.5), 0.10 + 0.04 * E.an)); gr.addColorStop(1, css(E.rim, 0));
    g.fillStyle = gr; g.fillRect(0, 0, w, sh);
    E.base = L.c;
    var cc = mixc(E.rim, E.key, 0.45);
    E.tile = causticTile(160, 5, cc, 21);
    E.tile2 = causticTile(128, 4, cc, 37);
    /* the haze over the far floor is the water's own colour at that
       height, so the floor fades into it with no line where it starts */
    var at = mixc(top, hor, 0.40);
    E.fog = layer(w, 0.3 * h);
    gr = E.fog.g.createLinearGradient(0, 0, 0, 0.3 * h);
    gr.addColorStop(0, css(at, 1)); gr.addColorStop(0.3, css(at, 0.7)); gr.addColorStop(1, css(at, 0));
    E.fog.g.fillStyle = gr; E.fog.g.fillRect(0, 0, w, 0.3 * h);
    /* the haze is opaque where it starts, so it has to be darkened by the
       quiet capsule exactly as the base under it is, or the middle of the
       floor would show a step */
    var kc = E.calm.width / w, fy = (1 - hz) * h;
    E.fog.g.globalCompositeOperation = "source-atop";
    E.fog.g.drawImage(E.calm, 0, fy * kc, E.calm.width, 0.3 * h * kc, 0, 0, w, 0.3 * h);
    E.ring = css(mixc(E.rim, E.key, 0.6), 1);
    E.pat = null; E.pat2 = null; E.patCtx = null;
    /* the surface overhead is far and faint enough to hold still; it is
       laid on through a fade, brightest overhead and gone by its horizon,
       so it reads as a far surface rather than a net */
    var ceil = Math.max(2, (1 - sy) * h);
    var CL = layer(w, ceil), cg = CL.g;
    cg.save();
    cg.scale(h / 420 * 0.7, h / 420 * 0.25);
    cg.fillStyle = cg.createPattern(E.tile, "repeat");
    cg.fillRect(0, 0, w / (h / 420 * 0.7), ceil / (h / 420 * 0.25));
    cg.restore();
    cg.globalCompositeOperation = "destination-in";
    var fg = cg.createLinearGradient(0, 0, 0, ceil);
    fg.addColorStop(0, "rgba(0,0,0,1)"); fg.addColorStop(1, "rgba(0,0,0,0)");
    cg.fillStyle = fg; cg.fillRect(0, 0, w, ceil);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.07 - 0.02 * E.an;
    g.drawImage(CL.c, 0, 0, w, ceil);
    g.restore();
  },
  draw: function (ctx, E, w, h, t, r, al, tu) {
    if (E.patCtx !== ctx) {
      E.pat = ctx.createPattern(E.tile, "repeat");
      E.pat2 = ctx.createPattern(E.tile2, "repeat");
      E.patCtx = ctx;
    }
    var sw = Math.sin(6.2831853 * tu / 7.2727);
    var fy = h * (1 - E.hz);
    var s = h / 420;
    /* the floor's caustics, twice over the whole floor: a small, faint
       layer for the distance and a large one for the near floor, crawling
       different ways and swelling with the two-bar wave; then the haze,
       which fades both into the blue toward the horizon with no seam.
       Each fill is exactly the floor in the pattern's own space, so no
       clip is needed, and it is laid on with plain source-over: faint
       light over dark water looks the same as added light, and a scaled
       pattern added with "lighter" is the one slow thing a software 2D
       canvas does here. */
    ctx.save();
    ctx.globalAlpha = al * (0.055 + 0.025 * sw);
    ctx.translate(0, fy);
    ctx.scale(s * 0.7, s * 0.3);
    ctx.translate(-t * 5, t * 4);
    ctx.fillStyle = E.pat2;
    ctx.fillRect(t * 5, -t * 4, w / (s * 0.7), (h - fy) / (s * 0.3));
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = al * (0.085 + 0.04 * sw);
    ctx.translate(0, fy);
    ctx.scale(s * 1.7, s * 0.6);
    ctx.translate(t * 6, t * 3);
    ctx.fillStyle = E.pat;
    ctx.fillRect(-t * 6, -t * 3, w / (s * 1.7), (h - fy) / (s * 0.6));
    ctx.restore();
    ctx.globalAlpha = al;
    ctx.drawImage(E.fog.c, 0, fy, w, 0.3 * h);
    /* the Quad: a ring of light rolling out across the floor */
    if (r > 0.001) {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = E.ring;
      for (var k = 0; k < 2; k++) {
        var ph = fract(t / 3.4 + 0.5 * k);
        var R = (0.05 + 0.9 * ph) * h;
        ctx.globalAlpha = al * r * win(ph) * 0.14 * (1 - 0.5 * ph);
        ctx.lineWidth = (0.03 + 0.04 * ph) * h;
        ctx.beginPath();
        ctx.ellipse(w / 2, h * (1 - 0.14) - R * 0.25, R * 1.3, R * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }
};

/* 3 · Rain on Leaves */
SCENES[2] = {
  build: function (E, w, h, W) {
    var L = layer(w, h), g = L.g;
    var top = E.top, hor = E.hor, e = w / h / 2;
    var s = Math.max(0.62, Math.min(1, w / h * 1.25));
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, css(top)); gr.addColorStop(0.6, css(mixc(top, hor, 0.6))); gr.addColorStop(1, css(hor));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    /* the lit gap in the canopy: on a phone, just above the coping */
    smear(g, w / 2, h * (1 - ay(E, 0.36, 0.03)), 0.9 * h, (0.28 - 0.18 * E.an) * h, mulc(hor, 1.35), 0.55);
    /* far leaves, drawn blurred by shadow: the shape is thrown off the
       canvas and only its soft shadow lands */
    g.save();
    g.shadowColor = css(mulc(mixc(top, hor, 0.5), 0.55), 0.75);
    /* shadow offsets and blur ignore the transform, so they are given in
       the layer's own pixels */
    g.shadowBlur = 0.02 * h * L.k;
    g.shadowOffsetX = w * 3 * L.k;
    var spr = [[-e - 0.05, 0.84, -0.30, 0.42], [e + 0.06, 0.66, 3.50, 0.40], [-0.12 * s, 1.14, -1.35, 0.36]];
    for (var i = 0; i < spr.length; i++) {
      var sp = spraySprite(spr[i][3] * s * h, 0.052 * s * h, 0.42, "#000", null, 40 + i);
      g.save();
      g.translate(w / 2 + spr[i][0] * h - w * 3, h - spr[i][1] * h);
      g.rotate(-spr[i][2]);
      g.drawImage(sp, -sp.width / 2, -sp.height / 2);
      g.restore();
    }
    g.restore();
    E.base = L.c;
    var dark = css(mulc(top, 0.30)), rim = css(E.rim, 0.22);
    E.sprays = [
      { cv: spraySprite(0.30 * s * h, 0.042 * s * h, 0.38, dark, rim, 11), x: -e - 0.02, y: 1.02, a: -0.55, k: 0.05 },
      { cv: spraySprite(0.28 * s * h, 0.040 * s * h, 0.36, dark, rim, 12), x: e + 0.02, y: 0.96, a: 3.75, k: -0.05 },
      { cv: spraySprite(0.25 * s * h, 0.038 * s * h, 0.40, dark, rim, 13), x: e + 0.04, y: 0.40, a: 3.05, k: 0.04 },
      { cv: spraySprite(0.24 * s * h, 0.036 * s * h, 0.40, dark, rim, 14), x: -e - 0.04, y: 0.22, a: 0.15, k: -0.04 }
    ];
    /* the rain is drawn as lines, not tiles: two batched paths a frame,
       a few dozen short strokes each, which costs next to nothing to fill */
    var Rr = rng(9);
    E.far = []; E.near = []; E.drops = [];
    var nf = Math.round(60 * e + 15), nn = Math.round(26 * e + 8), nd = Math.round(30 * e + 10);
    for (i = 0; i < nf; i++) E.far.push([Rr() * 2 - 1, Rr(), 0.06 + 0.06 * Rr(), 0.85 + 0.3 * Rr()]);
    for (i = 0; i < nn; i++) E.near.push([Rr() * 2 - 1, Rr(), 0.10 + 0.10 * Rr(), 0.85 + 0.3 * Rr()]);
    for (i = 0; i < nd; i++) E.drops.push([Rr() < 0.5 ? -1 : 1, Rr(), 0.02 + 0.02 * Rr(), 0.85 + 0.3 * Rr(), Rr()]);
    E.farCol = css(E.key, 0.09); E.nearCol = css(E.key, 0.14); E.dropCol = css(E.key, 0.55);
  },
  draw: function (ctx, E, w, h, t, r, al) {
    var e = w / h / 2;
    /* a streak per entry: the head falls, sliding right as it goes, the
       tail trailing up and to the left, as in the shader's slanted columns */
    function streaks(list, speed, col, lw) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (var i = 0; i < list.length; i++) {
        var S = list[i];
        var y = 1.15 - fract(S[1] + t * speed * S[3] / 1.3) * 1.3;
        var x = S[0] * (e + 0.1) + 0.12 * (1.15 - y);
        var X0 = w / 2 + x * h, Y0 = h - y * h;
        ctx.moveTo(X0 - 0.12 * S[2] * h, Y0 - S[2] * h);
        ctx.lineTo(X0, Y0);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = al;
    ctx.lineCap = "round";
    streaks(E.far, 0.20, E.farCol, Math.max(1, h * 0.0012));
    streaks(E.near, 0.34, E.nearCol, Math.max(1, h * 0.0018));
    var sn = Math.sin(t * 0.41 + 1.3);
    for (var i = 0; i < E.sprays.length; i++) {
      var S = E.sprays[i];
      drawSpray(ctx, S.cv, w / 2 + S.x * h, h - S.y * h, -S.a - sn * S.k);
    }
    /* the Quad: drops shaken from the near leaves, down both edges */
    if (r > 0.001) {
      ctx.globalAlpha = al * r;
      ctx.strokeStyle = E.dropCol;
      ctx.lineWidth = Math.max(1, h * 0.002);
      ctx.beginPath();
      for (i = 0; i < E.drops.length; i++) {
        var D = E.drops[i];
        var y = 1.0 - fract(D[1] + t * 0.9 * D[3]) * 0.8;
        var x = D[0] * (e - 0.06 * D[4]);
        var X0 = w / 2 + x * h, Y0 = h - y * h;
        ctx.moveTo(X0, Y0 - D[2] * h); ctx.lineTo(X0, Y0);
      }
      ctx.stroke();
    }
  }
};

/* 4 · Bamboo Grove */
SCENES[3] = {
  build: function (E, w, h, W) {
    var L = layer(w, h), g = L.g;
    var top = E.top, hor = E.hor, e = w / h / 2;
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, css(top)); gr.addColorStop(0.55, css(mixc(top, hor, 0.65))); gr.addColorStop(1, css(hor));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    smear(g, w / 2, h * (1 - ay(E, 0.28, 0.025)), 1.1 * h, (0.26 - 0.16 * E.an) * h, mulc(hor, 1.45), 0.55);
    /* the far rank: thin, a little darker than the fog, and thinned, as in
       the shader, so the grove reads as depth and not as a second grid */
    var R = rng(4);
    g.fillStyle = css(mulc(mixc(top, hor, 0.7), 0.72), 0.75);
    for (var x = -e; x < e; x += 0.10) {
      if (R() < 0.38) continue;
      var cx = w / 2 + (x + 0.03 + 0.04 * R()) * h, sw = (0.009 + 0.006 * R()) * h, lean = (R() - 0.5) * 0.03 * h;
      g.beginPath(); g.moveTo(cx - sw / 2, h); g.lineTo(cx + lean - sw / 2, 0); g.lineTo(cx + lean + sw / 2, 0); g.lineTo(cx + sw / 2, h); g.fill();
    }
    E.base = L.c;
    /* the light: one soft shaft, drawn three times at an angle */
    E.beam = makeCanvas(64, 256);
    var bg = E.beam.getContext("2d");
    var lg = bg.createLinearGradient(0, 0, 64, 0);
    var bc = mixc(E.key, E.rim, 0.25);
    lg.addColorStop(0, css(bc, 0)); lg.addColorStop(0.5, css(bc, 1)); lg.addColorStop(1, css(bc, 0));
    bg.fillStyle = lg; bg.fillRect(0, 0, 64, 256);
    bg.globalCompositeOperation = "destination-in";
    lg = bg.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, "rgba(0,0,0,1)"); lg.addColorStop(1, "rgba(0,0,0,0.05)");
    bg.fillStyle = lg; bg.fillRect(0, 0, 64, 256);
    /* the stalks that move: the middle rank and the near one */
    E.stalks = [];
    R = rng(8);
    var ranks = [[0.20, 0.020, 0.032, 0.016, 0, 0.45], [0.48, 0.044, 0.068, 0.020, 1, 0.30]];
    for (var ri = 0; ri < 2; ri++) {
      var rk = ranks[ri];
      for (x = Math.floor(-e / rk[0]) * rk[0]; x < e; x += rk[0]) {
        if (R() < rk[5]) continue;
        E.stalks.push({ x: x + (0.3 + 0.4 * R()) * rk[0], w: (rk[1] + (rk[2] - rk[1]) * R()) * h, sway: rk[3], ph: R() * 6.2831, near: rk[4], seg: (0.15 + 0.07 * R()) * h, off: R() });
      }
    }
    E.midFill = css(mulc(mixc(top, hor, 0.5), 0.75));
    E.midLit = css(E.key, 0.10);
    E.nearFill = css(mulc(top, 0.55));
    E.nearLit = css(E.key, 0.06);
    E.node = css(mulc(top, 0.35), 0.6);
    var s = Math.max(0.62, Math.min(1, w / h * 1.25));
    E.leaves = [
      { cv: spraySprite(0.22 * s * h, 0.016 * s * h, 0.30, css(mulc(top, 0.35)), null, 31), x: -e - 0.03, y: 1.04, a: -0.35, k: 0.04 },
      { cv: spraySprite(0.22 * s * h, 0.016 * s * h, 0.30, css(mulc(top, 0.35)), null, 32), x: e + 0.03, y: 1.02, a: 3.55, k: -0.04 }
    ];
  },
  draw: function (ctx, E, w, h, t, r, al) {
    var e = w / h / 2;
    /* 0.08 Hz in real time at full motion, whatever the world's own scale */
    var sway = 0.50265 / E.mot;
    ctx.globalCompositeOperation = "lighter";
    for (var b = 0; b < 3; b++) {
      var u = (0.16 + 0.31 * b) * 2 * e + 0.06 + 0.03 * Math.sin(t * 0.05 + b * 2);
      var bw = (0.035 + 0.015 * b) * Math.max(0.6, Math.min(1.4, 2 * e)) * h * 4;
      ctx.save();
      ctx.translate(u * h, 0);
      ctx.rotate(-0.40);
      ctx.globalAlpha = al * 0.10 * (0.5 + 0.5 * vn1(t * 0.035 + b * 7));
      ctx.drawImage(E.beam, -bw / 2, -0.1 * h, bw, h * 1.3);
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";
    /* the gust: two emitters half a cycle apart, crossing left to right */
    var gx = 0;
    for (var k = 0; k < 2; k++) { var ph = fract(t / 4.2 + 0.5 * k); gx += win(ph) * (-e - 0.3 + ph * (2 * e + 0.6)); }
    ctx.globalAlpha = al;
    for (var i = 0; i < E.stalks.length; i++) {
      var S = E.stalks[i];
      var lean = (S.sway * Math.sin(t * sway + S.ph) + 0.10 * r * Math.exp(-Math.pow((S.x - gx) / 0.30, 2))) * 1.2 * h;
      var x0 = w / 2 + S.x * h;
      /* a shear about the foot of the stalk: the top leans, the root stays */
      ctx.save();
      ctx.transform(1, 0, -lean / h, 1, 0, 0);
      var px = x0 + lean;
      ctx.fillStyle = S.near ? E.nearFill : E.midFill;
      ctx.fillRect(px - S.w / 2, 0, S.w, h);
      ctx.fillStyle = S.near ? E.nearLit : E.midLit;
      ctx.fillRect(px - S.w / 2, 0, S.w * 0.22, h);
      ctx.fillStyle = E.node;
      for (var y = (S.off * S.seg) % S.seg; y < h; y += S.seg) ctx.fillRect(px - S.w / 2, y, S.w, Math.max(1, h * 0.003));
      ctx.restore();
    }
    var sl = Math.sin(t * sway + 0.7);
    for (i = 0; i < E.leaves.length; i++) {
      var Lf = E.leaves[i];
      drawSpray(ctx, Lf.cv, w / 2 + Lf.x * h, h - Lf.y * h, -Lf.a - sl * Lf.k);
    }
  }
};

/* a curtain of aurora on its own canvas: green at the lower edge rising to
   violet and nothing, combed into rays by a mask of vertical stripes. The
   lower edge fades in over an eighth of the sprite, so the slices it is
   drawn in, each at its own height, overlap into one soft edge instead of
   a staircase. */
function curtainSprite(cw, ch, green, seed) {
  var cv = makeCanvas(cw, ch), g = cv.getContext("2d");
  var gr = g.createLinearGradient(0, ch, 0, 0);
  gr.addColorStop(0, css(green, 0));
  gr.addColorStop(0.05, css(green, 0.35));
  gr.addColorStop(0.12, css(green, 0.9));
  gr.addColorStop(0.30, css(mixc(green, [90, 60, 220], 0.4), 0.5));
  gr.addColorStop(0.7, css([90, 60, 220], 0.15));
  gr.addColorStop(1, css([90, 60, 220], 0));
  g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
  /* the rays as a mask on a canvas of their own, applied in one go:
     destination-in clears everything outside what is drawn, so it has to
     be a single full-size draw rather than one per stripe */
  var mk = makeCanvas(cw, 1), mg = mk.getContext("2d");
  for (var x = 0; x < cw; x += 2) {
    var a = vn1(x * 0.06 + seed); a = 0.45 + 0.55 * a * a;
    /* and along its length it gathers and thins, as the shader's does;
       painted into the sprite, so neighbouring slices always agree */
    var gth = vn1(x * 0.012 + seed * 3);
    a *= 0.3 + 0.7 * gth * gth * (3 - 2 * gth);
    mg.fillStyle = "rgba(0,0,0," + a.toFixed(3) + ")";
    mg.fillRect(x, 0, 2, 1);
  }
  g.globalCompositeOperation = "destination-in";
  g.drawImage(mk, 0, 0, cw, ch);
  return cv;
}

/* 5 · Aurora */
SCENES[4] = {
  build: function (E, w, h, W) {
    var L = layer(w, h), g = L.g;
    var top = E.top, hor = E.hor;
    var hill0 = ay(E, 0.085, -0.022);
    E.tall = 1 - 0.5 * E.an;
    var gr = g.createLinearGradient(0, 0, 0, h * (1 - hill0 + 0.03));
    gr.addColorStop(0, css(top)); gr.addColorStop(1, css(hor));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    var R = rng(5);
    /* still stars, sized in the layer's own pixels so none is lost when the
       layer is stored small: four in ten of what this sky once held, on
       the shader's power law. The faint ones are painted in; the few
       bright ones are kept aside and breathe, slowly, every frame. */
    var n = Math.round(w * h * L.k * L.k / 3500), ymax = (1 - hill0 - 0.04) * h;
    E.bright = [];
    for (var i = 0; i < n; i++) {
      var y = R() * ymax, x = R() * w, b = starB(R());
      if (b > 0.3) { E.bright.push([x / w, y / h, b, 0.03 + 0.06 * R(), R()]); continue; }
      var ss = 1.1 / L.k;
      g.fillStyle = "rgba(220,230,255," + (0.12 + 0.9 * b).toFixed(3) + ")";
      g.fillRect(x, y, ss, ss);
    }
    E.star = css([220, 230, 255], 1);
    g.beginPath(); g.moveTo(0, h);
    var amp = 1 - 0.45 * E.an;
    for (x = 0; x <= w + 4; x += 4) {
      var qx = (x - w / 2) / h;
      g.lineTo(x, h - (hill0 + 0.055 * fbm(qx * 2.2 + 4) * amp) * h);
    }
    g.lineTo(w, h); g.closePath();
    g.fillStyle = css(mulc(top, 0.55)); g.fill();
    E.base = L.c;
    E.c1 = curtainSprite(512, Math.round(0.3 * h), E.rim, 1.0);
    E.c2 = curtainSprite(512, Math.round(0.24 * h), E.rim, 7.0);
    E.c3 = curtainSprite(512, Math.round(0.28 * h), E.rim, 13.0);
  },
  draw: function (ctx, E, w, h, t, r, al) {
    var e = w / h / 2, tall = E.tall;
    /* the bright stars, breathing at a tenth of a hertz at most */
    ctx.fillStyle = E.star;
    var ss = Math.max(1, h * 0.0024);
    for (var i = 0; i < E.bright.length; i++) {
      var S = E.bright[i];
      ctx.globalAlpha = al * Math.min(1, 0.12 + 0.9 * S[2]) * (0.7 + 0.6 * breath(t * S[3] + S[4]));
      ctx.fillRect(S[0] * w - ss / 2, S[1] * h - ss / 2, ss, ss);
    }
    ctx.globalCompositeOperation = "lighter";
    /* each curtain in slices, every slice at the height of the wandering
       edge above it */
    function curtain(cv, y0, seed, tt, a, reach) {
      /* about twenty slices to a screen-height of width: enough that the
         step between neighbours is a pixel or two, lost in the sprite's
         soft lower edge */
      var N = Math.max(10, Math.min(32, Math.round(20 * w / h)));
      var sw = cv.width * Math.min(1, w / h / 1.6) / N, dw = w / N, ch = cv.height * tall;
      for (var i = 0; i < N; i++) {
        var qx = ((i + 0.5) * dw - w / 2) / h;
        if (qx > reach) break;
        var yc = y0 + (0.048 * Math.sin(qx * 2.0 + tt * 0.05 + seed) + 0.022 * Math.sin(qx * 4.1 - tt * 0.07 + seed * 1.7)) * tall;
        /* slices meet exactly, on whole pixels: added light where two
           overlapped would draw a bright seam at every slice, a fence */
        var x0 = Math.round(i * dw), x1 = Math.round((i + 1) * dw);
        ctx.globalAlpha = a;
        ctx.drawImage(cv, i * sw, 0, sw, cv.height, x0, h - yc * h - ch * 0.94, x1 - x0, ch);
      }
    }
    curtain(E.c1, ay(E, 0.58, 0.040), 0.0, t, al * 0.30, 9);
    curtain(E.c2, ay(E, 0.40, 0.016), 3.7, t * 0.8, al * 0.14, 9);
    if (r > 0.001) {
      var open = sstep(0, 0.4, r);
      curtain(E.c3, ay(E, 0.76, 0.068), 8.3, t * 1.2, al * 0.30 * r, -e - 0.2 + open * (2 * e + 0.4));
    }
    ctx.globalCompositeOperation = "source-over";
  }
};

/* 6 · Moon Pool */
SCENES[5] = {
  build: function (E, w, h, W) {
    var L = layer(w, h), g = L.g;
    var top = E.top, hor = E.hor, e = w / h / 2;
    /* the moon lies beside the well on a wide screen and under its foot on
       a phone, where the floor shows */
    E.mx = lerp(E.wx + Math.max(0.30, Math.min(0.46, 0.6 * e)), E.wx + 0.02, E.an);
    E.my = lerp(0.065, 0.040, E.an);
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, css(mixc(top, E.key, 0.04 + 0.02 * E.an))); gr.addColorStop(0.25, css(top)); gr.addColorStop(1, css(hor));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    gr = g.createLinearGradient(0, h * 0.84, 0, h);
    gr.addColorStop(0, css(mulc(hor, 1.2), 0)); gr.addColorStop(1, css(mulc(hor, 1.6), 1));
    g.fillStyle = gr; g.fillRect(0, h * 0.84, w, h * 0.16);
    smear(g, w / 2 + E.mx * h, h * (1 - 0.05), 0.6 * h, 0.06 * h, E.key, 0.08);
    E.base = L.c;
    /* the shafts: a fan of soft wedges from a point above the screen */
    E.rays = layer(w, h);
    var rg = E.rays.g, R = rng(6);
    var sx = w / 2 - 0.12 * w / h * h, sy = -0.45 * h;
    /* one soft ray, faded across its width and along its length, laid down
       sixteen times at different angles and strengths */
    var ray = makeCanvas(64, 256), yg = ray.getContext("2d");
    var lg = yg.createLinearGradient(0, 0, 64, 0);
    var rc = mixc(E.key, E.rim, 0.35);
    lg.addColorStop(0, css(rc, 0)); lg.addColorStop(0.5, css(rc, 1)); lg.addColorStop(1, css(rc, 0));
    yg.fillStyle = lg; yg.fillRect(0, 0, 64, 256);
    yg.globalCompositeOperation = "destination-in";
    lg = yg.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, "rgba(0,0,0,0)"); lg.addColorStop(0.3, "rgba(0,0,0,1)"); lg.addColorStop(1, "rgba(0,0,0,0)");
    yg.fillStyle = lg; yg.fillRect(0, 0, 64, 256);
    for (var i = 0; i < 16; i++) {
      var a = (R() - 0.5) * 1.3, wd = (0.03 + 0.10 * R()) * h, len = 1.7 * h;
      rg.save(); rg.translate(sx, sy); rg.rotate(a);
      rg.globalAlpha = 0.10 + 0.14 * R();
      rg.drawImage(ray, -wd / 2, 0.15 * h, wd, len);
      rg.restore();
    }
    E.raysX = sx; E.raysY = sy;
    /* a faint still copy in the base, so the moving one needs only one draw */
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.25;
    g.drawImage(E.rays.c, 0, 0, w, h);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    E.moon = dotSprite(0.3 * h, E.key, 0.55);
    E.mote = dotSprite(Math.max(4, 0.008 * h), E.par, 0.9);
    E.motes = [];
    for (i = 0; i < 24; i++) E.motes.push([R() * 2 - 1, R(), 0.6 + 0.8 * R(), R() * 6.28, 0.5 + R()]);
  },
  draw: function (ctx, E, w, h, t, r, al) {
    ctx.globalCompositeOperation = "lighter";
    ctx.save();
    ctx.translate(E.raysX, E.raysY);
    ctx.rotate(0.03 * Math.sin(t * 0.05));
    ctx.globalAlpha = al * (0.45 + 0.15 * Math.sin(t * 0.11));
    ctx.drawImage(E.rays.c, -E.raysX, -E.raysY, w, h);
    ctx.restore();
    /* the moon on the floor, wobbling slowly, brighter for a Quad */
    var mw = 0.30 * h * (1 + 0.04 * Math.sin(t * 0.45)), mh = 0.06 * h;
    ctx.globalAlpha = al * (0.55 + 0.45 * r);
    ctx.drawImage(E.moon, w / 2 + E.mx * h - mw / 2, h * (1 - E.my) - mh / 2, mw, mh);
    /* plankton */
    var sz = E.mote.width;
    ctx.globalAlpha = al * 0.6;
    for (var i = 0; i < E.motes.length; i++) {
      var M = E.motes[i];
      var y = fract(M[1] + t * 0.012 * M[2]) * 1.1 - 0.05;
      var x = M[0] * w / h / 2 + 0.025 * Math.sin(t * 0.11 * M[2] + M[3] + y * 3);
      var s = sz * M[4];
      ctx.drawImage(E.mote, w / 2 + x * h - s / 2, h - y * h - s / 2, s, s);
    }
    ctx.globalCompositeOperation = "source-over";
  }
};

/* 7 · Lanterns */
SCENES[6] = {
  build: function (E, w, h, W) {
    var L = layer(w, h), g = L.g;
    var top = E.top, hor = E.hor;
    /* on a phone the hills lie along the coping, and the lanterns rise from
       behind them into the band above the mouth */
    var base = ay(E, 0.055, -0.008), amp = 1 - 0.4 * E.an;
    E.lbase = base;
    var gr = g.createLinearGradient(0, 0, 0, h * (1 - base));
    gr.addColorStop(0, css(top)); gr.addColorStop(0.6, css(mixc(top, hor, 0.55))); gr.addColorStop(1, css(hor));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    smear(g, w / 2, h * (1 - base), 1.3 * h, (0.25 - 0.13 * E.an) * h, E.rim, 0.10);
    g.beginPath(); g.moveTo(0, h);
    for (var x = 0; x <= w + 4; x += 4) { var hq = (x - w / 2) / h; g.lineTo(x, h - (base + 0.04 * amp * (0.62 * vn1(hq * 1.6 + 2) + 0.38 * vn1(hq * 3.3 + 9.1))) * h); }
    g.lineTo(w, h); g.closePath();
    g.fillStyle = css(mixc(mulc(top, 0.45), E.rim, 0.012)); g.fill();
    E.base = L.c;
    /* a 2D canvas adds light in sRGB, which washes the peach of the rim
       light toward pink; nudging it toward amber keeps them reading as
       lanterns rather than dust */
    var warm = mixc(E.rim, [255, 140, 50], 0.45), pale = mixc(E.par, [255, 190, 90], 0.35);
    E.spr = [
      [dotSprite(0.016 * h, warm, 0.95, true), dotSprite(0.016 * h, pale, 0.95, true)],
      [dotSprite(0.04 * h, warm, 0.85, true), dotSprite(0.04 * h, pale, 0.85, true)],
      [dotSprite(0.13 * h, warm, 0.40, true), dotSprite(0.13 * h, pale, 0.40, true)]
    ];
    /* three depths, and about forty in a hundred fewer than there were; on
       a phone, where they all live in the band above the mouth, fewer
       again, so the band holds about what that much sky would */
    var R = rng(7), e = w / h / 2, k = 1 - 0.4 * E.an;
    E.lan = [];
    var counts = [Math.max(3, Math.round((27 * e + 6) * k)), Math.max(2, Math.round((13 * e + 4) * k)), Math.max(1, Math.round((3 * e + 2) * k))];
    var rises = [0.005, 0.010, 0.017];
    for (var d = 0; d < 3; d++) {
      for (var i = 0; i < counts[d]; i++) E.lan.push({ d: d, x: (R() * 2 - 1) * (e + 0.05), y: R(), rise: rises[d] * (0.85 + 0.3 * R()), c: R() < 0.5 ? 0 : 1, ph: R() * 6.28, s: 0.75 + 0.5 * R(), keep: R() });
    }
  },
  draw: function (ctx, E, w, h, t, r, al) {
    ctx.globalCompositeOperation = "lighter";
    var alphas = [0.48, 0.65, 0.40];
    var base = E.lbase, span = lerp(1.1, 1.04, E.an) - base, fadeTop = base + 0.10 - 0.06 * E.an;
    /* on a phone the band is small, so the near lights are drawn smaller */
    var shrink = [1, 1 - 0.25 * E.an, 1 - 0.5 * E.an];
    for (var i = 0; i < E.lan.length; i++) {
      var Ln = E.lan[i];
      var y = base + 0.02 + fract(Ln.y + t * Ln.rise / span) * span;
      /* thickest just above the hills, thinning as they climb */
      var dens = 1 - 0.8 * sstep(0, 0.9, (y - base) / (1 - base));
      var on = sstep(0, 0.12, dens - Ln.keep * 0.9);
      if (on <= 0) continue;
      var a = al * alphas[Ln.d] * on * sstep(base + 0.005, fadeTop, y) * (0.85 + 0.15 * Math.sin(t * 0.19 + Ln.ph));
      var cv = E.spr[Ln.d][Ln.c], s = cv.width * Ln.s * shrink[Ln.d];
      var x = w / 2 + (Ln.x + 0.012 * Math.sin(t * 0.22 + Ln.ph)) * h;
      ctx.globalAlpha = a;
      ctx.drawImage(cv, x - s / 2, h - y * h - s / 2, s, s * 1.12);
    }
    /* the Quad: a cluster of six, nearer and brighter, lifting together */
    if (r > 0.001) {
      for (var k = 0; k < 2; k++) {
        var cyc = t / 10 + 0.5 * k, ph = fract(cyc), hc = h1(Math.floor(cyc) * 7.13 + k);
        var side = hc < 0.5 ? -1 : 1;
        var cx = lerp(side * (0.25 + 0.17 * fract(hc * 7)) * w / h, side * 0.11 - 0.02, E.an);
        var cy = lerp(0.12 + 0.55 * ph, base + 0.02 + 0.12 * ph, E.an);
        ctx.globalAlpha = al * r * win(ph) * 0.9;
        for (var j = 0; j < 6; j++) {
          var cvj = E.spr[1][j % 2], sj = cvj.width * (0.55 + 0.2 * h1(j + 3));
          var lx = w / 2 + (cx + Math.sin(j * 2.4) * 0.05 + 0.006 * Math.sin(t * 0.3 + j)) * h;
          var ly = h - (cy + Math.cos(j * 1.9) * 0.04 + j * 0.006) * h;
          ctx.drawImage(cvj, lx - sj / 2, ly - sj / 2, sj, sj * 1.12);
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }
};

/* 8 · Snowfall */
SCENES[7] = {
  build: function (E, w, h, W) {
    var L = layer(w, h), g = L.g;
    var top = mulc(E.top, 0.85), hor = mulc(E.hor, 0.85);
    /* on a phone the treeline stands along the coping, a little shorter */
    var ground = ay(E, 0.045, -0.014), th = 1 - 0.3 * E.an;
    var gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, css(top)); gr.addColorStop(0.5, css(mixc(top, hor, 0.45))); gr.addColorStop(1, css(hor));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    smear(g, w / 2, h * (1 - ground - 0.035), 1.4 * h, 0.12 * h * th, E.hor, 0.35);
    function firs(base, cell, hmin, hmax, seed, fill) {
      var R = rng(seed);
      g.fillStyle = fill;
      for (var x = -cell; x < w + cell; x += cell * h) {
        var H = (hmin + (hmax - hmin) * R()) * h, hw = cell * h * (0.55 + 0.25 * R()), cx = x + R() * cell * h * 0.4;
        g.beginPath(); g.moveTo(cx - hw, h - base * h); g.lineTo(cx, h - base * h - H); g.lineTo(cx + hw, h - base * h); g.closePath(); g.fill();
      }
      g.fillRect(0, h - base * h - 1, w, base * h + 1);
    }
    firs(ground + 0.018 * th, 0.022, 0.012 * th, 0.035 * th, 3, css(mixc(top, hor, 0.45), 0.9));
    firs(ground, 0.034, 0.02 * th, 0.065 * th, 7, css(mulc(E.top, 0.55)));
    /* the snow on the ground, pale under the trees and darkening toward us,
       so a field that fills the sides of a phone is not a pale wall */
    var gy = h - (ground - 0.012) * h;
    gr = g.createLinearGradient(0, gy, 0, gy + 0.5 * h);
    gr.addColorStop(0, css(mulc(E.hor, 0.85))); gr.addColorStop(1, css(mulc(E.hor, 0.40)));
    g.fillStyle = gr; g.fillRect(0, gy, w, h - gy + 1);
    E.base = L.c;
    E.fl = [dotSprite(Math.max(4, 0.006 * h), E.key, 0.9), dotSprite(Math.max(5, 0.011 * h), E.key, 0.85), dotSprite(Math.max(8, 0.026 * h), E.key, 0.6)];
    var R = rng(8), e = w / h / 2;
    E.snow = [];
    /* fewer far flakes than a sky has stars, so it never reads as one */
    var counts = [Math.round(36 * e + 8), Math.round(18 * e + 5), Math.round(5 * e + 3)];
    var falls = [0.016, 0.032, 0.060];
    for (var d = 0; d < 3; d++) for (var i = 0; i < counts[d]; i++) E.snow.push({ d: d, x: R() * 2 - 1, y: R(), f: falls[d], ph: R() * 6.28, sp: 0.6 + 0.8 * R(), s: 0.7 + 0.6 * R(), a: 0.55 + 0.45 * R() });
  },
  draw: function (ctx, E, w, h, t, r, al, tu, ts) {
    var e = w / h / 2;
    var alphas = [0.40, 0.6, 0.45];
    for (var i = 0; i < E.snow.length; i++) {
      var S = E.snow[i];
      var y = 1.05 - fract(S.y + ts * S.f / 1.1) * 1.1;
      var x = S.x * (e + 0.03) + 0.004 * (S.d + 1) * Math.sin(ts * 0.35 * S.sp + S.ph);
      var cv = E.fl[S.d], s = cv.width * S.s;
      ctx.globalAlpha = al * alphas[S.d] * S.a * (1 + 0.25 * r);
      /* a little taller than wide: a flake in motion, not a star */
      ctx.drawImage(cv, w / 2 + x * h - s / 2, h - y * h - s * 0.7, s, s * 1.4);
    }
  }
};

/* 9 · Mountain Bells */
function bellRidge(x, base, amp, f, seed) {
  var n = fbm(x * f + seed), pk = 1 - Math.abs(2 * vn1(x * f * 0.7 + seed * 1.3) - 1);
  return base + amp * (0.65 * n + 0.35 * pk * pk);
}
SCENES[8] = {
  build: function (E, w, h, W) {
    var L = layer(w, h), g = L.g;
    var top = E.top, hor = E.hor, e = w / h / 2;
    /* on a phone the far ridge rises from the coping and the nearer two sit
       behind the well, lower and flatter, as in the shader */
    var vs = 1 - 0.55 * E.an;
    var b1 = ay(E, 0.40, 0.012), b2 = ay(E, 0.27, -0.030), b3 = ay(E, 0.12, -0.085);
    E.vs = vs; E.b2 = b2;
    var gr = g.createLinearGradient(0, 0, 0, h * (1 - (b1 - 0.02 + 0.06 * E.an)));
    gr.addColorStop(0, css(mixc(top, hor, 0.3 * E.an))); gr.addColorStop(1, css(mulc(hor, 1.2)));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    var mist = mixc(mulc(hor, 1.45), E.rim, 0.05);
    /* far to near, each ridge darker, with mist lying level in the valley in
       front of it, just below the next ridge's crest */
    var rid = [[b1, 0.14 * vs, 1.6, 2.0, mulc(hor, 0.66), b2 + 0.085 * vs, 0.75],
               [b2, 0.11 * vs, 2.3, 9.0, mixc(mulc(hor, 0.34), top, 0.12), b3 + 0.07 * vs, 0.70],
               [b3, 0.09 * vs, 3.1, 17.0, mixc(mulc(hor, 0.06), top, 0.42), b3 - 0.02 * vs, 0.45]];
    for (var i = 0; i < 3; i++) {
      var Rr = rid[i];
      g.beginPath(); g.moveTo(0, h);
      for (var x = 0; x <= w + 4; x += 4) g.lineTo(x, h - bellRidge((x - w / 2) / h, Rr[0], Rr[1], Rr[2], Rr[3]) * h);
      g.lineTo(w, h); g.closePath();
      g.fillStyle = css(Rr[4]); g.fill();
      var R = rng(20 + i);
      for (var k = 0; k < 10; k++) smear(g, R() * w, h - (Rr[5] - 0.012 + 0.024 * R()) * h, (0.12 + 0.2 * R()) * h, 0.03 * h * vs, mixc(mist, top, i * 0.12), 0.40 * Rr[6]);
    }
    var bx = lerp(-Math.min(e - 0.16, 0.48), E.wx - 0.06, E.an);
    /* a little below the crest, as in the shader: a light on the mountainside */
    E.bx = bx; E.by = b1 + 0.14 * vs * 0.12;
    smear(g, w / 2 + bx * h, h - E.by * h, 0.012 * h, 0.006 * h, E.key, 0.7);
    E.base = L.c;
    E.drift = layer(w, 0.14 * h);
    var Rd = rng(30);
    for (k = 0; k < 12; k++) smearWrap(E.drift.g, Rd() * w, (0.3 + 0.4 * Rd()) * 0.14 * h, (0.1 + 0.2 * Rd()) * h, 0.025 * h, mist, 0.30, w);
    E.ring = css(mixc(E.rim, E.key, 0.5), 1);
  },
  draw: function (ctx, E, w, h, t, r, al) {
    var vs = E.vs, dh = 0.14 * h * vs;
    var ox = -fract(t * 0.010 / Math.max(0.5, w / h)) * w;
    var y1 = h - (E.b2 + 0.085 * vs) * h - dh / 2, y2 = h - ay(E, 0.62, 0.075) * h - dh / 2;
    /* on a phone the band is small and everything in it is near: the mist
       and the rings are drawn more quietly there */
    var qa = 1 - 0.4 * E.an;
    ctx.globalAlpha = al * 0.7 * qa;
    ctx.drawImage(E.drift.c, ox, y1, w, dh);
    ctx.drawImage(E.drift.c, ox + w, y1, w, dh);
    ctx.globalAlpha = al * 0.45 * qa;
    ctx.drawImage(E.drift.c, -ox - w * 0.5, y2, w, dh);
    ctx.drawImage(E.drift.c, -ox + w * 0.5, y2, w, dh);
    /* the bell's rings, spreading flat across the valley */
    var cx = w / 2 + E.bx * h, cy = h - E.by * h;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = E.ring;
    var rs = 1 - 0.6 * E.an;
    for (var k = 0; k < 3; k++) {
      var ph = fract(t / 27 + k / 3), R = (0.03 + 1.1 * ph * rs) * h;
      ctx.globalAlpha = al * 0.07 * qa * Math.pow(1 - ph, 1.6) * sstep(0, 0.05, ph);
      ctx.lineWidth = (0.010 + 0.025 * ph) * h;
      ctx.beginPath(); ctx.ellipse(cx, cy, R, R / 2.4, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (r > 0.001) {
      for (k = 0; k < 2; k++) {
        ph = fract(t / 5 + 0.5 * k); R = (0.05 + 1.7 * ph * rs) * h;
        ctx.globalAlpha = al * r * win(ph) * 0.20 * qa;
        ctx.lineWidth = (0.02 + 0.04 * ph) * h;
        ctx.beginPath(); ctx.ellipse(cx, cy, R, R / 2.4, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }
};

/* 10 · Starfield */
SCENES[9] = {
  build: function (E, w, h, W) {
    var L = layer(w, h), g = L.g;
    var top = E.top, hor = E.hor;
    /* on a phone the water line lies just above the coping */
    var hz = ay(E, 0.33, 0.030), Yh = h - hz * h;
    E.hz = hz; E.vs = 1 - 0.75 * E.an;
    var gr = g.createLinearGradient(0, 0, 0, Yh);
    gr.addColorStop(0, css(top)); gr.addColorStop(1, css(hor));
    g.fillStyle = gr; g.fillRect(0, 0, w, Yh);
    gr = g.createLinearGradient(0, Yh, 0, h);
    gr.addColorStop(0, css(mulc(hor, 0.75))); gr.addColorStop(1, css(mulc(top, 0.6)));
    g.fillStyle = gr; g.fillRect(0, Yh, w, h - Yh);
    E.base = L.c;
    /* the sky that turns: a square big enough to cover the screen at any
       angle about the pole, painted once at a modest size */
    var D = Math.sqrt(w * w + 3.7 * h * h) * 1.03;
    var k = Math.min(1, 1100 / D);
    var sk = makeCanvas(D * k, D * k), sg = sk.getContext("2d");
    sg.scale(k, k);
    var R = rng(10);
    for (var i = 0; i < 16; i++) {
      var c = R() < 0.5 ? [90, 35, 150] : [35, 65, 160];
      smear(sg, R() * D, R() * D, (0.15 + 0.25 * R()) * h, (0.06 + 0.1 * R()) * h, c, 0.30);
    }
    /* stars in the sprite's own pixels, at least a pixel and a half so they
       survive being stored small and turn without twinkling: four in ten
       of what this sky once held, on the shader's power law. The bright
       few are kept aside, turned with the sky and breathing, each frame. */
    var n = Math.round(D * D * k * k / 2250);
    E.bright = [];
    for (i = 0; i < n; i++) {
      var b = starB(R()), x = R() * D, y = R() * D;
      if (b > 0.45) { E.bright.push([x - D / 2, y - D / 2, b, 0.03 + 0.06 * R(), R()]); continue; }
      sg.fillStyle = "rgba(255,246,230," + (0.15 + 0.9 * b).toFixed(3) + ")";
      var s = 1.4 / k;
      sg.fillRect(x, y, s, s);
    }
    E.sky = sk; E.D = D;
    E.dot = dotSprite(Math.max(4, 0.007 * h), [255, 246, 230], 1);
    E.glow = layer(w, 0.05 * h);
    smear(E.glow.g, w / 2, 0.025 * h, w, 0.012 * h, mulc(hor, 1.6), 0.8);
    /* the falling star, as a sprite: a streak brightening to its head */
    var sl = Math.round(0.12 * h), st = Math.max(3, Math.round(0.008 * h));
    E.streak = makeCanvas(sl, st);
    var zg = E.streak.getContext("2d");
    var lg = zg.createLinearGradient(0, 0, sl, 0);
    lg.addColorStop(0, css(E.key, 0)); lg.addColorStop(1, css(E.key, 1));
    zg.fillStyle = lg;
    zg.fillRect(0, st / 2 - Math.max(0.6, st * 0.18), sl, Math.max(1.2, st * 0.36));
  },
  draw: function (ctx, E, w, h, t, r, al) {
    var hz = E.hz, vs = E.vs, Yh = h - hz * h, px = w / 2, py = h - 1.25 * h, D = E.D;
    var ang = t * 0.0105, ca = Math.cos(-ang), sa = Math.sin(-ang);
    var ds = E.dot.width;
    /* the sky, then the water: the same sky turned the same way, mirrored
       at the water line and darkened; the bright stars are drawn into
       both, each at its turned position */
    for (var m = 0; m < 2; m++) {
      ctx.save();
      ctx.beginPath();
      if (m) ctx.rect(0, Yh, w, h - Yh); else ctx.rect(0, 0, w, Yh);
      ctx.clip();
      ctx.globalAlpha = al * (m ? 0.55 : 1);
      if (m) { ctx.translate(0, 2 * Yh); ctx.scale(1, -1); }
      ctx.translate(px, py);
      ctx.save(); ctx.rotate(-ang); ctx.drawImage(E.sky, -D / 2, -D / 2, D, D); ctx.restore();
      ctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < E.bright.length; i++) {
        var S = E.bright[i];
        var x = S[0] * ca - S[1] * sa, y = S[0] * sa + S[1] * ca;
        ctx.globalAlpha = al * (m ? 0.45 : 0.9) * S[2] * (0.7 + 0.6 * breath(t * S[3] + S[4]));
        var s = ds * (0.6 + 0.6 * S[2]);
        ctx.drawImage(E.dot, x - s / 2, y - s / 2, s, s);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    }
    ctx.globalAlpha = al;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(E.glow.c, 0, Yh - 0.025 * h, w, 0.05 * h);
    /* the Quad: a falling star low over the water, and its reflection */
    if (r > 0.001) {
      var e = w / h / 2, sl = E.streak.width, st = E.streak.height;
      for (var k = 0; k < 2; k++) {
        var cyc = t / 4.0 + 0.5 * k, ph = fract(cyc), hs = h1(Math.floor(cyc) * 3.17 + k * 1.1);
        var dir = hs < 0.5 ? 1 : -1;
        var ax = -dir * (e + 0.1), ay2 = hz + (0.20 + 0.10 * fract(hs * 5)) * vs, bx = dir * (e + 0.1), by = hz + (0.05 + 0.05 * fract(hs * 9)) * vs;
        var hx = px + (ax + (bx - ax) * ph) * h, hy = h - (ay2 + (by - ay2) * ph) * h;
        var ang2 = Math.atan2(-(by - ay2), bx - ax);
        for (var mm = 0; mm < 2; mm++) {
          ctx.save();
          if (mm) { ctx.translate(0, 2 * Yh); ctx.scale(1, -1); }
          ctx.translate(hx, hy); ctx.rotate(ang2);
          ctx.globalAlpha = al * r * win(ph) * (mm ? 0.4 : 0.85);
          ctx.drawImage(E.streak, -sl, -st / 2);
          ctx.restore();
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }
};

/* the quiet capsule for 2D: the middle of the screen a little darker. On a
   phone it stops at the mouth, because the band above it is all of the
   world there is to see. */
function calmLayer(w, h, an, mo) {
  var L = layer(w, h), g = L.g;
  var hw = Math.min(w * 0.5, 0.26 * h);
  var gr = g.createLinearGradient(w / 2 - hw * 1.6, 0, w / 2 + hw * 1.6, 0);
  gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.3, "rgba(0,0,0,0.16)");
  gr.addColorStop(0.7, "rgba(0,0,0,0.16)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "destination-in";
  var vg = g.createLinearGradient(0, 0, 0, h);
  var m = 1 - mo, top = 0.3 * (1 - an);
  if (an > 0 && m > 0.06) {
    vg.addColorStop(0, "rgba(0,0,0," + top.toFixed(3) + ")");
    vg.addColorStop(Math.max(0.01, m - 0.04), "rgba(0,0,0," + top.toFixed(3) + ")");
    vg.addColorStop(m, "rgba(0,0,0,1)");
  } else {
    vg.addColorStop(0, "rgba(0,0,0,0.3)"); vg.addColorStop(0.15, "rgba(0,0,0,1)");
  }
  vg.addColorStop(0.9, "rgba(0,0,0,1)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  return L.c;
}

var P2 = { cache: [], calm: null, cw: 0, ch: 0, ck: "" };
/* the frame's composition for 2D: how tall the screen is decides the
   anchor exactly as gfx3d's uAnchor does; the mouth and the well's centre
   come from the caller when it knows them (gfx2d may pass
   {mouth, wellX} in uv), and otherwise from where the layout puts them on
   a phone */
function frameOf(w, h, fr) {
  var raw = Math.max(0, Math.min(1, (h / w - 1.3) / 0.8));
  var an = sstep(0.1, 0.7, raw);
  var mo = fr && fr.mouth > 0.3 && fr.mouth < 1 ? +fr.mouth : 0.865;
  var wxu = fr && fr.wellX > 0 && fr.wellX < 1 ? +fr.wellX : 0.5 - 0.05 * an;
  return { an: an, mo: mo, wx: (wxu - 0.5) * w / h, k: an.toFixed(2) + ":" + mo.toFixed(3) + ":" + wxu.toFixed(3) };
}
/* the cached layers for one world at one size: built on first use, kept
   for the three most recently drawn worlds */
function entry(world, w, h, F) {
  var c = P2.cache, i;
  for (i = 0; i < c.length; i++) {
    if (c[i].id === world.id && c[i].w === w && c[i].h === h && c[i].fk === F.k) {
      var hit = c[i];
      if (i !== c.length - 1) { c.splice(i, 1); c.push(hit); }
      return hit;
    }
  }
  var idx = Sky.index(world);
  var E = {
    id: world.id, w: w, h: h, idx: idx, fk: F.k, an: F.an, mo: F.mo, wx: F.wx,
    top: rgb(world.sky.top), hor: rgb(world.sky.horizon),
    key: rgb(world.key), rim: rgb(world.rim), par: rgb(world.particle && world.particle.color),
    mot: typeof world.motion === "number" && world.motion > 0 ? world.motion : 0.7
  };
  if (P2.cw !== w || P2.ch !== h || P2.ck !== F.k || !P2.calm) { P2.calm = calmLayer(w, h, F.an, F.mo); P2.cw = w; P2.ch = h; P2.ck = F.k; }
  E.calm = P2.calm;
  SCENES[idx].build(E, w, h, world);
  /* the quiet capsule goes into the base, under everything that moves */
  var bg = E.base.getContext("2d");
  bg.setTransform(1, 0, 0, 1, 0, 0);
  bg.globalAlpha = 1;
  bg.globalCompositeOperation = "source-over";
  bg.drawImage(P2.calm, 0, 0, E.base.width, E.base.height);
  c.push(E);
  if (c.length > 3) c.shift();
  return E;
}
function paintWorld(ctx, world, w, h, time, react, motion, al, F) {
  var E = entry(world, w, h, F);
  var m = typeof world.motion === "number" ? world.motion : 0.7;
  var t = time * motion * m;
  /* Snowfall's clock, held back by the response envelope, as in the shader */
  var ts = (time - 0.6 * invSmooth(react)) * motion * m;
  ctx.globalAlpha = al;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(E.base, 0, 0, w, h);
  SCENES[E.idx].draw(ctx, E, w, h, t, react, al, time * motion, ts);
}
/* The signature is SPEC §5.1's. A caller that knows where its well is may
   pass one more argument, {mouth, wellX}, both in uv with the mouth
   measured up from the bottom; it is read from arguments so the declared
   arity stays the specified nine. */
function paint2D(ctx, w, h, A, B, mix, time, react, motion) {
  if (!ctx || !(w > 0) || !(h > 0)) return;
  var frame = arguments.length > 9 ? arguments[9] : null;
  A = A || B || WORLDS[0];
  if (!A) return;
  var m = mix > 0 && B ? (mix < 1 ? mix : 1) : 0;
  var r = react > 0 ? (react < 1 ? react : 1) : 0;
  var mo = motion > 0 ? (motion < 1 ? motion : 1) : 0;
  var F = frameOf(w, h, frame);
  ctx.save();
  if (m < 1) paintWorld(ctx, A, w, h, time, r, mo, 1, F);
  if (m > 0) paintWorld(ctx, B, w, h, time, r, mo, m, F);
  ctx.restore();
}

/* ---------- the response envelope ----------
   What uReact was designed around: a smooth rise over 0.6 s and a smooth
   fall over 2.4 s — three seconds, one slow breath. gfx3d and gfx2d may
   use their own, but this is the curve under which every response here,
   Snowfall's pause above all, was tuned. */
var REACT_RISE = 0.6, REACT_FALL = 2.4;
function react(age) {
  if (!(age > 0)) return 0;
  if (age < REACT_RISE) { var a = age / REACT_RISE; return a * a * (3 - 2 * a); }
  var b = (age - REACT_RISE) / REACT_FALL;
  if (b >= 1) return 0;
  return 1 - b * b * (3 - 2 * b);
}

var Sky = {
  VERT: VERT,
  FRAG: FRAG,
  /* linear sky colours for uTopX / uHorX */
  uniforms: function (world) {
    var s = (world && world.sky) || { top: "#000000", horizon: "#000000" };
    return { top: linear(s.top), horizon: linear(s.horizon) };
  },
  /* the brightest end of a world's sky gradient, as WCAG relative luminance */
  luma: function (world) {
    var u = Sky.uniforms(world);
    return Math.max(luminance(u.top), luminance(u.horizon));
  },
  /* the world's index for uA / uB */
  index: function (world) {
    if (!world) return 0;
    if (typeof world.n === "number") return world.n - 1;
    for (var i = 0; i < WORLDS.length; i++) if (WORLDS[i].id === world.id) return i;
    return 0;
  },
  react: react,
  REACT_SECONDS: REACT_RISE + REACT_FALL,
  paint2D: paint2D
};

if (typeof module !== "undefined" && module.exports) module.exports = Sky;
else root.Sky = Sky;
})(typeof self !== "undefined" ? self : this);
