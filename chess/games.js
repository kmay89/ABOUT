/* games.js — the journal: every game you finish, kept.

   Until now a game ended and was gone. The rating remembered that you
   had won and by how much, but not the game itself: not the moves, not
   the move where it turned, not the friend across the table you beat
   on Tuesday. A record of your own games is the first thing a club
   player keeps and the most basic thing every chess site gives away,
   and without it nothing else the room says about you — a feat, a best,
   a pattern — can point at the game it came from.

   So every finished game is written here once, at the end: against a
   coach, two players on one screen, a friend on another phone. Its
   moves, the coach's marks and reviews, the opening it was, the
   accuracy once the look-back has measured it. The last fifty stay;
   the oldest goes when a fifty-first arrives. Nothing here is scored —
   it is a shelf. Games with people are kept exactly as games with the
   coach are, because they are play; they still never touch the number.

   And the way out is the open one. A game copies out as PGN, the plain
   text every chess program reads, so a player can take it to a club
   coach, to lichess's analysis board, or to a notebook. Nothing locked
   in.

   Like rating.js this is pure: no DOM, no storage of its own. The page
   hands it a getItem/setItem pair; node hands it nothing and checks it
   (chess/tools/games-check.js). Everything read back from storage is
   rebuilt field by field, because a stored game is a promise someone
   else may have edited. */
