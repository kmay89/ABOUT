/* ink-check.js — dev-only. Can you draw on the board, and is it still
   there when you come back?

   The pen is two things that can each go quietly wrong. The paper
   (ink.js) has to keep a drawing with the position it was made on, rub
   it out when it is drawn again, and survive a save that has been
   hand-edited, half-written or written by somebody hostile — dropping a
   bad mark and never the game it came with. The gesture has to be a
   pen and only a pen: a right-drag or a held finger that moved a man,
   lifted one, or left one in the hand would be worse than no pen.

   So the Node half fuzzes the paper, and the browser half draws with a
   real mouse and a real (CDP) finger, on a desk-sized and a phone-sized
   screen, on the carved board and the flat one, and reads back what the
   room recorded — never anything it was told.

   Needs `playwright-core` for the browser half; without it, or without
   chromium, that half says so and is skipped.

   Run: node chess/tools/ink-check.js                                    */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const Ink = require("../ink.js");

let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};
const SQ = (name) => (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);

/* ---------- the paper ---------- */
{
  const b = Ink.create();
  ok("a shape drawn is kept", Ink.toggle(b, 0, { from: SQ("e2"), to: SQ("e4"), t: 0 }) === "added" &&
     JSON.stringify(Ink.at(b, 0)) === JSON.stringify([{ from: SQ("e2"), to: SQ("e4"), t: 0 }]));
  ok("…on its own position only", Ink.at(b, 1).length === 0);
  ok("the same squares with the other meaning recolour it",
     Ink.toggle(b, 0, { from: SQ("e2"), to: SQ("e4"), t: 1 }) === "recoloured" && Ink.at(b, 0).length === 1 && Ink.at(b, 0)[0].t === 1);
  ok("drawing it again rubs it out", Ink.toggle(b, 0, { from: SQ("e2"), to: SQ("e4"), t: 1 }) === "removed" && Ink.at(b, 0).length === 0);
  ok("a ring is a shape whose ends meet", Ink.toggle(b, 3, { from: SQ("d4"), t: 0 }) === "added" && Ink.at(b, 3)[0].to === SQ("d4"));
  ok("a copy handed out cannot change what is kept", (() => { const c = Ink.at(b, 3); c[0].t = 1; return Ink.at(b, 3)[0].t === 0; })());

  const full = Ink.create();
  for (let i = 0; i < 16; i++) Ink.toggle(full, 0, { from: i < 8 ? i : 0x10 + i - 8, to: 0x70, t: 0 });
  ok("a position holds sixteen shapes", Ink.at(full, 0).length === 16);
  ok("…and refuses a seventeenth, without losing any", Ink.toggle(full, 0, { from: 0x33, to: 0x44, t: 0 }) === "full" && Ink.at(full, 0).length === 16);
  const many = Ink.create();
  for (let p = 0; p < 4; p++) for (let i = 0; i < 16; i++) Ink.toggle(many, p, { from: i < 8 ? i : 0x10 + i - 8, to: 0x70 + (p & 7), t: 0 });
  ok("sixty-four in all", Ink.count(many) === 64);
  Ink.toggle(many, 5, { from: SQ("a1"), to: SQ("h8"), t: 1 });
  ok("…and the sixty-fifth pushes out the oldest, not the newest",
     Ink.count(many) === 64 && Ink.at(many, 0).length === 15 && Ink.at(many, 5).length === 1);

  const g = Ink.create();
  Ink.toggle(g, 0, { from: SQ("e2"), to: SQ("e4"), t: 0 });
  Ink.toggle(g, 4, { from: SQ("g8"), to: SQ("f6"), t: 1 });
  Ink.toggle(g, 9, { from: SQ("d5"), t: 0 });
  Ink.dropAfter(g, 4);
  ok("a take-back takes the drawings of the positions it undid", Ink.at(g, 9).length === 0 && Ink.at(g, 4).length === 1 && Ink.at(g, 0).length === 1);
  Ink.clear(g, 4);
  ok("clearing a position clears that position only", Ink.at(g, 4).length === 0 && Ink.at(g, 0).length === 1);

  /* the save */
  const s = Ink.create();
  Ink.toggle(s, 2, { from: SQ("c4"), to: SQ("f7"), t: 0 });
  Ink.toggle(s, 0, { from: SQ("e4"), t: 1 });
  Ink.toggle(s, 2, { from: SQ("d8"), to: SQ("h4"), t: 1 });
  const packed = Ink.pack(s);
  const back = Ink.unpack(JSON.parse(JSON.stringify(packed)), 10);
  ok("pack → unpack gives the same drawing back, in the same order",
     JSON.stringify(Ink.pack(back)) === JSON.stringify(packed) && JSON.stringify(Ink.at(back, 2)) === JSON.stringify(Ink.at(s, 2)));
  const junk = [[0, 0x08, 0x10, 0], [0, 0x14, 0x34, 7], [99, 0x14, 0x34, 0], ["1", 0x14, 0x34, 0], [[1], 0x14, 0x34, 0],
                [1, 0x14, 0x34], [1, 20.5, 0x34, 0], null, "e2e4", { pos: 1 }, [-1, 0x14, 0x34, 0], [2, 0x14, 0x34, 1]];
  let threw = false, got = null;
  try { got = Ink.unpack(junk, 10); } catch (e) { threw = true; }
  ok("junk in a save is dropped shape by shape, never the whole save",
     !threw && Ink.count(got) === 1 && Ink.at(got, 2)[0].t === 1, got && JSON.stringify(Ink.pack(got)));
  let quiet = true;
  for (const bad of [null, undefined, "x", 7, {}, [[[]]], [new Array(5000).fill([0, 0x14, 0x34, 0])]]) {
    try { Ink.unpack(bad, 10); } catch (e) { quiet = false; }
  }
  ok("…and nothing a save can hold makes it throw", quiet);
  ok("a position past the end of the game is not believed", Ink.count(Ink.unpack([[11, 0x14, 0x34, 0]], 10)) === 0);

  /* what you meant */
  const board = new Int8Array(128);
  board[SQ("e2")] = 1; board[SQ("g8")] = -2;
  ok("a stroke from their man is a threat", Ink.toneFor(board, SQ("g8"), 1) === 1 && Ink.toneFor(board, SQ("e2"), -1) === 1);
  ok("one from your own man, or from an empty square, is your plan",
     Ink.toneFor(board, SQ("e2"), 1) === 0 && Ink.toneFor(board, SQ("e4"), 1) === 0 && Ink.toneFor(board, SQ("g8"), -1) === 0);

  /* as words */
  const words = "e2e4 d1h5! f7";
  ok("a drawing reads as the squares a player writes", Ink.encode(Ink.decode(words)) === words, Ink.encode(Ink.decode(words)));
  let seed = 11, round = true;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const nm = () => "abcdefgh".charAt(Math.floor(rnd() * 8)) + (1 + Math.floor(rnd() * 8));
  for (let i = 0; i < 500; i++) {
    const seen = new Set(), toks = [];
    const n = 1 + Math.floor(rnd() * 8);
    for (let k = 0; k < n; k++) {
      const a = nm(), b = rnd() < 0.3 ? "" : nm(), key = a + (b === a ? "" : b);
      if (seen.has(key)) continue;
      seen.add(key);
      toks.push(key + (rnd() < 0.4 ? "!" : ""));
    }
    const str = toks.join(" ");
    if (Ink.encode(Ink.decode(str)) !== str) { round = false; console.log("      " + str + " → " + Ink.encode(Ink.decode(str))); break; }
  }
  ok("encode(decode(x)) === x over 500 random drawings", round);
  let hostile = true;
  try {
    const h = Ink.decode("<script>alert(1)</script> e2e4 " + "z9z9! ".repeat(2000) + " h1h8");
    hostile = Array.isArray(h) && h.length <= Ink.PER_POS && h.every((x) => (x.from & 0x88) === 0 && (x.to & 0x88) === 0);
  } catch (e) { hostile = false; }
  ok("a 10 KB hostile string decodes to a few honest squares, or none", hostile);
  ok("…and anything that is not a string decodes to nothing", Ink.decode(null).length === 0 && Ink.decode(42).length === 0);
}

