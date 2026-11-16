/* The Chess Room — the press.
   What a finger does to a button, kept in one place: when the key goes
   down, how long it stays down, where on it the light falls, and when it
   is let go. The look of all of it is CSS (index.html, "the keys"); this
   file only decides the moments and hands them out.

   Three things a plain :active cannot do, and the reason this exists:

   - A quick tap is over before the eye has seen it. A key that was
     pressed stays down for at least MIN_DOWN ms, so every tap shows the
     whole journey: down, held, back up.
   - A finger that lands on a button to scroll the page is not pressing
     it. On touch the key waits HOLD_OFF ms before it goes down, and a
     scroll (pointercancel) or a drift of more than SLOP px inside that
     time means it never does. A tap that ends sooner still goes down —
     at the moment it ends, which is also the moment a phone will let a
     page make a sound.
   - The key knows where it was touched (--px/--py), so the light on it
     can fall under the finger rather than in the middle.

   Nothing here is needed for a button to work: without this file the
   keys still press on :active. Reduced motion changes nothing in this
   file either — the stylesheet simply moves nothing. */
(function (root) {
"use strict";

var MIN_DOWN = 110;   /* ms a pressed key stays down, however quick the tap */
var HOLD_OFF = 70;    /* ms a touch waits before it counts as a press */
var SLOP = 9;         /* px a waiting touch may drift and still be a press */

/* what a key is, for whoever wants to answer it with a sound or a tick */
function kindOf(el) {
  var c = el.classList;
  if (c.contains("sw")) return "switch";
  if (c.contains("playBtn")) return "play";
  if (c.contains("ptab") || c.contains("pftab")) return "tab";
  if (c.contains("ghost") || c.contains("ghostbtn") || c.contains("linkish")) return "quiet";
  if (c.contains("sel") || c.contains("go") || c.contains("primary") || c.contains("primaryBtn") ||
      c.contains("tact")) return "bright";
  return "key";
}

/* where on the key the pointer is, as fractions that never leave it */
function pointOn(rect, x, y) {
  var w = rect.width || 1, h = rect.height || 1;
  var px = (x - rect.left) / w, py = (y - rect.top) / h;
  return { x: px < 0 ? 0 : px > 1 ? 1 : px, y: py < 0 ? 0 : py > 1 ? 1 : py };
}

/* how much longer a key that went down at `downAt` must stay down */
function owed(downAt, now) {
  var left = MIN_DOWN - (now - downAt);
  return left > 0 ? left : 0;
}

function attach(doc, opts) {
  opts = opts || {};
  var sel = opts.selector || "button";
  var onDown = opts.onDown || function () {};
  var now = opts.now || function () { return Date.now(); };
  var later = opts.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
  var never = opts.clearTimeout || function (t) { clearTimeout(t); };
  var held = null;   /* { el, id, x, y, wait, downAt } — one press at a time */

  function keyAt(target) {
    var el = target && target.closest ? target.closest(sel) : null;
    if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return null;
    return el;
  }
  function goDown(h, how) {
    if (h.downAt) return;
    h.downAt = now();
    h.el.classList.add("dn");
    onDown(h.el, kindOf(h.el), how);
  }
  function letGo(h) {
    if (!h) return;
    never(h.wait);
    if (!h.downAt) return;
    var el = h.el, left = owed(h.downAt, now());
    if (left > 0) later(function () { el.classList.remove("dn"); }, left);
    else el.classList.remove("dn");
  }

  doc.addEventListener("pointerdown", function (e) {
    if (e.button != null && e.button > 0) return;
    var el = keyAt(e.target);
    if (!el) return;
    if (held) { letGo(held); held = null; }
    var p = pointOn(el.getBoundingClientRect(), e.clientX, e.clientY);
    el.style.setProperty("--px", (p.x * 100).toFixed(1) + "%");
    el.style.setProperty("--py", (p.y * 100).toFixed(1) + "%");
    var h = held = { el: el, id: e.pointerId, x: e.clientX, y: e.clientY, wait: 0, downAt: 0 };
    if (e.pointerType === "touch") h.wait = later(function () { if (held === h) goDown(h, "hold"); }, HOLD_OFF);
    else goDown(h, "now");
  }, { passive: true, capture: true });

  doc.addEventListener("pointermove", function (e) {
    var h = held;
    if (!h || h.downAt || e.pointerId !== h.id) return;
    var dx = e.clientX - h.x, dy = e.clientY - h.y;
    if (dx * dx + dy * dy > SLOP * SLOP) { never(h.wait); held = null; }
  }, { passive: true, capture: true });

  doc.addEventListener("pointerup", function (e) {
    var h = held;
    if (!h || e.pointerId !== h.id) return;
    held = null;
    /* a tap quicker than the wait is still a press: it goes down now */
    if (!h.downAt && keyAt(e.target) === h.el) { never(h.wait); goDown(h, "tap"); }
    letGo(h);
  }, { passive: true, capture: true });

  doc.addEventListener("pointercancel", function (e) {
    var h = held;
    if (!h || e.pointerId !== h.id) return;
    held = null;
    letGo(h);
  }, { passive: true, capture: true });

  /* Enter and Space press a key too, and deserve the same travel */
  doc.addEventListener("keydown", function (e) {
    if (e.repeat || (e.key !== "Enter" && e.key !== " ")) return;
    var el = keyAt(e.target);
    if (!el || el !== e.target) return;
    el.style.setProperty("--px", "50%");
    el.style.setProperty("--py", "50%");
    var h = { el: el, id: -1, wait: 0, downAt: 0 };
    goDown(h, "key");
    letGo(h);
  }, { capture: true });

  /* the window going away mid-press must not leave a key stuck down */
  if (root.addEventListener) root.addEventListener("blur", function () { if (held) { letGo(held); held = null; } });

  return { held: function () { return held ? held.el : null; } };
}

/* An on/off chip drawn as a switch says so to a screen reader as well:
   role="switch" and aria-checked follow the .sel class the room already
   sets, so nothing that flips a setting has to know. */
function switches(doc) {
  var list = doc.querySelectorAll(".sw");
  function say(el) { el.setAttribute("aria-checked", el.classList.contains("sel") ? "true" : "false"); }
  for (var i = 0; i < list.length; i++) {
    var el = list[i];
    el.setAttribute("role", "switch");
    say(el);
    if (root.MutationObserver) {
      new root.MutationObserver((function (node) { return function () { say(node); }; })(el))
        .observe(el, { attributes: true, attributeFilter: ["class"] });
    }
  }
  return list.length;
}

var Press = { attach: attach, switches: switches, kindOf: kindOf, pointOn: pointOn, owed: owed,
              MIN_DOWN: MIN_DOWN, HOLD_OFF: HOLD_OFF, SLOP: SLOP };
if (typeof module !== "undefined" && module.exports) module.exports = Press;
else root.Press = Press;
})(typeof window !== "undefined" ? window : this);
