/* talents-check.js — dev-only. Does every coach have a talent card, and
   is it kind and fun rather than a test?

   In node, the cards themselves (cast.js): every coach has four talents
   out of five (bold, steady, clever, wise), something it is great at and
   something it is still learning; talents grow along the ladder and each
   coach has a shape of its own (Cactus the boldest, Fern steady, Clover
   clever, Oak the wisest); the words are short and kind (what a coach is
   still learning is something you can try, never a worry), and say
   nothing about the board in front of you.

   In a real browser: meeting a coach brings its talents and what it is
   still learning; a game with a coach you know opens with a friendly
   hello that never takes a touch, goes at any touch, lasts as long as
   your pace likes, and does not come back for a rematch; the coach's
   name (and only the coach's) opens its card, and a tap anywhere puts it
   away; the chapter card is the full talent card; the talents light up
   one after another with a climbing tick, the total counting with them,
   a star for a talent at its top and a sheen at the end; the hello and
   the card come and go with a flourish (and simply appear with reduced
   motion); and a game with
   nobody across the table has none of it.

   Run: node chess/tools/talents-check.js                                 */
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

ok("every coach on the ladder has a talent card", cards.every(Boolean), ladder.filter((id, i) => !cards[i]).join(", "));
ok("…with the same four talents, in the same order", cards.every((c) => c.talents.map((t) => t.key).join() === "bold,steady,clever,wise"));
ok("…each one a whole number from one to five", cards.every((c) => c.talents.every((t) => Number.isInteger(t.v) && t.v >= 1 && t.v <= Cast.TALENT_MAX)),
   cards.map((c) => c.id + ":" + c.talents.map((t) => t.v).join("")).join(" "));
ok("…and each talent says what it means", Cast.TALENTS.every((t) => t.label && t.emoji && t.what && t.what.length < 40));
ok("talents grow as you climb the ladder (never shrink)", cards.every((c, i) => !i || c.total >= cards[i - 1].total),
   cards.map((c) => c.id + " " + c.total).join(", "));
ok("…from a little seed to a wise old tree", cards[0].total <= 8 && cards[cards.length - 1].total >= 15);
const shape = (c) => c.talents.map((t) => t.v).join("");
ok("no two coaches have the same shape", new Set(cards.map(shape)).size === cards.length);
const tv = (id, k) => Cast.card(id).talents.find((t) => t.key === k).v;
ok("Cactus is the boldest of them all", ladder.every((id) => tv(id, "bold") <= tv("cactus", "bold")) && tv("cactus", "bold") > tv("cactus", "steady"));
ok("Fern (careful) is steadier than it is bold", tv("club", "steady") > tv("club", "bold"));
ok("Clover (lucky) is cleverer than anything else", tv("clover", "clever") >= Math.max(tv("clover", "bold"), tv("clover", "steady"), tv("clover", "wise")));
ok("Oak is the wisest", ladder.every((id) => tv(id, "wise") <= tv("mentor", "wise")));
ok("every card has its style and its favourite trick, from its own character",
   cards.every((c) => c.style === Cast.get(c.id).style.name && c.trick.name === Cast.get(c.id).signature.name));
const words = [];
cards.forEach((c) => { words.push({ id: c.id, k: "great", t: c.great }); words.push({ id: c.id, k: "growing", t: c.growing }); });
ok("something it is great at and something it is still learning, each short enough to read at a glance",
   words.every((w) => typeof w.t === "string" && w.t.length >= 20 && w.t.length <= 90), words.filter((w) => !w.t || w.t.length > 90 || w.t.length < 20).map((w) => w.id + ":" + w.k).join(", "));
