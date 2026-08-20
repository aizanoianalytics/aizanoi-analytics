'use strict';

const CACHE = 'aizanoi-field-shell-v3.0.1';
// Keep install lightweight: only the core shell is precached. App presentation,
// research modules and Historical Worlds remain network-lazy and are cached by
// the runtime strategy after the visitor actually opens them.
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/assets/branding/aizanoi-logo-mark.svg',
  '/styles/tokens.css',
  '/styles/base.css',
  '/styles/shell.css',
  '/styles/components.css',
  '/js/v3/main.js',
  '/js/v3/registry.js',
  '/js/v3/store.js',
  '/js/v3/shell.js'
];

async function precacheShell() {
  const cache = await caches.open(CACHE);
  for (const url of PRECACHE) {
    const response = await fetch(new Request(url, { cache:'reload' }));
    if (!response.ok) throw new Error(`Precache failed for ${url}: ${response.status}`);
    await cache.put(url, response);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('aizanoi-field-shell-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function sameOriginStatic(request) {
  const url = new URL(request.url);
  return request.method === 'GET' && url.origin === self.location.origin && /\.(?:css|js|mjs|svg|png|jpg|jpeg|webp|gif|woff2?)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok && url.pathname === '/') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy)).catch(() => {});
        }
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  if (sameOriginStatic(request)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});
