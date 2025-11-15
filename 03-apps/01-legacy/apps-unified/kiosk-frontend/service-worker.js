// Minimal service worker for offline shell caching (DEV-friendly)
const CACHE_NAME = 'kiosk-shell-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/assets/icons/credit-card.svg',
  '/assets/icons/engine.svg',
  '/assets/icons/gauge.svg',
  '/assets/icons/paint.svg',
  '/assets/icons/mail.svg',
  '/assets/icons/lock.svg',
  '/assets/icons/phone.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const resClone = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
