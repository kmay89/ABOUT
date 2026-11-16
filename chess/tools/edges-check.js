/* edges-check.js — dev-only. The rough edges stay filed down.

   Each fix from the wave-2 kill list has an assertion here, run in a
   real browser where the bug was one you could see:

   - a phone on its side: every button in the rail keeps a label, and a
     remark never lies on the near ranks;
   - the clock is charged by the wall clock: a page the browser stopped
     drawing for four seconds pays four seconds; out of sight in a game
     on this device is a pause (and said); between two devices the time
     away is charged on return, from the last resync rather than from
     when the tab went, and a flag that fell meanwhile falls at once;
     the link card pauses a coach game like every other card;
   - one list of clock presets, one rule (clkOk) for what a clock may
     be, custom minutes + increment on the new-game card, remembered;
   - always a queen: off by default, promotes in the same gesture when
     on, and still asks — saying why — when a knight mates or a queen
     stalemates;
   - the recovery card: plain words, the technical line, unhandled
     promise failures of the kind a bug makes count (network and
     permission ones don't), "clear the game in progress" keeps the
     record, "erase everything" names what it erases and then does it;
   - a browser that refuses to save says so once;
   - housekeeping: no duplicate keys in the dev handle, one escaper.

   Needs `playwright-core`; the browser is already on the machine. If
   either is missing it says so and exits 0.

   Run: node chess/tools/edges-check.js                                   */
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

/* ---- the source, read as text: housekeeping that has no screen ---- */
const APP = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
ok("one escaping rule in app.js (esc calls escHtml)", (APP.match(/"&amp;"/g) || []).length === 1);
const crBlock = APP.slice(APP.indexOf("window.__cr = {"), APP.indexOf("helpTestHooks(window.__cr)"));
ok("the dev handle names feedCode and openLink once each",
  (crBlock.match(/feedCode: feedCode/g) || []).length === 1 && (crBlock.match(/openLink: openLink/g) || []).length === 1);
