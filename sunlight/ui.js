/* ui.js — the title, Gran's book (pages, field notes, the small things
   you've seen, the map, your page), the settings, the ending. All HTML,
   so it reads at the reader's own size and a screen reader can follow. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio, S = BS.story, $ = G.$, T = 16;
  var ui = BS.ui = {};

  /* ---------------- fog of war on the hill ---------------- */
  var FW = 21, FH = 19;
  function fog() { if (!G.s.fog || G.s.fog.length !== FW * FH) G.s.fog = new Array(FW * FH + 1).join("0"); return G.s.fog; }
  setInterval(function () {
    if (G.mapId !== "hill" || G.mode === "title") return;
    var f = fog().split(""), cx = Math.floor(G.p.x / T / 4), cy = Math.floor(G.p.y / T / 4);
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) { var x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < FW && y < FH && dx * dx + dy * dy <= 5) f[y * FW + x] = "1"; }
    G.s.fog = f.join("");
  }, 400);

  /* ---------------- open / close ---------------- */
  var prevMode = "walk";
  ui.open = function (which, tab) {
    if (G.mode === "book" || G.mode === "menu") ui.closeAll();
    prevMode = G.mode;
    G.mode = which;
    A.sfx(which === "book" ? "page" : "ui");
    var el = $(which === "book" ? "book" : "menu");
    el.classList.add("on");
    el.setAttribute("aria-hidden", "false");
    if (which === "book") showTab(tab || ui.lastTab || "pages");
    if (which === "menu") syncMenu();
    setTimeout(function () { var f = el.querySelector("[data-focus]") || el.querySelector("button"); f && f.focus({ preventScroll: true }); }, 30);
  };
  ui.closeAll = function () {
    ["book", "menu"].forEach(function (id) { $(id).classList.remove("on"); $(id).setAttribute("aria-hidden", "true"); });
    if (G.mode === "book" || G.mode === "menu") { G.mode = prevMode === "book" || prevMode === "menu" ? "walk" : prevMode; A.sfx("back"); }
    $("stage").focus({ preventScroll: true });
  };
  document.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", ui.closeAll); });
  $("hudbook").addEventListener("click", function () { if (G.s.items.book && !G.cut) ui.open("book"); });
  $("hudmenu").addEventListener("click", function () { ui.open("menu"); });
  $("phonehud").addEventListener("click", function () { if (G.mode === "walk" && G.s.items.book) ui.open("book", "phone"); });

  /* ---------------- the book ---------------- */
  document.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); A.sfx("page"); }); });
  function showTab(t) {
    ui.lastTab = t;
    document.querySelectorAll("[data-tab]").forEach(function (b) { var on = b.getAttribute("data-tab") === t; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    document.querySelectorAll(".bpane").forEach(function (p) { p.hidden = p.id !== "p-" + t; });
    ({ pages: pages, story: story, keys: keys, seen: seen, map: map, phone: phone, yours: yours, moments: function () { if (BS.prog) BS.prog.render(); } })[t]();
  }
  function from(b) { return S.ORDER.indexOf(G.s.beat) >= S.ORDER.indexOf(b); }
  function pages() {
    var el = $("p-pages"), html = "";
    var chs = S.CHAPTERS.filter(function (c) { return from(c[2]); });
    var ci = S.chapterIndex(), C = S.CHAPTERS[ci];
    html += '<h3 class="goalh">Chapter ' + C[0] + ' · ' + C[1] + '</h3><ul class="goals">' + S.goals().map(function (g) { return '<li class="' + (g.done ? "done" : "") + '"><i></i>' + G.fmt(g.t) + (g.n && !g.done ? ' <small>' + g.n[0] + " / " + g.n[1] + "</small>" : "") + "</li>"; }).join("") + "</ul>";
    if (G.s.objective) html += '<p class="now"><span>Now</span> ' + G.fmt(G.s.objective) + "</p>";
    html += "<h3>Her pages</h3>";
    html += '<p class="hand first">' + G.fmt(S.PAGES[0].text) + "</p>";
    S.PAGES.slice(1).forEach(function (p) { if (from(p.after)) html += '<p class="hand">' + G.fmt(p.text) + "</p>"; });
    html += '<h3>The week, so far</h3><ol class="chs">' + chs.map(function (c) { return "<li><b>Chapter " + c[0] + "</b> " + c[1] + "</li>"; }).join("") + "</ol>";
    el.innerHTML = html;
  }
  /* the novel's own words, every passage so far, in full */
  function story() {
    var el = $("p-story"), list = G.s.story || [], day = "", html = '<p class="lede">In my own words — the whole of it, as it happened. (On screen I keep it short.)</p>';
    if (!list.length) html += '<p class="lede">Nothing yet.</p>';
    list.forEach(function (q) { if (q.d !== day) { day = q.d; html += "<h3>" + day + "</h3>"; } html += '<p class="prose">' + G.fmt(q.t) + "</p>"; });
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  }
  function keys() {
    var el = $("p-keys"), got = Object.keys(S.ITEMS).filter(function (k) { return G.s.items[k]; });
    var html = '<p class="lede">Every key on this hill is a piece of real science. ' + got.length + " of " + Object.keys(S.ITEMS).length + " found.</p><div class='keys'>";
    Object.keys(S.ITEMS).forEach(function (k) {
      var it = S.ITEMS[k], has = G.s.items[k];
      html += '<details class="key' + (has ? "" : " locked") + '"' + (has ? "" : " disabled") + "><summary><canvas width='48' height='48' data-icon='" + (has ? it.icon : "") + "'></canvas><span><b>" + (has ? it.name : "Not yet") + "</b><small>" + (has ? it.sci : "&nbsp;") + "</small></span></summary>" + (has ? "<p>" + G.fmt(it.text) + "</p><p class='opens'><span>Opens</span> " + G.fmt(it.opens) + "</p>" : "") + "</details>";
    });
    el.innerHTML = html + "</div>";
    el.querySelectorAll("canvas[data-icon]").forEach(function (c) { var ic = c.getAttribute("data-icon"); if (ic && BS.icons[ic]) BS.icons[ic](c.getContext("2d"), 48); });
  }
  function seen() {
    var el = $("p-seen"), L = BS.lens.LOOKS, n = L.filter(function (l) { return G.s.seen[l.id]; }).length;
    var html = '<p class="lede">Through the drop of water. ' + n + " of " + L.length + " small things seen" + (n === L.length ? " — every one." : ".") + (G.s.items.lens ? "" : " (You'll need a lens.)") + "</p><div class='seen'>";
    L.forEach(function (l) {
      var s = G.s.seen[l.id];
      html += '<button class="look' + (s ? "" : " locked") + '" data-look="' + l.id + '"' + (s ? "" : " disabled") + '><canvas width="64" height="64"></canvas><span>' + (s ? l.name : "?") + "</span></button>";
    });
    html += "</div>";
    html += '<h3>Badges</h3><div class="badges">' + S.BADGES.map(function (b) { var got = (G.s.badges || {})[b[1]]; return '<span class="bdg' + (got ? " got" : "") + '"><b>' + (got ? "★" : "☆") + " " + b[1] + "</b><small>" + (got ? b[2] : b[0] + " small things") + "</small></span>"; }).join("") + "</div>";
    el.innerHTML = html + "<div id='seenNote' class='seennote' hidden></div>";
    el.querySelectorAll(".look").forEach(function (b) {
      var l = BS.lens.byId[b.getAttribute("data-look")], c = b.querySelector("canvas");
      if (G.s.seen[l.id]) BS.lens.draw(c.getContext("2d"), 64, l.scene, 2.5, {});
      b.addEventListener("click", function () { var n = $("seenNote"); n.hidden = false; n.innerHTML = "<h4>" + l.name + "</h4><p>" + G.fmt(l.note) + "</p>"; n.scrollIntoView({ block: "nearest", behavior: G.prefs.reduced ? "auto" : "smooth" }); A.sfx("page"); });
    });
  }
  var PLACES = [
    { n: "Gran's house", x: 40, y: 11, when: "arrive" }, { n: "the shed", x: 30, y: 20, when: "shed" }, { n: "the crest", x: 40, y: 26, when: "hill" },
    { n: "the compost heap", x: 49, y: 20, when: "dawn" }, { n: "Beck's", x: 68, y: 13, when: "beck" }, { n: "the woods", x: 46, y: 56, when: "hill" },
    { n: "the beech", x: 30, y: 62, when: "woods" }, { n: "the hollow", x: 17, y: 63, when: "hollow" }, { n: "the pit", x: 70, y: 41, when: "pit" }, { n: "the pond", x: 57, y: 62, when: "pond" }
  ];
  function map() {
    var el = $("p-map");
    el.innerHTML = '<canvas id="mapcv" width="252" height="222" aria-label="A hand-drawn map of the hill"></canvas><p class="lede small">Drawn as I walked it. The parts I haven\'t been are still blank.</p>';
    var c = $("mapcv"), x = c.getContext("2d"), m = G.maps.hill, f = fog(), TL = BS.TL;
    x.fillStyle = "#efe4c8"; x.fillRect(0, 0, 252, 222);
    var col = {};
    col[TL.WOOD] = "#4e6a3e"; col[TL.DEER] = "#8a7a52"; col[TL.ROOT] = "#8a7a52"; col[TL.ROAD] = "#b89a6a"; col[TL.LANE] = "#b89a6a"; col[TL.WATER] = "#6a96a8"; col[TL.SPRING] = "#6a96a8";
    col[TL.HOUSE] = "#8a5a4a"; col[TL.SHED] = "#8a8478"; col[TL.BECKHOUSE] = "#5a6e80"; col[TL.HEDGE] = "#4b6a38"; col[TL.GARDEN] = "#bcd09a"; col[TL.SAND] = "#e2d2a6"; col[TL.PILE] = "#d8c48c"; col[TL.TRAILER] = "#4e7a56"; col[TL.FALLEN] = "#6a4a2a"; col[TL.LITTER] = "#a89a6a"; col[TL.CHAIN] = "#9a9a90"; col[TL.FENCE] = "#9a9282";
    for (var y = 0; y < m.h; y++) for (var X = 0; X < m.w; X++) {
      var fx = Math.floor(X / 4), fy = Math.floor(y / 4);
      if (f[fy * FW + fx] !== "1") continue;
      var t = m.get(X, y), cc = col[t];
      if ((t === TL.DEER && m.hidden.deer) || (t === TL.ROOT && m.hidden.root)) cc = col[TL.WOOD];
      x.fillStyle = cc || "#d8cba0"; x.fillRect(X * 3, y * 3, 3, 3);
    }
    /* soft hand-drawn edge */
    x.strokeStyle = "rgba(90,60,30,.5)"; x.lineWidth = 2; x.strokeRect(1, 1, 250, 220);
    x.font = "italic 10px Georgia, serif"; x.fillStyle = "#3a2a1a"; x.textAlign = "center";
    PLACES.forEach(function (p) { if (!from(p.when)) return; var fx = Math.floor(p.x / 4), fy = Math.floor(p.y / 4); if (f[fy * FW + fx] !== "1") return; x.fillText(p.n, p.x * 3, p.y * 3); });
    if (G.mapId === "hill") { x.fillStyle = "#c33"; x.beginPath(); x.arc(G.p.x / T * 3, G.p.y / T * 3, 3.5, 0, 6.3); x.fill(); x.strokeStyle = "#fff"; x.lineWidth = 1; x.stroke(); }
  }
  function phone() {
    var el = $("p-phone"), b = Math.round(G.s.battery);
    var msgs = [["Priya", "did ANYONE finish the quiz"], ["Theo", "the thing that wasn't funny that you laughed at anyway"]];
    var html = '<div class="phone"><div class="pbar"><span>' + (G.signalBars ? "▂ " : "No Service") + "</span><span>" + b + "%</span></div>";
    if (b <= 0) html += '<p class="dead">A flat black stone.</p>';
    else {
      html += msgs.map(function (m) { return '<p class="msg"><b>' + m[0] + "</b>" + m[1] + "</p>"; }).join("");
      if (G.s.flags.called) html += '<p class="msg gran"><b>Gran</b> 12 min · call</p>';
      html += '<p class="hint">A lens needs charge: crank the lantern (C), or ride the scooter down the hill. ' + (G.s.rides ? "Rides so far: " + G.s.rides + "." : "") + "</p>";
    }
    el.innerHTML = html + "</div>";
  }
  function yours() {
    var el = $("p-yours");
    if (!G.s.items.pen) {
      el.innerHTML = '<p class="lede">The last blank page, after everything she wrote. Not yet.</p>';
      return;
    }
    el.innerHTML = '<p class="hand">' + G.fmt(S.PAGES[S.PAGES.length - 1].text) + '</p><label class="lede" for="marg">Write it down, in your own hand under hers. It stays on this device; nothing is sent anywhere.</label><textarea id="marg" rows="7" maxlength="2000" placeholder="The dark was never empty…"></textarea><div class="row"><button id="margok" class="primary">' + (G.s.flags.wrote ? "Keep it" : "Write it in the book") + "</button></div>";
    $("marg").value = G.s.marginalia || "";
    $("margok").addEventListener("click", function () { var v = $("marg").value.trim(); if (!v && !G.s.flags.wrote) { $("marg").focus(); return; } S.wrote(v); });
  }

  /* ---------------- the menu ---------------- */
  function syncMenu() {
    $("o-text").value = G.prefs.text; $("o-cap").checked = G.prefs.captions; $("o-red").checked = G.prefs.reduced; $("o-hap").checked = G.prefs.haptics;
    $("o-full").checked = !!G.prefs.fullText; $("o-tilt").checked = G.prefs.tilt !== false; $("o-ptr").checked = G.prefs.pointer !== false;
    $("o-vol").value = G.prefs.master; $("o-mus").value = G.prefs.music; $("o-amb").value = G.prefs.amb; $("o-big").checked = G.prefs.big;
    var mins = Math.round(G.s.playMs / 60000);
    $("mstat").textContent = G.s.day + " · " + Object.keys(G.s.items).length + " keys · " + Object.keys(G.s.seen).length + " small things seen · " + mins + " min";
  }
  function bindPref(id, k, num, apply) {
    $(id).addEventListener("input", function (e) { G.prefs[k] = num ? +e.target.value : e.target.checked; apply && apply(); G.savePrefs(); });
  }
  bindPref("o-text", "text", true);
  bindPref("o-cap", "captions", false);
  bindPref("o-red", "reduced", false, applyPrefs);
  bindPref("o-hap", "haptics", false);
  bindPref("o-tilt", "tilt", false);
  bindPref("o-full", "fullText", false);
  bindPref("o-ptr", "pointer", false);
  bindPref("o-big", "big", false, applyPrefs);
  bindPref("o-vol", "master", true, function () { A.setVolume("master", G.prefs.master); });
  bindPref("o-mus", "music", true, function () { A.setVolume("mus", G.prefs.music); });
  bindPref("o-amb", "amb", true, function () { A.setVolume("amb", G.prefs.amb); });
  function applyPrefs() { document.body.classList.toggle("reduced", !!G.prefs.reduced); document.body.classList.toggle("big", !!G.prefs.big); }
  applyPrefs();
  $("m-save").addEventListener("click", function () { G.save(); ui.closeAll(); });
  $("m-help").addEventListener("click", function () { $("help").hidden = !$("help").hidden; });
  $("m-restart").addEventListener("click", function () {
    if (!confirm("Start again from Monday noon? Your saved game on this device will be replaced.")) return;
    G.wipe(); location.reload();
  });

  /* ---------------- the portrait in the dialogue box ---------------- */
  var pT = 0, pcv = $("portrait"), px = pcv.getContext("2d");
  ui.portraitTick = function (dt) {
    if (!$("dlg").classList.contains("on") || !G.portrait) return;
    pT += dt;
    var blink = (pT % 3.6) < 0.12, img = BS.portrait(G.portrait, blink, { talk: G.talking && Math.sin(pT * 15) > 0, mood: G.lineMood || "" });
    if (!img) return;
    var bob = G.talking && !G.prefs.reduced ? Math.abs(Math.sin(pT * 11)) * 3 : Math.sin(pT * 1.6) * 1.2;
    px.clearRect(0, 0, 144, 144);
    px.drawImage(img, 4, 10 - bob, 136, 136);
  };

  /* ---------------- the title ---------------- */
  var saved = G.load();
  $("t-continue").hidden = !saved;
  if (saved) { if (BS.prog && BS.prog.titleCard) BS.prog.titleCard(saved); else $("t-continue").querySelector("small").textContent = saved.day + " · " + (saved.objective || "").slice(0, 60); }
  function begin(load, afterHow, opening) {
    if (!load && !afterHow && !G.prefs.seenHow) { A.init(); showHow(function () { G.prefs.seenHow = true; G.savePrefs(); begin(false, true); }); return; }
    /* a new game opens with the drive up the hill */
    if (!load && !opening && BS.cine && BS.cine.play) {
      A.init();
      A.setVolume("master", G.prefs.master); A.setVolume("mus", G.prefs.music); A.setVolume("amb", G.prefs.amb);
      $("title").classList.add("off");
      setTimeout(function () { $("title").hidden = true; }, 900);
      BS.cine.play(function (seen) { begin(false, true, seen || {}); });
      return;
    }
    A.init();
    G.camFocus = null; G.hidePlayer = false; G.titleRun = false; G.snapCam && G.snapCam();
    A.setVolume("master", G.prefs.master); A.setVolume("mus", G.prefs.music); A.setVolume("amb", G.prefs.amb);
    $("title").classList.add("off");
    setTimeout(function () { $("title").hidden = true; }, 900);
    document.body.classList.add("playing");
    S.init();
    if (BS.juice) BS.juice.reset();
    if (load && saved) {
      G.s = saved; for (var k in G.fresh()) if (G.s[k] == null) G.s[k] = G.fresh()[k];
      G.mode = "walk";
      G.go(saved.map, saved.x / T, saved.y / T, saved.dir, { instant: true });
      S.resume();
      G.flash(saved.day);
    } else {
      G.s = G.fresh();
      G.mode = "walk";
      G.go("house", 3.5, 2.6, 0, { instant: true });
      S.stage();
      S.newGame(opening);
    }
    $("stage").focus({ preventScroll: true });
  }
  $("t-new").addEventListener("click", function () {
    if (saved && !confirm("Begin again from Monday noon? This replaces your saved game.")) return;
    begin(false);
  });
  $("t-continue").addEventListener("click", function () { begin(true); });
  $("t-sound").addEventListener("click", function () { A.init(); A.theme(); });
  $("t-how").addEventListener("click", function () { A.init(); showHow(function () { }); });

  /* ---------------- how to play: three cards ---------------- */
  function showHow(done) {
    var h = $("howto"), slides = h.querySelectorAll(".hs"), dots = h.querySelectorAll(".hdots i"), i = 0;
    h.hidden = false; requestAnimationFrame(function () { h.classList.add("on"); });
    drawHowArt();
    function show(k) { i = k; slides.forEach(function (s, j) { s.classList.toggle("on", j === i); }); dots.forEach(function (d, j) { d.classList.toggle("on", j === i); }); $("h-next").textContent = i === slides.length - 1 ? "Let's go" : "Next"; A.sfx("page"); }
    function close() { h.classList.remove("on"); setTimeout(function () { h.hidden = true; }, 400); document.removeEventListener("keydown", key); done(); }
    function key(e) { if (e.code === "Enter" || e.code === "Space" || e.code === "KeyE" || e.code === "ArrowRight") { e.preventDefault(); next(); } if (e.code === "Escape") close(); }
    function next() { if (i < slides.length - 1) show(i + 1); else close(); }
    $("h-next").onclick = next; $("h-skip").onclick = close;
    document.addEventListener("keydown", key);
    show(0);
    setTimeout(function () { $("h-next").focus({ preventScroll: true }); }, 50);
  }
  function drawHowArt() {
    document.querySelectorAll(".hart").forEach(function (c) {
      var x = c.getContext("2d"), k = c.getAttribute("data-art"), W = c.width, H = c.height;
      x.clearRect(0, 0, W, H);
      var g = x.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.6); g.addColorStop(0, "rgba(255,210,120,.18)"); g.addColorStop(1, "rgba(255,210,120,0)"); x.fillStyle = g; x.fillRect(0, 0, W, H);
      if (k === "move") {
        var sp = BS.sprite("wren", 0, 0); x.drawImage(sp, W / 2 - 24, 18, 48, 72);
        x.fillStyle = "rgba(255,226,170,.85)"; x.font = "bold 18px system-ui"; x.textAlign = "center";
        x.fillText("◀", W / 2 - 52, 62); x.fillText("▶", W / 2 + 52, 62); x.fillText("▲", W / 2, 16); x.fillText("▼", W / 2, 112);
        x.font = "bold 13px system-ui"; x.fillStyle = "#ffd166"; x.fillText("✦", W / 2 + 74, 30);
      }
      if (k === "keys") { BS.icons.lantern(x, 96); x.save(); x.translate(72, 12); BS.icons.lens(x, 96); x.restore(); x.save(); x.translate(144, 12); BS.icons.tun(x, 96); x.restore(); }
      if (k === "goal") {
        x.save(); x.translate(W / 2 - 60, 10); x.scale(0.5, 0.5); x.restore();
        x.fillStyle = "#e8e2d2"; x.fillRect(70, 40, 100, 52); x.fillStyle = "#7a3a2c"; x.beginPath(); x.moveTo(62, 42); x.lineTo(120, 12); x.lineTo(178, 42); x.fill();
        x.fillStyle = "#2a3a48"; x.fillRect(86, 54, 18, 18); x.fillRect(136, 54, 18, 18); x.fillStyle = "#3e5a46"; x.fillRect(112, 62, 16, 30);
        x.fillStyle = "rgba(255,200,80,.9)"; for (var q = 0; q < 14; q++) { x.fillRect(80 + q * 6, 100 + Math.sin(q) * 3, 3, 1.5); }
        x.font = "bold 12px system-ui"; x.fillStyle = "#ffb08a"; x.fillText("FRI · THU · MON", 120, 116); x.textAlign = "center";
      }
    });
  }

  /* ---------------- the hill behind the title ---------------- */
  function titleBackdrop() {
    G.mapId = "hill"; G.map = G.maps.hill; G.s.tod = "golden"; G.sky.snap = true; G.hidePlayer = true; G.titleRun = true;
    var t0 = performance.now(), pts = [[40, 13], [46, 22], [41, 31], [36, 42], [44, 33], [52, 20], [40, 13]];
    (function pan(now) {
      if (!G.titleRun) return;
      var t = Math.max(0, now - t0) / 1000 / 14, seg = Math.floor(t) % (pts.length - 1), u = t - Math.floor(t), e = u * u * (3 - 2 * u);
      var a = pts[seg], b = pts[seg + 1];
      G.camFocus = { x: (a[0] + (b[0] - a[0]) * e) * T, y: (a[1] + (b[1] - a[1]) * e) * T };
      requestAnimationFrame(pan);
    })(t0);
  }
  titleBackdrop();
  /* a living title: dust in a slat of light, a glow down the cellar steps */
  (function titleArt() {
    var c = $("titlecv"); if (!c || c.hidden) return;
    var x = c.getContext("2d"), t0 = performance.now();
    function draw(now) {
      if ($("title").hidden) return;
      var t = (now - t0) / 1000, W = c.width = c.clientWidth, H = c.height = c.clientHeight;
      var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0b0a10"); g.addColorStop(1, "#06080a"); x.fillStyle = g; x.fillRect(0, 0, W, H);
      /* the beams, and the foxfire along them */
      for (var b = 0; b < 3; b++) {
        var by = H * (0.18 + b * 0.22);
        x.fillStyle = "rgba(40,30,20,.6)"; x.fillRect(0, by - 10, W, 20);
        for (var k = 0; k < 14; k++) {
          var sx = (k * 137 + b * 51) % W, a = 0.25 + 0.2 * Math.sin(t * 0.7 + k + b);
          x.strokeStyle = "rgba(170,240,130," + a + ")"; x.lineWidth = 1; x.beginPath(); x.moveTo(sx, by);
          for (var s = 1; s < 9; s++) x.lineTo(sx + s * 9 + Math.sin(k * 3 + s) * 6, by + Math.sin(k + s * 1.7) * 6);
          x.stroke();
        }
      }
      /* the gold, low and right, pulsing like one slow heart */
      var p = 0.6 + 0.4 * Math.sin(t * 0.9);
      for (var i = 0; i < 26; i++) {
        var a0 = i / 26 * 6.283, r0 = 30 + (i * 37 % 80);
        x.strokeStyle = "rgba(255,200,80," + (0.25 * p) + ")"; x.lineWidth = 2; x.beginPath(); x.moveTo(W * 0.72, H * 0.78);
        x.quadraticCurveTo(W * 0.72 + Math.cos(a0 + 0.5) * r0, H * 0.78 + Math.sin(a0 + 0.5) * r0 * 0.4, W * 0.72 + Math.cos(a0) * r0 * 2, H * 0.78 + Math.sin(a0) * r0 * 0.6); x.stroke();
      }
      var gg = x.createRadialGradient(W * 0.72, H * 0.78, 2, W * 0.72, H * 0.78, 140); gg.addColorStop(0, "rgba(255,210,110," + 0.3 * p + ")"); gg.addColorStop(1, "rgba(255,210,110,0)"); x.fillStyle = gg; x.fillRect(0, 0, W, H);
      /* jars catching it, rank on rank */
      for (var j = 0; j < 22; j++) { x.fillStyle = "rgba(170,240,140," + (0.12 + 0.08 * Math.sin(t + j)) + ")"; x.fillRect(20 + j * (W - 40) / 22, H * 0.52, 1, 12); x.fillRect(30 + j * (W - 40) / 22, H * 0.7, 1, 12); }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  })();

  /* ---------------- the end ---------------- */
  ui.ending = function () {
    return new Promise(function (res) {
      var e = $("end");
      e.hidden = false; requestAnimationFrame(function () { e.classList.add("on"); });
      A.music("none"); A.ambience("silence");
      setTimeout(function () { A.theme(); }, 1200);
      $("endseen").textContent = Object.keys(G.s.seen).length + " of " + BS.lens.LOOKS.length + " small things seen through the drop · " + Object.keys(G.s.items).length + " keys · " + Math.round(G.s.playMs / 60000) + " minutes";
      if (G.s.marginalia) { $("endyours").hidden = false; $("endyours").querySelector("p").textContent = G.s.marginalia; }
      $("endok").onclick = function () { e.classList.remove("on"); setTimeout(function () { e.hidden = true; }, 900); G.setAmbience(); res(); };
      setTimeout(function () { $("endok").focus({ preventScroll: true }); }, 4000);
    });
  };

  /* keyboard in the book: Esc / B close */
  document.addEventListener("keydown", function (e) {
    if ((G.mode === "book" || G.mode === "menu") && (e.code === "Escape")) { e.preventDefault(); ui.closeAll(); }
    if (!$("end").hidden && (e.code === "Enter" || e.code === "Space") && document.activeElement !== $("endok")) { }
  });
  /* pause when hidden */
  document.addEventListener("visibilitychange", function () { A.suspend(document.hidden); if (document.hidden && G.mode !== "title") G.save(); });
  window.addEventListener("pagehide", function () { if (G.mode !== "title") G.save(); });

  /* service worker: offline, installable */
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () { });

  /* ---------------- the goal card, the book pinging, finds flying home ---------------- */
  setInterval(function () {
    /* the transient line goes in whichever half of the screen you aren't in */
    if (G.cam && G.view && G.p) { var v = G.view(), sy = (G.p.y - 12 - G.cam.y) / v.h; document.body.classList.toggle("lanelow", sy < 0.5); }
    var gc = $("goalcard");
    if (G.mode === "title" || !document.body.classList.contains("playing")) { gc.hidden = true; return; }
    var gs = S.goals(), C = S.CHAPTERS[S.chapterIndex()], next = gs.filter(function (g) { return !g.done; })[0];
    if (!gs.length || S.ORDER.indexOf(G.s.beat) >= S.ORDER.indexOf("after")) { gc.hidden = true; return; }
    gc.hidden = false;
    $("gch").textContent = "Ch. " + C[0] + " · " + C[1];
    $("gpips").innerHTML = gs.map(function (g) { return "<i" + (g.done ? ' class="d"' : "") + "></i>"; }).join("");
    var label = next ? next.t + (next.n ? " (" + next.n[0] + "/" + next.n[1] + ")" : "") : "Chapter complete";
    if ($("gstep").textContent !== label) { $("gstep").textContent = label; gc.classList.remove("tick"); void gc.offsetWidth; gc.classList.add("tick"); }
  }, 400);
  /* the goal card: tap it and the gold thread shows you the way (or, if there's nowhere to go, opens the book) */
  $("goalcard").addEventListener("click", function () { if (G.cut) return; if (!(BS.guide && BS.guide.summon("ask"))) ui.open("book", "pages"); });
  ui.bookPing = function () { var b = $("hudbook"); b.classList.remove("ping"); void b.offsetWidth; b.classList.add("ping"); };
  ui.flyToBook = function () {
    var f = document.createElement("div"); f.className = "fly"; document.body.appendChild(f);
    var r = $("hudbook").getBoundingClientRect();
    f.style.left = (window.innerWidth / 2 - 22) + "px"; f.style.top = (window.innerHeight / 2 - 22) + "px";
    requestAnimationFrame(function () { requestAnimationFrame(function () { f.style.transform = "translate(" + (r.left + r.width / 2 - window.innerWidth / 2) + "px," + (r.top + r.height / 2 - window.innerHeight / 2) + "px) scale(.3)"; f.style.opacity = ".2"; }); });
    setTimeout(function () {
      f.remove(); ui.bookPing(); A.sfx("seen");
      var n = Object.keys(G.s.seen).length;
      G.toast("Seen through the drop: " + n + " of " + BS.lens.LOOKS.length, 2400);
      G.s.badges = G.s.badges || {};
      S.BADGES.forEach(function (b) { if (n >= b[0] && !G.s.badges[b[1]]) { G.s.badges[b[1]] = 1; } });   /* the celebration itself is a Moment now */
      if (BS.prog) setTimeout(BS.prog.check, 700);
    }, G.prefs.reduced ? 50 : 800);
  };
  function badge(b) {
    var d = document.createElement("div"); d.className = "badgepop"; d.innerHTML = "<i>★</i><b>" + b[1] + "</b><small>" + b[2] + "</small>"; document.body.appendChild(d);
    A.sfx("badge"); if (G.burst) G.burst(G.p.x, G.p.y - 16, 26);
    setTimeout(function () { d.classList.add("out"); setTimeout(function () { d.remove(); }, 600); }, 3200);
  }

  /* debug: ?beat=pit jumps (for testing only) */
  var q = new URLSearchParams(location.search);
  if (q.get("beat")) {
    window.addEventListener("load", function () {
      setTimeout(function () { ui.debugBeat(q.get("beat")); }, 200);
    });
  }
  ui.debugBeat = function (b) {
    A.init(); $("title").hidden = true; document.body.classList.add("playing"); G.titleRun = false; G.camFocus = null; G.hidePlayer = false;
    S.init(); G.s = G.fresh(); G.mode = "walk";
    var order = S.ORDER, idx = order.indexOf(b);
    var give = { eyes: "cellar1", book: "cellar1", lantern: "shed", scooter: "build", lens: "lens", oats: "dawn", beck: "woods", roots: "woods", log: "hollow", still: "pit", proof: "pond", crumb: "pump", looklong: "revive", onebar: "evening" };
    for (var k in give) if (order.indexOf(give[k]) < idx) G.s.items[k] = 1;
    order.slice(0, idx + 1).forEach(function (k) { G.s.flags["b_" + k] = 1; });
    G.s.beat = b; G.s.battery = 40; G.s.flags.dadSentCellar = 1; G.s.flags.shedOpen = 1; G.s.flags.cable = 1; G.s.flags.threads = idx >= order.indexOf("dawn") ? 1 : 0;
    var spawn = { arrive: ["house", 3.5, 2.6, "noon", "Monday"], cellar1: ["cellar", 3, 2.7, "noon", "Monday"], shed: ["hill", 31, 23, "afternoon", "Monday"], build: ["shed", 5, 6, "afternoon", "Monday"], hill: ["hill", 40, 27.5, "evening", "Monday"], lens: ["cellar", 18.5, 11.5, "night", "Monday"], dawn: ["hill", 47.4, 22.2, "dawn", "Tuesday"], woods: ["hill", 40, 50, "afternoon", "Tuesday"], pit: ["hill", 49.6, 17.6, "morning", "Wednesday"], apology: ["hill", 46.5, 17.2, "dusk", "Wednesday"], pond: ["hill", 66, 19, "night", "Wednesday"], pump: ["cellar", 18.6, 11.4, "dawn", "Thursday"], revive: ["hill", 39.5, 26, "morning", "Thursday"], evening: ["house", 13.5, 4.6, "golden", "Thursday"], friday: ["hill", 47.5, 18.2, "morning", "Friday"], after: ["hill", 47.5, 18.2, "morning", "Friday"] }[b] || ["hill", 40, 20, "noon", "Monday"];
    G.s.tod = spawn[3]; G.s.day = spawn[4];
    if (idx >= order.indexOf("pit")) { G.s.flags.knowClose = 1; G.s.flags.knowPour = 1; }
    if (idx > order.indexOf("pit")) G.s.flags.knowDewater = 1;
    if (idx >= order.indexOf("woods")) G.s.flags.woodsIn = 1;
    if (idx > order.indexOf("woods")) G.s.flags.rootsShown = 1;
    G.go(spawn[0], spawn[1], spawn[2], 0, { instant: true });
    S.resume();
    if (b === "revive") { var be = G.ent("beck"); if (be) { be.x = G.p.x + 12; be.y = G.p.y; } }
  };
})();
