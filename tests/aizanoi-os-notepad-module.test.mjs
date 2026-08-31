import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/notepad';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const adapter = read(`${moduleRoot}/src/capabilities.js`);
const sharedCapabilities = read('frontend/js/v3/capabilities.js');
const shell = read('frontend/js/v3/shell.js');

test('Notepad manifest v1 identifies one public desktop-app entry', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'notepad');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, ['filesystem', 'dialog', 'notifications', 'sound']);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Notepad only through its module public entry and generated requirements', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const notepad = registry.appById('notepad');
  assert.equal(notepad?.module, '/js/v3/apps/notepad/src/index.js');
  assert.deepEqual([...notepad.requires], ['dialog', 'filesystem', 'notifications', 'sound']);
  assert.equal(existsSync('frontend/js/v3/apps/notepad.js'), false, 'retired flat Notepad entry must stay removed');
  const publicEntry = await import('../frontend/js/v3/apps/notepad/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('private Notepad logic depends on capabilities rather than Workspace implementation paths', () => {
  assert.doesNotMatch(privateApp, /workspace\/(?:fs|dialog|sounds)\.js/);
  assert.match(privateApp, /filesystem\.getNode/);
  assert.match(privateApp, /dialog\.confirm/);
  assert.match(privateApp, /notifications\.notify/);
  assert.match(privateApp, /sound\.play/);
});

test('Notepad capability adapter requires injection and contains no concrete shared implementation paths', () => {
  assert.doesNotMatch(adapter, /workspace\/(?:fs|dialog|sounds)\.js/);
  assert.doesNotMatch(adapter, /api\?\.(?:notify|playSound)/);
  assert.match(adapter, /resolveNotepadCapabilities/);
});

test('shared capability bridge owns concrete Workspace adapters', () => {
  assert.match(sharedCapabilities, /workspace\/fs\.js/);
  assert.match(sharedCapabilities, /workspace\/dialog\.js/);
  assert.match(sharedCapabilities, /workspace\/sounds\.js/);
});

test('canonical shell resolves manifest requirements and injects capabilities into mount context', () => {
  assert.match(shell, /import\('\.\/capabilities\.js'\)/);
  assert.match(shell, /resolveCapabilities\(app\.requires/);
  assert.match(shell, /notifications:\s*Object\.freeze\(\{ notify \}\)/);
  assert.match(shell, /api:appApi, capabilities, options/);
});

test('Notepad lifecycle cleanup removes its owned listeners', () => {
  assert.match(privateApp, /removeEventListener\('input',\s*handleInput\)/);
  assert.match(privateApp, /removeEventListener\('click',\s*handleClick\)/);
});
