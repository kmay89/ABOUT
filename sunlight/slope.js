/* slope.js — the hill is a hill.

   Seen from straight above, a hill is just grass. This gives the overworld a
   height: the garden and the house sit on the flat top, the road falls away
   south through its switchbacks to the woods, the land rolls a little as it
   goes, the gravel pit is a bite out of it and the hollow is a fold.

   That height is drawn three ways, all quiet:
   · light: slopes turned toward the sun (low in the south, a little west)
     catch warm light; the ones turned away go cool;
   · air: the lower you go, the more blue air there is between you and it,
     so the bottom of the world is cooler and softer than the top;
   · mist: on early mornings (and in the opening, under the car) it lies in
     the low ground and the treetops come up out of it.

   BS.slope.h(x, y) gives the height in tiles (0 low .. 1 the top), for anyone
   who needs it — the opening's little elevation line uses it. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, T = 16;
  var S = BS.slope = {};
  var PX = 8;                       // overlay pixels per tile
  var shadeCv = null, mistCv = null, mw = 0, mh = 0;

  function sm(a, b, x) { var u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); }
  function box(x, y, x0, y0, x1, y1, soft) {
    return sm(x0 - soft, x0 + soft, x) * (1 - sm(x1 - soft, x1 + soft, x)) * sm(y0 - soft, y0 + soft, y) * (1 - sm(y1 - soft, y1 + soft, y));
  }
  /* height in 0..1; x, y in tiles */
  var h = S.h = function (x, y) {
    var dx = (x - 39.5) / 34, dy = y < 13 ? (y - 13) / 22 : (y - 13) / 47;
    var d = Math.sqrt(dx * dx + dy * dy);
    var v = 1 - sm(0.2, 1.08, d);
    /* the land rolls as it goes down */
    var roll = 0.016 * Math.sin(x * 0.21 + y * 0.12) + 0.014 * Math.sin(x * 0.11 - y * 0.19 + 1.3);
    v += roll * sm(0.15, 0.5, d);
    /* the pit, dug out of it; the hollow, a fold */
    v -= 0.16 * box(x, y, 58, 34, 83, 50, 2.5);
    v -= 0.1 * box(x, y, 11, 60, 24, 70, 3);
    return v;
  };

  function hash(i, j) { var q = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return q - Math.floor(q); }
  function vn(x, y) {
    var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  /* the road's middle, in tiles (the road is laid two tiles wide from each point) */
  function roadSegs(m) {
    var P = (m.road || []).map(function (q) { return [q[0] + 1, q[1] + 1]; }), pts = [], S = [];
    function cr(p0, p1, p2, p3, u) { var u2 = u * u, u3 = u2 * u; return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3); }
    for (var i = 0; i < P.length - 1; i++) for (var k = 0; k < 12; k++) {
      var u = k / 12, a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
      pts.push([cr(a[0], b[0], c[0], d[0], u), cr(a[1], b[1], c[1], d[1], u)]);
    }
    if (P.length) pts.push(P[P.length - 1]);
    for (var j = 0; j < pts.length - 1; j++) S.push([pts[j], pts[j + 1]]);
    /* which pieces of road are near each tile */
    var grid = {};
    S.forEach(function (sg, n) {
      var x0 = Math.floor(Math.min(sg[0][0], sg[1][0]) - 3), x1 = Math.ceil(Math.max(sg[0][0], sg[1][0]) + 3);
      var y0 = Math.floor(Math.min(sg[0][1], sg[1][1]) - 3), y1 = Math.ceil(Math.max(sg[0][1], sg[1][1]) + 3);
      for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) (grid[xx + "," + yy] = grid[xx + "," + yy] || []).push(sg);
    });
    return grid;
  }

  function build() {
    var m = G.maps.hill; mw = m.w * PX; mh = m.h * PX;
    shadeCv = BS.cv(mw, mh); mistCv = BS.cv(mw, mh);
    var sx = shadeCv.getContext("2d"), mx = mistCv.getContext("2d");
    var sd = sx.createImageData(mw, mh), md = mx.createImageData(mw, mh);
    var GRID = roadSegs(m), RW = 1.0;
    /* the sun: low in the south, a touch west */
    var L = [-0.38, 0.62, 0.68], Ln = Math.hypot(L[0], L[1], L[2]); L = [L[0] / Ln, L[1] / Ln, L[2] / Ln];
    var K = 34, flat = L[2], e = 0.5;
    for (var py = 0; py < mh; py++) for (var px = 0; px < mw; px++) {
      var x = (px + 0.5) / PX, y = (py + 0.5) / PX, hv = h(x, y);
      var gx = (h(x + e, y) - h(x - e, y)) / (2 * e), gy = (h(x, y + e) - h(x, y - e)) / (2 * e);
      var steep = Math.min(1, Math.hypot(gx, gy) * 34);
      var nx = -gx * K, ny = -gy * K, nn = Math.hypot(nx, ny, 1);
      var lit = (nx * L[0] + ny * L[1] + L[2]) / nn - flat;      // + toward the sun, - away
      var r = 0, g = 0, b = 0, a = 0;
      function over(cr, cg, cb, ca) { if (ca <= 0) return; ca = Math.min(1, ca); var na = ca + a * (1 - ca); r = (cr * ca + r * a * (1 - ca)) / na; g = (cg * ca + g * a * (1 - ca)) / na; b = (cb * ca + b * a * (1 - ca)) / na; a = na; }
      var low = Math.max(0, 1 - hv), pit = box(x, y, 59, 35, 82, 49, 1.2);
      /* the pit is no blue distance: it glares, yellow-gray, under the sun */
      over(48, 70, 104, Math.pow(low, 1.4) * 0.3 * (1 - pit));
      over(255, 236, 190, pit * 0.07);
      if (lit > 0) over(255, 232, 186, Math.min(0.26, lit * 1.2));
      else over(28, 36, 66, Math.min(0.32, -lit * 1.3));
      over(255, 240, 200, sm(0.7, 1, hv) * 0.12);

      /* the road: where is it, and which way does the ground go beside it */
      var best = 1e9, bt = null, bq = null;
      var SEG = GRID[Math.floor(x) + "," + Math.floor(y)] || [];
      for (var k = 0; k < SEG.length; k++) {
        var A0 = SEG[k][0], B0 = SEG[k][1], vx = B0[0] - A0[0], vy = B0[1] - A0[1], ll = vx * vx + vy * vy;
        var u = Math.max(0, Math.min(1, ((x - A0[0]) * vx + (y - A0[1]) * vy) / ll));
        var qx = A0[0] + vx * u, qy = A0[1] + vy * u, dd = (x - qx) * (x - qx) + (y - qy) * (y - qy);
        if (dd < best) { best = dd; bq = [qx, qy]; var l1 = Math.sqrt(ll); bt = [vx / l1, vy / l1]; }
      }
      var dR = Math.sqrt(best), onRoad = dR < RW + 0.15;
      if (bq && dR < RW + 1.1) {
        var hq = h(bq[0], bq[1]), up = hv - hq;                       // + : this side of the road is the high side
        var grade = Math.min(1, Math.abs(gx * bt[0] + gy * bt[1]) * 40);  // how hard the road itself climbs here
        var bank = Math.min(1, Math.abs(up) / 0.022);
        var off = (x - bq[0]) * -bt[1] + (y - bq[1]) * bt[0];        // across the road, signed
        var along = (x - bq[0]) * bt[0] + (y - bq[1]) * bt[1] + (bq[0] * bt[0] + bq[1] * bt[1]);
        var fe = (dR - RW);                                            // past the edge, in tiles
        if (dR < RW) {
          /* the surface: two worn ruts, the crown between them, ribs across where it climbs */
          var rut = Math.abs(Math.abs(off) - 0.48);
          if (rut < 0.13) over(70, 48, 28, (0.2 + grade * 0.12) * (1 - rut / 0.13));
          if (Math.abs(off) < 0.18) over(255, 236, 196, 0.1);
          /* where it climbs, the rain has cut little runnels down it and pushed the gravel into ridges */
          var rib = Math.sin(along * Math.PI * 2 / 0.7 + vn(x * 1.3, y * 1.3) * 5 + off * 1.5), rk = vn(x * 3 + 4, y * 3) * grade;
          if (rib < -0.55) over(60, 40, 20, rk * 0.22 * (-rib - 0.55) / 0.45);
          else if (rib > 0.7) over(255, 238, 200, rk * 0.12 * (rib - 0.7) / 0.3);
          /* the downhill edge crumbles; the uphill edge sits in the bank's shadow */
          if (up > 0 && dR > RW - 0.28) over(40, 26, 14, bank * 0.4 * (1 - (RW - dR) / 0.28));
          if (up < 0 && dR > RW - 0.12) over(255, 240, 210, bank * 0.22);
        } else if (up > 0) {
          /* the high side: a cut bank of bare earth and roots, a lip of grass hanging over it */
          var cut = 0.8 * bank;
          if (fe < cut) {
            var k2 = fe / Math.max(0.01, cut), stone = vn(x * 5, y * 5);
            over(132 + stone * 30, 96 + stone * 18, 60 + stone * 10, (0.62 - k2 * 0.25) * bank);
            if (stone > 0.72) over(200, 190, 170, (stone - 0.72) * 2.4 * bank);
            over(30, 20, 10, (1 - k2) * 0.25 * bank);              // darker at the foot
          } else if (fe < cut + 0.22) {
            over(255, 236, 170, 0.28 * bank * (1 - (fe - cut) / 0.22));   // the sunlit lip
          }
        } else if (up < 0) {
          /* the low side: the shoulder falls away, a soft shadow down the slope */
          if (fe < 0.18) over(255, 238, 200, 0.2 * bank);
          else if (fe < 0.9) over(26, 34, 52, 0.22 * bank * (1 - (fe - 0.18) / 0.72));
        }
      }
      /* sheep tracks: little steps across the slope, along the contours */
      if (!onRoad && steep > 0.15) {
        var ph = hv * 34 + vn(x * 0.35, y * 0.35) * 1.6, fr = ph - Math.floor(ph);
        var keep = sm(0.36, 0.66, vn(x * 0.5 + 9, y * 0.5)) * (0.55 + 0.45 * vn(x * 2.2, y * 2.2)) * sm(0.15, 0.5, steep) * sm(0, 0.3, Math.max(0, (dR || 9) - RW - 0.6));
        if (keep > 0.01) {
          if (fr < 0.14) over(255, 240, 196, 0.17 * keep * (1 - fr / 0.14));
          else if (fr < 0.3) over(34, 40, 30, 0.22 * keep * (1 - (fr - 0.14) / 0.16));
        }
      }
      var i = (py * mw + px) * 4;
      sd.data[i] = r; sd.data[i + 1] = g; sd.data[i + 2] = b; sd.data[i + 3] = a * 255;
      /* mist lies in the low ground */
      var mv = sm(0.5, 0.08, hv) * 0.75 * (1 - pit * 0.85);
      md.data[i] = 232; md.data[i + 1] = 236; md.data[i + 2] = 232; md.data[i + 3] = mv * mv * 255;
    }
    sx.putImageData(sd, 0, 0); mx.putImageData(md, 0, 0);
  }

  var mistNow = 0;
  S.under = function (ctx, cam, t) {
    if (G.mapId !== "hill") return;
    if (!shadeCv) build();
    var v = G.view(), k = PX / T;
    /* only the part on screen, a tile of margin round it */
    var x0 = Math.max(0, Math.floor((cam.x - T) * k)), y0 = Math.max(0, Math.floor((cam.y - T) * k));
    var x1 = Math.min(mw, Math.ceil((cam.x + v.w + T) * k)), y1 = Math.min(mh, Math.ceil((cam.y + v.h + T) * k));
    if (x1 <= x0 || y1 <= y0) return;
    var sw = x1 - x0, sh = y1 - y0, dx = x0 / k - cam.x, dy = y0 / k - cam.y, dw = sw / k, dh = sh / k;
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shadeCv, x0, y0, sw, sh, dx, dy, dw, dh);
    /* how much mist: the opening's, or an early morning's */
    var tod = G.s && G.s.tod, want = Math.min(0.6, (G.cineMist || 0) * 1.1 + (tod === "dawn" ? 0.32 : tod === "morning" ? 0.2 : tod === "night" ? 0.14 : 0));
    mistNow += (want - mistNow) * 0.04;
    if (mistNow > 0.01) {
      /* it drifts, very slowly */
      var dr = G.prefs.reduced ? 0 : Math.sin(t * 0.07) * 10;
      ctx.globalAlpha = mistNow; ctx.drawImage(mistCv, x0, y0, sw, sh, dx + dr, dy, dw, dh);
      ctx.globalAlpha = mistNow * 0.5; ctx.drawImage(mistCv, x0, y0, sw, sh, dx - dr * 1.6, dy + 4, dw, dh);
    }
    ctx.restore();
  };
})();
