import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/videos';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const adapter = read(`${moduleRoot}/src/capabilities.js`);

test('Aizanoi TV manifest declares only the app navigation capability', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'videos');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, ['apps']);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Aizanoi TV only through its public module entry', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const videos = registry.appById('videos');
  assert.equal(videos?.module, '/js/v3/apps/videos/src/index.js');
  assert.deepEqual([...videos.requires], ['apps']);
  assert.equal(existsSync('frontend/js/v3/apps/media.js'), false, 'retired flat Aizanoi TV entry must stay removed');
  const publicEntry = await import('../frontend/js/v3/apps/videos/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('Aizanoi TV private code uses narrow app navigation instead of shell API', () => {
  assert.doesNotMatch(privateApp, /api\.openApp/);
  assert.doesNotMatch(privateApp, /from ['"].*shell\.js/);
  assert.doesNotMatch(privateApp, /AIZANOI_OS/);
  assert.match(privateApp, /apps\.open\(action\)/);
  assert.doesNotMatch(adapter, /AIZANOI_OS|shell\.js/);
});

test('Aizanoi TV cleanup removes its module-owned listener', () => {
  assert.match(privateApp, /addEventListener\('click', handleClick\)/);
  assert.match(privateApp, /removeEventListener\('click', handleClick\)/);
});
