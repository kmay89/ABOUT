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

   Needs `playwright-core` (`npm i --no-save playwright-core`) and a Chromium.
   Without either it says so and exits 0, so it is a bonus rather than a
   barrier — nothing it installs is ever shipped, and the rooms themselves
   have no dependencies at all.

   Run: node tools/open-check.js                                            */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = 8391;

let pw = null;
try { pw = require("playwright-core"); } catch (e) {
  console.log("\nplaywright-core isn't installed — skipping the browser check.");
  console.log("  npm i --no-save playwright-core\n");
  process.exit(0);
}

const TYPES = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".png": "image/png", ".webmanifest": "application/manifest+json",
  ".json": "application/json", ".svg": "image/svg+xml"
};

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
    menu: ["#mSetup", "#mLearn"], wait: 700 }
];

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

  for (const room of ROOMS) {
    console.log("\n──  " + room.game);
    const ctx = await browser.newContext({ viewport: { width: 412, height: 850 },
                                           hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));

    try {
      await page.goto("http://localhost:" + PORT + "/" + room.game + "/", { waitUntil: "load" });
      await page.waitForTimeout(400);
      ok("the page loads", true);

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

      for (const sel of room.press || []) {
        await page.click(sel);
        await page.waitForTimeout(700);
      }

      for (const [fx, fy] of room.taps) {
        await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
        await page.waitForTimeout(500);
      }
      if (room.taps.length) ok("it takes taps on the board", true);

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
        await page.click("#btnMenu");
        await page.waitForTimeout(220);
        const el = page.locator(sel);
        if (await el.count() === 0) { sheetsOk = false; why = "no " + sel; break; }
        await el.click();
        await page.waitForTimeout(300);
        const open = page.locator(".ov:not(.hide)").first();
        if (!(await open.count())) { sheetsOk = false; why = sel + " opened nothing"; break; }
        const close = open.locator("[data-close]").first();
        if (await close.count()) await close.click();
        await page.waitForTimeout(180);
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
      const painted = await page.evaluate((sel) => {
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
      ok("the board is actually drawn, not blank", painted.ok,
         painted.why || (painted.n + " distinct colours sampled"));
      }

      ok("no console errors", errors.length === 0, errors.slice(0, 2).join(" | "));
    } catch (e) {
      ok("plays without throwing", false, String(e).split("\n")[0]);
    }
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log("");
  if (fails) { console.log("FAILED: " + fails + " problem" + (fails === 1 ? "" : "s")); process.exit(1); }
  console.log("every room opens, draws, and takes a tap");
})();

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
