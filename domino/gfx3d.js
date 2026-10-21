/* gfx3d.js — the table, in the round.

   Raw WebGL 1. No library, no build step, no shader files: the two
   shaders are strings a few lines long, the bone is a chamfered box
   built from arithmetic, and the pips are painted once into a small
   texture atlas on a 2D canvas and then mapped on.

   Why a chamfered box and not a rounded one: a domino's edge is a
   *bevel*, a flat cut, not a fillet. It is what makes a bone catch the
   light in a hard line down one side instead of a soft gradient, and it
   is the difference between something that reads as a domino and
   something that reads as a lozenge. Eight extra vertices.

   The hand along the bottom is not drawn here — `gfx2d.js` draws it,
   onto a transparent canvas over the top. See the note there; the short
   version is that it keeps the bones you are about to tap crisp and
   keeps the tap target identical in both renderers.

   If the context is lost — and on a phone that has been in a pocket for
   twenty minutes, it will be — `ok` goes false and the room drops to 2D
   mid-hand without losing the game.                                   */
(function (root) {
"use strict";

var L = (typeof require === "function" && typeof module !== "undefined")
  ? require("./layout.js") : root.Layout;
var Sk = (typeof require === "function" && typeof module !== "undefined")
  ? require("./skins.js") : root.Skins;

/* ---------- just enough matrix maths ---------- */
function m4() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
/* a·b, in that order.

   The obvious-looking loop computes b·a instead, and nothing complains.
   The drawing never noticed, because the shader multiplies uProj and
   uView itself — but `pointOnTable` inverts this product to turn a tap
   back into a place on the table, and inverting the wrong product does
   not shift the answer slightly: it collapses it, so every pixel comes
   back as the same point. Column-major means (row r, col c) lives at
   m[c*4 + r], so (a·b)[r][c] = Σk a[k*4 + r] · b[c*4 + k]. */
function mul(a, b, o) {
  o = o || new Float32Array(16);
  for (var c = 0; c < 4; c++) {
    for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
                     a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}
function persp(fov, asp, n, f) {
  var t = 1 / Math.tan(fov / 2), o = new Float32Array(16);
  o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
  return o;
}
function lookAt(eye, at, up) {
  var z = norm(sub(eye, at)), x = norm(cross(up, z)), y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ]);
}
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function trs(x, y, z, rotZ, sx, sy, sz) {
  var c = Math.cos(rotZ), s = Math.sin(rotZ);
  return new Float32Array([
    c * sx, s * sx, 0, 0,
    -s * sy, c * sy, 0, 0,
    0, 0, sz, 0,
    x, y, z, 1
  ]);
}

/* ---------- shaders ---------- */
var VS = [
  "attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUV;",
  "uniform mat4 uProj, uView, uModel;",
  "varying vec3 vN; varying vec3 vP; varying vec2 vUV;",
  "void main(){",
  "  vec4 wp = uModel * vec4(aPos,1.0);",
  "  vP = wp.xyz;",
  /* the model matrix only ever rotates about z and scales positively,
     so the normal survives it without an inverse-transpose */
  "  vN = normalize((uModel * vec4(aNrm,0.0)).xyz);",
  "  vUV = aUV;",
  "  gl_Position = uProj * uView * wp;",
  "}"
].join("\n");

/* Three lights, because one is what made the bones look like cut-out
   paper. A single bulb straight overhead lights every top face to the
   same white and leaves every side the same dead grey, so a bone reads
   as a flat card with a smudge under it — which is exactly what it did.

   What sells a small solid object is not more light, it is light of
   *different colours* arriving from different directions:

     key     the bulb over the table. Half-Lambert, so the terminator is
             a soft shoulder rather than a hard line, and warm, because
             it is a bulb in a cantina.
     fill    a cool wash from behind the viewer's shoulder. This is the
             one that matters: the side of the bone facing you is turned
             away from the bulb, and with no fill it goes neutral grey
             and stops looking like the same ivory as the top. Lit
             coolly it reads as ivory *in shadow*, which is the whole
             difference.
     bounce  the felt's own colour, coming back up off the cloth onto
             everything that can see it — which is the sides, mostly.

   The weights are chosen so a face pointing straight up lands just
   under 1 and nothing clips: key 0.72 + fill 0.20·0.60 + ambient 0.14,
   with bounce contributing nothing at all up there. Change one and
   check that sum again, or the cream blows out to flat white and every
   gain here is thrown away. */
var FS = [
  "precision mediump float;",
  "varying vec3 vN; varying vec3 vP; varying vec2 vUV;",
  "uniform vec3 uColor, uEye, uLamp, uBounce, uRoom, uFog;",
  "uniform float uSpec, uPower, uRim, uAlpha, uTex, uAmb;",
  "uniform sampler2D uSampler;",
  "const vec3 FILL = vec3(-0.470, -0.646, 0.601);",   /* over the near shoulder */
  "void main(){",
  "  vec3 N = normalize(vN);",
  "  vec3 Ld = normalize(uLamp - vP);",
  "  vec3 V = normalize(uEye - vP);",
  "  vec3 H = normalize(Ld + V);",
  "  float nd  = dot(N, Ld);",
  "  float key = pow(max(nd * 0.5 + 0.5, 0.0), 1.7);",
  "  float fall = 1.0 - clamp(length(uLamp.xy - vP.xy) / 15.0, 0.0, 1.0);",
  "  key *= 0.55 + 0.45 * fall;",
  "  float fil = max(dot(N, FILL), 0.0);",
  /* How much of the felt a surface can see: none from a face pointing
     straight up, half from a wall standing on it. This is the term that
     keeps a bone's sides *ivory*.

     Tinting it with the felt is not decoration. A cream face under
     neutral light darkens to a neutral grey — correctly, that is what
     the arithmetic says — and a grey side next to a cream top stops
     reading as one object. What actually happens on a table is that the
     side is lit almost entirely by brown light coming back up off the
     cloth, so it darkens *towards the felt's hue* rather than towards
     grey. Take uBounce out and the sides go straight back to cardboard. */
  "  float bnc = (1.0 - N.z) * 0.5;",
  "  vec3 light = vec3(1.00, 0.95, 0.86) * (0.72 * key)",
  "             + vec3(0.80, 0.87, 1.00) * (0.20 * fil)",
  "             + uBounce * (0.42 * bnc)",
  "             + vec3(1.00, 0.97, 0.92) * uAmb;",
  "  vec3 base = uColor;",
  "  if (uTex > 0.5) { vec4 t = texture2D(uSampler, vUV); base = mix(uColor, t.rgb, t.a); }",
  "  float spe = pow(max(dot(N, H), 0.0), uPower) * uSpec * (0.35 + 0.65 * fall);",
  "  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * uRim;",
  "  vec3 col = base * light + vec3(1.0, 0.96, 0.88) * spe + vec3(0.7, 0.8, 1.0) * rim;",
  /* The room past the table. A finite table over a floor needs an end
     to the floor, and a hard edge where the plane stops is the one thing
     that gives a backdrop away. So everything fades towards the room's
     own colour with distance from the eye — the floor beyond the far
     rim goes to the dark of the cantina the way the back of a bar does
     under one bulb, and the table itself, which is always closer than
     uFog.x, never notices. */
  "  float fog = clamp((length(uEye - vP) - uFog.x) / uFog.y, 0.0, 1.0);",
  "  col = mix(col, uRoom, fog * fog);",
  "  gl_FragColor = vec4(col, uAlpha);",
  "}"
].join("\n");

/* A flat, textured, unlit quad — the contact shadow under a bone and
   the slot marking an open end. Kept apart from the lit shader so a
   shadow cannot pick up a specular highlight, which is exactly the sort
   of thing that gives a fake shadow away. */
var FLAT_VS = [
  "attribute vec3 aPos; attribute vec2 aUV;",
  "uniform mat4 uProj, uView, uModel;",
  "varying vec2 vUV;",
  "void main(){ vUV = aUV; gl_Position = uProj * uView * uModel * vec4(aPos,1.0); }"
].join("\n");

var FLAT_FS = [
  "precision mediump float;",
  "varying vec2 vUV;",
  "uniform sampler2D uSampler;",
  "uniform vec3 uColor;",
  "uniform float uAlpha;",
  "void main(){",
  "  float a = texture2D(uSampler, vUV).a;",
  "  gl_FragColor = vec4(uColor, a * uAlpha);",
  "}"
].join("\n");

function compile(gl, type, src) {
  var s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
  return s;
}

/* ---------- the bone, as geometry ----------
   A chamfered box, built once in unit space: 2 long, 1 wide, and a
   little under a third thick, centred on the origin with the face up.

   The top is two quads rather than one so each half can sample its own
   pip square out of the atlas — which is what lets 28 different bones
   share a single mesh and a single 7-square texture. */
/* The geometry, as plain arrays and no GL — so `tools/bone-check.js` can
   check the one thing about it that cannot be eyeballed reliably.

   Every quad is given a normal *and* a corner order, and the two have to
   agree: walking the corners must wind anticlockwise seen from the side
   the normal points. When they disagree, back-face culling throws away
   exactly the faces you meant to see and keeps the ones you meant to
   hide.

   All eight side and chamfer quads were wound backwards here. The two
   faces and the back were right, so a bone still looked like a bone from
   directly above — but its edges were culled and you saw *through* them
   into the far inner wall, which read as grey wedges hanging off both
   ends of every bone at once. Both ends: impossible for a solid box, and
   the tell that this was winding and not lighting. */
function boneGeometry() {
  /* A real double-six bone is about 50 x 25 x 9mm, so the thickness is
     a bit over a third of the width — 0.34 against 1.0 here. It was
     0.32, which is close, but the chamfer was 0.055: about a millimetre
     and a half, too fine to catch the light at any size the table is
     ever drawn. At 0.09 the bevel is a band you can see, and a bevel
     you can see is most of what makes an edge look like an edge.

     hz is exactly half the felt's offset below the origin, so the bone
     rests *on* the table rather than hovering a hundredth above it —
     which is what a contact shadow needs in order to be believable. */
  var hx = L.LEN / 2, hy = L.WID / 2, hz = 0.17, c = 0.062;
  var P = [], N = [], U = [], I = [];
  function quad(a, b, cc, d, n, uvs) {
    var base = P.length / 3, i;
    var vs = [a, b, cc, d];
    for (i = 0; i < 4; i++) {
      P.push(vs[i][0], vs[i][1], vs[i][2]);
      N.push(n[0], n[1], n[2]);
      U.push(uvs ? uvs[i][0] : 0, uvs ? uvs[i][1] : 0);
    }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /* the two top halves. UVs are filled per-draw by rewriting the buffer
     region, so the mesh stays one upload. */
  var ix = hx - c, iy = hy - c;
  quad([-ix, -iy, hz], [0, -iy, hz], [0, iy, hz], [-ix, iy, hz], [0, 0, 1],
       [[0, 1], [1, 1], [1, 0], [0, 0]]);
  quad([0, -iy, hz], [ix, -iy, hz], [ix, iy, hz], [0, iy, hz], [0, 0, 1],
       [[0, 1], [1, 1], [1, 0], [0, 0]]);
  /* The chamfer: four flat cuts around the top edge, **mitred** at the
     corners — each cut runs out to the bone's true corner at (±hx, ±hy),
     so adjacent cuts share a whole edge and meet like a picture frame.

     The obvious alternative stops each cut short by the chamfer width,
     and it does not close: adjacent cuts then touch at a single point
     with an open triangle between them, and the side walls below them
     leave an open vertical sliver at each corner besides. At a 0.055
     bevel those holes were a pixel or two and went unseen for the life
     of the room. Widening the bevel so the edges would read turned all
     four into notches bitten out of the silhouette with the felt
     showing through — and patching them with corner triangles fixes
     only the top half, while breaking convexity against the square
     back. Mitring costs nothing and closes both. */
  var d = 0.7071;
  quad([-ix, -iy, hz], [-ix, iy, hz], [-hx, hy, hz - c], [-hx, -hy, hz - c], [-d, 0, d]);
  quad([ix, -iy, hz], [hx, -hy, hz - c], [hx, hy, hz - c], [ix, iy, hz], [d, 0, d]);
  quad([-ix, -iy, hz], [-hx, -hy, hz - c], [hx, -hy, hz - c], [ix, -iy, hz], [0, -d, d]);
  quad([-ix, iy, hz], [ix, iy, hz], [hx, hy, hz - c], [-hx, hy, hz - c], [0, d, d]);
  /* the four sides, full width, straight down to the felt */
  quad([-hx, -hy, hz - c], [-hx, hy, hz - c], [-hx, hy, -hz], [-hx, -hy, -hz], [-1, 0, 0]);
  quad([hx, -hy, hz - c], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz - c], [1, 0, 0]);
  quad([-hx, -hy, hz - c], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz - c], [0, -1, 0]);
  quad([-hx, hy, hz - c], [hx, hy, hz - c], [hx, hy, -hz], [-hx, hy, -hz], [0, 1, 0]);
  /* and the back */
  quad([-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [hx, -hy, -hz], [0, 0, -1]);
  return { P: P, N: N, U: U, I: I };
}

function boneMesh(gl) {
  var g = boneGeometry();
  var P = g.P, N = g.N, U = g.U, I = g.I;
  var mesh = {
    pos: gl.createBuffer(), nrm: gl.createBuffer(), uv: gl.createBuffer(), idx: gl.createBuffer(),
    count: I.length, uvData: new Float32Array(U)
  };
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(N), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv); gl.bufferData(gl.ARRAY_BUFFER, mesh.uvData, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW);
  return mesh;
}

