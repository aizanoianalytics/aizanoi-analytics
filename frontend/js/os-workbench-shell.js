(() => {
  'use strict';
  const W=window.AIZANOI_WORKSPACE,A=window.AIZANOI_ARCHIVE,P=window.AIZANOI_PLATFORM,S=window.AIZANOI_OS_STATE;
  if(!W||!A||!P||!S)return;
  const $=(s,r=document)=>r.querySelector(s),esc=W.escapeHtml;

  async function renderMonitor(win){
    const body=$('[data-workbench-body="monitor"]',win),info=P.systemInfo(),storage=await P.storageEstimate();let map;try{map=openWindows;}catch(_){map=null;}
    const openApps=map?[...map.keys()].filter((id)=>map.get(id)?.el&&getComputedStyle(map.get(id).el).display!=='none'):[];
    body.innerHTML=`<div class="az-monitor-shell"><header class="az-monitor-hero"><div class="az-monitor-orb"><i></i><i></i><i></i><span>A</span></div><div><span class="az-kicker">AIZANOI DISTRIBUTION</span><h2>Workspace Monitor</h2><p>Field System ${esc(info.version)} · Build ${esc(info.build)}</p></div><div class="az-toolbar-spacer"></div><button class="az-tool-btn primary" data-monitor-action="install">${info.standalone?'Installed':info.installable?'Install Aizanoi':'Install guide'}</button></header><section class="az-monitor-grid"><article><span>SESSION</span><b>${openApps.length}</b><small>open applications</small></article><article><span>ARCHIVE</span><b>${P.formatBytes(storage.usage)}</b><small>${storage.percent.toFixed(1)}% browser quota</small></article><article><span>RUNTIME</span><b class="ok">STATIC</b><small>browser-only · no application backend</small></article><article><span>NETWORK</span><b class="${info.online?'ok':'warn'}">${info.online?'ONLINE':'OFFLINE'}</b><small>${esc(info.language||'')}</small></article><article><span>DISPLAY</span><b>${info.viewport.width}×${info.viewport.height}</b><small>${info.viewport.dpr.toFixed(1)}× pixel ratio</small></article><article><span>DEVICE</span><b>${info.cores||'—'} cores</b><small>${info.memoryGB?`${info.memoryGB} GB hint`:'memory hint unavailable'}</small></article></section><section class="az-monitor-processes"><header><span>RUNNING WORKSPACE</span><button class="az-tool-btn" data-monitor-action="archive">Open Field Archive</button></header>${openApps.length?openApps.map((id)=>{const app=W.appMeta(id);return `<button type="button" data-monitor-app="${esc(id)}"><img src="${esc(app.icon)}" alt=""><span><b>${esc(app.label)}</b><small>${esc(app.category||'Application')}</small></span><em>RUNNING</em></button>`;}).join(''):'<div class="az-empty-state small"><p>No workspace apps are currently visible.</p></div>'}</section></div>`;
    body.onclick=async(event)=>{const id=event.target.closest('[data-monitor-app]')?.dataset.monitorApp;if(id){const appWin=W.existingWindow(id);if(appWin)appWin.style.display='flex';window.bringToFront?.(id);}const action=event.target.closest('[data-monitor-action]')?.dataset.monitorAction;if(action==='archive')W.open('archive');if(action==='install')await P.install();};
  }
  W.registerRenderer('monitor',renderMonitor);

  function mountPinnedTools(){
    const search=document.getElementById('az-search-button');if(!search||document.getElementById('az-pinned-tools'))return;
    const dock=document.createElement('div');dock.id='az-pinned-tools';dock.setAttribute('aria-label','Pinned workstation tools');
    dock.innerHTML=[['archive','/assets/icons/field-archive.svg','Archive'],['notes','/assets/icons/notepad.svg','Notes'],['data-lab','/assets/icons/data-lab.svg','Data Lab'],['monitor','/assets/icons/workspace-monitor.svg','Monitor']].map(([id,icon,label])=>`<button type="button" data-pinned-app="${id}" title="${label}" aria-label="${label}"><img src="${icon}" alt=""><span>${label}</span></button>`).join('');search.after(dock);dock.onclick=(event)=>{const id=event.target.closest('[data-pinned-app]')?.dataset.pinnedApp;if(id)W.open(id);};
  }

  function featuredApps(){return S.apps.filter((app)=>app.featured!==false&&app.id!=='chatbot');}
  function renderLaunchers(){
    const apps=featuredApps(),signature=apps.map((app)=>app.id).join('|'),index=document.getElementById('az-index-apps');
    if(index){const current=[...index.querySelectorAll('[data-app]')].map((n)=>n.dataset.app).join('|');if(current!==signature){index.innerHTML=apps.map((app)=>`<button class="az-app-item" data-app="${esc(app.id)}"><img src="${esc(app.icon)}" alt=""><span><strong>${esc(app.label)}</strong><small>${esc(app.category)}${app.description?` · ${esc(app.description)}`:''}</small></span><span class="az-arrow">›</span></button>`).join('');}}
    const mobile=document.getElementById('az-mobile-apps'),mobileApps=apps.slice(0,12),mobileSignature=mobileApps.map((app)=>app.id).join('|');
    if(mobile){const current=[...mobile.querySelectorAll('[data-app]')].map((n)=>n.dataset.app).join('|');if(current!==mobileSignature)mobile.innerHTML=mobileApps.map((app)=>`<button class="az-mobile-app" data-app="${esc(app.id)}"><img src="${esc(app.icon)}" alt=""><span>${esc(app.short)}</span></button>`).join('');}
  }

  function commands(){
    const context=S.getContext(),out=[],add=(title,subtitle,action,icon='/assets/branding/aizanoi-logo-mark.svg')=>out.push({title,subtitle,action,icon});
    if(context.appId==='archive'){add('Import files','Add local research material',()=>W.existingWindow('archive')?.querySelector('[data-archive-file-input]')?.click(),'/assets/icons/field-archive.svg');add('New Field Note','Create an archived note',async()=>{const note=await A.createNote();W.open('notes',{recordId:note.id});},'/assets/icons/notepad.svg');add('Workspace Monitor','Storage, local runtime and session status',()=>W.open('monitor'),'/assets/icons/workspace-monitor.svg');}
    if(context.appId==='notes'){add('New Field Note','Start a new archived note',async()=>{const note=await A.createNote();W.open('notes',{recordId:note.id});},'/assets/icons/notepad.svg');add('Open Archive','Browse sources and datasets',()=>W.open('archive'),'/assets/icons/field-archive.svg');}
    if(context.appId==='data-lab')add('Open Datasets','Return to dataset collection',()=>W.open('archive',{collection:'Datasets'}),'/assets/icons/data-lab.svg');
    if(context.appId==='source-reader')add('Open Sources','Return to source collection',()=>W.open('archive',{collection:'Sources'}),'/assets/icons/source-reader.svg');
    if(context.appId==='artifact-viewer')add('Open Visual Archive','Return to screenshots',()=>W.open('archive',{collection:'Screenshots'}),'/assets/icons/artifact-viewer.svg');
    return out;
  }

  function contextHost(){
    let host=document.getElementById('az-context-commands'),results=document.getElementById('az-command-results');if(!results)return null;
    if(!host){host=document.createElement('div');host.id='az-context-commands';results.before(host);host.onclick=(event)=>{const index=Number(event.target.closest('[data-context-command]')?.dataset.contextCommand);if(Number.isInteger(index))commands()[index]?.action?.();};}return host;
  }
  function renderContext(){const host=contextHost();if(!host)return;const rows=commands();host.innerHTML=rows.length?`<div class="az-context-command-label">CONTEXT ACTIONS</div>${rows.map((row,index)=>`<button type="button" data-context-command="${index}"><img src="${row.icon}" alt=""><span><b>${esc(row.title)}</b><small>${esc(row.subtitle)}</small></span><em>↵</em></button>`).join('')}`:'';host.hidden=!rows.length;}

  function wireContext(){
    document.getElementById('az-command-input')?.addEventListener('input',()=>queueMicrotask(renderContext));document.addEventListener('keydown',(event)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k')setTimeout(renderContext,0);},true);document.getElementById('az-search-button')?.addEventListener('click',()=>setTimeout(renderContext,0));S.subscribe(({type})=>{if(type==='context')renderContext();});
  }

  function wireGlobalDrop(){
    const desktop=document.getElementById('desktop');if(!desktop||desktop.dataset.archiveDrop)return;desktop.dataset.archiveDrop='1';let overlay;
    const show=()=>{overlay||=(()=>{const node=document.createElement('div');node.id='az-global-drop';node.innerHTML='<div><img src="/assets/icons/field-archive.svg" alt=""><b>DROP INTO FIELD ARCHIVE</b><span>Files stay local to this browser</span></div>';document.body.appendChild(node);return node;})();overlay.classList.add('open');};
    const hide=()=>overlay?.classList.remove('open');window.addEventListener('dragenter',(event)=>{if([...(event.dataTransfer?.types||[])].includes('Files'))show();});window.addEventListener('dragover',(event)=>{if([...(event.dataTransfer?.types||[])].includes('Files'))event.preventDefault();});window.addEventListener('dragleave',(event)=>{if(!event.relatedTarget)hide();});window.addEventListener('drop',async(event)=>{if(event.target?.closest?.('[data-archive-drop]')||!event.dataTransfer?.files?.length)return;event.preventDefault();hide();await A.importFiles(event.dataTransfer.files,'desktop drop');await W.open('archive');});
  }

  async function restoreSession(){await new Promise((resolve)=>setTimeout(resolve,950));const prefs=S.getState();if(!prefs.restoreSession||matchMedia('(max-width:700px)').matches)return;for(const id of prefs.sessionApps.filter((id)=>W.apps.includes(id)&&id!=='chatbot').slice(0,3))if(!W.existingWindow(id))await W.open(id);}

  mountPinnedTools();renderLaunchers();wireContext();wireGlobalDrop();
  const index=document.getElementById('az-index-apps');if(index)new MutationObserver(()=>queueMicrotask(renderLaunchers)).observe(index,{childList:true});const mobile=document.getElementById('az-mobile-apps');if(mobile)new MutationObserver(()=>queueMicrotask(renderLaunchers)).observe(mobile,{childList:true});
  document.addEventListener('click',(event)=>{if(event.target.closest('#start-btn,#az-search-button,[data-mobile-nav="home"]'))queueMicrotask(renderLaunchers);},true);
  P.on('archive:changed',()=>{W.refresh('archive');W.refresh('monitor');});
  P.registerCommandProvider(()=>commands());renderContext();S.recordActivity('Aizanoi distribution ready','Field Archive, workstation applications and install layer online.','system');window.AIZANOI_OS?.updateShellState?.();restoreSession();
})();