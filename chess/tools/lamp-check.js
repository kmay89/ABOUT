/* lamp-check.js — dev-only. Does the help lamp light, and is it fair?

   💡 used to sell one thing. Now it offers three — Think, Their idea,
   A move — and every move the coach plays can be asked "why?". That is
   a lot of new ways for help to leak out unpaid, or for the room to
   charge for something it said it gave away. So this plays real games
   in a real browser and checks the till as well as the words: the two
   free chips cost nothing and are kept in the notebook, the third is
   the old hint at the old price, a "why" about a threat against you is
   a question unless you are behind, the notation voice still buys the
   move in one tap, and the console stays quiet throughout.

   Needs `playwright-core`; the browser is already on the machine. If
   either is missing it says so and exits 0.

   Run: node chess/tools/lamp-check.js                                    */
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
if (!CHROME) { console.log("no chromium on this machine — skipping the lamp check."); process.exit(0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the lamp check.");
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

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("" + e.message + (e.stack ? " @ " + String(e.stack).split("\n").slice(1, 3).join(" ").trim() : "")));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const play = (san, src) => page.evaluate(([f, a]) => eval(f)(a), [PLAY, [san, src]]);
  const settle = () => page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 6000 }).catch(() => {});
  const toastText = () => page.evaluate(() => document.getElementById("toast").classList.contains("show") ? document.getElementById("toast").innerText : "");
  const spent = () => page.evaluate(() => __cr.oddsSpent[1] + __cr.oddsSpent[-1]);
  const notesKeyed = (key) => page.evaluate((k) => __cr.notesForTest().filter((n) => n.key === k).map((n) => ({ ply: n.ply, text: n.text })), key);
  const chip = async (re) => {
    const i = await page.evaluate((src) => [...document.querySelectorAll("#toast .tact")].findIndex((b) => new RegExp(src).test(b.textContent)), re.source);
    if (i < 0) return false;
    await page.click("#toast .tact >> nth=" + i);
    return true;
  };

  try {
    await page.goto(base + "/chess/#force2d", { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.goto(base + "/chess/?l=1#force2d", { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("splash").classList.contains("gone"), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(300);
    ok("the button says Help, with its price beside it", /Help/.test(await page.evaluate(() => document.getElementById("btnHint").textContent)));

    /* ---- the coach's line, kept for its "why" ----
       the strongest coach, because the weaker ones pick a move off their
       ranked list and their line (if any) belongs to a move they did not
       play — which is exactly when nothing may be kept */
    await page.evaluate(() => { __cr.startGame("coach", { humanSide: 1, skill: "mentor", clockStr: "none" }); __cr.setVoiceForTest("plain"); });
    await page.waitForTimeout(300);
    await play("e4");
    await page.waitForFunction(() => __cr.game.played.length === 2, null, { timeout: 20000 }).catch(() => {});
    await settle();
    const memo = await page.evaluate(() => ({ m: __cr.helpForTest.coachMemo()[1] || null, san: __cr.game.played[1].san }));
    ok("the coach's own line is kept for its move", memo.m && Array.isArray(memo.m.pv) && memo.m.pv[0].replace(/[+#]$/, "") === memo.san.replace(/[+#]$/, ""),
       JSON.stringify(memo));
    const live = await page.evaluate(() => __cr.helpForTest.explainPly(1).text);
    ok("…but while your answer is still to find, the why does not say what it expects you to play", !/counting on/.test(live), live);
    await play("Nf3");
    await page.waitForFunction(() => __cr.game.played.length === 4, null, { timeout: 20000 }).catch(() => {});
    await settle();
    const later = await page.evaluate(() => __cr.helpForTest.explainPly(1).text);
    ok("…and once answered, it does", !memo.m || memo.m.pv.length < 3 || /counting on/.test(later), later);

    /* ---- a game against the gentlest coach ---- */
    await page.evaluate(() => { __cr.startGame("coach", { humanSide: 1, skill: Rating.LEVELS[0].id, clockStr: "none" }); __cr.setVoiceForTest("plain"); __cr.tipsResetForTest(); });
    await page.waitForTimeout(400);
    await play("e4");
    await page.waitForFunction(() => __cr.game.played.length === 2, null, { timeout: 15000 }).catch(() => {});
    await settle();
    await page.waitForTimeout(900);
    const why1 = await page.evaluate(() => { const r = __cr.helpForTest.explainPly(1); return { quiet: r.quiet, asked: r.asked, text: r.text }; });
    const auto = await notesKeyed("theirs");
    ok("the coach's move leaves a 'why' in the notebook exactly when there is something true to say",
       (auto.some((n) => n.ply === 1)) === (!why1.quiet && !why1.asked), JSON.stringify(why1) + " / " + JSON.stringify(auto));

    /* the lamp: three chips, the third priced */
    const before = await spent();
    await page.click("#btnHint");
    await page.waitForTimeout(200);
    const lamp = await page.evaluate(() => ({ chips: [...document.querySelectorAll("#toast .tact")].map((b) => b.textContent),
      lamp: document.getElementById("toast").classList.contains("lamp") }));
    ok("💡 opens the lamp: Think, Their idea, and a priced move", lamp.lamp && lamp.chips.length === 3 &&
       /Think/.test(lamp.chips[0]) && /Their idea/.test(lamp.chips[1]) && /A move (−\d|· free)/.test(lamp.chips[2]), JSON.stringify(lamp.chips));
    ok("…and opening it costs nothing", (await spent()) === before);

    await chip(/Think/);
    await page.waitForTimeout(250);
    const th = await toastText();
    ok("Think asks the coach's questions with real counts", /🧭/.test(th) && /check|capture/i.test(th), th);
    ok("…keeps them in the notebook", (await notesKeyed("think")).length === 1);
    ok("…and is free", (await spent()) === before && (await page.evaluate(() => __cr.assistForTest().hints)) === 0);

    await page.click("#btnHint"); await page.waitForTimeout(150);
    await chip(/Their idea/);
    await page.waitForTimeout(300);
    const ti = await toastText();
    const lines = await page.evaluate(() => __cr.renderer.lines.length);
    ok("Their idea says what the coach's move did, with its line on the board", /❓/.test(ti) && lines >= 1, ti + " / lines " + lines);
    ok("…kept as that move's note", (await notesKeyed("theirs")).some((n) => n.ply === 1));
    ok("…and is free", (await spent()) === before && (await page.evaluate(() => __cr.assistForTest().hints)) === 0);

    await page.click("#btnHint"); await page.waitForTimeout(150);
    await chip(/A move/);
    /* the hint may carry a "Show the line" chip, so the lamp's chips going is the sign, not the chips themselves */
    await page.waitForFunction(() => /💡/.test(document.getElementById("toast").innerText) && /—/.test(document.getElementById("toast").innerText) && !document.getElementById("toast").classList.contains("lamp"), null, { timeout: 12000 }).catch(() => {});
    const mv = await toastText();
    ok("A move is the old hint: a move and a reason", /💡/.test(mv) && /—/.test(mv), mv);
    ok("…at the old price, counted as help", (await spent()) === before + 1 && (await page.evaluate(() => __cr.assistForTest().hints)) === 1,
       (await spent()) + " vs " + before);
    ok("…never with a rule of thumb dressed up as a reason", !/rooks love|improves the piece's post/.test(mv), mv);

    /* the move list asks why */
    const paid = await spent();
    await page.evaluate(() => { const c = [...document.querySelectorAll("#moveList .m")]; c[c.length - 1].click(); });
    await page.waitForTimeout(300);
    ok("tapping the coach's last move asks why it was played", /^❓/.test((await toastText()).trim()), await toastText());
    ok("…free, and the board stays live", (await spent()) === paid && (await page.evaluate(() => !document.getElementById("viewBanner").classList.contains("hide"))) === false);
    ok("the last move says it can be asked", /tap to ask why/.test(await page.evaluate(() => { const c = [...document.querySelectorAll("#moveList .m")]; return c[c.length - 1].title; })));
    await page.evaluate(() => document.querySelectorAll("#moveList .m")[0].click());
    await page.waitForTimeout(250);
    ok("an earlier move shows its position, with a Why chip on the banner", await page.isVisible("#whyChip"));
    await page.click("#whyChip");
    await page.waitForTimeout(250);
    const w0 = await toastText();
    ok("…which explains that move and keeps you looking back", /❓/.test(w0) && /e4/.test(w0) &&
       (await page.evaluate(() => !document.getElementById("viewBanner").classList.contains("hide"))), w0);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    await page.keyboard.press("?");
    await page.waitForTimeout(250);
    ok("? asks the same question from the keyboard", /^❓/.test((await toastText()).trim()), await toastText());

    /* a board tap closes the lamp, unlike other questions */
    await page.click("#btnHint"); await page.waitForTimeout(150);
    const box = await page.evaluate(() => { const r = document.getElementById("stage").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(250);
    ok("a tap on the board closes the lamp", !(await page.evaluate(() => document.getElementById("toast").classList.contains("show") && document.getElementById("toast").classList.contains("lamp"))));

    /* ---- pass and play: the book's reason, and fairness about threats ---- */
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
    await page.waitForTimeout(300);
    for (const s of ["e4", "e5", "Nf3"]) { await play(s); await page.waitForTimeout(60); }
    await settle();
    const nf3 = await page.evaluate(() => ({ text: __cr.helpForTest.explainPly(2).text, reason: Book.reason(["e4", "e5", "Nf3"]) }));
    ok("in a known line the why is the book's own reason", nf3.reason && nf3.text.indexOf(nf3.reason) > 0, nf3.text);
    ok("…and pass and play writes no automatic why (the teacher speaks for both)",
       (await notesKeyed("theirs")).length === 0);
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
    await page.waitForTimeout(300);
    for (const s of ["e4", "e5", "Nf3", "d6", "Bc4", "Bg4", "h3"]) { await play(s); await page.waitForTimeout(60); }
    await settle();
    const level = await page.evaluate(() => __cr.oddsFor(-1).mood);
    const q = await page.evaluate(() => { const r = __cr.helpForTest.explainPly(6); return { asked: r.asked, text: r.text, line: r.line }; });
    ok("level, a threat against you is asked about, not handed over (" + level + ")", level !== "behind" && q.asked &&
       /still guarded/.test(q.text) && !/g4/.test(q.text.replace(/^<b>h3<\/b>/, "")), q.text);
    const s0 = await spent();
    await page.evaluate(() => { const c = [...document.querySelectorAll("#moveList .m")]; c[c.length - 1].click(); });
    await page.waitForTimeout(300);
    const qt = await toastText();
    ok("…and the toast says which chip buys the answer, without charging", /still guarded/.test(qt) && /A move/.test(qt) && (await spent()) === s0, qt);

    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
    await page.waitForTimeout(300);
    for (const s of ["e4", "e5", "Bc4", "Nc6", "Qh5"]) { await play(s); await page.waitForTimeout(60); }
    await settle();
    const mt = await page.evaluate(() => { const r = __cr.helpForTest.explainPly(4); return { mate: r.mate, text: r.text }; });
    ok("a mate threat is named outright, and free", mt.mate && /Qxf7/.test(mt.text), mt.text);

    /* ---- the notation voice wants the move, not a menu ---- */
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); __cr.setVoiceForTest("brief"); });
    await page.waitForTimeout(300);
    await page.click("#btnHint");
    await page.waitForFunction(() => /💡/.test(document.getElementById("toast").innerText), null, { timeout: 12000 }).catch(() => {});
    const br = await page.evaluate(() => ({ text: document.getElementById("toast").innerText, chips: document.querySelectorAll("#toast .tact").length }));
    ok("in the notation voice, one tap buys the move", /💡/.test(br.text) && br.chips === 0, JSON.stringify(br));
    await page.evaluate(() => __cr.setVoiceForTest("plain"));

    /* what you ask for takes the place of buttons that were only
       extras; a question still waiting for its answer keeps its place */
    const rule = await page.evaluate(() => {
      const el = document.getElementById("toast"), tx = () => el.innerText.replace(/\s+/g, " ").trim();
      const out = {};
      el.classList.remove("show", "acts", "lamp");
      __cr.toastForTest("a hint", [{ label: "Show the line", fn() {} }], 9000, true);
      __cr.toastForTest("what you asked next");
      out.extras = tx();
      el.classList.remove("show", "acts", "lamp");
      __cr.toastForTest("allow a take-back?", [{ label: "Allow", fn() {} }], 9000);
      __cr.toastForTest("a passing remark");
      out.question = tx();
      el.classList.remove("show", "acts", "lamp");
      __cr.toastForTest("a hint", [{ label: "Show the line", fn() {} }], 9000, true);
      __cr.toastForTest("allow a take-back?", [{ label: "Allow", fn() {} }], 9000);
      __cr.toastForTest("a passing remark");
      out.after = tx();
      el.classList.remove("show", "acts", "lamp");
      return out;
    });
    ok("a hint's \"Show the line\" gives way to the next thing you ask", rule.extras === "what you asked next", JSON.stringify(rule));
    ok("…a question waiting for an answer does not give way to a remark", /^allow a take-back\?/.test(rule.question), JSON.stringify(rule));
    ok("…and a question that followed a hint is still a question", /^allow a take-back\?/.test(rule.after), JSON.stringify(rule));

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe lamp lights three ways, charges for one, and tells the truth about the coach's moves");
  process.exit(failed ? 1 : 0);
})();
