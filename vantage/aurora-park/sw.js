/* Vantage story service worker (template; `vantage build` injects CONFIG).
 *
 * - install: precache the shell (page, fonts, brand, icons, and the opening hero's fallback JPEGs, which
 *   the page shows before this worker is in control); every other file is cached when the page first
 *   asks for it, or all at once by "Save for offline"
 * - one cache per story and scope, kept from deploy to deploy: each file is stored under
 *   `<file>?v=<content hash>`, so an update keeps every file it did not change; activate drops the rest
 * - message {type: "vantage:save"}: cache every remaining file ("Save for offline"), posting
 *   {type: "vantage:progress", done, total, bytes, totalBytes}, then {type: "vantage:saved"}, or
 *   {type: "vantage:error", message} when a file could not be fetched (offline, a 404, a full disk)
 * - {type: "vantage:status"} answers {type: "vantage:status", cached, total}; when an update changed
 *   files of a copy the reader saved, it fetches those instead (posting the save's messages)
 * - the page (./, index.html): network first (3 s), cache fallback; everything else: cache first; a
 *   network response goes to the page at once and is stored as it streams
 * - caches are named per scope, so stories sharing an origin never delete each other's
 * - Range requests (iOS <video>) are answered with 206 slices of the cached file
 * - offline image misses fall back to any cached variant of the same image (another width/format)
 * The page only registers this worker over http(s); it never runs from file://.
 */
"use strict";

