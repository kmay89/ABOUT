/* art.js — every pixel in the game, painted by code.

   No image files: the tiles, the people, the house and the shed are drawn
   into small canvases once, at load, from a few rules each, with a seeded
   hash for the variation that makes grass look like grass. The look is a
   warm sixteen-pixel top-down: outlined people, soft dithered light, and a
   palette that starts at a hundred degrees and ends under the stars.

   Wren is drawn with no gendered cue at all — short untidy hair, a faded
   teal tee, jeans, sandals — and most of the time from behind or above,
   the way the cover shows the figure. */
(function () {
  "use strict";
  var BS = window.BS = window.BS || {};
  var TL = BS.TL, H = BS.hash, T = 16;

  function cv(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  BS.cv = cv;
  function px(x, c, X, Y, w, h) { x.fillStyle = c; x.fillRect(X, Y, w || 1, h || 1); }
  function mix(a, b, t) {
    var A = hex(a), B = hex(b);
    return "rgb(" + Math.round(A[0] + (B[0] - A[0]) * t) + "," + Math.round(A[1] + (B[1] - A[1]) * t) + "," + Math.round(A[2] + (B[2] - A[2]) * t) + ")";
  }
  function hex(c) {
    if (c[0] === "r") { var m = c.match(/\d+/g); return [+m[0], +m[1], +m[2]]; }
    var n = parseInt(c.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  BS.mix = mix; BS.hex = hex;
  function pick(arr, r) { return arr[Math.floor(r * arr.length) % arr.length]; }

  /* ---------------- ground tiles ---------------- */
  var P = {
    field: ["#b5a95a", "#a99d50", "#c2b768", "#9d9247"],
    long: ["#c9bc6c", "#b3a75a", "#d8cc7e", "#a1964c"],
    garden: ["#86a84e", "#7a9c46", "#93b35a", "#6f9040"],
    road: ["#bba27a", "#ae9670", "#c6ae86", "#a38b65"],
    litter: ["#5a5131", "#4e4a2b", "#665a36", "#45412a", "#6b5a3a"],
    wood: ["#2b3320", "#262e1d", "#313a24"],
    sand: ["#d8c89e", "#ccbc92", "#e2d3aa", "#c3b388"],
    stone: ["#4a4a44", "#43433e", "#504f49", "#3d3d38"],
    floor: ["#8c6744", "#82603f", "#93704b"],
    kfloor: ["#c8bfa8", "#bcb39c"],
    sfloor: ["#6e5a40", "#655238", "#776247"]
  };

  function speckle(x, tx, ty, pal, seed, density) {
    for (var i = 0; i < 16; i++) for (var j = 0; j < 16; j++) {
      var r = H(tx * 16 + i, ty * 16 + j, seed);
      if (r < density) px(x, pick(pal, H(i, j, seed + tx * 7 + ty)), i, j);
    }
  }
  function base(x, c) { px(x, c, 0, 0, 16, 16); }
  function blades(x, tx, ty, cols, n, tall, seed) {
    for (var k = 0; k < n; k++) {
      var bx = Math.floor(H(tx, ty, seed + k) * 16), by = Math.floor(H(ty, tx, seed + k * 3) * 16);
      var h = 1 + Math.floor(H(tx + k, ty, seed) * tall);
      px(x, pick(cols, H(k, tx, ty)), bx, by - h + 1, 1, h);
    }
  }

  var paint = {};
  paint[TL.FIELD] = function (x, tx, ty) {
    base(x, P.field[0]); speckle(x, tx, ty, P.field, 1, 0.5);
    blades(x, tx, ty, ["#d6c97a", "#8f8640", "#c4b765"], 9, 3, 2);
  };
  paint[TL.LONG] = function (x, tx, ty) {
    base(x, P.long[1]); speckle(x, tx, ty, P.long, 3, 0.55);
    blades(x, tx, ty, ["#e4d78c", "#9d9146", "#cfc273", "#857a3b"], 18, 6, 4);
  };
  paint[TL.GARDEN] = function (x, tx, ty) {
    base(x, P.garden[0]); speckle(x, tx, ty, P.garden, 5, 0.5);
    blades(x, tx, ty, ["#9fbf63", "#5f8237"], 6, 2, 6);
    if (H(tx, ty, 77) > 0.93) { px(x, "#f4efe0", 6, 7); px(x, "#f4efe0", 8, 7); px(x, "#f4efe0", 7, 6); px(x, "#f4efe0", 7, 8); px(x, "#f3c94d", 7, 7); }
  };
  paint[TL.ROAD] = paint[TL.LANE] = function (x, tx, ty) {
    base(x, P.road[0]); speckle(x, tx, ty, P.road, 7, 0.6);
    for (var k = 0; k < 3; k++) px(x, "#8e7a58", Math.floor(H(tx, ty, 8 + k) * 15), Math.floor(H(ty, tx, 8 + k) * 15), 2, 1);
  };
  paint[TL.LITTER] = paint[TL.DEER] = paint[TL.ROOT] = function (x, tx, ty) {
    base(x, P.litter[0]); speckle(x, tx, ty, P.litter, 9, 0.75);
    for (var k = 0; k < 4; k++) {
      var lx = Math.floor(H(tx, ty, 20 + k) * 14), ly = Math.floor(H(ty, tx, 20 + k) * 14);
      px(x, pick(["#8a6a3a", "#9b7b43", "#6f5a30", "#7d8a3a"], H(k, tx, ty)), lx, ly, 2, 1);
    }
  };
  paint[TL.WOOD] = function (x, tx, ty) { base(x, P.wood[0]); speckle(x, tx, ty, P.wood, 10, 0.5); };
  paint[TL.TREE] = function (x, tx, ty) { paint[TL.FIELD](x, tx, ty); };
  paint[TL.BEECH] = paint[TL.FALLEN] = function (x, tx, ty) { paint[TL.LITTER](x, tx, ty); };
  paint[TL.WATER] = function (x, tx, ty) { base(x, "#1f3a40"); speckle(x, tx, ty, ["#24454c", "#1b3338", "#2a4f55"], 12, 0.4); };
  paint[TL.SPRING] = function (x, tx, ty) { base(x, "#2a4c4a"); speckle(x, tx, ty, ["#3a6a64", "#244240", "#4d7e74"], 13, 0.5); };
  paint[TL.MUD] = function (x, tx, ty) { base(x, "#5b4a31"); speckle(x, tx, ty, ["#4e3f2a", "#665538", "#3f5a2c"], 14, 0.6); };
  paint[TL.FENCE] = function (x, tx, ty, m) {
    var g = m && m.get(tx, ty - 1) === TL.GARDEN || m && m.get(tx, ty + 1) === TL.GARDEN ? TL.GARDEN : TL.FIELD;
    paint[g](x, tx, ty);
    var vert = m && (m.get(tx, ty - 1) === TL.FENCE || m.get(tx, ty + 1) === TL.FENCE) && !(m.get(tx - 1, ty) === TL.FENCE || m.get(tx + 1, ty) === TL.FENCE);
    if (vert) { px(x, "#8e8778", 7, 0, 2, 16); px(x, "#6d675b", 6, 0, 1, 16); px(x, "#5a554a", 5, 4, 6, 3); }
    else { px(x, "#9a9282", 0, 6, 16, 2); px(x, "#9a9282", 0, 11, 16, 2); px(x, "#6d675b", 0, 8, 16, 1); px(x, "#6d675b", 0, 13, 16, 1); px(x, "#7b7466", 6, 3, 3, 12); px(x, "#a39b8a", 6, 3, 3, 1); }
  };
  paint[TL.GATE] = function (x, tx, ty) {
    paint[TL.ROAD](x, tx, ty);
    px(x, "#6d675b", tx % 2 ? 13 : 1, 2, 2, 13);
  };
  paint[TL.HEDGE] = function (x, tx, ty) {
    base(x, "#2f5126");
    for (var k = 0; k < 9; k++) {
      var cx = Math.floor(H(tx, ty, 30 + k) * 14), cy = Math.floor(H(ty, tx, 30 + k) * 14);
      px(x, pick(["#3d6830", "#4b7a38", "#28461f", "#5a8a42"], H(k, ty, tx)), cx, cy, 3, 2);
    }
    if (H(tx, ty, 39) > 0.7) px(x, "#f0f0e6", Math.floor(H(tx, ty, 40) * 14), Math.floor(H(ty, tx, 40) * 14), 1, 1);
  };
  paint[TL.LAVENDER] = function (x, tx, ty) {
    paint[TL.GARDEN](x, tx, ty);
    for (var k = 0; k < 7; k++) {
      var sx = 1 + Math.floor(H(tx, ty, 50 + k) * 14);
      px(x, "#8b9a7a", sx, 9, 1, 7);
      px(x, pick(["#8a6fc4", "#9f86d6", "#7656b0", "#b39be3"], H(k, tx, ty)), sx, 2 + Math.floor(H(k, ty, tx) * 4), 1, 5);
    }
  };
  paint[TL.BED] = function (x, tx, ty) {
    base(x, "#6b5235"); speckle(x, tx, ty, ["#5d472d", "#7a5f3e"], 51, 0.5);
    blades(x, tx, ty, ["#8aa04c", "#c9b05a", "#6c8a3c"], 10, 7, 52);
    if (H(tx, ty, 53) > 0.5) px(x, "#e7c64a", 5 + Math.floor(H(tx, ty, 54) * 6), 3, 2, 2);
  };
  paint[TL.COMPOST] = function (x, tx, ty) { paint[TL.GARDEN](x, tx, ty); };
  paint[TL.TAP] = function (x, tx, ty) {
    paint[TL.GARDEN](x, tx, ty);
    px(x, "#6c6f72", 7, 2, 2, 12); px(x, "#9a9da0", 7, 2, 1, 12); px(x, "#a33", 5, 3, 6, 2); px(x, "#6c6f72", 9, 6, 4, 2); px(x, "#4b5a3a", 6, 13, 6, 2);
  };
  paint[TL.SAND] = function (x, tx, ty) { base(x, P.sand[1]); speckle(x, tx, ty, P.sand, 60, 0.7); };
  paint[TL.PILE] = function (x, tx, ty) {
    base(x, "#e6d8b0"); speckle(x, tx, ty, ["#f1e5c0", "#d9c99c", "#efe2bc", "#cdbd90"], 61, 0.8);
    for (var j = 2; j < 16; j += 4) px(x, "rgba(150,120,70,.25)", 0, j, 16, 1);
  };
  paint[TL.PIPE] = paint[TL.TRAILER] = function (x, tx, ty) { paint[TL.SAND](x, tx, ty); };
  paint[TL.CHAIN] = function (x, tx, ty) {
    paint[TL.SAND](x, tx, ty);
    for (var i = 0; i < 16; i += 3) for (var j = 0; j < 16; j += 3) px(x, "rgba(120,125,130,.55)", (i + j) % 16, j, 1, 1);
    px(x, "#7d8288", 0, 2, 16, 1); px(x, "#7d8288", 0, 14, 16, 1);
    if (tx % 4 === 0) px(x, "#5d6268", 7, 0, 2, 16);
  };
  paint[TL.GAP] = function (x, tx, ty) {
    paint[TL.SAND](x, tx, ty);
    px(x, "#7d8288", 0, 2, 4, 1); px(x, "#7d8288", 12, 2, 4, 1); px(x, "#7d8288", 0, 14, 3, 1); px(x, "#7d8288", 13, 14, 3, 1);
  };
  paint[TL.ROCK] = function (x, tx, ty) { paint[TL.MUD](x, tx, ty); };
  paint[TL.FLAT] = function (x, tx, ty) {
    paint[TL.MUD](x, tx, ty);
    px(x, "#8a8a80", 2, 4, 12, 9); px(x, "#a3a397", 3, 4, 10, 2); px(x, "#6e6e66", 2, 12, 12, 1);
  };
  paint[TL.HOUSE] = paint[TL.SHED] = paint[TL.DOOR] = paint[TL.SHEDDOOR] = function (x, tx, ty) { paint[TL.GARDEN](x, tx, ty); };
  paint[TL.BECKHOUSE] = paint[TL.BECKDOOR] = function (x, tx, ty) { paint[TL.FIELD](x, tx, ty); };

  /* interiors */
  paint[TL.FLOOR] = paint[TL.RUG] = paint[TL.CHAIR] = paint[TL.TABLE] = paint[TL.BOX] = function (x, tx, ty) {
    base(x, P.floor[0]);
    for (var j = 0; j < 16; j += 4) {
      px(x, pick(P.floor, H(tx, ty * 4 + j, 70)), 0, j, 16, 4);
      px(x, "#5e4329", 0, j + 3, 16, 1);
      px(x, "#5e4329", Math.floor(H(tx, ty * 4 + j, 71) * 16), j, 1, 3);
    }
  };
  paint[TL.KFLOOR] = function (x, tx, ty) {
    base(x, (tx + ty) % 2 ? "#cfc5ad" : "#a8443c");
    px(x, "rgba(0,0,0,.12)", 0, 15, 16, 1); px(x, "rgba(0,0,0,.12)", 15, 0, 1, 16);
  };
  paint[TL.WALL] = paint[TL.WINDOW] = paint[TL.CDOOR] = function (x, tx, ty) {
    base(x, "#c9b896");
    for (var i = 1; i < 16; i += 5) px(x, "#bba985", i, 0, 1, 16);
    px(x, "#7a6248", 0, 13, 16, 3); px(x, "#5a4834", 0, 15, 16, 1);
    px(x, "#efe4c8", 0, 0, 16, 1);
  };
  paint[TL.EXIT] = function (x) { base(x, "#5a4430"); px(x, "#3a2a1a", 2, 0, 12, 16); px(x, "#6b4a2c", 3, 1, 10, 15); px(x, "#c8a650", 11, 8, 1, 2); };
  paint[TL.STAIRS] = function (x, tx, ty) {
    base(x, "#7b5a3a");
    for (var j = 0; j < 16; j += 4) { px(x, "#9a7650", 0, j, 16, 2); px(x, "#4f3820", 0, j + 3, 16, 1); }
  };
  paint[TL.COUNTER] = function (x) { base(x, "#e6dcc4"); px(x, "#b9ae96", 0, 12, 16, 4); px(x, "#8c836f", 0, 15, 16, 1); px(x, "#f5eedd", 0, 0, 16, 2); };
  paint[TL.STONE] = function (x, tx, ty) {
    base(x, P.stone[0]); speckle(x, tx, ty, P.stone, 80, 0.6);
    if (H(tx, ty, 81) > 0.6) px(x, "#33332f", 0, Math.floor(H(tx, ty, 82) * 16), 16, 1);
    if (H(tx, ty, 83) > 0.8) px(x, "rgba(90,120,80,.5)", Math.floor(H(tx, ty, 84) * 12), Math.floor(H(tx, ty, 85) * 12), 4, 3);
  };
  paint[TL.SWALL] = function (x, tx, ty) {
    base(x, "#2c2b27");
    for (var j = 0; j < 16; j += 5) for (var i = (j / 5 % 2) * 4; i < 16; i += 8) { px(x, pick(["#3b3934", "#35332e", "#403e38"], H(i, j, tx * 9 + ty)), i, j, 7, 4); }
    if (H(tx, ty, 86) > 0.5) px(x, "rgba(120,150,140,.35)", Math.floor(H(tx, ty, 87) * 14), 0, 1, 16);  // weeping stone
  };
  paint[TL.STEPS] = function (x) {
    base(x, "#4a3a28");
    for (var j = 0; j < 16; j += 5) { px(x, "#6b5538", 0, j, 16, 3); px(x, "#2e2418", 0, j + 3, 16, 2); }
  };
  paint[TL.SHELF] = paint[TL.APPLES] = paint[TL.FSHELF] = paint[TL.LOG] = function (x, tx, ty) { paint[TL.STONE](x, tx, ty); };
  paint[TL.POOL] = function (x, tx, ty) { paint[TL.STONE](x, tx, ty); px(x, "rgba(20,40,50,.75)", 1, 2, 14, 12); px(x, "rgba(120,160,170,.25)", 3, 4, 6, 1); };
  paint[TL.SFLOOR] = function (x, tx, ty) {
    base(x, P.sfloor[0]); speckle(x, tx, ty, P.sfloor, 90, 0.6);
    for (var j = 0; j < 16; j += 8) px(x, "#4a3c2a", 0, j + 7, 16, 1);
  };
  paint[TL.BWALL] = function (x, tx, ty) {
    base(x, "#8f8a7d");
    for (var i = 0; i < 16; i += 4) { px(x, pick(["#9c968a", "#878275", "#a59f92"], H(tx * 4 + i, ty, 91)), i, 0, 3, 16); px(x, "#5d5850", i + 3, 0, 1, 16); }
    if (H(tx, ty, 92) > 0.5) px(x, "#f6e4a8", Math.floor(H(tx, ty, 93) * 16), 0, 1, 16); // the slats of light
  };
  paint[TL.TOOLS] = paint[TL.BENCH] = paint[TL.MOWER] = paint[TL.BARROW] = paint[TL.SCOOT] = function (x, tx, ty) { paint[TL.SFLOOR](x, tx, ty); };

  /* ---------------- props drawn on top of their tile ---------------- */
  var prop = {};
  prop[TL.TOOLS] = function (x, tx) {
    px(x, "#8f8a7d", 0, 0, 16, 14);
    for (var i = 0; i < 16; i += 4) px(x, "#5d5850", i + 3, 0, 1, 14);
    var k = tx % 3;
    /* the painted outline behind each tool, every outline filled */
    px(x, "#e9e4d4", 3, 2, 3, 10); px(x, "#e9e4d4", 9, 2, 4, 7);
    if (k === 0) { px(x, "#6b4a2c", 4, 3, 1, 8); px(x, "#7c8288", 3, 9, 3, 3); px(x, "#7c8288", 9, 3, 4, 2); px(x, "#6b4a2c", 10, 5, 2, 4); }
    if (k === 1) { px(x, "#7c8288", 4, 2, 1, 8); px(x, "#a33", 3, 9, 3, 3); px(x, "#7c8288", 10, 2, 2, 7); px(x, "#2e3236", 9, 2, 4, 1); }
    if (k === 2) { px(x, "#6b4a2c", 4, 2, 1, 10); px(x, "#7c8288", 3, 2, 3, 2); px(x, "#b8742c", 9, 3, 4, 4); px(x, "#6b4a2c", 10, 6, 2, 3); }
    px(x, "#3a2a1a", 0, 13, 16, 2);
  };
  prop[TL.BENCH] = function (x, tx, ty) {
    px(x, "#7a5a36", 0, 3, 16, 8); px(x, "#9a7650", 0, 3, 16, 2); px(x, "#4a3620", 1, 11, 2, 4); px(x, "#4a3620", 13, 11, 2, 4);
    px(x, "#8d8f8a", 2, 0, 4, 4); px(x, "#5a5c58", 3, 0, 2, 1);                // coffee can of bent nails
    if ((tx + ty) % 2) { px(x, "#3a3c3e", 9, 0, 6, 4); px(x, "#6a6c6e", 10, 1, 2, 2); }   // radio, no knobs
  };
  prop[TL.MOWER] = function (x) { px(x, "#2c4d2c", 2, 6, 12, 7); px(x, "#1c1c1c", 2, 12, 3, 3); px(x, "#1c1c1c", 11, 12, 3, 3); px(x, "#9a9da0", 7, 0, 1, 7); px(x, "#9a9da0", 5, 0, 5, 1); };
  prop[TL.BARROW] = function (x) { px(x, "#3e6a8a", 2, 4, 11, 7); px(x, "#2c4d66", 3, 9, 9, 2); px(x, "#1c1c1c", 6, 11, 4, 4); px(x, "#6b4a2c", 12, 6, 4, 1); };
  prop[TL.SCOOT] = function () { /* the scooter is an entity: it can leave */ };
  prop[TL.BOX] = function (x, tx, ty) {
    var o = Math.floor(H(tx, ty, 100) * 3);
    px(x, "rgba(0,0,0,.25)", 2, 12, 14, 4);
    px(x, "#c79a5e", 1 + o, 2, 13 - o, 12); px(x, "#a97e45", 1 + o, 11, 13 - o, 3); px(x, "#dcb37a", 1 + o, 2, 13 - o, 2);
    px(x, "#e9dfc6", 6, 2, 3, 12);                                       // the tape, rip, thunk
    px(x, "#3a2a1a", 3 + o, 7, 6, 1); px(x, "#3a2a1a", 3 + o, 9, 4, 1);  // hard square capitals
  };
  prop[TL.TABLE] = function (x, tx, ty) {
    px(x, "rgba(0,0,0,.25)", 0, 12, 16, 4);
    px(x, "#8a5e36", 0, 1, 16, 11); px(x, "#a7764a", 0, 1, 16, 2); px(x, "#6b4528", 0, 11, 16, 1);
    if (tx % 2 === 0 && ty % 2 === 0) { px(x, "#efe9dc", 9, 4, 4, 4); px(x, "#6b3a1c", 10, 5, 2, 2); }  // the cold mug
  };
  prop[TL.CHAIR] = function (x) { px(x, "#7a5232", 3, 2, 10, 10); px(x, "#9a6a42", 3, 2, 10, 2); px(x, "#5a3a20", 3, 12, 2, 3); px(x, "#5a3a20", 11, 12, 2, 3); };
  prop[TL.RUG] = function (x, tx, ty) {
    px(x, "#7a3b34", 0, 0, 16, 16);
    px(x, ((tx + ty) % 2) ? "#8f4c3f" : "#6a3029", 2, 2, 12, 12);
    px(x, "#d6b46a", 7, 7, 2, 2);
  };
  prop[TL.WINDOW] = function (x) {
    px(x, "#6b5638", 2, 2, 12, 10); px(x, "#f8f0c8", 3, 3, 10, 8); px(x, "#fffbe6", 3, 3, 4, 3); px(x, "#6b5638", 7, 3, 1, 8); px(x, "#6b5638", 3, 7, 10, 1);
  };
  prop[TL.CDOOR] = function (x) {
    px(x, "#3a2a1a", 3, 1, 10, 15); px(x, "#6b4a2c", 4, 2, 8, 14);
    for (var i = 4; i < 12; i += 3) px(x, "#58391f", i, 2, 1, 14);
    px(x, "#1c1c1c", 9, 8, 3, 2); px(x, "#e8e8e0", 10, 8, 1, 1);         // the latch, worn silver in one spot
  };
  prop[TL.SHELF] = function (x, tx, ty) {
    px(x, "#3a2a1a", 0, 0, 16, 16); px(x, "#5a4430", 0, 7, 16, 2); px(x, "#5a4430", 0, 14, 16, 2);
    var cols = ["#5b2340", "#7a2a3a", "#c47a2a", "#2a1a2e", "#8a3a5a", "#b8582a", "#3a1830"];
    for (var row = 0; row < 2; row++) for (var i = 0; i < 4; i++) {
      var c = pick(cols, H(tx * 4 + i, ty * 2 + row, 101));
      px(x, c, 1 + i * 4, 2 + row * 7, 3, 5); px(x, "#cfcfbf", 1 + i * 4, 2 + row * 7, 3, 1);
    }
  };
  prop[TL.APPLES] = function (x) {
    px(x, "#4a3622", 0, 0, 16, 16); px(x, "#6a4c30", 0, 0, 16, 2);
    for (var i = 0; i < 6; i++) px(x, ["#8a4a2a", "#9a6a2a", "#7a3a22"][i % 3], 2 + (i % 3) * 4, 4 + Math.floor(i / 3) * 5, 3, 3);
  };
  prop[TL.FSHELF] = function (x, tx, ty) {
    px(x, "#4e3a26", 0, 3, 16, 3); px(x, "#3e2c1c", 1, 7, 14, 3); px(x, "#5e4630", 2, 11, 13, 3);
    if (ty === 11) { px(x, "#d8cfae", 4, 4, 8, 5); px(x, "#b8ad8c", 4, 8, 8, 1); px(x, "#6b4a2c", 6, 5, 4, 3); }  // the book in waxed cloth
  };
  prop[TL.LOG] = function (x) { px(x, "#5a3e24", 1, 4, 14, 9); px(x, "#7a5a36", 1, 4, 14, 2); px(x, "#c8a676", 13, 5, 2, 7); px(x, "#a8865a", 14, 7, 1, 3); };
  prop[TL.COUNTER] = function () { };

  /* ---------------- people ---------------- */
  function outline(c, col) {
    var x = c.getContext("2d"), w = c.width, h = c.height, d = x.getImageData(0, 0, w, h), a = d.data, src = new Uint8ClampedArray(a), C = hex(col);
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
      var k = (j * w + i) * 4;
      if (src[k + 3]) continue;
      var n = (i > 0 && src[k - 1]) || (i < w - 1 && src[k + 7]) || (j > 0 && src[k - w * 4 + 3]) || (j < h - 1 && src[k + w * 4 + 3]);
      if (n) { a[k] = C[0]; a[k + 1] = C[1]; a[k + 2] = C[2]; a[k + 3] = 255; }
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  /* one person, one direction, one step. 16 wide, 24 tall, feet at the
     bottom. dir: 0 down, 1 up, 2 right, 3 left (mirrored). */
  function person(o, dir, f) {
    var c = cv(16, 24), x = c.getContext("2d");
    var adult = o.adult, mirror = dir === 3; if (mirror) dir = 2;
    var top = adult ? 1 : 6;
    var hy = top, ty = top + 7, th = adult ? 8 : 5, ly = ty + th, lh = 23 - ly - 1;
    var tw = adult ? 10 : 8, tx = 8 - tw / 2;
    var ph = f === 1 ? 1 : f === 2 ? -1 : 0, swing = ph;
    if (o.sit) {
      /* cross-legged on the floor in a square of boxes */
      px(x, o.pants, 3, 18, 10, 3); px(x, o.pants, 2, 19, 12, 2); px(x, o.shoes, 2, 20, 2, 2); px(x, o.shoes, 12, 20, 2, 2);
      px(x, o.shirt, 4, 11, 8, 8); px(x, o.skin, 3, 13, 1, 5); px(x, o.skin, 12, 13, 1, 5); px(x, o.skin, 5, 17, 6, 1);
      hy = 4;
    } else {
      /* legs */
      var legC = o.shortPants ? o.skin : o.pants;
      if (dir === 2) {
        px(x, legC, 6 + ph, ly, 2, lh); px(x, legC, 8 - ph, ly, 2, lh);
        if (o.shortPants) px(x, o.pants, 5, ly, 6, 2);
        px(x, o.shoes, 6 + ph, 21, 3, 2); px(x, o.shoes, 8 - ph, 21, 3, 2);
      } else {
        px(x, legC, tx + 1, ly, 2, lh - (ph > 0 ? 1 : 0)); px(x, legC, tx + tw - 3, ly, 2, lh - (ph < 0 ? 1 : 0));
        if (o.shortPants) { px(x, o.pants, tx, ly, tw, 2); if (o.scab) px(x, "#8a3a2a", tx + tw - 3, ly + 3, 1, 1); }
        px(x, o.shoes, tx + 1, 21 - (ph > 0 ? 1 : 0), 2, 2); px(x, o.shoes, tx + tw - 3, 21 - (ph < 0 ? 1 : 0), 2, 2);
      }
      /* torso + arms */
      var sh = o.bare ? o.skin : o.shirt;
      px(x, sh, tx, ty, tw, th);
      if (o.vest) { px(x, o.vest, tx, ty, 3, th); px(x, o.vest, tx + tw - 3, ty, 3, th); px(x, "#e8eef0", tx, ty + th - 3, 3, 1); px(x, "#e8eef0", tx + tw - 3, ty + th - 3, 3, 1); }
      if (o.plaid) for (var i = 0; i < tw; i += 3) px(x, "rgba(0,0,0,.25)", tx + i, ty, 1, th);
      if (dir !== 2) {
        px(x, o.bare ? o.skin : (o.sleeve || sh), tx - 1, ty + (swing > 0 ? 1 : 0), 1, 2);
        px(x, o.skin, tx - 1, ty + 2 + (swing > 0 ? 1 : 0), 1, th - 3);
        px(x, o.bare ? o.skin : (o.sleeve || sh), tx + tw, ty + (swing > 0 ? 1 : 0), 1, 2);
        px(x, o.skin, tx + tw, ty + 2 + (swing > 0 ? 1 : 0), 1, th - 3);
        if (o.stick && dir === 0) px(x, "#6b4a2c", tx + tw + 1, ty + 1, 1, th + 3);
      } else {
        px(x, o.skin, 7 + swing, ty + 2, 2, th - 2);
        if (o.stick) px(x, "#6b4a2c", 10, ty - 1, 1, th + 4);
      }
      if (o.book && dir === 0) px(x, "#5a3a2a", tx + 2, ty + 1, 3, 3);  // the book, buttoned inside the shirt
    }
    /* head */
    var hx = 4;
    px(x, o.skin, hx, hy + 1, 8, 6); px(x, o.skin, hx + 1, hy, 6, 1); px(x, o.skin, hx + 1, hy + 7, 6, 1);
    var hc = o.hair;
    if (dir === 1) {
      px(x, hc, hx, hy, 8, 7); px(x, hc, hx + 1, hy - 1, 6, 1);
      if (o.pony) { px(x, hc, 7, hy + 7, 2, 3); }
    } else if (dir === 2) {
      px(x, hc, hx, hy - 1, 7, 3); px(x, hc, hx, hy, 3, 6);
      px(x, "#1e1612", hx + 6, hy + 3, 1, 1);
      if (o.nose) px(x, o.nose, hx + 7, hy + 4, 1, 1);
      if (o.pony) px(x, hc, hx - 2, hy + 2, 2, 3);
    } else {
      px(x, hc, hx, hy - 1, 8, 3); px(x, hc, hx, hy, 1, 4); px(x, hc, hx + 7, hy, 1, 4);
      px(x, "#1e1612", hx + 2, hy + 3, 1, 1); px(x, "#1e1612", hx + 5, hy + 3, 1, 1);
      if (o.nose) px(x, o.nose, hx + 3, hy + 4, 2, 1);
    }
    if (o.messy) { px(x, hc, hx + 1, hy - 2, 1, 1); px(x, hc, hx + 4, hy - 2, 2, 1); px(x, hc, hx + 7, hy - 1, 1, 1); }
    if (o.towel) { px(x, "#f2f0ea", hx - 1, hy - 1, 10, 3); px(x, "#4a7ab0", hx - 1, hy, 10, 1); px(x, "#f2f0ea", hx + 8, hy + 2, 2, 2); }
    if (o.cap) { px(x, o.cap, hx - 1, hy - 1, 10, 3); if (dir === 0) px(x, o.cap, hx, hy + 2, 8, 1); }
    if (o.bald) { px(x, o.skin, hx, hy - 1, 8, 2); }
    if (mirror) {
      var m = cv(16, 24), mx = m.getContext("2d"); mx.translate(16, 0); mx.scale(-1, 1); mx.drawImage(c, 0, 0); c = m;
    }
    return outline(c, o.line || "#1d1612");
  }

  var CAST = {
    wren: { hair: "#3b2a20", messy: 1, skin: "#d9a982", shirt: "#3f8f8a", sleeve: "#3f8f8a", pants: "#3a5578", shoes: "#7a5a3a", book: 0 },
    beck: { hair: "#c99a50", pony: 1, skin: "#e6b48c", nose: "#e2725a", shirt: "#b5523b", pants: "#8a7a4f", shortPants: 1, scab: 1, shoes: "#d8d4c8", stick: 1 },
    dad: { adult: 1, hair: "#4a3a2e", skin: "#d4a07a", shirt: "#6d7480", pants: "#3f4652", shoes: "#3a2a1a" },
    dadDay1: { adult: 1, hair: "#4a3a2e", skin: "#d4a07a", shirt: "#d4a07a", bare: 1, towel: 1, pants: "#3f4652", shoes: "#3a2a1a", sit: 1 },
    dadSit: { adult: 1, hair: "#4a3a2e", skin: "#d4a07a", shirt: "#6d7480", pants: "#3f4652", shoes: "#3a2a1a", sit: 1 },
    worker: { adult: 1, hair: "#5a4030", skin: "#c99572", shirt: "#4a5866", vest: "#d4ec3a", pants: "#2f3e5a", shoes: "#4a3420" },
    worker2: { adult: 1, hair: "#1e1612", bald: 1, skin: "#8d5f3e", shirt: "#3a3a3a", vest: "#f08a2a", pants: "#2f3e5a", shoes: "#4a3420" },
    beckdad: { adult: 1, hair: "#7a5a2a", skin: "#e0a682", shirt: "#8a2f2a", plaid: 1, pants: "#3a4a6a", shoes: "#4a3420", cap: "#2f4a2f" }
  };
  BS.CAST = CAST;
  var spriteCache = {};
  BS.sprite = function (who, dir, f) {
    var k = who + dir + "_" + (f % 4);
    if (!spriteCache[k]) spriteCache[k] = person(CAST[who], dir, f % 4 === 1 ? 1 : f % 4 === 3 ? 2 : 0);
    return spriteCache[k];
  };

  /* the dog by the pit gate: old, chained, asleep */
  BS.dog = (function () {
    var c = cv(16, 12), x = c.getContext("2d");
    px(x, "#8a6a44", 2, 5, 11, 5); px(x, "#8a6a44", 11, 3, 4, 4); px(x, "#5a4228", 13, 3, 2, 2); px(x, "#6e5232", 1, 5, 2, 2);
    px(x, "#1d1612", 14, 5, 1, 1); px(x, "#c8b48a", 4, 8, 6, 2);
    return outline(c, "#1d1612");
  })();

  /* ---------------- buildings ---------------- */
  /* Gran's house: white boards gone gray, a deep roof, the power cut. */
  BS.paintHouse = function (w, h) {
    var W = w * T, Hh = h * T + 30, c = cv(W, Hh), x = c.getContext("2d");
    var wallTop = Hh - 3 * T - 8;
    /* walls */
    px(x, "#d8d0bc", 0, wallTop, W, Hh - wallTop - 2);
    for (var j = wallTop; j < Hh - 2; j += 3) px(x, "#b8ae98", 0, j, W, 1);
    px(x, "rgba(0,0,0,.18)", 0, Hh - 6, W, 4);
    /* roof */
    for (var r = 0; r < wallTop + 6; r++) {
      var t = r / (wallTop + 6);
      px(x, mix("#5a3a32", "#7a4a3e", t), 0, r, W, 1);
      if (r % 4 === 0) px(x, "rgba(0,0,0,.18)", 0, r, W, 1);
    }
    for (var i = 0; i < W; i += 7) px(x, "rgba(0,0,0,.08)", i + ((i / 7) % 2) * 3, 0, 1, wallTop + 6);
    px(x, "#3a2420", 0, wallTop + 4, W, 3);
    px(x, "#8a5a4a", 0, 0, W, 2);
    /* chimney */
    px(x, "#7a3a2a", W - 40, 4, 12, 22); px(x, "#5a2a1e", W - 40, 4, 12, 3);
    /* windows, dark: the power is cut */
    [[16, 0], [W - 52, 0], [W - 30, 0]].forEach(function (p) {
      px(x, "#5a4834", p[0], wallTop + 12, 16, 16); px(x, "#2a3038", p[0] + 2, wallTop + 14, 12, 12); px(x, "#5a4834", p[0] + 7, wallTop + 14, 2, 12); px(x, "#5a4834", p[0] + 2, wallTop + 19, 12, 2);
    });
    /* the front door */
    var dx = (39 - 34) * T;
    px(x, "#4a2e1e", dx, wallTop + 14, T, Hh - wallTop - 16); px(x, "#6b3e26", dx + 2, wallTop + 16, T - 4, Hh - wallTop - 18); px(x, "#d8b060", dx + 11, wallTop + 30, 2, 2);
    px(x, "#6b6258", dx - 4, Hh - 4, T + 8, 3);
    return c;
  };
  BS.paintShed = function (w, h) {
    var W = w * T, Hh = h * T + 16, c = cv(W, Hh), x = c.getContext("2d");
    var wallTop = Hh - 2 * T - 6;
    /* silvered boards, leaning just slightly onto one hip */
    for (var i = 0; i < W; i += 4) {
      var lean = Math.round((i / W) * 3);
      px(x, pick(["#9c968a", "#8b8579", "#a8a295"], H(i, 3, 5)), i, wallTop + lean, 3, Hh - wallTop - lean - 2);
      px(x, "#5d5850", i + 3, wallTop + lean, 1, Hh - wallTop - lean - 2);
    }
    for (var r = 0; r < wallTop + 4; r++) px(x, mix("#4a4a46", "#5e5e58", r / wallTop), 0, r + Math.round(r / wallTop * 2), W, 1);
    px(x, "#33332f", 0, wallTop + 2, W, 3);
    var dx = 2 * T;
    px(x, "#5a4a36", dx, wallTop + 8, T, Hh - wallTop - 10); px(x, "#7a6a50", dx + 2, wallTop + 10, T - 4, Hh - wallTop - 12);
    return c;
  };
  BS.paintBeckHouse = function (w, h) {
    var W = w * T, Hh = h * T + 24, c = cv(W, Hh), x = c.getContext("2d");
    var wallTop = Hh - 3 * T;
    px(x, "#c9d2d8", 0, wallTop, W, Hh - wallTop - 2);
    for (var j = wallTop; j < Hh - 2; j += 4) px(x, "#aeb8c0", 0, j, W, 1);
    for (var r = 0; r < wallTop + 4; r++) px(x, mix("#3a4a5a", "#4a5e70", r / wallTop), 0, r, W, 1);
    px(x, "#26323e", 0, wallTop + 2, W, 3);
    BS.beckWindows = [[12, wallTop + 12], [W - 28, wallTop + 12], [W - 50, wallTop + 12]];
    BS.beckWindows.forEach(function (p) { px(x, "#4a5a66", p[0], p[1], 16, 14); px(x, "#ffd98a", p[0] + 2, p[1] + 2, 12, 10); px(x, "#4a5a66", p[0] + 7, p[1] + 2, 2, 10); });
    var dx = 3 * T;
    px(x, "#2e4a3a", dx, wallTop + 10, T, Hh - wallTop - 12); px(x, "#d8b060", dx + 11, wallTop + 26, 2, 2);
    px(x, "#7a6a58", dx - 8, Hh - 5, T + 16, 3); // the porch step
    /* a bike leaned on the porch */
    px(x, "#1d1612", dx + T + 6, Hh - 14, 1, 10); px(x, "#a33", dx + T + 6, Hh - 12, 12, 2);
    return c;
  };
  BS.paintTrailer = function (w, h) {
    var W = w * T, Hh = h * T + 10, c = cv(W, Hh), x = c.getContext("2d");
    px(x, "#3e6a46", 0, 8, W, Hh - 12); for (var i = 0; i < W; i += 3) px(x, "#335a3a", i, 8, 1, Hh - 12);
    px(x, "#2a4a30", 0, 4, W, 6); px(x, "#4e7a56", 0, 4, W, 1);
    px(x, "#1e2a24", 14, Hh - 30, 18, 12); px(x, "#9ab0b8", 16, Hh - 28, 14, 8);    // the window
    px(x, "#2a3a30", W - 22, Hh - 34, 14, 26);                                         // the door, propped open
    px(x, "#0e1410", W - 20, Hh - 32, 10, 24);
    px(x, "#555", 4, Hh - 4, 4, 4); px(x, "#555", W - 8, Hh - 4, 4, 4);
    return c;
  };
  BS.paintPipes = function (w) {
    var c = cv(w * T, 22), x = c.getContext("2d");
    for (var i = 0; i < w * 2; i++) {
      var cx = 4 + i * 8, cy = i % 2 ? 9 : 15;
      x.fillStyle = "#8d8d86"; x.beginPath(); x.arc(cx, cy, 6, 0, 7); x.fill();
      x.fillStyle = "#3a3a36"; x.beginPath(); x.arc(cx, cy, 3.5, 0, 7); x.fill();
      x.strokeStyle = "#5e5e58"; x.beginPath(); x.arc(cx, cy, 6, 0, 7); x.stroke();
    }
    return c;
  };
  /* a tree: a trunk on the ground, a round canopy above */
  BS.paintCanopy = function (seed, r, cols) {
    var d = r * 2 + 4, c = cv(d, d), x = c.getContext("2d");
    cols = cols || ["#2f4a22", "#3b5a2a", "#476a32", "#26401c", "#5a7a3a"];
    for (var k = 0; k < 26; k++) {
      var a = H(seed, k, 1) * 6.283, rr = H(seed, k, 2) * r * 0.75;
      var bx = d / 2 + Math.cos(a) * rr, by = d / 2 + Math.sin(a) * rr * 0.85;
      var br = r * (0.35 + H(seed, k, 3) * 0.3);
      x.fillStyle = cols[k % cols.length]; x.beginPath(); x.arc(Math.round(bx), Math.round(by), Math.round(br), 0, 7); x.fill();
    }
    /* sun on the top-left of the crown */
    x.globalCompositeOperation = "source-atop";
    var g = x.createLinearGradient(0, 0, d, d); g.addColorStop(0, "rgba(255,240,170,.22)"); g.addColorStop(0.6, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.25)");
    x.fillStyle = g; x.fillRect(0, 0, d, d);
    return c;
  };
  BS.paintBeech = function () {
    var c = cv(40, 56), x = c.getContext("2d");
    px(x, "rgba(0,0,0,.3)", 6, 48, 30, 6);
    px(x, "#8e9294", 13, 6, 14, 46); px(x, "#a6aaac", 14, 6, 4, 46); px(x, "#6e7274", 25, 6, 2, 46);
    for (var j = 10; j < 48; j += 7) px(x, "#7a7e80", 15, j, 8, 1);
    px(x, "#8e9294", 6, 46, 8, 4); px(x, "#8e9294", 26, 46, 9, 4); px(x, "#8e9294", 10, 44, 4, 4);
    return c;
  };
  /* the fallen giant: more alive lying down than anything standing */
  BS.paintGiant = function (w) {
    var W = w * T, c = cv(W, 44), x = c.getContext("2d");
    px(x, "rgba(0,0,0,.35)", 2, 34, W - 4, 8);
    px(x, "#4a3a26", 0, 14, W, 22); px(x, "#5e4a30", 0, 14, W, 4); px(x, "#3a2c1c", 0, 32, W, 4);
    /* a deep wet pelt of moss */
    for (var i = 0; i < W; i += 2) {
      var mh = 3 + Math.floor(H(i, 1, 200) * 6);
      px(x, pick(["#4f7a2e", "#5e8a36", "#3f6a26", "#6e9a3e"], H(i, 2, 201)), i, 12 - mh + 6, 2, mh);
    }
    /* the root-plate at one end */
    x.fillStyle = "#3a2c1c"; x.beginPath(); x.ellipse(6, 24, 8, 18, 0, 0, 7); x.fill();
    /* ferns in green fountains */
    for (var f = 0; f < 6; f++) {
      var fx = 20 + f * (W - 40) / 6 + H(f, 3, 202) * 8;
      for (var a = -3; a <= 3; a++) { x.strokeStyle = "#4e8a3a"; x.beginPath(); x.moveTo(fx, 30); x.lineTo(fx + a * 3, 22 + Math.abs(a)); x.stroke(); }
    }
    /* pale shelves of fungus up its flank */
    for (var s = 0; s < 7; s++) { var sx = 30 + s * 19, sy = 26 + (s % 2) * 4; px(x, "#e8dcc0", sx, sy, 6, 2); px(x, "#c8b890", sx, sy + 2, 5, 1); }
    return c;
  };
  BS.paintSeedling = function (k) {
    var c = cv(8, 16), x = c.getContext("2d");
    px(x, "#5a4a2a", 3, 6, 1, 10);
    px(x, "#7ab84a", 1, 2 + (k % 2), 3, 2); px(x, "#8ac85a", 4, 0 + (k % 3), 3, 2); px(x, "#6aa83a", 2, 5, 4, 2);
    return c;
  };
  BS.paintRock = function () {
    var c = cv(20, 18), x = c.getContext("2d");
    x.fillStyle = "#cfcabb"; x.beginPath(); x.ellipse(10, 10, 9, 7, 0, 0, 7); x.fill();
    x.fillStyle = "#e9e4d6"; x.beginPath(); x.ellipse(8, 8, 6, 4, 0, 0, 7); x.fill();
    /* the patch of gray-green moss, crisp as an old scab */
    px(x, "#8a9a6a", 9, 5, 5, 3); px(x, "#7a8a5a", 10, 6, 4, 2);
    return c;
  };
  BS.paintCompost = function () {
    var c = cv(34, 26), x = c.getContext("2d");
    x.fillStyle = "#3e2e1e"; x.beginPath(); x.ellipse(17, 16, 16, 10, 0, 0, 7); x.fill();
    for (var k = 0; k < 40; k++) px(x, pick(["#5c4630", "#6e7a36", "#7a5a34", "#8a6a3a", "#4e5a26"], H(k, 1, 300)), 4 + Math.floor(H(k, 2, 300) * 26), 8 + Math.floor(H(k, 3, 300) * 14), 2, 1);
    return c;
  };
  BS.paintLoader = function () {
    var c = cv(40, 30), x = c.getContext("2d");
    px(x, "rgba(0,0,0,.3)", 2, 24, 36, 5);
    px(x, "#e2b22a", 8, 8, 24, 14); px(x, "#c89a1e", 8, 18, 24, 4); px(x, "#2a3238", 18, 2, 12, 10); px(x, "#9ab0b8", 20, 4, 8, 5);
    px(x, "#1c1c1c", 8, 20, 9, 9); px(x, "#1c1c1c", 24, 20, 9, 9); px(x, "#555", 11, 23, 3, 3); px(x, "#555", 27, 23, 3, 3);
    px(x, "#8a8a80", 0, 10, 8, 10); px(x, "#6a6a62", 0, 18, 9, 3);     // the bucket
    return c;
  };
  BS.paintTruck = function () {
    var c = cv(64, 34), x = c.getContext("2d");
    px(x, "rgba(0,0,0,.3)", 2, 28, 60, 5);
    px(x, "#e8e4da", 40, 6, 22, 20); px(x, "#9ab0b8", 44, 8, 14, 7); px(x, "#6a6a62", 0, 14, 42, 4); px(x, "#4a4a44", 0, 18, 42, 8);
    px(x, "#e2b22a", 6, 2, 18, 12); px(x, "#1c1c1c", 4, 9, 22, 2);  // the pump on the flatbed
    px(x, "#1c1c1c", 6, 24, 9, 9); px(x, "#1c1c1c", 46, 24, 9, 9);
    return c;
  };

  /* creatures, tiny */
  BS.paintBug = function (kind, f) {
    var c = cv(8, 8), x = c.getContext("2d");
    if (kind === "bee") { px(x, "#f2c43a", 2, 3, 4, 3); px(x, "#2a1e10", 3, 3, 1, 3); px(x, "#2a1e10", 5, 3, 1, 3); px(x, "rgba(240,250,255,.85)", 2 + (f % 2), 1, 3, 2); }
    if (kind === "fly") { px(x, "#1c1c1c", 3, 3, 2, 2); px(x, "rgba(200,220,230,.7)", 2 + (f % 2) * 3, 2, 1, 1); }
    if (kind === "butterfly") { px(x, "#2a2a2a", 3, 2, 1, 4); var o = f % 2 ? 1 : 2; px(x, "#fbfaf2", 3 - o - 1, 1, o + 1, 3); px(x, "#fbfaf2", 4, 1, o + 1, 3); px(x, "#e8e4d0", 3 - o, 4, o, 2); px(x, "#e8e4d0", 4, 4, o, 2); }
    if (kind === "frog") { px(x, "#4a7a2a", 1, 3, 6, 4); px(x, "#5e9a36", 2, 2, 4, 2); px(x, "#ffe08a", 2, 2, 1, 1); px(x, "#ffe08a", 5, 2, 1, 1); }
    return c;
  };

  /* every tile of a map into one canvas, once */
  BS.paintGround = function (m) {
    var c = cv(m.w * T, m.h * T), x = c.getContext("2d");
    var t = cv(T, T), tx = t.getContext("2d");
    for (var y = 0; y < m.h; y++) for (var X = 0; X < m.w; X++) {
      var id = m.get(X, y);
      var shown = id;
      if (m.hidden && (id === TL.DEER || id === TL.ROOT)) shown = TL.WOOD;
      tx.clearRect(0, 0, T, T);
      (paint[shown] || paint[TL.FIELD])(tx, X, y, m);
      if (prop[shown]) prop[shown](tx, X, y, m);
      x.drawImage(t, X * T, y * T);
    }
    return c;
  };
  BS.paintTile = function (id, X, y, m) {
    var t = cv(T, T), tx = t.getContext("2d");
    (paint[id] || paint[TL.FIELD])(tx, X, y, m);
    if (prop[id]) prop[id](tx, X, y, m);
    return t;
  };
})();
