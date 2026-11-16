/* friends.js — your people: everyone you have sat across from.

   Two friends who play each other want to know one thing above all
   others, and it is not a rating: it is who leads. "Sam's 3–2 up on me"
   is the oldest reason there is to set the pieces up again. So this
   phone remembers every person it has played on another device — their
   name as they typed it, the score between you, when you last played,
   and the last few games themselves, so any one of them can be stepped
   through again or sent on.

   A friend here is not an account and there is no friend request. A
   friend is someone you played. Each room mints one quiet random id the
   first time it is needed ("f" and ten letters and digits) and says it
   to the other board in the same greeting that already carries your
   name, so two people both called Sam stay two people, and a Sam who
   renames herself is still Sam. The id never goes to the mailbox — only
   across the direct link and nowhere else — and the list never leaves
   this phone. Clearing the room's data (the recovery card's fresh start)
   forgets it, and so does the "Forget" on a person's row.

   Nothing here ranks anybody. The list is in the order you last played,
   and the only numbers in it are games that actually happened between
   the two of you. A board on the other side too old to send an id is
   still remembered, by name, and is matched by name only against other
   rows that never had an id either — never merged into someone who did.

   Pure, in the rating.js pattern: load(getItem) / save(state, setItem),
   and a clean() that rebuilds every field from scratch, so a hand-edited
   or half-written store can never put anything strange on the screen.
   Tested by chess/tools/friends-check.js. */
