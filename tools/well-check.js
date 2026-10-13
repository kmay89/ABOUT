/* well-check.js — dev-only. The well's promises, checked rather than hoped.

   The well makes more promises than any other room here, and nearly all of
   them break silently. A label renamed in a hurry, a skin added on a quiet
   Sunday, a sky made a little brighter because it looked nicer — none of
   those throws, none of them shows up in the rules check, and each one
   quietly undoes something that was decided on purpose. So each of those
   decisions is a check here, run against the shipped files as they are:

     · borrowed names — the genre's trademarked words appear nowhere in what
       the room ships: not in a label, not in an identifier, not in a
       comment. The explainer's prose may say Tetris® (it has to, to tell
       the history and the research honestly), with the ® on the first
       mention of each sheet, and so may a README. The labels other games
       made famous — Hold, NEXT, GAME OVER and the rest — are never ours.
     · health claims — none, anywhere outside the explainer; and inside it,
       which has to be able to say "it is not a therapy", none of the
       affirmative ones.
     · colours — every skin is held to the palette lint: away from the
       genre's classic colour for each piece, no saturated red, and every
       pair of pieces told apart under normal vision and under three
       simulated kinds of colour blindness. The colour maths is done here
       from first principles — CIELAB, and the Machado, Oliveira and
       Fernandes (2009) matrices at full severity — and is made to
       reproduce known figures before it is trusted with anything.
     · skies — every world's backdrop stays at or under 0.05 relative
       luminance, which is what keeps a crossfade or a world's Quad response
       far below the 0.1 change that counts as a flash.
     · help lines — the list in the explainer was checked on a date, and a
       number nobody has re-checked for a year is a number that may be
       wrong at the worst possible moment.
     · the offline shell — every script the page loads is in the service
       worker's list, in the order the room's contract gives, or the room
       opens online and is blank on a bus.

   It needs nothing but node. The data modules are `require`d exactly as
   the room promises they can be — they load in node without a DOM — and
   the explainer's sheets are rendered into a small pretend document inside
   a vm sandbox, so the ® rule is checked against the words a reader
   actually sees, in the order they see them.

   Run: node tools/well-check.js
        node tools/well-check.js --dir path/to/another/copy/of/well
   WELL_TODAY=YYYY-MM-DD pretends today is another day, which is how the
   help-line check itself gets tested.                                      */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const at = process.argv.indexOf("--dir");
const DIR = at > 0 && process.argv[at + 1] ? path.resolve(process.argv[at + 1]) : path.join(ROOT, "well");
const TODAY = process.env.WELL_TODAY ? new Date(process.env.WELL_TODAY + "T12:00:00Z") : new Date();

/* the room's contract: every script, in the order index.html loads them */
const SCRIPTS = ["rules.js", "engine.js", "bot.js", "modes.js", "records.js", "worlds.js",
  "skins.js", "layout.js", "prefs.js", "sky.js", "gfx2d.js", "gfx3d.js", "music.js",
  "input.js", "learn.js", "coach.js", "steady.js", "sheets.js", "app.js"];
const WORLD_IDS = ["dawn", "tide", "rain", "bamboo", "aurora", "moonpool", "lanterns",
  "snowfall", "bells", "starfield"];
const PIECES = ["I", "O", "T", "S", "Z", "J", "L"];

let fails = 0;
function ok(what, cond, detail) {
  if (cond) console.log("  ✓ " + what);
  else { fails++; console.log("  ✗ " + what + (detail ? " — " + detail : "")); }
}
function note(what) { console.log("  · " + what); }
function section(title) { console.log("\n──  " + title); }
/* a section that cannot run says why, once, as a failure — never as a pass */
function guarded(title, fn) {
  section(title);
  try { fn(); } catch (e) { ok("could check this at all", false, String(e && e.message || e).split("\n")[0]); }
}

const here = (f) => path.join(DIR, f);
/* the room promises its data files load in node with no page around them;
   when one doesn't, say that, rather than whatever it tripped over */
function load(f) {
  if (!has(f)) throw new Error(f + " is not here yet");
  global.self = global.self || {};
  try { return require(here(f)); }
  catch (e) { throw new Error(f + " doesn't load in node without a page: " + String(e.message || e).split("\n")[0]); }
}
const has = (f) => fs.existsSync(here(f));
const read = (f) => fs.readFileSync(here(f), "utf8");
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/* ================================================================
   reading JavaScript without running it
   ================================================================
   The copy rules care which part of a file a word is in — a word that is
   fine in the explainer's prose is not fine in an identifier next to it —
   so files are split into strings, comments and code. This is a lexer, not
   a parser: it knows quotes, template literals (and the ${…} inside them),
   comments, and enough about the previous token to tell a regular
   expression from a division. That is all a word-finder needs. */
const REGEX_AFTER = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete",
  "void", "throw", "case", "do", "else", "yield", "await"]);
