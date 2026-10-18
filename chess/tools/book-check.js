/* book-check.js — the opening stories must be legal, complete and true.

   Every line in book.js must be a sequence of legal moves in exactly the
   SAN the engine itself would write. Every move of every line must have
   its own reason — a story that explains half its moves teaches that
   the other half are magic. The words must be clean: no markdown that
   won't render, only <b> and <i> where markup is allowed, no two lines
   with the same name, and names that agree with the ECO table wherever
   that table names exactly the same position.

   And the reasons have to be true. Any reason that names something you
   could check on the board — an attack, a defence, a pin, a check, a
   mate, a pawn offered or won back — has a claim below that checks it,
   on the board, after that very move. A reason that uses one of those
   words without a claim to back it fails, so a new reason can't slip
   in on charm alone.
   Run: node chess/tools/book-check.js */
"use strict";
const Chess = require("../engine.js");
const Book = require("../book.js");
const Teach = require("../teach.js");
const Eco = require("../eco.js");

let failed = 0;
const fail = (label, msg) => { failed++; console.log(`FAIL  ${label}: ${msg}`); };

/* ---------- small board helpers ---------- */
const sq = (name) => Chess.sqIndex(name);
function at(seq) {
  const g = Chess.create();
  for (const s of seq.split(" ").filter(Boolean)) {
    const m = Chess.fromSAN(g, s);
    if (!m) throw new Error(`illegal ${s} in ${seq}`);
    Chess.play(g, m);
  }
  return g;
}
const attacks = (g, from, to) => Teach.attacksFrom(g, sq(from)).indexOf(sq(to)) >= 0;
const owner = (g, s) => Math.sign(g.board[sq(s)]);
const defenders = (g, s) => Teach.attackersOf(g, sq(s), owner(g, s)).map(Chess.sqName);
const undefended = (g, s) => !!g.board[sq(s)] && defenders(g, s).length === 0;
const loose = (g, s) => Teach.isLoose(g, sq(s));
/* with the turn handed to `side` — "if it were their move" */
function asIf(g, side) { const t = Chess.create(Chess.fen(g)); t.turn = side; t.ep = -1; return t; }
function canMove(g, s) {
  const side = owner(g, s), t = asIf(g, side);
  return Chess.moves(t).some((m) => m.from === sq(s));
}
function givesCheck(g, side, san) {
  const t = asIf(g, side), m = Chess.fromSAN(t, san);
  if (!m) return false;
  Chess.make(t, m); const c = Chess.inCheck(t); Chess.unmake(t);
  return c;
}
function material(g) {
  let s = 0;
  for (let i = 0; i < 128; i++) if (Chess.onBoard(i) && g.board[i]) s += Math.sign(g.board[i]) * Teach.VAL[Math.abs(g.board[i])] * (Math.abs(g.board[i]) === 6 ? 0 : 1);
  return s;
}
const W = 1, B = -1;

/* ---------- the claims ----------
   key: the moves up to and including the move whose reason is checked.
   Each claim runs on the position right after that move. */
