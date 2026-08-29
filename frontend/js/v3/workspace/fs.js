/**
 * Aizanoi Workspace — virtual file system core.
 *
 * A small IndexedDB-backed document store for the AizanoiOS desktop:
 * Notepad documents, Camera photos and audio clips live here. Files are
 * always local to the browser; nothing is uploaded anywhere.
 *
 * Model (inspired by the MIT-licensed win32.run fs.js design, reimplemented
 * for vanilla JS): a flat map of nodes keyed by id.
 *   { id, kind:'file'|'folder', name, parent, children:[], createdAt, updatedAt,
 *     mime, size, blob?(File|Blob) }
 *
 * Special folders are stable ids so the shell can always find them:
 *   root /documents /pictures /music /system
 */

const DB_NAME = 'aizanoi-workspace';
const DB_VERSION = 1;
const STORE = 'files';

export const ROOT_ID = 'root';
export const DOCUMENTS_ID = 'folder-documents';
export const PICTURES_ID = 'folder-pictures';
export const MUSIC_ID = 'folder-music';
export const RECYCLE_ID = 'folder-recycle';

const SPECIAL_FOLDERS = [
  { id: ROOT_ID, name: 'Workspace', parent: null, locked: true },
  { id: DOCUMENTS_ID, name: 'Documents', parent: ROOT_ID, locked: true },
  { id: PICTURES_ID, name: 'Pictures', parent: ROOT_ID, locked: true },
  { id: MUSIC_ID, name: 'Music', parent: ROOT_ID, locked: true },
  { id: RECYCLE_ID, name: 'Recycle Bin', parent: null, locked: true },
];

const LOCKED_IDS = new Set(SPECIAL_FOLDERS.filter((f) => f.locked).map((f) => f.id));

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Workspace storage unavailable'));
  });
  return dbPromise;
}

function tx(db, mode = 'readonly') {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Workspace request failed'));
  });
}

