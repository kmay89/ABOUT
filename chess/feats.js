/* feats.js — things you have done on the board.

   Most achievement walls are a record of attendance: open the app seven
   days running, change your avatar, buy something. People mock them
   because they mean nothing. A feat here is a sentence about chess that
   the rules or the engine can vouch for — the piece that gave mate is
   read off the last move, a fork off the teaching eyes (teach.js only
   calls a fork a fork when it wins something whatever they reply), a
   comeback off the coach's own evaluation of the position. So the
   cabinet is a portrait of the chess you have played, and nothing in it
   can be earned by turning up.

   Each feat is earned the first time it is true, said once on the end
   card, and kept with the date and the game it happened in. The ones
   not done yet are written as a plain sentence, never a greyed trophy:
   "a checkmate with a knight" is the kind of thing a coach sets as
   homework, and the lobby's next step may name one when nothing nearer
   is waiting. There are no tiers of metal, no points, no rarity.

   Where feats can be earned: any game with a "you" in it — against a
   coach, rated or not, and against a friend nearby (the rules are the
   same rules; the rating is still untouched). Two people sharing one
   screen are both "you", so a feat there would be a feat against
   yourself, and none is given. The few that need the coach's eye — a
   comeback (its evaluation), a game without a slip (its look-back) —
   are coach games only, and say so.

   Pure: the page passes the finished game in, node checks it
   (chess/tools/feats-check.js). The store is
   localStorage["chessroom_feats"] = { v: 1, done: { id: { at, game } } }. */
