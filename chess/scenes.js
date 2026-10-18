/* scenes.js — where the board is.

   A board drawn against a plain colour reads as a diagram hanging in
   space: nothing under it, nothing behind it, light from nowhere in
   particular. A real board is always somewhere — on a picnic table in
   the sun, on a marble café table with the espresso machine hissing
   behind it, on a mahogany table under a chandelier — and the place is
   half of what it feels like to sit down to a game.

   So a scene is the place, as data and a few painters:

     - a table, which the board stands on and throws its shadow across:
       a shape, a size, and a surface painted on a canvas (colour and a
       height field, so planks have gaps and marble has a polish);
     - the world around it, painted as one panorama — an equirectangular
       picture of every direction, sky to floor — already out of focus,
       the way a photograph of a board on a table has its background
       melted by a wide aperture. The renderer looks it up by direction,
       so orbiting the board walks you around the park;
     - the light that place has: where the sun or the lamp hangs, what
       colour it is, what colour the shade is, and (for the park and the
       café) a cookie — leaves or window bars — that the key light is
       thrown through, so dappled sun falls across the table and the men.

   The panorama doubles as what the men reflect: a polished king in the
   park has blue sky across his crown and green round his skirt.

   Nothing here is downloaded. Every place is painted on a canvas from a
   seeded random stream, the first time it is asked for, so a scene costs
   a few kilobytes of code and the same seed always paints the same park.
   "Studio" is the room as it was before scenes — a plain backdrop, no
   table — for anyone who liked the board on its own.

   Directions follow the renderer: y is up, White sits on +z looking
   toward −z. In a panorama, x runs round the horizon (u = atan2(z, x) /
   2π + ½, so White looks at u = ¼ and Black at u = ¾) and y runs from
   straight up (v = 0) to straight down (v = 1), with the horizon across
   the middle. */
