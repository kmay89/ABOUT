/* open-check.js — dev-only. Opens every new room in a real browser and plays
   the first thirty seconds of it.

   Everything else in tools/ runs in node, which is exactly why this exists.
   Node can prove the rules and the ladders; it cannot prove that the page
   loads. A typo in an element id, a script tag in the wrong order, a canvas
   context asked for twice — none of those are visible to a rules check and
   all of them are the difference between a working room and a black screen.

   The domino room's `room-check.js` learned this the expensive way: it found
   two faults nothing in node could, and one of them needed a *screenshot*
   because a black board on brown felt still passes "is there more than one
   colour on the canvas".

   So this is deliberately shallow and deliberately real. For each room it
   opens the page, dismisses the splash, plays a few moves the way a finger
   would, opens every sheet the tray can open, and fails on **any** console
   error or unhandled rejection. Then it checks the canvas actually has
   something on it, because a room that throws no errors and draws nothing is
   the failure mode a smoke test is most likely to miss.

   The well asks one more question than the others, because it is the one
   room here whose job includes not hurting anybody's eyes: it watches the
   splash demo for ten seconds and fails on anything that flashes (see
   flashCheck, below). And because it draws with WebGL2, whose canvas has no
   2D context to read back, its "is anything drawn" is answered from a
   screenshot instead.

   Needs `playwright-core` (`npm i --no-save playwright-core`), or a global
   `playwright` install, and a Chromium. Without either it says so and exits
   0, so it is a bonus rather than a barrier — nothing it installs is ever
   shipped, and the rooms themselves have no dependencies at all.

   Run: node tools/open-check.js            every room
        node tools/open-check.js well       just the ones named             */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
/* OPEN_CHECK_PORT moves it, for a machine where 8391 is somebody else's */
const PORT = +process.env.OPEN_CHECK_PORT || 8391;
/* which of the 3D well's tiers to watch for flashes (see the well's entry) */
const WELL_TIER = /^(full|balanced|simple)$/.test(process.env.WELL_TIER || "") ? process.env.WELL_TIER : "simple";

let pw = null;
for (const name of ["playwright-core", "playwright",
                    path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "playwright")]) {
  try { pw = require(name); break; } catch (e) { /* try the next */ }
}
if (!pw) {
  console.log("\nplaywright-core isn't installed — skipping the browser check.");
  console.log("  npm i --no-save playwright-core\n");
  process.exit(0);
}

const TYPES = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".png": "image/png", ".webmanifest": "application/manifest+json",
  ".json": "application/json", ".svg": "image/svg+xml"
};

/* every sheet the well's menu reaches */
const WELL_MENU = ["#mModes", "#mSettings", "#mMoves", "#mLearn", "#mLog"];

/* the rooms, and what to do once each one is open. Every step is a thing a
   finger could do; nothing reaches into the game's internals. */
