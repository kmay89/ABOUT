/* hive-check.js — dev-only. Hive Mind, played by people who are not there.

   The game this one replaces had a problem nobody could see by playing it:
   its own simulation said a player who set one dial and walked away outlived
   a player who paid attention. Nothing on screen was wrong. The game was
   simply solved, and a solved game is not a game.

   So this one is measured from the first commit. sim.js has no screen in it,
   which means node can sit six kinds of player down at it and play each of
   them through a few dozen hives:

     idle      never touches it
     hoarder   works the flowers, never raises a bee
     breeder   raises a bee every time there is honey for one, all year
     toddler   five seconds behind everything, never answers a hornet
     newcomer  slow, taps every flower it sees, raises bees until the goal
     keeper    quick, chooses its flowers, grows early and banks late

   and the contract is about the spread between them, not about any one:

     - doing nothing loses, and so does each of the two lazy extremes
     - the first winter forgives: even the toddler usually sees spring
     - but it does not stay free: the second year finds the toddler out
     - a keeper nearly always lives, and brings home more honey doing it
     - and the gentle game never loses the hive at all

   If a change to the numbers makes attention stop mattering, this goes red.

   Run: node tools/hive-check.js              the contract
        node tools/hive-check.js --table      every player, every year
        node tools/hive-check.js --trace=keeper [--seed=7]   one game, day by day */
"use strict";
const path = require("path");
const Sim = require(path.join(__dirname, "..", "hive", "sim.js"));
const Data = require(path.join(__dirname, "..", "hive", "data.js"));

const args = {};
for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)(?:=(.*))?$/); if (m) args[m[1]] = m[2] === undefined ? true : m[2]; }

const DT = 0.05;

/* how good a flower looks to somebody who is paying attention */
function worth(s, f) {
  const S = Data.SPECIES[f.sp], d = Math.hypot(f.x, f.y);
  const trip = 2 * d / Sim.CFG.BEE_SPEED + Sim.CFG.WORK + Sim.CFG.DWELL;
  return S.value / trip;
}

const PLAYERS = {
  idle: { react: 1e9, flowers: "none", hatch: "never", hornet: 1e9, huddle: 0, cards: "random" },
  hoarder: { react: 1.5, flowers: "all", hatch: "never", hornet: 3, huddle: 0.6, cards: "random" },
  breeder: { react: 1.5, flowers: "all", hatch: "always", hornet: 3, huddle: 0.6, cards: "random" },
  newcomer: { react: 2.6, flowers: "all", hatch: "goal", hornet: 4.5, huddle: 0.5, cards: "random", think: 4 },
  toddler: { react: 5, flowers: "all", hatch: "goal", hornet: 1e9, huddle: 0, cards: "random", think: 8 },
  keeper: { react: 0.7, flowers: "choose", hatch: "plan", hornet: 1.2, huddle: 0.95, cards: "smart", think: 1 }
};

