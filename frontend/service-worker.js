'use strict';

const CACHE = 'aizanoi-os-shell-v4.3.2';
const MAX_RUNTIME_ENTRIES = 24;
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
  '/styles/polish.css',
  '/js/v3/main.js',
  '/js/v3/aizanoi-os.js',
  '/js/v3/brand-platform.js',
  '/js/v3/registry.js',
  '/js/v3/module-registry.generated.js',
  '/js/v3/store.js',
  '/js/v3/shell.js',
  '/news/index.json'
];
const PRECACHE_KEYS = new Set(PRECACHE);
let pruneQueue = Promise.resolve();

async function precacheShell() {
  const cache = await caches.open(CACHE);
  const responses = await Promise.all(PRECACHE.map(async (url) => {
    const response = await fetch(new Request(url, { cache:'reload' }));
    if (!response.ok) throw new Error(`Precache failed for ${url}: ${response.status}`);
    return [url, response];
  }));
  await Promise.all(responses.map(([url, response]) => cache.put(url, response)));
}

self.addEventListener('install', (event) => {
  // Do not force a waiting update over an already-open stateful AizanoiOS tab.
  // First installs still activate normally; upgrades wait for the previous clients
  // to close/reload so one document is never controlled by mixed shell versions.
  event.waitUntil(precacheShell());
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

function requestCacheKey(request) {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}

async function pruneRuntimeCache() {
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  const runtime = keys.filter((key) => !PRECACHE_KEYS.has(requestCacheKey(key)));
  const excess = runtime.length - MAX_RUNTIME_ENTRIES;
  if (excess <= 0) return;
  for (const key of runtime.slice(0, excess)) await cache.delete(key);
}

function schedulePrune() {
  pruneQueue = pruneQueue.then(pruneRuntimeCache, pruneRuntimeCache);
  return pruneQueue;
}

async function cacheNavigation(request, response) {
  if (!response.ok) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
  await schedulePrune();
}

async function networkFirstStatic(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    if (response.ok) await schedulePrune();
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    await cacheNavigation(request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    return cached || caches.match('/');
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (sameOriginStatic(request)) event.respondWith(networkFirstStatic(request));
});