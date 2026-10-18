/* feel-check.js — dev-only. Does the board have weight?

   The feel layer is a set of small answers to things happening: the
   camera taking a thud at a capture, the board holding its breath for a
   few frames as it lands, a fresh game opening on a low shot across the
   board, the man you pick up rising while his choices ripple out from
   him, a man set down rocking once on his base, the men that have been
   taken carried off to a row beside the board, the camera walking
   slowly round a mated king. Every one of them has to start, and every
   one of them has to stop — a board that keeps redrawing because a
   spring never quite came to rest is a phone that gets warm in your
   hand for nothing.

   The curves are checked in Node (motion.js is pure arithmetic). The
   rest is checked in a real browser through the renderers' own
   feelState(), on both boards, with the page's clock stood still and
   stepped by hand so the answers do not depend on how fast this machine
   happens to draw.

   It needs `playwright-core` for the browser half; without it, or
   without chromium, that half says so and is skipped.

   Run: node chess/tools/feel-check.js                                   */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const Move = require("../motion.js");

let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

/* ---------- the curves ---------- */
{
  const t0 = Move.thud(0, 1), mid = Move.thud(60, 1), end = Move.thud(Move.THUD_MS, 1);
  let peak = 0, crossed = false, prev = 0;
  for (let ms = 0; ms < Move.THUD_MS; ms += 4) {
    const y = Move.thud(ms, 1).y;
    peak = Math.max(peak, Math.abs(y));
    if (prev < 0 && y > 0) crossed = true;
    prev = y;
  }
  ok("a thud starts at rest, drops, and is over", t0.y === 0 && mid.y < 0 && !end.live && end.y === 0);
  ok("…comes back through one small overshoot rather than a wobble", crossed && peak < 0.09, "peak " + peak.toFixed(3));
  ok("…and a pawn's is smaller than a queen's",
     Math.abs(Move.thud(60, 0.2).y) < Math.abs(Move.thud(60, 1).y));
  ok("the opening shot starts wide and lands exactly on the player's view",
     Move.swoop(0) === 1 && Move.swoop(Move.SWOOP_MS) === 0 && Move.swoop(Move.SWOOP_MS / 2) < 0.2);
  let mono = true;
  for (let ms = 0; ms < Move.SWOOP_MS; ms += 20) if (Move.swoop(ms + 20) > Move.swoop(ms)) mono = false;
  ok("…without ever turning back on itself", mono);
  ok("a man set down rocks once and is still", Move.settle(40).live && !Move.settle(Move.SETTLE_MS).live &&
     Move.settle(Move.SETTLE_MS).tilt === 0);
  ok("the choices ripple out a ring at a time",
     Move.ripple(40, 0) > 0 && Move.ripple(40, 3) === 0 && Move.ripple(Move.rippleEnd(3) + 1, 3) === 1);
  let over = 0;
  for (let ms = 0; ms < 400; ms += 5) over = Math.max(over, Move.ripple(ms, 0));
  ok("…each one popping in with a small overshoot, not a large one", over > 1 && over < 1.15, over.toFixed(3));
  ok("a man in the hand rises to his height and stays near it",
     Move.hold(0) === 0 && Math.abs(Move.hold(3000) - Move.HOLD_LIFT) < 0.02);
}

/* ---------- the browser ---------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log((CHROME ? "playwright-core is not installed" : "no chromium on this machine") +
              " — skipping the browser half.");
  console.log(failed ? "\nFAILED: " + failed : "\nthe board has weight (curves only)");
  process.exit(failed ? 1 : 0);
}

const ROOT = path.join(__dirname, "..", "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".css": "text/css" };
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

/* the page's clock, stood still and stepped by hand: every renderer
   reads performance.now(), so this is the one knob that makes a slow
   machine and a fast one see the same thing */
