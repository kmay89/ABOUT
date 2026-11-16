/* cast-check.js — dev-only. Is the coach across the board somebody?

   In node, the cast itself (cast.js): every coach on the ladder has a
   character, a look the face can build and every kind of line; no line
   claims anything about the position a player could not see; lines go
   round without repeating, and stay up long enough to read.

   In a real browser, the room with them in it: the first time you play
   a coach it comes in large over the board and introduces itself
   (without standing in the way: the board under it still takes a move,
   and a touch sends it to its seat); the face sits in the coach's own
   name tag on both boards, moves to the other tag when the board turns,
   looks at the move just made, and sleeps when nothing is happening; a
   coach you have met says hello again instead; check and captures get
   a word; "Opponents talk" off silences the words but not the face; a
   game with nobody across the table has no face; and the ladder shows
   who you would be playing.

   Needs `playwright-core` for the browser half; without it, or without
   a browser, the node half still runs and the rest says so.

   Run: node chess/tools/cast-check.js                                    */
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

/* ---------------- node: the cast ---------------- */
global.self = global;
const Cast = require("../cast.js");
const Rating = require("../rating.js");
const Avatar = require("../avatar.js");
const TOPS = ["cap", "sprout", "clover", "fronds", "leaves", "flower", "tip", "crown"];
const hex = (h) => /^#[0-9a-f]{6}$/i.test(String(h));

ok("every coach on the ladder is somebody", Rating.LEVELS.every((L) => Cast.get(L.id)),
   Rating.LEVELS.filter((L) => !Cast.get(L.id)).map((L) => L.id).join(", "));
ok("…and each by the name the ladder knows them by", Rating.LEVELS.every((L) => Cast.get(L.id).name === L.name));
ok("every face can be built: a body the renderer knows, a top it knows, real colours",
   Cast.ids().every((id) => {
     const l = Cast.get(id).look;
     return Avatar.BODIES[l.body] && TOPS.indexOf(l.top) >= 0 && hex(l.col) && hex(l.col2) && hex(l.pot);
   }));
ok("every voice is a pitch a person could have and a pace they could keep",
   Cast.ids().every((id) => { const v = Cast.get(id).voice; return v.hz >= 120 && v.hz <= 800 && v.rate >= 6 && v.rate <= 16; }));
const missing = [];
Cast.ids().forEach((id) => Cast.KINDS.forEach((k) => { if (!Cast.line(id, k, 0)) missing.push(id + ":" + k); }));
ok("every coach has something to say for every moment", missing.length === 0, missing.join(", "));
const all = [];
Cast.ids().forEach((id) => Cast.KINDS.forEach((k) => Cast.CAST[id].lines[k].forEach((t) => all.push({ id, k, t }))));
const long = all.filter((x) => x.t.length > (x.k === "hello" ? 140 : 90));
ok("lines are short enough to read at a glance (introductions a little longer)", long.length === 0, long.map((x) => x.id + ":" + x.t).join(" | "));
/* nothing a player could not see for themselves: no square, no move, no
   number of moves to mate, no word on what the best move is */
const telling = all.filter((x) => /\b[a-h][1-8]\b|mate in|best move|blunder|\bwinning\b|\bwins\b/i.test(x.t));
ok("no line tells you anything about the position", telling.length === 0, telling.map((x) => x.id + ":" + x.t).join(" | "));
ok("lines go round, each kind in turn, the same way every time",
   Cast.line("sprout", "took", 0) !== Cast.line("sprout", "took", 1) && Cast.line("sprout", "took", 3) === Cast.line("sprout", "took", 0) &&
   Cast.line("sprout", "took", -1) === Cast.line("sprout", "took", 2));
ok("a line stays up long enough to read, and not forever",
   Cast.readMs("Hi!") === 2000 && Cast.readMs("x".repeat(60)) > 4000 && Cast.readMs("x".repeat(400)) === 7000);
ok("a babble has a syllable or so per vowel group, and never a speech",
   Cast.syllables("Check!") === 1 && Cast.syllables("Oh no oh no") === 4 && Cast.syllables("a ".repeat(50)) === 14 && Cast.syllables("") === 1);
ok("an unknown coach has nothing to say, rather than someone else's line", Cast.line("nobody", "hello", 0) === null);

