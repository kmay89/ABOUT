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

const CONFIG = {"cache":"vantage-demo-lakeside","core":["./","apple-touch-icon.png","assets/brand/logo-on-dark.svg","assets/brand/logo.svg","assets/brand/mark.svg","assets/brand/partners/city-of-lakeside-on-dark.svg","assets/brand/partners/city-of-lakeside.svg","assets/brand/partners/field-and-form-on-dark.svg","assets/brand/partners/field-and-form.svg","assets/brand/partners/northcoast-builders-on-dark.svg","assets/brand/partners/northcoast-builders.svg","assets/fonts/fraunces-latin-opsz-normal.woff2","assets/fonts/inter-latin-opsz-normal.woff2","assets/img/overview/2026-09-20-1600.jpg","assets/img/video/opening-1600.jpg","icon-192.png","icon-512.png","manifest.webmanifest"],"assets":[["apple-touch-icon.png",9418,"49ae2dfd36698496"],["assets/brand/logo-on-dark.svg",2056,"25c6b3f593f42bc3"],["assets/brand/logo.svg",2056,"60a185eaf9859b14"],["assets/brand/mark.svg",394,"109a2d272bcd1a7b"],["assets/brand/partners/city-of-lakeside-on-dark.svg",1542,"1258591eb024d5ab"],["assets/brand/partners/city-of-lakeside.svg",1542,"61b4954ca5fd3df2"],["assets/brand/partners/field-and-form-on-dark.svg",1813,"3e3f660ced47436a"],["assets/brand/partners/field-and-form.svg",1813,"4f20c6b9c2dc7550"],["assets/brand/partners/northcoast-builders-on-dark.svg",1731,"7f4142a711a11b21"],["assets/brand/partners/northcoast-builders.svg",1731,"bbcc9d4d43acdc19"],["assets/fonts/fraunces-latin-opsz-normal.woff2",67304,"7234ed860a9cc830"],["assets/fonts/inter-latin-opsz-normal.woff2",72920,"2c295d99e26dcf35"],["assets/img/overview/2025-04-12-1600.avif",99279,"f96175343ea5a988"],["assets/img/overview/2025-04-12-1600.jpg",263462,"20502a408dd1f4ac"],["assets/img/overview/2025-04-12-2488.avif",182480,"34b80ab7f2a30ac8"],["assets/img/overview/2025-04-12-2488.jpg",530438,"4ac69f3135b8de36"],["assets/img/overview/2025-04-12-960.avif",47820,"c7cf5f44c1f32ed6"],["assets/img/overview/2025-04-12-960.jpg",115269,"beb11edad3e4eb32"],["assets/img/overview/2025-05-30-1600.avif",98249,"b508260cc7fdb6c2"],["assets/img/overview/2025-05-30-1600.jpg",265845,"98395d221f189416"],["assets/img/overview/2025-05-30-2488.avif",180495,"7aad52fef1eacb42"],["assets/img/overview/2025-05-30-2488.jpg",528343,"55a6075f7cd7bca5"],["assets/img/overview/2025-05-30-960.avif",47772,"670e195d7f5e3f23"],["assets/img/overview/2025-05-30-960.jpg",117719,"f50481669dbaa0c1"],["assets/img/overview/2025-07-18-1600.avif",99184,"1ddecdf9b8d5d25c"],["assets/img/overview/2025-07-18-1600.jpg",259039,"ac97061487b5f93a"],["assets/img/overview/2025-07-18-2488.avif",183667,"731f9b84a3276f42"],["assets/img/overview/2025-07-18-2488.jpg",520992,"2e7e75ee3459f719"],["assets/img/overview/2025-07-18-960.avif",48128,"91b8e1d29f974b1a"],["assets/img/overview/2025-07-18-960.jpg",113343,"d55cedce19afb1fd"],["assets/img/overview/2025-09-05-1600.avif",101455,"ca4a1b3404a28eb8"],["assets/img/overview/2025-09-05-1600.jpg",264273,"1b7fe21fa189ef19"],["assets/img/overview/2025-09-05-2488.avif",197285,"d3eb2ce9f1bc9277"],["assets/img/overview/2025-09-05-2488.jpg",559016,"51910008ebaf7ca8"],["assets/img/overview/2025-09-05-960.avif",47930,"51de205120536ca9"],["assets/img/overview/2025-09-05-960.jpg",112994,"78bf21b38480f056"],["assets/img/overview/2025-10-24-1600.avif",86562,"3e58f0b46c23f478"],["assets/img/overview/2025-10-24-1600.jpg",234894,"3514f5136e679b38"],["assets/img/overview/2025-10-24-2488.avif",161996,"10e3ef9544fc95a6"],["assets/img/overview/2025-10-24-2488.jpg",479989,"f9f29e5eb5b00305"],["assets/img/overview/2025-10-24-960.avif",42104,"a7459310c8b3c269"],["assets/img/overview/2025-10-24-960.jpg",103021,"df62878879c434dc"],["assets/img/overview/2025-12-12-1600.avif",100354,"bcb1408a2ad3c822"],["assets/img/overview/2025-12-12-1600.jpg",268425,"8d35db6758c75e79"],["assets/img/overview/2025-12-12-2488.avif",190465,"df4c6d2ad38182bc"],["assets/img/overview/2025-12-12-2488.jpg",558835,"133ad276390057e0"],["assets/img/overview/2025-12-12-960.avif",48417,"5b45f43fedc7f550"],["assets/img/overview/2025-12-12-960.jpg",118019,"d18bdd0958e6d37d"],["assets/img/overview/2026-01-31-1600.avif",110490,"035bdd156f564aef"],["assets/img/overview/2026-01-31-1600.jpg",294835,"035ed819ba839954"],["assets/img/overview/2026-01-31-2488.avif",208544,"e91d10addea16361"],["assets/img/overview/2026-01-31-2488.jpg",601487,"c5645100673b84cf"],["assets/img/overview/2026-01-31-960.avif",53078,"b66cf99f25012428"],["assets/img/overview/2026-01-31-960.jpg",130557,"1ab6dd811a8f1de9"],["assets/img/overview/2026-03-21-1600.avif",87214,"5b936df775d09034"],["assets/img/overview/2026-03-21-1600.jpg",240295,"84af1533e9dcf9f4"],["assets/img/overview/2026-03-21-2488.avif",159321,"6c8fabbf5b733257"],["assets/img/overview/2026-03-21-2488.jpg",480074,"4b857498ca2595c6"],["assets/img/overview/2026-03-21-960.avif",42543,"6233b91d939d3ca2"],["assets/img/overview/2026-03-21-960.jpg",107415,"ec92efe5644ad8b3"],["assets/img/overview/2026-05-09-1600.avif",83830,"8789db7c6efe6902"],["assets/img/overview/2026-05-09-1600.jpg",231609,"bc2a9fced610ca9d"],["assets/img/overview/2026-05-09-2488.avif",165205,"794e781486e5d981"],["assets/img/overview/2026-05-09-2488.jpg",499261,"480a90f3078741f9"],["assets/img/overview/2026-05-09-960.avif",38913,"710a1950731a6e87"],["assets/img/overview/2026-05-09-960.jpg",99866,"fe1ef46867615a0d"],["assets/img/overview/2026-06-27-1600.avif",80053,"b1f03e2b22a5efe0"],["assets/img/overview/2026-06-27-1600.jpg",223742,"626251e4839f7dfa"],["assets/img/overview/2026-06-27-2488.avif",164828,"644070501db65d7d"],["assets/img/overview/2026-06-27-2488.jpg",495388,"b8b99629d20eee9c"],["assets/img/overview/2026-06-27-960.avif",37634,"8258c74e946350e6"],["assets/img/overview/2026-06-27-960.jpg",95772,"9aed2ef75a3f35c7"],["assets/img/overview/2026-08-08-1600.avif",78518,"c7229654df49ae49"],["assets/img/overview/2026-08-08-1600.jpg",216258,"a819d81cc340ea81"],["assets/img/overview/2026-08-08-2488.avif",158760,"da64e39b35bf9ff2"],["assets/img/overview/2026-08-08-2488.jpg",477674,"ca764109fd5c82b7"],["assets/img/overview/2026-08-08-960.avif",36785,"651acd67e1fafcc4"],["assets/img/overview/2026-08-08-960.jpg",92310,"7b65a39fdc61a278"],["assets/img/overview/2026-09-20-1600.avif",89562,"d30199dbcba75b92"],["assets/img/overview/2026-09-20-1600.jpg",238069,"52d685599d1c74be"],["assets/img/overview/2026-09-20-2488.avif",177914,"feba7ddd9d6f6c3c"],["assets/img/overview/2026-09-20-2488.jpg",517505,"96b7b49a2040d660"],["assets/img/overview/2026-09-20-960.avif",43052,"814655b33b4b2c19"],["assets/img/overview/2026-09-20-960.jpg",103291,"e6602c92411950d9"],["assets/img/shoreline/2025-04-12-1600.avif",126670,"7a17ec4918fb6e4a"],["assets/img/shoreline/2025-04-12-1600.jpg",312792,"1fa61024c5dd2890"],["assets/img/shoreline/2025-04-12-2560.avif",256327,"9d240baa07704407"],["assets/img/shoreline/2025-04-12-2560.jpg",680687,"5dbed7ed0934b95d"],["assets/img/shoreline/2025-04-12-960.avif",52866,"7bf86f2b6aa6ae7b"],["assets/img/shoreline/2025-04-12-960.jpg",124733,"0630ac6ce94b9c08"],["assets/img/shoreline/2025-05-30-1600.avif",70375,"cdcd85a8e717629c"],["assets/img/shoreline/2025-05-30-1600.jpg",209338,"3e75f566672b712f"],["assets/img/shoreline/2025-05-30-2560.avif",146801,"f23f0f64235d6c29"],["assets/img/shoreline/2025-05-30-2560.jpg",462544,"93fc3fdd7951aab1"],["assets/img/shoreline/2025-05-30-960.avif",32606,"c33a4b1a09713f16"],["assets/img/shoreline/2025-05-30-960.jpg",89133,"0602457db72694ca"],["assets/img/shoreline/2025-07-18-1600.avif",92213,"5b9813434bdc5fa5"],["assets/img/shoreline/2025-07-18-1600.jpg",240353,"88100404a2a7153b"],["assets/img/shoreline/2025-07-18-2560.avif",187569,"d9627aa7a8399140"],["assets/img/shoreline/2025-07-18-2560.jpg",535863,"65f48dc06045cc24"],["assets/img/shoreline/2025-07-18-960.avif",40787,"9c12feae04675c2b"],["assets/img/shoreline/2025-07-18-960.jpg",98800,"6b8d80cb7d725922"],["assets/img/shoreline/2025-09-05-1600.avif",109399,"a2f98e097e60ccb9"],["assets/img/shoreline/2025-09-05-1600.jpg",272198,"d038b76a150b830b"],["assets/img/shoreline/2025-09-05-2560.avif",228078,"5bbdef6cbe7ec955"],["assets/img/shoreline/2025-09-05-2560.jpg",613091,"baadf0b7a060d416"],["assets/img/shoreline/2025-09-05-960.avif",45647,"a2653fac3ddcf6ea"],["assets/img/shoreline/2025-09-05-960.jpg",107802,"417b8afcb8ab96ae"],["assets/img/shoreline/2025-10-24-1600.avif",76861,"8657591eeff4c3d5"],["assets/img/shoreline/2025-10-24-1600.jpg",215022,"5aa397f49551067d"],["assets/img/shoreline/2025-10-24-2560.avif",156328,"0a4554d1169d5d00"],["assets/img/shoreline/2025-10-24-2560.jpg",489196,"ca915a5e87d705bc"],["assets/img/shoreline/2025-10-24-960.avif",34418,"112fb6ec3c3905d2"],["assets/img/shoreline/2025-10-24-960.jpg",88465,"377b69a72653539d"],["assets/img/shoreline/2025-12-12-1600.avif",66064,"535dcff896702703"],["assets/img/shoreline/2025-12-12-1600.jpg",194812,"0ab009ed66bd72ff"],["assets/img/shoreline/2025-12-12-2560.avif",128296,"0b14a750876be76d"],["assets/img/shoreline/2025-12-12-2560.jpg",438520,"646640fb9b2b559c"],["assets/img/shoreline/2025-12-12-960.avif",32883,"441301a9be255408"],["assets/img/shoreline/2025-12-12-960.jpg",86169,"86fefb6e2433a0f2"],["assets/img/shoreline/2026-01-31-1600.avif",71020,"d8ed094ad7b9d7fa"],["assets/img/shoreline/2026-01-31-1600.jpg",209897,"32d59de64b3c79a4"],["assets/img/shoreline/2026-01-31-2560.avif",135263,"f89ca5858b622d96"],["assets/img/shoreline/2026-01-31-2560.jpg",451903,"d383a25b6afeaf8e"],["assets/img/shoreline/2026-01-31-960.avif",35724,"2e9970a551a9c810"],["assets/img/shoreline/2026-01-31-960.jpg",94604,"36d93f7cb52cc8a3"],["assets/img/shoreline/2026-03-21-1600.avif",96564,"db624910e71383e6"],["assets/img/shoreline/2026-03-21-1600.jpg",253937,"d7d4123f15247d56"],["assets/img/shoreline/2026-03-21-2560.avif",176940,"f3f5d9b3c938be1a"],["assets/img/shoreline/2026-03-21-2560.jpg",519589,"cf8eb059c2055e98"],["assets/img/shoreline/2026-03-21-960.avif",45117,"ecb3102510f31c9f"],["assets/img/shoreline/2026-03-21-960.jpg",109941,"37a5285bf57a5c8a"],["assets/img/shoreline/2026-05-09-1600.avif",72890,"9573875a4d7a5be9"],["assets/img/shoreline/2026-05-09-1600.jpg",207157,"9064210d07ac6a1a"],["assets/img/shoreline/2026-05-09-2560.avif",147050,"f2eb2afa5886a7f9"],["assets/img/shoreline/2026-05-09-2560.jpg",466278,"80707ceb019e5429"],["assets/img/shoreline/2026-05-09-960.avif",33197,"69a137bffbcf4d60"],["assets/img/shoreline/2026-05-09-960.jpg",89266,"0dc4cb8c6db46bdf"],["assets/img/shoreline/2026-06-27-1600.avif",55515,"4a473fd8b8f67be0"],["assets/img/shoreline/2026-06-27-1600.jpg",174934,"160d92db52f8d477"],["assets/img/shoreline/2026-06-27-2560.avif",114242,"32ccd724f90104c9"],["assets/img/shoreline/2026-06-27-2560.jpg",412021,"621301e2e995e773"],["assets/img/shoreline/2026-06-27-960.avif",27472,"051714f96073deae"],["assets/img/shoreline/2026-06-27-960.jpg",77589,"579568a0c7051ee1"],["assets/img/shoreline/2026-08-08-1600.avif",78471,"747cb9df11b6eda9"],["assets/img/shoreline/2026-08-08-1600.jpg",216576,"c86bedf22afc5bcc"],["assets/img/shoreline/2026-08-08-2560.avif",162247,"598a426518e4539b"],["assets/img/shoreline/2026-08-08-2560.jpg",491133,"f05b83819d517b36"],["assets/img/shoreline/2026-08-08-960.avif",34912,"ec677b94d373530b"],["assets/img/shoreline/2026-08-08-960.jpg",91691,"990cf4f960533194"],["assets/img/shoreline/2026-09-20-1600.avif",61853,"eb8893207e3b6a07"],["assets/img/shoreline/2026-09-20-1600.jpg",186229,"d6a4a57d1f13220d"],["assets/img/shoreline/2026-09-20-2560.avif",119034,"3e234ce90a5202a7"],["assets/img/shoreline/2026-09-20-2560.jpg",421229,"63093693d3399495"],["assets/img/shoreline/2026-09-20-960.avif",31259,"ac4d1eaff830fb44"],["assets/img/shoreline/2026-09-20-960.jpg",85514,"8c702cbcdc01fc53"],["assets/img/video/last-evening-1600.avif",62484,"cff5d542eb4bd111"],["assets/img/video/last-evening-1600.jpg",184670,"f7bd1d1a7f92134d"],["assets/img/video/last-evening-1920.avif",83389,"6cd08e270a56cfeb"],["assets/img/video/last-evening-1920.jpg",256109,"0a9b9e47163f2a69"],["assets/img/video/last-evening-960.avif",29881,"b87919e4a941026b"],["assets/img/video/last-evening-960.jpg",79239,"9ccb9a868c7cb395"],["assets/img/video/opening-1600.avif",85417,"de4a51387e93d201"],["assets/img/video/opening-1600.jpg",225442,"d222194d545be1d1"],["assets/img/video/opening-1920.avif",114442,"4da6bfeb76152dd4"],["assets/img/video/opening-1920.jpg",312270,"4a279e67b480cfd4"],["assets/img/video/opening-960.avif",39171,"1e559763e1e2506d"],["assets/img/video/opening-960.jpg",96581,"85e30774a45dd8ab"],["assets/video/last-evening-hevc.mp4",502153,"378340d8ba5dd92c"],["assets/video/last-evening.mp4",1285867,"6079458dd3e99394"],["assets/video/opening-hevc.mp4",875262,"a7c6f0ebc2a37f1e"],["assets/video/opening.mp4",1734317,"98170966c8d34500"],["icon-192.png",10082,"dfec5de649eb5c49"],["icon-512.png",29999,"d7890cb6d8d54e0c"],["index.html",317270,"5fd1c9878f1a85d2"],["manifest.webmanifest",828,"b25ee9bf603a88b9"],["share.jpg",126102,"18d63330e81820ba"]]};
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