const CLAIMS = {
  "e4": [["the queen and the f1 bishop now have moves", (g) => canMove(g, "d1") && canMove(g, "f1")]],
  "e4 e5": [["the black queen and f8 bishop now have moves", (g) => canMove(g, "d8") && canMove(g, "f8")]],
  "e4 e5 Nf3": [["Nf3 attacks e5", (g) => attacks(g, "f3", "e5")],
                ["nothing defends e5", (g) => undefended(g, "e5")]],
  "e4 e5 Nf3 Nc6": [["Nc6 defends e5", (g) => attacks(g, "c6", "e5")]],
  "e4 e5 Nf3 Nc6 Bc4": [["Bc4 aims at f7", (g) => attacks(g, "c4", "f7")],
                        ["only the king defends f7", (g) => defenders(g, "f7").join() === "e8"]],
  "e4 e5 Nf3 Nc6 Bc4 Bc5": [["Bc5 aims at f2", (g) => attacks(g, "c5", "f2")],
                            ["only the king defends f2", (g) => defenders(g, "f2").join() === "e1"]],
  "e4 e5 Nf3 Nc6 Bc4 Bc5 c3": [["c3 supports d4", (g) => attacks(g, "c3", "d4")]],
  "e4 e5 Nf3 Nc6 Bc4 Nf6": [["Nf6 attacks e4", (g) => attacks(g, "f6", "e4")],
                            ["nothing defends e4", (g) => undefended(g, "e4")]],
  "e4 e5 Nf3 Nc6 Bb5": [["Bb5 attacks the knight on c6", (g) => attacks(g, "b5", "c6")],
                        ["the knight on c6 defends e5", (g) => attacks(g, "c6", "e5")]],
  "e4 e5 Nf3 Nc6 Bb5 a6": [["a6 attacks the bishop", (g) => attacks(g, "a6", "b5")]],
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4": [["from a4 the bishop still looks at c6", (g) => attacks(g, "a4", "c6")]],
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6": [["Nf6 attacks e4", (g) => attacks(g, "f6", "e4")],
                                   ["nothing defends e4", (g) => undefended(g, "e4")]],
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O": [
    ["e4 is loose", (g) => loose(g, "e4")],
    ["if Black takes it, White is not left a pawn down (Re1 wins one back)", () => {
      const g = at("e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4");
      const r = Chess.search(g, { ms: 2500, maxDepth: 8 });
      return r.score > -40 && /^(Re1|d4)$/.test(Chess.toSAN(g, r.move));
    }]],
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7": [["Black's kingside is clear to castle", (g) => !g.board[sq("f8")] && !g.board[sq("g8")]],
                                           ["e4 is still on the board", (g) => g.board[sq("e4")] === Chess.P]],
  "e4 e5 Nf3 Nc6 d4": [["d4 strikes at e5", (g) => attacks(g, "d4", "e5")]],
  "e4 e5 Nc3": [["Nc3 guards e4", (g) => attacks(g, "c3", "e4")],
                ["the f-pawn can still advance to f4", (g) => !!Chess.fromSAN(asIf(g, W), "f4")]],
  "e4 e5 f4": [["the f4 pawn is offered: exf4 wins it", (g) => loose(g, "f4") && !!Chess.fromSAN(g, "exf4")]],
  "e4 e5 Nf3 Nf6": [
    ["Nf6 attacks e4, which nothing defends", (g) => attacks(g, "f6", "e4") && undefended(g, "e4")],
    ["e5 is left undefended", (g) => undefended(g, "e5")],
    ["Nxe5 d6 Nf3 Nxe4: d6 kicks the knight and Black wins the pawn back", () => {
      const k = at("e4 e5 Nf3 Nf6 Nxe5 d6");
      const g = at("e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4");
      return attacks(k, "d6", "e5") && material(g) === 0;
    }]],
  "e4 e5 Qh5": [
    ["Qh5 attacks e5, which nothing defends", (g) => attacks(g, "h5", "e5") && undefended(g, "e5")],
    ["Qxe5 would be check", (g) => givesCheck(g, W, "Qxe5")],
    ["the queen eyes f7", (g) => attacks(g, "h5", "f7")],
    ["Qxf7 is not mate yet", (g) => { const t = asIf(g, W), m = Chess.fromSAN(t, "Qxf7"); Chess.make(t, m); const mate = Chess.inCheck(t) && !Chess.moves(t).length; Chess.unmake(t); return !mate; }],
    ["with Bc4 next, Qxf7 would be mate", () => {
      const g = at("e4 e5 Qh5 a6 Bc4");
      const th = Teach.mateThreat(g, W);
      return !!th && th.san === "Qxf7#";
    }]],
  "e4 e5 Qh5 Nc6": [
    ["Nc6 defends e5", (g) => attacks(g, "c6", "e5")],
    ["after Bc4, ...g6 attacks the queen and blocks her line to f7", () => {
      const pre = at("e4 e5 Qh5 Nc6 Bc4"), g = at("e4 e5 Qh5 Nc6 Bc4 g6");
      return !!Teach.mateThreat(pre, W) && attacks(g, "g6", "h5") && !attacks(g, "h5", "f7");
    }]],
  "e4 c5": [["c5 fights for d4", (g) => attacks(g, "c5", "d4")]],
  "e4 c5 Nf3": [["the knight backs up d4", (g) => attacks(g, "f3", "d4")]],
  "e4 c5 Nf3 d6": [["d6 takes e5 away", (g) => attacks(g, "d6", "e5")],
                   ["the c8 bishop now has moves", (g) => canMove(g, "c8")]],
  "e4 c5 Nf3 d6 d4": [["the d4 pawn is offered to the c5 pawn", (g) => attacks(g, "c5", "d4")]],
  "e4 c5 Nf3 d6 d4 cxd4": [["once White takes back, Black has two centre pawns to White's one", () => {
    const g = at("e4 c5 Nf3 d6 d4 cxd4 Nxd4");
    let b = 0, w = 0;
    for (const f of [3, 4]) for (let r = 0; r < 8; r++) { const p = g.board[r * 16 + f]; if (p === -Chess.P) b++; if (p === Chess.P) w++; }
    return b === 2 && w === 1;
  }]],
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4": [["the knight stands on d4", (g) => g.board[sq("d4")] === Chess.N]],
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6": [["Nf6 attacks e4, which nothing defends", (g) => attacks(g, "f6", "e4") && undefended(g, "e4")]],
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3": [["Nc3 defends e4", (g) => attacks(g, "c3", "e4")]],
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6": [["a6 takes b5 away", (g) => attacks(g, "a6", "b5")]],
  "e4 c6": [["c6 will support ...d5", (g) => attacks(g, "c6", "d5")]],
  "e4 e6": [["e6 will support ...d5", (g) => attacks(g, "e6", "d5")]],
  "e4 d5": [["d5 strikes at e4", (g) => attacks(g, "d5", "e4")]],
  "e4 d6": [["d6 controls e5", (g) => attacks(g, "d6", "e5")]],
  "d4": [["d4 is protected by the queen", (g) => defenders(g, "d4").indexOf("d1") >= 0]],
  "d4 d5": [["neither centre pawn can move forward", (g) => !Chess.fromSAN(asIf(g, W), "d5") && !Chess.fromSAN(asIf(g, B), "d4")]],
  "d4 d5 c4": [["the c4 pawn is offered", (g) => loose(g, "c4") && attacks(g, "d5", "c4")],
               ["after dxc4, White can play e4", () => !!Chess.fromSAN(at("d4 d5 c4 dxc4"), "e4")]],
  "d4 d5 c4 e6": [["e6 supports d5", (g) => attacks(g, "e6", "d5")],
                  ["the f8 bishop can come out", (g) => canMove(g, "f8")]],
  "d4 d5 c4 c6": [["c6 supports d5", (g) => attacks(g, "c6", "d5")],
                  ["the c8 bishop's diagonal is open", (g) => canMove(g, "c8")]],
  "d4 d5 c4 dxc4": [["White is not left a pawn down for long", () => {
    const g = at("d4 d5 c4 dxc4");
    return Chess.search(g, { ms: 2000, maxDepth: 8 }).score > -40;
  }]],
  "d4 Nf6": [["Nf6 controls e4", (g) => attacks(g, "f6", "e4")]],
  "d4 Nf6 c4": [["c4 controls d5", (g) => attacks(g, "c4", "d5")]],
  "d4 Nf6 c4 e6": [["the f8 bishop can come out", (g) => canMove(g, "f8")],
                   ["...d5 and ...Bb4 are both possible", (g) => !!Chess.fromSAN(asIf(g, B), "d5") && !!Chess.fromSAN(asIf(g, B), "Bb4")]],
  "d4 Nf6 c4 e6 Nc3": [["Nc3 backs up e4", (g) => attacks(g, "c3", "e4")],
                       ["the knight on f6 guards e4", (g) => attacks(g, "f6", "e4")]],
  "d4 Nf6 c4 e6 Nc3 Bb4": [
    ["Bb4 pins the knight on c3 to the king", (g) => Teach.lines(g, B).pins.some((p) => p.by === sq("b4") && p.front === sq("c3") && p.absolute)],
    ["the pinned knight has no legal move (so it can't take back on e4)", (g) => !Chess.moves(g).some((m) => m.from === sq("c3"))]],
  "d4 Nf6 c4 g6": [["the bishop can reach g7", (g) => canMove(g, "f8") && !g.board[sq("g7")]]],
  "d4 Nf6 c4 g6 Nc3": [["Nc3 backs up e4", (g) => attacks(g, "c3", "e4")]],
  "d4 Nf6 c4 g6 Nc3 Bg7": [["the bishop on g7 looks down the long diagonal", (g) => attacks(g, "g7", "f6") || attacks(g, "g7", "h8")],
                           ["castling is next: f8 and g8 are clear", (g) => !g.board[sq("f8")] && !g.board[sq("g8")]]],
  "d4 d5 Nf3": [["Nf3 keeps an eye on e5", (g) => attacks(g, "f3", "e5")]],
  "d4 d5 Nf3 Nf6": [["Nf6 stops e4", (g) => attacks(g, "f6", "e4")]],
  "d4 d5 Nf3 Nf6 Bf4": [["the bishop is out while e3 hasn't been played", (g) => g.board[sq("f4")] === Chess.B && g.board[sq("e2")] === Chess.P]],
  "d4 f5": [["f5 controls e4", (g) => attacks(g, "f5", "e4")]],
  "c4": [["c4 fights for d5", (g) => attacks(g, "c4", "d5")]],
  "Nf3": [["Nf3 controls e5 and d4", (g) => attacks(g, "f3", "e5") && attacks(g, "f3", "d4")]],
  "Nf3 d5": [["the knight on f3 doesn't reach d5", (g) => !attacks(g, "f3", "d5")]],
  "Nf3 d5 c4": [["c4 attacks d5", (g) => attacks(g, "c4", "d5")]]
};
/* words that claim something checkable; a reason using one must have a claim */
const CHECKABLE = /\b(attack|attacks|defend|defends|defended|guard|guards|guarding|protected|support|supports|supported|pin|pins|pinned|fork|forks|skewer|check|mate|threat|threatens|wins?|offers?|controls?|strikes?|fights?|kicks?|stops?|blocks?|eyes|takes [a-h][1-8] away|nothing defends)\b/i;

