import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/forge';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const adapter = read(`${moduleRoot}/src/capabilities.js`);

test('Aizanoi Forge manifest declares only app navigation', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'forge');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, ['apps']);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Forge only through its public module entry', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const forge = registry.appById('forge');
  assert.equal(forge?.module, '/js/v3/apps/forge/src/index.js');
  assert.deepEqual([...forge.requires], ['apps']);
  const publicEntry = await import('../frontend/js/v3/apps/forge/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('Forge private code owns source/project content and uses narrow app navigation', () => {
  assert.match(privateApp, /https:\/\/github\.com\/aizanoianalytics\/aizanoi-analytics/);
  assert.match(privateApp, /title:'Historical Worlds'/);
  assert.match(privateApp, /title:'Aizanoi Arcade'/);
  assert.match(privateApp, /frontend\/js\/v3\/apps\/games/);
  assert.match(privateApp, /apps\.open\(appId\)/);
  assert.doesNotMatch(privateApp, /api\.openApp|AIZANOI_OS|from ['"].*shell\.js/);
  assert.doesNotMatch(adapter, /AIZANOI_OS|shell\.js/);
});

test('retired shared brand hub cannot regain Forge ownership', () => {
  assert.equal(existsSync('frontend/js/v3/apps/brand-hubs.js'), false);
  assert.match(privateApp, /Aizanoi Forge|SOURCE OF TRUTH|aizanoianalytics\/aizanoi-analytics/);
});

test('Forge cleanup removes its module-owned listener', () => {
  assert.match(privateApp, /addEventListener\('click', handleClick\)/);
  assert.match(privateApp, /removeEventListener\('click', handleClick\)/);
});
