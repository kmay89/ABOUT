/* haptics-check.js — dev-only. Does the board feel right, and never wrong?

   A haptic bug is a peculiar one: nobody sees it. A buzz that comes a
   beat late, two ticks that smear into one long rattle, a phone that
   keeps shaking after the game it was shaking for has gone — each of
   these just makes a game feel cheap, and nobody can say why. And a
   phone that buzzes for two seconds at a capture is the kind of thing
   people switch off for good.

   So the vocabulary is checked as data, and the playing is checked
   against a fake motor and a fake clock, in node, with no browser:
     - is every moment the game asks for written down, and is every
       pattern sane: whole positive milliseconds, starting and ending on
       a pulse, no gap a tick could smear across, and over in well under
       a second and a quarter;
     - do the shapes say what they mean: a queen lands heavier than a
       pawn, a big capture hits harder and leaves an after-rumble that
       dies away, the other side's moves are lighter than yours, a
       promotion rises and a mate builds;
     - does the throttle drop a flood rather than queue it, and hold
       back (rather than drop) anything that matters;
     - is off off: switched off, a hidden tab, a device with no motor,
       a moment nobody has heard of;
     - does a moment scheduled for later arrive on time, and can it be
       taken back — one at a time or all at once, including a pattern
       already playing;
     - and on the iPhone path, where a pattern is a run of system
       ticks, is there exactly one tick per beat, and never two too
       close together.

   Run: node chess/tools/haptics-check.js                               */
"use strict";
const Haptics = require("../haptics.js");

let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

/* ---------- a clock that only moves when told to ---------- */
let T = 1000, nextId = 1, timers = [];
const clock = {
  now: () => T,
  setTimeout: (fn, ms) => { const id = nextId++; timers.push({ id, at: T + Math.max(0, ms || 0), fn }); return id; },
  clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); }
};
function advance(ms) {
  const end = T + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at || a.id - b.id);
    const t = timers[0];
    if (!t || t.at > end) break;
    timers.shift();
    T = t.at;
    t.fn();
  }
  T = end;
}
Haptics._setClock(clock);

/* ---------- two fake motors ---------- */
function motor() {
  const m = { name: "vibrate", calls: [], play: (p) => m.calls.push({ at: T, p: p.slice() }), stop: () => m.calls.push({ at: T, p: 0 }) };
  return m;
}
function ticker() {
  const m = { name: "switch", ticks: [], tick: () => m.ticks.push(T) };
  return m;
}
function fresh(backend) {
  Haptics._reset();
  timers = [];
  T += 10000;
  Haptics._setBackend(backend);
  return backend;
}

const NEEDED = ["select", "hover", "land", "capture", "castle", "check", "promote", "mateWin", "mateLoss", "draw",
                "nope", "heartbeat", "tick", "count", "star", "success", "lessonRight", "lessonWrong", "arrive"];
const GAP = Haptics.GAP;

/* ---------- the vocabulary ---------- */
(function () {
  const missing = NEEDED.filter((k) => Haptics.KINDS.indexOf(k) < 0 || !Haptics.pattern(k));
  ok("every moment the game asks for is written down (" + NEEDED.length + ")", !missing.length, missing.join(", "));
  ok("the gap between ticks is a crisp one (30–40 ms)", GAP >= 30 && GAP <= 40, String(GAP));

  /* every kind, and every shape a kind can be asked for */
  const variants = [{}, { soft: true }];
  for (let k = 0; k <= 6; k++) variants.push({ piece: k }, { piece: -k, soft: true });
  for (let p = 0; p <= 1.0001; p += 0.1) variants.push({ power: p }, { power: p, soft: true });
  variants.push({ power: -3 }, { power: 7 }, { power: NaN }, { power: "lots" });
  for (const g of [0, 10, 35, 60, 120, 400, -5, NaN]) variants.push({ gap: g }, { gap: g, soft: true });
  let bad = null, longest = 0, longestKind = "";
  for (const k of Haptics.KINDS) for (const o of variants) {
    const p = Haptics.pattern(k, o), why = (msg) => { bad = bad || k + " " + JSON.stringify(o) + ": " + msg + " " + JSON.stringify(p); };
    if (!Array.isArray(p) || !p.length) { why("no pattern"); continue; }
    if (p.length % 2 !== 1) why("does not end on a pulse");
    if (!p.every((v) => typeof v === "number" && isFinite(v) && v > 0 && Math.round(v) === v)) why("not whole positive ms");
    for (let i = 1; i < p.length; i += 2) if (p[i] < GAP) why("a gap a tick could smear across");
    for (let i = 0; i < p.length; i += 2) if (p[i] > 120) why("a pulse that is a drone, not a beat");
    const tot = Haptics.total(p);
    if (tot >= Haptics.MAX_MS) why("too long");
    if (tot > longest) { longest = tot; longestKind = k; }
  }
  ok("every pattern, in every shape, is whole positive milliseconds, pulse to pulse, no smear", !bad, bad);
  ok("nothing goes on for more than " + Haptics.MAX_MS + " ms", longest < Haptics.MAX_MS && Haptics.MAX_MS <= 1200,
     "longest: " + longestKind + " " + longest + " ms");
  ok("asking for a moment never changes the next one asked for", (() => {
    const a = Haptics.pattern("check"); a[0] = 999;
    return Haptics.pattern("check")[0] !== 999;
  })());
})();