export function newId(prefix = 'f') {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export async function allNodes() {
  const db = await openDb();
  const nodes = await requestAsPromise(tx(db).getAll());
  const map = new Map(nodes.map((node) => [node.id, node]));
  let changed = false;
  for (const folder of SPECIAL_FOLDERS) {
    if (!map.has(folder.id)) {
      const node = {
        id: folder.id,
        kind: 'folder',
        name: folder.name,
        parent: folder.parent,
        children: [],
        locked: folder.locked || undefined,
        createdAt: 0,
        updatedAt: 0,
      };
      map.set(node.id, node);
      changed = true;
    }
  }
  if (changed) {
    const db2 = await openDb();
    const store = tx(db2, 'readwrite');
    for (const folder of SPECIAL_FOLDERS) {
      if (!nodes.some((node) => node.id === folder.id)) {
        store.put(map.get(folder.id));
      }
    }
  }
  return map;
}

export async function getNode(id) {
  if (!id) return null;
  const db = await openDb();
  return requestAsPromise(tx(db).get(id));
}

export async function childrenOf(id) {
  const map = await allNodes();
  const parent = map.get(id);
  if (!parent || !Array.isArray(parent.children)) return [];
  return parent.children.map((childId) => map.get(childId)).filter(Boolean);
}

export async function putNode(node) {
  const db = await openDb();
  await requestAsPromise(tx(db, 'readwrite').put(node));
  return node;
}

export async function createFile({ name, parent, blob, mime }) {
  const parentId = parent || DOCUMENTS_ID;
  const map = await allNodes();
  const parentNode = map.get(parentId);
  if (!parentNode || parentNode.kind !== 'folder') throw new Error('Target folder is missing');
  const now = Date.now();
  const node = {
    id: newId('file'),
    kind: 'file',
    name: String(name || 'untitled'),
    parent: parentNode.id,
    children: [],
    mime: mime || (blob && blob.type) || 'application/octet-stream',
    size: blob ? blob.size : 0,
    blob: blob || null,
    createdAt: now,
    updatedAt: now,
  };
  parentNode.children = [...(parentNode.children || []), node.id];
  parentNode.updatedAt = now;
  await putNode(node);
  await putNode(parentNode);
  return node;
}

export async function createFolder({ name, parent }) {
  const parentId = parent || DOCUMENTS_ID;
  const map = await allNodes();
  const parentNode = map.get(parentId);
  if (!parentNode || parentNode.kind !== 'folder') throw new Error('Target folder is missing');
  const now = Date.now();
  const node = {
    id: newId('folder'),
    kind: 'folder',
    name: String(name || 'New folder'),
    parent: parentNode.id,
    children: [],
    createdAt: now,
    updatedAt: now,
  };
  parentNode.children = [...(parentNode.children || []), node.id];
  parentNode.updatedAt = now;
  await putNode(node);
  await putNode(parentNode);
  return node;
}

export async function renameNode(id, name) {
  const node = await getNode(id);
  if (!node) throw new Error('Item not found');
  if (node.locked) throw new Error('System items cannot be renamed');
  node.name = String(name || node.name);
  node.updatedAt = Date.now();
  await putNode(node);
  return node;
}

export async function updateFileContent(id, blob) {
  const node = await getNode(id);
  if (!node || node.kind !== 'file') throw new Error('File not found');
  node.blob = blob;
  node.size = blob ? blob.size : 0;
  node.mime = (blob && blob.type) || node.mime;
  node.updatedAt = Date.now();
  await putNode(node);
  return node;
}

export async function readFileBlob(id) {
  const node = await getNode(id);
  if (!node || node.kind !== 'file') return null;
  return node.blob || null;
}

async function detachFromParent(node) {
  if (!node.parent) return;
  const parent = await getNode(node.parent);
  if (parent && Array.isArray(parent.children)) {
    parent.children = parent.children.filter((childId) => childId !== node.id);
    parent.updatedAt = Date.now();
    await putNode(parent);
  }
  node.parent = null;
}

/** Move a node into the Recycle Bin (or delete permanently if already there). */
export async function trashNode(id) {
  const node = await getNode(id);
  if (!node) return false;
  if (node.locked) throw new Error('System items cannot be deleted');
  if (node.parent === RECYCLE_ID || node.id === RECYCLE_ID) {
    return deleteNode(id);
  }
  await detachFromParent(node);
  node.updatedAt = Date.now();
  const bin = await getNode(RECYCLE_ID);
  bin.children = [...(bin.children || []), node.id];
  node.parent = RECYCLE_ID;
  await putNode(bin);
  await putNode(node);
  return true;
}

/** Recursively delete a node and everything under it. */
export async function deleteNode(id) {
  const node = await getNode(id);
  if (!node) return false;
  if (node.locked) throw new Error('System items cannot be deleted');
  await detachFromParent(node);
  const collect = async (current) => {
    for (const childId of current.children || []) {
      const child = await getNode(childId);
      if (child) await collect(child);
    }
    const db = await openDb();
    await requestAsPromise(tx(db, 'readwrite').delete(current.id));
  };
  await collect(node);
  return true;
}

/** Restore a recycled item to its original parent when possible, else Documents. */
export async function restoreNode(id) {
  const node = await getNode(id);
  if (!node) return false;
  if (node.parent !== RECYCLE_ID) return false;
  const bin = await getNode(RECYCLE_ID);
  bin.children = (bin.children || []).filter((childId) => childId !== node.id);
  await putNode(bin);
  const map = await allNodes();
  const target = node.previousParent && map.has(node.previousParent) ? node.previousParent : DOCUMENTS_ID;
  const parentNode = map.get(target);
  node.parent = parentNode.id;
  node.previousParent = undefined;
  parentNode.children = [...(parentNode.children || []), node.id];
  parentNode.updatedAt = Date.now();
  await putNode(parentNode);
  await putNode(node);
  return true;
}

export async function emptyRecycleBin() {
  const bin = await getNode(RECYCLE_ID);
  for (const childId of [...(bin.children || [])]) {
    await deleteNode(childId);
  }
  bin.children = [];
  await putNode(bin);
  return true;
}

export function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