/* a flat quad: the cantina floor, far below the table. `rep` is how
   many times the tile texture repeats across it */
function planeMesh(gl, size, rep) {
  var P = [-size, -size, 0, size, -size, 0, size, size, 0, -size, size, 0];
  var N = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  var U = [0, 0, rep, 0, rep, rep, 0, rep];
  var I = [0, 1, 2, 0, 2, 3];
  var m = { pos: gl.createBuffer(), nrm: gl.createBuffer(), uv: gl.createBuffer(), idx: gl.createBuffer(), count: 6 };
  gl.bindBuffer(gl.ARRAY_BUFFER, m.pos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(N), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.uv); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(U), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW);
  return m;
}

/* ---------- the table, as a piece of furniture ----------
   The felt used to be an infinite plane: brown in every direction, no
   edge, no room, a diagram's idea of a table. A table is a thing with an
   end to it. This one is a felt top let into a wooden frame that stands
   a little proud of the cloth — the lip your bones bump against at a
   real table — with a bevel on its outer edge and an apron below, over
   a floor a good way down.

   Two meshes come out of one description: the cloth (textured with the
   felt) and the wood (textured with grain), because they are drawn with
   different textures and different shine. Everything is built the same
   way as the bone — quads with a stated normal — so `tools/bone-check.js`
   can hold the frame to the same winding and closure rules, and here the
   winding is *corrected* rather than trusted: a quad whose corners wind
   against its normal is reversed on the spot, so a typo in a corner
   order can never cull a face.

   Units are half-tiles, like everything on the table. `tw`/`th` are the
   half-extents of the cloth; the line of play has been measured over
   thousands of games and never reaches past bound + 2 sideways or 11
   deep, so a cloth of bound + 4 by 13 or more always has air round it.
   The top of the cloth is z = 0 here; `draw` lowers the whole piece to
   the felt height the bones rest on. */
