import { appById, worldById } from './registry.js';

const PINNED=Object.freeze(['news','videos','analytics','worlds','forge']);
const DESKTOP=Object.freeze(['news','videos','analytics','worlds','forge']);
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]));

function appButton(id,className='az-desktop-shortcut'){
  const app=appById(id);if(!app)return '';
  return `<button class="${className}" type="button" data-app="${esc(app.id)}" aria-label="Open ${esc(app.label)}"><span class="az-desktop-icon"><img src="${esc(app.icon)}" alt=""></span><span class="az-desktop-label">${esc(app.short||app.label)}</span></button>`;
}
function dockButton(id){
  const app=appById(id);if(!app)return '';
  return `<button class="az-shelf-button az-shelf-app" type="button" data-app="${esc(app.id)}" data-dock-app="${esc(app.id)}" aria-label="Open ${esc(app.label)}"><img src="${esc(app.icon)}" alt=""><span class="az-dock-tooltip">${esc(app.short||app.label)}</span></button>`;
}
function runningButton(id){
  const app=appById(id);if(!app)return '';
  return `<button class="az-shelf-button is-open" type="button" data-app="${esc(app.id)}" data-brand-running-app="${esc(app.id)}" aria-label="${esc(app.label)}, open"><img src="${esc(app.icon)}" alt=""><span class="az-dock-tooltip">${esc(app.short||app.label)}</span></button>`;
}

function rewriteDesktop(api){
  const desktop=document.querySelector('.az-desktop');if(!desktop)return;
  const signature=desktop.querySelector('.az-desktop-signature');
  if(signature)signature.innerHTML='<strong>AizanoiOS</strong><span>Media · data · software · worlds</span>';
  const shortcuts=desktop.querySelector('.az-desktop-shortcuts');
  if(shortcuts){shortcuts.setAttribute('aria-label','Aizanoi shortcuts');shortcuts.innerHTML=DESKTOP.map((id)=>appButton(id)).join('');}
  const widget=desktop.querySelector('.az-session-widget');if(!widget)return;
  const session=api.store.getFieldSession();
  if(session){
    const world=worldById(session.worldId);
    widget.setAttribute('aria-label','Continue exploring');
    widget.innerHTML=`<div class="az-session-orb" aria-hidden="true"></div><div class="az-session-copy"><span class="az-eyebrow">CONTINUE EXPLORING</span><h1>Return to ${esc(world?.label||'Historical Worlds')}</h1><p>${session.landmark?`Resume near ${esc(session.landmark)}.`:'Your last Historical World session is still available on this device.'}</p><div class="az-session-actions"><button class="az-button az-button-primary" type="button" data-home-action="continue-world">Continue</button><button class="az-button" type="button" data-app="news">Aizanoi News</button></div></div>`;
  }else{
    widget.setAttribute('aria-label','Today at Aizanoi');
    widget.innerHTML='<div class="az-session-orb" aria-hidden="true"></div><div class="az-session-copy"><span class="az-eyebrow">TODAY AT AIZANOI</span><h1>One studio. Many things worth exploring.</h1><p>Follow the latest briefing, watch Aizanoi TV, launch analytical tools or step into a Historical World.</p><div class="az-session-actions"><button class="az-button az-button-primary" type="button" data-app="news">Open News</button><button class="az-button" type="button" data-app="videos">Aizanoi TV</button></div></div>';
  }
}

function syncDock(api){
  const state=api.store.getState();
  for(const id of PINNED){
    const button=document.querySelector(`[data-dock-app="${id}"]`);
    button?.classList.toggle('is-open',state.openApps.includes(id));
    button?.classList.toggle('is-active',state.activeApp===id);
    document.querySelector(`[data-running-apps] [data-task-app="${id}"]`)?.remove();
  }

  const running=document.querySelector('[data-running-apps]');
  if(!running)return;
  running.querySelectorAll('[data-brand-running-app]').forEach((button)=>{
    const id=button.dataset.brandRunningApp;
    if(!state.openApps.includes(id)||PINNED.includes(id)||running.querySelector(`[data-task-app="${id}"]`))button.remove();
    else button.classList.toggle('is-active',state.activeApp===id);
  });
  for(const id of state.openApps){
    if(PINNED.includes(id))continue;
    if(running.querySelector(`[data-task-app="${id}"]`)||running.querySelector(`[data-brand-running-app="${id}"]`))continue;
    running.insertAdjacentHTML('beforeend',runningButton(id));
    const button=running.querySelector(`[data-brand-running-app="${id}"]`);
    button?.classList.toggle('is-active',state.activeApp===id);
  }
}

function rewriteDock(api){
  const pinned=document.querySelector('.az-shelf-pinned');if(!pinned)return;
  pinned.innerHTML=PINNED.map(dockButton).join('');
  syncDock(api);
  const running=document.querySelector('[data-running-apps]');
  if(running)new MutationObserver(()=>queueMicrotask(()=>syncDock(api))).observe(running,{childList:true,subtree:true});
}

function filterLauncher(){
  const host=document.querySelector('[data-switcher-list]');if(!host)return;
  host.querySelectorAll('.az-launchpad-item[data-app]').forEach((item)=>{
    const app=appById(item.dataset.app);
    if(app?.launcher===false)item.hidden=true;
  });
  const appHeading=[...host.querySelectorAll('.az-launchpad-group h3')].find((node)=>node.textContent==='Applications');
  if(appHeading)appHeading.textContent='Aizanoi';
}
function watchLauncher(){
  const host=document.querySelector('[data-switcher-list]');if(!host)return;
  new MutationObserver(()=>queueMicrotask(filterLauncher)).observe(host,{childList:true,subtree:true});
  host.addEventListener('input',()=>setTimeout(filterLauncher,0),true);
}

export function installBrandPlatform(api){
  rewriteDesktop(api);
  rewriteDock(api);
  watchLauncher();
  api.store.subscribe(()=>syncDock(api));
  document.documentElement.dataset.azProduct='aizanoi-platform';
}
