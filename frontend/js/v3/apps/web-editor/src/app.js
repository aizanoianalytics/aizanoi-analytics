import { createRevisionTracker } from './revision.js';
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const PREVIEW_ROUTE='/web-editor-preview/';
const MESSAGE_RUN='aizanoi-web-editor-run';
const MESSAGE_READY='aizanoi-web-editor-ready';
const MESSAGE_DONE='aizanoi-web-editor-done';
const MESSAGE_ERROR='aizanoi-web-editor-error';
const MESSAGE_CONSOLE='aizanoi-web-editor-console';
const HTML_MIME='text/html';
const DEFAULT_DOCUMENT=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Aizanoi Web Editor</title>
  <style>
    :root {
      font-family: Inter, system-ui, sans-serif;
      color: #172033;
      background: #eef2f8;
    }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
    }
    .demo-card {
      width: min(520px, calc(100% - 48px));
      padding: 32px;
      border: 1px solid #d9e0ec;
      border-radius: 20px;
      background: white;
      box-shadow: 0 24px 60px rgba(30, 44, 72, .12);
    }
    .eyebrow {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .12em;
      color: #5265db;
    }
    button {
      min-height: 42px;
      padding: 0 16px;
      border: 0;
      border-radius: 10px;
      background: #172033;
      color: white;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <main class="demo-card">
    <span class="eyebrow">AIZANOI WEB EDITOR</span>
    <h1>Hello, Aizanoi.</h1>
    <p>Write HTML, CSS and JavaScript in one file, then press Run.</p>
    <button id="hello">Test JavaScript</button>
  </main>
  <script>
    document.querySelector('#hello')?.addEventListener('click', () => {
      document.querySelector('h1').textContent = 'JavaScript is running.';
    });
  </script>
</body>
</html>`;

function validHtmlName(value){
  let name=String(value||'').trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ');
  if(!name)return '';
  if(!/\.html?$/i.test(name))name=`${name}.html`;
  if(name.length>96){
    const ext=name.toLowerCase().endsWith('.htm')?'.htm':'.html';
    name=`${name.slice(0,96-ext.length).trim()}${ext}`;
  }
  return name;
}
function isHtmlFile(node){
  const name=String(node?.name||'').toLowerCase();
  const mime=String(node?.mime||'').toLowerCase();
  return /\.html?$/.test(name)||mime==='text/html';
}
async function textOf(filesystem,node){
  if(!node)return '';
  const blob=await filesystem.readFileBlob(node.id);
  return blob?blob.text():'';
}
function mergeLegacySources(html='',css='',js=''){
  let documentSource=String(html||'').trim()||'<!doctype html><html><head></head><body></body></html>';
  const style=String(css||'').trim();
  const script=String(js||'').trim().replace(/<\/script/gi,'<\\/script');
  if(style){
    const styleTag=`\n<style>\n${style}\n</style>\n`;
    documentSource=/<\/head>/i.test(documentSource)?documentSource.replace(/<\/head>/i,`${styleTag}</head>`):`${styleTag}${documentSource}`;
  }
  if(script){
    const scriptTag=`\n<script>\n${script}\n</script>\n`;
    documentSource=/<\/body>/i.test(documentSource)?documentSource.replace(/<\/body>/i,`${scriptTag}</body>`):`${documentSource}${scriptTag}`;
  }
  return documentSource;
}

export async function mountWebEditor({container,options,capabilities}){
  const {filesystem,dialog,notifications,sound}=capabilities;
  let editorFolderId=null,fileId=null,fileName='Untitled.html',lastSavedAt=null;
  const revision=createRevisionTracker();
  let loadSeq=0,closed=false,tabEscape=false,tabIndent=true;
  try{tabIndent=localStorage.getItem('aizanoi-web-editor-tab')!=='focus';}catch{}
  let previewRunId=0,pendingPreview=null,previewTimer=null;
  let source=DEFAULT_DOCUMENT;

  container.innerHTML=`<div class="az-app-shell az-web-editor">
    <div class="az-web-editor-actions" role="toolbar" aria-label="Web Editor actions">
      <button class="az-button" type="button" data-web-action="new">New</button>
      <button class="az-button" type="button" data-web-action="open" aria-expanded="false">Open</button>
      <button class="az-button" type="button" data-web-action="save">Save</button>
      <button class="az-button" type="button" data-web-action="saveas">Save as</button>
      <span class="az-system-spacer"></span>
      <span class="az-web-editor-status" data-web-status>Unsaved file</span>
      <button class="az-button az-button-primary az-web-editor-run" type="button" data-web-action="run">Run</button>
    </div>
    <div class="az-web-editor-layout">
      <section class="az-web-editor-code" aria-label="HTML editor">
        <div class="az-web-editor-tabbar"><span class="az-web-editor-hint" data-web-tab-hint id="az-web-tab-hint"></span><button class="az-button" type="button" data-web-tab-toggle aria-pressed="true">Tab: indent</button></div>
        <textarea class="az-web-editor-text" data-web-source spellcheck="false" aria-label="HTML, CSS and JavaScript source" aria-describedby="az-web-tab-hint"></textarea>
        <p class="az-sr-only" role="status" data-web-tab-live></p>
      </section>
      <section class="az-web-editor-preview" aria-label="Preview">
        <span class="az-web-editor-security">sandboxed preview</span>
        <iframe class="az-web-editor-frame" data-web-preview title="Web project preview" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
        <div class="az-web-editor-preview-state" data-web-preview-state hidden></div>
        <section class="az-web-editor-console" aria-label="Preview console">
          <header><strong>Console</strong><button class="az-button" type="button" data-web-console-clear>Clear</button></header>
          <div class="az-web-editor-console-output" data-web-console-output role="log" aria-live="polite" aria-label="Preview console output"></div>
        </section>
      </section>
    </div>
    <aside class="az-web-editor-projects" data-web-projects hidden aria-label="Saved Web Editor files">
      <header class="az-web-editor-projects-head">
        <strong>Editor files</strong>
        <span class="az-system-spacer"></span>
        <button class="az-button" type="button" data-web-close-projects>Close</button>
      </header>
      <div class="az-web-editor-project-list" data-web-project-list></div>
    </aside>
  </div>`;

  const editor=container.querySelector('[data-web-source]');
  const statusEl=container.querySelector('[data-web-status]');
  const preview=container.querySelector('[data-web-preview]');
  const previewState=container.querySelector('[data-web-preview-state]');
  const consoleOutput=container.querySelector('[data-web-console-output]');
  const projectPanel=container.querySelector('[data-web-projects]');
  const projectList=container.querySelector('[data-web-project-list]');
  const openBtn=container.querySelector('[data-web-action="open"]');
  const tabBtn=container.querySelector('[data-web-tab-toggle]');
  const tabHint=container.querySelector('[data-web-tab-hint]');
  const tabLive=container.querySelector('[data-web-tab-live]');
  let tabTimer=null;
  function announceTab(text){tabLive.textContent='';clearTimeout(tabTimer);tabTimer=setTimeout(()=>{tabLive.textContent=text;},30);}
  editor.value=source;

  function renderState(message=''){
    if(message){statusEl.textContent=message;return;}
    if(revision.dirty){statusEl.textContent=`${fileName} · unsaved changes`;return;}
    if(fileId){
      statusEl.textContent=lastSavedAt?`${fileName} · saved ${lastSavedAt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`:`${fileName} · saved in Editor`;
      return;
    }
    statusEl.textContent=`${fileName} · local draft`;
  }
  function clearPreviewTimer(){
    if(previewTimer!==null){clearTimeout(previewTimer);previewTimer=null;}
  }
  function showPreviewState(message){
    previewState.textContent=message;
    previewState.hidden=false;
  }
  function hidePreviewState(){
    previewState.hidden=true;
    previewState.textContent='';
  }
  function clearConsole(){consoleOutput.replaceChildren();}
  function appendConsole(level,args=[]){
    const line=document.createElement('div');
    line.className=`az-web-editor-console-line is-${level}`;
    const tag=document.createElement('span');
    tag.className='az-web-editor-console-level';
    tag.textContent=level;
    const message=document.createElement('span');
    message.className='az-web-editor-console-message';
    message.textContent=args.map((value)=>String(value)).join(' ');
    line.append(tag,message);
    consoleOutput.append(line);
    while(consoleOutput.childElementCount>200)consoleOutput.firstElementChild?.remove();
    consoleOutput.scrollTop=consoleOutput.scrollHeight;
  }
  function postPendingPreview(){
    if(!pendingPreview||!preview.contentWindow)return;
    preview.contentWindow.postMessage({type:MESSAGE_RUN,runId:pendingPreview.runId,source:{html:pendingPreview.html,css:'',js:''}},'*');
  }
  function runPreview(){
    source=editor.value;
    const runId=++previewRunId;
    pendingPreview={runId,html:source};
    clearPreviewTimer();
    clearConsole();
    showPreviewState('Starting preview…');
    renderState(revision.dirty?'Running preview · unsaved changes':'Running preview');
    preview.src=`${PREVIEW_ROUTE}?run=${runId}`;
    previewTimer=setTimeout(()=>{
      previewTimer=null;
      if(!pendingPreview||pendingPreview.runId!==runId)return;
      showPreviewState('Preview could not start. The server preview policy may be missing or blocked.');
      renderState('Preview unavailable · check server preview policy');
    },2200);
    sound.play('click');
  }
  function handlePreviewMessage(event){
    if(event.source!==preview.contentWindow||!event.data||typeof event.data!=='object')return;
    if(event.data.type===MESSAGE_CONSOLE){
      if(!pendingPreview||event.data.runId!==pendingPreview.runId)return;
      const level=['log','warn','error'].includes(event.data.level)?event.data.level:'log';
      const args=Array.isArray(event.data.args)?event.data.args.slice(0,24).map((value)=>String(value).slice(0,1200)):[];
      appendConsole(level,args);
      return;
    }
    if(event.data.type===MESSAGE_READY){
      clearPreviewTimer();
      showPreviewState('Running…');
      postPendingPreview();
      return;
    }
    if(!pendingPreview||event.data.runId!==pendingPreview.runId)return;
    if(event.data.type===MESSAGE_DONE){
      clearPreviewTimer();
      hidePreviewState();
      renderState(revision.dirty?'Preview ready · unsaved changes':'Preview ready');
      return;
    }
    if(event.data.type===MESSAGE_ERROR){
      clearPreviewTimer();
      const message=String(event.data.message||'Runtime error').split('\n')[0].slice(0,180);
      showPreviewState(`Preview error: ${message}`);
      renderState('Preview error');
    }
  }

  async function ensureEditorFolder(){
    if(editorFolderId&&await filesystem.getNode(editorFolderId))return editorFolderId;
    const documents=await filesystem.getNode(filesystem.documentsId);
    const rootId=documents?.parent||filesystem.documentsId;
    const children=await filesystem.childrenOf(rootId);
    let folder=children.find((node)=>node.kind==='folder'&&String(node.name||'').trim().toLowerCase()==='editor');
    if(!folder)folder=await filesystem.createFolder({name:'Editor',parent:rootId});
    editorFolderId=folder.id;
    return editorFolderId;
  }
  let saving=null;
  function saveFile(asNew=false){if(saving)return saving;saving=writeFile(asNew).finally(()=>{saving=null;});return saving;}
  async function writeFile(asNew){
    const generation=revision.generation,targetId=fileId;
    let savedName=fileName;
    await ensureEditorFolder();
    let target=targetId&&!asNew?await filesystem.getNode(targetId):null;
    if(target&&target.parent!==editorFolderId)target=null;
    if(!target){
      const requested=await dialog.prompt({
        title:asNew?'Save HTML as':'Save Web Editor file',
        message:'The complete page is stored locally as one HTML file in Workspace / Editor.',
        label:'File name',
        defaultValue:fileName==='Untitled.html'?'My Web Page.html':fileName,
        confirmLabel:'Save'
      });
      if(requested==null)return false;
      const nextName=validHtmlName(requested);
      if(!nextName){notifications.notify('Web Editor','Choose a valid HTML file name.','error');return false;}
      const children=await filesystem.childrenOf(editorFolderId);
      const existing=children.find((node)=>node.kind==='file'&&String(node.name||'').toLowerCase()===nextName.toLowerCase());
      if(existing&&existing.id!==targetId){
        const choice=await dialog.confirm({title:'File already exists',message:`Replace ${nextName}?`,kind:'warn',confirmLabel:'Replace',cancelLabel:'Cancel'});
        if(choice!=='ok')return false;
      }
      target=existing||null;
      savedName=nextName;
    }else{
      savedName=target.name;
    }
    if(closed||generation!==revision.generation)return false;
    const snap=revision.snapshot(),blob=new Blob([editor.value],{type:HTML_MIME});
    let savedId;
    if(target){
      await filesystem.updateFileContent(target.id,blob);
      savedId=target.id;
    }else{
      const created=await filesystem.createFile({name:savedName,parent:editorFolderId,blob,mime:HTML_MIME});
      savedId=created.id;
    }
    if(closed||!revision.markSaved(snap))return false;
    fileId=savedId;
    fileName=savedName;
    lastSavedAt=new Date();
    renderState();
    sound.play('notification');
    notifications.notify('Aizanoi Web Editor',`${savedName} saved to Workspace / Editor.${revision.dirty?' Newer edits are still unsaved.':''}`,'system');
    return !revision.dirty;
  }
  async function resolveUnsaved(){
    const generation=revision.generation;
    if(saving)await saving;
    if(closed||generation!==revision.generation)return false;
    if(!revision.dirty)return true;
    const choice=await dialog.confirm({
      title:'Unsaved Web Editor changes',
      message:`Save changes to ${fileName} before continuing?`,
      kind:'warn',
      confirmLabel:'Save',
      secondaryLabel:'Discard',
      cancelLabel:'Cancel'
    });
    if(closed||generation!==revision.generation)return false;
    if(choice==='ok')return saveFile(false);
    if(choice==='secondary')return true;
    return false;
  }
  async function loadLegacyProject(folderId,{skipUnsaved=false}={}){
    const seq=++loadSeq;
    if(!skipUnsaved&&!(await resolveUnsaved()))return false;
    if(closed||seq!==loadSeq)return false;
    const editRev=revision.snapshot().rev;
    await ensureEditorFolder();
    const folder=await filesystem.getNode(folderId);
    if(!folder||folder.kind!=='folder')return false;
    const children=await filesystem.childrenOf(folder.id);
    const byName=new Map(children.filter((node)=>node.kind==='file').map((node)=>[String(node.name||'').toLowerCase(),node]));
    const htmlNode=byName.get('index.html')||byName.get('index.htm');
    if(!htmlNode)return false;
    const [html,css,js]=await Promise.all([
      textOf(filesystem,htmlNode),
      textOf(filesystem,byName.get('style.css')),
      textOf(filesystem,byName.get('script.js'))
    ]);
    if(closed||seq!==loadSeq)return false;
    if(revision.snapshot().rev!==editRev){notifications.notify('Web Editor','You kept typing while the project was loading, so it was not opened. Open it again to replace the text.','error');return false;}
    source=mergeLegacySources(html,css,js);
    editor.value=source;
    fileId=null;
    fileName=validHtmlName(folder.name)||'Imported project.html';
    revision.baseline();revision.markDirty();
    lastSavedAt=null;
    renderState(`${folder.name} · legacy project loaded · save to convert`);
    runPreview();
    return true;
  }
  async function loadFile(nextFileId,{skipUnsaved=false}={}){
    const seq=++loadSeq;
    if(!skipUnsaved&&!(await resolveUnsaved()))return false;
    if(closed||seq!==loadSeq)return false;
    const editRev=revision.snapshot().rev;
    await ensureEditorFolder();
    const file=await filesystem.getNode(nextFileId);
    if(!file||file.kind!=='file'||!isHtmlFile(file))return false;
    const parent=await filesystem.getNode(file.parent);
    if(closed||seq!==loadSeq||revision.snapshot().rev!==editRev)return false;
    if(parent?.kind==='folder'&&parent.parent===editorFolderId){
      return loadLegacyProject(parent.id,{skipUnsaved:true});
    }
    const text=await textOf(filesystem,file);
    if(closed||seq!==loadSeq)return false;
    if(revision.snapshot().rev!==editRev){notifications.notify('Web Editor','You kept typing while the file was loading, so it was not opened. Open it again to replace the text.','error');return false;}
    source=text;
    editor.value=source;
    fileId=file.parent===editorFolderId?file.id:null;
    fileName=validHtmlName(file.name)||'Imported.html';
    revision.baseline();
    lastSavedAt=file.updatedAt?new Date(file.updatedAt):null;
    renderState(fileId?'':'Opened outside Editor · Save will copy this file to Editor');
    runPreview();
    return true;
  }
  async function refreshFiles(){
    await ensureEditorFolder();
    const children=await filesystem.childrenOf(editorFolderId);
    const all=await filesystem.allNodes();
    const entries=children.filter((node)=>{
      if(node.kind==='file')return isHtmlFile(node);
      if(node.kind!=='folder')return false;
      return (node.children||[]).some((id)=>/^index\.html?$/i.test(String(all.get(id)?.name||'')));
    }).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    projectList.innerHTML=entries.length?entries.map((node)=>{
      const legacy=node.kind==='folder';
      return `<button class="az-web-editor-project" type="button" data-web-open-id="${esc(node.id)}" data-web-open-kind="${legacy?'legacy':'file'}"><span><strong>${esc(node.name)}</strong><small>${legacy?'Legacy 3-file project · opens as one HTML file':'Single HTML file'}</small></span><b>Open</b></button>`;
    }).join(''):'<p class="az-web-editor-empty">No saved HTML files yet.</p><button class="az-button az-button-primary az-web-editor-empty-action" type="button" data-web-action="save">Save this page as the first one</button>';
  }
  async function newFile(){
    const seq=++loadSeq;
    if(!(await resolveUnsaved())||closed||seq!==loadSeq)return;
    source=DEFAULT_DOCUMENT;
    editor.value=source;
    fileId=null;
    fileName='Untitled.html';
    loadSeq+=1;
    revision.baseline();
    lastSavedAt=null;
    renderState();
    runPreview();
    queueMicrotask(()=>editor.focus({preventScroll:true}));
  }

  const handleInput=()=>{source=editor.value;revision.touch();renderState();};
  function showProjects(){projectPanel.hidden=false;openBtn.setAttribute('aria-expanded','true');(projectList.querySelector('[data-web-open-id]')||projectPanel.querySelector('[data-web-close-projects]')).focus({preventScroll:true});}
  function hideProjects(restore){if(projectPanel.hidden)return;projectPanel.hidden=true;openBtn.setAttribute('aria-expanded','false');(restore==='editor'?editor:openBtn).focus({preventScroll:true});}
  function renderTabMode(){tabBtn.setAttribute('aria-pressed',String(tabIndent));tabBtn.textContent=tabIndent?'Tab: indent':'Tab: move focus';tabHint.textContent=tabIndent?'Tab inserts two spaces. Press Escape, then Tab, to move focus out of the editor.':'Tab moves focus out of the editor.';}
  const handlePointerDown=(event)=>{if(event.target.closest('[data-web-source]'))event.stopPropagation();};
  const handleKeyDown=(event)=>{
    if(event.target.matches('[data-web-source]')&&event.key==='Escape'&&tabIndent){
      tabEscape=true;event.stopPropagation();announceTab('Tab key now moves focus. Press Tab to leave the editor.');return;
    }
    if(event.key==='Escape'&&!projectPanel.hidden){event.preventDefault();event.stopPropagation();hideProjects();return;}
    if(event.target.matches('[data-web-source]')&&event.key==='Tab'){
      if(!tabIndent||event.shiftKey||tabEscape||event.ctrlKey||event.altKey||event.metaKey)return;
      event.preventDefault();
      const node=event.target,start=node.selectionStart,end=node.selectionEnd;
      node.setRangeText('  ',start,end,'end');
      node.dispatchEvent(new Event('input',{bubbles:true}));
      return;
    }
    if(event.target.matches('[data-web-source]')&&tabEscape&&event.key!=='Tab'&&event.key!=='Shift'&&event.key!=='Escape')tabEscape=false;
    if(!(event.ctrlKey||event.metaKey))return;
    if(event.key==='Enter'){event.preventDefault();event.stopPropagation();runPreview();return;}
    if(event.key.toLowerCase()==='s'){
      event.preventDefault();
      event.stopPropagation();
      saveFile(event.shiftKey).catch((error)=>notifications.notify('Web Editor',error.message,'error'));
    }
  };
  const handleClick=async(event)=>{
    if(event.target.closest('[data-web-console-clear]')){clearConsole();return;}
    if(event.target.closest('[data-web-close-projects]')){hideProjects();return;}
    if(event.target.closest('[data-web-tab-toggle]')){tabIndent=!tabIndent;tabEscape=false;try{localStorage.setItem('aizanoi-web-editor-tab',tabIndent?'indent':'focus');}catch{}renderTabMode();return;}
    const openButton=event.target.closest('[data-web-open-id]');
    const action=event.target.closest('[data-web-action]')?.dataset.webAction;
    if(!openButton&&!action)return;
    try{
      if(openButton){
        const opened=openButton.dataset.webOpenKind==='legacy'
          ?await loadLegacyProject(openButton.dataset.webOpenId)
          :await loadFile(openButton.dataset.webOpenId);
        if(opened)hideProjects('editor');
        return;
      }
      if(action==='run')runPreview();
      else if(action==='save')await saveFile(false);
      else if(action==='saveas')await saveFile(true);
      else if(action==='new')await newFile();
      else if(action==='open'){if(!projectPanel.hidden)hideProjects();else{await refreshFiles();showProjects();}}
    }catch(error){
      notifications.notify('Web Editor',`${error.message||'Something went wrong.'} Your current text was kept.`,'error');
    }
  };

  const handleBlur=()=>{tabEscape=false;};
  editor.addEventListener('blur',handleBlur);
  renderTabMode();
  editor.addEventListener('input',handleInput);
  container.addEventListener('pointerdown',handlePointerDown);
  container.addEventListener('keydown',handleKeyDown);
  container.addEventListener('click',handleClick);
  window.addEventListener('message',handlePreviewMessage);

  await ensureEditorFolder();
  if(options?.fileId)await loadFile(options.fileId,{skipUnsaved:true});
  else if(options?.projectFolderId)await loadLegacyProject(options.projectFolderId,{skipUnsaved:true});
  else {renderState();runPreview();}
  queueMicrotask(()=>editor.focus({preventScroll:true}));

  return{
    cleanup(){
      closed=true;loadSeq+=1;
      editor.removeEventListener('blur',handleBlur);
      clearTimeout(tabTimer);
      editor.removeEventListener('input',handleInput);
      container.removeEventListener('pointerdown',handlePointerDown);
      container.removeEventListener('keydown',handleKeyDown);
      container.removeEventListener('click',handleClick);
      window.removeEventListener('message',handlePreviewMessage);
      clearPreviewTimer();
      pendingPreview=null;
      preview.removeAttribute('src');
    },
    onOpen(newOptions){
      if(newOptions?.fileId)loadFile(newOptions.fileId).catch((error)=>notifications.notify('Web Editor',error.message,'error'));
      else if(newOptions?.projectFolderId)loadLegacyProject(newOptions.projectFolderId).catch((error)=>notifications.notify('Web Editor',error.message,'error'));
    },
    beforeClose(){return resolveUnsaved();}
  };
}
