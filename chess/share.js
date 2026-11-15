/* share.js — a game you can send.

   A chess game is a short list of moves, and a short list of moves fits
   in a link. So a game sent from this room is exactly that: the moves in
   standard notation, the two names, the result and how it ended, packed
   the same way the nearby handshake packs its codes (deflated, then
   base64 that survives a URL — GAME1.…), or plainly where a browser
   cannot deflate (GAME0.…, accepted forever). Tapping the link on any
   phone opens the room with the game on the board, ready to step
   through. Nothing is uploaded anywhere: the link *is* the game, and the
   part after the # never even reaches a server.

   The same link can point at one moment of the game — "look at move 23,
   what would you play?" — by naming a ply, so sending a position is the
   same thing as sending a game, opened at a different page.

   The receiver never trusts a link. Every field is rebuilt here from
   scratch, and the moves must replay legally from the start on the
   receiver's own rules (engine.js): a link whose moves stop making sense
   at move twelve is refused, not half-opened. The annotation — which
   moves were good, which cost something — is deliberately *not* in the
   link. The receiver's own coach reads the game on arrival, at the same
   depth it uses for everyone, so what arrives is a second opinion rather
   than the sender's claim about their own game.

   Pure: no DOM, no storage. The room hands in `Chess` where replaying is
   needed. Tested by chess/tools/share-check.js. */
