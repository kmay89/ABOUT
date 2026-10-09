/* Vantage story service worker (template; `vantage build` injects CONFIG).
 *
 * - install: precache the core set (page, fonts, brand, icons, one JPEG per image, posters)
 * - message {type: "vantage:save"}: cache every remaining file ("Save for offline"), posting
 *   {type: "vantage:progress", done, total, bytes, totalBytes} and finally {type: "vantage:saved"};
 *   {type: "vantage:status"} answers {type: "vantage:status", cached, total}
 * - index.html: network first (3 s), cache fallback; everything else: cache first
 * - Range requests (iOS <video>) are answered with 206 slices of the cached file
 * - offline image misses fall back to any cached variant of the same image (another width/format)
 * The page only registers this worker over http(s); it never runs from file://.
 */
"use strict";

const CONFIG = {"cache":"vantage-demo-lakeside-bacc48370fd7","core":["./","apple-touch-icon.png","assets/brand/logo-on-dark.svg","assets/brand/logo.svg","assets/brand/mark.svg","assets/brand/partners/city-of-lakeside-on-dark.svg","assets/brand/partners/city-of-lakeside.svg","assets/brand/partners/field-and-form-on-dark.svg","assets/brand/partners/field-and-form.svg","assets/brand/partners/northcoast-builders-on-dark.svg","assets/brand/partners/northcoast-builders.svg","assets/fonts/fraunces-latin-opsz-normal.woff2","assets/fonts/inter-latin-opsz-normal.woff2","assets/img/overview/2025-04-12-1232.jpg","assets/img/overview/2025-04-12-960.jpg","assets/img/overview/2025-05-30-1232.jpg","assets/img/overview/2025-05-30-960.jpg","assets/img/overview/2025-07-18-1232.jpg","assets/img/overview/2025-07-18-960.jpg","assets/img/overview/2025-09-05-1232.jpg","assets/img/overview/2025-09-05-960.jpg","assets/img/overview/2025-10-24-1232.jpg","assets/img/overview/2025-10-24-960.jpg","assets/img/overview/2025-12-12-1232.jpg","assets/img/overview/2025-12-12-960.jpg","assets/img/overview/2026-01-31-1232.jpg","assets/img/overview/2026-01-31-960.jpg","assets/img/overview/2026-03-21-1232.jpg","assets/img/overview/2026-03-21-960.jpg","assets/img/overview/2026-05-09-1232.jpg","assets/img/overview/2026-05-09-960.jpg","assets/img/overview/2026-06-27-1232.jpg","assets/img/overview/2026-06-27-960.jpg","assets/img/overview/2026-08-08-1232.jpg","assets/img/overview/2026-08-08-960.jpg","assets/img/overview/2026-09-20-1232.jpg","assets/img/overview/2026-09-20-960.jpg","assets/img/shoreline/2025-04-12-1325.jpg","assets/img/shoreline/2025-04-12-960.jpg","assets/img/shoreline/2025-05-30-1325.jpg","assets/img/shoreline/2025-05-30-960.jpg","assets/img/shoreline/2025-07-18-1325.jpg","assets/img/shoreline/2025-07-18-960.jpg","assets/img/shoreline/2025-09-05-1325.jpg","assets/img/shoreline/2025-09-05-960.jpg","assets/img/shoreline/2025-10-24-1325.jpg","assets/img/shoreline/2025-10-24-960.jpg","assets/img/shoreline/2026-03-21-1325.jpg","assets/img/shoreline/2026-03-21-960.jpg","assets/img/shoreline/2026-05-09-1325.jpg","assets/img/shoreline/2026-05-09-960.jpg","assets/img/shoreline/2026-06-27-1325.jpg","assets/img/shoreline/2026-06-27-960.jpg","assets/img/shoreline/2026-08-08-1325.jpg","assets/img/shoreline/2026-08-08-960.jpg","assets/img/shoreline/2026-09-20-1325.jpg","assets/img/shoreline/2026-09-20-960.jpg","assets/img/video/last-evening-960.jpg","assets/img/video/opening-960.jpg","icon-192.png","icon-512.png","index.html","manifest.webmanifest"],"assets":[["apple-touch-icon.png",9418],["assets/brand/logo-on-dark.svg",2017],["assets/brand/logo.svg",2017],["assets/brand/mark.svg",355],["assets/brand/partners/city-of-lakeside-on-dark.svg",1503],["assets/brand/partners/city-of-lakeside.svg",1503],["assets/brand/partners/field-and-form-on-dark.svg",1774],["assets/brand/partners/field-and-form.svg",1774],["assets/brand/partners/northcoast-builders-on-dark.svg",1692],["assets/brand/partners/northcoast-builders.svg",1692],["assets/fonts/fraunces-latin-opsz-normal.woff2",67304],["assets/fonts/inter-latin-opsz-normal.woff2",72920],["assets/img/overview/2025-04-12-1232.avif",58411],["assets/img/overview/2025-04-12-1232.jpg",153498],["assets/img/overview/2025-04-12-960.avif",43126],["assets/img/overview/2025-04-12-960.jpg",106108],["assets/img/overview/2025-05-30-1232.avif",57307],["assets/img/overview/2025-05-30-1232.jpg",153768],["assets/img/overview/2025-05-30-960.avif",42792],["assets/img/overview/2025-05-30-960.jpg",107427],["assets/img/overview/2025-07-18-1232.avif",78725],["assets/img/overview/2025-07-18-1232.jpg",184193],["assets/img/overview/2025-07-18-960.avif",53800],["assets/img/overview/2025-07-18-960.jpg",124549],["assets/img/overview/2025-09-05-1232.avif",73247],["assets/img/overview/2025-09-05-1232.jpg",175747],["assets/img/overview/2025-09-05-960.avif",50287],["assets/img/overview/2025-09-05-960.jpg",117853],["assets/img/overview/2025-10-24-1232.avif",67950],["assets/img/overview/2025-10-24-1232.jpg",169257],["assets/img/overview/2025-10-24-960.avif",46899],["assets/img/overview/2025-10-24-960.jpg",112820],["assets/img/overview/2025-12-12-1232.avif",75509],["assets/img/overview/2025-12-12-1232.jpg",186353],["assets/img/overview/2025-12-12-960.avif",51195],["assets/img/overview/2025-12-12-960.jpg",125880],["assets/img/overview/2026-01-31-1232.avif",80629],["assets/img/overview/2026-01-31-1232.jpg",193905],["assets/img/overview/2026-01-31-960.avif",54518],["assets/img/overview/2026-01-31-960.jpg",132235],["assets/img/overview/2026-03-21-1232.avif",52218],["assets/img/overview/2026-03-21-1232.jpg",142835],["assets/img/overview/2026-03-21-960.avif",39046],["assets/img/overview/2026-03-21-960.jpg",99198],["assets/img/overview/2026-05-09-1232.avif",59152],["assets/img/overview/2026-05-09-1232.jpg",154597],["assets/img/overview/2026-05-09-960.avif",40371],["assets/img/overview/2026-05-09-960.jpg",102794],["assets/img/overview/2026-06-27-1232.avif",57671],["assets/img/overview/2026-06-27-1232.jpg",151849],["assets/img/overview/2026-06-27-960.avif",39201],["assets/img/overview/2026-06-27-960.jpg",100402],["assets/img/overview/2026-08-08-1232.avif",56401],["assets/img/overview/2026-08-08-1232.jpg",147732],["assets/img/overview/2026-08-08-960.avif",38260],["assets/img/overview/2026-08-08-960.jpg",97115],["assets/img/overview/2026-09-20-1232.avif",63692],["assets/img/overview/2026-09-20-1232.jpg",162063],["assets/img/overview/2026-09-20-960.avif",43908],["assets/img/overview/2026-09-20-960.jpg",107182],["assets/img/shoreline/2025-04-12-1325.avif",95159],["assets/img/shoreline/2025-04-12-1325.jpg",227637],["assets/img/shoreline/2025-04-12-960.avif",57154],["assets/img/shoreline/2025-04-12-960.jpg",132843],["assets/img/shoreline/2025-05-30-1325.avif",44700],["assets/img/shoreline/2025-05-30-1325.jpg",132269],["assets/img/shoreline/2025-05-30-960.avif",29954],["assets/img/shoreline/2025-05-30-960.jpg",81286],["assets/img/shoreline/2025-07-18-1325.avif",75379],["assets/img/shoreline/2025-07-18-1325.jpg",186584],["assets/img/shoreline/2025-07-18-960.avif",44740],["assets/img/shoreline/2025-07-18-960.jpg",107719],["assets/img/shoreline/2025-09-05-1325.avif",85048],["assets/img/shoreline/2025-09-05-1325.jpg",204740],["assets/img/shoreline/2025-09-05-960.avif",49847],["assets/img/shoreline/2025-09-05-960.jpg",116154],["assets/img/shoreline/2025-10-24-1325.avif",61839],["assets/img/shoreline/2025-10-24-1325.jpg",166947],["assets/img/shoreline/2025-10-24-960.avif",37251],["assets/img/shoreline/2025-10-24-960.jpg",94960],["assets/img/shoreline/2026-03-21-1325.avif",59425],["assets/img/shoreline/2026-03-21-1325.jpg",161938],["assets/img/shoreline/2026-03-21-960.avif",40216],["assets/img/shoreline/2026-03-21-960.jpg",101509],["assets/img/shoreline/2026-05-09-1325.avif",58153],["assets/img/shoreline/2026-05-09-1325.jpg",162515],["assets/img/shoreline/2026-05-09-960.avif",34878],["assets/img/shoreline/2026-05-09-960.jpg",93344],["assets/img/shoreline/2026-06-27-1325.avif",47151],["assets/img/shoreline/2026-06-27-1325.jpg",144218],["assets/img/shoreline/2026-06-27-960.avif",27980],["assets/img/shoreline/2026-06-27-960.jpg",81287],["assets/img/shoreline/2026-08-08-1325.avif",63476],["assets/img/shoreline/2026-08-08-1325.jpg",170707],["assets/img/shoreline/2026-08-08-960.avif",37331],["assets/img/shoreline/2026-08-08-960.jpg",97823],["assets/img/shoreline/2026-09-20-1325.avif",50634],["assets/img/shoreline/2026-09-20-1325.jpg",153103],["assets/img/shoreline/2026-09-20-960.avif",31347],["assets/img/shoreline/2026-09-20-960.jpg",87848],["assets/img/video/last-evening-960.avif",28173],["assets/img/video/last-evening-960.jpg",74642],["assets/img/video/opening-960.avif",39655],["assets/img/video/opening-960.jpg",95570],["assets/video/last-evening-hevc.mp4",193730],["assets/video/last-evening.mp4",283398],["assets/video/opening-hevc.mp4",287889],["assets/video/opening.mp4",356614],["icon-192.png",10082],["icon-512.png",29999],["index.html",173511],["manifest.webmanifest",889],["share.jpg",131837]]};
const PREFIX = CONFIG.cache.replace(/-[^-]+$/, "-");
const SCOPE = self.registration.scope;
const url = (path) => new URL(path, SCOPE).href;
const ASSETS = new Map(CONFIG.assets.map(([path, bytes]) => [url(path), bytes]));
const IMG_VARIANT = /-(\d+)\.(avif|webp|jpg)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CONFIG.cache)
      .then((cache) => cache.addAll(CONFIG.core.map((p) => new Request(url(p), { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CONFIG.cache).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  const reply = (msg) => event.source && event.source.postMessage(msg);
  if (type === "vantage:save") event.waitUntil(saveAll(reply));
  if (type === "vantage:status") {
    event.waitUntil(
      caches.open(CONFIG.cache).then(async (cache) => {
        const cached = (await cache.keys()).filter((r) => ASSETS.has(r.url)).length;
        reply({ type: "vantage:status", cached, total: ASSETS.size });
      }),
    );
  }
});

async function saveAll(reply) {
  const cache = await caches.open(CONFIG.cache);
  const totalBytes = [...ASSETS.values()].reduce((a, b) => a + b, 0);
  let done = 0;
  let bytes = 0;
  for (const [href, size] of ASSETS) {
    if (!(await cache.match(href))) {
      try {
        const res = await fetch(href, { cache: "reload" });
        if (res.ok) await cache.put(href, res);
      } catch (err) {
        reply({ type: "vantage:error", url: href, message: String(err) });
        return;
      }
    }
    done += 1;
    bytes += size;
    reply({ type: "vantage:progress", done, total: ASSETS.size, bytes, totalBytes });
  }
  reply({ type: "vantage:saved", total: ASSETS.size, totalBytes });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(SCOPE)) return;
  const href = req.url.split("#")[0].split("?")[0];
  if (req.mode === "navigate" || href === url("./") || href === url("index.html")) {
    event.respondWith(networkFirst(req));
  } else if (req.headers.has("range")) {
    event.respondWith(ranged(req, href));
  } else {
    event.respondWith(cacheFirst(req, href));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CONFIG.cache);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    if (res.ok) await cache.put(url("index.html"), res.clone());
    return res;
  } catch (err) {
    return (await cache.match(url("index.html"))) || (await cache.match(url("./"))) || Response.error();
  }
}

