/* coach.js — the lesson runner.

   Challenges are where The Well teaches the deep stuff, and every one of
   them is open from the first launch. This file runs them: it watches the
   engine's events and the player's presses, decides when a lesson has been
   passed, and can show — at any time, without waiting — where a piece could
   go and exactly which presses would put it there.

   It owns no state the game depends on. The app asks it for engine options
   before a run, tells it about every event and every press, and does what it
   says: draw the outline it hands over, say the line it offers, rewind the
   piece when it asks. Take the coach away and the lesson is an ordinary run.

   ## Counting presses honestly (Fewest Moves)

   The lesson is the one strong players call finesse: every piece to every
   column in the fewest presses. "Fewest" needs a referee, and the referee
   here is a breadth-first search over the real board, not a table. From the
   spawn position it tries every tap, every slide to the wall and every turn,
   and records the shortest route to each place a hard drop could end. On an
   empty well that search reproduces the fewest-presses table in rules.js
   exactly, all 162 entries; on a real stack it also knows the routes the
   table cannot, because the table assumes nothing is in the way.

   What counts as one press matters as much as the search, and the rules are
   the ones finesse has always used:

     a tap is one press, and so is a turn, even one that is blocked;
     a held direction is one press however far it carries the piece — the
       auto-repeat and the slide to the wall it turns into are the same press;
     on a touch screen one drag in one direction is one press, because the
       finger is the auto-repeat;
     soft drop is allowed but that piece doesn't count, and neither does a
       piece the coach placed for you.

   Go over the shortest count and the piece rewinds to the top with the ideal
   presses written out (← → ⇤ ⇥ ↻ ↺). It is the gentlest correction there is:
   nothing locks in the wrong place, nothing is lost, you simply go again. A
   fault resets the run of perfect pieces, because "twenty in a row" is the
   pass mark, and it says so without making a thing of it.

   After twenty in a row the lesson turns into an audit of free play — no
   targets, just keys per piece and the share of pieces placed in the fewest
   presses for wherever *you* chose to put them.

   ## Hints that are allowed to be good

   Hint and Watch are available at once, in every lesson. Using them only
   adds a small "with a hint" note to the result. The hint for a free
   placement comes from a plain hand-tuned evaluator — landing height, holes,
   how ragged the surface is — with a lesson's own priorities on top: never
   cover a hole in Keep and Look Ahead, keep the right-hand column open in
   Clean Stacking, dig in Silt. It is not clever, and it is not meant to be;
   it plays the way the lesson is asking you to.

   Watch never plays a recorded tape. Each step it re-plans from wherever the
   piece actually is, so gravity, a stray press or a different engine timing
   can't knock it off course.

   ## What the app has to do

     opts = C.engineOpts(lesson)       before creating the game
     C.start(lesson, g)                once the game exists
     C.action(a, meta, g)              before applying each press; on "rewind"
                                       skip the press and call Well.rewind(g)
                                       (that answer is the only rewind signal;
                                       onRewind is accepted but never called,
                                       so a host can't rewind twice)
     C.event(ev, g)                    for every engine event
     C.next(g) / Coach.apply(g, a)     one step of "Watch", every ~150 ms

   The engine options are not the coach's to decide. Each lesson's engine
   block lives in modes.js, which is the one truth about how a challenge
   plays (gravity, Keep, previews, what a full well does); C.engineOpts
   returns exactly what Modes says for the lesson, plus which prepared well
   it has reached.

   The Twist Slot lesson plays five prepared wells. Each deals its one T and
   then halts. The coach judges the T — on its clear, or on the halt if
   nothing cleared — and a moment later calls onNext(engineOpts); the app
   starts a fresh game with those options and calls C.start again. Without
   onNext, the next call to C.engineOpts returns the next well, so an app
   that simply starts the lesson again still moves through all five.      */
(function (root) {
"use strict";

/* ---------- the other modules ----------
   Read late, not at load: in the browser they are globals that load before
   this file, in node the tools require them next to it. */
function mod(name, file) {
  if (root && root[name]) return root[name];
  if (typeof module !== "undefined" && module.exports && typeof require === "function") {
    try { return require(file); } catch (e) { return null; }
  }
  return null;
}
function Well() { return mod("Well", "./engine.js"); }
function Rules() { return mod("Rules", "./rules.js"); }
function Modes() { return mod("Modes", "./modes.js"); }

var NAMES = ["", "I", "O", "T", "S", "Z", "J", "L"];
var ORDER = ["0", "R", "2", "L"];
var BW = 10, BH = 40, VIS = 22;
function dims() {
  var R = Rules();
  if (R) { BW = R.W || 10; BH = R.H || 40; VIS = R.VISIBLE || 22; if (R.NAMES) NAMES = R.NAMES; }
}

/* The engine may speak of pieces by number (1..7) or by letter; lesson data
   is written in letters. Compare by letter, hand the engine its own kind. */
function letterOf(t) { return typeof t === "number" ? (NAMES[t] || "") : String(t || ""); }

/* ---------- kicks ----------
   The five tests per turn, y up, exactly as rules.js stores them. If a
   build of rules.js names them differently the copy below is the same
   published data, so the search and the engine can never disagree about
   what a turn is allowed to do. */
var K_JLSTZ = {
  "0R": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], "R0": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  "R2": [[0,0],[1,0],[1,-1],[0,2],[1,2]],     "2R": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  "2L": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],    "L2": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  "L0": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],  "0L": [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
};
var K_I = {
  "0R": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],   "R0": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  "R2": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],   "2R": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  "2L": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],   "L2": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  "L0": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],   "0L": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
};
var K_I_PLUS = {
  "0R": [[0,0],[1,0],[-2,0],[-2,-1],[1,2]],   "R0": [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  "R2": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],   "2R": [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  "2L": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],   "L2": [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  "L0": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],   "0L": [[0,0],[-1,0],[2,0],[2,-1],[-1,2]]
};
var K_180 = {
  "02": [[0,0],[0,1],[1,1],[-1,1],[1,0],[-1,0]], "20": [[0,0],[0,-1],[-1,-1],[1,-1],[-1,0],[1,0]],
  "RL": [[0,0],[1,0],[1,2],[1,1],[0,2],[0,1]],   "LR": [[0,0],[-1,0],[-1,2],[-1,1],[0,2],[0,1]]
};
var K_180_I = { "02": [[0,0],[0,1]], "20": [[0,0],[0,-1]], "RL": [[0,0],[1,0]], "LR": [[0,0],[-1,0]] };

