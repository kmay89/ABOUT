/* rules.js — the rules of the well, as data.

   Everything in this file is a fact about the game rather than a piece of
   machinery: the size of the well, the seven shapes, the wall-kick tests,
   the gravity curve, the score table, the Twist corner rule and the table
   of fewest presses. The engine (engine.js) runs these facts; the explainer
   (learn.js) prints them; the tests (tools/rules-check.js) re-derive them.
   Keeping them in one place is what lets the explainer promise that it can
   never disagree with the game — it is reading the same numbers.

   ## Which way is up

   **y is up.** Row 0 is the bottom of the well, row 21 is the top row you
   can see, and rows 22–39 are open air above the mouth where pieces are
   born. Half of the published rotation tables are written y-down for
   screen convenience and half are written y-up, and mixing the two is the
   classic way to ship a game whose pieces kick *into* the floor. Every
   table below is y-up, exactly as printed in the open-source engines we
   cross-checked against (cold-clear, Techmino, Triangle.js), and the kick
   tables are additionally *derived* from the compact offset form in
   tools/rules-check.js and compared byte for byte, because popular
   libraries do ship typos in these tables and only a derivation catches
   them.

   ## Why the well is 22 rows

   Most games in this family show 20 rows. Ours shows 22. Two rows of extra
   headroom make a calm game a little more forgiving, and a 10×22 well is
   the shape of a phone held upright. Width is what shapes strategy, and the
   width is unchanged: ten columns, so line clears, scores, the bag and the
   forty-line race all work exactly as everywhere else.

   ## Pieces

   Cells hold 0 for empty, 1–7 for the seven shapes in the order
   I O T S Z J L, and 8 for silt. A piece's position is its *rotation
   centre*, and the shapes below are offsets from that centre in each of the
   four rotation states 0, R, 2, L (clockwise is +1). The three-wide pieces
   turn about their middle cell; the long piece and the square are stored as
   explicit states because their centres sit between cells.                 */
(function (root) {
"use strict";

var Rules = {};

/* ---------- the well ---------- */
var W = 10, VISIBLE = 22, H = 40;
Rules.W = W;
Rules.VISIBLE = VISIBLE;          /* rows 0..21 are the well you can see */
Rules.H = H;                      /* 18 rows of open air above it */
Rules.SPAWN = { x: 4, y: 22 };    /* where a piece is born: the first hidden row */

Rules.NAMES = ["", "I", "O", "T", "S", "Z", "J", "L"];
Rules.ID = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7, G: 8 };
Rules.SILT = 8;
Rules.T = 3;
Rules.ROT = ["0", "R", "2", "L"];

/* ---------- timing defaults (milliseconds) ----------
   Handling values are stored in milliseconds rather than frames so that a
   120 Hz iPad and a 60 Hz laptop behave identically. They are whole-ms
   roundings of frame counts: 167 is ten frames of 16.667, 33 is two. */
Rules.LOCK_MS = 500;              /* per-mode values live in modes.js */
Rules.MOVE_RESETS = 15;           /* moves or turns a landed piece may make */
Rules.SDF = 20;                   /* soft drop is twenty times gravity, floored */
Rules.DAS_MS = 167;
Rules.ARR_MS = 33;
Rules.DCD_MS = 0;
Rules.PREVIEWS = 5;
Rules.QUEUE_MIN = 7;              /* the engine always knows at least a bag ahead */

/* Breath, our relief valve: a line charges one bead, twenty beads fill the
   ring, ten beads buy one breath of ten seconds — four in, six out. */
Rules.BREATH_MAX = 20;
Rules.BREATH_COST = 10;
Rules.BREATH_MS = 10000;

/* The drain: when a calm well fills, rows leave from the *bottom* until the
   highest block sits at row 10 or below, and always at least four go. The
   top surface — the thing the player was building — survives intact. */
Rules.DRAIN_TO = 10;
Rules.DRAIN_MIN = 4;

/* danger for the music and the vignette: nothing below row 8, all of it by
   row 20 */
Rules.DANGER_FROM = 8;
Rules.DANGER_SPAN = 12;

/* ---------- the seven shapes ---------- */
function rotCW(p) { return [p[1], -p[0]]; }
function rotAll(list) {
  var out = [];
  for (var i = 0; i < list.length; i++) out.push(rotCW(list[i]));
  return out;
}
/* a three-wide piece is drawn once, facing north, and turned three times */
function states3(north) {
  var r = rotAll(north), r2 = rotAll(r);
  return [north, r, r2, rotAll(r2)];
}
var SHAPES = {
  T: states3([[-1, 0], [0, 0], [1, 0], [0, 1]]),
  J: states3([[-1, 1], [-1, 0], [0, 0], [1, 0]]),
  L: states3([[1, 1], [-1, 0], [0, 0], [1, 0]]),
  S: states3([[-1, 0], [0, 0], [0, 1], [1, 1]]),
  Z: states3([[-1, 1], [0, 1], [0, 0], [1, 0]]),
  /* the long piece turns about a point between four cells, so its states
     are written out rather than rotated */
  I: [[[-1, 0], [0, 0], [1, 0], [2, 0]], [[1, 1], [1, 0], [1, -1], [1, -2]],
      [[-1, -1], [0, -1], [1, -1], [2, -1]], [[0, 1], [0, 0], [0, -1], [0, -2]]],
  /* and the square does not turn at all: every state is the same four cells */
  O: [[[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]],
      [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]]]
};
Rules.SHAPES = SHAPES;
/* the same arrays, indexed by cell value: CELLS[type][rot] */
Rules.CELLS = [null];
for (var ti = 1; ti <= 7; ti++) Rules.CELLS.push(SHAPES[Rules.NAMES[ti]]);

