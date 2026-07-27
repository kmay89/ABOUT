/* room-check.js — dev-only. Proves the shared front door.

   Two devices and a real network cannot be summoned from a terminal, but
   almost everything that has ever gone wrong with a join flow can be:

     · a code that can't be reclaimed after a drop (healing's whole trick)
     · a key check that isn't there, so anyone can hijack a room
     · a started room vanishing from the world instead of just from the list
     · a client that mistakes a static host's 404 page for a live mailbox
       and strands the joiner at an empty lobby
     · a heartbeat that never notices silence, or never stops healing

   So this runs the **real** netlify/functions/room.js against an in-memory
   blob store, and the **real** chess/room.js client against that, with fetch
   pointed at the handler. Nothing is re-implemented for the test except the
   storage, which is the one part that genuinely needs a cloud.

   Run: node tools/room-check.js [--verbose]                                 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");
const VERBOSE = process.argv.indexOf("--verbose") >= 0;
let pass = 0;
const fails = [];
function ok(what, cond) {
  if (cond) { pass++; if (VERBOSE) console.log("  ✓ " + what); }
  else { fails.push(what); console.log("  ✗ " + what); }
}

/* ---------- an in-memory stand-in for @netlify/blobs ---------- */
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
export const __stores = stores;
`;

async function loadHandler() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "room-check-"));
  const pkg = path.join(dir, "node_modules", "@netlify", "blobs");
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"),
    JSON.stringify({ name: "@netlify/blobs", version: "0.0.0", type: "module", main: "index.js" }));
  fs.writeFileSync(path.join(pkg, "index.js"), STUB);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
  const fn = path.join(dir, "room.js");
  fs.copyFileSync(path.join(ROOT, "netlify", "functions", "room.js"), fn);
  const mod = await import(pathToFileURL(fn).href);
  return { handler: mod.default, dir };
}

/* a plausible SDP: the function only checks shape, but so does a browser */
const sdp = (tag) => "v=0\r\no=- " + tag + " 2 IN IP4 127.0.0.1\r\ns=-\r\n" +
  "a=fingerprint:sha-256 AA:BB\r\na=ice-ufrag:" + tag + "\r\n" + "a=x".repeat(20) + "\r\n";

function req(url, body) {
  return new Request("https://example.com" + url, body
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    : {});
}

(async function main() {
  const { handler } = await loadHandler();
  const call = async (qs, body) => {
    const r = await handler(req("/api/room?" + qs, body));
    return { status: r.status, ct: r.headers.get("content-type"), json: await r.json() };
  };

  console.log("\n──  the mailbox");

  let r = await call("a=ping");
  ok("ping answers without naming a game", r.json.ok === true);

  r = await call("a=list&g=nonsense");
  ok("an unknown game is refused", r.status === 400);

  r = await call("a=host&g=chess", { offer: sdp("h1"), host: "Sam", name: "Sam's board", seats: 2 });
  const code = r.json.code, key = r.json.key;
  ok("hosting mints four letters", /^[A-Z]{4}$/.test(code || ""));
  ok("the alphabet skips I and O", !/[IO]/.test(code || ""));
  ok("hosting hands back a key", typeof key === "string" && key.length >= 8);
  ok("hosting names the pigeonhole it just filled", r.json.slot > 0);

  r = await call("a=list&g=chess");
  ok("the board is listed while it waits", r.json.rooms.length === 1 && r.json.rooms[0].code === code);
  ok("the listing never leaks the key", JSON.stringify(r.json).indexOf(key) < 0);

  r = await call("a=list&g=domino");
  ok("games are namespaced — domino can't see it", r.json.rooms.length === 0);

  /* a bad offer is refused, so junk can't fill the pigeonholes */
  r = await call("a=host&g=chess", { offer: "nope" });
  ok("a malformed offer is refused", r.status === 400);

  /* a joiner takes the offer and leaves an answer */
  r = await call("a=join&g=chess", { code: code.toLowerCase(), name: "Alex" });
  ok("a code is case-insensitive", r.json.slot > 0 && r.json.offer.indexOf("v=0") === 0);
  const slot = r.json.slot;
  ok("the joiner is told whose board it is", r.json.host === "Sam");

  r = await call("a=join&g=chess", { code, name: "Nobody" });
  ok("a second knock finds no free pigeonhole", r.status === 409);

  r = await call("a=answer&g=chess", { code, slot, answer: sdp("a1") });
  ok("the answer is accepted", r.json.ok === true);

  r = await call("a=poll&g=chess&code=" + code + "&key=" + key);
  ok("the host collects the answer", r.json.answers.length === 1 && r.json.answers[0].slot === slot);
  ok("the answer carries who left it", r.json.answers[0].who === "Alex");

  r = await call("a=poll&g=chess&code=" + code + "&key=" + key);
  ok("an answer is only handed over once", r.json.answers.length === 0);

  r = await call("a=poll&g=chess&code=" + code + "&key=wrongkey0000");
  ok("polling somebody else's room is refused", r.status === 403);

  /* --- the spare pigeonhole: what makes healing invisible --- */
  r = await call("a=offer&g=chess", { code, key, offer: sdp("h2") });
  ok("the host can leave a spare offer", r.json.slot > slot);
  r = await call("a=offer&g=chess", { code, key: "notthekey00", offer: sdp("h3") });
  ok("a spare offer needs the key", r.status === 403);

  /* --- starting the game: hidden, but still addressable --- */
  r = await call("a=close&g=chess", { code, key, started: 1, open: 0 });
  ok("closing a started room is accepted", r.json.ok === true);
  r = await call("a=list&g=chess");
  ok("a started board stops advertising itself", r.json.rooms.length === 0);
  r = await call("a=join&g=chess", { code, name: "Alex again" });
  ok("…but is still joinable by code (this is the healing path)",
    r.json.slot > 0 && r.json.started === true);

  /* --- reclaiming the code: the heart of it --- */
  r = await call("a=host&g=chess", { offer: sdp("h9"), host: "Sam", name: "Sam's board", code, key });
  ok("a host with the key gets the same four letters back", r.json.code === code && r.json.reclaimed === true);
  ok("…under a fresh pigeonhole, not a stale one", r.json.slot > slot);
  r = await call("a=host&g=chess", { offer: sdp("h9"), host: "Thief", code, key: "abcdefgh1234" });
  ok("a host without the key gets a different code", r.json.code !== code && r.json.reclaimed === false);

  r = await call("a=peek&g=chess&code=" + code);
  ok("peek finds a live room", r.json.live === true);
  r = await call("a=peek&g=chess&code=ZZZZ");
  ok("peek is honest about a dead one", r.json.live === false);

  r = await call("a=close&g=chess", { code, key, started: 0 });
  ok("the host can take the room down", r.json.ok === true);
  r = await call("a=join&g=chess", { code });
  ok("a taken-down room is gone", r.status === 404);

  /* ---------- the client, over the real handler ---------- */
  console.log("\n──  the client");

  /* fetch, pointed at the function; everything else the client touches is
     guarded inside it, but give it a document and a localStorage anyway so
     the keepsake and the wake-up listener are exercised rather than skipped */
  const mem = new Map();
  /* the client's IIFE takes `self` as its root; in node that is not a thing,
     so give it one — otherwise the keepsake quietly writes nowhere */
  global.self = global;
  global.localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k),
  };
  global.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  let served = 0, dead = false;
  global.fetch = async (u) => {
    served++;
    if (dead) return new Response("<!doctype html><h1>404</h1>", { status: 404, headers: { "content-type": "text/html" } });
    const arg = typeof u === "string" ? u : u.url;
    const url = new URL(arg, "https://example.com");
    return handler(new Request(url.href, arguments[1]));
  };
  /* the client posts via fetch(url, opts); keep both arguments */
  global.fetch = async (u, opts) => {
    served++;
    if (dead) return new Response("<!doctype html><h1>404</h1>", { status: 404, headers: { "content-type": "text/html" } });
    const url = new URL(typeof u === "string" ? u : u.url, "https://example.com");
    return handler(new Request(url.href, opts));
  };

  const Room = require(path.join(ROOT, "chess", "room.js"));
  Room.configure({ game: "chess", seats: 2, label: "board", publicApi: null });

  ok("codes are tidied to four letters", Room.tidy(" bu zz! ") === "BUZZ");
  ok("a spoken 0 becomes an O", Room.tidy("b0ss") === "BOSS");
  ok("an impossible code is spotted", Room.impossible("BOSS") === true && Room.impossible("BUZZ") === false);
  ok("a whole handshake is not mistaken for a code",
    Room.isCode("BUZZ") === true && Room.isCode("CHESS2.eJxLzs8rSc0rAQAJhwLd") === false);

  const opened = await Room.open(sdp("c1"), { host: "Sam", name: "Sam's board" });
  ok("the client opens a room", !!opened && /^[A-Z]{4}$/.test(opened.code));
  ok("the client keeps the key to itself", Room.key === opened.key);
  ok("the keepsake was written", (Room.recall() || {}).code === opened.code);

  const rooms = await Room.list();
  ok("the client lists it", rooms.some(x => x.code === opened.code));

  const knocked = await Room.knock(opened.code.toLowerCase(), "Alex");
  ok("the client knocks and is let in", knocked && knocked.slot > 0);
  ok("…and is told the board's name", /Sam/.test(knocked.name || ""));

  /* the host reclaims the code exactly as heal() does */
  const again = await Room.open(sdp("c2"), { host: "Sam", name: "Sam's board" });
  ok("the client reclaims its own four letters", again.code === opened.code);

  /* a static host: the client must latch off rather than believe a 404 page */
  dead = true;
  Room.live = null;
  const gone = await Room.list();
  ok("a 404 HTML page is not mistaken for a mailbox", gone === null);
  ok("…and the client latches off", Room.live === false);
  const before = served;
  await Room.list();
  ok("…and stops asking", served === before);

  /* The GitHub Pages mirror: same-origin has no mailbox, but the one on the
     main site answers (CORS is open on purpose). The mirror must fall through
     to it rather than lose the four-letter door — and must then remember. */
  const PUB = "https://kmay89.com/api/room";
  let hits = [];
  global.fetch = async (u, opts) => {
    const href = typeof u === "string" ? u : u.url;
    hits.push(href);
    if (href.indexOf(PUB) !== 0) {
      return new Response("<!doctype html><h1>404</h1>", { status: 404, headers: { "content-type": "text/html" } });
    }
    return handler(new Request(new URL(href).href, opts));
  };
  Room.live = null; Room.base = "/api/room";
  Room.configure({ publicApi: PUB });
  const mirrored = await Room.list();
  ok("a static mirror falls through to the main site's mailbox", mirrored !== null);
  ok("…having tried its own origin first", hits[0].indexOf(PUB) !== 0);
  hits = [];
  await Room.list();
  ok("…and then remembers where the mailbox is", hits.length === 1 && hits[0].indexOf(PUB) === 0);
  Room.configure({ publicApi: null });

  /* ---------- vitals ---------- */
  console.log("\n──  the pulse");
  dead = false; Room.live = true;

  let sent = [], healed = 0, states = [];
  let channelUp = true;
  const v = Room.vitals({
    every: 30, slowMs: 5, staleMs: 60, lostMs: 120, tries: 3, backoffMs: 40, maxBackoffMs: 80,
    /* a far side that is there answers pings; one that is in a tunnel doesn't */
    send: m => { sent.push(m); if (channelUp && m._ === "p") setTimeout(() => v.frame({ _: "q", t: m.t }), 1); },
    down: () => !channelUp,
    heal: () => { healed++; return false; },
    change: (s) => states.push(s),
  });
  v.start();
  ok("a fresh link reads as live", v.state === "live");

  /* a ping from the far side is answered, and counts as life */
  ok("a ping is swallowed and answered", v.frame({ _: "p", t: 111 }) === true &&
    sent.some(m => m._ === "q" && m.t === 111));
  ok("a pong is swallowed", v.frame({ _: "q", t: Date.now() }) === true);
  ok("a game message is passed through", v.frame({ t: "mv", from: 12, to: 28 }) === false);
  ok("a resync frame is left for the game", v.frame({ _: "sync", sans: [] }) === false);

  await new Promise(r2 => setTimeout(r2, 90));
  ok("a live link is pinged", sent.filter(m => m._ === "p").length >= 1);

  channelUp = false;                      /* the tunnel */
  await new Promise(r2 => setTimeout(r2, 400));
  ok("a dead channel starts healing", healed >= 1);
  ok("…and says so", states.indexOf("healing") >= 0);

  channelUp = true;                       /* the far side came back */
  v.well();
  const healedAt = healed;
  await new Promise(r2 => setTimeout(r2, 200));
  ok("a healed link stops trying", healed === healedAt || healed === healedAt + 1);
  ok("…and reads as live again", v.state === "live");

  /* a message arriving mid-heal is proof enough that we needn't be */
  channelUp = false;
  await new Promise(r2 => setTimeout(r2, 120));
  channelUp = true;
  v.heard();
  ok("a message during a heal stands the heal down", v.state === "live");

  v.stop();
  ok("stopping is quiet", v.state === "off");

  console.log("\n" + "═".repeat(52));
  if (fails.length) {
    console.log("FAILED (" + fails.length + "):\n  " + fails.join("\n  "));
    process.exit(1);
  }
  console.log("the front door holds  ·  " + pass + " checks");
})().catch((e) => { console.error(e); process.exit(1); });
