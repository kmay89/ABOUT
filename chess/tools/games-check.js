/* games-check.js — dev-only. Is the journal a faithful record?

   A journal is only worth keeping if what comes back out is what went
   in: the same moves, in the same order, replayable to the same final
   position, with the coach's marks still on the moves they were made
   about. And it is a store a stranger can edit, so anything else that
   comes back — a mark of "???", a move called "<script>", an id with a
   space in it, a list of ten thousand games — must come back as nothing
   rather than as trouble.

   This plays real games through the real engine, writes them, reads
   them back, copies them out as PGN and replays the PGN's movetext to
   the same position; then it feeds the store junk.

   Pure node, a fraction of a second.

   Run: node chess/tools/games-check.js                                  */
"use strict";
const Chess = require("../engine.js");
const Book = require("../book.js");
const Eco = require("../eco.js");
const Rating = require("../rating.js");
const Games = require("../games.js");

let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};
function replay(sans) {
  const g = Chess.create();
  for (const s of sans) { const m = Chess.fromSAN(g, s); if (!m) return null; Chess.play(g, m); }
  return g;
}
const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);
const SCHOLAR = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"];
function entry(over) {
  return Object.assign({ at: T0, mode: "coach", skill: "club", humanSide: 1, result: "white", reason: "checkmate",
                         sans: SCHOLAR.slice(), rv: [[2, 30, 25], [4, 40, -200, "Nf3", null]], marks: { 6: "!", 4: "?!" },
                         acc: null, perf: null, eco: Games.openingOf(SCHOLAR, Eco, Book), clockStr: "none",
                         assist: [0, 1] }, over || {});
}

/* ---------- one game in, one game out ---------- */
(function () {
  const r = Games.add(Games.fresh(), entry());
  ok("a finished game is written and given an id", r.id && /^g[0-9a-z]{6,16}$/.test(r.id) && r.state.list.length === 1, r.id);
  const e = r.state.list[0];
  ok("…its moves come back exactly", JSON.stringify(e.sans) === JSON.stringify(SCHOLAR) && e.plies === 7);
  ok("…its marks and reviews on the plies they were made about",
     e.marks[6] === "!" && e.marks[4] === "?!" && e.rv.length === 2 && e.rv[1][3] === "Nf3" && e.rv[1][4] === null);
  ok("…the help taken, and who sat where", e.assist[1] === 1 && e.humanSide === 1 && e.skill === "club");
  ok("the same game written twice (two tabs, a double tap) is kept once",
     Games.add(r.state, entry()).state.list.length === 1);
  const a = Games.annotate(r.state, r.id, { acc: 83.27, perf: 1012, feats: ["first-win", "mate-queen"] });
  const ae = Games.get(a, r.id);
  ok("the look-back's accuracy and the feats are written on afterwards", ae.acc === 83.3 && ae.perf === 1012 && ae.feats.length === 2);
  ok("…without touching the state it was handed", r.state.list[0].acc === null);
  ok("annotating a game that is not there changes nothing", JSON.stringify(Games.annotate(r.state, "gnothere1", { acc: 9 })) === JSON.stringify(r.state));
})();

/* ---------- fifty, and no more ---------- */
(function () {
  let s = Games.fresh();
  for (let i = 0; i < 57; i++) s = Games.add(s, entry({ at: T0 + i * 60000 })).state;
  ok("the newest fifty stay, oldest first", s.list.length === 50 && s.list[0].at === T0 + 7 * 60000 && s.list[49].at === T0 + 56 * 60000);
  const raw = JSON.stringify({ v: 1, list: Array.from({ length: 300 }, (_, i) => entry({ at: T0 + i })) });
  ok("a hand-grown store is cut back to fifty when read", Games.load(() => raw).list.length === 50);
})();

