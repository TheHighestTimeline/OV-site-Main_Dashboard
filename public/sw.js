// Minimal service worker (2026-07 audit §3.3) — exists to make the dashboard
// installable as a PWA. Deliberately NETWORK-FIRST with no precache: an
// internal tool must never serve stale app code. Only same-origin GET
// navigations fall back to a cached shell when offline.
const SHELL_CACHE = 'ovmg-shell-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Navigations: network first, cache the shell as offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/'))
    );
  }
  // Everything else (hashed assets, functions) goes straight to the network.
});
