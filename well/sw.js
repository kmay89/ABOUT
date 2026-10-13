/* sw.js — the well works on a train.

   Cache-first over a fixed shell, because nothing in it changes between
   releases: nineteen scripts, a stylesheet, a page and the icons, all of
   it a few hundred kilobytes. Bump VERSION on every release or installed
   players keep the old room forever.

   The update is announced rather than forced. Swapping the code out from
   under somebody mid-run would lose the run, so the new version waits
   until the player taps the bar that says it is ready — and the page saves
   the well before it lets the new one in.

   Three rules keep a release whole, each learned from a way it wasn't:

   · The install is all or nothing for the page, its stylesheet and its
     scripts. A version that installed with one script missing (a dropped
     request on a train) used to wait, announce itself, delete the complete
     old cache when it took over, and then hand the page index.html in
     place of app.js, offline: a splash with no buttons that worked. Now a
     failed install leaves the old worker and its whole cache in charge,
     and the browser tries again on the next visit. Each file is fetched
     past the HTTP cache, so a stale copy can't enter the new release. Only
     the icons may be missing; the well plays without them.
   · A file served from the cache is served as it is. Refreshing it behind
     the player's back, one file at a time, mixed two releases in one
     cache whenever a refresh failed — and ran the new code before anyone
     tapped the bar. A release arrives through VERSION and the tap, whole.
   · On activate only this room's old caches go. The cache store belongs
     to the whole site, and deleting every name but ours took the chess and
     sudoku rooms' offline copies with it. */
var VERSION = "well-v3";
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
var OPTIONAL = { "./icons/icon-192.png": 1, "./icons/icon-512.png": 1,
                 "./icons/icon-maskable-512.png": 1, "./icons/apple-touch-icon.png": 1 };

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    var need = SHELL.filter(function (u) { return !OPTIONAL[u]; });
    return c.addAll(need.map(function (u) { return new Request(u, { cache: "reload" }); })).then(function () {
      return Promise.all(SHELL.filter(function (u) { return OPTIONAL[u]; }).map(function (u) {
        return c.add(new Request(u, { cache: "reload" })).catch(function () { return null; });
      }));
    });
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      return k.indexOf("well-") === 0 && k !== VERSION ? caches.delete(k) : null;
    }));
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
  /* this worker's own cache only: while a newer worker waits, a match
     across every cache could hand this page the next release's files */
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req, { ignoreSearch: req.mode === "navigate" }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          c.put(req, copy).catch(function () {});
        }
        return res;
      }).catch(function () {
        /* offline and not in the shell: a page gets the well's own page,
           anything else an honest failure — never index.html as a script */
        return req.mode === "navigate" ? c.match("./index.html") : Response.error();
      });
    });
  }));
});

self.addEventListener("message", function (e) {
  if (e.data === "skipWaiting" || (e.data && e.data.type === "SKIP_WAITING")) self.skipWaiting();
});
