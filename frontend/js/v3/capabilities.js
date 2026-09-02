const providerCache = new Map();

function cachedProvider(name, loader) {
  if (!providerCache.has(name)) {
    const pending = Promise.resolve().then(loader).catch((error) => { providerCache.delete(name); throw error; });
    providerCache.set(name, pending);
  }
  return providerCache.get(name);
}

async function filesystemCapability() {
  const fs = await import('./workspace/fs.js');
  const backup = await import('./workspace/backup.js');
  return Object.freeze({
    documentsId:fs.DOCUMENTS_ID, picturesId:fs.PICTURES_ID, recycleId:fs.RECYCLE_ID, musicId:fs.MUSIC_ID,
    allNodes:fs.allNodes, getNode:fs.getNode, readFileBlob:fs.readFileBlob, childrenOf:fs.childrenOf,
    createFile:fs.createFile, createFolder:fs.createFolder, renameNode:fs.renameNode, trashNode:fs.trashNode,
    updateFileContent:fs.updateFileContent, formatSize:fs.formatSize, emptyRecycleBin:fs.emptyRecycleBin,
    restoreNode:fs.restoreNode, deleteNode:fs.deleteNode,
    exportBackup:backup.exportWorkspaceBackup, importBackup:backup.importWorkspaceBackup,
    storageStatus:backup.workspaceStorageStatus, requestPersistence:backup.requestWorkspacePersistence,
  });
}

async function dialogCapability() {
  const dialogs = await import('./workspace/dialog.js');
  return Object.freeze({ confirm:dialogs.aizanoiDialog, prompt:dialogs.aizanoiPrompt });
}
async function soundCapability() { const sounds = await import('./workspace/sounds.js'); return Object.freeze({ play:(...args) => sounds.playSound(...args) }); }
async function mediaCapability() {
  return Object.freeze({
    isAvailable:() => typeof globalThis.navigator?.mediaDevices?.getUserMedia === 'function',
    getUserMedia:(constraints) => {
      const fn = globalThis.navigator?.mediaDevices?.getUserMedia;
      return typeof fn === 'function' ? fn.call(globalThis.navigator.mediaDevices, constraints) : Promise.reject(new Error('Media capture is unavailable in this browser.'));
    },
  });
}
async function appsCapability() { return Object.freeze({ open:(appId, options={}) => { const runtime=globalThis.AIZANOI_OS; if(typeof runtime?.openApp!=='function')throw new Error('AizanoiOS app navigation is unavailable.'); return runtime.openApp(appId,options); } }); }
async function worldsCapability() {
  const { WORLDS } = await import('./registry.js');
  const catalog = Object.freeze(WORLDS.map((world) => Object.freeze({ ...world })));
  return Object.freeze({
    list:() => catalog,
    currentSession:() => { const runtime=globalThis.AIZANOI_OS; if(typeof runtime?.store?.getFieldSession!=='function')throw new Error('AizanoiOS field session is unavailable.'); const session=runtime.store.getFieldSession(); return session ? Object.freeze({ ...session }) : null; },
    launch:(worldId,landmark) => { const runtime=globalThis.AIZANOI_OS; if(typeof runtime?.launchWorld!=='function')throw new Error('AizanoiOS world navigation is unavailable.'); return runtime.launchWorld(worldId,landmark); },
  });
}
const SHARED_PROVIDERS=Object.freeze({apps:appsCapability,filesystem:filesystemCapability,dialog:dialogCapability,sound:soundCapability,media:mediaCapability,worlds:worldsCapability});
function requestedNames(required){if(required==null)return[];if(!Array.isArray(required))throw new Error('Application capability requirements must be an array.');const names=required.map((name)=>String(name||'').trim());if(names.some((name)=>!name))throw new Error('Application capability names must be non-empty strings.');return[...new Set(names)].sort((a,b)=>a.localeCompare(b,'en'));}
export async function resolveCapabilities(required=[],hostCapabilities={}){const resolved={};for(const name of requestedNames(required)){if(Object.prototype.hasOwnProperty.call(hostCapabilities,name)){const value=hostCapabilities[name];if(!value)throw new Error(`Application capability unavailable: ${name}`);resolved[name]=value;continue;}const loader=SHARED_PROVIDERS[name];if(!loader)throw new Error(`Application capability unavailable: ${name}`);resolved[name]=await cachedProvider(name,loader);}return Object.freeze(resolved);}
