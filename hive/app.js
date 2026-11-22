/* app.js — the hands. Taps in, pictures and sound out, and the hive in between.

   sim.js is the game and gfx.js is what it looks like; this file is the bit
   that makes it feel like something. It turns a finger into the one verb the
   game has, and it turns everything the sim says happened into a spark, a
   note and, where it is new, a line in the field notes.

   Three things it is careful about:

   Every tap answers. A tap on a flower, the hive or a hornet does the thing;
   a tap on bare grass still makes a ripple. Nothing a finger can do here is
   met with silence.

   Nobody is told what they can be shown. The first minute is a hand pointing
   at one flower. Words arrive four at a time, once each, and stop.

   Nothing is lost by looking away. The world stops while any sheet is up or
   the tab is hidden, the day does not start until its first flower is
   tapped, and the hive is saved at every dawn.                             */
(function () {
"use strict";
const Sim = self.HiveSim, D = self.HiveData, C = Sim.CFG;
const $ = function (id) { return document.getElementById(id); };
const KEY = "hive-mind.v1";

/* ---------- what is kept between visits ---------- */
const store = (function () {
  let d = {};
  try { d = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { d = {}; }
  const calm = !!(self.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  d.set = Object.assign({ sound: true, music: true, haptic: true, calm: calm, gentle: false }, d.set || {});
  d.notes = d.notes || {}; d.cellar = d.cellar || []; d.best = d.best || { years: 0, jars: 0 }; d.tut = d.tut || {};
  return d;
})();
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode: play on without it */ } }

const canvas = $("meadow");
const gfx = self.HiveGfx.create(canvas);
const snd = self.HiveSound.create();
snd.setOn(store.set.sound); snd.setMusic(store.set.music);
gfx.G.calm = store.set.calm;

let s = null, demo = null;
let mode = "title", paused = false, hidden = false;
let W = 0, H = 0, play = { x: 0, y: 0, w: 1, h: 1 };
let nightAmt = 0, winterAmt = 0, last = 0, mixT = 0, snap = true;
/* ?speed=4 runs the world fast. It is for tools/hive-open-check.js and for
   looking at winter without waiting for it; nothing in the game sets it. */
const SPEED = Math.max(0.25, Math.min(12, +(new URLSearchParams(location.search).get("speed")) || 1));
let flowerTaps = 0, layT = 0, enterT = 0, idleT = 0, thinT = 0, goalHintT = 0, pendingSheet = null, focusIx = -1;
const shown = {};

/* ---------- small helpers ---------- */
function icon(name) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
function buzz(p) { if (store.set.haptic && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* not allowed here */ } } }
function say(t) { $("live").textContent = t; }
function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
function jarSvg(col) {
  return '<svg viewBox="0 0 38 46" aria-hidden="true"><rect class="lid" x="9" y="2" width="20" height="7" rx="2"/>' +
    '<path class="glass" d="M8 9h22c3 2 4 5 4 8v20a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V17c0-3 1-6 4-8z"/>' +
    '<path d="M5.5 20h27v17a4 4 0 0 1-4 4H9.5a4 4 0 0 1-4-4z" fill="' + col + '"/>' +
    '<rect class="shine" x="9" y="22" width="3.5" height="13" rx="1.7"/></svg>';
}

/* ---------- fitting the meadow to the screen ---------- */
function fit() {
  W = innerWidth; H = innerHeight;
  gfx.resize(W, H, Math.min(2, self.devicePixelRatio || 1));
  const hud = $("hud"), top = hud.classList.contains("hide") ? 20 : hud.getBoundingClientRect().bottom + 8;
  play = { x: 0, y: top, w: W, h: Math.max(120, H - top - 22) };
  if (s) Sim.setAspect(s, play.w / play.h);
  if (demo) Sim.setAspect(demo, play.w / play.h);
  snap = true;
}
function camFor(st, dt) {
  const base = Math.min(play.w / st.view.w, play.h / st.view.h);
  let scale = base, cx = play.x + play.w / 2, cy = play.y + play.h / 2;
  if (mode === "title") {
    /* the front door: the hive is the picture. Tall screens put it between
       the name and the button; wide ones put it beside them. */
    if (W > H * 1.15) { cx = W * 0.7; cy = H * 0.5; scale = base * 1.25; } else { cy = H * 0.5; scale = base * 1.5; }
  }
  if (winterAmt > 0.001) {
    /* in winter there is only the cluster, so come in close */
    const close = Math.max(base, Math.min(play.w, play.h) / (Sim.hiveR(st) * 4.4));
    scale = base + (close - base) * winterAmt;
  }
  const cam = gfx.G.cam, k = snap ? 1 : 1 - Math.exp(-dt * 2.4);
  cam.scale += (scale - cam.scale) * k; cam.cx += (cx - cam.cx) * k; cam.cy += (cy - cam.cy) * k;
  snap = false;
}

/* ---------- field notes ----------
   Filed the first time a thing is seen. While the meadow is busy a note is
   only its title, passing by: the reading is for night, or for whoever taps
   it. Knowledge on tap, never a wall between a player and the bees.        */
const noteQueue = [], freshNotes = [];
let noteT = 0;
function fileNote(on) {
  for (const n of D.NOTES) {
    if (n.on !== on || store.notes[n.id]) continue;
    store.notes[n.id] = 1; noteQueue.push(n); freshNotes.push(n.id); save();
  }
}
function stepNotes(dt) {
  const el = $("note");
  if (noteT > 0) {
    noteT -= dt;
    if (noteT <= 0 || paused || mode !== "play") { el.classList.add("off"); noteT = Math.min(noteT, 0); }
    return;
  }
  if (noteT > -0.7) { noteT -= dt; return; }
  if (!noteQueue.length || paused || mode !== "play" || !s || s.hornets.length || !s.started || (s.phase !== "day" && s.phase !== "winter")) return;
  /* the first minute of a first game belongs to the hand, not to reading */
  if (!store.tut.queen && s.year === 1 && s.day === 0 && s.clock < 26) return;
  const n = noteQueue.shift();
  el.querySelector(".ti").textContent = n.title;
  el.querySelector(".bd").textContent = n.text;
  el.classList.remove("off", "open");
  noteT = 3.2;
  snd.play("note");
}
$("note").addEventListener("click", function () {
  if (this.classList.contains("open")) { noteT = 0.01; return; }
  this.classList.add("open"); noteT = 9;
});

/* ---------- words that pass through ---------- */
let bannerT = 0;
function banner(big, sub, secs) {
  const el = $("banner");
  el.querySelector(".bn").textContent = big; el.querySelector(".sub").textContent = sub || "";
  el.classList.add("on"); bannerT = secs || 2.2;
}

/* ---------- what the sim says happened, made into something you feel ---------- */
function cellOfHoney(st) {
  const k = Math.max(0, Math.min(st.cells - 1, Math.floor((st.honey - 0.01) / C.CELL)));
  return Sim.honeyCellIndex(k);
}
function onEvent(st, e, quiet) {
  const x = e.x === undefined ? 0 : gfx.sx(e.x), y = e.y === undefined ? 0 : gfx.sy(e.y);
  const play1 = function (name, arg) { if (!quiet) snd.play(name, arg); };
  switch (e.type) {
    case "bloom":
      gfx.ring(x, y, "#ffffff", 4, 26, 0.5, 2.5); play1("bloom");
      if (!quiet) { fileNote("sp:" + e.sp); if (e.first) say(D.SPECIES[e.sp].name + " is in flower."); }
      break;
    case "flowerOn":
      gfx.bounce(e.id); gfx.ring(x, y, "#ffe07a", 10, 44, 0.45, 4);
      gfx.burst(x, y, "#fff3b8", 9, 120, { life: 0.5, r: 2.4 });
      play1("flowerOn"); if (!quiet) buzz(12);
      break;
    case "flowerOff":
      gfx.bounce(e.id); gfx.ring(x, y, "#ffffff", 34, 12, 0.3, 2.5); play1("flowerOff"); if (!quiet) buzz(8);
      break;
    case "recruit":
      gfx.ring(x, y, "#fff3b8", 6, 30, 0.6, 2); gfx.ring(x, y, "#fff3b8", 6, 46, 0.9, 1.5);
      play1("recruit"); if (!quiet) fileNote("recruit");
      break;
    case "deliver": {
      const col = D.SPECIES[e.sp] ? D.SPECIES[e.sp].honey : "#ffd45e", i = cellOfHoney(st);
      gfx.drop(i, col); play1("deliver", e.amt);
      if (e.cell) {
        const p = Sim.cellXY(i);
        gfx.popCell(i); gfx.burst(gfx.sx(p.x), gfx.sy(p.y), "#fff3b8", 6, 70, { life: 0.5, kind: "star", r: 2.6 });
        play1("cell"); if (!quiet) fileNote("cell");
      }
      if (!quiet) { fileNote("deliver"); bump("mHoney"); }
      break;
    }
    case "grow": {
      const p = Sim.cellXY(e.cell);
      gfx.popCell(e.cell); gfx.burst(gfx.sx(p.x), gfx.sy(p.y), "#f3deb0", 5, 50, { life: 0.5, r: 2 });
      if (!quiet) fileNote("grow");
      break;
    }
    case "ring":
      gfx.ring(gfx.sx(0), gfx.sy(0), "#ffe07a", gfx.G.hiveR * gfx.G.cam.scale * 0.4, gfx.G.hiveR * gfx.G.cam.scale * 1.7, 0.9, 6);
      play1("ring");
      if (!quiet) { gfx.float(gfx.sx(0), gfx.sy(0) - gfx.G.hiveR * gfx.G.cam.scale - 10, "A new ring of comb!", "#fff3b8", 18); fileNote("ring"); buzz([14, 40, 14]); }
      break;
    case "lay": {
      const p = Sim.cellXY(e.slot);
      gfx.popCell(e.slot); gfx.burst(gfx.sx(p.x), gfx.sy(p.y), "#ffffff", 7, 60, { life: 0.45, r: 2 });
      play1("lay");
      if (!quiet) { buzz(14); fileNote("lay"); layT = 0; if (!store.tut.queen) { store.tut.queen = 1; goalHintT = 7; save(); setTimeout(flash, 500); } }
      break;
    }
    case "hatch": {
      const p = Sim.cellXY(e.slot), hx = gfx.sx(p.x), hy = gfx.sy(p.y);
      gfx.popCell(e.slot);
      gfx.burst(hx, hy, "#ffe07a", 14, 150, { life: 0.7, kind: "star", r: 3 });
      gfx.ring(hx, hy, "#ffffff", 4, 34, 0.5, 3);
      for (let i = 0; i < e.n; i++) { const b = st.bees[st.bees.length - 1 - i]; if (b) gfx.born(b.id); }
      play1("hatch");
      if (!quiet) { gfx.float(hx, hy - 16, e.n > 1 ? "Twins!" : "A new bee!", "#fff6d8", 17); buzz([10, 30, 20]); fileNote("hatch"); bump("mBees"); say("A bee hatched. " + plural(st.bees.length, "bee") + "."); }
      break;
    }
    case "noHoney":
      play1("no"); if (!quiet) { gfx.float(gfx.sx(0), gfx.sy(0) - 26, "An egg costs " + e.cost + " honey", "#ffd9c9", 15); gfx.G.shake = 0.35; }
      break;
    case "nurseryFull":
      play1("no"); if (!quiet) gfx.float(gfx.sx(0), gfx.sy(0) - 26, "The nursery is full", "#ffd9c9", 15);
      break;
    case "dry":
      gfx.burst(x, y, D.SPECIES[e.sp].look.c1, 10, 110, { life: 0.8, r: 3, g: 120 }); play1("dry");
      break;
    case "wilt":
      if (e.on || e.left > 0) play1("wilt");
      break;
    case "hornetWarn":
      play1("hornetWarn"); if (!quiet) { buzz([40, 60, 40]); say("A hornet is coming."); }
      break;
    case "hornetIn": if (!quiet) fileNote("hornetIn"); break;
    case "snatch":
      gfx.burst(x, y, "#ff7a5c", 10, 130, { life: 0.5 }); gfx.G.shake = 1; play1("snatch");
      if (!quiet) { gfx.float(x, y - 20, "She took a bee", "#ffb3a0", 15); buzz(60); bump("mBees"); }
      break;
    case "ballCall":
      gfx.ring(x, y, "#fff3b8", 60, 14, 0.4, 4); play1("ballCall");
      if (!quiet && !e.auto) { buzz(16); if (!store.tut.hornet) { store.tut.hornet = 1; save(); } }
      break;
    case "hornetDown":
      gfx.burst(x, y, "#ffb04a", 26, 220, { life: 0.9, kind: "star", r: 3.4 }); gfx.ring(x, y, "#ffffff", 8, 70, 0.6, 5);
      gfx.G.shake = 0.6; play1("hornetDown");
      if (!quiet) { gfx.float(x, y - 22, "Too hot for her!", "#fff3b8", 18); buzz([20, 40, 30]); fileNote("hornetDown"); }
      break;
    case "lost": break;
    case "rain": play1("rain"); if (!quiet) { fileNote("rain"); say("Rain is crossing the meadow."); } break;
    case "refresh":
      gfx.ring(x, y, "#bfe0ff", 8, 40, 0.7, 3); gfx.burst(x, y, "#e6f4ff", 8, 80, { life: 0.6, kind: "star" });
      play1("refresh"); if (!quiet) fileNote("refresh");
      break;
    case "idle": if (!quiet) fileNote("idle"); break;
    case "goalBees":
      if (!quiet) { snd.play("goal"); banner("Enough bees", "The cluster will hold its heat."); flash(); }
      break;
    case "goalHoney":
      if (!quiet) { snd.play("goal"); banner("Enough honey", "Anything more is yours to keep."); flash(); buzz([20, 50, 20, 50, 40]); }
      break;
    case "dusk":
      play1("dusk"); if (!quiet) { fileNote("dusk"); say("Dusk. The bees are coming home."); }
      break;
    case "night": if (!quiet) pendingSheet = { t: 1.1, open: function () { openNight(e); } }; break;
    case "dawn":
      if (quiet) break;
      snd.setSeason(e.season); snd.play("dawn");
      store.run = Sim.serialize(st);
      if (e.day === 4) { store.rewind = store.run; store.rewindYear = st.year; }
      save();
      if (store.tut.flower || e.year > 1 || e.day > 0) banner(e.season.charAt(0).toUpperCase() + e.season.slice(1), "Year " + e.year + " · day " + (e.day + 1) + " of " + C.SEASONS.length, 2.4);
      say(e.season + ", day " + (e.day + 1) + ".");
      break;
    case "learned": break;
    case "winter":
      if (quiet) break;
      snd.setSeason("winter"); banner("Winter", "Hold together."); fileNote("winter");
      say("Winter. The cluster needs " + e.need + " honey and has " + Math.floor(e.honey) + ".");
      break;
    case "gustComing": break;
    case "gust": gfx.G.gust = 1; play1("gust"); if (!quiet) buzz(30); break;
    case "huddleHit":
      gfx.G.warm = 1; gfx.G.squeeze = 1; snd.play("huddle");
      gfx.ring(gfx.sx(0), gfx.sy(0), "#ffd27a", gfx.G.hiveR * gfx.G.cam.scale * 1.3, gfx.G.hiveR * gfx.G.cam.scale * 0.5, 0.5, 6);
      gfx.float(gfx.sx(0), gfx.sy(0) - gfx.G.hiveR * gfx.G.cam.scale - 14, "Warm! Saved " + Math.round(e.save) + " honey", "#fff3b8", 18);
      buzz([18, 30, 18]); fileNote("huddle"); store.tut.gust = 1;
      break;
    case "huddleMiss":
      snd.play("huddleMiss"); gfx.float(gfx.sx(0), gfx.sy(0) - gfx.G.hiveR * gfx.G.cam.scale - 14, "Brr", "#d9ecff", 17);
      break;
    case "shiver": gfx.G.squeeze = 0.45; snd.play("shiver"); break;
    case "jar":
      snd.play("jar"); gfx.float(gfx.sx(0), gfx.sy(0) - gfx.G.hiveR * gfx.G.cam.scale - 14, "The comb is full: a jar!", "#fff3b8", 17);
      break;
    case "dead":
      snd.play("dead"); store.run = null; save();
      pendingSheet = { t: 2.4, open: function () { openLost(e); } };
      break;
    case "yearEnd":
      snd.setSeason("spring"); snd.play("spring"); banner("Spring", "The hive lived.", 2.6); fileNote("thaw");
      pendingSheet = { t: 3, open: function () { openYearEnd(e); } };
      break;
    case "newYear": break;
  }
}
function bump(id) {
  const el = $(id), now = performance.now();
  if (now - (el._b || 0) < 140) return;
  el._b = now; el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
}
function flash() { const g = $("goal"); g.classList.add("flash"); setTimeout(function () { g.classList.remove("flash"); }, 1800); }

/* ---------- the strip along the top ---------- */
function setText(el, key, v) { if (shown[key] !== v) { shown[key] = v; el.textContent = v; } }
function hud() {
  if (!s) return;
  const g = Sim.goals(s), bees = s.bees.length, honey = Math.floor(s.honey);
  const mB = $("mBees"), mH = $("mHoney");
  setText(mB.querySelector("b"), "bees", String(bees)); setText(mB.querySelector("i"), "beesOf", "/" + g.bees);
  setText(mH.querySelector("b"), "honey", String(honey)); setText(mH.querySelector("i"), "honeyOf", "/" + (s.phase === "winter" && s.w ? Math.ceil(s.w.left) : g.need));
  const fb = Math.min(1, bees / g.bees), fh = Math.min(1, s.honey / Math.max(1, g.need));
  if (shown.fb !== fb) { shown.fb = fb; mB.querySelector(".bar span").style.width = (fb * 100) + "%"; mB.classList.toggle("done", fb >= 1); }
  if (shown.fh !== fh) { shown.fh = fh; mH.querySelector(".bar span").style.width = (fh * 100) + "%"; mH.classList.toggle("done", fh >= 1); }
  const winter = s.phase === "winter" || s.phase === "dead", nightNow = s.phase === "night" || s.phase === "dusk";
  const season = winter ? "Winter" : s.phase === "thaw" ? "Spring" : C.SEASONS[s.day].charAt(0).toUpperCase() + C.SEASONS[s.day].slice(1);
  setText($("clockSeason"), "season", season);
  const u = winter && s.w ? s.w.t / C.WINTER : s.phase === "day" ? s.clock / Sim.dayLen(s) : s.phase === "thaw" ? 0 : 1;
  const off = Math.round(100 - 100 * Math.max(0, Math.min(1, u)));
  if (shown.arc !== off) { shown.arc = off; $("clockArc").style.strokeDashoffset = off; }
  const cls = winter ? "chip winter" : nightNow ? "chip night" : "chip";
  if (shown.clockCls !== cls) { shown.clockCls = cls; $("clock").className = cls; }
  const pipKey = s.day + "|" + s.phase;
  if (shown.pips !== pipKey) {
    shown.pips = pipKey;
    let h = "";
    for (let i = 0; i < C.SEASONS.length; i++) h += '<i class="' + (winter || i < s.day ? "done" : i === s.day ? "now" : "") + '"></i>';
    $("clockPips").innerHTML = h;
  }
}

/* ---------- the hand that points, and the four words under the strip ---------- */
function hints(dt) {
  const hand = $("hand"), hint = $("hint");
  let text = "", at = null;
  layT += dt; goalHintT = Math.max(0, goalHintT - dt); enterT += dt;
  /* nothing points at anything until the front door has finished opening */
  if (mode === "play" && !paused && s && enterT > 0.9) {
    const g = Sim.goals(s), cost = Sim.eggCost(s);
    const canLay = (s.phase === "day") && s.honey >= cost && s.brood.length < C.NURSERY;
    const under = s.bees.length + s.brood.length < g.bees;
    gfx.G.queenPulse = canLay ? (under ? 1 : 0.3) : 0;
    gfx.G.egg = { show: s.phase === "day" || s.phase === "dusk", cost: cost, can: canLay };
    if (s.phase === "winter" && s.w) {
      for (const gu of s.w.gusts) if (gu.hit === null && s.w.t > gu.t - 1.1) { if (!store.tut.gust) text = "Tap when the wind lands"; break; }
    } else if (s.phase === "day") {
      const h = s.hornets.find(function (q) { return (q.st === "in" || q.st === "hunt") && !q.called; });
      const firstFlower = !s.started && s.flowers[0];
      if (h && (!store.tut.hornet || h.took > 0)) { at = h; text = "Tap the hornet!"; }
      else if (firstFlower && !store.tut.flower) { at = firstFlower; text = "Tap the flower"; }
      else if (firstFlower) { at = firstFlower; }
      else if (canLay && under && !store.tut.queen) { at = { x: 0, y: 0 }; text = "Tap the hive for a new bee"; }
      else if (!store.tut.flower && flowerTaps < 4) {
        const f = s.flowers.find(function (q) { return !q.on && q.st === "open"; });
        if (f) { at = f; text = "Tap flowers to send bees"; }
      } else if (goalHintT > 0) text = "Winter needs bees and honey";
      else if (canLay && under && layT > 16 && s.year === 1 && s.day < 4) { at = { x: 0, y: 0 }; }
      else if (s.year === 1 && s.started) {
        /* two things a first-year player cannot see for themselves yet: bees
           sitting at home with a flower nobody has tapped, and so many
           flowers tapped that none of them gets worked properly */
        const c = Sim.counts(s);
        let seats = 0, onN = 0;
        for (const f of s.flowers) if (f.on && f.st === "open") { seats += Math.min(f.seats, f.n); onN++; }
        const free = s.flowers.find(function (q) { return !q.on && q.st === "open" && !q.wet; });
        idleT = (s.idle >= 3 && free) ? idleT + dt : 0;
        thinT = (onN >= 3 && seats > s.bees.length * 2.2) ? thinT + dt : 0;
        if (idleT > 4 && s.day < 3) at = free;
        else if (thinT > 5 && !store.tut.thin) { text = "More flowers than bees? Tap one to drop it"; if (thinT > 11) { store.tut.thin = 1; save(); } }
        void c;
      }
    }
  } else { gfx.G.queenPulse = 0; if (gfx.G.egg) gfx.G.egg.show = false; }
  if (at) {
    hand.style.transform = "translate(" + gfx.sx(at.x).toFixed(1) + "px," + gfx.sy(at.y).toFixed(1) + "px)";
    hand.classList.remove("off");
  } else hand.classList.add("off");
  if (text) { if (shown.hint !== text) { shown.hint = text; hint.textContent = text; } hint.classList.remove("off"); }
  else hint.classList.add("off");
}

/* ---------- taps ---------- */
function targets() {
  const out = [{ kind: "hive", x: 0, y: 0, r: Sim.hiveR(s) }];
  for (const h of s.hornets) if (h.st !== "dead" && h.st !== "flee") out.push({ kind: "hornet", id: h.id, x: h.x, y: h.y, r: 0.06 });
  const fl = s.flowers.filter(function (f) { return f.st !== "wilt"; }).sort(function (a, b) { return Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x); });
  for (const f of fl) out.push({ kind: "flower", id: f.id, x: f.x, y: f.y, r: gfx.flowerRadius(f), f: f });
  return out;
}
let lastFlower = 0, lastFlowerT = 0;
function act(t) {
  if (t.kind === "hive") { Sim.tapQueen(s); return; }
  if (t.kind === "hornet") { Sim.tapHornet(s, t.id); return; }
  if (t.kind === "flower") {
    /* a flower is a switch, and an excited finger taps twice: the second of
       two quick taps on the same flower is the same tap */
    const now = performance.now();
    if (t.id === lastFlower && now - lastFlowerT < 420) return;
    lastFlower = t.id; lastFlowerT = now;
    if (Sim.tapFlower(s, t.id)) { flowerTaps++; if (flowerTaps >= 4 && !store.tut.flower) { store.tut.flower = 1; save(); } }
    else {
      /* closed for the night: it still answers */
      gfx.ring(gfx.sx(t.x), gfx.sy(t.y), "rgba(255,255,255,.7)", 6, 22, 0.35, 2); snd.play("miss");
    }
  }
}
function tapAt(px, py) {
  snd.boot();
  if (mode !== "play" || paused || !s) return;
  focusIx = -1; gfx.G.focus = null;
  if (s.phase === "winter") { Sim.huddle(s); return; }
  if (s.phase !== "day" && s.phase !== "dusk") return;
  const sc = gfx.G.cam.scale, wx = (px - gfx.G.cam.cx) / sc, wy = (py - gfx.G.cam.cy) / sc, finger = 30 / sc;
  /* the thing that is hunting your bees gets first claim on a tap */
  let best = null, bd = 1e9;
  for (const t of targets()) {
    const d = Math.hypot(t.x - wx, t.y - wy);
    const reach = t.kind === "hive" ? t.r * 1.12 : Math.max(t.r + 0.02, finger) * (t.kind === "hornet" ? 1.5 : 1);
    if (d > reach) continue;
    const score = d / reach - (t.kind === "hornet" ? 2 : 0);
    if (score < bd) { bd = score; best = t; }
  }
  if (best) act(best);
  else { gfx.ring(px, py, "rgba(255,255,255,.8)", 4, 24, 0.4, 2); snd.play("tap"); }
}
canvas.addEventListener("pointerdown", function (e) { e.preventDefault(); canvas.focus({ preventScroll: true }); tapAt(e.clientX, e.clientY); });
canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

