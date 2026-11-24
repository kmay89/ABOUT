/* setup-check.js — setting up the board: does it teach which piece is
   which, and where it lives?

   In node (setup.js):
     - the steps, in the order people set a board up, finish on exactly
       the position every game of chess begins from, Black and all;
     - a piece only goes where it belongs; a miss says where it really
       lives, and counts; a taken square says so;
     - a row of pawns: one put down by hand, the rest march in;
     - the squares glow after a miss, or straight away at a gentle pace,
       and never from memory;
     - from memory a finish is timed, a miss costs three seconds, and the
       best is kept; learning counts how many times it was done;
     - a tampered record comes back safe.

   In a browser, on a phone:
     - "I'm new" at the door starts with setting up the board;
     - the first piece is named, with which it is and where it goes;
     - a miss says where it lives, and the right squares glow;
     - a tap on the right square puts the piece there;
     - the rest goes in, Black sets up by itself, and the board ends on
       the starting position; the card offers the rules, a game, and
       trying it from memory;
     - the Academy offers it, and once learned it is from memory: no
       words, no glow, a clock; Help there costs three seconds; a finish
       is timed and the best kept;
     - at a gentle pace the squares glow from the start;
     - and a game started from the menu leaves the set-up behind.

   Run: node chess/tools/setup-check.js                                     */
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
global.self = global;
const S = require("../setup.js");
const Chess = require("../engine.js");

