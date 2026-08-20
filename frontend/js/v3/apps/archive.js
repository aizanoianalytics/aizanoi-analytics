import * as Archive from '../archive-store.js';

const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]));
const formatBytes=(bytes)=>{const n=Math.max(0,Number(bytes)||0);if(n<1024)return`${n} B`;if(n<1024*1024)return`${(n/1024).toFixed(n>10240?0:1)} KB`;return`${(n/1024/1024).toFixed(1)} MB`;};
const dateLabel=(value)=>{try{return new Date(Number(value)||Date.now()).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});}catch(_){return'';}};
const evidenceOptions=['documented','archaeological','inferred','atmospheric','disputed'];

function sortRecords(records,sort){
  const out=[...records];
  if(sort==='title')out.sort((a,b)=>String(a.meta?.title||a.name).localeCompare(String(b.meta?.title||b.name)));
  else if(sort==='kind')out.sort((a,b)=>String(a.kind).localeCompare(String(b.kind))||String(a.name).localeCompare(String(b.name)));
  else out.sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0));
  return out;
}

function inspector(record){
  if(!record)return'<div class="az-empty-state az-inspector-empty"><div><h3>Select a record</h3><p>Metadata, provenance and local actions appear here.</p></div></div>';
  const meta=record.meta||{};
  return `<form class="az-metadata-form" data-metadata-form data-record-id="${esc(record.id)}">
    <div class="az-inspector-title-row"><div><h3>${esc(meta.title||record.name)}</h3><p>${esc(record.name)}</p></div><span class="az-evidence" data-level="${esc(meta.evidence||'documented')}">${esc(meta.evidence||'documented')}</span></div>
    <label>Title<input class="az-field" name="title" value="${esc(meta.title||record.name)}"></label>
    <label>Place<input class="az-field" name="place" value="${esc(meta.place||'')}" placeholder="Aizanoi · Çavdarhisar"></label>
    <label>Period<input class="az-field" name="period" value="${esc(meta.period||'')}" placeholder="Roman Imperial"></label>
    <label>Source<input class="az-field" name="source" value="${esc(meta.source||'')}" placeholder="Source / collection"></label>
    <label>Rights<input class="az-field" name="rights" value="${esc(meta.rights||'')}" placeholder="Rights / license"></label>
    <label>Evidence<select class="az-field" name="evidence">${evidenceOptions.map((level)=>`<option value="${level}" ${meta.evidence===level?'selected':''}>${level}</option>`).join('')}</select></label>
    <label>Tags<input class="az-field" name="tags" value="${esc((meta.tags||[]).join(', '))}" placeholder="temple, inscription, survey"></label>
    <dl class="az-meta-list az-meta-summary"><div><dt>Type</dt><dd>${esc(record.kind)}</dd></div><div><dt>Collection</dt><dd>${esc(record.collection)}</dd></div><div><dt>Size</dt><dd>${formatBytes(record.size)}</dd></div><div><dt>Updated</dt><dd>${dateLabel(record.updatedAt)}</dd></div></dl>
    <div class="az-inspector-actions"><button class="az-button az-button-primary" type="submit">Save metadata</button><button class="az-button az-button-teal" type="button" data-open-selected>Open</button><button class="az-button" type="button" data-note-selected>Add field note</button></div>
  </form>`;
}

