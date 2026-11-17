/* pace-check.js — does the room go at the player's pace?

   In node, the reading and the dials (pace.js):
     - a slow thinker reads gentle, a quick one brisk, someone in between
       steady; saying "I'm new" at the door reads gentle for the first
       games; a player who wins most games or taps past the celebrations
       leans brisk, one who leans on help leans gentle; Settings can pin it;
     - a think shorter than a third of a second is not a think, and one
       longer than ten minutes counts as ten;
     - the dials go the right way: the gentle coach waits longest, words
       stay up longest, the card takes longest; a brisk player is never
       nudged; a nudge comes a while after a player's usual think, never
       before its floor or after its ceiling;
     - losses in a row to one coach: counted per coach, reset by a win,
       untouched by a friendly loss; a friendly game is offered after two
       (gentle) or three; the friendly coach is looser and shallower;
     - the fast track: only a clean third-star win, and never for a
       gentle player; the road opens ahead without clearing anything;
     - a tampered store comes back safe.

   In a browser, on a phone:
     - Settings: Auto says what it reads and why; a pinned pace sticks;
     - "I'm new" at the door makes the room gentle;
     - the coach takes a breath before answering a gentle player, and
       answers a brisk one at once;
     - your thinking time is kept, move by move;
     - someone thinking a long while is offered a clue, kindly, by the
       coach as well as the room; never with a clock running, and never
       for a brisk player;
     - the end card comes up sooner for a brisk player, and a tap on it
       brings its lines at once (and is remembered);
     - a run of losses to one coach offers a friendly game: easy, not
       rated, and a win in it opens the road but clears nothing;
     - a fast-track win opens the road two coaches ahead.

   Run: node chess/tools/pace-check.js                                      */
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
const P = require("../pace.js");
const J = require("../journey.js");

