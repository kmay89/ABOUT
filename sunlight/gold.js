/* gold.js — living light.

   Two kinds of light grow in Gran's cellar, and the book says exactly what
   they look like. This draws them from the inside out rather than as lines
   laid on top:

   · The gold (Mo): "a web of the finest gold threads … branching and
     joining and branching again". A slime mold is a transport network: a
     few thick veins near where it began, thinning, splitting and rejoining
     into a fine lace at the edge where it is exploring. So it is grown as
     one — points scattered thinly in the middle and thickly at the rim,
     joined to their natural neighbors (loops and all), and every vein made
     as thick as the flow it carries back to the source.
   · Foxfire: "fanned out in fine branching lines like rivers seen from very
     high up, like frost feathering" — fronds grown from the seams of the
     beams: a wandering stem, side branches feathering off it, and side
     branches off those.

   Both breathe the way the book says the gold does under the lens: waves
   of brightness run out along the veins for a minute or so, slow, stop,
   and pour back the other way (shuttle streaming).

   A lace is baked once (glow, body, bright core) and then each frame only
   a dozen strokes are drawn on top: the veins sorted by how far they are
   from the source, each band lit by where the wave is. Cheap enough to run
   on a phone, alive enough to watch. */
(function () {
  "use strict";
  var BS = window.BS;
  var L = BS.lace = {};

  /* ---------------- growing a network ---------------- */
  /* o: { x, y: source; rx, ry: reach; a0, a1: the fan it may grow into
     (radians, a1 > a0; omit for all round); n: points; seed; min: spacing;
     inside(x, y): optional mask } */
  L.network = function (o) {
    var r = BS.rng(o.seed || 7), pts = [{ x: o.x, y: o.y, src: true }], tries = 0, min = o.min || 4;
    var full = o.a0 == null, a0 = full ? 0 : o.a0, a1 = full ? Math.PI * 2 : o.a1;
    while (pts.length < o.n && tries < o.n * 60) {
      tries++;
      var a = a0 + r() * (a1 - a0), rr = Math.sqrt(r());
      /* thin in the middle, thick at the exploring edge */
      if (r() > 0.25 + 0.75 * Math.pow(rr, 1.2)) continue;
      var wob = 1 + (BS.vn(Math.cos(a) * 3 + 9, Math.sin(a) * 3 + 9, 1, (o.seed || 7) + 3) - 0.5) * 0.5;
      var x = o.x + Math.cos(a) * o.rx * rr * wob, y = o.y + Math.sin(a) * o.ry * rr * wob;
      if (o.inside && !o.inside(x, y)) continue;
      var near = rr < 0.35 ? min * 1.7 : min * (1.15 - rr * 0.35), ok = true;
      for (var i = 0; i < pts.length; i++) { var dx = pts[i].x - x, dy = pts[i].y - y; if (dx * dx + dy * dy < near * near) { ok = false; break; } }
      if (ok) pts.push({ x: x, y: y, rr: rr });
    }
    /* joined to natural neighbors: an edge where no third point sits inside
       the circle on it (a Gabriel graph) — that is what makes the loops */
    var E = [], N = pts.length, maxD = min * 3.2;
    for (var i2 = 0; i2 < N; i2++) for (var j = i2 + 1; j < N; j++) {
      var p = pts[i2], q = pts[j], dx2 = q.x - p.x, dy2 = q.y - p.y, d2 = dx2 * dx2 + dy2 * dy2;
      if (d2 > maxD * maxD) continue;
      var mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, rad = d2 / 4, blocked = false;
      for (var k = 0; k < N && !blocked; k++) { if (k === i2 || k === j) continue; var ex = pts[k].x - mx, ey = pts[k].y - my; if (ex * ex + ey * ey < rad * 0.98) blocked = true; }
      if (!blocked) E.push([i2, j, Math.sqrt(d2)]);
    }
    /* thin the lace so it isn't a grid: a little at the rim, more inside */
    E = E.filter(function (e) { var m = Math.max(pts[e[0]].rr || 0, pts[e[1]].rr || 0); return r() > 0.06 + (1 - m) * 0.12; });
    /* one organism: any piece left unjoined is bridged to the rest by its nearest pair */
    (function () {
      var comp = pts.map(function (p2, i) { return i; });
      function find(a) { while (comp[a] !== a) { comp[a] = comp[comp[a]]; a = comp[a]; } return a; }
      E.forEach(function (e) { comp[find(e[0])] = find(e[1]); });
      for (var guard = 0; guard < N; guard++) {
        var root = find(0), best = null;
        for (var a = 0; a < N; a++) { if (find(a) === root) continue; for (var b = 0; b < N; b++) { if (find(b) !== root) continue; var dd = Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y); if (!best || dd < best[2]) best = [a, b, dd]; } }
        if (!best) break;
        E.push([best[0], best[1], best[2]]); comp[find(best[0])] = find(best[1]);
      }
    })();
    /* distances from the source (Dijkstra, it's small), and the tree of shortest ways home */
    var adj = pts.map(function () { return []; });
    E.forEach(function (e, ei) { adj[e[0]].push([e[1], e[2], ei]); adj[e[1]].push([e[0], e[2], ei]); });
    var dist = pts.map(function () { return 1e9; }), par = pts.map(function () { return -1; }), parE = pts.map(function () { return -1; }), done = pts.map(function () { return false; });
    dist[0] = 0;
    for (var it = 0; it < N; it++) {
      var u = -1, best = 1e9;
      for (var v = 0; v < N; v++) if (!done[v] && dist[v] < best) { best = dist[v]; u = v; }
      if (u < 0) break; done[u] = true;
      adj[u].forEach(function (w) { var nd = dist[u] + w[1]; if (nd < dist[w[0]]) { dist[w[0]] = nd; par[w[0]] = u; parE[w[0]] = w[2]; } });
    }
    /* flow: every point sends what it gathers home along its tree path */
    var flow = E.map(function () { return 0; }), order = pts.map(function (p2, i3) { return i3; }).sort(function (a, b) { return dist[b] - dist[a]; }), carry = pts.map(function () { return 1; });
    order.forEach(function (i4) { if (par[i4] >= 0) { carry[par[i4]] += carry[i4]; flow[parE[i4]] += carry[i4]; } });
    var maxF = Math.max.apply(null, flow.concat([1])), maxDist = Math.max.apply(null, dist.filter(function (d) { return d < 1e9; }).concat([1]));
    var segs = [];
    E.forEach(function (e, ei) {
      var p = pts[e[0]], q = pts[e[1]];
      if (dist[e[0]] >= 1e9 || dist[e[1]] >= 1e9) return;
      var tree = parE[e[0]] === ei || parE[e[1]] === ei, rim = Math.max(p.rr || 0, q.rr || 0);
      /* inside, the loops close up and only the veins that carry stay open */
      if (!tree && r() > 0.15 + rim * rim * 0.95) return;
      var f = flow[ei] / maxF, w = (o.w0 || 0.35) + (o.w1 || 2.6) * Math.pow(f, 0.42);
      if (!tree) w = (o.w0 || 0.35) * (0.7 + r() * 0.5);
      /* a vein is never ruler-straight: two soft bows, one each way */
      var mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, nx = -(q.y - p.y), ny = q.x - p.x, b1 = (r() - 0.5) * 0.5, b2 = (r() - 0.5) * 0.5;
      var midx = mx + nx * (r() - 0.5) * 0.18, midy = my + ny * (r() - 0.5) * 0.18, d = (dist[e[0]] + dist[e[1]]) / 2 / maxDist;
      segs.push({ x0: p.x, y0: p.y, cx: (p.x + midx) / 2 + nx * b1 * 0.5, cy: (p.y + midy) / 2 + ny * b1 * 0.5, x1: midx, y1: midy, w: w, d: d, tree: tree });
      segs.push({ x0: midx, y0: midy, cx: (midx + q.x) / 2 + nx * b2 * 0.5, cy: (midy + q.y) / 2 + ny * b2 * 0.5, x1: q.x, y1: q.y, w: w, d: d, tree: tree });
    });
    /* tiny pseudopods off the rim: where it is reaching */
    pts.forEach(function (p2, i5) {
      if ((p2.rr || 0) < 0.8 || dist[i5] >= 1e9) return;
      var a = Math.atan2(p2.y - o.y, p2.x - o.x) + (r() - 0.5) * 0.9, len = min * (0.5 + r() * 0.8), x1 = p2.x + Math.cos(a) * len, y1 = p2.y + Math.sin(a) * len;
      if (o.inside && !o.inside(x1, y1)) return;
      segs.push({ x0: p2.x, y0: p2.y, cx: (p2.x + x1) / 2 + (r() - 0.5) * 1.2, cy: (p2.y + y1) / 2 + (r() - 0.5) * 1.2, x1: x1, y1: y1, w: o.w0 || 0.35, d: Math.min(1, dist[i5] / maxDist + 0.04), tip: true });
    });
    return finish(segs, o);
  };

  /* ---------------- growing frost ---------------- */
  /* o: { roots: [[x, y, angle]], len, seed, band: [y0, y1] (optional clamp),
     depth } — pinnate fronds: a stem that wanders, side branches feathering
     off it at a slant, getting shorter toward the tip */
  L.fronds = function (o) {
    var r = BS.rng(o.seed || 11), segs = [];
    function frond(x, y, a, len, w, depth, d0, total) {
      var step = 1.6, n = Math.max(2, Math.round(len / step)), px = x, py = y, side = r() < 0.5 ? 1 : -1, d = d0;
      var curl = (r() - 0.5) * 0.05;
      for (var i = 0; i < n; i++) {
        a += (r() - 0.5) * 0.08 + curl;
        if (o.band) {
          /* keep to the wood: turn back gently toward the middle of the beam near its edges */
          var mid = (o.band[0] + o.band[1]) / 2, half = (o.band[1] - o.band[0]) / 2, off = (py - mid) / half;
          if (Math.abs(off) > 0.55) { var want = Math.cos(a) >= 0 ? -off * 0.5 : Math.PI + off * 0.5; var da = Math.atan2(Math.sin(want - a), Math.cos(want - a)); a += da * 0.25; }
        }
        var nx = px + Math.cos(a) * step, ny = py + Math.sin(a) * step;
        if (o.band) { ny = Math.max(o.band[0] - 1.5, Math.min(o.band[1] + 1.5, ny)); }
        var k = i / n, ww = w * (1 - k * 0.75);
        d += step;
        segs.push({ x0: px, y0: py, cx: (px + nx) / 2, cy: (py + ny) / 2, x1: nx, y1: ny, w: ww, d: d / total });
        /* feathering: side branches at a slant, alternate sides, shorter toward the tip */
        if (depth < (o.depth || 3) && i > 1 && i % (depth === 0 ? 2 : 3) === 0) {
          side = -side;
          var sl = len * (0.34 - depth * 0.07) * (1 - k * 0.85) * (0.8 + r() * 0.4);
          if (sl > 1.6) frond(nx, ny, a + side * (0.62 + r() * 0.16), sl, ww * 0.62, depth + 1, d, total);
        }
        px = nx; py = ny;
      }
    }
    o.roots.forEach(function (R0) { frond(R0[0], R0[1], R0[2], o.len * (0.7 + r() * 0.6), o.w || 0.9, 0, 0, o.len * 1.6); });
    segs.forEach(function (s) { s.d = Math.min(1, s.d); });
    return finish(segs, o);
  };

  function finish(segs, o) {
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    segs.forEach(function (s) { minX = Math.min(minX, s.x0, s.x1, s.cx); minY = Math.min(minY, s.y0, s.y1, s.cy); maxX = Math.max(maxX, s.x0, s.x1, s.cx); maxY = Math.max(maxY, s.y0, s.y1, s.cy); });
    var pad = 8;
    /* bands by distance from the source, for the wave pass */
    var NB = o.bands || 14, bands = []; for (var b = 0; b < NB; b++) bands.push([]);
    segs.forEach(function (s) { bands[Math.min(NB - 1, Math.floor(s.d * NB))].push(s); });
    return { segs: segs, bands: bands, box: { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }, pal: o.pal || L.GOLD };
  }

  /* palettes: [glow, body, core] as r,g,b */
  L.GOLD = { glow: "255,170,50", body: "255,196,70", core: "255,246,196", wave: "255,236,160" };
  L.FOX = { glow: "110,220,110", body: "160,236,120", core: "222,255,190", wave: "210,255,170" };
  /* on paper, gold leaf rather than light: a darker edge so it reads on cream, a bright core */
  L.GILT = { glow: "190,130,40", body: "150,98,24", core: "236,190,84", wave: "255,214,110", paper: true };

  function path(x, list, ox, oy) {
    x.beginPath();
    list.forEach(function (s) { x.moveTo(s.x0 - ox, s.y0 - oy); x.quadraticCurveTo(s.cx - ox, s.cy - oy, s.x1 - ox, s.y1 - oy); });
  }
  /* one stroke per width class, so thick veins and fine lace each get their own weight */
  function strokeByWidth(x, segs, ox, oy, col, mul, add) {
    var classes = {};
    segs.forEach(function (s) { var k = Math.max(1, Math.round(s.w * 4)); (classes[k] = classes[k] || []).push(s); });
    x.strokeStyle = col; x.lineCap = "round"; x.lineJoin = "round";
    Object.keys(classes).forEach(function (k) { x.lineWidth = k / 4 * mul + add; path(x, classes[k], ox, oy); x.stroke(); });
  }
  /* bake the still parts: a wide soft glow, the body, the bright core */
  L.bake = function (net, res) {
    if (net.baked) return net.baked;
    var B = net.box, c = BS.wc(B.w, B.h, res || 2.5), x = c.x, P = net.pal;
    x.save(); x.filter = "blur(3px)"; strokeByWidth(x, net.segs, B.x, B.y, "rgba(" + P.glow + "," + (P.paper ? ".12" : ".22") + ")", 3.2, 1.6); x.restore();
    strokeByWidth(x, net.segs, B.x, B.y, "rgba(" + P.body + "," + (P.paper ? ".85" : ".5") + ")", 1, P.paper ? 0.35 : 0.15);
    strokeByWidth(x, net.segs, B.x, B.y, "rgba(" + P.core + "," + (P.paper ? ".95" : ".75") + ")", 0.4, 0.05);
    /* nodes where veins meet swell a little, the way they do */
    x.fillStyle = "rgba(" + P.core + ",.35)";
    net.segs.forEach(function (s) { if (s.w > 1.2 && !s.tip) { x.beginPath(); x.arc(s.x1 - B.x, s.y1 - B.y, s.w * 0.55, 0, 6.2832); x.fill(); } });
    net.baked = c; c.box = B;
    return c;
  };
  /* drawn as it grows: only the veins nearer the source than g (0..1), in
     full, until it has all come back and can be baked again */
  L.drawGrow = function (ctx, net, cam, t, a, g) {
    var P = net.pal, NB = net.bands.length, show = [];
    for (var b = 0; b < NB; b++) if ((b + 1) / NB <= g + 0.02) show = show.concat(net.bands[b]);
    if (!show.length) return;
    ctx.save(); ctx.globalAlpha = Math.min(1, a);
    strokeByWidth(ctx, show, cam.x, cam.y, "rgba(" + P.glow + ",.18)", 3.2, 1.6);
    strokeByWidth(ctx, show, cam.x, cam.y, "rgba(" + P.body + ",.5)", 1, 0.15);
    strokeByWidth(ctx, show, cam.x, cam.y, "rgba(" + P.core + ",.8)", 0.32, 0.05);
    /* the growing edge burns brightest */
    var edge = net.bands[Math.min(NB - 1, Math.floor(g * NB))] || [];
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, a * (0.6 + 0.4 * Math.sin(t * 6)));
    strokeByWidth(ctx, edge, cam.x, cam.y, "rgba(" + P.wave + ",.8)", 1.2, 0.4);
    ctx.restore();
  };
  /* ---------------- under the drop of water ----------------
     The same network, magnified: veins you can see into, the streaming
     inside them visible as grains riding the current, faster in the wide
     veins, all of it pausing together and pouring back. Baked twice — the
     living gold and the dry crumb — and crossfaded by how dry it is. */
  function bakeLens(net, S, dry) {
    var c = BS.cv(S, S), x = c.getContext("2d"), segs = net.segs;
    function pass(col, mul, add, dx, dy) {
      var classes = {};
      segs.forEach(function (s2) { var k = Math.max(1, Math.round(s2.w * 2)); (classes[k] = classes[k] || []).push(s2); });
      x.strokeStyle = col; x.lineCap = "round"; x.lineJoin = "round";
      Object.keys(classes).forEach(function (k) { x.lineWidth = k / 2 * mul + add; path(x, classes[k], -(dx || 0), -(dy || 0)); x.stroke(); });
    }
    if (dry) {
      pass("rgba(20,14,8,.55)", 1.1, 1, 1.5, 2);
      pass("rgba(118,100,58,.9)", 0.85, 0.4);
      pass("rgba(160,140,90,.6)", 0.35, 0.1, -0.6, -0.6);
    } else {
      x.save(); x.filter = "blur(6px)"; pass("rgba(255,170,40,.35)", 2.6, 4); x.restore();
      pass("rgba(30,16,4,.6)", 1.15, 1.2, 1.6, 2.2);                       // its shadow on the wood
      pass("rgba(196,120,24,.95)", 1, 0.6);                                // the wall of the vein, darker
      pass("rgba(255,196,64,.95)", 0.72, 0.3);                             // the living stuff inside
      pass("rgba(255,236,160,.85)", 0.3, 0.1, -0.5, -0.6);                 // light on its upper edge
    }
    return c;
  }
  L.lensNet = function (S) {
    var k = "lens" + S;
    if (L[k]) return L[k];
    var net = L.network({ x: -S * 0.08, y: S * 0.56, rx: S * 1.25, ry: S * 1.1, a0: -Math.PI * 0.46, a1: Math.PI * 0.46, n: 170, min: S / 15, seed: 1957, w0: S / 220, w1: S / 26 });
    net.lensGold = bakeLens(net, S, false); net.lensDry = bakeLens(net, S, true);
    /* grains: on the veins wide enough to see into */
    net.grains = [];
    var r = BS.rng(77);
    net.segs.forEach(function (s2) { if (s2.w < S / 110) return; var n = Math.ceil(s2.w / (S / 120)); for (var i = 0; i < n; i++) net.grains.push({ s: s2, u: r(), sp: 0.2 + r() * 0.25, off: (r() - 0.5) * 0.5, sz: 0.5 + r() * 0.6 }); });
    L[k] = net; return net;
  };
  L.drawLens = function (x, S, t, o) {
    var net = L.lensNet(S), dry = o.dry || 0, wash = o.wash || 0, dir = o.dir;
    var life = (1 - dry) * (1 - wash * 0.8);
    if (dry > 0.01) { x.globalAlpha = Math.min(1, dry * 1.2); x.drawImage(net.lensDry, 0, 0); }
    if (life > 0.01) { x.globalAlpha = life; x.drawImage(net.lensGold, 0, 0); }
    x.globalAlpha = 1;
    if (life < 0.15) return;
    /* the current, carrying grains along each vein */
    x.save(); x.globalCompositeOperation = "lighter";
    var flowT = o.flowT || 0;
    net.grains.forEach(function (g) {
      var s2 = g.s, sp = g.sp * (0.6 + s2.w / (S / 30));
      var u = ((g.u + flowT * sp * 0.25) % 1 + 1) % 1, iu = 1 - u;
      var px = iu * iu * s2.x0 + 2 * iu * u * s2.cx + u * u * s2.x1, py = iu * iu * s2.y0 + 2 * iu * u * s2.cy + u * u * s2.y1;
      var nx = -(s2.y1 - s2.y0), ny = s2.x1 - s2.x0, nl = Math.hypot(nx, ny) || 1, o2 = g.off * s2.w * 0.5;
      px += nx / nl * o2; py += ny / nl * o2;
      var rad = Math.max(0.6, s2.w * 0.16 * g.sz);
      x.fillStyle = "rgba(255,244,190," + (0.55 * life) + ")"; x.beginPath(); x.arc(px, py, rad, 0, 6.2832); x.fill();
    });
    /* and a slow swell of brightness running out along the network */
    var ph = dir === 0 ? null : (t * 0.12) % 1;
    if (ph != null) {
      var NB = net.bands.length, crest = dir > 0 ? ph : 1 - ph;
      for (var b = 0; b < NB; b++) {
        var k = Math.exp(-Math.pow(((b + 0.5) / NB - crest) / 0.1, 2));
        if (k < 0.05) continue;
        x.globalAlpha = k * 0.5 * life; x.strokeStyle = "rgba(255,226,140,.6)"; x.lineCap = "round";
        net.bands[b].forEach(function (s2) { x.lineWidth = s2.w * 0.8; x.beginPath(); x.moveTo(s2.x0, s2.y0); x.quadraticCurveTo(s2.cx, s2.cy, s2.x1, s2.y1); x.stroke(); });
      }
    }
    x.restore();
  };

  /* it draws itself a little closer to your hand: a thread out of the
     nearest fine edge toward a point, as long as amount (0..1) says */
  L.reach = function (ctx, net, cam, px, py, amount, t, maxLen) {
    if (amount < 0.02) return;
    if (!net.ends) { net.ends = []; net.segs.forEach(function (s) { if (s.tip || s.w < 0.6) net.ends.push([s.x1, s.y1]); }); }
    var best = null, bd = 1e9; net.ends.forEach(function (e) { var d = Math.hypot(e[0] - px, e[1] - py); if (d < bd) { bd = d; best = e; } });
    if (!best) return;
    var ax = best[0], ay = best[1], dx = px - ax, dy = py - ay, dl = Math.hypot(dx, dy) || 1, len = Math.min(dl * 0.6, maxLen || 26) * amount;
    var ex = ax + dx / dl * len, ey = ay + dy / dl * len, wob = Math.sin(t * 2.1) * 2.5 * amount, cx = (ax + ex) / 2 - dy / dl * wob, cy = (ay + ey) / 2 + dx / dl * wob;
    var P = net.pal;
    ctx.save(); ctx.lineCap = "round"; ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(" + P.glow + "," + (0.25 * amount) + ")"; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(ax - cam.x, ay - cam.y); ctx.quadraticCurveTo(cx - cam.x, cy - cam.y, ex - cam.x, ey - cam.y); ctx.stroke();
    ctx.strokeStyle = "rgba(" + P.core + "," + (0.85 * amount) + ")"; ctx.lineWidth = 0.6; ctx.stroke();
    for (var f = -2; f <= 2; f++) { var fa = Math.atan2(dy, dx) + f * 0.4, fl = (2 + 1.2 * Math.sin(t * 3 + f)) * amount; ctx.strokeStyle = "rgba(" + P.core + "," + (0.6 * amount) + ")"; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(ex - cam.x, ey - cam.y); ctx.lineTo(ex + Math.cos(fa) * fl - cam.x, ey + Math.sin(fa) * fl - cam.y); ctx.stroke(); }
    ctx.restore();
  };
  /* where the wave is, 0..1 along the network: out for a while, slow, stop,
     and back (the book's "paused all together … and then poured, all at
     once, the other way") */
  L.phase = function (t, per) {
    per = per || 70;
    var u = (t % per) / per;
    return 0.5 - 0.5 * Math.cos(u * Math.PI * 2);      // 0 → 1 → 0, easing at the ends
  };
  /* draw a lace at world position (it is already in world units), with the
     wave on it. a: overall brightness 0..1 */
  L.draw = function (ctx, net, cam, t, a, opts) {
    if (a <= 0.004) return;
    opts = opts || {};
    var c = L.bake(net, opts.res), B = net.box, P = net.pal;
    ctx.save();
    ctx.globalAlpha = Math.min(1, a * (opts.base == null ? 0.8 : opts.base));
    ctx.drawImage(c, B.x - cam.x, B.y - cam.y, B.w, B.h);
    if (!opts.still) {
      /* the wave: two crests running along, one strong and one faint */
      var ph = L.phase(t + (opts.offset || 0), opts.per), NB = net.bands.length, crest = ph * 1.25 - 0.12;
      ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (var b = 0; b < NB; b++) {
        var bd = (b + 0.5) / NB, k = Math.exp(-Math.pow((bd - crest) / 0.09, 2)) + 0.35 * Math.exp(-Math.pow((bd - crest + 0.38) / 0.12, 2));
        k *= 0.85 + 0.15 * Math.sin(t * 3.1 + b * 1.7);                   // a flicker in each band, never in step
        if (k < 0.04 || !net.bands[b].length) continue;
        ctx.globalAlpha = Math.min(1, a * k * 0.9);
        strokeByWidth(ctx, net.bands[b], cam.x, cam.y, "rgba(" + P.wave + ",.55)", 0.9, 0.25);
      }
    }
    ctx.restore();
  };
})();
