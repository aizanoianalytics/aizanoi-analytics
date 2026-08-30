import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/news';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const legacyHubs = read('frontend/js/v3/apps/brand-hubs.js');

test('Aizanoi News is a zero-capability manifest module', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'news');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, []);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads News only through its public module entry', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const news = registry.appById('news');
  assert.equal(news?.module, '/js/v3/apps/news/src/index.js');
  assert.deepEqual([...news.requires], []);
  const publicEntry = await import('../frontend/js/v3/apps/news/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('News owns its static feed and does not depend on shell or shared hub internals', () => {
  assert.match(privateApp, /fetch\('\/news\/index\.json'/);
  assert.match(privateApp, /export function renderNewsFeed/);
  assert.doesNotMatch(privateApp, /\bapi\./);
  assert.doesNotMatch(privateApp, /brand-hubs/);
  assert.doesNotMatch(privateApp, /workspace\//);
});

test('legacy brand hubs no longer contain the News implementation', () => {
  assert.doesNotMatch(legacyHubs, /renderNewsFeed/);
  assert.doesNotMatch(legacyHubs, /mountNews/);
  assert.doesNotMatch(legacyHubs, /\/news\/index\.json/);
  assert.doesNotMatch(legacyHubs, /appId\s*===\s*['"]news['"]/);
});
