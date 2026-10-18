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
  ok("hanging a piece is called out", said.some((s) => s.concept === "hanging"),
     said.map((s) => s.concept).join(","));
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
function line(seq) {
  const g = Chess.create();
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
  ok("a piece lost to numbers is explained as outnumbered, not as a bad trade",
     s && /more times than it is defended/.test(plain(s.text)) && !/bad trade/.test(plain(s.text)), s && plain(s.text));
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
  ok("explain: a promotion they can only take at a loss", has(r, /Promotes the pawn to a queen — and if they take it/), r && r.text);
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
  /* after Bxc6+ the defenders of e5 can't recapture for one move
     (they're in check) — the reply must not be credited with "saving" it */
  const r = explain(line("Nc3 Nc6 e3 d6 Nf3 Nf6 Bb5 e5 Bxc6+"), "bxc6");
  ok("explain: no 'saves' claim computed while in check", r && !/Saves/.test(r.text), r && r.text);
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
