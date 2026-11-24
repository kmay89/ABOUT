/* welcome-check.js — dev-only. Does the room welcome a newcomer, and
   then get out of the way?

   The first five minutes decide whether someone who has never played
   stays. So a first visit has to ask one question — do you know how the
   pieces move? — and both answers have to lead somewhere real: the
   rules and then a gentle game, or straight into one. After that the
   room carries four pointers, each said once at the moment it helps,
   and the welcome is retired by the thing it asked for, a finished game
   against the computer — never by a timer, never twice. This plays that
   on a phone-sized page and counts what was said.

   Needs `playwright-core`; the browser is already on the machine. If
   either is missing it says so and exits 0.

   Run: node chess/tools/welcome-check.js                                 */
"use strict";
/* the end card is told over as beats first (app.js beatsStart); a player
   taps Skip to reach the card, so the check does too */
const skipBeats = async (p) => {
  if (await p.evaluate(() => !!(window.__cr && __cr.beatState && __cr.beatState().on))) { await p.click("#btSkip"); await p.waitForTimeout(350); }
};
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
if (!CHROME) { console.log("no chromium on this machine — skipping the welcome check."); process.exit(0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the welcome check.");
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
/* every toast the room shows, as it shows it */
const LISTEN = `(() => {
  window.__toasts = [];
  const t = document.getElementById('toast');
  new MutationObserver(() => {
    if (t.classList.contains('show')) { const s = t.innerText; if (window.__toasts[window.__toasts.length - 1] !== s) window.__toasts.push(s); }
  }).observe(t, { attributes: true, childList: true, subtree: true, characterData: true });
})()`;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("" + e.message + (e.stack ? " @ " + String(e.stack).split("\n").slice(1, 3).join(" ").trim() : "")));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const play = (san, src) => page.evaluate(([f, a]) => eval(f)(a), [PLAY, [san, src]]);
  const settle = () => page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 6000 }).catch(() => {});
  const shown = (id) => page.evaluate((i) => !document.getElementById(i).classList.contains("hide"), id);
  const prefs = () => page.evaluate(() => JSON.parse(localStorage.getItem("chessroom_prefs") || "{}"));
  const toasts = () => page.evaluate(() => window.__toasts || []);
  const waitToast = (re, ms) => page.waitForFunction((src) => (window.__toasts || []).some((s) => new RegExp(src).test(s)), re.source, { timeout: ms || 20000 }).then(() => true, () => false);
  let visit = 0;
  const fresh = async (clear) => {
    if (clear) await page.evaluate(() => localStorage.clear());
    await page.goto(base + "/chess/?w=" + (++visit) + "#force2d", { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("splash").classList.contains("gone") &&
      !document.getElementById("ovMenu").classList.contains("hide"), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(250);
    await page.evaluate(LISTEN);
  };

  try {
    await page.goto(base + "/chess/#force2d", { waitUntil: "networkidle" });
    await fresh(true);

    /* ---- a first visit ---- */
    ok("a first visit is welcomed with one question", await shown("mWelcome"));
    /* the greeting (hub.js): the question is the whole of a first visit */
    ok("…and nothing else: no rating, no dock, no ladder",
       !(await page.isVisible("#mRating")) && !(await page.isVisible("#hubDock")) && !(await page.isVisible("#mLadder")));
    ok("…its two answers the only keys (the gold button comes with the room)",
       (await page.isVisible("#mNew")) && (await page.isVisible("#mKnow")) && !(await page.isVisible("#mPlay")));

    await page.click("#mNew");
    await page.waitForTimeout(400);
    /* the very first lesson is setting up the board (setup-check.js);
       Skip goes on to the rules, where it was leading */
    ok("“I'm new” starts by setting up the board", await page.evaluate(() => __cr.mode === "setup" && /Your rooks/.test(document.getElementById("lessonBar").textContent)));
    await page.click("#suSkip"); await page.waitForTimeout(250);
    /* the rules are shown on the board now (rules-check.js): a scene, not a card of words */
    ok("…and goes on to the rules, on the board", await page.evaluate(() => __cr.mode === "rules" && __cr.rulesState().scene === "goal" &&
       document.getElementById("lessonBar").classList.contains("rules")));
    ok("…and puts the training wheels on for the first games", (await prefs()).wheels === true);
    /* to the last scene by its dot, and through it */
    await page.click(".rlDot:last-child");
    await page.waitForFunction(() => { const s = __cr.rulesState(); return s && s.scene === "start" && s.shown; }, null, { timeout: 60000 }).catch(() => {});
    await page.click("#lessonBar .lchip.go");
    await page.waitForTimeout(900);
    ok("…and the last scene starts a first game against the gentlest coach",
       await page.evaluate(() => __cr.mode === "coach" && __cr.game.played.length <= 1));
    ok("the wheels say once that they are on", await waitToast(/Training wheels are on/, 15000), JSON.stringify(await toasts()));

    /* ---- the other door ---- */
    await fresh(true);
    await page.click("#mKnow");
    await page.waitForTimeout(900);
    ok("“I know how the pieces move” goes straight into a game", await page.evaluate(() => __cr.mode === "coach"));
    ok("…without the wheels", !(await prefs()).wheels);
    const white = await page.evaluate(() => __cr.game.turn === 1 && __cr.game.played.length === 0);
    if (!white) await page.waitForFunction(() => __cr.game.played.length === 1, null, { timeout: 15000 }).catch(() => {});
    await settle();
    const opening = await page.evaluate(() => __cr.game.played.length === 0 ? "e4" : "e5");
    await play(opening);
    await page.waitForFunction((n) => __cr.game.played.length >= n, white ? 2 : 3, { timeout: 15000 }).catch(() => {});
    await settle();
    ok("the notebook is pointed out when it first has something in it", await waitToast(/keeps what it notices in Notes/, 25000), JSON.stringify(await toasts()));
    ok("the coach's move is pointed out as something to ask about", await waitToast(/Tap the coach's move/, 25000), JSON.stringify(await toasts()));
    for (const s of white ? ["Nf3", "Bc4"] : ["Nc6", "Nf6"]) {
      const n = await page.evaluate(() => __cr.game.played.length);
      if (!(await play(s))) break;
      await page.waitForFunction((k) => __cr.game.played.length >= k + 2, n, { timeout: 15000 }).catch(() => {});
      await settle();
    }
    await page.waitForTimeout(1500);
    const said = (await toasts()).filter((t) => /keeps what it notices/.test(t)).length;
    ok("…each said once, however many notes follow", said === 1 && (await toasts()).filter((t) => /Tap the coach's move/.test(t)).length === 1, said + "×");
    const pf = await prefs();
    ok("…and remembered", pf.tips && pf.tips.notes === 1 && pf.tips.why === 1, JSON.stringify(pf.tips));

    await fresh(false);
    ok("a game waiting to be resumed is not met with the welcome", !(await shown("mWelcome")));
    await page.click("#mResume");
    await page.waitForTimeout(900);
    await page.evaluate(() => { __cr.helpForTest.lamp(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const b = [...document.querySelectorAll("#toast .tact")].find((x) => /Think/.test(x.textContent)); if (b) b.click(); });
    await page.waitForTimeout(4000);
    ok("after a reload the pointer is not said again", !(await toasts()).some((t) => /keeps what it notices/.test(t)), JSON.stringify(await toasts()));

    /* ---- the first finished game retires the welcome ---- */
    await page.evaluate(() => { __cr.startGame("coach", { humanSide: 1, skill: Rating.LEVELS[0].id, clockStr: "none", fresh: true }); });
    await page.waitForTimeout(400);
    for (const [i, san] of ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"].entries()) {
      await play(san, i % 2 ? "coach" : "local");
      await page.waitForTimeout(i % 2 ? 450 : 80);
    }
    await page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 10000 }).catch(() => {});
    ok("a finished game against the computer retires the welcome", (await prefs()).welcomed === true);
    await skipBeats(page); await page.click("#endMenu");
    await page.waitForTimeout(400);
    ok("…and the lobby shows the first number instead",
       (await shown("mRating")) && !(await shown("mWelcome")) && (await page.isVisible("#mPlay")) &&
       /\d/.test(await page.evaluate(() => document.getElementById("hubMeNum").textContent)));

    /* ---- the take-back pointer rides inside the blunder toast ----
       (tipsResetForTest also un-says the once-only offer of the wheels:
       an earlier game in this check may already have used it, if the
       engine on a busy machine called one of its moves a blunder) */
    await page.evaluate(() => { __cr.tipsResetForTest(); __cr.startGame("coach", { humanSide: 1, skill: Rating.LEVELS[0].id, clockStr: "none", fresh: true }); __cr.setVoiceForTest("plain"); });
    await page.evaluate(LISTEN);
    await page.waitForTimeout(400);
    for (const [i, san] of ["e4", "e5", "Qh5", "Nc6"].entries()) {
      await play(san, i % 2 ? "coach" : "local");
      await page.waitForTimeout(i % 2 ? 450 : 80);
    }
    await settle();
    await play("Qxe5+", "local");
    const blunder = await waitToast(/Take it back/, 15000);
    const bt = (await toasts()).filter((t) => /Take it back/.test(t))[0] || "";
    ok("a blunder you can take back says once what a take-back costs", blunder && /count for a little less/.test(bt), bt);
    ok("…and offers the training wheels, once", /Warn me first/.test(bt), bt);
    await page.evaluate(() => { const b = [...document.querySelectorAll("#toast .tact")].find((x) => /Warn me first/.test(x.textContent)); if (b) b.click(); });
    await page.waitForTimeout(300);
    ok("…which puts them on", (await prefs()).wheels === true);

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\na newcomer is asked one question, told four things once, and let go after the first game");
  process.exit(failed ? 1 : 0);
})();
