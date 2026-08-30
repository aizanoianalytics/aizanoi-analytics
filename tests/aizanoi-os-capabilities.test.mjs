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
