(() => {
  'use strict';
  const W=window.AIZANOI_WORKSPACE,A=window.AIZANOI_ARCHIVE,P=window.AIZANOI_PLATFORM,S=window.AIZANOI_OS_STATE;
  if(!W||!A||!P||!S)return;
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)], esc=W.escapeHtml;
  let selectedFile=null,selectedNote=null;

  function fileRow(record,mode='grid'){
    const size=record.size||(record.text?new Blob([record.text]).size:0);
    return `<button class="az-archive-item ${mode==='list'?'list':''}" data-file-id="${esc(record.id)}" type="button"><span class="az-file-icon"><img src="${A.iconFor(record)}" alt=""></span><span class="az-file-copy"><strong>${esc(record.name)}</strong><small>${esc(record.kind==='note'?'FIELD NOTE':record.kind.toUpperCase())} · ${P.formatBytes(size)}</small></span><span class="az-file-updated">${W.relativeDate(record.updatedAt)}</span></button>`;
  }

  async function renderArchive(win){
    const body=$('[data-workbench-body="archive"]',win);const payload=W.activePayload.get('archive')||{};
    const collection=payload.collection||win.dataset.collection||'All',query=win.dataset.search||'',mode=win.dataset.view||'grid';
    const all=await A.all();const records=all.filter((item)=>(collection==='All'||item.collection===collection)&&(!query||`${item.name} ${item.kind} ${item.collection}`.toLowerCase().includes(query.toLowerCase())));
    const storage=await P.storageEstimate();
    body.innerHTML=`<div class="az-archive-shell"><aside class="az-archive-sidebar"><div class="az-workbench-brand"><span class="az-brand-sigil">A</span><span><b>FIELD ARCHIVE</b><small>LOCAL RESEARCH LAYER</small></span></div><nav class="az-collection-list" aria-label="Archive collections">${['All',...A.collections].map((name)=>`<button type="button" class="${name===collection?'active':''}" data-collection="${name}"><span>${name}</span><small>${name==='All'?all.length:''}</small></button>`).join('')}</nav><div class="az-storage-card"><span>LOCAL STORAGE</span><b>${P.formatBytes(storage.usage)} / ${P.formatBytes(storage.quota)}</b><i><em style="width:${storage.percent.toFixed(1)}%"></em></i><small>No account · this browser only</small></div></aside><section class="az-archive-main"><header class="az-workbench-toolbar"><div><span class="az-kicker">ARCHIVE / ${esc(collection.toUpperCase())}</span><h2>${esc(collection==='All'?'Research inventory':collection)}</h2></div><div class="az-toolbar-spacer"></div><label class="az-search-field"><span>⌕</span><input data-archive-search placeholder="Search archive" value="${esc(query)}"></label><button type="button" class="az-tool-btn" data-archive-action="view">${mode==='grid'?'List':'Grid'}</button><button type="button" class="az-tool-btn" data-archive-action="folder">Local folder</button><button type="button" class="az-tool-btn primary" data-archive-action="import">Import</button><button type="button" class="az-tool-btn accent" data-archive-action="note">New note</button></header><div class="az-archive-dropzone ${records.length?'':'empty'}" data-archive-drop>${records.length?`<div class="az-archive-items ${mode}">${records.map((r)=>fileRow(r,mode)).join('')}</div>`:'<div class="az-empty-state"><div class="az-empty-orbit">＋</div><h3>Drop research material here</h3><p>CSV, JSON, PDF, Markdown, text and images stay locally in your browser.</p><button type="button" class="az-tool-btn primary" data-archive-action="import">Choose files</button></div>'}</div><footer class="az-workbench-status"><span>${records.length} item${records.length===1?'':'s'}</span><span>LOCAL ONLY</span><span>SPACE · Quick Look</span><span>RIGHT CLICK · Actions</span></footer><input type="file" data-archive-file-input multiple hidden accept=".csv,.json,.pdf,.md,.markdown,.txt,.log,.png,.jpg,.jpeg,.webp,.gif,.svg,text/*,image/*,application/pdf"></section></div>`;
    win.dataset.collection=collection;wireArchive(win);
  }

  function wireArchive(win){
    const body=$('[data-workbench-body="archive"]',win),input=$('[data-archive-file-input]',body),drop=$('[data-archive-drop]',body);
    body.onclick=async(event)=>{
      const action=event.target.closest('[data-archive-action]')?.dataset.archiveAction;
      if(action==='import')input?.click();
      if(action==='folder'){await A.importLocalFolder();await W.refresh('archive');}
      if(action==='note'){const note=await A.createNote('Field note','');selectedNote=note.id;W.open('notes',{recordId:note.id});}
      if(action==='view'){win.dataset.view=win.dataset.view==='list'?'grid':'list';W.refresh('archive');}
      const collection=event.target.closest('[data-collection]')?.dataset.collection;
      if(collection){win.dataset.collection=collection;W.activePayload.set('archive',{collection});W.refresh('archive');}
      const item=event.target.closest('[data-file-id]');if(item){selectedFile=item.dataset.fileId;$$('.az-archive-item',body).forEach((node)=>node.classList.toggle('selected',node.dataset.fileId===selectedFile));}
    };
    body.ondblclick=async(event)=>{const id=event.target.closest('[data-file-id]')?.dataset.fileId;if(id)W.openRecord(await A.get(id));};
    body.oncontextmenu=async(event)=>{const id=event.target.closest('[data-file-id]')?.dataset.fileId;if(!id)return;event.preventDefault();selectedFile=id;showFileMenu(await A.get(id),event.clientX,event.clientY);};
    let timer;$('[data-archive-search]',body)?.addEventListener('input',(event)=>{clearTimeout(timer);win.dataset.search=event.target.value;timer=setTimeout(()=>W.refresh('archive'),140);});
    input?.addEventListener('change',async()=>{await A.importFiles(input.files,'picker');input.value='';await W.refresh('archive');});
    drop?.addEventListener('dragover',(event)=>{event.preventDefault();drop.classList.add('dragging');});drop?.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
    drop?.addEventListener('drop',async(event)=>{event.preventDefault();event.stopPropagation();drop.classList.remove('dragging');await A.importFiles(event.dataTransfer.files,'drop');await W.refresh('archive');});
    win.onkeydown=async(event)=>{if(event.key===' '&&selectedFile&&!/INPUT|TEXTAREA/.test(event.target.tagName)){event.preventDefault();W.quickLook(await A.get(selectedFile));}if(event.key==='Enter'&&selectedFile&&!/INPUT|TEXTAREA/.test(event.target.tagName))W.openRecord(await A.get(selectedFile));};
  }

  async function showFileMenu(record,x,y){
    if(!record)return;document.querySelector('.az-file-menu')?.remove();const menu=document.createElement('div');menu.className='az-file-menu';menu.style.left=`${Math.min(x,innerWidth-230)}px`;menu.style.top=`${Math.min(y,innerHeight-300)}px`;
    menu.innerHTML='<button data-action="open">Open <span>↗</span></button><button data-action="preview">Quick Look <span>Space</span></button><div></div><button data-action="notes">Send to Field Notes</button><div></div><button data-action="rename">Rename</button><button class="danger" data-action="delete">Delete</button>';document.body.appendChild(menu);
    menu.onclick=async(event)=>{const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;menu.remove();if(action==='open')W.openRecord(record);if(action==='preview')W.quickLook(record);if(action==='notes')W.sendToNotes(record);if(action==='rename'){const next=prompt('Rename archive item:',record.name);if(next){await A.rename(record.id,next);W.refresh('archive');}}if(action==='delete'&&confirm(`Delete "${record.name}" from this browser?`)){await A.remove(record.id);selectedFile=null;W.refresh('archive');}};
    setTimeout(()=>document.addEventListener('pointerdown',function close(event){if(!menu.contains(event.target)){menu.remove();document.removeEventListener('pointerdown',close,true);}},{capture:true,once:false}),0);
  }

  async function notesList(){return (await A.all()).filter((item)=>item.collection==='Notes'||item.kind==='note');}
  async function renderNotes(win,payload={}){
    const body=$('[data-workbench-body="notes"]',win);let notes=await notesList();if(!notes.length)notes=[await A.createNote('Field note','')];
    const recordId=payload.recordId||selectedNote||notes[0].id;let record=await A.get(recordId);if(!record)record=notes[0];selectedNote=record.id;W.activePayload.set('notes',{recordId:record.id});
    body.innerHTML=`<div class="az-notes-shell"><aside class="az-notes-list"><header><span>FIELD NOTES</span><button type="button" data-notes-action="new" aria-label="New note">＋</button></header><div>${notes.map((note)=>`<button type="button" class="${note.id===record.id?'active':''}" data-note-id="${note.id}"><strong>${esc(note.name.replace(/\.md$/i,''))}</strong><small>${W.relativeDate(note.updatedAt)}</small></button>`).join('')}</div></aside><section class="az-note-editor"><header class="az-workbench-toolbar"><input class="az-note-title" data-note-title value="${esc(record.name.replace(/\.md$/i,''))}" aria-label="Note title"><div class="az-toolbar-spacer"></div><span class="az-save-state" data-note-state>SAVED LOCALLY</span><button class="az-tool-btn" data-notes-action="export">Export MD</button></header><textarea class="az-note-area" data-note-area spellcheck="true" placeholder="Field observation, research note, analysis…">${esc(record.text||'')}</textarea><footer class="az-workbench-status"><span>LOCAL NOTE</span><span data-note-count>${(record.text||'').length} CHARACTERS</span><span>Never sent to AI</span></footer></section></div>`;
    const area=$('[data-note-area]',body),title=$('[data-note-title]',body);let timer;
    const save=async()=>{clearTimeout(timer);$('[data-note-state]',body).textContent='SAVING…';record.name=`${title.value.trim()||'Untitled field note'}.md`;record.text=area.value;record.size=new Blob([area.value]).size;record.kind='note';record.collection='Notes';record=await A.put(record);$('[data-note-state]',body).textContent='SAVED LOCALLY';$('[data-note-count]',body).textContent=`${area.value.length} CHARACTERS`;};
    const schedule=()=>{$('[data-note-state]',body).textContent='EDITED';clearTimeout(timer);timer=setTimeout(save,420);};area.oninput=schedule;title.oninput=schedule;
    body.onclick=async(event)=>{const button=event.target.closest('[data-note-id]');if(button){await save();selectedNote=button.dataset.noteId;renderNotes(win,{recordId:selectedNote});return;}const action=event.target.closest('[data-notes-action]')?.dataset.notesAction;if(action==='new'){await save();const next=await A.createNote('Field note','');selectedNote=next.id;renderNotes(win,{recordId:next.id});}if(action==='export'){await save();W.downloadBlob(new Blob([area.value],{type:'text/markdown'}),`${title.value.trim()||'field-note'}.md`);}};
    const state=(()=>{try{return openWindows.get('notes');}catch(_){return null;}})();if(state)state.workbenchCleanup=()=>{clearTimeout(timer);save().catch(()=>{});};
  }

  W.registerRenderer('archive',renderArchive);W.registerRenderer('notes',renderNotes);
  P.on('archive:changed',()=>{W.refresh('archive');});
})();