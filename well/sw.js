/* sw.js — the well works on a train.

   Cache-first over a fixed shell, because nothing in it changes between
   releases: nineteen scripts, a stylesheet, a page and the icons, all of
   it a few hundred kilobytes. Bump VERSION on every release or installed
   players keep the old room forever.

   The update is announced rather than forced. Swapping the code out from
   under somebody mid-run would lose the run, so the new version waits
   until the player taps the bar that says it is ready — and the page saves
   the well before it lets the new one in. */
var VERSION = "well-v2";
var SHELL = [
  "./", "./index.html", "./look.css",
  "./rules.js", "./engine.js", "./bot.js", "./modes.js", "./records.js",
  "./worlds.js", "./skins.js", "./layout.js", "./prefs.js", "./sky.js",
  "./gfx2d.js", "./gfx3d.js", "./music.js", "./input.js", "./learn.js",
  "./coach.js", "./steady.js", "./sheets.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    /* one missing file must not fail the whole install — the well still
       plays without an icon */
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () { return null; }); }));
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === VERSION ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  /* the site's one server-side door is never cached: a stale handshake is
     worse than none (the well never knocks on it, but it shares an origin) */
  if (url.pathname.indexOf("/api/") === 0) return;
  e.respondWith(caches.match(req, { ignoreSearch: req.mode === "navigate" }).then(function (hit) {
    if (hit) {
      /* serve what we have, and quietly refresh it for next time */
      fetch(req).then(function (res) {
        if (res && res.ok) caches.open(VERSION).then(function (c) { c.put(req, res.clone()); });
      }).catch(function () {});
      return hit;
    }
    return fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return caches.match("./index.html"); });
  }));
});

self.addEventListener("message", function (e) {
  if (e.data === "skipWaiting" || (e.data && e.data.type === "SKIP_WAITING")) self.skipWaiting();
});
