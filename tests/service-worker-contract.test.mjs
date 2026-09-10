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