export async function mount({container,api,options}){
  let collection='All';
  let query='';
  let sort='updated';
  let view='grid';
  let selectedId=options?.recordId||null;
  let destroyed=false;

  const importInput=document.createElement('input');
  importInput.type='file';importInput.multiple=true;importInput.hidden=true;
  importInput.accept='.csv,.json,.pdf,.md,.txt,.png,.jpg,.jpeg,.webp,.gif,.svg';
  const restoreInput=document.createElement('input');
  restoreInput.type='file';restoreInput.hidden=true;restoreInput.accept='.json,application/json';

  async function draw(){
    if(destroyed)return;
    const all=await Archive.all();
    if(destroyed)return;
    const counts=Object.fromEntries(Archive.COLLECTIONS.map((name)=>[name,all.filter((item)=>item.collection===name).length]));
    const filtered=sortRecords(all.filter((item)=>(collection==='All'||item.collection===collection)&&(!query||[item.name,item.kind,item.meta?.place,item.meta?.period,item.meta?.source,...(item.meta?.tags||[])].join(' ').toLowerCase().includes(query.toLowerCase()))),sort);
    if(!selectedId||!all.some((item)=>item.id===selectedId))selectedId=filtered[0]?.id||all[0]?.id||null;
    const selected=all.find((item)=>item.id===selectedId)||null;

    container.innerHTML=`<div class="az-app-shell">
      <div class="az-app-toolbar az-archive-toolbar">
        <input type="search" data-archive-search value="${esc(query)}" placeholder="Search records, places, tags…" aria-label="Search Field Archive">
        <select data-archive-sort aria-label="Sort records"><option value="updated" ${sort==='updated'?'selected':''}>Newest</option><option value="title" ${sort==='title'?'selected':''}>Title</option><option value="kind" ${sort==='kind'?'selected':''}>Type</option></select>
        <button class="az-button" type="button" data-view-toggle aria-pressed="${view==='list'}">${view==='grid'?'List':'Grid'}</button>
        <span class="az-system-spacer"></span>
        <button class="az-button" type="button" data-archive-export>Export</button>
        <button class="az-button" type="button" data-archive-restore>Restore</button>
        <button class="az-button" type="button" data-archive-new>New note</button>
        <button class="az-button az-button-primary" type="button" data-archive-import>Import</button>
      </div>
      <div class="az-archive-layout">
        <nav class="az-collection-nav" aria-label="Archive collections"><h3>Collections</h3>${['All',...Archive.COLLECTIONS].map((name)=>`<button class="az-collection-button${collection===name?' is-active':''}" type="button" data-collection="${esc(name)}"><span>${esc(name)}</span><span>${name==='All'?all.length:counts[name]||0}</span></button>`).join('')}</nav>
        <main class="az-record-stage">${filtered.length?`<div class="az-record-grid${view==='list'?' is-list':''}">${filtered.map((item)=>`<button class="az-record-card${item.id===selectedId?' is-selected':''}" type="button" data-record="${esc(item.id)}"><img src="${esc(Archive.iconFor(item))}" alt=""><span class="az-record-kind">${esc(item.kind)}</span><strong>${esc(item.meta?.title||item.name)}</strong><small>${esc(item.meta?.place||item.collection)} · ${dateLabel(item.updatedAt)}</small></button>`).join('')}</div>`:`<div class="az-empty-state"><div><h3>${all.length?'No matching records':'Your field archive is ready'}</h3><p>${all.length?'Try another collection or search.':'Start with the sample Aizanoi record or import your own research material.'}</p><button class="az-button az-button-primary" type="button" data-archive-import>Import records</button></div></div>`}</main>
        <aside class="az-inspector">${inspector(selected)}</aside>
      </div>
    </div>`;
    container.append(importInput,restoreInput);
  }

  async function saveMetadata(form){
    const id=form.dataset.recordId;
    const data=new FormData(form);
    const meta={
      title:String(data.get('title')||'').trim(), place:String(data.get('place')||'').trim(), period:String(data.get('period')||'').trim(),
      source:String(data.get('source')||'').trim(), rights:String(data.get('rights')||'').trim(), evidence:String(data.get('evidence')||'documented'),
      tags:String(data.get('tags')||'').split(',').map((tag)=>tag.trim()).filter(Boolean).slice(0,30)
    };
    await Archive.updateMetadata(id,meta);
    api.notify('Metadata saved',meta.title||'Archive record','archive');
  }

  const click=async(event)=>{
    const c=event.target.closest('[data-collection]')?.dataset.collection;if(c){collection=c;await draw();return;}
    const id=event.target.closest('[data-record]')?.dataset.record;if(id){selectedId=id;await draw();return;}
    if(event.target.closest('[data-view-toggle]')){view=view==='grid'?'list':'grid';await draw();return;}
    if(event.target.closest('[data-archive-import]')){importInput.click();return;}
    if(event.target.closest('[data-archive-restore]')){restoreInput.click();return;}
    if(event.target.closest('[data-archive-new]')){api.openApp('notes',{newNote:true});return;}
    if(event.target.closest('[data-archive-export]')){try{const count=await Archive.downloadBundle();api.notify('Archive exported',`${count} local record${count===1?'':'s'} written to a portable JSON bundle.`,'archive');}catch(error){api.notify('Archive export unavailable',error.message,'warning');}return;}
    if(event.target.closest('[data-open-selected]')){const record=await Archive.get(selectedId);if(record)api.openRecord(record);return;}
    if(event.target.closest('[data-note-selected]')){const item=await Archive.get(selectedId);if(!item)return;const note=await Archive.createNote(`Observation — ${item.meta?.title||item.name}`,`# Observation — ${item.meta?.title||item.name}\n\nLinked record: ${item.name}\nPlace: ${item.meta?.place||'—'}\nPeriod: ${item.meta?.period||'—'}\nSource: ${item.meta?.source||'—'}\n\n## Observation\n\n`,{place:item.meta?.place||'',period:item.meta?.period||'',source:item.meta?.source||'',evidence:'documented',tags:['field-note',...(item.meta?.tags||[]).slice(0,5)],linkedRecord:item.id});api.openApp('notes',{recordId:note.id});}
  };

  const input=(event)=>{if(event.target.matches('[data-archive-search]')){query=event.target.value;clearTimeout(input.timer);input.timer=setTimeout(draw,120);}};
  const change=async(event)=>{if(event.target.matches('[data-archive-sort]')){sort=event.target.value;await draw();}};
  const submit=async(event)=>{if(!event.target.matches('[data-metadata-form]'))return;event.preventDefault();await saveMetadata(event.target);await draw();};
  const files=async()=>{if(!importInput.files?.length)return;const imported=await Archive.importFiles(importInput.files);importInput.value='';api.notify('Field Archive updated',`${imported.length} item${imported.length===1?'':'s'} added locally.`,'archive');await draw();};
  const restore=async()=>{const file=restoreInput.files?.[0];restoreInput.value='';if(!file)return;try{if(file.size>Archive.archiveStore.MAX_BUNDLE_BYTES*1.5)throw new Error('Archive bundle is too large to restore safely in-browser.');const count=await Archive.restoreBundle(await file.text());api.notify('Archive restored',`${count} record${count===1?'':'s'} restored or updated locally.`,'archive');await draw();}catch(error){api.notify('Archive restore failed',error.message,'warning');}};
  const changed=()=>draw();

  container.addEventListener('click',click);container.addEventListener('input',input);container.addEventListener('change',change);container.addEventListener('submit',submit);
  importInput.addEventListener('change',files);restoreInput.addEventListener('change',restore);window.addEventListener('aizanoi:archive-change',changed);
  await draw();
  return()=>{destroyed=true;clearTimeout(input.timer);container.removeEventListener('click',click);container.removeEventListener('input',input);container.removeEventListener('change',change);container.removeEventListener('submit',submit);importInput.removeEventListener('change',files);restoreInput.removeEventListener('change',restore);window.removeEventListener('aizanoi:archive-change',changed);};
}