/* ---------- the browser ---------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log((CHROME ? "playwright-core is not installed" : "no chromium on this machine") + " — skipping the browser half.");
  console.log(failed ? "\nFAILED: " + failed : "\nthe pen keeps what you drew (paper only)");
  process.exit(failed ? 1 : 0);
}

const ROOT = path.join(__dirname, "..", "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css" };
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
/* where a square is on the screen: the middle of everywhere the board
   itself says is that square (men and all) */
const WHERE = `(sq) => {
  const R = __cr.renderer, st = document.getElementById('stage');
  const w = st.clientWidth, h = st.clientHeight;
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
    if (R.screenToSquare(x, y) === sq) { sx += x; sy += y; n++; }
  }
  return n ? { x: sx / n, y: sy / n } : null;
}`;
const PLAY = `(san) => {
  const g = __cr.game;
  const mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]/, "") === san);
  if (!mv) return false; __cr.commitMove(mv, "local"); return true;
}`;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    for (const [size, dim] of [["desk", "3d"], ["desk", "2d"], ["phone", "3d"], ["phone", "2d"]]) {
      const phone = size === "phone";
      const tag = size + " " + dim + ": ";
      const ctx = await browser.newContext(phone
        ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
        : { viewport: { width: 1280, height: 820 } });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push("" + e.message));
      page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
      await page.goto(base + "/chess/?v=0", { timeout: 120000 });
      await page.evaluate((d) => { localStorage.clear(); localStorage.setItem("chessroom_prefs",
        JSON.stringify({ use3d: d === "3d", scene: "park", fx: "low", sawPen: true })); }, dim);
      await page.goto(base + "/chess/?v=1", { timeout: 120000 });
      await page.waitForFunction(() => document.getElementById("splash").classList.contains("gone"), null, { timeout: 60000 });
      await page.evaluate(() => { document.querySelectorAll(".ov").forEach((o) => o.classList.add("hide")); __cr.startGame("pass", { clockStr: "none" }); });
      await page.waitForTimeout(2600);
      ok(tag + "the " + dim + " board is the one being drawn", (await page.evaluate(() => __cr.renderer.kind)) === dim);
      const box = await page.locator("#stage").boundingBox();
      const at = async (name) => {
        const p = await page.evaluate(([f, s]) => eval(f)(s), [WHERE, SQ(name)]);
        if (!p) throw new Error("cannot find " + name + " on the screen");
        return { x: box.x + p.x, y: box.y + p.y };
      };
      const inkAt = (pos) => page.evaluate((p) => __cr.inkForTest(p), pos);
      const state = () => page.evaluate(() => ({ played: __cr.game.played.length, sel: __cr.renderer.hi.selected,
        ink: __cr.renderer.ink.length, sketch: !!__cr.renderer.sketch }));
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

      if (!phone) {
        await page.evaluate(() => { window.__menus = []; document.addEventListener("contextmenu", (e) => window.__menus.push(e.defaultPrevented)); });
        const rdrag = async (a, b, mods) => {
          const p = await at(a), q = await at(b);
          for (const m of mods || []) await page.keyboard.down(m);
          await page.mouse.move(p.x, p.y);
          await page.mouse.down({ button: "right" });
          await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 });
          await page.mouse.move(q.x, q.y, { steps: 4 });
          await page.mouse.up({ button: "right" });
          for (const m of mods || []) await page.keyboard.up(m);
          await page.waitForTimeout(120);
        };
        await rdrag("e2", "e4");
        let st = await state();
        ok(tag + "a right-drag from e2 to e4 draws one arrow, your plan",
           same(await inkAt(0), [{ from: SQ("e2"), to: SQ("e4"), t: 0 }]), JSON.stringify(await inkAt(0)));
        ok(tag + "…and plays nothing, lifts nothing", st.played === 0 && st.sel === -1 && !st.sketch, JSON.stringify(st));
        const menus = await page.evaluate(() => window.__menus);
        ok(tag + "…and no menu opens over the board", menus.length > 0 && menus.every(Boolean), JSON.stringify(menus));
        await rdrag("g8", "f6");
        ok(tag + "a stroke from their knight is a threat",
           (await inkAt(0)).some((s) => s.from === SQ("g8") && s.to === SQ("f6") && s.t === 1));
        await rdrag("g8", "f6");
        ok(tag + "…and the same stroke again rubs it out", !(await inkAt(0)).some((s) => s.from === SQ("g8")));
        await rdrag("d2", "d4", ["Shift"]);
        ok(tag + "Shift makes any stroke a threat", (await inkAt(0)).some((s) => s.from === SQ("d2") && s.t === 1));
        const d5 = await at("d5");
        await page.mouse.click(d5.x, d5.y, { button: "right" });
        await page.waitForTimeout(120);
        ok(tag + "a right-click rings the square", (await inkAt(0)).some((s) => s.from === SQ("d5") && s.to === SQ("d5")));
        ok(tag + "the board draws all three", (await state()).ink === 3);
        ok(tag + "the pill counts them", (await page.textContent("#inkCount")) === "3" && await page.isVisible("#inkPill"));
        const e5 = await at("e5");
        await page.mouse.click(e5.x, e5.y);
        await page.waitForTimeout(150);
        ok(tag + "a click on an empty square with nothing in hand clears them", (await inkAt(0)).length === 0 && !(await page.isVisible("#inkPill")));
        st = await state();
        ok(tag + "…and still plays nothing", st.played === 0 && st.sel === -1, JSON.stringify(st));
      } else {
        const cdp = await ctx.newCDPSession(page);
        const touch = async (type, p) => cdp.send("Input.dispatchTouchEvent",
          { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] : [] });
        const hold = await page.evaluate(() => __cr.PEN_HOLD_MS);
        const g1 = await at("g1"), f3 = await at("f3");
        await touch("touchStart", g1);
        await page.waitForTimeout(hold + 180);
        const mid = { x: (g1.x + f3.x) / 2, y: (g1.y + f3.y) / 2 };
        await touch("touchMove", mid);
        await page.waitForTimeout(40);
        await touch("touchMove", f3);
        await page.waitForTimeout(40);
        let st = await state();
        ok(tag + "a held finger draws: the stroke follows it", st.sketch === true, JSON.stringify(st));
        await touch("touchEnd");
        await page.waitForTimeout(150);
        st = await state();
        ok(tag + "hold g1 and drag to f3: one arrow, your plan",
           same(await inkAt(0), [{ from: SQ("g1"), to: SQ("f3"), t: 0 }]), JSON.stringify(await inkAt(0)));
        ok(tag + "…no move, no man left in the hand", st.played === 0 && st.sel === -1 && !st.sketch, JSON.stringify(st));
        ok(tag + "…and the knight is still on g1", await page.evaluate((s) => __cr.game.board[s] === 2, SQ("g1")));
        const e2 = await at("e2");
        /* a quick tap, however slowly this machine happens to deliver it */
        await page.evaluate(() => __cr.penHoldForTest(5000));
        await touch("touchStart", e2);
        await page.waitForTimeout(200);
        await touch("touchEnd");
        await page.waitForTimeout(150);
        ok(tag + "a short touch on a pawn still picks it up", (await state()).sel === SQ("e2"));
        await touch("touchStart", e2);
        await page.waitForTimeout(120);
        await touch("touchEnd");
        await page.waitForTimeout(150);
        ok(tag + "…and puts it down again", (await state()).sel === -1);
        await page.evaluate((ms) => __cr.penHoldForTest(ms), hold);
        ok(tag + "the pill counts what is drawn here", (await page.textContent("#inkCount")) === "1" && await page.isVisible("#inkPill"));
        await page.tap("#inkClear");
        await page.waitForTimeout(150);
        ok(tag + "…and its Clear takes it away", (await inkAt(0)).length === 0 && !(await page.isVisible("#inkPill")));
      }

      /* the drawing belongs to the position */
      await page.evaluate(([f]) => eval(f)("e4"), [PLAY]);
      await page.waitForTimeout(900);
      await page.evaluate(() => __cr.penForTest(0x63, 0x43, 1));        /* d7–d5, a threat, on the position after 1.e4 */
      ok(tag + "a drawing on the position after 1.e4 is drawn", (await state()).ink === 1);
      await page.evaluate(([f]) => eval(f)("e5"), [PLAY]);
      await page.waitForTimeout(900);
      ok(tag + "play on, and the live board is clean", (await state()).ink === 0 && (await inkAt(1)).length === 1);
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(200);
      ok(tag + "step back, and it is exactly where you left it",
         (await state()).ink === 1 && (await page.evaluate(() => __cr.posIndexForTest())) === 1);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(200);
      ok(tag + "…and gone again on the live board", (await state()).ink === 0 && (await page.evaluate(() => __cr.posIndexForTest())) === 2);

      /* reload: the save carries it */
      await page.reload({ timeout: 120000 });
      await page.waitForFunction(() => document.getElementById("splash").classList.contains("gone"), null, { timeout: 60000 });
      await page.waitForTimeout(400);
      await page.evaluate(() => document.getElementById("mResume").click());
      await page.waitForTimeout(1200);
      ok(tag + "reload, and the resumed game still has it", same(await inkAt(1), [{ from: 0x63, to: 0x43, t: 1 }]) &&
         (await page.evaluate(() => __cr.game.played.length)) === 2, JSON.stringify(await inkAt(1)));

      /* a board with a drawing on it sleeps like any other still board */
      await page.evaluate(() => __cr.penForTest(0x06, 0x25, 0));
      await page.evaluate(() => document.getElementById("toast").classList.remove("show"));
      await page.waitForTimeout(3200);
      const asleep = await page.evaluate(() => { const r = __cr.renderer; r.dirty = true; r.frame(); return r.frame(); });
      ok(tag + "a drawn-on board sleeps", asleep === false && (await state()).ink === 1, String(asleep));

      /* a take-back takes the drawings of the positions it undid */
      await page.evaluate(() => __cr.undoPlyForTest(1));
      await page.waitForTimeout(300);
      ok(tag + "a take-back forgets the drawing on the position it undid", (await inkAt(2)).length === 0 && (await inkAt(1)).length === 1);
      ok(tag + "nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
      await ctx.close();
    }
  } catch (e) {
    ok("the ink check ran", false, e.stack || e.message);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failed ? "\nFAILED: " + failed + " problem" + (failed === 1 ? "" : "s") : "\nthe pen draws, keeps it with the position, and lets the board sleep");
  process.exit(failed ? 1 : 0);
})();
