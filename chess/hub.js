/* hub.js — the front door, as a place with four doors.

   The lobby used to be one long card: a question, a number, a play
   button, a road, a ladder, a collection, six tiles, a link to a
   printer and two more links, top to bottom, seventeen hundred pixels
   of it on a phone. Everything in it was worth having and nothing in it
   said where to look. This file is the same room rearranged the way a
   games console arranges its home: four pages you can walk between,
   each one a screen and no more, and a dock along the bottom that says
   where you are.

     play      the road: who is waiting, the one gold button, the map,
               the ladder
     friends   somebody else: one device between you, or a friend far
               away, or a game somebody sent
     learn     the Academy, the rules, the opening stories
     you       your number, what you have won, the settings

   The laws it keeps:
   - Nothing moved out of reach. Every key the old lobby had is on
     exactly one page (ITEMS says which, the checker counts them), with
     the id it always had, so a link, a habit or a test that knew where
     something was still finds it.
   - A newcomer is asked one thing. A first visit — no games, no
     lessons, nothing waiting — is the greeting: whoever is first on the
     road says hello, the room asks whether you know how the pieces
     move, and there are two answers. No dock, no pages, no ladder.
     "Look around first" opens the whole room for anyone who would
     rather; so does finishing a game. It is never taken away again.
   - The dock is an instrument. Each door has a note of the room's home
     chord, low to high, left to right: walk along it and it plays D
     major. A page reached by a swipe says its note softly, a door that
     was pressed says it out loud.
   - A door only wears a badge when something behind it is waiting: a
     game to go back to or a board open for a friend, ideas due in the
     Academy, a box to open. A badge is a fact, never a lure, and at
     most one per door.
   - It opens where it makes sense: on Play after a game, and otherwise
     on the page you left it from — back from the Academy puts you on
     Learn, where the Academy's key is.

   The pictures on the keys are drawn here too (ICONS), as plain SVG
   with named parts, so the stylesheet can move a tassel or lift a lid
   without knowing how it was drawn, and both checkers can read every
   one of them in node.

   Pure: no DOM, no storage, no clock. The page asks; app.js ("the hub")
   does. chess/tools/hub-check.js holds it to all of the above. */
