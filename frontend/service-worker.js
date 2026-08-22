'use strict';

const CACHE = 'aizanoi-os-shell-v4.2.0';
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/assets/branding/aizanoi-logo-mark.svg',
  '/assets/wallpapers/aizanoi-os-sunrise.svg',
  '/styles/tokens.css',
  '/styles/base.css',
  '/styles/shell.css',
  '/styles/components.css',
  '/styles/device-shell.css',
  '/js/v3/main.js',
  '/js/v3/aizanoi-os.js',
  '/js/v3/brand-platform.js',
  '/js/v3/registry.js',
  '/js/v3/store.js',
  '/js/v3/shell.js',
  '/content/news/index.json'
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
      .then((keys) => Promise.all(keys.filter((key) => (key.startsWith('aizanoi-field-shell-') || key.startsWith('aizanoi-os-shell-')) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function sameOriginStatic(request) {
  const url = new URL(request.url);
  return request.method === 'GET' && url.origin === self.location.origin && /\.(?:css|js|mjs|json|svg|png|jpg|jpeg|webp|gif|woff2?)$/i.test(url.pathname);
}

async function networkFirstStatic(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw _;
  }
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

  if (sameOriginStatic(request)) event.respondWith(networkFirstStatic(request));
});
