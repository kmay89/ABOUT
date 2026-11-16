/* friends-check.js — dev-only. Does the room remember who you play?

   In node it walks friends.js through everything a hand-edited or
   half-written store could throw at it, and everything two friends could
   do: the first game, the tenth, a rename, a game taken back after it
   ended and finished differently, a board too old to say who it is, two
   people with the same name, the decider at one game each, and a friend
   with a board open on the public list.

   Then the real thing, in two separate browsers (two phones: two
   storages, two ids), over the real mailbox function on an in-memory
   cloud — the same harness as tools/join-check.js:

     • Ana opens a board, goes back to the room with it still open, and
       starts a game against the computer while she waits;
     • Sam taps her invite link, which tells him who is asking and which
       colour is his before he is even in;
     • the boards link, Ana's computer game is shelved (not lost), and the
       board stops advertising itself on the public list;
     • Sam resigns: both phones now know the other by id, the score is
       mirrored, the rematch line carries it — and Ana's shelved computer
       game survived the end of the friend game;
     • the rematch goes the other way: "the decider?";
     • Ana challenges Sam from her people; Sam's room notices the board
       opened for him and joins it in one tap; his linked card says
       "again!".

   Needs `playwright-core` for the browser half; without it (or chromium)
   the node half still runs.

   Run: node chess/tools/friends-check.js [--node] [--verbose]          */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..", "..");
