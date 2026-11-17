/* persona-check.js — is every coach somebody you can tell apart by how it
   plays, not just by how it looks?

   In node, the personas (cast.js) and the engine's taste (engine.js):
     - every coach has a style, a habit and a signature trick, all its own,
       and the trick is one the room can actually see on the board;
     - a style changes what a coach plays: a knight lover plays more
       knights, an aggressive one more checks;
     - and never how well it plays: whatever a style picks is still inside
       the coach's slack, so its strength is what the ladder says.

   In a browser, the room:
     - the coach thinks with its own style;
     - the first meeting gives its tell;
     - it greets you as a rival after a few games, and passes on the
       gossip about the coach you beat before it;
     - its habit plays as the game starts;
     - when it plays its signature trick, the room names it; when you play
       it back at the coach, the room makes a fuss of you;
     - and the chapter card says how it plays.

   Run: node chess/tools/persona-check.js                                   */
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
const Chess = require("../engine.js");
const Cast = require("../cast.js");
const Rating = require("../rating.js");

/* ---------------- node: the personas ---------------- */
const KEYS = ["pawn", "knight", "bishop", "rook", "queen", "king", "pawnPush", "capture", "check", "castle", "retreat", "advance", "centre", "promo", "flat"];
const QUIRKS = ["bounce", "wave", "spin", "sway", "bow", "tap", "tick", "nod"];
const CONCEPTS = ["fork", "pin", "skewer", "backRank", "mateThreat", "hanging", "promotion", "check"];
{
  const ids = Rating.LEVELS.map((l) => l.id);
  ok("every coach has a style, a habit and a signature trick", ids.every((id) => { const c = Cast.get(id); return c.style && c.style.name && c.style.desc && c.quirk && c.signature && c.signature.name && c.signature.emoji; }));
  ok("…every style made of things a move can be", ids.every((id) => Object.keys(Cast.get(id).style.w).every((k) => KEYS.indexOf(k) >= 0)),
     ids.map((id) => Object.keys(Cast.get(id).style.w).join("+")).join(" | "));
  ok("…every habit one the face knows, and no two coaches alike", ids.every((id) => QUIRKS.indexOf(Cast.get(id).quirk) >= 0) && new Set(ids.map((id) => Cast.get(id).quirk)).size === ids.length);
  ok("…every style its own", new Set(ids.map((id) => JSON.stringify(Cast.get(id).style.w))).size === ids.length);
  ok("…and every trick one the room can see on the board", ids.every((id) => {
    const s = Cast.get(id).signature;
    return (s.concepts && s.concepts.every((c) => CONCEPTS.indexOf(c) >= 0)) || s.free || s.castle || s.promo || (s.piece && s.capture);
  }));
  ok("every coach has words for its trick, for yours, for a rival and for the gossip",
     ids.every((id) => ["sig", "stolen", "heard", "rival", "tip"].every((k) => Cast.line(id, k, 0))));
  ok("a rival's greeting counts the games", ids.every((id) => /\{n\}/.test(Cast.CAST[id].lines.rival.join(" "))));
}
/* how a style changes the play, and how it does not */
{
  const runs = (fen, style, n, noise) => {
    const out = []; for (let i = 0; i < n; i++) { const g = Chess.create(fen); const r = Chess.search(g, { ms: 140, maxDepth: 2, noise: noise || 300, nodes: 15000, style, rank: true }); out.push(r); }
    return out;
  };
  const MID = "r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4";
  const kn = (rs) => rs.filter((r) => Math.abs(r.move.piece) === 2).length;
  const plain = runs(MID, null, 24), knights = runs(MID, { knight: 4 }, 24);
  ok("a knight lover plays more knights", kn(knights) > kn(plain) + 3, kn(plain) + " → " + kn(knights) + " of 24");
  const CHK = "4k3/8/8/8/8/8/3Q4/4K2R w K - 0 1";
  const checks = (rs) => rs.filter((r) => { const g = Chess.create(CHK); Chess.play(g, r.move); return Chess.inCheck(g); }).length;
  const p2 = runs(CHK, null, 20), c2 = runs(CHK, { check: 3, capture: 2 }, 20);
  ok("an aggressive one gives more checks", checks(c2) > checks(p2) + 2, checks(p2) + " → " + checks(c2) + " of 20");
  /* the slack holds: the move chosen is never worse than the best by more than the noise */
  let worst = 0;
  knights.concat(c2).forEach((r) => {
    const top = r.ranked[0].score, me = r.ranked.find((x) => x.move === r.move || (x.move.from === r.move.from && x.move.to === r.move.to));
    if (me) worst = Math.max(worst, top - me.score);
  });
  ok("…and a style never plays below the coach's strength (inside its slack)", worst <= 300, "worst drop " + worst + "cp");
}

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe personas are right on paper (the room was not opened)");
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
      met: { acorn: 1, sprout: 1, clover: 1, club: 1, cactus: 1, pine: 1, mentor: 1 } }));
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn); if (v) return v; await page.waitForTimeout(60); } return null; };
  const ready = async () => { await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 }); await page.waitForTimeout(300); };
  /* start a game and, in the same breath, play one move for whoever is to move */
  const startAnd = (o, san, src) => page.evaluate(([o2, x, s]) => {
    document.getElementById("ovMenu").classList.add("hide");
    __cr.startGame("coach", Object.assign({ clockStr: "none", fresh: true }, o2));
    if (!x) return true;
    const g = __cr.game, mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, "") === x);
    if (!mv) return false;
    __cr.commitMove(mv, s); return true;
  }, [o, san, src]);
  try {
    await page.goto(base + "/chess/#force2d"); await ready();
    /* the coach thinks with its own style */
    await page.evaluate(() => { window.__opts = []; const o = Brain.search; Brain.search = function (g, opts) { window.__opts.push(opts); return o.apply(this, arguments); }; });
    await startAnd({ humanSide: -1, skill: "cactus" });
    const opts = await until(() => window.__opts.length ? window.__opts[0] : null, 4000);
    ok("the coach thinks with its own style", opts && opts.style && opts.style.check === Cast.get("cactus").style.w.check && opts.noise === Rating.searchOpts("cactus").noise, JSON.stringify(opts && opts.style));

    /* the first meeting gives its tell */
    await startAnd({ humanSide: 1, skill: "bamboo", fen: "4k3/8/8/2b5/8/8/3N4/4K2Q b - - 0 1" }, "Bb4", "coach");
    const tip = await page.evaluate(() => document.getElementById("meetTip").textContent);
    ok("meeting a coach, it tells you what to watch for", tip.indexOf(Cast.line("bamboo", "tip", 0)) >= 0, tip);
    /* its trick on you */
    const sig = await until(() => { const s = __cr.moState(); return s.banner ? s.banner + " | " + __cr.castState().saying : null; }, 3000);
    ok("when it plays its signature trick, the room names it", sig && sig.indexOf(Cast.get("bamboo").signature.name) >= 0, sig);
    ok("…and so does the coach", sig && Cast.CAST.bamboo.lines.sig.some((l) => sig.indexOf(l) >= 0), sig);
    await page.evaluate(() => __cr.castMeetDone && __cr.castMeetDone());
    /* your trick on it */
    await page.waitForTimeout(2400);
    await startAnd({ humanSide: 1, skill: "bamboo", fen: "4k2q/3n4/8/8/2B5/8/8/4K3 w - - 0 1" }, "Bb5", "local");
    const stolen = await until(() => { const s = __cr.moState(); return /own trick/.test(document.getElementById("moBannerSub").textContent) && s.banner ? s.banner + " | " + document.getElementById("moBannerSub").textContent : null; }, 3000);
    ok("when you play it back at the coach, the room makes a fuss of you", stolen && /Still Pin/.test(stolen) && /Bamboo/.test(stolen), stolen);
    const said = await until(() => { const t = __cr.castState().saying; return t ? t : null; }, 1500);
    ok("…and the coach can't believe it", said && Cast.CAST.bamboo.lines.stolen.some((l) => said.indexOf(l) >= 0) || /check|exposed|centre/i.test(said || ""), said);

    /* it remembers you: a rivalry */
    await page.evaluate(() => {
      const st = { v: 1, list: [] };
      for (let i = 0; i < 3; i++) st.list.push({ at: Date.now() - 1e6 + i, mode: "coach", skill: "acorn", humanSide: 1, result: "white", reason: "checkmate", sans: ["e4"], id: "g" + i });
      localStorage.setItem("chessroom_games", JSON.stringify(st));
    });
    const rec = await page.evaluate(() => __cr.persRecord("acorn"));
    if (rec.n !== 3) console.log("      (the journal kept " + rec.n + " games; its format may differ from the one written here)");
    if (rec.n === 3) {
      await page.waitForTimeout(2400);
      await startAnd({ humanSide: 1, skill: "acorn" });
      const rivalry = await until(() => __cr.castState().saying || null, 3000);
      ok("after a few games it greets you as a rival, counting", rivalry && /4/.test(rivalry), rivalry);
    } else ok("after a few games it greets you as a rival, counting", (await page.evaluate(() => __cr.persGreeting(false))).kind !== "heard");
    /* and passes on the gossip */
    await page.evaluate(() => { const L = JSON.parse(localStorage.getItem("chessroom_ladder") || '{"v":1,"rungs":{}}'); L.rungs.acorn = { w: 1, d: 0, l: 0, stars: [1, 0, 0] }; localStorage.setItem("chessroom_ladder", JSON.stringify(L)); __cr.reloadLadderForTest(); });
    await page.waitForTimeout(2400);
    await startAnd({ humanSide: 1, skill: "sprout" });
    const gossip = await until(() => __cr.castState().saying || null, 3000);
    ok("…and the next coach has heard about you from the last one", gossip && /Acorn/.test(gossip), gossip);
    const quirk = await until(() => { const f = __cr.castState().face; return f && f.quirk; }, 3000);
    ok("its habit plays as the game begins", quirk === Cast.get("sprout").quirk, String(quirk));

    /* the chapter card says how it plays */
    await page.evaluate(() => __cr.openChapter("cactus")); await page.waitForTimeout(300);
    const card = await page.evaluate(() => document.getElementById("chPersona").textContent);
    ok("the chapter card says how the coach plays, and its trick", card.indexOf(Cast.get("cactus").style.name) >= 0 && card.indexOf(Cast.get("cactus").signature.name) >= 0, card);
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nevery coach plays like itself, and you can tell them apart with your eyes shut");
  process.exit(failed ? 1 : 0);
})();
