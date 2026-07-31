/* game.js — the physics, with no canvas anywhere in it.

   Everything is in **field units**: the playing area is 1 unit wide and
   `H` units tall, and the renderer scales. That is not tidiness for its own
   sake — it is what makes the game play identically on a phone and a
   desktop. Pixel-based physics gives you a ball that crosses a small screen
   in half the time it crosses a large one, and a game that is a different
   game on every device.

   ## The two things a brick game gets wrong

   **Tunnelling.** A fast ball moving more than its own diameter per frame
   can be on one side of a brick at frame n and the other side at n+1, having
   passed through it without ever overlapping. The usual fix — cap the speed —
   caps the fun. Here the step is *subdivided*: the ball moves in slices no
   longer than a third of its radius, however fast it is going, so the same
   cheap overlap test is always valid. Speed then costs arithmetic instead of
   correctness.

   **The paddle as a mirror.** If the ball simply reflects, the game is
   deterministic and dull, and worse, it can settle into a vertical loop you
   cannot break out of. So the paddle is treated as curved: where the ball
   lands across its width sets the *angle*, not the reflection, and the speed
   is preserved. That single rule is the whole skill of the game — you aim by
   moving the paddle under the ball, and a ball caught on the very edge goes
   almost sideways.

   Two guards keep it honest. A ball that ends up too horizontal is nudged
   back towards vertical, because a ball travelling along the top of the wall
   never comes down; and every paddle hit adds a touch of speed, so a rally
   cannot last forever.                                                     */