/* a keyboard is a finger too */
function describe(t) {
  if (t.kind === "hive") return "The hive. " + plural(s.bees.length, "bee") + ", " + Math.floor(s.honey) + " honey. An egg costs " + Sim.eggCost(s) + ".";
  if (t.kind === "hornet") return "A hornet.";
  const f = t.f;
  return D.SPECIES[f.sp].name + ", " + (f.on ? "being worked" : "not worked") + ", " + plural(f.n, "visit") + " left.";
}
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") { if (!$("menu").classList.contains("hide")) closeMenu(); else if (mode === "play" && !paused) openMenu("how"); return; }
  if (mode !== "play" || paused || !s || document.activeElement !== canvas) return;
  if (s.phase === "winter") { if (e.key === " " || e.key === "Enter") { e.preventDefault(); snd.boot(); Sim.huddle(s); } return; }
  if (s.phase !== "day") return;
  const list = targets(), step = (e.key === "ArrowRight" || e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) ? 1
    : (e.key === "ArrowLeft" || e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) ? -1 : 0;
  if (step) {
    if (e.key === "Tab" && ((step > 0 && focusIx >= list.length - 1) || (step < 0 && focusIx <= 0))) { focusIx = -1; gfx.G.focus = null; return; }
    e.preventDefault();
    focusIx = (focusIx + step + list.length) % list.length;
    say(describe(list[focusIx]));
  } else if (e.key === " " || e.key === "Enter") {
    e.preventDefault(); snd.boot();
    if (focusIx >= 0 && list[focusIx]) act(list[focusIx]);
  } else if (e.key === "q" || e.key === "Q") { snd.boot(); Sim.tapQueen(s); }
});
function keepFocus() {
  if (focusIx < 0 || !s || mode !== "play") { gfx.G.focus = null; return; }
  const list = targets();
  if (focusIx >= list.length) focusIx = list.length - 1;
  gfx.G.focus = list[focusIx];
}

