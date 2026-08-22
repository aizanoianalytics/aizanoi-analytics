import { APPS, appById, worldById } from './registry.js';

const PINNED=Object.freeze(['news','videos','analytics','worlds','forge']);
const DESKTOP=PINNED;
const PUBLIC_APPS=Object.freeze(APPS.map((app)=>app.id));
const PHONE_DOCK=Object.freeze(['news','videos','analytics','worlds']);
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function appButton(id,className='az-desktop-shortcut'){
  const app=appById(id);if(!app)return '';
  return `<button class="${className}" type="button" data-app="${esc(app.id)}" aria-label="Open ${esc(app.label)}"><span class="az-desktop-icon"><img src="${esc(app.icon)}" alt=""></span><span class="az-desktop-label">${esc(app.short||app.label)}</span></button>`;
}
function deviceAppButton(id,className){
  const app=appById(id);if(!app)return '';
  return `<button class="az-device-app ${className}" type="button" data-app="${esc(app.id)}" aria-label="Open ${esc(app.label)}"><span class="az-device-app-icon"><img src="${esc(app.icon)}" alt=""></span><span class="az-device-app-label">${esc(app.short||app.label)}</span></button>`;
}
function dockButton(id){
  const app=appById(id);if(!app)return '';
  return `<button class="az-shelf-button az-shelf-app" type="button" data-app="${esc(app.id)}" data-dock-app="${esc(app.id)}" aria-label="Open ${esc(app.label)}"><img src="${esc(app.icon)}" alt=""><span class="az-dock-tooltip">${esc(app.short||app.label)}</span></button>`;
}
function runningButton(id){
  const app=appById(id);if(!app)return '';
  return `<button class="az-shelf-button is-open" type="button" data-app="${esc(app.id)}" data-brand-running-app="${esc(app.id)}" aria-label="${esc(app.label)}, open"><img src="${esc(app.icon)}" alt=""><span class="az-dock-tooltip">${esc(app.short||app.label)}</span></button>`;
}
function dateParts(){
  const now=new Date();
  return {
    iso:now.toISOString(),
    short:now.toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'}),
    full:now.toLocaleDateString([], {weekday:'long',year:'numeric',month:'long',day:'numeric'})
  };
}
function sessionCard(api,compact=false){
  const session=api.store.getFieldSession();
  if(session){
    const world=worldById(session.worldId);
    return `<article class="${compact?'az-phone-widget':'az-tablet-widget'} az-device-session">
      <div><span class="az-device-kicker">CONTINUE EXPLORING</span><h2>${esc(world?.label||'Historical Worlds')}</h2><p>${session.landmark?`Resume near ${esc(session.landmark)}.`:'Your latest Historical World session is available on this device.'}</p></div>
      <button class="az-device-widget-action" type="button" data-home-action="continue-world">Continue</button>
    </article>`;
  }
  return `<article class="${compact?'az-phone-widget':'az-tablet-widget'} az-device-session">
    <div><span class="az-device-kicker">HISTORICAL WORLDS</span><h2>Walk through the past</h2><p>Explore Aizanoi, late-antique Rome and classical Athens with evidence levels kept visible.</p></div>
    <button class="az-device-widget-action" type="button" data-app="worlds">Explore</button>
  </article>`;
}

function renderPhoneHome(api){
  const date=dateParts();
  return `<section class="az-phone-home" aria-label="Aizanoi mobile home">
    <header class="az-phone-home-header">
      <div>
        <time class="az-device-date" datetime="${esc(date.iso)}">${esc(date.short)}</time>
        <h1>Aizanoi</h1>
        <p>Media · data · software · worlds</p>
      </div>
      <button class="az-phone-search" type="button" data-shell-action="search" aria-label="Search Aizanoi">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="m20 20-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"/></svg>
      </button>
    </header>
    <div class="az-phone-widgets">
      <article class="az-phone-widget az-phone-news-widget">
        <div><span class="az-device-kicker">AIZANOI NEWS</span><h2>Briefings with sources</h2><p>Technology, markets, world, sports and culture in one place.</p></div>
        <button class="az-device-widget-action" type="button" data-app="news">Read</button>
      </article>
      ${sessionCard(api,true)}
    </div>
    <section class="az-phone-apps" aria-label="Aizanoi apps">
      ${PUBLIC_APPS.map((id)=>deviceAppButton(id,'az-phone-app')).join('')}
    </section>
  </section>`;
}

function renderTabletHome(api){
  const date=dateParts();
  return `<section class="az-tablet-home" aria-label="Aizanoi tablet home">
    <aside class="az-tablet-rail">
      <div class="az-tablet-brand-card">
        <time class="az-device-date" datetime="${esc(date.iso)}">${esc(date.full)}</time>
        <img src="/assets/branding/aizanoi-logo-mark.svg" alt="">
        <h1>Aizanoi</h1>
        <p>Everything we publish, build and explore.</p>
        <div class="az-tablet-quick-actions">
          <button class="az-button az-button-primary" type="button" data-app="news">Open News</button>
          <button class="az-button" type="button" data-shell-action="search">Search</button>
        </div>
      </div>
      ${sessionCard(api,false)}
    </aside>
    <main class="az-tablet-main">
      <header class="az-tablet-section-head">
        <div><span class="az-device-kicker">AIZANOIOS</span><h2>Your apps</h2><p>Focused tools and public experiences, arranged for a larger touch screen.</p></div>
        <button class="az-tablet-apps-button" type="button" data-shell-action="switcher" data-os-launcher aria-label="Open Applications">All apps</button>
      </header>
      <section class="az-tablet-app-grid" aria-label="Aizanoi applications">
        ${PUBLIC_APPS.map((id)=>deviceAppButton(id,'az-tablet-app')).join('')}
      </section>
      <section class="az-tablet-feature-grid" aria-label="Aizanoi highlights">
        <article class="az-tablet-feature az-tablet-feature-news">
          <span class="az-device-kicker">READ</span><h3>Aizanoi Journal</h3><p>Long-form analysis, commentary and research beyond the daily briefing.</p>
          <button type="button" data-app="journal">Open Journal</button>
        </article>
        <article class="az-tablet-feature az-tablet-feature-labs">
          <span class="az-device-kicker">BUILD</span><h3>Forge & Labs</h3><p>Open projects, prototypes and experiments live alongside the finished products.</p>
          <div><button type="button" data-app="forge">Forge</button><button type="button" data-app="labs">Labs</button></div>
        </article>
      </section>
    </main>
  </section>`;
}

