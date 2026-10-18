/* touch-check.js — dev-only. Does a finger on the board move a piece?

   Every other check in this folder plays its moves through the dev
   handle, which is the fastest way to reach a position and the one way
   that cannot notice the board has stopped listening. It had: a sound
   rewrite left the board's pointerdown calling a helper that no longer
   existed, so every tap threw before it was recorded, nothing could be
   selected, and three taps in eight seconds raised the recovery card.
   Every test was green, because no test had touched the board.

   So this one only touches it. On a phone-sized screen, in 3D and in
   2D, it taps pieces and squares the way a thumb does and reads back
   what the game recorded — and fails on a single page error, or on the
   recovery card, at any point.

   Needs `playwright-core`; the browser is already on the machine. If
   either is missing it says so and exits 0.

   Run: node chess/tools/touch-check.js                                 */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
if (!CHROME) { console.log("no chromium on this machine — skipping the touch check."); process.exit(0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the touch check.");
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

/* where on the stage a square is, asked of the renderer itself: the
   middle of every point it maps to that square */
const WHERE = `(sq) => {
  const R = __cr.renderer, st = document.getElementById('stage');
  const w = st.clientWidth, h = st.clientHeight;
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
    if (R.screenToSquare(x, y) === sq) { sx += x; sy += y; n++; }
  }
  return n ? { x: sx / n, y: sy / n } : null;
}`;
const SQ = (name) => (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

  try {
    for (const dim of ["3d", "2d"]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
        hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push("" + e.message));
      page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
      await page.goto(base + "/chess/" + (dim === "2d" ? "#force2d" : ""), { waitUntil: "networkidle" });
      await page.waitForTimeout(1400);
      await page.tap("#mPass");
      await page.waitForTimeout(300);
      await page.tap("#newStart");
      await page.waitForTimeout(1600);

      const box = await page.locator("#stage").boundingBox();
      const tap = async (name) => {
        const at = await page.evaluate(([f, s]) => eval(f)(s), [WHERE, SQ(name)]);
        if (!at) return false;
        await page.touchscreen.tap(box.x + at.x, box.y + at.y);
        await page.waitForTimeout(140);
        return true;
      };
      const settle = () => page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 4000 })
        .catch(() => {});

      /* a tap on a piece picks it up */
      await tap("e2");
      const picked = await page.evaluate(() => __cr.renderer.hi.selected);
      ok(dim + ": tapping a pawn picks it up", picked === SQ("e2"), "selected " + picked);
      ok(dim + ": …and shows where it can go", await page.evaluate(() => __cr.renderer.hi.legal.length) === 2);

      /* and a tap on a square puts it down there */
      await tap("e4");
      await settle();
      let sans = await page.evaluate(() => __cr.game.played.map((r) => r.san));
      ok(dim + ": tapping a square plays the move", sans.join(" ") === "e4", sans.join(" "));

      /* a short game, every move by thumb: changing your mind, a capture,
         and a mate */
      const script = [["e7", "e5"], ["f1", "c4"], ["b8", "c6"], ["d1", "h5"],
                      ["g8", "f8"] /* not a move: a change of heart */, ["g8", "f6"],
                      ["h5", "f7"]];
      for (const [a, b] of script) {
        await tap(a); await tap(b); await settle();
      }
      sans = await page.evaluate(() => __cr.game.played.map((r) => r.san));
      ok(dim + ": a whole game can be played by tapping",
         sans.join(" ") === "e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#", sans.join(" "));
      await page.waitForTimeout(1500);
      ok(dim + ": the mate ends the game", await page.isVisible("#ovEnd"));

      /* a burst of taps on a finished board does nothing alarming */
      await page.tap("#endReview");
      await page.waitForTimeout(300);
      for (let i = 0; i < 6; i++) { await tap(["a1", "h8", "d4", "e5", "b2", "g7"][i]); }
      ok(dim + ": a flurry of taps never raises the recovery card", !(await page.isVisible("#ovRecover")));
      ok(dim + ": nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
      await ctx.close();
    }
  } catch (e) {
    failed++;
    console.log("FAIL  the check itself fell over  → " + (e && e.stack || e));
  }
  await browser.close();
  server.close();
  console.log(failed ? "\n" + failed + " failed" : "\na finger on the board moves a piece, in both dimensions");
  process.exit(failed ? 1 : 0);
})();