const ROOMS = [
  { game: "stratego", start: "#goSolo", canvas: "#board",
    taps: [[0.3, 0.85], [0.5, 0.85]],
    menu: ["#mArmy", "#mLevel", "#mLook", "#mLearn", "#mTogether"], wait: 900 },
  { game: "yahtzee", start: "#goSolo", canvas: "#board",
    press: ["#btnRoll"], taps: [[0.5, 0.93], [0.5, 0.71]],
    /* writing a nought asks first, and which row 0.71 lands on depends on the
       phone — so the confirmation is dismissed if it turns up, which exercises
       that path rather than tiptoeing round it */
    dismiss: ["#askYes"],
    menu: ["#mSetup", "#mLook", "#mLearn", "#mTogether"], wait: 900 },
  { game: "checkers", start: "#goSolo", canvas: "#board",
    taps: [[0.5, 0.72], [0.42, 0.62]],
    menu: ["#mLevel", "#mLook", "#mLearn", "#mTogether"] },
  { game: "othello", start: "#goSolo", canvas: "#board",
    taps: [[0.5, 0.37], [0.63, 0.5]],
    menu: ["#mLevel", "#mLook", "#mLearn", "#mTogether"] },
  { game: "halma", start: "#goSolo", canvas: "#board",
    taps: [[0.5, 0.86], [0.5, 0.79]],
    menu: ["#mSetup", "#mLook", "#mLearn", "#mTogether"] },
  { game: "hearts", start: "#goSolo", canvas: "#table",
    taps: [[0.3, 0.9], [0.5, 0.9], [0.7, 0.9]],
    menu: ["#mLevel", "#mRules", "#mLook", "#mLearn", "#mTogether"] },
  { game: "euchre", start: "#goSolo", canvas: "#table",
    taps: [[0.4, 0.9], [0.6, 0.9]],
    menu: ["#mLevel", "#mRules", "#mLook", "#mLearn", "#mTogether"] },
  { game: "solitaire", start: "#goPlay", canvas: "#table",
    taps: [[0.1, 0.12], [0.1, 0.12], [0.5, 0.6]],
    menu: ["#mLook", "#mLearn"], wait: 4200 },
  { game: "minesweeper", start: "#goPlay", canvas: "#field",
    taps: [[0.5, 0.5], [0.3, 0.4]],
    menu: ["#mLevel", "#mLook", "#mLearn"] },
  { game: "breaker", start: "#goPlay", canvas: "#field",
    taps: [[0.5, 0.8], [0.5, 0.8]],
    menu: [] },
  /* The two party rooms have no canvas at all — the whole interface is one
     word as large as the phone will draw it, which a real element does far
     better. So they are checked on the element that has to have text in it,
     and the drawing check is skipped rather than faked. */
  { game: "viuda", start: "#goSolo", canvas: "#table",
    taps: [[0.5, 0.44], [0.5, 0.9]],
    press: ["#btnTake"],
    menu: ["#mSetup", "#mLook", "#mLearn", "#mTogether"], wait: 900 },
  { game: "catchphrase", start: "#goPlay", text: "#word",
    press: ["#btnGo"], taps: [],
    menu: ["#mSetup", "#mLearn"], wait: 700 },
  { game: "guesstures", start: "#goPlay", text: "#card",
    press: ["#btnGo"], taps: [],
    menu: ["#mSetup", "#mLearn"], wait: 700 },
  /* The well, twice. Once as it is meant to be seen, in WebGL2 on #cv3, and
     once with ?gfx=2d on #cv2 — the Canvas2D picture that everything without
     WebGL gets: Lockdown Mode, old phones, three lost contexts in a minute.
     Both run in a browser that can actually hand out WebGL2 (see glBrowser),
     so the 2D one is 2D because it was asked to be, not because it had no
     choice. Each has to show only its own canvas, draw on it, take taps,
     open every sheet, and get through ten seconds of its demo without
     flashing. The taps are on the well itself, where a tap turns the piece.

     Both at a device pixel ratio of 1 rather than the 2 every other room
     gets. A machine running this usually has no GPU, so every pixel of a
     lit 3D well is drawn by the CPU, four times over at 2× — and none of
     these questions (does it draw, does it answer, does it flash) depends
     on how sharp the picture is. How fast it is on a real phone is a
     question for a real phone.

     The WebGL one is opened with ?gl=soft, the room's test hook: the 3D
     renderer refuses a software GL on purpose (a phone without a real GPU
     should get the 2D well, not a slideshow), and SwiftShader is exactly
     that, so without the hook this entry would quietly test the 2D well.

     And it is watched at the 3D renderer's Simple tier, set the way a
     player sets it (the Graphics setting, stored before the page loads),
     not through any test hook. A machine with no GPU draws the Full tier at
     under five frames a second, and a flash check that can only see five
     frames a second cannot see a three-a-second flash — it would be a
     verdict from a check that could not look. Every tier's effects pass
     through the same flash governor in gfx3d.js, so the Simple tier is the
     one this machine can honestly watch. On a machine with a real GPU,
     WELL_TIER=full node tools/open-check.js well watches the Full tier. */
  { game: "well", label: "well, in WebGL2 (?gl=soft, " + WELL_TIER + " tier)", query: "?gl=soft", start: "#goPlay", canvas: "#cv3", other: "#cv2",
    store: { well: JSON.stringify({ v: 1, prefs: { graphics: WELL_TIER } }) },
    gl: true, flash: true, dpr: 1, taps: [[0.35, 0.5], [0.65, 0.5], [0.5, 0.4]],
    menu: WELL_MENU, menuReturns: "#ovMenu", wait: 1500 },
  { game: "well", label: "well, in 2D (?gfx=2d)", query: "?gfx=2d", start: "#goPlay", canvas: "#cv2", other: "#cv3",
    gl: true, flash: true, dpr: 1, taps: [[0.35, 0.5], [0.65, 0.5], [0.5, 0.4]],
    menu: WELL_MENU, menuReturns: "#ovMenu", wait: 1500 }
];
/* node tools/open-check.js well checks just the rooms named */
const ONLY = process.argv.slice(2);
const CHOSEN = ONLY.length ? ROOMS.filter((r) => ONLY.indexOf(r.game) >= 0) : ROOMS;
const UNKNOWN = ONLY.filter((g) => !ROOMS.some((r) => r.game === g));
if (UNKNOWN.length) {
  /* a typo would otherwise check nothing and call it a pass */
  console.log("\nno such room: " + UNKNOWN.join(", ") + "\n");
  process.exit(1);
}

