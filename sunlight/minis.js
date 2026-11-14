/* minis.js — the set pieces, each a small piece of real science you play.

   · the ride: a scooter down the hill, a wheel turning a crank, a lamp
     coming up out of the glass eye — gravity into motion into light into
     a sliver of green on a dead phone (energy changes form; it is never
     made from nothing, and the hill is where it comes from);
   · the oats: a slime mold that grows toward food and away from light,
     explores every hallway at once and then pulls itself out of the dead
     ends, leaving the one short path behind;
   · the pile: a sand slope that holds, and holds, and lets go all at once;
     struggling feeds it, stillness slows it, and one lunge gets you out;
   · the board in the site office; the one bar of signal on the hill. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio, T = 16, $ = G.$;

  /* ================= the ride ================= */
  var ride = null;
  G.startRide = function () {
    return new Promise(function (res) {
      var h = G.maps.hill;
      var pts = h.road.map(function (p) { return [p[0] * T + T, p[1] * T + T]; });
      var cum = [0];
      for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      var total = cum[cum.length - 1];
      function at(s) {
        s = Math.max(0, Math.min(total - 0.01, s));
        var k = 1; while (cum[k] < s) k++;
        var a = pts[k - 1], b = pts[k], u = (s - cum[k - 1]) / (cum[k] - cum[k - 1]);
        var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        return { x: a[0] + dx * u, y: a[1] + dy * u, tx: dx / L, ty: dy / L };
      }
      var s0 = 0; while (at(s0).y < h.crest.y * T + 8) s0 += 2;
      var ruts = [];
      for (var s = s0 + 90; s < total - 60; s += 70 + BS.hash(s, 1, 9) * 60) ruts.push({ s: s, lat: (BS.hash(s, 2, 9) - 0.5) * 20, hit: false });
      ride = { at: at, s: s0, v: 10, lat: 0, latV: 0, lean: 0, total: total, ruts: ruts, charge: 0, off: 0, res: res, t: 0, done: false, grass: [] };
      G.ride = ride;
      G.mode = "ride";
      $("ridehud").classList.add("on");
      A.ambience("ride");
      G.lamp.level = 0.1;
    });
  };
  G.minis.ride = {
    update: function (dt) {
      var r = ride; if (!r) return;
      r.t += dt;
      var here = r.at(r.s), ahead = r.at(r.s + 12);
      var curv = (ahead.tx * here.ty - ahead.ty * here.tx) / 12;     // signed curvature
      var slope = 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, (r.s) / r.total));
      var off = Math.abs(r.lat) > 15;
      var acc = 150 * slope - 0.55 * r.v - (off ? 2.4 * r.v : 0);
      if (r.done) acc = -3 * r.v - 40;
      r.v = Math.max(0, Math.min(165, r.v + acc * dt));
      var steer = (G.held("right") ? 1 : 0) - (G.held("left") ? 1 : 0) + G.input.ax;
      r.latV += (steer * 260 - curv * r.v * r.v * 1.1 - r.latV * 2.2) * dt;
      r.lat = Math.max(-40, Math.min(40, r.lat + r.latV * dt));
      r.lean = Math.max(-1, Math.min(1, r.latV / 60));
      r.s += r.v * dt;
      /* ruts: a jolt, and the hill's gift spilled */
      r.ruts.forEach(function (u) {
        if (!u.hit && Math.abs(u.s - r.s) < 4 && Math.abs(u.lat - r.lat) < 6) { u.hit = true; r.v *= 0.55; G.shake = 6; A.sfx("bump"); if (G.prefs.haptics && navigator.vibrate) navigator.vibrate(30); }
      });
      if (off && r.v > 20 && Math.random() < dt * 30) r.grass.push({ x: G.p.x, y: G.p.y, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 20, life: 0.6 });
      r.grass.forEach(function (g) { g.x += g.vx * dt; g.y += g.vy * dt; g.vy += 80 * dt; g.life -= dt; });
      r.grass = r.grass.filter(function (g) { return g.life > 0; });
      if (off) r.off += dt;
      /* the dynamo: the faster the wheel, the brighter the lamp, the more it gives */
      var k = r.v / 165;
      G.lamp.level = Math.max(0.05, k);
      r.charge += r.v * r.v * dt * 1.25e-4;
      A.dynamo(k); A.wind(k);
      var p = G.at = r.at(r.s);
      var nx = -p.ty, ny = p.tx;
      G.p.x = p.x + nx * r.lat; G.p.y = p.y + ny * r.lat;
      G.p.dir = 0;
      $("rspeed").style.setProperty("--v", (k * 100).toFixed(0) + "%");
      $("rcharge").textContent = "+" + r.charge.toFixed(1) + "%";
      if (r.s >= r.total - 70) r.done = true;
      if (r.done && r.v < 4) finishRide();
    },
    draw: function (ctx, cam, t) {
      var r = ride; if (!r) return;
      r.ruts.forEach(function (u) {
        var p = r.at(u.s), x = p.x - p.ty * u.lat - cam.x, y = p.y + p.tx * u.lat - cam.y;
        ctx.fillStyle = "rgba(70,50,30,.7)"; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 1, 6, 3); ctx.fillStyle = "rgba(150,120,80,.8)"; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 2, 6, 1);
      });
      r.grass.forEach(function (g) { ctx.fillStyle = "#c9bc6c"; ctx.fillRect(Math.round(g.x - cam.x), Math.round(g.y - cam.y), 1, 2); });
    }
  };
  function finishRide() {
    var r = ride; ride = null; G.ride = null;
    A.dynamo(0); A.wind(0);
    $("ridehud").classList.remove("on");
    G.mode = "walk";
    var got = Math.max(5, Math.round(r.charge));
    var before = G.s.battery;
    G.s.battery = Math.min(100, G.s.battery + got);
    if (BS.juice) BS.juice.charge(before, G.s.battery);
    G.s.rides = (G.s.rides || 0) + 1;
    G.lamp.level = 0;
    G.hud(); G.setAmbience();
    r.res({ charge: got, off: r.off, time: r.t });
  }

  /* ================= the oats ================= */
  var slime = null;
  var LEVELS = {
    dawn: {
      title: "A path of oatmeal", oats: 3, range: 4,
      hint: "{Tap the ground|Pick a square and press [act]} to lay a flake of oats. The gold grows toward food it can smell — about four steps away — and it will not cross the sun.",
      rows: ["M..sss....", "...sss....", ".........G", ".##....ss.", "....ss.ss.", "....ss...."]
    },
    hedge: {
      title: "Out under the garden", oats: 5, range: 4,
      hint: "Lead the gold from the heap to the shade of the hedge roots. Stones block it. The hot bright patches dry it out, so it goes around.",
      rows: ["M.ssss...#..", "..ssss...#..", "....ss.s....", "##.....sss..", ".sss#..sss..", ".sss#......G", "....#.ssss..", "......ssss.."]
    }
  };
  G.slime = function (name) {
    return new Promise(function (res) {
      var L = LEVELS[name], w = L.rows[0].length, h = L.rows.length, cells = [], net = {}, goal = null;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var ch = L.rows[y][x]; cells.push(ch);
        if (ch === "M") net[x + "," + y] = 1;
        if (ch === "G") goal = [x, y];
      }
      slime = { L: L, w: w, h: h, cells: cells, net: net, edges: [], oats: [], left: L.oats, goal: goal, cur: [1, 1], anim: [], res: res, won: false, t: 0, msg: G.named(L.hint) };
      $("mini").className = "mini on slime";
      $("mtitle").textContent = L.title;
      $("mhint").textContent = G.named(L.hint);
      $("mreset").hidden = false;
      $("mdone").hidden = true;
      G.mode = "slime";
      sizeMini();
    });
  };
  function cellAt(x, y) { var S = slime; return x < 0 || y < 0 || x >= S.w || y >= S.h ? "#" : S.cells[y * S.w + x]; }
  function passable(x, y) { var c = cellAt(x, y); return c !== "#" && c !== "s"; }
  function bfs(from) {
    var S = slime, dist = {}, prev = {}, q = [];
    Object.keys(from).forEach(function (k) { dist[k] = 0; q.push(k); });
    while (q.length) {
      var k = q.shift(), p = k.split(",").map(Number);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = p[0] + d[0], ny = p[1] + d[1], nk = nx + "," + ny;
        if (dist[nk] != null || !passable(nx, ny)) return;
        dist[nk] = dist[k] + 1; prev[nk] = k; q.push(nk);
      });
    }
    return { dist: dist, prev: prev };
  }
  /* grow: everything within reach of the smell is explored at once, then
     the network pulls back out of the dead ends and keeps the short path */
  function grow() {
    var S = slime, B = bfs(S.net), R = S.L.range;
    var targets = S.oats.filter(function (o) { return !o.eaten; }).map(function (o) { return o; });
    targets.push({ x: S.goal[0], y: S.goal[1], goal: true });
    var reached = [];
    targets.forEach(function (o) { var d = B.dist[o.x + "," + o.y]; if (d != null && d <= R && d > 0) reached.push(o); });
    if (!reached.length) {
      var far = targets.filter(function (o) { return !o.goal && B.dist[o.x + "," + o.y] == null; }).length;
      S.msg = far ? "That flake is cut off — by stone, or by sun. The gold won't cross a hot dry patch." : "The gold can't smell anything that far. Lay the next flake closer: about four steps from its nearest thread.";
      $("mhint").textContent = S.msg;
      if (S.left <= 0 && !S.won) $("mhint").textContent = "Out of oats. Pick the oats back up and try a different path.";
      return;
    }
    /* exploration fan */
    var explore = [];
    Object.keys(B.dist).forEach(function (k) { if (B.dist[k] > 0 && B.dist[k] <= R) explore.push(k); });
    S.anim.push({ cells: explore, t: 0 });
    A.sfx("mo");
    reached.forEach(function (o) {
      var k = o.x + "," + o.y, path = [];
      while (B.prev[k] && !S.net[k]) { path.push(k); k = B.prev[k]; }
      path.push(k);
      for (var i = 0; i < path.length - 1; i++) S.edges.push([path[i], path[i + 1]]);
      path.forEach(function (c) { S.net[c] = 1; });
      if (o.goal) S.won = true; else o.eaten = true;
    });
    if (S.won) {
      $("mhint").textContent = "It found the way. A single gold wire, the one shortest path — every dead end let go.";
      $("mdone").hidden = false; $("mreset").hidden = true;
      A.sfx("found");
    } else { S.msg = "It ate the whole flake. It went down every way at once, and then let all the dead ends go."; $("mhint").textContent = S.msg; setTimeout(grow, 900); }
  }
  function place(x, y) {
    var S = slime;
    if (S.won) return;
    if (!passable(x, y) || S.net[x + "," + y] || S.left <= 0) { A.sfx("back"); return; }
    if (S.oats.some(function (o) { return o.x === x && o.y === y && !o.eaten; })) return;
    S.oats.push({ x: x, y: y }); S.left--;
    /* each flake laid is a note above the last, and the gold finding its way is where they land */
    if (BS.feel) BS.feel.rung(S.oats.length - 1, { base: 2 }); else A.sfx("pick");
    grow();
  }
  function resetSlime() {
    var S = slime, L = S.L;
    S.net = {}; S.edges = []; S.oats = []; S.left = L.oats; S.anim = [];
    for (var y = 0; y < S.h; y++) for (var x = 0; x < S.w; x++) if (L.rows[y][x] === "M") S.net[x + "," + y] = 1;
    $("mhint").textContent = G.named(L.hint); A.sfx("back");
  }
  $("mreset").addEventListener("click", function () { if (slime) resetSlime(); });
  $("mdone").addEventListener("click", function () { closeSlime(); });
  function closeSlime() { if (!slime || !slime.won) return; var r = slime.res; slime = null; $("mini").className = "mini"; G.mode = "walk"; r(); }
  var mcv = $("minicv"), mx = mcv.getContext("2d");
  function sizeMini() {
    if (!slime) return;
    var W = Math.min(window.innerWidth - 24, 720), cs = Math.floor(W / slime.w);
    /* (on a phone held sideways, leave room under the ground for the words and the two buttons) */
    cs = Math.max(18, Math.min(cs, Math.floor(Math.min(window.innerHeight * 0.55, window.innerHeight - 215) / slime.h)));
    mcv.width = slime.w * cs; mcv.height = slime.h * cs; slime.cs = cs;
  }
  window.addEventListener("resize", sizeMini);
  mcv.addEventListener("pointerdown", function (e) {
    if (!slime) return;
    var r = mcv.getBoundingClientRect(), cs = r.width / slime.w;
    var x = Math.floor((e.clientX - r.left) / cs), y = Math.floor((e.clientY - r.top) / cs);
    slime.cur = [x, y]; place(x, y);
  });
  G.slimePlace = function (x, y) { place(x, y); };
  G.minis.slime = {
    update: function (dt) {
      var S = slime; if (!S) return;
      S.t += dt;
      S.anim.forEach(function (a) { a.t += dt; }); S.anim = S.anim.filter(function (a) { return a.t < 1.6; });
      if (G.tap("left")) S.cur[0] = Math.max(0, S.cur[0] - 1);
      if (G.tap("right")) S.cur[0] = Math.min(S.w - 1, S.cur[0] + 1);
      if (G.tap("up")) S.cur[1] = Math.max(0, S.cur[1] - 1);
      if (G.tap("down")) S.cur[1] = Math.min(S.h - 1, S.cur[1] + 1);
      if (G.tap("act")) { if (S.won) closeSlime(); else place(S.cur[0], S.cur[1]); }
      if (G.tap("crank") && !S.won) resetSlime();
      drawSlime();
    }
  };
  function drawSlime() {
    var S = slime; if (!S) return;
    var cs = S.cs, x = mx, t = S.t;
    for (var j = 0; j < S.h; j++) for (var i = 0; i < S.w; i++) {
      var c = cellAt(i, j), X = i * cs, Y = j * cs;
      if (c === "s") {
        x.fillStyle = "#e7cf74"; x.fillRect(X, Y, cs, cs);
        x.fillStyle = "rgba(255,250,210," + (0.25 + 0.1 * Math.sin(t * 2 + i + j)) + ")"; x.fillRect(X, Y, cs, cs);
        x.fillStyle = "rgba(170,140,60,.5)"; for (var k = 0; k < 5; k++) x.fillRect(X + BS.hash(i, j, k) * cs, Y + BS.hash(j, i, k) * cs, 2, cs * 0.25);
      } else if (c === "#") {
        x.fillStyle = "#3e3a32"; x.fillRect(X, Y, cs, cs);
        x.fillStyle = "#77736a"; x.beginPath(); x.ellipse(X + cs / 2, Y + cs / 2, cs * 0.44, cs * 0.36, 0.3, 0, 6.3); x.fill();
        x.fillStyle = "#94908a"; x.beginPath(); x.ellipse(X + cs * 0.42, Y + cs * 0.4, cs * 0.22, cs * 0.14, 0.3, 0, 6.3); x.fill();
      } else {
        x.fillStyle = (i + j) % 2 ? "#3c3622" : "#37321f"; x.fillRect(X, Y, cs, cs);
        for (k = 0; k < 4; k++) { x.fillStyle = ["#5a4a2a", "#4a5a26", "#6a5232"][k % 3]; x.fillRect(X + BS.hash(i, j, k + 9) * (cs - 6), Y + BS.hash(j, i, k + 9) * (cs - 4), 6, 3); }
        if (c === "M") { x.fillStyle = "#4b3a26"; x.beginPath(); x.ellipse(X + cs / 2, Y + cs / 2, cs * 0.46, cs * 0.4, 0, 0, 6.3); x.fill(); }
        if (c === "G") { x.fillStyle = "#24401c"; x.fillRect(X, Y, cs, cs); x.fillStyle = "#3d6830"; for (k = 0; k < 6; k++) x.fillRect(X + BS.hash(i, k, 3) * cs * 0.8, Y + BS.hash(k, j, 3) * cs * 0.8, cs * 0.25, cs * 0.18); x.fillStyle = "rgba(255,255,255,.75)"; x.font = Math.round(cs * 0.22) + "px Georgia, serif"; x.textAlign = "center"; x.fillText("hedge", X + cs / 2, Y + cs - 4); }
      }
    }
    /* the smell: rings round uneaten oats */
    S.oats.forEach(function (o) {
      if (o.eaten) return;
      var X = o.x * cs + cs / 2, Y = o.y * cs + cs / 2;
      x.strokeStyle = "rgba(255,240,200," + (0.2 + 0.15 * Math.sin(t * 3)) + ")"; x.lineWidth = 2; x.beginPath(); x.arc(X, Y, cs * (0.6 + (t % 1.5)), 0, 6.3); x.stroke();
      for (var k = 0; k < 5; k++) { x.fillStyle = "#efe2c0"; x.beginPath(); x.ellipse(X + (BS.hash(o.x, o.y, k) - 0.5) * cs * 0.5, Y + (BS.hash(o.y, o.x, k) - 0.5) * cs * 0.5, cs * 0.1, cs * 0.06, k, 0, 6.3); x.fill(); }
    });
    /* exploration: thin threads down every hallway, then let go */
    S.anim.forEach(function (a) {
      var al = a.t < 0.6 ? a.t / 0.6 : Math.max(0, 1 - (a.t - 0.6) / 1);
      a.cells.forEach(function (k) {
        var p = k.split(","), X = +p[0] * cs + cs / 2, Y = +p[1] * cs + cs / 2;
        x.fillStyle = "rgba(255,200,80," + 0.35 * al + ")"; x.beginPath(); x.arc(X, Y, cs * 0.18, 0, 6.3); x.fill();
      });
    });
    /* the network: a gold wire, pulsing */
    x.lineCap = "round";
    var pulse = 0.65 + 0.35 * Math.sin(t * 2.2);
    function C(k) { var p = k.split(","); return [+p[0] * cs + cs / 2, +p[1] * cs + cs / 2]; }
    S.edges.forEach(function (e) {
      var a = C(e[0]), b = C(e[1]);
      x.strokeStyle = "rgba(255,190,60,.55)"; x.lineWidth = cs * 0.28; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
      x.strokeStyle = "rgba(255,236,150," + pulse + ")"; x.lineWidth = cs * 0.1; x.stroke();
    });
    Object.keys(S.net).forEach(function (k) { var p = C(k); x.fillStyle = "rgba(255,210,90,.9)"; x.beginPath(); x.arc(p[0], p[1], cs * 0.13, 0, 6.3); x.fill(); });
    /* the cursor (keyboard and pad) */
    if (!document.body.classList.contains("touch")) { x.strokeStyle = "rgba(255,255,255,.85)"; x.lineWidth = 2; x.strokeRect(S.cur[0] * cs + 2, S.cur[1] * cs + 2, cs - 4, cs - 4); }
    $("moats").textContent = S.left + (S.left === 1 ? " flake" : " flakes") + " of oats";
  }

  /* ================= the pile ================= */
  var pile = null;
  G.sandPile = function () {
    return new Promise(function (res) {
      pile = { phase: "climb", steps: 0, depth: 0, still: 0, t: 0, voice: false, presses: [], res: res, pour: 0, msg: "" };
      $("mini").className = "mini on sand";
      $("mtitle").textContent = "The working pile";
      $("mhint").textContent = G.named("The second board is just out of sight. Up the side of the pile, two seconds — {push|press} up to climb.");
      $("mreset").hidden = true; $("mdone").hidden = true; $("moats").textContent = "";
      G.mode = "sand";
      mcv.width = Math.min(window.innerWidth - 24, 720); mcv.height = Math.round(mcv.width * 0.5);
    });
  };
  G.minis.sand = {
    update: function (dt) {
      var P = pile; if (!P) return;
      P.t += dt;
      var moving = G.held("up") || G.held("down") || G.held("left") || G.held("right") || Math.abs(G.input.ax) > 0.2 || Math.abs(G.input.ay) > 0.2;
      if (P.phase === "climb") {
        if (G.tap("up") || G.tap("act") || G.input.ay < -0.5 && P.t > 0.4) {
          P.t = 0; P.steps++; A.sfx("step", "sand");
          $("mhint").textContent = ["", "It held me. Firm as a stair.", "It held.", "It held. And held.", "Firm. On the fifth step —", ""][P.steps] || "";
          if (P.steps >= 5) {
            P.phase = "pour"; P.t = 0; A.sfx("sand"); A.sfx("swell", "tension"); G.shake = 10;
            if (G.prefs.haptics && navigator.vibrate) navigator.vibrate([60, 30, 120, 30, 200]);
            $("mhint").textContent = "The whole face of the pile, all at once, let go.";
          }
        }
      } else if (P.phase === "pour") {
        P.pour = Math.min(1, P.t / 1.4); P.depth = 0.3 * P.pour;
        if (P.t > 1.6) { P.phase = "sink"; P.t = 0; $("mhint").textContent = "“DON'T FIGHT IT — STOP — STOP MOVING —”"; }
      } else if (P.phase === "sink" || P.phase === "lunge") {
        /* struggling feeds the pour; stillness starves it */
        var mash = P.phase === "sink" && G.tap("act");
        if (moving || mash) { P.depth = Math.min(0.86, P.depth + dt * 0.22 + (mash ? 0.05 : 0)); P.still = 0; if (P.phase === "lunge" && moving) { P.phase = "sink"; $("mhint").textContent = "Moving again. The sand flows in around every kick."; } }
        else { P.still += dt; P.depth = Math.min(0.86, P.depth + dt * 0.008); }
        if (P.phase === "sink" && P.still > 2.2) {
          P.phase = "lunge";
          if (!P.voice) { P.voice = true; A.sfx("mo"); $("mmo").innerHTML = "<em>Be still, child. You can't out-thrash a hill. Pick one way out, and go all at once, and don't argue with it.</em>"; $("mmo").classList.add("on"); }
          $("mhint").textContent = G.named("The pipe. One way out. Everything at once — press [act] once.");
        }
        if (P.phase === "lunge" && G.tap("act")) { P.presses.push(P.t); P.lungeAt = P.lungeAt || P.t; }
        if (P.lungeAt != null && P.t - P.lungeAt > 0.45) {
          if (P.presses.length === 1) { P.phase = "out"; P.t = 0; A.sfx("lunge"); $("mhint").textContent = "I lunged. Once. I got an arm over it, and Beck hauled."; $("mmo").classList.remove("on"); }
          else { P.phase = "sink"; P.still = 0; P.depth = Math.min(0.86, P.depth + 0.08); $("mhint").textContent = "Ten frightened little grabs. The sand took each one. Be still again — then once."; }
          P.presses = []; P.lungeAt = null;
        }
        if (P.depth > 0.8 && P.phase === "sink") $("mhint").textContent = "To my ribs. Stop. Stop moving.";
      } else if (P.phase === "out") {
        P.depth = Math.max(0, P.depth - dt * 0.8);
        if (P.t > 1.8) { var r = P.res; pile = null; $("mini").className = "mini"; $("mmo").classList.remove("on"); G.mode = "walk"; r(); }
      }
      drawPile();
    }
  };
  function drawPile() {
    if (!pile) return;
    var P = pile, W = mcv.width, H = mcv.height, x = mx, tan = Math.tan(34 * Math.PI / 180);
    var sky = x.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#f6ecc8"); sky.addColorStop(1, "#e6d4a2");
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    var gy = H * 0.86, R = W * 0.68, L = W * 0.06, PK = (L + R) / 2, top = gy - (R - PK) * tan;
    /* the ground */
    x.fillStyle = "#b8a372"; x.fillRect(0, gy, W, H - gy);
    /* the pile, at its angle of repose */
    x.fillStyle = "#dcc996"; x.beginPath(); x.moveTo(L, gy); x.lineTo(PK, top); x.lineTo(R, gy); x.closePath(); x.fill();
    for (var i = 0; i < 500; i++) { var u = BS.hash(i, 1, 70), v = BS.hash(i, 2, 70), px = L + (R - L) * u, ty = gy - Math.min(px - L, R - px) * tan; x.fillStyle = ["#c9b682", "#ece0b4", "#bba574"][i % 3]; x.fillRect(px, ty + (gy - ty) * v, 2, 2); }
    x.strokeStyle = "rgba(90,70,40,.55)"; x.lineWidth = 1.5; x.beginPath(); x.arc(R, gy, 46, Math.PI, Math.PI + 0.593); x.stroke();
    x.fillStyle = "rgba(70,50,30,.85)"; x.font = "italic 15px 'Sunlight Book', Georgia, serif"; x.textAlign = "right"; x.fillText("≈34° — the angle of repose", R - 52, gy - 8); x.textAlign = "left";
    /* the trailer edge, the pipe, Beck flat at the firm edge */
    var after = P.phase !== "climb";
    x.fillStyle = "#3e6a46"; x.fillRect(W * 0.9, gy - H * 0.5, W * 0.1, H * 0.5);
    var pipeL = after ? R - W * 0.1 : R + W * 0.04;
    x.fillStyle = "#8d8d86"; x.fillRect(pipeL, gy - 11, W * 0.14, 10); x.fillStyle = "#5e5e58"; x.fillRect(pipeL, gy - 11, 6, 10);
    var bx = pipeL + W * 0.14;
    x.fillStyle = "#b5523b"; x.fillRect(bx, gy - 12, 32, 10); x.fillStyle = "#8a7a4f"; x.fillRect(bx + 32, gy - 11, 16, 8); x.fillStyle = "#e6b48c"; x.fillRect(bx - 8, gy - 11, 9, 8); x.fillStyle = "#c99a50"; x.fillRect(bx - 4, gy - 14, 8, 5);
    /* me */
    var wx, wy;
    if (!after) { wx = R - Math.min(P.steps, 5) * W * 0.035; wy = gy - (R - wx) * tan; }
    else { wx = R - W * 0.11 + (P.phase === "out" ? Math.min(1, P.t) * W * 0.06 : 0); wy = gy - (R - wx) * tan * 0.55; }
    var sunk = (after ? P.depth : 0) * 44;
    var flail = (P.phase === "sink" && (G.held("left") || G.held("right") || G.held("up") || G.held("down"))) ? Math.sin(P.t * 30) * 5 : 0;
    x.save(); x.beginPath(); x.rect(0, 0, W, wy); x.clip(); x.translate(wx, wy + sunk);
    x.fillStyle = "#3a5578"; x.fillRect(-6, -18, 5, 18); x.fillRect(1, -18, 5, 18);
    x.fillStyle = "#3f8f8a"; x.fillRect(-8, -36, 16, 19);
    x.fillStyle = "#d9a982"; x.fillRect(-12, -35 + flail, 4, 14); x.fillRect(8, -35 - flail, 4, 14);
    x.fillStyle = "#d9a982"; x.fillRect(-6, -48, 12, 12);
    x.fillStyle = "#3b2a20"; x.fillRect(-7, -51, 14, 5); x.fillRect(-7, -48, 2, 5);
    x.restore();
    if (after) {
      /* the sand flowing in around me */
      x.fillStyle = "#dcc996"; x.beginPath(); x.moveTo(wx - 46, wy + 6); x.quadraticCurveTo(wx, wy - 8 - P.depth * 6, wx + 46, wy + 6); x.lineTo(wx + 46, gy); x.lineTo(wx - 46, gy); x.closePath(); x.fill();
      if (P.phase === "pour" || P.phase === "sink") for (var k = 0; k < 40; k++) { x.fillStyle = "rgba(190,170,120,.75)"; var fx = PK + (wx - PK) * BS.hash(k, 3, 3), fy = top + ((P.t * 90 + k * 17) % (wy - top)); x.fillRect(fx, fy, 2, 2); }
    }
    if (P.phase === "sink" || P.phase === "lunge") {
      var sv = Math.min(1, P.still / 2.2);
      x.fillStyle = "rgba(40,30,20,.35)"; x.fillRect(16, 16, 160, 10); x.fillStyle = sv >= 1 ? "#7fd67f" : "#e8a33a"; x.fillRect(16, 16, 160 * sv, 10);
      x.fillStyle = "rgba(40,30,20,.9)"; x.font = "italic 15px 'Sunlight Book', Georgia, serif"; x.fillText(sv >= 1 ? "still — now, once" : "be still", 184, 25);
    }
  }

  /* ================= the board ================= */
  G.board = function () {
    return new Promise(function (res) {
      var b = $("board"); b.classList.add("on");
      G.mode = "board";
      G.minis.board = { update: function () { if (G.tap("act") || G.tap("menu")) close(); } };
      function close() { b.classList.remove("on"); G.mode = "walk"; res(); }
      $("bclose").onclick = close;
      $("bclose").focus({ preventScroll: true });
    });
  };

  /* ================= one bar ================= */
  /* Radio from the tower travels in straight lines, more or less; the top
     of the hill is the one place with a line of sight to it. Hold the
     phone up and keep perfectly still. */
  G.findSignal = function () {
    return new Promise(function (res) {
      var st = { t: 0, lock: 0, res: res };
      $("sig").classList.add("on");
      G.mode = "signal";
      G.minis.signal = {
        update: function (dt) {
          st.t += dt;
          var moving = G.held("up") || G.held("down") || G.held("left") || G.held("right") || Math.abs(G.input.ax) > 0.2 || Math.abs(G.input.ay) > 0.2;
          if (moving) st.lock = Math.max(0, st.lock - dt * 2); else st.lock += dt;
          var flick = st.lock > 0.3 && Math.sin(st.t * 9 + Math.sin(st.t * 3) * 4) > 0.2 - st.lock * 0.4 ? 1 : 0;
          G.signalBars = st.lock > 3 ? 1 : flick;
          $("sigmeter").style.setProperty("--v", Math.min(100, st.lock / 3 * 100).toFixed(0) + "%");
          G.hud();
          if (st.lock > 3.2) { $("sig").classList.remove("on"); G.mode = "walk"; A.sfx("signal"); res(); }
        }
      };
    });
  };
})();