(function (root) {
"use strict";

var MAX_CODE = 12000;          /* characters of code we will even look at */
var MAX_JSON = 65536;          /* bytes of JSON we will parse once inflated */
var MAX_PLIES = 600;
var NAME_MAX = 18, REASON_MAX = 60, ASK_MAX = 120;
var RESULTS = ["1-0", "0-1", "1/2-1/2", "*"];
var CLOCK_RE = /^(none|\d{1,3}\+\d{1,3})$/;
var ROUTES = { GAME: "game" };
var KIND_RE = /\b(GAME)([01])\.([A-Za-z0-9_-]+)/;

/* ---------- bytes ---------- */
function b64(bytes) {
  var s = "";
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unB64(str) {
  var s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  var b = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}
function canDeflate() {
  return typeof CompressionStream === "function" && typeof Response === "function" && typeof TextEncoder === "function";
}
function plain(json) {
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* obj → Promise<"GAME1.…"> (or GAME0 where deflate is missing) */
function pack(kind, obj) {
  if (!ROUTES[kind]) return Promise.reject(new Error("unknown kind"));
  var json = JSON.stringify(obj);
  if (canDeflate()) {
    try {
      var cs = new CompressionStream("deflate-raw"), w = cs.writable.getWriter();
      w.write(new TextEncoder().encode(json)); w.close();
      return new Response(cs.readable).arrayBuffer().then(function (buf) {
        return kind + "1." + b64(new Uint8Array(buf));
      }, function () { return kind + "0." + plain(json); });
    } catch (e) { /* fall through to plain */ }
  }
  return Promise.resolve(kind + "0." + plain(json));
}

/* text → Promise<{kind, obj} | null>. Takes a bare code, a code with
   whitespace in it (a messenger that wrapped the line), or a whole URL.
   Never throws, never rejects: junk is simply null. */
function unpack(text) {
  var t = String(text == null ? "" : text);
  if (t.length > MAX_CODE * 2) return Promise.resolve(null);
  t = t.replace(/\s+/g, "");
  var m = t.match(KIND_RE);
  if (!m || m[3].length > MAX_CODE) return Promise.resolve(null);
  var kind = m[1], body = m[3];
  function parse(json) {
    if (typeof json !== "string" || json.length > MAX_JSON) return null;
    try {
      var o = JSON.parse(json);
      return o && typeof o === "object" && !Array.isArray(o) ? { kind: kind, obj: o } : null;
    } catch (e) { return null; }
  }
  try {
    if (m[2] === "0") return Promise.resolve(parse(decodeURIComponent(escape(atob(body.replace(/-/g, "+").replace(/_/g, "/"))))));
    if (typeof DecompressionStream !== "function") return Promise.resolve(null);
    var bytes = unB64(body);
    var ds = new DecompressionStream("deflate-raw"), w = ds.writable.getWriter();
    w.write(bytes).catch(function () {});
    w.close().catch(function () {});
    return new Response(ds.readable).arrayBuffer().then(function (buf) {
      if (buf.byteLength > MAX_JSON) return null;
      return parse(new TextDecoder().decode(buf));
    }).catch(function () { return null; });
  } catch (e) { return Promise.resolve(null); }
}

/* where the link points: this very page, with the payload after the #.
   On file:// there is no page anybody else can open, so it is the bare
   code — paste it into any room's address bar after #game= */
function url(code, loc) {
  loc = loc || (typeof location !== "undefined" ? location : null);
  var kind = String(code).split(".")[0].replace(/[01]$/, "");
  var route = ROUTES[kind] || "game";
  if (!loc || (loc.protocol !== "https:" && loc.protocol !== "http:")) return code;
  return loc.origin + loc.pathname + "#" + route + "=" + code;
}

/* ---------- the game payload ---------- */
function str(x, max) {
  if (typeof x !== "string") return "";
  /* nothing that could be read as markup, and nothing invisible: a name
     is drawn escaped anyway, but a link is a stranger's text */
  return x.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
function dayStr(t) {
  var d = new Date(t);
  if (!isFinite(d.getTime())) return "";
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}
var RESULT_OF = { white: "1-0", black: "0-1", draw: "1/2-1/2" };

/* What the room knows about a game → the few fields that travel.
   g: { sans, white, black, result: "white"|"black"|"draw"|null, reason,
        clock, at, ply (optional: open here), ask (optional), from } */
function gamePayload(g) {
  var o = { v: 1, s: (g.sans || []).slice(0, MAX_PLIES),
            w: str(g.white, NAME_MAX) || "White", b: str(g.black, NAME_MAX) || "Black",
            r: RESULT_OF[g.result] || "*" };
  var y = str(g.reason, REASON_MAX); if (y && o.r !== "*") o.y = y;
  if (g.clock && CLOCK_RE.test(g.clock) && g.clock !== "none") o.c = g.clock;
  var d = dayStr(g.at || Date.now()); if (d) o.d = d;
  if (typeof g.ply === "number" && g.ply >= 0 && g.ply < o.s.length) o.p = Math.floor(g.ply);
  var a = str(g.ask, ASK_MAX); if (a) o.a = a;
  var f = str(g.from, NAME_MAX); if (f) o.f = f;
  return o;
}

/* A payload from a stranger → a game the room can open, or null.
   Every field is rebuilt; the moves must replay from the starting
   position on the receiver's own rules. `bad` names the first move that
   did not, for the "this link is damaged" message. */
function cleanGame(o, Chess) {
  if (!o || typeof o !== "object" || Array.isArray(o) || !Chess) return null;
  if (!Array.isArray(o.s) || o.s.length > MAX_PLIES) return null;
  var g = Chess.create(), sans = [];
  for (var i = 0; i < o.s.length; i++) {
    var s = o.s[i];
    if (typeof s !== "string" || !s.length || s.length > 11 || !/^[A-Za-z0-9=+#\-]+$/.test(s)) return null;
    var m = Chess.fromSAN(g, s);
    if (!m) return null;
    sans.push(Chess.play(g, m));
  }
  var r = RESULTS.indexOf(o.r) >= 0 ? o.r : "*";
  /* the board outranks the label: a link that says 1-0 over a position
     where Black has mated is not believed */
  var st = Chess.status(g);
  if (st.over) r = st.result === "white" ? "1-0" : (st.result === "black" ? "0-1" : "1/2-1/2");
  var out = {
    sans: sans,
    white: str(o.w, NAME_MAX) || "White",
    black: str(o.b, NAME_MAX) || "Black",
    result: r === "1-0" ? "white" : (r === "0-1" ? "black" : (r === "1/2-1/2" ? "draw" : null)),
    reason: r === "*" ? "" : (st.over ? st.reason : str(o.y, REASON_MAX)),
    clock: typeof o.c === "string" && CLOCK_RE.test(o.c) ? o.c : "none",
    day: typeof o.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.d) ? o.d : "",
    ply: typeof o.p === "number" && o.p >= 0 && o.p < sans.length ? Math.floor(o.p) : -1,
    ask: str(o.a, ASK_MAX),
    from: str(o.f, NAME_MAX)
  };
  return out;
}

/* ---------- the words that go with it ----------
   The share is a sentence first and a link second — the result, the
   opening and the length are the honest brag, and every one of them can
   be checked by stepping through the board the link opens. */
function scoreText(result) {
  return result === "white" ? "1–0" : (result === "black" ? "0–1" : (result === "draw" ? "½–½" : "still going"));
}
function movesText(n) {
  var m = Math.ceil(n / 2);
  return m + (m === 1 ? " move" : " moves");
}
/* g: a cleaned game (or anything with the same fields); extra: {opening, url} */
function text(g, extra) {
  extra = extra || {};
  var head = "♟ " + g.white + " vs " + g.black;
  var line;
  if (g.ply >= 0) {
    var side = g.ply % 2 === 0 ? "Black" : "White";       /* the side to move after that ply */
    line = head + " — move " + (Math.floor(g.ply / 2) + 1) + ". " + (g.ask || side + " to play. What would you do?");
  } else {
    line = head + " · " + scoreText(g.result) + (g.reason ? " (" + g.reason + ")" : "") +
      (extra.opening ? " · " + extra.opening : "") + " · " + movesText(g.sans.length);
  }
  return extra.url ? line + "\n" + extra.url : line;
}

/* PGN, the format every chess program on earth reads — so a game from
   here can go on to a club's database or a stronger engine. Seven-tag
   roster, then the moves wrapped at 79 columns, then the result. */
function pgnTag(k, v) { return "[" + k + ' "' + String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]'; }
function pgn(g, extra) {
  extra = extra || {};
  var res = g.result === "white" ? "1-0" : (g.result === "black" ? "0-1" : (g.result === "draw" ? "1/2-1/2" : "*"));
  var tags = [
    pgnTag("Event", "The Chess Room"),
    pgnTag("Site", extra.site || "kmay89.com/chess"),
    pgnTag("Date", (g.day || dayStr(Date.now())).replace(/-/g, ".")),
    pgnTag("Round", "-"),
    pgnTag("White", g.white),
    pgnTag("Black", g.black),
    pgnTag("Result", res)
  ];
  if (extra.opening) tags.push(pgnTag("Opening", extra.opening));
  if (g.clock && g.clock !== "none") {
    var p = g.clock.split("+");
    tags.push(pgnTag("TimeControl", (+p[0] * 60) + "+" + (+p[1])));
  }
  if (g.reason) tags.push(pgnTag("Termination", g.reason));
  var words = [];
  for (var i = 0; i < g.sans.length; i++) {
    if (i % 2 === 0) words.push((i / 2 + 1) + ".");
    words.push(g.sans[i]);
  }
  words.push(res);
  var lines = [], cur = "";
  for (var j = 0; j < words.length; j++) {
    if (cur && cur.length + 1 + words[j].length > 79) { lines.push(cur); cur = words[j]; }
    else cur = cur ? cur + " " + words[j] : words[j];
  }
  if (cur) lines.push(cur);
  return tags.join("\n") + "\n\n" + lines.join("\n") + "\n";
}

var Share = {
  ROUTES: ROUTES, MAX_CODE: MAX_CODE, MAX_PLIES: MAX_PLIES,
  pack: pack, unpack: unpack, url: url,
  gamePayload: gamePayload, cleanGame: cleanGame,
  text: text, pgn: pgn, scoreText: scoreText
};

if (typeof module !== "undefined" && module.exports) module.exports = Share;
else root.Share = Share;
})(typeof self !== "undefined" ? self : this);
