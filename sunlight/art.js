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
    m._wet = { bl: bl, typ: typ, near: near, W: W, H: Hh };
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
    if (raw) return v;
    var ty3 = Math.abs(g.typ[ty * g.W + tx]) === 2 ? "spring" : "water";
    return v > 0.5 ? ty3 : v > 0.36 ? "mud" : "";
  }
  BS.wetAt = wetAt;
  function matAt(m, wx, wy) {
    if (m.outdoor) { var w = wetAt(m, wx, wy); if (w) return w; }
    var dx = (vn(wx, wy, 23, 31) - 0.5) * 15 + (vn(wx, wy, 6, 41) - 0.5) * 4, dy = (vn(wx, wy, 23, 37) - 0.5) * 15 + (vn(wx, wy, 6, 43) - 0.5) * 4;
    var mt = matOf(m, Math.floor((wx + dx) / T), Math.floor((wy + dy) / T));
    if (m.outdoor && (mt === "water" || mt === "spring") && wetGrid(m)) { var tx = Math.floor(wx / T), ty = Math.floor(wy / T), g = m._wet; if (tx >= 0 && ty >= 0 && tx < g.W && ty < g.H && g.near[ty * g.W + tx]) return "mud"; }
    return mt;
  }
  BS.matAt = matAt;

  function paintOutdoorChunk(m, cx, cy) {
    var S = CH * T, ox = cx * S, oy = cy * S;
    var c = wc(S, S, ART), x = c.x;
    x.translate(-ox, -oy);
    /* 1. the color field, two world units a sample, warped edges */
    var N = S / 2, small = cv(N, N), sx = small.getContext("2d"), id = sx.createImageData(N, N), d = id.data;
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var wx = ox + i * 2 + 1, wy = oy + j * 2 + 1, M = MATRGB[matAt(m, wx, wy)];
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
    /* 2. strokes: blades, petals, pebbles, leaves */
    var rnd = R(cx * 7919 + cy * 104729 + 1);
    for (var q2 = 0; q2 < 1700; q2++) {
      var px = ox + rnd() * S, py = oy + rnd() * S;
      detail(x, matAt(m, px, py), px, py, rnd(), rnd);
    }
    /* 3. the things on the ground that stand up a little */
    var x0 = cx * CH, y0 = cy * CH;
    for (var ty = y0 - 1; ty < y0 + CH + 1; ty++) for (var tx = x0 - 1; tx < x0 + CH + 1; tx++) groundProp(x, m, tx, ty);
    /* sand piles, as mounds */
    (m.piles || []).forEach(function (p) {
      var pcx = (p[0] + p[2] / 2) * T, pcy = (p[1] + p[3] / 2) * T, prx = p[2] * T * 0.62, pry = p[3] * T * 0.6;
      if (pcx + prx < ox - 10 || pcx - prx > ox + S + 10 || pcy + pry < oy - 20 || pcy - pry > oy + S + 10) return;
      shadow(x, pcx + 6, pcy + 6, prx * 1.05, pry * 0.95, 0.3);
      x.fillStyle = rg(x, pcx - prx * 0.35, pcy - pry * 0.45, 2, Math.max(prx, pry) * 1.15, [[0, "#fbf2d8"], [0.45, "#e6d5a6"], [1, "#b9a676"]]);
      x.beginPath(); x.ellipse(pcx, pcy, prx, pry, 0, 0, 6.2832); x.fill();
      x.strokeStyle = "rgba(140,115,70,.18)"; x.lineWidth = 0.6;
      for (var k2 = 1; k2 < 5; k2++) { x.beginPath(); x.ellipse(pcx, pcy, prx * k2 / 5, pry * k2 / 5, 0, 0, 6.2832); x.stroke(); }
    });
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

  /* interiors: wood, tile, stone — tidier, but lit the same way */
  function paintInteriorChunk(m, cx, cy) {
    var S = CH * T, ox = cx * S, oy = cy * S, c = wc(S, S, ART), x = c.x;
    x.translate(-ox, -oy);
    x.fillStyle = "#0a0806"; x.fillRect(ox, oy, S, S);
    var x0 = cx * CH, y0 = cy * CH;
    for (var ty = y0; ty < y0 + CH; ty++) for (var tx = x0; tx < x0 + CH; tx++) if (m.get(tx, ty) >= 0) floorTile(x, m, tx, ty);
    for (ty = y0 - 1; ty < y0 + CH + 1; ty++) for (tx = x0 - 1; tx < x0 + CH + 1; tx++) if (m.get(tx, ty) >= 0) standTile(x, m, tx, ty);
    return c;
  }
  function floorTile(x, m, tx, ty) {
    var t = m.get(tx, ty), X = tx * T, Y = ty * T, k;
    var under = t;
    if (m.id === "house") { if (t === TL.BOX || t === TL.TABLE || t === TL.CHAIR || t === TL.RUG || t === TL.EXIT || t === TL.STAIRS || t === TL.WALL || t === TL.WINDOW || t === TL.CDOOR) under = TL.FLOOR; if ((t === TL.COUNTER || t === TL.TABLE || t === TL.CHAIR || t === TL.BOX) && tx > 16) under = TL.KFLOOR; }
    if (m.id === "cellar" && t !== TL.SWALL && t !== TL.STEPS && t !== TL.POOL) under = TL.STONE;
    if (m.id === "shed") under = TL.SFLOOR;
    if (under === TL.FLOOR) {
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
      /* a shelf of Gran's jars: plums, peaches, blackberries dark as a bruise */
      x.fillStyle = "#2a1c12"; x.fillRect(X, Y - 2, T, T + 2);
      [Y + 6, Y + 13.4].forEach(function (sy2) { x.fillStyle = "#7a5636"; x.fillRect(X, sy2, T, 1.4); x.fillStyle = "#3a2616"; x.fillRect(X, sy2 + 1.4, T, 0.6); });
      var cols = ["#5b2340", "#7a2a3a", "#d4862e", "#2a1a2e", "#8a3a5a", "#c8642a", "#3a1830", "#a0405a"];
      for (var row2 = 0; row2 < 2; row2++) for (var i = 0; i < 3; i++) {
        var jx = X + 1.3 + i * 5, jy = Y - 1.4 + row2 * 7.4, cc = cols[(H(tx * 3 + i, ty * 2 + row2, 101) * cols.length) | 0];
        rr(x, jx, jy + 1.2, 4, 6.2, 1, lg(x, jx, 0, jx + 4, 0, [[0, shade(cc, 0.18)], [0.5, cc], [1, shade(cc, -0.35)]]));
        rr(x, jx + 0.3, jy + 0.4, 3.4, 1.2, 0.4, "#c8b066"); x.fillStyle = "rgba(255,255,255,.55)"; x.fillRect(jx + 0.6, jy + 2, 0.5, 3.8);
        x.fillStyle = "rgba(245,235,210,.85)"; x.fillRect(jx + 0.7, jy + 4, 2.6, 1.3);
      }
      return;
    }
    if (t === TL.APPLES) {
      shadow(x, X + 9, Y + 15, 8, 2, 0.4);
      rr(x, X + 0.5, Y + 1, 15, 14, 1, "#5a4026"); rr(x, X + 1.5, Y + 2, 13, 12, 0.8, "#3a2816");
      for (var a = 0; a < 7; a++) lump(x, X + 3.5 + (a % 3) * 4.5, Y + 4 + Math.floor(a / 3) * 4, 2, ["#9a4a2a", "#a87a2a", "#7a3a22"][a % 3]);
      return;
    }
    if (t === TL.FSHELF) {
      shadow(x, X + 8, Y + 15, 9, 2.5, 0.4);
      x.save(); x.translate(X + 8, Y + 8); x.rotate(-0.12);
      rr(x, -8, -5, 16, 3, 0.6, "#5e4630"); rr(x, -7, 0, 15, 3, 0.6, "#4e3a26"); rr(x, -8, 4.6, 16, 3, 0.6, "#5e4630");
      x.restore();
      if (ty === 11) { rr(x, X + 3.5, Y + 3.5, 9, 6.5, 0.8, lg(x, 0, Y + 3.5, 0, Y + 10, [[0, "#e8dfc0"], [1, "#c4b890"]])); rr(x, X + 5.2, Y + 4.6, 5.6, 4.2, 0.4, "#6b4a2c"); }
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
    x.beginPath(); x.rect(cx * S, cy * S, S, S); x.clip();
    /* one soft pool of shade under the whole canopy, not a stack of hard
       ellipses (blur where the browser has canvas filters) */
    x.save(); x.filter = "blur(7px)";
    x.fillStyle = "rgba(10,20,8,.42)"; x.beginPath();
    list.forEach(function (p) { x.moveTo(p[0] * T + 27, p[1] * T + 6); x.ellipse(p[0] * T + 10, p[1] * T + 6, 17, 13, 0, 0, 6.2832); });
    x.fill(); x.restore();
    list.forEach(function (p) {
      var rs = R(p[0] * 31 + p[1] * 7), cx2 = p[0] * T + 8, cy2 = p[1] * T - 2;
      for (var b = 0; b < 4; b++) lump(x, cx2 + (rs() - 0.5) * 12, cy2 + (rs() - 0.5) * 10, 6 + rs() * 4, ["#2e4a22", "#365628", "#2a4420", "#3e5e2c"][b], "#7aa04a");
    });
    list.forEach(function (p) { leaves(x, p[0] * T + 8, p[1] * T - 2, 13, R(p[0] * 57 + p[1] * 11), 70, [[34, 62, 26], [46, 80, 34], [62, 104, 42], [96, 140, 60], [150, 190, 96]]); });
    list.forEach(function (p) {
      var rs = R(p[0] * 13 + p[1] * 3);
      for (var q = 0; q < 6; q++) ell(x, p[0] * T + rs() * 16, p[1] * T - 6 + rs() * 12, 1.2, 0.8, rs() < 0.6 ? "rgba(170,210,110,.35)" : "rgba(10,25,8,.35)", rs() * 3);
    });
    canCache[k] = c; canOrder.push(k);
    while (canOrder.length > 48) delete canCache[canOrder.shift()];
    return c;
  };

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
  function person(o, dir, f, blink, res) {
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
    /* face */
    if (dir === 0) {
      var ey = hy + 0.9;
      if (blink) { x.strokeStyle = "#2a1d18"; x.lineWidth = 0.4; x.beginPath(); x.moveTo(hx - 2.7, ey); x.lineTo(hx - 1.4, ey); x.moveTo(hx + 1.4, ey); x.lineTo(hx + 2.7, ey); x.stroke(); }
      else { ell(x, hx - 2, ey, 0.7, 1.05, "#2a1d18"); ell(x, hx + 2, ey, 0.7, 1.05, "#2a1d18"); ell(x, hx - 2.2, ey - 0.4, 0.28, 0.32, "#fff"); ell(x, hx + 1.8, ey - 0.4, 0.28, 0.32, "#fff"); }
      ell(x, hx - 3, hy + 2.3, 1, 0.55, "rgba(240,120,110,.35)"); ell(x, hx + 3, hy + 2.3, 1, 0.55, "rgba(240,120,110,.35)");
      if (o.nose) ell(x, hx, hy + 1.9, 0.75, 0.5, o.nose);
      x.strokeStyle = "rgba(90,40,30,.75)"; x.lineWidth = 0.32; x.beginPath(); x.arc(hx, hy + 2.6, 0.7, 0.3, Math.PI - 0.3); x.stroke();
    } else if (dir === 2) {
      if (blink) { x.strokeStyle = "#2a1d18"; x.lineWidth = 0.4; x.beginPath(); x.moveTo(hx + 1.8, hy + 0.9); x.lineTo(hx + 3, hy + 0.9); x.stroke(); }
      else { ell(x, hx + 2.4, hy + 0.9, 0.62, 1, "#2a1d18"); ell(x, hx + 2.25, hy + 0.5, 0.25, 0.3, "#fff"); }
      ell(x, hx + 2.6, hy + 2.4, 0.9, 0.5, "rgba(240,120,110,.35)");
      if (o.nose) ell(x, hx + hr - 0.3, hy + 1.8, 0.55, 0.45, o.nose);
      ell(x, hx - 0.8, hy + 0.9, 0.8, 1.1, shade(o.skin, -0.12));
    }
    return c;
  }
  var spriteCache = {};
  BS.sprite = function (who, dir, f, blink) {
    var k = who + dir + "_" + (f % 4) + (blink ? "b" : "");
    if (!spriteCache[k]) spriteCache[k] = person(CAST[who], dir, f % 4 === 1 ? 1 : f % 4 === 3 ? 2 : 0, blink);
    return spriteCache[k];
  };

  /* portraits for the dialogue box: the same person, much finer, head and
     shoulders. Gran is a voice on a phone, so hers is the phone. */
  var portCache = {};
  BS.portrait = function (who, blink) {
    var map = { wren: "wren", beck: "beck", dad: "dad", worker: "worker", beckdad: "beckdad", gran: "gran" };
    var cast = map[who]; if (!cast) return null;
    var k = cast + (blink ? "b" : "");
    if (portCache[k]) return portCache[k];
    var c;
    if (cast === "gran") {
      c = wc(16, 16, 12); var x = c.x;
      rr(x, 5, 2.5, 6, 11, 1.2, "#22222a"); rr(x, 5.6, 3.6, 4.8, 8, 0.6, lg(x, 0, 3, 0, 12, [[0, "#3a4a5a"], [1, "#1e2630"]]));
      x.strokeStyle = "rgba(230,201,240,.85)"; x.lineWidth = 0.5; x.lineCap = "round";
      for (var r2 = 1; r2 < 4; r2++) { x.beginPath(); x.arc(8, 2.6, r2 * 1.5, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); }
      ell(x, 8, 7.6, 1.6, 1.6, "rgba(255,240,210,.9)");
    } else {
      var full = person(CAST[cast], 0, 0, blink, 12);
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
  BS.paintBeech = function () {
    var c = wc(44, 60, PRES), x = c.x;
    shadow(x, 26, 54, 18, 5, 0.4);
    [[-14, 4], [-8, 6], [9, 5], [15, 3]].forEach(function (rt) { x.fillStyle = lg(x, 0, 46, 0, 56, [[0, "#9a9ea0"], [1, "#6a6e70"]]); x.beginPath(); x.moveTo(20, 44); x.quadraticCurveTo(20 + rt[0] * 0.5, 50, 20 + rt[0], 51 + rt[1] * 0.3); x.lineTo(20 + rt[0] * 0.8, 53); x.quadraticCurveTo(20 + rt[0] * 0.3, 52, 22, 47); x.fill(); });
    rr(x, 13, 0, 15, 50, 4, lg(x, 13, 0, 28, 0, [[0, "#b0b4b6"], [0.4, "#9a9ea0"], [1, "#666a6c"]]));
    for (var j = 6; j < 48; j += 6) { x.strokeStyle = "rgba(80,85,88,.35)"; x.lineWidth = 0.4; x.beginPath(); x.moveTo(15, j); x.quadraticCurveTo(20, j + 1, 26, j - 0.5); x.stroke(); }
    ell(x, 18, 22, 1.4, 2.2, "rgba(60,64,66,.5)"); ell(x, 22, 34, 1, 1.5, "rgba(60,64,66,.5)");
    x.fillStyle = "rgba(110,150,90,.4)"; x.fillRect(13, 30, 4, 20);
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
