const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const FILES=Object.freeze({html:'index.html',css:'style.css',js:'script.js'});
const MIME=Object.freeze({html:'text/html',css:'text/css',js:'text/javascript'});
const DEFAULTS=Object.freeze({
  html:`<main class="demo-card">\n  <span class="eyebrow">AIZANOI WEB EDITOR</span>\n  <h1>Hello, Aizanoi.</h1>\n  <p>Edit HTML, CSS and JavaScript, then press Run.</p>\n  <button id="hello">Test JavaScript</button>\n</main>`,
  css:`:root {\n  font-family: Inter, system-ui, sans-serif;\n  color: #172033;\n  background: #eef2f8;\n}\n\nbody {\n  min-height: 100vh;\n  margin: 0;\n  display: grid;\n  place-items: center;\n}\n\n.demo-card {\n  width: min(520px, calc(100% - 48px));\n  padding: 32px;\n  border: 1px solid #d9e0ec;\n  border-radius: 20px;\n  background: white;\n  box-shadow: 0 24px 60px rgba(30, 44, 72, .12);\n}\n\n.eyebrow {\n  font-size: 11px;\n  font-weight: 800;\n  letter-spacing: .12em;\n  color: #5265db;\n}\n\nbutton {\n  min-height: 42px;\n  padding: 0 16px;\n  border: 0;\n  border-radius: 10px;\n  background: #172033;\n  color: white;\n  cursor: pointer;\n}`,
  js:`document.querySelector('#hello')?.addEventListener('click', () => {\n  document.querySelector('h1').textContent = 'JavaScript is running.';\n});`
});

function tabForName(name=''){
  const lower=String(name).toLowerCase();
  if(lower.endsWith('.css'))return 'css';
  if(lower.endsWith('.js')||lower.endsWith('.mjs'))return 'js';
  return 'html';
}
function validProjectName(value){
  const name=String(value||'').trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ');
  return name.slice(0,80);
}
async function textOf(filesystem,node){
  if(!node)return '';
  const blob=await filesystem.readFileBlob(node.id);
  return blob?blob.text():'';
}
function previewDocument(source){
  const css=String(source.css||'').replace(/<\/style/gi,'<\\/style');
  const js=String(source.js||'').replace(/<\/script/gi,'<\\/script');
  const policy="default-src 'none'; script-src 'unsafe-inline' https: http:; style-src 'unsafe-inline' https: http:; img-src data: blob: https: http:; font-src data: https:; media-src data: blob: https: http:; connect-src https: http:; object-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>${css}</style></head><body>${source.html||''}<script>${js}<\/script></body></html>`;
}

