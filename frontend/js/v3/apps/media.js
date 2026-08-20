const ITEMS=[
  {title:'Walk Aizanoi',type:'FIELD WALKTHROUGH',body:'Start inside the reconstruction, inspect evidence boundaries and use the Field Archive as the companion research layer.',action:'aizanoi',label:'Enter Aizanoi'},
  {title:'How the reconstructions are built',type:'METHOD',body:'The project separates documented, archaeological, inferred and atmospheric decisions instead of presenting every polygon as equal certainty.',action:'worlds',label:'Open world index'},
  {title:'Research workspace',type:'WORKFLOW',body:'Import a source, annotate your observation in Field Notes and keep datasets or visual records local to the browser.',action:'archive',label:'Open Field Archive'}
];
const esc=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mount({container,api}){
  container.innerHTML=`<div class="az-app-shell"><div class="az-app-toolbar"><strong>Aizanoi TV</strong><span class="az-system-spacer"></span><span class="az-app-caption">Walkthroughs & field stories</span></div><div class="az-media"><div class="az-simple-grid">${ITEMS.map((item)=>`<article class="az-simple-card"><p class="az-kicker">${esc(item.type)}</p><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p><button class="az-button" type="button" data-media-action="${esc(item.action)}">${esc(item.label)}</button></article>`).join('')}</div><div class="az-simple-card az-project-session"><h3>Video layer</h3><p>External video embeds are intentionally not loaded on app open. A future curated walkthrough can use privacy-enhanced embeds with transcript, chapters and linked landmarks.</p></div></div></div>`;
  const click=(event)=>{const action=event.target.closest('[data-media-action]')?.dataset.mediaAction;if(!action)return;if(action==='aizanoi')api.launchWorld('aizanoi');else api.openApp(action);};container.addEventListener('click',click);return()=>container.removeEventListener('click',click);
}
