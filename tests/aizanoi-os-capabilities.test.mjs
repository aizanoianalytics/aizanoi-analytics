import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveCapabilities } from '../frontend/js/v3/capabilities.js';

test('capability resolver returns only explicitly requested host capabilities', async () => {
  const notifications = Object.freeze({ notify() {} });
  const unused = Object.freeze({ value: true });
  const resolved = await resolveCapabilities(
    ['notifications', 'notifications'],
    { notifications, unused }
  );

  assert.deepEqual(Object.keys(resolved), ['notifications']);
  assert.equal(resolved.notifications, notifications);
  assert.equal(Object.isFrozen(resolved), true);
});

test('apps capability delegates only to the canonical AizanoiOS runtime facade', async () => {
  const previous = globalThis.AIZANOI_OS;
  const calls = [];
  globalThis.AIZANOI_OS = Object.freeze({
    openApp(appId, options) {
      calls.push({ appId, options });
      return `opened:${appId}`;
    },
  });
  try {
    const resolved = await resolveCapabilities(['apps']);
    assert.deepEqual(Object.keys(resolved), ['apps']);
    assert.equal(Object.isFrozen(resolved.apps), true);
    assert.equal(resolved.apps.open('news', { source: 'test' }), 'opened:news');
    assert.deepEqual(calls, [{ appId: 'news', options: { source: 'test' } }]);
  } finally {
    if (previous === undefined) delete globalThis.AIZANOI_OS;
    else globalThis.AIZANOI_OS = previous;
  }
});

test('filesystem capability exposes the complete shared surface needed by migrated file apps and Workspace UI', async () => {
  const resolved = await resolveCapabilities(['filesystem']);
  const fs = resolved.filesystem;
  assert.equal(Object.isFrozen(fs), true);
  assert.deepEqual(Object.keys(fs).sort(), [
    'allNodes',
    'childrenOf',
    'createFile',
    'createFolder',
    'deleteNode',
    'documentsId',
    'emptyRecycleBin',
    'formatSize',
    'getNode',
    'musicId',
    'picturesId',
    'readFileBlob',
    'recycleId',
    'renameNode',
    'restoreNode',
    'trashNode',
    'updateFileContent',
  ]);
  for (const name of ['allNodes', 'createFolder', 'renameNode', 'trashNode']) {
    assert.equal(typeof fs[name], 'function', `${name} must be available through the shared filesystem boundary`);
  }
});

test('capability resolver rejects unknown undeclared providers instead of silently degrading', async () => {
  await assert.rejects(
    () => resolveCapabilities(['definitely-not-a-capability']),
    /Application capability unavailable: definitely-not-a-capability/
  );
});

test('capability resolver rejects malformed requirement declarations', async () => {
  await assert.rejects(
    () => resolveCapabilities('filesystem'),
    /capability requirements must be an array/i
  );
  await assert.rejects(
    () => resolveCapabilities(['']),
    /capability names must be non-empty strings/i
  );
});
