/* hub-check.js — is the front door a place, and is everything still in it?

   The lobby is four pages and a dock now (hub.js, and "the hub" in
   app.js). This holds it to what hub.js says of itself:
     - nothing moved out of reach: every key the lobby ever had is on
       exactly one page, in the markup where the map says it is;
     - a newcomer is asked one thing: a first visit shows a face, a
       question and two answers, and nothing else until "Look around
       first" or a finished game opens the room — for good;
     - a page is a screen: on a phone held upright no page but the road
       needs scrolling, and no key is ever cut off at the side;
     - the dock goes where it says, by a tap, a swipe or the arrow keys,
       and its light is where the pages are;
     - the dock is an instrument: four notes of the home chord, low to
       high; out loud for a press, under the breath for a swipe;
     - a door wears a badge only for something that is really waiting;
     - the room opens where it makes sense: on Play after a game,
       otherwise where you left it;
     - whoever is next on the road hosts: says something as you walk in,
       answers a tap, and goes to sleep when the lobby is not in front;
     - every picture on a key is well drawn: closed tags, nothing but
       shapes, every moving part known to the stylesheet;
     - and with reduced motion nothing slides and nothing waves.

   Run: node chess/tools/hub-check.js                                      */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
const Hub = require("../hub.js");
const Sound = require("../sound.js");
const Cast = require("../cast.js");
let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};
const HTML = fs.readFileSync(path.join(ROOT, "chess", "index.html"), "utf8");
const SW = fs.readFileSync(path.join(ROOT, "chess", "sw.js"), "utf8");

/* ================= the map ================= */
(function () {
  const ids = Hub.ids();
  ok("the front door has four doors, each with a name, a picture and a note",
     ids.length === 4 && new Set(ids).size === 4 &&
     Hub.PAGES.every((p) => p.label && p.say && Hub.ICONS[p.icon] && Number.isFinite(p.note)), JSON.stringify(Hub.PAGES));
  ok("…and Play is the first of them", ids[0] === "play");

  /* every key the old lobby had, by the id it always had */
  const OLD = ["mRating", "mWelcome", "mNew", "mKnow", "mOpenBoard", "mResume", "mPlay", "mGoal", "mCoach", "mJourney", "mLadder",
               "mCollect", "mPass", "mLan", "mNotation", "mPassOpts", "mAcademy", "mLearn", "mOpenings", "mMakeBoard", "mSettings", "mAbout"];
  const lost = OLD.filter((id) => !Hub.pageOf(id));
  ok("nothing the lobby had was left out of the map", lost.length === 0, lost.join(", "));
  ok("…and every key on the map is on a page that exists",
     Object.keys(Hub.ITEMS).every((k) => Hub.index(Hub.ITEMS[k]) >= 0));
  ok("…a key nobody has heard of is on no page", Hub.pageOf("mNope") === null && Hub.pageOf("toString") === null);

  /* the markup agrees with the map: each page's section holds its keys */
  const sections = {};
  const re = /<section class="hubPage"[^>]*data-page="([a-z]+)"[^>]*>([\s\S]*?)<\/section>/g;
  let m;
  while ((m = re.exec(HTML))) sections[m[1]] = m[2];
  ok("the page has a section for every door, in order",
     JSON.stringify(Object.keys(sections)) === JSON.stringify(ids), Object.keys(sections).join(","));
  const astray = Object.keys(Hub.ITEMS).filter((k) => {
    const here = Object.keys(sections).filter((s) => new RegExp('id="' + k + '"').test(sections[s]));
    return here.length !== 1 || here[0] !== Hub.ITEMS[k];
  });
  ok("every key is in the markup once, on the page the map names", astray.length === 0, astray.join(", "));
  const idsInPages = [];
  Object.keys(sections).forEach((s) => { const r = /id="(m[A-Z][A-Za-z]*)"/g; let x; while ((x = r.exec(sections[s]))) idsInPages.push(x[1]); });
  const TEXT = { mWelcomeTitle: 1, mOpenBoardTx: 1, mOpenBoardSub: 1, mResumeSub: 1, mPlaySub: 1, mGoalEm: 1, mGoalTx: 1, mJourneyTx: 1,
                 mJourneySub: 1, mJourneyBar: 1, mJourneyPct: 1, mLadderNote: 1, mAcademySub: 1, mRateNum: 1, mRateTitle: 1, mRateSub: 1,
                 mRateSpark: 1, mCollectSub: 1, mLv: 1, mLvBar: 1 };
  const unmapped = idsInPages.filter((id) => !TEXT[id] && !Hub.pageOf(id));
  ok("…and no key sits on a page without being on the map", unmapped.length === 0, unmapped.join(", "));
  const tabs = (HTML.match(/class="hubTab"[^>]*data-page="([a-z]+)"/g) || []).map((t) => /data-page="([a-z]+)"/.exec(t)[1]);
  ok("the dock has a door for every page, in the same order", JSON.stringify(tabs) === JSON.stringify(ids), tabs.join(","));

  ok("hub.js is loaded before the conductor, and kept for offline",
     HTML.indexOf('<script src="hub.js"></script>') > 0 && HTML.indexOf('<script src="hub.js"></script>') < HTML.indexOf('<script src="app.js"></script>') &&
     /'\.\/hub\.js'/.test(SW));
})();

