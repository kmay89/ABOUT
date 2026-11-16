/* ink.js — the pen: what you draw, kept with the position.

   Every serious player draws on the board: an arrow for the plan, a
   circle round the square that matters, an arrow the other way for the
   thing coming at you. This module is the paper those marks are made
   on, and nothing else — no DOM, no drawing, no input.

   The one decision that shapes all of it: a drawing belongs to the
   *position* it was made on, not to the screen. Looking back is the
   room's main way of learning, and a note you made on move 12 must not
   be painted over move 20 when you return to the game — nor lost when
   you step back to look at it again. So a drawing is filed under the
   position's index (0 is the start, n is after n moves), the live board
   is clean the moment a move is played, and stepping back finds it
   exactly as you left it.

   A shape is {from, to, t}: from === to is a ring; t is its meaning,
   0 = a plan (yours, in the skin's plan colour), 1 = a threat (theirs,
   in the capture colour). Drawing the same shape again rubs it out;
   drawing the same squares with the other meaning recolours it. There
   is a limit, so a page that has been drawn on all evening cannot grow
   the save without end: 16 shapes on one position, 64 in all, the
   oldest going first.

   Everything that comes in from outside — a save, a link — is checked
   square by square, and junk is dropped quietly, one shape at a time:
   a bad mark must never cost you the game it was saved with.

   Pure and Node-testable: chess/tools/ink-check.js. */
(function (root) {
"use strict";

var PER_POS = 16, MAX = 64, MAX_POS = 1200;

function onBoard(sq) { return typeof sq === "number" && sq === (sq | 0) && sq >= 0 && sq < 128 && (sq & 0x88) === 0; }
function okPos(pos, maxPos) {
  return typeof pos === "number" && pos === (pos | 0) && pos >= 0 && pos <= (maxPos == null ? MAX_POS : maxPos);
}

function create() { return { byPos: {}, n: 0 }; }

function count(book) {
  var c = 0;
  for (var k in book.byPos) c += book.byPos[k].length;
  return c;
}
/* the shapes on one position, as plain copies the caller may keep */
function at(book, pos) {
  var list = (book && book.byPos[pos]) || [];
  return list.map(function (s) { return { from: s.from, to: s.to, t: s.t }; });
}
/* the oldest shape anywhere goes, so the newest note always fits */
function dropOldest(book) {
  var bestK = null, bestI = -1, bestN = Infinity;
  for (var k in book.byPos) {
    var list = book.byPos[k];
    for (var i = 0; i < list.length; i++) if (list[i].n < bestN) { bestN = list[i].n; bestK = k; bestI = i; }
  }
  if (bestK == null) return;
  book.byPos[bestK].splice(bestI, 1);
  if (!book.byPos[bestK].length) delete book.byPos[bestK];
}
/* Draw a shape: the same one again rubs it out, the same squares with
   the other meaning recolour it. Answers what happened, so the caller
   can say so: "added", "removed", "recoloured", or "full" when a
   position already holds all it can. */
function toggle(book, pos, shape) {
  if (!book || !okPos(pos) || !shape || !onBoard(shape.from)) return null;
  var to = onBoard(shape.to) ? shape.to : shape.from, t = shape.t === 1 ? 1 : 0;
  var list = book.byPos[pos] || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].from === shape.from && list[i].to === to) {
      if (list[i].t === t) {
        list.splice(i, 1);
        if (!list.length) delete book.byPos[pos];
        return "removed";
      }
      list[i].t = t; list[i].n = ++book.n;
      return "recoloured";
    }
  }
  if (list.length >= PER_POS) return "full";
  if (count(book) >= MAX) dropOldest(book);
  list = book.byPos[pos] || (book.byPos[pos] = []);
  list.push({ from: shape.from, to: to, t: t, n: ++book.n });
  return "added";
}
function clear(book, pos) {
  if (!book || !book.byPos[pos]) return false;
  delete book.byPos[pos];
  return true;
}
/* a take-back: positions that no longer exist take their drawings with them */
function dropAfter(book, pos) {
  if (!book) return;
  for (var k in book.byPos) if (+k > pos) delete book.byPos[k];
}