function table(name, fallback) {
  var R = Rules(), t = R && (R[name] || (R.KICKS && R.KICKS[name.replace(/^KICKS_/, "")]));
  return (t && t["0R"] !== undefined) || (t && t["02"] !== undefined) ? t : fallback;
}
function kicksFor(letter, from, to, half, modern) {
  var key = ORDER[from] + ORDER[to];
  if (half) return (letter === "I" ? table("KICKS_180_I", K_180_I) : table("KICKS_180", K_180))[key] || [[0, 0]];
  if (letter === "I") return (modern ? table("KICKS_I_PLUS", K_I_PLUS) : table("KICKS_I", K_I))[key];
  return table("KICKS_JLSTZ", K_JLSTZ)[key];
}

/* ---------- shapes and fitting, on any board ----------
   The shapes come from the engine itself (Well.cells at the origin) and are
   cached as flat offsets, so the search can test a position on a snapshot
   of the board as cheaply as the engine tests the live one. */
var shapes = {};
function shape(type, rot) {
  var k = type + ":" + rot, s = shapes[k];
  if (!s) {
    var c = Well().cells(type, rot, 0, 0);
    s = [];
    for (var i = 0; i < c.length; i++) s.push(c[i][0], c[i][1]);
    shapes[k] = s;
  }
  return s;
}
function fitsOn(b, type, rot, x, y) {
  var s = shape(type, rot);
  for (var i = 0; i < s.length; i += 2) {
    var cx = x + s[i], cy = y + s[i + 1];
    if (cx < 0 || cx >= BW || cy < 0 || cy >= BH || b[cy * BW + cx]) return false;
  }
  return true;
}
function cellsAt(type, rot, x, y) {
  var s = shape(type, rot), out = [];
  for (var i = 0; i < s.length; i += 2) out.push([x + s[i], y + s[i + 1]]);
  return out;
}
function dropY(b, type, rot, x, y) { while (fitsOn(b, type, rot, x, y - 1)) y--; return y; }
function placeKey(type, rot, x, y) {
  var s = shape(type, rot), k = [];
  for (var i = 0; i < s.length; i += 2) k.push((y + s[i + 1]) * BW + x + s[i]);
  k.sort(function (a, b) { return a - b; });
  return k.join(",");
}
function keyOfCells(cells) {
  var k = [];
  for (var i = 0; i < cells.length; i++) k.push(cells[i][1] * BW + cells[i][0]);
  k.sort(function (a, b) { return a - b; });
  return k.join(",");
}
/* the canonical spawn: (4, 22), then the one-row drop if nothing blocks it */
function spawnState(b, type) {
  var y = fitsOn(b, type, 0, 4, 21) ? 21 : 22;
  return { rot: 0, x: 4, y: y };
}

/* one input applied to a position; null when nothing would change */
function applyTok(b, type, s, tok, modern) {
  var letter = letterOf(type), x = s.x, n;
  if (tok === "L" || tok === "R") {
    n = tok === "L" ? -1 : 1;
    return fitsOn(b, type, s.rot, x + n, s.y) ? { rot: s.rot, x: x + n, y: s.y, kick: -1 } : null;
  }
  if (tok === "DL" || tok === "DR") {
    n = tok === "DL" ? -1 : 1;
    while (fitsOn(b, type, s.rot, x + n, s.y)) x += n;
    return x !== s.x ? { rot: s.rot, x: x, y: s.y, kick: -1 } : null;
  }
  if (tok === "D") return fitsOn(b, type, s.rot, x, s.y - 1) ? { rot: s.rot, x: x, y: s.y - 1, kick: -1 } : null;
  if (letter === "O") return null;
  var half = tok === "180";
  var to = tok === "CW" ? (s.rot + 1) & 3 : tok === "CCW" ? (s.rot + 3) & 3 : (s.rot + 2) & 3;
  var tests = kicksFor(letter, s.rot, to, half, modern);
  if (!tests) return null;
  for (var i = 0; i < tests.length; i++) {
    if (fitsOn(b, type, to, x + tests[i][0], s.y + tests[i][1])) {
      return { rot: to, x: x + tests[i][0], y: s.y + tests[i][1], kick: i, half: half };
    }
  }
  return null;
}
function stateKey(s, extra) { return (((s.rot * 16) + (s.x + 3)) * 48 + (s.y + 4)) * 8 + (extra || 0); }

/* Every place a hard drop can end from `start`, with the fewest presses to
   get there — the finesse search. No soft drop, so no tucks and no spins:
   those are the pieces the lesson leaves uncounted. */
function reach(b, type, start, modern) {
  var letter = letterOf(type);
  var toks = ["L", "R", "DL", "DR"];
  if (letter !== "O") { toks.push("CW", "CCW"); if (modern) toks.push("180"); }
  var first = { rot: start.rot, x: start.x, y: start.y, path: [] };
  var queue = [first], seen = {}, out = {}, count = 0;
  seen[stateKey(first)] = 1;
  for (var q = 0; q < queue.length; q++) {
    var s = queue[q];
    var ly = dropY(b, type, s.rot, s.x, s.y);
    var pk = placeKey(type, s.rot, s.x, ly);
    if (!out[pk]) { out[pk] = { rot: s.rot, x: s.x, y: ly, path: s.path, len: s.path.length, key: pk }; count++; }
    for (var i = 0; i < toks.length; i++) {
      var n = applyTok(b, type, s, toks[i], modern);
      if (!n) continue;
      var k = stateKey(n);
      if (seen[k]) continue;
      seen[k] = 1;
      n.path = s.path.concat(toks[i]);
      queue.push(n);
    }
  }
  out.count = count;
  return out;
}