const CONFIG = {"cache":"vantage-aurora-park","core":["./","apple-touch-icon.png","assets/brand/logo-on-dark.svg","assets/brand/logo.svg","assets/brand/mark.svg","assets/fonts/libre-franklin-latin-wght-normal.woff2","assets/fonts/newsreader-latin-wght-normal.woff2","assets/img/whole-park/2026-10-12-1783.jpg","icon-192.png","icon-512.png","manifest.webmanifest"],"assets":[["apple-touch-icon.png",9926,"5eeca7c341597284"],["assets/brand/logo-on-dark.svg",10877,"5eb5d3910b16567b"],["assets/brand/logo.svg",10877,"611de88e7ce8a79b"],["assets/brand/mark.svg",10958,"28c85e7852f6ad48"],["assets/fonts/libre-franklin-latin-wght-normal.woff2",29292,"52e605852c72cc2d"],["assets/fonts/newsreader-latin-wght-normal.woff2",58084,"62981321d9a3cc7a"],["assets/img/entrance/2026-03-20-1290.avif",73553,"d0bb913eb56ff53c"],["assets/img/entrance/2026-03-20-1290.jpg",178292,"d851357395c64993"],["assets/img/entrance/2026-03-20-1290.webp",128712,"426c462e4cd55055"],["assets/img/entrance/2026-03-20-1783.avif",119159,"e6cdf1f1e75d9922"],["assets/img/entrance/2026-03-20-1783.jpg",296379,"9df7be55ec24977e"],["assets/img/entrance/2026-03-20-1783.webp",201980,"51f1b20dd94a9330"],["assets/img/entrance/2026-03-20-828.avif",35194,"f0994bd80d0fb1e4"],["assets/img/entrance/2026-03-20-828.jpg",81799,"c50e24d357521f7e"],["assets/img/entrance/2026-03-20-828.webp",63320,"87fd885feed56b20"],["assets/img/entrance/2026-10-12-1290.avif",91547,"600a4d3ed51f5877"],["assets/img/entrance/2026-10-12-1290.jpg",222878,"8f90df233ef8fff4"],["assets/img/entrance/2026-10-12-1290.webp",177966,"ec5a6b8ca8ddaa82"],["assets/img/entrance/2026-10-12-1783.avif",150594,"4265a48490717030"],["assets/img/entrance/2026-10-12-1783.jpg",362300,"afbe0f89d9822a8a"],["assets/img/entrance/2026-10-12-1783.webp",277314,"280313c886a22048"],["assets/img/entrance/2026-10-12-828.avif",43561,"fb861943330e81c8"],["assets/img/entrance/2026-10-12-828.jpg",103808,"043ade0a566b09e8"],["assets/img/entrance/2026-10-12-828.webp",88744,"1f168e27c537a75e"],["assets/img/gatehouse-top/2026-08-17-1290.avif",98889,"59b0c01c0885b97f"],["assets/img/gatehouse-top/2026-08-17-1290.jpg",238463,"ff1a0fca88bd5075"],["assets/img/gatehouse-top/2026-08-17-1290.webp",197024,"bda72e7b936745e8"],["assets/img/gatehouse-top/2026-08-17-1783.avif",167640,"cd71ff6ea5ee5122"],["assets/img/gatehouse-top/2026-08-17-1783.jpg",391801,"c5031fa40288b117"],["assets/img/gatehouse-top/2026-08-17-1783.webp",315884,"e2343d9280e6bc49"],["assets/img/gatehouse-top/2026-08-17-828.avif",44965,"08e14f18203f4201"],["assets/img/gatehouse-top/2026-08-17-828.jpg",107328,"169791915e7122c6"],["assets/img/gatehouse-top/2026-08-17-828.webp",92776,"ae0b80e869159aab"],["assets/img/gatehouse-top/2026-09-14-1290.avif",81206,"ad8bd72d7ee84d7c"],["assets/img/gatehouse-top/2026-09-14-1290.jpg",206360,"4101cd7652a0994f"],["assets/img/gatehouse-top/2026-09-14-1290.webp",153512,"a96fb72727fb701a"],["assets/img/gatehouse-top/2026-09-14-1783.avif",137997,"187d901f7e3074c8"],["assets/img/gatehouse-top/2026-09-14-1783.jpg",343579,"330030729096ee14"],["assets/img/gatehouse-top/2026-09-14-1783.webp",252868,"310cd8388ecf55b7"],["assets/img/gatehouse-top/2026-09-14-828.avif",36732,"65485ecdb0702ec4"],["assets/img/gatehouse-top/2026-09-14-828.jpg",93334,"14c1988f4d887f70"],["assets/img/gatehouse-top/2026-09-14-828.webp",72760,"77fc27692e482c41"],["assets/img/gatehouse-top/2026-10-12-1290.avif",54530,"06b7347f55091108"],["assets/img/gatehouse-top/2026-10-12-1290.jpg",141128,"62998b81ea13c1c0"],["assets/img/gatehouse-top/2026-10-12-1290.webp",79404,"4698c36b7e8c321d"],["assets/img/gatehouse-top/2026-10-12-1783.avif",88468,"7f60a7f7646a469a"],["assets/img/gatehouse-top/2026-10-12-1783.jpg",236458,"7ac7b22252d3d982"],["assets/img/gatehouse-top/2026-10-12-1783.webp",119816,"4cb788e57ce7c164"],["assets/img/gatehouse-top/2026-10-12-828.avif",26894,"2520f80889feca67"],["assets/img/gatehouse-top/2026-10-12-828.jpg",67838,"8bad1a9c6c1e70ad"],["assets/img/gatehouse-top/2026-10-12-828.webp",41244,"f4b18e535752f681"],["assets/img/pier-walk/2026-08-03-1290.avif",121180,"1c7ddf0feb5721eb"],["assets/img/pier-walk/2026-08-03-1290.jpg",281767,"241d536c103de495"],["assets/img/pier-walk/2026-08-03-1290.webp",256670,"912ae24f2f35da6c"],["assets/img/pier-walk/2026-08-03-1783.avif",191085,"4f72b3e5ac29577c"],["assets/img/pier-walk/2026-08-03-1783.jpg",447347,"d9269a6ac7f3e3b2"],["assets/img/pier-walk/2026-08-03-1783.webp",394904,"61d4ee7ec1bceba8"],["assets/img/pier-walk/2026-08-03-828.avif",57369,"4a7a98ebb6e53e22"],["assets/img/pier-walk/2026-08-03-828.jpg",129333,"82aab56e42b80119"],["assets/img/pier-walk/2026-08-03-828.webp",120714,"1d9a43b4236f7344"],["assets/img/pier-walk/2026-10-12-1290.avif",128038,"084381a7c9b6bdd1"],["assets/img/pier-walk/2026-10-12-1290.jpg",296972,"8d8afc0dbd9f0a47"],["assets/img/pier-walk/2026-10-12-1290.webp",273562,"42ccf41a21eaf39d"],["assets/img/pier-walk/2026-10-12-1783.avif",229222,"c6b709ea6a9a60dd"],["assets/img/pier-walk/2026-10-12-1783.jpg",513206,"06e19996d18729c4"],["assets/img/pier-walk/2026-10-12-1783.webp",488374,"5e0ce8d57a9a9bf5"],["assets/img/pier-walk/2026-10-12-828.avif",56731,"85cedc85005bbdf0"],["assets/img/pier-walk/2026-10-12-828.jpg",128770,"b562d429578667c1"],["assets/img/pier-walk/2026-10-12-828.webp",120524,"01f291782e6b9ded"],["assets/img/road-left/2026-03-20-1290.avif",84975,"3a063cbdcd729e9c"],["assets/img/road-left/2026-03-20-1290.jpg",200005,"7bcb25a6c088b409"],["assets/img/road-left/2026-03-20-1290.webp",155486,"f0d49d35d3341e62"],["assets/img/road-left/2026-03-20-1783.avif",145481,"b3d81bd6d13967a6"],["assets/img/road-left/2026-03-20-1783.jpg",335168,"af0afa10d8be2e80"],["assets/img/road-left/2026-03-20-1783.webp",253692,"d0ea79805add49a0"],["assets/img/road-left/2026-03-20-828.avif",39394,"6c12859291fde5ae"],["assets/img/road-left/2026-03-20-828.jpg",90301,"8f291b4bb4332ca3"],["assets/img/road-left/2026-03-20-828.webp",74092,"43d5764c89a04ace"],["assets/img/road-left/2026-10-12-1290.avif",103297,"25abd5c49b1da359"],["assets/img/road-left/2026-10-12-1290.jpg",246770,"d454f3f677228176"],["assets/img/road-left/2026-10-12-1290.webp",208332,"583afffee44d5908"],["assets/img/road-left/2026-10-12-1783.avif",170871,"8e8c43c2ec030f01"],["assets/img/road-left/2026-10-12-1783.jpg",400309,"08f33d075f8aa78b"],["assets/img/road-left/2026-10-12-1783.webp",327550,"845e80ad495dbf6e"],["assets/img/road-left/2026-10-12-828.avif",48463,"fbd1fc4819c12af3"],["assets/img/road-left/2026-10-12-828.jpg",113687,"240fa2b67cd4e748"],["assets/img/road-left/2026-10-12-828.webp",102894,"548f3e61ac8b81c0"],["assets/img/whole-park/2026-03-20-1290.avif",76176,"e5ef01b9dce46769"],["assets/img/whole-park/2026-03-20-1290.jpg",182132,"0194c040b2fbebaa"],["assets/img/whole-park/2026-03-20-1290.webp",135824,"d1f8e590685cd08c"],["assets/img/whole-park/2026-03-20-1783.avif",123983,"e5a63acc75e40a7e"],["assets/img/whole-park/2026-03-20-1783.jpg",300452,"c1df596fda202ad5"],["assets/img/whole-park/2026-03-20-1783.webp",211226,"5bc35eacce273e4e"],["assets/img/whole-park/2026-03-20-828.avif",35972,"4ae6324f5685ada3"],["assets/img/whole-park/2026-03-20-828.jpg",83820,"1733b9cd50f104df"],["assets/img/whole-park/2026-03-20-828.webp",65774,"a78f4c8e00f19ef8"],["assets/img/whole-park/2026-08-03-1290.avif",98912,"01955249555f1a4c"],["assets/img/whole-park/2026-08-03-1290.jpg",237922,"6018bd0aed2e2083"],["assets/img/whole-park/2026-08-03-1290.webp",195178,"cd41266603872c56"],["assets/img/whole-park/2026-08-03-1783.avif",153413,"1776a2616e0f879a"],["assets/img/whole-park/2026-08-03-1783.jpg",375472,"caa7787d028fd3df"],["assets/img/whole-park/2026-08-03-1783.webp",283156,"7e7f775c5b63f266"],["assets/img/whole-park/2026-08-03-828.avif",48631,"c64be5602e1d9f31"],["assets/img/whole-park/2026-08-03-828.jpg",114793,"14e36d3772679e79"],["assets/img/whole-park/2026-08-03-828.webp",102474,"5b96ad994aaa7374"],["assets/img/whole-park/2026-08-17-1290.avif",93137,"d3fa6d736ab8b874"],["assets/img/whole-park/2026-08-17-1290.jpg",226388,"7e4503d20f243886"],["assets/img/whole-park/2026-08-17-1290.webp",177512,"d745154f586ca732"],["assets/img/whole-park/2026-08-17-1783.avif",148484,"0ff62820639684ce"],["assets/img/whole-park/2026-08-17-1783.jpg",361828,"4504379a8ce3fb3a"],["assets/img/whole-park/2026-08-17-1783.webp",266368,"f8ff481ad791d9ae"],["assets/img/whole-park/2026-08-17-828.avif",45982,"29124779c36690fa"],["assets/img/whole-park/2026-08-17-828.jpg",107481,"b3ab14b7676e4c95"],["assets/img/whole-park/2026-08-17-828.webp",93132,"c5070141882ad1dc"],["assets/img/whole-park/2026-10-12-1290.avif",97992,"8d29cd1e2b21ec87"],["assets/img/whole-park/2026-10-12-1290.jpg",237113,"b69ade6f8f63a9b8"],["assets/img/whole-park/2026-10-12-1290.webp",193074,"64df0df2a83ec062"],["assets/img/whole-park/2026-10-12-1783.avif",163473,"30fdeb66d50a10b9"],["assets/img/whole-park/2026-10-12-1783.jpg",387043,"529179d9c676b89d"],["assets/img/whole-park/2026-10-12-1783.webp",302786,"3240b389682051a7"],["assets/img/whole-park/2026-10-12-828.avif",46162,"b9f3e3e67c02c164"],["assets/img/whole-park/2026-10-12-828.jpg",109588,"b8187883969b5548"],["assets/img/whole-park/2026-10-12-828.webp",96366,"e0e6b9ded6c027fe"],["icon-192.png",10589,"2d02243581e727ff"],["icon-512.png",29745,"d66752cf4c9e67d7"],["index.html",258861,"2a60a64d5da4f5de"],["manifest.webmanifest",680,"0091e87012f97da7"],["share.jpg",225220,"ae97947c2022251a"]]};
const SCOPE = self.registration.scope;
const CACHE = `${CONFIG.cache} ${SCOPE}`;
const url = (path) => new URL(path, SCOPE).href;
const ASSETS = new Map(CONFIG.assets.map(([path, bytes]) => [url(path), bytes]));
const KEYS = new Map(CONFIG.assets.map(([path, , sha]) => [url(path), `${url(path)}?v=${sha}`]));
const key = (href) => KEYS.get(href) || href;
const SAVED = url(".vantage-saved"); // stored once the reader has saved the whole story
const IMG_VARIANT = /-(\d+)\.(avif|webp|jpg)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          CONFIG.core.map(async (path) => {
            const href = url(path);
            if (KEYS.has(href) && (await cache.match(KEYS.get(href)))) return; // unchanged since the last deploy
            const res = await fetch(href, { cache: "reload" });
            if (!res.ok) throw new Error(`${res.status} ${href}`);
            await cache.put(key(href), res);
          }),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("vantage-") && k.endsWith(` ${SCOPE}`) && k !== CACHE).map((k) => caches.delete(k)));
      // Files this deploy changed or dropped.
      const live = new Set([...KEYS.values(), url("./"), SAVED]);
      const cache = await caches.open(CACHE);
      await Promise.all((await cache.keys()).filter((r) => !live.has(r.url)).map((r) => cache.delete(r)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  const reply = (msg) => event.source && event.source.postMessage(msg);
  if (type === "vantage:save") event.waitUntil(save(reply));
  if (type === "vantage:status") event.waitUntil(status(reply));
});