function lexJs(src) {
  const n = src.length, strings = [], holes = [];
  const braces = [];            /* brace depth outside each open ${ … } */
  let depth = 0, i = 0, prev = "(", prevWord = "";
  function templateText() {     /* i sits just inside a template's text */
    const start = i;
    while (i < n) {
      const c = src[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { push(start, i, "`"); i++; prev = "x"; return; }
      if (c === "$" && src[i + 1] === "{") {
        push(start, i, "`"); i += 2; braces.push(depth); depth = 0; prev = "("; return;
      }
      i++;
    }
    push(start, n, "`");
  }
  function push(a, b, quote) {
    strings.push({ at: a, raw: src.slice(a, b), value: unescapeJs(src.slice(a, b)), quote });
    holes.push([a, b, "string"]);
  }
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") {
      const e = src.indexOf("\n", i), end = e < 0 ? n : e;
      holes.push([i, end, "comment"]); i = end; continue;
    }
    if (c === "/" && d === "*") {
      const e = src.indexOf("*/", i + 2), end = e < 0 ? n : e + 2;
      holes.push([i, end, "comment"]); i = end; continue;
    }
    if (c === "'" || c === '"') {
      const start = ++i;
      while (i < n && src[i] !== c && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
      push(start, Math.min(i, n), c); i++; prev = "x"; continue;
    }
    if (c === "`") { i++; templateText(); continue; }
    if (c === "{") { depth++; prev = "{"; i++; continue; }
    if (c === "}") {
      if (depth === 0 && braces.length) { depth = braces.pop(); i++; templateText(); continue; }
      depth--; prev = "}"; i++; continue;
    }
    if (c === "/") {
      const division = /[A-Za-z0-9_$)\]]/.test(prev) && !(prev === "w" && REGEX_AFTER.has(prevWord));
      if (!division) {
        i++;
        let cls = false;
        while (i < n && src[i] !== "\n") {
          const r = src[i];
          if (r === "\\") { i += 2; continue; }
          if (r === "[") cls = true; else if (r === "]") cls = false;
          else if (r === "/" && !cls) break;
          i++;
        }
        i++;
        while (i < n && /[a-z]/i.test(src[i])) i++;
        prev = "x"; continue;
      }
      prev = "/"; i++; continue;
    }
    if (/[A-Za-z_$\u0080-\uffff]/.test(c)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$\u0080-\uffff]/.test(src[i])) i++;
      prevWord = src.slice(start, i); prev = "w"; continue;
    }
    if (/[0-9]/.test(c)) { while (i < n && /[0-9A-Za-z_.]/.test(src[i])) i++; prev = "0"; continue; }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return { src, strings, holes };
}
/* the same text with the chosen kinds of hole blanked out, so positions —
   and therefore line numbers — still line up with the file */
function without(lex, kinds) {
  const out = lex.src.split("");
  for (const [a, b, kind] of lex.holes) {
    if (kinds.indexOf(kind) < 0) continue;
    for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " ";
  }
  return out.join("");
}
function unescapeJs(s) {
  return s.replace(/\\(u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([\s\S]))/g,
    (m, all, cp, u, x, ch) => {
      if (cp) return String.fromCodePoint(parseInt(cp, 16));
      if (u) return String.fromCharCode(parseInt(u, 16));
      if (x) return String.fromCharCode(parseInt(x, 16));
      return { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0", "\n": "" }[ch] || ch;
    });
}
function lineOf(text, index) { return text.slice(0, index).split("\n").length; }

/* ---------- reading HTML the way a reader does ---------- */
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", reg: "®",
  copy: "©", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  hellip: "…", middot: "·", larr: "←", rarr: "→", times: "×", trade: "™", deg: "°" };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] !== undefined ? ENTITIES[e.toLowerCase()] : m;
  });
}
function htmlText(html) {
  return decodeEntities(html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " "));
}
/* what a page puts in front of a person: its text, the attributes that are
   read out or shown (title, alt, aria-label, placeholder, a meta's content),
   and the strings of any inline script */
function htmlUiStrings(html) {
  const out = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/<style\b[\s\S]*?<\/style>/gi, (m) => m.replace(/[^\n]/g, " "));
  const text = body.replace(/<script\b[\s\S]*?<\/script>/gi, (m) => m.replace(/[^\n]/g, " "))
    .replace(/<[^>]*>/g, (m) => m.replace(/[^\n]/g, " "));
  out.push({ at: 0, value: decodeEntities(text), base: 0 });
  const attr = /\b(title|alt|aria-label|placeholder|content|label|value)\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = attr.exec(body))) out.push({ at: m.index, value: decodeEntities(m[2]) });
  const script = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = script.exec(body))) {
    for (const s of lexJs(m[1]).strings) out.push({ at: m.index + m[0].indexOf(m[1]) + s.at, value: s.value });
  }
  return out;
}

/* every file the room ships, and which of them are text */
function shipped() {
  const out = [];
  (function walk(rel) {
    for (const ent of fs.readdirSync(path.join(DIR, rel), { withFileTypes: true })) {
      const r = rel ? rel + "/" + ent.name : ent.name;
      if (ent.name.startsWith(".")) continue;
      if (ent.isDirectory()) walk(r);
      else out.push(r);
    }
  })("");
  return out;
}
const TEXT = /\.(js|html|css|webmanifest|json|txt|svg|xml|md)$/i;
const isReadme = (f) => /(^|\/)README\.md$/i.test(f);
/* look.css is not the room's words: it is the house style, copied byte for
   byte from breaker/ and checked for exactly that in the last section. Its
   "healing" is the four-letter door's network chip, which the well never
   shows. A copy that has drifted gets read like everything else. */
function houseCopy(f) {
  if (f !== "look.css") return false;
  const theirs = path.join(ROOT, "breaker", "look.css");
  return fs.existsSync(theirs) && fs.readFileSync(here(f)).equals(fs.readFileSync(theirs));
}

/* ================================================================
   1. the room is all here
   ================================================================ */
const shownDir = path.relative(ROOT, DIR).startsWith("..") ? DIR : path.relative(ROOT, DIR) + "/";
section("the room is all here — " + shownDir);
const present = fs.existsSync(DIR);
ok("the room's folder exists", present, DIR);
if (present) {
  const missing = ["index.html", "look.css", "sw.js", "manifest.webmanifest", "README.md"]
    .concat(SCRIPTS).filter((f) => !has(f));
  ok("every file the contract names is here (" + (SCRIPTS.length + 5) + ")", missing.length === 0,
     "still missing: " + missing.join(", "));
  const icons = ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]
    .filter((f) => !has("icons/" + f));
  ok("and its four icons", icons.length === 0, "missing: " + icons.join(", "));
}

/* ================================================================
   2. borrowed names
   ================================================================ */
const BLOCKED = ["tetris", "tetrimino", "t-spin", "tspin", "korobeiniki", "octoris",
  "dodecatris", "decahexatris", "perfectris", "ultimatris"];
const BLOCKED_RE = new RegExp(BLOCKED.map((w) => w.replace(/-/g, "\\-")).join("|"), "gi");
/* the pages outside the room that point at it: the desk's trinket and the
   games room's card are as public as the room itself */