/* ---------- markup ---------- */
function problems(text, html) {
  const out = [];
  if (typeof text !== "string" || !text.trim()) return ["empty"];
  if (/\*/.test(text)) out.push("contains '*' (markdown doesn't render)");
  if (/_[^_\s]+_/.test(text)) out.push("contains _underscores_ (markdown doesn't render)");
  if (/\bundefined\b|\bnull\b|NaN/.test(text)) out.push("contains undefined/null/NaN");
  if (/ {2,}/.test(text) || text !== text.trim()) out.push("stray whitespace");
  if (!html) { if (/[<>]/.test(text)) out.push("markup where plain text is shown"); return out; }
  const stack = [];
  const re = /<\/?([a-z]+)[^>]*>/gi;
  let m;
  while ((m = re.exec(text))) {
    const tag = m[1].toLowerCase();
    if (tag !== "b" && tag !== "i") { out.push(`unexpected <${tag}>`); continue; }
    if (m[0][1] === "/") { if (stack.pop() !== tag) out.push(`unbalanced </${tag}>`); } else stack.push(tag);
  }
  if (stack.length) out.push("unclosed tag");
  if (/<(?!\/?[bi]>)/.test(text)) out.push("stray '<'");
  return out;
}
const sentences = (t) => (t.replace(/<[^>]+>/g, "").match(/(?<!\.)[.!?](?=\s|$)/g) || []).length;