/* ---------- sheets ---------- */
function openSheet(id) { paused = true; $(id).classList.remove("hide"); const b = $(id).querySelector(".big.primary, .card"); if (b) setTimeout(function () { b.focus({ preventScroll: true }); }, 60); }
function closeSheet(id) { $(id).classList.add("hide"); paused = false; last = 0; }

function chip(ic, text, cls) { return '<span class="' + (cls || "") + '">' + icon(ic) + text + "</span>"; }
let nightPick = null;
function openNight(e) {
  nightPick = null;
  $("nightTitle").textContent = e.last ? "The last night of autumn" : "Night";
  let t = chip("honey", "+" + Math.round(e.today.honey));
  if (e.today.hatched) t += chip("bee", "+" + e.today.hatched);
  if (e.today.lost) t += chip("bee", "−" + e.today.lost, "bad");
  /* where the hive stands against winter, every night, in one chip */
  const gl = Sim.goals(s), ready = s.honey >= gl.need && s.bees.length + s.brood.length >= gl.bees;
  t += chip("snow", Math.floor(s.honey) + " of " + gl.need, ready ? "ice" : "ice");
  /* the one comparison worth making is with yourself */
  if (e.today.honey > (s.bestDay || 0) && s.bestDay) t += '<span class="star">Best day yet</span>';
  s.bestDay = Math.max(s.bestDay || 0, e.today.honey);
  $("nightTally").innerHTML = t;
  const box = $("nightCards"), go = $("nightGo");
  box.innerHTML = "";
  if (!e.offers.length) {
    $("nightLead").textContent = "The hive knows all it can learn this year.";
    go.disabled = false; go.textContent = e.last ? "Into winter" : "Sleep";
  } else {
    const shortBy = Math.ceil(gl.need - s.honey);
    $("nightLead").textContent = !e.last ? "The hive learns one thing. Choose."
      : shortBy > 0 ? "Winter comes in the morning, and the comb is " + shortBy + " honey short. Hold tight when the wind comes. One last thing to learn."
      : "Winter comes in the morning, and the hive is ready. One last thing to learn.";
    go.disabled = true; go.textContent = "Choose one";
    box.setAttribute("role", "radiogroup");
    for (const id of e.offers) {
      const c = D.CARDS[id], lvl = Sim.lv(s, id), b = document.createElement("button");
      b.className = "card"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", "false");
      let pips = "";
      if (c.max > 1) for (let i = 0; i < c.max; i++) pips += '<i class="' + (i <= lvl ? "on" : "") + '"></i>';
      b.innerHTML = '<span class="art">' + icon(c.icon) + "</span><b>" + c.name + '</b><span class="fx">' + c.text + '</span><span class="lv">' + pips + '</span><span class="fact">' + c.fact + "</span>";
      b.addEventListener("click", function () {
        if (nightPick === id) { go.click(); return; }
        nightPick = id; snd.boot(); snd.play("card"); buzz(8);
        for (const o of box.children) o.setAttribute("aria-checked", o === b ? "true" : "false");
        go.disabled = false; go.textContent = "Learn " + c.name.toLowerCase();
      });
      box.appendChild(b);
    }
  }
  const nn = $("nightNotes");
  nn.classList.toggle("hide", !freshNotes.length);
  nn.innerHTML = icon("book") + plural(freshNotes.length, "new field note");
  noteQueue.length = 0;
  openSheet("night");
}
$("nightNotes").addEventListener("click", function () { openMenu("notes"); });
$("nightGo").addEventListener("click", function () {
  snd.boot(); snd.play("learn"); buzz([12, 30, 12]);
  closeSheet("night");
  freshNotes.length = 0;
  Sim.pickCard(s, nightPick);
});

