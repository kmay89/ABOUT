/* sw.js — the room works on a bus.

   Network-first over a fixed shell, falling back to the cache when
   there is no network: the whole game is a dozen scripts and a page,
   and a fix that has been deployed should be the one a player sees the
   next time they open the room — not the time after that. Cache-first
   (what this used to be) served the old copy and freshened it in the
   background, which meant a reversed-bone fix sat on the server for a
   whole evening while an installed phone kept showing the bug. On a bus
   the fetch fails fast and the cached shell comes up as before.

   Bump VERSION on every release so the install step refetches the lot.
   The update is announced rather than forced: swapping the code out
   from under somebody mid-hand would lose the hand, so the page is told
   a new version is waiting and takes it between hands. */
var VERSION = "domino-v6";

/* Cache Storage belongs to the whole origin, not to this room: every room
   on kmay89.com keeps its offline copy in the same place. So only this
   room's own older caches are cleared — clearing everything that is not
   ours emptied every other room's offline copy each time this one
   updated. */
var MINE = VERSION.replace(/v\d+$/, "");
var SHELL = [
  "./", "./index.html",
  "./rules.js", "./layout.js", "./ai.js", "./coach.js",
  "./skins.js", "./gfx2d.js", "./gfx3d.js", "./cantina.js", "./faces.js", "./sound.js", "./career.js", "./rating.js",
  "./room.js", "./net.js", "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      /* one missing file must not fail the whole install — the game
         still runs without an icon */
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () { return null; });
      }));
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return (k === VERSION || k.indexOf(MINE) !== 0) ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    /* the network first, with a short patience: a slow link is served
       from the cache rather than a spinner, and a dead one at once */
    Promise.race([
      fetch(req),
      new Promise(function (_, rej) { setTimeout(function () { rej(new Error("slow")); }, 3500); })
    ]).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }
      return caches.match(req).then(function (hit) { return hit || res; });
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match("./index.html");
      });
    })
  );
});

self.addEventListener("message", function (e) {
  if (e.data === "skipWaiting") self.skipWaiting();
});
