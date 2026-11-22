/* sim.js — the hive, with no screen anywhere in it.

   Everything that is true about a game of Hive Mind lives here: where every
   bee is, what every flower holds, how much honey is in the comb and what
   winter will ask for. It runs the same in a browser and in node, which is
   how tools/hive-check.js can play five hundred years of it before anybody
   sees a pixel.

   The whole game is one verb. The player is the hive's attention, and a tap
   is what the hive notices:

     a flower   the bees start working it (tap again and they stop)
     the queen  she lays an egg, paid for in honey
     a hornet   the nearest bees ball her
     in winter  the cluster pulls tight against the wind

   Nothing else is a control. Bees decide the rest for themselves, the way
   bees do: one finds a flower, more follow once she has been there, and they
   share themselves out between everything the hive is paying attention to.

   Units: the hive is at the origin and distances are in "meadow units" (the
   view is about one to two units across). Time is in seconds. The caller
   steps the world with step(state, dt) and reads state.events for what
   happened, which is all the juice — sound, sparks, numbers — ever needs.  */
(function (root) {
"use strict";

const D = (typeof module !== "undefined" && module.exports) ? require("./data.js") : root.HiveData;

const CFG = {
  DAY: 50,             /* seconds of daylight on a spring day                */
  SEASONS: ["spring", "spring", "summer", "summer", "autumn", "autumn"],
  DAYLEN: { spring: 1, summer: 1.12, autumn: 0.86 },
  WANT: { spring: 3.2, summer: 5.2, autumn: 3.2 },   /* flowers open at once */
  BEE_SPEED: 0.17,     /* meadow units a second                              */
  WORK: 2.8,           /* seconds a bee spends on a flower                   */
  DWELL: 0.7,          /* seconds unloading at home                          */
  HEX: 0.03,           /* the size of a comb cell                            */
  CELL: 8,             /* honey a cell holds                                 */
  CELLS0: 6,           /* honey cells a new hive starts with                 */
  CELLS_MAX: 84,       /* five rings of comb, less the queen and her nursery */
  JAR: 50,             /* honey in a jar                                     */
  EGG_COST: 10,
  HATCH: 9,
  NURSERY: 6,
  START_BEES: 4,
  START_HONEY: 6,      /* a swarm arrives with its crops full: enough to start on */
  BUD: 0.9,            /* seconds a flower takes to open                     */
  AREA: [0.62, 2.3],   /* the view, in square units, from a new hive to a grown one */
  GROWN: 30,           /* bees at which the hive ranges as far as it ever will */
  HORNET_SPEED: 0.15,
  HORNET_WARN: 3.2,
  SNATCH: 3.4,         /* seconds between the bees a hornet takes            */
  BALL: 3.0,           /* seconds a full ball needs to finish a hornet       */
  WINTER: 24,          /* seconds the winter lasts on screen                 */
  GUST: 1.5,           /* seconds a gust can be answered in                  */
  NEED: 300,          /* honey the first winter asks for                   */
  NEED_UP: 1.15,      /* and how much more each winter after it            */
  KEEP: 2,            /* things the hive still knows in spring             */
  SHORT: 15,          /* extra honey winter costs for each bee the cluster is short */
  HUDDLE: 0.045        /* share of the winter's honey one good huddle saves  */
};

/* ---------- a seeded dice, kept in the state so a saved game rolls the same ---------- */
function rnd(s) {
  s.rs = (s.rs + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rs ^ (s.rs >>> 15), 1 | s.rs);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function between(s, a, b) { return a + (b - a) * rnd(s); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

/* ---------- the comb: cells in a spiral, out from the queen ---------- */
const SPIRAL = (function () {
  const out = [{ q: 0, r: 0, ring: 0 }];
  const dirs = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  for (let k = 1; k <= 7; k++) {
    let q = 0, r = -k;                       /* start at the top, walk the ring */
    for (let side = 0; side < 6; side++) {
      for (let i = 0; i < k; i++) {
        out.push({ q: q, r: r, ring: k });
        q += dirs[side][0]; r += dirs[side][1];
      }
    }
  }
  return out;
})();
function cellXY(i) {
  const c = SPIRAL[i];
  return { x: CFG.HEX * Math.sqrt(3) * (c.q + c.r / 2), y: CFG.HEX * 1.5 * c.r, ring: c.ring };
}
/* cell 0 is the queen, 1-6 her nursery, 7 onward is honey */
function honeyCellIndex(k) { return 7 + k; }
function hiveR(s) {
  const ring = SPIRAL[honeyCellIndex(Math.max(0, s.cells - 1))].ring;
  return (ring * 1.5 + 1.25) * CFG.HEX;
}

/* ---------- what the hive has learned ---------- */
function lv(s, id) { return s.cards[id] || 0; }
function yearRow(s) { return D.YEARS[(s.year - 1) % D.YEARS.length]; }
function tier(s) { return Math.floor((s.year - 1) / D.YEARS.length); }
function beeSpeed(s) { return CFG.BEE_SPEED * (1 + 0.16 * lv(s, "wings")); }
function workTime(s) { return CFG.WORK * (1 - 0.2 * lv(s, "memory")); }
function eggCost(s) { return Math.max(4, CFG.EGG_COST - 2 * lv(s, "jelly")); }
function hatchTime(s) { return CFG.HATCH * (1 - 0.28 * lv(s, "nurses")); }
function season(s) { return s.phase === "winter" || s.phase === "thaw" ? "winter" : CFG.SEASONS[Math.min(s.day, CFG.SEASONS.length - 1)]; }
function dayLen(s) {
  const y = yearRow(s), sn = CFG.SEASONS[s.day];
  let d = CFG.DAY * CFG.DAYLEN[sn] + 7 * lv(s, "early");
  if (sn === "autumn" && y.autumn) d *= y.autumn;
  return d;
}

/* What winter will ask for. Two numbers, both on screen all year:
   enough bees to hold the cluster's heat, and enough honey to feed it.
   A cluster that is too small burns more, so every missing bee costs honey. */
function goals(s) {
  const y = yearRow(s), g = s.gentle ? 0.8 : 1;
  const bees = Math.max(6, Math.round((12 + 2 * (s.year - 1)) * g) - 3 * lv(s, "winterbees"));
  let honey = CFG.NEED * Math.pow(CFG.NEED_UP, s.year - 1) * g;
  if (y.winter) honey *= y.winter + 0.05 * tier(s);
  honey *= 1 - 0.12 * lv(s, "propolis");
  if (lv(s, "winterbees")) honey *= 0.94;
  /* winter never asks for more than a full comb can hold */
  honey = Math.round(Math.min(honey, CFG.CELLS_MAX * CFG.CELL * 0.92));
  const short = Math.max(0, bees - s.bees.length - s.brood.length);
  return { bees: bees, honey: honey, short: short, need: honey + CFG.SHORT * short };
}

/* ---------- a new hive ---------- */
function create(opts) {
  opts = opts || {};
  const s = {
    v: 1,
    rs: (opts.seed === undefined ? (Math.random() * 4294967296) : opts.seed) | 0,
    gentle: !!opts.gentle,
    year: 1, day: 0, phase: "day", clock: 0, pt: 0, started: false,
    honey: CFG.START_HONEY, cells: CFG.CELLS0, peak: CFG.START_BEES,
    bees: [], brood: [], flowers: [], hornets: [], clouds: [],
    cards: {}, offers: null,
    honeyBy: {}, today: { honey: 0, hatched: 0, lost: 0 },
    stats: { honey: 0, hatched: 0, lost: 0, hornets: 0, jars: 0, flowers: 0 },
    seen: {},
    plan: { hornets: [], clouds: [], giant: -1 },
    spawnT: 0, nextId: 1, w: null,
    view: { w: 0.62, h: 1.0, aspect: 0.62 },
    events: []
  };
  for (let i = 0; i < CFG.START_BEES; i++) s.bees.push(newBee(s));
  setAspect(s, opts.aspect || 0.62);
  startDay(s);
  return s;
}
function newBee(s) {
  return { id: s.nextId++, x: 0, y: 0, st: "home", f: 0, h: 0, carry: 0, sp: "", t: 0.2 + 0.5 * rnd(s), a: rnd(s) * 6.283, dn: 0 };
}
function emit(s, type, o) { o = o || {}; o.type = type; s.events.push(o); }
function seeOnce(s, key) { if (s.seen[key]) return false; s.seen[key] = 1; return true; }

/* ---------- how far the hive can see ----------
   A new hive works the flowers on its doorstep. As it grows it ranges
   farther, and the view pulls back to show it. The view only changes at
   dawn, so the meadow never moves under a finger.                          */
function growth(s) { return clamp((s.peak - CFG.START_BEES) / (CFG.GROWN - CFG.START_BEES), 0, 1); }
function setAspect(s, aspect) {
  aspect = clamp(aspect, 0.48, 2.1);
  const area = lerp(CFG.AREA[0], CFG.AREA[1], Math.pow(growth(s), 0.8));
  s.view.aspect = aspect;
  s.view.h = Math.sqrt(area / aspect);
  s.view.w = aspect * s.view.h;
  /* however big the comb gets, there is always meadow on every side of it */
  const tight = Math.min(s.view.w, s.view.h) / (hiveR(s) * 4.4);
  if (tight < 1) { s.view.w /= tight; s.view.h /= tight; }
  /* a turned phone must not leave a flower off the edge of the world */
  const hw = s.view.w / 2 - 0.07, hh = s.view.h / 2 - 0.07;
  for (const f of s.flowers) { f.x = clamp(f.x, -hw, hw); f.y = clamp(f.y, -hh, hh); }
}
function reach(s) { return Math.hypot(s.view.w / 2, s.view.h / 2) * 0.94; }

/* ---------- a day ---------- */
function startDay(s) {
  s.phase = "day"; s.clock = 0; s.pt = 0; s.spawnT = 0.4;
  s.today = { honey: 0, hatched: 0, lost: 0 };
  s.flowers = []; s.hornets = []; s.clouds = []; s.offers = null;
  for (const b of s.bees) { b.st = "home"; b.x = 0; b.y = 0; b.f = 0; b.h = 0; b.carry = 0; b.t = 0.2 + 0.6 * rnd(s); }
  setAspect(s, s.view.aspect);
  const sn = CFG.SEASONS[s.day], y = yearRow(s), len = dayLen(s);
  const plan = { hornets: [], clouds: [], giant: lv(s, "giant") ? len * between(s, 0.3, 0.5) : -1 };

  /* hornets: none until the hive has seen its first summer */
  let nh = 0;
  if (s.year === 1) nh = [0, 0, 1, 1, 1, 1][s.day];
  else {
    nh = (sn === "summer" ? 2 : 1) + Math.floor((s.year - 2) / 2);
    if (y.hornets && sn === "summer") nh += y.hornets + tier(s);
  }
  if (s.gentle) nh = Math.min(nh, 1);
  for (let i = 0; i < nh; i++) plan.hornets.push(len * between(s, 0.18 + 0.6 * i / Math.max(1, nh), 0.26 + 0.6 * (i + 0.7) / Math.max(1, nh)));

  /* rain: one shower in the first year, so it is met once and gently */
  let nc = 0;
  if (s.year === 1) nc = s.day === 3 ? 1 : 0;
  else nc = (rnd(s) < 0.55 ? 1 : 0) + (y.rain ? 1 : 0);
  for (let i = 0; i < nc; i++) plan.clouds.push(len * between(s, 0.2 + 0.4 * i, 0.5 + 0.3 * i));
  s.plan = plan;
  emit(s, "dawn", { year: s.year, day: s.day, season: sn });
}

/* how many flowers should be open right now */
function want(s) {
  const sn = CFG.SEASONS[s.day], y = yearRow(s), u = s.clock / dayLen(s);
  let n = CFG.WANT[sn] * (0.72 + 0.7 * growth(s));
  n *= 0.5 + 0.5 * Math.pow(Math.sin(Math.PI * clamp(u * 0.92 + 0.08, 0, 1)), 0.7);
  if (y.flowers) n *= y.flowers - 0.04 * tier(s);
  if (sn === "autumn" && s.day === CFG.SEASONS.length - 1) n *= 0.8;      /* the year runs down */
  n += lv(s, "bloom");
  if (s.year === 1 && s.day === 0 && s.clock < 10) n = Math.min(n, 2);     /* the first minute */
  return Math.max(1.2, n);
}

/* a place for a flower: in view, off the hive, and not on top of another */
function findSpot(s) {
  const hw = s.view.w / 2 - 0.085, hh = s.view.h / 2 - 0.085, keep = hiveR(s) + 0.085;
  let best = null, bestD = -1;
  for (let i = 0; i < 14; i++) {
    const x = between(s, -hw, hw), y = between(s, -hh, hh);
    if (Math.hypot(x, y) < keep) continue;
    let d = 9;
    for (const f of s.flowers) d = Math.min(d, Math.hypot(f.x - x, f.y - y));
    if (d > bestD) { bestD = d; best = { x: x, y: y }; }
    if (d > 0.3) break;
  }
  return bestD > 0.12 ? best : null;
}
function addFlower(s, sp, x, y, opt) {
  opt = opt || {};
  const S = D.SPECIES[sp], big = opt.giant ? 1.8 : 1;
  const n0 = Math.round(between(s, S.nectar[0], S.nectar[1]) * big);
  const f = {
    id: s.nextId++, sp: sp, x: x, y: y, n: n0, n0: n0,
    seats: S.seats + (opt.giant ? 3 : 0), age: 0,
    life: between(s, S.life[0], S.life[1]) * (1 + 0.3 * lv(s, "scouts")) * (opt.giant ? 1.25 : 1),
    st: "bud", on: false, wet: false, scouted: false, giant: !!opt.giant, held: !!opt.held,
    dn: clamp(Math.hypot(x, y) / reach(s), 0, 1), a: rnd(s) * 6.283
  };
  s.flowers.push(f);
  s.stats.flowers++;
  emit(s, "bloom", { id: f.id, sp: sp, x: x, y: y, first: seeOnce(s, "sp:" + sp) });
  return f;
}
function spawnFlower(s, opt) {
  const sn = CFG.SEASONS[s.day], spot = findSpot(s);
  if (!spot) return null;
  const dn = clamp(Math.hypot(spot.x, spot.y) / reach(s), 0, 1);
  let total = 0; const pool = [];
  for (const k in D.SPECIES) {
    const S = D.SPECIES[k];
    if (S.seasons.indexOf(sn) < 0) continue;
    if (opt && opt.giant && S.value < 2) continue;
    /* how well this spot suits it: full weight inside its band, fading outside */
    const off = dn < S.band[0] ? S.band[0] - dn : dn > S.band[1] ? dn - S.band[1] : 0;
    const w = S.w * Math.max(0.04, 1 - off * 4);
    pool.push([k, w]); total += w;
  }
  let r = rnd(s) * total, pick = pool[0][0];
  for (const p of pool) { r -= p[1]; if (r <= 0) { pick = p[0]; break; } }
  return addFlower(s, pick, spot.x, spot.y, opt);
}

/* ---------- which flower a bee goes to ----------
   Bees share themselves out: the flower with the most room, nearest first.
   A flower nobody has been to takes one bee, the scout, and the rest follow
   once she has landed. That delay is the price of a far flower, and it is
   the true one.                                                            */
function counts(s) {
  const c = {};
  for (const b of s.bees) if (b.f && (b.st === "out" || b.st === "work")) c[b.f] = (c[b.f] || 0) + 1;
  return c;
}
function room(f, c) {
  if (!f.on || f.st !== "open" || f.wet) return 0;
  const n = c[f.id] || 0;
  if (!f.scouted && n >= 1) return 0;
  return Math.min(f.seats - n, f.n - n);
}
function pickFlower(s, b, c) {
  let best = null, bestScore = 1e9;
  for (const f of s.flowers) {
    if (room(f, c) <= 0) continue;
    const d = Math.hypot(f.x - b.x, f.y - b.y);
    let score = (c[f.id] || 0) / f.seats + 0.35 * d;
    if (f.id === b.f) score -= 0.22;                     /* she knows this one */
    if (score < bestScore) { bestScore = score; best = f; }
  }
  return best;
}
function flowerById(s, id) { for (const f of s.flowers) if (f.id === id) return f; return null; }
function hornetById(s, id) { for (const h of s.hornets) if (h.id === id) return h; return null; }

function moveTo(o, tx, ty, dist) {
  const dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
  if (d > 1e-6) o.a = Math.atan2(dy, dx);
  if (d <= dist) { o.x = tx; o.y = ty; return true; }
  o.x += dx / d * dist; o.y += dy / d * dist;
  return false;
}
function underCloud(s, x, y) {
  for (const c of s.clouds) if (Math.hypot(c.x - x, c.y - y) < c.r) return true;
  return false;
}

/* ---------- honey in, honey out ---------- */
function addHoney(s, amt, sp) {
  s.honey += amt;
  s.today.honey += amt; s.stats.honey += amt;
  if (sp) s.honeyBy[sp] = (s.honeyBy[sp] || 0) + amt;
  let grew = false;
  while (s.honey > (s.cells - 1) * CFG.CELL && s.cells < CFG.CELLS_MAX) {
    s.cells++; grew = true;
    const i = honeyCellIndex(s.cells - 1), ring = SPIRAL[i].ring;
    emit(s, "grow", { cell: i, first: seeOnce(s, "grow") });
    if (SPIRAL[i + 1] && SPIRAL[i + 1].ring !== ring) emit(s, "ring", { ring: ring, first: seeOnce(s, "ring") });
  }
  /* a comb with no room left gives its honey up as jars */
  while (s.honey > CFG.CELLS_MAX * CFG.CELL) { s.honey -= CFG.JAR; s.early = (s.early || 0) + 1; emit(s, "jar", { early: true }); }
  const g = goals(s);
  if (s.honey >= g.need && seeOnce(s, "goalHoney" + s.year)) emit(s, "goalHoney", {});
  return grew;
}
function loseBee(s, b, how) {
  const i = s.bees.indexOf(b);
  if (i >= 0) s.bees.splice(i, 1);
  s.today.lost++; s.stats.lost++;
  emit(s, "lost", { x: b.x, y: b.y, how: how });
}

/* ---------- the taps ---------- */
function tapFlower(s, id) {
  const f = flowerById(s, id);
  if (!f || s.phase !== "day" || f.st === "wilt") return false;
  f.on = !f.on;
  if (f.on && !s.started) { s.started = true; emit(s, "started", {}); }
  emit(s, f.on ? "flowerOn" : "flowerOff", { id: id, x: f.x, y: f.y, sp: f.sp });
  return true;
}
function tapQueen(s) {
  if (s.phase !== "day" && s.phase !== "dusk") return false;
  const cost = eggCost(s);
  if (s.brood.length >= CFG.NURSERY) { emit(s, "nurseryFull", {}); return false; }
  if (s.honey < cost) { emit(s, "noHoney", { cost: cost }); return false; }
  s.honey -= cost;
  const used = {};
  for (const b of s.brood) used[b.slot] = 1;
  let slot = 1; while (used[slot]) slot++;
  s.brood.push({ slot: slot, t: 0, dur: hatchTime(s) });
  emit(s, "lay", { slot: slot, cost: cost, first: seeOnce(s, "lay") });
  return true;
}
function tapHornet(s, id) {
  const h = hornetById(s, id);
  if (!h || h.st === "dead" || h.st === "flee") return false;
  callGuards(s, h);
  emit(s, "ballCall", { id: id, x: h.x, y: h.y });
  return true;
}
function callGuards(s, h) {
  h.called = true;
  let have = 0;
  for (const b of s.bees) if (b.h === h.id) have++;
  const wantN = h.need + 2 - have;
  if (wantN <= 0) return;
  const pool = s.bees.filter(function (b) { return !b.h; });
  pool.sort(function (p, q) {
    /* a bee with a load keeps flying home if anybody else can come */
    return (Math.hypot(p.x - h.x, p.y - h.y) + (p.carry ? 0.25 : 0)) - (Math.hypot(q.x - h.x, q.y - h.y) + (q.carry ? 0.25 : 0));
  });
  for (let i = 0; i < Math.min(wantN, pool.length); i++) { pool[i].st = "guard"; pool[i].h = h.id; }
}
function huddle(s) {
  if (s.phase !== "winter" || !s.w) return false;
  for (const g of s.w.gusts) {
    if (g.hit === null && s.w.t >= g.t && s.w.t <= g.t + CFG.GUST) {
      g.hit = true;
      const save = s.w.need * CFG.HUDDLE;
      s.w.left = Math.max(0, s.w.left - save);
      s.w.saved += save;
      emit(s, "huddleHit", { save: save, first: seeOnce(s, "huddle") });
      return true;
    }
  }
  emit(s, "shiver", {});
  return false;
}

/* ---------- night: what the hive learns ---------- */
function makeOffers(s) {
  const open = Object.keys(D.CARDS).filter(function (k) { return lv(s, k) < D.CARDS[k].max; });
  if (!open.length) return [];
  if (!Object.keys(s.cards).length && s.year === 1 && s.day === 0) return D.FIRST_OFFER.slice();
  const sn = CFG.SEASONS[s.day], out = [];
  const weight = function (k) {
    if (k === "winterbees" || k === "propolis") return sn === "spring" ? 0.25 : sn === "summer" ? 1 : 2.2;
    if (k === "guards") return s.year === 1 && s.day < 1 ? 0.2 : 1.2;
    if (k === "jelly" || k === "nurses" || k === "twins") return sn === "autumn" ? 0.3 : 1.2;
    return 1;
  };
  const pool = open.map(function (k) { return [k, weight(k)]; });
  while (out.length < 3 && pool.length) {
    let total = 0; for (const p of pool) total += p[1];
    let r = rnd(s) * total, at = 0;
    for (let i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) { at = i; break; } }
    out.push(pool[at][0]); pool.splice(at, 1);
  }
  return out;
}
function pickCard(s, id) {
  if (s.phase !== "night") return false;
  if (id && s.offers && s.offers.indexOf(id) >= 0) {
    s.cards[id] = lv(s, id) + 1;
    emit(s, "learned", { id: id, level: s.cards[id] });
  }
  s.offers = null;
  s.day++;
  if (s.day >= CFG.SEASONS.length) startWinter(s); else startDay(s);
  return true;
}

/* ---------- winter ---------- */
function startWinter(s) {
  /* an egg already in the nursery is counted as a bee all autumn, so it is
     one: the last brood hatches into the cluster */
  for (const e of s.brood) { void e; s.bees.push(newBee(s)); }
  s.brood = [];
  const g = goals(s);
  s.day = CFG.SEASONS.length - 1;
  s.phase = "winter"; s.pt = 0;
  s.flowers = []; s.hornets = []; s.clouds = [];
  for (const b of s.bees) { b.st = "home"; b.x = 0; b.y = 0; b.f = 0; b.h = 0; b.carry = 0; }
  const n = 4 + Math.min(2, Math.floor(s.year / 3));
  const gusts = [];
  for (let i = 0; i < n; i++) gusts.push({ t: CFG.WINTER * (0.16 + 0.68 * (i + between(s, 0.15, 0.85)) / n), hit: null, told: false });
  s.w = { t: 0, need: g.need, left: g.need, base: g.honey, short: g.short, start: s.honey, saved: 0, gusts: gusts, cause: "" };
  emit(s, "winter", { need: g.need, honey: s.honey, bees: s.bees.length, short: g.short });
}
function stepWinter(s, dt) {
  const w = s.w;
  w.t += dt;
  for (const g of w.gusts) {
    if (!g.told && w.t >= g.t - 1.1) { g.told = true; emit(s, "gustComing", { at: g.t }); }
    if (g.hit === null && w.t >= g.t && !g.blown) { g.blown = true; emit(s, "gust", {}); }
    if (g.hit === null && w.t > g.t + CFG.GUST) { g.hit = false; emit(s, "huddleMiss", {}); }
  }
  /* the cluster eats what is left of its need, evenly, to the last night */
  const remain = Math.max(0.001, CFG.WINTER - (w.t - dt));
  const eat = Math.min(w.left, w.left * dt / remain);
  if (eat > 0) {
    if (s.honey >= eat) { s.honey -= eat; w.left -= eat; }
    else {
      w.left -= s.honey; s.honey = 0;
      if (s.gentle) {
        /* the gentle game never loses the hive: it comes through thin */
        const keep = Math.max(3, Math.ceil(s.bees.length / 2));
        s.bees.length = keep; w.left = 0; w.thin = true;
      } else {
        w.cause = (w.start >= w.base) ? "cluster" : "honey";
        s.phase = "dead";
        emit(s, "dead", { short: Math.ceil(w.left), cause: w.cause, year: s.year, night: w.t / CFG.WINTER });
        return;
      }
    }
  }
  if (w.t >= CFG.WINTER) endYear(s);
}
function jarLabel(s) {
  let total = 0, top = "", topV = 0;
  for (const k in s.honeyBy) { total += s.honeyBy[k]; if (s.honeyBy[k] > topV) { topV = s.honeyBy[k]; top = k; } }
  const share = total > 0 ? topV / total : 0;
  if (share >= 0.5) return { sp: top, share: share, pure: share >= 0.7, name: D.SPECIES[top].name + " honey" };
  return { sp: top, share: share, pure: false, name: "Wildflower honey" };
}
function endYear(s) {
  const jars = Math.floor(s.honey / CFG.JAR) + (s.early || 0);
  s.honey -= Math.floor(s.honey / CFG.JAR) * CFG.JAR;
  s.early = 0;
  s.stats.jars += jars;
  const label = jarLabel(s);
  s.phase = "thaw"; s.pt = 0;
  emit(s, "yearEnd", {
    year: s.year, name: yearRow(s).name, jars: jars, label: label, bees: s.bees.length,
    thin: !!s.w.thin, saved: s.w.saved, huddles: s.w.gusts.filter(function (g) { return g.hit; }).length,
    gusts: s.w.gusts.length, first: seeOnce(s, "thaw")
  });
}
/* Spring. The bees that wintered are old and will not see summer, and most
   of what the hive learned went with the bees who learned it. It keeps a
   little: the player chooses which.                                        */
function keepCount(s) { return s.gentle ? 3 : CFG.KEEP; }
function nextYear(s, keep) {
  if (s.phase !== "thaw") return false;
  const owned = Object.keys(s.cards), kept = {};
  let list = (keep || []).filter(function (k, i, arr) { return owned.indexOf(k) >= 0 && arr.indexOf(k) === i; });
  if (owned.length <= keepCount(s)) list = owned;
  list = list.slice(0, keepCount(s));
  for (const k of list) kept[k] = s.cards[k];
  s.cards = kept;
  s.year++; s.day = 0; s.w = null; s.honeyBy = {};
  const carry = Math.max(5, Math.round(s.bees.length * (s.gentle ? 0.6 : 0.45)));
  s.bees.length = Math.min(s.bees.length, carry);
  while (s.bees.length < 5) s.bees.push(newBee(s));
  s.peak = s.bees.length;
  s.brood = []; s.started = false;
  /* last year's comb is old and dark; the bees draw fresh wax as they need it */
  s.cells = Math.max(CFG.CELLS0, Math.ceil(s.honey / CFG.CELL) + 1);
  startDay(s);
  emit(s, "newYear", { year: s.year, name: yearRow(s).name, blurb: yearRow(s).blurb, kept: list });
  return true;
}

/* ---------- one step of the world ---------- */
function step(s, dt) {
  /* long frames are taken in slices, so nothing ever flies through anything */
  while (dt > 0) {
    const d = Math.min(dt, 0.1);
    dt -= d;
    stepOnce(s, d);
  }
}
function stepOnce(s, dt) {
  s.pt += dt;
  if (s.phase === "winter") { stepWinter(s, dt); return; }
  if (s.phase !== "day" && s.phase !== "dusk") return;

  stepBrood(s, dt);

  if (s.phase === "day") {
    if (!s.started) {
      /* before the first tap there is one flower, on the doorstep, and it waits */
      if (!s.flowers.length) {
        const r = hiveR(s) + 0.12, a = 0.62;
        const sn = CFG.SEASONS[s.day], sp = sn === "summer" ? "clover" : sn === "autumn" ? "aster" : s.year === 1 ? "crocus" : "dandelion";
        addFlower(s, sp, r * Math.cos(a), r * Math.sin(a), { held: true });
      }
    } else {
      s.clock += dt;
      const len = dayLen(s);
      s.spawnT -= dt;
      if (s.spawnT <= 0 && s.clock < len * 0.86) {
        let open = 0;
        for (const f of s.flowers) if (f.st !== "wilt") open++;
        if (open < want(s)) { spawnFlower(s); s.spawnT = between(s, 0.9, 1.9); } else s.spawnT = 0.5;
      }
      if (s.plan.giant >= 0 && s.clock >= s.plan.giant) { s.plan.giant = -1; spawnFlower(s, { giant: true }); }
      while (s.plan.hornets.length && s.clock >= s.plan.hornets[0]) { s.plan.hornets.shift(); spawnHornet(s); }
      while (s.plan.clouds.length && s.clock >= s.plan.clouds[0]) { s.plan.clouds.shift(); spawnCloud(s); }
      if (s.clock >= len) startDusk(s);
    }
  } else if (s.phase === "dusk") {
    let out = 0;
    for (const b of s.bees) if (b.st !== "home") out++;
    if ((out === 0 && s.pt > 1.2) || s.pt > 10) startNight(s);
  }

  stepClouds(s, dt);
  stepFlowers(s, dt);
  stepBees(s, dt);
  stepHornets(s, dt);
}

function stepBrood(s, dt) {
  for (let i = s.brood.length - 1; i >= 0; i--) {
    const e = s.brood[i];
    e.t += dt;
    if (e.t >= e.dur) {
      s.brood.splice(i, 1);
      const n = 1 + (rnd(s) < 0.25 * lv(s, "twins") ? 1 : 0);
      for (let k = 0; k < n; k++) { s.bees.push(newBee(s)); s.today.hatched++; s.stats.hatched++; }
      s.peak = Math.max(s.peak, s.bees.length);
      emit(s, "hatch", { slot: e.slot, n: n, first: seeOnce(s, "hatch") });
      if (s.bees.length >= goals(s).bees && seeOnce(s, "goalBees" + s.year)) emit(s, "goalBees", {});
    }
  }
}

function startDusk(s) {
  s.phase = "dusk"; s.pt = 0;
  for (const f of s.flowers) if (f.st !== "wilt") { f.st = "wilt"; f.age = 0; f.on = false; }
  for (const h of s.hornets) if (h.st !== "dead") h.st = "flee";
  for (const b of s.bees) {
    if (b.st === "work") { takeLoad(s, b, flowerById(s, b.f)); }
    else if (b.st !== "home") { b.st = "back"; b.h = 0; }
  }
  emit(s, "dusk", { first: seeOnce(s, "dusk") });
}
function startNight(s) {
  s.phase = "night"; s.pt = 0;
  s.flowers = []; s.hornets = []; s.clouds = [];
  for (const b of s.bees) { b.st = "home"; b.x = 0; b.y = 0; b.h = 0; b.f = 0; }
  s.offers = makeOffers(s);
  const last = s.day >= CFG.SEASONS.length - 1;
  emit(s, "night", { offers: s.offers, today: s.today, last: last, season: CFG.SEASONS[s.day] });
}

function stepFlowers(s, dt) {
  const c = counts(s);
  for (let i = s.flowers.length - 1; i >= 0; i--) {
    const f = s.flowers[i];
    if (f.st === "bud") { f.age += dt; if (f.age >= CFG.BUD) { f.st = "open"; f.age = 0; } continue; }
    if (!(f.held && !s.started)) f.age += dt;
    if (f.st === "wilt") { if (f.age >= 0.9) s.flowers.splice(i, 1); continue; }
    const wet = underCloud(s, f.x, f.y);
    if (wet && !f.wet) { f.wet = true; }
    if (!wet && f.wet) {
      /* rain is good for a flower */
      f.wet = false;
      f.n = Math.min(Math.round(f.n0 * 1.3), f.n + Math.ceil(f.n0 * 0.4));
      f.life += 9;
      emit(s, "refresh", { id: f.id, x: f.x, y: f.y, first: seeOnce(s, "refresh") });
    }
    if (f.n <= 0 && !(c[f.id] > 0)) { f.st = "wilt"; f.age = 0; emit(s, "dry", { id: f.id, x: f.x, y: f.y, sp: f.sp }); continue; }
    if (f.age >= f.life && !f.wet) { f.st = "wilt"; f.age = 0; emit(s, "wilt", { id: f.id, x: f.x, y: f.y, left: f.n, on: f.on }); }
  }
}

function takeLoad(s, b, f) {
  if (f && f.n > 0) {
    f.n--;
    const S = D.SPECIES[f.sp];
    b.carry = S.value * (1 + 0.2 * lv(s, "tongue")) * (f.dn > 0.5 ? 1 + 0.25 * lv(s, "dance") : 1);
    b.sp = f.sp;
  }
  b.st = "back";
}

function stepBees(s, dt) {
  const c = counts(s), sp = beeSpeed(s);
  let idle = 0;
  for (let i = 0; i < s.bees.length; i++) {
    const b = s.bees[i];
    const v = sp * (underCloud(s, b.x, b.y) ? 0.55 : 1) * dt;
    if (b.st === "home") {
      b.t -= dt;
      if (b.t > 0 || s.phase !== "day") continue;
      const f = pickFlower(s, b, c);
      if (f) {
        b.st = "out"; b.f = f.id; b.x = 0; b.y = 0;
        c[f.id] = (c[f.id] || 0) + 1;
      } else { idle++; b.t = 0.25; }
    } else if (b.st === "out") {
      let f = flowerById(s, b.f);
      if (!f || !f.on || f.st === "wilt" || f.wet || f.n <= 0) {
        /* her flower is gone: try another from where she is, or go home */
        if (f) c[b.f] = Math.max(0, (c[b.f] || 1) - 1);
        f = s.phase === "day" ? pickFlower(s, b, c) : null;
        if (f) { b.f = f.id; c[f.id] = (c[f.id] || 0) + 1; } else { b.st = "back"; b.f = 0; continue; }
      }
      if (moveTo(b, f.x, f.y, v)) {
        b.st = "work"; b.t = workTime(s);
        if (!f.scouted) { f.scouted = true; emit(s, "recruit", { id: f.id, x: f.x, y: f.y, first: seeOnce(s, "recruit") }); }
      }
    } else if (b.st === "work") {
      const f = flowerById(s, b.f);
      if (!f || f.st === "wilt") { b.st = "back"; continue; }
      b.t -= dt;
      if (b.t <= 0) takeLoad(s, b, f);
    } else if (b.st === "back") {
      if (moveTo(b, 0, 0, v)) {
        if (b.carry > 0) {
          const amt = b.carry, spc = b.sp;
          b.carry = 0;
          const before = Math.floor(s.honey / CFG.CELL);
          addHoney(s, amt, spc);
          emit(s, "deliver", { amt: amt, sp: spc, first: seeOnce(s, "deliver"), cell: Math.floor(s.honey / CFG.CELL) > before });
        }
        b.st = "home"; b.t = CFG.DWELL;
      }
    } else if (b.st === "guard" || b.st === "ball") {
      const h = hornetById(s, b.h);
      if (!h || h.st === "dead" || h.st === "flee") { b.h = 0; b.st = "back"; continue; }
      if (b.st === "guard") { if (moveTo(b, h.x, h.y, v * 1.5)) b.st = "ball"; }
      else { b.x = h.x; b.y = h.y; }
    }
  }
  if (s.started && s.phase === "day" && idle >= 3 && s.clock > 8 && seeOnce(s, "idle")) emit(s, "idle", { n: idle });
  s.idle = idle;
}

/* ---------- hornets ---------- */
function spawnHornet(s) {
  if (s.bees.length <= 4) return;
  const hw = s.view.w / 2, hh = s.view.h / 2, side = Math.floor(rnd(s) * 4);
  const p = side === 0 ? { x: between(s, -hw, hw) * 0.7, y: -hh } : side === 1 ? { x: hw, y: between(s, -hh, hh) * 0.7 }
          : side === 2 ? { x: between(s, -hw, hw) * 0.7, y: hh } : { x: -hw, y: between(s, -hh, hh) * 0.7 };
  const h = {
    id: s.nextId++, x: p.x * 0.97, y: p.y * 0.97, ex: p.x * 1.25, ey: p.y * 1.25, a: Math.atan2(-p.y, -p.x),
    st: "warn", t: CFG.HORNET_WARN, heat: 0, took: 0, target: 0, called: false, retarget: 4, ball: 0,
    need: Math.min(9, 3 + Math.ceil(s.year / 1.5)), greed: s.gentle ? 1 : Math.min(5, 1 + s.year)
  };
  s.hornets.push(h);
  emit(s, "hornetWarn", { id: h.id, x: h.x, y: h.y, first: seeOnce(s, "hornetWarn") });
}
function hornetTarget(s, h) {
  /* she goes where the bees are thickest */
  const c = counts(s);
  let best = null, n = 0;
  for (const f of s.flowers) if (f.st === "open" && (c[f.id] || 0) > n) { n = c[f.id]; best = f; }
  if (best) { h.target = best.id; return { x: best.x, y: best.y }; }
  h.target = 0;
  const r = hiveR(s) + 0.03, a = Math.atan2(h.y, h.x);
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}
function stepHornets(s, dt) {
  for (let i = s.hornets.length - 1; i >= 0; i--) {
    const h = s.hornets[i];
    let ball = 0;
    for (const b of s.bees) if (b.h === h.id && b.st === "ball") ball++;
    h.ball = ball;
    if (h.st === "warn") {
      h.t -= dt;
      if (h.t <= 0) { h.st = "in"; emit(s, "hornetIn", { id: h.id, first: seeOnce(s, "hornetIn") }); }
    } else if (h.st === "in" || h.st === "hunt") {
      if (ball > 0) {
        /* she cannot hunt with bees on her */
        h.heat += Math.min(1.5, ball / h.need) * dt / (CFG.BALL / (1 + 0.6 * lv(s, "guards")));
        if (h.heat >= 1) {
          h.st = "dead"; h.t = 0.8; s.stats.hornets++;
          emit(s, "hornetDown", { id: h.id, x: h.x, y: h.y, first: seeOnce(s, "hornetDown") });
          continue;
        }
      } else {
        h.heat = Math.max(0, h.heat - dt * 0.12);
        const f = h.target ? flowerById(s, h.target) : null;
        let tgt = (f && f.st === "open") ? { x: f.x, y: f.y } : null;
        if (!tgt || (h.st === "hunt" && h.retarget <= 0)) { tgt = hornetTarget(s, h); h.retarget = 4; }
        h.retarget -= dt;
        if (moveTo(h, tgt.x, tgt.y, CFG.HORNET_SPEED * dt) && h.st === "in") { h.st = "hunt"; h.t = CFG.SNATCH * 0.6; }
        if (h.st === "hunt") {
          h.t -= dt;
          if (h.t <= 0) {
            h.t = CFG.SNATCH;
            let prey = null, pd = 0.1;
            for (const b of s.bees) {
              if (b.st === "home" || b.h) continue;
              const d = Math.hypot(b.x - h.x, b.y - h.y);
              if (d < pd) { pd = d; prey = b; }
            }
            if (prey && s.bees.length > 3) {
              loseBee(s, prey, "hornet"); h.took++;
              emit(s, "snatch", { id: h.id, x: h.x, y: h.y });
              if (h.took >= h.greed) h.st = "flee";
            }
          }
        }
      }
      /* bees who have learned to guard need no telling, close to home */
      if (!h.called && lv(s, "guards") && Math.hypot(h.x, h.y) < hiveR(s) + 0.2) { callGuards(s, h); emit(s, "ballCall", { id: h.id, x: h.x, y: h.y, auto: true }); }
    } else if (h.st === "flee") {
      if (moveTo(h, h.ex, h.ey, CFG.HORNET_SPEED * 1.6 * dt)) { s.hornets.splice(i, 1); emit(s, "hornetGone", { took: h.took }); }
    } else if (h.st === "dead") {
      h.t -= dt;
      if (h.t <= 0) s.hornets.splice(i, 1);
    }
  }
}

/* ---------- rain ---------- */
function spawnCloud(s) {
  const hw = s.view.w / 2, hh = s.view.h / 2, r = 0.2 + 0.1 * growth(s) + 0.05 * rnd(s);
  const fromLeft = rnd(s) < 0.5, y = between(s, -hh * 0.7, hh * 0.7);
  const speed = (s.view.w + 2 * r) / between(s, 17, 22);
  const c = { id: s.nextId++, x: (fromLeft ? -1 : 1) * (hw + r), y: y, vx: (fromLeft ? 1 : -1) * speed, vy: between(s, -0.012, 0.012), r: r };
  /* a shower passes beside the hive, not over the door */
  if (Math.abs(c.y) < r * 0.6) c.y = (c.y < 0 ? -1 : 1) * r * 0.8;
  s.clouds.push(c);
  emit(s, "rain", { id: c.id, first: seeOnce(s, "rain") });
}
function stepClouds(s, dt) {
  for (let i = s.clouds.length - 1; i >= 0; i--) {
    const c = s.clouds[i];
    c.x += c.vx * dt; c.y += c.vy * dt;
    if (Math.abs(c.x) > s.view.w / 2 + c.r + 0.05) { s.clouds.splice(i, 1); emit(s, "rainEnd", {}); }
  }
}

/* ---------- saving ---------- */
function serialize(s) {
  const ev = s.events; s.events = [];
  const out = JSON.stringify(s);
  s.events = ev;
  return out;
}
function deserialize(str) {
  const s = JSON.parse(str);
  if (!s || s.v !== 1 || !Array.isArray(s.bees)) return null;
  s.events = [];
  return s;
}

const api = {
  CFG: CFG, SPIRAL: SPIRAL, cellXY: cellXY, honeyCellIndex: honeyCellIndex, hiveR: hiveR,
  create: create, step: step, setAspect: setAspect, goals: goals, season: season, dayLen: dayLen,
  eggCost: eggCost, growth: growth, reach: reach, counts: counts, yearRow: yearRow, lv: lv,
  tapFlower: tapFlower, tapQueen: tapQueen, tapHornet: tapHornet, huddle: huddle,
  pickCard: pickCard, nextYear: nextYear, keepCount: keepCount, jarLabel: jarLabel,
  serialize: serialize, deserialize: deserialize
};
root.HiveSim = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
