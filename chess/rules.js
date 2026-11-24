/* rules.js — the rules, shown.

   The rules of chess used to be twelve cards of words laid over the
   board: "the knight moves in an L: two squares one way, then one
   square sideways". Nobody learns a knight from that sentence. They
   learn it by seeing one jump, and then by jumping one themselves.

   So this is the same course with the words taken out and the board
   put in. Thirteen short scenes, each made of two kinds of step:

     show   the board does it. A piece's reach lights up, the piece
            moves, and one short line says what was just seen. Nothing
            to read before something has happened.
     do     your turn. Take the pawns with the rook; walk the king round
            the rook's fire; castle; mate in one. The board is the
            question and the move is the answer.

   What it keeps to:
   - One line a step, short enough to read at a glance (SAY_MAX). The
     line names what the eye has just been shown; it never explains
     something the board has not.
   - Every position is real. Every demonstration is replayed here by
     the engine and has to be legal; every task has to be possible (it
     is solved by search before it ships), and a hint is always the
     first move of a shortest solution from wherever you are now.
   - A piece on its own is on its own. To learn the rook there is a
     rook, and pawns to take, and nothing else: no kings in the corner
     to wonder about. Those positions are `free` — White simply moves
     again — and they are built so that the engine's idea of a legal
     move is exactly the piece's own way of moving.
   - A wrong answer is shown, not scolded: the move that stalemates is
     played, the board says "no moves, no check: a draw", and it is
     yours again.

   Pure: no DOM, no clock; the one store is
   localStorage["chessroom_rules"] = { v: 1, done: { id: 1 }, at: id }.
   app.js ("the rules, shown") does the showing;
   chess/tools/rules-check.js holds every scene to the above. */
