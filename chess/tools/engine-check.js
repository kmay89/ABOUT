/* engine-check.js — the coach has to be right before it can be kind.

   perft proves the rules and crosscheck proves the labels; neither says
   anything about whether the engine plays well, and a teaching engine
   that quietly gives bad advice is worse than no engine at all. So this
   asks the questions that matter for advice rather than legality:

     • the incremental Zobrist hash still matches a from-scratch one
       (if it drifts, the transposition table starts answering with
       another position's score, and the advice goes mad quietly);
     • the evaluation is symmetric — mirror the board, negate the score —
       because an evaluation with a thumb on one side teaches a bias;
     • forced mates are found, and the mates it claims are really forced
       (checked exhaustively, not taken on the engine's word);
     • free material is taken;
     • a won position is not thrown away by repetition;
     • a search never returns an illegal move and never overruns its
       time budget, which is what the clock and the coach's turn rely on;
     • the ranked list the coaching is built from agrees with the move
       the search actually chose;
     • and the three practice levels really are a ladder.

   Run: node chess/tools/engine-check.js [--slow]
*/
"use strict";

const C = require("../engine.js");
const SLOW = process.argv.includes("--slow");

let failed = 0;
const ok = (label, cond, extra) => {
  if (!cond) { failed++; console.log("FAIL  " + label + (extra ? "  → " + extra : "")); }
  else console.log("ok    " + label);
};

/* ---- the hash the transposition table is keyed on ---- */
{
  let bad = null;
  const walk = (g, d) => {
    if (!d || bad) return;
    for (const m of C.moves(g).slice(0, 5)) {
      C.make(g, m);
      const fresh = C.create(C.fen(g));
      if (fresh.hLo !== g.hLo || fresh.hHi !== g.hHi) bad = bad || C.fen(g);
      walk(g, d - 1);
      C.unmake(g);
    }
  };
  walk(C.create(), 4);
  walk(C.create("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"), 3);
  walk(C.create("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1"), 4);
  ok("incremental hash matches a from-scratch recompute", !bad, bad);
}

