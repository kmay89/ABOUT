/* perf-check.js — dev-only. Does the board keep its frames?

   A frame rate cannot be measured on a build machine: there is no phone
   here, and the browser draws in software. What can be checked is what
   a frame is made of, and what the room does when frames come slowly.

   In Node, the ladder (Gfx3D.pace) against made-up frame times: a
   smooth device is left alone; a device that is short of pixels gets
   fewer of them, a rung at a time, and stops as soon as it is smooth; a
   device that is capped at thirty frames a second whatever it draws (a
   phone saving its battery) is given every pixel back, because taking
   them never helped; and a device that is really struggling loses a
   tier of effects at once as well.

   In a real browser, the carved board: the shadow map is drawn once and
   then kept while nothing that casts has moved (a still board, a camera
   going round it), drawn again when a man moves, and kept again once he
   has landed; a still frame is a third fewer triangles than one that
   redraws the map; the whole frame stays inside a budget of draw calls
   and triangles; slow frames shrink the picture and a cap gives it
   back; the lens's depth is on in a place and off in the studio.

   Needs `playwright-core` for the browser half; without it, or without
   a browser, the Node half still runs and the rest says so.

   Run: node chess/tools/perf-check.js                                    */
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

/* ---------------- Node: the ladder ---------------- */
global.self = global;
const G = require("../gfx3d.js");
const P = G.PACE, FLOOR = P.RES.length - 1;
const run = (st, gaps) => gaps.map((g) => (st = G.pace(st, g)));
const fresh = () => ({ res: 0, origin: null, locked: false, tier: 2 });

{
  const [a] = run(fresh(), [16.7]);
  ok("a device that keeps up is left alone and no longer watched", a.res === 0 && a.tier === 2 && a.watch === false);
}
{
  const s = run(fresh(), [33, 27, 19]);
  ok("slow frames cost pixels first, a rung at a time", s[0].res === 1 && s[1].res === 2 && s[0].tier === 2 && s[1].tier === 2);
  ok("…and it stops the moment the frames are smooth, keeping what it gave up", s[2].res === 2 && s[2].watch === false && s[2].tier === 2);
}
{
  const s = run(fresh(), [33.3, 33.3, 33.3, 33.3]);
  const end = s[s.length - 1];
  ok("a screen capped at thirty a second is tried all the way down the ladder", s[2].res === FLOOR);
  ok("…and, since fewer pixels never helped, gets every one of them back", end.res === 0 && end.locked === true);
  ok("…with its effects untouched and nothing more to watch", end.tier === 2 && end.watch === false);
}
{
  const s = run(fresh(), [60, 52, 46, 42]);
  ok("a device that is really struggling loses a tier at once, and a rung of pixels with it", s[0].tier === 1 && s[0].res === 1 && s[1].tier === 0 && s[1].res === 2);
  ok("…keeps the bottom rung when it gets there (fewer pixels did help), and has nothing left to watch",
     s[3].res === FLOOR && s[3].locked && s[3].tier === 0 && s[3].watch === false, JSON.stringify(s[3]));
}
{
  const s = run(fresh(), [60, 60, 60, 60]);
  ok("slow, and fewer pixels made no difference: the pixels come back, the effects stay gone",
     s[3].res === 0 && s[3].locked && s[3].tier === 0 && s[3].watch === false, JSON.stringify(s[3]));
}
{
  const s = run({ res: 0, origin: null, locked: true, tier: 2 }, [45, 45, 30]);
  ok("with the ladder closed, a slow device still steps down a tier at a time, and stops when it is no longer slow",
     s[0].tier === 1 && s[0].watch === true && s[1].tier === 0 && s[1].watch === false);
}
{
  const [a] = run({ res: 0, origin: null, locked: true, tier: 2 }, [33.3]);
  ok("a ladder already closed this session is not climbed again", a.res === 0 && a.tier === 2 && a.watch === false);
  const [b] = run({ res: 0, origin: null, locked: true, tier: 0 }, [80]);
  ok("the lowest tier has nothing left to give", b.tier === 0 && b.watch === false);
}
ok("the rungs only ever go down, and the bottom one still draws most of the picture",
   P.RES[0] === 1 && P.RES.every((r, i) => i === 0 || r < P.RES[i - 1]) && P.RES[FLOOR] >= 0.6);

