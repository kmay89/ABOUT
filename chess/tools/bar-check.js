/* bar-check.js — is the action bar four keys on a phone, with the rest a tap away?

   Eight keys in a row across a phone was eight small things to read
   before a first move. On a phone held upright the bar is now Menu,
   Undo, Help and More, and More lifts a tray with the other five on it
   (app.js, "the bar on a phone"). This checks:
     - on a phone: four keys in the bar, each a thumb wide; the tray shut,
       and nothing on it reachable by finger or by Tab while it is;
     - More opens it: five keys, names written out, all on the screen;
     - it puts itself away: when one of its keys is used (and the key
       still does its job), on a tap anywhere else, on Escape (focus back
       on More), when a card arrives and when a new game starts;
     - where there is room — a laptop, a phone on its side — nothing
       changed: all eight keys in the bar, and no More.

   Run: node chess/tools/bar-check.js                                      */
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
const HTML = fs.readFileSync(path.join(ROOT, "chess", "index.html"), "utf8");

/* ---------------- the markup ---------------- */
(function () {
  const bar = (/<div id="actions">([\s\S]*?)\n  <\/div>\n<\/div>/.exec(HTML) || [])[1] || "";
  const tray = (/<div id="moreTray"[^>]*>([\s\S]*?)<\/div>/.exec(bar) || [])[1] || "";
  const ids = (s) => (s.match(/id="(btn[A-Za-z]+)"/g) || []).map((x) => x.slice(4, -1));
  const inBar = ids(bar.replace(tray, "")), inTray = ids(tray);
  ok("the bar itself is the way out, the take-back, the lamp, and More",
     JSON.stringify(inBar) === JSON.stringify(["btnMenu", "btnUndo", "btnHint", "btnMore"]), inBar.join(","));
  ok("…and the tray holds the other five, every one a key the bar always had",
     JSON.stringify(inTray) === JSON.stringify(["btnNew", "btnReplay", "btnFlip", "btnDim", "btnStudio"]), inTray.join(","));
  ok("More says what it controls, and whether it is open", /id="btnMore" aria-expanded="false" aria-controls="moreTray"/.test(bar));
})();

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe bar is in order (the room was not opened)");
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
const TRAY = ["btnNew", "btnReplay", "btnFlip", "btnDim", "btnStudio"], BAR = ["btnMenu", "btnUndo", "btnHint", "btnMore"];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  const start = async (viewport, touch) => {
    const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(() => { if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify({ welcomed: true, tips: { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 }, met: { acorn: 1 } })); });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
    await page.goto(base + "/chess/#force2d");
    await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => __cr.startGame("pass", { clockStr: "none", fresh: true }));
    await page.waitForFunction(() => __cr.mode === "pass" && document.getElementById("ovMenu").classList.contains("hide"), null, { timeout: 15000 });
    await page.waitForTimeout(500);
    return { ctx, page };
  };
  const look = (page) => page.evaluate(([bar, tray]) => {
    const box = (id) => { const el = document.getElementById(id), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      /* what is really under the middle of the key: the key, or something in front of it */
      const top = r.width ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
      return { id, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom),
               /* a key with nothing to do yet (no move to take back) sits dim in its bed: there, but not to be hit */
               off: el.disabled, seen: r.width > 0 && cs.visibility !== "hidden", hit: el.disabled ? r.width > 0 && cs.visibility !== "hidden" : !!top && el.contains(top),
               label: [].filter.call(el.querySelectorAll("span:not(.ic):not(.hintCost)"), (s) => getComputedStyle(s).display !== "none").map((s) => s.textContent).join("") || el.textContent.replace(/[^A-Za-z0-9 ]/g, "").trim() };
    };
    return { bar: bar.map(box), tray: tray.map(box), open: document.getElementById("actions").classList.contains("more"),
             expanded: document.getElementById("btnMore").getAttribute("aria-expanded"), w: innerWidth, h: innerHeight };
  }, [BAR, TRAY]);
  const shut = (page) => page.waitForFunction(() => !document.getElementById("actions").classList.contains("more") &&
    getComputedStyle(document.getElementById("moreTray")).visibility === "hidden", null, { timeout: 3000 }).then(() => true, () => false);

  try {
    /* ---------------- a phone, upright ---------------- */
    const { ctx, page } = await start({ width: 390, height: 844 }, true);
    let s = await look(page);
    ok("phone: the bar is four keys in one row", s.bar.every((k) => k.seen && k.hit) && Math.max(...s.bar.map((k) => k.y)) - Math.min(...s.bar.map((k) => k.y)) <= 4, JSON.stringify(s.bar));
    ok("…each of them a thumb wide", s.bar.every((k) => k.w >= 64 && k.h >= 44), s.bar.map((k) => k.w + "x" + k.h).join(" "));
    ok("…and the tray is shut: nothing on it to see or to hit", !s.open && s.expanded === "false" && s.tray.every((k) => !k.seen && !k.hit), JSON.stringify(s.tray));
    const tabbed = await page.evaluate((tray) => {
      document.getElementById("btnMenu").focus();
      return tray.filter((id) => { const el = document.getElementById(id); el.focus(); return document.activeElement === el; });
    }, TRAY);
    ok("…nor to reach with the keyboard", tabbed.length === 0, tabbed.join(","));

    await page.tap("#btnMore");
    await page.waitForTimeout(600);
    s = await look(page);
    ok("More lifts the tray: five keys, all on the screen, above the bar",
       s.open && s.expanded === "true" && s.tray.every((k) => k.seen && k.hit && k.x >= 0 && k.r <= s.w && k.b <= s.bar[0].y + 1), JSON.stringify(s.tray));
    ok("…their names written out", /New game/.test(s.tray[0].label) && /Last move/.test(s.tray[1].label) && /Flip/.test(s.tray[2].label) && /Look/.test(s.tray[4].label),
       s.tray.map((k) => k.label).join(" | "));
    ok("…each big enough for a thumb", s.tray.every((k) => k.w >= 56 && k.h >= 44), s.tray.map((k) => k.w + "x" + k.h).join(" "));

    /* a key used: it does its job, and the tray goes */
    const dimBefore = await page.evaluate(() => document.getElementById("dimLbl").textContent);
    await page.tap("#btnDim");
    ok("a key on the tray, used, puts the tray away", await shut(page));
    await page.waitForTimeout(700);
    const dimAfter = await page.evaluate(() => document.getElementById("dimLbl").textContent);
    ok("…having done its job", dimBefore !== dimAfter, dimBefore + " → " + dimAfter);
    await page.tap("#btnMore"); await page.waitForTimeout(400);
    await page.tap("#btnDim"); await shut(page); await page.waitForTimeout(700);

    /* a tap anywhere else */
    await page.tap("#btnMore"); await page.waitForTimeout(400);
    await page.touchscreen.tap(195, 120);
    ok("a tap anywhere else puts it away", await shut(page));

    /* More again */
    await page.tap("#btnMore"); await page.waitForTimeout(400);
    await page.tap("#btnMore");
    ok("More again puts it away", await shut(page));

    /* Escape, and the focus */
    await page.focus("#btnMore");
    await page.keyboard.press("Enter"); await page.waitForTimeout(400);
    const openByKey = (await look(page)).open;
    await page.keyboard.press("Tab");
    const inTray = await page.evaluate(() => document.activeElement && document.activeElement.id);
    await page.keyboard.press("Escape");
    const closedByKey = await shut(page);
    ok("the keyboard opens it, walks into it, and Escape shuts it with the focus back on More",
       openByKey && inTray === "btnNew" && closedByKey && (await page.evaluate(() => document.activeElement.id)) === "btnMore", [openByKey, inTray, closedByKey].join(","));

    /* a card, a new game */
    await page.tap("#btnMore"); await page.waitForTimeout(400);
    await page.evaluate(() => __cr.showMenu());
    ok("a card arriving puts it away", await shut(page));
    await page.evaluate(() => __cr.startGame("pass", { clockStr: "none", fresh: true }));
    await page.waitForTimeout(400);
    await page.tap("#btnMore"); await page.waitForTimeout(400);
    await page.evaluate(() => __cr.startGame("pass", { clockStr: "none", fresh: true }));
    ok("…and so does a new game", await shut(page));

    /* the Look key still opens the Studio from the tray */
    await page.tap("#btnMore"); await page.waitForTimeout(400);
    await page.tap("#btnStudio");
    ok("Look, on the tray, still opens the Studio", !!(await page.waitForFunction(() => document.getElementById("studio").getAttribute("aria-hidden") !== "true", null, { timeout: 4000 }).then(() => true, () => false)) && (await shut(page)));
    await ctx.close();

    /* ---------------- where there is room ---------------- */
    for (const [name, viewport, touch] of [["a laptop", { width: 1280, height: 820 }, false], ["a phone on its side", { width: 844, height: 390 }, true]]) {
      const w = await start(viewport, touch);
      const d = await look(w.page);
      const all = d.bar.filter((k) => k.id !== "btnMore").concat(d.tray);
      ok(name + ": all eight keys are in the bar, as they always were", all.every((k) => k.seen && k.hit), JSON.stringify(all.filter((k) => !(k.seen && k.hit))));
      ok("…and there is no More", !d.bar[3].seen);
      await w.page.evaluate(() => __cr.moreSet(true));
      ok("…nor a tray to open", !(await look(w.page)).open);
      await w.ctx.close();
    }

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 4).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe bar is four keys on a phone, and the rest are a tap away");
  process.exit(failed ? 1 : 0);
})();