/* ---------- names against the ECO table ---------- */
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/defence/g, "defense").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
/* the book uses the everyday family name where the table uses the
   formal one; both are what the world calls it */
const FAMILY = {
  "open game": "king's pawn game", "king's pawn opening": "king's pawn game",
  "closed game": "queen's pawn game", "queen's pawn opening": "queen's pawn game",
  "scholar's mate attempt": "king's pawn game", "london system": "queen's pawn game",
  "sicilian": "sicilian defense"
};
const GENERIC = new Set(["the", "line", "main", "variation", "defense", "game", "opening", "calm", "attempt"]);

/* ---------- the lines ---------- */
const names = new Map();
let reasons = 0;
for (const line of Book.LINES) {
  const label = line.name;
  if (names.has(line.name)) fail(label, `same name as the line "${names.get(line.name)}" — two stories can't share a title`);
  names.set(line.name, line.seq);
  for (const p of problems(line.name, false)) fail(label, "name: " + p);
  for (const p of problems(line.idea, true)) fail(label, "idea: " + p);

  /* legal and canonical */
  const g = Chess.create();
  const sans = line.seq.split(" ");
  let legal = true;
  for (let i = 0; i < sans.length; i++) {
    const m = Chess.fromSAN(g, sans[i]);
    if (!m) { fail(label, `illegal/misspelt move "${sans[i]}" at ply ${i + 1} (${line.seq})`); legal = false; break; }
    const canonical = Chess.play(g, m).replace(/[+#]$/, "");
    if (canonical !== sans[i]) { fail(label, `"${sans[i]}" should be written "${canonical}"`); legal = false; break; }
  }
  if (!legal) continue;

  /* one reason per move, every move */
  if (!Array.isArray(line.why) || line.why.length !== sans.length) {
    fail(label, `has ${line.why ? line.why.length : 0} reasons for ${sans.length} moves`);
  } else {
    line.why.forEach((w, i) => {
      const at_ = `${label}, move ${i + 1} (${sans[i]})`;
      if (typeof w !== "string" || w.trim().length < 15) { fail(at_, "has no reason of its own"); return; }
      for (const p of problems(w, true)) fail(at_, p);
      const n = sentences(w);
      if (n < 1 || n > 2) fail(at_, `should be one or two sentences, not ${n}`);
      if (w.length > 260) fail(at_, `is ${w.length} characters — too long to read during a tour`);
      reasons++;
    });
  }

  /* the name agrees with the ECO table where it names this exact position */
  const e = Eco.match(sans);
  if (e && e.seq === line.seq) {
    const [bf, bv] = norm(line.name).split(":").map((s) => s && s.trim());
    const ef = norm(e.name).split(":")[0].trim();
    if (bf !== ef && FAMILY[bf] !== ef) fail(label, `the ECO table calls ${line.seq} "${e.name}"`);
    if (bv) {
      const words = bv.split(/[^a-z']+/).filter((x) => x.length >= 4 && !GENERIC.has(x));
      const missing = words.filter((x) => norm(e.name).indexOf(x) < 0);
      if (missing.length) fail(label, `the ECO table calls ${line.seq} "${e.name}" — "${missing.join(" ")}" isn't in it`);
    }
  }
}

/* ---------- every reason, checked on the board ---------- */
let claims = 0;
for (const key of Object.keys(Book.REASONS || {})) {
  const text = Book.REASONS[key];
  const list = CLAIMS[key];
  if (CHECKABLE.test(text.replace(/<[^>]+>/g, "")) && !list) {
    fail(`reason for ${key}`, `says something checkable ("${text.match(CHECKABLE)[0]}") but has no claim in book-check.js`);
    continue;
  }
  let g;
  try { g = at(key); } catch (e) { fail(`reason for ${key}`, e.message); continue; }
  for (const [what, fn] of list || []) {
    let res = false;
    try { res = fn(g); } catch (e) { res = false; what && console.log(`      (${e.message})`); }
    if (!res) fail(`reason for ${key}`, `claims ${what} — not true on the board`);
    claims++;
  }
}
/* and every claim belongs to a reason that exists */
for (const key of Object.keys(CLAIMS)) if (!(Book.REASONS || {})[key]) fail("book-check", `claim for "${key}" has no reason`);
for (const key of Object.keys(Book.REASONS || {})) {
  if (!Book.LINES.some((l) => (l.seq + " ").indexOf(key + " ") === 0)) fail(`reason for ${key}`, "belongs to no line");
}
for (const p of Book.PRINCIPLES) for (const q of problems(p, false)) fail("principle", `"${p}": ${q}`);

console.log(failed
  ? `\n${failed} FAILURE(S)`
  : `all ${Book.LINES.length} lines legal & canonical; ${reasons} moves each with a reason; ${claims} claims true on the board`);
process.exit(failed ? 1 : 0);
