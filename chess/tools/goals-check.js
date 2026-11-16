/* goals-check.js — dev-only. Is the next step the nearest true one?

   A goal that is wrong is worse than no goal: "beat Fern for its second
   star" when you already have it, "ten points to Club player" for a
   score that is still swinging by a hundred a game, a newcomer sent to
   Oak. So every rule is fired here from a hand-made state and checked
   for the one that must win and the ones that must not; the judge's
   correction to the walk-order is checked by name (a 920 with Acorn's
   three stars and Sprout's first is sent to the highest rung within
   reach that still holds a star back, not to Sprout); "done" is asked
   of each kind; and the little memory that lets a stale goal step aside
   after five days — and come back when it changes — is walked day by
   day. Then junk in storage.

   Pure node, a fraction of a second.

   Run: node chess/tools/goals-check.js                                  */
"use strict";
const Rating = require("../rating.js");
const Goals = require("../goals.js");

let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};
const DAY = 86400000, T0 = Date.UTC(2026, 0, 1);
function settled(r) {
  return Rating.clean(Object.assign(Rating.fresh(), { r, rd: 60, games: 30, wins: 15, losses: 15, settled: true, best: r, lastAt: T0 }));
}
function rungs(map) {
  const out = {};
  Object.keys(map).forEach((id) => { out[id] = { w: 1, d: 0, l: 0, stars: map[id] }; });
  return out;
}
const ALL = (() => { const m = {}; Rating.LEVELS.forEach((L) => { m[L.id] = [1, 1, 1]; }); return m; })();
function ctx(o) {
  return Object.assign({ rating: Rating.fresh(), ladder: { rungs: {} }, learn: { due: 0 }, lesson: null, feat: null }, o || {});
}
const plainOK = (g) => g && g.text.replace(/<b>[^<]*<\/b>/g, "").indexOf("<") < 0 && g.text.replace(/<[^>]*>/g, "").length <= 90;

