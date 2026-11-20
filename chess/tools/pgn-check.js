/* pgn-check.js — dev-only. Does a game go out as PGN and come back the
   same game, and does a position come in only when it can stand?

   In node: real games (castling both ways, en passant, promotions to
   every piece, checks and mates) and three hundred seeded random ones go
   out through pgn.js's writer and back through its reader to the same
   moves and the same final position — from the usual start and from
   set-up positions with Black to move. The reader takes sloppy and
   hostile pastes the way a person would hand them over (lichess clocks
   in comments, side lines inside side lines, NAGs and !?, "1...", "0-0",
   "e8Q", "exd6 e.p.", CRLF, several games at once) and stops at the
   first move that is not legal, saying which and why; ten thousand
   bytes of noise never throw. The FEN validator turns away what the
   engine's own loader would happily build (no king, a pawn on the back
   rank, the side not to move in check, thirty-three men) and tidies
   castling and en-passant fields that don't match the board. The
   journal's and the game link's PGN are written by the same writer.

   Then in a real browser, on a phone and on a laptop: paste a PGN into
   the lobby's card and step through it; copy its PGN and FEN out and read
   them back; paste a FEN and play on against the coach, unrated; reload,
   and it is still that position and still unrated; take a move back and
   look back through it; mate from a set-up position and the end card
   says it wasn't rated; a #fen= and a #pgn= link are offered, not
   opened.

   Run: node chess/tools/pgn-check.js [--phone|--desk] [--node]       */
"use strict";
/* the end card is told over as beats first (app.js beatsStart); a player
   taps Skip to reach the card, so the check does too */
const skipBeats = async (p) => {
  if (await p.evaluate(() => !!(window.__cr && __cr.beatState && __cr.beatState().on))) { await p.click("#btSkip"); await p.waitForTimeout(350); }
};
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
const Pgn = require("../pgn.js");
const Chess = require("../engine.js");
const Games = require("../games.js");
const Share = require("../share.js");
const Rating = require("../rating.js");
let failed = 0, passed = 0;
const ok = (what, cond, detail) => {
  if (cond) { passed++; console.log("ok    " + what); }
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

/* ---------- fixtures ---------- */
/* Morphy, the opera box, 1858: long castling, a sacrifice, a mate */
const OPERA = "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 " +
  "10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0";
/* an en passant, short castling both sides */
const EP = "1. e4 e6 2. e5 d5 3. exd6 cxd6 4. Nf3 Nf6 5. Be2 Be7 6. O-O O-O 7. d4 b6 *";
/* promotions to all four pieces, from a set-up position */
const PROMO_FEN = "8/PPPP3k/8/8/8/8/5K2/8 w - - 0 60";
const PROMO = ["a8=Q", "Kg6", "b8=R", "Kf5", "c8=B", "Ke5", "d8=N", "Kd4"];
function plies(text) { const r = Pgn.read(text, Chess); return r.sans; }
function replay(sans, fen) {
  const g = Chess.create(fen);
  for (const s of sans) { const m = Chess.fromSAN(g, s); if (!m) return null; Chess.play(g, m); }
  return g;
}
/* a seeded stream, so a failure is the same failure twice */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }; }
function randomGame(seed, fen, max) {
  const r = rng(seed), g = Chess.create(fen);
  for (let n = 0; n < max; n++) {
    const ms = Chess.moves(g);
    if (!ms.length || Chess.status(g).over) break;
    /* lean towards captures and promotions so the odd moves turn up */
    const spicy = ms.filter((m) => m.promo || m.capt || (m.flags & (Chess.F_EP | Chess.F_CASTLE)));
    const pool = spicy.length && r() < 0.45 ? spicy : ms;
    Chess.play(g, pool[Math.floor(r() * pool.length)]);
  }
  return g;
}

