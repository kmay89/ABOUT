/* pgn.js — notation: the open way in and out.

   Every chess program on earth speaks two plain-text languages. PGN is a
   game: a few tags in square brackets (who, where, when, the result),
   then the moves in the algebraic notation a club player writes on a
   score sheet. FEN is a position: the board rank by rank, whose move it
   is, what castling is still allowed. A room that can only keep its
   games to itself is a toy to anybody who already plays, so this file
   is the door both ways.

   Out, it is strict: the seven-tag roster in its order, [SetUp] and
   [FEN] when the game did not begin from the usual position, move
   numbers that know Black may have moved first, lines under eighty
   columns, and the result at the end. The journal (games.js) and game
   links (share.js) both write through write() here, so the format is
   written once.

   In, it is forgiving the way a person is: tags or none, {comments} and
   ;comments, (side lines) skipped however deep, $NAGs and !? glyphs,
   move numbers as "12." or "12..." or glued to the move, 0-0 for O-O,
   e8Q and e8(Q) for e8=Q, × or : for a capture, a knight named by more
   squares than it needs. But it trusts nothing: every move is played on
   the room's own rules (engine.js), and at the first one that is not
   legal it stops, keeps what came before, and says which move and why.
   Several games in one paste open the first, and say so.

   And a position is checked harder than the engine's own loader does
   (Chess.create will build a board with no kings): one king each, no
   pawn on the first or last rank, the side not to move not in check,
   no more than thirty-two men, castling rights that match the men on
   their squares and an en-passant square that a pawn really just made.
   Rights that do not match are dropped, with a note, rather than the
   whole position refused — a hand-typed FEN gets them wrong more often
   than not.

   Pure: no DOM, no storage. Whatever replays moves takes `Chess` as an
   argument, so node can check it (chess/tools/pgn-check.js). */
