/* learn.js — the Academy: a course that teaches the way learning
   actually works.

   Every design choice here is a technique with evidence behind it, and
   the app names them out loud so the learner knows why they're being
   asked to struggle a little:

     · RETRIEVAL PRACTICE — you always *produce* the move on a real
       board. Nothing here is multiple choice, because recognising an
       answer is not the same skill as finding one.
     · WORKED EXAMPLE, THEN FADE — the first sight of an idea is
       demonstrated move-by-move, then handed straight back to you to
       do yourself. Support is removed as soon as you don't need it.
     · SPACING — concepts return days later, at growing intervals, so
       they're rebuilt from memory instead of merely re-read. Only a
       review that was actually due moves the schedule on; solving the
       same idea twice in one sitting is practice, not spacing.
     · INTERLEAVING — practice mixes concepts rather than drilling one,
       because the hard part in a real game is knowing *which* idea
       applies.
     · IMMEDIATE, SPECIFIC FEEDBACK — a wrong move is answered by what
       that move actually allows (teach.js looks at your position), not
       by "try again".
     · ELABORATION — after a success you get the *why* in cause-and-
       effect terms, which is what makes a pattern transfer.
     · DESIRABLE DIFFICULTY — hints exist but are opt-in and never
       automatic, so the effort happens before the help.
     · METACOGNITION — "did you see it, or guess?" is asked honestly and
       fed into the schedule, because knowing what you don't know is
       most of learning. A lucky guess counts as not knowing it yet.

   Acceptance is by IDEA, not by one blessed move: a lesson about forks
   accepts any move that forks. That's the difference between teaching
   chess and teaching a script.

   Every position and solution is replayed through the engine by
   chess/tools/lesson-check.js — a lesson that can't be solved cannot
   ship, and neither can one whose answer loses or whose "wrong" moves
   are really just as good. */