/* shut every open sheet, however it got opened */
async function clearSheets(page) {
  for (let i = 0; i < 4; i++) {
    const open = page.locator(".ov:not(.hide)").first();
    if (!(await open.count())) return;
    const close = open.locator("[data-close]").first();
    if (!(await close.count())) return;
    await close.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(160);
  }
}

let fails = 0;
function ok(what, cond, detail) {
  if (cond) console.log("  ✓ " + what);
  else { fails++; console.log("  ✗ " + what + (detail ? " — " + detail : "")); }
}

/* a static server, so the service worker and the modules behave as they will
   in the wild — file:// is a different set of rules and proves nothing */
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("no");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "text/plain" });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  let browser;
  try {
    browser = await pw.chromium.launch({ executablePath: findChromium() });
  } catch (e) {
    console.log("\nno Chromium to drive — skipping the browser check.\n  " + e.message + "\n");
    server.close();
    process.exit(0);
  }

  /* A headless Chromium refuses a WebGL2 context asked for with
     failIfMajorPerformanceCaveat — its default software path is exactly that
     caveat — and the well asks that way on purpose, so a slow GPU gets the 2D
     renderer rather than a slideshow. SwiftShader asked for by name is
     allowed, so the rooms that draw with WebGL get a browser of their own
     that can give them one. Everything else keeps the one it always had.

     That browser also draws 2D canvases on the CPU, which is what Chromium
     does anyway on a machine whose GPU it doesn't trust. With no GPU at all,
     the alternative is Canvas2D emulated through SwiftShader, and the well's
     2D renderer ran at half a frame a second that way and at seven frames a
     second this way — the same picture, but only one of them can be watched
     for flashes. */
  let glBrowser = null;

  for (const room of CHOSEN) {
    console.log("\n──  " + (room.label || room.game));
    if (room.gl && !glBrowser) {
      glBrowser = await pw.chromium.launch({ executablePath: findChromium(),
        args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-accelerated-2d-canvas"] });
    }
    const ctx = await (room.gl ? glBrowser : browser).newContext({ viewport: { width: 412, height: 850 },
                                           hasTouch: true, deviceScaleFactor: room.dpr || 2 });
    /* So the flash check can read a WebGL canvas between frames rather than
       racing the compositor for it. Nothing a player sees changes. */
    if (room.flash) await ctx.addInitScript(keepDrawingBuffer);
    /* settings a player could have chosen, in place before the page reads them */
    if (room.store) await ctx.addInitScript((kv) => {
      try { for (const k in kv) localStorage.setItem(k, kv[k]); } catch (e) {}
    }, room.store);
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));

    try {
      await page.goto("http://localhost:" + PORT + "/" + room.game + "/" + (room.query || ""), { waitUntil: "load" });
      await page.waitForTimeout(400);
      ok("the page loads", true);

      /* before anything is pressed: the demo behind the splash is what a
         person sees first, and it plays Quads */
      if (room.flash) await flashCheck(page, room.canvas, 10);

      await page.click(room.start);
      await page.waitForTimeout(room.wait || 700);
      ok("it starts", true);

      /* the canvas has to be the right size before anything is tapped at a
         fraction of it — a zero-height canvas swallows every tap silently */
      let box = null;
      if (room.canvas) {
        box = await page.locator(room.canvas).boundingBox();
        ok("the board has a size", box && box.width > 100 && box.height > 100,
           box ? Math.round(box.width) + "×" + Math.round(box.height) : "no box");
      }
      /* two canvases, and only ever one of them on screen */
      if (room.other) {
        const mine = await page.locator(room.canvas).isVisible();
        const theirs = await page.locator(room.other).isVisible();
        ok("it draws on " + room.canvas + " and only there", mine && !theirs,
           [mine ? "" : room.canvas + " is hidden", theirs ? room.other + " is showing too" : ""]
             .filter(Boolean).join("; "));
      }

      for (const sel of room.press || []) {
        await page.click(sel);
        await page.waitForTimeout(700);
      }

      /* (a board with no box has already failed above; tapping it would
         only throw, and bury that failure under a TypeError) */
      for (const [fx, fy] of box ? room.taps : []) {
        await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
        await page.waitForTimeout(500);
      }
      if (room.taps.length) ok("it takes taps on the board", !!box, box ? "" : "there was no board to tap");

      /* a room whose interface is text rather than pixels: the check is that
         the text is actually there, which is the same question the drawing
         check asks of a canvas */
      if (room.text) {
        const words = await page.locator(room.text).textContent();
        ok("the word is on the screen", !!(words && words.trim().length > 1),
           words ? JSON.stringify(words.trim()) : "empty");
      }

      /* anything the taps may have raised, answered the way a finger would */
      for (const sel of room.dismiss || []) {
        const el = page.locator(sel);
        if (await el.count() && await el.isVisible()) { await el.click(); await page.waitForTimeout(400); }
      }

      /* And then clear whatever is still covering the board before going near
         the menu — because playing a game can *end* it.

         This was a real intermittent failure and it took eight runs to catch:
         minesweeper failed about a quarter of the time with a thirty-second
         click timeout on the menu button. The second tap lands where it lands,
         and about one time in four it lands on a mine — the game ends, the
         end-of-game sheet comes up, and a sheet over the tray is a tray you
         cannot tap. Playwright waits for the button to become actionable and
         it never does.

         Nothing was wrong with the room. The check was assuming its own taps
         were harmless, which is exactly the assumption a check that plays a
         game is not allowed to make. */
      await clearSheets(page);

      /* Every sheet the menu can reach, opened and shut the way a finger
         does it. The menu has to be re-opened before each one, because
         choosing an item closes it — which is the behaviour, and a check that
         did not model it would just click into thin air and pass. */
      let sheetsOk = true, why = "";
      for (const sel of room.menu) {
        /* A room whose menu comes back when a sheet chosen from it closes
           (the well does: changing two settings shouldn't mean finding the
           pause button twice) is already showing it; every other room needs
           the button pressed again. Which one this room does is a claim the
           check holds it to, below. */
        if (!(room.menuReturns && await page.locator(room.menuReturns + ":not(.hide)").count())) {
          await page.click("#btnMenu");
          await page.waitForTimeout(220);
        }
        const el = page.locator(sel);
        if (await el.count() === 0) { sheetsOk = false; why = "no " + sel; break; }
        await el.click();
        await page.waitForTimeout(300);
        /* the well stacks a sheet by moving it to the end of the page */
        const open = room.menuReturns ? page.locator(".ov:not(.hide)").last() : page.locator(".ov:not(.hide)").first();
        if (!(await open.count())) { sheetsOk = false; why = sel + " opened nothing"; break; }
        const close = open.locator("[data-close]").first();
        if (await close.count()) await close.click();
        await page.waitForTimeout(180);
        if (room.menuReturns && !(await page.locator(room.menuReturns + ":not(.hide)").count())) {
          sheetsOk = false; why = "closing what " + sel + " opened didn't bring the menu back"; break;
        }
      }
      /* and leave nothing covering the board */
      await clearSheets(page);
      ok("every sheet the menu reaches opens and shuts", sheetsOk, why);

      /* and the thing a smoke test most often misses: is anything drawn? */
      if (room.canvas) {
      /* Four thin bands across the full width rather than one square in the
         middle. Reading back a whole retina surface is tens of megabytes and
         the browser refuses outright — but one middle square is worse than
         useless: in the brick game the middle of the field is the empty gap
         between the wall and the paddle, and it is one flat colour when
         everything is working perfectly. A check that cannot tell "empty by
         design" from "blank because it never drew" is not a check. */
      let painted = await page.evaluate((sel) => {
        const cv = document.querySelector(sel);
        const g = cv.getContext("2d");
        if (!g) return { ok: false, why: "no 2d context" };
        const seen = new Set();
        for (const frac of [0.2, 0.4, 0.6, 0.8]) {
          const h = Math.min(60, cv.height);
          const y = Math.max(0, Math.min(cv.height - h, (cv.height * frac - h / 2) | 0));
          const d = g.getImageData(0, y, cv.width, h).data;
          for (let i = 0; i < d.length; i += 4 * 29) {
            seen.add(d[i] + "," + d[i + 1] + "," + d[i + 2]);
          }
        }
        return { ok: seen.size > 6, n: seen.size };
      }, room.canvas);
      /* a WebGL canvas has no 2D context to read; ask a screenshot instead */
      if (painted.why === "no 2d context") painted = await drawnInScreenshot(page, room.canvas);
      ok("the board is actually drawn, not blank", painted.ok,
         painted.why || (painted.n + " distinct colours sampled" + (painted.how ? ", " + painted.how : "")));
      }

      ok("no console errors", errors.length === 0, errors.slice(0, 2).join(" | "));
    } catch (e) {
      ok("plays without throwing", false, String(e).split("\n")[0]);
    }
    await ctx.close();
  }

  await browser.close();
  if (glBrowser) await glBrowser.close();
  server.close();
  console.log("");
  if (fails) { console.log("FAILED: " + fails + " problem" + (fails === 1 ? "" : "s")); process.exit(1); }
  console.log("every room opens, draws, and takes a tap");
})();