/* ---------- the shapes say what they mean ---------- */
(function () {
  const P = (k, o) => Haptics.pattern(k, o);
  const first = (k, o) => P(k, o)[0];
  ok("the lightest touches are the detent and the arrival", first("hover") <= first("select") && first("arrive") <= first("tick"));
  ok("short pulses for clicks: select, tick, hover, count all 4–12 ms",
     ["select", "tick", "hover", "count", "arrive"].every((k) => first(k) >= 4 && first(k) <= 12));
  ok("a queen lands heavier than a pawn, and a king no lighter than a rook",
     first("land", { piece: 5 }) > first("land", { piece: 1 }) && first("land", { piece: 6 }) >= first("land", { piece: 4 }));
  ok("black men weigh what white ones do", first("land", { piece: -5 }) === first("land", { piece: 5 }));
  ok("a capture hits harder than any landing", first("capture", { power: 0 }) > first("land", { piece: 6 }));
  ok("taking a queen hits harder than taking a pawn", first("capture", { power: 1 }) > first("capture", { power: 0.1 }));
  const big = P("capture", { power: 1 }), small = P("capture", { power: 0.1 });
  ok("a big capture leaves an after-rumble; a small one does not", big.length > 1 && small.length === 1, JSON.stringify(big));
  let dies = true;
  for (let i = 2; i < big.length; i += 2) if (big[i] >= big[i - 2]) dies = false;
  ok("…and the after-rumble dies away", dies, JSON.stringify(big));
  ok("the other side's moves are felt more softly than yours",
     first("land", { piece: 5, soft: true }) < first("land", { piece: 5 }) &&
     Haptics.total(P("capture", { power: 1, soft: true })) < Haptics.total(big));
  const c = P("castle", { gap: 120 });
  ok("a castle is two ticks, the rook and then the king, at the board's own gap", c.length === 3 && c[1] === 120 && c[2] >= c[0]);
  ok("a castle whose two pieces land together still gets two separate ticks", P("castle", { gap: 2 })[1] >= GAP);
  ok("a check is two sharp beats", P("check").length === 3);
  const pr = P("promote");
  ok("a promotion rises: three beats, each heavier", pr.length === 5 && pr[0] < pr[2] && pr[2] < pr[4]);
  const mw = P("mateWin");
  let builds = true;
  for (let i = 2; i < mw.length; i += 2) if (mw[i] <= mw[i - 2]) builds = false;
  ok("a mate you gave builds, beat by beat", builds && mw.length >= 7, JSON.stringify(mw));
  ok("a mate you took is one long low one", P("mateLoss").length === 1 && first("mateLoss") >= 50);
  const hb = P("heartbeat");
  ok("the heartbeat goes lub-dub, the first beat the stronger", hb.length === 3 && hb[0] > hb[2]);
  ok("a wrong lesson falls where a right one rises",
     P("lessonRight")[0] < P("lessonRight")[2] && P("lessonWrong")[0] > P("lessonWrong")[2]);
})();