(function (root) {
"use strict";

var Levels = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./levels.js") : root.Levels;

var Game = {};

/* the field, in field units */
var H = 1.5;                 /* tall enough for a wall and room to play under it */
Game.H = H;
var WALL_TOP = 0.1;
var BRICK_H = 0.055;
var PADDLE_Y = H - 0.075;
var BALL_R = 0.013;
var BASE_SPEED = 0.62;       /* field units per second */
var MAX_TILT = 0.28;         /* how horizontal a ball is allowed to get */
var MIN_SIDE = 0.12;         /* and how vertical — see tidy() */

Game.consts = { H: H, WALL_TOP: WALL_TOP, BRICK_H: BRICK_H, PADDLE_Y: PADDLE_Y, BALL_R: BALL_R };

/* the drops, and what they do. `good` decides the colour and whether the
   paddle should chase it or dodge it. */
Game.DROPS = [
  { k: "wide",  good: true,  odds: 14, name: "Wide",      say: "The paddle grows." },
  { k: "multi", good: true,  odds: 12, name: "Split",     say: "Three balls." },
  { k: "slow",  good: true,  odds: 9,  name: "Slow",      say: "Everything calms down." },
  { k: "catch", good: true,  odds: 8,  name: "Catch",     say: "The paddle holds the ball until you let go." },
  { k: "laser", good: true,  odds: 8,  name: "Laser",     say: "Tap to fire." },
  { k: "life",  good: true,  odds: 4,  name: "Spare",     say: "One more ball in hand." },
  { k: "thin",  good: false, odds: 7,  name: "Narrow",    say: "The paddle shrinks." },
  { k: "fast",  good: false, odds: 7,  name: "Quick",     say: "Everything speeds up." }
];

Game.start = function (level, lives) {
  var L = Levels.build(level);
  var g = {
    L: L, level: level,
    left: Levels.count(L),
    paddle: { x: 0.5, w: 0.17, base: 0.17 },
    balls: [],
    drops: [], shots: [],
    lives: lives === undefined ? 3 : lives,
    score: 0, combo: 0, best: 0,
    speed: BASE_SPEED * L.speed,
    stuck: true,            /* the ball is sitting on the paddle waiting */
    catching: false, laser: 0, slow: 1,
    over: false, cleared: false, t: 0, seed: level * 7919 + 13
  };
  g.balls.push(newBall(g));
  return g;
};
function newBall(g) {
  return { x: g.paddle.x, y: PADDLE_Y - BALL_R - 0.002, vx: 0, vy: 0, held: true };
}
Game.newBall = newBall;

/* a deterministic stream, so a level plays the same way twice and a bug can
   be reproduced rather than described */
function rnd(g) {
  g.seed = (g.seed * 1103515245 + 12345) & 0x7fffffff;
  return g.seed / 0x7fffffff;
}
Game.rnd = rnd;

Game.launch = function (g) {
  for (var i = 0; i < g.balls.length; i++) {
    var b = g.balls[i];
    if (!b.held) continue;
    b.held = false;
    /* always upwards, and never straight up — a vertical serve is a coin
       toss about which side of the wall you end up on */
    var a = -Math.PI / 2 + (rnd(g) - 0.5) * 0.7;
    b.vx = Math.cos(a); b.vy = Math.sin(a);
  }
  g.stuck = false;
};

Game.fire = function (g) {
  if (g.laser <= 0) return false;
  g.shots.push({ x: g.paddle.x - g.paddle.w * 0.4, y: PADDLE_Y });
  g.shots.push({ x: g.paddle.x + g.paddle.w * 0.4, y: PADDLE_Y });
  g.laser--;
  return true;
};

/* ---------- the step ----------
   `dt` in seconds. Returns the events that happened, so the renderer and the
   sound can react without the physics knowing either exists. */
Game.step = function (g, dt) {
  var ev = { hits: [], broke: [], lost: 0, caught: 0, drop: null, cleared: false };
  if (g.over || g.cleared) return ev;
  g.t += dt;
  dt = Math.min(dt, 0.05);            /* a tab that was asleep must not teleport */
  var speed = g.speed * g.slow;
  var i;

  for (i = g.balls.length - 1; i >= 0; i--) {
    var b = g.balls[i];
    if (b.held) { b.x = g.paddle.x; b.y = PADDLE_Y - BALL_R - 0.002; continue; }
    /* subdivide: never move more than a third of a radius at a time, so the
       overlap test can stay simple and still never miss a brick */
    var travel = speed * dt;
    var slices = Math.max(1, Math.ceil(travel / (BALL_R * 0.66)));
    var st = travel / slices;
    for (var s = 0; s < slices; s++) {
      if (stepBall(g, b, st, ev)) break;
    }
    if (b.dead) { g.balls.splice(i, 1); ev.lost++; }
  }

  if (!g.balls.length) {
    g.lives--;
    g.combo = 0;
    if (g.lives < 0) { g.over = true; }
    else {
      g.paddle.w = g.paddle.base;
      g.slow = 1; g.laser = 0; g.catching = false;
      g.balls.push(newBall(g));
      g.stuck = true;
      g.drops.length = 0;
    }
  }

  /* the drops fall */
  for (i = g.drops.length - 1; i >= 0; i--) {
    var d = g.drops[i];
    d.y += 0.42 * dt;
    if (d.y > H) { g.drops.splice(i, 1); continue; }
    if (d.y > PADDLE_Y - 0.02 && d.y < PADDLE_Y + 0.03 &&
        Math.abs(d.x - g.paddle.x) < g.paddle.w / 2 + 0.02) {
      g.drops.splice(i, 1);
      take(g, d.k);
      ev.drop = d.k;
    }
  }
  /* and the shots rise */
  for (i = g.shots.length - 1; i >= 0; i--) {
    var sh = g.shots[i];
    sh.y -= 1.5 * dt;
    if (sh.y < WALL_TOP - 0.02) { g.shots.splice(i, 1); continue; }
    var cell = cellAt(g, sh.x, sh.y);
    if (cell && g.L.grid[cell.r][cell.c]) {
      g.shots.splice(i, 1);
      hitBrick(g, cell.r, cell.c, ev, true);
    }
  }

  if (g.left <= 0) { g.cleared = true; ev.cleared = true; }
  return ev;
};

function stepBall(g, b, st, ev) {
  b.x += b.vx * st;
  b.y += b.vy * st;

  if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); ev.hits.push("wall"); }
  else if (b.x > 1 - BALL_R) { b.x = 1 - BALL_R; b.vx = -Math.abs(b.vx); ev.hits.push("wall"); }
  if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); ev.hits.push("wall"); }

  /* the paddle */
  if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y - BALL_R < PADDLE_Y + 0.03) {
    var half = g.paddle.w / 2;
    var dx = b.x - g.paddle.x;
    if (Math.abs(dx) <= half + BALL_R) {
      b.y = PADDLE_Y - BALL_R;
      if (g.catching) { b.held = true; b.vx = 0; b.vy = 0; g.stuck = true; ev.caught++; return true; }
      /* the curved paddle: where you catch it sets the angle */
      var t = Math.max(-1, Math.min(1, dx / half));
      var a = -Math.PI / 2 + t * 1.05;
      b.vx = Math.cos(a); b.vy = Math.sin(a);
      tidy(b);
      g.speed = Math.min(BASE_SPEED * 2.1, g.speed * 1.012);
      g.combo = 0;
      ev.hits.push("paddle");
      return true;
    }
  }
  if (b.y - BALL_R > H) { b.dead = true; return true; }

  var cell = cellAt(g, b.x, b.y);
  if (cell && g.L.grid[cell.r][cell.c]) {
    /* which face was hit: compare how far into the brick we are on each axis
       and undo the shallower one. Cheap, and right often enough that nobody
       has ever noticed the case where it isn't. */
    var box = cellBox(g, cell.r, cell.c);
    var ox = Math.min(Math.abs(b.x - box.x), Math.abs(box.x + box.w - b.x));
    var oy = Math.min(Math.abs(b.y - box.y), Math.abs(box.y + box.h - b.y));
    if (ox < oy) b.vx = -b.vx; else b.vy = -b.vy;
    tidy(b);
    hitBrick(g, cell.r, cell.c, ev, false);
    return true;
  }
  return false;
}

