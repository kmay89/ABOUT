/* book.js — it's a book first.

   After the drive up the hill, before a single step: the book itself.
   A lamp warms up over an old kitchen table. The hardcover comes down onto
   it with a soft thud and a breath of dust. Light slides across the cover,
   and the foxfire in the painting wakes, glinting and threading. The cover
   swings open on endpapers of gold mycelium, and on the flyleaf, in her
   hand, Gran's line writes itself in. The leaf turns: Chapter One, No
   Signal. Then the camera falls into the page, the paper fills with light,
   and the light is the hill.

   Simple pieces: one image, a few CSS 3D faces, two little canvases. A tap,
   E, Enter or Escape goes straight to the light. Reduced motion shows the
   open book still, then fades. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio;
  var B = BS.book = {};
  function reduced() { return G.prefs.reduced; }
  function haptic(p) { if (G.prefs.haptics && navigator.vibrate) navigator.vibrate(p); }

  var INSCRIBE = "If you are reading this, the lights have gone out — and that is the only reason you can see.";

  var el = null, dustC = null, sparkC = null, raf = 0, t0 = 0, timers = [], done = null, ending = false;
  function build() {
    el = document.createElement("div"); el.className = "hero"; el.setAttribute("role", "img");
    el.setAttribute("aria-label", "Borrowed Sunlight, a novel by Karl Meves. The book opens to Chapter One: No Signal.");
    var ink = INSCRIBE.split("").map(function (ch, i) { return '<span style="--i:' + i + '">' + (ch === " " ? " " : ch) + "</span>"; }).join("");
    el.innerHTML =
      '<canvas class="hdust"></canvas>' +
      '<div class="hstage"><div class="hbook">' +
        '<div class="hblock"></div>' +
        /* the page underneath it all: Chapter One */
        '<div class="hpage hbase"><div class="hpin">' +
          '<small>Chapter One</small><b>No Signal</b><i class="horn"></i>' +
          '<p><span class="hdrop">M</span>y grandmother’s house stood at the top of a hill the world had mostly forgotten…</p>' +
        "</div></div>" +
        /* the flyleaf, which turns */
        '<div class="hleaf"><div class="hface hfront"><div class="hpin hfly">' +
          '<p class="hink">' + ink + "</p><p class=\"hsig\">— in her hand, inside the cover</p>" +
        '</div></div><div class="hface hback"><div class="hpin hhalf"><b>Borrowed Sunlight</b><i class="horn"></i></div></div></div>' +
        /* the cover */
        '<div class="hcover"><div class="hface hfront"><img src="cover.jpg" alt=""><canvas class="hspark"></canvas><i class="hsheen"></i></div>' +
          '<div class="hface hback"><canvas class="hend"></canvas></div></div>' +
      "</div></div>" +
      '<div class="hflash"></div>' +
      '<button class="hskip ghost small" type="button">Skip<svg class="t" aria-hidden="true"><use href="#t-skip"/></svg></button>';
    document.body.appendChild(el);
    dustC = el.querySelector(".hdust"); sparkC = el.querySelector(".hspark");
    /* only the Skip button skips; a tap anywhere else answers whatever the book is waiting for */
    el.querySelector(".hskip").addEventListener("click", function (e) { e.stopPropagation(); skip(); });
    paintEnd(el.querySelector(".hend"));
  }

  /* ---------------- the endpapers: gold mycelium on green-black ---------------- */
  function paintEnd(c) {
    var W = 360, H = 540; c.width = W; c.height = H;
    var x = c.getContext("2d");
    var g = x.createRadialGradient(W * 0.5, H * 0.55, 20, W * 0.5, H * 0.5, H * 0.75);
    g.addColorStop(0, "#1d2414"); g.addColorStop(1, "#0a0d07"); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.lineCap = "round";
    function hy(px, py, a, n, w) {
      for (var i = 0; i < n; i++) {
        var nx = px + Math.cos(a) * 7, ny = py + Math.sin(a) * 7;
        x.strokeStyle = "rgba(230,200,110," + (0.16 + w * 0.25) + ")"; x.lineWidth = w;
        x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
        px = nx; py = ny; a += (Math.random() - 0.5) * 0.7;
        if (Math.random() < 0.08 && w > 0.35) hy(px, py, a + (Math.random() < 0.5 ? 0.9 : -0.9), (n - i) * 0.6 | 0, w * 0.7);
        if (px < -10 || px > W + 10 || py < -10 || py > H + 10) return;
      }
      x.fillStyle = "rgba(255,230,150,.6)"; x.beginPath(); x.arc(px, py, 1.1, 0, 7); x.fill();
    }
    if (BS.lace) {
      /* the same living gold as the cellar's, one colony spreading from the gutter */
      var net = BS.lace.network({ x: W * 0.06, y: H * 0.58, rx: W * 1.1, ry: H * 0.62, a0: -Math.PI * 0.48, a1: Math.PI * 0.48, n: 300, min: 9, seed: 1957, w0: 0.45, w1: 3.4 });
      var cc = BS.lace.bake(net, 2);
      x.drawImage(cc, net.box.x, net.box.y, net.box.w, net.box.h);
      x.save(); x.globalCompositeOperation = "lighter"; x.globalAlpha = 0.45; x.drawImage(cc, net.box.x, net.box.y, net.box.w, net.box.h); x.restore();
    } else for (var k = 0; k < 14; k++) hy(Math.random() * W, Math.random() * H, Math.random() * 6.28, 50, 1.1);
    for (var s = 0; s < 70; s++) { x.fillStyle = "rgba(255,226,140," + Math.random() * 0.7 + ")"; x.beginPath(); x.arc(Math.random() * W, Math.random() * H, Math.random() * 1.2, 0, 7); x.fill(); }
  }

  /* ---------------- sparks on the cover, dust in the lamp ---------------- */
  var sparks = [], motes = [];
  function seed() {
    sparks = [];
    for (var i = 0; i < 46; i++) sparks.push({ x: 0.14 + Math.random() * 0.72, y: 0.36 + Math.random() * 0.5, p: Math.random() * 6, f: 0.6 + Math.random() * 1.6, r: 0.6 + Math.random() * 1.6 });
    motes = [];
    for (var j = 0; j < 70; j++) motes.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.004, vy: -0.002 - Math.random() * 0.004, r: 0.5 + Math.random() * 1.6, p: Math.random() * 6 });
  }
  function frame() {
    if (!el) return;
    var t = (performance.now() - t0) / 1000;
    /* dust: lit only inside the lamp's pool */
    var dw = dustC.clientWidth, dh = dustC.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (dustC.width !== Math.round(dw * dpr)) { dustC.width = Math.round(dw * dpr); dustC.height = Math.round(dh * dpr); }
    var d = dustC.getContext("2d"); d.setTransform(dpr, 0, 0, dpr, 0, 0); d.clearRect(0, 0, dw, dh);
    var lamp = Math.min(1, t / 1.4);
    motes.forEach(function (m) {
      m.x += m.vx * 0.3 + Math.sin(t * 0.6 + m.p) * 0.0004; m.y += m.vy * 0.3; if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      var cx = m.x * dw, cy = m.y * dh, ld = Math.hypot((m.x - 0.5) * 1.3, m.y - 0.42), a = Math.max(0, 1 - ld * 1.8) * lamp;
      if (a < 0.02) return;
      d.fillStyle = "rgba(255,226,170," + (a * (0.35 + 0.35 * Math.sin(t * 2 + m.p))) + ")"; d.beginPath(); d.arc(cx, cy, m.r, 0, 7); d.fill();
    });
    /* the foxfire in the painting waking up */
    var sw = sparkC.clientWidth, sh = sparkC.clientHeight;
    if (sw && sparkC.width !== Math.round(sw * dpr)) { sparkC.width = Math.round(sw * dpr); sparkC.height = Math.round(sh * dpr); }
    var s = sparkC.getContext("2d"); s.setTransform(dpr, 0, 0, dpr, 0, 0); s.clearRect(0, 0, sw, sh);
    var wake = Math.max(0, Math.min(1, (t - 1.9) / 1.6));
    if (wake > 0 && sw) {
      s.globalCompositeOperation = "lighter";
      /* threads between near sparks, drawing themselves in */
      s.lineWidth = 0.6;
      for (var i = 0; i < sparks.length; i++) for (var j = i + 1; j < sparks.length; j++) {
        var a2 = sparks[i], b2 = sparks[j], dx = (a2.x - b2.x) * sw, dy = (a2.y - b2.y) * sh, dd = Math.hypot(dx, dy);
        if (dd > sw * 0.13) continue;
        var k = Math.max(0, Math.min(1, wake * 2.2 - (i % 7) * 0.12)), fl = 0.5 + 0.5 * Math.sin(t * 1.3 + i + j);
        s.strokeStyle = "rgba(230,240,140," + (0.2 * k * fl) + ")";
        s.beginPath(); s.moveTo(a2.x * sw, a2.y * sh); s.lineTo(a2.x * sw - dx * k, a2.y * sh - dy * k); s.stroke();
      }
      sparks.forEach(function (p) {
        var tw = 0.4 + 0.6 * Math.pow(Math.max(0, Math.sin(t * p.f + p.p)), 3), R = p.r * (2 + tw * 3);
        var g = s.createRadialGradient(p.x * sw, p.y * sh, 0, p.x * sw, p.y * sh, R * 2.4);
        g.addColorStop(0, "rgba(255,250,200," + (0.9 * tw * wake) + ")"); g.addColorStop(0.3, "rgba(240,220,110," + (0.35 * tw * wake) + ")"); g.addColorStop(1, "rgba(200,220,80,0)");
        s.fillStyle = g; s.fillRect(p.x * sw - R * 2.4, p.y * sh - R * 2.4, R * 4.8, R * 4.8);
      });
    }
    raf = requestAnimationFrame(frame);
  }

  /* ---------------- sizing: one book, closed big, open centered ---------------- */
  function size() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var bw = Math.min(vh * 0.64 / 1.5, vw * 0.46), bh = bw * 1.5;
    var closed = Math.min(1.6, (vw * 0.78) / bw, (vh * 0.8) / bh);
    el.style.setProperty("--bw", bw + "px"); el.style.setProperty("--bh", bh + "px");
    el.style.setProperty("--closed", closed.toFixed(3));
    el.style.setProperty("--read", Math.min(1.9, (vw * 0.86) / bw, (vh * 0.8) / bh).toFixed(3));
  }

  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function step(c) { el.classList.add(c); }
  B.open = function () {
    if (G.skipWaits) return Promise.resolve();
    return new Promise(function (res) {
      if (!el) build();
      done = res; ending = false; timers = []; t0 = performance.now(); seed(); size();
      window.addEventListener("resize", size);
      el.className = "hero on";
      document.addEventListener("keydown", key, true);
      cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
      if (reduced()) {
        step("still"); A.sfx("chapter");
        ask("Begin", "Tap to begin", 900, finish);
        return;
      }
      /* the lamp warms, the book comes down — and then it is yours to open */
      at(250, function () { step("lamp"); });
      at(500, function () { step("drop"); });
      at(1450, function () { step("down"); A.sfx("thud"); haptic(14); });
      at(1800, function () { step("sheen"); A.sfx("twinkle"); });
      at(2200, function () { step("askip"); });
      at(2900, function () { ask("Open the book", "Tap to open", 0, openIt); });
    });
  };
  /* one prompt, the same everywhere (engine.js G.cue): the book waits for you */
  function ask(label, tap, lock, then) {
    G.cue({ label: label, tap: tap, lock: lock, el: el, bottom: "4.5vh" }).then(function () { if (!ending && el && el.classList.contains("on")) then(); });
  }
  /* `ms` from now, or the moment you press: so a line being written can be finished like a line being spoken */
  function soon(ms, fn) {
    var fired = false;
    function go() { if (fired || ending) return; fired = true; clearTimeout(id); if (G.cueFn === go) G.cueFn = null; el.removeEventListener("pointerup", go); fn(); }
    var id = setTimeout(go, ms); timers.push(id);
    G.cueFn = go; el.addEventListener("pointerup", go);
  }
  var INK_MS = 46;
  function openIt() {
    step("open"); A.sfx("page"); haptic(8);
    at(200, function () { A.sfx("creak"); });
    /* her line writes itself in, at the pace of a hand */
    at(1500, function () {
      step("ink");
      INSCRIBE.split("").forEach(function (ch, i) { if (i % 5 === 0 && ch !== " ") at(i * INK_MS, function () { if (!el.classList.contains("inkdone") && !ending) A.sfx("text"); }); });
      soon(INSCRIBE.length * INK_MS + 700, function () {
        step("inkdone");
        ask("Turn the page", "Tap to turn the page", 250, turnIt);
      });
    });
  }
  function turnIt() {
    step("turn"); A.sfx("page"); haptic(8);
    at(900, function () { A.sfx("chapter"); });
    at(1500, function () { step("read"); });
    at(2500, function () { ask("Begin", "Tap to begin", 0, fall); });
  }
  function key(e) {
    if (!el || !el.classList.contains("on")) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); skip(); }
  }
  function skip() {
    if (ending) return;
    if (reduced()) { ending = true; if (G.cueCancel) G.cueCancel(); finish(); return; }
    timers.forEach(clearTimeout); timers = [];
    if (G.cueCancel) G.cueCancel(); G.cueFn = null;
    step("open"); step("ink"); step("turn"); step("drop"); step("down"); step("lamp"); step("fast");
    fall();
  }
  /* into the page, and the page is light */
  function fall() {
    if (ending) return; ending = true;
    if (G.cueCancel) G.cueCancel(); G.cueFn = null;
    step("fall"); A.sfx("whoosh");
    setTimeout(function () { step("white"); }, 650);
    setTimeout(function () { el.classList.add("gone"); A.sfx("land"); }, 1500);
    setTimeout(finish, 2500);
  }
  function finish() {
    timers.forEach(clearTimeout); timers = [];
    cancelAnimationFrame(raf);
    document.removeEventListener("keydown", key, true);
    window.removeEventListener("resize", size);
    if (el) el.className = "hero";
    var r = done; done = null; if (r) r();
  }
})();
