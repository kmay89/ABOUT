/* art.js — the hill, painted.

   A toy diorama rather than a grid of tiles: the ground is painted in
   chunks from a soft color field whose edges are warped by noise, so paths
   wander and grass laps over stone the way it does; on top go strokes —
   blades, petals, pebbles, leaves — scattered by a seeded hash so it is the
   same hill every visit. Everything that stands up (fences, hedges, beds,
   houses, trees, people) is drawn with a light from the upper left and a
   soft shadow to the lower right, so the whole place reads as a small
   real thing on a table, lit by a low sun.

   No image files: every canvas here is made at load, at so many pixels per
   world unit, and carries .res / .w / .h so the engine can place it in
   world units at any screen size.

   Wren is drawn with no gendered cue at all — short untidy hair, a faded
   teal tee, jeans, sandals — and most of the time from behind or above. */
(function () {
  "use strict";
  var BS = window.BS = window.BS || {};
  var TL = BS.TL, H = BS.hash, T = 16;
  var ART = 3;            // ground and props: pixels per world unit, baked
  var SPR = 8;            // people and small things: fine enough for a retina screen up close
  var PRES = 3;           // buildings, trees and props: few of them, so paint them finer than the ground
  BS.ART = ART;

  function cv(w, h) { var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  BS.cv = cv;
  /* a canvas measured in world units, drawn at `res` pixels per unit */
  function wc(w, h, res) { var c = cv(w * res, h * res); c.res = res; c.w = w; c.h = h; var x = c.getContext("2d"); x.scale(res, res); c.x = x; return c; }
  BS.wc = wc;
  function hex(c) {
    if (c[0] === "r") { var m = c.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]]; }
    var n = parseInt(c.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function mix(a, b, t) { var A = hex(a), B = hex(b); return "rgb(" + Math.round(A[0] + (B[0] - A[0]) * t) + "," + Math.round(A[1] + (B[1] - A[1]) * t) + "," + Math.round(A[2] + (B[2] - A[2]) * t) + ")"; }
  function shade(c, k) { return k > 0 ? mix(c, "#fff8e8", k) : mix(c, "#140c08", -k); }
  function rgba(c, a) { var A = hex(c); return "rgba(" + A[0] + "," + A[1] + "," + A[2] + "," + a + ")"; }
  BS.mix = mix; BS.hex = hex; BS.shade = shade; BS.rgba = rgba;
  function vn(x, y, s, seed) {
    var gx = Math.floor(x / s), gy = Math.floor(y / s), fx = x / s - gx, fy = y / s - gy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = H(gx, gy, seed), b = H(gx + 1, gy, seed), c = H(gx, gy + 1, seed), d = H(gx + 1, gy + 1, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, s, seed) { return vn(x, y, s, seed) * 0.6 + vn(x, y, s / 2.3, seed + 7) * 0.3 + vn(x, y, s / 5, seed + 13) * 0.1; }
  BS.vn = vn; BS.fbm = fbm;
  function R(seed) { return BS.rng(seed); }

  /* shape helpers, all in world units */
  function ell(x, cx, cy, rx, ry, fill, rot) { x.beginPath(); x.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, 6.2832); if (fill) { x.fillStyle = fill; x.fill(); } }
  function rr(x, X, Y, w, h, r, fill) { r = Math.max(0, Math.min(r, w / 2, h / 2)); x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } }
  function lg(x, x0, y0, x1, y1, stops) { var g = x.createLinearGradient(x0, y0, x1, y1); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function rg(x, cx, cy, r0, r, stops) { var g = x.createRadialGradient(cx, cy, r0, cx, cy, r); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  BS.ell = ell; BS.rr = rr; BS.lg = lg; BS.rg = rg;
  /* a soft shadow on the ground, cast down-right by the low sun */
  function shadow(x, cx, cy, rx, ry, a) {
    x.save(); x.translate(cx, cy); x.scale(rx, ry);
    var g = x.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, "rgba(20,14,8," + (a || 0.32) + ")"); g.addColorStop(1, "rgba(20,14,8,0)");
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 6.2832); x.fill(); x.restore();
  }
  BS.shadowAt = shadow;
  /* a round lump lit from the upper left: bushes, hedges, canopies, stones */
  function lump(x, cx, cy, r, base, hi) {
    ell(x, cx + r * 0.08, cy + r * 0.1, r, r * 0.92, shade(base, -0.35));
    var g = rg(x, cx - r * 0.35, cy - r * 0.4, r * 0.1, r * 1.1, [[0, hi || shade(base, 0.32)], [0.55, base], [1, shade(base, -0.28)]]);
    ell(x, cx, cy, r, r * 0.92, g);
  }
  BS.lump = lump;
  function blade(x, bx, by, h, lean, w, c0, c1) {
    x.strokeStyle = lg(x, bx, by, bx + lean, by - h, [[0, c0], [1, c1]]);
    x.lineWidth = w; x.lineCap = "round";
    x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + lean * 0.2, by - h * 0.6, bx + lean, by - h); x.stroke();
  }
  function flower(x, cx, cy, petal, center, r) {
    for (var k = 0; k < 5; k++) { var a = k / 5 * 6.2832; ell(x, cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7 * 0.8, r * 0.55, r * 0.45, petal, a); }
    ell(x, cx, cy, r * 0.42, r * 0.38, center);
  }

  /* ================= the ground, in chunks ================= */
  var CH = 8;                // tiles per chunk side
  BS.CH = CH;
  var MAT = {
    grass: { a: "#7fa94a", b: "#9cc25e", c: "#5f8a36" },
    garden: { a: "#86b04f", b: "#a6ca66", c: "#668f3a" },
    dry: { a: "#b8ac5c", b: "#d2c676", c: "#9a8f45" },
    long: { a: "#c2b566", b: "#dccf84", c: "#a39648" },
    road: { a: "#c4aa7c", b: "#d8c095", c: "#a68c62" },
    soil: { a: "#6b5032", b: "#7d6040", c: "#54402a" },
    compost: { a: "#7d9a48", b: "#94b45a", c: "#5f7e36" },
    litter: { a: "#6d5b33", b: "#86703f", c: "#544526" },
    forest: { a: "#33402a", b: "#3f4e31", c: "#28331f" },
    hedge: { a: "#4e7034", b: "#5f8240", c: "#3d5a2a" },
    water: { a: "#2c5a62", b: "#3c727a", c: "#1f4248" },
    spring: { a: "#3d7470", b: "#5a948a", c: "#2c5652" },
    mud: { a: "#6a5838", b: "#7c6a44", c: "#54452c" },
    sand: { a: "#d6c496", b: "#e6d6ac", c: "#bfae80" },
    pile: { a: "#e4d4a6", b: "#f2e6c0", c: "#cdbc8c" }
  };
  var MATRGB = {};
  Object.keys(MAT).forEach(function (k) { MATRGB[k] = [hex(MAT[k].a), hex(MAT[k].b), hex(MAT[k].c)]; });
  function matOf(m, tx, ty) {
    var t = m.get(tx, ty);
    if (t < 0) return "forest";
    switch (t) {
      case TL.GARDEN: case TL.HOUSE: case TL.DOOR: case TL.SHED: case TL.SHEDDOOR: case TL.LAVENDER: case TL.TAP: return "garden";
      case TL.COMPOST: return "compost";
      case TL.BED: return "soil";
      case TL.FIELD: case TL.TREE: case TL.BECKHOUSE: case TL.BECKDOOR: return "dry";
      case TL.LONG: return "long";
      case TL.ROAD: case TL.LANE: case TL.GATE: return "road";
      case TL.LITTER: case TL.FALLEN: case TL.BEECH: return "litter";
      case TL.WOOD: return "forest";
      case TL.DEER: return m.hidden && m.hidden.deer ? "forest" : "litter";
      case TL.ROOT: return m.hidden && m.hidden.root ? "forest" : "litter";
      case TL.HEDGE: return "hedge";
      case TL.WATER: return "water";
      case TL.SPRING: return "spring";
      case TL.MUD: case TL.ROCK: case TL.FLAT: return "mud";
      case TL.SAND: case TL.PIPE: case TL.TRAILER: case TL.CHAIN: case TL.GAP: return "sand";
      case TL.PILE: return "pile";
      case TL.FENCE: return (m.get(tx, ty - 1) === TL.GARDEN || m.get(tx, ty + 1) === TL.GARDEN || m.get(tx + 1, ty) === TL.GARDEN || m.get(tx - 1, ty) === TL.GARDEN) ? "garden" : "dry";
    }
    return "dry";
  }
  /* the material at a world point, with the edge wandered by noise */
  /* water keeps its own soft shape: tile occupancy blurred and wobbled, so a
     pond is a pond, never a rectangle; a ring of mud where it meets land */
  function wetGrid(m) {
    if (m._wet) return m._wet;
    var W = m.w, Hh = m.h, occ = new Float32Array(W * Hh), typ = new Int8Array(W * Hh), bl = new Float32Array(W * Hh), near = new Uint8Array(W * Hh), x, y, dx, dy;
    for (y = 0; y < Hh; y++) for (x = 0; x < W; x++) { var t = m.get(x, y); if (t === TL.WATER || t === TL.SPRING) { occ[y * W + x] = 1; typ[y * W + x] = t === TL.SPRING ? 2 : 1; } }
    for (y = 0; y < Hh; y++) for (x = 0; x < W; x++) {
      var s2 = 0, n = 0, ty2 = 0;
      for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) { var xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= Hh) { n++; continue; } var o = occ[yy * W + xx]; s2 += o; n++; if (typ[yy * W + xx]) ty2 = typ[yy * W + xx]; }
      bl[y * W + x] = s2 / n; if (!typ[y * W + x]) typ[y * W + x] = -ty2;
      for (dy = -2; dy <= 2; dy++) for (dx = -2; dx <= 2; dx++) if (occ[Math.min(Hh - 1, Math.max(0, y + dy)) * W + Math.min(W - 1, Math.max(0, x + dx))]) near[y * W + x] = 1;
    }
    m._wet = { bl: bl, typ: typ, near: near, occ: occ, W: W, H: Hh };
    return m._wet;
  }
  function wetAt(m, wx, wy, raw) {
    var g = wetGrid(m), tx = Math.floor(wx / T), ty = Math.floor(wy / T);
    if (tx < 0 || ty < 0 || tx >= g.W || ty >= g.H || !g.near[ty * g.W + tx]) return raw ? 0 : null;
    var fx = wx / T - 0.5, fy = wy / T - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    function b(x, y) { x = Math.min(g.W - 1, Math.max(0, x)); y = Math.min(g.H - 1, Math.max(0, y)); return g.bl[y * g.W + x]; }
    ax = ax * ax * (3 - 2 * ax); ay = ay * ay * (3 - 2 * ay);
    var v = b(x0, y0) * (1 - ax) * (1 - ay) + b(x0 + 1, y0) * ax * (1 - ay) + b(x0, y0 + 1) * (1 - ax) * ay + b(x0 + 1, y0 + 1) * ax * ay;
    v += (vn(wx, wy, 19, 51) - 0.5) * 0.22 + (vn(wx, wy, 5, 53) - 0.5) * 0.06;
    var isSpring = Math.abs(g.typ[ty * g.W + tx]) === 2;
    /* a spring is one tile wide, too thin for the blurred field: it gets its
       own, straight from the tiles, so it runs as a narrow thread of water */
    if (isSpring) {
      var sp = function (x, y) { x = Math.min(g.W - 1, Math.max(0, x)); y = Math.min(g.H - 1, Math.max(0, y)); var q = y * g.W + x; return g.occ[q] && g.typ[q] === 2 ? 1 : 0; };
      var o2 = sp(x0, y0) * (1 - ax) * (1 - ay) + sp(x0 + 1, y0) * ax * (1 - ay) + sp(x0, y0 + 1) * (1 - ax) * ay + sp(x0 + 1, y0 + 1) * ax * ay;
      v = o2 * 0.92 - 0.1 + (vn(wx, wy, 7, 57) - 0.5) * 0.2 + (vn(wx * 0.4, wy, 11, 59) - 0.5) * 0.34;
    }
    if (raw) return v;
    var ty3 = isSpring ? "spring" : "water";
    return v > 0.5 ? ty3 : v > 0.36 ? "mud" : "";
  }
  BS.wetAt = wetAt;
  function matAt(m, wx, wy) {
    if (m.outdoor) { var w = wetAt(m, wx, wy); if (w) return w; }
    var dx = (vn(wx, wy, 23, 31) - 0.5) * 15 + (vn(wx, wy, 6, 41) - 0.5) * 4, dy = (vn(wx, wy, 23, 37) - 0.5) * 15 + (vn(wx, wy, 6, 43) - 0.5) * 4;
    var mt = matOf(m, Math.floor((wx + dx) / T), Math.floor((wy + dy) / T));
    /* a round apron of fallen beech leaves under the great beech, not a square */
    if (m.beech && (mt === "litter" || mt === "forest")) { var bd = Math.hypot(wx + dx * 0.4 - (m.beech.x + 1) * T, (wy + dy * 0.4 - (m.beech.y + 1.4) * T) * 1.25); mt = bd < 30 ? "litter" : mt === "litter" && m.get(Math.floor(wx / T), Math.floor(wy / T)) === TL.BEECH ? "forest" : mt; }
    if (m.outdoor && (mt === "water" || mt === "spring") && wetGrid(m)) { var tx = Math.floor(wx / T), ty = Math.floor(wy / T), g = m._wet; if (tx >= 0 && ty >= 0 && tx < g.W && ty < g.H && g.near[ty * g.W + tx]) return "mud"; }
    return mt;
  }
  BS.matAt = matAt;

  /* ---------------- the pit ----------------
     "Mountains of it, sand and gravel sorted into separate peaks, smooth and
     pale and perfect, with the morning light coming sideways down their
     flanks so you could see every grain." A cone at the angle of repose,
     its peak lifted north for the three-quarter view; lit from the upper
     left like everything else; slip streaks running straight down the fall
     line; and on the gravel the big stones have rolled to the bottom, the
     way they really do. */
  var PILEKIND = [
    { lit: [252, 243, 214], mid: [228, 206, 154], dk: [168, 142, 104], deep: [122, 112, 112], grain: 0.05 },      // sand
    { lit: [232, 229, 220], mid: [182, 175, 162], dk: [124, 120, 114], deep: [88, 90, 100], grain: 0.1, stones: 1 }, // gravel
    { lit: [246, 226, 184], mid: [214, 178, 122], dk: [160, 120, 82], deep: [112, 94, 92], grain: 0.07 },        // coarse, warmer
    { lit: [252, 243, 214], mid: [226, 204, 150], dk: [166, 140, 102], deep: [120, 110, 110], grain: 0.05 }         // the working pile
  ];
  var pileCache = {};
  /* noise around a circle with no seam where the angle wraps */
  function circ(th, k, y, seed) { var w = (Math.PI - th) / 6.2832; return vn(th * k + 300, y, 1, seed) * (1 - w) + vn((th + 6.2832) * k + 300, y, 1, seed) * w; }
  function pileArt(p, i) {
    var key = p.join(",");
    if (pileCache[key]) return pileCache[key];
    var K = PILEKIND[i % PILEKIND.length], small = p[2] < 3;
    var rx = p[2] * T * 0.64, ry = p[3] * T * 0.6, pad = 14, W = rx * 2 + pad * 2, Hh = ry * 2 + pad * 2;
    var c = wc(W, Hh, ART), x = c.x, cx0 = pad + rx, cy0 = pad + ry, pk = -ry * (small ? 0.3 : 0.4);
    c.X = (p[0] + p[2] / 2) * T - cx0; c.Y = (p[1] + p[3] / 2) * T - cy0;
    /* its shadow on the floor, thrown down and to the right */
    shadow(x, cx0 + rx * 0.22, cy0 + ry * 0.2, rx * 1.12, ry * 1.02, 0.34);
    shadow(x, cx0, cy0 + ry * 0.05, rx * 1.04, ry * 0.98, 0.22);
    var Rz = ART, PW = Math.round(W * Rz), PH = Math.round(Hh * Rz), img = x.createImageData(PW, PH), d = img.data;
    var Lx = -0.56, Ly = -0.46, Lz = 0.69, sa = Math.sin(0.6), ca = Math.cos(0.6), seed = 50 + i * 7;
    var tmp = cv(PW, PH), tx = tmp.getContext("2d");
    for (var j = 0; j < PH; j++) for (var q = 0; q < PW; q++) {
      var dx = q / Rz - cx0, dy = j / Rz - cy0, dyp = dy - pk;
      var a = (dx / rx) * (dx / rx) + (dyp / ry) * (dyp / ry), b = 2 * pk * dyp / (ry * ry), cc = (pk / ry) * (pk / ry) - 1;
      var s2 = a > 1e-9 ? (-b + Math.sqrt(Math.max(0, b * b - 4 * a * cc))) / (2 * a) : 1e9, t = s2 > 0 ? 1 / s2 : 0;
      var th = Math.atan2(dyp, dx);
      t /= 1 + 0.07 * (circ(th, 1.4, i * 3, seed) - 0.5) * 2 + 0.03 * Math.sin(th * 5 + i);   // a footprint that is not quite an ellipse
      var al = Math.max(0, Math.min(1, (1.03 - t) / 0.05));
      if (al <= 0) continue;
      /* the fall line here, and how this patch of flank faces the sun */
      var fx = dx / rx, fy = dyp / ry, fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
      var top = Math.min(1, t / 0.12); top = top * top * (3 - 2 * top);
      var nx = fx * sa * top, ny = fy * sa * top, nz = ca * top + (1 - top), nn = Math.hypot(nx, ny, nz);
      var lam = (nx * Lx + ny * Ly + nz * Lz) / nn;                        // 0.3 .. 1
      var u = 0.2 + 0.8 * Math.max(0, Math.min(1, (lam - 0.16) / 0.8));     // the sky fills the shady side; it is never black
      /* slip streaks: fine in the around direction, long down the fall line */
      var st = circ(th, 11, t * 2.2, seed + 3) - 0.5, st2 = circ(th, 3.5, t * 0.9, seed + 5) - 0.5;
      u += st * 0.09 * (0.3 + t) + st2 * 0.06;
      /* a fresh slump on the shady side: a scar of darker, damper sand */
      var scar = Math.max(0, 1 - Math.abs(th - 0.9) / 0.16) * Math.max(0, Math.min(1, (t - 0.35) / 0.2)) * (small ? 0 : 1);
      u -= scar * 0.12;
      var g0 = (BS.hash(q, j, seed) - 0.5) * K.grain * 2;
      u = Math.max(0, Math.min(1.08, u));
      var C0, C1, k2;
      if (u < 0.33) { C0 = K.deep; C1 = K.dk; k2 = u / 0.33; } else if (u < 0.72) { C0 = K.dk; C1 = K.mid; k2 = (u - 0.33) / 0.39; } else { C0 = K.mid; C1 = K.lit; k2 = Math.min(1, (u - 0.72) / 0.32); }
      /* the foot sits in its own shade, where it meets the floor */
      var foot = Math.max(0, (t - 0.86) / 0.17) * 0.16;
      var o = (j * PW + q) * 4;
      for (var ch = 0; ch < 3; ch++) d[o + ch] = Math.max(0, Math.min(255, (C0[ch] + (C1[ch] - C0[ch]) * k2) * (1 + g0 - foot)));
      d[o + 3] = Math.round(al * 255);
    }
    tx.putImageData(img, 0, 0);
    x.drawImage(tmp, 0, 0, W, Hh);
    var rs = R(seed * 13);
    /* the toe: a slumped apron, and what rolled to the bottom */
    for (var k = 0; k < (K.stones ? 140 : 46); k++) {
      var th2 = rs() * 6.2832, tt = K.stones ? 0.45 + Math.pow(rs(), 0.5) * 0.62 : 0.86 + rs() * 0.24;
      var ex = Math.cos(th2) * rx, ey = Math.sin(th2) * ry, px2 = cx0 + ex * tt, py2 = cy0 + pk * (1 - tt) + ey * tt;
      var big = K.stones ? (0.35 + tt * 1.1) * (0.6 + rs() * 0.8) : 0.25 + rs() * 0.4;
      var tone = K.stones ? [ [150, 146, 138], [120, 112, 104], [176, 168, 152], [138, 122, 104] ][k % 4] : [168, 148, 112];
      ell(x, px2 + big * 0.3, py2 + big * 0.35, big, big * 0.75, "rgba(40,30,20,.32)");
      ell(x, px2, py2, big, big * 0.75, "rgb(" + tone.join(",") + ")");
      ell(x, px2 - big * 0.3, py2 - big * 0.3, big * 0.45, big * 0.32, "rgba(255,250,236,.55)");
    }
    /* a few tiny runnels of grains still trickling, and the bright lip of the peak */
    ell(x, cx0 - 1.2, cy0 + pk - 0.4, 2.4, 1.3, "rgba(255,252,240,.5)");
    c.w = W; c.h = Hh;
    pileCache[key] = c;
    return c;
  }
  BS.pileArt = pileArt;
  /* the floor of the pit: tracks the loader has laid a thousand times, damp
     patches where it is lowest, survey stakes with their orange tape */
  var PIT_TRACKS = [
    [[59.5, 47.6], [64, 47.4], [69, 47.7], [73.5, 47], [76.6, 44.6], [77, 37]],
    [[63, 48.6], [64.4, 46.4], [64.2, 44.3]],
    [[71.5, 48.6], [70.6, 46.3], [66.2, 40.4], [64.6, 40.2]],
    [[74.5, 36.5], [72, 38.2], [68, 38.6], [64.6, 38.2]]
  ];
  function pitFloor(x, m) {
    var P = m.pit;
    x.save();
    x.beginPath(); x.rect((P.x + 1) * T, (P.y + 1) * T, (P.w - 2) * T, (P.h - 2) * T); x.clip();
    /* damp, darker ground in the low south-west corner */
    x.fillStyle = rg(x, 60.5 * T, 48 * T, 4, 70, [[0, "rgba(120,100,70,.22)"], [1, "rgba(120,100,70,0)"]]); x.fillRect(P.x * T, 40 * T, 14 * T, 10 * T);
    x.fillStyle = rg(x, 79 * T, 47.6 * T, 2, 34, [[0, "rgba(110,96,70,.2)"], [1, "rgba(110,96,70,0)"]]); x.fillRect(74 * T, 44 * T, 8 * T, 6 * T);
    /* tracks: two tires, a tread printed across each */
    PIT_TRACKS.forEach(function (path, pi) {
      var pts = [];
      for (var i = 0; i < path.length - 1; i++) {
        var p0 = path[Math.max(0, i - 1)], p1 = path[i], p2 = path[i + 1], p3 = path[Math.min(path.length - 1, i + 2)];
        for (var u = 0; u < 1; u += 0.04) {
          var u2 = u * u, u3 = u2 * u;
          pts.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3) * T,
                    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3) * T]);
        }
      }
      pts.push([path[path.length - 1][0] * T, path[path.length - 1][1] * T]);
      [-7, 7].forEach(function (side) {
        var off = [], acc = 0;
        for (var i = 0; i < pts.length; i++) {
          var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], vx = b[0] - a[0], vy = b[1] - a[1], l = Math.hypot(vx, vy) || 1;
          off.push([pts[i][0] - vy / l * side, pts[i][1] + vx / l * side, vx / l, vy / l]);
        }
        function trace(dx, dy) { x.beginPath(); off.forEach(function (o, i) { if (i) x.lineTo(o[0] + dx, o[1] + dy); else x.moveTo(o[0] + dx, o[1] + dy); }); x.stroke(); }
        /* the rut, a shade darker, and a lit lip pushed up on its far side */
        x.lineCap = "round"; x.lineJoin = "round";
        x.strokeStyle = "rgba(110,92,62," + (0.17 - pi * 0.025) + ")"; x.lineWidth = 4.2; trace(0, 0);
        x.strokeStyle = "rgba(255,246,222,.18)"; x.lineWidth = 0.8; trace(0.9, 2.2);
        x.strokeStyle = "rgba(90,72,48,.12)"; x.lineWidth = 0.8; trace(-0.6, -1.9);
        /* chevrons of tread, every couple of units */
        x.strokeStyle = "rgba(90,74,50," + (0.2 - pi * 0.03) + ")"; x.lineWidth = 0.7;
        for (i = 1; i < off.length; i++) {
          var o0 = off[i - 1], o1 = off[i], l2 = Math.hypot(o1[0] - o0[0], o1[1] - o0[1]);
          for (acc += l2; acc > 2.6; acc -= 2.6) {
            var f = 1 - acc / l2, cxp = o0[0] + (o1[0] - o0[0]) * f, cyp = o0[1] + (o1[1] - o0[1]) * f, tx = o1[2], ty = o1[3];
            x.beginPath(); x.moveTo(cxp - ty * 1.8 - tx * 0.9, cyp + tx * 1.8 - ty * 0.9); x.lineTo(cxp, cyp); x.lineTo(cxp + ty * 1.8 - tx * 0.9, cyp - tx * 1.8 - ty * 0.9); x.stroke();
          }
        }
      });
    });
    /* survey stakes, each with a twist of orange flagging tape */
    [[71.2, 35.6], [79.6, 36.2], [80.4, 46.4], [58.9, 39.5]].forEach(function (s, i) {
      var sx = s[0] * T, sy = s[1] * T;
      shadow(x, sx + 2, sy + 1, 2.4, 0.9, 0.35);
      x.fillStyle = "#c8a878"; x.fillRect(sx - 0.5, sy - 7, 1, 7);
      x.fillStyle = "#f26a2a"; x.beginPath(); x.moveTo(sx + 0.4, sy - 6.6); x.quadraticCurveTo(sx + 3.5, sy - 6.2 + (i % 2), sx + 4.6, sy - 4.2); x.lineTo(sx + 3.2, sy - 4.6); x.quadraticCurveTo(sx + 2.4, sy - 5.6, sx + 0.4, sy - 5.4); x.fill();
    });
    /* boulders the loader set aside, half sunk */
    [[74.6, 48.2, 3.4], [79.2, 41.6, 2.6], [59.6, 35.6, 2.2], [72.4, 35.4, 1.8]].forEach(function (b) {
      var bx = b[0] * T, by = b[1] * T, r = b[2];
      shadow(x, bx + r * 0.5, by + r * 0.5, r * 1.5, r * 0.7, 0.4);
      ell(x, bx, by, r * 1.2, r, rg(x, bx - r * 0.5, by - r * 0.5, 0.3, r * 1.6, [[0, "#e8e2d4"], [0.5, "#aaa292"], [1, "#6a6458"]]));
    });
    x.restore();
  }

  function wetNear(m, cx, cy) {
    var g = wetGrid(m);
    for (var ty = cy * CH - 1; ty < cy * CH + CH + 1; ty++) for (var tx = cx * CH - 1; tx < cx * CH + CH + 1; tx++)
      if (tx >= 0 && ty >= 0 && tx < g.W && ty < g.H && g.near[ty * g.W + tx]) return true;
    return false;
  }
  function paintWater(x, m, ox, oy, S) {
    var Rz = ART, N = S * Rz, tmp = cv(N, N), tx = tmp.getContext("2d"), id = tx.createImageData(N, N), d = id.data, any = false;
    var step = 1 / Rz;
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var wx = ox + (i + 0.5) * step, wy = oy + (j + 0.5) * step, v = wetAt(m, wx, wy, true);
      if (v < 0.42) continue;
      var k = (j * N + i) * 4, g = m._wet, ttx = Math.floor(wx / T), tty = Math.floor(wy / T);
      var spring = Math.abs(g.typ[Math.max(0, Math.min(g.H - 1, tty)) * g.W + Math.max(0, Math.min(g.W - 1, ttx))]) === 2;
      var a = Math.max(0, Math.min(1, (v - 0.485) / 0.03));            // the waterline, anti-aliased
      var r, gg, b, al;
      if (a <= 0) {
        /* the wet margin: dark, shining mud where the water has just been */
        var wm = Math.max(0, Math.min(1, (v - 0.42) / 0.065));
        r = 62; gg = 50; b = 34; al = wm * 0.42;
      } else {
        var deep = Math.max(0, Math.min(1, (v - 0.5) / (spring ? 0.2 : 0.42)));
        /* is the bank just to the north? then you see its earth face */
        var up = wetAt(m, wx, wy - 3.2, true), face = up < 0.49 ? Math.max(0, Math.min(1, (0.49 - up) / 0.05)) : 0;
        var sky = 0.5 + 0.5 * vn(wx * 0.6, wy * 2.4, 9, 77);              // soft streaks of sky lying on it
        if (spring) { r = 96 - deep * 40; gg = 140 - deep * 40; b = 128 - deep * 20; }
        else { r = 104 - deep * 70 + sky * 10; gg = 140 - deep * 70 + sky * 12; b = 132 - deep * 36 + sky * 14; }
        /* the shallow rim, clear over the mud */
        var sh = 1 - Math.min(1, (v - 0.5) / 0.08);
        if (sh > 0) { r += (128 - r) * sh * 0.55; gg += (116 - gg) * sh * 0.55; b += (84 - b) * sh * 0.55; }
        if (face > 0) { r += (70 - r) * face; gg += (52 - gg) * face; b += (34 - b) * face; }
        al = a;
      }
      d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = Math.round(al * 255); any = true;
    }
    if (!any) return;
    tx.putImageData(id, 0, 0);
    x.save(); x.imageSmoothingEnabled = true; x.drawImage(tmp, ox, oy, S, S); x.restore();
  }
  function paintOutdoorChunk(m, cx, cy) {
    var S = CH * T, ox = cx * S, oy = cy * S;
    var c = wc(S, S, ART), x = c.x;
    x.translate(-ox, -oy);
    /* 1. the color field, two world units a sample, warped edges */
    var N = S / 2, small = cv(N, N), sx = small.getContext("2d"), id = sx.createImageData(N, N), d = id.data;
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var wx = ox + i * 2 + 1, wy = oy + j * 2 + 1, mt0 = matAt(m, wx, wy), M = MATRGB[mt0 === "water" || mt0 === "spring" ? "mud" : mt0];   // water is painted on its own, smooth, below
      var n = fbm(wx, wy, 40, 5), n2 = vn(wx, wy, 7, 9), A = M[0], B = M[1], C = M[2];
      var t = n * 1.25 - 0.1, k = (j * N + i) * 4, f = 0.94 + n2 * 0.12, q;
      if (t > 0.5) { q = Math.min(1, (t - 0.5) * 2); d[k] = (A[0] + (B[0] - A[0]) * q) * f; d[k + 1] = (A[1] + (B[1] - A[1]) * q) * f; d[k + 2] = (A[2] + (B[2] - A[2]) * q) * f; }
      else { q = Math.max(0, t * 2); d[k] = (C[0] + (A[0] - C[0]) * q) * f; d[k + 1] = (C[1] + (A[1] - C[1]) * q) * f; d[k + 2] = (C[2] + (A[2] - C[2]) * q) * f; }
      /* the hill is never one color: slow patches, greener where the ground
         stays damp, sun-bleached gold where it doesn't */
      var mt = matAt(m, wx, wy);
      if (mt === "dry" || mt === "long" || mt === "grass" || mt === "garden") {
        var hv = vn(wx, wy, 150, 21) - 0.5, lv = 0.97 + vn(wx, wy, 70, 33) * 0.07, wet = mt === "dry" || mt === "long" ? 0.55 : 0.3;
        d[k] *= (1 - hv * 0.22 * wet) * lv; d[k + 1] *= (1 + hv * 0.1 * wet) * lv; d[k + 2] *= (1 - hv * 0.05 * wet + Math.max(0, -hv) * 0.1 * wet) * lv;
      }
      d[k + 3] = 255;
    }
    sx.putImageData(id, 0, 0);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.drawImage(small, ox, oy, S, S);
    /* 1b. water, by its own smooth field: an anti-aliased shore, the far
       bank's earth face showing above the surface, shallows going clear
       over the mud, the middle deep and holding the sky */
    if (m.outdoor && wetNear(m, cx, cy)) paintWater(x, m, ox, oy, S);
    /* 2. strokes: blades, petals, pebbles, leaves */
    var rnd = R(cx * 7919 + cy * 104729 + 1);
    for (var q2 = 0; q2 < 1700; q2++) {
      var px = ox + rnd() * S, py = oy + rnd() * S;
      detail(x, matAt(m, px, py), px, py, rnd(), rnd);
    }
    /* 3. the things on the ground that stand up a little */
    var x0 = cx * CH, y0 = cy * CH;
    for (var ty = y0 - 1; ty < y0 + CH + 1; ty++) for (var tx = x0 - 1; tx < x0 + CH + 1; tx++) groundProp(x, m, tx, ty);
    /* sand and gravel, sorted into separate peaks: each one painted once as
       a lit cone and laid into the ground wherever a chunk touches it */
    (m.piles || []).forEach(function (p, i) {
      var pc = pileArt(p, i);
      if (pc.X + pc.w < ox || pc.X > ox + S || pc.Y + pc.h < oy || pc.Y > oy + S) return;
      x.drawImage(pc, pc.X, pc.Y, pc.w, pc.h);
    });
    /* the loader's tracks, pressed into the floor and crossed over and over */
    if (m.pit && ox < (m.pit.x + m.pit.w) * T && ox + S > m.pit.x * T && oy < (m.pit.y + m.pit.h) * T && oy + S > m.pit.y * T) pitFloor(x, m);
    /* lone-tree shadows (the canopy itself is up in the air) */
    for (ty = y0 - 2; ty < y0 + CH + 2; ty++) for (tx = x0 - 2; tx < x0 + CH + 2; tx++) if (m.get(tx, ty) === TL.TREE) shadow(x, tx * T + 8, ty * T + 15, 10, 4, 0.32);
    return c;
  }

  function detail(x, mt, px, py, u, rnd) {
    switch (mt) {
      case "grass": case "garden": case "compost":
        if (u < 0.75) blade(x, px, py, 2 + rnd() * 3.2, (rnd() - 0.5) * 3, 0.55, "#4d742a", rnd() < 0.5 ? "#b6d878" : "#9ccb62");
        else if (u < 0.8) flower(x, px, py, "#fbf8ec", "#f2c94a", 1.1);
        else if (u < 0.83) flower(x, px, py, "#f6d24a", "#e09a2a", 0.8);
        else if (u < 0.86) { for (var k = 0; k < 3; k++) ell(x, px + Math.cos(k * 2.1) * 0.9, py + Math.sin(k * 2.1) * 0.7, 0.9, 0.7, "#5f9a3a"); }
        else if (u < 0.87) flower(x, px, py, "#c9a6e6", "#f3e7a0", 0.9);
        break;
      case "dry":
        if (u < 0.8) blade(x, px, py, 2.5 + rnd() * 3.5, (rnd() - 0.4) * 3.5, 0.55, "#8a7f3a", rnd() < 0.5 ? "#efe39a" : "#d7c97a");
        else if (u < 0.83) { blade(x, px, py, 6, 1.5, 0.5, "#8a7f3a", "#c9b96a"); ell(x, px + 1.5, py - 6.5, 0.8, 1.6, "#e3d38e", 0.3); }
        else if (u < 0.84) flower(x, px, py, "#f4f0e2", "#e8c34a", 0.9);
        break;
      case "long":
        if (u < 0.92) blade(x, px, py, 4 + rnd() * 5, (rnd() - 0.35) * 4.5, 0.6, "#8f8238", rnd() < 0.4 ? "#f6eaa2" : "#e0d184");
        else { blade(x, px, py, 8, 2, 0.5, "#8f8238", "#d8c87a"); ell(x, px + 2, py - 8.5, 0.9, 1.9, "#f1e3a2", 0.4); }
        break;
      case "road":
        if (u < 0.32) { var r = 0.5 + rnd() * 1.1; ell(x, px + 0.4, py + 0.4, r, r * 0.7, "rgba(70,50,30,.35)"); ell(x, px, py, r, r * 0.72, mix("#9a8a74", "#d8cfbf", rnd())); ell(x, px - r * 0.3, py - r * 0.3, r * 0.4, r * 0.25, "rgba(255,250,235,.55)"); }
        else if (u < 0.4) ell(x, px, py, 2 + rnd() * 3, 0.6, "rgba(120,95,60,.18)");
        break;
      case "soil":
        if (u < 0.35) ell(x, px, py, 1.2, 0.5, "rgba(40,28,15,.4)");
        else if (u < 0.6) blade(x, px, py, 2 + rnd() * 3, (rnd() - 0.5) * 2, 0.6, "#4a6a2a", "#9ab85a");
        break;
      case "litter":
        if (u < 0.55) { var a = rnd() * 6.28, col = ["#9b6a32", "#b8813e", "#7d5a2a", "#a89040", "#c9963f"][Math.floor(rnd() * 5)]; ell(x, px + 0.4, py + 0.4, 1.7, 0.8, "rgba(30,20,10,.3)", a); ell(x, px, py, 1.7, 0.8, col, a); x.strokeStyle = "rgba(60,40,20,.5)"; x.lineWidth = 0.15; x.beginPath(); x.moveTo(px - Math.cos(a) * 1.5, py - Math.sin(a) * 1.5); x.lineTo(px + Math.cos(a) * 1.5, py + Math.sin(a) * 1.5); x.stroke(); }
        else if (u < 0.62) { x.strokeStyle = "#4a3a24"; x.lineWidth = 0.5; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rnd() - 0.5) * 6, py + (rnd() - 0.5) * 3); x.stroke(); }
        else if (u < 0.75) ell(x, px, py, 1.4, 1, "rgba(90,130,50,.55)");
        else if (u < 0.755) { ell(x, px, py - 1.2, 1.4, 0.9, "#c8573a"); x.fillStyle = "#efe6d6"; x.fillRect(px - 0.3, py - 1, 0.6, 1.6); ell(x, px - 0.5, py - 1.4, 0.3, 0.2, "#fff"); }
        break;
      case "forest":
        if (u < 0.4) ell(x, px, py, 1.6, 1.1, rnd() < 0.5 ? "rgba(70,100,45,.5)" : "rgba(30,40,22,.5)");
        else if (u < 0.5) { for (var f = -2; f <= 2; f++) blade(x, px, py, 4, f * 1.4, 0.6, "#2a3a1c", "#5a8a3a"); }
        break;
      case "hedge": if (u < 0.5) ell(x, px, py, 1.4, 1.1, "rgba(30,50,20,.4)"); break;
      case "water": case "spring": if (u < 0.08) ell(x, px, py, 1.2, 0.5, "rgba(200,235,240,.12)"); break;
      case "mud":
        if (u < 0.2) ell(x, px, py, 2 + rnd() * 2, 1 + rnd(), "rgba(40,30,15,.25)");
        else if (u < 0.45) blade(x, px, py, 3 + rnd() * 4, (rnd() - 0.5) * 2, 0.6, "#3f5a26", "#7aa04a");
        break;
      case "sand": case "pile":
        if (u < 0.5) ell(x, px, py, 0.35, 0.35, rnd() < 0.5 ? "rgba(255,250,230,.6)" : "rgba(140,110,70,.35)");
        else if (u < 0.53) { var r2 = 0.5 + rnd(); ell(x, px + 0.3, py + 0.3, r2, r2 * 0.7, "rgba(80,60,30,.3)"); ell(x, px, py, r2, r2 * 0.7, "#b8ab94"); }
        break;
    }
  }

  /* fences, hedges, beds, the tap, chain-link, stepping stones — drawn into
     the ground with a little height and a soft shadow */
  function groundProp(x, m, tx, ty) {
    var t = m.get(tx, ty), X = tx * T, Y = ty * T, k;
    if (t === TL.FENCE) {
      var vert = (m.get(tx, ty - 1) === TL.FENCE || m.get(tx, ty + 1) === TL.FENCE) && !(m.get(tx - 1, ty) === TL.FENCE || m.get(tx + 1, ty) === TL.FENCE);
      if (vert) {
        shadow(x, X + 11, Y + 9, 3, 9, 0.25);
        rr(x, X + 6.6, Y - 3, 2.6, T + 1, 0.8, lg(x, X + 6.6, 0, X + 9.2, 0, [[0, "#c8bea8"], [1, "#8a7f6a"]]));
        rr(x, X + 6, Y + 3, 3.8, 3.2, 0.8, "#b4a890"); rr(x, X + 6, Y + 3, 3.8, 1, 0.5, "#d8cfba");
      } else {
        shadow(x, X + 9, Y + 13, 10, 2.4, 0.25);
        rr(x, X - 0.5, Y + 4.5, T + 1, 1.8, 0.6, lg(x, 0, Y + 4.5, 0, Y + 6.3, [[0, "#d2c8b2"], [1, "#8f846e"]]));
        rr(x, X - 0.5, Y + 9, T + 1, 1.8, 0.6, lg(x, 0, Y + 9, 0, Y + 10.8, [[0, "#c8bea8"], [1, "#857a64"]]));
        if (tx % 2 === 0) { rr(x, X + 6.5, Y + 1, 3, 12.5, 0.9, lg(x, X + 6.5, 0, X + 9.5, 0, [[0, "#d8cfb8"], [1, "#857a64"]])); ell(x, X + 8, Y + 1.4, 1.5, 0.7, "#e8e0cc"); }
      }
      if (H(tx, ty, 5) > 0.7) blade(x, X + 3 + H(tx, ty, 6) * 10, Y + 14, 6, 1, 0.6, "#5a7a2a", "#a6c86a");
    }
    if (t === TL.GATE) {
      shadow(x, X + 8, Y + 12, 8, 2, 0.2);
      var gx = tx % 2 ? X + 14 : X + 1;
      rr(x, gx - 1, Y - 2, 3, 15, 1, lg(x, gx - 1, 0, gx + 2, 0, [[0, "#d8cfb8"], [1, "#857a64"]]));
      ell(x, gx + 0.5, Y - 1.6, 1.8, 0.8, "#efe6d2");
    }
    if (t === TL.HEDGE) {
      shadow(x, X + 12, Y + 12, 11, 8, 0.28);
      var rh = R(tx * 131 + ty * 17);
      for (k = 0; k < 7; k++) lump(x, X + 2 + rh() * 12, Y - 2 + rh() * 14, 4 + rh() * 3.2, rh() < 0.5 ? "#4f7a36" : "#5a8a3c", "#a8d07a");
      for (k = 0; k < 9; k++) ell(x, X + rh() * 16, Y - 3 + rh() * 15, 0.9, 0.6, rh() < 0.5 ? "rgba(200,235,150,.55)" : "rgba(30,55,20,.45)", rh() * 3);
      if (H(tx, ty, 39) > 0.72) flower(x, X + 4 + H(tx, ty, 40) * 8, Y + H(ty, tx, 40) * 8, "#fbfaf0", "#f0d060", 1.1);
    }
    if (t === TL.BED) {
      shadow(x, X + 10, Y + 13, 10, 3, 0.25);
      rr(x, X, Y + 1, T, T - 1, 1.5, "#7a5634"); rr(x, X + 1.2, Y + 2.2, T - 2.4, T - 4, 1.2, lg(x, 0, Y, 0, Y + T, [[0, "#5a412a"], [1, "#6e5134"]]));
      rr(x, X, Y + T - 2.5, T, 2.5, 1, "#5e4228");
      var rb = R(tx * 7 + ty * 991);
      for (k = 0; k < 6; k++) { var bx = X + 2.5 + rb() * 11, by = Y + 4 + rb() * 9; blade(x, bx, by, 5 + rb() * 4, (rb() - 0.5) * 3, 0.7, "#4a6a2a", "#a2c45a"); if (rb() < 0.4) ell(x, bx + 1, by - 7, 1.4, 1.4, rb() < 0.5 ? "#e8b33a" : "#d9cfa8"); }
    }
    if (t === TL.TAP) {
      shadow(x, X + 10, Y + 13, 4, 2, 0.3);
      rr(x, X + 6.5, Y + 1, 2.6, 13, 1, lg(x, X + 6.5, 0, X + 9.1, 0, [[0, "#b8bcc0"], [1, "#5e6266"]]));
      rr(x, X + 8.5, Y + 4, 4.5, 1.8, 0.8, "#7c8084"); ell(x, X + 7.8, Y + 2.4, 2.4, 1, "#b33a2a"); ell(x, X + 7.5, Y + 2.1, 1.2, 0.4, "#e8a090");
      ell(x, X + 12, Y + 14, 2.6, 1, "rgba(120,170,190,.5)");
    }
    if (t === TL.CHAIN || t === TL.GAP) {
      var horiz = [m.get(tx - 1, ty), m.get(tx + 1, ty)].some(function (q) { return q === TL.CHAIN || q === TL.GAP; });
      x.strokeStyle = "rgba(150,155,160,.55)"; x.lineWidth = 0.35;
      if (horiz) {
        if (t === TL.GAP) { x.beginPath(); x.moveTo(X, Y + 2); x.quadraticCurveTo(X + 3, Y + 9, X + 1, Y + 12); x.moveTo(X + 16, Y + 2); x.quadraticCurveTo(X + 13, Y + 9, X + 15, Y + 12); x.stroke(); }
        else for (var q = 0; q < 16; q += 2) { x.beginPath(); x.moveTo(X + q, Y + 1); x.lineTo(X + q + 2, Y + 12); x.moveTo(X + q + 2, Y + 1); x.lineTo(X + q, Y + 12); x.stroke(); }
        x.strokeStyle = "#8a9096"; x.lineWidth = 0.7; x.beginPath(); x.moveTo(X, Y + 1); x.lineTo(X + 16, Y + 1); x.stroke();
        if (tx % 3 === 0 && t !== TL.GAP) { shadow(x, X + 9, Y + 13, 2, 1, 0.3); rr(x, X + 7, Y - 2, 1.6, 15, 0.8, "#6a7076"); }
      } else {
        for (q = 0; q < 16; q += 2) { x.beginPath(); x.moveTo(X + 5, Y + q); x.lineTo(X + 11, Y + q + 2); x.stroke(); }
        if (ty % 3 === 0) { shadow(x, X + 9, Y + 13, 2, 1, 0.3); rr(x, X + 7, Y - 2, 1.6, 15, 0.8, "#6a7076"); }
      }
    }
    if (t === TL.FLAT) {
      shadow(x, X + 9, Y + 11, 8, 4, 0.3);
      ell(x, X + 8, Y + 8, 7, 4.6, lg(x, 0, Y + 4, 0, Y + 12, [[0, "#b8b6aa"], [1, "#7e7c72"]])); ell(x, X + 6, Y + 6.6, 3.5, 1.4, "rgba(255,255,245,.25)");
    }
    if (t === TL.WATER && H(tx, ty, 61) > 0.78) {
      var lx = X + 4 + H(tx, ty, 62) * 8, ly = Y + 4 + H(ty, tx, 62) * 8;
      ell(x, lx + 0.6, ly + 0.6, 3, 2.2, "rgba(10,30,30,.35)");
      x.fillStyle = "#4e8a3a"; x.beginPath(); x.ellipse(lx, ly, 3, 2.2, 0, 0.35, 6.0); x.lineTo(lx, ly); x.fill(); ell(x, lx - 0.8, ly - 0.6, 1.2, 0.5, "rgba(200,240,160,.4)");
      if (H(tx, ty, 63) > 0.5) flower(x, lx + 1, ly - 0.5, "#f8e8f0", "#f0d060", 0.9);
    }
    if (t === TL.SPRING) {
      var rs = R(tx * 3 + ty * 77);
      for (k = 0; k < 3; k++) { var sx = X + 3 + rs() * 10, sy = Y + 3 + rs() * 10, sr = 1.2 + rs() * 1.6; ell(x, sx + 0.5, sy + 0.5, sr, sr * 0.7, "rgba(20,30,25,.4)"); ell(x, sx, sy, sr, sr * 0.7, "#8a8e86"); ell(x, sx - 0.4, sy - 0.4, sr * 0.4, sr * 0.25, "rgba(255,255,255,.4)"); }
    }
    if (t === TL.MUD && (m.get(tx, ty + 1) === TL.WATER || m.get(tx, ty - 1) === TL.WATER)) {
      for (k = 0; k < 4; k++) { var rx = X + H(tx, k, 70) * 16; blade(x, rx, Y + 10, 8 + H(k, ty, 71) * 6, (H(tx, k, 72) - 0.5) * 3, 0.9, "#3f5a26", "#8ab05a"); if (H(k, tx, 73) > 0.6) ell(x, rx + 0.5, Y - 1, 0.9, 2.2, "#6a4a2a"); }
    }
  }

  /* ================= Gran's house, inside =================
     Everything here is baked once into the floor chunks.
     · the boards: long planks, butt joints staggered row to row, grain and
       the odd knot, nail heads at the joints, a varnish that's worn pale
       along the paths everybody walked for forty years — door to stairs,
       stairs to kitchen — and dark, unfaded rectangles where the furniture
       stood until last week, each with its rim of dust and four castor dents;
    · the rug: one rug, not a pattern of tiles — border bands, a field of
      little flowers, a medallion in the middle, fringe at both ends, worn
      thin where the feet went, one corner kicked over;
    · the boxes: proper moving boxes, some stacked two high, some taped,
      some open with books or newspaper or a lamp's neck showing, labeled
      in marker; tape and newspaper on the floor beside them;
    · the kitchen: small oxblood-and-cream checks, glossy and chipped; a
      butcher-block counter on sage cupboards, a sink under the window,
      the kettle, the tins; a round-shouldered fridge with magnets and a
      calendar; gingham on the table; spindle chairs. */
  var HOUSE_WORN = [[[6.5, 12.6], [6.5, 9.2], [4.6, 5.2], [3.5, 3.1]], [[6.5, 9.2], [11, 8.4], [16.5, 7.5], [19.5, 7.5]], [[19.5, 7.5], [19.5, 3.2]]];
  var HOUSE_GHOSTS = [[11.2, 9.6, 4.4, 1.6], [12.2, 1.05, 3.6, 0.9], [2.6, 8.9, 1.2, 1.2]];   // a sofa, a bookcase, a side table (tiles)
  function segD(px, py, a, b) { var vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy, u = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / l)); return Math.hypot(px - a[0] - vx * u, py - a[1] - vy * u); }
  function wornAt(px, py) { var d = 9; HOUSE_WORN.forEach(function (P) { for (var i = 0; i < P.length - 1; i++) d = Math.min(d, segD(px, py, P[i], P[i + 1])); }); return d; }
  function houseBoards(x, m, tx, ty) {
    var X = tx * T, Y = ty * T, j;
    for (j = 0; j < 4; j++) {
      var row = ty * 4 + j, by = Y + j * 4, off = (H(row, 3, 11) * 64) | 0, L = 48 + ((H(row, 5, 12) * 3) | 0) * 8;
      /* each plank between joints in this row, clipped to the tile */
      var s0 = Math.floor((X + off) / L) - 1;
      for (var s = s0; s <= s0 + 2; s++) {
        var px0 = s * L - off, px1 = px0 + L, a0 = Math.max(X, px0), a1 = Math.min(X + T, px1);
        if (a1 <= a0) continue;
        var base = mix("#7a5034", "#b4845a", H(row, s, 13) * 0.8 + 0.1);
        x.fillStyle = lg(x, 0, by, 0, by + 4, [[0, shade(base, 0.12)], [0.5, base], [1, shade(base, -0.14)]]); x.fillRect(a0, by, a1 - a0, 4);
        /* grain */
        x.strokeStyle = "rgba(60,32,14,.2)"; x.lineWidth = 0.22;
        for (var g = 0; g < 2; g++) { var gy = by + 1 + g * 1.4 + H(row, s + g, 14) * 0.6; x.beginPath(); x.moveTo(a0, gy); for (var q = a0; q <= a1; q += 4) x.lineTo(q, gy + Math.sin((q + s * 13) * 0.21 + g) * 0.35); x.stroke(); }
        /* a knot, now and then */
        var kx = px0 + 8 + H(row, s, 15) * (L - 16);
        if (H(row, s, 16) > 0.72 && kx > a0 + 1 && kx < a1 - 1) { ell(x, kx, by + 2, 1.3, 0.75, "rgba(70,36,16,.55)"); ell(x, kx, by + 2, 0.5, 0.3, "rgba(40,20,8,.7)"); }
        /* the joint and its two nails */
        if (px0 >= X && px0 < X + T) { x.fillStyle = "rgba(36,20,8,.75)"; x.fillRect(px0, by, 0.4, 4); ell(x, px0 + 1.1, by + 1, 0.28, 0.28, "rgba(30,24,20,.8)"); ell(x, px0 + 1.1, by + 3, 0.28, 0.28, "rgba(30,24,20,.8)"); }
      }
      x.fillStyle = "rgba(36,20,8,.6)"; x.fillRect(X, by + 3.65, T, 0.35);
      x.fillStyle = "rgba(255,236,200,.1)"; x.fillRect(X, by, T, 0.3);
    }
    /* worn pale where everyone walked */
    for (var wy = 0; wy < 4; wy++) for (var wx = 0; wx < 4; wx++) {
      var d = wornAt(tx + (wx + 0.5) / 4, ty + (wy + 0.5) / 4), wv = Math.max(0, Math.min(1, (1.25 - d) / 0.9));
      if (wv > 0) { x.fillStyle = "rgba(255,226,180," + (0.13 * wv) + ")"; x.fillRect(X + wx * 4, Y + wy * 4, 4, 4); }
    }
    /* where the furniture stood: unfaded, with a rim of dust and the castor dents */
    HOUSE_GHOSTS.forEach(function (gR) {
      var gx = gR[0] * T, gy = gR[1] * T, gw = gR[2] * T, gh = gR[3] * T;
      if (gx > X + T || gx + gw < X || gy > Y + T || gy + gh < Y) return;
      x.save(); x.beginPath(); x.rect(X, Y, T, T); x.clip();
      x.fillStyle = "rgba(70,30,8,.28)"; x.fillRect(gx, gy, gw, gh);
      x.strokeStyle = "rgba(235,222,196,.32)"; x.lineWidth = 0.6; x.strokeRect(gx - 0.3, gy - 0.3, gw + 0.6, gh + 0.6);
      [[gx + 1.5, gy + 1.5], [gx + gw - 1.5, gy + 1.5], [gx + 1.5, gy + gh - 1.5], [gx + gw - 1.5, gy + gh - 1.5]].forEach(function (c) { ell(x, c[0], c[1], 0.8, 0.8, "rgba(40,20,6,.45)"); });
      x.restore();
    });
    /* the wall's shadow along the skirting */
    if (m.get(tx, ty - 1) === TL.WALL || m.get(tx, ty - 1) === TL.WINDOW || m.get(tx, ty - 1) === TL.CDOOR) { x.fillStyle = lg(x, 0, Y, 0, Y + 5, [[0, "rgba(20,10,4,.38)"], [1, "rgba(20,10,4,0)"]]); x.fillRect(X, Y, T, 5); }
    if (m.get(tx - 1, ty) === TL.WALL) { x.fillStyle = lg(x, X, 0, X + 4, 0, [[0, "rgba(20,10,4,.3)"], [1, "rgba(20,10,4,0)"]]); x.fillRect(X, Y, 4, T); }
    /* moving-day litter beside the boxes */
    var nearBox = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (o) { return m.get(tx + o[0], ty + o[1]) === TL.BOX; });
    var t0 = m.get(tx, ty);
    if (nearBox && (t0 === TL.FLOOR) && H(tx, ty, 17) > 0.8) {
      var kind = (H(tx, ty, 18) * 3) | 0, lx = X + 3 + H(tx, ty, 19) * 9, ly = Y + 4 + H(ty, tx, 20) * 8;
      if (kind === 0) { /* a sheet of newspaper */ x.save(); x.translate(lx, ly); x.rotate(H(tx, ty, 21) - 0.5); rr(x, -4.5, -3, 9, 6, 0.3, "#e8e2d2"); x.fillStyle = "rgba(60,60,60,.45)"; for (var nl = 0; nl < 5; nl++) x.fillRect(-3.8 + (nl % 2) * 4.2, -2 + (nl >> 1) * 1.4, 3.4, 0.35); x.fillStyle = "rgba(40,40,40,.7)"; x.fillRect(-3.8, -2.6, 6, 0.5); x.restore(); }
      else if (kind === 1) { /* the tape */ ell(x, lx, ly + 1, 2.6, 1.2, "rgba(20,10,4,.3)"); ell(x, lx, ly, 2.4, 1.7, "#c8b48a"); ell(x, lx, ly, 2, 1.3, "rgba(214,196,150,.9)"); ell(x, lx, ly, 1.1, 0.7, "#5a4632"); ell(x, lx - 0.6, ly - 0.8, 0.9, 0.5, "rgba(255,255,255,.4)"); }
      else { /* a marker, cap off */ x.save(); x.translate(lx, ly); x.rotate(0.6); rr(x, -2.6, -0.6, 5.2, 1.2, 0.5, "#1e1e24"); x.fillStyle = "#e8e8e8"; x.fillRect(-1.2, -0.6, 1.4, 1.2); x.restore(); ell(x, lx + 3.4, ly + 1.6, 0.7, 0.55, "#1e1e24"); }
    }
  }
  function houseCheck(x, m, tx, ty) {
    var X = tx * T, Y = ty * T;
    for (var cy = 0; cy < 2; cy++) for (var cx = 0; cx < 2; cx++) {
      var red = (tx * 2 + cx + ty * 2 + cy) % 2, qx = X + cx * 8, qy = Y + cy * 8, wob = H(tx * 2 + cx, ty * 2 + cy, 31) * 0.1;
      var col = red ? mix("#8e3a32", "#a8473c", wob * 6) : mix("#efe6cc", "#e2d6b6", wob * 6);
      x.fillStyle = lg(x, qx, qy, qx + 8, qy + 8, [[0, shade(col, 0.1)], [1, shade(col, -0.06)]]); x.fillRect(qx, qy, 8, 8);
      if (H(tx * 2 + cx, ty * 2 + cy, 32) > 0.86) { x.fillStyle = red ? "#d8c8a8" : "#9a8a72"; x.beginPath(); x.moveTo(qx + 8, qy + 8); x.lineTo(qx + 6.4, qy + 8); x.lineTo(qx + 8, qy + 6.6); x.fill(); }
    }
    x.fillStyle = "rgba(70,50,40,.35)"; x.fillRect(X, Y + 7.8, T, 0.35); x.fillRect(X + 7.8, Y, 0.35, T); x.fillRect(X, Y + T - 0.3, T, 0.3); x.fillRect(X + T - 0.3, Y, 0.3, T);
    /* gloss, and the scuff of a chair leg */
    x.fillStyle = lg(x, X, Y, X + T, Y + T, [[0, "rgba(255,255,255,.12)"], [0.45, "rgba(255,255,255,0)"], [1, "rgba(0,0,0,.08)"]]); x.fillRect(X, Y, T, T);
    if (H(tx, ty, 33) > 0.7) { x.strokeStyle = "rgba(40,30,25,.25)"; x.lineWidth = 0.35; x.beginPath(); x.arc(X + 4 + H(tx, ty, 34) * 8, Y + 6 + H(ty, tx, 35) * 6, 2.5, 0.2, 1.6); x.stroke(); }
    if (m.get(tx, ty - 1) === TL.WALL || m.get(tx, ty - 1) === TL.WINDOW) { x.fillStyle = lg(x, 0, Y, 0, Y + 4, [[0, "rgba(20,10,4,.32)"], [1, "rgba(20,10,4,0)"]]); x.fillRect(X, Y, T, 4); }
  }
  /* the rug, as one thing */
  var rugBox = null;
  function rugBounds(m) {
    if (rugBox && rugBox.m === m) return rugBox;
    var x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (var y = 0; y < m.h; y++) for (var xx = 0; xx < m.w; xx++) if (m.get(xx, y) === TL.RUG) { x0 = Math.min(x0, xx); y0 = Math.min(y0, y); x1 = Math.max(x1, xx); y1 = Math.max(y1, y); }
    rugBox = { m: m, x: x0 * T, y: y0 * T, w: (x1 - x0 + 1) * T, h: (y1 - y0 + 1) * T };
    return rugBox;
  }
  function paintRug(x, B) {
    var X = B.x + 2, Y = B.y + 1.5, W = B.w - 4, Hh = B.h - 3, cxm = X + W / 2, cym = Y + Hh / 2, k;
    shadow(x, cxm, Y + Hh + 0.5, W / 2, 2, 0.25);
    /* fringe at both ends */
    x.strokeStyle = "#eadfc4"; x.lineWidth = 0.45;
    for (k = 0; k <= Hh; k += 1.3) { x.beginPath(); x.moveTo(X, Y + k); x.lineTo(X - 2.4 - Math.sin(k * 3.1) * 0.5, Y + k + 0.3); x.stroke(); x.beginPath(); x.moveTo(X + W, Y + k); x.lineTo(X + W + 2.4 + Math.cos(k * 2.7) * 0.5, Y + k + 0.3); x.stroke(); }
    /* ground */
    x.fillStyle = "#7e2a26"; x.fillRect(X, Y, W, Hh);
    /* outer border */
    x.fillStyle = "#1f2c46"; x.fillRect(X, Y, W, 5); x.fillRect(X, Y + Hh - 5, W, 5); x.fillRect(X, Y, 5, Hh); x.fillRect(X + W - 5, Y, 5, Hh);
    x.strokeStyle = "#d9b46a"; x.lineWidth = 0.5; x.strokeRect(X + 0.8, Y + 0.8, W - 1.6, Hh - 1.6); x.strokeRect(X + 5.2, Y + 5.2, W - 10.4, Hh - 10.4);
    /* little flowers marching round the border */
    for (k = X + 4; k < X + W - 2; k += 5) { [Y + 2.9, Y + Hh - 2.9].forEach(function (yy) { ell(x, k, yy, 1, 1, "#b8483c"); ell(x, k, yy, 0.4, 0.4, "#f0d48a"); }); }
    for (k = Y + 6; k < Y + Hh - 4; k += 5) { [X + 2.6, X + W - 2.6].forEach(function (xx) { ell(x, xx, k, 1, 1, "#b8483c"); ell(x, xx, k, 0.4, 0.4, "#f0d48a"); }); }
    /* the field: a lattice of tiny blooms */
    for (var fy = Y + 9; fy < Y + Hh - 7; fy += 6) for (var fx = X + 9 + ((fy - Y) / 6 % 2) * 3; fx < X + W - 7; fx += 6) { ell(x, fx, fy, 0.9, 0.9, "#a43c32"); ell(x, fx, fy, 0.35, 0.35, "#e8c886"); x.fillStyle = "#2c4a3a"; x.fillRect(fx - 1.7, fy - 0.15, 0.7, 0.3); x.fillRect(fx + 1, fy - 0.15, 0.7, 0.3); }
    /* the medallion */
    var mw = Math.min(W * 0.24, 30), mh = Hh * 0.5;
    x.beginPath(); x.moveTo(cxm - mw / 2 - 6, cym); x.lineTo(cxm - mw / 2, cym - mh / 2); x.lineTo(cxm + mw / 2, cym - mh / 2); x.lineTo(cxm + mw / 2 + 6, cym); x.lineTo(cxm + mw / 2, cym + mh / 2); x.lineTo(cxm - mw / 2, cym + mh / 2); x.closePath();
    x.fillStyle = "#1f2c46"; x.fill(); x.strokeStyle = "#d9b46a"; x.lineWidth = 0.6; x.stroke();
    ell(x, cxm, cym, mw * 0.32, mh * 0.34, "#8e3029"); ell(x, cxm, cym, mw * 0.32, mh * 0.34); x.stroke();
    for (k = 0; k < 8; k++) { var aa = k / 8 * Math.PI * 2; ell(x, cxm + Math.cos(aa) * mw * 0.2, cym + Math.sin(aa) * mh * 0.2, 1.4, 0.8, "#e0b864", aa); }
    ell(x, cxm, cym, 2, 2, "#f0d48a"); ell(x, cxm, cym, 0.9, 0.9, "#7e2a26");
    /* quarter-medallions in the corners */
    [[X + 5, Y + 5, 0], [X + W - 5, Y + 5, 1], [X + 5, Y + Hh - 5, 3], [X + W - 5, Y + Hh - 5, 2]].forEach(function (c) { x.beginPath(); x.moveTo(c[0], c[1]); x.arc(c[0], c[1], 7, c[2] * Math.PI / 2, (c[2] + 1) * Math.PI / 2); x.closePath(); x.fillStyle = "#1f2c46"; x.fill(); x.strokeStyle = "#d9b46a"; x.lineWidth = 0.4; x.stroke(); });
    /* nap and wear: forty years of feet down the middle */
    var r = R(77);
    for (k = 0; k < 260; k++) { var wx = X + r() * W, wy = Y + r() * Hh; x.fillStyle = r() < 0.5 ? "rgba(255,230,200,.06)" : "rgba(0,0,0,.08)"; x.fillRect(wx, wy, 0.8, 0.3); }
    x.fillStyle = rg(x, X + W * 0.42, Y + Hh * 0.62, 2, W * 0.28, [[0, "rgba(255,220,180,.16)"], [1, "rgba(255,220,180,0)"]]); x.fillRect(X, Y, W, Hh);
    /* one corner kicked over, its pale back showing */
    var fx2 = X + W, fy2 = Y + Hh;
    x.fillStyle = "#3a2010"; x.beginPath(); x.moveTo(fx2 - 9, fy2); x.lineTo(fx2, fy2); x.lineTo(fx2, fy2 - 7); x.closePath(); x.fill();
    x.fillStyle = lg(x, fx2 - 9, fy2 - 7, fx2, fy2, [[0, "#d8c8a8"], [1, "#b8a888"]]); x.beginPath(); x.moveTo(fx2 - 9, fy2); x.lineTo(fx2, fy2 - 7); x.lineTo(fx2 - 6.5, fy2 - 9); x.closePath(); x.fill();
    x.strokeStyle = "rgba(120,100,80,.6)"; x.lineWidth = 0.25; for (k = 1; k < 4; k++) { x.beginPath(); x.moveTo(fx2 - 9 + k * 1.6, fy2 - k * 1.2); x.lineTo(fx2 - 6.5 + k * 1.7, fy2 - 9 + k * 1.4); x.stroke(); }
  }
  function houseRug(x, m, tx, ty) {
    var B = rugBounds(m), X = tx * T, Y = ty * T, eL = m.get(tx - 1, ty) !== TL.RUG, eR = m.get(tx + 1, ty) !== TL.RUG;
    x.save(); x.beginPath(); x.rect(X - (eL ? 4 : 0), Y, T + (eL ? 4 : 0) + (eR ? 4 : 0), T); x.clip(); paintRug(x, B); x.restore();
  }
  /* a moving box: a front, a top, tape, a label in marker; some two high; some open */
  var LABELS = ["KITCHEN", "BOOKS", "FRAGILE", "GIVE AWAY", "GRAN — KEEP", "LINENS", "BOOKS", "STUDY", "FRAGILE ↑", "MISC"];
  function oneBox(x, bx, by, bw, bh, dep, seed, open) {
    var top = by - bh;
    /* front face */
    x.fillStyle = lg(x, 0, top + dep, 0, by, [[0, "#c79b62"], [1, "#9e7240"]]); x.fillRect(bx, top + dep, bw, bh - dep);
    x.fillStyle = "rgba(90,60,30,.35)"; x.fillRect(bx, top + dep, 0.5, bh - dep); x.fillRect(bx + bw - 0.5, top + dep, 0.5, bh - dep);
    /* corrugation, faintly */
    x.fillStyle = "rgba(80,50,20,.08)"; for (var c = bx + 1; c < bx + bw; c += 1.2) x.fillRect(c, top + dep, 0.3, bh - dep);
    /* top */
    if (open) {
      x.fillStyle = "#3a2616"; x.fillRect(bx + 0.6, top + 0.6, bw - 1.2, dep - 0.6);
      var kind = (seed * 3) | 0;
      if (kind === 0) { for (var b = 0; b < 4; b++) rr(x, bx + 1.4 + b * (bw - 3) / 4, top + 0.8, (bw - 3) / 4 - 0.3, dep - 1, 0.3, ["#6a3a2a", "#2e4a5e", "#7a6a3a", "#4a5a3a"][b]); }
      else if (kind === 1) { for (var n = 0; n < 5; n++) ell(x, bx + 2 + n * (bw - 4) / 4, top + dep / 2 + Math.sin(n * 2) * 0.6, 1.8, 1.4, n % 2 ? "#e2dccb" : "#d2ccba"); }
      else { ell(x, bx + bw / 2, top + dep / 2, 2.6, 1.6, "#d8c8a0"); x.strokeStyle = "#5a4a3a"; x.lineWidth = 0.6; x.beginPath(); x.moveTo(bx + bw / 2, top + dep / 2); x.lineTo(bx + bw / 2 + 2, top - 5); x.stroke(); ell(x, bx + bw / 2 + 3, top - 6, 2.4, 1.6, "#e8dcb0", -0.4); }
      /* flaps */
      x.fillStyle = "#d8b07a"; x.beginPath(); x.moveTo(bx, top); x.lineTo(bx - 2.2, top - 2.4); x.lineTo(bx - 2, top + dep - 1); x.lineTo(bx, top + dep); x.fill();
      x.fillStyle = "#cba26c"; x.beginPath(); x.moveTo(bx + bw, top); x.lineTo(bx + bw + 2.2, top - 2.2); x.lineTo(bx + bw + 2, top + dep - 1); x.lineTo(bx + bw, top + dep); x.fill();
      x.fillStyle = "#e0bc88"; x.fillRect(bx, top - 2.2, bw, 2.2);
    } else {
      x.fillStyle = lg(x, 0, top, 0, top + dep, [[0, "#e6c48e"], [1, "#d4ac74"]]); x.fillRect(bx, top, bw, dep);
      x.fillStyle = "rgba(110,80,40,.5)"; x.fillRect(bx, top + dep / 2 - 0.15, bw, 0.3);
      /* tape: down the seam and over the front */
      x.fillStyle = "rgba(214,190,140,.95)"; x.fillRect(bx + bw / 2 - 1.3, top, 2.6, dep + 3);
      x.fillStyle = "rgba(255,255,255,.25)"; x.fillRect(bx + bw / 2 - 1.3, top, 0.6, dep + 3);
    }
    x.fillStyle = "rgba(255,240,210,.35)"; x.fillRect(bx, top, bw, 0.35);
    /* the label, in a hurried hand */
    var lab = LABELS[(seed * 9973 % 1 * LABELS.length) | 0];
    x.save(); x.translate(bx + bw / 2, top + dep + (bh - dep) * 0.55); x.rotate((seed - 0.5) * 0.16);
    x.fillStyle = "#24222e"; x.font = "bold " + (lab.length > 8 ? 1.9 : 2.3) + "px 'Comic Sans MS','Marker Felt',sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(lab, 0, 0);
    if (lab.indexOf("FRAGILE") === 0) { x.strokeStyle = "#b8322a"; x.lineWidth = 0.35; x.strokeRect(-6.5, -1.6, 13, 3.2); }
    x.restore();
  }
  function houseBox(x, m, tx, ty) {
    var X = tx * T, Y = ty * T, s = H(tx, ty, 100), s2 = H(ty, tx, 101), stack = s2 > 0.55, open = !stack && H(tx, ty, 102) > 0.6;
    shadow(x, X + 9, Y + 14.5, 9, 3, 0.4);
    var bw = 13 - s * 2.5, bx = X + 1.5 + s * 1.5, bh = 11 + s2 * 2;
    oneBox(x, bx, Y + 15, bw, bh, 4.5, s, open);
    if (stack) { var w2 = bw - 2 - H(tx, ty, 103) * 2, x2 = bx + 1 + H(ty, tx, 104) * 1.5; shadow(x, x2 + w2 / 2 + 1, Y + 15 - bh + 4.5, w2 / 2, 1.2, 0.3); oneBox(x, x2, Y + 15 - bh + 4.6, w2, 8.5, 3.8, H(tx, ty, 105), H(tx, ty, 106) > 0.55); }
  }
  function houseCounter(x, m, tx, ty) {
    var X = tx * T, Y = ty * T;
    shadow(x, X + 8, Y + 15.5, 8.5, 1.4, 0.3);
    /* sage cupboards, brass knobs */
    x.fillStyle = lg(x, 0, Y + 5, 0, Y + T, [[0, "#9db097"], [1, "#7a8f76"]]); x.fillRect(X, Y + 5, T, T - 5);
    rr(x, X + 1.4, Y + 7, 6, 7.6, 0.5); x.strokeStyle = "rgba(40,60,40,.45)"; x.lineWidth = 0.4; x.stroke(); rr(x, X + 8.6, Y + 7, 6, 7.6, 0.5); x.stroke();
    ell(x, X + 6.4, Y + 10.6, 0.6, 0.6, "#d8b860"); ell(x, X + 9.6, Y + 10.6, 0.6, 0.6, "#d8b860");
    x.fillStyle = "rgba(20,30,20,.5)"; x.fillRect(X, Y + T - 1, T, 1);
    /* butcher-block top */
    for (var k = 0; k < 4; k++) { var cc = mix("#c08a52", "#d8a468", H(tx * 4 + k, ty, 41)); x.fillStyle = lg(x, 0, Y, 0, Y + 5, [[0, shade(cc, 0.1)], [1, shade(cc, -0.08)]]); x.fillRect(X + k * 4, Y, 4, 5.4); x.fillStyle = "rgba(80,40,10,.35)"; x.fillRect(X + k * 4 + 3.8, Y, 0.25, 5.4); }
    x.fillStyle = "#8a5a2e"; x.fillRect(X, Y + 5, T, 0.8); x.fillStyle = "rgba(255,240,210,.35)"; x.fillRect(X, Y, T, 0.4);
    /* what's on it */
    var spot = tx + "," + ty;
    if (spot === "18,2") { ["FLOUR", "SUGAR", "TEA"].forEach(function (w, i) { var cx = X + 3 + i * 4.8, h2 = 7 - i * 1.4; rr(x, cx - 2, Y + 3.5 - h2, 4, h2, 0.8, lg(x, cx - 2, 0, cx + 2, 0, [[0, "#f6efdc"], [1, "#d8cfb6"]])); rr(x, cx - 2.2, Y + 3.5 - h2 - 1, 4.4, 1.3, 0.5, "#b8322a"); x.fillStyle = "#6a2a20"; x.font = "bold 0.9px sans-serif"; x.textAlign = "center"; x.fillText(w, cx, Y + 3.5 - h2 / 2 + 0.6); }); }
    else if (spot === "19,2") { /* the sink, under the window */ rr(x, X + 2, Y + 0.6, 12, 4, 1.2, lg(x, 0, Y, 0, Y + 4.6, [[0, "#8e969a"], [1, "#d6dcde"]])); rr(x, X + 3, Y + 1.2, 10, 2.8, 1, "#6a7276"); x.strokeStyle = "#c8ced0"; x.lineWidth = 0.9; x.beginPath(); x.moveTo(X + 8, Y + 0.6); x.lineTo(X + 8, Y - 2.4); x.lineTo(X + 10, Y - 2.4); x.stroke(); ell(x, X + 8, Y + 3.2, 0.5, 0.3, "rgba(200,230,240,.8)"); }
    else if (spot === "20,2") { /* the kettle */ ell(x, X + 8, Y + 3.8, 5, 1.2, "rgba(30,15,5,.3)"); ell(x, X + 8, Y + 0.4, 4.4, 3.8, lg(x, X + 4, 0, X + 12, 0, [[0, "#e24a3a"], [0.4, "#ff7a62"], [1, "#9a2a20"]])); rr(x, X + 6.6, Y - 3.8, 2.8, 1.2, 0.5, "#2a2a2a"); x.strokeStyle = "#2a2a2a"; x.lineWidth = 0.6; x.beginPath(); x.arc(X + 8, Y - 1.4, 3.6, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); x.beginPath(); x.moveTo(X + 12, Y + 0.4); x.lineTo(X + 14.4, Y - 1.4); x.strokeStyle = "#c83a2a"; x.lineWidth = 1; x.stroke(); ell(x, X + 6.4, Y - 0.8, 1, 1.6, "rgba(255,255,255,.45)"); }
    else if (spot === "19,9") { /* plates, wrapped in newspaper */ for (var p = 0; p < 4; p++) rr(x, X + 2.5, Y + 3 - p * 1.6, 11, 1.8, 0.8, p % 2 ? "#e6e0d0" : "#d6d0c0"); x.fillStyle = "rgba(60,60,60,.35)"; x.fillRect(X + 4, Y - 2.4, 7, 0.3); x.fillRect(X + 4, Y - 0.8, 6, 0.3); }
    else if (spot === "20,9") { /* the cookie jar: an owl */ ell(x, X + 8, Y + 4, 4, 1, "rgba(30,15,5,.3)"); ell(x, X + 8, Y - 0.2, 3.8, 4.4, "#8a6a4a"); ell(x, X + 8, Y + 1, 2.6, 2.6, "#c8a878"); ell(x, X + 6.6, Y - 2.2, 1.2, 1.2, "#f4ecd8"); ell(x, X + 9.4, Y - 2.2, 1.2, 1.2, "#f4ecd8"); ell(x, X + 6.6, Y - 2.2, 0.5, 0.5, "#1a1410"); ell(x, X + 9.4, Y - 2.2, 0.5, 0.5, "#1a1410"); x.fillStyle = "#d89a3a"; x.beginPath(); x.moveTo(X + 7.4, Y - 1.2); x.lineTo(X + 8.6, Y - 1.2); x.lineTo(X + 8, Y - 0.2); x.fill(); }
    else if (spot === "21,9") { /* a radio, off */ rr(x, X + 2, Y - 3, 12, 7, 1.2, "#6a3a2a"); rr(x, X + 3, Y - 2, 6, 5, 0.6, "#d8c8a0"); x.fillStyle = "rgba(90,60,30,.5)"; for (var g2 = 0; g2 < 5; g2++) x.fillRect(X + 3.4, Y - 1.4 + g2, 5.2, 0.35); ell(x, X + 11.4, Y - 0.6, 1.3, 1.3, "#c8a040"); ell(x, X + 11.4, Y + 2.2, 0.8, 0.8, "#c8a040"); }
  }
  function houseFridge(x, X, Y) {
    shadow(x, X + 9, Y + 15.5, 8, 2, 0.4);
    rr(x, X + 0.6, Y - 9, 14.8, 24, 4, lg(x, X + 1, 0, X + 15, 0, [[0, "#fbf8ee"], [0.7, "#e4e0d2"], [1, "#bcb8aa"]]));
    x.fillStyle = "rgba(0,0,0,.18)"; x.fillRect(X + 0.6, Y - 1, 14.8, 0.5);
    rr(x, X + 12.2, Y - 6.4, 1.2, 4.6, 0.6, lg(x, X + 12, 0, X + 13.4, 0, [[0, "#f4f4f4"], [1, "#8a8a8a"]])); rr(x, X + 12.2, Y + 1.6, 1.2, 6, 0.6, lg(x, X + 12, 0, X + 13.4, 0, [[0, "#f4f4f4"], [1, "#8a8a8a"]]));
    x.fillStyle = "rgba(255,255,255,.55)"; rr(x, X + 1.6, Y - 8, 2, 21, 1, "rgba(255,255,255,.4)");
    /* a calendar, a child's drawing, magnets */
    rr(x, X + 4, Y + 1.2, 6, 7.4, 0.3, "#fbfaf4"); x.fillStyle = "#b8322a"; x.fillRect(X + 4, Y + 1.2, 6, 1.4);
    x.fillStyle = "rgba(60,60,60,.5)"; for (var r2 = 0; r2 < 4; r2++) for (var c2 = 0; c2 < 5; c2++) x.fillRect(X + 4.5 + c2 * 1.1, Y + 3.2 + r2 * 1.3, 0.5, 0.4);
    x.strokeStyle = "#d8322a"; x.lineWidth = 0.3; x.beginPath(); x.ellipse(X + 8.9, Y + 5.8, 0.8, 0.6, 0, 0, 6.3); x.stroke();
    rr(x, X + 3.6, Y - 6.8, 6.4, 5, 0.2, "#f4f0e2"); x.strokeStyle = "#e0a020"; x.lineWidth = 0.5; x.beginPath(); x.arc(X + 6, Y - 4.6, 1.2, 0, 6.3); x.stroke(); x.strokeStyle = "#3a8a3a"; x.beginPath(); x.moveTo(X + 4.2, Y - 2.4); x.lineTo(X + 9.6, Y - 2.4); x.stroke(); x.strokeStyle = "#3a6ab8"; x.beginPath(); x.moveTo(X + 8.2, Y - 2.4); x.lineTo(X + 8.2, Y - 5); x.lineTo(X + 9.4, Y - 4); x.stroke();
    ell(x, X + 6.8, Y - 6.8, 0.7, 0.7, "#e04a6a"); ell(x, X + 7, Y + 1.2, 0.7, 0.7, "#3a8ae0"); ell(x, X + 5, Y + 10.5, 0.9, 0.9, "#f0c040"); ell(x, X + 8.4, Y + 11.4, 0.8, 0.8, "#5ab868");
  }
  function houseTable(x, m, tx, ty) {
    var X = tx * T, Y = ty * T, lft = m.get(tx - 1, ty) !== TL.TABLE, rgt = m.get(tx + 1, ty) !== TL.TABLE, tp = m.get(tx, ty - 1) !== TL.TABLE, bt = m.get(tx, ty + 1) !== TL.TABLE;
    if (bt) shadow(x, X + 8, Y + 15.5, 9, 2.4, 0.38);
    var x0 = X + (lft ? 0.6 : 0), x1 = X + T - (rgt ? 0.6 : 0), y0 = Y + (tp ? 0.6 : 0), y1 = Y + T - (bt ? 3.4 : 0);
    /* gingham */
    x.fillStyle = "#f2efe6"; x.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (var gx = Math.floor(x0 / 2) * 2; gx < x1; gx += 2) for (var gy = Math.floor(y0 / 2) * 2; gy < y1; gy += 2) {
      var a = (gx / 2) % 2, b = (gy / 2) % 2; if (!a && !b) continue;
      x.fillStyle = a && b ? "rgba(46,90,150,.62)" : "rgba(46,90,150,.3)"; x.fillRect(Math.max(gx, x0), Math.max(gy, y0), Math.min(2, x1 - gx), Math.min(2, y1 - gy));
    }
    if (bt) { x.fillStyle = lg(x, 0, y1, 0, y1 + 3, [[0, "#d8d4c8"], [1, "#b8b4a8"]]); x.fillRect(x0, y1, x1 - x0, 3); x.fillStyle = "rgba(46,90,150,.45)"; for (var hx = Math.floor(x0); hx < x1; hx += 2) if ((hx / 2) % 2) x.fillRect(hx, y1, 1, 3); x.strokeStyle = "rgba(120,110,90,.6)"; x.lineWidth = 0.3; for (var w = x0 + 2; w < x1; w += 4) { x.beginPath(); x.moveTo(w, y1); x.lineTo(w + 0.5, y1 + 3); x.stroke(); } }
    if (lft && tp) { /* the teacup and saucer */ ell(x, X + 10, Y + 8, 3.2, 2.4, "#f6f2e8"); ell(x, X + 10, Y + 7.4, 2, 1.6, "#fbf9f2"); ell(x, X + 10, Y + 7.2, 1.4, 1, "#6a4224"); x.strokeStyle = "#f6f2e8"; x.lineWidth = 0.5; x.beginPath(); x.arc(X + 12.4, Y + 7.4, 0.7, -1.4, 1.4); x.stroke(); }
    if (rgt && tp) { /* a jar of garden flowers */ ell(x, X + 6, Y + 9.5, 2.4, 0.8, "rgba(30,20,10,.25)"); rr(x, X + 4.2, Y + 4.6, 3.6, 5, 1, "rgba(200,225,230,.7)"); [["#e8d040", -2.6, -1], ["#f4f0e8", -0.6, -2.4], ["#c860a0", 1.6, -1.4], ["#e8d040", 0.4, 0.4], ["#8ab0e0", -2, 1]].forEach(function (f) { x.strokeStyle = "#5a8a3a"; x.lineWidth = 0.3; x.beginPath(); x.moveTo(X + 6, Y + 5.2); x.lineTo(X + 6 + f[1], Y + 2 + f[2]); x.stroke(); ell(x, X + 6 + f[1], Y + 2 + f[2], 1, 1, f[0]); ell(x, X + 6 + f[1], Y + 2 + f[2], 0.35, 0.35, "#c88a20"); }); }
    if (lft && bt) { /* the newspaper, folded, from the day before the sale */ x.save(); x.translate(X + 7, Y + 6); x.rotate(-0.2); rr(x, -4, -2.6, 8, 5.2, 0.2, "#ebe6d6"); x.fillStyle = "rgba(40,40,40,.7)"; x.fillRect(-3.4, -2, 5, 0.6); x.fillStyle = "rgba(60,60,60,.4)"; for (var l = 0; l < 4; l++) x.fillRect(-3.4, -0.8 + l * 0.9, 6.6, 0.3); x.restore(); }
  }
  function houseChair(x, X, Y) {
    shadow(x, X + 8.5, Y + 13.5, 6, 2, 0.32);
    [[X + 3.6, Y + 12], [X + 12.4, Y + 12]].forEach(function (l) { x.fillStyle = "#5a3a20"; x.fillRect(l[0] - 0.5, l[1] - 2, 1, 3); });
    rr(x, X + 3, Y + 3.5, 10, 8, 1.6, lg(x, 0, Y + 3.5, 0, Y + 11.5, [[0, "#b07a48"], [1, "#7e5230"]]));
    rr(x, X + 4.4, Y + 4.6, 7.2, 5.6, 1.6, lg(x, 0, Y + 4.6, 0, Y + 10.2, [[0, "#d88a6a"], [1, "#b05a44"]]));          // the cushion
    x.fillStyle = "rgba(255,255,255,.25)"; ell(x, X + 6.6, Y + 5.6, 2, 0.6);
    /* the spindle back */
    rr(x, X + 2.6, Y - 3.6, 10.8, 2, 1, "#8a5a32");
    for (var s = 0; s < 4; s++) { x.fillStyle = "#7a4e2a"; x.fillRect(X + 4 + s * 2.6, Y - 1.8, 0.9, 5.4); }
  }
  function houseStairs(x, m, tx, ty) {
    var X = tx * T, Y = ty * T, s;
    for (s = 0; s < 4; s++) {
      var sy = Y + s * 4;
      x.fillStyle = lg(x, 0, sy, 0, sy + 4, [[0, "#c0915c"], [0.3, "#a87a48"], [0.75, "#7a5430"], [1, "#3e2814"]]); x.fillRect(X, sy, T, 4);
      x.fillStyle = "rgba(255,240,210,.25)"; x.fillRect(X, sy, T, 0.45);
    }
    /* a green runner up the middle, held by brass rods */
    var sx0 = 1 * T, sx1 = 6 * T, r0 = sx0 + (sx1 - sx0) * 0.24, r1 = sx0 + (sx1 - sx0) * 0.76;
    var a0 = Math.max(X, r0), a1 = Math.min(X + T, r1);
    if (a1 > a0) for (s = 0; s < 4; s++) {
      var y2 = Y + s * 4;
      x.fillStyle = lg(x, 0, y2, 0, y2 + 4, [[0, "#4e7a52"], [0.7, "#3a5e3e"], [1, "#22381f"]]); x.fillRect(a0, y2, a1 - a0, 4);
      x.fillStyle = "rgba(230,200,120,.5)"; if (a0 === r0) x.fillRect(a0 + 0.6, y2, 0.4, 4); if (a1 === r1) x.fillRect(a1 - 1, y2, 0.4, 4);
      x.fillStyle = lg(x, 0, y2 + 3, 0, y2 + 3.8, [[0, "#f0d27a"], [1, "#9a7a2a"]]); x.fillRect(a0 - (a0 === r0 ? 1 : 0), y2 + 3, (a1 - a0) + (a0 === r0 ? 1 : 0) + (a1 === r1 ? 1 : 0), 0.7);
    }
    /* the banister: rail and spindles */
    if (m.get(tx + 1, ty) !== TL.STAIRS) {
      x.fillStyle = "rgba(20,10,4,.3)"; x.fillRect(X + T - 3.4, Y, 1.2, T);
      for (s = 0; s < 4; s++) { x.fillStyle = lg(x, X + T - 2.4, 0, X + T - 1.2, 0, [[0, "#f2ead8"], [1, "#b8ae98"]]); x.fillRect(X + T - 2.4, Y + s * 4 + 0.5, 1.1, 3.2); }
      x.fillStyle = lg(x, X + T - 3, 0, X + T, 0, [[0, "#8a5a32"], [0.5, "#b07a48"], [1, "#5a3a1e"]]); x.fillRect(X + T - 3, Y, 3, 1.4);
      x.fillRect(X + T - 2.2, Y, 1.4, T);
      if (m.get(tx, ty + 1) !== TL.STAIRS) { rr(x, X + T - 3.4, Y + T - 6, 3.6, 6, 0.8, lg(x, X + T - 3.4, 0, X + T, 0, [[0, "#b07a48"], [1, "#5a3a1e"]])); ell(x, X + T - 1.6, Y + T - 6.4, 2, 1.4, "#c8925a"); }
    }
  }
  function houseWallFace(x, m, tx, ty) {
    var X = tx * T, Y = ty * T, k;
    /* wallpaper: a cream stripe with little sprigs */
    x.fillStyle = lg(x, 0, Y, 0, Y + T, [[0, "#ecdfc0"], [1, "#d6c6a0"]]); x.fillRect(X, Y, T, T);
    for (k = 0; k < 4; k++) { x.fillStyle = "rgba(170,140,90,.16)"; x.fillRect(X + k * 4 + 1.2, Y + 2, 1.4, T - 6); }
    for (k = 0; k < 4; k++) { var fx = X + k * 4 + 3, fy = Y + 4 + (k % 2) * 4; ell(x, fx, fy, 0.7, 0.9, "rgba(190,110,100,.4)"); x.strokeStyle = "rgba(110,140,90,.45)"; x.lineWidth = 0.3; x.beginPath(); x.moveTo(fx, fy + 0.8); x.lineTo(fx - 0.6, fy + 2.2); x.stroke(); }
    /* crown molding, picture rail, the skirting */
    x.fillStyle = lg(x, 0, Y, 0, Y + 2, [[0, "#4e3622"], [1, "#7a5a3a"]]); x.fillRect(X, Y, T, 2); x.fillStyle = "rgba(255,240,210,.3)"; x.fillRect(X, Y + 2, T, 0.4);
    x.fillStyle = "#8a6a46"; x.fillRect(X, Y + T - 3.6, T, 3.6); x.fillStyle = "#b08a60"; x.fillRect(X, Y + T - 3.6, T, 0.6); x.fillStyle = "rgba(30,15,5,.4)"; x.fillRect(X, Y + T - 0.5, T, 0.5);
    if (m.pale && m.pale.some(function (p) { return p[0] === tx; }) && ty <= 1) { rr(x, X + 3, Y + 3.5, 10, 7.5, 0.3, "rgba(252,247,232,.9)"); x.strokeStyle = "rgba(150,120,80,.25)"; x.lineWidth = 0.3; x.strokeRect(X + 3, Y + 3.5, 10, 7.5); ell(x, X + 8, Y + 3.2, 0.4, 0.4, "rgba(80,60,40,.6)"); }
    if (m.hook && m.hook.x === tx && ty <= 1) { rr(x, X + 3.5, Y + 2.5, 9, 9, 0.3, "rgba(252,247,232,.9)"); ell(x, X + 8, Y + 3.4, 0.7, 0.7, "#d8b048"); x.strokeStyle = "#a88028"; x.lineWidth = 0.4; x.beginPath(); x.arc(X + 8, Y + 4.4, 0.8, 0, Math.PI); x.stroke(); }
  }
  function houseWindow(x, X, Y, kitchen) {
    rr(x, X + 1.2, Y + 1.6, T - 2.4, T - 4.2, 0.8, "#f2ead6");
    x.fillStyle = lg(x, 0, Y + 3, 0, Y + T - 4, [[0, "#cfe8f2"], [0.6, "#eaf4e0"], [1, "#9ec27a"]]); x.fillRect(X + 2.6, Y + 3, T - 5.2, T - 7);
    x.fillStyle = "rgba(255,255,255,.5)"; x.beginPath(); x.moveTo(X + 3, Y + 9); x.lineTo(X + 7, Y + 3.2); x.lineTo(X + 8.6, Y + 3.2); x.lineTo(X + 4.6, Y + 9); x.fill();
    x.fillStyle = "#e4dac2"; x.fillRect(X + 7.6, Y + 3, 0.8, T - 7); x.fillRect(X + 2.6, Y + 6.8, T - 5.2, 0.8);
    /* curtains, tied back */
    var cc = kitchen ? ["#e8eef6", "rgba(60,110,170,.55)"] : ["#e8c8b0", "rgba(180,90,70,.4)"];
    [[X + 0.6, 1], [X + T - 3.6, -1]].forEach(function (c) { x.fillStyle = lg(x, c[0], 0, c[0] + 3, 0, [[0, cc[0]], [1, shade("#c8b090", -0.1)]]); x.beginPath(); x.moveTo(c[0], Y + 1); x.lineTo(c[0] + 3, Y + 1); x.quadraticCurveTo(c[0] + 1.5 + c[1], Y + 7, c[0] + 3, Y + 12); x.lineTo(c[0], Y + 12); x.fill(); x.fillStyle = cc[1]; for (var d = 0; d < 3; d++) x.fillRect(c[0] + 0.4 + d, Y + 1, 0.3, 11); });
    rr(x, X + 0.4, Y + T - 3.2, T - 0.8, 1.8, 0.5, "#c8b896");
    if (kitchen) { /* a pot of basil on the sill */ rr(x, X + 10, Y + T - 6, 3.4, 3, 0.4, "#c0623a"); for (var b = 0; b < 6; b++) ell(x, X + 10.6 + (b % 3) * 1.1, Y + T - 7 - (b >> 1) * 0.8, 0.9, 0.6, b % 2 ? "#4a8a2a" : "#6aaa3a"); }
  }
  /* interiors: wood, tile, stone — tidier, but lit the same way */
  /* ---------------- the shed ----------------
     "A hot dry brown smell — cut grass and engine oil and sun-baked dust."
     Old planks gone silver, the sun coming through the gaps in the boards
     in thin bright blades across the floor; every tool on its nail in
     front of the outline Gran painted for it, so you'd know what was
     missing; the bench, the mower, the barrow with the flat. */
  function shedFloor(x, m, tx, ty) {
    var X = tx * T, Y = ty * T, rs = R(tx * 71 + ty * 13);
    /* planks running front to back, each its own gray-brown, butted at staggered joints */
    for (var p = 0; p < 3; p++) {
      var px = X + p * 5.33, col = ((tx * 3 + p) * 7) % 5, base = mix("#5e4a34", "#7a6246", (col / 4) * 0.7 + H(tx * 3 + p, 0, 5) * 0.3);
      x.fillStyle = lg(x, px, 0, px + 5.33, 0, [[0, shade(base, 0.08)], [0.5, base], [1, shade(base, -0.12)]]); x.fillRect(px, Y, 5.33, T);
      for (var g = 0; g < 3; g++) { x.strokeStyle = "rgba(60,40,22," + (0.12 + rs() * 0.12) + ")"; x.lineWidth = 0.25; x.beginPath(); var gx = px + 0.8 + rs() * 3.8; x.moveTo(gx, Y); x.bezierCurveTo(gx + (rs() - 0.5) * 1.2, Y + 5, gx + (rs() - 0.5) * 1.2, Y + 11, gx + (rs() - 0.5) * 0.8, Y + T); x.stroke(); }
      x.fillStyle = "rgba(30,20,10,.55)"; x.fillRect(px + 5.0, Y, 0.33, T);
      var jy = ((tx * 3 + p) * 5 + ty * 3) % 7;
      if (jy < 2) { x.fillStyle = "rgba(30,20,10,.5)"; x.fillRect(px, Y + 4 + jy * 5, 5, 0.35); x.fillStyle = "#3a3026"; ell(x, px + 1, Y + 5 + jy * 5, 0.3, 0.3); x.fill(); ell(x, px + 4, Y + 5 + jy * 5, 0.3, 0.3); x.fill(); }
      if (rs() < 0.18) { var kx = px + 1.5 + rs() * 2.3, ky = Y + 2 + rs() * 12; ell(x, kx, ky, 0.9, 1.3, "rgba(70,46,24,.5)"); x.strokeStyle = "rgba(70,46,24,.3)"; x.lineWidth = 0.2; ell(x, kx, ky, 1.5, 2.1); x.stroke(); }
    }
    /* what a shed floor gathers: grass clippings, sawdust, a bent nail */
    for (var k = 0; k < 14; k++) { var cx = X + rs() * 16, cy = Y + rs() * 16; if (rs() < 0.55) { x.strokeStyle = rs() < 0.6 ? "rgba(140,150,70,.55)" : "rgba(170,160,90,.5)"; x.lineWidth = 0.35; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + (rs() - 0.5) * 2.4, cy + (rs() - 0.5) * 1.2); x.stroke(); } else ell(x, cx, cy, 0.35 + rs() * 0.4, 0.25, "rgba(230,200,150,.45)"); }
    if (H(tx, ty, 404) < 0.08) { x.strokeStyle = "#8a8c8e"; x.lineWidth = 0.35; x.beginPath(); x.moveTo(X + 6, Y + 9); x.lineTo(X + 8.4, Y + 9.6); x.lineTo(X + 9, Y + 8.4); x.stroke(); }
    /* the oil the mower has wept onto the boards for forty summers */
    if (tx === 1 && ty === 3 || tx === 2 && ty === 3) { x.fillStyle = rg(x, 2 * T + 2, 4 * T - 2, 1, 9, [[0, "rgba(20,16,12,.55)"], [0.7, "rgba(30,24,18,.3)"], [1, "rgba(30,24,18,0)"]]); x.fillRect(X, Y, T, T); }
    /* a ring where a paint can stood */
    if (tx === 6 && ty === 6) { x.strokeStyle = "rgba(220,214,190,.35)"; x.lineWidth = 0.8; ell(x, X + 7, Y + 8, 3.6, 3); x.stroke(); }
    /* the walls' shadow, lying along the floor at their foot */
    var wl = m.get(tx - 1, ty) === TL.BWALL, wr = m.get(tx + 1, ty) === TL.BWALL, wu = m.get(tx, ty - 1) === TL.BWALL || m.get(tx, ty - 1) === TL.TOOLS || m.get(tx, ty - 1) === TL.BENCH;
    if (wl) { x.fillStyle = lg(x, X, 0, X + 6, 0, [[0, "rgba(20,12,6,.45)"], [1, "rgba(20,12,6,0)"]]); x.fillRect(X, Y, 6, T); }
    if (wr) { x.fillStyle = lg(x, X + T, 0, X + T - 3, 0, [[0, "rgba(20,12,6,.35)"], [1, "rgba(20,12,6,0)"]]); x.fillRect(X + T - 3, Y, 3, T); }
    if (wu) { x.fillStyle = lg(x, 0, Y, 0, Y + 5, [[0, "rgba(20,12,6,.4)"], [1, "rgba(20,12,6,0)"]]); x.fillRect(X, Y, T, 5); }
  }
  /* sun through the gaps in the west boards: long thin bright blades laid
     across the floor, a little dust caught in each */
  function shedSun(x, m) {
    x.save(); x.globalCompositeOperation = "lighter";
    x.beginPath(); x.rect(T, 2 * T, (m.w - 2) * T, (m.h - 3) * T); x.clip();
    [[2.4, 3.2], [4.3, 2], [5.9, 4], [7.4, 1.6]].forEach(function (b, i) {
      var y0 = b[0] * T, w = b[1], x1 = (m.w - 1) * T;
      var g = x.createLinearGradient(T, 0, x1, 0);
      g.addColorStop(0, "rgba(255,206,130,.2)"); g.addColorStop(0.6, "rgba(255,200,120,.08)"); g.addColorStop(1, "rgba(255,196,120,0)");
      x.fillStyle = g; x.filter = "blur(1.2px)";
      x.beginPath(); x.moveTo(T, y0); x.lineTo(T, y0 + w); x.lineTo(x1, y0 + w * 2.4 + 12); x.lineTo(x1, y0 + 12); x.closePath(); x.fill();
      x.filter = "none";
    });
    x.restore();
  }
  function shedBoards(x, X, Y, w, h, seed, silver) {
    for (var b = 0; b < w / 4; b++) {
      var bx = X + b * 4, c0 = mix(silver ? "#6a6252" : "#6e5a42", silver ? "#867c68" : "#8a7254", H(Math.floor(bx / 4), seed, 91));
      x.fillStyle = lg(x, bx, 0, bx + 4, 0, [[0, shade(c0, 0.14)], [0.6, c0], [1, shade(c0, -0.2)]]); x.fillRect(bx, Y, 4, h);
      for (var g = 0; g < 2; g++) { x.strokeStyle = "rgba(50,40,30,.2)"; x.lineWidth = 0.25; var gx = bx + 1 + H(bx, g, seed) * 2; x.beginPath(); x.moveTo(gx, Y); x.quadraticCurveTo(gx + 0.6, Y + h / 2, gx - 0.2, Y + h); x.stroke(); }
      x.fillStyle = "#2a241c"; x.fillRect(bx + 3.7, Y, 0.3, h);
      if (H(Math.floor(bx / 4), seed, 92) > 0.82) { x.fillStyle = "rgba(255,226,150,.85)"; x.fillRect(bx + 3.72, Y, 0.28, h); }
      if (H(Math.floor(bx / 4), seed, 93) > 0.7) ell(x, bx + 2, Y + h * (0.3 + H(bx, seed, 94) * 0.4), 0.7, 1, "rgba(60,44,26,.5)");
    }
  }
  function shedStand(x, m, tx, ty) {
    var t = m.get(tx, ty), X = tx * T, Y = ty * T;
    if (t === TL.BWALL) {
      /* the wall's top, seen from above: one long heavy plate, dark where it
         meets the outside, a lit edge along the inside */
      var inL = m.get(tx + 1, ty) >= 0 && m.get(tx + 1, ty) !== TL.BWALL, inR = m.get(tx - 1, ty) >= 0 && m.get(tx - 1, ty) !== TL.BWALL;
      var inD = m.get(tx, ty + 1) >= 0 && m.get(tx, ty + 1) !== TL.BWALL, inU = m.get(tx, ty - 1) >= 0 && m.get(tx, ty - 1) !== TL.BWALL;
      var vert = tx === 0 || tx === m.w - 1;
      x.fillStyle = vert ? lg(x, X, 0, X + T, 0, [[0, tx === 0 ? "#3a2e22" : "#6a5640"], [1, tx === 0 ? "#6a5640" : "#3a2e22"]]) : lg(x, 0, Y, 0, Y + T, [[0, ty === 0 ? "#3a2e22" : "#6a5640"], [1, ty === 0 ? "#6a5640" : "#3a2e22"]]);
      x.fillRect(X, Y, T, T);
      x.strokeStyle = "rgba(30,20,12,.35)"; x.lineWidth = 0.3;
      for (var g = 2; g < 15; g += 3.4) { x.beginPath(); if (vert) { x.moveTo(X + g, Y); x.lineTo(X + g + 0.2, Y + T); } else { x.moveTo(X, Y + g); x.lineTo(X + T, Y + g + 0.2); } x.stroke(); }
      x.fillStyle = "rgba(255,236,200,.22)";
      if (inL) x.fillRect(X + T - 0.8, Y, 0.8, T); if (inR) x.fillRect(X, Y, 0.8, T); if (inD) x.fillRect(X, Y + T - 0.8, T, 0.8); if (inU) x.fillRect(X, Y, T, 0.8);
      x.fillStyle = "#1a120a"; if (tx === 0) x.fillRect(X, Y, 0.8, T); if (tx === m.w - 1) x.fillRect(X + T - 0.8, Y, 0.8, T); if (ty === 0) x.fillRect(X, Y, T, 0.8); if (ty === m.h - 1) x.fillRect(X, Y + T - 0.8, T, 0.8);
      if (H(tx, ty, 77) < 0.35) ell(x, X + 3 + H(tx, ty, 78) * 10, Y + 3 + H(tx, ty, 79) * 10, 0.45, 0.45, "#2a2420");
      /* cobweb in the corners */
      var corner = (tx === 0 || tx === m.w - 1) && (ty === 1 || ty === m.h - 2);
      if (corner) cobweb(x, tx === 0 ? X + T : X, ty === 1 ? Y : Y + T, tx === 0 ? 1 : -1, ty === 1 ? 1 : -1, 9);
      return true;
    }
    if (t === TL.TOOLS) {
      shedBoards(x, X, Y - 2, T, T, 7, true);
      x.fillStyle = "rgba(40,30,20,.25)"; x.fillRect(X, Y + T - 3.2, T, 1.2);                // a rail
      var k = tx;
      /* the outline Gran painted for each tool, a little bigger than the tool */
      function outline(fn) { x.save(); x.strokeStyle = "rgba(240,232,206,.55)"; x.lineWidth = 0.9; x.lineJoin = "round"; fn(); x.stroke(); x.restore(); }
      function nail(nx, ny) { ell(x, nx, ny, 0.45, 0.45, "#4a4a4c"); ell(x, nx - 0.15, ny - 0.15, 0.18, 0.18, "#c8c8cc"); }
      function shadowed(fn) { x.save(); x.translate(0.7, 0.9); x.globalAlpha = 0.35; fn("#1a120a"); x.restore(); fn(null); }
      if (k === 1) {        /* the handsaw */
        outline(function () { x.beginPath(); x.moveTo(X + 3, Y + 1); x.lineTo(X + 7, Y + 1); x.lineTo(X + 12.5, Y + 12); x.lineTo(X + 9, Y + 12.5); x.closePath(); });
        shadowed(function (c) { x.fillStyle = c || lg(x, X + 5, 0, X + 12, 0, [[0, "#c8ccd0"], [1, "#8a9096"]]); x.beginPath(); x.moveTo(X + 5, Y + 4); x.lineTo(X + 7, Y + 3.6); x.lineTo(X + 12, Y + 11.6); x.lineTo(X + 9.6, Y + 12); x.closePath(); x.fill(); x.fillStyle = c || "#8a4a26"; rr(x, X + 3.4, Y + 1.2, 4, 3.6, 1, x.fillStyle); });
        x.strokeStyle = "rgba(60,60,64,.6)"; x.lineWidth = 0.25; x.beginPath(); for (var z = 0; z < 8; z++) { x.moveTo(X + 9.8 + z * 0.3, Y + 11.8 - z * 1.0); x.lineTo(X + 9.4 + z * 0.3, Y + 11.3 - z * 1.0); } x.stroke();
        nail(X + 5.4, Y + 2.2);
      } else if (k === 2) { /* bungee cords on a peg */
        rr(x, X + 7, Y + 1.4, 2, 1.6, 0.4, "#6a4a2a");
        [["#d84a3a", -2], ["#f0c040", 0], ["#3a7ac0", 2]].forEach(function (b2) {
          x.strokeStyle = b2[0]; x.lineWidth = 0.9; x.beginPath(); x.moveTo(X + 8 + b2[1] * 0.3, Y + 2.6); x.bezierCurveTo(X + 4 + b2[1], Y + 6, X + 5 + b2[1], Y + 11, X + 8 + b2[1] * 0.5, Y + 12); x.stroke();
          x.strokeStyle = "#9a9ca0"; x.lineWidth = 0.4; x.beginPath(); x.arc(X + 8 + b2[1] * 0.5, Y + 12.8, 0.8, 0, 3.2); x.stroke();
        });
      } else if (k === 3) { /* hammer and pliers */
        outline(function () { x.rect(X + 2.4, Y + 1.2, 6.2, 2.6); x.rect(X + 4.6, Y + 3.8, 1.8, 8.6); x.moveTo(X + 11, Y + 2); x.lineTo(X + 13.6, Y + 2); x.lineTo(X + 14, Y + 12); x.lineTo(X + 10.6, Y + 12); x.closePath(); });
        shadowed(function (c) { x.fillStyle = c || "#7a5232"; x.fillRect(X + 5, Y + 3.6, 1, 8.4); x.fillStyle = c || lg(x, 0, Y + 1.6, 0, Y + 3.6, [[0, "#b0b4b8"], [1, "#5a5e62"]]); x.fillRect(X + 2.8, Y + 1.6, 5.4, 1.9); x.fillStyle = c || "#c03a2a"; x.fillRect(X + 11, Y + 6, 1, 6); x.fillRect(X + 12.8, Y + 6, 1, 6); x.fillStyle = c || "#7a7e84"; x.fillRect(X + 11.6, Y + 2.2, 1.6, 4); });
        nail(X + 5.5, Y + 2.5); nail(X + 12.4, Y + 2.6);
      } else if (k === 4) { /* the shears */
        outline(function () { x.moveTo(X + 8, Y + 1); x.lineTo(X + 11, Y + 6); x.lineTo(X + 9, Y + 13); x.lineTo(X + 7, Y + 13); x.lineTo(X + 5, Y + 6); x.closePath(); });
        shadowed(function (c) { x.fillStyle = c || "#8a9096"; x.beginPath(); x.moveTo(X + 7.4, Y + 1.6); x.lineTo(X + 8.6, Y + 1.6); x.lineTo(X + 9, Y + 6.4); x.lineTo(X + 7, Y + 6.4); x.closePath(); x.fill(); x.fillStyle = c || "#3a6a3a"; x.fillRect(X + 6, Y + 6.4, 1.3, 6.4); x.fillRect(X + 8.7, Y + 6.4, 1.3, 6.4); });
        ell(x, X + 8, Y + 6.4, 0.6, 0.6, "#c8a040"); nail(X + 8, Y + 1.2);
      } else if (k === 5) { /* a coil of Gran's stiff wire, and one of rope */
        x.strokeStyle = "#9ea2a6"; x.lineWidth = 0.45; for (var c2 = 0; c2 < 6; c2++) { x.beginPath(); x.ellipse(X + 5, Y + 7 + c2 * 0.15, 3.4 - c2 * 0.08, 3.9, 0.15, 0, 6.2832); x.stroke(); }
        x.strokeStyle = "#c8a874"; x.lineWidth = 1; for (c2 = 0; c2 < 4; c2++) { x.beginPath(); x.ellipse(X + 11.6, Y + 7.6 + c2 * 0.3, 2.6, 3.6 - c2 * 0.2, -0.1, 0, 6.2832); x.stroke(); }
        nail(X + 5, Y + 3); nail(X + 11.6, Y + 3.8);
      } else if (k === 6) { /* trowel and hand fork */
        outline(function () { x.rect(X + 2.6, Y + 1, 3.6, 12); x.rect(X + 9.2, Y + 1, 3.6, 12); });
        shadowed(function (c) { x.fillStyle = c || "#7a5232"; rr(x, X + 3.6, Y + 1.4, 1.6, 4.6, 0.6, x.fillStyle); x.fillStyle = c || "#9aa0a6"; x.beginPath(); x.moveTo(X + 3.2, Y + 6); x.lineTo(X + 5.6, Y + 6); x.quadraticCurveTo(X + 5.6, Y + 11, X + 4.4, Y + 12.6); x.quadraticCurveTo(X + 3.2, Y + 11, X + 3.2, Y + 6); x.fill(); x.fillStyle = c || "#7a5232"; rr(x, X + 10.2, Y + 1.4, 1.6, 4.6, 0.6, x.fillStyle); x.fillStyle = c || "#9aa0a6"; for (var f = 0; f < 3; f++) x.fillRect(X + 9.8 + f * 1.1, Y + 6, 0.6, 6.4); });
        nail(X + 4.4, Y + 1.6); nail(X + 11, Y + 1.6);
      } else if (k === 7) { /* the hoe, the tallest thing, and its outline that goes to the top */
        outline(function () { x.rect(X + 6.6, Y - 1, 2.6, 14); x.rect(X + 4.4, Y + 10.4, 7, 2.6); });
        shadowed(function (c) { x.fillStyle = c || "#8a6040"; x.fillRect(X + 7.3, Y - 1, 1.2, 12); x.fillStyle = c || lg(x, X + 4.6, 0, X + 11, 0, [[0, "#9aa0a6"], [1, "#5a6066"]]); x.fillRect(X + 4.8, Y + 10.8, 6.2, 1.8); });
        /* and one outline with nothing in it at all */
        outline(function () { x.rect(X + 11.6, Y + 1.4, 3, 8); });
        nail(X + 7.9, Y + 0.4); nail(X + 13.1, Y + 2.2);
      }
      x.fillStyle = "#3a2a1a"; x.fillRect(X, Y + T - 2, T, 2);
      x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(X, Y + T, T, 1.2);
      return true;
    }
    if (t === TL.BENCH) {
      var top = ty === 1;
      shadow(x, X + 9, Y + 15, 9, 2.5, 0.4);
      /* the legs, the shelf under, then the thick scarred top */
      x.fillStyle = "#3a2a18"; x.fillRect(X + 1, Y + 9, 1.8, 6); x.fillRect(X + 13.2, Y + 9, 1.8, 6);
      x.fillStyle = "rgba(20,12,6,.5)"; x.fillRect(X + 1, Y + 12.6, 14, 1.4);
      rr(x, X - 0.3, Y + 2, T + 0.6, 7.6, 0.6, lg(x, 0, Y + 2, 0, Y + 9.6, [[0, "#b08658"], [0.7, "#8a6440"], [1, "#5a3e24"]]));
      x.fillStyle = "rgba(255,236,200,.25)"; x.fillRect(X, Y + 2.2, T, 0.5);
      x.strokeStyle = "rgba(60,40,20,.3)"; x.lineWidth = 0.3; x.beginPath(); x.moveTo(X + 2, Y + 4); x.lineTo(X + 7, Y + 5.4); x.moveTo(X + 9, Y + 3.6); x.lineTo(X + 13, Y + 4.4); x.stroke();
      ell(x, X + 6 + H(tx, ty, 3) * 4, Y + 6, 1.6, 0.8, "rgba(40,30,20,.25)");
      if (tx === 8 && top) {
        /* a coffee can of bent nails */
        rr(x, X + 1.4, Y - 1, 4.2, 5.4, 0.6, lg(x, X + 1.4, 0, X + 5.6, 0, [[0, "#c8cac6"], [0.5, "#9a9c98"], [1, "#5e605c"]]));
        ell(x, X + 3.5, Y - 1, 2.1, 0.7, "#2a2826"); for (var n = 0; n < 5; n++) { x.strokeStyle = "#8a8c8e"; x.lineWidth = 0.3; x.beginPath(); x.moveTo(X + 2.4 + n * 0.5, Y - 1); x.lineTo(X + 2 + n * 0.6, Y - 2.6 - (n % 2)); x.stroke(); }
        x.fillStyle = "#c04a2a"; x.fillRect(X + 1.4, Y + 1, 4.2, 1.2);
      }
      if (tx === 9 && top) {
        /* a radio with no knobs */
        rr(x, X + 2, Y - 1.4, 10, 5.6, 1, lg(x, 0, Y - 1.4, 0, Y + 4.2, [[0, "#6a5a48"], [1, "#3a3028"]]));
        rr(x, X + 2.8, Y - 0.6, 5, 4, 0.6, "#c8b88a"); for (var gq = 0; gq < 5; gq++) { x.fillStyle = "rgba(60,50,40,.5)"; x.fillRect(X + 3.2, Y - 0.2 + gq * 0.8, 4.2, 0.3); }
        ell(x, X + 9.6, Y + 0.6, 0.7, 0.7, "#2a2420"); ell(x, X + 9.6, Y + 2.6, 0.7, 0.7, "#2a2420");
        x.strokeStyle = "#8a8c8e"; x.lineWidth = 0.3; x.beginPath(); x.moveTo(X + 11, Y - 1.2); x.lineTo(X + 14.5, Y - 5); x.stroke();
      }
      if (!top) {
        /* the vise, and a jar of screws */
        rr(x, X + 1, Y + 0.6, 5, 3, 0.4, "#3a5a7a"); x.fillStyle = "#9a9ca0"; x.fillRect(X + 2.6, Y - 0.4, 1.8, 1.2); x.fillRect(X + 3.3, Y + 3.4, 0.5, 2.4);
        rr(x, X + 9.6, Y - 0.6, 3.6, 4.4, 1, "rgba(200,220,220,.55)"); rr(x, X + 9.6, Y - 1.2, 3.6, 1, 0.3, "#b8862a");
        for (var sc = 0; sc < 6; sc++) ell(x, X + 10.3 + (sc % 3) * 1.1, Y + 1.6 + Math.floor(sc / 3) * 1.1, 0.4, 0.3, "#8a8c8e");
      }
      return true;
    }
    if (t === TL.MOWER) {
      /* the push mower: a reel of blades between two wheels, and the long handle */
      shadow(x, X + 10, Y + 14.6, 9, 2.4, 0.42);
      x.strokeStyle = "#5a5e62"; x.lineWidth = 1; x.beginPath(); x.moveTo(X + 4, Y + 9); x.lineTo(X + 9, Y - 4); x.moveTo(X + 13, Y + 9); x.lineTo(X + 9, Y - 4); x.stroke();
      x.strokeStyle = "#3a2a1a"; x.lineWidth = 1.4; x.beginPath(); x.moveTo(X + 6, Y - 4); x.lineTo(X + 12, Y - 4); x.stroke();
      rr(x, X + 3, Y + 7.6, 11, 4.6, 2.2, lg(x, 0, Y + 7.6, 0, Y + 12.2, [[0, "#4e8a4e"], [1, "#24482a"]]));
      x.strokeStyle = "rgba(220,230,230,.55)"; x.lineWidth = 0.35; for (var bl = 0; bl < 5; bl++) { x.beginPath(); x.moveTo(X + 4 + bl * 2, Y + 8); x.lineTo(X + 5.4 + bl * 2, Y + 12); x.stroke(); }
      [[X + 2.6, Y + 10.4], [X + 14.4, Y + 10.4]].forEach(function (w) { ell(x, w[0], w[1], 2.4, 3, "#1c1a18"); ell(x, w[0], w[1], 1.1, 1.4, "#c8b048"); });
      for (bl = 0; bl < 6; bl++) ell(x, X + 4 + bl * 1.8, Y + 12.6, 0.7, 0.3, "rgba(140,170,80,.6)");
      return true;
    }
    if (t === TL.BARROW) {
      /* the wheelbarrow, its one tire gone flat and baggy */
      shadow(x, X + 9, Y + 14.8, 8, 2.2, 0.42);
      x.strokeStyle = "#3a2a1a"; x.lineWidth = 0.9; x.beginPath(); x.moveTo(X + 13, Y + 4.6); x.lineTo(X + 17.5, Y + 2.6); x.moveTo(X + 13, Y + 10); x.lineTo(X + 17.5, Y + 11.4); x.stroke();
      x.fillStyle = lg(x, 0, Y + 3, 0, Y + 12, [[0, "#5a8ab0"], [0.6, "#3a6a8e"], [1, "#264a66"]]);
      x.beginPath(); x.moveTo(X + 2, Y + 3.4); x.lineTo(X + 14, Y + 3.4); x.lineTo(X + 12.6, Y + 11.6); x.lineTo(X + 4, Y + 11.6); x.closePath(); x.fill();
      x.fillStyle = "rgba(20,30,40,.45)"; x.beginPath(); x.moveTo(X + 3.4, Y + 4.4); x.lineTo(X + 12.8, Y + 4.4); x.lineTo(X + 11.8, Y + 10.4); x.lineTo(X + 4.8, Y + 10.4); x.closePath(); x.fill();
      x.fillStyle = "rgba(160,120,70,.45)"; ell(x, X + 8, Y + 9, 3, 1.2, null); x.fill();
      ell(x, X + 6, Y + 6, 1.8, 0.7, "rgba(170,90,40,.5)"); ell(x, X + 11, Y + 8, 1.2, 0.5, "rgba(170,90,40,.45)");    // rust
      x.fillStyle = "#1c1a18"; x.beginPath(); x.ellipse(X + 0.6, Y + 9.6, 2.4, 2.2, 0, 0, 6.2832); x.fill();
      x.fillStyle = "#2a2826"; x.beginPath(); x.ellipse(X + 0.6, Y + 11.4, 3, 1, 0, 0, 6.2832); x.fill();          // the flat, puddled under its rim
      ell(x, X + 0.6, Y + 9.4, 0.8, 0.8, "#8a8c8e");
      return true;
    }
    return false;
  }
  function cobweb(x, cx, cy, sx, sy, r) {
    x.save(); x.strokeStyle = "rgba(240,236,224,.38)"; x.lineWidth = 0.22;
    for (var a = 0; a <= 4; a++) { var th = a / 4 * Math.PI / 2; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(th) * r * sx, cy + Math.sin(th) * r * sy); x.stroke(); }
    for (var ring = 1; ring <= 4; ring++) { var rr2 = r * ring / 4.4; x.beginPath(); for (a = 0; a <= 4; a++) { var th2 = a / 4 * Math.PI / 2, px = cx + Math.cos(th2) * rr2 * sx, py = cy + Math.sin(th2) * rr2 * sy; if (a) x.quadraticCurveTo(cx + Math.cos(th2 - 0.2) * rr2 * 0.86 * sx, cy + Math.sin(th2 - 0.2) * rr2 * 0.86 * sy, px, py); else x.moveTo(px, py); } x.stroke(); }
    x.restore();
  }
  BS.cobweb = cobweb;

  /* small things that come and go: the scooter under its felt of cobweb,
     Gran's lantern on the bench */
  BS.paintScooter = function (webbed) {
    var c = wc(26, 26, SPR), x = c.x;
    shadow(x, 14, 23, 11, 2.4, 0.42);
    /* the deck, lying a little skewed, its grip tape worn pale in the middle */
    x.save(); x.translate(13, 19); x.rotate(-0.08);
    rr(x, -10, -2.2, 20, 4.4, 2, lg(x, 0, -2.2, 0, 2.2, [[0, "#d8473a"], [1, "#8a2a22"]]));
    rr(x, -8.6, -1.6, 15, 2.6, 1.2, "#2a2a2c"); ell(x, -1, -0.4, 4, 0.9, "rgba(140,140,140,.35)");
    ell(x, -10.4, 1.6, 2.2, 2.2, "#1c1a18"); ell(x, -10.4, 1.6, 0.9, 0.9, "#c8c8c0");
    ell(x, 10.6, 1.6, 2.2, 2.2, "#1c1a18"); ell(x, 10.6, 1.6, 0.9, 0.9, "#c8c8c0");
    /* chips in the red, down to the metal */
    ell(x, 4, 1.6, 0.8, 0.4, "#c8c8c0"); ell(x, -6, 1.8, 0.5, 0.3, "#c8c8c0");
    x.restore();
    /* the stem and the T of the handlebar */
    x.strokeStyle = "#5a5e62"; x.lineWidth = 1.4; x.beginPath(); x.moveTo(22.6, 19); x.lineTo(21.4, 3.6); x.stroke();
    x.strokeStyle = "#c8ccd0"; x.lineWidth = 0.4; x.beginPath(); x.moveTo(22.2, 18.6); x.lineTo(21, 4); x.stroke();
    x.strokeStyle = "#5a5e62"; x.lineWidth = 1.2; x.beginPath(); x.moveTo(16.6, 3.2); x.lineTo(26, 4); x.stroke();
    rr(x, 15.6, 2.2, 3, 2, 0.8, "#1c1a18"); rr(x, 24, 3, 3, 2, 0.8, "#1c1a18");
    if (webbed) {
      /* a fall of cobweb gone thick as felt, from the bar to the deck */
      x.fillStyle = "rgba(236,232,222,.5)";
      x.beginPath(); x.moveTo(16.4, 3.4); x.quadraticCurveTo(15, 10, 10, 17.4); x.lineTo(20, 18); x.quadraticCurveTo(21.6, 10, 26, 4.2); x.quadraticCurveTo(21, 6, 16.4, 3.4); x.fill();
      x.strokeStyle = "rgba(250,248,240,.55)"; x.lineWidth = 0.18;
      for (var i = 0; i < 9; i++) { x.beginPath(); x.moveTo(17 + i * 1, 3.6 + i * 0.08); x.quadraticCurveTo(15 + i * 0.6, 11, 9 + i * 1.3, 17.6); x.stroke(); }
      ell(x, 4, 18.6, 3.4, 1, "rgba(236,232,222,.35)");
    }
    c.base = 23;
    return c;
  };
  BS.paintLantern = function () {
    var c = wc(12, 14, SPR), x = c.x;
    shadow(x, 6.6, 12.6, 5, 1.2, 0.45);
    /* fat, sturdy, ugly, wonderful: yellow plastic gone chalky, a glass eye, a crank folded flat */
    rr(x, 1.4, 3, 9, 9, 2.4, lg(x, 1.4, 0, 10.4, 0, [[0, "#f4e08a"], [0.5, "#dcc060"], [1, "#a48a3a"]]));
    rr(x, 1.4, 3, 9, 9, 2.4); x.fillStyle = "rgba(255,250,235,.22)"; x.fill();                 // the chalk of age
    x.strokeStyle = "#4a4030"; x.lineWidth = 0.8; x.beginPath(); x.moveTo(3, 3.4); x.quadraticCurveTo(6, -0.6, 9, 3.4); x.stroke();
    ell(x, 6, 7.4, 2.6, 2.6, "#5a5040"); ell(x, 6, 7.4, 2, 2, rg(x, 5.2, 6.6, 0.2, 2.4, [[0, "#fffbe8"], [0.5, "#d8dcd0"], [1, "#8a8e86"]]));
    ell(x, 5.3, 6.7, 0.6, 0.5, "rgba(255,255,255,.9)");
    x.fillStyle = "#3a3428"; x.fillRect(10.2, 4.4, 1, 6); ell(x, 10.7, 10.4, 0.8, 0.8, "#3a3428");
    c.base = 12.6;
    return c;
  };

  /* ---------------- the cellar floor ----------------
     Old stones set in earth, each its own size, laid across the whole floor
     with no seams at the tiles; damper and darker the lower it goes toward
     the corner where the water stands, moss in the joints by the walls, a
     wet shine on the stones that hold it. */
  function cellarStone(x, m, tx, ty) {
    var X = tx * T, Y = ty * T, G2 = 8.4;
    x.save(); x.beginPath(); x.rect(X, Y, T, T); x.clip();
    x.fillStyle = "#1e1d1a"; x.fillRect(X, Y, T, T);
    var pool = [19 * T, 12 * T];
    for (var j = Math.floor(Y / G2) - 1; j <= Math.floor((Y + T) / G2) + 1; j++) for (var i = Math.floor(X / G2) - 1; i <= Math.floor((X + T) / G2) + 1; i++) {
      var off = (j % 2) * G2 * 0.5, cx = i * G2 + off + (H(i, j, 301) - 0.5) * 1.6, cy = j * G2 + (H(i, j, 302) - 0.5) * 1.4;
      var w = G2 * (0.5 + H(i, j, 303) * 0.12), h = G2 * (0.46 + H(i, j, 304) * 0.1);
      if (cx + w < X - 1 || cx - w > X + T + 1 || cy + h < Y - 1 || cy - h > Y + T + 1) continue;
      var damp = Math.max(0, 1 - Math.hypot(cx - pool[0], cy - pool[1]) / 150);
      var base = mix(mix("#45433c", "#524f47", H(i, j, 305)), "#30343a", damp * 0.6);
      if (H(i, j, 306) < 0.12) base = mix(base, "#5a5040", 0.5);
      /* an irregular rounded stone */
      x.beginPath();
      for (var a = 0; a < 7; a++) { var th = a / 7 * 6.2832 + H(i, j, 307) * 2, rr2 = 0.82 + H(i * 7 + a, j, 308) * 0.22, px = cx + Math.cos(th) * w * rr2, py = cy + Math.sin(th) * h * rr2; if (a) x.lineTo(px, py); else x.moveTo(px, py); }
      x.closePath();
      x.fillStyle = lg(x, cx - w, cy - h, cx + w, cy + h, [[0, shade(base, 0.1)], [0.5, base], [1, shade(base, -0.16)]]); x.fill();
      x.strokeStyle = "rgba(10,10,8,.35)"; x.lineWidth = 0.3; x.stroke();
      if (damp > 0.35 && H(i, j, 309) < damp) ell(x, cx - w * 0.3, cy - h * 0.35, w * 0.35, h * 0.16, "rgba(180,210,215," + (0.1 + damp * 0.14) + ")");     // wet shine
      if (H(i, j, 310) < 0.05) { x.strokeStyle = "rgba(20,18,14,.55)"; x.lineWidth = 0.25; x.beginPath(); x.moveTo(cx - w * 0.6, cy - h * 0.2); x.lineTo(cx, cy + h * 0.1); x.lineTo(cx + w * 0.4, cy - h * 0.4); x.stroke(); }
    }
    /* moss in the joints along the walls */
    var nearWall = 0;
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) { var t2 = m.get(tx + d[0], ty + d[1]); if (t2 === TL.SWALL || t2 === TL.SHELF) nearWall++; });
    if (nearWall) { var rs = R(tx * 17 + ty * 29 + 5); for (var k = 0; k < 4 * nearWall; k++) ell(x, X + rs() * 16, Y + rs() * 16, 0.5 + rs() * 0.8, 0.35 + rs() * 0.4, rs() < 0.6 ? "rgba(70,110,60,.3)" : "rgba(100,140,70,.22)"); }
    /* the damp itself, a darkness that pools toward the corner */
    var dd = Math.hypot(X + 8 - pool[0], Y + 8 - pool[1]);
    x.fillStyle = "rgba(8,14,18," + Math.max(0, 0.35 - dd / 500) + ")"; x.fillRect(X, Y, T, T);
    x.restore();
  }

  /* ---------------- the jars, and the book ---------------- */
  var JAR = [
    ["#5b2340", "#8a3a5a", "plum"], ["#7a1a2a", "#b0303a", "red currant"], ["#d4862e", "#f0b050", "peach"], ["#2a1a2e", "#5a2a50", "blackberry"],
    ["#8a3a5a", "#c05a7a", "rhubarb"], ["#c8642a", "#e8903a", "apricot"], ["#3a1830", "#6a2a4a", "damson"], ["#a0405a", "#d06070", "cherry"],
    ["#6a7a2a", "#9aa840", "gooseberry"], ["#b89a3a", "#e0c860", "honey"], ["#a02a1a", "#d84a2a", "tomato"]
  ];
  /* one of Gran's jars, X,Y is its bottom-left on the shelf board */
  function jar(x, X, Y, i, j, onSide, scale) {
    var k = scale || 1, h = (5.4 + H(i, j, 102) * 1.4) * k, w = (3.9 + H(i, j, 103) * 0.6) * k, c = JAR[(H(i, j, 101) * JAR.length) | 0];
    var lx = X + (4.4 - w) / 2, top = Y - h;
    x.save();
    if (onSide) { x.translate(X + 2.2, Y - 1.6); x.rotate(1.35); x.translate(-X - 2.2, -Y + 1.6); }
    /* the glass, with what's in it seen through it, darker toward the bottom */
    var sh = 0.9 * k;
    x.fillStyle = "rgba(0,0,0,.45)"; rr(x, lx + 0.5, Y - 0.6, w, 0.9, 0.4, x.fillStyle);
    x.beginPath(); x.moveTo(lx, Y); x.lineTo(lx, top + sh * 1.6); x.quadraticCurveTo(lx, top + sh * 0.6, lx + sh, top + sh * 0.5); x.lineTo(lx + w - sh, top + sh * 0.5); x.quadraticCurveTo(lx + w, top + sh * 0.6, lx + w, top + sh * 1.6); x.lineTo(lx + w, Y); x.closePath();
    x.fillStyle = lg(x, lx, 0, lx + w, 0, [[0, shade(c[1], 0.1)], [0.45, c[0]], [1, shade(c[0], -0.5)]]); x.fill();
    x.save(); x.clip();
    var fill = top + sh * (1.2 + H(i, j, 104) * 0.8);
    x.fillStyle = "rgba(20,10,10,.35)"; x.fillRect(lx, Y - h * 0.35, w, h);                                   // the deep at the bottom
    for (var f = 0; f < 4; f++) ell(x, lx + 0.8 + H(i * 7 + f, j, 105) * (w - 1.6), fill + 1 + H(i, j * 5 + f, 106) * (Y - fill - 1.5), 0.55 * k, 0.45 * k, rgba(c[1], 0.7));   // fruit
    x.fillStyle = "rgba(255,240,220,.08)"; x.fillRect(lx, top, w, fill - top);                          // the air above it
    x.fillStyle = "rgba(255,255,255,.12)"; x.fillRect(lx, fill - 0.15, w, 0.3);                         // where it stops
    x.restore();
    /* the glass itself: a bright line down one shoulder, a faint one down the other */
    x.fillStyle = "rgba(255,255,255,.55)"; x.fillRect(lx + 0.55 * k, top + sh * 1.3, 0.38 * k, h - sh * 2);
    x.fillStyle = "rgba(255,255,255,.18)"; x.fillRect(lx + w - 0.9 * k, top + sh * 1.6, 0.25 * k, h - sh * 2.6);
    /* the top: a zinc lid, or muslin or gingham tied down with string */
    var lid = H(i, j, 107);
    if (lid < 0.4) { rr(x, lx + 0.3, top - 0.2, w - 0.6, 1.2 * k, 0.4, lg(x, 0, top - 0.2, 0, top + 1, [[0, "#d8d4c6"], [1, "#7a766a"]])); }
    else {
      var cloth = lid < 0.7 ? "#efe6d0" : "#d24a3a";
      x.fillStyle = cloth; x.beginPath(); x.moveTo(lx - 0.5, top + 1.2); x.quadraticCurveTo(lx + w / 2, top - 1.3 * k, lx + w + 0.5, top + 1.2); x.lineTo(lx + w + 0.2, top + 2); x.lineTo(lx - 0.2, top + 2); x.closePath(); x.fill();
      if (lid >= 0.7) { x.fillStyle = "rgba(255,255,255,.7)"; for (var g = 0; g < 3; g++) x.fillRect(lx + 0.3 + g * (w / 3), top - 0.2, w / 6, 2.2); }
      x.fillStyle = "#8a6a3a"; x.fillRect(lx - 0.2, top + 1.3, w + 0.4, 0.35);
    }
    /* her label: a slip of paper, a line of writing, a year */
    if (!onSide || true) { var ly = top + h * 0.45; x.fillStyle = "rgba(240,228,196,.92)"; x.fillRect(lx + 0.5, ly, w - 1, 1.5 * k); x.strokeStyle = "rgba(60,40,30,.6)"; x.lineWidth = 0.18; x.beginPath(); x.moveTo(lx + 0.8, ly + 0.55 * k); for (var q = 0; q < 4; q++) x.lineTo(lx + 1 + q * (w - 2) / 4, ly + 0.45 * k + (q % 2) * 0.25); x.moveTo(lx + 0.9, ly + 1.05 * k); x.lineTo(lx + w * 0.55, ly + 1.05 * k); x.stroke(); }
    x.restore();
  }
  BS.jar = jar;
  /* the book, wrapped in a square of waxed cloth the way Gran wrapped
     anything she meant to keep dry and keep safe, tied with garden twine */
  function waxedBook(x, X, Y) {
    shadow(x, X + 7, Y + 12, 8, 2, 0.55);
    /* the book's shape under the cloth, a little skewed on the slanted board */
    x.save(); x.translate(X + 6.6, Y + 6); x.rotate(-0.1);
    rr(x, -6.2, -4.6, 12.4, 9.6, 1.4, lg(x, -6, -5, 6, 5, [[0, "#f2ead0"], [0.5, "#dccf9e"], [1, "#a8996a"]]));
    /* the waxy sheen and the creases where it was folded under */
    x.fillStyle = "rgba(255,255,240,.35)"; x.beginPath(); x.moveTo(-5.6, -4); x.lineTo(1, -4.2); x.lineTo(-3.4, 1); x.closePath(); x.fill();
    x.strokeStyle = "rgba(120,100,60,.45)"; x.lineWidth = 0.25;
    [[-6, -4.4, 0, 0.2], [6, -4.4, 0.4, 0.4], [-6, 4.8, -0.2, 0.6], [6, 4.8, 0.6, 0.2]].forEach(function (cr) { x.beginPath(); x.moveTo(cr[0], cr[1]); x.quadraticCurveTo(cr[2], cr[3], 0, 0.2); x.stroke(); });
    x.fillStyle = "rgba(90,70,40,.35)"; x.fillRect(-6, 4.2, 12.2, 0.8);                                    // the edge of the boards inside
    /* the twine, crossed and knotted */
    x.strokeStyle = "#9a7a4a"; x.lineWidth = 0.45;
    x.beginPath(); x.moveTo(-6.3, 0.4); x.lineTo(6.3, -0.2); x.moveTo(0.6, -4.8); x.lineTo(0.2, 5.1); x.stroke();
    x.strokeStyle = "#c8a870"; x.lineWidth = 0.18; x.beginPath(); x.moveTo(-6.3, 0.25); x.lineTo(6.3, -0.35); x.stroke();
    ell(x, 0.45, 0.1, 0.9, 0.7, "#8a6a3a");
    x.strokeStyle = "#9a7a4a"; x.lineWidth = 0.35; x.beginPath(); x.moveTo(0.5, 0.2); x.quadraticCurveTo(2, 2.2, 1.4, 3.4); x.moveTo(0.4, 0.2); x.quadraticCurveTo(-1.6, 1.6, -1.8, 3); x.stroke();
    x.restore();
  }

  function paintInteriorChunk(m, cx, cy) {
    var S = CH * T, ox = cx * S, oy = cy * S, c = wc(S, S, ART), x = c.x;
    x.translate(-ox, -oy);
    x.fillStyle = "#0a0806"; x.fillRect(ox, oy, S, S);
    var x0 = cx * CH, y0 = cy * CH;
    for (var ty = y0; ty < y0 + CH; ty++) for (var tx = x0; tx < x0 + CH; tx++) if (m.get(tx, ty) >= 0) floorTile(x, m, tx, ty);
    if (m.id === "shed") shedSun(x, m);
    for (ty = y0 - 1; ty < y0 + CH + 1; ty++) for (tx = x0 - 1; tx < x0 + CH + 1; tx++) if (m.get(tx, ty) >= 0) standTile(x, m, tx, ty);
    return c;
  }
  function floorTile(x, m, tx, ty) {
    var t = m.get(tx, ty), X = tx * T, Y = ty * T, k;
    var under = t;
    if (m.id === "house") { if (t === TL.BOX || t === TL.TABLE || t === TL.CHAIR || t === TL.RUG || t === TL.EXIT || t === TL.STAIRS || t === TL.WALL || t === TL.WINDOW || t === TL.CDOOR) under = TL.FLOOR; if ((t === TL.COUNTER || t === TL.TABLE || t === TL.CHAIR || t === TL.BOX) && tx > 16) under = TL.KFLOOR; }
    if (m.id === "cellar" && t !== TL.SWALL && t !== TL.STEPS && t !== TL.POOL) under = TL.STONE;
    if (m.id === "shed") under = TL.SFLOOR;
    if (m.id === "shed") { shedFloor(x, m, tx, ty); return; }
    if (under === TL.FLOOR && m.id === "house") houseBoards(x, m, tx, ty);
    else if (under === TL.KFLOOR && m.id === "house") houseCheck(x, m, tx, ty);
    else if (under === TL.FLOOR) {
      for (var j = 0; j < 4; j++) {
        var by = Y + j * 4, off = (H(tx, ty * 4 + j, 1) * 16) | 0, base = mix("#8a6040", "#b07e52", H(Math.floor((tx * 16 + off) / 24), ty * 4 + j, 2));
        x.fillStyle = lg(x, 0, by, 0, by + 4, [[0, shade(base, 0.08)], [1, shade(base, -0.08)]]); x.fillRect(X, by, T, 4);
        x.fillStyle = "rgba(50,30,15,.45)"; x.fillRect(X, by + 3.7, T, 0.35);
        x.fillRect(X + ((off + tx * 7) % 16), by, 0.35, 4);
        x.strokeStyle = "rgba(70,40,20,.18)"; x.lineWidth = 0.25; x.beginPath(); x.moveTo(X, by + 1.6 + H(tx, j, 3)); x.bezierCurveTo(X + 5, by + 1 + H(tx, j, 4) * 2, X + 10, by + 2.4, X + 16, by + 1.8); x.stroke();
      }
    } else if (under === TL.KFLOOR) {
      x.fillStyle = (tx + ty) % 2 ? "#b44a3e" : "#e9e0c8"; x.fillRect(X, Y, T, T);
      x.fillStyle = lg(x, X, Y, X + T, Y + T, [[0, "rgba(255,255,255,.14)"], [0.5, "rgba(255,255,255,0)"], [1, "rgba(0,0,0,.1)"]]); x.fillRect(X, Y, T, T);
      x.fillStyle = "rgba(60,40,30,.25)"; x.fillRect(X, Y + T - 0.4, T, 0.4); x.fillRect(X + T - 0.4, Y, 0.4, T);
    } else if ((under === TL.STONE || under === TL.POOL) && m.id === "cellar") {
      cellarStone(x, m, tx, ty);
      if (under === TL.POOL) { ell(x, X + 8, Y + 8, 7.5, 6, rg(x, X + 8, Y + 8, 1, 8, [[0, "rgba(14,30,38,.85)"], [1, "rgba(14,30,38,.25)"]])); ell(x, X + 6, Y + 6, 2.5, 0.8, "rgba(170,210,220,.22)"); }
    } else if (under === TL.STONE || under === TL.POOL) {
      var rs = R(tx * 31 + ty * 7);
      x.fillStyle = "#2e2d29"; x.fillRect(X, Y, T, T);
      [[0, 0, 9, 7], [9, 0, 7, 9], [0, 7, 7, 9], [7, 9, 9, 7], [7, 7, 2, 2]].forEach(function (q) { var col = mix("#4a4943", "#5e5c54", rs()); rr(x, X + q[0] + 0.35, Y + q[1] + 0.35, q[2] - 0.7, q[3] - 0.7, 1.2, lg(x, X + q[0], Y + q[1], X + q[0] + q[2], Y + q[1] + q[3], [[0, shade(col, 0.1)], [1, shade(col, -0.12)]])); });
      if (rs() < 0.4) ell(x, X + rs() * 14, Y + rs() * 14, 2 + rs() * 3, 1 + rs() * 2, "rgba(80,120,90,.25)");
      if (under === TL.POOL) { ell(x, X + 8, Y + 8, 7.5, 6, rg(x, X + 8, Y + 8, 1, 8, [[0, "rgba(20,40,50,.85)"], [1, "rgba(20,40,50,.3)"]])); ell(x, X + 6, Y + 6, 2.5, 0.8, "rgba(170,210,220,.25)"); }
    } else if (under === TL.SFLOOR) {
      x.fillStyle = lg(x, X, Y, X, Y + T, [[0, "#7a6448"], [1, "#6c5840"]]); x.fillRect(X, Y, T, T);
      var r2 = R(tx * 13 + ty * 91);
      for (k = 0; k < 18; k++) ell(x, X + r2() * 16, Y + r2() * 16, 0.3 + r2() * 0.6, 0.25, r2() < 0.5 ? "rgba(40,28,15,.4)" : "rgba(210,180,130,.3)");
      x.fillStyle = "rgba(40,28,15,.4)"; x.fillRect(X, Y + 7.8, T, 0.4);
    } else if (under === TL.STEPS) {
      for (var s = 0; s < 3; s++) { var sy = Y + s * 5.3; x.fillStyle = lg(x, 0, sy, 0, sy + 5.3, [[0, "#8a6a44"], [0.6, "#6a4e30"], [1, "#2e2014"]]); x.fillRect(X, sy, T, 5.3); }
    }
  }
  function standTile(x, m, tx, ty) {
    var t = m.get(tx, ty), X = tx * T, Y = ty * T, k;
    if (m.id === "shed" && shedStand(x, m, tx, ty)) return;
    if (m.id === "house") {
      if (t === TL.WALL || t === TL.WINDOW || t === TL.CDOOR) {
        var below0 = m.get(tx, ty + 1);
        if (below0 !== TL.WALL && below0 !== TL.WINDOW && below0 !== TL.CDOOR && below0 >= 0) {
          houseWallFace(x, m, tx, ty);
          if (t === TL.WINDOW) houseWindow(x, X, Y, tx > 16);
          if (t === TL.CDOOR) { rr(x, X + 2.5, Y + 1.5, 11, T - 1.5, 1, "#3a2414"); for (var pp = 0; pp < 4; pp++) rr(x, X + 3 + pp * 2.6, Y + 2.2, 2.4, T - 2.4, 0.5, lg(x, 0, Y, 0, Y + T, [[0, "#7a5232"], [1, "#5a3a20"]])); rr(x, X + 9.2, Y + 8, 3, 1.4, 0.5, "#222"); ell(x, X + 10.4, Y + 8.4, 0.7, 0.45, "#f2f2ea"); }
          return;
        }
      }
      if (t === TL.RUG) { houseRug(x, m, tx, ty); return; }
      if (t === TL.BOX) { houseBox(x, m, tx, ty); return; }
      if (t === TL.STAIRS) { houseStairs(x, m, tx, ty); return; }
      if (t === TL.TABLE) { houseTable(x, m, tx, ty); return; }
      if (t === TL.CHAIR) { houseChair(x, X, Y); return; }
      if (t === TL.COUNTER) { if (tx === 21 && ty === 2) houseFridge(x, X, Y); else houseCounter(x, m, tx, ty); return; }
    }
    if (t === TL.WALL || t === TL.WINDOW || t === TL.CDOOR) {
      var below = m.get(tx, ty + 1), face = below !== TL.WALL && below !== TL.WINDOW && below !== TL.CDOOR && below >= 0;
      if (face) {
        x.fillStyle = lg(x, 0, Y, 0, Y + T, [[0, "#e4d6b6"], [1, "#c9b896"]]); x.fillRect(X, Y, T, T);
        for (k = 0; k < 2; k++) for (var j = 0; j < 2; j++) { var fx = X + 4 + k * 8 + (j % 2) * 4, fy = Y + 4 + j * 5; ell(x, fx, fy, 1, 1.3, "rgba(170,120,100,.2)"); ell(x, fx, fy - 1.6, 0.6, 0.6, "rgba(120,140,90,.22)"); }
        x.fillStyle = "#7a5a40"; x.fillRect(X, Y + T - 3.2, T, 3.2); x.fillStyle = "#9a7a58"; x.fillRect(X, Y + T - 3.2, T, 0.7);
        x.fillStyle = "#5a3e28"; x.fillRect(X, Y, T, 1.6); x.fillStyle = "#7a5a40"; x.fillRect(X, Y + 1.2, T, 0.5);
        if (m.pale && m.pale.some(function (p) { return p[0] === tx; }) && ty <= 1) rr(x, X + 3, Y + 3.5, 10, 7, 0.4, "rgba(250,244,226,.85)");
        if (m.hook && m.hook.x === tx && ty <= 1) { rr(x, X + 3.5, Y + 2.5, 9, 9, 0.4, "rgba(250,244,226,.85)"); ell(x, X + 8, Y + 3.6, 0.6, 0.6, "#c8a040"); }
      } else {
        x.fillStyle = lg(x, 0, Y, 0, Y + T, [[0, "#4a382a"], [1, "#3a2c22"]]); x.fillRect(X, Y, T, T);
        x.fillStyle = "rgba(255,240,210,.06)"; x.fillRect(X, Y, T, 1);
      }
      if (t === TL.WINDOW) {
        rr(x, X + 1.6, Y + 2, T - 3.2, T - 4.5, 0.8, "#6b5034");
        x.fillStyle = lg(x, 0, Y + 3, 0, Y + T - 4, [[0, "#fdf6d8"], [1, "#e2edc8"]]); x.fillRect(X + 2.8, Y + 3.2, T - 5.6, T - 7);
        x.fillStyle = "rgba(120,170,90,.35)"; x.fillRect(X + 2.8, Y + T - 6.5, T - 5.6, 2.7);
        x.fillStyle = "#6b5034"; x.fillRect(X + 7.6, Y + 3.2, 0.8, T - 7); x.fillRect(X + 2.8, Y + 7.6, T - 5.6, 0.8);
        x.fillStyle = "rgba(240,220,200,.75)"; x.fillRect(X + 1.4, Y + 2, 1.6, T - 5); x.fillRect(X + T - 3, Y + 2, 1.6, T - 5);
        rr(x, X + 1, Y + T - 3, T - 2, 1.5, 0.5, "#8a6a48");
      }
      if (t === TL.CDOOR) {
        rr(x, X + 2.5, Y + 1.5, 11, T - 1.5, 1, "#3a2414");
        for (var p = 0; p < 4; p++) rr(x, X + 3 + p * 2.6, Y + 2.2, 2.4, T - 2.4, 0.5, lg(x, 0, Y, 0, Y + T, [[0, "#7a5232"], [1, "#5a3a20"]]));
        rr(x, X + 9.2, Y + 8, 3, 1.4, 0.5, "#222"); ell(x, X + 10.4, Y + 8.4, 0.7, 0.45, "#f2f2ea");
      }
      return;
    }
    if (t === TL.SWALL) {
      var face2 = m.get(tx, ty + 1) >= 0 && m.get(tx, ty + 1) !== TL.SWALL;
      x.fillStyle = "#1c1b18"; x.fillRect(X, Y, T, T);
      var rs = R(tx * 17 + ty * 3);
      for (var row = 0; row < 3; row++) for (var col = -1; col < 3; col++) {
        var bx = X + col * 7 + (row % 2) * 3.5, by = Y + row * 5.4, c0 = mix("#3a3933", "#4e4c44", rs());
        rr(x, bx + 0.3, by + 0.3, 6.4, 4.8, 1, lg(x, bx, by, bx + 6, by + 5, [[0, shade(c0, face2 ? 0.12 : 0)], [1, shade(c0, -0.2)]]));
      }
      if (rs() < 0.5) { x.fillStyle = "rgba(140,180,170,.22)"; x.fillRect(X + 3 + rs() * 10, Y, 0.6, T); }
      if (face2) { x.fillStyle = lg(x, 0, Y + T - 3, 0, Y + T, [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.45)"]]); x.fillRect(X, Y + T - 3, T, 3); }
      return;
    }
    if (t === TL.BWALL) {
      for (var b = 0; b < 4; b++) {
        var cB = mix("#8e8878", "#aaa494", H(tx * 4 + b, ty, 91));
        x.fillStyle = lg(x, X + b * 4, 0, X + b * 4 + 4, 0, [[0, shade(cB, 0.15)], [1, shade(cB, -0.2)]]); x.fillRect(X + b * 4, Y, 3.7, T);
        x.fillStyle = "#3a352e"; x.fillRect(X + b * 4 + 3.7, Y, 0.3, T);
        if (H(tx * 4 + b, ty, 92) > 0.8) { x.fillStyle = "rgba(255,236,170,.9)"; x.fillRect(X + b * 4 + 3.7, Y, 0.35, T); }
      }
      return;
    }
    if (t === TL.EXIT) {
      rr(x, X + 1.5, Y - 1, 13, T + 1, 1, "#3a2414"); rr(x, X + 2.5, Y, 11, T, 0.8, lg(x, 0, Y, 0, Y + T, [[0, "#8a5a34"], [1, "#6a4024"]]));
      ell(x, X + 11, Y + 8, 0.9, 0.9, "#e0c060");
      return;
    }
    if (t === TL.STAIRS) {
      for (var s = 0; s < 4; s++) { var sy = Y + s * 4; x.fillStyle = lg(x, 0, sy, 0, sy + 4, [[0, "#b08452"], [0.5, "#8a643c"], [1, "#4e3420"]]); x.fillRect(X, sy, T, 4); }
      if (m.get(tx + 1, ty) !== TL.STAIRS) { x.fillStyle = lg(x, X + T - 2, 0, X + T, 0, [[0, "#6a4a2c"], [1, "#3a2414"]]); x.fillRect(X + T - 2, Y, 2, T); ell(x, X + T - 1, Y + 1, 1.2, 1.2, "#c8a070"); }
      return;
    }
    if (t === TL.RUG) {
      var eL = m.get(tx - 1, ty) !== TL.RUG, eR = m.get(tx + 1, ty) !== TL.RUG, eT = m.get(tx, ty - 1) !== TL.RUG, eB = m.get(tx, ty + 1) !== TL.RUG;
      x.fillStyle = "#86392f"; x.fillRect(X + (eL ? 1 : 0), Y + (eT ? 1 : 0), T - (eL ? 1 : 0) - (eR ? 1 : 0), T - (eT ? 1 : 0) - (eB ? 1 : 0));
      x.strokeStyle = "#d9b46a"; x.lineWidth = 0.6;
      if (eT) { x.beginPath(); x.moveTo(X, Y + 2.4); x.lineTo(X + T, Y + 2.4); x.stroke(); }
      if (eB) { x.beginPath(); x.moveTo(X, Y + T - 2.4); x.lineTo(X + T, Y + T - 2.4); x.stroke(); }
      x.fillStyle = "#2f4a6a"; x.beginPath(); x.moveTo(X + 8, Y + 3); x.lineTo(X + 13, Y + 8); x.lineTo(X + 8, Y + 13); x.lineTo(X + 3, Y + 8); x.closePath(); x.fill();
      ell(x, X + 8, Y + 8, 1.6, 1.6, "#e2c27a");
      return;
    }
    if (t === TL.BOX) {
      var o = H(tx, ty, 100), bw = 13 - o * 2, bh = 7, bx2 = X + 1.5 + o * 2, top = Y + 2;
      shadow(x, X + 10, Y + 14, 9, 3, 0.35);
      x.fillStyle = lg(x, 0, top + 4, 0, top + 4 + bh, [[0, "#c69a62"], [1, "#a47a46"]]); x.fillRect(bx2, top + 4, bw, bh);
      x.fillStyle = lg(x, 0, top, 0, top + 4, [[0, "#e2be88"], [1, "#d2aa72"]]); x.fillRect(bx2, top, bw, 4.2);
      x.fillStyle = "rgba(240,232,214,.9)"; x.fillRect(bx2 + bw / 2 - 1.2, top, 2.4, 4.2 + bh);
      x.fillStyle = "rgba(60,40,20,.75)"; x.font = "bold 2.2px sans-serif"; x.fillText(["KITCHEN", "BOOKS", "FRAGILE", "FRAGILE", "FRAGILE"][(H(tx, ty, 3) * 5) | 0], bx2 + 0.6, top + 8.8);
      return;
    }
    if (t === TL.TABLE) {
      var lft = m.get(tx - 1, ty) !== TL.TABLE, rgt = m.get(tx + 1, ty) !== TL.TABLE, tp = m.get(tx, ty - 1) !== TL.TABLE, bt = m.get(tx, ty + 1) !== TL.TABLE;
      if (bt) shadow(x, X + 9, Y + 15, 9, 2.5, 0.35);
      x.fillStyle = lg(x, X, Y, X + T, Y + T, [[0, "#b5824e"], [1, "#94643a"]]); x.fillRect(X + (lft ? 1 : 0), Y + (tp ? 1 : 0), T - (lft ? 1 : 0) - (rgt ? 1 : 0), T - (tp ? 1 : 0) - (bt ? 3 : 0));
      if (bt) { x.fillStyle = "#6a4426"; x.fillRect(X + (lft ? 1 : 0), Y + T - 3, T - (lft ? 1 : 0) - (rgt ? 1 : 0), 1.6); }
      if (lft && tp) { ell(x, X + 10, Y + 7, 2.6, 2.2, "#f2ece0"); ell(x, X + 10, Y + 6.6, 1.8, 1.3, "#5a3a20"); ell(x, X + 10, Y + 6.4, 1.2, 0.6, "rgba(200,190,170,.5)"); }
      return;
    }
    if (t === TL.CHAIR) { shadow(x, X + 9, Y + 13, 6, 2, 0.3); rr(x, X + 3, Y + 3, 10, 9, 1.4, lg(x, 0, Y + 3, 0, Y + 12, [[0, "#9a6a42"], [1, "#6e4a2a"]])); rr(x, X + 3, Y + 1, 10, 2.5, 1, "#7a5232"); return; }
    if (t === TL.COUNTER) {
      if (m.id === "house" && tx === 21 && ty === 2) {
        /* the refrigerator, silent */
        shadow(x, X + 9, Y + 15, 8, 2, 0.35);
        rr(x, X + 1, Y - 6, 14, 21, 1.6, lg(x, X + 1, 0, X + 15, 0, [[0, "#f4f2ea"], [1, "#c8c6bc"]]));
        x.fillStyle = "rgba(0,0,0,.15)"; x.fillRect(X + 1, Y + 1, 14, 0.5); rr(x, X + 12, Y - 3, 1, 4, 0.5, "#9a9890"); rr(x, X + 12, Y + 3, 1, 5, 0.5, "#9a9890");
        return;
      }
      x.fillStyle = lg(x, 0, Y, 0, Y + T, [[0, "#f1ead6"], [0.65, "#e0d6bc"], [0.66, "#a88a62"], [1, "#8a6c48"]]); x.fillRect(X, Y, T, T);
      x.fillStyle = "rgba(255,255,255,.4)"; x.fillRect(X, Y, T, 0.6);
      x.fillStyle = "rgba(60,40,20,.4)"; x.fillRect(X + 7.8, Y + 10.6, 0.4, 5); ell(x, X + 6.5, Y + 12.5, 0.5, 0.5, "#d8c08a"); ell(x, X + 9.5, Y + 12.5, 0.5, 0.5, "#d8c08a");
      return;
    }
    if (t === TL.SHELF) {
      /* a shelf of Gran's jars: plums, peaches, blackberries dark as a bruise,
         every summer she ever carried down here, each one a little different */
      x.fillStyle = "#1e140c"; x.fillRect(X, Y - 2, T, T + 2);
      x.fillStyle = "rgba(60,40,24,.5)"; for (var g0 = 0; g0 < 3; g0++) x.fillRect(X + H(tx, g0, 5) * 15, Y - 2, 0.4, T + 2);
      [Y + 6, Y + 13.4].forEach(function (sy2) {
        x.fillStyle = lg(x, 0, sy2, 0, sy2 + 1.8, [[0, "#8a6440"], [1, "#5a3c22"]]); x.fillRect(X, sy2, T, 1.8);
        x.fillStyle = "rgba(255,230,190,.18)"; x.fillRect(X, sy2, T, 0.3);
        x.fillStyle = "rgba(0,0,0,.5)"; x.fillRect(X, sy2 + 1.8, T, 0.8);
      });
      for (var row2 = 0; row2 < 2; row2++) for (var i = 0; i < 3; i++) jar(x, X + 0.9 + i * 5.1, Y + 6 + row2 * 7.4, tx * 3 + i, ty * 2 + row2);
      /* now and then a cobweb across a corner, and the dust of years on the board */
      if (H(tx, ty, 140) < 0.18) cobweb(x, X + (H(tx, ty, 141) < 0.5 ? 0 : T), Y - 2, H(tx, ty, 141) < 0.5 ? 1 : -1, 1, 6);
      return;
    }
    if (t === TL.APPLES) {
      shadow(x, X + 9, Y + 15, 8, 2, 0.4);
      rr(x, X + 0.5, Y + 1, 15, 14, 1, "#5a4026"); rr(x, X + 1.5, Y + 2, 13, 12, 0.8, "#3a2816");
      for (var a = 0; a < 7; a++) lump(x, X + 3.5 + (a % 3) * 4.5, Y + 4 + Math.floor(a / 3) * 4, 2, ["#9a4a2a", "#a87a2a", "#7a3a22"][a % 3]);
      return;
    }
    if (t === TL.FSHELF) {
      /* the fallen shelf: its boards come down at a slant, one split, jars
         rolled off into the corner — and on the top board, square in the
         strongest of the glow, the book in its waxed cloth */
      shadow(x, X + 8, Y + 15, 10, 2.6, 0.5);
      x.save(); x.translate(X + 8, Y + 8); x.rotate(-0.16 + (ty === 12 ? 0.05 : 0));
      [[-5.2, "#6a4e34"], [0, "#58402a"], [4.8, "#6a4e34"]].forEach(function (bd, i) {
        x.fillStyle = lg(x, 0, bd[0] - 1.6, 0, bd[0] + 1.6, [[0, shade(bd[1], 0.15)], [1, shade(bd[1], -0.25)]]); rr(x, -8.6, bd[0] - 1.6, 17.2, 3.2, 0.5, x.fillStyle);
        x.strokeStyle = "rgba(30,18,8,.4)"; x.lineWidth = 0.22; x.beginPath(); x.moveTo(-8, bd[0] - 0.5); x.bezierCurveTo(-3, bd[0] - 0.9, 2, bd[0], 8, bd[0] - 0.4); x.stroke();
        if (i === 1 && ty === 12) { x.fillStyle = "#1a1008"; x.beginPath(); x.moveTo(2, bd[0] - 1.6); x.lineTo(3.2, bd[0]); x.lineTo(1.6, bd[0] + 1.6); x.lineTo(1, bd[0] + 1.6); x.lineTo(2.4, bd[0]); x.closePath(); x.fill(); }
      });
      x.restore();
      if (ty === 11) waxedBook(x, X + 1.6, Y + 1.6);
      if (ty === 12) { jar(x, X + 1, Y + 11.2, 77, 5, 1); jar(x, X + 9.5, Y + 13.5, 78, 6, 0, 0.9); }
      return;
    }
    if (t === TL.LOG) {
      shadow(x, X + 9, Y + 14, 8, 2.4, 0.4);
      rr(x, X + 1, Y + 4, 14, 9, 4, lg(x, 0, Y + 4, 0, Y + 13, [[0, "#8a6a44"], [1, "#4a3420"]]));
      ell(x, X + 13.5, Y + 8.5, 2.6, 4.2, "#d8b88a"); x.strokeStyle = "rgba(140,100,60,.6)"; x.lineWidth = 0.3; ell(x, X + 13.5, Y + 8.5, 1.4, 2.4); x.stroke();
      return;
    }
    if (t === TL.TOOLS) {
      x.fillStyle = lg(x, 0, Y, 0, Y + T, [[0, "#9a9484"], [1, "#7e786a"]]); x.fillRect(X, Y, T, T - 2);
      for (var b2 = 0; b2 < 4; b2++) { x.fillStyle = "rgba(50,45,38,.5)"; x.fillRect(X + b2 * 4 + 3.7, Y, 0.3, T - 2); }
      var k2 = tx % 3;
      /* each tool hung on its nail, in front of its own painted outline */
      x.fillStyle = "rgba(250,246,232,.85)";
      if (k2 === 0) { rr(x, X + 2.5, Y + 1, 3, 11, 1); x.fill(); rr(x, X + 8, Y + 1.5, 6, 6, 1); x.fill(); rr(x, X + 3.3, Y + 1.5, 1.4, 8, 0.6, "#7a5232"); rr(x, X + 2.6, Y + 8.5, 2.8, 3, 0.6, "#8c9298"); rr(x, X + 8.4, Y + 2, 5, 2, 0.6, "#8c9298"); rr(x, X + 10.3, Y + 3.8, 1.4, 3.5, 0.5, "#7a5232"); }
      if (k2 === 1) { rr(x, X + 2.5, Y + 1, 3, 11, 1); x.fill(); rr(x, X + 9, Y + 1, 3, 10, 1); x.fill(); rr(x, X + 3.4, Y + 1.4, 1.2, 7.5, 0.5, "#8c9298"); rr(x, X + 2.8, Y + 8.4, 2.4, 3.2, 0.8, "#b33a2a"); rr(x, X + 9.8, Y + 1.4, 1.4, 9, 0.5, "#8c9298"); rr(x, X + 8.8, Y + 1.2, 3.4, 1.2, 0.4, "#3a3a3e"); }
      if (k2 === 2) { rr(x, X + 2.5, Y + 1, 3, 12, 1); x.fill(); rr(x, X + 8, Y + 1.5, 6, 7, 1); x.fill(); rr(x, X + 3.4, Y + 1.5, 1.2, 10, 0.5, "#7a5232"); rr(x, X + 2.5, Y + 1.3, 3, 1.8, 0.5, "#8c9298"); ell(x, X + 11, Y + 4, 2.6, 2.6, "#b8742c"); x.strokeStyle = "#6a4020"; x.lineWidth = 0.4; ell(x, X + 11, Y + 4, 1.6, 1.6); x.stroke(); }
      x.fillStyle = "#3a2a1a"; x.fillRect(X, Y + T - 2, T, 2);
      return;
    }
    if (t === TL.BENCH) {
      shadow(x, X + 9, Y + 15, 9, 2.5, 0.35);
      rr(x, X, Y + 3, T, 7, 0.8, lg(x, 0, Y + 3, 0, Y + 10, [[0, "#a47a50"], [1, "#7a5634"]])); x.fillStyle = "#4a3620"; x.fillRect(X + 1, Y + 10, 1.6, 5); x.fillRect(X + 13.4, Y + 10, 1.6, 5);
      if (tx === 8 && ty === 1) { rr(x, X + 1.5, Y - 1, 4, 4.6, 0.8, lg(x, X + 1.5, 0, X + 5.5, 0, [[0, "#b8bab6"], [1, "#6e706c"]])); }
      if (tx === 9 && ty === 1) { rr(x, X + 2, Y - 1, 9, 4.5, 1, "#3a3c3e"); ell(x, X + 5, Y + 1.2, 1.4, 1.4, "#6a6c6e"); for (var g = 0; g < 4; g++) x.fillRect(X + 7.4 + g * 0.8, Y, 0.4, 2.6); }
      return;
    }
    if (t === TL.MOWER) { shadow(x, X + 9, Y + 15, 7, 2, 0.35); rr(x, X + 2, Y + 6, 12, 7, 2, lg(x, 0, Y + 6, 0, Y + 13, [[0, "#3e6a3e"], [1, "#24442a"]])); ell(x, X + 3.5, Y + 13, 1.8, 1.8, "#1c1c1c"); ell(x, X + 12.5, Y + 13, 1.8, 1.8, "#1c1c1c"); x.strokeStyle = "#9a9da0"; x.lineWidth = 0.8; x.beginPath(); x.moveTo(X + 8, Y + 6); x.lineTo(X + 8, Y - 2); x.moveTo(X + 5, Y - 2); x.lineTo(X + 11, Y - 2); x.stroke(); return; }
    if (t === TL.BARROW) { shadow(x, X + 9, Y + 15, 7, 2, 0.35); x.fillStyle = lg(x, 0, Y + 4, 0, Y + 11, [[0, "#4e7a9a"], [1, "#2c4d66"]]); x.beginPath(); x.moveTo(X + 1, Y + 4); x.lineTo(X + 14, Y + 4); x.lineTo(X + 12, Y + 11); x.lineTo(X + 3, Y + 11); x.fill(); ell(x, X + 7.5, Y + 12.5, 2.4, 2.4, "#1c1c1c"); return; }
  }

  var chunkCache = {}, chunkOrder = [];
  BS.chunk = function (m, cx, cy) {
    var k = m.id + ":" + cx + ":" + cy;
    if (chunkCache[k]) return chunkCache[k];
    var c = m.outdoor ? paintOutdoorChunk(m, cx, cy) : paintInteriorChunk(m, cx, cy);
    chunkCache[k] = c; chunkOrder.push(k);
    while (chunkOrder.length > 64) delete chunkCache[chunkOrder.shift()];
    return c;
  };
  BS.hasChunk = function (m, cx, cy) { return !!chunkCache[m.id + ":" + cx + ":" + cy]; };
  BS.forgetChunks = function (mapId) { chunkOrder = chunkOrder.filter(function (k) { if (k.indexOf(mapId + ":") === 0) { delete chunkCache[k]; return false; } return true; }); };

  /* ================= the woods canopy, in chunks ================= */
  var canCache = {}, canOrder = [];
  BS.canopyChunk = function (m, cx, cy) {
    var k = cx + ":" + cy + ":" + (m.hidden.deer ? 1 : 0) + (m.hidden.root ? 1 : 0);
    if (canCache[k]) return canCache[k];
    var S = CH * T, pad = 24, c = wc(S + pad * 2, S + pad * 2, 2), x = c.x;
    c.pad = pad;
    x.translate(-cx * S + pad, -cy * S + pad);
    var x0 = cx * CH - 2, y0 = cy * CH - 2, list = [];
    for (var ty = y0; ty < y0 + CH + 4; ty++) for (var tx = x0; tx < x0 + CH + 4; tx++) {
      var t = m.get(tx, ty), wood = t === TL.WOOD || (t === TL.DEER && m.hidden.deer) || (t === TL.ROOT && m.hidden.root);
      if (wood && !((tx + ty) % 2 && H(tx, ty, 5) < 0.6)) list.push([tx, ty]);
    }
    /* every chunk paints its neighbors' overhang too, so clip to its own
       square: each pixel is painted once, no doubled shadow at the seams */
    x.beginPath(); x.rect(cx * S - 0.5, cy * S - 0.5, S + 1, S + 1); x.clip();
    var bch = m.beech ? [(m.beech.x + 1) * T, (m.beech.y + 0.6) * T] : null;
    /* the clearing: an upright oval over the whole trunk, so nothing in the roof hides it */
    function nearBeech(px, py, r) { return bch && Math.hypot(px - bch[0], (py - bch[1] - 10) * 0.7) < r; }
    function isWood(tx, ty) { var t = m.get(tx, ty); return t === TL.WOOD || (t === TL.DEER && m.hidden.deer) || (t === TL.ROOT && m.hidden.root); }
    /* one soft pool of shade under the whole canopy, not a stack of hard
       ellipses (blur where the browser has canvas filters) */
    x.save(); x.filter = "blur(7px)";
    x.fillStyle = "rgba(10,20,8,.42)"; x.beginPath();
    list.forEach(function (p) { if (nearBeech(p[0] * T + 8, p[1] * T + 8, 26)) return; x.moveTo(p[0] * T + 27, p[1] * T + 6); x.ellipse(p[0] * T + 10, p[1] * T + 6, 17, 13, 0, 0, 6.2832); });
    x.fill(); x.restore();
    /* the understory: the dark mass the crowns stand up out of */
    list.forEach(function (p) {
      if (nearBeech(p[0] * T + 8, p[1] * T + 8, 22)) return;
      var rs = R(p[0] * 31 + p[1] * 7), cx2 = p[0] * T + 8, cy2 = p[1] * T - 2;
      for (var b = 0; b < 3; b++) lump(x, cx2 + (rs() - 0.5) * 12, cy2 + (rs() - 0.5) * 10, 6 + rs() * 4, ["#22381a", "#2a4220", "#1e3418"][b], "#4e7234");
    });
    list.forEach(function (p) { if (!nearBeech(p[0] * T + 8, p[1] * T + 8, 22)) leaves(x, p[0] * T + 8, p[1] * T - 2, 12, R(p[0] * 57 + p[1] * 11), 34, [[24, 44, 20], [32, 58, 26], [44, 74, 32], [70, 104, 46], [110, 150, 70]]); });
    /* then the trees themselves, one crown at a time, the southern ones in
       front: oak and beech mostly, a dark spruce here and there, a pale
       birch at the bright edges, each kind in its own patches */
    var crowns = [];
    list.forEach(function (p) {
      var tx = p[0], ty = p[1], h1 = H(tx, ty, 77);
      if (h1 > 0.34) return;
      /* how far to the nearest open ground: crowns by a path stay small, so
         nothing in the roof ever hides you on it */
      var near = 3;
      for (var oy = -2; oy <= 2; oy++) for (var ox2 = -2; ox2 <= 2; ox2++) if (!isWood(tx + ox2, ty + oy)) near = Math.min(near, Math.max(Math.abs(ox2), Math.abs(oy)));
      var edge = near <= 1;
      var zone = BS.vn(tx, ty, 7, 91), sp = zone < 0.3 ? "spruce" : zone > 0.7 ? "beech" : "oak";
      if (edge && H(tx, ty, 78) < 0.4) sp = "birch";
      var r = near <= 1 ? 8 + H(tx, ty, 79) * 3 : near === 2 ? 11 + H(tx, ty, 79) * 4 : 12 + H(tx, ty, 79) * 9;
      if (sp === "spruce") r *= 0.82; if (sp === "birch") r *= 0.8;
      var cxp = tx * T + 8 + (H(tx, ty, 80) - 0.5) * 6, cyp = ty * T - 2 + (H(tx, ty, 81) - 0.5) * 6;
      if (nearBeech(cxp, cyp, 30 + r)) return;
      crowns.push({ x: cxp, y: cyp, r: r, sp: sp, seed: tx * 131 + ty * 17 });
    });
    crowns.sort(function (a, b) { return a.y - b.y; });
    crowns.forEach(function (o) { crown(x, o); });
    /* the beech: a clearing in the roof, and its own vast pale crown, lifted
       well up off the trunk so you can see where the gold runs out */
    if (bch && Math.abs(bch[0] - (cx * S + S / 2)) < S && Math.abs(bch[1] - (cy * S + S / 2)) < S) beechCrown(x, bch[0] + 3, bch[1] - 62);
    list.forEach(function (p) {
      if (nearBeech(p[0] * T + 8, p[1] * T + 8, 22)) return;
      var rs = R(p[0] * 13 + p[1] * 3);
      for (var q = 0; q < 4; q++) ell(x, p[0] * T + rs() * 16, p[1] * T - 6 + rs() * 12, 1.2, 0.8, rs() < 0.6 ? "rgba(170,210,110,.3)" : "rgba(10,25,8,.3)", rs() * 3);
    });
    canCache[k] = c; canOrder.push(k);
    while (canOrder.length > 48) delete canCache[canOrder.shift()];
    return c;
  };

  var CROWN = {
    oak: { lumps: ["#2e4c22", "#36582a", "#2a4620", "#40622e"], hi: "#86ae52", pal: [[30, 58, 24], [44, 78, 32], [62, 104, 42], [98, 142, 60], [156, 196, 98]] },
    beech: { lumps: ["#3e6a26", "#4a7a2c", "#3a6224", "#56882e"], hi: "#b6dc6a", pal: [[44, 76, 26], [62, 100, 34], [88, 132, 44], [132, 176, 64], [196, 228, 118]] },
    birch: { lumps: ["#5a8034", "#668c3c", "#4e7430", "#72984a"], hi: "#d2ea90", pal: [[70, 100, 44], [92, 128, 54], [120, 158, 68], [164, 200, 96], [214, 236, 150]] },
    spruce: { pal: [[16, 34, 26], [22, 46, 34], [30, 60, 42], [42, 78, 52], [70, 108, 72]] }
  };
  /* a single crown in the woods' roof, its shadow cast down to the right by
     how tall it stands */
  function crown(x, o) {
    var K = CROWN[o.sp], rs = R(o.seed), r = o.r, lift = r * 0.32;
    x.save(); x.globalAlpha = 0.5;
    ell(x, o.x + lift, o.y + lift * 0.8, r * 1.02, r * 0.9, "rgba(8,16,6,.7)");
    x.restore();
    if (o.sp === "spruce") {
      /* a dark star of tiers, drawn from the outside in */
      for (var tier = 0; tier < 4; tier++) {
        var tr = r * (1 - tier * 0.22), n = 9 + tier, rot = rs() * 6.28, c = K.pal[Math.min(4, tier + 1)];
        x.fillStyle = "rgb(" + c.join(",") + ")"; x.beginPath();
        for (var i = 0; i <= n * 2; i++) { var a = rot + i * Math.PI / n, rr2 = i % 2 ? tr * 0.6 : tr * (0.84 + BS.hash(i % (n * 2), tier, o.seed) * 0.24); var px = o.x + Math.cos(a) * rr2, py = o.y + Math.sin(a) * rr2 * 0.9; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
        x.fill();
        x.fillStyle = "rgba(0,0,0,.18)"; x.beginPath();
        for (i = 0; i <= n * 2; i++) { var a2 = rot + i * Math.PI / n, r3 = i % 2 ? tr * 0.62 : tr; if (Math.cos(a2 - 0.8) < 0) continue; x.moveTo(o.x, o.y); x.lineTo(o.x + Math.cos(a2) * r3, o.y + Math.sin(a2) * r3 * 0.9); }
        x.strokeStyle = "rgba(10,24,18,.35)"; x.lineWidth = 0.6; x.stroke();
      }
      ell(x, o.x - r * 0.1, o.y - r * 0.12, r * 0.14, r * 0.12, "rgba(120,160,110,.4)");
      return;
    }
    var nb = Math.max(5, Math.round(r / 2.4));
    for (var k = 0; k < nb; k++) {
      var a = rs() * 6.283, d = rs() * r * 0.5;
      lump(x, o.x + Math.cos(a) * d, o.y + Math.sin(a) * d * 0.85, r * (0.38 + rs() * 0.22), K.lumps[k % 4], K.hi);
    }
    lump(x, o.x - r * 0.18, o.y - r * 0.2, r * 0.45, K.lumps[3], K.hi);
    leaves(x, o.x, o.y, r * 1.02, rs, Math.round(r * r * 0.9), K.pal);
    rim(x, o.x, o.y, r, rs, K.pal);
  }
  /* a feathered edge: single leaves standing out past the crown's outline,
     bright where they face the sun, so no crown reads as a ball */
  function rim(x, cx, cy, r, rs, pal) {
    var n = Math.round(r * 4.2);
    for (var i = 0; i < n; i++) {
      var a = rs() * 6.283, d = r * (0.86 + rs() * 0.22), lx = cx + Math.cos(a) * d, ly = cy + Math.sin(a) * d * 0.88;
      var lit = -(Math.cos(a) * 0.7 + Math.sin(a)) / 1.22, k = Math.max(0, Math.min(4, Math.round(1.8 + lit * 2 + (rs() - 0.5))));
      var c = pal[k];
      x.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (0.7 + rs() * 0.3) + ")";
      ell(x, lx, ly, 1 + rs() * 0.9, 0.55 + rs() * 0.4, null, a + 1.57 + (rs() - 0.5)); x.fill();
    }
  }
  /* the great gray beech's crown: wider than anything near it, a paler,
     fresher green, with sun lying on the top of it */
  function beechCrown(x, cx, cy) {
    var rs = R(4242), r = 46;
    for (var k = 0; k < 22; k++) {
      var a = rs() * 6.283, d = Math.sqrt(rs()) * r * 0.62;
      lump(x, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r * (0.24 + rs() * 0.16), ["#4e7a2a", "#5a8a30", "#46702a", "#68983a"][k % 4], "#cce882");
    }
    var bp = [[52, 84, 28], [74, 112, 36], [104, 148, 48], [150, 196, 74], [214, 240, 140]];
    leaves(x, cx, cy, r * 1.04, rs, 1500, bp);
    rim(x, cx, cy, r, rs, bp);
    /* the gap in the roof it makes: a ring of light round its crown */
    x.save(); x.globalCompositeOperation = "lighter";
    x.fillStyle = rg(x, cx - 10, cy - 12, 4, r * 0.9, [[0, "rgba(255,240,170,.16)"], [1, "rgba(255,240,170,0)"]]); x.fillRect(cx - r, cy - r, r * 2, r * 2);
    x.restore();
  }

  /* leaves, lit from the upper left: many small strokes over the lumps so
     a canopy reads as foliage rather than balls */
  function leaves(x, cx, cy, r, rs, n, pal) {
    pal = pal || [[60, 104, 44], [78, 128, 52], [102, 156, 64], [142, 190, 88], [196, 226, 128]];
    for (var i = 0; i < n; i++) {
      var a = rs() * 6.283, d = Math.sqrt(rs()) * r, lx = cx + Math.cos(a) * d, ly = cy + Math.sin(a) * d * 0.88;
      var lit = ((cx - lx) * 0.7 + (cy - ly)) / r;                  // toward the sun
      var k = Math.max(0, Math.min(4, Math.round(1.6 + lit * 1.6 + (rs() - 0.5) * 1.4)));
      var c = pal[k], al = 0.55 + rs() * 0.4;
      x.fillStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + al + ")";
      ell(x, lx, ly, 0.9 + rs() * 0.9, 0.5 + rs() * 0.4, null, rs() * 3.14); x.fill();
    }
  }
  BS.leaves = leaves;
  /* a single round tree */
  BS.paintCanopy = function (seed, r) {
    var d = r * 2 + 8, c = wc(d, d, PRES), x = c.x, rs = R(seed);
    var cols = ["#3d6a2c", "#4a7a34", "#56883c", "#355e26"];
    for (var k = 0; k < 9; k++) {
      var a = rs() * 6.283, rr2 = rs() * r * 0.55;
      lump(x, d / 2 + Math.cos(a) * rr2, d / 2 + Math.sin(a) * rr2 * 0.8, r * (0.42 + rs() * 0.25), cols[k % 4], "#a6d070");
    }
    lump(x, d / 2 - r * 0.15, d / 2 - r * 0.2, r * 0.5, "#5a923e", "#c2e488");
    leaves(x, d / 2, d / 2, r * 1.02, rs, 260);
    /* sky light on the rim of the crown */
    x.strokeStyle = "rgba(230,250,190,.35)"; x.lineWidth = 0.7; x.beginPath(); x.arc(d / 2, d / 2, r * 0.95, 3.3, 4.6); x.stroke();
    for (k = 0; k < 18; k++) ell(x, d / 2 + (rs() - 0.5) * r * 1.6, d / 2 + (rs() - 0.5) * r * 1.4, 1.1, 0.7, rs() < 0.5 ? "rgba(220,250,170,.35)" : "rgba(20,40,10,.3)", rs() * 3);
    return c;
  };

  /* ================= people ================= */
  /* Round heads, small bodies, soft light from the upper left: a toy you'd
     want on a shelf. 16 x 24 world units, feet at the bottom. */
  var CAST = {
    wren: { hair: "#3b2a20", style: "messy", skin: "#e2b08c", shirt: "#3f938c", pants: "#3e5a80", shoes: "#8a6440", book: 1 },
    beck: { hair: "#d0a052", style: "pony", skin: "#efc09a", nose: "#e8806a", shirt: "#c05a40", pants: "#9a8a5a", shorts: 1, scab: 1, shoes: "#e6e2d6", stick: 1 },
    dad: { adult: 1, hair: "#4a3a2e", style: "short", skin: "#dcaa84", shirt: "#6d7a8a", pants: "#3f4a58", shoes: "#3a2a1a" },
    dadDay1: { adult: 1, hair: "#4a3a2e", style: "short", skin: "#dcaa84", shirt: "#dcaa84", bare: 1, towel: 1, pants: "#3f4a58", shoes: "#3a2a1a", sit: 1 },
    dadSit: { adult: 1, hair: "#4a3a2e", style: "short", skin: "#dcaa84", shirt: "#6d7a8a", pants: "#3f4a58", shoes: "#3a2a1a", sit: 1 },
    worker: { adult: 1, hair: "#6a4a30", style: "short", skin: "#d09c78", shirt: "#4a5866", vest: "#d8f03a", pants: "#2f3e5a", shoes: "#5a3a22", cap: "#e8e4d8" },
    worker2: { adult: 1, hair: "#1e1612", style: "bald", skin: "#93623e", shirt: "#3a3a3a", vest: "#f2902a", pants: "#2f3e5a", shoes: "#5a3a22" },
    beckdad: { adult: 1, hair: "#7a5a2a", style: "short", skin: "#e4ac88", shirt: "#9a3a2e", plaid: 1, pants: "#3a4a6a", shoes: "#4a3420", cap: "#2f4a2f" }
  };
  BS.CAST = CAST;
  /* face: { lx, ly: where the eyes look (-1..1), mood: "" | happy | wow |
     worry | firm | sad | ask | yawn, talk: mouth open, phone: held up } */
  function person(o, dir, f, blink, res, face) {
    face = face || {};
    var c = wc(16, 24, res || SPR), x = c.x;
    var mirror = dir === 3; if (mirror) { x.translate(16, 0); x.scale(-1, 1); dir = 2; }
    var ph = f === 1 ? 1 : f === 2 ? -1 : 0, adult = o.adult;
    var hr = adult ? 4.6 : 5.4, hx = 8, hy = adult ? 6.2 : 8.2;
    var bt = hy + hr - 1.2, bb = adult ? 19.6 : 19.4, lb = 23.4;
    var edge = "rgba(40,24,16,.55)";
    function fill(path, f2, ln) { path(); x.fillStyle = f2; x.fill(); if (ln !== false) { x.strokeStyle = edge; x.lineWidth = 0.45; x.stroke(); } }
    function skinG(cx, cy, r) { return rg(x, cx - r * 0.4, cy - r * 0.5, r * 0.1, r * 1.3, [[0, shade(o.skin, 0.25)], [0.6, o.skin], [1, shade(o.skin, -0.2)]]); }
    if (o.sit) {
      fill(function () { x.beginPath(); x.ellipse(8, 20.6, 6.6, 2.6, 0, 0, 6.2832); }, lg(x, 0, 18, 0, 23, [[0, shade(o.pants, 0.15)], [1, shade(o.pants, -0.2)]]));
      ell(x, 2.6, 21.4, 1.5, 1, o.shoes); ell(x, 13.4, 21.4, 1.5, 1, o.shoes);
      fill(function () { rr(x, 4.3, 12.4, 7.4, 8, 3); }, lg(x, 4, 0, 12, 0, [[0, shade(o.shirt, 0.15)], [1, shade(o.shirt, -0.2)]]));
      fill(function () { rr(x, 2.6, 13.2, 2.2, 6, 1.1); }, skinG(3.7, 15, 2)); fill(function () { rr(x, 11.2, 13.2, 2.2, 6, 1.1); }, skinG(12.3, 15, 2));
      hy = 8.2;
    } else {
      var legC = o.shorts ? o.skin : o.pants, lw = adult ? 2.5 : 2.3;
      if (dir === 2) {
        fill(function () { rr(x, 6.6 + ph * 1.4, bb - 1, lw, lb - bb + 0.6, 1.1); }, shade(legC, -0.15));
        fill(function () { rr(x, 7.6 - ph * 1.4, bb - 1, lw, lb - bb + 0.6, 1.1); }, legC);
        ell(x, 8.3 + ph * 1.4, lb - 0.4, 1.8, 0.9, o.shoes); ell(x, 9.3 - ph * 1.4, lb - 0.4, 1.8, 0.9, shade(o.shoes, 0.1));
      } else {
        var l1 = ph > 0 ? 0.9 : 0, l2 = ph < 0 ? 0.9 : 0;
        fill(function () { rr(x, 5.5, bb - 1, lw, lb - bb + 0.6 - l1, 1.1); }, legC);
        fill(function () { rr(x, 10.5 - lw + 0.5, bb - 1, lw, lb - bb + 0.6 - l2, 1.1); }, shade(legC, -0.08));
        if (o.scab && dir === 0) ell(x, 10.3, bb + 1.3, 0.45, 0.4, "#9a4030");
        ell(x, 6.6, lb - 0.5 - l1, 1.6, 0.95, o.shoes); ell(x, 9.9, lb - 0.5 - l2, 1.6, 0.95, o.shoes);
      }
      if (o.shorts) fill(function () { rr(x, 5, bb - 1.6, 6.2, 2.6, 1); }, o.pants);
      var armC = o.bare ? o.skin : o.shirt;
      if (dir === 2) fill(function () { rr(x, 7 - ph * 1.2, bt + 1, 2.2, 5.4, 1.1); }, shade(o.skin, -0.12));
      var bw = adult ? 8.2 : 7.4;
      fill(function () { rr(x, 8 - bw / 2, bt, bw, bb - bt + 0.4, 2.6); }, lg(x, 8 - bw / 2, bt, 8 + bw / 2, bb, [[0, shade(armC, 0.2)], [0.5, armC], [1, shade(armC, -0.22)]]));
      if (o.vest) { x.save(); rr(x, 8 - bw / 2, bt, bw, bb - bt + 0.4, 2.6); x.clip(); x.fillStyle = o.vest; x.fillRect(8 - bw / 2, bt, 2.6, 20); x.fillRect(8 + bw / 2 - 2.6, bt, 2.6, 20); x.fillStyle = "rgba(240,248,250,.9)"; x.fillRect(8 - bw / 2, bb - 3, bw, 0.8); x.restore(); }
      if (o.plaid) { x.save(); rr(x, 8 - bw / 2, bt, bw, bb - bt + 0.4, 2.6); x.clip(); x.fillStyle = "rgba(0,0,0,.22)"; for (var p = 0; p < 10; p += 2) { x.fillRect(8 - bw / 2 + p, bt, 0.7, 12); x.fillRect(8 - bw / 2, bt + p, bw, 0.7); } x.restore(); }
      if (o.book && dir === 0) rr(x, 6.2, bt + 1.6, 3, 3.4, 0.5, "rgba(80,50,30,.4)");
      if (dir !== 2) {
        var sw = ph * 0.9;
        fill(function () { rr(x, 8 - bw / 2 - 1.6, bt + 0.8 + sw, 2.2, 5.6, 1.1); }, skinG(8 - bw / 2 - 0.5, bt + 2, 2));
        fill(function () { rr(x, 8 + bw / 2 - 0.6, bt + 0.8 - sw, 2.2, 5.6, 1.1); }, skinG(8 + bw / 2 + 0.5, bt + 2, 2));
        if (!o.bare) { fill(function () { rr(x, 8 - bw / 2 - 1.7, bt + 0.5 + sw, 2.4, 2.4, 1.1); }, shade(armC, 0.05)); fill(function () { rr(x, 8 + bw / 2 - 0.7, bt + 0.5 - sw, 2.4, 2.4, 1.1); }, shade(armC, -0.1)); }
        if (o.stick && dir === 0) { x.strokeStyle = "#7a5432"; x.lineWidth = 0.8; x.lineCap = "round"; x.beginPath(); x.moveTo(13.2, bt + 5.5); x.lineTo(15, bt - 3); x.stroke(); }
      } else {
        fill(function () { rr(x, 7.4 + ph * 1.2, bt + 0.8, 2.2, 5.4, 1.1); }, skinG(8.4, bt + 3, 2));
        if (!o.bare) fill(function () { rr(x, 7.2 + ph * 1.2, bt + 0.4, 2.6, 2.4, 1.1); }, armC);
        if (o.stick) { x.strokeStyle = "#7a5432"; x.lineWidth = 0.8; x.lineCap = "round"; x.beginPath(); x.moveTo(9 + ph, bt + 5.4); x.lineTo(13.5, bt - 2); x.stroke(); }
      }
    }
    /* head */
    if (o.style === "pony" && dir !== 0) { var pxp = dir === 1 ? 8 : 3.3; fill(function () { x.beginPath(); x.ellipse(pxp, hy + 3.4, 1.6, 2.8, dir === 2 ? 0.5 : 0, 0, 6.2832); }, o.hair); }
    fill(function () { x.beginPath(); x.ellipse(hx, hy, hr, hr * 0.96, 0, 0, 6.2832); }, skinG(hx, hy, hr));
    var hairG = rg(x, hx - hr * 0.4, hy - hr * 0.6, 0.2, hr * 1.4, [[0, shade(o.hair, 0.35)], [0.5, o.hair], [1, shade(o.hair, -0.3)]]);
    if (o.style !== "bald") {
      if (dir === 1) {
        fill(function () { x.beginPath(); x.ellipse(hx, hy - 0.2, hr + 0.25, hr * 0.98, 0, 0, 6.2832); }, hairG);
        x.strokeStyle = shade(o.hair, 0.4); x.lineWidth = 0.35; x.beginPath(); x.arc(hx - 0.8, hy - 1.2, hr * 0.55, 3.6, 5.4); x.stroke();
      } else if (dir === 2) {
        fill(function () { x.beginPath(); x.moveTo(hx + hr * 0.9, hy - hr * 0.2); x.quadraticCurveTo(hx + hr * 0.6, hy - hr * 1.15, hx - hr * 0.2, hy - hr * 1.05); x.quadraticCurveTo(hx - hr * 1.2, hy - hr * 0.6, hx - hr * 1.02, hy + hr * 0.5); x.quadraticCurveTo(hx - hr * 0.3, hy + hr * 0.3, hx + hr * 0.1, hy - hr * 0.2); x.closePath(); }, hairG);
      } else {
        fill(function () {
          x.beginPath(); x.moveTo(hx - hr * 1.02, hy + hr * 0.25);
          x.quadraticCurveTo(hx - hr * 1.1, hy - hr * 1.15, hx, hy - hr * 1.05);
          x.quadraticCurveTo(hx + hr * 1.1, hy - hr * 1.15, hx + hr * 1.02, hy + hr * 0.25);
          if (o.style === "messy") { x.lineTo(hx + hr * 0.6, hy - hr * 0.15); x.lineTo(hx + hr * 0.35, hy - hr * 0.42); x.lineTo(hx, hy - hr * 0.1); x.lineTo(hx - hr * 0.3, hy - hr * 0.45); x.lineTo(hx - hr * 0.62, hy - hr * 0.12); }
          else { x.quadraticCurveTo(hx + hr * 0.4, hy - hr * 0.55, hx, hy - hr * 0.42); x.quadraticCurveTo(hx - hr * 0.5, hy - hr * 0.55, hx - hr * 1.02, hy + hr * 0.25); }
          x.closePath();
        }, hairG);
      }
      if (o.style === "messy") { fill(function () { x.beginPath(); x.moveTo(hx - 1.2, hy - hr * 0.95); x.lineTo(hx - 0.2, hy - hr * 1.38); x.lineTo(hx + 0.6, hy - hr * 0.95); x.closePath(); }, o.hair, false); fill(function () { x.beginPath(); x.moveTo(hx + 1.4, hy - hr * 0.9); x.lineTo(hx + 2.8, hy - hr * 1.25); x.lineTo(hx + 2.8, hy - hr * 0.7); x.closePath(); }, o.hair, false); }
    }
    if (o.towel) { fill(function () { rr(x, hx - hr - 0.4, hy - hr * 0.95, hr * 2 + 0.8, 3.4, 1.4); }, "#f4f2ec"); x.fillStyle = "#4a7ab0"; x.fillRect(hx - hr - 0.2, hy - hr * 0.95 + 1.4, hr * 2 + 0.4, 0.7); fill(function () { rr(x, hx + hr - 0.4, hy - 1, 2, 3, 0.8); }, "#ecebe4"); }
    if (o.cap) { fill(function () { x.beginPath(); x.ellipse(hx, hy - hr * 0.55, hr * 1.02, hr * 0.62, 0, Math.PI, 0); x.closePath(); }, lg(x, 0, hy - hr, 0, hy, [[0, shade(o.cap, 0.2)], [1, shade(o.cap, -0.2)]])); if (dir !== 1) fill(function () { x.beginPath(); x.ellipse(dir === 2 ? hx + hr * 0.7 : hx, hy - hr * 0.5, dir === 2 ? hr * 0.75 : hr * 0.95, 1, 0, 0, 6.2832); }, shade(o.cap, -0.15)); }
    /* face: eyes that look at things, brows that carry the mood, a mouth that talks */
    var md = face.mood || "", lx = (face.lx || 0) * 0.45, ly = (face.ly || 0) * 0.35, ink = "#2a1d18", brow = shade(o.hair, -0.1);
    function line(pts, w, col) { x.strokeStyle = col || ink; x.lineWidth = w || 0.4; x.lineCap = "round"; x.beginPath(); x.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.stroke(); }
    if (dir === 0) {
      var ey = hy + 0.9, shut = blink || md === "yawn" || md === "sleep";
      if (shut) { line([hx - 2.7, ey, hx - 1.4, ey]); line([hx + 1.4, ey, hx + 2.7, ey]); }
      else if (md === "happy") { x.strokeStyle = ink; x.lineWidth = 0.42; x.beginPath(); x.arc(hx - 2, ey + 0.5, 0.75, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); x.beginPath(); x.arc(hx + 2, ey + 0.5, 0.75, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); }
      else {
        var big = md === "wow" ? 1.22 : 1;
        if (md === "wow") { ell(x, hx - 2, ey, 0.95, 1.2, "#fff"); ell(x, hx + 2, ey, 0.95, 1.2, "#fff"); }
        ell(x, hx - 2 + lx, ey + ly, 0.7 * big * (md === "wow" ? 0.75 : 1), 1.05 * big * (md === "wow" ? 0.8 : 1), ink); ell(x, hx + 2 + lx, ey + ly, 0.7 * big * (md === "wow" ? 0.75 : 1), 1.05 * big * (md === "wow" ? 0.8 : 1), ink);
        ell(x, hx - 2.2 + lx, ey - 0.4 + ly, 0.28, 0.32, "#fff"); ell(x, hx + 1.8 + lx, ey - 0.4 + ly, 0.28, 0.32, "#fff");
      }
      /* brows: only when the face is doing something */
      var by = ey - 1.9;
      if (md === "worry" || md === "sad") { line([hx - 3, by + 0.2, hx - 1.3, by - 0.5], 0.42, brow); line([hx + 1.3, by - 0.5, hx + 3, by + 0.2], 0.42, brow); }
      else if (md === "firm") { line([hx - 3, by - 0.4, hx - 1.3, by + 0.25], 0.48, brow); line([hx + 1.3, by + 0.25, hx + 3, by - 0.4], 0.48, brow); }
      else if (md === "wow" || md === "ask") { line([hx - 3, by - 0.3, hx - 1.4, by - 0.65], 0.38, brow); line([hx + 1.4, by - 0.65, hx + 3, by - (md === "ask" ? 0.05 : 0.3)], 0.38, brow); }
      ell(x, hx - 3, hy + 2.3, 1, 0.55, md === "happy" || md === "wow" ? "rgba(240,110,100,.55)" : "rgba(240,120,110,.35)"); ell(x, hx + 3, hy + 2.3, 1, 0.55, md === "happy" || md === "wow" ? "rgba(240,110,100,.55)" : "rgba(240,120,110,.35)");
      if (o.nose) ell(x, hx, hy + 1.9, 0.75, 0.5, o.nose);
      var my = hy + 2.9;
      if (md === "yawn") { ell(x, hx, my + 0.2, 0.9, 1.15, "#5a2a22"); ell(x, hx, my + 0.6, 0.55, 0.45, "#c8605a"); }
      else if (md === "sleep") ell(x, hx, my + 0.1, 0.4, 0.45, "#5a2a22");
      else if (face.talk) { ell(x, hx, my, 0.85, md === "wow" ? 0.85 : 0.6, "#5a2a22"); ell(x, hx, my + 0.3, 0.5, 0.25, "#d0706a"); }
      else if (md === "wow") ell(x, hx, my, 0.5, 0.6, "#5a2a22");
      else if (md === "happy") { x.strokeStyle = "rgba(90,40,30,.85)"; x.lineWidth = 0.38; x.beginPath(); x.arc(hx, my - 0.6, 1.1, 0.25, Math.PI - 0.25); x.stroke(); }
      else if (md === "worry" || md === "sad") { x.strokeStyle = "rgba(90,40,30,.75)"; x.lineWidth = 0.32; x.beginPath(); x.arc(hx, my + 0.6, 0.7, Math.PI + 0.4, -0.4); x.stroke(); }
      else if (md === "firm") line([hx - 0.8, my, hx + 0.8, my], 0.34, "rgba(90,40,30,.8)");
      else { x.strokeStyle = "rgba(90,40,30,.75)"; x.lineWidth = 0.32; x.beginPath(); x.arc(hx, my - 0.3, 0.7, 0.3, Math.PI - 0.3); x.stroke(); }
      /* the phone, held up in both hands to look for a bar */
      if (face.phone) {
        rr(x, hx - 1.7, bt + 1.2, 3.4, 4.4, 0.6, "#1c1c22"); rr(x, hx - 1.3, bt + 1.6, 2.6, 3.4, 0.3, face.phone === 2 ? "#0a0c10" : "#9fd0e8");
        ell(x, hx - 2.2, bt + 4, 1, 0.9, o.skin); ell(x, hx + 2.2, bt + 4, 1, 0.9, o.skin);
        if (face.phone !== 2) { x.fillStyle = "rgba(160,220,255,.18)"; x.beginPath(); x.ellipse(hx, hy + 1.5, hr * 0.9, hr * 0.7, 0, 0, 6.2832); x.fill(); }
      }
    } else if (dir === 2) {
      if (blink || md === "yawn") line([hx + 1.8, hy + 0.9, hx + 3, hy + 0.9]);
      else if (md === "happy") { x.strokeStyle = ink; x.lineWidth = 0.42; x.beginPath(); x.arc(hx + 2.4, hy + 1.4, 0.7, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); }
      else { ell(x, hx + 2.4 + Math.max(0, lx) * 0.4, hy + 0.9 + ly, 0.62 * (md === "wow" ? 1.2 : 1), 1 * (md === "wow" ? 1.2 : 1), ink); ell(x, hx + 2.25, hy + 0.5 + ly, 0.25, 0.3, "#fff"); }
      if (md === "worry" || md === "firm" || md === "wow") line([hx + 1.6, hy - 1 + (md === "firm" ? 0.3 : 0), hx + 3.2, hy - 1 - (md === "worry" ? 0.5 : md === "wow" ? 0.4 : -0.2)], 0.42, brow);
      ell(x, hx + 2.6, hy + 2.4, 0.9, 0.5, md === "happy" ? "rgba(240,110,100,.55)" : "rgba(240,120,110,.35)");
      if (o.nose) ell(x, hx + hr - 0.3, hy + 1.8, 0.55, 0.45, o.nose);
      if (face.talk || md === "yawn" || md === "wow") ell(x, hx + hr - 1.1, hy + 3, 0.55, face.talk ? 0.45 : 0.6, "#5a2a22");
      ell(x, hx - 0.8, hy + 0.9, 0.8, 1.1, shade(o.skin, -0.12));
      if (face.phone) { rr(x, hx + 2.6, hy + 2.6, 1.4, 3, 0.4, "#1c1c22"); x.fillStyle = face.phone === 2 ? "#0a0c10" : "#9fd0e8"; x.fillRect(hx + 2.7, hy + 2.9, 0.6, 2.4); ell(x, hx + 3.4, hy + 5.6, 0.9, 0.8, o.skin); }
    }
    return c;
  }
  var spriteCache = {};
  function faceKey(fc) { return fc ? (fc.mood || "") + "|" + (fc.lx || 0) + "|" + (fc.ly || 0) + "|" + (fc.talk ? 1 : 0) + "|" + (fc.phone || 0) : ""; }
  var spriteOrder = [];
  BS.sprite = function (who, dir, f, blink, face) {
    if (dir === 1) { face = face && face.phone ? { phone: face.phone } : null; blink = false; }      // from behind, a face is just hair
    var k = who + dir + "_" + (f % 4) + (blink ? "b" : "") + faceKey(face);
    if (!spriteCache[k]) {
      spriteCache[k] = person(CAST[who], dir, f % 4 === 1 ? 1 : f % 4 === 3 ? 2 : 0, blink, null, face);
      /* faces make many variants: keep the most recent few hundred, drop the oldest */
      spriteOrder.push(k); while (spriteOrder.length > 260) delete spriteCache[spriteOrder.shift()];
    }
    return spriteCache[k];
  };

  /* portraits for the dialogue box: the same person, much finer, head and
     shoulders. Gran is a voice on a phone, so hers is the phone. */
  var portCache = {};
  BS.portrait = function (who, blink, face) {
    var map = { wren: "wren", beck: "beck", dad: "dad", worker: "worker", beckdad: "beckdad", gran: "gran" };
    var cast = map[who]; if (!cast) return null;
    var k = cast + (blink ? "b" : "") + faceKey(face);
    if (portCache[k]) return portCache[k];
    var c;
    if (cast === "gran") {
      c = wc(16, 16, 12); var x = c.x;
      rr(x, 5, 2.5, 6, 11, 1.2, "#22222a"); rr(x, 5.6, 3.6, 4.8, 8, 0.6, lg(x, 0, 3, 0, 12, [[0, "#3a4a5a"], [1, "#1e2630"]]));
      x.strokeStyle = "rgba(230,201,240,.85)"; x.lineWidth = 0.5; x.lineCap = "round";
      for (var r2 = 1; r2 < 4; r2++) { x.beginPath(); x.arc(8, 2.6, r2 * 1.5, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); }
      ell(x, 8, 7.6, 1.6, 1.6, "rgba(255,240,210,.9)");
    } else {
      var full = person(CAST[cast], 0, 0, blink, 12, face);
      var adult = CAST[cast].adult;
      c = wc(16, 16, 12); c.x.drawImage(full, 0, (adult ? 0 : 2.4) * 12, 16 * 12, 16 * 12, 0, 0, 16, 16);
    }
    portCache[k] = c;
    return c;
  };

  /* the dog by the pit gate: old, chained, asleep */
  BS.dog = (function () {
    var c = wc(16, 12, SPR), x = c.x;
    shadow(x, 8, 10, 7, 2, 0.35);
    lump(x, 7.5, 7.4, 4.4, "#9a7448"); lump(x, 12, 6, 2.8, "#a07a4c");
    ell(x, 13.6, 4.6, 1.2, 1.8, "#6a4a2a", -0.4); ell(x, 14.4, 6.8, 0.9, 0.6, "#2a1a10");
    x.strokeStyle = "#2a1a10"; x.lineWidth = 0.3; x.beginPath(); x.arc(12.2, 6.2, 0.7, 0.2, 2.8); x.stroke();
    ell(x, 3.4, 9, 2, 0.8, "#8a6440", 0.3); ell(x, 8, 10.2, 3.5, 0.9, "#c8b08a");
    return c;
  })();

  /* ================= buildings ================= */
  /* Gran's house: white weatherboard gone gray, a deep tiled roof, the
     chimney, windows dark because the power is cut, the porch. */
  BS.paintHouse = function (w, h) {
    var W = w * T, Hh = h * T + 30, c = wc(W + 12, Hh + 8, PRES), x = c.x;
    var wallTop = Hh - 3 * T - 6;
    shadow(x, W / 2 + 10, Hh - 2, W * 0.58, 12, 0.35);
    x.fillStyle = lg(x, 0, wallTop, W, Hh, [[0, "#ece6d6"], [1, "#c8bfac"]]); x.fillRect(0, wallTop, W, Hh - wallTop - 2);
    for (var j = wallTop + 2; j < Hh - 2; j += 3) { x.fillStyle = "rgba(120,105,85,.35)"; x.fillRect(0, j, W, 0.45); x.fillStyle = "rgba(255,255,255,.35)"; x.fillRect(0, j + 0.45, W, 0.35); }
    x.fillStyle = "rgba(0,0,0,.08)"; x.fillRect(W - 10, wallTop, 10, Hh - wallTop - 2);
    x.fillStyle = "#9a9080"; x.fillRect(0, Hh - 4, W, 2.5);
    for (var r = 0; r < wallTop + 4; r += 3.2) {
      x.fillStyle = mix("#8a4a3a", "#6a3428", r / (wallTop + 4)); x.fillRect(0, r, W, 3.4);
      for (var i = (Math.round(r / 3.2) % 2) * 2.5; i < W; i += 5) { x.fillStyle = "rgba(255,210,180,.15)"; x.fillRect(i, r, 4.4, 0.7); x.fillStyle = "rgba(40,10,5,.25)"; x.fillRect(i + 4.4, r, 0.6, 3.4); }
    }
    x.fillStyle = lg(x, 0, 0, W, 0, [[0, "rgba(255,220,180,.18)"], [0.6, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.18)"]]); x.fillRect(0, 0, W, wallTop + 4);
    rr(x, -2, wallTop + 2, W + 4, 3.4, 1, "#4a2820");
    x.fillStyle = lg(x, 0, wallTop + 5, 0, wallTop + 11, [[0, "rgba(30,15,10,.45)"], [1, "rgba(30,15,10,0)"]]); x.fillRect(0, wallTop + 5, W, 6);
    rr(x, -2, -1, W + 4, 2.4, 1, "#a05a46");
    rr(x, W - 42, 2, 13, 24, 1, lg(x, W - 42, 0, W - 29, 0, [[0, "#b05a40"], [1, "#7a3a28"]]));
    for (var b = 6; b < 24; b += 3) { x.fillStyle = "rgba(60,20,10,.4)"; x.fillRect(W - 42, b, 13, 0.4); }
    rr(x, W - 43.5, 0.5, 16, 3, 0.8, "#5a2a1c");
    [16, W - 52, W - 30].forEach(function (px) {
      var wy = wallTop + 12;
      rr(x, px - 1, wy - 1, 18, 18, 1, "#6b5038");
      x.fillStyle = lg(x, 0, wy, 0, wy + 16, [[0, "#3a4a58"], [1, "#222a32"]]); x.fillRect(px + 1, wy + 1, 14, 14);
      x.fillStyle = "rgba(200,220,240,.18)"; x.beginPath(); x.moveTo(px + 1, wy + 1); x.lineTo(px + 8, wy + 1); x.lineTo(px + 1, wy + 8); x.fill();
      x.fillStyle = "#6b5038"; x.fillRect(px + 7.4, wy + 1, 1.2, 14); x.fillRect(px + 1, wy + 7.4, 14, 1.2);
      rr(x, px - 2, wy + 16, 20, 2, 0.6, "#8a6a48");
      rr(x, px - 1, wy + 18, 18, 3, 0.8, "#7a5234");
      for (var g = 0; g < 5; g++) { lump(x, px + 1 + g * 3.6, wy + 17.4, 1.8, "#4a7a34"); ell(x, px + 1.4 + g * 3.6, wy + 16.6, 1, 1, g % 2 ? "#e04a4a" : "#f07a6a"); }
    });
    var dx = (39 - 34) * T;
    rr(x, dx - 2, wallTop + 11, T + 4, Hh - wallTop - 13, 1, "#e8e2d2");
    rr(x, dx, wallTop + 13, T, Hh - wallTop - 15, 0.8, lg(x, 0, wallTop + 13, 0, Hh, [[0, "#3e5a46"], [1, "#2a4232"]]));
    rr(x, dx + 2, wallTop + 15, T - 4, 8, 0.6, "rgba(255,255,255,.08)"); rr(x, dx + 2, wallTop + 26, T - 4, 9, 0.6, "rgba(255,255,255,.08)");
    ell(x, dx + 12.5, wallTop + 30, 0.9, 0.9, "#e0c060");
    rr(x, dx - 6, Hh - 5, T + 12, 4, 1, lg(x, 0, Hh - 5, 0, Hh - 1, [[0, "#b8b0a0"], [1, "#7a7266"]]));
    ell(x, dx + 8, wallTop + 9, 1.6, 1.2, "#2a2a26");
    c.base = Hh;
    return c;
  };
  BS.paintShed = function (w, h) {
    var W = w * T, Hh = h * T + 16, c = wc(W + 10, Hh + 6, PRES), x = c.x;
    var wallTop = Hh - 2 * T - 6;
    shadow(x, W / 2 + 8, Hh - 2, W * 0.6, 8, 0.32);
    for (var i = 0; i < W; i += 4) {
      var lean = (i / W) * 2.4, cB = mix("#9c968a", "#b8b2a4", H(i, 3, 5));
      x.fillStyle = lg(x, i, 0, i + 4, 0, [[0, shade(cB, 0.12)], [1, shade(cB, -0.18)]]); x.fillRect(i, wallTop + lean, 3.7, Hh - wallTop - lean - 2);
      x.fillStyle = "#4a463e"; x.fillRect(i + 3.7, wallTop + lean, 0.3, Hh - wallTop - lean - 2);
      if (H(i, 7, 9) > 0.6) { x.fillStyle = "rgba(90,120,70,.35)"; x.fillRect(i, Hh - 7, 3.7, 5); }
    }
    for (var r = 0; r < wallTop + 3; r += 2.5) { x.fillStyle = mix("#5a5a54", "#44443e", r / wallTop); x.fillRect(0, r + r / wallTop * 2, W, 2.6); x.fillStyle = "rgba(255,255,255,.08)"; x.fillRect(0, r + r / wallTop * 2, W, 0.5); }
    rr(x, -1.5, wallTop + 1, W + 3, 3, 1, "#33332f");
    var dx = 2 * T;
    rr(x, dx, wallTop + 7, T, Hh - wallTop - 9, 0.8, lg(x, 0, wallTop + 7, 0, Hh, [[0, "#7a6a50"], [1, "#5a4a36"]]));
    x.strokeStyle = "rgba(40,30,20,.5)"; x.lineWidth = 0.4; x.beginPath(); x.moveTo(dx + 1, wallTop + 9); x.lineTo(dx + T - 1, Hh - 4); x.stroke();
    ell(x, dx + 12, wallTop + 18, 0.7, 0.7, "#1c1c1c");
    c.base = Hh;
    return c;
  };
  BS.paintBeckHouse = function (w, h) {
    var W = w * T, Hh = h * T + 24, c = wc(W + 10, Hh + 6, PRES), x = c.x;
    var wallTop = Hh - 3 * T;
    shadow(x, W / 2 + 8, Hh - 2, W * 0.58, 10, 0.32);
    x.fillStyle = lg(x, 0, wallTop, W, Hh, [[0, "#d6dee4"], [1, "#a8b4bc"]]); x.fillRect(0, wallTop, W, Hh - wallTop - 2);
    for (var j = wallTop; j < Hh - 2; j += 4) { x.fillStyle = "rgba(90,110,125,.35)"; x.fillRect(0, j, W, 0.45); }
    for (var r = 0; r < wallTop + 4; r += 3) { x.fillStyle = mix("#4a5e72", "#3a4a5a", r / wallTop); x.fillRect(0, r, W, 3.2); x.fillStyle = "rgba(255,255,255,.08)"; x.fillRect(0, r, W, 0.5); }
    rr(x, -2, wallTop + 1, W + 4, 3, 1, "#26323e");
    BS.beckWindows = [[12, wallTop + 12], [W - 28, wallTop + 12], [W - 50, wallTop + 12]];
    BS.beckWindows.forEach(function (p) { rr(x, p[0] - 1, p[1] - 1, 18, 16, 1, "#4a5a66"); x.fillStyle = lg(x, 0, p[1], 0, p[1] + 14, [[0, "#ffe6a8"], [1, "#f2b860"]]); x.fillRect(p[0] + 1, p[1] + 1, 14, 12); x.fillStyle = "#4a5a66"; x.fillRect(p[0] + 7.4, p[1] + 1, 1.2, 12); x.fillStyle = "rgba(200,90,80,.5)"; x.fillRect(p[0] + 1, p[1] + 1, 3, 12); x.fillRect(p[0] + 12, p[1] + 1, 3, 12); });
    var dx = 3 * T;
    rr(x, dx, wallTop + 9, T, Hh - wallTop - 11, 0.8, lg(x, 0, wallTop + 9, 0, Hh, [[0, "#3e6a52"], [1, "#2a4a3a"]])); ell(x, dx + 12, wallTop + 26, 0.9, 0.9, "#e0c060");
    rr(x, dx - 8, Hh - 5, T + 16, 3.6, 1, lg(x, 0, Hh - 5, 0, Hh - 1.4, [[0, "#a89a86"], [1, "#6a5e4e"]]));
    var bx = dx + T + 8;
    x.strokeStyle = "#1c1c1c"; x.lineWidth = 0.9; x.beginPath(); x.arc(bx, Hh - 5, 3.4, 0, 6.3); x.stroke(); x.beginPath(); x.arc(bx + 11, Hh - 5, 3.4, 0, 6.3); x.stroke();
    x.strokeStyle = "#b33a2a"; x.lineWidth = 1; x.beginPath(); x.moveTo(bx, Hh - 5); x.lineTo(bx + 5, Hh - 11); x.lineTo(bx + 11, Hh - 5); x.moveTo(bx + 5, Hh - 11); x.lineTo(bx + 9, Hh - 11); x.stroke();
    rr(x, dx - 14, Hh - 6, 6, 3, 1, "#e2b22a"); ell(x, dx - 13, Hh - 3, 1, 1, "#222"); ell(x, dx - 9, Hh - 3, 1, 1, "#222");
    c.base = Hh;
    return c;
  };
  BS.paintTrailer = function (w, h) {
    var W = w * T, Hh = h * T + 10, c = wc(W + 8, Hh + 4, PRES), x = c.x;
    shadow(x, W / 2 + 6, Hh - 1, W * 0.6, 6, 0.35);
    rr(x, 0, 6, W, Hh - 10, 1.4, lg(x, 0, 6, 0, Hh - 4, [[0, "#4e8a5a"], [1, "#2e5a3a"]]));
    for (var i = 2; i < W; i += 3) { x.fillStyle = "rgba(0,0,0,.12)"; x.fillRect(i, 8, 0.5, Hh - 14); }
    rr(x, -1, 3, W + 2, 4, 1, "#2a4a30"); x.fillStyle = "rgba(255,255,255,.2)"; x.fillRect(0, 3, W, 0.6);
    rr(x, 13, Hh - 31, 19, 13, 0.8, "#1e2a24"); x.fillStyle = lg(x, 0, Hh - 30, 0, Hh - 19, [[0, "#b8ccd4"], [1, "#7a94a0"]]); x.fillRect(14.5, Hh - 29.5, 16, 10);
    x.fillStyle = "rgba(255,255,255,.35)"; x.beginPath(); x.moveTo(14.5, Hh - 29.5); x.lineTo(21, Hh - 29.5); x.lineTo(14.5, Hh - 23); x.fill();
    rr(x, W - 23, Hh - 35, 15, 28, 0.8, "#24382a"); rr(x, W - 21, Hh - 33, 11, 25, 0.5, "#0e1410");
    rr(x, W - 24, Hh - 7, 18, 3, 0.8, "#6a6a62");
    ell(x, 6, Hh - 3, 2.4, 2.4, "#2a2a28"); ell(x, W - 6, Hh - 3, 2.4, 2.4, "#2a2a28");
    c.base = Hh;
    return c;
  };
  BS.paintPipes = function (w) {
    var c = wc(w * T + 4, 24, PRES), x = c.x;
    shadow(x, w * T / 2 + 4, 20, w * T * 0.6, 4, 0.35);
    for (var i = 0; i < w * 2; i++) {
      var cx = 4.5 + i * 7.6, cy = i % 2 ? 10 : 16;
      ell(x, cx + 0.6, cy + 0.8, 6.2, 6.2, "rgba(0,0,0,.25)");
      ell(x, cx, cy, 6, 6, rg(x, cx - 2, cy - 2, 0.5, 7, [[0, "#c8c8c0"], [1, "#7a7a72"]]));
      ell(x, cx, cy, 3.8, 3.8, rg(x, cx + 1, cy + 1, 0.5, 4, [[0, "#1e1e1c"], [1, "#4a4a46"]]));
    }
    return c;
  };
  /* the great gray beech: smooth as skin, elephant-gray, its roots gripping
     the ground like a hand; the eyes beeches make where a branch let go */
  BS.paintBeech = function () {
    var c = wc(56, 64, PRES), x = c.x, cx = 27, rs = R(61);
    shadow(x, cx + 6, 57, 24, 6, 0.45);
    /* the roots: long knuckled flares, each lit on its upper-left side */
    [[-20, 5], [-13, 8], [-6, 9], [7, 9], [14, 7], [21, 4]].forEach(function (rt, i) {
      var ex = cx + rt[0], ey = 52 + rt[1] * 0.45;
      x.fillStyle = lg(x, cx, 42, ex, ey, [[0, "#8e9496"], [1, "#5e6466"]]);
      x.beginPath(); x.moveTo(cx - 6 + i * 2.2, 40); x.quadraticCurveTo(cx + rt[0] * 0.45, 47, ex, ey); x.quadraticCurveTo(ex + (rt[0] > 0 ? -2 : 2), ey + 1.6, ex - rt[0] * 0.08, ey + 0.4); x.quadraticCurveTo(cx + rt[0] * 0.3, 51, cx - 3 + i * 1.6, 44); x.closePath(); x.fill();
      x.strokeStyle = "rgba(220,226,226,.35)"; x.lineWidth = 0.5; x.beginPath(); x.moveTo(cx - 5 + i * 2.2, 42); x.quadraticCurveTo(cx + rt[0] * 0.42, 47.5, ex, ey - 0.6); x.stroke();
    });
    /* the trunk, flaring at the foot */
    x.fillStyle = lg(x, cx - 10, 0, cx + 11, 0, [[0, "#c6cbcc"], [0.3, "#a9afb1"], [0.7, "#868c8e"], [1, "#5c6264"]]);
    x.beginPath(); x.moveTo(cx - 8, 0); x.lineTo(cx + 8, 0); x.quadraticCurveTo(cx + 8.6, 30, cx + 12, 46); x.quadraticCurveTo(cx, 50, cx - 12, 46); x.quadraticCurveTo(cx - 8.6, 30, cx - 8, 0); x.closePath(); x.fill();
    /* the soft horizontal creases beech bark gathers, and its eyes */
    for (var j = 4; j < 44; j += 3.4 + rs() * 2) { x.strokeStyle = "rgba(70,76,80," + (0.18 + rs() * 0.15) + ")"; x.lineWidth = 0.45; x.beginPath(); x.moveTo(cx - 7.5 - j * 0.06, j); x.quadraticCurveTo(cx, j + 1 + rs(), cx + 7.5 + j * 0.06, j - 0.4); x.stroke(); }
    [[cx - 3, 14, 1.8], [cx + 3.5, 27, 1.4], [cx - 1, 36, 1.1]].forEach(function (e) {
      x.fillStyle = "rgba(60,64,68,.55)"; x.beginPath(); x.ellipse(e[0], e[1], e[2] * 1.6, e[2] * 0.7, 0, 0, 6.2832); x.fill();
      x.strokeStyle = "rgba(60,64,68,.4)"; x.lineWidth = 0.4; x.beginPath(); x.moveTo(e[0] - e[2] * 2.6, e[1] - e[2] * 0.6); x.quadraticCurveTo(e[0], e[1] - e[2] * 1.8, e[0] + e[2] * 2.6, e[1] - e[2] * 0.6); x.stroke();
    });
    /* sun down the lit edge; lichen and a long green stain of moss on the shady side */
    x.fillStyle = "rgba(240,244,240,.28)"; x.fillRect(cx - 6.6, 0, 1.6, 42);
    for (var k = 0; k < 9; k++) ell(x, cx - 5 + rs() * 10, 6 + rs() * 34, 0.8 + rs() * 1.2, 0.6 + rs() * 0.8, rs() < 0.5 ? "rgba(196,206,150,.5)" : "rgba(160,190,170,.45)");
    x.fillStyle = lg(x, 0, 18, 0, 48, [[0, "rgba(110,150,80,0)"], [1, "rgba(110,150,80,.55)"]]);
    x.beginPath(); x.moveTo(cx + 4, 18); x.quadraticCurveTo(cx + 9.4, 34, cx + 11.6, 46); x.quadraticCurveTo(cx + 7, 47, cx + 4.6, 46); x.quadraticCurveTo(cx + 5.4, 32, cx + 4, 18); x.fill();
    /* moss cushions at the foot, between the roots */
    [[cx - 9, 48], [cx + 3, 50], [cx + 13, 49]].forEach(function (mm, i) { lump(x, mm[0], mm[1], 2.4 + i * 0.4, "#4e7a2e", "#a6d064"); });
    c.base = 58;
    return c;
  };
  /* the fallen giant: more alive lying down than anything standing */
  BS.paintGiant = function (w) {
    var W = w * T, c = wc(W + 8, 48, PRES), x = c.x;
    shadow(x, W / 2 + 6, 40, W * 0.55, 7, 0.45);
    rr(x, 2, 14, W, 24, 11, lg(x, 0, 14, 0, 38, [[0, "#7a5e3c"], [0.5, "#5a4228"], [1, "#2e2214"]]));
    for (var i = 8; i < W; i += 5) { x.strokeStyle = "rgba(40,28,15,.35)"; x.lineWidth = 0.5; x.beginPath(); x.moveTo(i, 18); x.quadraticCurveTo(i + 2, 26, i - 1, 36); x.stroke(); }
    ell(x, 6, 25, 9, 19, rg(x, 4, 20, 1, 20, [[0, "#6a4e30"], [1, "#2e2214"]]));
    for (var r = 0; r < 8; r++) { x.strokeStyle = "#4a3420"; x.lineWidth = 1; x.beginPath(); x.moveTo(6, 25); x.lineTo(6 + Math.cos(r * 0.8 + 2) * 12, 25 + Math.sin(r * 0.8 + 2) * 18); x.stroke(); }
    var rs = R(9);
    for (i = 10; i < W; i += 1.6) lump(x, i, 16 - rs() * 1.5, 1.6 + rs() * 1.4, rs() < 0.5 ? "#5e8a36" : "#4e7a2e", "#9ccc5e");
    for (var f = 0; f < 6; f++) { var fx = 24 + f * (W - 40) / 6 + rs() * 8; for (var a = -4; a <= 4; a++) blade(x, fx, 34, 9 - Math.abs(a) * 0.6, a * 2.2, 1, "#2e5a26", "#7ab84a"); }
    for (var s = 0; s < 7; s++) { var sx = 30 + s * 19, sy = 27 + (s % 2) * 4; ell(x, sx + 3, sy + 1.2, 3.6, 1.6, "rgba(40,30,15,.4)"); ell(x, sx + 3, sy, 3.6, 1.4, lg(x, 0, sy - 1.4, 0, sy + 1.4, [[0, "#f6ecd2"], [1, "#c8b890"]])); }
    return c;
  };
  BS.paintSeedling = function (k) {
    var c = wc(10, 18, SPR), x = c.x;
    x.strokeStyle = "#6a5030"; x.lineWidth = 0.6; x.beginPath(); x.moveTo(5, 18); x.quadraticCurveTo(5.5, 10, 5, 3); x.stroke();
    ell(x, 3, 4 + (k % 2), 2.4, 1.2, "#7ac04a", -0.5); ell(x, 7.4, 2.6 + (k % 3) * 0.6, 2.4, 1.2, "#8ad05a", 0.5); ell(x, 4.6, 8, 2, 1, "#6aa83a", -0.3); ell(x, 6.4, 1.4, 1.2, 0.6, "#b6f080");
    return c;
  };
  BS.paintRock = function () {
    var c = wc(22, 20, PRES), x = c.x;
    shadow(x, 12, 16, 10, 3.5, 0.4);
    ell(x, 11, 10, 9.5, 7.5, rg(x, 7, 6, 1, 12, [[0, "#faf6ec"], [0.5, "#dcd6c6"], [1, "#9a948a"]]));
    for (var k = 0; k < 9; k++) ell(x, 10 + (k % 3) * 1.8, 5 + Math.floor(k / 3) * 1.3, 1.3, 0.9, k % 2 ? "#8a9a6a" : "#7a8a5a");
    return c;
  };
  BS.paintCompost = function () {
    var c = wc(36, 28, PRES), x = c.x;
    shadow(x, 20, 22, 16, 5, 0.35);
    lump(x, 18, 14, 11, "#5a4430", "#8a6a48");
    var rs = R(300);
    for (var k = 0; k < 50; k++) { var a = rs() * 6.28, r = rs() * 9; ell(x, 18 + Math.cos(a) * r, 14 + Math.sin(a) * r * 0.8, 1.2 + rs(), 0.6, ["#6e7a36", "#8a6a3a", "#4e5a26", "#a08040", "#b8a070"][k % 5], rs() * 3); }
    for (var s = 0; s < 5; s++) rr(x, 4 + s * 6.4, 19, 5.4, 7, 0.6, lg(x, 0, 19, 0, 26, [[0, "#9a7a52"], [1, "#6a4e30"]]));
    ell(x, 14, 12, 1.4, 0.8, "#e8d27a"); ell(x, 21, 15, 1, 0.6, "#c0392b");
    return c;
  };
  BS.paintLoader = function () {
    var c = wc(42, 32, PRES), x = c.x;
    shadow(x, 22, 28, 18, 4, 0.4);
    rr(x, 8, 9, 26, 14, 2, lg(x, 0, 9, 0, 23, [[0, "#f2c23a"], [1, "#c8961e"]]));
    rr(x, 18, 2, 13, 11, 1.4, "#2a3238"); x.fillStyle = lg(x, 0, 3, 0, 10, [[0, "#c0d4dc"], [1, "#7a94a0"]]); x.fillRect(19.5, 3.5, 10, 6);
    [[12, 24], [28, 24]].forEach(function (w2) { ell(x, w2[0], w2[1], 5, 5, "#1c1c1c"); ell(x, w2[0], w2[1], 2.2, 2.2, "#5a5a56"); });
    rr(x, 0, 11, 9, 10, 1, lg(x, 0, 11, 9, 21, [[0, "#9a9a92"], [1, "#5a5a54"]]));
    ell(x, 30, 1.5, 1.2, 1, "#f08a2a");
    return c;
  };
  BS.paintTruck = function () {
    var c = wc(66, 36, PRES), x = c.x;
    shadow(x, 34, 31, 30, 5, 0.4);
    rr(x, 40, 6, 23, 20, 2, lg(x, 0, 6, 0, 26, [[0, "#f6f2e8"], [1, "#c8c4b8"]])); x.fillStyle = lg(x, 0, 8, 0, 15, [[0, "#c0d4dc"], [1, "#7a94a0"]]); x.fillRect(43, 8.5, 16, 7);
    rr(x, 0, 14, 42, 4, 0.6, "#6a6a62"); rr(x, 0, 18, 42, 8, 0.6, "#4a4a44");
    rr(x, 5, 3, 19, 12, 1.4, lg(x, 0, 3, 0, 15, [[0, "#f2c23a"], [1, "#c8961e"]])); rr(x, 3, 8.4, 23, 2, 0.6, "#1c1c1c");
    x.strokeStyle = "#1c1c1c"; x.lineWidth = 2.2; x.beginPath(); x.moveTo(24, 11); x.bezierCurveTo(30, 10, 34, 20, 30, 24); x.stroke();
    [[10, 27], [50, 27]].forEach(function (w2) { ell(x, w2[0], w2[1], 5, 5, "#1c1c1c"); ell(x, w2[0], w2[1], 2.2, 2.2, "#5a5a56"); });
    return c;
  };
  /* lavender: drawn live so it can sway */
  BS.paintLavender = function (seed) {
    var c = wc(18, 22, SPR), x = c.x, rs = R(seed);
    shadow(x, 10, 20, 7, 2.2, 0.3);
    for (var k = 0; k < 9; k++) blade(x, 9 + (rs() - 0.5) * 6, 20, 5 + rs() * 3, (rs() - 0.5) * 6, 0.8, "#6a7a5a", "#a8b898");
    for (k = 0; k < 11; k++) {
      var sx = 9 + (rs() - 0.5) * 10, top = 3 + rs() * 5;
      x.strokeStyle = "#7a8a62"; x.lineWidth = 0.4; x.beginPath(); x.moveTo(9 + (rs() - 0.5) * 3, 19); x.quadraticCurveTo(sx, 12, sx, top + 4); x.stroke();
      for (var b = 0; b < 5; b++) ell(x, sx + (b % 2 ? 0.4 : -0.4), top + b * 1.1, 0.9, 0.75, ["#8a6fc4", "#9f86d6", "#7656b0", "#b8a2e8"][(b + k) % 4]);
    }
    return c;
  };
  /* a tuft of long grass, drawn live so the wind can lean on it */
  BS.paintTuft = function (seed, gold) {
    var c = wc(12, 14, SPR), x = c.x, rs = R(seed);
    for (var k = 0; k < 11; k++) blade(x, 6 + (rs() - 0.5) * 5, 13.5, 6 + rs() * 7, (rs() - 0.5) * 7, 0.7, gold ? "#8a7c34" : "#4a7228", gold ? (rs() < 0.5 ? "#f6eaa2" : "#e0d084") : (rs() < 0.5 ? "#b8dc7a" : "#94c25a"));
    if (gold && rs() < 0.6) { blade(x, 6, 13.5, 13, 1.5, 0.5, "#8a7c34", "#d8c87a"); ell(x, 7.5, 0.8, 0.9, 1.9, "#f1e3a2", 0.3); }
    return c;
  };

  /* creatures, tiny */
  var bugCache = {};
  BS.paintBug = function (kind, f) {
    var k = kind + (f % 2);
    if (bugCache[k]) return bugCache[k];
    var c = wc(8, 8, SPR), x = c.x;
    if (kind === "bee") { ell(x, 4, 4.4, 1.9, 1.4, "#f2c43a"); x.fillStyle = "#2a1e10"; x.fillRect(3.4, 3.1, 0.6, 2.6); x.fillRect(4.6, 3.1, 0.6, 2.6); ell(x, 3.4 + (f % 2) * 0.6, 2.6, 1.3, 0.8, "rgba(240,250,255,.85)", -0.3); ell(x, 4.8 - (f % 2) * 0.4, 2.6, 1.3, 0.8, "rgba(240,250,255,.7)", 0.3); }
    if (kind === "fly") { ell(x, 4, 4, 0.9, 1.1, "#1c1c1c"); ell(x, 3 + (f % 2) * 0.3, 3.2, 0.8, 0.4, "rgba(200,220,230,.7)"); ell(x, 5 - (f % 2) * 0.3, 3.2, 0.8, 0.4, "rgba(200,220,230,.7)"); }
    if (kind === "butterfly") { var o = f % 2 ? 0.6 : 1.6; ell(x, 4 - o, 3.4, o + 0.2, 1.8, "#fdfcf4"); ell(x, 4 + o, 3.4, o + 0.2, 1.8, "#fdfcf4"); ell(x, 4 - o * 0.7, 5, o * 0.6 + 0.2, 1, "#ecead8"); ell(x, 4 + o * 0.7, 5, o * 0.6 + 0.2, 1, "#ecead8"); ell(x, 4 - o, 2.6, 0.35, 0.35, "#4a4a4a"); x.fillStyle = "#3a3a3a"; x.fillRect(3.8, 2.4, 0.4, 3.6); }
    if (kind === "frog") { lump(x, 4, 4.6, 2.6, "#5a8a32"); ell(x, 2.8, 2.8, 0.9, 0.9, "#6a9a3a"); ell(x, 5.2, 2.8, 0.9, 0.9, "#6a9a3a"); ell(x, 2.8, 2.7, 0.45, 0.45, "#ffe08a"); ell(x, 5.2, 2.7, 0.45, 0.45, "#ffe08a"); ell(x, 2.8, 2.7, 0.2, 0.3, "#111"); ell(x, 5.2, 2.7, 0.2, 0.3, "#111"); }
    bugCache[k] = c;
    return c;
  };
})();
