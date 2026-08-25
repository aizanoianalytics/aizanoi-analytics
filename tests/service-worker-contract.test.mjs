import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sw = readFileSync('frontend/service-worker.js', 'utf8');
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

test('service worker uses the current cache namespace for the hardened platform', () => {
  assert.match(sw, /const CACHE = 'aizanoi-os-shell-v4\.3\.1';/);
});

test('service worker precaches safe independent requests in parallel and fails as a unit', () => {
  assert.match(sw, /Promise\.all\(PRECACHE\.map\(async \(url\) =>/);
  assert.match(sw, /await Promise\.all\(responses\.map/);
  assert.match(sw, /if \(!response\.ok\) throw new Error/);
});

test('service worker upgrades wait rather than forcing new code over open AizanoiOS clients', () => {
  const installBlock = sw.match(/self\.addEventListener\('install',[\s\S]*?\n\}\);/)?.[0] || '';
  assert.match(installBlock, /event\.waitUntil\(precacheShell\(\)\)/);
  assert.doesNotMatch(installBlock, /skipWaiting/);
  assert.match(sw, /self\.clients\.claim\(\)/);
});

test('service worker caches offline navigations and bounds runtime entries', () => {
  assert.match(sw, /async function cacheNavigation\(request, response\)/);
  assert.match(sw, /MAX_RUNTIME_ENTRIES\s*=\s*24/);
  assert.match(sw, /async function pruneRuntimeCache/);
  assert.match(sw, /await cache\.delete\(key\)/);
  assert.match(sw, /cached \|\| caches\.match\('\/'\)/);
});

test('CI runs real Chromium service-worker lifecycle coverage', () => {
  assert.match(ci, /service-worker-browser\.mjs/);
});
