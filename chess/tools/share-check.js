/* share-check.js — dev-only. Does a game you send arrive whole?

   A game link is a stranger's text by the time it reaches anybody, so
   this check is mostly about the receiving end. In node it packs and
   unpacks games through share.js and proves the code is plain deflate
   (zlib can read it), that the plain fallback still opens, that the
   moves must replay legally or the whole link is refused, that the board
   outranks the result a link claims, that names lose anything that could
   be read as markup, and that the PGN it writes replays to the same
   final position.

   Then in a real browser, on a phone and on a laptop, it plays a game,
   sends it from the end card, and opens the link on a fresh page the way
   a friend would: the offer, the board, the names, stepping through,
   the receiver's own coach marking the blunder as it reads, playing on
   from the middle, a link to one moment with a question, and a damaged
   link that must be refused politely rather than thrown at.

   Needs `playwright-core` for the browser half; without it (or without
   chromium) the node half still runs and the browser half says it was
   skipped.

   Run: node chess/tools/share-check.js [--phone|--desk] [--node]       */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..", "..");
const Share = require("../share.js");
const Chess = require("../engine.js");
let failed = 0, passed = 0;
const ok = (what, cond, detail) => {
  if (cond) { passed++; console.log("ok    " + what); }
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

const SCHOLAR = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"];
/* a 70-ply game — a quiet Italian, then some wandering — long enough to
   say something about how long a real game's link is */
const LONG = ("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 a4 Ba7 h3 h6 Nbd2 Re8 " +
  "Nf1 Be6 Bxe6 Rxe6 Ng3 d5 exd5 Nxd5 Qb3 Qd7 Ne4 Rae8 Bd2 Nf6 Nxf6+ Rxf6 Re4 Rd6 Rae1 Kh8 " +
  "Qc4 f6 b4 Rd5 Nh4 Qf7 Qb5 b6 Qc4 Nd4 R1e2 Kg8 Qa2 Qf8 Bg5 Qf7 Qd2 Nf3+ Kh1 g6 Rf4 a5 Qe3 Rb5 Qd2 Ne1 Nf3 Kh7 Re3 f5").split(" ");

async function nodeHalf() {
  /* the fixture really is a game */
  let g = Chess.create(), legal = true;
  for (const s of LONG) { const m = Chess.fromSAN(g, s); if (!m) { legal = false; break; } Chess.play(g, m); }
  ok("the long fixture is a legal game of " + LONG.length + " plies", legal && LONG.length === 70);

  const p = Share.gamePayload({ sans: SCHOLAR, white: "Ana", black: "Sam", result: "white", reason: "checkmate",
    clock: "10+5", at: Date.UTC(2026, 10, 15, 12) });
  const code = await Share.pack("GAME", p);
  ok("a game packs as GAME1 (deflated)", /^GAME1\.[A-Za-z0-9_-]+$/.test(code), code);
  const back = await Share.unpack(code);
  ok("…and unpacks to the same payload", back && back.kind === "GAME" && JSON.stringify(back.obj) === JSON.stringify(p));
  const raw = zlib.inflateRawSync(Buffer.from(code.slice(6).replace(/-/g, "+").replace(/_/g, "/"), "base64")).toString();
  ok("the bytes are plain deflate-raw — any zlib reads them", raw === JSON.stringify(p));
  ok("a whole URL, wrapped by a messenger, still opens",
     !!(await Share.unpack("look at this https://kmay89.com/chess/#game=" + code.slice(0, 40) + "\n " + code.slice(40))));

  const longCode = await Share.pack("GAME", Share.gamePayload({ sans: LONG, white: "Ana", black: "Sam", result: null, at: Date.now() }));
  ok("a 70-ply game is a link under 700 characters", longCode.length < 700, longCode.length + " chars");

  /* the plain fallback, for a browser that cannot deflate */
  const CS = global.CompressionStream;
  global.CompressionStream = undefined;
  const plain = await Share.pack("GAME", p);
  global.CompressionStream = CS;
  ok("without deflate it falls back to GAME0", /^GAME0\./.test(plain), plain.slice(0, 12));
  const plainBack = await Share.unpack(plain);
  ok("…and GAME0 opens forever after", plainBack && JSON.stringify(plainBack.obj) === JSON.stringify(p));

  /* the receiver trusts nothing */
  const clean = Share.cleanGame(back.obj, Chess);
  ok("a clean game replays all its moves", clean && clean.sans.length === 7 && clean.sans[6] === "Qxf7#");
  ok("…and keeps its names, result, reason, clock and day",
     clean && clean.white === "Ana" && clean.black === "Sam" && clean.result === "white" &&
     clean.reason === "checkmate" && clean.clock === "10+5" && clean.day === "2026-11-15");
  const junk = ["GAME1.!!", "GAME1.AAAA", "GAME0.WzEsMl0", "nothing here", "", null, "GAME1." + "A".repeat(13000)];
  let allNull = true;
  for (const j of junk) { const r = await Share.unpack(j); if (r) allNull = false; }
  ok("junk codes unpack to nothing, and never throw", allNull);
  const bad = (o) => Share.cleanGame(Object.assign({}, p, o), Chess);
  ok("moves that are not strings are refused", bad({ s: [1, 2] }) === null);
  ok("a forty-character 'move' is refused", bad({ s: ["e4", "x".repeat(40)] }) === null);
  ok("an illegal move at ply five refuses the whole link", bad({ s: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Ke7x"] }) === null &&
     bad({ s: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Ra3"] }) === null);
  ok("more than 600 plies is refused", bad({ s: new Array(601).fill("e4") }) === null);
  ok("a payload that is not an object is refused", Share.cleanGame([1, 2], Chess) === null && Share.cleanGame("x", Chess) === null);
  const named = bad({ w: "<img src=x onerror=alert(1)>Mallory the very long name", b: "\u0007Bob" });
  ok("names lose markup and control characters, and are cut to 18", named && !/[<>]/.test(named.white) &&
     named.white.length <= 18 && named.black === "Bob", named && named.white);
  const liar = bad({ r: "0-1", y: "Black resigned" });
  ok("the board outranks the label: a mate on the board is White's win", liar && liar.result === "white" && liar.reason === "checkmate");
  const unfinished = Share.cleanGame(Share.gamePayload({ sans: ["e4", "e5"], white: "A", black: "B", result: null }), Chess);
  ok("an unfinished game stays unfinished", unfinished && unfinished.result === null && unfinished.reason === "");
  const pos = Share.cleanGame(Share.gamePayload({ sans: SCHOLAR.slice(0, 5), white: "A", black: "B", ply: 4,
    ask: "What is <b>White</b> threatening?", from: "Ana" }), Chess);
  ok("a position link keeps its ply and its question, without markup",
     pos && pos.ply === 4 && pos.ask === "What is bWhite/b threatening?" && pos.from === "Ana", pos && pos.ask);
  ok("a ply past the end is ignored, not trusted", bad({ p: 99 }).ply === -1);

  /* the words */
  const t = Share.text(clean, { opening: "Italian Game", url: "https://x/#game=" + code });
  ok("the share text leads with the players, the score and the opening",
     /^♟ Ana vs Sam · 1–0 \(checkmate\) · Italian Game · 4 moves\n/.test(t), t.split("\n")[0]);
  ok("…and the link comes second", t.split("\n")[1] === "https://x/#game=" + code);
  const pt = Share.text(pos, {});
  ok("a position's text asks its question", /move 3\. What is bWhite\/b threatening\?/.test(pt), pt);

  /* PGN */
  const pgn = Share.pgn(clean, { opening: "Italian Game" });
  ok("PGN carries the seven-tag roster", ["Event", "Site", "Date", "Round", "White", "Black", "Result"].every((k) => pgn.indexOf("[" + k + " ") >= 0));
  ok("PGN result and termination", /\[Result "1-0"\]/.test(pgn) && /\[Termination "checkmate"\]/.test(pgn) && /\[TimeControl "600\+5"\]/.test(pgn));
  ok("PGN movetext ends with the result", /4\. Qxf7# 1-0\n$/.test(pgn), pgn.slice(-30));
  const longPgn = Share.pgn(Share.cleanGame(Share.gamePayload({ sans: LONG, white: "A", black: "B" }), Chess));
  const body = longPgn.split("\n\n")[1];
  ok("PGN lines wrap at 79 columns", body.split("\n").every((l) => l.length <= 79));
  g = Chess.create();
  for (const w of body.replace(/\d+\./g, " ").split(/\s+/).filter((x) => x && x !== "*")) { const m = Chess.fromSAN(g, w); if (m) Chess.play(g, m); }
  const ref = Chess.create(); for (const s of LONG) Chess.play(ref, Chess.fromSAN(ref, s));
  ok("PGN movetext replays to the same final position", Chess.fen(g) === Chess.fen(ref));

  /* where the link points */
  ok("on the web the link is this page with #game=",
     Share.url(code, { protocol: "https:", origin: "https://kmay89.com", pathname: "/chess/" }) === "https://kmay89.com/chess/#game=" + code);
  ok("on file:// it is the bare code", Share.url(code, { protocol: "file:" }) === code);
}

/* ---------- the browser half ---------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;

const PLAY = `([san, src]) => {
  const g = __cr.game;
  const mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, '') === san.replace(/[+#]$/, ''));
  if (!mv) return false;
  __cr.commitMove(mv, src || 'local');
  return true;
}`;
const SIZES = [
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true },
  { name: "desk", viewport: { width: 1280, height: 820 }, touch: false }
].filter((s) => !process.argv.includes(s.name === "phone" ? "--desk" : "--phone"));

async function browserHalf() {
  if (process.argv.includes("--node")) return;
  if (!CHROME) { console.log("--    no chromium on this machine — the browser half is skipped"); return; }
  let pw;
  try { pw = require("playwright-core"); }
  catch (e) { console.log("--    playwright-core is not installed — the browser half is skipped"); return; }

  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
    ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css" };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

  for (const size of SIZES) {
    const T = (s) => size.name + ": " + s;
    const ctx = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, isMobile: size.touch });
    /* the 2D board: this check is about the link, not the light */
    await ctx.addInitScript(() => {
      try { if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify({ use3d: false, name: "Ana" })); } catch (e) {}
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(size.name + ": " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push(size.name + ": " + m.text()); });
    const play = (san) => page.evaluate(([f, a]) => eval(f)(a), [PLAY, [san]]);
    const settle = () => page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 6000 }).catch(() => {});
    let visit = 0;
    const open = async (hash) => {
      await page.goto(base + "/chess/?v=" + (++visit) + (hash || ""), { waitUntil: "load" });
      await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 30000 });
      await page.waitForTimeout(200);
    };
    const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById("toast").innerText) &&
      document.getElementById("toast").classList.contains("show"), re.source, { timeout: 12000 }).then(() => true, () => false);
    const tapToast = (label) => page.evaluate((l) => {
      const b = [...document.querySelectorAll("#toast .tact")].find((x) => x.textContent === l);
      if (b) b.click(); return !!b;
    }, label);

    try {
      await open();
      ok(T("the room boots"), await page.isVisible("#ovMenu"));

      /* ---- a game, sent from the end card ---- */
      await page.evaluate(() => __cr.startGame("pass", { clockStr: "none" }));
      for (const s of SCHOLAR) { await play(s); await page.waitForTimeout(40); }
      await settle();
      await page.waitForSelector("#ovEnd:not(.hide)", { timeout: 8000 }).catch(() => {});
      ok(T("the game ends and the card comes up"), await page.isVisible("#ovEnd"));
      ok(T("…offering to send the game"), await page.isVisible("#endSend"));
      await page.click("#endSend");
      await page.waitForSelector("#ovShare:not(.hide)", { timeout: 6000 }).catch(() => {});
      ok(T("the share card opens"), await page.isVisible("#ovShare"));
      const sheet = await page.evaluate(() => document.getElementById("shareTx").value);
      ok(T("…with a sentence and a #game= link"), /1–0 \(checkmate\)/.test(sheet) && /#game=GAME1\.[A-Za-z0-9_-]+$/.test(sheet), sheet);
      ok(T("…and a QR of the link"), await page.isVisible("#shareQR"));
      ok(T("…and a PGN to copy"), /\[Result "1-0"\]/.test(await page.evaluate(() => document.getElementById("shareTx").dataset.pgn)));
      await page.click("#shareBack");
      ok(T("Done goes back to the end card"), await page.isVisible("#ovEnd"));
      const code = (sheet.match(/#game=(GAME1\.[A-Za-z0-9_-]+)/) || [])[1];

      /* ---- a friend opens it ---- */
      await page.evaluate(() => localStorage.removeItem("chessroom_save"));
      await open("#game=" + code);
      ok(T("arriving by link is an offer, not a takeover"), await toastHas(/a game sent to you\. Open it\?/));
      ok(T("…and the address bar is tidied"), await page.evaluate(() => location.hash === ""));
      await tapToast("Open");
      await page.waitForFunction(() => __cr.mode === "review", null, { timeout: 8000 }).catch(() => {});
      const view = await page.evaluate(() => ({ mode: __cr.mode, n: __cr.game.played.length, ply: __cr.viewPly,
        lesson: document.body.classList.contains("lesson-on"), bar: document.getElementById("lessonBar").innerText,
        list: [...document.querySelectorAll("#moveList .m")].map((m) => m.title.split(" ")[0]).join(" ") }));
      ok(T("Open puts the game on the board, read-only"), view.mode === "review" && view.n === 7, JSON.stringify(view).slice(0, 120));
      ok(T("…at the first move"), view.ply === 0);
      ok(T("…with both names and the result in the bar"), /White vs Black · 1–0/i.test(view.bar), view.bar);
      ok(T("…and every move in the list"), view.list === "e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#", view.list);
      ok(T("the board takes no moves in a sent game"), await page.evaluate(() => {
        const g = __cr.game; const before = g.played.length;
        return before === 7 && __cr.mode === "review";
      }));
      await page.keyboard.press("ArrowRight");
      ok(T("→ steps forward"), (await page.evaluate(() => __cr.viewPly)) === 1);
      await page.evaluate(() => [...document.querySelectorAll("#lessonBar .lchip")].find((b) => b.textContent === "▶").click());
      await settle();
      ok(T("▶ steps forward, the move seen moving"), (await page.evaluate(() => __cr.viewPly)) === 2);
      /* the receiver's own coach reads it */
      await page.waitForFunction(() => __cr.sharedView && __cr.sharedView.done, null, { timeout: 60000 }).catch(() => {});
      const read = await page.evaluate(() => ({ done: __cr.sharedView && __cr.sharedView.done, marks: __cr.marksForTest(),
        bar: document.getElementById("lessonBar").innerText }));
      ok(T("the coach reads the whole game on arrival"), read.done, JSON.stringify(read).slice(0, 160));
      ok(T("…and marks 3…Nf6 as the blunder it was"), read.marks[5] === "??", JSON.stringify(read.marks));
      ok(T("…and says so in the bar"), /has read it/.test(read.bar), read.bar);
      /* play on from the middle */
      await page.evaluate(() => [...document.querySelectorAll("#lessonBar .lchip")].find((b) => /Play from here/.test(b.textContent)).click());
      await page.waitForSelector("#ovAsk:not(.hide)", { timeout: 4000 }).catch(() => {});
      ok(T("Play from here asks against whom"), await page.isVisible("#ovAsk"));
      await page.evaluate(() => [...document.querySelectorAll("#askRow button")].find((b) => /Two players/.test(b.textContent)).click());
      const on = await page.evaluate(() => ({ mode: __cr.mode, n: __cr.game.played.length, over: !!document.querySelector("#ovEnd:not(.hide)") }));
      ok(T("…and plays on from the move on the board"), on.mode === "pass" && on.n === 3, JSON.stringify(on));
      ok(T("…keeping it as a game you can come back to"), await page.evaluate(() => JSON.parse(localStorage.chessroom_save || "{}").sans.length === 3));
      /* against the coach it is friendly, and stays so over a reload */
      await page.evaluate(() => { __cr.showMenu(); });
      await open("#game=" + code);
      await toastHas(/Open it\?/); await tapToast("Open");
      await page.waitForFunction(() => __cr.mode === "review", null, { timeout: 8000 }).catch(() => {});
      await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
      await page.evaluate(() => [...document.querySelectorAll("#lessonBar .lchip")].find((b) => /Play from here/.test(b.textContent)).click());
      await page.waitForSelector("#ovAsk:not(.hide)", { timeout: 4000 }).catch(() => {});
      await page.evaluate(() => [...document.querySelectorAll("#askRow button")].find((b) => /coach/.test(b.textContent)).click());
      const coach = await page.evaluate(() => ({ mode: __cr.mode, n: __cr.game.played.length, save: JSON.parse(localStorage.chessroom_save || "{}") }));
      ok(T("against the coach, from move four, as the side to move"), coach.mode === "coach" && coach.n === 4 && coach.save.humanSide === 1, JSON.stringify(coach).slice(0, 120));
      ok(T("…a friendly game: saved as unrated"), coach.save.fr === 1);

      /* ---- one moment, with a question ---- */
      const posCode = await page.evaluate((s) => Share.pack("GAME", Share.gamePayload({ sans: s.slice(0, 5), white: "Ana", black: "Sam",
        ply: 4, ask: "What is White threatening?", from: "Ana" })), SCHOLAR);
      await open("#game=" + posCode);
      ok(T("a position link says what it is"), await toastHas(/From Ana: a position from Ana vs Sam, move 3/));
      await tapToast("Open");
      await page.waitForFunction(() => __cr.mode === "review", null, { timeout: 8000 }).catch(() => {});
      const pv = await page.evaluate(() => ({ ply: __cr.viewPly, bar: document.getElementById("lessonBar").innerText,
        o: __cr.renderer.orientation }));
      ok(T("…opens at that move"), pv.ply === -1 || pv.ply === 4, JSON.stringify(pv));
      ok(T("…asks the question"), /What is White threatening\?/.test(pv.bar) && /from Ana/.test(pv.bar), pv.bar);
      ok(T("…seen from the side that has to answer"), pv.o === -1);
      await page.evaluate(() => [...document.querySelectorAll("#lessonBar .lchip")].find((b) => b.textContent === "Done").click());
      ok(T("Done goes back to the room"), await page.isVisible("#ovMenu") && (await page.evaluate(() => __cr.mode)) === null);

      /* ---- a damaged link ---- */
      await open("#game=GAME1.AAAAthisisnotagame");
      ok(T("a damaged link is refused politely"), await toastHas(/looks damaged/));

      /* ---- a game in progress, from the lobby ---- */
      await page.evaluate(() => __cr.startGame("pass", { clockStr: "none" }));
      await play("d4"); await settle();
      await page.evaluate(() => __cr.showMenu());
      const chip = await page.evaluate(() => [...document.querySelectorAll("#gameOps .chip")].some((b) => /Send this game so far/.test(b.textContent)));
      ok(T("the lobby offers to send a game in progress"), chip);
      await page.evaluate(() => [...document.querySelectorAll("#gameOps .chip")].find((b) => /Send this game so far/.test(b.textContent)).click());
      await page.waitForSelector("#ovShare:not(.hide)", { timeout: 6000 }).catch(() => {});
      const soFar = await page.evaluate(() => document.getElementById("shareTx").value);
      ok(T("…as it stands"), /still going · .*1 move\n/.test(soFar), soFar);
      await page.keyboard.press("Escape");
      ok(T("Escape backs out of the share card to where it was opened"), await page.isVisible("#ovMenu"));

      ok(T("nothing shouted at the console"), errs.length === 0, errs.slice(0, 3).join(" | "));
    } catch (e) {
      failed++;
      console.log("FAIL  " + size.name + ": the check itself fell over  → " + (e && e.stack || e));
    }
    await ctx.close();
  }
  await browser.close();
  server.close();
}

(async () => {
  await nodeHalf();
  await browserHalf();
  console.log(failed ? "\n" + failed + " failed, " + passed + " passed"
                     : "\na game you send arrives whole  ·  " + passed + " checks");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