/* The corner rule (brief §3.12), on any board: three of the four diagonal
   cells filled, walls and floor counting; full when both front corners are
   filled or the turn used the fifth test (never for a half-turn). */
var CORNERS = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
var FRONT = [[0, 1], [1, 2], [2, 3], [3, 0]];
function cornerTwist(b, s) {
  function occ(c) {
    var x = s.x + c[0], y = s.y + c[1];
    return (x < 0 || x >= BW || y < 0 || b[y * BW + x]) ? 1 : 0;
  }
  var total = 0, i;
  for (i = 0; i < 4; i++) total += occ(CORNERS[i]);
  if (total < 3) return "none";
  if (occ(CORNERS[FRONT[s.rot][0]]) + occ(CORNERS[FRONT[s.rot][1]]) === 2) return "full";
  if (s.kick === 4 && !s.half) return "full";
  return "mini";
}

/* The search with soft drop in it, for a placement only reachable by
   sliding or turning low down — the Twist slot. When `twist` is asked for,
   the last move has to be the turn that makes it, so the state remembers
   whether it was reached by a turn and with which test. */
function route(b, type, start, goal, twist, modern) {
  var letter = letterOf(type);
  var toks = ["L", "R", "D"];
  if (letter !== "O") { toks.push("CW", "CCW"); if (modern) toks.push("180"); }
  toks.push("DL", "DR");
  var first = { rot: start.rot, x: start.x, y: start.y, kick: -1, path: [] };
  var queue = [first], seen = {};
  seen[stateKey(first, 0)] = 1;
  for (var q = 0; q < queue.length && q < 60000; q++) {
    var s = queue[q];
    if (s.rot === goal.rot && s.x === goal.x && s.y === goal.y && !fitsOn(b, type, s.rot, s.x, s.y - 1)) {
      if (!twist || twist === "none" || (s.kick >= 0 && cornerTwist(b, s) === twist)) return s.path;
    }
    for (var i = 0; i < toks.length; i++) {
      var n = applyTok(b, type, s, toks[i], modern);
      if (!n) continue;
      /* a half-turn never earns the fifth-test upgrade, so all its tests
         are one case; a quarter-turn remembers which test it used */
      var k = stateKey(n, n.kick < 0 ? 0 : n.half ? 7 : 1 + n.kick);
      if (seen[k]) continue;
      seen[k] = 1;
      n.path = s.path.concat(toks[i]);
      queue.push(n);
    }
  }
  return null;
}

/* ---------- reading a board ---------- */
function copyBoard(b) { var c = new Array(b.length); for (var i = 0; i < b.length; i++) c[i] = b[i]; return c; }
/* the board as it will be once full rows have gone — a lock event can
   arrive before the clear does */
function settled(b) {
  var out = [], y, x;
  for (y = 0; y < BH; y++) {
    var full = true;
    for (x = 0; x < BW; x++) if (!b[y * BW + x]) { full = false; break; }
    if (!full) for (x = 0; x < BW; x++) out.push(b[y * BW + x]);
  }
  while (out.length < BW * BH) out.push(0);
  return out;
}
/* a covered hole: an empty cell with something above it in its column */
function holes(b) {
  var n = 0;
  for (var x = 0; x < BW; x++) {
    var roof = false;
    for (var y = BH - 1; y >= 0; y--) {
      if (b[y * BW + x]) roof = true;
      else if (roof) n++;
    }
  }
  return n;
}
function heights(b) {
  var h = [];
  for (var x = 0; x < BW; x++) {
    var y = BH - 1;
    while (y >= 0 && !b[y * BW + x]) y--;
    h.push(y + 1);
  }
  return h;
}

/* ---------- the evaluator behind every free hint ----------
   Six features with weights in the spirit of the well-known hand-tuned
   players: lower is better, holes and ragged columns are worst, cleared rows
   help. Each lesson adds its own priorities on top. */
function evaluate(b, type, p, kind) {
  var c = copyBoard(b), cs = cellsAt(type, p.rot, p.x, p.y), i, x, y;
  var lo = 99, hi = -1, siltRows = 0;
  for (i = 0; i < cs.length; i++) {
    c[cs[i][1] * BW + cs[i][0]] = 9;
    if (cs[i][1] < lo) lo = cs[i][1];
    if (cs[i][1] > hi) hi = cs[i][1];
  }
  var cleared = 0, rowsOut = [];
  for (y = 0; y < BH; y++) {
    var full = true, silt = 0;
    for (x = 0; x < BW; x++) { var v = c[y * BW + x]; if (!v) { full = false; break; } if (v === 8) silt++; }
    if (full) { cleared++; if (silt) siltRows++; }
    else for (x = 0; x < BW; x++) rowsOut.push(c[y * BW + x]);
  }
  while (rowsOut.length < BW * BH) rowsOut.push(0);
  var cols = kind === "clean" ? BW - 1 : BW;
  var h = heights(rowsOut), hole = 0, rowT = 0, colT = 0, wells = 0, maxH = 0;
  for (x = 0; x < cols; x++) {
    if (h[x] > maxH) maxH = h[x];
    var roof = false;
    for (y = BH - 1; y >= 0; y--) {
      var f = rowsOut[y * BW + x] ? 1 : 0;
      if (f) roof = true; else if (roof) hole++;
    }
    var prev = 1;
    for (y = 0; y < h[x] + 1 && y < BH; y++) {
      var cur = rowsOut[y * BW + x] ? 1 : 0;
      if (cur !== prev) colT++;
      prev = cur;
    }
    var left = x === 0 ? BH : h[x - 1], right = x === cols - 1 ? BH : h[x + 1];
    var dep = Math.min(left, right) - h[x];
    if (dep > 0) wells += dep * (dep + 1) / 2;
  }
  for (y = 0; y < maxH; y++) {
    var pv = 1;
    for (x = 0; x < cols; x++) {
      var cv = rowsOut[y * BW + x] ? 1 : 0;
      if (cv !== pv) rowT++;
      pv = cv;
    }
    if (pv === 0) rowT++;
  }
  var land = (lo + hi) / 2 + 1;
  var score = -4.5 * land + 3.4 * cleared - 3.2 * rowT - 9.3 * colT - 7.9 * hole - 3.4 * wells;
  if (kind === "keep") score -= 40 * Math.max(0, hole - holes(settled(b)));
  if (kind === "clean") {
    var inWell = 0;
    for (i = 0; i < cs.length; i++) if (cs[i][0] === BW - 1) inWell++;
    if (cleared >= 4) score += 60;
    else {
      score -= 14 * inWell;
      if (cleared) score -= 9 * cleared;
    }
    if (maxH > 14) score -= (maxH - 14) * 6;
  }
  if (kind === "silt") score += 9 * siltRows;
  return score;
}

