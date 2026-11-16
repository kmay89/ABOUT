/* skins.js — the look of the room, as data.

   A skin is a small plain object: colours, a board pattern, a piece
   material, and how much light comes off it. Both renderers read the
   same object, so anything you change applies instantly to the 2D board
   and the 3D one, mid-game, without restarting anything.

   Skins travel. Any skin can be squeezed into a short SKIN1.… code (or
   a link) and handed to someone else, and codes that arrive from other
   people land in your gallery beside the built-in ones. That's the
   whole "presets by people who exported them" idea: the gallery below
   is the house set to start you off, and it grows with whatever your
   friends send you.

   Everything crossing the border is treated as hostile: colours must be
   real hex, materials and patterns must be ones we know, numbers are
   clamped, and any text is stripped of markup before it can reach the
   page. */
(function (root) {
"use strict";

/* ---------- materials: what light does when it lands ---------- */
/* spec and power are the old Blinn-Phong pair, still used by the 2D
   board where a highlight is painted rather than computed. rough and
   metal are what the 3D renderer asks for: roughness is the width of
   the highlight (0 is a mirror, 1 is chalk) and metalness decides
   whether the reflection takes the material's own colour or the room's.
   Both descriptions of the same surface, kept side by side so neither
   renderer has to guess at the other's numbers. */
/* sss is how far light gets into the material before it comes back
   out — what makes ivory glow at its thin edges where plastic would not
   — and coat is a clear lacquer over it: a second, glassier highlight
   that a shine slider polishes up. */
var MATERIALS = {
  ivory:     { label: "Ivory",     spec: 0.45, power: 34,  rim: 0.10, alpha: 1.00, rough: 0.34, metal: 0.00, sss: 0.55, coat: 0.25, note: "warm, softly polished \u2014 a short mellow click" },
  porcelain: { label: "Porcelain", spec: 0.80, power: 70,  rim: 0.14, alpha: 1.00, rough: 0.16, metal: 0.00, sss: 0.30, coat: 0.70, note: "bright and glassy-smooth \u2014 a clear tink" },
  glass:     { label: "Glass",     spec: 0.95, power: 100, rim: 0.30, alpha: 0.72, rough: 0.06, metal: 0.00, sss: 0.35, coat: 0.40, note: "you can see through it, and it rings" },
  metal:     { label: "Metal",     spec: 1.00, power: 140, rim: 0.35, alpha: 1.00, rough: 0.22, metal: 0.62, sss: 0.00, coat: 0.05, note: "hard highlights, cold, chimes like a bell" },
  wood:      { label: "Wood",      spec: 0.18, power: 14,  rim: 0.06, alpha: 1.00, rough: 0.56, metal: 0.00, sss: 0.10, coat: 0.14, note: "matte, turned on a lathe \u2014 a dry knock" },
  ink:       { label: "Ink",       spec: 0.04, power: 8,   rim: 0.04, alpha: 1.00, rough: 0.88, metal: 0.00, sss: 0.00, coat: 0.00, note: "flat as a printed page, and about as loud" }
};
/* The carved 3D sets live in pieces3d.js; a skin only carries the name
   of the one it wants, so skins.js stays pure data and can be checked
   without a renderer anywhere near it. An id we don't recognise is kept
   rather than corrected — a friend's code may name a set you haven't
   installed yet, and the board falls back to the house set on its own
   rather than quietly rewriting what they sent. */
var PIECE_SETS = {
  classic:  { label: "Classic",  note: "turned openwork spirals" },
  staunton: { label: "Staunton", note: "the tournament pattern, carved" },
  modern:   { label: "Modern",   note: "flat-shaded geometry" },
  nordic:   { label: "Nordic",   note: "round, soft, hand-sized" }
};
var SET_ID = /^[a-z0-9][a-z0-9-]{0,23}$/;
var DEFAULT_SET = "classic";

var PATTERNS = {
  plain:  { label: "Plain",  note: "clean colour, nothing else" },
  wood:   { label: "Wood",   note: "long grain along the board" },
  marble: { label: "Marble", note: "soft veins, like a café table" },
  linen:  { label: "Linen",  note: "a fine woven cross-hatch" },
  inlay:  { label: "Inlay",  note: "a thin bright line around every square" }
};

/* ---------- the house gallery ----------
   Each one exists to show a different corner of the settings, so the
   first thing you do after tapping a preset is understand what a slider
   would do. */
var PRESETS = [
  { id: "walnut", name: "Walnut Study", maker: "The Chess Room",
    note: "The default: a lamp, a wooden board, ivory pieces. Warm enough to play all evening.",
    board: { light: "#ecdcc0", dark: "#a97d55", rim: "#54382a", edge: "#caa87c", coord: "#5d4433",
             pattern: "wood", grain: 0.55, gloss: 0.22 },
    pieces: { white: "#f4ead6", black: "#2b241d", material: "ivory", set: "classic", shine: 0.55, rim: 0.30 },
    room: { bg: "#191512" },
    marks: { select: "#f6c450", legal: "#4c8f5e", capture: "#c0503f", last: "#f4d678", check: "#dc3c32", hint: "#2b8a5c", plan: "#3f8fd6" } },

  { id: "midnight", name: "Midnight Glass", maker: "The Chess Room",
    note: "Dark room, translucent pieces. Turn the shine up and the kings glow at the edges.",
    board: { light: "#3b4a5c", dark: "#1e2733", rim: "#0d1219", edge: "#2a3542", coord: "#7f93a8",
             pattern: "marble", grain: 0.35, gloss: 0.75 },
    pieces: { white: "#dceaf6", black: "#3d5570", material: "glass", set: "classic", shine: 0.95, rim: 0.75 },
    room: { bg: "#080b10" },
    marks: { select: "#63c8ff", legal: "#3aa0d8", capture: "#ff6f6f", last: "#5ec6ff", check: "#ff5252", hint: "#48d6b0", plan: "#ffb347" } },

  { id: "boneink", name: "Bone and Ink", maker: "The Chess Room",
    note: "Maximum contrast, no shine at all — the easiest board to read, and kind on tired eyes.",
    board: { light: "#f2efe6", dark: "#8d8880", rim: "#22201d", edge: "#dcd8cd", coord: "#3a3833",
             pattern: "plain", grain: 0, gloss: 0.02 },
    pieces: { white: "#ffffff", black: "#161513", material: "ink", set: "modern", shine: 0.10, rim: 0.05 },
    room: { bg: "#12110f" },
    marks: { select: "#e8b33a", legal: "#4a7d52", capture: "#b23c30", last: "#e8cf7a", check: "#c1372c", hint: "#2f6f4a", plan: "#2f6fc4" } },

  { id: "seaglass", name: "Sea Glass", maker: "The Chess Room",
    note: "Sand and shallow water. Porcelain pieces so the highlights stay soft.",
    board: { light: "#e6e2cd", dark: "#7fa89b", rim: "#3c554f", edge: "#c9c3a8", coord: "#40564f",
             pattern: "linen", grain: 0.45, gloss: 0.35 },
    pieces: { white: "#fbf7ea", black: "#33504c", material: "porcelain", set: "nordic", shine: 0.70, rim: 0.35 },
    room: { bg: "#131b1a" },
    marks: { select: "#f3c969", legal: "#3f8f76", capture: "#cf6a52", last: "#ffdf9b", check: "#d9503f", hint: "#2f8f74", plan: "#c7652d" } },

  { id: "rosewood", name: "Rosewood Parlour", maker: "The Chess Room",
    note: "A deep red board with brass-coloured markings — the club-room look.",
    board: { light: "#e8cfae", dark: "#8a4433", rim: "#40201a", edge: "#b98d68", coord: "#4d2a20",
             pattern: "wood", grain: 0.8, gloss: 0.40 },
    pieces: { white: "#f6e8d0", black: "#2a1a14", material: "wood", set: "staunton", shine: 0.30, rim: 0.18 },
    room: { bg: "#1a100c" },
    marks: { select: "#e0a94a", legal: "#7d7a34", capture: "#b8452f", last: "#e8bd6a", check: "#cc3b2a", hint: "#8a7326", plan: "#3b7fb5" } },

  { id: "frost", name: "Frost", maker: "The Chess Room",
    note: "Cold whites and a pale blue. Metal pieces, so every edge catches the light.",
    board: { light: "#f4f8fb", dark: "#a9bfd0", rim: "#4a5b6b", edge: "#dbe6ee", coord: "#3f5162",
             pattern: "marble", grain: 0.3, gloss: 0.6 },
    pieces: { white: "#ffffff", black: "#5b6b7d", material: "metal", set: "modern", shine: 0.85, rim: 0.55 },
    room: { bg: "#0f1519" },
    marks: { select: "#5aa8ff", legal: "#3d8fbf", capture: "#e05a5a", last: "#8ec8ff", check: "#e34a4a", hint: "#2f86c4", plan: "#e0782f" } },

  { id: "terracotta", name: "Terracotta", maker: "The Chess Room",
    note: "Clay and sunlight — matte, earthy, and completely glare-free.",
    board: { light: "#efe0c8", dark: "#c07a54", rim: "#5e3524", edge: "#d9b995", coord: "#5c3823",
             pattern: "plain", grain: 0.1, gloss: 0.08 },
    pieces: { white: "#f8eeda", black: "#4a2c1e", material: "wood", set: "nordic", shine: 0.22, rim: 0.12 },
    room: { bg: "#1b120d" },
    marks: { select: "#e8a33f", legal: "#6f8a4a", capture: "#bc4f38", last: "#eec27e", check: "#c44430", hint: "#5f7f3f", plan: "#3a7fc0" } },

  { id: "neon", name: "Neon Café", maker: "The Chess Room",
    note: "Loud on purpose. Proof that the sliders go somewhere silly if you want them to.",
    board: { light: "#2b2f4a", dark: "#171a2e", rim: "#0b0d18", edge: "#232741", coord: "#8f9ad0",
             pattern: "inlay", grain: 0.2, gloss: 0.9 },
    pieces: { white: "#ff8ae2", black: "#5de3ff", material: "glass", set: "modern", shine: 1.0, rim: 0.9 },
    room: { bg: "#07080f" },
    marks: { select: "#ffe14d", legal: "#38f5b0", capture: "#ff4d80", last: "#ffe14d", check: "#ff3d6e", hint: "#38f5b0", plan: "#4da6ff" } }
];

/* ---------- each coach's own board ----------
   You play a coach on its board, and beating it once is how the board
   becomes yours to use anywhere. Keyed by the ladder's level ids, which
   is all this file knows of the coaches: the faces and the voices live
   in cast.js, the unlocking in app.js. Apostrophes are the curly kind,
   because the text guard strips the straight one from names. */
var HOME_LIST = [
  { id: "home-acorn", coach: "acorn", name: "Acorn’s Stump", maker: "Acorn",
    note: "A fresh-cut stump in the leaf litter, rings and all. Wooden pieces, a little rough.",
    board: { light: "#ecd4a4", dark: "#9c6a3e", rim: "#3e2716", edge: "#7a5232", coord: "#4a2f1b",
             pattern: "wood", grain: 0.9, gloss: 0.10 },
    pieces: { white: "#f3e2bf", black: "#5a3a22", material: "wood", set: "classic", shine: 0.25, rim: 0.15 },
    room: { bg: "#1a120c" },
    marks: { select: "#f0b84a", legal: "#6f8f3a", capture: "#c0503f", last: "#f2cf7a", check: "#d43c2e", hint: "#5f8f3a", plan: "#3f86c8" } },

  { id: "home-sprout", coach: "sprout", name: "Sprout’s Seed Tray", maker: "Sprout",
    note: "The potting bench: new-leaf greens in a terracotta rim, soft porcelain pieces.",
    board: { light: "#eef3d8", dark: "#93bd6b", rim: "#86452a", edge: "#c87a52", coord: "#3f5a26",
             pattern: "linen", grain: 0.40, gloss: 0.18 },
    pieces: { white: "#fdfaee", black: "#3c6a2a", material: "porcelain", set: "nordic", shine: 0.55, rim: 0.30 },
    room: { bg: "#131a10" },
    marks: { select: "#f2c14e", legal: "#4f9a3c", capture: "#cf5a40", last: "#f6dc8a", check: "#d9452f", hint: "#3f8f3a", plan: "#c05a8f" } },

  { id: "home-clover", coach: "clover", name: "Clover’s Meadow", maker: "Clover",
    note: "Four-leaf green and clover-flower pink, with a little shine for luck.",
    board: { light: "#f1f3e4", dark: "#5f9f70", rim: "#24503a", edge: "#a9cfa8", coord: "#2d5a3d",
             pattern: "plain", grain: 0.15, gloss: 0.45 },
    pieces: { white: "#ffffff", black: "#6a3a5c", material: "porcelain", set: "classic", shine: 0.75, rim: 0.45 },
    room: { bg: "#0f1912" },
    marks: { select: "#ffd166", legal: "#3c9a5e", capture: "#e0607e", last: "#ffe08f", check: "#e0443a", hint: "#2f8f5a", plan: "#c05aa0" } },

  { id: "home-club", coach: "club", name: "Fern’s Shade", maker: "Fern",
    note: "Under the ferns: quiet moss and stone greys, and nothing that glares.",
    board: { light: "#dfe7dc", dark: "#6f8c78", rim: "#2c3c33", edge: "#9fb2a3", coord: "#2f4237",
             pattern: "linen", grain: 0.50, gloss: 0.12 },
    pieces: { white: "#f2f4ec", black: "#26352c", material: "porcelain", set: "staunton", shine: 0.35, rim: 0.20 },
    room: { bg: "#0f1512" },
    marks: { select: "#e8c35a", legal: "#4f8a62", capture: "#c45a48", last: "#e9d58a", check: "#cf4636", hint: "#3f7f58", plan: "#4f86c0" } },

  { id: "home-bamboo", coach: "bamboo", name: "Bamboo’s Lacquer", maker: "Bamboo",
    note: "Pale split cane in a black lacquer frame, with lacquered pieces to match.",
    board: { light: "#f1e5bd", dark: "#bc9d58", rim: "#100e0d", edge: "#2a2321", coord: "#4a3a1c",
             pattern: "inlay", grain: 0.35, gloss: 0.55 },
    pieces: { white: "#f7f0de", black: "#1a1614", material: "metal", set: "modern", shine: 0.80, rim: 0.50 },
    room: { bg: "#0d0c0b" },
    marks: { select: "#e8b84a", legal: "#7a8f3a", capture: "#c8402e", last: "#efcf78", check: "#d2382a", hint: "#6a8a2f", plan: "#c0302a" } },

  { id: "home-cactus", coach: "cactus", name: "Cactus’s Desert", maker: "Cactus",
    note: "Sun-baked sand and terracotta. Bone-white pieces against cactus green. Hot.",
    board: { light: "#f2dbb2", dark: "#c46a3c", rim: "#55291a", edge: "#dcb27e", coord: "#5a2f1c",
             pattern: "plain", grain: 0.25, gloss: 0.08 },
    pieces: { white: "#f8ecd4", black: "#2f5a3a", material: "wood", set: "nordic", shine: 0.25, rim: 0.15 },
    room: { bg: "#1e120b" },
    marks: { select: "#f2a83a", legal: "#4f8a4a", capture: "#b8402c", last: "#f4c87a", check: "#c8382a", hint: "#3f7f3a", plan: "#3a7fc4" } },

  { id: "home-pine", coach: "pine", name: "Pine’s Frost", maker: "Pine",
    note: "Frost on dark pine. Cold metal pieces, every edge clear as a winter morning.",
    board: { light: "#eef4f5", dark: "#4f7868", rim: "#18302a", edge: "#c6d6d8", coord: "#21392f",
             pattern: "marble", grain: 0.30, gloss: 0.65 },
    pieces: { white: "#ffffff", black: "#2a4a40", material: "metal", set: "modern", shine: 0.90, rim: 0.60 },
    room: { bg: "#0b1311" },
    marks: { select: "#7cc4ff", legal: "#3f8f86", capture: "#e05a5a", last: "#a8dcff", check: "#e34a4a", hint: "#2f8f80", plan: "#e0902f" } },

  { id: "home-mentor", coach: "mentor", name: "Oak’s Library Table", maker: "Oak",
    note: "Old oak with a gilt inlay, ivory and ebony on top. The board the whole ladder leads to.",
    board: { light: "#e8cf9c", dark: "#7a4d28", rim: "#2a170c", edge: "#b08a4a", coord: "#3a2412",
             pattern: "inlay", grain: 0.70, gloss: 0.50 },
    pieces: { white: "#f6ead2", black: "#1c1410", material: "ivory", set: "staunton", shine: 0.60, rim: 0.35 },
    room: { bg: "#140d08" },
    marks: { select: "#e6b94a", legal: "#7d7a34", capture: "#b8452f", last: "#ecc670", check: "#cc3b2a", hint: "#8a7326", plan: "#3b7fb5" } }
];

/* ---------- guards: nothing from outside is trusted ---------- */
var HEX = /^#[0-9a-fA-F]{6}$/;
function hex(v, fallback) { return (typeof v === "string" && HEX.test(v)) ? v.toLowerCase() : fallback; }
function num(v, lo, hi, fallback) {
  var n = typeof v === "number" ? v : parseFloat(v);
  if (!isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
function pick(v, table, fallback) { return Object.prototype.hasOwnProperty.call(table, v) ? v : fallback; }
function setId(v, fallback) { return (typeof v === "string" && SET_ID.test(v)) ? v : fallback; }
/* "|" is the field separator in share codes, so it can never survive in
   text either — along with anything that could reach the page as markup */
function text(v, max, fallback) {
  if (typeof v !== "string") return fallback;
  var s = v.replace(/[<>&"'`\\|]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  return s || fallback;
}

var DEFAULT = PRESETS[0];

/* normalise anything into a complete, safe skin */
function clean(s, fallbackName) {
  s = s || {};
  var b = s.board || {}, p = s.pieces || {}, r = s.room || {}, m = s.marks || {};
  var d = DEFAULT;
  return {
    id: text(s.id, 24, "custom"),
    name: text(s.name, 28, fallbackName || "Untitled skin"),
    maker: text(s.maker, 24, "Someone"),
    note: text(s.note, 120, ""),
    board: {
      light: hex(b.light, d.board.light), dark: hex(b.dark, d.board.dark),
      rim: hex(b.rim, d.board.rim), edge: hex(b.edge, d.board.edge),
      coord: hex(b.coord, d.board.coord),
      pattern: pick(b.pattern, PATTERNS, "wood"),
      grain: num(b.grain, 0, 1, d.board.grain),
      gloss: num(b.gloss, 0, 1, d.board.gloss)
    },
    pieces: {
      white: hex(p.white, d.pieces.white), black: hex(p.black, d.pieces.black),
      material: pick(p.material, MATERIALS, "ivory"),
      set: setId(p.set, d.pieces.set || DEFAULT_SET),
      shine: num(p.shine, 0, 1, d.pieces.shine),
      rim: num(p.rim, 0, 1, d.pieces.rim)
    },
    room: { bg: hex(r.bg, d.room.bg) },
    marks: {
      select: hex(m.select, d.marks.select), legal: hex(m.legal, d.marks.legal),
      capture: hex(m.capture, d.marks.capture), last: hex(m.last, d.marks.last),
      check: hex(m.check, d.marks.check), hint: hex(m.hint, d.marks.hint),
      /* the colour of your own pen. A seventh mark that share codes do not
         carry (six colours keep every code ever sent working), so a look
         without one takes its preset's — found by id, or by the name a
         code travels under — and anything else takes the house's */
      plan: hex(m.plan, planFor(s))
    }
  };
}
function planFor(s) {
  var all = PRESETS.concat(HOME_LIST);
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === s.id || all[i].name === s.name) return all[i].marks.plan;
  }
  return DEFAULT.marks.plan;
}

function clone(s) { return JSON.parse(JSON.stringify(s)); }

/* material → the numbers the renderers actually use */
function surface(skin) {
  var mat = MATERIALS[skin.pieces.material] || MATERIALS.ivory;
  /* the shine slider polishes: it narrows the highlight rather than
     brightening it, which is what actually happens when you buff a
     piece. Clamped off both ends — a perfect mirror has nothing to
     reflect in a room this small, and nothing is ever quite chalk. */
  var rough = mat.rough * (1.32 - skin.pieces.shine * 0.72);
  return {
    spec: mat.spec * (0.25 + skin.pieces.shine * 1.15),
    power: mat.power,
    rim: mat.rim * (0.3 + skin.pieces.rim * 2.2),
    rough: Math.max(0.045, Math.min(0.96, rough)),
    metal: mat.metal,
    sss: mat.sss || 0,
    /* the lacquer takes a polish: buffed, more of the highlight is the
       coat's and less the material's own */
    coat: Math.min(1, (mat.coat || 0) * (0.45 + skin.pieces.shine * 0.8)),
    alpha: mat.alpha,
    translucent: mat.alpha < 1
  };
}

/* ---------- sharing: SKIN1.<base64url(json)> ---------- */
function b64u(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(str) {
  return decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/"))));
}
/* The payload is a compact pipe-separated record rather than JSON —
   colours lose their "#", sliders become 0-100, and the material and
   pattern become indexes. It roughly halves the code, which is the
   difference between something you can text and something you can't.
   These two orders are part of the wire format: append only, never
   reorder, or old codes would decode into the wrong material.

   The carved piece set was appended as a fourteenth field once the 3D
   board had more than one set to offer. It rides as its plain id rather
   than an index, because sets can arrive from outside this file and an
   index would only be meaningful to whoever wrote the list. Codes with
   thirteen fields are older codes and still decode — they simply get
   the house set. */
var MATERIAL_ORDER = ["ivory", "porcelain", "glass", "metal", "wood", "ink"];
var PATTERN_ORDER = ["plain", "wood", "marble", "linen", "inlay"];
function pct(v) { return String(Math.round(v * 100)); }
function unpct(v) { return num(parseInt(v, 10) / 100, 0, 1, 0.5); }
function bare(h) { return h.charAt(0) === "#" ? h.slice(1) : h; }
function hash(h) { return "#" + h; }

function encode(skin) {
  var s = clean(skin);
  var mat = MATERIAL_ORDER.indexOf(s.pieces.material); if (mat < 0) mat = 0;
  var pat = PATTERN_ORDER.indexOf(s.board.pattern); if (pat < 0) pat = 0;
  var fields = [
    /* the blurb rides along, but trimmed — a code you can text beats a
       code that carries a paragraph */
    s.name, s.maker, text(s.note, 60, ""),
    [s.board.light, s.board.dark, s.board.rim, s.board.edge, s.board.coord].map(bare).join(","),
    pat, pct(s.board.grain), pct(s.board.gloss),
    [s.pieces.white, s.pieces.black].map(bare).join(","),
    mat, pct(s.pieces.shine), pct(s.pieces.rim),
    bare(s.room.bg),
    [s.marks.select, s.marks.legal, s.marks.capture, s.marks.last, s.marks.check, s.marks.hint].map(bare).join(","),
    s.pieces.set
  ];
  return "SKIN1." + b64u(fields.join("|"));
}

function parsePayload(payload) {
  var raw;
  try { raw = unb64u(payload); } catch (e) { return null; }
  var f = raw.split("|");
  if (f.length !== 13 && f.length !== 14) return null;
  var b = f[3].split(","), p = f[7].split(","), k = f[12].split(",");
  if (b.length !== 5 || p.length !== 2 || k.length !== 6) return null;
  /* every colour must really be a colour — this is also what makes a
     mis-trimmed code fail cleanly instead of yielding a garbage skin */
  var all = b.concat(p, k, [f[11]]);
  for (var i = 0; i < all.length; i++) if (!/^[0-9a-fA-F]{6}$/.test(all[i])) return null;
  return clean({
    name: f[0], maker: f[1], note: f[2],
    board: { light: hash(b[0]), dark: hash(b[1]), rim: hash(b[2]), edge: hash(b[3]), coord: hash(b[4]),
             pattern: PATTERN_ORDER[parseInt(f[4], 10)], grain: unpct(f[5]), gloss: unpct(f[6]) },
    pieces: { white: hash(p[0]), black: hash(p[1]), material: MATERIAL_ORDER[parseInt(f[8], 10)],
              set: setId(f[13], DEFAULT_SET), shine: unpct(f[9]), rim: unpct(f[10]) },
    room: { bg: hash(f[11]) },
    marks: { select: hash(k[0]), legal: hash(k[1]), capture: hash(k[2]),
             last: hash(k[3]), check: hash(k[4]), hint: hash(k[5]) }
  }, "A friend's skin");
}

/* Codes arrive pasted mid-sentence, wrapped across lines, or with a
   full stop stuck to the end. Try the tidy readings first, then chew
   characters off the tail until the payload validates. */
function decode(str) {
  var s = String(str || ""), i, m, got;
  var tokens = s.split(/[\s"'<>()\[\]]+/);
  for (i = 0; i < tokens.length; i++) {
    m = tokens[i].match(/SKIN1\.([A-Za-z0-9_-]+)/);
    if (m && (got = parsePayload(m[1]))) return got;
  }
  m = s.replace(/\s+/g, "").match(/SKIN1\.([A-Za-z0-9_-]+)/);
  if (!m) return null;
  for (var len = m[1].length; len >= 24; len--) {
    if ((got = parsePayload(m[1].slice(0, len)))) return got;
  }
  return null;
}

/* ---------- your gallery (presets + imported + your own) ---------- */
var KEY = "chessroom_skins";
function loadMine() {
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || !raw.list) return [];
    return raw.list.map(function (s) { return clean(s); });
  } catch (e) { return []; }
}
function saveMine(list) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, list: list.slice(0, 40) })); return true; }
  catch (e) { return false; }
}
function addMine(skin) {
  var list = loadMine();
  var s = clean(skin);
  s.id = "own-" + Math.abs(hashOf(encode(s))).toString(36);
  /* the same skin arriving twice shouldn't clutter the shelf */
  list = list.filter(function (x) { return x.id !== s.id; });
  list.unshift(s);
  saveMine(list);
  return s;
}
function hashOf(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return h;
}

