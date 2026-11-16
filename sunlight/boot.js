/* boot.js — the first screen: who made this, while the hill loads.

   This runs before anything else, so there is something on the glass from
   the first frame: ERRER Labs, then Karl Meves, and under them one line
   that says what the game is doing. Loading, looking for a newer version,
   getting it: all of that happens here, behind the names, and none of it
   asks anything of you. Your saved game is on this device and an update
   never touches it, and the line says so whenever there is one.

   · The names play once in a sitting. A reload, or coming back from an
     update, goes straight to the loading line. A tap or a key skips them.
     Whether they play is decided in the page's head, before the first
     frame, so the first name is on the glass from that frame (look.css
     shows it) and does not wait for this script, or for the game's
     scripts, which keep the page busy for its first second or two. Each
     name is timed from when it was actually drawn, so a slow device shows
     them for longer, never shorter.
   · The title is not shown until the game is built, and until anything it
     is waiting on (ui.js: the look for a newer version) has let go.
   · ?beat=… (the test door) has no first screen, and ?intro=0 has no names.
   · Nothing can leave you stuck here: if the game has not said it is ready
     a few seconds after the page finished arriving, the screen lifts anyway.

   BSboot is the handle the rest of the game uses:
     ready()             the game is built; the title can be shown
     hold() → release    wait for something; it returns the function that lets go
     say(msg, sub)       the line under the names, and a smaller one under it
     note(msg, sub, ms)  the same, staying up at least ms so it can be read
     progress(f)         the bar, 0 to 1
     cover(msg, sub)     come back over the game (an update is being taken)
     names(fn)           run fn once the names are over (at once, if they are)
     then(fn)            run fn once the title is showing
     skip()              skip the names
     up()                is it still on the screen? */
