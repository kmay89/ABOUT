/* worlds.js — the ten worlds, as data.

   A world is everything that is not the game: the colour of the sky, the
   light the pieces are lit by, the stone the well is cut from, the
   particles a clear dissolves into, and what the backdrop does when you
   clear four rows at once. The rules never change from world to world and
   neither do the pieces — their colours belong to the skin, so an S is the
   same S at Dawn and at the bottom of the Starfield. A world only tints the
   key and rim light that falls on them. That is what lets ten worlds feel
   different without the player ever having to relearn a colour.

   This file is the single source for that identity. sky.js paints from it
   (and reads motion straight out of it, so the shader and the Canvas2D
   painter can never disagree about how fast a world moves), both renderers
   tint their lights and walls from it, and the particles take their kind,
   colour and drift from it. Music lives in music.js: what a world sounds
   like is a different table with a different owner, and keeping the two
   apart means neither can quietly grow a dependency on the other.

   ## Why the skies are so dark

   Every sky here has a relative luminance of 0.05 or less, at both ends of
   its gradient (tools/well-check.js asks Sky.luma). That is a safety
   number before it is a mood. The flash rules care about *changes* in
   luminance across a large area, and a dark backdrop is what keeps a
   crossfade between two worlds, or a world answering a Quad, an order of
   magnitude below anything that could count as a flash. The light in these
   scenes comes from small things — a sun low on the horizon, a lantern far
   away — never from the sky itself.

   ## The fields

     sky.top, sky.horizon   the backdrop gradient, sRGB hex, top of the
                            screen to the horizon
     key, rim               the light on the pieces and the well
     wall                   the stone (or wood, or glass) the well is cut from
     particle               what a clear dissolves into: a kind the renderers
                            know how to draw, its colour, dir (+1 rises,
                            -1 falls), drift (0 straight, 1 wanders) and
                            size (0 dust, 1 the largest the kind allows)
     quad                   what the backdrop does for a Quad, in words —
                            the shader in sky.js is the same sentence in GLSL
     motion                 how fast this world's backdrop moves, 0..1. The
                            player's motion setting multiplies it; it never
                            makes a world faster than its design.

   Order matters: it is the Descent, from the surface to the floor of the
   well, and the index into this list is the world number the backdrop
   shader is given. Pure data — no window, no document, no clock — so it
   loads in node for the checks exactly as it loads in the page.         */