var RIM = 1.5, LIP = 0.10, RIMC = 0.14, APRON = 2.6, FLOOR_DROP = 28;
function tableGeometry(tw, th) {
  var cloth = { P: [], N: [], U: [], I: [] }, wood = { P: [], N: [], U: [], I: [] };
  function quad(g, a, b, c, d, n, uvs) {
    var vs = [a, b, c, d];
    /* wind the corners the way the normal says */
    var e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    var f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (f[0] * n[0] + f[1] * n[1] + f[2] * n[2] < 0) { vs = [a, d, c, b]; uvs = uvs && [uvs[0], uvs[3], uvs[2], uvs[1]]; }
    var base = g.P.length / 3;
    for (var i = 0; i < 4; i++) {
      g.P.push(vs[i][0], vs[i][1], vs[i][2]);
      g.N.push(n[0], n[1], n[2]);
      g.U.push(uvs ? uvs[i][0] : 0, uvs ? uvs[i][1] : 0);
    }
    g.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  var FU = 0.385;                     /* felt weave: one repeat per 2.6 units, a bone and a bit */
  var WU = 0.11;                      /* wood grain: a plank's worth every nine units */
  function fuv(p) { return [p[0] * FU, p[1] * FU]; }
  function wuv(p, along) { return along ? [p[0] * WU, p[1] * WU] : [p[1] * WU, p[0] * WU]; }

  /* the cloth */
  var c0 = [-tw, -th, 0], c1 = [tw, -th, 0], c2 = [tw, th, 0], c3 = [-tw, th, 0];
  quad(cloth, c0, c1, c2, c3, [0, 0, 1], [fuv(c0), fuv(c1), fuv(c2), fuv(c3)]);

  /* the lip: the inner wall of the frame, from the top of the wood
     down to the cloth, facing in */
  var L = LIP;
  quad(wood, [-tw, th, L], [tw, th, L], [tw, th, 0], [-tw, th, 0], [0, -1, 0], [[0, 0], [tw * 2 * WU, 0], [tw * 2 * WU, L * WU], [0, L * WU]]);
  quad(wood, [-tw, -th, L], [tw, -th, L], [tw, -th, 0], [-tw, -th, 0], [0, 1, 0], [[0, 0], [tw * 2 * WU, 0], [tw * 2 * WU, L * WU], [0, L * WU]]);
  quad(wood, [tw, -th, L], [tw, th, L], [tw, th, 0], [tw, -th, 0], [-1, 0, 0], [[0, 0], [th * 2 * WU, 0], [th * 2 * WU, L * WU], [0, L * WU]]);
  quad(wood, [-tw, -th, L], [-tw, th, L], [-tw, th, 0], [-tw, -th, 0], [1, 0, 0], [[0, 0], [th * 2 * WU, 0], [th * 2 * WU, L * WU], [0, L * WU]]);

  /* the top of the frame: a ring, mitred at the corners like a picture
     frame, with the grain running along each side */
  var ow = tw + RIM - RIMC, oh = th + RIM - RIMC;      /* where the bevel starts */
  var ew = tw + RIM, eh = th + RIM;                    /* the outer edge */
  function strip(g, a, b, c, d, n, along) { quad(g, a, b, c, d, n, [wuv(a, along), wuv(b, along), wuv(c, along), wuv(d, along)]); }
  strip(wood, [-tw, th, L], [tw, th, L], [ow, oh, L], [-ow, oh, L], [0, 0, 1], true);        /* far */
  strip(wood, [-tw, -th, L], [tw, -th, L], [ow, -oh, L], [-ow, -oh, L], [0, 0, 1], true);    /* near */
  strip(wood, [tw, -th, L], [tw, th, L], [ow, oh, L], [ow, -oh, L], [0, 0, 1], false);       /* right */
  strip(wood, [-tw, -th, L], [-tw, th, L], [-ow, oh, L], [-ow, -oh, L], [0, 0, 1], false);   /* left */
  /* the bevel round the outside */
  var d = 0.7071, Lb = L - RIMC;
  strip(wood, [-ow, oh, L], [ow, oh, L], [ew, eh, Lb], [-ew, eh, Lb], [0, d, d], true);
  strip(wood, [-ow, -oh, L], [ow, -oh, L], [ew, -eh, Lb], [-ew, -eh, Lb], [0, -d, d], true);
  strip(wood, [ow, -oh, L], [ow, oh, L], [ew, eh, Lb], [ew, -eh, Lb], [d, 0, d], false);
  strip(wood, [-ow, -oh, L], [-ow, oh, L], [-ew, eh, Lb], [-ew, -eh, Lb], [-d, 0, d], false);
  /* the apron, straight down */
  var B = -APRON;
  quad(wood, [-ew, eh, Lb], [ew, eh, Lb], [ew, eh, B], [-ew, eh, B], [0, 1, 0], [[0, 0], [ew * 2 * WU, 0], [ew * 2 * WU, APRON * WU], [0, APRON * WU]]);
  quad(wood, [-ew, -eh, Lb], [ew, -eh, Lb], [ew, -eh, B], [-ew, -eh, B], [0, -1, 0], [[0, 0], [ew * 2 * WU, 0], [ew * 2 * WU, APRON * WU], [0, APRON * WU]]);
  quad(wood, [ew, -eh, Lb], [ew, eh, Lb], [ew, eh, B], [ew, -eh, B], [1, 0, 0], [[0, 0], [eh * 2 * WU, 0], [eh * 2 * WU, APRON * WU], [0, APRON * WU]]);
  quad(wood, [-ew, -eh, Lb], [-ew, eh, Lb], [-ew, eh, B], [-ew, -eh, B], [-1, 0, 0], [[0, 0], [eh * 2 * WU, 0], [eh * 2 * WU, APRON * WU], [0, APRON * WU]]);
  /* and the underside, which nobody sees and the closure check needs */
  quad(wood, [-ew, -eh, B], [ew, -eh, B], [ew, eh, B], [-ew, eh, B], [0, 0, -1]);
  return { cloth: cloth, wood: wood, tw: tw, th: th };
}
function upload(gl, g, mesh) {
  mesh = mesh || { pos: gl.createBuffer(), nrm: gl.createBuffer(), uv: gl.createBuffer(), idx: gl.createBuffer() };
  mesh.count = g.I.length;
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.P), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.N), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.U), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(g.I), gl.STATIC_DRAW);
  return mesh;
}

/* the unit quad the marks on the felt are drawn on: -1..1, UV 0..1 */
function markMesh(gl) {
  var P = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
  var U = [0, 1, 1, 1, 1, 0, 0, 0];
  var I = [0, 1, 2, 0, 2, 3];
  var m = { pos: gl.createBuffer(), uv: gl.createBuffer(), idx: gl.createBuffer(), count: 6 };
  gl.bindBuffer(gl.ARRAY_BUFFER, m.pos); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.uv); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(U), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.STATIC_DRAW);
  return m;
}

/* ---------- the pip atlas ----------
   Seven squares in a row: blank through six. Painted once on a 2D
   canvas with an alpha channel, so the bone's own colour shows through
   and one atlas serves every skin. */
var PIPS = [
  [], [[1, 1]], [[0, 0], [2, 2]], [[0, 0], [1, 1], [2, 2]],
  [[0, 0], [2, 0], [0, 2], [2, 2]],
  [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]]
];
/* Seven squares of 128 in a canvas 1024 wide — eight cells, one spare.

   The spare is not tidiness, it is the whole point. WebGL 1 will only
   build mipmaps for a power-of-two texture, and 7 × 128 = 896 is not
   one. `generateMipmap` then fails *silently*, the texture is left
   incomplete, and an incomplete texture samples as opaque black — so
   every bone on the table came out a black slab while the bones in the
   hand, drawn in 2D, were perfect. Nothing in node can see that, and
   the browser check could not either: it only asked whether the canvas
   had more than one colour on it, and a black bone on brown felt does.
   It took a screenshot to catch, which is why one gets taken. */
/* 256 to a cell, not 128. A bone can cover 300 device pixels across on
   a phone at 3x when the line is short and the camera has pulled in, so
   a 128px cell was being magnified past 2x and every pip came out a
   soft grey smudge — the drilling detail was there and then thrown away
   by the magnification filter. 2048x256 RGBA is 2MB, paid once. */