/* ---------- playing, on a motor ---------- */
(function () {
  const m = fresh(motor());
  ok("the backend is named for what it is", Haptics.supported() === "vibrate");
  ok("a moment that exists plays, and says so", Haptics.play("select") === true && m.calls.length === 1 &&
     JSON.stringify(m.calls[0].p) === JSON.stringify(Haptics.pattern("select")));
  ok("a moment nobody has heard of plays nothing, and says so",
     Haptics.play("wobble") === false && Haptics.play("toString") === false && Haptics.play() === false &&
     Haptics.at("wobble", 100) === 0 && Haptics.pattern("constructor") === null && m.calls.length === 1);

  /* the flood kinds are dropped, never queued */
  fresh(m); m.calls.length = 0;
  Haptics.play("hover"); advance(10);
  const second = Haptics.play("hover");
  advance(500);
  ok("two detents closer than the gap: the second is dropped, not queued", second === false && m.calls.length === 1,
     m.calls.length + " played");
  Haptics.play("hover");
  ok("…and the next one, after the gap, is felt", m.calls.length === 2);
  fresh(m); m.calls.length = 0;
  let n = 0;
  for (let i = 0; i < 60; i++) { if (Haptics.play("count")) n++; advance(8); }
  ok("a number counting up fast is thinned, not rattled (" + n + " of 60 ticks in 480 ms)", n >= 6 && n <= 12 && m.calls.length === n);
  let close = false;
  for (let i = 1; i < m.calls.length; i++) if (m.calls[i].at - m.calls[i - 1].at < GAP) close = true;
  ok("…and no two of them closer than the gap", !close);
  fresh(m); m.calls.length = 0;
  Haptics.play("capture", { power: 1 }); advance(60);
  ok("a detent never cuts into a capture still rumbling", Haptics.play("hover") === false && m.calls.length === 1);

  /* everything else waits its turn */
  fresh(m); m.calls.length = 0;
  Haptics.play("select"); advance(5);
  const queued = Haptics.play("check"); advance(3);
  const third = Haptics.play("nope");
  ok("a moment that matters arriving too soon is held, not lost", queued === true && third === true && m.calls.length === 1);
  advance(200);
  const gaps = m.calls.slice(1).map((c, i) => c.at - m.calls[i].at);
  ok("…and played the gap after the last, in the order asked", m.calls.length === 3 && gaps.every((g) => g >= GAP) &&
     JSON.stringify(m.calls[1].p) === JSON.stringify(Haptics.pattern("check")), JSON.stringify(gaps));
})();

/* ---------- off is off ---------- */
(function () {
  const m = fresh(motor());
  Haptics.setEnabled(false);
  const a = Haptics.play("capture", { power: 1 }), b = Haptics.at("land", 50);
  advance(200);
  ok("switched off: nothing plays, nothing is scheduled", !a && !b && m.calls.length === 0 && !Haptics.enabled());
  Haptics.setEnabled(true);
  Haptics.at("land", 100);
  Haptics.setEnabled(false); Haptics.setEnabled(true);
  advance(200);
  ok("switching off takes what was waiting with it", m.calls.length === 0);

  fresh(m);
  global.document = { hidden: true };
  const h = Haptics.play("check");
  Haptics.at("land", 40); advance(100);
  ok("a hidden tab feels nothing", !h && m.calls.length === 0);
  global.document = { hidden: false };
  ok("…and a visible one does", Haptics.play("check") === true && m.calls.length === 1);
  delete global.document;

  fresh(null);
  ok("no motor: nothing to play, and it says so", Haptics.play("select") === false && Haptics.supported() === "none" &&
     Haptics.at("land", 10) === 0);
  fresh(undefined);
  ok("node, with no page and no motor, detects nothing rather than failing", Haptics.supported() === "none" &&
     Haptics.play("select") === false);
})();

