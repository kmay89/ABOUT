/* teach-check.js — the teaching eyes must actually see, and must not see things.
   Hand-built positions where the right answer is obvious to a human,
   checked against teach.js. If naming a pattern is going to be the
   app's main teaching device, the naming has to be right.
   Run: node chess/tools/teach-check.js */
"use strict";
const Chess = require("../engine.js");
const Teach = require("../teach.js");

let failed = 0;
function ok(label, cond, extra) {
  if (!cond) { failed++; console.log("FAIL  " + label + (extra ? "  → " + extra : "")); }
  else console.log("ok    " + label);
}
function G(fen) { return Chess.create(fen); }

/* ---- forks ---- */
{
  const g = G("r3k3/2N5/8/8/8/8/8/4K3 w - - 0 1");   // Nc7 hits Ra8 and Ke8
  const f = Teach.forks(g, Chess.WHITE);
  ok("knight fork of king and rook is seen", f.length === 1 && f[0].victims.length === 2);
  ok("fork is flagged as check", f.length === 1 && f[0].check === true);
  ok("safe fork is flagged safe", f.length === 1 && f[0].safe === true);
}
{
  const g = G("4k3/8/8/8/8/8/8/4K2R w - - 0 1");     // lone rook, nothing to fork
  ok("no fork claimed when there isn't one", Teach.forks(g, Chess.WHITE).length === 0);
}

/* ---- pins ---- */
{
  const g = G("4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1");  // Bb5 pins Nc6 to Ke8
  const L = Teach.lines(g, Chess.WHITE);
  ok("bishop pin against the king is seen", L.pins.length === 1);
  ok("pin against the king is absolute", L.pins.length === 1 && L.pins[0].absolute === true);
  ok("pinned piece identified as the knight",
     L.pins.length === 1 && Chess.sqName(L.pins[0].front) === "c6");
}
{
  const g = G("4k3/8/8/8/8/8/4r3/4K2R w - - 0 1");   // nothing behind the rook
  ok("no phantom pin", Teach.lines(g, Chess.WHITE).pins.length === 0);
}

/* ---- skewers ---- */
{
  const g = G("4q3/8/8/4k3/8/8/8/K3R3 b - - 0 1");   // Re1: king in front, queen behind
  const L = Teach.lines(g, Chess.WHITE);
  ok("skewer (king in front, queen behind) is seen", L.skewers.length === 1);
  ok("skewer is not miscalled a pin", L.pins.length === 0);
}

