/* offline-check.js — dev-only. Pull the plug and see if the room is still there.

   "Works offline" is the kind of claim that stays true right up until
   somebody adds a file and forgets the service worker. The shell list in
   sw.js and the <script> tags in index.html drift apart silently, and
   nothing notices until a player boards a train.

   So this does it properly, in a real browser:

     1. loads the room over http and waits for the service worker to
        install and take control;
     2. compares every same-origin thing the page asks for against the
        list sw.js promises to cache — in both directions, because a
        shell entry for a file that no longer exists fails the whole
        install, which takes the app offline rather than putting it
        there;
     3. cuts the network at the browser, reloads, and checks the room
        boots: engine, piece sets, openings, no recovery overlay;
     4. starts a game and plays a move with the network still cut.

   Needs `playwright-core`; the browser is already on the machine. If it
   is missing this says so and exits 0, so it is a bonus rather than a
   barrier on a machine that hasn't got it.

   Run: node chess/tools/offline-check.js [--verbose]                    */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
const VERBOSE = process.argv.indexOf("--verbose") >= 0;
let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
if (!CHROME) { console.log("no chromium on this machine — skipping the offline check."); process.exit(0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the offline check.");
  console.log("  npm i --no-save playwright-core");
  process.exit(0);
}

/* ---------- the shell list and the page agree, both ways ---------- */
const sw = fs.readFileSync(path.join(ROOT, "chess/sw.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "chess/index.html"), "utf8");
const shell = (sw.match(/const SHELL = \[([\s\S]*?)\];/) || [])[1] || "";
const shellFiles = (shell.match(/'\.\/[^']*'/g) || []).map((s) => s.slice(3, -1)).filter(Boolean);
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
  .filter((u) => !/^(https?:|data:|mailto:|#)/.test(u) && !u.startsWith("../"));
/* A worker is pulled in by script rather than by a tag, and importScripts
   pulls in more again — none of it visible in the markup, all of it
   needed on a train. */
for (const f of shellFiles.filter((f) => f.endsWith(".js"))) {
  const src = fs.readFileSync(path.join(ROOT, "chess", f), "utf8");
  for (const m of src.matchAll(/(?:new Worker\(|importScripts\()\s*["']([^"']+)["']/g)) refs.push(m[1]);
}

const missing = refs.filter((r) => !shellFiles.includes(r));
ok("every file the page loads is in the offline shell", missing.length === 0, missing.join(", "));
const ghosts = shellFiles.filter((f) => !fs.existsSync(path.join(ROOT, "chess", f)));
ok("every file in the shell actually exists", ghosts.length === 0,
   ghosts.join(", ") + (ghosts.length ? " (one missing file fails the whole install)" : ""));

/* the manifest's icons have to survive a flight too */
try {
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, "chess/manifest.webmanifest"), "utf8"));
  const icons = (man.icons || []).map((i) => i.src.replace(/^\.\//, ""));
  const uncached = icons.filter((i) => !shellFiles.includes(i));
  ok("the manifest's icons are cached", uncached.length === 0, uncached.join(", "));
} catch (e) { ok("the manifest parses", false, e.message); }

/* ---------- and now for real ---------- */
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

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, serviceWorkers: "allow" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  try {
    await page.goto(base + "/chess/", { waitUntil: "networkidle" });
    const controlled = await page.evaluate(async () => {
      if (!navigator.serviceWorker) return false;
      await navigator.serviceWorker.ready;
      for (let i = 0; i < 80 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 250));
      return !!navigator.serviceWorker.controller;
    });
    ok("the service worker installs and takes control", controlled);

    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const out = [];
      for (const k of keys) {
        const c = await caches.open(k);
        for (const r of await c.keys()) out.push(new URL(r.url).pathname);
      }
      return out;
    });
    const want = shellFiles.map((f) => "/chess/" + f).concat(["/chess/"]);
    const notCached = want.filter((w) => !cached.some((c) => c === w || c === w.replace(/\/$/, "/index.html")));
    ok("the whole shell is in the cache after one visit", notCached.length === 0, notCached.join(", "));
    if (VERBOSE) console.log("      " + cached.length + " entries cached");

    /* cut the wire */
    await ctx.setOffline(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1200);
    const boot = await page.evaluate(() => ({
      engine: typeof Chess !== "undefined",
      sets: typeof Pieces3D !== "undefined" ? Pieces3D.list().length : 0,
      openings: typeof Eco !== "undefined",
      lessons: typeof Learn !== "undefined",
      menu: !!document.getElementById("mPass"),
      recovering: !!document.getElementById("ovRecover") &&
                  !document.getElementById("ovRecover").classList.contains("hide")
    }));
    ok("the room boots with the network cut", boot.engine && boot.menu && !boot.recovering, JSON.stringify(boot));
    ok("the carved piece sets are there offline", boot.sets >= 4, "sets=" + boot.sets);
    ok("the openings and the Academy are there offline", boot.openings && boot.lessons);

    /* and a game actually plays */
    await page.click("#mPass");
    await page.waitForTimeout(400);
    const start = await page.$("#newStart");
    if (start) await start.click();
    await page.waitForTimeout(2000);
    const playing = await page.evaluate(() => {
      const c3 = document.getElementById("cv3"), c2 = document.getElementById("cv2");
      return { board: (c3 && !c3.classList.contains("hide")) || (c2 && !c2.classList.contains("hide")),
               moves: !!document.getElementById("moveList") };
    });
    ok("a game starts and a board is drawn, offline", playing.board && playing.moves, JSON.stringify(playing));

    /* The engine runs in a worker, which is a second script fetch and an
       importScripts on top of that — none of it in the markup, all of it
       needed here. If any of it missed the cache the coach simply never
       moves, which is the quietest possible failure. */
    const brain = await page.evaluate(async () => {
      const g = Chess.create();
      const r = await Brain.search(g, { ms: 300 });
      return { offThread: Brain.offThread(), move: !!(r && r.move), depth: r ? r.depth : 0 };
    });
    ok("the engine answers offline", brain.move, JSON.stringify(brain));
    ok("…and still from its own thread", brain.offThread,
       "fell back to the main thread — the worker or its importScripts missed the cache");
    ok("no console errors while offline", errs.length === 0, errs.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nthe room survives the train tunnel");
  process.exit(failed ? 1 : 0);
})();
