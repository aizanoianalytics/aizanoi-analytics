import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/labs';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const adapter = read(`${moduleRoot}/src/capabilities.js`);

test('Aizanoi Labs manifest declares only app navigation', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'labs');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, ['apps']);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Labs only through its public module entry', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const labs = registry.appById('labs');
  assert.equal(labs?.module, '/js/v3/apps/labs/src/index.js');
  assert.deepEqual([...labs.requires], ['apps']);
  const publicEntry = await import('../frontend/js/v3/apps/labs/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('Labs keeps Arcade separate and navigates through the narrow app capability', () => {
  assert.match(privateApp, /title:'Games live in Arcade'/);
  assert.match(privateApp, /button:'games'/);
  assert.match(privateApp, /apps\.open\(appId\)/);
  assert.doesNotMatch(privateApp, /api\.openApp|AIZANOI_OS|from ['"].*games\.js|\/games\//);
  assert.doesNotMatch(adapter, /AIZANOI_OS|shell\.js|games\.js/);
});

test('Labs cleanup removes its module-owned listener', () => {
  assert.match(privateApp, /addEventListener\('click', handleClick\)/);
  assert.match(privateApp, /removeEventListener\('click', handleClick\)/);
});
