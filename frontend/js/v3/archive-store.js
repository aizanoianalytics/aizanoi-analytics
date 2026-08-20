const DB_NAME = 'aizanoi-field-archive';
const STORE = 'items';
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 48 * 1024 * 1024;
const BUNDLE_VERSION = 1;
const VALID_KINDS = new Set(['dataset','pdf','image','markdown','text','note','file']);
export const COLLECTIONS = Object.freeze(['Notes','Sources','Screenshots','Datasets','Exports','Uploads']);
let databasePromise = null;
let initialized = false;

const extension = (name='') => String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
const uid = (prefix='item') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const finiteNumber = (value, fallback=0) => { const n=Number(value); return Number.isFinite(n) ? n : fallback; };
const boundedString = (value, max=1024) => String(value ?? '').slice(0,max);

export function kindFor(name='', mime='') {
  const ext = extension(name);
  if (['csv','json'].includes(ext) || /(?:csv|json)/i.test(mime)) return 'dataset';
  if (ext === 'pdf' || /pdf/i.test(mime)) return 'pdf';
  if (['png','jpg','jpeg','webp','gif','svg'].includes(ext) || /^image\//i.test(mime)) return 'image';
  if (['md','markdown'].includes(ext)) return 'markdown';
  if (['txt','log','xml','yaml','yml'].includes(ext) || /^text\//i.test(mime)) return 'text';
  return 'file';
}

export function collectionForKind(kind) {
  if (kind === 'dataset') return 'Datasets';
  if (kind === 'image') return 'Screenshots';
  if (kind === 'note') return 'Notes';
  if (['pdf','markdown','text'].includes(kind)) return 'Sources';
  return 'Uploads';
}

export function iconFor(record) {
  return ({
    dataset:'/assets/icons/data-lab.svg', pdf:'/assets/icons/source-reader.svg', markdown:'/assets/icons/source-reader.svg', text:'/assets/icons/source-reader.svg',
    note:'/assets/icons/notepad.svg', image:'/assets/icons/artifact-viewer.svg', file:'/assets/icons/field-archive.svg'
  })[record?.kind] || '/assets/icons/field-archive.svg';
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE) ? request.transaction.objectStore(STORE) : db.createObjectStore(STORE, { keyPath:'id' });
      if (!store.indexNames.contains('collection')) store.createIndex('collection','collection',{ unique:false });
      if (!store.indexNames.contains('updatedAt')) store.createIndex('updatedAt','updatedAt',{ unique:false });
      if (!store.indexNames.contains('kind')) store.createIndex('kind','kind',{ unique:false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Field Archive could not open.'));
  });
  return databasePromise;
}

async function run(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result;
    try { result = operation(tx.objectStore(STORE)); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Archive transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('Archive transaction aborted.'));
  });
}

function normalizeMeta(meta, fallbackTitle='Untitled') {
  const raw = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
  const clean = {
    title:boundedString(raw.title || fallbackTitle, 500),
    place:boundedString(raw.place, 500),
    period:boundedString(raw.period, 500),
    source:boundedString(raw.source, 1200),
    rights:boundedString(raw.rights, 1200),
    evidence:boundedString(raw.evidence, 64),
    tags:Array.isArray(raw.tags) ? raw.tags.map((tag) => boundedString(tag,128)).filter(Boolean).slice(0,30) : []
  };
  if (raw.system === true) clean.system = true;
  const lastModified = finiteNumber(raw.lastModified, NaN);
  if (Number.isFinite(lastModified) && lastModified >= 0) clean.lastModified = lastModified;
  if (raw.linkedRecord != null) clean.linkedRecord = boundedString(raw.linkedRecord, 256);
  return clean;
}

function normalize(record={}) {
  const now = Date.now();
  const name = boundedString(record.name || 'Untitled', 1024) || 'Untitled';
  const proposedKind = boundedString(record.kind, 32);
  const kind = VALID_KINDS.has(proposedKind) ? proposedKind : kindFor(name, record.mime);
  const rawSize = Math.max(0, finiteNumber(record.size, 0));
  const createdAt = Math.max(0, finiteNumber(record.createdAt, now));
  return {
    id:boundedString(record.id || uid(kind), 256) || uid(kind),
    name,
    kind,
    mime:boundedString(record.mime, 256),
    size:rawSize,
    collection:COLLECTIONS.includes(record.collection) ? record.collection : collectionForKind(kind),
    createdAt,
    updatedAt:now,
    text:typeof record.text === 'string' ? record.text : null,
    blob:record.blob instanceof Blob ? record.blob : null,
    meta:normalizeMeta(record.meta, name)
  };
}