/* ================= the door ================= */
(function () {
  const g = Hub.door({ newcomer: true, looked: false }), o = Hub.door({ newcomer: true, looked: true }), r = Hub.door({ newcomer: false });
  ok("a newcomer is greeted: one page, no dock, nothing to swipe to",
     g.greeting && !g.dock && !g.swipe && g.pages.length === 1 && g.pages[0] === "play");
  ok("…until they have looked around, or are no longer new",
     !o.greeting && o.dock && o.swipe && o.pages.length === 4 && !r.greeting && r.dock && r.pages.length === 4);
  ok("…and asked nothing, the door is simply open", Hub.door().dock && Hub.door(null).pages.length === 4);

  ok("the room opens on Play after a game", Hub.landing({ played: true, last: "learn" }) === "play");
  ok("…and otherwise where you left it", Hub.landing({ last: "learn" }) === "learn" && Hub.landing({ last: "you" }) === "you");
  ok("…on Play when it has never been anywhere, or was told nonsense",
     Hub.landing({}) === "play" && Hub.landing() === "play" && Hub.landing({ last: "attic" }) === "play" && Hub.landing({ last: 3 }) === "play");
  ok("…and the greeting is always the one page it has", Hub.landing({ greeting: true, last: "you" }) === "play");

  /* walking */
  ok("how far along the pages a scroll is, in pages",
     Hub.progress(0, 360) === 0 && Hub.progress(540, 360) === 1.5 && Hub.progress(1080, 360) === 3);
  ok("…never off either end, and never NaN",
     Hub.progress(-90, 360) === 0 && Hub.progress(99999, 360) === 3 && Hub.progress(100, 0) === 0 &&
     Hub.progress(NaN, 360) === 0 && Hub.progress("x", "y") === 0);
  ok("the page in view is the nearest one",
     Hub.nearest(0, 360) === 0 && Hub.nearest(179, 360) === 0 && Hub.nearest(181, 360) === 1 && Hub.nearest(1080, 360) === 3 && Hub.nearest(5000, 360) === 3);
  ok("the arrow keys walk the dock and stop at its ends",
     Hub.key(0, "ArrowRight") === 1 && Hub.key(3, "ArrowRight") === 3 && Hub.key(0, "ArrowLeft") === 0 && Hub.key(2, "ArrowLeft") === 1 &&
     Hub.key(2, "Home") === 0 && Hub.key(1, "End") === 3 && Hub.key(2, "a") === 2 && Hub.key(99, "ArrowLeft") === 2 && Hub.key(NaN, "ArrowRight") === 1);
  ok("a page asked for by a silly number is the nearest real one",
     Hub.page(-4).id === "play" && Hub.page(99).id === "you" && Hub.page(NaN).id === "play" && Hub.page("2").id === "learn");
})();