function play(kind, seed, years, opts) {
  opts = opts || {};
  const P = PLAYERS[kind];
  const s = Sim.create({ seed: seed, aspect: opts.aspect || 0.5, gentle: !!opts.gentle });
  const seenAt = {};          /* when this player first noticed each flower or hornet */
  let clockAll = 0, thinkT = 0, dice = seed * 7919 + 13;
  const roll = () => { dice = (dice * 1103515245 + 12345) & 0x7fffffff; return dice / 0x7fffffff; };
  const log = [];
  const out = { kind: kind, seed: seed, years: 0, dead: null, perYear: [] };
  let guard = 0;

  while (out.years < years && guard++ < 4e6) {
    Sim.step(s, DT); clockAll += DT;
    for (const e of s.events) {
      if (e.type === "night") {
        if (opts.trace) log.push(`  y${s.year} d${s.day + 1} ${e.season.padEnd(6)} honey ${s.honey.toFixed(0).padStart(4)}  bees ${String(s.bees.length).padStart(3)}  +${e.today.honey.toFixed(0)} today, ${e.today.hatched} hatched, ${e.today.lost} lost  need ${Sim.goals(s).need}`);
        let pick = e.offers[0];
        if (P.cards === "random") pick = e.offers[Math.floor(roll() * e.offers.length)];
        else {
          const order = ["tongue", "wings", "memory", "bloom", "dance", "jelly", "giant", "scouts", "nurses", "guards", "early", "twins", "propolis", "winterbees"];
          const late = e.season === "autumn" ? ["propolis", "winterbees"] : [];
          pick = e.offers.slice().sort((a, b) => (late.indexOf(b) - late.indexOf(a)) || (order.indexOf(a) - order.indexOf(b)))[0];
        }
        Sim.pickCard(s, pick);
      } else if (e.type === "gust") {
        if (roll() < P.huddle) s._huddleAt = s.w.t + 0.3;
      } else if (e.type === "yearEnd") {
        out.years++;
        out.perYear.push({ year: e.year, jars: e.jars, bees: e.bees, thin: e.thin });
        if (opts.trace) log.push(`  ── spring. ${e.jars} jars of ${e.label.name}, ${e.bees} bees came through`);
        if (out.years < years) {
          /* what to remember: a keeper keeps what pays all year, the others whatever */
          const owned = Object.keys(s.cards);
          const pref = ["tongue", "wings", "memory", "bloom", "dance", "giant", "jelly", "scouts"];
          const keep = P.cards === "smart" ? owned.slice().sort((a, b) => (s.cards[b] - s.cards[a]) || (pref.indexOf(a) - pref.indexOf(b))) : owned.slice().sort(() => roll() - 0.5);
          Sim.nextYear(s, keep.slice(0, Sim.keepCount(s)));
        }
      } else if (e.type === "dead") {
        out.dead = { year: e.year, short: e.short, cause: e.cause };
        if (opts.trace) log.push(`  ── the hive went quiet in year ${e.year}: ${e.short} honey short (${e.cause})`);
      } else if (e.type === "winter" && opts.trace) {
        log.push(`  winter: needs ${e.need}, has ${e.honey.toFixed(0)}, ${e.bees} bees${e.short ? " (" + e.short + " short of a cluster)" : ""}`);
      }
    }
    s.events.length = 0;
    if (out.dead) break;
    if (s.phase === "winter" && s._huddleAt && s.w.t >= s._huddleAt) { s._huddleAt = 0; Sim.huddle(s); }
    if (s.phase !== "day") continue;

    /* flowers */
    if (P.flowers !== "none") {
      const c = Sim.counts(s);
      for (const f of s.flowers) {
        if (seenAt[f.id] === undefined) seenAt[f.id] = clockAll;
        if (f.on || f.st === "wilt" || clockAll - seenAt[f.id] < P.react) continue;
        if (P.flowers === "all") Sim.tapFlower(s, f.id);
        else {
          /* a keeper asks whether there are bees for it, and drops the worst
             flower for a much better one */
          let seats = 0, worst = null;
          for (const g of s.flowers) if (g.on && g.st === "open") { seats += Math.min(g.seats, g.n); if (!worst || worth(s, g) < worth(s, worst)) worst = g; }
          if (seats < s.bees.length * 1.15) Sim.tapFlower(s, f.id);
          else if (worst && worth(s, f) > worth(s, worst) * 1.5) { Sim.tapFlower(s, worst.id); Sim.tapFlower(s, f.id); }
        }
      }
      void c;
    }
    /* hornets */
    for (const h of s.hornets) {
      if (seenAt["h" + h.id] === undefined) seenAt["h" + h.id] = clockAll;
      if (h.st !== "warn" && !h.called && clockAll - seenAt["h" + h.id] - Sim.CFG.HORNET_WARN > P.hornet) Sim.tapHornet(s, h.id);
    }
    /* the queen */
    thinkT -= DT;
    if (thinkT <= 0 && P.hatch !== "never") {
      thinkT = P.think || 1.5;
      const g = Sim.goals(s), have = s.bees.length + s.brood.length, cost = Sim.eggCost(s);
      let wantBee = false;
      if (P.hatch === "always") wantBee = true;
      else if (P.hatch === "goal") wantBee = have < g.bees;
      else {
        /* grow while there is a summer left to pay it back, then bank */
        const sn = Sim.CFG.SEASONS[s.day];
        const cap = sn === "autumn" ? g.bees : Math.round(g.bees * 1.5) + 4;
        wantBee = have < cap && (have < g.bees || s.honey > cost * 2);
      }
      if (wantBee && s.honey >= cost) { Sim.tapQueen(s); if (P.hatch !== "goal") thinkT = 0.3; }
    }
  }
  if (opts.trace) console.log(log.join("\n"));
  return out;
}

