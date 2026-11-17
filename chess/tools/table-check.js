/* table-check.js — two people, one device, flat on the table between
   them: is it fair to both?

   In a browser, on a phone, in 2D and in 3D:
     - one tap on "Two players, one device" sits them down: no card in
       the way, the game is on, and the lobby is gone;
     - each is told where they sit, the right way up for them;
     - the board takes the room: the moves and notes panel steps aside;
     - the far bar is turned to face its player, and "Your move" is on
       whichever bar is to move, "Check!" when it is check;
     - on the flat board the far player's men are drawn the right way up
       for them; in 3D the camera stands over the middle, the same
       picture from both sides;
     - the quiet coach keeps its remarks in the notebook rather than in a
       toast that faces one of them;
     - at the end each seat is told, the right way up, with a Play again
       on each side: the seats stay, the colours swap, and the board turns
       to the new White;
     - "The game" opens the full end card; the menu goes back to the lobby;
     - passed back and forth (the other seating, from "clock & seating"):
       no turned bar, no turned men, the board turns to whoever moves;
     - and from the middle of a game against the computer, one tap still
       sits two people down.

   Run: node chess/tools/table-check.js                                     */
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
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nno browser: the table was not laid");
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
  const playOn = (pg, list) => pg.evaluate(async (q) => {
    for (const x of q) { const g = __cr.game, mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, "") === x.replace(/[+#]$/, ""));
      if (!mv) return "no " + x; __cr.commitMove(mv, "local"); await new Promise((r) => setTimeout(r, 220)); }
    return "ok";
  }, list);
  const state = (pg) => pg.evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); return !!e && !e.classList.contains("hide") && getComputedStyle(e).display !== "none"; };
    const top = document.querySelector(".pbar.top"), tTag = document.getElementById("nameTop").parentNode, bTag = document.getElementById("nameBot").parentNode;
    return { mode: __cr.mode, table: document.body.classList.contains("table"), facing: document.body.classList.contains("facing"),
      panel: getComputedStyle(document.getElementById("panel")).display, topTurn: getComputedStyle(top).transform,
      topMove: tTag.classList.contains("toMove"), botMove: bTag.classList.contains("toMove"), topCheck: tTag.classList.contains("inCheck"), botCheck: bTag.classList.contains("inCheck"),
      botPill: getComputedStyle(bTag, "::after").content, face2d: __cr.face2d(), orientation: __cr.renderer.orientation,
      overlays: [...document.querySelectorAll(".ov:not(.hide)")].map((o) => o.id), say: vis("tableSay") ? [document.getElementById("tsTop").textContent, document.getElementById("tsBot").textContent] : null,
      end: vis("tableEnd"), ovEnd: vis("ovEnd"), toast: document.getElementById("toast").classList.contains("show") ? document.getElementById("toast").textContent : "" };
  });
  try {
    for (const dim of ["2d", "3d"]) {
      const T = (s) => dim + ": " + s;
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await ctx.addInitScript((d3) => { if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify({ welcomed: true, use3d: d3, tips: { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 } })); }, dim === "3d");
      const pg = await ctx.newPage(); const perr = [];
      pg.on("pageerror", (e) => perr.push(e.message));
      await pg.goto(base + "/chess/" + (dim === "2d" ? "#force2d" : ""));
      await pg.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
      await pg.waitForTimeout(500);
      await pg.tap("#mPass"); await pg.waitForTimeout(700);
      let s = await state(pg);
      ok(T("one tap sits two people down: the game is on, no card in the way"), s.mode === "pass" && s.overlays.length === 0 && s.table && s.facing, JSON.stringify(s.overlays));
      ok(T("…each is told where they sit, the right way up"), s.say && /Black, you're on this side/.test(s.say[0]) && /White, you're on this side: you start/.test(s.say[1]), JSON.stringify(s.say));
      ok(T("the board takes the room: the moves and notes step aside"), s.panel === "none");
      ok(T("the far bar faces its player"), /matrix\(-1, .*0, -1/.test(s.topTurn), s.topTurn);
      ok(T("\"Your move\" is on the bar that is to move"), s.botMove && !s.topMove && /Your move/.test(s.botPill), s.botPill);
      if (dim === "2d") ok(T("the far player's men are drawn the right way up for them"), s.face2d === -1);
      else ok(T("the camera stands over the middle, the same from both sides"), await pg.evaluate(() => __cr.renderer.isOverhead && __cr.renderer.isOverhead()));
      await playOn(pg, ["e4"]); await pg.waitForTimeout(300);
      s = await state(pg);
      ok(T("…and moves to the other bar with the turn"), s.topMove && !s.botMove);
      await pg.keyboard.press("ArrowLeft"); await pg.waitForTimeout(200);
      ok(T("looking back says so over the board, with the panel away"), await pg.evaluate(() => getComputedStyle(document.getElementById("turnStrip")).display !== "none" &&
         /Looking back/.test(document.getElementById("turnStrip").textContent)));
      await pg.keyboard.press("End"); await pg.waitForTimeout(200);
      ok(T("…and goes again when you come back"), await pg.evaluate(() => getComputedStyle(document.getElementById("turnStrip")).display === "none"));
      await playOn(pg, ["e5", "Bc4", "Nc6", "Qh5", "Nf6"]); await pg.waitForTimeout(2200);
      s = await state(pg);
      ok(T("the coach keeps its remarks for the notebook"), !/threatens|ask first/.test(s.toast) &&
         await pg.evaluate(() => /threat|mate/i.test(document.getElementById("noteList").textContent)), s.toast);
      await playOn(pg, ["Qxf7#"]); await pg.waitForTimeout(2600);
      s = await state(pg);
      ok(T("at the end, each seat is told, the right way up"), s.end && !s.ovEnd &&
         await pg.evaluate(() => /Good game/.test(document.getElementById("teTopTx").textContent) && /You won/.test(document.getElementById("teBotTx").textContent) &&
           /matrix\(-1/.test(getComputedStyle(document.querySelector("#tableEnd .teHalf.top")).transform)));
      ok(T("…with Play again on each side"), (await pg.evaluate(() => document.querySelectorAll("#tableEnd .teAgain").length)) === 2);
      await pg.evaluate(() => document.querySelector("#tableEnd .teHalf.top .teAgain").click()); await pg.waitForTimeout(700);
      s = await state(pg);
      ok(T("Play again: the seats stay, the colours swap, the board turns to the new White"), s.mode === "pass" && !s.end && s.orientation === -1 &&
         (dim === "3d" || s.face2d === 1) && s.say && /White, you're on this side: you start/.test(s.say[0]) && /Black/.test(s.say[1]) && s.topMove, JSON.stringify({ o: s.orientation, f: s.face2d, say: s.say }));
      await playOn(pg, ["f3", "e5", "g4", "Qh4#"]); await pg.waitForTimeout(2600);
      s = await state(pg);
      ok(T("…and then the top seat (White now) is told it lost"), s.end && await pg.evaluate(() => /Good game/.test(document.getElementById("teTopTx").textContent) && /You won/.test(document.getElementById("teBotTx").textContent)));
      await pg.evaluate(() => document.getElementById("teLook").click()); await pg.waitForTimeout(300);
      s = await state(pg);
      ok(T("\"The game\" opens the full end card"), s.ovEnd && !s.end);
      ok(T("nothing shouted at the console"), perr.length === 0, perr.slice(0, 3).join(" | "));
      await ctx.close();
    }

    /* check, said on the right bar */
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => { if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify({ welcomed: true, tips: { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 } })); });
    const pg = await ctx.newPage(); pg.on("pageerror", (e) => errs.push(e.message));
    await pg.goto(base + "/chess/#force2d");
    await pg.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await pg.tap("#mPass"); await pg.waitForTimeout(500);
    await playOn(pg, ["e4", "f5", "Qh5"]); await pg.waitForTimeout(300);
    let s = await state(pg);
    ok("check is said on the bar that is in it", s.topCheck && !s.botCheck && /Check/.test(await pg.evaluate(() => getComputedStyle(document.getElementById("nameTop").parentNode, "::after").content)));

    /* the other seating: passed back and forth */
    await pg.evaluate(() => __cr.showMenu()); await pg.waitForTimeout(300);
    await pg.tap("#mPassOpts"); await pg.waitForTimeout(400);
    const card = await pg.evaluate(() => ({ title: document.getElementById("newTitle").textContent, seats: [...document.querySelectorAll("#flipChips .chip")].map((c) => c.textContent) }));
    ok("clock & seating opens the card, with the two seatings named", /Two players/.test(card.title) && /Across the table/.test(card.seats[0]) && /Passed back and forth/.test(card.seats[1]), JSON.stringify(card));
    await pg.tap('#flipChips [data-flip="1"]'); await pg.tap("#newStart"); await pg.waitForTimeout(600);
    s = await state(pg);
    ok("passed back and forth: no turned bar, no turned men, and the notebook is back", s.mode === "pass" && s.table && !s.facing && s.face2d === 0 && s.topTurn === "none" && !s.say && s.panel !== "none", JSON.stringify(s));
    await playOn(pg, ["e4"]); await pg.waitForTimeout(400);
    ok("…and the board turns to whoever moves", (await state(pg)).orientation === -1);
    await pg.evaluate(() => { const p = JSON.parse(localStorage.getItem("chessroom_prefs")); p.autoFlip = false; localStorage.setItem("chessroom_prefs", JSON.stringify(p)); });

    /* from the middle of a game against the computer */
    await pg.reload(); await pg.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await pg.evaluate(() => __cr.startGame("coach", { humanSide: 1, skill: "acorn", clockStr: "none", fresh: true }));
    await playOn(pg, ["e4"]); await pg.waitForTimeout(1500);
    await pg.tap("#btnMenu"); await pg.waitForTimeout(400);
    await pg.tap("#mPass"); await pg.waitForTimeout(800);
    s = await state(pg);
    ok("from the middle of a game against the computer, one tap still sits two people down", s.mode === "pass" && s.overlays.length === 0 && s.facing, JSON.stringify(s.overlays));
    await ctx.close();
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\ntwo people, one device: fair to both");
  process.exit(failed ? 1 : 0);
})();