/* ---------- each rule, and what it must not beat ---------- */
(function () {
  const g0 = Goals.pick(ctx());
  ok("no games yet: the first game sets your starting point", g0.id === "first" && g0.action.type === "play" && g0.action.level === "sprout", g0.id);

  let s = Rating.fresh(), at = T0;
  for (let i = 0; i < 2; i++) { at += DAY / 4; s = Rating.update(s, { level: "sprout", result: 1, at }).state; }
  const gs = Goals.pick(ctx({ rating: s }));
  ok("still provisional: about how many games until the rating settles", gs.id === "settle" && /settles/.test(gs.text), gs.text);
  const n2 = Goals.gamesToSettle(s);
  s = Rating.update(s, { level: "sprout", result: 0, at: at + DAY / 4 }).state;
  const n3 = Goals.gamesToSettle(s);
  ok("…a count that is small, and falls as games are played", n2 >= 1 && n2 <= 12 && n3 < n2, n2 + " then " + n3);
  ok("…and the simulation never touches the real state", Rating.summary(s).games === 3);

  ok("three ideas due beat everything but a first game", Goals.pick(ctx({ rating: s, learn: { due: 3 } })).id === "due3" &&
     Goals.pick(ctx({ learn: { due: 5 } })).id === "first");

  /* the judge's case: 920, Acorn ★★★, Sprout ★☆☆ */
  const r920 = settled(920);
  const gj = Goals.pick(ctx({ rating: r920, ladder: { rungs: rungs({ acorn: [1, 1, 1], sprout: [1, 0, 0] }) } }));
  ok("the star is the highest rung within reach with one still to earn, not the lowest",
     gj.id === "star" && gj.level === "bamboo" && gj.star === 0 && /Bamboo/.test(gj.text), gj.key);
  const g2 = Goals.pick(ctx({ rating: r920, ladder: { rungs: rungs({ bamboo: [1, 1, 1], club: [1, 0, 0] }) } }));
  ok("…and names which star: the second is a win without help", g2.key === "star:club:1" && /without a hint/.test(g2.text), g2.key);
  const g3 = Goals.pick(ctx({ rating: r920, ladder: { rungs: rungs({ bamboo: [1, 1, 1], club: [1, 1, 0] }) } }));
  ok("…the third, a clean win at 80%", g3.key === "star:club:2" && /80%/.test(g3.text), g3.key);
  ok("a coach out of reach is never the goal", !Goals.pick(ctx({ rating: settled(500) })).key.match(/cactus|pine|mentor|bamboo/));

  const r1180 = settled(1180);
  const gt = Goals.pick(ctx({ rating: r1180, ladder: { rungs: rungs(ALL) } }));
  ok("settled and 20 points short: the title is the step", gt.id === "title" && /20 points/.test(gt.text) && /Club player/.test(gt.text), gt.text);
  const prov = Rating.clean(Object.assign(Rating.fresh(), { r: 1190, rd: 250, games: 3, wins: 3 }));
  ok("…but a provisional 1190 is never told it is 10 points from anything",
     Goals.pick(ctx({ rating: prov, ladder: { rungs: rungs(ALL) } })).id !== "title");
  ok("one idea due is gentler, and comes after stars", Goals.pick(ctx({ rating: r920, learn: { due: 1 } })).id === "star" &&
     Goals.pick(ctx({ rating: r920, learn: { due: 1 }, ladder: { rungs: rungs(ALL) } })).id === "due");
  const feat = { id: "as-black", name: "A win with Black", how: "" };
  const gf = Goals.pick(ctx({ rating: settled(1000), ladder: { rungs: rungs(ALL) }, feat }));
  ok("with nothing nearer: a feat not done yet", gf.id === "feat" && /a win with Black/.test(gf.text) && gf.action.side === "b", gf.text);
  const gl = Goals.pick(ctx({ rating: settled(1000), ladder: { rungs: rungs(ALL) }, lesson: { id: "fork-1", title: "The fork" } }));
  ok("…then the next lesson on the path", gl.id === "lesson" && gl.action.type === "lesson" && gl.action.id === "fork-1");
  const gp = Goals.pick(ctx({ rating: settled(1000), ladder: { rungs: rungs(ALL) } }));
  ok("…and when everything is done, a fair game — there is always a next step", gp.id === "play" && gp.action.type === "play" && /fair fight/.test(gp.text));

  const every = [g0, gs, gj, g2, g3, gt, gf, gl, gp, Goals.pick(ctx({ rating: s, learn: { due: 4 } }))];
  ok("every goal is one short line, with nothing in it but bold", every.every(plainOK), every.filter((g) => !plainOK(g)).map((g) => g.text).join(" | "));
  ok("ids are the rules, keys are deterministic", every.every((g) => Goals.RULES.indexOf(g.id) >= 0) &&
     JSON.stringify(Goals.pick(ctx({ rating: r920 }))) === JSON.stringify(Goals.pick(ctx({ rating: r920 }))));
})();

/* ---------- done ---------- */
(function () {
  const r920 = settled(920);
  const g = Goals.pick(ctx({ rating: r920, ladder: { rungs: rungs({ bamboo: [1, 1, 1], club: [1, 0, 0] }) } }));
  ok("a star goal is done when that star is on the ladder",
     !Goals.done(g, ctx({ rating: r920, ladder: { rungs: rungs({ club: [1, 0, 0] }) } })) &&
     Goals.done(g, ctx({ rating: r920, ladder: { rungs: rungs({ club: [1, 1, 0] }) } })));
  const first = Goals.pick(ctx());
  ok("the first game is done once there is a game", !Goals.done(first, ctx()) && Goals.done(first, ctx({ rating: r920 })));
  const t = { key: "title:1200" };
  ok("a title goal is done on a settled score at the floor, never on a provisional one",
     Goals.done(t, ctx({ rating: settled(1205) })) && !Goals.done(t, ctx({ rating: Rating.clean(Object.assign(Rating.fresh(), { r: 1300, rd: 300, games: 2 })) })));
  ok("a feat goal is done when the feat is", Goals.done({ key: "feat:as-black" }, ctx({ featsDone: { "as-black": { at: 1 } } })) &&
     !Goals.done({ key: "feat:as-black" }, ctx({ featsDone: {} })));
  ok("a fair game and the Academy's rhythm are never 'done' (nothing to celebrate)",
     !Goals.done({ key: "play" }, ctx({ rating: r920 })) && !Goals.done({ key: "due" }, ctx()));
  ok("the words for a step taken", Goals.doneText(g) === "✓ Done: beat 🌿 Fern without a hint or take-back — its second star", Goals.doneText(g));
  ok("…and none where the card already says it its own way (a title, a settled score, a feat)",
     ["title:1200", "settle", "feat:as-black", "lesson:x"].every((key) => Goals.doneText({ key, text: "x" }) === null) &&
     /first game is in/.test(Goals.doneText({ key: "first" })));
  const shownCtx = ctx({ rating: r920, ladder: { rungs: rungs({ bamboo: [1, 1, 1], club: [1, 0, 0] }) } });
  const st = Goals.choose(Goals.fresh(), shownCtx, "2026-03-01").state;
  ok("the goal the lobby showed is remembered in its own words", st.key === "star:club:1" && /without a hint/.test(st.text) && !/</.test(st.text));
  const after = ctx({ rating: r920, ladder: { rungs: rungs({ bamboo: [1, 1, 1], club: [1, 1, 0] }) } });
  ok("…and is not done before it is", Goals.settle(st, shownCtx) === null);
  const said = Goals.settle(st, after);
  ok("…is said to be done once it is", said && /^✓ Done: beat/.test(said.text) && said.state.said === "star:club:1");
  ok("…and never twice", Goals.settle(said.state, after) === null);
})();

