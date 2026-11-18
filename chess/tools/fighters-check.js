/* fighters-check.js — dev-only. Does every coach have a fighter card, and
   is it fun rather than a test?

   In node, the cards themselves (cast.js): every coach has four bars out
   of five, a strength and a weak spot; the bars rise along the ladder and
   each coach has a shape of its own (Cactus is the attacker, Fern and Oak
   the defenders, Oak the endgame master); the words are short, kind (a
   weak spot is a way to have fun beating it, never a worry), and say
   nothing about the board in front of you.

   In a real browser: meeting a coach brings its card, bars and weak spot;
   a game with a coach you know opens with a "versus" banner that never
   takes a touch, goes at any touch, lasts as long as your pace likes, and
   does not come back for a rematch; the coach's name (and only the
   coach's) opens its card, and a tap anywhere puts it away; the chapter
   card is the full fighter card; and a game with nobody across the table
   has none of it.

   Run: node chess/tools/fighters-check.js                                */
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

/* ---------------- node: the cards ---------------- */
global.self = global;
const Cast = require("../cast.js");
const Rating = require("../rating.js");
const ladder = Rating.LEVELS.map((L) => L.id);
const cards = ladder.map((id) => Cast.card(id));

ok("every coach on the ladder has a fighter card", cards.every(Boolean), ladder.filter((id, i) => !cards[i]).join(", "));
ok("…with the same four bars, in the same order", cards.every((c) => c.stats.map((s) => s.key).join() === "attack,defence,tricks,endgame"));
ok("…each one a whole number from one to five", cards.every((c) => c.stats.every((s) => Number.isInteger(s.v) && s.v >= 1 && s.v <= Cast.STAT_MAX)),
   cards.map((c) => c.id + ":" + c.stats.map((s) => s.v).join("")).join(" "));
ok("the bars add up to more as you climb the ladder (never less)", cards.every((c, i) => !i || c.power >= cards[i - 1].power),
   cards.map((c) => c.id + " " + c.power).join(", "));
ok("…from a gentle first coach to a mighty last one", cards[0].power <= 8 && cards[cards.length - 1].power >= 15);
const sig = (c) => c.stats.map((s) => s.v).join("");
ok("no two coaches have the same shape", new Set(cards.map(sig)).size === cards.length);
const st = (id, k) => Cast.card(id).stats.find((s) => s.key === k).v;
ok("Cactus is the attacker: no one hits harder", ladder.every((id) => st(id, "attack") <= st("cactus", "attack")) && st("cactus", "attack") > st("cactus", "defence"));
ok("Fern (careful) defends better than it attacks", st("club", "defence") > st("club", "attack"));
ok("Clover (lucky) is more tricks than anything", st("clover", "tricks") >= Math.max(st("clover", "attack"), st("clover", "defence"), st("clover", "endgame")));
ok("Oak is the endgame master", ladder.every((id) => st(id, "endgame") <= st("mentor", "endgame")));
ok("every card has its style and its special move, from its own character",
   cards.every((c) => c.style === Cast.get(c.id).style.name && c.special.name === Cast.get(c.id).signature.name));
const words = [];
cards.forEach((c) => { words.push({ id: c.id, k: "strong", t: c.strong }); words.push({ id: c.id, k: "weak", t: c.weak }); });
ok("a strength and a weak spot for each, short enough to read at a glance",
   words.every((w) => typeof w.t === "string" && w.t.length >= 20 && w.t.length <= 90), words.filter((w) => !w.t || w.t.length > 90 || w.t.length < 20).map((w) => w.id + ":" + w.k).join(", "));
ok("nobody's words are anybody else's", new Set(words.map((w) => w.t)).size === words.length);
const telling = words.filter((w) => /\b[a-h][1-8]\b|mate in|best move|blunder|\bwinning\b|\bwins\b/i.test(w.t));
ok("nothing on a card tells you about the position", telling.length === 0, telling.map((w) => w.id + ":" + w.t).join(" | "));
/* a weak spot is an invitation, not a worry: no scary words, and it ends
   on something to try */