/* ---------- the opening, as the card names it ---------- */
(function () {
  ok("Scholar's mate's opening has a name and an ECO code", (() => { const o = Games.openingOf(SCHOLAR, Eco, Book); return o && o.name && /^[A-E]\d\d$/.test(o.code); })());
  const ital = Games.openingOf(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"], Eco, Book);
  ok("the Italian is the Italian", ital && /Italian/.test(ital.name), ital && ital.name);
  ok("no moves, no name", Games.openingOf([], Eco, Book) === null);
  ok("…and without the tables (node, or an older page) it quietly says nothing", Games.openingOf(SCHOLAR, {}, {}) === null);
})();

/* ---------- PGN: the open way out ---------- */
(function () {
  const e = Games.add(Games.fresh(), entry()).state.list[0];
  const p = Games.pgn(e, Rating.LEVELS, "You");
  ok("PGN carries the seven-tag roster", ["Event", "Site", "Date", "Round", "White", "Black", "Result"].every((t) => new RegExp("^\\[" + t + " \"", "m").test(p)));
  ok("…names you and the coach in the right chairs", /\[White "You"\]/.test(p) && /\[Black "Fern"\]/.test(p) && /\[BlackElo "920"\]/.test(p));
  ok("…the date as the standard writes it", /\[Date "2026\.11\.15"\]/.test(p));
  ok("…the opening and its code", /\[ECO "[A-E]\d\d"\]/.test(p) && /\[Opening "/.test(p));
  ok("…how it ended", /\[Termination "checkmate"\]/.test(p) && /\[Result "1-0"\]/.test(p));
  ok("…and the coach's marks on the moves", /Qxf7#!/.test(p) && /Qh5\?!/.test(p));
  const moves = p.split("\n\n")[1].replace(/\d+\./g, " ").replace(/(1-0|0-1|1\/2-1\/2)\s*$/, "").replace(/[!?]+/g, "").trim().split(/\s+/);
  const g = replay(moves), f = replay(SCHOLAR);
  ok("the movetext replays to the same final position", g && Chess.fen(g) === Chess.fen(f), moves.join(" "));
  ok("every movetext line fits in 79 columns", p.split("\n").every((l) => l.length <= 79 || /^\[/.test(l)));
  const long = Games.add(Games.fresh(), entry({ sans: Array.from({ length: 40 }, (_, i) => ["Nf3", "Nf6", "Ng1", "Ng8"][i % 4]), result: "draw", reason: "the same position appeared three times" })).state.list[0];
  const lp = Games.pgn(long, Rating.LEVELS, "You");
  ok("…even a long game", lp.split("\n").every((l) => l.length <= 79 || /^\[/.test(l)) && /1\/2-1\/2\n$/.test(lp) && /\[Termination "repetition"\]/.test(lp));
  const pass = Games.add(Games.fresh(), entry({ mode: "pass", humanSide: 1, skill: "club", clockStr: "10+5", result: "black" })).state.list[0];
  const pp = Games.pgn(pass, Rating.LEVELS);
  ok("a game on one screen is White against Black, with its clock", pass.humanSide === 0 && /\[White "White"\]/.test(pp) &&
     /\[TimeControl "600\+5"\]/.test(pp) && /\[Result "0-1"\]/.test(pp) && pass.skill === null);
  const lan = Games.add(Games.fresh(), entry({ mode: "lan", humanSide: -1, opp: 'Sam <b>"the rook"</b>', result: "black" })).state.list[0];
  const lnp = Games.pgn(lan, Rating.LEVELS, "Kit");
  ok("a nearby game names the friend, as plain text — and PGN escapes the quotes", lan.opp === 'Sam b"the rook"/b' &&
     lnp.indexOf('[White "Sam b\\"the rook\\"/b"]') >= 0 && /\[Black "Kit"\]/.test(lnp), lan.opp + " | " + lnp.split("\n")[4]);
  ok("an apostrophe in an opening's name is the name", Games.cleanEntry(entry({ eco: { name: "Bishop's Opening", code: "C23" } })).eco.name === "Bishop's Opening");
  ok("Copy all is every game, one after another", Games.pgnAll({ list: [pass, lan] }, Rating.LEVELS).split("[Event ").length === 3);
})();

/* ---------- reading an entry back ---------- */
(function () {
  const won = Games.cleanEntry(entry());
  ok("the score from your chair", Games.outcome(won) === "won" && Games.outcome(Object.assign({}, won, { humanSide: -1 })) === "lost" &&
     Games.outcome(Object.assign({}, won, { result: "draw" })) === "drew" && Games.outcome(Object.assign({}, won, { humanSide: 0 })) === "1–0");
  const n = Games.names(won, Rating.LEVELS, "You");
  ok("who sat where", n.white === "You" && n.black === "Fern" && n.them === "🌿 Fern" && n.icon === "🌿");
  ok("the row's line: date, opening, length", /^15 Nov · .+ · 4 moves$/.test(Games.summaryLine(won)), Games.summaryLine(won));
})();

/* ---------- storage survives anything ---------- */
(function () {
  const junk = ['{', '[]', 'null', '7', '{"v":1,"list":"x"}', '{"v":2,"list":[]}', '{"v":1}'];
  ok("junk in storage comes back as an empty journal", junk.every((raw) => { const s = Games.load(() => raw); return s.v === 1 && Array.isArray(s.list) && !s.list.length; }));
  ok("a getter that throws is an empty journal", Games.load(() => { throw new Error("private mode"); }).list.length === 0);
  const bad = [
    entry({ sans: [1, 2] }), entry({ sans: ["e4", "<script>"] }), entry({ mode: "tour" }), entry({ result: "won" }),
    entry({ at: "yesterday" }), entry({ sans: Array.from({ length: 700 }, () => "Nf3") }), null, [], "game"
  ];
  const s = Games.clean({ v: 1, list: bad.concat([entry()]) });
  ok("an entry whose moves are not moves, or whose mode or result is not one, is dropped whole", s.list.length === 1, s.list.length);
  const odd = Games.cleanEntry(entry({ id: "g has space", marks: { 2: "???", 3: "!!", 99: "!", x: "?" }, rv: [[1, "a", 3], [99, 1, 1], "row", [3, 10, 20, "<b>Nf3</b>", 5]],
                                       acc: 140, perf: -5, low: -99999, clockStr: "forever", assist: ["x", 5e9], feats: ["first-win", "Bad Id", "first-win"],
                                       eco: { name: "<i>Italian</i>", code: "Z99" }, reason: "<img src=x onerror=alert(1)>checkmate", daily: "tomorrow" }));
  ok("…and the rest is rebuilt field by field", odd && /^g[0-9a-z]{6,16}$/.test(odd.id) && Object.keys(odd.marks).join() === "3" &&
     odd.rv.length === 1 && odd.rv[0][3] === "bNf3/b" && odd.rv[0][4] === null && odd.acc === 100 && odd.perf === 0 && odd.low === -3000 &&
     odd.clockStr === "none" && odd.assist[0] === 0 && odd.assist[1] === 1000 && odd.feats.join() === "first-win" &&
     odd.eco.name === "iItalian/i" && odd.eco.code === "" && !/[<>]/.test(odd.reason) && odd.daily === null, JSON.stringify(odd));
  let wrote = null;
  ok("save writes the clean shape under chessroom_games",
     Games.save({ v: 1, list: [entry(), null] }, (k, v) => { wrote = [k, v]; }) && wrote[0] === "chessroom_games" && JSON.parse(wrote[1]).list.length === 1);
  ok("a setter that refuses is a save that did not happen", Games.save(Games.fresh(), () => false) === false);
})();

console.log(failed ? `\n${failed} problem${failed > 1 ? "s" : ""} with the journal` : "\nthe journal keeps what happened, gives it back as PGN, and survives anything");
process.exit(failed ? 1 : 0);
