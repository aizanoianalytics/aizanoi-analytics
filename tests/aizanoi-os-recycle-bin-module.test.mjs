import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/recycle-bin';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const adapter = read(`${moduleRoot}/src/capabilities.js`);
const sharedCapabilities = read('frontend/js/v3/capabilities.js');

test('Recycle Bin manifest declares one capability-injected desktop app', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'recycle-bin');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, ['filesystem', 'dialog', 'notifications', 'sound']);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Recycle Bin only through generated module wiring', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const recycleBin = registry.appById('recycle-bin');
  assert.equal(recycleBin?.module, '/js/v3/apps/recycle-bin/src/index.js');
  assert.deepEqual([...recycleBin.requires], ['dialog', 'filesystem', 'notifications', 'sound']);
  assert.equal(existsSync('frontend/js/v3/apps/recycle-bin.js'), false, 'retired flat Recycle Bin entry must stay removed');
  const publicEntry = await import('../frontend/js/v3/apps/recycle-bin/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('private Recycle Bin logic consumes capabilities and no concrete Workspace paths', () => {
  assert.doesNotMatch(privateApp, /workspace\/(?:fs|dialog|sounds)\.js/);
  assert.doesNotMatch(privateApp, /\bapi\.(?:notify|playSound)/);
  assert.match(privateApp, /filesystem\.childrenOf\(filesystem\.recycleId\)/);
  assert.match(privateApp, /filesystem\.restoreNode/);
  assert.match(privateApp, /filesystem\.deleteNode/);
  assert.match(privateApp, /dialog\.confirm/);
  assert.match(privateApp, /notifications\.notify/);
  assert.match(privateApp, /sound\.play/);
});

test('Recycle Bin capability adapter validates injection without concrete imports', () => {
  assert.doesNotMatch(adapter, /workspace\/(?:fs|dialog|sounds)\.js/);
  assert.match(adapter, /filesystem\.recycleId/);
  for (const method of ['childrenOf', 'formatSize', 'emptyRecycleBin', 'restoreNode', 'getNode', 'deleteNode']) {
    assert.match(adapter, new RegExp(`['"]${method}['"]`));
  }
});

test('shared filesystem capability exposes the Recycle Bin operations', () => {
  assert.match(sharedCapabilities, /recycleId:\s*fs\.RECYCLE_ID/);
  assert.match(sharedCapabilities, /emptyRecycleBin:\s*fs\.emptyRecycleBin/);
  assert.match(sharedCapabilities, /restoreNode:\s*fs\.restoreNode/);
  assert.match(sharedCapabilities, /deleteNode:\s*fs\.deleteNode/);
});

test('Recycle Bin cleanup removes its owned click listener', () => {
  assert.match(privateApp, /addEventListener\('click', handleClick\)/);
  assert.match(privateApp, /removeEventListener\('click', handleClick\)/);
});
