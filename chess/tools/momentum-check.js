/* momentum-check.js — the bar that says who has the game, and the faces
   that feel it.

   In node, the arithmetic (momentum.js):
     - the start is level, the two sides are counted the same way, and the
       bar never quite reaches either end until a mate;
     - a piece up is a clear lean, and being out of bed and castled counts
       a little;
     - a trade half made is not a lurch: a queen taken by a queen that can
       be taken back barely moves it, while a piece taken for free does;
     - it never shows a loss the coach has not punished yet (that would be
       a hint);
     - a blow's surge fades over the next moves;
     - it says when somebody takes the lead and when the game turns;
     - and the story of a game: a comeback, a win never behind, the one
       that got away, a seesaw.

   In a browser, the room:
     - the bar is there in a game against the coach (with the coach's face
       at its end and yours at the other), not in a lesson, and goes when
       switched off (and stays off after a reload);
     - it never covers the board, on a phone or a laptop;
     - win the coach's queen for nothing and the bar swings your way, the
       banner says so, and the coach is nervous: sweating, with a bubble
       over its head;
     - give your queen away (Légal's mate) and it swings to the coach, who
       is pleased with itself; then mate it, and the bar goes all the way,
       COMEBACK! is said, and the card tells the story of the game, drawn;
     - a take-back is not counted, and turning the board turns the bar.

   Run: node chess/tools/momentum-check.js                                */
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
const Chess = require("../engine.js");
const Mo = require("../momentum.js");

