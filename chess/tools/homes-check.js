/* homes-check.js — the coaches' boards.

   In node, the boards themselves (skins.js HOMES): every coach on the
   ladder has one, complete and safe, named for its coach; each is its
   own look (no two alike, none the same as a house preset); each is as
   readable as the house's own boards (light and dark squares, and the
   two armies, far enough apart); and a board that travels in a share
   code still knows whose it was.

   In a real browser, the room: a coach game is played on the coach's
   board without touching your own look; the first meeting says whose
   board it is and that it can be won; any other game is on your board;
   the Studio shows the coaches' boards locked until won, and choosing
   something there keeps your choice for the game; Settings can turn the
   whole thing off; and beating a coach in a rated game wins its board:
   the end card says so (with a "Use it"), the coach hands it over in
   its own words, the ladder shows it in colour, and the Studio lets you
   use it anywhere. A second win does not announce it again.

   Needs `playwright-core` for the browser half; without it, or without
   a browser, the node half still runs and the rest says so.

   Run: node chess/tools/homes-check.js                                   */
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

global.localStorage = (function () {
  const mem = {};
  return { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
})();
global.btoa = (s) => Buffer.from(s, "binary").toString("base64");
global.atob = (s) => Buffer.from(s, "base64").toString("binary");
global.self = global;
const Skins = require("../skins.js");
const Rating = require("../rating.js");
const Cast = require("../cast.js");

/* ---------------- node: the boards ---------------- */
const HEX = /^#[0-9a-f]{6}$/;
const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const homes = Rating.LEVELS.map((L) => ({ L, h: Skins.homeOf(L.id) }));

ok("every coach on the ladder has a board of its own", homes.every((x) => x.h), homes.filter((x) => !x.h).map((x) => x.L.id).join(", "));
ok("…and nothing that is not a coach does", Object.keys(Skins.HOMES).length === Rating.LEVELS.length && Skins.homeOf("nobody") === null && Skins.homeOf("__proto__") === null);
const bad = [];
homes.forEach(({ L, h }) => {
  if (!h) return;
  for (const k of ["light", "dark", "rim", "edge", "coord"]) if (!HEX.test(h.board[k])) bad.push(L.id + ":board." + k);
  for (const k of ["white", "black"]) if (!HEX.test(h.pieces[k])) bad.push(L.id + ":pieces." + k);
  for (const k of ["select", "legal", "capture", "last", "check", "hint", "plan"]) if (!HEX.test(h.marks[k])) bad.push(L.id + ":marks." + k);
  if (!Skins.MATERIALS[h.pieces.material]) bad.push(L.id + ":material");
  if (!Skins.PIECE_SETS[h.pieces.set]) bad.push(L.id + ":set");
  if (!h.note || h.note.length < 20) bad.push(L.id + ":note");
  /* a cleaned board is the same board: the guard had nothing to take out */
  if (JSON.stringify(Skins.clean(h, h.name)) !== JSON.stringify(h)) bad.push(L.id + ":not clean");
});
ok("each board is complete, and already clean", bad.length === 0, bad.join(", "));
ok("each is named for its coach, by the name on the ladder (the apostrophe kept)",
   homes.every(({ L, h }) => h && h.name.indexOf(L.name + "’s ") === 0 && h.maker === L.name),
   homes.map(({ h }) => h && h.name).join(" | "));
ok("no two boards look alike", new Set(homes.map(({ h }) => h.board.light + h.board.dark)).size === homes.length);
ok("…and none is a house preset under another name",
   homes.every(({ h }) => !Skins.PRESETS.some((p) => p.id === h.id || p.name === h.name || (p.board.light === h.board.light && p.board.dark === h.board.dark))));
/* as readable as the house: the weakest house board sets the bar */
const minSq = Math.min(...Skins.PRESETS.map((p) => ratio(p.board.light, p.board.dark)));
const minPc = Math.min(...Skins.PRESETS.map((p) => ratio(p.pieces.white, p.pieces.black)));
const weakSq = homes.filter(({ h }) => ratio(h.board.light, h.board.dark) < Math.min(minSq, 1.6));
const weakPc = homes.filter(({ h }) => ratio(h.pieces.white, h.pieces.black) < Math.min(minPc, 4));
ok("light and dark squares are as easy to tell apart as on the house boards", weakSq.length === 0,
   weakSq.map(({ L, h }) => L.id + "=" + ratio(h.board.light, h.board.dark).toFixed(2)).join(", ") + " (bar " + minSq.toFixed(2) + ")");
ok("…and so are the two armies", weakPc.length === 0,
   weakPc.map(({ L, h }) => L.id + "=" + ratio(h.pieces.white, h.pieces.black).toFixed(2)).join(", ") + " (bar " + minPc.toFixed(2) + ")");
ok("a board sent in a share code still knows whose it was",
   homes.every(({ L, h }) => { const back = Skins.decode(Skins.encode(h)); return back && Skins.coachOf(back) === L.id && back.marks.plan === h.marks.plan; }));
ok("…and a house look belongs to no coach", Skins.PRESETS.every((p) => Skins.coachOf(p) === null));
ok("every coach has words for handing its board over",
   Rating.LEVELS.every((L) => { const t = Cast.line(L.id, "gift", 0); return t && t.length <= 100; }));

/* ---------------- a browser: the room ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." :
    "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe boards are right (the room was not opened)");
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

const PLAY = `([san, src]) => {
  const g = __cr.game;
  const mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, '') === san.replace(/[+#]$/, ''));
  if (!mv) return false;
  __cr.commitMove(mv, src || 'local');
  return true;
}`;
const SCHOLAR = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    try { const p = JSON.parse(localStorage.getItem("chessroom_prefs") || "{}"); p.welcomed = true; p.tips = { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 }; localStorage.setItem("chessroom_prefs", JSON.stringify(p)); } catch (e) {}
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
  const H = () => page.evaluate(() => Object.assign(__cr.homeState(), {
    room: getComputedStyle(document.documentElement).getPropertyValue("--room").trim() }));
  const play = (san, src) => page.evaluate(([f, a]) => eval(f)(a), [PLAY, [san, src]]);
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn); if (v) return v; await page.waitForTimeout(80); } return null; };
  const coach = (id) => page.evaluate((k) => __cr.startGame("coach", { humanSide: 1, skill: k, clockStr: "none", fresh: true }), id);
  const studio = async (open) => {
    await page.evaluate((o) => { if (o) __cr.openStudio(); else document.getElementById("stClose").click(); }, open);
    await page.waitForTimeout(250);
  };
  const __cr2 = (x) => x.wornName === "Midnight Glass";
  const acorn = Skins.homeOf("acorn"), cactus = Skins.homeOf("cactus");
  try {
    await page.goto(base + "/chess/#force2d");
    await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await page.waitForTimeout(400);

    /* the ladder: every coach's board, small and locked */
    let lad = await page.evaluate(() => ({ all: document.querySelectorAll("#mLadder .rung .rgBoard").length,
                                          got: document.querySelectorAll("#mLadder .rung .rgBoard.got").length }));
    ok("the ladder shows each coach's board, locked until won", lad.all === 8 && lad.got === 0, JSON.stringify(lad));

    /* a coach game, on the coach's board */
    await coach("cactus");
    await page.waitForTimeout(500);
    let h = await H();
    ok("a coach game is played on the coach's board", h.worn === "cactus" && h.wornName === cactus.name && h.room === cactus.room.bg, JSON.stringify(h));
    ok("…without touching your own look", h.own === "Walnut Study" &&
       (await page.evaluate(() => (JSON.parse(localStorage.getItem("chessroom_prefs") || "{}").skin || { name: "Walnut Study" }).name)) === "Walnut Study");
    const meet = await until(() => { const el = document.getElementById("meetBoard"); return el && !el.classList.contains("hide") ? el.textContent : ""; }, 3000);
    ok("the first meeting says whose board it is, and that it can be won", meet && meet.indexOf(cactus.name) >= 0 && /win and it/.test(meet), meet);
    await page.evaluate(() => __cr.castMeetDone && __cr.castMeetDone());

    /* the Studio: the coaches' boards, locked */
    await studio(true);
    let st = await page.evaluate(() => ({ n: document.querySelectorAll("#stHomes .preset.home").length,
      locked: document.querySelectorAll("#stHomes .preset.home.locked").length, note: document.getElementById("stHomesNote").textContent }));
    ok("the Studio has a shelf of the coaches' boards, all locked to begin with", st.n === 8 && st.locked === 8, JSON.stringify(st));
    ok("…and says this game is on Cactus's board", st.note.indexOf(cactus.name) >= 0, st.note);
    await page.evaluate(() => document.querySelectorAll("#stHomes .preset.home")[5].click());
    await page.waitForTimeout(200);
    h = await H();
    const said = await page.evaluate(() => document.getElementById("toast").textContent);
    ok("a locked board can't be chosen: it is won, not picked", h.own === "Walnut Study" && h.worn === "cactus" && /won, not chosen/.test(said), said);
    /* choosing something else keeps your choice for this game */
    await page.evaluate(() => [...document.querySelectorAll("#stPresets .preset")].find((b) => /Midnight/.test(b.textContent)).click());
    await page.waitForTimeout(200);
    h = await H();
    ok("choosing a look in the Studio mid-game plays on it for the rest of the game", h.worn === null && h.own === "Midnight Glass" && h.wornName === "Midnight Glass", JSON.stringify(h));
    await studio(false);
    await play("e4"); await page.waitForTimeout(300);
    h = await H();
    ok("…and it holds as the game goes on", h.worn === null, JSON.stringify(h));
    await page.evaluate(() => __cr.undoPlyForTest(1)); await page.waitForTimeout(250);
    h = await H();
    ok("…a take-back included", h.worn === null && __cr2(h), JSON.stringify(h));
    await coach("cactus"); await page.waitForTimeout(300);
    h = await H();
    ok("the next coach game is on the coach's board again", h.worn === "cactus" && h.own === "Midnight Glass", JSON.stringify(h));

    /* any other game is on your own board */
    await page.evaluate(() => __cr.startGame("pass", { clockStr: "none", fresh: true }));
    await page.waitForTimeout(300);
    h = await H();
    ok("two on one screen plays on your own board", h.worn === null && h.wornName === "Midnight Glass" && h.room === Skins.PRESETS.find((p) => p.id === "midnight").room.bg, JSON.stringify(h));
    await page.evaluate(() => __cr.applySkin(__cr.Skins.PRESETS[0]));

    /* Settings can turn it off, and on */
    await page.evaluate(() => document.getElementById("setHomes").click());
    await coach("pine"); await page.waitForTimeout(300);
    h = await H();
    ok("with Coaches' boards off, a coach game is on your own board", h.worn === null && !h.on && h.wornName === "Walnut Study", JSON.stringify(h));
    await page.evaluate(() => document.getElementById("setHomes").click());
    await page.waitForTimeout(100);
    h = await H();
    ok("…and turning it back on puts the coach's board out at once", h.worn === "pine" && h.on, JSON.stringify(h));

    /* the first win against a coach wins its board */
    await coach("acorn"); await page.waitForTimeout(300);
    await page.evaluate(() => __cr.castMeetDone && __cr.castMeetDone());
    for (const [i, san] of SCHOLAR.entries()) {
      await play(san, i % 2 ? "coach" : "local");
      await page.waitForTimeout(i % 2 ? 420 : 80);
    }
    await page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 9000 }).catch(() => {});
    const mile = await until(() => { const el = document.querySelector("#endMiles .erMile.unlock"); return el ? el.textContent : ""; }, 12000);
    /* on its own line, or (on the journey) as part of the chapter it clears */
    ok("beating a coach wins its board: the end card says so", mile && mile.indexOf(acorn.name) >= 0 && /Board won|is yours/.test(mile), mile);
    h = await H();
    ok("…and it is kept as won", h.unlocked.join() === "acorn" && h.just === "acorn", JSON.stringify(h));
    const gift = await until(() => { const s = __cr.castState(); return /stump/i.test(s.saying) ? s.saying : ""; }, 4000);
    ok("…the coach hands it over in its own words", !!gift, gift || JSON.stringify(await page.evaluate(() => __cr.castState())));
    await page.evaluate(() => document.querySelector("#endMiles .erUse").click());
    await page.waitForTimeout(200);
    h = await H();
    const btn = await page.evaluate(() => document.querySelector("#endMiles .erUse").textContent);
    ok("\"Use it\" makes it your board for every game", h.own === acorn.name && /Yours/.test(btn) &&
       (await page.evaluate(() => JSON.parse(localStorage.getItem("chessroom_prefs")).skin.name)) === acorn.name, JSON.stringify(h) + " " + btn);
    await page.evaluate(() => __cr.applySkin(__cr.Skins.PRESETS[0]));

    /* the ladder and the Studio show it */
    await page.evaluate(() => { document.getElementById("ovEnd").classList.add("hide"); __cr.showMenu(); });
    await page.waitForTimeout(300);
    lad = await page.evaluate(() => ({ got: [...document.querySelectorAll("#mLadder .rung .rgBoard.got")].map((e) => e.title) }));
    ok("the ladder shows the board won, in colour", lad.got.length === 1 && lad.got[0].indexOf(acorn.name) === 0, JSON.stringify(lad));
    await studio(true);
    st = await page.evaluate(() => ({ locked: document.querySelectorAll("#stHomes .preset.home.locked").length,
      first: document.querySelector("#stHomes .preset.home").className, note: document.getElementById("stHomesNote").textContent }));
    ok("the Studio has it unlocked", st.locked === 7 && !/locked/.test(st.first) && /1 of 8 won/.test(st.note), JSON.stringify(st));
    await page.evaluate(() => document.querySelector("#stHomes .preset.home").click());
    await page.waitForTimeout(200);
    h = await H();
    ok("…and choosing it there makes it yours to play on anywhere", h.own === acorn.name, JSON.stringify(h));
    await studio(false);
    await page.evaluate(() => __cr.startGame("pass", { clockStr: "none", fresh: true }));
    await page.waitForTimeout(200);
    h = await H();
    ok("…two on one screen included", h.worn === null && h.wornName === acorn.name && h.room === acorn.room.bg, JSON.stringify(h));

    /* a second win says nothing new */
    await coach("acorn"); await page.waitForTimeout(300);
    for (const [i, san] of SCHOLAR.entries()) {
      await play(san, i % 2 ? "coach" : "local");
      await page.waitForTimeout(i % 2 ? 420 : 80);
    }
    await page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(5500);
    const again = await page.evaluate(() => ({ unlock: document.querySelectorAll("#endMiles .erMile.unlock").length, just: __cr.homeState().just }));
    ok("a second win does not announce the board again", again.unlock === 0 && again.just === null, JSON.stringify(again));

    /* and it is still won tomorrow */
    await page.reload();
    await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await page.waitForTimeout(400);
    h = await H();
    ok("a reload keeps the board won, and your choice", h.unlocked.join() === "acorn" && h.own === acorn.name, JSON.stringify(h));

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }

  /* the carved board wears it too */
  {
    const c3 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p3 = await c3.newPage();
    p3.on("pageerror", (e) => errs.push("3d: " + e.message));
    try {
      await p3.goto(base + "/chess/");
      await p3.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
      await p3.evaluate(() => __cr.startGame("coach", { humanSide: 1, skill: "bamboo", clockStr: "none", fresh: true }));
      await p3.waitForTimeout(800);
      const s3 = await p3.evaluate(() => ({ h: __cr.homeState(), three: !document.getElementById("cv3").classList.contains("hide"),
        room: getComputedStyle(document.documentElement).getPropertyValue("--room").trim() }));
      ok("on the carved board too, the coach's board is out", s3.h.worn === "bamboo" && s3.room === Skins.homeOf("bamboo").room.bg, JSON.stringify(s3));
    } catch (e) {
      ok("the carved-board check fell over", false, String(e && e.stack || e).split("\n")[0]);
    }
    await c3.close();
  }

  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\neach coach plays on its own board, and gives it up to whoever beats it");
  process.exit(failed ? 1 : 0);
})();