/* global module, require */
(function (root) {
"use strict";

var VERSION = 1, KEY = "chessroom_games", MAX = 50;
var MODES = ["coach", "pass", "lan"];
var RESULTS = ["white", "black", "draw"];
var MARKS = ["!!", "!", "?!", "?", "??"];
var MAX_PLIES = 600;
/* the characters a SAN move can be made of — anything else is not a move */
var SAN_RE = /^[KQRBNa-hx1-8O=+#-]{2,11}$/;
var ID_RE = /^g[0-9a-z]{6,16}$/;

/* ---------- small, careful helpers ---------- */
function int(v, lo, hi, dflt) {
  if (typeof v !== "number" || v !== v || !isFinite(v)) return dflt;
  v = Math.round(v);
  return v < lo ? lo : v > hi ? hi : v;
}
/* plain text for a label: no markup can ride in on a name. Quotes and
   apostrophes stay ("Bishop's Opening" is a name), because everything
   here is escaped wherever it is shown, and PGN escapes its own. */
function plain(s, max) {
  if (typeof s !== "string") return null;
  s = s.replace(/[<>`\\\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  return s.length ? s : null;
}
/* FNV-1a, 32-bit: enough to tell two games apart that ended on the same millisecond */
function fnv(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
function makeId(at, sans) {
  return "g" + Math.max(0, Math.floor(at)).toString(36) + fnv((sans || []).join(" ")).toString(36);
}

/* ---------- one entry ----------
   The shape is shared: the help room's debrief writes the same store,
   so whichever lands first, the other finds its fields here.
   { id, at, mode, skill, humanSide, result, reason, sans, rv, marks,
     acc, perf, eco, opp, plies, clockStr, assist, clean, practice,
     daily, low, feats } */
function cleanEntry(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  if (MODES.indexOf(e.mode) < 0 || RESULTS.indexOf(e.result) < 0) return null;
  if (typeof e.at !== "number" || !isFinite(e.at) || e.at < 0) return null;
  /* a game without its moves is not a game: the whole entry goes */
  if (!Array.isArray(e.sans) || e.sans.length > MAX_PLIES ||
      !e.sans.every(function (s) { return typeof s === "string" && SAN_RE.test(s); })) return null;
  var sans = e.sans.slice();
  var out = {
    id: typeof e.id === "string" && ID_RE.test(e.id) ? e.id : makeId(e.at, sans),
    at: e.at,
    mode: e.mode,
    skill: e.mode === "coach" && typeof e.skill === "string" && /^[a-z]{2,12}$/.test(e.skill) ? e.skill : null,
    humanSide: e.humanSide === 1 || e.humanSide === -1 ? e.humanSide : 0,
    result: e.result,
    reason: plain(e.reason, 60) || "",
    sans: sans,
    rv: [],
    marks: {},
    acc: typeof e.acc === "number" && isFinite(e.acc) ? Math.round(Math.max(0, Math.min(100, e.acc)) * 10) / 10 : null,
    perf: typeof e.perf === "number" && isFinite(e.perf) ? int(e.perf, 0, 3500, null) : null,
    eco: null,
    opp: e.mode === "lan" ? plain(e.opp, 18) : null,
    plies: sans.length,
    clockStr: e.clockStr === "none" || /^\d{1,3}\+\d{1,3}$/.test(String(e.clockStr)) ? String(e.clockStr) : "none",
    assist: [0, 0],
    clean: e.clean ? 1 : 0,
    practice: e.practice ? 1 : 0,
    daily: typeof e.daily === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.daily) ? e.daily : null,
    low: typeof e.low === "number" && isFinite(e.low) ? int(e.low, -3000, 3000, null) : null,
    feats: []
  };
  /* a coach game is the only kind with a "you" chosen by the room; a
     game between two people on one screen has none */
  if (out.mode === "pass") out.humanSide = 0;
  if (Array.isArray(e.rv)) {
    e.rv.slice(0, MAX_PLIES).forEach(function (t) {
      if (!Array.isArray(t) || t.length < 3) return;
      if (!(typeof t[0] === "number" && isFinite(t[0]) && typeof t[1] === "number" && isFinite(t[1]) &&
            typeof t[2] === "number" && isFinite(t[2]))) return;
      var ply = Math.round(t[0]);
      if (ply < 0 || ply >= sans.length) return;
      var row = [ply, Math.round(t[1]), Math.round(t[2])];
      /* anything after the three numbers belongs to whoever wrote it
         (the best move's name, a line, a refutation) — kept, but only as
         short plain strings */
      for (var i = 3; i < Math.min(t.length, 8); i++) {
        row.push(typeof t[i] === "string" ? t[i].replace(/[<>&"'`\\]/g, "").slice(0, 40) : null);
      }
      out.rv.push(row);
    });
  }
  if (e.marks && typeof e.marks === "object" && !Array.isArray(e.marks)) {
    Object.keys(e.marks).forEach(function (k) {
      var ply = +k;
      if (ply === Math.floor(ply) && ply >= 0 && ply < sans.length && MARKS.indexOf(e.marks[k]) >= 0) out.marks[ply] = e.marks[k];
    });
  }
  if (e.eco && typeof e.eco === "object") {
    var nm = plain(e.eco.name, 80);
    if (nm) out.eco = { name: nm, code: typeof e.eco.code === "string" && /^[A-E]\d\d$/.test(e.eco.code) ? e.eco.code : "" };
  }
  if (Array.isArray(e.assist)) out.assist = [int(e.assist[0], 0, 1000, 0), int(e.assist[1], 0, 1000, 0)];
  if (Array.isArray(e.feats)) {
    e.feats.forEach(function (f) {
      if (typeof f === "string" && /^[a-z][a-z0-9-]{1,30}$/.test(f) && out.feats.indexOf(f) < 0 && out.feats.length < 40) out.feats.push(f);
    });
  }
  return out;
}

/* ---------- the store ---------- */
function fresh() { return { v: VERSION, list: [] }; }
function clean(o) {
  var s = fresh();
  if (!o || typeof o !== "object" || o.v !== VERSION || !Array.isArray(o.list)) return s;
  var seen = {};
  o.list.forEach(function (e) {
    var c = cleanEntry(e);
    if (!c || seen[c.id]) return;
    seen[c.id] = 1;
    s.list.push(c);
  });
  s.list.sort(function (a, b) { return a.at - b.at; });
  if (s.list.length > MAX) s.list = s.list.slice(-MAX);
  return s;
}
function load(getItem) {
  var raw = null;
  try { raw = getItem(KEY); } catch (e) { return fresh(); }
  /* fifty long games with their reviews are a few hundred kilobytes at
     most; anything far bigger was not written by the room */
  if (typeof raw !== "string" || raw.length > 2000000) return fresh();
  try { return clean(JSON.parse(raw)); } catch (e) { return fresh(); }
}
function save(state, setItem) {
  try { return setItem(KEY, JSON.stringify(clean(state))) !== false; } catch (e) { return false; }
}
/* add one finished game: the newest fifty stay, and the same game
   written twice (two tabs, a double tap) is kept once */
