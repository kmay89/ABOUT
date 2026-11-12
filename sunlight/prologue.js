/* Borrowed Sunlight — the opening, and Gran's porch.

   Before the game hands you Wren, it drives you up the hill: out of the
   trees at the bottom of the world, up the winding road through the long
   grass, the signal bars falling away one by one, over the crest to the
   garden gate, along the beds gone to seed, and onto the porch — the swing
   still moving a little, her straw hat left on it, a crate of jars waiting
   by the door, the wind chime. Then the car doors, the tape from inside, and
   Chapter One.

   The porch itself stays in the world afterwards: it is Gran's, and it is
   part of what is being packed up.

   Everything here is drawn in world units and y-sorted with the rest of the
   hill through BS.cine.sorted. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, T = 16, A = BS.audio;
  var C = BS.cine = {};
  function $(id) { return document.getElementById(id); }
  var ell = BS.ell, rr = BS.rr, lg = BS.lg;

  /* ---------------- the porch (always there) ---------------- */
  var X0 = 35 * T, X1 = 45 * T, Y0 = 15 * T, DEPTH = 12;
  var deck = null;
  function paintDeck() {
    var W = X1 - X0 + 4, H = DEPTH + 12, c = BS.cv(Math.ceil(W * 3), Math.ceil(H * 3)), x = c.getContext("2d");
    c.w = W; c.h = H; x.scale(3, 3);
    /* the shadow it throws on the grass */
    x.fillStyle = "rgba(20,14,6,.28)"; rr(x, 3, DEPTH + 1, W - 2, 5, 2); x.fill();
    /* boards, running the length of the house */
    for (var j = 0; j < DEPTH; j += 2) {
      var tone = ["#b08458", "#a87c50", "#b88c5e", "#a27648"][(j / 2) % 4];
      x.fillStyle = lg(x, 0, j, 0, j + 2, [[0, tone], [1, "#8a6440"]]); x.fillRect(2, j, W - 4, 2);
      x.fillStyle = "rgba(60,36,18,.5)"; x.fillRect(2, j + 1.8, W - 4, 0.25);
      for (var k = 0; k < 6; k++) { var bx = 4 + ((k * 37 + j * 13) % (W - 10)); x.fillRect(bx, j, 0.25, 2); }
      x.fillStyle = "rgba(255,240,210,.12)"; x.fillRect(2, j, W - 4, 0.35);
    }
    /* the front edge: a riser, lit along its lip */
    x.fillStyle = lg(x, 0, DEPTH, 0, DEPTH + 3, [[0, "#7a5636"], [1, "#4e3420"]]); x.fillRect(2, DEPTH, W - 4, 3);
    x.fillStyle = "rgba(255,236,200,.35)"; x.fillRect(2, DEPTH, W - 4, 0.4);
    /* two steps down, worn pale in the middle */
    var sx = 39 * T - X0 + 2 - 2, sw = 2 * T + 4;
    for (var s = 0; s < 2; s++) {
      var sy = DEPTH + 3 + s * 3;
      x.fillStyle = lg(x, 0, sy, 0, sy + 3, [[0, "#b8906a"], [1, "#6a4a2c"]]); rr(x, sx - s * 1.5, sy, sw + s * 3, 3, 0.6); x.fill();
      x.fillStyle = "rgba(255,240,215,.25)"; ell(x, sx + sw / 2, sy + 0.8, sw * 0.28, 0.6); x.fill();
    }
    return c;
  }
  function swing(ctx, cam, t) {
    var bx = 36.6 * T - cam.x, by = Y0 + DEPTH - 2 - cam.y, g = G.gust ? G.gust(36.6 * T, Y0) : 0;
    var sway = (G.prefs.reduced ? 0 : Math.sin(t * 1.15) * 0.9 + g * 1.6);
    /* the frame: two posts and a beam */
    ctx.fillStyle = "rgba(20,14,6,.25)"; ell(ctx, bx, by + 2, 18, 3); ctx.fill();
    [-16, 16].forEach(function (o) { ctx.fillStyle = lg(ctx, bx + o - 1.2, 0, bx + o + 1.2, 0, [[0, "#9a7450"], [1, "#5a3e24"]]); rr(ctx, bx + o - 1.2, by - 30, 2.4, 31, 0.6); ctx.fill(); });
    ctx.fillStyle = lg(ctx, 0, by - 32, 0, by - 29, [[0, "#b08a62"], [1, "#6a4a2c"]]); rr(ctx, bx - 18, by - 32, 36, 3, 0.8); ctx.fill();
    /* chains */
    ctx.strokeStyle = "rgba(90,90,90,.85)"; ctx.lineWidth = 0.35;
    [-11, 11].forEach(function (o) { ctx.beginPath(); ctx.moveTo(bx + o, by - 29); ctx.lineTo(bx + o + sway, by - 9); ctx.stroke(); });
    /* the seat and its back, a quilt over one end */
    var sx = bx + sway;
    ctx.fillStyle = lg(ctx, 0, by - 16, 0, by - 8, [[0, "#c9a070"], [1, "#8a6440"]]); rr(ctx, sx - 13, by - 16, 26, 5, 1); ctx.fill();
    ctx.fillStyle = "rgba(60,36,18,.5)"; for (var i = 1; i < 6; i++) ctx.fillRect(sx - 13 + i * 4.3, by - 16, 0.3, 5);
    ctx.fillStyle = lg(ctx, 0, by - 10, 0, by - 6, [[0, "#b8906a"], [1, "#7a5636"]]); rr(ctx, sx - 13, by - 10, 26, 3.5, 1); ctx.fill();
    /* the quilt: faded squares */
    var qc = ["#d98a7a", "#f1e2c4", "#8fb0c8", "#e8c46a"];
    for (var q = 0; q < 8; q++) { ctx.fillStyle = qc[(q + (q >> 2)) % 4]; ctx.fillRect(sx + 3 + (q % 4) * 2.4, by - 15.5 + (q >> 2) * 2.6, 2.4, 2.6); }
    ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(sx + 3, by - 15.5, 9.6, 1);
    /* her straw hat, left on the seat */
    ctx.fillStyle = "rgba(30,20,10,.25)"; ell(ctx, sx - 6, by - 8.6, 5.2, 1.6); ctx.fill();
    ctx.fillStyle = lg(ctx, sx - 11, 0, sx - 1, 0, [[0, "#f0d898"], [1, "#c9a660"]]); ell(ctx, sx - 6, by - 10.5, 5.2, 2.2); ctx.fill();
    ctx.fillStyle = "#e6c880"; ell(ctx, sx - 6, by - 11.6, 2.8, 1.6); ctx.fill();
    ctx.fillStyle = "#c8574a"; ctx.fillRect(sx - 8.7, by - 11.2, 5.4, 0.8);
  }
  C.swingSway = function (t) { var g = G.gust ? G.gust(36.6 * T, Y0) : 0; return G.prefs.reduced ? 0 : Math.sin(t * 1.15) * 0.9 + g * 1.6; };
  function rocker(ctx, cam, t) {
    var bx = 43.6 * T - cam.x, by = Y0 + DEPTH - 3 - cam.y, r = G.prefs.reduced ? 0 : Math.sin(t * 0.9) * 0.05;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(r);
    ctx.fillStyle = "rgba(20,14,6,.22)"; ell(ctx, 0, 2, 7, 2); ctx.fill();
    ctx.strokeStyle = "#5a3e24"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(0, 2.5, 7, 0); ctx.stroke();
    ctx.fillStyle = lg(ctx, -5, 0, 5, 0, [[0, "#9a7450"], [1, "#6a4a2c"]]);
    rr(ctx, -5, -6, 10, 4, 1); ctx.fill();                                   // seat
    for (var i = 0; i < 4; i++) { rr(ctx, -4.5 + i * 3, -17, 1.8, 11, 0.6); ctx.fill(); }   // back spindles
    ctx.fillStyle = "#8a6440"; rr(ctx, -5.5, -18.5, 11, 2.2, 1); ctx.fill();
    ctx.fillStyle = "#7a9a6a"; rr(ctx, -4, -5.6, 8, 2.6, 1); ctx.fill();          // a green cushion
    ctx.restore();
  }
  /* the crate of jars by the door: this summer's, and the empty ones going */
  var JAR = [["#c8323a", "#e85a5a"], ["#e8902a", "#f6b85a"], ["#6a8a2a", "#9ab84a"], ["#5a2a5a", "#8a4a8a"], [null, null], ["#c8323a", "#e85a5a"]];
  function jars(ctx, cam, t) {
    var bx = 41.7 * T - cam.x, by = Y0 + DEPTH - 2.5 - cam.y;
    ctx.fillStyle = "rgba(20,14,6,.3)"; ell(ctx, bx, by + 1.5, 10, 2); ctx.fill();
    ctx.fillStyle = lg(ctx, 0, by - 7, 0, by, [[0, "#c49a68"], [1, "#7a5636"]]); rr(ctx, bx - 9, by - 7, 18, 7, 0.8); ctx.fill();
    ctx.fillStyle = "rgba(60,36,18,.5)"; ctx.fillRect(bx - 9, by - 3.6, 18, 0.35);
    JAR.forEach(function (j, i) {
      var jx = bx - 6.5 + (i % 3) * 6.5, jy = by - 7 - (i < 3 ? 2.6 : 0) + (i < 3 ? 0 : 0.8);
      if (j[0]) { ctx.fillStyle = lg(ctx, jx - 2, 0, jx + 2, 0, [[0, j[0]], [0.6, j[1]], [1, j[0]]]); rr(ctx, jx - 2.2, jy - 4.8, 4.4, 5.2, 1.2); ctx.fill(); }
      else { ctx.fillStyle = "rgba(220,235,240,.35)"; rr(ctx, jx - 2.2, jy - 4.8, 4.4, 5.2, 1.2); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 0.25; ctx.stroke(); }
      ctx.fillStyle = lg(ctx, jx - 2, 0, jx + 2, 0, [[0, "#b89030"], [0.5, "#f2d070"], [1, "#a07a20"]]); rr(ctx, jx - 2.3, jy - 6, 4.6, 1.4, 0.5); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255," + (0.45 + 0.2 * Math.sin(t * 1.3 + i)) + ")"; ctx.fillRect(jx - 1.4, jy - 4, 0.5, 3);
      if (j[0] && i % 2 === 0) { ctx.fillStyle = "#f4ecd8"; ctx.fillRect(jx - 1.6, jy - 2.6, 3.2, 1.4); }
    });
  }
  function chime(ctx, cam, t) {
    var bx = 41.2 * T - cam.x, by = Y0 - 46 - cam.y, g = G.gust ? G.gust(41 * T, Y0) : 0;
    var s = G.prefs.reduced ? 0 : Math.sin(t * 1.7) * 0.6 + g * 3;
    ctx.strokeStyle = "rgba(60,50,40,.7)"; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + s * 0.3, by + 5); ctx.stroke();
    ctx.fillStyle = "#8a6a48"; ell(ctx, bx + s * 0.3, by + 5.3, 3, 0.9); ctx.fill();
    for (var i = 0; i < 5; i++) {
      var tx = bx + s * 0.3 - 2.4 + i * 1.2, sw = Math.sin(t * 3 + i * 1.7) * (0.3 + g) + s * 0.5, len = 5 + (i % 3) * 1.5;
      ctx.strokeStyle = "rgba(60,50,40,.6)"; ctx.beginPath(); ctx.moveTo(tx, by + 5.6); ctx.lineTo(tx + sw * 0.4, by + 7); ctx.stroke();
      ctx.fillStyle = lg(ctx, tx - 0.4, 0, tx + 0.4, 0, [[0, "#c8ccd0"], [0.5, "#ffffff"], [1, "#8a9098"]]);
      ctx.save(); ctx.translate(tx + sw * 0.4, by + 7); ctx.rotate(-sw * 0.08); ctx.fillRect(-0.4, 0, 0.8, len); ctx.restore();
    }
    if (g > 0.35 && Math.random() < 0.04) A.sfx("chime", 41 * T, Y0);
  }
  function pots(ctx, cam) {
    var lush = G.s && G.s.flags && G.s.flags.herbsWatered;
    [[38.6, 0x6a9a3a], [41.3, 0x7aa848]].forEach(function (p, i) {
      var bx = p[0] * T - cam.x, by = Y0 + DEPTH + 8 - cam.y;
      ctx.fillStyle = "rgba(20,14,6,.3)"; ell(ctx, bx, by + 1, 3.6, 1.2); ctx.fill();
      ctx.fillStyle = lg(ctx, bx - 3, 0, bx + 3, 0, [[0, "#c8683a"], [1, "#8a3a20"]]); ctx.beginPath(); ctx.moveTo(bx - 3, by - 5); ctx.lineTo(bx + 3, by - 5); ctx.lineTo(bx + 2.2, by); ctx.lineTo(bx - 2.2, by); ctx.fill();
      ctx.fillStyle = "#d8784a"; ctx.fillRect(bx - 3.3, by - 5.6, 6.6, 1.2);
      /* limp in the heat, or — once watered — standing up green, in flower */
      var droop = lush ? 0 : 1.4, n = lush ? 11 : 7;
      for (var k = 0; k < n; k++) { ctx.fillStyle = lush ? (k % 2 ? "#4e9a2a" : "#8ad04a") : (k % 2 ? "#7a8a40" : "#9aa858"); ell(ctx, bx - 2.6 + (k % 4) * 1.7, by - 7.5 - (k >> 2) * 1.7 - Math.sin(k) * 0.6 + droop * (k % 4 === 0 || k % 4 === 3 ? 1 : 0.4), 1.3, lush ? 1 : 0.7, null, k + (lush ? 0 : 0.6)); ctx.fill(); }
      if (lush) { ctx.fillStyle = i ? "#c8a0e8" : "#fbf6e8"; for (var f = 0; f < 3; f++) { ell(ctx, bx - 1.5 + f * 1.5, by - 11.2 - (f % 2), 0.6, 0.6); ctx.fill(); } }
    });
  }
  function can(ctx, cam) {
    var fl = G.s && G.s.flags || {};
    if (fl.hasCan && !fl.herbsWatered) return;                      // it's in your hands
    var bx = 47.2 * T - cam.x, by = 15.7 * T - cam.y;
    ctx.fillStyle = "rgba(20,14,6,.28)"; ell(ctx, bx + 1, by + 0.5, 5.5, 1.6); ctx.fill();
    ctx.fillStyle = lg(ctx, bx - 4, 0, bx + 4, 0, [[0, "#9aa4a8"], [0.45, "#dfe6e8"], [1, "#6a747a"]]); rr(ctx, bx - 3.6, by - 7, 7.2, 7, 1.2); ctx.fill();
    ctx.strokeStyle = "#7a8488"; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(bx + 3.4, by - 3); ctx.lineTo(bx + 7.5, by - 8); ctx.stroke();
    ctx.fillStyle = "#8a9498"; ell(ctx, bx + 7.8, by - 8.3, 1.2, 0.8); ctx.fill();
    ctx.strokeStyle = "#6a747a"; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(bx - 1, by - 7, 3, Math.PI, 0); ctx.stroke();
  }
  function feeder(ctx, cam, t) {
    var bx = 44.5 * T - cam.x, by = 19.6 * T - cam.y;
    ctx.fillStyle = "rgba(20,14,6,.25)"; ell(ctx, bx + 2, by + 0.5, 4, 1.2); ctx.fill();
    ctx.fillStyle = "#6a4a2c"; ctx.fillRect(bx - 0.6, by - 18, 1.2, 18);
    ctx.fillStyle = "#8a6440"; rr(ctx, bx - 4, by - 21, 8, 5, 0.6); ctx.fill();
    ctx.fillStyle = "#c8a070"; ctx.fillRect(bx - 3.2, by - 20.2, 6.4, 3.4);
    ctx.fillStyle = "#7a3a2c"; ctx.beginPath(); ctx.moveTo(bx - 5.2, by - 21); ctx.lineTo(bx, by - 25); ctx.lineTo(bx + 5.2, by - 21); ctx.fill();
    if (G.s && G.s.flags && G.s.flags.fedBirds) for (var k = 0; k < 6; k++) { ctx.fillStyle = "#e8d8a8"; ell(ctx, bx - 2.4 + k, by - 17.3, 0.4, 0.3); ctx.fill(); }
  }
  /* at the bottom, where the road comes out of the trees: a sign about the hill */
  var SX = 43.4 * T, SY = 52.4 * T;
  function sign(ctx, cam) {
    var bx = SX - cam.x, by = SY - cam.y;
    ctx.fillStyle = "rgba(20,14,6,.28)"; ell(ctx, bx + 2, by + 0.5, 4.5, 1.4); ctx.fill();
    ctx.fillStyle = lg(ctx, bx - 0.7, 0, bx + 0.7, 0, [[0, "#9aa0a4"], [0.5, "#e2e6e8"], [1, "#6a7074"]]); ctx.fillRect(bx - 0.6, by - 17, 1.2, 17);
    ctx.save(); ctx.translate(bx, by - 21.5);
    /* the yellow diamond */
    ctx.save(); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#2a2418"; rr(ctx, -5.6, -5.6, 11.2, 11.2, 1.2); ctx.fill();
    ctx.fillStyle = lg(ctx, -5, -5, 5, 5, [[0, "#ffd84a"], [1, "#e8b020"]]); rr(ctx, -4.9, -4.9, 9.8, 9.8, 0.9); ctx.fill();
    ctx.restore();
    /* a slope, and a little car going up it */
    ctx.fillStyle = "#1e1a12"; ctx.beginPath(); ctx.moveTo(-4.4, 2.6); ctx.lineTo(4.4, 2.6); ctx.lineTo(4.4, -1.8); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(-0.4, -0.6); ctx.rotate(-0.46);
    ctx.fillRect(-2, -1.3, 4, 1.4); ctx.fillRect(-1, -2.2, 2, 1);
    ctx.restore();
    ctx.restore();
    /* and under it, on its own plate */
    ctx.fillStyle = "#2a2418"; rr(ctx, bx - 4.4, by - 15.4, 8.8, 4, 0.6); ctx.fill();
    ctx.fillStyle = "#ffd84a"; rr(ctx, bx - 4, by - 15, 8, 3.2, 0.5); ctx.fill();
    ctx.fillStyle = "#1e1a12"; ctx.font = "bold 2.3px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("12%", bx, by - 13.3);
  }
  C.sorted = function (list, ctx, cam, t) {
    var vw0 = G.view().w, vh0 = G.view().h;
    if (SX > cam.x - 20 && SX < cam.x + vw0 + 20 && SY > cam.y - 10 && SY < cam.y + vh0 + 40) list.push({ y: SY, d: function () { sign(ctx, cam); } });
    var vw = G.view().w, vh = G.view().h;
    if (cam.x > X1 + 80 || cam.x + vw < X0 - 80 || cam.y > Y0 + 80 || cam.y + vh < Y0 - 90) { /* porch off-screen */ }
    else {
      if (!deck) deck = paintDeck();
      list.push({ y: Y0 + 0.5, d: function () { ctx.drawImage(deck, X0 - 2 - cam.x, Y0 - cam.y, deck.w, deck.h); } });
      list.push({ y: Y0 + DEPTH - 1, d: function () { swing(ctx, cam, t); } });
      list.push({ y: Y0 + DEPTH - 1, d: function () { rocker(ctx, cam, t); } });
      list.push({ y: Y0 + DEPTH - 1, d: function () { jars(ctx, cam, t); } });
      list.push({ y: Y0 + 1, d: function () { chime(ctx, cam, t); } });
      list.push({ y: Y0 + DEPTH + 8, d: function () { pots(ctx, cam); } });
      list.push({ y: 15.7 * T, d: function () { can(ctx, cam); } });
      list.push({ y: 19.6 * T, d: function () { feeder(ctx, cam, t); } });
    }
    if (car.on) list.push({ y: car.y + 8, d: function () { drawCar(ctx, cam, t); } });
    if (car.on) walkers.forEach(function (w) { if (w.on) list.push({ y: w.y, d: function () { drawWalker(ctx, cam, w); } }); });
  };

  /* ---------------- Dad's car ---------------- */
  /* up the road from the trees: the road's own points, reversed, centered */
  var ROUTE = [[40, 58], [40, 54], [39, 51], [34, 48], [33, 44], [38, 41], [45, 38], [47, 34], [43, 30], [39.6, 27.2], [39.5, 26.4]].map(function (p) { return [(p[0] + 1) * T, (p[1] + 1) * T]; });
  var car = { on: false, x: 0, y: 0, a: -Math.PI / 2, s: 0, v: 0, dust: [], puff: [], grade: 0 };
  function cr(p0, p1, p2, p3, u) { var u2 = u * u, u3 = u2 * u; return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3); }
  var LUT = (function () {
    var pts = [], P = ROUTE;
    for (var i = 0; i < P.length - 1; i++) for (var k = 0; k < 24; k++) {
      var u = k / 24, a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
      pts.push([cr(a[0], b[0], c[0], d[0], u), cr(a[1], b[1], c[1], d[1], u)]);
    }
    pts.push(P[P.length - 1]);
    var L = [0]; for (var j = 1; j < pts.length; j++) L.push(L[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    return { pts: pts, len: L, total: L[L.length - 1] };
  })();
  function along(s) {
    s = Math.max(0, Math.min(LUT.total, s));
    var L = LUT.len, i = 1; while (i < L.length - 1 && L[i] < s) i++;
    var a = LUT.pts[i - 1], b = LUT.pts[i], u = (s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
    return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }
  function drawCar(ctx, cam, t) {
    var sx = car.x - cam.x, sy = car.y - cam.y;
    car.puff.forEach(function (d) { var k = d.t / d.life; ctx.fillStyle = "rgba(150,150,150," + (0.28 * (1 - k)) + ")"; ell(ctx, d.x - cam.x, d.y - cam.y - k * 3, 1.2 + k * 4, 1 + k * 3.2); ctx.fill(); });
    car.dust.forEach(function (d) { var k = d.t / d.life; ctx.fillStyle = "rgba(220,200,160," + (0.32 * (1 - k)) + ")"; ell(ctx, d.x - cam.x, d.y - cam.y - k * 4, 2 + k * 7, 1.2 + k * 4); ctx.fill(); });
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(car.a + Math.PI / 2);
    var bump = G.prefs.reduced ? 0 : Math.sin(t * 22) * (0.15 + car.grade * 3) * Math.min(1, car.v / 30);
    ctx.fillStyle = "rgba(15,10,5,.35)"; rr(ctx, -7.5, -11, 15, 25, 5); ctx.fill();
    ctx.translate(0, -2 + bump);
    ["#1a1a1a"].forEach(function (c) { ctx.fillStyle = c; [[-7.3, -8], [5.3, -8], [-7.3, 6], [5.3, 6]].forEach(function (w) { rr(ctx, w[0], w[1], 2, 4.5, 0.8); ctx.fill(); }); });
    /* the old wagon: faded teal, a dent of rust on one door */
    ctx.fillStyle = lg(ctx, -6.5, 0, 6.5, 0, [[0, "#3e7a7a"], [0.5, "#6aaeaa"], [1, "#2e5e5e"]]); rr(ctx, -6.5, -11, 13, 24, 4); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.18)"; rr(ctx, -5.5, -10.5, 4, 22, 3); ctx.fill();
    ctx.fillStyle = "#8a4a2a"; ell(ctx, 6, 3, 0.8, 1.6); ctx.fill();
    /* windshield, roof, rear glass */
    ctx.fillStyle = lg(ctx, 0, -8, 0, -4, [[0, "#cfe6f0"], [1, "#4a6a7a"]]); rr(ctx, -5.2, -8.2, 10.4, 4, 1.5); ctx.fill();
    ctx.fillStyle = "#5a9a96"; rr(ctx, -5.4, -3.8, 10.8, 11, 1.5); ctx.fill();
    ctx.fillStyle = "#2a4a52"; rr(ctx, -4.6, 7.6, 9.2, 3, 1.2); ctx.fill();
    /* flattened moving boxes strapped to the roof rack */
    ctx.fillStyle = "#3a3a3a"; ctx.fillRect(-5.6, -2.8, 0.5, 9); ctx.fillRect(5.1, -2.8, 0.5, 9);
    ctx.fillStyle = lg(ctx, 0, -2.5, 0, 6.5, [[0, "#d8b888"], [1, "#b8946a"]]); rr(ctx, -4.6, -2.4, 9.2, 8.6, 0.6); ctx.fill();
    ctx.strokeStyle = "rgba(120,90,50,.6)"; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(-4.6, 1.8); ctx.lineTo(4.6, 1.8); ctx.stroke();
    ctx.fillStyle = "#c83a2a"; ctx.fillRect(-4.8, 0.2, 9.6, 0.6); ctx.fillRect(-4.8, 4, 9.6, 0.6);
    /* headlights */
    ctx.fillStyle = "#fff6d8"; ell(ctx, -4, -11, 1.3, 0.6); ctx.fill(); ell(ctx, 4, -11, 1.3, 0.6); ctx.fill();
    ctx.fillStyle = "#c83a2a"; ctx.fillRect(-5.6, 12.4, 2.2, 0.8); ctx.fillRect(3.4, 12.4, 2.2, 0.8);
    ctx.restore();
  }
  function carTick(dt, target) {
    var prev = car.s;
    car.s += (target - car.s) * Math.min(1, dt * 1.6);
    car.v = (car.s - prev) / Math.max(1e-4, dt);
    var p = along(car.s); car.x = p.x; car.y = p.y;
    var da = p.a - car.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    car.a += da * Math.min(1, dt * 5);
    if (car.v > 8 && Math.random() < dt * 14) { var back = car.a + Math.PI; car.dust.push({ x: car.x + Math.cos(back) * 11 + (Math.random() - 0.5) * 6, y: car.y + Math.sin(back) * 11 + 3, t: 0, life: 1.4 }); }
    car.dust.forEach(function (d) { d.t += dt; }); car.dust = car.dust.filter(function (d) { return d.t < d.life; });
    /* how steep it is here: the engine works harder, and breathes out */
    var H = BS.slope ? BS.slope.h : null, grade = 0;
    if (H) { var q = along(car.s + 12), q0 = along(Math.max(0, car.s - 12)); grade = Math.max(0, (H(q.x / T, q.y / T) - H(q0.x / T, q0.y / T)) / 24 * T); }
    car.grade += (grade - car.grade) * Math.min(1, dt * 2);
    if (car.v > 4 && Math.random() < dt * (3 + car.grade * 60)) { var bk = car.a + Math.PI; car.puff.push({ x: car.x + Math.cos(bk) * 12 + Math.cos(car.a + Math.PI / 2) * 3, y: car.y + Math.sin(bk) * 12, t: 0, life: 1.1 + Math.random() * 0.6, dx: Math.cos(bk) * 6 + (Math.random() - 0.5) * 4, dy: Math.sin(bk) * 6 - 4 }); }
    car.puff.forEach(function (d) { d.t += dt; d.x += d.dx * dt; d.y += d.dy * dt; }); car.puff = car.puff.filter(function (d) { return d.t < d.life; });
    if (A.loop) A.loop("car", true, Math.min(1, 0.25 + car.v / 40 + car.grade * 4), 1 + Math.min(0.6, car.grade * 14) + Math.min(0.3, car.v / 120));
  }

  /* ---------------- getting out: Dad first, then me ---------------- */
  /* keys: [time, x, y] in tiles; they walk up through the gate to the porch,
     and I stop by the swing for a while before following him in */
  var walkers = [
    { who: "dad", keys: [[26.6, 40.6, 26.6], [28, 40.2, 24.6], [33.2, 39.8, 16.4], [33.8, 39.6, 15.2]], on: false, x: 0, y: 0, dir: 1, f: 0, a: 1 },
    { who: "wren", keys: [[27.6, 39.4, 26.8], [29.2, 39.6, 24.6], [33.4, 39.2, 18.2], [34.6, 38.2, 17.4], [38.6, 38.2, 17.4], [40.0, 39.4, 16.0], [40.9, 39.6, 15.2]], on: false, x: 0, y: 0, dir: 1, f: 0, a: 1 }
  ];
  function walkTick(t) {
    walkers.forEach(function (w) {
      var K = w.keys, last = K[K.length - 1];
      if (t < K[0][0]) { w.on = false; return; }
      w.on = true;
      var i = 0; while (i < K.length - 2 && K[i + 1][0] <= t) i++;
      var a = K[i], b = K[i + 1], u = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
      var nx = (a[1] + (b[1] - a[1]) * u) * T, ny = (a[2] + (b[2] - a[2]) * u) * T, dx = nx - w.x, dy = ny - w.y, moved = Math.hypot(dx, dy);
      if (w.x && moved > 0.05) { w.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 3) : (dy > 0 ? 0 : 1); w.walk = (w.walk || 0) + moved; w.f = Math.floor(w.walk / 7) % 4; }
      else { w.f = 0; if (w.who === "wren" && t > 34.6 && t < 38.6) w.dir = 3; }        // looking at the swing
      w.x = nx; w.y = ny;
      w.a = t > last[0] ? Math.max(0, 1 - (t - last[0]) / 0.5) : 1;            // through the door
      if (w.a <= 0) w.on = false;
    });
  }
  function drawWalker(ctx, cam, w) {
    G.shadowAt(w.x, w.y, 6.5, 0.38 * w.a);
    ctx.globalAlpha = w.a;
    var sp = BS.sprite(w.who, w.dir, w.f), bob = w.f % 2 ? -0.7 : 0;
    ctx.drawImage(sp, w.x - 8 - cam.x, w.y - 23.4 + bob - cam.y, sp.w || sp.width, sp.h || sp.height);
    if (w.who === "dad" && w.dir === 1) { ctx.fillStyle = "#c8a070"; BS.rr(ctx, w.x - 7.5 - cam.x, w.y - 16 - cam.y + bob, 15, 6, 0.8); ctx.fill(); ctx.fillStyle = "rgba(90,60,30,.5)"; ctx.fillRect(w.x - 7.5 - cam.x, w.y - 13.2 - cam.y + bob, 15, 0.4); }
    ctx.globalAlpha = 1;
  }

  /* ---------------- the film ---------------- */
  /* shots: [start time, camera focus [x,y] in tiles, zoom]; the camera eases
     between keys. Lines are the book's own first sentences. */
  var KEYS = [
    [0, [40.5, 62], 0.6], [6, [40.5, 53], 0.66], [11, [36, 46], 0.74], [16, [44, 37], 0.8], [21, [41, 30], 0.86],
    [24.5, [40, 23.5], 1.0], [28.5, [39.6, 21], 1.12], [32.5, [38.6, 16.2], 1.3], [36.5, [38.4, 15.9], 1.42], [39.5, [41, 15.6], 1.5], [43, [41.2, 15.4], 1.54]
  ];
  var LINES = [
    [1.2, 9.6, "My grandmother's house stood at the top of a hill the world had mostly forgotten,"],
    [10.4, 19.4, "and the summer I was twelve, my father drove me up there to help him take it apart."],
    [22.5, 27.6, "She wasn't dying. I should say that right at the start."],
    [28.2, 35.2, "She'd simply decided, the way she decided everything, all at once and without any fuss, that a house this big and a garden this wild were more than one person wanted to keep —"],
    [35.8, 41.6, "and she'd taken a small bright apartment in town with a balcony exactly big enough for three pots of herbs."]
  ];
  var END = 43.5;
  var FULL = ["My grandmother's house stood at the top of a hill the world had mostly forgotten, and the summer I was twelve, my father drove me up there to help him take it apart.",
    "She wasn't dying. I should say that right at the start. She'd simply decided, the way she decided everything, all at once and without any fuss, that a house this big and a garden this wild were more than one person wanted to keep — and she'd taken a small bright apartment in town with a balcony exactly big enough for three pots of herbs."];
  C.FULL = FULL;
  function ease(u) { return u * u * (3 - 2 * u); }
  function shot(t) {
    var i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
    var a = KEYS[i], b = KEYS[i + 1], u = ease(Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0]))));
    return { x: (a[1][0] + (b[1][0] - a[1][0]) * u) * T, y: (a[1][1] + (b[1][1] - a[1][1]) * u) * T, z: a[2] + (b[2] - a[2]) * u };
  }
  var running = null;
  C.running = function () { return !!running; };
  C.play = function (done) {
    var el = $("cine"), cap = $("cinecap"), bars = $("cinebars"), t0 = performance.now(), cues = {}, lineOn = -1;
    G.titleRun = false; G.hidePlayer = true; G.mode = "title";
    G.mapId = "hill"; G.map = G.maps.hill; G.s.tod = "morning"; G.sky.snap = true; G.cineMist = 0.3; G.cineRays = true;
    walkers.forEach(function (w) { w.on = false; w.x = 0; w.walk = 0; });
    car.on = true; car.s = 0; car.dust = []; car.puff = []; car.grade = 0; car.a = -Math.PI / 2;
    el.hidden = false; requestAnimationFrame(function () { el.classList.add("on"); });
    A.init(); A.ambience("garden"); setTimeout(function () { A.theme(); }, 600); A.music("none");
    var shownLines = 0;
    function cue(name, at, fn) { if (!cues[name] && (performance.now() - t0) / 1000 >= at) { cues[name] = 1; fn(); } }
    function setBars(n) { bars.setAttribute("data-n", n); bars.querySelector("b").textContent = n ? "" : "No Service"; }
    setBars(3);
    function finish(skipped) {
      if (!running) return;
      running = null;
      document.removeEventListener("keydown", key); $("cineskip").onclick = null;
      A.loop("car", false);
      el.classList.add("out");
      setTimeout(function () {
        el.classList.remove("on", "out"); el.hidden = true; cap.classList.remove("on");
        car.on = false; G.cineMist = 0; G.cineRays = false; G.zoom = 1; G.camFocus = null;
        done({ hill: shownLines >= 2, gran: shownLines >= 5, skipped: skipped });
      }, skipped ? 500 : 1400);
    }
    function key(e) { if (e.code === "Escape" || e.code === "Enter" || e.code === "Space") { e.preventDefault(); finish(true); } }
    document.addEventListener("keydown", key);
    $("cineskip").onclick = function () { finish(true); };
    running = { finish: finish };
    var lastT = t0;
    (function step(now) {
      if (!running) return;
      var t = (now - t0) / 1000, dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      var s = shot(t); G.camFocus = { x: s.x, y: s.y }; G.zoom = s.z;
      /* the car: out of the trees, up the winding road, slowing at the crest */
      var drive = Math.max(0, Math.min(1, (t - 1.5) / 22.5)), de = drive < 0.85 ? drive / 0.85 * 0.93 : 0.93 + (1 - Math.pow(1 - (drive - 0.85) / 0.15, 3)) * 0.07;
      carTick(dt, de * LUT.total); walkTick(t);
      if (t > 24.5 && A.loop) A.loop("car", true, Math.max(0, 0.6 - (t - 24.5) * 0.4));
      if (t > 26) A.loop("car", false);
      G.cineMist = Math.max(0, 0.3 - Math.max(0, t - 6) * 0.016);
      /* the bars going, one by one, as the road climbs */
      cue("b2", 9, function () { setBars(2); });
      cue("b1", 15, function () { setBars(1); });
      cue("b0", 21.5, function () { setBars(0); A.sfx("nosignal"); });
      /* sounds of arriving */
      cue("doors", 26.3, function () { A.sfx("thunk", car.x, car.y); setTimeout(function () { A.sfx("thunk", car.x, car.y); }, 380); });
      cue("chime1", 31.5, function () { A.sfx("chime"); });
      cue("creak", 33.5, function () { A.sfx("creak"); });
      cue("chime2", 37.8, function () { A.sfx("chime"); });
      cue("music", 24, function () { A.music("warm"); });
      cue("tape", 41.2, function () { A.sfx("rip", 39 * T, 11 * T); });
      /* the words */
      var on = -1;
      LINES.forEach(function (L, i) { if (t >= L[0] && t < L[1]) on = i; });
      if (on !== lineOn) {
        lineOn = on;
        if (on >= 0) { cap.classList.remove("on"); void cap.offsetWidth; cap.innerHTML = BS.G.fmt(LINES[on][2]); cap.classList.add("on"); shownLines = Math.max(shownLines, on + 1); }
        else cap.classList.remove("on");
      }
      if (t >= END) { finish(false); return; }
      requestAnimationFrame(step);
    })(t0);
  };
})();
