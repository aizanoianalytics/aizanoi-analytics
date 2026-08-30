import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/calculator';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const adapter = read(`${moduleRoot}/src/capabilities.js`);

test('Calculator manifest declares only the sound capability', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'calculator');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, ['sound']);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Calculator only through its public module entry', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const calculator = registry.appById('calculator');
  assert.equal(calculator?.module, '/js/v3/apps/calculator/src/index.js');
  assert.deepEqual([...calculator.requires], ['sound']);
  assert.equal(existsSync('frontend/js/v3/apps/calculator.js'), false, 'retired flat Calculator entry must stay removed');
  const publicEntry = await import('../frontend/js/v3/apps/calculator/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('Calculator private code uses injected sound rather than shell API or core imports', () => {
  assert.doesNotMatch(privateApp, /workspace\//);
  assert.doesNotMatch(privateApp, /api\.playSound/);
  assert.doesNotMatch(privateApp, /api\.notify/);
  assert.match(privateApp, /sound\.play\('click'\)/);
  assert.match(privateApp, /sound\.play\('error'\)/);
  assert.doesNotMatch(adapter, /workspace\//);
});

test('Calculator cleanup removes every module-owned listener', () => {
  assert.match(privateApp, /removeEventListener\('click', handleClick\)/);
  assert.match(privateApp, /removeEventListener\('keydown', handleKeydown\)/);
});
