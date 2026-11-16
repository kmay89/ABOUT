/* access-check.js — dev-only. Can the room be played without a mouse,
   and without seeing it?

   Two halves. In Node, access.js on its own: every legal move in a few
   hundred positions is reached by its own SAN and by its two squares;
   the ways people actually type (lower case, no "x", "0-0", "e8Q",
   "e7e8q", a check sign on the end) all land; an ambiguous knight
   names both candidates; junk, an illegal king step and a blocked
   castle each say why; the words for a move, a square and a position
   are right and never carry markup; the cursor walks the right way
   round on a flipped board and stops at the edges.

   Then a real browser, on the flat board and the carved one: with a
   card open, Tab never reaches the game beneath and the page behind is
   inert; opening a card puts focus in it and closing it puts focus
   back; every card is a dialog named by its heading; the closed Studio
   is out of reach; a typed move plays and is announced in words; the
   coach's reply is announced with "Your move"; the board is reached
   with Tab and a whole move is made with the arrows and Enter; a short
   game is played to mate on the keyboard alone and the result is read;
   a bad entry says why; the move list names its moves; "/" opens the
   keys and Escape gives focus back; the console stays quiet.

   Needs `playwright-core`; the browser is already on the machine. If
   either is missing the browser half says so and is skipped.

   Run: node chess/tools/access-check.js                                 */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
const Chess = require("../engine.js");
const Access = require("../access.js");
let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

/* ===================== Node: access.js ===================== */
function parsed(fen, text) { return Access.parse(fen ? Chess.create(fen) : Chess.create(), text); }
function sanOf(g, m) { return Chess.toSAN(g, m); }
function same(a, b) { return a && b && a.from === b.from && a.to === b.to && (a.promo | 0) === (b.promo | 0); }
function uci(m) { return Chess.sqName(m.from) + Chess.sqName(m.to) + (m.promo ? "nbrq"[[2, 3, 4, 5].indexOf(Math.abs(m.promo))] : ""); }

