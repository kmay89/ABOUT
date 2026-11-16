/* help.js — the help lamp's words, and the training wheels' eyes.

   A coach across a real table asks "what does that threaten?" far more
   often than they name a move. The room used to do only the second
   thing: tap 💡 and buy a move. This module is the first thing — the
   questions a coach asks, built from the position on the board — plus
   an honest account of what the other side's last move did, and the two
   small judgements the training wheels make before you move (what of
   yours can really be won, and where a lifted piece would be lost).

   It says nothing of its own. Every sentence is either a count the
   rules can check (how many checks you have), a question that names no
   answer, or something teach.js has already proved: a hanging piece is
   one the exchange count wins *and* that survives the capture being
   played out; a mate threat is a mate in one the rules confirm. When
   the teacher has nothing to say about a move, neither does the lamp —
   it says so and asks what the move prepares, rather than reaching for
   a principle and dressing it up as a reason.

   One rule is about money rather than truth. Help is priced by the odds
   (app.js oddsFor): a hint costs a mark when you are level or ahead and
   is free when you are behind. Naming a threat against you is a hint in
   all but name, so when the person asking is not behind (`reveal` is
   off), a fact that would name one of their pieces that can really be
   won is held back and becomes a question instead — "is everything of
   yours still guarded?" — and the priced chip beside it is the way to
   buy the answer. A mate threat is the one exception: always named,
   never charged. The room already draws the mate net for nothing on
   every check, and a coach who answered "is everything guarded?" while
   you walked into mate would be being cute, not kind.

   Pure functions over an engine.js game; no DOM, no state. Anything
   tried on a game is undone before returning. Tested by
   chess/tools/help-check.js. */
