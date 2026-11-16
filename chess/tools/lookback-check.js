/* lookback-check.js — dev-only. Does the line behind the words land on
   the right square?

   The coach already knows the move that was better and the move that
   punishes the one you played; the look-back draws them. A drawing like
   that is only worth anything if it is true, and the ways it can be
   false are all quiet: the better move drawn on the position *after*
   the slip (where its piece is no longer standing), the refutation drawn
   on a board the coach has already replied on, a save that forgets the
   squares or believes a hostile one, a "Show the line" that draws a
   line nobody asked for and never takes it away.

   So this plays a real slip in a real browser — 1.e4 e5 2.Qh5 g6??,
   which hands the e-pawn and the rook in the corner to Qxe5+ — on the
   carved board and the flat one, and
   reads back what the room recorded and what the board was given to
   draw; then it feeds the save honest, old and hostile review entries;
   then it finishes a game with a slip in it and walks the look-back;
   then it asks for a hint and the line behind it.

   Needs `playwright-core`; the browser is already on the machine. If
   either is missing it says so and exits 0.

   Run: node chess/tools/lookback-check.js                              */
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
if (!CHROME) { console.log("no chromium on this machine — skipping the look-back check."); process.exit(0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the look-back check.");
  console.log("  npm i --no-save playwright-core");
  process.exit(0);
}
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css" };
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
const SQ = (name) => (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);
const PLAY = `(san) => {
  const g = __cr.game;
  const mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]/, "") === san.replace(/[+#]/, ""));
  if (!mv) return false; __cr.commitMove(mv, "local"); return true;
}`;
const LINES = `__cr.renderer.lines.map((l) => ({ from: l.from, to: l.to, sq: l.sq, kind: l.kind, tone: l.tone, delay: l.delay }))`;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    for (const dim of ["3d", "2d"]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push("" + e.message));
      page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
      const boot = async (hash) => {
        /* the room's service worker can reload a page that is still
           arriving, which aborts the navigation: once more is enough */
        const url = base + "/chess/?v=" + Math.random() + (hash || "");
        await page.goto(url, { timeout: 120000 }).catch(() => page.goto(url, { timeout: 120000 }));
        await page.waitForFunction(() => document.getElementById("splash").classList.contains("gone"), null, { timeout: 60000 });
        await page.waitForTimeout(300);
      };
      await boot();
      await page.evaluate((d) => { localStorage.clear(); localStorage.setItem("chessroom_prefs",
        JSON.stringify({ use3d: d === "3d", scene: "park", fx: "low", sawPen: true, coachVoice: "plain", coach: true })); }, dim);
      await boot(dim === "2d" ? "#force2d" : "");
      const tag = dim + ": ";
      const play = async (san) => {
        const got = await page.evaluate(([f, s]) => eval(f)(s), [PLAY, san]);
        if (!got) throw new Error("could not play " + san);
        await page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 5000 }).catch(() => {});
      };
      const lines = () => page.evaluate(LINES);
      const fresh = async (mode) => {
        await page.evaluate((m) => { document.querySelectorAll(".ov").forEach((o) => o.classList.add("hide"));
          __cr.startGame(m, { humanSide: 1, skill: "sprout", clockStr: "none" }); __cr.setVoiceForTest("plain"); }, mode);
        await page.waitForTimeout(2200);
      };

      /* ---- a slip, said and drawn ---- */
      await fresh("pass");
      for (const s of ["e4", "e5", "Qh5"]) { await play(s); await page.waitForTimeout(300); }
      await play("g6");
      await page.waitForFunction(() => __cr.marksForTest()[3] && document.getElementById("toast").classList.contains("acts"),
        null, { timeout: 45000 }).catch(() => {});
      const memo = await page.evaluate(() => __cr.reviewMemoForTest()[3]);
      const mark = await page.evaluate(() => __cr.marksForTest()[3]);
      ok(tag + "2…g6 is marked as the blunder it is", mark === "??", String(mark));
      const onBoard = (p) => Array.isArray(p) && p.length === 2 && p.every((q) => (q & 0x88) === 0);
      ok(tag + "the review keeps the better move as two squares", memo && onBoard(memo.bm), JSON.stringify(memo));
      const mover = await page.evaluate((bm) => {
        const g = Chess.create();
        for (const s of ["e4", "e5", "Qh5"]) Chess.play(g, Chess.fromSAN(g, s));
        return bm ? g.board[bm[0]] : 0;
      }, memo && memo.bm);
      ok(tag + "…whose first square holds one of Black's own men on the position before the slip", mover < 0, String(mover));
      ok(tag + "…and the refutation as two squares: the queen from h5 to e5",
         memo && onBoard(memo.rf) && memo.rf[0] === SQ("h5") && memo.rf[1] === SQ("e5"), JSON.stringify(memo && memo.rf));
      const acts = await page.evaluate(() => [...document.querySelectorAll("#toast .tact")].map((b) => b.textContent));
      /* (the help package may add a fourth, "Warn me first", after these) */
      ok(tag + "the toast offers three things: take it back, show me, play on",
         acts.length >= 3 && /Take it back/.test(acts[0]) && /Show me/.test(acts[1]) && /Play on/.test(acts[2]), JSON.stringify(acts));
      let ls = await lines();
      ok(tag + "while the board still shows the slip, the problem is drawn as a threat",
         ls.some((l) => l.kind === "threat" && l.from === SQ("h5") && l.to === SQ("e5")), JSON.stringify(ls));

      /* the punishment arrives; Show me still goes to the position before */
      await play("Qxe5");
      await page.waitForTimeout(400);
      ls = await lines();
      ok(tag + "once the reply is on the board, the live threat is gone",
         !ls.some((l) => l.kind === "threat" && l.from === SQ("h5") && l.to === SQ("e5")), JSON.stringify(ls));
      await page.evaluate(() => [...document.querySelectorAll("#toast .tact")].find((b) => /Show me/.test(b.textContent)).click());
      await page.waitForTimeout(400);
      ok(tag + "Show me goes back to the position before the slip", (await page.evaluate(() => __cr.viewPly)) === 2);
      ls = await lines();
      ok(tag + "…your move drawn faint, the better one drawn as the hint",
         ls.length === 2 && ls.some((l) => l.kind === "ghost" && l.from === SQ("g7") && l.to === SQ("g6")) &&
         ls.some((l) => l.kind === "run" && l.from === memo.bm[0] && l.to === memo.bm[1]), JSON.stringify(ls));
      const banner = await page.evaluate(() => document.getElementById("vbText").textContent);
      ok(tag + "…and the banner reads what the coach said about it", /better by/.test(banner), banner);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(300);
      ls = await lines();
      ok(tag + "→: the position after the slip, and the problem drawn on it",
         (await page.evaluate(() => __cr.viewPly)) === 3 && ls.length === 1 && ls[0].kind === "threat" &&
         ls[0].from === SQ("h5") && ls[0].to === SQ("e5"), JSON.stringify(ls));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      ls = await lines();
      ok(tag + "Escape: back to the game, and the look-back's lines go with it",
         (await page.evaluate(() => __cr.viewPly)) === -1 && ls.length === 0, JSON.stringify(ls));
      const asleep = await page.evaluate(async () => {
        await new Promise((r) => setTimeout(r, 2500));
        const r = __cr.renderer; r.dirty = true; r.frame(); return r.frame();
      });
      ok(tag + "…and the board can sleep again", asleep === false || asleep === 0, String(asleep));

      /* a note about the slip opens on the same position, with the same lines */
      await page.click("#tabNotes");
      await page.waitForTimeout(200);
      await page.evaluate(() => [...document.querySelectorAll("#noteList .note")].find((n) => /g6\?/.test(n.textContent)).click());
      await page.waitForTimeout(400);
      ls = await lines();
      ok(tag + "tapping the note about it does the same", (await page.evaluate(() => __cr.viewPly)) === 2 &&
         ls.some((l) => l.kind === "run" && l.from === memo.bm[0]), JSON.stringify(ls));
      await page.click("#tabMoves");
      await page.evaluate(() => document.getElementById("viewBanner").click());
      await page.waitForTimeout(300);

      /* ---- the save: honest, old and hostile ---- */
      await fresh("coach");
      await play("d4");
      await page.waitForFunction(() => __cr.game.played.length >= 2 && Object.keys(__cr.reviewMemoForTest()).length > 0, null, { timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(400);
      const rv = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("chessroom_save") || "null"); return s && s.rv; });
      ok(tag + "a coach game's save keeps the review's squares (seven to an entry)",
         Array.isArray(rv) && rv.length > 0 && rv.every((t) => t.length === 7), JSON.stringify(rv));
      const save = (rvs) => ({ v: 1, mode: "coach", sans: ["d4", "e5", "Bg5", "Qxg5"], clockStr: "none", wMs: 0, bMs: 0,
        humanSide: 1, skill: "sprout", odds: [0, 0, 0], assist: [0, 0], rv: rvs, ev: 0 });
      const resume = async (rvs) => {
        await page.evaluate((s) => { localStorage.setItem("chessroom_save", JSON.stringify(s)); }, save(rvs));
        await boot(dim === "2d" ? "#force2d" : "");
        await page.evaluate(() => document.getElementById("mResume").click());
        await page.waitForTimeout(900);
        return page.evaluate(() => __cr.reviewMemoForTest());
      };
      let m = await resume([[2, 10, -330]]);
      ok(tag + "an older save's three-long entry still reads, with no squares",
         m[2] && m[2].best === 10 && m[2].bm === null && m[2].rf === null, JSON.stringify(m));
      m = await resume([[2, 10, -330, SQ("d4"), SQ("e5"), SQ("d8"), SQ("g5")]]);
      ok(tag + "a seven-long entry comes back with both pairs of squares",
         m[2] && JSON.stringify(m[2].bm) === JSON.stringify([SQ("d4"), SQ("e5")]) &&
         JSON.stringify(m[2].rf) === JSON.stringify([SQ("d8"), SQ("g5")]), JSON.stringify(m));
      m = await resume([[2, 10, -330, 999, 0, 0, 0], [1, 5, 5, -1, -1, -1, -1], [9, 1, 1], ["x"], null]);
      ok(tag + "a square that is not a square drops its entry, and nothing else",
         !m[2] && m[1] && m[1].bm === null && !m[9] && (await page.evaluate(() => __cr.game.played.length)) === 4, JSON.stringify(m));
      await page.evaluate(() => localStorage.removeItem("chessroom_save"));

      /* ---- a finished game, walked back ---- */
      await fresh("pass");
      for (const s of ["e4", "e5", "Bc4", "Nc6", "Qh5"]) { await play(s); await page.waitForTimeout(250); }
      await play("Nf6");
      await page.waitForFunction(() => __cr.marksForTest()[5], null, { timeout: 45000 }).catch(() => {});
      ok(tag + "…Nf6?? is marked before the mate lands", !!(await page.evaluate(() => __cr.marksForTest()[5])));
      await play("Qxf7");
      await page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600);
      await page.click("#endReview");
      await page.waitForTimeout(500);
      const vp = await page.evaluate(() => __cr.viewPly);
      const navTx = await page.evaluate(() => document.querySelector("#reviewNav .rnN") ? document.querySelector("#reviewNav .rnN").textContent : "");
      const ofN = /^(\d+) of (\d+)$/.exec(navTx);
      ok(tag + "the end card's look-back lands on the first move worth a second look",
         ofN && ofN[1] === "1" && vp >= 0 && vp <= 4, navTx + " at " + vp);
      ok(tag + "…with the walk between them in the banner", await page.isVisible("#reviewNav"));
      if (ofN && +ofN[2] > 1) {
        await page.evaluate(() => document.querySelectorAll("#reviewNav .lchip")[1].click());
        await page.waitForTimeout(400);
        const vp2 = await page.evaluate(() => __cr.viewPly);
        const tx2 = await page.evaluate(() => document.querySelector("#reviewNav .rnN").textContent);
        ok(tag + "▶ steps to the next one", vp2 > vp && /^2 of /.test(tx2), vp + " → " + vp2 + " " + tx2);
      } else {
        const next = await page.evaluate(() => document.querySelectorAll("#reviewNav .lchip")[1].disabled);
        ok(tag + "▶ has nowhere to go when there is only one", next === true);
      }
      await page.evaluate(() => document.getElementById("viewBanner").click());
      await page.waitForTimeout(300);

      /* ---- the line behind a hint ---- */
      await fresh("pass");
      for (const s of ["a4", "h5", "Ra3", "Rh6"]) { await play(s); await page.waitForTimeout(250); }
      await page.evaluate(() => document.getElementById("toast").classList.remove("show", "acts"));
      /* the lamp opens first; "A move" is the engine's hint */
      await page.click("#btnHint");
      await page.waitForSelector("#toast.show .tact >> text=A move", { timeout: 10000 }).catch(() => {});
      await page.click("#toast .tact >> text=A move").catch(() => {});
      await page.waitForFunction(() => document.getElementById("toast").classList.contains("show") && /💡/.test(document.getElementById("toast").textContent) && /—/.test(document.getElementById("toast").textContent),
        null, { timeout: 45000 }).catch(() => {});
      const hintActs = await page.evaluate(() => [...document.querySelectorAll("#toast .tact")].map((b) => b.textContent));
      ok(tag + "a hint from the engine offers the line behind it", hintActs.some((t) => /Show the line/.test(t)),
         JSON.stringify(hintActs) + " " + (await page.evaluate(() => document.getElementById("toast").textContent)));
      if (hintActs.some((t) => /Show the line/.test(t))) {
        await page.evaluate(() => [...document.querySelectorAll("#toast .tact")].find((b) => /Show the line/.test(b.textContent)).click());
        await page.waitForTimeout(100);
        ls = await lines();
        const pv = ls.filter((l) => l.delay != null);
        ok(tag + "…a ply at a time: one to three lines, each a beat after the last",
           pv.length >= 1 && pv.length <= 3 && pv.every((l, i) => l.delay === i * 260) && pv[0].kind === "threat", JSON.stringify(ls));
        await page.waitForTimeout(7600);
        ls = await lines();
        ok(tag + "…and gone again after seven seconds", !ls.some((l) => l.delay != null), JSON.stringify(ls));
      }
      ok(tag + "nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
      await ctx.close();
    }
  } catch (e) {
    ok("the look-back check ran", false, e.stack || e.message);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failed ? "\nFAILED: " + failed + " problem" + (failed === 1 ? "" : "s") : "\nthe line behind the words lands on the square it names");
  process.exit(failed ? 1 : 0);
})();
