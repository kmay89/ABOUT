/* sw.js — the hill works with no signal at all, which seems only right.

   Network-first over a fixed shell, falling back to the cache when there
   is no network (or the network is too slow to wait for). This used to be
   cache-first, and that meant an installed phone kept showing last week's
   hill until it happened to be reloaded twice: a new scene went up on the
   server and nobody saw it. Now a deployed change is what the next visit
   gets, and the cached copy is only the offline understudy, refreshed on
   every successful fetch.

   Every request to the server revalidates (cache: "no-cache"), so a stale
   HTTP cache can't hide a release either. The install is all or nothing for
   the page, its stylesheet and its scripts (icons and typefaces are
   optional: the page is whole without them, in its fallback faces), so the
   offline copy can never be half one release and half another. The game
   saves to localStorage, so a new worker takes over at once; the page
   hears about it (controllerchange) and refreshes itself at a safe moment.
   Bump VERSION on every release. Only this room's old caches are deleted on
   activate: the cache store belongs to the whole site. */
var VERSION = "sunlight-v33";
var SHELL = ["./", "./index.html", "./look.css", "./fit.css", "./world.js", "./art.js", "./audio.js", "./lens.js", "./icons.js",
  "./engine.js", "./minis.js", "./story.js", "./juice.js", "./inspect.js", "./life.js", "./guide.js", "./gold.js", "./cellar.js", "./atmos.js", "./slope.js", "./toys.js", "./stage.js", "./phone.js", "./book.js", "./cover.jpg", "./prologue.js", "./progress.js", "./ui.js", "./gbook.js", "./hands.js", "./manifest.webmanifest"];
var ICONS = ["./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];
var FONTS = ["./fonts/eb-garamond.woff2", "./fonts/eb-garamond-italic.woff2", "./fonts/eb-garamond-caps.woff2", "./fonts/quintessential.woff2", "./fonts/shadows-into-light-two.woff2", "./fonts/permanent-marker.woff2"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: "reload" }); })).then(function () {
      return Promise.all(ICONS.concat(FONTS).map(function (u) { return c.add(new Request(u, { cache: "reload" })).catch(function () { return null; }); }));
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
  /* a navigation can't be re-made with options, so ask for its URL afresh */
  var fresh = req.mode === "navigate" ? new Request(url.href, { cache: "no-cache", credentials: "same-origin" }) : new Request(req, { cache: "no-cache" });
  e.respondWith(caches.open(VERSION).then(function (c) {
    var fromCache = function () {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || (req.mode === "navigate" ? c.match("./index.html") : null);
      });
    };
    var net = fetch(fresh).then(function (res) {
      if (res && res.ok && res.type === "basic") c.put(req, res.clone()).catch(function () {});
      return res;
    });
    /* the network first, with a short patience: a slow link is served from
       the cache rather than a spinner, a dead one at once */
    var slow = new Promise(function (r) { setTimeout(r, 3500); }).then(fromCache);
    return Promise.race([net.catch(function () { return null; }), slow]).then(function (first) {
      if (first) return first;
      return net.catch(function () { return null; }).then(function (r) { return r || fromCache(); })
        .then(function (r) { return r || Response.error(); });
    });
  }));
});
/* the page asks which release this is, for the menu */
self.addEventListener("message", function (e) {
  if (e.data === "version" && e.source) e.source.postMessage({ sunlightVersion: VERSION });
  if (e.data === "skipWaiting") self.skipWaiting();
});
