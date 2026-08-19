(() => {
  'use strict';
  const W=window.AIZANOI_WORKSPACE,A=window.AIZANOI_ARCHIVE,P=window.AIZANOI_PLATFORM;
  if(!W||!A||!P)return;
  const $=(s,r=document)=>r.querySelector(s),esc=W.escapeHtml;

  function renderMarkdown(text){
    const out=[];let code=false;
    for(const raw of String(text||'').split('\n')){
      if(/^```/.test(raw)){code=!code;out.push(code?'<pre><code>':'</code></pre>');continue;}
      if(code){out.push(`${esc(raw)}\n`);continue;}
      if(/^###\s/.test(raw))out.push(`<h3>${esc(raw.replace(/^###\s+/,''))}</h3>`);
      else if(/^##\s/.test(raw))out.push(`<h2>${esc(raw.replace(/^##\s+/,''))}</h2>`);
      else if(/^#\s/.test(raw))out.push(`<h1>${esc(raw.replace(/^#\s+/,''))}</h1>`);
      else if(/^[-*]\s/.test(raw))out.push(`<p class="az-source-bullet">• ${esc(raw.replace(/^[-*]\s+/,''))}</p>`);
      else if(!raw.trim())out.push('<div class="az-source-gap"></div>');
      else out.push(`<p>${esc(raw)}</p>`);
    }
    return out.join('');
  }

  async function renderSource(win,payload={}){
    const body=$('[data-workbench-body="source-reader"]',win),record=payload.recordId?await A.get(payload.recordId):null;W.activePayload.set('source-reader',payload);
    body.innerHTML=`<div class="az-reader-shell"><header class="az-workbench-toolbar"><div><span class="az-kicker">SOURCE READER / ARCHIVE CONTEXT</span><h2>${esc(record?.name||'No source open')}</h2></div><div class="az-toolbar-spacer"></div>${record?'<label class="az-search-field compact"><span>⌕</span><input data-source-search placeholder="Find in source"></label><button class="az-tool-btn" data-source-action="notes">Send to Notes</button><button class="az-tool-btn accent" data-source-action="ai">Ask AI</button>':'<button class="az-tool-btn primary" data-source-action="archive">Open Archive</button>'}</header><section class="az-reader-canvas" data-source-canvas>${record?'<div class="az-preview-loading">Opening source…</div>':'<div class="az-empty-state"><div class="az-empty-orbit">¶</div><h3>Source Reader</h3><p>Open PDF, Markdown or text material from Field Archive.</p></div>'}</section>${record?`<footer class="az-workbench-status"><span>${esc(record.collection)}</span><span>${P.formatBytes(record.size||0)}</span><span data-source-match>READY</span></footer>`:''}</div>`;
    if(record){
      const canvas=$('[data-source-canvas]',body);
      if(record.kind==='pdf'&&record.blob){const url=URL.createObjectURL(record.blob);W.objectUrls.add(url);canvas.innerHTML=`<object class="az-source-pdf" data="${url}" type="application/pdf"><div class="az-empty-state"><h3>Browser PDF viewer unavailable</h3><button class="az-tool-btn primary" data-source-download>Download PDF</button></div></object>`;$('[data-source-download]',canvas)?.addEventListener('click',()=>W.downloadBlob(record.blob,record.name));}
      else {const text=record.text||'';canvas.innerHTML=`<article class="az-source-document" data-source-document>${['markdown','note'].includes(record.kind)?renderMarkdown(text):`<pre>${esc(text)}</pre>`}</article>`;const search=$('[data-source-search]',body);search?.addEventListener('input',()=>{const q=search.value.trim().toLowerCase(),count=q?(text.toLowerCase().match(new RegExp(W.escapeRegExp(q),'g'))||[]).length:0;$('[data-source-match]',body).textContent=q?`${count} MATCH${count===1?'':'ES'}`:'READY';});}
    }
    body.onclick=async(event)=>{const action=event.target.closest('[data-source-action]')?.dataset.sourceAction;if(action==='archive')W.open('archive',{collection:'Sources'});if(action==='notes'&&record)W.sendToNotes(record);if(action==='ai'&&record)W.askAI('Explain and assess this source. Summarize the strongest evidence, uncertainties and useful follow-up questions.',`Source: ${record.name}\nCollection: ${record.collection}\n\n${String(record.text||'PDF source opened locally; no extracted text is available in the browser reader.').slice(0,14000)}`);};
  }

  async function renderArtifact(win,payload={}){
    const body=$('[data-workbench-body="artifact-viewer"]',win),record=payload.recordId?await A.get(payload.recordId):null;W.activePayload.set('artifact-viewer',payload);
    if(!record?.blob){body.innerHTML='<div class="az-empty-state az-artifact-empty"><div class="az-empty-orbit">◈</div><h3>Artifact Viewer</h3><p>Open an image from Field Archive.</p><button class="az-tool-btn primary" data-artifact-action="archive">Open Archive</button></div>';body.onclick=(event)=>{if(event.target.closest('[data-artifact-action="archive"]'))W.open('archive',{collection:'Screenshots'});};return;}
    const url=URL.createObjectURL(record.blob);W.objectUrls.add(url);body.innerHTML=`<div class="az-artifact-shell"><header class="az-workbench-toolbar"><div><span class="az-kicker">ARTIFACT VIEWER / VISUAL RECORD</span><h2>${esc(record.name)}</h2></div><div class="az-toolbar-spacer"></div><button class="az-tool-btn" data-artifact-action="notes">Send to Notes</button><button class="az-tool-btn" data-artifact-action="download">Download</button><button class="az-tool-btn" data-artifact-action="fit">Fit</button><button class="az-tool-btn" data-artifact-action="minus">−</button><span class="az-zoom-readout" data-artifact-zoom>100%</span><button class="az-tool-btn" data-artifact-action="plus">＋</button></header><div class="az-artifact-stage" data-artifact-stage><img src="${url}" alt="${esc(record.name)}" data-artifact-image></div><footer class="az-workbench-status"><span>${esc(record.collection)}</span><span>${esc(record.mime||'image')}</span><span>${P.formatBytes(record.size||0)}</span></footer></div>`;
    let zoom=1;const image=$('[data-artifact-image]',body);const update=()=>{image.style.transform=`scale(${zoom})`;$('[data-artifact-zoom]',body).textContent=`${Math.round(zoom*100)}%`;};
    body.onclick=async(event)=>{const action=event.target.closest('[data-artifact-action]')?.dataset.artifactAction;if(action==='notes')W.sendToNotes(record,`# Visual record — ${record.name}\n\nArchive image: ${record.name}\nType: ${record.mime||'image'}\nSize: ${P.formatBytes(record.size||0)}\n`);if(action==='download')W.downloadBlob(record.blob,record.name);if(action==='fit'){zoom=1;update();}if(action==='minus'){zoom=Math.max(.25,zoom-.15);update();}if(action==='plus'){zoom=Math.min(4,zoom+.15);update();}};
  }

  W.registerRenderer('source-reader',renderSource);W.registerRenderer('artifact-viewer',renderArtifact);
})();