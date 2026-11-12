/* progress.js — moments, progress, saving, and the small celebrations.

   · Moments: the things worth remembering you did, story and otherwise.
     Locked ones show only a hint. Each unlocks with a banner that drops in,
     a gold medallion that spins up, and a few bars that quote Gran's theme,
     so every achievement sounds like part of the same song.
   · Progress: one honest number, a blend of the story, the keys, the small
     things seen and the moments found.
   · Saving: a little sun turns in the corner whenever the game saves, and a
     snapshot of where you were goes on the Continue card.
   · Small wins: a finished goal is struck through and ticked as the next
     one arrives.
   · The music grows as you go: early on a lone piano in another room;
     further in, a warm pad underneath it and a second voice answering;
     near the end, now and then, the first bars of Gran's theme. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio, S = BS.story, $ = function (id) { return document.getElementById(id); };
  var P = BS.prog = {};
  function F(k) { return G.s && G.s.flags && G.s.flags[k]; }
  function has(k) { return G.s && G.s.items && G.s.items[k]; }
  function seen() { return G.s && G.s.seen ? Object.keys(G.s.seen).length : 0; }
  function cnt(k) { return (G.s && G.s.counts && G.s.counts[k]) || 0; }
  function past(b) { return S && S.ORDER.indexOf(G.s.beat) >= S.ORDER.indexOf(b); }

  /* id, name, what it means (shown once earned), a hint (shown while locked), a glyph, the test */
  var ACH = [
    ["eyes", "Let It Give Things Back", "Stood in the black cellar until the dark gave up its light.", "Something in the cellar, if you wait.", "◐", function () { return has("eyes"); }],
    ["lantern", "Never Let the Dark Win", "Gran's crank lantern, found in the shed.", "Her shed holds a light.", "✦", function () { return has("lantern"); }],
    ["dynamo", "Borrowed Sunlight", "Charged a dead phone by riding down a hill.", "A scooter, a lantern, a hill.", "☀", function () { return past("lens"); }],
    ["drop", "Through a Drop of Water", "The first small thing, seen properly.", "A drop of water bends the world.", "◉", function () { return seen() >= 1; }],
    ["close", "Close Looker", "Three small things, seen properly.", "Look closer, three times.", "❦", function () { return seen() >= 3; }],
    ["field", "Field Naturalist", "Eight small things in the book.", "Eight small things.", "❧", function () { return seen() >= 8; }],
    ["patient", "Patient Eye", "Fifteen. The hill is full of countries.", "Fifteen small things.", "✿", function () { return seen() >= 15; }],
    ["every", "Everything Small", "Every small thing on the hill.", "All of them.", "❁", function () { return S && BS.lens && seen() >= BS.lens.LOOKS.length; }],
    ["herbs", "Green Fingers", "Watered Gran's herbs without being asked.", "Something on the porch is thirsty.", "❀", function () { return F("herbsWatered"); }],
    ["birds", "Friend of Sparrows", "Filled her feeder. They came at once.", "Her feeder is empty.", "❦", function () { return F("fedBirds"); }],
    ["swing", "Porch Sitter", "Sat on her swing a while.", "Somewhere to sit.", "♪", function () { return F("swungOnce"); }],
    ["glass", "Summers in Glass", "The plum jam and the peaches, both.", "Two jars worth a look.", "◍", function () { return F("jamSeen") && F("peachSeen"); }],
    ["still", "Still as a Stone", "Stood so still a butterfly took you for part of the hill.", "Be very, very still.", "❋", function () { return cnt("butterfly") >= 1; }],
    ["trees", "Shake the Hill", "Shook five different trees.", "Trees are for shaking.", "♣", function () { return cnt("trees") >= 5; }],
    ["hops", "Popcorn Field", "Sent twenty-five grasshoppers flying.", "Wade into the long grass.", "⁂", function () { return cnt("hops") >= 25; }],
    ["regions", "The Whole Hill", "Walked every part of it.", "Go everywhere.", "⌘", function () { return G.s.regions && BS.juice && Object.keys(G.s.regions).length >= BS.juice.REGN; }],
    ["moon", "Moon in the Water", "Stood by the pond at night and saw the sky in it.", "The pond, after dark.", "☾", function () { return cnt("moonpond") >= 1; }],
    ["habit", "Old Habits", "Checked for a signal five times. Nothing. Nothing. Nothing.", "Hold the phone up.", "▮", function () { return cnt("phonecheck") >= 5; }],
    ["wish", "Five Wishes", "Blew five dandelion clocks and let the wind have them.", "Some flowers are clocks.", "❉", function () { return cnt("wishes") >= 5; }],
    ["plop", "Kerplunk", "Rolled something round all the way into the pond.", "The pond likes round things.", "◦", function () { return cnt("plops") >= 1; }],
    ["skip", "Five Skips", "Skipped a stone five times across the pond.", "A flat stone, a still pond.", "≋", function () { return cnt("skipbest") >= 5; }],
    ["firefly", "Light in Your Hands", "Held a firefly for a moment, and let it go.", "After dark, stand still in the field.", "✧", function () { return cnt("fireflies") >= 1; }],
    ["keys", "Every Key on the Hill", "Every key, every door.", "All the keys.", "⚿", function () { return S && Object.keys(S.ITEMS).every(function (k) { return has(k); }); }],
    ["next", "The Next Hand", "Wrote in her book.", "The last blank page.", "✎", function () { return F("wrote"); }]
  ];
  P.ACH = ACH;
  G.count = function (k, n) { G.s.counts = G.s.counts || {}; G.s.counts[k] = (G.s.counts[k] || 0) + (n == null ? 1 : n); };
  G.countOnce = function (k, id) { G.s.counts = G.s.counts || {}; var key = k + ":" + id; if (G.s.counts[key]) return; G.s.counts[key] = 1; G.count(k); };

  /* ---------------- unlocking, with ceremony ---------------- */
  var queue = [], showing = false;
  var lastS = null;
  function check() {
    if (!G.s || G.mode === "title") return;
    if (G.s !== lastS) {
      lastS = G.s;
      /* a save from before Moments existed: credit what was already done, quietly */
      if (!G.s.ach) { G.s.ach = {}; ACH.forEach(function (a) { var ok = false; try { ok = a[5](); } catch (e) { } if (ok) G.s.ach[a[0]] = Date.now(); }); }
      lastObj = G.s.objective; lastPct = P.percent();
    }
    G.s.ach = G.s.ach || {};
    ACH.forEach(function (a) { var ok = false; try { ok = a[5](); } catch (e) { } if (ok && !G.s.ach[a[0]]) { G.s.ach[a[0]] = Date.now(); queue.push(a); } });
    if (queue.length && !showing && !G.cut && G.mode === "walk" && !G.talking) show(queue.shift());
  }
  P.check = check;
  function show(a) {
    showing = true;
    var d = document.createElement("div"); d.className = "achpop";
    var got = Object.keys(G.s.ach).length;
    d.innerHTML = '<div class="achmed"><span>' + a[4] + '</span></div><div class="achtx"><small>Moment · ' + got + " of " + ACH.length + "</small><b>" + a[1] + "</b><p>" + a[2] + "</p></div>";
    document.body.appendChild(d);
    requestAnimationFrame(function () { d.classList.add("on"); });
    if (A) A.sfx("ach");
    if (G.prefs.haptics && navigator.vibrate) navigator.vibrate([12, 60, 18]);
    setTimeout(function () { if (G.burst && G.p) G.burst(G.p.x, G.p.y - 30, 22, "255,214,120", 16); }, 300);
    pctPop();
    setTimeout(function () { d.classList.add("out"); setTimeout(function () { d.remove(); showing = false; G.save && G.save(true); }, 700); }, 3600);
  }

  /* ---------------- progress: one honest number ---------------- */
  P.percent = function (s) {
    s = s || G.s; if (!s || !S) return 0;
    var story = Math.max(0, S.ORDER.indexOf(s.beat)) / (S.ORDER.length - 1);
    var keys = Object.keys(S.ITEMS).filter(function (k) { return s.items && s.items[k]; }).length / Object.keys(S.ITEMS).length;
    var looks = BS.lens ? Math.min(1, (s.seen ? Object.keys(s.seen).length : 0) / BS.lens.LOOKS.length) : 0;
    var ach = s.ach ? Object.keys(s.ach).length / ACH.length : 0;
    return Math.round((story * 0.45 + keys * 0.25 + looks * 0.15 + ach * 0.15) * 100);
  };
  var lastPct = null;
  function pctPop() {
    var p = P.percent(); if (lastPct == null) { lastPct = p; return; }
    if (p > lastPct) {
      var b = $("hudbook"); if (b) { var f = document.createElement("span"); f.className = "pctpop"; f.textContent = "+" + (p - lastPct) + "%"; b.appendChild(f); setTimeout(function () { f.remove(); }, 1600); }
      lastPct = p;
      if (A && A.progress) A.progress(p / 100);
    }
  }

  /* ---------------- small wins: the goal you just did, ticked ---------------- */
  var lastObj = null;
  function objTick() {
    var o = G.s && G.s.objective;
    if (lastObj && o && o !== lastObj && G.mode !== "title") {
      var el = document.createElement("div"); el.className = "objdone"; el.innerHTML = '<i>✓</i><span>' + G.fmt(lastObj) + "</span>";
      document.body.appendChild(el); requestAnimationFrame(function () { el.classList.add("on"); });
      setTimeout(function () { el.classList.add("out"); setTimeout(function () { el.remove(); }, 700); }, 1500);
      if (A) A.sfx("tick");
      pctPop();
    }
    lastObj = o;
  }

  /* ---------------- saving: a turning sun, and a snapshot ---------------- */
  var save0 = G.save, lastShot = 0;
  G.save = function (quiet) {
    save0();
    var s = $("savesun"); if (s) { s.classList.remove("on"); void s.offsetWidth; s.classList.add("on"); }
    var now = Date.now();
    if (now - lastShot > 8000 && G.mode !== "title") {
      lastShot = now;
      try {
        var src = $("stage"), c = document.createElement("canvas"); c.width = 240; c.height = 135;
        c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
        localStorage.setItem("borrowed-sunlight-thumb", c.toDataURL("image/jpeg", 0.62));
      } catch (e) { }
    }
  };
  /* the continue card: where you were, what day, how far */
  P.titleCard = function (saved) {
    var btn = $("t-continue"); if (!btn || !saved) return;
    var th = null; try { th = localStorage.getItem("borrowed-sunlight-thumb"); } catch (e) { }
    var ci = S ? (function () { var b0 = G.s; G.s = saved; var i = S.chapterIndex(); G.s = b0; return i; })() : 0, C = S ? S.CHAPTERS[ci] : null;
    var mins = Math.round((saved.playMs || 0) / 60000);
    btn.classList.add("contcard");
    btn.innerHTML = (th ? '<img src="' + th + '" alt="">' : "") + '<span class="cc"><b>Continue</b><small>' + saved.day + (C ? " · Ch. " + C[0] + " · " + C[1] : "") + "</small><small>" + P.percent(saved) + "% · " + (mins < 60 ? mins + " min" : Math.floor(mins / 60) + " h " + (mins % 60) + " min") + " · " + Object.keys(saved.ach || {}).length + " of " + ACH.length + " moments</small></span>";
  };

  /* ---------------- the book: Moments ---------------- */
  P.render = function () {
    var el = $("p-moments"); if (!el) return;
    var got = G.s.ach || {}, n = Object.keys(got).length, pct = P.percent();
    var html = '<div class="pring"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="bg"/><circle cx="22" cy="22" r="19" class="fg" style="stroke-dasharray:' + (pct * 1.194).toFixed(1) + ' 120"/></svg><b>' + pct + '%</b><span>of the hill</span></div>';
    html += "<h3>Moments · " + n + " of " + ACH.length + "</h3><div class=\"achgrid\">";
    ACH.forEach(function (a) {
      var g = got[a[0]];
      html += '<div class="achc' + (g ? " got" : "") + '"><i>' + (g ? a[4] : "?") + "</i><b>" + (g ? a[1] : "· · ·") + "</b><small>" + (g ? a[2] : a[3]) + "</small></div>";
    });
    el.innerHTML = html + "</div>";
  };

  /* ---------------- the clock ---------------- */
  setInterval(function () {
    if (!G.s || G.mode === "title") return;
    /* a few things are measured, not flagged */
    if (G.mapId === "hill" && (G.s.tod === "night" || G.s.tod === "dusk") && G.maps && G.inRect && G.inRect(G.p.x / 16, G.p.y / 16, G.maps.hill.pond, 2)) { if (!cnt("moonpond")) G.count("moonpond"); }
    objTick();
    check();
    if (A && A.progress) A.progress(P.percent() / 100);
  }, 500);
})();