const SITE_PAGES = ["index.html", "games/index.html"];

function hits(text, re) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) out.push({ word: m[0], line: lineOf(text, m.index) });
  return out;
}
function describe(found, n) {
  return found.slice(0, n || 4).map((h) => "line " + h.line + ": “" + h.word + "”").join(", ") +
    (found.length > (n || 4) ? " and " + (found.length - (n || 4)) + " more" : "");
}

guarded("no borrowed names", () => {
  if (!present) { ok("there is a room to read", false); return; }
  const files = shipped().filter((f) => TEXT.test(f) && !isReadme(f) && !houseCopy(f));
  let clean = 0;
  for (const f of files) {
    let text = read(f);
    /* learn.js's explainer strings are the one place the name may appear;
       its identifiers and comments are held to the same rule as everything */
    if (f === "learn.js") text = without(lexJs(text), ["string"]);
    const found = hits(text, BLOCKED_RE);
    if (found.length) ok(f + " names no other game", false, describe(found));
    else clean++;
  }
  if (clean === files.length) {
    ok("none of the " + BLOCKED.length + " blocked words in any of the room's " + files.length +
       " shipped files (learn.js's prose aside)", true);
  }
  for (const page of SITE_PAGES) {
    if (!fs.existsSync(path.join(ROOT, page))) continue;
    const found = hits(fs.readFileSync(path.join(ROOT, page), "utf8"), BLOCKED_RE);
    ok(page + ", which points at the well, names no other game", found.length === 0, describe(found));
  }
});

/* the labels other games made famous: case-sensitive, because "hold" is the
   engine's action and "Hold" is somebody else's button */
const LABELS_RE = /\b(Marathon|Sprint|Ultra|Matrix|Zone|Journey|Ghost|Hold|NEXT)\b|GAME OVER/g;
const GAMEOVER_RE = /\bgame\s+over\b/gi;
guarded("labels are the room's own", () => {
  if (!present) { ok("there is a room to read", false); return; }
  /* every string the room can show: index.html's text and spoken
     attributes, the manifest, and the strings of every script except the
     explainer, whose prose may say what other games call things */
  const sources = [];
  if (has("index.html")) sources.push({ f: "index.html", text: read("index.html"), parts: htmlUiStrings(read("index.html")) });
  if (has("manifest.webmanifest")) {
    const raw = read("manifest.webmanifest");
    sources.push({ f: "manifest.webmanifest", text: raw, parts: lexJs(raw).strings });
  }
  for (const f of SCRIPTS.filter((s) => s !== "learn.js" && has(s))) {
    const raw = read(f);
    sources.push({ f, text: raw, parts: lexJs(raw).strings });
  }
  let clean = 0;
  for (const s of sources) {
    const found = [];
    for (const p of s.parts) {
      for (const re of [LABELS_RE, GAMEOVER_RE]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(p.value))) {
          found.push({ word: m[0], line: p.base === 0 ? lineOf(p.value, m.index) : lineOf(s.text, p.at) });
        }
      }
    }
    if (found.length) ok(s.f + " uses only the room's own labels", false, describe(found));
    else clean++;
  }
  if (clean === sources.length) {
    ok("no Marathon, Sprint, Ultra, Matrix, Zone, Journey, Ghost, Hold, NEXT or GAME OVER in what " +
       sources.length + " files can show", true);
  }
});

/* ================================================================
   3. the ® where the name is used
   ================================================================ */
/* The first "Tetris" a reader meets on a page or a sheet carries the ®.
   The companies' own names — The Tetris Company, Tetris Holding — are
   names, not uses of the mark, and the credits rightly lead with one; and
   a project credited by its repository name (python-tetris) is a name in
   lower case, not the word. */
function firstMarked(text) {
  const flat = text.replace(/\s+/g, " ");
  const i = flat.search(/\bTetris(?!\s+(Company|Holding))/);
  if (i < 0) return { named: false };
  return { named: true, marked: /^\s?®/.test(flat.slice(i + 6, i + 8)),
           context: flat.slice(Math.max(0, i - 30), i + 30) };
}
function sheetVerdict(label, text) {
  const v = firstMarked(text);
  if (!v.named) { ok(label + " doesn't name it, so needs no ®", true); return; }
  ok(label + ": the first Tetris carries the ®", v.marked, "“…" + v.context + "…”");
}

/* A pretend document: enough DOM for a sheet to be built into, and nothing
   that runs later — timers and animation frames are accepted and never
   called, so the explainer's moving diagrams stay on their first frame. */
