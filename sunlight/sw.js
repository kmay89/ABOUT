/* sw.js — the hill works with no signal at all, which seems only right.

   Cache-first over a fixed shell. The install is all or nothing for the
   page, its stylesheet and its scripts (icons are optional), so a release
   can never be half-installed. The game saves to localStorage, not to
   memory, so a new version can take over at once without losing anybody's
   week. Bump VERSION on every release. Only this room's old caches are
   deleted on activate — the cache store belongs to the whole site. */
var VERSION = "sunlight-v18";
var SHELL = ["./", "./index.html", "./look.css", "./world.js", "./art.js", "./audio.js", "./lens.js", "./icons.js",
  "./engine.js", "./minis.js", "./story.js", "./juice.js", "./inspect.js", "./life.js", "./guide.js", "./cellar.js", "./atmos.js", "./toys.js", "./prologue.js", "./progress.js", "./ui.js", "./manifest.webmanifest"];
var ICONS = ["./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: "reload" }); })).then(function () {
      return Promise.all(ICONS.map(function (u) { return c.add(new Request(u, { cache: "reload" })).catch(function () { return null; }); }));
    });
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k.indexOf("sunlight-") === 0 && k !== VERSION ? caches.delete(k) : null; }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.indexOf("/sunlight/") !== 0) return;
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req).then(function (res) { if (res && res.ok) c.put(req, res.clone()).catch(function () {}); return res; })
        .catch(function () { return req.mode === "navigate" ? c.match("./index.html") : Response.error(); });
    });
  }));
});
