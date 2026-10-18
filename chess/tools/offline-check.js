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
     4. starts a game and plays a move with the network still cut;
     5. ships a release while the room is open: two builds of the room,
        A and B, each with its own mark stamped into index.html and the
        foot of every script, served one after the other — and checks
        the page never runs one build's HTML with the other's scripts,
        that the waiting version is noticed (the update bar), that a tap
        swaps the whole room over, and that the README or a 404 can't
        write themselves over the offline shell on the way.

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

/* ---------- a release lands while the room is open ----------

   The failure this guards against is quiet and total: a deploy that
   changes both the page and its scripts, served as the new page with
   the old scripts, is a room whose buttons call functions that aren't
   there — for every player, on the first visit after every release.

   So: two builds of the room, A and B. Each has its mark stamped into
   index.html and onto the foot of every script, and its own VERSION in
   sw.js. Serve A until its worker is in charge, swap the server over to
   B, and watch what the browser actually runs. The files are whatever
   the SHELL list in sw.js says they are, so a file added to the room is
   in this test the moment it is in the shell.

   The server behaves the way plenty of real hosts do, which is the
   awkward way: pages must be revalidated but scripts may sit in the
   HTTP cache for an hour (so a page fetched from the network is always
   the newest, while a new worker that fills its cache from the HTTP
   cache gets last release's scripts under this release's name), and
   index.html redirects to its folder, as "pretty URL" hosts do (a
   redirected response can't answer a navigation, so a worker that
   serves one as it is bricks the room). */
const scriptTags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1])
  .filter((u) => !/^(https?:|data:)/.test(u));
const README = fs.readFileSync(path.join(ROOT, "chess/README.md"));
const VERSION_RE = /const VERSION = '([^']*)'/;
function build(tag) {
  const site = new Map();
  for (const f of shellFiles) {
    if (!fs.existsSync(path.join(ROOT, "chess", f))) continue;   /* already reported above */
    let body = fs.readFileSync(path.join(ROOT, "chess", f));
    if (f === "index.html") {
      body = Buffer.from(body.toString("utf8")
        .replace(/<head\b[^>]*>/i, (h) => h + '\n<meta name="room-build" content="' + tag + '">'));
    } else if (f.endsWith(".js")) {
      body = Buffer.concat([body,
        Buffer.from('\n;(self.__builds = self.__builds || {})["' + f + '"] = "' + tag + '";\n')]);
    }
    site.set("/chess/" + f, body);
  }
  site.set("/chess/sw.js", Buffer.from(sw.replace(VERSION_RE, (m, v) => "const VERSION = '" + v + "-" + tag + "'")));
  site.set("/chess/README.md", README);
  return site;
}
let live = null;
const releaseServer = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/api/room") {   /* a mailbox that answers, as the real site's does */
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end('{"ok":true,"rooms":[]}');
    return;
  }
  if (p === "/chess/index.html") { res.writeHead(301, { Location: "/chess/" }); res.end(); return; }
  const key = p.endsWith("/") ? p + "index.html" : p;
  const body = live.get(key);
  if (!body) { res.writeHead(404, { "Content-Type": "text/html" }); res.end("<!doctype html><title>404</title>not here"); return; }
  res.writeHead(200, {
    "Content-Type": key.endsWith(".md") ? "text/plain; charset=utf-8" : TYPES[path.extname(key)] || "application/octet-stream",
    "Cache-Control": /(\/sw\.js|\.html)$/.test(key) ? "no-cache" : "max-age=3600"
  });
  res.end(body);
});

/* which build is this page, and which build is each script it ran? */
function mixOf(b) {
  const off = scriptTags.filter((s) => b.scripts[s] !== b.html);
  return off.length ? "page is " + b.html + " but " +
    off.slice(0, 4).map((s) => s + " is " + (b.scripts[s] || "absent")).join(", ") +
    (off.length > 4 ? " (+" + (off.length - 4) + " more)" : "") : "";
}
async function waitForControl(page) {
  return page.evaluate(async () => {
    if (!navigator.serviceWorker) return false;
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 80 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 250));
    return !!navigator.serviceWorker.controller;
  });
}

