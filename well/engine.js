/* engine.js — the well itself: a deterministic state machine.

   A game state goes in, an action or a slice of time goes in, a game state
   comes out, and a list of events says what happened in between. There is
   no clock here, no canvas, no sound and no Math.random: time arrives as
   milliseconds from whoever is driving, and randomness comes from two
   seeded streams that are part of the state. That is what makes three
   things possible that matter more than they sound:

     · **the same seed and the same inputs give the same game**, to the
       event, which is what a well code promises a friend and what
       tools/rules-check.js proves on every run;
     · **a run can be saved mid-piece and resumed** on another day with
       nothing lost — the bag, the silt stream, the lock timer and the
       half-row of gravity already accumulated are all plain numbers in
       serialize();
     · **the rules can be tested in node** by the tens of thousands of
       pieces, with no browser anywhere.

   ## Time

   Everything is milliseconds, and gravity is a fractional row counter that
   time is poured into: dt / msPerRow per step, a row each time it passes
   one. A 120 Hz iPad and a 30 Hz phone in Low Power Mode therefore see the
   same game, and a step of 250 ms falls the right number of rows in one go
   rather than one row late. The app drives this at a fixed 240 Hz.

   ## The lock

   Extended Placement, the forgiving modern rule. A piece that lands waits
   lockDelay before it locks; each successful move or turn restarts the
   wait; after fifteen of them the piece locks the moment it rests on
   something; reaching a new lowest row gives all fifteen back. The timer
   only runs while the piece is resting. "Successful" means the position or
   the rotation actually changed — pressing into a wall is not a reset.

   ## The awkward edges, decided

   · A cleared row is removed the moment the piece locks; the clear event
     carries the cells that went, so the renderer can dissolve them while
     the next piece waits out the clear delay. The well under the picture
     is never in a half-cleared state.
   · After a clear the wait is the clear delay *plus* the spawn delay —
     the line goes, then the next piece is generated, as two beats.
   · A calm well that fills **drains from the bottom** (Rules.DRAIN_*)
     instead of ending, so the surface the player was building survives.
   · During a Breath, gravity and the lock both stop. Moves made while the
     lock is frozen do not spend any of the fifteen resets, because there
     is no wait to restart; when the Breath ends a resting piece starts a
     fresh wait rather than locking under the player's thumb.
   · A move pressed into a wall answers with one soft bump. An auto-repeat
     into the same wall answers with nothing — the input layer marks
     repeats (meta.repeat) — so holding a key against the wall is silent.
   · stats.keys counts every Well.act call except softOff and breath, and
     except calls marked as auto-repeats. The fewest-presses check counts
     L, R, slide-left, slide-right and the turns per piece, with a held
     slide counting once, exactly as the lesson does.

   ## The DAS machine

   Well.Das is the keyboard and gamepad auto-repeat as a pure machine, so
   tools/rules-check.js can prove its timing and input.js can run it on the
   simulation tick rather than trusting the operating system's key repeat.
   It is at the bottom of this file.                                      */