/* ---------------- a browser: the room with them in it ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." :
    "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe cast is right (the room was not opened)");
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

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    try { const p = JSON.parse(localStorage.getItem("chessroom_prefs") || "{}"); p.welcomed = true; p.tips = { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 }; localStorage.setItem("chessroom_prefs", JSON.stringify(p)); } catch (e) {}
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
  const S = () => page.evaluate(() => __cr.castState());
  const play = (san, src) => page.evaluate(([f, a]) => eval(f)(a), [PLAY, [san, src]]);
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn); if (v) return v; await page.waitForTimeout(80); } return null; };
  try {
    await page.goto(base + "/chess/");
    await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await page.waitForTimeout(500);

    /* the ladder shows who you would be playing */
    const faces = await until(() => { const im = [...document.querySelectorAll("#mLadder .rung .rgFace")]; return im.length === 8 && im.every((i) => /^data:image\/png/.test(i.src)) ? im.length : 0; }, 8000);
    ok("the ladder shows each coach's face", faces === 8, String(faces));

    /* meeting a coach for the first time */
    await page.evaluate(() => __cr.startGame("coach", { humanSide: 1, skill: "acorn", clockStr: "none", fresh: true }));
    await page.waitForTimeout(700);
    let s = await S();
    ok("the first time, the coach comes in over the board and introduces itself",
       s.meeting && /Acorn/.test(await page.evaluate(() => document.getElementById("meetName").textContent)), JSON.stringify(s));
    ok("…in its own words", await until(() => /I'm Acorn/.test(document.getElementById("meetSay").textContent), 6000) !== null);
    ok("…without standing in the way: the board under it still takes a move",
       await page.evaluate(() => getComputedStyle(document.getElementById("castMeet")).pointerEvents === "none" && !document.getElementById("app").inert));
    ok("…and its face is already in its seat, in the coach's name tag, drawn in 3D",
       s.shown && !s.flat && s.bar === "pbar top" && s.face && s.face.drawn > 0, JSON.stringify(s));
    ok("…and it is remembered as met", s.met.indexOf("acorn") >= 0);
    await page.mouse.click(195, 760);
    await page.waitForTimeout(300);
    ok("a touch anywhere sends it to its seat", !(await S()).meeting);

    /* a move: it looks, and a check gets a word */
    await play("e4"); await page.waitForTimeout(400);
    const look1 = (await S()).face.look[0];
    await until(() => __cr.game.turn === 1, 15000);
    await page.waitForTimeout(500);
    const look2 = (await S()).face.look[0];
    ok("its eyes follow the move just made", look1 !== 0 || look2 !== 0, look1 + " → " + look2);
    /* a quick check against it: Qh5 then Qxf7+ (or Bb5+ if f7 is defended away) */
    await play("Qh5"); await until(() => __cr.game.turn === 1, 15000); await page.waitForTimeout(500);
    const checked = (await play("Qxf7")) || (await play("Qxe5")) || (await play("Bb5"));
    await page.waitForTimeout(600);
    s = await S();
    const inCheck = await page.evaluate(() => Chess.inCheck(__cr.game));
    ok("check against it gets a word, in a bubble, in its own voice",
       !checked || !inCheck || (s.said.checked >= 1 && Cast.CAST.acorn.lines.checked.some((t) => s.saying.indexOf(t) >= 0)), JSON.stringify(s));
    await until(() => __cr.game.turn === 1 || !!document.getElementById("ovEnd") && !document.getElementById("ovEnd").classList.contains("hide"), 15000);
    await page.waitForTimeout(400);

    /* asleep when nothing is happening */
    const slept = await until(() => { const f = __cr.castState().face; return f && f.sleeping ? true : null; }, 15000);
    ok("when nothing is happening the face sleeps (no frames)", !!slept);
    const d0 = (await S()).face.drawn; await page.waitForTimeout(1200); const d1 = (await S()).face.drawn;
    ok("…and draws nothing while it does (a blink aside)", d1 - d0 <= 12, d0 + " → " + d1);

    /* the board turns: the face goes with its tag */
    await page.evaluate(() => document.getElementById("btnFlip").click());
    await page.waitForTimeout(300);
    ok("when the board turns, the face moves to the coach's tag", (await S()).bar === "pbar bot", (await S()).bar);
    await page.evaluate(() => document.getElementById("btnFlip").click());
    await page.waitForTimeout(200);

    /* a coach you have met: hello again, no entrance */
    await page.evaluate(() => __cr.startGame("coach", { humanSide: 1, skill: "acorn", clockStr: "none", fresh: true }));
    await page.waitForTimeout(400);
    ok("a coach you have met does not introduce itself again", !(await S()).meeting);
    const hi = await until(() => { const st = __cr.castState(); return st.said.greet ? st.saying : null; }, 4000);
    ok("…it says hello again instead", !!hi && Cast.CAST.acorn.lines.greet.some((t) => hi.indexOf(t) >= 0), hi);

    /* the words can be turned off; the face still answers */
    await page.evaluate(() => { const b = document.getElementById("setChatter"); b.click(); });
    await page.waitForTimeout(150);
    const quiet = await page.evaluate(() => { __cr.startGame("coach", { humanSide: 1, skill: "acorn", clockStr: "none", fresh: true }); return true; });
    await page.waitForTimeout(1600);
    s = await S();
    ok("with Opponents talk off, nothing is said", quiet && s.saying === "" && !s.said.greet, JSON.stringify(s));
    ok("…and the switch is remembered", await page.evaluate(() => JSON.parse(localStorage.getItem("chessroom_prefs")).chatter === false));
    await page.evaluate(() => document.getElementById("setChatter").click());

    /* nobody across the table: no face */
    await page.evaluate(() => __cr.startGame("pass", { clockStr: "none" }));
    await page.waitForTimeout(300);
    s = await S();
    ok("a game between two people has no face across the table", !s.on && !s.shown, JSON.stringify(s));

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }

  /* the flat board has the face too */
  {
    const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p2 = await c2.newPage();
    p2.on("pageerror", (e) => errs.push("2d: " + e.message));
    try {
      await p2.goto(base + "/chess/#force2d");
      await p2.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
      await p2.evaluate(() => __cr.startGame("coach", { humanSide: -1, skill: "mentor", clockStr: "none", fresh: true }));
      await p2.waitForTimeout(800);
      const s2 = await p2.evaluate(() => __cr.castState());
      ok("on the flat board too, the coach has its face, in its own tag", __cr2(s2), JSON.stringify(s2));
    } catch (e) {
      ok("the flat-board check fell over", false, String(e && e.stack || e).split("\n")[0]);
    }
    await c2.close();
  }
  function __cr2(s2) { return s2.on && s2.shown && !s2.flat && s2.face && s2.face.id === "mentor" && s2.bar === "pbar top"; }

  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe coach across the board is somebody, and minds its manners");
  process.exit(failed ? 1 : 0);
})();
