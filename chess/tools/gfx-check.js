/* gfx-check.js — dev-only. Does the room still light up?

   The 3D board grew a pipeline: a shadow pass, an off-screen colour
   target, a bright pass, two blurs and a composite, all of it in WebGL
   1 where half the features are extensions and a framebuffer is allowed
   to come back "incomplete" for reasons the spec declines to list. A
   broken link or an unsupported texture format does not throw — it
   draws a black rectangle, and nobody notices until a player opens the
   board.

   So this opens a real browser and checks the picture rather than the
   code: every program links, the GL error queue stays empty, the frame
   has a range of colours in it rather than one, the shadow pass changes
   what the board looks like, every effects tier draws something, and
   every house skin draws something different from the others.

   It needs `playwright-core`; the browser is already on the machine. If
   either is missing it says so and exits 0, so it stays a bonus rather
   than a barrier.

   Run: node chess/tools/gfx-check.js [--verbose]                       */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
const VERBOSE = process.argv.indexOf("--verbose") >= 0;
let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
if (!CHROME) { console.log("no chromium on this machine — skipping the render check."); process.exit(0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the render check.");
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

/* Everything the browser needs to know about a frame, measured inside
   the page: GL's error queue, and a coarse signature of the pixels.
   readPixels has to happen in the same task as the draw — the drawing
   buffer belongs to the compositor the moment the task ends — so the
   frame and the measurement are one evaluate(). */
const PROBE = `(() => {
  const cv = document.getElementById('cv3');
  const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
  const r = __cr.renderer;
  if (!r || r.kind !== '3d') return { err: -1, note: 'the 3D board is not the one on screen' };
  r.dirty = true;
  r.frame();
  const err = gl.getError();
  const W = 48, H = 36;
  /* read a small block from the middle of the canvas rather than the
     whole thing: enough to tell a picture from a flat fill, cheap
     enough to do once a skin */
  const px = new Uint8Array(W * H * 4);
  const x0 = Math.max(0, (cv.width >> 1) - (W >> 1));
  const y0 = Math.max(0, (cv.height >> 1) - (H >> 1));
  gl.readPixels(x0, y0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let sum = 0, n = W * H, lo = 255, hi = 0, hash = 0;
  for (let i = 0; i < n; i++) {
    const l = (px[i*4] * 77 + px[i*4+1] * 151 + px[i*4+2] * 28) >> 8;
    sum += l; if (l < lo) lo = l; if (l > hi) hi = l;
    hash = (hash * 31 + l) | 0;
  }
  return { err: gl.getError() || err, mean: sum / n, lo, hi, hash, fx: r.fx(), auto: r.autoFx() };
})()`;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 820 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("" + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  try {
    await page.goto(base + "/chess/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.click("#mPass");
    await page.waitForTimeout(300);
    const start = await page.$("#newStart");
    if (start) await start.click();
    await page.waitForTimeout(1800);
    await page.evaluate(() => document.getElementById("toast").classList.remove("show"));

    /* every program compiled and linked, or create() would have thrown
       and the app would be showing the 2D board instead */
    const live = await page.evaluate(() => __cr.renderer && __cr.renderer.kind);
    ok("the 3D board is the one being drawn", live === "3d", "renderer is " + live);
    if (live !== "3d") throw new Error("no 3D renderer to check");

    const first = await page.evaluate(PROBE);
    if (VERBOSE) console.log("      ", JSON.stringify(first));
    ok("a frame draws with an empty GL error queue", first.err === 0, "glGetError " + first.err);
    ok("the frame is a picture, not a fill", first.hi - first.lo > 24,
       "luma spread " + (first.hi - first.lo));
    ok("the frame is neither black nor blown", first.mean > 12 && first.mean < 243,
       "mean luma " + Math.round(first.mean));

    /* the shadow pass is doing something: turning it off has to change
       the picture, or the map is empty and nobody would ever know */
    const withShadow = await page.evaluate(PROBE);
    await page.evaluate(() => __cr.renderer.setFx("low"));
    await page.waitForTimeout(250);
    const noShadow = await page.evaluate(PROBE);
    ok("the shadow pass changes what the board looks like",
       withShadow.hash !== noShadow.hash);
    ok("the simple tier still draws a picture",
       noShadow.err === 0 && noShadow.hi - noShadow.lo > 24,
       "err " + noShadow.err + ", spread " + (noShadow.hi - noShadow.lo));

    /* every tier, in and out, leaves the renderer in a working state */
    for (const tier of ["medium", "high", "low", "high"]) {
      await page.evaluate((t) => __cr.renderer.setFx(t), tier);
      await page.waitForTimeout(250);
      const p = await page.evaluate(PROBE);
      ok("the " + tier + " tier draws cleanly", p.err === 0 && p.fx === tier && p.hi - p.lo > 20,
         JSON.stringify(p));
    }

    /* the markers are drawn by the same shader as the men, down the
       branch that emits light instead of shading a surface — and the
       racing lines build their mesh every frame. Both have their own
       ways of going wrong quietly. */
    await page.evaluate(() => __cr.renderer.setFx("high"));
    await page.waitForTimeout(250);
    const bare = await page.evaluate(PROBE);
    const marked = await page.evaluate(`(() => {
      const r = __cr.renderer;
      r.setHighlights({ selected: 0x34, legal: [0x44, 0x54], legalCapt: [0x64],
                        last: [0x14, 0x34], check: 0x03, hint: [0x01, 0x22] });
      r.setNet([0x60, 0x61, 0x62]);
      r.setLines([{ from: 0x14, to: 0x64, kind: "lane" },
                  { from: 0x01, to: 0x22, kind: "threat", knight: true }]);
      return null;
    })()`);
    void marked;
    const withMarks = await page.evaluate(PROBE);
    ok("highlights, the mate net and the racing lines all draw",
       withMarks.err === 0 && withMarks.hash !== bare.hash, JSON.stringify(withMarks));
    await page.evaluate(() => {
      __cr.renderer.setLines([]); __cr.renderer.setNet([]);
      __cr.renderer.setHighlights({ selected: -1, legal: [], legalCapt: [], last: null, check: -1, hint: null });
    });

    /* every house skin: lights, relief and all, and no two alike */
    const ids = await page.evaluate(() => Skins.PRESETS.map((s) => s.id));
    const seen = new Map();
    for (const id of ids) {
      await page.evaluate((i) => {
        const s = Skins.byId(i);
        __cr.renderer.setSkin(s);
      }, id);
      await page.waitForTimeout(220);
      const p = await page.evaluate(PROBE);
      if (VERBOSE) console.log("      ", id, JSON.stringify(p));
      ok("the " + id + " skin lights up", p.err === 0 && p.hi - p.lo > 14 && p.mean > 4,
         JSON.stringify(p));
      if (seen.has(p.hash)) ok("…and does not look identical to " + seen.get(p.hash), false);
      seen.set(p.hash, id);
    }
    ok("the eight house skins all look different", seen.size === ids.length,
       seen.size + " distinct of " + ids.length);

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the render check ran", false, e.message);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failed ? "\n" + failed + " problem" + (failed > 1 ? "s" : "") + " with the lighting"
                     : "\nthe room lights up, every tier and every skin");
  process.exit(failed ? 1 : 0);
})();