ok("the clock chips are not written into the page by hand", !/data-clock="\d/.test(HTML));
ok("no hand-kept PAUSING list beside CARDS", !/var PAUSING\b/.test(APP) && /var CARDS = \[/.test(APP));
ok("recovery no longer wipes every key under a 'settings' label", !/Clears the saved game and settings/.test(HTML));

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
if (!CHROME) { console.log("no chromium on this machine — skipping the browser half of the edges check."); process.exit(failed ? 1 : 0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the browser half of the edges check.");
  console.log("  npm i --no-save playwright-core");
  process.exit(failed ? 1 : 0);
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

const SQ = (name) => (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);
const WHERE = `(sq) => {
  const R = __cr.renderer, st = document.getElementById('stage');
  const w = st.clientWidth, h = st.clientHeight;
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
    if (R.screenToSquare(x, y) === sq) { sx += x; sy += y; n++; }
  }
  return n ? { x: sx / n, y: sy / n } : null;
}`;
const PLAY = `([san, src]) => {
  const g = __cr.game;
  const mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, '') === san.replace(/[+#]$/, ''));
  if (!mv) return false;
  __cr.commitMove(mv, src || 'local');
  return true;
}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  const open = async (ctx, url) => {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push("" + e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await page.goto(base + (url || "/chess/#force2d"), { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("splash").classList.contains("gone"), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(300);
    return page;
  };
  const booted = (page) => page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 30000 }).catch(() => {});

  try {
    /* ================= a phone on its side ================= */
    {
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
      const page = await open(ctx);
      await page.evaluate(() => __cr.startGame("pass", { clockStr: "none", fresh: true }));
      await page.waitForTimeout(500);
      const bare = await page.evaluate(() => [...document.querySelectorAll("#actions .abtn")].filter((b) => b.offsetParent)
        .filter((b) => !b.innerText.replace(b.querySelector(".ic").innerText, "").replace(/[−+]?\d+s?/g, "").trim())
        .map((b) => b.id));
      ok("landscape phone: every button in the rail keeps a label", bare.length === 0, bare.join(", "));
      const geo = await page.evaluate(() => {
        const t = document.getElementById("toast");
        t.innerHTML = "The Italian Game — both sides bring a knight out first and look at the centre.";
        t.classList.add("show");
        const b = t.getBoundingClientRect(), st = document.getElementById("stage").getBoundingClientRect();
        const R = __cr.renderer, a = R.squareToScreen(0x00), h = R.squareToScreen(0x77);
        const bx = { l: st.left + Math.min(a.x, h.x) - a.s / 2, r: st.left + Math.max(a.x, h.x) + a.s / 2,
                     t: st.top + Math.min(a.y, h.y) - a.s / 2, b: st.top + Math.max(a.y, h.y) + a.s / 2 };
        return { overlap: !(b.right <= bx.l || b.left >= bx.r || b.bottom <= bx.t || b.top >= bx.b), toast: [b.left, b.top, b.right, b.bottom].map(Math.round), board: bx, inView: b.right <= innerWidth && b.bottom <= innerHeight && b.left >= 0 };
      });
      ok("landscape phone: a remark does not lie on the board", !geo.overlap, JSON.stringify(geo));
      ok("landscape phone: …and stays on screen", geo.inView, JSON.stringify(geo.toast));
      await ctx.close();
    }

    /* ================= the desk: clocks, promotion, recovery ================= */
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: "block" });
    let page = await open(ctx);

    /* ---- one list, one rule ---- */
    const chips = await page.evaluate(() => [...document.querySelectorAll("#clockChips [data-clock]")].map((b) => b.getAttribute("data-clock")));
    const presets = await page.evaluate(() => __cr.CLK_PRESETS.map((p) => p.v));
    ok("the clock chips are drawn from CLK_PRESETS, plus Other…", JSON.stringify(chips) === JSON.stringify(presets.concat(["custom"])), chips.join(" "));
    const rule = await page.evaluate(() => ["none", "3+2", "12+4", "1+0", "180+60", "0+0", "181+0", "5+61", "5+", "abc", "5+0/3+0", "", null, "05+00"].map((s) => __cr.clkOk(s)));
    ok("clkOk: none, M+S inside 1–180 min and 0–60 s; nothing else",
      JSON.stringify(rule) === JSON.stringify([true, true, true, true, true, false, false, false, false, false, false, false, false, true]), JSON.stringify(rule));

    /* ---- a hand-edited store: a junk clock dropped, a custom one kept, "false" is false ---- */
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem("chessroom_prefs") || "{}");
      p.lastClock = { coach: "abc", pass: "12+4", lan: "999+0" }; p.sound = "false"; p.helpers = "true"; p.tilt = 7;
      localStorage.setItem("chessroom_prefs", JSON.stringify(p));
    });
    await page.reload({ waitUntil: "networkidle" }); await booted(page);
    const pr = await page.evaluate(() => { const p = __cr.prefsForTest; return { lc: p.lastClock, sound: p.sound, helpers: p.helpers, tilt: p.tilt, aq: p.autoQueen }; });
    ok("prefs: a clock clkOk refuses is dropped, a custom one kept", pr.lc.coach === undefined && pr.lc.lan === undefined && pr.lc.pass === "12+4", JSON.stringify(pr.lc));
    ok("prefs: a switch stored as the word \"false\" is off; junk falls back to the default", pr.sound === false && pr.helpers === true && pr.tilt === true, JSON.stringify(pr));
    ok("auto-queen is off by default", pr.aq === false);

    /* ---- the custom clock on the new-game card ---- */
    await page.click("#mPass"); await page.waitForTimeout(250);
    const card = await page.evaluate(() => ({ sel: document.querySelector("#clockChips .sel") && document.querySelector("#clockChips .sel").getAttribute("data-clock"),
      shown: !document.getElementById("clkCustom").classList.contains("hide"), min: document.getElementById("clkMin").value, inc: document.getElementById("clkInc").value,
      say: document.getElementById("clkSay").textContent }));
    ok("a remembered custom clock opens the card on Other… with its numbers", card.sel === "custom" && card.shown && card.min === "12" && card.inc === "4", JSON.stringify(card));
    ok("…and says it in words", /12 minutes each, plus 4 seconds back after every move/.test(card.say), card.say);
    await page.click('#clockChips [data-clock="5+0"]');
    ok("a preset hides the custom fields", await page.evaluate(() => document.getElementById("clkCustom").classList.contains("hide")));
    await page.click('#clockChips [data-clock="custom"]');
    await page.fill("#clkMin", "999");
    ok("a number past the bounds is held to them as it is typed", /180 minutes/.test(await page.textContent("#clkSay")));
    await page.fill("#clkMin", "2"); await page.fill("#clkInc", "3");
    await page.click("#newStart"); await page.waitForTimeout(500);
    const c1 = await page.evaluate(() => { const c = __cr.clockForTest(); return { on: c.on, base: c.base, inc: c.inc, top: document.getElementById("clockTop").textContent }; });
    ok("Other… 2 + 3 starts a two-minute clock with three seconds a move", c1.on && c1.base === 120000 && c1.inc === 3000 && c1.top === "2:00", JSON.stringify(c1));
    ok("…and is remembered for next time", await page.evaluate(() => __cr.prefsForTest.lastClock.pass === "2+3"));

    /* ---- the wall clock: a coach game, white to move after the first two plies ---- */
    const coachGame = async (clockStr) => {
      await page.evaluate((c) => __cr.startGame("coach", { humanSide: 1, skill: "sprout", clockStr: c, fresh: true }), clockStr);
      await page.waitForTimeout(300);
      await page.evaluate(([f, a]) => eval(f)(a), [PLAY, ["e4"]]);
      await page.waitForFunction(() => __cr.game.played.length === 2, null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(300);
    };
    await coachGame("5+0");
    /* A page the browser stops drawing: the main thread held for `ms`, so no
       frame runs and the clock is not read until it is over — what a tab
       in the background, or a long stall, looks like to the room. */
    const stall = (ms) => page.evaluate((n) => { const t = performance.now(); while (performance.now() - t < n) { /* held */ } }, ms);
    const setHidden = (h) => page.evaluate((hidden) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event("visibilitychange"));
      return { over: !!__cr.overForTest(), w: __cr.clockForTest().w, b: __cr.clockForTest().b };
    }, h);
    const wNow = () => page.evaluate(() => __cr.clockForTest().w);
    ok("the coach game's clock is running for White", await page.evaluate(() => __cr.clockForTest().run === 1));

    /* the coach's reply has landed and nothing is moving before the clock is read */
    await page.waitForFunction(() => !__cr.renderer.isAnimating() && __cr.clockForTest().run === 1, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(200);
    let w0 = await wNow();
    await stall(4000);
    await page.waitForTimeout(300);
    const diag = await page.evaluate(() => ({ run: __cr.clockForTest().run, paused: __cr.clockPausedForTest(),
      open: [...document.querySelectorAll(".ov:not(.hide)")].map((o) => o.id) }));
    let lost = w0 - await wNow();
    ok("a page that stops drawing for 4 s (still in sight) is charged the 4 s", lost >= 3900 && lost <= 5500,
      "charged " + Math.round(lost) + " ms " + JSON.stringify(diag));

    /* out of sight in a game on this device: a pause, and said */
    await page.evaluate(() => { document.getElementById("toast").classList.remove("show"); });
    w0 = await wNow();
    await setHidden(true);
    await stall(3500);
    await setHidden(false);
    await page.waitForTimeout(250);
    lost = w0 - await wNow();
    ok("out of sight in a coach game the clock waits", lost < 1200, "charged " + Math.round(lost) + " ms");
    ok("…and says so on return", /waited while you were away/.test(await page.evaluate(() => document.getElementById("toast").innerText)));

    /* the link card pauses a coach game, like every other card */
    ok("CARDS: the link cards pause; the end card doesn't",
      await page.evaluate(() => { const p = __cr.cardIdsForTest("pause"); return p.indexOf("ovLink") >= 0 && p.indexOf("ovLinked") >= 0 && p.indexOf("ovMenu") >= 0 && p.indexOf("ovEnd") < 0; }));
    w0 = await wNow();
    await page.evaluate(() => document.getElementById("ovLink").classList.remove("hide"));
    await page.waitForTimeout(1500);
    const pausedNow = await page.evaluate(() => __cr.clockPausedForTest());
    await page.evaluate(() => document.getElementById("ovLink").classList.add("hide"));
    lost = w0 - await wNow();
    ok("the clock stands still while \"A friend nearby\" is open over a coach game", pausedNow && lost < 300, "charged " + Math.round(lost) + " ms");

    /* ---- between two devices: charged on return, from the last resync ---- */
    const lanGame = async () => {
      await page.evaluate(() => __cr.startGame("lan", { clockStr: "3+0" }));
      await page.waitForTimeout(250);
      await page.evaluate(([f, a]) => eval(f)(a), [PLAY, ["e4", "local"]]);
      await page.waitForTimeout(150);
      await page.evaluate(([f, a]) => eval(f)(a), [PLAY, ["e5", "net"]]);
      await page.waitForTimeout(250);
    };
    await lanGame();
    ok("the two-device game's clock is running for this side (White)", await page.evaluate(() => __cr.mode === "lan" && __cr.clockForTest().run === 1));
    w0 = await wNow();
    await setHidden(true);
    await stall(3500);
    await setHidden(false);
    await page.waitForTimeout(200);
    lost = w0 - await wNow();
    ok("between two devices the time away is charged on return", lost >= 3300 && lost <= 5000, "charged " + Math.round(lost) + " ms");
    ok("…and the room says so", /were away \d+ s/.test(await page.evaluate(() => document.getElementById("toast").innerText)));

    /* their move arrives while this tab is away: both clocks resync, and only
       the time since is this side's to pay */
    await page.evaluate(([f, a]) => eval(f)(a), [PLAY, ["Nf3", "local"]]);
    await page.waitForTimeout(200);
    await setHidden(true);
    await sleep(1800);   /* frames run meanwhile: their clock runs on this board too */
    const sent = await page.evaluate(() => { const c = __cr.clockForTest(); return { w: c.w, b: c.b - 500 }; });
    await page.evaluate(([f, a, s]) => {
      const c = __cr.clockForTest(); c.w = s.w; c.b = s.b;   /* what the mover's device sent with its move */
      eval(f)(a);
    }, [PLAY, ["Nc6", "net"], sent]);
    await stall(2000);
    await setHidden(false);
    await page.waitForTimeout(150);
    lost = sent.w - await wNow();
    ok("a move that arrived while away restarts the charge from that moment", lost >= 1700 && lost <= 3200, "charged " + Math.round(lost) + " ms (away ~3.8 s)");

    /* a flag that fell while away falls on return, before anything else */
    await page.evaluate(() => { const c = __cr.clockForTest(); c.w = 1500; c.lastT = performance.now(); });
    await setHidden(true);
    await stall(2500);
    const back = await setHidden(false);
    ok("a flag that fell while away is down the moment the tab is back", back.over && back.w <= 0, JSON.stringify(back));
    ok("…and the game ends on time", await page.evaluate(() => /out of time/.test((__cr.overForTest() || {}).reason || "")));
    await page.evaluate(() => { document.getElementById("ovEnd").classList.add("hide"); });

    /* ---- always a queen ---- */
    const why = await page.evaluate(() => [
      __cr.aqWhyForTest("6bn/5Ppk/7p/8/8/8/8/K7 w - - 0 1", "f7", "f8"),
      __cr.aqWhyForTest("8/1P6/k7/8/K7/8/8/8 w - - 0 1", "b7", "b8"),
      __cr.aqWhyForTest("8/4P3/8/8/8/8/8/k6K w - - 0 1", "e7", "e8")]);
    ok("the picker's reason: a knight that mates where the queen doesn't", /knight here is checkmate/.test(why[0] || ""), why[0]);
    ok("…a queen that stalemates where a rook doesn't", /queen here is stalemate.*rook/.test(why[1] || ""), why[1]);
    ok("…and nothing to say about a plain promotion", why[2] === null, why[2]);

    const setPos = (fen) => page.evaluate((f) => {
      __cr.startGame("pass", { clockStr: "none", fresh: true });
      const g = __cr.game; Chess.loadFEN(g, f); g.played.length = 0; g.hist.length = 0;
      __cr.renderer.setPosition(g.board); __cr.syncAll();
    }, fen);
    const box = await page.locator("#stage").boundingBox();
    const click = async (name) => {
      const at = await page.evaluate(([f, s]) => eval(f)(s), [WHERE, SQ(name)]);
      if (!at) return false;
      await page.mouse.click(box.x + at.x, box.y + at.y);
      await page.waitForTimeout(160);
      return true;
    };
    const promo = () => page.evaluate(() => ({ open: !document.getElementById("ovPromo").classList.contains("hide"),
      why: document.getElementById("aqWhy").classList.contains("hide") ? "" : document.getElementById("aqWhy").textContent,
      last: __cr.game.played.length ? __cr.game.played[__cr.game.played.length - 1].san : "" }));

    await setPos("8/4P3/8/8/8/8/8/k6K w - - 0 1");
    await page.waitForTimeout(300);
    await click("e7"); await click("e8");
    let pp = await promo();
    ok("auto-queen off: the picker opens, with no reason line", pp.open && !pp.why && !pp.last, JSON.stringify(pp));
    await page.evaluate(() => document.getElementById("promoCancel").click());

    await page.evaluate(() => { __cr.showMenu(); document.getElementById("mSettings").click(); });
    await page.waitForTimeout(200);
    await page.click("#aqQueen");
    ok("the Promotion row turns auto-queen on and keeps it", await page.evaluate(() => __cr.prefsForTest.autoQueen === true &&
      JSON.parse(localStorage.getItem("chessroom_prefs")).autoQueen === true && document.getElementById("aqQueen").classList.contains("sel")));

    await setPos("8/4P3/8/8/8/8/8/k6K w - - 0 1");
    await page.waitForTimeout(300);
    await click("e7"); await click("e8");
    await page.waitForTimeout(300);
    pp = await promo();
    ok("auto-queen on: the pawn becomes a queen in the same gesture", !pp.open && /^e8=Q/.test(pp.last), JSON.stringify(pp));

    await setPos("6bn/5Ppk/7p/8/8/8/8/K7 w - - 0 1");
    await page.waitForTimeout(300);
    await click("f7"); await click("f8");
    pp = await promo();
    ok("…but asks, and says why, when the knight mates and the queen doesn't", pp.open && /knight here is checkmate/.test(pp.why) && !pp.last, JSON.stringify(pp));
    await page.evaluate(() => document.querySelectorAll("#promoRow button")[1].click());
    await page.waitForTimeout(300);
    ok("…and the knight it was asked for is played", /^f8=N#/.test((await promo()).last), (await promo()).last);

    /* ---- recovery ---- */
    const keys = () => page.evaluate(() => Object.keys(localStorage).sort());
    const recShown = () => page.evaluate(() => !document.getElementById("ovRecover").classList.contains("hide"));
    await page.evaluate(() => {
      const r = Rating.fresh(); r.games = 7; r.wins = 4; r.losses = 3; r.r = 1043;
      Rating.save(r, (k, v) => localStorage.setItem(k, v));
    });
    await page.reload({ waitUntil: "networkidle" }); await booted(page);

    /* failures that are not the room breaking never raise the card */
    await page.evaluate(() => {
      const fire = (reason) => window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", { promise: Promise.resolve(), reason: reason }));
      for (let i = 0; i < 3; i++) {
        fire(new TypeError("Failed to fetch"));
        fire(new DOMException("The request is not allowed", "NotAllowedError"));
        fire("cancelled");
      }
    });
    await page.waitForTimeout(150);
    ok("network, permission and plain-value rejections never raise the recovery card", !(await recShown()));
    await page.evaluate(() => {
      for (let i = 0; i < 3; i++) window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", { promise: Promise.resolve(), reason: new TypeError("ac is not defined") }));
    });
    await page.waitForTimeout(150);
    ok("three unhandled TypeErrors from promises raise it", await recShown());
    const words = await page.evaluate(() => ({ why: document.getElementById("recWhy").textContent, tech: document.getElementById("recTechTx").textContent }));
    ok("the card says what happened in plain words", /ran into trouble three times/.test(words.why) && /nothing is lost/.test(words.why), words.why);
    ok("…with the technical line one tap away", /ac is not defined/.test(words.tech) && /mode /.test(words.tech) && /ply \d+/.test(words.tech), words.tech);
    const order = await page.evaluate(() => [...document.querySelectorAll("#ovRecover > .card > button")].filter((b) => b.offsetParent).map((b) => b.id));
    ok("the choices come in order: try again, 2D, clear the game, then erase", order.join(",") === "recReload,rec2D,recGame,recWipe", order.join(","));

    /* try again: a reload that keeps everything */
    const before = await keys();
    await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("#recReload")]);
    await booted(page);
    const afterTry = await keys();
    ok("Try again reloads and keeps every key", before.every((k) => afterTry.indexOf(k) >= 0) && !(await recShown()), before.filter((k) => afterTry.indexOf(k) < 0).join(", "));

    /* clear only the game in progress */
    await page.evaluate(() => __cr.startGame("pass", { clockStr: "none", fresh: true }));
    await page.waitForTimeout(250);
    await page.evaluate(([f, a]) => eval(f)(a), [PLAY, ["d4"]]);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      localStorage.setItem("chessroom_lan", JSON.stringify({ v: 1, code: "BUZZ", side: 1, sans: [] }));
      localStorage.setItem("room:chess", JSON.stringify({ code: "BUZZ", key: "k" }));
      for (let i = 0; i < 3; i++) window.dispatchEvent(new ErrorEvent("error", { message: "boom " + i, filename: location.origin + "/chess/gfx3d.js", lineno: 77 }));
    });
    await page.waitForTimeout(150);
    ok("three errors raise the card, and it names where (the 3D board)", (await recShown()) && /3D board/.test(await page.textContent("#recWhy")));
    const s1 = await keys();
    ok("there is a game in progress, a linked game and a record to lose", ["chessroom_save", "chessroom_lan", "room:chess", "chessroom_rating", "chessroom_prefs"].every((k) => s1.indexOf(k) >= 0), s1.join(" "));
    await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("#recGame")]);
    await booted(page);
    const s2 = await keys();
    ok("Clear the game in progress forgets the game, the linked game and its four letters",
      ["chessroom_save", "chessroom_lan", "room:chess"].every((k) => s2.indexOf(k) < 0), s2.join(" "));
    const kept = s1.filter((k) => ["chessroom_save", "chessroom_lan", "room:chess"].indexOf(k) < 0);
    ok("…and keeps everything else: rating, settings and the rest", kept.every((k) => s2.indexOf(k) >= 0), kept.filter((k) => s2.indexOf(k) < 0).join(", "));
    ok("…the rating among it, unchanged", await page.evaluate(() => { const r = Rating.load((k) => localStorage.getItem(k)); return r.games === 7 && Math.round(r.r) === 1043; }));

    /* erase everything: named first, then done */
    await page.evaluate(() => { for (let i = 0; i < 3; i++) window.dispatchEvent(new ErrorEvent("error", { message: "boom", filename: location.origin + "/chess/app.js", lineno: 1 })); });
    await page.waitForTimeout(150);
    ok("erasing needs a second tap", await page.evaluate(() => document.getElementById("recWipeAsk").classList.contains("hide")));
    await page.click("#recWipe");
    const wipeTx = await page.textContent("#recWipeTx");
    ok("…which names what it erases: rating, stars, lessons, journal, friends, skins",
      ["rating", "stars", "lessons", "journal", "friends", "skins", "settings"].every((w) => wipeTx.indexOf(w) >= 0), wipeTx);
    ok("…with this device's numbers", /rating of 1043 from 7 games/.test(wipeTx), wipeTx);
    await page.click("#recWipeNo");
    ok("Keep it puts the question away", await page.evaluate(() => document.getElementById("recWipeAsk").classList.contains("hide")));
    await page.click("#recWipe");
    await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("#recWipeGo")]);
    await booted(page);
    const s3 = await keys();
    ok("Erase it all leaves no rating, journal, lessons, friends, skins or game behind",
      ["chessroom_rating", "chessroom_ladder", "chessroom_learn", "chessroom_games", "chessroom_friends", "chessroom_skins", "chessroom_save", "room:chess"].every((k) => s3.indexOf(k) < 0), s3.join(" "));
    ok("…and the rating reads as new", await page.evaluate(() => Rating.load((k) => localStorage.getItem(k)).games === 0));

    /* a browser that will not keep anything says so, once */
    await page.evaluate(() => {
      document.getElementById("toast").classList.remove("show");
      window.__realSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException("full", "QuotaExceededError"); };
      __cr.showMenu(); document.getElementById("mSettings").click(); document.getElementById("aqAsk").click();
    });
    await page.waitForTimeout(200);
    const t1 = await page.evaluate(() => document.getElementById("toast").classList.contains("show") ? document.getElementById("toast").innerText : "");
    await page.evaluate(() => { document.getElementById("toast").classList.remove("show"); document.getElementById("aqQueen").click(); });
    await page.waitForTimeout(200);
    const t2 = await page.evaluate(() => document.getElementById("toast").classList.contains("show") ? document.getElementById("toast").innerText : "");
    await page.evaluate(() => { Storage.prototype.setItem = window.__realSet; });
    ok("a save the browser refuses is said", /isn't keeping what the room saves/.test(t1), t1);
    ok("…once, not on every save", !/isn't keeping/.test(t2), t2);

    const real = errs.filter((e) => !/boom|ac is not defined|Failed to fetch|not allowed|cancelled|QuotaExceeded|full/.test(e));
    ok("console quiet (apart from the errors this check raised on purpose)", real.length === 0, real.slice(0, 3).join(" | "));
    await ctx.close();
  } catch (e) {
    failed++;
    console.log("FAIL  the check itself threw: " + (e && e.stack || e));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failed ? "\n" + failed + " FAIL" : "\nall ok");
  process.exit(failed ? 1 : 0);
})();