function pretendWorld() {
  let ids = 0;
  class PText {
    constructor(t) { this.nodeType = 3; this.nodeName = "#text"; this.data = String(t); this.parentNode = null; }
    get textContent() { return this.data; }
    set textContent(v) { this.data = String(v); }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  }
  class PHtml {
    constructor(h) { this.nodeType = 99; this.html = String(h); this.parentNode = null; }
    get textContent() { return htmlText(this.html); }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  }
  const style = () => new Proxy({ setProperty() {}, removeProperty() {}, getPropertyValue() { return ""; } },
    { get: (t, k) => (k in t ? t[k] : ""), set: (t, k, v) => { t[k] = v; return true; } });
  function context2d(canvas) {
    const store = { canvas };
    return new Proxy(store, {
      get(t, k) {
        if (k in t) return t[k];
        if (typeof k === "symbol") return undefined;
        if (k === "measureText") return (s) => ({ width: String(s).length * 7, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3 });
        if (k === "getImageData" || k === "createImageData") {
          return (a, b, w, h) => ({ width: w | 0, height: h | 0, data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0) * 4)) });
        }
        if (/^create(Linear|Radial|Conic)Gradient$|^createPattern$/.test(k)) return () => ({ addColorStop() {} });
        if (k === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        if (k === "getLineDash") return () => [];
        if (/^isPointIn/.test(k)) return () => false;
        return function () {};
      },
      set(t, k, v) { t[k] = v; return true; }
    });
  }
  class PElement {
    constructor(doc, tag) {
      this.ownerDocument = doc;
      this.nodeType = tag === "#fragment" ? 11 : 1;
      this.localName = String(tag).toLowerCase();
      this.tagName = this.nodeName = this.localName.toUpperCase();
      this.childNodes = []; this.parentNode = null; this.attrs = {};
      this.style = style(); this.dataset = {};
      this.id = ""; this.className = ""; this.hidden = false; this.title = "";
      this.value = ""; this.checked = false; this.disabled = false; this.tabIndex = 0;
      this.width = 300; this.height = 150; this.onclick = null;
      const el = this;
      this.classList = {
        add(...c) { const s = new Set(el.className.split(/\s+/).filter(Boolean)); c.forEach((x) => s.add(x)); el.className = [...s].join(" "); },
        remove(...c) { el.className = el.className.split(/\s+/).filter((x) => x && c.indexOf(x) < 0).join(" "); },
        contains(c) { return el.className.split(/\s+/).indexOf(c) >= 0; },
        toggle(c, force) {
          const on = force === undefined ? !this.contains(c) : !!force;
          if (on) this.add(c); else this.remove(c);
          return on;
        },
        replace(a, b) { this.remove(a); this.add(b); }
      };
    }
    get children() { return this.childNodes.filter((k) => k.nodeType === 1); }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
    get childElementCount() { return this.children.length; }
    get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    get nextSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] || null : null; }
    get previousSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) - 1] || null : null; }
    get nextElementSibling() { let s = this.nextSibling; while (s && s.nodeType !== 1) s = s.nextSibling; return s; }
    get isConnected() { return true; }
    get clientWidth() { return 360; } get clientHeight() { return 240; }
    get offsetWidth() { return 360; } get offsetHeight() { return 240; }
    get scrollWidth() { return 360; } get scrollHeight() { return 240; }
    get textContent() { return this.childNodes.map((k) => k.textContent).join(""); }
    set textContent(v) { this.childNodes = []; if (v !== "" && v !== null && v !== undefined) this.appendChild(new PText(v)); }
    get innerText() { return this.textContent; }
    set innerText(v) { this.textContent = v; }
    get innerHTML() {
      return this.childNodes.map((k) => (k.nodeType === 99 ? k.html : k.nodeType === 3 ? k.data : k.outerHTML)).join("");
    }
    set innerHTML(v) { this.childNodes = []; if (v) this.adopt(new PHtml(v), this.childNodes.length); }
    get outerHTML() { return "<" + this.localName + ">" + this.innerHTML + "</" + this.localName + ">"; }
    adopt(k, at) {
      if (k.nodeType === 11) { const list = k.childNodes.slice(); k.childNodes = []; list.forEach((c, j) => this.adopt(c, at + j)); return; }
      if (k.parentNode) k.parentNode.removeChild(k);
      k.parentNode = this;
      this.childNodes.splice(at, 0, k);
    }
    appendChild(k) { this.adopt(k, this.childNodes.length); return k; }
    insertBefore(k, ref) { const j = ref ? this.childNodes.indexOf(ref) : -1; this.adopt(k, j < 0 ? this.childNodes.length : j); return k; }
    removeChild(k) { const j = this.childNodes.indexOf(k); if (j >= 0) this.childNodes.splice(j, 1); k.parentNode = null; return k; }
    replaceChild(k, old) { const j = this.childNodes.indexOf(old); this.removeChild(old); this.adopt(k, Math.max(0, j)); return old; }
    append(...ks) { for (const k of ks) this.appendChild(typeof k === "object" && k ? k : new PText(k)); }
    prepend(...ks) { ks.slice().reverse().forEach((k) => this.adopt(typeof k === "object" && k ? k : new PText(k), 0)); }
    replaceChildren(...ks) { this.childNodes = []; this.append(...ks); }
    before(...ks) { const p = this.parentNode; if (p) ks.forEach((k) => p.insertBefore(typeof k === "object" ? k : new PText(k), this)); }
    after(...ks) { const p = this.parentNode; if (p) { const nx = this.nextSibling; ks.forEach((k) => p.insertBefore(typeof k === "object" ? k : new PText(k), nx)); } }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    replaceWith(...ks) { this.before(...ks); this.remove(); }
    insertAdjacentHTML(where, html) {
      const k = new PHtml(html);
      if (where === "afterbegin") this.adopt(k, 0);
      else if (where === "beforeend") this.adopt(k, this.childNodes.length);
      else if (this.parentNode) {
        const p = this.parentNode, j = p.childNodes.indexOf(this);
        p.adopt(k, where === "beforebegin" ? j : j + 1);
      }
    }
    insertAdjacentElement(where, k) { this.insertAdjacentHTML(where, ""); return k; }
    insertAdjacentText(where, t) { this.insertAdjacentHTML(where, String(t).replace(/</g, "&lt;")); }
    cloneNode(deep) {
      const c = new PElement(this.ownerDocument, this.localName);
      c.className = this.className; c.id = this.id; Object.assign(c.attrs, this.attrs);
      if (deep) this.childNodes.forEach((k) => c.appendChild(k.nodeType === 1 ? k.cloneNode(true) : k.nodeType === 3 ? new PText(k.data) : new PHtml(k.html)));
      return c;
    }
    contains(k) { while (k) { if (k === this) return true; k = k.parentNode; } return false; }
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === "id") this.id = String(v);
      else if (k === "class") this.className = String(v);
    }
    getAttribute(k) {
      if (k === "id") return this.id || null;
      if (k === "class") return this.className || null;
      return k in this.attrs ? this.attrs[k] : null;
    }
    hasAttribute(k) { return this.getAttribute(k) !== null; }
    removeAttribute(k) { delete this.attrs[k]; if (k === "class") this.className = ""; if (k === "id") this.id = ""; }
    toggleAttribute(k, force) { const on = force === undefined ? !this.hasAttribute(k) : !!force; if (on) this.setAttribute(k, ""); else this.removeAttribute(k); return on; }
    addEventListener() {} removeEventListener() {} dispatchEvent() { return true; }
    focus() {} blur() {} click() {} scrollIntoView() {} scrollTo() {} scrollBy() {}
    setPointerCapture() {} releasePointerCapture() {} hasPointerCapture() { return false; }
    showModal() {} show() {} close() {}
    getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 360, height: 240, right: 360, bottom: 240 }; }
    getClientRects() { return [this.getBoundingClientRect()]; }
    animate() { return { finished: Promise.resolve(), cancel() {}, finish() {}, play() {}, pause() {}, onfinish: null }; }
    getAnimations() { return []; }
    matches() { return false; }
    closest() { return null; }
    walk(fn) { for (const k of this.childNodes) if (k.nodeType === 1) { fn(k); k.walk(fn); } }
    querySelectorAll(sel) {
      /* one simple selector — #id, .class, tag or [attr] — which is all a
         sheet ever asks of its own body; anything fancier finds nothing */
      const m = /^\s*([a-z0-9-]*)(?:#([\w-]+))?(?:\.([\w-]+))?(?:\[([\w-]+)\])?\s*$/i.exec(sel);
      const out = [];
      if (!m) return out;
      this.walk((k) => {
        if (m[1] && k.localName !== m[1].toLowerCase()) return;
        if (m[2] && k.id !== m[2]) return;
        if (m[3] && !k.classList.contains(m[3])) return;
        if (m[4] && !k.hasAttribute(m[4])) return;
        out.push(k);
      });
      return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    getElementsByTagName(t) { return this.querySelectorAll(t); }
    getElementsByClassName(c) { return this.querySelectorAll("." + c); }
    getContext(type) {
      if (this.localName !== "canvas") return null;
      if (type === "2d") return this.ctx || (this.ctx = context2d(this));
      return null;
    }
    toDataURL() { return "data:,"; }
    toBlob(cb) { if (cb) cb(null); }
  }
  const doc = {
    nodeType: 9,
    createElement: (t) => new PElement(doc, t),
    createElementNS: (ns, t) => new PElement(doc, t),
    createTextNode: (t) => new PText(t),
    createDocumentFragment: () => new PElement(doc, "#fragment"),
    createComment: () => new PText(""),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    hidden: false, visibilityState: "visible", readyState: "complete",
    fonts: { ready: Promise.resolve() },
    hasFocus: () => true
  };
  doc.documentElement = new PElement(doc, "html");
  doc.head = doc.documentElement.appendChild(new PElement(doc, "head"));
  doc.body = doc.documentElement.appendChild(new PElement(doc, "body"));
  doc.activeElement = doc.body;
  doc.getElementById = (id) => doc.documentElement.querySelector("#" + id);
  doc.querySelector = (s) => doc.documentElement.querySelector(s);
  doc.querySelectorAll = (s) => doc.documentElement.querySelectorAll(s);
  doc.getElementsByTagName = (t) => doc.documentElement.getElementsByTagName(t);
  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } }; };
  const noop = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  const media = (q) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  const quiet = { log() {}, info() {}, debug() {}, warn() {}, error() {}, trace() {}, group() {}, groupEnd() {}, time() {}, timeEnd() {} };
  const g = {
    document: doc, console: quiet,
    navigator: { userAgent: "well-check", platform: "", language: "en-GB", languages: ["en-GB"], maxTouchPoints: 0, vibrate: () => false, onLine: true },
    location: { href: "http://localhost/well/", origin: "http://localhost", protocol: "http:", host: "localhost", hostname: "localhost", pathname: "/well/", search: "", hash: "", reload() {} },
    history: { replaceState() {}, pushState() {}, back() {} },
    localStorage: store(), sessionStorage: store(),
    matchMedia: media, getComputedStyle: () => style(),
    requestAnimationFrame: () => ++ids, cancelAnimationFrame() {},
    setTimeout: () => ++ids, clearTimeout() {}, setInterval: () => ++ids, clearInterval() {},
    requestIdleCallback: () => ++ids, cancelIdleCallback() {}, queueMicrotask() {},
    devicePixelRatio: 2, innerWidth: 390, innerHeight: 844, screen: { width: 390, height: 844 },
    performance: { now: () => 0, mark() {}, measure() {} },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    ResizeObserver: noop, MutationObserver: noop, IntersectionObserver: noop,
    Image: function () { return new PElement(doc, "img"); },
    CSS: { supports: () => false, escape: (s) => String(s) },
    HTMLElement: PElement, Element: PElement, Node: PElement, HTMLCanvasElement: PElement,
    Event: class { constructor(t) { this.type = t; } preventDefault() {} stopPropagation() {} },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    URL, URLSearchParams, TextEncoder, TextDecoder
  };
  g.window = g.self = g.globalThis = g.top = g.parent = g;
  vm.createContext(g);
  return { g, doc, PText };
}

