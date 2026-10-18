/* board-check.js — dev-only. Is the board the right size, and does it
   answer the finger the eye is pointing with?

   Five things a phone found that no other check was looking at:

     - The carved board filled a quarter of a portrait phone: far-rank
       squares thirty pixels wide and twenty-two tall, with empty bands
       above and below it. So: on a 390x844 phone the far rank has to be
       at least 37 px across, the board has to fit between the player
       bars, and on a laptop it has to stay the size it was.
     - A tap on the head of a tall man picked the square behind him,
       because the ray only ever met the wood. So: the head of every
       back-rank man is tapped — through the app, with a finger, where
       it can be — from both sides, on a phone and on a laptop, and has
       to come back as his own square.
     - The orbit could be tilted nearly edge-on and nothing reset it. So:
       tilting all the way down has to stop with the squares still
       readable, and Flip has to bring the camera home.
     - On the drawn board the name tags and the turn pill lay over the
       back ranks, and the coordinates were nine pixels of the frame's
       own colour. So: the board stays out of the bars, and every house
       skin's coordinates clear 4.5:1 against what they sit on.
     - The drag-to-move hooks (setDrag, dragHover) have to draw, follow
       the pointer, hand back the square under the piece, put the
       picture back exactly when they let go, and leave the board idle —
       on both boards. And the effects tier steps down when frames are
       slow, remembers it, never steps up by itself, and leaves an
       explicit choice alone.

   And what a second look found:

     - A padded can round each man was the right size for a fingertip
       and the wrong shape for the eye: tilted low, half of a pawn peeping
       out beside the king in front of him answered as the king. So every
       visible pixel of every man, found by painting the men in colours of
       their own, has to pick that man.
     - A man let go of was simply put back, or replayed from his own
       square all the way to where the hand had already carried him. Now
       a move played from the hand is only the setting down, and a man
       let go of without a move glides home.
     - The coordinates were inked against a model of the square, and a
       wood grain, a marble vein or an inlay line through the corner took
       them under 4.5:1 (as low as 1.6:1 on Neon Café). They are held to
       it now against the pixels really under them.
     - On the drawn board the last frame of a move switched off a
       capture's flash that was still burning, and it froze half-lit.

   Needs `playwright-core`; the browser is already on the machine. If
   either is missing it says so and exits 0, after the checks that need
   no browser.

   Run: node chess/tools/board-check.js [--shots DIR]                   */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
const SHOTS = (() => { const i = process.argv.indexOf("--shots"); return i >= 0 ? process.argv[i + 1] : null; })();
let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