const Friends = require("../friends.js");
const VERBOSE = process.argv.includes("--verbose");
let failed = 0, passed = 0;
const ok = (what, cond, detail) => {
  if (cond) { passed++; console.log("ok    " + what); }
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

function nodeHalf() {
  const A = "fabcdefghij", B = "fbbbbbbbbbb", C = "fccccccccc0";
  /* clean: nothing strange survives */
  ok("junk is a fresh store", JSON.stringify(Friends.clean("x")) === JSON.stringify(Friends.fresh()) &&
     Friends.clean({ list: "x" }).list.length === 0 && Friends.clean([1]).list.length === 0);
  const dirty = Friends.clean({ me: "<script>", list: [
    { id: "<script>", name: "Mallory<img>", w: -3, d: "2", l: 1e12, last: 5 },
    { id: A, name: "Sam", w: 2, d: 0, l: 1, last: 10, games: [{ r: "w", s: [1, 2] }, { r: "x" }, "y", { r: "l", s: ["e4"], side: 7 }] },
    { id: A, name: "Sam again", w: 9, last: 3 },
    { name: "" }, null, 7
  ] });
  ok("a bad own-id is dropped", dirty.me === "");
  ok("a bad friend-id leaves a name-only row, markup gone", dirty.list.some((f) => f.id === "" && f.name === "Malloryimg"));
  ok("counts are clamped: negative to 0, absurd to a million, strings dropped",
     dirty.list.find((f) => f.id === "").w === 0 && dirty.list.find((f) => f.id === "").l === 1e6 && dirty.list.find((f) => f.id === "").d === 0);
  ok("one row per id", dirty.list.filter((f) => f.id === A).length === 1);
  const sam = dirty.list.find((f) => f.id === A);
  ok("bad games are dropped, bad moves emptied, sides made ±1",
     sam.games.length === 2 && sam.games[0].s.length === 0 && sam.games[1].side === 1, JSON.stringify(sam.games));
  ok("rows with nobody in them are dropped", dirty.list.length === 2);
  ok("most recently played first", dirty.list[0].id === A);
  const many = Friends.clean({ list: Array.from({ length: 60 }, (_, i) => ({ name: "P" + i, last: i + 1, w: 1 })) });
  ok("forty people kept, the most recent", many.list.length === 40 && many.list[0].name === "P59" && many.list[39].name === "P20");
  ok("a store too large to be honest is a fresh one", Friends.load(() => "x".repeat(2100000)).list.length === 0 &&
     Friends.load(() => { throw new Error("no"); }).list.length === 0 && Friends.load(() => "{bad json").list.length === 0);

  /* identity */
  let s = Friends.me(Friends.fresh());
  ok("this room mints its own id once", Friends.isId(s.me) && Friends.me(s).me === s.me, s.me);
  let r = 0.11;
  ok("ids are f + ten base-36 characters", /^f[0-9a-z]{10}$/.test(Friends.mintId(() => (r = (r * 7.31) % 1))));

  /* record */
  let out = Friends.record(s, { id: B, name: "Sam", result: "w", at: 1000, side: 1, sans: ["e4", "e5"], reason: "Sam resigned", gid: "game0001" });
  ok("the first game makes a friend", out.first && out.f.w === 1 && out.state.list.length === 1);
  ok("…and keeps the game itself", out.f.games.length === 1 && out.f.games[0].s.join(" ") === "e4 e5" && out.f.games[0].y === "Sam resigned");
  s = out.state;
  out = Friends.record(s, { id: B, name: "Sammy", result: "l", at: 2000, side: -1, gid: "game0002" });
  ok("the same id is the same person under a new name", !out.first && out.f.name === "Sammy" && out.f.w === 1 && out.f.l === 1 && out.state.list.length === 1);
  ok("one game each is the decider", out.decider === true);
  s = out.state;
  out = Friends.record(s, { id: B, name: "Sammy", result: "d", at: 3000, side: 1, gid: "game0002" });
  ok("a game recorded twice replaces itself instead of counting twice", out.f.w === 1 && out.f.l === 0 && out.f.d === 1 && out.f.games.length === 2);
  ok("…and that is not a decider", out.decider === false);
  s = out.state;
  /* an old board, no id */
  out = Friends.record(s, { id: "", name: "Sammy", result: "w", at: 4000, side: 1 });
  ok("a board with no id is never folded into the person who has one", out.first && out.state.list.length === 2 && out.f.id === "");
  s = out.state;
  out = Friends.record(s, { id: "", name: "sammy", result: "w", at: 5000, side: 1 });
  ok("…but finds its own name-only row again, whatever the case", !out.first && out.f.w === 2 && out.state.list.length === 2);
  s = out.state;
  out = Friends.record(s, { id: C, name: "Sammy", result: "l", at: 6000, side: 1 });
  ok("two people with the same name stay two people", out.first && out.state.list.length === 3);
  s = out.state;
  ok("find goes by id first", Friends.find(s, B).name === "Sammy" && Friends.find(s, C).l === 1 && Friends.find(s, "", "SAMMY").id === "");
  for (let i = 0; i < 20; i++) s = Friends.record(s, { id: B, name: "Sammy", result: i % 2 ? "w" : "l", at: 7000 + i, gid: "xgame" + i }).state;
  const sb = Friends.find(s, B);
  ok("twelve games kept per person, newest first, counts kept in full",
     sb.games.length === 12 && sb.games[0].g === "xgame19" && sb.w + sb.d + sb.l === 22, sb.games.length + " / " + (sb.w + sb.d + sb.l));
  ok("the recent run reads oldest to newest", Friends.recent(sb, 3) === "W L W", Friends.recent(sb, 3));
  s = Friends.rename(s, B, "Samuel<b>");
  ok("a rename before any game is kept, without markup", Friends.find(s, B).name === "Samuelb");

  /* the words */
  const t = (w, d, l) => Friends.tally({ name: "Sam", w, d, l }).text;
  ok("you lead", t(3, 0, 2) === "You lead 3–2");
  ok("they lead", t(1, 0, 2) === "Sam leads 2–1");
  ok("level", t(2, 0, 2) === "Level, 2–2" && t(0, 1, 0) === "All square (1 drawn)");
  ok("draws said when there are some", t(3, 2, 1) === "You lead 3–1 (2 drawn)");
  ok("no games, no words", Friends.tally(null).text === "" && Friends.tally({ name: "x", w: 0, d: 0, l: 0 }).games === 0);
  const tb = Friends.table(s);
  ok("the table is newest first, and only games that happened", tb.length === 3 && tb[0].id === B && tb.every((x) => x.games === x.w + x.d + x.l));

  /* a friend with a board open */
  const rooms = [{ code: "BUZZ", host: "Samuel", name: "Samuel's board", started: true },
                 { code: "QUAY", host: "Stranger", name: "A board", started: false },
                 { code: "HELP", host: "Samuelb", name: "Samuel's board", started: false }];
  const h = Friends.hosting(s, rooms, "Ana");
  ok("a friend's waiting board is noticed, a started one never", h && h.code === "HELP" && h.name === "Samuelb", JSON.stringify(h));
  const forMe = Friends.hosting(Friends.fresh(), [{ code: "ABCD", host: "Zed", name: "For Ana", started: false }], "Ana");
  ok("a board opened For you is noticed even from a stranger's name", forMe && forMe.forYou && forMe.code === "ABCD");
  ok("nobody you know, nothing noticed", Friends.hosting(s, [rooms[1]], "Ana") === null && Friends.hosting(s, null, "Ana") === null);
  s = Friends.forget(s, B);
  ok("Forget forgets", !Friends.find(s, B) && Friends.table(s).length === 2);

  /* storage round trip */
  const store = {};
  ok("save says when it took", Friends.save(s, (k, v) => { store[k] = v; }) === true &&
     Friends.save(s, () => { throw new Error("quota"); }) === false && Friends.save(s, () => false) === false);
  ok("…and loads back the same", JSON.stringify(Friends.load((k) => store[k])) === JSON.stringify(Friends.clean(s)));
}

/* ---------- two phones ---------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "friends-check-"));
  const pkg = path.join(dir, "node_modules", "@netlify", "blobs");
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "@netlify/blobs", version: "0.0.0", type: "module", main: "index.js" }));
  fs.writeFileSync(path.join(pkg, "index.js"), STUB);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
  const fn = path.join(dir, "room.js");
  fs.copyFileSync(path.join(ROOT, "netlify", "functions", "room.js"), fn);
  return (await import(pathToFileURL(fn).href)).default;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png",
  ".webmanifest": "application/manifest+json", ".json": "application/json", ".svg": "image/svg+xml" };
function serve(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname === "/api/room") {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const r = await handler(new Request("http://127.0.0.1" + req.url, { method: req.method,
          headers: { "content-type": req.headers["content-type"] || "application/json" },
          body: req.method === "POST" ? Buffer.concat(chunks) : undefined }));
        res.writeHead(r.status, { "content-type": r.headers.get("content-type") || "application/json" });
        res.end(await r.text());
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(page, fn, ms, arg) {
  const end = Date.now() + (ms || 20000);
  while (Date.now() < end) {
    let v = null;
    try { v = await page.evaluate(fn, arg); } catch (e) { /* mid-navigation */ }
    if (v) return v;
    await wait(250);
  }
  return null;
}
const PLAY = `([san]) => {
  const g = __cr.game;
  const mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, '') === san);
  if (!mv) return false;
  __cr.commitMove(mv, 'local');
  return true;
}`;

