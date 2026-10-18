/* fx-check.js — dev-only. Do the big moments happen, and then stop?

   An effect has three ways to go wrong that nobody reports. It can
   miss: a spark on the wrong square is worse than no spark, because it
   says something happened somewhere it did not. It can never end: a
   loop that keeps asking for frames after the last ember has gone out
   is a phone getting warm in somebody's pocket with nothing on screen.
   And it can ignore the one person who asked it not to move.

   So this opens the real boards and the real effects layer in a browser
   (tools/fx-preview.html) and checks, square by square and pixel by
   pixel:

     - squareToScreen and screenToSquare agree on the centre of all 64
       squares, on both boards, from both sides, mid-push-in, after the
       push-in and after the camera has been orbited by hand;
     - every effect draws something on its layer, without a page error;
     - when the last effect ends the loop stops asking for frames, the
       layers are clear and hidden, and the board is idle too;
     - under prefers-reduced-motion nothing is drawn at all, a count
       simply arrives, and the board's own moments are instant;
     - topple, focus and impact leave the board drawable (empty GL error
       queue) and idle, and untopple / focus(null) put back exactly the
       picture that was there before;
     - a new game's arrival hands back a landing for every man, in order;
     - a storm of confetti, fireworks, captures and a mate together never
       has more than four hundred particles alive.

   It needs `playwright-core`; the browser is already on the machine. If
   either is missing it says so and exits 0, so it stays a bonus rather
   than a barrier.

   Run: node chess/tools/fx-check.js [--verbose] [--shots DIR]          */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
const VERBOSE = process.argv.indexOf("--verbose") >= 0;
const SHOTS = (() => { const i = process.argv.indexOf("--shots"); return i >= 0 ? process.argv[i + 1] : null; })();
let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
if (!CHROME) { console.log("no chromium on this machine — skipping the effects check."); process.exit(0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the effects check.");
  console.log("  npm i --no-save playwright-core");
  process.exit(0);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
  ".css": "text/css", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("not found"); return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

/* ---------- things measured inside the page ---------- */

/* how much of a layer has anything on it: every fourth pixel, alpha
   over a whisper */
const INK = `((cls) => {
  const cv = document.querySelector("canvas." + cls);
  if (!cv || !cv.width) return 0;
  const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] > 8) n++;
  return n;
})`;

/* every square there and back: centre out to the screen, and the
   screen back to a square */
const ROUND_TRIP = `(() => {
  const R = window.__fx.R, bad = [];
  let small = 0;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = r * 16 + f, p = R.squareToScreen(sq);
    if (!p) { bad.push(sq.toString(16) + ":null"); continue; }
    if (!(p.s > 2)) small++;
    const back = R.screenToSquare(p.x, p.y);
    if (back !== sq) bad.push(sq.toString(16) + "→" + (back < 0 ? back : back.toString(16)));
  }
  return { bad: bad, small: small };
})()`;

/* a signature of the board's own canvas, drawn and read in one task —
   the drawing buffer belongs to the compositor the moment it ends */
const BOARD_SIG = `(() => {
  const R = window.__fx.R;
  R.dirty = true;
  R.frame();
  let lumas = null, err = 0;
  if (R.kind === "3d") {
    const cv = document.getElementById("cv3");
    const gl = cv.getContext("webgl") || cv.getContext("experimental-webgl");
    err = gl.getError();
    const W = cv.width, H = cv.height, px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    lumas = px;
  } else {
    const cv = document.getElementById("cv2");
    lumas = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  }
  let hash = 0, lo = 255, hi = 0;
  for (let i = 0; i < lumas.length; i += 4 * 7) {
    const l = (lumas[i] * 77 + lumas[i + 1] * 151 + lumas[i + 2] * 28) >> 8;
    hash = (hash * 31 + l) | 0; if (l < lo) lo = l; if (l > hi) hi = l;
  }
  return { hash: hash, err: err, spread: hi - lo };
})()`;

/* Fire an effect, let the layer draw a few of its own frames, and
   measure the ink. Counted in frames rather than milliseconds: the
   layer never ages anything by more than 50ms a frame, so however busy
   the machine is, six frames in is at most 300ms into the effect. */
const FIRE_AND_INK = `(async ([name, cls, INKSRC]) => {
  const ink = eval(INKSRC), F = window.__fx.Fx;
  F.clear();
  const spawned = window.__fx.fire[name]();
  const f0 = F.stats().frames, t0 = Date.now();
  while (F.stats().frames < f0 + 6 && Date.now() - t0 < 8000) await new Promise((r) => requestAnimationFrame(r));
  return { spawned, ink: ink(cls) };
})`;

/* run the board's frames until it says it has nothing left to draw */
async function settle(page, capMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (capMs || 20000)) {
    const more = await page.evaluate(() => {
      const R = window.__fx.R;
      let m = false;
      for (let i = 0; i < 3; i++) m = R.frame();
      return m;
    });
    if (!more) return true;
    await page.waitForTimeout(25);
  }
  return false;
}
/* wait for the effects layer to go quiet */
async function quiet(page, capMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (capMs || 12000)) {
    if (!(await page.evaluate(() => window.__fx.Fx.busy()))) return true;
    await page.waitForTimeout(60);
  }
  return false;
}

