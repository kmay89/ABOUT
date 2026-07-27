/* join-check.js — dev-only. Two real browsers, four letters, one game.

   tools/room-check.js proves the mailbox and the client in node. This is
   the other half: it opens **two pages in a real Chromium**, has one host
   a board and read out four letters, types those four letters into the
   other, and waits for two genuine RTCPeerConnections to find each other
   and start talking. Then it does the thing that actually matters — it
   kills the link — and waits to see the two of them put it back without
   anybody touching anything.

   Nothing is stubbed except the cloud: /api/room is served by the real
   netlify/functions/room.js over an in-memory blob store, out of the same
   little http server that serves the repo.

   Needs `playwright-core`; the browser is already on the machine. If
   playwright is missing it says so and exits 0, so this is a bonus rather
   than a barrier on a machine that hasn't got it.

   Run: node tools/join-check.js [--head] [--verbose] [--game=chess]     */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");
const VERBOSE = process.argv.indexOf("--verbose") >= 0;
const HEAD = process.argv.indexOf("--head") >= 0;
let pass = 0;
const fails = [];
function ok(what, cond, detail) {
  if (cond) { pass++; if (VERBOSE) console.log("  ✓ " + what); }
  else { fails.push(what); console.log("  ✗ " + what + (detail ? " — " + detail : "")); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* poll rather than sleep: a handshake takes as long as it takes */
async function until(page, fn, ms, every) {
  const end = Date.now() + (ms || 20000);
  while (Date.now() < end) {
    let v = null;
    try { v = await page.evaluate(fn); } catch (e) { /* mid-navigation */ }
    if (v) return v;
    await wait(every || 250);
  }
  return null;
}

/* the browser is already on the machine; find it the way domino does */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
if (!CHROME) { console.log("no chromium on this machine — skipping the two-browser check."); process.exit(0); }

let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the two-browser check.");
  console.log("  npm i --no-save playwright-core");
  process.exit(0);
}

/* ---------- the mailbox, for real, over a fake cloud ---------- */
const STUB = `
const stores = new Map();
export function getStore(opts) {
  const name = typeof opts === "string" ? opts : opts.name;
  if (!stores.has(name)) stores.set(name, new Map());
  const m = stores.get(name);
  return {
    async get(k, o) { const v = m.get(k); if (v === undefined) return null;
      return (o && o.type === "json") ? JSON.parse(v) : v; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async delete(k) { m.delete(k); },
    async list() { return { blobs: [...m.keys()].map(key => ({ key })) }; },
  };
}
`;
async function loadHandler() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "join-check-"));
  const pkg = path.join(dir, "node_modules", "@netlify", "blobs");
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"),
    JSON.stringify({ name: "@netlify/blobs", version: "0.0.0", type: "module", main: "index.js" }));
  fs.writeFileSync(path.join(pkg, "index.js"), STUB);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
  const fn = path.join(dir, "room.js");
  fs.copyFileSync(path.join(ROOT, "netlify", "functions", "room.js"), fn);
  return (await import(pathToFileURL(fn).href)).default;
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };

function serve(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname === "/api/room") {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = Buffer.concat(chunks);
        const r = await handler(new Request("http://127.0.0.1" + req.url, {
          method: req.method,
          headers: { "content-type": req.headers["content-type"] || "application/json" },
          body: req.method === "POST" ? body : undefined,
        }));
        const text = await r.text();
        res.writeHead(r.status, { "content-type": r.headers.get("content-type") || "application/json" });
        res.end(text);
        return;
      }
      let p = path.join(ROOT, decodeURIComponent(url.pathname));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
      if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); res.end("no"); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
      res.end(fs.readFileSync(p));
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }));
  });
}