/* type may be given as 1..7 or as a letter; the engine uses numbers */
function typeId(t) {
  if (typeof t === "number") return t;
  return Rules.ID[String(t).toUpperCase()] || 0;
}
Rules.typeId = typeId;
Rules.shape = function (type, rot) {
  var c = Rules.CELLS[typeId(type)];
  return c ? c[((rot % 4) + 4) % 4] : null;
};

/* ---------- rotation: the five tests ----------
   A turn tries up to five positions in order and takes the first that
   fits; if none fits, the piece does not turn. The tests are the famous
   wall kicks. The key is from+to ("0R" = north to east).

   Stored **y-up, exactly as printed.** */
Rules.KICKS_JLSTZ = {
  "0R": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "R0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "R2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "2R": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "2L": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "L2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "L0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "0L": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
};
Rules.KICKS_I = {
  "0R": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "R0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "R2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "2R": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "2L": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "L2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "L0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "0L": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
};
/* "Modern turning" (off by default): a half-turn key, and the long piece's
   kicks made mirror-symmetric the way several online games do it. Neither
   is part of the classic rule set, and the explainer says so. */
Rules.KICKS_I_PLUS = {
  "0R": [[0, 0], [1, 0], [-2, 0], [-2, -1], [1, 2]],
  "R0": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "R2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "2R": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "2L": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "L2": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "L0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "0L": [[0, 0], [-1, 0], [2, 0], [2, -1], [-1, 2]]
};
Rules.KICKS_180 = {     /* J L S T Z */
  "02": [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
  "20": [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
  "RL": [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]],
  "LR": [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]]
};
Rules.KICKS_180_I = { "02": [[0, 0], [0, 1]], "20": [[0, 0], [0, -1]], "RL": [[0, 0], [1, 0]], "LR": [[0, 0], [-1, 0]] };
var KICK_NONE = [[0, 0]];

/* The compact form the 90° tables above come from: each rotation state has
   five "rotation points", and the kick for test i going from a to b is
   off[a][i] − off[b][i], less the same difference for test 1 (which turns
   the long piece's pure rotation into its visual one). The square's
   offsets exist only to cancel its drift: every turn of it is a no-op in
   place. These are what tools/rules-check.js derives the tables from. */
Rules.OFFSETS = {
  JLSTZ: { "0": [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], "R": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
           "2": [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], "L": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]] },
  I:     { "0": [[0, 0], [-1, 0], [2, 0], [-1, 0], [2, 0]], "R": [[-1, 0], [0, 0], [0, 0], [0, 1], [0, -2]],
           "2": [[-1, 1], [1, 1], [-2, 1], [1, 0], [-2, 0]], "L": [[0, 1], [0, 1], [0, 1], [0, -1], [0, 2]] },
  O:     { "0": [[0, 0]], "R": [[0, -1]], "2": [[-1, -1]], "L": [[-1, 0]] }
};

/* The tests for one turn, from rotation state "from" to state "to": one
   step clockwise, one anticlockwise, or a half turn (modern only — null
   otherwise). */
Rules.kicks = function (type, from, to, modern) {
  type = typeId(type);
  from = ((from % 4) + 4) % 4; to = ((to % 4) + 4) % 4;
  var key = Rules.ROT[from] + Rules.ROT[to];
  var half = ((to - from + 4) % 4) === 2;
  if (half && !modern) return null;
  if (type === 2) return KICK_NONE;                  /* the square never moves */
  if (half) return type === 1 ? Rules.KICKS_180_I[key] : Rules.KICKS_180[key];
  if (type === 1) return (modern ? Rules.KICKS_I_PLUS : Rules.KICKS_I)[key];
  return Rules.KICKS_JLSTZ[key];
};

