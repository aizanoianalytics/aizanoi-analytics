import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/winamp';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const adapter = read(`${moduleRoot}/src/capabilities.js`);
const sharedCapabilities = read('frontend/js/v3/capabilities.js');

test('Winamp manifest declares the existing shared capability surface only', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'winamp');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, ['filesystem', 'notifications', 'sound']);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Winamp only through generated module wiring', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const winamp = registry.appById('winamp');
  assert.equal(winamp?.module, '/js/v3/apps/winamp/src/index.js');
  assert.deepEqual([...winamp.requires], ['filesystem', 'notifications', 'sound']);
  assert.equal(existsSync('frontend/js/v3/apps/winamp.js'), false, 'retired flat Winamp entry must stay removed');
  const publicEntry = await import('../frontend/js/v3/apps/winamp/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('private Winamp logic consumes capabilities rather than Workspace implementation paths', () => {
  assert.doesNotMatch(privateApp, /workspace\/(?:fs|dialog|sounds)\.js/);
  assert.doesNotMatch(privateApp, /\bapi\.(?:notify|playSound)/);
  assert.match(privateApp, /filesystem\.readFileBlob/);
  assert.match(privateApp, /filesystem\.childrenOf\(filesystem\.musicId\)/);
  assert.match(privateApp, /filesystem\.createFile/);
  assert.match(privateApp, /notifications\.notify/);
  assert.match(privateApp, /sound\.play/);
});

test('Winamp keeps its playlist namespace module-owned', () => {
  assert.match(privateApp, /aizanoi-winamp-playlist-v1/);
  assert.match(privateApp, /localStorage\.getItem\(PLAYLIST_KEY\)/);
  assert.match(privateApp, /localStorage\.setItem\(PLAYLIST_KEY/);
});

test('Winamp capability adapter validates injection without concrete imports', () => {
  assert.doesNotMatch(adapter, /workspace\/(?:fs|dialog|sounds)\.js/);
  assert.match(adapter, /filesystem\.musicId/);
  for (const method of ['readFileBlob', 'childrenOf', 'createFile']) {
    assert.match(adapter, new RegExp(`['"]${method}['"]`));
  }
});

test('shared filesystem capability exposes Workspace Music without a second storage implementation', () => {
  assert.match(sharedCapabilities, /musicId:\s*fs\.MUSIC_ID/);
  assert.match(sharedCapabilities, /readFileBlob:\s*fs\.readFileBlob/);
  assert.match(sharedCapabilities, /createFile:\s*fs\.createFile/);
});

test('Winamp cleanup removes owned listeners and revokes the active media URL', () => {
  for (const pair of [
    ['container', 'click', 'handleClick'],
    ['fileInput', 'change', 'handleFileChange'],
    ['seekEl', 'input', 'handleSeekInput'],
    ['audio', 'timeupdate', 'updateTime'],
    ['audio', 'ended', 'handleEnded'],
    ['vol', 'input', 'handleVolumeInput'],
  ]) {
    const [owner, event, handler] = pair;
    assert.match(privateApp, new RegExp(`${owner}\\.addEventListener\\('${event}',\\s*${handler}\\)`));
    assert.match(privateApp, new RegExp(`${owner}\\.removeEventListener\\('${event}',\\s*${handler}\\)`));
  }
  assert.match(privateApp, /audio\.pause\(\)/);
  assert.match(privateApp, /revokeActiveUrl\(\)/);
});
