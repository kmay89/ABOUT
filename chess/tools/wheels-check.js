/* wheels-check.js — dev-only. Do the training wheels see what is really
   in danger, and are they honest about what they cost?

   The wheels are a beginner's stabilisers: before you move, your
   pieces that can really be won breathe and the attacker's line is
   drawn; lift a piece and the squares where it would be lost ring in
   the warning colour instead of showing a dot. A wheel, not a wall — a
   hot square still takes the move. Against the computer they are help,
   and a rated game played with them counts for three quarters; two
   people sharing a board pay nothing. Never with a clock. This plays
   all of that in a real browser (flat board, and the carved one once)
   and checks the marks against the teacher's own exchange count.

   The judgements themselves are checked without a browser in
   help-check.js.

   Needs `playwright-core`; the browser is already on the machine. If
   either is missing it says so and exits 0.

   Run: node chess/tools/wheels-check.js                                  */
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
if (!CHROME) { console.log("no chromium on this machine — skipping the wheels check."); process.exit(0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the wheels check.");
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
const SQ = (name) => (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 820 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("" + e.message + (e.stack ? " @ " + String(e.stack).split("\n").slice(1, 3).join(" ").trim() : "")));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const play = (san, src) => page.evaluate(([f, a]) => eval(f)(a), [PLAY, [san, src]]);
  const settle = () => page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 6000 }).catch(() => {});
  const hi = () => page.evaluate(() => ({ danger: __cr.renderer.hi.danger || [], hot: __cr.renderer.hi.hot || [], hotCapt: __cr.renderer.hi.hotCapt || [],
    legal: __cr.renderer.hi.legal, sel: __cr.renderer.hi.selected, lines: __cr.renderer.lines, net: __cr.renderer.net || [] }));
  const click = async (sq) => {
    const at = await page.evaluate((s) => { const r = document.getElementById("stage").getBoundingClientRect(); const p = __cr.renderer.squareToScreen(s); return { x: r.x + p.x, y: r.y + p.y }; }, sq);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(150);
  };
  let visit = 0;
  const fresh = async (hash) => {
    await page.goto(base + "/chess/?h=" + (++visit) + (hash || "#force2d"), { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("splash").classList.contains("gone") &&
      !document.getElementById("ovMenu").classList.contains("hide"), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(250);
  };

  try {
    await page.goto(base + "/chess/#force2d", { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await fresh();

    /* ---- the setting ---- */
    await page.click("#mSettings");
    ok("Settings has a Training wheels switch, off to begin with", /Off/.test(await page.textContent("#setWheels")));
    await page.click("#setWheels");
    ok("…which turns them on and remembers", await page.evaluate(() => JSON.parse(localStorage.chessroom_prefs).wheels === true));
    await page.click("#setWheels");
    await page.click("#setBack");

    /* ---- what is in danger, before you move ---- */
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); __cr.wheelsForTest(true); __cr.setVoiceForTest("plain"); });
    await page.waitForTimeout(300);
    for (const s of ["e4", "d5", "exd5", "Qxd5", "Nc3"]) { await play(s); await page.waitForTimeout(80); }
    await settle(); await page.waitForTimeout(200);
    let h = await hi();
    ok("the queen the knight chases breathes", h.danger.indexOf(SQ("d5")) >= 0, JSON.stringify(h.danger));
    ok("…with the attacker's line drawn to it", h.lines.some((l) => l.kind === "threat" && l.to === SQ("d5") && l.from === SQ("c3")), JSON.stringify(h.lines));
    ok("…kept in the notebook", await page.evaluate(() => __cr.notesForTest().some((n) => n.key === "wheel")));
    ok("…and free for two people sharing a board", (await page.evaluate(() => __cr.assistForTest().wheels)) === 0);

    /* ---- where a lifted piece would be lost ---- */
    await click(SQ("d5"));
    h = await hi();
    const truth = await page.evaluate(([hot, hotCapt]) => {
      const g = __cr.game, d5 = 0x43, out = { wrong: [], safeHot: false };
      for (const m of Chess.movesFrom(g, d5)) {
        const isCapt = !!(m.capt || (m.flags & Chess.F_EP));
        let lost;
        if (isCapt) lost = Teach.seeMove(g, m) <= -Teach.GAIN;
        else { Chess.make(g, m); const info = Teach.looseInfo(g, m.to); lost = !!info && Teach.reallyLost(g, info, 0); Chess.unmake(g); }
        const marked = (isCapt ? hotCapt : hot).indexOf(m.to) >= 0;
        if (marked !== lost) out.wrong.push(Chess.sqName(m.to));
      }
      out.safeHot = hot.indexOf(0x40) >= 0;           /* a5: nothing reaches it */
      return out;
    }, [h.hot, h.hotCapt]);
    ok("the lifted queen's hot squares are exactly the ones where the exchange loses her", h.sel === SQ("d5") && h.hot.length + h.hotCapt.length > 0 &&
       !truth.wrong.length, JSON.stringify(truth) + " " + JSON.stringify(h));
    ok("…a safe square keeps its dot", !truth.safeHot && h.legal.indexOf(0x40) >= 0);
    ok("…and a hot square has no dot as well", !h.hot.some((q) => h.legal.indexOf(q) >= 0));
    const hotSq = h.hot[0];
    await click(hotSq);
    await settle();
    ok("a wheel, not a wall: a hot square still takes the move", (await page.evaluate(() => __cr.game.played.length)) === 6);

    /* ---- a mate threat shows its net ---- */
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
    await page.waitForTimeout(300);
    for (const s of ["e4", "e5", "Bc4", "Nc6", "Qh5"]) { await play(s); await page.waitForTimeout(80); }
    await settle(); await page.waitForTimeout(200);
    h = await hi();
    ok("a mate threat against you is drawn, from the queen to the square", h.lines.some((l) => l.kind === "threat" && l.from === SQ("h5") && l.to === SQ("f7")),
       JSON.stringify(h.lines));
    ok("…and named", await page.evaluate(() => __cr.notesForTest().some((n) => n.key === "wheel" && /Qxf7/.test(n.text))));
    await page.evaluate(() => __cr.wheelsForTest(false));
    h = await hi();
    ok("off, nothing is marked", !h.danger.length && !h.hot.length && !h.hotCapt.length);

    /* ---- never with a clock ---- */
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "5+0" }); __cr.wheelsForTest(true); });
    await page.waitForTimeout(300);
    for (const s of ["e4", "d5", "exd5", "Qxd5", "Nc3"]) { await play(s); await page.waitForTimeout(80); }
    await settle();
    ok("never with a clock running", !(await hi()).danger.length);

    /* ---- against the computer, they count ---- */
    await page.evaluate(() => { __cr.startGame("coach", { humanSide: 1, skill: Rating.LEVELS[0].id, clockStr: "none", fresh: true }); __cr.wheelsForTest(true); });
    await page.waitForTimeout(400);
    for (const [i, san] of ["Nc3", "e5", "Nd5", "c6"].entries()) {
      await play(san, i % 2 ? "coach" : "local");
      await page.waitForTimeout(i % 2 ? 450 : 80);
    }
    await settle(); await page.waitForTimeout(300);
    ok("against the computer, a warning counts as help", (await page.evaluate(() => __cr.assistForTest().wheels)) >= 1 &&
       (await hi()).danger.indexOf(SQ("d5")) >= 0, JSON.stringify(await page.evaluate(() => __cr.assistForTest())));
    ok("…and the save remembers it", await page.evaluate(() => (JSON.parse(localStorage.chessroom_save || "{}").assist || [])[2] >= 1));
    await page.click("#btnMenu"); await page.waitForTimeout(300);
    await page.click("#gameOps .chip >> text=Resign"); await page.waitForTimeout(200);
    await page.click("#askRow button >> nth=0");
    await page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 8000 }).catch(() => {});
    const rec = await page.evaluate(() => { const r = JSON.parse(localStorage.chessroom_rating || "null"); return r && r.history && r.history[r.history.length - 1]; });
    ok("a rated game with the wheels is recorded as such", rec && rec.assisted && rec.assisted.wheels >= 1, JSON.stringify(rec));
    const title = await page.textContent("#endRateTitle");
    ok("…and the card says it counted as 75% of a game, because of the wheels", /75% of a game \(training wheels\)/.test(title), title);
    await page.click("#endMenu"); await page.waitForTimeout(300);

    /* ---- the carved board draws them too ---- */
    await fresh("#");
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); __cr.wheelsForTest(true); });
    await page.waitForTimeout(500);
    if ((await page.evaluate(() => __cr.renderer.kind)) !== "3d") { await page.click("#btnDim"); await page.waitForTimeout(2500); }
    const is3d = await page.evaluate(() => __cr.renderer.kind === "3d");
    for (const s of ["e4", "d5", "exd5", "Qxd5", "Nc3"]) { await play(s); await page.waitForTimeout(80); }
    await settle(); await page.waitForTimeout(300);
    h = await hi();
    ok("the " + (is3d ? "carved" : "flat (no WebGL here)") + " board marks the same danger", h.danger.indexOf(SQ("d5")) >= 0, JSON.stringify(h.danger));
    await click(SQ("d5"));
    h = await hi();
    ok("…and the same hot squares", h.hot.length + h.hotCapt.length > 0);
    await page.evaluate(() => __cr.wheelsForTest(false));

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe wheels mark what can really be lost, say it once, and count honestly");
  process.exit(failed ? 1 : 0);
})();