/* ---------- without a browser: the coordinates' ink ---------- */
(function () {
  const Gfx2D = require("../gfx2d.js");
  const Skins = require("../skins.js");
  let worst = { r: 99 }, n = 0;
  for (const s of Skins.PRESETS) {
    for (const o of [1, -1]) {
      for (const L of Gfx2D.coordLabels(s.board, o)) {
        const r = Gfx2D.contrast(L.ink, L.bg);
        n++;
        if (r < worst.r) worst = { r, skin: s.id, text: L.text, o };
      }
    }
  }
  ok("every coordinate on every house skin clears 4.5:1 against its square (" + n + " labels)",
     worst.r >= 4.5, JSON.stringify(worst));
  /* and a hostile skin: both squares the same mid grey */
  const grey = Gfx2D.coordLabels({ light: "#777777", dark: "#777777", gloss: 0.9 }, 1);
  ok("…and still does on a board whose squares are one mid grey",
     grey.every((L) => Gfx2D.contrast(L.ink, L.bg) >= 4.5));
})();

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
if (!CHROME) { console.log("no chromium on this machine — skipping the board check in a browser."); process.exit(failed ? 1 : 0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the board check in a browser.");
  console.log("  npm i --no-save playwright-core");
  process.exit(failed ? 1 : 0);
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

const SQ = (name) => (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);
const NAME = (sq) => sq < 0 ? String(sq) : "abcdefgh"[sq & 7] + ((sq >> 4) + 1);
const BAR = 48;

/* Starting a game takes a few pixels off the stage without the window
   changing; a board that only listens for window resizes kept its old
   bitmap and was squashed into the new box. */
const boxes = (page) => page.evaluate(() => {
  const R = __cr.renderer, cv = document.getElementById(R.kind === "3d" ? "cv3" : "cv2");
  const dpr = Math.min(R.kind === "3d" ? 2 : 2.5, devicePixelRatio || 1);
  return { css: [cv.clientWidth, cv.clientHeight], buf: [cv.width / dpr, cv.height / dpr] };
});
async function fitsBox(page) {
  const b = await boxes(page);
  return Math.abs(b.css[0] - b.buf[0]) <= 1 && Math.abs(b.css[1] - b.buf[1]) <= 1;
}

/* run the board's frames until it says it has nothing left to draw */
async function settle(page) {
  for (let i = 0; i < 400; i++) {
    const more = await page.evaluate(() => { let m = false; for (let k = 0; k < 3; k++) m = __cr.renderer.frame(); return m; });
    if (!more) return true;
    await page.waitForTimeout(20);
  }
  return false;
}
/* a signature of the board's own canvas, drawn and read in one task */
const SIG = `(() => {
  const R = __cr.renderer;
  R.dirty = true; R.frame();
  let px;
  if (R.kind === "3d") {
    const cv = document.getElementById("cv3"), gl = cv.getContext("webgl") || cv.getContext("experimental-webgl");
    px = new Uint8Array(cv.width * cv.height * 4);
    gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  } else {
    const cv = document.getElementById("cv2");
    px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  }
  let hash = 0;
  for (let i = 0; i < px.length; i += 4 * 5) hash = (hash * 31 + ((px[i] * 77 + px[i + 1] * 151 + px[i + 2] * 28) >> 8)) | 0;
  return hash;
})()`;

async function openGame(browser, w, h, dim) {
  /* a phone at its own pixel density; a laptop at one, which is all a
     software-rendered browser on a shared machine can draw in good time */
  const mobile = w < 900;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1,
                                         hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("" + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  await page.goto(base + "/chess/" + (dim === "2d" ? "#force2d" : ""), { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.click("#mPass");
  await page.waitForTimeout(250);
  await page.click("#newStart");
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById("toast").classList.remove("show"));
  await settle(page);
  const kind = await page.evaluate(() => __cr.renderer.kind);
  return { ctx, page, errs, kind };
}
let base = "";

(async () => {
  await new Promise((r) => server.listen(0, r));
  base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

  try {
    /* ================= the carved board on a phone ================= */
    let g = await openGame(browser, 390, 844, "3d");
    ok("the carved board is up on a 390x844 phone", g.kind === "3d", "renderer " + g.kind);
    if (g.kind !== "3d") throw new Error("no 3D renderer to check");
    const fit = await g.page.evaluate((BAR) => {
      const R = __cr.renderer, st = document.getElementById("stage").getBoundingClientRect();
      const far = [], near = [];
      for (let f = 0; f < 8; f++) { far.push(R.squareToScreen(0x70 + f)); near.push(R.squareToScreen(f)); }
      const avg = (a, k) => a.reduce((s, p) => s + p[k], 0) / a.length;
      /* the crowns of the far rank, and the front edge of the near one */
      let crownTop = 1e9, nearBottom = -1e9, left = 1e9, right = -1e9;
      for (let f = 0; f < 8; f++) {
        const c = R.squareToScreen(0x70 + f, R.heightOf(0x70 + f));
        crownTop = Math.min(crownTop, c.y);
        const n = R.squareToScreen(f);
        nearBottom = Math.max(nearBottom, n.y + n.sy / 2);
        left = Math.min(left, n.x - n.s / 2); right = Math.max(right, n.x + n.s / 2);
      }
      return { w: st.width, h: st.height, farS: avg(far, "s"), farSy: avg(far, "sy"), nearS: avg(near, "s"),
               crownTop, nearBottom, left, right, BAR };
    }, BAR);
    ok("on a phone the far rank is at least 37 px across (was 30)", fit.farS >= 37,
       "far " + fit.farS.toFixed(1) + " x " + fit.farSy.toFixed(1) + ", near " + fit.nearS.toFixed(1));
    ok("…and stands up: the far rank at least 31 px deep (was 22)", fit.farSy >= 31, fit.farSy.toFixed(1));
    ok("…and the board fits between the bars and inside the glass",
       fit.crownTop >= BAR - 1 && fit.nearBottom <= fit.h - BAR + 1 && fit.left >= 4 && fit.right <= fit.w - 4,
       JSON.stringify(fit));
    ok("…and spans most of the width", fit.right - fit.left >= fit.w * 0.82, (fit.right - fit.left).toFixed(0) + " of " + fit.w);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await g.page.screenshot({ path: path.join(SHOTS, "board-3d-390x844.png"), timeout: 90000 }); }

    /* ---------- a finger on a man's head ---------- */
    const heads = async (side) => {
      return g.page.evaluate((side) => {
        const R = __cr.renderer, out = [];
        const rank = side === 1 ? 0 : 7;
        for (let f = 0; f < 8; f++) {
          const sq = rank * 16 + f, hgt = R.heightOf(sq);
          const p = R.squareToScreen(sq, hgt * 0.82);
          out.push({ sq, got: R.screenToSquare(p.x, p.y), wood: R.screenToSquare(p.x, p.y, { plane: true }), x: p.x, y: p.y });
        }
        return out;
      }, side);
    };
    /* from the home view, and from as low as the orbit will go — where a
       head stands furthest over the square behind it */
    const headCheck = async (label) => {
      for (const tilt of ["home", "low"]) {
        for (const side of [1, -1]) {
          await g.page.evaluate(([s, low]) => {
            const R = __cr.renderer;
            R.setOrientation(s);
            if (low) R.orbit(0, -5000);
          }, [side, tilt === "low"]);
          await settle(g.page);
          const h = await heads(side);
          const wrong = h.filter((r) => r.got !== r.sq).map((r) => NAME(r.sq) + "→" + NAME(r.got));
          const wood = h.filter((r) => r.wood !== r.sq).map((r) => NAME(r.sq) + "→" + NAME(r.wood));
          ok(label + ", " + (tilt === "low" ? "tilted low" : "home view") + ": the head of every " +
             (side === 1 ? "white" : "black") + " back-rank man is his own square" +
             (wood.length ? " (the wood alone said " + wood.join(" ") + ")" : ""), wrong.length === 0, wrong.join(" "));
        }
      }
      await g.page.evaluate(() => __cr.renderer.setOrientation(1));
      await settle(g.page);
    };
    await headCheck("phone");

    /* and through the app, by thumb: the knight's head picks up the knight */
    const box = await g.page.locator("#stage").boundingBox();
    const tapHead = async (name) => {
      const p = await g.page.evaluate((sq) => {
        const R = __cr.renderer;
        return R.squareToScreen(sq, R.heightOf(sq) * 0.82);
      }, SQ(name));
      await g.page.touchscreen.tap(box.x + p.x, box.y + p.y);
      await g.page.waitForTimeout(160);
      return g.page.evaluate(() => __cr.renderer.hi.selected);
    };
    let sel = await tapHead("g1");
    ok("a thumb on the g1 knight's head picks up the g1 knight", sel === SQ("g1"), "selected " + NAME(sel));
    await tapHead("g1");                                       /* put him down again */
    ok("nothing shouted at the console (phone)", g.errs.length === 0, g.errs.slice(0, 3).join(" | "));

    /* ---------- the orbit: a floor, and Flip brings it home ---------- */
    const view = () => g.page.evaluate(() => {
      const R = __cr.renderer, a = R.squareToScreen(0x34), b = R.squareToScreen(0x43);
      return { ax: a.x, ay: a.y, as: a.s, asy: a.sy, bx: b.x, by: b.y };
    });
    const home = await view();
    await g.page.evaluate(() => __cr.renderer.orbit(0, -5000));
    await settle(g.page);
    const low = await view();
    ok("tilting all the way down stops while the squares are still readable",
       low.asy / low.as >= 0.45, "a middle square is " + (low.asy / low.as).toFixed(2) + " as deep as it is wide");
    await g.page.evaluate(() => { const R = __cr.renderer; R.orbit(140, 30); R.zoom(0.7); });
    await settle(g.page);
    const moved = await view();
    await g.page.evaluate(() => { __cr.renderer.setOrientation(-1); });
    await settle(g.page);
    await g.page.evaluate(() => { __cr.renderer.setOrientation(1); });
    await settle(g.page);
    const back = await view();
    ok("Flip eases the tilt and the zoom home as well as turning the board",
       Math.hypot(moved.ax - home.ax, moved.ay - home.ay) > 10 &&
       Math.hypot(back.ax - home.ax, back.ay - home.ay) < 0.6 && Math.abs(back.as - home.as) < 0.3,
       JSON.stringify({ home, moved, back }));

    /* ---------- drag-to-move on the carved board ---------- */
    await g.page.evaluate(() => __cr.renderer.setFx("low"));     /* no grain: one frame equals the next */
    await settle(g.page);
    await dragCheck(g.page, "3d");
    await g.ctx.close();

    /* ================= every pixel of every man, by colour ================= */
    await pickTruth(browser);

    /* ================= the carved board on a laptop and a phone on its side ================= */
    for (const [w, h, label] of [[1280, 800, "laptop"], [844, 390, "phone on its side"]]) {
      g = await openGame(browser, w, h, "3d");
      const lap = await g.page.evaluate(() => {
        const R = __cr.renderer, st = document.getElementById("stage").getBoundingClientRect();
        let crownTop = 1e9, nearBottom = -1e9, far = 0;
        for (let f = 0; f < 8; f++) {
          crownTop = Math.min(crownTop, R.squareToScreen(0x70 + f, R.heightOf(0x70 + f)).y);
          const n = R.squareToScreen(f);
          nearBottom = Math.max(nearBottom, n.y + n.sy / 2);
          far += R.squareToScreen(0x70 + f).s / 8;
        }
        return { w: st.width, h: st.height, crownTop, nearBottom, far };
      });
      ok(label + ": the carved board's bitmap is the size of its box, after the stage changed under it",
         await fitsBox(g.page), JSON.stringify(await boxes(g.page)));
      ok(label + ": the board fits between the player bars",
         lap.crownTop >= BAR - 1 && lap.nearBottom <= lap.h - BAR + 1, JSON.stringify(lap));
      if (w === 1280) ok("laptop: the board is still as large as it was (far rank ≥ 63 px)", lap.far >= 63, lap.far.toFixed(1));
      await headCheck(label);
      ok("nothing shouted at the console (" + label + ")", g.errs.length === 0, g.errs.slice(0, 3).join(" | "));
      if (SHOTS) await g.page.screenshot({ path: path.join(SHOTS, "board-3d-" + w + "x" + h + ".png"), timeout: 90000 });
      await g.ctx.close();
    }

    /* ================= the drawn board ================= */
    for (const [w, h] of [[390, 844], [844, 390], [1280, 800]]) {
      g = await openGame(browser, w, h, "2d");
      ok("the drawn board is up at " + w + "x" + h, g.kind === "2d", g.kind);
      const lay = await g.page.evaluate(() => {
        const R = __cr.renderer, st = document.getElementById("stage").getBoundingClientRect();
        const top = R.squareToScreen(R.orientation === 1 ? 0x70 : 0x00), bot = R.squareToScreen(R.orientation === 1 ? 0x00 : 0x70);
        const pad = Math.round(R.cell * 0.2);
        return { w: st.width, h: st.height, frameTop: top.y - top.s / 2 - pad, frameBottom: bot.y + bot.s / 2 + pad,
                 frameLeft: R.ox - pad, frameRight: R.ox + R.size + pad, cell: R.cell };
      });
      ok(w + "x" + h + ": the drawn board's bitmap is the size of its box, after the stage changed under it",
         await fitsBox(g.page), JSON.stringify(await boxes(g.page)));
      ok(w + "x" + h + ": the drawn board and its frame stay out of the player bars and inside the glass",
         lay.frameTop >= BAR && lay.frameBottom <= lay.h - BAR && lay.frameLeft >= 0 && lay.frameRight <= lay.w,
         JSON.stringify(lay));
      if (w === 390) {
        await dragCheck(g.page, "2d");
        await coordInk(g.page);
        /* the last frame of a move must not switch off a capture's flash
           (or a lean-in) that is still going: it used to, and the flash
           froze half-lit until something else asked for a frame */
        const flash = await g.page.evaluate(async () => {
          const R = __cr.renderer, before = new Int8Array(R.board), after = new Int8Array(R.board);
          after[0x34] = after[0x14]; after[0x14] = 0;
          R.animateMove({ piece: 1, from: 0x14, to: 0x34 }, after, { dur: 40 }, null);
          R.impact(0x34, 1);
          R.frame();
          await new Promise((r) => setTimeout(r, 60));
          const more = R.frame();
          const res = { more, landed: !R.anim, live: R.impacts.length > 0 };
          R.setPosition(before);
          return res;
        });
        ok("2d: a capture's flash keeps going after the move under it has landed",
           flash.landed && flash.live && flash.more === true, JSON.stringify(flash));
        await settle(g.page);
      }
      ok("nothing shouted at the console (2d " + w + "x" + h + ")", g.errs.length === 0, g.errs.slice(0, 3).join(" | "));
      if (SHOTS) await g.page.screenshot({ path: path.join(SHOTS, "board-2d-" + w + "x" + h + ".png"), timeout: 90000 });
      await g.ctx.close();
    }

    /* ================= the effects tier, watching the frame rate ================= */
    await fxCheck(browser);
  } catch (e) {
    failed++;
    console.log("FAIL  the check itself fell over  → " + (e && e.stack || e));
  }
  await browser.close();
  server.close();
  console.log(failed ? "\n" + failed + " problem" + (failed > 1 ? "s" : "") + " with the board"
                     : "\nthe board fits the glass, answers the finger, and carries a man where he is taken");
  process.exit(failed ? 1 : 0);
})();

/* Pick up the e2 pawn and carry him to e4 and beyond, on whichever board
   is up: the picture changes and his square empties, the square handed
   back is the one under him, off the board is -1, the hover outline
   draws, the board goes idle while he is held still, and letting go puts
   back exactly the picture that was there. */
async function dragCheck(page, dim) {
  const before = await page.evaluate(SIG);
  const r = await page.evaluate(() => {
    const R = __cr.renderer, e4 = R.squareToScreen(0x34), e2 = R.squareToScreen(0x14);
    const over = R.setDrag(0x14, e4.x, e4.y);
    return { over, e4, e2 };
  });
  const rose = await settle(page);
  const held = await page.evaluate(SIG);
  const idle = await page.evaluate(() => __cr.renderer.frame());
  ok(dim + ": a carried pawn is drawn where he is carried, comes to rest, and the board idles",
     held !== before && rose && idle === false, JSON.stringify({ held, before, rose, idle }));
  ok(dim + ": …and the square handed back is the one under him", r.over === 0x34, "got " + NAME(r.over));
  /* the move itself: the same pointer, moved — he follows */
  const follow = await page.evaluate(() => {
    const R = __cr.renderer, d4 = R.squareToScreen(0x33);
    const over = R.setDrag(0x14, d4.x, d4.y);
    const off = R.setDrag(0x14, -400, -400);
    const back = R.setDrag(0x14, d4.x, d4.y);
    return { over, off, back };
  });
  await settle(page);
  const moved = await page.evaluate(SIG);
  ok(dim + ": …follows the pointer, and says -1 when it leaves the board",
     follow.over === 0x33 && follow.off === -1 && follow.back === 0x33 && moved !== held, JSON.stringify(follow));
  await page.evaluate(() => __cr.renderer.dragHover(0x33));
  await settle(page);
  const hovered = await page.evaluate(SIG);
  await page.evaluate(() => __cr.renderer.dragHover(-1));
  await settle(page);
  const unhovered = await page.evaluate(SIG);
  ok(dim + ": the landing square gets an outline, and loses it", hovered !== moved && unhovered === moved,
     JSON.stringify({ hovered, moved, unhovered }));
  /* in the hand, his own square answers as empty wood (nothing to tap) */
  const pick = await page.evaluate(() => { const R = __cr.renderer, p = R.squareToScreen(0x14); return R.screenToSquare(p.x, p.y); });
  ok(dim + ": while he is carried his own square is empty to a tap", pick === 0x14, NAME(pick));
  await page.evaluate(() => __cr.renderer.setDrag(null));
  const putBack = await settle(page);
  const after = await page.evaluate(SIG);
  ok(dim + ": letting go puts back exactly the picture that was there", putBack && after === before,
     JSON.stringify({ after, before }));
  /* and a move played from the hand animates from the square as usual */
  const played = await page.evaluate(async () => {
    const R = __cr.renderer, e4 = R.squareToScreen(0x34);
    R.setDrag(0x14, e4.x, e4.y);
    R.frame();
    R.setDrag(null);
    const before = new Int8Array(R.board), after = new Int8Array(R.board);
    after[0x34] = after[0x14]; after[0x14] = 0;
    let done = false;
    R.animateMove({ piece: 1, from: 0x14, to: 0x34 }, after, {}, () => { done = true; });
    const fromHand = !!(R.anim && R.anim.drop && R.anim.pl.dropped), dur = R.anim && R.anim.dur;
    const t0 = Date.now();
    while (!done && Date.now() - t0 < 5000) { R.frame(); await new Promise((r) => setTimeout(r, 16)); }
    const res = { done, e4: R.board[0x34], e2: R.board[0x14], fromHand, dur };
    R.setPosition(before);
    return res;
  });
  ok(dim + ": a move played from the hand is set down from where he was let go, and lands",
     played.done && played.e4 === 1 && played.e2 === 0 && played.fromHand && played.dur <= 240,
     JSON.stringify(played));
  /* let go over a square the app will not play: he glides home rather
     than vanishing from under the finger (and then the board idles, and
     the picture is exactly the one before — checked above) */
  const glide = await page.evaluate(() => {
    const R = __cr.renderer, e5 = R.squareToScreen(0x44);
    R.setDrag(0x14, e5.x, e5.y); R.frame();
    R.setDrag(null);
    return R.frame();
  });
  const home = await settle(page);
  ok(dim + ": a man let go of without a move glides home, then the board idles",
     (glide === true || (await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches))) && home &&
     (await page.evaluate(SIG)) === before, JSON.stringify({ glide, home }));
  await settle(page);
}

/* A second carved board on a page of its own (the effects preview, with
   a canvas of our own beside its one), driven frame by frame so the gaps
   between frames are ours to choose. */
async function fxCheck(browser) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 480 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("" + e.message));
  await page.goto(base + "/chess/tools/fx-preview.html", { waitUntil: "load" });
  await page.waitForFunction(() => window.__fx && window.__fx.R);
  const run = (gap, opts) => page.evaluate(async ([gap, opts]) => {
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;left:0;top:0;width:320px;height:240px";
    document.body.appendChild(cv);
    const R = Gfx3D.create(cv, opts || {});
    R.setSkin(Skins.PRESETS[0]);
    const start = { fx: R.fx(), why: R.fxReason(), auto: R.autoFx() };
    const board = new Int8Array(128);
    board[0x14] = 1; board[0x04] = 6; board[0x74] = -6;
    R.setPosition(board);
    /* two moves, each drawn at the given gap between frames */
    for (let k = 0; k < 2; k++) {
      const after = new Int8Array(R.board);
      const from = k ? 0x24 : 0x14, to = k ? 0x14 : 0x24;
      after[to] = after[from]; after[from] = 0;
      R.animateMove({ piece: 1, from, to }, after, { dur: 2400 }, null);
      const t0 = performance.now();
      while (R.frame() && performance.now() - t0 < 8000) {
        const until = performance.now() + gap;
        while (performance.now() < until) { /* a slow device, by hand */ }
        await new Promise((r) => setTimeout(r, 0));
      }
      for (let i = 0; i < 4 && R.frame(); i++);
    }
    const end = { fx: R.fx(), why: R.fxReason(), auto: R.autoFx(), idle: !R.frame() };
    let stored = null;
    try { stored = sessionStorage.getItem("chess.fx.stepped"); } catch (e) {}
    R.destroy(); cv.remove();
    return { start, end, stored };
  }, [gap, opts]);

  const fast = await run(14);
  ok("a device that keeps up keeps its tier (" + fast.start.fx + ", " + fast.start.why + ")",
     fast.end.fx === fast.start.fx && fast.end.why === "device" && fast.stored === null && fast.end.idle,
     JSON.stringify(fast));
  const slow = await run(62);
  const ORDER = ["low", "medium", "high"];
  const stepped = ORDER.indexOf(slow.end.fx) === ORDER.indexOf(slow.start.fx) - 1 ||
                  (slow.start.fx === "low" && slow.end.fx === "low");
  ok("a device drawing at 16 frames a second steps one tier down, between moves",
     stepped && slow.end.why === (slow.start.fx === "low" ? "device" : "frame rate") && slow.end.idle,
     JSON.stringify(slow));
  ok("…and remembers it for the session", slow.start.fx === "low" || slow.stored === slow.end.fx, JSON.stringify(slow));
  const again = await run(14);
  ok("…so the next board starts there, and never climbs back by itself",
     again.start.fx === slow.end.fx && again.end.fx === slow.end.fx &&
     (slow.start.fx === "low" || again.start.why === "frame rate"), JSON.stringify(again));
  const chosen = await run(62, { fx: "high" });
  ok("an explicit choice is kept, however slow the frames",
     chosen.start.fx === "high" && chosen.end.fx === "high" && chosen.end.why === "chosen", JSON.stringify(chosen));
  const backToAuto = await page.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;left:0;top:0;width:200px;height:150px";
    document.body.appendChild(cv);
    const R = Gfx3D.create(cv, { fx: "high" });
    R.setSkin(Skins.PRESETS[0]);
    R.setFx("auto");
    const out = { fx: R.fx(), why: R.fxReason(), auto: R.autoFx() };
    R.destroy(); cv.remove();
    return out;
  });
  ok("…and handing it back to Auto picks up where the frame rate left it",
     backToAuto.fx === slow.end.fx && backToAuto.fx === backToAuto.auto && backToAuto.why !== "chosen",
     JSON.stringify(backToAuto));
  ok("nothing shouted at the console (effects tier)", errs.length === 0, errs.slice(0, 3).join(" | "));
  await ctx.close();
}

