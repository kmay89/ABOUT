/* gbook.js — Gran's book, alive.

   The book Wren carries is the one from the cellar, so it should look like
   it: a cloth-and-leather binding gone soft at the corners, paper the color
   of weak tea with its fibers and foxing, ribbons for markers in the colors
   of her jars — and the gold. The same living network that lay across the
   waxed cloth grows in the margins here: in from the spine and the corners
   when the book opens, breathing, the streaming running out and pausing and
   pouring back. And it does what the book says it did that first night: it
   draws itself a little closer to your hand. Put your finger or the cursor
   near the margin and a thread reaches toward it.

   On a wide screen the book lies open: the left page is a plate, an oval of
   cellar dark with the gold alive in it and her first line under it; the
   right page is the book's contents. On a phone it is one page, with the
   gold in its margins.

   Everything here is made at load: the paper and the leather are painted
   into small canvases and laid on as textures; no image files. Reduced
   motion shows the gold still. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, L = BS.lace;
  var book = document.getElementById("book"); if (!book || !L) return;
  var card = book.querySelector(".bcard"), tabs = book.querySelector(".tabs"), body = book.querySelector(".bbody");
  var dpr = function () { return Math.min(2.5, window.devicePixelRatio || 1); };
  function reduced() { return G.prefs && G.prefs.reduced; }

  /* ---------------- paper and leather ---------------- */
  function noiseTile(n, paint) { var c = BS.cv(n, n), x = c.getContext("2d"); paint(x, n, BS.rng(n * 7 + 3)); return c.toDataURL("image/png"); }
  var paper = noiseTile(384, function (x, n, r) {
    x.fillStyle = "#efe2c2"; x.fillRect(0, 0, n, n);
    /* mottling: the slow uneven tone of old rag paper */
    for (var i = 0; i < 40; i++) { var gx = r() * n, gy = r() * n, g = x.createRadialGradient(gx, gy, 0, gx, gy, 24 + r() * 60); var dk = r() < 0.45; g.addColorStop(0, dk ? "rgba(196,150,80,.07)" : "rgba(255,250,232,.14)"); g.addColorStop(1, dk ? "rgba(196,150,80,0)" : "rgba(255,250,232,0)"); x.fillStyle = g; x.fillRect(0, 0, n, n); }
    /* fibers, laid every which way */
    for (i = 0; i < 520; i++) { var a = r() * 6.28, l = 3 + r() * 11, px = r() * n, py = r() * n; x.strokeStyle = r() < 0.5 ? "rgba(140,108,60,.12)" : "rgba(255,252,236,.22)"; x.lineWidth = 0.4 + r() * 0.5; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a + 0.6) * l * 0.5, py + Math.sin(a + 0.6) * l * 0.5, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
    /* foxing: the little rust freckles old books get */
    for (i = 0; i < 16; i++) { var fx = r() * n, fy = r() * n, fr = 0.8 + r() * 3.2; var fg = x.createRadialGradient(fx, fy, 0, fx, fy, fr); fg.addColorStop(0, "rgba(150,90,40,.28)"); fg.addColorStop(0.7, "rgba(150,90,40,.12)"); fg.addColorStop(1, "rgba(150,90,40,0)"); x.fillStyle = fg; x.beginPath(); x.arc(fx, fy, fr, 0, 6.28); x.fill(); }
    for (i = 0; i < 1600; i++) { x.fillStyle = r() < 0.5 ? "rgba(90,60,30,.05)" : "rgba(255,255,255,.07)"; x.fillRect(r() * n, r() * n, 1, 1); }
  });
  var leather = noiseTile(192, function (x, n, r) {
    x.fillStyle = "#26301f"; x.fillRect(0, 0, n, n);
    /* grain: a crazing of tiny pebbled cells */
    for (var i = 0; i < 900; i++) { var px = r() * n, py = r() * n, s = 1 + r() * 3; x.fillStyle = r() < 0.5 ? "rgba(0,0,0,.18)" : "rgba(160,170,120,.06)"; x.beginPath(); x.ellipse(px, py, s, s * (0.6 + r() * 0.4), r() * 3, 0, 6.28); x.fill(); }
    for (i = 0; i < 60; i++) { var g = x.createRadialGradient(r() * n, r() * n, 0, r() * n, r() * n, 10 + r() * 40); g.addColorStop(0, r() < 0.5 ? "rgba(0,0,0,.18)" : "rgba(120,110,70,.1)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, n, n); }
  });
  book.style.setProperty("--paper", "url(" + paper + ")");
  book.style.setProperty("--leather", "url(" + leather + ")");

  /* ---------------- the open book: a plate on the left, the page on the right ---------------- */
  var plate = document.createElement("div"); plate.className = "bplate"; plate.setAttribute("aria-hidden", "true");
  plate.innerHTML = '<canvas class="bplatecv"></canvas><div class="bplatetx"><small class="bpch"></small><p class="bpink">If you are reading this, the lights have gone out — and that is the only reason you can see.</p></div>';
  var page = document.createElement("div"); page.className = "bpage";
  var gold = document.createElement("canvas"); gold.className = "bgold"; gold.setAttribute("aria-hidden", "true");
  card.insertBefore(plate, tabs); card.insertBefore(page, tabs);
  page.appendChild(tabs); page.appendChild(gold); page.appendChild(body);
  /* the close button becomes a wax seal on the binding */
  var x0 = tabs.querySelector(".x"); if (x0) { card.appendChild(x0); x0.classList.add("seal"); x0.innerHTML = "<span>✕</span>"; }
  /* each ribbon gets one of her jar colors */
  ["#7a2a3a", "#c8742a", "#4e6a2e", "#3a2a4a", "#2a5a6a", "#8a3a5a", "#9a7a2a", "#5a3a22"].forEach(function (c, i) { var b = tabs.querySelectorAll("button:not(.seal)")[i]; if (b) b.style.setProperty("--rib", c); });

  /* ---------------- the living margins ---------------- */
  var nets = null, netKey = "", opened = 0, raf = 0, pointer = null, reach = 0, reachFrom = null;
  function size(cv, el) {
    var w = el.clientWidth, h = el.clientHeight, d = dpr();
    if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    var x = cv.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0); return { x: x, w: w, h: h };
  }
  function grow(W, H) {
    var key = W + "x" + H; if (nets && netKey === key) return nets;
    var top = tabs.offsetHeight + 4, band = W < 520 ? 16 : 26;
    function inBand(x, y) { if (x < 2 || y < top || x > W - 2 || y > H - 2) return false; return x < band || x > W - band * 0.75 || y > H - band * 0.8; }
    /* a chain of small colonies all along the gutter, the foot and the fore-edge,
       each grown in its own patch of margin so the lace runs the whole way round */
    nets = []; var sd = 31, step = band * 3.2;
    function colony(x, y) { nets.push(L.network({ x: x, y: y, rx: step * 0.95, ry: step * 0.95, n: 46, min: Math.max(4.5, band / 4.2), seed: sd += 7, w0: 0.3, w1: 1.6, inside: inBand, bands: 10, pal: L.GILT })); }
    for (var yy = top + band * 0.6; yy < H - band; yy += step) colony(band * 0.35, yy + (BS.hash(yy, 1, 3) - 0.5) * step * 0.3);
    for (var xx = band * 1.6; xx < W - band; xx += step) colony(xx + (BS.hash(xx, 2, 3) - 0.5) * step * 0.3, H - band * 0.3);
    for (yy = H - band * 2; yy > top + band * 2; yy -= step * 1.4) colony(W - band * 0.3, yy);
    /* everywhere it could reach from, for the thread toward your hand */
    nets.nodes = [];
    nets.forEach(function (n) { n.segs.forEach(function (s) { if (s.tip || s.w < 0.5) nets.nodes.push([s.x1, s.y1]); }); n.baked = null; });
    netKey = key; return nets;
  }
  var CAM = { x: 0, y: 0 };
  function drawMargins(t) {
    var S = size(gold, page), x = S.x;
    x.clearRect(0, 0, S.w, S.h);
    var N = grow(S.w, S.h), age = (performance.now() - opened) / 1000, g = reduced() ? 1 : Math.min(1, age / 1.8);
    N.forEach(function (n, i) {
      if (g < 1) L.drawGrow(x, n, CAM, t, 0.9, Math.max(0, Math.min(1, g * 1.6 - i / N.length * 0.6)));
      else L.draw(x, n, CAM, t, 1, { base: 1, offset: i * 3.7, per: 26, res: dpr(), still: reduced() });
    });
    /* it draws itself a little closer to your hand */
    if (!reduced()) {
      var want = 0;
      if (pointer) {
        var best = null, bd = 1e9; N.nodes.forEach(function (p) { var d = Math.hypot(p[0] - pointer[0], p[1] - pointer[1]); if (d < bd) { bd = d; best = p; } });
        if (best && bd < 190) { want = Math.min(1, (190 - bd) / 120); if (!reachFrom || Math.hypot(reachFrom[0] - best[0], reachFrom[1] - best[1]) > 30) reachFrom = best; }
      }
      reach += (want - reach) * 0.04;
      if (reach > 0.02 && reachFrom && pointer) {
        var ax = reachFrom[0], ay = reachFrom[1], dx = pointer[0] - ax, dy = pointer[1] - ay, dl = Math.hypot(dx, dy) || 1, len = Math.min(dl * 0.62, 90) * reach;
        var ex = ax + dx / dl * len, ey = ay + dy / dl * len, wob = Math.sin(t * 2.3) * 6 * reach;
        var cx = (ax + ex) / 2 - dy / dl * wob, cy = (ay + ey) / 2 + dx / dl * wob;
        x.save(); x.lineCap = "round";
        x.strokeStyle = "rgba(255,180,60," + (0.28 * reach) + ")"; x.lineWidth = 5; x.beginPath(); x.moveTo(ax, ay); x.quadraticCurveTo(cx, cy, ex, ey); x.stroke();
        x.strokeStyle = "rgba(240,180,60," + (0.9 * reach) + ")"; x.lineWidth = 1.4; x.stroke();
        x.strokeStyle = "rgba(255,246,200," + (0.9 * reach) + ")"; x.lineWidth = 0.5; x.stroke();
        /* its tip, fanning, feeling for you */
        for (var f = -2; f <= 2; f++) { var fa = Math.atan2(dy, dx) + f * 0.38, fl = 5 + 3 * Math.sin(t * 3 + f); x.strokeStyle = "rgba(255,226,140," + (0.6 * reach) + ")"; x.lineWidth = 0.5; x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex + Math.cos(fa) * fl * reach, ey + Math.sin(fa) * fl * reach); x.stroke(); }
        x.restore();
      }
    }
  }
  /* the plate: an oval of cellar dark with the gold alive in it */
  var plateNet = null, plateKey = "";
  function drawPlate(t) {
    if (!plate.offsetWidth) return;
    var cv = plate.querySelector(".bplatecv"), S = size(cv, plate), x = S.x, W = S.w, H = S.h;
    x.clearRect(0, 0, W, H);
    var cx = W / 2, cy = H * 0.4, rx = W * 0.36, ry = H * 0.3;
    var key = W + "x" + H;
    if (plateKey !== key) {
      plateKey = key;
      plateNet = L.network({ x: cx - rx * 0.15, y: cy + ry * 0.2, rx: rx * 1.05, ry: ry * 1.05, n: 220, min: Math.max(5, rx / 15), seed: 1957, w0: 0.4, w1: 3.4,
        inside: function (px, py) { var u = (px - cx) / (rx * 0.94), v = (py - cy) / (ry * 0.94); return u * u + v * v < 1; } });
    }
    /* the dark, and a little warmth where the lantern would be */
    x.save(); x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 6.2832); x.clip();
    var dg = x.createRadialGradient(cx - rx * 0.2, cy + ry * 0.25, 4, cx, cy, Math.max(rx, ry)); dg.addColorStop(0, "#2a2014"); dg.addColorStop(0.6, "#120d08"); dg.addColorStop(1, "#060403"); x.fillStyle = dg; x.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    /* the grain of the old shelf, just visible */
    x.strokeStyle = "rgba(90,74,52,.18)"; x.lineWidth = 1;
    for (var j = 0; j < 22; j++) { var yy = cy - ry + j * ry * 2 / 22; x.beginPath(); x.moveTo(cx - rx, yy); x.bezierCurveTo(cx - rx * 0.3, yy + Math.sin(j) * 6, cx + rx * 0.3, yy - Math.cos(j * 1.3) * 6, cx + rx, yy + 3); x.stroke(); }
    L.draw(x, plateNet, CAM, t, 1, { per: 30, res: dpr(), still: reduced() });
    /* motes in the dark */
    for (var m = 0; m < 26; m++) { var h1 = BS.hash(m, 1, 9), h2 = BS.hash(m, 2, 9), h3 = BS.hash(m, 3, 9); var mx = cx + (h1 - 0.5) * rx * 1.8 + Math.sin(t * 0.2 + m) * 6, my = cy + ry - ((t * (4 + h3 * 6) + h2 * ry * 2) % (ry * 2)); var tw = Math.pow(Math.max(0, Math.sin(t * (0.7 + h3) + m)), 3); if (tw < 0.05) continue; x.fillStyle = "rgba(255,226,150," + (0.6 * tw) + ")"; x.beginPath(); x.arc(mx, my, 0.8 + h3, 0, 6.2832); x.fill(); }
    var vg = x.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.6, cx, cy, Math.max(rx, ry) * 1.02); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.65)"); x.fillStyle = vg; x.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    x.restore();
    /* the frame: a gilt oval, a fine inner rule, and a vine running round it */
    var gg = x.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry); gg.addColorStop(0, "#f6dc8a"); gg.addColorStop(0.35, "#b8862a"); gg.addColorStop(0.6, "#f0d27a"); gg.addColorStop(1, "#8a5a1a");
    x.strokeStyle = gg; x.lineWidth = 3.2; x.beginPath(); x.ellipse(cx, cy, rx + 3, ry + 3, 0, 0, 6.2832); x.stroke();
    x.strokeStyle = "rgba(90,60,20,.8)"; x.lineWidth = 0.8; x.beginPath(); x.ellipse(cx, cy, rx + 7.5, ry + 7.5, 0, 0, 6.2832); x.stroke();
    x.strokeStyle = "rgba(255,240,190,.5)"; x.lineWidth = 0.6; x.beginPath(); x.ellipse(cx, cy, rx + 1.4, ry + 1.4, 0, 0, 6.2832); x.stroke();
    var vine = BS.rng(7);
    for (var k = 0; k < 64; k++) {
      var a = k / 64 * 6.2832, px = cx + Math.cos(a) * (rx + 7.5), py = cy + Math.sin(a) * (ry + 7.5), side = k % 2 ? 1 : -1, la = a + Math.PI / 2 + side * 0.9;
      var ll = 4 + vine() * 3, lx = px + Math.cos(la) * ll, ly = py + Math.sin(la) * ll;
      x.fillStyle = k % 8 === 0 ? "#c8962e" : "rgba(78,98,46,.8)";
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(la - 0.5) * ll * 0.7, py + Math.sin(la - 0.5) * ll * 0.7, lx, ly); x.quadraticCurveTo(px + Math.cos(la + 0.5) * ll * 0.7, py + Math.sin(la + 0.5) * ll * 0.7, px, py); x.fill();
      if (k % 8 === 0) { x.fillStyle = "#f2d27a"; x.beginPath(); x.arc(px, py, 1.5, 0, 6.2832); x.fill(); }
    }
    /* a tiny gilt finial top and bottom */
    [[cx, cy - ry - 11, -1], [cx, cy + ry + 11, 1]].forEach(function (f) { x.fillStyle = gg; x.beginPath(); x.moveTo(f[0], f[1] - 5 * f[2]); x.quadraticCurveTo(f[0] + 5, f[1], f[0], f[1] + 5 * f[2]); x.quadraticCurveTo(f[0] - 5, f[1], f[0], f[1] - 5 * f[2]); x.fill(); });
  }
  function frame() {
    raf = 0; if (!book.classList.contains("on")) return;
    var t = performance.now() / 1000;
    drawMargins(t); drawPlate(t);
    if (!reduced() || (performance.now() - opened) < 2000) raf = requestAnimationFrame(frame);
  }
  function start() {
    opened = performance.now(); reach = 0;
    var C = BS.story && BS.story.CHAPTERS && BS.story.CHAPTERS[BS.story.chapterIndex ? BS.story.chapterIndex() : 0];
    var ch = plate.querySelector(".bpch"); if (ch) ch.textContent = C ? "Chapter " + C[0] + " · " + C[1] : "";
    if (!raf) raf = requestAnimationFrame(frame);
  }
  new MutationObserver(function () { if (book.classList.contains("on")) start(); }).observe(book, { attributes: true, attributeFilter: ["class"] });
  page.addEventListener("pointermove", function (e) { var b = page.getBoundingClientRect(); pointer = [e.clientX - b.left, e.clientY - b.top]; });
  page.addEventListener("pointerdown", function (e) { var b = page.getBoundingClientRect(); pointer = [e.clientX - b.left, e.clientY - b.top]; });
  page.addEventListener("pointerleave", function () { pointer = null; });
  window.addEventListener("resize", function () { netKey = ""; plateKey = ""; });

  /* ---------------- turning the page ---------------- */
  tabs.addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]"); if (!b || reduced()) return;
    body.classList.remove("turn"); void body.offsetWidth; body.classList.add("turn");
  });
  body.addEventListener("animationend", function () { body.classList.remove("turn"); });
})();
