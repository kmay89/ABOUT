/* hands.js — the things you press, and what's in your hands.

   look.css says what the controls are made of: a gold jar lid for the one
   thing on a screen that takes you on, jar glass for everything else,
   round for pressing and square for reading. This says how they behave.

   · Which hands. A keyboard, a gamepad or thumbs: whichever you used
     last. A prompt names its key the way it looks in your hands (a letter
     on a small lid, the sign on the bead under your thumb, the button on
     the pad), and the stick and the beads come and go with the thumbs.
   · The beads. The one that acts fills with gold when something is in
     reach. The phone's bead is a dead black stone until there's a drop of
     water on its eye, and glows foxfire green when something small is
     near. The crank isn't there until the lantern is yours; held, it
     turns, and the ring round it is your arm.
   · A lid sounds like a lid and glass like glass, and a switch clicks
     like the light switch in Gran's kitchen. The lids wear bright with
     use, the way the latch on the cellar door did.
   · Every screen can be worked without a mouse: arrows or the d-pad walk
     the buttons, Enter or A presses, B goes back, and Tab stays inside
     whatever is open.
   · A question is asked on a card of the game's own, not the browser's.
   · Where it's dark, the HUD keeps its voice down. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio, ui = BS.ui, $ = function (id) { return document.getElementById(id); };
  var H = BS.hands = {}, body = document.body, root = document.documentElement;

  /* ---------------- which hands ---------------- */
  var kind = window.matchMedia && matchMedia("(hover: none) and (pointer: coarse)").matches ? "touch" : "keys";
  function using(k) {
    if (k === kind) return;
    kind = k;
    body.setAttribute("data-input", k);
    body.classList.toggle("touch", k === "touch");
  }
  H.using = using;
  H.kind = function () { return kind; };
  body.setAttribute("data-input", kind);
  if (kind === "touch") body.classList.add("touch");
  window.addEventListener("touchstart", function () { using("touch"); }, { passive: true, capture: true });

  /* the name of a key, as it looks in these hands */
  var LETTER = { keys: { act: "E", lens: "L", crank: "C", book: "B", menu: "Esc" }, pad: { act: "A", lens: "X", crank: "B", book: "Y", menu: "Start" } };
  H.key = function (a) {
    if (kind === "touch") {
      var sign = a === "act" ? "i-spark" : a === "crank" ? "i-crank" : G.s.items && G.s.items.lens ? "i-drop" : "i-phone";
      return '<kbd><svg class="i' + (a === "act" ? " f" : "") + '" aria-hidden="true"><use href="#' + sign + '"/></svg></kbd>';
    }
    return "<kbd>" + ((LETTER[kind] || LETTER.keys)[a] || "") + "</kbd>";
  };

  /* ...and its name in a sentence ("Hold C for light", "Hold the crank for light") */
  var WORD = { act: "the spark", lens: "the drop", crank: "the crank", book: "top right" };
  H.name = function (a, aside) { return kind === "touch" ? (aside ? "" : WORD[a]) : (LETTER[kind] || LETTER.keys)[a]; };

  /* labels are set in a small-caps face; if it never arrives they become capitals */
  if (document.fonts && document.fonts.load) {
    document.fonts.load('12px "Sunlight Caps"').then(function (f) { if (!f || !f.length) root.classList.add("nocaps"); }, function () { root.classList.add("nocaps"); });
  }

  /* ---------------- the beads under your thumb ---------------- */
  var T = $("touch"), was = {}, lastArm = -1, lastLamp = "";
  function flag(k, on) { if (was[k] !== on) { was[k] = on; T.classList.toggle(k, on); } }
  setInterval(function () {
    if (!T || !G.s) return;
    var playing = body.classList.contains("playing") && G.mode !== "title", it = G.s.items || {}, L = G.lamp || {};
    /* where it's dark and nothing is lit, the HUD dims with it; a cranked
       lantern or the work lights bring it back */
    var dark = playing && !!(G.map && G.map.dark >= 0.9) && !G.workLights && (L.level || 0) < 0.35;
    if (was.dim !== dark) { was.dim = dark; body.classList.toggle("dim", dark); }
    if (kind !== "touch" || !playing) return;
    var walk = G.mode === "walk" && !G.cut;
    flag("haslens", !!it.lens);
    flag("haslantern", !!it.lantern);
    flag("near", walk && !!G.nearSpot);
    flag("small", walk && !!it.lens && !G.nearSpot && !!G.lensNear());
    flag("cranking", walk && !!it.lantern && G.held("crank") && (L.arm || 0) > 0);
    flag("tired", (L.arm == null ? 1 : L.arm) < 0.98);
    var arm = Math.round((L.arm == null ? 1 : L.arm) * 100), lamp = (L.level || 0).toFixed(1);
    if (arm !== lastArm) { lastArm = arm; T.style.setProperty("--arm", arm); }
    if (lamp !== lastLamp) { lastLamp = lamp; T.style.setProperty("--lamp", lamp); }
  }, 100);

  /* ---------------- what a press sounds like ---------------- */
  var LID = ".primary,.contcard,.updcard button:not(.x)";
  var WEAR = "borrowed-sunlight-game-wear", worn = 0;
  try { worn = +localStorage.getItem(WEAR) || 0; } catch (e) { }
  function showWear() { root.style.setProperty("--wear", Math.min(1, worn / 80).toFixed(2)); }
  showWear();
  /* what it is like is feel.js's business: a press goes down (dull), and
     when it has done its work it comes back (a lid rings, glass wobbles).
     A switch says which way it went as it goes. */
  var F = BS.feel;
  function pressed(el, byThumb) {
    var lid = el.matches(LID);
    if (el.matches("input[type=checkbox]")) { if (!F) A.sfx("click"); return; }
    if (lid && worn < 80) { worn++; showWear(); try { localStorage.setItem(WEAR, worn); } catch (e) { } }
    if (F) { F.down(el, lid); return; }
    A.sfx(lid ? "lid" : "glass");
    if (byThumb && G.prefs.haptics && navigator.vibrate) navigator.vibrate(lid ? 10 : 6);
  }
  function control(t) {
    if (!t || !t.closest) return null;
    var el = t.closest("button,a.quiet,a.btn,summary,label.ck,input[type=checkbox]");
    if (!el || el.disabled || el.closest("#touch")) return null;
    return el.matches("label.ck") ? el.querySelector("input") : el;
  }
  document.addEventListener("pointerdown", function (e) { var el = control(e.target); if (el) pressed(el, e.pointerType === "touch"); }, true);
  /* a press that came from a key or a pad, not a pointer */
  document.addEventListener("click", function (e) {
    var el = control(e.target); if (!el || el.matches("input[type=checkbox]")) return;
    if (e.detail === 0) pressed(el, false);
    if (F) F.went(el, el.matches(LID));
  }, true);
  /* a switch, thrown */
  document.addEventListener("change", function (e) { var c = e.target; if (F && c && c.type === "checkbox") F.cue(c.checked ? "on" : "off"); }, true);

  /* ---------------- knobs on grooves ---------------- */
  function fill(r) { var lo = +r.min || 0, hi = r.max === "" ? 100 : +r.max; r.style.setProperty("--p", ((r.value - lo) / ((hi - lo) || 1) * 100).toFixed(1) + "%"); }
  H.sync = function () { [].forEach.call(document.querySelectorAll("input[type=range]"), fill); };
  var notchAt = 0;
  document.addEventListener("input", function (e) {
    var r = e.target; if (!r || r.type !== "range") return;
    fill(r);
    var now = performance.now(); if (now - notchAt > 70) { notchAt = now; var v = (r.value - (+r.min || 0)) / (((r.max === "" ? 100 : +r.max) - (+r.min || 0)) || 1); if (F) F.cue("notch", { v: v }); else A.sfx("notch", v); }
  }, true);
  H.sync();

  /* ---------------- whatever is open ---------------- */
  var LAYERS = [".ask.on", "#howto.on", ".recap.on", "#insp.on", "#get.on", "#board.on", "#mini.on", "#choice.on", "#menu.on", "#book.on", "#end.on"];
  function top() {
    for (var i = 0; i < LAYERS.length; i++) { var el = document.querySelector(LAYERS[i]); if (el && !el.hidden) return el; }
    var t = $("title");
    return t && !t.hidden && !t.classList.contains("off") ? t : null;
  }
  H.top = top;
  function items(ov) {
    return [].filter.call(ov.querySelectorAll('button,a[href],input,textarea,summary'), function (el) {
      if (el.disabled || el.tabIndex < 0 || !el.getClientRects().length) return false;
      if (el.closest(".arriving")) return true;        /* on its way in as a card opens: it is there */
      return +getComputedStyle(el).opacity > 0.3;      /* not one that is still fading in */
    });
  }
  function first(ov, list) {
    var el = ov.querySelector("[data-focus]") || ov.querySelector("#t-continue:not([hidden])") || ov.querySelector(".tabs button.on") || ov.querySelector(".primary");
    return el && list.indexOf(el) >= 0 ? el : list[0];
  }
  function inside(ov) { var el = document.activeElement; return el && el !== ov && ov.contains(el) ? el : null; }
  /* stepping onto the next thing: down a list is down the scale, up (or along to the right) is up it */
  function go(el, up) { if (!el) return; el.focus(); if (F) F.cue("move", { up: !!up }); else A.sfx("blip"); }
  function bookTab(d) {
    var tabs = [].slice.call(document.querySelectorAll("#book [data-tab]")), i = 0;
    tabs.forEach(function (t, k) { if (t.classList.contains("on")) i = k; });
    var n = tabs[(i + d + tabs.length) % tabs.length];
    n.click(); n.focus({ preventScroll: true });
  }
  /* arrows, or the d-pad: walk the buttons. In the book, left and right turn
     to the next section, and up and down read down the page. */
  function nav(ov, dx, dy) {
    var el = inside(ov), list = items(ov);
    if (ov.id === "book") {
      if (dx) { bookTab(dx); return; }
      var body2 = ov.querySelector(".bbody"), pane = ov.querySelector(".bpane:not([hidden])"), inPane = pane ? items(pane) : [];
      if (!inPane.length || (el && el.tagName === "TEXTAREA")) { body2.scrollBy({ top: dy * 110, behavior: G.prefs.reduced ? "auto" : "smooth" }); return; }
      list = [ov.querySelector(".tabs button.on")].concat(inPane);
    }
    if (el && el.type === "range" && dx) {          /* a pad on a slider */
      if (dx > 0) el.stepUp(); else el.stepDown();
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (!list.length) return;
    var i = list.indexOf(el);
    go(i < 0 ? first(ov, list) : list[(i + (dx || dy) + list.length) % list.length], dx ? dx > 0 : dy < 0);
  }
  function back(ov) {
    if (ov.classList.contains("ask")) { var no = ov.querySelector("[data-no]"); if (no) no.click(); }
    else if (ov.id === "menu" || ov.id === "book") ui.closeAll();
    else if (ov.id === "howto") $("h-skip").click();
    else if (ov.id === "board") $("bclose").click();
    else if (ov.classList.contains("recap")) ov.click();
  }
  /* some screens have keys of their own: the object you turn, the oats you lay, the lines you choose between */
  function ownKeys(ov) { return ov.id === "insp" || ov.id === "get" || ov.id === "mini" || ov.id === "choice" || ov.id === "howto"; }

  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    var ov = top(); if (!ov) return;
    var t = e.target, tag = t && t.tagName, k = e.key;
    if (k === "Tab") {
      /* Tab stays inside whatever is open (and isn't the book's key while it does) */
      e.stopPropagation();
      var list = items(ov), i = list.indexOf(document.activeElement);
      if (!list.length) { e.preventDefault(); return; }
      if (i < 0) { e.preventDefault(); first(ov, list).focus(); }
      else if (e.shiftKey && i === 0) { e.preventDefault(); list[list.length - 1].focus(); }
      else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0].focus(); }
      return;
    }
    if (tag === "TEXTAREA" || ownKeys(ov)) return;
    /* Esc shuts the pause screen or the book, and B the book, from here: the
       game loop can't be relied on to hear them, because while a scene is
       speaking it listens for nothing else (and a pause screen opened just
       before a line began could then only be closed with the mouse) */
    if ((k === "Escape" && (ov.id === "menu" || ov.id === "book")) || ((k === "b" || k === "B") && ov.id === "book" && tag !== "INPUT")) {
      e.preventDefault(); e.stopPropagation(); back(ov); return;
    }
    var d = k === "ArrowDown" ? [0, 1] : k === "ArrowUp" ? [0, -1] : k === "ArrowRight" ? [1, 0] : k === "ArrowLeft" ? [-1, 0] : null;
    if (d) {
      if (tag === "INPUT" && t.type === "range" && d[0]) return;      /* left and right are the slider's own */
      e.preventDefault(); e.stopPropagation();
      nav(ov, d[0], d[1]);
      return;
    }
    if (k === "Enter" || k === " ") {
      var el = inside(ov);
      if (!el) {                          /* nothing chosen yet: Enter is the one that takes you on */
        var b = first(ov, items(ov));
        if (b) { e.preventDefault(); e.stopPropagation(); b.focus({ preventScroll: true }); b.click(); }
      } else if (k === "Enter" && tag === "INPUT" && t.type === "checkbox") { e.preventDefault(); t.click(); }
    }
  }, true);

  /* a pad's button, pressed while something is open. True means it was used here. */
  H.pad = function (a) {
    var ov = top(); if (!ov) return false;
    var mine = ov.classList.contains("ask");
    if (!mine && (G.modal || G.choosing || ov.id === "insp" || ov.id === "get" || ov.id === "mini" || ov.id === "choice")) return false;
    if (a === "up") nav(ov, 0, -1);
    else if (a === "down") nav(ov, 0, 1);
    else if (a === "left") nav(ov, -1, 0);
    else if (a === "right") nav(ov, 1, 0);
    else if (a === "act") { var el = inside(ov) || first(ov, items(ov)); if (el) { el.focus({ preventScroll: true }); el.click(); } }
    else if (a === "crank") back(ov);
    else return mine;
    return true;
  };
  /* the pad's stick walks the buttons too: once when it's pushed, then again if it's held */
  var held = "", heldAt = 0;
  H.padStick = function (ax, ay) {
    var d = Math.abs(ay) > 0.6 ? (ay > 0 ? "down" : "up") : Math.abs(ax) > 0.6 ? (ax > 0 ? "right" : "left") : "";
    if (!d) { held = ""; return; }
    var now = performance.now();
    if (d !== held) { held = d; heldAt = now + 220; using("pad"); H.pad(d); }
    else if (now > heldAt) { heldAt = now + 130; H.pad(d); }
  };

  /* ---------------- opening and closing ---------------- */
  var open0 = ui.open;
  ui.open = function (which, tab) {
    open0.call(ui, which, tab);
    H.sync();
    if (which === "menu") { var ms = document.querySelector("#menu .mscroll"); if (ms) ms.scrollTop = 0; if (F) { F.arrive($("menu")); F.count($("pzpct"), 800, 120); } }
    if (which === "book") setTimeout(function () { var t = document.querySelector("#book .tabs button.on"); if (t && G.mode === "book") t.focus({ preventScroll: true }); }, 40);
  };
  /* a tap on the dark around the book closes it */
  ["book", "menu"].forEach(function (id) { $(id).addEventListener("click", function (e) { if (e.target === this) ui.closeAll(); }); });
  $("m-help").addEventListener("click", function () {
    var h = $("help"); this.setAttribute("aria-expanded", String(!h.hidden));
    /* the answer opens below the fold, so bring it up to be read */
    if (!h.hidden && h.scrollIntoView) h.scrollIntoView({ block: "nearest", behavior: G.prefs.reduced ? "auto" : "smooth" });
  });
  /* a button on the HUD gives the keys back to the hill once it's been pressed */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#hud button,#goalcard");
    if (b) setTimeout(function () { if (!top() && document.activeElement === b) $("stage").focus({ preventScroll: true }); }, 0);
  });

  /* ---------------- a question, asked properly ----------------
     H.ask({ title, text, yes, no }) → a promise of true or false. The safe
     answer has the focus, Esc or a tap outside is "no". */
  H.ask = function (o) {
    return new Promise(function (res) {
      var el = document.createElement("div"), prev = document.activeElement, over = false;
      el.className = "ask"; el.setAttribute("role", "alertdialog"); el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-labelledby", "askt"); el.setAttribute("aria-describedby", "askp");
      el.innerHTML = '<div class="askc tooled"><h2 id="askt"></h2><p id="askp"></p><div class="row"><button type="button" class="ghost" data-no></button><button type="button" class="primary" data-yes></button></div></div>';
      el.querySelector("h2").textContent = o.title || "";
      el.querySelector("p").textContent = o.text || "";
      el.querySelector("[data-yes]").textContent = o.yes || "Yes";
      el.querySelector("[data-no]").textContent = o.no || "No";
      function done(v) {
        if (over) return; over = true;
        el.classList.remove("on");
        document.removeEventListener("keydown", key, true);
        setTimeout(function () { el.remove(); }, 280);
        if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true });
        res(v);
      }
      function key(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); } }
      el.addEventListener("click", function (e) {
        if (e.target === el || e.target.closest("[data-no]")) done(false);
        else if (e.target.closest("[data-yes]")) done(true);
      });
      document.addEventListener("keydown", key, true);
      body.appendChild(el);
      requestAnimationFrame(function () { el.classList.add("on"); if (F) F.arrive(el); el.querySelector("[data-no]").focus({ preventScroll: true }); });
    });
  };
})();
