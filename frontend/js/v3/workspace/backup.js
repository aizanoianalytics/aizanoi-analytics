/** Aizanoi Workspace backup, restore and browser-storage durability helpers. */
import {
  ensureInitialized,
  allNodes,
  ROOT_ID,
  DOCUMENTS_ID,
  PICTURES_ID,
  MUSIC_ID,
  RECYCLE_ID,
} from './fs.js';

const DB_NAME = 'aizanoi-workspace';
const DB_VERSION = 2;
const STORE = 'files';
const BACKUP_SCHEMA = 'aizanoi-workspace-backup';
const BACKUP_VERSION = 1;
const REQUIRED_IDS = Object.freeze([ROOT_ID, DOCUMENTS_ID, PICTURES_ID, MUSIC_ID, RECYCLE_ID]);

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Workspace backup storage request failed'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Workspace restore failed'));
    transaction.onabort = () => reject(transaction.error || new Error('Workspace restore was aborted'));
  });
}

function openWorkspaceDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Workspace storage unavailable'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath:'id' });
    };
  });
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(''));
}

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function serializeNode(node) {
  const record = {
    id:String(node.id),
    kind:node.kind === 'folder' ? 'folder' : 'file',
    name:String(node.name || ''),
    parent:node.parent == null ? null : String(node.parent),
    children:Array.isArray(node.children) ? node.children.map(String) : [],
    createdAt:Number(node.createdAt) || 0,
    updatedAt:Number(node.updatedAt) || 0,
  };
  if (node.previousParent != null) record.previousParent = String(node.previousParent);
  if (record.kind === 'file') {
    const blob = node.blob instanceof Blob ? node.blob : null;
    record.mime = String(node.mime || blob?.type || 'application/octet-stream');
    record.size = Number(node.size) || blob?.size || 0;
    record.blob = blob ? {
      type:blob.type || record.mime,
      base64:bytesToBase64(await blob.arrayBuffer()),
    } : null;
  }
  return record;
}

function validateArchive(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('This is not an Aizanoi Workspace backup.');
  if (value.schema !== BACKUP_SCHEMA || value.version !== BACKUP_VERSION) throw new Error('Unsupported Workspace backup format.');
  if (!Array.isArray(value.nodes) || !value.nodes.length) throw new Error('Workspace backup contains no files or folders.');

  const ids = new Set();
  const rawById = new Map();
  for (const raw of value.nodes) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Workspace backup contains an invalid record.');
    const id = String(raw.id || '');
    if (!id || ids.has(id)) throw new Error('Workspace backup contains duplicate or missing item identifiers.');
    if (!['folder', 'file'].includes(raw.kind)) throw new Error(`Workspace backup item ${id} has an invalid type.`);
    ids.add(id);
    rawById.set(id, raw);
  }
  for (const id of REQUIRED_IDS) if (!ids.has(id)) throw new Error('Workspace backup is missing required system folders.');

  const decoded = [];
  for (const [id, raw] of rawById) {
    const parent = raw.parent == null ? null : String(raw.parent);
    const children = Array.isArray(raw.children) ? raw.children.map(String) : [];
    if (parent && !ids.has(parent)) throw new Error(`Workspace backup item ${id} points to a missing parent.`);
    if (new Set(children).size !== children.length || children.some((childId) => !ids.has(childId))) throw new Error(`Workspace backup folder ${id} has invalid children.`);
    for (const childId of children) {
      if (String(rawById.get(childId)?.parent ?? '') !== id) throw new Error(`Workspace backup parent/child relationship is inconsistent for ${childId}.`);
    }
    const node = {
      id,
      kind:raw.kind,
      name:String(raw.name || ''),
      parent,
      children,
      createdAt:Number(raw.createdAt) || 0,
      updatedAt:Number(raw.updatedAt) || 0,
    };
    if (raw.previousParent != null) node.previousParent = String(raw.previousParent);
    if (raw.kind === 'file') {
      const blobRecord = raw.blob;
      const mime = String(raw.mime || blobRecord?.type || 'application/octet-stream');
      let blob = null;
      if (blobRecord != null) {
        if (!blobRecord || typeof blobRecord !== 'object' || typeof blobRecord.base64 !== 'string') throw new Error(`Workspace backup file ${id} has invalid binary data.`);
        try { blob = new Blob([base64ToBytes(blobRecord.base64)], { type:String(blobRecord.type || mime) }); }
        catch { throw new Error(`Workspace backup file ${id} has unreadable binary data.`); }
      }
      node.mime = mime;
      node.size = blob?.size || Number(raw.size) || 0;
      node.blob = blob;
    }
    decoded.push(node);
  }

  const root = rawById.get(ROOT_ID);
  const recycle = rawById.get(RECYCLE_ID);
  if (root?.parent != null || recycle?.parent != null) throw new Error('Workspace backup has invalid system-folder roots.');
  return decoded;
}

export async function exportWorkspaceBackup() {
  await ensureInitialized();
  const map = await allNodes();
  const nodes = [];
  for (const node of [...map.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)))) nodes.push(await serializeNode(node));
  const payload = {
    schema:BACKUP_SCHEMA,
    version:BACKUP_VERSION,
    exportedAt:new Date().toISOString(),
    nodes,
  };
  return new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type:'application/json' });
}

export async function importWorkspaceBackup(source) {
  if (!(source instanceof Blob)) throw new Error('Choose an Aizanoi Workspace backup file.');
  let parsed;
  try { parsed = JSON.parse(await source.text()); }
  catch { throw new Error('Workspace backup is not valid JSON.'); }
  const nodes = validateArchive(parsed);

  const db = await openWorkspaceDb();
  try {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    store.clear();
    for (const node of nodes) store.put(node);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
  return { nodeCount:nodes.length, exportedAt:parsed.exportedAt || null };
}

export async function workspaceStorageStatus() {
  const storage = globalThis.navigator?.storage;
  if (!storage) return { supported:false, persisted:null, usage:null, quota:null };
  let persisted = null;
  let usage = null;
  let quota = null;
  try { if (typeof storage.persisted === 'function') persisted = await storage.persisted(); } catch (_) {}
  try {
    if (typeof storage.estimate === 'function') {
      const estimate = await storage.estimate();
      usage = Number.isFinite(estimate?.usage) ? estimate.usage : null;
      quota = Number.isFinite(estimate?.quota) ? estimate.quota : null;
    }
  } catch (_) {}
  return { supported:true, persisted, usage, quota };
}

export async function requestWorkspacePersistence() {
  const storage = globalThis.navigator?.storage;
  if (!storage || typeof storage.persist !== 'function') return null;
  try { return Boolean(await storage.persist()); }
  catch { return false; }
}