/* Both ruts are closed here, and there are two of them.

   Nearly horizontal never comes down again — a ball skimming along under the
   wall bounces between the side walls forever.

   Nearly *vertical* is the subtler one and the one that actually happens: a
   ball caught dead centre on the paddle goes straight up, straight down, and
   straight up again, and once its column is empty it will do that until the
   heat death of the universe without touching a brick. So a perfectly
   vertical ball is not allowed to exist. The nudge is small — under seven
   degrees — which is enough to walk the ball across the wall over a few
   bounces and far too little to feel like the game is steering. */
function tidy(b) {
  var m = Math.hypot(b.vx, b.vy) || 1;
  b.vx /= m; b.vy /= m;
  if (Math.abs(b.vy) < MAX_TILT) {
    b.vy = (b.vy < 0 ? -1 : 1) * MAX_TILT;
    b.vx = (b.vx < 0 ? -1 : 1) * Math.sqrt(Math.max(0.001, 1 - MAX_TILT * MAX_TILT));
  }
  if (Math.abs(b.vx) < MIN_SIDE) {
    b.vx = (b.vx < 0 ? -1 : 1) * MIN_SIDE;
    b.vy = (b.vy < 0 ? -1 : 1) * Math.sqrt(Math.max(0.001, 1 - MIN_SIDE * MIN_SIDE));
  }
}

function cellAt(g, x, y) {
  var L = g.L;
  var bw = 1 / L.cols;
  var r = Math.floor((y - WALL_TOP) / BRICK_H);
  var c = Math.floor(x / bw);
  if (r < 0 || r >= L.rows || c < 0 || c >= L.cols) return null;
  return { r: r, c: c };
}
function cellBox(g, r, c) {
  var bw = 1 / g.L.cols;
  return { x: c * bw, y: WALL_TOP + r * BRICK_H, w: bw, h: BRICK_H };
}
Game.cellBox = cellBox;

function hitBrick(g, r, c, ev, fromShot) {
  var v = g.L.grid[r][c];
  if (v === 9) { ev.hits.push("solid"); return; }
  var box = cellBox(g, r, c);
  g.L.grid[r][c] = v - 1;
  if (g.L.grid[r][c] === 0) {
    g.left--;
    g.combo++;
    if (g.combo > g.best) g.best = g.combo;
    /* the combo is the whole scoring system: one brick is worth ten, but a
       ball that clears six without touching the paddle is worth far more
       than six times one. That is what makes a pocket behind the wall the
       thing everybody is actually playing for. */
    g.score += 10 * g.combo;
    ev.broke.push({ r: r, c: c, x: box.x + box.w / 2, y: box.y + box.h / 2, v: v });
    maybeDrop(g, box.x + box.w / 2, box.y + box.h / 2);
  } else {
    g.score += 5;
    ev.hits.push("brick");
  }
  if (fromShot) g.combo = Math.max(0, g.combo);
}

function maybeDrop(g, x, y) {
  if (rnd(g) > 0.19) return;
  var total = 0, i;
  for (i = 0; i < Game.DROPS.length; i++) total += Game.DROPS[i].odds;
  var pick = rnd(g) * total;
  for (i = 0; i < Game.DROPS.length; i++) {
    pick -= Game.DROPS[i].odds;
    if (pick <= 0) { g.drops.push({ k: Game.DROPS[i].k, x: x, y: y }); return; }
  }
}

function take(g, k) {
  if (k === "wide") g.paddle.w = Math.min(0.34, g.paddle.w * 1.45);
  else if (k === "thin") g.paddle.w = Math.max(0.085, g.paddle.w * 0.7);
  else if (k === "slow") g.slow = Math.max(0.62, g.slow * 0.8);
  else if (k === "fast") g.slow = Math.min(1.6, g.slow * 1.22);
  else if (k === "life") g.lives++;
  else if (k === "laser") g.laser += 12;
  else if (k === "catch") g.catching = true;
  else if (k === "multi") {
    var src = g.balls[0];
    if (!src) return;
    for (var i = 0; i < 2; i++) {
      var a = Math.atan2(src.vy, src.vx) + (i ? 0.5 : -0.5);
      var nb = { x: src.x, y: src.y, vx: Math.cos(a), vy: Math.sin(a), held: false };
      tidy(nb);
      g.balls.push(nb);
    }
    if (src.held) Game.launch(g);
  }
}
Game.take = take;

Game.aim = function (g, x) {
  g.paddle.x = Math.max(g.paddle.w / 2, Math.min(1 - g.paddle.w / 2, x));
};

if (typeof module !== "undefined" && module.exports) module.exports = Game;
else root.Game = Game;
})(typeof self !== "undefined" ? self : this);
