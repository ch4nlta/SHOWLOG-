/* Showlog service worker: app shell works offline, TMDB data stays live. */
const SHELL_CACHE = 'showlog-shell-v1';
const MEDIA_CACHE = 'showlog-media-v1';
const MEDIA_LIMIT = 300;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== MEDIA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MEDIA_LIMIT))) await cache.delete(k);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Own files: try the network first so updates arrive, fall back to cache offline.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(SHELL_CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('index.html')))
    );
    return;
  }

  // Posters and fonts: cache after first load so the diary and watchlist look right offline.
  if (['image.tmdb.org', 'fonts.gstatic.com', 'fonts.googleapis.com'].includes(url.hostname)) {
    e.respondWith(
      caches.open(MEDIA_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          cache.put(req, res.clone()).then(() => trim(cache));
          return res;
        } catch (err) {
          return Response.error();
        }
      })
    );
  }
  // api.themoviedb.org and anything else goes straight to the network.
});