let keepSel = [];
function openYearEnd(e) {
  const col = e.label.share >= 0.5 && D.SPECIES[e.label.sp] ? D.SPECIES[e.label.sp].honey : "#f0b93a";
  let h = "";
  for (let i = 0; i < Math.min(10, e.jars); i++) h += '<span class="jar' + (e.label.pure ? " pure" : "") + '" style="animation-delay:' + (0.3 + i * 0.09) + 's">' + jarSvg(col) + "</span>";
  if (e.jars > 10) h += '<span class="more">+' + (e.jars - 10) + "</span>";
  $("yeJars").innerHTML = h;
  /* each jar lands with its own clink */
  for (let i = 0; i < Math.min(10, e.jars); i++) setTimeout(function () { snd.play("jar"); buzz(8); }, 380 + i * 90);
  $("yeOver").textContent = "Spring · year " + (e.year + 1);
  $("yeTitle").textContent = e.thin ? "The hive came through, thin." : "The hive lived.";
  const kind = (e.label.pure ? "pure " : "") + e.label.name.toLowerCase();
  $("yeLine").textContent = (e.jars ? plural(e.jars, "jar") + " of " + kind + " to spare. " : "No honey to spare, but every bee you need. ") +
    plural(e.bees, "bee") + " came through, and held together through " + e.huddles + " of " + e.gusts + " winds.";
  if (e.jars) {
    store.cellar.push({ y: e.year, sp: e.label.share >= 0.5 ? e.label.sp : "", name: e.label.name, pure: e.label.pure, n: e.jars });
    fileNote("jar"); if (e.label.pure) fileNote("pure");
  }
  store.best.years = Math.max(store.best.years, e.year);
  store.best.jars = Math.max(store.best.jars, s.stats.jars);
  save();
  const owned = Object.keys(s.cards), keep = Sim.keepCount(s), box = $("yeKeeps"), go = $("yeGo");
  keepSel = owned.length <= keep ? owned.slice() : [];
  $("yeKeep").classList.toggle("hide", owned.length <= keep);
  box.innerHTML = "";
  const sync = function () {
    const needN = Math.min(keep, owned.length);
    go.disabled = keepSel.length !== needN;
    go.textContent = go.disabled ? "Choose " + (needN - keepSel.length) + " more" : "Year " + (e.year + 1);
  };
  if (owned.length > keep) {
    $("yeKeepLead").textContent = "The bees who learned all this are gone. The hive remembers " + (keep === 2 ? "two" : "three") + " things. Choose them.";
    for (const id of owned) {
      const c = D.CARDS[id], b = document.createElement("button");
      b.className = "keep"; b.setAttribute("aria-pressed", "false");
      b.innerHTML = icon(c.icon) + c.name + (s.cards[id] > 1 ? " ×" + s.cards[id] : "");
      b.addEventListener("click", function () {
        const at = keepSel.indexOf(id);
        if (at >= 0) keepSel.splice(at, 1); else if (keepSel.length < keep) keepSel.push(id); else return;
        b.setAttribute("aria-pressed", at >= 0 ? "false" : "true"); snd.play("card"); sync();
      });
      box.appendChild(b);
    }
  }
  sync();
  openSheet("yearEnd");
}
$("yeGo").addEventListener("click", function () {
  closeSheet("yearEnd");
  Sim.nextYear(s, keepSel);
  flowerTaps = 9;
  const y = Sim.yearRow(s), g = Sim.goals(s);
  $("ysOver").textContent = "Year " + s.year;
  $("ysTitle").textContent = y.name;
  $("ysBlurb").textContent = y.blurb;
  $("ysGoals").innerHTML = chip("snow", "Winter needs", "ice") + chip("bee", g.bees) + chip("honey", g.honey);
  openSheet("yearStart");
});
$("ysGo").addEventListener("click", function () { snd.boot(); closeSheet("yearStart"); });