(function (root) {
"use strict";

/* note: semitones above the room's D4, as sound.js counts them */
var PAGES = [
  { id: "play",    label: "Play",    icon: "pawn", note: 12, say: "Play the computer" },
  { id: "friends", label: "Friends", icon: "pair", note: 16, say: "Play with somebody" },
  { id: "learn",   label: "Learn",   icon: "cap",  note: 19, say: "Learn and practise" },
  { id: "you",     label: "You",     icon: "cup",  note: 24, say: "Your record, your collection and the settings" }
];
/* every key of the lobby, and the one page it lives on */
var ITEMS = {
  mWelcome: "play", mNew: "play", mKnow: "play", mLook: "play",
  mOpenBoard: "play", mResume: "play", mPlay: "play", mGoal: "play", mCoach: "play",
  mJourney: "play", mLadder: "play",
  mPass: "friends", mPassOpts: "friends", mLan: "friends", mNotation: "friends",
  mAcademy: "learn", mLearn: "learn", mOpenings: "learn",
  mRating: "you", mCollect: "you", mMakeBoard: "you", mSettings: "you", mAbout: "you"
};

function ids() { return PAGES.map(function (p) { return p.id; }); }
function index(id) {
  for (var i = 0; i < PAGES.length; i++) if (PAGES[i].id === id) return i;
  return -1;
}
function page(i) { return PAGES[clampIndex(i)]; }
function clampIndex(i) {
  i = Math.round(+i);
  if (!(i > 0)) return 0;
  return i > PAGES.length - 1 ? PAGES.length - 1 : i;
}
function pageOf(item) { return Object.prototype.hasOwnProperty.call(ITEMS, item) ? ITEMS[item] : null; }
function itemsOn(id) { return Object.keys(ITEMS).filter(function (k) { return ITEMS[k] === id; }); }

/* ---------- the door: greeting, or the whole room ---------- */
function door(s) {
  s = s || {};
  var greeting = !!s.newcomer && !s.looked;
  return { greeting: greeting, dock: !greeting, swipe: !greeting, pages: greeting ? ["play"] : ids() };
}

/* which page the lobby opens on */
function landing(s) {
  s = s || {};
  if (s.greeting || s.played) return "play";
  return index(s.last) >= 0 ? s.last : "play";
}

/* ---------- walking between pages ---------- */
/* how far along the row of pages a scroll position is, as a number of
   pages: 0 is the first, 1.5 is halfway between the second and third */
function progress(scrollLeft, width) {
  if (!(width > 0)) return 0;
  var p = (+scrollLeft || 0) / width;
  return p < 0 ? 0 : p > PAGES.length - 1 ? PAGES.length - 1 : p;
}
function nearest(scrollLeft, width) { return clampIndex(progress(scrollLeft, width)); }
/* the dock as a row of tabs under the arrow keys: it stops at the ends
   rather than going round, the way the pages do under a thumb */
function key(i, k) {
  i = clampIndex(i);
  if (k === "ArrowRight" || k === "Right") return clampIndex(i + 1);
  if (k === "ArrowLeft" || k === "Left") return clampIndex(i - 1);
  if (k === "Home") return 0;
  if (k === "End") return PAGES.length - 1;
  return i;
}

/* ---------- what is waiting behind each door ---------- */
/* ctx: { resume, openBoard, due, boxes, fresh } → one badge a door, or
   none. kind is how it is drawn (a dot, a number, a present); say is
   the sentence a screen reader gets. */
function count(n) { n = Math.floor(+n); return n > 0 && isFinite(n) ? n : 0; }
function badges(ctx) {
  ctx = ctx || {};
  var out = { play: null, friends: null, learn: null, you: null };
  if (ctx.openBoard) out.play = { kind: "dot", say: "your board is open for a friend" };
  else if (ctx.resume) out.play = { kind: "dot", say: "a game is waiting for you" };
  var due = count(ctx.due);
  if (due) out.learn = { kind: "count", n: due, text: due > 9 ? "9+" : String(due),
                         say: due + (due === 1 ? " idea" : " ideas") + " due in the Academy" };
  var boxes = count(ctx.boxes), fresh = count(ctx.fresh);
  if (boxes) out.you = { kind: "gift", n: boxes, say: boxes + (boxes === 1 ? " box" : " boxes") + " to open" };
  else if (fresh) out.you = { kind: "dot", say: fresh + " new in your collection" };
  return out;
}
/* what a door is called out loud: its name, what is behind it, and
   whatever is waiting there */
function sayDoor(id, badge) {
  var p = PAGES[index(id)];
  if (!p) return "";
  return p.label + ": " + p.say + (badge && badge.say ? " — " + badge.say : "");
}

/* ---------- the pictures on the keys ----------
   Forty-eight units square, drawn in the room's own colours: ivory and
   walnut for the men, the gold of the play button, and one colour a
   door for the rest. A part that moves has a class (ic-…) and nothing
   else knows its name; the stylesheet decides what moving means. */
var C = { ivory: "#f6eede", ivoryS: "#cdbfa8", walnut: "#5a4332", walnutS: "#33251b",
          gold: "#ffd166", goldD: "#f0a020", goldS: "#9c5c08", ink: "#241a08",
          green: "#3ecf8e", greenD: "#1f8a5b", blue: "#8fb0ff", blueD: "#4f6fd6",
          pink: "#ff7a98", pinkD: "#d8345c", violet: "#b99bff", violetD: "#6a4fd0",
          paper: "#fff8e8", red: "#ff6b5a" };
/* a pawn standing on (x, y), s times life size (life size is 30 tall) */
function pawn(x, y, s, fill, shade, cls) {
  return '<g' + (cls ? ' class="' + cls + '"' : "") + '><g transform="translate(' + x + " " + y + ") scale(" + s + ')">' +
    '<rect x="-10" y="-6" width="20" height="6" rx="3" fill="' + shade + '"/>' +
    '<path d="M-6.4-6C-5.2-12-3.6-15-3.6-19.4H3.6C3.6-15 5.2-12 6.4-6Z" fill="' + fill + '"/>' +
    '<rect x="-6.2" y="-21.6" width="12.4" height="3.6" rx="1.8" fill="' + shade + '"/>' +
    '<circle cx="0" cy="-26.2" r="5.8" fill="' + fill + '"/>' +
    '<circle cx="-2" cy="-28.2" r="1.7" fill="#fff" opacity=".55"/></g></g>';
}
function spark(x, y, r, cls) {
  var k = r * 0.28;
  return '<path class="ic-spark ' + (cls || "") + '" fill="#fff" d="M' + x + " " + (y - r) + "Q" + (x + k) + " " + (y - k) + " " + (x + r) + " " + y +
         "Q" + (x + k) + " " + (y + k) + " " + x + " " + (y + r) + "Q" + (x - k) + " " + (y + k) + " " + (x - r) + " " + y +
         "Q" + (x - k) + " " + (y - k) + " " + x + " " + (y - r) + 'Z"/>';
}
var ICONS = {
  /* the dock */
  pawn: '<ellipse cx="24" cy="42.5" rx="13" ry="2.6" fill="#000" opacity=".28"/>' + pawn(24, 42, 1.22, C.gold, C.goldD, "ic-hop"),
  pair: '<ellipse cx="24" cy="42.5" rx="17" ry="2.6" fill="#000" opacity=".28"/>' +
        pawn(32, 41, 0.98, C.walnut, C.walnutS, "ic-nodR") + pawn(16, 42, 1.08, C.ivory, C.ivoryS, "ic-nodL"),
  cap: '<path d="M11 23.5v9c0 3.6 5.8 6.4 13 6.4s13-2.8 13-6.4v-9l-13 5.6Z" fill="' + C.blueD + '"/>' +
       '<path d="M24 9.5 45 19 24 28.5 3 19Z" fill="' + C.blue + '"/>' +
       '<path d="M24 9.5 45 19 24 21.5 3 19Z" fill="#fff" opacity=".22"/>' +
       '<g class="ic-swing"><path d="M24 19h13.5v12" fill="none" stroke="' + C.gold + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
       '<rect x="35" y="30" width="5" height="8" rx="2" fill="' + C.goldD + '"/></g>' +
       '<circle cx="24" cy="19" r="2.2" fill="' + C.gold + '"/>',
  cup: '<path d="M13 14H7.5c0 7 3 11 8.5 11.5M35 14h5.5c0 7-3 11-8.5 11.5" fill="none" stroke="' + C.goldD + '" stroke-width="3.2" stroke-linecap="round"/>' +
       '<rect x="21" y="29" width="6" height="7" fill="' + C.goldD + '"/>' +
       '<rect x="14" y="36" width="20" height="5.5" rx="2.2" fill="' + C.goldS + '"/>' +
       '<g class="ic-shine"><path d="M12 8h24v9c0 8.4-5.4 14-12 14S12 25.4 12 17Z" fill="' + C.gold + '"/>' +
       '<path d="M15 10.5h5v7.5c0 4.5 1.2 7.5 3 9.5-4.8-1-8-5-8-10.5Z" fill="#fff" opacity=".5"/>' +
       '<path d="m24 12.5 1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6Z" fill="' + C.goldS + '" opacity=".75"/></g>' +
       spark(38, 8, 4.2, "s2"),

  /* the keys */
  go: '<circle cx="24" cy="24" r="19" fill="' + C.goldD + '"/><circle cx="24" cy="23" r="18" fill="' + C.gold + '"/>' +
      '<path class="ic-nudge" d="M19.5 14.5v17c0 1.3 1.4 2 2.5 1.3l13-8.5c1-.7 1-2 0-2.6l-13-8.5c-1.1-.7-2.5 0-2.5 1.3Z" fill="' + C.ink + '"/>',
  egg: '<ellipse cx="24" cy="43" rx="12" ry="2.4" fill="#000" opacity=".28"/>' +
       '<g class="ic-peek"><circle cx="24" cy="23" r="9" fill="' + C.gold + '"/>' +
       '<circle cx="20.8" cy="21.5" r="1.5" fill="' + C.ink + '"/><circle cx="27.2" cy="21.5" r="1.5" fill="' + C.ink + '"/>' +
       '<path d="m22 25 2 2.6 2-2.6Z" fill="' + C.goldD + '"/></g>' +
       '<path d="M10.5 28.5l4 2.5 3.2-3.2 3.3 3.2 3-3.2 3 3.2 3.3-3.2 3.2 3.2 4-2.5c.3 8-5.2 14-13.5 14s-13.8-6-13.5-14Z" fill="' + C.ivory + '"/>' +
       '<path d="M13 34c1.5 5 5.5 8 11 8.5-7.5 1-13.2-3.6-13.5-10Z" fill="' + C.ivoryS + '"/>' +
       '<g class="ic-lid"><path d="M12.5 17.5C14 9.5 18.5 5 24 5s10 4.5 11.5 12.5l-3.5 2-3-3-3 3.2-2-2.2-2 2.2-3-3.2-3 3Z" fill="' + C.ivory + '"/>' +
       '<path d="M18 9c-2 2-3.4 5-4 8l2 1.2c.4-3.6 1.2-6.7 2-9.2Z" fill="#fff" opacity=".7"/></g>',
  table: '<path d="M6 30 24 22l18 8-18 9Z" fill="' + C.walnutS + '"/><path d="M6 27.5 24 19.5l18 8-18 9Z" fill="' + C.green + '"/>' +
         '<path d="M24 19.5l9 4-9 4.5-9-4.5ZM15 31.5l9-4.5 9 4.5-9 4.5Z" fill="' + C.greenD + '" opacity=".55"/>' +
         pawn(13.5, 27, 0.72, C.ivory, C.ivoryS, "ic-nodL") + pawn(34.5, 27, 0.72, C.walnut, C.walnutS, "ic-nodR"),
  link: '<g class="ic-wave w1"><path d="M20.5 20a5 5 0 0 1 7 0" fill="none" stroke="' + C.blue + '" stroke-width="2.6" stroke-linecap="round"/></g>' +
        '<g class="ic-wave w2"><path d="M17 15.5a10 10 0 0 1 14 0" fill="none" stroke="' + C.blue + '" stroke-width="2.6" stroke-linecap="round"/></g>' +
        '<g class="ic-wave w3"><path d="M13.5 11a15 15 0 0 1 21 0" fill="none" stroke="' + C.blue + '" stroke-width="2.6" stroke-linecap="round"/></g>' +
        '<g class="ic-tiltL"><rect x="4" y="22" width="15" height="21" rx="3.5" fill="' + C.blueD + '"/><rect x="6.2" y="24.5" width="10.6" height="14" rx="1.5" fill="' + C.paper + '"/>' +
        pawn(11.5, 37, 0.36, C.walnut, C.walnutS) + "</g>" +
        '<g class="ic-tiltR"><rect x="29" y="22" width="15" height="21" rx="3.5" fill="' + C.blueD + '"/><rect x="31.2" y="24.5" width="10.6" height="14" rx="1.5" fill="' + C.paper + '"/>' +
        pawn(36.5, 37, 0.36, C.goldD, C.goldS) + "</g>",
  scroll: '<path d="M11 6h19l8 8v26a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z" fill="' + C.paper + '"/>' +
          '<path d="M30 6l8 8h-6a2 2 0 0 1-2-2Z" fill="' + C.ivoryS + '"/>' +
          '<g fill="none" stroke="' + C.walnut + '" stroke-width="2.2" stroke-linecap="round" opacity=".7"><path d="M13 16h11M13 22h18M13 28h14"/><path class="ic-write" d="M13 34h16"/></g>' +
          '<g class="ic-pen"><path d="m30 37 2.2-6.5 9.5-9.5 4.3 4.3-9.5 9.5Z" fill="' + C.goldD + '"/><path d="m30 37 2.2-6.5 4.3 4.3Z" fill="' + C.ivory + '"/>' +
          '<path d="m30 37 .9-2.6 1.7 1.7Z" fill="' + C.ink + '"/><path d="m40 22.7 1.7-1.7 4.3 4.3-1.7 1.7Z" fill="' + C.pink + '"/></g>',
  book: '<path d="M5 12.5c6-2.5 12.5-2.5 19 1.5 6.5-4 13-4 19-1.5V38c-6-2.5-12.5-2.5-19 1.5-6.5-4-13-4-19-1.5Z" fill="' + C.violetD + '"/>' +
        '<path d="M8 11c5-2 10.5-1.5 16 2v24c-5.5-3.5-11-4-16-2Z" fill="' + C.paper + '"/><path d="M40 11c-5-2-10.5-1.5-16 2v24c5.5-3.5 11-4 16-2Z" fill="' + C.ivory + '"/>' +
        '<g fill="none" stroke="' + C.walnut + '" stroke-width="1.8" stroke-linecap="round" opacity=".55"><path d="M11.5 17c3-.8 6-.5 9 .9M11.5 22.5c3-.8 6-.5 9 .9M11.5 28c3-.8 6-.5 9 .9"/></g>' +
        '<path class="ic-flip" d="M24 13c5.5-3.5 11-4 16-2v24c-5-2-10.5-1.5-16 2Z" fill="' + C.paper + '"/>' +
        '<path d="m32 16.5 1.5 3.1 3.4.5-2.5 2.4.6 3.4-3-1.6-3 1.6.6-3.4-2.5-2.4 3.4-.5Z" fill="' + C.violet + '" class="ic-star"/>',
  gift: '<ellipse cx="24" cy="43" rx="15" ry="2.4" fill="#000" opacity=".28"/>' +
        '<rect x="8.5" y="22" width="31" height="20" rx="3" fill="' + C.pinkD + '"/><rect x="8.5" y="22" width="31" height="5" fill="#000" opacity=".16"/>' +
        '<rect x="21" y="22" width="6" height="20" fill="' + C.gold + '"/>' +
        '<g class="ic-lid"><rect x="6" y="14" width="36" height="9" rx="3" fill="' + C.pink + '"/><rect x="21" y="14" width="6" height="9" fill="' + C.gold + '"/>' +
        '<path d="M24 14c-7-9-13-6.5-11-2.5 1.5 3 6.5 3 11 2.5Zm0 0c7-9 13-6.5 11-2.5-1.5 3-6.5 3-11 2.5Z" fill="' + C.goldD + '"/>' +
        '<circle cx="24" cy="13.5" r="2.6" fill="' + C.gold + '"/></g>' + spark(40, 9, 3.6, "s1") + spark(8, 8, 2.6, "s3"),
  board: '<path d="M4 33 24 24l20 9-20 10Z" fill="' + C.walnutS + '"/><path d="M4 30.5 24 21.5l20 9-20 10Z" fill="' + C.ivory + '"/>' +
         '<path d="M24 21.5l10 4.5-10 5-10-5ZM14 35.5l10-4.5 10 4.5-10 5Z" fill="' + C.goldD + '"/>' +
         '<path d="M24 21.5v19" stroke="' + C.walnutS + '" stroke-width="1.2" opacity=".5"/>' +
         pawn(24, 32, 0.62, C.gold, C.goldD) +
         '<path d="M21.4 26h5.2M21.6 23h4.8M21.8 20h4.4" stroke="' + C.goldS + '" stroke-width=".8" opacity=".55"/>' +
         '<g class="ic-nozzle"><rect x="18.5" y="2" width="11" height="5" rx="1.6" fill="' + C.ivoryS + '"/><path d="M21 7h6l-3 4.2Z" fill="' + C.pink + '"/></g>',
  gear: '<g class="ic-spin"><circle cx="24" cy="24" r="14.5" fill="none" stroke="' + C.ivoryS + '" stroke-width="7" stroke-dasharray="6.4 5" stroke-dashoffset="3.2"/>' +
        '<circle cx="24" cy="24" r="12.5" fill="' + C.ivory + '"/><circle cx="24" cy="24" r="12.5" fill="none" stroke="' + C.ivoryS + '" stroke-width="2"/>' +
        '<circle cx="24" cy="24" r="5" fill="' + C.walnutS + '"/></g>',
  info: '<path d="M9 8h30a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H26l-8 7.5V35H9a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Z" fill="' + C.ivory + '"/>' +
        '<path d="M9 8h30a4 4 0 0 1 4 4v3H5v-3a4 4 0 0 1 4-4Z" fill="#fff" opacity=".6"/>' +
        '<g class="ic-nudge" fill="' + C.walnut + '"><circle cx="24" cy="14.5" r="2.6"/><rect x="21.6" y="19" width="4.8" height="11.5" rx="2.4"/></g>',
  map: '<path d="M4 12.5 16 8l16 4.5L44 8v28l-12 4.5L16 36 4 40.5Z" fill="' + C.paper + '"/>' +
       '<path d="M16 8v28L4 40.5v-28ZM32 12.5 44 8v28l-12 4.5Z" fill="' + C.ivoryS + '" opacity=".75"/>' +
       '<path d="M9 33c3-6 7-3 9.5-7s3-7 7.5-6.5 4 5.5 8 5.5" fill="none" stroke="' + C.pinkD + '" stroke-width="2.2" stroke-linecap="round" stroke-dasharray=".1 4.4"/>' +
       '<g class="ic-pin"><path d="M35 9.5c-3.6 0-6.4 2.8-6.4 6.2 0 4.5 6.4 10.3 6.4 10.3s6.4-5.8 6.4-10.3c0-3.4-2.8-6.2-6.4-6.2Z" fill="' + C.red + '"/>' +
       '<circle cx="35" cy="15.7" r="2.5" fill="#fff"/></g>',
  candle: '<ellipse cx="24" cy="43" rx="11" ry="2.2" fill="#000" opacity=".28"/>' +
          '<rect x="16" y="21" width="16" height="21" rx="3" fill="' + C.ivory + '"/><path d="M16 26c3 2 5-1 8 1s5-1 8 0v-3a3 3 0 0 0-3-3H19a3 3 0 0 0-3 3Z" fill="#fff"/>' +
          '<rect x="27" y="24" width="5" height="18" rx="2.5" fill="' + C.ivoryS + '" opacity=".7"/>' +
          '<path d="M24 21v-4" stroke="' + C.ink + '" stroke-width="1.6" stroke-linecap="round"/>' +
          '<g class="ic-flame"><path d="M24 4c4 4.5 6 7.5 6 10.5a6 6 0 0 1-12 0c0-3 2-6 6-10.5Z" fill="' + C.goldD + '"/>' +
          '<path d="M24 10c2 2.3 3 3.8 3 5.3a3 3 0 0 1-6 0c0-1.5 1-3 3-5.3Z" fill="' + C.paper + '"/></g>'
};
function iconNames() { return Object.keys(ICONS); }
function icon(name) {
  if (!Object.prototype.hasOwnProperty.call(ICONS, name)) return "";
  return '<svg class="hubSvg" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + ICONS[name] + "</svg>";
}

var Hub = {
  PAGES: PAGES, ITEMS: ITEMS, ICONS: ICONS,
  ids: ids, index: index, page: page, pageOf: pageOf, itemsOn: itemsOn,
  door: door, landing: landing, progress: progress, nearest: nearest, key: key,
  badges: badges, sayDoor: sayDoor, icon: icon, iconNames: iconNames
};

if (typeof module !== "undefined" && module.exports) module.exports = Hub;
else root.Hub = Hub;
})(typeof self !== "undefined" ? self : this);
