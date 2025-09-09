// public/sw.js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Nunca cachear Functions
  if (url.pathname.startsWith('/.netlify/functions/')) {
    return; // deja que vaya directo a red
  }
  // Para el resto, network-first muy simple (o ni interceptes)
});
