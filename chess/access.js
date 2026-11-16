/* access.js — the board in words, and moves typed in.

   A screen reader cannot see a canvas, and a fast player on a laptop
   would rather type Nf3 than drag a knight. Both need the same two
   things, and this module is those two things and nothing else — no
   DOM, no drawing, no input handling:

   - words for the board: a move ("knight to f3, check"), a square
     ("e2, white pawn"), the whole position ("where is everything"), a
     result;
   - a reader for what was typed: SAN as people actually type it ("Nf3",
     "e4", "exd5", "O-O", "0-0", "e8=Q", "e8Q", lower-case "nf3"), and
     the plain from-to form ("e2e4", "e7e8q"). It is matched against the
     legal moves, so it can never let through a move the rules refuse,
     and when it cannot pick one it says why: "Nbd2 or Nfd2 — which
     one?", "No knight of yours can go to f3.", "You can't castle
     kingside right now."

   And one small piece of geometry: where an arrow key takes the
   keyboard's square, given which way round the board is.

   Pure and Node-testable: chess/tools/access-check.js. */
(function (root) {
"use strict";

var Chess = (typeof module !== "undefined" && module.exports)
  ? require("./engine.js") : root.Chess;

var NAME = ["", "pawn", "knight", "bishop", "rook", "queen", "king"];
var PLURAL = ["", "pawns", "knights", "bishops", "rooks", "queens", "kings"];
var LETTER = { K: 6, Q: 5, R: 4, B: 3, N: 2 };

function sqName(sq) { return Chess.sqName(sq); }
function kindOf(p) { return Math.abs(p | 0); }
function colourWord(side) { return side > 0 ? "White" : "Black"; }

/* ---------- words for a move ---------- */
/* m is the engine's move ({from, to, piece, capt, promo, flags}); san
   is what the engine wrote for it, which carries check and mate and
   whether the from-square had to be named. */
function moveWords(m, san) {
  san = String(san || "");
  var tail = /#$/.test(san) ? ", checkmate" : /\+$/.test(san) ? ", check" : "";
  if (m.flags & Chess.F_CASTLE) return (m.to > m.from ? "castles kingside" : "castles queenside") + tail;
  var kind = kindOf(m.piece), name = NAME[kind] || "piece";
  var ep = !!(m.flags & Chess.F_EP);
  var body = san.replace(/[+#!?]+$/, "");
  /* the engine names the from-square only when two of a kind could go;
     a pawn that takes always carries its file */
  var named = kind === 1 ? !!(m.capt || ep) : /^[KQRBN][a-h1-8]{1,2}x?[a-h][1-8]/.test(body);
  var w = name + (named ? " from " + sqName(m.from) : "");
  if (ep) w += " takes pawn en passant, to " + sqName(m.to);
  else if (m.capt) w += " takes " + (NAME[kindOf(m.capt)] || "piece") + " on " + sqName(m.to);
  else w += " to " + sqName(m.to);
  if (m.promo) w += ", becomes a " + NAME[kindOf(m.promo)];
  return w + tail;
}
/* "White: knight to f3, check" */
function sayMove(m, san) { return colourWord(m.piece > 0 ? 1 : -1) + ": " + moveWords(m, san); }

/* ---------- words for a square and a position ---------- */
function squareWords(board, sq) {
  var p = board[sq] | 0;
  return sqName(sq) + ", " + (p ? (p > 0 ? "white " : "black ") + NAME[kindOf(p)] : "empty");
}
function listWords(items) {
  if (items.length < 2) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}
/* "White to move. White: king g1, queen d1, rooks a1 and h1, …
    Black: …" — the pieces strongest first, each kind's squares from
   the a-file across, so the same position always reads the same way. */
function position(g) {
  var out = [colourWord(g.turn) + " to move" + (Chess.inCheck(g) ? ", in check" : "") + "."];
  [1, -1].forEach(function (side) {
    var parts = [];
    [6, 5, 4, 3, 2, 1].forEach(function (kind) {
      var at = [];
      for (var sq = 0; sq < 128; sq++) {
        if ((sq & 0x88) === 0 && g.board[sq] === kind * side) at.push(sq);
      }
      if (!at.length) return;
      at.sort(function (a, b) { return ((a & 7) - (b & 7)) || ((a >> 4) - (b >> 4)); });
      parts.push((at.length > 1 ? PLURAL[kind] : NAME[kind]) + " " + listWords(at.map(sqName)));
    });
    out.push(colourWord(side) + ": " + parts.join(", ") + ".");
  });
  return out.join(" ");
}
var REASON = { checkmate: "checkmate", stalemate: "stalemate", insufficient: "not enough material to mate" };
/* "Checkmate. White wins, 1–0." */
function resultWords(result, reason) {
  var why = REASON[reason] || String(reason || "");
  var head = why ? why.charAt(0).toUpperCase() + why.slice(1) + ". " : "";
  if (result === "draw") return head + "A draw, half a point each.";
  return head + (result === "white" ? "White wins, 1–0." : "Black wins, 0–1.");
}

/* ---------- reading a typed move ---------- */
function bare(san) { return String(san).replace(/[+#]+$/, ""); }
function sanOf(g, m) { return bare(Chess.toSAN(g, m)); }
/* moves that differ only by the promotion piece are one move until the
   piece is chosen */
function distinct(list) {
  var seen = {}, out = [];
  list.forEach(function (m) { var k = m.from + ":" + m.to; if (!seen[k]) { seen[k] = 1; out.push(m); } });
  return out;
}
function hasKind(g, kind) {
  for (var sq = 0; sq < 128; sq++) if ((sq & 0x88) === 0 && g.board[sq] === kind * g.turn) return true;
  return false;
}
var HOW = "Type a move like Nf3, e4, exd5 or O-O — or the two squares, like e2e4.";

/* parse(g, text) →
     { move }                      exactly one legal move (promotion piece included)
     { promote: {from, to} }       a pawn reaching the last rank, piece not said
     { error, candidates? }        nothing, or more than one; error is a sentence */
function parse(g, text) {
  var s = String(text == null ? "" : text).replace(/\s+/g, "").replace(/[+#!?]+$/, "");
  if (!s) return { error: HOW };
  var all = Chess.moves(g), cands;

  /* castling: O-O, 0-0, oo, O-O-O … */
  var cm = /^([0Oo])-?([0Oo])(-?([0Oo]))?$/.exec(s);
  if (cm) {
    var long = !!cm[3];
    cands = all.filter(function (m) { return (m.flags & Chess.F_CASTLE) && (m.to > m.from) === !long; });
    if (cands.length) return { move: cands[0] };
    return { error: "You can't castle " + (long ? "queenside" : "kingside") + " right now." };
  }

  /* the two squares: e2e4, e2-e4, e7e8q, e7e8=Q */
  var um = /^([a-h][1-8])[-x:]?([a-h][1-8])=?([qrbnQRBN])?$/.exec(s);
  if (um) {
    var from = Chess.sqIndex(um[1]), to = Chess.sqIndex(um[2]);
    var p = g.board[from] | 0;
    if (!p || (p > 0 ? 1 : -1) !== g.turn) return { error: "There's no " + colourWord(g.turn).toLowerCase() + " piece on " + um[1] + "." };
    cands = all.filter(function (m) { return m.from === from && m.to === to; });
    /* the king onto its own rook is how some people write castling */
    if (!cands.length && kindOf(p) === 6 && g.board[to] === 4 * g.turn) {
      cands = all.filter(function (m) { return m.from === from && (m.flags & Chess.F_CASTLE) && (m.to > m.from) === (to > from); });
    }
    return settle(g, cands, um[3], "The " + NAME[kindOf(p)] + " on " + um[1] + " can't go to " + um[2] +
      (Chess.inCheck(g) ? " — your king is in check." : "."));
  }

  /* SAN, leniently: captures marked or not, piece letters in either case
     except b (which is a file), promotion with or without "=" */
  var t = s.replace(/[x:×]/g, "");
  if (/^[nrqk][a-h1-8]/.test(t)) t = t.charAt(0).toUpperCase() + t.slice(1);
  var sm = /^([KQRBN])?([a-h])?([1-8])?([a-h][1-8])(?:=?([QRBNqrbn]))?$/.exec(t);
  if (!sm) return { error: "Couldn't read “" + text + "”. " + HOW };
  var kind = sm[1] ? LETTER[sm[1]] : 1;
  var ff = sm[2] ? "abcdefgh".indexOf(sm[2]) : -1, fr = sm[3] ? +sm[3] - 1 : -1;
  var dest = Chess.sqIndex(sm[4]);
  if (kind !== 1 && sm[5]) return { error: "Only a pawn can be promoted. " + HOW };
  cands = all.filter(function (m) {
    return m.to === dest && kindOf(m.piece) === kind && !(m.flags & Chess.F_CASTLE) &&
      (ff < 0 || (m.from & 7) === ff) && (fr < 0 || (m.from >> 4) === fr);
  });
  /* "d5" means the pawn on the d-file going up; only if there is none
     is it read as a capture that forgot to say where it came from */
  if (kind === 1 && ff < 0) {
    var straight = cands.filter(function (m) { return (m.from & 7) === (dest & 7); });
    if (straight.length) cands = straight;
  }
  var none;
  if (!hasKind(g, kind)) none = "You have no " + NAME[kind] + " left.";
  else none = "No " + NAME[kind] + " of yours can go to " + sm[4] + (Chess.inCheck(g) ? " — your king is in check." : ".");
  return settle(g, cands, sm[5], none);
}
function settle(g, cands, promoCh, none) {
  if (promoCh) {
    var want = LETTER[promoCh.toUpperCase()];
    if (cands.length && !cands.some(function (m) { return m.promo; })) return { error: "That move isn't a promotion." };
    cands = cands.filter(function (m) { return kindOf(m.promo) === want; });
  }
  var one = distinct(cands);
  if (!one.length) return { error: none };
  if (one.length > 1) {
    var names = one.map(function (m) { return m.promo ? sqName(m.from) + sqName(m.to) : sanOf(g, m); });
    return { error: listWords(names).replace(/ and ([^ ]+)$/, " or $1") + " — which one?", candidates: names };
  }
  if (cands.length > 1 && cands[0].promo) return { promote: { from: one[0].from, to: one[0].to } };
  return { move: cands[0] };
}

/* ---------- the keyboard's square ---------- */
/* orientation 1: White at the bottom. Up is toward the far side. */
function step(sq, key, orientation) {
  var o = orientation === -1 ? -1 : 1;
  var f = sq & 7, r = sq >> 4;
  if (key === "ArrowUp") r += o;
  else if (key === "ArrowDown") r -= o;
  else if (key === "ArrowRight") f += o;
  else if (key === "ArrowLeft") f -= o;
  f = Math.max(0, Math.min(7, f)); r = Math.max(0, Math.min(7, r));
  return r * 16 + f;
}

/* the keys, as the key card lists them */
var KEYS = [
  ["Playing", [
    ["Type a move", "Nf3, e4, exd5, O-O, e8=Q — or e2e4 — then Enter"],
    ["Tab to the board", "the arrows walk it; Enter or Space picks up and sets down; Escape puts back"],
    ["Shift W", "where everything is, read out"],
    ["[ ]", "on the board: a move back, a move forward"]
  ]],
  ["The room", [
    ["Shift U", "take back"], ["Shift H", "help"], ["Shift F", "flip the board"],
    ["Shift L", "the last move again"], ["Shift M", "the menu"],
    ["← → Home End", "look back through the game"], ["?", "why that move"],
    ["/", "these keys"], ["Escape", "back out of anything"]
  ]]
];

var Access = {
  NAME: NAME, KEYS: KEYS,
  moveWords: moveWords, sayMove: sayMove, squareWords: squareWords,
  position: position, resultWords: resultWords, parse: parse, step: step
};
if (typeof module !== "undefined" && module.exports) module.exports = Access;
else root.Access = Access;
})(typeof self !== "undefined" ? self : this);
