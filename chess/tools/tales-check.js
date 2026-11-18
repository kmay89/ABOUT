/* tales-check.js — dev-only. Does every coach have a story to tell, and
   does the room tell it?

   In node, the tales (tales.js): every coach on the ladder has one, in
   the right shape (a hello in its own voice, three short pages, a "did
   you know?"); together they make a timeline that runs in order; a tale
   opens once, and only for a coach that has one; the record survives a
   bad save.

   In a real browser: a game against a coach (whatever the result) opens
   its tale, and the end card offers it; the storybook turns its pages
   and closes back to where it was opened from, marked as read; a chapter
   card carries its coach's tale, locked until you have played them; the
   timeline on the journey map shows every tale in order, heard or not;
   games played before tales existed still count.

   Run: node chess/tools/tales-check.js                                  */
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

/* ---------------- node: the tales ---------------- */
global.self = global;
const Tales = require("../tales.js");
const Rating = require("../rating.js");
const Cast = require("../cast.js");
const ladder = Rating.LEVELS.map((L) => L.id);

ok("every coach on the ladder has a tale", ladder.every((id) => Tales.get(id)), ladder.filter((id) => !Tales.get(id)).join(", "));
ok("…and every tale belongs to a coach", Tales.TALES.every((t) => ladder.indexOf(t.id) >= 0) && Tales.TALES.length === ladder.length);
ok("each has a hello, three pages and a did-you-know", Tales.TALES.every((t) => t.hello && t.pages.length === 3 && t.fact && t.title && t.when && t.art));
const long = [];
Tales.TALES.forEach((t) => {
  if (t.hello.length > 90) long.push(t.id + ":hello");
  t.pages.forEach((p, i) => { if (p.length > 170 || p.length < 40) long.push(t.id + ":p" + (i + 1) + " " + p.length); });
  if (t.fact.length > 150) long.push(t.id + ":fact");
  if (t.title.length > 34) long.push(t.id + ":title");
});
ok("pages are short enough to read to a child, a page at a time", long.length === 0, long.join(", "));
const tl = Tales.timeline();
ok("the timeline runs in the order things happened", tl.every((t, i) => !i || t.year > tl[i - 1].year), tl.map((t) => t.id + " " + t.year).join(", "));
ok("…from where chess was born to the thinking machines", tl[0].id === "acorn" && tl[tl.length - 1].id === "pine");
ok("every hello is said by its own coach (it uses no other coach's name)",
   Tales.TALES.every((t) => ladder.filter((id) => id !== t.id).every((o) => t.hello.indexOf(Cast.get(o).name) < 0)));
/* careful history: what nobody can date is not dated */
ok("history is hedged where it should be (the old dates say about or around)",
   ["acorn", "clover", "bamboo", "cactus"].every((id) => /about|around/i.test(Tales.get(id).when)));