ok("nobody's words are anybody else's", new Set(words.map((w) => w.t)).size === words.length);
const telling = words.filter((w) => /\b[a-h][1-8]\b|mate in|best move|blunder|\bwinning\b|\bwins\b/i.test(w.t));
ok("nothing on a card tells you about the position", telling.length === 0, telling.map((w) => w.id + ":" + w.t).join(" | "));
/* growing is kind: about learning, never a fight or a failing */
const harsh = words.filter((w) => /\b(weak|weakness|beat|beating|attack them|defeat|lose|losing|lost|fail|bad|wrong|mistake|danger|scared|hard|stupid|dumb)\b/i.test(w.t));
ok("the words are kind: no fighting talk, no failing", harsh.length === 0, harsh.map((w) => w.id + ":" + w.t).join(" | "));
ok("…and what it is still learning is about learning", cards.every((c) => /learning/i.test(c.growing)));
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
  const fs_ = () => page.evaluate(() => __cr.talentState());
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
    ok("meeting a coach, its talents come too, and what it is still learning", (await page.evaluate(() => __cr.castState().meeting)) &&
       s.meetCard.indexOf("Bold") >= 0 && s.meetCard.indexOf(acorn.growing) >= 0, s.meetCard);
    const pips = await page.evaluate(() => document.querySelectorAll("#meetCard .tcPips i.on").length);
    ok("…with as many lit pips as its talents add up to", pips === acorn.total, pips + " vs " + acorn.total);
    ok("…and the talents light up, one pip at a time", await page.evaluate(() => {
      const f = document.querySelector("#meetCard .tcard"), on = document.querySelectorAll("#meetCard .tcPips i.on");
      return f.classList.contains("go") && getComputedStyle(on[on.length - 1]).animationDelay !== getComputedStyle(on[0]).animationDelay;
    }));
    ok("…and no hello banner on top of an introduction", !s.hi);
    const box = await page.evaluate(() => { const a = document.getElementById("castMeet").getBoundingClientRect(), b = document.getElementById("cv2").getBoundingClientRect(); return [a.top, a.bottom, b.top, b.bottom]; });
    ok("…and the introduction, card and all, stays on the board's stage", box[0] >= box[2] - 1 && box[1] <= box[3] + 1, box.map(Math.round).join(","));
    await page.evaluate(() => __cr.castMeetDone());
    await page.waitForTimeout(700);

    /* a coach you know: a friendly hello */
    await start({ humanSide: 1, skill: "sprout" });
    s = await until(() => { const x = __cr.talentState(); return x.hi ? x : null; }, 1500);
    ok("a game with a coach you know opens with a friendly hello: you and the coach, side by side", !!s && /\u{1F91D}/u.test(s.hiText) && s.hiText.indexOf("Sprout") >= 0 && s.hiText.indexOf("You") >= 0, s && s.hiText);
    ok("…and one thing it is still learning", !!s && s.hiText.indexOf(Cast.card("sprout").growing) >= 0);
    ok("…and never takes a touch meant for the board", await page.evaluate(() => getComputedStyle(document.getElementById("hiBan")).pointerEvents === "none"));
    const tapped = await page.evaluate(() => {
      const c = document.getElementById("cv2").getBoundingClientRect();
      const el = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      return el && el.id;
    });
    ok("…the middle of the board under it is still the board", tapped === "cv2", tapped);
    /* any touch sends it off, and the board still gets the touch */
    const c = await page.evaluate(() => { const r = document.getElementById("cv2").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.8 }; });
    await page.touchscreen.tap(c.x, c.y);
    const gone = await until(() => !__cr.talentState().hi, 800);
    ok("…and goes at a touch", !!gone);
    /* it goes by itself, in the time the player's pace likes */
    await page.evaluate(() => __cr.paceSet({ v: 1, mode: "brisk" }));
    const brisk = (await fs_()).hiMs;
    await page.evaluate(() => __cr.paceSet({ v: 1, mode: "gentle" }));
    const gentle = (await fs_()).hiMs;
    await page.evaluate(() => __cr.paceSet({ v: 1, mode: "auto" }));
    ok("…a quick player gets a quick hello, a gentle one has time to read it", brisk < gentle && brisk >= 1500 && gentle <= 6000, brisk + " / " + gentle);
    /* Acorn, met a moment ago (and the one coach a new player can rematch) */
    await start({ humanSide: 1, skill: "acorn" });
    await until(() => __cr.talentState().hi, 1500);
    const t0 = Date.now();
    await until(() => !__cr.talentState().hi, 8000);
    const lasted = Date.now() - t0, want = (await fs_()).hiMs;
    ok("…and goes on its own after that", lasted <= want + 1200, lasted + "ms for " + want);
    /* a rematch: you have just seen it */
    await page.evaluate(() => __cr.rematchForTest());
    await page.waitForTimeout(500);
    ok("a rematch skips the hello: you have just seen it", !(await fs_()).hi && (await page.evaluate(() => __cr.castState().id)) === "acorn" &&
       (await page.evaluate(() => document.getElementById("ovAsk").classList.contains("hide"))));

    /* the name opens the card */
    await page.waitForTimeout(400);
    s = await fs_();
    const coachTag = await page.evaluate(() => { const t = document.querySelector(".ptag.tcTap"); return t ? t.textContent : ""; });
    ok("the coach's name tag (and only the coach's) can be tapped for its card", s.tap !== null && /Acorn/.test(coachTag) && !/You/.test(coachTag), s.tap + " " + coachTag);
    ok("…and only one tag offers it", await page.evaluate(() => document.querySelectorAll(".ptag.tcTap").length === 1));
    const tagBox = await page.evaluate(() => { const r = document.querySelector(".ptag.tcTap").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.touchscreen.tap(tagBox.x, tagBox.y);
    s = await until(() => { const x = __cr.talentState(); return x.pop ? x : null; }, 1200);
    ok("tapping the coach's name opens its talent card", !!s && s.popText.indexOf("Acorn") >= 0 && s.popText.indexOf(acorn.great) >= 0 &&
       s.popText.indexOf(acorn.growing) >= 0 && s.popText.indexOf(acorn.trick.name) >= 0 && s.popText.indexOf(acorn.style) >= 0, s && s.popText);
    ok("…its pips as many as its talents add up to", await page.evaluate(() => document.querySelectorAll("#tcPop .tcPips i.on").length) === acorn.total);
    ok("…and it is a dialog a screen reader can name", await page.evaluate(() => {
      const t = document.querySelector(".ptag.tcTap"), p = document.getElementById("tcPop");
      return t.getAttribute("role") === "button" && t.tabIndex === 0 && /Acorn/.test(t.getAttribute("aria-label")) && p.getAttribute("role") === "dialog";
    }));
    /* a tap well outside the card (one inside it, on a talent, explains
       the talent instead, which is the point of talents) */
    const away = await page.evaluate(() => {
      const r = document.getElementById("tcPop").getBoundingClientRect();
      return { x: 12, y: r.bottom + 30 < innerHeight - 10 ? r.bottom + 30 : Math.max(10, r.top - 30) };
    });
    await page.touchscreen.tap(away.x, away.y);
    ok("a tap anywhere puts it away", !!(await until(() => !__cr.talentState().pop, 800)));
    await page.evaluate(() => { const t = document.querySelector(".ptag.tcTap"); t.focus(); });
    await page.keyboard.press("Enter");
    const kOpen = await until(() => __cr.talentState().pop, 800);
    await page.keyboard.press("Escape");
    const kShut = await until(() => !__cr.talentState().pop, 800);
    ok("…and the keyboard can open it (Enter) and close it (Escape)", !!kOpen && !!kShut);
    /* the board turns: the tag that opens it follows the coach */
    const before = (await fs_()).tap;
    await page.evaluate(() => document.getElementById("btnFlip").click());
    await page.waitForTimeout(500);
    const after = (await fs_()).tap;
    ok("…and when the board turns, the coach's own tag still opens it", after && after !== before, before + " → " + after);

    /* the chapter card is the full talent card */
    await page.evaluate(() => __cr.openChapter("cactus"));
    await page.waitForTimeout(300);
    const ch = await page.evaluate(() => ({ t: document.getElementById("chPersona").textContent, on: document.querySelectorAll("#chPersona .tcPips i.on").length }));
    const cactus = Cast.card("cactus");
    ok("the chapter card is the coach's talent card: style, talents, great at, still growing, favourite trick",
       ch.t.indexOf(cactus.style) >= 0 && ch.t.indexOf(cactus.great) >= 0 && ch.t.indexOf(cactus.growing) >= 0 && ch.t.indexOf(cactus.trick.name) >= 0 && ch.on === cactus.total, ch.t);
    await page.evaluate(() => { document.getElementById("ovChapter").classList.add("hide"); });

    /* the reveal: one pip after another, across the whole card */
    await page.evaluate(() => { window.__ticks = []; Sound.countTick = (i, n, up) => window.__ticks.push([i, n, up]); });
    await page.evaluate(() => __cr.openChapter("mentor"));
    const oak = Cast.card("mentor");
    const order = await page.evaluate(() => [...document.querySelectorAll("#chPersona .tcPips i.on")].map((p) => [+p.dataset.o, parseFloat(getComputedStyle(p).animationDelay)]));
    ok("the talents light one pip after another, row by row, never two at once",
       order.length === oak.total && order.every((x, i) => x[0] === i && (!i || x[1] > order[i - 1][1])), JSON.stringify(order.slice(0, 6)));
    const mid = await until(() => { const f = document.querySelector("#chPersona .tcard"), c = +f.dataset.count; return c > 2 && c < 15 ? c + "|" + document.querySelector("#chPersona .tcTotal b").textContent : null; }, 2500);
    ok("…and the total counts up with them", !!mid && mid.split("|")[0] === mid.split("|")[1], mid);
    const shone = await until(() => document.querySelector("#chPersona .tcard").classList.contains("shine"), 3000);
    const ticks = await page.evaluate(() => window.__ticks.filter((t) => t[1] === 17));
    ok("…each with a tick that climbs the scale, all the way to the top", ticks.length === oak.total && ticks.every((t, i) => t[0] === i + 1 && t[2] === true), JSON.stringify(ticks.slice(-3)));
    ok("…then a sheen crosses the card, and the total is the whole card", !!shone && (await page.evaluate(() => document.querySelector("#chPersona .tcTotal b").textContent)) === String(oak.total));
    const maxed = await page.evaluate(() => [...document.querySelectorAll("#chPersona .tcStat.max")].map((x) => x.getAttribute("aria-label")));
    ok("a talent at its very top gets its star (Oak: steady and wise)", maxed.length === oak.talents.filter((t) => t.v === Cast.TALENT_MAX).length && maxed.every((l) => / 5 out of 5$/.test(l)), JSON.stringify(maxed));
    ok("…and only those", await page.evaluate(() => document.querySelectorAll("#chPersona .tcMaxTag").length) === maxed.length);
    await page.evaluate(() => { document.getElementById("ovChapter").classList.add("hide"); });

    /* a long chapter card on a short phone: it scrolls, Play is always in reach */
    await page.setViewportSize({ width: 375, height: 600 });
    await page.evaluate(() => __cr.openChapter("mentor"));
    await page.waitForTimeout(700);
    const fit = await page.evaluate(() => {
      const card = document.querySelector("#ovChapter .chCard"), p = document.getElementById("chPlay").getBoundingClientRect();
      const at = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2);
      return { scrolls: card.scrollHeight > card.clientHeight && getComputedStyle(card).overflowY !== "hidden", inView: p.top >= 0 && p.bottom <= innerHeight, hit: at && at.closest("#chPlay") ? "chPlay" : (at && (at.id || at.className)) };
    });
    ok("a chapter card taller than the phone scrolls, and ▶ Play is on screen and tappable", fit.scrolls && fit.inView && fit.hit === "chPlay", JSON.stringify(fit));
    const fitEnd = await page.evaluate(() => {
      const card = document.querySelector("#ovChapter .chCard"); card.scrollTop = card.scrollHeight;
      const p = document.getElementById("chPlay").getBoundingClientRect(), b = document.getElementById("chBack").getBoundingClientRect();
      return { play: p.top >= 0 && p.bottom <= innerHeight, back: b.top >= 0 && b.bottom <= innerHeight };
    });
    ok("…and still is at the bottom of the card, with Back", fitEnd.play && fitEnd.back, JSON.stringify(fitEnd));
    /* tap a talent: what it means, kindly */
    await page.evaluate(() => { const c = document.querySelector("#ovChapter .chCard"); c.scrollTop = 0; document.querySelector('#chPersona .tcStat[data-k="wise"]').scrollIntoView({ block: "center" }); });
    const wb = await page.evaluate(() => { const r = document.querySelector('#chPersona .tcStat[data-k="wise"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.touchscreen.tap(wb.x, wb.y);
    const info = await until(() => { const i = document.querySelector("#chPersona .tcInfo"); return i ? i.textContent : null; }, 1000);
    ok("tapping a talent says what it means and how much the coach has", !!info && /Wise/.test(info) && /knows how games end/.test(info) && /5 of 5/.test(info) && /very best/.test(info), info);
    /* a moment apart, as a person would: two taps in the same place in
       quick succession are a double-tap to a phone, not two taps */
    await page.waitForTimeout(450);
    await page.touchscreen.tap(wb.x, wb.y);
    ok("…and tapping it again closes it", !!(await until(() => !document.querySelector("#chPersona .tcInfo"), 800)));
    await page.evaluate(() => document.getElementById("chX").click());
    await page.waitForTimeout(400);
    ok("the ✕ closes the chapter card, back to the map", await page.evaluate(() => document.getElementById("ovChapter").classList.contains("hide") && !document.getElementById("ovJourney").classList.contains("hide")));
    await page.evaluate(() => document.getElementById("ovJourney").classList.add("hide"));
    await page.setViewportSize({ width: 390, height: 844 });

    /* the hello and the card, coming and going */
    await page.waitForTimeout(500);
    await start({ humanSide: 1, skill: "acorn" });
    await until(() => __cr.talentState().hi, 1500);
    ok("the hello brings the coach's own face", await page.evaluate(() => { const i = document.querySelector("#hiThem .hiFace"); return !!i && /^data:image/.test(i.src); }));
    ok("…with a burst and sparkles where you meet", await page.evaluate(() => document.querySelectorAll("#hiBan .hiSpark").length === 6 && !!document.querySelector("#hiBan .hiBurst")));
    await page.evaluate(() => __cr.hiDone());
    const parting = await page.evaluate(() => new Promise((res) => setTimeout(() => res(getComputedStyle(document.getElementById("hiYou")).transform), 150)));
    ok("…and goes by parting, not by blinking out", parting !== "none" && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(parting), parting);
    await page.waitForTimeout(600);
    ok("…and is gone soon after", await page.evaluate(() => document.getElementById("hiBan").classList.contains("hide")));
    await page.evaluate(() => __cr.tcPopShow());
    ok("the card has the coach's face at the top", await page.evaluate(() => !!document.querySelector("#tcPopFace img")));
    const early = await page.evaluate(() => +document.querySelector("#tcPop .tcard").dataset.count);
    ok("…and flips up before the talents start to light", early === 0, String(early));
    await page.waitForTimeout(400);
    /* in the middle of a game too: a talent explains itself, and the card stays */
    await page.evaluate(() => document.querySelector('#tcPop .tcStat[data-k="bold"]').click());
    const popInfo = await page.evaluate(() => ({ t: (document.querySelector("#tcPop .tcInfo") || {}).textContent || "", open: __cr.talentState().pop }));
    ok("tapping a talent on the coach's card explains it, and the card stays open", popInfo.open && /Bold/.test(popInfo.t) && /Acorn/.test(popInfo.t), JSON.stringify(popInfo));
    await page.evaluate(() => __cr.tcPopHide());
    const leaving = await page.evaluate(() => ({ out: document.getElementById("tcPop").classList.contains("out"), hid: document.getElementById("tcPop").classList.contains("hide") }));
    await page.waitForTimeout(350);
    ok("…and flips away when it is put down", leaving.out && !leaving.hid && (await page.evaluate(() => document.getElementById("tcPop").classList.contains("hide"))), JSON.stringify(leaving));

    /* nobody across the table: none of it */
    await start({ humanSide: 1 }, "local");
    await page.waitForTimeout(500);
    s = await fs_();
    ok("a game with nobody across the table has no card, hello, or tappable tag", !s.hi && !s.pop && s.tap === null, JSON.stringify(s));
    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  /* with reduced motion: no count, no flip, it is simply all there */
  try {
    const rctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    await rctx.addInitScript(() => localStorage.setItem("chessroom_prefs", JSON.stringify({ welcomed: true, tips: { notes: 1, price: 1, undo: 1, why: 1, wheels: 1 }, met: { acorn: 1 } })));
    const rp = await rctx.newPage();
    await rp.goto(base + "/chess/#force2d");
    await rp.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await rp.evaluate(() => __cr.openChapter("mentor"));
    const r = await rp.evaluate(() => ({ n: document.querySelector("#chPersona .tcTotal b").textContent, a: document.querySelector("#chPersona .tcPips i.on").getAnimations().length }));
    ok("with reduced motion the card is simply all there: the whole total, nothing moving", r.n === String(Cast.card("mentor").total) && r.a === 0, JSON.stringify(r));
    await rctx.close();
  } catch (e) {
    ok("the reduced-motion check fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nevery coach has talents worth learning from");
  process.exit(failed ? 1 : 0);
})();
