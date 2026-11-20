/* beats-check.js — dev-only. After a game, does each thing it earned get
   its own moment?

   In a real browser: a game won against a coach is told a beat at a
   time, over the end card: the result, the rating counting to its new
   place with the stars landing, how you played, the experience bar (and
   LEVEL UP), then each thing the game did on its own (a chapter cleared,
   a first win), then the new tale and the presents, and then the card.
   A beat waits for you: a tap while it is still moving finishes it, the
   next goes on; Skip goes straight to the card, with everything on it
   already settled; nothing earned is lost by skipping; the card under
   the beats stays quiet until it is its turn; a tale or the presents
   can be opened from their beats; and a lesson, or a game from a set
   position, goes straight to its card as before.

   Run: node chess/tools/beats-check.js                                  */
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

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping." : "playwright-core is not installed — skipping.\n  npm i --no-save playwright-core");
  process.exit(0);
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
const PREFS = { welcomed: true, tips: { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 }, met: { acorn: 1 } };
const WIN = [["e4", "local"], ["e5", "coach"], ["Bc4", "local"], ["Nc6", "coach"], ["Qh5", "local"], ["Nf6", "coach"], ["Qxf7#", "local"]];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript((p) => { if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify(p)); }, PREFS);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(e.message + " @ " + String(e.stack).split("\n").slice(1, 3).join(" ")));
    page.on("console", (m) => { if (m.type() === "error" && !/404|vibrate/.test(m.text())) errs.push(m.text()); });
    await page.goto(base + "/chess/#force2d");
    await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await page.waitForTimeout(300);
    return { ctx, page };
  };
  const win = async (page) => {
    await page.evaluate(() => { document.getElementById("ovMenu").classList.add("hide"); __cr.startGame("coach", { clockStr: "none", fresh: true, humanSide: 1, skill: "acorn" }); });
    await page.waitForTimeout(300);
    for (const [san, src] of WIN) {
      await page.waitForTimeout(150);
      const done = await page.evaluate(([x, s]) => {
        const g = __cr.game, m = Chess.moves(g).find((q) => Chess.toSAN(g, q).replace(/[+#]$/, "") === x.replace(/[+#]$/, ""));
        if (!m) return false; __cr.commitMove(m, s); return true;
      }, [san, src]);
      if (!done) return false;
    }
    return true;
  };
  const B = (page) => page.evaluate(() => __cr.beatState());
  const until = async (page, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn); if (v) return v; await page.waitForTimeout(50); } return null; };
  /* wait for the beat to be still, then tap */
  const settle = (page) => until(page, () => !__cr.beatState().busy, 6000);
  const tap = (page) => page.touchscreen.tap(195, 420);
  try {
    let { ctx, page } = await open();
    ok("a game against a coach can be won (the check's own setup)", await win(page));
    const first = await until(page, () => __cr.beatState().on ? __cr.beatState() : null, 9000);
    ok("the result comes first, on its own", !!first && first.kind === "result" && /You won/.test(first.head), JSON.stringify(first));
    ok("…over the end card, which waits underneath", await page.evaluate(() => !document.getElementById("ovEnd").classList.contains("hide") && !document.getElementById("ovBeat").classList.contains("hide")));
    ok("…and the beats are the card on top: a tap lands on them", await page.evaluate(() => { const e = document.elementFromPoint(195, 420); return !!(e && e.closest("#ovBeat")); }));
    await settle(page);
    const seen = [first.kind], heads = [first.head];
    /* rating: tap while it is counting finishes it */
    await tap(page);
    let st = await B(page);
    seen.push(st.kind); heads.push(st.head);
    ok("then the rating, on its own", st.kind === "rating" && /Your rating/.test(st.kick), JSON.stringify(st));
    ok("…still counting when it arrives", st.busy === true);
    await page.waitForTimeout(150);
    await tap(page);
    st = await B(page);
    ok("a tap while it is moving finishes it rather than skipping it", st.kind === "rating" && !st.busy, JSON.stringify(st));
    ok("…to its final number and stars", await page.evaluate(() => {
      const n = +document.getElementById("btRate").textContent, stars = document.querySelectorAll("#btStars i.on").length;
      return n > 800 && stars >= 1;
    }));
    /* the rest, in order */
    for (let i = 0; i < 14; i++) {
      await settle(page);
      await tap(page);
      await page.waitForTimeout(120);
      st = await B(page);
      if (!st.on) break;
      seen.push(st.kind); heads.push(st.head + "|" + st.kick);
    }
    ok("the beats come in order: result, rating, how you played, experience, each thing it did, the tale, the presents",
       seen.join(",").replace(/(,mile)+/, ",mile") === "result,rating,look,xp,mile,tale,gifts", seen.join(","));
    ok("each thing the game did is a beat of its own (a chapter cleared, a first win…)",
       seen.filter((k) => k === "mile").length >= 2 && heads.some((h) => /Chapter 1 cleared/.test(h)) && heads.some((h) => /first win/i.test(h)), heads.join(" / "));
    ok("…a feat says it is one, with what it was as the headline", heads.some((h) => /A first win\|Feat/.test(h)), heads.join(" / "));
    ok("no beat is left without a headline", heads.every((h) => h.split("|")[0].trim().length > 0), heads.join(" / "));
    await page.waitForTimeout(400);
    ok("after the last beat, the card", !st.on && await page.evaluate(() => !document.getElementById("ovEnd").classList.contains("hide") && document.getElementById("ovBeat").classList.contains("hide")));
    const card = await page.evaluate(() => ({ rate: document.getElementById("endRateNum").textContent, stars: document.querySelectorAll("#endStars i.on").length,
      miles: document.querySelectorAll("#endMiles .erMile").length, gift: !document.getElementById("endGift").classList.contains("hide"), next: !document.getElementById("endNext").classList.contains("hide") }));
    ok("…with everything on it already settled: the number, the stars, the lines, the presents, what next",
       +card.rate > 800 && card.stars === 2 && card.miles >= 2 && card.gift && card.next, JSON.stringify(card));
    await ctx.close();

    /* skip: straight to the card, and nothing is lost */
    ({ ctx, page } = await open());
    await win(page);
    await until(page, () => __cr.beatState().on, 9000);
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById("btSkip").click());
    await page.waitForTimeout(400);
    ok("Skip goes straight to the card", await page.evaluate(() => !__cr.beatState().on && !document.getElementById("ovEnd").classList.contains("hide")));
    await page.waitForTimeout(5500);
    const sk = await page.evaluate(() => ({ stars: document.querySelectorAll("#endStars i.on").length, miles: document.querySelectorAll("#endMiles .erMile").length,
      xp: document.getElementById("endXpNum").textContent, ladder: JSON.parse(localStorage.getItem("chessroom_ladder")).rungs.acorn.stars }));
    ok("…and nothing earned is lost by skipping", sk.stars === 2 && sk.miles >= 2 && /\+\d+ XP/.test(sk.xp) && sk.ladder[0] === 1 && sk.ladder[1] === 1, JSON.stringify(sk));
    await ctx.close();

    /* Escape is Skip; Enter goes on */
    ({ ctx, page } = await open());
    await win(page);
    await until(page, () => __cr.beatState().on, 9000);
    await settle(page);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    ok("Enter goes on to the next beat", (await B(page)).kind === "rating");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    ok("Escape skips to the card", !(await B(page)).on);

    /* the tale and the presents can be opened from their beats */
    await page.evaluate(() => { localStorage.removeItem("chessroom_tales"); __cr.taleReload && __cr.taleReload(); });
    await ctx.close();
    ({ ctx, page } = await open());
    await win(page);
    await until(page, () => __cr.beatState().on, 9000);
    let guard = 0;
    while ((await B(page)).kind !== "tale" && guard++ < 16) { await settle(page); await tap(page); await page.waitForTimeout(120); if (!(await B(page)).on) break; }
    st = await B(page);
    ok("the tale beat offers to read it now, or later", st.kind === "tale" && st.acts.join("|") === "📜 Read it now|Later", JSON.stringify(st));
    await page.evaluate(() => [...document.querySelectorAll("#btActs .btAct")].find((b) => /Later/.test(b.textContent)).click());
    await page.waitForTimeout(200);
    st = await B(page);
    ok("…Later goes on to the presents", st.kind === "gifts" && /prize/.test(st.head) && /Open/.test(st.acts[0]), JSON.stringify(st));
    await settle(page);
    await page.evaluate(() => document.querySelector("#btActs .btAct").click());
    await page.waitForTimeout(800);
    ok("…and Open opens the first present, the beats done", !(await B(page)).on && await page.evaluate(() => !document.getElementById("ovUnlock").classList.contains("hide")));
    await ctx.close();

    /* two people across a table keep their own two-sided card: no beats */
    ({ ctx, page } = await open());
    await page.evaluate(() => { document.getElementById("ovMenu").classList.add("hide"); __cr.startGame("pass", { clockStr: "none", fresh: true }); });
    await page.waitForTimeout(300);
    for (const san of ["f3", "e5", "g4", "Qh4#"]) {
      await page.waitForTimeout(150);
      await page.evaluate((x) => { const g = __cr.game, m = Chess.moves(g).find((q) => Chess.toSAN(g, q).replace(/[+#]$/, "") === x.replace(/[+#]$/, "")); if (m) __cr.commitMove(m, "local"); }, san);
    }
    const tbl = await until(page, () => !document.getElementById("tableEnd").classList.contains("hide") || !document.getElementById("ovEnd").classList.contains("hide"), 9000);
    ok("two people across a table keep their own card, the right way up for each: no beats", !!tbl && !(await B(page)).on);
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
    await ctx.close();
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nevery thing a game earns gets its moment");
  process.exit(failed ? 1 : 0);
})();