(function (root) {
"use strict";

var KEY = "chessroom_friends";
var VERSION = 1;
var MAX_FRIENDS = 40;          /* least recently played drop off the end */
var MAX_GAMES = 12;            /* games kept per person, newest first   */
var MAX_PLIES = 600;
var NAME_MAX = 18;
var ID_RE = /^f[0-9a-z]{10}$/;
var GID_RE = /^[0-9a-z]{4,20}$/;
var RESULTS = ["w", "d", "l"];

function num(x, dflt, lo, hi) {
  if (typeof x !== "number" || x !== x || !isFinite(x)) return dflt;
  return x < lo ? lo : (x > hi ? hi : x);
}
function name(x) {
  if (typeof x !== "string") return "";
  return x.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}
function time(x) { return typeof x === "number" && isFinite(x) && x > 0 && x < 1e14 ? Math.floor(x) : 0; }

/* an id nobody chose: random where the browser can say so, which is
   everywhere this room runs */
function mintId(rand) {
  var a = "abcdefghijklmnopqrstuvwxyz0123456789", out = "f", bytes = null;
  if (!rand) {
    try {
      var c = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto : null;
      if (c) { bytes = new Uint8Array(10); c.getRandomValues(bytes); }
    } catch (e) { bytes = null; }
  }
  for (var i = 0; i < 10; i++) {
    var r = bytes ? bytes[i] / 256 : (rand || Math.random)();
    out += a.charAt(Math.floor(r * 36) % 36);
  }
  return out;
}
function isId(x) { return typeof x === "string" && ID_RE.test(x); }

function fresh() { return { v: VERSION, me: "", list: [] }; }

function cleanGame(g) {
  if (!g || typeof g !== "object" || Array.isArray(g)) return null;
  if (RESULTS.indexOf(g.r) < 0) return null;
  var out = {
    g: typeof g.g === "string" && GID_RE.test(g.g) ? g.g : "",
    at: time(g.at),
    r: g.r,
    side: g.side === -1 ? -1 : 1,
    y: typeof g.y === "string" ? g.y.replace(/[<>]/g, "").slice(0, 60) : "",
    s: []
  };
  if (Array.isArray(g.s) && g.s.length <= MAX_PLIES) {
    for (var i = 0; i < g.s.length; i++) {
      if (typeof g.s[i] !== "string" || !g.s[i].length || g.s[i].length > 11) { out.s = []; break; }
      out.s.push(g.s[i]);
    }
  }
  return out;
}
function cleanFriend(f) {
  if (!f || typeof f !== "object" || Array.isArray(f)) return null;
  var id = isId(f.id) ? f.id : "";
  var n = name(f.name);
  if (!id && !n) return null;                   /* nobody to remember */
  var out = {
    id: id, name: n || "A friend",
    w: Math.floor(num(f.w, 0, 0, 1e6)), d: Math.floor(num(f.d, 0, 0, 1e6)), l: Math.floor(num(f.l, 0, 0, 1e6)),
    first: time(f.first), last: time(f.last), games: []
  };
  if (Array.isArray(f.games)) {
    for (var i = 0; i < f.games.length && out.games.length < MAX_GAMES; i++) {
      var g = cleanGame(f.games[i]);
      if (g) out.games.push(g);
    }
  }
  return out;
}
function clean(o) {
  var s = fresh();
  if (!o || typeof o !== "object" || Array.isArray(o)) return s;
  s.me = isId(o.me) ? o.me : "";
  if (Array.isArray(o.list)) {
    var seen = {};
    for (var i = 0; i < o.list.length; i++) {
      var f = cleanFriend(o.list[i]);
      if (!f) continue;
      var k = f.id || "n:" + f.name.toLowerCase();
      if (seen[k]) continue;                     /* one row per person */
      seen[k] = true;
      s.list.push(f);
    }
    s.list.sort(function (a, b) { return b.last - a.last; });
    s.list = s.list.slice(0, MAX_FRIENDS);
  }
  return s;
}
function load(getItem) {
  var raw = null;
  try { raw = getItem(KEY); } catch (e) { return fresh(); }
  if (typeof raw !== "string" || raw.length > 2000000) return fresh();
  try { return clean(JSON.parse(raw)); } catch (e) { return fresh(); }
}
function save(state, setItem) {
  try { return setItem(KEY, JSON.stringify(clean(state))) !== false; } catch (e) { return false; }
}

/* this room's own id, minted the first time anybody asks */
function me(state, rand) {
  var s = clean(state);
  if (!s.me) s.me = mintId(rand);
  return s;
}

/* id first; a name only finds a row that never had an id — so an old
   board's "Sam" can never be folded into the Sam whose room says who
   she is */
function indexOf(state, id, nm) {
  var list = state.list || [], i;
  if (isId(id)) {
    for (i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }
  var n = name(nm).toLowerCase();
  if (!n) return -1;
  for (i = 0; i < list.length; i++) if (!list[i].id && list[i].name.toLowerCase() === n) return i;
  return -1;
}
function find(state, id, nm) {
  var i = indexOf(state, id, nm);
  return i < 0 ? null : state.list[i];
}

/* A game with a person is over. `g`: { id, name, result: "w"|"d"|"l"
   (mine), at, side, sans, reason, gid }. The same gid recorded twice
   (a game taken back after it ended, and finished differently) replaces
   its own result instead of counting twice. Returns { state, f, first,
   decider } — `decider` is true exactly when two games have gone one
   each, which is the only moment "the decider?" is an honest question. */
function record(state, g) {
  var s = clean(state);
  if (!g || RESULTS.indexOf(g.result) < 0) return { state: s, f: null, first: false, decider: false };
  var at = time(g.at) || Date.now();
  var i = indexOf(s, g.id, g.name), f, first = false;
  if (i < 0) {
    f = cleanFriend({ id: g.id, name: g.name, first: at });
    if (!f) return { state: s, f: null, first: false, decider: false };
    s.list.unshift(f);
    first = true;
  } else {
    f = s.list.splice(i, 1)[0];
    s.list.unshift(f);
    var nn = name(g.name);
    if (nn) f.name = nn;                        /* a new name, the same person */
  }
  var gid = typeof g.gid === "string" && GID_RE.test(g.gid) ? g.gid : "";
  var prev = -1;
  if (gid) for (var k = 0; k < f.games.length; k++) if (f.games[k].g === gid) { prev = k; break; }
  if (prev >= 0) {
    var old = f.games.splice(prev, 1)[0];
    f[old.r] = Math.max(0, f[old.r] - 1);
  }
  f[g.result]++;
  f.last = at;
  if (!f.first) f.first = at;
  var row = cleanGame({ g: gid, at: at, r: g.result, side: g.side, y: g.reason, s: g.sans });
  if (row) { f.games.unshift(row); f.games = f.games.slice(0, MAX_GAMES); }
  s.list = s.list.slice(0, MAX_FRIENDS);
  return { state: s, f: f, first: first, decider: f.w === 1 && f.l === 1 && f.d === 0 };
}

/* a person who arrived with a new name, before any game is recorded */
function rename(state, id, nm) {
  var s = clean(state), i = indexOf(s, id, null), nn = name(nm);
  if (i >= 0 && nn) s.list[i].name = nn;
  return s;
}
function forget(state, id, nm) {
  var s = clean(state), i = indexOf(s, id, nm);
  if (i >= 0) s.list.splice(i, 1);
  return s;
}

/* "You lead 3–2" · "Sam leads 2–1" · "Level, 2–2" — wins first, draws
   said only when there are some, because "3–2 with 1 drawn" is how
   people actually say it */
function dash(a, b) { return a + "–" + b; }
function tally(f) {
  if (!f) return { lead: "none", text: "", games: 0 };
  var n = f.w + f.d + f.l;
  if (!n) return { lead: "none", text: "", games: 0 };
  var draws = f.d ? " (" + f.d + " drawn)" : "";
  if (f.w > f.l) return { lead: "you", text: "You lead " + dash(f.w, f.l) + draws, games: n };
  if (f.l > f.w) return { lead: "them", text: f.name + " leads " + dash(f.l, f.w) + draws, games: n };
  return { lead: "level", text: (f.w ? "Level, " + dash(f.w, f.l) : "All square") + draws, games: n };
}
/* the last few results from your side, newest last, as people write them */
function recent(f, n) {
  if (!f) return "";
  return f.games.slice(0, n || 5).map(function (g) { return g.r.toUpperCase(); }).reverse().join(" ");
}
/* the people, most recently played first — the only honest order */
function table(state) {
  return clean(state).list.map(function (f) {
    return { id: f.id, name: f.name, w: f.w, d: f.d, l: f.l, games: f.w + f.d + f.l,
             last: f.last, first: f.first, tally: tally(f), recent: recent(f, 5) };
  });
}

/* A friend has a board open right now. The mailbox's public list of
   waiting boards is something anyone on the site can already see; this
   only notices a name on it that is already one of yours, or a board
   somebody opened "For" you. Started boards are never offered. */
function hosting(state, rooms, myName) {
  if (!Array.isArray(rooms)) return null;
  /* the mailbox keeps a host's name to sixteen characters and without
     quotes or ampersands, so both sides are compared the way it stores them */
  function key(x) { return name(x).replace(/[&"']/g, "").slice(0, 16).toLowerCase(); }
  var mine = key(myName);
  var names = {};
  (state.list || []).forEach(function (f) { names[key(f.name)] = f.name; });
  for (var i = 0; i < rooms.length; i++) {
    var r = rooms[i];
    if (!r || r.started || typeof r.code !== "string") continue;
    var host = key(r.host);
    var title = typeof r.name === "string" ? r.name.replace(/[&"'<>]/g, "").replace(/\s+/g, " ").trim().toLowerCase() : "";
    if (mine && title.indexOf("for " + mine) === 0) return { code: r.code, name: name(r.host) || "Someone", forYou: true };
    if (host && names[host]) return { code: r.code, name: names[host], forYou: false };
  }
  return null;
}

var Friends = {
  KEY: KEY, VERSION: VERSION, MAX_FRIENDS: MAX_FRIENDS, MAX_GAMES: MAX_GAMES, ID_RE: ID_RE,
  fresh: fresh, clean: clean, load: load, save: save,
  me: me, mintId: mintId, isId: isId,
  find: find, record: record, rename: rename, forget: forget,
  tally: tally, recent: recent, table: table, hosting: hosting
};

if (typeof module !== "undefined" && module.exports) module.exports = Friends;
else root.Friends = Friends;
})(typeof self !== "undefined" ? self : this);
