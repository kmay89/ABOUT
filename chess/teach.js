/* teach.js — the part of the room that notices things.

   A good teacher doesn't lecture; they catch the moment. This module
   looks at a position (or at a move just played) and reports, in plain
   words, what is actually going on: a knight attacking two things at
   once, a bishop freezing a piece in front of a king, a rook left
   hanging, a back rank with no air. Everything here is *named*, because
   naming is what turns "a thing that happened" into a pattern you can
   recognise again — the single most useful thing a beginner can gain.

   Naming only helps if the name is true. A coach that calls 3.Bb5 a
   skewer, or tells you to take a defended bishop with your queen, has
   taught you something false with total confidence — worse than saying
   nothing. So nothing here is decided by piece values alone. Underneath
   everything is a static exchange count (see()): play out every capture
   on a square, cheapest piece first, each side free to stop, and see
   who is ahead at the end. A piece is only "hanging" when that count
   says taking it wins. A fork is only a fork when, whatever they reply,
   you still win something. A pin is only a pin when moving the front
   piece really would cost them the one behind it. When the honest
   answer is "it's just a trade", the room says nothing.

   Two customers:
     - the live game, which whispers a teachable moment when one appears
       (and goes quiet once you've shown you know it — see learn.js),
     - the Academy lessons, which use the same eyes to explain *why*
       your answer worked, or what your wrong answer allowed.
   And one more: explainMove() tells the hint what a suggested move
   actually does, so a hint can say "wins the knight" instead of
   reciting a principle.

   Pure functions over an engine.js game; no DOM, no state. Anything
   that tries a move on the real game undoes it before returning.
   Tested by chess/tools/teach-check.js against hand-built positions and
   the openings people actually play. */
