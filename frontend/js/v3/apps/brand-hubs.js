const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const categoryLabel=(value)=>({
  'ai-technology':'AI & Technology',
  'markets-economy':'Markets & Economy',
  world:'World',sports:'Sports',culture:'Culture'
}[value]||value);

function shell(title,caption,body){return `<div class="az-app-shell"><div class="az-app-toolbar"><strong>${esc(title)}</strong><span class="az-system-spacer"></span><span class="az-app-caption">${esc(caption)}</span></div>${body}</div>`;}
function cards(items){return `<div class="az-simple-grid">${items.map((item)=>`<article class="az-simple-card"><p class="az-kicker">${esc(item.kicker||'AIZANOI')}</p><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>${item.button?`<button class="az-button" type="button" data-open-app="${esc(item.button)}">${esc(item.buttonLabel||'Open')}</button>`:''}${item.href?`<a class="az-button" href="${esc(item.href)}" target="_blank" rel="noopener noreferrer">${esc(item.hrefLabel||'Open link')}</a>`:''}</article>`).join('')}</div>`;}

async function mountNews(container){
  container.innerHTML=shell('Aizanoi News','Source-linked daily briefing','<div class="az-media"><div class="az-empty-state"><div><h3>Loading briefing…</h3><p>Reading the static Aizanoi News feed.</p></div></div></div>');
  const host=container.querySelector('.az-media');
  try{
    const response=await fetch('/content/news/index.json',{cache:'no-cache'});
    if(!response.ok)throw new Error(`News feed returned ${response.status}`);
    const feed=await response.json();
    const items=Array.isArray(feed.items)?feed.items:[];
    if(!items.length){host.innerHTML=`<div class="az-empty-state"><div><h3>No briefing published yet</h3><p>Aizanoi News is ready for Hermes to publish original, source-linked summaries in AI & Technology, Markets & Economy, World, Sports and Culture.</p></div></div>`;return;}
    host.innerHTML=`<div class="az-simple-grid">${items.map((item)=>`<article class="az-simple-card"><p class="az-kicker">${esc(categoryLabel(item.category))}</p><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><small>${esc(new Date(item.publishedAt).toLocaleString())}</small><div class="az-source-list">${(item.sources||[]).map((source)=>`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.publisher)}</a>`).join(' · ')}</div></article>`).join('')}</div>`;
  }catch(error){host.innerHTML=`<div class="az-empty-state"><div><h3>News feed unavailable</h3><p>${esc(error.message)}</p></div></div>`;}
}

function mountAnalytics(container){container.innerHTML=shell('Aizanoi Analytics','Dashboards, data products & utilities',cards([
  {kicker:'DATA PRODUCTS',title:'Public analytical applications',body:'Dashboards, market tools, model comparisons and data utilities built under the Aizanoi brand will live here.'},
  {kicker:'PRODUCT STANDARD',title:'Launch · Source · Documentation · Version',body:'Each production project should expose a usable product surface, its source when public, concise documentation and a visible version or release state.'},
  {kicker:'OPEN FOR BUILDS',title:'A growing public portfolio',body:'New analytical applications will be added here as complete, end-user-facing products rather than internal research utilities.'}
]));}

function mountForge(container){container.innerHTML=shell('Aizanoi Forge','Source, builds & open projects',cards([
  {kicker:'SOURCE OF TRUTH',title:'aizanoianalytics/aizanoi-analytics',body:'GitHub remains canonical. Forge is the branded project catalog and mirror layer, not a second independent copy of source code.',href:'https://github.com/aizanoianalytics/aizanoi-analytics',hrefLabel:'Open GitHub'},
  {kicker:'PROJECT',title:'AizanoiOS',body:'Browser-native adaptive shell for Aizanoi media, studio products, Historical Worlds and experiments.'},
  {kicker:'PROJECT',title:'Historical Worlds',body:'Shared runtime and city-local reconstructions for Aizanoi, Rome and Athens.',button:'worlds',buttonLabel:'Open Worlds'}
]));}

function mountJournal(container){container.innerHTML=shell('Aizanoi Journal','Analysis, essays & commentary','<div class="az-empty-state"><div><h3>Journal desk is ready</h3><p>Long-form AI, technology, markets, cinema, football and research writing will live here. News reports what happened; Journal explains what it means.</p></div></div>');}
function mountLabs(container){container.innerHTML=shell('Aizanoi Labs','Experimental · Prototype · Archived',cards([
  {kicker:'EXPERIMENTAL',title:'Prototype shelf',body:'Small WebGL, WebGPU, UI, audio, physics and generative experiments belong here even when they are intentionally unfinished.'},
  {kicker:'SEPARATION',title:'Games live in Arcade',body:'Playable games are promoted to Aizanoi Arcade; Labs remains the place for prototypes and technical experiments.',button:'games',buttonLabel:'Open Arcade'}
]));}

export async function mount({container,appId,api}){
  if(appId==='news')await mountNews(container);
  else if(appId==='analytics')mountAnalytics(container);
  else if(appId==='forge')mountForge(container);
  else if(appId==='journal')mountJournal(container);
  else if(appId==='labs')mountLabs(container);
  else container.innerHTML=shell('Aizanoi','Digital studio','<div class="az-empty-state"><div><h3>Unknown hub</h3></div></div>');
  const click=(event)=>{const id=event.target.closest('[data-open-app]')?.dataset.openApp;if(id)api.openApp(id);};
  container.addEventListener('click',click);
  return()=>container.removeEventListener('click',click);
}