export async function mountWebEditor({container,options,capabilities}){
  const {filesystem,dialog,notifications,sound}=capabilities;
  let editorFolderId=null,projectFolderId=null,projectName='Untitled project',activeTab='html',dirty=false,lastSavedAt=null;
  const source={html:DEFAULTS.html,css:DEFAULTS.css,js:DEFAULTS.js};

  container.innerHTML=`<div class="az-app-shell"><div class="az-app-toolbar"><strong data-web-editor-title>Aizanoi Web Editor</strong><span class="az-system-spacer"></span><span class="az-app-caption">HTML · CSS · JavaScript · sandboxed preview</span></div><div class="az-web-editor"><div class="az-web-editor-actions" role="toolbar" aria-label="Web Editor actions"><button class="az-button" type="button" data-web-action="new">New</button><button class="az-button" type="button" data-web-action="open">Open…</button><button class="az-button" type="button" data-web-action="save">Save</button><button class="az-button" type="button" data-web-action="saveas">Save as…</button><button class="az-button az-button-primary" type="button" data-web-action="run">Run</button><span class="az-system-spacer"></span><span class="az-web-editor-status" data-web-status>Unsaved local project</span></div><div class="az-web-editor-layout"><section class="az-web-editor-code" aria-label="Source editor"><div class="az-web-editor-tabs" role="tablist" aria-label="Source files"><button class="az-web-editor-tab" type="button" role="tab" aria-selected="true" data-web-tab="html">HTML</button><button class="az-web-editor-tab" type="button" role="tab" aria-selected="false" data-web-tab="css">CSS</button><button class="az-web-editor-tab" type="button" role="tab" aria-selected="false" data-web-tab="js">JavaScript</button></div><div class="az-web-editor-pane"><textarea class="az-web-editor-text" data-web-source="html" spellcheck="false" aria-label="HTML source"></textarea><textarea class="az-web-editor-text" data-web-source="css" spellcheck="false" aria-label="CSS source" hidden></textarea><textarea class="az-web-editor-text" data-web-source="js" spellcheck="false" aria-label="JavaScript source" hidden></textarea></div></section><section class="az-web-editor-preview" aria-label="Preview"><header class="az-web-editor-preview-head"><strong>Preview</strong><span class="az-system-spacer"></span><span class="az-web-editor-security">sandboxed iframe · local source</span></header><iframe class="az-web-editor-frame" data-web-preview title="Web project preview" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></section></div><aside class="az-web-editor-projects" data-web-projects hidden aria-label="Saved Web Editor projects"><header class="az-web-editor-projects-head"><strong>Editor projects</strong><span class="az-system-spacer"></span><button class="az-button" type="button" data-web-close-projects>Close</button></header><div class="az-web-editor-project-list" data-web-project-list></div></aside></div></div>`;

  const titleEl=container.querySelector('[data-web-editor-title]');
  const statusEl=container.querySelector('[data-web-status]');
  const preview=container.querySelector('[data-web-preview]');
  const projectPanel=container.querySelector('[data-web-projects]');
  const projectList=container.querySelector('[data-web-project-list]');
  const editors=Object.fromEntries([...container.querySelectorAll('[data-web-source]')].map((node)=>[node.dataset.webSource,node]));
  const tabs=[...container.querySelectorAll('[data-web-tab]')];

  function syncSourceToEditors(){for(const key of Object.keys(editors))editors[key].value=source[key]||'';}
  function syncEditorsToSource(){for(const key of Object.keys(editors))source[key]=editors[key].value;}
  function renderState(){
    titleEl.textContent=`${dirty?'*':''}${projectName} — Aizanoi Web Editor`;
    statusEl.textContent=dirty?'Unsaved changes':projectFolderId?(lastSavedAt?`Saved in Editor · ${lastSavedAt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`:'Saved in Workspace / Editor'):'Unsaved local project';
  }
  function switchTab(next){
    activeTab=['html','css','js'].includes(next)?next:'html';
    for(const tab of tabs)tab.setAttribute('aria-selected',String(tab.dataset.webTab===activeTab));
    for(const [key,node] of Object.entries(editors))node.hidden=key!==activeTab;
    queueMicrotask(()=>editors[activeTab]?.focus({preventScroll:true}));
  }
  function runPreview(){
    syncEditorsToSource();
    preview.srcdoc=previewDocument(source);
    sound.play('click');
    statusEl.textContent=dirty?'Preview updated · unsaved changes':'Preview updated';
  }
  async function ensureEditorFolder(){
    if(editorFolderId&&await filesystem.getNode(editorFolderId))return editorFolderId;
    const documents=await filesystem.getNode(filesystem.documentsId);
    const rootId=documents?.parent||filesystem.documentsId;
    const children=await filesystem.childrenOf(rootId);
    let editor=children.find((node)=>node.kind==='folder'&&String(node.name||'').trim().toLowerCase()==='editor');
    if(!editor)editor=await filesystem.createFolder({name:'Editor',parent:rootId});
    editorFolderId=editor.id;
    return editorFolderId;
  }
  async function writeProjectFiles(folderId){
    const children=await filesystem.childrenOf(folderId);
    for(const key of ['html','css','js']){
      const name=FILES[key],blob=new Blob([source[key]||''],{type:MIME[key]});
      const existing=children.find((node)=>node.kind==='file'&&String(node.name||'').toLowerCase()===name);
      if(existing)await filesystem.updateFileContent(existing.id,blob);
      else await filesystem.createFile({name,parent:folderId,blob,mime:MIME[key]});
    }
  }
  async function saveProject(asNew=false){
    syncEditorsToSource();
    await ensureEditorFolder();
    if(asNew||!projectFolderId){
      const requested=await dialog.prompt({title:asNew?'Save project as':'Save Web Editor project',message:'Projects are stored locally in Workspace / Editor with index.html, style.css and script.js.',label:'Project name',defaultValue:projectFolderId?projectName:'My Web Project',confirmLabel:'Save'});
      if(requested==null)return false;
      const name=validProjectName(requested);
      if(!name){notifications.notify('Web Editor','Choose a valid project name.','error');return false;}
      const projects=await filesystem.childrenOf(editorFolderId);
      let folder=projects.find((node)=>node.kind==='folder'&&String(node.name||'').trim().toLowerCase()===name.toLowerCase());
      if(folder&&folder.id!==projectFolderId){
        const choice=await dialog.confirm({title:'Project already exists',message:`Replace the saved source files in ${name}?`,kind:'warn',confirmLabel:'Replace',cancelLabel:'Cancel'});
        if(choice!=='ok')return false;
      }
      if(!folder)folder=await filesystem.createFolder({name,parent:editorFolderId});
      projectFolderId=folder.id;
      projectName=folder.name;
    }else{
      const folder=await filesystem.getNode(projectFolderId);
      if(!folder){projectFolderId=null;return saveProject(false);}
      projectName=folder.name;
    }
    await writeProjectFiles(projectFolderId);
    dirty=false;lastSavedAt=new Date();renderState();sound.play('notification');
    notifications.notify('Aizanoi Web Editor',`${projectName} saved to Workspace / Editor.`,'system');
    return true;
  }
  async function resolveUnsaved(){
    if(!dirty)return true;
    const choice=await dialog.confirm({title:'Unsaved Web Editor changes',message:`Save changes to ${projectName} before continuing?`,kind:'warn',confirmLabel:'Save',secondaryLabel:'Discard',cancelLabel:'Cancel'});
    if(choice==='ok')return saveProject(false);
    if(choice==='secondary')return true;
    return false;
  }
  async function loadProject(folderId,{skipUnsaved=false}={}){
    if(!skipUnsaved&&!(await resolveUnsaved()))return false;
    const folder=await filesystem.getNode(folderId);
    if(!folder||folder.kind!=='folder')return false;
    const children=await filesystem.childrenOf(folder.id);
    const byName=new Map(children.filter((node)=>node.kind==='file').map((node)=>[String(node.name||'').toLowerCase(),node]));
    source.html=await textOf(filesystem,byName.get(FILES.html));
    source.css=await textOf(filesystem,byName.get(FILES.css));
    source.js=await textOf(filesystem,byName.get(FILES.js));
    projectFolderId=folder.id;projectName=folder.name;dirty=false;lastSavedAt=folder.updatedAt?new Date(folder.updatedAt):null;
    syncSourceToEditors();renderState();runPreview();return true;
  }
  async function loadFile(fileId){
    if(!(await resolveUnsaved()))return false;
    const file=await filesystem.getNode(fileId);
    if(!file||file.kind!=='file')return false;
    await ensureEditorFolder();
    const parent=await filesystem.getNode(file.parent);
    if(parent?.kind==='folder'&&parent.id!==editorFolderId){
      await loadProject(parent.id,{skipUnsaved:true});
      switchTab(tabForName(file.name));
      return true;
    }
    source.html='';source.css='';source.js='';
    const key=tabForName(file.name);source[key]=await textOf(filesystem,file);
    projectFolderId=null;projectName=file.name;dirty=false;lastSavedAt=file.updatedAt?new Date(file.updatedAt):null;
    syncSourceToEditors();switchTab(key);renderState();runPreview();return true;
  }
  async function refreshProjects(){
    await ensureEditorFolder();
    const children=(await filesystem.childrenOf(editorFolderId)).filter((node)=>node.kind==='folder').sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    projectList.innerHTML=children.length?children.map((node)=>`<button class="az-web-editor-project" type="button" data-web-project="${esc(node.id)}"><span><strong>${esc(node.name)}</strong><small>index.html · style.css · script.js</small></span><b>Open</b></button>`).join(''):'<p class="az-web-editor-empty">No saved projects yet. Save the current project first.</p>';
  }
  async function newProject(){
    if(!(await resolveUnsaved()))return;
    projectFolderId=null;projectName='Untitled project';dirty=false;lastSavedAt=null;
    source.html=DEFAULTS.html;source.css=DEFAULTS.css;source.js=DEFAULTS.js;
    syncSourceToEditors();switchTab('html');renderState();runPreview();
  }

  const handleInput=()=>{dirty=true;renderState();};
  const handlePointerDown=(event)=>{if(event.target.closest('[data-web-source]'))event.stopPropagation();};
  const handleKeyDown=(event)=>{
    if(event.target.matches('[data-web-source]')&&event.key==='Tab'){
      event.preventDefault();const node=event.target,start=node.selectionStart,end=node.selectionEnd;node.setRangeText('  ',start,end,'end');node.dispatchEvent(new Event('input',{bubbles:true}));return;
    }
    if(!(event.ctrlKey||event.metaKey))return;
    if(event.key==='Enter'){event.preventDefault();event.stopPropagation();runPreview();return;}
    if(event.key.toLowerCase()==='s'){
      event.preventDefault();event.stopPropagation();
      saveProject(event.shiftKey).catch((error)=>notifications.notify('Web Editor',error.message,'error'));
    }
  };
  const handleClick=async(event)=>{
    const tab=event.target.closest('[data-web-tab]')?.dataset.webTab;if(tab){switchTab(tab);return;}
    const projectId=event.target.closest('[data-web-project]')?.dataset.webProject;if(projectId){if(await loadProject(projectId))projectPanel.hidden=true;return;}
    if(event.target.closest('[data-web-close-projects]')){projectPanel.hidden=true;return;}
    const action=event.target.closest('[data-web-action]')?.dataset.webAction;if(!action)return;
    try{
      if(action==='run')runPreview();
      else if(action==='save')await saveProject(false);
      else if(action==='saveas')await saveProject(true);
      else if(action==='new')await newProject();
      else if(action==='open'){await refreshProjects();projectPanel.hidden=false;}
    }catch(error){notifications.notify('Web Editor',error.message,'error');}
  };

  for(const node of Object.values(editors))node.addEventListener('input',handleInput);
  container.addEventListener('pointerdown',handlePointerDown);
  container.addEventListener('keydown',handleKeyDown);
  container.addEventListener('click',handleClick);
  syncSourceToEditors();renderState();
  await ensureEditorFolder();
  if(options?.fileId)await loadFile(options.fileId);
  else if(options?.projectFolderId)await loadProject(options.projectFolderId,{skipUnsaved:true});
  else runPreview();
  switchTab(activeTab);

  return{
    cleanup(){for(const node of Object.values(editors))node.removeEventListener('input',handleInput);container.removeEventListener('pointerdown',handlePointerDown);container.removeEventListener('keydown',handleKeyDown);container.removeEventListener('click',handleClick);preview.srcdoc='';},
    onOpen(newOptions){if(newOptions?.fileId)loadFile(newOptions.fileId).catch((error)=>notifications.notify('Web Editor',error.message,'error'));else if(newOptions?.projectFolderId)loadProject(newOptions.projectFolderId).catch((error)=>notifications.notify('Web Editor',error.message,'error'));},
    beforeClose(){return resolveUnsaved();}
  };
}
