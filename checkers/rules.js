/* rules.js — English draughts, complete and pure.

   No DOM, no timers, no randomness: a state goes in, a state comes out, and
   tools/rules-check.js can therefore replay tens of thousands of games in
   node and check the invariants on every ply.

   The board is 64 squares, indexed r*8+c with r=0 the far row. Only the dark
   squares — where (r+c) is odd — are ever occupied, but the full 64 is kept
   because it makes the diagonals arithmetic instead of a lookup table, and
   because an off-square that somehow acquired a piece would then be visible
   rather than silently legal.

     0  empty
    +1  south man   (seat 0, the near side, moving towards r=0)
    +2  south king
    -1  north man   (seat 1, the far side, moving towards r=7)
    -2  north king

   Seat 0 is whoever sits at the bottom of their own screen. The sign is the
   side; the magnitude is the rank. That is the entire encoding, and it is why
   `-v` is "the same piece on the other side" everywhere below.

   ## The three rules people argue about, and what this does

   **Jumping is compulsory.** If any capture exists this turn, every legal
   move is a capture. This is the English rule and it is what makes the game
   sharp: a checkers position is mostly about what you can *force*.

   **The longest jump is not compulsory.** That is Italian draughts. Here any
   available jump will do, but once you start one you must finish it — a chain
   runs until the jumping piece has nothing left to jump.

   **Crowning ends the move.** A man that lands on the far row is crowned and
   stops there, even with another jump waiting. The new king does not get to
   use its new backwards direction in the same turn.                        */
