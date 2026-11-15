/* world.js — the hill, the house, the cellar, the woods, the pit.

   Every place in the book, laid out once. The overworld is built by code
   from a handful of shapes (a seeded generator, so it is the same hill on
   every visit); the three interiors are small enough to draw by hand as
   strings. Nothing here draws a pixel — art.js paints what this names.

   Geography, from the novel:
   · Gran's house at the top of a hill the world forgot; the garden around
     it, lavender by the gate, a hedge with a gap, the compost heap at its
     edge, the shed at the bottom where mown grass gives up.
   · The road tips over at the crest and runs down and down toward the dark
     line of the woods. (The scooter run.)
   · Under the trees: a deer path only Beck can see, the great gray beech
     where Mo's gold runs out, a fold with a spring and the fallen giant —
     and, east, the pond with the pale rock.
   · Over the back field: Beck's house. A mile down the back lane: the pit. */
(function () {
  "use strict";
  var BS = window.BS = window.BS || {};

  /* ---------------- tiles ---------------- */
  var TL = {
    GRASS: 0, LONG: 1, ROAD: 2, LITTER: 3, TREE: 4, WOOD: 5, DEER: 6, ROOT: 7,
    WATER: 8, SPRING: 9, FENCE: 10, GATE: 11, HEDGE: 12, LAVENDER: 13,
    COMPOST: 14, HOUSE: 15, DOOR: 16, SHED: 17, SHEDDOOR: 18, SAND: 19,
    PILE: 20, PIPE: 21, TRAILER: 22, CHAIN: 23, GAP: 24, BECKHOUSE: 25,
    BECKDOOR: 26, ROCK: 27, MUD: 28, FALLEN: 29, GARDEN: 30, BEECH: 31,
    FIELD: 32, LANE: 33, BED: 34, FLAT: 35, TAP: 36,
    /* interiors */
    FLOOR: 40, WALL: 41, BOX: 42, TABLE: 43, STAIRS: 44, CDOOR: 45,
    WINDOW: 46, COUNTER: 47, STONE: 48, SHELF: 49, STEPS: 50, FSHELF: 51,
    LOG: 52, POOL: 53, SFLOOR: 54, TOOLS: 55, BENCH: 56, RUG: 57, EXIT: 58,
    KFLOOR: 59, APPLES: 60, SWALL: 61, BWALL: 62, CHAIR: 63, MOWER: 64,
    BARROW: 65, SCOOT: 66
  };
  BS.TL = TL;

  var SOLID = {};
  [TL.TREE, TL.WOOD, TL.WATER, TL.SPRING, TL.FENCE, TL.HEDGE, TL.LAVENDER,
   TL.COMPOST, TL.HOUSE, TL.SHED, TL.PIPE, TL.TRAILER, TL.CHAIN, TL.BECKHOUSE,
   TL.ROCK, TL.FALLEN, TL.BEECH, TL.BED, TL.TAP,
   TL.WALL, TL.BOX, TL.TABLE, TL.CDOOR, TL.WINDOW, TL.COUNTER, TL.SHELF,
   TL.FSHELF, TL.LOG, TL.TOOLS, TL.BENCH, TL.APPLES, TL.SWALL, TL.BWALL,
   TL.CHAIR, TL.MOWER, TL.BARROW, TL.SCOOT].forEach(function (t) { SOLID[t] = 1; });
  BS.SOLID = SOLID;

  /* what your feet hear */
  BS.SURFACE = function (t) {
    if (t === TL.FLOOR || t === TL.STAIRS || t === TL.STEPS || t === TL.RUG || t === TL.SFLOOR) return "wood";
    if (t === TL.STONE || t === TL.KFLOOR || t === TL.FLAT) return "stone";
    if (t === TL.SAND || t === TL.PILE) return "sand";
    if (t === TL.LITTER || t === TL.DEER || t === TL.ROOT) return "leaves";
    if (t === TL.ROAD || t === TL.LANE) return "gravel";
    if (t === TL.MUD || t === TL.POOL) return "mud";
    return "grass";
  };

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  BS.rng = rng;
  BS.hash = function (x, y, s) {
    var h = (x * 374761393 + y * 668265263 + (s || 0) * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  /* smooth value noise, so the long grass lies in drifts, not squares */
  function vnoise(x, y, s, seed) {
    var gx = Math.floor(x / s), gy = Math.floor(y / s), fx = x / s - gx, fy = y / s - gy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = BS.hash(gx, gy, seed), b = BS.hash(gx + 1, gy, seed), c = BS.hash(gx, gy + 1, seed), d = BS.hash(gx + 1, gy + 1, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function Map(id, w, h, fill) {
    this.id = id; this.w = w; this.h = h;
    this.t = new Uint8Array(w * h);
    if (fill) this.t.fill(fill);
    this.exits = []; this.spots = []; this.looks = []; this.decor = [];
  }
  Map.prototype.get = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.t[y * this.w + x];
  };
  Map.prototype.set = function (x, y, v) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.t[y * this.w + x] = v;
  };
  Map.prototype.rect = function (x0, y0, w, h, v) {
    for (var y = y0; y < y0 + h; y++) for (var x = x0; x < x0 + w; x++) this.set(x, y, v);
  };
  Map.prototype.line = function (pts, v, wdt, only) {
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2;
      for (var k = 0; k <= n; k++) {
        var x = Math.round(a[0] + (b[0] - a[0]) * k / n), y = Math.round(a[1] + (b[1] - a[1]) * k / n);
        for (var dy = 0; dy < wdt; dy++) for (var dx = 0; dx < wdt; dx++) {
          if (!only || only(this.get(x + dx, y + dy))) this.set(x + dx, y + dy, v);
        }
      }
    }
  };

  /* ---------------- the overworld ---------------- */
  function buildOverworld() {
    var W = 84, H = 74, m = new Map("hill", W, H, TL.FIELD);
    var r = rng(1906);
    m.name = "The hill";
    m.outdoor = true;

    /* long summer grass everywhere, mown green only inside the garden */
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var n = vnoise(x, y, 7, 3) * 0.75 + vnoise(x, y, 3, 8) * 0.25;
      m.set(x, y, n > 0.56 ? TL.LONG : TL.FIELD);
    }

    /* the garden: a fence round it, the gate at the bottom, the hedge east */
    var GX = 26, GY = 3, GW = 27, GH = 22;
    m.rect(GX, GY, GW, GH, TL.GARDEN);
    for (x = GX; x < GX + GW; x++) { m.set(x, GY, TL.FENCE); m.set(x, GY + GH - 1, TL.FENCE); }
    for (y = GY; y < GY + GH; y++) { m.set(GX, y, TL.FENCE); m.set(GX + GW - 1, y, TL.HEDGE); m.set(GX + GW - 2, y, TL.HEDGE); }
    m.set(39, GY + GH - 1, TL.GATE); m.set(40, GY + GH - 1, TL.GATE);
    /* the gap in the hedge, onto the back field */
    m.set(GX + GW - 1, 17, TL.GARDEN); m.set(GX + GW - 2, 17, TL.GARDEN);
    m.set(GX + GW - 1, 18, TL.GARDEN); m.set(GX + GW - 2, 18, TL.GARDEN);
    /* the long grass taking back the bottom of the garden */
    for (y = 18; y < 24; y++) for (x = 27; x < 35; x++) if (vnoise(x, y, 3, 9) + (y - 18) * 0.08 > 0.55) m.set(x, y, TL.LONG);

    /* the house */
    m.rect(34, 7, 12, 8, TL.HOUSE);
    m.set(39, 14, TL.DOOR);
    m.house = { x: 34, y: 7, w: 12, h: 8 };
    /* the path from the door to the gate */
    m.line([[39, 15], [39, 23]], TL.ROAD, 2);
    /* lavender by the gate, gone leggy and wonderful */
    m.rect(36, 21, 2, 2, TL.LAVENDER); m.rect(42, 21, 2, 2, TL.LAVENDER);
    /* the old vegetable beds, gone to seed */
    m.rect(29, 6, 3, 2, TL.BED); m.rect(29, 10, 3, 2, TL.BED);
    /* the compost heap, by the hedge */
    m.rect(48, 19, 2, 2, TL.COMPOST);
    /* the garden tap */
    m.set(46, 15, TL.TAP);
    /* the shed: low, silvered, settled onto one hip */
    m.rect(28, 18, 5, 4, TL.SHED);
    m.set(30, 21, TL.SHEDDOOR);
    m.shed = { x: 28, y: 18, w: 5, h: 4 };

    /* the road: tips over at the crest, runs down to the woods */
    var road = [[39, 24], [39, 27], [43, 30], [47, 34], [45, 38], [38, 41], [33, 44], [34, 48], [39, 51], [40, 54]];
    m.line(road, TL.ROAD, 2);
    m.road = road;
    m.crest = { x: 39.5, y: 26 };

    /* Beck's house over the back field */
    m.rect(64, 10, 8, 6, TL.BECKHOUSE);
    m.set(67, 15, TL.BECKDOOR);
    m.beck = { x: 64, y: 10, w: 8, h: 6 };
    m.line([[54, 17], [60, 17], [67, 16]], TL.LANE, 1);
    /* the back lane, a mile down to the pit (folded to fit) */
    m.line([[68, 16], [74, 20], [77, 27], [76, 33]], TL.LANE, 2);

    /* the pit: a raw bite out of the earth, fenced in chain */
    var PX = 58, PY = 34, PW = 25, PH = 16;
    m.rect(PX, PY, PW, PH, TL.SAND);
    for (x = PX; x < PX + PW; x++) { m.set(x, PY, TL.CHAIN); m.set(x, PY + PH - 1, TL.CHAIN); }
    for (y = PY; y < PY + PH; y++) { m.set(PX, y, TL.CHAIN); m.set(PX + PW - 1, y, TL.CHAIN); }
    m.set(76, PY, TL.SAND); m.set(77, PY, TL.SAND);             // the gate, where the old dog is
    m.set(63, PY, TL.GAP);                                      // Beck's way in
    m.pit = { x: PX, y: PY, w: PW, h: PH };
    m.line([[63, 30], [63, 33]], TL.LANE, 1);
    m.line([[76, 33], [70, 31], [63, 30]], TL.LANE, 1);
    /* the piles, sorted into separate peaks, all down one side */
    [[60, 36, 4, 4], [60, 41, 4, 5], [65, 44, 4, 4]].forEach(function (p) { m.rect(p[0], p[1], p[2], p[3], TL.PILE); });
    /* a working pile beside the trailer, my own height plus a little */
    m.rect(73, 40, 2, 2, TL.PILE);
    m.workPile = { x: 73, y: 40 };
    m.piles = [[60, 36, 4, 4], [60, 41, 4, 5], [65, 44, 4, 4], [73, 40, 2, 2]];
    /* the green trailer — the site office */
    m.rect(75, 39, 5, 3, TL.TRAILER);
    m.trailer = { x: 75, y: 39, w: 5, h: 3 };
    m.window = { x: 76, y: 42 };
    /* the culvert pipe stacks to hide behind */
    m.rect(65, 37, 2, 1, TL.PIPE); m.rect(69, 36, 2, 1, TL.PIPE); m.rect(70, 41, 2, 1, TL.PIPE); m.rect(68, 45, 2, 1, TL.PIPE);

    /* the woods: a dark line across the whole bottom of the world */
    for (y = 53; y < H; y++) for (x = 0; x < W; x++) {
      var edge = 53 + Math.round(BS.hash(x, 0, 11) * 2);
      if (y >= edge) m.set(x, y, TL.WOOD);
    }
    /* the road runs right up to the trees before the dark takes it */
    m.rect(40, 51, 2, 3, TL.ROAD);
    /* a few lone trees in the field and along the hedges */
    var lone = [[22, 8], [20, 20], [24, 30], [56, 9], [58, 26], [30, 34], [50, 40], [18, 44], [27, 46], [52, 30], [12, 30], [48, 50], [27, 52]];
    lone.forEach(function (p) { m.set(p[0], p[1], TL.TREE); });

    /* the deer path — there, but only for those who can see it */
    var deer = [[40, 54], [39, 57], [36, 59], [33, 59], [31, 61]];
    m.line(deer, TL.DEER, 2);
    /* the great gray beech where the gold runs out */
    m.rect(29, 61, 2, 2, TL.BEECH); m.beech = { x: 29, y: 61 };
    m.line([[33, 61], [33, 63]], TL.DEER, 2);
    /* east, toward the pond and Beck's side of the woods */
    m.line([[40, 57], [45, 59], [50, 60], [53, 61]], TL.DEER, 2);
    /* the hidden fork into the fold: the roots know it */
    var fold = [[32, 64], [28, 66], [24, 66], [21, 64]];
    m.line(fold, TL.ROOT, 2);
    /* the hollow: a fold with a spring, the fallen giant lying across it */
    m.rect(11, 60, 13, 10, TL.LITTER);
    m.line([[14, 59], [14, 63], [17, 69]], TL.SPRING, 1);
    m.rect(12, 64, 11, 2, TL.FALLEN);
    m.giant = { x: 12, y: 64, w: 11, h: 2 };
    m.hollow = { x: 11, y: 60, w: 13, h: 10 };
    m.seam = { x: 15, y: 66 };                                   // the coldest, wettest seam
    /* the pond, holding the whole sky upside down */
    m.rect(50, 58, 13, 10, TL.LITTER);
    m.rect(53, 60, 8, 6, TL.WATER);
    m.rect(52, 59, 10, 1, TL.MUD); m.rect(52, 66, 10, 1, TL.MUD);
    /* no rectangle: the corners give way to mud, a bay opens east, and a
       lobe reaches north toward where Beck's track comes down */
    m.set(53, 60, TL.MUD); m.set(53, 65, TL.MUD); m.set(60, 65, TL.MUD); m.set(59, 65, TL.MUD);
    m.set(61, 62, TL.WATER); m.set(61, 63, TL.WATER);
    m.set(56, 59, TL.WATER); m.set(57, 59, TL.WATER);
    m.set(52, 62, TL.ROCK); m.rock = { x: 52, y: 62 };
    m.set(51, 64, TL.FLAT); m.flat = { x: 51, y: 64 };
    m.pond = { x: 50, y: 58, w: 13, h: 10 };
    /* Beck's own track down to the pond */
    m.line([[62, 52], [60, 55], [57, 58]], TL.DEER, 2);
    m.line([[62, 50], [62, 53]], TL.LANE, 1);

    /* deer path and root fork are woods until revealed */
    m.hidden = { deer: true, root: true };

    /* doors */
    m.exits.push({ x: 39, y: 14, to: "house", tx: 6, ty: 12, dir: "up", label: "Go in" });
    m.exits.push({ x: 30, y: 21, to: "shed", tx: 5, ty: 7, dir: "up", label: "The shed", lock: "shedDoor" });
    return m;
  }

  /* ---------------- interiors (hand-drawn) ---------------- */
  function fromStrings(id, rows, legend) {
    var m = new Map(id, rows[0].length, rows.length);
    for (var y = 0; y < rows.length; y++) for (var x = 0; x < rows[y].length; x++) {
      var ch = rows[y][x];
      if (!(ch in legend)) throw new Error(id + ": unknown '" + ch + "' at " + x + "," + y);
      m.set(x, y, legend[ch]);
    }
    return m;
  }

  /* Gran's house, ground floor. The front room on the left, where Dad
     sits in his square of boxes; the kitchen on the right with the dead
     refrigerator and the window the fly works; the stairs top-left, the
     cellar door under them. */
  function buildHouse() {
    var rows = [
      "WWWWWWWWWWWWWWWWWWWWWWW",
      "WSSSSSCWWnWWWWWWnWWnWWW",
      "WSSSSS..........W.cccFW",
      "W...............W.....W",
      "W..rrrrrrrB.....W..tt.W",
      "W..rrrrrrrB.....W..tt.W",
      "WB.rrrrrrr......W.hhh.W",
      "WB.rrrrrrrBB....d.....W",
      "WBB.........B.........W",
      "W...........B...W..cccW",
      "WB..............W.....W",
      "WBBB............WBB...W",
      "W.....g.........W.....W",
      "WWWWWWXWWWWWWWWWWWWWWWW"
    ];
    var m = fromStrings("house", rows, {
      W: TL.WALL, S: TL.STAIRS, C: TL.CDOOR, n: TL.WINDOW, ".": TL.FLOOR, c: TL.COUNTER,
      F: TL.COUNTER, r: TL.RUG, B: TL.BOX, t: TL.TABLE, h: TL.CHAIR, d: TL.FLOOR, g: TL.FLOOR, X: TL.EXIT
    });
    /* the kitchen floor is tile, not board */
    for (var y = 2; y < 13; y++) for (var x = 17; x < 22; x++) if (m.get(x, y) === TL.FLOOR) m.set(x, y, TL.KFLOOR);
    m.name = "Gran's house";
    m.dark = 0.08;
    m.exits.push({ x: 6, y: 13, to: "hill", tx: 39.5, ty: 16, dir: "down", label: "Outside" });
    m.exits.push({ x: 6, y: 1, to: "cellar", tx: 3, ty: 2.7, dir: "down", label: "The cellar door", lock: "cellar" });
    m.groan = { x: 6, y: 10 };                                   // the third board from the door
    m.thirdStair = { x: 3, y: 2 };
    m.windows = [[9, 1], [16, 1], [19, 1]];
    m.pale = [[3, 0], [12, 0], [14, 0]];                          // pale squares where pictures hung
    m.hook = { x: 13, y: 0 };                                     // the little brass hook, nothing on it
    return m;
  }

  /* The cellar. Steps down in the top-left corner; jars rank on rank down
     both long walls; beams overhead (drawn by art.js across rows 3, 7, 11);
     the fallen shelf in the far corner with the book and the gold; a split
     log carried down to burn one winter and never burned; and the low
     corner where the water pools. */
  function buildCellar() {
    var rows = [
      "WWWWWWWWWWWWWWWWWWWWWW",
      "WsssWJJJJJJJJJJJJJJJJW",
      "Wsss.................W",
      "W....................W",
      "WJ..................AW",
      "WJ..................AW",
      "WJ...JJJJJ...JJJJ....W",
      "WJ...................W",
      "WJ...................W",
      "WJ...JJJJJ...JJJJ....W",
      "WJ...................W",
      "W..L..............ppFW",
      "W.LL..............ppFW",
      "WJJJJJJJJJJJJJJJJJJJJW",
      "WWWWWWWWWWWWWWWWWWWWWW"
    ];
    var m = fromStrings("cellar", rows, {
      W: TL.SWALL, s: TL.STEPS, J: TL.SHELF, ".": TL.STONE, A: TL.APPLES, L: TL.LOG, p: TL.POOL, F: TL.FSHELF
    });
    m.name = "The cellar";
    m.dark = 1;
    m.cold = true;
    m.exits.push({ x: 1, y: 1, to: "house", tx: 6, ty: 2.2, dir: "up", label: "Up the steps" });
    m.exits.push({ x: 2, y: 1, to: "house", tx: 6, ty: 2.2, dir: "up", label: "Up the steps" });
    m.exits.push({ x: 3, y: 1, to: "house", tx: 6, ty: 2.2, dir: "up", label: "Up the steps" });
    m.shelf = { x: 20, y: 11 };                                   // the fallen shelf: the book, and Mo
    m.beams = [3, 7, 11];
    return m;
  }

  /* The shed: the warm lung. Tools hung on nails, each with its painted
     outline; wire and rope on pegs; the push mower, the wheelbarrow with
     the flat; the scooter under a felt of cobweb; the lantern on its shelf
     between a can of bent nails and a radio with no knobs. */
  function buildShed() {
    var rows = [
      "BBBBBBBBBBB",
      "BTTTTTTTbbB",
      "B.........B",
      "BM.......xB",
      "B........xB",
      "Bw.......bB",
      "B.........B",
      "B.........B",
      "BBBBBEBBBBB"
    ];
    var m = fromStrings("shed", rows, {
      B: TL.BWALL, T: TL.TOOLS, b: TL.BENCH, ".": TL.SFLOOR, M: TL.MOWER, w: TL.BARROW, x: TL.SCOOT, E: TL.EXIT
    });
    m.name = "The shed";
    m.dark = 0.3;
    m.exits.push({ x: 5, y: 8, to: "hill", tx: 30.5, ty: 22.6, dir: "down", label: "Outside" });
    return m;
  }

  BS.buildWorld = function () {
    return { hill: buildOverworld(), house: buildHouse(), cellar: buildCellar(), shed: buildShed() };
  };
})();