function openLost(e) {
  const g = Sim.goals(s);
  $("lostWhy").textContent = e.cause === "cluster"
    ? "There was honey, but the cluster was too small to keep itself warm on it."
    : "Winter needed " + e.short + " more honey than the comb held.";
  $("lostTip").textContent = s.bees.length < g.bees
    ? "Tap the hive more in spring. A bee raised early pays for herself many times by autumn."
    : "Summer is when the flowers are richest. Keep every bee busy then, and stop raising bees by autumn.";
  $("lostStats").textContent = e.year > 1 ? "It lived through " + plural(e.year - 1, "winter") + " and filled " + plural(s.stats.jars, "jar") + "." : "A first winter is the hardest one.";
  const can = !!store.rewind && store.rewindYear === s.year && store.rewindUsed !== s.year + ":" + s.rs0;
  $("lostRewind").classList.toggle("hide", !can);
  $("lostNew").classList.toggle("primary", !can);
  openSheet("lost");
}
$("lostRewind").addEventListener("click", function () {
  const back = Sim.deserialize(store.rewind);
  if (!back) return;
  s = back; s.started = false; store.rewindUsed = s.year + ":" + s.rs0; store.rewind = null; store.run = Sim.serialize(s); save();
  closeSheet("lost"); snd.setSeason("autumn"); fit();
  banner("Autumn, again", "Two days to make it right.");
});
$("lostNew").addEventListener("click", function () { closeSheet("lost"); startNew(); });

