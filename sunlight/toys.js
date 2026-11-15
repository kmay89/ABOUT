/* toys.js — the hill answers back.

   None of this is the story. All of it is the reason to wander off the path.
   · Dandelion clocks: brush one and a few seeds let go; stop and blow
     (E) and the whole head goes, a little cloud of parachutes riding the
     wind until they are out of sight. They grow back.
   · Windfalls: apples in the grass under the garden trees, pinecones under
     the woods. Walk into one and it rolls, bumps, settles; roll one into
     the pond and it goes in with a plop and a ring.
   · Stones skip: at the pond's edge, E sends a flat one out across the
     water, each touch a ring and a higher note, until it sinks.
   · Bees work the lavender, and scatter when you blunder through it, and
     come back.
   · Fireflies at dusk drift close enough to cup in your hands for a
     moment, glowing through your fingers, before you let them go.
   · The long grass remembers where you walked, for a while.
   Reduced motion keeps all of it still and quiet. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio, T = 16, TL = BS.TL;
  var Y = BS.toys = {};
  var h = G.maps.hill;
  function reduced() { return G.prefs.reduced; }
  function night() { var t = G.s.tod; return t === "night" || t === "dusk"; }
  function hill() { return G.mapId === "hill"; }
  function tile(x, y) { return h.get(Math.floor(x / T), Math.floor(y / T)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function haptic(p) { if (G.prefs.haptics && navigator.vibrate) navigator.vibrate(p); }
  function onScreen(x, y, m) { var v = G.view(), c = G.camPos ? G.camPos() : null; c = c || camRef; return x > c.x - m && x < c.x + v.w + m && y > c.y - m && y < c.y + v.h + m; }
  var camRef = { x: 0, y: 0 };

  /* ---------------- little baked sprites, drawn at 4x then scaled ---------------- */
  var S4 = 4, spr = {};
  function bake(key, w, hh, fn) {
    if (spr[key]) return spr[key];
    var c = BS.cv(w * S4, hh * S4), x = c.getContext("2d"); x.scale(S4, S4); fn(x); c.dw = w; c.dh = hh; spr[key] = c; return c;
  }
  function puffHead() {
    return bake("puff", 8, 8, function (x) {
      var g = x.createRadialGradient(4, 4, 0, 4, 4, 4);
      g.addColorStop(0, "rgba(255,255,250,.55)"); g.addColorStop(0.6, "rgba(250,250,240,.35)"); g.addColorStop(1, "rgba(250,250,240,0)");
      x.fillStyle = g; x.fillRect(0, 0, 8, 8);
      x.strokeStyle = "rgba(255,255,252,.85)"; x.lineWidth = 0.18;
      for (var i = 0; i < 34; i++) {
        var a = i * 2.39996, r = 2.6 + (i % 3) * 0.35, ex = 4 + Math.cos(a) * r, ey = 4 + Math.sin(a) * r;
        x.beginPath(); x.moveTo(4, 4); x.lineTo(ex, ey); x.stroke();
        x.fillStyle = "rgba(255,255,255,.95)"; x.beginPath(); x.arc(ex, ey, 0.32, 0, 7); x.fill();
      }
      x.fillStyle = "#a89a60"; x.beginPath(); x.arc(4, 4, 0.7, 0, 7); x.fill();
    });
  }
  function appleSpr(k) {
    return bake("apple" + k, 5, 5, function (x) {
      var base = k ? ["#f2d860", "#d8a830", "#8a6418"] : ["#ff7a5a", "#d0302a", "#6a1410"];
      var g = x.createRadialGradient(1.8, 1.8, 0.2, 2.5, 2.6, 2.6);
      g.addColorStop(0, base[0]); g.addColorStop(0.55, base[1]); g.addColorStop(1, base[2]);
      x.fillStyle = g; x.beginPath(); x.arc(2.5, 2.6, 2.2, 0, 7); x.fill();
      x.strokeStyle = "rgba(255,240,200,.25)"; x.lineWidth = 0.15;
      for (var i = 0; i < 5; i++) { x.beginPath(); x.moveTo(1 + i * 0.7, 1); x.quadraticCurveTo(1.2 + i * 0.7, 2.6, 1 + i * 0.75, 4.4); x.stroke(); }
      x.fillStyle = "rgba(255,255,255,.75)"; x.beginPath(); x.ellipse(1.6, 1.6, 0.6, 0.35, -0.6, 0, 7); x.fill();
      x.strokeStyle = "#4a3018"; x.lineWidth = 0.35; x.beginPath(); x.moveTo(2.5, 0.8); x.lineTo(2.8, 0); x.stroke();
      x.fillStyle = "#5a8a2a"; x.beginPath(); x.ellipse(3.3, 0.5, 0.7, 0.3, -0.4, 0, 7); x.fill();
    });
  }
  function coneSpr() {
    return bake("cone", 5, 6, function (x) {
      x.translate(2.5, 3);
      for (var row = 0; row < 7; row++) {
        var y = -2.4 + row * 0.8, w = 1.9 * Math.sin((row + 0.6) / 7.4 * Math.PI);
        for (var s = -1; s <= 1; s++) {
          var cx = s * w * 0.55 + (row % 2) * 0.25;
          var g = x.createLinearGradient(cx, y - 0.5, cx, y + 0.6); g.addColorStop(0, "#b07a40"); g.addColorStop(1, "#4a2c14");
          x.fillStyle = g; x.beginPath(); x.ellipse(cx, y, 0.62, 0.48, 0, 0, 7); x.fill();
          x.fillStyle = "rgba(240,200,140,.35)"; x.fillRect(cx - 0.3, y - 0.42, 0.6, 0.12);
        }
      }
    });
  }
  function stoneSpr() {
    return bake("stone", 4, 3, function (x) {
      var g = x.createLinearGradient(0, 0, 0, 3); g.addColorStop(0, "#d8d2c4"); g.addColorStop(1, "#7a746a");
      x.fillStyle = g; x.beginPath(); x.ellipse(2, 1.5, 1.8, 1.1, 0, 0, 7); x.fill();
    });
  }

  /* ---------------- where things are ---------------- */
  var dands = [], balls = [], lavs = [], edge = [], built = false;
  function build() {
    built = true;
    for (var ty = 0; ty < h.h; ty++) for (var tx = 0; tx < h.w; tx++) {
      var t = h.get(tx, ty), r = BS.hash(tx, ty, 311);
      if ((t === TL.FIELD || t === TL.GRASS || t === TL.LONG) && r < (t === TL.LONG ? 0.035 : 0.06) && ty < 53)
        dands.push({ x: tx * T + 3 + BS.hash(ty, tx, 5) * 10, y: ty * T + 5 + BS.hash(tx, ty, 6) * 9, full: 1, regrow: 0, ph: r * 60, lean: 0 });
      if (t === TL.TREE && r < 0.7) {
        var n = 1 + ((r * 10) | 0) % 2;
        for (var k = 0; k < n; k++) {
          var a = BS.hash(tx, ty, k + 40) * 6.28, d = 9 + BS.hash(ty, tx, k + 41) * 10;
          var bx = tx * T + 8 + Math.cos(a) * d, by = ty * T + 16 + Math.abs(Math.sin(a)) * d * 0.6;
          if (BS.SOLID[tile(bx, by)]) continue;
          balls.push({ x: bx, y: by, hx: bx, hy: by, z: 0, vx: 0, vy: 0, vz: 0, rot: a, kind: "apple", hue: BS.hash(tx, ty, k + 42) < 0.3 ? 1 : 0, gone: 0, cool: 0 });
        }
      }
      if (t === TL.LITTER && r < 0.07 && !BS.SOLID[h.get(tx, ty + 1)]) balls.push({ x: tx * T + 8, y: ty * T + 10, hx: tx * T + 8, hy: ty * T + 10, z: 0, vx: 0, vy: 0, vz: 0, rot: r * 60, kind: "cone", hue: 0, gone: 0, cool: 0 });
      if (t === TL.LAVENDER) lavs.push({ x: tx * T + 8, y: ty * T + 10 });
      if (t === TL.WATER) {
        [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (o) {
          var nt = h.get(tx + o[0], ty + o[1]);
          if (nt >= 0 && !BS.SOLID[nt]) edge.push({ x: (tx + o[0]) * T + 8 - o[0] * 4, y: (ty + o[1]) * T + 8 - o[1] * 4, wx: tx * T + 8, wy: ty * T + 8 });
        });
      }
    }
    lavs.forEach(function (l, i) { if (i % 3 === 0) for (var b = 0; b < 2; b++) bees.push({ ax: l.x, ay: l.y, x: l.x, y: l.y - 8, z: 8, ph: Math.random() * 6, sc: 0, sx: 0, sy: 0 }); });
  }

  /* ---------------- dandelion clocks ---------------- */
  var seeds = [];
  function letGo(d, n, blow) {
    var dir = blow ? [[0, 1], [0, -1], [1, 0], [-1, 0]][G.p.dir] : [0, 0];
    for (var i = 0; i < n; i++) {
      seeds.push({ x: d.x + rnd(-2, 2), y: d.y + rnd(-1, 1), z: 7 + rnd(-1.5, 1.5), vx: dir[0] * rnd(14, 30) + rnd(-6, 6) + 6, vy: dir[1] * rnd(10, 22) + rnd(-4, 4), vz: rnd(3, 9), t: 0, life: rnd(5, 9), ph: Math.random() * 6 });
    }
    if (seeds.length > 260) seeds.splice(0, seeds.length - 260);
  }
  function nearDand() {
    var best = null, bd = 18, p = G.p;
    dands.forEach(function (d) { if (d.full < 0.6) return; var dd = Math.hypot(d.x - p.x, d.y - p.y); if (dd < bd) { bd = dd; best = d; } });
    return best;
  }
  function blowDand(d) {
    letGo(d, 26 + (Math.random() * 10 | 0), true);
    d.full = 0; d.regrow = 0;
    A.sfx("wish", d.x, d.y);
    if (BS.life) BS.life.mood("p", "happy", 1.6);
    haptic(10);
    if (G.countOnce) G.countOnce("wishes", Math.round(d.x) + "," + Math.round(d.y));
  }
  function dandTick(dt) {
    var p = G.p;
    dands.forEach(function (d) {
      if (d.full < 1) { d.regrow += dt; if (d.regrow > 70) d.full = Math.min(1, d.full + dt * 0.2); }
      var dx = d.x - p.x, dy = d.y - p.y;
      if (p.moving && Math.abs(dx) < 7 && Math.abs(dy) < 5) {
        d.lean = (dx > 0 ? 1 : -1) * 0.5;
        if (d.full > 0.3 && Math.random() < dt * 8) { var n = 2 + (Math.random() * 3 | 0); letGo(d, n, false); d.full = Math.max(0.25, d.full - n * 0.03); d.regrow = 0; }
      }
      d.lean *= Math.exp(-dt * 3);
      if (d.full > 0.5 && G.gust && G.gust(d.x, d.y) > 0.5 && Math.random() < dt * 0.4) { letGo(d, 1, false); d.full -= 0.02; }
    });
    for (var i = seeds.length - 1; i >= 0; i--) {
      var s = seeds[i]; s.t += dt;
      var g = G.gust ? G.gust(s.x, s.y) : 0;
      s.vx += (10 + g * 40 - s.vx) * dt * 0.5; s.vy += (Math.sin(s.t * 1.3 + s.ph) * 4 - s.vy) * dt * 0.6;
      s.vz += (2.5 + g * 6 - s.vz) * dt * 0.4;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.t > s.life) seeds.splice(i, 1);
    }
  }
  function drawDand(ctx, cam, d, t) {
    var sx = d.x - cam.x, sy = d.y - cam.y, g = G.gust ? G.gust(d.x, d.y) : 0;
    var sway = reduced() ? 0 : Math.sin(t * 1.7 + d.ph) * 0.6 + g * 1.8 + d.lean * 3, tipX = sx + sway, tipY = sy - 8;
    G.shadowAt(d.x, d.y, 2.2, 0.16);
    ctx.strokeStyle = "#6a8a3a"; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + sway * 0.2, sy - 4, tipX, tipY); ctx.stroke();
    ctx.fillStyle = "#5a7a2a"; ctx.beginPath(); ctx.ellipse(sx - 1.6, sy - 0.3, 1.8, 0.45, 0.25, 0, 7); ctx.ellipse(sx + 1.6, sy - 0.2, 1.7, 0.45, -0.3, 0, 7); ctx.fill();
    if (d.full > 0.02) {
      var r = 2.4 + d.full * 1.2, img = puffHead();
      ctx.globalAlpha = 0.35 + d.full * 0.65;
      ctx.drawImage(img, tipX - r, tipY - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    } else { ctx.fillStyle = "#b8a868"; ctx.beginPath(); ctx.arc(tipX, tipY, 0.7, 0, 7); ctx.fill(); }
  }
  function drawSeeds(ctx, cam, t) {
    if (!seeds.length) return;
    ctx.strokeStyle = "rgba(255,255,250,.85)"; ctx.lineWidth = 0.2;
    seeds.forEach(function (s) {
      var k = s.t / s.life, a = k < 0.1 ? k * 10 : k > 0.75 ? (1 - k) / 0.25 : 1, sx = s.x - cam.x, sy = s.y - cam.y - s.z;
      ctx.globalAlpha = a * 0.18; ctx.fillStyle = "#1a1208"; ctx.fillRect(s.x - cam.x - 0.4, s.y - cam.y, 0.8, 0.4);
      ctx.globalAlpha = a; var w = Math.sin(t * 3 + s.ph) * 0.4;
      ctx.beginPath(); ctx.moveTo(sx, sy + 1.2); ctx.lineTo(sx, sy);
      ctx.moveTo(sx - 1 + w, sy - 0.5); ctx.lineTo(sx, sy); ctx.lineTo(sx + 1 + w, sy - 0.5); ctx.moveTo(sx, sy); ctx.lineTo(sx + w * 0.5, sy - 1.1); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(sx - 0.25, sy - 0.25, 0.5, 0.5);
    });
    ctx.globalAlpha = 1;
  }

  /* ---------------- windfalls ---------------- */
  var ppx = null, ppy = null, pvx = 0, pvy = 0;
  function ballTick(dt) {
    var p = G.p;
    if (ppx != null && dt > 0) { pvx += ((p.x - ppx) / dt - pvx) * Math.min(1, dt * 12); pvy += ((p.y - ppy) / dt - pvy) * Math.min(1, dt * 12); }
    ppx = p.x; ppy = p.y;
    balls.forEach(function (b) {
      if (b.gone) { b.gone -= dt; if (b.gone <= 0) { b.gone = 0; if (onScreen(b.hx, b.hy, 30)) b.gone = 2; else { b.x = b.hx; b.y = b.hy; b.vx = b.vy = 0; b.z = 0; b.sink = 0; } } return; }
      if (b.sink) { b.sink += dt; if (b.sink > 0.9) { b.gone = 25; } return; }
      b.cool -= dt;
      var dx = b.x - p.x, dy = (b.y - (p.y - 1)) * 1.4, d = Math.hypot(dx, dy);
      if (d < 7 && b.cool <= 0 && !G.cut) {
        var sp = Math.hypot(pvx, pvy), nx = dx / (d || 1), ny = dy / (d || 1);
        if (sp > 8) {
          var kick = 46 + sp * 0.9;
          b.vx = (nx * 0.55 + pvx / sp * 0.45) * kick; b.vy = (ny * 0.55 + pvy / sp * 0.45) * kick * 0.8;
          b.vz = 22 + Math.random() * 10; b.cool = 0.35;
          A.sfx("tok", b.x, b.y); haptic(8);
          if (G.count) G.count("kicks");
        } else { b.x = p.x + nx * 7; b.y = p.y - 1 + ny * 7 / 1.4; }
      }
      var spd = Math.hypot(b.vx, b.vy);
      if (spd > 0.5 || b.z > 0) {
        var nxp = b.x + b.vx * dt, nyp = b.y + b.vy * dt, tl = tile(nxp, nyp);
        if (tl === TL.WATER || tl === TL.SPRING) {
          b.x = nxp; b.y = nyp; b.sink = 0.01; b.vx = b.vy = 0;
          if (BS.juice && BS.juice.ripple) BS.juice.ripple(b.x, b.y, 1.1);
          splash(b.x, b.y, 8);
          A.sfx("plop", b.x, b.y);
          if (G.count) G.count("plops");
          return;
        }
        if (BS.SOLID[tl] || tl < 0) {
          if (BS.SOLID[tile(nxp, b.y)] || tile(nxp, b.y) < 0) b.vx *= -0.45; else b.x = nxp;
          if (BS.SOLID[tile(b.x, nyp)] || tile(b.x, nyp) < 0) b.vy *= -0.45; else b.y = nyp;
          if (spd > 14) A.sfx("tok", b.x, b.y, 0.5);
        } else { b.x = nxp; b.y = nyp; }
        var fr = tl === TL.ROAD || tl === TL.LANE || tl === TL.SAND ? 1.3 : tl === TL.LONG ? 3.6 : 2.4;
        if (b.z <= 0) { b.vx *= Math.exp(-fr * dt); b.vy *= Math.exp(-fr * dt); }
        b.vz -= 160 * dt; b.z += b.vz * dt;
        if (b.z < 0) { b.z = 0; if (b.vz < -18) { b.vz = -b.vz * 0.35; if (spd > 10) A.sfx("tok", b.x, b.y, 0.35); } else b.vz = 0; }
        b.rot += (b.vx >= 0 ? 1 : -1) * spd * dt / 2.2;
        if (spd < 0.5) { b.vx = b.vy = 0; }
      }
    });
  }
  function drawBall(ctx, cam, b) {
    var sx = b.x - cam.x, sy = b.y - cam.y;
    var k = b.sink ? 1 - b.sink / 0.9 : 1;
    if (k <= 0) return;
    if (!b.sink) G.shadowAt(b.x, b.y + 0.5, 2.2 - Math.min(1, b.z / 20), 0.3);
    var img = b.kind === "cone" ? coneSpr() : appleSpr(b.hue), w = img.dw, hh = img.dh;
    ctx.save(); ctx.translate(sx, sy - b.z - hh * 0.45 + (1 - k) * 2);
    ctx.rotate(b.rot);
    if (b.sink) { ctx.globalAlpha = k; ctx.scale(k, k); }
    ctx.drawImage(img, -w / 2, -hh / 2, w, hh);
    ctx.restore(); ctx.globalAlpha = 1;
  }

  /* ---------------- water: splashes, and skipping stones ---------------- */
  var drops = [];
  function splash(x, y, n) {
    if (reduced()) return;
    for (var i = 0; i < n; i++) { var a = Math.random() * 6.28, s = rnd(6, 16); drops.push({ x: x, y: y, z: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, vz: rnd(20, 40), t: 0 }); }
  }
  function dropTick(dt) {
    for (var i = drops.length - 1; i >= 0; i--) {
      var d = drops[i]; d.t += dt; d.vz -= 140 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.z < 0) drops.splice(i, 1);
    }
  }
  var stone = null;
  function nearEdge() {
    var p = G.p, best = null, bd = 16;
    edge.forEach(function (e) { var d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } });
    return best;
  }
  function throwStone(e) {
    if (stone) return;
    var cx = (h.pond.x + h.pond.w / 2) * T, cy = (h.pond.y + h.pond.h / 2) * T;
    var a = Math.atan2(cy - G.p.y, cx - G.p.x) + rnd(-0.35, 0.35);
    /* good throws are common, great ones rare */
    var skips = 1 + Math.floor(Math.pow(Math.random(), 0.8) * 7);
    stone = { x: G.p.x, y: G.p.y - 10, z: 10, a: a, hop: 0, skips: skips, done: 0, from: [G.p.x, G.p.y], step: 30, t: 0, dur: 0.38, sx: G.p.x, sy: G.p.y, sz: 10, sunk: false };
    nextHop(stone);
    G.p.dir = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 2 : 3) : (Math.sin(a) > 0 ? 0 : 1);
    A.sfx("whiff"); haptic(6);
    if (BS.life) BS.life.mood("p", "wow", 2.6);
  }
  function nextHop(s) {
    s.sx = s.x; s.sy = s.y; s.sz = s.z; s.t = 0;
    s.tx = s.x + Math.cos(s.a) * s.step; s.ty = s.y + Math.sin(s.a) * s.step * 0.8;
    s.dur = 0.18 + s.step / 120; s.peak = 3 + s.step * 0.18;
  }
  function stoneTick(dt) {
    var s = stone; if (!s) return;
    if (s.sunk) { s.t += dt; if (s.t > 1.6) stone = null; return; }
    s.t += dt; var k = Math.min(1, s.t / s.dur);
    s.x = s.sx + (s.tx - s.sx) * k; s.y = s.sy + (s.ty - s.sy) * k;
    s.z = s.sz * (1 - k) + Math.sin(k * Math.PI) * s.peak;
    if (k < 1) return;
    var tl = tile(s.x, s.y), wet = tl === TL.WATER;
    if (!wet) { A.sfx("tok", s.x, s.y, 0.4); finish(s, false); return; }
    s.done++;
    if (BS.juice && BS.juice.ripple) BS.juice.ripple(s.x, s.y, 0.6 + s.step / 60);
    splash(s.x, s.y, 3);
    if (s.done >= s.skips) { A.sfx("plop", s.x, s.y); finish(s, true); return; }
    A.sfx("skip", s.x, s.y, s.done);
    pops.push({ x: s.x, y: s.y - 8, t: 0, n: s.done });
    s.step *= 0.74; s.a += rnd(-0.12, 0.12); s.z = 0; nextHop(s);
  }
  function finish(s, wet) {
    s.sunk = true; s.t = 0;
    var n = s.done;
    if (n > 0) {
      G.s.counts = G.s.counts || {};
      var best = G.s.counts.skipbest || 0;
      if (n > best) { G.s.counts.skipbest = n; }
      if (G.count) G.count("skips");
      if (n >= 5) { A.sfx("secret"); if (G.burst) G.burst(s.x, s.y - 6, 14, "200,230,255", 10); }
      if (BS.life) BS.life.mood("p", n >= 4 ? "wow" : "happy", 1.8);
      pops.push({ x: s.x, y: s.y - 12, t: 0, n: n, final: true, best: n > best && best > 0 });
    }
  }
  var pops = [];
  function drawStone(ctx, cam) {
    var s = stone; if (!s || s.sunk) return;
    var sx = s.x - cam.x, sy = s.y - cam.y;
    if (tile(s.x, s.y) === TL.WATER) { ctx.fillStyle = "rgba(10,20,30,.25)"; ctx.beginPath(); ctx.ellipse(sx, sy, 1.4, 0.5, 0, 0, 7); ctx.fill(); }
    var img = stoneSpr(); ctx.drawImage(img, sx - 1.5, sy - s.z - 1.2, 3, 2.2);
  }
  function drawDrops(ctx, cam) {
    if (!drops.length) return;
    ctx.fillStyle = "rgba(225,240,250,.85)";
    drops.forEach(function (d) { ctx.fillRect(d.x - cam.x - 0.3, d.y - cam.y - d.z - 0.3, 0.6, 0.9); });
  }
  function drawPops(ctx, cam, dt) {
    for (var i = pops.length - 1; i >= 0; i--) {
      var p = pops[i]; p.t += dt; var life = p.final ? 2.4 : 0.8;
      if (p.t > life) { pops.splice(i, 1); continue; }
      var k = p.t / life, a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.5) / 0.5);
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = "center";
      ctx.font = (p.final ? "italic 7.5px " : "5.5px ") + "'Sunlight Book', Georgia, serif";
      var y = p.y - cam.y - k * (p.final ? 10 : 6), txt = p.final ? (p.n === 1 ? "one skip" : p.n + " skips") + (p.best ? " · best yet" : "") : "" + p.n;
      ctx.lineWidth = 1.4; ctx.strokeStyle = "rgba(20,30,40,.55)"; ctx.strokeText(txt, p.x - cam.x, y);
      ctx.fillStyle = p.final ? "#fff4d0" : "#e8f4ff"; ctx.fillText(txt, p.x - cam.x, y);
      ctx.restore();
    }
  }

  /* ---------------- bees in the lavender ---------------- */
  var bees = [], buzzT = 0;
  function beeTick(dt) {
    var p = G.p, t = G.time(), close = 999;
    bees.forEach(function (b) {
      var d = Math.hypot(b.ax - p.x, b.ay - p.y);
      close = Math.min(close, d);
      if (d < 16 && p.moving && b.sc <= 0) { b.sc = 3 + Math.random() * 2; var a = Math.atan2(b.y - p.y, b.x - p.x) + rnd(-0.6, 0.6); b.sx = Math.cos(a) * 34; b.sy = Math.sin(a) * 22; }
      var tx, ty, tz;
      if (b.sc > 0) { b.sc -= dt; tx = b.ax + b.sx; ty = b.ay + b.sy; tz = 18; }
      else { tx = b.ax + Math.sin(t * 1.3 + b.ph) * 6; ty = b.ay - 2 + Math.sin(t * 2.6 + b.ph * 2) * 3; tz = 6 + Math.sin(t * 3.1 + b.ph) * 2; }
      var k = Math.min(1, dt * (b.sc > 0 ? 4 : 2));
      b.x += (tx - b.x) * k; b.y += (ty - b.y) * k; b.z += (tz - b.z) * k;
    });
    buzzT -= dt;
    if (close < 50 && buzzT <= 0 && !night()) { buzzT = rnd(1.5, 3.5); A.sfx("bee", p.x, p.y, 1 - close / 50); }
  }
  function drawBee(ctx, cam, b, t) {
    var sx = b.x - cam.x, sy = b.y - cam.y - b.z;
    ctx.globalAlpha = 0.12; ctx.fillStyle = "#1a1208"; ctx.fillRect(b.x - cam.x - 0.6, b.y - cam.y, 1.2, 0.5); ctx.globalAlpha = 1;
    var w = Math.abs(Math.sin(t * 70 + b.ph));
    ctx.fillStyle = "rgba(240,250,255," + (0.3 + w * 0.3) + ")"; ctx.beginPath(); ctx.ellipse(sx - 0.2, sy - 0.9, 0.8, 0.5 + w * 0.3, -0.3, 0, 7); ctx.ellipse(sx + 0.5, sy - 0.9, 0.8, 0.5 + w * 0.3, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = "#e8b828"; ctx.beginPath(); ctx.ellipse(sx, sy, 1.1, 0.75, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#2a1a08"; ctx.fillRect(sx - 0.25, sy - 0.7, 0.35, 1.4); ctx.fillRect(sx + 0.45, sy - 0.6, 0.3, 1.2);
  }

  /* ---------------- fireflies you can hold ---------------- */
  var flies = [], held = null, light = { map: "hill", l: [0, 0, 0, 0, "ff"] }, lightOn = false;
  function flyTick(dt) {
    var p = G.p, t = G.time(), want = hill() && night() && !reduced() && p.y / T < 56;
    if (!want) { flies.length = 0; if (lightOn) { G.extraLights.splice(G.extraLights.indexOf(light), 1); lightOn = false; } held = null; return; }
    while (flies.length < 7) { var a = Math.random() * 6.28, r = rnd(40, 110); flies.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.7, z: rnd(6, 18), vx: 0, vy: 0, ph: Math.random() * 9, per: rnd(2.5, 4.5), free: 0 }); }
    flies.forEach(function (f, i) {
      if (f === held) return;
      var d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d > 160) { var a2 = Math.random() * 6.28; f.x = p.x + Math.cos(a2) * 120; f.y = p.y + Math.sin(a2) * 80; }
      if (f.free > 0) { f.free -= dt; f.z += dt * 14; f.x += f.vx * dt; f.y += f.vy * dt; if (f.free <= 0) { f.z = rnd(6, 16); } return; }
      f.vx += (Math.sin(t * 0.7 + f.ph) * 12 - f.vx) * dt; f.vy += (Math.cos(t * 0.5 + f.ph * 1.3) * 8 - f.vy) * dt;
      /* curious: they drift toward someone standing still */
      if (G.p.still > 1.2 && d > 14 && d < 90) { f.vx += (p.x - f.x) / d * 6 * dt * 4; f.vy += (p.y - 8 - f.y) / d * 6 * dt * 4; }
      f.x += f.vx * dt; f.y += f.vy * dt; f.z = Math.max(3, Math.min(22, f.z + Math.sin(t * 1.1 + f.ph) * dt * 3));
    });
    if (held) {
      held.ht += dt;
      var hx = p.x + [0, 0, 3, -3][p.dir], hy = p.y - 6;
      held.x = hx; held.y = hy + 0.01; held.z = 0;
      var pulse = 0.5 + 0.5 * Math.sin(held.ht * 4);
      light.l[0] = hx; light.l[1] = hy; light.l[2] = 26 + pulse * 10; light.l[3] = 0.55 + pulse * 0.25;
      if (!lightOn) { G.extraLights.push(light); lightOn = true; }
      if (held.ht > 3.2) {
        var a3 = rnd(-2.4, -0.7);
        held.free = 2.5; held.vx = Math.cos(a3) * 10; held.vy = Math.sin(a3) * 6; held.y = hy; held.z = 10; held.x = hx;
        A.sfx("chime", hx, hy);
        held = null;
      }
    } else if (lightOn) { G.extraLights.splice(G.extraLights.indexOf(light), 1); lightOn = false; }
  }
  function lit(f, t) { return held === f ? 1 : Math.max(0, Math.sin((t + f.ph) / f.per * Math.PI * 2)) ; }
  function nearFly() {
    if (held || !flies.length) return null;
    var p = G.p, best = null, bd = 22, t = G.time();
    flies.forEach(function (f) { if (f.free > 0) return; var d = Math.hypot(f.x - p.x, f.y - f.z * 0.3 - (p.y - 6)); if (d < bd && lit(f, t) > 0.15) { bd = d; best = f; } });
    return best;
  }
  function catchFly(f) {
    held = f; f.ht = 0;
    A.sfx("cup"); haptic([6, 40, 6]);
    if (BS.life) BS.life.mood("p", "wow", 3);
    if (G.count) G.count("fireflies");
  }
  function drawFlies(ctx, cam, t, dark) {
    if (!flies.length) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    flies.forEach(function (f) {
      var l = lit(f, t); if (l < 0.02) return;
      var sx = f.x - cam.x, sy = f.y - cam.y - f.z;
      if (f === held) {
        /* cupped hands: the glow is low and close, and light leaks up between the fingers */
        var r = 8 + Math.sin(f.ht * 4) * 1.5;
        var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, "rgba(230,255,150,.75)"); g.addColorStop(0.3, "rgba(190,240,90,.3)"); g.addColorStop(1, "rgba(150,220,60,0)");
        ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
        for (var k = -1; k <= 1; k++) {
          var lg = ctx.createLinearGradient(0, sy - 1, 0, sy - 9);
          lg.addColorStop(0, "rgba(220,255,140," + (0.4 + 0.2 * Math.sin(f.ht * 6 + k)) + ")"); lg.addColorStop(1, "rgba(200,255,120,0)");
          ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(sx + k * 1.3 - 0.25, sy - 1); ctx.lineTo(sx + k * 2.4 - 0.6, sy - 9); ctx.lineTo(sx + k * 2.4 + 0.6, sy - 9); ctx.lineTo(sx + k * 1.3 + 0.25, sy - 1); ctx.fill();
        }
        return;
      }
      var R = 3 + l * 4, g2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      g2.addColorStop(0, "rgba(220,255,140," + (0.85 * l) + ")"); g2.addColorStop(0.3, "rgba(180,240,80," + (0.3 * l) + ")"); g2.addColorStop(1, "rgba(150,220,60,0)");
      ctx.fillStyle = g2; ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
    });
    ctx.restore();
  }

  /* ---------------- the long grass remembers ---------------- */
  var trail = [], lastTx = null, lastTy = null;
  function trailTick(dt) {
    for (var i = trail.length - 1; i >= 0; i--) { trail[i].t += dt; if (trail[i].t > 30) trail.splice(i, 1); }
    var p = G.p;
    if (!p.moving || G.mode !== "walk") return;
    var tl = tile(p.x, p.y); if (tl !== TL.LONG && tl !== TL.FIELD) { lastTx = null; return; }
    if (lastTx != null && Math.hypot(p.x - lastTx, p.y - lastTy) < 5) return;
    var a = lastTx == null ? [Math.PI / 2, -Math.PI / 2, 0, Math.PI][p.dir] : Math.atan2(p.y - lastTy, p.x - lastTx);
    trail.push({ x: p.x, y: p.y, a: a, t: 0, w: tl === TL.LONG ? 1 : 0.6 });
    if (trail.length > 220) trail.shift();
    lastTx = p.x; lastTy = p.y;
  }
  function drawTrail(ctx, cam) {
    if (!trail.length) return;
    ctx.save(); ctx.lineCap = "round";
    trail.forEach(function (m) {
      var k = m.t / 30, a = (k < 0.05 ? k / 0.05 : 1 - k) * m.w;
      if (a <= 0.01) return;
      var sx = m.x - cam.x, sy = m.y - cam.y, c = Math.cos(m.a), s = Math.sin(m.a);
      /* blades pressed flat along the way you went: darker underneath, a pale sheen on top */
      ctx.strokeStyle = "rgba(70,72,24," + (0.22 * a) + ")"; ctx.lineWidth = 5.5;
      ctx.beginPath(); ctx.moveTo(sx - c * 3, sy - s * 3); ctx.lineTo(sx + c * 3, sy + s * 3); ctx.stroke();
      ctx.strokeStyle = "rgba(255,240,170," + (0.16 * a) + ")"; ctx.lineWidth = 0.4;
      for (var j = -2; j <= 2; j++) { var ox = -s * j * 1.1, oy = c * j * 1.1; ctx.beginPath(); ctx.moveTo(sx + ox - c * 2.5, sy + oy - s * 2.5); ctx.lineTo(sx + ox + c * 2.5, sy + oy + s * 2.5); ctx.stroke(); }
    });
    ctx.restore();
  }

  /* ---------------- the E key: one spot that is wherever the nearest toy is ---------------- */
  var toySpot = { id: "toy", toy: true, map: "hill", x: 0, y: 0, r: 20, label: "", when: function () { return !!pick(); }, act: function () { var k = pick(); if (k) k.go(); } };
  var picked = null, pickT = -1, pkx = 0, pky = 0;
  function pick() {
    var t = G.time(); if (t === pickT && G.p.x === pkx && G.p.y === pky) return picked; pickT = t; pkx = G.p.x; pky = G.p.y;
    picked = null; if (!hill() || reduced() && false) return null;
    var f = nearFly();
    if (f) { picked = { x: f.x, y: f.y + 4, label: "Cup the firefly", go: function () { catchFly(f); } }; }
    else {
      var e = !stone && nearEdge();
      if (e) picked = { x: e.x, y: e.y, label: "Skip a stone", go: function () { throwStone(e); } };
      else { var d = nearDand(); if (d) picked = { x: d.x, y: d.y, label: "Make a wish", go: function () { blowDand(d); } }; }
    }
    if (picked) { toySpot.x = picked.x / T; toySpot.y = picked.y / T; toySpot.label = picked.label; }
    return picked;
  }

  /* ---------------- hooks ---------------- */
  var lastT = 0;
  Y.update = function (dt) {
    if (!built) { build(); G.spot(toySpot); }
    if (!G.s || G.mode === "title" || !hill()) { if (!hill() && lightOn) { G.extraLights.splice(G.extraLights.indexOf(light), 1); lightOn = false; held = null; } return; }
    pick();
    if (reduced()) return;
    dandTick(dt); ballTick(dt); dropTick(dt); stoneTick(dt); beeTick(dt); flyTick(dt); trailTick(dt);
  };
  Y.under = function (ctx, cam) { camRef = cam; if (hill() && !reduced()) drawTrail(ctx, cam); };
  Y.sorted = function (list, ctx, cam, t) {
    if (!hill() || !built) return;
    camRef = cam;
    var v = G.view();
    function vis(x, y, m) { return x > cam.x - m && x < cam.x + v.w + m && y > cam.y - m && y < cam.y + v.h + m + 20; }
    dands.forEach(function (d) { if (vis(d.x, d.y, 12)) list.push({ y: d.y, d: function () { drawDand(ctx, cam, d, t); } }); });
    balls.forEach(function (b) { if (!b.gone && vis(b.x, b.y, 8)) list.push({ y: b.y + 0.5, d: function () { drawBall(ctx, cam, b); } }); });
    if (!night()) bees.forEach(function (b) { if (vis(b.x, b.y, 10)) list.push({ y: b.y + 2, d: function () { drawBee(ctx, cam, b, t); } }); });
  };
  var lastOver = 0;
  Y.over = function (ctx, cam, t) {
    if (!hill()) return;
    var dt = Math.min(0.05, Math.max(0, t - lastOver)); lastOver = t;
    drawSeeds(ctx, cam, t); drawStone(ctx, cam); drawDrops(ctx, cam); drawPops(ctx, cam, dt);
  };
  Y.post = function (ctx, cam, t, dark) { if (hill()) drawFlies(ctx, cam, t, dark); };
  Y.dbg = function () { return { dands: dands, balls: balls, bees: bees, edge: edge, flies: flies }; };
  Y.reset = function () { seeds = []; drops = []; stone = null; pops = []; trail = []; held = null; balls.forEach(function (b) { b.x = b.hx; b.y = b.hy; b.vx = b.vy = 0; b.z = 0; b.gone = 0; b.sink = 0; }); };
})();
