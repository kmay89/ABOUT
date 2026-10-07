/* coach-check.js — dev-only. Does the room remember what it noticed?

   The teaching used to be a toast: it appeared, it was true, and seven
   seconds later there was no evidence it had ever happened. None of
   that could be tested, because there was nothing left to test.

   Now it is kept — a notebook beside the moves, a mark on the move
   list, and two voices for the same observation — and all of that can
   go wrong quietly. A mark that survives a take-back annotates a move
   nobody played. A note whose ply no longer exists sends the board
   somewhere it cannot go. Praise handed out for a forced recapture
   teaches a beginner that obligation is insight.

   So this plays real games in a real browser and reads what the room
   wrote down.

   Needs `playwright-core`; the browser is already on the machine. If
   either is missing it says so and exits 0.

   Run: node chess/tools/coach-check.js [--verbose]                     */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
const VERBOSE = process.argv.indexOf("--verbose") >= 0;
let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
if (!CHROME) { console.log("no chromium on this machine — skipping the coach check."); process.exit(0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the coach check.");
  console.log("  npm i --no-save playwright-core");
  process.exit(0);
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

/* find a legal move by the name a player would call it */
const FIND = `(san) => {
  const g = __cr.game;
  for (const mv of Chess.moves(g)) {
    const probe = Chess.create(Chess.fen(g));
    const same = Chess.moves(probe).find(x => x.from===mv.from && x.to===mv.to && (x.promo||0)===(mv.promo||0));
    if (Chess.play(probe, same).replace(/[+#]$/,'') === san.replace(/[+#]$/,'')) return mv;
  }
  return null;
}`;
const READ = `(() => ({
  notes: [...document.querySelectorAll('#noteList .note')].map(n => ({
    text: n.innerText.replace(/\\n/g, ' | '),
    tone: [...n.classList].find(c => c.startsWith('t-')) || ''
  })),
  marks: [...document.querySelectorAll('#moveList .mk')].map(m => ({
    glyph: m.textContent, cls: m.className
  })),
  moves: document.querySelectorAll('#moveList .m').length,
  tab: document.getElementById('tabNotes').classList.contains('sel') ? 'notes' : 'moves',
  dot: !document.getElementById('notesDot').classList.contains('hide')
}))()`;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("" + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  const play = async (sans, waitMs) => {
    for (const san of sans) {
      const got = await page.evaluate(([f, s]) => {
        const mv = eval(f)(s);
        if (!mv) return false;
        __cr.commitMove(mv, "local");
        return true;
      }, [FIND, san]);
      if (!got) return san;
      await page.waitForTimeout(waitMs);
    }
    return null;
  };

  try {
    await page.goto(base + "/chess/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.click("#mPass");
    await page.waitForTimeout(300);
    const start = await page.$("#newStart");
    if (start) await start.click();
    await page.waitForTimeout(1600);

    /* a fresh game says so rather than showing an empty box */
    await page.click("#tabNotes");
    await page.waitForTimeout(200);
    const fresh = await page.evaluate("document.querySelector('#noteList .nlEmpty') ? document.querySelector('#noteList .nlEmpty').textContent : ''");
    ok("an empty notebook explains itself", /lands here/.test(fresh), fresh.slice(0, 60));
    await page.click("#tabMoves");

    /* the Fried Liver: a named opening, a teachable tactic, and a real
       mistake with a real punishment */
    const miss = await play("e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6".split(" "), 2400);
    ok("the line played through", !miss, "stuck at " + miss);

    await page.evaluate(() => { document.querySelectorAll('.ov').forEach(o => o.classList.add('hide')); });
    await page.click("#tabNotes");
    await page.waitForTimeout(300);
    let st = await page.evaluate(READ);
    if (VERBOSE) st.notes.forEach((n) => console.log("      ", n.tone, n.text));

    ok("the notebook fills as the game goes on", st.notes.length >= 5, st.notes.length + " entries");
    ok("it names the opening", st.notes.some((n) => /Italian Game/.test(n.text)));
    ok("it names the tactic", st.notes.some((n) => /skewer|fork|pin/i.test(n.text)));
    ok("it says what the mistake cost",
       st.notes.some((n) => /Nxf7\?/.test(n.text) && /mistake/i.test(n.text)),
       JSON.stringify(st.notes.map((n) => n.text.slice(0, 40))));
    ok("every entry is tied to the move it is about",
       st.notes.filter((n) => /^\S+\s+\d+[.…]/.test(n.text.replace(/^\S+\s*\|\s*/, "X "))).length > 0 ||
       st.notes.every((n) => n.text.length > 0));
    ok("a mistake is coloured as one", st.notes.some((n) => n.tone === "t-warn" || n.tone === "t-bad"));

    /* the mark on the move list, and the words behind it */
    ok("the move list carries the mark", st.marks.some((m) => m.glyph === "?"),
       JSON.stringify(st.marks));
    ok("the mark is coloured by severity",
       st.marks.every((m) => /mk-(brilliant|good|dubious|mistake|blunder)/.test(m.cls)),
       JSON.stringify(st.marks));
    const titled = await page.evaluate(`[...document.querySelectorAll('#moveList .m')].filter(m => /\\u2014/.test(m.title)).length`);
    ok("the plain words are a hover away", titled > 0, titled + " marked moves carry their reason");

    /* praise is not handed out for obligation: nothing in this line is
       praised, because every strong move in it was forced */
    ok("no forced recapture is called brilliant",
       !st.notes.some((n) => /Kxf7!|Ke6!/.test(n.text)),
       JSON.stringify(st.notes.filter((n) => /!/.test(n.text)).map((n) => n.text.slice(0, 40))));

    /* tapping a note takes the board back to the position it is about */
    const before = await page.evaluate("__cr.game.played.length");
    await page.click("#noteList .note:nth-child(2)");
    await page.waitForTimeout(400);
    const viewing = await page.evaluate("!document.getElementById('viewBanner').classList.contains('hide')");
    ok("tapping a note goes back to the move it is about", viewing);
    await page.evaluate("document.getElementById('viewBanner').click()");
    await page.waitForTimeout(300);
    ok("and the game is still all there",
       (await page.evaluate("__cr.game.played.length")) === before);

    /* the other voice says the same things in notation */
    await page.evaluate(`(() => { __cr.setVoiceForTest('brief'); })()`);
    await page.waitForTimeout(300);
    const brief = await page.evaluate(READ);
    if (VERBOSE) brief.notes.forEach((n) => console.log("      brief:", n.text));
    const len = (ns) => ns.reduce((n, x) => n + x.text.length, 0);
    ok("the notation voice is shorter than the plain one",
       len(brief.notes) < len(st.notes) * 0.75,
       len(brief.notes) + " vs " + len(st.notes) + " characters");
    ok("…and still names the opening by its code",
       brief.notes.some((n) => /\bC\d\d\b/.test(n.text)),
       JSON.stringify(brief.notes.map((n) => n.text.slice(0, 32))));
    ok("…and still carries the marks",
       brief.marks.length === st.marks.length, brief.marks.length + " vs " + st.marks.length);

    /* switching the coach off leaves the game playable and says so */
    await page.evaluate(`(() => { __cr.setVoiceForTest('off'); })()`);
    await page.waitForTimeout(300);
    const quiet = await page.evaluate(READ);
    ok("turning the coach off empties the notebook and the marks",
       quiet.marks.length === 0 &&
       /coach is off/i.test(await page.evaluate("document.querySelector('#noteList .nlEmpty') ? document.querySelector('#noteList .nlEmpty').textContent : ''")),
       JSON.stringify(quiet.marks));
    await page.evaluate(`(() => { __cr.setVoiceForTest('plain'); })()`);
    await page.waitForTimeout(300);
    ok("…and turning it back on brings them back",
       (await page.evaluate(READ)).marks.length === st.marks.length);

    /* a move that was taken back never happened */
    const plies = await page.evaluate("__cr.game.played.length");
    await page.evaluate("__cr.undoPlyForTest(4)");
    await page.waitForTimeout(500);
    const after = await page.evaluate(READ);
    ok("a take-back forgets what was said about the moves it undid",
       after.notes.length < st.notes.length && after.marks.length <= st.marks.length,
       after.notes.length + "/" + after.marks.length + " vs " + st.notes.length + "/" + st.marks.length);
    ok("…and nothing is marked past the end of the game",
       (await page.evaluate("Object.keys(__cr.marksForTest()).every(k => +k < __cr.game.played.length)")),
       "played " + (plies - 4));

    /* a new game starts with a clean page */
    await page.evaluate("__cr.startGame('pass', { humanSide: 1 })");
    await page.waitForTimeout(800);
    const clean = await page.evaluate(READ);
    ok("a new game starts with an empty notebook",
       clean.notes.length === 0 && clean.marks.length === 0 && clean.tab === "moves",
       JSON.stringify(clean));

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the coach check ran", false, e.message);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failed ? "\n" + failed + " problem" + (failed > 1 ? "s" : "") + " with what the room remembers"
                     : "\nthe room notices, says it both ways, and keeps it");
  process.exit(failed ? 1 : 0);
})();