/* ---------- surprise me: random, but never ugly ----------
   Colours are drawn on one harmonious hue wheel rather than at random,
   so "randomise" behaves like a designer rather than a paint bomb. */
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  var r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  var to = function (v) { return ("0" + Math.round((v + m) * 255).toString(16)).slice(-2); };
  return "#" + to(r) + to(g) + to(b);
}
function random(rnd) {
  rnd = rnd || Math.random;
  var base = rnd() * 360;
  var accent = base + 150 + rnd() * 60;          /* roughly complementary */
  var dark = rnd() < 0.5;
  var mats = Object.keys(MATERIALS), pats = Object.keys(PATTERNS), sets = Object.keys(PIECE_SETS);
  var mat = mats[Math.floor(rnd() * mats.length)];
  return clean({
    name: "Surprise " + Math.floor(rnd() * 900 + 100),
    maker: "You", note: "Rolled by the dice, kept because you liked it.",
    board: {
      light: hsl(base, 0.28 + rnd() * 0.2, dark ? 0.62 : 0.84),
      dark: hsl(base + (rnd() * 20 - 10), 0.35 + rnd() * 0.25, dark ? 0.28 : 0.46),
      rim: hsl(base, 0.4, dark ? 0.12 : 0.2),
      edge: hsl(base, 0.3, dark ? 0.24 : 0.66),
      coord: hsl(base, 0.35, dark ? 0.7 : 0.28),
      pattern: pats[Math.floor(rnd() * pats.length)],
      grain: rnd(), gloss: rnd()
    },
    pieces: {
      white: hsl(base + 10, 0.18, 0.93),
      black: hsl(accent, 0.35 + rnd() * 0.3, 0.22 + rnd() * 0.16),
      material: mat, set: sets[Math.floor(rnd() * sets.length)],
      shine: 0.25 + rnd() * 0.7, rim: rnd()
    },
    room: { bg: hsl(base, 0.25, 0.06 + rnd() * 0.04) },
    marks: {
      select: hsl(accent + 30, 0.8, 0.62), legal: hsl(accent, 0.55, 0.45),
      capture: hsl(base + 190, 0.7, 0.55), last: hsl(accent + 30, 0.75, 0.68),
      check: hsl(2, 0.75, 0.55), hint: hsl(accent - 20, 0.6, 0.45),
      plan: hsl(base + 200, 0.65, 0.55)
    }
  });
}