let st = Tales.fresh();
ok("a tale opens once", Tales.open(st, "acorn", 5) === true && Tales.open(st, "acorn", 6) === false && st.got.acorn === 5);
ok("…and only for a coach that has one", Tales.open(st, "nobody", 1) === false && Tales.count(st) === 1);
ok("a new tale is unread until it has been read to the end", Tales.unread(st, "acorn") && (Tales.markRead(st, "acorn"), !Tales.unread(st, "acorn")));
ok("a tale not yet heard cannot be marked read", (Tales.markRead(st, "pine"), !st.read.pine));
const c = Tales.clean({ v: 1, got: { acorn: 3, nobody: 1, pine: "x" }, read: { acorn: 1, cactus: 1 } });
ok("a bad save is cleaned, not trusted", c.got.acorn === 3 && !c.got.nobody && c.got.pine === 1 && c.read.acorn === 1 && !c.read.cactus);
ok("…and a broken one starts fresh", Tales.count(Tales.load(() => "{nope")) === 0 && Tales.count(Tales.load(() => null)) === 0);

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe tales are right on paper (the room was not opened)");
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify({ welcomed: true, tips: { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 }, met: { acorn: 1 } }));
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn); if (v) return v; await page.waitForTimeout(60); } return null; };
  const ready = async () => { await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 }); await page.waitForTimeout(300); };
  const shown = (id) => page.evaluate((i) => !document.getElementById(i).classList.contains("hide"), id);
  const T = () => page.evaluate(() => __cr.taleState());
  try {
    await page.goto(base + "/chess/#force2d"); await ready();
    ok("nobody has been told a tale before they have played", (await T()).st && Object.keys((await T()).st.got).length === 0);
    /* the chapter card, before */
    await page.evaluate(() => __cr.openChapter("acorn")); await page.waitForTimeout(300);
    const locked = await page.evaluate(() => { const b = document.getElementById("chTale"); return { cls: b.className, t: b.textContent }; });
    ok("a chapter card says its coach has a tale, and how to hear it", /locked/.test(locked.cls) && /Play Acorn once/.test(locked.t) && /any result/.test(locked.t), JSON.stringify(locked));
    await page.evaluate(() => document.getElementById("chTale").click()); await page.waitForTimeout(200);
    ok("…and it does not open before then", !(await shown("ovTale")));
    await page.evaluate(() => document.getElementById("ovChapter").classList.add("hide"));

    /* a game, lost on purpose: the tale opens anyway */
    await page.evaluate(() => { document.getElementById("ovMenu").classList.add("hide"); __cr.startGame("coach", { clockStr: "none", fresh: true, humanSide: 1, skill: "acorn" }); });
    await page.waitForTimeout(400);
    const LOSE = [["f3", "local"], ["e5", "coach"], ["g4", "local"], ["Qh4", "coach"]];
    for (const [san, src] of LOSE) {
      await page.waitForTimeout(150);
      await page.evaluate(([x, s]) => { const g = __cr.game, mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, "") === x); if (mv) __cr.commitMove(mv, s); }, [san, src]);
    }
    await until(() => !document.getElementById("ovEnd").classList.contains("hide"), 12000);
    await page.waitForTimeout(800);
    const endT = await page.evaluate(() => ({ on: !document.getElementById("endTale").classList.contains("hide"), t: document.getElementById("endTale").textContent }));
    ok("a game against a coach, even a lost one, opens its tale, and the end card offers it", endT.on && /Where chess was born/.test(endT.t) && /Acorn has a story/.test(endT.t), JSON.stringify(endT));
    ok("…and it is remembered, unread", (await T()).st.got.acorn > 0 && !(await T()).st.read.acorn);

    /* the storybook */
    await page.evaluate(() => document.getElementById("endTale").click()); await page.waitForTimeout(400);
    const p0 = await page.evaluate(() => ({ on: !document.getElementById("ovTale").classList.contains("hide"), end: !document.getElementById("ovEnd").classList.contains("hide"),
      kick: document.getElementById("taKick").textContent, page: document.getElementById("taPage").textContent, face: !!document.querySelector("#taFace img"),
      dots: document.querySelectorAll("#taDots i").length, prev: document.getElementById("taPrev").disabled }));
    ok("the storybook opens over the end card, with the coach's face", p0.on && !p0.end && /Acorn's tale/.test(p0.kick) && p0.face, JSON.stringify(p0));
    ok("…the coach says hello first, in its own words", p0.page.indexOf(Tales.get("acorn").hello) >= 0 && p0.prev === true);
    ok("…and a dot for every page", p0.dots === 5);
    const seen = [];
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => document.getElementById("taNext").click()); await page.waitForTimeout(150);
      seen.push(await page.evaluate(() => document.getElementById("taPage").textContent));
    }
    ok("the pages turn, one after another, ending on a did-you-know",
       seen[0].indexOf("chaturanga") >= 0 && seen[1].indexOf("knights") >= 0 && seen[2].indexOf("L shape") >= 0 && /Did you know/.test(seen[3]), seen.map((x) => x.slice(0, 20)).join(" | "));
    ok("…and the last button says so", /The end/.test(await page.evaluate(() => document.getElementById("taNext").textContent)));
    await page.evaluate(() => document.getElementById("taPrev").click()); await page.waitForTimeout(150);
    ok("…and Back turns one back", (await page.evaluate(() => document.getElementById("taPage").textContent)).indexOf("L shape") >= 0);
    await page.evaluate(() => { document.getElementById("taNext").click(); }); await page.waitForTimeout(120);
    await page.evaluate(() => { document.getElementById("taNext").click(); }); await page.waitForTimeout(300);
    ok("the end closes it, back to the end card it was opened from", !(await shown("ovTale")) && (await shown("ovEnd")));
    ok("…read now, and the end card's button has done its job", (await T()).st.read.acorn === 1 && !(await shown("endTale")));

    /* the chapter card, after */
    await page.evaluate(() => { document.getElementById("ovEnd").classList.add("hide"); __cr.openChapter("acorn"); }); await page.waitForTimeout(300);
    const open = await page.evaluate(() => { const b = document.getElementById("chTale"); return { cls: b.className, t: b.textContent }; });
    ok("the chapter card now has the tale to read again", !/locked/.test(open.cls) && /Acorn's tale: Where chess was born/.test(open.t), JSON.stringify(open));
    await page.evaluate(() => document.getElementById("chTale").click()); await page.waitForTimeout(300);
    ok("…and reading it there", await shown("ovTale"));
    await page.evaluate(() => document.getElementById("taX").click()); await page.waitForTimeout(300);
    ok("…the ✕ puts it away, back to the chapter card", !(await shown("ovTale")) && (await shown("ovChapter")));
    await page.evaluate(() => document.getElementById("ovChapter").classList.add("hide"));

    /* the timeline */
    await page.evaluate(() => __cr.openJourney ? __cr.openJourney() : document.getElementById("mJourney").click()); await page.waitForTimeout(400);
    ok("the journey map counts the tales heard", /1 of 8 tales/.test(await page.evaluate(() => document.getElementById("jrTalesSub").textContent)));
    await page.evaluate(() => document.getElementById("jrTales").click()); await page.waitForTimeout(300);
    const line = await page.evaluate(() => [...document.querySelectorAll("#tsLine .tsNode")].map((n) => ({ id: n.dataset.tale, locked: n.classList.contains("locked"), t: n.textContent })));
    ok("the story of chess shows every tale, in the order it happened", line.map((n) => n.id).join() === Tales.timeline().map((t) => t.id).join(), line.map((n) => n.id).join());
    ok("…the ones not heard yet locked, with who to play", line.filter((n) => n.locked).length === 7 && /Play Pine/.test(line[line.length - 1].t) && !line[0].locked, JSON.stringify(line.map((n) => n.locked)));
    await page.evaluate(() => document.querySelector('#tsLine .tsNode[data-tale="pine"]').click()); await page.waitForTimeout(200);
    ok("…a locked one stays locked", !(await shown("ovTale")));
    await page.evaluate(() => document.querySelector('#tsLine .tsNode[data-tale="acorn"]').click()); await page.waitForTimeout(300);
    ok("…an open one is read from there", await shown("ovTale"));
    await page.evaluate(() => document.getElementById("taX").click()); await page.waitForTimeout(300);
    ok("…and closes back to the timeline", await shown("ovTales"));
    await page.evaluate(() => document.getElementById("tsClose").click()); await page.waitForTimeout(300);
    ok("the timeline goes back to the map", !(await shown("ovTales")) && (await shown("ovJourney")));

    /* games from before tales: the ladder says Cactus has been played */
    await page.evaluate(() => { const L = JSON.parse(localStorage.getItem("chessroom_ladder")); L.rungs.cactus = { w: 0, d: 0, l: 2, stars: [0, 0, 0] }; localStorage.setItem("chessroom_ladder", JSON.stringify(L)); });
    await page.reload(); await ready();
    ok("games played before tales existed still open their tales", !!(await T()).st.got.cactus && !!(await T()).st.got.acorn && !(await T()).st.got.pine);
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe grove has a story for everyone who sits down to play");
  process.exit(failed ? 1 : 0);
})();
