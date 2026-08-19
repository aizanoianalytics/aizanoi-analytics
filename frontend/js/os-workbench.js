(() => {
  'use strict';

  const State=window.AIZANOI_OS_STATE;
  const Platform=window.AIZANOI_PLATFORM;
  const Archive=window.AIZANOI_ARCHIVE;
  if(!State||!Platform||!Archive||window.AIZANOI_WORKSPACE) return;

  const WORKBENCH_APPS=new Set(['archive','notes','data-lab','source-reader','artifact-viewer','monitor']);
  const renderers=new Map();
  const activePayload=new Map();
  const objectUrls=new Set();
  let openAppBefore=window.openApp;
  let closeAppBefore=window.closeApp;

  const $=(selector,root=document)=>root.querySelector(selector);
  const escapeHtml=(value)=>String(value??'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const windowsMap=()=>{try{return typeof openWindows!=='undefined'?openWindows:null;}catch(_){return null;}};
  const existingWindow=(appId)=>windowsMap()?.get(appId)?.el||null;
  const appMeta=(appId)=>State.findApp(appId)||{id:appId,label:appId,short:appId,category:'Workspace',icon:'/assets/branding/aizanoi-logo-mark.svg'};

  function defaultRect(appId){
    const widths={archive:1020,notes:920,'data-lab':1080,'source-reader':940,'artifact-viewer':940,monitor:780};
    const heights={archive:670,notes:650,'data-lab':700,'source-reader':690,'artifact-viewer':670,monitor:610};
    const width=Math.min(widths[appId]||860,Math.max(320,innerWidth-48));
    const height=Math.min(heights[appId]||620,Math.max(240,innerHeight-96));
    const order=Math.max(0,[...WORKBENCH_APPS].indexOf(appId));
    return {width,height,left:Math.max(12,Math.min(innerWidth-180,(innerWidth-width)/2+order*14)),top:Math.max(12,Math.min(innerHeight-120,(innerHeight-height)/2+order*10-20))};
  }

  const handles=()=>'<div class="resize-handle rh-n"></div><div class="resize-handle rh-s"></div><div class="resize-handle rh-e"></div><div class="resize-handle rh-w"></div><div class="resize-handle rh-ne"></div><div class="resize-handle rh-nw"></div><div class="resize-handle rh-se"></div><div class="resize-handle rh-sw"></div>';

  function makeWindow(appId){
    const app=appMeta(appId);
    const rect=State.getWindowRect(appId)||defaultRect(appId);
    const win=document.createElement('section');
    win.className='win az-workbench-window';
    win.dataset.workbenchApp=appId;
    Object.assign(win.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
    win.innerHTML=`
      <div class="win-titlebar">
        <img class="win-icon" src="${escapeHtml(app.icon)}" alt="">
        <div class="win-title">${escapeHtml(app.label)}</div>
        <div class="az-workbench-badge">${escapeHtml(app.category||'Workspace')}</div>
        <div class="win-controls"><button class="win-btn min" data-act="min" type="button" aria-label="Minimize">—</button><button class="win-btn max" data-act="max" type="button" aria-label="Maximize or restore">□</button><button class="win-btn close" data-act="close" type="button" aria-label="Close">×</button></div>
      </div>
      <div class="win-body az-workbench-body" data-workbench-body="${escapeHtml(appId)}"></div>${handles()}`;
    document.body.appendChild(win);
    const map=windowsMap();
    if(!map) throw new Error('Core window registry unavailable.');
    map.set(appId,{el:win,maximized:false,prevRect:null,cleanup:null,workbench:true});

    const task=document.createElement('button');
    task.type='button';task.id=`task-${appId}`;task.className='task-item az-workbench-task';
    task.innerHTML=`<img src="${escapeHtml(app.icon)}" alt=""><span>${escapeHtml(app.short||app.label)}</span>`;
    task.addEventListener('click',()=>window.toggleMinimize?.(appId));
    document.getElementById('taskbar-items')?.appendChild(task);

    window.wireWindow?.(appId,win);
    window.bringToFront?.(appId);
    State.markAppRecent(appId);
    State.setContext({type:'app',label:app.label,appId,worldId:null,landmark:null});
    State.recordActivity(`Opened ${app.label}`,'Aizanoi workstation application','app');
    Platform.emit('workspace:open',{appId});
    return win;
  }

  function activeAppId(){
    const active=$('.win.active');const map=windowsMap();if(!active||!map)return null;
    for(const [id,item] of map.entries()) if(item?.el===active) return id;
    return null;
  }

  function close(appId){
    const map=windowsMap();const state=map?.get(appId);if(!state?.el)return false;
    try{state.workbenchCleanup?.();}catch(_){} try{state.cleanup?.();}catch(_){}
    state.el.remove();map.delete(appId);document.getElementById(`task-${appId}`)?.remove();
    State.recordActivity(`Closed ${appMeta(appId).label}`,'','app');
    const nextId=activeAppId();const next=nextId?State.findApp(nextId):null;
    State.setContext(next?{type:'app',label:next.label,appId:next.id,worldId:null,landmark:null}:{type:'desktop',label:'Aizanoi Field System',appId:null,worldId:null,landmark:null});
    window.AIZANOI_OS?.updateShellState?.();Platform.emit('workspace:close',{appId});return true;
  }

  async function render(appId,win,payload={}){
    const renderer=renderers.get(appId);
    if(!renderer){$(`[data-workbench-body="${appId}"]`,win).innerHTML='<div class="az-empty-state"><h3>Application loading…</h3></div>';return;}
    await renderer(win,payload);
  }

  async function open(appId,payload={}){
    if(!WORKBENCH_APPS.has(appId)) return openAppBefore?.(appId);
    activePayload.set(appId,payload||{});
    let win=existingWindow(appId);
    if(!win) win=makeWindow(appId);
    else {win.style.display='flex';window.bringToFront?.(appId);State.markAppRecent(appId);State.setContext({type:'app',label:appMeta(appId).label,appId,worldId:null,landmark:null});}
    await render(appId,win,payload||{});
    window.AIZANOI_OS?.updateShellState?.();return win;
  }

  async function refresh(appId){const win=existingWindow(appId);if(!win)return;await render(appId,win,activePayload.get(appId)||{});}
  function registerRenderer(appId,renderer){if(WORKBENCH_APPS.has(appId)&&typeof renderer==='function')renderers.set(appId,renderer);}

  function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);}
  function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
  function relativeDate(timestamp){const d=new Date(Number(timestamp||Date.now()));return d.toLocaleDateString([],{month:'short',day:'numeric',year:d.getFullYear()!==new Date().getFullYear()?'numeric':undefined});}

  function quickLookShell(){
    let overlay=document.getElementById('az-quicklook');if(overlay)return overlay;
    overlay=document.createElement('div');overlay.id='az-quicklook';overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML='<div class="az-quicklook-frame"><header><div><span>QUICK LOOK</span><b data-quick-title></b></div><div class="az-toolbar-spacer"></div><button type="button" data-quick-open>Open</button><button type="button" data-quick-close aria-label="Close preview">×</button></header><main data-quick-body></main><footer><span data-quick-meta></span><span>ESC · Close</span></footer></div>';
    document.body.appendChild(overlay);overlay.querySelector('[data-quick-close]').onclick=closeQuickLook;
    overlay.addEventListener('pointerdown',(event)=>{if(event.target===overlay)closeQuickLook();});
    return overlay;
  }

  async function quickLook(record){
    if(typeof record==='string')record=await Archive.get(record);if(!record)return;
    const overlay=quickLookShell();const body=$('[data-quick-body]',overlay);$('[data-quick-title]',overlay).textContent=record.name;$('[data-quick-meta]',overlay).textContent=`${record.collection} · ${Platform.formatBytes(record.size||(record.text?new Blob([record.text]).size:0))}`;
    if(record.kind==='image'&&record.blob){const url=URL.createObjectURL(record.blob);objectUrls.add(url);body.innerHTML=`<img class="az-quick-image" src="${url}" alt="${escapeHtml(record.name)}">`;}
    else if(record.kind==='pdf') body.innerHTML='<div class="az-quick-symbol">PDF</div><p>Open in Source Reader for the browser PDF view.</p>';
    else if(record.kind==='dataset') body.innerHTML=`<pre>${escapeHtml(String(record.text||'').slice(0,6000))}</pre>`;
    else body.innerHTML=`<article class="az-quick-text"><pre>${escapeHtml(String(record.text||'').slice(0,12000))}</pre></article>`;
    overlay.querySelector('[data-quick-open]').onclick=()=>{closeQuickLook();openRecord(record);};
    overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');
  }
  function closeQuickLook(){const overlay=document.getElementById('az-quicklook');overlay?.classList.remove('open');overlay?.setAttribute('aria-hidden','true');}

  async function openRecord(record){
    if(typeof record==='string')record=await Archive.get(record);if(!record)return false;
    if(record.kind==='dataset')return open('data-lab',{recordId:record.id});
    if(['pdf','markdown','text'].includes(record.kind))return open('source-reader',{recordId:record.id});
    if(record.kind==='note')return open('notes',{recordId:record.id});
    if(record.kind==='image')return open('artifact-viewer',{recordId:record.id});
    Platform.notify('No associated viewer',`${record.name} is stored safely but has no viewer yet.`,'warning');return false;
  }

  async function sendToNotes(record,customText=''){
    if(typeof record==='string')record=await Archive.get(record);if(!record)return false;
    const text=customText||record.text||`Archive item: ${record.name}\nType: ${record.kind}\nCollection: ${record.collection}`;
    const note=await Archive.createNote(`From ${record.name.replace(/\.[^.]+$/,'')}`,`# ${record.name}\n\n${text.slice(0,18000)}\n`);
    State.recordActivity('Sent archive item to Field Notes',record.name,'archive');return open('notes',{recordId:note.id});
  }

  function askAI(question,context=''){
    window.AIZANOI_OS?.launchApp?.('chatbot',{source:'workbench'});let tries=0;
    const timer=setInterval(()=>{tries++;if(window.__AIZANOI_CHAT__?.ask){clearInterval(timer);window.__AIZANOI_CHAT__.ask(question,context);}else if(tries>30)clearInterval(timer);},60);
  }

  function patchCore(){
    if(window.openApp&&!window.openApp.__aizanoiWorkbench){openAppBefore=window.openApp;const patched=(appId,...args)=>WORKBENCH_APPS.has(appId)?open(appId,args[0]||{}):openAppBefore.call(window,appId,...args);patched.__aizanoiWorkbench=true;patched.__aizanoiNext=true;window.openApp=patched;}
    if(window.closeApp&&!window.closeApp.__aizanoiWorkbench){closeAppBefore=window.closeApp;const patched=(appId,...args)=>WORKBENCH_APPS.has(appId)?close(appId):closeAppBefore.call(window,appId,...args);patched.__aizanoiWorkbench=true;patched.__aizanoiNext=true;window.closeApp=patched;}
  }

  patchCore();
  document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&document.getElementById('az-quicklook')?.classList.contains('open')){event.preventDefault();closeQuickLook();}},true);
  Platform.registerCapability('archive',{...Archive,openRecord,quickLook,sendToNotes});
  Platform.registerCapability('workspace',{open,close,refresh});
  Platform.registerCapability('files',{open:openRecord,import:Archive.importFiles,quickLook});

  window.AIZANOI_WORKSPACE=Object.freeze({
    apps:[...WORKBENCH_APPS], archive:Archive, open,close,refresh,registerRenderer,
    existingWindow,activePayload,appMeta,escapeHtml,relativeDate,escapeRegExp,downloadBlob,
    quickLook,closeQuickLook,openRecord,sendToNotes,askAI,objectUrls,
  });

  Archive.ready.then(()=>{State.recordActivity('Aizanoi workstation services online','Field Archive and workstation platform initialized.','system');window.AIZANOI_OS?.updateShellState?.();});
  window.addEventListener('pagehide',()=>{for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls.clear();});
})();