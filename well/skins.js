/* skins.js — what the pieces are made of, as data.

   A skin is a palette and a material: seven colours, one for each piece,
   and a handful of numbers that say how light behaves on them. Both
   renderers read the same object. The WebGL well feeds the numbers to one
   shader as uniforms ("studio jelly": a GGX highlight, a painted studio
   environment and a Fresnel rim), so a skin is never a separate program;
   the Canvas2D well bakes the same numbers into its tiles once, when the
   skin is chosen, and then only copies pixels. Neither renderer has to
   guess what the other meant by "glassy".

   ## Why these colours, and not the ones everybody knows

   The colours are ours on purpose. The classic genre palette belongs to
   somebody else's game, and it is also genuinely bad for colour-blind
   players: under deuteranopia and protanopia its closest pair is only
   about 6 or 7 ΔE apart. Every
   palette here went through the palette lint that tools/ runs on every
   skin (brief §7.3):

     1. at most two of the seven pieces may sit within 30° of the classic
        hue for the same piece while also being more than 50% saturated;
     2. no colour may be a saturated red — the share of red in the
        *linearised* colour, R / (R + G + B), stays under 0.75, so no large
        effect can ever turn into a red flash;
     3. the closest two colours are at least 18 ΔE apart for normal
        vision and at least 8 under each of the three colour-vision
        simulations (12 for Ink and the colour-safe palette).

   The minimum separations each skin reaches are kept beside it below, so
   a hand edit that breaks one shows up as a number that no longer
   matches, rather than as a player who can no longer tell S from Z.

   ## Shape first, colour second

   Colour never carries meaning on its own here. Every piece also has a
   glyph — a small inner motif, the same in every cell of that piece — and
   the player can turn glyphs on in any skin. Two skins insist on them:
   Ink, the high-contrast skin, and Moonlight, which paints every piece the
   same pale silver so that identity comes from shape and glyph alone. The
   colour-safe palette, derived from Okabe and Ito's, can replace any
   skin's colours while keeping its material.

   ## Material numbers

     rough      0 is a mirror, 1 is chalk: the width of the highlight
     rim        how much a grazing edge lights up (Fresnel)
     emissive   light the piece gives off by itself (paper lanterns)
     refract    how far the backdrop bends through the piece (glass);
                the 2D well reads it as how translucent the body is
     sss        light scattered under the surface, lifting the interior
     speckle    fine mineral grain (stone)
     fibre      paper fibre showing in the glow (lanterns)
     unlit      flat fills, no shading at all (Ink)
     outline    a light line round each piece's outer edge (Ink)
     bloomCap   the most bloom this skin may ever receive
     grade      a per-skin colour grade after tone mapping: lift, gamma
                and gain, each [r, g, b], neutral at [0,0,0] / [1,1,1] /
                [1,1,1]

   Pure data: no window, no document, no clock, so tools/ can lint every
   palette in node exactly as the page uses it.                          */