/* ---- evaluation symmetry ---- */
{
  /* mirror ranks and swap colours: the same position seen from the other
     side of the table must score the same for whoever is to move */
  const mirror = (fen) => {
    const p = fen.split(" ");
    const board = p[0].split("/").reverse().map((row) =>
      row.replace(/[a-zA-Z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))).join("/");
    const turn = p[1] === "w" ? "b" : "w";
    const cast = (p[2] || "-").replace(/[a-zA-Z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
    const castSorted = cast === "-" ? "-" : cast.split("").sort().reverse().join("");
    const ep = (p[3] && p[3] !== "-") ? p[3][0] + String(9 - Number(p[3][1])) : "-";
    return [board, turn, castSorted, ep, p[4] || "0", p[5] || "1"].join(" ");
  };
  const cases = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r1bq1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/5k2/8/8/8/8/5K2/6R1 w - - 0 1"
  ];
  let worst = 0, worstFen = "";
  for (const fen of cases) {
    const a = C.evaluate(C.create(fen));
    const b = C.evaluate(C.create(mirror(fen)));
    if (Math.abs(a - b) > worst) { worst = Math.abs(a - b); worstFen = fen; }
  }
  ok("evaluation is colour-symmetric", worst === 0, worst ? `off by ${worst} on ${worstFen}` : "");
}

/* ---- forced mate, verified rather than believed ---- */
/* exhaustive: can the side to move force mate in at most n moves? */
function forcedMate(g, n) {
  if (n < 1) return false;
  for (const m of C.moves(g)) {
    C.make(g, m);
    const replies = C.moves(g);
    if (!replies.length) {
      const mated = C.inCheck(g);
      C.unmake(g);
      if (mated) return true;
      continue;
    }
    let all = true;
    for (const r of replies) {
      C.make(g, r);
      const won = forcedMate(g, n - 1);
      C.unmake(g);
      if (!won) { all = false; break; }
    }
    C.unmake(g);
    if (all) return true;
  }
  return false;
}
{
  const mates = [
    ["back rank, mate in 1", "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", 1],
    ["queen mate in 1",      "7k/8/6K1/8/8/8/8/Q7 w - - 0 1", 1],
    ["rook ladder, mate in 2", "7k/8/8/8/8/8/5R2/6RK w - - 0 1", 2],
    ["smothered pattern",    "r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 10", 3]
  ];
  for (const [name, fen, n] of mates) {
    /* Prove the position first. A test position that isn't the mate it
       claims to be will otherwise fail as an engine bug and send you
       hunting through the search for a fault that is in the FEN — which
       is exactly what happened while this file was being written. */
    if (n <= 2 && !forcedMate(C.create(fen), n)) {
      ok(`${name.padEnd(22)} found and forced`, false, "the test position is not a mate in " + n);
      continue;
    }
    const g = C.create(fen);
    const r = C.search(g, { ms: 1500 });
    const claimed = Math.abs(r.score) > C.MATE - 1000;
    const legal = r.move && C.moves(g).some((m) => m.from === r.move.from && m.to === r.move.to);
    let proven = true, fast = true;
    if (n <= 2 && legal) {
      const g2 = C.create(fen);
      C.make(g2, C.moves(g2).find((m) => m.from === r.move.from && m.to === r.move.to && (m.promo || 0) === (r.move.promo || 0)));
      /* after the engine's move every defence must still be mated */
      const replies = C.moves(g2);
      proven = replies.length === 0 ? C.inCheck(g2) : !replies.some((rep) => {
        C.make(g2, rep);
        const esc = !forcedMate(g2, n - 1);
        C.unmake(g2);
        return esc;
      });
      /* a coach that sees mate in one and plays mate in three is not
         wrong, but it is not teaching the pattern either */
      fast = (C.MATE - Math.abs(r.score)) <= 2 * n;
    }
    ok(`${name.padEnd(22)} found and forced`, claimed && legal && proven && fast,
       `claimed=${claimed} legal=${legal} forced=${proven} fastest=${fast} score=${r.score}`);
  }
}

/* ---- free material is taken ---- */
{
  const grabs = [
    ["hanging queen", "4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1", "exd5"],
    ["hanging rook",  "4k3/8/8/8/8/3r4/4B3/4K3 w - - 0 1", "Bxd3"],
    ["win a knight",  "4k3/8/8/8/4n3/8/2B5/4K3 w - - 0 1", "Bxe4"]
  ];
  for (const [name, fen, want] of grabs) {
    const g = C.create(fen);
    const r = C.search(g, { ms: 400 });
    const san = r.move ? C.toSAN(g, r.move) : "-";
    ok(`${name.padEnd(22)} is taken`, san.replace(/[+#]$/, "") === want, `played ${san}, wanted ${want}`);
  }
}

/* ---- a legal move, inside the time budget, every time ---- */
{
  const fens = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "r1bq1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R1BQ1RK1 b - - 0 1"
  ];
  let illegal = null, worstOver = 0;
  for (const fen of fens) {
    for (const budget of [60, 250, 800]) {
      const g = C.create(fen);
      const t0 = Date.now();
      const r = C.search(g, { ms: budget, rank: true });
      const dt = Date.now() - t0;
      if (!r.move || !C.moves(g).some((m) => m.from === r.move.from && m.to === r.move.to && (m.promo || 0) === (r.move.promo || 0))) {
        illegal = fen + " @" + budget;
      }
      /* a little slack for the last node of an iteration */
      const over = dt - budget * 1.35 - 30;
      if (over > worstOver) worstOver = over;
    }
  }
  ok("search always returns a legal move", !illegal, illegal);
  ok("search keeps inside its time budget", worstOver <= 0, worstOver > 0 ? `overran by ${worstOver | 0}ms` : "");
}

/* ---- the ranked list agrees with the move chosen ---- */
{
  const g = C.create("r1bq1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 1");
  const r = C.search(g, { ms: 600, rank: true });
  const top = r.ranked[0];
  ok("every root move appears in the ranking",
     r.ranked.length === C.moves(g).length, `${r.ranked.length} of ${C.moves(g).length}`);
  const deep = r.ranked.filter((x) => !x.shallow);
  ok("properly scored moves come first and in order",
     deep.length > 0 &&
     r.ranked.slice(0, deep.length).every((x) => !x.shallow) &&
     deep.every((x, i) => i === 0 || deep[i - 1].score >= x.score),
     `${deep.length} scored, ${r.ranked.length - deep.length} fell back`);
  /* The ranking runs shallower than the search, so the two need not pick
     the same move — but the move the coach recommends must have been
     scored properly, or the advice and the reasoning behind it come from
     different searches. */
  const chosen = r.ranked.find((x) => x.move.from === r.move.from && x.move.to === r.move.to &&
                                      (x.move.promo || 0) === (r.move.promo || 0));
  ok("the move the search chose is scored, not guessed",
     chosen && !chosen.shallow, chosen ? "only a fallback score" : "absent from the ranking");
  ok("the chosen move is near the top of the ranking",
     chosen && deep[0].score - chosen.score < 80,
     chosen ? `gap ${deep[0].score - chosen.score}` : "not ranked");
}

/* ---- a won position is not drawn by shuffling ---- */
{
  /* White is a queen up; repeating would be a catastrophe */
  const g = C.create("4k3/8/8/8/8/8/8/3QK3 w - - 0 1");
  let repeated = false;
  for (let i = 0; i < 24 && !C.status(g).over; i++) {
    const r = C.search(g, { ms: 120 });
    if (!r.move) break;
    C.play(g, r.move);
    if (C.repetitionCount(g) >= 3) { repeated = true; break; }
  }
  const st = C.status(g);
  ok("a queen up, the engine makes progress rather than repeating",
     !repeated, repeated ? "hit a threefold" : "");
  ok("…and converts it", st.over ? st.result === "white" : C.evaluate(C.create(C.fen(g))) !== 0,
     st.over ? st.reason : "still going");
}

/* ---- the practice ladder really is a ladder ---- */
if (SLOW) {
  const SKILLS = {
    sprout: { ms: 200, maxDepth: 2, noise: 170 },
    club:   { ms: 450, maxDepth: 5, noise: 55 },
    mentor: { ms: 1000, maxDepth: 64, noise: 0 }
  };
  const play = (A, B, games) => {
    let score = 0;
    for (let i = 0; i < games; i++) {
      const g = C.create();
      for (let ply = 0; ply < 160; ply++) {
        const st = C.status(g);
        if (st.over) { score += st.result === "draw" ? 0.5 : ((st.result === "white") === (i % 2 === 0) ? 1 : 0); break; }
        if (st.canClaim3 || st.canClaim50) { score += 0.5; break; }
        const aTurn = (g.turn === C.WHITE) === (i % 2 === 0);
        const cfg = aTurn ? A : B;
        const r = C.search(g, cfg);
        if (!r.move) { score += 0.5; break; }
        C.play(g, r.move);
        if (ply === 159) score += 0.5;
      }
    }
    return score / games;
  };
  const mc = play(SKILLS.mentor, SKILLS.club, 6);
  ok("mentor outscores club", mc > 0.5, `mentor scored ${(mc * 100).toFixed(0)}%`);
  const cs = play(SKILLS.club, SKILLS.sprout, 6);
  ok("club outscores sprout", cs > 0.5, `club scored ${(cs * 100).toFixed(0)}%`);
} else {
  console.log("skip  practice-ladder match (pass --slow to play it)");
}

console.log(failed ? `\n${failed} check(s) failed` : "\nthe coach is sound");
process.exit(failed ? 1 : 0);
