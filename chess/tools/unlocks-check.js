/* unlocks-check.js — the collection: is there always something to win,
   is it given when it should be (and only then), and is getting it a
   moment?

   In node, the catalogue and the arithmetic (unlocks.js):
     - every item is whole: a kind, a name, a picture, a way to win it;
     - every coach gives exactly three things, one per star, the first its
       own board (the one skins.js knows) and its secret (a lesson that
       exists); every set of colours is real colours in a real finish;
       every carved set is one the room has;
     - every level up to twenty has something, and no level two things;
     - experience: playing always earns something, a win more than a draw
       more than a loss, a harder coach more, and a level is quick at
       first and a steady walk later;
     - things are given when won and only then, once, and marked new;
       a first run catches up quietly; and a stored state that has been
       tampered with comes back safe.

   In a browser, the room:
     - a fresh room shows the collection, empty, at level one;
     - beat Acorn: the card counts the experience in and levels up, and
       only after the card has had its say does a box drop, shake and
       burst open, with Acorn's board first; "Use it!" puts it on; the
       rest follow; the lobby says what is new;
     - the collection shows what is yours and how to win the rest, and a
       locked carved set in the Studio says how to win it rather than
       letting you take it;
     - a trail is laid behind your move when you have one on; a face can
       be sent across the board, and the coach answers;
     - all of it is still there after a reload, and an older room that
       had already beaten a coach finds its things waiting, quietly.

   Run: node chess/tools/unlocks-check.js                                   */
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
global.localStorage = (function () { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; })();
global.btoa = (s) => Buffer.from(s, "binary").toString("base64");
global.atob = (s) => Buffer.from(s, "base64").toString("binary");
global.self = global;
const U = require("../unlocks.js");
const Skins = require("../skins.js");
const Learn = require("../learn.js");
const Rating = require("../rating.js");

