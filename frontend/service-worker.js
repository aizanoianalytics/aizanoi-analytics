'use strict';

const CACHE = 'aizanoi-field-shell-v3.0.1';
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/assets/branding/aizanoi-logo-mark.svg',
  '/styles/tokens.css',
  '/styles/base.css',
  '/styles/shell.css',
  '/styles/components.css',
  '/styles/apps.css',
  '/js/v3/main.js',
  '/js/v3/registry.js',
  '/js/v3/store.js',
  '/js/v3/shell.js',
  '/js/v3/archive-store.js',
  '/js/v3/apps/archive.js',
  '/js/v3/apps/research.js',
  '/js/v3/apps/monitor.js',
  '/js/v3/apps/terminal.js',
  '/js/v3/apps/projects.js',
  '/js/v3/apps/worlds.js',
  '/js/v3/apps/media.js',
  '/js/v3/apps/games.js'
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