/* the menu: the same sheet is the pause screen, the rules, the notes and the cellar */
function showTab(name) {
  for (const b of $("menuTabs").children) b.classList.toggle("on", b.dataset.tab === name);
  for (const t of ["how", "notes", "cellar", "set"]) $("tab-" + t).classList.toggle("hide", t !== name);
  if (name === "notes") {
    const have = D.NOTES.filter(function (n) { return store.notes[n.id]; }).length;
    $("notesLead").textContent = have + " of " + D.NOTES.length + " found. Each is filed the first time you see it happen.";
    /* the ones found since last night come first, so night is when they are read */
    const order = D.NOTES.slice().sort(function (a, b) { return (freshNotes.indexOf(b.id) >= 0) - (freshNotes.indexOf(a.id) >= 0); });
    $("notesList").innerHTML = order.map(function (n) {
      return store.notes[n.id] ? '<div class="fn"><b>' + n.title + (freshNotes.indexOf(n.id) >= 0 ? '<span class="new">new</span>' : "") + "</b>" + n.text + "</div>" : '<div class="fn locked"><b>?</b>Not seen yet.</div>';
    }).join("");
    freshNotes.length = 0;
  } else if (name === "cellar") {
    const total = store.cellar.reduce(function (a, c) { return a + c.n; }, 0);
    $("cellarLead").textContent = total ? plural(total, "jar") + ", from every hive you have kept. Honey a hive has to spare in spring is jarred and kept here." : "Empty for now. Honey a hive has to spare in spring is jarred and kept here.";
    $("cellarShelf").innerHTML = store.cellar.slice().reverse().map(function (c) {
      const col = c.sp && D.SPECIES[c.sp] ? D.SPECIES[c.sp].honey : "#f0b93a";
      return '<div class="lot"><span class="jar' + (c.pure ? " pure" : "") + '">' + jarSvg(col) + "</span><span><b>" + c.n + " × " + (c.pure ? "pure " : "") + c.name.toLowerCase() + "</b>Year " + c.y + "</span></div>";
    }).join("");
  }
}
function syncSets() {
  $("sSound").setAttribute("aria-pressed", String(store.set.sound)); $("sMusic").setAttribute("aria-pressed", String(store.set.music));
  $("sHaptic").setAttribute("aria-pressed", String(store.set.haptic)); $("sCalm").setAttribute("aria-pressed", String(store.set.calm));
  $("sGentle").setAttribute("aria-pressed", String(store.set.gentle)); $("tGentle").setAttribute("aria-pressed", String(store.set.gentle));
}
function openMenu(tab) {
  $("menuTitle").textContent = mode === "title" ? "Hive Mind" : "Paused";
  $("menuResume").textContent = mode === "title" ? "Close" : "Back to the hive";
  $("sNew").classList.toggle("hide", mode === "title");
  $("sNew").textContent = "Start a new hive";
  showTab(tab || "how"); syncSets(); openSheet("menu");
}
function closeMenu() {
  closeSheet("menu");
  /* the menu can be opened over night's sheet; the world stays stopped under that */
  for (const id of ["night", "yearEnd", "yearStart", "lost"]) if (!$(id).classList.contains("hide")) paused = true;
}
$("btnMenu").addEventListener("click", function () { snd.boot(); openMenu("how"); });
$("menuClose").addEventListener("click", closeMenu);
$("menuResume").addEventListener("click", closeMenu);
$("menuTabs").addEventListener("click", function (e) { const b = e.target.closest("button"); if (b) showTab(b.dataset.tab); });
$("goal").addEventListener("click", function () {
  if (!s) return;
  const g = Sim.goals(s);
  banner("Before winter", g.bees + " bees and " + g.need + " honey" + (g.short ? " (less with a full cluster)" : ""), 3);
});
$("clock").addEventListener("click", function () {
  if (!s) return;
  banner("Year " + s.year, Sim.yearRow(s).name + " · day " + (s.day + 1) + " of " + C.SEASONS.length, 2.6);
});
function toggle(id, key, after) {
  $(id).addEventListener("click", function () { store.set[key] = !store.set[key]; save(); syncSets(); if (after) after(store.set[key]); });
}
toggle("sSound", "sound", function (v) { snd.boot(); snd.setOn(v); });
toggle("sMusic", "music", function (v) { snd.setMusic(v); });
toggle("sHaptic", "haptic", function (v) { if (v) buzz(20); });
toggle("sCalm", "calm", function (v) { gfx.G.calm = v; });
toggle("sGentle", "gentle");
toggle("tGentle", "gentle");
$("sNew").addEventListener("click", function () {
  /* a hive is not thrown away on one tap */
  if (this.textContent.indexOf("Sure") < 0) { this.textContent = "Sure? Tap again to leave this hive"; return; }
  closeMenu(); startNew();
});
$("tHow").addEventListener("click", function () { snd.boot(); openMenu("how"); });