/* ---------- in time with the board, and taken back ---------- */
(function () {
  const m = fresh(motor());
  const tok = Haptics.at("land", 240, { piece: 5 });
  advance(239);
  const early = m.calls.length;
  advance(1);
  ok("a moment scheduled for the landing arrives at the landing, not before", tok > 0 && early === 0 && m.calls.length === 1 &&
     m.calls[0].at === T, "at " + (m.calls[0] && m.calls[0].at));
  fresh(m); m.calls.length = 0;
  const t1 = Haptics.at("land", 100), t2 = Haptics.at("check", 300);
  Haptics.cancel(t1);
  advance(400);
  ok("one moment can be taken back by its token, leaving the other", t1 !== t2 && m.calls.length === 1 &&
     JSON.stringify(m.calls[0].p) === JSON.stringify(Haptics.pattern("check")));
  fresh(m); m.calls.length = 0;
  Haptics.at("land", 100); Haptics.at("capture", 150, { power: 1 }); Haptics.at("mateWin", 500);
  advance(50);
  Haptics.cancel();
  advance(2000);
  ok("a new game takes every buzz still waiting with it", m.calls.length === 0);
  fresh(m); m.calls.length = 0;
  Haptics.play("mateWin"); advance(100);
  Haptics.cancel();
  ok("…including a pattern already playing, which is stopped", m.calls.length === 2 && m.calls[1].p === 0);
  Haptics.cancel(); Haptics.cancel(12345);
  ok("…and cancelling with nothing to cancel is harmless", m.calls.length === 2);
  fresh(m); m.calls.length = 0;
  Haptics.at("tick", 0);
  ok("a moment scheduled for now is simply played", m.calls.length === 1);
})();

/* ---------- the iPhone path: ticks at the beats ---------- */
(function () {
  const t = fresh(ticker());
  ok("the ticking backend is named for what it is", Haptics.supported() === "switch");
  let bad = null, close = null;
  const kinds = Haptics.KINDS.map((k) => [k, {}]).concat([["capture", { power: 1 }], ["land", { piece: 6 }],
    ["castle", { gap: 40 }], ["capture", { power: 1, soft: true }]]);
  for (const [k, o] of kinds) {
    fresh(t); t.ticks.length = 0;
    const start = T;
    Haptics.play(k, o);
    advance(1500);
    const want = Haptics.beats(Haptics.pattern(k, o));
    const got = t.ticks.map((x) => x - start);
    if (JSON.stringify(got) !== JSON.stringify(want)) bad = bad || k + " " + JSON.stringify(o) + " ticked " + JSON.stringify(got) + " for " + JSON.stringify(want);
    for (let i = 1; i < got.length; i++) if (got[i] - got[i - 1] < GAP) close = close || k + " " + JSON.stringify(got);
  }
  ok("one tick per beat, at the beat, for every moment", !bad, bad);
  ok("no two ticks ever closer than the gap", !close, close);
  ok("a click is one tick", Haptics.beats(Haptics.pattern("select")).length === 1);
  ok("a check is two ticks, a promotion three", Haptics.beats(Haptics.pattern("check")).length === 2 &&
     Haptics.beats(Haptics.pattern("promote")).length === 3);
  ok("weight, where weight cannot be varied, is an extra tick or two",
     Haptics.beats(Haptics.pattern("capture", { power: 1 })).length > Haptics.beats(Haptics.pattern("capture", { power: 0.1 })).length &&
     Haptics.beats(Haptics.pattern("mateLoss")).length >= 2 && Haptics.beats(Haptics.pattern("mateLoss")).length <= 3);
  fresh(t); t.ticks.length = 0;
  Haptics.play("mateWin"); advance(120);
  const sofar = t.ticks.length;
  Haptics.cancel(); advance(1500);
  ok("a pattern taken back mid-way ticks no further", sofar >= 1 && t.ticks.length === sofar, sofar + " then " + t.ticks.length);
  fresh(t); t.ticks.length = 0;
  Haptics.play("mateWin"); advance(100);
  Haptics.play("select"); advance(1500);
  ok("a newer moment takes over from an older one rather than ticking across it",
     t.ticks.length < Haptics.beats(Haptics.pattern("mateWin")).length, t.ticks.length + " ticks");
  fresh(t); t.ticks.length = 0;
  Haptics.setEnabled(false);
  Haptics.play("check"); advance(500);
  ok("off is off here too", t.ticks.length === 0);
})();

Haptics._reset();
console.log(failed ? "\n" + failed + " problem" + (failed > 1 ? "s" : "") + " with the way the board feels"
                   : "\nevery moment is felt, on time, and never smeared");
process.exit(failed ? 1 : 0);