/* ================================================================
   reading a WebGL canvas
   ================================================================ */

/* Runs in the page before any of its scripts. A WebGL canvas normally
   throws its picture away once the frame is on screen, so a read taken
   between frames sees nothing; keeping it changes nothing anybody sees. */
function keepDrawingBuffer() {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (/^(webgl2?|experimental-webgl)$/.test(type)) attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
    return get.call(this, type, attrs);
  };
}

/* "Is anything drawn?", asked of a screenshot of the canvas's box. For the
   moment of the picture everything except the canvas is hidden — the HUD's
   antialiased text alone has more than six colours in it, and a check that
   a label could pass is not a check of the board. Then the same four bands
   as the 2D check, read out of the PNG. */
async function drawnInScreenshot(page, sel) {
  await page.evaluate((sel) => {
    const cv = document.querySelector(sel);
    window.__openCheckHidden = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el === cv || el.contains(cv)) continue;
      window.__openCheckHidden.push([el, el.style.visibility]);
      el.style.visibility = "hidden";
    }
  }, sel);
  await page.waitForTimeout(120);
  const box = await page.locator(sel).boundingBox();
  let shot = null;
  try { shot = await page.screenshot({ clip: box, scale: "css" }); }
  finally {
    await page.evaluate(() => {
      for (const [el, v] of window.__openCheckHidden || []) el.style.visibility = v;
      delete window.__openCheckHidden;
    });
  }
  const img = decodePng(shot);
  const seen = new Set();
  for (const frac of [0.2, 0.4, 0.6, 0.8]) {
    const h = Math.min(30, img.height);
    const y0 = Math.max(0, Math.min(img.height - h, (img.height * frac - h / 2) | 0));
    for (let y = y0; y < y0 + h; y++) {
      for (let x = 0; x < img.width; x += 7) {
        const i = (y * img.width + x) * 4;
        seen.add(img.data[i] + "," + img.data[i + 1] + "," + img.data[i + 2]);
      }
    }
  }
  return { ok: seen.size > 6, n: seen.size, how: "from a screenshot" };
}