/* ---- hanging pieces ---- */
{
  const g = G("4k3/8/8/4n3/3P4/8/8/4K3 w - - 0 1");  // pawn d4 attacks undefended Ne5
  ok("undefended knight attacked by a pawn is loose", Teach.isLoose(g, Chess.sqIndex("e5")));
  const loose = Teach.looseFor(g, Chess.BLACK);
  ok("looseFor lists it", loose.length === 1 && Chess.sqName(loose[0].sq) === "e5");
}
{
  const g = G("4k3/8/5p2/4n3/3P4/8/8/4K3 w - - 0 1"); // now the knight is defended by f6
  ok("defended knight attacked by an equal-or-cheaper... pawn still loses material",
     Teach.isLoose(g, Chess.sqIndex("e5")) === true);   // pawn (100) < knight (320): still winning
}
{
  const g = G("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
  ok("bare kings hang nothing", Teach.looseFor(g, Chess.BLACK).length === 0);
}

/* ---- back rank ---- */
{
  const g = G("r6k/6pp/8/8/8/8/5PPP/6K1 w - - 0 1");
  ok("sealed white king on the back rank is flagged", !!Teach.backRank(g, Chess.WHITE));
  ok("black king with luft is not flagged", !Teach.backRank(g, Chess.BLACK));
}
{
  const g = G("6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1"); // no heavy pieces left
  ok("no back-rank scare without a rook or queen", !Teach.backRank(g, Chess.WHITE));
}

/* ---- mate in one ---- */
{
  const g = G("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
  const m = Teach.mateInOne(g);
  ok("finds the back-rank mate", m && Chess.toSAN(g, m) === "Ra8#", m ? Chess.toSAN(g, m) : "none");
}
{
  const g = Chess.create();
  ok("no mate in one from the starting position", Teach.mateInOne(g) === null);
}

/* ---- afterMove: the live teaching moments ---- */
{
  const g = G("r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1");   // Nc7+ forks king and rook
  const m = Chess.fromSAN(g, "Nc7+");
  const said = Teach.afterMove(g, m);
  ok("afterMove names the fork", said.length && said[0].concept === "fork",
     said.map((s) => s.concept).join(","));
  ok("afterMove left the position untouched", Chess.fen(g) === "r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1");
}
{
  const g = G("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
  const said = Teach.afterMove(g, Chess.fromSAN(g, "Ra8#"));
  ok("afterMove names checkmate", said.length && said[0].concept === "checkmate");
}
{
  const g = G("7k/8/8/8/8/8/8/K5Q1 w - - 0 1");      // Qg6 takes every square away
  const said = Teach.afterMove(g, Chess.fromSAN(g, "Qg6"));
  ok("afterMove warns about stalemate", said.length && said[0].concept === "stalemate",
     said.map((s) => s.concept).join(","));
}
{
  const g = G("4k3/8/8/8/8/8/4B3/4K3 w - - 0 1");    // Bb5 walks into nothing; safe move
  const said = Teach.afterMove(g, Chess.fromSAN(g, "Bb5+"));
  ok("a plain check is named", said.some((s) => s.concept === "check"));
}
{
  // the bishop steps onto an open file where the rook takes it for free
  const g = G("3r3k/8/8/8/8/8/8/4KB2 w - - 0 1");
  const said = Teach.afterMove(g, Chess.fromSAN(g, "Bd3"));
  const h = said.find((s) => s.concept === "hanging");
  ok("hanging a piece is called out", !!h, said.map((s) => s.concept).join(","));
  ok("…and its arrow runs from the attacker to the piece (d8 → d3)",
     h && Chess.sqName(h.squares[0]) === "d8" && Chess.sqName(h.squares[1]) === "d3");
}
{
  const g = Chess.create();
  const said = Teach.afterMove(g, Chess.fromSAN(g, "e4"));
  ok("a centre pawn is praised for the right reason", said.some((s) => s.concept === "centre"));
}
{
  const g = G("rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1");
  const said = Teach.afterMove(g, Chess.fromSAN(g, "O-O"));
  ok("castling is explained", said.some((s) => s.concept === "castling"));
}

/* ---- opportunities & warnings ---- */
{
  const g = G("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
  const ops = Teach.opportunities(g, Chess.WHITE);
  ok("opportunities leads with the mate", ops.length && ops[0].concept === "checkmate");
}
{
  const g = G("r6k/6pp/8/8/8/8/5PPP/6K1 w - - 0 1");
  ok("warnings mention our own airless back rank",
     Teach.warnings(g, Chess.WHITE).some((w) => w.concept === "backRank"));
}

/* ================================================================
   Honesty. Everything below was a real false claim at some point, or
   guards one: the coach naming a pin, a skewer or a hanging piece that
   wasn't there — once recommending a "skewer" that lost the queen.
   A name the coach gets wrong is worse than silence, so these are the
   positions people actually reach, asked what the coach would say.
   ================================================================ */
function line(seq, fen) {                 /* moves played from the start, or from `fen` */
  const g = Chess.create(fen);
  for (const s of seq.split(" ").filter(Boolean)) {
    const m = Chess.fromSAN(g, s);
    if (!m) throw new Error("bad test line: " + s + " in " + seq);
    Chess.play(g, m);
  }
  return g;
}
const plain = (t) => String(t || "").replace(/<[^>]+>/g, "");
function said(g, san) {
  const before = Chess.fen(g);
  const out = Teach.afterMove(g, Chess.fromSAN(g, san));
  if (Chess.fen(g) !== before) throw new Error("afterMove disturbed the position at " + san);
  return out;
}
const concepts = (list) => list.map((s) => s.concept).join(",") || "(nothing)";

/* ---- must not claim: the playtest's own repros ---- */
{
  const g = line("e4 e5 Nf3 Nc6");
  const s = said(g, "Bb5");
  ok("3.Bb5 (Ruy Lopez) is not called a skewer or a pin",
     !s.some((x) => x.concept === "skewer" || x.concept === "pin"), concepts(s));
}
{
  const g = line("e4 e5 Nf3 Nc6");
  const s = said(g, "Bc4");
  ok("3.Bc4 (Italian) is not called a pin of f7 to g8",
     !s.some((x) => x.concept === "pin" || x.concept === "skewer"), concepts(s));
}
{
  const g = line("e4 e5");
  const s = said(g, "Qh5");
  ok("2.Qh5 is not called a pin of the h-pawn to the rook",
     !s.some((x) => (x.concept === "pin" || x.concept === "skewer") && /h7|h8/.test(plain(x.text))), concepts(s));
}
{
  /* the playtest game: 8.Qf3+ was praised as a skewer whose follow-up,
     Qxf8, loses the queen to the rook on h8 */
  const g = line("e4 e5 Nf3 Nc6 Bb5 a6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7");
  const s = said(g, "Qf3+");
  ok("Qf3+ in the Fried Liver is not a skewer (Qxf8 would lose the queen)",
     !s.some((x) => x.concept === "skewer"), concepts(s));
  const ex = Teach.explainMove(g, Chess.fromSAN(g, "Qf3+"));
  ok("…and the hint never suggests it wins the bishop on f8",
     !ex || !/skewer|f8/.test(ex.text), ex && ex.text);
}
{
  /* the whole playtest line, move by move: the only pin named anywhere
     is the real one — 7...Kxf7 walks into Bc4 pinning the d5 knight */
  const seq = "e4 e5 Nf3 Nc6 Bb5 a6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+".split(" ");
  const g = Chess.create(), bad = [];
  let walked = null;
  for (const s of seq) {
    const out = said(g, s);
    for (const x of out.filter((y) => y.concept === "pin" || y.concept === "skewer")) {
      if (s === "Kxf7" && /walks into a <b>pin<\/b>: their bishop on c4 now pins your knight on d5 to your king/.test(x.text)) walked = x;
      else bad.push(s + " (" + x.concept + ")");
    }
    Chess.play(g, Chess.fromSAN(g, s));
  }
  ok("no false pin or skewer is claimed anywhere in the playtest game", !bad.length, bad.join(" "));
  const h = line("e4 e5 Nf3 Nc6 Bb5 a6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7");
  ok("…and the pin 7...Kxf7 walks into is real (Bc4 pins Nd5 to the king)", !!walked &&
     Teach.lines(h, Chess.WHITE).pins.some((p) => Chess.sqName(p.by) === "c4" && Chess.sqName(p.front) === "d5" && p.absolute));
}
{
  /* blocking a check with a piece pins it, but that was forced: no scolding */
  const g = line("e4 e5 Nf3 d6");
  const s = said(line("e4 e5 Nf3 d6 Bb5+"), "Bd7");
  ok("a forced interposition is not scolded as 'walking into a pin'", !s.some((x) => /walks into/.test(x.text)), concepts(s));
  ok("(and the check before it was real)", Chess.inCheck(line("e4 e5 Nf3 d6 Bb5+")) && !!g);
}
{
  /* Nxf7 forks queen and rook — and the king simply takes it */
  const g = line("e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5");
  const s = said(g, "Nxf7");
  ok("Nxf7 is not called a fork when the king can take the forker", !s.some((x) => x.concept === "fork"), concepts(s));
  ok("…but it is honestly called a piece left en prise", s.some((x) => x.concept === "hanging"), concepts(s));
}
{
  const g = G("rb2k3/8/8/3N4/8/8/8/4K3 w - - 0 1");    // Nc7+ "forks" — and the bishop takes it
  const s = said(g, "Nc7+");
  ok("a fork whose forker is simply captured is not a fork", !s.some((x) => x.concept === "fork"), concepts(s));
}
{
  /* a pawn "fork" of a2 and c2, where c2 only looked undefended
     because its defenders could not recapture while in check */
  const g = G("r1b1kbnr/p3pppp/8/qp2B3/1p1pN3/3P3P/P1P1PPP1/2RQKB1R b Kkq - 0 12");
  const s = said(g, "b3+");
  ok("a victim that only looks loose because its defender is in check is not a fork",
     !s.some((x) => x.concept === "fork"), concepts(s));
}
{
  /* the Exchange Ruy: Bxc6 is a trade, not a piece left hanging */
  const g = line("e4 e5 Nf3 Nc6 Bb5 a6");
  const s = said(g, "Bxc6");
  ok("Bxc6 (an even trade) is not called a hanging bishop", !s.some((x) => x.concept === "hanging"), concepts(s));
}
{
  /* knight for bishop is a trade; the bishop on d4 is lost to numbers */
  const g = G("1r1q1b1r/ppp1kppp/4nn2/1Q6/2Bp4/2N1BP2/PPP2PPP/3RK2R w K - 2 14");
  const s = said(g, "Bxd4").find((x) => x.concept === "hanging");
  ok("a capture lost to numbers is explained as outnumbered, not as a bad trade",
     s && /more pieces aimed at that square/.test(plain(s.text)) && !/bad trade|for free/.test(plain(s.text)), s && plain(s.text));
}
{
  /* promoting into a rook that can only take back at a loss */
  const g = G("8/KP6/8/8/P7/8/1r6/7k w - - 0 1");
  const s = said(g, "b8=Q");
  ok("a promotion they can only take at a loss is not 'hanging the queen'",
     !s.some((x) => x.concept === "hanging"), concepts(s));
}
{
  /* every curated book line, replayed: the only tactic named anywhere
     is the Nimzo-Indian pin, which is real */
  const Book = require("../book.js");
  const named = new Set();
  for (const l of Book.LINES) {
    const g = Chess.create();
    for (const s of l.seq.split(" ")) {
      for (const x of said(g, s)) {
        if (/fork|pin|skewer|hanging|backRank/.test(x.concept)) named.add(g.played.map((r) => r.san).concat(s).join(" ") + " → " + x.concept);
      }
      Chess.play(g, Chess.fromSAN(g, s));
    }
  }
  const allowed = new Set(["d4 Nf6 c4 e6 Nc3 Bb4 → pin"]);
  const extra = [...named].filter((n) => !allowed.has(n));
  ok("replaying every book line names no tactic that isn't there", !extra.length, extra.join("; "));
  ok("…and still names the Nimzo-Indian pin", named.has("d4 Nf6 c4 e6 Nc3 Bb4 → pin"));
}

/* ---- must not claim: found by a second reviewer in self-play ----
   Each of these was said, and each was false or misleading. The guard
   that stops it is named so a future change knows what it would undo. */
{
  /* a capture that loses the piece is not "taken for free" — it took
     something first (the wording, not just the warning, has to be true) */
  const s = said(G("3qkb1r/3n1ppp/1nbp4/1R2pN2/4P3/3P1N2/2P1BPPP/1Q2K2R w Kk - 6 20"), "Rxb6").find((x) => x.concept === "hanging");
  ok("Rxb6 (rook takes a knight, knight takes back) is told as a capture that costs material",
     s && /that capture costs material/.test(plain(s.text)) && !/for free|bad trade/.test(plain(s.text)), s && plain(s.text));
  const f7 = said(line("e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5"), "Nxf7").find((x) => x.concept === "hanging");
  ok("…and Nxf7 Kxf7 is 'a knight for a pawn', not a knight 'taken for free'",
     f7 && /you've given a knight for a pawn/.test(plain(f7.text)), f7 && plain(f7.text));
}
{
  /* reallyLost: bait is not a hanging piece. Bxh2 gives a bishop, but
     Rxh2 lets Rxb3 take the knight the rook was guarding */
  const s = said(G("1r6/5p1p/3b1k2/3p4/6K1/1N6/1R5P/8 b - - 7 46"), "Bxh2");
  ok("a desperado that wins the material back elsewhere is not 'Careful — hanging'",
     !s.some((x) => x.concept === "hanging"), concepts(s));
  /* Ng5+ fxg5 opens the long diagonal: Bxh8 */
  const n = said(G("2R3nr/1p1pqk1p/5pp1/4B3/2p1P3/2P4N/P1P2PPP/5K1R w - - 1 17"), "Ng5+");
  ok("a deflection (Ng5+ fxg5 Bxh8) is not 'Careful — hanging'", !n.some((x) => x.concept === "hanging"), concepts(n));
  /* what the move itself took counts: Qxg4 Nxg4 Nxc7 is queen for queen
     and bishop for knight — a trade, not a queen thrown away */
  const q = said(G("1k1r3r/p1q3pp/2pbNn2/2p2Q2/6b1/4B1P1/PP3PBP/3R2KR w - - 3 26"), "Qxg4");
  ok("Qxg4, answered by Nxg4 Nxc7, is not 'Careful — costs material'", !q.some((x) => x.concept === "hanging"), concepts(q));
  /* and the same honesty for "free material" when it's your move */
  const ops = Teach.opportunities(G("1r6/5p1p/5k2/3p4/6K1/1N6/1R5b/8 w - - 0 47"), Chess.WHITE);
  ok("opportunities doesn't call a bishop 'free' when taking it drops the knight",
     !ops.some((o) => o.concept === "hanging"), ops.map((o) => plain(o.text)).join(" | "));
}
{
  /* a pin by a piece they can simply take is a piece en prise, not a pin */
  const s = said(G("r1bqkbnr/1pp1pppp/p1np4/8/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 4"), "Bb5");
  ok("Bb5 into ...axb5 is not praised as a pin", !s.some((x) => x.concept === "pin"), concepts(s));
  ok("…it is called what it is: a piece left hanging", s.some((x) => x.concept === "hanging"), concepts(s));
}
{
  /* walking into a "pin" by a queen you are attacking: she has to run */
  const s = said(G("r2qkb1r/1pp1npp1/p1n1b3/8/2B1Q2p/4PN1P/PPPPKPP1/R1B4R b kq - 1 11"), "Bf5");
  ok("no 'walks into a pin' when the pinner is the piece you just attacked", !s.some((x) => /walks into/.test(x.text)), concepts(s));
  /* a pawn pinned to a rook it never wanted to leave has lost nothing */
  const p = said(G("r1bqkb1r/pppp1ppp/2n2n2/4p3/8/4PQ2/PPPP1PPP/RNBK1BNR b kq - 5 4"), "Na5");
  ok("no 'walks into a pin' for a defended pawn that isn't about to fall (b7 to a8)", !p.some((x) => /walks into/.test(x.text)), concepts(p));
  /* a forced-looking interposition in a main line: 7.Nc3 in the Giuoco Piano */
  const n = said(line("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+"), "Nc3");
  ok("7.Nc3, blocking Bb4+, is not scolded as walking into a pin", !n.some((x) => /walks into/.test(x.text)), concepts(n));
  /* a pin that was already standing: 4.e3 in the Nimzo-Indian */
  const e = said(line("d4 Nf6 c4 e6 Nc3 Bb4"), "e3");
  ok("4.e3 in the Nimzo is not scolded for the pin that was already there", !e.some((x) => /walks into/.test(x.text)), concepts(e));
}
{
  /* "that threatens mate" only when this move made the threat */
  const s = said(G("6k1/5ppp/8/8/8/8/7P/R5K1 w - - 0 1"), "h3");
  ok("a mate that was already there isn't credited to the next quiet move", !s.some((x) => x.concept === "mateThreat"), concepts(s));
  const ex = Teach.explainMove(G("6k1/5ppp/8/8/8/8/7P/R5K1 w - - 0 1"), Chess.fromSAN(G("6k1/5ppp/8/8/8/8/7P/R5K1 w - - 0 1"), "h3"));
  ok("…and the hint doesn't either", !ex || !/Threatens mate/.test(ex.text), ex && ex.text);
}
{
  /* the front piece can take the pinner for an even trade: no pin */
  const s = said(G("3rk3/8/5b2/8/7P/8/8/2B3K1 w - - 0 1"), "Bg5");
  ok("Bg5 'pinning' a bishop that can take it (Bxg5 hxg5) is not a pin", !s.some((x) => x.concept === "pin"), concepts(s));
  /* a queen "pinned" by a rook she can take for free */
  const q = said(G("4k3/8/8/4q3/8/8/8/1K5R w - - 0 1"), "Re1");
  ok("Re1 'pinning' a queen that just takes the rook is not a pin", !q.some((x) => x.concept === "pin"), concepts(q));
  /* a rook "pinned" by a defended rook it can trade off: an offer, not a pin */
  const r = said(G("4k3/8/8/4r3/8/8/3K4/7R w - - 0 1"), "Re1");
  ok("Re1 against a rook that can simply trade itself off (Rxe1 Kxe1) is not a pin", !r.some((x) => x.concept === "pin"), concepts(r));
}
{
  /* a skewer that the front piece answers by guarding the back one */
  const s = said(G("4n1k1/8/2q5/8/P7/3B4/6PP/5R1K w - - 0 1"), "Bb5");
  ok("Bb5 is no skewer when ...Qe6 guards the knight behind (Bxe8 Qxe8 is a trade)",
     !s.some((x) => x.concept === "skewer"), concepts(s));
  const k = said(G("r7/8/k7/8/8/8/7K/7R w - - 0 1"), "Ra1+");
  ok("Ra1+ is no skewer when ...Kb7 steps over to guard the rook", !k.some((x) => x.concept === "skewer"), concepts(k));
}
{
  /* a fork that was already on the board isn't announced again */
  const s = said(G("r3r2k/2N5/8/8/8/8/6PP/5R1K w - - 0 1"), "h3");
  ok("a fork already standing is not re-announced after an unrelated move", !s.some((x) => x.concept === "fork"), concepts(s));
}
{
  /* back rank: "can't get off its back row" has to be true first */
  const g = G("3qk2r/5p1p/2N2bp1/8/p4Q1P/3P3P/2P1P3/1K3B2 b k - 0 29");
  ok("no back-rank claim for a king that can step to a2 (a rook in the corner is a different mate)",
     !Teach.backRank(g, Chess.WHITE), JSON.stringify(Teach.backRank(g, Chess.WHITE)));
}
{
  /* a check answered by en passant is answered by capturing the checker */
  const s = said(G("4k3/3p4/8/4P3/4K3/8/8/8 b - - 0 1"), "d5+").find((x) => x.concept === "check");
  ok("…d5+ can be met by exd6 e.p., which captures the checking pawn",
     s && /capture the checking piece/.test(plain(s.text)) && !/block/.test(plain(s.text)), s && plain(s.text));
}
{
  /* the static exchange counts what a pawn really becomes */
  const u = G("8/1P6/8/8/8/8/8/4K2k w - - 0 1");
  ok("see(): an underpromotion to a knight is worth a knight", Teach.seeMove(u, Chess.fromSAN(u, "b8=N")) === Teach.VAL[2] - Teach.VAL[1] &&
     Teach.seeMove(u, Chess.fromSAN(u, "b8=Q")) === Teach.VAL[5] - Teach.VAL[1]);
  const r = G("4k3/8/8/8/1R6/8/p7/1n2K3 w - - 0 1");
  ok("see(): a pawn that takes back on the last rank comes back as a queen",
     Teach.seeMove(r, Chess.fromSAN(r, "Rxb1")) < -500, String(Teach.seeMove(r, Chess.fromSAN(r, "Rxb1"))));
}

/* ---- must still find: the real thing ---- */
{
  const g = line("d4 Nf6 c4 e6 Nc3");
  const s = said(g, "Bb4").find((x) => x.concept === "pin");
  ok("Nimzo-Indian 3...Bb4 pins the knight to the king", !!s);
  ok("…and says the knight cannot move at all (true: every knight move leaves the line)",
     s && /not allowed to move at all/.test(plain(s.text)), s && plain(s.text));
}
{
  const g = line("d4 d5 c4 e6 Nc3 Nf6");
  const s = said(g, "Bg5").find((x) => x.concept === "pin");
  ok("QGD 4.Bg5 pins the knight to the queen (a relative pin)", !!s && /queen/.test(plain(s.text)), s && plain(s.text));
  const L = Teach.lines((() => { const h = line("d4 d5 c4 e6 Nc3 Nf6 Bg5"); return h; })(), Chess.WHITE);
  ok("…marked relative, not absolute", L.pins.length === 1 && L.pins[0].absolute === false);
}
{
  /* a queen pinned to her king by a defended rook can still slide along
     the file — "can't move at all" would be false */
  const g = G("4k3/8/8/4q3/8/8/3K4/7R w - - 0 1");
  const s = said(g, "Re1").find((x) => x.concept === "pin");
  ok("a pinned queen is told she can only move along the line",
     s && /can only move along it/.test(plain(s.text)), s && plain(s.text));
}
{
  const g = G("4r1k1/8/2q5/8/P7/3B4/6PP/5R1K w - - 0 1");   // Bb5: queen in front, rook behind
  const s = said(g, "Bb5");
  ok("a real skewer (queen in front, undefended rook behind) is found", s.some((x) => x.concept === "skewer"), concepts(s));
}
{
  const g = G("q7/8/8/k7/8/8/7K/7R w - - 0 1");            // Ra1+: king in front, queen behind
  ok("the check-skewer Ra1+ is found", said(g, "Ra1+").some((x) => x.concept === "skewer"));
}
{
  const g = G("4k3/8/2n1n3/8/3P4/8/8/4K3 w - - 0 1");
  ok("a pawn fork of two knights is found", said(g, "d5").some((x) => x.concept === "fork"));
}
{
  const g = line("e4 e5 Bc4 Nc6");
  const s = said(g, "Qh5");
  ok("3.Qh5 is named for what it is: a threat of mate on f7",
     s.length && s[0].concept === "mateThreat" && /Qxf7/.test(plain(s[0].text)), concepts(s));
}

/* ---- the static exchange underneath ---- */
{
  ok("doubled rooks win a knight defended once (the x-ray joins in)",
     Teach.isLoose(G("3r2k1/8/8/3n4/8/8/3R4/3RK3 w - - 0 1"), Chess.sqIndex("d5")));
  ok("…but a single rook does not", !Teach.isLoose(G("3r2k1/8/8/3n4/8/8/8/3RK3 w - - 0 1"), Chess.sqIndex("d5")));
  const p = G("4r1k1/8/8/2b5/4N3/8/8/4K3 w - - 0 1");      // Ne4 is pinned to the king
  ok("a pinned attacker doesn't make a piece loose", !Teach.isLoose(p, Chess.sqIndex("c5")));
  ok("…and the pinned piece itself is", Teach.isLoose(p, Chess.sqIndex("e4")));
  ok("see(): bishop for knight is a trade, not a win",
     Teach.see(G("4k3/1p6/2n5/1B6/8/8/8/4K3 w - - 0 1"), Chess.sqIndex("b5"), Chess.sqIndex("c6")) < Teach.GAIN);
}

/* ---- back rank: only when a rook landing there really mates ---- */
{
  ok("no back-rank claim in the starting position", !Teach.backRank(Chess.create(), Chess.WHITE) &&
     !Teach.opportunities(Chess.create(), Chess.WHITE).some((o) => o.concept === "backRank"));
  const castled = G("r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4");
  ok("no back-rank claim for a freshly castled king (the rook beside it guards)", !Teach.backRank(castled, Chess.WHITE));
  ok("no back-rank claim when our own rook guards the row",
     !Teach.backRank(G("r5k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1"), Chess.WHITE));
  ok("no back-rank claim for a king already in check",
     !Teach.backRank(G("3r1k1r/p4p1p/5p1b/1B6/3P4/5b1P/p1P3P1/R2K3R w - - 0 25"), Chess.WHITE));
  const br = Teach.backRank(G("r6k/6pp/8/8/8/8/5PPP/6K1 w - - 0 1"), Chess.WHITE);
  ok("a sealed back rank names the mating squares", br && br.squares.map(Chess.sqName).indexOf("e1") >= 0,
     br && br.squares.map(Chess.sqName).join(","));
}

/* ---- explainMove: what a hinted move really does ---- */
function explain(g, san) {
  if (typeof Teach.explainMove !== "function") return null;   /* each case below then fails, rather than the run */
  const before = Chess.fen(g);
  const r = Teach.explainMove(g, Chess.fromSAN(g, san));
  if (Chess.fen(g) !== before) throw new Error("explainMove disturbed the position at " + san);
  return r;
}
const has = (r, re) => !!r && re.test(r.text);
{
  const r = explain(G("4k3/8/8/3q4/8/8/6B1/4K3 w - - 0 1"), "Bxd5");
  ok("explain: a free capture says so", has(r, /Takes the queen on d5 for free/), r && r.text);
  ok("explain: squares start with the move", r && r.squares[0] === Chess.sqIndex("g2") && r.squares[1] === Chess.sqIndex("d5"));
}
{
  const r = explain(G("4k3/1p6/2n5/1B6/8/8/8/4K3 w - - 0 1"), "Bxc6+");
  ok("explain: bishop for knight is an even trade", has(r, /even trade/), r && r.text);
}
{
  const r = explain(line("e4 e5 Nf3 Nc6 Bb5 a6 Bxc6"), "dxc6");
  ok("explain: a recapture completes the exchange rather than winning 'for free'",
     has(r, /Takes back on c6, so the exchange comes out even/) && !has(r, /for free/), r && r.text);
}
{
  const r = explain(G("r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1"), "Nc7+");
  ok("explain: a fork names both victims", has(r, /Forks the king on e8 and the rook on a8/), r && r.text);
}
{
  const r = explain(line("e4 e5 Bc4 Nc6"), "Qh5");
  ok("explain: a mate threat is named with the mating move", has(r, /Threatens mate: Qxf7/), r && r.text);
}
{
  const r = explain(G("4k3/8/2n5/8/8/8/8/3R1BK1 w - - 0 1"), "Bb5");
  ok("explain: an absolute pin of a knight", has(r, /Pins the knight on c6 to the king: it can't move at all/), r && r.text);
}
{
  const r = explain(line("e4 e5"), "Nf3");
  ok("explain: Nf3 attacks the undefended e5 pawn (before mentioning development)",
     has(r, /^Attacks the pawn on e5, which nothing defends/) && has(r, /develops the knight/), r && r.text);
}
{
  const r = explain(G("4k3/8/8/3r4/8/3N4/8/K4R2 w - - 0 1"), "Rd1");
  ok("explain: defending a threatened piece", has(r, /Saves the knight on d3/), r && r.text);
}
{
  const r = explain(G("4k3/8/8/4n3/3P4/8/8/4K3 b - - 0 1"), "Nc6");
  ok("explain: moving a threatened piece away", has(r, /moves the knight out of danger/i), r && r.text);
}
{
  const r = explain(G("r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5"), "O-O");
  ok("explain: castling", has(r, /^Castles/), r && r.text);
}
{
  const r = explain(G("8/8/8/3P4/8/8/k7/6K1 w - - 0 1"), "d6");
  ok("explain: a passed pawn advancing, with the distance to go", has(r, /passed pawn.*2 steps from queening/), r && r.text);
}
{
  const r = explain(G("8/KP6/8/8/P7/8/1r6/7k w - - 0 1"), "b8=Q");
  ok("explain: a promotion they can only take at a loss", has(r, /Promotes the pawn to a queen — and even if they take it, you still come out ahead/), r && r.text);
}
{
  const r = explain(Chess.create(), "e4");
  ok("explain: a centre pawn names the squares it takes", has(r, /from e4 the pawn takes d5 and f5/), r && r.text);
}
{
  const r = explain(line("e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5"), "Nxf7");
  ok("explain: Nxf7 is a sacrifice, not 'winning material'", has(r, /sacrifice/) && !has(r, /Wins material/), r && r.text);
}
{
  ok("explain: a king shuffle with nothing in it returns null (no platitude)",
     explain(G("4k3/8/8/8/8/8/8/4K3 w - - 0 1"), "Kd2") === null);
  ok("explain: garbage in, null out", Teach.explainMove(Chess.create(), { from: 0, to: 0, piece: 0 }) === null &&
     Teach.explainMove(null, null) === null);
}
{
  /* the words themselves, held to the board */
  const r = explain(line("e4 e5 Bc4 Nc6"), "Qh5");
  ok("explain: a mate threat is filed as a mate threat, not as checkmate", r && r.concept === "mateThreat", r && r.concept);
  const c = explain(G("r7/8/k7/8/8/8/7K/7R w - - 0 1"), "Ra1+");
  ok("explain: a check isn't called 'forced' (it can often be met three ways)", has(c, /Gives check/) && !has(c, /forced/), c && c.text);
  const o = explain(G("4k3/8/8/3n4/8/8/8/R3K3 w - - 0 1"), "Rd1");
  ok("explain: an open file is 'no pawns', not 'nothing blocks it' (the knight on d5 does)",
     has(o, /open d-file — no pawns stand on it/) && !has(o, /nothing blocks/), o && o.text);
  const p = explain(G("4k3/8/8/8/1p6/P7/8/R3K3 b - - 0 1"), "bxa3");
  ok("explain: a pawn that captures (and is taken straight back) isn't 'pushing a passed pawn'",
     !has(p, /passed pawn/), p && p.text);
  const p2 = explain(G("4k3/8/8/8/1p6/P7/8/4K3 b - - 0 1"), "bxa3");
  ok("explain: …nor one that captures safely — a capture isn't a push",
     has(p2, /for free/) && !has(p2, /pushes/), p2 && p2.text);
  const p3 = explain(G("8/2k5/8/3P4/8/8/8/6K1 w - - 0 1"), "d6+");
  ok("explain: a passed pawn pushed to where the king just takes it isn't 'marching to queen'",
     !has(p3, /passed pawn/), p3 && p3.text);
  const b5 = explain(line("e4 e5 Nf3 Nc6"), "Bb5"), c3 = explain(line("e4 e5"), "Nc3");
  ok("explain: 'toward the centre' only when it is (Nc3 yes, Bb5 no)",
     has(c3, /toward the centre/) && has(b5, /^Develops the bishop — from b5/), (b5 && b5.text) + " / " + (c3 && c3.text));
  const q = explain(line("a8=Q", "5r2/PK5k/4B3/2p2Ppp/8/3n4/8/8 w - - 4 59"), "Rxa8");
  ok("explain: taking a new queen counts the pawn she came from (not 'wins material')",
     has(q, /Takes the new queen on a8 — though counting the pawn it came from, the exchange still costs material/) && !has(q, /Wins material/), q && q.text);
  const s = explain(G("r2qkb2/1pp1np2/p1n5/5bpr/2B2Q1N/4P2P/PPPPKPP1/R1B4R w q g6 0 14"), "Qxf5");
  ok("explain: a sacrifice says so first, then what it threatens",
     has(s, /^A sacrifice/) && has(s, /Also: threatens mate: Bxf7/), s && s.text);
  const t2 = explain(G("1k1r3r/p1q3pp/2pbNn2/2p2Q2/6b1/4B1P1/PP3PBP/3R2KR w - - 3 26"), "Qxg4");
  ok("explain: a trade across two squares names the answer, not 'a sacrifice' (Qxg4 Nxg4 Nxc7)",
     has(t2, /^Takes the bishop on g4: if they take back, Nxc7 takes their queen, and material comes out level/) && !has(t2, /sacrifice/), t2 && t2.text);
  const t3 = explain(G("1r6/5p1p/3b1k2/3p4/6K1/1N6/1R5P/8 b - - 7 46"), "Bxh2");
  ok("explain: a desperado that comes out ahead says how (Bxh2 Rxh2 Rxb3)",
     has(t3, /if they take back, Rxb3 takes their knight, and you come out ahead/), t3 && t3.text);
  const blk = explain(line("e4 e5 Nf3 d6 Bb5+"), "c6"), run = explain(G("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1"), "Kd1");
  ok("explain: answering a check says how, instead of falling back on a principle",
     has(blk, /blocks the check: the pawn stands between the king and the piece giving check/i) && has(run, /Steps the king out of check/),
     (blk && blk.text) + " / " + (run && run.text));
  const n = explain(G("4k3/2p5/4p3/8/8/2N5/8/4K3 w - - 0 1"), "Nd5");
  ok("explain: a knight that can simply be taken doesn't brag about what it attacks", !has(n, /Attacks the pawn on c7/), n && n.text);
  const k = explain(G("4k3/8/1p6/n7/8/8/7Q/R3K3 w - - 0 1"), "Qe2+");
  ok("explain: a check doesn't make their defended knight look loose (b6 still guards a5)", !has(k, /a5/), k && k.text);
  const ops = Teach.opportunities(G("4k3/8/1q3r2/3N4/8/8/8/4K3 w - - 0 1"), Chess.WHITE).find((x) => x.concept === "fork");
  ok("opportunities: with you to move, two targets are 'either one can be won', not 'they can't both be saved'",
     ops && /either one can be won/.test(plain(ops.text)), ops && plain(ops.text));
  const two = Teach.opportunities(G("3k4/2b1b3/8/3N4/8/8/8/4K3 w - - 0 1"), Chess.WHITE);
  ok("opportunities: a knight hitting two defended bishops is no fork (knight for bishop is a trade)",
     !two.some((x) => x.concept === "fork"), two.map((x) => plain(x.text)).join(" | "));
}
{
  /* after Bxc6+ the defenders of e5 can't recapture for one move
     (they're in check) — the reply must not be credited with "saving" it */
  const r = explain(line("Nc3 Nc6 e3 d6 Nf3 Nf6 Bb5 e5 Bxc6+"), "bxc6");
  /* case-blind: a second fact is lower-cased after "Also:" */
  ok("explain: no 'saves' claim computed while in check", r && !/saves/i.test(r.text), r && r.text);
}

/* ---- fast enough to run on every move ---- */
{
  const seq = "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3 Nb4 a3 Nxc2+ Kd1 Nxa1".split(" ");
  const g = Chess.create();
  let worst = 0;
  for (const s of seq) {
    const m = Chess.fromSAN(g, s), t0 = Date.now();
    Teach.afterMove(g, m); Teach.explainMove(g, m);
    Teach.opportunities(g, g.turn); Teach.warnings(g, g.turn);
    worst = Math.max(worst, Date.now() - t0);
    Chess.play(g, m);
  }
  ok("every move of a sharp game is read in under 150ms", worst < 150, worst + "ms");
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nteaching eyes: all clear");
process.exit(failed ? 1 : 0);
