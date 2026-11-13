/* engine.js — the hill, running.

   One loop, one canvas at a small fixed pixel size scaled up to the
   window, and HTML over the top for every word (so the words are crisp,
   selectable by a screen reader, and sized by the reader's own settings).

   The two felt engines of the book are the two load-bearing systems here:
   · the dark fills with light — a darkness layer with holes cut in it by
     every light, and your eyes' own adaptation, which builds while you
     stand in the dark and is undone by bright light;
   · the dead phone becomes an eye — the lens (lens.js), which needs the
     phone, which needs charge, which needs the dynamo, which needs a hill.

   The story (story.js) drives everything through the small API on G. */
(function () {
  "use strict";
  var BS = window.BS = window.BS || {};
  var TL = BS.TL, T = 16, A = BS.audio;
  var G = BS.G = {};
  var $ = function (id) { return document.getElementById(id); };
  G.$ = $;

  /* ---------------- state ---------------- */
  G.fresh = function () {
    return {
      v: 1, beat: "arrive", flags: {}, items: {}, notes: {}, seen: {}, visited: {},
      day: "Monday", tod: "noon", battery: 4, map: "house", x: 3.5 * T, y: 2.6 * T, dir: 0,
      objective: "", playMs: 0, marginalia: "", clock: 0
    };
  };
  G.s = G.fresh();
  G.prefs = { text: 42, captions: true, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, master: 0.8, music: 0.6, amb: 0.8, haptics: true, big: false };

  var SAVE = "borrowed-sunlight-game-v1", PREFS = "borrowed-sunlight-game-prefs";
  G.save = function () {
    try { G.s.x = G.p.x; G.s.y = G.p.y; G.s.dir = G.p.dir; G.s.map = G.mapId; localStorage.setItem(SAVE, JSON.stringify(G.s)); } catch (e) { }
  };
  G.load = function () { try { var j = localStorage.getItem(SAVE); return j ? JSON.parse(j) : null; } catch (e) { return null; } };
  G.wipe = function () { try { localStorage.removeItem(SAVE); } catch (e) { } };
  G.savePrefs = function () { try { localStorage.setItem(PREFS, JSON.stringify(G.prefs)); } catch (e) { } };
  try { var pp = JSON.parse(localStorage.getItem(PREFS) || "null"); if (pp) for (var k in pp) G.prefs[k] = pp[k]; } catch (e) { }

  /* ---------------- canvas & scaling ---------------- */
  /* The view is measured in world units (a tile is 16); the canvas is the
     window at device resolution (capped so phones stay smooth), and every
     world drawing is scaled by K. The light is a smaller canvas, smoothed
     up, which is what soft light wants anyway. */
  var cvs = $("stage"), ctx = cvs.getContext("2d", { alpha: false });
  var light = BS.cv(320, 180), lx = light.getContext("2d");
  var blurA = BS.cv(64, 36), bax = blurA.getContext("2d"), blurB = BS.cv(32, 18), bbx = blurB.getContext("2d");
  var VW = 320, VH = 180, SC = 4, K = 4, LK = 2;
  G.quality = 1;     // dynamic resolution: the loop lowers it if frames run long
  G.view = function () { return { w: VW, h: VH, s: SC, k: K }; };
  function fit() {
    var W = window.innerWidth, Hh = window.innerHeight;
    SC = Math.max(1.6, Math.min(9, Math.min(W / 300, Hh / 168)));
    /* a phone held upright: come in close enough that Wren is a person, not
       a speck; about eleven tiles across */
    if (Hh > W * 1.15) SC = Math.max(SC, Math.min(9, W / 176));
    VW = W / SC; VH = Hh / SC;
    var q = Math.min(window.devicePixelRatio || 1, 2);
    if (W * Hh * q * q > 2.6e6) q = Math.sqrt(2.6e6 / (W * Hh));
    q *= G.quality;
    cvs.width = Math.round(W * q); cvs.height = Math.round(Hh * q);
    cvs.style.width = W + "px"; cvs.style.height = Hh + "px";
    K = cvs.width / VW;
    light.width = Math.ceil(VW * LK); light.height = Math.ceil(VH * LK);
    baseSC = SC; zoomNow = 1; applyZoom();
    blurA.width = Math.ceil(cvs.width / 4); blurA.height = Math.ceil(cvs.height / 4);
    blurB.width = Math.ceil(cvs.width / 10); blurB.height = Math.ceil(cvs.height / 10);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  }
  /* a camera that can pull back and lean in (the opening uses it): the
     canvas stays the same size, only how much of the world it holds changes */
  var baseSC = 0, zoomNow = 1;
  G.zoom = 1;
  function applyZoom() {
    var z = Math.max(0.45, Math.min(2.5, G.zoom || 1));
    if (Math.abs(z - zoomNow) < 1e-4) return;
    zoomNow = z; SC = baseSC * z;
    VW = window.innerWidth / SC; VH = window.innerHeight / SC; K = cvs.width / VW;
    light.width = Math.ceil(VW * LK); light.height = Math.ceil(VH * LK);
  }
  window.addEventListener("resize", fit); fit();

  /* ---------------- world ---------------- */
  G.maps = BS.buildWorld();
  G.repaint = function (id) { BS.forgetChunks(id); };
  /* reveal a hidden path (the deer path, the root fork) */
  G.reveal = function (kind) {
    var m = G.maps.hill;
    if (!m.hidden[kind]) return;
    m.hidden[kind] = false;
    BS.forgetChunks("hill");
  };
  function hiddenSolid(m, t) {
    if (m.id !== "hill" || !m.hidden) return false;
    return (t === TL.DEER && m.hidden.deer) || (t === TL.ROOT && m.hidden.root);
  }
  /* the lone trees, lavender, and the long grass that leans in the wind */
  var decor = null;
  function buildDecor() {
    var m = G.maps.hill;
    decor = { trees: [], lav: [], tufts: [], trunks: null };
    var tuftImgs = [0, 1, 2, 3].map(function (k) { return BS.paintTuft(k * 17 + 3, true); }), greenTufts = [0, 1, 2].map(function (k) { return BS.paintTuft(k * 31 + 5, false); });
    var lavImgs = [0, 1, 2, 3].map(function (k) { return BS.paintLavender(k * 13 + 1); });
    for (var y = 0; y < m.h; y++) for (var x = 0; x < m.w; x++) {
      var t = m.get(x, y);
      if (t === TL.TREE) decor.trees.push({ x: x * T + 8, y: y * T + 14, c: BS.paintCanopy(x * 7 + y * 3, 19) });
      if (t === TL.LAVENDER) decor.lav.push({ x: x * T + 8, y: y * T + 14, c: lavImgs[(x + y) % 4], ph: BS.hash(x, y, 2) * 6 });
      if (t === TL.LONG && BS.hash(x, y, 77) < 0.4) for (var k = 0; k < 2; k++) decor.tufts.push({ x: x * T + 3 + BS.hash(x, y, k) * 10, y: y * T + 4 + BS.hash(y, x, k) * 10, c: tuftImgs[(x * 3 + y + k) % 4], ph: BS.hash(x, y, k + 9) * 6 });
      if (t === TL.FIELD && BS.hash(x, y, 79) < 0.22) decor.tufts.push({ x: x * T + 3 + BS.hash(x, y, 5) * 10, y: y * T + 4 + BS.hash(y, x, 5) * 10, c: tuftImgs[(x + y * 3) % 4], ph: BS.hash(x, y, 6) * 6 });
      if ((t === TL.GARDEN) && BS.hash(x, y, 78) < 0.12) decor.tufts.push({ x: x * T + 8, y: y * T + 10, c: greenTufts[(x + y) % 3], ph: BS.hash(x, y, 4) * 6 });
    }
  }

  /* ---------------- entities ---------------- */
  G.ents = [];      // {id, map, x, y, who|draw, dir, frame, solid, hidden, act, label}
  G.ent = function (id) { for (var i = 0; i < G.ents.length; i++) if (G.ents[i].id === id) return G.ents[i]; return null; };
  G.put = function (o) {
    var e = G.ent(o.id);
    if (!e) { e = { dir: 0, frame: 0, solid: true, w: 10, h: 6 }; G.ents.push(e); }
    for (var k in o) e[k] = o[k];
    return e;
  };
  G.drop = function (id) { G.ents = G.ents.filter(function (e) { return e.id !== id; }); };

  /* the player */
  G.p = { x: 0, y: 0, dir: 0, frame: 0, walk: 0, still: 0, moving: false, trail: [], who: "wren" };

  /* interactables and triggers, registered by the story */
  G.spots = [];      // {id, map, x, y, r, label, when, act}
  G.zones = [];      // {id, map, x0,y0,x1,y1, when, run, once, done}
  G.looks = [];      // computed per map from BS.lens.LOOKS
  G.spot = function (o) { G.spots = G.spots.filter(function (s) { return s.id !== o.id; }); G.spots.push(o); };
  G.zone = function (o) { G.zones = G.zones.filter(function (z) { return z.id !== o.id; }); G.zones.push(o); };

  G.mapId = "house";
  G.map = G.maps.house;

  /* ---------------- input ---------------- */
  var keys = {}, edge = {};
  var KEYMAP = {
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    KeyE: "act", Space: "act", Enter: "act", KeyZ: "act", KeyL: "lens", KeyX: "lens", KeyC: "crank", KeyB: "book", Tab: "book",
    Escape: "menu", KeyP: "menu", KeyM: "map", ShiftLeft: "run", ShiftRight: "run"
  };
  G.input = { ax: 0, ay: 0 };
  function press(a) { if (!keys[a]) edge[a] = true; keys[a] = true; }
  function release(a) { keys[a] = false; }
  window.addEventListener("keydown", function (e) {
    if (e.target && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT")) return;
    var a = KEYMAP[e.code]; if (!a) return;
    if (a === "book" || a === "act" || a === "menu" || a.length <= 5) e.preventDefault();
    if (!e.repeat) press(a); else keys[a] = true;
    G.usingKeys = true;
  });
  window.addEventListener("keyup", function (e) { var a = KEYMAP[e.code]; if (a) release(a); });
  window.addEventListener("blur", function () { keys = {}; });
  G.held = function (a) { return !!keys[a]; };
  G.tap = function (a) { if (edge[a]) { edge[a] = false; return true; } return false; };
  G.clearTaps = function () { edge = {}; };
  G.press = press; G.release = release;

  /* touch: a thumb-stick on the left, buttons on the right */
  (function touch() {
    var stick = $("stick"), knob = $("knob"), id = null, cx = 0, cy = 0;
    if (!stick) return;
    function upd(x, y) {
      var dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), max = 42;
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      knob.style.transform = "translate(" + dx + "px," + dy + "px)";
      G.input.ax = Math.abs(dx) > 8 ? dx / max : 0; G.input.ay = Math.abs(dy) > 8 ? dy / max : 0;
    }
    stick.addEventListener("pointerdown", function (e) { id = e.pointerId; var r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; stick.setPointerCapture(id); upd(e.clientX, e.clientY); });
    stick.addEventListener("pointermove", function (e) { if (e.pointerId === id) upd(e.clientX, e.clientY); });
    function end(e) { if (e.pointerId !== id) return; id = null; knob.style.transform = ""; G.input.ax = G.input.ay = 0; }
    stick.addEventListener("pointerup", end); stick.addEventListener("pointercancel", end);
    document.querySelectorAll("[data-btn]").forEach(function (b) {
      var a = b.getAttribute("data-btn");
      b.addEventListener("pointerdown", function (e) { e.preventDefault(); A.init(); press(a); b.classList.add("on"); if (G.prefs.haptics && navigator.vibrate) navigator.vibrate(8); });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { b.addEventListener(ev, function () { release(a); b.classList.remove("on"); }); });
    });
    window.addEventListener("touchstart", function () { document.body.classList.add("touch"); }, { once: true, passive: true });
  })();

  /* gamepads, polled */
  var padPrev = {};
  function pollPad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var p = pads && pads[0]; if (!p) return;
    var map = { 0: "act", 1: "crank", 2: "lens", 3: "book", 9: "menu", 12: "up", 13: "down", 14: "left", 15: "right" };
    for (var b in map) { var on = p.buttons[b] && p.buttons[b].pressed; if (on && !padPrev[b]) press(map[b]); if (!on && padPrev[b]) release(map[b]); padPrev[b] = on; }
    var ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    if (Math.abs(ax) > 0.25 || Math.abs(ay) > 0.25) { G.input.ax = ax; G.input.ay = ay; G.padStick = true; }
    else if (G.padStick) { G.input.ax = G.input.ay = 0; G.padStick = false; }
  }

  /* ---------------- collision ---------------- */
  function solidAt(px, py, self) {
    var m = G.map, tx = Math.floor(px / T), ty = Math.floor(py / T), t = m.get(tx, ty);
    if (t < 0) return true;
    if (BS.SOLID[t] || hiddenSolid(m, t)) return true;
    if (G.gate && G.gate(tx, ty, t)) return true;
    for (var i = 0; i < G.ents.length; i++) {
      var e = G.ents[i];
      if (e === self || e.map !== G.mapId || !e.solid || e.hidden) continue;
      if (Math.abs(px - e.x) < e.w / 2 + 2 && py > e.y - e.h && py < e.y + 2) return true;
    }
    return false;
  }
  function blocked(x, y, self) {
    return solidAt(x - 5, y - 3, self) || solidAt(x + 5, y - 3, self) || solidAt(x - 5, y + 1, self) || solidAt(x + 5, y + 1, self);
  }
  G.blocked = blocked;
  function move(o, dx, dy) {
    var nx = o.x + dx, ny = o.y + dy;
    if (!blocked(nx, o.y, o)) o.x = nx;
    else if (dy === 0) { if (!blocked(nx, o.y - 3, o)) { o.x = nx; o.y -= 1; } else if (!blocked(nx, o.y + 3, o)) { o.x = nx; o.y += 1; } }
    if (!blocked(o.x, ny, o)) o.y = ny;
    else if (dx === 0) { if (!blocked(o.x - 3, ny, o)) { o.x -= 1; o.y = ny; } else if (!blocked(o.x + 3, ny, o)) { o.x += 1; o.y = ny; } }
  }

  /* ---------------- time of day ---------------- */
  var TOD = {
    noon: { dark: 0, tint: "rgba(255,214,120,.06)", label: "noon" },
    afternoon: { dark: 0, tint: "rgba(255,200,110,.05)", label: "afternoon" },
    evening: { dark: 0.1, tint: "rgba(255,150,60,.13)", label: "evening" },
    golden: { dark: 0.16, tint: "rgba(255,130,70,.15)", label: "evening" },
    dusk: { dark: 0.5, tint: "rgba(70,80,160,.24)", label: "dusk" },
    night: { dark: 0.74, tint: "rgba(20,30,90,.22)", label: "night" },
    dawn: { dark: 0.12, tint: "rgba(220,170,200,.12)", label: "dawn" },
    morning: { dark: 0, tint: "rgba(255,240,200,.05)", label: "morning" }
  };
  G.TOD = TOD;
  /* the light moves between times of day; it never snaps */
  function parseRGBA(s) { var m = s.match(/[\d.]+/g); return [+m[0], +m[1], +m[2], +m[3]]; }
  G.sky = { dark: 0, tint: [255, 214, 120, 0.06], snap: true };
  function skyTick(dt) {
    var tgt = TOD[G.s.tod], tt = parseRGBA(tgt.tint), k = G.sky.snap || $("fade").classList.contains("on") ? 1 : Math.min(1, dt * 0.55);
    G.sky.dark += (tgt.dark - G.sky.dark) * k;
    for (var i = 0; i < 4; i++) G.sky.tint[i] += (tt[i] - G.sky.tint[i]) * k;
    /* the sun's shadow vector: west in the morning, short at noon, long and
       east at golden hour; the moon throws a faint one too */
    var SUN = { dawn: [-1.5, 0.34, 0.4], morning: [-0.75, 0.4, 0.85], noon: [0.12, 0.3, 0.9], afternoon: [0.6, 0.4, 0.85], evening: [1.15, 0.44, 0.78], golden: [1.7, 0.46, 0.72], dusk: [2.1, 0.5, 0.3], night: [0.35, 0.32, 0.16] }[G.s.tod] || [0.3, 0.35, 0.8];
    if (!G.sun || k >= 1) G.sun = SUN.slice();
    for (i = 0; i < 3; i++) G.sun[i] += (SUN[i] - G.sun[i]) * k;
    G.sky.snap = false;
  }
  G.skyTick = skyTick;
  G.setTime = function (tod, day) { G.s.tod = tod; if (day) G.s.day = day; G.hud(); };

  /* ---------------- the lantern, your eyes, the phone ---------------- */
  G.lamp = { level: 0, rate: 0, arm: 1, on: false, fixed: null };
  G.eyes = { adapt: 0 };
  function updLamp(dt) {
    var L = G.lamp, cranking = G.s.items.lantern && G.held("crank") && G.mode === "walk" && !G.cut;
    if (cranking && L.arm > 0) {
      L.rate = Math.min(1, L.rate + dt * 2.2);
      L.arm = Math.max(0, L.arm - dt * 0.12);                     // your arm gets tired in about forty seconds
      if (G.s.items.phone !== false && G.s.battery < 100 && G.s.flags.cable) G.s.battery = Math.min(100, G.s.battery + dt * 0.35);
    } else {
      L.rate = Math.max(0, L.rate - dt * 3);
      L.arm = Math.min(1, L.arm + dt * 0.08);
    }
    var target = L.rate * (0.35 + 0.65 * Math.max(0.25, L.arm));
    L.level += (target - L.level) * Math.min(1, dt * (target > L.level ? 2.4 : 1.6));
    if (L.level < 0.01) L.level = 0;
    if (G.mode === "walk") A.dynamo(L.rate * 0.7 * (0.5 + L.arm / 2));
    $("arm").style.setProperty("--v", (L.arm * 100).toFixed(0) + "%");
    $("arm").classList.toggle("show", !!G.s.items.lantern && (L.rate > 0 || L.arm < 0.98));
  }
  /* your eyes: rods take minutes to open fully in the dark (the game
     compresses it to seconds); a bright light shuts them again */
  function updEyes(dt) {
    var m = G.map, inDark = m.dark >= 0.9 || (m.outdoor && TOD[G.s.tod].dark > 0.7);
    var bright = G.lamp.level > 0.6 || (G.workLights && G.mapId === "cellar") || G.phoneGlare > 0;
    var e = G.eyes;
    if (bright) e.adapt = Math.max(0, e.adapt - dt * (G.workLights ? 2 : 0.5));
    else if (inDark) e.adapt = Math.min(1, e.adapt + dt * (G.p.still > 0.5 ? 0.09 : 0.03));
    else e.adapt = Math.max(0, e.adapt - dt * 0.4);
    if (G.phoneGlare > 0) G.phoneGlare -= dt;
    /* the eye: shown while the dark is doing its slow work, opening as you wait */
    var show = G.mapId === "cellar" && !G.workLights && G.lamp.level < 0.2 && e.adapt < 0.97 && G.mode === "walk";
    var el = $("eyem");
    if (el) { if (show !== G._eyeShow) { G._eyeShow = show; el.classList.toggle("on", show); } if (show) { var o = Math.round(e.adapt * 100); if (o !== G._eyeO) { G._eyeO = o; el.style.setProperty("--o", (0.08 + e.adapt * 0.92).toFixed(2)); el.classList.toggle("still", G.p.still > 0.5); } } }
  }
  G.flashPhone = function () { var ph = $("phonehud"); if (!ph) return; ph.classList.remove("dying"); void ph.offsetWidth; ph.classList.add("dying"); };

  /* ---------------- the HUD ---------------- */
  G.hud = function () {
    var s = G.s;
    $("day").textContent = s.day + " · " + TOD[s.tod].label;
    $("place").textContent = G.map ? G.map.name : "";
    var bat = Math.round(s.battery);
    $("bat").style.setProperty("--b", Math.max(2, bat) + "%");
    $("bat").classList.toggle("low", bat < 6);
    $("batn").textContent = bat + "%";
    var bars = G.signalBars || 0;
    $("bars").setAttribute("data-bars", bars);
    $("phonehud").setAttribute("aria-label", "Phone: " + bat + "% battery, " + (bars ? bars + " bar of signal" : "no service"));
    $("svc").textContent = bars ? "" : "No Service";
    var cl = $("clock");
    var f = s.flags;
    cl.innerHTML = "";
    if (f.knowClose) chip(cl, "Keys go", "Fri", f.clockStruck >= 3);
    if (f.knowDewater) chip(cl, "Pumped dry", "Thu", f.clockStruck >= 2, true);
    if (f.knowPour) chip(cl, "Concrete", f.knowDewater ? "Mon" : "Mon?", false);
    $("obj").textContent = s.objective || "";
    $("obj").hidden = !s.objective;
  };
  function chip(el, a, b, done, hot) {
    var c = document.createElement("span"); c.className = "chip" + (hot ? " hot" : "") + (done ? " done" : "");
    c.innerHTML = "<small>" + a + "</small><b>" + b + "</b>"; el.appendChild(c);
  }
  G.objective = function (t) {
    var changed = t && t !== G.s.objective;
    G.s.objective = t; G.hud();
    if (changed) {
      /* a new goal says so briefly; if a place title is up, it waits its turn */
      var showObj = function () { var o = $("obj"); o.classList.remove("pop"); void o.offsetWidth; o.classList.add("pop"); document.body.classList.add("objnew"); clearTimeout(G._objT); G._objT = setTimeout(function () { document.body.classList.remove("objnew"); }, 4500); setTimeout(function () { A.sfx("goal"); }, 250); };
      if (document.body.classList.contains("regionon")) setTimeout(showObj, 3400); else showObj();
    }
  };
  G.flash = function (t) { var f = $("flash"); f.textContent = t; f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); };
  G.toast = function (t, ms) { var f = $("toast"); f.textContent = t; f.classList.add("on"); clearTimeout(G._tt); G._tt = setTimeout(function () { f.classList.remove("on"); }, ms || 2600); };

  /* captions for sound */
  var capT = 0;
  A.captions = function (t) {
    if (!G.prefs.captions) return;
    var c = $("caption"); c.textContent = t; c.classList.add("on"); capT = 2.2;
  };

  /* ---------------- words: dialogue, narration, Mo, the cynic ---------------- */
  var talk = null;     // {resolve, el, full, shown, done}
  /* ---------------- the words: one way, everywhere ----------------
     Zelda-style. Each box types at an even pace, takes a breath at the end
     of a sentence and a half-breath at a comma, slows for *emphasis*, and
     lights the words that matter: days and deadlines in coral, the things
     you carry in gold, places in sky blue (the first time each turns up on
     a page). Hold the button to hurry it; press to fill the box; press again
     to go on. A beat after the box fills, the arrow comes — and until then
     a press does nothing, so a held thumb never skips the next line. */
  var HL = [
    ["r", /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|concrete|dewater(?:ed|ing)?|pumped dry|the pump|the keys|deadline)\b/gi],
    ["g", /\b(Gran's book|her book|the book|jars?|lantern|scooter|dynamo|drop of water|bottle cap|moss|tardigrades?|crank|magnifier|watering can|slime mold)\b/gi],
    ["b", /\b(the cellar|cellar|the hollow|the woods|the pond|the pit|the shed|the crest|the porch|the garden|the beech|Beck's house|the hill)\b/gi]
  ];
  function rich(text, hl) {
    var out = [], em = false;
    for (var i = 0; i < text.length; i++) { var c = text[i]; if (c === "*") { em = !em; continue; } out.push({ c: c, em: em, h: "" }); }
    if (hl !== false) {
      var plain = out.map(function (o) { return o.c; }).join(""), seen = {};
      HL.forEach(function (H) {
        H[1].lastIndex = 0; var m;
        while ((m = H[1].exec(plain))) {
          var key = m[0].toLowerCase().replace(/^(the|her) /, "").replace(/s$/, "");
          if (seen[key]) continue; seen[key] = 1;
          var free = true; for (var j = m.index; j < m.index + m[0].length; j++) if (out[j].h) free = false;
          if (free) for (var k2 = m.index; k2 < m.index + m[0].length; k2++) out[k2].h = H[0];
        }
      });
    }
    return out;
  }
  function paint(tok, n) {
    var html = "", run = "", key = null;
    function flush() { if (!run) return; var cl = key.split("|"), c = []; if (cl[0] === "1") c.push("gh"); if (cl[1]) c.push("hl" + cl[1]); html += cl[2] === "1" ? "<em" + (c.length ? ' class="' + c.join(" ") + '"' : "") + ">" + run + "</em>" : (c.length ? '<span class="' + c.join(" ") + '">' + run + "</span>" : run); run = ""; }
    for (var i = 0; i < tok.length; i++) {
      var k = (i >= n ? "1" : "0") + "|" + tok[i].h + "|" + (tok[i].em ? "1" : "0");
      if (k !== key) { flush(); key = k; }
      run += esc(tok[i].c);
    }
    flush();
    return html;
  }
  G.rich = function (text) { return paint(rich(text), 1e9); };
  /* how long to hold after each letter, in letters-worth of time */
  function beat(tok, i) {
    var c = tok[i].c, nx = tok[i + 1] ? tok[i + 1].c : " ", end = nx === " " || nx === "\u201d" || nx === '"' || nx === ")" || i === tok.length - 1;
    if (c === "\u2026") return 9;
    if ((c === "." || c === "!" || c === "?") && end) return nx === "." ? 1 : 11;
    if (c === "\u2014") return 6;
    if ((c === ";" || c === ":") && end) return 6;
    if (c === "," && end) return 4;
    return tok[i].em ? 1.3 : 1;
  }
  function typeInto(el, text, cb, voice) {
    var tok = rich(text, voice !== "mo"), i = 0, cps = G.prefs.text;
    var t = { full: text, tok: tok, el: el, done: false, cb: cb, timer: null, readyAt: 0 };
    el.innerHTML = paint(tok, 0);
    function done() { t.done = true; el.innerHTML = paint(tok, 1e9); t.readyAt = performance.now() + 220; cb && cb(); }
    t.finishNow = function () { clearTimeout(t.timer); done(); t.readyAt = performance.now() + 160; };
    if (cps >= 200 || G.prefs.reduced && cps > 120 || G.skipWaits) { done(); t.readyAt = 0; return t; }
    var tick = function () {
      i += 1;
      el.innerHTML = paint(tok, i);
      var ch = tok[i - 1].c;
      if (voice && i % 2 === 0 && /[a-z]/i.test(ch)) A.sfx("voice", voice, ch.charCodeAt(0)); else if (!voice && i % 4 === 0 && ch !== " ") A.sfx("text");
      if (i >= tok.length) { done(); return; }
      var d = 1000 / cps * beat(tok, i - 1);
      if (G.held("act")) d = Math.min(d, 1000 / cps) / 4;
      t.timer = setTimeout(tick, d);
    };
    /* the box opens, then a breath, then the first letter */
    t.timer = setTimeout(tick, 110);
    return t;
  }
  /* pages the size of the box: three lines at most, breaking at a sentence when it can */
  function paginate(el, text, lines) {
    lines = lines || 3;
    var w = el.clientWidth; if (!w || text.length < 60) return [text];
    var probe = el.cloneNode(false); probe.removeAttribute("id");
    probe.style.cssText = "position:absolute;visibility:hidden;left:-9999px;top:0;width:" + w + "px;height:auto";
    document.body.appendChild(probe);
    var lh = parseFloat(getComputedStyle(probe).lineHeight) || 24, max = lh * lines + 2;
    var words = text.split(/ +/), out = [], cur = [];
    function fits(arr) { probe.innerHTML = paint(rich(arr.join(" ")), 1e9); return probe.offsetHeight <= max; }
    for (var k = 0; k < words.length; k++) {
      var tryw = cur.concat(words[k]);
      if (!cur.length || fits(tryw)) { cur = tryw; continue; }
      /* full: go back to the last sentence end if there's one in the back half */
      var cut = -1;
      for (var j = cur.length - 1; j >= Math.floor(cur.length * 0.45); j--) if (/[.!?\u2026][\u201d"*)]*$/.test(cur[j])) { cut = j; break; }
      if (cut >= 0 && cut < cur.length - 1) { out.push(cur.slice(0, cut + 1).join(" ")); cur = cur.slice(cut + 1).concat(words[k]); }
      else { out.push(cur.join(" ")); cur = [words[k]]; }
    }
    if (cur.length) out.push(cur.join(" "));
    probe.remove();
    /* keep *emphasis* closed on each page */
    var open = false;
    return out.map(function (pg) { var s2 = (open ? "*" : "") + pg, n = (pg.match(/\*/g) || []).length; if (n % 2) open = !open; return open ? s2 + "*" : s2; });
  }
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  /* *italics* in the script become <em> */
  function fmt(s) { return esc(s).replace(/\*([^*]+)\*?/g, "<em>$1</em>"); }
  G.fmt = fmt;
  function finish(t) { if (t && !t.done) { clearTimeout(t.timer); if (t.finishNow) { t.finishNow(); return; } t.done = true; t.el.innerHTML = fmt(t.full); t.cb && t.cb(); } }

  var WHO = {
    wren: { name: "Me", cls: "wren" }, dad: { name: "Dad", cls: "dad" }, beck: { name: "Beck", cls: "beck" },
    gran: { name: "Gran", cls: "gran" }, worker: { name: "The man with the coffee", cls: "worker" },
    beckdad: { name: "Beck's dad", cls: "dad" }, phone: { name: "Phone", cls: "phone" }
  };
  G.say = function (who, text) {
    return new Promise(function (res) {
      var box = $("dlg"), w = WHO[who] || { name: who, cls: "" }; $("region").classList.remove("on");
      var was = box.classList.contains("on") && box.getAttribute("data-who") === who;
      box.className = "dlg on " + w.cls + (was ? " cont" : ""); box.setAttribute("data-who", who);
      $("who").textContent = w.name;
      $("more").hidden = true;
      G.portrait = who; G.lineMood = BS.life ? BS.life.moodOf(text, who) : "";
      $("pframe").hidden = !BS.portrait(who);
      var ps = paginate($("line"), text, 3), pi = 0;
      $("live").textContent = w.name + ": " + text.replace(/\*/g, "");
      function page() {
        G.talking = true; $("more").hidden = true;
        $("more").textContent = pi < ps.length - 1 ? "\u25bc" : "\u25bc";
        var t = typeInto($("line"), ps[pi], function () { $("more").hidden = false; G.talking = false; }, who);
        talk = { t: t, res: function () {
          if (++pi < ps.length) { A.sfx("text"); page(); return; }
          box.className = "dlg"; G.talking = false; res();
        } };
      }
      page();
    });
  };
  /* Nintendo-short on screen; the whole passage is kept in Gran's book,
     under Story, for anyone who wants the novel's own words */
  function brief(text) {
    var L = BS.story && BS.story.SHORT;
    if (L) for (var i = 0; i < L.length; i++) if (text.indexOf(L[i][0]) === 0) return L[i][1];
    var m = text.match(/^(.+?[.!?])(\s|\*?$)/), f = m ? m[1] : text;
    if (f.length > 150) { f = f.slice(0, 140); f = f.slice(0, f.lastIndexOf(" ")) + "…"; }
    return f;
  }
  G.brief = brief;
  G.narrate = function (text) {
    return new Promise(function (res) {
      var n = $("narr"); n.classList.add("on"); $("region").classList.remove("on");
      $("nmore").hidden = true;
      var shown = G.prefs.fullText ? text : brief(text), more = shown !== text;
      G.s.story = G.s.story || [];
      if (!G.s.story.some(function (q) { return q.t === text; })) G.s.story.push({ t: text, d: G.s.day });
      if (more) BS.ui && BS.ui.bookPing && BS.ui.bookPing();
      var ps = paginate($("ntext"), shown, 3), pi = 0;
      $("live").textContent = shown.replace(/\*/g, "");
      function page() {
        $("nmore").hidden = true;
        n.classList.toggle("hasmore", more && pi === ps.length - 1);
        var t = typeInto($("ntext"), ps[pi], function () { $("nmore").hidden = false; });
        talk = { t: t, res: function () {
          if (++pi < ps.length) { A.sfx("text"); page(); return; }
          n.classList.remove("on"); res();
        } };
      }
      page();
    });
  };
  /* Mo: no box, no name. Gold, italic, from no direction at all. */
  G.mo = function (text) {
    return new Promise(function (res) {
      var m = $("mo"); m.classList.add("on");
      A.sfx("mo"); G.moOn = G.time ? G.time() : 0;
      /* word by word, each one surfacing out of the dark like the gold did */
      var words = text.split(/(\s+)/), el = $("motext"), html = "", k = 0, step = G.prefs.reduced ? 0 : Math.max(0.06, 7 / Math.max(20, G.prefs.text)), at = 0.25, starts = [];
      /* the same breaths as everyone else's words: a long one at a full stop, a short one at a comma */
      words.forEach(function (w) {
        if (/^\s+$/.test(w)) { html += w; return; }
        html += '<span class="mw" style="animation-delay:' + at.toFixed(2) + 's">' + esc(w.replace(/\*/g, "")) + "</span>"; starts.push(at); k++;
        at += step * (/[.!?\u2026]["\u201d*]*$/.test(w) ? 3.4 : /[,;:\u2014]["\u201d*]*$/.test(w) ? 1.8 : 1);
      });
      el.innerHTML = html;
      var total = at + 0.9, chimeT = [];
      for (var q = 0; q < k; q += 3) chimeT.push(setTimeout(function () { A.sfx("moword"); }, starts[q] * 1000));
      var t = { full: text, el: el, done: false, readyAt: 0, timer: setTimeout(function () { t.done = true; t.readyAt = performance.now() + 220; }, total * 1000) };
      t.finishNow = function () { t.done = true; t.readyAt = performance.now() + 300; el.querySelectorAll(".mw").forEach(function (s) { s.style.animationDelay = "0s"; s.style.animationDuration = ".25s"; }); chimeT.forEach(clearTimeout); };
      talk = { t: t, res: function () { m.classList.remove("on"); G.moOn = null; chimeT.forEach(clearTimeout); res(); } };
      $("live").textContent = text;
    });
  };
  /* the reasonable voice: it does not wait for you to finish looking */
  G.cynic = function (text, life) {
    var layer = $("cyn"), d = document.createElement("div");
    d.className = "cy"; d.textContent = text;
    d.style.left = (8 + Math.random() * 60) + "%"; d.style.top = (14 + Math.random() * 56) + "%";
    d.style.animationDuration = (life || 6) + "s";
    layer.appendChild(d); A.sfx("cynic");
    setTimeout(function () { d.remove(); }, (life || 6) * 1000);
  };
  G.choice = function (prompt, opts) {
    return new Promise(function (res) {
      var c = $("choice"); c.classList.add("on");
      $("cprompt").textContent = prompt || "";
      var list = $("copts"); list.innerHTML = "";
      var idx = 0, btns = [];
      opts.forEach(function (o, i) {
        var b = document.createElement("button"); b.className = "copt"; b.innerHTML = fmt(o);
        b.addEventListener("click", function () { pick(i); });
        list.appendChild(b); btns.push(b);
      });
      function sel(i) { idx = (i + btns.length) % btns.length; btns.forEach(function (b, k) { b.classList.toggle("sel", k === idx); }); }
      function pick(i) { A.sfx("ui"); c.classList.remove("on"); G.choosing = null; res(i); }
      sel(0);
      G.choosing = { sel: function (d) { sel(idx + d); A.sfx("blip"); }, pick: function () { pick(idx); } };
      setTimeout(function () { btns[0] && btns[0].focus({ preventScroll: true }); }, 30);
    });
  };
  function advance() {
    if (!talk) return false;
    if (!talk.t.done) { finish(talk.t); return true; }
    if (talk.t.readyAt && performance.now() < talk.t.readyAt) return true;     // a beat before it will go on
    var r = talk.res; talk = null; A.sfx("ui"); r(); return true;
  }
  G.advance = advance;
  ["dlg", "narr", "mo"].forEach(function (id) { $(id).addEventListener("click", function () { advance(); }); });

  G.wait = function (ms) { return new Promise(function (r) { setTimeout(r, G.skipWaits ? 0 : ms); }); };
  G.fade = function (on, ms) {
    return new Promise(function (r) {
      var f = $("fade"); f.style.transitionDuration = (ms || 600) + "ms";
      f.classList.toggle("on", on); setTimeout(r, G.skipWaits ? 0 : (ms || 600));
    });
  };

  /* the moment a thing becomes yours */
  /* the moment a thing becomes yours: Wren holds it up in a pool of light,
     the world hushes, then the card */
  G.item = function (o) {
    return new Promise(function (res) {
      A.sfx("found");
      if (G.prefs.haptics && navigator.vibrate) navigator.vibrate([20, 40, 30]);
      var ic0 = BS.wc(24, 24, 6); if (BS.icons && BS.icons[o.icon]) BS.icons[o.icon](ic0.getContext("2d"), 144);
      G.holdUp = { icon: ic0, t0: time };
      G.p.dir = 0; G.p.frame = 0;
      setTimeout(function () { if (G.burst) G.burst(G.p.x, G.p.y - 34, 30, "255,220,130", 20); }, G.skipWaits ? 0 : 520);
      setTimeout(card, G.skipWaits || G.prefs.reduced ? 0 : 1250);
      function card() {
      if (BS.inspect) { BS.inspect.show(o).then(function () { G.holdUp = null; res(); }); return; }
      var m = $("get");
      $("gkick").textContent = o.kind || "Found";
      $("gname").textContent = o.name;
      $("gsci").innerHTML = o.sci ? "<b>" + o.sci + "</b>" : "";
      $("gtext").innerHTML = fmt(o.text || "");
      $("gopens").innerHTML = o.opens ? "<span>Opens</span> " + fmt(o.opens) : "";
      var ic = $("gicon").getContext("2d"); ic.clearRect(0, 0, 96, 96);
      if (BS.icons && BS.icons[o.icon]) BS.icons[o.icon](ic, 96);
      m.classList.add("on");
      G.modal = function () { m.classList.remove("on"); G.modal = null; G.holdUp = null; res(); };
      $("gok").focus({ preventScroll: true });
      }
    });
  };
  $("gok").addEventListener("click", function () { if (G.modal) G.modal(); });

  G.chapter = function (n, title) {
    return new Promise(function (res) {
      var c = $("chap"); $("chn").textContent = n; $("cht").textContent = title;
      var CH = BS.story && BS.story.CHAPTERS, prev = null;
      if (CH) for (var i = 1; i < CH.length; i++) if (CH[i][1] === title) prev = CH[i - 1];
      var done = $("chdone");
      if (prev) { done.hidden = false; done.innerHTML = "<b>✓</b> Chapter " + prev[0] + " · " + prev[1] + " <span>" + Object.keys(G.s.items).length + " keys · " + Object.keys(G.s.seen).length + " small things seen</span>"; }
      else done.hidden = true;
      c.classList.add("on"); A.sfx("chapter");
      setTimeout(function () { c.classList.remove("on"); setTimeout(res, 700); }, G.skipWaits ? 10 : prev ? 4200 : 3200);
    });
  };

  /* ---------------- moving people about (for scenes) ---------------- */
  G.walkTo = function (who, tx, ty, speed) {
    var e = who === "player" ? G.p : G.ent(who);
    return new Promise(function (res) {
      if (!e) return res();
      e.goal = { x: tx * T, y: ty * T, v: speed || 52, res: res };
      if (G.skipWaits) { e.x = e.goal.x; e.y = e.goal.y; e.goal = null; res(); }
    });
  };
  function stepGoal(e, dt) {
    var g = e.goal; if (!g) return false;
    var dx = g.x - e.x, dy = g.y - e.y, d = Math.hypot(dx, dy);
    if (d < 1.5) { e.x = g.x; e.y = g.y; e.goal = null; e.moving = false; g.res(); return true; }
    var v = Math.min(d, g.v * dt);
    e.x += dx / d * v; e.y += dy / d * v;
    e.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 3) : (dy > 0 ? 0 : 1);
    e.walk = (e.walk || 0) + v; e.frame = Math.floor(e.walk / 6) % 4; e.moving = true;
    return true;
  }

  /* ---------------- changing maps ---------------- */
  G.go = function (id, tx, ty, dir, opts) {
    opts = opts || {};
    var run = function () {
      if (G.mode === "lens") { $("lens").classList.remove("on"); G.lensState = null; G.mode = "walk"; }
      G.mapId = id; G.map = G.maps[id];
      G.p.x = tx * T; G.p.y = ty * T; if (dir != null) G.p.dir = dir;
      G.p.trail = [];
      G.s.visited[id] = 1;
      if (opts.instant) G.sky.snap = true;
      var f = G.ent("beck"); if (f && f.follow) { f.map = id; f.x = G.p.x; f.y = G.p.y + 2; }
      G.looks = BS.lens.LOOKS.filter(function (l) { return l.where && l.where[0] === id; });
      if (BS.story && BS.story.enter) BS.story.enter(id);
      G.hud();
      setAmbience();
    };
    if (opts.instant) { run(); return Promise.resolve(); }
    G.cut++;
    return G.fade(true, 350).then(function () { run(); return G.wait(80); }).then(function () { return G.fade(false, 450); }).then(function () { G.cut--; });
  };
  function setAmbience() {
    var m = G.map, tod = G.s.tod, night = tod === "night" || tod === "dusk";
    var name;
    if (G.ambOverride) name = G.ambOverride;
    else if (G.mapId === "house") name = G.s.flags.dadAsleep || night ? "housequiet" : "house";
    else if (G.mapId === "cellar") name = "cellar";
    else if (G.mapId === "shed") name = "shed";
    else {
      var y = G.p.y / T, x = G.p.x / T, h = G.maps.hill;
      if (inRect(x, y, h.pond, 3)) name = "pond";
      else if (y > 52) name = "woods";
      else if (inRect(x, y, h.pit, 4)) name = "pit";
      else name = "garden";
    }
    A.ambience(name, night);
    var mood = G.musicOverride || (G.mapId === "cellar" ? "dark" : night ? "night" : (G.p.y / T > 52 && G.mapId === "hill") ? "cool" : "warm");
    A.music(mood);
  }
  G.setAmbience = setAmbience;
  function inRect(x, y, r, pad) { pad = pad || 0; return r && x >= r.x - pad && y >= r.y - pad && x < r.x + r.w + pad && y < r.y + r.h + pad; }
  G.inRect = inRect;

  /* ---------------- modes ---------------- */
  G.mode = "title";
  G.cut = 0;
  G.minis = {};

  /* the lens */
  var lensC = $("lenscv"), lensX = lensC.getContext("2d"), lensT = 0;
  G.lensState = null;
  G.openLens = function (forced) {
    if (!G.s.items.lens) return;
    if (G.s.battery < 1 && !forced) { G.toast("The phone is dead. It needs charge — a crank, or a hill."); A.sfx("nosignal"); return; }
    var target = forced || pickLook();
    G.lensState = { look: target.look, scene: target.scene, st: target.st || {}, ctrl: target.ctrl || null, t: 0 };
    lensT = 0;
    $("lens").classList.add("on"); G.lensOpenedAt = performance.now();
    $("lhint").textContent = document.body.classList.contains("touch") ? "Tap anywhere to look up" : "L, E or click to look up";
    $("lname").textContent = target.look ? target.look.name : target.label || "Close up";
    $("lnote").hidden = true; $("lnew").hidden = true;
    if (target.look && !G.s.seen[target.look.id]) {
      G.s.seen[target.look.id] = Date.now(); G.freshSeen = true;
      $("lnew").hidden = false;
      $("lnote").hidden = false; $("lnote").innerHTML = fmt(target.look.note);
      A.sfx("seen");
      G.s.lensCount = (G.s.lensCount || 0) + 1;
    } else if (target.look) { $("lnote").hidden = false; $("lnote").innerHTML = fmt(target.look.note); }
    if (!forced) G.s.battery = Math.max(0, G.s.battery - 0.5);
    G.mode = "lens"; G.hud();
    A.sfx("plink");
    if (BS.story && BS.story.onLook) BS.story.onLook(target.look ? target.look.id : null, target);
  };
  /* a tap anywhere looks up again (phones have no L or E) */
  $("lens").addEventListener("click", function () { if (G.mode === "lens" && G.lensState && !G.lensState.lock && performance.now() - (G.lensOpenedAt || 0) > 400) { A.sfx("back"); G.closeLens(); } });
  G.closeLens = function () {
    $("lens").classList.remove("on"); G.mode = "walk"; var st = G.lensState; G.lensState = null;
    if (G.freshSeen) { G.freshSeen = false; if (BS.ui && BS.ui.flyToBook) BS.ui.flyToBook(); }
    if (BS.story && BS.story.onLookClose) BS.story.onLookClose(st);
  };
  function pickLook() {
    var p = G.p, fx = p.x + [0, 0, 10, -10][p.dir], fy = p.y - 4 + [10, -12, 0, 0][p.dir];
    var best = null, bd = 34;
    G.looks.forEach(function (l) {
      if (l.after && !G.s.flags["b_" + l.after]) return;
      var lx = l.where[1] * T + 8, ly = l.where[2] * T + 8, d = Math.hypot(lx - fx, ly - fy);
      if (d < bd) { bd = d; best = l; }
    });
    if (BS.story && BS.story.lensOverride) { var o = BS.story.lensOverride(best); if (o) return o; }
    if (best) return { look: best, scene: best.scene };
    if (!G.s.seen.hand) return { look: BS.lens.byId.hand, scene: "skin" };
    var t = G.map.get(Math.floor(fx / T), Math.floor(fy / T));
    return { scene: BS.lens.surface(t), label: surfaceName(t) };
  }
  function surfaceName(t) {
    var n = BS.lens.surface(t);
    return { grass: "Grass, close", sand: "Grit and sand", litter: "Leaf litter", grain: "Old floorboard", stone: "Stone", diatom: "Water", skin: "The back of my hand" }[n] || "Close up";
  }
  G.lensNear = function () {
    var p = G.p, fx = p.x, fy = p.y - 4;
    for (var i = 0; i < G.looks.length; i++) { var l = G.looks[i]; if (l.after && !G.s.flags["b_" + l.after]) continue; if (!G.s.seen[l.id] && Math.hypot(l.where[1] * T + 8 - fx, l.where[2] * T + 8 - fy) < 40) return l; }
    return null;
  };

  /* ---------------- update ---------------- */
  var last = 0, acc = 0, time = 0;
  G.time = function () { return time; };
  function update(dt) {
    pollPad();
    time += dt;
    G.s.playMs += dt * 1000;
    if (capT > 0) { capT -= dt; if (capT <= 0) $("caption").classList.remove("on"); }

    /* words first: act advances whatever is being said */
    if (G.modal) { if (G.tap("act") || G.tap("menu")) G.modal(); G.clearTaps(); return; }
    if (G.choosing) {
      if (G.tap("up") || G.tap("left")) G.choosing.sel(-1);
      if (G.tap("down") || G.tap("right")) G.choosing.sel(1);
      if (G.tap("act")) G.choosing.pick();
      G.clearTaps(); animate(dt); return;
    }
    if (talk) { if (G.tap("act")) advance(); G.clearTaps(); animate(dt); return; }

    if (G.mode === "title") { G.clearTaps(); return; }
    if (G.mode === "book" || G.mode === "menu") { if (G.tap("menu") || G.tap("book")) { BS.ui.closeAll(); } G.clearTaps(); return; }
    if (G.mode === "lens") {
      lensT += dt;
      var LS = G.lensState;
      if (LS && LS.ctrl) LS.ctrl(dt, LS);
      if (LS && !LS.lock && (G.tap("lens") || G.tap("act") || G.tap("menu"))) G.closeLens();
      G.clearTaps(); animate(dt); return;
    }
    if (G.minis[G.mode]) { G.minis[G.mode].update(dt); G.clearTaps(); animate(dt); return; }

    if (G.tap("menu")) { BS.ui.open("menu"); G.clearTaps(); return; }
    if (!G.cut && G.tap("book") && G.s.items.book) { BS.ui.open("book"); G.clearTaps(); return; }

    /* walking */
    var p = G.p, ax = 0, ay = 0;
    if (!G.cut && !G.freeze) {
      ax = (G.held("right") ? 1 : 0) - (G.held("left") ? 1 : 0) + G.input.ax;
      ay = (G.held("down") ? 1 : 0) - (G.held("up") ? 1 : 0) + G.input.ay;
    }
    var mag = Math.hypot(ax, ay);
    if (mag > 1) { ax /= mag; ay /= mag; mag = 1; }
    if (G.sitting && mag > 0.1) { G.sitting = false; p.y = 15 * T + 22; A.sfx("creak"); }
    if (p.goal) stepGoal(p, dt);
    else if (mag > 0.1) {
      var sp = (G.held("run") || mag > 0.95 && G.input.ax !== 0 ? 1 : 0) ? 92 : 64;
      if (G.map.cold && G.eyes.adapt < 0.4 && !G.lamp.level) sp = 34;     // feeling your way in the black
      if (G.held("crank")) sp *= 0.55;
      sp *= mag;
      var ox = p.x, oy = p.y;
      var ease = Math.min(1, dt * 16);
      p.vx = (p.vx || 0) + (ax * sp - (p.vx || 0)) * ease; p.vy = (p.vy || 0) + (ay * sp - (p.vy || 0)) * ease;
      move(p, p.vx * dt, p.vy * dt);
      var moved = Math.hypot(p.x - ox, p.y - oy);
      p.dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 2 : 3) : (ay > 0 ? 0 : 1);
      p.walk += moved; p.frame = Math.floor(p.walk / 7) % 4; p.moving = moved > 0.05;
      if (p.moving && Math.floor((p.walk - moved) / 14) !== Math.floor(p.walk / 14)) {
        var t = G.map.get(Math.floor(p.x / T), Math.floor(p.y / T));
        var surf = BS.SURFACE(t);
        A.sfx("step", G.map.outdoor && (t === TL.LONG || t === TL.FIELD && Math.random() < 0.5) ? "long" : surf);
        if (surf === "sand" || surf === "gravel" || surf === "leaves" || (surf === "grass" && G.map.outdoor)) G.puff(p.x + (Math.random() - 0.5) * 4, p.y, surf);
        if (G.mapId === "house" && Math.floor(p.x / T) === G.map.groan.x && Math.floor(p.y / T) === G.map.groan.y) A.sfx("groan");
      }
      p.still = 0;
      p.trail.push([p.x, p.y]); if (p.trail.length > 60) p.trail.shift();
    } else { p.moving = false; p.frame = 0; p.still += dt; p.vx = p.vy = 0; }
    if (!p.moving && !p.goal) p.frame = 0;
    if (G.mapId === "hill") { var by = G.p.y / T; if ((by > 52) !== G._inWoods || G._inPit !== inRect(G.p.x / T, by, G.maps.hill.pit, 4) || G._inPond !== inRect(G.p.x / T, by, G.maps.hill.pond, 3)) { G._inWoods = by > 52; G._inPit = inRect(G.p.x / T, by, G.maps.hill.pit, 4); G._inPond = inRect(G.p.x / T, by, G.maps.hill.pond, 3); setAmbience(); } }
    A.listen(p.x, p.y);

    updLamp(dt);
    updEyes(dt);

    /* exits you walk into */
    if (!G.cut) {
      var tx = Math.floor(p.x / T), ty = Math.floor((p.y - 2) / T);
      G.map.exits.forEach(function (ex) {
        if (ex.x === tx && ex.y === ty && !BS.SOLID[G.map.get(ex.x, ex.y)]) useExit(ex);
      });
    }
    /* triggers */
    if (!G.cut) G.zones.forEach(function (z) {
      if (z.done || z.map !== G.mapId) return;
      var x = p.x / T, y = p.y / T;
      if (x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1 && (!z.when || z.when())) { if (z.once !== false) z.done = true; z.run(); }
    });

    /* what you could do here */
    var near = G.cut ? null : nearest(); G.nearSpot = near;
    var pr = $("prompt");
    if (near) { pr.innerHTML = '<kbd>' + (document.body.classList.contains("touch") ? "A" : "E") + "</kbd> " + (typeof near.label === "function" ? near.label() : near.label); pr.classList.add("on"); }
    else if (!G.cut && G.s.items.lens && G.lensNear()) { pr.innerHTML = '<kbd>' + (document.body.classList.contains("touch") ? "Look" : "L") + "</kbd> Something small here — look closer"; pr.classList.add("on"); }
    else pr.classList.remove("on");
    if (!G.cut && G.tap("act") && near) { A.sfx("ui"); if (G.burst && near.x != null) G.burst(near.x * T, near.y * T - 6, 8, "255,236,180", 18); near.act(); }
    if (!G.cut && G.tap("lens")) {
      if (G.s.items.lens) G.openLens();
      else if (G.s.items.phone !== false) { G.phoneGlare = 0.8; G.eyes.adapt *= 0.4; G.toast(G.s.battery > 0 ? "No Service · " + Math.round(G.s.battery) + "%" : "The screen stays black. A flat dead stone."); A.sfx("nosignal"); }
    }

    /* how long since anything moved forward */
    var pk = (G.s.objective || "") + "|" + Object.keys(G.s.flags).length + "|" + Object.keys(G.s.items).length + "|" + Object.keys(G.s.seen || {}).length;
    if (pk !== G.stuckKey) { G.stuckKey = pk; G.stuckT = 0; G.stuckSaid = false; } else if (!G.cut) G.stuckT = (G.stuckT || 0) + dt;
    if (BS.story && BS.story.update) BS.story.update(dt);
    animate(dt);
    G.clearTaps();
  }
  function useExit(ex) {
    if (BS.story && BS.story.locked && BS.story.locked(ex.lock || ex.to, ex)) return;
    A.sfx(G.mapId === "house" && ex.to === "cellar" ? "latch" : "door");
    G.go(ex.to, ex.tx, ex.ty, ex.dir === "up" ? 1 : 0);
  }
  G.useExit = useExit;
  function nearest() {
    var p = G.p, fx = p.x + [0, 0, 12, -12][p.dir], fy = p.y - 3 + [12, -14, 0, 0][p.dir];
    var best = null, bd = 99;
    G.spots.forEach(function (s) {
      if (s.map !== G.mapId || (s.when && !s.when())) return;
      var sx = s.x * T, sy = s.y * T, d = Math.min(Math.hypot(sx - fx, sy - fy), Math.hypot(sx - p.x, sy - p.y) + 6);
      if (d < (s.r || 18) && d < bd) { bd = d; best = s; }
    });
    G.map.exits.forEach(function (ex) {
      if (!BS.SOLID[G.map.get(ex.x, ex.y)]) return;
      var sx = ex.x * T + 8, sy = ex.y * T + 12, d = Math.hypot(sx - fx, sy - fy);
      if (d < 18 && d < bd) { bd = d; best = { label: ex.label, act: function () { useExit(ex); } }; }
    });
    /* nothing else to do here? a tree is always worth a shake */
    if (!best && G.mapId === "hill" && decor.trees) decor.trees.forEach(function (t) {
      var d = Math.hypot(t.x - fx, t.y - 4 - fy);
      if (d < 20 && d < bd) { bd = d; best = { label: "Shake the tree", act: function () { shakeTree(t); } }; }
    });
    return best;
  }
  /* everyone else: walking, following, leading */
  function animate(dt) {
    G.ents.forEach(function (e) {
      if (e.map !== G.mapId) return;
      if (stepGoal(e, dt)) return;
      if (e.follow && !G.cut) {
        var tr = G.p.trail, tgt = tr.length > 14 ? tr[tr.length - 14] : null;
        if (tgt) {
          var dx = tgt[0] - e.x, dy = tgt[1] - e.y, d = Math.hypot(dx, dy);
          if (d > 2) { var v = Math.min(d, 96 * dt); e.x += dx / d * v; e.y += dy / d * v; e.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 3) : (dy > 0 ? 0 : 1); e.walk = (e.walk || 0) + v; e.frame = Math.floor(e.walk / 7) % 4; }
          else e.frame = 0;
        }
      } else if (e.lead && e.lead.length && !G.cut) {
        /* lead the way, and wait for whoever is following */
        var wp = e.lead[0], gx = wp[0] * T, gy = wp[1] * T, ddx = gx - e.x, ddy = gy - e.y, dd = Math.hypot(ddx, ddy);
        var far = Math.hypot(G.p.x - e.x, G.p.y - e.y);
        if (far > 58) { e.frame = 0; e.dir = Math.abs(G.p.x - e.x) > Math.abs(G.p.y - e.y) ? (G.p.x > e.x ? 2 : 3) : (G.p.y > e.y ? 0 : 1); if (e.onWait) e.onWait(); }
        else if (dd < 2) { e.lead.shift(); if (!e.lead.length && e.onArrive) e.onArrive(); }
        else { var vv = Math.min(dd, 58 * dt); e.x += ddx / dd * vv; e.y += ddy / dd * vv; e.dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? 2 : 3) : (ddy > 0 ? 0 : 1); e.walk = (e.walk || 0) + vv; e.frame = Math.floor(e.walk / 7) % 4; }
      }
      if (e.tick) e.tick(dt, e);
    });
  }

  /* ---------------- render ---------------- */
  /* A small lit diorama: painted ground in chunks, everything that stands
     up sorted by its feet, the canopy over all, then light, then a lens:
     clouds' shadows drifting over the field, sunbeams in the woods, a soft
     grade, and a tilt-shift focus so the hill reads as a little real thing
     on a table. Everything is drawn in world units under one scale (K). */
  var cam = { x: 0, y: 0, tx: 0, ty: 0, snap: true };
  G.cam = cam;
  var creatures = [];
  function camera(dt) {
    var m = G.map, mw = m.w * T, mh = m.h * T;
    var p = G.p, ahead = G.mode === "ride" ? 34 : 10;
    var lookX = (p.vx || 0) / 92 * ahead, lookY = (p.vy || 0) / 92 * ahead;
    /* the open part of the screen: below the HUD and goal card, above the
       touch controls. Keep the player in the middle of that, and let the
       camera run past the edge of a room so they never hide under the UI */
    var touch = document.body.classList.contains("touch") && G.mode !== "title";
    var padT = (touch ? 196 : 56) / SC, padB = (touch ? 230 : 36) / SC, avail = Math.max(40, VH - padT - padB);
    var tx = p.x + lookX - VW / 2, ty = p.y - 10 + lookY - padT - avail / 2;
    if (G.camFocus) { tx = G.camFocus.x - VW / 2; ty = G.camFocus.y - VH / 2; padT = padB = 0; avail = VH; }
    tx = mw <= VW ? (mw - VW) / 2 : Math.max(0, Math.min(mw - VW, tx));
    ty = mh <= avail ? (mh - avail) / 2 - padT : Math.max(-padT, Math.min(mh - VH + padB, ty));
    if (cam.snap || cam.map !== G.mapId) { cam.x = tx; cam.y = ty; cam.snap = false; cam.map = G.mapId; }
    else { var k = Math.min(1, dt * (G.mode === "ride" ? 9 : 6)); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; }
    cam.vx = cam.x; cam.vy = cam.y;
    if (G.shake > 0 && !G.prefs.reduced) { cam.x += (Math.random() - 0.5) * G.shake * 0.6; cam.y += (Math.random() - 0.5) * G.shake * 0.6; }
  }
  G.snapCam = function () { cam.snap = true; };
  var props = null;
  function buildProps() {
    var h = G.maps.hill;
    h.piles = h.piles || [[60, 36, 4, 4], [60, 41, 4, 5], [65, 44, 4, 4], [73, 40, 2, 2]];
    props = {
      house: BS.paintHouse(h.house.w, h.house.h), shed: BS.paintShed(h.shed.w, h.shed.h), beck: BS.paintBeckHouse(h.beck.w, h.beck.h),
      trailer: BS.paintTrailer(h.trailer.w, h.trailer.h), pipes: BS.paintPipes(2), beech: BS.paintBeech(), giant: BS.paintGiant(h.giant.w),
      rock: BS.paintRock(), compost: BS.paintCompost(), loader: BS.paintLoader(), truck: BS.paintTruck(),
      seed: [0, 1, 2, 3, 4, 5].map(BS.paintSeedling)
    };
    G.props = props;
    buildDecor();
  }
  function img(c, x, y) { ctx.drawImage(c, x - cam.x, y - cam.y, c.w || c.width, c.h || c.height); }
  function place(c, x, bottom) { img(c, x, bottom - (c.base || c.h || c.height)); }
  G.img = img;
  G.blit = function (c2, sp, x, y) { c2.drawImage(sp, x, y, sp.w || sp.width, sp.h || sp.height); };
  function visible(x, y, pad) { return x > cam.x - pad && x < cam.x + VW + pad && y > cam.y - pad && y < cam.y + VH + pad * 2; }
  var wind = 0;
  /* everything that stands up throws a shadow: collected as the scene is
     listed, then cast all at once along the sun before anything is drawn */
  var occ = [];
  function occPlace(c, x, bottom, k) { occ.push({ c: c, x: x, top: bottom - (c.base || c.h || c.height), gy: bottom, k: k || 1 }); }
  function drawables() {
    var list = [], h = G.maps.hill;
    occ.length = 0;
    if (G.mapId === "hill") {
      /* (the last number: how much of the picture is real height — a roof seen from above is mostly depth, not height) */
      [[props.house, h.house.x * T, (h.house.y + h.house.h) * T, 0.32], [props.shed, h.shed.x * T, (h.shed.y + h.shed.h) * T, 0.38], [props.beck, h.beck.x * T, (h.beck.y + h.beck.h) * T, 0.34], [props.trailer, h.trailer.x * T, (h.trailer.y + h.trailer.h) * T, 0.5],
        [props.beech, h.beech.x * T - 12, (h.beech.y + 2) * T + 6, 0.9], [props.giant, h.giant.x * T - 2, (h.giant.y + 2) * T + 8, 0.4], [props.rock, h.rock.x * T - 3, (h.rock.y + 1) * T + 2, 0.6], [props.compost, 48 * T - 2, 21 * T + 4, 0.6]].forEach(function (o) { if (visible(o[1], o[2], 260)) occPlace(o[0], o[1], o[2], o[3]); });
      [[65, 37], [69, 36], [70, 41], [68, 45]].forEach(function (pp) { if (visible(pp[0] * T, pp[1] * T, 120)) occPlace(props.pipes, pp[0] * T - 2, (pp[1] + 1) * T + 2); });
      list.push({ y: (h.house.y + h.house.h) * T, d: function () { place(props.house, h.house.x * T, (h.house.y + h.house.h) * T); } });
      list.push({ y: (h.shed.y + h.shed.h) * T, d: function () { place(props.shed, h.shed.x * T, (h.shed.y + h.shed.h) * T); } });
      list.push({ y: (h.beck.y + h.beck.h) * T, d: function () { place(props.beck, h.beck.x * T, (h.beck.y + h.beck.h) * T); } });
      list.push({ y: (h.trailer.y + h.trailer.h) * T, d: function () { place(props.trailer, h.trailer.x * T, (h.trailer.y + h.trailer.h) * T); } });
      [[65, 37], [69, 36], [70, 41], [68, 45]].forEach(function (pp) { list.push({ y: (pp[1] + 1) * T, d: function () { place(props.pipes, pp[0] * T - 2, (pp[1] + 1) * T + 2); } }); });
      list.push({ y: (h.beech.y + 2) * T, d: function () { place(props.beech, h.beech.x * T - 12, (h.beech.y + 2) * T + 6); } });
      list.push({ y: (h.giant.y + 2) * T, d: function () { place(props.giant, h.giant.x * T - 2, (h.giant.y + 2) * T + 8); for (var i = 0; i < 12; i++) img(props.seed[i % 6], h.giant.x * T + 20 + i * 12 + Math.sin(time * 1.3 + i) * 0.3, h.giant.y * T - 8 + (i % 2)); } });
      list.push({ y: (h.rock.y + 1) * T, d: function () { place(props.rock, h.rock.x * T - 3, (h.rock.y + 1) * T + 2); } });
      list.push({ y: 21 * T, d: function () { place(props.compost, 48 * T - 2, 21 * T + 4); } });
      decor.trees.forEach(function (t) {
        if (visible(t.x, t.y, 160)) { occ.push({ c: t.c, x: t.x - t.c.w / 2, top: t.y - 14 - t.c.h + 10, gy: t.y, lift: 4 }); occ.push({ trunk: true, x: t.x, gy: t.y, hgt: 18 }); }
        if (!visible(t.x, t.y, 50)) return;
        list.push({ y: t.y, d: function () {
          var sx = t.x - cam.x, sy = t.y - cam.y;
          /* a trunk with a flared foot, bark lines and a lit side */
          ctx.fillStyle = BS.lg(ctx, sx - 3.5, 0, sx + 3.5, 0, [[0, "#9a7a54"], [0.45, "#6a4c30"], [1, "#3a2818"]]);
          ctx.beginPath(); ctx.moveTo(sx - 2.6, sy - 18); ctx.lineTo(sx + 2.6, sy - 18); ctx.quadraticCurveTo(sx + 2.8, sy - 3, sx + 5, sy + 1); ctx.lineTo(sx - 5, sy + 1); ctx.quadraticCurveTo(sx - 2.8, sy - 3, sx - 2.6, sy - 18); ctx.fill();
          ctx.strokeStyle = "rgba(40,26,14,.45)"; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(sx - 0.8, sy - 16); ctx.lineTo(sx - 1.1, sy - 4); ctx.moveTo(sx + 1, sy - 14); ctx.lineTo(sx + 0.7, sy - 2); ctx.stroke();
          ctx.save(); ctx.translate(t.x - cam.x, t.y - 14 - cam.y); if (!G.prefs.reduced) { t.shake = Math.max(0, (t.shake || 0) - 0.016 * 1.4); ctx.rotate(Math.sin(time * 0.8 + t.x) * 0.01 + (G.gust ? G.gust(t.x, t.y) : 0) * 0.04 + Math.sin(time * 34) * t.shake * t.shake * 0.07); }
          ctx.drawImage(t.c, -t.c.w / 2, -t.c.h + 10, t.c.w, t.c.h); ctx.restore();
        } });
      });
      var sway = G.prefs.reduced ? 0 : 1;
      decor.lav.forEach(function (l) { if (visible(l.x, l.y, 30)) list.push({ y: l.y, d: function () { var g = G.gust ? G.gust(l.x, l.y) : 0; lean(l.c, l.x, l.y, (Math.sin(time * 1.6 + l.ph) * 0.06 + g * 0.25) * sway + bend(l)); } }); });
      decor.tufts.forEach(function (tf) { if (visible(tf.x, tf.y, 20)) list.push({ y: tf.y, d: function () { var g = G.gust ? G.gust(tf.x, tf.y) : 0; lean(tf.c, tf.x, tf.y, (Math.sin(time * 1.9 + tf.ph + tf.x * 0.03) * 0.06 + 0.04 + g * 0.42) * sway + bend(tf), g); } }); });
    }
    G.ents.forEach(function (e) {
      if (e.map !== G.mapId || e.hidden) return;
      if (!e.draw) occ.push({ c: BS.sprite(e.who, e.dir, e.frame || 0), x: e.x - 8, top: e.y - 23.4, gy: e.y });
      list.push({ y: e.y, d: function () { drawEnt(e); } });
    });
    if (G.mapId === "hill" && BS.cine && BS.cine.sorted) BS.cine.sorted(list, ctx, cam, time);
    if (!G.hidePlayer) { list.push({ y: G.p.y + 0.1, d: drawPlayer }); if (G.mode !== "ride" && !G.sitting) occ.push({ c: BS.sprite(G.p.who, G.p.dir, G.p.frame), x: G.p.x - 8, top: G.p.y - 23.4, gy: G.p.y }); }
    creatures.forEach(function (c) { if (c.map === G.mapId && !c.hidden) list.push({ y: c.y + 20, d: function () { shadowAt(c.x, c.y + (c.kind === "frog" ? 3 : 12), 2.4, 0.18); img(BS.paintBug(c.kind, Math.floor(time * (c.kind === "butterfly" ? (c.blend > 0.97 ? (Math.sin(time * 1.1) > 0.55 ? 1 : 0) : 6) : 20))), c.x - 4, c.y - 4); } }); });
    puffs.forEach(function (pf) { list.push({ y: pf.y + 0.2, d: function () { drawPuff(pf); } }); });
    if (BS.juice && BS.juice.sorted) BS.juice.sorted(list, ctx, cam, time);
    if (BS.toys) BS.toys.sorted(list, ctx, cam, time);
    list.sort(function (a, b) { return a.y - b.y; });
    return list;
  }
  /* things lean away when you walk through them */
  /* shake a tree: it shivers, leaves come down, and now and then whoever
     was sitting up there leaves in a hurry */
  function shakeTree(t) {
    t.shake = 1; t.shakes = (t.shakes || 0) + 1; if (G.countOnce) G.countOnce("trees", t.x + "," + t.y);
    A.sfx("shake", t.x, t.y - 20);
    if (BS.atmos && BS.atmos.leafFall) BS.atmos.leafFall(t.x, t.y, 6 + (Math.random() * 6 | 0));
    if (G.prefs.haptics && navigator.vibrate) navigator.vibrate(18);
    if (BS.juice && BS.juice.birdOut && (t.shakes === 1 || Math.random() < 0.3) && G.s.tod !== "night" && G.s.tod !== "dusk") setTimeout(function () { BS.juice.birdOut(t.x, t.y - 26); }, 180);
  }
  function bendTo(o) {
    var dx = o.x - G.p.x, dy = o.y - G.p.y;
    if (Math.abs(dy) > 8 || Math.abs(dx) > 10) return 0;
    return (dx > 0 ? 1 : -1) * (1 - Math.abs(dx) / 10) * 0.45;
  }
  /* grass is springy: it parts as you push through, then wobbles back */
  function bend(o) {
    var to = bendTo(o), dtf = Math.min(0.05, Math.max(0, time - (o.lt || time))); o.lt = time;
    if (to && !o.was && G.p.moving && Math.random() < 0.35) A.sfx("rustle", o.x, o.y);
    o.was = !!to;
    o.bv = (o.bv || 0) + ((to - (o.ba || 0)) * 160 - (o.bv || 0) * 9) * dtf;
    o.ba = (o.ba || 0) + o.bv * dtf;
    return o.ba;
  }
  function lean(c, x, y, a, flash) {
    ctx.save(); ctx.translate(x - cam.x, y - cam.y); ctx.transform(1, 0, -a, 1, 0, 0);
    ctx.drawImage(c, -c.w / 2, -c.h, c.w, c.h);
    if (flash > 0.25) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = (flash - 0.25) * 0.5; ctx.drawImage(c, -c.w / 2, -c.h, c.w, c.h); }
    ctx.restore();
  }
  /* ---------------- cast shadows ----------------
     Each thing that stands up is drawn once more as a flat dark silhouette,
     laid down on the ground along the sun: sheared by the sun's direction,
     squashed by its height. All of them go into one half-resolution layer
     (soft edges for free, no double-darkening where shadows overlap), which
     is then tinted the color of shade at this hour and laid over the ground. */
  var shc = null, shx = null;
  function silhouette(c, small) {
    var key = small ? "_silS" : "_sil";
    if (c[key]) return c[key];
    var f = small ? 4 : 1, s = BS.cv(Math.max(1, Math.ceil(c.width / f)), Math.max(1, Math.ceil(c.height / f))), g = s.getContext("2d");
    g.imageSmoothingEnabled = true; g.drawImage(c, 0, 0, s.width, s.height); g.globalCompositeOperation = "source-in"; g.fillStyle = "#000"; g.fillRect(0, 0, s.width, s.height);
    c[key] = s; return s;
  }
  /* the sun catching the edge of a person: the rim of the silhouette that
     faces the light, in the color of the light, strongest when it's low */
  function rimOf(sp) {
    if (!G.sun) return null;
    var sx = G.sun[0], sy = G.sun[1], l = Math.hypot(sx, sy) || 1, q = Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) & 7;
    sp._rim = sp._rim || {};
    if (sp._rim[q]) return sp._rim[q];
    var a = q * Math.PI / 4, res = sp.res || 4, dx = Math.cos(a) * res * 0.9, dy = Math.sin(a) * res * 0.9;
    var c = BS.cv(sp.width, sp.height), g = c.getContext("2d");
    g.drawImage(silhouette(sp), 0, 0); g.globalCompositeOperation = "destination-out"; g.drawImage(silhouette(sp), dx, dy);
    g.globalCompositeOperation = "source-in"; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    c.w = sp.w; c.h = sp.h; sp._rim[q] = c; return c;
  }
  function rimFor(sp) {
    if (G.mapId !== "hill" || !G.sun) return null;
    var t = G.s.tod, k = t === "golden" ? 0.75 : t === "evening" ? 0.6 : t === "dawn" ? 0.5 : t === "morning" ? 0.35 : t === "night" ? 0.18 : t === "dusk" ? 0.25 : 0.22;
    var r = rimOf(sp); if (!r) return null;
    var col = t === "golden" || t === "evening" ? "rgba(255,190,110," : t === "night" || t === "dusk" ? "rgba(150,180,255," : t === "dawn" ? "rgba(255,200,210," : "rgba(255,248,225,";
    if (!r._tint || r._tintKey !== col) { var tc = BS.cv(r.width, r.height), tg = tc.getContext("2d"); tg.drawImage(r, 0, 0); tg.globalCompositeOperation = "source-in"; tg.fillStyle = col + "1)"; tg.fillRect(0, 0, tc.width, tc.height); r._tint = tc; r._tintKey = col; }
    return { c: r._tint, k: k };
  }
  function rimLight(sp, x, y) {
    if (G.mapId !== "hill" || !G.sun) return;
    var t = G.s.tod, k = t === "golden" ? 0.75 : t === "evening" ? 0.6 : t === "dawn" ? 0.5 : t === "morning" ? 0.35 : t === "night" ? 0.18 : t === "dusk" ? 0.25 : 0.22;
    var r = rimOf(sp); if (!r) return;
    var col = t === "golden" || t === "evening" ? "rgba(255,190,110," : t === "night" || t === "dusk" ? "rgba(150,180,255," : t === "dawn" ? "rgba(255,200,210," : "rgba(255,248,225,";
    if (!r._tint || r._tintKey !== col) { var tc = BS.cv(r.width, r.height), tg = tc.getContext("2d"); tg.drawImage(r, 0, 0); tg.globalCompositeOperation = "source-in"; tg.fillStyle = col + "1)"; tg.fillRect(0, 0, tc.width, tc.height); r._tint = tc; r._tintKey = col; }
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = k;
    ctx.drawImage(r._tint, x - cam.x, y - cam.y, sp.w, sp.h); ctx.restore();
  }
  function castShadows() {
    if (G.mapId !== "hill" || !G.sun || G.prefs.shadows === false) return;
    if (G.quality <= 0.56) return;               // a struggling device keeps its frame rate; shadows go first
    var sx = G.sun[0], sy = G.sun[1], str = G.sun[2] * (1 - Math.min(0.6, G.sky.dark * 0.5));
    if (str < 0.04) return;
    var W2 = Math.ceil(cvs.width / 4), H2 = Math.ceil(cvs.height / 4), K2 = K / 4;     /* quarter resolution: shadows are soft anyway */
    if (!shc || shc.width !== W2 || shc.height !== H2) { shc = BS.cv(W2, H2); shx = shc.getContext("2d"); }
    shx.setTransform(1, 0, 0, 1, 0, 0); shx.globalCompositeOperation = "source-over"; shx.clearRect(0, 0, W2, H2);
    shx.imageSmoothingEnabled = true;
    occ.forEach(function (o) {
      shx.setTransform(K2, 0, 0, K2, -cam.x * K2, -cam.y * K2);
      if (o.trunk) {
        shx.transform(1, 0, -sx, -sy, o.x + sx * o.hgt, o.gy + sy * o.hgt);
        shx.fillStyle = "#000"; shx.fillRect(-2.6, 0, 5.2, o.hgt); return;
      }
      var c = o.c, w = c.w || c.width, hh = c.h || c.height, H0 = o.gy - o.top, rows = Math.min(hh, H0), kx = sx * (o.k || 1), ky = sy * (o.k || 1);
      if (H0 <= 0) return;
      shx.transform(1, 0, -kx, -ky, o.x + kx * H0, o.gy + ky * H0);
      var sl = silhouette(c, true), srcRows = Math.max(1, Math.round(sl.height * rows / hh));
      shx.drawImage(sl, 0, 0, sl.width, srcRows, 0, 0, w, rows);
    });
    /* the color of shade: cool blue at midday, violet-blue as the light goes gold */
    shx.setTransform(1, 0, 0, 1, 0, 0); shx.globalCompositeOperation = "source-in";
    var gold = G.s.tod === "golden" || G.s.tod === "evening";
    shx.fillStyle = gold ? "rgb(40,24,70)" : G.s.tod === "night" || G.s.tod === "dusk" ? "rgb(4,8,24)" : "rgb(16,26,52)"; shx.fillRect(0, 0, W2, H2);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = Math.min(0.42, 0.38 * str + 0.04); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shc, 0, 0, cvs.width, cvs.height); ctx.restore();
  }
  /* prebuilt soft sprites: a shadow, and a glow per color */
  var shadowSpr = (function () { var c = BS.cv(64, 64), x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(20,14,8,1)"); g.addColorStop(1, "rgba(20,14,8,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c; })();
  var glowSpr = {};
  function glowOf(col) { if (glowSpr[col]) return glowSpr[col]; var c = BS.cv(32, 32), x = c.getContext("2d"), g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, "rgba(" + col + ",1)"); g.addColorStop(0.3, "rgba(" + col + ",.5)"); g.addColorStop(1, "rgba(" + col + ",0)"); x.fillStyle = g; x.fillRect(0, 0, 32, 32); glowSpr[col] = c; return c; }
  function shadowAt(x, y, w, a) {
    ctx.globalAlpha = a || 0.38;
    ctx.drawImage(shadowSpr, x - cam.x + 1 - w, y - cam.y - w * 0.38, w * 2, w * 0.76);
    ctx.globalAlpha = 1;
  }
  G.shadowAt = shadowAt;
  function blinkOf(seed) { return ((time + seed * 1.37) % 4.2) < 0.13; }
  /* a person, drawn with their body's motion (squash, stretch, lean, hop)
     about the feet, and the sun on their edge */
  function drawPerson(sp, x, y, tf) {
    if (!tf) { img(sp, x, y); rimLight(sp, x, y); return; }
    var fx = x + 8 - cam.x + (tf.dx || 0), fy = y + 23.4 - cam.y + (tf.dy || 0);
    ctx.save(); ctx.translate(fx, fy); ctx.transform(tf.sx, 0, tf.skew, tf.sy, 0, 0);
    ctx.drawImage(sp, -8, -23.4, sp.w, sp.h);
    var r = rimFor(sp); if (r) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = r.k; ctx.drawImage(r.c, -8, -23.4, sp.w, sp.h); }
    ctx.restore();
  }
  function drawEnt(e) {
    if (e.draw) { e.draw(ctx, e, cam); return; }
    shadowAt(e.x, e.y, 6.5);
    var L = BS.life, sp = BS.sprite(e.who, e.dir, e.frame || 0, blinkOf(e.id.length), L ? L.face(e.id, e) : null);
    var bob = e.frame % 2 ? -0.7 : 0;
    if (e.bob && !e.frame) bob = Math.sin(time * 2) * 0.35;
    drawPerson(sp, e.x - 8, e.y - 23.4 + bob, L ? L.tf(e.id) : null);
  }
  function drawPlayer() {
    var p = G.p;
    if (G.mode === "ride") return drawRider();
    if (G.sitting) { var sw = BS.cine && BS.cine.swingSway ? BS.cine.swingSway(time) : 0; img(BS.sprite(p.who, 0, 0, blinkOf(1)), p.x - 8 + sw, p.y - 26.5); return; }
    shadowAt(p.x, p.y, 6.5);
    if (G.holdUp) { var hk = Math.min(1, (time - G.holdUp.t0) / 0.5), ease = 1 - Math.pow(1 - hk, 3); img(BS.sprite(p.who, 0, 0), p.x - 8, p.y - 23.4 - ease * 1.5); var ic = G.holdUp.icon; ctx.save(); ctx.translate(p.x - cam.x, p.y - 30 - ease * 8 - cam.y); ctx.drawImage(ic, -9, -9, 18, 18); ctx.restore(); return; }
    var L = BS.life, sp = BS.sprite(p.who, p.dir, p.frame, !p.moving && blinkOf(1), L ? L.face("p") : null);
    var bob = p.frame % 2 ? -0.8 : 0, breathe = p.moving ? 0 : Math.sin(time * 2.2) * 0.25;
    drawPerson(sp, p.x - 8, p.y - 23.4 + bob + breathe, L ? L.tf("p") : null);
    if (G.s.items.lantern && G.lamp.level > 0.02) {
      /* the lantern in hand, its glass eye lit */
      var lxp = p.x + [5.5, -5.5, 6.5, -6.5][p.dir], lyp = p.y - 10 + (p.dir === 1 ? -2 : 0);
      ctx.fillStyle = "#d8b83a"; BS.rr(ctx, lxp - 2 - cam.x, lyp - 2.5 - cam.y, 4, 5, 1); ctx.fill();
      ctx.fillStyle = "rgba(255,248,210," + (0.5 + G.lamp.level * 0.5) + ")"; BS.ell(ctx, lxp - cam.x, lyp - cam.y, 1.2, 1.2); ctx.fill();
    }
  }
  function drawRider() {
    var r = G.ride, p = G.p;
    shadowAt(p.x, p.y + 3, 8);
    ctx.save(); ctx.translate(p.x - cam.x, p.y - cam.y);
    ctx.fillStyle = "#2a2a2a"; BS.rr(ctx, -2.6, -3, 5.2, 14, 2); ctx.fill();
    ctx.fillStyle = BS.lg(ctx, -2, 0, 2, 0, [[0, "#e04a3a"], [1, "#9a2a20"]]); BS.rr(ctx, -2, -2.4, 4, 12.6, 1.6); ctx.fill();
    ctx.fillStyle = "#151515"; BS.ell(ctx, 0, 11, 2, 1.6); ctx.fill(); BS.ell(ctx, 0, -4, 2, 1.6); ctx.fill();
    ctx.fillStyle = "#d8b83a"; BS.rr(ctx, -3, 9.5, 6, 4.5, 1.2); ctx.fill();
    ctx.fillStyle = "rgba(255,248,210," + (0.5 + G.lamp.level * 0.5) + ")"; BS.ell(ctx, 0, 12.6, 1.3, 1.1); ctx.fill();
    ctx.restore();
    var sp = BS.sprite("wren", r && r.lean > 0.3 ? 2 : r && r.lean < -0.3 ? 3 : 0, 0);
    img(sp, p.x - 8, p.y - 25.5);
  }

  /* dust where your feet go */
  var puffs = [];
  G.puff = function (x, y, surf) {
    if (G.prefs.reduced || puffs.length > 30) return;
    var col = surf === "sand" ? "232,214,170" : surf === "gravel" ? "210,190,150" : surf === "leaves" ? "140,110,70" : "220,210,150";
    puffs.push({ x: x, y: y, t: 0, life: 0.55, col: col, vx: (Math.random() - 0.5) * 8 });
  };
  function drawPuff(pf) { var k = pf.t / pf.life; ctx.fillStyle = "rgba(" + pf.col + "," + (0.35 * (1 - k)) + ")"; BS.ell(ctx, pf.x - cam.x, pf.y - 1 - k * 3 - cam.y, 1.4 + k * 3.2, 0.9 + k * 1.6); ctx.fill(); }

  /* lights: [x, y, radius, intensity, warm?] in world units */
  G.extraLights = [];
  function lights() {
    var L = [], m = G.map;
    if (G.s.items.lantern && G.lamp.level > 0.01) {
      var r = 18 + G.lamp.level * 92;
      var fl = 1 + (G.prefs.reduced ? 0 : Math.sin(time * 23) * 0.02 + Math.sin(time * 7.3) * 0.03);
      L.push([G.p.x, G.p.y - 8, r * fl, Math.min(1, 0.4 + G.lamp.level), "warm"]);
    }
    /* moonlight finds you: outdoors at night you are never lost in the dark */
    if (m.outdoor && G.sky.dark > 0.35 && !G.hidePlayer) L.push([G.p.x, G.p.y - 10, 44 + G.sky.dark * 16, 0.4 * Math.min(1, (G.sky.dark - 0.35) * 3), "moon"]);
    if (G.lamp.fixed && G.lamp.fixed.map === G.mapId) L.push([G.lamp.fixed.x, G.lamp.fixed.y, G.lamp.fixed.r, G.lamp.fixed.i, "warm"]);
    if (G.mapId === "house") {
      var tod = G.s.tod, day = !(tod === "night" || tod === "dusk");
      if (day) m.windows.forEach(function (w) { L.push([w[0] * T + 8, w[1] * T + 30, 74, tod === "evening" || tod === "golden" ? 0.85 : 1, tod === "evening" || tod === "golden" ? "gold" : "day"]); });
    }
    if (G.mapId === "shed") { L.push([5 * T, 4 * T, 130, 1, "gold"]); }
    if (G.mapId === "cellar" && !G.workLights) L.push([2.6 * T, 2.2 * T, 52, 0.32, "day"]);   // gray daylight, four steps down
    if (G.mapId === "hill") {
      var h = G.maps.hill;
      if (G.s.tod === "night" || G.s.tod === "dusk") {
        BS.beckWindows && props && BS.beckWindows.forEach(function (bw) { L.push([h.beck.x * T + bw[0] + 8, (h.beck.y + h.beck.h) * T - props.beck.base + bw[1] + 7, 30, 0.9, "warm"]); });
        L.push([67 * T + 8, 16 * T + 4, 50, 0.95, "warm"]);                    // the porch light
      }
    }
    G.extraLights.forEach(function (l) { if (!l.map || l.map === G.mapId) L.push(l.l || l); });
    return L;
  }
  function darkness() {
    var m = G.map, tod = TOD[G.s.tod];
    var dark = m.outdoor ? G.sky.dark : (m.dark || 0);
    if (G.mapId === "house" && (G.s.tod === "night" || G.s.tod === "dusk")) dark = 0.9;
    if (m.outdoor && G.p.y / T > 52) dark = Math.min(0.88, dark + 0.14);            // under the trees
    if (G.mapId === "cellar") dark = G.workLights ? 0 : 0.985 - G.eyes.adapt * 0.5;
    if (G.darkOverride != null) dark = G.darkOverride;
    return dark;
  }
  function drawLight(dark) {
    if (dark <= 0.01) return;
    var m = G.map, dc = G.mapId === "cellar" ? "4,8,6" : m.outdoor ? "8,12,34" : "12,9,14";
    lx.setTransform(LK, 0, 0, LK, 0, 0);
    lx.globalCompositeOperation = "source-over";
    lx.clearRect(0, 0, VW, VH);
    lx.fillStyle = "rgba(" + dc + "," + dark + ")"; lx.fillRect(0, 0, VW, VH);
    lx.globalCompositeOperation = "destination-out";
    lights().forEach(function (l) {
      var x = l[0] - cam.x, y = l[1] - cam.y, r = l[2], i = l[3];
      var g = lx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(0,0,0," + i + ")"); g.addColorStop(0.45, "rgba(0,0,0," + (i * 0.75) + ")"); g.addColorStop(1, "rgba(0,0,0,0)");
      lx.fillStyle = g; lx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    lx.globalCompositeOperation = "source-over";
    if (BS.cellar) BS.cellar.shadows(lx, cam, LK, lights());          // the lantern's flame throws shadows
    ctx.drawImage(light, 0, 0, VW, VH);
  }
  /* the glow pass: things that make their own light, and a soft bloom */
  function drawGlow(dark) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    lights().forEach(function (l) {
      if (l[4] !== "warm" && l[4] !== "gold") return;
      var x = l[0] - cam.x, y = l[1] - cam.y, r = l[2] * 0.75;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      var c = l[4] === "gold" ? "255,196,110" : "255,170,80";
      g.addColorStop(0, "rgba(" + c + "," + (0.22 * l[3] * (0.4 + dark)) + ")"); g.addColorStop(0.4, "rgba(" + c + "," + (0.08 * l[3]) + ")"); g.addColorStop(1, "rgba(" + c + ",0)");
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    if (BS.story && BS.story.glow) BS.story.glow(ctx, cam, dark, time);
    ctx.restore();
  }
  /* weather of light: drifting cloud shadows, shafts in the woods */
  function atmosphere(dark) {
    var m = G.map;
    if (!m.outdoor) {
      if (G.mapId === "house" && !(G.s.tod === "night" || G.s.tod === "dusk")) {
        /* sun through the windows, laid across the floor */
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        m.windows.forEach(function (w, i) {
          var x = w[0] * T + 8 - cam.x, y = w[1] * T + 14 - cam.y, gold = G.s.tod === "evening" || G.s.tod === "golden";
          var g = ctx.createLinearGradient(x, y, x + 30, y + 70);
          g.addColorStop(0, gold ? "rgba(255,200,120,.20)" : "rgba(255,244,210,.16)"); g.addColorStop(1, "rgba(255,240,200,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.lineTo(x + 36 + Math.sin(time * 0.3 + i) * 0.5, y + 74); ctx.lineTo(x + 14, y + 74); ctx.closePath(); ctx.fill();
        });
        ctx.restore();
      }
      if (G.mapId === "shed") {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        for (var s = 0; s < 5; s++) { var x0 = (1 + s * 2) * T - cam.x; var g2 = ctx.createLinearGradient(x0, 0, x0 + 40, 120); g2.addColorStop(0, "rgba(255,226,150,.16)"); g2.addColorStop(1, "rgba(255,226,150,0)"); ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(x0, -cam.y); ctx.lineTo(x0 + 2.5, -cam.y); ctx.lineTo(x0 + 62, 130 - cam.y); ctx.lineTo(x0 + 56, 130 - cam.y); ctx.fill(); }
        ctx.restore();
      }
      return;
    }
    var tod = G.s.tod, day = dark < 0.4;
    if (day && !G.prefs.reduced) {
      /* cloud shadows, slow, from the west, in world space */
      for (var k = 0; k < 5; k++) {
        var span = 1800, wx = ((time * 6 + k * 520) % span) - 260, wy = 60 + k * 240 + Math.sin(k * 3) * 60;
        var sx2 = wx - cam.x, sy2 = wy - cam.y;
        if (sx2 < -260 || sx2 > VW + 260 || sy2 < -160 || sy2 > VH + 160) continue;
        ctx.save(); ctx.translate(sx2, sy2); ctx.scale(1.7, 0.75);
        var g3 = ctx.createRadialGradient(0, 0, 10, 0, 0, 130); g3.addColorStop(0, "rgba(20,30,50,.14)"); g3.addColorStop(1, "rgba(20,30,50,0)");
        ctx.fillStyle = g3; ctx.fillRect(-130, -130, 260, 260); ctx.restore();
      }
    }
    if (day && G.p.y / T > 50 && G.mapId === "hill") {
      /* light down through the canopy gaps */
      /* each shaft leans with the sun, is soft at both edges, and thins out
         as it falls, so it reads as light in the air and never as a stream */
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (var r = 0; r < 6; r++) {
        var bx = ((r * 173 + 40) % 520) - (cam.x % 520), a = 0.045 + 0.025 * Math.sin(time * 0.5 + r * 2), w = 16 + (r % 3) * 7;
        if (bx < -VH * 0.6 - 40 || bx > VW + 40) continue;
        ctx.save(); ctx.translate(bx, 0); ctx.transform(1, 0, 0.55, 1, 0, 0);
        var g4 = ctx.createLinearGradient(0, 0, w, 0);
        g4.addColorStop(0, "rgba(255,236,170,0)"); g4.addColorStop(0.5, "rgba(255,236,170,1)"); g4.addColorStop(1, "rgba(255,236,170,0)");
        ctx.fillStyle = g4;
        for (var sgi = 0; sgi < 6; sgi++) { ctx.globalAlpha = a * (1 - sgi / 6); ctx.fillRect(0, VH * sgi / 6, w, VH / 6 + 0.5); }
        ctx.restore();
      }
      ctx.restore();
    }
  }
  function grade(dark) {
    var m = G.map;
    if (m.outdoor) { var tn = G.sky.tint; ctx.fillStyle = "rgba(" + (tn[0] | 0) + "," + (tn[1] | 0) + "," + (tn[2] | 0) + "," + tn[3].toFixed(3) + ")"; ctx.fillRect(0, 0, VW, VH); }
    /* a warm top, a cool bottom: depth in a single wash */
    ctx.save(); ctx.globalCompositeOperation = "soft-light";
    var g = ctx.createLinearGradient(0, 0, 0, VH);
    var night = G.s.tod === "night" || G.s.tod === "dusk";
    var dawnG = G.s.tod === "dawn" && G.map.outdoor;
    g.addColorStop(0, night ? "rgba(120,140,220,.45)" : dawnG ? "rgba(255,205,185,.2)" : "rgba(255,230,180,.32)"); g.addColorStop(1, night ? "rgba(20,30,70,.45)" : dawnG ? "rgba(110,120,170,.18)" : "rgba(60,80,120,.3)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
  }
  function vignette() {
    var g = ctx.createRadialGradient(VW / 2, VH * 0.48, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.max(VW, VH) * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(10,6,2,.38)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  }
  /* the diorama focus: soften the top and bottom of the frame */
  /* the lens: a soft bloom over everything (light spills a little, as it
     does on a warm evening), then the diorama focus at top and bottom */
  function tiltShift(dark) {
    var tilt = !(G.prefs.tilt === false || G.prefs.reduced && G.prefs.tilt !== true), bloom = G.prefs.bloom !== false;
    if (!tilt && !bloom) return;
    var W = cvs.width, Hh = cvs.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    bax.imageSmoothingEnabled = true; bbx.imageSmoothingEnabled = true;
    bax.drawImage(cvs, 0, 0, blurA.width, blurA.height);
    bbx.drawImage(blurA, 0, 0, blurB.width, blurB.height);
    if (bloom) {
      /* square the blurred frame so only the bright things spill light:
         highlights glow, shadows stay deep instead of going milky */
      bax.globalCompositeOperation = "multiply"; bax.drawImage(blurA, 0, 0, blurA.width, blurA.height);
      if (dark > 0.5 || G.mapId === "cellar") bax.drawImage(blurA, 0, 0, blurA.width, blurA.height);
      bax.globalCompositeOperation = "source-over";
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = G.mapId === "cellar" ? 0.55 : dark > 0.5 ? 0.45 : 0.26;
      ctx.drawImage(blurA, 0, 0, W, Hh);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
    if (!tilt) return;
    var bands = [[0, 0.3, 1], [0.74, 1, -1]], N = 9;
    bands.forEach(function (b) {
      for (var i = 0; i < N; i++) {
        var y0 = b[0] + (b[1] - b[0]) * i / N, y1 = b[0] + (b[1] - b[0]) * (i + 1) / N;
        var k = b[2] > 0 ? 1 - i / N : (i + 1) / N;
        ctx.globalAlpha = Math.min(1, k * 0.95);
        ctx.drawImage(blurB, 0, y0 * blurB.height, blurB.width, (y1 - y0) * blurB.height, 0, y0 * Hh, W, (y1 - y0) * Hh + 1);
      }
    });
    ctx.globalAlpha = 1;
  }
  /* the water's true edge: the painted shoreline wanders, so every effect on
     the water is drawn into a layer and cut to that shape, never to tiles */
  var WM = 1, wmask = null, wshore = null, wlay = null, wlx = null;
  function waterMask() {
    if (wmask) return wmask;
    var h = G.maps.hill, W = h.w * T / WM, Hh = h.h * T / WM;
    wmask = BS.cv(W, Hh); wshore = BS.cv(W, Hh);
    var mx = wmask.getContext("2d"), id = mx.createImageData(W, Hh), d = id.data;
    var sx = wshore.getContext("2d"), sd = sx.createImageData(W, Hh), s2 = sd.data;
    function ss(a, b, v) { var t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
    for (var ty = 0; ty < h.h; ty++) for (var tx = 0; tx < h.w; tx++) {
      var near = false;
      for (var dy = -1; dy <= 1 && !near; dy++) for (var dx = -1; dx <= 1; dx++) { var tt = h.get(tx + dx, ty + dy); if (tt === TL.WATER || tt === TL.SPRING) { near = true; break; } }
      if (!near) continue;
      for (var j = 0; j < T / WM; j++) for (var i = 0; i < T / WM; i++) {
        var px = tx * T / WM + i, py = ty * T / WM + j, k = (py * W + px) * 4, v = BS.wetAt(h, px * WM + WM / 2, py * WM + WM / 2, true);
        /* soft, anti-aliased edge straight from the field */
        d[k + 3] = 255 * ss(0.46, 0.54, v);
        /* the shore: a pale lapping line just inside, damp dark earth just outside */
        var lap = ss(0.5, 0.53, v) * (1 - ss(0.55, 0.6, v)), damp = ss(0.34, 0.45, v) * (1 - ss(0.49, 0.52, v));
        if (lap > damp) { s2[k] = 236; s2[k + 1] = 246; s2[k + 2] = 250; s2[k + 3] = 84 * lap; }
        else { s2[k] = 38; s2[k + 1] = 28; s2[k + 2] = 16; s2[k + 3] = 120 * damp; }
      }
    }
    mx.putImageData(id, 0, 0); sx.putImageData(sd, 0, 0);
    return wmask;
  }
  G.waterLayer = function (draw) {
    if (G.mapId !== "hill") return;
    waterMask();
    if (!wlay || wlay.width !== cvs.width || wlay.height !== cvs.height) { wlay = BS.cv(cvs.width, cvs.height); wlx = wlay.getContext("2d"); }
    wlx.setTransform(1, 0, 0, 1, 0, 0); wlx.globalCompositeOperation = "source-over"; wlx.clearRect(0, 0, wlay.width, wlay.height);
    wlx.setTransform(K, 0, 0, K, 0, 0);
    draw(wlx);
    wlx.globalCompositeOperation = "destination-in"; wlx.imageSmoothingEnabled = true;
    wlx.drawImage(wmask, -cam.x, -cam.y, wmask.width * WM, wmask.height * WM);
    wlx.globalCompositeOperation = "source-over";
    var t0 = ctx.getTransform(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(wlay, 0, 0); ctx.setTransform(t0);
  };
  function shore() {
    if (G.mapId !== "hill" || !wshore) return;
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.75 + (G.prefs.reduced ? 0 : Math.sin(time * 1.4) * 0.2);
    ctx.drawImage(wshore, -cam.x, -cam.y, wshore.width * WM, wshore.height * WM);
    ctx.restore();
  }
  function water() {
    if (G.mapId !== "hill") return;
    var saved = ctx;
    G.waterLayer(function (c) { ctx = c; waterTiles(); ctx = saved; });
    shore();
  }
  /* the water type at or beside a tile (the painted edge wanders into
     neighbors), so effects reach the true shore */
  G.nearWater = function (x, y) {
    var h = G.maps.hill, t = h.get(x, y);
    if (t === TL.WATER || t === TL.SPRING) return t;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var u = h.get(x + dx, y + dy); if (u === TL.WATER || u === TL.SPRING) return u; }
    return 0;
  };
  /* is there any water in the frame at all? */
  function onWater() {
    if (G.mapId !== "hill") return false;
    var h = G.maps.hill, x0 = Math.max(0, Math.floor(cam.x / T) - 1), y0 = Math.max(0, Math.floor(cam.y / T) - 1), x1 = Math.min(h.w, x0 + Math.ceil(VW / T) + 3), y1 = Math.min(h.h, y0 + Math.ceil(VH / T) + 3);
    for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) { var t = h.get(x, y); if (t === TL.WATER || t === TL.SPRING) return true; }
    return false;
  }
  function waterTiles() {
    var h = G.maps.hill, night = G.s.tod === "night" || G.s.tod === "dusk";
    var x0 = Math.max(0, Math.floor(cam.x / T)), y0 = Math.max(0, Math.floor(cam.y / T)), x1 = Math.min(h.w, x0 + Math.ceil(VW / T) + 2), y1 = Math.min(h.h, y0 + Math.ceil(VH / T) + 2);
    for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
      var t = G.nearWater(x, y);
      if (!t) continue;
      var sx = x * T - cam.x, sy = y * T - cam.y;
      if (night && t === TL.WATER) {
        /* the pond holds the whole sky upside down */
        ctx.fillStyle = "rgba(6,14,30,.78)"; ctx.fillRect(sx, sy, T, T);

      } else {
        for (var q = 0; q < 2; q++) {
          var ph = time * (t === TL.SPRING ? 1.8 : 0.5) + x * 1.7 + y * 0.9 + q * 3;
          ctx.fillStyle = "rgba(235,250,255," + (0.18 + 0.14 * Math.sin(ph * 2)) + ")";
          BS.ell(ctx, sx + ((ph * 6 + q * 7) % 16), sy + 4 + q * 7 + Math.sin(ph) * 1.2, 2.4, 0.35); ctx.fill();
        }
      }
    }
  }
  /* small lives in the world */
  G.creatures = creatures;
  function lifeTick(dt) {
    creatures.forEach(function (c) {
      c.t += dt;
      if (c.kind === "bee") { c.x = c.hx + Math.sin(c.t * 1.7 + c.ph) * 14 + Math.sin(c.t * 5.1) * 3; c.y = c.hy + Math.cos(c.t * 1.3 + c.ph) * 8; }
      if (c.kind === "butterfly") {
        var fx = c.hx + Math.sin(c.t * 0.25) * 70, fy = c.hy + Math.sin(c.t * 1.9) * 10 - Math.abs(Math.sin(c.t * 0.9)) * 6;
        /* stand still long enough and it comes to rest on you */
        c.blend = Math.max(0, Math.min(1, (c.blend || 0) + dt * (c.land ? 0.45 : -1.6)));
        var e = c.blend * c.blend * (3 - 2 * c.blend), lxp = G.p.x + 2.5 + Math.sin(c.t * 0.7) * 0.4, lyp = G.p.y - 20.5 + Math.sin(c.t * 2.3) * (1 - e) * 6;
        c.x = fx + (lxp - fx) * e; c.y = fy + (lyp - fy) * e - Math.sin(e * Math.PI) * 18;
      }
      if (c.kind === "fly") { c.x = c.hx + Math.cos(c.t * 3) * 10; c.y = c.hy + Math.sin(c.t * 3) * 4; }
      if (c.kind === "frog") { c.x = c.hx; c.y = c.hy + (Math.sin(c.t * 0.7 + c.hx) > 0.97 ? -2 : 0); }
    });
    A.bees = creatures.filter(function (c) { return c.kind === "bee" && c.map === G.mapId; });
    var fly = creatures.filter(function (c) { return c.kind === "fly" && c.map === G.mapId; })[0];
    A.fly = fly || null;
    puffs.forEach(function (pf) { pf.t += dt; pf.x += pf.vx * dt; }); puffs = puffs.filter(function (pf) { return pf.t < pf.life; });
    wind = 0.5 + 0.5 * Math.sin(time * 0.23) * Math.sin(time * 0.071);
  }
  /* motes: dust in the slats, fireflies at dusk, pollen at noon, spores in the cellar */
  var motes = [];
  function moteTick(dt) {
    if (G.prefs.reduced) { motes.length = 0; return; }
    var tod = G.s.tod, evening = tod === "dusk" || tod === "golden" || tod === "evening" || tod === "night";
    var want = G.mapId === "shed" ? 46 : G.mapId === "house" ? 18 : (G.mapId === "hill" && evening) ? 34 : G.mapId === "hill" ? 16 : G.mapId === "cellar" && G.eyes.adapt > 0.5 && !G.workLights ? 14 : 0;
    while (motes.length < want) motes.push({ x: cam.x + Math.random() * VW, y: cam.y + Math.random() * VH, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 3, ph: Math.random() * 6, life: 4 + Math.random() * 6 });
    if (motes.length > want) motes.length = want;
    motes.forEach(function (m) { m.x += (m.vx + Math.sin(time * 0.7 + m.ph) * 2) * dt; m.y += m.vy * dt; m.life -= dt; if (m.life < 0 || m.x < cam.x - 10 || m.x > cam.x + VW + 10 || m.y < cam.y - 10 || m.y > cam.y + VH + 10) { m.x = cam.x + Math.random() * VW; m.y = cam.y + Math.random() * VH; m.life = 4 + Math.random() * 6; } });
  }
  function drawMotes() {
    if (!motes.length) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    var tod = G.s.tod, evening = tod === "dusk" || tod === "golden" || tod === "evening" || tod === "night";
    var kind = G.mapId === "shed" || G.mapId === "house" ? "dust" : G.mapId === "cellar" ? "spore" : evening ? "fly" : "pollen";
    motes.forEach(function (m) {
      var a = kind === "fly" ? Math.max(0, Math.sin(time * 2.2 + m.ph)) : 0.35 + 0.25 * Math.sin(time + m.ph);
      var col = kind === "fly" ? "210,255,130" : kind === "spore" ? "170,240,140" : "255,236,180";
      var r = kind === "fly" ? 3.2 : 1.4, sx = m.x - cam.x, sy = m.y - cam.y;
      if (a <= 0.01) return;
      ctx.globalAlpha = a; ctx.drawImage(glowOf(col), sx - r, sy - r, r * 2, r * 2);
    });
    ctx.restore();
  }
  /* the ground, chunk by chunk, warming up the next ones in spare time */
  function drawGround() {
    var S = BS.CH * T, m = G.map;
    var cx0 = Math.floor(cam.x / S), cy0 = Math.floor(cam.y / S), cx1 = Math.floor((cam.x + VW) / S), cy1 = Math.floor((cam.y + VH) / S);
    for (var cy = cy0; cy <= cy1; cy++) for (var cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0 || cx * BS.CH >= m.w || cy * BS.CH >= m.h) continue;
      ctx.drawImage(BS.chunk(m, cx, cy), cx * S - cam.x, cy * S - cam.y, S + 0.4, S + 0.4);
    }
    /* one chunk of the ring around the view, ahead of need */
    var done = false;
    for (cy = cy0 - 1; cy <= cy1 + 1 && !done; cy++) for (cx = cx0 - 1; cx <= cx1 + 1 && !done; cx++) {
      if (cx < 0 || cy < 0 || cx * BS.CH >= m.w || cy * BS.CH >= m.h) continue;
      if (!BS.hasChunk(m, cx, cy)) { BS.chunk(m, cx, cy); done = true; }
    }
  }
  /* the roof of the woods. Where it hangs over you, it thins to a soft
     window round you, the way the leaves would part if you looked up, so
     you are never lost under it */
  var canL = null, canX = null, hole = 0;
  function overhead() {
    var m = G.map, px = G.p.x / T, py = G.p.y / T;
    if (py < 51 || G.hidePlayer) return false;
    for (var dy = -1.4; dy <= 0.6; dy += 0.5) for (var dx = -1; dx <= 1; dx += 0.5) {
      var t = m.get(Math.floor(px + dx), Math.floor(py + dy));
      if (t === TL.WOOD || (t === TL.DEER && m.hidden.deer) || (t === TL.ROOT && m.hidden.root)) return true;
    }
    return false;
  }
  function drawCanopy(dt) {
    if (G.mapId !== "hill") return;
    var S = BS.CH * T, m = G.map;
    hole += ((overhead() ? 1 : 0) - hole) * Math.min(1, (dt || 0.016) * 5);
    var to = ctx;
    if (hole > 0.02) {
      if (!canL || canL.width !== cvs.width || canL.height !== cvs.height) { canL = BS.cv(cvs.width, cvs.height); canX = canL.getContext("2d"); }
      canX.setTransform(1, 0, 0, 1, 0, 0); canX.globalCompositeOperation = "source-over"; canX.clearRect(0, 0, canL.width, canL.height);
      canX.setTransform(K, 0, 0, K, 0, 0); canX.imageSmoothingEnabled = true; to = canX;
    }
    var cx0 = Math.floor((cam.x - 24) / S), cy0 = Math.floor((cam.y - 24) / S), cx1 = Math.floor((cam.x + VW + 24) / S), cy1 = Math.floor((cam.y + VH + 24) / S);
    for (var cy = Math.max(cy0, 6); cy <= cy1; cy++) for (var cx = Math.max(0, cx0); cx <= cx1; cx++) {
      if (cx * BS.CH >= m.w || cy * BS.CH >= m.h) continue;
      var c = BS.canopyChunk(m, cx, cy);
      to.drawImage(c, cx * S - c.pad - cam.x, cy * S - c.pad - cam.y, c.w, c.h);
    }
    if (to === ctx) return;
    var sx = G.p.x - cam.x, sy = G.p.y - 10 - cam.y, r = 30;
    var g = canX.createRadialGradient(sx, sy, 4, sx, sy, r);
    g.addColorStop(0, "rgba(0,0,0," + (0.82 * hole) + ")"); g.addColorStop(0.55, "rgba(0,0,0," + (0.55 * hole) + ")"); g.addColorStop(1, "rgba(0,0,0,0)");
    canX.globalCompositeOperation = "destination-out"; canX.fillStyle = g; canX.fillRect(sx - r, sy - r, r * 2, r * 2);
    canX.globalCompositeOperation = "source-over";
    var t0 = ctx.getTransform(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(canL, 0, 0); ctx.setTransform(t0);
  }
  /* your arm, as a ring beside you while you crank: it drains as you turn
     the handle and fills back as you rest, gold going to ember when it's
     nearly gone — right where you are looking, not up in a corner */
  var armA = 0, armT = 0;
  function armRing() {
    var L = G.lamp, dt = Math.min(0.1, Math.max(0, time - (armT || time))); armT = time;
    var want = G.s.items.lantern && !G.cut && G.mode === "walk" && !G.hidePlayer && (L.rate > 0.02 || L.arm < 0.985) ? 1 : 0;
    armA += (want - armA) * Math.min(1, dt * (want ? 8 : 3));
    if (armA < 0.02) return;
    var x = G.p.x - cam.x + 12, y = G.p.y - cam.y - 28, r = 4.6, v = Math.max(0, Math.min(1, L.arm));
    var low = v < 0.3, flash = v < 0.15 ? 0.55 + 0.45 * Math.sin(time * 14) : 1;
    ctx.save(); ctx.globalAlpha = armA;
    ctx.fillStyle = "rgba(10,8,6,.55)"; ctx.beginPath(); ctx.arc(x, y, r + 1.6, 0, 6.2832); ctx.fill();
    ctx.lineWidth = 1.7; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = armA * flash;
    ctx.strokeStyle = low ? "#f08a5a" : v < 0.6 ? "#ffc35a" : "#ffd98a";
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + v * 6.2832); ctx.stroke();
    /* the crank itself, turning while you turn it */
    var a = L.rate > 0.02 ? time * 9 : 0.6;
    ctx.globalAlpha = armA * 0.9; ctx.strokeStyle = "#f6e6c0"; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4); ctx.stroke();
    ctx.fillStyle = "#f6e6c0"; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, 0.75, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  var hudC = { t: -1 };
  function hudSafe() {
    if (time - hudC.t < 0.5 && hudC.sc === SC) return hudC;
    hudC.t = time; hudC.sc = SC;
    var bar = document.getElementById("hud"), card = document.getElementById("goalcard");
    var bb = bar ? bar.getBoundingClientRect() : { bottom: 50 }, cb = card && card.offsetParent ? card.getBoundingClientRect() : null;
    hudC.top = Math.max(22, (bb.bottom + 12) / SC);
    hudC.cardR = cb && cb.width ? (cb.right + 12) / SC : 0; hudC.cardB = cb && cb.width ? (cb.bottom + 12) / SC : 0;
    return hudC;
  }
  /* a twinkle where something can be done, and a gold pointer to the goal */
  function hints() {
    if (G.cut || G.mode !== "walk") return;
    if (G.titleRun) return;
    if (BS.guide) BS.guide.wisps(ctx, cam, time, VW, VH, G.nearSpot);
    var tg = BS.story && BS.story.target && BS.story.target();
    if (!tg || G.prefs.pointer === false) return;
    var tx = tg[1] * T, ty = tg[2] * T;
    if (tg[0] !== G.mapId) { var ex = routeExit(tg[0]); if (!ex) return; tx = ex.x * T + 8; ty = ex.y * T + 8; }
    var sx = tx - cam.x, sy = ty - cam.y, d = Math.hypot(tx - G.p.x, ty - G.p.y);
    if (d < 26) return;
    var inside = sx > 10 && sy > 18 && sx < VW - 10 && sy < VH - 10, b = Math.sin(time * 3) * 1.6;
    ctx.save();
    if (inside) {
      ctx.translate(sx, sy - 18 + b);
      ctx.fillStyle = "rgba(0,0,0,.25)"; BS.ell(ctx, 0, 20 - b, 3, 1); ctx.fill();
      ctx.fillStyle = "#ffd166"; ctx.strokeStyle = "rgba(60,30,0,.6)"; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(-3.4, -1.5); ctx.lineTo(0, -6); ctx.lineTo(3.4, -1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-1.6, -1.5); ctx.lineTo(0, -1); ctx.closePath(); ctx.fill();
    } else {
      var a = Math.atan2(sy - VH / 2, sx - VW / 2), px = VW / 2 + Math.cos(a) * VW, py = VH / 2 + Math.sin(a) * VW;
      /* keep to the open screen: under the top bar, and clear of the goal card */
      var hs = hudSafe();
      px = Math.max(12, Math.min(VW - 12, px)); py = Math.max(hs.top, Math.min(VH - 14, py));
      if (px < hs.cardR && py < hs.cardB) { if (hs.cardB - py < hs.cardR - px) py = hs.cardB; else px = hs.cardR; }
      ctx.translate(px, py); ctx.rotate(a);
      ctx.fillStyle = "rgba(255,209,102," + (0.75 + 0.25 * Math.sin(time * 4)) + ")"; ctx.strokeStyle = "rgba(60,30,0,.6)"; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(6 + b * 0.5, 0); ctx.lineTo(-3, -4.5); ctx.lineTo(-1, 0); ctx.lineTo(-3, 4.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  G.routeExit = function (to) { return routeExit(to); };
  function routeExit(to) {
    var from = G.mapId, want = to;
    if (from === "cellar") want = "house";
    else if (from === "shed") want = "hill";
    else if (from === "house") want = to === "cellar" ? "cellar" : "hill";
    else if (from === "hill") want = to === "shed" ? "shed" : "house";
    for (var i = 0; i < G.map.exits.length; i++) if (G.map.exits[i].to === want) return G.map.exits[i];
    return null;
  }
  function render(dt) {
    if (!props) buildProps();
    applyZoom();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = G.mapId === "cellar" ? "#000" : "#0b0906"; ctx.fillRect(0, 0, cvs.width, cvs.height);
    camera(dt || 0.016);
    ctx.setTransform(K, 0, 0, K, 0, 0);
    drawGround();
    if (onWater()) {
      water();
      if (BS.atmos) G.waterLayer(function (c) { BS.atmos.ground(c, cam, VW, VH); });
    }
    if (BS.slope) BS.slope.under(ctx, cam, time);
    if (BS.story && BS.story.under) BS.story.under(ctx, cam, time);
    if (BS.juice) BS.juice.under(ctx, cam, time);
    if (BS.toys) BS.toys.under(ctx, cam, time);
    if (BS.stage && BS.stage.under) BS.stage.under(ctx, cam, time);
    var dl = drawables();
    castShadows();
    if (BS.guide) BS.guide.ground(ctx, cam, time);
    if (BS.cellar) BS.cellar.under(ctx, cam, time);
    dl.forEach(function (d) { d.d(); });
    if (BS.juice) BS.juice.world(ctx, cam, time);
    drawCanopy();
    if (BS.story && BS.story.over) BS.story.over(ctx, cam, time);
    if (BS.cellar) BS.cellar.over(ctx, cam, time);
    if (BS.life) BS.life.over(ctx, cam);
    if (BS.toys) BS.toys.over(ctx, cam, time);
    var dark = darkness();
    atmosphere(dark);
    grade(dark);
    drawLight(dark);
    if (BS.atmos) BS.atmos.air(ctx, cam, VW, VH, dark);
    drawGlow(dark);
    if (BS.cellar) BS.cellar.post(ctx, cam, time, dark, lights());
    if (BS.guide && dark > 0.3) { ctx.save(); ctx.globalAlpha = Math.min(1, dark); BS.guide.ground(ctx, cam, time); ctx.restore(); }   // the thread shines in the dark
    if (BS.toys) BS.toys.post(ctx, cam, time, dark);
    if (BS.atmos && onWater()) G.waterLayer(function (c) { BS.atmos.glowWater(c, cam, VW, VH); });
    if (BS.atmos) BS.atmos.post(ctx, VW, VH, dark);
    drawMotes();
    if (G.minis[G.mode] && G.minis[G.mode].draw) G.minis[G.mode].draw(ctx, cam, time);
    vignette();
    tiltShift(dark);
    ctx.setTransform(K, 0, 0, K, 0, 0);
    hints();
    armRing();
    if (BS.juice) BS.juice.screen(ctx, VW, VH, time, cam);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------------- the loop ---------------- */
  /* dynamic resolution: hold the frame rate by trading a little sharpness */
  var ema = 1 / 60, qT = 0;
  function adapt(dt) {
    if (G.mode === "title" || document.hidden) return;
    ema += (dt - ema) * 0.05; qT += dt;
    if (qT < 2) return;
    qT = 0;
    var q = G.quality;
    if (ema > 1 / 40 && q > 0.55) q = Math.max(0.55, q * 0.85);
    else if (ema < 1 / 55 && q < 1) q = Math.min(1, q * 1.1);
    if (Math.abs(q - G.quality) > 0.01) { G.quality = q; fit(); }
  }
  function frame(ts) {
    var dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
    adapt(dt);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 20);
    if (!document.hidden) {
      update(dt);
      lifeTick(dt); moteTick(dt); skyTick(dt);
      if (BS.atmos) BS.atmos.update(dt, cam, VW, VH);
      if (BS.juice) BS.juice.update(dt, cam);
      if (BS.life) { BS.life.hook(); BS.life.update(dt); }
      if (BS.guide) BS.guide.update(dt);
      if (BS.toys) BS.toys.update(dt);
      if (BS.stage) BS.stage.update(dt);
      if (BS.cellar) BS.cellar.update(dt);
      if (BS.ui && BS.ui.portraitTick) BS.ui.portraitTick(dt);
      if (!(BS.inspect && BS.inspect.isOpen && BS.inspect.isOpen())) render(dt);
      if (G.mode === "lens" && G.lensState) BS.lens.draw(lensX, lensC.width, G.lensState.scene, G.prefs.reduced ? lensT * 0.4 : lensT, G.lensState.st);
    }
    requestAnimationFrame(frame);
  }
  G.start = function () { requestAnimationFrame(frame); };
})();