const scary = words.filter((w) => /\b(lose|losing|lost|fail|bad|wrong|mistake|careful|danger|scared|hard)\b/i.test(w.t) && w.k === "weak");
ok("a weak spot is said kindly: no scary words", scary.length === 0, scary.map((w) => w.id + ":" + w.t).join(" | "));
ok("…and each one ends on something fun to try", cards.every((c) => /[!.]$/.test(c.weak)) && cards.filter((c) => /!$/.test(c.weak)).length >= cards.length - 1);
ok("an unknown coach has no card, rather than someone else's", Cast.card("nobody") === null);

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe cards are right on paper (the room was not opened)");
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
      met: { sprout: 1 } }));
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });
  const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn); if (v) return v; await page.waitForTimeout(60); } return null; };
  const fs_ = () => page.evaluate(() => __cr.fighterState());
  const start = (o, m) => page.evaluate(([o2, m2]) => {
    document.getElementById("ovMenu").classList.add("hide");
    __cr.startGame(m2 || "coach", Object.assign({ clockStr: "none", fresh: true }, o2));
  }, [o, m]);
  try {
    await page.goto(base + "/chess/#force2d");
    await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await page.waitForTimeout(300);

    /* meeting a new coach: its card comes with it */
    await start({ humanSide: 1, skill: "acorn" });
    await page.waitForTimeout(400);
    let s = await fs_();
    const acorn = Cast.card("acorn");
    ok("meeting a coach, its card comes too: the bars and its weak spot", (await page.evaluate(() => __cr.castState().meeting)) &&
       s.meetCard.indexOf("Attack") >= 0 && s.meetCard.indexOf(acorn.weak) >= 0, s.meetCard);
    const pips = await page.evaluate(() => document.querySelectorAll("#meetCard .fcPips i.on").length);
    ok("…with as many lit pips as it has points", pips === acorn.power, pips + " vs " + acorn.power);
    ok("…and the bars fill in, one pip at a time", await page.evaluate(() => {
      const f = document.querySelector("#meetCard .fcard"), on = document.querySelectorAll("#meetCard .fcPips i.on");
      return f.classList.contains("go") && getComputedStyle(on[on.length - 1]).animationDelay !== getComputedStyle(on[0]).animationDelay;
    }));
    ok("…and no versus banner on top of an introduction", !s.vs);
    const box = await page.evaluate(() => { const a = document.getElementById("castMeet").getBoundingClientRect(), b = document.getElementById("cv2").getBoundingClientRect(); return [a.top, a.bottom, b.top, b.bottom]; });
    ok("…and the introduction, card and all, stays on the board's stage", box[0] >= box[2] - 1 && box[1] <= box[3] + 1, box.map(Math.round).join(","));
    await page.evaluate(() => __cr.castMeetDone());
    await page.waitForTimeout(700);

    /* a coach you know: the versus banner */
    await start({ humanSide: 1, skill: "sprout" });
    s = await until(() => { const x = __cr.fighterState(); return x.vs ? x : null; }, 1500);
    ok("a game with a coach you know opens with a versus banner", !!s && /VS/.test(s.vsText) && s.vsText.indexOf("Sprout") >= 0 && s.vsText.indexOf("You") >= 0, s && s.vsText);
    ok("…that says its weak spot, kindly", !!s && s.vsText.indexOf(Cast.card("sprout").weak) >= 0);
    ok("…and never takes a touch meant for the board", await page.evaluate(() => getComputedStyle(document.getElementById("vsBan")).pointerEvents === "none"));
    const tapped = await page.evaluate(() => {
      const c = document.getElementById("cv2").getBoundingClientRect();
      const el = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      return el && el.id;
    });
    ok("…the middle of the board under it is still the board", tapped === "cv2", tapped);
    /* any touch sends it off, and the board still gets the touch */
    const c = await page.evaluate(() => { const r = document.getElementById("cv2").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.8 }; });
    await page.touchscreen.tap(c.x, c.y);
    const gone = await until(() => !__cr.fighterState().vs, 800);
    ok("…and goes at a touch", !!gone);
    /* it goes by itself, in the time the player's pace likes */
    await page.evaluate(() => __cr.paceSet({ v: 1, mode: "brisk" }));
    const brisk = (await fs_()).vsMs;
    await page.evaluate(() => __cr.paceSet({ v: 1, mode: "gentle" }));
    const gentle = (await fs_()).vsMs;
    await page.evaluate(() => __cr.paceSet({ v: 1, mode: "auto" }));
    ok("…a quick player gets a quick banner, a gentle one has time to read it", brisk < gentle && brisk >= 1500 && gentle <= 6000, brisk + " / " + gentle);
    /* Acorn, met a moment ago (and the one coach a new player can rematch) */
    await start({ humanSide: 1, skill: "acorn" });
    await until(() => __cr.fighterState().vs, 1500);
    const t0 = Date.now();
    await until(() => !__cr.fighterState().vs, 8000);
    const lasted = Date.now() - t0, want = (await fs_()).vsMs;
    ok("…and goes on its own after that", lasted <= want + 1200, lasted + "ms for " + want);
    /* a rematch: you have just seen it */
    await page.evaluate(() => __cr.rematchForTest());
    await page.waitForTimeout(500);
    ok("a rematch skips the banner: you have just seen it", !(await fs_()).vs && (await page.evaluate(() => __cr.castState().id)) === "acorn" &&
       (await page.evaluate(() => document.getElementById("ovAsk").classList.contains("hide"))));

    /* the name opens the card */
    await page.waitForTimeout(400);
    s = await fs_();
    const coachTag = await page.evaluate(() => { const t = document.querySelector(".ptag.fcTap"); return t ? t.textContent : ""; });
    ok("the coach's name tag (and only the coach's) can be tapped for its card", s.tap !== null && /Acorn/.test(coachTag) && !/You/.test(coachTag), s.tap + " " + coachTag);
    ok("…and only one tag offers it", await page.evaluate(() => document.querySelectorAll(".ptag.fcTap").length === 1));
    const tagBox = await page.evaluate(() => { const r = document.querySelector(".ptag.fcTap").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.touchscreen.tap(tagBox.x, tagBox.y);
    s = await until(() => { const x = __cr.fighterState(); return x.pop ? x : null; }, 1200);
    ok("tapping the coach's name opens its fighter card", !!s && s.popText.indexOf("Acorn") >= 0 && s.popText.indexOf(acorn.strong) >= 0 &&
       s.popText.indexOf(acorn.weak) >= 0 && s.popText.indexOf(acorn.special.name) >= 0 && s.popText.indexOf(acorn.style) >= 0, s && s.popText);
    ok("…its bars as many as its points", await page.evaluate(() => document.querySelectorAll("#fcPop .fcPips i.on").length) === acorn.power);
    ok("…and it is a dialog a screen reader can name", await page.evaluate(() => {
      const t = document.querySelector(".ptag.fcTap"), p = document.getElementById("fcPop");
      return t.getAttribute("role") === "button" && t.tabIndex === 0 && /Acorn/.test(t.getAttribute("aria-label")) && p.getAttribute("role") === "dialog";
    }));
    await page.touchscreen.tap(tagBox.x, tagBox.y + 300);
    ok("a tap anywhere puts it away", !!(await until(() => !__cr.fighterState().pop, 800)));
    await page.evaluate(() => { const t = document.querySelector(".ptag.fcTap"); t.focus(); });
    await page.keyboard.press("Enter");
    const kOpen = await until(() => __cr.fighterState().pop, 800);
    await page.keyboard.press("Escape");
    const kShut = await until(() => !__cr.fighterState().pop, 800);
    ok("…and the keyboard can open it (Enter) and close it (Escape)", !!kOpen && !!kShut);
    /* the board turns: the tag that opens it follows the coach */
    const before = (await fs_()).tap;
    await page.evaluate(() => document.getElementById("btnFlip").click());
    await page.waitForTimeout(500);
    const after = (await fs_()).tap;
    ok("…and when the board turns, the coach's own tag still opens it", after && after !== before, before + " → " + after);

    /* the chapter card is the full fighter card */
    await page.evaluate(() => __cr.openChapter("cactus"));
    await page.waitForTimeout(300);
    const ch = await page.evaluate(() => ({ t: document.getElementById("chPersona").textContent, on: document.querySelectorAll("#chPersona .fcPips i.on").length }));
    const cactus = Cast.card("cactus");
    ok("the chapter card is the coach's fighter card: style, bars, strong, weak, special",
       ch.t.indexOf(cactus.style) >= 0 && ch.t.indexOf(cactus.strong) >= 0 && ch.t.indexOf(cactus.weak) >= 0 && ch.t.indexOf(cactus.special.name) >= 0 && ch.on === cactus.power, ch.t);
    await page.evaluate(() => { document.getElementById("ovChapter").classList.add("hide"); });

    /* nobody across the table: none of it */
    await start({ humanSide: 1 }, "local");
    await page.waitForTimeout(500);
    s = await fs_();
    ok("a game with nobody across the table has no card, banner, or tappable tag", !s.vs && !s.pop && s.tap === null, JSON.stringify(s));
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nevery coach has a card worth collecting");
  process.exit(failed ? 1 : 0);
})();
