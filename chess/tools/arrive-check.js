/* arrive-check.js — does everything in the room arrive well?

   The board already moves like a thing with weight; this checks the room
   around it (app.js, "the room's motion"):
     - a card springs up into place, and its contents follow one after
       another on a beat, starting hidden and ending exactly as styled;
     - the lobby deals its coaches in one by one;
     - the beat follows the pace: slower for a gentle player, quicker for
       a brisk one;
     - a game started with a tap opens out of that tap (an iris over the
       new board), never in the way of a tap, gone when it is done; a game
       started without a tap just starts;
     - words arrive with a spring and leave quickly;
     - and with reduced motion none of it runs: no spring, no deal, no iris.

   Run: node chess/tools/arrive-check.js                                    */
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

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nno browser: nothing arrived");
  process.exit(failed ? 1 : 0);
}
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify({ welcomed: true, tips: { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 },
      met: { acorn: 1, sprout: 1, clover: 1, club: 1, bamboo: 1, cactus: 1, pine: 1, mentor: 1 } }));
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn); if (v) return v; await page.waitForTimeout(100); } return null; };
  const ready = async () => { await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 }); await page.waitForTimeout(300); };
  const S = () => page.evaluate(() => __cr.jrnState());
  /* every journey game here is played as White: the ladder alternates colours, so it is told who played last */
  const asWhite = () => page.evaluate(() => { const L = JSON.parse(localStorage.getItem("chessroom_ladder") || '{"v":1,"rungs":{}}'); L.lastSide = -1; localStorage.setItem("chessroom_ladder", JSON.stringify(L)); __cr.reloadLadderForTest(); });
  const play = (seq) => page.evaluate(async (q) => {
    for (const [x, src] of q) {
      const g = __cr.game, mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, "") === x.replace(/[+#]$/, ""));
      if (!mv) return "no " + x;
      __cr.commitMove(mv, src); await new Promise((r) => setTimeout(r, src === "coach" ? 300 : 80));
    }
    return "ok";
  }, seq);
  const WIN = [["e4", "local"], ["e5", "coach"], ["Bc4", "local"], ["Nc6", "coach"], ["Qh5", "local"], ["Nf6", "coach"], ["Qxf7#", "local"]];
  const LOSE = [["f3", "local"], ["e5", "coach"], ["g4", "local"], ["Qh4#", "coach"]];
  const endCup = () => until(() => !document.getElementById("endCup").classList.contains("hide") ? document.getElementById("endCupTx").textContent : null, 9000);
  const showAndWatch = (pg, id) => pg.evaluate((ov) => {
    const el = document.getElementById(ov);
    el.classList.add("hide");
    el.classList.remove("hide");
    return new Promise((res) => setTimeout(() => {
      const mine = (e) => e.getAnimations().filter((x) => !(x instanceof CSSAnimation) && !(x instanceof CSSTransition)).length;
      const card = el.firstElementChild, kids = [...card.children].filter((k) => k.offsetParent !== null);
      const last = kids[kids.length - 1];
      res({ card: mine(card), kids: kids.filter((k) => mine(k)).length, n: kids.length,
            lastOpacity: +getComputedStyle(last).opacity, cardT: getComputedStyle(card).transform,
            rungs: ov === "ovMenu" ? [...document.querySelectorAll("#mLadder .rung")].filter((r) => mine(r)).length : 0 });
    }, 30));
  }, id);
  const settled = (pg, id) => pg.evaluate((ov) => new Promise((res) => setTimeout(() => {
    const card = document.getElementById(ov).firstElementChild;
    /* only the arrivals: the room's own looping styles (a glow, a pulse) are not ours to count */
    const mine = (e) => e.getAnimations().filter((x) => !(x instanceof CSSAnimation) && !(x instanceof CSSTransition)).length;
    const all = [card, ...card.children, ...document.querySelectorAll("#mLadder .rung")].map(mine).reduce((a, b) => a + b, 0);
    res({ all, t: getComputedStyle(card).transform, o: +getComputedStyle(card).opacity });
  }, 3200)), id);
  try {
    await page.goto(base + "/chess/#force2d"); await ready();
    let a = await showAndWatch(page, "ovMenu");
    ok("a card springs up into place, its contents following on a beat", a.card >= 1 && a.kids >= Math.min(6, a.n) && a.lastOpacity < 0.5, JSON.stringify(a));
    ok("…the lobby deals its coaches in one by one", a.rungs === 8, String(a.rungs));
    let s = await settled(page, "ovMenu");
    ok("…and everything ends exactly as styled", s.all === 0 && (s.t === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(s.t)) && s.o === 1, JSON.stringify(s));
    await page.evaluate(() => document.getElementById("ovMenu").classList.add("hide"));
    a = await showAndWatch(page, "ovSettings");
    ok("every card arrives the same way (Settings too)", a.card >= 1 && a.kids >= 2, JSON.stringify(a));
    await page.evaluate(() => document.getElementById("ovSettings").classList.add("hide"));
    const beats = await page.evaluate(() => { const out = {}; ["gentle", "steady", "brisk"].forEach((p) => { __cr.paceSet({ v: 1, mode: p }); out[p] = __cr.uimBeat(); }); __cr.paceSet({ v: 1, mode: "auto" }); return out; });
    ok("the beat follows the pace", beats.gentle > beats.steady && beats.steady > beats.brisk, JSON.stringify(beats));
    const tr = await page.evaluate(() => { const t = document.getElementById("toast"); t.classList.add("show"); const v = getComputedStyle(t).transition; t.classList.remove("show"); return { show: v, hide: getComputedStyle(t).transition }; });
    ok("words arrive with a spring and leave quickly", /cubic-bezier\(0\.2, 1\.45/.test(tr.show) && /0\.18s/.test(tr.hide), JSON.stringify(tr));

    /* a game from a tap */
    await page.evaluate(() => __cr.showMenu()); await page.waitForTimeout(900);
    await page.tap("#mPlay");
    const iris = await until(() => { const i = document.querySelector(".uimIris"); return i ? { pe: getComputedStyle(i).pointerEvents, mode: __cr.mode } : null; }, 15000);
    ok("a game started with a tap opens out of that tap", iris && iris.mode === "coach" && iris.pe === "none", JSON.stringify(iris));
    ok("…and the iris is gone when it is done", !!(await until(() => !document.querySelector(".uimIris"), 3000)));
    await page.waitForTimeout(400);
    await page.evaluate(() => __cr.startGame("pass", { clockStr: "none", fresh: true }));
    await page.waitForTimeout(80);
    ok("a game started without a tap just starts", !(await page.evaluate(() => !!document.querySelector(".uimIris"))));

    /* reduced motion */
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
    await ctx2.addInitScript(() => { if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify({ welcomed: true, tips: { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 } })); });
    const p2 = await ctx2.newPage(); p2.on("pageerror", (e) => errs.push(e.message));
    await p2.goto(base + "/chess/#force2d");
    await p2.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await p2.waitForTimeout(500);
    a = await showAndWatch(p2, "ovMenu");
    ok("with reduced motion: no spring, no deal", a.card === 0 && a.kids === 0 && a.rungs === 0 && a.lastOpacity === 1, JSON.stringify(a));
    await p2.tap("#mPlay");
    await p2.waitForFunction(() => __cr.mode === "coach", null, { timeout: 15000 });
    ok("…and no iris", !(await p2.evaluate(() => !!document.querySelector(".uimIris"))));
    await ctx2.close();
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\neverything in the room arrives well");
  process.exit(failed ? 1 : 0);
})();
