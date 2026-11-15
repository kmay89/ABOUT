/* sw.js — Hollow works on a train.

   Network-first over a fixed shell: the page, its stylesheet, its scripts,
   the worker and the vendored Three.js, with the cache as the offline copy.
   (It used to be cache-first, which kept installed users on the old studio
   until they happened to reload twice.) Bump VERSION on every release so
   the offline copy is refetched whole.

   The rules the other rooms learned the hard way apply here too: the install
   is all or nothing (a release with one script missing never takes over), a
   cached file is served as it is, and on activate only this room's old
   caches go — the cache store belongs to the whole site. */
var VERSION = "hollow-v4";
var SHELL = [
  "./", "./index.html", "./styles.css",
  "./app.js", "./viewer.js", "./verdict.js", "./sounds.js", "./mesh.js", "./sdf.js", "./mc.js", "./decimate.js", "./mold.js", "./samples.js", "./threemf.js", "./mold-worker.js",
  "./vendor/three.module.js", "./vendor/OrbitControls.js",
  "./manifest.webmanifest", "./favicon.svg",
];
var OPTIONAL = ["./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(VERSION).then(function (cache) {
    return Promise.all(SHELL.map(function (url) {
      return fetch(url, { cache: "no-cache" }).then(function (response) {
        if (!response.ok) throw new Error(url);
        return cache.put(url, response);
      });
    })).then(function () {
      return Promise.all(OPTIONAL.map(function (url) {
        return fetch(url, { cache: "no-cache" }).then(function (r) { return r.ok ? cache.put(url, r) : null; }).catch(function () {});
      }));
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("hollow-") === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  /* network first, so a deployed fix is what the next visit gets; the cache
     is the offline understudy, refreshed on every successful fetch, and
     takes over at once with no network or after a short wait on a slow one */
  var fresh = req.mode === "navigate" ? new Request(url.href, { cache: "no-cache", credentials: "same-origin" }) : new Request(req, { cache: "no-cache" });
  event.respondWith(caches.open(VERSION).then(function (cache) {
    var fromCache = function () {
      return cache.match(req, { ignoreSearch: true }).then(function (hit) { return hit || (req.mode === "navigate" ? cache.match("./index.html") : null); });
    };
    var net = fetch(fresh).then(function (res) {
      if (res && res.ok && res.type === "basic") cache.put(req, res.clone()).catch(function () {});
      return res;
    });
    var slow = new Promise(function (r) { setTimeout(r, 3500); }).then(fromCache);
    return Promise.race([net.catch(function () { return null; }), slow]).then(function (first) {
      if (first) return first;
      return net.catch(function () { return null; }).then(function (r) { return r || fromCache(); }).then(function (r) { return r || Response.error(); });
    });
  }));
});
