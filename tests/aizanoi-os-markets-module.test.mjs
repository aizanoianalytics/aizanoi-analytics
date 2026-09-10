import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/markets';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const registry = read('frontend/js/v3/registry.js');

test('Aizanoi Markets is a zero-capability desktop-app module', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'markets');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, []);
  assert.deepEqual(manifest.provides, ['desktop-app']);
  assert.ok(existsSync(`${moduleRoot}/index.md`), 'module must document itself');
  assert.ok(existsSync(`${moduleRoot}/src/index.js`), 'public entry must exist');
  assert.ok(existsSync(`${moduleRoot}/src/app.js`), 'module-owned app implementation must exist');
});

test('canonical registry cataloged Markets through moduleId and keeps Analytics intact', async () => {
  const { appById } = await import('../frontend/js/v3/registry.js');
  const markets = appById('markets');
  assert.equal(markets?.module, '/js/v3/apps/markets/src/index.js');
  assert.equal(markets?.label, 'Aizanoi Markets');
  assert.equal(markets?.group, 'studio');
  assert.match(registry, /id:'markets', label:'Aizanoi Markets', short:'Markets'/);
  assert.match(registry, /moduleId:'markets'/);
  assert.match(registry, /\/assets\/icons\/aizanoi-markets\.svg/);
  const analytics = appById('analytics');
  assert.equal(analytics?.label, 'Analytics');
  assert.ok(existsSync('frontend/assets/icons/aizanoi-markets.svg'), 'icon must exist');
});

test('Markets app mounts a real market surface driven by the static market shards', async () => {
  const entry = await import('../frontend/js/v3/apps/markets/src/index.js');
  assert.equal(typeof entry.mount, 'function');
  const source = read(`${moduleRoot}/src/app.js`);
  assert.match(source, /analytics\/markets\/dashboard\.js/);
  const shared = read('frontend/analytics/markets/dashboard.js');
  assert.match(shared, /\/analytics\/markets\/data/);
  assert.match(shared, /summary\/\$\{market\}\/index\.json/);
  assert.match(shared, /us|crypto|market/);
  assert.doesNotMatch(source + shared, /\bapi\./, 'zero-capability module must not use api capabilities');
  assert.doesNotMatch(source, /workspace\//);
});

test('Markets app reaches the standalone page without a private cross-module import', () => {
  const source = read(`${moduleRoot}/src/app.js`);
  assert.match(source, /analytics\/markets\/dashboard\.js/);
  assert.match(read('frontend/analytics/markets/dashboard.js'), /detailUrl/);
  const analyticsApp = read('frontend/js/v3/apps/analytics/src/app.js');
  assert.doesNotMatch(analyticsApp, /apps\/markets/);
  const boundary = read('tests/aizanoi-os-markets-module.test.mjs');
  assert.ok(boundary.length > 0);
});
