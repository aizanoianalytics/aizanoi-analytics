import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

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
  assert.ok(paths.includes('/arcade/daire'), 'RETIRED_PATHS must include the retired Ev apartment');
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


test('Dungeon retirement purges old caches and forbids offline resurrection without blocking Wars or Markets', async () => {
  const events = new Map();
  const entries = new Map([
    ['/dungeon/', { old: true }],
    ['/js/v3/apps/dungeon/src/index.js', { old: true }],
    ['/assets/icons/aizanoi-dungeon.svg', { old: true }],
    ['/arcade/aizanoi-wars/', { live: true }],
    ['/analytics/markets/', { live: true }],
  ]);
  const cache = {
    keys: async () => [...entries.keys()].map((path) => ({ url: `https://example.test${path}` })),
    delete: async (request) => entries.delete(new URL(request.url).pathname),
    match: async (request) => entries.get(new URL(request.url).pathname),
    put: async (request, response) => entries.set(new URL(request.url).pathname, response),
  };
  const caches = {
    keys: async () => ['current'], open: async () => cache,
    delete: async () => true,
    match: async (request) => cache.match(typeof request === 'string' ? new Request(`https://example.test${request}`) : request),
  };
  const sandbox = {
    self: { AIZANOI_RELEASE: { CACHE: 'current' }, location: { origin: 'https://example.test' },
      clients: { claim: async () => {} }, addEventListener: (name, handler) => events.set(name, handler) },
    importScripts() {}, caches, URL, Request,
    fetch: async () => { throw new Error('offline'); },
  };
  runInNewContext(sw, sandbox);
  let activation;
  events.get('activate')({ waitUntil: (promise) => { activation = promise; } });
  await activation;
  for (const path of ['/dungeon/', '/js/v3/apps/dungeon/src/index.js', '/assets/icons/aizanoi-dungeon.svg']) {
    assert.equal(entries.has(path), false, `${path} must be purged`);
    await assert.rejects(
      runInNewContext('networkFirstNavigation', sandbox)(new Request(`https://example.test${path}`)),
      /offline/, `${path} must not receive the homepage offline fallback`,
    );
  }
  assert.equal(entries.has('/arcade/aizanoi-wars/'), true);
  assert.equal(entries.has('/analytics/markets/'), true);
  assert.deepEqual(await runInNewContext('networkFirstNavigation', sandbox)(new Request('https://example.test/arcade/aizanoi-wars/')), { live: true });
  await assert.rejects(runInNewContext('networkFirstStatic', sandbox)(new Request('https://example.test/js/v3/apps/dungeon/src/index.js')), /Retired asset unavailable/);
});


test('retired Dungeon is absent from current public discovery while Wars, world and Markets remain', () => {
  const surfaces = [
    'frontend/arcade/index.html', 'frontend/forge/index.html', 'frontend/worlds/index.html',
    'frontend/manifest.webmanifest', 'frontend/js/v3/brand-platform.js',
    'frontend/js/v3/registry.js', 'frontend/js/v3/module-registry.generated.js',
    'AGENTS.md', 'PRODUCT.md', 'docs/HERMES_OPERATIONS.md', 'docs/OPERATIONS.md',
  ];
  for (const file of surfaces) {
    const content = readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /\bDungeon\b|\/dungeon\/|['"]dungeon['"]/i, `${file} must not advertise the retired game`);
  }
  const arcade = readFileSync('frontend/arcade/index.html', 'utf8');
  assert.match(arcade, /href="\/arcade\/aizanoi-wars\/"/);
  assert.match(readFileSync('frontend/worlds/index.html', 'utf8'), /\/worlds\/aizanoi-225\//);
  assert.match(readFileSync('frontend/manifest.webmanifest', 'utf8'), /\/analytics\/markets\//);
});