async function cacheFirst(req, href) {
  const cache = await caches.open(CONFIG.cache);
  const hit = await cache.match(href);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200 && ASSETS.has(href)) await cache.put(href, res.clone());
    return res;
  } catch (err) {
    return (await anyVariant(cache, href)) || Response.error();
  }
}

/* Another cached width/format of the same image, largest JPEG first. */
async function anyVariant(cache, href) {
  const m = IMG_VARIANT.exec(href);
  if (!m) return undefined;
  const stem = href.slice(0, m.index);
  const rank = { jpg: 0, webp: 1, avif: 2 };
  const candidates = [...ASSETS.keys()]
    .map((u) => [u, IMG_VARIANT.exec(u)])
    .filter(([u, v]) => v && u.slice(0, v.index) === stem && u !== href)
    .sort(([, a], [, b]) => rank[a[2]] - rank[b[2]] || Number(b[1]) - Number(a[1]));
  for (const [u] of candidates) {
    const hit = await cache.match(u);
    if (hit) return hit;
  }
  return undefined;
}

async function ranged(req, href) {
  const cache = await caches.open(CONFIG.cache);
  const hit = await cache.match(href);
  if (!hit) return fetch(req);
  const blob = await hit.blob();
  const size = blob.size;
  const m = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get("range") || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return new Response(blob, { status: 200, headers: hit.headers });
  let start;
  let end;
  if (m[1] === "") {
    start = Math.max(size - Number(m[2]), 0);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": hit.headers.get("Content-Type") || "video/mp4",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}
