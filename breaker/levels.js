/* levels.js — the walls.

   A brick game lives or dies on its levels, and there are two honest ways to
   get them: draw them by hand, or generate them. Hand-drawn runs out — twenty
   screens is a week's work and an evening's play. So these are generated, but
   *not* randomly: each level is a small formula over the grid, and the
   formula is chosen by level number, so level 7 is the same level 7 for
   everybody and can be talked about, remembered and got better at. Random
   walls are forgettable by construction.

   A cell is:
      0   nothing
      1–3 a brick, and how many hits it takes
      9   solid — cannot be broken, only bounced off

   Solid bricks are the interesting ingredient. They are not obstacles so much
   as *architecture*: they make a pocket the ball can be trapped in, which is
   where the good moments in this game come from. Used carelessly they make a
   level impossible, so every generated wall is checked — a wall whose
   breakable bricks are all sealed behind solids is regenerated with the
   solids thinned out.                                                      */
(function (root) {
"use strict";

var Levels = {};
var COLS = 11;
Levels.COLS = COLS;

/* the palette, by hit points remaining — hotter as it gets harder */
Levels.COLOUR = {
  1: ["#4fb3d9", "#2f87ab"],
  2: ["#63c76a", "#3d9247"],
  3: ["#e8a33d", "#b6741c"],
  9: ["#6e6a63", "#46433d"]
};

/* Every shape takes (c, r, rows, n) and answers what belongs at that cell.
   Keeping them as one-liners is deliberate: a level you can read in a line is
   a level you can adjust without breaking the next twenty. */
var SHAPES = [
  /* 0 · plain courses, hardening downwards */
  function (c, r, rows) { return rows - r > 2 ? 1 : (rows - r > 1 ? 2 : 3); },
  /* 1 · a chequer, so the ball can get behind things early */
  function (c, r) { return ((c + r) & 1) ? 0 : (r < 2 ? 2 : 1); },
  /* 2 · a pyramid */
  function (c, r, rows) { var m = (COLS - 1) / 2; return Math.abs(c - m) <= r ? (r > 3 ? 2 : 1) : 0; },
  /* 3 · columns with solid piers between them */
  function (c, r) { return c % 3 === 0 ? 9 : (r % 2 ? 1 : 2); },
  /* 4 · a diamond */
  function (c, r, rows) {
    var m = (COLS - 1) / 2, mr = (rows - 1) / 2;
    var d = Math.abs(c - m) / m + Math.abs(r - mr) / Math.max(1, mr);
    return d < 0.55 ? 3 : d < 1.02 ? 2 : d < 1.35 ? 1 : 0;
  },
  /* 5 · a wall with a door in it */
  function (c, r, rows) { return (r === 2 && c !== ((COLS - 1) / 2 | 0)) ? 9 : (r < 2 ? 2 : r > 2 ? 1 : 0); },
  /* 6 · zigzag courses */
  function (c, r) { return ((c + r * 2) % 5 < 3) ? (r < 2 ? 3 : 1) : 0; },
  /* 7 · a fortress: solid corners, hard middle */
  function (c, r, rows) {
    var edge = (c < 2 || c > COLS - 3);
    if (edge && r < 2) return 9;
    var m = (COLS - 1) / 2;
    return Math.abs(c - m) < 2 ? 3 : 1;
  },
  /* 8 · rings */
  function (c, r, rows) {
    var m = (COLS - 1) / 2, mr = (rows - 1) / 2;
    var d = Math.round(Math.hypot((c - m) * 0.8, (r - mr) * 1.25));
    return d % 2 === 0 ? (d === 0 ? 3 : 2) : (d > 3 ? 0 : 1);
  },
  /* 9 · a comb hanging from the top */
  function (c, r, rows) { return (c & 1) ? (r < rows - 1 ? 1 : 0) : (r < 2 ? 9 : 2); }
];

/* how tall the wall is, and how hard, as the levels go by */
function shapeFor(n) { return SHAPES[(n - 1) % SHAPES.length]; }
function rowsFor(n) { return Math.min(9, 4 + Math.floor((n - 1) / 2)); }

Levels.build = function (n) {
  var rows = rowsFor(n), grid = [], c, r;
  var shape = shapeFor(n);
  var harden = Math.floor((n - 1) / SHAPES.length);      /* second time round, tougher */
  for (r = 0; r < rows; r++) {
    var row = [];
    for (c = 0; c < COLS; c++) {
      var v = shape(c, r, rows, n) | 0;
      if (v && v !== 9 && harden) v = Math.min(3, v + harden);
      row.push(v);
    }
    grid.push(row);
  }
  if (!reachable(grid)) thin(grid);
  return { n: n, cols: COLS, rows: rows, grid: grid, speed: 1 + Math.min(0.75, (n - 1) * 0.055) };
};

/* Can the ball get at everything?

   Flood up from below the wall, through everything that is **not solid** —
   empty cells and breakable bricks alike. That last part is the whole
   subtlety and it is easy to get wrong: the obvious version floods only
   through empty cells and stops at the first brick, which then reports every
   brick with another brick in front of it as unreachable. That is not what
   unreachable means. A brick behind a brick is reachable, because the brick
   in front of it is going to be broken; a brick behind a *solid* is not,
   because that solid is never going anywhere.

   With the wrong version the generator declares almost every level
   impossible, thins solids until its guard expires, and quietly ships walls
   it believes are broken. tools/rules-check.js runs this same walk over the
   first forty levels and requires it to come back clean. */
function reachable(grid) {
  var rows = grid.length, seen = [], q = [], i, c, r;
  for (r = 0; r < rows; r++) { seen.push([]); for (c = 0; c < COLS; c++) seen[r].push(false); }
  for (c = 0; c < COLS; c++) if (grid[rows - 1][c] !== 9) { q.push([rows - 1, c]); seen[rows - 1][c] = true; }
  var d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (q.length) {
    var p = q.pop();
    r = p[0]; c = p[1];
    for (i = 0; i < 4; i++) {
      var rr = r + d[i][0], cc = c + d[i][1];
      if (rr < 0 || rr >= rows || cc < 0 || cc >= COLS || seen[rr][cc]) continue;
      if (grid[rr][cc] === 9) continue;              /* only a solid stops it */
      seen[rr][cc] = true;
      q.push([rr, cc]);
    }
  }
  for (r = 0; r < rows; r++) for (c = 0; c < COLS; c++) {
    if (grid[r][c] && grid[r][c] !== 9 && !seen[r][c]) return false;
  }
  return true;
}
/* the fix is always the same: there is too much wall. Take solids out, from
   the middle outwards, until everything can be got at. */
function thin(grid) {
  var rows = grid.length, guard = 0;
  while (!reachable(grid) && guard++ < COLS * rows) {
    var best = null, bestD = -1;
    for (var r = 0; r < rows; r++) for (var c = 0; c < COLS; c++) {
      if (grid[r][c] !== 9) continue;
      var d = Math.abs(c - (COLS - 1) / 2);
      if (d > bestD) { bestD = d; best = [r, c]; }
    }
    if (!best) break;
    grid[best[0]][best[1]] = 1;
  }
}

Levels.count = function (L) {
  var n = 0;
  for (var r = 0; r < L.rows; r++) for (var c = 0; c < L.cols; c++) if (L.grid[r][c] && L.grid[r][c] !== 9) n++;
  return n;
};
Levels.SHAPES = SHAPES.length;

if (typeof module !== "undefined" && module.exports) module.exports = Levels;
else root.Levels = Levels;
})(typeof self !== "undefined" ? self : this);
