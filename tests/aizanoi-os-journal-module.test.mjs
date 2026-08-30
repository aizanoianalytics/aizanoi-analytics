import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/journal';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);

test('Aizanoi Journal manifest is a zero-capability desktop module', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'journal');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, []);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Journal only through its public module entry', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const journal = registry.appById('journal');
  assert.equal(journal?.module, '/js/v3/apps/journal/src/index.js');
  assert.deepEqual([...journal.requires], []);
  const publicEntry = await import('../frontend/js/v3/apps/journal/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('Journal private code owns its long-form desk without shared service coupling', () => {
  assert.match(privateApp, /Journal desk is ready/);
  assert.match(privateApp, /News reports what happened; Journal explains what it means/);
  assert.doesNotMatch(privateApp, /api\.|capabilities|AIZANOI_OS|shell\.js|workspace\/fs/);
});

test('Journal mount provides deterministic cleanup without allocating shared resources', () => {
  assert.match(privateApp, /return \(\) => \{\};/);
  assert.doesNotMatch(privateApp, /addEventListener|setInterval|setTimeout|new MutationObserver/);
});

test('legacy shared brand hub stays retired after Journal migration', () => {
  assert.equal(existsSync('frontend/js/v3/apps/brand-hubs.js'), false);
});
