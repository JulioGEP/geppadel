// public/sw.js
const STATIC_CACHE = 'gep-padel-static-v5';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE)); // crea el caché
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // limpia versiones antiguas si las hubiera
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo mismo origen
  if (url.origin !== location.origin) return;

  // Nunca cachear funciones Netlify ni métodos que no sean GET
  if (req.method !== 'GET' || url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(fetch(req));
    return;
  }

  // Estáticos: cache-first
  const isStatic =
    /\.(?:js|css|png|jpg|jpeg|svg|ico|webmanifest|json)$/.test(url.pathname) ||
    url.pathname === '/' ||
    url.pathname.endsWith('/index.html');

  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        const resp = await fetch(req);
        if (resp && resp.ok) {
          // Clonamos UNA vez para guardar
          const clone = resp.clone();
          event.waitUntil(cache.put(req, clone));
        }
        return resp;
      })()
    );
  }
});