(function (root) {
"use strict";

var N = 8;
var ALL = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
var UP = [[-1, -1], [-1, 1]];
var DOWN = [[1, -1], [1, 1]];

function on(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
function sgn(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
function dirsOf(v) { return (v === 1) ? UP : (v === -1) ? DOWN : ALL; }
/* seat 0 owns the positive pieces, seat 1 the negative */
function ownedBy(v, seat) { return seat === 0 ? v > 0 : v < 0; }
function crowns(v, r) { return (v === 1 && r === 0) || (v === -1 && r === N - 1); }

var Rules = {};
Rules.N = N;

/* ---------- the opening position ---------- */
Rules.start = function () {
  var b = new Array(64), r, c;
  for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
    var i = r * N + c, dark = ((r + c) & 1) === 1;
    b[i] = 0;
    if (!dark) continue;
    if (r < 3) b[i] = -1;
    else if (r > 4) b[i] = 1;
  }
  return { b: b, turn: 0, quiet: 0, ply: 0, log: [] };
};
Rules.clone = function (st) {
  return { b: st.b.slice(), turn: st.turn, quiet: st.quiet, ply: st.ply, log: st.log.slice() };
};

/* ---------- moves ----------
   Two passes, because compulsion is a property of the whole position rather
   than of a piece: gather every jump first, and only if there are none does a
   quiet move count as legal. */
function slidesFrom(b, sq, out) {
  var v = b[sq], r = sq >> 3, c = sq & 7, ds = dirsOf(v), i;
  for (i = 0; i < ds.length; i++) {
    var tr = r + ds[i][0], tc = c + ds[i][1];
    if (!on(tr, tc)) continue;
    var to = tr * N + tc;
    if (b[to] !== 0) continue;
    out.push({ f: sq, t: to, caps: [], path: [to], king: crowns(v, tr) });
  }
}

/* One step of a chain. `caps` is what has already been taken this turn — a
   piece is jumped once and only once, and it stays on the board until the
   whole move is over, which is what stops a chain from re-crossing an empty
   square it created and finding a phantom second jump. */
function jumpsFrom(b, origin, sq, v, caps, path, out) {
  var r = sq >> 3, c = sq & 7, ds = dirsOf(v), i, any = false;
  for (i = 0; i < ds.length; i++) {
    var mr = r + ds[i][0], mc = c + ds[i][1];
    var tr = r + 2 * ds[i][0], tc = c + 2 * ds[i][1];
    if (!on(tr, tc)) continue;
    var mid = mr * N + mc, to = tr * N + tc;
    if (b[to] !== 0 && to !== origin) continue;   /* origin is vacated by us */
    if (b[mid] === 0 || sgn(b[mid]) === sgn(v)) continue;
    if (caps.indexOf(mid) >= 0) continue;
    any = true;
    var ncaps = caps.concat([mid]), npath = path.concat([to]);
    if (crowns(v, tr)) {
      /* crowned: the move stops here, whatever else was on offer */
      out.push({ f: origin, t: to, caps: ncaps, path: npath, king: true });
      continue;
    }
    /* walk on with the piece where it now is, and the board as it now is */
    var nb = b.slice();
    nb[sq] = 0; nb[to] = v;
    var before = out.length;
    jumpsFrom(nb, origin, to, v, ncaps, npath, out);
    if (out.length === before) out.push({ f: origin, t: to, caps: ncaps, path: npath, king: false });
  }
  return any;
}

Rules.moves = function (st) {
  var b = st.b, seat = st.turn, jumps = [], slides = [], i;
  for (i = 0; i < 64; i++) {
    if (b[i] === 0 || !ownedBy(b[i], seat)) continue;
    jumpsFrom(b, i, i, b[i], [], [], jumps);
  }
  if (jumps.length) return jumps;
  for (i = 0; i < 64; i++) {
    if (b[i] === 0 || !ownedBy(b[i], seat)) continue;
    slidesFrom(b, i, slides);
  }
  return slides;
};

/* Is this thing a legal move here? Compared by shape rather than by identity,
   because a move that arrived over the wire is a different object from the
   one the generator made — and the wire is exactly where a bad one comes
   from. */
Rules.find = function (st, mv) {
  if (!mv) return null;
  var list = Rules.moves(st), i;
  for (i = 0; i < list.length; i++) {
    if (list[i].f === mv.f && list[i].t === mv.t &&
        list[i].caps.length === (mv.caps ? mv.caps.length : 0) &&
        samePath(list[i].path, mv.path)) return list[i];
  }
  /* a chain named only by its ends is unambiguous unless two chains share
     them, which is rare but real — so only accept it when it is unique */
  var hit = null, n = 0;
  for (i = 0; i < list.length; i++) if (list[i].f === mv.f && list[i].t === mv.t) { hit = list[i]; n++; }
  return n === 1 ? hit : null;
};
function samePath(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

Rules.apply = function (st, mv) {
  var n = Rules.clone(st), b = n.b, v = b[mv.f], i;
  b[mv.f] = 0;
  for (i = 0; i < mv.caps.length; i++) b[mv.caps[i]] = 0;
  b[mv.t] = mv.king ? v * 2 : v;
  /* the no-progress clock: a capture or a man moving is progress, a king
     shuffling is not */
  n.quiet = (mv.caps.length || Math.abs(v) === 1) ? 0 : n.quiet + 1;
  n.turn = 1 - n.turn;
  n.ply++;
  n.log.push({ f: mv.f, t: mv.t, caps: mv.caps.slice(), path: mv.path.slice(), king: !!mv.king, by: st.turn });
  return n;
};

/* ---------- how it ends ----------
   You lose by having nothing left, and you lose by having nothing to do —
   which is the rule people forget, and the one that decides most endgames
   between a king and two men. */
Rules.count = function (st) {
  var c = [{ men: 0, kings: 0 }, { men: 0, kings: 0 }], i;
  for (i = 0; i < 64; i++) {
    var v = st.b[i];
    if (!v) continue;
    var s = v > 0 ? 0 : 1;
    if (Math.abs(v) === 2) c[s].kings++; else c[s].men++;
  }
  return c;
};
Rules.over = function (st) {
  var c = Rules.count(st);
  if (c[0].men + c[0].kings === 0) return { done: true, winner: 1, why: "swept" };
  if (c[1].men + c[1].kings === 0) return { done: true, winner: 0, why: "swept" };
  if (Rules.moves(st).length === 0) return { done: true, winner: 1 - st.turn, why: "blocked" };
  /* forty quiet moves each — kings circling each other is a draw, and saying
     so is kinder than letting it go round forever */
  if (st.quiet >= 80) return { done: true, winner: -1, why: "quiet" };
  return { done: false, winner: -1, why: "" };
};

/* ---------- notation ----------
   The old numbering: dark squares 1..32, counted from the far side. Anybody
   who has read a checkers book recognises "11-15"; nobody recognises "r5c2". */
Rules.num = function (sq) {
  var r = sq >> 3, c = sq & 7;
  if (((r + c) & 1) !== 1) return 0;
  return r * 4 + ((c - (r % 2 === 0 ? 1 : 0)) >> 1) + 1;
};
Rules.name = function (mv) {
  if (!mv) return "";
  var sep = mv.caps.length ? "x" : "-";
  var s = Rules.num(mv.f);
  for (var i = 0; i < mv.path.length; i++) s += sep + Rules.num(mv.path[i]);
  return s;
};

/* ---------- what a seat may see ----------
   Nothing is hidden in draughts, so this is the whole state — but it exists
   because Table.deal() asks for it, and a game that later grows a secret has
   somewhere to put the difference. */
Rules.publicView = function (st, seat) {
  return { b: st.b.slice(), turn: st.turn, quiet: st.quiet, ply: st.ply,
           last: st.log.length ? st.log[st.log.length - 1] : null, seat: seat };
};

if (typeof module !== "undefined" && module.exports) module.exports = Rules;
else root.Rules = Rules;
})(typeof self !== "undefined" ? self : this);
