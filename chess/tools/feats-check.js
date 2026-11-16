/* feats-check.js — dev-only. Is every feat true?

   A feat that is awarded for something that did not happen is worse
   than no feat at all: it teaches a player that the cabinet lies, and
   then nothing in it means anything. So each one is earned here by a
   real game played through the real engine — Scholar's mate, a
   smothered mate from a famous trap, a back-rank mate, a castle that
   mates, an underpromotion, an en passant — and each one is also
   *not* earned where it should not be: a lost game, a pass-and-play
   game (both chairs are you), a pin you walked into, a fork that only
   ever won a pawn, a "comeback" from a deficit the coach never saw.

   And the store survives anything a browser or a stranger could hand it.

   Pure node, a fraction of a second.

   Run: node chess/tools/feats-check.js                                  */
"use strict";
const Chess = require("../engine.js");
const Feats = require("../feats.js");
const Rating = require("../rating.js");

let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

/* play a list of SAN moves from a position, feeding each of `me`'s moves
   through onMove the way commitMove does, with the teaching eyes' list */
function play(sans, me, fen, lessonsFor) {
  const g = Chess.create(fen);
  let flags = {};
  for (let i = 0; i < sans.length; i++) {
    const mover = g.turn;
    const m = Chess.fromSAN(g, sans[i]);
    if (!m) throw new Error("illegal in fixture: " + sans[i] + " at " + i);
    const lessons = lessonsFor ? lessonsFor(i) : [];
    if (mover === me) flags = Feats.onMove(flags, m, lessons);
    Chess.play(g, m);
  }
  return { g, flags };
}
function result(g) { const st = Chess.status(g); return st.over ? st.result : null; }
function earned(game, me, extra) {
  const ctx = Object.assign({ g: game.g, mode: "coach", mySide: me, result: result(game.g) || "draw", low: 0,
                              level: "club", ladder: { rungs: {} }, marks: {}, levels: Rating.LEVELS }, extra || {});
  return Feats.onGame(Feats.fresh(), game.flags, ctx);
}
const has = (list, ids) => ids.every((id) => list.indexOf(id) >= 0);
const lacks = (list, ids) => ids.every((id) => list.indexOf(id) < 0);

/* ---------- the catalogue ---------- */
(function () {
  const ids = new Set();
  let shape = true, why = "";
  Feats.LIST.forEach((f) => {
    if (!/^[a-z][a-z0-9-]*$/.test(f.id) || ids.has(f.id)) { shape = false; why = "id " + f.id; }
    ids.add(f.id);
    if (typeof f.name !== "string" || f.name.length > 28) { shape = false; why = "name " + f.id; }
    if (typeof f.how !== "string" || /[<>]/.test(f.how) || f.how.length > 110) { shape = false; why = "how " + f.id; }
    if (!(f.tier >= 0 && f.tier <= 6) || (f.scope !== "game" && f.scope !== "after")) { shape = false; why = "tier/scope " + f.id; }
  });
  ok("every feat has a unique id, a short name, a plain sentence, a tier and a scope", shape, why);
  ok("the cabinet is a cabinet, not a wall (20–32 feats)", Feats.LIST.length >= 20 && Feats.LIST.length <= 32, Feats.LIST.length);
  ok("nothing in it is about turning up", !Feats.LIST.some((f) => /streak|day|login|open the app|share/i.test(f.id + " " + f.how)));
})();

