// service-worker.js — Career-Ops Dashboard PWA
// Strategy: cache-first for static shell + assets, network-first for /api/*.

const CACHE = 'career-ops-v2';
const SHELL = [
  '/',
  '/manifest.json',
  '/assets/favicon.svg',
  '/assets/favicon-16.png',
  '/assets/favicon-32.png',
  '/assets/favicon-180.png',
  '/assets/favicon-192.png',
  '/assets/favicon-512.png',
  // iOS PWA splash screens — install-time precache so the standalone
  // launch animation is instant on first cold boot. Other splash sizes
  // are fetched lazily on demand and cached by the catch-all handler.
  '/assets/splash-1290x2796.png',
  '/assets/splash-1179x2556.png',
  '/assets/splash-1170x2532.png',
  '/assets/splash-1125x2436.png',
  '/assets/splash-828x1792.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for API — data must be fresh, fall back to cache offline.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for static assets and the app shell.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && (url.pathname.startsWith('/assets/') || url.pathname === '/' || url.pathname === '/manifest.json' || url.pathname === '/service-worker.js')) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
