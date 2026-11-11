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
  G.prefs = { text: 45, captions: true, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches, master: 0.8, music: 0.6, amb: 0.8, haptics: true, big: false };

  var SAVE = "borrowed-sunlight-game-v1", PREFS = "borrowed-sunlight-game-prefs";
  G.save = function () {
    try { G.s.x = G.p.x; G.s.y = G.p.y; G.s.dir = G.p.dir; G.s.map = G.mapId; localStorage.setItem(SAVE, JSON.stringify(G.s)); G.flash("Saved"); } catch (e) { }
  };
  G.load = function () { try { var j = localStorage.getItem(SAVE); return j ? JSON.parse(j) : null; } catch (e) { return null; } };
  G.wipe = function () { try { localStorage.removeItem(SAVE); } catch (e) { } };
  G.savePrefs = function () { try { localStorage.setItem(PREFS, JSON.stringify(G.prefs)); } catch (e) { } };
  try { var pp = JSON.parse(localStorage.getItem(PREFS) || "null"); if (pp) for (var k in pp) G.prefs[k] = pp[k]; } catch (e) { }

  /* ---------------- canvas & scaling ---------------- */
  var cvs = $("stage"), ctx = cvs.getContext("2d");
  var light = BS.cv(320, 180), lx = light.getContext("2d");
  var VW = 320, VH = 180, SC = 4;
  G.view = function () { return { w: VW, h: VH, s: SC }; };
  function fit() {
    var W = window.innerWidth, Hh = window.innerHeight;
    SC = Math.max(2, Math.floor(Math.min(W / 240, Hh / 170)));
    VW = Math.ceil(W / SC); VH = Math.ceil(Hh / SC);
    cvs.width = VW; cvs.height = VH; light.width = VW; light.height = VH;
    cvs.style.width = VW * SC + "px"; cvs.style.height = VH * SC + "px";
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener("resize", fit); fit();

  /* ---------------- world ---------------- */
  G.maps = BS.buildWorld();
  var ground = {}, canopy = null;
  function groundOf(id) { if (!ground[id]) ground[id] = BS.paintGround(G.maps[id]); return ground[id]; }
  G.repaint = function (id) { delete ground[id]; if (id === "hill") canopy = null; };
  /* reveal a hidden path (the deer path, the root fork) */
  G.reveal = function (kind) {
    var m = G.maps.hill;
    if (!m.hidden[kind]) return;
    m.hidden[kind] = false;
    var c = groundOf("hill"), x = c.getContext("2d"), id = kind === "deer" ? TL.DEER : TL.ROOT;
    for (var y = 0; y < m.h; y++) for (var X = 0; X < m.w; X++) if (m.get(X, y) === id) x.drawImage(BS.paintTile(id, X, y, m), X * T, y * T);
    canopy = null;
  };
  function hiddenSolid(m, t) {
    if (m.id !== "hill" || !m.hidden) return false;
    return (t === TL.DEER && m.hidden.deer) || (t === TL.ROOT && m.hidden.root);
  }

  /* the woods' canopy, and lone trees, painted once into one layer */
  function canopyOf() {
    if (canopy) return canopy;
    var m = G.maps.hill, c = BS.cv(m.w * T, m.h * T), x = c.getContext("2d");
    var dark = ["#1f3318", "#2a4220", "#243a1c", "#30482a", "#1a2c14"];
    for (var y = 0; y < m.h; y++) for (var X = 0; X < m.w; X++) {
      var t = m.get(X, y);
      var isWood = t === TL.WOOD || hiddenSolid(m, t);
      if (isWood) {
        if ((X + y) % 2 && BS.hash(X, y, 5) < 0.55) continue;
        var cp = BS.paintCanopy(X * 31 + y, 11 + Math.floor(BS.hash(X, y, 6) * 5), dark);
        x.drawImage(cp, X * T + 8 - cp.width / 2, y * T + 2 - cp.height / 2);
      }
    }
    G.trees = [];
    for (y = 0; y < m.h; y++) for (X = 0; X < m.w; X++) if (m.get(X, y) === TL.TREE) G.trees.push({ x: X * T + 8, y: y * T + 14, c: BS.paintCanopy(X * 7 + y * 3, 15) });
    canopy = c;
    return c;
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
    noon: { dark: 0, tint: "rgba(255,214,120,.10)", label: "noon" },
    afternoon: { dark: 0, tint: "rgba(255,200,110,.08)", label: "afternoon" },
    evening: { dark: 0.12, tint: "rgba(255,150,60,.20)", label: "evening" },
    golden: { dark: 0.2, tint: "rgba(255,130,70,.24)", label: "evening" },
    dusk: { dark: 0.5, tint: "rgba(70,80,160,.24)", label: "dusk" },
    night: { dark: 0.84, tint: "rgba(20,30,90,.22)", label: "night" },
    dawn: { dark: 0.3, tint: "rgba(200,170,210,.18)", label: "dawn" },
    morning: { dark: 0, tint: "rgba(255,240,200,.05)", label: "morning" }
  };
  G.TOD = TOD;
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
  }

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
  G.objective = function (t) { G.s.objective = t; G.hud(); if (t) { var o = $("obj"); o.classList.remove("pop"); void o.offsetWidth; o.classList.add("pop"); } };
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
  function typeInto(el, text, cb) {
    var i = 0, speed = G.prefs.text;
    el.textContent = "";
    var t = { full: text, el: el, done: false, cb: cb, timer: null };
    if (speed >= 200 || G.prefs.reduced && speed > 120) { el.innerHTML = fmt(text); t.done = true; cb && cb(); return t; }
    var tick = function () {
      i += 1;
      el.innerHTML = fmt(text.slice(0, i)) + '<span class="gh">' + esc(text.slice(i)) + "</span>";
      if (i % 3 === 0) A.sfx("text");
      if (i >= text.length) { t.done = true; el.innerHTML = fmt(text); cb && cb(); return; }
      var ch = text[i - 1], d = 1000 / speed;
      if (".!?".indexOf(ch) >= 0) d *= 6; else if (",;:—".indexOf(ch) >= 0) d *= 3;
      t.timer = setTimeout(tick, d);
    };
    tick();
    return t;
  }
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  /* *italics* in the script become <em> */
  function fmt(s) { return esc(s).replace(/\*([^*]+)\*?/g, "<em>$1</em>"); }
  G.fmt = fmt;
  function finish(t) { if (t && !t.done) { clearTimeout(t.timer); t.done = true; t.el.innerHTML = fmt(t.full); t.cb && t.cb(); } }

  var WHO = {
    wren: { name: "Me", cls: "wren" }, dad: { name: "Dad", cls: "dad" }, beck: { name: "Beck", cls: "beck" },
    gran: { name: "Gran", cls: "gran" }, worker: { name: "The man with the coffee", cls: "worker" },
    beckdad: { name: "Beck's dad", cls: "dad" }, phone: { name: "Phone", cls: "phone" }
  };
  G.say = function (who, text) {
    return new Promise(function (res) {
      var box = $("dlg"), w = WHO[who] || { name: who, cls: "" };
      box.className = "dlg on " + w.cls;
      $("who").textContent = w.name;
      $("more").hidden = true;
      var t = typeInto($("line"), text, function () { $("more").hidden = false; });
      talk = { t: t, res: function () { box.className = "dlg"; res(); } };
      $("live").textContent = w.name + ": " + text.replace(/\*/g, "");
    });
  };
  G.narrate = function (text) {
    return new Promise(function (res) {
      var n = $("narr"); n.classList.add("on");
      $("nmore").hidden = true;
      var t = typeInto($("ntext"), text, function () { $("nmore").hidden = false; });
      talk = { t: t, res: function () { n.classList.remove("on"); res(); } };
      $("live").textContent = text.replace(/\*/g, "");
    });
  };
  /* Mo: no box, no name. Gold, italic, from no direction at all. */
  G.mo = function (text) {
    return new Promise(function (res) {
      var m = $("mo"); m.classList.add("on");
      A.sfx("mo");
      var t = typeInto($("motext"), text, function () { });
      talk = { t: t, res: function () { m.classList.remove("on"); res(); } };
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
  G.item = function (o) {
    return new Promise(function (res) {
      A.sfx("found");
      if (G.prefs.haptics && navigator.vibrate) navigator.vibrate([20, 40, 30]);
      var m = $("get");
      $("gkick").textContent = o.kind || "Found";
      $("gname").textContent = o.name;
      $("gsci").innerHTML = o.sci ? "<b>" + o.sci + "</b>" : "";
      $("gtext").innerHTML = fmt(o.text || "");
      $("gopens").innerHTML = o.opens ? "<span>Opens</span> " + fmt(o.opens) : "";
      var ic = $("gicon").getContext("2d"); ic.clearRect(0, 0, 96, 96);
      if (BS.icons && BS.icons[o.icon]) BS.icons[o.icon](ic, 96);
      m.classList.add("on");
      G.modal = function () { m.classList.remove("on"); G.modal = null; res(); };
      $("gok").focus({ preventScroll: true });
    });
  };
  $("gok").addEventListener("click", function () { if (G.modal) G.modal(); });

  G.chapter = function (n, title) {
    return new Promise(function (res) {
      var c = $("chap"); $("chn").textContent = n; $("cht").textContent = title;
      c.classList.add("on"); A.sfx("chapter");
      setTimeout(function () { c.classList.remove("on"); setTimeout(res, 700); }, G.skipWaits ? 10 : 3200);
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
    $("lens").classList.add("on");
    $("lname").textContent = target.look ? target.look.name : target.label || "Close up";
    $("lnote").hidden = true; $("lnew").hidden = true;
    if (target.look && !G.s.seen[target.look.id]) {
      G.s.seen[target.look.id] = Date.now();
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
  G.closeLens = function () {
    $("lens").classList.remove("on"); G.mode = "walk"; var st = G.lensState; G.lensState = null;
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
    if (p.goal) stepGoal(p, dt);
    else if (mag > 0.1) {
      var sp = (G.held("run") || mag > 0.95 && G.input.ax !== 0 ? 1 : 0) ? 92 : 64;
      if (G.map.cold && G.eyes.adapt < 0.4 && !G.lamp.level) sp = 34;     // feeling your way in the black
      if (G.held("crank")) sp *= 0.55;
      sp *= mag;
      var ox = p.x, oy = p.y;
      move(p, ax * sp * dt, ay * sp * dt);
      var moved = Math.hypot(p.x - ox, p.y - oy);
      p.dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 2 : 3) : (ay > 0 ? 0 : 1);
      p.walk += moved; p.frame = Math.floor(p.walk / 7) % 4; p.moving = moved > 0.05;
      if (p.moving && Math.floor((p.walk - moved) / 14) !== Math.floor(p.walk / 14)) {
        var t = G.map.get(Math.floor(p.x / T), Math.floor(p.y / T));
        A.sfx("step", BS.SURFACE(t));
        if (G.mapId === "house" && Math.floor(p.x / T) === G.map.groan.x && Math.floor(p.y / T) === G.map.groan.y) A.sfx("groan");
      }
      p.still = 0;
      p.trail.push([p.x, p.y]); if (p.trail.length > 60) p.trail.shift();
    } else { p.moving = false; p.frame = 0; p.still += dt; }
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
    var near = G.cut ? null : nearest();
    var pr = $("prompt");
    if (near) { pr.innerHTML = '<kbd>' + (document.body.classList.contains("touch") ? "A" : "E") + "</kbd> " + (typeof near.label === "function" ? near.label() : near.label); pr.classList.add("on"); }
    else if (!G.cut && G.s.items.lens && G.lensNear()) { pr.innerHTML = '<kbd>' + (document.body.classList.contains("touch") ? "Look" : "L") + "</kbd> Something small here — look closer"; pr.classList.add("on"); }
    else pr.classList.remove("on");
    if (!G.cut && G.tap("act") && near) { A.sfx("ui"); near.act(); }
    if (!G.cut && G.tap("lens")) {
      if (G.s.items.lens) G.openLens();
      else if (G.s.items.phone !== false) { G.phoneGlare = 0.8; G.eyes.adapt *= 0.4; G.toast(G.s.battery > 0 ? "No Service · " + Math.round(G.s.battery) + "%" : "The screen stays black. A flat dead stone."); A.sfx("nosignal"); }
    }

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
  var cam = { x: 0, y: 0 };
  G.cam = cam;
  var creatures = [];
  function camera() {
    var m = G.map, mw = m.w * T, mh = m.h * T;
    var tx = G.p.x - VW / 2, ty = G.p.y - 8 - VH / 2;
    if (G.camFocus) { tx = G.camFocus.x - VW / 2; ty = G.camFocus.y - VH / 2; }
    cam.x = mw <= VW ? (mw - VW) / 2 : Math.max(0, Math.min(mw - VW, tx));
    cam.y = mh <= VH ? (mh - VH) / 2 : Math.max(0, Math.min(mh - VH, ty));
    cam.x = Math.round(cam.x); cam.y = Math.round(cam.y);
    if (G.shake > 0) { cam.x += Math.round((Math.random() - 0.5) * G.shake); cam.y += Math.round((Math.random() - 0.5) * G.shake); }
  }
  var props = null;
  function buildProps() {
    var h = G.maps.hill;
    props = {
      house: BS.paintHouse(h.house.w, h.house.h), shed: BS.paintShed(h.shed.w, h.shed.h), beck: BS.paintBeckHouse(h.beck.w, h.beck.h),
      trailer: BS.paintTrailer(h.trailer.w, h.trailer.h), pipes: BS.paintPipes(2), beech: BS.paintBeech(), giant: BS.paintGiant(h.giant.w),
      rock: BS.paintRock(), compost: BS.paintCompost(), loader: BS.paintLoader(), truck: BS.paintTruck(),
      seed: [0, 1, 2, 3, 4, 5].map(BS.paintSeedling)
    };
    G.props = props;
  }
  function drawables() {
    var list = [], m = G.map, h = G.maps.hill;
    if (G.mapId === "hill") {
      list.push({ y: (h.house.y + h.house.h) * T, d: function () { img(props.house, h.house.x * T, (h.house.y + h.house.h) * T - props.house.height); } });
      list.push({ y: (h.shed.y + h.shed.h) * T, d: function () { img(props.shed, h.shed.x * T, (h.shed.y + h.shed.h) * T - props.shed.height); } });
      list.push({ y: (h.beck.y + h.beck.h) * T, d: function () { img(props.beck, h.beck.x * T, (h.beck.y + h.beck.h) * T - props.beck.height); } });
      list.push({ y: (h.trailer.y + h.trailer.h) * T, d: function () { img(props.trailer, h.trailer.x * T, (h.trailer.y + h.trailer.h) * T - props.trailer.height); } });
      [[65, 37], [69, 36], [70, 41], [68, 45]].forEach(function (pp) { list.push({ y: (pp[1] + 1) * T, d: function () { img(props.pipes, pp[0] * T, (pp[1] + 1) * T - props.pipes.height); } }); });
      list.push({ y: (h.beech.y + 2) * T, d: function () { img(props.beech, h.beech.x * T - 4, (h.beech.y + 2) * T - props.beech.height); } });
      list.push({ y: (h.giant.y + 2) * T, d: function () { img(props.giant, h.giant.x * T, (h.giant.y + 2) * T - props.giant.height + 4); for (var i = 0; i < 12; i++) img(props.seed[i % 6], h.giant.x * T + 22 + i * 12, h.giant.y * T - 6 + (i % 2)); } });
      list.push({ y: (h.rock.y + 1) * T, d: function () { img(props.rock, h.rock.x * T - 2, (h.rock.y + 1) * T - props.rock.height); } });
      list.push({ y: 21 * T, d: function () { img(props.compost, 48 * T - 1, 21 * T - props.compost.height); } });
      (G.trees || []).forEach(function (t) { if (t.x > cam.x - 40 && t.x < cam.x + VW + 40 && t.y > cam.y - 20 && t.y < cam.y + VH + 60) list.push({ y: t.y, d: function () { ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(t.x - 9 - cam.x, t.y - 2 - cam.y, 18, 4); ctx.fillStyle = "#5a4430"; ctx.fillRect(t.x - 2 - cam.x, t.y - 12 - cam.y, 5, 12); img(t.c, t.x - t.c.width / 2, t.y - 12 - t.c.height + 8); } }); });
    }
    G.ents.forEach(function (e) {
      if (e.map !== G.mapId || e.hidden) return;
      list.push({ y: e.y, d: function () { drawEnt(e); } });
    });
    if (!G.hidePlayer) list.push({ y: G.p.y + 0.1, d: drawPlayer });
    creatures.forEach(function (c) { if (c.map === G.mapId) list.push({ y: c.y + 20, d: function () { img(BS.paintBug(c.kind, Math.floor(time * (c.kind === "butterfly" ? 6 : 20))), c.x - 4, c.y - 4); } }); });
    list.sort(function (a, b) { return a.y - b.y; });
    return list;
  }
  function img(c, x, y) { ctx.drawImage(c, Math.round(x - cam.x), Math.round(y - cam.y)); }
  G.img = img;
  function shadow(x, y, w) { ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(Math.round(x - cam.x), Math.round(y - cam.y), w, 2.5, 0, 0, 6.3); ctx.fill(); }
  function drawEnt(e) {
    if (e.draw) { e.draw(ctx, e, cam); return; }
    shadow(e.x, e.y, 5);
    var sp = BS.sprite(e.who, e.dir, e.frame || 0);
    img(sp, e.x - 8, e.y - 23 + (e.bob ? Math.round(Math.sin(time * 2) * 0.6) : 0));
  }
  function drawPlayer() {
    var p = G.p;
    if (G.mode === "ride") return drawRider();
    shadow(p.x, p.y, 5);
    var sp = BS.sprite(p.who, p.dir, p.frame);
    img(sp, p.x - 8, p.y - 23);
    if (G.s.items.lantern && G.lamp.level > 0.02) {
      /* the lantern in hand, its glass eye lit */
      var lxp = p.x + [5, -5, 6, -7][p.dir], lyp = p.y - 9 + (p.dir === 1 ? -2 : 0);
      ctx.fillStyle = "#d8b83a"; ctx.fillRect(Math.round(lxp - cam.x) - 2, Math.round(lyp - cam.y) - 2, 4, 5);
      ctx.fillStyle = "rgba(255,240,190," + (0.4 + G.lamp.level * 0.6) + ")"; ctx.fillRect(Math.round(lxp - cam.x) - 1, Math.round(lyp - cam.y) - 1, 2, 2);
    }
  }
  function drawRider() {
    var r = G.ride, p = G.p;
    shadow(p.x, p.y + 2, 9);
    ctx.save(); ctx.translate(Math.round(p.x - cam.x), Math.round(p.y - cam.y));
    /* the deck, the wheels, the lantern taped on the front */
    ctx.fillStyle = "#2a2a2a"; ctx.fillRect(-3, -2, 6, 12);
    ctx.fillStyle = "#c33"; ctx.fillRect(-2, -2, 4, 11);
    ctx.fillStyle = "#111"; ctx.fillRect(-2, 9, 4, 3); ctx.fillRect(-2, -5, 4, 3);
    ctx.fillStyle = "#d8b83a"; ctx.fillRect(-3, 10, 6, 4);
    ctx.fillStyle = "rgba(255,245,200," + (0.4 + G.lamp.level * 0.6) + ")"; ctx.fillRect(-1, 12, 2, 2);
    ctx.restore();
    var sp = BS.sprite("wren", r && r.lean > 0.3 ? 2 : r && r.lean < -0.3 ? 3 : 0, 0);
    img(sp, p.x - 8, p.y - 25);
  }

  /* lights: [x, y, radius, intensity, warm?] in world pixels */
  G.extraLights = [];
  function lights() {
    var L = [], m = G.map;
    if (G.s.items.lantern && G.lamp.level > 0.01) {
      var r = 18 + G.lamp.level * 92;
      var fl = 1 + (G.prefs.reduced ? 0 : Math.sin(time * 23) * 0.02 + Math.sin(time * 7.3) * 0.03);
      L.push([G.p.x, G.p.y - 8, r * fl, Math.min(1, 0.4 + G.lamp.level), "warm"]);
    }
    if (G.lamp.fixed && G.lamp.fixed.map === G.mapId) L.push([G.lamp.fixed.x, G.lamp.fixed.y, G.lamp.fixed.r, G.lamp.fixed.i, "warm"]);
    if (G.mapId === "house") {
      var tod = G.s.tod, day = !(tod === "night" || tod === "dusk");
      if (day) m.windows.forEach(function (w) { L.push([w[0] * T + 8, w[1] * T + 30, 70, tod === "evening" || tod === "golden" ? 0.8 : 1, tod === "evening" || tod === "golden" ? "gold" : "day"]); });
    }
    if (G.mapId === "shed") { L.push([5 * T, 4 * T, 120, 1, "gold"]); }
    if (G.mapId === "hill") {
      var h = G.maps.hill;
      if (G.s.tod === "night" || G.s.tod === "dusk") {
        BS.beckWindows && props && BS.beckWindows.forEach(function (bw) { L.push([h.beck.x * T + bw[0] + 8, (h.beck.y + h.beck.h) * T - props.beck.height + bw[1] + 7, 26, 0.85, "warm"]); });
        L.push([67 * T + 8, 16 * T + 4, 46, 0.9, "warm"]);                    // the porch light
      }
    }
    G.extraLights.forEach(function (l) { if (!l.map || l.map === G.mapId) L.push(l.l || l); });
    return L;
  }
  var stars = null;
  function drawLight() {
    var m = G.map, tod = TOD[G.s.tod];
    var dark = m.outdoor ? tod.dark : (m.dark || 0);
    if (G.mapId === "house" && (G.s.tod === "night" || G.s.tod === "dusk")) dark = 0.9;
    if (m.outdoor && G.p.y / T > 52) dark = Math.min(0.95, dark + 0.18);            // under the trees
    if (G.mapId === "cellar") {
      dark = G.workLights ? 0 : 0.985 - G.eyes.adapt * 0.5;
    }
    if (G.darkOverride != null) dark = G.darkOverride;
    if (dark <= 0.01) return 0;
    var dc = G.mapId === "cellar" ? "4,8,6" : m.outdoor ? "6,10,28" : "10,8,12";
    lx.globalCompositeOperation = "source-over";
    lx.clearRect(0, 0, VW, VH);
    lx.fillStyle = "rgba(" + dc + "," + dark + ")"; lx.fillRect(0, 0, VW, VH);
    lx.globalCompositeOperation = "destination-out";
    lights().forEach(function (l) {
      var x = l[0] - cam.x, y = l[1] - cam.y, r = l[2], i = l[3];
      var g = lx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(0,0,0," + i + ")"); g.addColorStop(0.55, "rgba(0,0,0," + (i * 0.6) + ")"); g.addColorStop(1, "rgba(0,0,0,0)");
      lx.fillStyle = g; lx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    /* dither the edges: soft pixel light rather than smooth gradients */
    lx.globalCompositeOperation = "source-over";
    ctx.drawImage(light, 0, 0);
    return dark;
  }
  /* the glow pass: things that make their own light */
  function drawGlow(dark) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    lights().forEach(function (l) {
      if (l[4] !== "warm" && l[4] !== "gold") return;
      var x = l[0] - cam.x, y = l[1] - cam.y, r = l[2] * 0.7;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      var c = l[4] === "gold" ? "255,190,90" : "255,170,80";
      g.addColorStop(0, "rgba(" + c + "," + (0.18 * l[3]) + ")"); g.addColorStop(1, "rgba(" + c + ",0)");
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    if (BS.story && BS.story.glow) BS.story.glow(ctx, cam, dark, time);
    ctx.restore();
  }
  function tint() {
    var m = G.map;
    if (!m.outdoor) return;
    ctx.fillStyle = TOD[G.s.tod].tint; ctx.fillRect(0, 0, VW, VH);
    if (G.s.tod === "noon" && !G.prefs.reduced) {
      /* the heat: a faint white wash that breathes */
      ctx.fillStyle = "rgba(255,250,220," + (0.03 + Math.sin(time * 0.7) * 0.015) + ")"; ctx.fillRect(0, 0, VW, VH);
    }
  }
  function water() {
    if (G.mapId !== "hill") return;
    var h = G.maps.hill, night = G.s.tod === "night" || G.s.tod === "dusk";
    var x0 = Math.max(0, Math.floor(cam.x / T)), y0 = Math.max(0, Math.floor(cam.y / T)), x1 = Math.min(h.w, x0 + Math.ceil(VW / T) + 1), y1 = Math.min(h.h, y0 + Math.ceil(VH / T) + 1);
    for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
      var t = h.get(x, y);
      if (t !== TL.WATER && t !== TL.SPRING) continue;
      var sx = x * T - cam.x, sy = y * T - cam.y;
      if (night && t === TL.WATER) {
        /* the pond holds the whole sky upside down */
        ctx.fillStyle = "#0a1424"; ctx.fillRect(sx, sy, T, T);
        for (var k = 0; k < 3; k++) { var hh = BS.hash(x, y, k + 400); if (hh > 0.55) { var tw = 0.5 + 0.5 * Math.sin(time * 2 + hh * 50); ctx.fillStyle = "rgba(255,255,240," + (0.4 + tw * 0.6) + ")"; ctx.fillRect(sx + Math.floor(BS.hash(x, y, k + 500) * 15), sy + Math.floor(BS.hash(x, y, k + 600) * 15), 1, 1); } }
        if (x === 57 && y === 62) { ctx.fillStyle = "rgba(250,245,220,.9)"; ctx.beginPath(); ctx.arc(sx + 8, sy + 8, 4, 0, 6.3); ctx.fill(); }
      } else {
        var w = Math.sin(time * 2 + x * 1.3 + y * 0.7);
        ctx.fillStyle = "rgba(200,230,240," + (0.08 + w * 0.06) + ")"; ctx.fillRect(sx + ((time * (t === TL.SPRING ? 10 : 3) + x * 5) % 16), sy + (y * 7 % 13), 4, 1);
      }
    }
  }
  /* small lives in the world */
  G.creatures = creatures;
  function lifeTick(dt) {
    creatures.forEach(function (c) {
      c.t += dt;
      if (c.kind === "bee") { c.x = c.hx + Math.sin(c.t * 1.7 + c.ph) * 14 + Math.sin(c.t * 5.1) * 3; c.y = c.hy + Math.cos(c.t * 1.3 + c.ph) * 8; }
      if (c.kind === "butterfly") { c.x = c.hx + Math.sin(c.t * 0.25) * 70; c.y = c.hy + Math.sin(c.t * 1.9) * 10 - Math.abs(Math.sin(c.t * 0.9)) * 6; }
      if (c.kind === "fly") { c.x = c.hx + Math.cos(c.t * 3) * 10; c.y = c.hy + Math.sin(c.t * 3) * 4; }
      if (c.kind === "frog") { c.x = c.hx; c.y = c.hy; }
    });
    A.bees = creatures.filter(function (c) { return c.kind === "bee" && c.map === G.mapId; });
    var fly = creatures.filter(function (c) { return c.kind === "fly" && c.map === G.mapId; })[0];
    A.fly = fly || null;
  }
  /* motes: dust in the slats, fireflies at dusk, pollen at noon */
  var motes = [];
  function moteTick(dt) {
    if (G.prefs.reduced) { motes.length = 0; return; }
    var want = G.mapId === "shed" ? 40 : (G.mapId === "hill" && (G.s.tod === "dusk" || G.s.tod === "golden" || G.s.tod === "evening")) ? 26 : G.mapId === "hill" && G.s.tod === "noon" ? 14 : G.mapId === "cellar" && G.eyes.adapt > 0.5 ? 10 : 0;
    while (motes.length < want) motes.push({ x: cam.x + Math.random() * VW, y: cam.y + Math.random() * VH, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 3, ph: Math.random() * 6, life: 4 + Math.random() * 6 });
    if (motes.length > want) motes.length = want;
    motes.forEach(function (m) { m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt; if (m.life < 0 || m.x < cam.x - 10 || m.x > cam.x + VW + 10 || m.y < cam.y - 10 || m.y > cam.y + VH + 10) { m.x = cam.x + Math.random() * VW; m.y = cam.y + Math.random() * VH; m.life = 4 + Math.random() * 6; } });
  }
  function drawMotes() {
    if (!motes.length) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    var kind = G.mapId === "shed" ? "dust" : G.mapId === "cellar" ? "spore" : (G.s.tod === "dusk" || G.s.tod === "golden" || G.s.tod === "evening") ? "fly" : "pollen";
    motes.forEach(function (m) {
      var a = kind === "fly" ? (0.5 + 0.5 * Math.sin(time * 3 + m.ph)) * 0.9 : 0.35 + 0.25 * Math.sin(time + m.ph);
      ctx.fillStyle = kind === "fly" ? "rgba(210,255,120," + a + ")" : kind === "spore" ? "rgba(170,240,140," + a * 0.5 + ")" : "rgba(255,235,170," + a + ")";
      ctx.fillRect(Math.round(m.x - cam.x), Math.round(m.y - cam.y), 1, 1);
    });
    ctx.restore();
  }
  function render() {
    if (!props) buildProps();
    ctx.fillStyle = G.mapId === "cellar" ? "#000" : "#0b0906"; ctx.fillRect(0, 0, VW, VH);
    if (G.mode === "title") return;
    camera();
    var gnd = groundOf(G.mapId);
    ctx.drawImage(gnd, -cam.x, -cam.y);
    water();
    if (BS.story && BS.story.under) BS.story.under(ctx, cam, time);
    var cnp = G.mapId === "hill" ? canopyOf() : null;
    drawables().forEach(function (d) { d.d(); });
    if (cnp) ctx.drawImage(cnp, -cam.x, -cam.y);
    if (BS.story && BS.story.over) BS.story.over(ctx, cam, time);
    tint();
    var dark = drawLight();
    drawGlow(dark);
    drawMotes();
    if (G.minis[G.mode] && G.minis[G.mode].draw) G.minis[G.mode].draw(ctx, cam, time);
  }

  /* ---------------- the loop ---------------- */
  function frame(ts) {
    var dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 20);
    if (!document.hidden) {
      update(dt);
      lifeTick(dt); moteTick(dt);
      render();
      if (G.mode === "lens" && G.lensState) BS.lens.draw(lensX, lensC.width, G.lensState.scene, G.prefs.reduced ? lensT * 0.4 : lensT, G.lensState.st);
    }
    requestAnimationFrame(frame);
  }
  G.start = function () { requestAnimationFrame(frame); };
  G.canopyOf = canopyOf;
})();
