/* sw.js — the board works on a bus.

   Cache-first over a fixed shell, because none of it changes between
   releases: the whole game is eight scripts, a stylesheet and a page. Bump
   VERSION on every release or installed players keep the old one forever.

   The update is announced rather than forced — swapping the code out from
   under somebody mid-game would lose the game. */
var VERSION = "stratego-v1";
var SHELL = [
  "./", "./index.html", "./look.css",
  "./rules.js", "./ai.js", "./coach.js", "./gfx.js",
  "./room.js", "./net.js", "./table.js", "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    /* one missing file must not fail the whole install — the game still runs
       without an icon */
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
  /* the mailbox is never cached: a stale handshake is worse than none */
  if (url.pathname.indexOf("/api/") === 0) return;
  e.respondWith(caches.match(req).then(function (hit) {
    if (hit) {
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
  if (e.data === "skipWaiting") self.skipWaiting();
});