(function (root) {
"use strict";

var TAU = Math.PI * 2;

function norm3(v) {
  var l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/* ---------- the places ----------
   key: the light that casts — dir points toward it, col is its colour
   (sRGB, linearised by the renderer), power its strength. fill: the
   other side of the room, no shadow. cookie: what the key light comes
   through, and how much of it it stops. table: the shape (round or
   square), its half-width in board units (the board itself is 4.5 from
   the middle to its edge), how thick its top is, the colour of the edge
   you see, and how polished it is. hot: how far past white the
   brightest parts of the panorama are pushed, so the sun through the
   leaves and the bulbs over the café counter bloom like light rather
   than sitting there like paint. lift: how far above the horizon the
   top of the picture looks — a park wants the treetops, a room a little
   more of its walls. */
var LIST = [
  {
    id: "park", label: "Park", note: "a picnic table in the sun, under the trees",
    seed: 1931,
    key:  { dir: norm3([-0.46, 1.08, 0.42]), col: [1.00, 0.95, 0.84], power: 2.05 },
    fill: { dir: norm3([0.42, 0.85, -0.52]), col: [0.62, 0.74, 1.00], power: 0.52 },
    cookie: { kind: "leaves", amount: 0.40, scale: 0.13 },
    table: { shape: "square", half: 6.2, thick: 0.55, edge: "#8a7558", gloss: 0.08, bump: 0.9 },
    exposure: 0.94, hot: 2.4, bgGain: 1.0, lift: 0.13
  },
  {
    id: "cafe", label: "Café", note: "a marble bistro table by the window",
    seed: 2718,
    key:  { dir: norm3([0.32, 0.86, 0.72]), col: [1.00, 0.97, 0.92], power: 1.62 },
    fill: { dir: norm3([-0.40, 1.00, 0.55]), col: [1.00, 0.74, 0.46], power: 0.62 },
    cookie: { kind: "window", amount: 0.36, scale: 0.11 },
    table: { shape: "round", half: 6.75, thick: 0.38, edge: "#b08d57", gloss: 0.45, bump: 0.5 },
    exposure: 1.0, hot: 3.0, bgGain: 0.95, lift: 0.24
  },
  {
    id: "salon", label: "Grand room", note: "mahogany under a chandelier, a fire in the grate",
    seed: 1789,
    key:  { dir: norm3([-0.22, 1.20, 0.30]), col: [1.00, 0.84, 0.62], power: 1.70 },
    fill: { dir: norm3([0.70, 0.42, -0.52]), col: [0.56, 0.62, 0.92], power: 0.36 },
    cookie: null,
    table: { shape: "square", half: 5.8, thick: 0.45, edge: "#4a1d12", gloss: 0.62, bump: 0.35 },
    exposure: 1.06, hot: 3.2, bgGain: 0.92, lift: 0.27
  },
  {
    id: "library", label: "Library", note: "green leather, lamplight and a wall of books",
    seed: 1450,
    key:  { dir: norm3([0.52, 1.00, 0.50]), col: [1.00, 0.82, 0.56], power: 1.78 },
    fill: { dir: norm3([-0.60, 0.55, -0.55]), col: [0.48, 0.56, 0.82], power: 0.26 },
    cookie: null,
    table: { shape: "square", half: 5.9, thick: 0.50, edge: "#3a2416", gloss: 0.30, bump: 0.6 },
    exposure: 1.04, hot: 3.0, bgGain: 0.9, lift: 0.25
  },
  {
    id: "studio", label: "Studio", note: "the board on its own, against the room colour",
    seed: 1,
    key: null, fill: null, cookie: null, table: null
  }
];
var BY_ID = {};
LIST.forEach(function (s) { BY_ID[s.id] = s; });
var DEFAULT = "park";

function get(id) { return BY_ID[id] || BY_ID[DEFAULT]; }
function has(id) { return !!BY_ID[id]; }

/* ---------- a little paint shop ---------- */
/* mulberry32: small, fast, and the same numbers for the same seed in
   every browser, which is what makes a painted park the same park */
function stream(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* A canvas that will be blurred is read back, and a browser asked for
   that up front keeps it in ordinary memory instead of on the graphics
   card, where every read would be a round trip. */
function canvas(w, h, read) {
  var cv;
  if (typeof document !== "undefined") {
    cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
  } else if (typeof OffscreenCanvas !== "undefined") cv = new OffscreenCanvas(w, h);
  if (cv && read) { try { cv.getContext("2d", { willReadFrequently: true }); } catch (e) {} }
  return cv || null;
}
function rgba(c, a) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a + ")"; }
function mixC(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function jitter(c, r, k) {
  return [c[0] + (r() - 0.5) * k, c[1] + (r() - 0.5) * k, c[2] + (r() - 0.5) * k];
}

/* A box blur run three times is a Gaussian to within what an eye can
   tell, and it is separable, so a wide one costs no more than a narrow
   one. Across, it wraps — the panorama's left edge is its right edge —
   and down, it stops at the poles. This is the wide aperture: done once
   when the place is painted, so the renderer never pays for it. */
function blur(cv, radius, wrapX) {
  if (radius < 1) return;
  /* A wide blur throws away everything a half-size copy would have lost
     anyway, so a wide one is done at half size and drawn back up: a
     quarter of the arithmetic for a picture nobody could tell apart. */
  if (radius >= 3 && cv.width >= 256) {
    var half = canvas(cv.width >> 1, cv.height >> 1, true);
    if (half) {
      half.getContext("2d").drawImage(cv, 0, 0, half.width, half.height);
      blurAt(half, radius / 2, wrapX);
      var cg = cv.getContext("2d");
      cg.imageSmoothingEnabled = true;
      cg.drawImage(half, 0, 0, cv.width, cv.height);
      return;
    }
  }
  blurAt(cv, radius, wrapX);
}
function blurAt(cv, radius, wrapX) {
  var g = cv.getContext("2d"), W = cv.width, H = cv.height;
  var img = g.getImageData(0, 0, W, H), d = img.data;
  var r = Math.max(1, Math.round(radius)), inv = 1 / (2 * r + 1);
  var len = Math.max(W, H), src = new Float32Array(len * 3), out = new Float32Array(len * 3);
  /* one row or column at a time, all three runs of the box over it
     before moving on (box filters commute, so this is the same blur) */
  function line(base, stride, n, wrap) {
    var i, o, k, j, tmp;
    for (i = 0, o = base; i < n; i++, o += stride) { src[i * 3] = d[o]; src[i * 3 + 1] = d[o + 1]; src[i * 3 + 2] = d[o + 2]; }
    for (var it = 0; it < 3; it++) {
      var s0 = 0, s1 = 0, s2 = 0;
      for (k = -r; k <= r; k++) {
        j = wrap ? (k < 0 ? k + n : k >= n ? k - n : k) : (k < 0 ? 0 : k >= n ? n - 1 : k);
        if (j < 0) j = 0; else if (j >= n) j = n - 1;
        s0 += src[j * 3]; s1 += src[j * 3 + 1]; s2 += src[j * 3 + 2];
      }
      for (i = 0; i < n; i++) {
        out[i * 3] = s0 * inv; out[i * 3 + 1] = s1 * inv; out[i * 3 + 2] = s2 * inv;
        var lo = i - r, hi = i + r + 1;
        if (wrap) { if (lo < 0) lo += n; if (hi >= n) hi -= n; }
        else { if (lo < 0) lo = 0; if (hi >= n) hi = n - 1; }
        s0 += src[hi * 3] - src[lo * 3]; s1 += src[hi * 3 + 1] - src[lo * 3 + 1]; s2 += src[hi * 3 + 2] - src[lo * 3 + 2];
      }
      tmp = src; src = out; out = tmp;
    }
    for (i = 0, o = base; i < n; i++, o += stride) { d[o] = src[i * 3]; d[o + 1] = src[i * 3 + 1]; d[o + 2] = src[i * 3 + 2]; d[o + 3] = 255; }
  }
  for (var y = 0; y < H; y++) line(y * W * 4, 4, W, wrapX);
  for (var x = 0; x < W; x++) line(x * 4, W * 4, H, false);
  g.putImageData(img, 0, 0);
}

/* Painting on a panorama in the terms the eye uses: an azimuth in
   degrees round the horizon (0 is White's straight-ahead, increasing to
   the right, so Black's view is at 180) and an elevation in degrees
   above the horizon. Anything near the left or right edge is painted
   twice, a canvas-width apart, so it wraps without a seam. */
function frame(cv) {
  var W = cv.width, H = cv.height, g = cv.getContext("2d");
  /* White looks toward −z: azimuth atan2(−1, 0) = −90°, which is u = ¼.
     Turning right from there (toward +x) increases u. */
  function X(az) { var u = 0.25 + az / 360; u -= Math.floor(u); return u * W; }
  function Y(el) { return (0.5 - el / 180) * H; }
  function PX(deg) { return deg / 360 * W; }          /* a width in degrees, at the horizon */
  function wrap(x, w, fn) {
    fn(x);
    if (x - w < 0) fn(x + W);
    if (x + w > W) fn(x - W);
  }
  return { W: W, H: H, g: g, X: X, Y: Y, PX: PX, wrap: wrap };
}

/* a soft disc of light, for the bokeh painted on after the blur: a flat
   middle and a short falloff, which is what an out-of-focus point of
   light looks like through a real lens */
function bokeh(g, x, y, r, col, a) {
  var gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a * 0.85));
  gr.addColorStop(0.62, rgba(col, a));
  gr.addColorStop(0.86, rgba(col, a * 0.55));
  gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
function glow(g, x, y, r, col, a) {
  var gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a));
  gr.addColorStop(0.35, rgba(col, a * 0.45));
  gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}
function vgrad(g, y0, y1, stops) {
  var gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
  return gr;
}
/* where the key light is in the sky, in panorama degrees */
function lightAt(dir) {
  var az = Math.atan2(dir[2], dir[0]) * 180 / Math.PI;     /* −90 is White's ahead */
  return { az: az + 90, el: Math.asin(dir[1]) * 180 / Math.PI };
}

/* ======================= the park ======================= */
function paintPark(cv, sc, r) {
  var P = frame(cv), g = P.g, W = P.W, H = P.H, Y = P.Y, X = P.X;
  var sun = lightAt(sc.key.dir);

  /* the sky: deep at the top, milky at the horizon */
  g.fillStyle = vgrad(g, 0, Y(0), [[0, "#2c69bd"], [0.45, "#4f8fd6"], [0.8, "#9cc7ea"], [1, "#dcecf2"]]);
  g.fillRect(0, 0, W, Y(0) + 1);
  /* clouds: piles of soft white, lit from the sun's side */
  for (var c = 0; c < 9; c++) {
    var cx = r() * W, cy = Y(14 + r() * 34), cw = P.PX(18 + r() * 26);
    for (var k = 0; k < 9; k++) {
      var px = cx + (r() - 0.5) * cw, py = cy + (r() - 0.5) * cw * 0.18;
      var pr = cw * (0.10 + r() * 0.12);
      P.wrap(px, pr, function (x) { glow(g, x, py, pr * 1.6, [255, 255, 255], 0.30); });
    }
  }
  /* the sun's own glow, where the key light says it is */
  P.wrap(X(sun.az), 200, function (x) {
    glow(g, x, Y(sun.el), H * 0.42, [255, 244, 214], 0.55);
    glow(g, x, Y(sun.el), H * 0.06, [255, 255, 245], 1.0);
  });

  /* far trees: low, hazy, blue-green, all round the horizon */
  var i, t;
  for (i = 0; i < 70; i++) {
    var fx = r() * W, fh = 3 + r() * 7, fr = P.PX(2 + r() * 4);
    var fc = mixC([86, 122, 92], [150, 182, 170], 0.35 + r() * 0.3);
    P.wrap(fx, fr * 2, function (x) {
      g.fillStyle = rgba(fc, 0.95);
      g.beginPath(); g.ellipse(x, Y(fh * 0.6), fr * 1.4, fr * 1.1, 0, 0, TAU); g.fill();
    });
  }
  /* the lawn: bright and hazy far away, deeper green close to the table */
  g.fillStyle = vgrad(g, Y(0), H, [[0, "#a9c873"], [0.05, "#8dbd57"], [0.25, "#6aa43f"],
                                   [0.6, "#4e8a31"], [1, "#3b6d25"]]);
  g.fillRect(0, Y(0), W, H - Y(0));
  /* a gravel path curving across the grass, round the whole park */
  g.lineCap = "round";
  for (var pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? "#e6d8b2" : "#bfae86";
    g.beginPath();
    for (t = 0; t <= 1.0001; t += 1 / 96) {
      var px2 = t * W, el = -6.5 - 3.2 * Math.sin(t * TAU * 2 + 0.7) - 1.6 * Math.sin(t * TAU * 5);
      if (t === 0) g.moveTo(px2, Y(el)); else g.lineTo(px2, Y(el));
    }
    g.lineWidth = pass ? H * 0.020 : H * 0.034;
    g.stroke();
  }
  /* near trees: big rounded canopies, trunks to the grass, a pool of
     shade under each one, and the sunlit side brighter */
  var sunX = X(sun.az);
  for (i = 0; i < 16; i++) {
    var tx = (i + r() * 0.7) / 16 * W, scale = 0.7 + r() * 0.7;
    var base = -1.5 - r() * 2.5, top = 10 + scale * 14, crown = P.PX(7 + scale * 6);
    P.wrap(tx, crown * 2, function (x) {
      g.fillStyle = "rgba(38,70,28,0.55)";
      g.beginPath(); g.ellipse(x + crown * 0.25, Y(base - 0.6), crown * 1.15, H * 0.012, 0, 0, TAU); g.fill();
      g.fillStyle = "#4a3828";
      g.fillRect(x - crown * 0.07, Y(top * 0.55), crown * 0.14, Y(base) - Y(top * 0.55));
      for (var k2 = 0; k2 < 22; k2++) {
        var a = r() * TAU, d = Math.sqrt(r()) * crown * 0.75;
        var bx = x + Math.cos(a) * d, by = Y(top * 0.72) + Math.sin(a) * d * 0.62;
        var lit = Math.max(0, Math.cos(Math.atan2(0, (sunX - bx) / W * TAU) - a)) * 0.5 + (by < Y(top * 0.72) ? 0.25 : 0);
        var col = mixC([40, 82, 34], [146, 186, 72], Math.min(1, lit + r() * 0.25));
        g.fillStyle = rgba(col, 1);
        g.beginPath(); g.arc(bx, by, crown * (0.22 + r() * 0.2), 0, TAU); g.fill();
      }
    });
  }
  /* a low clipped hedge with flowers along the path */
  for (i = 0; i < 140; i++) {
    var hx = r() * W, hr = P.PX(1 + r() * 1.6);
    P.wrap(hx, hr * 2, function (x) {
      g.fillStyle = rgba(mixC([44, 92, 40], [96, 140, 60], r()), 1);
      g.beginPath(); g.ellipse(x, Y(-0.6), hr * 1.5, hr * 0.9, 0, 0, TAU); g.fill();
    });
  }
  var blooms = [[214, 62, 58], [242, 196, 70], [150, 92, 214], [248, 246, 236], [236, 120, 160]];
  for (i = 0; i < 520; i++) {
    var bx2 = r() * W, by2 = Y(-1.6 - r() * 3.4), bc = blooms[(r() * blooms.length) | 0];
    g.fillStyle = rgba(bc, 0.95);
    g.beginPath(); g.arc(bx2, by2, 1.2 + r() * 2.2, 0, TAU); g.fill();
  }
  /* a fountain straight across the park from White, a bench either side */
  var fxc = X(4);
  P.wrap(fxc, 80, function (x) {
    g.fillStyle = "#b9b6ae"; g.beginPath(); g.ellipse(x, Y(-2.6), P.PX(9), H * 0.016, 0, 0, TAU); g.fill();
    g.fillStyle = "#8aa6b4"; g.beginPath(); g.ellipse(x, Y(-2.9), P.PX(8), H * 0.010, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(240,248,255,0.85)";
    g.beginPath(); g.ellipse(x, Y(2.8), P.PX(1.6), H * 0.034, 0, 0, TAU); g.fill();
    glow(g, x, Y(4), P.PX(7), [255, 255, 255], 0.45);
  });
  [[-26, 1], [34, 1], [160, 1.2], [210, 1]].forEach(function (b) {
    P.wrap(X(b[0]), 60, function (x) {
      var w = P.PX(5 * b[1]);
      g.fillStyle = "#2f4a35";
      g.fillRect(x - w / 2, Y(-0.4), w, H * 0.006);
      g.fillRect(x - w / 2, Y(0.9), w, H * 0.005);
      g.fillRect(x - w / 2, Y(0.9), H * 0.003, Y(-1.8) - Y(0.9));
      g.fillRect(x + w / 2 - H * 0.003, Y(0.9), H * 0.003, Y(-1.8) - Y(0.9));
    });
  });
  /* lamp posts */
  for (i = 0; i < 8; i++) {
    var lx = (i + 0.5) / 8 * W + (r() - 0.5) * 30;
    g.fillStyle = "#26302a";
    g.fillRect(lx - 1.5, Y(9), 3, Y(-3.5) - Y(9));
    g.beginPath(); g.arc(lx, Y(9.4), 4, 0, TAU); g.fill();
  }
  /* shade and sun on the near grass, as a canopy overhead would throw it */
  for (i = 0; i < 90; i++) {
    var sx = r() * W, sy = Y(-12 - r() * 60), sr = 10 + r() * 40;
    g.fillStyle = r() < 0.55 ? "rgba(30,62,22,0.28)" : "rgba(210,240,140,0.16)";
    g.beginPath(); g.ellipse(sx, sy, sr * 1.6, sr * 0.55, 0, 0, TAU); g.fill();
  }

  blur(cv, W / 512 * 3.2, true);

  /* after the blur, the light that a lens turns into discs: sun coming
     through the leaves, glinting off the fountain */
  for (i = 0; i < 90; i++) {
    var kx = r() * W, ky = Y(6 + r() * 22);
    bokeh(g, kx, ky, 2 + r() * 5, [255, 250, 222], 0.35 + r() * 0.5);
  }
  for (i = 0; i < 14; i++) bokeh(g, fxc + (r() - 0.5) * P.PX(10), Y(-2 + r() * 6), 2 + r() * 3, [255, 255, 255], 0.7);
}

/* ======================= the café ======================= */
/* What a seated player actually sees past the table is a strip a little
   below and a little above eye level, so that is where the café keeps
   its best things: the counter and its espresso machine straight ahead
   of White, the big street window straight ahead of Black, and the
   pendant lamps low enough to hang into the top of the picture. */
function paintCafe(cv, sc, r) {
  var P = frame(cv), g = P.g, W = P.W, H = P.H, Y = P.Y, X = P.X;
  var i, k;
  /* ceiling: dark-stained boards */
  g.fillStyle = vgrad(g, 0, Y(28), [[0, "#1b120d"], [1, "#3a2619"]]);
  g.fillRect(0, 0, W, Y(28));
  for (i = 0; i < 30; i++) { g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, Y(28) * i / 30, W, 1.5); }
  /* brick all round, floor at −15°, ceiling at +28° */
  g.fillStyle = "#6e3826";
  g.fillRect(0, Y(28), W, Y(-15) - Y(28));
  var rowH = H * 0.011;
  for (var by = Y(28), row = 0; by < Y(-15); by += rowH, row++) {
    for (var bx = (row % 2) * rowH * 1.4; bx < W; bx += rowH * 2.8) {
      g.fillStyle = rgba(jitter([132, 68, 46], r, 36), 1);
      g.fillRect(bx + 1, by + 1, rowH * 2.8 - 2, rowH - 2);
    }
  }
  /* the floor: warm oak, darker toward our feet */
  g.fillStyle = vgrad(g, Y(-15), H, [[0, "#7a5536"], [0.4, "#4f3524"], [1, "#2c1d14"]]);
  g.fillRect(0, Y(-15), W, H - Y(-15));
  for (i = 0; i < 60; i++) {
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(0, Y(-15) + (H - Y(-15)) * Math.pow(i / 60, 1.6), W, 1.5);
  }

  /* the street window, ahead of Black and to either side of him: the
     daylight in the room comes in here */
  var wA = 118, wB = 242;
  for (var pane = 0; pane < 6; pane++) {
    var x0 = X(wA + pane * (wB - wA) / 6), pw = P.PX((wB - wA) / 6);
    g.fillStyle = vgrad(g, Y(24), Y(-7), [[0, "#e6f1fb"], [0.45, "#f7f4e8"], [0.62, "#d6cdb8"], [1, "#9b9384"]]);
    g.fillRect(x0, Y(24), pw, Y(-7) - Y(24));
    /* the far side of the street: shopfronts, an awning, a red car */
    for (var s = 0; s < 3; s++) {
      g.fillStyle = rgba(jitter([200, 178, 150], r, 70), 1);
      g.fillRect(x0 + s * pw / 3, Y(13 - r() * 6), pw / 3 - 2, Y(-1) - Y(13));
    }
    if (pane === 2) { g.fillStyle = "#c2412f"; g.fillRect(x0 + pw * 0.2, Y(1.5), pw * 0.6, Y(-2) - Y(1.5)); }
    if (pane === 4) { g.fillStyle = "#2f6b55"; g.fillRect(x0, Y(9), pw, H * 0.012); }
    g.fillStyle = "#1f1a16";
    g.fillRect(x0 - 4, Y(24), 8, Y(-7) - Y(24));
    g.fillRect(x0, Y(9.5), pw, 5);
  }
  g.fillStyle = "#1f1a16";
  g.fillRect(X(wA), Y(24) - 8, X(wB) - X(wA), 10);
  g.fillRect(X(wB) - 4, Y(24), 8, Y(-7) - Y(24));
  g.fillStyle = "#3b2a20"; g.fillRect(X(wA), Y(-7), X(wB) - X(wA), 6);
  /* plants along the sill, and two little tables in the window */
  for (var pl = 0; pl < 9; pl++) {
    var pxp = X(wA + 6 + pl * (wB - wA - 12) / 8);
    g.fillStyle = "#b5653d"; g.fillRect(pxp - 8, Y(-4), 16, Y(-7) - Y(-4));
    for (var lf = 0; lf < 10; lf++) {
      g.fillStyle = rgba(jitter([58, 118, 52], r, 44), 1);
      g.beginPath(); g.ellipse(pxp + (r() - 0.5) * 28, Y(-2 + r() * 5), 7, 4, r() * 3, 0, TAU); g.fill();
    }
  }
  [160, 205].forEach(function (az) {
    var x = X(az);
    g.fillStyle = "#d8d3c8"; g.beginPath(); g.ellipse(x, Y(-9), P.PX(6), H * 0.009, 0, 0, TAU); g.fill();
    g.fillStyle = "#1e1612"; g.fillRect(x - 2, Y(-9), 4, Y(-18) - Y(-9));
    g.lineWidth = 3; g.strokeStyle = "#1e1612";
    g.beginPath(); g.arc(x + P.PX(7), Y(-6), P.PX(2.4), Math.PI, TAU); g.stroke();
    g.fillRect(x + P.PX(4.6), Y(-6), 3, Y(-16) - Y(-6));
  });

  /* the counter, straight ahead of White */
  P.wrap(X(0), P.PX(90), function (x) {
    var w = P.PX(78);
    /* shelves of cups and jars on the brick behind it */
    for (var sh = 0; sh < 3; sh++) {
      var sy = Y(9 + sh * 5.5);
      g.fillStyle = "#4b3222"; g.fillRect(x - w * 0.5, sy, w, 5);
      for (k = 0; k < 30; k++) {
        g.fillStyle = r() < 0.6 ? "#f1ece2" : rgba(jitter([150, 110, 70], r, 70), 1);
        g.fillRect(x - w * 0.48 + k * w * 0.96 / 30, sy - 9, 9, 9);
      }
    }
    /* the chalkboard menu at its left end */
    g.fillStyle = "#6b4a2c"; g.fillRect(x - w * 0.52, Y(23), w * 0.26, Y(9) - Y(23));
    g.fillStyle = "#1d2420"; g.fillRect(x - w * 0.5, Y(22.4), w * 0.22, Y(9.6) - Y(22.4));
    g.strokeStyle = "rgba(240,240,230,0.55)"; g.lineWidth = 1.5;
    for (k = 0; k < 7; k++) {
      g.beginPath(); g.moveTo(x - w * 0.48, Y(21 - k * 1.6)); g.lineTo(x - w * 0.48 + w * (0.08 + r() * 0.1), Y(21 - k * 1.6)); g.stroke();
    }
    /* the bar itself: dark panelled front, a zinc top */
    g.fillStyle = "#3b2a20"; g.fillRect(x - w / 2, Y(-1), w, Y(-15) - Y(-1));
    for (k = 0; k < 10; k++) {
      g.strokeStyle = "rgba(210,160,100,0.18)"; g.lineWidth = 2;
      g.strokeRect(x - w / 2 + k * w / 10 + 4, Y(-3), w / 10 - 8, Y(-13) - Y(-3));
    }
    g.fillStyle = "#c4c0b8"; g.fillRect(x - w / 2, Y(-0.6), w, H * 0.011);
    /* espresso machine: steel and a red stripe, two group heads */
    g.fillStyle = "#d7d5d0"; g.fillRect(x - P.PX(10), Y(7), P.PX(20), Y(-0.5) - Y(7));
    g.fillStyle = "#9b231c"; g.fillRect(x - P.PX(10), Y(5), P.PX(20), H * 0.009);
    g.fillStyle = "#2a2a2a";
    g.fillRect(x - P.PX(6), Y(2), P.PX(2), Y(0) - Y(2)); g.fillRect(x + P.PX(4), Y(2), P.PX(2), Y(0) - Y(2));
    /* a grinder, and a stack of cups on top of the machine */
    g.fillStyle = "#2b2b2e"; g.fillRect(x - P.PX(16), Y(6), P.PX(4), Y(-0.5) - Y(6));
    for (k = 0; k < 6; k++) { g.fillStyle = "#f4efe6"; g.fillRect(x - P.PX(8) + k * P.PX(2.7), Y(8.6), P.PX(2), Y(7) - Y(8.6)); }
    /* the pastry case, lit from inside */
    g.fillStyle = "#f6dfb0"; g.fillRect(x + P.PX(14), Y(4.5), P.PX(22), Y(-0.5) - Y(4.5));
    for (k = 0; k < 16; k++) {
      g.fillStyle = rgba(jitter([206, 140, 72], r, 60), 1);
      g.beginPath(); g.arc(x + P.PX(16) + r() * P.PX(18), Y(0.8 + r() * 2.6), 4, 0, TAU); g.fill();
    }
    /* stools along the front */
    for (k = 0; k < 6; k++) {
      var sx2 = x - w * 0.42 + k * w * 0.168;
      g.fillStyle = "#1a1310"; g.fillRect(sx2 - 2, Y(-6), 4, Y(-15) - Y(-6));
      g.fillStyle = "#7a2f22"; g.beginPath(); g.ellipse(sx2, Y(-6), P.PX(2), H * 0.006, 0, 0, TAU); g.fill();
    }
  });
  /* framed posters on the brick at the sides */
  [[-62, "#d9a441"], [-82, "#356a8a"], [70, "#c7482f"], [92, "#e9dfc8"]].forEach(function (p) {
    P.wrap(X(p[0]), 40, function (x) {
      g.fillStyle = "#181210"; g.fillRect(x - P.PX(7), Y(18), P.PX(14), Y(2) - Y(18));
      g.fillStyle = p[1]; g.fillRect(x - P.PX(6), Y(17), P.PX(12), Y(3) - Y(17));
      g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.arc(x, Y(11), P.PX(2.6), 0, TAU); g.fill();
    });
  });
  /* other tables and bentwood chairs along the side walls */
  [-45, -100, 45, 100].forEach(function (az) {
    P.wrap(X(az), 60, function (x) {
      g.fillStyle = "#d8d3c8";
      g.beginPath(); g.ellipse(x, Y(-8), P.PX(5), H * 0.008, 0, 0, TAU); g.fill();
      g.fillStyle = "#1e1612"; g.fillRect(x - 2, Y(-8), 4, Y(-17) - Y(-8));
      g.lineWidth = 3; g.strokeStyle = "#1e1612";
      g.beginPath(); g.arc(x - P.PX(6), Y(-5), P.PX(2.2), Math.PI, TAU); g.stroke();
      g.fillRect(x - P.PX(8.2), Y(-5), 3, Y(-15) - Y(-5));
    });
  });

  blur(cv, W / 512 * 2.4, true);

  /* the pendant lamps hang low over the counter and the tables: a cord,
     a black enamel shade, a warm bare bulb under it */
  var lamps = [-34, -17, 0, 17, 34, -78, 78, 150, 210];
  lamps.forEach(function (az) {
    var lx = X(az), le = az > -40 && az < 40 ? 13.5 : 16;
    g.fillStyle = "rgba(20,14,10,0.85)"; g.fillRect(lx - 1, 0, 2, Y(le + 3));
    g.fillStyle = "#16110d";
    g.beginPath(); g.moveTo(lx - 16, Y(le)); g.lineTo(lx + 16, Y(le)); g.lineTo(lx + 6, Y(le + 3)); g.lineTo(lx - 6, Y(le + 3)); g.fill();
    glow(g, lx, Y(le - 1.5), 64, [255, 186, 104], 0.55);
    glow(g, lx, Y(le - 8), 90, [255, 176, 96], 0.18);
    bokeh(g, lx, Y(le - 0.8), 8, [255, 228, 170], 1.0);
  });
  /* a string of little lights scalloped along the brick */
  for (i = 0; i < 90; i++) {
    var sx = i / 90 * W, se = 22 - 2.6 * Math.abs(Math.sin(i / 90 * TAU * 7));
    bokeh(g, sx, Y(se), 3.4, [255, 214, 150], 0.9);
  }
  /* chrome on the espresso machine, the sun on the window glass */
  P.wrap(X(0), 60, function (x) {
    for (var c2 = 0; c2 < 7; c2++) bokeh(g, x - P.PX(9) + r() * P.PX(18), Y(1 + r() * 5.5), 3 + r() * 4, [255, 255, 250], 0.9);
  });
  for (i = 0; i < 30; i++) bokeh(g, X(wA + 4 + r() * (wB - wA - 8)), Y(-3 + r() * 24), 3 + r() * 6, [255, 252, 236], 0.35 + r() * 0.4);
}

/* ======================= the grand room ======================= */
/* A drawing room in the old style. Straight ahead of White, a marble
   fireplace with the fire lit, candelabra on the mantel and a gilt
   mirror over it; ahead of Black, tall windows in crimson drapes with
   the evening coming on, and a portrait between them. Round the walls,
   green silk damask, gilt frames, candle sconces, walnut panelling,
   and a chandelier glittering over the table. */
function paintSalon(cv, sc, r) {
  var P = frame(cv), g = P.g, W = P.W, H = P.H, Y = P.Y, X = P.X;
  var i, k;
  /* coffered ceiling with gilded mouldings */
  g.fillStyle = vgrad(g, 0, Y(32), [[0, "#2c2016"], [1, "#4b3824"]]);
  g.fillRect(0, 0, W, Y(32));
  for (i = 0; i < 24; i++) {
    g.strokeStyle = "rgba(214,170,90,0.4)"; g.lineWidth = 3;
    g.strokeRect(i / 24 * W + 4, Y(62), W / 24 - 8, Y(38) - Y(62));
  }
  /* the cornice: a deep band of gilt and cream */
  g.fillStyle = "#e9dcc0"; g.fillRect(0, Y(32) - 10, W, 12);
  g.fillStyle = "#c79a4e"; g.fillRect(0, Y(32), W, 6);
  /* damask: deep green silk with a repeating pale figure */
  g.fillStyle = "#1d3a2b"; g.fillRect(0, Y(32) + 6, W, Y(-2) - Y(32) - 6);
  for (var dy = Y(31); dy < Y(-1); dy += 26) {
    for (var dx = ((dy / 26) % 2) * 19; dx < W; dx += 38) {
      g.fillStyle = "rgba(176,200,150,0.16)";
      g.beginPath(); g.ellipse(dx, dy, 6, 11, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(dx - 8, dy + 6, 4, 6, 0.6, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(dx + 8, dy + 6, 4, 6, -0.6, 0, TAU); g.fill();
    }
  }
  /* dado rail, walnut panelling, a skirting */
  g.fillStyle = "#d4a95a"; g.fillRect(0, Y(-2), W, 6);
  g.fillStyle = "#3d2214"; g.fillRect(0, Y(-2) + 6, W, Y(-15) - Y(-2) - 6);
  for (i = 0; i < 44; i++) {
    g.strokeStyle = "rgba(226,176,104,0.30)"; g.lineWidth = 2.5;
    g.strokeRect(i / 44 * W + 6, Y(-4), W / 44 - 12, Y(-13) - Y(-4));
  }
  /* the floor: herringbone oak, and a red and indigo carpet near us */
  g.fillStyle = "#5c3a20"; g.fillRect(0, Y(-15), W, H - Y(-15));
  for (i = 0; i < 500; i++) {
    g.fillStyle = rgba(jitter([112, 74, 42], r, 44), 0.6);
    g.fillRect(r() * W, Y(-15) + r() * (Y(-30) - Y(-15)), 22, 5);
  }
  g.fillStyle = "#7c1d1a"; g.fillRect(0, Y(-26), W, H - Y(-26));
  g.strokeStyle = "#d9b46a"; g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, Y(-28)); g.lineTo(W, Y(-28)); g.stroke();
  for (i = 0; i < 200; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(34,44,96,0.7)" : "rgba(214,170,90,0.5)";
    g.beginPath(); g.arc(r() * W, Y(-30 - r() * 55), 3 + r() * 6, 0, TAU); g.fill();
  }

  function gilt(x, top, bot, w, inner) {
    g.fillStyle = "#8a5f1e"; g.fillRect(x - w / 2 - 9, top - 9, w + 18, bot - top + 18);
    g.fillStyle = "#d8a948"; g.fillRect(x - w / 2 - 6, top - 6, w + 12, bot - top + 12);
    g.fillStyle = inner; g.fillRect(x - w / 2, top, w, bot - top);
  }
  /* the fireplace, ahead of White */
  P.wrap(X(0), P.PX(40), function (x) {
    var w = P.PX(26);
    /* a gilt overmantel mirror, catching the room's warm light */
    gilt(x, Y(29), Y(6.5), w * 0.82, "#6f6a58");
    g.fillStyle = "rgba(255,226,170,0.25)"; g.fillRect(x - w * 0.36, Y(27), w * 0.3, Y(9) - Y(27));
    /* white marble surround and mantel shelf */
    g.fillStyle = "#e3dccd"; g.fillRect(x - w / 2, Y(5), w, Y(-15) - Y(5));
    g.fillStyle = "#f1ebde"; g.fillRect(x - w * 0.62, Y(5.4), w * 1.24, H * 0.014);
    g.fillStyle = "#cfc6b4"; g.fillRect(x - w / 2, Y(2), w * 0.12, Y(-15) - Y(2)); g.fillRect(x + w * 0.38, Y(2), w * 0.12, Y(-15) - Y(2));
    /* the opening and the fire in it */
    g.fillStyle = "#120a06"; g.fillRect(x - w * 0.32, Y(0), w * 0.64, Y(-15) - Y(0));
    glow(g, x, Y(-9), P.PX(14), [255, 140, 50], 0.95);
    g.fillStyle = "#ffb050"; g.beginPath(); g.ellipse(x, Y(-11), w * 0.22, H * 0.02, 0, 0, TAU); g.fill();
    g.fillStyle = "#ffd890"; g.beginPath(); g.ellipse(x, Y(-10), w * 0.12, H * 0.012, 0, 0, TAU); g.fill();
    /* brass fender */
    g.fillStyle = "#c79a4e"; g.fillRect(x - w * 0.42, Y(-14), w * 0.84, 5);
    /* a clock in the middle of the mantel */
    g.fillStyle = "#c79a4e"; g.beginPath(); g.arc(x, Y(8.6), P.PX(1.8), 0, TAU); g.fill();
    g.fillStyle = "#f4ecd6"; g.beginPath(); g.arc(x, Y(8.6), P.PX(1.2), 0, TAU); g.fill();
  });
  /* tall windows in crimson drapes, ahead of Black, a portrait between */
  [150, 210, 96, -96].forEach(function (az) {
    P.wrap(X(az), P.PX(30), function (x) {
      var w = P.PX(13);
      g.fillStyle = vgrad(g, Y(28), Y(-2), [[0, "#334f86"], [0.55, "#7c86ab"], [0.8, "#c79a7c"], [1, "#3a3550"]]);
      g.fillRect(x - w / 2, Y(28), w, Y(-2) - Y(28));
      g.fillStyle = "#e6c890";
      g.fillRect(x - 2, Y(28), 4, Y(-2) - Y(28)); g.fillRect(x - w / 2, Y(13), w, 4);
      for (var s = -1; s <= 1; s += 2) {
        g.fillStyle = vgrad(g, Y(31), Y(-14), [[0, "#8a1824"], [1, "#4a0a12"]]);
        g.beginPath();
        g.moveTo(x + s * w * 0.45, Y(31)); g.lineTo(x + s * w * 1.0, Y(31));
        g.quadraticCurveTo(x + s * w * 1.1, Y(10), x + s * w * 0.95, Y(-14));
        g.lineTo(x + s * w * 0.58, Y(-14));
        g.quadraticCurveTo(x + s * w * 0.66, Y(12), x + s * w * 0.45, Y(31));
        g.fill();
      }
      /* a gold tie-back and a pelmet */
      g.fillStyle = "#d8a948"; g.fillRect(x - w * 1.05, Y(31) - 4, w * 2.1, 10);
    });
  });
  P.wrap(X(180), P.PX(20), function (x) {
    gilt(x, Y(26), Y(4), P.PX(11), "#3e3428");
    g.fillStyle = "#b98d6a"; g.beginPath(); g.ellipse(x, Y(19), P.PX(2.4), H * 0.024, 0, 0, TAU); g.fill();
    g.fillStyle = "#26201a"; g.fillRect(x - P.PX(4), Y(14), P.PX(8), Y(4) - Y(14));
  });
  /* gilt-framed paintings on the side walls */
  [[-40, 16, 12], [40, 16, 12], [-130, 14, 11], [130, 14, 11]].forEach(function (p) {
    P.wrap(X(p[0]), P.PX(20), function (x) {
      var w = P.PX(p[1]);
      gilt(x, Y(25), Y(25 - p[2]), w, rgba(jitter([74, 72, 52], r, 30), 1));
      g.fillStyle = rgba(jitter([140, 150, 110], r, 50), 0.6);
      g.fillRect(x - w / 2, Y(17), w, Y(25 - p[2]) - Y(17));
      g.fillStyle = rgba(jitter([190, 160, 110], r, 50), 0.5);
      g.beginPath(); g.ellipse(x - w * 0.15, Y(18), w * 0.2, H * 0.02, 0, 0, TAU); g.fill();
    });
  });
  /* wing chairs either side of the fire, a gilt console under the paintings */
  [-18, 18].forEach(function (az) {
    P.wrap(X(az), P.PX(14), function (x) {
      g.fillStyle = "#6e1a1e"; g.fillRect(x - P.PX(4), Y(2), P.PX(8), Y(-14) - Y(2));
      g.fillStyle = "#8a2a2a"; g.fillRect(x - P.PX(5), Y(-6), P.PX(10), Y(-14) - Y(-6));
      g.fillStyle = "#3a1810"; g.fillRect(x - P.PX(5), Y(-14), 4, 10); g.fillRect(x + P.PX(5) - 4, Y(-14), 4, 10);
    });
  });
  [-40, 40].forEach(function (az) {
    P.wrap(X(az), P.PX(14), function (x) {
      g.fillStyle = "#c79a4e"; g.fillRect(x - P.PX(8), Y(-3), P.PX(16), 6);
      g.fillRect(x - P.PX(7), Y(-3), 3, Y(-14) - Y(-3)); g.fillRect(x + P.PX(7) - 3, Y(-3), 3, Y(-14) - Y(-3));
      g.fillStyle = "#e7e2d4"; g.beginPath(); g.ellipse(x, Y(0), P.PX(2), H * 0.02, 0, 0, TAU); g.fill();
    });
  });

  blur(cv, W / 512 * 2.2, true);

  /* light: the chandelier over the table, candelabra on the mantel,
     a pair of candles in every sconce, the fire in the grate */
  [0, 180].forEach(function (az) {
    P.wrap(X(az), P.PX(40), function (x) {
      glow(g, x, Y(24), P.PX(28), [255, 210, 140], 0.5);
      for (k = 0; k < 22; k++) {
        var a = k / 22 * TAU, rr = P.PX(9 + (k % 2) * 3);
        bokeh(g, x + Math.cos(a) * rr, Y(24 + Math.sin(a) * 2.5 - (k % 2) * 2), 3.8, [255, 238, 196], 0.95);
      }
      for (k = 0; k < 12; k++) bokeh(g, x + (r() - 0.5) * P.PX(16), Y(27 + r() * 6), 2.4, [255, 250, 230], 0.8);
    });
  });
  [-7, 7].forEach(function (az) {
    P.wrap(X(az), 40, function (x) {
      for (var c = -1; c <= 1; c++) bokeh(g, x + c * P.PX(1.4), Y(11 - Math.abs(c) * 0.8), 3.4, [255, 220, 150], 1.0);
      glow(g, x, Y(11), P.PX(5), [255, 190, 110], 0.45);
    });
  });
  for (i = 0; i < 12; i++) {
    var az2 = -165 + i * 30;
    if (Math.abs(az2) < 30) continue;
    P.wrap(X(az2), 40, function (x) {
      glow(g, x, Y(10), 44, [255, 190, 110], 0.45);
      bokeh(g, x - 7, Y(10.5), 4, [255, 230, 170], 0.95);
      bokeh(g, x + 7, Y(10.5), 4, [255, 230, 170], 0.95);
    });
  }
  P.wrap(X(0), 60, function (x) {
    for (var e = 0; e < 10; e++) bokeh(g, x + (r() - 0.5) * P.PX(9), Y(-11 + r() * 4), 2 + r() * 3.5, [255, 196, 104], 0.95);
  });
}

/* ======================= the library ======================= */
function paintLibrary(cv, sc, r) {
  var P = frame(cv), g = P.g, W = P.W, H = P.H, Y = P.Y, X = P.X;
  var i;
  g.fillStyle = vgrad(g, 0, Y(36), [[0, "#120c08"], [1, "#2a1a10"]]);
  g.fillRect(0, 0, W, Y(36));
  /* shelves, floor to ceiling, all the way round: dark oak uprights,
     a board every few degrees, and the spines packed between them */
  g.fillStyle = "#24160d"; g.fillRect(0, Y(36), W, Y(-20) - Y(36));
  var spines = [[110, 28, 26], [32, 46, 86], [34, 72, 46], [150, 104, 44], [182, 150, 98],
                [86, 30, 50], [58, 40, 28], [196, 180, 150], [60, 70, 80]];
  var shelfEl = [34, 26, 18, 10, 2, -6, -14];
  for (var s = 0; s < shelfEl.length - 1; s++) {
    var topY = Y(shelfEl[s]) + 6, botY = Y(shelfEl[s + 1]);
    for (var x = 0; x < W; ) {
      var bw = 4 + r() * 7, bh = (botY - topY) * (0.62 + r() * 0.36);
      var col = jitter(spines[(r() * spines.length) | 0], r, 26);
      if (r() < 0.04) { x += bw * 3; continue; }      /* a gap where a book is out */
      g.fillStyle = rgba(col, 1);
      g.fillRect(x, botY - bh, bw - 1, bh);
      if (r() < 0.5) {                                  /* gilt bands on the spine */
        g.fillStyle = "rgba(226,186,104,0.7)";
        g.fillRect(x, botY - bh * 0.85, bw - 1, 1.5);
        g.fillRect(x, botY - bh * 0.25, bw - 1, 1.5);
      }
      x += bw;
    }
    g.fillStyle = "#3b2414"; g.fillRect(0, botY, W, 7);
  }
  for (i = 0; i < 22; i++) {
    g.fillStyle = "#2c1b0f";
    g.fillRect(i / 22 * W - 5, Y(36), 10, Y(-20) - Y(36));
  }
  /* a tall window at Black's left, moonlit, and a rolling ladder */
  P.wrap(X(0), P.PX(20), function (x) {
    var w = P.PX(14);
    g.fillStyle = vgrad(g, Y(30), Y(-8), [[0, "#1c2c4c"], [1, "#2e3e5e"]]);
    g.fillRect(x - w / 2, Y(30), w, Y(-8) - Y(30));
    g.fillStyle = "#24160d";
    g.fillRect(x - 2, Y(30), 4, Y(-8) - Y(30)); g.fillRect(x - w / 2, Y(12), w, 4);
  });
  P.wrap(X(-40), 40, function (x) {
    g.strokeStyle = "#5a3a20"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x - 14, Y(34)); g.lineTo(x - 30, Y(-20)); g.stroke();
    g.beginPath(); g.moveTo(x + 14, Y(34)); g.lineTo(x - 2, Y(-20)); g.stroke();
    for (var rung = 0; rung < 12; rung++) {
      var t = rung / 12;
      g.beginPath(); g.moveTo(x - 14 - t * 16, Y(34 - t * 54)); g.lineTo(x + 14 - t * 16, Y(34 - t * 54)); g.stroke();
    }
  });
  /* a globe and a leather armchair */
  P.wrap(X(24), 40, function (x) {
    g.fillStyle = "#3a2a1a"; g.fillRect(x - 3, Y(-6), 6, Y(-18) - Y(-6));
    g.fillStyle = "#c2a464"; g.beginPath(); g.arc(x, Y(-2), P.PX(3.2), 0, TAU); g.fill();
    g.fillStyle = "#4f7a6a"; g.beginPath(); g.arc(x - 3, Y(-1.5), P.PX(1.8), 0, TAU); g.fill();
  });
  P.wrap(X(200), 60, function (x) {
    g.fillStyle = "#5a2e18"; g.fillRect(x - P.PX(7), Y(2), P.PX(14), Y(-15) - Y(2));
    g.fillStyle = "#7a4224"; g.fillRect(x - P.PX(8), Y(-6), P.PX(16), Y(-15) - Y(-6));
  });
  /* floor and a worn rug */
  g.fillStyle = vgrad(g, Y(-20), H, [[0, "#3a2414"], [1, "#1a0f08"]]);
  g.fillRect(0, Y(-20), W, H - Y(-20));
  g.fillStyle = "#4a1c18"; g.fillRect(0, Y(-32), W, H - Y(-32));
  for (i = 0; i < 120; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(30,50,70,0.55)" : "rgba(190,150,80,0.35)";
    g.beginPath(); g.arc(r() * W, Y(-34 - r() * 50), 3 + r() * 6, 0, TAU); g.fill();
  }

  blur(cv, W / 512 * 2.6, true);

  /* the lamps: a green-shaded banker's lamp on a reading table, brass
     picture lights over the shelves */
  var key = lightAt(sc.key.dir);
  P.wrap(X(key.az), 80, function (x) {
    glow(g, x, Y(4), P.PX(18), [255, 200, 120], 0.6);
    g.fillStyle = "#1e5a3a";
    g.beginPath(); g.ellipse(x, Y(5), P.PX(3.4), H * 0.008, 0, 0, TAU); g.fill();
    bokeh(g, x, Y(3.6), 6, [255, 236, 190], 1.0);
  });
  /* brass picture lights over the shelves, washing the spines below */
  for (i = 0; i < 14; i++) {
    var lx = X(-170 + i * 26);
    glow(g, lx, Y(12), 52, [255, 196, 120], 0.42);
    g.fillStyle = "#b8903c"; g.fillRect(lx - 12, Y(16.5), 24, 4);
    bokeh(g, lx, Y(16), 3.5, [255, 230, 180], 0.9);
  }
  /* moonlight on the window's glazing, straight ahead of White */
  for (i = 0; i < 24; i++) bokeh(g, X(0) + (r() - 0.5) * P.PX(12), Y(-4 + r() * 26), 1.5 + r() * 2.5, [214, 224, 255], 0.5);
  /* a fire glowing in the hearth by Black's chair */
  P.wrap(X(222), 80, function (x) {
    glow(g, x, Y(-8), P.PX(10), [255, 150, 60], 0.85);
    for (var e = 0; e < 8; e++) bokeh(g, x + (r() - 0.5) * P.PX(7), Y(-9 + r() * 3), 2 + r() * 3, [255, 196, 104], 0.9);
  });
}

/* ---------- the tables ----------
   One canvas for the colour and one for the height, side by side like
   the board's own, covering the table's top from −half to +half in x
   (left to right) and z (far to near, from White's chair). The renderer
   cuts a normal map from the height, so plank gaps and carved borders
   catch the light. */
function paintTable(sc, S, r) {
  var col = canvas(S, S), hgt = canvas(S, S);
  if (!col || !hgt) return null;
  var g = col.getContext("2d"), h = hgt.getContext("2d");
  var i, k;
  h.fillStyle = "#808080"; h.fillRect(0, 0, S, S);
  function grain(gx, x, y, w, ht, along, base, k2, n) {
    for (var q = 0; q < n; q++) {
      gx.strokeStyle = q % 2 ? "rgba(0,0,0," + k2 + ")" : "rgba(255,255,255," + k2 * 0.7 + ")";
      gx.lineWidth = 1 + r() * 2.5;
      gx.beginPath();
      if (along === "x") {
        var yy = y + r() * ht;
        gx.moveTo(x, yy);
        gx.bezierCurveTo(x + w * 0.3, yy + (r() - 0.5) * 8, x + w * 0.7, yy + (r() - 0.5) * 8, x + w, yy + (r() - 0.5) * 4);
      } else {
        var xx = x + r() * w;
        gx.moveTo(xx, y);
        gx.bezierCurveTo(xx + (r() - 0.5) * 8, y + ht * 0.3, xx + (r() - 0.5) * 8, y + ht * 0.7, xx + (r() - 0.5) * 4, y + ht);
      }
      gx.stroke();
    }
  }
  if (sc.id === "park") {
    /* weathered planks running left to right, silvered by the sun, with
       a dark gap between each one */
    var planks = 7, pw = S / planks;
    for (i = 0; i < planks; i++) {
      var y = i * pw, base = jitter([168, 146, 116], r, 26);
      g.fillStyle = rgba(base, 1); g.fillRect(0, y, S, pw);
      grain(g, 0, y, S, pw, "x", base, 0.10, 46);
      grain(h, 0, y, S, pw, "x", base, 0.08, 30);
      /* knots */
      for (k = 0; k < 2; k++) {
        var kx = r() * S, ky = y + pw * (0.3 + r() * 0.4);
        g.fillStyle = "rgba(80,58,36,0.55)"; g.beginPath(); g.ellipse(kx, ky, 10 + r() * 8, 5 + r() * 3, 0, 0, TAU); g.fill();
        h.fillStyle = "rgba(0,0,0,0.25)"; h.beginPath(); h.ellipse(kx, ky, 8, 4, 0, 0, TAU); h.fill();
      }
      g.fillStyle = "#2a2118"; g.fillRect(0, y, S, Math.max(3, S * 0.006));
      h.fillStyle = "#202020"; h.fillRect(0, y, S, Math.max(4, S * 0.007));
      /* bolt heads near each end */
      [0.05, 0.95].forEach(function (fx) {
        g.fillStyle = "#5b5249"; g.beginPath(); g.arc(fx * S, y + pw / 2, S * 0.006, 0, TAU); g.fill();
        h.fillStyle = "#a8a8a8"; h.beginPath(); h.arc(fx * S, y + pw / 2, S * 0.006, 0, TAU); h.fill();
      });
    }
  } else if (sc.id === "cafe") {
    /* white Carrara: a warm white with soft grey veins drifting across */
    g.fillStyle = "#ddd8cf"; g.fillRect(0, 0, S, S);
    for (i = 0; i < 26; i++) {
      var x0 = r() * S, y0 = r() * S, a = r() * Math.PI, len = S * (0.3 + r() * 0.7);
      /* a vein in real marble is a cloud, not a crack: a wide faint
         stroke with a narrower one down its middle */
      var pts = [[x0, y0]], cx = x0, cy = y0, alpha = 0.05 + r() * 0.10;
      for (k = 0; k < 12; k++) {
        a += (r() - 0.5) * 0.7;
        cx += Math.cos(a) * len / 12; cy += Math.sin(a) * len / 12;
        pts.push([cx, cy]);
      }
      g.lineJoin = "round"; g.lineCap = "round";
      [[10 + r() * 10, alpha * 0.5], [2 + r() * 3, alpha]].forEach(function (st) {
        g.strokeStyle = "rgba(120,118,122," + st[1] + ")";
        g.lineWidth = st[0];
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
        for (var q = 1; q < pts.length; q++) g.lineTo(pts[q][0], pts[q][1]);
        g.stroke();
      });
    }
    for (i = 0; i < 900; i++) {
      g.fillStyle = "rgba(160,156,150,0.08)";
      g.beginPath(); g.arc(r() * S, r() * S, 2 + r() * 10, 0, TAU); g.fill();
    }

    /* a coffee ring, a few crumbs: somebody sat here before us */
    g.strokeStyle = "rgba(120,80,48,0.20)"; g.lineWidth = S * 0.004;
    g.beginPath(); g.arc(S * 0.86, S * 0.38, S * 0.035, 0, TAU); g.stroke();
    h.strokeStyle = "#7a7a7a"; h.lineWidth = S * 0.006;
    h.beginPath(); h.arc(S / 2, S / 2, S * 0.49, 0, TAU); h.stroke();
  } else if (sc.id === "salon") {
    /* mahogany, French-polished, with a satinwood stringing border */
    g.fillStyle = "#5a2414"; g.fillRect(0, 0, S, S);
    grain(g, 0, 0, S, S, "x", null, 0.08, 220);
    grain(h, 0, 0, S, S, "x", null, 0.03, 80);
    var bw = S * 0.055;
    g.strokeStyle = "#d9b77a"; g.lineWidth = S * 0.006;
    g.strokeRect(bw, bw, S - bw * 2, S - bw * 2);
    g.strokeStyle = "#2a0e06"; g.lineWidth = S * 0.003;
    g.strokeRect(bw * 1.4, bw * 1.4, S - bw * 2.8, S - bw * 2.8);
    h.strokeStyle = "#9a9a9a"; h.lineWidth = S * 0.006;
    h.strokeRect(bw, bw, S - bw * 2, S - bw * 2);
    /* a rosette at each corner */
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) {
      var cx2 = S / 2 + c[0] * (S / 2 - bw * 2.4), cy2 = S / 2 + c[1] * (S / 2 - bw * 2.4);
      for (var p = 0; p < 8; p++) {
        g.fillStyle = p % 2 ? "#d9b77a" : "#a8743c";
        g.beginPath(); g.ellipse(cx2, cy2, S * 0.018, S * 0.006, p * Math.PI / 8, 0, TAU); g.fill();
      }
    });
  } else if (sc.id === "library") {
    /* a writing desk: green leather inset with a tooled gold line, in a
       walnut surround */
    g.fillStyle = "#4a2c18"; g.fillRect(0, 0, S, S);
    grain(g, 0, 0, S, S, "x", null, 0.07, 160);
    var inset = S * 0.08;
    g.fillStyle = "#1f4a34"; g.fillRect(inset, inset, S - inset * 2, S - inset * 2);
    for (i = 0; i < 1400; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.04)";
      g.fillRect(inset + r() * (S - inset * 2), inset + r() * (S - inset * 2), 3, 3);
    }
    g.strokeStyle = "#c9a45a"; g.lineWidth = S * 0.004;
    g.strokeRect(inset * 1.25, inset * 1.25, S - inset * 2.5, S - inset * 2.5);
    h.fillStyle = "#787878"; h.fillRect(inset, inset, S - inset * 2, S - inset * 2);
    h.strokeStyle = "#5a5a5a"; h.lineWidth = S * 0.004;
    h.strokeRect(inset * 1.25, inset * 1.25, S - inset * 2.5, S - inset * 2.5);
    for (i = 0; i < 1400; i++) {
      h.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.10)";
      h.fillRect(inset + r() * (S - inset * 2), inset + r() * (S - inset * 2), 3, 3);
    }
  }
  return { color: col, height: hgt };
}

