/* guide.js — the gold thread, and the wisps.

   The thread. A slime mold finds the shortest way through a maze without a
   brain: it sends threads out everywhere, and the ones that reach food
   thicken while the rest pull back. So when you're lost, a thread of that
   same gold grows out from your feet — exploring tendrils first, feeling
   about, then the one true path firming up and the others withdrawing —
   and beads of light run along it toward where you need to be. Nothing
   says where it comes from. It just appears when you have been wandering a
   while, or when you ask (H, or a tap on the goal card).

   The wisps. Small lights over the things you can do something with. They
   hover and breathe, brighten as you come near, and bloom into a ring when
   you're close enough to act. Gold for the story's own things, a pale
   moonlight blue for the kindnesses nobody asks for, and on the ground a
   few green motes where something small is waiting for the lens. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio, T = 16;
  var Gd = BS.guide = {};

  /* ---------------- the path ---------------- */
  function walk(m, x, y) { var t = m.get(x, y); return t >= 0 && !BS.SOLID[t]; }
  function findPath(m, sx, sy, gx, gy) {
    var W = m.w, H = m.h, prev = new Int32Array(W * H).fill(-1), q = [sy * W + sx], head = 0, goal = gy * W + gx;
    prev[sy * W + sx] = sy * W + sx;
    while (head < q.length) {
      var c = q[head++]; if (c === goal) break;
      var cx = c % W, cy = (c / W) | 0;
      for (var k = 0; k < 4; k++) {
        var nx = cx + [1, -1, 0, 0][k], ny = cy + [0, 0, 1, -1][k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var n = ny * W + nx; if (prev[n] !== -1) continue;
        if (n !== goal && !walk(m, nx, ny)) continue;
        prev[n] = c; q.push(n);
      }
    }
    if (prev[goal] === -1) return null;
    var out = [], cur = goal;
    while (cur !== sy * W + sx) { out.push([(cur % W + 0.5) * T, (((cur / W) | 0) + 0.5) * T]); cur = prev[cur]; }
    out.push([(sx + 0.5) * T, (sy + 0.5) * T]);
    return out.reverse();
  }
  /* smooth the staircase into a living line, with a little wander */
  function organic(pts, seed) {
    var s = [];
    for (var i = 0; i < pts.length; i += 2) s.push(pts[i]);
    if (s[s.length - 1] !== pts[pts.length - 1]) s.push(pts[pts.length - 1]);
    var out = [];
    for (var j = 0; j < s.length - 1; j++) {
      var p0 = s[Math.max(0, j - 1)], p1 = s[j], p2 = s[j + 1], p3 = s[Math.min(s.length - 1, j + 2)];
      for (var u = 0; u < 1; u += 0.25) {
        var u2 = u * u, u3 = u2 * u;
        var x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3);
        var y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3);
        out.push([x, y]);
      }
    }
    out.push(s[s.length - 1]);
    var L = [0]; for (var k = 1; k < out.length; k++) L.push(L[k - 1] + Math.hypot(out[k][0] - out[k - 1][0], out[k][1] - out[k - 1][1]));
    /* wander side to side like something alive, pinned at both ends */
    var tot = L[L.length - 1], wav = out.map(function (p, i) {
      var a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      var pin = Math.min(1, L[i] / 24, (tot - L[i]) / 24), w = (Math.sin(L[i] * 0.09 + seed) * 2.6 + Math.sin(L[i] * 0.23 + seed * 1.7) * 1.3 + Math.sin(L[i] * 0.61 + seed * 3.1) * 0.5) * Math.max(0, pin);
      return [p[0] - dy / l * w, p[1] + dx / l * w];
    });
    var L2 = [0]; for (k = 1; k < wav.length; k++) L2.push(L2[k - 1] + Math.hypot(wav[k][0] - wav[k - 1][0], wav[k][1] - wav[k - 1][1]));
    return { p: wav, L: L2, total: L2[L2.length - 1] };
  }

  var thread = null, lastAsk = -99;
  Gd.summon = function (why) {
    if (!G.map || G.mode !== "walk" || G.cut) return false;
    var tg = BS.story && BS.story.target && BS.story.target(); if (!tg) return false;
    var tx = tg[1], ty = tg[2];
    if (tg[0] !== G.mapId) { var ex = G.routeExit && G.routeExit(tg[0]); if (!ex) return false; tx = ex.x + 0.5; ty = ex.y + 0.5; }
    var m = G.map, sx = Math.floor(G.p.x / T), sy = Math.floor(G.p.y / T), gx = Math.max(0, Math.min(m.w - 1, Math.floor(tx))), gy = Math.max(0, Math.min(m.h - 1, Math.floor(ty)));
    if (Math.hypot(gx - sx, gy - sy) < 2) return false;
    var raw = findPath(m, sx, sy, gx, gy); if (!raw || raw.length < 3) return false;
    var o = organic(raw, Math.random() * 10);
    /* the tendrils that feel about and then pull back */
    var tend = [];
    for (var d = 20; d < o.total - 10; d += 16 + Math.random() * 18) {
      var i = at(o, d), a = Math.atan2(o.p[i + 1 < o.p.length ? i + 1 : i][1] - o.p[i][1], o.p[i + 1 < o.p.length ? i + 1 : i][0] - o.p[i][0]) + (Math.random() < 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.8);
      var len = 6 + Math.random() * 14, pts = [o.p[i]];
      for (var k2 = 1; k2 <= 4; k2++) { a += (Math.random() - 0.5) * 0.6; var lp = pts[pts.length - 1]; pts.push([lp[0] + Math.cos(a) * len / 4, lp[1] + Math.sin(a) * len / 4]); }
      tend.push({ d: d, pts: pts });
    }
    thread = { o: o, tend: tend, t0: G.time(), life: why === "ask" ? 9 : 11, target: tg[0] === G.mapId ? [tx * T, ty * T] : [(tx) * T, (ty) * T] };
    if (A) A.sfx("moword");
    if (why === "ask" && A) setTimeout(function () { A.sfx("moword"); }, 260);
    return true;
  };
  function at(o, d) { var L = o.L, i = 1; while (i < L.length - 1 && L[i] < d) i++; return i - 1; }
  function posAt(o, d) { var i = at(o, d), a = o.p[i], b = o.p[Math.min(i + 1, o.p.length - 1)], seg = (o.L[i + 1] || o.L[i]) - o.L[i] || 1, u = Math.max(0, Math.min(1, (d - o.L[i]) / seg)); return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }

  Gd.update = function (dt) {
    if (!G.map) return;
    if (thread && (G.time() - thread.t0 > thread.life || G.cut)) thread = null;
    /* lost a while? it comes by itself, once per lost spell */
    if (!thread && G.mode === "walk" && !G.cut && G.stuckT > 20 && G.stuckKey !== Gd.shownFor && G.prefs.pointer !== false) { if (Gd.summon("auto")) Gd.shownFor = G.stuckKey; }
  };
  /* drawn on the ground, glowing (screen space already carries the camera) */
  Gd.ground = function (ctx, cam, time) {
    if (!thread) return;
    var o = thread.o, age = time - thread.t0, grow = Math.min(1, age / 1.6), fade = Math.min(1, (thread.life - age) / 1.5), reach = o.total * (1 - Math.pow(1 - grow, 2.2));
    var night = G.sky && G.sky.dark > 0.4 || G.mapId === "cellar";
    /* by day it is gold paint with a soft halo; in the dark it is light */
    ctx.save(); ctx.globalCompositeOperation = night ? "lighter" : "source-over"; ctx.lineCap = "round"; ctx.lineJoin = "round";
    /* tendrils: out during the search, back once the way is found */
    thread.tend.forEach(function (t) {
      if (t.d > reach) return;
      var life = age - (t.d / o.total) * 1.6, ext = life < 0.5 ? life / 0.5 : life < 1.6 ? 1 : Math.max(0, 1 - (life - 1.6) / 0.8);
      if (ext <= 0) return;
      var n = Math.max(2, Math.round(t.pts.length * ext));
      ctx.strokeStyle = "rgba(255,206,110," + (0.35 * ext * fade) + ")"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(t.pts[0][0] - cam.x, t.pts[0][1] - cam.y); for (var i = 1; i < n; i++) ctx.lineTo(t.pts[i][0] - cam.x, t.pts[i][1] - cam.y); ctx.stroke();
    });
    /* the path: a soft glow under a fine bright thread, thickening as it settles */
    var thick = 0.5 + Math.min(1, Math.max(0, age - 1.4) / 1.2) * 0.6;
    (night ? [[5, 0.07], [2.4, 0.16], [thick, 0.75]] : [[3.6, 0.12], [1.9, 0.26], [thick * 1.05, 0.9]]).forEach(function (w, wi) {
      ctx.strokeStyle = night ? "rgba(255,214,130," + (w[1] * fade * 1.2) + ")" : wi < 2 ? "rgba(255,236,170," + (w[1] * fade) + ")" : "rgba(214,150,40," + (w[1] * fade) + ")"; ctx.lineWidth = w[0];
      ctx.beginPath(); var started = false;
      for (var i = 0; i < o.p.length && o.L[i] <= reach; i++) { var x = o.p[i][0] - cam.x, y = o.p[i][1] - cam.y; if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); }
      ctx.stroke();
    });
    /* beads of light running toward where you need to be */
    if (grow >= 1) for (var b = 0; b < 4; b++) {
      var d = ((age * 70 + b * o.total / 4) % o.total), pp = posAt(o, d), k = Math.sin(d / o.total * Math.PI);
      var g = ctx.createRadialGradient(pp[0] - cam.x, pp[1] - cam.y, 0, pp[0] - cam.x, pp[1] - cam.y, 5);
      g.addColorStop(0, "rgba(255,240,190," + (0.9 * k * fade) + ")"); g.addColorStop(1, "rgba(255,200,100,0)");
      ctx.fillStyle = g; ctx.fillRect(pp[0] - cam.x - 5, pp[1] - cam.y - 5, 10, 10);
    }
    /* where it ends: a slow bloom */
    if (grow >= 1) {
      var e = o.p[o.p.length - 1], pul = 0.5 + 0.5 * Math.sin(age * 3);
      var g2 = ctx.createRadialGradient(e[0] - cam.x, e[1] - cam.y, 0, e[0] - cam.x, e[1] - cam.y, 10 + pul * 4);
      g2.addColorStop(0, "rgba(255,226,150," + (0.5 * fade) + ")"); g2.addColorStop(1, "rgba(255,200,100,0)");
      ctx.fillStyle = g2; ctx.fillRect(e[0] - cam.x - 16, e[1] - cam.y - 16, 32, 32);
    }
    ctx.restore();
  };

  /* ---------------- the wisps ---------------- */
  var KIND = { can: 1, herbs: 1, swing: 1, peaches: 1, feeder: 1, seed: 1, switch: 1, outlet: 1, tap: 1, fridge: 1, window: 1 };
  Gd.wisps = function (ctx, cam, time, VW, VH, near) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    G.spots.forEach(function (s) {
      if (s.toy || s.map !== G.mapId || (s.when && !s.when())) return;
      var wx = s.x * T, wy = s.y * T - 12, d = Math.hypot(s.x * T - G.p.x, s.y * T - G.p.y);
      if (d > 120 || d < 6) return;
      var sx = wx - cam.x, sy = wy - cam.y + Math.sin(time * 1.7 + s.x * 3) * 1.2;
      if (sx < -10 || sy < -10 || sx > VW + 10 || sy > VH + 10) return;
      var kind = KIND[s.id] ? "k" : "s", col = kind === "k" ? [170, 200, 255] : [255, 222, 150];
      var close = 1 - Math.min(1, Math.max(0, (d - 18) / 100)), act = near === s, br = 0.25 + close * 0.55 + (act ? 0.25 : 0);
      var r = 1.2 + close * 1.1 + Math.sin(time * 3 + s.y) * 0.25;
      var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 5);
      g.addColorStop(0, "rgba(" + col + "," + br + ")"); g.addColorStop(0.25, "rgba(" + col + "," + (br * 0.45) + ")"); g.addColorStop(1, "rgba(" + col + ",0)");
      ctx.fillStyle = g; ctx.fillRect(sx - r * 5, sy - r * 5, r * 10, r * 10);
      ctx.fillStyle = "rgba(255,255,245," + Math.min(1, br + 0.2) + ")"; BS.ell(ctx, sx, sy, r * 0.45, r * 0.45); ctx.fill();
      /* motes circling it */
      for (var m = 0; m < 3; m++) { var a = time * (1.2 + m * 0.4) + m * 2.1 + s.x, rr = r * 2.6 + m; ctx.fillStyle = "rgba(" + col + "," + (br * 0.7) + ")"; BS.ell(ctx, sx + Math.cos(a) * rr, sy + Math.sin(a) * rr * 0.6, 0.35, 0.35); ctx.fill(); }
      /* in reach: it opens into a ring */
      if (act) { var k = (time * 1.4) % 1; ctx.strokeStyle = "rgba(" + col + "," + (0.6 * (1 - k)) + ")"; ctx.lineWidth = 0.5; BS.ell(ctx, sx, sy, 3 + k * 7, (3 + k * 7) * 0.7); ctx.stroke(); }
    });
    /* green motes on the ground where something small waits for the lens */
    if (G.s.items && G.s.items.lens) (G.looks || []).forEach(function (l) {
      if (l.after && !G.s.flags["b_" + l.after]) return; if (G.s.seen[l.id] || l.where[0] !== G.mapId) return;
      var lx = l.where[1] * T + 8, ly = l.where[2] * T + 8, d = Math.hypot(lx - G.p.x, ly - G.p.y); if (d > 90) return;
      var k2 = 1 - d / 90;
      for (var i = 0; i < 4; i++) { var ph = time * 0.8 + i * 1.6 + l.where[1], x = lx + Math.sin(ph) * 4, y = ly - ((time * 6 + i * 4) % 10); ctx.fillStyle = "rgba(170,255,200," + (0.5 * k2 * Math.sin(((time * 6 + i * 4) % 10) / 10 * Math.PI)) + ")"; BS.ell(ctx, x - cam.x, y - cam.y, 0.5, 0.5); ctx.fill(); }
    });
    ctx.restore();
  };

  /* asking for the way */
  window.addEventListener("keydown", function (e) { if (e.code === "KeyH" && G.mode === "walk" && !G.cut && !e.repeat) { if (G.time() - lastAsk > 1) { lastAsk = G.time(); Gd.summon("ask"); } } });
})();