guarded("® where the name is used", () => {
  if (!has("learn.js")) { ok("learn.js is here to read", false); return; }
  /* load the room the way the page does, in order, up to the explainer;
     anything that cannot load without a real browser is simply left out,
     and the explainer either renders without it or says why it can't */
  const { g, doc } = pretendWorld();
  const skipped = [];
  for (const f of SCRIPTS.slice(0, SCRIPTS.indexOf("learn.js"))) {
    if (!has(f)) { skipped.push(f + " (missing)"); continue; }
    try { vm.runInContext(read(f), g, { filename: f, timeout: 5000 }); }
    catch (e) { skipped.push(f + " (" + short(String(e.message || e), 50) + ")"); }
  }
  vm.runInContext(read("learn.js"), g, { filename: "learn.js", timeout: 5000 });
  const Learn = g.Learn;
  ok("learn.js defines Learn in a browser-shaped world", !!Learn);
  if (!Learn) return;
  if (skipped.length) note("loaded without: " + skipped.join(", "));
  try { if (g.Prefs && typeof g.Prefs.load === "function") g.Prefs.load(); } catch (e) { /* defaults will do */ }
  const ctx = { device: "keys", prefs: g.Prefs || { get: () => undefined, all: () => ({}), on() {}, set() {} } };
  const sections = Array.isArray(Learn.sections) ? Learn.sections : [];
  ok("Learn.sections lists the explainer's sheets", sections.length > 0,
     "found " + JSON.stringify(sections.map((s) => s && s.id)));
  let rendered = 0;
  for (const s of sections) {
    const el = doc.createElement("div");
    doc.body.appendChild(el);
    g.__el = el; g.__id = s.id; g.__ctx = ctx;
    try {
      vm.runInContext("Learn.render(__el, __id, __ctx)", g, { timeout: 3000 });
      rendered++;
      sheetVerdict("the “" + (s.title || s.id) + "” sheet",
                   [s.title || "", s.lead || "", el.textContent].join("\n"));
      if (s.id === "steady") {
        const flat = el.textContent.replace(/\s+/g, " ");
        ok("the research sheet ends with the not-a-treatment footer",
           /The Well is not Tetris, is not a treatment, and makes no health claims/.test(flat));
      }
    } catch (e) {
      ok("the “" + s.id + "” sheet renders outside a browser", false, short(String(e.message || e), 90));
    }
  }
  if (sections.length && !rendered) {
    /* nothing rendered: the weaker check, in source order, is better than none */
    const strings = lexJs(read("learn.js")).strings.map((s) => s.value).join(" ");
    sheetVerdict("learn.js's prose, read in source order", strings);
  }
  const about = Learn.ABOUT;
  const aboutText = htmlText(typeof about === "string" ? about : JSON.stringify(about || ""));
  sheetVerdict("the in-game credits (Learn.ABOUT)", aboutText);
  ok("the credits say what the room is, word for word",
     aboutText.indexOf("The Well is an independent falling-blocks game.") >= 0 &&
     aboutText.indexOf("Not affiliated with or endorsed by The Tetris Company.") >= 0 &&
     /Tetris® is a registered trademark of Tetris Holding, LLC\./.test(aboutText.replace(/\s+/g, " ")));
  if (has("README.md")) sheetVerdict("well/README.md", read("README.md"));
  const legal = path.join(ROOT, "legal", "index.html");
  if (fs.existsSync(legal)) {
    const page = htmlText(fs.readFileSync(legal, "utf8"));
    sheetVerdict("the legal page", page);
    ok("the legal page says the well is not affiliated, and has not been tested in any study",
       /The Well is an independent, non-commercial falling-blocks game/.test(page.replace(/\s+/g, " ")) &&
       /has not been tested in any study/.test(page.replace(/\s+/g, " ")));
  }
});