/* ---------- what the key light comes through ----------
   A tile that repeats across the world, seen from the light: soft
   blotches of leaf shadow for the park, the bars of a window for the
   café. White lets the light through; black stops it. */
function paintCookie(sc, S, r) {
  if (!sc.cookie) return null;
  var cv = canvas(S, S, true);
  if (!cv) return null;
  var g = cv.getContext("2d"), i;
  if (sc.cookie.kind === "leaves") {
    g.fillStyle = "#fff"; g.fillRect(0, 0, S, S);
    for (i = 0; i < 110; i++) {
      var x = r() * S, y = r() * S, rr = S * (0.03 + r() * 0.08);
      var ry = rr * (0.5 + r() * 0.5), rot = r() * 3;
      g.fillStyle = "rgba(0,0,0," + (0.5 + r() * 0.4) + ")";
      /* a blotch that crosses an edge comes back in at the other one,
         so the tile repeats without a seam */
      for (var dx = -S; dx <= S; dx += S) for (var dy = -S; dy <= S; dy += S) {
        if (x + dx + rr < 0 || x + dx - rr > S || y + dy + rr < 0 || y + dy - rr > S) continue;
        g.beginPath(); g.ellipse(x + dx, y + dy, rr, ry, rot, 0, TAU); g.fill();
      }
    }
    blur(cv, S / 256 * 4, true);
  } else {
    /* a window of four by three panes, the glazing bars thick enough to
       read as shadow and soft at the edges */
    g.fillStyle = "#000"; g.fillRect(0, 0, S, S);
    g.fillStyle = "#fff";
    var cols = 4, rows = 3, bar = S * 0.035;
    for (var c = 0; c < cols; c++) for (var rw = 0; rw < rows; rw++) {
      g.fillRect(c * S / cols + bar / 2, rw * S / rows + bar / 2, S / cols - bar, S / rows - bar);
    }
    blur(cv, S / 256 * 2, true);
  }
  return cv;
}

