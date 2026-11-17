/* earn-check.js — is every coach and every place earned, never picked?

   In node, the gate (journey.js):
     - the first coach is always open; every other one opens when you beat
       the one before it, and stays open once beaten;
     - the coach to beat next is the first one you have not beaten;
     - a coach asked for that is not open becomes that one;
     - the park and the studio are yours from the start; the café, the
       grand room and the library open with the first chapter set there,
       and a win says which places it just opened.

   In a browser, from a new player's first visit:
     - the lobby's ladder: Acorn to play, seven shadows with padlocks;
     - a shadow, tapped, is the padlock card (who to beat, and a button to
       play them), and no game starts;
     - the new-game card's chooser and your record show the same locks, and
       a locked row cannot be chosen;
     - the Studio's places: the park open, the rest locked, and a locked
       one says how to get there;
     - a place the road has not reached is not where a saved preference
       can sit you down;
     - beating Acorn unlocks Sprout: the end card says so, the next button
       says "just unlocked", and the ladder has Sprout NEW! and Clover
       still a shadow;
     - beating Clover opens the café too, and "Sit there" takes you there.

   Run: node chess/tools/earn-check.js                                      */
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

/* ---------------- node: the gate ---------------- */
{
  const ids = J.CHAPTERS.map((c) => c.id);
  const lad = (beaten) => ({ rungs: Object.fromEntries(beaten.map((id) => [id, { w: 1, d: 0, l: 0, stars: [1, 0, 0] }])) });
  const none = lad([]);
  ok("a new player: the first coach open, every other one shut", J.coachOpen(none, ids[0]) && ids.slice(1).every((id) => !J.coachOpen(none, id)));
  ok("beat one and the next one opens, and only that one", J.coachOpen(lad(["acorn"]), "sprout") && !J.coachOpen(lad(["acorn"]), "clover"));
  ok("every coach opens from the one before it", ids.every((id, i) => i === 0 || (J.coachOpen(lad([ids[i - 1]]), id) && !J.coachOpen(lad(ids.slice(0, Math.max(0, i - 1))), id))));
  ok("a coach you have beaten stays open", J.coachOpen(lad(["pine"]), "pine"));
  ok("the one to beat next is the first not beaten", J.frontier(none) === "acorn" && J.frontier(lad(["acorn", "sprout"])) === "clover" && J.frontier(lad(ids)) === "mentor");
  ok("who opens whom", J.openedBy("acorn") === null && J.openedBy("sprout") === "acorn" && J.openedBy("mentor") === "pine");
  ok("a shut coach asked for becomes the one to beat", J.clampCoach(none, "pine") === "acorn" && J.clampCoach(lad(["acorn"]), "sprout") === "sprout");
  ok("a coach that is not on the road is not open", !J.coachOpen(none, "bogus"));
  ok("the park and the studio from the start; the rest shut", J.placeOpen(none, "park") && J.placeOpen(none, "studio") && ["cafe", "salon", "library"].every((p) => !J.placeOpen(none, p)));
  ok("every other place opens with the first chapter set there", J.PLACE_FROM.cafe === "club" && J.PLACE_FROM.salon === "bamboo" && J.PLACE_FROM.library === "pine" &&
     J.placeOpen(lad(["acorn", "sprout", "clover"]), "cafe") && !J.placeOpen(lad(["acorn", "sprout"]), "cafe"));
  ok("a win says which places it opened", JSON.stringify(J.placesOpened(lad(["acorn", "sprout"]), lad(["acorn", "sprout", "clover"]))) === '["cafe"]' &&
     J.placesOpened(lad(["acorn"]), lad(["acorn", "sprout"])).length === 0);
}

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe gate adds up (it was not walked)");
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
  const lobby = () => page.evaluate(() => [...document.querySelectorAll("#mLadder .rung")].map((r) => ({ cls: r.className, name: r.querySelector("b").textContent, face: !!r.querySelector(".rgFace") })));
  const scene = () => page.evaluate(() => JSON.parse(localStorage.getItem("chessroom_prefs") || "{}").scene || "park");
  const toast = () => page.evaluate(() => document.getElementById("toast").textContent);
  const seed = (beaten) => page.evaluate((b) => {
    const L = { v: 1, rungs: {}, lastSide: -1 };
    b.forEach((id) => { L.rungs[id] = { w: 1, d: 0, l: 0, stars: [1, 0, 0] }; });
    localStorage.setItem("chessroom_ladder", JSON.stringify(L));
  }, beaten);
  try {
    /* a saved place the road has not reached */
    await page.goto(base + "/chess/#force2d"); await ready();
    await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("chessroom_prefs")); p.scene = "library"; localStorage.setItem("chessroom_prefs", JSON.stringify(p)); });
    await page.reload(); await ready();
    ok("a place the road has not reached is not where you sit down", (await scene()) === "park");

    await until(() => document.querySelectorAll("#mLadder .rung .rgFace").length === 8, 8000);
    let lad = await lobby();
    ok("the ladder: Acorn to play, seven shadows with padlocks",
       lad.length === 8 && !/locked/.test(lad[0].cls) && lad[0].name === "Acorn" && lad.slice(1).every((r) => /locked/.test(r.cls) && r.name === "???"), lad.map((r) => r.name + ":" + r.cls).join(" | "));
    ok("…every shadow still has a face, kept in the dark", lad.every((r) => r.face) &&
       await page.evaluate(() => /brightness\(0\)/.test(getComputedStyle(document.querySelectorAll("#mLadder .rung .rgFace")[3]).filter)));
    await page.evaluate(() => document.querySelectorAll("#mLadder .rung")[4].click()); await page.waitForTimeout(400);
    const card = await page.evaluate(() => ({ up: !document.getElementById("ovAsk").classList.contains("hide"), lock: !!document.querySelector("#askBody .lockCard"),
      txt: document.getElementById("askBody").textContent, go: document.querySelector("#askRow button").textContent, mode: __cr.mode }));
    ok("a shadow, tapped, is the padlock card: who to beat, and a button to play them", card.up && card.lock && /Chapter 5 is still locked/.test(card.txt) && /Beat .*Fern/.test(card.txt) && /Play Acorn/.test(card.go), JSON.stringify(card));
    ok("…and no game starts", card.mode !== "coach");
    await page.evaluate(() => document.querySelector("#askRow button").click()); await page.waitForTimeout(900);
    ok("its button plays the one you can play", await page.evaluate(() => __cr.mode === "coach" && /Acorn/.test(document.getElementById("nameTop").textContent)));
    await page.evaluate(() => { __cr.showMenu(); }); await page.waitForTimeout(300);

    /* the chooser, and your record */
    await page.evaluate(() => document.getElementById("mCoach").click()); await page.waitForTimeout(300);
    const rows = await page.evaluate(() => [...document.querySelectorAll("#skillChips .rungRow")].map((r) => r.className + "|" + r.textContent));
    ok("the chooser: one coach to choose, seven locked", rows.length === 8 && !/locked/.test(rows[0]) && /sel/.test(rows[0]) && rows.slice(1).every((r) => /locked/.test(r) && /\?\?\?/.test(r) && /to unlock/.test(r)), rows.join(" / "));
    await page.evaluate(() => document.querySelectorAll("#skillChips .rungRow")[2].click()); await page.waitForTimeout(200);
    ok("…and a locked row cannot be chosen", await page.evaluate(() => document.querySelectorAll("#skillChips .rungRow")[0].classList.contains("sel") &&
       !document.querySelectorAll("#skillChips .rungRow")[2].classList.contains("sel")) && /Beat .*Sprout/.test(await toast()));
    await page.evaluate(() => { document.getElementById("ovNew").classList.add("hide"); __cr.showMenu(); document.getElementById("mRating").click(); }); await page.waitForTimeout(300);
    const rec = await page.evaluate(() => [...document.querySelectorAll("#pfLadder .rungRow")].map((r) => r.className));
    ok("your record shows the same locks", rec.length === 8 && !/locked/.test(rec[0]) && rec.slice(1).every((c) => /locked/.test(c)), rec.join(" / "));

    /* the places */
    await page.evaluate(() => { document.querySelectorAll(".overlay").forEach((o) => o.classList.add("hide")); __cr.openStudio(); }); await page.waitForTimeout(400);
    const picks = await page.evaluate(() => [...document.querySelectorAll("#stScenes .stPick")].map((b) => b.className + "|" + b.textContent));
    ok("the Studio's places: the park and the studio open, the rest locked",
       picks.length === 5 && /^(?!.*locked).*Park/.test(picks[0]) && picks.filter((p) => /locked/.test(p)).length === 3 && picks.filter((p) => /locked/.test(p)).every((p) => /🔒/.test(p)), picks.join(" / "));
    await page.evaluate(() => [...document.querySelectorAll("#stScenes .stPick")].find((b) => /Café/.test(b.textContent)).click()); await page.waitForTimeout(200);
    ok("…and a locked one says how to get there, and does not move you", /Beat .*Clover/.test(await toast()) && /chapter 4/.test(await toast()) && (await scene()) === "park", await toast());

    /* beating Acorn */
    await page.evaluate(() => { __cr.closeStudio && __cr.closeStudio(); });
    await seed([]); await page.reload(); await ready();
    await page.evaluate(() => document.querySelectorAll("#mLadder .rung")[0].click()); await page.waitForTimeout(900);
    await play(WIN);
    const mile = await until(() => [...document.querySelectorAll("#endMiles .erMile.chapter")].map((e) => e.textContent).join("") || null, 9000);
    ok("beating Acorn: the card says Sprout is unlocked", /Sprout unlocked/.test(mile || ""), mile);
    const nx = await page.evaluate(() => ({ shown: !document.getElementById("endNext").classList.contains("hide"), sub: document.getElementById("endNextSub").textContent, cup: document.getElementById("endCupTx").textContent }));
    ok("…the next button says just unlocked, and the map button who to meet", nx.shown && /Just unlocked/.test(nx.sub) && /Meet .*Sprout/.test(nx.cup), JSON.stringify(nx));
    await page.evaluate(() => { document.getElementById("ovEnd").classList.add("hide"); __cr.showMenu(); }); await page.waitForTimeout(400);
    lad = await lobby();
    ok("…and on the ladder, Sprout NEW! and Clover still a shadow", /fresh/.test(lad[1].cls) && /NEW/.test(await page.evaluate(() => document.querySelectorAll("#mLadder .rung")[1].textContent)) && lad[1].name === "Sprout" && /locked/.test(lad[2].cls), lad.slice(0, 3).map((r) => r.name + ":" + r.cls).join(" | "));

    /* beating Clover, and the café */
    await seed(["acorn", "sprout"]); await page.reload(); await ready();
    await page.evaluate(() => document.querySelectorAll("#mLadder .rung")[2].click()); await page.waitForTimeout(900);
    ok("Clover is open now, and plays", await page.evaluate(() => __cr.mode === "coach" && /Clover/.test(document.getElementById("nameTop").textContent)));
    await play(WIN);
    const mile2 = await until(() => [...document.querySelectorAll("#endMiles .erMile.chapter")].map((e) => e.innerHTML).join("") || null, 9000);
    ok("beating Clover opens the café too", /Fern unlocked/.test(mile2 || "") && /new place too: the café/.test(mile2 || "") && /data-place="cafe"/.test(mile2 || ""), mile2);
    await page.evaluate(() => document.querySelector('#endMiles [data-place="cafe"]').click()); await page.waitForTimeout(300);
    ok("…and Sit there takes you there", (await scene()) === "cafe");
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nevery coach and every place is earned");
  process.exit(failed ? 1 : 0);
})();