/* ---------- five days, then the subject changes ---------- */
(function () {
  const c = ctx({ rating: settled(920), ladder: { rungs: rungs({ bamboo: [1, 1, 1], club: [1, 0, 0] }) }, lesson: { id: "pin-1", title: "The pin" } });
  let st = Goals.fresh(), shown = [];
  for (let d = 1; d <= 7; d++) {
    const day = "2026-01-0" + d;
    let r = Goals.choose(st, c, day); st = r.state; shown.push(r.goal.key);
    r = Goals.choose(st, c, day); st = r.state;        /* the lobby drawn twice the same day counts once */
  }
  ok("the same goal is shown for five days, then steps aside for the next", shown.slice(0, 5).every((k) => k === "star:club:1") && shown[5] === "lesson:pin-1", shown.join(","));
  ok("…and the step aside is remembered", st.skip.indexOf("star:club:1") >= 0);
  const moved = ctx({ rating: settled(920), ladder: { rungs: rungs({ bamboo: [1, 1, 1], club: [1, 1, 0] }) }, lesson: { id: "pin-1", title: "The pin" } });
  const r2 = Goals.choose(st, moved, "2026-01-08");
  ok("once the star is won the next one is a new step, shown at once", r2.goal.key === "star:club:2" && r2.state.skip.indexOf("star:club:1") < 0, r2.goal.key);
  const lone = ctx({ rating: settled(1000), ladder: { rungs: rungs(ALL) } });
  let ls = Goals.fresh(), last = null;
  for (let d = 1; d <= 9; d++) { const r = Goals.choose(ls, lone, "2026-02-0" + d); ls = r.state; last = r.goal; }
  ok("a fair game never steps aside — there is always a next step", last && last.id === "play");
})();

/* ---------- storage ---------- */
(function () {
  const junk = ['{', '[]', 'null', '{"v":1,"days":"x"}', '{"v":1,"skip":"all"}', '{"v":3}', '{"v":1,"key":7,"day":"monday","skip":[1,"a",null]}'];
  ok("junk in storage comes back as a fresh memory", junk.every((raw) => {
    const s = Goals.load(() => raw);
    return s.v === 1 && typeof s.key === "string" && typeof s.days === "number" && Array.isArray(s.skip) && s.skip.every((k) => typeof k === "string") && (s.day === "" || /^\d{4}-/.test(s.day));
  }));
  ok("a getter that throws is a fresh memory", Goals.load(() => { throw new Error("no"); }).days === 0);
  let wrote = null;
  ok("save writes under chessroom_goal", Goals.save(Goals.fresh(), (k, v) => { wrote = k; }) && wrote === "chessroom_goal");
})();

console.log(failed ? `\n${failed} goal${failed > 1 ? "s" : ""} not the nearest true step` : "\nthe next step is always the nearest true one, said plainly, and never nags");
process.exit(failed ? 1 : 0);
