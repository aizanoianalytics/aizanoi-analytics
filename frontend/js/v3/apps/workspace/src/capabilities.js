function assertFunction(owner, name) {
  if (typeof owner?.[name] !== 'function') throw new Error(`Workspace requires capability method: ${name}`);
}

function assertId(owner, name) {
  if (!String(owner?.[name] || '').trim()) throw new Error(`Workspace requires capability id: ${name}`);
}

/** Validate and narrow the capability surface injected by the canonical shell. */
export function resolveWorkspaceCapabilities({ capabilities = {} } = {}) {
  const filesystem = capabilities.filesystem;
  for (const name of [
    'allNodes',
    'childrenOf',
    'createFile',
    'createFolder',
    'formatSize',
    'getNode',
    'readFileBlob',
    'renameNode',
    'trashNode',
  ]) assertFunction(filesystem, name);
  for (const name of ['documentsId', 'picturesId', 'musicId']) assertId(filesystem, name);
  assertFunction(capabilities.apps, 'open');
  assertFunction(capabilities.notifications, 'notify');
  assertFunction(capabilities.sound, 'play');
  return Object.freeze({
    apps: capabilities.apps,
    filesystem,
    notifications: capabilities.notifications,
    sound: capabilities.sound,
  });
}