async function releaseCheck(browser) {
  if (!VERSION_RE.test(sw)) { ok("release: sw.js declares its VERSION where this can find it", false); return; }
  live = build("A");
  await new Promise((r) => releaseServer.listen(0, r));
  const base = "http://127.0.0.1:" + releaseServer.address().port;
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, serviceWorkers: "allow" });
  const page = await ctx.newPage();
  const crashes = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  /* the flat board throughout: this is a test of releases, not of a
     software-rendered 3D board on a shared machine, and a reload keeps
     the #force2d it was opened with */
  const builds = () => page.evaluate(() => {
    const m = document.querySelector('meta[name="room-build"]');
    return { html: m ? m.content : null, scripts: self.__builds || {} };
  });
  /* what each cache holds for the given paths: a build letter, "missing",
     or "not the room" when something else has been filed under its name */
  const cacheMarks = (paths, only) => page.evaluate(async ([paths, only]) => {
    const out = {};
    for (const k of await caches.keys()) {
      if (only && !k.endsWith(only)) continue;
      const c = await caches.open(k);
      for (const p of paths) {
        const r = await c.match(p);
        const t = r ? await r.text() : "";
        const m = t.match(/name="room-build" content="(\w+)"/) || t.match(/\] = "(\w+)";\s*$/);
        out[k + " " + p] = !r ? "missing" : m ? m[1] : "not the room";
      }
    }
    return out;
  }, [paths, only || null]);
  const notAll = (marks, tag) => Object.keys(marks).filter((k) => marks[k] !== tag).map((k) => k + " → " + marks[k]);

  try {
    /* 1 · a first visit to A: straight from the network, then the worker settles in */
    await page.goto(base + "/chess/#force2d", { waitUntil: "load" });
    ok("release: version A installs and takes control", await waitForControl(page));
    let b = await builds();
    if (VERBOSE) console.log("      watching " + scriptTags.length + " scripts: " + scriptTags.join(" "));
    ok("release: version A runs whole — page and every script", b.html === "A" && !mixOf(b), mixOf(b) || "page is " + b.html);

    /* 2 · other pages in the folder are not the room, and must not become it */
    const readme = await page.goto(base + "/chess/README.md", { waitUntil: "load" });
    const readmeType = await page.evaluate(() => document.contentType);
    ok("release: the README opens as the README, not as the room",
       readme && readme.status() === 200 && readmeType === "text/plain", (readme && readme.status()) + " " + readmeType);
    const lost = await page.goto(base + "/chess/no-such-page.html", { waitUntil: "load" });
    ok("release: a missing page is still a 404", lost && lost.status() === 404, lost && String(lost.status()));
    const shellNow = await cacheMarks(["/chess/", "/chess/index.html"]);
    const spoiled = notAll(shellNow, "A");
    ok("release: neither of them is written over the cached shell",
       Object.keys(shellNow).length > 0 && spoiled.length === 0, spoiled.join("; ") || "no shell cached at all");

    /* 3 · the server moves on to B; the open room must not be half-moved with it */
    live = build("B");
    await page.goto(base + "/chess/#force2d", { waitUntil: "load" });
    await page.waitForTimeout(400);
    b = await builds();
    ok("release: after a deploy the room runs one version, never a mix", !!b.html && !mixOf(b), mixOf(b));
    ok("release: …the one it was installed with, until the player says so", b.html === "A", "page is " + b.html);

    /* 4 · the new version is noticed, and fetched whole and fresh */
    const bar = await page.waitForSelector("#updateBar", { state: "visible", timeout: 30000 }).then(() => true, () => false);
    ok("release: the waiting version is noticed — the update bar appears", bar);
    const shellPaths = ["/chess/"].concat(shellFiles.filter((f) => f === "index.html" || f.endsWith(".js")).map((f) => "/chess/" + f));
    const waiting = await cacheMarks(shellPaths, "-B");
    const stale = notAll(waiting, "B");
    ok("release: the new worker's cache holds B in every file, fresh from the server",
       Object.keys(waiting).length === shellPaths.length && stale.length === 0,
       stale.slice(0, 4).join("; ") || Object.keys(waiting).length + " of " + shellPaths.length + " files found");

    /* 5 · one tap, and the whole room changes over */
    let swapped = bar;
    if (bar) {
      swapped = await Promise.all([
        page.waitForNavigation({ waitUntil: "load", timeout: 45000 }),
        page.click("#updateBar", { timeout: 30000 })
      ]).then(() => true, (e) => { if (VERBOSE) console.log(e.message.split("\n").slice(0, 14).map((l) => "      " + l).join("\n")); return false; });
    }
    ok("release: tapping the bar reloads the room", swapped);
    await page.waitForTimeout(400);
    b = await builds();
    ok("release: …into B, wholesale", b.html === "B" && !mixOf(b), mixOf(b) || "page is " + b.html);
    const after = await page.evaluate(async () => {
      const c = navigator.serviceWorker.controller;
      const version = !c ? null : await new Promise((res) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => res(e.data && e.data.version);
        c.postMessage({ type: "GET_VERSION" }, [ch.port2]);
        setTimeout(() => res(null), 3000);
      });
      return { version: version, caches: await caches.keys() };
    });
    ok("release: B's worker is in charge and A's cache is gone",
       /-B$/.test(after.version || "") && after.caches.length > 0 && after.caches.every((k) => /-B$/.test(k)), JSON.stringify(after));

    /* 6 · the room's mailbox polls go past the cache, not into it */
    await page.evaluate(() => Promise.all([1, 2, 3].map((i) =>
      fetch("/api/room?a=list&g=chess&_=" + i + Math.random(), { cache: "no-store" }).then((r) => r.text()))));
    const outside = await page.evaluate(async () => {
      const out = [];
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
      return out.filter((p) => !p.startsWith("/chess/"));
    });
    ok("release: mailbox polls are never stored in the offline cache", outside.length === 0,
       outside.length + " stored, e.g. " + outside.slice(0, 2).join(", "));

    /* 7 · and B is what survives a tunnel */
    await ctx.setOffline(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(800);
    b = await builds();
    ok("release: offline afterwards, the room is B, whole", b.html === "B" && !mixOf(b), mixOf(b) || "page is " + b.html);
    ok("release: no page errors from start to finish", crashes.length === 0, crashes.slice(0, 3).join(" | "));
  } catch (e) {
    /* a page that won't even load is the loudest failure there is, and
       still deserves a FAIL line rather than a stack trace */
    ok("release: the walk-through reaches the end", false, e.message.split("\n")[0]);
  } finally {
    await ctx.close();
    releaseServer.close();
  }
}

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
    ok("the service worker installs and takes control", await waitForControl(page));

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

    /* one browser context at a time — the machine is shared */
    await ctx.close();
    await releaseCheck(browser);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nthe room survives the train tunnel");
  process.exit(failed ? 1 : 0);
})();