(function (root) {
"use strict";

var Chess = (typeof module !== "undefined" && module.exports)
  ? require("./engine.js") : root.Chess;

var P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
var VAL = [0, 100, 320, 330, 500, 900, 20000];
var NAMES = ["", "pawn", "knight", "bishop", "rook", "queen", "king"];
var N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
var K_OFF = [17, 16, 15, 1, -17, -16, -15, -1];
var B_OFF = [17, 15, -17, -15];
var R_OFF = [16, 1, -16, -1];

/* The smallest swing worth calling a win. A pawn is 100; a bishop for a
   knight is 10, and calling that "winning material" would be teaching
   arithmetic noise. Anything under this is a trade. */
var GAIN = 80;

function on(sq) { return (sq & 0x88) === 0; }
function kindOf(p) { return p < 0 ? -p : p; }
function colorOf(p) { return p > 0 ? 1 : -1; }
function name(p) { return NAMES[kindOf(p)]; }
function sqName(sq) { return Chess.sqName(sq); }
function rankOf(sq) { return sq >> 4; }
function fileOf(sq) { return sq & 7; }
function homeRank(side) { return side === 1 ? 0 : 7; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ---------- raw attacks (ignores pins; "what does this piece hit") ---------- */
function attacksFrom(g, sq) {
  var b = g.board, p = b[sq];
  if (!p) return [];
  var kind = kindOf(p), color = colorOf(p), out = [], i, t, dirs;
  if (kind === P) {
    var f = 16 * color;
    if (on(sq + f - 1)) out.push(sq + f - 1);
    if (on(sq + f + 1)) out.push(sq + f + 1);
    return out;
  }
  if (kind === N || kind === K) {
    dirs = kind === N ? N_OFF : K_OFF;
    for (i = 0; i < 8; i++) { t = sq + dirs[i]; if (on(t)) out.push(t); }
    return out;
  }
  dirs = kind === B ? B_OFF : kind === R ? R_OFF : K_OFF;   /* queen = all 8 */
  for (i = 0; i < dirs.length; i++) {
    for (t = sq + dirs[i]; on(t); t += dirs[i]) {
      out.push(t);
      if (b[t]) break;             /* the blocker is attacked, nothing past it */
    }
  }
  return out;
}

/* squares holding `color` pieces that attack `sq` */
function attackersOf(g, sq, color) {
  var out = [], s, p;
  for (s = 0; s < 128; s++) {
    if (!on(s)) continue;
    p = g.board[s];
    if (!p || colorOf(p) !== color) continue;
    var hits = attacksFrom(g, s);
    for (var i = 0; i < hits.length; i++) {
      if (hits[i] === sq) { out.push(s); break; }
    }
  }
  return out;
}

/* ---------- a scratch board, and who may legally capture ----------
   Exchanges are played out on a copy, never on the game. The copy only
   needs a board: Chess.attacked and attacksFrom read nothing else. */
function scratch(g) { return { board: new Int8Array(g.board) }; }

function kingOn(b, color) {
  var k = K * color;
  for (var s = 0; s < 128; s++) if (on(s) && b[s] === k) return s;
  return -1;
}

/* Would moving the piece on `from` to `to` leave its own king attacked?
   This is what makes a pinned piece a bad defender and a pinned attacker
   no attacker at all — the two ways a count by piece values lies. */
function legalOn(pos, from, to) {
  var b = pos.board, p = b[from], took = b[to], color = colorOf(p);
  b[to] = p; b[from] = 0;
  var k = kindOf(p) === K ? to : kingOn(b, color);
  var bad = k >= 0 && Chess.attacked(pos, k, -color);
  b[from] = p; b[to] = took;
  return !bad;
}

function leastAttacker(pos, sq, color) {
  var atk = attackersOf(pos, sq, color), best = -1, bv = Infinity;
  for (var i = 0; i < atk.length; i++) {
    var v = VAL[kindOf(pos.board[atk[i]])];
    if (v < bv && legalOn(pos, atk[i], sq)) { bv = v; best = atk[i]; }
  }
  return best;
}

/* ---------- the static exchange ----------
   What the piece on `from` gains by going to `to` (a capture or not),
   if both sides then keep capturing on that square with their cheapest
   piece and either may stop when going on would lose. Each capture is
   made on the scratch board, so a rook behind a rook joins in by
   itself (an x-ray needs no special case), and pinned pieces sit out. */
function see(g, from, to, epSq) {
  var pos = scratch(g), b = pos.board, piece = b[from];
  if (!piece) return 0;
  var gain = [b[to] ? VAL[kindOf(b[to])] : 0], d = 0;
  if (epSq != null && epSq >= 0) { gain[0] = VAL[P]; b[epSq] = 0; }
  var standing = VAL[kindOf(piece)];
  /* a pawn that arrives on the last rank arrives as a queen */
  if (kindOf(piece) === P && (rankOf(to) === 0 || rankOf(to) === 7)) {
    gain[0] += VAL[Q] - VAL[P]; standing = VAL[Q]; piece = Q * colorOf(piece);
  }
  b[to] = piece; b[from] = 0;
  var side = -colorOf(piece);
  for (;;) {
    var s = leastAttacker(pos, to, side);
    if (s < 0 || d > 30) break;
    d++;
    gain[d] = standing - gain[d - 1];
    standing = VAL[kindOf(b[s])];
    b[to] = b[s]; b[s] = 0;
    side = -side;
  }
  while (d > 0) { gain[d - 1] = -Math.max(-gain[d - 1], gain[d]); d--; }
  return gain[0];
}

/* the same count for an actual move object (handles en passant) */
function seeMove(g, m) {
  var ep = (m.flags & Chess.F_EP) ? m.to - 16 * colorOf(m.piece) : -1;
  return see(g, m.from, m.to, ep);
}

/* The most `by` can win with one capture on `sq`, and with what.
   Null when nothing of theirs can legally take there. */
function bestCapture(g, sq, by) {
  var p = g.board[sq];
  if (!p || colorOf(p) === by || kindOf(p) === K) return null;
  var pos = scratch(g), atk = attackersOf(g, sq, by), best = null;
  for (var i = 0; i < atk.length; i++) {
    if (!legalOn(pos, atk[i], sq)) continue;
    var v = see(g, atk[i], sq);
    if (!best || v > best.gain) best = { from: atk[i], gain: v };
  }
  return best;
}

/* After the first capture on `sq`, which of the owner's pieces could
   legally take back? (A pinned "defender" is not one.) */
function defendersAfter(g, from, sq) {
  var pos = scratch(g), b = pos.board, owner = colorOf(b[sq]);
  b[sq] = b[from]; b[from] = 0;
  return attackersOf(pos, sq, owner).filter(function (d) { return legalOn(pos, d, sq); });
}

/* A piece is "loose" when the other side can win material by taking it:
   undefended, attacked by something cheaper, or simply outnumbered.
   This is the beginner's single most expensive blind spot, so it gets
   first-class treatment — and an exact count, not a guess. */
function looseInfo(g, sq) {
  var p = g.board[sq];
  if (!p || kindOf(p) === K) return null;
  var by = -colorOf(p), bc = bestCapture(g, sq, by);
  if (!bc || bc.gain < GAIN) return null;
  /* "cheaper" has to mean cheaper by a real margin: a knight for a
     bishop is a trade, and if that piece is lost it's to numbers */
  var why = !defendersAfter(g, bc.from, sq).length ? "undefended"
          : VAL[kindOf(p)] - VAL[kindOf(g.board[bc.from])] >= GAIN ? "cheaper" : "outnumbered";
  return { sq: sq, piece: p, value: VAL[kindOf(p)], gain: bc.gain,
           from: bc.from, attacker: g.board[bc.from], why: why };
}
function isLoose(g, sq) { return !!looseInfo(g, sq); }

function looseFor(g, side) {          /* `side`'s pieces that can be won */
  var out = [], sq;
  for (sq = 0; sq < 128; sq++) {
    if (!on(sq)) continue;
    var p = g.board[sq];
    if (!p || colorOf(p) !== side) continue;
    var info = looseInfo(g, sq);
    if (info) out.push(info);
  }
  out.sort(function (a, b) { return b.value - a.value; });
  return out;
}

/* ---------- does a threat survive every reply? ----------
   The honest test for "whichever they save, you take the other": try
   every legal reply, and after each one ask what the attacking piece
   (or a recapture, if they took something) can now win. A defence that
   holds anywhere — taking the attacker, blocking, a counter-capture,
   stepping the king over to guard — means it wasn't a winning tactic,
   and the room keeps quiet. Asked with the opponent to move, which is
   exactly the moment after the move that made the threat. */
function strikeFrom(g, sq, side, targets) {
  var p = g.board[sq];
  if (!p || colorOf(p) !== side) return 0;
  var pos = scratch(g), hits = attacksFrom(g, sq), best = 0;
  for (var i = 0; i < hits.length; i++) {
    var t = hits[i], q = g.board[t];
    if (!q || colorOf(q) === side || kindOf(q) === K) continue;
    if (targets && targets.indexOf(t) < 0) continue;
    if (!legalOn(pos, sq, t)) continue;
    var v = see(g, sq, t);
    if (v > best) best = v;
  }
  return best;
}
function holds(g, by, side, targets) {
  return profile(g, by, side, targets, false).holds;
}
/* The long form: also records which targets actually fall after at
   least one reply. A target that never falls was only ever "loose" on a
   frozen board — typically because its defender couldn't legally
   recapture while its own king was in check, which stops being true
   the moment they answer the check. */
function profile(g, by, side, targets, full) {
  var res = { holds: false, fell: {} };
  if (g.turn !== -side) return res;
  var piece = g.board[by], replies = Chess.moves(g), i, k;
  if (!replies.length) return res;            /* mate and stalemate are told elsewhere */
  res.holds = true;
  for (i = 0; i < replies.length; i++) {
    var r = replies[i], took = r.capt ? VAL[kindOf(r.capt)] : 0, win = 0;
    Chess.make(g, r);
    if (g.board[by] === piece) {
      if (full) {
        for (k = 0; k < targets.length; k++) {
          var v = strikeFrom(g, by, side, [targets[k]]);
          if (v >= GAIN) res.fell[targets[k]] = true;
          if (v > win) win = v;
        }
      } else {
        win = strikeFrom(g, by, side, targets);
      }
    }
    if (took) {
      var back = bestCapture(g, r.to, side);
      if (back && back.gain > win) win = back.gain;
    }
    Chess.unmake(g);
    if (win - took < GAIN) { res.holds = false; if (!full) return res; }
  }
  return res;
}

/* ---------- forks: one piece, two victims ---------- */
function forks(g, side) {
  var out = [], sq, pos = scratch(g), live = g.turn === -side;
  for (sq = 0; sq < 128; sq++) {
    if (!on(sq)) continue;
    var p = g.board[sq];
    if (!p || colorOf(p) !== side) continue;
    var hits = attacksFrom(g, sq), victims = [];
    for (var i = 0; i < hits.length; i++) {
      var t = hits[i], q = g.board[t];
      if (!q || colorOf(q) === side) continue;
      if (kindOf(q) === K) { victims.push({ sq: t, piece: q, value: VAL[K] }); continue; }
      /* worth winning means the exchange on that square really wins */
      if (!legalOn(pos, sq, t)) continue;
      var gain = see(g, sq, t);
      if (gain >= GAIN) victims.push({ sq: t, piece: q, value: VAL[kindOf(q)], gain: gain });
    }
    if (victims.length < 2) continue;
    /* With them to move, it has to survive every reply, and every
       victim named has to be one that really falls if they save the
       other. With us to move it's simpler: there are two things we can
       take, so take one. */
    if (live) {
      var targets = [], kingHit = false;
      victims.forEach(function (v) { if (kindOf(v.piece) === K) kingHit = true; else targets.push(v.sq); });
      if (!targets.length) continue;
      var pr = profile(g, sq, side, targets, true);
      if (!pr.holds) continue;
      victims = victims.filter(function (v) { return kindOf(v.piece) === K || pr.fell[v.sq]; });
      if (victims.length < 2) continue;      /* the king and one real victim, or two real victims */
    }
    victims.sort(function (a, b) { return b.value - a.value; });
    out.push({
      kind: "fork", concept: "fork", by: sq, piece: p,
      victims: victims,
      safe: true,                   /* kept for older callers: every fork reported holds */
      check: victims.some(function (v) { return kindOf(v.piece) === K; })
    });
  }
  return out;
}

/* ---------- pins & skewers: two pieces on one line ---------- */

/* Could the front piece go anywhere off the line `by`→`back`? A pin
   that stops nothing it wanted to do (an h-pawn on the h-file, which
   only ever moves along it) restrains nothing and isn't worth naming. */
function canLeave(g, front, by, back, step) {
  var b = g.board, p = b[front], color = colorOf(p), dests = [], t, i;
  if (kindOf(p) === P) {
    var f = 16 * color;
    if (on(front + f) && !b[front + f]) dests.push(front + f);
    for (i = -1; i <= 1; i += 2) {
      t = front + f + i;
      if (on(t) && b[t] && colorOf(b[t]) !== color) dests.push(t);
    }
  } else {
    var hits = attacksFrom(g, front);
    for (i = 0; i < hits.length; i++) {
      t = hits[i];
      if (!b[t] || colorOf(b[t]) !== color) dests.push(t);
    }
  }
  for (i = 0; i < dests.length; i++) {
    var stays = false;
    for (t = by; t !== back; t += step) if (t === dests[i]) { stays = true; break; }
    if (!stays) return true;
  }
  return false;
}

/* The front piece can simply take the attacker and come out level or
   better: then there was never a pin, only an offer to trade. */
function frontTakes(g, front, by) {
  if (attacksFrom(g, front).indexOf(by) < 0) return false;
  if (!legalOn(scratch(g), front, by)) return false;
  return see(g, front, by) > -GAIN;
}

/* What the attacker wins on `back` once the front piece is gone. */
function winsBehind(g, by, front, back) {
  var pos = scratch(g);
  pos.board[front] = 0;
  if (!legalOn(pos, by, back)) return 0;
  return see(pos, by, back);
}

function lines(g, side) {
  var pins = [], skewers = [], sq, live = g.turn === -side, pos = scratch(g);
  for (sq = 0; sq < 128; sq++) {
    if (!on(sq)) continue;
    var p = g.board[sq];
    if (!p || colorOf(p) !== side) continue;
    var kind = kindOf(p);
    if (kind !== B && kind !== R && kind !== Q) continue;
    var dirs = kind === B ? B_OFF : kind === R ? R_OFF : K_OFF;
    for (var d = 0; d < dirs.length; d++) {
      var step = dirs[d], t, front = -1, back = -1;
      for (t = sq + step; on(t); t += step) {
        if (g.board[t]) { front = t; break; }
      }
      if (front < 0 || colorOf(g.board[front]) === side) continue;
      for (t = front + step; on(t); t += step) {
        if (g.board[t]) { back = t; break; }
      }
      if (back < 0 || colorOf(g.board[back]) === side) continue;
      var fk = kindOf(g.board[front]), bk = kindOf(g.board[back]);
      var rec = { by: sq, piece: p, front: front, frontPiece: g.board[front],
                  back: back, backPiece: g.board[back] };
      /* every square of the line: a front piece that slides along it
         toward the attacker is still standing in the way, and still
         falls */
      var lane = [];
      for (t = sq + step; t !== back + step; t += step) lane.push(t);

      if (fk === K) {
        /* the king is in front: it is check, it must step aside, and the
           piece behind falls — if nothing they do prevents it */
        if (!live) continue;
        if (winsBehind(g, sq, front, back) < GAIN) continue;
        if (!holds(g, sq, side, lane)) continue;
        rec.kind = "skewer"; rec.concept = "skewer"; rec.absolute = false; rec.check = true;
        skewers.push(rec);
      } else if (bk === K) {
        /* absolute: moving off the line would be illegal */
        if (!canLeave(g, front, sq, back, step)) continue;
        if (frontTakes(g, front, sq)) continue;
        /* a pinned pawn only matters when it is about to fall */
        if (fk === P) {
          var hit = bestCapture(g, front, side);
          if (!hit || hit.gain < GAIN) continue;
        }
        rec.kind = "pin"; rec.concept = "pin"; rec.absolute = true;
        pins.push(rec);
      } else if (VAL[bk] > VAL[fk]) {
        /* relative: it may move, but it costs them the piece behind */
        if (!canLeave(g, front, sq, back, step)) continue;
        if (frontTakes(g, front, sq)) continue;
        if (winsBehind(g, sq, front, back) < GAIN) continue;
        rec.kind = "pin"; rec.concept = "pin"; rec.absolute = false;
        pins.push(rec);
      } else if (VAL[fk] > VAL[bk]) {
        /* a skewer needs the front piece genuinely attacked — a knight
           defended by a pawn and "attacked" by a bishop is only a trade
           on offer — and the piece behind genuinely winnable */
        if (!legalOn(pos, sq, front) || see(g, sq, front) < GAIN) continue;
        if (frontTakes(g, front, sq)) continue;
        if (winsBehind(g, sq, front, back) < GAIN) continue;
        if (live && !holds(g, sq, side, lane)) continue;
        rec.kind = "skewer"; rec.concept = "skewer"; rec.absolute = false; rec.check = false;
        skewers.push(rec);
      }
    }
  }
  return { pins: pins, skewers: skewers };
}

/* ---------- back rank: a king with no air ----------
   Not "the pawns in front of the king haven't moved" — that's every
   king in the opening. The question is the one that matters: is there
   a square on its back row where an enemy rook could land and it would
   be checkmate? Asked of the real rules: the rook is set down on a copy
   of the position and the engine is asked whether any legal reply
   remains. Returns the squares where it would be mate. */
function backRank(g, side) {
  var b = g.board, ks = kingOn(b, side), home = homeRank(side);
  if (ks < 0 || rankOf(ks) !== home) return null;
  /* a king already in check has a more urgent problem, and the test
     below would count the existing checker as the rook's accomplice */
  if (Chess.attacked(g, ks, -side)) return null;
  var heavy = false, sq;
  for (sq = 0; sq < 128; sq++) {
    if (!on(sq)) continue;
    var p = b[sq];
    if (p && colorOf(p) === -side && (kindOf(p) === R || kindOf(p) === Q)) { heavy = true; break; }
  }
  if (!heavy) return null;
  var t = null, squares = [];
  for (var f = 0; f < 8; f++) {
    var x = home * 16 + f;
    if (x === ks || b[x]) continue;
    var step = x < ks ? 1 : -1, clear = true;
    for (var s = x + step; s !== ks; s += step) if (b[s]) { clear = false; break; }
    if (!clear) continue;
    if (!t) { t = Chess.create(Chess.fen(g)); t.turn = side; t.ep = -1; t.castling = 0; }
    t.board[x] = -side * R;
    var mated = Chess.inCheck(t, side) && Chess.moves(t).length === 0;
    t.board[x] = 0;
    if (mated) squares.push(x);
  }
  if (!squares.length) return null;
  return { kind: "backRank", concept: "backRank", side: side, king: ks, squares: squares };
}

/* ---------- mate in one, for the side to move ---------- */
function mateInOne(g) {
  var ms = Chess.moves(g), i;
  for (i = 0; i < ms.length; i++) {
    Chess.make(g, ms[i]);
    var mated = Chess.inCheck(g) && Chess.moves(g).length === 0;
    Chess.unmake(g);
    if (mated) return ms[i];
  }
  return null;
}

/* If `side` could move again right now, would it have mate in one?
   That is what "threatens mate" means. Asked on a copy with the turn
   handed back, so only call it when `side` is not giving check. */
function mateThreat(g, side) {
  var t = Chess.create(Chess.fen(g));
  t.turn = side; t.ep = -1;
  if (Chess.inCheck(t, -side)) return null;
  var m = mateInOne(t);
  return m ? { move: m, san: Chess.toSAN(t, m) } : null;
}

/* ---------- everything at once ---------- */
function scan(g, side) {
  var L = lines(g, side);
  return {
    forks: forks(g, side),
    pins: L.pins,
    skewers: L.skewers,
    loose: looseFor(g, -side),              /* enemy pieces `side` can win */
    ownLoose: looseFor(g, side),            /* `side`'s own pieces in danger */
    backRank: backRank(g, -side)            /* enemy king short of air */
  };
}

/* ---------- what was already standing ----------
   "That's a pin!" about a pin that was there before your move is noise.
   Tactics are compared with the position before by their geometry, not
   by whether they counted as real a move ago: a pin that didn't count
   only because your own king happened to be in check is the same pin
   once you've answered the check, not a new one. */
function standing(g, side) {
  var lines = {}, hits = {}, sq;
  for (sq = 0; sq < 128; sq++) {
    if (!on(sq)) continue;
    var p = g.board[sq];
    if (!p || colorOf(p) !== side) continue;
    var h = attacksFrom(g, sq), mine = {};
    for (var i = 0; i < h.length; i++) {
      var q = g.board[h[i]];
      if (q && colorOf(q) !== side) mine[h[i]] = q;
    }
    hits[sq] = { piece: p, targets: mine };
    var kind = kindOf(p);
    if (kind !== B && kind !== R && kind !== Q) continue;
    var dirs = kind === B ? B_OFF : kind === R ? R_OFF : K_OFF;
    for (var d = 0; d < dirs.length; d++) {
      var t = sq + dirs[d], front = -1;
      while (on(t) && !g.board[t]) t += dirs[d];
      if (!on(t) || colorOf(g.board[t]) === side) continue;
      front = t; t += dirs[d];
      while (on(t) && !g.board[t]) t += dirs[d];
      if (!on(t) || colorOf(g.board[t]) === side) continue;
      lines[sq + ":" + front + ":" + t] = true;
    }
  }
  return { lines: lines, hits: hits };
}
function wasLine(st, t) { return !!st.lines[t.by + ":" + t.front + ":" + t.back]; }
function wasFork(st, f) {
  var h = st.hits[f.by];
  if (!h || h.piece !== f.piece) return false;
  return f.victims.every(function (v) { return h.targets[v.sq] === v.piece; });
}

/* ---------- small honest phrases ----------
   Why a loose piece is loose, said from the owner's side ("your") or
   the attacker's ("their"). Three different reasons, three different
   lessons: guard it, don't put it where a cheaper piece hits it, count
   attackers against defenders. */
function looseSentence(l, whose) {
  var piece = name(l.piece), at = sqName(l.sq), by = name(l.attacker);
  if (whose === "your") {
    if (l.why === "undefended") return "Your " + piece + " on " + at + " is attacked and nothing defends it.";
    if (l.why === "cheaper") return "Your " + piece + " on " + at + " is attacked by their " + by +
      " — a cheaper piece, so even if you take back, you lose material.";
    return "Your " + piece + " on " + at + " is attacked more times than it is defended.";
  }
  if (l.why === "undefended") return "Their " + piece + " on " + at + " is undefended, and you can take it.";
  if (l.why === "cheaper") return "Your " + by + " attacks their " + piece + " on " + at +
    " — a " + by + " for a " + piece + " wins material even if they take back.";
  return "Their " + piece + " on " + at + " is attacked more times than it is defended, so you can win it in the exchanges.";
}
/* pawns in front of a castled king (on its side of the board) */
function shelter(g, side, kingSq) {
  var n = 0, f0 = fileOf(kingSq) >= 4 ? 5 : 0, f1 = fileOf(kingSq) >= 4 ? 7 : 2;
  for (var f = f0; f <= f1; f++) {
    for (var r = 1; r <= 2; r++) {
      var sq = (side === 1 ? r : 7 - r) * 16 + f;
      if (g.board[sq] === P * side) { n++; break; }
    }
  }
  return n;
}
function passed(g, sq, side) {
  var f = fileOf(sq), r = rankOf(sq);
  for (var ff = f - 1; ff <= f + 1; ff++) {
    if (ff < 0 || ff > 7) continue;
    for (var rr = r + side; rr >= 0 && rr <= 7; rr += side) {
      if (g.board[rr * 16 + ff] === -P * side) return false;
    }
  }
  return true;
}
function checkOptions(g, side, replies) {
  /* g: after the checking move, the checked side to move */
  var ks = kingOn(g.board, -side), checkers = attackersOf(g, ks, side);
  var move = false, take = false, block = false;
  for (var i = 0; i < replies.length; i++) {
    var r = replies[i];
    if (checkers.length === 1 && r.to === checkers[0]) take = true;
    else if (r.from === ks) move = true;
    else block = true;
  }
  var o = [];
  if (move) o.push("move the king");
  if (block) o.push("block the line");
  if (take) o.push("capture the checking piece");
  return o;
}
function joinOr(list) {
  if (list.length <= 1) return list.join("");
  return list.slice(0, -1).join(", ") + " or " + list[list.length - 1];
}

/* ---------- what did this move just do? ----------
   `g` is the position BEFORE the move. Returns plain-language
   observations, each tagged with the concept it teaches so the app can
   fade the ones you've already mastered. */
function afterMove(g, m) {
  if (!g || !g.board || !m || !m.piece || g.board[m.from] !== m.piece) return [];
  var side = colorOf(m.piece), out = [], i;
  var st = standing(g, side);
  var wasLoose = {}, own0 = looseFor(g, side);
  for (i = 0; i < own0.length; i++) wasLoose[own0[i].sq] = true;
  /* what the move does materially on its own square: an even trade is
     an offer, and a promotion they can only take back at a loss is a
     win, so neither is a piece "left hanging" */
  var moveSee = seeMove(g, m);
  var early = g.full <= 12;

  Chess.make(g, m);
  var after = { forks: forks(g, side), lines: lines(g, side), ownLoose: looseFor(g, side) };
  var replies = Chess.moves(g);
  var gaveCheck = Chess.inCheck(g, -side);
  var mated = gaveCheck && replies.length === 0;
  var stale = !gaveCheck && replies.length === 0;
  var options = gaveCheck && !mated ? checkOptions(g, side, replies) : [];
  var threat = !gaveCheck && replies.length ? mateThreat(g, side) : null;
  /* a pinned piece that can still slide along its line deserves to be
     told so — "it can't move" would be untrue */
  for (i = 0; i < after.lines.pins.length; i++) {
    var pn0 = after.lines.pins[i];
    pn0.slides = replies.some(function (r) { return r.from === pn0.front; });
  }
  var landed = g.board[m.to], reach = attacksFrom(g, m.to).length;
  var castledShelter = (m.flags & Chess.F_CASTLE) ? shelter(g, side, m.to) : 0;
  Chess.unmake(g);

  if (mated) {
    out.push({ concept: "checkmate", weight: 100,
      text: "Checkmate — the king is attacked and there is no move that saves it. That's the whole game: not capturing the king, but leaving it nowhere to go." });
    return out;
  }
  if (stale) {
    out.push({ concept: "stalemate", weight: 100,
      text: "Stalemate: they aren't in check, but they have no legal move at all — so it's a <b>draw</b>. When you're far ahead, always give the losing king a square to breathe." });
    return out;
  }

  /* a threat of mate is the loudest thing a quiet move can say */
  if (threat) {
    out.push({ concept: "mateThreat", weight: 93, squares: [threat.move.from, threat.move.to],
      text: "That threatens <b>mate</b>: " + threat.san.replace(/#$/, "") +
        " next move would be checkmate unless they deal with it. Whenever a move of theirs arrives, ask first: <i>what does it threaten?</i>" });
  }

  /* new forks (the classic aha) — every one reported here wins
     something whatever they reply */
  for (i = 0; i < after.forks.length; i++) {
    var f = after.forks[i];
    if (wasFork(st, f)) continue;
    var vs = f.victims.slice(0, 2).map(function (v) {
      return "the " + name(v.piece) + " on " + sqName(v.sq);
    });
    var other = f.victims.filter(function (v) { return kindOf(v.piece) !== K; })[0];
    /* a fork that only ever wins a pawn is true, and worth a note, but
       not worth stopping the game for */
    var big = f.victims.some(function (v) { return kindOf(v.piece) !== K && kindOf(v.piece) !== P; });
    out.push({
      concept: "fork", weight: !big ? 72 : f.check ? 92 : 88,
      squares: [f.by].concat(f.victims.map(function (v) { return v.sq; })),
      text: "That's a <b>fork</b> — your " + name(f.piece) + " on " + sqName(f.by) +
        " attacks " + vs.join(" and ") + " at the same time. " +
        (f.check ? "One of them is the king, so they must answer the check — and then the " +
                   name(other.piece) + " falls."
                 : "They only get one move: whichever they save, you take the other.")
    });
    break;
  }

  /* new pins */
  for (i = 0; i < after.lines.pins.length; i++) {
    var pn = after.lines.pins[i];
    if (wasLine(st, pn)) continue;
    var front = name(pn.frontPiece);
    out.push({
      concept: "pin", weight: 84, squares: [pn.by, pn.front, pn.back],
      text: "That's a <b>pin</b>: your " + name(pn.piece) + " on " + sqName(pn.by) +
        " lines up on their " + front + " (" + sqName(pn.front) + ") with " +
        (pn.absolute ? "their <b>king</b>" : "their " + name(pn.backPiece) + " on " + sqName(pn.back)) +
        " behind it. " +
        (pn.absolute
          ? (pn.slides
              ? "Stepping off that line would expose the king, so it <b>can only move along it</b> — and you can pile more attackers onto it."
              : "Moving it would expose the king, so it is <b>not allowed to move at all</b> — it's frozen, and you can pile more attackers onto it.")
          : "If the " + front + " steps off that line, your " + name(pn.piece) + " can take the " +
            name(pn.backPiece) + " — so it is stuck where it is for now.")
    });
    break;
  }

  /* new skewers */
  for (i = 0; i < after.lines.skewers.length; i++) {
    var sk = after.lines.skewers[i];
    if (wasLine(st, sk)) continue;
    out.push({
      concept: "skewer", weight: 82, squares: [sk.by, sk.front, sk.back],
      text: "That's a <b>skewer</b> — a pin turned around. The valuable piece is in <i>front</i>: their " +
        name(sk.frontPiece) + " on " + sqName(sk.front) +
        (sk.check ? " is in check and has to step aside" : " is attacked and has to move") +
        ", and then your " + name(sk.piece) + " takes the " + name(sk.backPiece) + " behind it."
    });
    break;
  }

  /* the move hung something (only worth saying if it wasn't already hanging) */
  for (i = 0; i < after.ownLoose.length; i++) {
    var l = after.ownLoose[i];
    if (wasLoose[l.sq]) continue;
    if (l.value < 300) continue;                       /* pawns: don't nag */
    if (l.sq === m.to && moveSee > -GAIN) continue;    /* a trade or a win, not a gift */
    var where = "your " + name(l.piece) + " on " + sqName(l.sq);
    out.push({
      concept: "hanging", weight: 95, squares: [l.sq, l.from],
      text: "Careful — " +
        (l.why === "undefended"
          ? "that leaves " + where + " where it can be taken for free."
          : l.why === "cheaper"
            ? "their " + name(l.attacker) + " can take " + where + ", and a " + name(l.attacker) +
              " for a " + name(l.piece) + " is a bad trade even if you take back."
            : where + " is now attacked more times than it is defended, so they can win it in the exchanges.") +
        " Before every move, it's worth one glance: <i>what can they take?</i>"
    });
    break;
  }

  /* structural praise, in plain terms */
  if (m.flags & Chess.F_CASTLE) {
    out.push({ concept: "castling", weight: 70,
      text: "Castled — two jobs in one move: the king steps away from the open centre" +
        (castledShelter >= 2 ? " to stand behind its pawns" : "") +
        ", and the rook comes off the corner toward the middle." });
  } else if (m.promo) {
    out.push({ concept: "promotion", weight: 90,
      text: kindOf(m.promo) === Q
        ? "Promotion! A pawn that walks the whole board becomes a queen. This is why endgame pawns are precious — every one is a queen in waiting."
        : "Promotion — to a " + name(m.promo) + " rather than a queen. That's rare, and usually because a queen would stalemate or the " + name(m.promo) + " does a job the queen can't." });
  } else if (gaveCheck) {
    out.push({ concept: "check", weight: 60,
      text: "Check — they must deal with it right now" +
        (options.length === 1 ? ", and the only way is to " + options[0]
          : options.length ? ", and the only ways are to " + joinOr(options) : "") +
        ". Nothing else is legal." });
  }

  if (early && kindOf(m.piece) === P && (fileOf(m.to) === 3 || fileOf(m.to) === 4) &&
      (rankOf(m.to) === 3 || rankOf(m.to) === 4)) {
    var cover = [m.to + 16 * side - 1, m.to + 16 * side + 1].map(sqName);
    out.push({ concept: "centre", weight: 40, squares: [m.to],
      text: "A pawn in the centre: from " + sqName(m.to) + " it takes " + cover.join(" and ") +
        " away from their pieces and gives yours room behind it. That's the quiet reason most openings start this way." });
  }
  if (early && (kindOf(m.piece) === N || kindOf(m.piece) === B) &&
      rankOf(m.from) === homeRank(side) && landed) {
    var rim = fileOf(m.to) === 0 || fileOf(m.to) === 7;
    out.push({ concept: "development", weight: 38, squares: [m.from, m.to],
      text: kindOf(m.piece) === N
        ? (rim
            ? "That develops the knight, but to the edge: from " + sqName(m.to) + " it watches only " + reach +
              " squares, where one nearer the middle watches up to 8. <i>A knight on the rim is dim.</i>"
            : "Development: a piece off the back row and into the game. From " + sqName(m.to) +
              " the knight watches " + reach + " squares; on the edge it would watch 4 or fewer.")
        : "Development: a piece off the back row and into the game. From " + sqName(m.to) +
          " the bishop already reaches " + reach + " squares." });
  }

  out.sort(function (a, b) { return b.weight - a.weight; });
  return out;
}

/* ---------- opportunities the player could still take ----------
   Used by the Academy's "look again" nudges and the hint copy. */
function opportunities(g, side) {
  var out = [], i;
  if (g.turn === side) {
    var mate = mateInOne(g);
    if (mate) {
      out.push({ concept: "checkmate", weight: 100,
        text: "There is a <b>checkmate in one</b> here. Look for checks first: which check leaves them no square, no block, and no capture?" });
    }
  }
  var loose = looseFor(g, -side);
  for (i = 0; i < loose.length; i++) {
    var l = loose[i];
    if (l.value < 300) continue;
    out.push({ concept: "hanging", weight: 80, squares: [l.sq, l.from],
      text: looseSentence(l, "their") +
        " Free material is the cheapest way to win a game; always scan for it before anything clever." });
    break;
  }
  var fs = forks(g, side);
  for (i = 0; i < fs.length; i++) {
    out.push({ concept: "fork", weight: 70, squares: [fs[i].by],
      text: "Your " + name(fs[i].piece) + " on " + sqName(fs[i].by) + " already hits two things at once — they can't both be saved." });
    break;
  }
  var br = backRank(g, -side);
  if (br) {
    out.push({ concept: "backRank", weight: 65, squares: [br.king].concat(br.squares),
      text: "Their king can't get off its back row: a rook or queen landing on " + sqName(br.squares[0]) +
        " would be checkmate. This is the most common way club games end." });
  }
  out.sort(function (a, b) { return b.weight - a.weight; });
  return out;
}

/* Is `side`'s own house in order? Used for gentle pre-move nudges. */
function warnings(g, side) {
  var out = [], own = looseFor(g, side), i;
  for (i = 0; i < own.length; i++) {
    var l = own[i];
    if (l.value < 300) continue;
    out.push({ concept: "hanging", weight: 90, squares: [l.sq, l.from],
      text: looseSentence(l, "your") });
    break;
  }
  var br = backRank(g, side);
  if (br) out.push({ concept: "backRank", weight: 60, squares: [br.king].concat(br.squares),
    text: "Your king can't get off its back row — a rook or queen landing on " + sqName(br.squares[0]) +
      " would be checkmate. Worth making a square for it before that matters." });
  return out;
}

/* ---------- what does this move really do? ----------
   For hints. `g` is the position before the move; returns
   { text, squares, concept } naming the most concrete thing the move
   does — a capture and what it wins, a fork, a mate threat, a pin, a
   loose piece attacked, a piece saved — or null when nothing concrete
   applies, so the caller can fall back to a principle instead of
   dressing one up as a reason. At most two ideas, best first. */
function explainMove(g, m) {
  if (!g || !m || !g.board || g.board[m.from] !== m.piece || !m.piece) return null;
  var side = colorOf(m.piece), kind = kindOf(m.piece), facts = [], i;
  var gain = m.capt ? seeMove(g, m) : null;
  var promoGain = m.promo ? seeMove(g, m) : null;
  var inCheck0 = Chess.inCheck(g, side);
  var own0 = looseFor(g, side), their0 = looseFor(g, -side);
  var ownWas = {}, theirWas = {};
  for (i = 0; i < own0.length; i++) ownWas[own0[i].sq] = own0[i];
  for (i = 0; i < their0.length; i++) theirWas[their0[i].sq] = true;
  var st = standing(g, side);
  var early = g.full <= 12;

  Chess.make(g, m);
  var replies = Chess.moves(g), check = Chess.inCheck(g, -side);
  var mate = check && !replies.length, stale = !check && !replies.length;
  var A = null;
  if (!mate && !stale) {
    A = {
      forks: forks(g, side), lines: lines(g, side),
      own: looseFor(g, side), their: looseFor(g, -side),
      threat: check ? null : mateThreat(g, side),
      recapture: bestCapture(g, m.to, -side),
      hits: attacksFrom(g, m.to),
      reach: attacksFrom(g, m.to).length,
      passed: kind === P && !m.promo ? passed(g, m.to, side) : false
    };
    for (i = 0; i < A.lines.pins.length; i++) {
      var p0 = A.lines.pins[i];
      p0.slides = replies.some(function (r) { return r.from === p0.front; });
    }
  }
  Chess.unmake(g);

  var at = sqName(m.to);
  if (mate) return { text: "It's checkmate — the king is attacked and has nowhere to go.",
                     squares: [m.from, m.to], concept: "checkmate" };
  if (stale) return { text: "It's stalemate — they have no legal move and aren't in check, so the game is drawn.",
                      squares: [m.from, m.to], concept: "stalemate" };

  function fact(rank, concept, text, squares) { facts.push({ rank: rank, concept: concept, text: text, squares: squares || [] }); }
  var spoken = {};                  /* squares already named, so two facts don't repeat each other */

  /* material, counted honestly. A recapture is told as the end of an
     exchange, not as a gift: "takes the bishop for free" is true of the
     square and false of the game when they took your knight a moment ago. */
  var last = g.hist && g.hist.length ? g.hist[g.hist.length - 1].m : null;
  var recap = !!(last && last.capt && last.to === m.to);
  if (gain !== null) {
    var taken = name(m.capt);
    if (recap) {
      var net = gain - VAL[kindOf(last.capt)];
      fact(10, "trade", net >= GAIN ? "Takes back on " + at + " and comes out ahead in the exchange."
        : net > -GAIN ? "Takes back on " + at + ", so the exchange comes out even."
        : "Takes back on " + at + " — that gets some of it back, though the exchange still costs material.", [m.to]);
    } else if (gain >= GAIN) {
      fact(10, "hanging", A.recapture
        ? "Wins material: it takes the " + taken + " on " + at + ", and even after they take back you come out ahead."
        : "Takes the " + taken + " on " + at + " for free — nothing can take back.", [m.to]);
    } else if (gain > -GAIN) {
      fact(15, "trade", "An even trade: it takes the " + taken + " on " + at + ", and after they take back, material is level.", [m.to]);
    } else {
      fact(58, "sacrifice", "A sacrifice: it gives up more than it takes, so the point is in what follows — look at what it opens up.", [m.to]);
    }
    spoken[m.to] = true;
  }
  if (m.promo) {
    fact(12, "promotion", "Promotes the pawn to a " + name(m.promo) +
      (!A.recapture ? "."
        : promoGain >= GAIN ? " — and if they take it, you take back and still come out ahead."
        : ", though they can take the new piece."), [m.to]);
  }
  /* A piece they can take back without losing anything is about to
     leave the board, so what it threatens from there is not the point
     of the move — the trade is. */
  var exposed = !!(A.recapture && A.recapture.gain > -GAIN);

  /* tactics this move creates (forks and skewers are already proved
     against every reply, including taking the attacker) */
  for (i = 0; i < A.forks.length; i++) {
    var f = A.forks[i];
    if (wasFork(st, f)) continue;
    var named = f.victims.slice(0, 2).map(function (v) { return "the " + name(v.piece) + " on " + sqName(v.sq); });
    var rest = f.victims.filter(function (v) { return kindOf(v.piece) !== K; })[0];
    fact(20, "fork", "Forks " + named.join(" and ") +
      (f.check ? ": they must answer the check, and then the " + name(rest.piece) + " falls."
               : ": whichever they save, you take the other."),
      [f.by].concat(f.victims.map(function (v) { return v.sq; })));
    f.victims.forEach(function (v) { spoken[v.sq] = true; });
    break;
  }
  if (A.threat && !(exposed && A.threat.move.from === m.to)) {
    fact(25, "checkmate", "Threatens mate: " + A.threat.san.replace(/#$/, "") + " next move would be checkmate unless they stop it.",
      [A.threat.move.from, A.threat.move.to]);
  }
  for (i = 0; i < A.lines.skewers.length; i++) {
    var sk = A.lines.skewers[i];
    if (wasLine(st, sk)) continue;
    fact(30, "skewer", "Skewers the " + name(sk.frontPiece) + " on " + sqName(sk.front) + ": once it " +
      (sk.check ? "steps out of check" : "moves") + ", the " + name(sk.backPiece) + " on " + sqName(sk.back) + " behind it falls.",
      [sk.by, sk.front, sk.back]);
    spoken[sk.front] = spoken[sk.back] = true;
    break;
  }
  for (i = 0; i < A.lines.pins.length; i++) {
    var pn = A.lines.pins[i];
    if (wasLine(st, pn) || (exposed && pn.by === m.to)) continue;
    fact(35, "pin", "Pins the " + name(pn.frontPiece) + " on " + sqName(pn.front) + " to the " + name(pn.backPiece) +
      (pn.absolute
        ? (pn.slides ? ": it can only move along that line." : ": it can't move at all.")
        : ": if it steps aside, the " + name(pn.backPiece) + " on " + sqName(pn.back) + " can be taken."),
      [pn.by, pn.front, pn.back]);
    spoken[pn.front] = true;
    break;
  }
  /* Their pieces that this move makes winnable. Not asked after a
     check: while their king is in check none of their defenders may
     legally recapture, so everything of theirs looks loose for exactly
     one move, and saying so would be untrue. */
  for (i = 0; i < A.their.length && !check; i++) {
    var l = A.their[i];
    if (theirWas[l.sq] || spoken[l.sq]) continue;
    var direct = A.hits.indexOf(l.sq) >= 0;
    if (direct && exposed) continue;
    if (inCheck0 && !direct) continue;
    /* if nothing new is aiming at it, what changed is the defence, and
       "opens up an attack" would be untrue */
    var hadAim = !direct && st.hits[l.from] && st.hits[l.from].targets[l.sq] === l.piece;
    var what = name(l.piece) + " on " + sqName(l.sq);
    fact(40, "hanging", hadAim
      ? (l.why === "undefended" ? "Leaves the " + what + " with no defender."
         : l.why === "outnumbered" ? "Leaves the " + what + " attacked more times than it is defended."
         : "Leaves the " + what + " open to a cheaper attacker.")
      : direct && l.why === "outnumbered"
        ? "Piles onto the " + what + ": it is now attacked more times than it is defended."
        : (direct ? "Attacks the " : "Opens up an attack on the ") + what +
          (l.why === "undefended" ? ", which nothing defends."
            : l.why === "cheaper" ? " with a cheaper piece, so defending it isn't enough."
            : ", which is attacked more times than it is defended."),
      [direct ? m.to : l.from, l.sq]);
    break;
  }
  if (check && !facts.some(function (x) { return x.concept === "fork" || x.concept === "skewer"; })) {
    fact(50, "check", "Gives check, so their reply is forced.", [m.to]);
  }
  /* saving something of ours — not asked when either side is in check,
     because then one side's captures all look illegal for exactly one
     move, and "saved" would only mean "they're busy" */
  if (!inCheck0 && !check) {
    var stillLoose = {};
    for (i = 0; i < A.own.length; i++) stillLoose[A.own[i].sq] = true;
    if (ownWas[m.from] && !stillLoose[m.to] && gain === null) {
      fact(45, "hanging", "Moves the " + name(m.piece) + " out of danger — it was under attack on " + sqName(m.from) + ".", [m.from, m.to]);
    } else {
      for (var s in ownWas) {
        s = +s;
        if (s === m.from || stillLoose[s]) continue;
        fact(45, "hanging", "Saves the " + name(ownWas[s].piece) + " on " + sqName(s) +
          ": it was under attack, and now taking it no longer wins anything.", [s]);
        break;
      }
    }
  }

  /* quieter, but still concrete */
  if (m.flags & Chess.F_CASTLE) {
    fact(70, "castling", "Castles: the king steps away from the centre and the rook comes toward the middle.", [m.from, m.to]);
  }
  if (A.passed) {
    var togo = side === 1 ? 7 - rankOf(m.to) : rankOf(m.to);
    fact(55, "promotion", "Pushes the passed pawn — no pawn of theirs can stop it — to " + togo +
      " step" + (togo === 1 ? "" : "s") + " from queening.", [m.to]);
  }
  if ((kind === N || kind === B) && rankOf(m.from) === homeRank(side) && early &&
      fileOf(m.to) > 0 && fileOf(m.to) < 7) {
    fact(80, "development", "Develops the " + name(m.piece) + " toward the centre — from " + at +
      " it " + (kind === N ? "watches " : "reaches ") + A.reach + " squares.", [m.from, m.to]);
  }
  if (early && kind === P && !m.capt && (fileOf(m.to) === 3 || fileOf(m.to) === 4) &&
      (rankOf(m.to) === 3 || rankOf(m.to) === 4)) {
    fact(85, "centre", "Stakes a claim in the centre — from " + at + " the pawn takes " +
      sqName(m.to + 16 * side - 1) + " and " + sqName(m.to + 16 * side + 1) + " away from their pieces.", [m.to]);
  }
  if (kind === R && !m.capt && fileOf(m.from) !== fileOf(m.to)) {
    var open = true;
    for (var r = 0; r < 8; r++) if (kindOf(g.board[r * 16 + fileOf(m.to)]) === P) { open = false; break; }
    if (open) fact(75, "rook", "Puts the rook on the open " + "abcdefgh"[fileOf(m.to)] + "-file, where nothing blocks it.", [m.to]);
  }

  if (!facts.length) return null;
  facts.sort(function (a, b) { return a.rank - b.rank; });
  var use = facts.slice(0, 2), squares = [m.from, m.to];
  use.forEach(function (x) {
    x.squares.forEach(function (q) { if (squares.indexOf(q) < 0) squares.push(q); });
  });
  return {
    text: use.map(function (x, k) { return k ? "Also: " + x.text.charAt(0).toLowerCase() + x.text.slice(1) : x.text; }).join(" "),
    squares: squares,
    concept: use[0].concept
  };
}

var Teach = {
  attacksFrom: attacksFrom, attackersOf: attackersOf,
  see: see, seeMove: seeMove, bestCapture: bestCapture,
  isLoose: isLoose, looseFor: looseFor,
  forks: forks, lines: lines, backRank: backRank, mateInOne: mateInOne, mateThreat: mateThreat,
  scan: scan, afterMove: afterMove, opportunities: opportunities, warnings: warnings,
  explainMove: explainMove,
  pieceName: name, VAL: VAL, GAIN: GAIN
};
if (typeof module !== "undefined" && module.exports) module.exports = Teach;
else root.Teach = Teach;
})(typeof self !== "undefined" ? self : this);