async function browserHalf() {
  if (process.argv.includes("--node")) return;
  if (!CHROME) { console.log("--    no chromium on this machine — the two-phone half is skipped"); return; }
  let pw;
  try { pw = require("playwright-core"); }
  catch (e) { console.log("--    playwright-core is not installed — the two-phone half is skipped"); return; }
  const handler = await loadHandler();
  const { srv, port } = await serve(handler);
  const base = "http://127.0.0.1:" + port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  /* two phones: two storages, so two ids */
  async function phone(name, tag) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript((n) => {
      try { if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify({ use3d: false, name: n })); } catch (e) {}
    }, name);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(tag + ": " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(tag + ": " + m.text()); if (VERBOSE && m.type() === "error") console.log("  [" + tag + "] " + m.text()); });
    return { ctx, page };
  }
  const play = (page, san) => page.evaluate(([f, a]) => eval(f)(a), [PLAY, [san]]);
  const boot = async (page, hash) => {
    await page.goto(base + "/chess/" + (hash || ""), { waitUntil: "load" });
    await until(page, () => !!window.__cr && document.getElementById("splash").classList.contains("gone"), 30000);
    await wait(300);
  };
  const clickText = (page, sel, re) => page.evaluate(([s, src]) => {
    const b = [...document.querySelectorAll(s)].find((x) => new RegExp(src).test(x.textContent));
    if (b) b.click(); return !!b;
  }, [sel, re.source]);

  const ana = await phone("Ana", "ana"), sam = await phone("Sam", "sam");
  const A = ana.page, S = sam.page;
  try {
    await boot(A); await boot(S);

    /* ---- Ana opens a board, and goes back to the room with it open ---- */
    await A.click("#mLan");
    await A.waitForSelector("#linkHostBtn", { state: "visible" });
    await A.click("#linkHostBtn");
    await A.waitForSelector("#newStart", { state: "visible", timeout: 10000 });
    await A.click("#sideChips [data-side='w']").catch(() => {});
    await A.click("#newStart");
    const code = await until(A, () => { const t = document.getElementById("roomCode").textContent.trim(); return /^[A-Z]{4}$/.test(t) ? t : null; }, 25000);
    ok("Ana is given four letters", !!code, code || "none");
    if (!code) throw new Error("no code");
    ok("…and a QR of the invite under them", await A.isVisible("#roomQR") && (await A.evaluate(() => document.getElementById("roomQR").width)) > 50);
    ok("…and a way back to the room with the board kept open", await A.isVisible("#roomKeep"));
    await A.click("#roomKeep");
    ok("the room comes back", await A.isVisible("#ovMenu"));
    const row = await A.evaluate(() => !document.getElementById("mOpenBoard").classList.contains("hide") && document.getElementById("mOpenBoard").innerText);
    ok("…and says the board is still open", !!row && row.indexOf(code) >= 0, row);
    /* she plays the computer while she waits */
    await A.click("#mPlay");
    await until(A, () => __cr.mode === "coach", 8000);
    const side = await A.evaluate(() => __cr.game.turn);
    if (side === 1) await play(A, "e4");
    await until(A, () => __cr.game.played.length >= 1 && JSON.parse(localStorage.chessroom_save || "null"), 15000);
    const shelfBefore = await A.evaluate(() => JSON.parse(localStorage.chessroom_save || "null"));
    ok("Ana plays the computer while she waits", shelfBefore && shelfBefore.mode === "coach" && shelfBefore.sans.length >= 1);
    ok("…and the board is still listed for Sam", !!(await until(S, (c) => __cr.Room.list().then((l) => (l || []).some((r) => r.code === c)), 8000, code)));

    /* ---- Sam taps the invite link ---- */
    const invite = await A.evaluate(() => { __cr.Room; return null; });
    void invite;
    await S.goto(base + "/chess/#join=" + code + "&n=Ana&c=none&s=b", { waitUntil: "load" });
    const told = await until(S, () => { const h = document.getElementById("joinHow"); return h && /Ana/.test(h.innerText) && /Black/.test(h.innerText) ? h.innerText : null; }, 15000);
    ok("Sam's invite says who is asking and which colour is his", !!told, told);
    const linked = await until(S, () => __cr.Net.linked() && __cr.mode === "lan", 40000);
    ok("the invite link joins the board", !!linked);
    ok("…and Ana is pulled from her computer game into it", !!(await until(A, () => __cr.mode === "lan" && __cr.Net.linked(), 20000)));
    const shelf = await A.evaluate(() => JSON.parse(localStorage.chessroom_save || "null"));
    ok("…her computer game shelved, not lost", shelf && shelf.mode === "coach" && shelf.sans.length >= shelfBefore.sans.length);
    await until(S, () => __cr.lanOppId, 8000);
    await until(A, () => __cr.lanOppId, 8000);
    const ids = { a: await A.evaluate(() => ({ me: __cr.friends.me, opp: __cr.lanOppId })), s: await S.evaluate(() => ({ me: __cr.friends.me, opp: __cr.lanOppId })) };
    ok("each phone learns the other's quiet id", /^f[0-9a-z]{10}$/.test(ids.a.me) && ids.a.opp === ids.s.me && ids.s.opp === ids.a.me && ids.a.me !== ids.s.me, JSON.stringify(ids));
    ok("a game under way is off the public list", !!(await until(S, (c) => __cr.Room.list().then((l) => !(l || []).some((r) => r.code === c)), 10000, code)));
    const meWhite = await A.evaluate(() => __cr.lanSide === 1);
    ok("the invite's colour was honest: Ana has White", meWhite);
    await wait(2800);                  /* the linked card goes on its own */
    await play(A, "d4");
    ok("a move crosses", !!(await until(S, () => __cr.game.played.length === 1, 15000)));
    await until(S, () => document.getElementById("ovLinked").classList.contains("hide"), 6000);

    /* ---- Sam resigns ---- */
    await S.evaluate(() => __cr.showMenu());
    await clickText(S, "#gameOps .chip", /Resign this game/);
    await S.waitForSelector("#ovAsk:not(.hide)", { timeout: 4000 });
    await clickText(S, "#askRow button", /Yes, resign/);
    await until(A, () => !document.getElementById("ovEnd").classList.contains("hide"), 10000);
    await until(S, () => !document.getElementById("ovEnd").classList.contains("hide"), 10000);
    const fa = await A.evaluate(() => __cr.friends.list), fs2 = await S.evaluate(() => __cr.friends.list);
    ok("both phones keep one friend each", fa.length === 1 && fs2.length === 1);
    ok("…by the other's id and name", fa[0].id === ids.s.me && fa[0].name === "Sam" && fs2[0].id === ids.a.me && fs2[0].name === "Ana");
    ok("…the score mirrored", fa[0].w === 1 && fa[0].l === 0 && fs2[0].l === 1 && fs2[0].w === 0, JSON.stringify([fa[0], fs2[0]]).slice(0, 200));
    ok("…and the game itself kept", fa[0].games.length === 1 && fa[0].games[0].s.join(" ") === "d4");
    const subA = await A.evaluate(() => document.getElementById("endRematchSub").textContent);
    const subS = await S.evaluate(() => document.getElementById("endRematchSub").textContent);
    ok("Ana's rematch line carries the score", /You lead 1–0/.test(subA) && /Black next/.test(subA), subA);
    ok("…and so does Sam's", /Ana leads 1–0/.test(subS), subS);
    ok("the end card points at your people", await A.isVisible("#endPeople"));
    const shelf2 = await A.evaluate(() => JSON.parse(localStorage.chessroom_save || "null"));
    ok("the shelved computer game survives the friend game's end", shelf2 && shelf2.mode === "coach");

    /* ---- your people ---- */
    await A.click("#endPeople");
    ok("Your people opens from the end card", await A.isVisible("#ovPeople"));
    const prow = await A.evaluate(() => document.getElementById("peopleList").innerText);
    ok("…with Sam, the score and the run", /Sam/.test(prow) && /1–0–0/.test(prow) && /You lead 1–0/.test(prow), prow.replace(/\n/g, " | "));
    await clickText(A, "#peopleList .pgRow .chip", /Look/);
    ok("a game with Sam opens on the board", !!(await until(A, () => __cr.mode === "review" && __cr.game.played.length === 1, 6000)));
    await A.evaluate(() => __cr.showMenu());

    /* ---- the rematch, and the decider ---- */
    await A.evaluate(() => { document.getElementById("ovMenu").classList.add("hide"); document.getElementById("ovEnd").classList.add("hide"); });
    /* back to the finished game: the menu dropped the viewer, the link is still up */
    await S.click("#endRematch");
    ok("a rematch is offered across", !!(await until(A, () => /offers a rematch/.test(document.getElementById("toast").innerText), 10000)));
    await clickText(A, "#toast .tact", /^Play$/);
    ok("…and taken, colours swapped", !!(await until(A, () => __cr.mode === "lan" && __cr.lanSide === -1 && __cr.game.played.length === 0, 10000)) &&
       !!(await until(S, () => __cr.mode === "lan" && __cr.lanSide === 1, 10000)));
    await play(S, "e4");
    await until(A, () => __cr.game.played.length === 1, 10000);
    await A.evaluate(() => __cr.showMenu());
    await clickText(A, "#gameOps .chip", /Resign this game/);
    await A.waitForSelector("#ovAsk:not(.hide)", { timeout: 4000 });
    await clickText(A, "#askRow button", /Yes, resign/);
    await until(A, () => !document.getElementById("ovEnd").classList.contains("hide"), 10000);
    const dec = await A.evaluate(() => document.getElementById("endRematchSub").textContent);
    ok("one game each: the decider?", /Level, 1–1 — the decider\?/.test(dec), dec);
    await until(S, () => !document.getElementById("ovEnd").classList.contains("hide"), 10000);
    ok("…on both phones", /decider/.test(await S.evaluate(() => document.getElementById("endRematchSub").textContent)));

    /* ---- a challenge from your people, noticed on the other phone ---- */
    await A.evaluate(() => __cr.challengeFriend("Sam"));
    await A.waitForSelector("#newStart", { state: "visible", timeout: 10000 });
    await A.click("#newStart");
    const code2 = await until(A, () => { const t = document.getElementById("roomCode").textContent.trim(); return /^[A-Z]{4}$/.test(t) ? t : null; }, 25000);
    ok("Ana opens a board for Sam", !!code2 && /Sam/.test(await A.evaluate(() => document.getElementById("roomHow").innerText)));
    await S.evaluate(() => { __cr.Net.close(); __cr.showMenu(); });
    await S.click("#mLan");
    const seen = await until(S, () => { const el = document.getElementById("friendOpen"); return el && !el.classList.contains("hide") ? el.innerText : null; }, 15000);
    ok("Sam's room notices the board opened for him", !!seen && /Ana opened a board for you/.test(seen), seen);
    await S.click("#friendOpen button");
    ok("…and joins it in one tap", !!(await until(S, () => __cr.Net.linked() && __cr.mode === "lan", 40000)));
    const again = await until(S, () => { const t = document.getElementById("linkedSub").textContent; return /again/.test(t) ? t : null; }, 8000);
    ok("the linked card says it's not the first time", !!again && /Ana again! Level, 1–1/.test(again), again);

    ok("no page threw anything", errs.length === 0, errs.slice(0, 4).join(" | "));
  } catch (e) {
    failed++;
    console.log("FAIL  the check itself fell over  → " + (e && e.stack || e));
    try { await A.screenshot({ path: path.join(os.tmpdir(), "friends-check-ana.png") }); await S.screenshot({ path: path.join(os.tmpdir(), "friends-check-sam.png") }); } catch (err) {}
    if (errs.length) console.log("      page errors: " + errs.slice(0, 4).join(" | "));
  }
  await browser.close();
  srv.close();
}

(async () => {
  nodeHalf();
  await browserHalf();
  console.log(failed ? "\n" + failed + " failed, " + passed + " passed"
                     : "\nthe room remembers who you play  ·  " + passed + " checks");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
