/* rules-check.js — are the rules shown, and is everything shown true?

   The rules of chess are taught on the board now (rules.js, and "the
   rules, shown" in app.js): the board does it, then you do it. This
   holds the course to what it says of itself:
     - words are a caption, not the lesson: one short line a step, and
       every show step has something on the board to look at;
     - every position is real: each shown move is the engine's own, each
       lit reach is exactly how that piece moves, each red square really
       is attacked;
     - a piece on its own is on its own, and still moves by the rules: in
       every position a lone-piece task can reach, what the engine calls
       legal is what the piece can do;
     - every task can be done, in a few moves, and Help always points at
       the next move of a shortest way; an answer that is not it is
       refused with the step's own line, and a stalemate is caught;
     - check has three ways out and each is named for what it was;
     - what you have finished is kept, and junk in the store costs
       nothing.
   Then a browser, on a phone, flat and carved: the door leads to the
   board and not to a card; a reach is lit and the piece moves by
   itself; every task in the course is played to the end with real
   taps; wrong answers, the red squares, Help, the dots, leaving, and a
   game started halfway through a show.

   Run: node chess/tools/rules-check.js                                    */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
const Chess = require("../engine.js");
const Rules = require("../rules.js");
const Learn = require("../learn.js");
let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};
const HTML = fs.readFileSync(path.join(ROOT, "chess", "index.html"), "utf8");
const APP = fs.readFileSync(path.join(ROOT, "chess", "app.js"), "utf8");
const SW = fs.readFileSync(path.join(ROOT, "chess", "sw.js"), "utf8");
const name = (sq) => Chess.sqName(sq);
const hasBoth = (fen) => /k/.test(fen.split(" ")[0]) && /K/.test(fen.split(" ")[0]);

/* ================= the course ================= */
const COURSE = Rules.COURSE;
const ALL = [];                      /* every step, laid out, with its scene */
let layErr = null;
COURSE.forEach((sc, i) => { try { Rules.steps(i).forEach((st) => ALL.push({ sc, i, st })); } catch (e) { layErr = layErr || e.message; } });

(function () {
  ok("the course lays out: every position given or carried on, every shown move legal", !layErr, layErr);
  const ids = COURSE.map((c) => c.id);
  ok("thirteen scenes, each with a name of its own", COURSE.length === 13 && new Set(ids).size === 13 && COURSE.every((c) => c.name && c.steps.length));
  const wide = COURSE.filter((c) => !(typeof c.mark === "number" ? c.mark >= 1 && c.mark <= 6 : Array.from(String(c.mark).replace(/︎/g, "")).length === 1));
  ok("every scene's mark is a piece or one character: it has to fit a dot", wide.length === 0, wide.map((c) => c.id + ":" + c.mark).join(", "));
  ok("every piece has a scene, and so do check, mate, castling, en passant and the draw",
     [1, 2, 3, 4, 5, 6].every((k) => COURSE.some((c) => c.mark === k)) && ["check", "mate", "castle", "passing", "draw"].every((id) => ids.indexOf(id) >= 0));
  ok("the idea of the game comes first, and how to start a game last", ids[0] === "goal" && ids[ids.length - 1] === "start");
  ok("every scene begins by showing", COURSE.every((c, i) => Rules.steps(i)[0].show));
  const doless = COURSE.filter((c, i) => !Rules.steps(i).some((s) => s.goal)).map((c) => c.id);
  ok("every rule you can try, you do try (only the idea and the opening are watched)", JSON.stringify(doless) === JSON.stringify(["goal", "start"]), doless.join(","));

  /* words are a caption */
  const long = ALL.filter((x) => !x.st.say || x.st.say.length > Rules.SAY_MAX);
  ok("one line a step, short enough to read at a glance (" + Rules.SAY_MAX + " characters)", long.length === 0, long.map((x) => x.sc.id + ": " + x.st.say).join(" | "));
  const marked = ALL.filter((x) => /[<>&]/.test(x.st.say + x.st.no + x.st.won + x.st.stale));
  ok("…plain words: nothing in them to be read as markup", marked.length === 0);
  const words = ALL.reduce((a, x) => a + x.st.say.split(/\s+/).length, 0);
  ok("the whole course is said in under 350 words (" + words + "): the old cards took over 600", words < 350, String(words));
  const bare = ALL.filter((x) => x.st.show && !(x.st.reach || x.st.line.length || x.st.rings.length || x.st.arrows.length || x.st.danger));
  ok("every show step has something on the board to look at", bare.length === 0, bare.map((x) => x.sc.id + "#" + x.st.n).join(", "));
  const mute = ALL.filter((x) => x.st.goal && !x.st.goal.clear && !x.st.goal.reach && !x.st.goal.any && !x.st.no);
  ok("every task with a wrong answer has a line for it", mute.length === 0, mute.map((x) => x.sc.id + "#" + x.st.n).join(", "));
  ok("a scene asked for by a silly number is the nearest real one",
     Rules.scene(-3).id === "goal" && Rules.scene(99).id === "start" && Rules.scene(NaN).id === "goal" && Rules.index("nope") === -1);
})();