/* global module, require */
(function (root) {
"use strict";

var Chess = root.Chess;
if (!Chess && typeof require === "function") { try { Chess = require("./engine.js"); } catch (e) { Chess = null; } }

var VERSION = 1, KEY = "chessroom_feats";
var P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;

/* `scope` says when a feat is judged: "game" when the game ends,
   "after" when the coach's look-back has measured it. `tier` is the
   title (rating.js TITLES index) at which it is a fair thing to ask of
   someone — the lobby only suggests what fits. `coach` marks the feats
   that need the coach's eye. `quest: false` marks things it would be
   odd to ask for ("be losing, then…"). */
var LIST = [
  /* finishing */
  { id: "first-win",   emoji: "🏁", tier: 0, scope: "game", name: "A first win",
    how: "Win a game — against a coach or a friend nearby." },
  { id: "mate-queen",  emoji: "♕", tier: 0, scope: "game", name: "Mate with the queen",
    how: "Give checkmate with your queen — the piece that does it most often." },
  { id: "mate-rook",   emoji: "♖", tier: 1, scope: "game", name: "Mate with a rook",
    how: "Give checkmate with a rook: the king pushed to the edge and a rook along it." },
  { id: "back-rank",   emoji: "🚪", tier: 1, scope: "game", name: "A back-rank mate",
    how: "Mate a king on its home row, shut in by its own men, with a rook or queen along that row." },
  { id: "mate-bishop", emoji: "♗", tier: 2, scope: "game", name: "Mate with a bishop",
    how: "Give checkmate with a bishop — it only ever sees one colour of square." },
  { id: "mate-knight", emoji: "♘", tier: 2, scope: "game", name: "Mate with a knight",
    how: "Give checkmate with a knight — the hardest piece to mate with." },
  { id: "mate-pawn",   emoji: "♙", tier: 3, scope: "game", name: "Mate with a pawn",
    how: "Give checkmate with a pawn's step or capture — the smallest piece, the last word." },
  { id: "smothered",   emoji: "🫢", tier: 3, scope: "game", name: "A smothered mate",
    how: "Mate with a knight a king whose every neighbouring square is filled by its own men." },
  { id: "mate-promote", emoji: "👑", tier: 3, scope: "game", name: "Promote with mate",
    how: "Promote a pawn and give checkmate with the same move." },
  { id: "mate-castle", emoji: "🏰", tier: 4, scope: "game", name: "Castle with mate",
    how: "Castle, and let the rook arriving in the middle give checkmate." },
  /* the rules' rarer corners */
  { id: "castle-long", emoji: "↔️", tier: 0, scope: "game", name: "Castle long",
    how: "Castle on the queen's side (O-O-O) in a game." },
  { id: "en-passant",  emoji: "👻", tier: 1, scope: "game", name: "En passant",
    how: "Take a pawn en passant — the capture of a pawn that has just run past yours." },
  { id: "underpromote", emoji: "🐴", tier: 3, scope: "game", name: "An underpromotion",
    how: "Promote a pawn to something other than a queen." },
  /* tactics that won */
  { id: "fork-won",    emoji: "🍴", tier: 1, scope: "game", name: "A fork that won",
    how: "Fork two pieces (one of them worth more than a pawn) and go on to win the game." },
  { id: "pin-won",     emoji: "📌", tier: 2, scope: "game", name: "A pin that won",
    how: "Pin a piece of theirs and go on to win the game." },
  { id: "skewer-won",  emoji: "🍢", tier: 2, scope: "game", name: "A skewer that won",
    how: "Skewer two pieces on one line and go on to win the game." },
  /* the shape of a game */
  { id: "as-black",    emoji: "♚", tier: 0, scope: "game", name: "A win with Black",
    how: "Win a game as Black — a move behind from the start." },
  { id: "quick-win",   emoji: "⚡", tier: 1, scope: "game", name: "A win in 15",
    how: "Win a game in fifteen moves or fewer." },
  { id: "pawn-ending-won", emoji: "♟", tier: 2, scope: "game", name: "A pawn ending won",
    how: "Reach an ending of kings and pawns only, and win it." },
  { id: "long-win",    emoji: "🏔️", tier: 2, scope: "game", name: "A sixty-move win",
    how: "Win a game that lasts sixty moves or more." },
  { id: "queenless-won", emoji: "🫅", tier: 3, scope: "game", name: "Won without your queen", quest: false,
    how: "Lose your queen, and win the game anyway." },
  { id: "comeback",    emoji: "↩️", tier: 2, scope: "game", name: "A comeback", coach: true, quest: false,
    how: "Win a coach game after it had you three pawns down." },
  { id: "swindle",     emoji: "🎭", tier: 2, scope: "game", name: "Saved a lost game", coach: true, quest: false,
    how: "Draw a coach game after it had you five pawns down." },
  { id: "brilliant",   emoji: "💎", tier: 2, scope: "game", name: "A brilliant move", coach: true,
    how: "Play a move the coach marks !! — the best move, and one that gives something up." },
  /* the ladder */
  { id: "mastered-one", emoji: "🌟", tier: 1, scope: "after", name: "Three stars", coach: true,
    how: "Earn all three stars against one coach." },
  { id: "beat-each",   emoji: "🪜", tier: 4, scope: "game", name: "Beaten every coach", coach: true,
    how: "Win at least once against every coach on the ladder." },
  { id: "beat-oak",    emoji: "🌳", tier: 5, scope: "game", name: "Beaten Oak", coach: true,
    how: "Beat Oak, the strongest coach in the room." },
  /* how well it was played — the look-back's word */
  { id: "spotless",    emoji: "✨", tier: 3, scope: "after", name: "A win without a slip", coach: true,
    how: "Win a coach game the look-back finds no inaccuracy, mistake or blunder in." },
  { id: "sharp",       emoji: "🎯", tier: 3, scope: "after", name: "90% accurate", coach: true,
    how: "Play a coach game at 90% accuracy or better." }
];
var BY_ID = {};
LIST.forEach(function (f) { BY_ID[f.id] = f; });

/* ---------- the store ---------- */
function fresh() { return { v: VERSION, done: {} }; }
function clean(o) {
  var s = fresh();
  if (!o || typeof o !== "object" || o.v !== VERSION || !o.done || typeof o.done !== "object" || Array.isArray(o.done)) return s;
  Object.keys(o.done).forEach(function (id) {
    var d = o.done[id];
    if (!BY_ID[id] || !d || typeof d !== "object") return;
    if (typeof d.at !== "number" || !isFinite(d.at) || d.at < 0) return;
    s.done[id] = { at: d.at, game: typeof d.game === "string" && /^g[0-9a-z]{6,16}$/.test(d.game) ? d.game : null };
  });
  return s;
}
function load(getItem) {
  var raw = null;
  try { raw = getItem(KEY); } catch (e) { return fresh(); }
  if (typeof raw !== "string" || raw.length > 100000) return fresh();
  try { return clean(JSON.parse(raw)); } catch (e) { return fresh(); }
}
function save(state, setItem) {
  try { return setItem(KEY, JSON.stringify(clean(state))) !== false; } catch (e) { return false; }
}
function award(state, ids, at, game) {
  var s = clean(state);
  (ids || []).forEach(function (id) { if (BY_ID[id] && !s.done[id]) s.done[id] = { at: at, game: game || null }; });
  return clean(s);
}

/* ---------- during the game ----------
   Only your own moves are looked at, as they are played, for what the
   teaching eyes saw in them (a fork, a pin, a skewer) — the one thing
   that cannot be read back off the finished game. Nothing is awarded
   mid-game: a fork only counts if the game is then won, so these are
   flags, settled when it ends. The page keeps them per ply, so a move
   taken back takes its flag with it. */
function onMove(flags, m, lessons) {
  var f = {};
  for (var k in flags) if (Object.prototype.hasOwnProperty.call(flags, k)) f[k] = flags[k];
  if (!m) return f;
  (lessons || []).forEach(function (l) {
    if (!l) return;
    /* a fork that only ever wins a pawn is weight 72; a pin you walked
       into yourself is weight 91 — neither is yours to be proud of */
    if (l.concept === "fork" && l.weight >= 88) f.fork = 1;
    if (l.concept === "pin" && l.weight === 84) f.pin = 1;
    if (l.concept === "skewer") f.skewer = 1;
  });
  return f;
}

/* ---------- at the end ----------
   ctx: { g (the finished Chess game), mode, mySide, result, low,
          level, ladder: { rungs }, marks, levels: Rating.LEVELS } */
function sideOfPly(i) { return i % 2 === 0 ? 1 : -1; }
function neighbours(sq) {
  var out = [];
  for (var dr = -1; dr <= 1; dr++) for (var df = -1; df <= 1; df++) {
    if (!dr && !df) continue;
    var t = sq + dr * 16 + df;
    if (!(t & 0x88)) out.push(t);
  }
  return out;
}
/* what is true of the finished game, whoever's feat it may be */
function facts(ctx) {
  var g = ctx.g, played = g && g.played ? g.played : [], me = ctx.mySide;
  var out = { plies: played.length, won: false, drew: ctx.result === "draw", mate: null,
              queenLost: false, pawnEnding: false, ep: false, long: false, under: false };
  out.won = (ctx.result === "white" && me === 1) || (ctx.result === "black" && me === -1);
  /* material without replaying: the pieces other than kings and pawns
     start at fourteen, captures take them away and promotions add them
     back, so "kings and pawns only" is the moment that count is zero */
  var officers = 14;
  for (var i = 0; i < played.length; i++) {
    var m = played[i].m;
    if (!m) continue;
    if (m.capt) {
      var kc = Math.abs(m.capt);
      if (kc !== P && kc !== K) officers--;
      if (m.capt === Q * me) out.queenLost = true;
    }
    if (m.promo) officers++;
    if (officers === 0) out.pawnEnding = true;
    /* the rules' rarer corners are read off your own moves as they
       stand at the end — so a game picked back up after a reload keeps
       them, and a move taken back does not */
    if (sideOfPly(i) === me) {
      if (Chess && (m.flags & Chess.F_EP)) out.ep = true;
      if (Chess && (m.flags & Chess.F_CASTLE) && (m.to & 7) === 2) out.long = true;
      if (m.promo && Math.abs(m.promo) !== Q) out.under = true;
    }
  }
  var last = played.length ? played[played.length - 1] : null;
  if (last && last.m && /#$/.test(last.san || "") && sideOfPly(played.length - 1) === me) {
    var lm = last.m, piece = g.board[lm.to], kind = Math.abs(piece);
    var victim = -me, ksq = g.kings[victim === 1 ? 0 : 1];
    var home = victim === 1 ? 0 : 7;
    var mt = { kind: kind, pawn: Math.abs(lm.piece) === P && !lm.promo, promo: !!lm.promo,
               castle: !!(Chess && (lm.flags & Chess.F_CASTLE)), smothered: false, backRank: false };
    if (kind === N && !mt.promo) {
      mt.smothered = neighbours(ksq).every(function (t) { var p = g.board[t]; return p && (p > 0 ? 1 : -1) === victim; });
    }
    if ((kind === R || kind === Q) && (ksq >> 4) === home && (lm.to >> 4) === home) {
      /* the king's own men fill the row in front of it */
      var front = neighbours(ksq).filter(function (t) { return (t >> 4) !== home; });
      mt.backRank = front.length > 0 && front.every(function (t) { var p = g.board[t]; return p && (p > 0 ? 1 : -1) === victim; });
    }
    out.mate = mt;
  }
  return out;
}
function onGame(state, flags, ctx) {
  var s = clean(state), got = [];
  if (!ctx || !ctx.g || (ctx.mode !== "coach" && ctx.mode !== "lan") || (ctx.mySide !== 1 && ctx.mySide !== -1)) return got;
  var f = flags || {}, x = facts(ctx), coach = ctx.mode === "coach";
  function earn(id, cond) { if (cond && !s.done[id] && got.indexOf(id) < 0) got.push(id); }
  var mt = x.mate;
  earn("first-win", x.won);
  if (mt && x.won) {
    earn("mate-castle", mt.castle);
    earn("mate-promote", mt.promo);
    earn("mate-pawn", mt.pawn);
    earn("smothered", mt.smothered);
    earn("back-rank", mt.backRank);
    if (!mt.castle && !mt.pawn) {
      earn("mate-queen", mt.kind === Q);
      earn("mate-rook", mt.kind === R);
      earn("mate-bishop", mt.kind === B);
      earn("mate-knight", mt.kind === N);
    }
  }
  earn("castle-long", !!x.long);
  earn("en-passant", !!x.ep);
  earn("underpromote", !!x.under);
  earn("fork-won", x.won && !!f.fork);
  earn("pin-won", x.won && !!f.pin);
  earn("skewer-won", x.won && !!f.skewer);
  earn("as-black", x.won && ctx.mySide === -1);
  earn("quick-win", x.won && x.plies <= 30);
  earn("pawn-ending-won", x.won && x.pawnEnding);
  earn("long-win", x.won && x.plies >= 119);
  earn("queenless-won", x.won && x.queenLost);
  if (coach) {
    var low = typeof ctx.low === "number" ? ctx.low : 0;
    earn("comeback", x.won && low <= -300 && x.plies >= 20);
    earn("swindle", x.drew && low <= -500);
    var marks = ctx.marks || {};
    earn("brilliant", Object.keys(marks).some(function (k) { return marks[k] === "!!" && sideOfPly(+k) === ctx.mySide; }));
    var rungs = ctx.ladder && ctx.ladder.rungs || {}, levels = ctx.levels || [];
    earn("beat-oak", x.won && levels.length > 0 && ctx.level === levels[levels.length - 1].id);
    earn("beat-each", levels.length > 0 && levels.every(function (L) { return rungs[L.id] && rungs[L.id].stars && rungs[L.id].stars[0]; }));
  }
  return got;
}
/* once the look-back has measured the game: ctx adds { acc, counts,
   won } and the ladder as it now stands (the third star lands here) */
function onAfter(state, ctx) {
  var s = clean(state), got = [];
  if (!ctx || ctx.mode !== "coach") return got;
  function earn(id, cond) { if (cond && !s.done[id] && got.indexOf(id) < 0) got.push(id); }
  var c = ctx.counts || {}, acc = typeof ctx.acc === "number" ? ctx.acc : null;
  earn("spotless", !!ctx.won && acc !== null && !c.inaccuracy && !c.mistake && !c.blunder);
  earn("sharp", acc !== null && acc >= 90);
  var rungs = ctx.ladder && ctx.ladder.rungs || {};
  earn("mastered-one", Object.keys(rungs).some(function (id) {
    var st = rungs[id] && rungs[id].stars;
    return st && st[0] && st[1] && st[2];
  }));
  return got;
}

/* ---------- what the record already shows ----------
   A player who had won a hundred games before the cabinet existed has
   won a game; they should not be told "A first win!" on the hundred and
   first. What the rating history and the ladder already prove is filled
   in quietly, once, with the date it can be read off (or none), and is
   never announced: it was said at the time, in its own way.
   ctx: { history: rating.history, ladder: { rungs }, levels, now } */
function fromRecord(state, ctx) {
  var s = clean(state), got = [], c = ctx || {};
  var h = Array.isArray(c.history) ? c.history : [], rungs = c.ladder && c.ladder.rungs || {}, levels = c.levels || [];
  var firstWin = null;
  for (var i = 0; i < h.length && !firstWin; i++) if (h[i] && h[i].result === 1) firstWin = h[i];
  var now = typeof c.now === "number" ? c.now : 0;
  function quietly(id, cond, at) { if (cond && !s.done[id]) { s.done[id] = { at: at, game: null }; got.push(id); } }
  quietly("first-win", !!firstWin || levels.some(function (L) { return rungs[L.id] && rungs[L.id].w > 0; }),
          firstWin && typeof firstWin.at === "number" ? firstWin.at : now);
  var star = function (id, k) { return !!(rungs[id] && rungs[id].stars && rungs[id].stars[k]); };
  quietly("beat-oak", levels.length > 0 && star(levels[levels.length - 1].id, 0), now);
  quietly("beat-each", levels.length > 0 && levels.every(function (L) { return star(L.id, 0); }), now);
  quietly("mastered-one", levels.some(function (L) { return star(L.id, 0) && star(L.id, 1) && star(L.id, 2); }), now);
  return { state: clean(s), ids: got };
}

/* ---------- what to suggest, and the cabinet ---------- */
/* the undone feat a player at this title can fairly be asked for:
   the gentlest tier first, then the order of the list */
function nextFor(state, titleIndex) {
  var s = clean(state), ti = typeof titleIndex === "number" ? titleIndex : 0, best = null;
  LIST.forEach(function (f) {
    if (s.done[f.id] || f.quest === false || f.tier > ti) return;
    if (!best || f.tier < best.tier) best = f;
  });
  return best;
}
function summary(state) {
  var s = clean(state);
  var rows = LIST.map(function (f, i) {
    return { id: f.id, emoji: f.emoji, name: f.name, how: f.how, coach: !!f.coach, order: i,
             done: s.done[f.id] ? { at: s.done[f.id].at, game: s.done[f.id].game } : null };
  });
  /* the ones you have done first, newest first; then the rest in the
     order a player tends to meet them */
  rows.sort(function (a, b) {
    if (!!a.done !== !!b.done) return a.done ? -1 : 1;
    if (a.done) return b.done.at - a.done.at;
    return LIST[a.order].tier - LIST[b.order].tier || a.order - b.order;
  });
  return { earned: Object.keys(s.done).length, total: LIST.length, rows: rows };
}

var Feats = {
  VERSION: VERSION, KEY: KEY, LIST: LIST,
  byId: function (id) { return BY_ID[id] || null; },
  fresh: fresh, clean: clean, load: load, save: save, award: award,
  onMove: onMove, onGame: onGame, onAfter: onAfter, facts: facts, fromRecord: fromRecord,
  nextFor: nextFor, summary: summary
};

if (typeof module !== "undefined" && module.exports) module.exports = Feats;
else root.Feats = Feats;
})(typeof self !== "undefined" ? self : this);