/* global module */
(function (root) {
"use strict";

var START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
var MAX_TEXT = 300000;          /* characters of paste we will even look at */
var MAX_PLIES = 600;
var TAG_MAX = 80;
var ROSTER = ["Event", "Site", "Date", "Round", "White", "Black", "Result"];
var ROSTER_DEFAULT = { Event: "?", Site: "?", Date: "????.??.??", Round: "?", White: "?", Black: "?" };
var RESULTS = ["1-0", "0-1", "1/2-1/2", "*"];
var WIDTH = 79;                 /* "under eighty columns", as the standard asks */
var KIND = { K: 6, Q: 5, R: 4, B: 3, N: 2 };
var KIND_NAME = ["", "pawn", "knight", "bishop", "rook", "queen", "king"];

/* ---------- small helpers ---------- */
function fields(fen) { return String(fen || "").trim().split(/\s+/); }
/* is this the usual starting position? (the counters included: a game
   "from the start" at move 30 is a set-up position) */
function isStart(fen) { return !fen || fields(fen).join(" ") === START; }
function firstBlack(fen) { return !isStart(fen) && fields(fen)[1] === "b"; }
function firstNo(fen) {
  if (isStart(fen)) return 1;
  var n = parseInt(fields(fen)[5], 10);
  return n >= 1 ? n : 1;
}
/* the number and the dot(s) a ply is written with, from a start */
function moveNo(ply, fen) { return firstNo(fen) + Math.floor((ply + (firstBlack(fen) ? 1 : 0)) / 2); }
function blackPly(ply, fen) { return (ply + (firstBlack(fen) ? 1 : 0)) % 2 === 1; }
function label(ply, fen, san) { return moveNo(ply, fen) + (blackPly(ply, fen) ? "\u2026 " : ". ") + san; }
/* a tag's value is somebody else's text: one line, no control characters, not too long */
function tagText(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max || TAG_MAX);
}
function tagLine(k, v) {
  return "[" + k + ' "' + tagText(v, 255).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]';
}
function wrap(words) {
  var lines = [], cur = "";
  for (var i = 0; i < words.length; i++) {
    if (cur && cur.length + 1 + words[i].length > WIDTH) { lines.push(cur); cur = words[i]; }
    else cur = cur ? cur + " " + words[i] : words[i];
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ---------- out ----------
   o: { headers: [[name, value], …] in the order wanted after the roster,
        sans: [...], result: "1-0"|"0-1"|"1/2-1/2"|"*",
        fen: the starting position, when it was not the usual one,
        marks: { ply: "!!"|"!"|"?!"|"?"|"??" } — written on the move } */
function write(o) {
  o = o || {};
  var res = RESULTS.indexOf(o.result) >= 0 ? o.result : "*";
  var given = {}, order = [];
  (o.headers || []).forEach(function (t) {
    if (!t || t.length < 2 || t[1] == null) return;
    var k = String(t[0]);
    if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) return;
    if (!Object.prototype.hasOwnProperty.call(given, k)) order.push(k);
    given[k] = t[1];
  });
  given.Result = res;
  var fen = isStart(o.fen) ? null : fields(o.fen).join(" ");
  var out = ROSTER.map(function (k) {
    return tagLine(k, Object.prototype.hasOwnProperty.call(given, k) ? given[k] : ROSTER_DEFAULT[k]);
  });
  if (fen) { out.push(tagLine("SetUp", "1")); out.push(tagLine("FEN", fen)); }
  order.forEach(function (k) {
    if (ROSTER.indexOf(k) < 0 && k !== "SetUp" && k !== "FEN") out.push(tagLine(k, given[k]));
  });
  var sans = o.sans || [], marks = o.marks || {}, words = [];
  for (var i = 0; i < sans.length; i++) {
    if (!blackPly(i, fen)) words.push(moveNo(i, fen) + ".");
    else if (i === 0) words.push(moveNo(i, fen) + "...");
    words.push(String(sans[i]) + (marks[i] || ""));
  }
  words.push(res);
  return out.join("\n") + "\n\n" + wrap(words).join("\n") + "\n";
}

/* ---------- a position ----------
   → { ok, fen (tidied), why, notes: [plain sentences], turn: 1|-1, men } */
function validFen(text, Chess) {
  var bad = function (why) { return { ok: false, why: why, notes: [] }; };
  var t = String(text == null ? "" : text).trim();
  if (!t) return bad("There's nothing there.");
  if (t.length > 120) return bad("That's too long to be a position.");
  /* lichess writes spaces as underscores in a link */
  var f = t.replace(/_/g, " ").split(/\s+/), notes = [];
  if (f.length > 6) return bad("A position has at most six parts; that has " + f.length + ".");
  var rows = f[0].split("/");
  if (rows.length !== 8) return bad("A board has eight ranks; that has " + rows.length + ".");
  var board = [], men = { w: 0, b: 0 }, pawns = { w: 0, b: 0 }, kings = { w: 0, b: 0 };
  for (var r = 0; r < 8; r++) {
    var row = rows[r], cells = [];
    if (!/^[pnbrqkPNBRQK1-8]+$/.test(row)) return bad("Rank " + (8 - r) + " has something that isn't a piece or a number.");
    for (var i = 0; i < row.length; i++) {
      var c = row.charAt(i);
      if (c >= "1" && c <= "8") { for (var e = 0; e < +c; e++) cells.push(""); continue; }
      cells.push(c);
      var side = c === c.toUpperCase() ? "w" : "b";
      men[side]++;
      if (/[pP]/.test(c)) {
        pawns[side]++;
        if (r === 0 || r === 7) return bad("A pawn can't stand on the " + (r === 0 ? "eighth" : "first") + " rank.");
      }
      if (/[kK]/.test(c)) kings[side]++;
    }
    if (cells.length !== 8) return bad("Rank " + (8 - r) + " adds up to " + cells.length + " squares, not eight.");
    board.push(cells);
  }
  if (kings.w !== 1 || kings.b !== 1) {
    var which = kings.w !== 1 ? "White" : "Black", n = kings.w !== 1 ? kings.w : kings.b;
    return bad(which + " has " + (n ? n + " kings" : "no king") + " — each side needs exactly one.");
  }
  if (men.w > 16 || men.b > 16) return bad((men.w > 16 ? "White" : "Black") + " has more than sixteen men.");
  if (pawns.w > 8 || pawns.b > 8) return bad((pawns.w > 8 ? "White" : "Black") + " has more than eight pawns.");
  if (men.w + men.b > 32) return bad("That's more than thirty-two men.");
  var turn = f[1] || "w";
  if (!f[1]) notes.push("No side to move was given, so it's White's turn.");
  if (turn !== "w" && turn !== "b") return bad("The side to move should be w or b, not \u201c" + turn + "\u201d.");
  var cr = f[2] || "-";
  if (!/^(-|[KQkq]{1,4})$/.test(cr) || (cr !== "-" && /(.).*\1/.test(cr))) return bad("The castling part should be letters from KQkq, or -.");
  var at = function (sq) { return board[8 - +sq.charAt(1)]["abcdefgh".indexOf(sq.charAt(0))]; };
  var keep = "", RIGHTS = { K: ["e1", "K", "h1", "R"], Q: ["e1", "K", "a1", "R"], k: ["e8", "k", "h8", "r"], q: ["e8", "k", "a8", "r"] };
  "KQkq".split("").forEach(function (k) {
    if (cr.indexOf(k) < 0) return;
    var w = RIGHTS[k];
    if (at(w[0]) === w[1] && at(w[2]) === w[3]) keep += k;
    else notes.push("Castling " + (k === k.toUpperCase() ? "White" : "Black") + (k.toLowerCase() === "k" ? " short" : " long") +
                    " was dropped: the king or rook isn't on its first square.");
  });
  var ep = f[3] || "-";
  if (!/^(-|[a-h][36])$/.test(ep)) return bad("The en-passant part should be a square on the third or sixth rank, or -.");
  if (ep !== "-") {
    var file = ep.charAt(0), want = turn === "w" ? "6" : "3";
    var pawnSq = file + (turn === "w" ? "5" : "4"), fromSq = file + (turn === "w" ? "7" : "2");
    if (ep.charAt(1) !== want || at(ep) || at(fromSq) || at(pawnSq) !== (turn === "w" ? "p" : "P")) {
      notes.push("The en-passant square " + ep + " was dropped: no pawn has just moved two squares past it.");
      ep = "-";
    }
  }
  var half = f[4] || "0", full = f[5] || "1";
  if (!/^\d{1,4}$/.test(half) || !/^\d{1,4}$/.test(full)) return bad("The last two parts should be move counts.");
  half = String(+half); full = String(Math.max(1, +full));
  var tidy = f[0] + " " + turn + " " + (keep || "-") + " " + ep + " " + half + " " + full;
  if (Chess) {
    var g;
    try { g = Chess.create(tidy); } catch (x) { return bad("That board doesn't read as a position."); }
    if (Chess.inCheck(g, -g.turn))
      return bad((turn === "w" ? "Black" : "White") + " is in check, so it can't be " + (turn === "w" ? "White" : "Black") + "'s move.");
    tidy = Chess.fen(g);
  }
  return { ok: true, fen: tidy, why: "", notes: notes, turn: turn === "w" ? 1 : -1, men: men.w + men.b };
}

/* ---------- reading a move, the way a person writes one ---------- */
var SAN_RE = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?$/;
function tidyMove(tok) {
  var s = String(tok).replace(/e\.?p\.?$/i, "").replace(/[+#\u2021\u2020!?]+$/, "");
  s = s.replace(/[\u00d7:]/g, "x").replace(/^[0o]-[0o]-[0o]$/i, "O-O-O").replace(/^[0o]-[0o]$/i, "O-O");
  /* e8Q, e8(Q), e8/Q, e8=q → e8=Q */
  s = s.replace(/([a-h][18])(?:=|\/)?\(?([QRBNqrbn])\)?$/, function (_, sq, p) { return sq + "=" + p.toUpperCase(); });
  /* a lower-case piece letter (not b — that is a pawn on the b-file) */
  if (/^[kqrn][a-h1-8x]/.test(s)) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}
function sideWord(t) { return t === 1 ? "White" : "Black"; }
/* → { move } or { why } */
function resolve(g, tok, Chess) {
  var s = tidyMove(tok), list = Chess.moves(g), i, m, hit = [];
  /* a mate, a stalemate, a fifth repetition: nothing after it happened */
  var st = Chess.status(g);
  if (st.over) return { why: "the game was already over (" + st.reason + ")" };
  if (s === "O-O" || s === "O-O-O") {
    for (i = 0; i < list.length; i++) {
      m = list[i];
      if ((m.flags & Chess.F_CASTLE) && ((m.to > m.from) === (s === "O-O"))) return { move: m };
    }
    return { why: sideWord(g.turn) + " can't castle " + (s === "O-O" ? "short" : "long") + " here" };
  }
  var p = s.match(SAN_RE);
  if (!p) return { why: "that isn't chess notation" };
  var kind = p[1] ? KIND[p[1]] : 1, to = Chess.sqIndex(p[5]);
  var ff = p[2] ? p[2].charCodeAt(0) - 97 : -1, fr = p[3] ? +p[3] - 1 : -1;
  var promo = p[6] ? KIND[p[6]] : 0;
  /* a pawn that names no file is a pawn going straight ahead */
  if (kind === 1 && ff < 0) ff = to & 7;
  for (i = 0; i < list.length; i++) {
    m = list[i];
    if (m.to !== to || Math.abs(m.piece) !== kind) continue;
    if (ff >= 0 && (m.from & 7) !== ff) continue;
    if (fr >= 0 && (m.from >> 4) !== fr) continue;
    if ((m.promo ? Math.abs(m.promo) : 0) !== promo) continue;
    hit.push(m);
  }
  if (hit.length === 1) return { move: hit[0] };
  if (hit.length > 1) return { why: "more than one " + KIND_NAME[kind] + " can go to " + p[5] + ", and it doesn't say which" };
  if (kind === 1 && !promo && (p[5].charAt(1) === "8" || p[5].charAt(1) === "1")) {
    for (i = 0; i < list.length; i++) if (list[i].to === to && list[i].promo) return { why: "a pawn reaching the last rank has to say what it becomes (" + p[5] + "=Q)" };
  }
  if (Chess.inCheck(g)) return { why: sideWord(g.turn) + " is in check, and that doesn't answer it" };
  return { why: "no " + sideWord(g.turn) + " " + KIND_NAME[kind] + " can play that here" };
}

/* ---------- in: a paste ---------- */
var RESULT_RE = /^(1-0|0-1|1\/2-1\/2|\u00bd-\u00bd|0\.5-0\.5|\*)$/;
var FEN_RE = /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}([\s_]+[wb]([\s_]+\S+){0,4})?$/;
function sniff(text) {
  var t = String(text == null ? "" : text).replace(/^\ufeff/, "").trim();
  if (!t) return null;
  if (FEN_RE.test(t)) return "fen";
  if (/^\s*\[[A-Za-z0-9_]+\s+"/m.test(t) || /(^|\s)1\.\s*\S/.test(t) || /^\s*(1\.)?\s*([a-h][1-8]|[NBRQK][a-h]?[1-8]?x?[a-h][1-8]|O-O)/.test(t)) return "pgn";
  return null;
}
function normResult(r) { return r === "\u00bd-\u00bd" || r === "0.5-0.5" ? "1/2-1/2" : r; }

/* Split the movetext of the first game into words, skipping everything a
   reader may skip. → { headers, words, more (games after the first) } */
function scan(t) {
  var headers = {}, words = [], i = 0, n = t.length, moved = false, ended = false, rest = -1;
  function eol() { var j = t.indexOf("\n", i); i = j < 0 ? n : j + 1; }
  while (i < n) {
    var c = t.charAt(i);
    if (c === "%" && (i === 0 || t.charAt(i - 1) === "\n")) { eol(); continue; }
    if (c === "[") {
      var m = /^\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\\n]|\\.)*)"\s*\]/.exec(t.slice(i, i + 600));
      if (m) {
        if (moved || ended) { rest = i; break; }     /* the next game's tags */
        if (!Object.prototype.hasOwnProperty.call(headers, m[1]))
          headers[m[1]] = tagText(m[2].replace(/\\(["\\])/g, "$1"));
        i += m[0].length; continue;
      }
      i++; continue;
    }
    if (c === "{") { var j = t.indexOf("}", i); i = j < 0 ? n : j + 1; continue; }
    if (c === ";") { eol(); continue; }
    if (c === "(") {
      var depth = 1; i++;
      while (i < n && depth) {
        var d = t.charAt(i);
        if (d === "{") { var k = t.indexOf("}", i); i = k < 0 ? n : k + 1; continue; }
        if (d === ";") { eol(); continue; }
        if (d === "(") depth++; else if (d === ")") depth--;
        i++;
      }
      continue;
    }
    if (c === ")" || /\s/.test(c)) { i++; continue; }
    var wm = /^[^\s{}();\[\]]+/.exec(t.slice(i, i + 64));
    if (!wm) { i++; continue; }                     /* a stray } or ] */
    var w = wm[0];
    if (ended) { rest = i; break; }               /* moves after a result: another game */
    i += w.length;
    words.push(w);
    if (RESULT_RE.test(w)) ended = true; else moved = true;
  }
  var more = 0;
  if (rest >= 0) {
    var tail = t.slice(rest);
    more = (tail.match(/(^|\n)\s*\[Event\s+"/g) || []).length || 1;
  }
  return { headers: headers, words: words, more: more };
}

/* text → what it is, read and replayed:
   { ok, kind: "game"|"position"|null, fen (start, null = the usual one),
     sans, headers, white, black, result, reason, plies,
     error: null | { ply, token, why, at ("12… Nxe4") }, notes, games } */
function read(text, Chess) {
  var out = { ok: false, kind: null, fen: null, sans: [], headers: {}, white: "White", black: "Black",
              result: "*", reason: "", plies: 0, error: null, notes: [], games: 0 };
  var t = String(text == null ? "" : text).replace(/^\ufeff/, "").replace(/\r\n?/g, "\n");
  if (t.length > MAX_TEXT) { t = t.slice(0, MAX_TEXT); out.notes.push("Only the beginning of a very long paste was read."); }
  var kind = sniff(t);
  if (!kind) { out.error = { ply: 0, token: "", why: "That doesn't look like a game (PGN) or a position (FEN)." }; return out; }
  if (kind === "fen") {
    var v = validFen(t.trim(), Chess);
    if (!v.ok) { out.error = { ply: 0, token: "", why: v.why }; return out; }
    out.ok = true; out.kind = "position"; out.fen = isStart(v.fen) ? null : v.fen; out.notes = v.notes; out.games = 1;
    out.turn = v.turn; out.men = v.men;
    return out;
  }
  var sc = scan(t), h = sc.headers;
  out.headers = h; out.games = 1 + sc.more;
  if (sc.more) out.notes.push("That paste holds " + out.games + " games; this is the first.");
  if (h.White && h.White !== "?") out.white = h.White;
  if (h.Black && h.Black !== "?") out.black = h.Black;
  var start = null;
  if (h.FEN && h.SetUp !== "0") {
    var vf = validFen(h.FEN, Chess);
    if (!vf.ok) { out.error = { ply: 0, token: "", why: "Its starting position doesn't stand up: " + vf.why.charAt(0).toLowerCase() + vf.why.slice(1) }; return out; }
    start = isStart(vf.fen) ? null : vf.fen;
    vf.notes.forEach(function (s) { out.notes.push(s); });
  }
  out.fen = start;
  var g = Chess.create(start || undefined), result = null;
  for (var i = 0; i < sc.words.length; i++) {
    var w = sc.words[i];
    if (RESULT_RE.test(w)) { result = normResult(w); break; }
    if (/^\$\d+$/.test(w) || /^e\.?p\.?$/i.test(w)) continue;
    var tok = w.replace(/^\d+\s*(\.+|\u2026)/, "");
    if (!tok || /^\d+$/.test(tok)) continue;                         /* a bare move number */
    if (tok === "--" || tok === "Z0" || tok === "0000") {
      out.error = { ply: g.played.length, token: tok, why: "a null move (a pass) isn't something a board can replay" }; break;
    }
    if (/^[!?\u00b1\u2213\u2a72\u2a71=\u221e\u25a1+\-]+$/.test(tok)) continue;  /* a glyph on its own */
    if (g.played.length >= MAX_PLIES) { out.notes.push("Only the first " + MAX_PLIES + " plies were read."); break; }
    var r = resolve(g, tok, Chess);
    if (!r.move) { out.error = { ply: g.played.length, token: tok, why: r.why }; break; }
    out.sans.push(Chess.play(g, r.move));
  }
  out.plies = out.sans.length;
  if (out.error) out.error.at = label(out.error.ply, start, out.error.token);
  if (!out.plies && !start) {
    if (!out.error) out.error = { ply: 0, token: "", why: "There are no moves in it." };
    return out;
  }
  out.ok = true;
  out.kind = out.plies ? "game" : "position";
  if (!out.plies) { out.turn = g.turn; out.men = countMen(g); }
  /* the result: what the paste says, unless the board says otherwise — and
     a game that stopped early has no result yet */
  var said = result || (RESULTS.indexOf(h.Result) >= 0 ? h.Result : "*");
  var st = Chess.status(g);
  if (out.error) said = "*";
  else if (st.over) {
    var b = st.result === "white" ? "1-0" : st.result === "black" ? "0-1" : "1/2-1/2";
    if (said !== "*" && said !== b) out.notes.push("It says " + said + ", but the board says " + b + ".");
    said = b;
    out.reason = st.reason;
  }
  out.result = said;
  if (!out.reason && said !== "*" && h.Termination && !/^(normal|unterminated)$/i.test(h.Termination)) out.reason = tagText(h.Termination, 60);
  return out;
}
function countMen(g) {
  var n = 0;
  for (var i = 0; i < 128; i++) if (!(i & 0x88) && g.board[i]) n++;
  return n;
}

/* ---------- the plain sentence for what was read ---------- */
function scoreText(r) { return r === "1-0" ? "1\u20130" : r === "0-1" ? "0\u20131" : r === "1/2-1/2" ? "\u00bd\u2013\u00bd" : "no result"; }
function summary(p) {
  if (!p) return "";
  if (!p.ok) return p.error ? p.error.why : "";
  if (p.kind === "position") {
    var s = "A position, " + (p.turn === -1 ? "Black" : "White") + " to move" + (p.men ? " \u00b7 " + p.men + " men" : "") + ".";
    return s + (p.notes.length ? " " + p.notes.join(" ") : "");
  }
  var mv = Math.ceil(p.plies / 2), bits = [mv + (mv === 1 ? " move" : " moves")];
  if (p.white !== "White" || p.black !== "Black") bits.push("White: " + p.white, "Black: " + p.black);
  bits.push(scoreText(p.result) + (p.reason ? " (" + p.reason + ")" : ""));
  var line = bits.join(" \u00b7 ") + (p.fen ? " \u00b7 from a set-up position" : "") + ".";
  if (p.error) line += " It stops at " + p.error.at + ": " + p.error.why + ".";
  return line + (p.notes.length ? " " + p.notes.join(" ") : "");
}

var Pgn = {
  START: START, MAX_PLIES: MAX_PLIES, ROSTER: ROSTER,
  write: write, read: read, validFen: validFen, sniff: sniff, summary: summary,
  isStart: isStart, moveNo: moveNo, label: label, tidyMove: tidyMove
};

if (typeof module !== "undefined" && module.exports) module.exports = Pgn;
else root.Pgn = Pgn;
})(typeof self !== "undefined" ? self : this);
