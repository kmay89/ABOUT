/* help-check.js — the help lamp has to be right, and has to be fair.

   The lamp (help.js) is the room's teacher answering questions in the
   middle of a game, so it is held to the teacher's own bar: every count
   it gives is the rules' count, every threat it names is one teach.js
   has proved, and when it would hand over a threat the person has not
   paid for, it asks instead of telling. The training wheels' two
   judgements — what of yours can be won, and where a lifted piece would
   be lost — are checked on positions where the answer is obvious to a
   person, and timed, because they run on a tap. And the price: a game
   played with the wheels counts for three quarters.

   Node only; the browser half is lamp-check.js, welcome-check.js and
   wheels-check.js. Run: node chess/tools/help-check.js */
"use strict";
const Chess = require("../engine.js");
const Teach = require("../teach.js");
const Book = require("../book.js");
const Help = require("../help.js");
const Rating = require("../rating.js");

let failed = 0;
function ok(label, cond, extra) {
  if (!cond) { failed++; console.log("FAIL  " + label + (extra ? "  → " + extra : "")); }
  else console.log("ok    " + label);
}
function game(sans) {
  const g = Chess.create();
  for (const s of sans) { const m = Chess.fromSAN(g, s); if (!m) throw new Error("illegal " + s); Chess.play(g, m); }
  return g;
}
const sq = (n) => (n.charCodeAt(1) - 49) * 16 + (n.charCodeAt(0) - 97);
const WORD = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const said = (n) => n < WORD.length ? WORD[n] : String(n);
const plain = (h) => String(h).replace(/<[^>]*>/g, "");

/* ---- the plumbing the lamp stands on ---- */
{
  ok("teach.js lends the lamp its honesty guards",
     ["looseInfo", "reallyLost", "reallyLostIfTheyMoved", "matesNow"].every((k) => typeof Teach[k] === "function"));
  const keys = Object.keys(Book.REASONS);
  ok("the book has a reason for each of its " + keys.length + " explained moves, found by the moves",
     keys.length >= 50 && keys.every((k) => Book.reason(k.split(" ")) === Book.REASONS[k]));
  ok("…with check marks on the moves or without", Book.reason(["e4", "e5", "Nf3"]) === Book.reason(["e4", "e5", "Nf3+"]));
  ok("…and none for a move it never explained", Book.reason(["a4", "h5", "Ra3"]) === null && Book.reason([]) === null &&
     Book.reason(["constructor"]) === null);
}