/* ================= what the board shows is true ================= */
(function () {
  /* how each piece moves, from the middle of an empty board */
  const WANT = { rook: 14, bishop: 13, queen: 27, knight: 8, king: 8 };
  const got = {};
  Object.keys(WANT).forEach((id) => { const st = Rules.steps(Rules.index(id))[0], r = Rules.reach(st.fen, st.reach); got[id] = r.to.length + r.takes.length; });
  ok("a piece's lit reach from d4 is that piece's move: 14, 13, 27, 8 and 8 squares", JSON.stringify(got) === JSON.stringify(WANT), JSON.stringify(got));
  const rookTo = Rules.reach(Rules.steps(Rules.index("rook"))[0].fen, "d4").to.map(name);
  ok("…the rook's along its rank and file and nowhere else", rookTo.every((n) => n[0] === "d" || n[1] === "4"), rookTo.join(","));
  const bishTo = Rules.reach(Rules.steps(Rules.index("bishop"))[0].fen, "d4").to;
  ok("…the bishop's all on one colour", new Set(bishTo.map((s) => ((s & 7) + (s >> 4)) % 2)).size === 1);
  const knTo = Rules.reach(Rules.steps(Rules.index("knight"))[0].fen, "d4").to.map((s) => [Math.abs((s & 7) - 3), Math.abs((s >> 4) - 3)].sort().join(""));
  ok("…the knight's every one an L", knTo.every((d) => d === "12"));
  const pawn = Rules.steps(Rules.index("pawn"));
  const p0 = Rules.reach(pawn[0].fen, "e2"), p1 = Rules.reach(pawn[1].fen, "e4");
  ok("a pawn at home may go one or two; it walks straight and takes diagonally",
     p0.to.map(name).sort().join() === "e3,e4" && p0.takes.length === 0 && p1.to.map(name).join() === "e5" && p1.takes.map(name).sort().join() === "d5,f5",
     JSON.stringify([p0.to.map(name), p1.to.map(name), p1.takes.map(name)]));
  const wall = Rules.steps(Rules.index("knight"))[1];
  ok("the knight is shown behind a wall of its own pawns, and still has somewhere to go", /PPP/.test(wall.fen) && Rules.reach(wall.fen, wall.reach).to.length >= 2);

  /* the red squares */
  const kingSt = Rules.steps(Rules.index("king"))[1], red = Rules.danger(kingSt.fen), g = Chess.create(kingSt.fen);
  ok("every red square really is attacked, and none that is attacked is left out",
     red.length === 14 && red.every((s) => Chess.attacked(g, s, Chess.BLACK)) &&
     [...Array(128).keys()].filter((s) => !(s & 0x88) && g.board[s] >= 0 && Chess.attacked(g, s, Chess.BLACK)).length === red.length, red.map(name).join(","));
  const kr = Rules.reach(kingSt.fen, kingSt.reach).to;
  ok("…and the king's lit squares never include one", kr.length === 5 && kr.every((s) => red.indexOf(s) < 0), kr.map(name).join(","));

  /* the cage */
  const caged = ALL.filter((x) => x.st.cage);
  let bad = null;
  caged.forEach((x) => {
    const g2 = Chess.create(x.st.end), k = Chess.sqIndex(x.st.cage), bars = Rules.cage(x.st.end, x.st.cage), free = Chess.movesFrom(g2, k);
    const s = Chess.status(g2);
    if (g2.board[k] !== -Chess.K) bad = bad || x.sc.id + ": no black king on " + x.st.cage;
    if (!bars.length) bad = bad || x.sc.id + ": a cage with no bars";
    if (free.length) bad = bad || x.sc.id + ": the caged king can move";
    if (s.reason !== "checkmate" && s.reason !== "stalemate") bad = bad || x.sc.id + ": " + s.reason;
  });
  ok("a cage is only drawn round a king who truly cannot move (" + caged.length + " of them)", caged.length === 3 && !bad, bad);
  const ends = { goal: "checkmate", mate: "checkmate", draw: "stalemate" };
  ok("the idea ends in checkmate, the mate scene in checkmate, the draw in stalemate",
     Object.keys(ends).every((id) => { const st = Rules.steps(Rules.index(id)).filter((s) => s.show).pop(); return Chess.status(Chess.create(st.end)).reason === ends[id]; }));

  /* the shows of check */
  const chk = Rules.steps(Rules.index("check")), shows = chk.filter((s) => s.show);
  const g0 = Chess.create(shows[0].fen);
  const ways = shows.slice(1).map((s) => { const m = Rules.findSAN(Chess.create(s.fen), s.line[0].san); return Math.abs(m.piece) === Chess.K ? "away" : m.capt ? "took" : "blocked"; });
  ok("check is shown as check, and then its three ways out, each one once",
     Chess.inCheck(g0) && JSON.stringify(ways) === JSON.stringify(["away", "blocked", "took"]) && shows.slice(1).every((s) => s.fen === shows[0].fen), ways.join(","));
  ok("…and none of the three happens to end the game", shows.slice(1).every((s) => !Chess.status(Chess.create(s.end)).over));
  const arrows = ALL.filter((x) => x.st.arrows.length);
  ok("an arrow drawn as a threat is one: that man does attack that square",
     arrows.every((x) => x.st.arrows.every((a) => { const g2 = Chess.create(x.st.fen); return g2.board[Chess.sqIndex(a[0])] !== 0 && Chess.attacked(g2, Chess.sqIndex(a[1]), g2.board[Chess.sqIndex(a[0])] > 0 ? 1 : -1); })));

  /* the opening */
  const start = Rules.steps(Rules.index("start"));
  ok("a good start is played from the real starting position, one idea a step: a centre pawn, knights, bishops, castling",
     start[0].fen === Chess.START_FEN && start.map((s) => s.line.map((l) => l.san).join(" ")).join(" | ") === "e4 e5 | Nf3 Nc6 | Bc4 Bc5 | O-O");
  const cas = Rules.steps(Rules.index("castle"));
  ok("castling is shown with the king going two and the rook hopping over",
     /R4RK1$|5RK1$/.test(cas[0].end.split(" ")[0]) && cas[0].line[0].san === "O-O", cas[0].end);
  const ep = Rules.steps(Rules.index("passing"));
  ok("en passant is shown whole: the pawn runs past, and is taken on the square it skipped",
     ep[0].line.map((l) => l.san).join(" ") === "d5 exd6" && !/p/.test(ep[0].end.split(" ")[0]));
})();

