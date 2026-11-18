/* arena-check.js — is every coach's board a place of its own?

   In node (grain.js, skins.js):
     - eight arena surfaces, each a real field (no holes, no NaN), each
       unlike the others and unlike the plain finishes;
     - each has its accent (the flowers, sprouts, petals, snowflakes),
       and the accent sits on the squares it belongs on (buttercups in
       the green, not on the chalk);
     - the lawn is mown in stripes across the whole board;
     - laid on, the accent paints in the board's own accent colour, and
       stands a little proud on the carved board;
     - every coach's board is its own arena, in colours that pop;
     - an arena travels in a share code, accent and all, and every older
       code still reads.

   In a browser:
     - the drawn board shows the arena: the lawn's stripes and its
       buttercups are really there in the pixels;
     - the carved board builds every arena without a murmur;
     - and the Studio's pattern list keeps the arenas for their coaches.

   Run: node chess/tools/arena-check.js                                     */
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
global.self = global;
const G = require("../grain.js");
const S = require("../skins.js");

const ARENAS = ["grass", "soil", "clover", "moss", "tatami", "sand", "ice", "parchment"];
const N = 256;
/* which squares a field pixel is on, and whether that square is dark (a1 dark, a8 light) */
const sqOf = (i) => { const x = i % N, y = Math.floor(i / N), f = Math.floor(x * 8 / N), r = 7 - Math.floor(y * 8 / N); return { f, r, dark: (f + r) % 2 === 0 }; };
{
  const fields = {};
  ARENAS.forEach((p) => { fields[p] = G.field(N, { pattern: p, seed: 1947 }); });
  ok("eight arena surfaces, each a real field", ARENAS.every((p) => G.PATTERNS[p] && fields[p].tone.every(isFinite) && fields[p].relief.every(isFinite) &&
     Math.max(...fields[p].tone) - Math.min(...fields[p].tone) > 0.3));
  const sig = (f) => Array.from({ length: 64 }, (_, k) => f.tone[(k * 977) % (N * N)].toFixed(2)).join(",");
  const sigs = new Set(ARENAS.map((p) => sig(fields[p])).concat(["wood", "marble", "linen", "plain"].map((p) => sig(G.field(N, { pattern: p, seed: 1947 })))));
  ok("…each unlike the others, and unlike the finishes", sigs.size === 12);
  ok("each has its accent", ARENAS.every((p) => fields[p].accent && fields[p].accent.some((a) => a > 0.9)), ARENAS.filter((p) => !fields[p].accent).join(","));
  ok("…and the finishes have none", ["wood", "marble", "linen", "plain", "inlay"].every((p) => !G.field(N, { pattern: p, seed: 1947 }).accent));
  /* where each arena's accent belongs */
  const want = { grass: true, soil: true, moss: true, ice: true, parchment: true, clover: false, sand: false };
  const wrong = [];
  Object.keys(want).forEach((p) => {
    const a = fields[p].accent;
    for (let i = 0; i < a.length; i++) if (a[i] > 0.9 && sqOf(i).dark !== want[p]) { wrong.push(p); break; }
  });
  ok("…on the squares it belongs on (buttercups in the green, not on the chalk)", !wrong.length, wrong.join(","));
  /* the lawn's stripes: two files a stripe, light and dark across the whole board */
  const lawn = fields.grass, bands = [0, 0, 0, 0], cnt = [0, 0, 0, 0];
  for (let i = 0; i < lawn.tone.length; i++) { const x = i % N; const b = Math.floor(x * 4 / N); bands[b] += lawn.tone[i]; cnt[b]++; }
  const m = bands.map((v, i) => v / cnt[i]);
  ok("the lawn is mown in stripes across the whole board", m[0] < m[1] && m[2] < m[3] && m[1] - m[0] > 0.05, m.map((v) => v.toFixed(3)).join(" "));
  /* laid on */
  const img = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(120) };
  G.apply(img, fields.grass, { x: 0, y: 0, w: 64, h: 64 }, 0.9, "colour", false, [255, 210, 63]);
  let yellow = 0; for (let i = 0; i < img.data.length; i += 4) if (img.data[i] > 200 && img.data[i + 1] > 170 && img.data[i + 2] < 120) yellow++;
  ok("laid on, the accent paints in the board's own accent colour", yellow > 3, yellow + " buttercup pixels");
  const flat = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(120) };
  G.apply(flat, fields.grass, { x: 0, y: 0, w: 64, h: 64 }, 0.9, "colour", false, null);
  let y2 = 0; for (let i = 0; i < flat.data.length; i += 4) if (flat.data[i] > 200 && flat.data[i + 1] > 170 && flat.data[i + 2] < 120) y2++;
  ok("…and without one, there is none", y2 === 0);
  const hA = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(128) }, hB = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(128) };
  G.apply(hA, fields.grass, { x: 0, y: 0, w: 64, h: 64 }, 0.9, "height");
  G.apply(hB, Object.assign({}, fields.grass, { accent: null }), { x: 0, y: 0, w: 64, h: 64 }, 0.9, "height");
  let proud = 0; for (let i = 0; i < hA.data.length; i += 4) if (hA.data[i] > hB.data[i] + 10) proud++;
  ok("…and on the carved board it stands a little proud", proud > 3, proud + " raised pixels");

  /* the coaches' boards */
  const coaches = ["acorn", "sprout", "clover", "club", "bamboo", "cactus", "pine", "mentor"];
  const homes = coaches.map((c) => S.homeOf(c));
  ok("every coach's board is its own arena, with its own accent", homes.every((h) => S.PATTERNS[h.board.pattern].arena && /^#[0-9a-f]{6}$/.test(h.board.accent)) &&
     new Set(homes.map((h) => h.board.pattern)).size === 8, homes.map((h) => h.board.pattern).join(","));
  ok("…the first a mown lawn with chalked squares", homes[0].name === "Acorn’s Lawn" && homes[0].board.pattern === "grass");
  const sat = (hx) => { const r = parseInt(hx.slice(1, 3), 16) / 255, g = parseInt(hx.slice(3, 5), 16) / 255, b = parseInt(hx.slice(5, 7), 16) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
  ok("…in colours that pop: every dark square and every accent is a real colour (sakura may be pastel), not a grey", homes.every((h) => sat(h.board.dark) > 0.3 && (sat(h.board.accent) > 0.35 || h.board.accent === "#ffffff")),
     homes.map((h) => h.board.dark + ":" + sat(h.board.dark).toFixed(2)).join(" "));
  const back = S.decode(S.encode(homes[5]));
  ok("an arena travels in a share code, accent and all", back.board.pattern === "sand" && back.board.accent === homes[5].board.accent && back.name === homes[5].name);
  const old = S.decode(S.encode(S.PRESETS[0]));
  ok("…and a code without an accent still reads, with none", old && old.board.accent === "" && old.board.pattern === S.PRESETS[0].board.pattern);
}

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe arenas add up (none was walked onto)");
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

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify({ welcomed: true, tips: { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 },
      met: { acorn: 1, sprout: 1, clover: 1, club: 1, bamboo: 1, cactus: 1, pine: 1, mentor: 1 } }));
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn); if (v) return v; await page.waitForTimeout(100); } return null; };
  const ready = async () => { await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 }); await page.waitForTimeout(300); };
  const S = () => page.evaluate(() => __cr.jrnState());
  /* every journey game here is played as White: the ladder alternates colours, so it is told who played last */
  const asWhite = () => page.evaluate(() => { const L = JSON.parse(localStorage.getItem("chessroom_ladder") || '{"v":1,"rungs":{}}'); L.lastSide = -1; localStorage.setItem("chessroom_ladder", JSON.stringify(L)); __cr.reloadLadderForTest(); });
  const play = (seq) => page.evaluate(async (q) => {
    for (const [x, src] of q) {
      const g = __cr.game, mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, "") === x.replace(/[+#]$/, ""));
      if (!mv) return "no " + x;
      __cr.commitMove(mv, src); await new Promise((r) => setTimeout(r, src === "coach" ? 300 : 80));
    }
    return "ok";
  }, seq);
  const WIN = [["e4", "local"], ["e5", "coach"], ["Bc4", "local"], ["Nc6", "coach"], ["Qh5", "local"], ["Nf6", "coach"], ["Qxf7#", "local"]];
  const LOSE = [["f3", "local"], ["e5", "coach"], ["g4", "local"], ["Qh4#", "coach"]];
  const endCup = () => until(() => !document.getElementById("endCup").classList.contains("hide") ? document.getElementById("endCupTx").textContent : null, 9000);
  try {
    await page.goto(base + "/chess/#force2d"); await ready();
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none", fresh: true }); document.querySelectorAll(".ov").forEach((o) => o.classList.add("hide")); __cr.applySkin(__cr.Skins.homeOf("acorn")); });
    await page.waitForTimeout(1200);
    const px = await page.evaluate(() => {
      const r = __cr.renderer, cv = document.getElementById("cv2"), g = cv.getContext("2d"), d = window.devicePixelRatio || 1;
      let yellow = 0, greens = [];
      for (const sq of [0x31, 0x33, 0x35, 0x37, 0x40, 0x42, 0x44, 0x46]) {     /* dark squares in the middle (a1 is dark) */
        const p = r.squareToScreen(sq), s = Math.floor(r.cell * d * 0.8);
        const im = g.getImageData(Math.round(p.x * d - s / 2), Math.round(p.y * d - s / 2), s, s).data;
        let gsum = 0;
        for (let i = 0; i < im.length; i += 4) { gsum += im[i + 1]; if (im[i] > 200 && im[i + 1] > 160 && im[i + 2] < 110) yellow++; }
        greens.push(gsum / (im.length / 4));
      }
      return { yellow, greens };
    });
    ok("the drawn board shows the lawn: buttercups really in the grass", px.yellow > 4, String(px.yellow));
    ok("…and the stripes really mown into it", Math.max(...px.greens) - Math.min(...px.greens) > 6, px.greens.map((v) => v.toFixed(0)).join(" "));
    await page.evaluate(() => __cr.openStudio()); await page.waitForTimeout(400);
    const pats = await page.evaluate(() => [...document.querySelectorAll("#stPatterns .stPick")].map((b) => b.textContent));
    ok("the Studio's list keeps the arenas for their coaches (only the one you are on shows)", pats.includes("Lawn") && !pats.includes("Frost") && !pats.includes("Desert") && pats.includes("Wood"), pats.join(","));
    await page.evaluate(() => __cr.closeStudio && __cr.closeStudio());

    /* the carved board, every arena */
    const ctx3 = await browser.newContext({ viewport: { width: 520, height: 640 } });
    await ctx3.addInitScript(() => { if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify({ welcomed: true, use3d: true, fx: "low" })); });
    const p3 = await ctx3.newPage(); const e3 = [];
    p3.on("pageerror", (e) => e3.push(e.message)); p3.on("console", (m) => { if (m.type() === "error") e3.push(m.text()); });
    await p3.goto(base + "/chess/");
    await p3.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    const kinds = [];
    for (const c of ["acorn", "sprout", "clover", "club", "bamboo", "cactus", "pine", "mentor"]) {
      await p3.evaluate((k) => __cr.applySkin(__cr.Skins.homeOf(k)), c);
      await p3.waitForTimeout(500);
      kinds.push(await p3.evaluate(() => __cr.renderer.kind));
    }
    ok("the carved board builds every arena without a murmur", kinds.every((k) => k === "3d") && e3.length === 0, kinds.join(",") + " " + e3.slice(0, 2).join(" | "));
    await ctx3.close();
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nevery coach plays in a place of its own");
  process.exit(failed ? 1 : 0);
})();