/* ---------- the bag ----------
   Pieces come in shuffled sets of seven, each holding exactly one of every
   shape, and a fresh set is shuffled when one runs out. The shuffle is the
   Park–Miller "minimal standard" generator driving a Fisher–Yates shuffle
   from the end, starting from this base order — the same arrangement the
   open-source engines use, so a seed means the same thing here as there.
   The randomizer never looks at the board. */
Rules.BAG_ORDER = [5, 7, 2, 4, 1, 6, 3];           /* Z L O S I J T */
Rules.MINSTD_M = 2147483647;
Rules.MINSTD_A = 16807;

/* ---------- gravity ----------
   Seconds per row at level L: (0.8 − (L − 1) × 0.007) ^ (L − 1). Level 1
   is one row a second; level 10 is about fifteen; level 15 is about 141
   rows a second, and that is as fast as anything here goes. */
Rules.secPerRow = function (L) {
  L = Math.max(1, L);
  return Math.pow(0.8 - (L - 1) * 0.007, L - 1);
};
Rules.gravityMs = function (L) { return Rules.secPerRow(L) * 1000; };
Rules.LEVEL_MAX = 15;

/* ---------- scoring ----------
   Points are multiplied by the level *before* the clear. "Difficult" clears
   — Quads and every Twist that clears lines, Mini included — build an
   Unbroken chain: each one after the first earns half its line score again.
   Only a plain Single, Double or Triple breaks the chain; Keep and a lock
   that clears nothing do not. Ripple pays 50 × r × level for the r-th
   consecutive clearing piece after the first, and any lock that clears
   nothing ends it. The Empty Well bonus is *added* to the line score —
   games differ on that, and the explainer says so. Unbroken multiplies the
   line score only, never Ripple or the Empty Well bonus. */
Rules.LINE_SCORE = { none: [0, 100, 300, 500, 800], mini: [100, 200, 400], full: [400, 800, 1200, 1600] };
Rules.EMPTY_BONUS = [0, 800, 1200, 1800, 2000];
Rules.EMPTY_UNBROKEN_QUAD = 3200;
Rules.SOFT_POINTS = 1;            /* per row, not multiplied by level */
Rules.HARD_POINTS = 2;            /* per row, not multiplied by level */
Rules.RIPPLE_POINTS = 50;

Rules.scoreState = function (level) {
  return { score: 0, level: level || 1, lines: 0, ripple: -1, unbroken: -1 };
};

/* The scorer. The state {score, level, lines, ripple, unbroken} is
   updated in place; levelling up is the mode's business, not the
   scorer's. Returns the points gained. An "out" object, if given, receives the
   parts, *before* the level multiplier: base, ubBonus, rippleBonus,
   emptyBonus, and whether the clear was difficult. */
Rules.score = function (st, twist, lines, empty, softRows, hardRows, out) {
  twist = twist || "none";
  lines = lines || 0;
  /* a Mini Twist Triple cannot happen — a turned T that clears three rows
     always has both pointing-side corners filled — but guard anyway */
  if (twist === "mini" && lines >= 3) twist = "full";
  var lvl = st.level;
  var base = Rules.LINE_SCORE[twist][lines] || 0;
  var difficult = lines > 0 && (lines === 4 || twist !== "none");
  var ub = 0, rp = 0, ew = 0;
  if (lines > 0) {
    if (difficult) { st.unbroken += 1; if (st.unbroken > 0) ub = base / 2; }
    else st.unbroken = -1;
    st.ripple += 1; if (st.ripple > 0) rp = Rules.RIPPLE_POINTS * st.ripple;
    if (empty) ew = (lines === 4 && st.unbroken > 0) ? Rules.EMPTY_UNBROKEN_QUAD : Rules.EMPTY_BONUS[lines];
  } else st.ripple = -1;
  var gained = (base + ub + rp + ew) * lvl +
               (softRows || 0) * Rules.SOFT_POINTS + (hardRows || 0) * Rules.HARD_POINTS;
  st.score += gained;
  st.lines += lines;
  if (out) {
    out.twist = twist; out.base = base; out.ubBonus = ub; out.rippleBonus = rp;
    out.emptyBonus = ew; out.difficult = difficult; out.level = lvl;
  }
  return gained;
};

Rules.difficult = function (twist, lines) { return lines > 0 && (lines === 4 || (twist && twist !== "none")); };

/* the words for a clear. Unbroken, Ripple and Empty Well are separate
   fields on the clear event, drawn as separate labels. */
var LINE_NAMES = ["", "Single", "Double", "Triple", "Quad"];
Rules.label = function (twist, lines) {
  if (twist === "mini" && lines >= 3) twist = "full";
  if (twist === "full") return lines ? "Twist " + LINE_NAMES[lines] : "Twist";
  if (twist === "mini") return lines ? "Mini Twist " + LINE_NAMES[lines] : "Mini Twist";
  return LINE_NAMES[lines] || "";
};