/* ================= your turn ================= */
(function () {
  const tasks = ALL.filter((x) => x.st.goal);
  ok("there are tasks to do (" + tasks.length + ")", tasks.length >= 11);

  /* every one can be done, soon, and Help knows how */
  let bad = null, longest = 0;
  tasks.forEach((x) => {
    const where = x.sc.id + "#" + x.st.n, path = Rules.solve(x.st);
    if (!path) { bad = bad || where + " cannot be done"; return; }
    longest = Math.max(longest, path.length);
    let fen = x.st.fen, done = false;
    path.forEach((mv, i) => {
      const g = Chess.create(fen), m = Chess.moves(g).filter((c) => c.from === mv.from && c.to === mv.to && (!c.promo || Math.abs(c.promo) === Chess.Q))[0];
      if (!m) { bad = bad || where + ": " + mv.san + " is not a move"; return; }
      const h = Rules.hint(x.st, fen);
      if (!h || h.from !== mv.from || h.to !== mv.to) bad = bad || where + ": Help does not point at the next move of the way";
      const r = Rules.attempt(x.st, fen, m);
      if (!r.ok) bad = bad || where + ": its own answer is refused";
      if (r.done !== (i === path.length - 1)) bad = bad || where + ": done at the wrong move";
      fen = r.fen; done = r.done;
    });
    if (!done) bad = bad || where + " does not finish";
  });
  ok("every task can be done, its own answer is accepted, and Help points along a shortest way", !bad, bad);
  ok("…in five moves or fewer", longest <= 5, String(longest));

  /* a piece on its own still moves by the rules: explore everything a free task can reach */
  let odd = null, seenAll = 0;
  tasks.filter((x) => x.st.free).forEach((x) => {
    const seen = {}, queue = [x.st.fen];
    seen[x.st.fen] = 1;
    while (queue.length && seenAll < 20000) {
      const fen = queue.shift(), g = Chess.create(fen);
      seenAll++;
      const board = fen.split(" ")[0];
      if (fen.split(" ")[1] !== "w" || fen.split(" ")[3] !== "-") odd = odd || x.sc.id + ": a free position that is not simply White to move";
      /* with no white king on the board the engine guards a1 instead: nothing may ever attack it */
      if (!/K/.test(board) && Chess.attacked(g, 0, Chess.BLACK)) odd = odd || x.sc.id + ": a1 is attacked in " + fen;
      if (/k/.test(board)) odd = odd || x.sc.id + ": a black king in a lone-piece task";
      Chess.moves(g).forEach((m) => {
        const r = Rules.attempt(x.st, fen, m);
        if (r.ok && !r.done && !seen[r.fen]) { seen[r.fen] = 1; queue.push(r.fen); }
      });
      /* never stuck: from anywhere it can reach, the task can still be finished */
      if (!Rules.solve(x.st, fen)) odd = odd || x.sc.id + ": stuck in " + fen;
    }
  });
  ok("in every position a lone-piece task can reach (" + seenAll + "), the piece moves by its own rule and the task can still be finished", !odd && seenAll > 100, odd);

  /* pawns to take are counted */
  const clears = tasks.filter((x) => x.st.goal.clear);
  ok("the take-them-all tasks each have three pawns, counted down to none",
     clears.length === 4 && clears.every((x) => Rules.left(x.st.fen) === 3 && Rules.solve(x.st).length === 3 &&
       Rules.left(Rules.solve(x.st).reduce((fen, mv) => Rules.attempt(x.st, fen, Chess.moves(Chess.create(fen)).filter((c) => c.from === mv.from && c.to === mv.to)[0]).fen, x.st.fen)) === 0));

  /* a wrong answer is refused, with the step's own line, and nothing moves */
  let soft = null;
  tasks.filter((x) => x.st.goal.play || x.st.goal.mate).forEach((x) => {
    const g = Chess.create(x.st.fen), wrong = Chess.moves(g).filter((m) => { const r = Rules.attempt(x.st, x.st.fen, m); return !r.ok; });
    if (!wrong.length) return;          /* the one legal move is the answer: a wrong tap there is not a move (the browser half) */
    wrong.forEach((m) => {
      const r = Rules.attempt(x.st, x.st.fen, m);
      if (r.done || r.fen !== x.st.fen || !r.say) soft = soft || x.sc.id + ": a wrong " + r.san + " is let through, or says nothing";
    });
  });
  ok("an answer that is not it is refused with a line of its own, and the position stays", !soft, soft);

  /* mates are mates */
  const mates = tasks.filter((x) => x.st.goal.mate);
  ok("every accepted checkmate is checkmate, by the engine's word",
     mates.length === 2 && mates.every((x) => Rules.answers(x.st).length >= 1 && Rules.answers(x.st).every((san) => {
       const g = Chess.create(x.st.fen); Chess.play(g, Rules.findSAN(g, san)); return Chess.status(g).reason === "checkmate"; })));
  const draw = Rules.steps(Rules.index("draw")).filter((s) => s.goal)[0], gd = Chess.create(draw.fen);
  const stale = Chess.moves(gd).map((m) => Rules.attempt(draw, draw.fen, m)).filter((r) => r.undo);
  ok("the move that stalemates is caught: shown, named, and taken back",
     stale.length >= 1 && stale.every((r) => !r.ok && /Stalemate/.test(r.say) && r.fen === draw.fen && Chess.status(Chess.create(r.shown)).reason === "stalemate"),
     stale.map((r) => r.san).join(","));

  /* out of check, three ways */
  const esc = Rules.steps(Rules.index("check")).filter((s) => s.goal)[0], ge = Chess.create(esc.fen);
  const waysOut = Chess.moves(ge).map((m) => Rules.attempt(esc, esc.fen, m));
  ok("your own check can be got out of all three ways, and each is told which it was",
     Chess.inCheck(ge) && waysOut.every((r) => r.ok && r.done) && ["away", "blocked", "took"].every((w) => waysOut.some((r) => r.way === w)),
     waysOut.map((r) => r.san + ":" + r.way).join(" "));

  /* castling either side; the pawn that becomes a queen */
  const cas = Rules.steps(Rules.index("castle")).filter((s) => s.goal)[0];
  ok("castling either way is castling", Rules.answers(cas).sort().join() === "O-O,O-O-O");
  const march = Rules.steps(Rules.index("pawn")).filter((s) => s.goal && s.goal.reach)[0], way = Rules.solve(march);
  ok("the pawn marches to the far side and is a queen when it gets there",
     way[way.length - 1].san === "c8=Q" && /becomes a queen/.test(march.won), way.map((m) => m.san).join(" "));
  ok("a step with nothing to do has no answer and no hint",
     Rules.solve(Rules.steps(0)[0]) === null && Rules.hint(Rules.steps(0)[0]) === null && Rules.answers(Rules.steps(0)[0]).length === 0);
})();

