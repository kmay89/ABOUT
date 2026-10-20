/* sw.js — Hollow works on a train.

   Cache-first over a fixed shell: the page, its stylesheet, its scripts, the
   worker and the vendored Three.js. Bump VERSION on every release or
   installed users keep the old studio forever.

   The rules the other rooms learned the hard way apply here too: the install
   is all or nothing (a release with one script missing never takes over), a
   cached file is served as it is, and on activate only this room's old
   caches go — the cache store belongs to the whole site. */
var VERSION = "hollow-v1";
var SHELL = [
  "./", "./index.html", "./styles.css",
  "./app.js", "./viewer.js", "./mesh.js", "./sdf.js", "./mc.js", "./decimate.js", "./mold.js", "./samples.js", "./threemf.js", "./mold-worker.js",
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
  if (event.request.method !== "GET") return;
  var url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(event.request);
  }));
});