/* ---------- building a place ----------
   Painted once per scene and kept: the panorama, a much smaller and
   much blurrier copy of it for what rough surfaces reflect, the table,
   and the cookie. Also two averages the renderer lights with — the
   colour of everything above the horizon and of everything below — so
   the shade under a piece is the colour of the place it is in. */
var built = {};
function build(id) {
  var sc = get(id);
  if (built[sc.id]) return built[sc.id];
  if (!sc.table) return (built[sc.id] = { def: sc });
  var painters = { park: paintPark, cafe: paintCafe, salon: paintSalon, library: paintLibrary };
  var W = 1024, H = 512;
  var pano = canvas(W, H, true);
  if (!pano) return null;
  painters[sc.id](pano, sc, stream(sc.seed));
  var env = canvas(128, 64, true);
  env.getContext("2d").drawImage(pano, 0, 0, 128, 64);
  blur(env, 4, true);
  var avg = averages(env);
  var table = paintTable(sc, 1024, stream(sc.seed + 7));
  var tableAvg = null;
  if (table) {
    var tiny = canvas(16, 16);
    tiny.getContext("2d").drawImage(table.color, 0, 0, 16, 16);
    tableAvg = averages(tiny).sky.map(function (v, i) { return (v + averages(tiny).ground[i]) / 2; });
  }
  var out = {
    def: sc, pano: pano, env: env, table: table, tableAvg: tableAvg,
    cookie: paintCookie(sc, 256, stream(sc.seed + 13)),
    sky: avg.sky, ground: avg.ground, horizon: avg.horizon
  };
  built[sc.id] = out;
  return out;
}
/* averages in linear light, 0..1 */
function averages(cv) {
  var g = cv.getContext("2d"), W = cv.width, H = cv.height;
  var d = g.getImageData(0, 0, W, H).data;
  function band(y0, y1) {
    var s = [0, 0, 0], n = 0;
    for (var y = y0; y < y1; y++) {
      var wgt = Math.sin((y + 0.5) / H * Math.PI);       /* equal area: the poles are small */
      for (var x = 0; x < W; x++) {
        var o = (y * W + x) * 4;
        for (var c = 0; c < 3; c++) s[c] += Math.pow(d[o + c] / 255, 2.2) * wgt;
        n += wgt;
      }
    }
    return [s[0] / n, s[1] / n, s[2] / n];
  }
  return { sky: band(0, H / 2), ground: band(H / 2, H), horizon: band(Math.round(H * 0.42), Math.round(H * 0.58)) };
}

var Scenes = {
  LIST: LIST, DEFAULT: DEFAULT, get: get, has: has, build: build,
  /* exposed for the checks */
  _stream: stream, _blur: blur
};
if (typeof module !== "undefined" && module.exports) module.exports = Scenes;
else root.Scenes = Scenes;
})(typeof self !== "undefined" ? self : this);
