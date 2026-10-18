/* lesson-check.js — a lesson that cannot be solved must not ship, and
   neither can one that teaches something false.

   For every lesson: the position loads, the right side is to move, the
   model answer is legal and spelled the way the engine spells it, the
   acceptance rule actually accepts it, every "miss" is a real legal
   move that is genuinely rejected, and a sample of other legal moves is
   not accidentally accepted.

   Then the engine is asked the questions a lesson can quietly get
   wrong: does every accepted answer actually hold up (no worse than a
   pawn down for the mover), and is every move the lesson calls wrong
   really worse than the answer? A lesson that once taught a losing
   promotion with a confident explanation is why this exists.

   Also: the copy is plain where it's shown as text and well-formed where
   it's shown as markup; the spacing maths (including that a lucky guess
   never schedules further out than a sure answer, and that solving the
   same idea twice in a sitting is not a spaced review); and that no
   amount of junk in saved progress can stop the Academy opening.
   Run: node chess/tools/lesson-check.js */
"use strict";
const Chess = require("../engine.js");
const Learn = require("../learn.js");

let failed = 0;
const fail = (id, msg) => { failed++; console.log(`FAIL  ${id}: ${msg}`); };
const ok = (label, cond, extra) => {
  if (!cond) { failed++; console.log(`FAIL  ${label}${extra ? "  → " + extra : ""}`); }
  else console.log(`ok    ${label}`);
};

/* the engine's verdicts are compared at one fixed depth, all moves of a
   lesson in one call, so every number is measured by the same yardstick */
const DEPTH = 5;
const LOSE = -100;          /* an accepted answer may not leave the mover worse than this */