/* ---------- inputs, as icons and as words ---------- */
var ICON = { L: "←", R: "→", DL: "⇤", DR: "⇥", CW: "↻", CCW: "↺", "180": "↻↻", D: "↓", HD: "⤓", K: "Keep" };
var WORD = { L: "left", R: "right", DL: "slide left", DR: "slide right", CW: "turn clockwise",
             CCW: "turn counter-clockwise", "180": "half-turn", D: "down", HD: "drop", K: "keep" };
var ACTION = { L: "left", R: "right", DL: "dasLeft", DR: "dasRight", CW: "cw", CCW: "ccw", "180": "180",
               D: "down", HD: "hard", K: "hold" };
/* A run of soft-drop rows reads as one ↓: "down until it's there". */
function icons(path) {
  if (!path.length) return "⤓";
  var o = [];
  for (var i = 0; i < path.length; i++) {
    if (path[i] === "D" && i && path[i - 1] === "D") continue;
    o.push(ICON[path[i]] || path[i]);
  }
  return o.join(" ");
}
function words(path) {
  if (!path.length) return "Just drop it.";
  var o = [];
  for (var i = 0; i < path.length; i++) {
    if (path[i] === "D" && i && path[i - 1] === "D") continue;
    o.push(path[i] === "D" ? "soft drop" : (WORD[path[i]] || path[i]));
  }
  var w = o.join(", ");
  return w.charAt(0).toUpperCase() + w.slice(1) + ".";
}

/* which kind of lesson an entry from Modes is */
function kindOf(lesson) {
  if (!lesson) return null;
  if (lesson.kind) return lesson.kind;
  if (lesson.rows) return "silt";
  return null;
}
function findLesson(id) {
  var M = Modes(), i;
  if (!M) return null;
  var lists = [M.LESSONS || [], M.SILT || []];
  for (var l = 0; l < lists.length; l++) for (i = 0; i < lists[l].length; i++) if (lists[l][i].id === id) return lists[l][i];
  return null;
}
var NEED = { finesse: 20, keep: 40, clean: 3, slot: 5 };
/* Lessons state their pass mark in words ("Twenty pieces in a row…",
   "Clear all eighteen rows of silt"), so the count is read from the words
   when no number is given. */
var NUMBER = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
               eleven: 11, twelve: 12, fifteen: 15, eighteen: 18, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
function countIn(text) {
  if (typeof text !== "string") return 0;
  var d = /\d+/.exec(text);
  if (d) return +d[0];
  var w = text.toLowerCase().match(/[a-z]+/g) || [];
  for (var i = 0; i < w.length; i++) if (NUMBER[w[i]]) return NUMBER[w[i]];
  return 0;
}
/* and back again, for saying it */
function spell(n, cap) {
  var w = String(n);
  for (var k in NUMBER) if (NUMBER[k] === n) { w = k; break; }
  return cap ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}
function siltRows(lesson) {
  if (lesson.rows) return lesson.rows;
  var m = /(\d+)/.exec(lesson.id || "");
  return m ? +m[1] : (countIn(lesson.pass) || 10);
}
function needOf(lesson, kind) {
  if (kind === "silt") return siltRows(lesson);
  if (typeof lesson.pass === "number") return lesson.pass;
  if (typeof lesson.need === "number") return lesson.need;
  return countIn(lesson.pass) || NEED[kind] || 1;
}
/* A lesson's engine options, from Modes: the challenge's own block, and
   for a prepared well its board and its one-piece queue. A host without
   modes.js still gets the lesson's own block, read the same way. */
function lessonEngine(l, idx) {
  var M = Modes(), ch = M && M.get ? M.get("challenges") : null, n = (l && l.boards && l.boards.length) || 0;
  idx = n ? (idx | 0) % n : 0;
  if (ch && ch.engine && l && l.id && M.lesson && M.lesson(l.id)) return ch.engine({ id: l.id, board: idx });
  var e = { level: 1, linesPerLevel: 0, breath: false, spawnDelay: 100, clearDelay: 250, moveResets: 15 }, k;
  if (l && l.engine) for (k in l.engine) e[k] = l.engine[k];
  if (n) { var b = l.boards[idx]; e.board = b.board.slice(); e.queue = b.queue; e.queueThen = "end"; e.previews = 0; }
  return e;
}
function isModern(g) {
  return !!(g && (g.modern || (g.opts && g.opts.modern) || (g.options && g.options.modern)));
}
var MOVES = { left: -1, right: 1, dasLeft: -1, dasRight: 1 };

/* ================================================================ */
var Coach = {};