/* ---------------- node: the set-up ---------------- */
{
  const order = S.STEPS.map((s) => s.name).join(" ");
  ok("the steps go the way people set a board up", order === "Rook Knight Bishop Queen King Pawn", order);
  ok("every piece is named, with which it is, where it goes and what a miss says", S.STEPS.every((s) => s.name && s.plural && s.what && s.where && s.miss && s.emoji));
  /* how a piece moves is the next lesson, and is shown on the board there (rules.js) */
  ok("…in a few words: the card is not where anything is explained", S.STEPS.every((s) => s.what.length <= 40 && !s.is));
  const st = S.begin();
  let n = 0;
  S.STEPS.forEach((s) => { s.squares.forEach((q) => { if (!st.placed[q] && st.at === S.STEPS.indexOf(s)) { S.place(st, q); n++; } }); });
  const start = Chess.create().board, done = S.board(st, true);
  let same = true; for (let i = 0; i < 128; i++) if ((start[i] || 0) !== (done[i] || 0)) same = false;
  ok("…and finish on exactly the position every game begins from, Black and all", st.done && same);
  const t = S.begin();
  const miss = S.place(t, 0x33);
  ok("a piece only goes where it belongs: a miss says where it really lives, and counts", !miss.ok && /corners/.test(miss.why) && t.misses === 1 && t.at === 0);
  S.place(t, 0);
  const taken = S.place(t, 0);
  ok("…a taken square says so", !taken.ok && /taken/.test(taken.why));
  const q = S.begin(); [0, 7, 1, 6, 2, 5].forEach((x) => S.place(q, x));
  ok("the queen is the light square in the middle, and only that", !S.place(q, 4).ok && S.place(q, 3).ok);
  const p = S.begin(); [0, 7, 1, 6, 2, 5, 3, 4].forEach((x) => S.place(p, x));
  const pawn = S.place(p, 20);
  ok("a row of pawns: one by hand, the rest march in", pawn.ok && pawn.rest.length === 7 && pawn.finished && p.done);
  const g = S.begin();
  ok("the squares glow after a miss, or at once at a gentle pace", !S.glow(g, false) && S.glow(g, true) && (S.place(g, 50), S.glow(g, false)));
  const m = S.begin({ memory: true }); S.place(m, 50);
  ok("…and never from memory", !S.glow(m, true));
  ok("Black sets up straight across the board", S.mirror().length === 16 && S.mirror()[0][0] === 0x70 && S.mirror()[0][1] === -4 && S.across(3) === 0x73);
  const rec = S.fresh();
  ok("learning counts the times it was done", S.finish(rec, S.begin(), 50000).learned === 1 && rec.learned === 1 && rec.best === 0);
  const r1 = S.finish(rec, Object.assign(S.begin({ memory: true }), { misses: 2 }), 30000);
  ok("from memory a finish is timed, and a miss costs three seconds", r1.score === 36000 && r1.best && rec.best === 36000 && rec.tries === 1);
  const r2 = S.finish(rec, S.begin({ memory: true }), 40000), r3 = S.finish(rec, S.begin({ memory: true }), 20000);
  ok("…and the best is kept", !r2.best && r3.best && rec.best === 20000 && S.fmt(20000) === "20.0 s");
  const bad = S.clean({ v: 1, learned: "x", tries: -5, best: -3, bestMisses: "no" });
  ok("a tampered record comes back safe", bad.learned === 0 && bad.tries === 0 && bad.best === 0 && JSON.stringify(S.clean(7)) === JSON.stringify(S.fresh()));
}

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe set-up adds up (it was not walked)");
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
  const st = (pg) => pg.evaluate(() => ({ mode: __cr.mode, s: __cr.setupState(), bar: document.getElementById("lessonBar").classList.contains("hide") ? "" : document.getElementById("lessonBar").textContent,
    rec: __cr.setupRecord(), board: Array.from(__cr.renderer.board || []), legal: (__cr.renderer.hi || {}).legal || null }));
  const tapAt = (pg, sq) => pg.evaluate((s) => __cr.setupTap(s), sq).then(() => pg.waitForFunction(() => !__cr.setupBusy(), null, { timeout: 6000 })).then(() => pg.waitForTimeout(120));
  const startBoard = Array.from(Chess.create().board);
  try {
    /* the door */
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p2 = await ctx2.newPage(); p2.on("pageerror", (e) => errs.push(e.message));
    await p2.goto(base + "/chess/#force2d");
    await p2.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await p2.evaluate(() => document.getElementById("mNew").click()); await p2.waitForTimeout(700);
    let s = await st(p2);
    ok("\"I'm new\" at the door starts with setting up the board", s.mode === "setup" && s.s && s.s.at === 0 && !s.s.memory, s.mode);
    ok("…the first piece is named, with which it is and where it goes", /Your rooks/.test(s.bar) && /castle tower/.test(s.bar) && /corners/.test(s.bar), s.bar);
    ok("…and an \"I'm new\" player is gentle: the squares glow from the start", JSON.stringify(s.legal) === "[0,7]", JSON.stringify(s.legal));
    await p2.evaluate(() => document.getElementById("suSkip").click()); await p2.waitForTimeout(300);
    ok("…and Skip goes on to the rules, shown on the board", await p2.evaluate(() => __cr.mode === "rules" && __cr.rulesState().scene === "goal" && document.getElementById("lessonBar").classList.contains("rules")));
    await ctx2.close();

    /* learning, tapped for real */
    await page.goto(base + "/chess/#force2d"); await ready();
    await page.evaluate(() => __cr.startSetup({ then: "rules" })); await page.waitForTimeout(500);
    s = await st(page);
    ok("a steady player starts without the glow", s.mode === "setup" && (!s.legal || !s.legal.length), JSON.stringify(s.legal));
    await page.evaluate(() => __cr.setupTap(0x33)); await page.waitForTimeout(300);
    s = await st(page);
    ok("a miss says where it lives, and the right squares glow", /rooks live in the corners/.test(s.bar) && JSON.stringify(s.legal) === "[0,7]" && s.s.misses === 1, s.bar);
    const box = await page.locator("#stage").boundingBox();
    const at = await page.evaluate(() => { const p = __cr.renderer.squareToScreen(0); const c = document.getElementById("cv2").getBoundingClientRect(), sr = document.getElementById("stage").getBoundingClientRect(); return { x: p.x + c.left - sr.left, y: p.y + c.top - sr.top }; });
    await page.touchscreen.tap(box.x + at.x, box.y + at.y);
    await page.waitForFunction(() => !__cr.setupBusy(), null, { timeout: 6000 }); await page.waitForTimeout(200);
    s = await st(page);
    ok("a tap on the right square puts the piece there", s.board[0] === 4 && s.s.placed[0] === 4, JSON.stringify(s.s.placed));
    for (const q of [7, 1, 6, 2, 5, 3, 4, 18]) await tapAt(page, q);
    await page.waitForFunction(() => /every game of chess begins/.test(document.getElementById("lessonBar").textContent), null, { timeout: 9000 });
    s = await st(page);
    ok("the rest goes in, Black sets up by itself, and the board ends on the starting position", JSON.stringify(s.board) === JSON.stringify(startBoard) && s.s.mirrored && s.s.done);
    ok("…the card offers the rules, a game, and trying it from memory",
       await page.evaluate(() => ["suRules", "suPlay", "suAgain"].every((id) => !!document.getElementById(id))) && s.rec.learned === 1);
    await page.evaluate(() => document.getElementById("suRules").click()); await page.waitForTimeout(400);
    ok("…and the rules follow", await page.evaluate(() => __cr.mode === "rules" && !!__cr.rulesState() && document.getElementById("lessonBar").classList.contains("rules")));

    /* from memory, from the Academy */
    await page.evaluate(() => { __cr.showMenu(); document.getElementById("mAcademy").click(); }); await page.waitForTimeout(400);
    const sub = await page.evaluate(() => document.getElementById("aSetupSub").textContent);
    ok("the Academy offers it, from memory once learned", /From memory, against the clock/.test(sub), sub);
    await page.evaluate(() => document.getElementById("aSetup").click()); await page.waitForTimeout(500);
    s = await st(page);
    ok("from memory: no words, no glow, a clock", s.s.memory && !/castle tower|corners/.test(s.bar) && /Rooks/.test(s.bar) && /⏱/.test(s.bar) && (!s.legal || !s.legal.length), s.bar);
    await page.evaluate(() => __cr.setupTap(0x44)); await page.waitForTimeout(250);
    s = await st(page);
    ok("…a miss still says where it lives, but nothing glows", /corners/.test(s.bar) && (!s.legal || !s.legal.length));
    await page.evaluate(() => document.getElementById("btnHint").click()); await page.waitForTimeout(250);
    s = await st(page);
    ok("…Help shows where, and costs three seconds", /\+3 s/.test(s.bar) && s.s.misses === 2 && JSON.stringify(s.legal) === "[0,7]", s.bar);
    for (const q of [0, 7, 1, 6, 2, 5, 3, 4, 21]) await tapAt(page, q);
    await page.waitForFunction(() => /new best/.test(document.getElementById("lessonBar").textContent), null, { timeout: 9000 });
    s = await st(page);
    ok("…a finish is timed, with the misses, and the best kept", s.rec.tries === 1 && s.rec.best > 6000 && s.rec.bestMisses === 2 && /2 misses/.test(s.bar), s.bar + " " + JSON.stringify(s.rec));

    /* leaving it */
    await page.evaluate(() => { __cr.startSetup({}); }); await page.waitForTimeout(300);
    await page.evaluate(() => __cr.startGame("pass", { clockStr: "none", fresh: true })); await page.waitForTimeout(500);
    s = await st(page);
    ok("a game started from the menu leaves the set-up behind", s.mode === "pass" && !s.s && !s.bar && JSON.stringify(s.board) === JSON.stringify(startBoard));
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nevery piece has a name and a home");
  process.exit(failed ? 1 : 0);
})();
