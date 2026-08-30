const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function shell(title,caption,body){return `<div class="az-app-shell"><div class="az-app-toolbar"><strong>${esc(title)}</strong><span class="az-system-spacer"></span><span class="az-app-caption">${esc(caption)}</span></div>${body}</div>`;}
function cards(items){return `<div class="az-simple-grid">${items.map((item)=>`<article class="az-simple-card"><p class="az-kicker">${esc(item.kicker||'AIZANOI ANALYTICS')}</p><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>${item.button?`<button class="az-button" type="button" data-open-app="${esc(item.button)}">${esc(item.buttonLabel||'Open')}</button>`:''}</article>`).join('')}</div>`;}

function mountJournal(container){container.innerHTML=shell('Aizanoi Journal','Analysis, essays & commentary','<div class="az-empty-state"><div><h3>Journal desk is ready</h3><p>Long-form AI, technology, markets, cinema, football and research writing will live here. News reports what happened; Journal explains what it means.</p></div></div>');}
function mountLabs(container){container.innerHTML=shell('Aizanoi Labs','Experimental · Prototype · Archived',cards([
  {kicker:'EXPERIMENTAL',title:'Prototype shelf',body:'Small WebGL, WebGPU, UI, audio, physics and generative experiments belong here even when they are intentionally unfinished.'},
  {kicker:'SEPARATION',title:'Games live in Arcade',body:'Playable games are promoted to Aizanoi Arcade; Labs remains the place for prototypes and technical experiments.',button:'games',buttonLabel:'Open Arcade'}
]));}

export async function mount({container,appId,api}){
  if(appId==='journal')mountJournal(container);
  else if(appId==='labs')mountLabs(container);
  else container.innerHTML=shell('Aizanoi Analytics','Digital studio','<div class="az-empty-state"><div><h3>Unknown hub</h3></div></div>');
  const click=(event)=>{const id=event.target.closest('[data-open-app]')?.dataset.openApp;if(id)api.openApp(id);};
  container.addEventListener('click',click);
  return()=>container.removeEventListener('click',click);
}
