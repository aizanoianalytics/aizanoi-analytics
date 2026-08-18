(() => {
  'use strict';

  const State = window.AIZANOI_OS_STATE;
  const Platform = window.AIZANOI_PLATFORM;
  if (!State || !Platform || window.AIZANOI_ARCHIVE) return;

  const DB_NAME = 'aizanoi-field-archive';
  const STORE = 'items';
  const COLLECTIONS = Object.freeze(['Notes','Sources','Screenshots','Datasets','Exports','Uploads']);
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  let dbPromise;

  const ext = (name='') => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '');
  const uid = (prefix='item') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

  function kindFor(name, mime='') {
    const x = ext(name);
    if (['csv','json'].includes(x) || /(?:csv|json)/i.test(mime)) return 'dataset';
    if (x === 'pdf' || /pdf/i.test(mime)) return 'pdf';
    if (['png','jpg','jpeg','webp','gif','svg'].includes(x) || /^image\//i.test(mime)) return 'image';
    if (['md','markdown'].includes(x)) return 'markdown';
    if (['txt','log','html','htm','xml','yaml','yml'].includes(x) || /^text\//i.test(mime)) return 'text';
    return 'file';
  }

  function collectionForKind(kind) {
    if (kind === 'dataset') return 'Datasets';
    if (kind === 'image') return 'Screenshots';
    if (kind === 'note') return 'Notes';
    if (['pdf','markdown','text'].includes(kind)) return 'Sources';
    return 'Uploads';
  }

  function iconFor(record) {
    return ({
      dataset:'/assets/icons/data-lab.svg', pdf:'/assets/icons/source-reader.svg',
      markdown:'/assets/icons/source-reader.svg', text:'/assets/icons/source-reader.svg',
      note:'/assets/icons/notepad.svg', image:'/assets/icons/artifact-viewer.svg',
      file:'/assets/icons/field-archive.svg'
    })[record?.kind] || '/assets/icons/field-archive.svg';
  }

  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve,reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        const store = database.objectStoreNames.contains(STORE)
          ? request.transaction.objectStore(STORE)
          : database.createObjectStore(STORE,{keyPath:'id'});
        if (!store.indexNames.contains('collection')) store.createIndex('collection','collection',{unique:false});
        if (!store.indexNames.contains('updatedAt')) store.createIndex('updatedAt','updatedAt',{unique:false});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Field Archive could not open.'));
    });
    return dbPromise;
  }

  async function transaction(mode, operation) {
    const database = await db();
    return new Promise((resolve,reject) => {
      const tx = database.transaction(STORE,mode);
      let value;
      try { value = operation(tx.objectStore(STORE)); }
      catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error || new Error('Archive transaction failed.'));
      tx.onabort = () => reject(tx.error || new Error('Archive transaction aborted.'));
    });
  }

  async function put(record={}) {
    const now = Date.now();
    const kind = record.kind || kindFor(record.name,record.mime);
    const item = {
      id:record.id || uid(kind),
      name:String(record.name || 'Untitled'),
      kind,
      mime:String(record.mime || ''),
      size:Number(record.size || 0),
      collection:COLLECTIONS.includes(record.collection) ? record.collection : collectionForKind(kind),
      createdAt:Number(record.createdAt || now), updatedAt:now,
      text:typeof record.text === 'string' ? record.text : null,
      blob:record.blob instanceof Blob ? record.blob : null,
      meta:record.meta && typeof record.meta === 'object' ? record.meta : {},
    };
    await transaction('readwrite',(store) => store.put(item));
    Platform.emit('archive:changed',{type:'put',item});
    return item;
  }

  async function get(id) {
    const database = await db();
    return new Promise((resolve,reject) => {
      const request = database.transaction(STORE,'readonly').objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function all() {
    const database = await db();
    return new Promise((resolve,reject) => {
      const request = database.transaction(STORE,'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a,b) => b.updatedAt-a.updatedAt));
      request.onerror = () => reject(request.error);
    });
  }

  async function remove(id) {
    await transaction('readwrite',(store) => store.delete(id));
    Platform.emit('archive:changed',{type:'delete',id});
  }

  async function rename(id,name) {
    const item = await get(id);
    if (!item) return null;
    item.name = String(name || '').trim() || item.name;
    return put(item);
  }

  async function readFile(file) {
    if (!(file instanceof File)) throw new Error('Unsupported file.');
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} exceeds the 25 MB local archive limit.`);
    const kind = kindFor(file.name,file.type);
    const text = ['dataset','markdown','text'].includes(kind) ? await file.text() : null;
    return put({name:file.name,mime:file.type,size:file.size,kind,collection:collectionForKind(kind),text,blob:file,meta:{lastModified:file.lastModified||null}});
  }

  async function importFiles(files,source='drop') {
    const imported=[];
    for (const file of [...files].filter((item) => item instanceof File)) {
      try { imported.push(await readFile(file)); }
      catch (error) { Platform.notify('Import skipped',error.message,'warning'); }
    }
    if (imported.length) {
      State.recordActivity(`Imported ${imported.length} archive item${imported.length===1?'':'s'}`,source==='folder'?'Local folder':'Field Archive','archive');
      Platform.notify('Field Archive updated',`${imported.length} item${imported.length===1?'':'s'} added locally.`,'archive');
    }
    return imported;
  }

  async function importLocalFolder() {
    if (!window.showDirectoryPicker) {
      Platform.notify('Local folder access unavailable','This browser does not expose the File System Access API. Use Import Files instead.','warning');
      return [];
    }
    try {
      const handle = await window.showDirectoryPicker({mode:'read'});
      const files=[];
      for await (const entry of handle.values()) {
        if (entry.kind !== 'file') continue;
        files.push(await entry.getFile());
        if (files.length >= 100) break;
      }
      return importFiles(files,'folder');
    } catch (error) {
      if (error?.name !== 'AbortError') Platform.notify('Folder import failed',error.message||String(error),'warning');
      return [];
    }
  }

  async function createNote(name='Untitled field note',text='') {
    return put({name:name.endsWith('.md')?name:`${name}.md`,kind:'note',mime:'text/markdown',collection:'Notes',text,size:new Blob([text]).size});
  }

  async function seed() {
    if ((await all()).length) return;
    await put({
      id:'system-field-guide',name:'Welcome to Aizanoi Field Archive.md',kind:'markdown',collection:'Sources',mime:'text/markdown',
      text:'# Aizanoi Field Archive\n\nThis is the local research layer of Aizanoi OS.\n\n- Drop CSV or JSON files for Data Lab.\n- Drop PDFs, Markdown or text for Source Reader.\n- Drop images for Artifact Viewer.\n- Create Field Notes and send research between apps.\n\nEverything in this archive stays in this browser unless you explicitly download/export it.',
      meta:{system:true}
    });
  }

  async function migrateLegacyNote() {
    try {
      if (localStorage.getItem('aizanoi-field-note-migrated-v1')) return;
      const legacy=localStorage.getItem('aizanoi-notepad-text');
      if (legacy?.trim()) await createNote('Imported legacy note',legacy);
      localStorage.setItem('aizanoi-field-note-migrated-v1','1');
    } catch (_) {}
  }

  const ready = Promise.all([seed(),migrateLegacyNote()]).then(() => true);

  window.AIZANOI_ARCHIVE = Object.freeze({
    DB_NAME, STORE, MAX_FILE_BYTES, collections:[...COLLECTIONS], ready,
    ext, kindFor, collectionForKind, iconFor,
    put,get,all,remove,rename,readFile,importFiles,importLocalFolder,createNote,
  });
})();