/* bot.js — a player that plays well enough to be worth watching.

   It plays the splash screen behind the title, and it plays thousands of
   games in tools/rules-check.js, so it has to be two things at once: good
   to look at, and fast. It decides one piece at a time and hands back the
   exact list of engine actions that put the piece there.

   ## How it chooses

   For the piece in hand — and, if Keep is allowed, for the piece Keep
   would give it instead — it takes every resting place a hard drop can
   reach, from the engine's own fewest-presses search (Well.reach), so each
   candidate comes with a real path of presses from where the piece really
   is (a kept piece starts again from the spawn). It
   scores the well each would leave, keeps the most promising handful, and
   for those looks one piece further: every place the next piece could go.
   The best pair wins, and the bot plays the first half of it. Nothing is
   random, so the same seed is the same demonstration every time.

   The score of a well is the classic hand-tuned recipe that goes back to
   Pierre Dellacherie and Yiyuan Lee's later tuning of it — how high the
   piece landed, how many rows it cleared, and how ragged the result is
   along rows and down columns, with holes and deep wells weighed heavily.
   That alone survives for ever but clears lines one or two at a time,
   which is safe and dull to watch.

   ## Two styles

   **"tidy"** is that recipe as published: survival first, clears whatever
   is going.

   **"quads"** is what the splash shows. It keeps the right-hand column open
   as a well, builds the other nine flat, and holds its fire: a Single,
   Double or Triple is discouraged while the stack is low, a Quad is
   handsomely rewarded, and the long piece is kept back (Keep) until four
   rows are ready for it. As the well climbs past the middle the caution
   melts away and any clear is welcome again, so it reads as a skilful,
   unhurried player rather than a greedy one.

   ## Speed

   The board is turned into ten-bit row masks once per decision, so placing
   a piece, clearing rows and measuring the result are a handful of integer
   operations. Only the first ply asks the engine for paths; the look-ahead
   drops pieces straight down by column height. A decision averages well
   under the four-millisecond budget in node.                              */
