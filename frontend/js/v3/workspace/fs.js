/**
 * Aizanoi Workspace — IndexedDB virtual file system core.
 *
 * Files are local to this browser. Logical mutations that touch a node and its
 * parent/bin now execute in one read-write IndexedDB transaction so concurrent
 * imports cannot lose children references or leave half-finished moves.
 */

const DB_NAME = 'aizanoi-workspace';
const DB_VERSION = 2;
const STORE = 'files';

export const ROOT_ID = 'root';
export const DOCUMENTS_ID = 'folder-documents';
export const PICTURES_ID = 'folder-pictures';
export const MUSIC_ID = 'folder-music';
export const RECYCLE_ID = 'folder-recycle';

const SPECIAL_FOLDERS = [
  { id: ROOT_ID, name: 'Workspace', parent: null, children: [DOCUMENTS_ID, PICTURES_ID, MUSIC_ID] },
  { id: DOCUMENTS_ID, name: 'Documents', parent: ROOT_ID, children: [] },
  { id: PICTURES_ID, name: 'Pictures', parent: ROOT_ID, children: [] },
  { id: MUSIC_ID, name: 'Music', parent: ROOT_ID, children: [] },
  { id: RECYCLE_ID, name: 'Recycle Bin', parent: null, children: [] },
];

const LOCKED_IDS = new Set(SPECIAL_FOLDERS.map((folder) => folder.id));
let dbPromise = null;
let initPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath:'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Workspace storage unavailable'));
  });
  return dbPromise;
}

function objectStore(db, mode = 'readonly') {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Workspace request failed'));
  });
}

/** Serialize a complete logical mutation inside one read-write transaction. */
async function mutateNodes(mutator) {
  await ensureInitialized();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = store.getAll();
    let result;
    let failure = null;

    request.onsuccess = () => {
      try {
        const map = new Map((request.result || []).map((node) => [node.id, node]));
        result = mutator(map, {
          put: (node) => store.put(node),
          delete: (id) => store.delete(id),
        });
      } catch (error) {
        failure = error;
        try { transaction.abort(); } catch (_) {}
      }
    };
    request.onerror = () => { failure = request.error || new Error('Workspace mutation read failed'); };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => { if (!failure) failure = transaction.error || new Error('Workspace mutation failed'); };
    transaction.onabort = () => reject(failure || transaction.error || new Error('Workspace mutation aborted'));
  });
}

export function newId(prefix = 'f') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function ensureInitialized() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const db = await openDb();
    const existing = await requestAsPromise(objectStore(db).getAll());
    const byId = new Map(existing.map((node) => [node.id, node]));
    const writes = [];

    for (const spec of SPECIAL_FOLDERS) {
      const current = byId.get(spec.id);
      if (!current) {
        const created = {
          id:spec.id, kind:'folder', name:spec.name, parent:spec.parent,
          children:[...spec.children], createdAt:0, updatedAt:0,
        };
        byId.set(created.id, created);
        writes.push(created);
        continue;
      }
      let changed = false;
      if (current.parent !== spec.parent) { current.parent = spec.parent; changed = true; }
      if (!Array.isArray(current.children)) { current.children = []; changed = true; }
      if (spec.id === ROOT_ID) {
        const userExtras = current.children.filter((id) => !spec.children.includes(id));
        const repaired = [...new Set([...spec.children, ...userExtras])];
        if (JSON.stringify(current.children) !== JSON.stringify(repaired)) {
          current.children = repaired;
          changed = true;
        }
      }
      if (changed) writes.push(current);
    }

    for (const node of byId.values()) {
      if (LOCKED_IDS.has(node.id) || !Array.isArray(node.children)) continue;
      const valid = node.children.filter((childId) => byId.has(childId));
      if (valid.length !== node.children.length) {
        node.children = valid;
        writes.push(node);
      }
    }

    if (writes.length) {
      const store = objectStore(db, 'readwrite');
      await Promise.all(writes.map((node) => requestAsPromise(store.put(node))));
    }
  })();
  return initPromise;
}

export async function allNodes() {
  await ensureInitialized();
  const db = await openDb();
  const nodes = await requestAsPromise(objectStore(db).getAll());
  return new Map(nodes.map((node) => [node.id, node]));
}

export async function getNode(id) {
  await ensureInitialized();
  if (!id) return null;
  const db = await openDb();
  return requestAsPromise(objectStore(db).get(id));
}

export async function childrenOf(id) {
  const map = await allNodes();
  const parent = map.get(id);
  if (!parent || !Array.isArray(parent.children)) return [];
  return parent.children.map((childId) => map.get(childId)).filter(Boolean);
}

export async function putNode(node) {
  await ensureInitialized();
  const db = await openDb();
  await requestAsPromise(objectStore(db, 'readwrite').put(node));
  return node;
}

export async function createFile({ name, parent, blob, mime }) {
  const parentId = parent || DOCUMENTS_ID;
  return mutateNodes((map, ops) => {
    const parentNode = map.get(parentId);
    if (!parentNode || parentNode.kind !== 'folder') throw new Error('Target folder is missing');
    const now = Date.now();
    const node = {
      id:newId('file'), kind:'file', name:String(name || 'untitled'), parent:parentNode.id,
      children:[], mime:mime || blob?.type || 'application/octet-stream', size:blob?.size || 0,
      blob:blob || null, createdAt:now, updatedAt:now,
    };
    parentNode.children = [...new Set([...(parentNode.children || []), node.id])];
    parentNode.updatedAt = now;
    ops.put(node);
    ops.put(parentNode);
    return node;
  });
}