(function (root) {
"use strict";

function rulesKit() {
  if (root.Rules) return root.Rules;
  if (typeof module !== "undefined" && module.exports && typeof require === "function") return require("./rules.js");
  return null;
}
var Rules = rulesKit();

var W = Rules.W, H = Rules.H, VIS = Rules.VISIBLE, N = W * H;
var SPX = Rules.SPAWN.x, SPY = Rules.SPAWN.y;
var T_ID = 3, SILT = Rules.SILT;
var ACTS = { left: 1, right: 1, cw: 1, ccw: 1, "180": 1, hold: 1, hard: 1, softOn: 1, softOff: 1,
             dasLeft: 1, dasRight: 1, breath: 1 };
var PRESS = { left: 1, right: 1, dasLeft: 1, dasRight: 1, cw: 1, ccw: 1, "180": 1 };

/* every shape as a flat run of offsets: SH[((type * 4 + rot) * 8) + 2k] is
   cell k's dx, +1 its dy. The fit test is the innermost loop of the engine,
   the bot and every search, so it reads typed memory and allocates
   nothing. */
var SH = new Int8Array(8 * 4 * 8);
(function () {
  for (var t = 1; t <= 7; t++) for (var r = 0; r < 4; r++) {
    var c = Rules.CELLS[t][r];
    for (var k = 0; k < 4; k++) {
      SH[(t * 4 + r) * 8 + k * 2] = c[k][0];
      SH[(t * 4 + r) * 8 + k * 2 + 1] = c[k][1];
    }
  }
})();

function fitsB(board, type, rot, x, y) {
  var o = (type * 4 + rot) * 8;
  for (var k = 0; k < 8; k += 2) {
    var cx = x + SH[o + k], cy = y + SH[o + k + 1];
    if (cx < 0 || cx >= W || cy < 0 || cy >= H) return false;
    if (board[cy * W + cx]) return false;
  }
  return true;
}
function dropY(board, type, rot, x, y) {
  while (fitsB(board, type, rot, x, y - 1)) y--;
  return y;
}
function cellsOf(type, rot, x, y) {
  var o = (type * 4 + rot) * 8, out = [];
  for (var k = 0; k < 8; k += 2) out.push([x + SH[o + k], y + SH[o + k + 1]]);
  return out;
}

var Well = {};

/* ================================================================
   the two random streams
   ================================================================
   Pieces: Park–Miller MINSTD driving a Fisher–Yates shuffle of each fresh
   set of seven. 16807 × (2³¹ − 1) is under 2⁵³, so the product is exact in
   a double and the stream is the same on every engine. Silt holes come from
   a second, independent stream (mulberry32, seeded seed ^ 0x9E3779B9), so a
   silt challenge deals exactly the same pieces as any other run of its
   seed — the rows rising underneath cannot change what falls from above. */
function minstdSeed(seed) {
  var v = (seed >>> 0) % Rules.MINSTD_M;
  if (v <= 0) v += Rules.MINSTD_M - 1;
  return v;
}
function minstd(rng) {
  rng.v = (Rules.MINSTD_A * rng.v) % Rules.MINSTD_M;
  return (rng.v - 1) / (Rules.MINSTD_M - 1);
}
function drawBag(rng) {
  if (!rng.bag.length) {
    var b = Rules.BAG_ORDER.slice();
    for (var i = b.length - 1; i > 0; i--) {
      var r = Math.floor(minstd(rng) * (i + 1));
      var t = b[i]; b[i] = b[r]; b[r] = t;
    }
    rng.bag = b;
    rng.no++;
  }
  return rng.bag.shift();
}
function mulberry(st) {
  var a = st.s = (st.s + 0x6D2B79F5) | 0;
  var t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* the bag on its own, for the tests and the explainer: the same code the
   engine deals from */
Well.bag = function (seed) {
  var rng = { v: minstdSeed(seed), bag: [], no: 0 };
  return function next() { return drawBag(rng); };
};

/* ================================================================
   options
   ================================================================ */
var DEFAULTS = {
  seed: 1, level: 1, gravity: "curve", levelCap: Rules.LEVEL_MAX, linesPerLevel: 10,
  lockDelay: Rules.LOCK_MS, moveResets: Rules.MOVE_RESETS, spawnDelay: 0, clearDelay: 0,
  keep: true, previews: Rules.PREVIEWS, modern: false, irs: false, ihs: false,
  sdf: Rules.SDF, topOut: "end", breath: false, silt: 0, board: null, queue: null,
  queueThen: "bag", goalLines: 0, timeLimit: 0, scoring: true, timeScale: 1, score: 0
};
function resolve(opts) {
  var o = {}, k;
  for (k in DEFAULTS) o[k] = DEFAULTS[k];
  /* unknown keys are kept — a mode may stash its own (pace, depth) here
     and read them back through g.opts */
  if (opts) for (k in opts) if (opts[k] !== undefined) o[k] = opts[k];
  o.sdf = (o.sdf === "inf" || o.sdf === Infinity || o.sdf === null) ? Infinity : Math.max(1, +o.sdf || Rules.SDF);
  o.timeScale = +o.timeScale > 0 ? +o.timeScale : 1;
  o.previews = Math.max(0, Math.min(7, o.previews | 0));
  o.seed = o.seed >>> 0;
  o.level = Math.max(1, o.level | 0);
  return o;
}

function blankStats() {
  return { pieces: 0, keys: 0, singles: 0, doubles: 0, triples: 0, quads: 0,
           twists: 0, twMini: 0, twSingle: 0, twDouble: 0, twTriple: 0,
           empties: 0, maxRipple: 0, maxUnbroken: 0, holds: 0, drains: 0, siltCleared: 0,
           hardDrops: 0, softRows: 0, finessePerfect: 0, finesseTotal: 0 };
}
function blankPiece() {
  return { lowestY: SPY, landed: false, lastTurn: false, kick: -1, was180: false,
           softRows: 0, presses: 0 };
}

/* ================================================================
   create
   ================================================================ */
Well.create = function (opts) {
  var o = resolve(opts);
  var g = {
    opts: o,
    board: new Uint8Array(N), pid: new Uint16Array(N),
    active: null, hold: 0, holdUsed: false, queue: [],
    level: o.level, lines: 0, score: +o.score || 0, ripple: -1, unbroken: -1, time: 0,
    over: false, overWhy: null,
    fall: 0, lock: 0, lockResets: 0, delay: 0, halted: false, grace: 0,
    breath: { charge: 0, active: false, ms: 0 },
    stats: blankStats(),
    events: [],
    /* the engine's own bookkeeping — readable, but nobody else's business */
    p: blankPiece(),
    qbag: [], curBag: -1,
    rng: { v: minstdSeed(o.seed), bag: [], no: 0 },
    siltRng: { s: (o.seed ^ 0x9E3779B9) | 0 },
    fixed: [], pidNext: 0, top: -1, soft: false,
    pend: { rot: 0, hold: false },
    levelStart: o.level, queueEnded: false,
    ev2: []
  };
  if (o.board) presetBoard(g, o.board);
  if (o.queue) {
    var q = typeof o.queue === "string" ? o.queue.split("") : o.queue;
    for (var i = 0; i < q.length; i++) {
      var id = Rules.typeId(q[i]);
      if (id >= 1 && id <= 7) g.fixed.push(id);
    }
  }
  if (o.silt > 0) pushSilt(g, o.silt | 0, undefined, false);
  refill(g);
  spawn(g);
  return g;
};

/* a preset well: strings, top row first, the last string is row 0. Each
   group of touching same-letter cells becomes one body (one pid), so a
   lesson board renders as pieces rather than as loose squares. */
function presetBoard(g, rows) {
  var n = rows.length, y, x;
  for (var r = 0; r < n && r < H; r++) {
    y = n - 1 - r;
    var s = rows[r];
    for (x = 0; x < W; x++) {
      var ch = s.charAt(x);
      if (ch && ch !== "." && ch !== " ") {
        var v = Rules.typeId(ch);
        if (v < 1 || v > 8) v = SILT;
        g.board[y * W + x] = v;
      }
    }
  }
  /* fuse same-letter neighbours into bodies */
  var stack = [];
  for (var c = 0; c < N; c++) {
    var t = g.board[c];
    if (!t || t === SILT || g.pid[c]) continue;
    var id = nextPid(g);
    g.pid[c] = id; stack.push(c);
    while (stack.length) {
      var cur = stack.pop(), cx = cur % W, cy = (cur - cx) / W;
      var nb = [cx > 0 ? cur - 1 : -1, cx < W - 1 ? cur + 1 : -1, cy > 0 ? cur - W : -1, cy < H - 1 ? cur + W : -1];
      for (var k = 0; k < 4; k++) {
        var m = nb[k];
        if (m >= 0 && !g.pid[m] && g.board[m] === t) { g.pid[m] = id; stack.push(m); }
      }
    }
  }
  findTop(g);
}

function nextPid(g) {
  g.pidNext = (g.pidNext % 65535) + 1;
  return g.pidNext;
}
function findTop(g) {
  for (var y = H - 1; y >= 0; y--) {
    var b = y * W;
    for (var x = 0; x < W; x++) if (g.board[b + x]) { g.top = y; return; }
  }
  g.top = -1;
}

/* ================================================================
   events
   ================================================================ */
function emit(g, ev) { g.events.push(ev); }
/* gravity and soft drop can tick every step; consecutive ones fold into
   one event so a fast fall is one message rather than forty */
function emitRows(g, t, rows) {
  var e = g.events, last = e.length ? e[e.length - 1] : null;
  if (last && last.t === t) last.rows += rows;
  else e.push({ t: t, rows: rows });
}
/* Returns what happened since the last drain and starts a fresh list.
   Two lists alternate, so draining allocates nothing; the array returned
   is valid until the next call. */
Well.drain = function (g) {
  var out = g.events;
  g.events = g.ev2;
  g.events.length = 0;
  g.ev2 = out;
  return out;
};

/* ================================================================
   the queue
   ================================================================ */
function refill(g) {
  var need = Math.max(Rules.QUEUE_MIN, g.opts.previews + 1);
  while (g.queue.length < need) {
    if (g.fixed.length) { g.queue.push(g.fixed.shift()); g.qbag.push(-1); continue; }
    if (g.opts.queue && g.opts.queueThen === "end") break;
    g.queue.push(drawBag(g.rng));
    g.qbag.push(g.rng.no);
  }
}
function takeNext(g) {
  refill(g);
  if (!g.queue.length) return 0;
  var t = g.queue.shift();
  g.curBag = g.qbag.shift();
  refill(g);
  return t;
}

/* ================================================================
   gravity
   ================================================================ */
function gravMs(g) {
  if (g.breath.active) return 0;
  var o = g.opts, gr = o.gravity;
  if (typeof gr === "number") return gr > 0 ? gr : 0;
  var cap = o.levelCap;
  if (gr && typeof gr === "object") {
    if (typeof gr.ms === "number") return gr.ms > 0 ? gr.ms : 0;
    if (gr.cap) cap = Math.min(cap, gr.cap);
  }
  return Rules.gravityMs(Math.max(1, Math.min(g.level, cap)));
}
/* soft drop: SDF × gravity, never slower than SDF rows a second even when
   gravity is still */
function softMs(g) {
  var gm = gravMs(g);
  var rps = gm > 0 ? 1000 / gm : 0;
  return 1000 / (g.opts.sdf * Math.max(rps, 1));
}
Well.gravityMs = function (g) { return gravMs(g); };

function levelFor(g) {
  var o = g.opts, lpl = o.linesPerLevel, L = g.levelStart;
  if (lpl === "three") L = Math.max(L, Math.floor(Math.sqrt(g.lines + 1)));
  else if (lpl > 0) L = g.levelStart + Math.floor(g.lines / lpl);
  return Math.max(g.levelStart, Math.min(L, o.levelCap));
}

/* ================================================================
   the piece
   ================================================================ */
function fitsA(g, dx, dy, rot) {
  var a = g.active;
  return fitsB(g.board, a.type, rot === undefined ? a.rot : rot, a.x + dx, a.y + dy);
}
function grounded(g) { return !fitsA(g, 0, -1); }

function landCheck(g) {
  if (g.active && !g.p.landed && grounded(g)) {
    g.p.landed = true;
    emit(g, { t: "land" });
  }
}
function descended(g) {
  var a = g.active, p = g.p;
  p.lastTurn = false;
  if (a.y < p.lowestY) { p.lowestY = a.y; g.lockResets = 0; }
  g.lock = 0;
}
/* a successful move or turn: restart the wait, or — with the fifteen
   spent — lock the moment it rests */
function moved(g) {
  if (g.breath.active) return false;
  if (g.lockResets < g.opts.moveResets) { g.lockResets++; g.lock = 0; return false; }
  if (grounded(g)) { lockPiece(g); return true; }
  return false;
}

function spawn(g) {
  if (g.over || g.halted) return;
  var type = takeNext(g);
  if (!type) {
    g.halted = true; g.queueEnded = true;
    emit(g, { t: "halt" });
    return;
  }
  startPiece(g, type, true);
}

/* A piece is generated at (4, 22) facing north, drops one row at once if
   nothing is in the way, and from then on is the player's. With IHS or IRS
   on, a Keep or a turn pressed during the wait is applied as it appears —
   before the block-out test, which is the point: it can save a high well. */
function startPiece(g, type, fresh) {
  var o = g.opts, p;
  if (fresh && g.pend.hold && o.keep && o.ihs && !g.holdUsed) {
    var prev = g.hold, out = prev || takeNext(g);
    if (out) {
      g.hold = type; g.holdUsed = true; g.stats.holds++;
      emit(g, { t: "hold", type: type, from: prev });
      type = out;
    }
  }
  g.pend.hold = false;
  g.active = { type: type, rot: 0, x: SPX, y: SPY };
  g.p = p = blankPiece();
  g.fall = 0; g.lock = 0; g.lockResets = 0;
  var turned = null;
  if (fresh && g.pend.rot && o.irs) {
    turned = turnRaw(g, g.pend.rot);
    if (turned) p.presses++;
  }
  g.pend.rot = 0;
  if (!fitsA(g, 0, 0)) {
    if (o.topOut === "drain") drainWell(g);
    if (!fitsA(g, 0, 0)) { g.active = null; end(g, "block"); return; }
  }
  if (fitsA(g, 0, -1)) g.active.y--;
  p.lowestY = g.active.y;
  emit(g, { t: "spawn", type: type });
  if (turned) emit(g, turned);
  landCheck(g);
  if (g.soft && o.sdf === Infinity) sonic(g);
}

/* a turn, with its five tests; returns the rotate event or null */
function turnRaw(g, dir) {
  var a = g.active, o = g.opts;
  var from = a.rot, to = (from + dir + 4) % 4;
  var table = Rules.kicks(a.type, from, to, o.modern);
  if (!table) return null;
  for (var i = 0; i < table.length; i++) {
    var kx = table[i][0], ky = table[i][1];
    if (fitsB(g.board, a.type, to, a.x + kx, a.y + ky)) {
      a.x += kx; a.y += ky; a.rot = to;
      var p = g.p;
      p.lastTurn = true; p.kick = i; p.was180 = dir === 2;
      if (a.y < p.lowestY) { p.lowestY = a.y; g.lockResets = 0; }
      return { t: "rotate", dir: dir === 2 ? "180" : dir > 0 ? "cw" : "ccw", kick: i, from: from, to: to };
    }
  }
  return null;
}

function shiftBy(g, dx, all, quiet) {
  var a = g.active, n = 0;
  while (fitsA(g, dx * (n + 1), 0)) { n++; if (!all) break; }
  if (!n) {
    if (!quiet) emit(g, { t: "bump", what: "move" });
    return false;
  }
  a.x += dx * n;
  g.p.lastTurn = false;
  emit(g, { t: "move", dx: dx * n, x: a.x });
  if (moved(g)) return true;
  if (g.soft && g.opts.sdf === Infinity) sonic(g);
  landCheck(g);
  return true;
}

function turn(g, dir, quiet) {
  if (dir === 2 && !g.opts.modern) return false;
  var ev = turnRaw(g, dir);
  if (!ev) {
    if (!quiet) emit(g, { t: "bump", what: "rotate" });
    return false;
  }
  emit(g, ev);
  if (moved(g)) return true;
  if (g.soft && g.opts.sdf === Infinity) sonic(g);
  landCheck(g);
  return true;
}

/* sonic soft drop: to the floor without locking */
function sonic(g) {
  var a = g.active;
  if (!a) return;
  var ly = dropY(g.board, a.type, a.rot, a.x, a.y), rows = a.y - ly;
  if (rows <= 0) return;
  a.y = ly;
  softRows(g, rows);
}
function softRows(g, rows) {
  descended(g);
  g.p.softRows += rows;
  g.stats.softRows += rows;
  g.score += rows * Rules.SOFT_POINTS;
  emitRows(g, "soft", rows);
  landCheck(g);
}

function keep(g) {
  var o = g.opts;
  if (!o.keep || g.holdUsed || !g.active) return false;
  var cur = g.active.type, prev = g.hold, out = prev;
  if (!out) out = takeNext(g);
  if (!out) return false;
  g.hold = cur; g.holdUsed = true; g.stats.holds++;
  emit(g, { t: "hold", type: cur, from: prev });
  startPiece(g, out, false);
  return true;
}

function hardDrop(g) {
  var a = g.active;
  var ly = dropY(g.board, a.type, a.rot, a.x, a.y), rows = a.y - ly;
  if (rows > 0) {
    a.y = ly;
    g.p.lastTurn = false;
    g.score += rows * Rules.HARD_POINTS;
  }
  g.stats.hardDrops++;
  emit(g, { t: "hard", rows: rows, cells: cellsOf(a.type, a.rot, a.x, a.y), type: a.type });
  if (rows > 0) emit(g, { t: "score", points: rows * Rules.HARD_POINTS, why: "hard" });
  lockPiece(g);
}

/* ================================================================
   the lock, the clear and the score
   ================================================================ */
var scoreParts = {};
function lockPiece(g) {
  var a = g.active, o = g.opts, p = g.p, st = g.stats;
  var board = g.board, pidA = g.pid;
  var type = a.type, k, i, y, x;

  /* the corners are read before the piece is written, though they are
     never cells of the T itself */
  var twist = type === T_ID ? Rules.twist(board, a.x, a.y, a.rot, p.lastTurn, p.kick, p.was180) : "none";

  /* fewest presses: only for a piece placed without soft drop, and only if
     its resting place can be reached at all without tucks or spins */
  var optimal = -1;
  if (!p.softRows) optimal = reachPresses(board, type, a.rot, a.x, a.y, o.modern);
  if (optimal >= 0) {
    st.finesseTotal++;
    if (p.presses <= optimal) st.finessePerfect++;
  }

  var cells = cellsOf(type, a.rot, a.x, a.y);
  var id = nextPid(g), lockOut = true;
  for (k = 0; k < 4; k++) {
    x = cells[k][0]; y = cells[k][1];
    board[y * W + x] = type;
    pidA[y * W + x] = id;
    if (y < VIS) lockOut = false;
  }
  g.active = null;
  g.holdUsed = false;
  st.pieces++;
  emit(g, { t: "lock", type: type, cells: cells, twist: twist, pid: id,
            presses: p.presses, optimal: optimal });

  if (lockOut) {
    if (o.topOut !== "drain") { findTop(g); end(g, "lock"); return; }
    findTop(g);
    drainWell(g);
    afterLock(g, 0);
    return;
  }

  /* full rows, from the rows this piece touched */
  var full = [];
  for (k = 0; k < 4; k++) {
    y = cells[k][1];
    if (full.indexOf(y) >= 0) continue;
    var b = y * W, n = 0;
    for (x = 0; x < W; x++) if (board[b + x]) n++;
    if (n === W) full.push(y);
  }
  full.sort(function (u, v) { return u - v; });
  var lines = full.length, gone = null, silt = 0;
  if (lines) {
    gone = [];
    for (i = 0; i < lines; i++) {
      var row = full[i] * W, hadSilt = false;
      for (x = 0; x < W; x++) {
        gone.push({ x: x, y: full[i], v: board[row + x], pid: pidA[row + x] });
        if (board[row + x] === SILT) hadSilt = true;
      }
      if (hadSilt) silt++;
    }
    /* naive gravity: every row above a cleared one drops by the number
       cleared below it — no cascades */
    var dst = 0;
    for (y = 0; y < H; y++) {
      if (full.indexOf(y) >= 0) continue;
      if (dst !== y) {
        for (x = 0; x < W; x++) { board[dst * W + x] = board[y * W + x]; pidA[dst * W + x] = pidA[y * W + x]; }
      }
      dst++;
    }
    for (y = dst; y < H; y++) for (x = 0; x < W; x++) { board[y * W + x] = 0; pidA[y * W + x] = 0; }
  }
  findTop(g);
  var empty = lines > 0 && g.top < 0;

  var sst = { score: g.score, level: g.level, lines: g.lines, ripple: g.ripple, unbroken: g.unbroken };
  var gained = Rules.score(sst, twist, lines, empty, 0, 0, scoreParts);
  var levelBefore = g.level;
  g.score = sst.score; g.lines = sst.lines; g.ripple = sst.ripple; g.unbroken = sst.unbroken;
  twist = scoreParts.twist;

  if (twist !== "none") {
    st.twists++;
    if (twist === "mini") st.twMini++;
    else if (lines === 1) st.twSingle++;
    else if (lines === 2) st.twDouble++;
    else if (lines === 3) st.twTriple++;
  }
  if (lines) {
    if (lines === 1) st.singles++; else if (lines === 2) st.doubles++;
    else if (lines === 3) st.triples++; else st.quads++;
    if (empty) st.empties++;
    if (g.ripple > st.maxRipple) st.maxRipple = g.ripple;
    if (g.unbroken > st.maxUnbroken) st.maxUnbroken = g.unbroken;
    st.siltCleared += silt;
    var ub = scoreParts.difficult && g.unbroken > 0;
    emit(g, { t: "clear", rows: full, n: lines, cells: gone, twist: twist,
              label: Rules.label(twist, lines),
              unbroken: ub, unbrokenCount: ub ? g.unbroken : 0, ripple: Math.max(0, g.ripple),
              empty: empty, points: gained, base: scoreParts.base, level: levelBefore,
              ubBonus: scoreParts.ubBonus, rippleBonus: scoreParts.rippleBonus,
              emptyBonus: scoreParts.emptyBonus });
    if (o.breath) g.breath.charge = Math.min(Rules.BREATH_MAX, g.breath.charge + lines);
    var L = levelFor(g);
    if (L !== g.level) { g.level = L; emit(g, { t: "level", level: L }); }
  } else if (twist !== "none") {
    emit(g, { t: "twist", kind: twist, points: gained, label: Rules.label(twist, 0) });
  }

  if (o.goalLines > 0 && g.lines >= o.goalLines) { end(g, "goal"); return; }
  if (o.silt > 0 && st.siltCleared >= o.silt) { end(g, "goal"); return; }
  afterLock(g, lines);
}

function afterLock(g, lines) {
  var o = g.opts;
  g.fall = 0; g.lock = 0; g.lockResets = 0;
  g.delay = (lines ? o.clearDelay : 0) + o.spawnDelay;
  if (g.delay <= 0) { g.delay = 0; spawn(g); }
}

function end(g, why) {
  g.over = true;
  g.overWhy = why;
  if (why !== "time") g.active = null;
  g.delay = 0;
  emit(g, { t: "over", why: why });
}

/* ================================================================
   the drain and the silt
   ================================================================ */
function drainWell(g) {
  if (g.top < 0) return;
  var n = Math.max(Rules.DRAIN_MIN, g.top - Rules.DRAIN_TO);
  n = Math.min(n, H);
  var board = g.board, pidA = g.pid, x, y;
  for (y = 0; y < H; y++) {
    var src = y + n;
    for (x = 0; x < W; x++) {
      board[y * W + x] = src < H ? board[src * W + x] : 0;
      pidA[y * W + x] = src < H ? pidA[src * W + x] : 0;
    }
  }
  findTop(g);
  g.stats.drains++;
  emit(g, { t: "drain", rows: n });
}

/* the hole of the bottom row, if the bottom row is a silt row */
function bottomHole(g) {
  var hole = -1, silt = 0;
  for (var x = 0; x < W; x++) {
    var v = g.board[x];
    if (v === SILT) silt++;
    else if (!v) hole = x;
  }
  return silt === W - 1 ? hole : -1;
}

function pushSilt(g, rows, holeCol, announce) {
  rows = Math.max(0, Math.min(H, rows | 0));
  if (!rows) return true;
  if (g.top >= 0 && g.top + rows > H - 1) {
    if (g.opts.topOut === "drain") drainWell(g);
    if (g.top >= 0 && g.top + rows > H - 1) { end(g, "silt"); return false; }
  }
  var board = g.board, pidA = g.pid, x, y;
  var prev = bottomHole(g);
  for (y = H - 1; y >= rows; y--) {
    for (x = 0; x < W; x++) { board[y * W + x] = board[(y - rows) * W + x]; pidA[y * W + x] = pidA[(y - rows) * W + x]; }
  }
  /* new rows top-down, each hole different from the row just above it */
  for (y = rows - 1; y >= 0; y--) {
    var hole;
    if (holeCol !== undefined && holeCol !== null) hole = ((holeCol | 0) % W + W) % W;
    else {
      hole = Math.floor(mulberry(g.siltRng) * W);
      for (var tries = 0; hole === prev && tries < Rules.SILT_REROLLS; tries++) hole = Math.floor(mulberry(g.siltRng) * W);
      if (hole === prev) hole = (prev + 1 + Math.floor(mulberry(g.siltRng) * (W - 1))) % W;
    }
    for (x = 0; x < W; x++) { board[y * W + x] = x === hole ? 0 : SILT; pidA[y * W + x] = 0; }
    prev = hole;
  }
  /* the piece in the air rides up with the well rather than being buried */
  var a = g.active;
  if (a) {
    var lift = 0;
    while (!fitsA(g, 0, lift) && lift < rows) lift++;
    a.y += lift;
    g.p.lowestY += lift;
  }
  findTop(g);
  if (announce) emit(g, { t: "silt", rows: rows });
  if (a && !fitsA(g, 0, 0)) { g.active = null; end(g, "silt"); return false; }
  return true;
}
Well.addSilt = function (g, rows, holeCol) {
  if (g.over) return false;
  return pushSilt(g, rows, holeCol, true);
};

/* ================================================================
   act
   ================================================================ */
/* The third argument is optional: {repeat:true} (or plain true) marks an
   auto-repeat from the DAS machine, which is not a key press and never
   bumps. */
Well.act = function (g, a, meta) {
  if (g.over || !ACTS[a]) return false;
  var rep = meta === true || !!(meta && meta.repeat);
  if (a !== "softOff" && a !== "breath" && !rep) g.stats.keys++;
  var o = g.opts;

  if (a === "softOn") {
    if (g.soft) return false;
    g.soft = true;
    if (!g.active) return true;
    if (o.sdf === Infinity) { sonic(g); return true; }
    /* the first row comes with the press, then the soft-drop rate takes
       over — a press that waits a frame for anything feels like lag */
    if (fitsA(g, 0, -1)) { g.active.y--; g.fall = 0; softRows(g, 1); }
    return true;
  }
  if (a === "softOff") {
    if (!g.soft) return false;
    g.soft = false;
    g.fall = 0;
    return true;
  }
  if (a === "breath") return breathe(g);

  var act = g.active;
  if (!act) {
    /* nothing in the well yet: a turn or a Keep may be remembered for the
       next piece (IRS/IHS); nothing else means anything */
    if (g.halted) return false;
    if (o.irs && (a === "cw" || a === "ccw" || (a === "180" && o.modern))) {
      g.pend.rot = a === "cw" ? 1 : a === "ccw" ? -1 : 2;
      return true;
    }
    if (o.ihs && a === "hold" && o.keep && !g.holdUsed) { g.pend.hold = true; return true; }
    return false;
  }
  if (PRESS[a] && !rep) g.p.presses++;

  switch (a) {
    case "left": return shiftBy(g, -1, false, rep);
    case "right": return shiftBy(g, 1, false, rep);
    case "dasLeft": return shiftBy(g, -1, true, rep);
    case "dasRight": return shiftBy(g, 1, true, rep);
    case "cw": return turn(g, 1, rep);
    case "ccw": return turn(g, -1, rep);
    case "180": return turn(g, 2, rep);
    case "hold": return keep(g);
    case "hard": hardDrop(g); return true;
  }
  return false;
};

function breathe(g) {
  var b = g.breath;
  if (!g.opts.breath || b.active || b.charge < Rules.BREATH_COST) return false;
  b.charge -= Rules.BREATH_COST;
  b.active = true;
  b.ms = Rules.BREATH_MS;
  emit(g, { t: "breath", on: true, ms: Rules.BREATH_MS });
  return true;
}
function endBreath(g) {
  var b = g.breath;
  b.active = false; b.ms = 0;
  emit(g, { t: "breath", on: false, ms: 0 });
  /* a resting piece gets a fresh wait, never a lock under the thumb */
  g.lock = 0;
  if (g.active && grounded(g) && g.lockResets >= g.opts.moveResets) g.lockResets = g.opts.moveResets - 1;
}

/* ================================================================
   step
   ================================================================ */
Well.step = function (g, dt) {
  if (g.over || !(dt > 0)) return;
  var o = g.opts;
  dt *= o.timeScale;
  g.time += dt;
  if (o.timeLimit > 0 && g.time >= o.timeLimit) { g.time = o.timeLimit; end(g, "time"); return; }
  /* A Breath, and the grace after a pause, freeze gravity and the lock for
     part or all of this step. What is left for them is "live": a breath
     that ends 3 ms into a 4 ms step leaves 1 ms of gravity, not 4. */
  var frozen = 0;
  if (g.breath.active) {
    if (g.breath.ms > dt) { g.breath.ms -= dt; frozen = dt; }
    else { frozen = g.breath.ms; endBreath(g); }
  }
  if (g.grace > 0) {
    var gp = Math.min(g.grace, dt);
    g.grace -= gp;
    if (gp > frozen) frozen = gp;
  }
  var live = dt - frozen;
  if (g.halted) return;
  if (!g.active) {
    if (g.delay > 0) { g.delay -= dt; if (g.delay > 0) return; g.delay = 0; }
    spawn(g);
    return;
  }

  if (g.soft && o.sdf === Infinity) sonic(g);
  /* soft drop is the player's own hand, so it runs through a Breath */
  var soft = g.soft && o.sdf !== Infinity;
  var span = soft ? dt : live;
  var rate = soft ? softMs(g) : gravMs(g);
  var a = g.active;
  /* the lock only counts time spent resting: a piece that lands part-way
     through a step brings just the remainder of the step to its wait */
  var restMs = live;
  if (rate > 0 && span > 0) {
    if (!fitsA(g, 0, -1)) g.fall = 0;
    else {
      g.fall += span / rate;
      var rows = 0;
      while (g.fall >= 1 && fitsA(g, 0, -1)) { a.y--; rows++; g.fall -= 1; }
      if (rows) {
        if (soft) softRows(g, rows);
        else { descended(g); emitRows(g, "fall", rows); landCheck(g); }
      }
      if (!fitsA(g, 0, -1)) { restMs = Math.min(live, g.fall * rate); g.fall = 0; }
    }
  }
  if (!g.active || g.breath.active || live <= 0) return;
  if (grounded(g)) {
    if (g.lockResets >= o.moveResets) { lockPiece(g); return; }
    g.lock += restMs;
    if (g.lock >= o.lockDelay) lockPiece(g);
  }
};

/* ================================================================
   the controls a mode or a lesson reaches for
   ================================================================ */
/* Drift's tide and Steady's pace: a number of ms per row (0 = still), or
   "curve". Drift also scores by its tide, so a level may come with it. */
Well.setGravity = function (g, msOrCurve, level) {
  g.opts.gravity = msOrCurve;
  if (level !== undefined && level !== null) {
    g.level = g.levelStart = Math.max(1, level | 0);
  }
};
/* the end of a chapter or of Steady's timer: the piece in the air settles
   straight down and locks, and nothing new is generated until resume() */
Well.stopGravity = function (g, on) {
  if (on === false) { Well.resume(g); return; }
  if (g.over || g.halted) return;
  g.halted = true;
  var a = g.active;
  if (a) {
    var ly = dropY(g.board, a.type, a.rot, a.x, a.y), rows = a.y - ly;
    if (rows > 0) { a.y = ly; descended(g); emitRows(g, "fall", rows); }
    lockPiece(g);
  }
  if (!g.over) emit(g, { t: "halt" });
};
Well.resume = function (g) {
  if (!g.halted || g.over || g.queueEnded) return;
  g.halted = false;
  if (!g.active && g.delay <= 0) spawn(g);
};
/* after a pause: input is live at once, gravity and the lock wait a while */
Well.grace = function (g, ms) { g.grace = Math.max(0, +ms || 0); };

/* Fewest Moves: the piece goes back to where it was born, facing north,
   with a fresh lock and a fresh count */
Well.rewind = function (g) {
  var a = g.active;
  if (!a || g.over) return false;
  if (!fitsB(g.board, a.type, 0, SPX, SPY)) return false;
  a.rot = 0; a.x = SPX; a.y = SPY;
  if (fitsA(g, 0, -1)) a.y--;
  g.p = blankPiece();
  g.p.lowestY = a.y;
  g.fall = 0; g.lock = 0; g.lockResets = 0;
  emit(g, { t: "rewind" });
  landCheck(g);
  return true;
};

/* ================================================================
   questions
   ================================================================ */
Well.cells = function (type, rot, x, y) {
  return cellsOf(Rules.typeId(type), ((rot % 4) + 4) % 4, x, y);
};
Well.fits = function (g, type, rot, x, y) {
  return fitsB(g.board, Rules.typeId(type), ((rot % 4) + 4) % 4, x, y);
};
Well.landingY = function (g) {
  var a = g.active;
  return a ? dropY(g.board, a.type, a.rot, a.x, a.y) : null;
};

/* ================================================================
   the view
   ================================================================
   Everything a renderer needs, filled into an object the caller keeps.
   Pass the same object back each frame and nothing is allocated after the
   first call: the board and pid arrays are the engine's own (read them,
   never write them), and every nested object and array is reused. */
function makeView() {
  var v = {
    board: null, pid: null, W: W, H: H, visible: VIS,
    active: null, ghost: null, hold: 0, holdUsed: false, keep: true,
    queue: [], fall: 0, lock: 0, lockResets: 0, danger: 0,
    delay: false, halted: false, breath: null, bag: [],
    target: null, over: false, paused: false, demo: false,
    _a: { type: 0, rot: 0, x: 0, y: 0, cells: [[0, 0], [0, 0], [0, 0], [0, 0]] },
    _g: [[0, 0], [0, 0], [0, 0], [0, 0]],
    _b: { charge: 0, active: false, phase: 0 },
    _ready: true
  };
  return v;
}
function fillCells(out, type, rot, x, y) {
  var o = (type * 4 + rot) * 8;
  for (var k = 0; k < 4; k++) { out[k][0] = x + SH[o + k * 2]; out[k][1] = y + SH[o + k * 2 + 1]; }
}
Well.view = function (g, into) {
  var v = into && into._ready ? into : makeView();
  if (into && !into._ready) {
    /* a plain object handed in: adopt it */
    var fresh = v;
    for (var key in fresh) into[key] = fresh[key];
    v = into;
  }
  var o = g.opts, a = g.active, i;
  v.board = g.board; v.pid = g.pid;
  if (a) {
    var va = v._a;
    va.type = a.type; va.rot = a.rot; va.x = a.x; va.y = a.y;
    fillCells(va.cells, a.type, a.rot, a.x, a.y);
    v.active = va;
    fillCells(v._g, a.type, a.rot, a.x, dropY(g.board, a.type, a.rot, a.x, a.y));
    v.ghost = v._g;
  } else { v.active = null; v.ghost = null; }
  v.hold = g.hold; v.holdUsed = g.holdUsed; v.keep = !!o.keep;
  var q = v.queue;
  q.length = g.queue.length;
  for (i = 0; i < g.queue.length; i++) q[i] = g.queue[i];
  var gr = a ? !fitsA(g, 0, -1) : false;
  v.fall = a && !gr ? Math.min(1, g.fall) : 0;
  v.lock = a && gr ? (g.lockResets >= o.moveResets ? 1 : o.lockDelay > 0 ? Math.min(1, g.lock / o.lockDelay) : 1) : 0;
  v.lockResets = g.lockResets;
  var d = (g.top - Rules.DANGER_FROM) / Rules.DANGER_SPAN;
  v.danger = d < 0 ? 0 : d > 1 ? 1 : d;
  v.delay = g.delay > 0; v.halted = g.halted;
  if (o.breath) {
    var b = v._b;
    b.charge = g.breath.charge; b.active = g.breath.active;
    b.phase = g.breath.active ? 1 - g.breath.ms / Rules.BREATH_MS : 0;
    v.breath = b;
  } else v.breath = null;
  /* the set of seven the active piece came from: what is still to come */
  var bag = v.bag, n = 0;
  if (g.curBag > 0) {
    for (i = 0; i < g.queue.length; i++) if (g.qbag[i] === g.curBag) n++;
    bag.length = n; n = 0;
    for (i = 0; i < g.queue.length; i++) if (g.qbag[i] === g.curBag) bag[n++] = g.queue[i];
  } else bag.length = 0;
  v.over = g.over;
  return v;
};

/* ================================================================
   copies: clone, serialize, restore
   ================================================================ */
function copyPlain(x) {
  if (x === null || typeof x !== "object") return x;
  if (Array.isArray(x)) {
    var a = [];
    for (var i = 0; i < x.length; i++) a.push(copyPlain(x[i]));
    return a;
  }
  var o = {};
  for (var k in x) o[k] = copyPlain(x[k]);
  return o;
}
var STATE_KEYS = ["hold", "holdUsed", "level", "lines", "score", "ripple", "unbroken", "time",
                  "over", "overWhy", "fall", "lock", "lockResets", "delay", "halted", "grace",
                  "curBag", "pidNext", "top", "soft", "levelStart", "queueEnded"];
var DEEP_KEYS = ["active", "queue", "qbag", "breath", "stats", "p", "rng", "siltRng", "fixed", "pend"];

Well.clone = function (g) {
  var c = { opts: copyPlain(g.opts), board: new Uint8Array(g.board), pid: new Uint16Array(g.pid),
            events: [], ev2: [] };
  var i;
  for (i = 0; i < STATE_KEYS.length; i++) c[STATE_KEYS[i]] = g[STATE_KEYS[i]];
  for (i = 0; i < DEEP_KEYS.length; i++) c[DEEP_KEYS[i]] = copyPlain(g[DEEP_KEYS[i]]);
  return c;
};

/* A plain JSON-able object holding everything, the random streams and the
   timers included. Pending events are not part of the state: drain first. */
Well.serialize = function (g) {
  var o = copyPlain(g.opts);
  if (o.sdf === Infinity) o.sdf = "inf";
  var s = { v: 1, opts: o }, i, str = "";
  for (i = 0; i < N; i++) str += g.board[i];
  s.board = str;
  var pid = [];
  for (i = 0; i < N; i++) pid.push(g.pid[i]);
  s.pid = pid;
  for (i = 0; i < STATE_KEYS.length; i++) s[STATE_KEYS[i]] = g[STATE_KEYS[i]];
  for (i = 0; i < DEEP_KEYS.length; i++) s[DEEP_KEYS[i]] = copyPlain(g[DEEP_KEYS[i]]);
  return s;
};
Well.restore = function (s) {
  var o = copyPlain(s.opts);
  o = resolve(o);
  var g = { opts: o, board: new Uint8Array(N), pid: new Uint16Array(N), events: [], ev2: [] };
  var i;
  for (i = 0; i < N; i++) {
    g.board[i] = +s.board.charAt(i) || 0;
    g.pid[i] = s.pid[i] | 0;
  }
  for (i = 0; i < STATE_KEYS.length; i++) g[STATE_KEYS[i]] = s[STATE_KEYS[i]];
  for (i = 0; i < DEEP_KEYS.length; i++) g[DEEP_KEYS[i]] = copyPlain(s[DEEP_KEYS[i]]);
  if (!g.pend) g.pend = { rot: 0, hold: false };
  if (!g.p) g.p = blankPiece();
  if (g.grace === undefined) g.grace = 0;
  findTop(g);
  return g;
};

/* ================================================================
   searches
   ================================================================
   Two breadth-first searches over (x, y, rotation), sharing the engine's
   own fit test and kick tables so they can never disagree with it.

   reach() is the fewest-presses search: no gravity, the inputs a player
   has (tap left/right, slide to either wall, the turns), from the real
   spawn. Every state it finds is a place a hard drop can be made from, and
   the resting places those drops make are exactly the placements a player
   can reach without soft drop, tucks or spins. It answers the lock-time
   finesse check, derives the fewest-presses table in the tests, and gives
   the bot every placement it may choose with the path to get there.

   routes() adds "down one row", which is what soft drop is at no gravity,
   so it can reach under overhangs and into Twist slots, and reports *how*
   a target was arrived at — by a move, or by a turn with which kick — since
   that is what decides a Twist. The lesson checks use it. */
var XO = 3, XS = 16, YS = H + 4, NS = XS * YS * 4;
var R_D = new Int16Array(NS), R_P = new Int32Array(NS), R_I = new Int8Array(NS), R_Q = new Int32Array(NS);
var R_SEEN = [];             /* the states touched, so a reset is cheap */
var INPUTS = ["CW", "CCW", "180", "L", "R", "DL", "DR"];

function sIdx(x, y, r) { return ((y * XS) + (x + XO)) * 4 + r; }
function sX(s) { return ((s >> 2) % XS) - XO; }
function sY(s) { return Math.floor((s >> 2) / XS); }
function sR(s) { return s & 3; }

function spawnState(board, type) {
  if (!fitsB(board, type, 0, SPX, SPY)) return -1;
  return sIdx(SPX, fitsB(board, type, 0, SPX, SPY - 1) ? SPY - 1 : SPY, 0);
}
/* one input from a state; -1 if it does nothing */
function applyInput(board, type, s, inp, modern, out) {
  var x = sX(s), y = sY(s), r = sR(s), n, to, table, i;
  out.kick = -1;
  switch (inp) {
    case 3: case 4:                                   /* L R */
      n = inp === 3 ? -1 : 1;
      return fitsB(board, type, r, x + n, y) ? sIdx(x + n, y, r) : -1;
    case 5: case 6:                                   /* slide */
      n = inp === 5 ? -1 : 1;
      var m = 0;
      while (fitsB(board, type, r, x + n * (m + 1), y)) m++;
      return m ? sIdx(x + n * m, y, r) : -1;
    case 7:                                           /* down one row */
      return fitsB(board, type, r, x, y - 1) ? sIdx(x, y - 1, r) : -1;
    default:                                          /* turns */
      var d = inp === 0 ? 1 : inp === 1 ? -1 : 2;
      if (d === 2 && !modern) return -1;
      to = (r + d + 4) % 4;
      table = Rules.kicks(type, r, to, modern);
      if (!table) return -1;
      for (i = 0; i < table.length; i++) {
        var nx = x + table[i][0], ny = y + table[i][1];
        if (ny < 0 || ny >= YS || nx < -XO || nx >= XS - XO) continue;
        if (fitsB(board, type, to, nx, ny)) { out.kick = i; return sIdx(nx, ny, to); }
      }
      return -1;
  }
}
var kickOut = { kick: -1 };

function bfs(board, type, modern, withDown, from) {
  var i, s;
  for (i = 0; i < R_SEEN.length; i++) R_D[R_SEEN[i]] = 0;
  R_SEEN.length = 0;
  var start;
  if (from) start = fitsB(board, type, from.rot & 3, from.x, from.y) ? sIdx(from.x, from.y, from.rot & 3) : -1;
  else start = spawnState(board, type);
  if (start < 0) return -1;
  var head = 0, tail = 0;
  R_D[start] = 1; R_P[start] = -1; R_I[start] = -1;
  R_SEEN.push(start); R_Q[tail++] = start;
  var nIn = withDown ? 8 : 7;
  while (head < tail) {
    s = R_Q[head++];
    for (var inp = 0; inp < nIn; inp++) {
      var t = applyInput(board, type, s, inp, modern, kickOut);
      if (t < 0 || R_D[t]) continue;
      R_D[t] = R_D[s] + 1; R_P[t] = s; R_I[t] = inp;
      R_SEEN.push(t); R_Q[tail++] = t;
    }
  }
  return start;
}
function pathTo(s) {
  var out = [];
  while (R_P[s] >= 0) { out.push(R_I[s] === 7 ? "D" : INPUTS[R_I[s]]); s = R_P[s]; }
  out.reverse();
  return out;
}
/* the four cells of a resting place as one number, for comparing places */
function restKey(type, r, x, y) {
  var o = (type * 4 + r) * 8, a = [0, 0, 0, 0];
  for (var k = 0; k < 4; k++) a[k] = (y + SH[o + k * 2 + 1]) * W + x + SH[o + k * 2];
  a.sort(function (p, q) { return p - q; });
  return ((a[0] * 400 + a[1]) * 400 + a[2]) * 400 + a[3];
}

/* fewest presses to rest exactly here, or -1 if no hard drop can */
function reachPresses(board, type, rot, x, y, modern) {
  if (bfs(board, type, modern, false) < 0) return -1;
  var want = restKey(type, rot, x, y), best = -1;
  for (var i = 0; i < R_SEEN.length; i++) {
    var s = R_SEEN[i], sx = sX(s), sr = sR(s);
    var ry = dropY(board, type, sr, sx, sY(s));
    if (restKey(type, sr, sx, ry) === want) {
      var d = R_D[s] - 1;
      if (best < 0 || d < best) best = d;
    }
  }
  return best;
}

/* Every resting place a hard drop can reach, each with its fewest presses
   and one path of that length (inputs L R DL DR CW CCW 180, rotation-first
   where lengths tie). board is a flat 400-cell array. The search starts
   from the spawn, or from a given {rot, x, y} — a piece already moving. */
Well.reach = function (board, type, modern, from) {
  type = Rules.typeId(type);
  var out = [];
  if (bfs(board, type, !!modern, false, from) < 0) return out;
  var keys = [];
  for (var i = 0; i < R_SEEN.length; i++) {
    var s = R_SEEN[i], sx = sX(s), sr = sR(s);
    var ry = dropY(board, type, sr, sx, sY(s));
    var key = restKey(type, sr, sx, ry), d = R_D[s] - 1;
    var j = keys.indexOf(key);
    if (j >= 0 && out[j].presses <= d) continue;
    var place = { type: type, rot: sr, x: sx, y: ry, presses: d, path: pathTo(s), key: key,
                  cells: cellsOf(type, sr, sx, ry) };
    if (j >= 0) out[j] = place; else { keys.push(key); out.push(place); }
  }
  return out;
};

/* Every way to arrive at (x, y, rot) from spawn with soft drop allowed:
   one shortest path per kind of arrival — by a move or fall (turn:false),
   or by a turn with a given kick. Inputs include "D" (down one row). */
Well.routes = function (board, type, x, y, rot, modern) {
  type = Rules.typeId(type);
  var out = [];
  if (bfs(board, type, !!modern, true) < 0) return out;
  var target = sIdx(x, y, ((rot % 4) + 4) % 4), seen = {};
  if (!R_D[target]) return out;
  var cand = [];
  for (var i = 0; i < R_SEEN.length; i++) {
    var s = R_SEEN[i];
    for (var inp = 0; inp < 8; inp++) {
      if (applyInput(board, type, s, inp, !!modern, kickOut) !== target) continue;
      var isTurn = inp <= 2;
      var tag = isTurn ? (inp === 2 ? "h" : "t") + kickOut.kick : "m";
      var len = R_D[s];
      if (seen[tag] !== undefined && cand[seen[tag]].len <= len) continue;
      var c = { len: len, from: s, inp: inp, turn: isTurn, kick: isTurn ? kickOut.kick : -1, was180: inp === 2 };
      if (seen[tag] !== undefined) cand[seen[tag]] = c; else { seen[tag] = cand.length; cand.push(c); }
    }
  }
  for (var k = 0; k < cand.length; k++) {
    var p = pathTo(cand[k].from);
    p.push(cand[k].inp === 7 ? "D" : INPUTS[cand[k].inp]);
    out.push({ path: p, turn: cand[k].turn, kick: cand[k].kick, was180: cand[k].was180 });
  }
  return out;
};

/* ================================================================
   Well.Das — the auto-repeat machine
   ================================================================
   With a direction held: one step at once, then — after DAS — a step every ARR.
   The newest direction wins and starts its own full delay; release it
   while the older one is still held and the older one moves again, with
   the delay applied once more (the calmer rule for new players). A turn or
   Keep against a wall can cut the charge back by DCD. The charge survives
   spawns and delays, so a held key carries into the next piece.

   It is time-driven, not frame-driven: tick(t) emits every repeat due by
   t, each stamped with the moment it fell due, so 30, 60, 120 and 240 Hz
   all produce the same steps at the same times. Handling values are whole
   milliseconds that stand for frames — 167 is ten frames of 16.667 — so a
   deadline counts as met within half a millisecond; without that, the
   ten-frame delay everybody tunes by would land on the eleventh frame.

   With ARR 0 there are no repeats: once the charge completes the machine
   emits a single slide to the wall ("dasLeft"/"dasRight"), and renew()
   asks for that slide again — the input layer calls it when a new piece
   appears, so a held slide carries into the next piece as it does at any
   other ARR.

   emit(action, tMs, repeat) — repeat is false for the press itself and
   true for everything the machine generates. Nothing here allocates. */
var Das = {};
var SLACK = 0.5;
Das.SLACK = SLACK;
Das.create = function (opts) {
  var d = { das: Rules.DAS_MS, arr: Rules.ARR_MS, dcd: Rules.DCD_MS,
            left: false, right: false, dir: 0, start: 0, next: 0, slid: false };
  d.set = function (o) {
    if (!o) return;
    if (typeof o.das === "number") d.das = Math.max(0, o.das);
    if (typeof o.arr === "number") d.arr = Math.max(0, o.arr);
    if (typeof o.dcd === "number") d.dcd = Math.max(0, o.dcd);
  };
  d.press = function (dir, t, emit) { dasPress(d, dir < 0 ? -1 : 1, t, emit); };
  d.release = function (dir, t, emit) { dasRelease(d, dir < 0 ? -1 : 1, t, emit); };
  d.cut = function (t) { dasCut(d, t); };
  d.tick = function (t, emit) { dasTick(d, t, emit); };
  d.renew = function (t, emit) { dasRenew(d, t, emit); };
  d.charge = function (t) {
    if (!d.dir) return 0;
    if (d.das <= 0) return 1;
    var c = (t - d.start) / d.das;
    return c < 0 ? 0 : c > 1 ? 1 : c;
  };
  d.held = function (dir) { return dir < 0 ? d.left : d.right; };
  d.reset = function () { d.left = d.right = false; d.dir = 0; d.slid = false; };
  d.set(opts);
  return d;
};
function dasArm(d, dir, t) {
  d.dir = dir; d.start = t; d.next = t + d.das; d.slid = false;
}
function dasPress(d, dir, t, emit) {
  dasTick(d, t, emit);                   /* repeats due before this press come first */
  if (dir < 0 ? d.left : d.right) { if (d.dir === dir) return; }
  if (dir < 0) d.left = true; else d.right = true;
  dasArm(d, dir, t);
  if (emit) emit(dir < 0 ? "left" : "right", t, false);
}
function dasRelease(d, dir, t, emit) {
  dasTick(d, t, emit);
  if (dir < 0) d.left = false; else d.right = false;
  if (d.dir !== dir) return;
  var other = -dir;
  if (other < 0 ? d.left : d.right) dasArm(d, other, t);
  else d.dir = 0;
}
function dasCut(d, t) {
  if (!d.dir || d.dcd <= 0) return;
  var held = Math.min(t - d.start, Math.max(0, d.das - d.dcd));
  d.start = t - held;
  d.next = d.start + d.das;
  d.slid = false;
}
function dasTick(d, t, emit) {
  if (!d.dir || !emit) return;
  var due = d.start + d.das;
  if (t < due - SLACK) return;
  var name = d.arr <= 0 ? (d.dir < 0 ? "dasLeft" : "dasRight") : (d.dir < 0 ? "left" : "right");
  if (d.arr <= 0) {
    if (!d.slid) { d.slid = true; emit(name, due, true); }
    return;
  }
  var n = 0;
  while (t >= d.next - SLACK && n < 12) { emit(name, d.next, true); d.next += d.arr; n++; }
  /* back from a long gap: the wall was reached long ago, so do not replay
     the whole interval */
  if (t >= d.next - SLACK) d.next = t + d.arr;
}
function dasRenew(d, t, emit) {
  if (!d.dir || d.arr > 0 || !emit) return;
  if (t < d.start + d.das - SLACK) return;
  d.slid = true;
  emit(d.dir < 0 ? "dasLeft" : "dasRight", t, true);
}
Well.Das = Das;

/* internals the tests and the bot lean on */
Well._fitsB = fitsB;
Well._dropY = dropY;
Well._SH = SH;

if (typeof module !== "undefined" && module.exports) module.exports = Well;
else root.Well = Well;
})(typeof self !== "undefined" ? self : this);