(function nodeHalf() {
  const start = Chess.create();
  const typed = { "e4": "e2e4", "Nf3": "g1f3", "nf3": "g1f3", "e2e4": "e2e4", "e2-e4": "e2e4", "Nf3+": "g1f3", "e4!?": "e2e4",
                  "Ng1f3": "g1f3", " d4 ": "d2d4", "Nc3": "b1c3" };
  let bad = [];
  for (const t in typed) {
    const r = Access.parse(start, t);
    if (!r.move || uci(r.move) !== typed[t]) bad.push(t + " → " + JSON.stringify(r));
  }
  ok("typed moves in the opening: SAN, lower case, two squares, a dash, a check sign, spaces", !bad.length, bad.join("; "));

  /* a position with every kind of special move in it */
  const FEN = "r3k2r/1P4P1/8/3pP3/8/8/8/R3K1NR w KQkq d6 0 1";
  const g = Chess.create(FEN);
  const want = [["exd6", "e5d6"], ["ed6", "e5d6"], ["exd6e.p.", null], ["O-O-O", "e1c1"], ["0-0-0", "e1c1"], ["ooo", "e1c1"],
                ["e1a1", "e1c1"], ["b8=Q", "b7b8q"], ["b8Q", "b7b8q"], ["b8q", "b7b8q"], ["b7b8n", "b7b8n"], ["bxa8=R", "b7a8r"],
                ["ba8b", "b7a8b"], ["gxh8Q+", "g7h8q"], ["Rb1", "a1b1"], ["Nf3", "g1f3"], ["Ne2", "g1e2"]];
  bad = [];
  for (const [t, u] of want) {
    const r = Access.parse(g, t);
    if (u === null ? !r.error : !(r.move && uci(r.move) === u)) bad.push(t + " → " + JSON.stringify(r));
  }
  ok("en passant, both castles in three spellings, the king onto its rook, every promotion spelling", !bad.length, bad.join("; "));
  const pr = Access.parse(g, "b8");
  ok("a promotion with no piece named asks for the picker", pr.promote && pr.promote.from === Chess.sqIndex("b7") && pr.promote.to === Chess.sqIndex("b8"), JSON.stringify(pr));
  ok("…and so does the two-square form", !!Access.parse(g, "b7b8").promote);
  ok("a piece letter on a move that is not a promotion is refused", /isn't a promotion/.test(Access.parse(g, "e5e6q").error || "") && /Only a pawn/.test(Access.parse(g, "Rb1=Q").error || ""),
     JSON.stringify(Access.parse(g, "e5e6q")));
  ok("O-O with the knight still on g1 says castling is not possible, and why it is not read as anything else",
     /castle kingside/.test(Access.parse(g, "O-O").error || ""), JSON.stringify(Access.parse(g, "O-O")));

  const amb = parsed("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1", "Nd2");
  ok("an ambiguous knight names both and asks which", amb.error && amb.candidates && amb.candidates.length === 2 &&
     /Nbd2/.test(amb.error) && /Nfd2/.test(amb.error) && /which one/.test(amb.error), JSON.stringify(amb));
  ok("…and either one, named, plays", !!parsed("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1", "Nbd2").move && !!parsed("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1", "Nfd2").move);
  const BB = "4k3/8/8/2p5/1P6/4B3/8/4K3 w - - 0 1";
  ok("a b-pawn and a bishop are told apart by the capital",
     uci(parsed(BB, "bxc5").move || { from: 0, to: 0 }) === "b4c5" && uci(parsed(BB, "Bxc5").move || { from: 0, to: 0 }) === "e3c5",
     JSON.stringify([parsed(BB, "bxc5"), parsed(BB, "Bxc5")]));
  const junk = ["", "hello", "Zf3", "e9", "i4", "Nf", "O-O-O-O", "Kxx", "Qh4", "Ke2", "Nd4"];
  bad = [];
  for (const t of junk) {
    let r; try { r = Access.parse(start, t); } catch (e) { r = { threw: e.message }; }
    if (!r || !r.error || r.move || typeof r.error !== "string") bad.push(t + " → " + JSON.stringify(r));
  }
  ok("junk and impossible moves never throw and always say something", !bad.length, bad.join("; "));
  ok("…an impossible king step names the king", /No king of yours can go to e2/.test(Access.parse(start, "Ke2").error));
  ok("…a missing piece says so", /no queen left/.test(parsed("4k3/8/8/8/8/8/8/4K3 w - - 0 1", "Qd4").error || ""));
  ok("…and a move that does not answer check says the king is in check",
     /in check/.test(parsed("4k3/8/8/8/8/8/4r3/R3K3 w - - 0 1", "Ra2").error || ""), JSON.stringify(parsed("4k3/8/8/8/8/8/4r3/R3K3 w - - 0 1", "Ra2")));

  /* every legal move, in a few hundred positions, by its SAN and its squares */
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let tried = 0; bad = [];
  for (let game = 0; game < 12 && bad.length < 5; game++) {
    const gg = Chess.create();
    for (let ply = 0; ply < 60; ply++) {
      const all = Chess.moves(gg);
      if (!all.length) break;
      for (const m of all) {
        tried++;
        const s = sanOf(gg, m);
        const a = Access.parse(gg, s), b = Access.parse(gg, uci(m));
        if (!same(a.move, m)) bad.push(s + " → " + JSON.stringify(a));
        if (!same(b.move, m)) bad.push(uci(m) + " → " + JSON.stringify(b));
        const low = s.replace(/^[NRQK]/, (c) => c.toLowerCase()).replace("x", "");
        const c = Access.parse(gg, low);
        if (!same(c.move, m) && !(c.error && c.candidates)) bad.push(low + " → " + JSON.stringify(c));
      }
      Chess.play(gg, all[rnd(all.length)]);
    }
  }
  ok("every legal move in " + tried + " tries is reached by its SAN, its two squares, and lower case without the x", !bad.length, bad.slice(0, 4).join("; "));

  /* words */
  const W = (fen, t) => { const gg = Chess.create(fen); const m = Access.parse(gg, t).move; return m ? Access.sayMove(m, Chess.toSAN(gg, m)) : "(no move)"; };
  ok("words: a quiet move", W(null, "Nf3") === "White: knight to f3", W(null, "Nf3"));
  ok("words: a capture names what was taken", W("4k3/8/8/3b4/4P3/8/8/4K3 w - - 0 1", "exd5") === "White: pawn from e4 takes bishop on d5", W("4k3/8/8/3b4/4P3/8/8/4K3 w - - 0 1", "exd5"));
  ok("words: en passant", /takes pawn en passant, to d6/.test(W(FEN, "exd6")), W(FEN, "exd6"));
  ok("words: castling", W(FEN, "O-O-O") === "White: castles queenside", W(FEN, "O-O-O"));
  ok("words: promotion and check", /becomes a queen, check$/.test(W(FEN, "gxh8=Q")), W(FEN, "gxh8=Q"));
  ok("words: a named from-square when two could go", W("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1", "Nbd2") === "White: knight from b1 to d2");
  const mateG = Chess.create();
  ["f3", "e5", "g4"].forEach((t) => Chess.play(mateG, Access.parse(mateG, t).move));
  const qh4 = Access.parse(mateG, "Qh4").move;
  ok("words: checkmate, for Black", Access.sayMove(qh4, Chess.toSAN(mateG, qh4)) === "Black: queen to h4, checkmate");
  ok("words: a square", Access.squareWords(start.board, Chess.sqIndex("e2")) === "e2, white pawn" && Access.squareWords(start.board, Chess.sqIndex("e4")) === "e4, empty");
  const pos = Access.position(start);
  ok("words: where everything is", /^White to move\. White: king e1, queen d1, rooks a1 and h1, bishops c1 and f1, knights b1 and g1, pawns a2, .* and h2\. Black: king e8/.test(pos), pos);
  ok("words: a result", Access.resultWords("white", "checkmate") === "Checkmate. White wins, 1–0." && /A draw/.test(Access.resultWords("draw", "stalemate")));
  ok("no words carry markup", ![pos, W(FEN, "exd6"), Access.resultWords("black", "Black resigned")].some((s) => /[<>]/.test(s)));

  /* the cursor */
  const e2 = Chess.sqIndex("e2");
  ok("the cursor: up is up for White", Chess.sqName(Access.step(e2, "ArrowUp", 1)) === "e3" && Chess.sqName(Access.step(e2, "ArrowRight", 1)) === "f2");
  ok("…and turned round for Black", Chess.sqName(Access.step(e2, "ArrowUp", -1)) === "e1" && Chess.sqName(Access.step(e2, "ArrowRight", -1)) === "d2");
  ok("…and it stops at the edges", Access.step(Chess.sqIndex("a1"), "ArrowLeft", 1) === Chess.sqIndex("a1") &&
     Access.step(Chess.sqIndex("h8"), "ArrowUp", 1) === Chess.sqIndex("h8"));
  ok("the key card lists no key the help lamp or the pen already uses for something else",
     !Access.KEYS.some((grp) => grp[1].some((r) => /^Shift (N|R|B|Q|K|O)$/.test(r[0]))));
})();