/* ---------- finishing ---------- */
(function () {
  const scholar = play(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"], 1);
  const got = earned(scholar, 1);
  ok("Scholar's mate as White: a first win, mate with the queen, a win in 15",
     has(got, ["first-win", "mate-queen", "quick-win"]), got.join(","));
  ok("…and not a knight mate, not a win with Black, not a comeback", lacks(got, ["mate-knight", "as-black", "comeback", "smothered"]), got.join(","));
  const lost = earned(scholar, -1);
  ok("the same game from the losing chair earns nothing", lost.length === 0, lost.join(","));
  ok("two people on one screen earn nothing (both chairs are you)",
     earned(scholar, 1, { mode: "pass" }).length === 0 && earned(scholar, 0, { mode: "pass" }).length === 0);
  const lan = earned(scholar, 1, { mode: "lan", level: null });
  ok("a friend nearby: the rules are the same rules", has(lan, ["first-win", "mate-queen"]), lan.join(","));

  const fool = play(["f3", "e5", "g4", "Qh4#"], -1);
  ok("Fool's mate from Black's chair: a win with Black", has(earned(fool, -1), ["as-black", "mate-queen", "first-win"]));

  /* the old trap: 7…Nf3#, the king boxed in by its own queen, pawn,
     bishop, pawn and rook, and the bishop that could take pinned */
  const smother = play(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4", "Nxe5", "Qg5", "Nxf7", "Qxg2", "Rf1", "Qxe4+", "Be2", "Nf3#"], -1);
  const sg = earned(smother, -1);
  ok("a smothered mate is seen as one, and as a knight mate", has(sg, ["smothered", "mate-knight", "as-black"]), sg.join(","));

  const back = play(["Ra8#"], 1, "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1");
  const bg = earned(back, 1);
  ok("a back-rank mate: the king on its home row, shut in by its own pawns", has(bg, ["back-rank", "mate-rook"]), bg.join(","));
  const open = play(["Ra8#"], 1, "6k1/8/6K1/8/8/8/8/R7 w - - 0 1");
  const og = earned(open, 1);
  ok("…but a rook mate with the king held by the other king is not a back-rank mate",
     has(og, ["mate-rook"]) && lacks(og, ["back-rank"]), og.join(","));

  const castle = play(["O-O#"], 1, "4rkr1/4p1p1/8/8/8/8/8/4K2R w K - 0 1");
  const cg = earned(castle, 1);
  ok("castling that mates is its own feat (and not a rook mate)", has(cg, ["mate-castle", "castle-long"]) === false && has(cg, ["mate-castle"]) && lacks(cg, ["mate-rook"]), cg.join(","));

  const promo = play(["b8=Q#"], 1, "k7/1PK5/8/8/8/8/8/8 w - - 0 1");
  const pg = Feats.onGame(Feats.fresh(), promo.flags, { g: promo.g, mode: "coach", mySide: 1, result: result(promo.g), levels: Rating.LEVELS });
  ok("a promotion that mates", has(pg, ["mate-promote"]) && lacks(pg, ["underpromote", "mate-pawn"]), pg.join(","));
})();

/* ---------- the rules' rarer corners ---------- */
(function () {
  const ep = play(["e4", "a6", "e5", "d5", "exd6"], 1);
  ok("an en passant capture is seen (and is yours whatever the result)", has(earned(ep, 1), ["en-passant"]));
  ok("…but only when it was your move", lacks(earned(play(["e4", "a6", "e5", "d5", "exd6"], -1), -1), ["en-passant"]));
  const long = play(["d4", "d5", "Nc3", "Nc6", "Bf4", "Bf5", "Qd2", "Qd7", "O-O-O"], 1);
  ok("castling long", has(earned(long, 1), ["castle-long"]));
  const short = play(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"], 1);
  ok("…and castling short is not castling long", lacks(earned(short, 1), ["castle-long"]));
  const under = play(["a8=N"], 1, "8/P7/8/8/8/8/k7/4K3 w - - 0 1");
  ok("an underpromotion to a knight", has(earned(under, 1), ["underpromote"]));
  const queen = play(["a8=Q"], 1, "8/P7/8/8/8/8/k7/4K3 w - - 0 1");
  ok("…and a queen is not an underpromotion", lacks(earned(queen, 1), ["underpromote"]));
})();

/* ---------- tactics, and only the ones that were yours ---------- */
(function () {
  const sans = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"];
  const withL = (list) => play(sans, 1, null, (i) => (i === 2 ? list : []));
  ok("a fork worth more than a pawn, in a game you won", has(earned(withL([{ concept: "fork", weight: 88 }]), 1), ["fork-won"]));
  ok("…but a fork that only ever wins a pawn is not the feat", lacks(earned(withL([{ concept: "fork", weight: 72 }]), 1), ["fork-won"]));
  ok("a pin you made (weight 84) that won", has(earned(withL([{ concept: "pin", weight: 84 }]), 1), ["pin-won"]));
  ok("…but a pin you walked into (weight 91) is not yours", lacks(earned(withL([{ concept: "pin", weight: 91 }]), 1), ["pin-won"]));
  ok("a skewer that won", has(earned(withL([{ concept: "skewer", weight: 82 }]), 1), ["skewer-won"]));
  const lostFork = play(["f3", "e5", "g4", "Qh4#"], 1, null, (i) => (i === 0 ? [{ concept: "fork", weight: 92 }] : []));
  ok("a fork in a game you lost is not a fork that won", lacks(earned(lostFork, 1), ["fork-won"]));
})();

/* ---------- the shape of a game ---------- */
(function () {
  /* four times round the knights, then Scholar's mate: 23 plies */
  const pad = []; for (let i = 0; i < 4; i++) pad.push("Nf3", "Nf6", "Ng1", "Ng8");
  const slow = play(pad.concat(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]), 1);
  ok("a comeback: won after the coach had you three pawns down", has(earned(slow, 1, { low: -340 }), ["comeback"]));
  ok("…not from a deficit of two pawns", lacks(earned(slow, 1, { low: -250 }), ["comeback"]));
  ok("…not in a game too short to have turned", lacks(earned(play(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"], 1), 1, { low: -900 }), ["comeback"]));
  ok("…and never in a nearby game, where no coach was watching", lacks(earned(slow, 1, { mode: "lan", low: -900 }), ["comeback"]));
  const g = Chess.create();
  const drawCtx = { g, mode: "coach", mySide: 1, result: "draw", levels: Rating.LEVELS };
  ok("saving a lost game: a draw from five pawns down", has(Feats.onGame(Feats.fresh(), {}, Object.assign({ low: -600 }, drawCtx)), ["swindle"]));
  ok("…and not from one pawn down", lacks(Feats.onGame(Feats.fresh(), {}, Object.assign({ low: -100 }, drawCtx)), ["swindle"]));
  ok("a 'brilliant' needs the coach's !! on one of your own moves",
     has(earned(slow, 1, { marks: { 20: "!!" } }), ["brilliant"]) && lacks(earned(slow, 1, { marks: { 21: "!!" } }), ["brilliant"]));
  /* material without a replay: fourteen captures of officers, a pawn
     ending reached, then the win */
  const fake = { played: [], board: Chess.create().board, kings: [4, 116] };
  [2, 3, 3, 4, 4, 2].forEach((k) => { fake.played.push({ m: { capt: -k } }); fake.played.push({ m: { capt: k } }); });
  fake.played.push({ m: { capt: -5 } }); fake.played.push({ m: { capt: 5 } });
  const pe = Feats.facts({ g: fake, mySide: 1, result: "white" });
  ok("a kings-and-pawns ending is seen from the captures alone", pe.pawnEnding && pe.queenLost);
  fake.played.splice(4, 2);
  ok("…and not while a piece is still on the board", !Feats.facts({ g: fake, mySide: 1, result: "white" }).pawnEnding);
})();

/* ---------- the ladder, and the look-back ---------- */
(function () {
  const sans = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"];
  const win = play(sans, 1);
  const rungs = {};
  Rating.LEVELS.forEach((L) => { rungs[L.id] = { w: 1, d: 0, l: 0, stars: [1, 0, 0] }; });
  ok("beaten every coach, once the last first star is on the ladder", has(earned(win, 1, { ladder: { rungs } }), ["beat-each"]));
  ok("beating Oak is beating Oak", has(earned(win, 1, { level: "mentor" }), ["beat-oak"]) && lacks(earned(win, 1), ["beat-oak"]));
  const after = (x) => Feats.onAfter(Feats.fresh(), Object.assign({ mode: "coach", won: true, acc: 92, counts: { inaccuracy: 0, mistake: 0, blunder: 0 }, ladder: { rungs: {} } }, x));
  ok("a win the look-back finds no slip in", has(after({}), ["spotless", "sharp"]));
  ok("…one inaccuracy and it is not spotless", lacks(after({ counts: { inaccuracy: 1 } }), ["spotless"]));
  ok("…and a game too short to measure is neither", after({ acc: null }).length === 0);
  ok("three stars on one coach", has(after({ ladder: { rungs: { club: { stars: [1, 1, 1] } } } }), ["mastered-one"]));
  ok("the look-back judges nothing in a nearby game", Feats.onAfter(Feats.fresh(), { mode: "lan", won: true, acc: 99 }).length === 0);
})();

/* ---------- said once, kept ---------- */
(function () {
  const win = play(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"], 1);
  const first = earned(win, 1);
  const st = Feats.award(Feats.fresh(), first, 1700000000000, "gabc1234");
  ok("an awarded feat keeps its date and its game", st.done["first-win"].at === 1700000000000 && st.done["first-win"].game === "gabc1234");
  const again = Feats.onGame(st, win.flags, { g: win.g, mode: "coach", mySide: 1, result: "white", levels: Rating.LEVELS });
  ok("a feat is never awarded twice", again.length === 0, again.join(","));
  const later = Feats.award(st, ["first-win"], 1800000000000, null);
  ok("…and awarding it again does not move its date", later.done["first-win"].at === 1700000000000);
  const sm = Feats.summary(st);
  ok("the cabinet lists what you have done first", sm.rows[0].done && sm.earned === first.length && sm.total === Feats.LIST.length);
})();

/* ---------- what the record already shows ---------- */
(function () {
  const T1 = 1700000000000;
  const hist = [{ at: T1, result: 0 }, { at: T1 + 5, result: 1 }, { at: T1 + 9, result: 1 }];
  const rg = {}; Rating.LEVELS.forEach((L) => { rg[L.id] = { w: 1, d: 0, l: 0, stars: [1, 0, 0] }; });
  rg.club.stars = [1, 1, 1];
  const r = Feats.fromRecord(Feats.fresh(), { history: hist, ladder: { rungs: rg }, levels: Rating.LEVELS, now: T1 + 99 });
  ok("a player with a past is not told 'a first win' on the hundred-and-first: it is filled in from the history, dated",
     r.state.done["first-win"] && r.state.done["first-win"].at === T1 + 5 && r.state.done["first-win"].game === null);
  ok("…and so are the ladder's own facts", ["beat-oak", "beat-each", "mastered-one"].every((id) => r.state.done[id]), r.ids.join(","));
  ok("…nothing the record cannot prove", Object.keys(r.state.done).length === 4);
  ok("…and only once", Feats.fromRecord(r.state, { history: hist, ladder: { rungs: rg }, levels: Rating.LEVELS }).ids.length === 0);
  ok("a fresh player's record proves nothing", Feats.fromRecord(Feats.fresh(), { history: [], ladder: { rungs: {} }, levels: Rating.LEVELS }).ids.length === 0);
})();

/* ---------- what to suggest ---------- */
(function () {
  const n0 = Feats.nextFor(Feats.fresh(), 0);
  ok("a newcomer is asked for something a newcomer can do", n0 && n0.tier === 0, n0 && n0.id);
  const all0 = Feats.award(Feats.fresh(), Feats.LIST.filter((f) => f.tier === 0).map((f) => f.id), 1, null);
  ok("…and nothing harder until their title says so", Feats.nextFor(all0, 0) === null);
  const n2 = Feats.nextFor(all0, 2);
  ok("a stronger player is asked for the next gentlest", n2 && n2.tier === 1, n2 && n2.id);
  const quests = Feats.LIST.filter((f) => f.quest === false).map((f) => f.id);
  const rest = Feats.award(Feats.fresh(), Feats.LIST.filter((f) => f.quest !== false).map((f) => f.id), 1, null);
  ok("it never asks you to be losing first (comeback, saved games)", Feats.nextFor(rest, 6) === null && quests.indexOf("comeback") >= 0);
})();

/* ---------- storage ---------- */
(function () {
  const junk = ['{', '[]', 'null', '{"v":1,"done":[]}', '{"v":1,"done":{"x":{"at":1}}}', '{"v":2,"done":{}}',
                '{"v":1,"done":{"first-win":{"at":"soon"}}}', '{"v":1,"done":{"first-win":{"at":5,"game":"<b>"}}}'];
  let fine = true;
  junk.forEach((raw) => {
    const s = Feats.load(() => raw);
    if (!s || s.v !== 1 || typeof s.done !== "object" || Array.isArray(s.done)) fine = false;
    Object.keys(s.done).forEach((id) => { if (!Feats.byId(id) || typeof s.done[id].at !== "number") fine = false; });
  });
  ok("junk in storage comes back as a clean cabinet (unknown ids and bad dates dropped)", fine);
  const g = Feats.load(() => '{"v":1,"done":{"first-win":{"at":5,"game":"<b>"}}}');
  ok("…and a game id that is not one becomes null rather than markup", g.done["first-win"].game === null);
  ok("a getter that throws is a fresh cabinet", Object.keys(Feats.load(() => { throw new Error("private mode"); }).done).length === 0);
  let wrote = null;
  ok("save writes the clean shape under chessroom_feats",
     Feats.save({ v: 1, done: { "first-win": { at: 9 }, bogus: { at: 1 } } }, (k, v) => { wrote = [k, v]; }) &&
     wrote[0] === "chessroom_feats" && JSON.parse(wrote[1]).done.bogus === undefined);
  ok("a setter that refuses is a save that did not happen", Feats.save(Feats.fresh(), () => false) === false);
})();

console.log(failed ? `\n${failed} feat${failed > 1 ? "s" : ""} not true` : "\nevery feat is a fact about the board — earned where it happened, and nowhere else");
process.exit(failed ? 1 : 0);