/* ---------------- node: the reading and the dials ---------------- */
{
  const withMoves = (ms, extra) => { const s = P.fresh(); for (let i = 0; i < 12; i++) P.think(s, ms + (i % 3) * 500); return Object.assign(s, extra || {}); };
  ok("a new player, before any moves, is steady", P.read(P.fresh()).pace === "steady" && P.read(P.fresh()).think === null);
  ok("a slow thinker reads gentle", P.read(withMoves(30000)).pace === "gentle", JSON.stringify(P.read(withMoves(30000))));
  ok("a quick one reads brisk", P.read(withMoves(3000)).pace === "brisk");
  ok("someone in between reads steady", P.read(withMoves(12000)).pace === "steady");
  ok("\"I'm new\" at the door reads gentle for the first games", P.read(Object.assign(P.fresh(), { newDoor: 1 })).pace === "gentle" &&
     P.read(withMoves(12000, { newDoor: 1, games: Array(6).fill({ won: 0, lost: 1, helped: 0, plies: 40 }) })).pace === "steady");
  const winner = withMoves(9000, { games: Array(5).fill({ won: 1, lost: 0, helped: 0, plies: 50 }), cards: 5, skips: 4 });
  ok("winning most games and tapping past the celebrations lean brisk", P.read(winner).pace === "brisk", P.read(winner).why.join("; "));
  const helped = withMoves(17000, { games: Array(4).fill({ won: 0, lost: 1, helped: 1, plies: 30 }) });
  ok("leaning on help leans gentle", P.read(helped).pace === "steady" && P.read(Object.assign(helped, { newDoor: 1, games: helped.games.slice(0, 3) })).pace === "gentle");
  ok("…and every reading says why", P.read(withMoves(30000)).why.length > 0);
  const pinned = withMoves(3000); P.setMode(pinned, "gentle");
  ok("Settings can pin it, whatever the room reads", P.read(pinned).pace === "gentle" && P.read(pinned).auto === "brisk" && P.setMode(pinned, "nonsense") === "auto");
  const t = P.fresh();
  ok("a third of a second is not a think; ten minutes is the most a think counts", !P.think(t, 120) && P.think(t, 999999999) && t.moves[0] === 600000);
  const kept = P.fresh(); for (let i = 0; i < 60; i++) P.think(kept, 1000 + i);
  ok("only the last forty thinks are kept", kept.moves.length === 40 && kept.moves[0] === 1020);
  const D = P.DIALS;
  ok("the gentle coach waits longest, the brisk one hardly at all", D.gentle.reply > D.steady.reply && D.steady.reply > D.brisk.reply && D.brisk.reply <= 200);
  ok("words stay up longest, and the card takes longest, at a gentle pace", D.gentle.words > D.steady.words && D.steady.words > D.brisk.words &&
     D.gentle.card > D.steady.card && D.steady.card > D.brisk.card);
  ok("a brisk player is never nudged", P.nudgeAfter({ pace: "brisk", think: 2000 }) === 0);
  ok("a nudge comes a while after a player's usual think, within its floor and ceiling",
     P.nudgeAfter({ pace: "gentle", think: 30000 }) === 75000 && P.nudgeAfter({ pace: "gentle", think: 4000 }) === 45000 &&
     P.nudgeAfter({ pace: "gentle", think: 300000 }) === 120000 && P.nudgeAfter({ pace: "steady", think: null }) === 135000);
  const run = P.fresh();
  P.game(run, { coach: "acorn", lost: true }); P.game(run, { coach: "acorn", lost: true });
  ok("losses in a row to one coach are counted", run.run.coach === "acorn" && run.run.n === 2);
  P.game(run, { coach: "acorn", lost: true, friendly: true });
  ok("…a friendly loss is not one of them", run.run.n === 2);
  ok("…a friendly game is offered after two at a gentle pace, three otherwise",
     P.friendlyDue(run, { pace: "gentle" }, "acorn") && !P.friendlyDue(run, { pace: "steady" }, "acorn") && !P.friendlyDue(run, { pace: "gentle" }, "sprout"));
  P.game(run, { coach: "acorn", won: true });
  ok("…and a win ends the run", run.run.n === 0);
  P.game(run, { coach: "sprout", lost: true });
  ok("…as does moving on to another coach", run.run.coach === "sprout" && run.run.n === 1);
  const real = { ms: 1500, maxDepth: 2, noise: 300, nodes: 30000 }, soft = P.easy(real);
  ok("the friendly coach is the same coach, looser and a ply shallower", soft.noise > real.noise * 1.5 && soft.maxDepth === 1 && soft.nodes === real.nodes && real.noise === 300 &&
     P.easy({ maxDepth: 1, noise: 0 }).maxDepth === 1);
  ok("the fast track: only a clean win at third-star accuracy, and not at a gentle pace",
     P.fastTrack({ pace: "steady" }, { won: true, helped: false, acc: 84 }) && !P.fastTrack({ pace: "steady" }, { won: true, helped: true, acc: 95 }) &&
     !P.fastTrack({ pace: "brisk" }, { won: true, acc: 79 }) && !P.fastTrack({ pace: "gentle" }, { won: true, acc: 99 }) &&
     !P.fastTrack({ pace: "brisk" }, { won: true, acc: 90, friendly: true }) && !P.fastTrack({ pace: "brisk" }, { won: true, acc: null }));
  const lad = { rungs: { acorn: { w: 1, d: 0, l: 0, stars: [1, 1, 1] } } }, js = J.fresh();
  ok("the road opens ahead without clearing anything", J.openAhead(lad, js, "clover") === "clover" && J.coachOpen(lad, "clover", js) &&
     !J.cleared(lad, "clover") && J.road(lad, js).next === "sprout" && J.road(lad, js).open[2] && J.openAhead(lad, js, "clover") === null &&
     J.openAhead(lad, js, "sprout") === null);
  ok("…and is kept", J.clean(JSON.parse(JSON.stringify(js))).open.clover === 1 && !J.clean({ v: 1, open: { evil: 1 } }).open.evil);
  ok("…and a place opens with it", J.placeOpen(lad, "cafe", Object.assign(J.fresh(), { open: { club: 1 } })) && !J.placeOpen(lad, "cafe", J.fresh()));
  const bad = P.clean({ v: 1, mode: "warp", moves: [5, -1, "x", 1e12, 9000], games: [null, { won: "yes", plies: -4 }], cards: -3, skips: 50, run: { coach: 7 } });
  ok("a tampered store comes back safe", bad.mode === "auto" && JSON.stringify(bad.moves) === "[5,9000]" && bad.games.length === 1 && bad.games[0].won === 1 &&
     bad.games[0].plies === 0 && bad.cards === 0 && bad.skips === 0 && bad.run.coach === null);
  ok("…and junk is a fresh start", JSON.stringify(P.clean("junk")) === JSON.stringify(P.fresh()));
}

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe pace adds up (it was not walked)");
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
  const seedPace = (st) => page.evaluate((s) => __cr.paceSet(s), st);
  const paceOf = () => page.evaluate(() => __cr.paceRead().pace);
  const ladder = (beaten) => page.evaluate((b) => { const L = { v: 1, rungs: {}, lastSide: -1 }; b.forEach((id) => { L.rungs[id] = { w: 1, d: 0, l: 0, stars: [1, 0, 0] }; }); localStorage.setItem("chessroom_ladder", JSON.stringify(L)); __cr.reloadLadderForTest(); }, beaten);
  const coachGame = (k, side, clockStr) => page.evaluate(([k, side, c]) => __cr.startGame("coach", { humanSide: side, skill: k, clockStr: c || "none", fresh: true }), [k, side || 1, clockStr]);
  /* a human move, then how long until the coach answers */
  const replyMs = () => page.evaluate(async () => {
    const g = __cr.game, n = g.played.length, mv = Chess.moves(g).find((m) => Chess.toSAN(g, m) === "e4") || Chess.moves(g)[0];
    const t0 = performance.now(); __cr.commitMove(mv, "local");
    while (__cr.game.played.length < n + 2 && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 25));
    return Math.round(performance.now() - t0);
  });
  const toastTx = () => page.evaluate(() => document.getElementById("toast").classList.contains("show") ? document.getElementById("toast").textContent : "");
  const endUpAfter = (seq) => page.evaluate(async (q) => {
    for (const [x, src] of q) {
      const g = __cr.game, mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, "") === x.replace(/[+#]$/, ""));
      if (!mv) return -1;
      const t0 = performance.now();
      __cr.commitMove(mv, src);
      if (/#/.test(x)) { while (document.getElementById("ovEnd").classList.contains("hide") && performance.now() - t0 < 9000) await new Promise((r) => setTimeout(r, 20)); return Math.round(performance.now() - t0); }
      await new Promise((r) => setTimeout(r, src === "coach" ? 120 : 60));
    }
    return -2;
  }, seq);
  try {
    await page.goto(base + "/chess/#force2d"); await ready();
    /* Settings */
    let note = await page.evaluate(() => { __cr.syncSettingsUI && __cr.syncSettingsUI(); return document.getElementById("setPaceNote").textContent; });
    ok("Settings: Auto says what it reads, and that it is still watching", /Auto: reading you as Steady/.test(note) && /until it has seen you play/.test(note) &&
       await page.evaluate(() => document.getElementById("paAuto").classList.contains("sel")), note);
    await page.evaluate(() => document.getElementById("paGentle").click());
    note = await page.evaluate(() => document.getElementById("setPaceNote").textContent);
    ok("…a pinned pace says what it does, and sticks", /pauses before it answers/.test(note) && (await paceOf()) === "gentle" &&
       await page.evaluate(() => JSON.parse(localStorage.getItem("chessroom_pace")).mode === "gentle" && document.getElementById("paGentle").classList.contains("sel")));
    await page.reload(); await ready();
    ok("…across a reload", (await paceOf()) === "gentle");

    /* the coach's answer, at the player's pace */
    await coachGame("acorn", 1); await page.waitForTimeout(400);
    const slow = await replyMs();
    await seedPace({ v: 1, mode: "brisk" }); await coachGame("acorn", 1); await page.waitForTimeout(400);
    const quick = await replyMs();
    ok("the coach takes a breath before answering a gentle player, and answers a brisk one at once", slow >= 1250 && quick < 1000 && slow - quick > 600, slow + " ms → " + quick + " ms");

    /* thinking time is kept */
    await seedPace({ v: 1, mode: "auto" }); await coachGame("acorn", 1); await page.waitForTimeout(1300);
    await page.evaluate(() => { const g = __cr.game; __cr.commitMove(Chess.moves(g).find((m) => Chess.toSAN(g, m) === "d4"), "local"); });
    const kept = await page.evaluate(() => __cr.paceState().moves);
    ok("your thinking time is kept, move by move", kept.length === 1 && kept[0] >= 1200 && kept[0] < 4000, JSON.stringify(kept));

    /* a long think, and a kind word */
    await seedPace({ v: 1, mode: "gentle" }); await page.evaluate(() => __cr.setNudgeMs(1500));
    await coachGame("acorn", 1);
    const nudge = await until(() => { const t = document.getElementById("toast"); return t.classList.contains("show") && /Take your time/.test(t.textContent) ? t.textContent : null; }, 5000);
    ok("someone thinking a long while is offered a clue, kindly", /no clock/.test(nudge || "") && /A clue/.test(nudge || ""), nudge);
    ok("…and the coach says so too", await page.evaluate(() => !document.getElementById("oppSay").classList.contains("hide") &&
       /time|hurry|wait/i.test(document.getElementById("oppSay").textContent)), await page.evaluate(() => document.getElementById("oppSay").textContent));
    await page.evaluate(() => [...document.querySelectorAll("#toast button")].find((b) => /clue/.test(b.textContent)).click()); await page.waitForTimeout(300);
    ok("…and the clue is the help lamp's Think", /check|capture|attack|look|piece|move/i.test(await toastTx()), await toastTx());
    await coachGame("acorn", 1, "5+0"); await page.waitForTimeout(2600);
    ok("never with a clock running", !/Take your time/.test(await toastTx()));
    await seedPace({ v: 1, mode: "brisk" }); await coachGame("acorn", 1); await page.waitForTimeout(2600);
    ok("…and never for a brisk player", !/Take your time/.test(await toastTx()));
    await page.evaluate(() => __cr.setNudgeMs(0));

    /* the end card, at the player's pace */
    const MATE = [["e4", "local"], ["e5", "coach"], ["Bc4", "local"], ["Nc6", "coach"], ["Qh5", "local"], ["Nf6", "coach"], ["Qxf7#", "local"]];
    await seedPace({ v: 1, mode: "gentle" }); await coachGame("acorn", 1); await page.waitForTimeout(300);
    const gentleCard = await endUpAfter(MATE);
    await page.evaluate(() => document.getElementById("ovEnd").classList.add("hide"));
    /* a first win against Acorn this time, so the card has lines to tell */
    await ladder([]);
    await seedPace({ v: 1, mode: "brisk" }); await coachGame("acorn", 1); await page.waitForTimeout(300);
    const briskCard = await endUpAfter(MATE);
    ok("the end card comes up sooner for a brisk player", gentleCard >= 1900 && briskCard <= 1200 && briskCard > 0, gentleCard + " ms → " + briskCard + " ms");
    const before = await page.evaluate(() => document.querySelectorAll("#endMiles .erMile").length);
    await page.evaluate(() => document.getElementById("endTitle").click()); await page.waitForTimeout(150);
    /* (a rated first win queues its lines a couple of seconds out, even briskly) */
    const after = await page.evaluate(() => document.querySelectorAll("#endMiles .erMile").length);
    ok("a tap on the card brings its lines at once", after > before, before + " → " + after);
    ok("…and is remembered as a tap past the celebration", await page.evaluate(() => __cr.paceState().skips === 1 && __cr.paceState().cards === 1));

    /* a run of losses, and a friendly game */
    await page.evaluate(() => document.getElementById("ovEnd").classList.add("hide"));
    await ladder([]);
    await seedPace({ v: 1, mode: "steady", run: { coach: "acorn", n: 2 } });
    const rated0 = await page.evaluate(() => Rating.summary(Rating.load((k) => localStorage.getItem(k))).games);
    await coachGame("acorn", 1); await page.waitForTimeout(300);
    const LOSE = [["f3", "local"], ["e5", "coach"], ["g4", "local"], ["Qh4#", "coach"]];
    await endUpAfter(LOSE);
    const fb = await until(() => !document.getElementById("endFriendly").classList.contains("hide") ? document.getElementById("endFriendly").textContent : null, 6000);
    ok("a third loss in a row to one coach offers a friendly game", /friendly game with Acorn/.test(fb || "") && /nothing's rated/.test(fb || ""), fb);
    const real = await page.evaluate(() => __cr.coachSearchOpts());
    await page.evaluate(() => { const L = JSON.parse(localStorage.getItem("chessroom_ladder")); L.lastSide = -1; localStorage.setItem("chessroom_ladder", JSON.stringify(L)); __cr.reloadLadderForTest(); });
    await page.evaluate(() => document.getElementById("endFriendly").click()); await page.waitForTimeout(900);
    const fr = await page.evaluate(() => ({ on: __cr.friendly(), opts: __cr.coachSearchOpts(), mode: __cr.mode, toast: document.getElementById("toast").textContent }));
    ok("…in which the coach goes easy, and says so", fr.on && fr.mode === "coach" && fr.opts.noise > real.noise && fr.opts.maxDepth <= real.maxDepth && /friendly game/.test(fr.toast), JSON.stringify({ real, fr }));
    const rated1 = await page.evaluate(() => Rating.summary(Rating.load((k) => localStorage.getItem(k))).games);
    await endUpAfter(MATE);
    const fmile = await until(() => [...document.querySelectorAll("#endMiles .erMile")].map((e) => e.textContent).join(" | ") || null, 8000);
    ok("a friendly win opens the road", /friendly win/.test(fmile || "") && /Sprout is open now/.test(fmile || ""), fmile);
    const after2 = await page.evaluate(() => ({ games: Rating.summary(Rating.load((k) => localStorage.getItem(k))).games, star: (JSON.parse(localStorage.getItem("chessroom_ladder")).rungs.acorn || { stars: [0] }).stars[0],
      again: document.getElementById("endRematchTx").textContent }));
    ok("…and is not rated, and clears nothing", after2.games === rated1 && rated1 === rated0 + 1 && !after2.star && /for real/.test(after2.again), JSON.stringify({ rated0, rated1, after2 }));
    await page.evaluate(() => { document.getElementById("ovEnd").classList.add("hide"); __cr.showMenu(); }); await page.waitForTimeout(300);
    ok("…Sprout is on the ladder now, and Clover still a shadow", await page.evaluate(() => { const r = document.querySelectorAll("#mLadder .rung"); return !r[1].classList.contains("locked") && r[2].classList.contains("locked"); }));

    /* the fast track */
    await ladder(["acorn"]); await seedPace({ v: 1, mode: "brisk" });
    await coachGame("acorn", 1); await page.waitForTimeout(300);     /* a rated game: a friendly one never fast-tracks */
    await page.evaluate(() => { const t = document.getElementById("toast"); t.classList.remove("show", "acts"); __cr.paceFastTrackForTest("acorn", 88); }); await page.waitForTimeout(200);
    const ft = await page.evaluate(() => ({ open: __cr.jrnState().road.open, st: __cr.jrnState().st.open, pace: __cr.paceRead().pace }));
    ok("a fast-track win opens the road two coaches ahead", /Fast track/.test(await toastTx()) && ft.open[2] && !ft.open[3], (await toastTx()) + " " + JSON.stringify(ft));

    /* the door */
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p2 = await ctx2.newPage();
    await p2.goto(base + "/chess/#force2d");
    await p2.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    const door = await p2.evaluate(() => { const b = document.getElementById("mNew"); if (!b || !b.offsetParent) return null; b.click(); return __cr.paceRead(); });
    ok("\"I'm new\" at the door makes the room gentle", door && door.pace === "gentle" && /new to chess/.test(door.why.join(" ")), JSON.stringify(door));
    await ctx2.close();
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe room goes at the player's pace");
  process.exit(failed ? 1 : 0);
})();