async function open(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 820, height: 640 } }, opts || {}));
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("" + e.message));
  /* a favicon nobody serves, and Chrome declining a buzz without a tap,
     are the browser talking to itself, not the room */
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|404|vibrate|Intervention/i.test(m.text())) errs.push(m.text());
  });
  await page.goto(base + "/chess/tools/fx-preview.html", { waitUntil: "load" });
  await page.waitForFunction(() => window.__fx && window.__fx.R);
  return { ctx, page, errs };
}
let base = "";

(async () => {
  await new Promise((r) => server.listen(0, r));
  base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

  try {
    /* ================= the ordinary room ================= */
    const { ctx, page, errs } = await open(browser);
    const has3d = await page.evaluate(() => !!window.__fx.R3);
    ok("the carved board is up in the preview", has3d, "no WebGL — only the drawn board will be checked");

    /* ---------- where the squares are ---------- */
    for (const dim of has3d ? ["3d", "2d"] : ["2d"]) {
      for (const side of [1, -1]) {
        await page.evaluate(([d, s]) => { window.__fx.use(d); window.__fx.flip(s); }, [dim, side]);
        await settle(page);
        const rt = await page.evaluate(ROUND_TRIP);
        ok("every square comes back to itself — " + dim + ", " + (side === 1 ? "white" : "black") + " at the bottom",
           rt.bad.length === 0 && rt.small === 0, rt.bad.slice(0, 6).join(" ") + (rt.small ? " tiny:" + rt.small : ""));
      }
      await page.evaluate(() => window.__fx.flip(1));
      await settle(page);
      /* mid-push-in: a frame or two into the spring, then all the way,
         then back out, then a camera somebody has moved by hand */
      await page.evaluate(() => { window.__fx.setScene(window.__fx.MATED); window.__fx.R.focus(0x76); });
      await page.evaluate(() => { const R = window.__fx.R; R.frame(); R.frame(); });
      const mid = await page.evaluate(ROUND_TRIP);
      ok("…and mid-push-in (" + dim + ")", mid.bad.length === 0, mid.bad.slice(0, 6).join(" "));
      const settledIn = await settle(page);
      const inRt = await page.evaluate(ROUND_TRIP);
      ok("…and pushed in on the king (" + dim + ")", settledIn && inRt.bad.length === 0, inRt.bad.slice(0, 6).join(" "));
      const kingIn = await page.evaluate(() => window.__fx.R.squareToScreen(0x76));
      await page.evaluate(() => window.__fx.R.focus(null));
      await settle(page);
      const kingOut = await page.evaluate(() => window.__fx.R.squareToScreen(0x76));
      ok("the push-in really is closer (" + dim + ")", kingIn.s > kingOut.s * 1.02,
         "square " + kingOut.s.toFixed(1) + "px → " + kingIn.s.toFixed(1) + "px");
      if (dim === "3d") {
        await page.evaluate(() => window.__fx.R.orbit(70, -25));
        await settle(page);
        const orb = await page.evaluate(ROUND_TRIP);
        const kingOrb = await page.evaluate(() => window.__fx.R.squareToScreen(0x76));
        ok("orbit still works after the push-in, and the squares follow it",
           orb.bad.length === 0 && Math.hypot(kingOrb.x - kingOut.x, kingOrb.y - kingOut.y) > 10,
           orb.bad.slice(0, 6).join(" ") + " moved " + Math.hypot(kingOrb.x - kingOut.x, kingOrb.y - kingOut.y).toFixed(1) + "px");
        await page.evaluate(() => window.__fx.R.resetView());
        await settle(page);
      }
    }

    /* ---------- the board's own half of each moment ---------- */
    for (const dim of has3d ? ["3d", "2d"] : ["2d"]) {
      await page.evaluate((d) => {
        window.__fx.Fx.clear();
        window.__fx.use(d);
        /* the simple tier has no film grain, so the same scene draws the
           same pixels twice and "put back exactly" can be checked */
        if (window.__fx.R.setFx) window.__fx.R.setFx("low");
        window.__fx.setScene(window.__fx.MATED);
      }, dim);
      await settle(page);
      const before = await page.evaluate(BOARD_SIG);
      const again = await page.evaluate(BOARD_SIG);
      ok("the " + dim + " board draws the same scene the same way twice", before.hash === again.hash,
         before.hash + " vs " + again.hash);

      await page.evaluate(() => window.__fx.R.topple(0x76, { from: 0x74 }));
      const fell = await settle(page, 15000);
      const down = await page.evaluate(BOARD_SIG);
      const idleDown = await page.evaluate(() => window.__fx.R.frame());
      ok("the mated king goes over and the " + dim + " board goes idle", fell && !idleDown && down.hash !== before.hash,
         "settled " + fell + ", still drawing " + idleDown);
      ok("…with an empty GL error queue and a real picture", down.err === 0 && down.spread > 24, JSON.stringify(down));
      await page.evaluate(() => window.__fx.R.untopple());
      await settle(page);
      const up = await page.evaluate(BOARD_SIG);
      ok("untopple stands him back up exactly (" + dim + ")", up.hash === before.hash, up.hash + " vs " + before.hash);

      await page.evaluate(() => window.__fx.R.focus(0x76));
      const pushed = await settle(page);
      const close = await page.evaluate(BOARD_SIG);
      ok("the push-in changes the picture and comes to rest (" + dim + ")", pushed && close.hash !== before.hash && close.err === 0);
      await page.evaluate(() => window.__fx.R.focus(null));
      await settle(page);
      const back = await page.evaluate(BOARD_SIG);
      ok("focus(null) returns to exactly the view it left (" + dim + ")", back.hash === before.hash, back.hash + " vs " + before.hash);

      /* struck, and measured 60ms into the flash in the same task — a
         busy machine can take longer than the whole flash to get from
         one evaluate to the next */
      const lit = await page.evaluate("(() => { const R = window.__fx.R; R.impact(0x44, 1);" +
        " R.impacts[R.impacts.length - 1].t0 -= 60; return " + BOARD_SIG + "; })()");
      const dimmed = await settle(page, 10000);
      const after = await page.evaluate(BOARD_SIG);
      ok("a struck square lights up, goes dark again and the board rests (" + dim + ")",
         lit.hash !== before.hash && dimmed && after.hash === before.hash && lit.err === 0,
         "lit " + (lit.hash !== before.hash) + ", rested " + dimmed + ", restored " + (after.hash === before.hash));

      const plan = await page.evaluate(() => {
        window.__fx.fire.flourish();
        const p = window.__fx.R.flourishPlan();
        return { n: p.length, sorted: p.every((x, i) => !i || x.t >= p[i - 1].t),
                 first: p.length ? p[0].sq : -1, last: p.length ? p[p.length - 1].t : 0 };
      });
      ok("a new game hands back a landing for every man, in order (" + dim + ")",
         plan.n === 32 && plan.sorted && (plan.first >> 4) === 0 && plan.last < 1200, JSON.stringify(plan));
      const arrived = await settle(page, 15000);
      const set = await page.evaluate(BOARD_SIG);
      ok("…and the board rests once they have landed (" + dim + ")", arrived && set.err === 0 && set.spread > 24);
      await page.evaluate(() => { if (window.__fx.R.setFx) window.__fx.R.setFx(window.__fx.R.autoFx()); });
    }

    /* ---------- every effect draws, and on its own layer ---------- */
    await page.evaluate(() => { window.__fx.use("2d"); window.__fx.setScene(window.__fx.SCENE); });
    await settle(page);
    const STAGE = ["capturePawn", "captureQueen", "check", "promote", "mateWin", "mateLoss", "mateEven",
                   "confetti", "fireworks", "flash"];
    const PAGE = ["confettiPage", "sparkle"];
    for (const name of STAGE.concat(PAGE)) {
      const r = await page.evaluate(FIRE_AND_INK + "(" +
        JSON.stringify([name, PAGE.indexOf(name) >= 0 ? "fx-page" : "fx-stage", INK]) + ")");
      const spawned = r.spawned, ink = r.ink;
      if (VERBOSE) console.log("      ", name, "spawned", spawned, "ink", ink);
      ok(name + " draws something", spawned > 0 && ink > 20, "spawned " + spawned + ", ink " + ink);
    }
    if (has3d) {
      await page.evaluate(() => { window.__fx.Fx.clear(); window.__fx.use("3d"); window.__fx.setScene(window.__fx.SCENE); });
      await settle(page);
      for (const name of ["captureQueen", "mateWin", "promote"]) {
        const r = await page.evaluate(FIRE_AND_INK + "(" + JSON.stringify([name, "fx-stage", INK]) + ")");
        const spawned = r.spawned, ink = r.ink;
        ok(name + " draws over the carved board too", spawned > 0 && ink > 20, "spawned " + spawned + ", ink " + ink);
        if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, "fx-" + name + ".png") }); }
      }
      await page.evaluate(() => { window.__fx.Fx.clear(); window.__fx.use("2d"); });
    }

    /* the things that are not particles */
    const shook = await page.evaluate(async () => {
      const el = document.getElementById("card"), before = el.style.transform;
      window.__fx.Fx.shake(el, 8);
      /* the first frame or two of it, however long they take to come */
      let mid = "";
      for (let i = 0; i < 3 && !/translate/.test(mid); i++) {
        await new Promise((r) => requestAnimationFrame(r));
        mid = el.style.transform;
      }
      const t0 = Date.now();
      while (window.__fx.Fx.busy() && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 50));
      return { before, mid, after: el.style.transform };
    });
    ok("a shake moves the element and gives it back as it was",
       /translate/.test(shook.mid) && shook.after === shook.before, JSON.stringify(shook));
    const counted = await page.evaluate(async () => {
      const el = document.getElementById("rating"), ticks = [];
      /* what the number read when the first tick was heard: on its way,
         not already there */
      let mid = -1;
      const p = window.__fx.Fx.countUp(el, 1200, 1236, { ms: 1500, onTick: (i, n, v) => {
        if (mid < 0) mid = +el.textContent;
        ticks.push([i, n, Math.round(v)]);
      } });
      const fin = await p;
      return { mid, fin, text: el.textContent, ticks: ticks.length, n: ticks.length ? ticks[0][1] : 0,
               last: ticks.length ? ticks[ticks.length - 1] : null,
               rising: ticks.every((t, i) => !i || t[0] === ticks[i - 1][0] + 1) };
    });
    ok("a count climbs, arrives exactly, and ticks once per step",
       counted.mid > 1200 && counted.mid < 1236 && counted.fin === 1236 && counted.text === "1236" &&
       counted.ticks === counted.n && counted.rising && counted.last[2] === 1236, JSON.stringify(counted));
    const buzz = await page.evaluate(() => {
      const a = window.__fx.Fx.haptic("capture");
      const real = navigator.vibrate;
      /* iOS: there is no vibrate at all */
      Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true });
      const b = window.__fx.Fx.haptic([10, 20]);
      Object.defineProperty(navigator, "vibrate", { value: real, configurable: true });
      return { a: typeof a, b };
    });
    ok("a buzz never throws, and quietly does nothing where there is no vibrate",
       buzz.a === "boolean" && buzz.b === false, JSON.stringify(buzz));

    /* ---------- a whole little game, conducted the way the app should ---------- */
    const game = await page.evaluate(async () => {
      const F = window.__fx;
      F.Fx.clear(); F.Fx.stats(true);
      F.use("2d");
      F.fire.game();
      const t0 = Date.now();
      while (!F.gameOver && Date.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, 200));
      return { over: F.gameOver, toppled: F.R.toppled ? F.R.toppled.sq : -1, peak: F.Fx.stats().peak,
               ms: Date.now() - t0 };
    });
    ok("a little game plays through: the men set out, a capture lands, the mated king goes over",
       game.over && game.toppled === 0x74 && game.peak > 60, JSON.stringify(game));

    /* ---------- and then it all stops ---------- */
    await page.evaluate(() => { window.__fx.fire.captureQueen(); window.__fx.fire.mateWin(); window.__fx.fire.fireworks(); window.__fx.fire.sparkle(); });
    const wentQuiet = await quiet(page, 15000);
    await settle(page);
    const asleep = await page.evaluate(async (INKSRC) => {
      const ink = eval(INKSRC);
      const f0 = window.__fx.Fx.stats().frames;
      const orig = window.requestAnimationFrame;
      let asked = 0;
      window.requestAnimationFrame = function (fn) { asked++; return orig.call(window, fn); };
      await new Promise((r) => setTimeout(r, 600));
      window.requestAnimationFrame = orig;
      const s = window.__fx.Fx.stats();
      const vis = Array.prototype.map.call(document.querySelectorAll("canvas.fx-stage, canvas.fx-page"),
        (c) => c.style.visibility);
      return { asked, frames: s.frames - f0, looping: s.looping, alive: s.alive,
               stageInk: ink("fx-stage"), pageInk: ink("fx-page"), vis };
    }, INK);
    ok("when the last effect ends, the loop stops asking for frames",
       wentQuiet && asleep.asked === 0 && asleep.frames === 0 && !asleep.looping && asleep.alive === 0,
       JSON.stringify(asleep));
    ok("…and leaves both layers clear and hidden",
       asleep.stageInk === 0 && asleep.pageInk === 0 && asleep.vis.every((v) => v === "hidden"),
       JSON.stringify(asleep));

    /* ---------- a storm stays inside its budget ---------- */
    const storm = await page.evaluate(async () => {
      const F = window.__fx.Fx;
      F.clear(); F.stats(true);
      let most = 0;
      for (let round = 0; round < 3; round++) {
        window.__fx.fire.storm();
        for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 50)); most = Math.max(most, F.stats().alive); }
      }
      for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 60)); most = Math.max(most, F.stats().alive); }
      const s = F.stats();
      F.clear();
      return { most, peak: s.peak, max: s.max, dropped: s.dropped, quality: s.quality };
    });
    if (VERBOSE) console.log("      ", JSON.stringify(storm));
    ok("a storm of everything at once never has more than " + storm.max + " particles alive",
       storm.most <= storm.max && storm.peak <= storm.max && storm.peak >= Math.min(storm.max, 150),
       JSON.stringify(storm));

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
    await ctx.close();

    /* ================= somebody who asked for stillness ================= */
    const quietRoom = await open(browser, { reducedMotion: "reduce" });
    const qp = quietRoom.page;
    const still = await qp.evaluate(async (INKSRC) => {
      const ink = eval(INKSRC);
      const F = window.__fx.Fx, fire = window.__fx.fire;
      const reduced = F.isReduced();
      let spawned = 0;
      for (const n of ["capturePawn", "captureQueen", "check", "promote", "mateWin", "mateLoss", "mateEven",
                       "confetti", "confettiPage", "fireworks", "flash", "sparkle"]) spawned += fire[n]() || 0;
      const shook = F.shake(document.getElementById("card"), 8);
      const el = document.getElementById("rating");
      let ticks = 0;
      const p = F.countUp(el, 1200, 1250, { ms: 900, onTick: () => ticks++ });
      const instantly = el.textContent;
      await new Promise((r) => setTimeout(r, 250));
      return { reduced, spawned, shook, instantly, ticks, busy: F.busy(), alive: F.stats().alive,
               stageInk: ink("fx-stage"), pageInk: ink("fx-page"), resolved: await p };
    }, INK);
    ok("prefers-reduced-motion is noticed", still.reduced);
    ok("…and nothing at all is drawn", still.spawned === 0 && still.stageInk === 0 && still.pageInk === 0 &&
       !still.busy && still.alive === 0, JSON.stringify(still));
    ok("…a count simply arrives, with one tick for the arrival",
       still.instantly === "1250" && still.resolved === 1250 && still.ticks === 1, JSON.stringify(still));
    ok("…and nothing shakes", still.shook === false);
    for (const dim of (await qp.evaluate(() => !!window.__fx.R3)) ? ["3d", "2d"] : ["2d"]) {
      const quietBoard = await qp.evaluate((d) => {
        window.__fx.use(d);
        const R = window.__fx.R;
        window.__fx.setScene(window.__fx.MATED);
        for (let i = 0; i < 40 && R.frame(); i++);
        const kingBefore = R.squareToScreen(0x76);
        R.focus(0x76);
        R.topple(0x76, { from: 0x74 });
        R.impact(0x44, 1);
        let frames = 0;
        while (R.frame() && frames < 40) frames++;
        const idle = !R.frame();
        const kingAfter = R.squareToScreen(0x76);
        window.__fx.setScene(window.__fx.START, true);
        const plan = R.flourishPlan().length;
        let f2 = 0;
        while (R.frame() && f2 < 40) f2++;
        return { frames, idle, plan, f2, still: Math.abs(kingAfter.x - kingBefore.x) < 0.5 && Math.abs(kingAfter.s - kingBefore.s) < 0.5 };
      }, dim);
      ok("the " + dim + " board's moments are instant under reduced motion",
         quietBoard.idle && quietBoard.frames <= 2 && quietBoard.plan === 0 && quietBoard.f2 <= 2 && quietBoard.still,
         JSON.stringify(quietBoard));
    }
    ok("the quiet room is quiet without complaint", quietRoom.errs.length === 0, quietRoom.errs.slice(0, 3).join(" | "));
    await quietRoom.ctx.close();
  } catch (e) {
    ok("the effects check ran", false, e.stack || e.message);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failed ? "\n" + failed + " problem" + (failed > 1 ? "s" : "") + " with the big moments"
                     : "\nevery moment lands on its square, and then the room goes quiet");
  process.exit(failed ? 1 : 0);
})();