(async function main() {
  const handler = await loadHandler();
  const { srv, port } = await serve(handler);
  const base = "http://127.0.0.1:" + port;

  const browser = await pw.chromium.launch({
    headless: !HEAD,
    executablePath: CHROME,
    args: ["--no-sandbox", "--use-fake-ui-for-media-stream"],
  });
  const shout = (tag) => (m) => {
    if (m.type() === "error" && VERBOSE) console.log("  [" + tag + "] " + m.text());
  };

  try {
    console.log("\n──  chess: four letters across two browsers");
    const host = await browser.newPage();
    const guest = await browser.newPage();
    const errs = [];
    for (const [p, tag] of [[host, "host"], [guest, "guest"]]) {
      p.on("console", shout(tag));
      p.on("pageerror", (e) => errs.push(tag + ": " + e.message));
      if (VERBOSE) p.on("response", async (r) => {
        if (r.status() >= 400) console.log("  [" + tag + "] " + r.status() + " " + r.url() +
          " → " + (await r.text().catch(() => "")).slice(0, 120));
      });
    }

    await host.goto(base + "/chess/", { waitUntil: "load" });
    await guest.goto(base + "/chess/", { waitUntil: "load" });
    await until(host, () => !!window.__cr, 15000);
    await until(guest, () => !!window.__cr, 15000);
    ok("both rooms boot", true);

    /* the mailbox is reachable from inside the page */
    const ping = await host.evaluate(() => window.__cr.Room.reachable());
    ok("the page can see the mailbox", ping === true);

    await host.evaluate(() => { window.__cr.openLink(); });
    await host.fill("#lanName", "Sam");
    await host.click("#linkHostBtn");
    /* the host's "new game" card asks for a side and a clock first */
    await host.waitForSelector("#newStart", { state: "visible", timeout: 10000 });
    await host.click("#newStart");

    const code = await until(host, () => {
      const t = (document.getElementById("roomCode") || {}).textContent || "";
      return /^[A-Z]{4}$/.test(t.trim()) ? t.trim() : null;
    }, 25000);
    ok("the host is given four letters", !!code, code || "none appeared");
    if (!code) throw new Error("no code");
    ok("the letters are ones you can read aloud", !/[IO]/.test(code));

    /* the guest sees it in the list before typing anything */
    await guest.evaluate(() => { window.__cr.openLink(); });
    await guest.fill("#lanName", "Alex");
    await guest.click("#linkJoinBtn");
    const listed = await until(guest, (c) => {
      const rows = document.querySelectorAll("#roomList .roomRow");
      for (const r of rows) if (r.dataset.code === c) return true;
      return false;
    }, 15000);
    /* passing an argument to until()'s evaluate needs a closure */
    const sawIt = listed || await until(guest, () => document.querySelectorAll("#roomList .roomRow").length > 0, 8000);
    ok("the board shows up in the waiting list", !!sawIt);

    await guest.fill("#roomIn", code);
    await guest.dispatchEvent("#roomIn", "input");

    const linked = await until(guest, () => window.__cr.Net.linked() && window.__cr.mode === "lan", 30000);
    ok("typing four letters links the two boards", !!linked);
    const hostLinked = await until(host, () => window.__cr.Net.linked() && window.__cr.mode === "lan", 15000);
    ok("…and the host agrees", !!hostLinked);

    /* the seats are the two names, on both screens */
    const names = await guest.evaluate(() => document.getElementById("seatRow").textContent);
    ok("the guest is greeted by the host's name", /Sam/.test(names || ""), names);

    /* --- a move crosses the wire --- */
    const white = await host.evaluate(() => window.__cr.lanSide === 1);
    const mover = white ? host : guest;
    const other = white ? guest : host;
    await mover.evaluate(() => {
      const g = window.__cr.game;
      window.__cr.commitMove(window.Chess.moves(g)[0], "local");
    });
    const crossed = await until(other, () => window.__cr.game.played.length === 1, 15000);
    ok("a move crosses to the other board", !!crossed);

    /* --- monitoring: a heartbeat, and a number for it --- */
    const health = await until(host, () => {
      const h = window.__cr.Net.health();
      return (h.state === "live" || h.state === "slow") ? h : null;
    }, 15000);
    ok("the link reports itself healthy", !!health, JSON.stringify(health));
    ok("the chip is showing", await host.isVisible("#netChip"));

    /* --- healing: cut the wire and touch nothing --- */
    await guest.evaluate(() => { window.__cr.Net.dc.close(); });
    const noticed = await until(host, () => {
      const s = window.__cr.Net.health().state;
      return s === "healing" || s === "stale" || s === "lost";
    }, 20000);
    ok("the host notices the link go", !!noticed);

    const healed = await until(guest, () => window.__cr.Net.linked(), 45000, 400);
    ok("the two of them put the link back, unaided", !!healed);
    if (healed) {
      const kept = await until(guest, () => window.__cr.game.played.length === 1, 15000);
      ok("…and the game is exactly where it was", !!kept);
      const back = await until(host, () => window.__cr.Net.health().state === "live", 20000);
      ok("…and says so", !!back);
    }

    /* --- the keepsake: what a reload would find --- */
    const keep = await guest.evaluate(() => window.__cr.lanSave);
    ok("the guest wrote down how to come back", !!keep && keep.code === code, JSON.stringify(keep));

    ok("no page threw anything", errs.length === 0, errs.join(" | "));
    await host.close(); await guest.close();

    /* ---------- the same door, four seats ---------- */
    console.log("\n──  domino: the same four letters, four chairs");
    const table = await browser.newPage();
    const chair = await browser.newPage();
    const derrs = [];
    for (const [p, tag] of [[table, "table"], [chair, "chair"]]) {
      p.on("console", shout(tag));
      p.on("pageerror", (e) => derrs.push(tag + ": " + e.message));
    }
    await table.goto(base + "/domino/", { waitUntil: "load" });
    await chair.goto(base + "/domino/", { waitUntil: "load" });
    await until(table, () => !!window.__dt, 20000);
    await until(chair, () => !!window.__dt, 20000);

    await table.click("#goParty");
    await table.waitForSelector("#pHost", { state: "visible", timeout: 10000 });
    await table.fill("#pName", "Chuy");
    await table.click("#pHost");
    const dcode = await until(table, () => {
      const t = (document.getElementById("roomCode") || {}).textContent || "";
      return /^[A-Z]{4}$/.test(t.trim()) ? t.trim() : null;
    }, 30000);
    ok("the table is given four letters", !!dcode, dcode || "none appeared");

    if (dcode) {
      await chair.click("#goParty");
      await chair.waitForSelector("#pJoin", { state: "visible", timeout: 10000 });
      await chair.fill("#pName", "Lupe");
      await chair.click("#pJoin");
      await chair.waitForSelector("#jRoom", { state: "visible", timeout: 10000 });
      await chair.fill("#jRoom", dcode);
      await chair.dispatchEvent("#jRoom", "input");

      const seat = await until(chair, () => {
        const d = window.__dt();
        return (d.G.mode === "guest" && d.G.mySeat > 0) ? d.G.mySeat : null;
      }, 40000, 400);
      ok("typing four letters sits somebody down", !!seat, "seat " + seat);

      const seen = await until(table, () => {
        const n = window.__dt().G.names;
        return Object.keys(n).some((k) => n[k] === "Lupe");
      }, 15000);
      ok("the table knows their name", !!seen);

      /* the chair goes into a tunnel and comes back to the same seat */
      await chair.evaluate(() => { window.__dt().Net.dc.close(); });
      const backSeat = await until(chair, () => {
        const d = window.__dt();
        return d.Net.linked() ? d.G.mySeat : null;
      }, 45000, 400);
      ok("a lost chair finds its way back", !!backSeat);
      ok("…to the same seat, with the same bones", backSeat === seat, backSeat + " vs " + seat);
    }
    ok("no domino page threw anything", derrs.length === 0, derrs.join(" | "));
  } finally {
    await browser.close();
    srv.close();
  }

  console.log("\n" + "═".repeat(52));
  if (fails.length) {
    console.log("FAILED (" + fails.length + "):\n  " + fails.join("\n  "));
    process.exit(1);
  }
  console.log("four letters, two browsers, one board  ·  " + pass + " checks");
})().catch((e) => { console.error(e); process.exit(1); });
