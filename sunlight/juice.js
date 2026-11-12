/* juice.js — the small things that make a place feel alive, and a moment
   feel like a moment.

   · Places announce themselves: walk into the hollow and its name rises
     at the top of the screen with a two-note harp, the way a good map
     reads a name to you.
   · The hill is inhabited: sparrows hop and peck in the grass and burst
     up and away when you come close; frogs plop into the pond; the white
     butterfly shies off; fish rise in the pond at dusk.
   · Feet leave prints in sand and mud that slowly fill back in; water
     rings out where something touches it.
   · Gold sparkles burst where something becomes yours; motes of gold
     drift up the screen while Mo is speaking; speed lines stream past on
     the ride; the battery fills at the bottom of the hill.
   All of it honors reduced motion, and none of it carries meaning that
   isn't also said in words. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio, T = 16, $ = G.$, TL = BS.TL;
  var J = BS.juice = {};
  function reduced() { return G.prefs.reduced; }

  /* ---------------- places, by name ---------------- */
  var h = G.maps.hill;
  var REG = [
    { n: "The Hollow", s: "cold, and wet, and dark", in: function (x, y) { return G.inRect(x, y, h.hollow, 0); } },
    { n: "The Pond", s: "the whole sky, upside down", in: function (x, y) { return G.inRect(x, y, h.pond, 1); } },
    { n: "The Great Gray Beech", s: "where the gold runs out", in: function (x, y) { return x >= 27 && x < 36 && y >= 59 && y < 64; } },
    { n: "The Woods", s: "the back of the world", in: function (x, y) { return y > 53.5; } },
    { n: "The Pit", s: "the one place that is actually dangerous", in: function (x, y) { return G.inRect(x, y, h.pit, 0); } },
    { n: "The Back Lane", s: "a mile down to the pit", in: function (x, y) { return x >= 66 && x < 81 && y >= 19 && y < 34; } },
    { n: "Beck's House", s: "four brothers, one drum", in: function (x, y) { return x >= 61 && x < 74 && y >= 7 && y < 19; } },
    { n: "The Back Field", s: "over the hedge", in: function (x, y) { return x >= 53 && x < 66 && y >= 4 && y < 31; } },
    { n: "The Crest", s: "where the road tips over", in: function (x, y) { return x >= 35 && x < 45 && y >= 24.6 && y < 29; } },
    { n: "Gran's Garden", s: "the lavender, gone leggy and wonderful", in: function (x, y) { return x >= 26 && x < 53 && y >= 3 && y < 24.6; } },
    { n: "The Hill", s: "a hill the world had mostly forgotten", in: function () { return true; } }
  ];
  J.REGN = REG.length;
  var INTERIOR = { house: ["Gran's House", "forty years of her, in boxes"], cellar: ["The Cellar", "a hundred summers, in the dark"], shed: ["The Shed", "the warm lung"] };
  var regionNow = "", shown = {}, pending = null;
  function regionTick() {
    var name, sub;
    if (G.mapId === "hill") { var x = G.p.x / T, y = G.p.y / T; for (var i = 0; i < REG.length; i++) if (REG[i].in(x, y)) { name = REG[i].n; sub = REG[i].s; break; } }
    else if (INTERIOR[G.mapId]) { name = INTERIOR[G.mapId][0]; sub = INTERIOR[G.mapId][1]; }
    if (!name || name === regionNow) return;
    regionNow = name;
    if (G.mapId === "hill") { G.s.regions = G.s.regions || {}; G.s.regions[name] = 1; }
    pending = [name, sub];
  }
  function showPending() {
    if (!pending || G.cut || G.mode !== "walk") return;
    var p = pending; pending = null;
    var now = G.time();
    if (shown[p[0]] && now - shown[p[0]] < 45) return;
    shown[p[0]] = now;
    var r = $("region"); $("rname").textContent = p[0]; $("rsub").textContent = p[1];
    r.classList.remove("on"); void r.offsetWidth; r.classList.add("on");
    /* while a place says its name, everything else at the top steps back */
    document.body.classList.add("regionon"); clearTimeout(J._regT); J._regT = setTimeout(function () { document.body.classList.remove("regionon"); }, 4000);
    A.sfx("region");
  }

  /* ---------------- sparrows ---------------- */
  var FLOCKS = [[33, 13], [45, 28], [56, 22], [24, 36], [44, 45], [58, 12], [30, 50], [50, 33]];
  var birds = [];
  function makeBirds() {
    birds = [];
    var FL = FLOCKS.slice(); if (G.s && G.s.flags && G.s.flags.fedBirds) FL.push([44.5, 20.2]);
    FL.forEach(function (f, fi) {
      var n = 3 + (fi % 3);
      for (var i = 0; i < n; i++) birds.push({ fl: fi, hx: f[0] * T + (BS.hash(fi, i, 1) - 0.5) * 40, hy: f[1] * T + (BS.hash(i, fi, 2) - 0.5) * 30, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, state: "ground", t: BS.hash(fi, i, 3) * 3, face: 1, back: 0, peck: 0 });
    });
    birds.forEach(function (b) { b.x = b.hx; b.y = b.hy; });
  }
  makeBirds();
  function day() { var t = G.s.tod; return t !== "night" && t !== "dusk"; }
  /* stillness: stand quietly and the hill stops being afraid of you */
  function calm() { return G.mode === "walk" && !G.cut && G.p.still > 3.5; }
  function birdTick(dt) {
    if (G.mapId !== "hill") return;
    var p = G.p, fled = {}, still = calm();
    birds.forEach(function (b) {
      b.t += dt;
      if (b.state === "ground") {
        /* one by one, the nearest few hop over to see what you are */
        if (b.ox == null) { b.ox = b.hx; b.oy = b.hy; }
        var near = Math.hypot(b.ox - p.x, b.oy - p.y) < 170;
        if (still && near && !b.curious && Math.random() < dt * 0.35) { var ca = Math.random() * 6.283, cr = 20 + Math.random() * 16; b.curious = 1; b.hx = p.x + Math.cos(ca) * cr; b.hy = p.y + 4 + Math.sin(ca) * cr * 0.6; }
        if (!still && b.curious && !p.moving) { b.curious = 0; b.hx = b.ox; b.hy = b.oy; }
        if (!day()) { b.state = "away"; b.back = 1e9; return; }
        /* hop, peck, look about */
        b.peck = Math.max(0, b.peck - dt);
        if (Math.random() < dt * 0.9) { b.vx = (Math.random() - 0.5) * 30; b.vy = (Math.random() - 0.5) * 20; b.vz = 22; b.face = b.vx > 0 ? 1 : -1; }
        if (Math.random() < dt * 0.8) b.peck = 0.25;
        if (b.z > 0 || b.vz > 0) { b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz -= 120 * dt; if (b.z <= 0) { b.z = 0; b.vz = 0; } }
        b.x += (b.hx - b.x) * dt * (b.curious ? 0.55 : 0.2); b.y += (b.hy - b.y) * dt * (b.curious ? 0.55 : 0.2);
        if (Math.random() < dt * 0.08) A.sfx("chirp", b.x, b.y);
        var d = Math.hypot(b.x - p.x, b.y - p.y);
        if (d < (p.moving ? 42 : b.curious ? 10 : 26)) {
          if (b.curious) { b.curious = 0; b.hx = b.ox; b.hy = b.oy; }
          b.state = "fly"; var a = Math.atan2(b.y - p.y, b.x - p.x) + (Math.random() - 0.5) * 0.8;
          b.vx = Math.cos(a) * (70 + Math.random() * 40); b.vy = Math.sin(a) * 40 - 20; b.vz = 55 + Math.random() * 25; b.face = b.vx > 0 ? 1 : -1;
          fled[b.fl] = b;
        }
      } else if (b.state === "fly") {
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.vz += 6 * dt;
        if (b.z > 140) { b.state = "away"; b.back = 30 + Math.random() * 30; }
      } else if (b.state === "away") {
        b.back -= dt;
        if (b.back <= 0 && day() && Math.hypot(b.hx - p.x, b.hy - p.y) > 200) { b.state = "ground"; b.x = b.hx; b.y = b.hy; b.z = 0; }
      }
    });
    Object.keys(fled).forEach(function (k) { A.sfx("flutter", fled[k].x, fled[k].y); });
    birds = birds.filter(function (b) { return !(b.once && b.state === "away"); });
  }
  function drawBird(ctx, cam, b, t) {
    var sx = b.x - cam.x, sy = b.y - cam.y;
    var sh = Math.max(0.15, 0.35 - b.z / 300);
    G.shadowAt(b.x, b.y, 2.2, sh);
    ctx.save(); ctx.translate(sx, sy - 2 - b.z); ctx.scale(b.face * 1.3, 1.3);
    var flap = b.state === "fly" ? Math.sin(t * 40 + b.hx) : b.z > 0 ? 0.5 : 0;
    ctx.fillStyle = "#7a5a3a"; BS.ell(ctx, 0, 0, 2.2, 1.6); ctx.fill();
    ctx.fillStyle = "#e8d8b8"; BS.ell(ctx, 0.2, 0.7, 1.4, 0.8); ctx.fill();
    ctx.fillStyle = "#5a3e26"; BS.ell(ctx, -2.2, -0.2, 1.1, 0.5, null, 0.3); ctx.fill();
    var hy = b.peck > 0 ? 1 : -1.2;
    ctx.fillStyle = "#8a6440"; BS.ell(ctx, 1.8, hy, 1.1, 1); ctx.fill();
    ctx.fillStyle = "#1a1a1a"; BS.ell(ctx, 2.2, hy - 0.2, 0.25, 0.25); ctx.fill();
    ctx.fillStyle = "#d8a040"; ctx.beginPath(); ctx.moveTo(2.8, hy); ctx.lineTo(3.7, hy + 0.3); ctx.lineTo(2.8, hy + 0.5); ctx.fill();
    ctx.fillStyle = "#5a3e26"; ctx.beginPath(); ctx.moveTo(-0.6, -0.6); ctx.quadraticCurveTo(-1.2, -2.5 - flap * 2.6, 0.8, -1.2 - flap * 2.8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ---------------- frogs, the butterfly, fish ---------------- */
  function critterTick(dt) {
    var p = G.p;
    G.creatures.forEach(function (c) {
      if (c.map !== G.mapId) return;
      if (c.kind === "frog") {
        if (c.hidden) { c.back -= dt; if (c.back < 0 && Math.hypot(c.hx - p.x, c.hy - p.y) > 60) c.hidden = false; return; }
        if (Math.hypot(c.x - p.x, c.y - p.y) < 26) { c.hidden = true; c.back = 10 + Math.random() * 8; A.sfx("plop", c.x, c.y); ripple(c.x + 6, c.y + 4, 1.2); }
      }
      if (c.kind === "butterfly") {
        /* stand still long enough and it comes and rests on you */
        var wasLand = c.land;
        c.land = calm() && p.still > 6 && day() && Math.hypot(c.hx - p.x, c.hy - p.y) < 190;
        if (c.land && !wasLand) c.landT = 0;
        if (c.land) { c.landT = (c.landT || 0) + dt; if (c.landT > 2.2 && !c.chimed) { c.chimed = 1; A.sfx("twinkle"); if (G.count) G.count("butterfly"); G.burst(p.x + 2.5, p.y - 21, 7, "255,250,220", 8); } return; }
        if (wasLand) { c.chimed = 0; c.hx = p.x + (Math.random() - 0.5) * 30; c.hy = Math.max(3 * T, p.y - 30); }
        var d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < 30) { c.hx += (c.x - p.x) / d * 60 * dt; c.hy += (c.y - p.y) / d * 30 * dt - 10 * dt; }
        c.hx = Math.max(28 * T, Math.min(52 * T, c.hx)); c.hy = Math.max(3 * T, Math.min(22 * T, c.hy));
      }
    });
    /* something rises in the pond, now and then, at the end of the day */
    if (G.mapId === "hill" && G.inRect(p.x / T, p.y / T, h.pond, 6) && !reduced() && Math.random() < dt * (day() ? 0.25 : 0.5)) {
      var wx = (54 + Math.random() * 6) * T, wy = (60.5 + Math.random() * 5) * T;
      ripple(wx, wy, 0.8);
    }
  }

  /* ---------------- prints and rings ---------------- */
  var prints = [], rings = [], lastStep = 0, foot = 0;
  function printTick(dt) {
    var p = G.p;
    if (p.moving && G.mode === "walk" && Math.abs(p.walk - lastStep) > 8) {
      lastStep = p.walk; foot = 1 - foot;
      var t = G.map.get(Math.floor(p.x / T), Math.floor(p.y / T)), surf = BS.SURFACE(t);
      if (surf === "sand" || surf === "mud" || (surf === "gravel" && G.mapId === "hill")) {
        var side = foot ? 1.6 : -1.6, horiz = p.dir >= 2;
        prints.push({ x: p.x + (horiz ? 0 : side), y: p.y + (horiz ? side * 0.6 : 0), dir: p.dir, t: 0, life: surf === "gravel" ? 4 : 12, mud: surf === "mud" });
        if (prints.length > 80) prints.shift();
      }
      if (surf === "mud" && G.mapId === "hill") { var near = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(function (d) { var q = G.map.get(Math.floor(p.x / T) + d[0], Math.floor(p.y / T) + d[1]); return q === TL.WATER || q === TL.SPRING; }); if (near) ripple(p.x, p.y + 6, 0.7); }
      if (G.mapId === "cellar" && t === TL.POOL) ripple(p.x, p.y, 0.6);
      if (G.mapId === "hill" && (t === TL.LONG) && Math.random() < 0.4) A.sfx("rustle", p.x, p.y);
    }
    prints.forEach(function (f) { f.t += dt; }); prints = prints.filter(function (f) { return f.t < f.life; });
    rings.forEach(function (r) { r.t += dt; }); rings = rings.filter(function (r) { return r.t < r.life; });
  }
  function ripple(x, y, s) { if (reduced()) return; rings.push({ x: x, y: y, t: 0, life: 1.8, s: s || 1 }); rings.push({ x: x, y: y, t: -0.35, life: 1.8, s: (s || 1) * 0.7 }); }
  J.ripple = ripple;

  /* ---------------- sparkles and motes ---------------- */
  var parts = [], scr = [];
  /* gold bursting out of a point in the world */
  G.burst = function (x, y, n, col, up) {
    if (reduced()) n = Math.min(n || 18, 6);
    for (var i = 0; i < (n || 18); i++) {
      var a = Math.random() * 6.283, v = 20 + Math.random() * 50;
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - (up || 30), t: 0, life: 0.8 + Math.random() * 0.9, col: col || "255,214,110", r: 0.8 + Math.random() * 1.4, g: up ? -10 : 40 });
    }
  };
  /* a slow column of gold rising from a place, for as long as asked */
  var fountains = [];
  G.fountain = function (x, y, secs, col) { fountains.push({ x: x, y: y, t: 0, life: secs || 6, col: col || "255,214,110" }); };
  function partTick(dt) {
    fountains.forEach(function (f) {
      f.t += dt;
      if (!reduced() && Math.random() < dt * 22) parts.push({ x: f.x + (Math.random() - 0.5) * 70, y: f.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 6, vy: -10 - Math.random() * 16, t: 0, life: 2 + Math.random() * 2, col: f.col, r: 0.7 + Math.random() * 1.2, g: -4 });
    });
    fountains = fountains.filter(function (f) { return f.t < f.life; });
    parts.forEach(function (p) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 1 - dt * 1.2; });
    parts = parts.filter(function (p) { return p.t < p.life; });
    /* Mo: motes of gold drifting up the whole screen while it speaks */
    var view = G.view();
    if (G.moOn != null && !reduced() && Math.random() < dt * 7) scr.push({ x: view.w * (0.15 + Math.random() * 0.7), y: view.h * (0.55 + Math.random() * 0.45), vx: (Math.random() - 0.5) * 4, vy: -6 - Math.random() * 8, t: 0, life: 3 + Math.random() * 2.5, r: 0.25 + Math.random() * 0.45, ph: Math.random() * 6 });
    if (G.moOn == null) scr.forEach(function (s) { s.t += dt * 2; });
    scr.forEach(function (s) { s.t += dt; s.x += (s.vx + Math.sin(s.t * 1.3 + s.ph) * 4) * dt; s.y += s.vy * dt; });
    scr = scr.filter(function (s) { return s.t < s.life; });
  }

  /* ---------------- the ride: speed, and the charge ---------------- */
  var streaks = [];
  function rideTick(dt) {
    if (G.mode !== "ride" || !G.ride || reduced()) { streaks.length = 0; return; }
    var k = G.ride.v / 165, view = G.view();
    if (Math.random() < dt * 60 * k) streaks.push({ x: Math.random() * view.w, y: view.h * (0.3 + Math.random() * 0.8), len: 8 + k * 26, t: 0, life: 0.35 });
    streaks.forEach(function (s) { s.t += dt; s.y -= (90 + k * 260) * dt; });
    streaks = streaks.filter(function (s) { return s.t < s.life; });
  }
  J.charge = function (from, to) {
    var c = $("charge"); c.classList.remove("on"); void c.offsetWidth; c.classList.add("on");
    var f = $("cfill"), p = $("cpct"), t0 = performance.now(), dur = 1400;
    f.style.width = Math.max(2, from) + "%";
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e;
      f.style.width = Math.max(2, v) + "%"; p.textContent = Math.round(v) + "%";
      if (k < 1) requestAnimationFrame(step); else { A.sfx("charge"); setTimeout(function () { c.classList.remove("on"); }, 1600); }
    })(t0);
  };

  /* ---------------- the prompt, popping in ---------------- */
  var promptWas = false;
  function promptTick() {
    var on = $("prompt").classList.contains("on");
    if (on && !promptWas) { var pr = $("prompt"); pr.classList.remove("pop"); void pr.offsetWidth; pr.classList.add("pop"); A.sfx("twinkle"); }
    promptWas = on;
  }

  /* the feeder, filled: a flock moves in and stays */
  J.feederFlock = function () {
    for (var i = 0; i < 6; i++) { var b = { fl: 99, hx: 44.5 * T + (Math.random() - 0.5) * 40, hy: 20.2 * T + (Math.random() - 0.3) * 22, x: 0, y: 0, z: 60, vx: 0, vy: 0, vz: -20, state: "ground", t: Math.random() * 3, face: Math.random() < 0.5 ? 1 : -1, back: 0, peck: 0 }; b.x = b.hx + (Math.random() - 0.5) * 200; b.y = b.hy - 80; birds.push(b); }
    A.sfx("flutter", 44.5 * T, 20 * T);
  };
  /* a sparrow that was up in the tree, leaving */
  J.birdOut = function (x, y) {
    var a = -Math.PI / 2 + (Math.random() - 0.5) * 2, b = { fl: -1, hx: x, hy: y, x: x, y: y + 20, z: 20, vx: Math.cos(a) * 90, vy: -30, vz: 60, state: "fly", t: 0, face: Math.cos(a) > 0 ? 1 : -1, back: 0, peck: 0, once: true };
    birds.push(b); A.sfx("flutter", x, y); setTimeout(function () { A.sfx("chirp", x, y); }, 120);
  };

  /* ---------------- grasshoppers ---------------- */
  /* walk through the long grass and they go off ahead of you like popcorn */
  var hops = [];
  function hopTick(dt) {
    var p = G.p;
    if (G.mapId === "hill" && p.moving && day() && !reduced() && hops.length < 8 && Math.random() < dt * 1.6) {
      var mt = BS.matAt(G.map, p.x, p.y);
      if (mt === "dry" || mt === "long") {
        var a = Math.atan2(p.vy || 0, p.vx || 1) + (Math.random() - 0.5) * 1.6, sp = 40 + Math.random() * 30;
        hops.push({ x: p.x + Math.cos(a) * 13, y: p.y + Math.sin(a) * 8, z: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: 55 + Math.random() * 25, t: 0, face: Math.cos(a) > 0 ? 1 : -1 });
        A.sfx("hop", p.x, p.y); if (G.count) G.count("hops");
      }
    }
    hops.forEach(function (h) { h.t += dt; if (h.z > 0 || h.vz > 0) { h.x += h.vx * dt; h.y += h.vy * dt; h.z += h.vz * dt; h.vz -= 260 * dt; if (h.z <= 0) { h.z = 0; h.vz = 0; } } });
    hops = hops.filter(function (h) { return h.t < 1.6; });
  }
  function drawHop(ctx, cam, h) {
    var a = Math.min(1, (1.6 - h.t) * 3), sx = h.x - cam.x, sy = h.y - cam.y - h.z;
    ctx.globalAlpha = a * 0.3; ctx.fillStyle = "#1a1208"; BS.ell(ctx, h.x - cam.x, h.y - cam.y + 0.5, 2.4, 0.8); ctx.fill();
    ctx.globalAlpha = a; ctx.save(); ctx.translate(sx, sy); ctx.scale(h.face * 1.9, 1.9);
    ctx.fillStyle = "#7a8a32"; BS.ell(ctx, 0, 0, 1.6, 0.6); ctx.fill();
    ctx.fillStyle = "#5a6a22"; ctx.beginPath(); ctx.moveTo(-0.6, 0); ctx.lineTo(-1.6, -1.1 - (h.z > 0 ? 0.6 : 0)); ctx.lineTo(-0.2, 0.2); ctx.fill();
    if (h.z > 2) { ctx.fillStyle = "rgba(220,120,60,.8)"; BS.ell(ctx, -0.2, -0.5, 1.1, 0.5, null, -0.4); ctx.fill(); }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  /* ---------------- dragonflies over the pond ---------------- */
  /* they hang in the air, then are suddenly somewhere else: hover, dash,
     hover. Blue as the bit of sky the pond is holding. */
  var flies = [];
  function dfTick(dt) {
    if (G.mapId !== "hill" || !day()) { flies.length = 0; return; }
    var pd = h.pond, p = G.p;
    if (!flies.length) for (var i = 0; i < 3; i++) flies.push({ x: (pd.x + Math.random() * pd.w) * T, y: (pd.y + Math.random() * pd.h) * T, tx: 0, ty: 0, wait: Math.random() * 2, col: i === 2 ? "200,90,60" : "70,150,210", face: 0 });
    flies.forEach(function (f) {
      f.wait -= dt;
      var near = Math.hypot(f.x - p.x, f.y - p.y) < 28;
      if (f.wait <= 0 || near) {
        f.tx = (pd.x - 1 + Math.random() * (pd.w + 2)) * T; f.ty = (pd.y - 1 + Math.random() * (pd.h + 2)) * T;
        if (near) { f.tx += (f.x - p.x) * 2; f.ty += (f.y - p.y) * 2; }
        f.wait = 0.8 + Math.random() * 2.4; f.face = Math.atan2(f.ty - f.y, f.tx - f.x);
        if (Math.hypot(f.x - p.x, f.y - p.y) < 90) A.sfx("dfly", f.x, f.y);
      }
      var k = Math.min(1, dt * 7); f.x += (f.tx - f.x) * k; f.y += (f.ty - f.y) * k;
    });
  }
  function drawFly(ctx, cam, f, t) {
    var sx = f.x - cam.x + Math.sin(t * 9 + f.col.length) * 0.4, sy = f.y - cam.y - 12 + Math.sin(t * 7) * 0.5;
    G.shadowAt(f.x, f.y, 1.6, 0.12);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(f.face);
    var w = 0.55 + Math.abs(Math.sin(t * 60)) * 0.45;
    ctx.fillStyle = "rgba(235,245,255," + (0.35 * w) + ")";
    BS.ell(ctx, -0.3, -2.1, 0.7, 2.2, null, 0.25); ctx.fill(); BS.ell(ctx, -0.3, 2.1, 0.7, 2.2, null, -0.25); ctx.fill();
    BS.ell(ctx, 0.9, -1.9, 0.6, 1.9, null, -0.2); ctx.fill(); BS.ell(ctx, 0.9, 1.9, 0.6, 1.9, null, 0.2); ctx.fill();
    ctx.fillStyle = "rgb(" + f.col + ")"; ctx.fillRect(-4, -0.3, 4.6, 0.6);
    BS.ell(ctx, 1.2, 0, 1, 0.75); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.7)"; BS.ell(ctx, 1.5, -0.25, 0.3, 0.25); ctx.fill();
    ctx.restore();
  }

  /* ---------------- hooks from the engine ---------------- */
  J.update = function (dt, cam) {
    if (G.mode === "title") { birdTick(dt); return; }
    regionTick(); showPending();
    birdTick(dt); critterTick(dt); dfTick(dt); hopTick(dt); printTick(dt); partTick(dt); rideTick(dt); promptTick();
  };
  J.under = function (ctx, cam, t) {
    prints.forEach(function (f) {
      var a = (1 - f.t / f.life) * (f.mud ? 0.42 : 0.3), sx = f.x - cam.x, sy = f.y - cam.y, horiz = f.dir >= 2;
      ctx.fillStyle = f.mud ? "rgba(40,28,14," + a + ")" : "rgba(110,85,50," + a + ")";
      BS.ell(ctx, sx, sy, horiz ? 1.5 : 0.95, horiz ? 0.8 : 1.4); ctx.fill();
    });
    rings.forEach(function (r) {
      if (r.t < 0) return;
      var k = r.t / r.life, R2 = (2 + k * 12) * r.s;
      ctx.strokeStyle = "rgba(220,240,250," + (0.55 * (1 - k)) + ")"; ctx.lineWidth = 0.4;
      BS.ell(ctx, r.x - cam.x, r.y - cam.y, R2, R2 * 0.45); ctx.stroke();
    });
  };
  J.sorted = function (list, ctx, cam, t) {
    if (G.mapId !== "hill") return;
    birds.forEach(function (b) {
      if (b.state === "away") return;
      if (b.x < cam.x - 30 || b.x > cam.x + G.view().w + 30 || b.y < cam.y - 30 || b.y > cam.y + G.view().h + 60) return;
      list.push({ y: b.y, d: function () { drawBird(ctx, cam, b, t); } });
    });
    hops.forEach(function (h) { list.push({ y: h.y, d: function () { drawHop(ctx, cam, h); } }); });
    flies.forEach(function (f) { list.push({ y: f.y + 6, d: function () { drawFly(ctx, cam, f, t); } }); });
  };
  J.world = function (ctx, cam, t) {
    if (!parts.length) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    parts.forEach(function (p) {
      var k = p.t / p.life, a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      ctx.fillStyle = "rgba(" + p.col + "," + (a * 0.9) + ")";
      BS.ell(ctx, p.x - cam.x, p.y - cam.y, p.r, p.r); ctx.fill();
      ctx.fillStyle = "rgba(" + p.col + "," + (a * 0.18) + ")"; BS.ell(ctx, p.x - cam.x, p.y - cam.y, p.r * 3, p.r * 3); ctx.fill();
    });
    ctx.restore();
  };
  J.screen = function (ctx, VW, VH, t, cam) {
    if (G.holdUp && cam) {
      var k = Math.min(1, (t - G.holdUp.t0) / 0.45), sx = G.p.x - cam.x, sy = G.p.y - 22 - cam.y;
      var g = ctx.createRadialGradient(sx, sy, 10, sx, sy, Math.max(VW, VH) * 0.6);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.25, "rgba(8,6,2," + (0.35 * k) + ")"); g.addColorStop(1, "rgba(8,6,2," + (0.7 * k) + ")");
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.translate(sx, sy - 8);
      for (var r = 0; r < 12; r++) { ctx.rotate(Math.PI / 6 + t * 0.02); ctx.fillStyle = "rgba(255,220,140," + (0.06 * k) + ")"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4, -70); ctx.lineTo(4, -70); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    if (streaks.length) {
      ctx.save(); ctx.lineCap = "round";
      streaks.forEach(function (s) { var a = Math.sin(Math.PI * s.t / s.life) * 0.45; ctx.strokeStyle = "rgba(255,250,230," + a + ")"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y + s.len); ctx.stroke(); });
      ctx.restore();
    }
    if (scr.length) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      scr.forEach(function (s) {
        var k = Math.min(1, s.t / s.life), a = Math.sin(Math.PI * k) * 0.7;
        ctx.fillStyle = "rgba(255,210,110," + (a * 0.16) + ")"; BS.ell(ctx, s.x, s.y, s.r * 2.6, s.r * 2.6); ctx.fill();
        ctx.fillStyle = "rgba(255,236,170," + a + ")"; BS.ell(ctx, s.x, s.y, s.r * 0.7, s.r * 0.7); ctx.fill();
      });
      ctx.restore();
    }
  };
  J.reset = function () { prints = []; rings = []; parts = []; scr = []; regionNow = ""; makeBirds(); };
})();
