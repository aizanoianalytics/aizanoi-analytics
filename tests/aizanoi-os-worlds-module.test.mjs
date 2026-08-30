import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/worlds';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const adapter = read(`${moduleRoot}/src/capabilities.js`);

test('Historical Worlds manifest declares only the worlds capability', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'worlds');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, ['worlds']);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Historical Worlds only through its public module entry', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const worlds = registry.appById('worlds');
  assert.equal(worlds?.module, '/js/v3/apps/worlds/src/index.js');
  assert.deepEqual([...worlds.requires], ['worlds']);
  assert.equal(existsSync('frontend/js/v3/apps/worlds.js'), false, 'retired flat Historical Worlds entry must stay removed');
  const publicEntry = await import('../frontend/js/v3/apps/worlds/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('Historical Worlds private code uses only injected world surfaces', () => {
  assert.doesNotMatch(privateApp, /registry\.js/);
  assert.doesNotMatch(privateApp, /store\.js/);
  assert.doesNotMatch(privateApp, /shell\.js/);
  assert.doesNotMatch(privateApp, /api\./);
  assert.doesNotMatch(privateApp, /AIZANOI_OS/);
  assert.match(privateApp, /worlds\.list\(\)/);
  assert.match(privateApp, /worlds\.currentSession\(\)/);
  assert.match(privateApp, /worlds\.launch\(/);
  assert.doesNotMatch(adapter, /registry\.js|store\.js|shell\.js|AIZANOI_OS/);
});

test('Historical Worlds cleanup removes its module-owned listener', () => {
  assert.match(privateApp, /addEventListener\('click',handleClick\)/);
  assert.match(privateApp, /removeEventListener\('click',handleClick\)/);
});