const FREEZE = `(() => {
  if (window.__frozen) return;
  const real = performance.now.bind(performance);
  window.__t = real(); window.__frozen = true;
  performance.now = () => window.__t;
})()`;
const STEP = (ms) => `(() => { window.__t += ${ms}; const r = __cr.renderer; r.dirty = true; r.frame(); return r.feelState(); })()`;
const FS = `__cr.renderer.feelState()`;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  try {
    for (const dim of ["3d", "2d"]) {
      const ctx = await browser.newContext({ viewport: { width: 1100, height: 820 } });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errs.push(dim + ": " + e.message));
      page.on("console", (m) => { if (m.type() === "error") errs.push(dim + ": " + m.text()); });
      await page.goto(base + "/chess/?v=0");
      await page.evaluate((d) => localStorage.setItem("chessroom_prefs",
        JSON.stringify({ use3d: d === "3d", scene: "park", fx: "low" })), dim);
      await page.goto(base + "/chess/?v=1");
      await page.waitForFunction(() => document.getElementById("splash").classList.contains("gone"), null, { timeout: 60000 });
      const kind = await page.evaluate(() => __cr.renderer.kind);
      ok(dim + ": the " + dim + " board is the one being drawn", kind === dim, kind);
      await page.evaluate(FREEZE);
      await page.evaluate(() => __cr.startGame("pass", { clockStr: "none" }));

      /* the opening shot */
      let f = await page.evaluate(STEP(1));
      if (dim === "3d") {
        const eye0 = f.eye;
        ok(dim + ": a fresh game opens on the low shot", f.swoop === true);
        f = await page.evaluate(STEP(Move.SWOOP_MS + 50));
        f = await page.evaluate(STEP(16));
        ok(dim + ": …and lands on the player's view, then lets go", f.swoop === false &&
           Math.hypot(f.eye[0] - eye0[0], f.eye[1] - eye0[1], f.eye[2] - eye0[2]) > 0.5);
      } else {
        await page.evaluate(STEP(2500));
      }
      await page.evaluate(STEP(2500));

      /* picking a man up */
      await page.evaluate(() => __cr.renderer.setHighlights({ selected: 0x14, legal: [0x24, 0x34], legalCapt: [] }));
      f = await page.evaluate(STEP(400));
      ok(dim + ": the man you pick up rises off his square", f.sel === 0x14 && (dim === "2d" || f.selLift > 0.1),
         JSON.stringify(f));
      await page.evaluate(STEP(7000));
      const quiet = await page.evaluate(`(() => { window.__t += 16; const r = __cr.renderer; r.dirty = true; r.frame(); return r.frame(); })()`);
      ok(dim + ": …and after a while holds still, so the board can sleep", quiet === false || quiet === 0);
      await page.evaluate(() => __cr.renderer.setHighlights({}));

      /* a capture: the thud, the held breath, the rock on landing */
      const play = (san) => page.evaluate((san) => {
        const g = __cr.game;
        const mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]/, "") === san);
        if (!mv) return false; __cr.commitMove(mv, "local"); return true;
      }, san);
      for (const s of ["e4", "d5"]) { await play(s); await page.evaluate(STEP(3000)); await page.evaluate(STEP(3000)); }
      await play("exd5");
      await page.evaluate(() => { __cr.renderer.kick(1, 0x43); __cr.renderer.hitStop(90); });
      f = await page.evaluate(STEP(10));
      /* (the app's own capture may have thudded too, on a real timer) */
      ok(dim + ": a capture holds the board's breath and the camera takes the blow", f.held && f.kicks >= 1, JSON.stringify(f));
      const c0 = await page.evaluate(() => __cr.renderer.clock());
      await page.evaluate(STEP(40));
      const c1 = await page.evaluate(() => __cr.renderer.clock());
      ok(dim + ": …the board's clock stands still while it is held", c1 === c0, c0 + " → " + c1);
      await page.evaluate(STEP(200));
      const c2 = await page.evaluate(() => __cr.renderer.clock());
      ok(dim + ": …and carries on from exactly where it stopped", c2 > c1 && c2 - c1 < 200, (c2 - c1).toFixed(1));
      for (let i = 0; i < 12; i++) f = await page.evaluate(STEP(250));
      ok(dim + ": the thud is over and nothing is left moving", !f.held && f.kicks === 0 && f.settling === 0, JSON.stringify(f));
      if (dim === "3d") {
        ok(dim + ": the pawn that was taken stands in the row beside the board",
           f.tray && f.tray.black.length === 1 && f.tray.black[0] === -1 && !f.flying, JSON.stringify(f.tray));
        await play("Qxd5");
        f = await page.evaluate(STEP(16));
        for (let i = 0; i < 16 && !f.flying; i++) f = await page.evaluate(STEP(60));
        ok(dim + ": a man just taken is carried over to the row", f.flying === true, JSON.stringify(f));
        for (let i = 0; i < 12; i++) f = await page.evaluate(STEP(250));
        ok(dim + ": …and lands in it, one each side", !f.flying && f.tray.white.length === 1 && f.tray.black.length === 1,
           JSON.stringify(f.tray));
        await page.evaluate(() => __cr.undoPlyForTest(1));
        await page.waitForTimeout(300);
        for (let i = 0; i < 6; i++) await page.evaluate(STEP(400));
        f = await page.evaluate(FS);
        ok(dim + ": a take-back puts the row back as it was", f.tray.white.length === 0 && f.tray.black.length === 1,
           JSON.stringify(f.tray));

        /* the walk round a mated king, which stops when somebody touches */
        await page.evaluate(() => __cr.renderer.drift(true));
        const y0 = (await page.evaluate(STEP(16))).eye;
        for (let i = 0; i < 20; i++) await page.evaluate(STEP(250));
        const y1 = (await page.evaluate(FS)).eye;
        ok(dim + ": after a mate the camera walks slowly round the board", Math.hypot(y1[0] - y0[0], y1[2] - y0[2]) > 0.05);
        await page.evaluate(() => __cr.renderer.orbit(0, 0));
        f = await page.evaluate(STEP(16));
        ok(dim + ": …and stops the moment anybody touches it", f.drift === false);

        /* tilt */
        await page.evaluate(() => __cr.renderer.parallax(1, 0));
        for (let i = 0; i < 30; i++) f = await page.evaluate(STEP(100));
        ok(dim + ": tipping the phone steps the camera, and comes to rest", Math.abs(f.par[0] - 1) < 1e-6);
        await page.evaluate(() => __cr.renderer.parallax(0, 0));
        for (let i = 0; i < 30; i++) f = await page.evaluate(STEP(100));
        ok(dim + ": …and back", f.par[0] === 0);
      }
      await ctx.close();
    }
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the feel check ran", false, e.stack || e.message);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failed ? "\nFAILED: " + failed + " problem" + (failed === 1 ? "" : "s") : "\nthe board has weight, and comes to rest");
  process.exit(failed ? 1 : 0);
})();