const chapterIds = new Set(Learn.CHAPTERS.map((c) => c.id));
const seenIds = new Set();
const clean = (s) => s.replace(/[+#]$/, "");

/* markup a lesson may use, and nothing else */
function markupProblems(text, html) {
  const out = [];
  if (typeof text !== "string" || !text.trim()) return ["empty"];
  if (/\*/.test(text)) out.push("contains '*' (markdown doesn't render here)");
  if (/\bundefined\b|\bnull\b|NaN/.test(text)) out.push("contains undefined/null/NaN");
  if (/ {2,}/.test(text)) out.push("double space");
  if (!html) {
    if (/[<>]/.test(text)) out.push("markup in a plain-text field");
    return out;
  }
  const stack = [];
  const re = /<\/?([a-z]+)[^>]*>/gi;
  let m;
  while ((m = re.exec(text))) {
    const tag = m[1].toLowerCase();
    if (tag !== "b" && tag !== "i") { out.push(`unexpected <${tag}>`); continue; }
    if (m[0][1] === "/") { if (stack.pop() !== tag) out.push(`unbalanced </${tag}>`); }
    else stack.push(tag);
  }
  if (stack.length) out.push(`unclosed <${stack.join(">, <")}>`);
  if (/<(?![\/]?[bi]>)/.test(text)) out.push("stray '<'");
  return out;
}

for (const ch of Learn.CHAPTERS) {
  for (const p of markupProblems(ch.blurb, false)) fail(`chapter ${ch.id}`, "blurb: " + p);
  for (const p of markupProblems(ch.name, false)) fail(`chapter ${ch.id}`, "name: " + p);
}

for (const L of Learn.LESSONS) {
  /* identity */
  if (seenIds.has(L.id)) fail(L.id, "duplicate lesson id");
  seenIds.add(L.id);
  if (!chapterIds.has(L.chapter)) fail(L.id, `unknown chapter "${L.chapter}"`);
  for (const field of ["title", "ask", "why", "hint", "concept", "rule", "best"]) {
    if (!L[field]) fail(L.id, `missing ${field}`);
  }

  /* the words: title and ask are shown as text, the rest as markup */
  for (const f of ["title", "ask"]) for (const p of markupProblems(L[f], false)) fail(L.id, `${f}: ${p}`);
  for (const f of ["why", "hint", "alsoWhy"]) {
    if (L[f] === undefined) continue;
    for (const p of markupProblems(L[f], true)) fail(L.id, `${f}: ${p}`);
  }
  for (const san of Object.keys(L.misses || {})) {
    for (const p of markupProblems(L.misses[san], true)) fail(L.id, `miss ${san}: ${p}`);
  }

  /* the position */
  let g;
  try { g = Chess.create(L.fen); }
  catch (e) { fail(L.id, `bad FEN: ${e.message}`); continue; }
  if (g.turn !== L.side) fail(L.id, `side to move (${g.turn}) doesn't match lesson.side (${L.side})`);
  if (Chess.status(g).over) fail(L.id, "the position is already finished");

  /* the model answer */
  const best = Chess.fromSAN(g, L.best);
  if (!best) { fail(L.id, `best move "${L.best}" is not legal here`); continue; }
  const canonical = Chess.toSAN(g, best);
  if (canonical !== L.best) fail(L.id, `best should be written "${canonical}", not "${L.best}"`);

  const verdict = Learn.accepts(L, g, best);
  if (!verdict.ok) fail(L.id, `rule "${L.rule}" rejects its own model answer ${L.best}`);
  if (Chess.fen(g) !== L.fen) fail(L.id, "accepts() disturbed the position");

  /* alternates that should also count */
  for (const alt of L.alsoOk || []) {
    const m = Chess.fromSAN(g, alt);
    if (!m) { fail(L.id, `alsoOk "${alt}" is not legal`); continue; }
    if (!Learn.accepts(L, g, m).ok) fail(L.id, `alsoOk "${alt}" is rejected`);
  }

  /* every miss must be a real move, and must be wrong */
  const missMoves = [];
  for (const san of Object.keys(L.misses || {})) {
    const m = Chess.fromSAN(g, san);
    if (!m) { fail(L.id, `miss "${san}" is not a legal move (its advice can never appear)`); continue; }
    if (Learn.accepts(L, g, m).ok) fail(L.id, `miss "${san}" is actually accepted — the feedback contradicts the rule`);
    if (!L.misses[san] || L.misses[san].length < 20) fail(L.id, `miss "${san}" has thin feedback`);
    missMoves.push(m);
  }

  /* the rule must discriminate: most other legal moves should be wrong */
  const all = Chess.moves(g);
  const accepted = all.filter((m) => Learn.accepts(L, g, m).ok);
  if (accepted.length === all.length && all.length > 1) {
    fail(L.id, "every legal move is accepted — the rule isn't teaching anything");
  }
  if (accepted.length === 0) fail(L.id, "no legal move is accepted");

  /* critique must produce something specific — and true — for every
     wrong move: no "the position is small enough to see" on a full board */
  for (const wrong of all.filter((m) => !Learn.accepts(L, g, m).ok)) {
    const text = Learn.critique(L, g, wrong);
    if (!text || text.length < 20) { fail(L.id, `critique() gave no useful feedback for ${Chess.toSAN(g, wrong)}`); break; }
    const probs = markupProblems(text, true);
    if (probs.length) { fail(L.id, `critique of ${Chess.toSAN(g, wrong)}: ${probs.join(", ")}`); break; }
    if (L.chapter === "opening" && /small enough to see/.test(text)) {
      fail(L.id, `critique of ${Chess.toSAN(g, wrong)} calls a full board "small enough to see"`); break;
    }
    /* a pawn move that attacks something (d4 or f4 against e5) is not "quiet" */
    if (/quiet/.test(text) && Math.abs(wrong.piece) === Chess.P) {
      Chess.make(g, wrong);
      const attacks = require("../teach.js").attacksFrom(g, wrong.to).some((s) => g.board[s] && Math.sign(g.board[s]) === -Math.sign(wrong.piece));
      Chess.unmake(g);
      if (attacks) { fail(L.id, `critique of ${Chess.toSAN(g, wrong)} calls a pawn move that attacks something "quiet"`); break; }
    }
    if (Chess.fen(g) !== L.fen) { fail(L.id, "critique() disturbed the position"); break; }
  }

  /* ---- the engine's opinion ----
     every accepted answer must hold up, and every listed miss must be
     genuinely worse than the best accepted answer */
  const judged = accepted.concat(missMoves.filter((m) => accepted.indexOf(m) < 0));
  const scored = Chess.scoreMoves(g, judged, { depth: DEPTH, ms: 60000 });
  const scoreOf = (m) => { const s = scored.find((x) => x.move === m); return s ? s.score : null; };
  let bestAccepted = -Infinity;
  for (const m of accepted) {
    const s = scoreOf(m);
    if (s === null) { fail(L.id, `engine did not score ${Chess.toSAN(g, m)}`); continue; }
    if (s < LOSE) fail(L.id, `accepted answer ${Chess.toSAN(g, m)} loses: ${s} cp for the mover at depth ${DEPTH}`);
    if (s > bestAccepted) bestAccepted = s;
  }
  const modelScore = scoreOf(accepted.find((m) => clean(Chess.toSAN(g, m)) === clean(L.best)));
  if (modelScore !== null && modelScore < LOSE) fail(L.id, `the model answer ${L.best} loses (${modelScore})`);
  let margin = Infinity;
  for (const m of missMoves) {
    const s = scoreOf(m);
    if (s === null) { fail(L.id, `engine did not score miss ${Chess.toSAN(g, m)}`); continue; }
    if (!(s < bestAccepted)) fail(L.id, `miss ${Chess.toSAN(g, m)} scores ${s}, no worse than the answer (${bestAccepted}) — the lesson calls a good move wrong`);
    margin = Math.min(margin, bestAccepted - s);
  }
  if (Chess.fen(g) !== L.fen) fail(L.id, "scoring disturbed the position");

  const fmt = (n) => Math.abs(n) > 90000 ? (n > 0 ? "mate" : "-mate") : String(n);
  console.log(`ok    ${L.id.padEnd(16)} ${L.rule.padEnd(13)} ${String(accepted.length).padStart(2)}/${String(all.length).padEnd(3)} accepted · answer ${fmt(modelScore)}` +
    (missMoves.length ? ` · misses worse by ≥${fmt(margin)}` : ""));
}

/* ---- the spacing engine ---- */
const DAY = 86400000, t0 = 1750000000000;
{
  const p = Learn.blank();
  const L = Learn.LESSONS[0];
  Learn.grade(p, L, true, "sure", t0);
  const c = p.concepts[L.concept];
  if (!(c.interval === 1 && c.reps === 1)) fail("spacing", "first success should return tomorrow");
  Learn.grade(p, L, true, "sure", t0 + DAY);
  if (p.concepts[L.concept].interval !== 3) fail("spacing", "second success should space to 3 days");
  Learn.grade(p, L, true, "sure", t0 + 4 * DAY);
  if (!(p.concepts[L.concept].interval > 3)) fail("spacing", "third success should space further");
  const easeBefore = p.concepts[L.concept].ease;
  Learn.grade(p, L, false, null, t0 + 20 * DAY);
  if (p.concepts[L.concept].interval !== 0) fail("spacing", "a miss should bring it back this session");
  if (!(p.concepts[L.concept].ease < easeBefore)) fail("spacing", "a miss should lower ease");
  console.log("ok    spacing         SM-2 intervals grow on success and reset on a miss");
}
{
  /* confidence: from the same state, guess < shaky < sure, everywhere */
  const L = Learn.LESSONS[0];
  const from = () => {
    const p = Learn.blank();
    Learn.grade(p, L, true, "sure", t0);
    Learn.grade(p, L, true, "sure", t0 + DAY);              // reps 2, interval 3
    return p;
  };
  const at = t0 + 4 * DAY;                                  // due
  const r = {};
  for (const conf of ["guess", "shaky", "sure"]) {
    const p = from();
    Learn.grade(p, L, true, conf, at);
    r[conf] = Object.assign({ m: Learn.mastery(p, L.concept) }, p.concepts[L.concept]);
  }
  ok("confidence: a lucky guess schedules sooner than a half-guess, which is sooner than 'I saw it'",
     r.guess.interval < r.shaky.interval && r.shaky.interval < r.sure.interval,
     `intervals guess ${r.guess.interval}, shaky ${r.shaky.interval}, sure ${r.sure.interval}`);
  ok("confidence: ease and mastery follow the same order",
     r.guess.ease < r.shaky.ease && r.shaky.ease < r.sure.ease && r.guess.m < r.shaky.m && r.shaky.m < r.sure.m,
     JSON.stringify({ ease: [r.guess.ease, r.shaky.ease, r.sure.ease], m: [r.guess.m, r.shaky.m, r.sure.m] }));
  ok("confidence: a lucky guess is a lapse (reps back to 0, back tomorrow) but still counts as right",
     r.guess.reps === 0 && r.guess.interval === 1 && r.guess.due === at + DAY && r.guess.right === 3,
     JSON.stringify(r.guess));
  /* and from a fresh concept, too */
  const fresh = {};
  for (const conf of ["guess", "shaky", "sure"]) {
    const p = Learn.blank();
    Learn.grade(p, L, true, conf, t0);
    fresh[conf] = p.concepts[L.concept];
  }
  ok("confidence: on first sight, guess ≤ shaky ≤ sure and a guess earns no reps",
     fresh.guess.reps === 0 && fresh.shaky.reps === 1 && fresh.sure.reps === 1 &&
     fresh.guess.interval <= fresh.shaky.interval && fresh.shaky.interval <= fresh.sure.interval);
}
{
  /* same-session repeats are practice, not spacing */
  const forks = Learn.LESSONS.filter((l) => l.concept === "fork");
  const p = Learn.blank();
  Learn.grade(p, forks[0], true, "sure", t0);
  const after1 = Object.assign({}, p.concepts.fork);
  Learn.grade(p, forks[1], true, "sure", t0 + 10 * 60000);  // ten minutes later
  Learn.grade(p, forks[0], true, "sure", t0 + 20 * 60000);
  const c = p.concepts.fork;
  ok("spacing: solving the same idea again in one sitting doesn't advance the schedule",
     c.reps === after1.reps && c.interval === after1.interval && c.due === after1.due,
     JSON.stringify({ before: after1, after: c }));
  ok("spacing: …but it does count toward accuracy", c.seen === 3 && c.right === 3);
  Learn.grade(p, forks[1], true, "sure", t0 + DAY + 1000);  // tomorrow: due
  ok("spacing: the next day's due review does advance it", p.concepts.fork.reps === after1.reps + 1 &&
     p.concepts.fork.interval === 3);
  /* and a lapse always counts, due or not */
  Learn.grade(p, forks[0], false, null, t0 + DAY + 2000);
  ok("spacing: a miss counts even when the idea wasn't due", p.concepts.fork.reps === 0 && p.concepts.fork.interval === 0);
}
{
  /* a lapsed idea still comes back for practice */
  const p = Learn.blank();
  const L = Learn.LESSONS.find((l) => l.concept === "pin");
  Learn.grade(p, L, true, "sure", t0);
  Learn.grade(p, L, true, "guess", t0 + DAY);              // due, but a guess: lapse
  ok("due(): a guessed idea comes back the next day even though its reps reset",
     Learn.due(p, t0 + 2 * DAY + 1).some((l) => l.concept === "pin") && !Learn.due(p, t0 + DAY + 1).some((l) => l.concept === "pin"));
}
{
  const p = Learn.blank();
  const L = Learn.LESSONS[0];
  Learn.grade(p, L, true, "sure", t0);
  const m = Learn.mastery(p, L.concept);
  if (!(m >= 0 && m <= 1)) fail("mastery", "out of range");
  const fresh = Learn.blank();
  if (Learn.mastery(fresh, "fork") !== 0) fail("mastery", "unseen concept should be 0");
  console.log("ok    mastery         0 for unseen, bounded 0..1");
}
{
  /* interleaving: due lessons of the same concept shouldn't sit adjacent */
  const p = Learn.blank();
  for (const L of Learn.LESSONS) {
    p.lessons[L.id] = { tries: 1, solved: 1 };
    p.concepts[L.concept] = { ease: 2.4, reps: 1, interval: 1, due: t0 - 1000, seen: 1, right: 1 };
  }
  const list = Learn.due(p, t0);
  let adjacent = 0;
  for (let i = 1; i < list.length; i++) if (list[i].concept === list[i - 1].concept) adjacent++;
  const sameConceptPairs = list.length - new Set(list.map((l) => l.concept)).size;
  if (adjacent > sameConceptPairs) fail("interleave", "practice is blocked, not interleaved");
  console.log(`ok    interleave      ${list.length} due, ${adjacent} same-concept adjacencies`);
}
{
  const p = Learn.blank();
  const n = Learn.next(p);
  if (!n || n.id !== Learn.LESSONS[0].id) fail("path", "next() should start at the beginning");
  const s = Learn.stats(p);
  if (s.total !== Learn.LESSONS.length || s.solved !== 0) fail("stats", "fresh stats wrong");
  console.log("ok    path            next() and stats() behave on a fresh slate");
}

/* ---- saved progress is somebody else's text ----
   Whatever is under the key — half-written, hand-edited, from an older
   build, or hostile — the Academy must open. clean() is what load()
   runs on the parsed text; the read-only questions must also cope with
   being handed junk directly. */
{
  const hostile = [
    '{"v":1,"concepts":null,"lessons":{}}',
    '{"v":1,"concepts":{},"lessons":null}',
    '{"v":1,"concepts":[],"lessons":[]}',
    '{"v":1,"concepts":"fork","lessons":42}',
    '{"v":1,"concepts":{"fork":null,"pin":"x","skewer":[1,2]},"lessons":{"knight-L":null,"fork-pawn":"yes"}}',
    '{"v":1,"concepts":{"fork":{"reps":"5","interval":null,"due":"tomorrow","seen":-3,"right":1e99,"ease":-7}},"lessons":{"fork-knight":{"tries":"many","solved":true}}}',
    '{"v":1,"concepts":{"fork":{"reps":1e308,"interval":1e308,"due":1e308,"seen":1e308,"right":1e308,"ease":1e308}},"lessons":{}}',
    '{"v":1,"concepts":{"__proto__":{"polluted":1},"constructor":{"reps":3}},"lessons":{"__proto__":{"solved":1},"toString":{"solved":1}}}',
    '{"v":2,"concepts":{"fork":{"reps":3}}}',
    'null', '[]', '"just a string"', '42', 'true', '{}',
    '{"v":1}', '{"v":"1","concepts":{},"lessons":{}}',
    '{"v":1,"concepts":{},"lessons":{},"streak":"a lot","lastDay":-5,"practised":{"n":1}}'
  ];
  let threw = 0, bad = 0, first = "";
  for (const text of hostile) {
    let raw;
    try { raw = JSON.parse(text); } catch (e) { raw = text; }
    for (const input of [raw, (() => { try { return Learn.clean(raw); } catch (e) { return e; } })()]) {
      try {
        if (input instanceof Error) throw input;
        const s = Learn.stats(input);
        const m = Learn.mastery(input, "fork");
        Learn.next(input);
        const d = Learn.due(input, t0);
        if (!(s && typeof s.solved === "number" && isFinite(s.solved) && s.total === Learn.LESSONS.length &&
              isFinite(s.streak) && isFinite(s.practised) && isFinite(s.due))) { bad++; first = first || text + " (stats)"; }
        if (!(m >= 0 && m <= 1)) { bad++; first = first || text + " (mastery " + m + ")"; }
        if (!Array.isArray(d)) { bad++; first = first || text + " (due)"; }
      } catch (e) { threw++; first = first || text + " → " + e.message; }
    }
    /* what load() would hand the app is a full, sane structure */
    const c = Learn.clean(raw);
    const okShape = c && c.v === 1 && c.concepts && c.lessons && typeof c.concepts === "object" &&
      !Array.isArray(c.concepts) && !Array.isArray(c.lessons) &&
      Object.values(c.concepts).every((x) => [x.ease, x.reps, x.interval, x.due, x.seen, x.right].every((n) => typeof n === "number" && isFinite(n)) &&
        x.ease >= 1.3 && x.ease <= 5 && x.reps >= 0 && x.interval >= 0 && x.interval <= 3650 && x.right <= x.seen && x.seen >= 0) &&
      Object.values(c.lessons).every((x) => Number.isInteger(x.tries) && Number.isInteger(x.solved) && x.solved <= x.tries);
    if (!okShape) { bad++; first = first || text + " (clean shape)"; }
    /* and grading on top of it works, then survives a save/load round trip */
    try {
      Learn.grade(c, Learn.LESSONS[0], true, "sure", t0);
      const again = Learn.clean(JSON.parse(JSON.stringify(c)));
      if (JSON.stringify(again) !== JSON.stringify(Learn.clean(again))) { bad++; first = first || text + " (round trip)"; }
    } catch (e) { threw++; first = first || text + " grade → " + e.message; }
  }
  ok(`hostile progress: ${hostile.length} junk saves, nothing throws, everything comes back sane`, !threw && !bad, first);
  ok("hostile progress: '__proto__' in a save pollutes nothing", ({}).polluted === undefined &&
     !Object.prototype.hasOwnProperty.call(Learn.clean(JSON.parse(hostile[7])).concepts, "__proto__"));
  let total = true;
  try {
    for (const junk of [undefined, null, 0, "x", [], {}, { concepts: 5 }, { lessons: "x", concepts: {} }]) {
      Learn.stats(junk); Learn.mastery(junk, "pin"); Learn.next(junk); Learn.due(junk);
      Learn.grade(junk, Learn.LESSONS[0], true, "sure", t0);
      Learn.grade(junk, null, true, "sure", t0);
    }
    Learn.accepts(null, null, null); Learn.critique(null, null, null);
  } catch (e) { total = false; console.log("      " + e.stack.split("\n").slice(0, 2).join(" ")); }
  ok("stats/mastery/next/due/grade/accepts/critique never throw, whatever they're handed", total);
  const corrupt = JSON.parse('{"v":1,"concepts":null,"lessons":{}}');
  ok("the playtest's corrupt save opens with a fresh slate", Learn.stats(corrupt).solved === 0 &&
     Learn.next(corrupt) === Learn.LESSONS[0] && Learn.mastery(corrupt, "fork") === 0);

  /* …and through the door the browser actually uses. In node, load()
     never touches storage, so learn.js is run here the way a page runs
     it — no `module`, a `self`, and a localStorage — and the junk goes in
     as the raw text a browser would hand back, including text that
     isn't JSON at all and a storage that refuses to be read. */
  const vm = require("vm"), fs = require("fs"), path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "learn.js"), "utf8");
  function browserLearn(storage) {
    const ctx = { Chess, Teach: require("../teach.js"), localStorage: storage, Date, JSON, Math };
    ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx, { filename: "learn.js" });
    return ctx.Learn;
  }
  const store = {};
  const fake = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const B = browserLearn(fake);
  let broke = "";
  for (const text of hostile.concat(["{not json", "", "{\"v\":1,\"concepts\":", "\u0000\u0001"])) {
    store[B.KEY] = text;
    try {
      const p = B.load();
      B.stats(p); B.mastery(p, "fork"); B.next(p); B.due(p);
      /* the app reads p.lessons[id] directly, so that has to be safe too */
      const solved = (p.lessons[B.LESSONS[0].id] || {}).solved;
      if (solved !== undefined && typeof solved !== "number") throw new Error("lessons entry not numeric");
      B.grade(p, B.LESSONS[0], true, "sure", t0);
      B.save(p);
      const back = B.load();
      if (!back.lessons[B.LESSONS[0].id] || back.lessons[B.LESSONS[0].id].solved < 1) throw new Error("a fresh success didn't survive save/load");
    } catch (e) { broke = broke || JSON.stringify(text) + " → " + e.message; }
  }
  ok("the browser's own load(): junk text, half-written JSON and non-JSON all open, grade, save and load back", !broke, broke);
  const refusing = browserLearn({ getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
  let survived = false;
  try {
    const p = refusing.load();
    refusing.grade(p, refusing.LESSONS[0], true, "sure", t0);
    refusing.save(p);
    survived = refusing.stats(p).solved === 1;
  } catch (e) { survived = false; }
  ok("…and storage that throws (private mode, blocked site data) still gives a working Academy", survived);
}

console.log(failed
  ? `\n${failed} FAILURE(S)`
  : `\nall ${Learn.LESSONS.length} lessons solvable, sound and honest across ${Learn.CHAPTERS.length} chapters`);
process.exit(failed ? 1 : 0);
