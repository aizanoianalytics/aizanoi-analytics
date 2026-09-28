import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const release = readFileSync('frontend/release.js', 'utf8');
const serviceWorker = readFileSync('frontend/service-worker.js', 'utf8');
const CURRENT_CACHE = release.match(/CACHE:\s*'([^']+)'/)?.[1];
assert.ok(CURRENT_CACHE, 'release.js must declare CACHE');

// Keep in sync with the service worker's own denylist.
const RETIRED = (serviceWorker.match(/const RETIRED_PATHS=\[([^\]]*)\]/)?.[1] || '')
  .split(',').map((entry) => entry.trim().replace(/^'|'$/g, '')).filter(Boolean);
const RETIRED_ROUTE = '/analytics/dashboards/hr-analytics-full-set/';
const RETIRED_LEGACY_CACHE = 'aizanoi-os-shell-v4.5.4';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: 'allow' });
const page = await context.newPage();

try {
  // ---------------------------------------------------------------------------
  // 1. Simulate a visitor who visited the retired product BEFORE the cleanup.
  //    Seed a superseded cache namespace holding a retired page and a still-
  //    current page, exactly as the old release would have left it.
  // ---------------------------------------------------------------------------
  await page.goto(`${base}/tv/`, { waitUntil: 'networkidle' });
  await page.evaluate(async ({ legacyCache, retiredRoute, currentRoute }) => {
    const legacy = await caches.open(legacyCache);
    // A cached 200 HTML response for the retired product...
    await legacy.put(
      new Request(retiredRoute),
      new Response('<!doctype html><title>Cached retired HR Full Set</title><h1>HR Executive Board</h1>', {
        status: 200, headers: { 'content-type': 'text/html' },
      }),
    );
    // ...and a cached 200 for a product that still exists.
    await legacy.put(
      new Request(currentRoute),
      new Response('<!doctype html><title>Cached Journal</title><h1>Aizanoi Journal</h1>', {
        status: 200, headers: { 'content-type': 'text/html' },
      }),
    );
    // A pre-existing superseded field cache, as an older release would leave.
    await caches.open('aizanoi-field-shell-v1');
  }, { legacyCache: RETIRED_LEGACY_CACHE, retiredRoute: RETIRED_ROUTE, currentRoute: '/journal/' });

  // ---------------------------------------------------------------------------
  // 2. Install the new release and let activation run.
  // ---------------------------------------------------------------------------
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  // ---------------------------------------------------------------------------
  // 3. The new cache namespace is active; the superseded ones are gone.
  // ---------------------------------------------------------------------------
  const afterActivate = await page.evaluate(async (cacheName) => {
    const cache = await caches.open(cacheName);
    return {
      keys: await caches.keys(),
      current: (await cache.keys()).map((item) => new URL(item.url).pathname),
    };
  }, CURRENT_CACHE);

  assert.ok(afterActivate.keys.includes(CURRENT_CACHE), `active cache ${CURRENT_CACHE} must exist`);
  assert.equal(
    afterActivate.keys.includes(RETIRED_LEGACY_CACHE), false,
    `superseded cache ${RETIRED_LEGACY_CACHE} must be retired on activation`,
  );
  assert.equal(afterActivate.keys.includes('aizanoi-field-shell-v1'), false, 'superseded field cache must be retired');

  for (const required of [
    '/', '/worlds/', '/release.js', '/manifest.webmanifest',
    '/js/v3/main.js', '/styles/shell.css', '/assets/branding/aizanoi-pwa-192.png',
  ]) {
    assert.ok(afterActivate.current.includes(required), `precache missing ${required}`);
  }

  // ---------------------------------------------------------------------------
  // 4. No retired entry survives in ANY cache, including the new active one.
  // ---------------------------------------------------------------------------
  const retiredEntries = await page.evaluate(async (prefix) => {
    const found = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const path = new URL(request.url).pathname;
        if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}.`)) {
          found.push(`${name}:${path}`);
        }
      }
    }
    return found;
  }, RETIRED.slice(0, 1)[0] || RETIRED_ROUTE);
  assert.deepEqual(retiredEntries, [], `retired routes survived the release transition: ${retiredEntries.join(', ')}`);

  // ---------------------------------------------------------------------------
  // 5. Retired navigation must NOT fall back to a cached page when offline.
  //    It must fail to render the retired product.
  // ---------------------------------------------------------------------------
  await context.setOffline(true);
  const retiredNavigation = await page.goto(`${base}${RETIRED_ROUTE}`, { waitUntil: 'commit', timeout: 15000 }).then(
    (response) => ({ ok: Boolean(response?.ok()), status: response?.status() ?? null }),
    (error) => ({ ok: false, status: null, error: error.message.split('\n')[0] }),
  );
  // The navigation may abort outright (expected offline). Read the body only
  // if a document actually exists, since the context can be destroyed.
  const retiredBody = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  await context.setOffline(false);

  // The retired product's own content must never render, whether the navigation
  // was served from cache, errored, or fell through to another route.
  assert.ok(
    !retiredBody.includes('HR Executive Board'),
    `retired HR Full Set content must never be served (offline navigation=${JSON.stringify(retiredNavigation)}, body=${retiredBody.slice(0, 120)})`,
  );

  // ---------------------------------------------------------------------------
  // 6. Current products keep the intended offline behaviour.
  // ---------------------------------------------------------------------------
  // Visit online first so the worker caches the real Journal, then prove the
  // cache actually holds it. Without this wait the offline reload races the
  // cache write: the navigation is served from the network-side handler before
  // the response is stored, the page comes back as the shell, and the assert
  // fails with a bare "heading not visible" -- which is what happened on CI,
  // where this passed locally and failed on the merge SHA.
  await page.goto(`${base}/journal/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(async (cacheName) => {
    if (!navigator.serviceWorker?.controller) return false;
    const cache = await caches.open(cacheName);
    const hit = await cache.match(new Request('/journal/'));
    return Boolean(hit);
  }, CURRENT_CACHE, { timeout: 30000, polling: 250 });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Scope to the Journal surface. An unscoped locator('h1') is ambiguous as soon
  // as the shell's mobile/tablet home headings are also present, which would
  // fail on a strict-mode violation instead of on the real regression.
  const journalHeading = page.getByRole('heading', { level: 1, name: 'Aizanoi Journal' });
  await journalHeading.first().waitFor({ state: 'visible', timeout: 30000 });
  assert.equal((await journalHeading.first().textContent())?.trim(), 'Aizanoi Journal', 'Journal must still work offline');
  await context.setOffline(false);

  // ---------------------------------------------------------------------------
  // 7. /api/* stays unintercepted by the service worker.
  // ---------------------------------------------------------------------------
  const apiBypassed = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const target = '/api/definitely-not-a-route';
    const response = await fetch(target, { cache: 'no-store' });
    return { scoped: registration?.scope ?? null, status: response.status, body: (await response.text()).slice(0, 40) };
  });
  assert.ok(apiBypassed.scoped, 'service worker must be registered at the root scope');
  assert.notEqual(apiBypassed.status, 200, '/api/* must not be served from cache');

  // ---------------------------------------------------------------------------
  // 8. The runtime cache stays bounded.
  // ---------------------------------------------------------------------------
  await page.evaluate(async () => Promise.all(
    Array.from({ length: 160 }, (_, index) => fetch(`/styles/landing.css?runtime=${index}`)),
  ));
  await page.waitForTimeout(250);
  const runtimeCount = await page.evaluate(async (cacheName) => {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    return keys.filter((request) => new URL(request.url).search).length;
  }, CURRENT_CACHE);
  assert.ok(runtimeCount <= 128, `runtime cache was not pruned (${runtimeCount})`);

  console.log(
    'service worker release metadata, install, cleanup, offline navigation, pruning, ' +
    'retired-cache purge and /api bypass passed',
  );
} finally {
  await context.close();
  await browser.close();
}