/* ================================================================
   4. health claims
   ================================================================ */
/* anywhere outside the explainer: the claims, and the single words that
   make them */
const CLAIM_WORDS = /\btherap(y|ies|eutic|eutically|ist|ists)\b|\bcur(e|es|ed|ing)\b|\bheal(s|ed|ing)?\b|\bPTSD\b|reduces\s+PTSD|treats\s+flashbacks|clinically\s+proven|evidence-based\s+treatment|trauma-proof/gi;
/* inside it, which has to be able to say "is not a therapy" and "talking
   therapies", only the affirmative claims */
const CLAIM_PHRASES = /reduces\s+PTSD|treats\s+flashbacks|clinically\s+proven|evidence-based\s+treatment|trauma-proof|Tetris\s*®?\s+for\s+PTSD|Oxford\s+Tetris\s*®?\s+therapy|heals\s+trauma/gi;
/* and the word "trauma" belongs to the explainer alone: the room's own
   words never name what anybody might be carrying */
const TRAUMA = /\btrauma/gi;

guarded("no health claims", () => {
  if (!present) { ok("there is a room to read", false); return; }
  const files = shipped().filter((f) => TEXT.test(f) && !houseCopy(f));
  let clean = 0;
  for (const f of files) {
    const text = read(f);
    const found = hits(text, f === "learn.js" ? CLAIM_PHRASES : CLAIM_WORDS);
    if (found.length) ok(f + " makes no health claim", false, describe(found));
    else clean++;
  }
  if (clean === files.length) {
    ok("no health claim in any of the room's " + files.length +
       " files, and none of the affirmative ones in the explainer", true);
  }
  for (const page of SITE_PAGES) {
    if (!fs.existsSync(path.join(ROOT, page))) continue;
    const found = hits(fs.readFileSync(path.join(ROOT, page), "utf8"), CLAIM_WORDS);
    ok(page + " makes no health claim either", found.length === 0, describe(found));
  }
  /* "trauma" in anything the room shows outside the explainer */
  const shown = [];
  if (has("index.html")) for (const p of htmlUiStrings(read("index.html"))) shown.push({ f: "index.html", v: p.value });
  for (const f of SCRIPTS.filter((s) => s !== "learn.js" && has(s))) {
    for (const s of lexJs(read(f)).strings) shown.push({ f, v: s.value });
  }
  const said = shown.filter((s) => { TRAUMA.lastIndex = 0; return TRAUMA.test(s.v); });
  ok("“trauma” appears in nothing shown outside the explainer", said.length === 0,
     said.slice(0, 3).map((s) => s.f + ": “" + short(s.v.trim(), 50) + "”").join(", "));
});

/* ================================================================
   5. colours
   ================================================================ */
const sLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function rgbOf(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim());
  if (!m) throw new Error("not a #rrggbb colour: " + JSON.stringify(h));
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function hsl(rgb) {
  const mx = Math.max(...rgb), mn = Math.min(...rgb), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const [r, g, b] = rgb;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}