var Skins = {
  MATERIALS: MATERIALS, PATTERNS: PATTERNS, PIECE_SETS: PIECE_SETS,
  PRESETS: PRESETS.map(function (p) { return clean(p, p.name); }),
  DEFAULT_ID: "walnut",
  /* the coaches' boards, by level id, in ladder order */
  HOMES: (function () {
    var out = {};
    HOME_LIST.forEach(function (p) { out[p.coach] = clean(p, p.name); });
    return out;
  })(),
  homeOf: function (coachId) {
    return Object.prototype.hasOwnProperty.call(Skins.HOMES, coachId) ? Skins.HOMES[coachId] : null;
  },
  /* which coach a look came from, if it came from one: by id, or by the
     name a share code travels under */
  coachOf: function (s) {
    if (!s) return null;
    for (var i = 0; i < HOME_LIST.length; i++) {
      if (HOME_LIST[i].id === s.id || HOME_LIST[i].name === s.name) return HOME_LIST[i].coach;
    }
    return null;
  },
  clean: clean, clone: clone, surface: surface,
  encode: encode, decode: decode,
  loadMine: loadMine, saveMine: saveMine, addMine: addMine,
  random: random, hsl: hsl, KEY: KEY,
  byId: function (id) {
    var all = Skins.PRESETS.concat(loadMine());
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
};
if (typeof module !== "undefined" && module.exports) module.exports = Skins;
else root.Skins = Skins;
})(typeof self !== "undefined" ? self : this);
