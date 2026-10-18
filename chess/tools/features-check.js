/* features-check.js — dev-only. Does every button in the room do its job?

   The other checks go deep on one thing each: the rules, the engine,
   the voices, the light, a game played by thumb, a person coming back.
   This one goes wide. It walks the room the way a curious person does on
   a first afternoon — every setting, every look in the Studio, every
   opening story to its last move, every page of the rules, the Academy,
   the record, the clock running out, a game left and come back to, a
   resignation and an agreed draw, all four promotions — on a phone and
   on a laptop, and fails on a single page error anywhere along the way.

   Needs `playwright-core`; the browser is already on the machine. If
   either is missing it says so and exits 0.

   Run: node chess/tools/features-check.js [--phone|--desk]             */
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
if (!CHROME) { console.log("no chromium on this machine — skipping the features check."); process.exit(0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the features check.");
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

const SIZES = [
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true },
  { name: "desk", viewport: { width: 1280, height: 820 }, touch: false }
].filter((s) => !process.argv.includes(s.name === "phone" ? "--desk" : "--phone"));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

  for (const size of SIZES) {
    const T = (s) => size.name + ": " + s;
    const ctx = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, isMobile: size.touch });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push("" + e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    const press = (sel) => page.click(sel);
    const play = (san, src) => page.evaluate(([f, a]) => eval(f)(a), [PLAY, [san, src]]);
    const settle = () => page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 6000 }).catch(() => {});
    const visible = (id) => page.isVisible("#" + id);
    let visit = 0;
    const fresh = async (hash) => {
      await page.goto(base + "/chess/?f=" + (++visit) + (hash || "#force2d"), { waitUntil: "networkidle" });
      await page.waitForFunction(() => document.getElementById("splash").classList.contains("gone") &&
        !document.getElementById("ovMenu").classList.contains("hide"), null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(250);
    };

    try {
      await page.goto(base + "/chess/#force2d", { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await fresh();
      ok(T("the lobby opens"), await visible("ovMenu"));

      /* ---- settings: every switch switches ---- */
      await press("#mSettings");
      ok(T("Settings opens"), await visible("ovSettings"));
      await press("#setSound");
      ok(T("sound turns off"), await page.evaluate(() => !JSON.parse(localStorage.chessroom_prefs).sound));
      await press("#setSound");
      ok(T("…and on again"), await page.evaluate(() => JSON.parse(localStorage.chessroom_prefs).sound));
      await press("#vcBrief");
      ok(T("the coach's voice switches to notation"), await page.evaluate(() => JSON.parse(localStorage.chessroom_prefs).coachVoice === "brief"));
      await press("#vcPlain");
      await press("#ckClassic");
      ok(T("the classic clock face is chosen"), await page.evaluate(() => document.body.classList.contains("clock-classic")));
      await press("#ckSimple");
      await press("#setHelpers");
      ok(T("move dots switch off"), await page.evaluate(() => !JSON.parse(localStorage.chessroom_prefs).helpers));
      await press("#setHelpers");
      await press("#setBack");
      ok(T("Done goes back to the lobby"), await visible("ovMenu"));
      await press("#mAbout");
      ok(T("About opens"), await visible("ovAbout"));
      await press("#aboutBack");

      /* ---- a game and its buttons ---- */
      await press("#mPass"); await press("#newStart");
      await page.waitForTimeout(800);
      for (const s of ["e4", "e5", "Nf3"]) { await play(s); await page.waitForTimeout(60); }
      await settle();
      const o1 = await page.evaluate(() => __cr.renderer.orientation);
      await press("#btnFlip");
      ok(T("Flip turns the board"), await page.evaluate(() => __cr.renderer.orientation) === -o1);
      await press("#btnFlip");
      await press("#btnReplay");
      await page.waitForTimeout(150);
      ok(T("Last move replays it"), await page.evaluate(() => __cr.renderer.isAnimating()));
      await settle();
      await press("#btnUndo"); await settle();
      ok(T("Undo takes a move back"), (await page.evaluate(() => __cr.game.played.length)) === 2);
      await press("#btnHint");
      await page.waitForFunction(() => /💡/.test(document.getElementById("toast").innerText), null, { timeout: 12000 }).catch(() => {});
      ok(T("Hint gives a move and a reason"), /💡/.test(await page.evaluate(() => document.getElementById("toast").innerText)));
      const was = await page.evaluate(() => __cr.renderer.kind);
      await press("#btnDim");
      await page.waitForTimeout(1800);
      const now = await page.evaluate(() => [__cr.renderer.kind, __cr.game.played.length]);
      ok(T("the 2D/3D button switches boards and keeps the game"), now[0] !== was && now[1] === 2, now.join(" "));
      await press("#btnDim"); await page.waitForTimeout(600);
      await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(150);
      ok(T("← looks back a move"), await visible("viewBanner"));
      await page.keyboard.press("End"); await page.waitForTimeout(150);
      ok(T("End comes back to the game"), !(await visible("viewBanner")));

      /* ---- the Studio: every look in the gallery ---- */
      await press("#btnStudio"); await page.waitForTimeout(500);
      ok(T("the Studio opens"), await page.evaluate(() => document.getElementById("studio").classList.contains("open")));
      const presets = await page.locator("#stPresets .preset").count();
      const names = new Set();
      for (let i = 0; i < presets; i++) {
        await page.locator("#stPresets .preset").nth(i).click();
        await page.waitForTimeout(120);
        names.add(await page.evaluate(() => __cr.skin.name));
      }
      ok(T("every look in the gallery can be worn"), presets >= 8 && names.size === presets, presets + " presets, " + names.size + " names");
      await press("#stRandom"); await page.waitForTimeout(150);
      await press("#stExport"); await page.waitForTimeout(150);
      ok(T("a look can be exported as a code"), /SKIN1\./.test(await page.evaluate(() => document.getElementById("stCode").value)));
      await press("#stClose"); await page.waitForTimeout(400);
      ok(T("the Studio closes"), await page.evaluate(() => !document.getElementById("studio").classList.contains("open")));

      /* ---- leaving and coming back ---- */
      await fresh();
      ok(T("a game left mid-way is offered back"), await visible("mResume"));
      await press("#mResume"); await page.waitForTimeout(800);
      ok(T("…and comes back exactly"), (await page.evaluate(() => __cr.game.played.map((r) => r.san).join(" "))) === "e4 e5");

      /* ---- pass & play endings: resign, a draw, the clock ---- */
      await press("#btnMenu"); await page.waitForTimeout(300);
      await page.click("#gameOps .chip >> text=Agree a draw");
      await page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 6000 }).catch(() => {});
      ok(T("an agreed draw ends the game as a draw"), /draw/i.test(await page.evaluate(() => document.getElementById("endTitle").textContent)));
      await press("#endRematch"); await page.waitForTimeout(700);
      await play("d4"); await settle();
      await press("#btnMenu"); await page.waitForTimeout(300);
      await page.click("#gameOps .chip >> text=resigns");
      await page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 6000 }).catch(() => {});
      ok(T("a resignation gives the other side the game"), /White wins/i.test(await page.evaluate(() => document.getElementById("endTitle").textContent)));
      await page.evaluate(() => { __cr.startGame("pass", { clockStr: "3+2" }); });
      await play("e4"); await play("e5"); await settle();
      await page.evaluate(() => __cr.flagForTest(1));
      await page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 6000 }).catch(() => {});
      ok(T("a clock running out ends the game on time"), /time/i.test(await page.evaluate(() => document.getElementById("endSub").textContent)));

      /* ---- all four promotions ---- */
      for (const [k, want] of [[0, "Q"], [1, "N"], [2, "R"], [3, "B"]]) {
        await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
        for (const s of ["a4", "h6", "a5", "b5", "axb6", "h5", "bxc7", "h4"]) { await play(s); await page.waitForTimeout(30); }
        await settle();
        await page.evaluate(() => { const g = __cr.game; void g; });
        const sq = await page.evaluate(() => {
          const R = __cr.renderer, st = document.getElementById("stage");
          const find = (q) => { let sx = 0, sy = 0, n = 0;
            for (let y = 0; y < st.clientHeight; y += 4) for (let x = 0; x < st.clientWidth; x += 4) if (R.screenToSquare(x, y) === q) { sx += x; sy += y; n++; }
            return { x: sx / n, y: sy / n }; };
          return [find(0x62), find(0x73)];
        });
        const box = await page.locator("#stage").boundingBox();
        await page.mouse.click(box.x + sq[0].x, box.y + sq[0].y); await page.waitForTimeout(120);
        await page.mouse.click(box.x + sq[1].x, box.y + sq[1].y); await page.waitForTimeout(200);
        await page.locator("#promoRow button").nth(k).click();
        await settle();
        const last = await page.evaluate(() => __cr.game.played.slice(-1)[0].san);
        ok(T("promotion to " + want), new RegExp("=" + want).test(last), last);
      }

      /* ---- every page of the rules, and where they lead ---- */
      await fresh();
      await press("#mLearn");
      let pages = 1;
      while (pages < 40 && !/first game/i.test(await page.evaluate(() => document.getElementById("learnNext").textContent))) {
        await press("#learnNext"); pages++;
      }
      ok(T("the rules can be read to the end"), pages > 5, pages + " pages");
      await press("#learnNext"); await page.waitForTimeout(900);
      ok(T("…and end in a first game against the gentlest coach"),
         await page.evaluate(() => __cr.mode === "coach" && document.getElementById("nameTop").textContent + document.getElementById("nameBot").textContent).then((t) => /Acorn/.test(String(t))));

      /* ---- every opening story, to its last move ---- */
      await fresh();
      await press("#mOpenings");
      const stories = await page.locator("#openingList .oline").count();
      let told = 0, ended = 0;
      for (let i = 0; i < stories; i++) {
        if (!(await visible("ovOpenings"))) await press("#mOpenings");
        await page.locator("#openingList .oline").nth(i).click();
        await page.waitForTimeout(250);
        const n = await page.evaluate(() => __cr.mode === "tour");
        if (n) told++;
        for (let k = 0; k < 30; k++) {
          const next = page.locator("#lessonBar .lchip", { hasText: "Next" });
          if (!(await next.count())) break;
          await next.first().click();
          await page.waitForTimeout(40);
        }
        await settle();
        if (await page.locator("#lessonBar .lchip", { hasText: "Play on" }).count()) ended++;
        await page.locator("#lessonBar .lchip", { hasText: "Another story" }).first().click();
        await page.waitForTimeout(150);
      }
      ok(T("every opening story starts"), stories >= 30 && told === stories, told + "/" + stories);
      ok(T("…and can be stepped to its end"), ended === stories, ended + "/" + stories);
      await page.locator("#openingList .oline").first().click(); await page.waitForTimeout(200);
      for (let k = 0; k < 30; k++) {
        const next = page.locator("#lessonBar .lchip", { hasText: "Next" });
        if (!(await next.count())) break;
        await next.first().click(); await page.waitForTimeout(40);
      }
      await page.locator("#lessonBar .lchip", { hasText: "Play on" }).first().click();
      await page.waitForTimeout(500);
      ok(T("Play on from a story becomes a game against the computer"), await page.evaluate(() => __cr.mode === "coach"));

      /* ---- the Academy: every lesson opens ---- */
      await fresh();
      await press("#mAcademy");
      const rows = await page.locator("#academyList .lrow2").count();
      let opened = 0;
      for (let i = 0; i < rows; i++) {
        if (!(await visible("ovAcademy"))) await press("#mAcademy");
        await page.locator("#academyList .lrow2").nth(i).click();
        await page.waitForTimeout(250);
        if (await page.evaluate(() => __cr.mode === "lesson" && !!__cr.lesson)) opened++;
        await page.locator("#lessonBar .lchip", { hasText: "Leave" }).first().click().catch(async () => {
          await page.evaluate(() => { const b = [...document.querySelectorAll("#lessonBar .lchip")].find((x) => /Leave|Academy/.test(x.textContent)); if (b) b.click(); });
        });
        await page.waitForTimeout(150);
      }
      ok(T("every lesson in the Academy opens"), rows >= 18 && opened === rows, opened + "/" + rows);

      /* ---- the record ---- */
      await fresh();
      await press("#mRating");
      ok(T("your record opens"), await visible("ovProfile"));
      ok(T("…with the whole ladder"), (await page.locator("#pfLadder .rungRow").count()) >= 8);
      await press("#pfBack");

      /* ---- a friend nearby: the door opens and closes ---- */
      await press("#mLan"); await page.waitForTimeout(300);
      ok(T("Play nearby opens"), await visible("ovLink"));
      await press("#linkBack"); await page.waitForTimeout(300);
      ok(T("…and closes back to the lobby"), await visible("ovMenu"));

      ok(T("nothing shouted at the console"), errs.length === 0, errs.slice(0, 3).join(" | "));
    } catch (e) {
      failed++;
      console.log("FAIL  " + size.name + ": the check itself fell over  → " + (e && e.stack || e));
      const shot = path.join(require("os").tmpdir(), "features-check-fail-" + size.name + ".png");
      try { await page.screenshot({ path: shot }); console.log("      the page at that moment: " + shot); } catch (err) {}
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
  console.log(failed ? "\n" + failed + " failed" : "\nevery button in the room does its job, on a phone and on a laptop");
  process.exit(failed ? 1 : 0);
})();
