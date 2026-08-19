'use strict';

const CACHE = 'aizanoi-field-shell-v2.1.1';
/* Keep install cheap. Once the worker controls the next visit, same-origin static
 * assets are populated into the runtime cache as they are actually requested. */
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/assets/branding/aizanoi-logo-mark.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('aizanoi-field-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

function isStaticAsset(request) {
  const url = new URL(request.url);
  return request.method === 'GET' && url.origin === self.location.origin && /\.(?:css|js|svg|png|jpg|jpeg|webp|gif|woff2?)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && url.pathname === '/') {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put('/', copy)).catch(() => {});
      }
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match('/'))));
    return;
  }

  if (isStaticAsset(request)) {
    event.respondWith(caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    }));
  }
});