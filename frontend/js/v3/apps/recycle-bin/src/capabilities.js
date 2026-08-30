function assertFunction(owner, name) {
  if (typeof owner?.[name] !== 'function') throw new Error(`Recycle Bin requires capability method: ${name}`);
}

function validate(capabilities) {
  const { filesystem, dialog, notifications, sound } = capabilities || {};
  if (!filesystem?.recycleId) throw new Error('Recycle Bin requires filesystem.recycleId');
  for (const name of ['childrenOf', 'formatSize', 'emptyRecycleBin', 'restoreNode', 'getNode', 'deleteNode']) {
    assertFunction(filesystem, name);
  }
  assertFunction(dialog, 'confirm');
  assertFunction(notifications, 'notify');
  assertFunction(sound, 'play');
  return capabilities;
}

/** Validate the capability surface injected by the canonical AizanoiOS shell. */
export function resolveRecycleBinCapabilities({ capabilities = {} } = {}) {
  return validate(capabilities);
}
