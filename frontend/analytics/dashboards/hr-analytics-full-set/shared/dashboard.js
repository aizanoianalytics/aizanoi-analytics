const payloadNode=document.querySelector('#dashboard-data');
const payload=JSON.parse(payloadNode?.textContent||'{}');
const state={tab:payload.views?.[0]?.id||'',filters:{period:'All',region:'All',store:'All',department:'All'},search:'',sort:null,direction:1,profileId:null};
const filters=['period','region','store','department'];
const fmt=new Intl.NumberFormat('en-US',{maximumFractionDigits:1});
const pct=new Intl.NumberFormat('en-US',{style:'percent',maximumFractionDigits:1});

function esc(value){return String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function text(value){return String(value??'').trim();}
function rowsFor(view){return Array.isArray(payload.datasets?.[view.dataset])?payload.datasets[view.dataset]:[];}
function valueForFilter(row,key){const field=payload.filterFields?.[key]||key;return text(row[field]);}
function filtered(view){
  let rows=rowsFor(view).filter((row)=>filters.every((key)=>state.filters[key]==='All'||valueForFilter(row,key)===state.filters[key]));
  if(state.search){const needle=state.search.toLocaleLowerCase('en-US');rows=rows.filter((row)=>Object.values(row).some((value)=>text(value).toLocaleLowerCase('en-US').includes(needle)));}
  if(state.sort){rows=[...rows].sort((a,b)=>{const av=a[state.sort],bv=b[state.sort];return (typeof av==='number'&&typeof bv==='number'?av-bv:text(av).localeCompare(text(bv)))*state.direction;});}
  return rows;
}
function compute(rows,metric){
  if(metric.op==='count')return rows.length;
  if(metric.op==='distinct')return new Set(rows.map((row)=>text(row[metric.field])).filter(Boolean)).size;
  if(metric.op==='sum')return rows.reduce((sum,row)=>sum+(Number(row[metric.field])||0),0);
  if(metric.op==='avg')return rows.length?rows.reduce((sum,row)=>sum+(Number(row[metric.field])||0),0)/rows.length:0;
  if(metric.op==='countWhere')return rows.filter((row)=>text(row[metric.field])===text(metric.equals)).length;
  if(metric.op==='rateWhere')return rows.length?rows.filter((row)=>text(row[metric.field])===text(metric.equals)).length/rows.length:0;
  return 0;
}
function formatMetric(value,metric){if(metric.format==='percent')return pct.format(value||0);if(metric.format==='days')return `${fmt.format(value||0)} d`;if(metric.format==='hours')return `${fmt.format(value||0)} h`;return fmt.format(value||0);}
function aggregate(rows,chart){
  const groups=new Map();
  for(const row of rows){const key=text(row[chart.groupBy])||'Unspecified';const entry=groups.get(key)||{count:0,total:0};entry.count+=1;entry.total+=Number(row[chart.field])||0;groups.set(key,entry);}
  let values=[...groups].map(([label,entry])=>({label,value:chart.op==='avg'?(entry.total/entry.count):chart.op==='sum'?entry.total:entry.count}));
  values.sort(chart.order==='time'?(a,b)=>a.label.localeCompare(b.label):(a,b)=>b.value-a.value);
  return chart.order==='time'?values.slice(-(chart.limit||12)):values.slice(0,chart.limit||12);
}
function barChart(values){
  if(!values.length)return '<div class="empty">No matching chart data.</div>';
  const width=680,height=260,left=150,right=35,top=12,rowH=(height-top-15)/values.length,max=Math.max(...values.map((item)=>item.value),1);
  return `<svg viewBox="0 0 ${width} ${height}" role="img">${values.map((item,index)=>{const y=top+index*rowH,w=(item.value/max)*(width-left-right),label=max<=1?pct.format(item.value):fmt.format(item.value);return `<text x="0" y="${y+rowH*.64}">${esc(item.label.slice(0,22))}</text><rect class="bar" x="${left}" y="${y+4}" width="${Math.max(w,1)}" height="${Math.max(rowH-8,4)}" rx="3"></rect><text x="${Math.min(left+w+6,width-30)}" y="${y+rowH*.64}">${esc(label)}</text>`;}).join('')}</svg>`;
}
function lineChart(values){
  if(values.length<2)return barChart(values);
  const width=680,height=260,left=38,right=20,top=18,bottom=35,max=Math.max(...values.map((item)=>item.value),1),step=(width-left-right)/(values.length-1);
  const points=values.map((item,index)=>`${left+index*step},${top+(height-top-bottom)*(1-item.value/max)}`).join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" role="img"><line class="gridline" x1="${left}" x2="${width-right}" y1="${height-bottom}" y2="${height-bottom}"></line><polyline class="line" points="${points}"></polyline>${values.map((item,index)=>index%Math.max(1,Math.ceil(values.length/6))===0?`<text x="${left+index*step}" y="${height-10}" text-anchor="middle">${esc(item.label)}</text>`:'').join('')}</svg>`;
}
function renderTable(rows,view){
  const columns=view.columns||Object.keys(rows[0]||{}).slice(0,8);
  const shown=rows.slice(0,view.rowLimit||150);
  if(!shown.length)return '<div class="empty">No rows match the current filters.</div>';
  return `<div class="table-scroll"><table class="data-table"><thead><tr>${columns.map((column)=>`<th data-sort="${esc(column)}">${esc((view.labels?.[column]||column).replaceAll('_',' '))}</th>`).join('')}</tr></thead><tbody>${shown.map((row)=>`<tr data-profile-id="${esc(row.employee_id||'')}">${columns.map((column)=>`<td>${esc(row[column])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="eyebrow">Showing ${shown.length} of ${rows.length} matching rows</p>`;
}
function renderProfile(rows,view){
  const person=rows.find((row)=>row.employee_id===state.profileId)||rows[0];
  if(!person)return '<div class="empty">Search or filter to select a synthetic profile.</div>';
  state.profileId=person.employee_id;
  const details=(view.profileFields||Object.keys(person).slice(0,10)).map((field)=>`<div><span>${esc(field.replaceAll('_',' '))}</span><strong>${esc(person[field])}</strong></div>`).join('');
  return `<div class="profile"><div class="profile-card"><p class="eyebrow">Synthetic profile</p><h3>${esc(person.display_name||person.employee_id)}</h3><span class="status good">${esc(person.status||'Synthetic')}</span><div class="profile-grid">${details}</div></div><div class="panel table-panel"><h3>Matching profiles</h3>${renderTable(rows,{...view,columns:view.columns||['employee_id','display_name','department','title','region','status'],rowLimit:100})}</div></div>`;
}
function render(){
  const view=payload.views.find((item)=>item.id===state.tab)||payload.views[0];
  const rows=filtered(view);
  document.querySelector('#tabs').innerHTML=payload.views.map((item)=>`<button class="tab" type="button" data-tab="${esc(item.id)}" aria-selected="${item.id===view.id}">${esc(item.label)}</button>`).join('');
  const kpis=(view.kpis||[]).map((metric)=>{const value=compute(rows,metric);return `<article class="kpi"><span>${esc(metric.label)}</span><strong>${esc(formatMetric(value,metric))}</strong><small>${esc(metric.note||'Updates with filters')}</small></article>`;}).join('');
  const charts=(view.charts||[]).map((chart)=>{const values=aggregate(rows,chart);return `<article class="panel"><h3>${esc(chart.title)}</h3><div class="chart">${chart.type==='line'?lineChart(values):barChart(values)}</div></article>`;}).join('');
  const body=view.kind==='profile'?renderProfile(rows,view):`<section class="kpis">${kpis}</section><section class="visual-grid">${charts}</section><section class="panel table-panel"><h3>${esc(view.tableTitle||'Detail explorer')}</h3>${renderTable(rows,view)}</section>`;
  document.querySelector('#view').innerHTML=`<div class="view-head"><div><h2>${esc(view.title)}</h2><p>${esc(view.description)}</p></div><button class="export-button" type="button" id="export-current">Export filtered CSV</button></div>${body}`;
  bindView();
}
function fillFilters(){
  for(const key of filters){const select=document.querySelector(`#filter-${key}`);const values=payload.filters?.[key]||[];select.innerHTML=['All',...values].map((value)=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');select.value=state.filters[key];select.addEventListener('change',()=>{state.filters[key]=select.value;state.profileId=null;render();});}
}
function csv(view,rows){const columns=view.columns||Object.keys(rows[0]||{});const quote=(value)=>`"${String(value??'').replaceAll('"','""')}"`;return [columns.map(quote).join(','),...rows.map((row)=>columns.map((column)=>quote(row[column])).join(','))].join('\r\n');}
function bindView(){
  document.querySelectorAll('[data-tab]').forEach((button)=>button.addEventListener('click',()=>{state.tab=button.dataset.tab;state.sort=null;state.profileId=null;render();}));
  document.querySelectorAll('[data-sort]').forEach((head)=>head.addEventListener('click',()=>{state.direction=state.sort===head.dataset.sort?-state.direction:1;state.sort=head.dataset.sort;render();}));
  document.querySelectorAll('[data-profile-id]').forEach((row)=>row.addEventListener('click',()=>{if(row.dataset.profileId){state.profileId=row.dataset.profileId;render();}}));
  document.querySelector('#export-current')?.addEventListener('click',()=>{const view=payload.views.find((item)=>item.id===state.tab)||payload.views[0],rows=filtered(view),blob=new Blob([csv(view,rows)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${payload.meta.id}-${view.id}.csv`;link.click();URL.revokeObjectURL(url);});
}
document.querySelector('#search').addEventListener('input',(event)=>{state.search=event.target.value;state.profileId=null;render();});
document.querySelector('#clear-filters').addEventListener('click',()=>{state.filters={period:'All',region:'All',store:'All',department:'All'};state.search='';document.querySelector('#search').value='';fillFilters();render();});
fillFilters();render();