/* ---------- the save ----------
   Flat and small: [[pos, from, to, t], …], oldest first, so a reload
   keeps the same order (and so the same shape goes first when full). */
function pack(book) {
  var all = [];
  for (var k in book.byPos) {
    var list = book.byPos[k];
    for (var i = 0; i < list.length; i++) all.push([+k, list[i].from, list[i].to, list[i].t, list[i].n]);
  }
  all.sort(function (a, b) { return a[4] - b[4]; });
  return all.map(function (r) { return [r[0], r[1], r[2], r[3]]; });
}
function unpack(arr, maxPos) {
  var book = create();
  if (!Array.isArray(arr)) return book;
  for (var i = 0; i < arr.length && i < MAX * 4; i++) {
    var r = arr[i];
    if (!Array.isArray(r) || r.length !== 4) continue;
    if (!okPos(r[0], maxPos) || !onBoard(r[1]) || !onBoard(r[2]) || (r[3] !== 0 && r[3] !== 1)) continue;
    var list = book.byPos[r[0]] || [];
    var dup = false;
    for (var j = 0; j < list.length; j++) if (list[j].from === r[1] && list[j].to === r[2]) dup = true;
    if (dup) continue;
    toggle(book, r[0], { from: r[1], to: r[2], t: r[3] });
  }
  return book;
}

/* What did you mean? A stroke that starts on one of their men is about
   what that man threatens; one from your own man, or from an empty
   square, is your plan. The board says it, so nobody has to choose a
   colour. `me` is the side you are playing: 1 white, -1 black. */
function toneFor(board, from, me) {
  if (!board || !onBoard(from)) return 0;
  var p = board[from];
  return p && (p > 0 ? 1 : -1) === -(me === -1 ? -1 : 1) ? 1 : 0;
}

/* ---------- a drawing as words ----------
   "e2e4 d1h5! f7": an arrow is two squares, a ring one, and ! marks a
   threat. Short enough for a link, readable aloud, and the same squares
   every chess player already writes. */
function name(sq) { return "abcdefgh".charAt(sq & 7) + ((sq >> 4) + 1); }
function parse(s) { return (s.charCodeAt(1) - 49) * 16 + (s.charCodeAt(0) - 97); }
function encode(list) {
  return (list || []).filter(function (s) { return s && onBoard(s.from); }).map(function (s) {
    var to = onBoard(s.to) ? s.to : s.from;
    return name(s.from) + (to !== s.from ? name(to) : "") + (s.t === 1 ? "!" : "");
  }).join(" ");
}
function decode(str) {
  var out = [];
  if (typeof str !== "string") return out;
  var toks = str.slice(0, 2048).split(/\s+/);
  for (var i = 0; i < toks.length && out.length < PER_POS; i++) {
    var m = /^([a-h][1-8])([a-h][1-8])?(!)?$/.exec(toks[i]);
    if (!m) continue;
    var from = parse(m[1]), to = m[2] ? parse(m[2]) : from;
    var dup = false;
    for (var j = 0; j < out.length; j++) if (out[j].from === from && out[j].to === to) dup = true;
    if (!dup) out.push({ from: from, to: to, t: m[3] ? 1 : 0 });
  }
  return out;
}

var Ink = {
  PER_POS: PER_POS, MAX: MAX,
  create: create, at: at, count: count, toggle: toggle, clear: clear, dropAfter: dropAfter,
  pack: pack, unpack: unpack, toneFor: toneFor, encode: encode, decode: decode
};
if (typeof module !== "undefined" && module.exports) module.exports = Ink;
else root.Ink = Ink;
})(typeof self !== "undefined" ? self : this);
