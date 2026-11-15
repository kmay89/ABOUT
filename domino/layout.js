/* layout.js — where the bones actually lie on the table.

   Pure geometry. Give it the line of play and it gives back a position
   and an angle for every bone, plus the two open ends and a bounding
   box. Both renderers read this same function, so a tile is in exactly
   the same place in 2D and in 3D and the ghost slot you tap is the slot
   the bone lands in.

   Units are half-tiles: a bone is 2 long and 1 wide, a double is laid
   crosswise so it is 1 along the line and 2 across. Nothing here knows
   about pixels; the renderer fits the bounding box to whatever screen
   it has.

   Two properties matter more than looking nice, and `tools/layout-check.js`
   holds us to both:

   1. **Stability.** Adding a bone never moves a bone already down. Each
      end grows outward from its own cursor and never consults the other,
      so the table you are looking at does not rearrange itself under
      your hand mid-animation.

   2. **No overlaps.** The line runs out to the edge of the table and
      folds back, the way it does on a real table when the game gets
      long. The fold is the part that goes wrong: turn a corner
      carelessly and the new row lands on top of the old one. The corner
      here is worked out exactly rather than approximated — see `turn()`
      and `ROW`, both of which carry the arithmetic that fixes the
      spacing.                                                          */
(function (root) {
"use strict";

var LEN = 2, WID = 1;               /* a bone, in half-tiles */

/* the two halves of a tile, without needing rules.js: tiles are numbered
   0..27 running a = 0..6, b = a..6, exactly as rules.js deals them */
var HA = [], HB = [];
(function () { for (var a = 0; a <= 6; a++) for (var b = a; b <= 6; b++) { HA.push(a); HB.push(b); } })();
function half(t, which) { return which ? HB[t] : HA[t]; }
function otherHalf(t, n) { return HA[t] === n ? HB[t] : HA[t]; }

/* How far apart two rows sit. Not a taste decision — it is the tightest
   spacing that provably cannot overlap, and it is set by the corner
   rather than by the rows.

   Put the old row on y = 0. The corner bone stands on end just past the
   row's last bone and so reaches y = 1½. A crosswise double in the new
   row reaches a full unit back toward the old one. So the new row's
   centre has to be at least 1½ + 1 = 2½ away, or the first double laid
   after a fold lands on the corner bone — which is exactly what it did
   at a spacing of 2, in about one long game in three.

   At 2½ everything merely touches: corner ends at 1½ and the new row's
   doubles begin at 1½; plain bones in adjacent rows leave half a unit
   of felt between them. */
var ROW = 2.5;
/* headings: 0 = +x, 1 = +y (down the screen), 2 = -x, 3 = -y */
var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
function isHoriz(h) { return h === 0 || h === 2; }

/* how much room a bone takes, along the line it is travelling and
   across it. A double turns sideways, which is the whole reason the
   line has a shape at all. */
function along(dbl) { return dbl ? WID : LEN; }
function across(dbl) { return dbl ? LEN : WID; }

/* a cursor is an open end of the line: the point the next bone attaches
   to, the way it is heading, and which way it folds when it runs out of
   table */
function cursor(x, y, h, fold) { return { x: x, y: y, h: h, fold: fold }; }

/* Turning the corner.

   The cursor sits at `tip`, running horizontally (sx = +1 or -1), and
   the table has run out. The bone goes down perpendicular (sy) and the
   line comes back the other way one row over.

   Worked out rather than fudged. Travelling +x with the tip at (tx,ty),
   the last bone occupied x ∈ [tx-2, tx], y ∈ [ty-½, ty+½]. The corner
   bone stands on end just past it — x ∈ [tx, tx+1], y ∈ [ty-½, ty+1½] —
   so the two touch along x = tx and do not overlap. The next row then
   starts at x = tx+1 heading back, centred a `ROW` away, which is the
   distance that clears the corner bone's far edge at ty+1½ even when
   the first bone of the new row is a crosswise double.

   A double at the corner is 2 across instead of 1, so its centre steps
   out by across/2 to keep that same shared edge. */
function turn(cur, dbl) {
  var sx = DX[cur.h], sy = cur.fold;
  var cx = cur.x + sx * across(dbl) / 2;
  var cy = cur.y + sy * (along(dbl) / 2 - WID / 2);
  var vh = sy > 0 ? 1 : 3;
  var place = { x: cx, y: cy, h: vh, dbl: dbl };
  /* the row after the corner: one across, a row down, heading back */
  cur.x = cur.x + sx * WID;
  cur.y = cur.y + sy * ROW;
  cur.h = (cur.h + 2) & 3;
  return place;
}

/* a straight run: the bone attaches at the tip and the tip moves on */
function straight(cur, dbl) {
  var d = along(dbl);
  var place = { x: cur.x + DX[cur.h] * d / 2, y: cur.y + DY[cur.h] * d / 2, h: cur.h, dbl: dbl };
  cur.x += DX[cur.h] * d;
  cur.y += DY[cur.h] * d;
  return place;
}

function advance(cur, dbl, bound) {
  if (isHoriz(cur.h)) {
    var reach = cur.x + DX[cur.h] * along(dbl);
    if (Math.abs(reach) > bound) return turn(cur, dbl);
  }
  return straight(cur, dbl);
}

/* the rectangle a placed bone covers, for the overlap check and for
   fitting the table to the screen */
function boxOf(p) {
  var a = along(p.dbl), c = across(p.dbl);
  var w = isHoriz(p.h) ? a : c, h = isHoriz(p.h) ? c : a;
  return { x0: p.x - w / 2, y0: p.y - h / 2, x1: p.x + w / 2, y1: p.y + h / 2 };
}

/* ---------- the table ----------
   `line` is `state.line` from rules.js: [{tile, end, flip, dbl}, …].
   `opts.bound` is how far the line may run either side of the middle
   before it folds — the renderer sets it from the shape of the screen,
   so a phone held upright folds sooner than a tablet on its side. */
function table(line, opts) {
  opts = opts || {};
  var bound = Math.max(4, opts.bound || 9);
  var out = { bones: [], bbox: null, ends: null, rows: 1 };
  if (!line || !line.length) {
    out.bbox = { x0: -1, y0: -1, x1: 1, y1: 1 };
    out.ends = { L: { x: -0.5, y: 0, h: 2 }, R: { x: 0.5, y: 0, h: 0 } };
    return out;
  }

  var first = line[0], fa = along(first.dbl);
  /* The open number at each end, tracked here alongside the geometry so
     every bone knows which of its halves touches the line. See `rec`. */
  var openL = half(first.tile, 0), openR = half(first.tile, 1);
  /* The salida lies in the middle of the table and the line grows both
     ways from it. Its heading is *along the line* even when it is a
     mula — `rot` is what turns a mula crosswise, and `along`/`across`
     are what give it its footprint. Recording the heading as vertical
     instead (an early mistake) laid the opening mula flat across two
     units of the line and both ends started on top of it. */
  var p0 = { x: 0, y: 0, h: 0, dbl: first.dbl };
  out.bones.push(rec(first, p0, 0, openL, openR));

  var R = cursor(fa / 2, 0, 0, 1);     /* the right end folds downward */
  var L = cursor(-fa / 2, 0, 2, -1);   /* the left end folds upward    */

  for (var i = 1; i < line.length; i++) {
    var pl = line[i];
    var cur = (pl.end === "L") ? L : R;
    var place = advance(cur, pl.dbl, bound);
    var join = (pl.end === "L") ? openL : openR;
    var far = otherHalf(pl.tile, join);
    out.bones.push(rec(pl, place, i, join, far));
    if (pl.end === "L") openL = far; else openR = far;
  }

  /* the bounding box, with a little air so nothing touches the edge */
  var b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
  function grow(r) {
    if (r.x0 < b.x0) b.x0 = r.x0; if (r.y0 < b.y0) b.y0 = r.y0;
    if (r.x1 > b.x1) b.x1 = r.x1; if (r.y1 > b.y1) b.y1 = r.y1;
  }
  for (var k = 0; k < out.bones.length; k++) grow(boxOf(out.bones[k]));
  out.rows = Math.max(1, Math.round((b.y1 - b.y0) / ROW));
  /* Where the next plain bone would go at each end, folded if the line
     has reached the table's edge, is part of the box too. The renderers
     fit the box to the screen, so this is what keeps the slot you are
     about to play into *on* the cloth, and what has the camera make room
     for a bone before it lands rather than lurching back as it does. */
  out.next = {
    L: advance(cursor(L.x, L.y, L.h, L.fold), false, bound),
    R: advance(cursor(R.x, R.y, R.h, R.fold), false, bound)
  };
  grow(boxOf(out.next.L)); grow(boxOf(out.next.R));
  out.bbox = b;

  /* where the next bone would go, at each end — this is what the ghost
     slots are drawn on, and what a tap on the table is measured against */
  out.ends = {
    L: { x: L.x, y: L.y, h: L.h, nx: L.x + DX[L.h], ny: L.y + DY[L.h] },
    R: { x: R.x, y: R.y, h: R.h, nx: R.x + DX[R.h], ny: R.y + DY[R.h] }
  };
  return out;
}

/* Which number is drawn on which half.

   A bone is drawn in its own frame lying along local +x, then turned by
   `rot`. For a plain bone `rot` is the heading, so local +x points *away*
   from the bone it joins and local -x points back at it. That makes the
   rule one line: the first half (local -x) carries the number that was
   matched, `inner`, and the second half carries the new open end, `outer`.
   The salida has nothing to join, so it reads low-to-high left to right,
   which is also what the two open ends say it is.

   This used to be worked out from `flip`, a flag recorded by the rules
   whose meaning differed between the two ends — and so every bone played
   on the right-hand end of the line was drawn back to front, its matching
   half facing out and its new number pressed against the bone it joined.
   Tracking the open ends here, next to the geometry, removes the question.
   `tools/layout-check.js` walks every bone and checks that the half
   touching its neighbour really is the number they share. */
function rec(pl, place, idx, inner, outer) {
  return {
    idx: idx, tile: pl.tile, end: pl.end, flip: !!pl.flip, dbl: !!pl.dbl, seat: pl.seat,
    x: place.x, y: place.y, h: place.h,
    inner: inner, outer: outer,
    /* the angle to draw it at: a bone lies along its heading, a double
       lies across it */
    rot: (place.h * 90 + (pl.dbl ? 90 : 0)) % 360
  };
}

/* ---------- your own hand, along the bottom ----------
   In screen pixels rather than half-tiles, because a hand is furniture
   rather than table: it stays the same size whatever the line of play
   is doing.

   Both renderers call this, so a bone is in the same place and the same
   size in 2D and in 3D, and so the tap test below is the tap test for
   both. Seven bones have to fit across the narrowest phone anyone still
   carries without becoming too small to hit — a finger pad is about
   9 mm, roughly 44 CSS pixels, and that is the number the sizing is
   worked back from. When seven at a comfortable size will not fit, they
   overlap like cards in a hand rather than shrinking below the thumb. */
function handRow(count, w, h, opts) {
  opts = opts || {};
  var pad = opts.pad === undefined ? 10 : pad0(opts.pad);
  var maxH = opts.maxH || Math.min(h * 0.20, 104);
  var bw = maxH / LEN * WID;                       /* a bone is half as wide as it is tall */
  var gap = opts.gap === undefined ? 6 : opts.gap;

  /* shrink to fit, but never below a thumb */
  var need = count * bw + (count - 1) * gap + pad * 2;
  if (need > w) {
    var scale = (w - pad * 2 - (count - 1) * gap) / (count * bw);
    bw *= scale; maxH *= scale;
  }
  var MIN = 44;
  var overlap = 0;
  if (bw < MIN && count > 1) {
    /* too tight: go back to a hittable size and let them overlap, the
       way you would hold them */
    var back = MIN / bw;
    bw *= back; maxH *= back;
    var span = w - pad * 2;
    overlap = (count * bw + (count - 1) * gap - span) / (count - 1);
    if (overlap < 0) overlap = 0;
  }

  var step = bw + gap - overlap;
  var total = count > 0 ? (count - 1) * step + bw : 0;
  var x0 = (w - total) / 2;
  var y = h - maxH - pad;
  var out = [];
  for (var i = 0; i < count; i++) {
    out.push({ i: i, x: x0 + i * step, y: y, w: bw, h: maxH, over: overlap > 0 });
  }
  return out;
}
function pad0(v) { return (typeof v === "number" && isFinite(v)) ? v : 10; }

/* Which bone a tap landed on. Walks from the right because when the
   hand is overlapping, the bone on top is the one drawn last — tapping
   where two overlap has to pick the one you can actually see. */
function hitHand(rects, x, y) {
  for (var i = rects.length - 1; i >= 0; i--) {
    var r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

/* how big a bone should be drawn, to fit a table into a box of pixels */
function fit(bbox, w, h, pad) {
  pad = pad === undefined ? 12 : pad;
  var bw = Math.max(1, bbox.x1 - bbox.x0), bh = Math.max(1, bbox.y1 - bbox.y0);
  var s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  return {
    scale: s,
    ox: w / 2 - (bbox.x0 + bbox.x1) / 2 * s,
    oy: h / 2 - (bbox.y0 + bbox.y1) / 2 * s
  };
}

/* the two numbers in drawing order: local -x half first */
function faces(b) { return [b.inner, b.outer]; }

var Layout = {
  LEN: LEN, WID: WID, ROW: ROW, DX: DX, DY: DY, faces: faces,
  along: along, across: across, boxOf: boxOf,
  table: table, fit: fit, handRow: handRow, hitHand: hitHand
};
if (typeof module !== "undefined" && module.exports) module.exports = Layout;
else root.Layout = Layout;
})(typeof self !== "undefined" ? self : this);
