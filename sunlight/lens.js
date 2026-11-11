/* lens.js — the drop of water.

   "A single drop of clean water, set over a small round hole, will bend
   the whole world bigger." The phone's camera, a bead of water on its
   lens, and the screen fills with a country you have never seen.

   This file is two things: the field guide — every small thing on the
   hill worth getting down close to, where it is, and the true science of
   it, in the narrator's grown-up voice — and the painter of each one, as
   it looks through the drop: a little world drawn by code, moving.

   The science is real and checked. Where the book compresses time (eyes
   adapt in minutes, not seconds; slime streams reverse every minute or
   two, not every few seconds) the note says so. */
(function () {
  "use strict";
  var BS = window.BS = window.BS || {};
  var R = BS.rng, H = BS.hash;
  var L = BS.lens = {};

  /* ---------------- the field guide ---------------- */
  /* where: [map, tileX, tileY]; when: the beat id from which it can be seen (optional) */
  L.LOOKS = [
    { id: "hand", name: "The back of my own hand", scene: "skin", where: null,
      note: "Skin is not smooth; it is plates. The outermost layer is dead cells stacked like shingles, about fifteen to twenty deep, shed at something like a million an hour without anyone noticing. The ridges are where the skin folds over the joints. A drop of water is a lens because its surface pulls itself round — surface tension — and a curved surface bends light toward a focus." },
    { id: "fly", name: "The fly on the kitchen pane", scene: "compound", where: ["house", 19, 2],
      note: "A housefly's eye is a few thousand little eyes, each one a tube with its own lens pointing a slightly different way. Together they make one coarse picture, but a fast one: a fly sees motion several times quicker than we do, which is why it is so hard to swat — and why it works a window in long stupid circles. It can see the light, but not the glass." },
    { id: "rose", name: "Dried roses gone to powder", scene: "petal", where: ["house", 11, 2],
      note: "A rose petal's top surface is a field of tiny cone-shaped cells. The cones bend light into the pigment and make the color look velvety. Dried, the cells collapse but keep their scent oils for years — which is part of why a house can smell like one person long after the roses." },
    { id: "jam", name: "The plum jam, in the wrong box", scene: "jam", where: ["house", 9, 8],
      note: "Jam keeps because of sugar. So much sugar is dissolved in the fruit that there is almost no free water left for a mold or a bacterium to use — they dry out from the outside in. Gran caught summers in glass by taking the water away. It is the same trick that something else on this hill knows, the hard way." },
    { id: "paper", name: "Gran's handwriting", scene: "paper", where: ["cellar", 20, 11], after: "shed",
      note: "Paper is a felt of plant fibers — cellulose — pressed flat. Ink does not sit on top of it; it soaks in along the fibers by capillary action, the same pull that draws water up a stem. Her small upright letters are rivers, if you get close enough." },
    { id: "foxfire", name: "The light in the beams", scene: "foxfire", where: ["cellar", 10, 3], after: "cellar1",
      note: "Foxfire is real. Certain fungi that rot wood — honey fungus is the famous one — glow a faint green as they work, by the same chemistry as a firefly: a molecule called luciferin, oxygen, and an enzyme. Nobody is completely sure why they bother. One idea: the glow draws insects that carry their spores. It is far too faint to see until your eyes have been in the dark a long while." },
    { id: "mo", name: "The gold on the fallen shelf", scene: "mo", where: ["cellar", 20, 11], after: "lens",
      note: "A slime mold — this kind is Physarum — is one single cell, sometimes a meter across, with millions of nuclei and no brain. Inside its veins the living stuff streams one way, slows, and streams back again (in real life about once a minute or two). By thickening the veins that carry food and letting the others go, it finds short paths through mazes and lays out networks that look like railway maps. Scientists have used it to redraw the Tokyo rail system." },
    { id: "stone", name: "The weeping stone", scene: "stone", where: ["cellar", 0, 6],
      note: "Cellar walls weep because the ground behind them is wet and the stone is full of tiny pores. Water creeps through by capillary action and, where it evaporates, leaves its minerals behind as crystals. Slow work, in the dark — a hundred years of it." },
    { id: "apples", name: "Apples kept too long", scene: "apple", where: ["cellar", 20, 4],
      note: "The sweet, sharp smell is yeast. Wild yeasts live on apple skins, and in a cold dark place they slowly turn the fruit's sugar into alcohol and carbon dioxide. Each yeast is a single round cell that reproduces by budding a smaller one off its side." },
    { id: "lavender", name: "Lavender by the gate", scene: "pollen", where: ["hill", 36, 21],
      note: "The smell is in tiny glands on the flowers and leaves — little balloons of oil that burst when you brush them. Pollen grains are each a hard, patterned shell with the plant's sperm cells inside, and every kind of plant has its own pattern. You could tell a field's whole history from the pollen in its mud." },
    { id: "bee", name: "A bee in the lavender", scene: "bee", where: ["hill", 43, 21],
      note: "A bee is furry for a reason. Its hairs are branched like tiny feathers, and as it flies its body builds up a static charge that pulls pollen grains straight onto it, before it even lands. It combs them into baskets on its back legs. The flowers' own charge changes after a visit — another bee can tell." },
    { id: "butterfly", name: "The white butterfly on the fence", scene: "scales", where: ["hill", 48, 3],
      note: "Butterfly wings are covered in scales laid like roof tiles. A white butterfly's whiteness is not a pigment you could squeeze out. It is light, scattered by tiny beads inside the scales. The 'dust' that comes off on your fingers is scales." },
    { id: "web", name: "A spider's web strung with dew", scene: "dew", where: ["hill", 27, 13],
      note: "Each bead of dew on the silk is a lens, exactly like the one on my phone — and each one holds a tiny upside-down picture of the garden. Spider silk is a protein, stronger than steel for its weight, and the sticky spiral threads are pulled into beads by the same surface tension that makes the drops." },
    { id: "compost", name: "The compost heap", scene: "compost", where: ["hill", 48, 19],
      note: "A compost heap is warm in the middle because it is alive. Bacteria and fungi are eating, and eating makes heat — a working heap can reach the temperature of a hot bath. Most of the life in it is too small to see; one teaspoon holds more living things than there are people on Earth." },
    { id: "grass", name: "A blade of long grass", scene: "grass", where: ["hill", 20, 34],
      note: "The skin of a leaf is dotted with mouths: pairs of curved cells called guard cells, around a pore. They swell open to let air in and close to keep water from escaping. In heat like this, the grass is holding its breath." },
    { id: "rust", name: "A bent nail in the coffee can", scene: "rust", where: ["shed", 8, 1],
      note: "Rust is iron slowly going back to the rock it was mined from: iron, water and oxygen making iron oxide. It flakes because rust takes up more room than the iron did, so it pushes itself off, letting the next layer at the air." },
    { id: "dust", name: "Gold dust in the slatted light", scene: "dust", where: ["shed", 3, 4],
      note: "You only see dust in the beam because it scatters the light sideways into your eyes. Outside the beam it is still there. A good part of house dust is us: skin, hair, threads of our clothes." },
    { id: "beech", name: "The roots of the great gray beech", scene: "mycel", where: ["hill", 30, 63], after: "woods",
      note: "Most trees live in partnership with fungi. The fungus wraps the roots in a mantle of threads — hyphae — and runs out into the soil far further than any root, trading water and minerals to the tree for sugar. Threads link tree to tree. How much the trees use that network to help one another is still argued over by scientists, but the network itself is real, and there are miles of it under every step." },
    { id: "moss", name: "Moss on a root", scene: "moss", where: ["hill", 37, 58],
      note: "A moss leaf is often just one cell thick: hold it to the light and you can see right through it. Inside each cell the green chloroplasts are carried round and round in a slow current. Moss has no roots, only anchors; it drinks through its whole surface, and can dry out and come back." },
    { id: "feather", name: "A hawk's feather", scene: "feather", where: ["hill", 44, 59], after: "woods",
      note: "A feather is a zipper. Each branch, a barb, carries hundreds of smaller barbules with hooks that catch the barbules next door. Pull a feather apart and smooth it with your fingers and it zips itself back up. Velcro was invented by someone looking closely at burrs." },
    { id: "giant", name: "The fallen giant", scene: "nurse", where: ["hill", 20, 63], after: "woods",
      note: "Ecologists call it a nurse log. A big tree that falls goes on giving for longer than it stood: it holds water like a sponge, feeds fungi and beetles that open it up, and the seedlings rooted in its back grow up out of the dark undergrowth into the gap it made. A dead tree can hold more living cells than a live one." },
    { id: "shelf", name: "A pale shelf of fungus", scene: "fungus", where: ["hill", 17, 63], after: "woods",
      note: "The underside of a bracket fungus is not gills but thousands of tiny tubes. Spores drop down the tubes and out — a single bracket can release billions in a day. The bracket itself is only the fruit. The fungus is inside the wood." },
    { id: "pondwater", name: "Pond water", scene: "diatom", where: ["hill", 54, 60],
      note: "A drop of pond water is a crowded city. Diatoms are algae that build themselves glass houses with patterned lids, and they glide by squeezing out slime. Between them, things spin and drift. Much of the oxygen you are breathing was made by creatures like these." },
    { id: "tuns", name: "Dry moss off the pale rock", scene: "tun", where: ["hill", 52, 62], after: "pond",
      note: "Water bears — tardigrades — are about half a millimeter long, eight-legged, and can dry out almost completely, pulling in their legs into a shriveled 'tun' and stopping their metabolism. In that state they have survived decades on museum shelves, boiling, freezing, and the vacuum of space. Add water and, in minutes to hours, they swell and walk. Scientists call it cryptobiosis: hidden life." },
    { id: "sand", name: "Sand from the piles", scene: "sand", where: ["hill", 72, 41], after: "pit",
      note: "Every dry sand pile has the same steepest slope it will hold, its angle of repose — for sand, about thirty to thirty-five degrees. Grains lock against each other by friction. Pile on more and it holds, and holds, and then a whole sheet lets go at once. There is no warning; the warning and the collapse are the same thing. Struggling only pours more sand around you. Stay still, spread out, and move once." },
    { id: "beam", name: "The old beam, under the work lights", scene: "washout", where: null,
      note: "The foxfire did not stop glowing when the work lights came on. It was simply drowned. Your eye judges brightness by contrast, and a faint light next to a bright one vanishes — the reason you cannot see the stars from a lit-up town. Turning the lights off again is how you get them back." }
  ];
  L.byId = {}; L.LOOKS.forEach(function (o) { L.byId[o.id] = o; });

  /* the lens has something to see everywhere; these are what a plain
     surface looks like, close */
  var TL = BS.TL;
  L.surface = function (t) {
    if (t === TL.GARDEN || t === TL.FIELD || t === TL.LONG) return "grass";
    if (t === TL.ROAD || t === TL.LANE || t === TL.SAND || t === TL.PILE) return "sand";
    if (t === TL.LITTER || t === TL.DEER || t === TL.ROOT || t === TL.WOOD) return "litter";
    if (t === TL.FLOOR || t === TL.STAIRS || t === TL.RUG || t === TL.SFLOOR || t === TL.STEPS) return "grain";
    if (t === TL.STONE || t === TL.SWALL || t === TL.KFLOOR) return "stone";
    if (t === TL.MUD || t === TL.WATER || t === TL.POOL || t === TL.SPRING) return "diatom";
    return "skin";
  };

  /* ---------------- the painters ---------------- */
  var cache = {};
  function base(id, S, fn) {
    var k = id + S;
    if (!cache[k]) { var c = BS.cv(S, S); fn(c.getContext("2d"), S, R(id.length * 977 + S)); cache[k] = c; }
    return cache[k];
  }
  function circle(x, cx, cy, r, f) { x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); if (f) { x.fillStyle = f; x.fill(); } }
  function wobble(x, pts, w, col) { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]); x.stroke(); }
  function walk(r, x0, y0, a, n, step, turn) {
    var pts = [[x0, y0]];
    for (var i = 0; i < n; i++) { a += (r() - 0.5) * turn; x0 += Math.cos(a) * step; y0 += Math.sin(a) * step; pts.push([x0, y0]); }
    return pts;
  }
  /* a branching network: used for Mo, mycelium and foxfire */
  function network(r, S, n, spread) {
    var nodes = [{ x: S / 2, y: S / 2 }], edges = [];
    for (var i = 1; i < n; i++) {
      var p = nodes[Math.floor(r() * nodes.length)];
      var a = r() * 6.2832, d = spread * (0.5 + r());
      var q = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
      if (q.x < -20 || q.y < -20 || q.x > S + 20 || q.y > S + 20) { i--; continue; }
      nodes.push(q); edges.push([p, q, 0.6 + r() * 2.4]);
    }
    /* close a few loops: real networks have cycles */
    for (i = 0; i < n / 5; i++) {
      var A = nodes[Math.floor(r() * nodes.length)], B = nodes[Math.floor(r() * nodes.length)];
      var dd = Math.hypot(A.x - B.x, A.y - B.y);
      if (dd > 8 && dd < spread * 1.6) edges.push([A, B, 0.5 + r()]);
    }
    return edges;
  }
  var nets = {};
  function net(id, S, n, spread) { var k = id + S; if (!nets[k]) nets[k] = network(R(id.length * 31 + 7), S, n, spread); return nets[k]; }

  var scenes = {
    skin: function (x, S, t) {
      x.drawImage(base("skin", S, function (x, S, r) {
        x.fillStyle = "#d9a982"; x.fillRect(0, 0, S, S);
        for (var i = 0; i < 90; i++) { var cx = r() * S, cy = r() * S, w = 20 + r() * 40; x.fillStyle = "rgba(255,230,200," + (0.08 + r() * 0.12) + ")"; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + w, cy + r() * 10); x.lineTo(cx + w * 0.8, cy + 18 + r() * 10); x.lineTo(cx - 6, cy + 14); x.closePath(); x.fill(); x.strokeStyle = "rgba(120,70,40,.25)"; x.stroke(); }
        for (i = 0; i < 9; i++) wobble(x, walk(r, -10, r() * S, 0.1 * (r() - 0.5), 30, 12, 0.4), 2, "rgba(110,60,35,.35)");
        /* one hair, thick as a fallen tree */
        wobble(x, walk(r, S * 0.2, S * 0.9, -1.1, 18, 14, 0.12), 9, "#3b2a20"); wobble(x, walk(r, S * 0.2 + 2, S * 0.9, -1.1, 18, 14, 0.12), 2, "rgba(255,255,255,.18)");
        /* and a fleck of dust like a boulder in a canyon */
        circle(x, S * 0.7, S * 0.62, 9, "#7a6a5a"); circle(x, S * 0.68, S * 0.6, 4, "#a0907e");
      }), 0, 0);
    },
    compound: function (x, S, t) {
      x.fillStyle = "#1a0c08"; x.fillRect(0, 0, S, S);
      var r = 11, h = r * 1.732;
      for (var j = -1; j < S / h + 1; j++) for (var i = -1; i < S / (r * 2) + 1; i++) {
        var cx = i * r * 2 + (j % 2 ? r : 0), cy = j * h;
        var d = Math.hypot(cx - S / 2, cy - S / 2) / S;
        var g = x.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, r);
        g.addColorStop(0, "#f2a07a"); g.addColorStop(0.5, "#a2301e"); g.addColorStop(1, "#3a0c06");
        x.fillStyle = g; circle(x, cx, cy, r - 1 - d * 3); x.fill();
        circle(x, cx - 3, cy - 4, 2, "rgba(255,255,255," + (0.35 + 0.2 * Math.sin(t * 2 + i + j)) + ")");
      }
    },
    petal: function (x, S, t) {
      x.drawImage(base("petal", S, function (x, S, r) {
        x.fillStyle = "#6a2a3a"; x.fillRect(0, 0, S, S);
        for (var j = 0; j < S; j += 16) for (var i = (j / 16 % 2) * 9; i < S; i += 18) {
          var g = x.createRadialGradient(i - 2, j - 2, 1, i, j, 10); g.addColorStop(0, "#e0a0b0"); g.addColorStop(1, "#5a1a2a");
          x.fillStyle = g; x.beginPath(); x.ellipse(i, j, 9, 7, 0.2, 0, 6.3); x.fill();
        }
        x.fillStyle = "rgba(220,200,170,.25)"; for (var k = 0; k < 40; k++) x.fillRect(r() * S, r() * S, 3, 2);
      }), 0, 0);
    },
    paper: function (x, S, t) {
      x.drawImage(base("paper", S, function (x, S, r) {
        x.fillStyle = "#e9dfc6"; x.fillRect(0, 0, S, S);
        for (var i = 0; i < 160; i++) wobble(x, walk(r, r() * S, r() * S, r() * 6.3, 8, 10, 0.5), 1 + r() * 2, "rgba(170,150,110," + (0.25 + r() * 0.3) + ")");
        /* her ink, soaked along the fibers */
        for (i = 0; i < 26; i++) wobble(x, walk(r, S * 0.15 + r() * S * 0.3, S * 0.45 + r() * 30, (r() - 0.5) * 0.6, 12, 9, 0.3), 2 + r() * 4, "rgba(30,30,60," + (0.25 + r() * 0.4) + ")");
        x.fillStyle = "rgba(30,30,60,.75)"; x.beginPath(); x.ellipse(S * 0.4, S * 0.5, S * 0.22, 10, -0.05, 0, 6.3); x.fill();
      }), 0, 0);
    },
    jam: function (x, S, t) {
      x.drawImage(base("jam", S, function (x, S, r) {
        var g = x.createRadialGradient(S * 0.4, S * 0.35, 10, S / 2, S / 2, S * 0.8); g.addColorStop(0, "#d24a5a"); g.addColorStop(1, "#3a0614"); x.fillStyle = g; x.fillRect(0, 0, S, S);
        for (var i = 0; i < 40; i++) { var cx = r() * S, cy = r() * S, s = 4 + r() * 12; x.fillStyle = "rgba(255,230,230," + (0.15 + r() * 0.25) + ")"; x.beginPath(); x.moveTo(cx, cy - s); x.lineTo(cx + s * 0.7, cy); x.lineTo(cx, cy + s); x.lineTo(cx - s * 0.7, cy); x.closePath(); x.fill(); }
      }), 0, 0);
      for (var k = 0; k < 6; k++) { var bx = (k * 53 + t * 4) % S, by = S - ((k * 37 + t * 9) % S); circle(x, bx, by, 3 + k % 3); x.strokeStyle = "rgba(255,220,220,.35)"; x.stroke(); }
    },
    foxfire: function (x, S, t, st) {
      x.fillStyle = "#120e0a"; x.fillRect(0, 0, S, S);
      x.drawImage(base("ffwood", S, function (x, S, r) { for (var j = 0; j < S; j += 3) { x.fillStyle = "rgba(60,40,24," + (0.3 + r() * 0.5) + ")"; x.fillRect(0, j, S, 2); } }), 0, 0);
      var E = net("foxfire", S, 70, 34), wash = st && st.wash || 0;
      x.globalCompositeOperation = "lighter";
      E.forEach(function (e, i) {
        var a = (0.35 + 0.25 * Math.sin(t * 0.8 + i)) * (1 - wash);
        x.strokeStyle = "rgba(160,230,120," + a + ")"; x.lineWidth = e[2]; x.beginPath(); x.moveTo(e[0].x, e[0].y); x.lineTo(e[1].x, e[1].y); x.stroke();
      });
      x.globalCompositeOperation = "source-over";
    },
    washout: function (x, S, t) {
      x.fillStyle = "#e8e2d4"; x.fillRect(0, 0, S, S);
      x.drawImage(base("ffwood2", S, function (x, S, r) { for (var j = 0; j < S; j += 3) { x.fillStyle = "rgba(120,100,70," + (0.2 + r() * 0.3) + ")"; x.fillRect(0, j, S, 2); } }), 0, 0);
      x.fillStyle = "rgba(200,190,120,.25)"; x.fillRect(S * 0.2, S * 0.4, S * 0.5, 30);
    },
    /* Mo: a city, a galaxy, rivers seen from space — and the rivers move */
    mo: function (x, S, t, st) {
      var wash = st && st.wash || 0, dry = st && st.dry || 0;
      x.fillStyle = dry ? "#3a3428" : "#16120c"; x.fillRect(0, 0, S, S);
      x.drawImage(base("mowood", S, function (x, S, r) { for (var j = 0; j < S; j += 4) { x.fillStyle = "rgba(70,60,50," + (0.2 + r() * 0.4) + ")"; x.fillRect(0, j, S, 3); } }), 0, 0);
      var E = net("mo", S, 90, 30);
      /* shuttle streaming: flow one way, pause all together, flow back */
      var period = 9, ph = (t % period) / period, dir = ph < 0.45 ? 1 : ph < 0.5 ? 0 : ph < 0.95 ? -1 : 0;
      var glow = (1 - wash) * (1 - dry);
      E.forEach(function (e, i) {
        var w = e[2] * (dry ? 0.6 : 1.4);
        x.strokeStyle = dry ? "rgba(150,130,70,.8)" : "rgba(255,200,70," + (0.35 + 0.5 * glow) + ")";
        x.lineWidth = w + 2; x.beginPath(); x.moveTo(e[0].x, e[0].y); x.lineTo(e[1].x, e[1].y); x.stroke();
        if (!dry) { x.strokeStyle = "rgba(255,240,170," + (0.6 * glow) + ")"; x.lineWidth = w * 0.5; x.stroke(); }
      });
      if (dry || glow < 0.15) return;
      x.globalCompositeOperation = "lighter";
      E.forEach(function (e, i) {
        for (var k = 0; k < 3; k++) {
          var u = ((t * 0.35 * (dir || 0.0001) + k / 3 + i * 0.13) % 1 + 1) % 1;
          if (dir === 0) u = (k / 3 + i * 0.13) % 1;
          var px = e[0].x + (e[1].x - e[0].x) * u, py = e[0].y + (e[1].y - e[0].y) * u;
          circle(x, px, py, 1.6 + e[2] * 0.4, "rgba(255,230,140," + (0.55 * glow) + ")");
        }
      });
      x.globalCompositeOperation = "source-over";
      st && (st.dir = dir);
    },
    stone: function (x, S, t) {
      x.drawImage(base("stone", S, function (x, S, r) {
        x.fillStyle = "#4a4a44"; x.fillRect(0, 0, S, S);
        for (var i = 0; i < 400; i++) { x.fillStyle = ["#5a5a52", "#3a3a34", "#6a6a60", "#2e2e2a"][i % 4]; x.fillRect(r() * S, r() * S, 2 + r() * 6, 2 + r() * 5); }
        for (i = 0; i < 30; i++) { var cx = r() * S, cy = r() * S, s = 3 + r() * 8; x.fillStyle = "rgba(230,240,240,.6)"; x.beginPath(); x.moveTo(cx, cy - s); x.lineTo(cx + s / 2, cy); x.lineTo(cx, cy + s); x.lineTo(cx - s / 2, cy); x.fill(); }
      }), 0, 0);
      x.fillStyle = "rgba(140,180,190," + (0.15 + 0.08 * Math.sin(t)) + ")"; x.fillRect(S * 0.55, 0, S * 0.12, S);
      for (var k = 0; k < 8; k++) circle(x, S * 0.6 + Math.sin(k) * 6, (t * 14 + k * 40) % S, 2, "rgba(200,230,240,.7)");
    },
    apple: function (x, S, t) {
      x.drawImage(base("apple", S, function (x, S, r) {
        x.fillStyle = "#7a3a22"; x.fillRect(0, 0, S, S);
        for (var i = 0; i < 30; i++) wobble(x, walk(r, r() * S, r() * S, r() * 6.3, 10, 8, 0.6), 2, "rgba(40,15,8,.4)");
      }), 0, 0);
      for (var k = 0; k < 14; k++) {
        var cx = 30 + (k * 71) % (S - 60), cy = 30 + (k * 113) % (S - 60);
        circle(x, cx, cy, 8, "rgba(240,230,190,.85)"); x.strokeStyle = "rgba(90,70,40,.6)"; x.stroke();
        var b = (Math.sin(t * 0.7 + k) + 1) / 2; circle(x, cx + 9, cy - 3, 2 + b * 3, "rgba(240,230,190,.85)"); x.stroke();
      }
    },
    pollen: function (x, S, t) {
      x.fillStyle = "#2a2440"; x.fillRect(0, 0, S, S);
      for (var k = 0; k < 9; k++) {
        var cx = 40 + (k * 97) % (S - 80) + Math.sin(t * 0.3 + k) * 3, cy = 40 + (k * 61) % (S - 80);
        var g = x.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, 24); g.addColorStop(0, "#f3e6a0"); g.addColorStop(1, "#8a7a3a");
        x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, 22, 16, k, 0, 6.3); x.fill();
        x.strokeStyle = "rgba(90,70,20,.6)"; for (var s = -2; s <= 2; s++) { x.beginPath(); x.ellipse(cx, cy, 22, 16 - Math.abs(s) * 5, k, 0, 6.3); x.stroke(); }
      }
      for (k = 0; k < 6; k++) circle(x, (k * 131) % S, (k * 77 + 30) % S, 7, "rgba(190,170,255,.35)");
    },
    bee: function (x, S, t) {
      x.drawImage(base("bee", S, function (x, S, r) {
        x.fillStyle = "#2a1e10"; x.fillRect(0, 0, S, S);
        for (var i = 0; i < 120; i++) { var p = walk(r, r() * S, r() * S, -1.2 + r() * 0.4, 6, 9, 0.2); wobble(x, p, 2, "#c99a3a"); for (var b = 1; b < p.length; b++) wobble(x, [p[b], [p[b][0] + 5, p[b][1] - 2]], 1, "#e2b85a"); }
      }), 0, 0);
      for (var k = 0; k < 10; k++) circle(x, (k * 89 + t * 3) % S, (k * 53) % S, 5, "rgba(250,220,90,.9)");
    },
    scales: function (x, S, t) {
      x.drawImage(base("scales", S, function (x, S, r) {
        x.fillStyle = "#bdbab0"; x.fillRect(0, 0, S, S);
        for (var j = 0; j < S + 20; j += 12) for (var i = (j / 12 % 2) * 10; i < S + 20; i += 20) {
          x.fillStyle = "rgba(255,255,250," + (0.75 + r() * 0.25) + ")"; x.beginPath(); x.moveTo(i - 9, j - 10); x.lineTo(i + 9, j - 10); x.lineTo(i + 8, j + 8); x.quadraticCurveTo(i, j + 13, i - 8, j + 8); x.closePath(); x.fill();
          x.strokeStyle = "rgba(150,150,140,.5)"; x.stroke();
        }
      }), 0, 0);
    },
    dew: function (x, S, t) {
      x.fillStyle = "#2a3a20"; x.fillRect(0, 0, S, S);
      x.strokeStyle = "rgba(230,230,220,.8)"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, S * 0.45); x.lineTo(S, S * 0.55); x.stroke();
      for (var k = 0; k < 6; k++) {
        var cx = 25 + k * (S - 50) / 5, cy = S * 0.45 + (cx / S) * S * 0.1 + 12, r = 14 + (k % 3) * 5;
        var g = x.createLinearGradient(cx, cy - r, cx, cy + r); g.addColorStop(0, "#5a8a3a"); g.addColorStop(0.55, "#8fb85a"); g.addColorStop(0.56, "#cfe6f2"); g.addColorStop(1, "#8fc0e0");
        x.fillStyle = g; circle(x, cx, cy, r); x.fill();          // the garden upside down: grass above, sky below
        x.fillStyle = "rgba(90,70,60,.8)"; x.fillRect(cx - 2, cy - r * 0.4, 4, r * 0.5);   // and the house, upside down
        circle(x, cx - r * 0.35, cy - r * 0.4, r * 0.18, "rgba(255,255,255," + (0.6 + 0.2 * Math.sin(t + k)) + ")");
        x.strokeStyle = "rgba(255,255,255,.4)"; circle(x, cx, cy, r); x.stroke();
      }
    },
    compost: function (x, S, t) {
      x.drawImage(base("compost", S, function (x, S, r) {
        x.fillStyle = "#2a1e12"; x.fillRect(0, 0, S, S);
        for (var i = 0; i < 40; i++) { x.fillStyle = ["#4a3620", "#5a6a26", "#3a2a18", "#6a4a2a"][i % 4]; x.beginPath(); x.ellipse(r() * S, r() * S, 10 + r() * 20, 5 + r() * 8, r() * 3, 0, 6.3); x.fill(); }
        for (i = 0; i < 25; i++) wobble(x, walk(r, r() * S, r() * S, r() * 6.3, 20, 7, 0.7), 1, "rgba(240,240,230,.5)");
      }), 0, 0);
      for (var k = 0; k < 30; k++) { var a = t * (0.4 + (k % 5) * 0.1) + k; var bx = (k * 37 + Math.cos(a) * 12) % S, by = (k * 59 + Math.sin(a) * 12) % S; x.save(); x.translate(bx, by); x.rotate(a); x.fillStyle = "rgba(200,220,160,.75)"; x.fillRect(-3, -1, 6, 2.4); x.restore(); }
    },
    grass: function (x, S, t) {
      x.drawImage(base("grass", S, function (x, S, r) {
        x.fillStyle = "#6a8a3a"; x.fillRect(0, 0, S, S);
        for (var j = 0; j < S; j += 14) for (var i = (j / 14 % 2) * 12; i < S; i += 24) { x.strokeStyle = "rgba(40,60,20,.5)"; x.strokeRect(i, j, 24, 14); }
      }), 0, 0);
      var open = 0.3 + 0.25 * Math.sin(t * 0.4);
      for (var k = 0; k < 8; k++) {
        var cx = 30 + (k * 83) % (S - 60), cy = 30 + (k * 47) % (S - 60);
        x.fillStyle = "#8ab84a"; x.beginPath(); x.ellipse(cx - 5, cy, 5, 11, 0, 0, 6.3); x.fill(); x.beginPath(); x.ellipse(cx + 5, cy, 5, 11, 0, 0, 6.3); x.fill();
        x.fillStyle = "#1a2a0a"; x.beginPath(); x.ellipse(cx, cy, 1 + open * 3, 8, 0, 0, 6.3); x.fill();
        for (var d = 0; d < 5; d++) circle(x, cx - 6 + (d % 2) * 12, cy - 6 + d * 3, 1.4, "#2f6a1a");
      }
    },
    rust: function (x, S, t) {
      x.drawImage(base("rust", S, function (x, S, r) {
        x.fillStyle = "#5a4a40"; x.fillRect(0, 0, S, S);
        for (var i = 0; i < 300; i++) { x.fillStyle = ["#b8582a", "#8a3a1a", "#d8783a", "#6a2a10"][i % 4]; var cx = r() * S, cy = r() * S, s = 3 + r() * 10; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + s, cy + r() * 4); x.lineTo(cx + s * 0.5, cy + s); x.closePath(); x.fill(); }
        x.fillStyle = "#7a7e82"; x.fillRect(0, S * 0.7, S, S * 0.3);
      }), 0, 0);
    },
    dust: function (x, S, t) {
      x.fillStyle = "#1a140c"; x.fillRect(0, 0, S, S);
      var g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, "rgba(255,220,140,0)"); g.addColorStop(0.5, "rgba(255,220,140,.25)"); g.addColorStop(1, "rgba(255,220,140,0)");
      x.fillStyle = g; x.fillRect(0, 0, S, S);
      for (var k = 0; k < 60; k++) { var px = (k * 53 + t * (3 + k % 4)) % S, py = (k * 97 + Math.sin(t * 0.3 + k) * 20 + t * 2) % S; var inBeam = 1 - Math.abs((px + py) / S - 1); circle(x, px, py, 1 + k % 3, "rgba(255,230,170," + Math.max(0.05, inBeam) + ")"); }
    },
    mycel: function (x, S, t, st) {
      x.fillStyle = "#2a2014"; x.fillRect(0, 0, S, S);
      /* the root */
      x.strokeStyle = "#6a4a2a"; x.lineWidth = 26; x.beginPath(); x.moveTo(-10, S * 0.3); x.bezierCurveTo(S * 0.4, S * 0.35, S * 0.6, S * 0.6, S + 10, S * 0.7); x.stroke();
      x.strokeStyle = "rgba(240,240,230,.7)"; x.lineWidth = 30; x.globalAlpha = 0.25; x.stroke(); x.globalAlpha = 1;
      var E = net("mycel", S, 120, 26);
      E.forEach(function (e, i) { x.strokeStyle = "rgba(245,245,235," + (0.35 + 0.2 * Math.sin(t * 0.5 + i * 0.3)) + ")"; x.lineWidth = 0.6 + e[2] * 0.4; x.beginPath(); x.moveTo(e[0].x, e[0].y); x.lineTo(e[1].x, e[1].y); x.stroke(); });
    },
    moss: function (x, S, t) {
      x.fillStyle = "#1a2a12"; x.fillRect(0, 0, S, S);
      for (var j = 0; j < S; j += 22) for (var i = 0; i < S; i += 30) {
        x.fillStyle = "rgba(120,180,80,.35)"; x.fillRect(i + 1, j + 1, 28, 20); x.strokeStyle = "rgba(160,220,110,.6)"; x.strokeRect(i + 1, j + 1, 28, 20);
        for (var c = 0; c < 6; c++) { var a = t * 0.5 + c * 1.05 + i + j; circle(x, i + 15 + Math.cos(a) * 9, j + 11 + Math.sin(a) * 6, 2.6, "#4a9a2a"); }
      }
    },
    feather: function (x, S, t) {
      x.fillStyle = "#e8e2d4"; x.fillRect(0, 0, S, S);
      for (var k = 0; k < 9; k++) {
        var y0 = k * S / 8;
        x.strokeStyle = "#5a4a3a"; x.lineWidth = 3; x.beginPath(); x.moveTo(0, y0); x.lineTo(S, y0 - 40); x.stroke();
        for (var b = 0; b < S; b += 6) { x.strokeStyle = "rgba(90,70,50,.7)"; x.lineWidth = 1; x.beginPath(); x.moveTo(b, y0 - b * 40 / S); x.lineTo(b + 8, y0 - b * 40 / S + 14); x.stroke(); x.beginPath(); x.moveTo(b + 8, y0 - b * 40 / S + 14); x.lineTo(b + 6, y0 - b * 40 / S + 17); x.stroke(); }
      }
    },
    nurse: function (x, S, t) {
      x.drawImage(base("nurse", S, function (x, S, r) {
        x.fillStyle = "#5a4028"; x.fillRect(0, 0, S, S);
        for (var j = 0; j < S; j += 5) { x.fillStyle = "rgba(40,28,16," + (0.2 + r() * 0.4) + ")"; x.fillRect(0, j, S, 2); }
        for (var i = 0; i < 6; i++) wobble(x, walk(r, r() * S, r() * S, r() * 6.3, 26, 8, 0.8), 7, "#2a1c10");
        for (i = 0; i < 40; i++) wobble(x, walk(r, r() * S, r() * S, r() * 6.3, 14, 6, 0.6), 1, "rgba(240,240,230,.55)");
      }), 0, 0);
      var bx = (t * 8) % (S + 40) - 20; x.fillStyle = "#1c1410"; x.beginPath(); x.ellipse(bx, S * 0.62, 10, 6, 0, 0, 6.3); x.fill(); x.fillStyle = "#3a2a1a"; x.fillRect(bx + 8, S * 0.62 - 2, 4, 4);
    },
    fungus: function (x, S, t) {
      x.fillStyle = "#c8b890"; x.fillRect(0, 0, S, S);
      for (var j = 0; j < S + 10; j += 13) for (var i = (j / 13 % 2) * 7; i < S + 10; i += 15) { circle(x, i, j, 5, "#4a3a22"); circle(x, i - 1, j - 1, 3, "#2a1e10"); }
      for (var k = 0; k < 18; k++) circle(x, (k * 41) % S, (t * 20 + k * 67) % S, 1.5, "rgba(250,245,230,.9)");
    },
    diatom: function (x, S, t) {
      x.fillStyle = "#16302c"; x.fillRect(0, 0, S, S);
      for (var k = 0; k < 9; k++) {
        var cx = (k * 113 + t * (4 + k % 3) * (k % 2 ? 1 : -1)) % (S + 60); if (cx < 0) cx += S + 60; cx -= 30;
        var cy = 30 + (k * 71) % (S - 60);
        x.save(); x.translate(cx, cy); x.rotate(k);
        if (k % 3 === 0) { x.strokeStyle = "rgba(220,240,200,.85)"; x.beginPath(); x.arc(0, 0, 18, 0, 6.3); x.stroke(); for (var a = 0; a < 16; a++) { x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a / 16 * 6.28) * 18, Math.sin(a / 16 * 6.28) * 18); x.stroke(); } }
        else { x.fillStyle = "rgba(190,170,90,.5)"; x.beginPath(); x.ellipse(0, 0, 26, 8, 0, 0, 6.3); x.fill(); x.strokeStyle = "rgba(230,240,200,.8)"; x.stroke(); for (var s = -22; s <= 22; s += 4) { x.beginPath(); x.moveTo(s, -6); x.lineTo(s, 6); x.stroke(); } }
        x.restore();
      }
      for (k = 0; k < 4; k++) { var ax = (k * 70 + t * 12) % S; for (var c = 0; c < 6; c++) circle(x, ax + c * 7, 40 + k * 60 + Math.sin(t + c) * 3, 3, "rgba(80,170,70,.75)"); }
    },
    /* water bears: dry tuns; then a drop; then a fat ridiculous bear */
    tun: function (x, S, t, st) {
      var p = st && st.wet != null ? st.wet : 0;
      x.fillStyle = p > 0 ? "#1e3a2a" : "#4a5038"; x.fillRect(0, 0, S, S);
      x.drawImage(base("mossleaf", S, function (x, S, r) { for (var i = 0; i < 18; i++) { x.fillStyle = "rgba(140,160,100,.35)"; x.beginPath(); x.ellipse(r() * S, r() * S, 40, 12, r() * 3, 0, 6.3); x.fill(); } }), 0, 0);
      var bears = [[0.3, 0.35], [0.7, 0.3], [0.45, 0.7], [0.8, 0.75], [0.15, 0.8]];
      bears.forEach(function (b, i) {
        var bx = b[0] * S, by = b[1] * S;
        var wake = Math.max(0, Math.min(1, p * 1.6 - i * 0.12));
        if (i === 0 && wake > 0.6) { bx += (t * 9) % 60; by += Math.sin(t) * 6; }
        bear(x, bx, by, wake, t + i);
      });
      if (p > 0) { x.fillStyle = "rgba(160,220,240,.08)"; x.fillRect(0, 0, S, S); }
    },
    sand: function (x, S, t) {
      x.drawImage(base("sand", S, function (x, S, r) {
        x.fillStyle = "#7a6a4a"; x.fillRect(0, 0, S, S);
        for (var i = 0; i < 160; i++) { var cx = r() * S, cy = r() * S, rr = 6 + r() * 12; var g = x.createRadialGradient(cx - rr / 3, cy - rr / 3, 1, cx, cy, rr); var c = ["#e8d8a8", "#c8b080", "#f0e8d0", "#a89070", "#d8c098"][i % 5]; g.addColorStop(0, "#fffbe8"); g.addColorStop(0.3, c); g.addColorStop(1, "#5a4a30"); x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rr, rr * (0.7 + r() * 0.3), r() * 3, 0, 6.3); x.fill(); }
      }), 0, 0);
      var slip = (t % 6) / 6; if (slip > 0.8) { x.fillStyle = "rgba(250,240,210,.25)"; x.fillRect(0, (slip - 0.8) * 5 * S, S, 30); }
    },
    litter: function (x, S, t) {
      x.drawImage(base("litter", S, function (x, S, r) {
        x.fillStyle = "#3a2e1a"; x.fillRect(0, 0, S, S);
        for (var i = 0; i < 7; i++) { var cx = r() * S, cy = r() * S, a = r() * 3; x.save(); x.translate(cx, cy); x.rotate(a); x.fillStyle = ["#8a6a3a", "#6a5a2a", "#9a7a4a"][i % 3]; x.beginPath(); x.ellipse(0, 0, 50, 24, 0, 0, 6.3); x.fill(); x.strokeStyle = "rgba(50,35,15,.6)"; x.beginPath(); x.moveTo(-50, 0); x.lineTo(50, 0); x.stroke(); for (var v = -40; v < 40; v += 10) { x.beginPath(); x.moveTo(v, 0); x.lineTo(v + 10, 18); x.moveTo(v, 0); x.lineTo(v + 10, -18); x.stroke(); } x.restore(); }
      }), 0, 0);
    },
    grain: function (x, S, t) {
      x.drawImage(base("grain", S, function (x, S, r) {
        x.fillStyle = "#8a6440"; x.fillRect(0, 0, S, S);
        for (var j = 0; j < S; j += 9) for (var i = 0; i < S; i += 6 + (j % 3)) { x.strokeStyle = "rgba(60,40,20,.45)"; x.strokeRect(i, j, 6, 9); }
      }), 0, 0);
    }
  };
  function bear(x, cx, cy, wake, t) {
    x.save(); x.translate(cx, cy);
    var s = 0.55 + wake * 0.45;
    x.scale(s, s);
    if (wake < 0.3) {
      /* a tun: a wrinkled, shriveled barrel, legs drawn in */
      x.fillStyle = "#a89a70"; x.beginPath(); x.ellipse(0, 0, 18, 12, 0.3, 0, 6.3); x.fill();
      x.strokeStyle = "rgba(70,60,40,.7)"; for (var k = -12; k <= 12; k += 6) { x.beginPath(); x.moveTo(k, -10); x.quadraticCurveTo(k + 3, 0, k, 10); x.stroke(); }
    } else {
      var wig = Math.sin(t * 5) * 3 * wake;
      x.fillStyle = "rgba(230,215,190,.92)"; x.beginPath(); x.ellipse(0, 0, 30, 16, 0, 0, 6.3); x.fill();
      x.strokeStyle = "rgba(140,120,90,.7)"; for (k = -20; k <= 20; k += 10) { x.beginPath(); x.moveTo(k, -15); x.quadraticCurveTo(k + 2, 0, k, 15); x.stroke(); }
      for (k = 0; k < 4; k++) {
        var lx = -20 + k * 13, sw = (k % 2 ? 1 : -1) * wig;
        x.fillStyle = "rgba(230,215,190,.92)"; x.fillRect(lx - 3 + sw, 12, 6, 9); x.fillRect(lx - 3 - sw, -21, 6, 9);
        x.fillStyle = "#3a2a1a"; x.fillRect(lx - 3 + sw, 20, 6, 2); x.fillRect(lx - 3 - sw, -22, 6, 2);
      }
      circle(x, 28, -3, 2, "#1a1a1a"); circle(x, 28, 4, 2, "#1a1a1a");    // eyespots
      x.fillStyle = "rgba(90,150,60,.5)"; x.beginPath(); x.ellipse(-4, 0, 14, 6, 0, 0, 6.3); x.fill();   // breakfast
    }
    x.restore();
  }

  /* render a scene into the round lens, with the drop's own optics:
     a bright rim, a fall-off to the edge, a little chromatic fringe */
  L.draw = function (x, S, scene, t, st) {
    x.save();
    x.clearRect(0, 0, S, S);
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 2, 0, 6.2832); x.clip();
    (scenes[scene] || scenes.skin)(x, S, t, st);
    var v = x.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.8, "rgba(0,0,0,.25)"); v.addColorStop(1, "rgba(0,0,0,.75)");
    x.fillStyle = v; x.fillRect(0, 0, S, S);
    x.restore();
    x.lineWidth = 3; x.strokeStyle = "rgba(255,120,120,.25)"; x.beginPath(); x.arc(S / 2 + 1, S / 2, S / 2 - 3, 0, 6.2832); x.stroke();
    x.strokeStyle = "rgba(120,180,255,.25)"; x.beginPath(); x.arc(S / 2 - 1, S / 2, S / 2 - 3, 0, 6.2832); x.stroke();
    x.strokeStyle = "rgba(255,255,255,.55)"; x.lineWidth = 2; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 2, 0, 6.2832); x.stroke();
    x.fillStyle = "rgba(255,255,255,.25)"; x.beginPath(); x.ellipse(S * 0.32, S * 0.22, S * 0.12, S * 0.05, -0.6, 0, 6.2832); x.fill();
  };
  L.scenes = scenes;
})();
