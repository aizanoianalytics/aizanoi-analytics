const providerCache = new Map();

function cachedProvider(name, loader) {
  if (!providerCache.has(name)) {
    const pending = Promise.resolve()
      .then(loader)
      .catch((error) => {
        providerCache.delete(name);
        throw error;
      });
    providerCache.set(name, pending);
  }
  return providerCache.get(name);
}

async function filesystemCapability() {
  const fs = await import('./workspace/fs.js');
  return Object.freeze({
    documentsId: fs.DOCUMENTS_ID,
    picturesId: fs.PICTURES_ID,
    recycleId: fs.RECYCLE_ID,
    musicId: fs.MUSIC_ID,
    allNodes: fs.allNodes,
    getNode: fs.getNode,
    readFileBlob: fs.readFileBlob,
    childrenOf: fs.childrenOf,
    createFile: fs.createFile,
    createFolder: fs.createFolder,
    renameNode: fs.renameNode,
    trashNode: fs.trashNode,
    updateFileContent: fs.updateFileContent,
    formatSize: fs.formatSize,
    emptyRecycleBin: fs.emptyRecycleBin,
    restoreNode: fs.restoreNode,
    deleteNode: fs.deleteNode,
  });
}

async function dialogCapability() {
  const dialogs = await import('./workspace/dialog.js');
  return Object.freeze({ confirm: dialogs.win98Dialog });
}

async function soundCapability() {
  const sounds = await import('./workspace/sounds.js');
  return Object.freeze({ play: (...args) => sounds.playSound(...args) });
}

async function mediaCapability() {
  return Object.freeze({
    isAvailable: () => typeof globalThis.navigator?.mediaDevices?.getUserMedia === 'function',
    getUserMedia: (constraints) => {
      const getUserMedia = globalThis.navigator?.mediaDevices?.getUserMedia;
      if (typeof getUserMedia !== 'function') {
        return Promise.reject(new Error('Media capture is unavailable in this browser.'));
      }
      return getUserMedia.call(globalThis.navigator.mediaDevices, constraints);
    },
  });
}

async function appsCapability() {
  return Object.freeze({
    open: (appId, options = {}) => {
      const runtime = globalThis.AIZANOI_OS;
      if (typeof runtime?.openApp !== 'function') {
        throw new Error('AizanoiOS app navigation is unavailable.');
      }
      return runtime.openApp(appId, options);
    },
  });
}

const SHARED_PROVIDERS = Object.freeze({
  apps: appsCapability,
  filesystem: filesystemCapability,
  dialog: dialogCapability,
  sound: soundCapability,
  media: mediaCapability,
});

function requestedNames(required) {
  if (required == null) return [];
  if (!Array.isArray(required)) throw new Error('Application capability requirements must be an array.');
  const names = required.map((name) => String(name || '').trim());
  if (names.some((name) => !name)) throw new Error('Application capability names must be non-empty strings.');
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Resolve only the capabilities explicitly declared by a migrated module.
 *
 * Host capabilities are shell-owned surfaces such as notifications. Canonical
 * runtime facades and concrete Workspace implementations stay behind this
 * shared bridge rather than leaking into optional application modules.
 */
export async function resolveCapabilities(required = [], hostCapabilities = {}) {
  const resolved = {};
  for (const name of requestedNames(required)) {
    if (Object.prototype.hasOwnProperty.call(hostCapabilities, name)) {
      const value = hostCapabilities[name];
      if (!value) throw new Error(`Application capability unavailable: ${name}`);
      resolved[name] = value;
      continue;
    }

    const loader = SHARED_PROVIDERS[name];
    if (!loader) throw new Error(`Application capability unavailable: ${name}`);
    resolved[name] = await cachedProvider(name, loader);
  }
  return Object.freeze(resolved);
}
