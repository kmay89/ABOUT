/* life.js — the small motions that make a person a person.

   Every character gets a face that does things and a body that moves like
   it has weight:

   · Eyes go where the attention goes: to whoever is talking, to the thing
     that just caught them, toward you when you come close.
   · Moods show on the face for a beat: pleased when something becomes yours,
     wide-eyed when Mo speaks, a worried brow when the reasonable voice starts
     up, a set jaw when it matters. A spoken line carries its own expression.
   · Mouths move while lines are being said, on the map and in the portrait.
   · Bodies squash a little on each footfall, stretch as they set off, lean
     into a run, settle when they stop, and turn with a small pop.
   · Left alone, people do what they would do. Wren looks around, glances at
     whatever's nearby, holds the phone up hunting for a bar, yawns. Beck
     can't keep still. Dad sighs and goes back to the boxes, and sleeps with
     the dish towel on his head.
   · Little bubbles say what a face can't: ! for a find, ? for a puzzle, a
     note when someone hums, z's when someone sleeps, no bars when there are
     no bars.

   Wren is never gendered here either: Wren is just "you", "Wren", "them". */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio, T = 16;
  var L = BS.life = {};
  var now = 0;

  /* ---------------- per-character state ---------------- */
  var ST = {};
  function st(id) {
    return ST[id] || (ST[id] = { ss: 0, sv: 0, lean: 0, lastF: 0, lastDir: 0, wasMoving: false, lx: 0, ly: 0, look: 0, mood: "", moodT: 0, idleT: 0, idle: "", idleEnd: 0, phoneDone: false, yawned: false, hop: 0, hv: 0, px: null, py: null, vx: 0, vy: 0 });
  }
  function kick(s, v) { s.sv += v; }                                 // a squash (−) or stretch (+) impulse
  L.mood = function (id, mood, dur) { var s = st(id); s.mood = mood; s.moodT = now + (dur || 1.5); };

  /* ---------------- emote bubbles ---------------- */
  var emotes = [];
  L.emote = function (id, kind, dur) {
    emotes = emotes.filter(function (e) { return e.id !== id; });
    emotes.push({ id: id, kind: kind, t0: now, dur: dur || 1.8 });
    if (kind === "!" && A) A.sfx("twinkle");
  };
  function posOf(id) {
    if (id === "p") return G.hidePlayer ? null : { x: G.p.x, y: G.p.y };
    var e = G.ent && G.ent(id); return e && e.map === G.mapId && !e.hidden ? { x: e.x, y: e.y } : null;
  }

  /* ---------------- what each face is doing this frame ---------------- */
  function speakerIs(id, e) {
    if (!G.talking || !G.portrait) return false;
    if (id === "p") return G.portrait === "wren";
    return e && e.who && e.who.indexOf(G.portrait) === 0;
  }
  L.face = function (id, e) {
    var s = st(id), f = {};
    if (s.mood && now < s.moodT) f.mood = s.mood;
    f.lx = Math.round(s.lx); f.ly = Math.round(s.ly);
    if (speakerIs(id, e)) { f.talk = Math.sin(now * 15) > 0; if (!f.mood && G.lineMood) f.mood = G.lineMood; }
    if (id === "p") {
      if (G.holdUp) f.mood = "happy";
      else if (G.moOn != null) f.mood = "wow";
      if (s.idle === "phone") f.phone = G.s.battery > 0 ? 1 : 2;
      if (s.idle === "yawn") f.mood = "yawn";
    }
    if (e && (e.who || "").indexOf("dad") === 0 && G.s.flags && G.s.flags.dadAsleep && !speakerIs(id, e)) f.mood = "sleep";
    return f;
  };
  /* the body's transform about the feet: squash/stretch, lean, hop */
  L.tf = function (id) {
    var s = st(id), k = s.ss;
    return { sx: 1 - k * 0.55, sy: 1 + k, skew: s.lean, dy: -s.hop, dx: s.shiver ? (Math.random() - 0.5) * 0.35 : 0 };
  };

  /* ---------------- the director ---------------- */
  var seenSpot = {};
  function nearSpot() {
    var p = G.p, best = null, bd = 70;
    (G.spots || []).forEach(function (sp) {
      if (sp.toy || sp.map !== G.mapId || (sp.when && !sp.when())) return;
      var d = Math.hypot(sp.x * T - p.x, sp.y * T - p.y); if (d < bd) { bd = d; best = sp; }
    });
    return best ? { sp: best, d: bd } : null;
  }
  function body(id, x, y, frame, dir, moving, dt) {
    var s = st(id);
    /* how it's moving */
    if (s.px != null) { s.vx += ((x - s.px) / Math.max(dt, 1e-3) - s.vx) * Math.min(1, dt * 10); s.vy += ((y - s.py) / Math.max(dt, 1e-3) - s.vy) * Math.min(1, dt * 10); }
    s.px = x; s.py = y;
    if (moving && frame !== s.lastF && (frame === 1 || frame === 3)) kick(s, -0.05);        // footfall
    if (moving && !s.wasMoving) kick(s, 0.06);                                              // setting off
    if (!moving && s.wasMoving) kick(s, -0.08);                                             // settling
    if (dir !== s.lastDir) kick(s, -0.04);                                                  // a turn
    s.lastF = frame; s.lastDir = dir; s.wasMoving = moving;
    /* a spring back to rest */
    s.sv += (-s.ss * 260 - s.sv * 18) * dt; s.ss += s.sv * dt; s.ss = Math.max(-0.18, Math.min(0.18, s.ss));
    var lean = moving ? Math.max(-0.12, Math.min(0.12, -s.vx / 92 * 0.09)) : 0;
    s.lean += (lean - s.lean) * Math.min(1, dt * 10);
    /* hops */
    if (s.hop > 0 || s.hv > 0) { s.hop += s.hv * dt; s.hv -= 180 * dt; if (s.hop <= 0) { s.hop = 0; s.hv = 0; kick(s, -0.09); } }
    if (G.prefs && G.prefs.reduced) { s.ss = 0; s.sv = 0; s.lean = 0; }
    return s;
  }
  function lookToward(s, dx, dy, k) {
    var tx = Math.abs(dx) > 6 ? (dx > 0 ? 1 : -1) : 0, ty = Math.abs(dy) > 10 ? (dy > 0 ? 1 : -1) : 0;
    s.lx += (tx - s.lx) * Math.min(1, k); s.ly += (ty - s.ly) * Math.min(1, k);
  }

  L.update = function (dt) {
    now += dt;
    if (!G.p || !G.map) return;
    var p = G.p, ps = body("p", p.x, p.y, p.frame, p.dir, p.moving, dt);
    var free = G.mode === "walk" && !G.cut && !G.talking;

    /* — Wren — */
    if (p.moving || !free) {
      if (ps.idle === "phone" && p.moving) ps.phoneDone = false;
      ps.idle = ""; ps.idleT = 0; if (p.moving) { ps.yawned = false; }
      if (p.moving) { ps.lx += (0 - ps.lx) * Math.min(1, dt * 8); ps.ly += (0 - ps.ly) * Math.min(1, dt * 8); }
    } else {
      ps.idleT += dt;
      var ns = nearSpot();
      /* something new comes into reach: notice it */
      if (ns && ns.d < 34 && !seenSpot[G.mapId + ns.sp.id + ns.sp.x]) { seenSpot[G.mapId + ns.sp.id + ns.sp.x] = 1; L.emote("p", "!", 1.2); L.mood("p", "wow", 0.7); }
      if (ps.idle) { if (now > ps.idleEnd) ps.idle = ""; }
      else if (ps.idleT > 8 && !ps.phoneDone && !G.sitting) {
        /* habit: the phone comes up, hunting for a bar */
        ps.idle = "phone"; ps.idleEnd = now + 3.2; ps.phoneDone = true; p.dir = 0; if (G.count) G.count("phonecheck");
        setTimeout(function () { if (ps.idle === "phone") L.emote("p", G.s.battery > 0 ? "nosig" : "dead", 1.6); }, 900);
      } else if (ps.idleT > 17 && !ps.yawned) { ps.idle = "yawn"; ps.idleEnd = now + 1.4; ps.yawned = true; L.emote("p", "…", 1.6); }
      /* eyes: wander, and drift toward whatever's interesting */
      if (now > ps.look) {
        ps.look = now + 1.1 + Math.random() * 1.6;
        if (ns && Math.random() < 0.6) { ps.tlx = ns.sp.x * T - p.x; ps.tly = ns.sp.y * T - p.y; }
        else { ps.tlx = (Math.random() - 0.5) * 40; ps.tly = (Math.random() - 0.6) * 30; }
      }
      if (ps.idleT > 2.2 && ps.tlx != null) lookToward(ps, ps.tlx, ps.tly, dt * 6);
      /* a shiver in the cold dark */
      ps.shiver = G.mapId === "cellar" && G.eyes && G.eyes.adapt < 0.5 && !G.lamp.level ? 1 : 0;
      /* humming on the swing, in the quiet */
      if (G.sitting && Math.random() < dt * 0.12) L.emote("p", "note", 1.6);
    }
    /* while someone talks to you, you look at them */
    if (G.talking && G.portrait && G.portrait !== "wren" && G.ents) {
      var spk = G.ents.filter(function (e) { return e.map === G.mapId && e.who && e.who.indexOf(G.portrait) === 0; })[0];
      if (spk) lookToward(ps, spk.x - p.x, spk.y - p.y, dt * 8);
    }

    /* — everyone else — */
    (G.ents || []).forEach(function (e) {
      if (e.map !== G.mapId || e.hidden) return;
      var es = body(e.id, e.x, e.y, e.frame || 0, e.dir || 0, (e.frame || 0) > 0, dt), d = Math.hypot(p.x - e.x, p.y - e.y);
      /* eyes follow you when you're close */
      if (d < 90) lookToward(es, p.x - e.x, p.y - e.y, dt * 5); else { es.lx *= 1 - Math.min(1, dt * 3); es.ly *= 1 - Math.min(1, dt * 3); }
      if (G.prefs && G.prefs.reduced) return;
      var who = e.who || "";
      if (who.indexOf("beck") === 0 && !(e.frame > 0)) {
        /* Beck can't stand still: weight from foot to foot, and the odd hop */
        es.ss += Math.sin(now * 5.2 + e.x) * 0.0016;
        if (Math.random() < dt * 0.14 && !es.hop) { es.hv = 46; es.hop = 0.01; kick(es, 0.08); }
        if (d < 40 && Math.random() < dt * 0.05) L.mood(e.id, "happy", 1.4);
      }
      if (who.indexOf("dad") === 0) {
        if (G.s.flags && G.s.flags.dadAsleep) { if (!emotes.some(function (m) { return m.id === e.id; })) L.emote(e.id, "z", 3.2); }
        else if (Math.random() < dt * 0.08) { kick(es, -0.07); L.mood(e.id, Math.random() < 0.5 ? "firm" : "worry", 1.6); }
      }
    });
    emotes = emotes.filter(function (m) { return now - m.t0 < m.dur; });
  };

  /* reactions to the story's own moments */
  L.hook = function () {
    var cyn = G.cynic;
    if (cyn && !cyn._life) { G.cynic = function () { L.mood("p", "worry", 4.5); return cyn.apply(this, arguments); }; G.cynic._life = 1; }
  };

  /* ---------------- drawing the bubbles ---------------- */
  L.over = function (ctx, cam) {
    emotes.forEach(function (m) {
      var p = posOf(m.id); if (!p) return;
      var age = now - m.t0, k = Math.min(1, age / 0.18), out = Math.max(0, (age - (m.dur - 0.3)) / 0.3);
      var s = k < 1 ? k * 1.18 : 1 + Math.max(0, 0.18 - (age - 0.18) * 1.2) * Math.sin(age * 30) * 0.4;
      var hop = st(m.id).hop || 0, bx = p.x - cam.x + 6, by = p.y - cam.y - 31 - hop - Math.sin(age * 3) * 0.6;
      ctx.save(); ctx.globalAlpha = 1 - out; ctx.translate(bx, by); ctx.scale(s, s);
      if (m.kind === "z") {
        ctx.font = "italic 5.5px 'Sunlight Book', Georgia, serif"; ctx.fillStyle = "rgba(240,240,255,.9)";
        for (var i = 0; i < 3; i++) { var a = (age * 0.6 + i / 3) % 1; ctx.globalAlpha = (1 - out) * Math.sin(a * Math.PI); ctx.fillText("z", a * 6, -a * 9); }
        ctx.restore(); return;
      }
      /* the bubble */
      ctx.fillStyle = "rgba(0,0,0,.25)"; BS.rr(ctx, -4.6, -4.4, 9.6, 8.6, 3); ctx.fill();
      ctx.fillStyle = "#fbf7ee"; BS.rr(ctx, -5, -5, 10, 8.6, 3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-2.2, 3.4); ctx.lineTo(-3.6, 6); ctx.lineTo(0.2, 3.4); ctx.fill();
      ctx.strokeStyle = "rgba(60,40,20,.35)"; ctx.lineWidth = 0.3; BS.rr(ctx, -5, -5, 10, 8.6, 3); ctx.stroke();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (m.kind === "!") { ctx.fillStyle = "#e0702a"; ctx.font = "6.6px 'Sunlight Marker', system-ui, sans-serif"; ctx.fillText("!", 0.2, -0.3); }
      else if (m.kind === "?") { ctx.fillStyle = "#3a7ab8"; ctx.font = "6.2px 'Sunlight Marker', system-ui, sans-serif"; ctx.fillText("?", 0.2, -0.3); }
      else if (m.kind === "note") {      /* a quaver, drawn: a head, a stem, a flag (a typed one is whatever font the device has) */
        var nx = Math.sin(age * 6) * 0.6;
        ctx.fillStyle = ctx.strokeStyle = "#8a5ac8"; ctx.lineWidth = 0.55; ctx.lineCap = "round";
        ctx.save(); ctx.translate(nx - 0.9, 1.3); ctx.rotate(-0.4); BS.ell(ctx, 0, 0, 1.25, 0.95); ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.moveTo(nx + 0.15, 1.1); ctx.lineTo(nx + 0.15, -3.1); ctx.quadraticCurveTo(nx + 1.5, -2.6, nx + 1.9, -1.2); ctx.stroke();
      }
      else if (m.kind === "…") { ctx.fillStyle = "#6a5a4a"; for (var d = 0; d < 3; d++) { ctx.globalAlpha = (1 - out) * (0.35 + 0.65 * ((Math.floor(age * 4) % 3) >= d ? 1 : 0)); BS.ell(ctx, -2.4 + d * 2.4, -0.6, 0.7, 0.7); ctx.fill(); } }
      else if (m.kind === "nosig" || m.kind === "dead") {
        for (var b = 0; b < 4; b++) { ctx.fillStyle = "rgba(90,80,70,.35)"; ctx.fillRect(-3.6 + b * 1.7, 1.4 - (b + 1) * 1.1, 1.1, (b + 1) * 1.1); }
        ctx.strokeStyle = "#c8403a"; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(1.2, -3); ctx.lineTo(4, -0.2); ctx.moveTo(4, -3); ctx.lineTo(1.2, -0.2); ctx.stroke();
      }
      ctx.restore();
    });
  };

  /* a spoken line wears its own expression */
  L.moodOf = function (text, who) {
    var t = (text || "").replace(/\*/g, "");
    if (/sorry|scared|worse|afraid|can't|won't|no\b|dead|gone/i.test(t) && !/!/.test(t)) return "worry";
    if (/!/.test(t)) return who === "dad" ? "firm" : /beautiful|best|alive|wow|oh my/i.test(t) ? "happy" : "wow";
    if (/\?\s*$/.test(t)) return "ask";
    if (/ha\b|haha|funny|laugh|love|great|perfect/i.test(t)) return "happy";
    return "";
  };
})();
