/* cellar.js — the cold lung, made to be looked at.

   · Beams. Three old timbers cross the ceiling, the foxfire living on them.
     When you pass beneath one it thins so you can see yourself.
   · Daylight down the steps. "The daylight from the little doorway reached
     maybe four of them and then gave out": a pale slanted shaft with dust
     turning in it, and a cool pool of it on the bottom steps.
   · The lantern throws shadows. Every shelf, the log, the apples: each casts
     a hard shadow away from the flame, sliding as you walk. Real point light.
   · Jars catch the light. Near a flame each jar wakes: plum, peach,
     blackberry dark as a bruise, glowing through the glass, with a glint on
     the shoulder that moves as you do.
   · Breath. It's cold enough down here to see it, when there's light to see
     it by.
   · The pool in the corner: drips land, rings spread, and the foxfire is in
     it, trembling.
   · The foxfire streams. In a slime mold the living stuff flows one way for
     a minute or so, slows, and pours back the other way: shuttle streaming.
     Here, beads of light run along the veins and, every so often, all of
     them pause together and reverse. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio, T = 16, TL = BS.TL;
  var C = BS.cellar = {};
  function on() { return G.mapId === "cellar"; }
  var occl = null;
  function occluders() {
    if (occl) return occl;
    var m = G.maps.cellar; occl = [];
    for (var y = 0; y < m.h; y++) {
      var x = 0;
      while (x < m.w) {
        var t = m.get(x, y);
        if (t === TL.SHELF || t === TL.LOG || t === TL.APPLES || t === TL.FSHELF) {
          var x0 = x; while (x < m.w && m.get(x, y) === t) x++;
          /* interior shelves cast; the long wall shelves are against the wall anyway */
          occl.push({ x0: x0 * T + 1, x1: x * T - 1, y0: y * T + (t === TL.SHELF ? 2 : 4), y1: y * T + T - 2 });
        } else x++;
      }
    }
    return occl;
  }
  var jars = null;
  function jarList() {
    if (jars) return jars;
    var m = G.maps.cellar, cols = ["91,35,64", "122,42,58", "212,134,46", "42,26,46", "138,58,90", "200,100,42", "58,24,48", "160,64,90"]; jars = [];
    for (var y = 0; y < m.h; y++) for (var x = 0; x < m.w; x++) if (m.get(x, y) === TL.SHELF)
      for (var row = 0; row < 2; row++) for (var i = 0; i < 3; i++) jars.push([x * T + 3.3 + i * 5, y * T + 3 + row * 7.4, cols[(BS.hash(x * 3 + i, y * 2 + row, 101) * cols.length) | 0]]);
    return jars;
  }
  /* ---------------- point-light shadows, cut back into the dark ---------------- */
  C.shadows = function (lx, cam, LK, lights) {
    if (!on() || G.workLights) return;
    var lamp = lights.filter(function (l) { return l[4] === "warm" && l[3] > 0.3; });
    if (!lamp.length) return;
    var L = lamp[0], px = L[0], py = L[1], reach = L[2] * 1.2, dark = Math.min(0.78, L[3] * 0.8);
    lx.save(); lx.globalCompositeOperation = "source-over";
    occluders().forEach(function (o) {
      var cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
      if (Math.hypot(cx - px, cy - py) > reach + 40) return;
      if (px > o.x0 && px < o.x1 && py > o.y0 && py < o.y1) return;
      var c = [[o.x0, o.y0], [o.x1, o.y0], [o.x1, o.y1], [o.x0, o.y1]];
      /* the silhouette edges: project each corner away from the flame and
         fill the hull. A shelf is waist-high to the flame, not a wall to the
         ceiling: each corner's shadow is as long as that corner is far from
         the flame (a held lantern over a shelf), and it softens as it goes */
      var dd0 = Math.hypot(cx - px, cy - py), len = Math.max(26, Math.min(120, 16 + dd0 * 0.9));
      var far = c.map(function (p) { var dx = p[0] - px, dy = p[1] - py, l = Math.hypot(dx, dy) || 1, k = Math.max(3, Math.min(len, l * 0.9)); return [p[0] + dx / l * k, p[1] + dy / l * k]; });
      var pts = c.concat(far), hull = convex(pts);
      var ux = cx - px, uy = cy - py, ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
      var sx0 = cx - cam.x, sy0 = cy - cam.y, gsh = lx.createLinearGradient(sx0, sy0, sx0 + ux * (len + 10), sy0 + uy * (len + 10));
      gsh.addColorStop(0, "rgba(4,8,6," + dark + ")"); gsh.addColorStop(0.55, "rgba(4,8,6," + (dark * 0.75) + ")"); gsh.addColorStop(1, "rgba(4,8,6,0)");
      lx.fillStyle = gsh;
      lx.beginPath(); hull.forEach(function (p, i) { if (i) lx.lineTo(p[0] - cam.x, p[1] - cam.y); else lx.moveTo(p[0] - cam.x, p[1] - cam.y); }); lx.closePath(); lx.fill();
      /* the thing itself stays lit on the side that faces the flame */
      var dd = Math.hypot(cx - px, cy - py), k = Math.max(0, 1 - dd / reach) * L[3];
      lx.globalCompositeOperation = "destination-out"; lx.fillStyle = "rgba(0,0,0," + (0.9 * k) + ")"; lx.fillRect(o.x0 - cam.x, o.y0 - 2 - cam.y, o.x1 - o.x0, o.y1 - o.y0 + 2);
      lx.globalCompositeOperation = "source-over";
    });
    lx.restore();
  };
  function convex(p) {
    p = p.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [];
    p.forEach(function (q) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    for (var i = p.length - 1; i >= 0; i--) { var q = p[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop(); return lo.concat(up);
  }

  /* ---------------- breath ---------------- */
  var puffs = [], nextBreath = 2;
  C.update = function (dt) {
    if (!on()) { puffs.length = 0; return; }
    var t = G.time();
    if (t > nextBreath && !G.prefs.reduced && !G.hidePlayer) {
      nextBreath = t + 2.6 + Math.random() * 1.6;
      var dx = [0, 0, 4, -4][G.p.dir], dy = [2, -6, -1, -1][G.p.dir];
      for (var i = 0; i < 3; i++) puffs.push({ x: G.p.x + dx + (Math.random() - 0.5) * 2, y: G.p.y - 17 + dy, vx: dx * 0.6 + (Math.random() - 0.5) * 3, vy: -3 - Math.random() * 2, t: -i * 0.12, life: 1.8 });
    }
    puffs.forEach(function (p) { p.t += dt; if (p.t > 0) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; } });
    puffs = puffs.filter(function (p) { return p.t < p.life; });
  };

  /* ---------------- the room, before the dark goes on ---------------- */
  var drips = [];
  C.under = function (ctx, cam, t) {
    if (!on()) return;
    /* the pool: dark water, rings where the drips land */
    var px = 18.8 * T, py = 12 * T;
    if (Math.random() < 0.012) drips.push({ x: px + Math.random() * 26, y: py + Math.random() * 16, t: 0 });
    drips.forEach(function (d) { d.t += 0.016; var k = d.t / 1.6; ctx.strokeStyle = "rgba(200,230,220," + (0.5 * (1 - k)) + ")"; ctx.lineWidth = 0.35; BS.ell(ctx, d.x - cam.x, d.y - cam.y, 1 + k * 7, (1 + k * 7) * 0.5); ctx.stroke(); });
    drips = drips.filter(function (d) { return d.t < 1.6; });
    /* breath, which only shows where there is light to show it */
    puffs.forEach(function (p) {
      if (p.t < 0) return;
      var k = p.t / p.life, a = Math.sin(Math.PI * Math.min(1, k * 1.4)) * 0.35;
      var g = ctx.createRadialGradient(p.x - cam.x, p.y - cam.y, 0, p.x - cam.x, p.y - cam.y, 2 + k * 5);
      g.addColorStop(0, "rgba(235,240,245," + a + ")"); g.addColorStop(1, "rgba(235,240,245,0)");
      ctx.fillStyle = g; ctx.fillRect(p.x - cam.x - 8, p.y - cam.y - 8, 16, 16);
    });
  };
  /* beams: overhead, over everything on the floor */
  var beamImg = null;
  function bakeBeam(W) {
    var c = BS.wc(W, 18, 3), x = c.x;
    x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(0, 9, W, 3);                                   // its shadow on the floor
    var g = x.createLinearGradient(0, 0, 0, 9); g.addColorStop(0, "#6a4c30"); g.addColorStop(0.35, "#4e3622"); g.addColorStop(1, "#24170c");
    x.fillStyle = g; x.fillRect(0, 0, W, 9);
    x.fillStyle = "rgba(255,230,190,.08)"; x.fillRect(0, 0, W, 0.7);
    x.strokeStyle = "rgba(20,12,6,.45)"; x.lineWidth = 0.3;                                  /* grain, checks, old nails */
    for (var i = 0; i < 6; i++) { x.beginPath(); var gy = 1.5 + i * 1.3; x.moveTo(0, gy); for (var xx = 0; xx < W; xx += 12) x.lineTo(xx, gy + Math.sin((xx + i * 30) * 0.05) * 0.5); x.stroke(); }
    for (var n = 0; n < 7; n++) { var nx = 18 + n * 47; x.fillStyle = "#1a120a"; BS.ell(x, nx, 4.5, 0.6, 0.6); x.fill(); x.fillStyle = "rgba(160,150,140,.4)"; BS.ell(x, nx - 0.2, 4.3, 0.25, 0.25); x.fill(); }
    x.strokeStyle = "rgba(220,220,210,.12)"; x.lineWidth = 0.2;                               /* a cobweb in the corner */
    for (var w = 0; w < 5; w++) { x.beginPath(); x.moveTo(2, 9); x.lineTo(2 + w * 3, 9 + 8 - w * 1.5); x.stroke(); }
    return c;
  }
  /* beams: overhead, over everything on the floor */
  C.over = function (ctx, cam, t) {
    if (!on()) return;
    var m = G.maps.cellar, W = (m.w - 1.2) * T;
    if (!beamImg) beamImg = bakeBeam(W);
    (m.beams || []).forEach(function (by) {
      var y = by * T + 4, near = Math.abs(G.p.y - 12 - y) < 12 && !G.hidePlayer;
      ctx.globalAlpha = near ? 0.5 : 0.94;
      ctx.drawImage(beamImg, T * 0.6 - cam.x, y - cam.y, beamImg.w, beamImg.h);
      ctx.globalAlpha = 1;
    });
  };
  /* ---------------- after the dark: things that make or catch light ---------------- */
  C.post = function (ctx, cam, t, dark, lights) {
    if (!on()) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    /* daylight down the steps, before the pumps and the work lights changed everything */
    if (!G.workLights) {
      var sx = 1.2 * T - cam.x, sy = 1 * T - cam.y;
      var g = ctx.createLinearGradient(sx, sy, sx + 30, sy + 50); g.addColorStop(0, "rgba(220,215,200,.16)"); g.addColorStop(1, "rgba(220,215,200,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 44, sy); ctx.lineTo(sx + 64, sy + 52); ctx.lineTo(sx + 10, sy + 56); ctx.closePath(); ctx.fill();
      for (var d = 0; d < 14; d++) { var ph = t * 0.15 + d * 1.7, dx = sx + 8 + ((d * 37 + t * 2) % 46), dy = sy + 8 + ((d * 23 + Math.sin(ph) * 6 + t * 3) % 40); ctx.fillStyle = "rgba(240,235,220," + (0.25 + 0.25 * Math.sin(ph * 3)) + ")"; BS.ell(ctx, dx, dy, 0.35, 0.35); ctx.fill(); }
    }
    /* jars waking in the flame */
    var lamp = lights.filter(function (l) { return (l[4] === "warm" || l[4] === "gold") && l[3] > 0.2; })[0];
    if (lamp && !G.workLights) {
      jarList().forEach(function (J) {
        {
          var jx = J[0], jy = J[1], dd = Math.hypot(jx - lamp[0], jy - lamp[1]), k = Math.max(0, 1 - dd / (lamp[2] * 0.9));
          if (k <= 0.02) return;
          var cc = J[2], fl = 0.85 + 0.15 * Math.sin(t * 9 + jx);
          ctx.fillStyle = "rgba(" + cc + "," + (0.55 * k * fl) + ")"; BS.rr(ctx, jx - 1.6 - cam.x, jy - cam.y, 3.2, 5, 0.8); ctx.fill();
          /* the glint on the shoulder, on the side facing the flame */
          var side = lamp[0] < jx ? -1 : 1;
          ctx.fillStyle = "rgba(255,245,220," + (0.8 * k * fl) + ")"; ctx.fillRect(jx + side * 1.1 - 0.25 - cam.x, jy + 0.6 - cam.y, 0.5, 2.6);
        }
      });
    }
    /* the foxfire, in the pool */
    var vis = G.workLights ? 0 : Math.max(0, G.eyes.adapt - 0.2);
    if (vis > 0) for (var r = 0; r < 6; r++) { var rx = 18.9 * T + r * 4.5 - cam.x, ry = 12.2 * T + (r % 3) * 4 - cam.y, w = Math.sin(t * 1.6 + r) * 1.4; ctx.fillStyle = "rgba(150,240,130," + (0.12 * vis) + ")"; ctx.fillRect(rx + w, ry, 3.2, 0.5); }
    ctx.restore();
  };
})();