/* ---------------- a browser: what a frame is made of ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." :
    "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe ladder is right (the frames were not counted)");
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

/* a frame, drawn now, and what it took: draw calls and triangles */
const FRAME = `(n) => {
  const R = __cr.renderer; const s0 = R.stats();
  window.__dc = 0; window.__tri = 0;
  for (let i = 0; i < n; i++) { R.dirty = true; R.frame(); }
  const s1 = R.stats();
  return { calls: Math.round(window.__dc / n), tris: Math.round(window.__tri / n),
           drawn: s1.shadowDrawn - s0.shadowDrawn, kept: s1.shadowKept - s0.shadowKept, fx: s1.fx };
}`;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    try { const p = JSON.parse(localStorage.getItem("chessroom_prefs") || "{}"); p.welcomed = true; p.coach = false; p.scene = "park"; localStorage.setItem("chessroom_prefs", JSON.stringify(p)); } catch (e) {}
    const proto = WebGLRenderingContext.prototype; window.__dc = 0; window.__tri = 0;
    ["drawArrays", "drawElements"].forEach((n) => { const was = proto[n]; proto[n] = function (mode, a, b) { window.__dc++; window.__tri += (n === "drawArrays" ? b : a) / 3; return was.apply(this, arguments); }; });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const frame = (n) => page.evaluate(([f, k]) => eval(f)(k), [FRAME, n]);
  try {
    await page.goto(base + "/chess/index.html#force3d");
    await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
    await page.waitForFunction(() => __cr.renderer.kind === "3d" && !__cr.renderer.isAnimating(), null, { timeout: 60000 });
    await page.waitForTimeout(600);
    ok("the carved board is the one being drawn, and can say what a frame costs",
       await page.evaluate(() => __cr.renderer.kind === "3d" && typeof __cr.renderer.stats === "function"));

    for (const tier of ["high", "medium"]) {
      await page.evaluate((t) => __cr.renderer.setFx(t), tier);
      await frame(2);                                   /* the new tier's first frames draw everything */
      const still = await frame(4);
      ok(tier + ": a still board keeps the shadow map it has", still.fx === tier && still.drawn === 0 && still.kept === 4, JSON.stringify(still));
      const round = await page.evaluate(([f]) => { const R = __cr.renderer; const s0 = R.stats(); for (let i = 0; i < 5; i++) { R.orbit(4, 0); R.dirty = true; R.frame(); } const s1 = R.stats(); return { drawn: s1.shadowDrawn - s0.shadowDrawn, kept: s1.shadowKept - s0.shadowKept }; }, [FRAME]);
      ok(tier + ": …and so does a camera going round it", round.drawn === 0 && round.kept === 5, JSON.stringify(round));

      /* a man moves: the map is drawn while he does, and kept again after */
      const before = await page.evaluate(() => __cr.renderer.stats().shadowDrawn);
      await page.evaluate(() => { const g = __cr.game; const m = Chess.moves(g)[0]; __cr.commitMove(m, "local"); });
      await page.evaluate(() => { const R = __cr.renderer; R.dirty = true; R.frame(); });
      const during = await page.evaluate(() => __cr.renderer.stats().shadowDrawn);
      ok(tier + ": a man on the move casts a moving shadow (the map is drawn again)", during > before, before + " → " + during);
      await page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 30000 });
      await frame(2);
      const after = await frame(3);
      ok(tier + ": …and once he has landed it is kept again", after.drawn === 0 && after.kept === 3, JSON.stringify(after));

      /* what the map costs when it is drawn, against a frame that keeps it */
      const forced = await page.evaluate(([f]) => {
        const R = __cr.renderer; R.orbit(0, 0);
        window.__dc = 0; window.__tri = 0;
        const g = __cr.game; const m = Chess.moves(g)[0]; __cr.commitMove(m, "local");
        R.dirty = true; R.frame();
        return { calls: window.__dc, tris: Math.round(window.__tri) };
      }, [FRAME]);
      await page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 30000 });
      ok(tier + ": keeping the map saves a real share of the frame's triangles",
         after.tris < forced.tris * 0.82, after.tris + " kept vs " + forced.tris + " drawn");
      ok(tier + ": a frame stays inside its budget (draw calls and triangles)",
         forced.calls <= 190 && forced.tris <= 520000 && after.calls <= 140, JSON.stringify({ forced, after }));
    }

    /* the lens */
    await page.evaluate(() => __cr.renderer.setFx("high"));
    await frame(2);
    ok("in a place, the lens has depth: the room either side of the board goes soft", await page.evaluate(() => __cr.renderer.stats().focus === true));
    await page.evaluate(() => { __cr.renderer.setScene("studio"); });
    await page.waitForTimeout(1200);
    await frame(2);
    ok("in the studio there is nothing behind the board to lose, and nothing is blurred", await page.evaluate(() => __cr.renderer.stats().focus === false));
    await page.evaluate(() => __cr.renderer.setFx("low"));
    await frame(2);
    const low = await frame(2);
    ok("the simplest tier draws no shadow map at all", low.drawn === 0 && low.kept === 0 && low.fx === "low", JSON.stringify(low));

    /* the ladder, on the real canvas */
    await page.evaluate(() => { __cr.renderer.setFx("auto"); });
    await frame(2);
    const full = await page.evaluate(() => __cr.renderer.stats());
    const slow = (ms) => Array.from({ length: 60 }, () => ms);
    const one = await page.evaluate((g) => __cr.renderer.paceForTest(g), slow(33));
    ok("slow frames shrink the picture, not the effects", one.width < full.width * 0.9 && one.width > full.width * 0.8 && one.fx === full.fx && one.scale < 1,
       full.width + " → " + one.width + " " + one.fx);
    const smooth = await page.evaluate((g) => __cr.renderer.paceForTest(g), slow(17));
    ok("…and smooth ones leave it where it is", smooth.width === one.width && smooth.watching === false);
    /* a fresh ladder, on a screen that is simply capped */
    await page.evaluate(() => { sessionStorage.clear(); });
    await page.reload();
    await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
    await page.waitForFunction(() => __cr.renderer.kind === "3d" && !__cr.renderer.isAnimating(), null, { timeout: 60000 });
    const w0 = await page.evaluate(() => __cr.renderer.stats().width);
    let capped = null;
    for (let i = 0; i < 4; i++) capped = await page.evaluate((g) => __cr.renderer.paceForTest(g), slow(33.3));
    ok("a screen capped at thirty a second gets every pixel back, and keeps its effects",
       capped.width === w0 && capped.scale === 1 && capped.resLocked === true && capped.fx === full.fx && capped.watching === false, JSON.stringify(capped));
    ok("…and the room remembers that for the session", await page.evaluate(() => /x/.test(sessionStorage.getItem("chess.fx.res") || "")));

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe board keeps what it has drawn, and gives up pixels before it gives up light");
  process.exit(failed ? 1 : 0);
})();