/* ================= what you have done ================= */
(function () {
  const f = Rules.fresh();
  ok("nothing done to begin with: the course picks up at the start", Rules.count(f) === 0 && Rules.resume(f) === 0 && f.at === "goal");
  let s = Rules.finish(f, "goal");
  s = Rules.finish(s, "rook");
  ok("a scene finished is kept, and the course picks up at the first one not done", Rules.count(s) === 2 && Rules.resume(s) === 2 && s.at === "bishop");
  s = Rules.finish(s, "knight");
  ok("…wherever else you have been", Rules.resume(s) === 2 && s.at === "king");
  let all = Rules.fresh(); COURSE.forEach((c) => { all = Rules.finish(all, c.id); });
  ok("with everything done it starts again from the top", Rules.count(all) === 13 && Rules.resume(all) === 0 && all.at === "start");
  ok("a scene nobody wrote cannot be finished", Rules.count(Rules.finish(f, "en-croissant")) === 0);
  const junk = [null, 7, "x", [], { done: "all" }, { done: { goal: 1, hack: 1, rook: 0 }, at: "<b>" }, { v: 99, done: { __proto__: { king: 1 } } }];
  ok("junk in the store costs nothing: what is real is kept, the rest is dropped",
     junk.every((j) => { const c = Rules.clean(j); return c.v === 1 && typeof c.done === "object" && Rules.index(c.at) >= 0 && Object.keys(c.done).every((k) => Rules.index(k) >= 0); }) &&
     JSON.stringify(Rules.clean(junk[5]).done) === '{"goal":1}' && Rules.count(Rules.clean(junk[6])) === 0);
  const store = {};
  Rules.save(s, (k, v) => { store[k] = v; });
  ok("saved and read back the same", JSON.stringify(Rules.load((k) => store[k])) === JSON.stringify(Rules.clean(s)) && Object.keys(store).join() === Rules.KEY);
  ok("a store that throws, or holds half a sentence, reads as nothing done",
     Rules.count(Rules.load(() => { throw new Error("no"); })) === 0 && Rules.count(Rules.load(() => '{"done":')) === 0);
})();