Coach.create = function (o) {
  o = o || {};
  var say = o.onSay || function () {};
  var target = o.onTarget || function () {};
  var passed = o.onPass || function () {};
  var rnd = o.random || Math.random;
  var nextDelay = o.nextDelay === undefined ? 900 : o.nextDelay;

  var lesson = null, kind = null, need = 1;
  var hinted = false, phase = "lesson";      /* "lesson" | "audit" | "done" */
  var done = 0;                              /* the lesson's own count */
  var board = 0;                             /* which prepared well (slot) */
  var piece = null;                          /* per-piece bookkeeping */
  var goal = null;                           /* what Watch is steering for */
  var tgt = null;                            /* Fewest Moves: the outline */
  var lastTarget = "";
  var audit = { pieces: 0, presses: 0, counted: 0, perfect: 0 };
  var quads = 0, lines = 0, siltDone = 0, pendingT = false, saidSoft = false, timer = null;

  function freshPiece(g) {
    var a = g && g.active;
    piece = {
      type: a ? a.type : null, presses: 0, last: null, soft: false, watched: false,
      perfectIfLands: false, snap: g ? copyBoard(g.board) : null, map: null, holes: 0
    };
    if (g) piece.holes = holes(settled(g.board));
    goal = null;
  }

  /* ---------- Fewest Moves: choose the next outline ----------
     Every place the piece can reach in a few presses is scored by the same
     evaluator the hints use, so the targets build a tidy stack and the
     lesson clears lines as it goes rather than heaping up. A few of the best
     are drawn at random, leaning towards ones that take two or three
     presses, because those are the ones worth learning. */
  function pickTarget(g) {
    var a = g.active;
    if (!a) return;
    var b = g.board, start = spawnState(b, a.type);
    var map = reach(b, a.type, start, isModern(g)), list = [], k;
    for (k in map) {
      if (k === "count") continue;
      var p = map[k], top = -1, cs = cellsAt(a.type, p.rot, p.x, p.y);
      for (var i = 0; i < cs.length; i++) if (cs[i][1] > top) top = cs[i][1];
      if (top >= VIS - 2) continue;
      p.score = evaluate(b, a.type, p, "keep");
      list.push(p);
    }
    if (!list.length) { tgt = null; target(null); return; }
    list.sort(function (x, y) { return y.score - x.score; });
    var pool = list.slice(0, Math.min(6, list.length)), total = 0, w = [];
    for (var j = 0; j < pool.length; j++) {
      var len = pool[j].len, wt = (len >= 2 && len <= 3 ? 3 : len === 1 || len === 4 ? 2 : 1) * (6 - j);
      if (letterOf(a.type) + pool[j].key === lastTarget) wt = 0.2;
      w.push(wt); total += wt;
    }
    var r = rnd() * total, pick = pool[0];
    for (j = 0; j < pool.length; j++) { r -= w[j]; if (r <= 0) { pick = pool[j]; break; } }
    lastTarget = letterOf(a.type) + pick.key;
    tgt = { type: a.type, rot: pick.rot, x: pick.x, y: pick.y, path: pick.path, len: pick.len,
            key: pick.key, cells: cellsAt(a.type, pick.rot, pick.x, pick.y) };
    target(tgt.cells);
  }

  function newPiece(g) {
    freshPiece(g);
    if (!g || !g.active) return;
    if (kind === "finesse") {
      if (phase === "lesson") pickTarget(g);
      else {
        piece.map = reach(piece.snap, g.active.type, spawnState(piece.snap, g.active.type), isModern(g));
        target(null);
      }
    } else if (kind !== "slot") target(null);
  }

  function progressText() {
    var t;
    if (kind === "finesse") {
      if (phase === "lesson") t = "Perfect in a row: " + done + " of " + need;
      else {
        var kpp = audit.pieces ? audit.presses / audit.pieces : 0;
        var pc = audit.counted ? Math.round(100 * audit.perfect / audit.counted) : 0;
        t = "Free stacking · " + kpp.toFixed(1) + " keys a piece · " + pc + "% in the fewest presses";
      }
    } else if (kind === "keep") t = "Pieces with no covered hole: " + done + " of " + need;
    else if (kind === "clean") t = "Quads: " + quads + " of " + need + " · lines " + Math.min(lines, 40) + " of 40";
    else if (kind === "slot") t = "Twist Doubles" + (inRow() ? " in a row: " : ": ") + done + " of " + need;
    else if (kind === "silt") t = "Silt cleared: " + Math.min(siltDone, need) + " of " + need;
    else t = "";
    if (phase === "done" && kind !== "finesse") t = "Passed · " + t;
    return hinted && t ? t + " · with a hint" : t;
  }

  function pass() {
    if (phase !== "lesson") return;
    if (kind === "finesse") {
      phase = "audit";
      tgt = null; target(null);
      say(spell(need, true) + " in a row — lesson passed. From here it's free play, and the coach just keeps count.", "pass");
    } else {
      phase = "done";
      target(null);
      say(lesson.name ? lesson.name + " — passed." : "Lesson passed.", "pass");
    }
    passed(lesson.id);
  }

  /* A Fewest Moves fault: say the shortest way and ask for a rewind. The
     answer "rewind" is the whole signal — the app skips the press and calls
     Well.rewind — and the engine's own {t:"rewind"} event carries the soft
     cue to the sound and the picture, so nothing here rewinds twice. */
  function fault(why) {
    done = 0;
    /* the count starts again now, not when the rewind event arrives at the
       end of the tick, so a second press in the same tick isn't held
       against the piece twice */
    piece.presses = 0; piece.last = null; piece.soft = false; piece.perfectIfLands = false;
    var path = tgt ? tgt.path : [];
    var lead = why === "place" ? "Not quite there — back to the top. " : "Back to the top. ";
    say(lead + "Shortest: " + icons(path), "fault");
    return "rewind";
  }

  function countPress(a, meta) {
    var dir = MOVES[a], last = piece.last;
    meta = meta || {};
    if (meta.repeat) { if (dir) piece.last = { dir: dir, src: meta.source }; return false; }
    if (dir) {
      var same = last && last.dir === dir;
      piece.last = { dir: dir, src: meta.source };
      /* the slide a held key turns into is the same press */
      if (same && (a === "dasLeft" || a === "dasRight")) return false;
      /* one drag, one direction, one press */
      if (same && meta.source === "touch" && last.src === "touch") return false;
      return true;
    }
    piece.last = { turn: a };
    return true;
  }

  /* ---------- the slot lesson's wells ---------- */
  function nextWell(advance) {
    if (advance) board++;
    if (!o.onNext) return;
    var opts = lessonEngine(lesson, board);
    if (timer) clearTimeout(timer);
    if (nextDelay > 0 && typeof setTimeout === "function") {
      timer = setTimeout(function () { timer = null; o.onNext(opts); }, nextDelay);
    } else o.onNext(opts);
  }
  function slotIntended() {
    var bs = (lesson && lesson.boards) || [];
    var b = bs.length ? bs[board % bs.length] : null;
    return b && b.intended ? b.intended : null;
  }
  /* Lessons of the slot kind without prepared wells (the later ones) are
     free play that counts Twist Doubles; "in a row" means any other clear
     starts the count again. */
  function prepared() { return !!(lesson && lesson.boards && lesson.boards.length); }
  function inRow() { return !!(lesson && typeof lesson.pass === "string" && /in a row/i.test(lesson.pass)); }
  function slotResolve(ok) {
    pendingT = false;
    if (phase !== "lesson") return;
    if (!prepared()) {
      if (!ok) return;
      done++;
      if (done >= need) { pass(); return; }
      say("Twist Double — " + done + " of " + need + (inRow() ? " in a row." : "."), "good");
      return;
    }
    if (ok) {
      done++;
      if (done >= need) { pass(); return; }
      say("Twist Double — " + done + " of " + need + "." + (o.onNext ? " Here's the next well." : " Again opens the next well."), "good");
      nextWell(true);
    } else {
      say("Not a Twist Double that time." + (o.onNext ? " The well resets — have another go." : " Again resets the well."), "fault");
      nextWell(false);
    }
  }

  var C = {};

  C.engineOpts = function (l) {
    if (typeof l === "string") l = findLesson(l);
    return lessonEngine(l, kindOf(l) === "slot" && lesson && l && lesson.id === l.id ? board : 0);
  };

  C.start = function (l, g) {
    if (typeof l === "string") l = findLesson(l);
    dims();
    /* starting the slot lesson again mid-way carries on from the next well */
    var again = lesson && l && lesson.id === l.id && kind === "slot" && phase === "lesson";
    lesson = l; kind = kindOf(l); need = l ? needOf(l, kind) : 1;
    if (!again) {
      done = 0; board = 0; phase = "lesson"; hinted = false;
      audit = { pieces: 0, presses: 0, counted: 0, perfect: 0 };
    }
    quads = 0; lines = 0; siltDone = 0; pendingT = false; saidSoft = false; tgt = null; lastTarget = "";
    if (timer) { clearTimeout(timer); timer = null; }
    target(null);
    if (!again) {
      if (kind === "finesse") say("Put each piece on its outline in as few presses as you can. A held slide counts once.", "info");
      else if (kind === "keep") say(spell(need, true) + " pieces without covering a hole. Keep, and the pieces waiting above, are there to help.", "info");
      else if (kind === "clean") say("Keep nine columns flat and the right-hand one open. " + spell(need, true) + " Quads before forty lines.", "info");
      else if (kind === "slot") say("Find three filled corners around one empty cell. Turn the T into it for a Twist Double.", "info");
      else if (kind === "silt") say("Dig through the silt. Each row has one gap; clear all " + spell(need) + ".", "info");
    }
    newPiece(g);
    return C.engineOpts(l);
  };

  C.action = function (a, meta, g) {
    if (!lesson || !g || !g.active || !piece) return "allow";
    if (piece.type !== g.active.type && !piece.presses) newPiece(g);
    if (kind !== "finesse") return "allow";
    if (a === "softOn") {
      piece.soft = true;
      if (phase === "lesson" && !saidSoft) { saidSoft = true; say("Soft drop is fine — that piece just won't count.", "tip"); }
      return "allow";
    }
    if (a === "hold" || a === "softOff" || a === "breath") return "allow";
    if (a === "hard") {
      if (phase !== "lesson" || !tgt || piece.watched) return "allow";
      var p = g.active, ly = dropY(g.board, p.type, p.rot, p.x, p.y);
      if (placeKey(p.type, p.rot, p.x, ly) !== tgt.key) return fault("place");
      piece.perfectIfLands = !piece.soft && piece.presses <= tgt.len;
      return "allow";
    }
    if (MOVES[a] !== undefined || a === "cw" || a === "ccw" || a === "180") {
      if (countPress(a, meta)) piece.presses++;
      if (phase === "lesson" && tgt && !piece.soft && !piece.watched && piece.presses > tgt.len) return fault("over");
    }
    return "allow";
  };

  C.event = function (ev, g) {
    if (!lesson || !ev) return;
    var t = ev.t;
    if (t === "spawn") {
      if (kind === "slot" && pendingT) slotResolve(false);
      newPiece(g);
      return;
    }
    if (t === "hold") { if (g && g.active) newPiece(g); else piece = null; return; }
    if (t === "rewind") {
      if (piece) { piece.presses = 0; piece.last = null; piece.soft = false; piece.perfectIfLands = false; }
      if (tgt) target(tgt.cells);
      return;
    }
    /* a prepared well's T that turned in but cleared nothing: the well
       halts with no clear to judge it by, so the halt does */
    if (t === "halt") { if (kind === "slot" && pendingT) slotResolve(false); return; }
    if (t === "lock") { onLock(ev, g); return; }
    if (t === "clear") { onClear(ev, g); return; }
    if (t === "over") {
      if (kind === "slot" && pendingT) slotResolve(false);
      if (phase === "lesson") {
        if (kind === "clean" && ev.why === "goal") say("Forty lines, " + quads + " of " + need + " Quads. Again keeps the lesson going.", "info");
        else if (kind !== "slot" && kind !== "finesse") say("The well rests. Again picks the lesson up from the start.", "info");
      }
      target(null);
    }
  };

  function onLock(ev, g) {
    if (!piece) return;
    if (kind === "finesse") {
      var key = ev.cells ? keyOfCells(ev.cells) : "";
      if (phase === "lesson") {
        if (piece.watched) { /* the coach placed it: not counted, nothing broken */ }
        else if (piece.perfectIfLands && tgt && key === tgt.key) {
          done++;
          if (done >= need) { pass(); return; }
          if (done % 5 === 0) say(done + " in a row.", "good");
        } else if (!piece.soft) {
          done = 0;
          if (tgt && key !== tgt.key) say("That one landed off its outline. Shortest was " + icons(tgt.path), "tip");
        }
      } else if (phase === "audit") {
        audit.pieces++;
        audit.presses += piece.presses;
        var e = piece.map && piece.map[key];
        if (e && !piece.soft && !piece.watched && (!ev.twist || ev.twist === "none")) {
          audit.counted++;
          if (piece.presses <= e.len) audit.perfect++;
        }
      }
      return;
    }
    if (kind === "keep" && phase === "lesson" && g) {
      var after = holes(settled(g.board));
      if (after > piece.holes) {
        if (done > 0) say("That covered a hole, so the count starts again. Keep can save a piece that has nowhere clean to go.", "tip");
        done = 0;
      } else {
        done++;
        if (done >= need) { pass(); return; }
        if (done % 10 === 0) say(done + " clean pieces.", "good");
      }
      return;
    }
    if (kind === "slot" && phase === "lesson") {
      var want = slotIntended(), wl = want ? letterOf(want.type) : "T";
      if (letterOf(ev.type) === wl) {
        if (ev.twist === "full") pendingT = true;
        else if (prepared()) slotResolve(false);
      }
    }
  }

  function onClear(ev, g) {
    var n = ev.n || (ev.rows ? ev.rows.length : 0);
    if (g && typeof g.lines === "number") lines = g.lines; else lines += n;
    if (kind === "clean" && phase === "lesson") {
      if (n === 4 && lines <= 40) {
        quads++;
        if (quads >= need) { pass(); return; }
        say("Quad — " + quads + " of " + need + ".", "good");
      }
      return;
    }
    if (kind === "slot" && pendingT) { slotResolve(ev.twist === "full" && n === 2); return; }
    if (kind === "slot" && !prepared() && inRow() && n && phase === "lesson" && done) {
      done = 0;
      say("Another clear came between them, so the count starts again.", "tip");
      return;
    }
    if (kind === "silt" && phase === "lesson") {
      if (g && g.stats && typeof g.stats.siltCleared === "number") siltDone = g.stats.siltCleared;
      else {
        var rows = {}, c = ev.cells || [];
        for (var i = 0; i < c.length; i++) if (c[i].v === 8) rows[c[i].y] = 1;
        for (var r in rows) if (rows.hasOwnProperty(r)) siltDone++;
      }
      if (siltDone >= need) { pass(); return; }
      if (n) say("Silt left: " + (need - siltDone) + ".", "info");
    }
  }

  /* ---------- hint, solution, watch ---------- */
  function describe(g, p, path, text) {
    var a = g.active;
    var d = { type: a.type, rot: p.rot, x: p.x, y: p.y, cells: cellsAt(a.type, p.rot, p.x, p.y),
              path: path, inputs: [], icons: icons(path), words: words(path), keep: false, text: text };
    for (var i = 0; i < path.length; i++) d.inputs.push(ACTION[path[i]]);
    d.inputs.push("hard");
    return d;
  }
  function bestFree(g) {
    var a = g.active, b = g.board, map = reach(b, a.type, { rot: a.rot, x: a.x, y: a.y }, isModern(g));
    var best = null;
    for (var k in map) {
      if (k === "count") continue;
      var s = evaluate(b, a.type, map[k], kind);
      if (!best || s > best.score) { best = map[k]; best.score = s; }
    }
    return best;
  }
  /* Would Keep do better? Only worth saying when it plainly would: in Keep
     and Look Ahead, when this piece has nowhere to go without covering a
     hole and the other one has; elsewhere, when the other piece's best spot
     is clearly better than this one's. */
  function coversHole(b, type, p) {
    var c = copyBoard(b), cs = cellsAt(type, p.rot, p.x, p.y);
    for (var i = 0; i < cs.length; i++) c[cs[i][1] * BW + cs[i][0]] = 9;
    return holes(settled(c)) > holes(settled(b));
  }
  function keepAdvice(g, best) {
    if (!g.active || !best || g.holdUsed || (g.opts && g.opts.keep === false)) return false;
    var alt = g.hold || (g.queue && g.queue[0]);
    if (!alt || letterOf(alt) === letterOf(g.active.type)) return false;
    var b = g.board, map = reach(b, alt, spawnState(b, alt), isModern(g)), top = null;
    for (var k in map) {
      if (k === "count") continue;
      var s = evaluate(b, alt, map[k], kind);
      if (!top || s > top.score) { top = map[k]; top.score = s; }
    }
    if (!top) return false;
    if (kind === "keep") return coversHole(b, g.active.type, best) && !coversHole(b, alt, top);
    return top.score > best.score + 25;
  }
  function plan(g, full) {
    var a = g.active;
    if (!a) return null;
    if (kind === "finesse" && phase === "lesson" && tgt) {
      var map = reach(g.board, a.type, { rot: a.rot, x: a.x, y: a.y }, isModern(g)), e = map[tgt.key];
      if (e) return describe(g, e, e.path, "Shortest from here: " + icons(e.path) + ".");
    }
    if (kind === "slot") {
      var want = slotIntended();
      if (want && letterOf(want.type) === letterOf(a.type)) {
        var path = route(g.board, a.type, { rot: a.rot, x: a.x, y: a.y }, want, want.twist || "full", isModern(g));
        var bd = lesson.boards[board % lesson.boards.length];
        var d = describe(g, want, path || [], (bd && bd.hint) || "Three filled corners around one empty cell: the T fits there. Slide in under the overhang, then turn it into place.");
        d.twist = want.twist || "full";
        if (!path) d.text = "The T fits in the outlined slot, turned in at the last moment.";
        /* a hint shows where and why; the presses are what Watch is for */
        if (!full) d.words = "";
        return d;
      }
    }
    var best = bestFree(g);
    if (!best) return null;
    if ((kind === "keep" || kind === "clean" || kind === "silt") && keepAdvice(g, best)) {
      var kd = describe(g, best, ["K"], "Keep this one — the next piece fits better.");
      kd.keep = true; kd.cells = null; kd.inputs = ["hold"];
      return kd;
    }
    var why = kind === "clean" ? "Flat and low, with the right-hand column left open."
            : kind === "keep" ? "Low, flat, and nothing covered."
            : kind === "silt" ? "Low, and into the gaps where it can."
            : "A tidy spot.";
    return describe(g, best, best.path, why);
  }

  function show(g, full) {
    if (!lesson || !g || !g.active) return null;
    hinted = true;
    var d = plan(g, full);
    if (d) { goal = d; if (d.cells) target(d.cells); }
    return d;
  }
  C.hint = function (g) { return show(g, false); };
  C.solution = function (g) {
    var d = show(g, true);
    if (d && piece) piece.watched = true;
    return d;
  };

  /* One step of Watch, re-planned from where the piece is now. Returns the
     engine action to apply next ("down" means one row of soft drop — use
     Coach.apply), or null when there is nothing to do. */
  C.next = function (g) {
    if (!lesson || !g || !g.active) return null;
    hinted = true;
    if (piece) piece.watched = true;
    var a = g.active, here = { rot: a.rot, x: a.x, y: a.y };
    if (!goal || letterOf(goal.type) !== letterOf(a.type)) { goal = plan(g, true); if (goal) goal.walk = null; }
    if (!goal) return null;
    if (goal.keep) { goal = null; return "hold"; }
    if (!goal.twist) {
      var ly = dropY(g.board, a.type, a.rot, a.x, a.y);
      if (placeKey(a.type, a.rot, a.x, ly) === placeKey(a.type, goal.rot, goal.x, goal.y)) return "hard";
    }
    /* follow the planned walk while the piece is where the walk expects it;
       re-plan the moment it isn't (gravity, a press, a kick) */
    var w = goal.walk, at = -1, i;
    if (w) for (i = 0; i < w.states.length; i++) {
      var s = w.states[i];
      if (s.rot === here.rot && s.x === here.x && s.y === here.y) { at = i; break; }
    }
    if (at < 0) {
      var path = null;
      if (goal.twist) path = route(g.board, a.type, here, goal, goal.twist, isModern(g));
      else {
        var e = reach(g.board, a.type, here, isModern(g))[placeKey(a.type, goal.rot, goal.x, goal.y)];
        path = e ? e.path : route(g.board, a.type, here, goal, null, isModern(g));
      }
      if (!path) return "hard";
      w = goal.walk = { path: path, states: [here] };
      var cur = here;
      for (i = 0; i < path.length; i++) { cur = applyTok(g.board, a.type, cur, path[i], isModern(g)) || cur; w.states.push(cur); }
      at = 0;
    }
    return at < w.path.length ? ACTION[w.path[at]] : "hard";
  };

  C.progress = function () {
    var d = kind === "finesse" && phase === "audit" ? audit.perfect : kind === "clean" ? quads : kind === "silt" ? Math.min(siltDone, need) : done;
    var n = kind === "finesse" && phase === "audit" ? audit.counted : need;
    return { done: d, need: n, text: progressText(), hint: hinted, passed: phase !== "lesson",
             kpp: audit.pieces ? audit.presses / audit.pieces : null };
  };
  C.hinted = function () { return hinted; };
  C.target = function () { return tgt ? tgt.cells : null; };

  C.stop = function () {
    if (timer) { clearTimeout(timer); timer = null; }
    lesson = null; kind = null; piece = null; tgt = null; goal = null;
    target(null);
  };

  return C;
};

/* Apply one Watch step to the engine. "down" is a single row of soft drop:
   soft drop on, the clock run just until the piece moves a row, soft drop
   off — so a watched piece descends the way a player's would. */
Coach.apply = function (g, a) {
  var W = Well();
  if (!W || !g || !a) return false;
  if (a !== "down") return W.act(g, a);
  var p = g.active;
  if (!p || !W.fits(g, p.type, p.rot, p.x, p.y - 1)) return false;
  var y = p.y, type = p.type;
  W.act(g, "softOn");
  for (var i = 0; i < 400 && g.active && g.active.type === type && g.active.y === y && !g.over; i++) W.step(g, 2);
  W.act(g, "softOff");
  return true;
};

/* the searches, for tests and for anything else that wants to ask */
Coach.reach = function (board, type, start, modern) { dims(); return reach(board, type, start || spawnState(board, type), modern); };
Coach.route = function (board, type, start, goal, twist, modern) { dims(); return route(board, type, start, goal, twist, modern); };
Coach.icons = icons;
Coach.words = words;

if (typeof module !== "undefined" && module.exports) module.exports = Coach;
else root.Coach = Coach;
})(typeof self !== "undefined" ? self : this);