(function (root) {
"use strict";

var isNode = (typeof module !== "undefined" && module.exports);
var Chess = isNode ? require("./engine.js") : root.Chess;
var Teach = isNode ? require("./teach.js") : root.Teach;

/* ---------- the course ----------
   chapter: which part of the path
   concept: what is being learned (drives spacing + live fading)
   fen:     the position, always sparse enough to see the idea
   ask:     what you're asked to find (retrieval prompt) — plain text
   rule:    how an answer is judged — 'fork' | 'pin' | 'skewer' |
            'mate' | 'win-material' | 'safe' | 'explicit'
   best:    the model answer in SAN (used for the hint and the reveal)
   why:     the elaboration shown on success (may use <b>/<i>)
   hint:    the opt-in nudge — a question, never the answer
   misses:  specific replies to specific wrong moves
   worked:  demonstrate it once before asking */
var CHAPTERS = [
  { id: "moves",    name: "How the pieces think", blurb: "Not the rules — the habits. What each piece is good at, felt on the board." },
  { id: "safety",   name: "Free things & safe things", blurb: "The two questions behind most beginner games: what's undefended, and what am I leaving loose?" },
  { id: "mate",     name: "Finishing", blurb: "Checkmate is a pattern, not an accident. Here are the ones that end most games." },
  { id: "tactics",  name: "Tricks that win material", blurb: "Fork, pin, skewer. Name them once and you'll see them forever." },
  { id: "opening",  name: "Starting well", blurb: "Three habits beat memorising twenty moves." },
  { id: "endgame",  name: "The last few pieces", blurb: "Where pawns become queens and a single square decides everything." }
];

var LESSONS = [
  /* ---------------- how the pieces think ---------------- */
  {
    id: "knight-L", chapter: "moves", concept: "knight", worked: true,
    title: "The knight's crooked step",
    fen: "4k3/8/4p3/8/3N4/8/8/4K3 w - - 0 1", side: 1,
    ask: "Capture the black pawn with your knight.",
    rule: "explicit", best: "Nxe6",
    hint: "Two squares in one direction, then one square across — always landing on the opposite colour to where it started.",
    why: "A knight moves in an L and is the only piece that <b>jumps over</b> anything in the way. That makes it deadliest in crowded positions, where every other piece is stuck behind traffic.",
    misses: {
      "Nf5": "Legal — but that isn't where the pawn is. From d4 the L-shape reaches e6: two up, one across.",
      "Nb5": "Legal, and the wrong direction. Count it out loud: two squares toward the pawn, then one across."
    }
  },
  {
    id: "knight-rim", chapter: "moves", concept: "knight",
    title: "A knight on the rim",
    fen: "4k3/8/8/8/8/8/4PPPP/4K1N1 w - - 0 1", side: 1,
    ask: "Your knight is hemmed in by its own pawns. Jump it out toward the middle.",
    rule: "explicit", best: "Nf3",
    hint: "Both jumps are legal. Which one lands where the knight can see more squares?",
    why: "From f3 the knight watches <b>eight</b> squares; from h3 it watches four. Same piece, half the power — which is the whole reason players mutter <i>“a knight on the rim is dim.”</i>",
    misses: {
      "Nh3": "That's a real move — but count the squares it now attacks (four) against f3 (eight). The edge halves a knight."
    }
  },
  {
    id: "bishop-diag", chapter: "moves", concept: "bishop",
    title: "The bishop's one colour",
    fen: "4k3/8/5p2/8/8/8/1B6/4K3 w - - 0 1", side: 1,
    ask: "Take the pawn on f6 with your bishop.",
    rule: "explicit", best: "Bxf6",
    hint: "Slide along the diagonal — b2 and f6 stand on the same colour, so a road connects them.",
    why: "A bishop can only ever stand on one colour of square — its whole life. That's why the <b>pair</b> of bishops is prized: together they finally cover everything.",
    misses: {}
  },

  /* ---------------- free things & safe things ---------------- */
  {
    id: "free-queen", chapter: "safety", concept: "hanging", worked: true,
    title: "Take what's free",
    fen: "4k3/8/8/3q4/8/8/6B1/4K3 w - - 0 1", side: 1,
    ask: "Something of theirs costs nothing to take. Take it.",
    rule: "win-material", best: "Bxd5",
    hint: "Follow your bishop's diagonal until it runs into something. Is anyone defending that square?",
    why: "Nobody was guarding the queen, so it came for free. Before anything clever, run the cheapest check in chess: <b>what of theirs is undefended?</b> A great many games between beginners are decided by exactly this and nothing else.",
    misses: {}
  },
  {
    id: "dont-hang", chapter: "safety", concept: "hanging",
    title: "Your turn to be careful",
    fen: "r5k1/8/p7/1B6/8/8/8/4K2R w - - 0 1", side: 1,
    ask: "Their pawn attacks your bishop. Move it somewhere it can't be taken.",
    rule: "safe", best: "Bd3",
    hint: "A pawn captures diagonally forward. Which squares does that little pawn actually cover — and what is guarding it?",
    why: "The other half of the same habit: after every move of yours, ask <i>what does that leave hanging?</i> A bishop lost to a pawn is about two pawns' worth of material gone for nothing — one of the commonest ways a good position quietly falls apart.",
    misses: {
      "Bxa6": "Count first: their rook on a8 defends that pawn, so after Rxa6 you've given a bishop for a pawn. A capture is only free when nothing is guarding the square."
    }
  },
  {
    id: "defend-it", chapter: "safety", concept: "hanging",
    title: "Or defend it instead",
    fen: "4k3/8/8/3r4/8/3N4/8/K4R2 w - - 0 1", side: 1,
    ask: "Their rook attacks your undefended knight. Save it.",
    rule: "safe", best: "Rd1",
    hint: "You could run — but is there a move that makes taking the knight cost them a rook?",
    why: "A piece isn't in danger merely because it's attacked; it's in danger when <b>taking it wins material</b>. Rd1 defends, so Rxd3 Rxd3 would give them a knight for their rook — and your knight stays on the square it already holds.",
    alsoWhy: "That works — the knight can't be won now, and that's what counts. There was a neat alternative too: <b>Rd1</b> defends it where it stands, so taking it would cost them their rook.",
    misses: {}
  },

  /* ---------------- finishing ---------------- */
  {
    id: "backrank-mate", chapter: "mate", concept: "backRank", worked: true,
    title: "The back rank",
    fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", side: 1,
    ask: "Checkmate in one move.",
    rule: "mate", best: "Ra8#",
    hint: "Their king is walled in by its own pawns. Which square can your rook reach along the empty back row?",
    why: "The king's own pawns seal its escape, so a rook arriving on the back row is the end. This pattern finishes a great many club games — and the cure is just as simple: push one pawn early to give your king air.",
    misses: {
      "Ra7": "Close! That attacks the pawns, but a check has to hit the <b>king</b>. Which rank is the king actually on?"
    }
  },
  {
    id: "queen-support", chapter: "mate", concept: "mate-support",
    title: "The queen needs a friend",
    fen: "6k1/8/6K1/8/8/8/8/Q7 w - - 0 1", side: 1,
    ask: "Checkmate in one.",
    rule: "mate", best: "Qa8#",
    hint: "Your own king already guards f7, g7 and h7. So which row does the queen need to take away?",
    why: "A lone queen can chase a king forever but can't finish alone — the mate happens because your <b>king</b> covers the escape squares while the queen takes the last row. Almost every mate is two pieces cooperating like this.",
    alsoWhy: "That's mate too — and for exactly the same reason: your king guards the square the queen lands on, so it can't be captured, and every escape is covered. Two pieces, working together.",
    misses: {
      "Qa7": "Nearly: that seals the seventh row, but the king is on the eighth and isn't even in check."
    }
  },
  {
    id: "two-rooks", chapter: "mate", concept: "mate-support",
    title: "The staircase",
    fen: "7k/R7/8/8/8/8/8/1R5K w - - 0 1", side: 1,
    ask: "Checkmate in one.",
    rule: "mate", best: "Rb8#",
    hint: "One rook already owns the seventh row. What happens if the other takes the eighth?",
    why: "Two rooks mate by taking rows in turn — one cuts the king off, the other delivers. Learn this staircase and you can finish any game where you have two rooks against a lone king.",
    misses: {}
  },

  /* ---------------- tricks that win material ---------------- */
  {
    id: "fork-knight", chapter: "tactics", concept: "fork", worked: true,
    title: "Two at once",
    fen: "r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1", side: 1,
    ask: "Find a knight move that attacks two pieces at the same time.",
    rule: "fork", best: "Nc7+",
    hint: "One square attacks both the corner rook and the king. Knights are the great forkers because nothing they hit can ever block them.",
    why: "That's a <b>fork</b>: one piece, two targets. They only get one move, so whichever they save, you take the other. And because one target is the king, the reply is forced — they don't even get to choose.",
    misses: {
      "Nb6": "Good instinct — that hits the rook. But look for the square that hits the rook <i>and</i> the king at once.",
      "Nf6+": "Check, which is something! But after the king steps aside, what have you actually won?"
    }
  },
  {
    id: "fork-pawn", chapter: "tactics", concept: "fork",
    title: "Even a pawn forks",
    fen: "4k3/8/2n1n3/8/3P4/8/8/R3K3 w - - 0 1", side: 1,
    ask: "Push a pawn so that it attacks both black knights at once.",
    rule: "fork", best: "d5",
    hint: "Pawns capture diagonally — one step forward puts both knights on its diagonals, and neither of them can capture the pawn back.",
    why: "The cheapest piece on the board attacks two pieces worth three times as much, and they can't both run. Pawn forks are easy to miss precisely because a pawn looks harmless.",
    misses: {}
  },
  {
    id: "pin-bishop", chapter: "tactics", concept: "pin", worked: true,
    title: "Freeze it",
    fen: "4k3/8/2n5/8/8/8/8/3R1BK1 w - - 0 1", side: 1,
    ask: "Put your bishop where the knight cannot legally move away.",
    rule: "pin", best: "Bb5",
    hint: "Line your bishop up so the knight stands directly between it and the king.",
    why: "That's a <b>pin</b>. Moving the knight would leave the king in check, which is illegal — so the knight is frozen, and your bishop is already attacking it. Their king can't come to the rescue either: your rook holds the d-file, so d7 is off limits. Next move, the knight falls.",
    misses: {
      "Bc4": "A fine developing square — but the knight can still stroll away. Which diagonal puts the king directly behind it?"
    }
  },
  {
    id: "skewer-rook", chapter: "tactics", concept: "skewer",
    title: "A pin, turned around",
    fen: "q7/8/8/k7/8/8/7K/7R w - - 0 1", side: 1,
    ask: "Line your rook up on the king so that the queen behind it falls.",
    rule: "skewer", best: "Ra1+",
    hint: "Which file has the king in front and the queen directly behind it?",
    why: "That's a <b>skewer</b>: the valuable piece is in <i>front</i> and must move out of check, so you take what was hiding behind it. Pin and skewer are the same geometry — the only question is which piece stands in front.",
    misses: {}
  },

  /* ---------------- starting well ---------------- */
  {
    id: "open-develop", chapter: "opening", concept: "development",
    title: "Develop, and ask a question",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", side: 1,
    ask: "Bring out a piece with a move that also attacks something.",
    rule: "explicit", best: "Nf3",
    hint: "Which knight can come out and put a question to the pawn on e5 in the same breath?",
    why: "The best opening moves do two jobs at once. Nf3 develops toward the middle <i>and</i> attacks e5, which nothing defends, so your opponent has to answer instead of building their own plan. Tempo is exactly this: making them respond.",
    misses: {
      "Qh5": "It attacks things — but the queen is far too precious to lead with. Every time they develop a piece by attacking her, they gain a move and you lose one.",
      "Bc4": "A genuinely good square, aimed at their weakest point (f7). But there's a move that develops <i>and</i> attacks the e5 pawn — do both when you can.",
      "d3": "Solid, and it frees the bishop. But a knight can come out this move: pieces before quiet pawn moves."
    }
  },
  {
    id: "open-castle", chapter: "opening", concept: "castling",
    title: "Get the king out of the middle",
    fen: "r1bqk2r/ppp1nppp/8/3n4/2BP4/1Q3N2/PP1N1PPP/R3K2R w KQkq - 2 11", side: 1,
    ask: "Your pieces are out and the centre is open. Make your king safe.",
    rule: "explicit", best: "O-O",
    hint: "One move puts the king in the corner behind its pawns and brings a rook toward the middle.",
    why: "Castling is the only move where two pieces move at once, and it fixes two problems together: a king standing on an open centre file, and a rook doing nothing in the corner. This is the main line of the Giuoco Piano, and castling here is what strong players play.",
    misses: {
      "Kf1": "The king does step off the open e-file — but walking it by hand leaves your rook stuck on h1 behind it. Castling does both jobs in one move.",
      "O-O-O": "Castling, at least — but the long way puts your king on c1 with only the a- and b-pawns nearby, while the kingside still has its full wall of f-, g- and h-pawns. Castle where the shelter is.",
      "Qxb7": "That pawn is guarded by the bishop on c8: Qxb7 Bxb7 loses your queen for a pawn — and your king would still be in the middle."
    }
  },

  /* ---------------- the last few pieces ---------------- */
  {
    id: "promote", chapter: "endgame", concept: "promotion", worked: true,
    title: "A pawn's whole dream",
    fen: "8/4P3/8/8/8/8/8/4K2k w - - 0 1", side: 1,
    ask: "Turn the pawn into a queen.",
    rule: "explicit", best: "e8=Q",
    hint: "Step onto the last rank and choose what it becomes.",
    why: "Any pawn reaching the far side becomes any piece you like — nearly always a queen. This is why an extra pawn matters in an endgame even when it looks like nothing: a pawn is a queen that hasn't arrived yet.",
    misses: {}
  },
  {
    id: "promote-safe", chapter: "endgame", concept: "promotion",
    title: "Queen it without a fight",
    fen: "8/KP6/8/8/P7/8/1r6/7k w - - 0 1", side: 1,
    ask: "Their rook is watching your pawn's path. Promote anyway — and count first.",
    rule: "explicit", best: "b8=Q",
    hint: "If they take the new queen, who takes back — and what is left on the board after that?",
    why: "Promote. If the rook takes, your king takes back — their rook for your pawn, and your a-pawn wins: their king is far too far away to catch it. Beginners often freeze when the queening square is attacked; count first, and here the count says go.",
    misses: {
      "Kb8": "Now your own king is standing on the queening square — the pawn can't promote until the king moves off again. Promote first; your king on a7 already guards b8.",
      "b8=N": "A knight they don't have to take — they can leave it and go after your a-pawn, and a knight and pawn against a rook is a struggle. A queen they must deal with: if the rook takes it, your king takes back."
    }
  },
  {
    id: "back-rank-cure", chapter: "endgame", concept: "backRank",
    title: "Make some air",
    fen: "3r2k1/5ppp/1R6/1p6/8/8/P4PPP/7K w - - 0 1", side: 1,
    ask: "Their rook is eyeing your back row, and your king has no escape square. Spend one move fixing that.",
    rule: "explicit", best: "h3", alsoOk: ["g3", "h4", "g4"],
    hint: "Give the king a hole to step into — the smallest pawn move will do. Which squares touch h1?",
    why: "One tiny pawn move (called <i>luft</i> — German for “air”) gives the king a square off the back row, and Rd1 is no longer mate. Strong players make this move almost automatically once heavy pieces start circling — it removes a whole category of disaster from the rest of the game.",
    alsoWhy: "That works too — any pawn move that gives the king a square to step into stops the mate. The habit is what matters, not the particular pawn.",
    misses: {
      "f3": "That pawn move doesn't help this king: from h1 its squares are g1, g2 and h2, and f3 frees none of them. Rd1 would still be checkmate.",
      "Kg1": "The king steps along the back row, but it's still walled in: Rd1 would be checkmate on g1 just the same.",
      "Rxb5": "A pawn grabbed — but look at their rook first: Rd1 would be checkmate, because your king has no square to step to."
    }
  }
];

/* ---------- judging an answer by its idea ---------- */

/* Is the piece on `sq` winnable, with any check set aside? A check
   makes every capture of theirs illegal for exactly one move, which is
   a reprieve, not safety — so "save your knight" is not answered by a
   check that leaves it hanging. The king is lifted off a scratch copy
   so the count can't hide behind it. */
function looseIgnoringCheck(g, sq) {
  if (!Chess.inCheck(g)) return Teach.isLoose(g, sq);
  var t = Chess.create(Chess.fen(g));
  t.board[t.kings[g.turn === 1 ? 0 : 1]] = 0;
  return Teach.isLoose(t, sq);
}

function accepts(lesson, g, move) {
  if (!lesson || !g || !move) return { ok: false };
  var san = Chess.toSAN(g, move).replace(/[+#]$/, "");
  var bestClean = (lesson.best || "").replace(/[+#]$/, "");
  if (san === bestClean) return { ok: true, best: true };
  if (lesson.alsoOk && lesson.alsoOk.indexOf(san) >= 0) return { ok: true, best: false };

  switch (lesson.rule) {
    case "explicit":
      return { ok: false };
    case "mate": {
      Chess.make(g, move);
      var mated = Chess.inCheck(g) && Chess.moves(g).length === 0;
      Chess.unmake(g);
      return { ok: mated };
    }
    case "fork": {
      var before = Teach.forks(g, g.turn).length;
      Chess.make(g, move);
      var fs = Teach.forks(g, -g.turn);
      Chess.unmake(g);
      var made = fs.filter(function (f) { return f.by === move.to && f.safe; });
      return { ok: made.length > 0 && fs.length > before };
    }
    case "pin": {
      Chess.make(g, move);
      var pins = Teach.lines(g, -g.turn).pins;
      Chess.unmake(g);
      return { ok: pins.some(function (p) { return p.by === move.to; }) };
    }
    case "skewer": {
      Chess.make(g, move);
      var sk = Teach.lines(g, -g.turn).skewers;
      Chess.unmake(g);
      return { ok: sk.some(function (s) { return s.by === move.to; }) };
    }
    case "win-material": {
      if (!move.capt) return { ok: false };
      /* the full exchange on that square has to come out ahead */
      return { ok: Teach.seeMove(g, move) >= Teach.GAIN };
    }
    case "safe": {
      /* the piece that was in danger is no longer winnable, and nothing
         else worth a piece was left hanging instead */
      var side = Math.sign(move.piece);
      Chess.make(g, move);
      var stillLoose = looseIgnoringCheck(g, move.to);
      var otherLoose = false;
      for (var sq = 0; sq < 128 && !otherLoose; sq++) {
        var p = g.board[sq];
        if (!Chess.onBoard(sq) || !p || Math.sign(p) !== side || sq === move.to) continue;
        if (Teach.VAL[Math.abs(p)] >= 300 && Math.abs(p) !== Chess.K && looseIgnoringCheck(g, sq)) otherLoose = true;
      }
      Chess.unmake(g);
      return { ok: !stillLoose && !otherLoose };
    }
  }
  return { ok: false };
}

/* feedback for a wrong move: the lesson's own words if it has them,
   otherwise let teach.js look at what the move actually allows */
function critique(lesson, g, move) {
  if (!lesson || !g || !move) return "Not quite — take another look.";
  var san = Chess.toSAN(g, move).replace(/[+#]$/, "");
  if (lesson.misses && lesson.misses[san]) return lesson.misses[san];
  var said = Teach.afterMove(g, move);
  for (var i = 0; i < said.length; i++) {
    if (said[i].concept === "hanging" || said[i].concept === "stalemate") return said[i].text;
  }
  /* The opening is a full board, so "the position is small enough to
     see all of it" would be untrue there. Say what the move did and
     what it didn't, in the terms the lesson is about. */
  if (lesson.chapter === "opening") return openingCritique(lesson, g, move);
  var noun = { fork: "a move that attacks two things at once",
               pin: "a line that freezes their piece against the king",
               skewer: "a line with the valuable piece in front",
               mate: "a check they cannot answer",
               "win-material": "a capture that costs you nothing",
               safe: "a square where nothing can take it" }[lesson.rule];
  return "Not quite — that's legal, but it isn't " + (noun || "the idea here") +
    ". Take another look; the position is small enough to see all of it.";
}
function openingCritique(lesson, g, move) {
  var kind = Math.abs(move.piece), side = Math.sign(move.piece);
  var home = side === 1 ? 0 : 7;
  if (lesson.concept === "castling") {
    return "That's playable, but your king is still standing in the middle with the centre open. " +
      "Which move tucks it away <i>and</i> brings a rook toward the middle in one go?";
  }
  var loose = Teach.looseFor(g, -side).filter(function (l) { return l.why === "undefended"; });
  var target = loose.length ? " Which of their pawns or pieces has nobody guarding it?" : "";
  if ((kind === Chess.N || kind === Chess.B) && Chess.rankOf(move.from) === home) {
    return "That develops a piece — good. But one move develops <i>and</i> makes a threat at the same time." + target;
  }
  if (kind === Chess.P) {
    return "A pawn move — but pieces before quiet pawn moves. Which knight or bishop can come out, and attack something as it does?";
  }
  if (kind === Chess.Q) {
    return "The queen is too valuable to lead with: every time they develop a piece by attacking her, they gain a move and you lose one.";
  }
  return "That doesn't bring a new piece into the game. Which knight or bishop can come out — and attack something as it does?";
}

/* ---------- progress: spacing, mastery, honesty ---------- */
var KEY = "chessroom_learn";
var DAY = 86400000;
/* a schedule can't usefully reach further than this, and a number past
   it in storage is a corruption, not a plan */
var MAX_INTERVAL = 3650, FAR = 4102444800000;   /* ten years; 1 Jan 2100 */

function blank() { return { v: 1, concepts: {}, lessons: {}, streak: 0, lastDay: 0, practised: 0 }; }

/* ---------- reading progress back, whatever is in there ----------
   localStorage is somebody else's text. A half-written save, a hand
   edit, an older version, or a value from a different app under the
   same key must never stop the Academy from opening — so everything is
   rebuilt field by field, kept only when it is the right type and in a
   sane range, and anything else quietly falls back to a fresh start for
   that one field. */
function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
function num(x, lo, hi, dflt) {
  return (typeof x === "number" && isFinite(x)) ? Math.max(lo, Math.min(hi, x)) : dflt;
}
function int(x, lo, hi, dflt) { var n = num(x, lo, hi, dflt); return Math.floor(n); }
var SAFE_KEY = /^[A-Za-z][A-Za-z0-9-]{0,39}$/;
function own(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
function cleanConcept(c) {
  var seen = int(c.seen, 0, 1e6, 0);
  return {
    ease: num(c.ease, 1.3, 5, 2.4),
    reps: int(c.reps, 0, 1000, 0),
    interval: num(c.interval, 0, MAX_INTERVAL, 0),
    due: num(c.due, 0, FAR, 0),
    seen: seen,
    right: int(c.right, 0, seen, 0),
    last: num(c.last, 0, FAR, 0)
  };
}
function clean(raw) {
  var p = blank(), k;
  if (!isObj(raw) || raw.v !== 1) return p;
  if (isObj(raw.concepts)) {
    for (k in raw.concepts) {
      if (!own(raw.concepts, k) || !SAFE_KEY.test(k) || !isObj(raw.concepts[k])) continue;
      p.concepts[k] = cleanConcept(raw.concepts[k]);
    }
  }
  if (isObj(raw.lessons)) {
    for (k in raw.lessons) {
      if (!own(raw.lessons, k) || !SAFE_KEY.test(k) || !isObj(raw.lessons[k])) continue;
      var tries = int(raw.lessons[k].tries, 0, 1e6, 0);
      p.lessons[k] = { tries: tries, solved: int(raw.lessons[k].solved, 0, tries, 0) };
    }
  }
  p.streak = int(raw.streak, 0, 1e5, 0);
  p.lastDay = int(raw.lastDay, 0, 1e6, 0);
  p.practised = int(raw.practised, 0, 1e9, 0);
  return p;
}
function load() {
  var text = null;
  try { text = isNode ? null : localStorage.getItem(KEY); } catch (e) { text = null; }
  try { return clean(JSON.parse(text || "null")); } catch (e) { return blank(); }
}
function save(p) {
  try { if (!isNode) localStorage.setItem(KEY, JSON.stringify(clean(p))); } catch (e) {}
}
/* the read-only questions below take whatever they're given */
function view(p) { return (isObj(p) && isObj(p.concepts) && isObj(p.lessons)) ? p : clean(p); }
function conceptOf(p, id) { return own(p.concepts, id) && isObj(p.concepts[id]) ? p.concepts[id] : null; }
function lessonOf(p, id) { return own(p.lessons, id) && isObj(p.lessons[id]) ? p.lessons[id] : null; }

/* ---------- grading ----------
   SM-2, trimmed to what a chess room needs. Confidence is the learner's
   own call, which keeps the schedule honest rather than flattering:

     "sure"  (I saw it)       q = 5  full interval
     "shaky" (half-guessed)   q = 3  interval halved
     "guess" (lucky guess)    q = 2  a lapse: start again tomorrow

   A lucky guess is a right answer and counts toward accuracy, but it is
   not knowledge yet, so it must never schedule further out than a half-
   guess does. A miss resets too, and comes back this session.

   Spacing only moves when a review was actually due. Solving a second
   fork lesson ten minutes after the first is practice — welcome, and
   counted in accuracy — but it isn't evidence the idea survived a gap,
   so it doesn't push the next review out. Lapses always count: finding
   out you don't know something is news whenever it happens. */
var QUALITY = { sure: 5, shaky: 3, guess: 2 };
function grade(p, lesson, correct, confidence, now) {
  now = num(now, 0, FAR, Date.now());
  if (!isObj(p)) p = blank();
  else if (!isObj(p.concepts) || !isObj(p.lessons)) {
    var fixed = clean(p);
    for (var k in fixed) if (own(fixed, k)) p[k] = fixed[k];
  }
  if (!lesson || !lesson.concept || !lesson.id) return p;
  var c = conceptOf(p, lesson.concept);
  if (!c) c = p.concepts[lesson.concept] = { ease: 2.4, reps: 0, interval: 0, due: now, seen: 0, right: 0, last: 0 };
  else { var cc = cleanConcept(c); for (var f in cc) if (own(cc, f)) c[f] = cc[f]; }
  var L = lessonOf(p, lesson.id);
  if (!L) L = p.lessons[lesson.id] = { tries: 0, solved: 0 };
  L.tries = int(L.tries, 0, 1e6, 0) + 1;
  L.solved = int(L.solved, 0, 1e6, 0);
  c.seen++;

  var q = !correct ? 0 : own(QUALITY, confidence) ? QUALITY[confidence] : 4;
  if (correct) { c.right++; L.solved++; }

  if (q < 3) {
    /* a lapse: the idea isn't secure yet */
    c.reps = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.interval = correct ? 1 : 0;            /* a guess returns tomorrow; a miss this session */
    c.due = now + c.interval * DAY;
    c.last = now;
  } else if (c.due <= now) {
    /* a real, due review: the schedule moves on */
    c.reps++;
    c.ease = Math.max(1.3, Math.min(5, c.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))));
    if (c.reps === 1) c.interval = 1;
    else if (c.reps === 2) c.interval = 3;
    else c.interval = Math.round(c.interval * c.ease) || 1;
    if (q === 3) c.interval = Math.max(1, Math.round(c.interval * 0.5));
    c.interval = Math.min(MAX_INTERVAL, c.interval);
    c.due = now + c.interval * DAY;
    c.last = now;
  }
  /* (a success before it was due: accuracy only, schedule untouched) */

  var today = Math.floor(now / DAY);
  if (p.lastDay !== today) {
    p.streak = (p.lastDay === today - 1) ? (int(p.streak, 0, 1e5, 0) + 1) : 1;
    p.lastDay = today;
  }
  p.practised = int(p.practised, 0, 1e9, 0) + 1;
  return p;
}

/* 0..1 — drives both the progress map and how quiet the live coach goes */
function mastery(p, concept) {
  p = view(p);
  var c = conceptOf(p, concept);
  if (!c || !(c.reps > 0)) return 0;
  var byReps = Math.min(1, c.reps / 4);
  var bySpacing = Math.min(1, num(c.interval, 0, MAX_INTERVAL, 0) / 14);
  var byAccuracy = c.seen > 0 ? Math.min(1, num(c.right, 0, c.seen, 0) / c.seen) : 0;
  var m = byReps * 0.4 + bySpacing * 0.35 + byAccuracy * 0.25;
  return isFinite(m) ? Math.max(0, Math.min(1, m)) : 0;
}

/* what to practise now: anything overdue, oldest first, then interleaved
   so two lessons on the same idea never sit back to back. A concept that
   lapsed (reps back to 0) still comes back — that is exactly when it
   needs to. */
function due(p, now) {
  p = view(p);
  now = num(now, 0, FAR, Date.now());
  var list = LESSONS.filter(function (l) {
    var c = conceptOf(p, l.concept), L = lessonOf(p, l.id);
    return c && c.seen > 0 && num(c.due, 0, FAR, 0) <= now && L && L.solved > 0;
  });
  list.sort(function (a, b) {
    return conceptOf(p, a.concept).due - conceptOf(p, b.concept).due;
  });
  return interleave(list);
}
function interleave(list) {
  var out = [], pool = list.slice();
  while (pool.length) {
    var i = 0;
    if (out.length) {
      while (i < pool.length && pool[i].concept === out[out.length - 1].concept) i++;
      if (i === pool.length) i = 0;
    }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/* the next unseen lesson on the path */
function next(p) {
  p = view(p);
  for (var i = 0; i < LESSONS.length; i++) {
    var L = lessonOf(p, LESSONS[i].id);
    if (!(L && L.solved > 0)) return LESSONS[i];
  }
  return null;
}

function stats(p) {
  p = view(p);
  var solved = 0, i;
  for (i = 0; i < LESSONS.length; i++) {
    var L = lessonOf(p, LESSONS[i].id);
    if (L && L.solved > 0) solved++;
  }
  return { solved: solved, total: LESSONS.length, streak: int(p.streak, 0, 1e5, 0),
           practised: int(p.practised, 0, 1e9, 0), due: due(p).length };
}

function byId(id) {
  for (var i = 0; i < LESSONS.length; i++) if (LESSONS[i].id === id) return LESSONS[i];
  return null;
}
function inChapter(id) {
  return LESSONS.filter(function (l) { return l.chapter === id; });
}

var Learn = {
  CHAPTERS: CHAPTERS, LESSONS: LESSONS,
  accepts: accepts, critique: critique,
  load: load, save: save, blank: blank, clean: clean, grade: grade,
  mastery: mastery, due: due, next: next, stats: stats,
  byId: byId, inChapter: inChapter, KEY: KEY
};
if (isNode) module.exports = Learn;
else root.Learn = Learn;
})(typeof self !== "undefined" ? self : this);