/* ---- Think: the counts are the rules' counts, and nothing is located for free ---- */
{
  let seed = 20261115, times = [], bad = "", leak = "", n = 0;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const LEAK = /(their|enemy) (pawn|knight|bishop|rook|queen|king) on [a-h][1-8]/i;
  for (let gi = 0; gi < 40 && n < 200; gi++) {
    const g = Chess.create();
    for (let ply = 0; ply < 70 && n < 200; ply++) {
      const ms = Chess.moves(g);
      if (!ms.length) break;
      if (ply >= 4 && ply % 2 === 0) {
        n++;
        const side = g.turn, fenBefore = Chess.fen(g);
        const last = g.played.length ? g.played[g.played.length - 1].san : null;
        const t0 = process.hrtime.bigint();
        const t = Help.think(g, side, { reveal: false, last: last ? { san: last } : null });
        times.push(Number(process.hrtime.bigint() - t0) / 1e6);
        let checks = 0, caps = 0;
        for (const m of ms) {
          if (m.capt || (m.flags & Chess.F_EP)) caps++;
          Chess.make(g, m); if (Chess.inCheck(g)) checks++; Chess.unmake(g);
        }
        const head = plain(t.lines[0] || "");
        const want = !checks && !caps ? /no checks.*no captures/ :
          new RegExp("\\b" + said(checks) + " checks?\\b.*\\b" + said(caps) + " captures?\\b");
        if (!bad && (!t.lines.length || t.lines.length > 3 || t.lines.some((l) => !l || /undefined|NaN/.test(l)) ||
                     !want.test(head) || Chess.fen(g) !== fenBefore))
          bad = fenBefore + " :: " + t.lines.join(" | ");
        const rest = t.lines.map(plain).join(" ").replace(last ? "was " + last : "\u0000", "");
        if (!leak && LEAK.test(rest)) leak = fenBefore + " :: " + rest;
      }
      Chess.play(g, ms[Math.floor(rnd() * ms.length)]);
    }
  }
  ok("Think reads " + n + " positions: one to three lines, the right counts, the game untouched", n >= 200 && !bad, bad);
  ok("…and names no square of theirs it was not paid to name", !leak, leak);
  /* the 95th percentile, not the worst: one garbage collection is not
     the lamp being slow */
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)] || 0;
  ok("…quickly enough to answer a tap (95% under " + p95.toFixed(1) + "ms)", p95 < 25, p95.toFixed(1) + "ms");
}
{
  /* a hand position with exactly two checks and one capture: Re1+ and
     Ba4+ are the checks, Rxa7 the capture */
  const g = Chess.create("4k3/p7/8/8/8/8/8/R2B3K w - - 0 1");
  let checks = 0, caps = 0;
  for (const m of Chess.moves(g)) { if (m.capt) caps++; Chess.make(g, m); if (Chess.inCheck(g)) checks++; Chess.unmake(g); }
  const t = Help.think(g, 1, {});
  ok("a position with " + checks + " checks and " + caps + " capture is counted as such",
     checks === 2 && caps === 1 && /two checks/.test(t.lines[0]) && /one capture\b/.test(t.lines[0]), plain(t.lines[0]));
  const behind = Help.think(game(["e4", "e5", "Nf3", "d6", "Bc4", "Bg4", "h3"]), -1, { reveal: true });
  ok("behind, Think may say where the loose piece is", behind.lines.some((l) => /your bishop on g4 can be won/i.test(l)),
     behind.lines.join(" | "));
  const level = Help.think(game(["e4", "e5", "Nf3", "d6", "Bc4", "Bg4", "h3"]), -1, { reveal: false });
  ok("…and level, only that one of yours is loose", level.lines.some((l) => /one piece of yours<\/b> is loose/.test(l)) &&
     !level.lines.some((l) => /g4/.test(l)), level.lines.join(" | "));
}