/* Every pixel of every man, found by colour, tapped. The board is painted
   blue and the men red and green, all flat, on the lowest effects tier;
   each man is taken off in turn and the pixels that change are his. Then
   every one of those pixels is put through screenToSquare and has to come
   back as his square — from the home view and tilted as low as the orbit
   goes, from both sides, with the back ranks full and with a forest of
   kings and queens in the middle. The padded outlines alone gave half of
   a pawn peeping out beside a king to the king. */
async function pickTruth(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("" + e.message));
  await page.goto(base + "/chess/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.click("#mPass"); await page.waitForTimeout(250);
  await page.click("#newStart"); await page.waitForTimeout(400);
  await settle(page);
  const start = {}, forest = {}, back = [4, 2, 3, 5, 6, 3, 2, 4], tall = [6, 5, 3, 6, 5, 3, 6, 5];
  for (let f = 0; f < 8; f++) {
    start[f] = back[f]; start[0x10 + f] = 1; start[0x60 + f] = -1; start[0x70 + f] = -back[f];
    forest[f] = back[f]; forest[0x30 + f] = tall[f]; forest[0x40 + f] = -tall[7 - f];
  }
  forest[0x14] = 1; forest[0x23] = 5; forest[0x24] = 6;
  const PROBE = async (cfg) => {
    const R = __cr.renderer;
    const skin = JSON.parse(JSON.stringify(Skins.PRESETS[0]));
    Object.assign(skin.board, { light: "#2030ff", dark: "#1020c0", rim: "#1020c0", edge: "#2030ff", pattern: "plain", grain: 0, gloss: 0 });
    Object.assign(skin.pieces, { white: "#ff2020", black: "#20ff20", material: "ink", shine: 0, rim: 0 });
    R.setFx("low"); R.setSkin(skin);
    R.resetView(); R.setOrientation(cfg.side);
    if (cfg.low) R.orbit(0, -5000);
    if (cfg.yaw) { R.orbit(cfg.yaw, 0); R.zoom(0.8); }
    R.setHighlights({});
    const board = new Int8Array(128);
    for (const k in cfg.pos) board[+k] = cfg.pos[k];
    R.setPosition(board);
    for (let i = 0; i < 300 && R.frame(); i++) await new Promise((r) => setTimeout(r, 0));
    const cv = document.getElementById("cv3"), gl = cv.getContext("webgl") || cv.getContext("experimental-webgl");
    const W = cv.width, H = cv.height, dpr = W / cv.clientWidth;
    const grab = () => { R.dirty = true; R.frame(); const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    const A = grab(), owner = new Int16Array(W * H).fill(-1);
    const isMan = (i) => A[i] > A[i + 2] + 40 || A[i + 1] > A[i + 2] + 40;
    for (let sq = 0; sq < 128; sq++) {
      if ((sq & 0x88) || !board[sq]) continue;
      const b2 = new Int8Array(board); b2[sq] = 0; R.setPosition(b2);
      const B = grab();
      for (let p = 0, i = 0; p < W * H; p++, i += 4) {
        if (isMan(i) && Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])) > 30) owner[p] = sq;
      }
    }
    R.setPosition(board); R.dirty = true; R.frame();
    let n = 0, bad = 0, ms = 0; const eg = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const p = y * W + x;
      if (owner[p] < 0) continue;
      const cx = (x + 0.5) / dpr, cy = (H - 1 - y + 0.5) / dpr;
      const t0 = performance.now(), got = R.screenToSquare(cx, cy);
      ms += performance.now() - t0; n++;
      if (got !== owner[p]) { bad++; if (eg.length < 3) eg.push(owner[p].toString(16) + "→" + got.toString(16)); }
    }
    return { n, bad, eg, msPerTap: ms / Math.max(1, n) };
  };
  let slowest = 0;
  for (const [pos, label] of [[start, "the starting position"], [forest, "a forest of kings and queens"]]) {
    for (const side of [1, -1]) {
      for (const view of ["home", "low"]) {
        const r = await page.evaluate(PROBE, { pos, side, low: view === "low", yaw: view === "low" && pos === forest ? 60 : 0 });
        slowest = Math.max(slowest, r.msPerTap);
        ok("every visible pixel of every man picks that man: " + label + ", " + (side === 1 ? "white" : "black") +
           " side, " + (view === "low" ? "tilted low" : "home view") + " (" + r.n + " pixels)",
           r.n > 1000 && r.bad / r.n < 0.003, r.bad + " wrong, e.g. " + r.eg.join(" "));
      }
    }
  }
  ok("a tap is worked out in a few milliseconds even through the carved set (" + slowest.toFixed(2) + " ms at worst)", slowest < 8);
  ok("nothing shouted at the console (picking by colour)", errs.length === 0, errs.slice(0, 3).join(" | "));
  await ctx.close();
}