(function () {
  "use strict";
  var el = document.getElementById("boot"), body = document.body, q = location.search;
  var B = window.BSboot = { changed: false, ctl0: false };
  /* the worker changing hands is listened for from the very first moment (ui.js acts on it) */
  try {
    if ("serviceWorker" in navigator) {
      B.ctl0 = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener("controllerchange", function () { B.changed = true; if (B.onchange) B.onchange(); });
    }
  } catch (e) { }

  if (!el || /[?&]beat=/.test(q)) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
    body.classList.remove("booting");
    B.ready = B.say = B.note = B.progress = B.cover = B.skip = function () { };
    B.hold = function () { return function () { }; };
    B.then = B.names = function (fn) { fn(); };
    B.up = function () { return false; };
    return;
  }

  var INTRO = "borrowed-sunlight-intro";
  var cards = el.querySelectorAll(".bident"), msg = document.getElementById("bootmsg"), sub = document.getElementById("bootsub"), bar = document.getElementById("bootbar");
  var total = +el.getAttribute("data-n") || 0, base = document.scripts.length;
  var gate = 0, built = false, namesOver = false, gone = false, until = 0, after = [], afterNames = [], timers = [];
  var ver = document.getElementById("bootver"); if (ver && window.SUNLIGHT_VERSION) ver.textContent = "Version " + window.SUNLIGHT_VERSION;

  /* (a name only goes down if it was up: going down is an animation that starts from fully there) */
  function card(i, on) {
    var c = cards[i], was = c.classList.contains("on");
    if (on) { c.classList.remove("bye"); c.classList.add("on"); }
    else if (was) { c.classList.remove("on"); c.classList.add("bye"); }
  }
  function hideAll() { for (var k = 0; k < cards.length; k++) card(k, false); }
  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function drawn(fn) { requestAnimationFrame(function () { requestAnimationFrame(fn); }); }
  function endNames() {
    if (namesOver) return; namesOver = true;
    timers.forEach(clearTimeout); timers = []; hideAll();
    try { sessionStorage.setItem(INTRO, "1"); } catch (e) { }
    el.classList.add("waiting");
    afterNames.splice(0).forEach(function (fn) { try { fn(); } catch (e) { } });
    /* still not built a moment later: say what is happening */
    setTimeout(function () { if (!gone && !built && !msg.textContent) B.say("Loading the hill"); }, 500);
    leave();
  }
  function leave() {
    if (gone || !namesOver || !built || gate > 0) return;
    var wait = until - Date.now();
    if (wait > 0) { setTimeout(leave, wait + 20); return; }
    gone = true; clearInterval(count);
    el.classList.add("off"); body.classList.remove("booting");
    setTimeout(function () { if (gone) el.hidden = true; }, 700);
    after.splice(0).forEach(function (fn) { try { fn(); } catch (e) { } });
  }

  B.say = function (m, s) { if (gone) return; msg.textContent = m || ""; sub.textContent = s || ""; el.classList.toggle("says", !!m); };
  B.note = function (m, s, ms) { B.say(m, s); until = Math.max(until, Date.now() + (ms || 1600)); };
  B.progress = function (f) { if (gone) return; f = Math.max(0, Math.min(1, +f || 0)); el.classList.remove("ind"); bar.style.width = (f * 100).toFixed(1) + "%"; el.classList.toggle("busy", f < 1); };
  B.ready = function () { if (built) return; built = true; B.progress(1); if (msg.textContent === "Loading the hill") B.say(""); leave(); };
  B.hold = function () { var freed = false; gate++; return function () { if (freed) return; freed = true; gate--; leave(); }; };
  B.then = function (fn) { if (gone) fn(); else after.push(fn); };
  B.skip = function () { if (!namesOver) endNames(); };
  B.names = function (fn) { if (namesOver) fn(); else afterNames.push(fn); };
  B.up = function () { return !gone; };
  /* back over the game: an update is being taken, and the page is about to reload */
  B.cover = function (m, s) {
    gone = false; namesOver = true; built = false; until = 0;
    timers.forEach(clearTimeout); timers = [];
    el.hidden = false; hideAll(); el.classList.add("waiting"); body.classList.add("booting");
    void el.offsetWidth; el.classList.remove("off");
    B.say(m, s); bar.style.width = ""; el.classList.add("busy", "ind");
  };

  /* the names: once in a sitting. The first is already up (the head of the page saw to that); each is held from when it was drawn. */
  if (document.documentElement.classList.contains("names")) {
    cards[0].classList.add("on");
    drawn(function () {
      later(1800, function () {
        card(0, false);
        later(400, function () {
          card(1, true);
          drawn(function () { later(1800, function () { card(1, false); later(380, endNames); }); });
        });
      });
    });
  } else endNames();

  /* the bar follows the scripts as they arrive (data-n is how many there are after this one) */
  var count = setInterval(function () {
    if (built || gone) return;
    if (total) B.progress(Math.min(0.94, (document.scripts.length - base) / total));
  }, 90);

  /* while this is up the game hears nothing: a key or a tap only skips the names */
  function key(e) {
    if (gone || e.metaKey || e.ctrlKey || e.altKey) return;
    e.stopImmediatePropagation();
    if (e.key === "Tab" || e.key === " " || e.key === "Enter") e.preventDefault();
    if (e.type === "keydown" && !e.repeat) B.skip();
  }
  window.addEventListener("keydown", key, true);
  window.addEventListener("keyup", key, true);
  /* (the tap that skips must not also be a press on whatever is under the screen as it lifts: the click that
     follows a tap arrives after the screen has stopped taking touches, so it is swallowed here) */
  var tapped = 0;
  el.addEventListener("pointerdown", function (e) { e.preventDefault(); tapped = Date.now(); B.skip(); });
  window.addEventListener("click", function (e) { if (Date.now() - tapped < 700) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  /* never stuck: the page has all arrived and the game still hasn't spoken */
  window.addEventListener("load", function () { setTimeout(function () { if (!built) B.ready(); }, 6000); });
  setTimeout(function () { if (!gone && !built) B.say("Still loading", "If it stays like this, check your connection and reload the page."); }, 25000);
})();
