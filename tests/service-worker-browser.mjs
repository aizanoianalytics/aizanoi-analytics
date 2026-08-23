import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const CURRENT_CACHE = 'aizanoi-os-shell-v4.3.0';
const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ serviceWorkers:'allow' });
const page = await context.newPage();

try {
  await page.goto(`${base}/tv/`, { waitUntil:'networkidle' });
  await page.evaluate(async () => {
    await caches.open('aizanoi-field-shell-v1');
    await caches.open('aizanoi-os-shell-v0.0.1');
    await navigator.serviceWorker.register('/service-worker.js', { scope:'/' });
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const installed = await page.evaluate(async (cacheName) => {
    const currentCache = await caches.open(cacheName);
    const currentRequests = await currentCache.keys();
    return {
      keys:await caches.keys(),
      current:currentRequests.map((item) => new URL(item.url).pathname)
    };
  }, CURRENT_CACHE);
  assert.ok(installed.keys.includes(CURRENT_CACHE), 'install did not create current shell cache');
  assert.equal(installed.keys.includes('aizanoi-field-shell-v1'), false, 'activate did not delete old Field cache');
  assert.equal(installed.keys.includes('aizanoi-os-shell-v0.0.1'), false, 'activate did not delete old OS cache');
  for (const required of ['/', '/manifest.webmanifest', '/js/v3/main.js']) {
    assert.ok(installed.current.includes(required), `precache missing ${required}`);
  }

  await page.goto(`${base}/journal/`, { waitUntil:'networkidle' });
  assert.equal((await page.locator('h1').textContent())?.trim(), 'Aizanoi Journal');
  await context.setOffline(true);
  await page.reload({ waitUntil:'domcontentloaded' });
  assert.equal((await page.locator('h1').textContent())?.trim(), 'Aizanoi Journal', 'offline navigation did not use cached page');
  await context.setOffline(false);

  await page.evaluate(async () => {
    await Promise.all(Array.from({ length:40 }, (_, index) => fetch(`/styles/landing.css?runtime=${index}`)));
  });
  await page.waitForTimeout(250);
  const runtimeCount = await page.evaluate(async (cacheName) => {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const core = new Set(['/', '/manifest.webmanifest', '/assets/branding/aizanoi-logo-mark.svg', '/assets/wallpapers/aizanoi-os-sunrise.svg', '/styles/tokens.css', '/styles/base.css', '/styles/shell.css', '/styles/components.css', '/styles/device-shell.css', '/js/v3/main.js', '/js/v3/aizanoi-os.js', '/js/v3/brand-platform.js', '/js/v3/registry.js', '/js/v3/store.js', '/js/v3/shell.js', '/news/index.json']);
    return keys.filter((request) => !core.has(new URL(request.url).pathname) || new URL(request.url).search).length;
  }, CURRENT_CACHE);
  assert.ok(runtimeCount <= 24, `runtime cache was not pruned (${runtimeCount} entries)`);
  console.log('service worker install, activate, upgrade cleanup, offline navigation and pruning passed');
} finally {
  await context.close();
  await browser.close();
}
