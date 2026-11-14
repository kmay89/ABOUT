/* feel.js — one way of answering.

   Everything you do on the hill gets an answer, and the answers are kin.
   This is where that is kept, so a lid, a door, a goal ticked and a jar
   filling all speak the same small language:

   · In key. The music is D major pentatonic (audio.js), so every sound
     that answers a press is a note of that scale. Nothing you do can play
     a wrong note against what the piano in the other room is playing.
   · Up is on, forward, more; down is back, off, less. Opening rises and
     closing falls. Walking down a list steps down the scale.
   · Things that repeat climb. The second goal of a chapter is a note
     above the first, and a jar fills up the scale.
   · A press has two halves: it goes down (dull, low) and it comes back
     (bright, a fifth up). The lid sinks, springs, and rings.
   · The same answer reaches the hand: a tick under a thumb, a short
     rumble in a pad.
   · What asks to be pressed keeps one time. The key on a prompt, the bead
     under your thumb and the ring round the thing itself all swell on the
     same slow beat.
   · A threshold is a small ceremony: through a door the picture closes
     to a circle on you, holds, and opens in the next room. (Only a door.
     When the story moves you, or a night goes by, it is a plain fade.)
   · A button is worth pressing in an empty room. With nothing in reach,
     Wren hops (engine.js), and lands with the sound of the ground.

   Nothing here carries meaning by itself, and reduced motion leaves the
   motion out and keeps the notes. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio, $ = function (id) { return document.getElementById(id); };
  var F = BS.feel = {};
  function reduced() { return !!(G.prefs && G.prefs.reduced) || !!G.skipWaits; }
  function kind() { return BS.hands && BS.hands.kind ? BS.hands.kind() : "keys"; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------------- the scale ----------------
     The one the music is in, kept where the music is (audio.js A.hz).
     Degree 0 is the D above middle C; 5 is the D above that. */
  F.hz = A.hz;

  /* three instruments, all small: a bell for things that land, a tick for
     things that step, a harp for the two or three times it is an occasion */
  function bell(n, o) {
    o = o || {};
    var f = F.hz(n), g = o.g || 0.02, at = o.at || 0, d = o.dur || 0.5;
    A.tone(f, { g: g, dur: d, a: 0.004, at: at, verb: 1 });
    A.tone(f * 2, { g: g * 0.3, dur: d * 0.6, a: 0.003, at: at, verb: 1 });
    A.tone(f * 3.01, { g: g * 0.1, dur: 0.1, a: 0.002, at: at });
  }
  function tick(n, o) { o = o || {}; A.tone(F.hz(n), { type: o.type || "triangle", g: o.g || 0.014, dur: o.dur || 0.045, at: o.at || 0 }); }
  function harp(n, o) { o = o || {}; A.pluck(F.hz(n), { at: o.at || 0, g: o.g || 0.1, dur: o.dur || 1.6, bright: o.bright == null ? 0.55 : o.bright, bus: "sfx" }); }

  /* ---------------- the cues ----------------
     name: [sound, a tick under a thumb (ms or a pattern), a rumble in a pad (ms, weak, strong)] */
  var walk = 2;
  var CUES = {
    /* a lid: down, then back with a ring to it */
    lidDown: [function () { A.sfx("lid"); }, 8, [35, 0.2, 0]],
    go: [function () { bell(5, { g: 0.019, dur: 0.42 }); bell(8, { g: 0.015, dur: 0.6, at: 0.055 }); }, [5, 30, 12], [90, 0.2, 0.45]],
    /* glass answers once, on the way down */
    glassDown: [function () { A.sfx("glass"); }, 5, [25, 0.15, 0]],
    quiet: [function () { A.burst({ type: "highpass", f: 4200, g: 0.012, dur: 0.03 }); tick(0, { g: 0.006, dur: 0.03 }); }, 4],
    /* a switch: up a third is on, down a third is off */
    on: [function () { A.sfx("click"); tick(2, { g: 0.018, dur: 0.06 }); tick(3, { g: 0.02, at: 0.07, dur: 0.09 }); }, 6, [30, 0.2, 0]],
    off: [function () { A.sfx("click"); tick(3, { g: 0.018, dur: 0.06 }); tick(2, { g: 0.018, at: 0.07, dur: 0.09 }); }, 6, [30, 0.2, 0]],
    /* a knob on its groove: the further along, the higher */
    notch: [function (o) { tick(Math.round(clamp(o.v, 0, 1) * 10) - 3, { g: 0.018, dur: 0.04 }); }],
    /* walking a list: down steps down, up steps up */
    move: [function (o) { walk = clamp(walk + (o.up ? 1 : -1), -3, 7); tick(walk, { type: "sine", g: 0.022, dur: 0.06 }); }, 0, [18, 0.12, 0]],
    /* a card: opening rises, closing falls */
    open: [function () { walk = 2; bell(0, { g: 0.012, dur: 0.3 }); bell(3, { g: 0.012, dur: 0.42, at: 0.07 }); }, 0, [40, 0.15, 0.1]],
    close: [function () { bell(3, { g: 0.01, dur: 0.24 }); bell(0, { g: 0.01, dur: 0.32, at: 0.06 }); }, 0, [30, 0.1, 0]],
    /* the world has noticed you: something is in reach */
    notice: [function () { A.sfx("twinkle"); }, 0, [22, 0.18, 0]],
    /* a press with nothing in reach: Wren hops. A small "hup" going up (a
       fourth, A to D), and the ground says the rest coming down. */
    hup: [function () { A.tone(F.hz(-2), { slide: F.hz(0), type: "sine", g: 0.016, dur: 0.1, a: 0.008 }); }, 4],
    landed: [function () { A.tone(F.hz(-10), { slide: F.hz(-10) * 0.7, g: 0.03, dur: 0.07 }); }, 7, [40, 0.1, 0.3]],
    empty: [function () { tick(-5, { g: 0.011, dur: 0.03 }); A.burst({ type: "lowpass", f: 500, g: 0.012, dur: 0.035 }); }, 3],     /* (with motion reduced: answered, just) */
    /* a door that won't: knuckles on wood, twice */
    deny: [function () { [0, 0.13].forEach(function (at) { A.tone(F.hz(-10), { type: "triangle", g: 0.032, dur: 0.07, at: at }); A.burst({ type: "lowpass", f: 420, g: 0.03, dur: 0.05, at: at }); }); }, [10, 50, 10], [70, 0, 0.4]],
    /* through a door */
    irisShut: [function () { A.burst({ f: 2200, sweep: 320, q: 0.8, g: 0.05, dur: 0.4, a: 0.02 }); A.tone(F.hz(3), { slide: F.hz(-5), type: "triangle", g: 0.014, dur: 0.38, a: 0.02 }); }, 0, [60, 0.1, 0.2]],
    irisOpen: [function () { A.burst({ f: 380, sweep: 2400, q: 0.8, g: 0.04, dur: 0.42, a: 0.06 }); A.tone(F.hz(-5), { slide: F.hz(3), type: "triangle", g: 0.012, dur: 0.4, a: 0.05 }); bell(5, { g: 0.008, dur: 0.5, at: 0.34 }); }],
    /* the two ways in from the title */
    start: [function () {
      for (var i = 0; i < 11; i++) harp(-5 + i, { at: i * 0.052, g: 0.024 + i * 0.003, dur: 1.5 });
      [5, 7, 8, 10].forEach(function (n, k) { bell(n, { g: 0.014 - k * 0.0015, dur: 1.5, at: 0.6 + k * 0.012 }); });
      A.tone(F.hz(-10), { g: 0.035, dur: 1.4, a: 0.02, at: 0.6, verb: 1 });
      A.burst({ type: "highpass", f: 5200, g: 0.02, dur: 0.7, a: 0.25, at: 0.25, verb: 1 });
    }, [10, 40, 20, 60, 40], [420, 0.3, 0.7]],
    welcome: [function () { harp(0, { g: 0.05 }); harp(3, { at: 0.13, g: 0.05 }); harp(5, { at: 0.26, g: 0.055, dur: 2 }); bell(7, { g: 0.011, dur: 1.1, at: 0.4 }); }, [8, 40, 16], [180, 0.2, 0.4]]
  };

  /* the same answer, in the hand */
  function buzz(pat, rum) {
    if (!G.prefs || !G.prefs.haptics) return;
    var k = kind();
    if (k === "touch" && pat && navigator.vibrate) { try { navigator.vibrate(pat); } catch (e) { } }
    if (k === "pad" && rum && navigator.getGamepads) {
      try {
        var pads = navigator.getGamepads();
        for (var i = 0; i < pads.length; i++) {
          var v = pads[i] && pads[i].vibrationActuator;
          if (v && v.playEffect) { var p = v.playEffect("dual-rumble", { startDelay: 0, duration: rum[0], weakMagnitude: rum[1], strongMagnitude: rum[2] }); if (p && p.catch) p.catch(function () { }); }
          else { var h = pads[i] && pads[i].hapticActuators && pads[i].hapticActuators[0]; if (h && h.pulse) { var q = h.pulse(Math.max(rum[1], rum[2]), rum[0]); if (q && q.catch) q.catch(function () { }); } }
        }
      } catch (e) { }
    }
  }
  F.buzz = buzz;
  F.log = null;                     /* a test may listen in: function (name, o) */
  F.cue = function (name, o) {
    var c = CUES[name]; if (!c) return;
    if (F.log) F.log(name, o);
    if (A.ready && A.ready()) c[0](o || {});
    buzz(c[1], c[2]);
  };

  /* ---------------- things that repeat, climb ----------------
     F.rung(n) is the nth step of something (the nth thing seen, a jar a
     tenth fuller). F.ladder(key) counts for you: each call within `gap`
     seconds of the last is a step higher; a pause starts it again. (What
     a climb arrives at is the moment's own fanfare, which was already there.)
     A rung keeps the voice the moment already had, and only its pitch is
     new: `voice` is "bell" (the default), "tick" (a jar filling), "pen" (a
     goal ticked off: the tick, and a fifth ringing over it) or "harp" (a
     thing seen for the first time: the note, and a third plucked over it). */
  var ladders = {};
  F.rung = function (n, o) {
    o = o || {};
    n = clamp(Math.round(n) + (o.base || 0), -5, 12);
    if (F.log) F.log("rung", { n: n });
    if (A.ready && A.ready()) {
      var v = o.voice || "bell";
      if (v === "tick") tick(n, { g: o.g || 0.016, dur: 0.07 });
      else if (v === "pen") { tick(n, { g: 0.03, dur: 0.08 }); A.tone(F.hz(n + 3), { type: "triangle", g: 0.024, dur: 0.2, at: 0.07, verb: 1 }); }
      else if (v === "harp") { harp(n, { g: 0.08, dur: 1.2, bright: 0.5 }); harp(n + 2, { at: 0.1, g: 0.07, dur: 1.2, bright: 0.5 }); }
      else bell(n, { g: o.g || 0.02, dur: o.dur || 0.5 });
    }
    if (!o.quiet) buzz(5, [22, 0.15, 0]);
    return n;
  };
  F.ladder = function (key, o) {
    o = o || {};
    var now = performance.now(), L = ladders[key] || (ladders[key] = { n: -1, t: 0 });
    if (now - L.t > (o.gap || 4) * 1000) L.n = -1;
    L.t = now; L.n = Math.min(L.n + 1, o.cap == null ? 10 : o.cap);
    F.rung(L.n, o);
    return L.n;
  };

  /* ---------------- light off the thing you pressed ----------------
     One canvas over everything, drawn only while something is on it. */
  var cv = null, cx = null, parts = [], rings = [], raf = 0, last = 0, dpr = 1;
  function size() { dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); }
  function canvas() {
    if (cv) return;
    cv = document.createElement("canvas"); cv.id = "feelcv"; cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv); cx = cv.getContext("2d"); size();
    window.addEventListener("resize", size);
  }
  function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, innerWidth, innerHeight);
    cx.globalCompositeOperation = "lighter";
    for (var i = rings.length - 1; i >= 0; i--) {
      var R = rings[i]; R.t += dt; var u = R.t / R.life; if (u >= 1) { rings.splice(i, 1); continue; }
      var e = 1 - Math.pow(1 - u, 3), d = R.grow * e, a = (1 - u) * (1 - u) * R.a;
      cx.strokeStyle = "rgba(" + R.col + "," + a + ")"; cx.lineWidth = 2.2 * (1 - u) + 0.5;
      rr(R.x - R.w / 2 - d, R.y - R.h / 2 - d, R.w + d * 2, R.h + d * 2, R.h / 2 + d); cx.stroke();
    }
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.t += dt; if (p.t >= p.life) { parts.splice(i, 1); continue; }
      p.vy += 300 * dt; p.vx *= 1 - 1.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      var k = 1 - p.t / p.life, al = Math.min(1, k * 1.6);
      cx.fillStyle = "rgba(" + p.col + "," + (al * 0.9) + ")"; cx.beginPath(); cx.arc(p.x, p.y, p.r * (0.5 + k * 0.5), 0, 6.2832); cx.fill();
      cx.fillStyle = "rgba(" + p.col + "," + (al * 0.16) + ")"; cx.beginPath(); cx.arc(p.x, p.y, p.r * 3.2, 0, 6.2832); cx.fill();
    }
    cx.globalCompositeOperation = "source-over";
    if (parts.length || rings.length) raf = requestAnimationFrame(frame); else raf = 0;
  }
  function run() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  F.busy = function () { return !!raf; };
  /* a ring of light that leaves the shape it started as (a lid, a bead) */
  F.ring = function (x, y, o) {
    if (reduced()) return;
    o = o || {}; canvas();
    rings.push({ x: x, y: y, w: o.w || 40, h: o.h || 40, grow: o.grow || 22, life: o.life || 0.5, a: o.a || 0.6, col: o.col || "255,226,150", t: 0 });
    run();
  };
  /* filings off a lid: up, out, and down again */
  F.sparks = function (x, y, o) {
    if (reduced()) return;
    o = o || {}; canvas();
    var n = o.n || 10, sp = o.spread || 30;
    for (var i = 0; i < n; i++) {
      var u = (i + Math.random()) / n * 2 - 1, v = 70 + Math.random() * 130;
      parts.push({ x: x + u * sp, y: y + (Math.random() - 0.5) * 4, vx: u * (60 + Math.random() * 80), vy: -v, r: 0.9 + Math.random() * 1.5, life: 0.45 + Math.random() * 0.45, t: 0, col: Math.random() < 0.25 ? "255,250,225" : (o.col || "255,214,120") });
    }
    run();
  };

  /* a card's contents arrive in order, once, as it opens (look.css .arriving) */
  F.arrive = function (el) { if (!el || reduced()) return; el.classList.add("arriving"); clearTimeout(el._arr); el._arr = setTimeout(function () { el.classList.remove("arriving"); }, 900); };
  /* a number that counts up to where it is, the way the ring beside it fills */
  F.count = function (el, ms, delay) {
    if (!el || reduced()) return;
    var m = /^(\d+)(.*)$/.exec(el.textContent || ""); if (!m || +m[1] < 2) return;
    var to = +m[1], tail = m[2], t0 = performance.now() + (delay || 0), mine = (el._count = (el._count || 0) + 1);
    ms = ms || 800; el.textContent = "0" + tail;
    (function step(now) {
      if (el._count !== mine) return;
      var u = clamp((now - t0) / ms, 0, 1);
      el.textContent = Math.round(to * (1 - Math.pow(1 - u, 3))) + tail;
      if (u < 1) requestAnimationFrame(step);
    })(performance.now());
  };
  /* a class that plays once and takes itself off again */
  function pop(el, cls) {
    if (!el) return;
    var key = "_pop_" + cls, mine = (el[key] = (el[key] || 0) + 1);       /* pressed again before it finished: the newer press owns it */
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    var done = function (e) {
      if (e && e.target !== el) return;
      el.removeEventListener("animationend", done);
      if (el[key] === mine) el.classList.remove(cls);
    };
    el.addEventListener("animationend", done);
    setTimeout(done, 900);
  }
  F.pop = pop;

  /* ---------------- a control, pressed and let go ----------------
     hands.js says which; this is what it is like. */
  F.down = function (el, lid) { F.cue(lid ? "lidDown" : el && el.matches && el.matches(".quiet,a.quiet") ? "quiet" : "glassDown"); };
  F.went = function (el, lid) {
    if (!el || !el.getBoundingClientRect) return;
    var r = el.getBoundingClientRect();
    if (lid) {
      F.cue("go");
      if (r.width) { F.ring(r.left + r.width / 2, r.top + r.height / 2, { w: r.width, h: r.height, grow: 20 }); F.sparks(r.left + r.width / 2, r.top + 3, { n: Math.round(clamp(r.width / 18, 8, 16)), spread: r.width * 0.42 }); }
    }
    if (!reduced()) pop(el, "went");
  };
  /* a bead under a thumb: a ripple off it going down, and it springs back
     past its size coming up, so even the quickest tap is seen to land */
  function bead(e) { return e.target && e.target.closest && e.target.closest("#touch [data-btn]"); }
  document.addEventListener("pointerdown", function (e) {
    var b = bead(e); if (!b) return;
    var r = b.getBoundingClientRect();
    F.ring(r.left + r.width / 2, r.top + r.height / 2, { w: r.width, h: r.height, grow: 16, life: 0.42, a: 0.45 });
  }, true);
  ["pointerup", "pointercancel"].forEach(function (ev) { document.addEventListener(ev, function (e) { var b = bead(e); if (b && !reduced()) pop(b, "let"); }, true); });
  /* a press with nothing in reach, where Wren can't hop (motion reduced): a small sound, and that is all */
  var emptyAt = 0;
  F.empty = function () { var now = performance.now(); if (now - emptyAt < 260) return; emptyAt = now; F.cue("empty"); };

  /* ---------------- one time for everything that asks ----------------
     Animations with these names all run at --beat (look.css); starting them
     from the same instant keeps them in step however late each one began.
     F.phase() is the same clock for anything drawn by hand (the wisps). */
  var BEAT = 1600, KEEP = { beatkey: 1, beatspark: 1, wisp: 1, cuebreathe: 1, cuekey: 1, cuering: 1, focusbreath: 1, bob: 1 };
  F.phase = function (div) { var b = BEAT / (div || 1); return (performance.now() % b) / b; };
  document.addEventListener("animationstart", function (e) {
    if (!KEEP[e.animationName] || !document.getAnimations) return;
    try { document.getAnimations().forEach(function (a) { if (KEEP[a.animationName] && a.startTime !== 0) a.startTime = 0; }); } catch (err) { }
  }, true);

  /* ---------------- through a door ----------------
     The picture closes to a circle on Wren, stops for a breath with only
     Wren in it, shuts; and opens again on Wren in the next room. */
  var iris = null, irisRaf = 0;
  F.hero = function () {
    try { var v = G.view(), c = G.cam; return [(G.p.x - c.x) / v.w * innerWidth, (G.p.y - 13 - c.y) / v.h * innerHeight]; } catch (e) { return [innerWidth / 2, innerHeight / 2]; }
  };
  function irisAt(x, y, r) {
    iris.style.background = r <= 0.5 ? "#000" : "radial-gradient(circle at " + x.toFixed(1) + "px " + y.toFixed(1) + "px,rgba(0,0,0,0) " + Math.max(0, r - 1).toFixed(1) + "px,rgba(255,214,130,.3) " + r.toFixed(1) + "px,rgba(8,6,3,.96) " + (r + 2.5).toFixed(1) + "px,#000 " + (r + 9).toFixed(1) + "px)";
  }
  function far(x, y) { return Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 12; }
  F.iris = function (shut, ms) {
    return new Promise(function (res) {
      if (reduced()) { res(); return; }
      if (!iris) { iris = document.createElement("div"); iris.id = "iris"; iris.setAttribute("aria-hidden", "true"); document.body.appendChild(iris); }
      cancelAnimationFrame(irisRaf);
      var t0 = performance.now(), at = F.hero(), R = far(at[0], at[1]), hold = Math.min(R * 0.5, 30 + Math.min(innerWidth, innerHeight) * 0.07);
      ms = ms || (shut ? 430 : 400);                 /* with the breath between, about what the old fade took */
      iris.style.display = "block";
      F.cue(shut ? "irisShut" : "irisOpen");
      (function step(now) {
        var u = Math.min(1, (now - t0) / ms), r;
        if (shut) {
          /* in to a small circle, a breath there, then shut */
          if (u < 0.48) { var a = u / 0.48; r = R + (hold - R) * (1 - Math.pow(1 - a, 3)); }
          else if (u < 0.7) r = hold;
          else { var b = (u - 0.7) / 0.3; r = hold * (1 - b * b); }
        } else {
          at = F.hero();                       /* the camera may still be settling: stay on Wren */
          r = far(at[0], at[1]) * (1 - Math.pow(1 - u, 2.4));
        }
        irisAt(at[0], at[1], r);
        if (u < 1) { irisRaf = requestAnimationFrame(step); return; }
        if (!shut) { iris.style.display = "none"; iris.style.background = ""; } else iris.style.background = "#000";
        res();
      })(t0);
    });
  };
  /* whatever happens, the picture is never left shut */
  F.irisClear = function () { cancelAnimationFrame(irisRaf); if (iris) { iris.style.display = "none"; iris.style.background = ""; } };

  /* ---------------- the way in ----------------
     Begin is the most important press in the game, so it gets the most. */
  F.begin = function (again) {
    F.cue(again ? "welcome" : "start");
    var t = $("title"); if (!t || reduced()) return;
    t.classList.add("go"); if (!again) t.classList.add("new");
    var b = again ? $("t-continue") : $("t-new"), r = b && b.getBoundingClientRect();
    if (r && r.width) { F.ring(r.left + r.width / 2, r.top + r.height / 2, { w: r.width, h: r.height, grow: 60, life: 0.8, a: 0.7 }); F.sparks(r.left + r.width / 2, r.top + r.height / 2, { n: again ? 14 : 26, spread: r.width * 0.5 }); }
  };

  /* the first touch of anything wakes the sound, at the volume you left it */
  var woke = false;
  function wake() {
    if (!A || !A.init) return;
    A.init();
    if (woke || !A.ready()) return; woke = true;
    if (G.prefs) { A.setVolume("master", G.prefs.master); A.setVolume("mus", G.prefs.music); A.setVolume("amb", G.prefs.amb); }
  }
  ["pointerdown", "pointerup", "keydown", "touchend"].forEach(function (ev) { window.addEventListener(ev, wake, { capture: true, passive: true }); });
})();
