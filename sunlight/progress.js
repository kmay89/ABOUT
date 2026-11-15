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

  /* id, name, what it means (shown once earned), a hint (shown while locked), the test */
  var ACH = [
    ["eyes", "Let It Give Things Back", "Stood in the black cellar until the dark gave up its light.", "Something in the cellar, if you wait.", function () { return has("eyes"); }],
    ["lantern", "Never Let the Dark Win", "Gran's crank lantern, found in the shed.", "Her shed holds a light.", function () { return has("lantern"); }],
    ["dynamo", "Borrowed Sunlight", "Charged a dead phone by riding down a hill.", "A scooter, a lantern, a hill.", function () { return past("lens"); }],
    ["drop", "Through a Drop of Water", "The first small thing, seen properly.", "A drop of water bends the world.", function () { return seen() >= 1; }],
    ["close", "Close Looker", "Three small things, seen properly.", "Look closer, three times.", function () { return seen() >= 3; }],
    ["field", "Field Naturalist", "Eight small things in the book.", "Eight small things.", function () { return seen() >= 8; }],
    ["patient", "Patient Eye", "Fifteen. The hill is full of countries.", "Fifteen small things.", function () { return seen() >= 15; }],
    ["every", "Everything Small", "Every small thing on the hill.", "All of them.", function () { return S && BS.lens && seen() >= BS.lens.LOOKS.length; }],
    ["herbs", "Green Fingers", "Watered Gran's herbs without being asked.", "Something on the porch is thirsty.", function () { return F("herbsWatered"); }],
    ["birds", "Friend of Sparrows", "Filled her feeder. They came at once.", "Her feeder is empty.", function () { return F("fedBirds"); }],
    ["swing", "Porch Sitter", "Sat on her swing a while.", "Somewhere to sit.", function () { return F("swungOnce"); }],
    ["glass", "Summers in Glass", "The plum jam and the peaches, both.", "Two jars worth a look.", function () { return F("jamSeen") && F("peachSeen"); }],
    ["still", "Still as a Stone", "Stood so still a butterfly took you for part of the hill.", "Be very, very still.", function () { return cnt("butterfly") >= 1; }],
    ["trees", "Shake the Hill", "Shook five different trees.", "Trees are for shaking.", function () { return cnt("trees") >= 5; }],
    ["hops", "Popcorn Field", "Sent twenty-five grasshoppers flying.", "Wade into the long grass.", function () { return cnt("hops") >= 25; }],
    ["regions", "The Whole Hill", "Walked every part of it.", "Go everywhere.", function () { return G.s.regions && BS.juice && Object.keys(G.s.regions).length >= BS.juice.REGN; }],
    ["moon", "Moon in the Water", "Stood by the pond at night and saw the sky in it.", "The pond, after dark.", function () { return cnt("moonpond") >= 1; }],
    ["habit", "Old Habits", "Checked for a signal five times. Nothing. Nothing. Nothing.", "Hold the phone up.", function () { return cnt("phonecheck") >= 5; }],
    ["wish", "Five Wishes", "Blew five dandelion clocks and let the wind have them.", "Some flowers are clocks.", function () { return cnt("wishes") >= 5; }],
    ["plop", "Kerplunk", "Rolled something round all the way into the pond.", "The pond likes round things.", function () { return cnt("plops") >= 1; }],
    ["skip", "Five Skips", "Skipped a stone five times across the pond.", "A flat stone, a still pond.", function () { return cnt("skipbest") >= 5; }],
    ["firefly", "Light in Your Hands", "Held a firefly for a moment, and let it go.", "After dark, stand still in the field.", function () { return cnt("fireflies") >= 1; }],
    ["keys", "Every Key on the Hill", "Every key, every door.", "All the keys.", function () { return S && Object.keys(S.ITEMS).every(function (k) { return has(k); }); }],
    ["next", "The Next Hand", "Wrote in her book.", "The last blank page.", function () { return F("wrote"); }]
  ];
  P.ACH = ACH;
  /* what's struck on each medallion. Drawn here, in one hand, rather than
     typed as symbols: a symbol is whatever the device's fonts make of it,
     and on some phones that was an empty box. */
  var MEDAL = {
    eyes: "<path d='M2.8 12c2.6-3.9 5.7-5.8 9.2-5.8s6.6 1.9 9.2 5.8c-2.6 3.9-5.7 5.8-9.2 5.8S5.4 15.9 2.8 12z'/><circle cx='12' cy='12' r='2.7'/><path d='M12 3.2v1.5M6.3 4.9l.8 1.3M17.7 4.9l-.8 1.3'/>",
    lantern: "<rect x='6.5' y='8.5' width='10' height='11' rx='1.6'/><path d='M9 8.5V6.3h5v2.2'/><circle cx='11.5' cy='14' r='2.8'/><path d='M16.5 14h2.2v-2.3'/><circle cx='18.7' cy='10.8' r='1.1' fill='currentColor' stroke='none'/><path d='M3.3 11.3l1.5.8M2.8 14h1.7M3.3 16.7l1.5-.8'/>",
    dynamo: "<circle cx='12' cy='12' r='3.8'/><path d='M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.85 1.85M16.65 16.65l1.85 1.85M18.5 5.5l-1.85 1.85M7.35 16.65 5.5 18.5'/>",
    drop: "<path d='M12 3c3.5 4.1 5.6 7 5.6 9.7a5.6 5.6 0 0 1-11.2 0C6.4 10 8.5 7.1 12 3z'/><path d='M9.3 13.4a2.9 2.9 0 0 0 1.9 2.5'/>",
    close: "<circle cx='10.5' cy='10.5' r='6'/><path d='M15 15l5.5 5.5'/><path d='M8.2 9.7a2.6 2.6 0 0 1 2-1.9'/>",
    field: "<path d='M12 3.5C7.2 7.8 7.2 15.3 12 20.5c4.8-5.2 4.8-12.7 0-17z'/><path d='M12 7v13.5M12 11.5l-2.6-2M12 11.5l2.6-2M12 15.5l-2.8-2.2M12 15.5l2.8-2.2'/>",
    patient: "<circle cx='12' cy='12' r='2.3'/><path d='M12 9.7c-1.8-1.7-1.8-4.4 0-6 1.8 1.6 1.8 4.3 0 6zM12 14.3c1.8 1.7 1.8 4.4 0 6-1.8-1.6-1.8-4.3 0-6zM14 10.85c.6-2.4 2.9-3.75 5.2-3 .5 2.35-.8 4.65-3.2 5.3zM10 13.15c-.6 2.4-2.9 3.75-5.2 3-.5-2.35.8-4.65 3.2-5.3zM14 13.15c2.4.65 3.7 2.95 3.2 5.3-2.3.75-4.6-.6-5.2-3zM10 10.85c-2.4-.65-3.7-2.95-3.2-5.3 2.3-.75 4.6.6 5.2 3z'/>",
    every: "<circle cx='12' cy='12' r='8.7'/><path d='M12 5.8c.4 3.7 2.5 5.8 6.2 6.2-3.7.4-5.8 2.5-6.2 6.2-.4-3.7-2.5-5.8-6.2-6.2 3.7-.4 5.8-2.5 6.2-6.2z' fill='currentColor' stroke='none'/>",
    herbs: "<path d='M12 21v-9.5'/><path d='M12 11.5C12 8 9.7 5.7 5.5 5.5c-.2 4.1 2.2 6.3 6.5 6z'/><path d='M12 14.5c.1-3 2-4.9 5.7-5-.1 3.6-2 5.4-5.7 5z'/><path d='M8.5 21h7'/>",
    birds: "<path d='M4 14.2c0-3.5 2.7-6.2 6.2-6.2 2.1 0 3.8.9 4.9 2.4l3.9-.9-2.6 3.4c0 3.5-2.8 6.1-6.2 6.1H5.3l2-2.3C5.3 16.1 4 15.4 4 14.2z'/><circle cx='13.3' cy='11.5' r='.9' fill='currentColor' stroke='none'/><path d='M8.3 13.5c1.2 1.3 2.8 1.6 4.4.9'/>",
    swing: "<path d='M3.5 4.200h17M6.800 4.200V13M17.200 4.200V13'/><path d='M5 9.5v6.5h14V9.5'/><path d='M5 13h14'/><path d='M4 4.200v16M20 4.200v16'/>",
    glass: "<path d='M8.2 3.8h7.6v2.9c1.4.9 2.2 2.2 2.2 3.9V18a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7.4c0-1.7.8-3 2.2-3.9z'/><path d='M8.2 6.7h7.6'/><rect x='8.8' y='11.3' width='6.4' height='4.6' rx='.5'/>",
    still: "<path d='M12 7.5v10'/><path d='M12 9.8C10.3 6.3 6.7 5.2 5.2 7c-1.5 1.9.3 5.1 3.1 5.6-1.8.7-2.5 2.8-1.3 4.2 1.4 1.5 3.9.4 5-2.3'/><path d='M12 9.8c1.7-3.5 5.3-4.6 6.8-2.8 1.5 1.9-.3 5.1-3.1 5.6 1.8.7 2.5 2.8 1.3 4.2-1.4 1.5-3.9.4-5-2.3'/><path d='M10.8 5.3 12 7.5l1.2-2.2'/>",
    trees: "<path d='M12 3.3a5.3 5.3 0 0 1 4.9 7.4 4.3 4.3 0 0 1-2.4 6.1h-5a4.3 4.3 0 0 1-2.4-6.1A5.3 5.3 0 0 1 12 3.3z'/><path d='M12 11v10M12 14.5l-2-1.7M12 13l1.9-1.6M9.3 21h5.4'/>",
    hops: "<path d='M3 17.5c1.7-6.3 4.3-6.3 6 0 1.5-5.2 3.7-5.2 5.2 0 1.2-4.1 3-4.1 4.2 0'/><path d='M3 20.5h18'/><circle cx='19.8' cy='11' r='1.1' fill='currentColor' stroke='none'/>",
    regions: "<path d='M2.5 19.5c3.2-8 6.3-12 9.5-12s6.3 4 9.5 12z'/><path d='M12 19.5c-1.6-1.8 1.5-3 0-5s1.3-2.8.2-4.5'/><path d='M12 7.5V3.2l3.2 1.3-3.2 1.3'/>",
    moon: "<path d='M15.8 3.6a6.7 6.7 0 1 0 4.6 9.5 5.5 5.5 0 0 1-4.6-9.5z'/><path d='M3.5 18.8c1.7-.9 3.3-.9 5 0s3.3.9 5 0 3.3-.9 5 0M7 21.5c1.3-.6 2.5-.6 3.8 0s2.5.6 3.8 0'/>",
    habit: "<rect x='7' y='2.8' width='10' height='18.4' rx='2.4'/><path d='M10 15.8v-1.2M12 15.8v-2.8M14 15.8v-4.4'/><path d='M9.2 8.3l5.6 9.2' opacity='.9'/>",
    wish: "<path d='M12 13.5V21'/><circle cx='12' cy='9' r='1.3' fill='currentColor' stroke='none'/><path d='M12 7.2V3.7M13.3 7.7l2.3-2.5M13.8 9l3.4-.4M13.3 10.3l2.6 2M10.7 7.7 8.4 5.2M10.2 9l-3.4-.4M10.7 10.3l-2.6 2'/><circle cx='12' cy='3' r='.7' fill='currentColor' stroke='none'/><circle cx='16.1' cy='4.7' r='.7' fill='currentColor' stroke='none'/><circle cx='17.9' cy='8.5' r='.7' fill='currentColor' stroke='none'/><circle cx='7.9' cy='4.7' r='.7' fill='currentColor' stroke='none'/><circle cx='6.1' cy='8.5' r='.7' fill='currentColor' stroke='none'/><circle cx='16.4' cy='12.7' r='.7' fill='currentColor' stroke='none'/><circle cx='7.6' cy='12.7' r='.7' fill='currentColor' stroke='none'/>",
    plop: "<circle cx='12' cy='7' r='3.2'/><path d='M12 3.8c.3-1 .9-1.5 1.8-1.6'/><ellipse cx='12' cy='16.5' rx='8.2' ry='3.3'/><ellipse cx='12' cy='16.5' rx='3.6' ry='1.3'/>",
    skip: "<path d='M3 13.5c1.3-4.3 3.3-4.3 4.6 0 1.1-3.6 2.8-3.6 3.9 0 .9-2.9 2.3-2.9 3.2 0 .7-2.2 1.8-2.2 2.5 0'/><ellipse cx='19.7' cy='12.2' rx='1.9' ry='1' fill='currentColor' stroke='none'/><path d='M3 17.5h18M6 20.5h12'/>",
    firefly: "<path d='M4.5 13c0 4.4 3.2 7.5 7.5 7.5s7.5-3.1 7.5-7.5'/><path d='M4.5 13c1.6-.5 3 .2 3.8 1.6M19.5 13c-1.6-.5-3 .2-3.8 1.6'/><path d='M12 4.2c.3 2.7 1.8 4.2 4.5 4.5-2.7.3-4.2 1.8-4.5 4.5-.3-2.7-1.8-4.2-4.5-4.5 2.7-.3 4.2-1.8 4.5-4.5z' fill='currentColor' stroke='none'/>",
    keys: "<circle cx='8' cy='8' r='3.6'/><path d='M10.6 10.6 19 19M15.4 15.4l2.2-2.2M17.6 17.6l1.7-1.7'/>",
    next: "<path d='M12 3.2l4.3 7.4c.7 1.9.4 3.9-.8 5.3L12 20.2l-3.5-4.3c-1.2-1.4-1.5-3.4-.8-5.3z'/><path d='M12 20.2v-6.4'/><circle cx='12' cy='12.4' r='1.1'/>"
  };
  function medal(id) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (MEDAL[id] || MEDAL.every) + "</svg>"; }
  P.medal = medal;
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
      if (!G.s.ach) { G.s.ach = {}; ACH.forEach(function (a) { var ok = false; try { ok = a[4](); } catch (e) { } if (ok) G.s.ach[a[0]] = Date.now(); }); }
      lastObj = G.s.objective; lastPct = P.percent();
    }
    G.s.ach = G.s.ach || {};
    ACH.forEach(function (a) { var ok = false; try { ok = a[4](); } catch (e) { } if (ok && !G.s.ach[a[0]]) { G.s.ach[a[0]] = Date.now(); queue.push(a); } });
    if (queue.length && !showing && !G.cut && G.mode === "walk" && !G.talking) show(queue.shift());
  }
  P.check = check;
  function show(a) {
    showing = true;
    var d = document.createElement("div"); d.className = "achpop";
    var got = Object.keys(G.s.ach).length;
    d.innerHTML = '<div class="achmed">' + medal(a[0]) + '</div><div class="achtx"><small>Moment · ' + got + " of " + ACH.length + "</small><b>" + a[1] + "</b><p>" + a[2] + "</p></div>";
    document.body.appendChild(d);
    document.body.classList.add("achon");                      // the area title steps aside for it
    requestAnimationFrame(function () { d.classList.add("on"); });
    if (A) A.sfx("ach");
    if (G.prefs.haptics && navigator.vibrate) navigator.vibrate([12, 60, 18]);
    setTimeout(function () { if (G.burst && G.p) G.burst(G.p.x, G.p.y - 30, 22, "255,214,120", 16); }, 300);
    pctPop();
    setTimeout(function () { d.classList.add("out"); setTimeout(function () { d.remove(); showing = false; document.body.classList.remove("achon"); G.save && G.save(true); }, 700); }, 3600);
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
      var el = document.createElement("div"); el.className = "objdone"; el.innerHTML = '<i><svg class="i" aria-hidden="true"><use href="#i-check"/></svg></i><span>' + G.fmt(lastObj) + "</span>";
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
      html += '<div class="achc' + (g ? " got" : "") + '"><i>' + (g ? medal(a[0]) : "?") + "</i><b>" + (g ? a[1] : "· · ·") + "</b><small>" + (g ? a[2] : a[3]) + "</small></div>";
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
