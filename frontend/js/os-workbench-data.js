(() => {
  'use strict';
  const W=window.AIZANOI_WORKSPACE,A=window.AIZANOI_ARCHIVE,P=window.AIZANOI_PLATFORM;
  if(!W||!A||!P)return;
  const $=(s,r=document)=>r.querySelector(s),esc=W.escapeHtml;

  function parseCSV(text=''){
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<String(text).length;i+=1){const ch=text[i],next=text[i+1];if(ch==='"'){if(quoted&&next==='"'){cell+='"';i+=1;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i+=1;row.push(cell);cell='';if(row.some((v)=>String(v).trim()!==''))rows.push(row);row=[];}else cell+=ch;}
    if(cell.length||row.length){row.push(cell);if(row.some((v)=>String(v).trim()!==''))rows.push(row);}
    const headers=(rows.shift()||[]).map((value,index)=>String(value||`Column ${index+1}`).trim()||`Column ${index+1}`);
    return {headers,rows:rows.map((r)=>headers.map((_,i)=>r[i]??''))};
  }

  function jsonTable(text=''){
    try{const parsed=JSON.parse(text||'null'),array=Array.isArray(parsed)?parsed:[parsed],objects=array.map((item)=>item&&typeof item==='object'&&!Array.isArray(item)?item:{value:item});const headers=[...new Set(objects.flatMap((item)=>Object.keys(item||{})))].slice(0,60);return {headers,rows:objects.map((item)=>headers.map((key)=>{const value=item?.[key];return value&&typeof value==='object'?JSON.stringify(value):value??'';}))};}
    catch(error){return {headers:['Error'],rows:[[error.message]]};}
  }
  function table(record){return A.ext(record.name)==='json'||/json/i.test(record.mime)?jsonTable(record.text):parseCSV(record.text);}
  function profile(data){let missing=0,total=0,numericColumns=0;for(let c=0;c<data.headers.length;c+=1){const values=data.rows.map((row)=>String(row[c]??'').trim());total+=values.length;missing+=values.filter((v)=>!v).length;const numeric=values.map(Number).filter(Number.isFinite);if(numeric.length>=Math.max(2,values.length*.65))numericColumns+=1;}return {rows:data.rows.length,columns:data.headers.length,missing,total,numericColumns};}
  function preview(data,limit=500,filter=''){const q=filter.trim().toLowerCase(),rows=data.rows.filter((row)=>!q||row.some((v)=>String(v).toLowerCase().includes(q))).slice(0,limit);return `<div class="az-data-table-wrap"><table class="az-data-table"><thead><tr>${data.headers.map((h)=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row)=>`<tr>${data.headers.map((_,i)=>`<td>${esc(row[i]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}

  function summary(record,data,stats){return `# Data Lab summary — ${record.name}\n\nRows: ${stats.rows}\nColumns: ${stats.columns}\nMissing cells: ${stats.missing}\nNumeric-like columns: ${stats.numericColumns}\n\nColumns:\n${data.headers.map((h)=>`- ${h}`).join('\n')}`;}
  function exportCSV(record,data){const quote=(v)=>`"${String(v??'').replace(/"/g,'""')}"`,csv=[data.headers.map(quote).join(','),...data.rows.map((row)=>data.headers.map((_,i)=>quote(row[i])).join(','))].join('\n');W.downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),`${record.name.replace(/\.(csv|json)$/i,'')}-export.csv`);}

  async function render(win,payload={}){
    const body=$('[data-workbench-body="data-lab"]',win),record=payload.recordId?await A.get(payload.recordId):null,data=record?table(record):{headers:[],rows:[]},stats=profile(data);W.activePayload.set('data-lab',payload);
    body.innerHTML=`<div class="az-lab-shell"><header class="az-workbench-toolbar az-lab-header"><div><span class="az-kicker">DATA LAB / LOCAL ANALYSIS</span><h2>${esc(record?.name||'No dataset open')}</h2></div><div class="az-toolbar-spacer"></div>${record?'<button class="az-tool-btn" data-lab-action="notes">Send to Notes</button><button class="az-tool-btn accent" data-lab-action="ai">Ask AI</button><button class="az-tool-btn primary" data-lab-action="export">Export CSV</button>':'<button class="az-tool-btn primary" data-lab-action="archive">Open Field Archive</button>'}</header>${record?`<section class="az-metric-strip"><article><span>ROWS</span><b>${stats.rows}</b><small>loaded locally</small></article><article><span>COLUMNS</span><b>${stats.columns}</b><small>${stats.numericColumns} numeric-like</small></article><article><span>MISSING</span><b>${stats.missing}</b><small>${stats.total?(stats.missing/stats.total*100).toFixed(1):'0.0'}% cells</small></article><article><span>SIZE</span><b>${P.formatBytes(record.size||0)}</b><small>${esc(record.collection)}</small></article></section><div class="az-data-controls"><label class="az-search-field"><span>⌕</span><input data-lab-filter placeholder="Filter visible rows"></label><span>Preview capped at 500 rows for responsiveness.</span></div><div data-lab-table>${preview(data)}</div>`:'<div class="az-empty-state az-lab-empty"><div class="az-empty-orbit">∑</div><h3>Data Lab is ready</h3><p>Open a CSV or JSON file from Field Archive to profile and inspect it.</p><button class="az-tool-btn primary" data-lab-action="archive">Open Field Archive</button></div>'}</div>`;
    body.onclick=(event)=>{const action=event.target.closest('[data-lab-action]')?.dataset.labAction;if(action==='archive')W.open('archive',{collection:'Datasets'});if(action==='notes'&&record)W.sendToNotes(record,summary(record,data,stats));if(action==='export'&&record)exportCSV(record,data);if(action==='ai'&&record){const sample=data.rows.slice(0,60).map((row)=>Object.fromEntries(data.headers.map((h,i)=>[h,row[i]])));W.askAI('Analyze this dataset structure and sample. Identify useful patterns, data-quality concerns and analyses worth running next.',`Dataset: ${record.name}\nRows: ${stats.rows}; columns: ${stats.columns}; missing cells: ${stats.missing}.\nColumns: ${data.headers.join(', ')}\nSample rows:\n${JSON.stringify(sample).slice(0,12000)}`);}};
    $('[data-lab-filter]',body)?.addEventListener('input',(event)=>{$('[data-lab-table]',body).innerHTML=preview(data,500,event.target.value);});
  }

  W.registerRenderer('data-lab',render);
})();