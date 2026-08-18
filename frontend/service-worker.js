'use strict';

const CACHE = 'aizanoi-field-shell-v2.1';
const PRECACHE = [
  '/',
  '/css/os-aizanoi-next.css','/css/os-field-bridges.css','/css/os-distribution.css','/css/os-distribution-panels.css','/css/os-workbench-archive.css','/css/os-workbench-interactions.css','/css/os-workbench-research.css','/css/os-distribution-polish.css',
  '/js/os-state.js','/js/os-shell.js','/js/os-intent.js','/js/os-platform.js','/js/os-archive.js','/js/os-workbench.js','/js/os-workbench-archive.js','/js/os-workbench-readers.js','/js/os-workbench-data.js','/js/os-workbench-shell.js',
  '/assets/branding/aizanoi-logo-mark.svg','/assets/wallpapers/aizanoi-synthesis.svg','/assets/icons/field-archive.svg','/assets/icons/data-lab.svg','/assets/icons/source-reader.svg','/assets/icons/artifact-viewer.svg','/assets/icons/workspace-monitor.svg'
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