/* ================= what is waiting ================= */
(function () {
  const none = Hub.badges({});
  ok("with nothing waiting no door wears a badge", Hub.ids().every((id) => none[id] === null) && Hub.ids().every((id) => Hub.badges()[id] === null));
  const all = Hub.badges({ resume: true, due: 3, boxes: 2, fresh: 5 });
  ok("a game to go back to is a dot on Play", all.play && all.play.kind === "dot" && /game/.test(all.play.say));
  ok("…an open board comes before it", /friend/.test(Hub.badges({ resume: true, openBoard: true }).play.say));
  ok("ideas due are counted on Learn", all.learn && all.learn.kind === "count" && all.learn.text === "3" && /3 ideas due/.test(all.learn.say));
  ok("…one idea is one idea, and a great many is 9+",
     /1 idea due/.test(Hub.badges({ due: 1 }).learn.say) && Hub.badges({ due: 40 }).learn.text === "9+" && /40 ideas/.test(Hub.badges({ due: 40 }).learn.say));
  ok("a box to open is a present on You, before anything merely new", all.you.kind === "gift" && all.you.n === 2 && Hub.badges({ fresh: 5 }).you.kind === "dot");
  ok("…and Friends never asks for attention it has no reason for", all.friends === null);
  const junk = Hub.badges({ due: -3, boxes: "many", fresh: NaN, resume: 0, openBoard: "" });
  ok("junk counts are nothing waiting", Hub.ids().every((id) => junk[id] === null), JSON.stringify(junk));
  ok("a door says its name, what is behind it, and what is waiting",
     /^Learn: .+ — 3 ideas due/.test(Hub.sayDoor("learn", all.learn)) && Hub.sayDoor("friends", null) === "Friends: Play with somebody" && Hub.sayDoor("attic") === "");
})();

/* ================= the instrument ================= */
(function () {
  const notes = Hub.PAGES.map((p) => p.note);
  ok("the doors' notes climb from left to right", notes.every((n, i) => i === 0 || n > notes[i - 1]), notes.join(","));
  ok("…and are all of the room's home chord, D major", notes.every((n) => [0, 4, 7].indexOf(((n % 12) + 12) % 12) >= 0), notes.join(","));
  ok("…from D to the D above", notes[0] % 12 === 0 && notes[notes.length - 1] === notes[0] + 12);
  const loud = Hub.PAGES.map((p) => Sound.score("door", { n: p.note })), soft = Hub.PAGES.map((p) => Sound.score("door", { n: p.note, soft: true }));
  ok("a door pressed plays its own note, on the board's own instrument",
     loud.every((sc, i) => sc.events[0].w === "marimba" && sc.events[0].n === notes[i]));
  ok("…a door reached by a swipe says the same note under its breath",
     soft.every((sc, i) => sc.events.length === 1 && sc.events[0].n === notes[i] && sc.events[0].v < loud[i].events[0].v * 0.7));
  ok("…dry, so four in a row never smear", loud.every((sc) => sc.send === 0) && Sound.dryEnd(loud[0]) < 0.7);
  const run = Sound.score("doors", { ns: notes }).events.filter((e) => e.w === "marimba");
  ok("the dock standing up for the first time runs up all four", run.length === 4 && run.every((e, i) => e.n === notes[i] && (i === 0 || e.t > run[i - 1].t)));
  ok("a mouse coming to rest is the quietest thing in the room",
     Sound.STINGS.hover.gain < Sound.STINGS.tap.gain && Sound.dryEnd(Sound.score("hover", {})) < 0.1);
  ok("every coach has something to call across the lobby", Cast.ids().every((id) => Cast.CAST[id].lines.door && Cast.CAST[id].lines.door.length >= 2));
})();