/* ---------------- node: the catalogue ---------------- */
{
  const ids = U.ITEMS.map((i) => i.id);
  ok("every item has its own id", new Set(ids).size === ids.length);
  const kinds = U.KINDS.map((k) => k.id);
  ok("every item is whole: a kind, a name, a picture, a way to win it",
     U.ITEMS.every((i) => kinds.indexOf(i.kind) >= 0 && i.name && i.emoji && i.from && U.howTo(i)),
     U.ITEMS.filter((i) => !(kinds.indexOf(i.kind) >= 0 && i.name && i.emoji)).map((i) => i.id).join(","));
  ok("every kind has something in it", kinds.every((k) => U.ITEMS.some((i) => i.kind === k)));
  ok("the coaches are the ladder's", JSON.stringify(U.COACHES) === JSON.stringify(Rating.LEVELS.map((l) => l.id)));
  const per = U.COACHES.map((c) => [0, 1, 2].map((st) => U.ITEMS.filter((i) => i.from.coach === c && i.from.star === st).map((i) => i.kind).sort().join("+")).join(" | "));
  ok("every coach gives something for each of its three stars",
     U.COACHES.every((c) => [0, 1, 2].every((st) => U.ITEMS.some((i) => i.from.coach === c && i.from.star === st))), per.join("\n      "));
  ok("…its board and its secret for the first", U.COACHES.every((c) => {
    const first = U.ITEMS.filter((i) => i.from.coach === c && i.from.star === 0);
    const b = first.find((i) => i.kind === "board"), sk = first.find((i) => i.kind === "skill");
    return b && Skins.homeOf(b.use.home) && Skins.homeOf(b.use.home).name === b.name && sk && Learn.byId(sk.use.lesson);
  }));
  ok("…its own colours for the second", U.COACHES.every((c) => U.ITEMS.some((i) => i.from.coach === c && i.from.star === 1 && i.kind === "colors")));
  const HEX = /^#[0-9a-f]{6}$/;
  ok("every set of colours is real colours in a real finish",
     U.ITEMS.filter((i) => i.kind === "colors").every((i) => { const c = U.COLORS[i.id]; return c && HEX.test(c.white) && HEX.test(c.black) && Skins.MATERIALS[c.material] && c.shine >= 0 && c.shine <= 1; }));
  ok("every carved set to win is one the room has, and the house set is everyone's",
     U.ITEMS.filter((i) => i.kind === "pieces").every((i) => Skins.PIECE_SETS[i.use.set] && i.use.set !== "classic"));
  ok("every emote pack has faces to send", U.ITEMS.filter((i) => i.kind === "emote").every((i) => i.use.emotes.length >= 3));
  const lv = U.ITEMS.filter((i) => i.from.level != null).map((i) => i.from.level);
  ok("no level gives two things, and they run to twenty", new Set(lv).size === lv.length && Math.max(...lv) === 20 && Math.min(...lv) === 2);
  let gaps = 0; for (let l = 2; l <= 20; l++) if (lv.indexOf(l) < 0) gaps++;
  ok("…with something at nearly every level", gaps <= 3, gaps + " empty levels");
}
/* ---------------- node: experience ---------------- */
{
  ok("each level costs more than the last", [1, 2, 3, 10].every((l) => U.xpToNext(l + 1) > U.xpToNext(l)));
  ok("a level is quick at first (a game or two)", U.xpToNext(1) <= 120);
  let mono = true, last = 1;
  for (let x = 0; x < 20000; x += 37) { const l = U.levelOf(x).level; if (l < last) mono = false; last = l; }
  ok("more experience is never a lower level", mono);
  const w = (r, t, rated) => U.xpFor({ mode: "coach", result: r, tier: t, rated: rated !== false }).total;
  ok("playing always earns something: a win more than a draw more than a loss", w("loss", 0) > 0 && w("win", 0) > w("draw", 0) && w("draw", 0) > w("loss", 0));
  ok("a harder coach is worth more", w("win", 7) > w("win", 0));
  ok("an unrated game counts, for less", w("win", 3, false) > 0 && w("win", 3, false) < w("win", 3));
  const big = U.xpFor({ mode: "coach", result: "win", tier: 2, rated: true, stars: 2, comeback: true, feats: 1 });
  ok("stars, a comeback and a feat each add, and say why", big.total === w("win", 2) + 80 + 50 + 30 && big.parts.length === 4, JSON.stringify(big));
  ok("two people on one screen earn too", U.xpFor({ mode: "pass", result: "played" }).total > 0);
}
/* ---------------- node: giving ---------------- */
{
  const st = U.fresh();
  ok("nothing is given for nothing", U.grant(st, { rungs: {} }, 1).length === 0);
  const lad = { rungs: { acorn: { stars: [1, 0, 0] } } };
  const got = U.grant(st, lad, 5).map((i) => i.id);
  ok("beating Acorn gives its board and its secret", got.join() === "board-acorn,skill-acorn", got.join());
  ok("…marked new", st.fresh["board-acorn"] && st.fresh["skill-acorn"]);
  ok("…and only once", U.grant(st, lad, 6).length === 0);
  U.addXp(st, 100);
  ok("level two brings its faces to send", U.grant(st, lad, 7).map((i) => i.id).join() === "emote-hello" && U.emotes(st).length === 3);
  const ch = U.addXp(st, 1000);
  ok("experience that crosses levels says how many", ch.levels >= 3 && ch.after.level === U.levelOf(st.xp).level);
  const q = U.fresh();
  ok("a first run catches up quietly: owned, marked new, nothing to reveal",
     U.grant(q, { rungs: { pine: { stars: [1, 1, 1] } } }, 1, true).length === 0 && q.owned["set-staunton"] && q.fresh["col-pine"]);
  const all = { rungs: {} }; U.COACHES.forEach((c) => { all.rungs[c] = { stars: [1, 0, 0] }; });
  ok("beating every coach makes you a Ladder Climber", U.grant(U.fresh(), all, 1).some((i) => i.id === "title-climber"));
  const bad = U.clean({ v: 1, xp: "lots", owned: { "board-acorn": 1, "evil": 1, "__proto__": 1 }, fresh: { "trail-comet": 1 }, equip: { trail: "board-acorn", burst: "<script>", title: "title-rising" } });
  ok("a tampered store comes back safe", bad.xp === 0 && !bad.owned.evil && !bad.fresh["trail-comet"] && bad.equip.trail === null && bad.equip.burst === null && bad.equip.title === null);
  ok("…and junk is a fresh start", JSON.stringify(U.clean("junk")) === JSON.stringify(U.fresh()));
}

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe collection adds up (the room was not opened)");
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
  const play = (san, src) => page.evaluate(([x, s]) => { const g = __cr.game, mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, "") === x.replace(/[+#]$/, "")); if (!mv) return false; __cr.commitMove(mv, s); return true; }, [san, src]);
  const ready = async () => { await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 }); await page.waitForTimeout(300); };
  const U2 = () => page.evaluate(() => __cr.unlState());
  try {
    await page.goto(base + "/chess/#force2d"); await ready();
    const lobby = await page.evaluate(() => ({ lv: document.getElementById("mLv").textContent, sub: document.getElementById("mCollectSub").textContent }));
    ok("a fresh room shows the collection, empty, at level one", lobby.lv === "1" && /0 of \d+ collected/.test(lobby.sub), JSON.stringify(lobby));

    /* beat Acorn */
    await page.evaluate(() => { document.getElementById("ovMenu").classList.add("hide"); __cr.startGame("coach", { humanSide: 1, skill: "acorn", clockStr: "none", fresh: true }); });
    await page.waitForTimeout(700);
    for (const [a, b] of [["e4", "e5"], ["Bc4", "Nc6"], ["Qh5", "Nf6"], ["Qxf7#"]]) { await play(a, "local"); if (b) await play(b, "coach"); await page.waitForTimeout(450); }
    const t0 = Date.now();
    await page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 8000 }).catch(() => {});
    const xp = await until(() => { const r = document.getElementById("endXp"); return !r.classList.contains("hide") && /\+\d+ XP/.test(document.getElementById("endXpNum").textContent) && document.getElementById("endXpNum").textContent !== "+0 XP" ? document.getElementById("endXpNum").textContent + " | " + document.getElementById("endXpWhy").textContent : null; }, 6000);
    ok("the card counts the experience in, and says what for", xp && /A win/.test(xp), xp);
    const early = await page.evaluate(() => document.getElementById("ovUnlock").classList.contains("hide"));
    const lvl = await until(() => { const u = document.getElementById("endXpUp"); return u && !u.classList.contains("hide") ? u.textContent + " " + document.getElementById("endXpLv").textContent : null; }, 6000);
    ok("…and levels up on the card", lvl && /LEVEL UP/.test(lvl) && +lvl.split(" ").pop() >= 2, lvl);
    const shown = await until(() => !document.getElementById("ovUnlock").classList.contains("hide") ? __cr.unlQueue().showing : null, 9000);
    ok("only after the card has had its say does a box drop", early && shown && Date.now() - t0 > 4500, "after " + (Date.now() - t0) + "ms");
    ok("…and the first thing in it is Acorn's board", shown === "board-acorn", shown);
    const burst = await until(() => document.getElementById("ovUnlock").classList.contains("burst") ? document.getElementById("ulName").textContent : null, 3000);
    ok("…which shakes and bursts open, named", burst === Skins.homeOf("acorn").name, burst);
    await page.evaluate(() => document.getElementById("ulUse").click()); await page.waitForTimeout(300);
    ok("\"Use it!\" puts it on", await page.evaluate(() => __cr.skin.name) === Skins.homeOf("acorn").name);
    const next = await until(() => !document.getElementById("ovUnlock").classList.contains("hide") && __cr.unlQueue().showing, 3000);
    ok("…and the rest follow, one box at a time", next === "skill-acorn", String(next));
    for (let i = 0; i < 8; i++) { await page.evaluate(() => { if (!document.getElementById("ovUnlock").classList.contains("hide")) document.getElementById("ulNext").click(); }); await page.waitForTimeout(700); }
    let st = await U2();
    ok("everything won is kept", ["board-acorn", "skill-acorn", "emote-hello"].every((k) => st.owned[k]) && st.xp > 100, Object.keys(st.owned).join(","));
    await page.evaluate(() => { document.getElementById("ovEnd").classList.add("hide"); __cr.showMenu(); }); await page.waitForTimeout(400);
    const lob2 = await page.evaluate(() => ({ lv: +document.getElementById("mLv").textContent, sub: document.getElementById("mCollectSub").textContent }));
    ok("the lobby shows your level and what you have", lob2.lv >= 2 && /[1-9]\d* of \d+ collected/.test(lob2.sub), JSON.stringify(lob2));

    /* the collection */
    await page.evaluate(() => __cr.openCollection("pieces")); await page.waitForTimeout(300);
    const pieces = await page.evaluate(() => [...document.querySelectorAll("#coGrid .coCard")].map((c) => c.className + "|" + c.querySelector(".coHow").textContent));
    ok("the collection shows what is still to win, and how", pieces.length === 3 && pieces.every((p) => /locked/.test(p) && /Beat/.test(p)), pieces.join(" / "));
    await page.evaluate(() => __cr.openCollection("trail")); await page.waitForTimeout(200);
    const trails = await page.evaluate(() => [...document.querySelectorAll("#coGrid .coCard")].map((c) => c.className));
    ok("…and what is yours", trails.some((c) => /own/.test(c)) || (await U2()).xp < 240);
    await page.evaluate(() => document.getElementById("coClose").click());
    /* a carved set is won, not picked */
    await page.evaluate(() => { document.getElementById("ovMenu").classList.add("hide"); __cr.openStudio(); }); await page.waitForTimeout(300);
    const set0 = await page.evaluate(() => __cr.skin.pieces.set);
    await page.evaluate(() => { const b = [...document.querySelectorAll("#stSets .stPick")].find((x) => /Staunton/i.test(x.textContent)); if (b) b.click(); });
    await page.waitForTimeout(200);
    const said = await page.evaluate(() => document.getElementById("toast").textContent);
    ok("a locked carved set in the Studio says how to win it, and stays locked", (await page.evaluate(() => __cr.skin.pieces.set)) === set0 && /Beat Pine/.test(said), said);
    await page.evaluate(() => document.getElementById("stClose").click());

    /* in play: a trail, and a face sent */
    await page.evaluate(() => __cr.unlGiveXpForTest(400)); await page.waitForTimeout(200);
    for (let i = 0; i < 6; i++) { await page.evaluate(() => { if (!document.getElementById("ovUnlock").classList.contains("hide")) document.getElementById("ulNext").click(); }); await page.waitForTimeout(500); }
    st = await U2();
    ok("experience from anywhere brings the next level's things", st.owned["trail-sparkle"], JSON.stringify(Object.keys(st.owned)));
    await page.evaluate(() => { __cr.openCollection("trail"); const i = Unlocks.ITEMS.filter((x) => x.kind === "trail").findIndex((x) => x.id === "trail-sparkle"); document.querySelectorAll("#coGrid .coCard")[i].click(); document.getElementById("ovCollect").classList.add("hide"); });
    ok("a trail can be put on", (await U2()).equip.trail === "trail-sparkle");
    await page.evaluate(() => { document.getElementById("ovMenu").classList.add("hide"); __cr.startGame("coach", { humanSide: 1, skill: "sprout", clockStr: "none", fresh: true }); });
    await page.waitForTimeout(600);
    /* how many particles a trail makes is the effects layer's business
       (it thins everything on a slow machine); that one is laid, and
       laid by your move, is this one's */
    await page.evaluate(() => { window.__trails = []; const o = Fx.trail; Fx.trail = function (a, b, opt) { const n = o.apply(this, arguments); window.__trails.push([a, b, opt.style, n]); return n; }; });
    await play("e4", "local"); await page.waitForTimeout(120);
    const laid = await page.evaluate(() => window.__trails);
    ok("…and your piece leaves it behind as it moves", laid.length === 1 && laid[0][0] === 0x14 && laid[0][1] === 0x34 && laid[0][2] === "sparkle" && laid[0][3] > 0, JSON.stringify(laid));
    await play("e5", "coach"); await page.waitForTimeout(120);
    ok("…and the coach's moves leave none", (await page.evaluate(() => window.__trails.length)) === 1);
    const btn = await page.evaluate(() => !document.getElementById("emoteBtn").classList.contains("hide"));
    ok("with faces won, there is a button to send one", btn);
    await page.evaluate(() => document.getElementById("emoteBtn").click()); await page.waitForTimeout(300);
    const fan = await page.evaluate(() => document.querySelectorAll("#emoteFan .emPick").length);
    await page.evaluate(() => document.querySelector("#emoteFan .emPick").click());
    const sent = await until(() => !!document.querySelector(".emoteWrap .emote.mine"), 1000);
    const answer = await until(() => !!document.querySelector("#oppFaceWrap .emote"), 2000);
    ok("…it goes across the board, and the coach answers", fan >= 3 && sent && answer, JSON.stringify({ fan, sent, answer }));

    /* kept */
    await page.reload(); await ready();
    st = await U2();
    ok("all of it is still there after a reload", st.owned["board-acorn"] && st.owned["trail-sparkle"] && st.equip.trail === "trail-sparkle");
    /* an older room */
    await page.evaluate(() => { localStorage.removeItem("chessroom_unlocks"); localStorage.setItem("chessroom_ladder", JSON.stringify({ v: 1, rungs: { cactus: { w: 1, d: 0, l: 0, stars: [1, 1, 0] } }, lastSide: -1, day: "", days: 0, bestDays: 0 })); });
    await page.reload(); await ready(); await page.waitForTimeout(800);
    st = await U2();
    const quiet = await page.evaluate(() => document.getElementById("ovUnlock").classList.contains("hide"));
    ok("an older room that had beaten a coach finds its things waiting, quietly", st.owned["board-cactus"] && st.owned["col-cactus"] && st.fresh["col-cactus"] && quiet && st.migrated);
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthere is always something to win, it is given when it is won, and getting it is a moment");
  process.exit(failed ? 1 : 0);
})();
