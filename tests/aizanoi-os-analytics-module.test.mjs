import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/analytics';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const legacyHubs = read('frontend/js/v3/apps/brand-hubs.js');

test('Analytics is a zero-capability manifest module', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'analytics');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, []);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Analytics only through its public module entry', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const analytics = registry.appById('analytics');
  assert.equal(analytics?.module, '/js/v3/apps/analytics/src/index.js');
  assert.deepEqual([...analytics.requires], []);
  const publicEntry = await import('../frontend/js/v3/apps/analytics/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('Analytics module owns the launcher but not the dashboard product', () => {
  assert.match(privateApp, /\/analytics\/dashboards\/hr-analytics-full-set\//);
  assert.match(privateApp, /hr-analytics-full-set-synthetic-output\.xlsx/);
  assert.doesNotMatch(privateApp, /\bapi\./);
  assert.doesNotMatch(privateApp, /workspace\//);
  assert.ok(existsSync('frontend/analytics/dashboards/hr-analytics-full-set/index.html'));
});

test('legacy brand hubs no longer contain the Analytics implementation', () => {
  assert.doesNotMatch(legacyHubs, /mountAnalytics/);
  assert.doesNotMatch(legacyHubs, /az-hr-spotlight/);
  assert.doesNotMatch(legacyHubs, /appId\s*===\s*['"]analytics['"]/);
});