(function (root) {
"use strict";

var NAMES = ["I", "O", "T", "S", "Z", "J", "L"];

/* a neutral grade, written out each time rather than shared, so a renderer
   that adjusts one skin's grade in place can never leak into another */
function grade(lift, gamma, gain) {
  return { lift: lift || [0, 0, 0], gamma: gamma || [1, 1, 1], gain: gain || [1, 1, 1] };
}

/* the single silver every Moonlight piece shares */
var MOON = "#C9D6EA";

var list = [
  {
    id: "seaglass", name: "Sea Glass", default: true,
    line: "Frosted glass, worn soft by the sea, with the light caught inside it.",
    colors: { I: "#F2C36B", O: "#4E6FD0", T: "#3FA58A", S: "#F09AB0", Z: "#7FD3EA", J: "#B5DB86", L: "#B9A3F0" },
    /* silt is sediment: a cool grey-green slate, darker than any piece so
       a row of it never reads as a row of pieces */
    silt: "#56636A",
    mono: false,
    mat: { rough: 0.30, rim: 0.70, emissive: 0.05, refract: 0.02, sss: 0.15, speckle: 0, fibre: 0,
           unlit: false, outline: false, bloomCap: 1,
           grade: grade([0.000, 0.004, 0.010], [1, 1, 1], [1, 1, 1.01]) },
    glyphs: "off",
    deltaE: { normal: 29.3, deutan: 14.7, protan: 9.3, tritan: 17.1 }
  },
  {
    id: "riverstone", name: "River Stone",
    line: "Polished pebbles from a cold river, with the grain still in them.",
    colors: { I: "#C97A57", O: "#5E7BA6", T: "#9DBB8E", S: "#8C5E86", Z: "#D9B86A", J: "#E9DDC4", L: "#4F8F8C" },
    silt: "#5E5850",
    mono: false,
    mat: { rough: 0.55, rim: 0.20, emissive: 0, refract: 0, sss: 0, speckle: 0.5, fibre: 0,
           unlit: false, outline: false, bloomCap: 0.7,
           grade: grade([0.008, 0.006, 0.003], [1, 1, 1], [0.99, 0.98, 0.97]) },
    glyphs: "off",
    deltaE: { normal: 25.1, deutan: 9.0, protan: 10.5, tritan: 11.0 }
  },
  {
    id: "jelly", name: "Jelly",
    line: "Glossy sweets with the light glowing through them.",
    colors: { I: "#FF9F6B", O: "#4F6FEF", T: "#5FE0B0", S: "#FF7FB5", Z: "#9AF0FF", J: "#D8F58C", L: "#C9A8FF" },
    silt: "#5C5870",
    mono: false,
    mat: { rough: 0.35, rim: 0.60, emissive: 0.10, refract: 0, sss: 0.60, speckle: 0, fibre: 0,
           unlit: false, outline: false, bloomCap: 1,
           grade: grade([0, 0, 0], [1, 1, 1], [1.02, 1.01, 1.01]) },
    glyphs: "off",
    deltaE: { normal: 37.6, deutan: 11.5, protan: 22.8, tritan: 12.6 }
  },
  {
    id: "lantern", name: "Paper Lantern",
    line: "Warm paper, lit from inside, with the fibres showing in the glow.",
    colors: { I: "#F7A35C", O: "#4D6CD4", T: "#46A984", S: "#FFA9BC", Z: "#FFEAB0", J: "#D9C2FF", L: "#9BE6F2" },
    silt: "#62564F",
    mono: false,
    mat: { rough: 0.40, rim: 0.30, emissive: 0.80, refract: 0, sss: 0.40, speckle: 0, fibre: 0.5,
           unlit: false, outline: false, bloomCap: 1,
           grade: grade([0.010, 0.005, 0.000], [1, 1, 1], [1.03, 1.0, 0.96]) },
    glyphs: "off",
    deltaE: { normal: 33.9, deutan: 11.3, protan: 16.3, tritan: 12.1 }
  },
  {
    id: "ink", name: "Ink",
    line: "Solid colour and a clean light edge. The clearest skin there is.",
    colors: { I: "#FFB000", O: "#2F6BFF", T: "#3DDC97", S: "#FF7AB6", Z: "#C8F4FF", J: "#FFF27A", L: "#D7B8FF" },
    silt: "#7C8494",
    mono: false,
    /* unlit fills, a 2 px light outline round each piece's outer edge, no
       glass and almost no bloom: nothing here may soften an edge */
    mat: { rough: 1, rim: 0, emissive: 0, refract: 0, sss: 0, speckle: 0, fibre: 0,
           unlit: true, outline: true, bloomCap: 0.3,
           grade: grade() },
    glyphs: "strong",
    deltaE: { normal: 40.0, deutan: 20.5, protan: 21.4, tritan: 19.8 }
  },
  {
    id: "moonlight", name: "Moonlight",
    line: "One pale silver for every piece. You tell them apart by shape.",
    colors: { I: MOON, O: MOON, T: MOON, S: MOON, Z: MOON, J: MOON, L: MOON },
    silt: "#5A6474",
    mono: true,
    mat: { rough: 0.45, rim: 0.50, emissive: 0.05, refract: 0, sss: 0.10, speckle: 0, fibre: 0,
           unlit: false, outline: false, bloomCap: 0.8,
           grade: grade([0.000, 0.004, 0.012], [1, 1, 1], [0.97, 0.99, 1.03]) },
    /* identity comes from shape and glyph, so the glyphs are not optional */
    glyphs: "strong",
    deltaE: null
  }
];

/* The colour-safe palette (brief §7.4): Okabe–Ito, permuted away from the
   classic mapping so no piece wears its old colour, and the vermillion
   softened to an orange that stays under the red limit once linearised
   (Okabe–Ito's own #D55E00 scores 0.86 — far over). Min ΔE 25.2 normal,
   15.9 / 20.4 / 12.5 under deuteranopia / protanopia / tritanopia. */
var SAFE = { I: "#DE8A4E", O: "#56B4E9", T: "#F0E442", S: "#CC79A7", Z: "#009E73", J: "#B8860B", L: "#0072B2" };

/* The glyph each piece carries in every one of its cells, so the shape of
   a piece can be read from any single cell of it. */
var GLYPHS = { I: "lines", O: "dot", T: "triangle", S: "slash", Z: "backslash", J: "bracket", L: "bracketR" };

var byId = {};
var ids = [];
var i;
for (i = 0; i < list.length; i++) { byId[list[i].id] = list[i]; ids.push(list[i].id); }

var GLYPH_RANK = { off: 0, subtle: 1, strong: 2 };
var GLYPH_NAME = ["off", "subtle", "strong"];

var Skins = {
  list: list,
  ids: ids,
  NAMES: NAMES,
  SAFE: SAFE,
  GLYPHS: GLYPHS,
  MOON: MOON,

  /* an unknown id falls back to the default skin rather than failing: a
     stored preference from a newer version should never cost a game */
  get: function (id) {
    if (id && typeof id === "object" && id.colors) return id;
    return byId[id] || list[0];
  },

  /* The colours that are actually drawn: {I,O,T,S,Z,J,L, silt}.
     The colour-safe palette replaces a skin's piece colours and keeps its
     material and its silt; on Moonlight it brings colour back, because a
     player who asked for the colour-safe palette asked for colour. */
  resolve: function (skin, palette) {
    var s = Skins.get(skin);
    var src = palette === "safe" ? SAFE : s.colors;
    var out = {};
    for (var k = 0; k < NAMES.length; k++) out[NAMES[k]] = src[NAMES[k]];
    out.silt = s.silt;
    return out;
  },

  /* The glyph strength actually drawn: the player's choice, raised to the
     skin's own floor. Ink and Moonlight carry "strong" as that floor, so
     they always show glyphs; every other skin starts at "off" and does
     whatever the player asked. */
  glyphs: function (skin, pref) {
    var s = Skins.get(skin);
    var a = GLYPH_RANK[pref] || 0, b = GLYPH_RANK[s.glyphs] || 0;
    return GLYPH_NAME[a > b ? a : b];
  },

  /* piece type (1..7, or "I".."L") to its letter; 8 (silt) and anything
     else to "" */
  letter: function (type) {
    if (typeof type === "string") return NAMES.indexOf(type) >= 0 ? type : "";
    return (type >= 1 && type <= 7) ? NAMES[type - 1] : "";
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = Skins;
else root.Skins = Skins;
})(typeof self !== "undefined" ? self : this);