async function putRaw(record) {
  const item = normalize(record);
  await run('readwrite', (store) => store.put(item));
  window.dispatchEvent(new CustomEvent('aizanoi:archive-change', { detail:{ type:'put', item } }));
  return item;
}

async function seed() {
  if (initialized) return;
  initialized = true;
  const existing = await allRaw();
  if (existing.length) return;
  const sample = `# Temple of Zeus — sample field record\n\nThis sample record demonstrates how Aizanoi Field Archive separates a source-led observation from reconstruction interpretation.\n\n## Observation\nThe Temple of Zeus is the principal monumental focus of the Aizanoi Historical World. Use the world experience to inspect the reconstructed context, then return here to record your own observation.\n\n## Evidence note\nGeometry and surrounding fabric use different evidence confidence levels. Named monuments remain distinct from explicitly inferred urban massing.\n\n## Next steps\n- Open Historical Worlds and walk Aizanoi.\n- Return to Field Notes and create an observation.\n- Import your own PDF, Markdown, CSV or image records.\n`;
  await putRaw({
    id:'sample-temple-zeus', name:'Temple of Zeus — sample field record.md', kind:'markdown', mime:'text/markdown', collection:'Sources', text:sample, size:new Blob([sample]).size,
    meta:{ title:'Temple of Zeus — sample field record', place:'Aizanoi · Çavdarhisar', period:'Roman Imperial', source:'Aizanoi Field System sample', rights:'Local demonstration record', evidence:'archaeological', tags:['Aizanoi','Temple of Zeus','sample'], system:true }
  });
  const guide = `# Welcome to Aizanoi Field Archive\n\nEverything here remains in this browser unless you explicitly export or download it.\n\nImport CSV/JSON for Data Lab, PDF/Markdown/text for Source Reader, images for Artifact Viewer, or create local Field Notes. Browser storage can be cleared by the user or browser, so export anything you need to preserve long-term.`;
  await putRaw({
    id:'system-field-guide', name:'Welcome to Aizanoi Field Archive.md', kind:'markdown', mime:'text/markdown', collection:'Sources', text:guide, size:new Blob([guide]).size,
    meta:{ title:'Welcome to Aizanoi Field Archive', source:'Aizanoi Field System', rights:'Local system guide', evidence:'documented', tags:['guide'], system:true }
  });
}

async function allRaw() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE,'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result || []).sort((a,b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)));
    request.onerror = () => reject(request.error);
  });
}

export async function all() { await seed(); return allRaw(); }
export async function get(id) { await seed(); const db=await openDatabase(); return new Promise((resolve,reject)=>{ const req=db.transaction(STORE,'readonly').objectStore(STORE).get(id); req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error); }); }
export async function put(record) { await seed(); return putRaw(record); }
export async function remove(id) { await seed(); await run('readwrite',(store)=>store.delete(id)); window.dispatchEvent(new CustomEvent('aizanoi:archive-change',{detail:{type:'delete',id}})); }
export async function rename(id, name) { const item=await get(id); if(!item) return null; return putRaw({ ...item, name:String(name||'').trim() || item.name, meta:{...item.meta,title:String(name||'').replace(/\.[^.]+$/,'') || item.meta?.title} }); }
export async function updateMetadata(id, meta) { const item=await get(id); if(!item) return null; return putRaw({ ...item, meta:{ ...item.meta, ...(meta || {}) } }); }

export async function createNote(name='Untitled field note', text='', meta={}) {
  const filename = name.toLowerCase().endsWith('.md') ? name : `${name}.md`;
  return put({ name:filename, kind:'note', mime:'text/markdown', collection:'Notes', text, size:new Blob([text]).size, meta:{ title:name.replace(/\.md$/i,''), evidence:'documented', ...meta } });
}