/* ---------- the Twist ----------
   Only the T can Twist, and only when the last thing that moved it was a
   turn. At least three of the four cells diagonal to its centre must be
   filled — walls and the floor count as filled. It is a **full** Twist if
   both corners on the side the T points to are filled, or if the turn used
   the fifth kick test (the long hop that threads a T into a triple slot);
   otherwise it is a **Mini**. A half turn can make a Twist by the corner
   rule but never earns the fifth-test upgrade. */
Rules.CORNERS = [[-1, 1], [1, 1], [1, -1], [-1, -1]];   /* TL TR BR BL, y-up */
Rules.FRONT = [[0, 1], [1, 2], [2, 3], [3, 0]];          /* pointing side, by rot 0 R 2 L */

function occupied(board, x, y) {
  return (x < 0 || x >= W || y < 0 || (y < H && board[y * W + x])) ? 1 : 0;
}
Rules.twist = function (board, x, y, rot, lastWasTurn, kick, was180) {
  if (!lastWasTurn) return "none";
  var C = Rules.CORNERS, total = 0, i;
  for (i = 0; i < 4; i++) total += occupied(board, x + C[i][0], y + C[i][1]);
  if (total < 3) return "none";
  var F = Rules.FRONT[((rot % 4) + 4) % 4];
  var front = occupied(board, x + C[F[0]][0], y + C[F[0]][1]) +
              occupied(board, x + C[F[1]][0], y + C[F[1]][1]);
  if (front === 2) return "full";
  if (kick === 4 && !was180) return "full";
  return "mini";
};

/* ---------- fewest presses ----------
   FINESSE[piece][orientation][leftmost column] is one optimal input string
   to put a piece there on an empty well, counting a slide to the wall (DL,
   DR) as one press and not counting the drop. Orientations: T, J and L by rotation
   (0 R 2 L); I, S and Z only by lying flat (H) or standing (V), since their
   two flat and two standing states make the same shapes; O has one.
   Our own breadth-first search derived it; tools/rules-check.js re-derives
   all 162 entries through the real engine on every run. */
var FINESSE = {
  I: { H: ["DL", "DL R", "L", "", "R", "DR L", "DR"],
       V: ["CW DL", "DL CCW", "DL CW", "L CCW", "CCW", "CW", "R CW", "DR CCW", "DR CW", "CW DR"] },
  O: { "0": ["DL", "DL R", "L L", "L", "", "R", "R R", "DR L", "DR"] },
  T: { "0": ["DL", "DL R", "L", "", "R", "R R", "DR L", "DR"],
       "2": ["DL CW CW", "DL R CW CW", "L CW CW", "CW CW", "R CW CW", "R R CW CW", "DR L CW CW", "DR CW CW"],
       "L": ["DL CCW", "DL R CCW", "L CCW", "CCW", "R CCW", "R R CCW", "DR L CCW", "DR CCW", "CCW DR"],
       "R": ["CW DL", "DL CW", "DL R CW", "L CW", "CW", "R CW", "R R CW", "DR L CW", "DR CW"] },
  S: { H: ["DL", "DL R", "L", "", "R", "R R", "DR L", "DR"],
       V: ["DL CCW", "DL CW", "L CCW", "CCW", "CW", "R CW", "DR L CCW", "DR CCW", "DR CW"] }
};
FINESSE.J = FINESSE.L = FINESSE.T;
FINESSE.Z = FINESSE.S;
Rules.FINESSE = FINESSE;

Rules.finesseClass = function (type, rot) {
  var n = Rules.NAMES[typeId(type)];
  rot = ((rot % 4) + 4) % 4;
  if (n === "O") return "0";
  if (n === "I" || n === "S" || n === "Z") return (rot === 0 || rot === 2) ? "H" : "V";
  return Rules.ROT[rot];
};
/* the table entry for a piece resting with its leftmost cell in column "left" */
Rules.finesseFor = function (type, rot, left) {
  var n = Rules.NAMES[typeId(type)];
  var row = FINESSE[n] && FINESSE[n][Rules.finesseClass(type, rot)];
  return row ? row[left] : undefined;
};
Rules.finesseCount = function (s) {
  if (!s) return 0;
  return s.split(" ").length;
};
/* the input words of the table, as engine actions */
Rules.PRESS_ACTION = { L: "left", R: "right", DL: "dasLeft", DR: "dasRight", CW: "cw", CCW: "ccw", "180": "180" };

/* ---------- silt ----------
   Rising rows for the Silt challenges: nine cells and one hole, the hole
   never in the same column as the row next to it. */
Rules.SILT_REROLLS = 10;

if (typeof module !== "undefined" && module.exports) module.exports = Rules;
else root.Rules = Rules;
})(typeof self !== "undefined" ? self : this);
