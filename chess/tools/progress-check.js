/* progress-check.js — dev-only. Does the room keep what you did?

   games-check, feats-check and goals-check prove the rules in node. This
   proves the wiring, in the real page, on a phone and on a laptop, the
   way a person meets it:

     • a fresh room names one next step, beside the link it shares a row
       with, and nothing else in the lobby has grown;
     • a game between two people is kept in the journal, counts as a day
       on the streak once it is properly a game — and never touches the
       rating, and earns no feat (both chairs are you);
     • a game against the coach is kept with its marks, earns its feats
       (said once on the end card, kept on the record with the game they
       came from), and the step the lobby named is said to be done once;
     • the record grows faces, not length: Record · Games · Feats, one at
       a time, and the Record face is exactly what it was;
     • a kept game opens on the board as a read-only replay — the steps
       move, the board refuses a move, PGN copies out, Done goes home —
       and a game left on the shelf to look at it is still there after;
     • the Academy shows the room's one streak.

   Needs `playwright-core`; the browser is already on the machine. If
   either is missing it says so and exits 0.

   Run: node chess/tools/progress-check.js [--phone|--desk]             */
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
if (!CHROME) { console.log("no chromium on this machine — skipping the progress check."); process.exit(0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the progress check.");
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

const PLAY = `([san, src]) => {
  const g = __cr.game;
  const mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, '') === san.replace(/[+#]$/, ''));
  if (!mv) return false;
  __cr.commitMove(mv, src || 'local');
  return true;
}`;
const SCHOLAR = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"];
/* twenty plies that neither repeat nor end anything */
const QUIET20 = ["a4", "a5", "b4", "b5", "c4", "c5", "d4", "d5", "e4", "e5", "f4", "f5", "g4", "g5", "h4", "h5", "Na3", "Na6", "Nh3", "Nh6"];

const SIZES = [
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true },
  { name: "desk", viewport: { width: 1280, height: 820 }, touch: false }
].filter((s) => !process.argv.includes(s.name === "phone" ? "--desk" : "--phone"));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

  for (const size of SIZES) {
    const T = (s) => size.name + ": " + s;
    const ctx = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, isMobile: size.touch });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push("" + e.message + (e.stack ? " @ " + String(e.stack).split("\n").slice(1, 3).join(" ").trim() : "")));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    /* the clipboard is the way out of the room; here it is a pocket the check can look in */
    await page.addInitScript(() => {
      window.__copied = [];
      try { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); } catch (e) {}
      try {
        Object.defineProperty(navigator, "clipboard", { configurable: true,
          value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); }, readText: () => Promise.resolve("") } });
      } catch (e) {}
    });
    const play = (san, src) => page.evaluate(([f, a]) => eval(f)(a), [PLAY, [san, src]]);
    const visible = (id) => page.evaluate((i) => { const el = document.getElementById(i); return !!el && !el.classList.contains("hide") && el.offsetParent !== null; }, id);
    const settle = () => page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 5000 }).catch(() => {});
    let visit = 0;
    const fresh = async () => {
      await page.goto(base + "/chess/?v=" + (++visit) + "#force2d", { waitUntil: "networkidle" });
      await page.waitForFunction(() => document.getElementById("splash").classList.contains("gone") &&
        !document.getElementById("ovMenu").classList.contains("hide"), null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(250);
    };
    const store = (k) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), k);
    const endCard = () => page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 9000 }).catch(() => {});

    try {
      await page.goto(base + "/chess/#force2d", { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await fresh();

      /* ---- the lobby: one next step, and nothing else grown ---- */
      const lobby = await page.evaluate(() => ({
        goal: document.getElementById("mGoalTx").textContent,
        shown: !document.getElementById("mGoal").classList.contains("hide"),
        rowKids: document.querySelector(".playMore").children.length,
        inRow: !!document.querySelector(".playMore #mGoal")
      }));
      ok(T("a fresh room names one next step: the first game"), lobby.shown && /first game/i.test(lobby.goal), lobby.goal);
      ok(T("…in the row it shares with the opponent link (no new card)"), lobby.rowKids === 2 && lobby.inRow, JSON.stringify(lobby));
      const goalBox = await page.locator("#mGoal").boundingBox(), linkBox = await page.locator("#mCoach").boundingBox();
      ok(T("…both readable at this width"), goalBox && linkBox && goalBox.width > 120 && linkBox.width > 120 &&
         goalBox.x >= 0 && goalBox.x + goalBox.width <= size.viewport.width + 1, JSON.stringify([goalBox, linkBox]));

      /* ---- two people, one screen: play, kept, a day — never rating ---- */
      await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none", fresh: true }); });
      for (const san of QUIET20) { await play(san); await page.waitForTimeout(30); }
      await settle();
      await page.click("#btnMenu");
      await page.waitForTimeout(300);
      await page.locator("#gameOps button", { hasText: "White resigns" }).click();
      /* at the table each seat is told first; "The game" opens the card (table-check.js) */
      await page.waitForFunction(() => !document.getElementById("tableEnd").classList.contains("hide"), null, { timeout: 9000 }).catch(() => {});
      await page.click("#teLook");
      await endCard();
      let games = await page.evaluate(() => __cr.gamesForTest());
      const pg = games.list[0] || {};
      ok(T("a game between two people is kept in the journal"), games.list.length === 1 && pg.mode === "pass" && pg.plies === 20 &&
         pg.result === "black" && pg.humanSide === 0, JSON.stringify(pg).slice(0, 160));
      const lad = await store("chessroom_ladder"), rat = await store("chessroom_rating");
      const today = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); });
      ok(T("…counts as a day you played, once it was properly a game"), lad && lad.day === today && lad.days === 1, JSON.stringify(lad));
      ok(T("…and never touches the rating"), !rat || !rat.games, JSON.stringify(rat && rat.games));
      ok(T("…nor earns a feat (both chairs are you)"), Object.keys((await page.evaluate(() => __cr.featsForTest())).done).length === 0);
      ok(T("…and its card has no stack of lines"), !(await visible("endMiles")));

      /* ---- the coach: kept, feats said once, the step done ---- */
      await page.click("#endMenu"); await page.waitForTimeout(300);
      await page.evaluate(() => { __cr.startGame("coach", { humanSide: 1, skill: Rating.LEVELS[0].id, clockStr: "none", fresh: true }); });
      for (const [i, san] of SCHOLAR.entries()) {
        await play(san, i % 2 ? "coach" : "local");
        await page.waitForTimeout(i % 2 ? 420 : 80);
      }
      await endCard();
      await page.waitForFunction(() => document.querySelectorAll("#endMiles .erMile").length >= 3, null, { timeout: 12000 }).catch(() => {});
      const miles = await page.evaluate(() => [...document.querySelectorAll("#endMiles .erMile")].map((e) => e.className + "|" + e.textContent));
      ok(T("the end card says what the game did, in at most three lines"), miles.length >= 2 && miles.length <= 3, miles.join(" / "));
      ok(T("…the step the lobby named, done"), miles.some((m) => /done/.test(m) && /first game is in/i.test(m)), miles.join(" / "));
      ok(T("…and a feat"), miles.some((m) => /feat/.test(m) && /Feat:/.test(m)), miles.join(" / "));
      const feats = await page.evaluate(() => __cr.featsForTest());
      games = await page.evaluate(() => __cr.gamesForTest());
      const cg = games.list[games.list.length - 1] || {};
      ok(T("a coach game earns what was true: a first win, mate with the queen, a win in 15"),
         ["first-win", "mate-queen", "quick-win"].every((id) => feats.done[id]), Object.keys(feats.done).join(","));
      ok(T("…kept with the game it happened in"), feats.done["first-win"] && feats.done["first-win"].game === cg.id && cg.feats.indexOf("first-win") >= 0,
         JSON.stringify(feats.done["first-win"]) + " vs " + cg.id);
      ok(T("…and the coach game itself is in the journal, with who sat where"), cg.mode === "coach" && cg.skill === "acorn" && cg.humanSide === 1 &&
         cg.result === "white" && cg.plies === 7 && cg.eco && cg.eco.name, JSON.stringify(cg).slice(0, 200));
      const goalStore = await store("chessroom_goal");
      ok(T("…and 'done' is remembered, so it is said once"), goalStore && goalStore.said === "first", JSON.stringify(goalStore));
      ok(T("the end card's next button still offers the next coach up"), await visible("endNext"));

      /* ---- the lobby moves on, quietly ---- */
      await page.click("#endMenu"); await page.waitForTimeout(400);
      const goal2 = await page.evaluate(() => document.getElementById("mGoalTx").textContent);
      ok(T("the lobby shows the next step, not the one just taken"), goal2 && !/first game/i.test(goal2), goal2);

      /* ---- the record, in faces ---- */
      await page.click("#mRating"); await page.waitForTimeout(400);
      const faces = await page.evaluate(() => ({
        tabs: [...document.querySelectorAll("#pfTabs .pftab")].map((b) => b.textContent),
        shown: [...document.querySelectorAll("#ovProfile .pfPane")].filter((p) => !p.classList.contains("hide")).map((p) => p.id),
        ladder: document.querySelectorAll("#pfRecord #pfLadder .rungRow").length,
        how: !!document.querySelector("#pfRecord .howBox")
      }));
      ok(T("your record has three faces, Record first"), faces.tabs.join() === "Record,Games,Feats" && faces.shown.join() === "pfRecord", JSON.stringify(faces));
      ok(T("…and the Record face is what the record always was"), faces.ladder >= 8 && faces.how);
      const recordH = await page.evaluate(() => document.querySelector("#ovProfile .card").scrollHeight);
      await page.locator("#pfTabs .pftab", { hasText: "Games" }).click(); await page.waitForTimeout(200);
      const rows = await page.evaluate(() => [...document.querySelectorAll("#pfGamesList .gameRow")].map((r) => r.textContent));
      ok(T("Games: newest first, each with who, when and how it went"), rows.length === 2 && /Acorn/.test(rows[0]) && /won/i.test(rows[0]) &&
         /Two players/.test(rows[1]) && /0–1/.test(rows[1]), rows.join(" / "));
      const gamesH = await page.evaluate(() => document.querySelector("#ovProfile .card").scrollHeight);
      ok(T("…one face at a time, never longer than the record was"), gamesH <= recordH + 4, gamesH + " vs " + recordH);
      await page.click("#pfPgnAll"); await page.waitForTimeout(150);
      const all = await page.evaluate(() => window.__copied.slice(-1)[0] || "");
      ok(T("…and 'Copy them all' is PGN, both games"), (all.match(/\[Event "/g) || []).length === 2 && /1\. e4 e5 2\. Bc4/.test(all), all.slice(0, 120));
      await page.locator("#pfTabs .pftab", { hasText: "Feats" }).click(); await page.waitForTimeout(200);
      const tiles = await page.evaluate(() => ({ on: document.querySelectorAll("#pfFeatsList .featTile.on").length,
        all: document.querySelectorAll("#pfFeatsList .featTile").length, first: (document.querySelector("#pfFeatsList .featTile") || {}).className,
        note: document.getElementById("pfFeatsNote").textContent, h: document.querySelector("#ovProfile .card").scrollHeight }));
      ok(T("Feats: what you have done first, lit, then the next few as plain sentences"),
         tiles.on >= 3 && tiles.all === tiles.on + 6 && /on/.test(tiles.first) && /of \d+/.test(tiles.note), JSON.stringify(tiles));
      ok(T("…still no longer than the record was"), tiles.h <= recordH + 4, tiles.h + " vs " + recordH);
      await page.click("#pfFeatsMore"); await page.waitForTimeout(150);
      const total = await page.evaluate(() => ({ n: document.querySelectorAll("#pfFeatsList .featTile").length, of: __cr.Feats.LIST.length,
        more: document.getElementById("pfFeatsMore").classList.contains("hide") }));
      ok(T("…and the rest one tap away"), total.n === total.of && total.more, JSON.stringify(total));

      /* ---- a kept game, on the board ---- */
      /* leave a coach game on the shelf first: looking back must not cost it */
      await page.click("#pfBack"); await page.waitForTimeout(250);
      await page.evaluate(() => { __cr.startGame("coach", { humanSide: 1, skill: "acorn", clockStr: "none", fresh: true }); });
      await play("d4"); await page.waitForTimeout(150); await play("d5", "coach"); await settle();
      await page.click("#btnMenu"); await page.waitForTimeout(250);
      await page.click("#mRating"); await page.waitForTimeout(300);
      await page.locator("#pfTabs .pftab", { hasText: "Games" }).click(); await page.waitForTimeout(150);
      await page.locator("#pfGamesList .gameRow").first().click(); await page.waitForTimeout(500);
      let rv = await page.evaluate(() => ({ mode: __cr.mode, plies: __cr.game.played.length, lessonOn: document.body.classList.contains("lesson-on"),
        bar: document.getElementById("lessonBar").textContent, tagBot: document.getElementById("nameBot").textContent }));
      ok(T("a kept game opens on the board, from its first move"), rv.mode === "review" && rv.plies === 7 && rv.lessonOn && /Acorn/.test(rv.bar), JSON.stringify(rv));
      ok(T("…with your own name in your chair"), /You/.test(rv.tagBot), rv.tagBot);
      const step = async (label) => { await page.locator("#lessonBar .lchip", { hasText: label }).first().click(); await page.waitForTimeout(120); };
      await step("▶"); await step("▶");
      const at = await page.evaluate(() => document.querySelector("#moveList .m.cur") ? document.querySelector("#moveList .m.cur").textContent : "");
      ok(T("…the steps walk through it"), /c4/.test(at) && !/e5/.test(at), at);
      const refused = await page.evaluate(() => { const g = __cr.game, n = g.played.length; return { n, act: document.getElementById("btnHint").disabled && document.getElementById("btnUndo").disabled }; });
      ok(T("…it is a replay: no hint, no take-back"), refused.act);
      await step("PGN · FEN");
      await page.locator("#askRow button", { hasText: "Copy PGN" }).click(); await page.waitForTimeout(120);
      const one = await page.evaluate(() => window.__copied.slice(-1)[0] || "");
      ok(T("…Copy PGN gives the game, marks and all"), /\[White "You"\]/.test(one) && /\[Black "Acorn"\]/.test(one) && /Qxf7#/.test(one) && /1-0\s*$/.test(one), one.slice(0, 160));
      await step("Done");
      rv = await page.evaluate(() => ({ menu: !document.getElementById("ovMenu").classList.contains("hide"), mode: __cr.mode,
        resume: !document.getElementById("mResume").classList.contains("hide"), bar: document.getElementById("lessonBar").classList.contains("hide") }));
      ok(T("Done goes home, and the game on the shelf is still there to continue"), rv.menu && rv.mode === null && rv.resume && rv.bar, JSON.stringify(rv));
      await page.click("#mResume"); await page.waitForTimeout(400);
      const back = await page.evaluate(() => ({ mode: __cr.mode, sans: __cr.game.played.map((r) => r.san).join(" ") }));
      ok(T("…and continuing it is the same game"), back.mode === "coach" && back.sans === "d4 d5", JSON.stringify(back));

      /* ---- one streak ---- */
      await page.click("#btnMenu"); await page.waitForTimeout(200);
      await page.click("#mAcademy"); await page.waitForTimeout(300);
      const streak = await page.evaluate(() => document.getElementById("aStreak").textContent);
      ok(T("the Academy shows the room's one streak (games and lessons, one calendar)"), streak === "1", streak);

      ok(T("nothing shouted at the console"), errs.length === 0, errs.slice(0, 3).join(" | "));
    } catch (e) {
      failed++;
      console.log("FAIL  " + size.name + ": the check itself fell over  → " + (e && e.stack || e));
      const shot = path.join(require("os").tmpdir(), "progress-check-fail-" + size.name + ".png");
      try { await page.screenshot({ path: shot }); console.log("      the page at that moment: " + shot); } catch (err) {}
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(failed ? "\n" + failed + " failed" : "\nthe room keeps what you did — every game, every feat, the next step — on a phone and on a laptop");
  process.exit(failed ? 1 : 0);
})();
