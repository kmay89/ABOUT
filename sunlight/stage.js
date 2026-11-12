/* stage.js — direction. The story's words were already there; this is where
   the camera stands while they are said.

   · Two people talking: when a scene starts and someone else speaks, the
     camera leaves its place over your shoulder and frames the two of you,
     eases in a little, and thin bars come down at the top and bottom. Wren
     and whoever is talking turn to face each other. When the scene ends,
     everything gives the frame back, gently.
   · Mo: when the gold voice speaks, the world holds its breath. The camera
     drifts in a touch closer and slower than for anyone else, and the bars
     come in.
   · Previously: continue a game you left a while ago and, before you start,
     the last thing that happened is read back to you, in the novel's own
     words, with where you were going. One tap and it's gone.
   Reduced motion keeps the frame where it is and skips the zoom. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio, T = 16, $ = function (id) { return document.getElementById(id); };
  var St = BS.stage = {};
  function reduced() { return G.prefs.reduced; }
  function touch() { return document.body.classList.contains("touch"); }

  /* ---------------- bars ---------------- */
  var lb = document.createElement("div"); lb.className = "lbox"; lb.setAttribute("aria-hidden", "true");
  lb.innerHTML = '<i class="t"></i><i class="b"></i>';
  document.body.appendChild(lb);

  /* ---------------- who is in the scene with you ---------------- */
  var partner = null, owned = false, zOwned = false, faced = null, zoom = 1, fx = null, fy = null;
  function entFor(who) {
    if (!who || who === "wren" || who === "phone" || who === "gran") return null;
    var best = null, bd = 150;
    G.ents.forEach(function (e) {
      if (e.map !== G.mapId || e.hidden || !e.who) return;
      if (e.who.indexOf(who) !== 0 && !(who === "worker" && e.id === "foreman")) return;
      var d = Math.hypot(e.x - G.p.x, e.y - G.p.y); if (d < bd) { bd = d; best = e; }
    });
    return best;
  }
  function face(a, bx, by) {
    var dx = bx - a.x, dy = by - a.y;
    return Math.abs(dx) > Math.abs(dy) * 0.8 ? (dx > 0 ? 2 : 3) : (dy > 0 ? 0 : 1);
  }
  function free() { return G.mode === "walk" && !G.titleRun && !(BS.cine && BS.cine.running && BS.cine.running()); }

  St.update = function (dt) {
    if (!G.s) return;
    var inScene = G.cut > 0 && free() && !G.hidePlayer;
    if (!inScene) partner = null;
    else if ($("dlg").classList.contains("on")) { var e = entFor(G.portrait); if (e) partner = e; }
    if (partner && (partner.map !== G.mapId || partner.hidden || Math.hypot(partner.x - G.p.x, partner.y - G.p.y) > 170)) partner = null;
    var moOn = inScene && G.moOn != null;
    var want = inScene && (partner || moOn);

    /* the frame */
    if (want && !reduced()) {
      var v = G.view(), tx, ty;
      if (partner) { tx = (G.p.x + partner.x) / 2; ty = (G.p.y + partner.y) / 2 - 12; }
      else { tx = G.p.x; ty = G.p.y - 12; }
      /* leave room for the words: the box sits low, so the people sit high */
      ty += v.h * (touch() ? 0.16 : 0.07);
      if (fx == null || !owned) { var c = G.camFocus || null; fx = c ? c.x : G.p.x; fy = c ? c.y : G.p.y - 10 + v.h * (touch() ? 0.1 : 0.03); }
      var k = Math.min(1, dt * (moOn && !partner ? 1.2 : 2.6));
      fx += (tx - fx) * k; fy += (ty - fy) * k;
      G.camFocus = { x: fx, y: fy }; owned = true;
      /* face each other, once, when the conversation starts */
      if (partner && faced !== partner) {
        faced = partner;
        G.p.dir = face(G.p, partner.x, partner.y);
        if (!partner.tick && !partner.follow && !partner.draw) partner.dir = face(partner, G.p.x, G.p.y);
      }
    } else if (owned) {
      /* hand the frame back: glide toward the player, then let go */
      var v2 = G.view(), hx = G.p.x, hy = G.p.y - 10 + v2.h * (touch() ? 0.1 : 0.03), k2 = Math.min(1, dt * 3.2);
      fx += (hx - fx) * k2; fy += (hy - fy) * k2;
      G.camFocus = { x: fx, y: fy };
      if (Math.hypot(hx - fx, hy - fy) < 2 || !free()) { if (free()) G.camFocus = null; owned = false; fx = fy = null; }
    }
    if (!want) faced = null;

    /* the lens: a little closer for two people, closer and slower for Mo */
    var zt = want && !reduced() ? (partner ? (touch() ? 1.12 : 1.16) : 1.1) : 1;
    if (zt !== 1 || zOwned) {
      zoom += (zt - zoom) * Math.min(1, dt * (zt > zoom ? 1.6 : 2.4));
      if (Math.abs(zoom - zt) < 0.004) zoom = zt;
      zoom = Math.round(zoom * 400) / 400;
      if (free()) G.zoom = zoom;
      zOwned = zoom !== 1;
    }
    lb.classList.toggle("on", !!want && !reduced());
    document.body.classList.toggle("framed", !!want && !reduced());
  };

  /* ---------------- previously ---------------- */
  var rc = document.createElement("div"); rc.className = "recap"; rc.setAttribute("role", "dialog"); rc.setAttribute("aria-live", "polite");
  rc.innerHTML = '<div class="rcin"><small>Previously</small><b class="rcch"></b><p class="rct"></p><div class="rcgo"><i></i><span class="rco"></span></div><button class="rcb" type="button">Go on</button></div>';
  document.body.appendChild(rc);
  var rcOpen = false;
  function closeRecap() { if (!rcOpen) return; rcOpen = false; rc.classList.remove("on"); G.cut = Math.max(0, G.cut - 1); A.sfx("page"); setTimeout(function () { $("stage").focus({ preventScroll: true }); }, 50); }
  rc.addEventListener("click", closeRecap);
  document.addEventListener("keydown", function (e) { if (rcOpen && (e.key === "e" || e.key === "E" || e.key === "Enter" || e.key === " " || e.key === "Escape")) { e.preventDefault(); e.stopPropagation(); closeRecap(); } }, true);
  St.recap = function (saved) {
    var lines = (saved.story || []).slice(-2).map(function (q) { return G.brief(q.t); }).filter(Boolean);
    if (!lines.length) return;
    var ago = saved.savedAt ? Date.now() - saved.savedAt : Infinity;
    if (ago < 4 * 60 * 1000) return;
    rc.querySelector(".rct").innerHTML = lines.map(function (l) { return G.fmt(l); }).join(" ");
    var S = BS.story, ch = "";
    if (S && S.chapterIndex) { var b0 = G.s; G.s = saved; try { var C = S.CHAPTERS[S.chapterIndex()]; ch = C ? "Chapter " + C[0] + " · " + C[1] : ""; } catch (e) { } G.s = b0; }
    rc.querySelector(".rcch").textContent = ch;
    var o = saved.objective || ""; rc.querySelector(".rcgo").hidden = !o; rc.querySelector(".rco").innerHTML = G.fmt(o);
    G.cut++; rcOpen = true;
    setTimeout(function () { rc.classList.add("on"); A.sfx("page"); rc.querySelector(".rcb").focus({ preventScroll: true }); }, 700);
  };
  /* stamp each save with when it happened */
  var save0 = G.save;
  G.save = function (q) { if (G.s && G.mode !== "title") G.s.savedAt = Date.now(); return save0.apply(this, arguments); };
})();
