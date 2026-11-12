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
  var PX = 4;                       // overlay pixels per tile
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

  function build() {
    var m = G.maps.hill; mw = m.w * PX; mh = m.h * PX;
    shadeCv = BS.cv(mw, mh); mistCv = BS.cv(mw, mh);
    var sx = shadeCv.getContext("2d"), mx = mistCv.getContext("2d");
    var sd = sx.createImageData(mw, mh), md = mx.createImageData(mw, mh);
    /* the sun: low in the south, a touch west */
    var L = [-0.38, 0.62, 0.68], Ln = Math.hypot(L[0], L[1], L[2]); L = [L[0] / Ln, L[1] / Ln, L[2] / Ln];
    var K = 34, flat = L[2], e = 0.5;
    for (var py = 0; py < mh; py++) for (var px = 0; px < mw; px++) {
      var x = (px + 0.5) / PX, y = (py + 0.5) / PX, hv = h(x, y);
      var gx = (h(x + e, y) - h(x - e, y)) / (2 * e), gy = (h(x, y + e) - h(x, y - e)) / (2 * e);
      var nx = -gx * K, ny = -gy * K, nn = Math.hypot(nx, ny, 1);
      var lit = (nx * L[0] + ny * L[1] + L[2]) / nn - flat;      // + toward the sun, - away
      /* compose: air (cool, by depth), then the light, over each other */
      var r = 0, g = 0, b = 0, a = 0;
      function over(cr, cg, cb, ca) { if (ca <= 0) return; var na = ca + a * (1 - ca); r = (cr * ca + r * a * (1 - ca)) / na; g = (cg * ca + g * a * (1 - ca)) / na; b = (cb * ca + b * a * (1 - ca)) / na; a = na; }
      var low = Math.max(0, 1 - hv);
      over(48, 70, 104, Math.pow(low, 1.4) * 0.36);
      if (lit > 0) over(255, 232, 186, Math.min(0.3, lit * 1.3));
      else over(28, 36, 66, Math.min(0.38, -lit * 1.5));
      /* the top: warm and open */
      over(255, 240, 200, sm(0.7, 1, hv) * 0.14);
      var i = (py * mw + px) * 4;
      sd.data[i] = r; sd.data[i + 1] = g; sd.data[i + 2] = b; sd.data[i + 3] = a * 255;
      /* mist lies in the low ground */
      var mv = sm(0.5, 0.08, hv) * 0.75;
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