/* ---------------- node: the arithmetic ---------------- */
const game = (sans, fen) => {
  const g = Chess.create(fen), st = Mo.create(g.board), evs = [], ms = [];
  for (const san of sans) {
    const mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, "") === san.replace(/[+#]$/, ""));
    if (!mv) throw new Error("illegal " + san);
    const took = mv.capt || ((mv.flags & Chess.F_EP) ? (mv.piece > 0 ? -1 : 1) : 0);
    Chess.play(g, mv);
    const s = Chess.status(g);
    evs.push(Mo.step(st, { board: g.board, mover: mv.piece > 0 ? 1 : -1, captured: took, check: s.reason === "check" || s.reason === "checkmate",
                           mate: s.reason === "checkmate", piece: mv.piece, retake: !!took && Chess.attacked(g, mv.to, mv.piece > 0 ? -1 : 1) }));
    ms.push(st.m);
  }
  return { g, st, evs, ms };
};
{
  const g = Chess.create();
  const b = Mo.measure(g.board);
  ok("the start is level", b.material === 0 && b.activity === 0 && Mo.create(g.board).m === 0, JSON.stringify(b));
  const mirror = Mo.measure(Chess.create("rnbqkb1r/pppppppp/5n2/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 2 2").board);
  ok("both sides are counted the same way", Math.abs(mirror.activity) < 1e-9 && mirror.white.activity > 0, JSON.stringify(mirror));
  ok("the bar never quite reaches an end on material alone", Mo.lean(39) < 1 && Mo.lean(-39) > -1 && Mo.lean(3) > 0.4 && Mo.lean(3) < 0.75);
  const knight = Mo.measure(Chess.create("rnbqkb1r/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1").board);
  ok("a knight up is a clear lean", knight.material === 3 && Mo.lean(knight.material) > 0.5);
  const castled = Mo.measure(Chess.create("rnbq1rk1/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w - - 6 5").board);
  ok("castling and pieces in play count, a little", castled.white.activity > 0.8 && Math.abs(castled.activity) < 1e-9, JSON.stringify(castled));
}
{
  /* the queens come off: Qxd8+ Kxd8 */
  const t = game(["e4", "e5", "d4", "exd4", "Qxd4", "Nc6", "Qd5", "Qf6", "Qxf7+", "Qxf7"]);
  ok("a queen grabbing a defended pawn shows no loss yet…", Math.abs(t.ms[8]) < 0.45, t.ms.map((x) => x.toFixed(2)).join(" "));
  ok("…and when the coach takes the queen, it shows", t.ms[9] < -0.8, t.ms[9].toFixed(2));
  const trade = game(["e4", "d5", "exd5", "Qxd5", "Nc3", "Qe6+", "Qe2", "Qxe2+", "Bxe2"]);
  ok("…and a queen trade swings a little and comes back", Math.abs(trade.ms[7]) < 0.4 && Math.abs(trade.ms[8]) < 0.25, trade.ms.map((x) => x.toFixed(2)).join(" "));
  const free = game(["e4", "e5", "Nf3", "Qh4", "Nxh4"]);
  ok("a queen taken for nothing swings it hard", free.ms[4] > 0.8, free.ms[4].toFixed(2));
  ok("…and says White has the lead", free.evs[4].some((e) => e.type === "lead" && e.side === 1) || free.st.lead === 1, JSON.stringify(free.evs[4]));
  /* a queen that takes a defended pawn: a mistake, but the coach has not shown it yet */
  const greedy = game(["e4", "e5", "Qh5", "Nc6", "Qxf7"]);
  ok("it never shows you a loss the coach has not punished yet", greedy.ms[4] >= greedy.ms[3] - 0.05, greedy.ms.map((x) => x.toFixed(2)).join(" "));
  const st = Mo.create(Chess.create().board);
  Mo.step(st, { board: Chess.create().board, mover: 1, captured: 0, check: true });
  const s1 = st.surge;
  Mo.step(st, { board: Chess.create().board, mover: -1, captured: 0, check: false });
  Mo.step(st, { board: Chess.create().board, mover: 1, captured: 0, check: false });
  ok("a blow's surge fades over the next moves", s1 > 0 && st.surge > 0 && st.surge < s1 * 0.4, s1.toFixed(2) + " → " + st.surge.toFixed(2));
}
{
  /* Légal's mate: White gives up the queen, then mates */
  const L = game(["e4", "e5", "Nf3", "d6", "Bc4", "Bg4", "Nc3", "g6", "Nxe5", "Bxd1", "Bxf7+", "Ke7", "Nd5"]);
  ok("giving up the queen turns the game", L.evs[9].some((e) => e.type === "shift" && e.side === -1), JSON.stringify(L.evs[9]));
  ok("a mate is the whole game, whatever the material", L.st.m === 1);
  const S = Mo.story(L.st.hist, 1, 1);
  ok("…and it was a comeback", S.comeback && S.low < -0.6 && S.lowAt >= 9, JSON.stringify(S));
  ok("…which, for Black, is the one that got away", Mo.story(L.st.hist, 1, -1).slipped);
  const wire = Mo.story([0, 0.1, 0.2, 0.25, 0.3, 0.2, 0.3, 0.4, 0.5, 0.45, 0.5, 0.6, 0.6, 0.7, 0.8, 0.9, 1], 1, 1);
  ok("a win never behind is told apart", wire.wire && !wire.comeback);
  const saw = Mo.story([0, 0.3, -0.3, 0.3, -0.3, 0.4], 0, 1);
  ok("…and so is a seesaw", saw.seesaw && saw.turns >= 3);
  ok("a draw is nobody's comeback", !Mo.story([0, -0.8, 0], 0, 1).comeback);
}

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." :
    "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe momentum adds up (the room was not opened)");
  process.exit(failed ? 1 : 0);
}
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
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
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const run = async (name, viewport, flat) => {
    const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 });
    await ctx.addInitScript(() => {
      try { const p = JSON.parse(localStorage.getItem("chessroom_prefs") || "{}"); p.welcomed = true; p.tips = { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 };
            p.met = { acorn: 1, sprout: 1, clover: 1, club: 1, bamboo: 1, cactus: 1, pine: 1, mentor: 1 }; localStorage.setItem("chessroom_prefs", JSON.stringify(p)); } catch (e) {}
    });
    const page = await ctx.newPage(), errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
    const T = (s) => "[" + name + "] " + s;
    const M = () => page.evaluate(() => __cr.moState());
    const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn); if (v) return v; await page.waitForTimeout(80); } return null; };
    const play = (san, src) => page.evaluate(([x, s]) => {
      const g = __cr.game, mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, "") === x.replace(/[+#]$/, ""));
      if (!mv) return false; __cr.commitMove(mv, s); return true;
    }, [san, src]);
    /* a pair: yours, and the coach's straight after, before it can think of its own */
    const pair = async (a, b) => { await play(a, "local"); if (b) await play(b, "coach"); await page.waitForTimeout(700); };
    const coach = (id) => page.evaluate((k) => { document.getElementById("ovMenu").classList.add("hide"); __cr.moBannerForTest(); __cr.startGame("coach", { humanSide: 1, skill: k, clockStr: "none", fresh: true }); }, id);
    try {
      await page.goto(base + "/chess/" + (flat ? "#force2d" : ""));
      await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
      await coach("club"); await page.waitForTimeout(800);
      let s = await M();
      ok(T("in a game against the coach the bar is there, level"), s.on && s.shown && Math.abs(s.m) < 1e-9 && Math.abs(s.x - 0.5) < 0.01, JSON.stringify(s));
      const caps = await page.evaluate(() => ({ top: !!document.querySelector("#moCapTop img"), bot: document.getElementById("moCapBot").className }));
      ok(T("…with the coach's face at one end and yours at the other"), caps.top && /you/.test(caps.bot), JSON.stringify(caps));
      /* it never covers the board */
      const geo = await page.evaluate(() => {
        const r = __cr.renderer, st = document.getElementById("stage").getBoundingClientRect(), bar = document.getElementById("mo").getBoundingClientRect();
        let low = 0;
        for (const sq of [0, 7, 3, 4]) { const p = r.squareToScreen(sq); if (p) low = Math.max(low, p.y + st.top); }
        return { barTop: bar.top, barBottom: bar.bottom, rank1: low, stageBottom: st.bottom, w: bar.width };
      });
      ok(T("…and it never covers the board"), geo.barTop > geo.rank1 + 6 && geo.barBottom <= geo.stageBottom && geo.w > 150, JSON.stringify(geo));

      /* the coach throws its queen away: you have it, and it knows */
      await pair("e4", "e5"); await pair("Nf3", "Qh4"); await pair("Nxh4");
      s = await until(() => { const s = __cr.moState(); return s.goal < 0.2 && s.banner ? s : null; }, 3000) || await M();
      ok(T("win the coach's queen for nothing and the bar swings your way"), s.m > 0.8 && s.goal < 0.2, JSON.stringify({ m: s.m, goal: s.goal }));
      ok(T("…and the game says so"), /MOMENTUM/.test(s.banner), s.banner);
      const feel = await page.evaluate(() => ({ base: __cr.castState().face && __cr.castState().face.base, emote: !!document.querySelector("#oppFaceWrap .emote") }));
      ok(T("…and the coach is nervous, with a bubble over its head"), (feel.base === "nervous" || flat) && feel.emote, JSON.stringify(feel));
      /* a take-back: that move never happened */
      await page.evaluate(() => __cr.undoPlyForTest(__cr.game.played.length - 4)); await page.waitForTimeout(300);
      s = await M();
      ok(T("a take-back is not counted"), s.plies === 4 && s.m < 0.5, JSON.stringify({ plies: s.plies, m: s.m }));
      /* the board turned: the bar turns with it */
      const before = s.goal;
      await page.evaluate(() => document.getElementById("btnFlip").click()); await page.waitForTimeout(400);
      s = await M();
      const flipped = await page.evaluate(() => !!document.querySelector("#moCapBot img"));
      ok(T("turning the board turns the bar"), flipped && Math.abs((1 - s.goal) - before) < 0.05, JSON.stringify({ before, goal: s.goal }));
      await page.evaluate(() => document.getElementById("btnFlip").click()); await page.waitForTimeout(200);

      /* Légal's mate, against Cactus: the queen given up, then mate */
      await coach("cactus"); await page.waitForTimeout(800);
      for (const [a, b] of [["e4", "e5"], ["Nf3", "d6"], ["Bc4", "Bg4"], ["Nc3", "g6"]]) await pair(a, b);
      await page.evaluate(() => __cr.moBannerForTest());
      await pair("Nxe5", "Bxd1");
      s = await until(() => { const s = __cr.moState(); return s.banner ? s : null; }, 3000) || await M();
      ok(T("give your queen away and it swings to the coach"), s.m < -0.6 && s.goal > 0.75 && /MOMENTUM/.test(s.banner), JSON.stringify({ m: s.m, goal: s.goal, banner: s.banner }));
      const smug = await page.evaluate(() => __cr.castState().face && __cr.castState().face.base);
      ok(T("…and the coach is pleased with itself"), smug === "smug" || flat, String(smug));
      await pair("Bxf7+", "Ke7"); await play("Nd5", "local");
      s = await until(() => { const s = __cr.moState(); return /COMEBACK/.test(s.banner) ? s : null; }, 4000) || await M();
      ok(T("then mate it: the bar goes all the way, and it was a COMEBACK!"), s.m === 1 && s.story && s.story.comeback && /COMEBACK/.test(s.banner), JSON.stringify({ m: s.m, banner: s.banner, story: s.story && s.story.comeback }));
      await page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 8000 }).catch(() => {});
      const card = await until(() => { const st = document.getElementById("endStory"); const mile = document.querySelector("#endMiles .erMile.comeback");
        return !st.classList.contains("hide") && mile ? { tx: document.getElementById("endStoryTx").textContent, paths: st.querySelectorAll("path").length, mile: mile.textContent } : null; }, 9000);
      ok(T("…and the card tells the story of the game, drawn"), card && card.paths >= 3 && /Behind at move/.test(card.tx) && /Comeback/.test(card.mile), JSON.stringify(card));

      /* off is off, and stays off */
      await page.evaluate(() => document.getElementById("setMomentum").click());
      await coach("acorn"); await page.waitForTimeout(500);
      ok(T("switched off, there is no bar"), !(await M()).shown);
      await page.reload();
      await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
      await coach("acorn"); await page.waitForTimeout(500);
      ok(T("…and it stays off after a reload"), !(await M()).shown && !(await page.evaluate(() => document.getElementById("setMomentum").classList.contains("sel"))));
      await page.evaluate(() => document.getElementById("setMomentum").click());
      await page.waitForTimeout(200);
      ok(T("…and comes back when switched on"), (await M()).shown);
      await page.evaluate(() => { __cr.startLesson && __cr.startLesson(0); });
      await page.waitForTimeout(600);
      ok(T("a lesson has no bar"), !(await M()).shown || (await page.evaluate(() => __cr.mode)) !== "lesson");
      ok(T("nothing shouted at the console"), errs.length === 0, errs.slice(0, 3).join(" | "));
    } catch (e) {
      ok(T("the check itself fell over"), false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
    }
    await ctx.close();
  };
  await run("phone 2D", { width: 390, height: 844 }, true);
  await run("desk 3D", { width: 1280, height: 800 }, false);
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe bar leans with the game, the coach feels it, and a comeback is a comeback");
  process.exit(failed ? 1 : 0);
})();
