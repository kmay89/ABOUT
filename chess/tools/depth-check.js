/* depth-check.js — dev-only. The things a screen can do that a board
   can't: men with a little life of their own, a board that shows who
   controls each square, and a replay of the game's best moments.

   In node: the gestures (motion.js) start, stay small, and stop; each
   kind of man has his own; a gesture that has not begun yet is still.

   In a real browser:
     - the men are alive: left alone, one of them does his own gesture,
       and it ends; the men beside a capture flinch; after a mate the
       winners jump and the others sink; "Pieces come alive" off, or
       reduced motion, and there is none of it;
     - board sight: the eye shows who controls each square, counted the
       way a player counts (pawns, knights, sliders stopped by the first
       man in the way), yours in blue and theirs in red, and goes again;
     - the highlights: after a game the end card offers them; they play
       the big moments in order and always the last, widescreen, with a
       caption; a tap ends them; they end on the card.

   Run: node chess/tools/depth-check.js                                   */
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

/* ---------------- node: the gestures ---------------- */
const Motion = require("../motion.js");
const kinds = Object.keys(Motion.LIFE);
ok("seven gestures: hop, nod, sway, look, flinch, cheer, sigh", ["hop", "nod", "sway", "look", "flinch", "cheer", "sigh"].every((k) => kinds.indexOf(k) >= 0));
ok("every gesture is going while it plays and still when it is done",
   kinds.every((k) => Motion.life(k, Motion.LIFE[k].ms * 0.4).live && !Motion.life(k, Motion.LIFE[k].ms).live && !Motion.life(k, Motion.LIFE[k].ms * 5).live));
ok("…and ends exactly where it began: upright, on the wood, its own height",
   kinds.every((k) => { const p = Motion.life(k, Motion.LIFE[k].ms + 1); return p.y === 0 && p.tilt === 0 && p.ry === 0 && p.squash === 1; }));
let worst = { y: 0, tilt: 0, sq: 0 };
kinds.forEach((k) => {
  for (let t = 0; t <= Motion.LIFE[k].ms; t += 10) {
    const p = Motion.life(k, t);
    worst.y = Math.max(worst.y, p.y); worst.tilt = Math.max(worst.tilt, Math.abs(p.tilt) + Math.abs(p.flat));
    worst.sq = Math.max(worst.sq, Math.abs(1 - p.squash));
  }
});
ok("gestures are small: never higher than half a square, never leaning far, never squashed much", worst.y <= 0.5 && worst.tilt <= 0.3 && worst.sq <= 0.16, JSON.stringify(worst));
ok("every short gesture is short (a cheer or a look a little longer)", kinds.every((k) => Motion.LIFE[k].ms <= 1200));
ok("each man has his own: pawn hops, knight nods, bishop and queen sway, rook and king look",
   Motion.fidgetOf(1) === "hop" && Motion.fidgetOf(-2) === "nod" && Motion.fidgetOf(3) === "sway" && Motion.fidgetOf(5) === "sway" &&
   Motion.fidgetOf(-4) === "look" && Motion.fidgetOf(6) === "look");