/* A PNG decoder: just enough for what Chromium writes (8-bit RGB or RGBA,
   not interlaced). Node's zlib does the inflating; the five row filters are
   undone here. */
function decodePng(buf) {
  let p = 8, w = 0, h = 0, type = -1, depth = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (kind === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9];
      if (data[12]) throw new Error("an interlaced PNG");
    } else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    p += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6)) throw new Error("a PNG of colour type " + type + ", depth " + depth);
  const bpp = type === 6 ? 4 : 3, stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), row = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    raw.copy(row, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      row[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      out[o] = row[x * bpp]; out[o + 1] = row[x * bpp + 1]; out[o + 2] = row[x * bpp + 2];
      out[o + 3] = bpp === 4 ? row[x * bpp + 3] : 255;
    }
    const t = prev; prev = row; row = t;
  }
  return { width: w, height: h, data: out };
}

/* ================================================================
   the flash check
   ================================================================
   WCAG 2.3.1 calls a pair of opposing changes in relative luminance of 0.1
   or more a flash, and allows three a second; the well's own rule is
   stricter and allows itself fewer. So: sample the mean relative luminance
   about twenty times a second for ten seconds — over the whole canvas, over
   the well itself, and over every patch of the screen about 150 CSS pixels
   square (roughly the area past which a flash counts as a large one, on the
   strict reading) — and fail if any one-second window anywhere holds more
   than two opposing swings of 0.1. The demo plays while it watches, and the
   demo takes Quads, which are the brightest thing the well does. */