(function (root) {
"use strict";

var list = [
  {
    id: "dawn", n: 1, name: "Dawn",
    line: "Mist lifting off still water, and a pale sun low on the edge of the sky.",
    sky: { top: "#141833", horizon: "#4A3552" },
    key: "#FFE2C4", rim: "#9FB4FF", wall: "#8C7B6A",
    particle: { kind: "mote", color: "#F2C9A0", dir: 1, drift: 0.3, size: 0.35 },
    quad: "The mist parts for one breath.",
    motion: 0.8
  },
  {
    id: "tide", n: 2, name: "Tide",
    line: "Light crawling over sea-glass stone, rising and falling with the swell.",
    sky: { top: "#081C26", horizon: "#15414C" },
    key: "#DFF7FF", rim: "#5FD1C9", wall: "#4E6E68",
    particle: { kind: "bubble", color: "#BFF3EE", dir: 1, drift: 0.15, size: 0.5 },
    quad: "One slow ring of light rolls across the surface.",
    motion: 0.85
  },
  {
    id: "rain", n: 3, name: "Rain on Leaves",
    line: "Soft rain through dark leaves, close enough to hear every drop.",
    sky: { top: "#0B1813", horizon: "#1E3A2B" },
    key: "#E8F2E2", rim: "#7FBF9A", wall: "#4F5E4A",
    /* the brief gives droplets no colour of their own; this is the key
       light seen through water, so a drop reads as lit rain, not as ink */
    particle: { kind: "drop", color: "#D6EDE0", dir: -1, drift: 0.05, size: 0.3 },
    quad: "The leaves shed a shower of droplets.",
    motion: 0.85
  },
  {
    id: "bamboo", n: 4, name: "Bamboo Grove",
    line: "Tall stalks leaning in a slow wind, with the light coming through.",
    sky: { top: "#0E1A14", horizon: "#2A4430" },
    key: "#F4F0D6", rim: "#A8D08D", wall: "#6E7A4E",
    particle: { kind: "leaf", color: "#E3E8B0", dir: -1, drift: 0.7, size: 0.55 },
    quad: "Wind ripples through the stalks, and the chimes ring.",
    motion: 0.75
  },
  {
    id: "aurora", n: 5, name: "Aurora",
    line: "Slow ribbons of green and violet over a sky of still stars.",
    sky: { top: "#060A1A", horizon: "#102038" },
    key: "#E6F0FF", rim: "#7DF5C2", wall: "#6F8FA8",
    particle: { kind: "spark", color: "#B6FFD9", dir: 1, drift: 0.5, size: 0.3 },
    quad: "A ribbon unfurls once across the sky.",
    motion: 0.6
  },
  {
    id: "moonpool", n: 6, name: "Moon Pool",
    line: "Moonlight reaching down through deep, still water.",
    sky: { top: "#04080F", horizon: "#0A1A2C" },
    key: "#CFE0FF", rim: "#6FA8FF", wall: "#2E3A48",
    particle: { kind: "plankton", color: "#8FF0FF", dir: 1, drift: 0.35, size: 0.25 },
    quad: "The moon's reflection at the bottom brightens for one breath.",
    motion: 0.6
  },
  {
    id: "lanterns", n: 7, name: "Lanterns",
    line: "Paper lanterns rising far away, warm against the night.",
    sky: { top: "#140C17", horizon: "#33202B" },
    key: "#FFE4C0", rim: "#FFB08A", wall: "#5A3A30",
    particle: { kind: "flake", color: "#FFD7A0", dir: 1, drift: 0.25, size: 0.45 },
    quad: "A cluster of lanterns lifts together.",
    motion: 0.7
  },
  {
    id: "snowfall", n: 8, name: "Snowfall",
    line: "Snow coming down slowly, in no hurry to arrive.",
    sky: { top: "#121824", horizon: "#343F52" },
    key: "#F2F6FF", rim: "#B8CCFF", wall: "#7E8898",
    particle: { kind: "snow", color: "#F4F8FF", dir: -1, drift: 0.4, size: 0.6 },
    quad: "The snow pauses in the air for a beat.",
    motion: 0.75
  },
  {
    id: "bells", n: 9, name: "Mountain Bells",
    line: "Mist between the ridges, and a bell somewhere far off.",
    sky: { top: "#13141C", horizon: "#363545" },
    key: "#F6EEE6", rim: "#C8B8E8", wall: "#6A6870",
    particle: { kind: "petal", color: "#F3D9E6", dir: -1, drift: 0.6, size: 0.5 },
    quad: "A bell ring expands across the mist.",
    motion: 0.55
  },
  {
    id: "starfield", n: 10, name: "Starfield",
    line: "The bottom of the well: still water holding a slowly turning sky.",
    sky: { top: "#020309", horizon: "#0A0E28" },
    key: "#E8ECFF", rim: "#9AA8FF", wall: "#1C2030",
    particle: { kind: "star", color: "#FFF6D8", dir: 1, drift: 0.1, size: 0.3 },
    /* "falling", not the other word: the copy rules keep that verb out of
       everything the player reads, and a star does both anyway */
    quad: "A falling star crosses the reflection.",
    motion: 0.45
  }
];

var byId = {};
var ids = [];
for (var i = 0; i < list.length; i++) {
  byId[list[i].id] = list[i];
  ids.push(list[i].id);
}

var Worlds = {
  list: list,
  ids: ids,
  /* an unknown id is a bug somewhere upstream, but a backdrop is not worth
     stopping the game for: fall back to the surface */
  get: function (id) { return byId[id] || list[0]; },
  /* Descent depth 1..10 to the world at that depth; anything outside the
     range is clamped rather than wrapped, so a depth counter that runs
     past ten stays at the bottom of the well instead of jumping to Dawn */
  at: function (depth) {
    var d = Math.floor(+depth || 1);
    if (d < 1) d = 1;
    if (d > list.length) d = list.length;
    return list[d - 1];
  },
  /* the position in list, which is the number the backdrop shader takes
     (uA / uB); -1 for an id that is not a world */
  index: function (id) {
    var w = byId[id];
    return w ? w.n - 1 : -1;
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = Worlds;
else root.Worlds = Worlds;
})(typeof self !== "undefined" ? self : this);
