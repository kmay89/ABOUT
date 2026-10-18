/* play-check.js — dev-only. Can a person sit down, play, and come back?

   The other checks prove the parts: the rules, the engine, the voices,
   the light. This one plays the room the way a person does, alone, and
   reads what they would see. It also keeps every bug an afternoon of
   real play turned up from quietly coming back:

     • the lobby says "play the computer", one tap starts a rated game,
       and a finished game moves the number, lands its stars and fills
       in the ladder and the record;
     • New game restarts in one tap, and a rated game that is properly
       under way asks before it is thrown away — and counts it;
     • Undo as Black, before you have moved, cannot strand the computer;
     • a flag that falls while the promotion picker is open does not
       leave the next game with a board that ignores every tap;
     • a review is written on the move it is about, not on the reply;
     • the king-then-rook tap castles, and the promotion picker can be
       backed out of;
     • the new-game card starts what it shows;
     • a hint is charged once, when it arrives;
     • a save that parses but lies is retired, not resumed.

   Needs `playwright-core`; the browser is already on the machine. If
   either is missing it says so and exits 0.

   Run: node chess/tools/play-check.js                                  */
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

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
if (!CHROME) { console.log("no chromium on this machine — skipping the play check."); process.exit(0); }
let pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the play check.");
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

const WHERE = `(sq) => {
  const R = __cr.renderer, st = document.getElementById('stage');
  const w = st.clientWidth, h = st.clientHeight;
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
    if (R.screenToSquare(x, y) === sq) { sx += x; sy += y; n++; }
  }
  return n ? { x: sx / n, y: sy / n } : null;
}`;
const SQ = (name) => (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);
/* a move by its name, played through the dev handle — for the filler */
const PLAY = `([san, src]) => {
  const g = __cr.game;
  const mv = Chess.moves(g).find((m) => Chess.toSAN(g, m).replace(/[+#]$/, '') === san.replace(/[+#]$/, ''));
  if (!mv) return false;
  __cr.commitMove(mv, src || 'local');
  return true;
}`;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 820 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("" + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  const play = (san, src) => page.evaluate(([f, a]) => eval(f)(a), [PLAY, [san, src]]);
  const settle = () => page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 5000 }).catch(() => {});
  const click = async (name) => {
    const box = await page.locator("#stage").boundingBox();
    const at = await page.evaluate(([f, s]) => eval(f)(s), [WHERE, SQ(name)]);
    await page.mouse.click(box.x + at.x, box.y + at.y);
    await page.waitForTimeout(120);
  };
  /* a real reload every time: the same URL with only a hash would be a
     same-document navigation, and the old game would still be there */
  let visit = 0;
  const fresh = async (hash) => {
    await page.goto(base + "/chess/?v=" + (++visit) + (hash || "#force2d"), { waitUntil: "networkidle" });
    /* the lobby arrives when the room has finished building itself, which
       in 3D on a busy machine can be well after the network goes quiet */
    await page.waitForFunction(() => document.getElementById("splash").classList.contains("gone") &&
      !document.getElementById("ovMenu").classList.contains("hide"), null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(300);
  };
  const state = () => page.evaluate(() => ({
    mode: __cr.mode, sans: __cr.game.played.map((r) => r.san),
    rating: JSON.parse(localStorage.getItem("chessroom_rating") || "null"),
    ladder: JSON.parse(localStorage.getItem("chessroom_ladder") || "null")
  }));

  try {
    /* ---- the lobby, and a rated game from one tap ---- */
    await page.goto(base + "/chess/#force2d", { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await fresh();
    const lobby = await page.evaluate(() => ({
      play: document.querySelector("#mPlay b").textContent,
      rungs: document.querySelectorAll("#mLadder .rung").length,
      next: (document.querySelector("#mLadder .rung.next b") || {}).textContent
    }));
    ok("the lobby leads with playing the computer", /play the computer/i.test(lobby.play), lobby.play);
    ok("…shows the whole ladder of coaches", lobby.rungs >= 5, lobby.rungs + " rungs");
    ok("…and marks the one to play next", !!lobby.next, lobby.next);

    await page.click("#mPlay");
    await page.waitForTimeout(900);
    let st = await state();
    ok("one tap starts a game against the computer", st.mode === "coach", st.mode);
    const human = await page.evaluate(() => __cr.game.turn === 1);
    ok("…with you to move as White on a first game", human);

    /* the computer is beaten by a scholar's mate played over its head */
    for (const [i, san] of ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"].entries()) {
      ok("  " + san + " is playable", await play(san, i % 2 ? "coach" : "local"));
      await page.waitForTimeout(i % 2 ? 450 : 80);
    }
    /* a mate has its moment on the board before the card comes up */
    await page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 8000 }).catch(() => {});
    ok("the mate ends the game with a card", await page.isVisible("#ovEnd"));
    ok("…which shows a rating", await page.isVisible("#endRate"));
    st = await state();
    ok("a win is counted", st.rating && st.rating.games === 1 && st.rating.history && st.rating.history.length === 1,
       JSON.stringify(st.rating && st.rating.history));
    const rung = st.ladder && st.ladder.rungs && Object.values(st.ladder.rungs)[0];
    ok("…and earns the first two stars", rung && rung.stars[0] === 1 && rung.stars[1] === 1, JSON.stringify(rung));
    /* four moves is too few to measure, and the card says so rather than
       pretending — or hanging on "looking back…" */
    await page.waitForFunction(() => /too short|%/i.test(document.getElementById("endAccTx").textContent + document.getElementById("endAccNum").textContent), null, { timeout: 20000 }).catch(() => {});
    const acc = await page.evaluate(() => document.getElementById("endAccTx").textContent);
    ok("the look-back finishes, and says a four-move win is too short to measure", /too short/i.test(acc), acc);
    ok("…and still counts the slips", await page.evaluate(() => document.getElementById("endCounts").children.length > 0));
    ok("…and offers the next coach up", await page.isVisible("#endNext"));

    await page.click("#endMenu");
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({
      num: document.getElementById("mRateNum").textContent,
      stars: document.querySelectorAll("#mLadder .rgStars i.on").length
    }));
    ok("the lobby now shows your number", /\d/.test(after.num), after.num);
    ok("…and the stars you earned", after.stars >= 2, after.stars + " stars");
    await page.click("#mRating");
    await page.waitForTimeout(400);
    ok("your record opens from the rating card", await page.isVisible("#ovProfile"));
    await page.click("#pfBack");

    /* ---- New game, and the rated game that is under way ---- */
    /* a young game restarts freely */
    await page.evaluate(() => { __cr.startGame("coach", { humanSide: 1, skill: Rating.LEVELS[0].id, clockStr: "none" }); });
    await play("e4", "local");
    await page.waitForFunction(() => __cr.game.played.length === 2 && !__cr.renderer.isAnimating(), null, { timeout: 9000 });
    await page.click("#btnNew");
    await page.waitForTimeout(300);
    const youngAsk = await page.evaluate(() => document.getElementById("askBody").innerText);
    ok("New game in a young rated game only checks you meant it", /start a new game/i.test(youngAsk) && !/loss/i.test(youngAsk), youngAsk);
    await page.click("#askRow button >> nth=0");
    await page.waitForTimeout(600);
    st = await state();
    ok("…and counts nothing", st.rating.games === 1 && st.mode === "coach", JSON.stringify([st.rating.games, st.mode]));
    /* a game well under way does not go so quietly */
    await page.evaluate(() => { __cr.startGame("coach", { humanSide: 1, skill: Rating.LEVELS[0].id, clockStr: "none" }); });
    for (let k = 0; k < 10; k++) {
      await page.waitForFunction(() => __cr.game.turn === 1 && !__cr.renderer.isAnimating(), null, { timeout: 9000 });
      await page.waitForTimeout(150);
      /* a quiet move that keeps the game going: never a capture, never mate */
      const mine = await page.evaluate(() => {
        const g = __cr.game, ms = Chess.moves(g).filter((m) => !m.capt);
        return Chess.toSAN(g, ms.find((m) => Math.abs(m.piece) === 2 || Math.abs(m.piece) === 1) || ms[0] || Chess.moves(g)[0]);
      });
      await play(mine, "local");
      await page.waitForTimeout(300);
    }
    await page.waitForFunction(() => __cr.game.turn === 1 && !__cr.renderer.isAnimating(), null, { timeout: 9000 });
    const gamesBefore = (await state()).rating.games;
    await page.click("#btnNew");
    await page.waitForTimeout(300);
    const asked = await page.evaluate(() => document.getElementById("askBody").innerText);
    ok("New game on a rated game under way asks first", /rated/i.test(asked) && await page.isVisible("#ovAsk"), asked.slice(0, 80));
    await page.click("#askRow button >> nth=0");
    await page.waitForTimeout(900);
    st = await state();
    ok("…and resigning to go on counts it as a loss", st.rating.games === gamesBefore + 1 && st.rating.history.slice(-1)[0].result === 0,
       JSON.stringify(st.rating.history.slice(-1)));
    ok("…and starts a fresh game", st.mode === "coach" && st.sans.length <= 1, st.sans.join(" "));
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
    await play("e4");
    await page.click("#btnNew");
    await page.waitForTimeout(250);
    await page.click("#askRow button >> nth=0");
    await page.waitForTimeout(400);
    ok("New game in an unrated game restarts after one question", (await state()).sans.length === 0);

    /* a question asked from the lobby is drawn above it, not under it */
    await page.evaluate(() => { __cr.startGame("coach", { humanSide: 1, skill: Rating.LEVELS[0].id, clockStr: "none" }); });
    for (let k = 0; k < 10; k++) {
      await page.waitForFunction(() => __cr.game.turn === 1 && !__cr.renderer.isAnimating(), null, { timeout: 9000 });
      await page.waitForTimeout(150);
      await page.evaluate(() => { const g = __cr.game, ms = Chess.moves(g).filter((m) => !m.capt); __cr.commitMove(ms.find((m) => Math.abs(m.piece) <= 2) || ms[0] || Chess.moves(g)[0], "local"); });
      await page.waitForTimeout(300);
    }
    await page.waitForFunction(() => __cr.game.turn === 1 && !__cr.renderer.isAnimating(), null, { timeout: 9000 });
    await page.click("#btnMenu"); await page.waitForTimeout(300);
    await page.click("#mPlay"); await page.waitForTimeout(300);
    const top = await page.evaluate(() => {
      const b = document.querySelector("#askRow button"); if (!b) return "no question";
      const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === b ? "on top" : "covered by " + (hit && (hit.id || hit.className));
    });
    ok("a question asked from the lobby is drawn above it", top === "on top", top);
    await page.click("#askRow button >> nth=-1");
    await page.waitForTimeout(300);
    ok("…and 'Keep playing' goes back to the game", (await state()).mode === "coach" && !(await page.isVisible("#ovMenu")));

    /* ---- a real game's look-back: ten moves, then resign ---- */
    await page.evaluate(() => { __cr.startGame("coach", { humanSide: 1, skill: Rating.LEVELS[0].id, clockStr: "none" }); });
    for (let k = 0; k < 10; k++) {
      const alive = await page.waitForFunction(() => __cr.game.turn === 1 && !__cr.renderer.isAnimating(), null, { timeout: 9000 }).then(() => true, () => false);
      if (!alive || await page.isVisible("#ovEnd")) break;
      await page.waitForTimeout(120);
      await page.evaluate(() => { const g = __cr.game, ms = Chess.moves(g).filter((m) => !m.capt); __cr.commitMove(ms.find((m) => Math.abs(m.piece) <= 2) || ms[0] || Chess.moves(g)[0], "local"); });
      await page.waitForTimeout(200);
    }
    await page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 9000 }).catch(() => {});
    if (!(await page.isVisible("#ovEnd"))) {
      await page.click("#btnMenu"); await page.waitForTimeout(300);
      await page.click("#gameOps .chip >> text=Resign"); await page.waitForTimeout(200);
      await page.click("#askRow button >> nth=0");
    }
    await page.waitForFunction(() => /%/.test(document.getElementById("endAccNum").textContent), null, { timeout: 40000 }).catch(() => {});
    const acc2 = await page.evaluate(() => [document.getElementById("endAccTx").textContent, document.getElementById("endAccNum").textContent]);
    ok("a real game's look-back gives an accuracy", /\d+%/.test(acc2[1]), acc2.join(" "));
    ok("…and a performance estimate held within reach of the coach", (() => {
      const m = acc2[0].match(/~(\d+)/); return !m || +m[1] <= 400 + 400;
    })(), acc2[0]);
    await page.click("#endMenu"); await page.waitForTimeout(300);

    /* ---- Undo as Black before you have moved ---- */
    await fresh();
    await page.evaluate(() => { __cr.startGame("coach", { humanSide: -1, skill: "sprout", clockStr: "none" }); });
    await page.waitForFunction(() => __cr.game.played.length === 1, null, { timeout: 8000 });
    await settle();
    const undoOff = await page.evaluate(() => document.getElementById("btnUndo").disabled);
    ok("Undo is off before you have a move to take back", undoOff);
    await page.evaluate(() => __cr.undoPlyForTest(1));
    await page.waitForFunction(() => __cr.game.played.length === 1, null, { timeout: 8000 }).catch(() => {});
    ok("a take-back that leaves it the computer's turn gets a move from it",
       await page.evaluate(() => __cr.game.played.length === 1));

    /* ---- the flag and the promotion picker ---- */
    await fresh();
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "1+0" }); });
    for (const san of ["a4", "h6", "a5", "b5", "axb6", "h5", "bxc7", "h4"]) { await play(san); await page.waitForTimeout(60); }
    await settle();
    await click("c7"); await click("d8");
    ok("the promotion picker opens", await page.isVisible("#ovPromo"));
    /* run White's clock out while the picker is up */
    await page.evaluate(() => __cr.flagForTest(1));
    await page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 6000 }).catch(() => {});
    ok("the flag falls with the picker open and the game ends", await page.isVisible("#ovEnd"));
    ok("…and the picker is gone with it", !(await page.isVisible("#ovPromo")));
    await page.click("#endRematch");
    await page.waitForTimeout(900);
    await click("e2"); await click("e4"); await settle();
    ok("the next game's board still takes taps", (await state()).sans.join(" ") === "e4", (await state()).sans.join(" "));

    /* ---- the review lands on the move it is about ---- */
    await fresh();
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
    for (const san of ["e4", "e5", "Nf3", "Qg5"]) { await play(san); await page.waitForTimeout(80); }
    await page.waitForTimeout(150);
    await play("Nxg5");
    await page.waitForFunction(() => Object.keys(__cr.marksForTest()).length > 0, null, { timeout: 9000 }).catch(() => {});
    const marks = await page.evaluate(() => __cr.marksForTest());
    ok("a blunder's mark is on the blunder, not the reply", marks[3] && !marks[4], JSON.stringify(marks));

    /* ---- castling by king then rook; backing out of a promotion ---- */
    await fresh();
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
    for (const san of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"]) { await play(san); await page.waitForTimeout(60); }
    await settle();
    await click("e1"); await click("h1"); await settle();
    ok("king then its rook castles", (await state()).sans.slice(-1)[0] === "O-O", (await state()).sans.slice(-1)[0]);

    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
    for (const san of ["a4", "h6", "a5", "b5", "axb6", "h5", "bxc7", "h4"]) { await play(san); await page.waitForTimeout(60); }
    await settle();
    await click("c7"); await click("d8");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    ok("Escape backs out of the promotion picker", !(await page.isVisible("#ovPromo")));
    ok("…and keeps the pawn in hand for another square", await page.evaluate(() => __cr.renderer.hi.selected === 0x62));
    await click("b8");
    await page.waitForTimeout(200);
    await page.click("#promoRow button >> nth=0");
    await settle();
    ok("…and the pawn can still promote afterwards", /=Q/.test((await state()).sans.slice(-1)[0]), (await state()).sans.slice(-1)[0]);

    /* ---- the new-game card starts what it shows ---- */
    await fresh();
    await page.click("#mPass"); await page.waitForTimeout(200);
    await page.click('#clockChips [data-clock="5+0"]');
    await page.click("#newStart"); await page.waitForTimeout(600);
    await page.click("#btnMenu"); await page.waitForTimeout(300);
    await page.click("#mPass"); await page.waitForTimeout(200);
    const shown = await page.evaluate(() => document.querySelector("#clockChips .sel").getAttribute("data-clock"));
    await page.click("#newStart"); await page.waitForTimeout(600);
    const clockOn = await page.evaluate(() => !document.getElementById("clockBot").classList.contains("off"));
    ok("the new-game card remembers the clock and starts with it", shown === "5+0" && clockOn, shown + " / clock " + clockOn);

    /* ---- a hint is charged once ---- */
    await fresh();
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
    await page.click("#btnHint");
    await page.waitForFunction(() => /💡/.test(document.getElementById("toast").innerText), null, { timeout: 8000 }).catch(() => {});
    const spent1 = await page.evaluate(() => __cr.oddsSpent[1]);
    await page.click("#btnHint");
    await page.waitForTimeout(400);
    const spent2 = await page.evaluate(() => __cr.oddsSpent[1]);
    ok("a second tap on Hint in the same position costs nothing", spent1 === spent2 && spent1 >= 1, spent1 + " then " + spent2);

    /* ---- the Academy, with a mouse ---- */
    await fresh();
    await page.click("#mAcademy"); await page.waitForTimeout(300);
    await page.click("#aNext"); await page.waitForTimeout(2600);
    /* a first lesson opens with a demonstration; let it hand over */
    const tryIt = page.locator("#lessonBar .lchip", { hasText: "Now let me try" });
    if (await tryIt.count()) { await tryIt.first().click(); await page.waitForTimeout(400); }
    const kickBefore = await page.evaluate(() => document.querySelector("#lessonBar .lkick").textContent);
    await page.locator("#lessonBar .lchip", { hasText: "Nudge" }).first().click();
    await page.waitForTimeout(300);
    const kickAfter = await page.evaluate(() => document.querySelector("#lessonBar .lkick").textContent);
    ok("a lesson's buttons answer a mouse click", /nudge/i.test(kickAfter), kickBefore + " → " + kickAfter);
    /* a wrong move plays out; until it is taken back, the board is the
       picture of a mistake, not a position to act on */
    const wrong = await page.evaluate(() => {
      const L = __cr.lesson, g = __cr.game;
      const bad = Chess.moves(g).find((m) => !Learn.accepts(L, g, m).ok);
      return bad ? [bad.from, bad.to] : null;
    });
    if (wrong) {
      const name = (q) => String.fromCharCode(97 + (q & 7)) + ((q >> 4) + 1);
      await click(name(wrong[0])); await click(name(wrong[1]));
      await page.waitForTimeout(1200);
      const fenBefore = await page.evaluate(() => Chess.fen(__cr.game));
      await click(name(wrong[1])); await click(name(wrong[0]));
      await page.waitForTimeout(400);
      const sameFen = await page.evaluate(() => Chess.fen(__cr.game));
      ok("a wrong move's picture can't be played on", fenBefore === sameFen && await page.evaluate(() => __cr.renderer.hi.selected === -1));
      await page.locator("#lessonBar .lchip", { hasText: "Take it back" }).first().click();
      await page.waitForTimeout(400);
      await click(name(wrong[0]));
      ok("…and after Take it back the board answers again", await page.evaluate((q) => __cr.renderer.hi.selected === q, wrong[0]));
    }
    await page.locator("#lessonBar .lchip", { hasText: "Leave" }).first().click();
    await page.waitForTimeout(400);
    ok("Leave goes back to the Academy", await page.isVisible("#ovAcademy"));

    /* ---- a save that lies ---- */
    await page.evaluate(() => localStorage.setItem("chessroom_save",
      JSON.stringify({ v: 1, mode: "coach", sans: ["e4", "e5"], skill: "bogus", humanSide: 5, clockStr: "abc" })));
    await fresh();
    const offered = await page.evaluate(() => !document.getElementById("mResume").classList.contains("hide"));
    ok("a save that lies is not offered", !offered);
    ok("…and is retired", await page.evaluate(() => localStorage.getItem("chessroom_save") === null));

    /* ---- a lost 3D context, and trying 3D again ---- */
    await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("chessroom_prefs") || "{}"); p.use3d = true; localStorage.setItem("chessroom_prefs", JSON.stringify(p)); });
    await fresh("#");
    await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
    await page.waitForTimeout(800);
    const was3d = await page.evaluate(() => __cr.renderer.kind === "3d");
    if (was3d) {
      await page.evaluate(() => { const gl = document.getElementById("cv3").getContext("webgl"); gl.getExtension("WEBGL_lose_context").loseContext(); });
      await page.waitForTimeout(800);
      ok("a lost 3D context moves the game to the 2D board", await page.evaluate(() => __cr.renderer.kind !== "3d"));
      await page.click("#btnDim");
      await page.waitForTimeout(1500);
      const back = await page.evaluate(() => {
        const R = __cr.renderer; if (R.kind !== "3d") return "still " + R.kind;
        const cv = document.getElementById("cv3"), gl = cv.getContext("webgl");
        return gl && !gl.isContextLost() ? "3d" : "dead context";
      });
      ok("…and trying 3D again really builds a new 3D board", back === "3d", back);
      await play("e4"); await settle();
      ok("…which plays on", (await state()).sans.join(" ") === "e4");
    } else console.log("skip  this browser drew no 3D board, so its loss can't be tested");

    ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) {
    failed++;
    console.log("FAIL  the check itself fell over  → " + (e && e.stack || e));
    /* what the page looked like when it did, for whoever is reading */
    const shot = path.join(require("os").tmpdir(), "play-check-fail.png");
    try { await page.screenshot({ path: shot }); console.log("      the page at that moment: " + shot); } catch (err) {}
  }
  await browser.close();
  server.close();
  console.log(failed ? "\n" + failed + " failed" : "\na person can sit down, play, and come back");
  process.exit(failed ? 1 : 0);
})();