function add(state, entry) {
  var s = clean(state), c = cleanEntry(entry);
  if (!c) return { state: s, id: null };
  s.list = s.list.filter(function (e) { return e.id !== c.id; });
  s.list.push(c);
  s.list.sort(function (a, b) { return a.at - b.at; });
  if (s.list.length > MAX) s.list = s.list.slice(-MAX);
  return { state: s, id: c.id };
}
/* what is learned about a game after it is written: its accuracy (the
   look-back finishes after the card is up) and its feats */
function annotate(state, id, patch) {
  var s = clean(state);
  for (var i = 0; i < s.list.length; i++) {
    if (s.list[i].id !== id) continue;
    var e = s.list[i], p = patch || {};
    if ("acc" in p) e.acc = p.acc;
    if ("perf" in p) e.perf = p.perf;
    if (Array.isArray(p.feats)) e.feats = e.feats.concat(p.feats);
    s.list[i] = cleanEntry(e) || s.list[i];
  }
  return s;
}
function get(state, id) {
  var list = state && Array.isArray(state.list) ? state.list : [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

/* ---------- naming the opening ----------
   The same choice the opening card makes: the deepest name the ECO
   table knows, unless the room's own book story goes as deep. */
function openingOf(sans, Eco, Book) {
  Eco = Eco || root.Eco; Book = Book || root.Book;
  var s = (sans || []).slice(0, 36).map(function (x) { return String(x).replace(/[+#]$/, ""); });
  if (!s.length) return null;
  var entry = Book && Book.match ? Book.match(s) : null;
  var eco = Eco && Eco.match ? Eco.match(s) : null;
  if (eco && (!entry || eco.seq.split(" ").length >= entry.seq.split(" ").length)) return { name: eco.name, code: eco.eco };
  if (entry) return { name: entry.name, code: "" };
  return null;
}

/* ---------- reading an entry back ---------- */
/* the score from your chair: "won", "lost", "drew" — or, for two people
   on one screen, the plain score */
function outcome(e) {
  if (e.result === "draw") return e.humanSide ? "drew" : "½–½";
  if (!e.humanSide) return e.result === "white" ? "1–0" : "0–1";
  return (e.result === "white") === (e.humanSide === 1) ? "won" : "lost";
}
var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDay(ms) { var d = new Date(ms); return d.getDate() + " " + MON[d.getMonth()]; }
function movesOf(plies) { var n = Math.ceil(plies / 2); return n + (n === 1 ? " move" : " moves"); }
/* who sat where, in words: { white, black, who, them, icon } — `who`
   is the other chair's plain name, `them` the same with the coach's
   emoji; `levels` is Rating.LEVELS, `me` the name the room calls you */
function names(e, levels, me) {
  me = me || "You";
  var who = "Two players", icon = "🤝";
  if (e.mode === "coach") {
    var L = null;
    (levels || []).forEach(function (x) { if (x.id === e.skill) L = x; });
    who = L ? L.name : "The coach"; icon = L ? L.emoji : "♟";
  } else if (e.mode === "lan") { who = e.opp || "A friend"; icon = "📡"; }
  var them = e.mode === "coach" ? icon + " " + who : who;
  if (!e.humanSide) return { white: "White", black: "Black", who: who, them: them, icon: icon };
  return e.humanSide === 1 ? { white: me, black: who, who: who, them: them, icon: icon }
                           : { white: who, black: me, who: who, them: them, icon: icon };
}
/* the line under a row in the journal */
function summaryLine(e) {
  var bits = [fmtDay(e.at)];
  if (e.eco) bits.push(e.eco.name.split(":")[0]);
  bits.push(movesOf(e.plies));
  if (e.acc != null) bits.push(Math.round(e.acc) + "%");
  return bits.join(" · ");
}

/* ---------- PGN ----------
   The seven-tag roster first, then what the room knows; the coach's
   marks ride on the moves as the suffixes every reader understands. */
function pgnEsc(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function pad2(n) { return ("0" + n).slice(-2); }
var TERMINATION = [
  [/checkmate/i, "checkmate"], [/resign/i, "resignation"], [/out of time|\btime\b|flag/i, "time forfeit"],
  [/stalemate/i, "stalemate"], [/agreed/i, "agreement"], [/repeat|repetition|same position/i, "repetition"],
  [/fifty|seventy/i, "move rule"], [/enough|insufficient/i, "insufficient material"]
];
function pgn(e, levels, me) {
  var d = new Date(e.at), n = names(e, levels, me);
  var res = e.result === "white" ? "1-0" : e.result === "black" ? "0-1" : "1/2-1/2";
  var tags = [
    ["Event", e.mode === "coach" ? "The Chess Room, against the coach" : e.mode === "lan" ? "The Chess Room, nearby" : "The Chess Room, one board"],
    ["Site", "kmay89.com/chess"],
    ["Date", d.getFullYear() + "." + pad2(d.getMonth() + 1) + "." + pad2(d.getDate())],
    ["Round", "-"], ["White", n.white], ["Black", n.black], ["Result", res]
  ];
  if (e.mode === "coach") {
    var L = null;
    (levels || []).forEach(function (x) { if (x.id === e.skill) L = x; });
    if (L) tags.push([e.humanSide === 1 ? "BlackElo" : "WhiteElo", String(L.elo)]);
  }
  if (e.eco) { if (e.eco.code) tags.push(["ECO", e.eco.code]); tags.push(["Opening", e.eco.name]); }
  if (e.clockStr !== "none") {
    var c = e.clockStr.split("+");
    tags.push(["TimeControl", (+c[0] * 60) + "+" + (+c[1])]);
  }
  var term = "normal";
  TERMINATION.forEach(function (t) { if (term === "normal" && t[0].test(e.reason)) term = t[1]; });
  tags.push(["Termination", term]);
  tags.push(["Annotator", "The Chess Room"]);
  var head = tags.map(function (t) { return "[" + t[0] + ' "' + pgnEsc(t[1]) + '"]'; }).join("\n");
  /* the movetext, wrapped at 79 columns the way the standard asks */
  var toks = [];
  e.sans.forEach(function (s, i) {
    if (i % 2 === 0) toks.push((i / 2 + 1) + ".");
    toks.push(s + (e.marks[i] || ""));
  });
  toks.push(res);
  var lines = [], cur = "";
  toks.forEach(function (t) {
    if (cur && cur.length + 1 + t.length > 79) { lines.push(cur); cur = t; }
    else cur = cur ? cur + " " + t : t;
  });
  if (cur) lines.push(cur);
  return head + "\n\n" + lines.join("\n") + "\n";
}
function pgnAll(state, levels, me) {
  var list = state && Array.isArray(state.list) ? state.list : [];
  return list.map(function (e) { return pgn(e, levels, me); }).join("\n");
}

var Games = {
  VERSION: VERSION, KEY: KEY, MAX: MAX, MARKS: MARKS,
  fresh: fresh, clean: clean, cleanEntry: cleanEntry, load: load, save: save,
  add: add, annotate: annotate, get: get, makeId: makeId,
  openingOf: openingOf, outcome: outcome, names: names, summaryLine: summaryLine, fmtDay: fmtDay,
  pgn: pgn, pgnAll: pgnAll
};

if (typeof module !== "undefined" && module.exports) module.exports = Games;
else root.Games = Games;
})(typeof self !== "undefined" ? self : this);