/* ===================== the browser ===================== */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log((CHROME ? "playwright-core is not installed" : "no chromium on this machine") + " — skipping the browser half.");
  console.log(failed ? "\n" + failed + " FAILED" : "\nthe board speaks (Node half only)");
  process.exit(failed ? 1 : 0);
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

async function board(browser, base, flat) {
  const tag = flat ? "[2D] " : "[3D] ";
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("" + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const hash = flat ? "#force2d" : "";
  await page.goto(base + "/chess/" + hash, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(base + "/chess/?a=1" + hash, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("splash").classList.contains("gone"), null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => !document.getElementById("ovMenu").classList.contains("hide"), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  const is3d = await page.evaluate(() => __cr.renderer && __cr.renderer.kind === "3d");
  if (!flat && !is3d) console.log("      (this machine gave no 3D board — the carved half runs on the flat one)");

  const active = () => page.evaluate(() => {
    const a = document.activeElement;
    return { id: a ? a.id : "", tag: a ? a.tagName : "", inMenu: !!(a && a.closest("#ovMenu")), inApp: !!(a && a.closest("#app")),
             inStudio: !!(a && a.closest("#studio")), ov: a && a.closest(".ov") ? a.closest(".ov").id : "" };
  });
  const said = () => page.evaluate(() => __cr.saidForTest().join(" | "));
  const region = () => page.evaluate(() => document.getElementById("accSay").textContent);
  const settle = () => page.waitForFunction(() => !__cr.renderer.isAnimating(), null, { timeout: 8000 }).catch(() => {});

  /* ---- focus with the lobby open ---- */
  const lob = await active();
  ok(tag + "the lobby is up at the start and focus is in it", lob.inMenu, JSON.stringify(lob));
  ok(tag + "…and the room behind it is inert", await page.evaluate(() => document.getElementById("app").inert === true && document.getElementById("studio").inert === true));
  let leaked = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const a = await active();
    if (a.inApp || a.inStudio || (a.ov && a.ov !== "ovMenu")) leaked.push(a.id || a.tag);
  }
  ok(tag + "thirty Tabs never leave the lobby for the game beneath it", !leaked.length, leaked.join(", "));
  const dialogs = await page.evaluate(() => [...document.querySelectorAll("body > .ov")].filter((o) => {
    const l = o.getAttribute("aria-labelledby"), el = l && document.getElementById(l);
    /* the question card is named by the question, which it is only asked when it opens */
    const named = o.id === "ovAsk" ? !!el : (el ? !!el.textContent.trim() : !!(o.getAttribute("aria-label") || "").trim());
    return o.getAttribute("role") !== "dialog" || !named;
  }).map((o) => o.id));
  ok(tag + "every card is a dialog named by its own heading", !dialogs.length, dialogs.join(", "));

  /* ---- a game against the coach, by typing ---- */
  await page.evaluate(() => { document.getElementById("ovMenu").classList.add("hide"); __cr.startGame("coach", { humanSide: 1, skill: "sprout", clockStr: "none" }); });
  await page.waitForTimeout(600);
  await settle();
  ok(tag + "with the card gone the room is live again", await page.evaluate(() => document.getElementById("app").inert === false));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press("e");
  const opened = await page.evaluate(() => ({ shown: !document.getElementById("kbType").classList.contains("hide"),
    focused: document.activeElement.id, val: document.getElementById("kbIn").value }));
  ok(tag + "a letter at the board opens the entry, with the letter in it", opened.shown && opened.focused === "kbIn" && opened.val === "e", JSON.stringify(opened));
  await page.keyboard.type("4");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => __cr.game.played.length >= 1, null, { timeout: 5000 }).catch(() => {});
  ok(tag + "typing e4 and Enter plays it", await page.evaluate(() => __cr.game.played.length >= 1 && __cr.game.played[0].san === "e4"));
  ok(tag + "…and the entry goes away", await page.evaluate(() => document.getElementById("kbType").classList.contains("hide")));
  await page.waitForTimeout(300);
  ok(tag + "the live region says the move in words", /White: pawn to e4/.test(await region()), await region());
  await page.waitForFunction(() => __cr.game.played.length >= 2, null, { timeout: 20000 }).catch(() => {});
  await settle();
  await page.waitForTimeout(300);
  const reply = await said();
  ok(tag + "the coach's reply is said, with \"Your move\"", /Black: .+\. Your move\./.test(reply), reply);

  /* a bad entry */
  await page.keyboard.press("K");
  await page.keyboard.type("e3");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  const badMsg = await page.evaluate(() => ({ msg: document.getElementById("kbMsg").textContent, open: !document.getElementById("kbType").classList.contains("hide"),
    n: __cr.game.played.length }));
  ok(tag + "an impossible move stays in the entry and says why", badMsg.open && /king/.test(badMsg.msg) && badMsg.n === 2, JSON.stringify(badMsg));
  ok(tag + "…and the why is spoken too", /No king of yours can go to e3/.test(await said()));
  await page.keyboard.press("Escape");
  ok(tag + "Escape closes the entry", await page.evaluate(() => document.getElementById("kbType").classList.contains("hide")));

  /* ---- the board under the keyboard ---- */
  let onBoard = false;
  for (let i = 0; i < 40 && !onBoard; i++) {
    await page.keyboard.press("Tab");
    onBoard = await page.evaluate(() => document.activeElement === __cr.renderer.canvas || /^cv[23]$/.test(document.activeElement.id));
  }
  ok(tag + "Tab reaches the board", onBoard);
  const role = await page.evaluate(() => { const a = document.activeElement; return { role: a.getAttribute("role"), label: a.getAttribute("aria-label") || "" }; });
  ok(tag + "…which has a role and a name that says how to play it", role.role === "application" && /Arrow keys/.test(role.label) && /type a move/.test(role.label), JSON.stringify(role));
  ok(tag + "focusing the board puts its cursor on your king and says so", (await page.evaluate(() => __cr.cursorForTest())) === Chess.sqIndex("e1") && /e1, white king/.test(await said()));
  let shot0 = null;
  if (flat) shot0 = await page.screenshot({ clip: await page.evaluate(() => { const r = document.getElementById("cv2").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
  for (const k of ["ArrowRight", "ArrowRight"]) await page.keyboard.press(k);
  ok(tag + "the arrows walk the cursor and say the square", (await page.evaluate(() => __cr.cursorForTest())) === Chess.sqIndex("g1") && /g1, white knight/.test(await said()));
  if (flat) {
    await page.waitForTimeout(150);
    const shot1 = await page.screenshot({ clip: await page.evaluate(() => { const r = document.getElementById("cv2").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
    ok(tag + "…and the flat board draws it where it goes", !shot0.equals(shot1));
  }
  ok(tag + "the renderer has the cursor hook", await page.evaluate(() => typeof __cr.renderer.setCursor === "function"));
  ok(tag + "← → on the board move the cursor, not the game", await page.evaluate(() => __cr.viewPly) === -1);
  await page.keyboard.press("Enter");
  ok(tag + "Enter picks the knight up and says where it can go", await page.evaluate(() => true) && /Picked up the knight on g1\. It can go to (e2, f3, h3|.*f3)/.test(await said()), await said());
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowLeft");
  ok(tag + "…the squares it can reach say so", /f3, empty, you can go here/.test(await said()));
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => __cr.game.played.length >= 3, null, { timeout: 5000 }).catch(() => {});
  ok(tag + "Enter sets it down: Nf3 is played from the keyboard", await page.evaluate(() => __cr.game.played.length >= 3 && __cr.game.played[2].san.replace(/[+#]/, "") === "Nf3"));
  await page.waitForTimeout(250);
  ok(tag + "…and said", /White: knight to f3/.test(await said()));
  await page.waitForFunction(() => __cr.game.played.length >= 4, null, { timeout: 20000 }).catch(() => {});
  await settle();
  /* pick up and put back */
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  ok(tag + "Escape on the board puts a picked-up piece back", /Put back\./.test(await said()) && await page.evaluate(() => __cr.game.played.length === 4));

  /* the move list */
  const cells = await page.evaluate(() => [...document.querySelectorAll("#moveList .m")].map((c) => ({ l: c.getAttribute("aria-label") || "", t: c.tabIndex, cur: c.getAttribute("aria-current") })));
  ok(tag + "every move in the list has a name in words", cells.length === 4 && cells.every((c) => /^\d+\. (White|Black): /.test(c.l)), JSON.stringify(cells.slice(0, 2)));
  ok(tag + "…and only the current one is a stop in the tab order", cells.filter((c) => c.t === 0).length === 1 && cells.filter((c) => c.cur === "true").length === 1);

  /* ---- a card from the keyboard, and focus back ---- */
  await page.focus("#btnFlip");
  await page.keyboard.press("Shift+M");
  await page.waitForTimeout(150);
  const inLobby = await active();
  ok(tag + "Shift+M opens the menu and focus goes into it", inLobby.inMenu, JSON.stringify(inLobby));
  ok(tag + "…with the game beneath inert", await page.evaluate(() => document.getElementById("app").inert));
  await page.click("#mSettings");
  await page.waitForTimeout(150);
  const inSet = await active();
  ok(tag + "from the lobby to Settings, focus follows into the new card", inSet.ov === "ovSettings", JSON.stringify(inSet));
  await page.keyboard.press("Escape");   /* Settings → the lobby */
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");   /* the lobby → the game */
  await page.waitForTimeout(200);
  const back = await active();
  ok(tag + "Escape back out of both, and focus is where it was before the first card", back.id === "btnFlip", JSON.stringify(back));
  ok(tag + "a ring shows on what has keyboard focus", await page.evaluate(() => getComputedStyle(document.getElementById("btnFlip")).outlineStyle !== "none"));
  await page.keyboard.press("/");
  await page.waitForTimeout(150);
  const keys = await page.evaluate(() => ({ open: !document.getElementById("ovAsk").classList.contains("hide"),
    body: document.getElementById("askBody").textContent, focus: document.activeElement.textContent }));
  ok(tag + "\"/\" shows the keys, with focus on its button", keys.open && /The keys/.test(keys.body) && /Shift U/.test(keys.body) && keys.focus === "Done", JSON.stringify(keys).slice(0, 160));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  ok(tag + "…and Escape gives focus back", (await active()).id === "btnFlip");
  const flip0 = await page.evaluate(() => __cr.renderer.orientation);
  await page.keyboard.press("Shift+F");
  ok(tag + "Shift+F flips the board, as the button does", (await page.evaluate(() => __cr.renderer.orientation)) === -flip0);
  await page.keyboard.press("Shift+F");
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Shift+W");
  await page.waitForTimeout(200);
  ok(tag + "Shift+W reads where everything is", /White to move\. White: king e1.*Black: king e8.*The last move: Black:/.test(await said()));

  /* ---- a whole game on the keyboard alone: two players, mate in two ---- */
  await page.evaluate(() => __cr.startGame("pass", { clockStr: "none" }));
  await page.waitForTimeout(500);
  await settle();
  for (const mv of ["f3", "e5", "g4", "Qh4"]) {
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await settle();
    await page.keyboard.type(mv);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
  }
  await page.waitForFunction(() => __cr.game.played.length === 4, null, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(400);
  const end = await page.evaluate(() => ({ n: __cr.game.played.length, sans: __cr.game.played.map((p) => p.san).join(" ") }));
  ok(tag + "a whole game typed: f3 e5 g4 Qh4#", end.n === 4 && /Qh4#/.test(end.sans), JSON.stringify(end));
  ok(tag + "…the mate and the result are said in words", /Black: queen to h4, checkmate/.test(await said()) && /Game over\. .*Checkmate\. Black wins, 0–1\./.test(await said()), (await said()).slice(-200));
  await page.waitForFunction(() => !document.getElementById("ovEnd").classList.contains("hide"), null, { timeout: 6000 }).catch(() => {});
  ok(tag + "the end card takes focus when it comes up", (await active()).ov === "ovEnd");

  ok(tag + "the console stayed quiet", !errs.length, errs.slice(0, 3).join(" | "));
  await ctx.close();
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    await board(browser, base, true);
    await board(browser, base, false);
  } catch (e) {
    failed++;
    console.log("FAIL  the check itself stumbled  → " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" ") : e));
  }
  await browser.close();
  server.close();
  console.log(failed ? "\n" + failed + " FAILED" : "\nthe board speaks, and plays without a mouse");
  process.exit(failed ? 1 : 0);
})();
