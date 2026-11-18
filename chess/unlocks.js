/* unlocks.js — the collection: everything there is to win, and how.

   Playing well should leave you with something. Every coach on the ladder
   has three things to give, one for each of its stars:

     ★    beat it                          its board, and its secret (a
                                           skill card: the trick it is
                                           known for, with the lesson that
                                           teaches it)
     ★★   beat it without help             a set of piece colours in its
                                           own style
     ★★★  beat it without help, and well   something special: a new shape
                                           of piece, a trail your pieces
                                           leave as they move, a burst
                                           when they take something

   and every game played (won, drawn or lost: playing is what gets you
   better) earns experience, and every level brings something new: emotes
   to send across the board, trails, bursts, colours, titles.

   This file is only the catalogue, the arithmetic of experience and the
   stored state; when a thing is given, and how it is revealed (the box
   that bounces, shakes and bursts open), is app.js's ("the collection").
   Pure, so chess/tools/unlocks-check.js can read all of it in node.  */
(function (root) {
"use strict";

var KEY = "chessroom_unlocks";
var COACHES = ["acorn", "sprout", "clover", "club", "bamboo", "cactus", "pine", "mentor"];
var NAMES = { acorn: "Acorn", sprout: "Sprout", clover: "Clover", club: "Fern", bamboo: "Bamboo", cactus: "Cactus", pine: "Pine", mentor: "Oak" };

/* the kinds, in the order the collection shows them */
var KINDS = [
  { id: "board", name: "Boards", emoji: "🎲", note: "Each coach's own board." },
  { id: "pieces", name: "Pieces", emoji: "♞", note: "New shapes of piece, carved in 3D." },
  { id: "colors", name: "Colours", emoji: "🎨", note: "Sets of piece colours, each with its own finish." },
  { id: "trail", name: "Trails", emoji: "✨", note: "What your pieces leave behind as they move." },
  { id: "burst", name: "Bursts", emoji: "💥", note: "What happens when you take something." },
  { id: "emote", name: "Emotes", emoji: "😊", note: "Faces to send across the board, and see what the coach makes of them." },
  { id: "skill", name: "Skills", emoji: "📘", note: "Each coach's secret, and the lesson that teaches it." },
  { id: "title", name: "Titles", emoji: "🏷️", note: "Worn under your name." }
];

/* piece colours: whites and blacks with a finish (materials from skins.js) */
var COLORS = {
  "col-acorn":  { white: "#f1dfc0", black: "#5b3a22", material: "wood", shine: 0.3, rim: 0.2 },
  "col-sprout": { white: "#fbf7e6", black: "#4f8f2c", material: "porcelain", shine: 0.6, rim: 0.3 },
  "col-clover": { white: "#ffffff", black: "#1f8a4c", material: "glass", shine: 0.9, rim: 0.7 },
  "col-club":   { white: "#e9eee4", black: "#3b5444", material: "porcelain", shine: 0.4, rim: 0.25 },
  "col-bamboo": { white: "#d6f0d0", black: "#141210", material: "porcelain", shine: 0.85, rim: 0.5 },
  "col-cactus": { white: "#f6e2bf", black: "#d64f7f", material: "porcelain", shine: 0.55, rim: 0.35 },
  "col-pine":   { white: "#eaf6ff", black: "#1d4a3c", material: "glass", shine: 0.95, rim: 0.75 },
  "col-mentor": { white: "#ffe08a", black: "#1a1310", material: "metal", shine: 0.95, rim: 0.6 },
  "col-candy":  { white: "#ffd1e6", black: "#5fd3b5", material: "porcelain", shine: 0.75, rim: 0.4 },
  "col-ocean":  { white: "#c8f2ff", black: "#1b3d8f", material: "glass", shine: 0.95, rim: 0.7 },
  "col-royal":  { white: "#fff4d6", black: "#5a2a8c", material: "metal", shine: 0.9, rim: 0.55 },
  "col-galaxy": { white: "#e8eaff", black: "#2a1b5c", material: "glass", shine: 1.0, rim: 0.9 },
  "col-champion": { white: "#fff3c4", black: "#7a4e00", material: "metal", shine: 1.0, rim: 0.85 }
};

/* Every thing there is. `from` is how it is won: { coach, star } (a star
   is 0, 1 or 2: the first, second and third on the ladder) or { level }.
   `use` is what equipping it does, read by app.js. */
var ITEMS = [
  /* ---- the coaches ---- */
  { id: "board-acorn", kind: "board", name: "Acorn’s Lawn", emoji: "🌼", from: { coach: "acorn", star: 0 }, use: { home: "acorn" } },
  { id: "skill-acorn", kind: "skill", name: "The knight’s hop", emoji: "🐴", from: { coach: "acorn", star: 0 }, use: { lesson: "knight-L" },
    note: "Acorn’s favourite piece jumps where nothing else can. Learn to see its L." },
  { id: "col-acorn", kind: "colors", name: "Acorn & Oak", emoji: "🌰", from: { coach: "acorn", star: 1 } },
  { id: "trail-leaves", kind: "trail", name: "Falling leaves", emoji: "🍂", from: { coach: "acorn", star: 2 } },

  { id: "board-sprout", kind: "board", name: "Sprout’s Seed Tray", emoji: "🌱", from: { coach: "sprout", star: 0 }, use: { home: "sprout" } },
  { id: "skill-sprout", kind: "skill", name: "Count what’s loose", emoji: "🔎", from: { coach: "sprout", star: 0 }, use: { lesson: "dont-hang" },
    note: "Sprout’s rule: before every move, look for anything left undefended. Yours and theirs." },
  { id: "col-sprout", kind: "colors", name: "Fresh Sprout", emoji: "🌱", from: { coach: "sprout", star: 1 } },
  { id: "set-nordic", kind: "pieces", name: "Nordic pieces", emoji: "♜", from: { coach: "sprout", star: 2 }, use: { set: "nordic" } },

  { id: "board-clover", kind: "board", name: "Clover’s Meadow", emoji: "🍀", from: { coach: "clover", star: 0 }, use: { home: "clover" } },
  { id: "skill-clover", kind: "skill", name: "The family fork", emoji: "🍴", from: { coach: "clover", star: 0 }, use: { lesson: "fork-knight" },
    note: "Clover’s lucky trick: one knight, two targets, and only one can run." },
  { id: "col-clover", kind: "colors", name: "Lucky Clover", emoji: "🍀", from: { coach: "clover", star: 1 } },
  { id: "burst-clover", kind: "burst", name: "Four-leaf burst", emoji: "🍀", from: { coach: "clover", star: 2 } },

  { id: "board-club", kind: "board", name: "Fern’s Grotto", emoji: "🌿", from: { coach: "club", star: 0 }, use: { home: "club" } },
  { id: "skill-club", kind: "skill", name: "Notice, then defend", emoji: "🛡️", from: { coach: "club", star: 0 }, use: { lesson: "defend-it" },
    note: "Fern sees a threat before it lands. A defended piece is a safe piece." },
  { id: "col-club", kind: "colors", name: "Moss & Stone", emoji: "🪨", from: { coach: "club", star: 1 } },
  { id: "set-modern", kind: "pieces", name: "Modern pieces", emoji: "♝", from: { coach: "club", star: 2 }, use: { set: "modern" } },

  { id: "board-bamboo", kind: "board", name: "Bamboo’s Dojo", emoji: "🎋", from: { coach: "bamboo", star: 0 }, use: { home: "bamboo" } },
  { id: "skill-bamboo", kind: "skill", name: "The still pin", emoji: "📌", from: { coach: "bamboo", star: 0 }, use: { lesson: "pin-bishop" },
    note: "Bamboo holds a piece where it stands: it cannot move without losing what is behind it." },
  { id: "col-bamboo", kind: "colors", name: "Jade & Lacquer", emoji: "🎍", from: { coach: "bamboo", star: 1 } },
  { id: "trail-wind", kind: "trail", name: "Wind ribbons", emoji: "🎐", from: { coach: "bamboo", star: 2 } },

  { id: "board-cactus", kind: "board", name: "Cactus’s Desert", emoji: "🌵", from: { coach: "cactus", star: 0 }, use: { home: "cactus" } },
  { id: "skill-cactus", kind: "skill", name: "The skewer", emoji: "🍢", from: { coach: "cactus", star: 0 }, use: { lesson: "skewer-rook" },
    note: "Cactus goes straight through: the big piece moves, and the one behind it falls." },
  { id: "col-cactus", kind: "colors", name: "Desert Bloom", emoji: "🌸", from: { coach: "cactus", star: 1 } },
  { id: "burst-prickle", kind: "burst", name: "Prickle pop", emoji: "🌵", from: { coach: "cactus", star: 2 } },

  { id: "board-pine", kind: "board", name: "Pine’s Frost", emoji: "🌲", from: { coach: "pine", star: 0 }, use: { home: "pine" } },
  { id: "skill-pine", kind: "skill", name: "The back rank", emoji: "🧱", from: { coach: "pine", star: 0 }, use: { lesson: "backrank-mate" },
    note: "Pine counts the escape squares. A king walled in by its own pawns has none." },
  { id: "col-pine", kind: "colors", name: "Frost & Pine", emoji: "❄️", from: { coach: "pine", star: 1 } },
  { id: "set-staunton", kind: "pieces", name: "Staunton pieces", emoji: "♚", from: { coach: "pine", star: 2 }, use: { set: "staunton" } },

  { id: "board-mentor", kind: "board", name: "Oak’s Library Table", emoji: "🌳", from: { coach: "mentor", star: 0 }, use: { home: "mentor" } },
  { id: "skill-mentor", kind: "skill", name: "The quiet promotion", emoji: "👑", from: { coach: "mentor", star: 0 }, use: { lesson: "promote-safe" },
    note: "Oak’s patience: walk the pawn home only when nothing can stop it." },
  { id: "col-mentor", kind: "colors", name: "Gold & Ebony", emoji: "🥇", from: { coach: "mentor", star: 1 } },
  { id: "burst-gold", kind: "burst", name: "Golden fireworks", emoji: "🎆", from: { coach: "mentor", star: 2 } },

  /* ---- the levels ---- */
  { id: "emote-hello", kind: "emote", name: "Hello faces", emoji: "👋", from: { level: 2 }, use: { emotes: ["👋", "👍", "😮"] } },
  { id: "trail-sparkle", kind: "trail", name: "Sparkles", emoji: "✨", from: { level: 3 } },
  { id: "col-candy", kind: "colors", name: "Candy", emoji: "🍬", from: { level: 4 } },
  { id: "burst-confetti", kind: "burst", name: "Confetti pop", emoji: "🎉", from: { level: 5 } },
  { id: "emote-fun", kind: "emote", name: "Fun faces", emoji: "😂", from: { level: 6 }, use: { emotes: ["😂", "🔥", "😎"] } },
  { id: "trail-bubbles", kind: "trail", name: "Bubbles", emoji: "🫧", from: { level: 7 } },
  { id: "col-ocean", kind: "colors", name: "Ocean", emoji: "🌊", from: { level: 8 } },
  { id: "burst-stars", kind: "burst", name: "Starfall", emoji: "⭐", from: { level: 9 } },
  { id: "title-rising", kind: "title", name: "Rising Star", emoji: "🌟", from: { level: 10 } },
  { id: "trail-rainbow", kind: "trail", name: "Rainbow", emoji: "🌈", from: { level: 11 } },
  { id: "col-royal", kind: "colors", name: "Royal", emoji: "👑", from: { level: 12 } },
  { id: "emote-cheer", kind: "emote", name: "Cheer faces", emoji: "🥳", from: { level: 13 }, use: { emotes: ["🥳", "💪", "🤔"] } },
  { id: "burst-hearts", kind: "burst", name: "Hearts", emoji: "💖", from: { level: 14 } },
  { id: "title-grove", kind: "title", name: "Friend of the Grove", emoji: "🌻", from: { level: 15 } },
  { id: "trail-comet", kind: "trail", name: "Comet", emoji: "☄️", from: { level: 16 } },
  { id: "col-galaxy", kind: "colors", name: "Galaxy", emoji: "🌌", from: { level: 18 } },
  { id: "title-legend", kind: "title", name: "Legend of the Room", emoji: "🏆", from: { level: 20 } },

  /* ---- the ladder as a whole ---- */
  { id: "title-climber", kind: "title", name: "Ladder Climber", emoji: "🪜", from: { all: 0 } },
  { id: "title-master", kind: "title", name: "Master Gardener", emoji: "🏅", from: { all: 2 } },

  /* ---- the end of the road (journey.js) ---- */
  { id: "title-champion", kind: "title", name: "Grove Champion", emoji: "🏆", from: { cup: 1 } },
  { id: "col-champion", kind: "colors", name: "Champion Gold", emoji: "🥇", from: { cup: 1 } },
  { id: "trail-victory", kind: "trail", name: "Victory lap", emoji: "🎆", from: { cup: 1 } },
  { id: "title-acorn", kind: "title", name: "The Golden Acorn", emoji: "🌰", from: { complete: 100 } }
];
var BY_ID = {};
ITEMS.forEach(function (it) { BY_ID[it.id] = it; });

/* ---------- experience ----------
   Level n to n+1 costs 100 + 40(n-1): quick at first (a game or two),
   then a steady walk. Losing a game still earns something; nobody gets
   better by not playing. */
function xpToNext(level) { return 100 + 40 * (level - 1); }
function levelOf(xp) {
  var lv = 1, left = Math.max(0, xp | 0);
  while (left >= xpToNext(lv) && lv < 99) { left -= xpToNext(lv); lv++; }
  return { level: lv, into: left, need: xpToNext(lv), frac: left / xpToNext(lv) };
}
/* what a game is worth. g: { mode, result: "win"|"draw"|"loss", tier
   (the coach's place on the ladder, 0..7), stars (new ones), comeback,
   wire, feats (new ones), rated } */
function xpFor(g) {
  var parts = [];
  if (g.mode === "coach") {
    var base = g.result === "win" ? 60 + 8 * (g.tier | 0) : g.result === "draw" ? 35 : 20;
    if (!g.rated) base = Math.round(base * 0.5);
    parts.push({ why: g.result === "win" ? "A win" : g.result === "draw" ? "A draw" : "A game played", xp: base });
  } else {
    parts.push({ why: "A game played", xp: 20 });
  }
  if (g.stars) parts.push({ why: g.stars > 1 ? g.stars + " new stars" : "A new star", xp: 40 * g.stars });
  if (g.comeback) parts.push({ why: "A comeback", xp: 50 });
  else if (g.wire) parts.push({ why: "Never behind", xp: 25 });
  if (g.feats) parts.push({ why: g.feats > 1 ? g.feats + " feats" : "A feat", xp: 30 * g.feats });
  var total = 0;
  parts.forEach(function (p) { total += p.xp; });
  return { total: total, parts: parts };
}

/* ---------- the state ---------- */
function fresh() { return { v: 1, xp: 0, owned: {}, fresh: {}, equip: { trail: null, burst: null, title: null, colors: null }, migrated: false }; }
function clean(s) {
  var out = fresh();
  if (!s || typeof s !== "object" || s.v !== 1) return out;
  out.xp = Math.max(0, Math.min(1e7, s.xp | 0));
  out.migrated = !!s.migrated;
  if (s.owned && typeof s.owned === "object") Object.keys(s.owned).forEach(function (id) { if (BY_ID[id]) out.owned[id] = +s.owned[id] || 1; });
  if (s.fresh && typeof s.fresh === "object") Object.keys(s.fresh).forEach(function (id) { if (out.owned[id]) out.fresh[id] = 1; });
  var e = s.equip || {};
  ["trail", "burst", "title", "colors"].forEach(function (k) {
    out.equip[k] = typeof e[k] === "string" && out.owned[e[k]] && BY_ID[e[k]].kind === k ? e[k] : null;
  });
  return out;
}
function load(get) { try { return clean(JSON.parse(get(KEY) || "null")); } catch (e) { return fresh(); } }
function save(st, set) { try { set(KEY, JSON.stringify(st)); } catch (e) {} }

/* Is this item's condition met? ladder: { rungs: { id: { stars: [a,b,c] } } };
   extra: { cupWon, completion } from journey.js */
function earned(it, ladder, level, extra) {
  var f = it.from;
  extra = extra || {};
  if (f.level != null) return level >= f.level;
  if (f.cup) return !!extra.cupWon;
  if (f.complete != null) return (extra.completion | 0) >= f.complete;
  var rungs = (ladder && ladder.rungs) || {};
  if (f.coach) { var r = rungs[f.coach]; return !!(r && r.stars && r.stars[f.star]); }
  if (f.all != null) return COACHES.every(function (c) { var r = rungs[c]; return !!(r && r.stars && r.stars[f.all]); });
  return false;
}
/* give everything that has been earned and is not yet owned; returns the
   new ones, in catalogue order. `quiet` gives them without marking them
   to be revealed (a first run, catching up on games played before). */
function grant(st, ladder, at, quiet, extra) {
  var lv = levelOf(st.xp).level, got = [];
  ITEMS.forEach(function (it) {
    if (st.owned[it.id] || !earned(it, ladder, lv, extra)) return;
    st.owned[it.id] = at || 1;
    st.fresh[it.id] = 1;
    if (!quiet) got.push(it);
  });
  return got;
}
/* experience in, levels out: what changed, for the card to show */
function addXp(st, n) {
  var before = levelOf(st.xp);
  st.xp = Math.max(0, st.xp + (n | 0));
  var after = levelOf(st.xp);
  return { before: before, after: after, levels: after.level - before.level, gained: n | 0 };
}
/* what the next level brings, for "next: ✨ Sparkles at level 3" */
function nextReward(st) {
  var lv = levelOf(st.xp).level;
  for (var i = 0; i < ITEMS.length; i++) {
    var it = ITEMS[i];
    if (it.from.level != null && it.from.level > lv) return it;
  }
  return null;
}
/* the emotes you can send: every pack you own */
function emotes(st) {
  var out = [];
  ITEMS.forEach(function (it) { if (it.kind === "emote" && st.owned[it.id]) out = out.concat(it.use.emotes); });
  return out;
}
/* how to win it, in words */
function howTo(it) {
  var f = it.from;
  if (f.level != null) return "Reach level " + f.level;
  if (f.cup) return "Win the Grove Cup";
  if (f.complete != null) return "Reach " + f.complete + "% completion";
  if (f.all === 0) return "Beat every coach on the ladder";
  if (f.all === 2) return "Earn all three stars from every coach";
  var who = NAMES[f.coach] || f.coach;
  return f.star === 0 ? "Beat " + who : f.star === 1 ? "Beat " + who + " with no help" : "Beat " + who + " with no help, and play well (80%+)";
}
function countOwned(st, kind) {
  var n = 0, of = 0;
  ITEMS.forEach(function (it) { if (!kind || it.kind === kind) { of++; if (st.owned[it.id]) n++; } });
  return { n: n, of: of };
}

var Unlocks = { KEY: KEY, KINDS: KINDS, ITEMS: ITEMS, COLORS: COLORS, COACHES: COACHES,
                byId: function (id) { return BY_ID[id] || null; },
                xpToNext: xpToNext, levelOf: levelOf, xpFor: xpFor,
                fresh: fresh, clean: clean, load: load, save: save,
                earned: earned, grant: grant, addXp: addXp, nextReward: nextReward,
                emotes: emotes, howTo: howTo, countOwned: countOwned };
if (typeof module !== "undefined" && module.exports) module.exports = Unlocks;
else root.Unlocks = Unlocks;
})(typeof window !== "undefined" ? window : this);
