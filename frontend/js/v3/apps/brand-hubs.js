const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const categoryLabel=(value)=>({
  ai:'AI',technology:'Technology','economy-markets':'Economy / Markets',football:'Football'
}[value]||value);

function shell(title,caption,body){return `<div class="az-app-shell"><div class="az-app-toolbar"><strong>${esc(title)}</strong><span class="az-system-spacer"></span><span class="az-app-caption">${esc(caption)}</span></div>${body}</div>`;}
function cards(items){return `<div class="az-simple-grid">${items.map((item)=>`<article class="az-simple-card"><p class="az-kicker">${esc(item.kicker||'AIZANOI ANALYTICS')}</p><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>${item.button?`<button class="az-button" type="button" data-open-app="${esc(item.button)}">${esc(item.buttonLabel||'Open')}</button>`:''}${item.href?`<a class="az-button" href="${esc(item.href)}" target="_blank" rel="noopener noreferrer">${esc(item.hrefLabel||'Open link')}</a>`:''}</article>`).join('')}</div>`;}

export function renderNewsFeed(feed){
  const editions=Array.isArray(feed?.editions)?feed.editions:[];
  const weeklyEditions=Array.isArray(feed?.weeklyEditions)?feed.weeklyEditions:[];
  const items=Array.isArray(feed?.items)?feed.items:[];
  const current=editions[0];
  if(!current&&!weeklyEditions[0])return `<div class="az-news-empty"><p class="az-kicker">THE PRESS IS READY</p><h3>No edition has been published yet</h3><p>The News Desk is preparing original, concise reports with named editors and linked sources.</p><a class="az-button" href="/news/">Visit the News archive</a></div>`;
  const currentItems=current?items.filter((item)=>String(item.publishedAt||'').slice(0,10)===current.date&&item.kind!=='weekly'):[];
  const weekly=weeklyEditions[0];
  const weeklyItems=weekly?items.filter((item)=>item.kind==='weekly'&&String(item.publishedAt||'').slice(0,10)===weekly.date):[];
  const weeklyBlock=weekly?`<aside class="az-news-weekly"><header><p class="az-kicker">Weekly edition · ${esc(weekly.week)}</p><h3>Aizanoi News · ${esc(weekly.date)}</h3></header><div class="az-news-columns">${weeklyItems.map((item)=>`<article><p class="az-kicker">${esc(categoryLabel(item.category))}</p><h4>${esc(item.title)}</h4><p>${esc(item.summary)}</p><p class="az-news-byline">By ${esc(item.author?.name)} · Edited by ${esc(item.editor?.name)}</p><div class="az-source-list">${(item.sources||[]).map((source)=>`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.publisher)}</a>`).join(' · ')}</div><a class="az-button" href="${esc(weekly.path)}">Read the weekly edition</a></article>`).join('')}</div></aside>`:'';
  const dailyBlock=current?`<section class="az-news-edition"><header><div><p class="az-kicker">Current edition · ${esc(current.date)}</p><h2>Aizanoi News</h2></div><div class="az-news-actions"><a class="az-button" href="${esc(current.path)}">Read current edition</a><a href="/news/">All editions</a></div></header><div class="az-news-columns">${currentItems.map((item)=>`<article><p class="az-kicker">${esc(categoryLabel(item.category))}</p><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><p class="az-news-byline">By ${esc(item.author?.name)} · Edited by ${esc(item.editor?.name)}</p><div class="az-source-list">${(item.sources||[]).map((source)=>`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.publisher)}</a>`).join(' · ')}</div></article>`).join('')}</div></section>`:'';
  return dailyBlock+weeklyBlock;
}

async function mountNews(container){
  container.innerHTML=shell('Aizanoi News','Daily editions · Source-linked','<div class="az-media"><div class="az-empty-state"><div><h3>Loading today’s edition…</h3><p>Reading the static edition feed.</p></div></div></div>');
  const host=container.querySelector('.az-media');
  try{
    const response=await fetch('/news/index.json',{cache:'no-cache'});
    if(!response.ok)throw new Error(`News feed returned ${response.status}`);
    host.innerHTML=renderNewsFeed(await response.json());
  }catch(error){host.innerHTML=`<div class="az-empty-state"><div><h3>News feed unavailable</h3><p>${esc(error.message)}</p><a class="az-button" href="/news/">Open the News archive</a></div></div>`;}
}

function mountAnalytics(container){container.innerHTML=shell('Analytics','Data products, comparisons & utilities',cards([
  {kicker:'PUBLIC PILOT · SYNTHETIC DATA',title:'Workforce Turnover Analytics',body:'Explore a two-year fictional workforce scenario built by Aizanoi Analytics with transparent formulas and aggregate data only.',href:'/analytics/workforce-turnover/',hrefLabel:'Launch dashboard'},
  {kicker:'PRODUCT STANDARD',title:'Launch · Source · Documentation · Version',body:'Each production project should expose a usable product surface, its source when public, concise documentation and a visible version or release state.'},
  {kicker:'DATA SAFETY',title:'Synthetic first',body:'Public demonstrations use data generated from scratch. Employer files and person-level records do not enter the public build.'}
]));}

function mountForge(container){container.innerHTML=shell('Aizanoi Forge','Source, builds & open projects',cards([
  {kicker:'SOURCE OF TRUTH',title:'aizanoianalytics/aizanoi-analytics',body:'GitHub remains canonical. Forge is the branded project catalog and mirror layer, not a second independent copy of source code.',href:'https://github.com/aizanoianalytics/aizanoi-analytics',hrefLabel:'Open GitHub'},
  {kicker:'PROJECT',title:'AizanoiOS',body:'Browser-native adaptive shell for Aizanoi Analytics media, data products, Historical Worlds and experiments.'},
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
  else container.innerHTML=shell('Aizanoi Analytics','Digital studio','<div class="az-empty-state"><div><h3>Unknown hub</h3></div></div>');
  const click=(event)=>{const id=event.target.closest('[data-open-app]')?.dataset.openApp;if(id)api.openApp(id);};
  container.addEventListener('click',click);
  return()=>container.removeEventListener('click',click);
}
