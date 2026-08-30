import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/notepad';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const adapter = read(`${moduleRoot}/src/capabilities.js`);

test('Notepad manifest v1 identifies one public desktop-app entry', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'notepad');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, ['filesystem', 'dialog', 'notifications', 'sound']);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Notepad only through its module public entry', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  assert.equal(registry.appById('notepad')?.module, '/js/v3/apps/notepad/src/index.js');
  assert.equal(existsSync('frontend/js/v3/apps/notepad.js'), false, 'retired flat Notepad entry must stay removed');
  const publicEntry = await import('../frontend/js/v3/apps/notepad/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('private Notepad logic depends on capabilities rather than Workspace implementation paths', () => {
  assert.doesNotMatch(privateApp, /workspace\/(?:fs|dialog)\.js/);
  assert.match(privateApp, /filesystem\.getNode/);
  assert.match(privateApp, /dialog\.confirm/);
  assert.match(privateApp, /notifications\.notify/);
  assert.match(privateApp, /sound\.play/);
});

test('only the module capability adapter knows current shared implementation paths', () => {
  assert.match(adapter, /workspace\/fs\.js/);
  assert.match(adapter, /workspace\/dialog\.js/);
});

test('Notepad lifecycle cleanup removes its owned listeners', () => {
  assert.match(privateApp, /removeEventListener\('input', handleInput\)/);
  assert.match(privateApp, /removeEventListener\('click', handleClick\)/);
});
