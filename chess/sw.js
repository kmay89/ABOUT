/* The Chess Room service worker — offline play + the update whisper.
   Bump VERSION with every release: the changed byte triggers the
   browser's update check, which shows players the in-app refresh bar.
   Pattern proven in HIVEMIND; scoped here to /chess/.

   One release, one cache, served whole.

   The page and its scripts are one program written in two files, and
   they only work as the pair they were released as: a new index.html
   with last week's app.js is a room whose buttons call functions that
   aren't there. This worker used to fetch the page from the network
   (so a deploy showed up at once) while answering the scripts from the
   versioned cache — which, for every player, for the first visit after
   every release, was exactly that mismatched pair, until they found
   the update bar and tapped it.

   So now the page comes from the same place the scripts do: the cache
   of the worker that is in charge. A release reaches a player like
   this —

     1. they open the room; the worker in charge serves the old page
        and the old scripts, together, from its own cache;
     2. the browser notices sw.js has changed, and the new worker
        installs beside the old one, downloading a complete fresh
        shell into a cache of its own (never from the HTTP cache —
        see install below), then waits;
     3. the page sees a worker waiting and shows the update bar
        (app.js wireSW); tapping it sends SKIP_WAITING;
     4. the new worker takes over, clears the old cache, and the page
        reloads on controllerchange — into the new page with the new
        scripts, both from the new cache.

   The trade-off, chosen on purpose: a deploy reaches a player one
   visit late (or one tap late) instead of at once, and a release that
   forgets to bump VERSION reaches nobody at all, because nothing tells
   the browser there is anything to fetch. In exchange the room is
   never half one version and half another — and it opens instantly,
   on a train or not, because the page never waits on the network.

   A first-ever visit has no worker in charge yet, so the browser
   fetches everything straight from the network as usual; this worker
   installs behind it, and claims the page so the room works offline
   from then on. */
const VERSION = '2026.10.18.2';
const CACHE = 'chessroom-' + VERSION;
const SHELL = [
  './', './index.html',
  './engine.js', './brain.js', './brain-worker.js', './book.js', './eco.js', './teach.js', './learn.js', './skins.js', './lines.js', './motion.js', './sound.js',
  './gfx2d.js', './gfx3d.js', './pieces3d.js', './pieces-classic.js', './room.js', './net.js', './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

/* Where the room lives, worked out from where this file sits rather
   than written down, so a fork that moves the folder keeps working.
   The app shell is the folder itself and its index.html, with any query
   ignored (a link like ./?room=BUZZ is still the room). Every other page
   in the folder — the README, the tools, a 404 — is someone else's
   business, and must never be mistaken for the shell.
   It is worked out on first use rather than the moment this file loads:
   tools/room-parity.js runs every room's worker in a bare sandbox to
   watch it install and activate, and a sandbox has no location to work
   it out from. */
let room = null;
const roomURL = () => room || (room = new URL('./', self.location));
function isShellPage(url) {
  const r = roomURL();
  return url.origin === r.origin && (url.pathname === r.pathname || url.pathname === r.pathname + 'index.html');
}

self.addEventListener('install', (e) => {
  /* cache: 'reload' sends every request to the server, past the
     browser's HTTP cache. Without it a new worker can fill its brand-new
     cache with copies the browser already had lying about — last
     release's app.js filed under this release's name — and the mismatch
     this file exists to prevent comes back, now permanently.
     addAll is all-or-nothing: if one file fails, the install fails, the
     old version carries on serving, and the browser tries again on the
     next visit. A half-filled shell is never put in charge. */
  e.waitUntil(caches.open(CACHE).then((c) =>
    c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('chessroom-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data && e.data.type === 'GET_VERSION' && e.ports && e.ports[0]) e.ports[0].postMessage({ version: VERSION });
});

/* A response that arrived by way of a redirect may not answer a
   navigation: Chrome refuses it and shows its own error page instead of
   the room. Some hosts redirect ./index.html to ./ ("pretty URLs"), so
   the copy addAll stored can be exactly that. Re-wrapping the body in a
   fresh Response drops the redirect history and keeps everything else. */
function navigable(res) {
  if (!res.redirected) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

/* The shell, from the cache of the worker in charge — the same cache
   its scripts come from, so the two always match. The network is only
   asked when the shell somehow isn't there; what it returns is kept
   only if it is a real, successful copy of the shell. */
async function shellPage(req) {
  const cache = await caches.open(CACHE);
  const hit = (await cache.match('./index.html')) || (await cache.match('./'));
  if (hit) return navigable(hit);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put('./index.html', res.clone()).catch(() => {});
    return res;
  } catch (err) {
    return Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    /* The room itself: cache-first, for the reasons at the top. Any other
       page in the folder goes to the network untouched — it isn't the
       shell, so it can neither be served as one nor written over one. */
    if (isShellPage(url)) e.respondWith(shellPage(req));
    return;
  }

  /* Only the room's own folder is ours to keep. A same-origin request
     outside it — the site's room mailbox at /api/room, which is polled
     every couple of seconds with a fresh cache-busting query each time —
     would otherwise be stored once per poll, for ever, in a cache that
     only shrinks when the next release replaces it. Anything that asks
     not to be stored is taken at its word, too. */
  if (!url.pathname.startsWith(roomURL().pathname) || req.cache === 'no-store') return;

  // Everything else: cache-first (the shell is versioned; a new version
  // means a new cache, so stale files can't outlive a release).
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) await cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
