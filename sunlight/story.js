/* story.js — Borrowed Sunlight, played.

   Nine chapters, Monday noon to Friday morning, every beat from the book.
   The structure is the one adventure games have used since the cartridge
   days — a world that opens as you earn the things that open it — except
   that every key here is a piece of real science, and every door is a
   place in the novel:

     your eyes, adapting      → the cellar's own light, and Gran's book
     the crank lantern        → light in the dark (induction)
     the scooter dynamo       → the phone (energy changes form)
     the water-drop lens      → the small world; Mo (refraction)
     oats                     → the gold's way out under the garden (chemotaxis)
     Beck                     → the deer path (knowing how to look)
     root sight               → the fold, the hollow (mycorrhiza)
     the fallen giant         → a new question (nurse logs)
     stillness                → out of the pile (granular flow)
     the water bears          → courage (cryptobiosis)
     the crumb in the jar     → somewhere cold and wet and dark (dormancy)
     looking long             → Mo, again
     one bar                  → Gran

   Canon this file keeps: Wren is never gendered. Gran is alive and well.
   Mo's voice is never resolved — it has no name tag and comes from no
   direction. The clock is Friday keys, Thursday dewatering, Monday pour.
   The cynic's voice is Wren's own. Nobody is a villain. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio, T = 16, TL = BS.TL;
  var S = BS.story = {};
  var say = G.say, nar = G.narrate, mo = G.mo, wait = G.wait;
  var h = G.maps.hill, house = G.maps.house, cellar = G.maps.cellar;

  var ORDER = ["arrive", "cellar1", "shed", "build", "hill", "lens", "dawn", "beck", "woods", "hollow", "pit", "apology", "pond", "pump", "revive", "evening", "call", "friday", "after"];
  function at() { return G.s.beat; }
  function is() { for (var i = 0; i < arguments.length; i++) if (G.s.beat === arguments[i]) return true; return false; }
  function past(b) { return ORDER.indexOf(G.s.beat) > ORDER.indexOf(b); }
  function from(b) { return ORDER.indexOf(G.s.beat) >= ORDER.indexOf(b); }
  S.ORDER = ORDER;
  function beat(b) { G.s.beat = b; G.s.flags["b_" + b] = 1; ORDER.slice(0, ORDER.indexOf(b) + 1).forEach(function (k) { G.s.flags["b_" + k] = 1; }); stage(); G.save(); }
  S.beat = beat;
  function F(k) { return G.s.flags[k]; }
  function set(k, v) { G.s.flags[k] = v == null ? 1 : v; }
  function has(k) { return !!G.s.items[k]; }

  /* run a scene: nothing else moves while it plays */
  function scene(fn) {
    G.cut++;
    return Promise.resolve().then(fn).catch(function (e) { console.error(e); }).then(function () { G.cut = Math.max(0, G.cut - 1); G.hud(); });
  }
  S.scene = scene;
  var lastNote = 0;
  function note(text) { if (G.time() - lastNote < 1.4) return; lastNote = G.time(); G.toast(text, 3200); }

  /* ---------------- the keys ---------------- */
  var ITEMS = {
    eyes: { name: "Patient eyes", icon: "eyes", kind: "Your own", sci: "Dark adaptation",
      text: "Your eyes carry two kinds of light cells. Cones see color in daylight. Rods see in the near-dark — but bright light bleaches their pigment, rhodopsin, and it takes twenty minutes to half an hour in the dark to build it all back. Nothing in the cellar changed. I did.",
      opens: "The cellar's own light. Stand still in the dark and it gives things back. Bright light undoes it." },
    book: { name: "Gran's book", icon: "book", kind: "Found", sci: "A notebook, kept by hand",
      text: "*If you are reading this, the lights have gone out — and that is the only reason you can see.*",
      opens: "Press B (or Book) to read her pages, your field notes, and the map." },
    lantern: { name: "The crank lantern", icon: "lantern", kind: "Found", sci: "Electromagnetic induction",
      text: "Turning the handle spins a magnet inside a coil of copper wire, and a moving magnet pushes electrons along a wire: electricity, out of your arm. Michael Faraday worked it out in 1831. Nearly every power station on Earth still does the same thing — they just turn the handle with something other than an arm. Sticker on the bottom, in her hand: NEVER LET THE DARK WIN.",
      opens: "Hold C (or Crank) for light. It dies when you stop. Your arm tires." },
    scooter: { name: "The scooter dynamo", icon: "scooter", kind: "Made", sci: "Energy changes form",
      text: "At the top of the hill, the scooter holds energy just by being high up. Rolling down turns it into motion; the back wheel turns the crank; the crank spins the magnet; the magnet pushes the current; the current lights the lamp and fills the phone. None of it is made from nothing. I was spending the hill.",
      opens: "The crest of the road: ride down to charge the phone. Steer to stay on the road." },
    lens: { name: "The water-drop lens", icon: "lens", kind: "Made", sci: "Refraction & surface tension",
      text: "Surface tension pulls a small drop of water into a dome. Light slows and bends as it passes from air into water, and a curved surface bends it all toward one point — a lens. In the 1670s Antonie van Leeuwenhoek saw bacteria for the first time through a single bead of glass. A drop on a phone's camera does the same trick, ten times or so.",
      opens: "Press L (or Look) to look closer at anything, anywhere. Some things look back." },
    oats: { name: "A bag of instant oatmeal", icon: "oats", kind: "Stolen", sci: "Chemotaxis",
      text: "A slime mold grows toward food by sensing the chemicals drifting off it, and away from light and dryness. It sends threads down every way at once, then thickens the ones that reach food and lets the rest go. That is how a thing with no brain solves a maze — and how it beat half of Mr. Petrillo's class.",
      opens: "Lead the gold where it needs to go." },
    beck: { name: "Beck", icon: "beck", kind: "A friend", sci: "Knowing how to look",
      text: "A split hoofprint in the mud. A tree clawed silver where a buck rubbed the velvet off his antlers. A fan of feathers where a hawk ate well. None of it is magic. It is paying attention, for years, to a place — and she knew it without making a thing of knowing it, which is the rarest way to know anything.",
      opens: "The deer path. Follow her; let her be the one who knows." },
    roots: { name: "Root sight", icon: "roots", kind: "Learned", sci: "The mycorrhizal network",
      text: "Most trees live in partnership with fungi. White threads wrap the roots and run off through the soil, tree to tree, trading water and minerals for sugar. How much the trees help each other through it is still argued over by scientists; that the network is there, under every step, is not.",
      opens: "In the woods, look closely (L): the white threads run thickest toward hidden places." },
    log: { name: "The fallen giant", icon: "log", kind: "Understood", sci: "Nurse logs",
      text: "A great tree that falls goes on giving longer than it stood: it holds water, feeds the fungi and beetles that open it up, and the seedlings rooted in its back climb out of the shade into the gap it made. *It isn't sad to be the floor.*",
      opens: "A new question. Not how to keep Mo — how to help it cross." },
    still: { name: "Stillness", icon: "still", kind: "Learned the hard way", sci: "Granular flow — the angle of repose",
      text: "Dry sand holds a slope of about thirty-four degrees, grain locked against grain by friction. Pile on more and it holds, and holds, and lets go all at once. The warning and the collapse are the same thing. Struggling pours more sand in around you; stillness starves the flow. Then one move, with everything.",
      opens: "*Pick one way out, and go all at once, and don't argue with it.*" },
    proof: { name: "The water bears", icon: "tun", kind: "Proof", sci: "Cryptobiosis — hidden life",
      text: "Tardigrades dry down to a shriveled 'tun' with almost no water and no measurable life, and wait — for years, through boiling and freezing, even outside a rocket in space. Add water and they swell, uncurl eight stubby legs, and walk off looking for breakfast. Dried out is not the end.",
      opens: "The nerve to let them dry Mo out." },
    crumb: { name: "A crumb of gold, in a jar", icon: "jar", kind: "Carried", sci: "Dormancy — the sclerotium",
      text: "Dried slowly, a slime mold can pull itself into a hard dry crumb called a sclerotium and wait, sometimes for years. It looks like nothing. It looks like a bit of dead stuff, a stain that used to be on a board.",
      opens: "Somewhere cold, and wet, and dark." },
    looklong: { name: "Look long", icon: "eye", kind: "Chosen", sci: "Seeing takes time",
      text: "Your brain does not wait for your eyes. It guesses what you are seeing from what it expects, and fills the picture in before the light has finished arriving. Most days that is useful. The reasonable voice is that guess, said out loud — the smallest, deadest, *just*-est version of the thing. Looking long is letting the world finish.",
      opens: "Everything, again." },
    onebar: { name: "One bar", icon: "signal", kind: "Found", sci: "Radio and line of sight",
      text: "A phone talks to a tower in radio waves, and at these frequencies hills get in the way. The top of the hill, held just right and perfectly still, was the one spot on the whole forgotten slope with a clear line to anywhere.",
      opens: "Call Gran." },
    pen: { name: "The next hand", icon: "pen", kind: "Yours", sci: "Marginalia",
      text: "*It's yours now. Add to it. And when you're old, and it's full, leave it somewhere dark for the next one who's willing to go down and look.*",
      opens: "The last blank page." }
  };
  S.ITEMS = ITEMS;
  function give(id) {
    if (has(id)) return Promise.resolve();
    G.s.items[id] = Date.now(); G.s.notes[id] = 1;
    var it = ITEMS[id];
    return G.item({ name: it.name, icon: it.icon, kind: it.kind, sci: it.sci, text: it.text, opens: it.opens }).then(function () { G.hud(); G.save(); });
  }

  /* ---------------- Gran's pages (unlocked as the book is read) ---------------- */
  S.PAGES = [
    { after: "cellar1", text: "If you are reading this, the lights have gone out — and that is the only reason you can see." },
    { after: "cellar1", text: "Nearly everything worth seeing down here is too small, or too faint, for the eyes you were issued. So you will want more light, and you will want to look closer — and the lovely thing is that you can make both of those yourself, tonight, and you do not need one single item from a shop to do it. For the light: see the shed. For the looking: a single drop of clean water, set over a small round hole, will bend the whole world bigger. It always has. Start there. Be patient. And mind you look at a thing long enough to give it the chance to look back." },
    { after: "shed", text: "NEVER LET THE DARK WIN. — on the bottom of the lantern, half peeled, in her hand." },
    { after: "dawn", text: "Plums: get them right at the edge of too-ripe, the day before the wasps do, or it isn't worth the doing. — as she told it, at the kitchen table, last summer." },
    { after: "friday", text: "It's yours now. Add to it. And when you're old, and it's full, leave it somewhere dark for the next one who's willing to go down and look." }
  ];
  S.CHAPTERS = [
    ["One", "No Signal", "arrive"], ["Two", "How to Make Light", "shed"], ["Three", "The Borrowed Sun", "dawn"],
    ["Four", "What the Trees Are Saying", "woods"], ["Five", "One Grain at a Time", "pit"], ["Six", "Bears in the Water", "apology"],
    ["Seven", "The Long Dark", "pump"], ["Eight", "More Than One", "revive"], ["Nine", "Marginalia", "evening"]
  ];

  /* ---------------- precomputed light: foxfire, Mo, the threads ---------------- */
  var r = BS.rng(1957);
  function branch(x, y, a, n, step, turn, out, bandY, bandH) {
    var pts = [[x, y]];
    for (var i = 0; i < n; i++) {
      a += (r() - 0.5) * turn; x += Math.cos(a) * step; y += Math.sin(a) * step;
      if (bandY != null) { a += (bandY - y) * 0.025; }
      pts.push([x, y]);
      if (r() < 0.12 && out.length < 400) branch(x, y, a + (r() < 0.5 ? 0.8 : -0.8), Math.floor(n * 0.4), step * 0.8, turn, out, bandY, bandH);
    }
    out.push(pts);
  }
  var foxfire = [];
  cellar.beams.forEach(function (by) { for (var k = 0; k < 8; k++) branch(16 + r() * 300, by * T + 8, (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.4, 18, 4, 0.42, foxfire, by * T + 8, 6); });
  var moCellar = [];
  for (var k2 = 0; k2 < 9; k2++) branch(20 * T + 6, 11.6 * T, Math.PI + (r() - 0.5) * 2.2, 10, 4, 1.1, moCellar);
  var moHollow = [];
  for (k2 = 0; k2 < 12; k2++) branch(16 * T, 65.8 * T, (r() - 0.5) * 3 + (k2 % 2 ? 0 : Math.PI), 16, 4, 0.9, moHollow);
  function wig(pts) { var out = []; for (var i = 0; i < pts.length - 1; i++) { var a = pts[i], b = pts[i + 1], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 3); for (var j = 0; j < n; j++) { var u = j / n, wx = (a[0] + (b[0] - a[0]) * u) * T, wy = (a[1] + (b[1] - a[1]) * u) * T; out.push([wx + (BS.vn(wx, wy, 14, 3) - 0.5) * 12 + (BS.vn(wx, wy, 4, 5) - 0.5) * 3, wy + (BS.vn(wx, wy, 14, 7) - 0.5) * 12 + (BS.vn(wx, wy, 4, 9) - 0.5) * 3]); } } out.push([pts[pts.length - 1][0] * T, pts[pts.length - 1][1] * T]); return out; }
  var threads = [
    wig([[37, 15.2], [41, 17], [45, 18.6], [48.6, 20.2]]),
    wig([[48.6, 20.4], [51, 19], [53.5, 18.3], [55, 17]]),
    wig([[38.6, 15.2], [38.4, 20], [39.4, 24.5], [40.2, 28], [44, 31], [47.6, 35], [45.5, 39], [38.5, 42], [34, 45], [35, 49], [40, 52], [41, 55.5], [39.6, 58], [36.5, 60], [33.4, 60.6], [31.6, 62]])
  ];

  /* little side-threads, so the gold looks like it is reaching */
  threads.slice().forEach(function (th, ti) { for (var i = 6; i < th.length - 6; i += 9) { var p = th[i], a = r() * 6.28, out = [[p[0], p[1]]], x = p[0], y = p[1]; for (var k = 0; k < 6; k++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 3; y += Math.sin(a) * 3; out.push([x, y]); } out.wood = ti === 2; threads.push(out); } });
  function strokePolys(ctx, cam, list, col, w) {
    /* smooth curves through the midpoints, so light flows instead of zigzags */
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    list.forEach(function (pts) {
      if (pts.length < 2) return;
      ctx.moveTo(pts[0][0] - cam.x, pts[0][1] - cam.y);
      for (var i = 1; i < pts.length - 1; i++) {
        var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0] - cam.x, pts[i][1] - cam.y, mx - cam.x, my - cam.y);
      }
      var L = pts[pts.length - 1]; ctx.lineTo(L[0] - cam.x, L[1] - cam.y);
    });
    ctx.stroke();
  }

  /* the veins don't move, only their brightness does: bake them once */
  var baked = {};
  function bake(key, w, h, list, layers) {
    if (baked[key]) return baked[key];
    var c = BS.wc(w, h, 2.5), x = c.x;
    layers.forEach(function (L) { strokePolys(x, { x: 0, y: 0 }, list, L[0], L[1]); });
    baked[key] = c; return c;
  }
  function drawBaked(ctx, cam, c, a) { if (a <= 0.003) return; ctx.globalAlpha = Math.min(1, a); ctx.drawImage(c, -cam.x, -cam.y, c.w, c.h); ctx.globalAlpha = 1; }
  /* the glow pass (additive): foxfire, Mo, jars catching it */
  S.glow = function (ctx, cam, dark, t) {
    var wash = G.workLights ? 1 : Math.min(1, Math.max(0, (G.lamp.level - 0.35) * 1.6) + (G.lamp.fixed && G.lamp.fixed.map === "cellar" && !F("tipped") ? 0.7 : 0));
    if (G.mapId === "cellar") {
      var ad = G.eyes.adapt, vis = Math.max(0.08, ad) * (1 - wash);
      if (S.foxPulse) vis *= 1 + Math.max(0, 1 - (G.time() - S.foxPulse) / 3) * 1.4;
      if (vis > 0.02) {
        drawBaked(ctx, cam, bake("fox", cellar.w * T, cellar.h * T, foxfire, [["rgba(120,220,100,.07)", 5], ["rgba(150,230,110,.22)", 1.6], ["rgba(200,255,160,.55)", 0.5]]), vis);
        /* each jar holds a thin cold line of light down its side */
        for (var y = 0; y < cellar.h; y++) for (var x = 0; x < cellar.w; x++) if (cellar.get(x, y) === TL.SHELF) {
          for (var j = 0; j < 4; j++) { ctx.fillStyle = "rgba(170,240,140," + (0.35 * vis * (0.6 + 0.4 * Math.sin(t * 0.6 + x + j))) + ")"; ctx.fillRect(x * T + 2 + j * 4 - cam.x, y * T + 3 - cam.y, 1, 4); ctx.fillRect(x * T + 2 + j * 4 - cam.x, y * T + 10 - cam.y, 1, 4); }
        }
      }
      if (!F("pumped")) {
        var mv = (G.workLights ? 0.05 : Math.max(0.25, ad) * (1 - wash * 0.85)) * (0.75 + 0.25 * Math.sin(t * 0.7));
        drawBaked(ctx, cam, bake("mo", cellar.w * T, cellar.h * T, moCellar, [["rgba(255,180,60,.1)", 5], ["rgba(255,190,60,.35)", 1.6], ["rgba(255,240,170,.8)", 0.5]]), mv);
      }
    }
    if (G.mapId === "hill") {
      var night = G.s.tod === "night" || G.s.tod === "dusk" ? 1 : G.s.tod === "golden" || G.s.tod === "evening" || G.s.tod === "dawn" ? 0.6 : 0.3;
      if (F("threads") && !F("pumped")) {
        var p = 0.6 + 0.4 * Math.sin(t * 0.7);
        threads.forEach(function (th, i) {
          if ((i === 2 || th.wood) && !from("woods")) return;
          strokePolys(ctx, cam, [th], "rgba(255,200,80," + (0.22 * night * p) + ")", 1.2);
          strokePolys(ctx, cam, [th], "rgba(255,240,170," + (0.5 * night * p) + ")", 0.4);
        });
      }
      if (F("revived")) {
        var q = 0.7 + 0.3 * Math.sin(t * 0.6), grow = S.reviveT ? Math.min(1, (G.time() - S.reviveT) / 7) : 1;
        var shown = grow >= 1 ? moHollow : moHollow.map(function (pts) { return pts.slice(0, Math.max(2, Math.ceil(pts.length * grow))); });
        if (grow < 1) { q *= 1 + (1 - grow) * 1.5; }
        strokePolys(ctx, cam, shown, "rgba(255,180,60," + (0.1 * q * (0.4 + night)) + ")", 5);
        strokePolys(ctx, cam, shown, "rgba(255,190,60," + (0.35 * q * (0.4 + night)) + ")", 1.6);
        strokePolys(ctx, cam, shown, "rgba(255,240,170," + (0.75 * q * (0.4 + night)) + ")", 0.5);
      }
      if (S.crumbOnWood && !F("revived")) { ctx.fillStyle = "rgba(170,150,80,.9)"; ctx.fillRect(Math.round(15.6 * T - cam.x), Math.round(66.2 * T - cam.y), 3, 2); }
      /* fireflies in the field at dusk, frogs' eyes at the pond — handled as motes */
    }
  };
  S.under = function (ctx, cam, t) {
    if (G.mapId === "cellar" && F("pumped")) {
      /* a smear of dull yellow on an old shelf */
      ctx.fillStyle = "rgba(150,130,70,.6)"; ctx.fillRect(20 * T + 2 - cam.x, 11 * T + 6 - cam.y, 8, 4);
    }
    if (G.mapId === "hill" && F("threads") && !F("pumped")) {
      /* the threads in daylight: so faint you had to know to look */
      threads.forEach(function (th, i) { if ((i === 2 || th.wood) && !from("woods")) return; strokePolys(ctx, cam, [th], "rgba(230,180,60,.22)", 0.5); });
    }
    /* Mo's reach runs out at the beech, the way a river runs out into sand */
  };
  S.over = function (ctx, cam, t) {
    if (is("pit") && G.mapId === "hill" && S.fore && !F("sawBoard")) {
      var f = G.ent("foreman"); if (!f) return;
      var a = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][f.dir];
      ctx.fillStyle = "rgba(255,240,180,.12)"; ctx.beginPath(); ctx.moveTo(f.x - cam.x, f.y - 8 - cam.y);
      ctx.arc(f.x - cam.x, f.y - 8 - cam.y, 64, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill();
    }
  };

  /* ---------------- the cast & creatures ---------------- */
  function creatures() {
    G.creatures.length = 0;
    [[36.5, 21], [42.5, 21.2], [37.4, 21.8]].forEach(function (b, i) { G.creatures.push({ kind: "bee", map: "hill", hx: b[0] * T, hy: b[1] * T, x: 0, y: 0, t: i * 2, ph: i }); });
    G.creatures.push({ kind: "butterfly", map: "hill", hx: 46 * T, hy: 3.6 * T, x: 0, y: 0, t: 0 });
    G.creatures.push({ kind: "fly", map: "house", hx: 19.5 * T, hy: 2.2 * T, x: 0, y: 0, t: 0 });
    if (G.s.tod === "night") [[54, 59.4], [58, 59.3], [61, 62], [56, 66.3], [60, 66.2]].forEach(function (f) { G.creatures.push({ kind: "frog", map: "hill", hx: f[0] * T, hy: f[1] * T, x: 0, y: 0, t: 0 }); });
    if (G.s.tod === "night" || G.s.tod === "dusk") G.creatures = G.creatures.filter(function (c) { return c.kind !== "bee" && c.kind !== "butterfly"; });
    A.drips = [[10 * T, 3 * T], [18 * T, 12 * T], [4 * T, 9 * T], [15 * T, 6 * T]];
    A.spring = { x: 14 * T, y: 62 * T };
    A.radio = { x: 77 * T, y: 40 * T };
    A.nearMo = function () { return G.mapId === "cellar" && !F("pumped") && Math.hypot(G.p.x - 20 * T, G.p.y - 11 * T) < 70; };
  }

  /* where everyone is, for each beat — idempotent, so a loaded game can
     be put back exactly */
  function stage() {
    var b = at(), s = G.s;
    G.workLights = false; G.darkOverride = null; G.ambOverride = null; G.musicOverride = null;
    ["dad", "beck", "foreman", "loader", "dog", "truck", "w1", "w2", "w3", "jambox", "chair", "scootent"].forEach(G.drop);
    if (b !== "lens") G.lamp.fixed = null;
    /* Dad */
    if (from("arrive") && !from("pump")) {
      var pose = is("shed", "build") ? "dadDay1" : "dadSit";
      if (is("hill", "lens") && F("dadAsleep")) {
        G.put({ id: "dad", map: "hill", x: 36.6 * T, y: 16.8 * T, draw: drawChair, solid: true, w: 14, h: 8 });
      } else if (!is("hill", "lens") || !F("dadAsleep")) {
        G.put({ id: "dad", map: "house", who: pose, x: 6.5 * T, y: 8.8 * T, dir: 0, solid: true, w: 14, h: 8, bob: 1 });
      }
    }
    if (is("evening", "call")) G.put({ id: "dad", map: "house", who: "dad", x: 13.5 * T, y: 2.2 * T, dir: 1, solid: true });
    A.dad = G.ent("dad") && G.ent("dad").map === "house" ? G.ent("dad") : null;
    /* the jam, in the box that isn't coming with us */
    if (!from("evening")) G.put({ id: "jambox", map: "house", x: 9.5 * T, y: 8.9 * T, draw: drawJamBox, solid: true, w: 12, h: 8 });
    /* the house empties as the week goes */
    emptyHouse(from("evening") ? 2 : from("pit") ? 1 : 0);
    /* the scooter: in the shed until it is built */
    if (!has("scooter")) G.put({ id: "scootent", map: "shed", x: 9.5 * T, y: 4.6 * T, draw: drawScooter, solid: true, w: 10, h: 10 });
    /* the pit, alive on Wednesday morning */
    if (is("pit") && !F("sawBoard")) {
      G.put({ id: "dog", map: "hill", x: 76.5 * T, y: 33.6 * T, draw: function (c, e, cam) { G.img(BS.dog, e.x - 8, e.y - 10); c.fillStyle = "rgba(255,255,255,.7)"; c.font = "6px monospace"; if (Math.sin(G.time() * 2) > 0) c.fillText("z", e.x + 6 - cam.x, e.y - 12 - cam.y); }, solid: true, w: 12, h: 6 });
      G.put({ id: "loader", map: "hill", x: 64 * T, y: 47.5 * T, draw: function (c, e) { G.img(G.props.loader, e.x - 20, e.y - 28); }, solid: true, w: 36, h: 12, tick: loaderTick, vx: 18 });
      G.put({ id: "foreman", map: "hill", who: "worker", x: 66 * T, y: 39.6 * T, dir: 2, solid: true, tick: foremanTick, route: [[66, 39.6], [72.5, 39.6], [72.5, 44.2], [66, 44.2]], ri: 1 });
      S.fore = true;
    } else S.fore = false;
    /* Thursday: the truck in the lane, the pump going */
    if (is("pump", "revive")) G.put({ id: "truck", map: "hill", x: 41 * T, y: 28.4 * T, draw: function (c, e) { G.img(G.props.truck, e.x - 32, e.y - 30); }, solid: true, w: 60, h: 14 });
    /* Beck */
    placeBeck();
    creatures();
    G.hud();
    G.setAmbience && G.setAmbience();
  }
  S.stage = stage;
  function placeBeck() {
    var b = at();
    if (is("beck", "woods", "hollow")) G.put({ id: "beck", map: G.mapId === "hill" ? "hill" : "hill", who: "beck", x: 47 * T, y: 22 * T, follow: true, solid: false });
    if (is("pit")) G.put({ id: "beck", map: "hill", who: "beck", x: 50.5 * T, y: 16.8 * T, follow: false, solid: true });
    if (is("pond")) G.put({ id: "beck", map: "hill", who: "beck", x: 67.5 * T, y: 17 * T, follow: true, solid: false });
    if (is("revive") && !F("revived")) G.put({ id: "beck", map: G.mapId, who: "beck", x: G.p.x + 12, y: G.p.y + 4, follow: true, solid: false });
    if (is("friday")) G.put({ id: "beck", map: "hill", who: "beck", x: 52.5 * T, y: 17.4 * T, dir: 3, solid: true, draw: drawBeckBike });
    if (is("after")) G.put({ id: "beck", map: "hill", who: "beck", x: 51 * T, y: 19.5 * T, dir: 3, solid: true });
  }
  function emptyHouse(level) {
    var changed = false;
    for (var y = 0; y < house.h; y++) for (var x = 0; x < house.w; x++) {
      var t = house.get(x, y);
      var key = x + "," + y;
      if (!S.boxes) S.boxes = {};
      if (t === TL.BOX) S.boxes[key] = 1;
      if (S.boxes[key]) {
        var keep = level === 0 || (level === 1 && BS.hash(x, y, 77) < 0.55);
        var want = keep ? TL.BOX : TL.FLOOR;
        if (t !== want) { house.set(x, y, want); changed = true; }
      }
      if (level === 2 && (t === TL.RUG || t === TL.TABLE || t === TL.CHAIR)) { house.set(x, y, x > 16 ? TL.KFLOOR : TL.FLOOR); changed = true; }
    }
    if (changed) G.repaint("house");
  }
  function drawJamBox(c, e, cam) {
    var x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y);
    c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(x - 8, y - 2, 16, 4);
    c.fillStyle = "#c79a5e"; c.fillRect(x - 7, y - 10, 14, 10); c.fillStyle = "#a97e45"; c.fillRect(x - 7, y - 3, 14, 3);
    c.fillStyle = "#dcb37a"; c.fillRect(x - 9, y - 12, 4, 3); c.fillRect(x + 5, y - 12, 4, 3);     // flaps open
    if (!F("jamKept")) { c.fillStyle = "#7a1a2a"; c.fillRect(x - 4, y - 14, 4, 6); c.fillStyle = "#c33a4a"; c.fillRect(x - 3, y - 13, 1, 4); c.fillStyle = "#b8a050"; c.fillRect(x - 4, y - 15, 4, 1); }
    c.fillStyle = "#5b2340"; c.fillRect(x + 1, y - 13, 4, 5); c.fillStyle = "#b8a050"; c.fillRect(x + 1, y - 14, 4, 1);
  }
  function drawScooter(c, e, cam) {
    var x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y);
    c.fillStyle = "#1c1c1c"; c.fillRect(x - 2, y - 14, 4, 14); c.fillStyle = "#c33"; c.fillRect(x - 1, y - 13, 2, 12); c.fillStyle = "#888"; c.fillRect(x - 5, y - 15, 10, 1);
    c.fillStyle = "rgba(235,235,225,.55)"; c.fillRect(x - 5, y - 16, 10, 3); c.fillRect(x - 3, y - 6, 6, 2);    // a fall of cobweb gone thick as felt
  }
  function drawChair(c, e, cam) {
    var x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y);
    c.fillStyle = "rgba(0,0,0,.3)"; c.fillRect(x - 9, y - 1, 18, 3);
    c.fillStyle = "#2f5a7a"; c.fillRect(x - 8, y - 12, 16, 9); c.fillStyle = "#555"; c.fillRect(x - 8, y - 3, 1, 4); c.fillRect(x + 7, y - 3, 1, 4);
    G.blit(c, BS.sprite("dadDay1", 0, 0), x - 8, y - 26);
    c.fillStyle = "rgba(255,255,255,.7)"; c.font = "6px monospace"; if (Math.sin(G.time() * 1.5) > 0) c.fillText("z", x + 8, y - 24);
  }
  function drawBeckBike(c, e, cam) {
    var x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y);
    c.fillStyle = "#1c1c1c"; c.beginPath(); c.arc(x - 7, y - 3, 4, 0, 6.3); c.fill(); c.beginPath(); c.arc(x + 7, y - 3, 4, 0, 6.3); c.fill();
    c.fillStyle = "#a33"; c.fillRect(x - 7, y - 8, 14, 2);
    G.blit(c, BS.sprite("beck", 3, 0), x - 8, y - 26);
  }

  /* ---------------- the pit: the loader, the foreman ---------------- */
  function loaderTick(dt, e) {
    if (F("sawBoard")) return;
    e.x += e.vx * dt;
    if (e.x > 71 * T) e.vx = -Math.abs(e.vx); if (e.x < 61 * T) e.vx = Math.abs(e.vx);
    if (Math.abs(G.p.x - e.x) < 24 && Math.abs(G.p.y - e.y) < 12) caught("Too close to the loader — Beck yanked me back by the shirt.");
  }
  function foremanTick(dt, e) {
    if (F("sawBoard") || G.cut) return;
    var wp = e.route[e.ri], gx = wp[0] * T, gy = wp[1] * T, dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy);
    if (d < 1) { e.ri = (e.ri + 1) % e.route.length; e.pause = 1.2; }
    if (e.pause > 0) { e.pause -= dt; e.frame = 0; }
    else { var v = Math.min(d, 26 * dt); e.x += dx / d * v; e.y += dy / d * v; e.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 3) : (dy > 0 ? 0 : 1); e.walk = (e.walk || 0) + v; e.frame = Math.floor(e.walk / 7) % 4; }
    /* can he see me? a cone, blocked by pipe and trailer */
    var a = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][e.dir], px = G.p.x - e.x, py = G.p.y - (e.y - 4), pd = Math.hypot(px, py);
    if (pd < 64) {
      var da = Math.atan2(py, px) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < 0.5) {
        var clear = true;
        for (var k = 1; k < 10; k++) { var sx = e.x + px * k / 10, sy = e.y - 4 + py * k / 10, t = h.get(Math.floor(sx / T), Math.floor(sy / T)); if (t === TL.PIPE || t === TL.TRAILER) { clear = false; break; } }
        if (clear) caught("A foreman walked by — and looked. Beck dragged me flat behind the pipe and back to the fence.");
      }
    }
  }
  var caughtAt = 0;
  function caught(msg) {
    if (G.time() - caughtAt < 2 || G.cut) return; caughtAt = G.time();
    scene(function () {
      A.sfx("shout");
      return G.fade(true, 250).then(function () { G.p.x = 63.5 * T; G.p.y = 35.6 * T; var b = G.ent("beck"); if (b) { b.x = 64.5 * T; b.y = 35.6 * T; } return G.fade(false, 300); })
        .then(function () { return say("beck", "Down. *Down.* We wait for the loader to turn. Along the fence, behind the pipe stack, then the window."); })
        .then(function () { note(msg); });
    });
  }

  /* ---------------- gates & locks ---------------- */
  var lockAt = 0;
  S.locked = function (lock, ex) {
    var msg = null;
    if (lock === "cellar") {
      if (!F("dadSentCellar")) msg = "The cellar door, under the stairs. Not yet — Dad's talking.";
      else if (is("pump")) msg = null;
    }
    if (lock === "hill" && G.mapId === "house") {
      if (is("arrive")) msg = !F("dadSentCellar") ? "Outside, a hundred degrees and not one bar of anything. I came down off the stairs instead." : "Dad had said the cellar. And the cellar would be cool.";
      if (is("cellar1")) msg = "";
      if (is("pump") && !F("escorted")) msg = "";
    }
    if (lock === "house" && G.mapId === "cellar") {
      if (is("cellar1") && !has("book")) msg = "My heel had already found the lip of the step behind me. But I have always been stubborn. I'd stand right here until the dark gave up whatever it was hiding.";
      if (is("pump") && !F("escorted")) msg = "Not without Mo.";
    }
    if (lock === "shedDoor" && !F("shedOpen")) msg = is("arrive", "cellar1") ? "Gran's shed. The door has swelled in its frame." : null;
    if (lock === "shedDoor" && !F("shedOpen") && msg === null) { msg = "The door has swelled in its frame. I'll have to haul it."; }
    if (lock === "house" && G.mapId === "hill" && is("dawn", "beck") && !F("beckMet")) msg = "The gold first. The oats, the heap.";
    if (lock === "house" && G.mapId === "hill" && is("woods", "hollow")) msg = "Beck's waiting. Four days on the clock — three, really.";
    if (lock === "house" && G.mapId === "hill" && is("revive")) msg = "Not now. The woods.";
    if (msg === null) return false;
    if (G.time() - lockAt > 1.6 && msg) { lockAt = G.time(); note(msg); }
    /* step back off the threshold */
    if (!BS.SOLID[G.map.get(ex.x, ex.y)]) G.p.y += ex.dir === "up" ? 7 : -7;
    return true;
  };
  G.gate = function (tx, ty, t) {
    if (G.mapId !== "hill") return false;
    if (t === TL.GAP) return !(is("pit") && !F("sawBoard"));
    if ((tx === 76 || tx === 77) && ty === 34) return true;      // the gate, the dog, Beck's dad's work
    /* the woods are dark at night until you have the lantern and a reason */
    return false;
  };

  /* ---------------- spots: everything you can press E on ---------------- */
  function spot(o) { G.spot(o); }
  function defineSpots() {
    /* — the house — */
    spot({ id: "dad", map: "house", x: 6.5, y: 8.5, r: 22, label: "Dad", when: function () { return G.ent("dad") && G.ent("dad").map === "house"; }, act: talkDad });
    spot({ id: "jam", map: "house", x: 9.5, y: 8.5, r: 18, label: "The jar of jam", when: function () { return !from("evening"); }, act: jamBox });
    spot({ id: "window", map: "house", x: 19.5, y: 2.4, r: 20, label: "The kitchen window", act: function () { scene(function () { return nar("A fly worked the windowpane in long stupid circles. Outside, the garden stood in the heat without moving. None of them cared that I had no signal."); }); } });
    spot({ id: "fridge", map: "house", x: 21.5, y: 2.6, r: 18, label: "The refrigerator", act: function () { scene(function () { return nar("Gran's refrigerator had hummed in the corner of that kitchen my whole life, so low you'd never once have called it a sound, and now it was gone, and the silence it left behind had edges."); }); } });
    spot({ id: "pale", map: "house", x: 3.5, y: 1.4, r: 18, label: "Pale squares on the wall", when: function () { return !is("evening", "call"); }, act: function () { scene(function () { return nar("Pale squares on the wall where the pictures used to hang. If you go fast enough you don't have to look too long at them."); }); } });
    spot({ id: "stair", map: "house", x: 3.5, y: 2.4, r: 14, label: "The third stair", when: function () { return !is("arrive") || F("signalGone"); }, act: function () { scene(function () { G.signalBars = 0; G.hud(); return nar(G.s.battery > 0 ? "I held the phone up to the window, the way you'd cup your hands around the last match in a wind. Nothing. No Service." : "The third stair. The phone in my pocket, a flat black stone."); }); } });
    spot({ id: "photo", map: "house", x: 3.5, y: 10.4, r: 16, when: function () { return from("shed") && !from("evening"); }, label: "A box, a photograph face-down", act: function () { scene(function () { return nar("The photograph he'd hidden face-down when he heard me on the stairs. I didn't turn it over. Some things are too heavy to hand to a person through the air."); }); } });
    /* — the cellar — */
    spot({ id: "shelf", map: "cellar", x: 19.6, y: 11.6, r: 22, label: "The fallen shelf", act: cellarShelf });
    spot({ id: "jars", map: "cellar", x: 10.5, y: 6.4, r: 30, label: "Jars, rank on rank", when: function () { return !is("pump"); }, act: function () { scene(function () { return nar("Plums and peaches and blackberries dark as a bruise — summers she'd caught in glass and screwed the lids down on and carried down the cold stone steps to keep. Hundreds of them."); }); } });
    spot({ id: "grabjar", map: "cellar", x: 10.5, y: 1.6, r: 40, label: "Grab one of Gran's jars", when: function () { return is("pump") && !F("hasJar"); }, act: grabJar });
    /* — the shed — */
    spot({ id: "lantern", map: "shed", x: 8.5, y: 1.9, r: 18, label: "The lantern", when: function () { return !has("lantern"); }, act: getLantern });
    spot({ id: "scoot", map: "shed", x: 9.4, y: 4.4, r: 20, label: "The scooter", when: function () { return !has("scooter"); }, act: scooterSpot });
    spot({ id: "bungee", map: "shed", x: 2.5, y: 1.9, r: 16, label: "A bungee cord on a peg", when: function () { return is("build") && !F("p_bungee"); }, act: function () { part("bungee", "A bungee cord, off its peg."); } });
    spot({ id: "wire", map: "shed", x: 5.5, y: 1.9, r: 16, label: "A coil of stiff wire", when: function () { return is("build") && !F("p_wire"); }, act: function () { part("wire", "A length of Gran's stiff wire, for a little arm."); } });
    spot({ id: "tape", map: "shed", x: 9.5, y: 5.4, r: 16, label: "Electrical tape", when: function () { return is("build") && !F("p_tape"); }, act: function () { part("tape", "Electrical tape. A quantity Gran would have found excessive."); } });
    spot({ id: "radio", map: "shed", x: 8.6, y: 1.6, r: 12, when: function () { return has("lantern"); }, label: "A radio with no knobs", act: function () { scene(function () { return nar("A radio with no knobs, beside a coffee can of bent nails. Your grandmother never threw a tool away in her life."); }); } });
    /* — the garden & hill — */
    spot({ id: "shedhaul", map: "hill", x: 30.5, y: 22.4, r: 14, label: "Haul the swollen door", when: function () { return from("shed") && !F("shedOpen"); }, act: haulDoor });
    spot({ id: "crest", map: "hill", x: h.crest.x + 0.5, y: h.crest.y + 0.5, r: 22, label: "Push off down the hill", when: function () { return has("scooter") && !(is("evening") && G.s.battery >= 10) && (is("hill", "evening") || past("lens")) && !is("pump", "revive", "pit", "woods", "hollow", "pond", "apology", "call", "friday"); }, act: pushOff });
    spot({ id: "signal", map: "hill", x: h.crest.x + 0.5, y: h.crest.y - 0.6, r: 16, label: "Hold the phone up, and keep perfectly still", when: function () { return is("evening") && G.s.battery >= 10; }, act: callGran });
    spot({ id: "compost", map: "hill", x: 48.9, y: 21.6, r: 20, label: function () { return F("slime1") ? "Lead the gold toward the hedge" : "Lay the oats"; }, when: function () { return is("dawn"); }, act: oats });
    spot({ id: "tap", map: "hill", x: 46.5, y: 16.4, r: 16, label: "The garden tap", act: function () { scene(function () { return nar(from("apology") ? "Sand out of my hair, my collar, the cuffs of my jeans, a whole hill of it going down the drain." : "The garden tap, still running. The only thing up here that still did what it was told."); }); } });
    spot({ id: "lav", map: "hill", x: 39.5, y: 22, r: 20, label: "Lavender by the gate", when: function () { return !is("dawn"); }, act: function () { scene(function () { return nar("The lavender Gran had put in years ago, gone leggy and wonderful with nobody to prune it. A bee turned slow circuits in it."); }); } });
    spot({ id: "beckdoor", map: "hill", x: 67.5, y: 16.6, r: 18, label: function () { return is("apology") ? "Knock" : "Beck's door"; }, act: beckDoor });
    spot({ id: "gapnote", map: "hill", x: 63.5, y: 33.4, r: 16, label: "The gap in the fence", when: function () { return !(is("pit") && !F("sawBoard")); }, act: function () { scene(function () { return nar(past("pit") ? "I do what Beck says at the pit. Forever. That was the deal." : "The pit: a great raw bite out of the earth, all yellow-gray and glaring. Beck's dad's work."); }); } });
    spot({ id: "window", map: "hill", x: 76.5, y: 42.6, r: 16, label: "Come up slow, just my eyes over the sill", when: function () { return is("pit") && !F("sawBoard"); }, act: readBoard });
    spot({ id: "beech", map: "hill", x: 31.3, y: 62.2, r: 20, label: "Dig, where the gold gives up", when: function () { return is("woods") && F("atBeech") && !has("roots"); }, act: digBeech });
    spot({ id: "rock", map: "hill", x: 52.5, y: 62.5, r: 20, label: function () { return !F("mossPeeled") ? "The pale rock" : F("tunsSeen") && !F("mossBack") ? "Set the moss back on the wet rock" : "The pale rock"; }, when: function () { return is("pond"); }, act: rockSpot });
    spot({ id: "flat", map: "hill", x: 51.5, y: 64.5, r: 18, label: "Lay the moss in the bottle cap, and look", when: function () { return is("pond") && F("mossPeeled") && !F("tunsSeen"); }, act: lookTuns });
    spot({ id: "seam", map: "hill", x: 15.8, y: 66.4, r: 22, label: function () { return is("revive") && !F("revived") ? "The coldest, wettest seam" : is("friday") ? "Give it water, and look long" : "The fallen giant"; }, when: function () { return is("revive", "friday", "after") || (is("hollow") && false); }, act: seamSpot });
    spot({ id: "beckfri", map: "hill", x: 52.5, y: 17.4, r: 22, label: "Beck", when: function () { return is("friday", "after"); }, act: beckFriday });
  }

  /* ---------------- scenes ---------------- */

  /* Chapter One — No Signal */
  S.newGame = function () {
    return scene(function () {
      G.s.battery = 4; G.signalBars = 0;
      return G.chapter("Chapter One", "No Signal")
        .then(function () { return nar("My grandmother's house stood at the top of a hill the world had mostly forgotten, and the summer I was twelve, my father drove me up there to help him take it apart."); })
        .then(function () { return nar("She wasn't dying. I should say that right at the start. She'd simply decided, the way she decided everything, all at once and without any fuss, that a house this big and a garden this wild were more than one person wanted to keep — and she'd taken a small bright apartment in town with a balcony exactly big enough for three pots of herbs."); })
        .then(function () { return nar("What nobody had thought to warn me about was the signal."); })
        .then(function () {
          /* the one bar climbs, and trembles, and lets three days of friends spill in */
          G.signalBars = 1; G.hud(); A.sfx("signal");
          return wait(500).then(function () { A.sfx("buzz"); G.toast("Priya: did ANYONE finish the quiz", 1800); return wait(1300); })
            .then(function () { A.sfx("buzz"); G.toast("Theo: [the thing that wasn't funny that you laughed at anyway]", 1800); return wait(1500); })
            .then(function () { G.signalBars = 0; G.hud(); A.sfx("nosignal"); return wait(600); });
        })
        .then(function () { return nar("And then a cloud, or a breath of wind, or nothing at all, and it sank. And trembled. And — went out. *No Service.* Two gray words, and the whole bright world on the far side of that little pane of glass shut like a door."); })
        .then(function () { set("signalGone"); A.sfx("rip", 6.5 * T, 8.8 * T); return wait(700); })
        .then(function () { A.sfx("thunk", 6.5 * T, 8.8 * T); return say("dad", "It's just the hill. No tower for miles out this way. Your grandmother went forty years without one bar of anything and lived to tell about it."); })
        .then(function () { return say("wren", "I'm not saying I won't live."); })
        .then(function () { return say("dad", "Then quit standing on the stairs like a ghost. You're making me nervous."); })
        .then(function () { G.objective("Come down off the stairs. Dad's in the front room, in his square of boxes."); });
    });
  };
  function talkDad() {
    var b = at();
    if (b === "arrive") return scene(F("dadSentCellar") ? function () { return say("dad", "Go on. Cellar. Don't go falling in love with anything."); } : jamScene);
    if (b === "hill" || b === "lens") return scene(function () { return nar("He'd finally fallen asleep, the dish towel still on his head."); });
    if (b === "evening") return scene(function () { return nar("I didn't say anything. I just came and stood next to him and looked at the hook too."); });
    var lines = {
      cellar1: "Don't go falling in love with it.",
      shed: "Don't go in the shed. Nothing in there but rust and wasps and a tetanus shot waiting to happen.",
      build: "I said don't go in the shed. — Fine. Mind the wasps.",
      dawn: "You're up early. Or late. Whichever.",
      beck: "Who's your friend? — Beck. Good. Go on, then. Stay out of the road.",
      woods: "Be back before dark.",
      hollow: "Be back before dark.",
      pit: "Rip, thunk. Rip, thunk.",
      apology: "You're covered in sand. — I'm not going to ask. Use the tap.",
      pond: "Lantern. Good. Don't be out too late.",
      friday: "Five minutes, then we go.",
      after: "Five minutes, then we go."
    };
    return scene(function () { return say("dad", lines[b] || "Rip, thunk."); });
  }
  function jamScene() {
    return Promise.resolve()
      .then(function () { return nar("He looked tired. Boxes were stacked to the windowsill behind him, each one labeled in his hard square capitals — KITCHEN, BOOKS, FRAGILE, FRAGILE, FRAGILE — and a mug of coffee had gone cold and scummed over at his elbow because the kettle didn't work either."); })
      .then(function () { return nar("He reached into an open box, lifted out a jar, and held it up to read it against the window, and the light came through it deep and slow and red."); })
      .then(function () { return say("wren", "What is it?"); })
      .then(function () { return say("dad", "Some kind of jam. Long gone, whatever it was. We're not hauling forty pounds of old preserves clear across the county."); })
      .then(function () { return nar("And something in me went quiet and a little bit wrong — the way your foot goes wrong when you come down onto a step that isn't there. I didn't have the words for it yet."); })
      .then(function () { return say("dad", "Make yourself useful. Go on down to the cellar and see what's down there. Anything that isn't nailed down is getting left, so don't go falling in love with it. Just make sure there's nothing fixing to grow legs and walk up the stairs at the new owners."); })
      .then(function () { set("dadSentCellar"); G.objective("Go down to the cellar — the low door under the stairs."); G.save(); });
  }
  function jamBox() {
    return scene(function () {
      if (is("build") && !F("p_band")) { part("band", "A rubber band, off one of the jars in the box that isn't coming."); return; }
      if (F("jamKept")) return nar("The plum jar, in the other box now. The box that's coming with us.");
      return nar("Plum. I knew the taste of it: sweet up to a thin dark line and then a little sharp behind it, the way the best sweet things keep something almost not-sweet hidden underneath.")
        .then(function () { if (!from("shed")) return; return G.choice("The jar, in the box that isn't coming with us.", ["Move it to the other box.", "Leave it."]).then(function (i) { if (i === 0) { set("jamKept"); return nar("I moved it to the other box. If he saw, he didn't say anything."); } }); });
    });
  }

  function cellarShelf() {
    var b = at();
    if (b === "cellar1") return scene(findBook);
    if (b === "lens") return scene(lensShelf);
    if (b === "apology") return scene(askMo);
    if (b === "pump") return scene(scrapeMo);
    if (F("pumped")) return scene(function () { return nar("A smear of dull yellow on an old shelf. Just a stain."); });
    return scene(function () { return nar("The gold lay across the waxed cloth and the old wood, minding its slow bright business."); });
  }
  S.enter = function (id) {
    if (id === "cellar" && is("arrive") && F("dadSentCellar")) beat("cellar1");
    if (id === "cellar" && is("cellar1") && !F("cellarBreath")) {
      set("cellarBreath"); G.s.battery = 0; G.eyes.adapt = 0; G.hud();
      scene(function () {
        return nar("It breathed. That's the only honest way I can say it. A long slow exhale of air that had never once in its life been warm — cold and mineral and green, the smell of wet stone and old earth and apples kept too long.")
          .then(function () { return nar("By the fifth step I couldn't see my own feet. The quiet down there was so total that I could hear my own pulse going in my ears — and, over it, very small and very far, the plink, pause, plink of water finding its way down stone."); })
          .then(function () { A.loop("heart", true, 0.35); G.cynic("there's nothing down here.", 5); return wait(1200); })
          .then(function () { G.cynic("It's a cellar. It's cold and it's black and it smells like a drain.", 6); return wait(1600); })
          .then(function () { G.cynic("Go back up where the light is.", 5); G.objective("Stand still in the dark. Wait. Let it give things back."); });
      });
    }
    if (id === "house" && is("shed") && !F("spiders")) { set("spiders"); scene(spidersScene); }
    if (id === "shed" && !F("shedSmell")) { set("shedSmell"); scene(function () { return nar("A hot dry brown smell — cut grass and engine oil and sun-baked dust. The cellar and the shed were like a pair of lungs, the cold one and the hot one, breathing out the two halves of a year."); }); }
    if (id === "hill" && is("lens") && !F("dadAsleep")) { }
    if (id === "cellar" && is("lens") && !F("lensIntro")) { set("lensIntro"); G.objective("Set the lantern on the fallen shelf, by the gold."); }
    if (id === "house" && is("evening") && !F("hookSeen")) { set("hookSeen"); G.objective("Dad, in the front room, in all that emptiness."); }
    if (id === "hill" && is("pump") && F("escorted") && !F("toHollow")) { }
  };
  function findBook() {
    if (G.eyes.adapt < 0.8) return nar("I couldn't see it yet. Not until I'd stood still long enough.");
    return nar("I knew it was a book before my eyes were sure of it. It sat on the fallen shelf, square in the strongest of the glow, wrapped in a square of waxed cloth. And over the cloth — almost holding it — lay a web of the finest gold threads.")
      .then(function () { return nar("It looked arranged. It looked like it had been going somewhere. It looked — and I was embarrassed even as the thought came — like it was paying attention."); })
      .then(function () { G.cynic("It's mold. It's a fungus on a damp book in a damp cellar.", 5); return wait(900); })
      .then(function () { return nar("Where the threads ran nearest my hand they seemed to draw back. Only slightly. The way the skin on warm milk draws back from the spoon. I felt that I had been expected. That the dark had set a place."); })
      .then(function () { A.sfx("swell", "mo"); return give("book"); })
      .then(function () { return nar("Very carefully, so as not to break a single golden thread, I lifted the corner of the cloth. Her small, upright hand, every letter standing straight as though she had planted it there and waited for it to take root. It said:"); })
      .then(function () { return nar("*If you are reading this, the lights have gone out — and that is the only reason you can see.*"); })
      .then(function () { A.loop("heart", false); A.sfx("rip", 6 * T, -40 * T); return nar("Far above me, the tape gave its long tearing scream. And down in the cold, something gold and patient and entirely alive drew itself half an inch closer to my hand — and waited for me to turn the page."); })
      .then(function () { return G.chapter("Chapter Two", "How to Make Light"); })
      .then(function () { G.setTime("afternoon"); beat("shed"); G.objective("Read her book (B). It says: see the shed."); });
  }
  S.update = function (dt) {
    if (is("cellar1") && G.mapId === "cellar" && G.eyes.adapt > 0.85 && !has("eyes") && !G.cut) {
      scene(function () {
        return nar("And the dark began, very slowly, to give things back. I never caught it happening — the same way you can't catch the tide.")
          .then(function () { return nar("The shelves came first. Then the round shoulders of the jars. Then the low beams overhead — and along the underside of the old wood ran a light. A pale cold green-gold light, fanned out in fine branching lines like rivers seen from very high up, like frost, like veins."); })
          .then(function () { return nar("The dark had not been empty. Not for one second. I'd come straight down out of that loud bright certain day, and my eyes had been shut to this the way a fist is shut."); })
          .then(function () { A.sfx("swell", "wonder"); S.foxPulse = G.time(); return give("eyes"); })
          .then(function () { G.objective("Something lies on the fallen shelf, in the far corner, in the strongest of the glow."); });
      });
    }
    if (is("shed", "build") && G.mapId === "shed" && has("lantern") && !F("armTired") && G.lamp.level > 0.75 && G.held("crank")) {
      set("armTired");
      setTimeout(function () {
        scene(function () {
          return nar("Cranked: light. Stopped: dark. And the trouble with making it with your arm was instantly obvious: your arm gets tired in about forty seconds, and you cannot crank a handle and hold a book and look at a small thing through a drop of water all at the same time.")
            .then(function () { G.objective("There has to be a better way to turn this than my arm. (Look around the shed.)"); });
        });
      }, 1600);
    }
    if (is("evening") && G.mapId === "house" && !F("handHeld")) {
      var d = G.ent("dad");
      if (d && Math.hypot(G.p.x - d.x, G.p.y - d.y) < 24 && G.p.still > 2.2 && !G.cut) { set("handHeld"); scene(handInHand); }
    }
    if (is("pond") && G.mapId === "hill" && !F("atPond") && G.inRect(G.p.x / T, G.p.y / T, h.pond, 0)) { set("atPond"); scene(pondArrive); }
    if (is("woods") && G.mapId === "hill" && !F("woodsIn") && G.p.y / T > 52.5) { set("woodsIn"); scene(woodsIn); }
    if (is("woods") && G.mapId === "hill" && F("woodsIn") && !F("atBeech") && Math.hypot(G.p.x - 31.6 * T, G.p.y - 61.6 * T) < 30) { set("atBeech"); scene(atBeech); }
    if (is("woods") && G.mapId === "hill" && has("roots") && !G.maps.hill.hidden.root && !F("inHollow") && G.inRect(G.p.x / T, G.p.y / T, h.hollow, 0)) { set("inHollow"); scene(hollowScene); }
    if (is("revive") && G.mapId === "hill" && !F("atSeam") && Math.hypot(G.p.x - 15.8 * T, G.p.y - 66.4 * T) < 40) { set("atSeam"); scene(function () { return nar("We had come to this exact place four days before with a plan and a future, and now we came to it with a jam jar and a dead crumb and me not believing a single thing."); }); }
    if (is("pump") && F("escorted") && G.mapId === "hill" && !F("outsideThu")) { set("outsideThu"); }
    if (is("friday") && G.mapId === "hill" && !F("beckBye") && Math.hypot(G.p.x - 52.5 * T, G.p.y - 17.4 * T) < 34 && !G.cut) { set("beckBye"); scene(beckFriday); }
  };

  /* Chapter Two — How to Make Light */
  function spidersScene() {
    return say("dad", "Anything down there?")
      .then(function () { return say("wren", "Spiders. Old jam."); })
      .then(function () { return nar("Which was true, and which was also the first real lie I ever told my father, because I did not say *and a book, and a light that shouldn't be there, and a thing made of gold that I think looked at me.* Some things you can't hand to a person through the air between you. They're too easy to drop."); })
      .then(function () { return say("dad", "Don't go in the shed. Nothing in there but rust and wasps and a tetanus shot waiting to happen. Your grandmother never threw a tool away in her life."); })
      .then(function () { return say("wren", "Okay."); })
      .then(function () { G.objective("Go straight out to the shed. (Bottom of the garden, where the mown grass gives up.)"); });
  }
  function haulDoor() {
    S.hauls = (S.hauls || 0) + 1;
    A.sfx("haul"); G.shake = 3;
    if (S.hauls < 3) { note(["The door had swelled in its frame. I hauled.", "Hauled again —"][S.hauls - 1]); return; }
    set("shedOpen"); A.sfx("door");
    note("— and when it gave, it gave all at once.");
  }
  function getLantern() {
    return scene(function () {
      return nar("It was Gran's, and I knew it the second I saw it — a fat, sturdy, ugly, wonderful thing, yellow plastic gone chalky with age, with a glass eye of a lamp on the front and, folded flat against its side, a crank handle.")
        .then(function () { return give("lantern"); })
        .then(function () { G.objective("Hold C (or Crank) to turn the handle."); });
    });
  }
  function scooterSpot() {
    if (!has("lantern")) return scene(function () { return nar("My own scooter, the one I'd left here last summer and forgotten, its handlebars furred with dust."); });
    if (is("shed")) return scene(function () {
      return nar("The crank handle turned in a circle. The scooter's back wheel turned in a circle. If a turning wheel could turn the handle, it wouldn't be my arm doing it at all. And the scooter, pointed down the hill, would roll all on its own, for free, the whole way to the bottom.")
        .then(function () { return nar("I could make light out of a hill."); })
        .then(function () { beat("build"); G.objective("Lash it together: a bungee cord, a coil of stiff wire, electrical tape — and a rubber band off a jar (the jam box, in the house)."); });
    });
    if (is("build")) {
      var need = ["bungee", "wire", "tape", "band"].filter(function (k) { return !F("p_" + k); });
      if (need.length) return scene(function () { return nar("Still missing: " + need.map(function (k) { return { bungee: "a bungee cord", wire: "stiff wire", tape: "electrical tape", band: "a rubber band (off a jar, in the house)" }[k]; }).join(", ") + "."); });
      return scene(buildScooter);
    }
  }
  function part(k, text) { set("p_" + k); A.sfx("pick"); note(text); var left = ["bungee", "wire", "tape", "band"].filter(function (q) { return !F("p_" + q); }).length; if (!left) G.objective("Everything I need. Back to the scooter in the shed."); }
  function buildScooter() {
    return nar("It took me the rest of the afternoon and most of my patience. I am not going to pretend it was elegant. I lashed the lantern to the front of the deck with the bungee cord and a quantity of electrical tape that Gran would have found excessive.")
      .then(function () { return nar("I bent the wire into a little arm, and the rubber band, and after a great deal of the kind of swearing you only do when you're alone and twelve, I got the crank handle to ride against the edge of the back wheel. I spun the wheel with my hand. The crank went around. The lamp lit."); })
      .then(function () { A.dynamo(0.8); return wait(1400); })
      .then(function () { A.dynamo(0); return nar("And there was a charging port on the bottom of that lantern, an old square one under a rubber flap — Gran really had thought of everything — and my charging cable, curled dead and useless in my pocket all day, fit."); })
      .then(function () { set("cable"); G.drop("scootent"); return give("scooter"); })
      .then(function () { G.setTime("evening"); beat("hill"); G.objective("Push the whole ridiculous machine up to the top of the hill — the crest, where the road tips over."); });
  }
  function pushOff() {
    var first = !G.s.rides;
    return scene(function () {
      return (first && is("hill") ? nar("I stood at the top where the road tipped over and ran down and down toward the dark line of the woods, and I put one foot on the deck beside my dead phone and my taped-on lantern, and I pushed off.") : Promise.resolve())
        .then(function () { if (!G.s.flags.rideHelp) { set("rideHelp"); G.toast("Steer with ← → (or the stick). Stay on the road: the long grass slows you; ruts jolt the charge out of you.", 4200); } G.cut--; return G.startRide(); })
        .then(function (res) { G.cut++; return afterRide(res); });
    });
  }
  function afterRide(res) {
    var n = G.s.rides;
    if (is("hill")) {
      if (n === 1) return nar("The hill took me. The whir of the dynamo climbed and climbed — orange thread, white glow, full white beam — light I was making out of nothing but a hill and my own willingness to fall down it. And on the deck, my phone screen flickered. And lit. And showed me a small white shape: a battery, with the smallest possible sliver of green in it.")
        .then(function () { G.toast("+" + res.charge + "% · the phone is alive", 2600); return climbBack("golden"); });
      if (n === 2) return nar("I laughed the whole way down. I climbed back up and did it again.").then(function () { return climbBack("dusk"); });
      return nar("And again. I did it until the evening had gone properly blue and the first stars had come out over the woods and the sliver of green had grown to a thin solid bar, and my legs were jelly, and I was happier than the warm bright room in the phone had made me in months — which was a strange thing to notice, and I noticed it.")
        .then(function () { G.setTime("night"); set("dadAsleep"); beat("lens"); return G.fade(true, 500); })
        .then(function () { G.p.x = 40 * T; G.p.y = 50 * T; return G.fade(false, 600); })
        .then(function () { G.objective("Carry the phone and the lantern back down into the cold. (Crank for light: the house is dark.)"); });
    }
    if (is("evening")) {
      return nar(G.s.battery >= 10 ? "A few good runs down and back had put a real bar of life in it." : "More. Another run.").then(function () { return climbBack(null); }).then(function () { if (G.s.battery >= 10) G.objective("At the very top of the hill, hold the phone just right and stand very still."); });
    }
    G.toast("+" + res.charge + "% charge", 2200);
    return climbBack(null);
  }
  function climbBack(tod) {
    return G.fade(true, 400).then(function () { if (tod) G.setTime(tod); G.p.x = (h.crest.x + 0.5) * T; G.p.y = (h.crest.y + 1.6) * T; G.p.dir = 1; stage(); return wait(200); }).then(function () { return G.fade(false, 500); });
  }
  function lensShelf() {
    if (!F("lampSet")) {
      set("lampSet");
      G.lamp.fixed = { map: "cellar", x: 19.6 * T, y: 11 * T, r: 170, i: 1 };
      return nar("I set the lantern on the fallen shelf and gave the crank a few turns — and white light filled the cellar for the first time in who knows how long, and the hundreds of jars threw back hundreds of little curved reflections, and the gold threads went pale and almost invisible in the glare, the way the stars go when you turn a light on.")
        .then(function () { return nar("Which I should have thought about. But I didn't, yet."); })
        .then(function () { return nar("And then I did the second thing Gran had told me to do — the looking thing — and it was so simple it felt like a trick. I tipped a single drop of water from my bottle onto my fingertip, and let it fall onto the tiny glass eye of the phone's camera, where it sat, holding its own round shape, shivering when I breathed."); })
        .then(function () { return give("lens"); })
        .then(function () { G.objective("Look (L) — test it on the back of your own hand first. Then the gold."); });
    }
    if (!F("tipped") && G.s.seen.hand) {
      set("tipped");
      G.lamp.fixed.r = 64; G.lamp.fixed.i = 0.55;
      return nar("I brought the lantern down low and tipped it so the beam came in sideways and lit the threads without washing them out.").then(function () { G.objective("Now: the drop of water, over the gold. (L)"); });
    }
    if (!G.s.seen.hand) return nar("First the back of my own hand. To test it. (L)");
    return nar("The gold, under the sideways light. (L, to look.)");
  }
  /* what the lens sees when the story wants it to */
  S.lensOverride = function (best) {
    if (G.mapId === "cellar" && Math.hypot(G.p.x - 19.6 * T, G.p.y - 11.6 * T) < 40) {
      if (is("lens") && !G.s.seen.hand) return { look: BS.lens.byId.hand, scene: "skin" };
      if (is("lens", "beck", "apology", "pond") || is("dawn")) return { look: BS.lens.byId.mo, scene: "mo", st: { wash: F("tipped") || !is("lens") ? 0 : 0.85 } };
      if (is("pump")) return { look: BS.lens.byId.beam, scene: G.workLights ? "washout" : "mo", st: { dry: F("pumped") ? 1 : 0 } };
    }
    if (G.mapId === "hill" && is("woods") && has("roots") && G.maps.hill.hidden.root && G.p.y / T > 55) return { look: BS.lens.byId.beech, scene: "mycel", label: "The white threads", st: {}, rootView: true };
    if (G.mapId === "hill" && is("hollow", "revive", "friday", "after") && F("revived") && Math.hypot(G.p.x - 15.8 * T, G.p.y - 66 * T) < 40) return { look: BS.lens.byId.mo, scene: "mo", st: {} };
    return null;
  };
  S.onLook = function (id, target) {
    if (id === "hand" && is("lens")) {
      setTimeout(function () { scene(function () { return nar("My plain, boring, back-of-the-hand skin rose up onto the glass as a vast dry landscape of ridges and valleys and flaking plates, with a single hair standing up out of it thick as a fallen tree. A drop of water had bent the world bigger, exactly like she said."); }).then(function () { if (!F("tipped")) G.objective("Now the gold. But the lantern's glare washes it out — tip the lantern low (E at the shelf)."); }); }, 2200);
    }
    if (id === "mo" && is("lens") && !F("tipped")) {
      $id("lnote").innerHTML = G.fmt("Too bright. Under that white glare the gold goes pale and almost invisible, the way stars go when you turn a light on. *Tip the lantern low.*");
      $id("lnote").hidden = false;
    }
    if (id === "mo" && is("lens") && F("tipped") && !F("moSpoke")) {
      set("moSpoke"); G.lensState.lock = true;
      scene(moFirst);
    }
    if (target && target.rootView && !F("rootsShown")) {
      set("rootsShown"); G.lensState.lock = true;
      scene(function () {
        return wait(1600).then(function () { return nar("The white web ran off every root in every direction — and thickest of all one way, down the slope, toward the cold. Toward water."); })
          .then(function () { G.closeLens(); G.reveal("root"); A.sfx("found"); return say("beck", "That way? That's — yeah. That's the fold. Where the spring comes up. I didn't know you could get to it from here."); })
          .then(function () { G.objective("Down into the fold — the hidden way the roots showed."); });
      });
    }
  };
  function $id(i) { return document.getElementById(i); }
  function moFirst() {
    return wait(2400)
      .then(function () { return nar("It was a city. It was a galaxy. It was rivers seen from space, except the rivers were gold, and the rivers were moving — pouring one way and then, as I watched, pausing all together, and pouring back the other, like one slow enormous heart that had no center and was beating everywhere at once."); })
      .then(function () { return say("wren", "What *are* you."); })
      .then(function () { A.sfx("swell", "mo"); return wait(1400); })
      .then(function () { return mo("Oh. You can see us."); })
      .then(function () { return mo("That's more than most ever manage. Most of you only ever look. You — you looked long enough."); })
      .then(function () { return mo("We were just about to ask you the same thing."); })
      .then(function () { return say("wren", "Are you — are you *talking?*"); })
      .then(function () { G.lensState && (G.lensState.lock = false); G.closeLens(); return nar("And far down in the gold, under the water, the slow bright rivers paused all together, the way a person pauses before they answer a question they find delightful — and then poured, all at once, the other way."); })
      .then(function () { return G.chapter("Chapter Three", "The Borrowed Sun"); })
      .then(function () { return nar("I didn't sleep that night, and I didn't want to. I read my grandmother's book cover to cover by that small light, and in between I talked to the gold, and the gold talked back — or the book did, or I did; I still couldn't tell, and I was already learning not to mind."); })
      .then(function () { G.lamp.fixed = null; G.setTime("dawn", "Tuesday"); beat("dawn"); set("threads"); return G.go("hill", 47.4, 22.2, 1); })
      .then(function () { return nar("I went up into it changed. I had spent my entire life, I understood, walking along the front of the world. And somewhere underneath it, patient and enormous and gold, the back of the world had just rolled over and said hello."); })
      .then(function () { G.objective("At the edge of the compost heap: lay oats for the gold."); });
  }

  /* Chapter Three — The Borrowed Sun */
  function oats() {
    return scene(function () {
      if (!F("slime1")) {
        return nar("It eats oats. It can't eat much else, just oats and stuff that's already rotting, and it doesn't have a mouth — it just flows over the food and goes around it and pulls it in.")
          .then(function () { G.cut--; return G.slime("dawn"); }).then(function () { G.cut++; set("slime1"); return give("oats"); })
          .then(function () { return nar("This is just where it reaches to, I thought. It runs out under the garden. The part of it out here and the part down there are the same one. It's all one."); })
          .then(function () { G.objective("Lead the gold out under the garden, toward the shade of the hedge."); });
      }
      if (!F("slime2")) return Promise.resolve().then(function () { G.cut--; return G.slime("hedge"); }).then(function () { G.cut++; set("slime2"); G.setTime("morning"); return meetBeck(); });
    });
  }
  function meetBeck() {
    G.put({ id: "beck", map: "hill", who: "beck", x: 53.5 * T, y: 17.6 * T, dir: 3, solid: true });
    A.sfx("swell", "joy");
    return say("beck", "That is the weirdest thing I have ever seen, and last summer I watched a grown man lose a fight to a goose.")
      .then(function () { return nar("I came up off the ground so fast I nearly went face-first into the compost. A kid at the gap in the hedge with a bike, maybe my age, sunburned nose, a scab on one knee the size of a quarter, and an expression of total, settled, scientific judgment."); })
      .then(function () { return G.walkTo("beck", 50.6, 20.8); })
      .then(function () { return say("beck", "You're the granddaughter. Grandkid. Whatever. From the city. Mrs. A's. I'm Beck. I live over the back field. Why are you feeding breakfast to the dirt?"); })
      .then(function () { return say("wren", "I'm not."); })
      .then(function () { return say("beck", "Okay. So what is it. Slugs? My gran pays me a nickel a slug but you have to bring her the slug, she doesn't take your word for it."); })
      .then(function () { return say("wren", "It eats oats. It doesn't have a mouth, it just sort of flows over the food — and overnight it ate a whole path of oatmeal I laid out for it, the exact path, every flake, and then — it's complicated."); })
      .then(function () { return say("beck", "It's a slime mold. What. I'm not an idiot. They did one in science that solved a maze. Mr. Petrillo showed us a video. Put oats at the two ends of a maze and the slime grows down every hallway at once and then pulls itself out of all the dead ends and leaves itself sitting in the one shortest path, like a wire. No brain. They timed it. It beat half the class."); })
      .then(function () { return say("wren", "It beat the class."); })
      .then(function () { return say("beck", "It beat the class."); })
      .then(function () { return nar("We crouched there in the wet grass with the sun coming up over the back field, and I felt something I had not felt since I'd lost my last bar of signal: somebody next to me, looking at the same thing."); })
      .then(function () { return say("beck", "What's it doing out here, though. In the heap. I thought they lived in the woods."); })
      .then(function () { return say("wren", "It comes out of the cellar. The whole thing's down there. It runs out under the garden. It's all one."); })
      .then(function () { return say("beck", "Yeah, well. Not for long."); })
      .then(function () { return say("beck", "The cellar. You know they're filling it in, right? The people who bought the place. The Renners. They're gutting the whole house. And that cellar's wet, so they're pumping it dry and filling it. Concrete. Floor to ceiling. Closing's Friday. My dad's start crew goes in Monday."); })
      .then(function () { set("knowClose"); set("knowPour"); G.hud(); A.sfx("cynic"); return nar("Today was Tuesday. Friday was the keys. Monday was the concrete. And down in the cold there was a thing made of gold that ate oats out of my hand and could not get up and leave."); })
      .then(function () { return say("wren", "It can't move. Beck. It can't move."); })
      .then(function () { return say("beck", "Yeah. I know. That's why I said not for long. — It's just a slime mold, though. Right?"); })
      .then(function () { return say("wren", "No. It's not."); })
      .then(function () { return say("beck", "Okay. Well. You want to show me, or what?"); })
      .then(function () { set("beckMet"); return cellarWithBeck(); });
  }
  function cellarWithBeck() {
    return G.fade(true, 600)
      .then(function () { G.go("cellar", 18.6, 11.6, 2, { instant: true }); G.put({ id: "beck", map: "cellar", who: "beck", x: 18.6 * T, y: 12.6 * T, dir: 2, solid: false, follow: false }); G.lamp.fixed = { map: "cellar", x: 19.6 * T, y: 11 * T, r: 60, i: 0.5 }; set("tipped"); G.eyes.adapt = 0.9; return G.fade(false, 700); })
      .then(function () { return nar("When I cranked Gran's lantern and the white light fell down the steps and woke the gold and lit the hundred glowing jars, I got to watch a kid who had named a nickel slug bounty go absolutely silent, all the way down to the bottom of her."); })
      .then(function () { return say("beck", "Oh. Oh, that's not fair. They can't. They can't fill that in."); })
      .then(function () { return mo("She's good. She looks long. There are two of you now."); })
      .then(function () { return nar("I thought, as hard as I could think a thing: *They're going to fill the cellar. On Monday. You have to let me figure out how to get you out. I'm not going to let them.*"); })
      .then(function () { return mo("Oh, child. Is that what's bothering you?"); })
      .then(function () { return mo("We have been getting out of things since long before there were houses to get out of."); })
      .then(function () { return say("beck", "Hey. Hey. What. You went weird again. What's it doing?"); })
      .then(function () { return say("wren", "I'll explain on the way up. Come on. We've got four days, and I need a shovel, and a bucket, and I need to find out everything you know about these woods."); })
      .then(function () { return say("beck", "Now *this* is the best summer I have had in my entire life."); })
      .then(function () { return G.chapter("Chapter Four", "What the Trees Are Saying"); })
      .then(function () { G.lamp.fixed = null; G.setTime("afternoon"); beat("woods"); return G.go("hill", 39.6, 25.6, 0); })
      .then(function () {
        var b = G.ent("beck"); b.follow = false; b.map = "hill"; b.solid = false; b.x = 40.4 * T; b.y = 27.4 * T;
        b.lead = h.road.slice(1).map(function (p) { return [p[0] + 1, p[1] + 1]; }).concat([[41, 55.5], [40, 57.6]]);
        b.onArrive = function () { };
        return nar("I had never in my life followed anybody anywhere. So it tells you something that by four o'clock I was half-running down the hill with a bucket banging my knee and a coil of Gran's wire over one shoulder and the book buttoned inside my shirt, following Beck — nine steps ahead and not slowing down.");
      })
      .then(function () { G.objective("Follow Beck to the dark line of the woods."); });
  }

  /* Chapter Four — What the Trees Are Saying */
  function woodsIn() {
    var b = G.ent("beck");
    G.reveal("deer");
    return say("beck", "Keep up. And once we're under the trees, stay on the deer path. You step off the deer path in there and you'll be picking briars out of your shins till Christmas.")
      .then(function () { return nar("There was a deer path. I couldn't see it. Beck could. For the first time I could remember I walked behind somebody into a place I didn't understand and let them be the one who knew — and the sky did not fall."); })
      .then(function () { return give("beck"); })
      .then(function () { return nar("The woods took us in the way the cellar had. The temperature dropped like a hand closing a door on the sun. *They're the same place,* I thought. The cellar and the woods. Two rooms of the one cold green house, breathing in the dark."); })
      .then(function () {
        if (b) { b.lead = [[39.5, 57.8], [37, 59.6], [34, 59.8], [32.6, 61.2]]; }
        G.objective("Follow the gold threads along the deer path, and Beck.");
        setTimeout(function () { if (is("woods") && !G.cut) scene(function () { return say("wren", "You're out here a lot.").then(function () { return say("beck", "It's quiet. I got four brothers. You ever lived with four brothers? It's like living inside a drum somebody's always hitting. Out here nobody's hitting the drum."); }); }); }, 7000);
      });
  }
  function atBeech() {
    return say("beck", "There. That's where your gold goes.")
      .then(function () { return nar("Under the woods the threads thinned, fainter and fewer, the gold going pale — and at the foot of a great gray beech they ran out altogether, the way a river runs out into sand. And the voice ran out with them."); })
      .then(function () { G.objective("Dig at the foot of the beech, where the gold gives up. (E)"); });
  }
  function digBeech() {
    return scene(function () {
      A.sfx("dig");
      return wait(500).then(function () { A.sfx("dig"); return nar("I cleared the leaf litter. I cut down through the dark crumbling soil. And there, threaded through it and wrapped around every last rootlet of that beech, was white."); })
        .then(function () { G.cut--; G.openLens({ look: BS.lens.byId.beech, scene: "mycel" }); G.lensState.lock = true; G.cut++; return wait(2600); })
        .then(function () { return say("beck", "Whoa. Is that — are they all connected? All of them?"); })
        .then(function () { return say("wren", "I think they're all connected. I think the whole woods is — I think it's one thing, Beck. Down here. The trees just stick up out of it."); })
        .then(function () { return say("beck", "So when my dad's crew clears a lot. When they take the trees."); })
        .then(function () { return mo("Oh. Now you're seeing it. You spend your whole lives walking along the front of the world, child. This is the back of it."); })
        .then(function () { G.lensState.lock = false; G.closeLens(); return give("roots"); })
        .then(function () { return say("beck", "We need somewhere cold and wet and dark. I know a place — down in a fold, where a spring comes up. I always find it by the cold. I don't know the way from here."); })
        .then(function () { G.objective("Somewhere cold, wet and dark. Look closely (L) at the ground here: which way do the roots run thickest?"); });
    });
  }
  function hollowScene() {
    var b = G.ent("beck"); if (b) { b.follow = false; b.lead = null; G.walkTo("beck", 19.5, 62.2); }
    A.sfx("swell", "wonder"); if (G.fountain) G.fountain(18 * T, 64 * T, 9, "200,240,150");
    return nar("A fold of the woods where the ground dropped away and a spring came up out of the hillside, so the air was colder than anywhere else, and wetter. And lying across the whole hollow, mossed over so thick it was more green than brown, was a tree.")
      .then(function () { return nar("The biggest tree I had ever seen, a giant, come down who knew how many years ago — and more alive lying on its side than anything else in that forest. Moss in a deep wet pelt. Ferns in green fountains. A whole row of seedlings, hand-high, grew straight up out of its back, reaching for the gap it had opened when it came down."); })
      .then(function () { return say("wren", "This is it. Beck, this is perfect, it's cold, it's wet, it's dark — this is where Mo can live. We'll dig it up and we'll carry it down here and —"); })
      .then(function () { return wait(900); })
      .then(function () { return nar("You cannot dig up a cellar. Mo was not a clump. Mo was the cold of it and the dark of it and the damp running down the stone and the hundred summers in their jars and the foxfire in the beams, and the gold was only the part you could see."); })
      .then(function () { return say("wren", "We can't move it. Beck. It's not a thing. It's a whole place. You can't pick up a place. You can't keep anything. Nothing keeps anything. Even the forest doesn't keep anything, it just —"); })
      .then(function () { return mo("— it just hands it on. Look at the old one, child. Look what it's doing. It isn't sad to be the floor."); })
      .then(function () { return mo("Nothing down here is trying to stay the same. That's the whole trick of it. That's how it all keeps going."); })
      .then(function () { return give("log"); })
      .then(function () { G.setTime("dusk"); return say("beck", "Hey. I'm not being a baby, but we need to be out of these woods before full dark. — We're really not going to be able to save it, are we. The slime. Your Mo."); })
      .then(function () { return say("wren", "I don't know. I think — maybe not the way I wanted to. But I don't think that's the same as not saving it. I think there's another way. I just have to figure out what it is before Monday."); })
      .then(function () { return nar("She nodded, once, like we'd shaken on something, and found the deer path I still couldn't see, and led us up out of the cold green dark — and I went up behind her, following, which I was getting better at."); })
      .then(function () { beat("hollow"); return G.chapter("Chapter Five", "One Grain at a Time"); })
      .then(function () { G.setTime("morning", "Wednesday"); beat("pit"); return G.go("hill", 49.6, 17.6, 2); })
      .then(pitMorning);
  }

  /* Chapter Five — One Grain at a Time */
  function pitMorning() {
    return nar("The whole thing was my idea, which is important, because the whole thing was also my fault. We did not actually know our deadline. Start crews change, and I was not going to bet a life on a thing somebody's brother heard.")
      .then(function () { return say("wren", "So we go look. Your dad's crew. The pit. There's a board, right? A schedule?"); })
      .then(function () { return say("beck", "There's a board, in the site office. At the pit. Which is my dad's *work*. Which has a fence. And dogs. Okay, one dog, and he's old, but still."); })
      .then(function () { return say("beck", "Wren. I'm telling you right now, the pit is the one place out here that is actually dangerous. Not pretend dangerous. You stay off the piles. The big sand piles. You do not climb them, you do not go near the bottom of them —"); })
      .then(function () { return say("wren", "I just want to read a board, Beck."); })
      .then(function () { return say("beck", "Okay. We read the board, we leave. In and out. You do exactly what I say."); })
      .then(function () { return say("wren", "I'll do exactly what you say."); })
      .then(function () { return nar("And I meant it, and I lasted about forty minutes."); })
      .then(function () {
        var b = G.ent("beck"); b.follow = false;
        b.lead = [[56, 17.5], [62, 17.2], [68.5, 17.5], [72, 21], [72, 27], [68, 30.6], [64, 30.6], [63.6, 32.6]];
        b.solid = false; b.onArrive = function () { b.lead = null; b.follow = true; };
        G.objective("Follow Beck down the back lane to the pit. In and out.");
      });
  }
  S.pitGap = function () { };
  function readBoard() {
    return scene(function () {
      return nar("I came up slow, slow, just my eyes over the sill, into the cool dark of the site office — and there it was.")
        .then(function () { G.cut--; return G.board(); }).then(function () { G.cut++; set("sawBoard"); set("knowDewater"); G.hud(); A.sfx("cynic"); })
        .then(function () { return nar("DEWATER THURS. POUR MON. *Dewater* — pump it dry. *Thursday.* Not Monday. Thursday. Which was tomorrow."); })
        .then(function () { return nar("And here is where I stopped doing exactly what Beck said. There was a second board, deeper in, with hours on it — *when* tomorrow — and from the window I couldn't read it. But there was a working pile right beside the trailer, maybe my own height plus a little."); })
        .then(function () { return say("wren", "I just need to see the other one. I'm going up the side, two seconds —"); })
        .then(function () { return say("beck", "Wren — *no* — that's a pile, you don't —"); })
        .then(function () { G.cut--; return G.sandPile(); }).then(function () { G.cut++; })
        .then(function () { A.sfx("horn"); return wait(300); })
        .then(function () { A.sfx("shout"); return say("beckdad", "HEY — HEY — who's that, what in the — BECK? *Beck?*"); })
        .then(function () { return G.fade(true, 400); })
        .then(function () { G.drop("foreman"); G.drop("loader"); G.drop("dog"); G.p.x = 72.5 * T; G.p.y = 23 * T; var b = G.ent("beck"); b.follow = false; b.lead = null; b.x = 73.6 * T; b.y = 23.4 * T; b.dir = 3; G.ambOverride = "garden"; G.setAmbience(); return G.fade(false, 600); })
        .then(function () { return nar("We ran for the gap in the fence with her dad's voice behind us cracking like a whip across the whole pit, down the back lane, lungs burning, until there was nothing but the hot quiet lane and the two of us bent over our knees, heaving. Beck wouldn't look at me."); })
        .then(function () { return say("beck", "He saw me. He saw me, Wren. At the pit. On the piles. The one thing. When I get home I am so dead."); })
        .then(function () { return say("wren", "Beck, I'm sorry, I —"); })
        .then(function () { return say("beck", "You said you'd do exactly what I said. I told you about the piles. I told you the *first* thing. And you just — you always have to be the one who —"); })
        .then(function () { return nar("She didn't finish it. She didn't have to. I'd heard the whole sentence already, in my own voice, for years."); })
        .then(function () { return say("wren", "We got it, though. We got the day."); })
        .then(function () { return say("beck", "Yeah. We got the day."); })
        .then(function () { return give("still"); })
        .then(function () { set("clockStruck", 1); return G.walkTo("beck", 68, 17, 70); })
        .then(function () { G.drop("beck"); return G.chapter("Chapter Six", "Bears in the Water"); })
        .then(function () { G.ambOverride = null; G.setTime("dusk"); beat("apology"); return G.go("hill", 46.5, 17.2, 1); })
        .then(function () { return nar("I washed the sand off under the garden tap in the last of the light, and the entire time I was thinking the same two things on a loop. *The pump comes tomorrow.* And: *Beck is gone.*"); })
        .then(function () { G.objective("Go down to the one friend you have left, and ask it the question you're most afraid of."); });
    });
  }

  /* Chapter Six — Bears in the Water */
  function askMo() {
    if (F("asked")) return nar("*It is not us you are afraid of losing. Sit with that one.*");
    set("asked");
    return say("wren", "Tomorrow they're going to dry you out. All the way. And I need you to tell me the truth. When you dry out — is that you *sleeping?* Or is that you *dying?* I have to know if I'm saving you or just watching.")
      .then(function () { return mo("Child. We have been dry before. Many times. Longer than you would believe. And we have always come back."); })
      .then(function () { return mo("But we will not lie to you, because you asked us not to. We do not come back the way you mean it. We come back. We do not always come back the same. Something carries over. Not everything."); })
      .then(function () { return mo("It is not us you are afraid of losing. Sit with that one. You'll get there."); })
      .then(function () { return nar("*That is not good enough.* I needed to watch a thing dry down to nothing and come back, with my own eyes, before tomorrow. And there was exactly one person who might know where to find such a thing, and I had left her standing in a hot lane covered in sand-mud."); })
      .then(function () { G.objective("Cross the back field in the blue dusk, and knock on Beck's door."); });
  }
  function beckDoor() {
    if (!is("apology")) {
      return scene(function () { return nar(from("pond") ? "The porch light. Behind the door, the whole loud drum of the house." : "Behind the door: a television, a baby, and at least two of four brothers, yelling about something. Like living inside a drum somebody's always hitting."); });
    }
    if (!F("asked")) return scene(function () { return nar("Not yet. First the question — down in the cellar."); });
    return scene(function () {
      A.sfx("knock");
      G.put({ id: "beck", map: "hill", who: "beck", x: 67.5 * T, y: 16.4 * T, dir: 0, solid: true });
      return (F("triedOnce") ? say("beck", "...") : nar("She opened it herself, and stepped out, and pulled the door mostly shut behind her, and stood there with her arms crossed, not saying anything, making me do it."))
        .then(function () {
          return G.choice("Say it.", [
            "“It wasn't that bad. We got the day, didn't we?”",
            "“You could've stopped me, you know.”",
            "“You were right. I always have to be the one who knows.”"
          ]);
        })
        .then(function (i) {
          if (i === 0) { set("triedOnce"); return say("beck", "We got the day. Great. Go home, Wren.").then(function () { G.drop("beck"); A.sfx("slam"); note("The door shut. That wasn't it. That was the sentence I always say instead."); }); }
          if (i === 1) { set("triedOnce"); return say("beck", "I *did* stop you. I said the first thing.").then(function () { G.drop("beck"); A.sfx("slam"); note("The door shut. That wasn't it, either."); }); }
          return apology();
        });
    });
  }
  function apology() {
    return say("wren", "You were right. About the pile. About all of it. You told me the first thing and I did it anyway, because I always — because I always have to be the one who knows. I can't stand not being the one who knows. And it almost got me killed and it got you caught, and that's mine, that's all mine, and I'm sorry. I'm really sorry, Beck.")
      .then(function () { return say("beck", "He didn't yell. That's the thing. I came in covered in sand and he just — he went white. He grabbed me and he just held on. He's seen a guy go under a pile, Wren. A grown man. He wasn't mad. He was scared. Which is worse. Being yelled at I can do."); })
      .then(function () { return say("beck", "I'm grounded till I'm forty. I had to climb out my window to answer the dumb door. — Okay. Okay. But you're buying me oatmeal till we're old. And you do what I say at the pit forever. Deal?"); })
      .then(function () { A.sfx("swell", "joy"); return say("wren", "Deal."); })
      .then(function () { return say("beck", "So why'd you really come. What is it. The pump?"); })
      .then(function () { return nar("And I told her. The whole thing, fast, on the step in the dark — that I had to *see* a thing come back from all the way dried out, or I'd never be brave enough to let it happen."); })
      .then(function () { return say("beck", "Water bears."); })
      .then(function () { return say("beck", "Tardigrades. Petrillo did them, right after the slime mold. They're microscopic, eight legs, they look like tiny gross bears in spacesuits, and they're *everywhere*, in moss, and the whole entire thing about them is they dry out. Till they're basically dead, a little dead crumb, for *years*. They found some in dried-up moss in a museum that were a hundred years old and they put water on them and they got up and walked away. They sent them to *space*, Wren. They came back."); })
      .then(function () { return say("beck", "They're the toughest thing alive and they're in the moss by my pond *right now* and we can go get one."); })
      .then(function () { return say("wren", "You knew that. You knew that the whole time."); })
      .then(function () { return say("beck", "I know lots of things. You're not the only one who reads the plaque. Get your lantern and your water-drop thing. I'll get the moss. *Now* who's the one who knows."); })
      .then(function () {
        G.setTime("night"); beat("pond");
        var b = G.ent("beck"); b.follow = false; b.solid = false;
        b.lead = [[66, 19], [60, 24], [56.5, 33], [57, 50], [61, 51.4], [62.6, 53], [61, 55.2], [58.4, 57.6], [55, 58.6], [53.4, 59.6]];
        b.onArrive = function () { b.lead = null; };
        G.objective("Follow Beck to the pond, through the night. (Crank for light.)");
      });
  }
  function pondArrive() {
    return nar("The pond at night was the most beautiful place Beck ever showed me. Black and still and holding the whole sky in it upside down, so that the pond had its own moon and its own scatter of stars lying on its face, and frogs going all around the edge of it in a deep wet chorus.")
      .then(function () { G.objective("The big pale rock at the water's edge, bone-dry on top."); });
  }
  function rockSpot() {
    return scene(function () {
      if (!F("mossPeeled")) {
        set("mossPeeled");
        return nar("Beck went straight to a big pale rock at the water's edge, sun-bleached and bone-dry on top, and peeled a patch of gray-green moss off it, crisp and brittle as an old scab, dead-looking, dry as paper, and put it in my hand.")
          .then(function () { return say("beck", "That is full of bears. Watch."); })
          .then(function () { G.objective("On the flat stone: lay the moss in the bottle cap, and look at it dry first."); });
      }
      if (F("tunsSeen") && !F("mossBack")) {
        set("mossBack");
        return nar("She set the corner of wet moss with its impossible walking miracle back, gently, gently, on the dark wet rock at the edge of the water, where it had been waiting a hundred years for somebody to look at it long enough to see it was alive.")
          .then(function () { return G.chapter("Chapter Seven", "The Long Dark"); })
          .then(function () { set("clockStruck", 2); G.setTime("dawn", "Thursday"); beat("pump"); G.drop("beck"); return G.go("cellar", 18.6, 11.4, 2); })
          .then(pumpMorning);
      }
      return nar("The pale rock, its moss back where it belongs.");
    });
  }
  function lookTuns() {
    set("tunsSeen");
    var st = { wet: 0 };
    G.openLens({ look: BS.lens.byId.tuns, scene: "tun", st: st });
    G.lensState.lock = true;
    var phase = 0;
    G.lensState.ctrl = function (dt, L) {
      if (phase === 0 && (G.tap("act") || G.tap("lens"))) { phase = 1; A.sfx("plink"); A.sfx("splash"); }
      if (phase === 1) { st.wet = Math.min(1.2, st.wet + dt * 0.12); if (st.wet > 1.1) { phase = 2; scene(afterTuns); } }
    };
    scene(function () { return nar("Curled up in among the brittle dead leaves were specks. Tiny barrel-shaped specks, shriveled, motionless. If you'd told me they were grains of dust I'd have believed you, and if you'd told me they were corpses I'd have believed that too.").then(function () { return say("wren", "They look dead."); }).then(function () { return say("beck", "They're not dead. Watch. *Watch.* (Press E — let her tip one drop of pond water on.)"); }); });
  }
  function afterTuns() {
    A.sfx("swell", "joy");
    return say("beck", "It's so *ugly*. Oh my gosh. It's so ugly. It's the best thing I've ever seen.")
      .then(function () { G.lensState.lock = false; G.closeLens(); return nar("A fat, lumbering, faintly ridiculous, gloriously alive little bear of a thing, walking across the screen on eight legs, a creature that one minute ago had been a dead crumb of dust. A thing could dry all the way down to nothing, and then water could come, and it could *get up and walk away.*"); })
      .then(function () { return give("proof"); })
      .then(function () { return say("wren", "It works. Beck. It works. When they dry Mo out tomorrow — it won't die, it'll be a dry crumb that's really sleeping, and we take it down to the hollow, and we give it water, and —"); })
      .then(function () { return nar("I stopped. Did it remember being dry? Was it the *same* one that had curled up however many years ago — or only the same little body, walking, with the someone-who-curled-up gone?"); })
      .then(function () { return mo("We do not always come back the same. It is not us you are afraid of losing."); })
      .then(function () { return say("beck", "Come on. We've got till morning to figure out the rest. And we should let the little guy go home."); })
      .then(function () { G.objective("Set the moss back on the wet rock."); });
  }

  /* Chapter Seven — The Long Dark */
  function pumpMorning() {
    G.eyes.adapt = 0.9;
    return nar("I had meant to be awake. That was the whole plan, the only plan: to be down in the cellar at first light, before anyone came. I had not slept in three nights. And somewhere in the last black hour before the dawn, in the middle of saying the goodbye I could not make myself say, I fell asleep.")
      .then(function () { A.sfx("truck"); return wait(2200); })
      .then(function () { return nar("I woke to the sound of a truck. I had slept through the dawn. They were here."); })
      .then(function () { G.objective("Get Mo into one of Gran's jars. Now."); });
  }
  function grabJar() {
    return scene(function () {
      set("hasJar");
      A.sfx("pick"); A.sfx("bump");
      return nar("I grabbed for one of Gran's jars off the shelf, and my hands were shaking so badly I knocked two others down and they didn't break, they just rolled, heavy, full of caught summers, into the dark.")
        .then(function () { return workersArrive(); });
    });
  }
  function workersArrive() {
    A.sfx("door");
    return say("worker", "Anybody down here? Hello? — Get the lights, it's black as a pocket.")
      .then(function () {
        G.put({ id: "w1", map: "cellar", who: "worker", x: 4 * T, y: 3.2 * T, dir: 0, solid: true });
        G.put({ id: "w2", map: "cellar", who: "worker2", x: 6 * T, y: 4 * T, dir: 0, solid: true });
        A.sfx("lights"); A.sfx("swell", "tension"); G.workLights = true; G.eyes.adapt = 0;
        return wait(600);
      })
      .then(function () { return nar("Not the foxfire. Not Gran's little crank lantern with its honest warm beam. Work lights, the kind that turn night into a flat white surgical day. All that soft green-gold dark vanished in an instant, washed out, erased, the way the stars go the second somebody turns on a porch light."); })
      .then(function () { return nar("And the gold beside me — under that flat white light you couldn't see it shine at all. Just a smear of yellowish stuff on an old shelf. Just a stain. And for one horrible second I saw it the way the man with the coffee would have seen it."); })
      .then(function () { return say("worker", "Hey — *hey* — kiddo, you can't be down here. This isn't a safe spot, okay? We're about to run a lot of water through here. Where're your folks?"); })
      .then(function () { A.loop("pump", true, 0.55); G.objective("Scrape the gold into the jar. One minute. Please."); });
  }
  function scrapeMo() {
    if (!F("hasJar")) return nar("A jar. I needed one of her jars.");
    if (F("pumped")) return nar("Just a stain.");
    return say("wren", "I just need one minute, please, please, just one minute —")
      .then(function () { return nar("I scraped at the shelf with the edge of the jar, scooping, frantic, getting a smear of it, a clot of the gold, into the glass — and I put my face down close, close as I had that first night."); })
      .then(function () { return say("wren", "Come back. You said you come back. Come back, please — be in here, be in the crumb, come with me, *please* —"); })
      .then(function () { return mo("Be brave, child. You'll get there. Look long, and you'll —"); })
      .then(function () { set("pumped"); A.sfx("cynic"); A.music("none"); setTimeout(function () { A.sfx("swell", "sad"); }, 1600); return wait(900); })
      .then(function () { return nar("And then the cold went out of the air. I felt the pump pull the wet up out of the stone, and the cellar's whole hundred-year breath of cold go thin and then go warm and ordinary — and the voice, mid-word, mid-*you'll*, did not finish. It just stopped."); })
      .then(function () { return give("crumb"); })
      .then(function () { return G.fade(true, 700); })
      .then(function () { set("escorted"); G.drop("w1"); G.drop("w2"); G.workLights = false; G.go("house", 19, 8, 0, { instant: true }); G.put({ id: "w1", map: "house", who: "worker", x: 19 * T, y: 9.4 * T, dir: 1, solid: true }); A.loop("pump", true, 0.35); return G.fade(false, 700); })
      .then(function () { return say("worker", "Hey. Hey, now. It's just an old cellar, bud. I know it's sad, the old place changing hands. My nan's house got sold, I know how it is. But it's just an old wet cellar. Okay? Go on and find your dad."); })
      .then(function () { G.drop("w1"); return cynicKitchen(); });
  }
  function cynicKitchen() {
    var lines = ["It's just an old cellar.", "It's just mold.", "It's just a stain on a board.", "You made it up.", "fungus doesn't talk", "a lonely kid in a dead summer with no signal", "you built a friend out of a stain and your grandmother's nice handwriting", "it was you the whole time, talking to yourself in the dark"];
    lines.forEach(function (l, i) { setTimeout(function () { G.cynic(l, 6); }, i * 650); });
    G.musicOverride = "none"; G.setAmbience();
    return wait(lines.length * 650 + 600)
      .then(function () { return nar("*You made it up,* it said. Reasonable. Kind, even, the way it always is. And I think I would have believed it — set the jar down on Gran's bare counter and walked away and grown up into the kind of person who knows that dark is just dark and a thing that's gone is gone."); })
      .then(function () { return nar("Except that Beck came through the back door."); })
      .then(function () { G.put({ id: "beck", map: "house", who: "beck", x: 21 * T, y: 11.6 * T, dir: 3, solid: true }); return G.walkTo("beck", 19.6, 9.4); })
      .then(function () { return say("beck", "Did you get it? The crumb. Did you get a piece. Is it in the jar?"); })
      .then(function () { return say("wren", "It's dead, Beck. It stopped. The voice stopped. It was just slime, I think I made the whole —"); })
      .then(function () { return say("beck", "*No.* You don't get to do that. You showed *me*. The dead thing got up and *walked*, I saw it, you saw it. This is the same. It's a dry crumb that's *sleeping*, and we are going to take it to the hollow and give it water, exactly like the bear, and you are not allowed to decide it's dead before we even try. You don't *know* it's dead. You're just scared."); })
      .then(function () { return say("beck", "So we go to the woods. Right now. And we find out."); })
      .then(function () {
        G.musicOverride = null; beat("revive"); G.setTime("morning");
        var b = G.ent("beck"); if (b) { b.follow = true; b.map = "house"; b.solid = false; }
        G.objective("To the hollow. Beck has your sleeve.");
      });
  }

  /* Chapter Eight — More Than One */
  function seamSpot() {
    if (is("friday", "after")) return scene(fridayHollow);
    if (F("revived")) return scene(function () { return nar("The gold flowing in the cold wet dark of the old wood, minding its slow bright business, at home."); });
    return scene(revive);
  }
  function revive() {
    var b = G.ent("beck"); if (b) { b.follow = false; G.walkTo("beck", 17, 66.6); }
    return say("beck", "Here. Right here. This is the spot. Cold and wet and dark, you said. Give it here.")
      .then(function () { S.crumbOnWood = true; return nar("I tipped the jar against the wet wood, and the crumb of gold slid out — a dry, dull, yellowish flake, no bigger than a cornflake, lying on the dark moss looking exactly like what the man with the coffee had said it was."); })
      .then(function () { return say("beck", "Now the water."); })
      .then(function () { A.sfx("splash"); return nar("I cupped my hands in the cold spring and let the water fall on it. And then we waited."); })
      .then(function () { var ln = ["Nothing's happening.", "The bear moved in a minute.", "It's not going to move.", "a single-celled smear", "you made the words", "waiting for it to love you back"]; ln.forEach(function (l, i) { setTimeout(function () { G.cynic(l, 6); }, i * 900); }); return wait(ln.length * 900); })
      .then(function () { return say("wren", "It's not working. Beck. It's dead. I think — I think I made it up. The whole thing. I think I was just lonely, and there was a slime mold, and I needed there to be somebody so badly that I —"); })
      .then(function () { return say("beck", "Stop it. It just — maybe it needs more — I don't know. Maybe —"); })
      .then(function () { return nar("She didn't finish, and the not-finishing was the loneliest sound I had ever heard. And I almost stood up."); })
      .then(function () { return G.choice("My hand on the cold wet wood, to push myself up —", ["Stand up. Walk away. Be a person who knows dead is dead.", "— and my hand came down on the book."]); })
      .then(function (i) {
        return (i === 0 ? nar("I had my hand on the wood to push myself up — and it came down on the book instead, buttoned inside my shirt, where it had been through all of it.") : nar("I'd forgotten it was there, buttoned inside my shirt, against my chest, through the pit and the pump and the long walk down."))
          .then(function () { return nar("*Look long enough to give it the chance to look back.* I had not looked long enough. I had let the smart voice tell me what I was seeing before I had finished seeing it — which is the one thing, the only thing, that voice is actually for."); })
          .then(function () { return nar("And I made the only real decision I have ever made. I decided I did not have to know. Maybe the voice had been my own the whole time. And maybe that did not make it *less* real. Mine was not the same as fake. Mine was not *just*."); });
      })
      .then(lookLong);
  }
  function lookLong() {
    return new Promise(function (res) {
      var st = { dry: 1 }, prog = 0, lastLine = 0, done = false;
      var lines = ["It's just a crumb.", "Nothing.", "See? Nothing.", "It's dead.", "You're kneeling in the woods pouring water on a stain.", "Just.", "It was never going to move."];
      G.openLens({ look: BS.lens.byId.mo, scene: "mo", st: st, label: "Look long" });
      G.lensState.lock = true;
      $id("lname").textContent = "Look long — keep perfectly still";
      $id("lnote").hidden = false; $id("lnote").innerHTML = G.fmt("Don't move. Don't let anyone — including yourself — tell you what you're seeing before you've seen it.");
      G.lensState.ctrl = function (dt) {
        if (done) return;
        var moving = G.held("up") || G.held("down") || G.held("left") || G.held("right") || G.held("act") || Math.abs(G.input.ax) > 0.2 || Math.abs(G.input.ay) > 0.2;
        if (moving) { if (G.time() - lastLine > 1.2) { lastLine = G.time(); G.cynic("See? Nothing.", 3); } }
        else { prog = Math.min(1, prog + dt / 22); if (G.time() - lastLine > 3.2 && prog < 0.6) { lastLine = G.time(); G.cynic(lines[Math.floor(Math.random() * lines.length)], 5); } }
        st.dry = Math.max(0, 1 - prog * 1.25);
        if (prog >= 1) { done = true; G.lensState.lock = false; scene(function () { return say("beck", "Wren. Wren, it's — *look* —"); }).then(function () { G.closeLens(); res(); }); }
      };
    }).then(function () {
      return scene(function () {
        set("revived"); S.crumbOnWood = false; A.sfx("mo"); S.reviveT = G.time(); A.sfx("swell", "wonder");
        if (G.burst) G.burst(15.8 * T, 66 * T, 40); if (G.fountain) G.fountain(16 * T, 65.6 * T, 14);
        return nar("And the crumb of gold drank. It softened. At one edge, so faint I'd have called it nothing if I'd been letting myself call things nothing, a single thread of gold reached out across the wet wood. Then another. Then, very slowly, beginning — just beginning — to shine.")
          .then(function () { return nar("It came back the way the bear had, the way the seedlings had come up out of the dead tree — reaching out into the seams of the fallen giant, the richest, oldest, most alive wood in the whole woods, the gold spreading and branching and beginning, faintly, to pulse."); })
          .then(function () { return nar("And what came — fainter than it had ever been in the cellar and somehow wider, as if it had more room now — was not the same. It did not say my name. Some of it had stayed behind in the cellar, and I would miss it, quietly, for the rest of my life. But it was not gone."); })
          .then(function () { return wait(1200); })
          .then(function () { A.sfx("swell", "mo"); return mo("Oh."); })
          .then(function () { return mo("Oh. You can see us."); })
          .then(function () { return give("looklong"); })
          .then(function () { return nar("I put my face down in the cold moss next to my friend — my changed, gone-and-returned, never-the-same, entirely real friend — and I cried until I laughed, and Beck cried too, and called it ugly. Saved. Not kept, never kept, but saved — the only way anything alive has ever, ever been."); })
          .then(function () { A.loop("pump", false); return G.chapter("Chapter Nine", "Marginalia"); })
          .then(function () { set("clockStruck", 3); G.drop("beck"); G.setTime("golden"); G.s.battery = 3; beat("evening"); return G.go("house", 13.5, 4.6, 1); })
          .then(function () { return nar("That last evening, the house was nearly empty. The rooms had gone echoey the way rooms do when the rugs are up and the pictures are down. I found him in the front room, standing in all that emptiness, looking at the pale square where a clock had hung his whole childhood, a little brass hook still sticking out of the plaster with nothing on it."); })
          .then(function () { G.objective("Go and stand next to him. You don't have to say anything."); });
      });
    });
  }

  /* Chapter Nine — Marginalia */
  function handInHand() {
    return say("dad", "My dad put that up. When I was about your age. The clock came from his dad. It's at your grandmother's now, in the new place, on the wall by the window. It's a good clock.")
      .then(function () { return nar("And then he did a thing I had never once seen my father do, which was nothing at all — he just stood there and let it be sad, without taping it shut or calling it *just* anything. There was a whole cold cellar in him too, that he kept the door shut on."); })
      .then(function () { return nar("I put my hand in his. He squeezed it. Neither of us said one word about it, which was how he needed it."); })
      .then(function () { return say("dad", "Go on. Go say your goodbyes to the place. I know you got attached. — You always do."); })
      .then(function () { G.objective("The scooter, the hill, one last time. A few runs to charge the phone — then the very top."); });
  }
  function callGran() {
    return scene(function () {
      G.cut--;
      G.toast("Hold the phone up to the sky. Keep perfectly still.", 3000);
      return G.findSignal().then(function () { G.cut++; return give("onebar"); })
        .then(function () { A.sfx("ring"); setTimeout(function () { A.sfx("swell", "warm"); }, 1900); return wait(1800); })
        .then(function () { G.s.flags.called = 1; return say("gran", "Well. There you are. I was wondering when you'd find it down there."); })
        .then(function () { return say("wren", "You knew."); })
        .then(function () { return say("gran", "Of course I knew. I've been going down those steps for forty years, my love. You think I never once stayed long enough to let my eyes go? The light in the beams? The gold on the old shelf that's cleverer than it has any business being?"); })
        .then(function () { return say("gran", "I wrapped that book and put it down there a long time ago. For whoever came along that was the kind of person to go down into the dark and stand still long enough to see it wasn't dark at all. I rather hoped it'd be you. But you can't pick. You just leave the door open and hope the right one comes through it."); })
        .then(function () { return say("wren", "They sold the house, Gran. They filled in the cellar. The gold — Mo — I couldn't —"); })
        .then(function () { return say("gran", "I know they did, sweetheart. It's a great deal of house for these old bones, and a garden I can't keep, and I'd rather be in town near all of you. A place is just a place. You can't keep a place. — But you didn't lose it, did you. I can hear it in your voice. You got it out."); })
        .then(function () { return nar("So I told her. Standing on the hill with one bar of signal, I told my grandmother everything — the lantern and the scooter and the drop of water, Beck and the pit and the sand, the water bears, the pump, the long dark, and the hollow, and the gold coming back, changed, but alive."); })
        .then(function () { return say("gran", "There. You see? It isn't the keeping. It was never the keeping. It's the carrying-on."); })
        .then(function () { return say("gran", "Now. Put your father on, would you. I don't think he's called his mother in two weeks, and I'd like to hear him try to wriggle out of why."); })
        .then(function () { beat("call"); G.setTime("dusk"); G.objective("Carry the phone down the hill to Dad, in the echoey front room."); });
    });
  }
  S.giveDad = function () { };
  function phoneToDad() {
    return nar("I gave it to my dad in the echoey empty front room, and I watched his face do something complicated when he heard her voice, and I went outside to give them the dark and the distance and the chance to reach across it — which they did, for a long time.")
      .then(function () { return G.fade(true, 800); })
      .then(function () { G.setTime("night"); G.go("hill", 39.5, 16.2, 0, { instant: true }); return G.fade(false, 900); })
      .then(function () { return nar("I sat on the back step and looked at the first stars coming out over the woods where my friend was, and felt, for the first time in a week, completely all right."); })
      .then(function () { return G.fade(true, 1200); })
      .then(function () { G.setTime("morning", "Friday"); beat("friday"); G.p.x = 47.5 * T; G.p.y = 18.2 * T; return G.fade(false, 900); })
      .then(function () { G.objective("Beck, at the gap in the hedge."); });
  }
  function beckFriday() {
    if (is("after")) return scene(function () { return say("beck", "People think *you're* strange. Go on. Before I cry and have to deny it forever."); });
    if (F("beckDone")) return scene(function () { return nar("She'd already gone, across the back field, not looking back."); });
    return scene(function () {
      set("beckDone");
      return nar("She was sitting on her bike at the gap in the hedge, grounded-till-forty and out anyway, eating my oatmeal straight out of the bag.")
        .then(function () { return say("beck", "So you're going."); })
        .then(function () { return say("wren", "I'm going."); })
        .then(function () { return say("beck", "You'll come back, though. Christmas. Summer. Whenever. Because somebody's got to keep an eye on the woods, and I can't be hiking down to that log feeding oatmeal to a slime mold by myself, people will think I'm strange."); })
        .then(function () { return say("wren", "People already think you're strange."); })
        .then(function () { return say("beck", "People think *you're* strange, and I'm the one who has to be seen with you."); })
        .then(function () { return say("beck", "Go on. Before I cry and have to deny it forever."); })
        .then(function () { return G.walkTo("beck", 62, 16.6, 80); })
        .then(function () { G.drop("beck"); return nar("And she rode off across the back field, and didn't look back, which is how I knew."); })
        .then(function () { G.objective("Down to the hollow, one last time, alone."); });
    });
  }
  function fridayHollow() {
    if (is("after")) return nar("Something gold and patient and entirely alive. *Oh — you can see us.*");
    var st = {};
    G.openLens({ look: BS.lens.byId.mo, scene: "mo", st: st, label: "At home" });
    G.lensState.lock = true;
    return wait(3500)
      .then(function () { return mo("oh — you can see us."); })
      .then(function () { G.lensState.lock = false; G.closeLens(); return nar("It didn't say my name. It never has, since. It doesn't remember the cellar, or the jar, or the first night. But sometimes, when I kneel there and look long enough — and I always do, now — it says the only thing it has ever needed to say. And I can. I always can, now. That's the thing she gave me, down in the dark, that nobody can ever fill in with concrete."); })
      .then(function () { return give("pen"); })
      .then(function () { G.objective("Before we drive away: the last blank page of her book. (B → Your page)"); set("canWrite"); });
  }
  S.wrote = function (text) {
    G.s.marginalia = text;
    if (!is("friday")) { G.save(); return; }
    set("wrote");
    BS.ui.closeAll();
    scene(function () {
      return nar("I took out her book, and I uncapped a pen, and on the last blank page, after everything she'd written, I began to write it all down, in my own hand under hers. I'm still writing it. This is it. This is the book.")
        .then(function () { return nar("And if you've read this far — if you're holding this somewhere with the lights gone out, wondering whether any of it is real, the gold and the voice and the borrowed sun — then it crossed again. It got out of one more thing. It made it all the way to you."); })
        .then(function () { return nar("So here is the only thing I know, the thing she knew, the thing the gold has been trying to tell every one of us since long before there were houses:"); })
        .then(function () { return BS.ui.ending(); })
        .then(function () { beat("after"); G.objective("The hill is yours. Look long. (" + Object.keys(G.s.seen).length + " of " + BS.lens.LOOKS.length + " small things seen.)"); });
    });
  };

  /* entering the house with the phone after the call */
  var _enter = S.enter;
  S.enter = function (id) {
    _enter(id);
    if (id === "house" && is("call") && !F("handedPhone")) { set("handedPhone"); scene(phoneToDad); }
    if (id === "cellar" && is("lens") && G.lamp.level < 0.1 && G.eyes.adapt < 0.3) note("Dark. Crank (C), or stand still and let your eyes open.");
  };

  /* ---------------- where to go next (the gold pointer) ---------------- */
  S.target = function () {
    var b = at();
    if (b === "arrive") return F("dadSentCellar") ? ["cellar", 3, 3] : ["house", 6.5, 8];
    if (b === "cellar1") return has("eyes") && !has("book") ? ["cellar", 19.6, 11.6] : null;
    if (b === "shed") return !F("shedOpen") ? ["hill", 30.5, 22.4] : !has("lantern") ? ["shed", 8.5, 1.9] : ["shed", 9.4, 4.4];
    if (b === "build") {
      if (!F("p_bungee")) return ["shed", 2.5, 1.9]; if (!F("p_wire")) return ["shed", 5.5, 1.9]; if (!F("p_tape")) return ["shed", 9.5, 5.4];
      if (!F("p_band")) return ["house", 9.5, 8.5]; return ["shed", 9.4, 4.4];
    }
    if (b === "hill") return ["hill", 40, 26.5];
    if (b === "lens") return ["cellar", 19.6, 11.6];
    if (b === "dawn") return F("beckMet") ? null : ["hill", 48.9, 21.6];
    if (b === "woods") {
      if (!F("woodsIn")) return ["hill", 40.5, 53];
      if (!F("atBeech")) return ["hill", 31.6, 61.6];
      if (!has("roots")) return ["hill", 31.3, 62.2];
      if (G.maps.hill.hidden.root) return ["hill", 33, 64];
      return ["hill", 17, 62];
    }
    if (b === "pit") { if (F("sawBoard")) return null; return G.p.y / T < 34 ? ["hill", 63.5, 33.4] : ["hill", 76.5, 42.6]; }
    if (b === "apology") return !F("asked") ? ["cellar", 19.6, 11.6] : ["hill", 67.5, 16.6];
    if (b === "pond") { if (!F("atPond")) return ["hill", 53, 59.5]; if (!F("mossPeeled") || (F("tunsSeen") && !F("mossBack"))) return ["hill", 52.5, 62.5]; if (!F("tunsSeen")) return ["hill", 51.5, 64.5]; return null; }
    if (b === "pump") return F("escorted") ? null : !F("hasJar") ? ["cellar", 10.5, 1.6] : ["cellar", 19.6, 11.6];
    if (b === "revive") return F("revived") ? null : ["hill", 15.8, 66.4];
    if (b === "evening") return !F("handHeld") ? ["house", 13.5, 2.8] : G.s.battery < 10 ? ["hill", 40, 26.5] : ["hill", 40, 25.4];
    if (b === "call") return ["house", 6, 12];
    if (b === "friday") return !F("beckDone") ? ["hill", 52.5, 17.4] : !has("pen") ? ["hill", 15.8, 66.4] : null;
    return null;
  };

  /* ---------------- a fresh start, or a loaded one ---------------- */
  S.init = function () {
    defineSpots();
    G.signalBars = 0;
    stage();
  };
  S.resume = function () {
    /* reveal what has been revealed; put back what was taken */
    if (from("woods") && F("woodsIn")) G.reveal("deer");
    if (from("hollow") || (is("woods") && F("rootsShown"))) G.reveal("root");
    if (from("woods") && !F("woodsIn")) { G.reveal("deer"); }
    stage();
    if (is("woods") && !F("woodsIn")) { var b = G.ent("beck"); if (b) { b.follow = true; } }
  };
})();
