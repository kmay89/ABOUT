/* gfx.js — the meadow, the comb and every bee, painted from above.

   sim.js knows where things are. This file is what they look like, and it
   owns nothing that matters: delete every particle and wobble in here and
   the game plays exactly the same. That is the rule that keeps the polish
   honest. A bee on screen is where the sim says she is, give or take a
   wingbeat.

   One canvas, drawn back to front each frame:

     ground     painted once per season into an off-screen sheet
     shadows    so things sit on the meadow instead of floating over it
     bee-lines  a dotted trail from the hive to each flower it is working
     flowers    one cached sprite per kind, sized to the camera
     the comb   wax, honey rising in each cell, the nursery, the queen
     bees       a two-frame sprite, turned to face where she is going
     weather    rain, a hornet, snow, the light of the hour

   Everything is in meadow units until the last moment; `cam` turns them
   into pixels, so the view can pull back as the hive grows without a single
   number in the game changing.                                             */
(function (root) {
"use strict";
const Sim = root.HiveSim, D = root.HiveData;
const TAU = Math.PI * 2;
const C = Sim.CFG;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }
function backOut(t) { t = clamp(t, 0, 1) - 1; return 1 + t * t * (2.7 * t + 1.7); }
/* a hash that is the same every time, for things that must not flicker */
function hash(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp(pa >> 16, pb >> 16, t)), g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t)), bl = Math.round(lerp(pa & 255, pb & 255, t));
  return "rgb(" + r + "," + g + "," + bl + ")";
}
function sheet(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

const GROUND = {
  spring: { a: "#9fd070", b: "#74b458", light: "#b9e184", dark: "#5c9f4b", blade: ["#5a9c48", "#7fbf5c", "#4d8c40"], specks: ["#ffffff", "#ffe36e", "#ffc4dd"] },
  summer: { a: "#b3cf63", b: "#8bb04a", light: "#d2dc74", dark: "#6f9a3f", blade: ["#6f9a3f", "#a0bf52", "#5c8736"], specks: ["#ffffff", "#ffd84d", "#c9b0ff"] },
  autumn: { a: "#d2b266", b: "#b08a45", light: "#e3c97c", dark: "#96703a", blade: ["#9a7a3a", "#c49a4a", "#84622e"], specks: ["#e2703a", "#c9502e", "#f0b040"] },
  winter: { a: "#eef3fa", b: "#cfdcec", light: "#ffffff", dark: "#b4c6dc", blade: ["#b9c9dd", "#d6e0ee", "#a3b6cf"], specks: ["#ffffff", "#e3ecf7", "#ffffff"] }
};

function create(canvas) {
  const ctx = canvas.getContext("2d");
  const G = {
    W: 0, H: 0, dpr: 1, t: 0, calm: false,
    cam: { cx: 0, cy: 0, scale: 400 },
    ground: {}, groundFrom: null, groundTo: "spring", groundMix: 1,
    sprites: { scale: 0, bee: null, flowers: {} },
    bees: {}, flowers: {}, cellFill: [], cellPop: {},
    parts: [], rings: [], floats: [], ambient: [], flies: [], flutter: [], egg: null,
    shake: 0, hiveR: 0, focus: null, queenPulse: 0, frost: 0, glow: 0, snow: 0, night: 0, warm: 0, gust: 0, squeeze: 0
  };

  function resize(w, h, dpr) {
    G.W = w; G.H = h; G.dpr = dpr;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    G.ground = {};
    G.sprites.scale = 0;
    G.ambient.length = 0; G.flies.length = 0;
  }
  function sx(x) { return G.cam.cx + x * G.cam.scale; }
  function sy(y) { return G.cam.cy + y * G.cam.scale; }

  /* ================= the ground ================= */
  function groundSheet(season) {
    if (G.ground[season]) return G.ground[season];
    const P = GROUND[season], k = 0.75, w = G.W * k, h = G.H * k;
    const c = sheet(w, h), g = c.getContext("2d");
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, P.a); base.addColorStop(1, P.b);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const seed = { spring: 1, summer: 2, autumn: 3, winter: 4 }[season] * 1000;
    /* soft patches of lighter and darker grass, so it is a field and not a colour */
    for (let i = 0; i < 64; i++) {
      const x = hash(seed + i) * w, y = hash(seed + i + 0.5) * h, r = (0.06 + 0.2 * hash(seed + i + 0.25)) * Math.max(w, h);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      const col = i % 2 ? P.light : P.dark;
      rg.addColorStop(0, col); rg.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.3; g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    /* blades: short strokes, leaning the same way the wind does */
    const n = Math.round(w * h / 150);
    g.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const x = hash(seed + i * 1.7) * w, y = hash(seed + i * 2.3) * h, l = 2.5 + 4.5 * hash(seed + i * 3.1);
      g.strokeStyle = P.blade[i % 3]; g.globalAlpha = 0.28 + 0.3 * hash(seed + i * 0.9);
      g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l * 0.2, y - l * 0.6, x + l * 0.55, y - l); g.stroke();
    }
    /* tufts: a few longer blades from one root, with a shadow under them */
    for (let i = 0; i < n / 70; i++) {
      const x = hash(seed + i * 11.3) * w, y = hash(seed + i * 13.7) * h, l = 6 + 7 * hash(seed + i * 4.1);
      g.globalAlpha = 0.16; g.fillStyle = P.dark;
      g.beginPath(); g.ellipse(x + 1, y + 1.5, l * 0.6, l * 0.28, 0, 0, TAU); g.fill();
      g.lineWidth = 1.3;
      for (let b = 0; b < 6; b++) {
        const a = -Math.PI / 2 + (b - 2.5) * 0.3 + (hash(seed + i + b) - 0.5) * 0.3, bl = l * (0.6 + 0.4 * hash(seed + i * 3 + b));
        g.globalAlpha = 0.5 + 0.3 * hash(seed + b + i); g.strokeStyle = P.blade[(b + i) % 3];
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * bl * 0.5, y + Math.sin(a) * bl * 0.6, x + Math.cos(a) * bl + 1.5, y + Math.sin(a) * bl); g.stroke();
      }
    }
    /* and the small things in it: daisies, clover leaves, fallen leaves, frost */
    for (let i = 0; i < n / 26; i++) {
      const x = hash(seed + i * 5.3) * w, y = hash(seed + i * 7.1) * h, r = 1 + 1.6 * hash(seed + i * 1.3);
      g.globalAlpha = 0.5 + 0.4 * hash(seed + i);
      g.fillStyle = P.specks[i % 3];
      g.beginPath();
      if (season === "autumn") g.ellipse(x, y, r * 1.8, r * 0.9, hash(i) * 3, 0, TAU); else g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    G.ground[season] = c;
    return c;
  }
  function setSeason(season) {
    if (season === G.groundTo) return;
    G.groundFrom = G.groundTo; G.groundTo = season; G.groundMix = 0;
    G.ambient.length = 0;
  }
  function drawGround(dt) {
    G.groundMix = Math.min(1, G.groundMix + dt / 2.4);
    ctx.globalAlpha = 1;
    if (G.groundFrom && G.groundMix < 1) {
      ctx.drawImage(groundSheet(G.groundFrom), 0, 0, G.W, G.H);
      ctx.globalAlpha = ease(G.groundMix);
    }
    ctx.drawImage(groundSheet(G.groundTo), 0, 0, G.W, G.H);
    ctx.globalAlpha = 1;
  }

  /* ================= sprites ================= */
  function petal(g, len, wid) {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.3, -wid, len * 0.85, -wid * 0.8, len, 0);
    g.bezierCurveTo(len * 0.85, wid * 0.8, len * 0.3, wid, 0, 0);
    g.closePath();
  }
  function leaf(g, len, wid, col, vein) {
    petal(g, len, wid); g.fillStyle = col; g.fill();
    g.strokeStyle = vein; g.lineWidth = Math.max(0.6, len * 0.04);
    g.beginPath(); g.moveTo(len * 0.1, 0); g.lineTo(len * 0.9, 0); g.stroke();
  }
  function paintFlower(sp, giant) {
    const L = D.SPECIES[sp].look, R = L.r * G.cam.scale * (giant ? 1.5 : 1) * G.dpr;
    const size = R * 2.9, c = sheet(size, size), g = c.getContext("2d");
    g.translate(size / 2, size / 2);
    const seed = sp.length * 13 + sp.charCodeAt(0);
    /* leaves first, so the flower sits in them */
    const nl = L.shape === "umbel" ? 4 : 3;
    for (let i = 0; i < nl; i++) {
      g.save(); g.rotate(i * TAU / nl + hash(seed + i) * 0.9);
      leaf(g, R * 1.34, R * 0.34, i % 2 ? "#4f8a3c" : "#5f9a45", "rgba(30,70,25,.5)");
      g.restore();
    }
    const grad = function (len) { const gr = g.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, L.c2); gr.addColorStop(1, L.c1); return gr; };
    if (L.shape === "cup") {
      for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 3; i++) {
        g.save(); g.rotate(i * TAU / 3 + layer * TAU / 6 + 0.3);
        petal(g, R * (layer ? 0.86 : 1), R * (layer ? 0.36 : 0.42)); g.fillStyle = grad(R); g.fill();
        g.strokeStyle = "rgba(60,30,120,.25)"; g.lineWidth = R * 0.03; g.stroke();
        g.restore();
      }
      for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.9; g.fillStyle = L.core; g.beginPath(); g.arc(Math.cos(a) * R * 0.14, Math.sin(a) * R * 0.14, R * 0.09, 0, TAU); g.fill(); }
    } else if (L.shape === "puff") {
      const rings = [[L.petals, 1, L.c1], [16, 0.72, mix(L.c1, L.c2, 0.5)], [10, 0.46, L.c2]];
      for (const rg of rings) for (let i = 0; i < rg[0]; i++) {
        g.save(); g.rotate(i * TAU / rg[0] + rg[1] * 2);
        petal(g, R * rg[1], R * 0.085); g.fillStyle = rg[2]; g.fill();
        g.restore();
      }
      g.fillStyle = L.core; g.beginPath(); g.arc(0, 0, R * 0.16, 0, TAU); g.fill();
    } else if (L.shape === "round") {
      for (let i = 0; i < L.petals; i++) {
        const a = i * TAU / L.petals - 0.4, x = Math.cos(a) * R * 0.5, y = Math.sin(a) * R * 0.5;
        const rg = g.createRadialGradient(x * 0.4, y * 0.4, R * 0.05, x, y, R * 0.52);
        rg.addColorStop(0, L.c1); rg.addColorStop(0.75, L.c1); rg.addColorStop(1, L.c2);
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, R * 0.5, 0, TAU); g.fill();
      }
      for (let i = 0; i < 9; i++) { const a = i * TAU / 9; g.fillStyle = i % 2 ? L.core : "#fff3b0"; g.beginPath(); g.arc(Math.cos(a) * R * 0.17, Math.sin(a) * R * 0.17, R * 0.05, 0, TAU); g.fill(); }
      g.fillStyle = "#d9b23a"; g.beginPath(); g.arc(0, 0, R * 0.07, 0, TAU); g.fill();
    } else if (L.shape === "ball") {
      /* a clover head: a soft ball of florets, palest at the tips */
      const bg = g.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 0.82);
      bg.addColorStop(0, L.c2); bg.addColorStop(1, mix(L.c2, L.c1, 0.5));
      g.fillStyle = bg; g.beginPath(); g.arc(0, 0, R * 0.8, 0, TAU); g.fill();
      for (let ring = 3; ring >= 0; ring--) {
        const n = [1, 6, 11, 16][ring], rr = ring * R * 0.26;
        for (let i = 0; i < n; i++) {
          const a = i * TAU / n + ring * 0.6;
          g.save(); g.translate(Math.cos(a) * rr, Math.sin(a) * rr); g.rotate(a);
          petal(g, R * 0.3, R * 0.1); g.fillStyle = ring > 1 ? L.c1 : mix(L.c1, L.c2, 0.45); g.fill();
          g.strokeStyle = "rgba(190,110,150,.35)"; g.lineWidth = R * 0.018; g.stroke();
          g.restore();
        }
      }
    } else if (L.shape === "spike") {
      for (let i = 0; i < L.petals; i++) {
        g.save(); g.rotate(i * TAU / L.petals + hash(seed + i * 3) * 0.3);
        g.strokeStyle = "#6d8a5a"; g.lineWidth = R * 0.05; g.beginPath(); g.moveTo(0, 0); g.lineTo(R * 0.5, 0); g.stroke();
        for (let k = 0; k < 6; k++) {
          const u = k / 5;
          g.fillStyle = k % 2 ? L.c1 : L.c2;
          g.beginPath(); g.ellipse(R * (0.4 + 0.6 * u), 0, R * 0.1, R * (0.13 - 0.07 * u), 0, 0, TAU); g.fill();
        }
        g.restore();
      }
      g.fillStyle = L.core; g.beginPath(); g.arc(0, 0, R * 0.12, 0, TAU); g.fill();
    } else if (L.shape === "ray") {
      for (let layer = 0; layer < 2; layer++) for (let i = 0; i < L.petals; i++) {
        g.save(); g.rotate((i + layer * 0.5) * TAU / L.petals);
        petal(g, R * (layer ? 0.9 : 1), R * 0.15); g.fillStyle = layer ? L.c1 : grad(R); g.fill();
        g.restore();
      }
      const cr = R * (sp === "sunflower" ? 0.46 : 0.3);
      const rg = g.createRadialGradient(0, 0, cr * 0.2, 0, 0, cr);
      rg.addColorStop(0, mix(L.core, "#000000", 0.25)); rg.addColorStop(1, L.core);
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, cr, 0, TAU); g.fill();
      /* seeds in the spiral a real one grows them in */
      g.fillStyle = sp === "sunflower" ? "rgba(255,200,90,.5)" : "rgba(150,90,0,.45)";
      for (let i = 1; i < 34; i++) { const a = i * 2.39996, rr = cr * 0.92 * Math.sqrt(i / 34); g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, cr * 0.055, 0, TAU); g.fill(); }
    } else if (L.shape === "plume") {
      for (let i = 0; i < 5; i++) {
        g.save(); g.rotate(i * TAU / 5 + 0.2);
        for (let k = 0; k < L.petals; k++) {
          const u = k / (L.petals - 1), a = u * 0.9, rr = R * (0.12 + 0.88 * u);
          g.fillStyle = k % 2 ? L.c1 : L.c2;
          g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, R * (0.15 - 0.08 * u), 0, TAU); g.fill();
        }
        g.restore();
      }
      g.fillStyle = L.core; g.beginPath(); g.arc(0, 0, R * 0.13, 0, TAU); g.fill();
    } else { /* umbel */
      for (let i = 0; i <= L.petals; i++) {
        const a = i * TAU / L.petals, rr = i === L.petals ? 0 : R * 0.6, x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        const rg = g.createRadialGradient(x - R * 0.06, y - R * 0.06, R * 0.02, x, y, R * 0.3);
        rg.addColorStop(0, L.c1); rg.addColorStop(1, L.c2);
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, R * 0.29, 0, TAU); g.fill();
        g.fillStyle = L.core;
        for (let k = 0; k < 5; k++) { const b = k * TAU / 5 + i; g.beginPath(); g.arc(x + Math.cos(b) * R * 0.15, y + Math.sin(b) * R * 0.15, R * 0.035, 0, TAU); g.fill(); }
      }
    }
    return { c: c, R: R / G.dpr, size: size / G.dpr };
  }
  function flowerSprite(sp, giant) {
    const key = sp + (giant ? "+" : "");
    if (!G.sprites.flowers[key]) G.sprites.flowers[key] = paintFlower(sp, giant);
    return G.sprites.flowers[key];
  }
  /* a bee, nose to the right: two wing positions, and one walking */
  function paintBee(len, kind, wing) {
    const L = len * G.dpr, c = sheet(L * 2.2, L * 2.2), g = c.getContext("2d");
    g.translate(L * 1.1, L * 1.1);
    const hornet = kind === "hornet", queen = kind === "queen";
    if (wing >= 0) {
      g.fillStyle = hornet ? "rgba(255,225,200,.5)" : "rgba(255,255,255,.62)";
      g.strokeStyle = hornet ? "rgba(120,50,20,.35)" : "rgba(120,140,170,.35)"; g.lineWidth = L * 0.02;
      const spread = wing ? 1.25 : 0.55;
      for (const side of [-1, 1]) {
        g.save(); g.rotate(side * spread); g.beginPath(); g.ellipse(-L * 0.3, 0, L * 0.46, L * 0.17, 0, 0, TAU); g.fill(); g.stroke(); g.restore();
      }
    }
    /* abdomen, with her stripes */
    const ab = queen ? 0.5 : 0.36, aw = queen ? 0.2 : 0.21;
    /* a dark edge first, so she reads against grass, petals and comb alike */
    g.fillStyle = "rgba(38,22,6,.9)";
    g.beginPath(); g.ellipse(-L * (ab * 0.75), 0, L * ab + L * 0.035, L * aw + L * 0.035, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(L * 0.12, 0, L * (hornet ? 0.2 : 0.185) + L * 0.03, 0, TAU); g.fill();
    g.beginPath(); g.arc(L * 0.36, 0, L * 0.13 + L * 0.03, 0, TAU); g.fill();
    g.save();
    g.beginPath(); g.ellipse(-L * (ab * 0.75), 0, L * ab, L * aw, 0, 0, TAU); g.clip();
    g.fillStyle = hornet ? "#f2a01c" : queen ? "#e8a52a" : "#f6b93b"; g.fillRect(-L * 1.2, -L, L * 2.4, L * 2);
    g.fillStyle = hornet ? "#2a1408" : "#3a2410";
    const stripes = queen ? 5 : 3;
    for (let i = 0; i < stripes; i++) g.fillRect(-L * (ab * 1.55) + i * L * (ab * 1.45 / stripes) + L * 0.03, -L, L * (hornet ? 0.1 : 0.085), L * 2);
    g.restore();
    /* thorax and head */
    g.fillStyle = hornet ? "#6b2a10" : "#4a2f14"; g.beginPath(); g.arc(L * 0.12, 0, L * (hornet ? 0.2 : 0.185), 0, TAU); g.fill();
    g.fillStyle = hornet ? "#f2a01c" : "#33200d"; g.beginPath(); g.arc(L * 0.36, 0, L * 0.13, 0, TAU); g.fill();
    if (hornet) { g.fillStyle = "#2a1408"; g.beginPath(); g.arc(L * 0.4, -L * 0.06, L * 0.035, 0, TAU); g.arc(L * 0.4, L * 0.06, L * 0.035, 0, TAU); g.fill(); }
    if (queen) { g.fillStyle = "#fff2c0"; g.beginPath(); g.arc(L * 0.12, 0, L * 0.07, 0, TAU); g.fill(); }
    /* fuzz: a soft highlight so she is round and not a sticker */
    const hl = g.createRadialGradient(L * 0.05, -L * 0.1, 0, L * 0.05, -L * 0.1, L * 0.3);
    hl.addColorStop(0, "rgba(255,240,200,.35)"); hl.addColorStop(1, "rgba(255,240,200,0)");
    g.fillStyle = hl; g.beginPath(); g.arc(L * 0.08, -L * 0.03, L * 0.3, 0, TAU); g.fill();
    return c;
  }
  function sprites() {
    const sc = G.cam.scale;
    if (Math.abs(sc - G.sprites.scale) / (G.sprites.scale || 1) < 0.06) return;
    G.sprites.scale = sc;
    G.sprites.flowers = {};
    const len = clamp(0.047 * sc, 12, 30);
    G.sprites.len = len;
    G.sprites.bee = [paintBee(len, "bee", 0), paintBee(len, "bee", 1)];
    /* on the comb a bee is one cell long, so a dozen of them are a crowd and not a heap */
    G.sprites.walk = paintBee(Math.min(len * 0.8, C.HEX * sc * 1.25), "bee", -1);
    G.sprites.queen = paintBee(Math.min(len * 1.45, C.HEX * sc * 2.05), "queen", -1);
    G.sprites.hornet = [paintBee(len * 2.3, "hornet", 0), paintBee(len * 2.3, "hornet", 1)];
  }
  function stamp(img, x, y, a, k) {
    const w = img.width / G.dpr * (k || 1), h = img.height / G.dpr * (k || 1);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore();
  }

  /* ================= the small things that fly off when something happens ================= */
  function burst(x, y, col, n, speed, opt) {
    opt = opt || {};
    if (G.calm) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.4 + 0.8 * Math.random());
      G.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opt.up || 0), g: opt.g || 0, life: 0, max: (opt.life || 0.7) * (0.6 + 0.6 * Math.random()), col: col, r: (opt.r || 2.4) * (0.6 + 0.8 * Math.random()), kind: opt.kind || "dot" });
    }
  }
  function ring(x, y, col, r0, r1, life, width) { G.rings.push({ x: x, y: y, col: col, r0: r0, r1: r1, life: 0, max: life || 0.5, w: width || 3 }); }
  function float(x, y, text, col, size) { G.floats.push({ x: x, y: y, text: text, col: col || "#fff6d8", life: 0, max: 1.5, size: size || 17 }); }
  /* a drop of honey going from the door to the cell it lands in */
  function drop(toCell, col) {
    const p = Sim.cellXY(toCell);
    G.parts.push({ kind: "drop", x: sx(0), y: sy(0), tx: sx(p.x), ty: sy(p.y), life: 0, max: 0.32, col: col, r: 3 });
  }
  function drawFx(dt) {
    for (let i = G.rings.length - 1; i >= 0; i--) {
      const r = G.rings[i]; r.life += dt;
      const u = r.life / r.max;
      if (u >= 1) { G.rings.splice(i, 1); continue; }
      ctx.globalAlpha = (1 - u) * 0.9; ctx.strokeStyle = r.col; ctx.lineWidth = r.w * (1 - u * 0.6);
      ctx.beginPath(); ctx.arc(r.x, r.y, lerp(r.r0, r.r1, 1 - (1 - u) * (1 - u)), 0, TAU); ctx.stroke();
    }
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const p = G.parts[i]; p.life += dt;
      const u = p.life / p.max;
      if (u >= 1) { G.parts.splice(i, 1); continue; }
      if (p.kind === "drop") {
        const e = ease(u), x = lerp(p.x, p.tx, e), y = lerp(p.y, p.ty, e) - Math.sin(u * Math.PI) * 8;
        ctx.globalAlpha = 1; ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(x, y, p.r, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(x - 1, y - 1, p.r * 0.35, 0, TAU); ctx.fill();
        continue;
      }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - 2.2 * dt; p.vy *= 1 - 2.2 * dt;
      ctx.globalAlpha = 1 - u * u; ctx.fillStyle = p.col;
      if (p.kind === "star") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 5);
        ctx.beginPath();
        for (let k = 0; k < 8; k++) { const rr = k % 2 ? p.r * 0.4 : p.r * 1.3, a = k * TAU / 8; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - u * 0.5), 0, TAU); ctx.fill(); }
    }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let i = G.floats.length - 1; i >= 0; i--) {
      const f = G.floats[i]; f.life += dt;
      const u = f.life / f.max;
      if (u >= 1) { G.floats.splice(i, 1); continue; }
      const k = backOut(Math.min(1, u * 5));
      ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
      ctx.font = "800 " + Math.round(f.size * k) + "px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(40,22,4,.75)"; ctx.lineJoin = "round";
      const y = f.y - 34 * ease(u);
      ctx.strokeText(f.text, f.x, y); ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
  }

  /* ================= the comb ================= */
  function hexPath(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = TAU / 6 * i - Math.PI / 2; ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); }
    ctx.closePath();
  }
  function drawHive(s, dt, goalFrac) {
    const sc = G.cam.scale, cx = sx(0), cy = sy(0);
    const targetR = Sim.hiveR(s);
    G.hiveR = G.hiveR ? lerp(G.hiveR, targetR, Math.min(1, dt * 3)) : targetR;
    const R = G.hiveR * sc, hex = C.HEX * sc;
    /* the hollow it lives in: a ring of bark and a warm dark inside */
    ctx.fillStyle = "rgba(20,12,4,.28)";
    ctx.beginPath(); ctx.ellipse(cx + R * 0.06, cy + R * 0.1, R * 1.2, R * 1.17, 0, 0, TAU); ctx.fill();
    let gr = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.17);
    gr.addColorStop(0, "#5a3a1c"); gr.addColorStop(0.5, "#8a5d2e"); gr.addColorStop(1, "#5e3d1d");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R * 1.17, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(40,22,8,.35)"; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx, cy, R * (1.03 + i * 0.045), 0.3 + i, 0.3 + i + 4.6); ctx.stroke(); }
    gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    gr.addColorStop(0, "#3d2609"); gr.addColorStop(1, "#22140a");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R * 1.0, 0, TAU); ctx.fill();
    /* round the rim, how near the comb is to what winter will ask: frost
       where it is short, gold where it is not. The whole year in one ring. */
    if (goalFrac >= 0) {
      const rr = R * 1.085, lw = Math.max(3, R * 0.06);
      G.goalShown = lerp(G.goalShown || 0, clamp(goalFrac, 0, 1), Math.min(1, dt * 4));
      ctx.lineCap = "round"; ctx.lineWidth = lw;
      ctx.strokeStyle = "rgba(210,235,255,.38)"; ctx.setLineDash([0.01, lw * 1.7]);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      if (G.goalShown > 0.004) {
        const done = goalFrac >= 1;
        ctx.strokeStyle = done ? "#b6f08a" : "#ffd45e";
        if (done) { ctx.shadowColor = "#d8ffb0"; ctx.shadowBlur = 8 + 5 * Math.sin(G.t * 3); }
        ctx.beginPath(); ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + TAU * G.goalShown); ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    const full = s.honey / C.CELL, built = s.cells;
    const r = hex * 0.93;
    /* honey cells, out from the nursery in a spiral */
    for (let k = 0; k < built; k++) {
      const i = Sim.honeyCellIndex(k), p = Sim.cellXY(i), x = sx(p.x), y = sy(p.y);
      const want = clamp(full - k, 0, 1);
      const have = G.cellFill[k] === undefined ? want : G.cellFill[k];
      const fill = G.cellFill[k] = lerp(have, want, Math.min(1, dt * 9));
      const pop = G.cellPop[i] ? (G.cellPop[i] = Math.max(0, G.cellPop[i] - dt * 3)) : 0;
      const rr = r * (1 + 0.16 * pop);
      hexPath(x, y, rr);
      ctx.fillStyle = "#5c3d14"; ctx.fill();
      if (fill > 0.02) {
        hexPath(x, y, rr * (0.3 + 0.7 * Math.sqrt(fill)));
        const hg = ctx.createLinearGradient(x, y - rr, x, y + rr);
        hg.addColorStop(0, "#ffd45e"); hg.addColorStop(1, "#e8950f");
        ctx.fillStyle = hg; ctx.fill();
        if (fill > 0.97) {
          /* a full cell is capped with wax, and catches the light */
          hexPath(x, y, rr * 0.99);
          ctx.fillStyle = "rgba(255,236,170,.34)"; ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.5)";
          ctx.beginPath(); ctx.ellipse(x - rr * 0.25, y - rr * 0.32, rr * 0.2, rr * 0.1, -0.5, 0, TAU); ctx.fill();
        }
      }
      hexPath(x, y, rr);
      ctx.lineWidth = Math.max(1, hex * 0.1);
      ctx.strokeStyle = "rgba(240,190,90,.55)";
      ctx.stroke();
    }
    /* the nursery: six cells round the queen */
    const used = {};
    for (const e of s.brood) used[e.slot] = e;
    for (let i = 1; i <= 6; i++) {
      const p = Sim.cellXY(i), x = sx(p.x), y = sy(p.y), e = used[i];
      const pop = G.cellPop[i] ? (G.cellPop[i] = Math.max(0, G.cellPop[i] - dt * 2.5)) : 0;
      const rr = r * (1 + 0.22 * pop);
      hexPath(x, y, rr); ctx.fillStyle = "#f3deb0"; ctx.fill();
      if (e) {
        const u = e.t / e.dur;
        if (u < 0.3) {
          ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.ellipse(x, y, rr * 0.12, rr * 0.3, 0.5, 0, TAU); ctx.fill();
        } else if (u < 0.65) {
          /* a larva is a white comma that fills its cell */
          const g2 = (u - 0.3) / 0.35;
          ctx.strokeStyle = "#fffaf0"; ctx.lineCap = "round"; ctx.lineWidth = rr * (0.24 + 0.2 * g2);
          ctx.beginPath(); ctx.arc(x, y, rr * (0.22 + 0.16 * g2), 0.6 + G.t * 0.8, 0.6 + G.t * 0.8 + 4.4); ctx.stroke();
        } else {
          hexPath(x, y, rr * 0.9);
          const cg = ctx.createRadialGradient(x - rr * 0.2, y - rr * 0.2, 0, x, y, rr);
          cg.addColorStop(0, "#e9c890"); cg.addColorStop(1, "#c79a5a");
          ctx.fillStyle = cg; ctx.fill();
          if (u > 0.9) { ctx.strokeStyle = "rgba(60,30,5,.6)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, rr * 0.3, 0, TAU * (u - 0.9) * 10); ctx.stroke(); }
        }
      }
      hexPath(x, y, rr); ctx.strokeStyle = "rgba(200,150,70,.8)"; ctx.lineWidth = Math.max(1, hex * 0.1); ctx.stroke();
    }
    /* and the queen */
    hexPath(cx, cy, r);
    const qg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    qg.addColorStop(0, "#fff6d4"); qg.addColorStop(1, "#ffd98a");
    ctx.fillStyle = qg; ctx.fill();
    ctx.strokeStyle = "#ffcf5a"; ctx.lineWidth = Math.max(1.5, hex * 0.14); ctx.stroke();
    if (G.queenPulse > 0) {
      const pu = 0.5 + 0.5 * Math.sin(G.t * 5);
      ctx.globalAlpha = G.queenPulse * (0.35 + 0.4 * pu);
      ctx.strokeStyle = "#fff3b8"; ctx.lineWidth = 2.5 + 2 * pu;
      ctx.beginPath(); ctx.arc(cx, cy, hex * (1.25 + 0.2 * pu), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    stamp(G.sprites.queen, cx, cy, Math.sin(G.t * 0.5) * 1.2 + 0.4, 1 + 0.06 * Math.sin(G.t * 3));
    /* what an egg costs, on the rim: lit when the hive can pay for one */
    if (G.egg && G.egg.show) {
      G.eggLit = lerp(G.eggLit || 0, G.egg.can ? 1 : 0, Math.min(1, dt * 6));
      const lit = G.eggLit, by = cy + R * 1.17 - 12, txt = String(G.egg.cost), hop = lit * Math.max(0, Math.sin(G.t * 4)) * 3;
      ctx.font = "800 13px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
      const tw = ctx.measureText(txt).width, w = tw + 38, h = 22, bx = cx - w / 2, yy = by - hop;
      ctx.globalAlpha = 0.6 + 0.4 * lit;
      ctx.fillStyle = lit > 0.5 ? "#fff3c8" : "rgba(42,26,8,.82)";
      /* a pill by hand: roundRect is too new for a phone a few years old */
      ctx.beginPath(); ctx.arc(bx + h / 2, yy + h / 2, h / 2, Math.PI / 2, Math.PI * 1.5); ctx.arc(bx + w - h / 2, yy + h / 2, h / 2, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = lit > 0.5 ? "#e8950f" : "rgba(255,222,150,.3)"; ctx.lineWidth = 1.5; ctx.stroke();
      const ink = lit > 0.5 ? "#3a2104" : "#e3cfa0";
      /* an egg, then the honey it takes. The egg is solid and egg-shaped:
         an outlined oval beside a number reads as a nought */
      const ex = bx + 11, ey = yy + h / 2;
      ctx.fillStyle = lit > 0.5 ? "#ffffff" : "#f3e6c6";
      ctx.beginPath(); ctx.moveTo(ex, ey - 6); ctx.bezierCurveTo(ex + 5.4, ey - 5, ex + 5.6, ey + 6, ex, ey + 6); ctx.bezierCurveTo(ex - 5.6, ey + 6, ex - 5.4, ey - 5, ex, ey - 6); ctx.fill();
      ctx.strokeStyle = lit > 0.5 ? "rgba(120,70,0,.55)" : "rgba(0,0,0,.25)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = ink; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(txt, bx + 21, yy + h / 2 + 0.5);
      hexPath(bx + w - 9, yy + h / 2, 4.6); ctx.fillStyle = "#f5a81c"; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /* ================= bees ================= */
  function beeLook(b) {
    let v = G.bees[b.id];
    if (!v) {
      /* she starts somewhere on the comb, not in a heap on the queen */
      const p = Sim.cellXY(1 + Math.floor(Math.random() * 12));
      v = G.bees[b.id] = { ph: Math.random() * TAU, x: p.x, y: p.y, to: 0, w: Math.random() * 2, a: Math.random() * TAU, born: 0, seen: 0, air: false };
    }
    v.seen = G.t;
    return v;
  }
  function homeSpot(s, v, dt, winter, n) {
    /* at home a bee walks the comb, a cell at a time; in winter she joins the ball */
    if (winter) {
      const k = Math.floor(v.ph * 1000) % Math.max(1, n), a = k * 2.39996 + G.t * 0.12, rr = C.HEX * (0.5 + 0.62 * Math.sqrt(k)) * (1 - 0.16 * G.squeeze);
      const tx = Math.cos(a) * rr, ty = Math.sin(a) * rr;
      v.x = lerp(v.x, tx, Math.min(1, dt * 2)); v.y = lerp(v.y, ty, Math.min(1, dt * 2));
      v.a = a + Math.PI / 2 + Math.sin(G.t * 9 + v.ph) * 0.2;
      return;
    }
    v.w -= dt;
    if (v.w <= 0) { v.w = 0.8 + Math.random() * 2.4; v.to = Math.floor(Math.random() * (7 + s.cells)); }
    const p = Sim.cellXY(v.to);
    const dx = p.x - v.x, dy = p.y - v.y, d = Math.hypot(dx, dy);
    if (d > 0.002) { const st = Math.min(d, 0.05 * dt); v.x += dx / d * st; v.y += dy / d * st; v.a = Math.atan2(dy, dx); }
  }
  function drawBees(s, dt, shadows) {
    const sc = G.cam.scale, winter = s.phase === "winter" || s.phase === "thaw" || s.phase === "dead";
    const frame = Math.floor(G.t * 28) & 1;
    const sh = sc * 0.018;
    for (let i = 0; i < s.bees.length; i++) {
      const b = s.bees[i], v = beeLook(b);
      let x, y, a, img, k = 1, lift = 1;
      v.born = Math.max(0, v.born - dt * 1.6);
      if (b.st === "home") {
        homeSpot(s, v, dt, winter, s.bees.length);
        if (shadows) continue;
        x = sx(v.x); y = sy(v.y); a = v.a; img = G.sprites.walk;
        if (winter) { x += Math.sin(G.t * 31 + v.ph * 9) * 0.6 * (1 + G.gust); }
      } else if (b.st === "work") {
        const f = s.flowers.find(function (q) { return q.id === b.f; });
        const fr = f ? D.SPECIES[f.sp].look.r * (f.giant ? 1.5 : 1) : 0.04, ang = v.ph + G.t * 0.7;
        x = sx(b.x + Math.cos(ang) * fr * 0.55); y = sy(b.y + Math.sin(ang) * fr * 0.55);
        a = ang + Math.PI + Math.sin(G.t * 6 + v.ph) * 0.3; img = G.sprites.walk;
        v.x = 0; v.y = 0;
        if (shadows) continue;
      } else if (b.st === "ball") {
        const ang = v.ph + G.t * 3;
        x = sx(b.x) + Math.cos(ang) * G.sprites.len * 0.8 + (Math.random() - 0.5) * 2; y = sy(b.y) + Math.sin(ang) * G.sprites.len * 0.8 + (Math.random() - 0.5) * 2;
        a = ang + Math.PI; img = G.sprites.bee[frame];
        if (shadows) continue;
      } else {
        /* in the air: where the sim says, with a wingbeat's worth of wander */
        const wob = Math.sin(G.t * 5.2 + v.ph) * 0.011, nx = -Math.sin(b.a), ny = Math.cos(b.a);
        x = sx(b.x + nx * wob); y = sy(b.y + ny * wob);
        a = b.a + Math.cos(G.t * 5.2 + v.ph) * 0.22; img = G.sprites.bee[frame];
        /* over the comb she is taking off or coming in to land: lower, so
           smaller, and her shadow closes up under her */
        lift = clamp(Math.hypot(b.x, b.y) / Math.max(0.03, G.hiveR * 0.95), 0, 1);
        k = 0.72 + 0.28 * lift;
        v.x = b.x * 0.55; v.y = b.y * 0.55;
        if (shadows) {
          ctx.beginPath(); ctx.ellipse(x + sh * 0.7 * lift, y + sh * lift, G.sprites.len * 0.42 * k, G.sprites.len * 0.24 * k, a, 0, TAU); ctx.fill();
          continue;
        }
        if (b.carry > 0) {
          /* her load, glowing the colour of the honey it will make */
          const col = D.SPECIES[b.sp] ? D.SPECIES[b.sp].honey : "#ffd45e";
          const bx = x - Math.cos(a) * G.sprites.len * 0.34, by = y - Math.sin(a) * G.sprites.len * 0.34, rr = G.sprites.len * (0.17 + 0.05 * Math.min(3, b.carry));
          ctx.globalAlpha = 0.35; ctx.fillStyle = "#fff0a8"; ctx.beginPath(); ctx.arc(bx, by, rr * 2.1, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(bx, by, rr, 0, TAU); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.beginPath(); ctx.arc(bx - rr * 0.3, by - rr * 0.3, rr * 0.35, 0, TAU); ctx.fill();
        }
      }
      if (v.born > 0) k *= 1 + 0.9 * v.born;
      stamp(img, x, y, a, k);
    }
  }
  function forget() {
    for (const id in G.bees) if (G.t - G.bees[id].seen > 2) delete G.bees[id];
  }

  /* ================= flowers ================= */
  function flowerLook(f) {
    let v = G.flowers[f.id];
    if (!v) v = G.flowers[f.id] = { open: 0, bounce: 0, on: 0, seen: 0, n: f.n };
    v.seen = G.t;
    return v;
  }
  function flowerRadius(f) { return D.SPECIES[f.sp].look.r * (f.giant ? 1.5 : 1); }
  function drawFlowerShadows(s) {
    const sc = G.cam.scale;
    for (const f of s.flowers) {
      const v = flowerLook(f), R = flowerRadius(f) * sc * v.open;
      if (R < 1) continue;
      ctx.beginPath(); ctx.ellipse(sx(f.x) + R * 0.16, sy(f.y) + R * 0.24, R * 1.02, R * 0.9, 0, 0, TAU); ctx.fill();
    }
  }
  function drawLines(s) {
    const R = G.hiveR * G.cam.scale * 1.12;
    ctx.lineCap = "round";
    for (const f of s.flowers) {
      const v = flowerLook(f);
      if (v.on < 0.02 || f.st === "wilt") continue;
      const x0 = sx(0), y0 = sy(0), x1 = sx(f.x), y1 = sy(f.y), d = Math.hypot(x1 - x0, y1 - y0);
      if (d < R + 8) continue;
      const ux = (x1 - x0) / d, uy = (y1 - y0) / d, end = d - flowerRadius(f) * G.cam.scale - 4;
      ctx.globalAlpha = v.on * (f.scouted ? 0.7 : 0.34);
      ctx.strokeStyle = "#fff3c0"; ctx.lineWidth = 2.6;
      ctx.setLineDash([1, 9]); ctx.lineDashOffset = G.calm ? 0 : -G.t * 26;
      ctx.beginPath(); ctx.moveTo(x0 + ux * R, y0 + uy * R); ctx.lineTo(x0 + ux * end, y0 + uy * end); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  function drawFlowers(s, dt) {
    const sc = G.cam.scale;
    for (const f of s.flowers) {
      const v = flowerLook(f), spr = flowerSprite(f.sp, f.giant), x = sx(f.x), y = sy(f.y);
      const target = f.st === "wilt" ? 0 : f.wet ? 0.72 : 1;
      if (f.st === "bud") v.open = Math.min(1, v.open + dt / C.BUD);
      else v.open = lerp(v.open, target, Math.min(1, dt * (f.st === "wilt" ? 5 : 7)));
      v.bounce = Math.max(0, v.bounce - dt * 3.2);
      v.on = lerp(v.on, f.on ? 1 : 0, Math.min(1, dt * 8));
      const open = f.st === "bud" ? backOut(v.open) : v.open;
      const k = open * (1 + 0.22 * Math.sin(v.bounce * Math.PI) * v.bounce);
      const R = spr.R * k;
      if (k < 0.02) continue;
      /* a flower the hive is working has a soft halo under it */
      if (v.on > 0.02) {
        const hg = ctx.createRadialGradient(x, y, R * 0.6, x, y, R * 2.1);
        hg.addColorStop(0, "rgba(255,240,170," + (0.42 * v.on) + ")"); hg.addColorStop(1, "rgba(255,240,170,0)");
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, R * 2.1, 0, TAU); ctx.fill();
      }
      const sway = G.calm ? 0 : Math.sin(G.t * 1.3 + f.a * 3) * 0.06;
      ctx.globalAlpha = f.st === "wilt" ? clamp(v.open * 1.4, 0, 1) : f.wet ? 0.82 : 1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(f.a + sway);
      ctx.drawImage(spr.c, -spr.size * k / 2, -spr.size * k / 2, spr.size * k, spr.size * k);
      ctx.restore();
      ctx.globalAlpha = 1;
      if (f.st === "wilt") continue;
      /* what is left in it, as a ring: the one number a flower has */
      const rr = R + 6, frac = clamp(f.n / f.n0, 0, 1), left = f.life - f.age;
      const going = f.st === "open" && !f.held && left < 6 && f.n > 0;
      ctx.lineWidth = 3.4; ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(30,20,5,.22)"; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
      ctx.globalAlpha = going ? 0.45 + 0.55 * Math.abs(Math.sin(G.t * 6)) : 1;
      ctx.strokeStyle = f.wet ? "#bfe0ff" : f.on ? "#ffe07a" : "#fff7dc";
      ctx.beginPath(); ctx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
      ctx.globalAlpha = 1;
      if (v.on > 0.02) {
        ctx.globalAlpha = v.on * 0.9; ctx.strokeStyle = "#fff3b8"; ctx.lineWidth = 2;
        ctx.setLineDash([5, 7]); ctx.lineDashOffset = G.calm ? 0 : G.t * 14;
        ctx.beginPath(); ctx.arc(x, y, rr + 6, 0, TAU); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      if (f.wet) {
        ctx.fillStyle = "rgba(210,235,255,.9)";
        for (let i = 0; i < 3; i++) { const a = i * 2.1 + f.a; ctx.beginPath(); ctx.arc(x + Math.cos(a) * R * 0.5, y + Math.sin(a) * R * 0.5, 2, 0, TAU); ctx.fill(); }
      }
    }
    for (const id in G.flowers) if (G.t - G.flowers[id].seen > 1.5) delete G.flowers[id];
  }

  /* ================= hornets and rain ================= */
  function drawHornets(s, shadows) {
    const frame = Math.floor(G.t * 22) & 1, len = G.sprites.len * 2.3;
    for (const h of s.hornets) {
      let x = sx(h.x), y = sy(h.y);
      if (shadows) {
        if (h.st !== "dead") { ctx.beginPath(); ctx.ellipse(x + 5, y + 8, len * 0.42, len * 0.24, h.a, 0, TAU); ctx.fill(); }
        continue;
      }
      if (h.st === "dead") { ctx.globalAlpha = clamp(h.t / 0.8, 0, 1); stamp(G.sprites.hornet[0], x, y, h.a + (0.8 - h.t) * 6, clamp(h.t / 0.8, 0, 1)); ctx.globalAlpha = 1; continue; }
      const danger = 0.5 + 0.5 * Math.sin(G.t * 9);
      /* she is the one thing in the meadow that is the wrong colour */
      ctx.strokeStyle = "rgba(255,70,50," + (0.35 + 0.4 * danger) + ")"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, len * (0.75 + 0.08 * danger), 0, TAU); ctx.stroke();
      if (h.heat > 0.01) {
        ctx.strokeStyle = "#fff3b8"; ctx.lineWidth = 4.5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(x, y, len * 0.75, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(h.heat, 0, 1)); ctx.stroke();
        const hg = ctx.createRadialGradient(x, y, 0, x, y, len * 0.8);
        hg.addColorStop(0, "rgba(255,150,60," + (0.55 * h.heat) + ")"); hg.addColorStop(1, "rgba(255,150,60,0)");
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, y, len * 0.8, 0, TAU); ctx.fill();
      }
      if (h.ball) { x += (Math.random() - 0.5) * 3; y += (Math.random() - 0.5) * 3; }
      stamp(G.sprites.hornet[frame], x, y, h.a + (h.st === "warn" ? Math.sin(G.t * 7) * 0.25 : 0), 1);
      if (h.st === "warn") {
        /* at the edge, before she comes in: time to see her */
        ctx.fillStyle = "#ff5a3c"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
        ctx.font = "900 22px ui-rounded, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const ix = clamp(x, 26, G.W - 26), iy = clamp(y, 90, G.H - 40) - len * 0.9 - 6 * danger;
        ctx.strokeText("!", ix, iy); ctx.fillText("!", ix, iy);
      }
    }
  }
  function drawClouds(s) {
    const sc = G.cam.scale;
    for (const c of s.clouds) {
      const x = sx(c.x), y = sy(c.y), R = c.r * sc;
      const sg = ctx.createRadialGradient(x, y, R * 0.2, x, y, R * 1.05);
      sg.addColorStop(0, "rgba(40,60,90,.34)"); sg.addColorStop(0.8, "rgba(40,60,90,.26)"); sg.addColorStop(1, "rgba(40,60,90,0)");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, R * 1.05, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(215,235,255,.55)"; ctx.lineWidth = 1.4; ctx.lineCap = "round";
      ctx.beginPath();
      const n = G.calm ? 16 : 46;
      for (let i = 0; i < n; i++) {
        const a = hash(i * 3.3 + c.id) * TAU, rr = Math.sqrt(hash(i * 7.7 + c.id)) * R * 0.95, ph = (G.t * 1.9 + hash(i + c.id)) % 1;
        const px = x + Math.cos(a) * rr - ph * 6, py = y + Math.sin(a) * rr + ph * 16 - 8;
        ctx.moveTo(px, py); ctx.lineTo(px - 2.2, py + 7);
      }
      ctx.stroke();
    }
  }
  function drawCloudTops(s) {
    /* seen from above a cloud would hide what is under it, and what is under
       it is the game. So it is a few soft puffs you can see straight through. */
    const sc = G.cam.scale;
    for (const c of s.clouds) {
      const R = c.r * sc;
      for (let i = 0; i < 7; i++) {
        const a = i * TAU / 7 + c.id, rr = i ? R * 0.52 : 0, pr = R * (i ? 0.5 : 0.62);
        const x = sx(c.x) + Math.cos(a) * rr - R * 0.08, y = sy(c.y) + Math.sin(a) * rr * 0.62 - R * 0.22;
        const pg = ctx.createRadialGradient(x, y - pr * 0.2, pr * 0.1, x, y, pr);
        pg.addColorStop(0, "rgba(255,255,255,.34)"); pg.addColorStop(0.6, "rgba(236,243,252,.2)"); pg.addColorStop(1, "rgba(220,232,248,0)");
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(x, y, pr, 0, TAU); ctx.fill();
      }
    }
  }

  /* ================= the air: pollen, leaves, snow, fireflies ================= */
  function drawAmbient(season, dt, night) {
    const want = G.calm ? 8 : season === "winter" ? 90 : 26;
    while (G.ambient.length < want) G.ambient.push({ x: Math.random() * G.W, y: Math.random() * G.H, ph: Math.random() * TAU, v: 0.5 + Math.random(), r: 1 + Math.random() * 1.8 });
    if (G.ambient.length > want) G.ambient.length = want;
    for (const p of G.ambient) {
      if (season === "winter") {
        p.y += (22 + 30 * p.v) * dt; p.x += (Math.sin(G.t * 0.8 + p.ph) * 10 + G.gust * 260) * dt;
        ctx.globalAlpha = 0.55 + 0.4 * p.v * 0.5; ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      } else if (season === "autumn") {
        p.y += (14 + 14 * p.v) * dt; p.x += Math.sin(G.t * 1.1 + p.ph) * 22 * dt;
        ctx.globalAlpha = 0.75; ctx.fillStyle = ["#d96a2c", "#e8a030", "#b8442a"][Math.floor(p.ph * 3) % 3];
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(G.t * p.v + p.ph);
        ctx.beginPath(); ctx.ellipse(0, 0, p.r * 2.6, p.r * 1.2, 0, 0, TAU); ctx.fill(); ctx.restore();
      } else {
        p.y -= (4 + 5 * p.v) * dt; p.x += Math.sin(G.t * 0.6 + p.ph) * 8 * dt;
        ctx.globalAlpha = 0.28 + 0.25 * Math.sin(G.t * 2 + p.ph);
        ctx.fillStyle = season === "spring" ? "#fff7e0" : "#fff1a8";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }
      if (p.y > G.H + 8) { p.y = -8; p.x = Math.random() * G.W; }
      if (p.y < -8) { p.y = G.H + 8; p.x = Math.random() * G.W; }
      if (p.x > G.W + 8) p.x = -8;
      if (p.x < -8) p.x = G.W + 8;
    }
    ctx.globalAlpha = 1;
    /* a butterfly or two, in the warm half of the year: nothing to do with
       the game, which is the point of them */
    if ((season === "spring" || season === "summer") && night < 0.3 && !G.calm) {
      while (G.flutter.length < 2) G.flutter.push({ x: Math.random() * G.W, y: Math.random() * G.H, a: Math.random() * TAU, ph: Math.random() * TAU, col: ["#ffffff", "#ffe07a", "#ffb3d1", "#bcd7ff"][Math.floor(Math.random() * 4)] });
      for (const b of G.flutter) {
        b.a += Math.sin(G.t * 0.9 + b.ph) * 1.6 * dt;
        b.x += Math.cos(b.a) * 26 * dt; b.y += Math.sin(b.a) * 26 * dt + Math.sin(G.t * 7 + b.ph) * 14 * dt;
        if (b.x < -20) b.x = G.W + 20; if (b.x > G.W + 20) b.x = -20;
        if (b.y < -20) b.y = G.H + 20; if (b.y > G.H + 20) b.y = -20;
        const flap = Math.abs(Math.sin(G.t * 11 + b.ph));
        ctx.fillStyle = "rgba(20,30,10,.14)"; ctx.beginPath(); ctx.ellipse(b.x + 5, b.y + 9, 6 * flap + 1, 3, b.a, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a + Math.PI / 2);
        ctx.globalAlpha = 0.92 * (1 - night * 3);
        for (const side of [-1, 1]) {
          ctx.save(); ctx.scale(side * (0.25 + 0.75 * flap), 1);
          ctx.fillStyle = b.col; ctx.beginPath(); ctx.ellipse(4.5, -2.5, 5, 4.2, 0.5, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(3.6, 3.4, 3.6, 3, -0.4, 0, TAU); ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = "#3a2a18"; ctx.beginPath(); ctx.ellipse(0, 0, 1, 4.6, 0, 0, TAU); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      }
    }
    if (night > 0.05 && season !== "winter") {
      while (G.flies.length < (G.calm ? 5 : 14)) G.flies.push({ x: Math.random() * G.W, y: Math.random() * G.H, ph: Math.random() * TAU, v: 0.4 + Math.random() });
      ctx.globalCompositeOperation = "lighter";
      for (const p of G.flies) {
        p.x += Math.cos(G.t * 0.4 * p.v + p.ph) * 14 * dt; p.y += Math.sin(G.t * 0.5 * p.v + p.ph * 2) * 14 * dt;
        const a = Math.max(0, Math.sin(G.t * 1.6 * p.v + p.ph)) * night;
        const fg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9);
        fg.addColorStop(0, "rgba(230,255,140," + (0.9 * a) + ")"); fg.addColorStop(1, "rgba(230,255,140,0)");
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }

  /* the light of the hour: one wash over everything, and the comb's own glow at night */
  function drawLight(u, night, winter) {
    let col = null, a = 0;
    if (u < 0.14) { col = [255, 196, 150]; a = 0.3 * (1 - u / 0.14); }
    else if (u > 0.7) { col = [255, 176, 96]; a = 0.34 * ease((u - 0.7) / 0.3); }
    if (col && night < 1) {
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + (a * (1 - night)) + ")";
      ctx.fillRect(0, 0, G.W, G.H);
    }
    if (night > 0.01) {
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "rgba(38,48,104," + (0.78 * night) + ")";
      ctx.fillRect(0, 0, G.W, G.H);
    }
    if (winter > 0.01) {
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "rgba(120,150,205," + (0.42 * winter) + ")";
      ctx.fillRect(0, 0, G.W, G.H);
    }
    ctx.globalCompositeOperation = "source-over";
    const glow = Math.max(night, winter * (0.7 + 0.5 * G.warm));
    if (glow > 0.01) {
      const x = sx(0), y = sy(0), R = G.hiveR * G.cam.scale * (2.6 + 0.2 * Math.sin(G.t * 1.7));
      ctx.globalCompositeOperation = "lighter";
      const gg = ctx.createRadialGradient(x, y, 0, x, y, R);
      gg.addColorStop(0, "rgba(255,190,90," + (0.5 * glow) + ")"); gg.addColorStop(0.45, "rgba(255,160,60," + (0.2 * glow) + ")"); gg.addColorStop(1, "rgba(255,150,50,0)");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    /* the edges of the picture, a little darker, so the middle is where you look */
    const vg = ctx.createRadialGradient(G.W / 2, G.H / 2, Math.min(G.W, G.H) * 0.45, G.W / 2, G.H / 2, Math.max(G.W, G.H) * 0.78);
    vg.addColorStop(0, "rgba(20,12,0,0)"); vg.addColorStop(1, "rgba(20,12,0,.3)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, G.W, G.H);
  }

  /* the wind, coming: a ring that closes on the cluster. Tap when it lands. */
  function drawGust(s) {
    if (s.phase !== "winter" || !s.w) return;
    const x = sx(0), y = sy(0), R = G.hiveR * G.cam.scale * 1.2;
    for (const g of s.w.gusts) {
      const until = g.t - s.w.t;
      if (g.hit !== null || until > 1.1 || until < -C.GUST) continue;
      if (until > 0) {
        const u = 1 - until / 1.1;
        ctx.globalAlpha = 0.25 + 0.6 * u; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3 + 2 * u;
        ctx.beginPath(); ctx.arc(x, y, lerp(Math.max(G.W, G.H) * 0.55, R, ease(u)), 0, TAU); ctx.stroke();
      } else {
        const pu = 0.5 + 0.5 * Math.sin(G.t * 12);
        ctx.globalAlpha = 0.6 + 0.4 * pu; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(x, y, R * (1 + 0.05 * pu), 0, TAU); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawFocus() {
    if (!G.focus) return;
    const x = sx(G.focus.x), y = sy(G.focus.y), r = G.focus.r * G.cam.scale + 12;
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -G.t * 20;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, TAU); ctx.stroke();
  }

  /* ================= one frame ================= */
  function draw(s, dt, view) {
    G.t += dt;
    sprites();
    const season = view.season, dayU = view.dayU, night = view.night, winter = view.winter;
    setSeason(season);
    G.gust = Math.max(0, G.gust - dt * 0.9);
    G.warm = Math.max(0, G.warm - dt * 0.7);
    G.squeeze = Math.max(0, G.squeeze - dt * 0.8);
    G.shake = Math.max(0, G.shake - dt * 5);

    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.save();
    if (G.shake > 0 && !G.calm) ctx.translate((Math.random() - 0.5) * 7 * G.shake, (Math.random() - 0.5) * 7 * G.shake);
    drawGround(dt);

    ctx.fillStyle = "rgba(20,30,10,.2)";
    drawFlowerShadows(s);
    drawLines(s);
    drawFlowers(s, dt);
    drawClouds(s);
    drawHive(s, dt, view.goalFrac);
    ctx.fillStyle = "rgba(20,30,10,.24)";
    drawBees(s, dt, true);
    drawHornets(s, true);
    drawBees(s, dt, false);
    drawHornets(s, false);
    drawCloudTops(s);
    drawAmbient(season, dt, night);
    drawLight(dayU, night, winter);
    drawGust(s);
    drawFx(dt);
    drawFocus();
    ctx.restore();
    forget();
  }

  return {
    G: G, resize: resize, draw: draw, sx: sx, sy: sy,
    burst: burst, ring: ring, float: float, drop: drop,
    popCell: function (i) { G.cellPop[i] = 1; },
    bounce: function (id) { if (G.flowers[id]) G.flowers[id].bounce = 1; },
    flowerRadius: flowerRadius,
    born: function (id) { if (G.bees[id]) G.bees[id].born = 1; }
  };
}

root.HiveGfx = { create: create };
})(typeof self !== "undefined" ? self : this);