ok("a gesture waiting for its turn in a wave stands still, but is not over", (() => { const p = Motion.life("cheer", -200); return p.live && p.y === 0 && p.squash === 1; })());
ok("a cheer turns a full circle in the air", Math.abs(Motion.life("cheer", Motion.LIFE.cheer.ms * 0.79).ry - 2 * Math.PI) < 0.2);

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe gestures are right on paper (the room was not opened)");
  process.exit(failed ? 1 : 0);
}
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
const PREFS = { welcomed: true, tips: { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 }, met: { acorn: 1 } };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  const open = async (o) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }, o || {}));
    await ctx.addInitScript((p) => { if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify(p)); }, PREFS);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/404|vibrate/.test(m.text())) errs.push(m.text()); });
    await page.goto(base + "/chess/#force2d");
    await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await page.waitForTimeout(300);
    return { ctx, page };
  };
  const { ctx, page } = await open();
  const until = async (fn, ms, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn, arg); if (v) return v; await page.waitForTimeout(40); } return null; };
  const start = (o, m) => page.evaluate(([o2, m2]) => { document.getElementById("ovMenu").classList.add("hide"); __cr.startGame(m2 || "coach", Object.assign({ clockStr: "none", fresh: true }, o2)); }, [o, m]);
  const mv = (san, src) => page.evaluate(([x, s]) => {
    const g = __cr.game, m = Chess.moves(g).find((q) => Chess.toSAN(g, q).replace(/[+#]$/, "") === x.replace(/[+#]$/, ""));
    if (!m) return false; __cr.commitMove(m, s); return true;
  }, [san, src]);
  const S = () => page.evaluate(() => __cr.lifeState());
  try {
    /* ---- the men are alive ---- */
    await start({ humanSide: 1, skill: "acorn" }, "local");
    await page.waitForTimeout(2600);           /* the men are set out first */
    ok("in a game, the men may come alive", (await S()).ok);
    const fid = await until(() => { __cr.lifeTickForTest({ quiet: 9000 }); const on = __cr.lifeState().on, k = Object.keys(on); return k.length ? { sq: +k[0], kind: on[k[0]], piece: __cr.game.board[+k[0]] } : null; }, 3000);
    ok("left alone a few seconds, one man does his own little thing", !!fid, JSON.stringify(fid));
    ok("…the one his kind does (a pawn hops, a knight nods…)", fid && fid.kind === Motion.fidgetOf(fid.piece), JSON.stringify(fid));
    ok("…a man of the side to move", fid && fid.piece > 0);
    const ended = await until(() => Object.keys(__cr.lifeState().on).length === 0, 2000);
    ok("…and then he is still again", !!ended);
    ok("nothing happens while somebody is busy at the board", await page.evaluate(() => { const before = __cr.lifeState().count; document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); return __cr.lifeState().quiet < 500 && __cr.lifeState().count <= before; }));
    /* the blow */
    await page.evaluate(() => __cr.lifeFlinch(0x14));   /* e2: d1 e1 f1 d2 f2 d3 e3 f3 around it */
    const fl = await page.evaluate(() => __cr.lifeState().on);
    ok("the men beside a capture flinch from it", Object.values(fl).length === 5 && Object.values(fl).every((k) => k === "flinch"), JSON.stringify(fl));
    await page.waitForTimeout(700);
    /* switched off */
    await page.evaluate(() => { document.getElementById("setAlive").click(); });
    const off = await page.evaluate(() => { __cr.lifeTickForTest({ quiet: 9000 }); __cr.lifeFlinch(0x14); return { ok: __cr.lifeState().ok, on: Object.keys(__cr.lifeState().on).length, btn: document.getElementById("setAlive").textContent }; });
    ok("\"Pieces come alive\" off: none of it", !off.ok && off.on === 0 && off.btn === "Off", JSON.stringify(off));
    await page.evaluate(() => { document.getElementById("setAlive").click(); });
    ok("…and on again", (await S()).ok);

    /* ---- board sight ---- */
    await start({ humanSide: 1, skill: "acorn" }, "local");
    await page.waitForTimeout(600);
    const map = await page.evaluate(() => { const m = __cr.sightMap(__cr.game.board, 1), t = __cr.sightMap(__cr.game.board, -1); return { e3: m[0x24], f3: m[0x25], c3: m[0x22], a3: m[0x20], e4: m[0x34], f6: t[0x55], e2: m[0x14], d1: m[0x03] }; });
    ok("board sight counts like a player: e3 is watched by two pawns, f3 and c3 by two pawns and a knight",
       map.e3 === 2 && map.f3 === 3 && map.c3 === 3 && map.a3 === 2, JSON.stringify(map));
    ok("…a square nobody can reach yet is nobody's, and a man in the way stops a rook or a bishop", map.e4 === 0 && map.f6 === 3 && map.d1 === 1, JSON.stringify(map));
    ok("the eye is off until you want it", (await page.evaluate(() => __cr.sightState())).painted === 0);
    await page.evaluate(() => document.getElementById("sightBtn").click());
    const sOn = await page.evaluate(() => ({ st: __cr.sightState(), pressed: document.getElementById("sightBtn").getAttribute("aria-pressed"), heat: __cr.sightHeat() }));
    const mine = sOn.heat.filter((h) => h.col === "#2f8be8").map((h) => h.sq), theirs = sOn.heat.filter((h) => h.col === "#e8483a").map((h) => h.sq);
    ok("tap the eye and every square anybody watches is tinted", sOn.st.painted > 30 && sOn.pressed === "true", JSON.stringify(sOn.st));
    ok("…yours in blue (your third rank), theirs in red (their sixth)", [0x20, 0x24, 0x27].every((q) => mine.indexOf(q) >= 0) && [0x50, 0x54, 0x57].every((q) => theirs.indexOf(q) >= 0));
    ok("…and it explains itself, once", /Board sight/.test(await page.evaluate(() => document.getElementById("toast").textContent)));
    await mv("e4", "local"); await page.waitForTimeout(500);
    ok("it follows the game, move by move (after e4 the pawn watches d5 and f5)", await page.evaluate(() => __cr.sightMap(__cr.game.board, 1)[0x43] >= 1 && __cr.sightMap(__cr.game.board, 1)[0x45] >= 1 && __cr.sightHeat().some((h) => h.sq === 0x45) && __cr.sightState().painted > 30));
    await page.evaluate(() => document.getElementById("sightBtn").click());
    ok("tap again and it goes", (await page.evaluate(() => __cr.sightState())).painted === 0);

    /* ---- the highlights, and the wave ---- */
    await start({ humanSide: 1, skill: "acorn" });
    await page.waitForTimeout(300);
    for (const [s2, src] of [["e4", "local"], ["e5", "coach"], ["Bc4", "local"], ["Nc6", "coach"], ["Qh5", "local"], ["Nf6", "coach"], ["Qxf7#", "local"]]) {
      await page.waitForTimeout(150);
      if (!(await mv(s2, src))) { ok("the check could play " + s2, false); break; }
    }
    const wave = await until(() => { const on = Object.values(__cr.lifeState().on); return on.indexOf("cheer") >= 0 ? on : null; }, 4000);
    ok("after a mate the winning army jumps for joy", !!wave && wave.filter((k) => k === "cheer").length >= 10, JSON.stringify(wave));
    ok("…and the other side sinks a little", !!wave && wave.indexOf("sigh") >= 0);
    await until(() => !document.getElementById("ovEnd").classList.contains("hide"), 12000);
    await page.waitForTimeout(600);
    const reelBtn = await page.evaluate(() => ({ on: !document.getElementById("endReel").classList.contains("hide"), list: __cr.reelMoments(), n: __cr.game.played.length }));
    ok("the end card offers the highlights", reelBtn.on, JSON.stringify(reelBtn));
    ok("…always ending on the last move", reelBtn.list[reelBtn.list.length - 1] === reelBtn.n - 1, JSON.stringify(reelBtn.list));
    await page.evaluate(() => document.getElementById("endReel").click());
    await page.waitForTimeout(300);
    const r1 = await page.evaluate(() => ({ st: __cr.reelState(), wide: document.body.classList.contains("reel"), box: !document.getElementById("reelBox").classList.contains("hide"), end: !document.getElementById("ovEnd").classList.contains("hide") }));
    ok("they play widescreen, over the board, with a caption", r1.st.on && r1.wide && r1.box && !r1.end && r1.st.caption === "Checkmate!" && /Move 4/.test(r1.st.move), JSON.stringify(r1));
    const done = await until(() => !__cr.reelState().on, 9000);
    ok("…and end on the end card again", !!done && await page.evaluate(() => !document.getElementById("ovEnd").classList.contains("hide") && !document.body.classList.contains("reel")));
    await page.evaluate(() => document.getElementById("endReel").click());
    await page.waitForTimeout(300);
    await page.mouse.click(200, 300);
    ok("a tap ends them early", await page.evaluate(() => !__cr.reelState().on && !document.getElementById("ovEnd").classList.contains("hide")));
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
    await ctx.close();

    /* ---- reduced motion: none of it moves ---- */
    const rm = await open({ reducedMotion: "reduce" });
    await rm.page.evaluate(() => { document.getElementById("ovMenu").classList.add("hide"); __cr.startGame("local", { clockStr: "none", fresh: true }); });
    await rm.page.waitForTimeout(500);
    const rmS = await rm.page.evaluate(() => { __cr.lifeTickForTest({ quiet: 9000 }); __cr.lifeFlinch(0x14); return __cr.lifeState(); });
    ok("with reduced motion the men keep still", !rmS.ok && Object.keys(rmS.on).length === 0, JSON.stringify(rmS));
    await rm.ctx.close();
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe board is alive, sees, and remembers its best moments");
  process.exit(failed ? 1 : 0);
})();