var ATLAS_W = 2048, ATLAS_CELLS = 8;
function pipAtlas(gl, pipColour) {
  var S = 256, cv = document.createElement("canvas");
  cv.width = ATLAS_W; cv.height = S;
  var g = cv.getContext("2d");
  for (var n = 0; n <= 6; n++) {
    var ox = n * S, set = PIPS[n];
    /* The divider is a *vertical* band at the right-hand edge of each
       cell, because that edge is what the UVs map to the middle of the
       bone — both halves put their band there and together they make
       one line across it.

       Drawn along the bottom instead (the first attempt) it comes out
       at constant y, which on the bone is a line down its length at the
       far end of each half: invisible under the chamfer, and no divider
       anywhere. The two halves are laid out along x; the seam is at
       u = 1, not v = 1. */
    /* An engraved line, not a strip of metal laid on top. It was 4.5%
       of a cell wide at half alpha, and since both halves draw their
       own the two met as one 9%-wide light grey bar sitting proud of
       the face. Narrower and darker, with a hairline of catchlight
       along the bottom edge, and it reads as a groove cut into the
       bone — which is what it is. */
    g.globalAlpha = 0.62;
    g.fillStyle = pipColour;
    g.fillRect(ox + S * 0.972, S * 0.055, S * 0.028, S * 0.89);
    g.globalAlpha = 0.30;
    g.fillStyle = "#fffaf0";
    g.fillRect(ox + S * 0.972, S * 0.055 + S * 0.89, S * 0.028, S * 0.010);
    g.globalAlpha = 1;
    /* A pip on a real bone is a hole, drilled and filled — not a sticker.
       Three coats make it read as one, and the order matters:

         1. a soft dark halo on the face just outside the rim, which is
            the light the hole steals from the surface around it;
         2. the bore itself, shaded across rather than filled flat — the
            wall the light reaches is the one *opposite* the lamp, so a
            pit is bright on the far side and darkest on the near one.
            That is the reverse of a dome, and getting it backwards is
            what makes drawn pips look like bumps;
         3. a thin bright arc on the lip where the bevel of the hole
            catches the bulb.

       The lamp is toward -y on the table, and v runs 0 at +y to 1 at
       -y, so on this canvas the light arrives from the bottom. The lit
       wall is therefore the top of each bore. */
    for (var i = 0; i < set.length; i++) {
      var px = ox + S * 0.5 + (set[i][0] - 1) * S * 0.29;
      var py = S * 0.5 + (set[i][1] - 1) * S * 0.29;
      var r = S * 0.105;

      /* The halo starts at the rim, not inside it. Starting at 0.9r
         darkened the last tenth of the bore as well as the face around
         it, which smeared the one edge that has to stay crisp: a pip
         reads as drilled because its outline is sharp and its inside
         is not. */
      var halo = g.createRadialGradient(px, py, r, px, py, r * 1.5);
      halo.addColorStop(0, "rgba(0,0,0,.16)");
      halo.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = halo;
      g.beginPath(); g.arc(px, py, r * 1.5, 0, Math.PI * 2); g.fill();

      g.save();
      g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.clip();
      g.fillStyle = pipColour;
      g.fillRect(px - r, py - r, r * 2, r * 2);
      var bore = g.createLinearGradient(px, py - r, px, py + r);
      bore.addColorStop(0, "rgba(255,244,224,.30)");    /* the lit far wall */
      bore.addColorStop(0.42, "rgba(0,0,0,0)");
      bore.addColorStop(1, "rgba(0,0,0,.55)");          /* the near wall, in its own shadow */
      g.fillStyle = bore;
      g.fillRect(px - r, py - r, r * 2, r * 2);
      g.restore();

      g.beginPath();
      g.arc(px, py, r * 0.94, Math.PI * 1.08, Math.PI * 1.92);
      g.strokeStyle = "rgba(255,250,238,.42)";
      g.lineWidth = S * 0.016;
      g.stroke();
    }
  }
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

/* ---------- the two marks on the felt ----------
   Both are painted as a signed distance to a rounded rectangle the size
   of a bone's footprint, which is the cheap way to get a soft edge
   without a blur filter (`ctx.filter` is not old-Safari's strong suit,
   and this room has to work on a phone somebody has had for a while).

   The footprint occupies the middle 60% of the texture; the rest is the
   penumbra it needs room to fall off into. `FOOT` is that fraction, and
   the draw code scales the quad by 1/FOOT so the sharp part lands
   exactly on the bone. Change one without the other and every shadow on
   the table is the wrong size. */
var FOOT = 0.6;
function sdTexture(gl, paint) {
  var W = 256, H = 128, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  var g = cv.getContext("2d");
  var img = g.createImageData(W, H), d = img.data;
  /* half-extents of the bone's footprint, in pixels, and its corner
     radius — a bone is chamfered, so its shadow has rounded corners */
  var hw = W * 0.5 * FOOT, hh = H * 0.5 * FOOT, r = H * 0.09;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var dx = Math.max(Math.abs(x + 0.5 - W / 2) - (hw - r), 0);
      var dy = Math.max(Math.abs(y + 0.5 - H / 2) - (hh - r), 0);
      var dist = Math.hypot(dx, dy) - r;
      var i = (y * W + x) * 4;
      var a = paint(dist, H);
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}
function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

/* The shadow of a bone lying flat on felt under a bulb a long way up:
   almost black where the two touch, and gone within about a third of a
   bone's width. Real contact shadows are tight and dark at the contact
   and diffuse quickly — a uniform grey blob is the giveaway. */
function shadowTexture(gl) {
  return sdTexture(gl, function (dist, H) {
    /* Two falloffs, not one. A single wide gradient is an airbrushed
       blob — it was, and it read as a glow around the bone rather than
       as a shadow under it. What a small object on a table actually
       casts is a hard, nearly black line right at the contact and a
       much fainter wash beyond it, so: a tight core plus a wide skirt,
       added. The core is what makes the bone look like it is touching
       something. */
    var core = 0.72 * smooth(1 - dist / (H * 0.045));
    var skirt = 0.26 * smooth(1 - dist / (H * 0.17));
    return core + skirt;
  });
}

/* An open end: a ring on the felt rather than a slab standing on it.
   The old marker was the bone mesh squashed to a tenth of its height,
   which at a glance is a pale grey shard sticking out of the line —
   it read as broken geometry, not as an invitation. */
function slotTexture(gl) {
  return sdTexture(gl, function (dist, H) {
    var edge = H * 0.030;
    return smooth(1 - Math.abs(dist + edge) / edge) * 0.95;
  });
}

function feltTexture(gl, skin) {
  var cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  var g = cv.getContext("2d");
  g.fillStyle = skin.table.felt; g.fillRect(0, 0, 128, 128);
  var grain = skin.table.grain;
  g.globalAlpha = 0.10 + grain * 0.22;
  for (var i = 0; i < 1400; i++) {
    var x = Math.sin(i * 127.1) * 43758.5453, y = Math.sin(i * 311.7) * 21654.1234;
    x = (x - Math.floor(x)) * 128; y = (y - Math.floor(y)) * 128;
    g.fillStyle = (i % 3) ? skin.table.edge : skin.table.rim;
    g.fillRect(x, y, 1.6, 1.6);
  }
  g.globalAlpha = 1;
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

function hex3(h) {
  return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
}
function mixHex(a, b, t) {
  var x = hex3(a), y = hex3(b);
  return "rgb(" + Math.round((x[0] + (y[0] - x[0]) * t) * 255) + "," + Math.round((x[1] + (y[1] - x[1]) * t) * 255) + "," +
    Math.round((x[2] + (y[2] - x[2]) * t) * 255) + ")";
}
function nrand(i) { var x = Math.sin(i * 127.1 + 1.7) * 43758.5453; return x - Math.floor(x); }
function texFrom(gl, cv, repeat) {
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

/* The wood of the frame: long grain in the skin's rim and edge colours,
   with a few darker lines where the planks meet. Painted once a skin. */
function woodTexture(gl, skin) {
  var S = 256, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  var g = cv.getContext("2d");
  var dark = skin.table.rim, light = skin.table.edge;
  g.fillStyle = mixHex(dark, light, 0.38); g.fillRect(0, 0, S, S);
  for (var y = 0; y < S; y += 2) {
    var t = Math.sin(y * 0.19) * 0.5 + 0.5, u = nrand(y) * 0.5;
    g.strokeStyle = mixHex(dark, light, 0.15 + t * 0.45 + u * 0.2);
    g.globalAlpha = 0.55;
    g.lineWidth = 1.5 + nrand(y + 3) * 1.5;
    g.beginPath(); g.moveTo(0, y + nrand(y + 9)); g.lineTo(S, y + (nrand(y + 1) - 0.5) * 3); g.stroke();
  }
  g.globalAlpha = 0.35;
  g.strokeStyle = dark; g.lineWidth = 2;
  [0.33, 0.67].forEach(function (f) { g.beginPath(); g.moveTo(0, S * f); g.lineTo(S, S * f + 2); g.stroke(); });
  g.globalAlpha = 1;
  return texFrom(gl, cv, true);
}

/* The floor: saltillo tile, the big terracotta squares of every cantina
   and courtyard in the country, with pale grout and each tile fired a
   little differently. Tinted a third of the way towards the room's own
   colour so a midnight table stands on a midnight floor. */
function tileTexture(gl, skin) {
  var S = 256, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  var g = cv.getContext("2d");
  var bg = skin.room.bg;
  g.fillStyle = mixHex("#5a3a2a", bg, 0.35); g.fillRect(0, 0, S, S);
  var n = 2, cell = S / n, gap = 6;
  for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
    var k = i * n + j;
    var base = mixHex(mixHex("#b5643c", "#8a4a2e", nrand(k * 7 + 2)), bg, 0.30);
    g.fillStyle = base;
    g.fillRect(i * cell + gap / 2, j * cell + gap / 2, cell - gap, cell - gap);
    /* the mottle of a fired tile */
    for (var s = 0; s < 70; s++) {
      g.fillStyle = mixHex("#d08a5a", "#6a3620", nrand(k * 131 + s));
      g.globalAlpha = 0.10;
      var px = i * cell + gap / 2 + nrand(k * 977 + s) * (cell - gap), py = j * cell + gap / 2 + nrand(k * 313 + s * 3) * (cell - gap);
      g.beginPath(); g.arc(px, py, 3 + nrand(s + k) * 9, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    /* a worn edge: slightly lighter along the top-left */
    g.strokeStyle = "rgba(255,230,200,.12)"; g.lineWidth = 2;
    g.strokeRect(i * cell + gap / 2 + 1, j * cell + gap / 2 + 1, cell - gap - 2, cell - gap - 2);
  }
  return texFrom(gl, cv, true);
}

/* ---------- the renderer ---------- */
function Gfx3D(canvas) {
  this.cv = canvas;
  this.kind = "3d";
  this.ok = false;
  var gl = null;
  try {
    /* preserveDrawingBuffer keeps the last frame readable after it has
       been presented. It costs a copy, which for a scene of thirty flat
       bones is nothing, and it buys two real things: the table can be
       screenshotted — by the player wanting to show somebody the hand
       they just won, and by `tools/room-check.js`, which otherwise
       reads back an empty buffer and cannot tell a drawn table from a
       blank one. */
    var attrs = {
      alpha: false, antialias: true, depth: true,
      preserveDrawingBuffer: true, powerPreference: "high-performance"
    };
    gl = canvas.getContext("webgl", attrs) || canvas.getContext("experimental-webgl", attrs);
  } catch (e) { gl = null; }
  if (!gl) return;
  this.gl = gl;

  var vs = compile(gl, gl.VERTEX_SHADER, VS), fs = compile(gl, gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;
  var pr = gl.createProgram();
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
  this.pr = pr;
  gl.useProgram(pr);

  this.a = {
    pos: gl.getAttribLocation(pr, "aPos"),
    nrm: gl.getAttribLocation(pr, "aNrm"),
    uv: gl.getAttribLocation(pr, "aUV")
  };
  this.u = {};
  ["uProj", "uView", "uModel", "uColor", "uEye", "uLamp", "uBounce", "uSpec",
   "uPower", "uRim", "uAlpha", "uTex", "uAmb", "uSampler", "uRoom", "uFog"].forEach(function (n) {
    this.u[n] = gl.getUniformLocation(pr, n);
  }, this);

  /* the second, unlit program: contact shadows and open-end slots */
  var fvs = compile(gl, gl.VERTEX_SHADER, FLAT_VS), ffs = compile(gl, gl.FRAGMENT_SHADER, FLAT_FS);
  if (!fvs || !ffs) return;
  var fpr = gl.createProgram();
  gl.attachShader(fpr, fvs); gl.attachShader(fpr, ffs); gl.linkProgram(fpr);
  if (!gl.getProgramParameter(fpr, gl.LINK_STATUS)) return;
  this.fpr = fpr;
  this.fa = { pos: gl.getAttribLocation(fpr, "aPos"), uv: gl.getAttribLocation(fpr, "aUV") };
  this.fu = {};
  ["uProj", "uView", "uModel", "uColor", "uAlpha", "uSampler"].forEach(function (n) {
    this.fu[n] = gl.getUniformLocation(fpr, n);
  }, this);

  this.bone = boneMesh(gl);
  /* the floor: 800 units across, a tile every 12 (about 30cm), and
     the texture carries two tiles a side */
  this.plane = planeMesh(gl, 400, 800 / 24);
  this.cloth = null; this.wood = null; this.tableKey = "";
  this.mark = markMesh(gl);
  this.pipTex = null; this.feltTex = null; this.woodTex = null; this.tileTex = null;
  this.shake = null; this.lastNow = 0;
  this.shadowTex = shadowTexture(gl);
  this.slotTex = slotTexture(gl);
  this.skin = null;
  /* 0.86 rather than 0.94: eight degrees lower puts the camera at 49°
     above the felt instead of 54°, which is worth about a tenth more of
     every bone's near side. It is the difference between seeing that a
     bone has a thickness and merely being told so. */
  this.orbit = { yaw: 0, pitch: 0.86, dist: 20, target: 0.86 };
  this.ok = true;
  this.lost = false;

  var self = this;
  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    self.ok = false; self.lost = true;
  }, false);
}

Gfx3D.prototype.setSkin = function (skin) {
  this.skin = skin;
  if (!this.ok) return;
  var gl = this.gl;
  if (this.pipTex) gl.deleteTexture(this.pipTex);
  if (this.feltTex) gl.deleteTexture(this.feltTex);
  if (this.woodTex) gl.deleteTexture(this.woodTex);
  if (this.tileTex) gl.deleteTexture(this.tileTex);
  this.pipTex = pipAtlas(gl, skin.bones.pip);
  this.feltTex = feltTexture(gl, skin);
  this.woodTex = woodTexture(gl, skin);
  this.tileTex = tileTexture(gl, skin);
  this.surf = Sk.surface(skin);
};

/* a bone brought down hard — a mula slammed to shut the game — is felt
   through the table. A short, decaying nudge of the camera, never more
   than a few pixels, and only when the room asks for it (it does not,
   when the player prefers reduced motion). */
Gfx3D.prototype.kick = function (amount) {
  this.shake = { t: 0, a: Math.max(0, Math.min(1, amount || 0.6)) };
};

/* the table this screen gets: wide enough for the line to fold at this
   screen's bound with air to spare, and never smaller than the line
   that is actually on it */
Gfx3D.prototype.tableFor = function (bound, bb) {
  var tw = Math.max(8.5, bound + 4), th = Math.max(13, bound * 0.75 + 4);
  tw = Math.max(tw, Math.max(-bb.x0, bb.x1) + 3);
  th = Math.max(th, Math.max(-bb.y0, bb.y1) + 3);
  /* in whole units, so a growing line rebuilds the mesh rarely */
  tw = Math.ceil(tw); th = Math.ceil(th);
  var key = tw + "x" + th;
  if (key !== this.tableKey) {
    var g = tableGeometry(tw, th);
    this.cloth = upload(this.gl, g.cloth, this.cloth);
    this.wood = upload(this.gl, g.wood, this.wood);
    this.tableKey = key;
  }
  return { tw: tw, th: th };
};

Gfx3D.prototype.resize = function (w, h, dpr) {
  this.dpr = dpr || (root.devicePixelRatio || 1);
  /* a phone at 3× spends most of its frame budget on pixels nobody can
     see; 2× is the honest ceiling for a table of flat bones */
  this.dpr = Math.min(this.dpr, 2);
  this.w = w; this.h = h;
  this.cv.width = Math.max(1, Math.round(w * this.dpr));
  this.cv.height = Math.max(1, Math.round(h * this.dpr));
  this.cv.style.width = w + "px";
  this.cv.style.height = h + "px";
  if (this.ok) this.gl.viewport(0, 0, this.cv.width, this.cv.height);
};

/* rewrite the two top quads' UVs so this bone shows the right pips */
Gfx3D.prototype.setFace = function (a, b) {
  var gl = this.gl, u = this.bone.uvData;
  var wA = 1 / ATLAS_CELLS, oA = a * wA, oB = b * wA;
  /* first half: v runs 1→0 so the divider edge lands in the middle */
  u[0] = oA; u[1] = 1; u[2] = oA + wA; u[3] = 1; u[4] = oA + wA; u[5] = 0; u[6] = oA; u[7] = 0;
  u[8] = oB + wA; u[9] = 1; u[10] = oB; u[11] = 1; u[12] = oB; u[13] = 0; u[14] = oB + wA; u[15] = 0;
  gl.bindBuffer(gl.ARRAY_BUFFER, this.bone.uv);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, u);
};

Gfx3D.prototype.bind = function (mesh) {
  var gl = this.gl, a = this.a;
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos); gl.enableVertexAttribArray(a.pos);
  gl.vertexAttribPointer(a.pos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm); gl.enableVertexAttribArray(a.nrm);
  gl.vertexAttribPointer(a.nrm, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv); gl.enableVertexAttribArray(a.uv);
  gl.vertexAttribPointer(a.uv, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
};

/* ---------- the marks on the felt ----------
   Both the contact shadows and the open-end slots are the same flat
   textured quad under the unlit program; only the texture, the colour
   and the height above the felt differ. They are drawn with the depth
   test on but depth writes off, so they can never occlude each other or
   a bone — a shadow that hides the thing casting it is a long-running
   joke rather than a rendering technique. */
Gfx3D.prototype.marks = function (proj, view, tex, colour, list) {
  if (!list.length) return;
  var gl = this.gl, fu = this.fu, fa = this.fa, m = this.mark, i;
  gl.useProgram(this.fpr);
  gl.uniformMatrix4fv(fu.uProj, false, proj);
  gl.uniformMatrix4fv(fu.uView, false, view);
  gl.uniform3f(fu.uColor, colour[0], colour[1], colour[2]);
  gl.uniform1i(fu.uSampler, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.pos); gl.enableVertexAttribArray(fa.pos);
  gl.vertexAttribPointer(fa.pos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.uv); gl.enableVertexAttribArray(fa.uv);
  gl.vertexAttribPointer(fa.uv, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  /* the sharp part of the texture is the middle FOOT of it, so the quad
     has to be that much bigger than the bone it stands in for */
  var sx = (L.LEN / 2) / FOOT, sy = (L.WID / 2) / FOOT;
  for (i = 0; i < list.length; i++) {
    var k = list[i];
    gl.uniform1f(fu.uAlpha, k.a);
    gl.uniformMatrix4fv(fu.uModel, false,
      trs(k.x, k.y, k.z, k.rot, sx * (k.s || 1), sy * (k.s || 1), 1));
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.useProgram(this.pr);
};

Gfx3D.prototype.draw = function (scene, now) {
  if (!this.ok || !this.skin) return;
  var gl = this.gl, sk = this.skin, u = this.u, i;

  var bg = hex3(sk.room.bg);
  gl.clearColor(bg[0], bg[1], bg[2], 1);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(this.pr);

  /* Layout runs y *down* the screen, as the flat table draws it. This
     camera sits on the near side looking across, so world +y runs *away*
     from you — up the screen. Handing it layout coordinates unchanged
     mirrored the whole table top to bottom: the line folded the other way
     from the 2D table, and every bone your partner played flew in from
     your own side while yours arrived from across the table. So the 3D
     world is layout with y negated, and a turn negated with it. That
     happens in one place — below, as each bone is placed — and
     `pointOnTable` undoes it. */
  var bb = scene.table.bbox;
  var cx = (bb.x0 + bb.x1) / 2, cy = -(bb.y0 + bb.y1) / 2;
  var asp = this.w / Math.max(1, this.h);
  var pitch = this.orbit.pitch, yaw = this.orbit.yaw;

  /* Frame the whole line of play, however long it has become — and frame
     it in the part of the screen nobody is covering. The seat bar sits
     over the top of the canvas and your hand over the bottom, so fitting
     the line to the whole canvas put its ends under your own bones and
     ran long lines off the sides once perspective widened the near row.

     So the fit is measured rather than estimated: project the corners of
     the line's box through the real camera, see how much of the free
     rectangle they use, and scale the distance by that — three passes
     settle it, because on-screen size goes as one over distance. The
     projection is then shifted so the line's projected middle sits in the
     middle of the free rectangle. Both ease, so the table pulls back as
     the line grows instead of snapping. */
  var top = Math.max(0, scene.topPad || 0), bot = Math.max(0, scene.botPad || 0);
  var freeH = Math.max(60, this.h - top - bot);
  var fy0 = 1 - 2 * top / this.h, fy1 = 1 - 2 * (this.h - bot) / this.h;   /* NDC top, bottom */
  var fcy = (fy0 + fy1) / 2, fhy = (fy0 - fy1) / 2 * 0.90;
  var fhx = 1 - 2 * 14 / Math.max(1, this.w);
  var proj0 = persp(0.86, asp, 0.6, 140);
  var corners = [[bb.x0 - 0.4, -bb.y0 + 0.4], [bb.x1 + 0.4, -bb.y0 + 0.4],
                 [bb.x0 - 0.4, -bb.y1 - 0.4], [bb.x1 + 0.4, -bb.y1 - 0.4]];
  var camAt = function (d) {
    var e = [cx + Math.sin(yaw) * d * 0.35, cy - Math.cos(pitch) * d, Math.sin(pitch) * d];
    return { eye: e, view: lookAt(e, [cx, cy, 0], [0, 0, 1]) };
  };
  var spread = function (d) {
    var c = camAt(d), vp = mul(proj0, c.view), x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (var k = 0; k < corners.length; k++) {
      for (var zz = 0; zz < 2; zz++) {
        var q = xform(vp, [corners[k][0], corners[k][1], zz * 0.34, 1]);
        if (!q) continue;
        if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
        if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
      }
    }
    return { x0: x0, x1: x1, y0: y0, y1: y1 };
  };
  var want = Math.max(9, this.orbit.dist), sp = null;
  for (var it = 0; it < 3; it++) {
    sp = spread(want);
    var need = Math.max((sp.x1 - sp.x0) / 2 / fhx, (sp.y1 - sp.y0) / 2 / fhy);
    want = Math.min(60, Math.max(9, want * need));
  }
  sp = spread(want);
  this.orbit.dist += (want - this.orbit.dist) * 0.10;
  var shX = -(sp.x0 + sp.x1) / 2, shY = fcy - (sp.y0 + sp.y1) / 2;
  if (this.orbit.shX === undefined) { this.orbit.shX = shX; this.orbit.shY = shY; }
  this.orbit.shX += (shX - this.orbit.shX) * 0.10;
  this.orbit.shY += (shY - this.orbit.shY) * 0.10;

  var d = this.orbit.dist;
  var cam = camAt(d), eye = cam.eye, at = [cx, cy, 0], view = cam.view;
  /* the shift is a translation in clip space, applied after projecting */
  var shift = m4(); shift[12] = this.orbit.shX; shift[13] = this.orbit.shY;
  /* the slam, felt through the table: a decaying wobble on the shift */
  var dt = this.lastNow ? Math.min(0.05, (now - this.lastNow) / 1000) : 0;
  this.lastNow = now;
  if (this.shake) {
    var sh = this.shake;
    sh.t += dt;
    var env = Math.exp(-sh.t * 9) * sh.a;
    shift[13] += Math.sin(sh.t * 52) * env * 0.022;
    shift[12] += Math.sin(sh.t * 37 + 1) * env * 0.006;
    if (sh.t > 0.7) this.shake = null;
  }
  var proj = mul(shift, proj0);
  this.freeMid = { x: this.w / 2, y: top + freeH / 2 };
  gl.uniformMatrix4fv(u.uProj, false, proj);
  gl.uniformMatrix4fv(u.uView, false, view);
  gl.uniform3f(u.uEye, eye[0], eye[1], eye[2]);
  /* A bulb hanging over the table, not the sun.

     At z = 15 the light arrived within a few degrees of straight down
     everywhere, so every top face was lit identically and the line read
     as one flat sticker. At 7.5 the direction changes across the felt,
     which is what gives a long line its gradient.

     It also hangs *beyond* the table and off to one side rather than
     over the near edge. Directly overhead, a bone's shadow is directly
     underneath it — hidden by the bone, which is the one place a shadow
     does no good at all. From over the far shoulder the shadows fall
     towards the viewer where they can be seen, and the near faces drop
     into the fill, which is the light every photograph of a small
     object on a table is set up to get. */
  var felt = hex3(sk.table.felt);
  var lamp = [cx - 2.6, cy + 2.2, 7.5];
  gl.uniform3f(u.uLamp, lamp[0], lamp[1], lamp[2]);
  gl.uniform3f(u.uBounce, felt[0], felt[1], felt[2]);
  gl.uniform3f(u.uRoom, bg[0], bg[1], bg[2]);
  /* the room fades in from well past the table's far edge, so the
     table itself is always in the clear */
  gl.uniform3f(u.uFog, d * 1.6 + 22, d * 2.6 + 30, 0);
  gl.uniform1i(u.uSampler, 0);
  gl.activeTexture(gl.TEXTURE0);

  /* The table stands in the middle of its own cloth, not of the line:
     the line grows from the salida at the origin, and the frame is
     built round the origin, so a long line folds towards the rim the
     way it does at a real table rather than the table sliding under it. */
  var tb = this.tableFor(scene.bound || 9, bb);
  var tz = -0.17;
  gl.uniform1f(u.uRim, 0);
  gl.uniform1f(u.uAlpha, 1);
  gl.uniform1f(u.uTex, 1);

  /* the floor, a long way down */
  gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
  this.bind(this.plane);
  gl.uniformMatrix4fv(u.uModel, false, trs(0, 0, tz - APRON - FLOOR_DROP, 0, 1, 1, 1));
  gl.uniform3f(u.uColor, 0.5, 0.3, 0.2);
  gl.uniform1f(u.uSpec, 0.04);
  gl.uniform1f(u.uPower, 10);
  gl.uniform1f(u.uAmb, 0.20);
  gl.drawElements(gl.TRIANGLES, this.plane.count, gl.UNSIGNED_SHORT, 0);

  /* the frame */
  gl.bindTexture(gl.TEXTURE_2D, this.woodTex);
  this.bind(this.wood);
  gl.uniformMatrix4fv(u.uModel, false, trs(0, 0, tz, 0, 1, 1, 1));
  var rimc = hex3(sk.table.rim);
  gl.uniform3f(u.uColor, rimc[0], rimc[1], rimc[2]);
  gl.uniform1f(u.uSpec, 0.12 + sk.table.gloss * 0.45);
  gl.uniform1f(u.uPower, 22);
  gl.uniform1f(u.uAmb, 0.24);
  gl.drawElements(gl.TRIANGLES, this.wood.count, gl.UNSIGNED_SHORT, 0);

  /* the cloth */
  gl.bindTexture(gl.TEXTURE_2D, this.feltTex);
  this.bind(this.cloth);
  gl.uniformMatrix4fv(u.uModel, false, trs(0, 0, tz, 0, 1, 1, 1));
  gl.uniform3f(u.uColor, felt[0], felt[1], felt[2]);
  gl.uniform1f(u.uSpec, 0.05 + sk.table.gloss * 0.30);
  gl.uniform1f(u.uPower, 14);
  gl.uniform1f(u.uAmb, 0.30);
  gl.drawElements(gl.TRIANGLES, this.cloth.count, gl.UNSIGNED_SHORT, 0);
  this.table = { tw: tb.tw, th: tb.th };

  /* Where every bone actually ends up this frame, worked out once. The
     shadows have to agree with the bones exactly, and the only way to
     be sure of that is for both to read the same list rather than each
     recomputing the animation curve and drifting apart. */
  var t = scene.table, place = [], shade = [];
  for (i = 0; i < t.bones.length; i++) {
    var b = t.bones[i];
    var px = b.x, py = -b.y, rot = -b.rot * Math.PI / 180, z = 0;
    var anim = scene.anim && scene.anim.idx === b.idx ? scene.anim : null;
    if (anim) {
      var k = Math.min(1, anim.t), e = 1 - Math.pow(1 - k, 3);
      px = anim.fromX + (b.x - anim.fromX) * e;
      py = -(anim.fromY + (b.y - anim.fromY) * e);
      rot = -(anim.fromRot + (b.rot - anim.fromRot) * e) * Math.PI / 180;
      /* the arc of a bone being brought down on the table, and the
         small bounce of the slam at the end of it */
      z = Math.sin(k * Math.PI) * 2.4 + (k > 0.86 ? Math.sin((k - 0.86) / 0.14 * Math.PI) * 0.16 : 0);
    }
    place.push({ b: b, x: px, y: py, z: z, rot: rot });
    /* The shadow falls directly away from the bulb, which is why the
       offset is worked out from the lamp rather than nudged by hand: a
       hand-picked direction is right for one bone and wrong for the one
       at the other end of a long line, and the whole point of a shadow
       is that they all agree about where the light is.

       A bone in the air throws a bigger, fainter shadow that slides in
       under it as it lands. That is the cue that says a bone is *above*
       the table rather than sliding along it — without it the slam
       reads as a bone growing, because nothing else in the frame
       carries height. */
    var ox = px - lamp[0], oy = py - lamp[1];
    var od = Math.hypot(ox, oy) || 1;
    var lift = Math.min(1, z / 2.4);
    var reach = 0.10 + lift * 1.5;
    shade.push({
      x: px + ox / od * reach, y: py + oy / od * reach, z: -0.163, rot: rot,
      s: 1 + lift * 0.45, a: (1 - lift * 0.66) * 0.95
    });
  }
  this.marks(proj, view, this.shadowTex, [0.05, 0.03, 0.02], shade);

  /* the bones */
  var s = this.surf;
  gl.bindTexture(gl.TEXTURE_2D, this.pipTex);
  this.bind(this.bone);
  var face = hex3(sk.bones.face);
  gl.uniform3f(u.uColor, face[0], face[1], face[2]);
  gl.uniform1f(u.uSpec, s.spec);
  gl.uniform1f(u.uPower, s.power);
  gl.uniform1f(u.uRim, s.rim);
  gl.uniform1f(u.uTex, 1);
  gl.uniform1f(u.uAmb, 0.14);
  if (s.translucent) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
  gl.uniform1f(u.uAlpha, s.alpha);

  for (i = 0; i < place.length; i++) {
    var p = place[i];
    var fc = L.faces(p.b);
    this.setFace(fc[0], fc[1]);
    gl.uniformMatrix4fv(u.uModel, false, trs(p.x, p.y, p.z, p.rot, 1, 1, 1));
    gl.drawElements(gl.TRIANGLES, this.bone.count, gl.UNSIGNED_SHORT, 0);
  }
  if (s.translucent) gl.disable(gl.BLEND);

  /* the open ends, marked on the felt itself */
  if (scene.ghosts && scene.ghosts.length) {
    var pulse = 0.42 + 0.26 * Math.sin(now / 320);
    var slots = [], hot = [], leanM = [];
    for (i = 0; i < scene.ghosts.length; i++) {
      var gh = scene.ghosts[i];
      var grot = gh.rot === undefined ? gh.h * 90 : gh.rot;
      var mk = { x: gh.x, y: -gh.y, z: -0.158, rot: -grot * Math.PI / 180, s: 0.97, a: pulse };
      if (scene.hover === gh.end) { mk.a = 1; mk.s = 1.08; hot.push(mk); }
      else if (scene.lean === gh.end) { mk.a = 0.55 + 0.35 * Math.sin(now / 220); mk.s = 1.04; leanM.push(mk); }
      else slots.push(mk);
    }
    this.marks(proj, view, this.slotTex, hex3(sk.marks.ghost), slots);
    /* the end Don Chuy leans to is rung in the colour of the last bone;
       the slot under a dragged bone is filled in solid */
    if (leanM.length) this.marks(proj, view, this.slotTex, hex3(sk.marks.last), leanM);
    if (hot.length) {
      this.marks(proj, view, this.shadowTex, hex3(sk.marks.playable), hot.map(function (m) { return { x: m.x, y: m.y, z: m.z, rot: m.rot, s: 0.9, a: 0.45 }; }));
      this.marks(proj, view, this.slotTex, hex3(sk.marks.playable), hot);
    }
  }

  /* The bone that just landed, picked out on the felt for a moment. The
     flat table always outlined it; the round one showed nothing at all,
     so a play you blinked through was a play you had to hunt for. The
     glow fades over a couple of seconds and never fights the slots. */
  if (scene.lastIdx >= 0 && scene.lastIdx < place.length && !scene.anim && !(scene.ghosts && scene.ghosts.length)) {
    var lp = place[scene.lastIdx], age = scene.lastAge || 0;
    var fade = Math.max(0, 1 - age / 2600);
    if (fade > 0) {
      this.marks(proj, view, this.slotTex, hex3(sk.marks.last), [{
        x: lp.x, y: lp.y, z: -0.16, rot: lp.rot,
        s: (lp.b.dbl ? 1.0 : 1.12) + 0.10 * Math.sin(now / 260), a: 0.30 + 0.45 * fade
      }]);
    }
  }

  /* remember the camera so a tap can be turned back into table coords */
  /* cx/cy in layout coordinates, the frame every caller works in; `mid`
     is where on screen that point is drawn (the middle of the free area,
     not of the canvas) */
  this.lastCam = { eye: eye, at: at, proj: proj, view: view, cx: cx, cy: -cy,
                   mid: this.freeMid };
};

/* ---------- turning a tap back into a place on the table ----------
   The table is the plane z = 0, so a tap is one ray-plane intersection
   rather than any kind of picking pass: unproject the pixel onto the
   near and far planes, and see where the line between them crosses.
   Exact, and free. */
Gfx3D.prototype.pointOnTable = function (px, py) {
  var c = this.lastCam;
  if (!c) return null;
  var ndcX = (px / this.w) * 2 - 1, ndcY = 1 - (py / this.h) * 2;
  var inv = invert(mul(c.proj, c.view, new Float32Array(16)));
  if (!inv) return null;
  var n = xform(inv, [ndcX, ndcY, -1, 1]), f = xform(inv, [ndcX, ndcY, 1, 1]);
  if (!n || !f) return null;
  var dz = f[2] - n[2];
  if (Math.abs(dz) < 1e-6) return null;
  var t = (0 - n[2]) / dz;
  if (t < 0) return null;
  /* back into layout coordinates — see the note on `W` in draw() */
  return { x: n[0] + (f[0] - n[0]) * t, y: -(n[1] + (f[1] - n[1]) * t) };
};

function xform(m, v) {
  var o = [];
  for (var i = 0; i < 4; i++) o[i] = m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i] * v[3];
  if (!o[3]) return null;
  return [o[0] / o[3], o[1] / o[3], o[2] / o[3]];
}
function invert(m) {
  var i = new Float32Array(16), a = m;
  i[0] = a[5]*a[10]*a[15]-a[5]*a[11]*a[14]-a[9]*a[6]*a[15]+a[9]*a[7]*a[14]+a[13]*a[6]*a[11]-a[13]*a[7]*a[10];
  i[4] = -a[4]*a[10]*a[15]+a[4]*a[11]*a[14]+a[8]*a[6]*a[15]-a[8]*a[7]*a[14]-a[12]*a[6]*a[11]+a[12]*a[7]*a[10];
  i[8] = a[4]*a[9]*a[15]-a[4]*a[11]*a[13]-a[8]*a[5]*a[15]+a[8]*a[7]*a[13]+a[12]*a[5]*a[11]-a[12]*a[7]*a[9];
  i[12] = -a[4]*a[9]*a[14]+a[4]*a[10]*a[13]+a[8]*a[5]*a[14]-a[8]*a[6]*a[13]-a[12]*a[5]*a[10]+a[12]*a[6]*a[9];
  i[1] = -a[1]*a[10]*a[15]+a[1]*a[11]*a[14]+a[9]*a[2]*a[15]-a[9]*a[3]*a[14]-a[13]*a[2]*a[11]+a[13]*a[3]*a[10];
  i[5] = a[0]*a[10]*a[15]-a[0]*a[11]*a[14]-a[8]*a[2]*a[15]+a[8]*a[3]*a[14]+a[12]*a[2]*a[11]-a[12]*a[3]*a[10];
  i[9] = -a[0]*a[9]*a[15]+a[0]*a[11]*a[13]+a[8]*a[1]*a[15]-a[8]*a[3]*a[13]-a[12]*a[1]*a[11]+a[12]*a[3]*a[9];
  i[13] = a[0]*a[9]*a[14]-a[0]*a[10]*a[13]-a[8]*a[1]*a[14]+a[8]*a[2]*a[13]+a[12]*a[1]*a[10]-a[12]*a[2]*a[9];
  i[2] = a[1]*a[6]*a[15]-a[1]*a[7]*a[14]-a[5]*a[2]*a[15]+a[5]*a[3]*a[14]+a[13]*a[2]*a[7]-a[13]*a[3]*a[6];
  i[6] = -a[0]*a[6]*a[15]+a[0]*a[7]*a[14]+a[4]*a[2]*a[15]-a[4]*a[3]*a[14]-a[12]*a[2]*a[7]+a[12]*a[3]*a[6];
  i[10] = a[0]*a[5]*a[15]-a[0]*a[7]*a[13]-a[4]*a[1]*a[15]+a[4]*a[3]*a[13]+a[12]*a[1]*a[7]-a[12]*a[3]*a[5];
  i[14] = -a[0]*a[5]*a[14]+a[0]*a[6]*a[13]+a[4]*a[1]*a[14]-a[4]*a[2]*a[13]-a[12]*a[1]*a[6]+a[12]*a[2]*a[5];
  i[3] = -a[1]*a[6]*a[11]+a[1]*a[7]*a[10]+a[5]*a[2]*a[11]-a[5]*a[3]*a[10]-a[9]*a[2]*a[7]+a[9]*a[3]*a[6];
  i[7] = a[0]*a[6]*a[11]-a[0]*a[7]*a[10]-a[4]*a[2]*a[11]+a[4]*a[3]*a[10]+a[8]*a[2]*a[7]-a[8]*a[3]*a[6];
  i[11] = -a[0]*a[5]*a[11]+a[0]*a[7]*a[9]+a[4]*a[1]*a[11]-a[4]*a[3]*a[9]-a[8]*a[1]*a[7]+a[8]*a[3]*a[5];
  i[15] = a[0]*a[5]*a[10]-a[0]*a[6]*a[9]-a[4]*a[1]*a[10]+a[4]*a[2]*a[9]+a[8]*a[1]*a[6]-a[8]*a[2]*a[5];
  var det = a[0] * i[0] + a[1] * i[4] + a[2] * i[8] + a[3] * i[12];
  if (!det) return null;
  det = 1 / det;
  for (var k = 0; k < 16; k++) i[k] *= det;
  return i;
}

/* the other way round: where on the screen a point of the table is
   drawn. `z` is height above the felt; the checks use it to read the
   pixels of a bone's face back, and the drag test to aim at a slot. */
Gfx3D.prototype.screenOf = function (x, y, z) {
  var c = this.lastCam;
  if (!c) return null;
  var q = xform(mul(c.proj, c.view, new Float32Array(16)), [x, -y, z || 0, 1]);
  if (!q) return null;
  return { x: (q[0] * 0.5 + 0.5) * this.w, y: (1 - (q[1] * 0.5 + 0.5)) * this.h };
};

/* which end of the line a tap landed nearest, if any. The hand is not
   tested here — the 2D overlay owns it. */
Gfx3D.prototype.hitTable = function (px, py, scene) {
  var p = this.pointOnTable(px, py);
  if (!p || !scene.ghosts) return null;
  var best = null, bd = 1e9;
  for (var i = 0; i < scene.ghosts.length; i++) {
    var gh = scene.ghosts[i];
    var d = Math.hypot(p.x - gh.x, p.y - gh.y);
    if (d < bd) { bd = d; best = gh; }
  }
  /* a bone is 2 × 1, so anything within about a bone's length of the
     slot is a clear intent to play there */
  return (best && bd < 2.2) ? { kind: "end", end: best.end, dist: bd } : null;
};

Gfx3D.prototype.destroy = function () {
  if (!this.gl) return;
  var gl = this.gl;
  try {
    if (this.pipTex) gl.deleteTexture(this.pipTex);
    if (this.feltTex) gl.deleteTexture(this.feltTex);
    if (this.woodTex) gl.deleteTexture(this.woodTex);
    if (this.tileTex) gl.deleteTexture(this.tileTex);
    if (this.shadowTex) gl.deleteTexture(this.shadowTex);
    if (this.slotTex) gl.deleteTexture(this.slotTex);
    if (this.pr) gl.deleteProgram(this.pr);
    if (this.fpr) gl.deleteProgram(this.fpr);
  } catch (e) { /* the context may already be gone; nothing to free */ }
  this.ok = false;
};

/* exposed so `tools/bone-check.js` can check the winding in node, where
   there is no WebGL to upload it to */
Gfx3D.boneGeometry = boneGeometry;
Gfx3D.tableGeometry = tableGeometry;

if (typeof module !== "undefined" && module.exports) module.exports = Gfx3D;
else root.Gfx3D = Gfx3D;
})(typeof self !== "undefined" ? self : this);