export async function createFolder({ name, parent }) {
  const parentId = parent || DOCUMENTS_ID;
  return mutateNodes((map, ops) => {
    const parentNode = map.get(parentId);
    if (!parentNode || parentNode.kind !== 'folder') throw new Error('Target folder is missing');
    const now = Date.now();
    const node = {
      id:newId('folder'), kind:'folder', name:String(name || 'New folder'), parent:parentNode.id,
      children:[], createdAt:now, updatedAt:now,
    };
    parentNode.children = [...new Set([...(parentNode.children || []), node.id])];
    parentNode.updatedAt = now;
    ops.put(node);
    ops.put(parentNode);
    return node;
  });
}

export async function renameNode(id, name) {
  return mutateNodes((map, ops) => {
    const node = map.get(id);
    if (!node) throw new Error('Item not found');
    if (LOCKED_IDS.has(node.id)) throw new Error('System items cannot be renamed');
    node.name = String(name || node.name);
    node.updatedAt = Date.now();
    ops.put(node);
    return node;
  });
}

export async function updateFileContent(id, blob) {
  return mutateNodes((map, ops) => {
    const node = map.get(id);
    if (!node || node.kind !== 'file') throw new Error('File not found');
    node.blob = blob;
    node.size = blob?.size || 0;
    node.mime = blob?.type || node.mime;
    node.updatedAt = Date.now();
    ops.put(node);
    return node;
  });
}

export async function readFileBlob(id) {
  const node = await getNode(id);
  return node?.kind === 'file' ? (node.blob || null) : null;
}

function collectSubtree(map, id, found = new Set()) {
  if (found.has(id)) return found;
  const node = map.get(id);
  if (!node) return found;
  found.add(id);
  for (const childId of node.children || []) collectSubtree(map, childId, found);
  return found;
}

function detach(map, ops, node) {
  if (!node.parent) return;
  const parent = map.get(node.parent);
  if (parent && Array.isArray(parent.children)) {
    parent.children = parent.children.filter((childId) => childId !== node.id);
    parent.updatedAt = Date.now();
    ops.put(parent);
  }
}

function deleteInsideMutation(map, ops, id) {
  const node = map.get(id);
  if (!node) return false;
  if (LOCKED_IDS.has(node.id)) throw new Error('System items cannot be deleted');
  detach(map, ops, node);
  for (const deleteId of collectSubtree(map, id)) ops.delete(deleteId);
  return true;
}

/** Move a node into the Recycle Bin (or delete permanently if already there). */
export async function trashNode(id) {
  return mutateNodes((map, ops) => {
    const node = map.get(id);
    if (!node) return false;
    if (LOCKED_IDS.has(node.id)) throw new Error('System items cannot be deleted');
    if (node.parent === RECYCLE_ID) return deleteInsideMutation(map, ops, id);
    const bin = map.get(RECYCLE_ID);
    if (!bin) throw new Error('Recycle Bin is unavailable');
    node.previousParent = node.parent;
    detach(map, ops, node);
    node.parent = RECYCLE_ID;
    node.updatedAt = Date.now();
    bin.children = [...new Set([...(bin.children || []), node.id])];
    bin.updatedAt = Date.now();
    ops.put(node);
    ops.put(bin);
    return true;
  });
}

export async function deleteNode(id) {
  return mutateNodes((map, ops) => deleteInsideMutation(map, ops, id));
}

function usableRestoreParent(map, id) {
  const node = id ? map.get(id) : null;
  if (!node || node.kind !== 'folder' || node.id === RECYCLE_ID) return null;
  let cursor = node;
  const seen = new Set();
  while (cursor?.parent) {
    if (seen.has(cursor.id)) return null;
    seen.add(cursor.id);
    if (cursor.parent === RECYCLE_ID) return null;
    cursor = map.get(cursor.parent);
  }
  return node;
}

/** Restore a recycled item to its original parent when possible, else Documents. */
export async function restoreNode(id) {
  return mutateNodes((map, ops) => {
    const node = map.get(id);
    if (!node || node.parent !== RECYCLE_ID) return false;
    const bin = map.get(RECYCLE_ID);
    const parentNode = usableRestoreParent(map, node.previousParent) || map.get(DOCUMENTS_ID);
    if (!bin || !parentNode) throw new Error('Workspace folders are unavailable');
    bin.children = (bin.children || []).filter((childId) => childId !== node.id);
    bin.updatedAt = Date.now();
    node.parent = parentNode.id;
    delete node.previousParent;
    node.updatedAt = Date.now();
    parentNode.children = [...new Set([...(parentNode.children || []), node.id])];
    parentNode.updatedAt = Date.now();
    ops.put(bin);
    ops.put(parentNode);
    ops.put(node);
    return true;
  });
}

export async function emptyRecycleBin() {
  return mutateNodes((map, ops) => {
    const bin = map.get(RECYCLE_ID);
    if (!bin) return true;
    const ids = new Set();
    for (const childId of bin.children || []) collectSubtree(map, childId, ids);
    for (const id of ids) ops.delete(id);
    bin.children = [];
    bin.updatedAt = Date.now();
    ops.put(bin);
    return true;
  });
}

export function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