/* ---- Their idea: true words, from your chair, and fair about threats ---- */
{
  const pre = game(["e4", "e5", "Nf3", "d6", "Bc4", "Bg4"]);
  const m = Chess.fromSAN(pre, "h3");
  const after = game(["e4", "e5", "Nf3", "d6", "Bc4", "Bg4", "h3"]);
  const hush = Help.hushFor(after, -1);
  ok("the bishop h3 attacks is one the wheels would mark", hush[sq("g4")] === true);
  const asked = Help.theirs(pre, m, -1, { reveal: false, hush });
  ok("level, a threat against you becomes a question", asked.asked && /still guarded\?/.test(asked.text) &&
     !/g4/.test(plain(asked.text).replace(/^h3/, "")) && asked.line.kind === "run", plain(asked.text));
  const told = Help.theirs(pre, m, -1, { reveal: true, hush });
  ok("…and behind, it is named, with its line", !told.asked && /bishop on g4/.test(told.text) &&
     told.line.kind === "threat" && told.line.from === sq("h3") && told.line.to === sq("g4"), plain(told.text));
  ok("…and the question never comes with the answer drawn", asked.squares.indexOf(sq("g4")) < 0);
}
{
  const pre = game(["e4", "e5", "Bc4", "Nc6"]);
  const t = Help.theirs(pre, Chess.fromSAN(pre, "Qh5"), -1, { reveal: false, hush: { [sq("f7")]: true } });
  ok("a mate threat is always named, even when nothing else would be", t.mate && /Qxf7/.test(t.text) &&
     t.line.kind === "threat" && t.line.to === sq("f7"), plain(t.text));
  ok("…in your words, not the mover's", /unless you stop it/.test(t.text) && !/unless they stop it/.test(t.text), plain(t.text));
  /* one move later, a mate that still stands is still named */
  const pre2 = game(["e4", "e5", "Bc4", "Nc6", "Qh5", "a6"]);
  const t2 = Help.theirs(pre2, Chess.fromSAN(pre2, "a3"), -1, {});
  ok("a mate threat still standing after a quiet move is named too", t2.mate && /checkmate/.test(t2.text), plain(t2.text));
}
{
  const pre = game(["e4", "e5"]);
  const nf3 = Chess.fromSAN(pre, "Nf3");
  const t = Help.theirs(pre, nf3, -1, { reason: Book.reason(["e4", "e5", "Nf3"]) });
  ok("in a known line, the book's reason comes first", plain(t.text).indexOf("Nf3 — " + plain(Book.REASONS["e4 e5 Nf3"])) === 0, plain(t.text));
  const p = Help.theirs(pre, nf3, -1, { plan: ["Nf3", "Nc6", "Bb5"] });
  ok("what the coach was counting on is told when given", /counting on Nc6 Bb5/.test(t.text + p.text), plain(p.text));
  const own = Help.theirs(pre, nf3, 1, {});
  const their = Help.theirs(pre, nf3, -1, {});
  ok("a move is told from the asker's chair (pronouns turn round)", /their pieces|attacks the pawn/.test(own.text) || own.text === their.text.replace(/your/g, "their"), plain(own.text) + " / " + plain(their.text));
  const q = Help.theirs(Chess.create(), Chess.fromSAN(Chess.create(), "a3"), -1, {});
  ok("a quiet move gets a question, not an invented reason", q.quiet && /What might it prepare\?/.test(q.text), plain(q.text));
  ok("Help.flip swaps the chairs and keeps the capitals", Help.flip("They must answer, and you take their rook. Your move.") ===
     "You must answer, and they take your rook. Their move.");
}
{
  /* every Their-idea sentence over random games is plain words with
     only <b>/<i>, names the move first, and leaves the game as it was */
  let seed = 777, bad = "", calls = 0;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let gi = 0; gi < 25; gi++) {
    const g = Chess.create();
    for (let ply = 0; ply < 60; ply++) {
      const ms = Chess.moves(g);
      if (!ms.length) break;
      const m = ms[Math.floor(rnd() * ms.length)], fen = Chess.fen(g);
      const listener = -g.turn;
      const t = Help.theirs(g, m, listener, { reveal: rnd() < 0.5, hush: {} });
      calls++;
      if (!bad && (Chess.fen(g) !== fen || /undefined|NaN|null/.test(t.text) || /<(?!\/?(b|i)>)[^>]*>/.test(t.text) ||
                   plain(t.text).indexOf(Chess.toSAN(g, m).replace(/[+#]$/, "") + " — ") !== 0))
        bad = fen + " " + Chess.toSAN(g, m) + " :: " + t.text;
      Chess.play(g, m);
    }
  }
  ok("Their idea reads " + calls + " random moves: plain words, the move named first, the game untouched", calls > 500 && !bad, bad);
}

/* ---- training wheels: what is in danger, and where a piece would be lost ---- */
{
  const g = game(["e4", "d5", "exd5", "Qxd5", "Nc3"]);
  const d = Help.danger(g, -1);
  ok("the queen a knight chases is in danger", d.pieces.length >= 1 && d.pieces[0].sq === sq("d5") && d.pieces[0].from === sq("c3"),
     JSON.stringify(d));
  ok("…and nothing of White's is marked for White", Help.danger(game(["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5"]), 1).pieces.length === 0);
  const m = Help.danger(game(["e4", "e5", "Bc4", "Nc6", "Qh5"]), -1);
  ok("a mate threat against you is found", m.mate && m.mate.san === "Qxf7#", JSON.stringify(m.mate));
  const pawnsOnly = Help.danger(Chess.create("4k3/8/8/3p4/4P3/8/8/4K3 b - - 0 1"), -1);
  ok("a loose pawn is not worth a warning", pawnsOnly.pieces.length === 0);
}
{
  /* the knight on b1: a3 is safe, c3 is defended against the bishop (a
     trade), d2 is attacked and undefended */
  const g = Chess.create("4k3/8/8/b7/8/8/1P6/1N5K w - - 0 1");
  const h = Help.hot(g, Chess.movesFrom(g, sq("b1")));
  ok("a knight's undefended destination under attack is hot", h.hot.indexOf(sq("d2")) >= 0, JSON.stringify(h));
  ok("…a defended one (a trade at worst) is not", h.hot.indexOf(sq("c3")) < 0);
  ok("…nor a safe one", h.hot.indexOf(sq("a3")) < 0);
  const lose = Chess.create("4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1");
  const hl = Help.hot(lose, Chess.movesFrom(lose, sq("d1")));
  ok("a capture that loses the exchange is hot", hl.hotCapt.indexOf(sq("d5")) >= 0, JSON.stringify(hl));
  const win = Chess.create("4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1");
  const hw = Help.hot(win, Chess.movesFrom(win, sq("d1")));
  ok("…a capture that wins material is not", hw.hotCapt.indexOf(sq("d5")) < 0);
  const king = Chess.create("4k3/8/8/8/8/8/3q4/4K3 w - - 0 1");
  ok("the king is never hot — the rules already keep him safe", Help.hot(king, Chess.movesFrom(king, sq("e1"))).hotCapt.length === 0 &&
     Help.hot(king, Chess.movesFrom(king, sq("e1"))).hot.length === 0);
}
{
  /* timed on the busiest piece of twenty random middlegames */
  let seed = 4242, worst = 0, same = true;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let gi = 0; gi < 20; gi++) {
    const g = Chess.create();
    for (let ply = 0; ply < 24; ply++) { const ms = Chess.moves(g); if (!ms.length) break; Chess.play(g, ms[Math.floor(rnd() * ms.length)]); }
    const by = {};
    for (const m of Chess.moves(g)) (by[m.from] = by[m.from] || []).push(m);
    const busiest = Object.values(by).sort((a, b) => b.length - a.length)[0] || [];
    const fen = Chess.fen(g), t0 = process.hrtime.bigint();
    Help.hot(g, busiest); Help.danger(g, g.turn);
    worst = Math.max(worst, Number(process.hrtime.bigint() - t0) / 1e6);
    if (Chess.fen(g) !== fen) same = false;
  }
  ok("the wheels look at the busiest piece of 20 middlegames in under 40ms (worst " + worst.toFixed(1) + "ms)", worst < 40);
  ok("…and leave every game as they found it", same);
}

/* ---- the price ---- */
{
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ok("a game with training wheels counts as three quarters", near(Rating.assistWeight({ wheels: 1 }), 0.75) &&
     near(Rating.assistWeight({ wheels: 40 }), 0.75));
  ok("…on top of a hint, counted once", near(Rating.assistWeight({ hints: 1, wheels: 3 }), 0.675));
  ok("…and never below the floor", Rating.assistWeight({ takebacks: 9, hints: 9, wheels: 9 }) === 0.25);
  ok("…and nonsense counts as no wheels", Rating.assistWeight({ wheels: "lots" }) === 1 && Rating.assistWeight({ wheels: -3 }) === 1);
  const st = Rating.load(() => null);
  const out = Rating.update(st, { level: Rating.LEVELS[0].id, result: 1, at: Date.now(), assisted: { takebacks: 0, hints: 0, wheels: 2 } });
  const last = out.state.history[out.state.history.length - 1];
  ok("the record keeps that the wheels were on", last.assisted && last.assisted.wheels === 2 && out.weight === 0.75,
     JSON.stringify(last.assisted) + " w=" + out.weight);
  const round = Rating.load(() => JSON.stringify(out.state));
  ok("…and survives being read back", round.history[round.history.length - 1].assisted.wheels === 2);
  const plainHelp = Rating.update(Rating.load(() => null), { level: Rating.LEVELS[0].id, result: 1, at: Date.now(), assisted: { takebacks: 1, hints: 0 } });
  ok("a game without them is recorded exactly as before",
     JSON.stringify(plainHelp.state.history[0].assisted) === '{"takebacks":1,"hints":0}');
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe lamp tells the truth, asks when it should, and the wheels see what is really in danger");
process.exit(failed ? 1 : 0);
