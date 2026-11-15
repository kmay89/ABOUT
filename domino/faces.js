/* faces.js — who is sitting at the table.

   A name on a plate is a label; a face is a person. These are small
   drawn faces — the friendly, round, big-eyed kind, a few shapes each —
   built from a short recipe: skin, hair and its colour, a bigote or a
   beard or neither, something on the head (a sombrero, a cap, a
   bandana, a flower), glasses, a shirt. Twelve thousand or so faces, no
   images, drawn as inline SVG at whatever size the plate wants.

   A recipe comes from a name, so Beto looks like Beto on every phone at
   the table without anybody sending a picture; or it is picked, one
   trait at a time, and travels as a nine-character code with the name.

   Faces also *react*. A mood changes the brows and the mouth: thinking,
   paso, a good play, a grin at one bone left, the big open smile of
   ¡dominó!. The plate asks for the mood, the face does the rest.     */
(function (root) {
"use strict";

var SKIN = ["#f6d3b4", "#e9b98e", "#d19a6b", "#b57a4d", "#8f5a35", "#5f3b22"];
var HAIR_COL = ["#1d140e", "#3b2416", "#6b3f23", "#9b4a2a", "#c98a3a", "#d9c27a", "#8b8b8b", "#e8e4dc"];
var HAIR = ["short", "buzz", "curly", "long", "bun", "bald", "fringe", "pony"];
var BEARD = ["none", "bigote", "goatee", "beard", "none", "bigote", "stubble"];
var HAT = ["none", "none", "sombrero", "cap", "bandana", "flower", "beanie", "none"];
var GLASSES = ["none", "none", "round", "square", "none", "shades"];
var SHIRT = ["#ff2e88", "#ff8c1a", "#ffd23f", "#2dd4c4", "#8be04a", "#a86cf5", "#ff5a3c", "#4f8cff", "#f4e9d8"];
var TRAITS = ["skin", "hair", "hairCol", "beard", "hat", "glasses", "shirt"];
var SIZES = { skin: SKIN.length, hair: HAIR.length, hairCol: HAIR_COL.length, beard: BEARD.length, hat: HAT.length, glasses: GLASSES.length, shirt: SHIRT.length };

function hash(s) {
  var h = 2166136261 >>> 0;
  s = String(s || "");
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function rng(seed) {
  var x = seed >>> 0 || 1;
  return function () { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
function fromSeed(s) {
  var r = rng(hash(s) ^ 0x9e3779b9), spec = {};
  TRAITS.forEach(function (t) { spec[t] = Math.floor(r() * SIZES[t]); });
  /* the lower-case version of a name is the same person */
  return spec;
}
function random() { return fromSeed(String(Math.random()) + Date.now()); }
function clean(spec) {
  var out = {};
  TRAITS.forEach(function (t) {
    var v = spec && typeof spec[t] === "number" ? Math.floor(spec[t]) : 0;
    out[t] = ((v % SIZES[t]) + SIZES[t]) % SIZES[t];
  });
  return out;
}
/* F1. followed by one digit per trait — fits beside a name in any message */
function encode(spec) {
  var s = clean(spec);
  return "F1." + TRAITS.map(function (t) { return String(s[t]); }).join("");
}
function decode(str) {
  if (typeof str !== "string") return null;
  var m = str.match(/^F1\.(\d{7})$/);
  if (!m) return null;
  var spec = {};
  TRAITS.forEach(function (t, i) { spec[t] = parseInt(m[1].charAt(i), 10); });
  return clean(spec);
}
/* step one trait along — the picker's "another hat" */
function mutate(spec, trait, step) {
  var s = clean(spec);
  if (SIZES[trait]) s[trait] = (s[trait] + (step || 1) + SIZES[trait]) % SIZES[trait];
  return s;
}
/* the face for a seat: a code if one came with the name, else the name */
function forName(name, code) {
  return decode(code) || fromSeed(String(name || "").trim().toLowerCase());
}

/* ---------- drawing ----------
   A 100×100 box, face centred a little low, everything in a few
   strokes. `mood` is one of: calm think paso happy grin ouch party. */
function svg(spec, mood, px, opts) {
  var s = clean(spec); mood = mood || "calm"; opts = opts || {};
  var skin = SKIN[s.skin], hair = HAIR_COL[s.hairCol], hs = HAIR[s.hair], bd = BEARD[s.beard], hat = HAT[s.hat], gl = GLASSES[s.glasses];
  var shirt = SHIRT[s.shirt];
  var dark = "#2a1a10";
  var o = [];
  o.push("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='" + (px || 40) + "' height='" + (px || 40) + "' aria-hidden='true'>");
  if (opts.bg !== false) o.push("<circle cx='50' cy='50' r='50' fill='" + (opts.bg || "#3a2a20") + "'/>");
  o.push("<clipPath id='c" + (opts.id || "f") + "'><circle cx='50' cy='50' r='50'/></clipPath><g clip-path='url(#c" + (opts.id || "f") + ")'>");
  /* shirt */
  o.push("<path d='M14 104 C14 78 30 72 50 72 C70 72 86 78 86 104 Z' fill='" + shirt + "'/>");
  o.push("<path d='M40 72 L50 84 L60 72' fill='none' stroke='" + dark + "' stroke-width='2.5' stroke-linejoin='round' opacity='.5'/>");
  /* neck */
  o.push("<rect x='41' y='60' width='18' height='16' rx='6' fill='" + shade(skin, 0.85) + "'/>");
  /* hair behind the head */
  if (hs === "long") o.push("<path d='M24 44 C20 70 22 86 26 92 L74 92 C78 86 80 70 76 44 Z' fill='" + hair + "'/>");
  if (hs === "pony") o.push("<path d='M70 40 C84 44 86 64 78 78 C76 66 72 58 66 54 Z' fill='" + hair + "'/>");
  if (hs === "curly") o.push("<circle cx='26' cy='48' r='9' fill='" + hair + "'/><circle cx='74' cy='48' r='9' fill='" + hair + "'/>");
  /* ears */
  o.push("<circle cx='25' cy='50' r='6' fill='" + skin + "'/><circle cx='75' cy='50' r='6' fill='" + skin + "'/>");
  /* head */
  o.push("<path d='M28 36 C28 20 72 20 72 36 C74 54 70 70 50 70 C30 70 26 54 28 36 Z' fill='" + skin + "'/>");
  /* cheeks */
  var blush = (mood === "happy" || mood === "grin" || mood === "party") ? 0.35 : 0.18;
  o.push("<circle cx='35' cy='54' r='5' fill='#ff7a7a' opacity='" + blush + "'/><circle cx='65' cy='54' r='5' fill='#ff7a7a' opacity='" + blush + "'/>");
  /* hair on top */
  if (hs === "short") o.push("<path d='M28 40 C26 24 40 18 50 20 C62 18 74 24 72 40 C66 32 58 30 50 30 C42 30 34 32 28 40 Z' fill='" + hair + "'/>");
  else if (hs === "buzz") o.push("<path d='M29 36 C30 24 42 20 50 21 C58 20 70 24 71 36 C64 30 56 28 50 28 C44 28 36 30 29 36 Z' fill='" + hair + "' opacity='.85'/>");
  else if (hs === "curly") o.push("<path d='M26 42 C22 24 34 14 50 17 C66 14 78 24 74 42 C72 34 64 30 50 30 C36 30 28 34 26 42 Z' fill='" + hair + "'/><circle cx='36' cy='22' r='6' fill='" + hair + "'/><circle cx='50' cy='17' r='6' fill='" + hair + "'/><circle cx='64' cy='22' r='6' fill='" + hair + "'/>");
  else if (hs === "long") o.push("<path d='M26 44 C24 22 40 16 50 18 C60 16 76 22 74 44 C70 34 62 31 50 31 C38 31 30 34 26 44 Z' fill='" + hair + "'/>");
  else if (hs === "bun") o.push("<circle cx='50' cy='17' r='9' fill='" + hair + "'/><path d='M28 38 C28 24 40 19 50 20 C60 19 72 24 72 38 C66 32 58 30 50 30 C42 30 34 32 28 38 Z' fill='" + hair + "'/>");
  else if (hs === "fringe") o.push("<path d='M28 42 C26 22 40 17 50 19 C60 17 74 22 72 42 L66 34 L60 40 L54 32 L46 40 L40 32 L34 40 Z' fill='" + hair + "'/>");
  else if (hs === "pony") o.push("<path d='M28 40 C28 22 42 18 50 19 C58 18 72 22 72 40 C66 32 58 30 50 30 C42 30 34 32 28 40 Z' fill='" + hair + "'/>");
  /* bald: nothing, but a little shine */
  if (hs === "bald") o.push("<ellipse cx='42' cy='28' rx='6' ry='3' fill='#fff' opacity='.35'/>");

  /* brows and eyes, by mood */
  var browL, browR, eyeY = 44, eyeR = 3.6, eyeDX = 0;
  if (mood === "think") { browL = "M33 36 L43 35"; browR = "M57 31 L67 34"; eyeDX = -2; }
  else if (mood === "paso") { browL = "M33 33 L43 38"; browR = "M57 38 L67 33"; }
  else if (mood === "ouch") { browL = "M33 33 L43 31"; browR = "M57 31 L67 33"; eyeR = 4.4; }
  else if (mood === "party" || mood === "grin") { browL = "M33 34 L43 32"; browR = "M57 32 L67 34"; }
  else { browL = "M33 35 L43 34"; browR = "M57 34 L67 35"; }
  o.push("<path d='" + browL + "' stroke='" + (hs === "bald" || s.hairCol === 7 ? "#5a4030" : hair) + "' stroke-width='3' stroke-linecap='round' fill='none'/>");
  o.push("<path d='" + browR + "' stroke='" + (hs === "bald" || s.hairCol === 7 ? "#5a4030" : hair) + "' stroke-width='3' stroke-linecap='round' fill='none'/>");
  if (gl === "shades") {
    o.push("<rect x='29' y='38' width='18' height='11' rx='4' fill='#1a1412'/><rect x='53' y='38' width='18' height='11' rx='4' fill='#1a1412'/><path d='M47 42 L53 42' stroke='#1a1412' stroke-width='2'/>");
  } else if (mood === "happy" || mood === "party") {
    /* closed happy eyes */
    o.push("<path d='M34 45 Q38 40 42 45' stroke='" + dark + "' stroke-width='2.6' fill='none' stroke-linecap='round'/>");
    o.push("<path d='M58 45 Q62 40 66 45' stroke='" + dark + "' stroke-width='2.6' fill='none' stroke-linecap='round'/>");
  } else {
    o.push("<circle cx='" + (38 + eyeDX) + "' cy='" + eyeY + "' r='" + eyeR + "' fill='" + dark + "'/><circle cx='" + (62 + eyeDX) + "' cy='" + eyeY + "' r='" + eyeR + "' fill='" + dark + "'/>");
    o.push("<circle cx='" + (39.4 + eyeDX) + "' cy='" + (eyeY - 1.4) + "' r='1.2' fill='#fff'/><circle cx='" + (63.4 + eyeDX) + "' cy='" + (eyeY - 1.4) + "' r='1.2' fill='#fff'/>");
  }
  if (gl === "round") o.push("<circle cx='38' cy='44' r='8' fill='none' stroke='" + dark + "' stroke-width='2'/><circle cx='62' cy='44' r='8' fill='none' stroke='" + dark + "' stroke-width='2'/><path d='M46 44 L54 44' stroke='" + dark + "' stroke-width='2'/>");
  if (gl === "square") o.push("<rect x='30' y='37' width='16' height='13' rx='3' fill='none' stroke='" + dark + "' stroke-width='2'/><rect x='54' y='37' width='16' height='13' rx='3' fill='none' stroke='" + dark + "' stroke-width='2'/><path d='M46 43 L54 43' stroke='" + dark + "' stroke-width='2'/>");
  /* nose */
  o.push("<path d='M50 47 L47 55 L52 55' stroke='" + shade(skin, 0.7) + "' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/>");
  /* mouth */
  var mouth;
  if (mood === "grin" || mood === "party") mouth = "<path d='M38 58 Q50 72 62 58 Z' fill='#5a1a1a'/><path d='M41 58.5 L59 58.5 L57 62 Q50 64 43 62 Z' fill='#fff'/>";
  else if (mood === "happy") mouth = "<path d='M40 59 Q50 68 60 59' stroke='" + dark + "' stroke-width='2.6' fill='none' stroke-linecap='round'/>";
  else if (mood === "paso") mouth = "<path d='M41 63 Q50 57 59 63' stroke='" + dark + "' stroke-width='2.6' fill='none' stroke-linecap='round'/>";
  else if (mood === "think") mouth = "<path d='M43 61 L57 60' stroke='" + dark + "' stroke-width='2.6' fill='none' stroke-linecap='round'/>";
  else if (mood === "ouch") mouth = "<ellipse cx='50' cy='61' rx='4.5' ry='5.5' fill='#5a1a1a'/>";
  else mouth = "<path d='M43 60 Q50 64 57 60' stroke='" + dark + "' stroke-width='2.6' fill='none' stroke-linecap='round'/>";
  o.push(mouth);
  /* facial hair, over the mouth */
  if (bd === "bigote") o.push("<path d='M36 56 Q43 50 50 55 Q57 50 64 56 Q57 58 50 57 Q43 58 36 56 Z' fill='" + hair + "'/>");
  else if (bd === "goatee") o.push("<path d='M43 64 Q50 74 57 64 Q50 68 43 64 Z' fill='" + hair + "'/>");
  else if (bd === "beard") o.push("<path d='M28 46 C30 62 36 70 50 71 C64 70 70 62 72 46 C66 60 60 56 50 66 C40 56 34 60 28 46 Z' fill='" + hair + "' opacity='.95'/>");
  else if (bd === "stubble") o.push("<path d='M31 52 C34 66 40 70 50 70 C60 70 66 66 69 52 C64 62 56 64 50 64 C44 64 36 62 31 52 Z' fill='" + hair + "' opacity='.28'/>");
  /* what is on the head */
  if (hat === "sombrero") o.push("<ellipse cx='50' cy='30' rx='42' ry='8' fill='#c9a24f'/><path d='M34 30 C34 12 66 12 66 30 Z' fill='#d9b45f'/><path d='M34 30 C40 26 60 26 66 30' stroke='#8a2a2a' stroke-width='3' fill='none'/><ellipse cx='50' cy='30' rx='42' ry='8' fill='none' stroke='#a3813a' stroke-width='2'/>");
  else if (hat === "cap") o.push("<path d='M28 34 C28 18 72 18 72 34 Z' fill='#2b6cb0'/><path d='M26 34 L84 34 L82 38 L28 38 Z' fill='#1f4e80'/>");
  else if (hat === "bandana") o.push("<path d='M27 36 C27 20 73 20 73 36 C66 31 56 30 50 30 C44 30 34 31 27 36 Z' fill='#d63a3a'/><path d='M70 34 L84 40 L74 42 Z' fill='#d63a3a'/>");
  else if (hat === "flower") o.push("<circle cx='68' cy='26' r='6' fill='#ff8c1a'/><circle cx='68' cy='26' r='2.5' fill='#ffd23f'/><circle cx='62' cy='22' r='3.5' fill='#ff8c1a'/><circle cx='74' cy='22' r='3.5' fill='#ff8c1a'/>");
  else if (hat === "beanie") o.push("<path d='M28 36 C28 16 72 16 72 36 Z' fill='#8be04a'/><rect x='27' y='32' width='46' height='7' rx='3' fill='#6cb236'/>");
  o.push("</g></svg>");
  return o.join("");
}
function shade(hex, k) {
  var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return "rgb(" + Math.round(r * k) + "," + Math.round(g * k) + "," + Math.round(b * k) + ")";
}

var Faces = {
  TRAITS: TRAITS, SIZES: SIZES, MOODS: ["calm", "think", "paso", "happy", "grin", "ouch", "party"],
  fromSeed: fromSeed, random: random, clean: clean, encode: encode, decode: decode,
  mutate: mutate, forName: forName, svg: svg
};
if (typeof module !== "undefined" && module.exports) module.exports = Faces;
else root.Faces = Faces;
})(typeof self !== "undefined" ? self : this);