(function (root) {
"use strict";

function kit(name, file) {
  if (root[name]) return root[name];
  if (typeof module !== "undefined" && module.exports && typeof require === "function") return require(file);
  return null;
}
var Rules = kit("Rules", "./rules.js");
var Well = kit("Well", "./engine.js");

var W = Rules.W, H = Rules.H, FULL = (1 << W) - 1;
var SH = Well._SH;
/* The tidy weights are the published ones. The quads weights were tuned
   here, against the real engine at level-1 gravity: over thirty thousand
   pieces about 95% of the lines it clears come four at a time, the well
   rarely passes thirteen rows, and it has never filled. Wider look-ahead
   beams were tried and played worse — the second ply only drops pieces
   straight down, so trusting it with more candidates trusts it too far. */
var STYLES = {
  tidy: { landing: -4.500158825082766, eroded: 3.4181268101392694, rowT: -3.2178882868487753,
          colT: -9.348695305445199, holes: -7.899265427351652, wells: -3.3855972247263626 },
  quads: { landing: -1.6, holes: -34, cover: -2.2, holeRows: -10, rowT: -2.4, colT: -6.5,
           bump: -1.6, wells: -4, wellCol: -40, ready: 3.2, quad: 120, small: -50,
           high: -2.2, keepI: 6, calm: 10, beam: 6 }
};

var Bot = {};
Bot.STYLES = STYLES;

/* ---------- the board as row masks ---------- */
function load(board, rows) {
  var top = -1;
  for (var y = 0; y < H; y++) {
    var m = 0, b = y * W;
    for (var x = 0; x < W; x++) if (board[b + x]) m |= 1 << x;
    rows[y] = m;
    if (m) top = y;
  }
  return top;
}
function pop(m) {
  m = m - ((m >> 1) & 0x55555555);
  m = (m & 0x33333333) + ((m >> 2) & 0x33333333);
  return (((m + (m >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

/* place four cells and clear what fills; the rows are changed in place,
   and the lines, eroded cells, new top row and landing height come back */
var res = { lines: 0, eroded: 0, top: -1, land: 0 };
function placeCells(rows, top, type, rot, x, y) {
  var o = (type * 4 + rot) * 8, k, cy, minY = 99, maxY = -1;
  for (k = 0; k < 4; k++) {
    cy = y + SH[o + k * 2 + 1];
    rows[cy] |= 1 << (x + SH[o + k * 2]);
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;
  }
  if (maxY > top) top = maxY;
  var lines = 0, eroded = 0;
  for (cy = minY; cy <= maxY; cy++) {
    if (rows[cy] === FULL) {
      lines++;
      for (k = 0; k < 4; k++) if (y + SH[o + k * 2 + 1] === cy) eroded++;
    }
  }
  if (lines) {
    var dst = minY;
    for (cy = minY; cy <= top; cy++) {
      if (rows[cy] === FULL) continue;
      rows[dst++] = rows[cy];
    }
    for (cy = dst; cy <= top; cy++) rows[cy] = 0;
    top -= lines;
    while (top >= 0 && !rows[top]) top--;
  }
  res.lines = lines;
  res.eroded = lines * eroded;
  res.top = top;
  res.land = (minY + maxY) / 2;
  return res;
}

/* ---------- measuring a well ---------- */
var colH = new Int32Array(W), cnt = new Int32Array(W), run = new Int32Array(W);
var feat = { holes: 0, cover: 0, holeRows: 0, rowT: 0, colT: 0, bump: 0, wells: 0, maxH: 0,
             wellCol: 0, ready: 0 };
function measure(rows, top, wellCol) {
  var x, y, r;
  for (x = 0; x < W; x++) { colH[x] = 0; cnt[x] = 0; run[x] = 0; }
  var seen = 0;
  for (y = top; y >= 0; y--) {
    var fresh = rows[y] & ~seen;
    if (fresh) { for (x = 0; x < W; x++) if (fresh & (1 << x)) colH[x] = y + 1; seen |= fresh; }
  }
  var holes = 0, cover = 0, holeRows = 0, rowT = 0, colT = 0, wells = 0, ready = 0;
  var above = 0, wmask = wellCol >= 0 ? FULL & ~(1 << wellCol) : FULL;
  for (y = top; y >= 0; y--) {
    r = rows[y];
    var hm = ~r & above & FULL;
    if (hm) {
      holeRows++;
      for (x = 0; x < W; x++) if (hm & (1 << x)) { holes++; cover += cnt[x]; }
    }
    for (x = 0; x < W; x++) if (r & (1 << x)) cnt[x]++;
    above |= r;
    /* along the row, the walls counting as filled */
    var ext = (r << 1) | 1 | (1 << (W + 1));
    rowT += pop((ext ^ (ext >> 1)) & ((1 << (W + 1)) - 1));
    /* down the columns, the floor counting as filled */
    colT += pop(r ^ (y > 0 ? rows[y - 1] : FULL));
    /* well cells: empty, with both neighbours filled. The reserved column
       counts as a wall here, so a low column beside it reads as the
       awkward well it is. */
    var rw = wellCol >= 0 ? r | (1 << wellCol) : r;
    var wl = ~rw & ((rw << 1) | 1) & ((rw >> 1) | (1 << (W - 1))) & FULL;
    for (x = 0; x < W; x++) {
      if (wl & (1 << x)) { run[x]++; wells += run[x]; } else run[x] = 0;
    }
    if (wellCol >= 0 && (r & wmask) === wmask && !(r & (1 << wellCol))) ready++;
  }
  /* the top surface down into the empty air counts as a column transition */
  if (top >= 0) colT += pop(rows[top]);
  /* the surface, ignoring the step down into the reserved column */
  var bump = 0, maxH = 0;
  for (x = 0; x < W; x++) {
    if (colH[x] > maxH) maxH = colH[x];
    if (x < W - 1 && x !== wellCol && x + 1 !== wellCol) {
      var dh = colH[x] - colH[x + 1];
      bump += dh < 0 ? -dh : dh;
    }
  }
  feat.holes = holes; feat.cover = cover; feat.holeRows = holeRows;
  feat.rowT = rowT; feat.colT = colT; feat.wells = wells; feat.bump = bump; feat.maxH = maxH;
  feat.wellCol = wellCol >= 0 ? cnt[wellCol] : 0;
  feat.ready = ready;
  return feat;
}

/* The value of a move is two parts: what the move itself did (how high it
   landed, what it cleared) and the shape of the well it left. The look-ahead
   adds the first move's part to the best second move's whole, so a Quad
   made now — or a Single spent now — is never forgotten by the next ply.
   mv.part receives the move's own share. */
function value(rows, top, mv, style, wellCol) {
  var f = measure(rows, top, style === STYLES.tidy ? -1 : wellCol), w = style, part, board;
  if (style === STYLES.tidy) {
    part = w.landing * mv.land + w.eroded * mv.eroded;
    board = w.rowT * f.rowT + w.colT * f.colT + w.holes * f.holes + w.wells * f.wells;
  } else {
    /* quads: patient while the well is low, any clear welcome once it is
       past the middle or has a hole to dig out */
    var danger = f.maxH > w.calm ? (f.maxH - w.calm) : 0;
    part = w.landing * mv.land;
    if (mv.lines === 4) part += w.quad;
    else if (mv.lines > 0) part += danger > 0 || f.holes > 0 ? 9 * mv.lines + 4 * danger : w.small * mv.lines;
    board = w.holes * f.holes + w.cover * f.cover + w.holeRows * f.holeRows +
            w.rowT * f.rowT + w.colT * f.colT + w.bump * f.bump + w.wells * f.wells +
            w.wellCol * f.wellCol + w.ready * Math.min(f.ready, 4) + w.high * danger * danger;
  }
  mv.part = part;
  return part + board;
}

/* ---------- drops for the look-ahead ---------- */
var ROTS = [null, [0, 1], [0], [0, 1, 2, 3], [0, 1], [0, 1], [0, 1, 2, 3], [0, 1, 2, 3]];
var work = new Int32Array(H + 4), work2 = new Int32Array(H + 4), dropH = new Int32Array(W);
var mvA = { lines: 0, eroded: 0, land: 0, part: 0 };

function bestDrop(rows, top, type, style, wellCol) {
  if (!type) return 0;
  var best = -Infinity, list = ROTS[type];
  var hseen = 0, y, x, heights = dropH;
  /* column heights: where a piece dropped from above comes to rest */
  for (x = 0; x < W; x++) heights[x] = 0;
  for (y = top; y >= 0; y--) {
    var fresh = rows[y] & ~hseen;
    if (fresh) { for (x = 0; x < W; x++) if (fresh & (1 << x)) heights[x] = y + 1; hseen |= fresh; }
  }
  for (var ri = 0; ri < list.length; ri++) {
    var rot = list[ri], o = (type * 4 + rot) * 8, k, minDx = 9, maxDx = -9;
    for (k = 0; k < 4; k++) { var dx = SH[o + k * 2]; if (dx < minDx) minDx = dx; if (dx > maxDx) maxDx = dx; }
    for (x = -minDx; x < W - maxDx; x++) {
      var ly = -99;
      for (k = 0; k < 4; k++) {
        var need = heights[x + SH[o + k * 2]] - SH[o + k * 2 + 1];
        if (need > ly) ly = need;
      }
      if (ly + 2 >= Rules.VISIBLE) continue;         /* would stand out of the mouth */
      for (y = 0; y <= top + 4 && y < H; y++) work2[y] = y <= top ? rows[y] : 0;
      var r = placeCells(work2, top, type, rot, x, ly);
      mvA.lines = r.lines; mvA.eroded = r.eroded; mvA.land = r.land;
      var v = value(work2, r.top, mvA, style, wellCol);
      if (v > best) best = v;
    }
  }
  return best === -Infinity ? -1e6 : best;
}

/* ---------- the decision ---------- */
var BEAM = 6;
/* plan(g, opts) → {actions, keep, type, rot, x, y, cells, value} or null.
   opts: style "quads" | "tidy" (default "quads"), lookahead (default true),
   keep (default: whatever the game allows), wellCol (default 9). */
Bot.plan = function (g, opts) {
  opts = opts || {};
  if (!g.active || g.over) return null;
  var style = STYLES[opts.style] || STYLES.quads;
  var look = opts.lookahead !== false;
  var wellCol = typeof opts.wellCol === "number" ? opts.wellCol : W - 1;
  var modern = !!g.opts.modern;
  var rows = new Int32Array(H + 4);
  var top = load(g.board, rows);

  var choices = [{ type: g.active.type, keep: false, next: g.queue[0] || 0 }];
  if (opts.keep !== false && g.opts.keep && !g.holdUsed) {
    var alt = g.hold || g.queue[0];
    if (alt && alt !== g.active.type) {
      choices.push({ type: alt, keep: true, next: g.hold ? g.queue[0] : g.queue[1] || 0 });
    }
  }

  var cands = [], c, i;
  for (c = 0; c < choices.length; c++) {
    var ch = choices[c];
    /* the piece in hand is searched from where it is now; a kept piece
       would start again from the spawn */
    var places = Well.reach(g.board, ch.type, modern, ch.keep ? null : g.active);
    for (i = 0; i < places.length; i++) {
      var p = places[i];
      for (var y = 0; y <= top + 5 && y < H + 4; y++) work[y] = y <= top ? rows[y] : 0;
      var r = placeCells(work, top, p.type, p.rot, p.x, p.y);
      var mv = { lines: r.lines, eroded: r.eroded, land: r.land, part: 0 };
      var v = value(work, r.top, mv, style, wellCol);
      /* the quads player keeps the long piece back until the well is ready */
      if (style === STYLES.quads && ch.keep && g.active.type === 1 && !g.hold) v += style.keepI;
      cands.push({ place: p, choice: ch, v1: v, v: v, mv: mv, rows: look ? new Int32Array(work) : null, top: r.top });
    }
  }
  if (!cands.length) return null;
  cands.sort(function (a, b) { return b.v1 - a.v1; });
  if (look) {
    var n = Math.min(style.beam || BEAM, cands.length);
    for (i = 0; i < n; i++) {
      var cd = cands[i];
      var q = cd.choice.next;
      var held = cd.choice.keep ? g.active.type : g.hold;
      var second = bestDrop(cd.rows, cd.top, q, style, wellCol);
      /* Keep is part of the next move too: the piece that would be kept
         after this one may be the better second piece */
      if (held && held !== q && g.opts.keep) {
        var alt2 = bestDrop(cd.rows, cd.top, held, style, wellCol);
        if (alt2 > second) second = alt2;
      }
      cd.v = cd.mv.part + second;
    }
    cands.length = n;
    cands.sort(function (a, b) { return b.v - a.v; });
  }
  var best = cands[0], pl = best.place;
  var actions = [];
  if (best.choice.keep) actions.push("hold");
  for (i = 0; i < pl.path.length; i++) actions.push(Rules.PRESS_ACTION[pl.path[i]]);
  actions.push("hard");
  return { actions: actions, keep: best.choice.keep, type: pl.type, rot: pl.rot, x: pl.x, y: pl.y,
           cells: pl.cells, value: best.v };
};

if (typeof module !== "undefined" && module.exports) module.exports = Bot;
else root.Bot = Bot;
})(typeof self !== "undefined" ? self : this);