async function flashCheck(page, sel, seconds) {
  const res = await page.evaluate(({ sel, ms }) => new Promise((done) => {
    const cv = document.querySelector(sel);
    if (!cv) { done({ why: "no " + sel }); return; }
    const lin = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    const cssW = Math.max(1, cv.clientWidth), cssH = Math.max(1, cv.clientHeight);
    /* One sample point per 6 CSS pixels: a flash big enough to matter covers
       hundreds of them. Plain bilinear, and the small canvas left on the GPU:
       "high" smoothing, or a canvas kept for frequent reading, made each
       sample cost 70–200 ms here, which is a sampler too slow to see the
       thing it is looking for. This way it is about 2 ms. */
    const sw = Math.max(8, Math.round(cssW / 6)), sh = Math.max(8, Math.round(cssH / 6));
    const small = document.createElement("canvas");
    small.width = sw; small.height = sh;
    const g = small.getContext("2d");
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "low";
    /* what shows through a transparent canvas is the page behind it */
    let bg = getComputedStyle(document.body).backgroundColor;
    if (!bg || /rgba\(.*,\s*0\)$|transparent/.test(bg)) bg = "#000";
    /* the well's own rectangle, from the room's layout if it publishes one,
       otherwise the middle of the canvas, where a well always is */
    let well = { x: 0.2, y: 0.12, w: 0.6, h: 0.76 }, how = "the middle of the canvas";
    try {
      if (window.Layout && typeof Layout.compute === "function") {
        const L = Layout.compute(cssW, cssH, { previews: 5, keep: true, safe: { t: 0, r: 0, b: 0, l: 0 },
                                               hudTop: 0, buttons: false, scale: 1 });
        if (L && L.well && L.well.w > 0 && L.well.h > 0) {
          well = { x: L.well.x / cssW, y: L.well.y / cssH, w: L.well.w / cssW, h: L.well.h / cssH };
          how = "the well, as Layout places it";
        }
      }
    } catch (e) { /* the middle will do */ }
    const tile = 25, tx = Math.ceil(sw / tile), ty = Math.ceil(sh / tile);
    const wx0 = Math.floor(well.x * sw), wy0 = Math.floor(well.y * sh);
    const wx1 = Math.ceil((well.x + well.w) * sw), wy1 = Math.ceil((well.y + well.h) * sh);
    const said = new Set();
    const mo = new MutationObserver(() => {
      for (const id of ["labels", "say"]) {
        const el = document.getElementById(id);
        const t = el && el.textContent.trim();
        if (t) said.add(t.slice(0, 40));
      }
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    /* Sampled from an animation frame, at most every 45 ms, rather than on a
       timer: a read of a canvas makes the browser finish drawing it first,
       and one that lands mid-frame waits for the whole frame. Read just
       after a frame, it doesn't — on a software GPU that is the difference
       between five samples a second and eighteen. */
    const out = [];
    let t0 = 0, last = -1e9, warm = 0;
    /* The demo has to be playing before it can be watched. A room that
       compiles its shaders on the splash (the well does, so that it never
       has to during play) can spend the first seconds not drawing at all —
       many seconds, on a software GPU — and ten seconds of that is ten
       seconds of nothing. So: wait until frames come at five a second or
       better, for up to half a minute, and then start the clock. */
    const w0 = performance.now(), recent = [];
    (function warmUp() {
      const now = performance.now();
      recent.push(now);
      while (recent.length && now - recent[0] > 1000) recent.shift();
      if (recent.length >= 5 || now - w0 > 30000) { warm = now - w0; t0 = now; requestAnimationFrame(sample); return; }
      requestAnimationFrame(warmUp);
    })();
    function sample() {
      const now = performance.now() - t0;
      if (now > ms) { mo.disconnect(); done({ out, how, tx, ty, patch: tile * cssW / sw, said: [...said], warm }); return; }
      if (now - last < 45) { requestAnimationFrame(sample); return; }
      last = now;
      g.fillStyle = bg; g.fillRect(0, 0, sw, sh);
      g.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, sw, sh);
      const d = g.getImageData(0, 0, sw, sh).data;
      const tiles = new Float64Array(tx * ty), counts = new Float64Array(tx * ty);
      let all = 0, inWell = 0, nWell = 0;
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        const L = 0.2126 * lin[d[i]] + 0.7152 * lin[d[i + 1]] + 0.0722 * lin[d[i + 2]];
        all += L;
        if (x >= wx0 && x < wx1 && y >= wy0 && y < wy1) { inWell += L; nWell++; }
        const k = Math.floor(y / tile) * tx + Math.floor(x / tile);
        tiles[k] += L; counts[k]++;
      }
      const row = [now, all / (sw * sh), nWell ? inWell / nWell : 0];
      for (let k = 0; k < tiles.length; k++) row.push(tiles[k] / Math.max(1, counts[k]));
      out.push(row);
      requestAnimationFrame(sample);
    }
  }), { sel, ms: seconds * 1000 });

  if (res.why) { ok("its demo can be watched for flashes", false, res.why); return; }
  const n = res.out.length, rate = n / seconds;
  /* A check that looked a couple of times a second has not looked. Five a
     second is the floor, because below it a strobe at WCAG's limit of three
     flashes a second can alias into something that looks calm (sampled
     four times a second, it reads as one slow flash). Twenty is the aim. */
  ok("the demo was watched for " + seconds + " s (" + n + " samples, " + rate.toFixed(1) + " a second)", rate >= 5,
     "too few to see a flash: samples are taken after frames, and the page is drawing too slowly here to judge");
  if (res.warm > 1500) console.log("  · its demo took " + (res.warm / 1000).toFixed(1) + " s to start drawing steadily");
  if (rate < 5) return;     /* and no verdict on flashing from a check that could not see */
  const names = ["the whole canvas", res.how].concat(Array.from({ length: res.tx * res.ty }, (_, k) =>
    "the " + Math.round(res.patch) + " px patch at " + Math.round((k % res.tx) * res.patch) + "," +
    Math.round(Math.floor(k / res.tx) * res.patch) + " (CSS px, from the top left)"));
  let worst = { count: 0, at: 0, where: "" }, lo = 1, hi = 0;
  for (let k = 0; k < names.length; k++) {
    const series = res.out.map((r) => [r[0], r[k + 1]]);
    if (k < 2) for (const r of series) { lo = Math.min(lo, r[1]); hi = Math.max(hi, r[1]); }
    const swings = swingsOf(series, 0.1);
    for (let i = 0; i < swings.length; i++) {
      let j = i;
      while (j < swings.length && swings[j] - swings[i] < 1000) j++;
      if (j - i > worst.count) worst = { count: j - i, at: swings[i], where: names[k] };
    }
  }
  ok("nothing in it flashes (at most 2 opposing swings of 0.1 in any second; worst " + worst.count + ")",
     worst.count <= 2,
     worst.count + " swings within a second of " + (worst.at / 1000).toFixed(1) + " s, over " + worst.where);
  console.log("  · luminance ranged " + lo.toFixed(3) + "–" + hi.toFixed(3) + " over the canvas and the well" +
              (res.said.length ? "; the demo said " + res.said.slice(0, 6).join(", ") : ""));
}
/* The swings in a series: the times at which it has moved at least `by`
   from its last turning point, in the opposite direction to the swing
   before. A slow drift of 0.1 over a whole minute is one swing, and harmless;
   a strobe is a swing every frame. */
function swingsOf(series, by) {
  const out = [];
  if (!series.length) return out;
  let dir = 0, ext = series[0][1], lo = ext, hi = ext;
  for (const [t, v] of series) {
    if (dir === 0) {
      lo = Math.min(lo, v); hi = Math.max(hi, v);
      if (v - lo >= by) { dir = 1; ext = v; out.push(t); }
      else if (hi - v >= by) { dir = -1; ext = v; out.push(t); }
    } else if (dir > 0) {
      if (v > ext) ext = v;
      else if (ext - v >= by) { dir = -1; ext = v; out.push(t); }
    } else {
      if (v < ext) ext = v;
      else if (v - ext >= by) { dir = 1; ext = v; out.push(t); }
    }
  }
  return out;
}

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  for (const dir of fs.readdirSync(base)) {
    for (const rel of ["chrome-linux/chrome", "chrome-linux/headless_shell"]) {
      const p = path.join(base, dir, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}