async function recordFromFile(file) {
  if (!(file instanceof File)) throw new Error('Unsupported file.');
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} exceeds the 25 MB local archive limit.`);
  const kind = kindFor(file.name, file.type);
  const text = ['dataset','markdown','text'].includes(kind) ? await file.text() : null;
  return put({ name:file.name, mime:file.type, size:file.size, kind, collection:collectionForKind(kind), text, blob:file, meta:{ title:file.name.replace(/\.[^.]+$/,''), source:'Local import', rights:'User-provided', evidence:'documented', lastModified:file.lastModified || null, tags:[] } });
}

export async function importFiles(files) {
  const imported=[];
  for (const file of [...(files || [])]) {
    try { imported.push(await recordFromFile(file)); } catch (error) { window.dispatchEvent(new CustomEvent('aizanoi:notify',{detail:{title:'Import skipped',body:error.message,kind:'warning'}})); }
  }
  return imported;
}

function bytesToBase64(bytes) {
  let binary='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary=atob(value);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  return bytes;
}

async function serializeRecord(record) {
  let binary=null;
  if(record.blob instanceof Blob) {
    const bytes=new Uint8Array(await record.blob.arrayBuffer());
    binary={ type:record.blob.type || record.mime || 'application/octet-stream', base64:bytesToBase64(bytes) };
  }
  return {
    id:record.id,
    name:record.name,
    kind:record.kind,
    mime:record.mime,
    size:record.size,
    collection:record.collection,
    createdAt:record.createdAt,
    updatedAt:record.updatedAt,
    text:record.text,
    meta:record.meta,
    binary
  };
}

export async function exportBundle() {
  const records=await all();
  const estimated=records.reduce((sum,record)=>sum+Number(record.size||0),0);
  if(estimated>MAX_BUNDLE_BYTES) throw new Error('Archive is too large for a single portable browser bundle. Export smaller source sets instead.');
  const serialized=[];
  for(const record of records) serialized.push(await serializeRecord(record));
  return {
    format:'aizanoi-field-archive',
    version:BUNDLE_VERSION,
    exportedAt:new Date().toISOString(),
    app:'Aizanoi Field System',
    records:serialized
  };
}

export async function restoreBundle(bundle,{replace=false}={}) {
  const value=typeof bundle==='string'?JSON.parse(bundle):bundle;
  if(!value||value.format!=='aizanoi-field-archive'||Number(value.version)!==BUNDLE_VERSION||!Array.isArray(value.records)) throw new Error('Unsupported Field Archive bundle.');
  if(value.records.length>5000) throw new Error('Archive bundle contains too many records.');
  if(replace) await run('readwrite',(store)=>store.clear());
  let restored=0;
  for(const source of value.records) {
    if(!source||typeof source!=='object'||Array.isArray(source)) continue;
    const restoredText=typeof source.text==='string'?source.text:null;
    const restoredTextSize=restoredText===null?0:new Blob([restoredText]).size;
    if(restoredTextSize>MAX_FILE_BYTES) throw new Error(`${source.name||'A record'} exceeds the per-file restore limit.`);
    let blob=null;
    if(source.binary?.base64) {
      const encoded=String(source.binary.base64);
      if(encoded.length>Math.ceil(MAX_FILE_BYTES*4/3)+8) throw new Error(`${source.name||'A record'} exceeds the per-file restore limit.`);
      const bytes=base64ToBytes(encoded);
      if(bytes.byteLength>MAX_FILE_BYTES) throw new Error(`${source.name||'A record'} exceeds the per-file restore limit.`);
      blob=new Blob([bytes],{type:boundedString(source.binary.type||source.mime||'application/octet-stream',256)});
    }
    const claimedSize=Math.max(0,finiteNumber(source.size,0));
    const restoredSize=blob ? blob.size : restoredText!==null ? restoredTextSize : Math.min(MAX_FILE_BYTES,claimedSize);
    await putRaw({
      ...source,
      id:boundedString(source.id||uid(source.kind||'item'),256),
      name:boundedString(source.name||'Restored record',1024),
      size:restoredSize,
      blob,
      text:restoredText,
      meta:normalizeMeta(source.meta, source.name || 'Restored record')
    });
    restored++;
  }
  window.dispatchEvent(new CustomEvent('aizanoi:archive-change',{detail:{type:'restore',count:restored}}));
  return restored;
}

export async function downloadBundle(filename='aizanoi-field-archive.json') {
  const bundle=await exportBundle();
  const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download=filename;anchor.rel='noopener';document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  return bundle.records.length;
}

export async function storageEstimate() {
  try {
    if (!navigator.storage?.estimate) return { usage:0, quota:0, percent:0 };
    const { usage=0, quota=0 } = await navigator.storage.estimate();
    return { usage, quota, percent:quota ? Math.min(100, usage / quota * 100) : 0 };
  } catch (_) { return { usage:0, quota:0, percent:0 }; }
}

export const archiveStore = Object.freeze({ DB_NAME, STORE, MAX_FILE_BYTES, MAX_BUNDLE_BYTES, BUNDLE_VERSION, COLLECTIONS, kindFor, collectionForKind, iconFor, all, get, put, remove, rename, updateMetadata, createNote, importFiles, exportBundle, restoreBundle, downloadBundle, storageEstimate });
