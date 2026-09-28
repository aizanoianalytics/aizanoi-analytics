import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sw = readFileSync('frontend/service-worker.js', 'utf8');
const release = readFileSync('frontend/release.js', 'utf8');
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

function releaseMetadata() {
  const version = release.match(/VERSION:\s*'([^']+)'/)?.[1];
  const cache = release.match(/CACHE:\s*'([^']+)'/)?.[1];
  assert.ok(version, 'release VERSION missing');
  assert.ok(cache, 'release CACHE missing');
  return { version, cache };
}

test('service worker consumes the canonical release cache namespace', () => {
  const { version, cache } = releaseMetadata();
  assert.equal(cache, `aizanoi-os-shell-v${version}`);
  assert.match(sw, /importScripts\('\/release\.js'\)/);
  assert.match(sw, /const CACHE\s*=\s*self\.AIZANOI_RELEASE\.CACHE/);
});

test('service worker precaches safe independent requests in parallel and fails as a unit', () => {
  assert.match(sw, /Promise\.all\(PRECACHE\.map\(async\s*\(\s*url\s*\)\s*=>/);
  assert.match(sw, /await\s+Promise\.all\(responses\.map/);
  assert.match(sw, /if\s*\(!response\.ok\)\s*throw new Error/);
  assert.match(sw, /\/js\/v3\/module-registry\.generated\.js/);
});

test('service worker force-activates new releases so stale shells cannot serve broken builds', () => {
  assert.match(sw, /self\.addEventListener\('install',\s*\(event\)\s*=>\s*event\.waitUntil\(precacheShell\(\)\.then\(\(\)\s*=>\s*self\.skipWaiting\(\)\)\)\)/);
  assert.match(sw, /self\.addEventListener\('activate',[\s\S]*self\.clients\.claim\(\)/);
});

test('service worker caches complete world graphs and keeps a world-safe offline fallback', () => {
  assert.match(sw, /async function cacheNavigation\(request,\s*response\)/);
  assert.match(sw, /MAX_RUNTIME_ENTRIES\s*=\s*128/);
  assert.match(sw, /async function pruneRuntimeCache/);
  assert.match(sw, /await\s+cache\.delete\(key\)/);
  assert.match(sw, /url\.pathname\.startsWith\('\/worlds\/'\)/);
  assert.match(sw, /caches\.match\('\/worlds\/'\)/);
});

test('CI runs real Chromium service-worker lifecycle coverage', () => {
  assert.match(ci, /service-worker-browser\.mjs/);
});

// ---------------------------------------------------------------------------
// Cache retirement: the retired HR Analytics Full Set must not survive a
// release transition through a visitor's pre-cleanup runtime cache.
// ---------------------------------------------------------------------------

test('retired product surfaces are declared as an explicit, append-only denylist', () => {
  const declared = sw.match(/const RETIRED_PATHS=\[([^\]]*)\]/)?.[1];
  assert.ok(declared, 'service worker must declare RETIRED_PATHS');
  const paths = declared.split(',').map((entry) => entry.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.ok(
    paths.includes('/analytics/dashboards/hr-analytics-full-set'),
    `RETIRED_PATHS must include the retired HR Full Set route, got ${JSON.stringify(paths)}`,
  );
  assert.match(sw, /function isRetiredPath\(pathname\)/);
  // Prefix match must not swallow sibling routes such as new-hr-collection.
  assert.match(
    sw,
    /pathname===prefix\|\|pathname\.startsWith\(prefix\+'\/'\)\|\|pathname\.startsWith\(prefix\+'\.'\)/,
  );
});

test('activation retires superseded caches and purges retired entries from every cache', () => {
  assert.match(sw, /async function retireSupersededCaches\(\)/);
  assert.match(sw, /key\.startsWith\('aizanoi-field-shell-'\)[\s\S]*?key\.startsWith\('aizanoi-os-shell-'\)[\s\S]*?key!==CACHE/);
  assert.match(sw, /async function purgeRetiredEntries\(\)/);
  assert.match(sw, /for\(const key of await caches\.keys\(\)\)\{const cache=await caches\.open\(key\);for\(const request of await cache\.keys\(\)\)if\(isRetiredPath\(new URL\(request\.url\)\.pathname\)\)await cache\.delete\(request\);\}/);
  assert.match(
    sw,
    /self\.addEventListener\('activate',[\s\S]*?retireSupersededCaches\(\)\.then\(\(\)=>purgeRetiredEntries\(\)\)\.then\(\(\)=>self\.clients\.claim\(\)\)/,
    'activate must purge retired entries before claiming clients',
  );
});

test('a retired route is never written into the runtime cache nor served as an offline fallback', () => {
  assert.match(
    sw,
    /async function cacheNavigation\(request,response\)\{if\(!response\.ok\)return;if\(isRetiredPath\(new URL\(request\.url\)\.pathname\)\)return;/,
    'cacheNavigation must refuse to cache a retired route',
  );
  assert.match(
    sw,
    /catch\(error\)\{if\(isRetiredPath\(url\.pathname\)\)throw error;const cached=await caches\.match\(request\);/,
    'navigation fallback must not serve a cached retired route',
  );
});

test('cache retirement preserves the bounded offline contract for current products', () => {
  // The offline SLA for surviving products must remain intact.
  assert.match(sw, /const PRECACHE=\[[\s\S]*?'\/[\s\S]*?'\/worlds\/[\s\S]*?\]/);
  assert.match(sw, /const MAX_RUNTIME_ENTRIES\s*=\s*128/);
  assert.match(sw, /caches\.match\('\/'\)/, 'root offline fallback must remain');
  // The /api/* bypass is a security boundary and must not be weakened.
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
});