/* WCAG-linearised share of red — "no saturated red" (0.75 is the line) */
function redRatio(rgb) {
  const [r, g, b] = rgb.map(sLin), sum = r + g + b;
  return sum > 0 ? r / sum : 0;
}
/* linear sRGB → CIE XYZ (D65) → CIELAB */
function lab(lin) {
  const [R, G, B] = lin;
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = 0.0193339 * R + 0.1191920 * G + 0.9503041 * B;
  const e = Math.pow(6 / 29, 3), k = 3 * Math.pow(6 / 29, 2);
  const f = (t) => (t > e ? Math.cbrt(t) : t / k + 4 / 29);
  const fx = f(X / 0.95047), fy = f(Y / 1), fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/* Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear RGB
   and clipped to the gamut the screen can show */
const CVD = {
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]
};
function seen(hex, how) {
  let v = rgbOf(hex).map(sLin);
  if (how) {
    const m = CVD[how];
    v = [0, 1, 2].map((r) => Math.max(0, Math.min(1, m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2])));
  }
  return lab(v);
}
/* the smallest ΔE76 between any two of the seven, and which two */
function closest(colors, how) {
  const L = PIECES.map((p) => seen(colors[p], how));
  let best = { d: Infinity, a: "", b: "" };
  for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) {
    const d = Math.hypot(L[i][0] - L[j][0], L[i][1] - L[j][1], L[i][2] - L[j][2]);
    if (d < best.d) best = { d, a: PIECES[i], b: PIECES[j] };
  }
  return best;
}
/* the genre's classic hue for each piece; a colour within 30° of it while
   more than half saturated counts as following the mapping */
const CLASSIC_HUE = { I: 180, O: 60, T: 285, S: 120, Z: 0, J: 240, L: 35 };
function mappingMatches(colors) {
  const out = [];
  for (const p of PIECES) {
    const c = hsl(rgbOf(colors[p]));
    const dh = Math.abs(((c.h - CLASSIC_HUE[p]) % 360 + 540) % 360 - 180);
    if (c.s > 0.5 && dh <= 30) out.push(p);
  }
  return out;
}
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);

function lintPalette(name, colors, strict, extra) {
  const missing = PIECES.filter((p) => !colors || typeof colors[p] !== "string");
  if (missing.length) { ok(name + " has a colour for every piece", false, "missing " + missing.join(" ")); return; }
  const near = mappingMatches(colors);
  ok(name + ": " + near.length + " of 7 near the classic mapping (2 allowed)", near.length <= 2,
     "too close: " + near.join(" "));
  const reds = PIECES.map((p) => ({ p, r: redRatio(rgbOf(colors[p])) })).concat(
    (extra || []).map((e) => ({ p: e.label, r: redRatio(rgbOf(e.hex)) })));
  const worst = reds.reduce((a, b) => (b.r > a.r ? b : a));
  ok(name + ": no saturated red (the reddest, " + worst.p + ", is " + f2(worst.r) + " of 0.75)", worst.r < 0.75);
  const need = strict ? 12 : 8;
  const n = closest(colors, null);
  const cvd = Object.keys(CVD).map((k) => ({ k, c: closest(colors, k) }));
  const low = cvd.filter((x) => x.c.d < need);
  ok(name + ": ΔE " + f1(n.d) + " / " + cvd.map((x) => f1(x.c.d)).join(" / ") +
     " (normal / deuteranopia / protanopia / tritanopia; ≥ 18 / " + need + ")",
     n.d >= 18 && low.length === 0,
     (n.d < 18 ? n.a + " and " + n.b + " are too alike; " : "") +
     low.map((x) => x.c.a + " and " + x.c.b + " merge under " + x.k).join("; "));
}

guarded("colours that stay apart, and stay ours", () => {
  /* The maths is checked before it checks anything. These are the figures
     the Okabe–Ito-derived Colour-safe palette was designed against, and the
     linear red share of Okabe–Ito vermillion itself (0.86 — not the 0.69
     you get by forgetting to linearise); if this implementation can't
     reproduce them, it has no business failing anybody's skin. */
  const REF = { I: "#DE8A4E", O: "#56B4E9", T: "#F0E442", S: "#CC79A7", Z: "#009E73", J: "#B8860B", L: "#0072B2" };
  const got = [closest(REF, null)].concat(Object.keys(CVD).map((k) => closest(REF, k))).map((c) => f1(c.d)).join(" / ");
  const verm = f2(redRatio(rgbOf("#D55E00")));
  const trusted = got === "25.2 / 15.9 / 20.4 / 12.5" && verm === "0.86";
  ok("the colour maths reproduces the reference figures (" + got + "; vermillion " + verm + ")", trusted,
     "expected 25.2 / 15.9 / 20.4 / 12.5 and 0.86");
  if (!trusted) return;

  const Skins = load("skins.js");
  ok("skins.js loads in node", !!(Skins && Skins.list));
  const list = Skins.list || [];
  ok("there are six skins", list.length === 6, "found " + list.length);
  const banned = list.filter((s) => /classic|retro|game\s*boy|\bnes\b/i.test((s.id || "") + " " + (s.name || "")));
  ok("none of them is a Classic, Retro, Game Boy or NES skin", banned.length === 0, banned.map((s) => s.name).join(", "));
  for (const s of list) {
    const name = s.name || s.id;
    const extra = s.silt ? [{ label: "silt", hex: s.silt }] : [];
    if (s.mono) {
      /* one colour for every piece is a choice, not a failure — but then the
         glyphs have to carry what the colours don't */
      const worst = [s.colors && s.colors.I].concat(extra.map((e) => e.hex)).filter(Boolean)
        .reduce((a, h) => Math.max(a, redRatio(rgbOf(h))), 0);
      ok(name + ": one colour for every piece, so its glyphs are on Strong", s.glyphs === "strong",
         "glyphs: " + JSON.stringify(s.glyphs));
      ok(name + ": no saturated red (" + f2(worst) + " of 0.75)", worst < 0.75);
      continue;
    }
    lintPalette(name, s.colors, s.id === "ink", extra);
    if (s.id === "ink") ok("Ink keeps its glyphs on", s.glyphs && s.glyphs !== "off", "glyphs: " + JSON.stringify(s.glyphs));
  }
  ok("the Colour-safe palette is there to lint", !!Skins.SAFE);
  if (Skins.SAFE) lintPalette("Colour-safe", Skins.SAFE, true);
});