function rewriteDesktop(api){
  const desktop=document.querySelector('.az-desktop');if(!desktop)return;
  const session=api.store.getFieldSession();
  const world=session?worldById(session.worldId):null;
  const desktopWidget=session
    ? `<div class="az-session-orb" aria-hidden="true"></div><div class="az-session-copy"><span class="az-eyebrow">CONTINUE EXPLORING</span><h1>Return to ${esc(world?.label||'Historical Worlds')}</h1><p>${session.landmark?`Resume near ${esc(session.landmark)}.`:'Your last Historical World session is still available on this device.'}</p><div class="az-session-actions"><button class="az-button az-button-primary" type="button" data-home-action="continue-world">Continue</button><button class="az-button" type="button" data-app="news">Aizanoi News</button></div></div>`
    : '<div class="az-session-orb" aria-hidden="true"></div><div class="az-session-copy"><span class="az-eyebrow">TODAY AT AIZANOI</span><h1>One studio. Many things worth exploring.</h1><p>Follow the latest briefing, watch Aizanoi TV, launch analytical tools or step into a Historical World.</p><div class="az-session-actions"><button class="az-button az-button-primary" type="button" data-app="news">Open News</button><button class="az-button" type="button" data-app="videos">Aizanoi TV</button></div></div>';
  desktop.innerHTML=`<div class="az-desktop-signature" aria-hidden="true"><strong>AizanoiOS</strong><span>Media · data · software · worlds</span></div>
    <section class="az-desktop-shortcuts" aria-label="Aizanoi shortcuts">${DESKTOP.map((id)=>appButton(id)).join('')}</section>
    <section class="az-session-widget" aria-label="${session?'Continue exploring':'Today at Aizanoi'}">${desktopWidget}</section>
    ${renderPhoneHome(api)}
    ${renderTabletHome(api)}`;
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
    running.querySelector(`[data-brand-running-app="${id}"]`)?.classList.toggle('is-active',state.activeApp===id);
  }
}
function rewriteDock(api){
  const pinned=document.querySelector('.az-shelf-pinned');if(!pinned)return;
  pinned.innerHTML=PINNED.map(dockButton).join('');
  pinned.dataset.phoneDock=PHONE_DOCK.join(',');
  syncDock(api);
  const running=document.querySelector('[data-running-apps]');
  if(running)new MutationObserver(()=>queueMicrotask(()=>syncDock(api))).observe(running,{childList:true,subtree:true});
}
function renameLauncher(){
  const host=document.querySelector('[data-switcher-list]');if(!host)return;
  const appHeading=[...host.querySelectorAll('.az-launchpad-group h3')].find((node)=>node.textContent==='Applications');
  if(appHeading)appHeading.textContent='Aizanoi apps';
}
function watchLauncher(){
  const host=document.querySelector('[data-switcher-list]');if(!host)return;
  new MutationObserver(()=>queueMicrotask(renameLauncher)).observe(host,{childList:true,subtree:true});
}
function rewriteDesktopContextMenu(api){
  const menu=document.querySelector('.az-desktop-context');if(!menu)return;
  menu.innerHTML='<button type="button" role="menuitem" data-context-action="apps">Applications</button><button type="button" role="menuitem" data-context-action="search">Search</button><div class="az-context-divider" aria-hidden="true"></div><button type="button" role="menuitem" data-context-action="news">Aizanoi News</button><button type="button" role="menuitem" data-context-action="analytics">Aizanoi Analytics</button><button type="button" role="menuitem" data-context-action="aizanoi">Explore Aizanoi</button>';
  menu.addEventListener('click',(event)=>{
    const action=event.target.closest('[data-context-action]')?.dataset.contextAction;
    if(!['news','analytics'].includes(action))return;
    event.preventDefault();event.stopPropagation();
    menu.classList.remove('is-open');menu.setAttribute('aria-hidden','true');
    api.openApp(action);
  },true);
}
function updateDeviceDates(){
  const date=dateParts();
  document.querySelectorAll('.az-device-date').forEach((node)=>{
    node.dateTime=date.iso;
    node.textContent=node.closest('.az-tablet-home')?date.full:date.short;
  });
}

export function installBrandPlatform(api){
  rewriteDesktop(api);
  rewriteDock(api);
  rewriteDesktopContextMenu(api);
  watchLauncher();
  updateDeviceDates();
  setInterval(updateDeviceDates,60_000);
  api.store.subscribe(()=>syncDock(api));
  document.documentElement.dataset.azProduct='aizanoi-platform';
  document.documentElement.dataset.azDeviceShell='adaptive';
}