/* ---------- starting, and coming back ---------- */
function enter() {
  mode = "play"; paused = false;
  $("title").classList.add("gone"); $("hud").classList.remove("hide");
  for (const k in shown) delete shown[k];
  fit(); snap = false;
  nightAmt = 0; winterAmt = 0; flowerTaps = store.tut.flower ? 9 : 0; layT = 0; enterT = 0; focusIx = -1;
  snd.setSeason(Sim.season(s));
  canvas.focus({ preventScroll: true });
}
function startNew() {
  s = Sim.create({ gentle: store.set.gentle, aspect: play.w / play.h });
  s.rs0 = s.rs;
  store.rewind = null; store.rewindUsed = null;
  enter();
}
function resume() {
  const back = store.run ? Sim.deserialize(store.run) : null;
  if (!back) { startNew(); return; }
  s = back;
  /* a day that was saved at dawn starts again at dawn, and waits for you */
  s.started = false; s.clock = 0; s.flowers = [];
  enter();
  banner(Sim.season(s).charAt(0).toUpperCase() + Sim.season(s).slice(1), "Year " + s.year + " · day " + (s.day + 1) + " of " + C.SEASONS.length);
}
function syncTitle() {
  const has = !!(store.run && Sim.deserialize(store.run));
  $("goPlay").textContent = has ? "Continue" : "Play";
  $("goNew").classList.toggle("hide", !has);
  $("goNew").textContent = "New hive";
  const b = store.best;
  $("titleBest").textContent = b.years ? "Your best hive saw " + plural(b.years, "spring") + " and filled " + plural(b.jars, "jar") + "." : "";
  syncSets();
}
$("goPlay").addEventListener("click", function () { snd.boot(); buzz(15); if (store.run) resume(); else startNew(); });
$("goNew").addEventListener("click", function () {
  if (this.textContent.indexOf("Sure") < 0) { this.textContent = "Sure? Tap again"; return; }
  snd.boot(); store.run = null; save(); startNew();
});

