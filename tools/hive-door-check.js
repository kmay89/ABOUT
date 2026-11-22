/* hive-door-check.js — dev-only. Hive Mind's first minute, played by somebody
   who has never seen it and does only what the screen points at.

   hive-check.js proves the rules are a game. This proves a stranger can get
   into it. The player here is the most literal one imaginable: a phone-sized
   browser with nothing saved, which presses Play and after that taps only
   where the pointing hand is, and nothing else, ever. If the hand is not
   showing, it waits.

   That is enough to find the things that lose people in the first minute,
   because every one of them is a place the game assumed something:

     - how long before there is something to tap, and before it pays
     - whether following the hand alone reaches the first new bee
     - how many words are on the screen while it happens
     - whether anything is ever on screen with no next thing to do

   The budget is the game's promise about its front door. It fails (exit 1)
   if the door gets slower or wordier than that.

   Needs `playwright-core` or a global `playwright`, and a Chromium; without
   them it says so and exits 0, like open-check.js.

   Run: node tools/hive-door-check.js [390x844] [--shots=dir]               */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = +process.env.HIVE_DOOR_PORT || 8397;
const size = (process.argv.slice(2).find((a) => /^\d+x\d+$/.test(a)) || "390x844").split("x").map(Number);
const shotsArg = process.argv.slice(2).find((a) => a.indexOf("--shots=") === 0);
const SHOTS = shotsArg ? shotsArg.slice(8) : null;

/* seconds, from pressing Play */
const BUDGET = { firstTap: 3, firstHoney: 12, firstEgg: 32, firstBee: 45, words: 16 };

let pw = null;
for (const name of ["playwright-core", "playwright",
                    path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "playwright")]) {
  try { pw = require(name); break; } catch (e) { /* try the next */ }
}
if (!pw) {
  console.log("\nplaywright-core isn't installed — skipping the front-door check.\n  npm i --no-save playwright-core\n");
  process.exit(0);
}
function findChromium() {
  for (const p of [process.env.CHROMIUM, "/opt/pw-browsers/chromium"]) if (p && fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  return undefined;
}

const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png",
                ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("no"); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "text/plain" });
  fs.createReadStream(file).pipe(res);
});

/* words a person can actually see right now: on screen, not hidden, not under a sheet */
const WORDS = `(() => {
  let n = 0; const seen = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
  while ((t = w.nextNode())) {
    const s = t.nodeValue.trim(); if (!s) continue;
    const p = t.parentElement; if (!p || !p.getClientRects().length) continue;
    const r = p.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth || r.width < 2) continue;
    let a = p, ok = true;
    /* something on its way out (the title, a hint) is not something to read */
    while (a) { const cs = getComputedStyle(a); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.1 || a.classList.contains("gone") || a.classList.contains("off")) { ok = false; break; } a = a.parentElement; }
    if (!ok) continue;
    const words = s.split(/\\s+/).filter((x) => /[a-z]/i.test(x));
    n += words.length; if (words.length) seen.push(s);
  }
  return { n: n, seen: seen };
})()`;

let fails = 0;
function ok(what, cond, detail) {
  if (cond) console.log("  ✓ " + what + (detail ? "  (" + detail + ")" : ""));
  else { fails++; console.log("  ✗ " + what + (detail ? " — " + detail : "")); }
}

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  let browser;
  try { browser = await pw.chromium.launch({ executablePath: findChromium() }); }
  catch (e) { console.log("\nno Chromium to drive — skipping the front-door check.\n  " + e.message + "\n"); server.close(); process.exit(0); }

  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  let shotN = 0;
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, String(shotN++).padStart(2, "0") + "-" + name + ".png") }); };

  console.log("\n──  the front door, at " + size.join("×") + ", following only the hand");
  await page.goto("http://localhost:" + PORT + "/hive/", { waitUntil: "load" });
  await page.waitForTimeout(900);
  const title = await page.evaluate(WORDS);
  await shot("title");
  await page.click("#goPlay");
  const t0 = Date.now(), sec = () => (Date.now() - t0) / 1000;

  const at = {}; let taps = 0, maxWords = 0, worst = [], idleFrom = null, longestIdle = 0;
  const state = () => page.evaluate(() => {
    const h = self.__hive(), s = h.s, hand = document.getElementById("hand");
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(hand.style.transform || "");
    return { hand: !hand.classList.contains("off") && m ? { x: +m[1], y: +m[2] } : null,
             honey: s.stats.honey, eggs: s.stats.hatched + s.brood.length, bees: s.bees.length, hatched: s.stats.hatched,
             phase: s.phase, started: s.started, hint: document.getElementById("hint").classList.contains("off") ? "" : document.getElementById("hint").textContent };
  });
  const hints = [];
  while (sec() < 62) {
    await page.waitForTimeout(160);
    const s = await state();
    if (s.hint && hints[hints.length - 1] !== s.hint) hints.push(s.hint);
    if (s.phase !== "day") break;
    const w = await page.evaluate(WORDS);
    if (w.n > maxWords) { maxWords = w.n; worst = w.seen; }
    if (s.hand) {
      if (at.firstTap === undefined) { at.firstTap = sec(); await shot("hand"); }
      /* a person takes a moment to see it and reach for it */
      await page.waitForTimeout(450);
      const again = await state();
      if (again.hand) { await page.mouse.click(again.hand.x, again.hand.y); taps++; }
      if (idleFrom !== null) { longestIdle = Math.max(longestIdle, sec() - idleFrom); idleFrom = null; }
    }
    if (s.honey > 0 && at.firstHoney === undefined) { at.firstHoney = sec(); await shot("first-honey"); }
    if (s.eggs > 0 && at.firstEgg === undefined) { at.firstEgg = sec(); await shot("first-egg"); }
    if (s.hatched > 0 && at.firstBee === undefined) { at.firstBee = sec(); await page.waitForTimeout(250); await shot("first-bee"); }
  }
  const end = await state();
  await shot("one-minute");
  await browser.close(); server.close();

  const f = (v) => (v === undefined ? "never" : v.toFixed(1) + " s");
  console.log("  the title has " + title.n + " words on it");
  console.log("  said, in order: " + hints.map((h) => "“" + h + "”").join("  "));
  ok("there is something to tap almost at once", at.firstTap !== undefined && at.firstTap <= BUDGET.firstTap, f(at.firstTap));
  ok("the first tap pays in seconds", at.firstHoney !== undefined && at.firstHoney <= BUDGET.firstHoney, "first honey at " + f(at.firstHoney));
  ok("the hand alone reaches the first egg", at.firstEgg !== undefined && at.firstEgg <= BUDGET.firstEgg, f(at.firstEgg));
  ok("and the first new bee", at.firstBee !== undefined && at.firstBee <= BUDGET.firstBee, f(at.firstBee));
  ok("with few words on screen while it happens", maxWords <= BUDGET.words, maxWords + " at most" + (maxWords > BUDGET.words ? ": " + JSON.stringify(worst) : ""));
  ok("the title is short enough to take in at a glance", title.n <= 22, title.n + " words");
  ok("a minute in, the hive has grown", end.bees > 4, end.bees + " bees after " + taps + " taps");
  ok("no console errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  console.log(fails ? "\nFAILED: " + fails + "\n" : "\nthe front door is inside its budget\n");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