/* The coordinates of the drawn board, against the pixels really under
   them: every house skin, both ways round. The ink each label is drawn in
   is caught as it is drawn, and held against the board as drawn with the
   label's keyline plate on it — a grain line, a vein or an inlay stripe
   crossing a corner counts against it. */
async function coordInk(page) {
  const res = await page.evaluate(() => {
    const R = __cr.renderer, cv = document.getElementById("cv2"), ctx = cv.getContext("2d");
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const cr = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const rgb = (s) => s[0] === "#" ? [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16)) : s.match(/\d+/g).slice(0, 3).map(Number);
    const P = CanvasRenderingContext2D.prototype, fT = P.fillText, out = [];
    const keep = { skin: R.skin, o: R.orientation, board: new Int8Array(R.board) };
    for (const skin of Skins.PRESETS) for (const o of [1, -1]) {
      R.setSkin(skin); R.setOrientation(o); R.setPosition(new Int8Array(128));
      const calls = [];
      /* the plate goes down, the ink is written down instead of drawn */
      P.fillText = function (t, x, y) {
        if (this === ctx) calls.push({ t, x, y, ink: this.fillStyle, fs: parseFloat(this.font.match(/(\d+(\.\d+)?)px/)[1]),
                                       al: this.textAlign, bl: this.textBaseline, w: this.measureText(t).width });
      };
      R.dirty = true; R.frame();
      P.fillText = fT;
      const dpr = cv.width / cv.clientWidth, px = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let worst = 99, what = "", fs = 99;
      for (const c of calls) {
        fs = Math.min(fs, c.fs);
        const li = lum(rgb(c.ink)), x0 = c.al === "left" ? c.x : c.x - c.w, y0 = c.bl === "top" ? c.y : c.y - c.fs, rs = [];
        for (let y = Math.floor(y0 * dpr); y < Math.ceil((y0 + c.fs) * dpr); y++)
          for (let x = Math.floor(x0 * dpr); x < Math.ceil((x0 + c.w) * dpr); x++) {
            const i = (y * cv.width + x) * 4; rs.push(cr(li, lum([px[i], px[i + 1], px[i + 2]])));
          }
        rs.sort((a, b) => a - b);
        const p10 = rs[Math.floor(rs.length * 0.1)];
        if (p10 < worst) { worst = p10; what = c.t; }
      }
      out.push({ skin: skin.id, o, n: calls.length, worst: +worst.toFixed(2), what, fs, cell: R.cell });
    }
    R.setSkin(keep.skin); R.setOrientation(keep.o); R.setPosition(keep.board); R.dirty = true; R.frame();
    return out;
  });
  const low = res.filter((r) => r.n !== 16 || r.worst < 4.5);
  ok("2d: every coordinate on every house skin clears 4.5:1 against the pixels really under it (" +
     res.length + " boards, worst " + Math.min.apply(null, res.map((r) => r.worst)).toFixed(2) + ")",
     low.length === 0, JSON.stringify(low));
  ok("2d: …in letters at least max(11, a quarter of a square) px", res.every((r) => r.fs >= Math.max(11, Math.round(r.cell * 0.24))),
     JSON.stringify(res[0]));
}