function run(kind, n, years, opts) {
  const res = [];
  for (let i = 0; i < n; i++) res.push(play(kind, 1000 + i * 37, years, opts));
  const row = { kind: kind, n: n };
  for (let y = 1; y <= years; y++) {
    row["y" + y] = res.filter((r) => r.years >= y).length;
    const jars = res.filter((r) => r.perYear[y - 1]).map((r) => r.perYear[y - 1].jars);
    row["jars" + y] = jars.length ? jars.reduce((a, b) => a + b, 0) / jars.length : 0;
  }
  row.causes = {};
  for (const r of res) if (r.dead) row.causes[r.dead.cause] = (row.causes[r.dead.cause] || 0) + 1;
  return row;
}

if (args.trace) {
  const kind = args.trace === true ? "keeper" : args.trace;
  console.log(`\n${kind}, seed ${args.seed || 1000}`);
  play(kind, +(args.seed || 1000), +(args.years || 3), { trace: true, gentle: !!args.gentle });
  process.exit(0);
}

const N = +(args.n || 30), YEARS = +(args.years || 4);
const table = {};
for (const k of Object.keys(PLAYERS)) table[k] = run(k, N, YEARS);
const gentle = run("newcomer", N, 2, { gentle: true });
const wide = run("keeper", Math.min(N, 20), 2, { aspect: 1.7 });

const pct = (v) => String(Math.round(100 * v / N)).padStart(3) + "%";
console.log(`\n──  ${N} hives each, ${YEARS} years\n`);
console.log("  player     " + Array.from({ length: YEARS }, (_, i) => `year ${i + 1}`.padEnd(13)).join(""));
for (const k of Object.keys(table)) {
  const r = table[k];
  console.log("  " + k.padEnd(10) + " " + Array.from({ length: YEARS }, (_, i) => (pct(r["y" + (i + 1)]) + " " + r["jars" + (i + 1)].toFixed(1).padStart(4) + "j").padEnd(13)).join("") +
    (Object.keys(r.causes).length ? "  lost to: " + JSON.stringify(r.causes) : ""));
}
console.log("  " + "gentle".padEnd(10) + " " + pct(gentle.y1).padEnd(13) + pct(gentle.y2));
console.log("  " + "landscape".padEnd(10) + " " + (String(Math.round(100 * wide.y1 / wide.n)).padStart(3) + "%").padEnd(13) + String(Math.round(100 * wide.y2 / wide.n)).padStart(3) + "%");
if (args.table) process.exit(0);

let fails = 0;
function ok(what, cond, detail) {
  if (cond) console.log("  ✓ " + what);
  else { fails++; console.log("  ✗ " + what + (detail ? " — " + detail : "")); }
}
console.log("\n──  attention has to matter");
const T = table;
ok("a hive nobody attends to does not see spring", T.idle.y1 === 0, T.idle.y1 + "/" + N);
ok("never raising a bee loses the first winter", T.hoarder.y1 <= N * 0.1, T.hoarder.y1 + "/" + N);
ok("raising a bee with every drop of honey loses it too", T.breeder.y1 <= N * 0.1, T.breeder.y1 + "/" + N);
console.log("\n──  the first winter forgives, and the second does not");
ok("somebody five seconds behind everything usually sees the first spring", T.toddler.y1 >= N * 0.5, T.toddler.y1 + "/" + N);
ok("but not usually the second", T.toddler.y2 <= N * 0.6, T.toddler.y2 + "/" + N);
ok("a newcomer who follows the screen sees the first spring", T.newcomer.y1 >= N * 0.9, T.newcomer.y1 + "/" + N);
ok("and finds the fourth year harder than the first", T.newcomer.y4 < T.newcomer.y1, T.newcomer.y4 + " after " + T.newcomer.y1);
console.log("\n──  care is worth something");
ok("a keeper nearly always sees the first spring", T.keeper.y1 >= N * 0.97, T.keeper.y1 + "/" + N);
ok("and brings home more honey than a newcomer does", T.keeper.jars1 >= T.newcomer.jars1 + 2, T.keeper.jars1.toFixed(1) + " jars against " + T.newcomer.jars1.toFixed(1));
ok("a keeper can keep a hive for four years", T.keeper.y4 >= N * 0.8, T.keeper.y4 + "/" + N);
console.log("\n──  and for everybody");
ok("the gentle game does not lose the hive", gentle.y2 === N, gentle.y2 + "/" + N);
ok("a wide screen is the same game", wide.y1 >= wide.n * 0.9, wide.y1 + "/" + wide.n);

console.log(fails ? "\n" + fails + " failed\n" : "\nall good\n");
process.exit(fails ? 1 : 0);