let saving = null; // one save at a time
const save = (reply) => (saving = saving || saveAll(reply).finally(() => (saving = null)));

async function status(reply) {
  const cache = await caches.open(CACHE);
  const have = new Set((await cache.keys()).map((r) => r.url));
  const cached = [...KEYS.values()].filter((k) => have.has(k)).length;
  // Saved before an update changed some files: fetch just those, so the copy stays whole offline.
  if (cached < KEYS.size && have.has(SAVED)) return save(reply);
  reply({ type: "vantage:status", cached, total: KEYS.size });
}

async function saveAll(reply) {
  const cache = await caches.open(CACHE);
  const totalBytes = [...ASSETS.values()].reduce((a, b) => a + b, 0);
  let done = 0;
  let bytes = 0;
  let failed = 0;
  for (const [href, size] of ASSETS) {
    if (!(await cache.match(key(href)))) {
      try {
        const res = await fetch(href, { cache: "reload" });
        if (res.ok) await cache.put(key(href), res);
        else failed += 1; // a 404 or 5xx: the copy is not whole, so it is never called saved
      } catch (err) {
        reply({ type: "vantage:error", url: href, message: String(err) });
        return;
      }
    }
    done += 1;
    bytes += size;
    reply({ type: "vantage:progress", done, total: ASSETS.size, bytes, totalBytes });
  }
  if (failed) {
    reply({ type: "vantage:error", message: `${failed} of ${ASSETS.size} files could not be downloaded` });
    return;
  }
  await cache.put(SAVED, new Response(""));
  reply({ type: "vantage:saved", total: ASSETS.size, totalBytes });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(SCOPE)) return;
  const href = req.url.split("#")[0].split("?")[0];
  const stores = [];
  const store = (put) => stores.push(put.catch(() => {}));
  const res =
    href === url("./") || href === url("index.html")
      ? networkFirst(req, store)
      : req.headers.has("range")
        ? ranged(req, href)
        : cacheFirst(req, href, store);
  event.respondWith(res);
  event.waitUntil(res.then(() => Promise.all(stores), () => {})); // copies finish after the page has its answer
});

async function networkFirst(req, store) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    if (res.ok) store(cache.put(url("./"), res.clone()));
    return res;
  } catch (err) {
    return unredirect((await cache.match(url("./"))) || (await cache.match(key(url("index.html"))))) || Response.error();
  }
}

/* WebKit fails a navigation answered with a redirected response ("Response served by service worker
 * has redirections"); hosts that redirect index.html to ./ (Cloudflare Pages) leave one in the cache. */
function unredirect(res) {
  if (!res || !res.redirected) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function cacheFirst(req, href, store) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key(href));
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200 && ASSETS.has(href)) store(cache.put(key(href), res.clone()));
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
    const hit = await cache.match(key(u));
    if (hit) return hit;
  }
  return undefined;
}

async function ranged(req, href) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key(href));
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
