/* engine.js — the rules of chess, complete and honest.
   0x88 board, full legal move generation (castling, en passant,
   underpromotion), check / checkmate / stalemate, every draw rule
   (fifty moves, threefold repetition, insufficient material), FEN,
   SAN, and a small alpha-beta search used for hints, the gentle
   coach, and the practice opponent. No libraries.

   Validated by chess/tools/perft.js against the published perft
   node counts — run `node chess/tools/perft.js` before trusting a
   change to anything in the MOVES or MAKE sections. */
(function (root) {
"use strict";

/* ---------- board geometry (0x88) ----------
   Square index = rank*16 + file; a1 = 0, h1 = 7, a8 = 112, h8 = 119.
   An index & 0x88 !== 0 means "fell off the board" — the whole reason
   this layout exists. */
var P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;             // piece kinds; sign is the colour
var WHITE = 1, BLACK = -1;
var KIND_CH = ["", "p", "n", "b", "r", "q", "k"];

var N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
var K_OFF = [17, 16, 15, 1, -17, -16, -15, -1];
var B_OFF = [17, 15, -17, -15];
var R_OFF = [16, 1, -16, -1];

/* castling-rights bits */
var CWK = 1, CWQ = 2, CBK = 4, CBQ = 8;

/* move flags */
var F_DOUBLE = 1, F_EP = 2, F_CASTLE = 4;

function fileOf(sq) { return sq & 7; }
function rankOf(sq) { return sq >> 4; }
function onBoard(sq) { return (sq & 0x88) === 0; }
function sqName(sq) { return "abcdefgh"[fileOf(sq)] + (rankOf(sq) + 1); }
function sqIndex(name) {
  if (!name || name.length < 2) return -1;
  var f = name.charCodeAt(0) - 97, r = name.charCodeAt(1) - 49;
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return r * 16 + f;
}
/* 0x88 → 0..63 (rank-major from a1) used by the eval tables */
function sq64(sq) { return rankOf(sq) * 8 + fileOf(sq); }


/* ---------- Zobrist hashing ----------
   The transposition table needs a number for a position, and it needs it
   without walking the board. So every piece-on-square, every castling
   state, the side to move and the en-passant file each own a random key,
   and make/unmake XOR them in and out as they go.

   Two 32-bit halves rather than one. A table keyed on 32 bits alone
   collides roughly once in a few million probes, which at a million
   nodes a second means handing the search a score that belongs to a
   different position — and that surfaces as a move with no explanation,
   which is the one bug a teaching engine cannot afford. The second half
   is stored alongside and checked on every hit.

   The generator is a fixed xorshift rather than Math.random: the keys
   come out the same on every run, so a search that goes wrong goes wrong
   reproducibly. */
var zSeed = 0x9e3779b9;
function zrand() {
  zSeed ^= zSeed << 13; zSeed |= 0;
  zSeed ^= zSeed >>> 17;
  zSeed ^= zSeed << 5;  zSeed |= 0;
  return zSeed;
}
var ZP_LO = new Int32Array(12 * 64), ZP_HI = new Int32Array(12 * 64);
var ZC_LO = new Int32Array(16), ZC_HI = new Int32Array(16);
var ZE_LO = new Int32Array(8), ZE_HI = new Int32Array(8);
var ZS_LO = 0, ZS_HI = 0;
(function () {
  var i;
  for (i = 0; i < 12 * 64; i++) { ZP_LO[i] = zrand(); ZP_HI[i] = zrand(); }
  for (i = 0; i < 16; i++) { ZC_LO[i] = zrand(); ZC_HI[i] = zrand(); }
  for (i = 0; i < 8; i++) { ZE_LO[i] = zrand(); ZE_HI[i] = zrand(); }
  ZS_LO = zrand(); ZS_HI = zrand();
})();

/* 0..11: white pawn..king, then black pawn..king */
function zIndex(p) { return (p > 0 ? p - 1 : 5 - p) * 64; }

function computeHash(g) {
  var lo = 0, hi = 0, sq, p, z;
  for (sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    p = g.board[sq];
    if (!p) continue;
    z = zIndex(p) + sq64(sq);
    lo ^= ZP_LO[z]; hi ^= ZP_HI[z];
  }
  lo ^= ZC_LO[g.castling]; hi ^= ZC_HI[g.castling];
  if (g.ep >= 0) { lo ^= ZE_LO[fileOf(g.ep)]; hi ^= ZE_HI[fileOf(g.ep)]; }
  if (g.turn === BLACK) { lo ^= ZS_LO; hi ^= ZS_HI; }
  g.hLo = lo; g.hHi = hi;
  return lo;
}

var START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/* ---------- game object ---------- */
function create(fen) {
  var g = {
    board: new Int8Array(128),
    turn: WHITE,
    castling: 0,
    ep: -1,                 // en-passant target square, or -1
    half: 0,                // halfmove clock (fifty-move rule)
    full: 1,
    kings: [0, 0],          // [white king sq, black king sq]
    hist: [],               // undo records for make/unmake
    played: [],             // the human-facing game record: {move, san, key}
    startKey: "",           // repetition key of the initial position
    hLo: 0, hHi: 0          // Zobrist hash, kept incrementally by make/unmake
  };
  loadFEN(g, fen || START_FEN);
  return g;
}

function loadFEN(g, fen) {
  var parts = fen.trim().split(/\s+/);
  g.board.fill(0);
  var rows = parts[0].split("/");
  if (rows.length !== 8) throw new Error("bad FEN board");
  for (var r = 0; r < 8; r++) {
    var rank = 7 - r, f = 0, row = rows[r];
    for (var i = 0; i < row.length; i++) {
      var c = row[i];
      if (c >= "1" && c <= "8") { f += +c; continue; }
      var kind = KIND_CH.indexOf(c.toLowerCase());
      if (kind < 1 || f > 7) throw new Error("bad FEN piece");
      var col = (c === c.toUpperCase()) ? WHITE : BLACK;
      var sq = rank * 16 + f;
      g.board[sq] = kind * col;
      if (kind === K) g.kings[col === WHITE ? 0 : 1] = sq;
      f++;
    }
  }
  g.turn = (parts[1] === "b") ? BLACK : WHITE;
  g.castling = 0;
  var cr = parts[2] || "-";
  if (cr.indexOf("K") >= 0) g.castling |= CWK;
  if (cr.indexOf("Q") >= 0) g.castling |= CWQ;
  if (cr.indexOf("k") >= 0) g.castling |= CBK;
  if (cr.indexOf("q") >= 0) g.castling |= CBQ;
  g.ep = (parts[3] && parts[3] !== "-") ? sqIndex(parts[3]) : -1;
  g.half = parts[4] ? (+parts[4] | 0) : 0;
  g.full = parts[5] ? (+parts[5] | 0) : 1;
  g.hist.length = 0;
  g.played.length = 0;
  computeHash(g);
  g.startKey = key(g);
}

function fen(g) {
  var out = "";
  for (var rank = 7; rank >= 0; rank--) {
    var empty = 0;
    for (var f = 0; f < 8; f++) {
      var p = g.board[rank * 16 + f];
      if (!p) { empty++; continue; }
      if (empty) { out += empty; empty = 0; }
      var ch = KIND_CH[Math.abs(p)];
      out += p > 0 ? ch.toUpperCase() : ch;
    }
    if (empty) out += empty;
    if (rank) out += "/";
  }
  var cr = (g.castling & CWK ? "K" : "") + (g.castling & CWQ ? "Q" : "") +
           (g.castling & CBK ? "k" : "") + (g.castling & CBQ ? "q" : "");
  return out + " " + (g.turn === WHITE ? "w" : "b") + " " + (cr || "-") + " " +
         (g.ep >= 0 ? sqName(g.ep) : "-") + " " + g.half + " " + g.full;
}

/* Repetition key: board + turn + castling + en passant, but the ep square
   only counts when an en-passant capture is actually legal — that's the
   FIDE definition of "same position". */
function key(g) {
  var k = fen(g).split(" ");
  var ep = "-";
  if (g.ep >= 0) {
    var ms = movesFor(g, g.turn), i;
    for (i = 0; i < ms.length; i++) {
      if (!(ms[i].flags & F_EP)) continue;
      make(g, ms[i]);
      var ok = !inCheck(g, -g.turn);
      unmake(g);
      if (ok) { ep = sqName(g.ep); break; }
    }
  }
  return k[0] + " " + k[1] + " " + k[2] + " " + ep;
}

/* ---------- attack detection ---------- */
function attacked(g, sq, by) {
  var b = g.board, i, t, p;
  /* pawns (a white pawn on s attacks s+15 and s+17) */
  if (by === WHITE) {
    if (onBoard(sq - 15) && b[sq - 15] === P) return true;
    if (onBoard(sq - 17) && b[sq - 17] === P) return true;
  } else {
    if (onBoard(sq + 15) && b[sq + 15] === -P) return true;
    if (onBoard(sq + 17) && b[sq + 17] === -P) return true;
  }
  for (i = 0; i < 8; i++) {
    t = sq + N_OFF[i];
    if (onBoard(t) && b[t] === N * by) return true;
    t = sq + K_OFF[i];
    if (onBoard(t) && b[t] === K * by) return true;
  }
  for (i = 0; i < 4; i++) {
    for (t = sq + B_OFF[i]; onBoard(t); t += B_OFF[i]) {
      p = b[t];
      if (p) { if ((p === B * by || p === Q * by)) return true; break; }
    }
    for (t = sq + R_OFF[i]; onBoard(t); t += R_OFF[i]) {
      p = b[t];
      if (p) { if ((p === R * by || p === Q * by)) return true; break; }
    }
  }
  return false;
}

function inCheck(g, color) {
  var c = color || g.turn;
  return attacked(g, g.kings[c === WHITE ? 0 : 1], -c);
}

/* ---------- move generation ---------- */
function mv(from, to, piece, capt, promo, flags) {
  return { from: from, to: to, piece: piece, capt: capt | 0, promo: promo | 0, flags: flags | 0 };
}

/* pseudo-legal moves for `color`; legality (own king safety) is filtered
   in moves() by make/unmake */
function movesFor(g, color, capturesOnly) {
  var b = g.board, out = [], sq, p, i, t, kind;
  for (sq = 0; sq < 128; sq++) {
    if (!onBoard(sq)) continue;
    p = b[sq];
    if (!p || (p > 0 ? WHITE : BLACK) !== color) continue;
    kind = Math.abs(p);

    if (kind === P) {
      var fwd = 16 * color, startRank = color === WHITE ? 1 : 6, lastRank = color === WHITE ? 7 : 0;
      t = sq + fwd;
      if (!capturesOnly && onBoard(t) && !b[t]) {
        if (rankOf(t) === lastRank) pushPromos(out, sq, t, p, 0, 0);
        else {
          out.push(mv(sq, t, p, 0, 0, 0));
          var t2 = sq + fwd * 2;
          if (rankOf(sq) === startRank && !b[t2]) out.push(mv(sq, t2, p, 0, 0, F_DOUBLE));
        }
      }
      for (i = -1; i <= 1; i += 2) {
        t = sq + fwd + i;
        if (!onBoard(t)) continue;
        var tp = b[t];
        if (tp && (tp > 0 ? WHITE : BLACK) === -color) {
          if (rankOf(t) === lastRank) pushPromos(out, sq, t, p, tp, 0);
          else out.push(mv(sq, t, p, tp, 0, 0));
        } else if (t === g.ep) {
          out.push(mv(sq, t, p, -P * color, 0, F_EP));
        }
      }
    } else if (kind === N || kind === K) {
      var offs = kind === N ? N_OFF : K_OFF;
      for (i = 0; i < 8; i++) {
        t = sq + offs[i];
        if (!onBoard(t)) continue;
        var q = b[t];
        if (!q) { if (!capturesOnly) out.push(mv(sq, t, p, 0, 0, 0)); }
        else if ((q > 0 ? WHITE : BLACK) === -color) out.push(mv(sq, t, p, q, 0, 0));
      }
      if (kind === K && !capturesOnly) genCastles(g, color, sq, out);
    } else {
      var dirs = kind === B ? B_OFF : kind === R ? R_OFF : K_OFF; /* queen = all 8 */
      for (i = 0; i < dirs.length; i++) {
        for (t = sq + dirs[i]; onBoard(t); t += dirs[i]) {
          var q2 = b[t];
          if (!q2) { if (!capturesOnly) out.push(mv(sq, t, p, 0, 0, 0)); continue; }
          if ((q2 > 0 ? WHITE : BLACK) === -color) out.push(mv(sq, t, p, q2, 0, 0));
          break;
        }
      }
    }
  }
  return out;
}

function pushPromos(out, from, to, piece, capt, flags) {
  var color = piece > 0 ? 1 : -1;
  out.push(mv(from, to, piece, capt, Q * color, flags));
  out.push(mv(from, to, piece, capt, N * color, flags));
  out.push(mv(from, to, piece, capt, R * color, flags));
  out.push(mv(from, to, piece, capt, B * color, flags));
}

function genCastles(g, color, kingSq, out) {
  var b = g.board;
  if (color === WHITE ? kingSq !== 4 : kingSq !== 116) return;
  var kBit = color === WHITE ? CWK : CBK, qBit = color === WHITE ? CWQ : CBQ;
  if ((g.castling & (kBit | qBit)) === 0) return;
  if (attacked(g, kingSq, -color)) return;
  if (g.castling & kBit) {
    if (!b[kingSq + 1] && !b[kingSq + 2] && b[kingSq + 3] === R * color &&
        !attacked(g, kingSq + 1, -color) && !attacked(g, kingSq + 2, -color))
      out.push(mv(kingSq, kingSq + 2, K * color, 0, 0, F_CASTLE));
  }
  if (g.castling & qBit) {
    if (!b[kingSq - 1] && !b[kingSq - 2] && !b[kingSq - 3] && b[kingSq - 4] === R * color &&
        !attacked(g, kingSq - 1, -color) && !attacked(g, kingSq - 2, -color))
      out.push(mv(kingSq, kingSq - 2, K * color, 0, 0, F_CASTLE));
  }
}

/* fully legal moves for the side to move */
function moves(g, capturesOnly) {
  var pseudo = movesFor(g, g.turn, capturesOnly), out = [], i;
  for (i = 0; i < pseudo.length; i++) {
    make(g, pseudo[i]);
    if (!inCheck(g, -g.turn)) out.push(pseudo[i]);
    unmake(g);
  }
  return out;
}

function movesFrom(g, sq) {
  var all = moves(g), out = [], i;
  for (i = 0; i < all.length; i++) if (all[i].from === sq) out.push(all[i]);
  return out;
}

/* ---------- make / unmake ---------- */
function make(g, m) {
  var b = g.board, color = g.turn;
  g.hist.push({ m: m, castling: g.castling, ep: g.ep, half: g.half, hLo: g.hLo, hHi: g.hHi });
  var lo = g.hLo, hi = g.hHi, z;
  /* lift the mover off its square */
  z = zIndex(m.piece) + sq64(m.from); lo ^= ZP_LO[z]; hi ^= ZP_HI[z];
  b[m.from] = 0;
  if (m.flags & F_EP) {
    var epSq = m.to - 16 * color;
    z = zIndex(-P * color) + sq64(epSq); lo ^= ZP_LO[z]; hi ^= ZP_HI[z];
    b[epSq] = 0;
  } else if (m.capt) {
    z = zIndex(m.capt) + sq64(m.to); lo ^= ZP_LO[z]; hi ^= ZP_HI[z];
  }
  /* set it down again, as whatever it became */
  var landed = m.promo || m.piece;
  z = zIndex(landed) + sq64(m.to); lo ^= ZP_LO[z]; hi ^= ZP_HI[z];
  b[m.to] = landed;
  if (m.flags & F_CASTLE) {
    var rFrom, rTo;
    if (m.to > m.from) { rFrom = m.to + 1; rTo = m.from + 1; }
    else { rFrom = m.to - 2; rTo = m.from - 1; }
    var rook = b[rFrom];
    b[rTo] = rook; b[rFrom] = 0;
    z = zIndex(rook) + sq64(rFrom); lo ^= ZP_LO[z]; hi ^= ZP_HI[z];
    z = zIndex(rook) + sq64(rTo); lo ^= ZP_LO[z]; hi ^= ZP_HI[z];
  }
  if (Math.abs(m.piece) === K) g.kings[color === WHITE ? 0 : 1] = m.to;

  /* castling rights fall when the king or a rook moves, or a rook is taken */
  var clr = 0;
  if (m.from === 4 || m.to === 4) clr |= CWK | CWQ;
  if (m.from === 116 || m.to === 116) clr |= CBK | CBQ;
  if (m.from === 0 || m.to === 0) clr |= CWQ;
  if (m.from === 7 || m.to === 7) clr |= CWK;
  if (m.from === 112 || m.to === 112) clr |= CBQ;
  if (m.from === 119 || m.to === 119) clr |= CBK;
  if (clr & g.castling) {
    lo ^= ZC_LO[g.castling]; hi ^= ZC_HI[g.castling];
    g.castling &= ~clr;
    lo ^= ZC_LO[g.castling]; hi ^= ZC_HI[g.castling];
  }

  if (g.ep >= 0) { lo ^= ZE_LO[fileOf(g.ep)]; hi ^= ZE_HI[fileOf(g.ep)]; }
  g.ep = (m.flags & F_DOUBLE) ? m.from + 16 * color : -1;
  if (g.ep >= 0) { lo ^= ZE_LO[fileOf(g.ep)]; hi ^= ZE_HI[fileOf(g.ep)]; }

  lo ^= ZS_LO; hi ^= ZS_HI;
  g.hLo = lo; g.hHi = hi;

  g.half = (Math.abs(m.piece) === P || m.capt) ? 0 : g.half + 1;
  if (color === BLACK) g.full++;
  g.turn = -color;
}

function unmake(g) {
  var u = g.hist.pop();
  if (!u) return;
  var m = u.m, b = g.board, color = -g.turn; /* colour that made the move */
  b[m.from] = m.piece;
  b[m.to] = 0;
  if (m.flags & F_EP) b[m.to - 16 * color] = -P * color;
  else if (m.capt) b[m.to] = m.capt;
  if (m.flags & F_CASTLE) {
    if (m.to > m.from) { b[m.to + 1] = b[m.from + 1]; b[m.from + 1] = 0; }
    else { b[m.to - 2] = b[m.from - 1]; b[m.from - 1] = 0; }
  }
  if (Math.abs(m.piece) === K) g.kings[color === WHITE ? 0 : 1] = m.from;
  g.castling = u.castling;
  g.ep = u.ep;
  g.half = u.half;
  g.hLo = u.hLo; g.hHi = u.hHi;
  if (color === BLACK) g.full--;
  g.turn = color;
}

/* ---------- the played game (record + repetition) ---------- */
function play(g, m) {
  var san = toSAN(g, m);
  make(g, m);
  /* the hash rides along with the record: the search reads it back to
     learn what the game has already seen, and without it an engine a
     queen up will cheerfully shuffle into a threefold */
  g.played.push({ m: m, san: san, key: key(g), fen: fen(g), hLo: g.hLo, hHi: g.hHi });
  return san;
}

function takeBack(g) {
  if (!g.played.length) return null;
  var rec = g.played.pop();
  unmake(g);
  return rec;
}

function repetitionCount(g) {
  var k = g.played.length ? g.played[g.played.length - 1].key : g.startKey;
  var n = (k === g.startKey) ? 1 : 0, i;
  for (i = 0; i < g.played.length; i++) if (g.played[i].key === k) n++;
  return n;
}

function insufficientMaterial(g) {
  var minors = [], i, p, kind;
  for (i = 0; i < 128; i++) {
    if (!onBoard(i)) continue;
    p = g.board[i];
    if (!p) continue;
    kind = Math.abs(p);
    if (kind === K) continue;
    if (kind === P || kind === R || kind === Q) return false;
    minors.push({ kind: kind, dark: (fileOf(i) + rankOf(i)) % 2 === 0 });
    if (minors.length > 2) return false;
  }
  if (minors.length <= 1) return true;                       /* K vs K, K+minor vs K */
  return minors[0].kind === B && minors[1].kind === B &&      /* same-colour bishops */
         minors[0].dark === minors[1].dark;
}

/* {over, result:'white'|'black'|'draw'|null, reason, canClaim50, canClaim3} */
function status(g) {
  var legal = moves(g).length, check = inCheck(g);
  if (!legal) {
    if (check) return { over: true, result: g.turn === WHITE ? "black" : "white", reason: "checkmate" };
    return { over: true, result: "draw", reason: "stalemate" };
  }
  if (insufficientMaterial(g)) return { over: true, result: "draw", reason: "insufficient" };
  if (g.half >= 150) return { over: true, result: "draw", reason: "75-move rule" };
  var reps = repetitionCount(g);
  if (reps >= 5) return { over: true, result: "draw", reason: "fivefold repetition" };
  return { over: false, result: null, reason: check ? "check" : "",
           canClaim50: g.half >= 100, canClaim3: reps >= 3 };
}

/* ---------- SAN ---------- */
function toSAN(g, m) {
  var kind = Math.abs(m.piece), s;
  if (m.flags & F_CASTLE) s = m.to > m.from ? "O-O" : "O-O-O";
  else {
    s = "";
    if (kind !== P) {
      s += KIND_CH[kind].toUpperCase();
      /* disambiguation among same-kind pieces that can also reach m.to */
      var others = moves(g), needFile = false, needRank = false, clash = false, i, o;
      for (i = 0; i < others.length; i++) {
        o = others[i];
        if (o.to !== m.to || o.from === m.from || o.piece !== m.piece) continue;
        clash = true;
        if (fileOf(o.from) === fileOf(m.from)) needRank = true;
        if (rankOf(o.from) === rankOf(m.from)) needFile = true;
      }
      if (clash && !needFile && !needRank) needFile = true;
      if (needFile) s += "abcdefgh"[fileOf(m.from)];
      if (needRank) s += (rankOf(m.from) + 1);
    } else if (m.capt || (m.flags & F_EP)) {
      s += "abcdefgh"[fileOf(m.from)];
    }
    if (m.capt || (m.flags & F_EP)) s += "x";
    s += sqName(m.to);
    if (m.promo) s += "=" + KIND_CH[Math.abs(m.promo)].toUpperCase();
  }
  make(g, m);
  if (inCheck(g)) s += moves(g).length ? "+" : "#";
  unmake(g);
  return s;
}

function fromSAN(g, san) {
  var clean = String(san).replace(/[+#?!]+$/g, "").replace(/0/g, "O");
  var all = moves(g), i;
  for (i = 0; i < all.length; i++) {
    if (toSAN(g, all[i]).replace(/[+#]+$/g, "") === clean) return all[i];
  }
  return null;
}

/* ---------- evaluation ---------- */
var VAL = [0, 100, 320, 330, 500, 900, 20000];
/* piece-square tables, white's point of view, index 0 = a1 */
var PST_P = [ 0,  0,  0,  0,  0,  0,  0,  0,
              5, 10, 10,-20,-20, 10, 10,  5,
              5, -5,-10,  0,  0,-10, -5,  5,
              0,  0,  0, 20, 20,  0,  0,  0,
              5,  5, 10, 25, 25, 10,  5,  5,
             10, 10, 20, 30, 30, 20, 10, 10,
             50, 50, 50, 50, 50, 50, 50, 50,
              0,  0,  0,  0,  0,  0,  0,  0];
var PST_N = [-50,-40,-30,-30,-30,-30,-40,-50,
             -40,-20,  0,  5,  5,  0,-20,-40,
             -30,  5, 10, 15, 15, 10,  5,-30,
             -30,  0, 15, 20, 20, 15,  0,-30,
             -30,  5, 15, 20, 20, 15,  5,-30,
             -30,  0, 10, 15, 15, 10,  0,-30,
             -40,-20,  0,  0,  0,  0,-20,-40,
             -50,-40,-30,-30,-30,-30,-40,-50];
var PST_B = [-20,-10,-10,-10,-10,-10,-10,-20,
             -10,  5,  0,  0,  0,  0,  5,-10,
             -10, 10, 10, 10, 10, 10, 10,-10,
             -10,  0, 10, 10, 10, 10,  0,-10,
             -10,  5,  5, 10, 10,  5,  5,-10,
             -10,  0,  5, 10, 10,  5,  0,-10,
             -10,  0,  0,  0,  0,  0,  0,-10,
             -20,-10,-10,-10,-10,-10,-10,-20];
var PST_R = [  0,  0,  0,  5,  5,  0,  0,  0,
              -5,  0,  0,  0,  0,  0,  0, -5,
              -5,  0,  0,  0,  0,  0,  0, -5,
              -5,  0,  0,  0,  0,  0,  0, -5,
              -5,  0,  0,  0,  0,  0,  0, -5,
              -5,  0,  0,  0,  0,  0,  0, -5,
               5, 10, 10, 10, 10, 10, 10,  5,
               0,  0,  0,  0,  0,  0,  0,  0];
var PST_Q = [-20,-10,-10, -5, -5,-10,-10,-20,
             -10,  0,  5,  0,  0,  0,  0,-10,
             -10,  5,  5,  5,  5,  5,  0,-10,
               0,  0,  5,  5,  5,  5,  0, -5,
              -5,  0,  5,  5,  5,  5,  0, -5,
             -10,  0,  5,  5,  5,  5,  0,-10,
             -10,  0,  0,  0,  0,  0,  0,-10,
             -20,-10,-10, -5, -5,-10,-10,-20];
var PST_K_MID = [ 20, 30, 10,  0,  0, 10, 30, 20,
                  20, 20,  0,  0,  0,  0, 20, 20,
                 -10,-20,-20,-20,-20,-20,-20,-10,
                 -20,-30,-30,-40,-40,-30,-30,-20,
                 -30,-40,-40,-50,-50,-40,-40,-30,
                 -30,-40,-40,-50,-50,-40,-40,-30,
                 -30,-40,-40,-50,-50,-40,-40,-30,
                 -30,-40,-40,-50,-50,-40,-40,-30];
var PST_K_END = [-50,-30,-30,-30,-30,-30,-30,-50,
                 -30,-30,  0,  0,  0,  0,-30,-30,
                 -30,-10, 20, 30, 30, 20,-10,-30,
                 -30,-10, 30, 40, 40, 30,-10,-30,
                 -30,-10, 30, 40, 40, 30,-10,-30,
                 -30,-10, 20, 30, 30, 20,-10,-30,
                 -30,-20,-10,  0,  0,-10,-20,-30,
                 -50,-40,-30,-20,-20,-30,-40,-50];
var PSTS = [null, PST_P, PST_N, PST_B, PST_R, PST_Q, null];

/* ---------- evaluation ----------
   Material and piece-square tables carried the old evaluation on their
   own, which is enough to avoid hanging a rook and not nearly enough to
   explain a position to anybody. A coach that says "this is equal" when
   one side has three isolated pawns and no bishop is not teaching; it is
   guessing politely.

   So: tapered between a middlegame and an endgame reading rather than
   flipped at a threshold (a hard switch makes the score jump when a
   queen comes off, and a jump in the score is a jump in the advice),
   plus the handful of terms a club player is actually taught to look
   at — pawn structure, open files, mobility, the shelter round the king,
   and the bishop pair. */

var VAL_MG = [0, 85, 330, 345, 480, 960, 0];
var VAL_EG = [0, 100, 300, 320, 540, 980, 0];
/* phase weights: 24 is a full board, 0 is bare kings */
var PHASE_W = [0, 0, 1, 1, 2, 4, 0], PHASE_MAX = 24;

/* pawns want the centre early and the far rank late */
var PST_P_EG = [  0,  0,  0,  0,  0,  0,  0,  0,
                 90, 90, 90, 90, 90, 90, 90, 90,
                 55, 55, 55, 55, 55, 55, 55, 55,
                 30, 30, 32, 34, 34, 32, 30, 30,
                 14, 15, 18, 22, 22, 18, 15, 14,
                  6,  8,  9, 10, 10,  9,  8,  6,
                  2,  3,  3, -4, -4,  3,  3,  2,
                  0,  0,  0,  0,  0,  0,  0,  0];

var PASSED_MG = [0, 4, 8, 16, 30, 52, 82, 0];
var PASSED_EG = [0, 10, 20, 38, 68, 112, 170, 0];

/* scratch, reused every call so evaluation allocates nothing */
var pfW = new Int32Array(8), pfB = new Int32Array(8);
var pMinW = new Int32Array(8), pMaxW = new Int32Array(8);
var pMinB = new Int32Array(8), pMaxB = new Int32Array(8);

function mobilityOf(b, sq, kind, color) {
  var n = 0, i, t, off, p;
  if (kind === N) {
    for (i = 0; i < 8; i++) {
      t = sq + N_OFF[i];
      if (t & 0x88) continue;
      p = b[t];
      if (!p || (p > 0) !== (color > 0)) n++;
    }
    return n;
  }
  var offs = kind === B ? B_OFF : kind === R ? R_OFF : K_OFF;
  var count = kind === Q ? 8 : 4;
  for (i = 0; i < count; i++) {
    off = offs[i];
    t = sq + off;
    while (!(t & 0x88)) {
      p = b[t];
      if (p) { if ((p > 0) !== (color > 0)) n++; break; }
      n++;
      t += off;
    }
  }
  return n;
}

/* how exposed a king is: missing pawns in front of it, and open files
   beside it. Scored in the middlegame only — in an endgame the king is
   supposed to walk out. */
function kingShelter(b, ksq, color) {
  var f = fileOf(ksq), r = rankOf(ksq), pen = 0, df, file, found, step, rr;
  for (df = -1; df <= 1; df++) {
    file = f + df;
    if (file < 0 || file > 7) continue;
    found = 0;
    for (step = 1; step <= 3; step++) {
      rr = color === WHITE ? r + step : r - step;
      if (rr < 0 || rr > 7) break;
      if (b[rr * 16 + file] === P * color) { found = step; break; }
    }
    if (!found) pen += (df === 0 ? 22 : 14);
    else if (found > 1) pen += (df === 0 ? 8 : 5);
    /* a file with no pawn of either colour is a road to the king */
    if ((color === WHITE ? pfW[file] : pfB[file]) === 0 &&
        (color === WHITE ? pfB[file] : pfW[file]) === 0) pen += 12;
  }
  return pen;
}

/* static eval in centipawns from the side-to-move's point of view */
function evaluate(g) {
  var b = g.board, sq, p, kind, idx, i;
  var mg = 0, eg = 0, phase = 0;
  var bishopsW = 0, bishopsB = 0;
  pfW.fill(0); pfB.fill(0);
  pMinW.fill(8); pMaxW.fill(-1); pMinB.fill(8); pMaxB.fill(-1);

  /* pass one: pawns, so structure is known before anything leans on it */
  for (sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    p = b[sq];
    if (p === P) {
      i = fileOf(sq); pfW[i]++;
      if (rankOf(sq) < pMinW[i]) pMinW[i] = rankOf(sq);
      if (rankOf(sq) > pMaxW[i]) pMaxW[i] = rankOf(sq);
    } else if (p === -P) {
      i = fileOf(sq); pfB[i]++;
      if (rankOf(sq) < pMinB[i]) pMinB[i] = rankOf(sq);
      if (rankOf(sq) > pMaxB[i]) pMaxB[i] = rankOf(sq);
    }
    if (p) { kind = p > 0 ? p : -p; phase += PHASE_W[kind]; }
  }
  if (phase > PHASE_MAX) phase = PHASE_MAX;

  for (sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    p = b[sq];
    if (!p) continue;
    var white = p > 0;
    kind = white ? p : -p;
    idx = white ? sq64(sq) : sq64(sq ^ 0x70);
    var f = fileOf(sq), r = white ? rankOf(sq) : 7 - rankOf(sq);
    var vmg = VAL_MG[kind], veg = VAL_EG[kind];

    if (kind === K) {
      vmg += PST_K_MID[idx];
      veg += PST_K_END[idx];
      vmg -= kingShelter(b, sq, white ? WHITE : BLACK);
    } else if (kind === P) {
      vmg += PST_P[idx];
      veg += PST_P_EG[idx];
      var own = white ? pfW : pfB, opp = white ? pfB : pfW;
      if (own[f] > 1) { vmg -= 14; veg -= 22; }                 /* doubled */
      var hasNeighbour = (f > 0 && own[f - 1]) || (f < 7 && own[f + 1]);
      if (!hasNeighbour) { vmg -= 16; veg -= 20; }              /* isolated */
      var blocked = false;
      for (i = (f > 0 ? f - 1 : 0); i <= (f < 7 ? f + 1 : 7); i++) {
        if (!opp[i]) continue;
        if (white ? (pMaxB[i] > rankOf(sq)) : (pMinW[i] < rankOf(sq))) { blocked = true; break; }
      }
      if (!blocked) { vmg += PASSED_MG[r]; veg += PASSED_EG[r]; }
    } else {
      vmg += PSTS[kind][idx];
      veg += PSTS[kind][idx];
      var mob = mobilityOf(b, sq, kind, white ? WHITE : BLACK);
      if (kind === N) { vmg += (mob - 4) * 4; veg += (mob - 4) * 4; }
      else if (kind === B) { vmg += (mob - 6) * 4; veg += (mob - 6) * 5; white ? bishopsW++ : bishopsB++; }
      else if (kind === R) {
        vmg += (mob - 7) * 2; veg += (mob - 7) * 4;
        var ownF = white ? pfW[f] : pfB[f], oppF = white ? pfB[f] : pfW[f];
        if (!ownF) { vmg += oppF ? 12 : 26; veg += oppF ? 8 : 16; }   /* semi-open / open */
        if (r === 6) { vmg += 20; veg += 14; }                        /* the seventh */
      } else if (kind === Q) { vmg += (mob - 14); veg += (mob - 14) * 2; }
    }
    if (white) { mg += vmg; eg += veg; } else { mg -= vmg; eg -= veg; }
  }

  if (bishopsW >= 2) { mg += 28; eg += 44; }
  if (bishopsB >= 2) { mg -= 28; eg -= 44; }

  var score = ((mg * phase) + (eg * (PHASE_MAX - phase))) / PHASE_MAX;
  score = score | 0;
  return g.turn === WHITE ? score : -score;
}

/* ---------- search ----------
   Plain alpha-beta with material ordering got to depth five or six in a
   second, which is enough to take a hanging queen and not enough to see
   why it was hanging. Everything below is in service of depth, because
   depth is what makes the coach's advice true rather than plausible:

     • a transposition table, so a position reached two ways is thought
       about once;
     • killer moves and a history table, so the move that refuted the
       last branch is tried first in the next one — ordering is worth
       more than any other single thing in alpha-beta;
     • null-move pruning, which asks "if I pass and am still winning,
       is this branch worth reading?" and usually it is not;
     • late-move reductions, searching the unpromising tail shallowly
       and only re-reading it if it surprises us;
     • check extensions, because a forcing line is exactly where a
       shallow search tells its most convincing lies;
     • and repetition detection inside the search, so a winning engine
       stops shuffling and a losing one starts. */

var MATE = 100000, MATE_IN_MAX = MATE - 1000;
var searchDeadline = 0, searchNodes = 0, searchAborted = false;

function now() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }

/* ---- transposition table ----
   Parallel typed arrays rather than objects: one allocation at startup
   and no garbage during a search. Indexed by the low half of the hash,
   verified against the high half, so a collision is caught rather than
   believed. */
var TT_BITS = 16, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
var ttHi, ttMove, ttScore, ttDepth, ttFlag, ttAge, ttGen = 0;
function allocTT(bits) {
  TT_BITS = Math.max(10, Math.min(22, bits | 0));
  TT_SIZE = 1 << TT_BITS; TT_MASK = TT_SIZE - 1;
  ttHi = new Int32Array(TT_SIZE);
  ttMove = new Int32Array(TT_SIZE);
  ttScore = new Int32Array(TT_SIZE);
  ttDepth = new Int8Array(TT_SIZE);
  ttFlag = new Int8Array(TT_SIZE);
  ttAge = new Int8Array(TT_SIZE);
}
allocTT(16);
var TT_EXACT = 1, TT_LOWER = 2, TT_UPPER = 3;

/* moves pack into one int so the table and the killer slots can hold
   them without keeping the move objects alive */
function packMove(m) { return m ? ((m.from & 255) | ((m.to & 255) << 8) | (((m.promo ? (m.promo > 0 ? m.promo : -m.promo) : 0) & 15) << 16)) : 0; }
function samePacked(m, code) {
  if (!code) return false;
  return (m.from & 255) === (code & 255) && (m.to & 255) === ((code >> 8) & 255) &&
         ((m.promo ? (m.promo > 0 ? m.promo : -m.promo) : 0) & 15) === ((code >> 16) & 15);
}

/* ---- ordering memory ---- */
var MAX_PLY = 96;
var killer1 = new Int32Array(MAX_PLY), killer2 = new Int32Array(MAX_PLY);
var history = new Int32Array(64 * 64);
var pathLo = new Int32Array(MAX_PLY + 8), pathHi = new Int32Array(MAX_PLY + 8);
var histLo = [], histHi = [];          /* positions the real game has seen */

/* the principal variation, as a triangular table: pv[ply] holds the line
   from that ply down, which is what lets the coach say what happens next
   instead of only what to play now */
var pvLen = new Int32Array(MAX_PLY);
var pvTable = [];
(function () { for (var i = 0; i < MAX_PLY; i++) pvTable.push(new Int32Array(MAX_PLY)); })();

function clearTables() {
  killer1.fill(0); killer2.fill(0); history.fill(0);
  ttGen = (ttGen + 1) & 127;
}

function hasNonPawnMaterial(g, color) {
  var sq, p, kind;
  for (sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    p = g.board[sq];
    if (!p) continue;
    if ((p > 0) !== (color > 0)) continue;
    kind = p > 0 ? p : -p;
    if (kind !== P && kind !== K) return true;
  }
  return false;
}

/* a position already seen, in this line or in the game, is a draw as far
   as the search is concerned — two occurrences are enough to steer by */
function isRepetition(g, ply) {
  var lo = g.hLo, hi = g.hHi, back = g.half, i;
  if (back < 4) return false;
  for (i = ply - 2; i >= 0 && ply - i <= back; i -= 2) {
    if (pathLo[i] === lo && pathHi[i] === hi) return true;
  }
  var rem = back - ply;
  for (i = histLo.length - 2; i >= 0 && histLo.length - i <= rem; i -= 2) {
    if (histLo[i] === lo && histHi[i] === hi) return true;
  }
  return false;
}

function orderMoves(ms, ttCode, ply) {
  var i, m, s;
  for (i = 0; i < ms.length; i++) {
    m = ms[i];
    s = 0;
    if (ttCode && samePacked(m, ttCode)) s = 2000000000;
    else if (m.capt) s = 1000000 + VAL[m.capt > 0 ? m.capt : -m.capt] * 16 - VAL[m.piece > 0 ? m.piece : -m.piece];
    else if (m.promo) s = 900000 + VAL[m.promo > 0 ? m.promo : -m.promo];
    else if (samePacked(m, killer1[ply])) s = 800000;
    else if (samePacked(m, killer2[ply])) s = 700000;
    else s = history[sq64(m.from) * 64 + sq64(m.to)];
    if (m.promo && m.capt) s += 900000;
    m._s = s;
  }
  ms.sort(function (a, b) { return b._s - a._s; });
  return ms;
}

/* ---- quiescence ----
   Captures only, so the evaluation is never taken in the middle of a
   trade. Delta pruning throws away captures that cannot rescue the
   position even if they win the piece for free. */
function quiesce(g, alpha, beta, ply) {
  searchNodes++;
  if (ply >= MAX_PLY - 2) return evaluate(g);
  if ((searchNodes & 2047) === 0 && now() > searchDeadline) { searchAborted = true; return alpha; }
  var stand = evaluate(g);
  if (stand >= beta) return beta;
  if (ply < MAX_PLY - 2 && stand + 975 < alpha) return alpha;   /* hopeless even a queen up */
  if (stand > alpha) alpha = stand;
  var caps = moves(g, true), i, sc, m;
  orderMoves(caps, 0, ply < MAX_PLY ? ply : MAX_PLY - 1);
  for (i = 0; i < caps.length; i++) {
    m = caps[i];
    if (!m.promo && m.capt && stand + VAL[m.capt > 0 ? m.capt : -m.capt] + 180 < alpha) continue;
    make(g, m);
    sc = -quiesce(g, -beta, -alpha, ply + 1);
    unmake(g);
    if (searchAborted) return alpha;
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function alphabeta(g, depth, alpha, beta, ply, canNull) {
  if ((searchNodes & 1023) === 0 && now() > searchDeadline) { searchAborted = true; return alpha; }
  var isPV = beta - alpha > 1;
  pvLen[ply] = 0;

  if (ply > 0) {
    if (isRepetition(g, ply) || g.half >= 100) return 0;
    /* mate-distance pruning: a mate found higher up cannot be beaten */
    var mAlpha = alpha > -MATE + ply ? alpha : -MATE + ply;
    var mBeta = beta < MATE - ply - 1 ? beta : MATE - ply - 1;
    if (mAlpha >= mBeta) return mAlpha;
    alpha = mAlpha; beta = mBeta;
  }

  var inChk = inCheck(g);
  if (inChk && depth < MAX_PLY - 4) depth++;        /* check extension */
  if (depth <= 0) return quiesce(g, alpha, beta, ply);
  searchNodes++;

  var idx = (g.hLo & TT_MASK) >>> 0, ttCode = 0;
  if (ttHi[idx] === g.hHi) {
    ttCode = ttMove[idx];
    if (ttDepth[idx] >= depth && ply > 0) {
      var ts = ttScore[idx];
      if (ts > MATE_IN_MAX) ts -= ply; else if (ts < -MATE_IN_MAX) ts += ply;
      var fl = ttFlag[idx];
      if (fl === TT_EXACT) return ts;
      if (fl === TT_LOWER && ts >= beta) return ts;
      if (fl === TT_UPPER && ts <= alpha) return ts;
    }
  }

  /* null move: hand the opponent a free turn. If we are still above beta
     after that, this branch is not where the game is decided. Skipped in
     check, in pawn endings (where passing really would be best) and when
     the window is a real one. */
  if (!isPV && !inChk && canNull && depth >= 3 && beta < MATE_IN_MAX &&
      hasNonPawnMaterial(g, g.turn)) {
    var stand = evaluate(g);
    if (stand >= beta) {
      var R = 2 + (depth > 6 ? 1 : 0);
      makeNull(g);
      pathLo[ply] = g.hLo; pathHi[ply] = g.hHi;
      var nv = -alphabeta(g, depth - 1 - R, -beta, -beta + 1, ply + 1, false);
      unmakeNull(g);
      if (searchAborted) return alpha;
      if (nv >= beta) return beta < MATE_IN_MAX ? nv : beta;
    }
  }

  var ms = moves(g), i, sc, m, best = -Infinity, bestMove = 0, raised = false, cutoff = false;
  if (!ms.length) return inChk ? -MATE + ply : 0;
  orderMoves(ms, ttCode, ply);
  pathLo[ply] = g.hLo; pathHi[ply] = g.hHi;

  var searched = 0;
  for (i = 0; i < ms.length; i++) {
    m = ms[i];
    var quiet = !m.capt && !m.promo;
    make(g, m);
    var givesCheck = inCheck(g);
    if (searched === 0) {
      sc = -alphabeta(g, depth - 1, -beta, -alpha, ply + 1, true);
    } else {
      /* late-move reduction: the tail of a well-ordered list rarely
         repays a full read, so read it short and only go back if it
         raises alpha */
      var red = 0;
      if (quiet && depth >= 3 && searched >= 3 && !inChk && !givesCheck) {
        red = 1 + (searched >= 8 && depth >= 6 ? 1 : 0);
      }
      sc = -alphabeta(g, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
      if (!searchAborted && sc > alpha && (red || isPV)) {
        sc = -alphabeta(g, depth - 1, -beta, -alpha, ply + 1, true);
      }
    }
    unmake(g);
    if (searchAborted) break;
    searched++;

    if (sc > best) {
      best = sc; bestMove = packMove(m);
      if (sc > alpha) {
        alpha = sc; raised = true;
        /* record the line, so the coach can say what follows */
        pvTable[ply][0] = bestMove;
        var n = pvLen[ply + 1], k;
        for (k = 0; k < n; k++) pvTable[ply][k + 1] = pvTable[ply + 1][k];
        pvLen[ply] = n + 1;
        if (alpha >= beta) {
          cutoff = true;
          if (quiet) {
            if (killer1[ply] !== bestMove) { killer2[ply] = killer1[ply]; killer1[ply] = bestMove; }
            history[sq64(m.from) * 64 + sq64(m.to)] += depth * depth;
          }
          break;
        }
      }
    }
  }

  if (best === -Infinity) return alpha;
  if (!searchAborted) {
    var store = best;
    if (store > MATE_IN_MAX) store += ply; else if (store < -MATE_IN_MAX) store -= ply;
    if (ttDepth[idx] <= depth || ttAge[idx] !== ttGen) {
      ttHi[idx] = g.hHi; ttMove[idx] = bestMove; ttScore[idx] = store;
      ttDepth[idx] = depth > 127 ? 127 : depth;
      ttFlag[idx] = cutoff ? TT_LOWER : (raised ? TT_EXACT : TT_UPPER);
      ttAge[idx] = ttGen;
    }
  }
  return best;
}

/* a null move is a turn handed over: side flips, en passant clears */
function makeNull(g) {
  g.hist.push({ m: null, castling: g.castling, ep: g.ep, half: g.half, hLo: g.hLo, hHi: g.hHi, nul: true });
  if (g.ep >= 0) { g.hLo ^= ZE_LO[fileOf(g.ep)]; g.hHi ^= ZE_HI[fileOf(g.ep)]; }
  g.ep = -1;
  g.hLo ^= ZS_LO; g.hHi ^= ZS_HI;
  g.turn = -g.turn;
  g.half++;
}
function unmakeNull(g) {
  var u = g.hist.pop();
  g.castling = u.castling; g.ep = u.ep; g.half = u.half;
  g.hLo = u.hLo; g.hHi = u.hHi;
  g.turn = -g.turn;
}

/* Seed the repetition history from a list of earlier positions. The
   search runs in a worker, which is handed a position rather than a
   game, and a position on its own cannot remember what it has already
   been — so the page sends the FENs it has seen and they are hashed back
   into something the search can check against. */
function seedRepetition(g, fens) {
  g.played.length = 0;
  if (!fens || !fens.length) return g;
  var tmp = { board: new Int8Array(128), kings: [0, 0], hist: [], played: [] }, i;
  for (i = 0; i < fens.length; i++) {
    try {
      loadFEN(tmp, fens[i]);
      g.played.push({ m: null, san: "", key: "", fen: fens[i], hLo: tmp.hLo, hHi: tmp.hHi });
    } catch (e) { /* a position we can't read is one we can't claim a repetition on */ }
  }
  return g;
}

/* the game's own history, so the search knows what has already been on
   the board and will not walk into a repetition it cannot afford */
function loadHistory(g) {
  histLo.length = 0; histHi.length = 0;
  for (var i = 0; i < g.played.length; i++) {
    if (g.played[i].hLo === undefined) continue;
    histLo.push(g.played[i].hLo); histHi.push(g.played[i].hHi);
  }
}

function pvSANs(g, ply, max) {
  var out = [], made = 0, i, code, ms, j, m;
  var n = Math.min(pvLen[ply], max || 6);
  for (i = 0; i < n; i++) {
    code = pvTable[ply][i];
    ms = moves(g); m = null;
    for (j = 0; j < ms.length; j++) if (samePacked(ms[j], code)) { m = ms[j]; break; }
    if (!m) break;
    out.push(toSAN(g, m));
    make(g, m); made++;
  }
  while (made--) unmake(g);
  return out;
}

/* Score a specific list of moves with full windows, so the numbers are
   comparable with each other. The root search uses narrow windows and
   returns bounds for everything it did not have to read properly, which
   is right for picking a move and wrong for explaining one — and every
   piece of coaching in this app is a comparison between moves. */
function scoreMoves(g, list, opts) {
  opts = opts || {};
  var depth = opts.depth || 4;
  searchDeadline = now() + (opts.ms || 400);
  searchAborted = false;
  loadHistory(g);
  var out = [], i, sc;
  pathLo[0] = g.hLo; pathHi[0] = g.hHi;
  for (i = 0; i < list.length; i++) {
    if (searchAborted) break;
    make(g, list[i]);
    sc = -alphabeta(g, depth - 1, -Infinity, Infinity, 1, true);
    unmake(g);
    /* A search cut short by the clock returns whatever alpha happened to
       be, and mate-distance pruning clamps alpha to "mated at this ply" —
       so an abort reads as a forced mate. Recording that number puts a
       phantom mate at the top of the list the coach trusts most. The
       move is left to the fallback below instead. */
    if (searchAborted) break;
    out.push({ move: list[i], score: sc });
  }
  /* Anything the clock ran out on still gets a number, because a move
     that is simply missing from this list reads to the coach as "nothing
     to say" — which is how a coach goes quiet exactly when it was
     needed. But a one-ply number is not comparable with a five-ply one:
     left to sort together the shallow ones float to the top on
     optimism, and the top of this list is precisely what the hint and
     the review trust. So they are kept, and kept underneath. */
  for (; i < list.length; i++) {
    make(g, list[i]);
    sc = -quiesce(g, -Infinity, Infinity, 1);
    unmake(g);
    out.push({ move: list[i], score: sc, shallow: true });
  }
  out.sort(function (a, b) {
    if (!a.shallow !== !b.shallow) return a.shallow ? 1 : -1;
    return b.score - a.score;
  });
  return out;
}

/* ---------- review ----------
   What a coach actually needs is not a best move but a comparison: how
   much worse was the move that got played than the move that was there?
   Both sides of that subtraction have to be measured the same way or the
   number is meaningless, so both are scored by the same call at the same
   depth — never one from a deep search and the other from a shallow
   ranking, which is the subtle way this sort of feature goes wrong. */
function review(g, played, opts) {
  opts = opts || {};
  var budget = opts.ms || 500;
  /* `mark` asks the extra question a good move deserves: not "how much
     worse than the best was this?" but "how much better than everything
     else was it?". Praise that cannot tell a forced move from a found
     one is worth nothing, so the runner-up is scored by the same
     yardstick as the other two — one more entry in a list that is
     already being scored, which is close to free. */
  var wantMark = !!opts.mark;
  var r = search(g, { ms: Math.round(budget * 0.55), maxDepth: opts.maxDepth || 64, rank: wantMark });
  if (!r.move) return null;
  var samePlayed = function (m) {
    return m.from === played.from && m.to === played.to && (m.promo || 0) === (played.promo || 0);
  };
  var same = samePlayed(r.move);
  var list = same ? [played] : [r.move, played];
  var alt = null, i;
  if (wantMark && r.ranked) {
    for (i = 0; i < r.ranked.length; i++) {
      var rm = r.ranked[i].move;
      if (samePlayed(rm) || rm === r.move) continue;
      alt = rm; break;
    }
    if (alt) list.push(alt);
  }
  var depth = Math.max(3, Math.min(r.depth || 4, opts.depth || 6));
  var sc = scoreMoves(g, list, { depth: depth, ms: Math.round(budget * 0.45) });
  var bestScore = null, playedScore = null, altScore = null, m;
  for (i = 0; i < sc.length; i++) {
    m = sc[i].move;
    if (samePlayed(m)) playedScore = sc[i].score;
    if (m === r.move) bestScore = sc[i].score;
    if (alt && m === alt) altScore = sc[i].score;
  }
  if (same) bestScore = playedScore;
  if (playedScore === null || bestScore === null) return null;
  /* the deeper root search may have seen further than the ranking pass */
  if (bestScore < playedScore) bestScore = playedScore;

  /* Naming the punishment is the lesson. "Nc6 was better" tells you what
     to memorise; "Qxe5+ picks up the rook" tells you what you missed,
     and only the second one transfers to the next game. Worth one more
     short search when something actually went wrong. */
  var refute = null;
  if (bestScore - playedScore >= 100) {
    make(g, played);
    var after = search(g, { ms: Math.round(budget * 0.4) });
    if (after.move) refute = { san: toSAN(g, after.move), pv: after.pv };
    unmake(g);
  }
  return { best: r.move, alt: alt, bestScore: bestScore, playedScore: playedScore,
           loss: bestScore - playedScore, pv: r.pv, refute: refute, depth: depth,
           /* how far clear of the next-best move the played one stands.
              Null when nobody asked, or when there was no second move to
              compare it with — which is itself worth knowing, because a
              position with one legal move cannot be played well. */
           only: (altScore !== null && playedScore !== null) ? playedScore - altScore : null,
           alone: wantMark && sc.length < 2 };
}

var rootBest = null;

/* Iterative-deepening root search.
   opts: { ms, maxDepth, noise (cp of random slack for a weaker, more
   human opponent), rank (score every root move properly for the coach) }
   Returns { move, score, depth, nodes, ranked, pv }. */
function search(g, opts) {
  opts = opts || {};
  var budget = opts.ms || 350, maxDepth = opts.maxDepth || 64;
  var rootMoves = moves(g);
  if (!rootMoves.length) return { move: null, score: 0, depth: 0, nodes: 0, ranked: [], pv: [] };
  /* The ranked list costs real time, so it is taken out of the budget
     rather than added to it: a coach that thinks for twice as long as it
     promised makes the clock lie. It is only earned when somebody will
     read it — a hint, a blunder check, or the slack the practice
     opponent uses to play like a person. */
  var wantRank = opts.rank === true || !!opts.noise;
  /* never more than a third, and never so much that the search itself is
     left with no time — a 60ms hint used to hand the ranking 80ms and
     start the search already past its deadline */
  var rankMs = wantRank ? Math.min(Math.max(50, budget * 0.3), 400, budget * 0.35) : 0;
  searchDeadline = now() + (budget - rankMs);
  searchNodes = 0; searchAborted = false;
  clearTables();
  loadHistory(g);

  var best = rootMoves[0], bestScore = 0, depth = 0, i, pv = [];
  var alpha = -Infinity, beta = Infinity, window = 40;

  for (var d = 1; d <= maxDepth; d++) {
    var iterStart = now();
    if (d > 1) { alpha = bestScore - window; beta = bestScore + window; }
    var v, tries = 0;
    for (;;) {
      v = rootSearch(g, d, alpha, beta, rootMoves, best);
      if (searchAborted) break;
      if (v <= alpha) { alpha = v - (window <<= 1); tries++; }
      else if (v >= beta) { beta = v + (window <<= 1); tries++; }
      else break;
      if (tries > 4) { alpha = -Infinity; beta = Infinity; }
    }
    if (searchAborted && !rootBest) break;
    if (rootBest) { best = rootBest; bestScore = v; depth = d; pv = pvSANs(g, 0, 8); }
    window = 40;
    if (searchAborted) break;
    if (Math.abs(bestScore) > MATE_IN_MAX) break;        /* forced mate found */
    /* each iteration costs several times the last; with under a third of
       the budget left the next one cannot finish, and an unfinished
       iteration is thrown away */
    if (now() - iterStart > (searchDeadline - iterStart) * 0.45) break;
  }

  /* a ranked list the coach can reason about */
  var ranked;
  if (wantRank) {
    var rd = Math.max(2, Math.min(depth || 2, opts.rankDepth || 5));
    /* chosen move first: the ranking runs shallower than the search and
       may not reach the end of the list, and a ranking that never scored
       the move being recommended is how the coach ends up contradicting
       itself in the same sentence */
    var order = [best];
    for (i = 0; i < rootMoves.length; i++) if (rootMoves[i] !== best) order.push(rootMoves[i]);
    ranked = scoreMoves(g, order, { depth: rd, ms: rankMs });
  } else {
    ranked = [{ move: best, score: bestScore }];
  }

  /* The practice opponent plays below its strength on purpose, and *how*
     it does that is the difference between an opponent and a random
     number generator. Picking uniformly from everything within the slack
     makes it play a near-best move and a near-disaster equally often,
     which reads as erratic rather than weak. Weighting toward the better
     end gives the shape of a real player of that level: mostly sensible,
     occasionally loose. Moves scored only by the fallback are left out —
     a shallow number is exactly where the howlers hide. */
  if (opts.noise && ranked.length > 1) {
    var top = ranked[0].score, pool = [], weights = [], total = 0, w;
    for (i = 0; i < ranked.length; i++) {
      if (ranked[i].shallow) continue;
      var drop = top - ranked[i].score;
      if (drop > opts.noise) continue;
      w = (opts.noise - drop) + opts.noise * 0.25;
      pool.push(ranked[i]); weights.push(w); total += w;
    }
    if (pool.length) {
      var roll = Math.random() * total, k = 0;
      while (k < pool.length - 1 && roll > weights[k]) { roll -= weights[k]; k++; }
      best = pool[k].move; bestScore = pool[k].score;
    }
  }
  return { move: best, score: bestScore, depth: depth, nodes: searchNodes, ranked: ranked, pv: pv };
}

function rootSearch(g, depth, alpha, beta, rootMoves, prevBest) {
  rootBest = null;
  var i, sc, m, best = -Infinity;
  var ttCode = prevBest ? packMove(prevBest) : 0;
  orderMoves(rootMoves, ttCode, 0);
  pathLo[0] = g.hLo; pathHi[0] = g.hHi;
  for (i = 0; i < rootMoves.length; i++) {
    m = rootMoves[i];
    make(g, m);
    if (i === 0) sc = -alphabeta(g, depth - 1, -beta, -alpha, 1, true);
    else {
      sc = -alphabeta(g, depth - 1, -alpha - 1, -alpha, 1, true);
      if (!searchAborted && sc > alpha && sc < beta) sc = -alphabeta(g, depth - 1, -beta, -alpha, 1, true);
    }
    unmake(g);
    if (searchAborted) break;
    if (sc > best) {
      best = sc; rootBest = m;
      if (sc > alpha) {
        alpha = sc;
        pvTable[0][0] = packMove(m);
        var n = pvLen[1], k;
        for (k = 0; k < n; k++) pvTable[0][k + 1] = pvTable[1][k];
        pvLen[0] = n + 1;
      }
      if (alpha >= beta) break;
    }
  }
  return best === -Infinity ? alpha : best;
}

/* ---------- perft (used by chess/tools/perft.js) ---------- */
function perft(g, depth) {
  if (depth === 0) return 1;
  var ms = moves(g), n = 0, i;
  if (depth === 1) return ms.length;
  for (i = 0; i < ms.length; i++) {
    make(g, ms[i]);
    n += perft(g, depth - 1);
    unmake(g);
  }
  return n;
}

/* ---------- exports ---------- */
var Chess = {
  P: P, N: N, B: B, R: R, Q: Q, K: K, WHITE: WHITE, BLACK: BLACK,
  F_DOUBLE: F_DOUBLE, F_EP: F_EP, F_CASTLE: F_CASTLE,
  START_FEN: START_FEN, VAL: VAL, MATE: MATE,
  create: create, loadFEN: loadFEN, fen: fen, key: key,
  moves: moves, movesFrom: movesFrom, make: make, unmake: unmake,
  play: play, takeBack: takeBack, status: status, inCheck: inCheck,
  attacked: attacked, repetitionCount: repetitionCount,
  toSAN: toSAN, fromSAN: fromSAN,
  evaluate: evaluate, search: search, scoreMoves: scoreMoves, review: review, perft: perft,
  seedRepetition: seedRepetition,
  setHashBits: allocTT,
  sqName: sqName, sqIndex: sqIndex, fileOf: fileOf, rankOf: rankOf, onBoard: onBoard
};

if (typeof module !== "undefined" && module.exports) module.exports = Chess;
else root.Chess = Chess;
})(typeof self !== "undefined" ? self : this);