/* behind the front door the meadow is already alive: a hive playing itself */
function makeDemo() {
  demo = Sim.create({ seed: 4242 + Math.floor(Math.random() * 99), aspect: play.w / play.h });
  for (let i = 0; i < 9; i++) demo.bees.push(Object.assign({}, demo.bees[0], { id: demo.nextId++, t: Math.random() }));
  demo.peak = 12; demo.honey = 34; demo.cells = 9; demo.started = true; demo.clock = 6;
  Sim.setAspect(demo, play.w / play.h);
  demo.events.length = 0;
}
function runDemo(dt) {
  if (!demo || demo.phase !== "day") makeDemo();
  for (const f of demo.flowers) if (!f.on && f.st === "open" && f.age > 0.7) Sim.tapFlower(demo, f.id);
  Sim.step(demo, dt);
  for (const e of demo.events) onEvent(demo, e, true);
  demo.events.length = 0;
}

/* ---------- the loop ---------- */
function frame(ts) {
  requestAnimationFrame(frame);
  if (hidden) { last = 0; return; }
  const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
  last = ts;
  const st = mode === "title" ? demo : s;
  if (mode === "title") runDemo(dt);
  else if (!paused) {
    Sim.step(s, dt * SPEED);
    if (s.events.length) { const ev = s.events; s.events = []; for (const e of ev) onEvent(s, e, false); }
    if (pendingSheet) { pendingSheet.t -= dt; if (pendingSheet.t <= 0) { const p = pendingSheet; pendingSheet = null; p.open(); } }
  }
  const cur = mode === "title" ? demo : s;
  const winter = cur.phase === "winter" || cur.phase === "dead";
  const nightTo = cur.phase === "night" ? 1 : cur.phase === "dusk" ? Math.min(0.9, cur.pt / 3.5) : 0;
  nightAmt += (nightTo - nightAmt) * (1 - Math.exp(-dt * (nightTo > nightAmt ? 3 : 1.4)));
  winterAmt += ((winter ? 1 : 0) - winterAmt) * (1 - Math.exp(-dt * 1.3));
  camFor(cur, dt);
  keepFocus();
  const g = Sim.goals(cur);
  gfx.draw(cur, dt, {
    season: winter ? "winter" : cur.phase === "thaw" ? "spring" : C.SEASONS[cur.day],
    dayU: cur.phase === "day" ? (cur.started ? cur.clock / Sim.dayLen(cur) : 0.2) : cur.phase === "dusk" ? 1 : 0.5,
    night: nightAmt, winter: winterAmt,
    goalFrac: mode === "title" ? -1 : winter && cur.w ? 1 - cur.w.left / Math.max(1, cur.w.need) : cur.honey / Math.max(1, g.need)
  });
  if (mode === "play") { hud(); }
  hints(dt); stepNotes(dt);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $("banner").classList.remove("on"); }
  mixT -= dt;
  if (mixT <= 0) {
    mixT = 0.25;
    let flying = 0;
    for (const b of cur.bees) if (b.st !== "home") flying++;
    snd.mix({ flying: mode === "title" ? flying * 0.4 : flying, night: nightAmt, rain: cur.clouds.length ? 1 : 0, winter: winterAmt, gust: gfx.G.gust });
  }
  void st;
}

document.addEventListener("visibilitychange", function () {
  hidden = document.hidden;
  if (hidden) snd.suspend(); else snd.resume();
});
addEventListener("resize", fit);
addEventListener("orientationchange", function () { setTimeout(fit, 250); });

fit(); makeDemo(); syncTitle();
requestAnimationFrame(frame);

/* a door for tools/hive-open-check.js, and for the curious */
self.__hive = function () { return { s: s, demo: demo, mode: mode, paused: paused, store: store, gfx: gfx, Sim: Sim }; };

if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && location.hostname !== "localhost") {
  addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () { /* offline play is a bonus */ }); });
}
})();