/* ================================================================
   6. skies
   ================================================================ */
const relLum = (hex) => { const [r, g, b] = rgbOf(hex).map(sLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
guarded("skies too dark to flash", () => {
  const Worlds = load("worlds.js");
  global.self.Worlds = global.Worlds = Worlds;
  const Sky = load("sky.js");
  ok("sky.js loads in node without a page", !!(Sky && typeof Sky.luma === "function"));
  const list = (Worlds && Worlds.list) || [];
  ok("ten worlds, in the order you go down", list.map((w) => w.id).join(" ") === WORLD_IDS.join(" "),
     "found " + list.map((w) => w.id).join(" "));
  for (const w of list) {
    const L = Sky.luma(w);
    /* and an honesty check on the honesty check: the figure can't be lower
       than the world's own declared sky colours, or it is measuring
       something other than the sky */
    const floor = Math.max(relLum(w.sky.top), relLum(w.sky.horizon));
    ok((w.name || w.id) + ": " + (typeof L === "number" ? L.toFixed(3) : String(L)) + " (≤ 0.05)",
       typeof L === "number" && isFinite(L) && L <= 0.05 && L >= floor - 1e-4,
       L < floor - 1e-4 ? "lower than its own sky colours (" + floor.toFixed(3) + ")" : "too bright to cross-fade safely");
  }
});

/* ================================================================
   7. help lines
   ================================================================ */
guarded("help lines checked within the year", () => {
  const Learn = load("learn.js");
  const H = Learn && Learn.HELP;
  ok("learn.js loads in node and has its help lines", !!(H && Array.isArray(H.lines)));
  if (!H) return;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(H.verified || ""));
  ok("the list says when it was checked", !!m, "verified: " + JSON.stringify(H.verified));
  if (m) {
    const when = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const due = new Date(Date.UTC(+m[1], +m[2] - 1 + 12, +m[3] + 1));   /* the whole of that day */
    const soon = new Date(Date.UTC(+m[1], +m[2] - 1 + 6, +m[3]));
    const days = Math.floor((TODAY - when) / 86400000);
    ok("checked " + H.verified + ", " + days + " day" + (days === 1 ? "" : "s") + " ago (12 months allowed)",
       TODAY < due && days >= 0,
       days < 0 ? "that date is in the future" : "re-check every number and update `verified`");
    if (TODAY > soon && TODAY < due) note("over six months old — a good time to re-check it");
  }
  const items = [];
  for (const r of H.lines) for (const it of (r.items || [])) items.push(Object.assign({ region: r.region }, it));
  const all = JSON.stringify(H.lines);
  ok("988 is on it, and the Samaritans' 116 123, and findahelpline.com",
     /\b988\b/.test(all) && /116\s?123/.test(all) && /findahelpline\.com/i.test(all));
  ok("988's “press 3” option is not listed (it ended on 17 July 2025)", !/press\s*3\b/i.test(all));
  const bad = items.filter((it) => (it.tel && !/^\+?[0-9]+$/.test(String(it.tel))) ||
                                   (it.sms && !/^\+?[0-9]+$/.test(String(it.sms))) ||
                                   (it.url && !/^https:\/\//.test(String(it.url))) ||
                                   !it.label || !(it.tel || it.sms || it.url));
  ok("every line has a label and a working link (digits-only tel:/sms:, https:// pages)", bad.length === 0,
     bad.slice(0, 3).map((it) => JSON.stringify(it.label || it)).join(", "));
});

/* ================================================================
   8. the offline shell, the page, the manifest
   ================================================================ */
guarded("an offline shell that lists the page", () => {
  for (const f of ["index.html", "sw.js"]) if (!has(f)) throw new Error(f + " is not here yet");
  const html = read("index.html");
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1].replace(/^\.\//, ""));
  const order = SCRIPTS.map((s) => scripts.indexOf(s));
  ok("index.html loads all " + SCRIPTS.length + " scripts, in the contract's order",
     order.every((v) => v >= 0) && order.every((v, k) => k === 0 || v > order[k - 1]),
     "loads: " + scripts.join(" "));
  const sw = read("sw.js");
  const listed = new Set(lexJs(sw).strings.map((s) => s.value.replace(/^\.\//, "")));
  const css = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  const need = scripts.concat(css, ["index.html", "manifest.webmanifest",
    "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"]);
  const absent = need.filter((f) => !listed.has(f.replace(/^\.\//, "")));
  ok("sw.js caches every script, the stylesheet, the manifest and the icons", absent.length === 0,
     "not in the shell: " + absent.join(", "));
  const v = (sw.match(/VERSION\s*=\s*["']([^"']+)["']/) || [])[1] || "";
  ok("its cache is named for the room (" + (v || "no VERSION") + ")", /^well-/.test(v));
  const title = ((html.match(/<title>([^<]*)<\/title>/) || [])[1] || "").trim();
  ok("the page is called “The Well — a falling-blocks game”", decodeEntities(title) === "The Well — a falling-blocks game",
     "title: " + JSON.stringify(title));
  if (has("look.css")) {
    const theirs = path.join(ROOT, "breaker", "look.css");
    ok("look.css is the house style, byte for byte", fs.existsSync(theirs) &&
       fs.readFileSync(here("look.css")).equals(fs.readFileSync(theirs)));
  }
  if (has("manifest.webmanifest")) {
    const man = JSON.parse(read("manifest.webmanifest"));
    ok("the manifest calls it The Well, long and short", man.name === "The Well" && man.short_name === "The Well",
       JSON.stringify({ name: man.name, short_name: man.short_name }));
    const lost = (man.icons || []).filter((i) => !has(String(i.src).replace(/^\.\//, "")));
    ok("every icon the manifest names exists", (man.icons || []).length > 0 && lost.length === 0,
       lost.map((i) => i.src).join(", ") || "no icons listed");
  }
});

console.log("");
if (fails) { console.log("FAILED: " + fails + " problem" + (fails === 1 ? "" : "s")); process.exit(1); }
console.log("the well keeps its promises");