(function (root) {
"use strict";

var Chess = root.Chess || (typeof require === "function" ? require("./engine.js") : null);

var VERSION = 1, KEY = "chessroom_rules", SAY_MAX = 72;

/* A scene: id, name, a mark for its dot (a piece kind 1..6, or the sign
   chess itself writes for the idea, or a small picture of it: one
   character, so it fits a dot), and its steps.
   A step: say; fen (omitted: carry on from where the last step ended);
   free (White moves again and again); then either
     show — reach: a square whose piece's moves are lit; play: the moves
            shown, in SAN; plus marks: rings (squares circled), arrows
            ([from, to, tone]), danger (true: every square Black attacks),
            cage (a king whose barred squares are lit once the moves end)
     do   — one of  { clear: true }      take every black man
                    { reach: "c7" }      get there
                    { play: ["O-O"] }    one of these moves
                    { mate: true }       any move that is checkmate
                    { any: true }        any legal move (out of check)
            and no: the line for an answer that is not it. */
var COURSE = [
  { id: "goal", name: "The idea", mark: "★", steps: [
    { show: true, fen: "7k/8/5K2/8/8/8/8/6Q1 w - - 0 1", rings: ["h8"],
      say: "The whole game is about one piece: the king." },
    { show: true, play: ["Qg7#"], cage: "h8",
      say: "Trap him so he can't get away. Checkmate: you win!" }
  ] },

  { id: "rook", name: "The rook", mark: 4, steps: [
    { show: true, free: true, fen: "8/8/8/8/3R4/8/8/8 w - - 0 1", reach: "d4",
      say: "The rook slides in straight lines." },
    { show: true, free: true, play: ["Rd8", "Rh8"],
      say: "Up, down or sideways, as far as it likes." },
    { do: { clear: true }, free: true, fen: "8/8/p4p2/8/8/8/5p2/R7 w - - 0 1",
      say: "Your turn! Take all three pawns." }
  ] },

  { id: "bishop", name: "The bishop", mark: 3, steps: [
    { show: true, free: true, fen: "8/8/8/8/3B4/8/8/8 w - - 0 1", reach: "d4",
      say: "The bishop slides on the diagonals." },
    { show: true, free: true, play: ["Bg7", "Bh8"],
      say: "It stays on one colour of square all game." },
    { do: { clear: true }, free: true, fen: "8/8/3p4/8/5p2/p7/8/2B5 w - - 0 1",
      say: "Your turn! Take all three pawns." }
  ] },

  { id: "queen", name: "The queen", mark: 5, steps: [
    { show: true, free: true, fen: "8/8/8/8/3Q4/8/8/8 w - - 0 1", reach: "d4",
      say: "The queen is a rook and a bishop in one." },
    { show: true, free: true, play: ["Qd8", "Qh4"],
      say: "Straight or diagonal: the strongest piece there is." },
    { do: { clear: true }, free: true, fen: "8/3p4/8/8/p6p/8/8/3Q4 w - - 0 1",
      say: "Your turn! Take all three pawns." }
  ] },

  { id: "knight", name: "The knight", mark: 2, steps: [
    { show: true, free: true, fen: "8/8/8/8/3N4/8/8/8 w - - 0 1", reach: "d4",
      say: "The knight jumps in an L: two, then one to the side." },
    { show: true, free: true, fen: "8/8/8/8/8/8/PPP5/1N6 w - - 0 1", reach: "b1", play: ["Nc3"],
      say: "It is the only piece that hops over others." },
    { do: { clear: true }, free: true, fen: "8/8/8/4p3/2p5/8/3p4/1N6 w - - 0 1",
      say: "Your turn! Hop from pawn to pawn." }
  ] },

  { id: "king", name: "The king", mark: 6, steps: [
    { show: true, free: true, fen: "8/8/8/8/3K4/8/8/8 w - - 0 1", reach: "d4", play: ["Ke5"],
      say: "The king takes one step, any way he likes." },
    { show: true, free: true, fen: "4r3/8/8/8/3K4/8/8/8 w - - 0 1", reach: "d4", danger: true,
      say: "But never onto a square where he could be taken." },
    { do: { reach: "c7" }, free: true, fen: "4r3/8/8/8/3K4/8/8/8 w - - 0 1", danger: true, rings: ["c7"],
      say: "Your turn! Walk to the ring. Keep out of the red.",
      no: "Not there: the rook is watching that square." }
  ] },

  { id: "pawn", name: "The pawn", mark: 1, steps: [
    { show: true, free: true, fen: "8/8/8/8/8/8/4P3/8 w - - 0 1", reach: "e2", play: ["e4"],
      say: "A pawn walks forward. From home it may go two." },
    { show: true, free: true, fen: "8/8/8/3p1n2/4P3/8/8/8 w - - 0 1", reach: "e4", play: ["exf5"],
      say: "It takes one step diagonally, never straight." },
    { do: { play: ["dxe5"] }, free: true, fen: "8/8/8/3pn3/3P4/8/8/8 w - - 0 1",
      say: "Your turn! Take the knight.",
      no: "Pawns take diagonally: look one square up and across." },
    { do: { reach: "c8" }, free: true, fen: "8/8/8/8/8/8/2P5/8 w - - 0 1", rings: ["c8"],
      say: "Now march to the far side…", won: "…and the pawn becomes a queen!" }
  ] },

  { id: "check", name: "Check", mark: "+", steps: [
    { show: true, fen: "R3r1k1/5pp1/7p/8/8/8/3B4/4K3 w - - 0 1", arrows: [["e8", "e1", "threat"]],
      say: "Check! The king is attacked. You must fix it." },
    { show: true, fen: "R3r1k1/5pp1/7p/8/8/8/3B4/4K3 w - - 0 1", play: ["Kf1"],
      say: "One: step away." },
    { show: true, fen: "R3r1k1/5pp1/7p/8/8/8/3B4/4K3 w - - 0 1", play: ["Be3"],
      say: "Two: put something in the way." },
    { show: true, fen: "R3r1k1/5pp1/7p/8/8/8/3B4/4K3 w - - 0 1", play: ["Rxe8+"],
      say: "Three: take the attacker." },
    { do: { any: true }, fen: "4k3/8/8/8/7b/5N2/6P1/4K3 w - - 0 1", arrows: [["h4", "e1", "threat"]],
      say: "Your turn! You are in check. Get safe." }
  ] },

  { id: "mate", name: "Checkmate", mark: "#", steps: [
    { show: true, fen: "6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1", play: ["Ra8#"], cage: "g8",
      say: "Check, and no way out: that is checkmate." },
    { do: { mate: true }, fen: "k7/ppp5/8/8/8/8/8/4K2R w - - 0 1",
      say: "Your turn! Checkmate in one move.",
      no: "Not yet: the king still has a way out." }
  ] },

  { id: "castle", name: "Castling", mark: "\u2194\uFE0E", steps: [
    { show: true, fen: "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", play: ["O-O"],
      say: "Castling: the king goes two, the rook hops over." },
    { do: { play: ["O-O", "O-O-O"] }, fen: "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1",
      say: "Your turn! Castle: move your king two squares.",
      no: "Castling is the king's move: two squares toward a rook." }
  ] },

  { id: "passing", name: "En passant", mark: "\u2197\uFE0E", steps: [
    { show: true, fen: "4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1", play: ["d5", "exd6"],
      say: "A pawn that runs past yours can be caught, right away." },
    { do: { play: ["dxc6"] }, fen: "4k3/8/8/2pP4/8/8/8/4K3 w - c6 0 1", rings: ["c6"],
      say: "Your turn! Catch the pawn that just ran past.",
      no: "Take it as if it had moved one square: go to the ring." }
  ] },

  { id: "draw", name: "A draw", mark: "½", steps: [
    { show: true, fen: "k7/8/1K6/8/8/8/2Q5/8 w - - 0 1", play: ["Qc7"], cage: "a8",
      say: "No move, but no check: stalemate. Nobody wins." },
    { do: { mate: true }, fen: "k7/3Q4/1K6/8/8/8/8/8 w - - 0 1",
      say: "Your turn! Checkmate. Don't let it be a draw.",
      no: "Not mate yet. Look for a check with no way out.",
      stale: "Stalemate! No moves and no check: a draw. Try again." }
  ] },

  { id: "start", name: "A good start", mark: "\u25B6\uFE0E", steps: [
    { show: true, fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", play: ["e4", "e5"],
      say: "Start with a pawn in the middle." },
    { show: true, play: ["Nf3", "Nc6"], say: "Bring out your knights…" },
    { show: true, play: ["Bc4", "Bc5"], say: "…and your bishops." },
    { show: true, play: ["O-O"], say: "Then castle. Your king is safe. Now play!" }
  ] }
];

/* ---------- small things ---------- */
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function plain(san) { return String(san).replace(/[+#?!]+$/, ""); }
function sq(name) { return Chess.sqIndex(name); }
function index(id) {
  for (var i = 0; i < COURSE.length; i++) if (COURSE[i].id === id) return i;
  return -1;
}
function clampScene(i) {
  i = Math.round(+i);
  if (!(i > 0)) return 0;
  return i > COURSE.length - 1 ? COURSE.length - 1 : i;
}
function scene(i) { return COURSE[clampScene(i)]; }

/* White to move again, and nothing to catch in passing: the position a
   free step is in after any move */
function freed(fen) {
  var p = String(fen).split(/\s+/);
  p[1] = "w"; p[3] = "-";
  return p.join(" ");
}
/* the position after a move, as the next question */
function after(fen, m, free) {
  var g = Chess.create(fen);
  Chess.play(g, m);
  var out = Chess.fen(g);
  return free ? freed(out) : out;
}
function findSAN(g, san) {
  var want = plain(san), list = Chess.moves(g);
  for (var i = 0; i < list.length; i++) if (plain(Chess.toSAN(g, list[i])) === want) return list[i];
  return null;
}

/* ---------- a scene, laid out ----------
   Every step with its starting position worked out (a step without one
   carries on from the end of the step before), and every shown move
   found by the engine. A move that is not legal is an error here, at
   load, rather than a piece that does not move in front of a child. */
var laid = {};
function steps(i) {
  var sc = scene(i);
  if (laid[sc.id]) return laid[sc.id];
  var out = [], fen = null;
  sc.steps.forEach(function (s, n) {
    var st = { n: n, say: s.say, free: !!s.free, show: !!s.show, goal: s.do || null,
               reach: s.reach || null, rings: (s.rings || []).slice(), arrows: (s.arrows || []).map(function (a) { return a.slice(); }),
               danger: !!s.danger, cage: s.cage || null, no: s.no || "", won: s.won || "", stale: s.stale || "", line: [] };
    st.fen = s.fen || fen;
    if (!st.fen) throw new Error("rules: " + sc.id + " step " + n + " has no position");
    var at = st.fen;
    (s.play || []).forEach(function (san) {
      var g = Chess.create(at), m = findSAN(g, san);
      if (!m) throw new Error("rules: " + sc.id + " step " + n + ": " + san + " is not a move in " + at);
      var next = after(at, m, st.free);
      st.line.push({ san: plain(Chess.toSAN(g, m)), from: m.from, to: m.to, fen: at, next: next });
      at = next;
    });
    st.end = at;
    fen = at;
    out.push(st);
  });
  laid[sc.id] = out;
  return out;
}
function step(i, n) {
  var list = steps(i);
  n = Math.round(+n);
  return list[!(n > 0) ? 0 : n > list.length - 1 ? list.length - 1 : n];
}

/* ---------- what the board shows ---------- */
/* where the piece on a square may go, takes apart from walks */
function reach(fen, name) {
  var g = Chess.create(fen), from = typeof name === "number" ? name : sq(name), out = { from: from, to: [], takes: [] }, seen = {};
  Chess.movesFrom(g, from).forEach(function (m) {
    if (seen[m.to]) return;                      /* four promotions are one square */
    seen[m.to] = 1;
    (m.capt || (m.flags & Chess.F_EP) ? out.takes : out.to).push(m.to);
  });
  return out;
}
/* every square Black attacks (and does not stand on): where a king may not step */
function danger(fen) {
  var g = Chess.create(fen), out = [];
  for (var s = 0; s < 128; s++) {
    if (s & 0x88) continue;
    if (g.board[s] < 0) continue;
    if (Chess.attacked(g, s, Chess.BLACK)) out.push(s);
  }
  return out;
}
/* the squares beside a king that it may not step onto because the other
   side attacks them: the bars of the cage, for a mate or a stalemate */
function cage(fen, name) {
  var g = Chess.create(fen), k = typeof name === "number" ? name : sq(name), side = g.board[k] > 0 ? Chess.WHITE : Chess.BLACK, out = [];
  [-17, -16, -15, -1, 1, 15, 16, 17].forEach(function (d) {
    var s = k + d;
    if (s & 0x88) return;
    if (g.board[s] * side > 0) return;                 /* its own man stands there: blocked, not barred */
    /* seen through the king itself: a rook checking along a rank bars the square behind him too */
    var was = g.board[k]; g.board[k] = 0;
    var hit = Chess.attacked(g, s, -side);
    g.board[k] = was;
    if (hit) out.push(s);
  });
  return out;
}
/* how many black men are left to take (a king is never one of them) */
function left(fen) {
  var g = Chess.create(fen), n = 0;
  for (var s = 0; s < 128; s++) if (!(s & 0x88) && g.board[s] < 0 && g.board[s] !== -Chess.K) n++;
  return n;
}

/* ---------- your turn ---------- */
/* Is this move an answer? → { ok, done, fen (the position now), say,
   way, undo }. A move that is fine but not the last one (two pawns
   still to take) is ok and not done. `undo` marks a wrong answer worth
   seeing played before it is taken back (a stalemate). */
function attempt(st, fen, m) {
  var goal = st.goal, g = Chess.create(fen), san = plain(Chess.toSAN(g, m));
  var next = after(fen, m, st.free), out = { ok: false, done: false, fen: fen, say: st.no || "", way: "", undo: false, san: san };
  if (!goal) return out;
  if (goal.clear) {
    out.ok = true; out.fen = next; out.done = left(next) === 0;
  } else if (goal.reach) {
    out.ok = true; out.fen = next; out.done = m.to === sq(goal.reach);
  } else if (goal.play) {
    out.ok = goal.play.map(plain).indexOf(san) >= 0;
    if (out.ok) { out.fen = next; out.done = true; }
  } else if (goal.mate) {
    var g2 = Chess.create(next), s2 = Chess.status(g2);
    out.ok = s2.reason === "checkmate";
    if (out.ok) { out.fen = next; out.done = true; }
    else if (s2.reason === "stalemate") { out.say = st.stale || st.no; out.undo = true; out.shown = next; }
  } else if (goal.any) {
    out.ok = true; out.done = true; out.fen = next;
    /* which of the three ways out it was */
    out.way = Math.abs(m.piece) === Chess.K ? "away" : m.capt ? "took" : "blocked";
  }
  if (out.ok) out.say = out.done ? (st.won || "") : "";
  return out;
}
/* the answers to a step with one move in it */
function answers(st) {
  var g = Chess.create(st.fen), out = [];
  if (!st.goal || st.goal.clear || st.goal.reach) return out;
  Chess.moves(g).forEach(function (m) {
    var r = attempt(st, st.fen, m);
    if (r.ok && r.done) out.push(r.san);
  });
  return out;
}
/* A shortest way to finish from here, as moves: a search over the few
   positions a lone piece can reach. Null if there is none. */
function solve(st, fen) {
  fen = fen || st.fen;
  if (!st.goal) return null;
  var seen = {}, queue = [{ fen: fen, path: [] }], head = 0;
  seen[fen.split(" ")[0]] = 1;
  while (head < queue.length && head < 6000) {
    var cur = queue[head++], g = Chess.create(cur.fen), list = Chess.moves(g);
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.promo && Math.abs(m.promo) !== Chess.Q) continue;
      var r = attempt(st, cur.fen, m);
      if (!r.ok) continue;
      var path = cur.path.concat([{ from: m.from, to: m.to, san: r.san }]);
      if (r.done) return path;
      var k = r.fen.split(" ")[0];
      if (seen[k] || path.length > 12) continue;
      seen[k] = 1;
      queue.push({ fen: r.fen, path: path });
    }
  }
  return null;
}
/* the next move of that way: what Help points at */
function hint(st, fen) {
  var p = solve(st, fen);
  return p && p.length ? p[0] : null;
}

/* ---------- what you have done ---------- */
function fresh() { return { v: VERSION, done: {}, at: COURSE[0].id }; }
function clean(raw) {
  var s = fresh();
  if (!raw || typeof raw !== "object") return s;
  if (raw.done && typeof raw.done === "object") COURSE.forEach(function (c) { if (own(raw.done, c.id) && raw.done[c.id]) s.done[c.id] = 1; });
  if (typeof raw.at === "string" && index(raw.at) >= 0) s.at = raw.at;
  return s;
}
function load(get) {
  try { return clean(JSON.parse(get(KEY) || "null")); } catch (e) { return fresh(); }
}
function save(s, set) { try { set(KEY, JSON.stringify(clean(s))); } catch (e) {} }
function finish(s, id) {
  s = clean(s);
  if (index(id) >= 0) s.done[id] = 1;
  var n = index(id) + 1;
  s.at = COURSE[n < COURSE.length ? n : COURSE.length - 1].id;
  return s;
}
function count(s) { s = clean(s); return Object.keys(s.done).length; }
/* where to pick the course up: the first scene not yet done, or the start */
function resume(s) {
  s = clean(s);
  for (var i = 0; i < COURSE.length; i++) if (!s.done[COURSE[i].id]) return i;
  return 0;
}

var Rules = {
  VERSION: VERSION, KEY: KEY, SAY_MAX: SAY_MAX, COURSE: COURSE,
  index: index, scene: scene, steps: steps, step: step,
  freed: freed, after: after, findSAN: findSAN, plain: plain,
  reach: reach, danger: danger, cage: cage, left: left,
  attempt: attempt, answers: answers, solve: solve, hint: hint,
  fresh: fresh, clean: clean, load: load, save: save, finish: finish, count: count, resume: resume
};

if (typeof module !== "undefined" && module.exports) module.exports = Rules;
else root.Rules = Rules;
})(typeof self !== "undefined" ? self : this);