(function (root) {
"use strict";

var NODE = typeof module !== "undefined" && module.exports;
var Chess = NODE ? require("./engine.js") : root.Chess;
var Teach = NODE ? require("./teach.js") : root.Teach;

var P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
var NAMES = ["", "pawn", "knight", "bishop", "rook", "queen", "king"];
var WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
/* below a minor piece, a loose man is a pawn: worth learning to see,
   not worth a lamp lighting up over — the same floor teach.js's
   warnings use */
var WORTH = 300;
/* a lifted piece looks at no more than this many destinations: a queen
   in an open middlegame has 27, and the wheels must never be the reason
   a tap feels slow */
var HOT_MAX = 30;

function kindOf(p) { return p < 0 ? -p : p; }
function colorOf(p) { return p > 0 ? 1 : -1; }
function sqName(sq) { return Chess.sqName(sq); }
function count(n, one, many) { return (n < WORDS.length ? WORDS[n] : String(n)) + " " + (n === 1 ? one : many); }
function onBoard(sq) { return (sq & 0x88) === 0; }

/* `side`'s pieces worth a minor or more that can really be won: the
   exchange count wins them, and the capture survives being played out
   (teach.js reallyLost) — asked the right way round for whoever is to
   move. Highest first. */
function inDanger(g, side) {
  var out = [], list = Teach.looseFor(g, side);
  for (var i = 0; i < list.length; i++) {
    var l = list[i];
    if (l.value < WORTH) continue;
    var lost = g.turn === side ? Teach.reallyLostIfTheyMoved(g, l) : Teach.reallyLost(g, l);
    if (lost) out.push(l);
  }
  return out;
}

/* ---------- Think: the questions a coach asks ----------
   At most three lines, never a move. The first is always the habit the
   rules page teaches (LEARN[11]: checks, captures, threats) made
   concrete with real counts; the second points at their last move; the
   third is one question about the position. Loose pieces are counted,
   not located, unless the person is behind (`reveal`), when the room
   already gives that word away for free. */
function think(g, side, opts) {
  opts = opts || {};
  var lines = [], squares = [];
  var ms = g.turn === side ? Chess.moves(g) : [];
  var checks = 0, caps = 0, i;
  for (i = 0; i < ms.length; i++) {
    var m = ms[i];
    if (m.capt || (m.flags & Chess.F_EP)) caps++;
    Chess.make(g, m);
    if (Chess.inCheck(g)) checks++;
    Chess.unmake(g);
  }
  if (g.turn !== side) lines.push("It isn't your move yet — watch what they do, then ask what it attacks.");
  else if (!checks && !caps) lines.push("You have <b>no checks</b> and <b>no captures</b> — so the question is which piece of yours is doing least.");
  else lines.push("You have <b>" + count(checks, "check", "checks") + "</b> and <b>" + count(caps, "capture", "captures") +
    "</b> to look at — the forcing moves first, every time.");

  if (opts.last && opts.last.san) {
    lines.push("Their last move was <b>" + opts.last.san + "</b> — what does it attack? <i>(👁 Their idea)</i>");
  }

  /* what can be taken, both ways */
  var mine = inDanger(g, side), theirs = inDanger(g, -side);
  if (mine.length || theirs.length) {
    if (opts.reveal) {
      var bits = [];
      if (mine.length) bits.push("your " + NAMES[kindOf(mine[0].piece)] + " on " + sqName(mine[0].sq) + " can be won");
      if (theirs.length) bits.push("their " + NAMES[kindOf(theirs[0].piece)] + " on " + sqName(theirs[0].sq) + " is loose");
      lines.push(bits.join("; ").replace(/^./, function (c) { return c.toUpperCase(); }) + ".");
      if (mine.length) squares.push(mine[0].sq);
      if (theirs.length) squares.push(theirs[0].sq);
    } else {
      lines.push("Something can be taken: " +
        (mine.length ? "<b>" + count(mine.length, "piece", "pieces") + " of yours</b>" : "") +
        (mine.length && theirs.length ? " and " : "") +
        (theirs.length ? "<b>" + count(theirs.length, "piece", "pieces") + " of theirs</b>" : "") +
        (mine.length + theirs.length === 1 ? " is" : " are") + " loose. Which?");
    }
  }
  if (lines.length < 3) {
    var q = positionQuestion(g, side);
    if (q) { lines.push(q.text); if (q.sq != null) squares.push(q.sq); }
  }
  return { lines: lines.slice(0, 3), squares: squares };
}

/* One question about the position, the most useful of four. Each is a
   fact the board can check, put as a question so the thinking stays
   yours. */
function positionQuestion(g, side) {
  var queens = 0, own = [], sq, p;
  for (sq = 0; sq < 128; sq++) {
    if (!onBoard(sq)) continue;
    p = g.board[sq];
    if (!p) continue;
    if (kindOf(p) === Q) queens++;
    if (colorOf(p) === side && kindOf(p) !== K && kindOf(p) !== P) own.push(sq);
  }
  var home = side === 1 ? 0 : 7, kSq = g.kings[side === 1 ? 0 : 1], tSq = g.kings[side === 1 ? 1 : 0];
  /* an ending: the king becomes a piece */
  if (!queens && own.length <= 2) return { text: "In an ending the king is a piece — is yours working?", sq: kSq };
  /* the opening: a man still on his first square */
  if (g.full <= 12) {
    var waiting = own.filter(function (s) {
      var k = kindOf(g.board[s]);
      return (k === N || k === B) && (s >> 4) === home;
    });
    if (waiting.length) return { text: "Which piece of yours hasn't moved yet?", sq: null };
  }
  /* the king in the middle, past the opening */
  var kf = kSq & 7, tf = tSq & 7;
  if (queens && g.full > 8 && (kSq >> 4) === home && kf >= 3 && kf <= 5) {
    var theyCastled = ((tSq >> 4) === (side === 1 ? 7 : 0)) && (tf <= 2 || tf >= 6);
    return { text: "Your king is still in the middle" + (theyCastled ? "; theirs is castled." : ".") + " Is it safe there?", sq: kSq };
  }
  /* the quietest piece: honest about ties ("one of"), and only asked
     when it really is doing little */
  var least = Infinity, who = [];
  own.forEach(function (s) {
    var n = Teach.attacksFrom(g, s).length;
    if (n < least) { least = n; who = [s]; } else if (n === least) who.push(s);
  });
  if (who.length && least <= 4) {
    var s0 = who[0];
    return { text: (who.length === 1 ? "Your " : "One of your quietest pieces is the ") + NAMES[kindOf(g.board[s0])] + " on " + sqName(s0) +
      (who.length === 1 ? " reaches the fewest squares of all your pieces" : ", reaching") + " (" + least + "). Can it do more?", sq: s0 };
  }
  return null;
}

/* ---------- Their idea: what a move did, in true words ----------
   teach.js writes from the mover's chair ("you come out ahead", "they
   must answer"); told to the other player, the pronouns turn round.
   Every pronoun the explainer uses is plural, so the verbs agree either
   way. */
var FLIP = { you: "they", your: "their", yours: "theirs", they: "you", their: "your", theirs: "yours", them: "you" };
function flip(text) {
  return String(text).replace(/\b(you|your|yours|they|their|theirs|them)\b/gi, function (w) {
    var to = FLIP[w.toLowerCase()];
    return w.charAt(0) === w.charAt(0).toUpperCase() ? to.charAt(0).toUpperCase() + to.slice(1) : to;
  });
}
function cap1(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
/* the facts explainMove joined, apart again — each is held back or kept
   on its own */
function splitFacts(text) {
  return String(text).split(/ Also: /).map(function (t, i) { return i ? cap1(t) : t; });
}
var TACTIC = { fork: 1, pin: 1, skewer: 1, hanging: 1, mateThreat: 1, sacrifice: 1, trade: 1, checkmate: 1, promotion: 1 };

/* `pre`: the position before `m`, with its history (a recapture is told
   as the end of an exchange, and only the history knows it was one).
   `side`: the person asking. opts: { reveal, reason (the book's line
   for this move), plan (the engine's line, SANs, starting with m),
   hush (map of `side`'s squares that must not be named) }.
   Returns { text, squares, line: {from, to, kind}, mate, concept,
   asked, quiet }. */
function theirs(pre, m, side, opts) {
  opts = opts || {};
  var mover = colorOf(m.piece), san = Chess.toSAN(pre, m).replace(/[+#]$/, "");
  var other = mover !== side;
  var ex = null;
  try { ex = Teach.explainMove(pre, m); } catch (e) { ex = null; }

  /* a mate threat against the listener, made by this move or still
     standing after it: always named */
  var mate = null;
  Chess.make(pre, m);
  try {
    if (other && !Chess.inCheck(pre, side) && Chess.moves(pre).length) {
      var mt = Teach.mateThreat(pre, mover);
      if (mt) mate = mt;
    }
  } finally { Chess.unmake(pre); }

  var hush = opts.hush || {}, hushed = Object.keys(hush).map(function (k) { return sqName(+k); });
  var facts = ex ? splitFacts(ex.text) : [], kept = [], asked = false;
  facts.forEach(function (f) {
    var mateFact = /^Threatens mate/.test(f);
    if (other && !opts.reveal && !mateFact &&
        hushed.some(function (n) { return new RegExp("\\b" + n + "\\b").test(f); })) { asked = true; return; }
    kept.push(other ? flip(f) : f);
  });
  if (mate && !kept.some(function (f) { return /mate/.test(f); })) {
    kept.push("It threatens mate: <b>" + mate.san.replace(/#$/, "") + "</b> next would be checkmate unless you stop it.");
  }

  var parts = [];
  /* the book's reason first: it was written for this exact move */
  if (opts.reason) {
    parts.push(opts.reason);
    /* and the teacher's sentence only when it adds a tactic — "develops
       the knight" twice over says it once too often */
    if (ex && TACTIC[ex.concept]) parts = parts.concat(kept);
    else if (mate) parts.push(kept[kept.length - 1]);
  } else {
    parts = parts.concat(kept);
  }
  if (asked) parts.push("Is everything of yours still guarded?");
  var quiet = !parts.length;
  if (quiet) parts.push("A quiet move — no capture, no check, nothing the teacher can prove it threatens yet. What might it prepare?");
  if (opts.plan && opts.plan.length > 2 && opts.plan[0].replace(/[+#]$/, "") === san) {
    parts.push("<i>" + (other ? "The coach" : "The engine") + " was counting on " + opts.plan.slice(1, 3).join(" ") + ".</i>");
  }

  /* the line on the board: the threat when one was named, else the move */
  var jumps = kindOf(m.piece) === N;
  var line = { from: m.from, to: m.to, kind: "run", knight: jumps };
  if (mate) line = { from: mate.move.from, to: mate.move.to, kind: "threat", knight: kindOf(mate.move.piece) === N };
  else if (ex && TACTIC[ex.concept] && !asked && ex.squares.length > 2) {
    /* the threat drawn from the man that makes it: the moved piece when
       it really hits the square named, otherwise the pair the teacher
       named (a line it opened, a mate it threatens) */
    var t = ex.squares[2], hits = false;
    Chess.make(pre, m);
    try { hits = Teach.attacksFrom(pre, m.to).indexOf(t) >= 0; } finally { Chess.unmake(pre); }
    if (hits) line = { from: m.to, to: t, kind: "threat", knight: jumps };
    else if (ex.squares.length > 3) {
      var who = pre.board[ex.squares[2]];
      line = { from: ex.squares[2], to: ex.squares[3], kind: "threat",
               knight: (ex.squares[2] === m.from || ex.squares[2] === m.to ? jumps : kindOf(who) === N) };
    }
  }
  var squares = ex && !asked ? ex.squares.slice() : [m.from, m.to];
  return {
    text: "<b>" + san + "</b> — " + parts.join(" "),
    squares: squares, line: line, mate: !!mate, mateSan: mate ? mate.san : null,
    concept: ex ? ex.concept : null, asked: asked, quiet: quiet
  };
}

/* the squares of `side`'s men that must not be named for free right
   now: every piece the wheels would mark */
function hushFor(g, side) {
  var out = {};
  inDanger(g, side).forEach(function (l) { out[l.sq] = true; });
  return out;
}

/* ---------- training wheels ----------
   What is in danger before you move: your pieces that can really be
   won (at most three, highest first, each with the man that would take
   it), and a mate threat against you. Asked with `side` to move. */
function danger(g, side) {
  var list = inDanger(g, side).slice(0, 3).map(function (l) {
    return { sq: l.sq, from: l.from, piece: l.piece, value: l.value };
  });
  var mate = null;
  if (g.turn === side && !Chess.inCheck(g)) {
    var mt = Teach.mateThreat(g, -side);
    if (mt) mate = { from: mt.move.from, to: mt.move.to, san: mt.san };
  }
  return { pieces: list, mate: mate };
}

/* Where a lifted piece would be lost. A capture is hot when the
   exchange on that square costs material (the same count the teacher
   trusts); a quiet move is hot when the piece, once there, can be won
   and the win survives the capture being played out. A king is never
   hot — the rules already keep it off attacked squares. Bounded: past
   HOT_MAX destinations it stops looking and says so (`partial`). */
function hot(g, moves) {
  var out = { hot: [], hotCapt: [], partial: false };
  var list = moves || [];
  if (list.length > HOT_MAX) { list = list.slice(0, HOT_MAX); out.partial = true; }
  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    if (kindOf(m.piece) === K) continue;
    var isCapt = !!(m.capt || (m.flags & Chess.F_EP));
    if (isCapt && !m.promo) {
      if (Teach.seeMove(g, m) <= -Teach.GAIN) out.hotCapt.push(m.to);
      continue;
    }
    Chess.make(g, m);
    var lost = false;
    try {
      var info = Teach.looseInfo(g, m.to);
      lost = !!info && Teach.reallyLost(g, info, isCapt ? Teach.VAL[kindOf(m.capt)] : 0);
    } finally { Chess.unmake(g); }
    if (lost) (isCapt ? out.hotCapt : out.hot).push(m.to);
  }
  return out;
}

var Help = { think: think, theirs: theirs, flip: flip, danger: danger, hot: hot, hushFor: hushFor,
             WORTH: WORTH, HOT_MAX: HOT_MAX };
if (NODE) module.exports = Help;
else root.Help = Help;
})(typeof self !== "undefined" ? self : this);
