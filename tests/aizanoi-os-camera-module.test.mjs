import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/camera';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const adapter = read(`${moduleRoot}/src/capabilities.js`);
const sharedCapabilities = read('frontend/js/v3/capabilities.js');

test('Camera manifest declares explicit media and storage capabilities', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'camera');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, ['filesystem', 'media', 'notifications', 'sound']);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Camera only through its public module entry', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const camera = registry.appById('camera');
  assert.equal(camera?.module, '/js/v3/apps/camera/src/index.js');
  assert.deepEqual([...camera.requires], ['filesystem', 'media', 'notifications', 'sound']);
  assert.equal(existsSync('frontend/js/v3/apps/camera.js'), false, 'retired flat Camera entry must stay removed');
  const publicEntry = await import('../frontend/js/v3/apps/camera/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('Camera private code sees capability surfaces, not host implementations', () => {
  assert.doesNotMatch(privateApp, /workspace\/(?:fs|dialog|sounds)\.js/);
  assert.doesNotMatch(privateApp, /navigator\.mediaDevices/);
  assert.match(privateApp, /filesystem\.picturesId/);
  assert.match(privateApp, /media\.getUserMedia/);
  assert.match(privateApp, /notifications\.notify/);
  assert.match(privateApp, /sound\.play/);
});

test('Camera preserves camera plus microphone permission contract without recording audio', () => {
  assert.match(privateApp, /media\.getUserMedia\(\{\s*video:\s*\{\s*facingMode:\s*'user'\s*\},\s*audio:\s*true\s*\}\)/);
  assert.match(privateApp, /media\.getUserMedia\(\{\s*video:\s*\{\s*facingMode:\s*'user'\s*\},\s*audio:\s*false\s*\}\)/);
  assert.doesNotMatch(privateApp, /MediaRecorder|audio\.srcObject|createMediaStreamSource/);
});

test('shared capability bridge owns mediaDevices and Pictures implementation knowledge', () => {
  assert.match(sharedCapabilities, /picturesId:\s*fs\.PICTURES_ID/);
  assert.match(sharedCapabilities, /globalThis\.navigator\?\.mediaDevices\?\.getUserMedia/);
  assert.match(sharedCapabilities, /media:\s*mediaCapability/);
  assert.doesNotMatch(adapter, /workspace\//);
  assert.doesNotMatch(adapter, /navigator\.mediaDevices/);
});

test('Camera cleanup owns stream, object URLs and listeners', () => {
  assert.match(privateApp, /getTracks\(\)\.forEach\(\(track\)\s*=>\s*track\.stop\(\)\)/);
  assert.match(privateApp, /revokeGalleryUrls\(\)/);
  assert.match(privateApp, /removeEventListener\('click',\s*handleClick\)/);
  assert.match(privateApp, /removeEventListener\('change',\s*handleMirrorChange\)/);
  assert.match(privateApp, /removeEventListener\('pagehide',\s*handlePageHide\)/);
});