function nodeHalf() {
  /* ---- the writer ---- */
  const opera = Pgn.read(OPERA, Chess);
  ok("the Opera game reads: 33 plies, O-O-O and a mate", opera.ok && opera.plies === 33 && opera.sans.includes("O-O-O") &&
     opera.sans[32] === "Rd8#" && opera.result === "1-0" && opera.reason === "checkmate", JSON.stringify(opera.error));
  const out = Pgn.write({ headers: [["White", "Paul Morphy"], ["Black", "Duke & Count"], ["Event", "Paris \"opera\""], ["ECO", "C41"]],
    sans: opera.sans, result: "1-0" });
  const tagNames = out.split("\n\n")[0].split("\n").map((l) => l.slice(1, l.indexOf(" ")));
  ok("the seven-tag roster comes first, in its order", tagNames.slice(0, 7).join(" ") === "Event Site Date Round White Black Result" &&
     tagNames[7] === "ECO", tagNames.join(" "));
  ok("…with the standard's '?' where nothing is known", /\[Site "\?"\]/.test(out) && /\[Date "\?\?\?\?\.\?\?\.\?\?"\]/.test(out));
  ok("…and quotes escaped in a tag", /\[Event "Paris \\"opera\\""\]/.test(out), out.split("\n")[0]);
  const body = out.split("\n\n")[1];
  ok("movetext lines stay under 80 columns", body.split("\n").every((l) => l.length <= 79) && body.split("\n").length > 1);
  ok("…and end with the result", /17\. Rd8# 1-0\n$/.test(body), body.slice(-20));
  ok("no [SetUp] for a game from the usual start", !/SetUp|FEN/.test(out));
  const back = Pgn.read(out, Chess);
  ok("written and read back: the same moves, names and result", back.ok && back.sans.join(" ") === opera.sans.join(" ") &&
     back.white === "Paul Morphy" && back.black === "Duke & Count" && back.result === "1-0");

  const ep = Pgn.read(EP, Chess);
  ok("en passant and short castling both ways read", ep.ok && ep.sans[4] === "exd6" && ep.sans.filter((s) => s === "O-O").length === 2 && ep.result === "*");
  const pg = replay(PROMO, PROMO_FEN);
  ok("the promotion fixture is legal", !!pg);
  const pw = Pgn.write({ sans: pg.played.map((r) => r.san), fen: PROMO_FEN, result: "*" });
  ok("a set-up game writes [SetUp \"1\"] and its [FEN] after the roster",
     /\[Result "\*"\]\n\[SetUp "1"\]\n\[FEN "8\/PPPP3k\/8\/8\/8\/8\/5K2\/8 w - - 0 60"\]/.test(pw), pw);
  ok("…numbering its moves from the position's own move number", /^60\. a8=Q Kg6 61\. b8=R/m.test(pw.split("\n\n")[1]));
  const pb = Pgn.read(pw, Chess);
  ok("…and reads back from that position, all four promotions", pb.ok && pb.fen === PROMO_FEN &&
     ["a8=Q", "b8=R", "c8=B", "d8=N"].every((s) => pb.sans.includes(s)), JSON.stringify(pb.sans));
  const bf = "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 4 31";
  const bw = Pgn.write({ sans: ["O-O-O", "O-O"], fen: bf, result: "*" });
  ok("Black to move first is written '31...'", /^31\.\.\. O-O-O 32\. O-O \*$/m.test(bw), bw.split("\n\n")[1]);
  const bb = Pgn.read(bw, Chess);
  ok("…and read back the same", bb.ok && bb.sans.join(" ") === "O-O-O O-O" && bb.fen === bf);

  /* three hundred random games, two kinds of start */
  let same = 0, seen = { castle: 0, ep: 0, under: 0, mate: 0, check: 0 };
  const STARTS = [undefined, "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 5 4",
                  "4k3/1P6/8/3pP3/8/8/6p1/R3K2R w KQ d6 0 40"];
  for (let i = 0; i < 300; i++) {
    const fen = STARTS[i % 3], g = randomGame(1000 + i, fen, 40 + (i % 160));
    const sans = g.played.map((r) => r.san);
    g.played.forEach((r) => {
      if (r.m.flags & Chess.F_CASTLE) seen.castle++;
      if (r.m.flags & Chess.F_EP) seen.ep++;
      if (r.m.promo && Math.abs(r.m.promo) !== Chess.Q) seen.under++;
      if (/#$/.test(r.san)) seen.mate++;
      if (/\+$/.test(r.san)) seen.check++;
    });
    const st = Chess.status(g);
    const res = st.over ? (st.result === "white" ? "1-0" : st.result === "black" ? "0-1" : "1/2-1/2") : "*";
    const txt = Pgn.write({ headers: [["White", "A"], ["Black", "B"]], sans, fen, result: res });
    const r = Pgn.read(txt, Chess);
    if (r.ok && r.sans.join(" ") === sans.join(" ") && r.result === res &&
        Chess.fen(replay(r.sans, r.fen || undefined)) === Chess.fen(g) &&
        txt.split("\n").every((l) => l.length <= 79)) same++;
  }
  ok("300 seeded games go out and come back move for move, to the same final position", same === 300, same + " of 300");
  ok("…and between them they castle, take en passant, under-promote, check and mate",
     seen.castle > 10 && seen.ep > 3 && seen.under > 3 && seen.mate > 3 && seen.check > 50, JSON.stringify(seen));

  /* ---- the reader takes what people paste ---- */
  const LICHESS = `[Event "Rated Blitz game"]\r\n[Site "https://lichess.org/abcdefgh"]\r\n[Date "2024.03.09"]\r\n[White "anna_k"]\r\n[Black "Sam1987"]\r\n[Result "0-1"]\r\n[WhiteElo "1612"]\r\n[BlackElo "1650"]\r\n[TimeControl "180+2"]\r\n[Termination "Normal"]\r\n\r\n` +
    `1. e4 { [%clk 0:03:00] } 1... e5 { [%clk 0:03:00] } 2. Nf3 $1 { [%eval 0.3] } (2. f4 exf4 (2... d5!? 3. exd5) 3. Nf3) 2... Nc6 3. Bc4 Nf6?! 4. Ng5 d5 5. exd5 Na5 6. Bb5+ c6 7. dxc6 bxc6 8. Be2 h6 9. Nf3 e4 10. Ne5 Bd6 11. d4 exd3 12. Nxd3 Qc7 13. h3 0-0 14. 0-0 c5 ; the game goes on\r\n15. Nc3 Bb7 16. Bf3 Rad8 17. Bxb7 Nxb7 18. Qf3 Nd5 19. Nxd5 0-1\r\n`;
  const li = Pgn.read(LICHESS, Chess);
  ok("a lichess export: CRLF, clocks in comments, nested side lines, NAGs, '1...', 0-0", li.ok && li.plies === 37 && !li.error &&
     li.white === "anna_k" && li.black === "Sam1987" && li.result === "0-1" && li.sans.includes("O-O"), JSON.stringify(li.error) + " " + li.plies);
  ok("…its summary says what it is", Pgn.summary(li) === "19 moves · White: anna_k · Black: Sam1987 · 0–1.", Pgn.summary(li));
  const CHESSCOM = `[Event "Live Chess"]\n[Site "Chess.com"]\n[White "bob"]\n[Black "ann"]\n[Result "1/2-1/2"]\n[ECO "C00"]\n\n1.e4 e6 2.d4 d5 3.e5 c5 4.c3 Nc6 5.Nf3 Qb6 1/2-1/2`;
  const cc = Pgn.read(CHESSCOM, Chess);
  ok("a chess.com export: numbers glued to the moves", cc.ok && cc.plies === 10 && cc.result === "1/2-1/2" && !cc.error);
  ok("sloppy hand-typed notation: e8Q, Nd1e3, exd6 e.p., × and 0-0-0", (() => {
    const a = Pgn.read('[FEN "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"]\na8Q+ Kd7', Chess);
    const b = Pgn.read("1. e4 e6 2. e5 d5 3. exd6 e.p. cxd6", Chess);
    const c = Pgn.read("1. e4 e6 2. e5 d5 3. exd6e.p. Bxd6 4. Ng1f3 b5 5. Bf1×b5 c6", Chess);
    const d = Pgn.read("1. d4 d5 2. Nc3 Nc6 3. Bf4 Bf5 4. Qd2 Qd7 5. 0-0-0 0-0-0", Chess);
    const e = Pgn.read('[FEN "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"]\n1. a8N Kd7', Chess);
    return a.ok && a.sans[0] === "a8=Q+" && b.ok && b.sans[4] === "exd6" && c.ok && !c.error && c.sans.join(" ") === "e4 e6 e5 d5 exd6 Bxd6 Nf3 b5 Bxb5+ c6" &&
      d.ok && d.sans.slice(-2).join(" ") === "O-O-O O-O-O" && e.ok && e.sans[0] === "a8=N";
  })());
  const noRes = Pgn.read("1. e4 e5 2. Nf3", Chess);
  ok("no result and no tags: still a game, with no result", noRes.ok && noRes.plies === 3 && noRes.result === "*");
  const two = Pgn.read(OPERA + "\n\n[Event \"Another\"]\n[White \"x\"]\n\n1. d4 d5 *\n\n[Event \"Third\"]\n\n1. c4 *", Chess);
  ok("several games in one paste: the first, and a note saying so", two.ok && two.plies === 33 && two.games === 3 &&
     /holds 3 games; this is the first/.test(Pgn.summary(two)), Pgn.summary(two));
  const bad = Pgn.read("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. Qxf7 Nf6", Chess);
  ok("an illegal move stops the reading, keeping what came before", bad.ok && bad.plies === 6 && bad.error && bad.error.ply === 6 && bad.result === "*");
  ok("…and says which move and why", bad.error.at === "4. Qxf7" && /no White queen can play that here/.test(Pgn.summary(bad)), Pgn.summary(bad));
  const amb = Pgn.read("1. Nf3 Nf6 2. d3 d6 3. Nd2", Chess);
  ok("an ambiguous move is named as one", amb.error && amb.error.at === "3. Nd2" && /more than one knight/.test(amb.error.why), JSON.stringify(amb.error));
  const inchk = Pgn.read("1. e4 e5 2. Qh5 Nc6 3. Qxf7+ Nf6", Chess);
  ok("a move that ignores check says so", inchk.error && /Black is in check/.test(inchk.error.why), JSON.stringify(inchk.error));
  const noPromo = Pgn.read('[FEN "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"]\n1. a8', Chess);
  ok("a promotion that doesn't say what it becomes is refused, not guessed", noPromo.error && /has to say what it becomes/.test(noPromo.error.why));
  const nul = Pgn.read("1. e4 -- 2. d4", Chess);
  ok("a null move stops it", nul.error && nul.error.ply === 1 && /null move/.test(nul.error.why));
  const over = Pgn.read("1. f3 e5 2. g4 Qh4# 3. e4", Chess);
  ok("a move after mate is refused as after the game", over.plies === 4 && /already over/.test(over.error.why) && over.result === "*");
  const liar = Pgn.read('[Result "1-0"]\n1. f3 e5 2. g4 Qh4# 1-0', Chess);
  ok("the board outranks the label", liar.result === "0-1" && /board says 0-1/.test(Pgn.summary(liar)), Pgn.summary(liar));
  const evil = Pgn.read('[White "<img src=x onerror=alert(1)>\u0007Mallory"]\n1. e4 *', Chess);
  ok("a tag keeps no control characters (markup is the page's to escape)", evil.ok && !/[\u0000-\u001f]/.test(evil.white));
  ok("plain prose is not a game", !Pgn.read("hello, how are you?", Chess).ok && !Pgn.read("", Chess).ok && !Pgn.read(null, Chess).ok);
  ok("tags with no moves are not a game", !Pgn.read('[Event "x"]\n[White "y"]\n*', Chess).ok);
  let threw = 0;
  const r = rng(7);
  for (let k = 0; k < 40; k++) {
    let s = "";
    const alpha = "[]{}()\";.-0123456789 abcdefghKQRBNOx=+#!?$*/\n\t½é€�";
    for (let j = 0; j < 250; j++) s += alpha[Math.floor(r() * alpha.length)];
    try { Pgn.read(s, Chess); Pgn.read("1. e4 " + s, Chess); Pgn.validFen(s, Chess); } catch (e) { threw++; }
  }
  try { Pgn.read("{" + "(".repeat(5000), Chess); Pgn.read("1. " + "e4 e5 ".repeat(1000), Chess); Pgn.read("x".repeat(400000), Chess); } catch (e) { threw++; }
  ok("20 000 bytes of noise, a comment that never closes and a 2000-ply paste never throw", threw === 0);
  const longOne = Pgn.read("1. " + "Nf3 Nf6 Ng1 Ng8 ".repeat(200), Chess);
  ok("…and a repetition-drawn shuffle stops where the board calls it drawn", longOne.ok && longOne.plies === 16 && /already over/.test(longOne.error.why), longOne.plies + " " + JSON.stringify(longOne.error));

  /* ---- positions ---- */
  const GOOD = [
    Pgn.START,
    "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    "8/8/8/4k3/8/8/4K3/8 b - - 0 70",
    "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3",
    "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "4k3/8/8/8/8/8/8/4K2R w K - 0 1",
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "2kr3r/ppp2ppp/8/8/8/8/PPP2PPP/2KR3R b - - 3 15",
    "7k/8/8/8/8/8/8/K6Q b - - 0 1"
  ];
  const goodOk = GOOD.map((f) => Pgn.validFen(f, Chess)).filter((v) => v.ok).length;
  ok("good positions stand: the start and ten more", goodOk === GOOD.length, goodOk + " of " + GOOD.length);
  const BAD = {
    "no kings": "8/8/8/8/8/8/8/8 w - - 0 1",
    "a missing black king": "8/8/8/8/8/8/8/4K3 w - - 0 1",
    "two white kings": "4k3/8/8/8/8/8/8/3KK3 w - - 0 1",
    "a pawn on the eighth rank": "P3k3/8/8/8/8/8/8/4K3 w - - 0 1",
    "a pawn on the first rank": "4k3/8/8/8/8/8/8/p3K3 w - - 0 1",
    "the side not to move in check": "4k3/8/8/8/8/8/8/4K2r b - - 0 1",
    "33 men": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".replace("8/8/8/8", "8/8/8/7N"),
    "nine pawns": "4k3/8/8/8/8/P7/PPPPPPPP/4K3 w - - 0 1",
    "seven ranks": "4k3/8/8/8/8/8/4K3 w - - 0 1",
    "a rank of nine squares": "4k4/8/8/8/8/8/8/4K3 w - - 0 1",
    "a strange letter": "4k3/8/8/8/8/8/8/4K2X w - - 0 1",
    "a side to move of x": "4k3/8/8/8/8/8/8/4K3 x - - 0 1",
    "castling letters that aren't": "4k3/8/8/8/8/8/8/4K3 w KX - 0 1",
    "an en-passant square on rank 5": "4k3/8/8/8/8/8/8/4K3 w - e5 0 1",
    "counters that aren't numbers": "4k3/8/8/8/8/8/8/4K3 w - - x 1",
    "seven parts": "4k3/8/8/8/8/8/8/4K3 w - - 0 1 1"
  };
  Object.keys(BAD).forEach((k) => {
    const v = Pgn.validFen(BAD[k], Chess);
    ok("refused: " + k + " — " + (v.why || "(accepted!)"), !v.ok && !!v.why);
  });
  ok("…while the engine's own loader builds a board with no kings (why this check exists)", (() => { try { Chess.create("8/8/8/8/8/8/8/8 w - - 0 1"); return true; } catch (e) { return false; } })());
  const cast = Pgn.validFen("4k2r/8/8/8/8/8/8/R3K3 w KQkq - 0 1", Chess);
  ok("castling rights the board can't have are dropped, with a note", cast.ok && cast.fen === "4k2r/8/8/8/8/8/8/R3K3 w Qk - 0 1" && cast.notes.length === 2, JSON.stringify(cast));
  const epBad = Pgn.validFen("4k3/8/8/8/4P3/8/8/4K3 w - e6 0 1", Chess);
  ok("an en-passant square no pawn just made is dropped, with a note", epBad.ok && / - - 0 1$/.test(epBad.fen) && /en-passant/.test(epBad.notes[0]));
  const bare = Pgn.validFen("4k3/8/8/8/8/8/8/4K3", Chess);
  ok("a bare board is White to move, and says so", bare.ok && bare.fen === "4k3/8/8/8/8/8/8/4K3 w - - 0 1" && bare.notes.length === 1);
  const under = Pgn.read("4k3/8/8/8/8/8/8/R3K3_b_Q_-_0_1", Chess);
  ok("a FEN pasted with lichess's underscores is a position, Black to move", under.ok && under.kind === "position" && under.turn === -1 &&
     Pgn.summary(under) === "A position, Black to move · 3 men.", Pgn.summary(under));
  const pf = Pgn.read('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/4K2r b - - 0 1"]\n1... Rh2', Chess);
  ok("a PGN whose [FEN] can't stand is refused, and says why", !pf.ok && /starting position doesn't stand up: white is in check/.test(pf.error.why), pf.error && pf.error.why);
  const pos = Pgn.read('[SetUp "1"]\n[FEN "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"]\n\n*', Chess);
  ok("a PGN with a [FEN] and no moves is a position", pos.ok && pos.kind === "position" && pos.fen === "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1");
  ok("sniff tells a game from a position from neither", Pgn.sniff(Pgn.START) === "fen" && Pgn.sniff(OPERA) === "pgn" &&
     Pgn.sniff("e4 e5") === "pgn" && Pgn.sniff("good morning") === null);

  /* ---- one writer ---- */
  const e = Games.cleanEntry({ at: Date.UTC(2026, 10, 1, 12), mode: "coach", skill: "acorn", humanSide: 1, result: "white",
    reason: "checkmate", sans: opera.sans, marks: { 25: "??" }, clockStr: "none" });
  const gp = Games.pgn(e, Rating.LEVELS, "You");
  ok("the journal's PGN is written by pgn.js (marks on the moves) and reads back", gp === Pgn.write({ headers: gp.split("\n\n")[0].split("\n").map((l) => {
    const m = l.match(/^\[(\w+) "(.*)"\]$/); return [m[1], m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\")]; }), sans: opera.sans, marks: { 25: "??" }, result: "1-0" }) &&
     /13\. Rxd7 Rxd7\?\?/.test(gp) && Pgn.read(gp, Chess).plies === 33);
  const sp = Share.pgn({ sans: ["Kd7"], white: "A", black: "B", result: null, fen: "4k3/8/8/8/8/8/8/4K2Q b - - 0 50", day: "2026-11-01" });
  ok("the game link's PGN is written by pgn.js, and carries a set-up start", /\[SetUp "1"\]/.test(sp) && /50\.\.\. Kd7 \*/.test(sp), sp);
}

/* ---------- the browser half ---------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;

const PLAY = `([san, src]) => {
  const g = __cr.game;
  const mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, '') === san.replace(/[+#]$/, ''));
  if (!mv) return false;
  __cr.commitMove(mv, src || 'local');
  return true;
}`;
const SIZES = [
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true },
  { name: "desk", viewport: { width: 1280, height: 820 }, touch: false }
].filter((s) => !process.argv.includes(s.name === "phone" ? "--desk" : "--phone"));

async function browserHalf() {
  if (process.argv.includes("--node")) return;
  if (!CHROME) { console.log("--    no chromium on this machine — the browser half is skipped"); return; }
  let pw;
  try { pw = require("playwright-core"); }
  catch (e) { console.log("--    playwright-core is not installed — the browser half is skipped"); return; }

  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
    ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css" };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

  const opera = Pgn.read(OPERA, Chess);
  for (const size of SIZES) {
    const T = (s) => size.name + ": " + s;
    const ctx = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, isMobile: size.touch });
    await ctx.addInitScript(() => {
      try { if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify({ use3d: false, name: "Ana" })); } catch (e) {}
      /* the clipboard is the way out; here it is a pocket the check can look in */
      window.__copied = [];
      try {
        Object.defineProperty(navigator, "clipboard", { configurable: true,
          value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); }, readText: () => Promise.resolve(window.__clip || "") } });
      } catch (e) {}
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(size.name + ": " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push(size.name + ": " + m.text()); });
    const play = (san, src) => page.evaluate(([f, a]) => eval(f)(a), [PLAY, [san, src]]);
    const settle = () => page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 6000 }).catch(() => {});
    let visit = 0;
    const open = async (hash) => {
      await page.goto(base + "/chess/?v=" + (++visit) + (hash || ""), { waitUntil: "load" });
      await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 30000 });
      await page.waitForTimeout(200);
    };
    const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById("toast").innerText) &&
      document.getElementById("toast").classList.contains("show"), re.source, { timeout: 12000 }).then(() => true, () => false);
    const tapToast = (label) => page.evaluate((l) => {
      const b = [...document.querySelectorAll("#toast .tact")].find((x) => x.textContent === l);
      if (b) b.click(); return !!b;
    }, label);
    const barChip = (re) => page.evaluate((src) => {
      const b = [...document.querySelectorAll("#lessonBar .lchip")].find((x) => new RegExp(src).test(x.textContent));
      if (b) b.click(); return !!b;
    }, re.source);
    const askTap = async (re) => {
      await page.waitForSelector("#ovAsk:not(.hide)", { timeout: 4000 }).catch(() => {});
      return page.evaluate((src) => {
        const b = [...document.querySelectorAll("#askRow button")].find((x) => new RegExp(src).test(x.textContent));
        if (b) b.click(); return !!b;
      }, re.source);
    };
    const lastCopied = () => page.evaluate(() => window.__copied.slice(-1)[0] || "");
    const typeIn = async (text) => {
      await page.fill("#notationIn", text);
      await page.waitForTimeout(350);
      return page.evaluate(() => ({ says: document.getElementById("notationSays").textContent,
        go: !document.getElementById("notationGo").disabled, tx: document.getElementById("notationGoTx").textContent }));
    };

    try {
      await open();
      ok(T("the lobby offers 'Open a game or position'"), await page.isVisible("#mNotation"));
      await page.click("#mNotation");
      ok(T("…which opens the card"), await page.isVisible("#ovNotation") && !(await page.isVisible("#ovMenu")));
      let rd = await typeIn("hello there");
      ok(T("prose is told plainly it isn't a game, and nothing opens"), !rd.go && /doesn't look like a game/.test(rd.says), JSON.stringify(rd));

      /* ---- a game, pasted ---- */
      const li = `[Event "Club night"]\n[White "Ana"]\n[Black "Sam"]\n[Date "2025.02.03"]\n\n1. e4 {good} e5 2. Nf3 (2. f4) Nc6 3. Bc4 Nf6?! 4. Ng5 d5 5. exd5 Na5 6. Bb5+ c6 7. dxc6 bxc6 8. Qf3 cxb5 9. Qxa8 1-0`;
      await page.evaluate((t) => { window.__clip = t; }, li);
      await page.click("#notationPaste");
      await page.waitForTimeout(350);
      rd = await page.evaluate(() => ({ says: document.getElementById("notationSays").textContent,
        go: !document.getElementById("notationGo").disabled, tx: document.getElementById("notationGoTx").textContent }));
      ok(T("Paste reads it and says what it is before anything opens"), rd.go && rd.says === "9 moves · White: Ana · Black: Sam · 1–0." &&
         rd.tx === "Step through it", JSON.stringify(rd));
      await page.click("#notationGo");
      await page.waitForFunction(() => __cr.mode === "review", null, { timeout: 8000 }).catch(() => {});
      let v = await page.evaluate(() => ({ mode: __cr.mode, n: __cr.game.played.length, ply: __cr.viewPly, card: !document.getElementById("ovNotation").classList.contains("hide"),
        bar: document.getElementById("lessonBar").innerText, cells: document.querySelectorAll("#moveList .m").length, fen: __cr.startFenForTest() }));
      ok(T("it opens in the sent-game viewer, read-only, at the first move"), v.mode === "review" && v.n === 17 && v.ply === 0 && !v.card && v.fen === null, JSON.stringify(v).slice(0, 160));
      ok(T("…every move in the list"), v.cells === 17, v.cells);
      ok(T("…with the names and the result in the bar"), /Ana vs Sam · 1–0/i.test(v.bar) && /📋/.test(v.bar), v.bar);
      await barChip(/^▶$/); await settle();
      await barChip(/^▶$/); await settle();
      ok(T("▶ steps through it"), (await page.evaluate(() => __cr.viewPly)) === 2);
      await barChip(/PGN · FEN/);
      ok(T("PGN · FEN asks which"), await askTap(/Copy FEN/));
      await page.waitForTimeout(150);
      const fenOut = await lastCopied();
      const ref = replay(opera.sans.slice(0, 0), undefined);
      ["e4", "e5", "Nf3"].forEach((s) => Chess.play(ref, Chess.fromSAN(ref, s)));
      ok(T("Copy FEN is the position on the board, three plies in"), fenOut === Chess.fen(ref), fenOut);
      await barChip(/PGN · FEN/); await askTap(/Copy PGN/); await page.waitForTimeout(150);
      const pgnOut = await lastCopied();
      const pr = Pgn.read(pgnOut, Chess);
      ok(T("Copy PGN is the whole game, its tags kept, and reads back the same"), pr.ok && pr.plies === 17 && pr.white === "Ana" &&
         /\[Event "Club night"\]/.test(pgnOut) && /\[Date "2025\.02\.03"\]/.test(pgnOut) && pr.result === "1-0" &&
         pr.sans.join(" ") === Pgn.read(li, Chess).sans.join(" "), pgnOut.slice(0, 200));
      await barChip(/^Done$/);
      ok(T("Done goes back to the room"), await page.isVisible("#ovMenu") && (await page.evaluate(() => __cr.mode)) === null);

      /* ---- an illegal move: what came before, and which move ---- */
      await page.click("#mNotation");
      rd = await typeIn("1. e4 e5 2. Ke3 Nc6");
      ok(T("an illegal move is named before anything opens"), rd.go && /It stops at 2\. Ke3: no White king can play that here/.test(rd.says), rd.says);
      await page.click("#notationBack");
      ok(T("Back goes to the lobby"), await page.isVisible("#ovMenu") && !(await page.isVisible("#ovNotation")));

      /* ---- a position, played on against the coach ---- */
      const FEN = "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 5 4";
      const ratingBefore = await page.evaluate(() => localStorage.getItem("chessroom_rating"));
      const gamesBefore = await page.evaluate(() => __cr.gamesForTest().list.length);
      await page.click("#mNotation");
      rd = await typeIn(FEN);
      ok(T("a FEN reads as a position, Black to move"), rd.go && /^A position, Black to move · 32 men\./.test(rd.says) && rd.tx === "Look at it", JSON.stringify(rd));
      await page.keyboard.press("Escape");
      ok(T("Escape backs out of the card, even from inside the box"), await page.isVisible("#ovMenu") && !(await page.isVisible("#ovNotation")));
      await page.click("#mNotation");
      await typeIn(FEN);
      await page.click("#notationGo");
      await page.waitForFunction(() => __cr.mode === "review", null, { timeout: 8000 }).catch(() => {});
      v = await page.evaluate(() => ({ mode: __cr.mode, n: __cr.game.played.length, fen: Chess.fen(__cr.game), o: __cr.renderer.orientation,
        bar: document.getElementById("lessonBar").innerText }));
      ok(T("it stands on the board, seen from the side to move"), v.mode === "review" && v.n === 0 && v.fen === FEN && v.o === -1, JSON.stringify(v).slice(0, 200));
      ok(T("…and the bar says so, and offers to play from here"), /A position · Black to move/i.test(v.bar) && /Play from here/.test(v.bar), v.bar);
      await barChip(/Play from here/);
      ok(T("Play from here asks against whom"), await askTap(/Against the coach/));
      await page.waitForTimeout(300);
      let c = await page.evaluate(() => ({ mode: __cr.mode, fen: Chess.fen(__cr.game), start: __cr.startFenForTest(), rd: __cr.ratedDoneForTest(),
        save: JSON.parse(localStorage.chessroom_save || "{}"), first: (document.querySelector("#moveList .mrow .n") || {}).textContent }));
      ok(T("a coach game from that position, you to move as Black"), c.mode === "coach" && c.fen === FEN && c.start === FEN && c.save.humanSide === -1, JSON.stringify(c).slice(0, 200));
      ok(T("…friendly: never rated, and saved that way, with its position"), c.rd === true && c.save.fr === 1 && c.save.fen === FEN, JSON.stringify(c.save).slice(0, 200));
      await play("O-O");
      await page.waitForFunction(() => __cr.game.played.length >= 2, null, { timeout: 20000 }).catch(() => {});
      await settle();
      c = await page.evaluate(() => ({ n: __cr.game.played.length, row: [...document.querySelectorAll("#moveList .mrow")][0].innerText.replace(/\s+/g, " ").trim(),
        save: JSON.parse(localStorage.chessroom_save || "{}"), fen: Chess.fen(__cr.game) }));
      ok(T("the coach answers, and the list numbers from move 4, Black first"), c.n === 2 && /^4\. O-O$/.test(c.row) && c.save.sans.length === 2, JSON.stringify(c));
      const afterTwo = c.fen;

      /* reload: still that position, still unrated */
      await open();
      ok(T("after a reload the lobby offers the game back"), await page.isVisible("#mResume"));
      await page.click("#mResume");
      await page.waitForTimeout(600);
      c = await page.evaluate(() => ({ mode: __cr.mode, fen: Chess.fen(__cr.game), start: __cr.startFenForTest(), rd: __cr.ratedDoneForTest(),
        sans: __cr.game.played.map((r) => r.san) }));
      ok(T("…the same position, from the same start"), c.mode === "coach" && c.fen === afterTwo && c.start === FEN && c.sans[0] === "O-O", JSON.stringify(c).slice(0, 200));
      ok(T("…and still unrated"), c.rd === true);
      /* look back, then copy the FEN shown */
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(150);
      const back1 = await page.evaluate(() => ({ ply: __cr.viewPly, fen: __cr.notationFenText(), strip: document.getElementById("turnStrip").innerText,
        expect: __cr.game.played[0].fen }));
      ok(T("looking back shows the position after Black's first move, numbered from 4"), back1.ply === 0 && back1.fen === back1.expect && /move 4/.test(back1.strip), JSON.stringify(back1));
      await page.evaluate(() => __cr.showMenu());
      const chip = await page.evaluate(() => [...document.querySelectorAll("#gameOps .chip")].some((b) => /PGN · FEN/.test(b.textContent)));
      ok(T("the lobby's game row offers PGN · FEN for the game in progress"), chip);
      await page.evaluate(() => [...document.querySelectorAll("#gameOps .chip")].find((b) => /PGN · FEN/.test(b.textContent)).click());
      await askTap(/Copy FEN/); await page.waitForTimeout(150);
      ok(T("…and its FEN is the position being looked at"), (await lastCopied()) === back1.expect);
      await page.evaluate(() => [...document.querySelectorAll("#gameOps .chip")].find((b) => /PGN · FEN/.test(b.textContent)).click());
      await askTap(/Copy PGN/); await page.waitForTimeout(150);
      const livePgn = await lastCopied(), lp = Pgn.read(livePgn, Chess);
      ok(T("…and its PGN carries the set-up start, and reads back to the same game"), lp.ok && lp.fen === FEN && lp.plies === 2 &&
         /\[SetUp "1"\]/.test(livePgn) && /4\.\.\. O-O/.test(livePgn) && /\[Black "Ana"\]/.test(livePgn), livePgn);
      await page.evaluate(() => { document.getElementById("mResume").click(); });
      await page.waitForTimeout(200);
      /* a take-back goes back to the set-up position, not the usual start */
      await page.evaluate(() => __cr.undoPlyForTest(2));
      await page.waitForTimeout(200);
      c = await page.evaluate(() => ({ n: __cr.game.played.length, fen: Chess.fen(__cr.game), save: JSON.parse(localStorage.chessroom_save || "{}") }));
      ok(T("a take-back returns to the set-up position, and the save keeps it"), c.n === 0 && c.fen === FEN && c.save.fen === FEN, JSON.stringify(c).slice(0, 160));

      /* ---- a mate from a set-up position: not rated, not kept ---- */
      await page.evaluate(() => __cr.showMenu());
      await page.click("#mNotation");
      await typeIn("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1");
      await page.click("#notationGo");
      await page.waitForFunction(() => __cr.mode === "review", null, { timeout: 8000 }).catch(() => {});
      await barChip(/Play from here/); await askTap(/Against the coach/);
      await page.waitForTimeout(300);
      await play("Ra8#");
      await page.waitForSelector("#ovEnd:not(.hide)", { timeout: 10000 }).catch(() => {});
      c = await page.evaluate(() => ({ end: !document.getElementById("ovEnd").classList.contains("hide"), sub: document.getElementById("endSub").textContent,
        rate: !document.getElementById("endRate").classList.contains("hide"), rating: localStorage.getItem("chessroom_rating"),
        games: __cr.gamesForTest().list.length }));
      ok(T("a mate from a set-up position ends the game"), c.end, JSON.stringify(c));
      ok(T("…and the card says it isn't rated or kept"), /isn't rated or kept in your journal/.test(c.sub) && !c.rate, c.sub);
      ok(T("…and nothing was: the rating and the journal are as they were"), c.rating === ratingBefore && c.games === gamesBefore, JSON.stringify([c.games, gamesBefore]));
      await skipBeats(page); await page.click("#endSend");
      await page.waitForTimeout(200);
      const sent = await lastCopied();
      ok(T("Send on that card copies the PGN, since a link can't carry the position"), /\[FEN "6k1\/5ppp\/8\/8\/8\/8\/5PPP\/R5K1 w - - 0 1"\]/.test(sent) &&
         /1\. Ra8# 1-0/.test(sent) && Pgn.read(sent, Chess).result === "1-0", sent.slice(-80));

      /* ---- links, offered ---- */
      await open("#fen=" + encodeURIComponent("4k3/8/8/8/8/8/8/R3K3 b Q - 0 1"));
      ok(T("a #fen= link is offered, not opened"), await toastHas(/A link with a position, Black to move\. Open it\?/) &&
         !(await page.isVisible("#ovNotation")) && (await page.evaluate(() => __cr.mode)) === null);
      ok(T("…and the address bar is tidied"), await page.evaluate(() => location.hash === ""));
      await tapToast("Open");
      await page.waitForTimeout(400);
      rd = await page.evaluate(() => ({ card: !document.getElementById("ovNotation").classList.contains("hide"), val: document.getElementById("notationIn").value,
        says: document.getElementById("notationSays").textContent }));
      ok(T("Open shows the card, filled in and read"), rd.card && rd.val === "4k3/8/8/8/8/8/8/R3K3 b Q - 0 1" && /Black to move/.test(rd.says), JSON.stringify(rd));
      await open("#pgn=" + encodeURIComponent("1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0"));
      ok(T("a #pgn= link is offered with its length"), await toastHas(/A link with a game, 4 moves\. Open it\?/));
      await open("#fen=" + encodeURIComponent("8/8/8/8/8/8/8/8 w - - 0 1"));
      ok(T("a #fen= link that can't stand is refused politely"), await toastHas(/doesn't read — White has no king/));

      ok(T("nothing shouted at the console"), errs.length === 0, errs.slice(0, 3).join(" | "));
    } catch (e) {
      failed++;
      console.log("FAIL  " + size.name + ": the check itself fell over  → " + (e && e.stack || e));
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
}

(async () => {
  nodeHalf();
  await browserHalf();
  console.log(failed ? "\n" + failed + " failed, " + passed + " passed"
                     : "\na game goes out and comes back the same game  ·  " + passed + " checks");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