/* ================= the pictures ================= */
(function () {
  const names = Hub.iconNames();
  const used = [];
  const r = /data-ic="([a-z]+)"/g; let m;
  while ((m = r.exec(HTML))) used.push(m[1]);
  ok("every picture the page asks for has been drawn", used.length >= 16 && used.every((n) => Hub.ICONS[n]), used.filter((n) => !Hub.ICONS[n]).join(", "));
  ok("…and none was drawn for nobody", names.every((n) => used.indexOf(n) >= 0), names.filter((n) => used.indexOf(n) < 0).join(", "));
  ok("a picture nobody drew is nothing, not a broken frame", Hub.icon("unicorn") === "" && Hub.icon("constructor") === "");

  const TAGS = { g: 1, path: 1, circle: 1, ellipse: 1, rect: 1, svg: 1 };
  let bad = null;
  const moving = {};
  names.forEach((n) => {
    const svg = Hub.icon(n);
    if (!/^<svg class="hubSvg" viewBox="0 0 48 48" aria-hidden="true" focusable="false">/.test(svg)) bad = bad || n + ": not a 48-square picture hidden from readers";
    /* tags balance, and are only shapes */
    const stack = [];
    const tr = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g; let t;
    while ((t = tr.exec(svg))) {
      if (!TAGS[t[2]]) bad = bad || n + ": <" + t[2] + ">";
      if (/\son[a-z]+=|href|style=|url\(|<script/i.test(t[3])) bad = bad || n + ": " + t[3];
      if (t[1]) { if (stack.pop() !== t[2]) bad = bad || n + ": </" + t[2] + "> closes nothing"; }
      else if (!t[4]) stack.push(t[2]);
      const cls = /class="([^"]*)"/.exec(t[3]);
      if (cls) cls[1].split(/\s+/).forEach((c) => { if (/^ic-/.test(c)) moving[c] = 1; });
      /* a part that moves must not also be placed by an attribute: the
         stylesheet's transform would throw the placing away */
      if (cls && /(^|\s)ic-/.test(cls[1]) && /\stransform=/.test(t[3])) bad = bad || n + ": a moving part placed by transform=";
    }
    if (stack.length) bad = bad || n + ": unclosed <" + stack.join("><") + ">";
    if (/NaN|undefined|null/.test(svg)) bad = bad || n + ": a number that is not one";
    if (svg.length > 2600) bad = bad || n + ": " + svg.length + " bytes is a painting, not a picture on a key";
  });
  ok("every picture is closed, 48 square, and nothing but shapes", !bad, bad);
  const parts = Object.keys(moving);
  const still = parts.filter((c) => !new RegExp("\\." + c + "\\b[^{]*\\{[^}]*animation", "m").test(HTML));
  ok("every part that can move is moved by the stylesheet (" + parts.length + " parts)", parts.length >= 12 && still.length === 0, still.join(", "));
  const cssParts = Array.from(new Set((HTML.match(/\.ic-[a-zA-Z]+/g) || []).map((c) => c.slice(1))));
  const ghosts = cssParts.filter((c) => !moving[c]);
  ok("…and the stylesheet moves nothing that was never drawn", ghosts.length === 0, ghosts.join(", "));
  ok("with less motion asked for, none of it is asked to move",
     /@media \(prefers-reduced-motion: no-preference\)\{\s*\/\* things that are alive/.test(HTML) &&
     !/\n  \.hub[^\n{]*\{[^}]*animation:/.test(HTML.split("/* what moves */")[0].split("the hub: the lobby as a place")[1] || "x{animation:"));
})();

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe front door is in order (the room was not opened)");
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

const SIZES = [
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true },
  { name: "small phone", viewport: { width: 360, height: 640 }, touch: true },
  { name: "desk", viewport: { width: 1280, height: 820 }, touch: false }
];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];
  /* every sound the room asks for, written down instead of played */
  const LISTEN = () => {
    window.__heard = [];
    const tap = () => { if (!window.Sound || Sound.__tapped) return; Sound.__tapped = 1; const s = Sound.sting; Sound.sting = function (k, o) { window.__heard.push([k, o ? JSON.parse(JSON.stringify(o)) : null]); return s.apply(Sound, arguments); }; };
    document.addEventListener("DOMContentLoaded", tap); window.addEventListener("load", tap);
  };
  try {
    for (const size of SIZES) {
      const T = (s) => size.name + ": " + s;
      const ctx = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, isMobile: size.touch });
      await ctx.addInitScript(LISTEN);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errs.push(size.name + ": " + e.message));
      page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(size.name + ": " + m.text()); });
      const until = async (fn, ms, arg) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 4000)) { const v = await page.evaluate(fn, arg); if (v) return v; await page.waitForTimeout(60); } return null; };
      const ready = async () => {
        await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone") &&
          !document.getElementById("ovMenu").classList.contains("hide"), null, { timeout: 120000 });
        await page.waitForTimeout(350);
      };
      const st = () => page.evaluate(() => __cr.hubState());
      const settled = (i) => until((k) => { const p = document.getElementById("hubPages"); return Math.abs(p.scrollLeft - k * p.clientWidth) < 2 && __cr.hubState().at === k; }, 5000, i);
      const shown = (sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; }, sel);
      const heard = (kind) => page.evaluate((k) => window.__heard.filter((h) => h[0] === k).map((h) => h[1]), kind);
      const hush = () => page.evaluate(() => { window.__heard.length = 0; });
      /* a finger put down, dragged sideways and lifted */
      const cdp = size.touch ? await ctx.newCDPSession(page) : null;
      const drag = async (x, y, dx) => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: Math.round(x), y: Math.round(y) }] });
        for (let i = 1; i <= 10; i++) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: Math.round(x + dx * i / 10), y: Math.round(y) }] });
          await page.waitForTimeout(16);
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      };

      await page.goto(base + "/chess/#force2d");
      await page.evaluate(() => localStorage.clear());
      await page.goto(base + "/chess/?v=1#force2d");
      await ready();

      /* ---- a first visit ---- */
      const g = await page.evaluate(() => {
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const keys = [].filter.call(document.querySelectorAll("#hub button, #hub a"), vis).map((b) => b.id);
        const pages = document.getElementById("hubPages");
        pages.scrollLeft = 500;
        return { keys: keys, greeting: document.getElementById("hub").classList.contains("greeting"), couldScroll: pages.scrollLeft,
                 pagesShown: [].filter.call(document.querySelectorAll(".hubPage"), vis).length, st: __cr.hubState(),
                 fits: document.getElementById("hub").getBoundingClientRect().bottom <= innerHeight + 1,
                 scrolls: document.getElementById("hubPagePlay").scrollHeight - document.getElementById("hubPagePlay").clientHeight };
      });
      ok(T("a first visit is a face, a question and two answers"),
         g.greeting && JSON.stringify(g.keys.slice().sort()) === JSON.stringify(["hubHostBtn", "mKnow", "mLook", "mNew"]), g.keys.join(","));
      ok(T("…with no dock, one page, and nowhere to swipe to"), g.pagesShown === 1 && g.couldScroll === 0 && !(await shown("#hubDock")), JSON.stringify(g));
      ok(T("…all of it on the screen at once"), g.fits && (size.viewport.height < 700 || g.scrolls <= 1), "bottom fits " + g.fits + ", scrolls " + g.scrolls);
      ok(T("whoever is first on the road is there to say hello"),
         g.st.host === "acorn" && Cast.CAST.acorn.lines.door.indexOf(g.st.said) >= 0 && (g.st.face || (await shown("#hubHostEmoji"))), JSON.stringify(g.st));
      ok(T("…in a bubble, by name"), (await until(() => document.getElementById("hubSayTx").textContent === __cr.hubState().said, 4000)) &&
         (await page.evaluate(() => document.getElementById("hubSayWho").textContent)) === "Acorn");

      /* ---- look around first ---- */
      await hush();
      await page.click("#mLook");
      await page.waitForTimeout(900);
      const o = await page.evaluate(() => ({ greeting: document.getElementById("hub").classList.contains("greeting"),
        looked: JSON.parse(localStorage.getItem("chessroom_prefs") || "{}").looked,
        tabs: [].map.call(document.querySelectorAll(".hubTab"), (t) => t.getBoundingClientRect().width > 0).filter(Boolean).length,
        play: document.getElementById("mPlay").getBoundingClientRect().width > 0, st: __cr.hubState() }));
      ok(T("“Look around first” opens the whole room"), !o.greeting && o.tabs === 4 && o.play && o.st.at === 0 && o.st.door.dock, JSON.stringify(o));
      ok(T("…and it is remembered"), o.looked === true);
      ok(T("…with the dock's four notes run up as it stands"), (await heard("doors")).some((h) => h && JSON.stringify(h.ns) === JSON.stringify(Hub.PAGES.map((p) => p.note))),
         JSON.stringify(await heard("doors")));
      ok(T("the question stays until a game answers it, with the gold button as its second answer"),
         (await shown("#mWelcome")) && (await shown("#mNew")) && !(await shown("#mKnow")) && !(await shown("#mLook")));
      await page.reload();
      await ready();
      ok(T("…and a reload does not shut the room again"), !(await page.evaluate(() => document.getElementById("hub").classList.contains("greeting"))) && (await shown("#hubDock")));

      /* ---- the dock goes where it says ---- */
      for (let i = 1; i < Hub.PAGES.length; i++) {
        const p = Hub.PAGES[i];
        await hush();
        await page.click('.hubTab[data-page="' + p.id + '"]');
        const there = await settled(i);
        await page.waitForTimeout(120);       /* the last scroll event, a frame after the last scroll */
        const d = await page.evaluate((k) => {
          const tab = document.querySelectorAll(".hubTab")[k], pg = document.querySelectorAll(".hubPage")[k];
          const r = pg.getBoundingClientRect(), host = document.getElementById("hubPages").getBoundingClientRect();
          const pip = document.querySelector(".hubPip").getBoundingClientRect(), tr = tab.getBoundingClientRect();
          return { on: tab.classList.contains("on"), cur: pg.classList.contains("cur"), aria: tab.getAttribute("aria-current"),
                   others: document.querySelectorAll(".hubTab.on").length, inView: Math.abs(r.left - host.left) < 2,
                   pip: Math.abs((pip.left + pip.width / 2) - (tr.left + tr.width / 2)), p: +document.getElementById("hubDock").style.getPropertyValue("--p") };
        }, i);
        ok(T("the " + p.label + " door brings its page into view"), !!there && d.inView && d.cur, JSON.stringify(d));
        ok(T("…lit, the only one lit, and said so to a screen reader"), d.on && d.others === 1 && d.aria === "page", JSON.stringify(d));
        ok(T("…with the dock's light standing on it"), d.pip < 3 && Math.abs(d.p - i) < 0.01, JSON.stringify(d));
        const h = await heard("door");
        ok(T("…and it says its own note, out loud, once"), h.length === 1 && h[0].n === p.note && !h[0].soft, JSON.stringify(h));
      }

      /* ---- a page is a screen ---- */
      const fit = await page.evaluate((map) => {
        const out = { cut: [], scrolls: {}, missing: [] };
        [].forEach.call(document.querySelectorAll(".hubPage"), (pg) => {
          const id = pg.getAttribute("data-page"), pr = pg.getBoundingClientRect();
          out.scrolls[id] = pg.scrollHeight - pg.clientHeight;
          [].forEach.call(pg.querySelectorAll("button, a"), (el) => {
            const r = el.getBoundingClientRect();
            if (!r.width || el.closest("#mLadder")) return;
            if (r.left < pr.left - 1 || r.right > pr.right + 1) out.cut.push(el.id || el.className);
          });
        });
        Object.keys(map).forEach((k) => { const el = document.getElementById(k); if (!el || !el.closest('.hubPage[data-page="' + map[k] + '"]')) out.missing.push(k); });
        return out;
      }, Hub.ITEMS);
      ok(T("every key is on the page the map names"), fit.missing.length === 0, fit.missing.join(", "));
      ok(T("no key is cut off at the side of its page"), fit.cut.length === 0, fit.cut.join(", "));
      if (size.viewport.height >= 800) {
        ok(T("Friends, Learn and You are each one screen: nothing to scroll"),
           fit.scrolls.friends <= 1 && fit.scrolls.learn <= 1 && fit.scrolls.you <= 1, JSON.stringify(fit.scrolls));
      }

      /* ---- by a swipe, or a wheel ---- */
      await page.click('.hubTab[data-page="play"]');
      await settled(0);
      await hush();
      if (size.touch) {
        const box = await page.locator("#hubPages").boundingBox();
        /* first on the ladder, which scrolls for itself and must not hand the swipe on */
        await page.evaluate(() => document.getElementById("mLadder").scrollIntoView({ block: "center" }));
        await page.waitForTimeout(150);
        const lad = await page.locator("#mLadder").boundingBox();
        await drag(lad.x + lad.width * 0.85, lad.y + lad.height * 0.5, -lad.width * 0.75);
        await page.waitForTimeout(500);
        const kept = await page.evaluate(() => ({ at: __cr.hubState().at, left: document.getElementById("hubPages").scrollLeft, lad: document.getElementById("mLadder").scrollLeft }));
        ok(T("a swipe along the ladder moves the ladder, not the page"), kept.at === 0 && kept.left === 0 && kept.lad > 20, JSON.stringify(kept));
        await page.evaluate(() => { document.getElementById("hubPagePlay").scrollTop = 0; });
        await hush();
        await drag(box.x + box.width * 0.85, box.y + 36, -box.width * 0.7);
      } else {
        await page.evaluate(() => { const p = document.getElementById("hubPages"); p.scrollTo({ left: p.clientWidth, behavior: "smooth" }); });
      }
      const swiped = await settled(1);
      ok(T("a swipe walks to the next page, and the dock follows"), !!swiped && (await page.evaluate(() => document.querySelectorAll(".hubTab")[1].classList.contains("on"))),
         JSON.stringify(await st()) + " " + (await page.evaluate(() => document.getElementById("hubPages").scrollLeft)));
      const hs = await heard("door");
      ok(T("…and the page says its note under its breath"), hs.length === 1 && hs[0].n === Hub.PAGES[1].note && hs[0].soft === true, JSON.stringify(hs));

      /* ---- by the arrow keys ---- */
      await page.focus('.hubTab[data-page="friends"]');
      await page.keyboard.press("ArrowRight");
      const k1 = await settled(2);
      const f1 = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-page"));
      await page.keyboard.press("End");
      const k2 = await settled(3);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(200);
      const k3 = (await st()).at;
      await page.keyboard.press("Home");
      const k4 = await settled(0);
      ok(T("the arrow keys walk the dock, the focus going with them"), !!k1 && f1 === "learn" && !!k2 && k3 === 3 && !!k4, [!!k1, f1, !!k2, k3, !!k4].join(","));

      /* ---- the head of the card ---- */
      await page.click("#hubMe");
      ok(T("your level and number in the head lead to You"), !!(await settled(3)));

      /* ---- where it opens ---- */
      await page.click("#mSettings");
      await page.waitForFunction(() => !document.getElementById("ovSettings").classList.contains("hide"), null, { timeout: 5000 });
      await page.evaluate(() => __cr.showMenu());
      await page.waitForTimeout(250);
      ok(T("back from Settings the room is on You, where its key is"), (await st()).at === 3 && !!(await settled(3)));
      await page.click('.hubTab[data-page="learn"]');
      await settled(2);
      await page.click("#mAcademy");
      await page.waitForFunction(() => !document.getElementById("ovAcademy").classList.contains("hide"), null, { timeout: 8000 });
      await page.click("#academyBack");
      await page.waitForTimeout(250);
      ok(T("…and back from the Academy it is on Learn"), (await st()).at === 2 && !!(await settled(2)));

      /* ---- what is waiting ---- */
      const b0 = await page.evaluate(() => [].map.call(document.querySelectorAll(".hubTab .hubBadge"), (b) => !b.classList.contains("hide")));
      ok(T("with nothing waiting no door wears a badge"), b0.every((x) => !x), JSON.stringify(b0));
      await page.evaluate(() => __cr.startGame("coach", { humanSide: 1, skill: "acorn", clockStr: "none", fresh: true }));
      await page.waitForFunction(() => __cr.mode === "coach", null, { timeout: 15000 });
      await page.evaluate(() => { const g = __cr.game, mv = __cr.Chess.moves(g).find((m) => __cr.Chess.toSAN(g, m) === "e4"); __cr.commitMove(mv, "local"); });
      await page.waitForTimeout(300);
      await page.evaluate(() => __cr.showMenu());
      await page.waitForTimeout(300);
      const b1 = await page.evaluate(() => { const t = document.querySelector('.hubTab[data-page="play"]'), b = t.querySelector(".hubBadge");
        return { at: __cr.hubState().at, dot: b.classList.contains("dot") && !b.classList.contains("hide"), say: t.getAttribute("aria-label"),
                 resume: document.getElementById("mResume").getBoundingClientRect().width > 0,
                 others: [].filter.call(document.querySelectorAll(".hubTab .hubBadge"), (x) => !x.classList.contains("hide")).length }; });
      ok(T("after a game the room opens on Play"), b1.at === 0 && b1.resume, JSON.stringify(b1));
      ok(T("…and a game left waiting is a dot on its door, said out loud"), b1.dot && b1.others === 1 && /Play: .+ — a game is waiting/.test(b1.say), JSON.stringify(b1));

      /* ---- the host ---- */
      const h0 = await st();
      ok(T("the host is whoever is next on the road"), h0.host === "acorn", JSON.stringify(h0.host));
      await hush();
      await page.click("#hubHostBtn");
      await page.waitForTimeout(250);
      const h1 = await st();
      const said1 = h1.said;
      await page.click("#hubHostBtn");
      await page.waitForTimeout(250);
      const h2 = await st();
      ok(T("tapped, the host says something else each time, all of it its own"),
         said1 !== h0.said && h2.said !== said1 && [said1, h2.said].every((t) => Cast.CAST[h1.host].lines.door.concat(Cast.CAST[h1.host].lines.tip).indexOf(t) >= 0),
         [h0.said, said1, h2.said].join(" | "));
      if (h1.face) ok(T("…and does its own little thing"), !!h1.faceState.quirk || !!h2.faceState.quirk, JSON.stringify(h2.faceState));
      ok(T("…in its own voice"), (await heard("babble")).length >= 1);
      ok(T("the bubble ends with the whole line in it"),
         !!(await until(() => document.getElementById("hubSayTx").textContent === __cr.hubState().said, 4000)));
      await page.click("#mResume");
      await page.waitForFunction(() => document.getElementById("ovMenu").classList.contains("hide"), null, { timeout: 5000 });
      if (h1.face) ok(T("with the lobby away the host is asleep"), !!(await until(() => __cr.hubState().faceState.sleeping, 6000)), JSON.stringify((await st()).faceState));

      /* ---- a finished game opens the room for good ---- */
      await page.evaluate(() => localStorage.clear());
      await page.goto(base + "/chess/?v=2#force2d");
      await ready();
      await page.click("#mKnow");
      await page.waitForFunction(() => __cr.mode === "coach", null, { timeout: 15000 });
      ok(T("“I know how the pieces move” goes straight into a game"), (await page.evaluate(() => __cr.mode)) === "coach");
      await page.evaluate(() => __cr.showMenu());
      await page.waitForTimeout(300);
      /* a game under way is a game to come back to, so the question has been answered */
      ok(T("…and coming back to the door from it finds the whole room, and the way back to the game"),
         !(await page.evaluate(() => document.getElementById("hub").classList.contains("greeting"))) && (await shown("#mResume")) && (await shown("#hubDock")) && !(await shown("#mWelcome")));

      await ctx.close();
    }

    /* ---- reduced motion ---- */
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
    await ctx2.addInitScript(() => { if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify({ welcomed: true })); });
    const p2 = await ctx2.newPage();
    p2.on("pageerror", (e) => errs.push("reduced: " + e.message));
    await p2.goto(base + "/chess/#force2d");
    await p2.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone") && !document.getElementById("ovMenu").classList.contains("hide"), null, { timeout: 120000 });
    await p2.waitForTimeout(300);
    const r0 = await p2.evaluate(() => ({ typed: document.getElementById("hubSayTx").textContent === __cr.hubState().said, hi: document.querySelectorAll(".hubPage.hi").length }));
    ok("with reduced motion the host's line is simply there", r0.typed && r0.hi === 0, JSON.stringify(r0));
    await p2.click('.hubTab[data-page="you"]');
    const r1 = await p2.evaluate(() => { const p = document.getElementById("hubPages"); return { left: p.scrollLeft, w: p.clientWidth, at: __cr.hubState().at, hi: document.querySelectorAll(".hubPage.hi").length,
      moving: [].filter.call(document.querySelectorAll("#hub .hubSvg *"), (el) => getComputedStyle(el).animationName !== "none").length }; });
    ok("…a door is simply there too: no slide", Math.abs(r1.left - 3 * r1.w) < 2 && r1.at === 3, JSON.stringify(r1));
    ok("…and no picture waves", r1.hi === 0 && r1.moving === 0, JSON.stringify(r1));
    await ctx2.close();

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 4).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe front door is a place, and everything is still in it");
  process.exit(failed ? 1 : 0);
})();
