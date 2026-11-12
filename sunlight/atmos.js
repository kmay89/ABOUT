/* atmos.js — the air between you and the hill.

   · Wind you can see: gusts roll across the long grass in waves, tufts
     leaning and flashing their paler undersides as each wave passes;
     dandelion seeds and loose petals ride it.
   · Mist: low, slow, breathing — over the woods always, over the hollow
     and the pond at the edges of the day, across everything at dawn.
   · Light: long golden shafts in the evening, a warm leak from the low
     sun, moonlight at night, sun glints dancing on the pond, the sky
     reflected in it, and leaves coming down under the trees.
   Everything here is drawn in world units over the painted ground, and
   steps aside for reduced motion. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, T = 16, TL = BS.TL;
  var X = BS.atmos = {};
  function reduced() { return G.prefs.reduced; }
  function tod() { return G.s.tod; }
  function night() { return tod() === "night" || tod() === "dusk"; }
  function golden() { return tod() === "golden" || tod() === "evening"; }

  /* ---------------- wind ---------------- */
  /* a travelling wave field: 0 calm .. 1 the crest of a gust */
  G.gust = function (x, y) {
    if (reduced()) return 0;
    var t = G.time(), strength = 0.55 + 0.45 * Math.sin(t * 0.13) * Math.sin(t * 0.047 + 1);
    var ph = x * 0.011 + y * 0.004 - t * 1.05;
    var s = Math.sin(ph) * 0.6 + Math.sin(ph * 0.43 + 1.7) * 0.4;
    return Math.pow(Math.max(0, s), 3) * strength;
  };

  /* ---------------- mist ---------------- */
  var mistTex = null;
  function mist() {
    if (mistTex) return mistTex;
    var N = 192, c = BS.cv(N, N), x = c.getContext("2d"), id = x.createImageData(N, N), d = id.data;
    /* tileable value noise: sample on a torus */
    function tn(u, v, s, seed) {
      var gx = Math.floor(u / s), gy = Math.floor(v / s), fx = u / s - gx, fy = v / s - gy, P = N / s;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      function h(a, b) { return BS.hash(((a % P) + P) % P, ((b % P) + P) % P, seed); }
      var a = h(gx, gy), b = h(gx + 1, gy), cc = h(gx, gy + 1), dd = h(gx + 1, gy + 1);
      return a + (b - a) * fx + (cc - a) * fy + (a - b - cc + dd) * fx * fy;
    }
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var n = tn(i, j, 48, 1) * 0.55 + tn(i, j, 24, 2) * 0.3 + tn(i, j, 12, 3) * 0.15;
      var a = Math.max(0, Math.min(1, (n - 0.38) * 2.2));
      var k = (j * N + i) * 4; d[k] = 255; d[k + 1] = 255; d[k + 2] = 255; d[k + 3] = a * 255;
    }
    x.putImageData(id, 0, 0);
    mistTex = c; return c;
  }
  var patCache = {};
  function mistPattern(ctx, col) {
    var k = col;
    if (patCache[k]) return patCache[k];
    var src = mist(), c = BS.cv(src.width, src.height), x = c.getContext("2d");
    x.drawImage(src, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
    patCache[k] = ctx.createPattern(c, "repeat");
    return patCache[k];
  }
  function mistAmount() {
    if (G.mapId === "cellar") return G.workLights ? 0 : 0.12;
    if (G.mapId !== "hill") return 0;
    var y = G.p.y / T, x = G.p.x / T, h = G.maps.hill, a = 0;
    var t = tod();
    if (t === "dawn") a = 0.09;
    else if (t === "dusk") a = 0.08;
    else if (t === "night") a = 0.05;
    if (y > 52) a += night() || t === "dawn" ? 0.08 : 0.06;
    if (G.inRect(x, y, h.hollow, 4) || G.inRect(x, y, h.pond, 4)) a += night() ? 0.05 : 0.09;
    return Math.min(0.3, a);
  }
  function drawMist(ctx, cam, VW, VH) {
    var a = mistAmount(); if (a < 0.01) return;
    var t = G.time(), col = G.mapId === "cellar" ? "rgb(150,210,170)" : night() ? "rgb(70,84,120)" : tod() === "dawn" ? "rgb(240,226,240)" : golden() ? "rgb(255,226,190)" : "rgb(235,240,235)";
    var pat = mistPattern(ctx, col), s = 2.6;
    ctx.save();
    [[0.6, 7, 2], [0.4, -4, 5]].forEach(function (L, i) {
      ctx.globalAlpha = a * L[0];
      var ox = -cam.x * (1 + i * 0.12) + t * L[1], oy = -cam.y * (1 + i * 0.12) + t * L[2] * 0.3;
      ctx.save(); ctx.translate(((ox % (192 * s)) + 192 * s) % (192 * s) - 192 * s, ((oy % (192 * s)) + 192 * s) % (192 * s) - 192 * s); ctx.scale(s, s);
      ctx.fillStyle = pat; ctx.fillRect(0, 0, (VW + 192 * s * 2) / s, (VH + 192 * s * 2) / s);
      ctx.restore();
    });
    ctx.restore();
  }

  /* ---------------- drifting things: seeds, petals, leaves ---------------- */
  var drift = [];
  /* a shaken tree lets go of a handful of leaves */
  X.leafFall = function (x, y, n) {
    if (reduced()) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, r = Math.random() * 14;
      drift.push({ leaf: true, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.5, z: 14 + Math.random() * 16, vx: (Math.random() - 0.5) * 10, vy: 7 + Math.random() * 5, t: 0, life: 6 + Math.random() * 3, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 6, ph: Math.random() * 6, col: ["#6f9a3a", "#8ab44a", "#5a8030", "#c9a040"][(Math.random() * 4) | 0] });
    }
  };
  function driftTick(dt, cam, VW, VH) {
    if (reduced() || G.mapId !== "hill") { drift.length = 0; return; }
    var inWoods = G.p.y / T > 51.5, want = inWoods ? (night() ? 6 : 16) : (night() ? 0 : 12);
    if (drift.length < want && Math.random() < dt * 6) {
      var leaf = inWoods;
      drift.push({ leaf: leaf, x: cam.x + Math.random() * (VW + 60) - 60, y: cam.y - 10 + (leaf ? 0 : Math.random() * VH), z: leaf ? 30 + Math.random() * 40 : 6 + Math.random() * 10, vx: leaf ? 4 : 14, vy: leaf ? 9 : 2, t: 0, life: 8 + Math.random() * 6, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 4, ph: Math.random() * 6, col: leaf ? ["#c8862e", "#d9a040", "#a86a2a", "#b8b04a"][(Math.random() * 4) | 0] : Math.random() < 0.7 ? "seed" : ["#f4c8d8", "#fbf6e8", "#f2d070"][(Math.random() * 3) | 0] });
    }
    drift.forEach(function (d) {
      d.t += dt;
      var g = G.gust(d.x, d.y);
      d.x += (d.vx + g * 60 + Math.sin(d.t * 1.7 + d.ph) * 6) * dt;
      if (d.leaf) { d.z = Math.max(0, d.z - d.vy * dt * (1 + Math.sin(d.t * 2 + d.ph) * 0.6)); d.rot += d.spin * dt; if (d.z <= 0) d.vx = 0; }
      else { d.y += (Math.sin(d.t * 0.9 + d.ph) * 4 - g * 6) * dt; d.z = 6 + Math.sin(d.t + d.ph) * 3 + g * 8; }
    });
    drift = drift.filter(function (d) { return d.t < d.life && d.x < cam.x + VW + 80 && d.x > cam.x - 120; });
  }
  function drawDrift(ctx, cam) {
    drift.forEach(function (d) {
      var k = d.t / d.life, a = Math.min(1, d.t * 2) * (1 - Math.max(0, (k - 0.8) / 0.2));
      var sx = d.x - cam.x, sy = d.y - cam.y;
      ctx.globalAlpha = a * 0.25; ctx.fillStyle = "#1a1208"; BS.ell(ctx, sx + d.z * 0.3, sy + 1, d.leaf ? 1.3 : 0.7, 0.5); ctx.fill();
      ctx.globalAlpha = a;
      if (d.leaf) { ctx.save(); ctx.translate(sx, sy - d.z); ctx.rotate(d.rot); ctx.scale(1, Math.cos(d.rot * 1.3)); ctx.fillStyle = d.col; BS.ell(ctx, 0, 0, 1.7, 0.8); ctx.fill(); ctx.restore(); }
      else if (d.col === "seed") { ctx.strokeStyle = "rgba(255,255,250,.85)"; ctx.lineWidth = 0.15; ctx.save(); ctx.translate(sx, sy - d.z); for (var q = 0; q < 8; q++) { var an = q / 8 * 6.283 + d.t; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(an) * 1.3, Math.sin(an) * 1.3); ctx.stroke(); } ctx.fillStyle = "#e8e0c8"; ctx.fillRect(-0.15, 0, 0.3, 1.2); ctx.restore(); }
      else { ctx.save(); ctx.translate(sx, sy - d.z); ctx.rotate(d.t * 2 + d.ph); ctx.fillStyle = d.col; BS.ell(ctx, 0, 0, 0.9, 0.55); ctx.fill(); ctx.restore(); }
    });
    ctx.globalAlpha = 1;
  }

  /* ---------------- the pond: sky in it, sun on it ---------------- */
  X.ground = function (ctx, cam, VW, VH) {
    if (G.mapId !== "hill") return;
    var h = G.maps.hill, t = G.time(), n = night();
    var x0 = Math.max(0, Math.floor(cam.x / T)), y0 = Math.max(0, Math.floor(cam.y / T)), x1 = Math.min(h.w, x0 + Math.ceil(VW / T) + 2), y1 = Math.min(h.h, y0 + Math.ceil(VH / T) + 2);
    var sky = n ? null : tod() === "dawn" ? "rgba(230,200,230," : golden() ? "rgba(255,200,140," : "rgba(190,225,240,";
    ctx.save();
    /* the sky in it: one smooth wash across the whole pond (the layer is cut
       to the shore), brightest at the far bank, with the trees' dark at its
       top edge where they lean over the water */
    if (sky) {
      var pd = h.pond, top = (pd.y - 1) * T - cam.y, bot = (pd.y + pd.h + 1) * T - cam.y;
      var gr = ctx.createLinearGradient(0, top, 0, bot);
      gr.addColorStop(0, "rgba(20,40,30,.28)"); gr.addColorStop(0.18, sky + "0.24)"); gr.addColorStop(0.6, sky + "0.12)"); gr.addColorStop(1, sky + "0.04)");
      ctx.fillStyle = gr; ctx.fillRect(0, top, VW, bot - top);
    }
    for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
      if (G.nearWater(x, y) !== TL.WATER) continue;
      var sx = x * T - cam.x, sy = y * T - cam.y;
      if (!n && !reduced()) {
        ctx.globalCompositeOperation = "lighter";
        for (var k = 0; k < 3; k++) {
          var ph = t * (2.2 + k) + BS.hash(x, y, k + 70) * 40, tw = Math.max(0, Math.sin(ph));
          if (tw < 0.6) continue;
          var gx = sx + BS.hash(x, y, k + 71) * T, gy = sy + BS.hash(x, y, k + 72) * T, r = (tw - 0.6) * 4;
          ctx.fillStyle = "rgba(255,250,225," + (tw - 0.5) + ")";
          ctx.beginPath(); ctx.moveTo(gx - r, gy); ctx.lineTo(gx, gy - r * 0.35); ctx.lineTo(gx + r, gy); ctx.lineTo(gx, gy + r * 0.35); ctx.closePath(); ctx.fill();
          ctx.fillRect(gx - 0.2, gy - r * 0.8, 0.4, r * 1.6);
        }
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.restore();
  };

  /* ---------------- in the air: mist, drift, shafts ---------------- */
  X.air = function (ctx, cam, VW, VH, dark) {
    drawDrift(ctx, cam);
    drawMist(ctx, cam, VW, VH);
    if (G.mapId === "hill" && golden() && !reduced()) {
      /* long golden shafts across the field */
      var t = G.time();
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < 5; i++) {
        var bx = ((i * 211 - cam.x * 0.3 + t * 2) % (VW + 300)) - 150, w = 26 + (i % 3) * 18, a = 0.05 + 0.03 * Math.sin(t * 0.4 + i * 1.7);
        var g = ctx.createLinearGradient(bx, 0, bx + VH * 0.9, VH); g.addColorStop(0, "rgba(255,210,140," + a + ")"); g.addColorStop(1, "rgba(255,210,140,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx, -10); ctx.lineTo(bx + w, -10); ctx.lineTo(bx + w + VH * 0.9, VH + 10); ctx.lineTo(bx + VH * 0.9, VH + 10); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  };

  /* ---------------- on the lens: sun leak, moonlight ---------------- */
  X.post = function (ctx, VW, VH, dark) {
    if (G.mapId !== "hill") return;
    ctx.save();
    var t = tod();
    if (!night() && t !== "dawn") {
      var warm = golden() ? "255,170,90" : "255,236,190", a = golden() ? 0.2 : 0.07;
      ctx.globalCompositeOperation = "screen";
      var g = ctx.createRadialGradient(-VW * 0.05, -VH * 0.1, 0, -VW * 0.05, -VH * 0.1, Math.max(VW, VH) * 0.85);
      g.addColorStop(0, "rgba(" + warm + "," + a + ")"); g.addColorStop(0.5, "rgba(" + warm + "," + a * 0.25 + ")"); g.addColorStop(1, "rgba(" + warm + ",0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
      /* a faint flare chain off the sun, across the frame */
      if (!reduced()) [[0.28, 6, 0.06], [0.46, 3, 0.05], [0.7, 10, 0.035]].forEach(function (f) { var fx = VW * f[0], fy = VH * f[0] * 0.8, gg = ctx.createRadialGradient(fx, fy, 0, fx, fy, f[1] * 3); gg.addColorStop(0, "rgba(" + warm + "," + f[2] + ")"); gg.addColorStop(1, "rgba(" + warm + ",0)"); ctx.fillStyle = gg; ctx.fillRect(fx - f[1] * 3, fy - f[1] * 3, f[1] * 6, f[1] * 6); });
    } else if (t === "night") {
      ctx.globalCompositeOperation = "screen";
      var m = ctx.createRadialGradient(VW * 1.05, -VH * 0.1, 0, VW * 1.05, -VH * 0.1, Math.max(VW, VH) * 0.9);
      m.addColorStop(0, "rgba(150,180,255,.14)"); m.addColorStop(1, "rgba(150,180,255,0)");
      ctx.fillStyle = m; ctx.fillRect(0, 0, VW, VH);
    } else if (t === "dawn") {
      ctx.globalCompositeOperation = "screen";
      var d = ctx.createLinearGradient(0, 0, 0, VH); d.addColorStop(0, "rgba(255,190,200,.1)"); d.addColorStop(1, "rgba(255,190,200,0)");
      ctx.fillStyle = d; ctx.fillRect(0, 0, VW, VH);
    }
    ctx.restore();
  };

  /* at night the pond holds the whole sky upside down: its own stars, and
     the moon, shining through the dark rather than dimmed by it */
  X.glowWater = function (ctx, cam, VW, VH) {
    if (G.mapId !== "hill" || !night()) return;
    var h = G.maps.hill, t = G.time();
    if (!G.inRect((cam.x + VW / 2) / T, (cam.y + VH / 2) / T, h.pond, 14)) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (var y = h.pond.y - 1; y < h.pond.y + h.pond.h + 1; y++) for (var x = h.pond.x - 1; x < h.pond.x + h.pond.w + 1; x++) {
      if (G.nearWater(x, y) !== TL.WATER) continue;
      var sx = x * T - cam.x, sy = y * T - cam.y;
      ctx.fillStyle = "rgba(60,80,140,.08)"; ctx.fillRect(sx, sy, T, T);
      for (var k = 0; k < 4; k++) {
        var hh = BS.hash(x, y, k + 400); if (hh < 0.45) continue;
        var tw = 0.5 + 0.5 * Math.sin(t * (1.5 + hh) + hh * 50), px = sx + BS.hash(x, y, k + 500) * 15, py = sy + BS.hash(x, y, k + 600) * 15;
        ctx.fillStyle = "rgba(255,255,235," + (0.25 + tw * 0.6) + ")"; BS.ell(ctx, px, py, 0.4 + tw * 0.25, 0.4 + tw * 0.25); ctx.fill();
        ctx.fillStyle = "rgba(200,220,255," + (0.08 * tw) + ")"; BS.ell(ctx, px, py, 2.2, 2.2); ctx.fill();
      }
    }
    /* the moon, wobbling on the water */
    var mx = 57.5 * T - cam.x + Math.sin(t * 0.8) * 0.6, my = 62.5 * T - cam.y;
    var mg = ctx.createRadialGradient(mx, my, 0, mx, my, 26); mg.addColorStop(0, "rgba(255,250,228,.9)"); mg.addColorStop(0.16, "rgba(255,250,228,.7)"); mg.addColorStop(0.3, "rgba(220,230,255,.18)"); mg.addColorStop(1, "rgba(200,220,255,0)");
    ctx.fillStyle = mg; ctx.fillRect(mx - 26, my - 26, 52, 52);
    for (var r = 0; r < 4; r++) { ctx.fillStyle = "rgba(255,250,228," + (0.25 - r * 0.05) + ")"; ctx.fillRect(mx - 5 + Math.sin(t * 2 + r) * 1.5, my + 6 + r * 3, 10 - r * 2, 0.6); }
    ctx.restore();
  };

  /* the film stock: a per-scene color grade, done by the compositor on the
     GPU (a CSS filter on the stage), eased like the light itself */
  var GRADE = {
    noon: [1.07, 1.14, 1.0], afternoon: [1.07, 1.14, 1.0], morning: [1.06, 1.12, 1.01],
    evening: [1.07, 1.16, 1.0], golden: [1.08, 1.2, 1.0], dawn: [1.05, 1.08, 1.02],
    dusk: [1.06, 1.02, 1.03], night: [1.08, 0.96, 1.06]
  };
  var gNow = null, gStr = "", stage = null;
  function gradeTick(dt) {
    stage = stage || document.getElementById("stage");
    if (!stage || !G.map) return;
    var t = G.mapId === "cellar" ? [1.1, 1.08, 1.0] : G.map.outdoor ? GRADE[G.s.tod] || GRADE.noon : [1.05, 1.1, 1.0];
    if (G.prefs.grade === false) t = [1, 1, 1];
    if (!gNow) gNow = t.slice();
    for (var i = 0; i < 3; i++) gNow[i] += (t[i] - gNow[i]) * Math.min(1, dt * 1.5);
    var s = "contrast(" + gNow[0].toFixed(3) + ") saturate(" + gNow[1].toFixed(3) + ") brightness(" + gNow[2].toFixed(3) + ")";
    if (s !== gStr) { gStr = s; stage.style.filter = s; }
  }

  var breezeT = 0;
  X.update = function (dt, cam, VW, VH) {
    driftTick(dt, cam, VW, VH); gradeTick(dt);
    /* let the ear follow the eye: the gust at your feet is the gust you hear */
    breezeT += dt;
    if (breezeT > 0.12) { breezeT = 0; if (BS.audio && BS.audio.breeze) BS.audio.breeze(G.map && G.map.outdoor ? G.gust(G.p.x, G.p.y) : 0); }
  };
})();
