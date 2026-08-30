import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/workspace';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const privateApp = read(`${moduleRoot}/src/app.js`);
const adapter = read(`${moduleRoot}/src/capabilities.js`);

test('Workspace manifest declares only shared UI capabilities', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'workspace');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, ['apps', 'filesystem', 'notifications', 'sound']);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry loads Workspace only through its public module entry while filesystem core remains shared', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const workspace = registry.appById('workspace');
  assert.equal(workspace?.module, '/js/v3/apps/workspace/src/index.js');
  assert.deepEqual([...workspace.requires], ['apps', 'filesystem', 'notifications', 'sound']);
  assert.equal(existsSync('frontend/js/v3/apps/workspace.js'), false, 'retired flat Workspace entry must stay removed');
  assert.equal(existsSync('frontend/js/v3/workspace/fs.js'), true, 'canonical filesystem core must remain shared');
  const publicEntry = await import('../frontend/js/v3/apps/workspace/src/index.js');
  assert.equal(typeof publicEntry.mount, 'function');
});

test('Workspace private code uses injected capabilities instead of concrete core or shell APIs', () => {
  assert.doesNotMatch(privateApp, /workspace\/fs\.js/);
  assert.doesNotMatch(privateApp, /api\./);
  assert.doesNotMatch(privateApp, /AIZANOI_OS/);
  assert.match(privateApp, /apps\.open\('notepad'/);
  assert.match(privateApp, /apps\.open\('camera'/);
  assert.match(privateApp, /apps\.open\('winamp'/);
  assert.match(privateApp, /fs\.createFolder/);
  assert.match(privateApp, /fs\.trashNode/);
  assert.match(privateApp, /notifications\.notify/);
  assert.match(privateApp, /sound\.play/);
  assert.doesNotMatch(adapter, /workspace\//);
});

test('Workspace cleanup owns listeners, menus and temporary download URLs', () => {
  assert.match(privateApp, /removeEventListener\('change', handleFileChange\)/);
  assert.match(privateApp, /removeEventListener\('click', handleClick\)/);
  assert.match(privateApp, /removeEventListener\('keydown', handleKeydown\)/);
  assert.match(privateApp, /closeMenu\(\{ restoreFocus: false \}\)/);
  assert.match(privateApp, /for \(const url of \[\.\.\.downloadResources\.keys\(\)\]\) releaseDownloadUrl\(url\)/);
  assert.match(privateApp, /URL\.revokeObjectURL\(url\)/);
});