/* ================= the room is wired for it ================= */
(function () {
  ok("rules.js is loaded after the engine and before the conductor, and kept for offline",
     HTML.indexOf('<script src="engine.js"></script>') < HTML.indexOf('<script src="rules.js"></script>') &&
     HTML.indexOf('<script src="rules.js"></script>') < HTML.indexOf('<script src="app.js"></script>') && /'\.\/rules\.js'/.test(SW));
  ok("the card of words is gone: no rules overlay in the page, no pages of text in the conductor",
     !/id="ovLearn"|id="learnBody"/.test(HTML) && !/\bLEARN\b|showLearn/.test(APP));
})();

/* ---------------- a browser ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." : "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe rules are true (the board was not watched)");
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
  try {
    for (const board of ["flat", "carved"]) {
      const T = (s) => board + ": " + s;
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errs.push(board + ": " + e.message));
      page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(board + ": " + m.text()); });
      const url = base + "/chess/" + (board === "flat" ? "#force2d" : "");
      const ready = async () => {
        await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone") &&
          !document.getElementById("ovMenu").classList.contains("hide"), null, { timeout: 120000 });
        await page.waitForTimeout(300);
      };
      const st = () => page.evaluate(() => __cr.rulesState());
      const idle = () => page.waitForFunction(() => { const x = __cr.rulesState(); return !x || (!x.busy && !__cr.renderer.isAnimating()); }, null, { timeout: 20000 }).then(() => true, () => false);
      const at = (sq) => page.evaluate((n) => { const R = __cr.renderer, q = R.squareToScreen(n, 0.3), cv = document.getElementById(R.kind === "3d" ? "cv3" : "cv2").getBoundingClientRect(); return { x: cv.left + q.x, y: cv.top + q.y }; }, sq);
      const tap = async (sq) => { const q = await at(typeof sq === "string" ? Chess.sqIndex(sq) : sq); await page.touchscreen.tap(q.x, q.y); await page.waitForTimeout(board === "flat" ? 140 : 260); };
      /* straight to a step of a scene, by the same doors the bar's keys use */
      const goto = async (id, n) => {
        await page.evaluate(([x, k]) => { __cr.startRules(__cr.Rules.index(x)); for (let i = 0; i < k; i++) __cr.rulesNext(); }, [id, n]);
        await page.waitForTimeout(350);
      };

      await page.goto(url);
      await page.evaluate(() => localStorage.clear());
      await page.goto(base + "/chess/?r=1" + (board === "flat" ? "#force2d" : ""));
      await ready();

      /* ---- the door leads to the board ---- */
      await page.click("#mNew");
      await page.waitForFunction(() => __cr.mode === "setup", null, { timeout: 10000 });
      const card = await page.evaluate(() => document.getElementById("lessonBar").textContent);
      ok(T("setting up says which piece it is in a few words, and leaves how it moves to be shown"), /castle tower/.test(card) && !/slides|straight lines/.test(card), card.slice(0, 90));
      await page.click("#suSkip");
      await page.waitForFunction(() => __cr.mode === "rules", null, { timeout: 10000 });
      const door = await page.evaluate(() => ({ s: __cr.rulesState(), cards: document.querySelectorAll("body > .ov:not(.hide)").length,
        bar: document.getElementById("lessonBar").className, dots: document.querySelectorAll(".rlDot").length,
        board: (() => { const r = document.getElementById(__cr.renderer.kind === "3d" ? "cv3" : "cv2").getBoundingClientRect(); return r.height; })() }));
      ok(T("the rules open on the board, with no card over it"), door.s.scene === "goal" && door.cards === 0 && /rules/.test(door.bar) && door.board > 300, JSON.stringify(door).slice(0, 200));
      ok(T("…and a dot for every scene"), door.dots === 13);
      const g1 = await page.waitForFunction(() => { const x = __cr.rulesState(); return x && x.shown; }, null, { timeout: 40000 }).then(() => true, () => false);
      const idea = await st();
      ok(T("the idea is shown, not said: the queen goes in, the king is mated, and the bars of his cage light up"),
         g1 && idea.n === 1 && /^7k\/6Q1\//.test(idea.fen) && idea.heat.length === 3, JSON.stringify({ n: idea.n, fen: idea.fen, heat: idea.heat }));

      /* ---- a reach is lit, then the piece moves by itself ---- */
      await goto("rook", 0);
      await page.waitForTimeout(600);
      let s = await st();
      ok(T("the rook's reach is lit: a dot on every square, a ray along every line"),
         s.lit.length === 14 && s.lines.filter((l) => l.kind === "sight").length === 4 && s.sel === Chess.sqIndex("d4"), JSON.stringify({ lit: s.lit.length, lines: s.lines.length }));
      /* a tap while watching rubs nothing out */
      await tap("g7");
      ok(T("…and a tap on the board while watching rubs nothing out"), (await st()).lit.length === 14);
      const moved = await page.waitForFunction(() => { const x = __cr.rulesState(); return x && x.n === 1 && x.shown; }, null, { timeout: 40000 }).then(() => true, () => false);
      s = await st();
      ok(T("then it moves by itself, up the file and along the rank, and waits for you"), moved && /^7R\//.test(s.fen) && !s.busy, s.fen);
      const chips = await page.evaluate(() => [].map.call(document.querySelectorAll("#lessonBar .lchip"), (c) => c.textContent));
      ok(T("…with one gold key: My turn"), /My turn/.test(chips[0]) && (await page.evaluate(() => document.querySelectorAll("#lessonBar .lchip.go").length)) === 1, chips.join(" | "));
      await goto("knight", 0); await page.waitForTimeout(500);
      s = await st();
      ok(T("the knight's reach is drawn as Ls: two along, one across, eight times"),
         s.lit.length === 8 && s.lines.filter((l) => l.kind === "sight").length === 16, String(s.lines.length));
      await goto("king", 1); await page.waitForTimeout(500);
      s = await st();
      const red = await page.evaluate(() => (__cr.renderer.heat || []).map((h) => h.sq));
      ok(T("where the king may not step is red on the board itself"), s.heat.length === 14 && red.length === 14 && s.lit.every((q) => red.indexOf(q) < 0), JSON.stringify(red.length));

      /* ---- every task in the course, by real taps ---- */
      let played = 0, wrongDone = null;
      for (const x of ALL.filter((y) => y.st.goal)) {
        const where = x.sc.id + "#" + x.st.n;
        await goto(x.sc.id, x.st.n);
        let cur = await st();
        if (cur.scene !== x.sc.id || cur.n !== x.st.n || cur.show) { wrongDone = wrongDone || where + ": not there (" + cur.scene + "#" + cur.n + ")"; continue; }
        for (const mv of Rules.solve(x.st)) {
          await tap(mv.from); await tap(mv.to);
          if (!(await idle())) { wrongDone = wrongDone || where + ": never came to rest"; break; }
        }
        await page.waitForTimeout(150);
        cur = await st();
        if (!cur.done) wrongDone = wrongDone || where + ": not done after its answer (" + cur.fen + ", “" + cur.said + "”)";
        else played++;
      }
      ok(T("every task in the course is done by tapping its answer (" + played + ")"), !wrongDone && played === ALL.filter((y) => y.st.goal).length, wrongDone);
      const rec = (await st()).rec;
      ok(T("…and every scene with a task in it is marked finished"), COURSE.filter((c, i) => Rules.steps(i).some((q) => q.goal)).every((c) => rec.done[c.id]), JSON.stringify(rec.done));

      /* ---- taking counts down ---- */
      await goto("rook", 2);
      const before = await page.evaluate(() => document.querySelectorAll(".rlLeft i:not(.got)").length);
      await tap("a1"); await tap("a6"); await idle(); await page.waitForTimeout(150);
      const after = await page.evaluate(() => document.querySelectorAll(".rlLeft i:not(.got)").length);
      ok(T("pawns taken are counted off under the line"), before === 3 && after === 2 && !(await st()).done, before + " → " + after);

      /* ---- answers that are not it ---- */
      await goto("mate", 1);
      const fen0 = (await st()).fen;
      await tap("h1"); await tap("h5"); await page.waitForTimeout(250);
      s = await st();
      ok(T("a move that is not mate is not played: the bar says why"), s.fen === fen0 && s.misses === 1 && /way out/.test(s.said) && !s.done, s.said);
      await tap("h1"); await tap("h2"); await page.waitForTimeout(350);
      s = await st();
      const h = Rules.hint(Rules.step(Rules.index("mate"), 1), fen0);
      ok(T("…and after two the way is drawn on the board"), s.misses === 2 && s.hint && s.hint.from === h.from && s.hint.to === h.to && s.lines.some((l) => l.kind === "run"), JSON.stringify(s.hint));
      await goto("king", 2);
      await tap("d4"); await tap("e5"); await page.waitForTimeout(250);
      s = await st();
      ok(T("the king, sent onto a red square, is told what is watching it"), /rook is watching/.test(s.said) && s.misses === 1 && /^4r3\/8\/8\/8\/3K4/.test(s.fen), s.said);
      await goto("draw", 1);
      const fenD = (await st()).fen;
      await tap("d7"); await tap("c7");
      const said = await page.waitForFunction(() => /Stalemate/.test(__cr.rulesState().said), null, { timeout: 8000 }).then(() => true, () => false);
      s = await st();
      ok(T("the move that stalemates is played and named, with the cage lit"), said && s.heat.length === 3 && /^k7\/2Q5/.test(s.fen), s.said + " " + s.fen);
      const back = await page.waitForFunction((f) => { const x = __cr.rulesState(); return x.fen === f && !x.busy; }, fenD, { timeout: 12000 }).then(() => true, () => false);
      ok(T("…then taken back, and it is yours again"), back && (await st()).heat.length === 0 && !(await st()).done);

      /* a pawn asked to take, sent straight ahead instead: not a move at all, and still answered */
      await goto("pawn", 2);
      await tap("d4"); await tap("d5"); await page.waitForTimeout(250);
      s = await st();
      ok(T("a pawn sent straight into the man in front is told how pawns take"), /take diagonally/.test(s.said) && s.misses === 1 && !s.done, s.said);

      /* ---- Help ---- */
      await goto("bishop", 2);
      await page.click("#btnHint"); await page.waitForTimeout(250);
      s = await st();
      const hb = Rules.hint(Rules.step(Rules.index("bishop"), 2));
      ok(T("Help draws the next move of a shortest way, and costs nothing"), s.hint && s.hint.from === hb.from && s.hint.to === hb.to && s.misses === 0 &&
         (await page.evaluate(() => document.getElementById("hintCost").textContent)) === "", JSON.stringify(s.hint));

      /* ---- the dots, and what is kept ---- */
      await page.click(".rlDot:nth-child(6)"); await page.waitForTimeout(300);
      s = await st();
      const dots = await page.evaluate(() => ({ now: document.querySelectorAll(".rlDot.now").length, on: document.querySelectorAll(".rlDot.on").length,
        cur: document.querySelector('.rlDot[aria-current="step"]').getAttribute("aria-label") }));
      ok(T("a dot goes straight to its scene, and the finished ones are lit"), s.scene === "king" && s.n === 0 && dots.now === 1 && dots.on >= 10 && /The king/.test(dots.cur), JSON.stringify(dots));
      const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("chessroom_rules") || "null"));
      ok(T("what is finished is kept on this device, and nothing else is"), kept && kept.v === 1 && Object.keys(kept.done).length >= 11 &&
         (await page.evaluate(() => localStorage.getItem("chessroom_save"))) === null, JSON.stringify(kept));

      /* ---- leaving, and a game begun in the middle of a show ---- */
      await page.evaluate(() => [].filter.call(document.querySelectorAll("#lessonBar .lchip"), (c) => c.textContent === "Leave")[0].click());
      await page.waitForTimeout(300);
      const left = await page.evaluate(() => ({ mode: __cr.mode, st: __cr.rulesState(), bar: document.getElementById("lessonBar").classList.contains("hide"),
        menu: !document.getElementById("ovMenu").classList.contains("hide"), heat: (__cr.renderer.heat || []).length, resume: document.getElementById("mResume").getBoundingClientRect().width > 0 }));
      ok(T("Leave puts the lesson away: the lobby, no red squares, and no game to continue"), !left.mode && !left.st && left.bar && left.menu && left.heat === 0 && !left.resume, JSON.stringify(left));
      await page.evaluate(() => { __cr.startRules(__cr.Rules.index("queen")); });
      await page.waitForTimeout(200);
      await page.evaluate(() => __cr.startGame("pass", { clockStr: "none", fresh: true }));
      await page.waitForTimeout(4500);
      const mid = await page.evaluate(() => ({ mode: __cr.mode, fen: __cr.Chess.fen(__cr.game), st: __cr.rulesState(), lines: __cr.lessonLinesForTest().length,
        bar: document.getElementById("lessonBar").classList.contains("hide") }));
      ok(T("a game started in the middle of a show is a game: the show does not go on playing on its board"),
         mid.mode === "pass" && mid.fen === Chess.START_FEN && !mid.st && mid.lines === 0 && mid.bar, JSON.stringify(mid));

      /* ---- to the end, and into a first game ---- */
      await page.evaluate(() => __cr.showMenu()); await page.waitForTimeout(200);
      await goto("start", 0);
      const fin = await page.waitForFunction(() => { const x = __cr.rulesState(); return x && x.n === 3 && x.shown; }, null, { timeout: 60000 }).then(() => true, () => false);
      s = await st();
      ok(T("a good start is played out on the board: pawn, knights, bishops, castled"), fin && /RNBQ1RK1 b/.test(s.fen), s.fen);
      await page.click("#lessonBar .lchip.go");
      await page.waitForFunction(() => __cr.mode === "coach", null, { timeout: 15000 }).catch(() => {});
      ok(T("…and the last key is a first game, against the gentlest coach"),
         await page.evaluate(() => __cr.mode === "coach" && !__cr.rulesState() && /Acorn/.test(document.getElementById("nameTop").textContent + document.getElementById("nameBot").textContent)));

      /* ---- the Academy's answers are drawn too ---- */
      if (board === "flat") {
        const L = Learn.LESSONS.filter((l) => l.id === "fork-knight")[0], gL = Chess.create(L.fen), mL = Chess.fromSAN(gL, L.best);
        await page.evaluate((id) => { __cr.showMenu(); __cr.startLesson(__cr.Learn.byId(id), []); }, L.id);
        await page.waitForFunction(() => __cr.lessonLinesForTest().length > 0, null, { timeout: 15000 }).catch(() => {});
        const pic = await page.evaluate(() => __cr.lessonLinesForTest());
        const rings = pic.filter((l) => l.kind === "ring").map((l) => l.sq), g2 = Chess.create(L.fen);
        Chess.play(g2, mL);
        ok("the Academy draws what an answer does: an arrow from the knight to each man it forks, ringed",
           rings.length >= 2 && pic.filter((l) => l.kind === "run").every((l) => l.from === mL.to) && rings.every((q) => g2.board[q] < 0 && Chess.attacked(g2, q, Chess.WHITE)),
           JSON.stringify(pic));
      }
      await ctx.close();
    }

    /* ---- reduced motion: still shown, without the wait ---- */
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
    await ctx2.addInitScript(() => { if (!localStorage.getItem("chessroom_prefs")) localStorage.setItem("chessroom_prefs", JSON.stringify({ welcomed: true })); });
    const p2 = await ctx2.newPage();
    p2.on("pageerror", (e) => errs.push("reduced: " + e.message));
    await p2.goto(base + "/chess/#force2d");
    await p2.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 120000 });
    await p2.waitForTimeout(400);
    const t0 = Date.now();
    await p2.evaluate(() => __cr.startRules(__cr.Rules.index("check")));
    const through = await p2.waitForFunction(() => { const x = __cr.rulesState(); return x && x.n === 3 && x.shown; }, null, { timeout: 20000 }).then(() => true, () => false);
    ok("with reduced motion a scene is still shown, step by step, and promptly", through && Date.now() - t0 < 9000, (Date.now() - t0) + " ms");
    await ctx2.close();

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 4).join(" "));
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe rules are shown, and everything shown is true");
  process.exit(failed ? 1 : 0);
})();
