/* journey-check.js — can the Chess Room be beaten, and does beating it
   feel like something?

   In node, the road (journey.js):
     - eight chapters, one per coach, in the ladder's order, each with a
       story going in and coming out; the cup is three of the last coaches;
     - the road opens one chapter at a time, and a cleared chapter can be
       played again;
     - the cup: a win moves the run on, a loss or a draw starts it again,
       three in a row wins it, and nothing counts but the next match;
     - completion: out of a hundred, the parts weighted, a hundred only
       when everything is done (never by rounding), and the cup's and the
       hundred's rewards are in the collection, given at the right moment;
     - a tampered store comes back safe.

   In a browser, the whole of it:
     - the lobby's road sign names the first chapter;
     - the map: the first chapter open and marked, the rest locked;
     - a chapter card tells its story and plays its coach;
     - a win clears it: the card says so and offers the map, where it is
       stamped and the next chapter opens;
     - with every chapter cleared the cup opens; a loss in it starts it
       again; three wins win it, give its rewards, and the card offers the
       ending, which has every coach in it and your story in numbers;
     - and the road is still there after a reload.

   Run: node chess/tools/journey-check.js                                   */
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
const J = require("../journey.js");
const U = require("../unlocks.js");
const Rating = require("../rating.js");

/* ---------------- node: the road ---------------- */
{
  ok("eight chapters, one per coach, in the ladder's order",
     JSON.stringify(J.CHAPTERS.map((c) => c.id)) === JSON.stringify(Rating.LEVELS.map((l) => l.id)) && J.CHAPTERS.every((c, i) => c.n === i + 1));
  ok("…each with a title and a story going in and coming out", J.CHAPTERS.every((c) => c.title && c.intro.length > 40 && c.outro.length > 30));
  ok("the cup is three of the last coaches, the last one last", J.CUP.length === 3 && J.CUP[2] === "mentor" && J.CUP.every((c) => J.chapterOf(c)));
  const lad = { rungs: {} }, st = J.fresh();
  let r = J.road(lad, st);
  ok("the road starts at the first chapter, the rest closed", r.next === "acorn" && r.open.filter(Boolean).length === 1 && r.at === "acorn");
  lad.rungs.acorn = { stars: [1, 0, 0] };
  r = J.road(lad, st);
  ok("clearing a chapter opens the next, and it stays open to play again", r.next === "sprout" && r.open[0] && r.open[1] && !r.open[2] && r.count === 1);
  lad.rungs.clover = { stars: [1, 0, 0] };
  ok("a chapter beaten out of order (on the ladder) is cleared and open", J.road(lad, st).open[2] && J.road(lad, st).next === "sprout");
  J.CHAPTERS.forEach((c) => { lad.rungs[c.id] = { stars: [1, 0, 0] }; });
  r = J.road(lad, st);
  ok("all eight cleared opens the cup", r.cupOpen && r.at === "cup" && r.next === null);
  ok("…and only the next match counts", !J.cupResult(st, "mentor", true).counted && J.cupNext(st) === "bamboo");
  ok("a win moves the run on", J.cupResult(st, "bamboo", true).advanced && J.cupNext(st) === "pine");
  const reset = J.cupResult(st, "pine", false);
  ok("a loss or a draw starts it again", reset.reset && reset.reached === 1 && J.cupNext(st) === "bamboo" && st.cup.tries === 1);
  J.cupResult(st, "bamboo", true); J.cupResult(st, "pine", true);
  const won = J.cupResult(st, "mentor", true, 42);
  ok("three in a row wins it", won.won && st.cup.won && st.cup.wonAt === 42 && J.road(lad, st).at === "done");
  ok("…and once won, nothing more counts", !J.cupResult(st, "bamboo", true).counted);
}
{
  const w = J.WEIGHTS;
  ok("completion's parts make a hundred", w.stars + w.collect + w.lessons + w.cup === 100);
  const none = J.completion({});
  ok("nothing done is nought", none.pct === 0);
  const almost = J.completion({ stars: 24, lessons: { solved: 17, total: 17 }, collect: { n: 54, of: 55 }, cupWon: true });
  ok("a hundred only when everything is done, never by rounding", almost.pct === 99 && !almost.whole);
  const all = J.completion({ stars: 24, lessons: { solved: 17, total: 17 }, collect: { n: 55, of: 55 }, cupWon: true });
  ok("…and everything done is a hundred", all.pct === 100 && all.whole);
  const lad = { rungs: {} };
  const s1 = U.fresh();
  ok("the cup's rewards wait for the cup", !U.grant(s1, lad, 1, false, { cupWon: false }).some((i) => /champion|victory/.test(i.id)));
  ok("…and come with it", ["title-champion", "col-champion", "trail-victory"].every((id) => U.grant(U.fresh(), lad, 1, false, { cupWon: true }).some((i) => i.id === id)));
  ok("the Golden Acorn is for a hundred", !U.grant(U.fresh(), lad, 1, false, { completion: 99 }).some((i) => i.id === "title-acorn") &&
     U.grant(U.fresh(), lad, 1, false, { completion: 100 }).some((i) => i.id === "title-acorn"));
  const bad = J.clean({ v: 1, cup: { run: 9, won: "yes", best: 99 }, shown: { acorn: 1, evil: 1 }, intro: "x", ending: 1 });
  ok("a tampered store comes back safe", bad.cup.run === 2 && bad.cup.won === 1 && bad.cup.best === 3 && !bad.shown.evil && bad.ending === 1);
  ok("…and junk is a fresh start", JSON.stringify(J.clean(null)) === JSON.stringify(J.fresh()));
}

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe road adds up (it was not walked)");
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
  try {
    await page.goto(base + "/chess/#force2d"); await ready();
    const sign = await page.evaluate(() => document.getElementById("mJourneyTx").textContent + " | " + document.getElementById("mJourneyPct").textContent);
    ok("the lobby's road sign names the first chapter", /Chapter 1: The Gate/.test(sign) && /0%/.test(sign), sign);
    await page.evaluate(() => document.getElementById("mJourney").click()); await page.waitForTimeout(500);
    let nodes = await page.evaluate(() => [...document.querySelectorAll("#jrMap .jrNode")].map((n) => n.className));
    ok("the map: the first chapter open and marked, the rest locked, then the cup and the end",
       nodes.length === 10 && /here/.test(nodes[0]) && /open/.test(nodes[0]) && nodes.slice(1, 8).every((c) => /locked/.test(c)) && /cup/.test(nodes[8]) && /end/.test(nodes[9]), nodes.join(" / "));
    await page.evaluate(() => document.querySelectorAll("#jrMap .jrNode")[1].click());
    ok("a locked chapter says why", /Clear chapter 1/.test(await page.evaluate(() => document.getElementById("toast").textContent)));
    await page.evaluate(() => document.querySelectorAll("#jrMap .jrNode")[0].click()); await page.waitForTimeout(400);
    const card = await page.evaluate(() => ({ t: document.getElementById("chTitle").textContent, s: document.getElementById("chStory").textContent, stars: document.querySelectorAll("#chStars .chStar").length }));
    ok("a chapter card tells its story, and what its stars give", card.t === "The Gate" && /gate/i.test(card.s) && card.stars === 3, JSON.stringify(card));
    await asWhite();
    await page.evaluate(() => document.getElementById("chPlay").click()); await page.waitForTimeout(900);
    ok("…and plays its coach", await page.evaluate(() => __cr.mode === "coach" && /Acorn/.test(document.getElementById("nameTop").textContent)));
    await play(WIN);
    const cleared = await endCup();
    const mile = await until(() => [...document.querySelectorAll("#endMiles .erMile.chapter")].map((e) => e.textContent).join("") || null, 8000);
    ok("a win clears it, and the card says so", /Chapter 1 cleared/.test(mile || "") && /chapter 2/i.test(cleared || ""), (mile || "") + " | " + cleared);
    /* the end card's button goes straight to the next chapter's card (Play
       one tap away); its Back is the map. It used to open the map, and the
       chapter card was one more tap */
    await page.evaluate(() => document.getElementById("endCup").click()); await page.waitForTimeout(700);
    const nextCard = await page.evaluate(() => ({ open: !document.getElementById("ovChapter").classList.contains("hide"), kick: document.getElementById("chKick").textContent, play: !!document.getElementById("chPlay").offsetParent }));
    ok("…and its button opens the next chapter's card, Play and all", nextCard.open && /2/.test(nextCard.kick) && nextCard.play, JSON.stringify(nextCard));
    await page.evaluate(() => document.getElementById("chBack").click()); await page.waitForTimeout(700);
    nodes = await page.evaluate(() => [...document.querySelectorAll("#jrMap .jrNode")].map((n) => n.className));
    ok("…and on the map it is stamped, and the next chapter opens", /done/.test(nodes[0]) && /stamp/.test(nodes[0]) && /here/.test(nodes[1]) && /locked/.test(nodes[2]), nodes.slice(0, 3).join(" / "));

    /* to the end of the road */
    await page.evaluate(() => { const L = JSON.parse(localStorage.getItem("chessroom_ladder")); Rating.LEVELS.forEach((lv) => { L.rungs[lv.id] = L.rungs[lv.id] || { w: 1, d: 0, l: 0, stars: [0, 0, 0] }; L.rungs[lv.id].stars[0] = 1; }); localStorage.setItem("chessroom_ladder", JSON.stringify(L)); });
    await page.reload(); await ready();
    let st = await S();
    ok("with every chapter cleared the cup opens", st.road.at === "cup" && /Grove Cup is open/.test(await page.evaluate(() => document.getElementById("mJourneyTx").textContent)));
    await page.evaluate(() => __cr.openCup()); await page.waitForTimeout(300);
    ok("the cup card names the three, the first next", (await page.evaluate(() => document.querySelectorAll("#chStars .cupStep").length)) === 3 &&
       /Bamboo/.test(await page.evaluate(() => document.getElementById("chPlay").textContent)));
    await asWhite(); await page.evaluate(() => document.getElementById("chPlay").click()); await page.waitForTimeout(900);
    await play(WIN);
    ok("a cup win moves on to the next match", /2 of 3/.test((await endCup()) || "") && (await S()).st.cup.run === 1);
    await asWhite(); await page.evaluate(() => { document.getElementById("ovEnd").classList.add("hide"); document.getElementById("endCup").click(); }); await page.waitForTimeout(900);
    ok("…against the next coach", await page.evaluate(() => /Pine/.test(document.getElementById("nameTop").textContent)));
    await play(LOSE);
    const again = await endCup();
    st = await S();
    ok("a loss in the cup starts it again", st.st.cup.run === 0 && st.st.cup.tries === 1 && /again/.test(again || ""), again);
    for (const who of ["Bamboo", "Pine", "Oak"]) {
      await asWhite(); await page.evaluate(() => { document.getElementById("ovEnd").classList.add("hide"); document.getElementById("endCup").click(); }); await page.waitForTimeout(900);
      const top = await page.evaluate(() => document.getElementById("nameTop").textContent);
      if (top.indexOf(who) < 0) { ok("the cup goes " + who + " next", false, top); break; }
      await play(WIN);
      await endCup();
    }
    st = await S();
    ok("three wins in a row win the cup", st.st.cup.won === 1 && st.road.at === "done");
    const gold = await page.evaluate(() => ({ cls: document.getElementById("endCup").className, tx: document.getElementById("endCupTx").textContent }));
    ok("…the card offers the ending, in gold", /won/.test(gold.cls) && /Grove Cup/.test(gold.tx), JSON.stringify(gold));
    ok("…and the cup's rewards are yours", await page.evaluate(() => ["title-champion", "col-champion", "trail-victory"].every((k) => __cr.unlState().owned[k])));
    await page.evaluate(() => document.getElementById("endCup").click()); await page.waitForTimeout(900);
    const credits = await page.evaluate(() => ({ shown: !document.getElementById("ovCredits").classList.contains("hide"), title: document.getElementById("crTitle").textContent,
      cast: document.querySelectorAll("#crCast span").length, stats: document.querySelectorAll("#crStats span").length }));
    ok("the ending: every coach in it, and your story in numbers", credits.shown && /BEAT THE CHESS ROOM/.test(credits.title) && credits.cast === 8 && credits.stats === 6, JSON.stringify(credits));
    await page.evaluate(() => document.getElementById("crDone").click()); await page.waitForTimeout(400);
    ok("…and after it, the road with its completion to chase", await page.evaluate(() => !document.getElementById("ovJourney").classList.contains("hide") && /a hundred/.test(document.getElementById("jrSub").textContent)));
    await page.reload(); await ready();
    st = await S();
    ok("the road is still there after a reload", st.st.cup.won === 1 && st.st.ending === 1 && /beat the Chess Room/.test(await page.evaluate(() => document.getElementById("mJourneyTx").textContent)));
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe Chess Room can be beaten, and beating it is a moment");
  process.exit(failed ? 1 : 0);
})();
