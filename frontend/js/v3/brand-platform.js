import { APPS, appById } from './registry.js';

const PINNED=Object.freeze(['news','videos','analytics','worlds','forge']);
const DESKTOP=Object.freeze([...PINNED,'browser','notepad','calculator','camera','winamp','games','recycle-bin','workspace']);
const PUBLIC_APPS=Object.freeze(APPS.map((app)=>app.id));
const PHONE_DOCK=Object.freeze(['news','videos','analytics','worlds']);
const PLATFORM_STYLE_HREF='/styles/tool-windows.css';
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function ensurePlatformStyles(){
  if(document.querySelector('link[data-az-platform-polish]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=PLATFORM_STYLE_HREF;
  link.dataset.azPlatformPolish='true';
  document.head.appendChild(link);
}
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
    short:now.toLocaleDateString('en-GB', {weekday:'long',month:'long',day:'numeric'}),
    full:now.toLocaleDateString('en-GB', {weekday:'long',year:'numeric',month:'long',day:'numeric'})
  };
}

function renderPhoneHome(){
  const date=dateParts();
  return `<section class="az-phone-home" aria-label="Aizanoi Analytics mobile home">
    <header class="az-phone-home-header">
      <div>
        <time class="az-device-date" datetime="${esc(date.iso)}">${esc(date.short)}</time>
        <h1>Aizanoi Analytics</h1>
        <p>Media · analytics · software · worlds</p>
      </div>
      <button class="az-phone-search" type="button" data-shell-action="search" aria-label="Search Aizanoi Analytics">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="m20 20-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"/></svg>
      </button>
    </header>
    <div class="az-phone-widgets">
      <article class="az-phone-widget az-phone-news-widget">
        <div><span class="az-device-kicker">AIZANOI NEWS</span><h2>Briefings with sources</h2><p>AI, Technology, Economy / Markets and Football in one concise edition.</p></div>
        <button class="az-device-widget-action" type="button" data-app="news">Read</button>
      </article>
    </div>
    <section class="az-phone-apps" aria-label="Aizanoi Analytics apps">
      ${PUBLIC_APPS.map((id)=>deviceAppButton(id,'az-phone-app')).join('')}
    </section>
  </section>`;
}

function renderTabletHome(){
  const date=dateParts();
  return `<section class="az-tablet-home" aria-label="Aizanoi Analytics tablet home">
    <aside class="az-tablet-rail">
      <div class="az-tablet-brand-card">
        <time class="az-device-date" datetime="${esc(date.iso)}">${esc(date.full)}</time>
        <img src="/assets/branding/aizanoi-logo-mark.svg" alt="">
        <h1>Aizanoi Analytics</h1>
        <p>Everything we publish, build, analyze and explore.</p>
        <div class="az-tablet-quick-actions">
          <button class="az-button az-button-primary" type="button" data-app="news">Open News</button>
          <button class="az-button" type="button" data-shell-action="search">Search</button>
        </div>
      </div>
    </aside>
    <section class="az-tablet-main" aria-label="Aizanoi Analytics tablet applications">
      <header class="az-tablet-section-head">
        <div><span class="az-device-kicker">AIZANOIOS</span><h2>Your apps</h2><p>Focused products and public experiences, arranged for a larger touch screen.</p></div>
        <button class="az-tablet-apps-button" type="button" data-shell-action="switcher" data-os-launcher aria-label="Open Applications">All apps</button>
      </header>
      <section class="az-tablet-app-grid" aria-label="Aizanoi Analytics applications">
        ${PUBLIC_APPS.map((id)=>deviceAppButton(id,'az-tablet-app')).join('')}
      </section>
      <section class="az-tablet-feature-grid" aria-label="Aizanoi Analytics highlights">
        <article class="az-tablet-feature az-tablet-feature-news">
          <span class="az-device-kicker">READ</span><h3>Aizanoi Journal</h3><p>Long-form analysis, commentary and research beyond the daily briefing.</p>
          <button type="button" data-app="journal">Open Journal</button>
        </article>
        <article class="az-tablet-feature az-tablet-feature-labs">
          <span class="az-device-kicker">BUILD</span><h3>Forge & Labs</h3><p>Open projects, prototypes and experiments live alongside the finished products.</p>
          <div><button type="button" data-app="forge">Forge</button><button type="button" data-app="labs">Labs</button></div>
        </article>
      </section>
    </section>
  </section>`;
}

function rewriteDesktop(){
  const desktop=document.querySelector('.az-desktop');if(!desktop)return;
  desktop.innerHTML=`<div class="az-desktop-signature" aria-hidden="true"><strong>AizanoiOS</strong><span>Aizanoi Analytics · media · data · software · worlds</span></div>
    <section class="az-desktop-shortcuts" aria-label="Aizanoi Analytics shortcuts">${DESKTOP.map((id)=>appButton(id)).join('')}</section>
    ${renderPhoneHome()}
    ${renderTabletHome()}`;
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
  if(appHeading)appHeading.textContent='Aizanoi Analytics apps';
}
function watchLauncher(){
  const host=document.querySelector('[data-switcher-list]');if(!host)return;
  new MutationObserver(()=>queueMicrotask(renameLauncher)).observe(host,{childList:true,subtree:true});
}
function rewriteDesktopContextMenu(api){
  const menu=document.querySelector('.az-desktop-context');if(!menu)return;
  menu.innerHTML='<button type="button" role="menuitem" data-context-action="apps">Applications</button><button type="button" role="menuitem" data-context-action="search">Search</button><div class="az-context-divider" aria-hidden="true"></div><button type="button" role="menuitem" data-context-action="news">Aizanoi News</button><button type="button" role="menuitem" data-context-action="analytics">Analytics</button><button type="button" role="menuitem" data-context-action="aizanoi">Explore Aizanoi</button>';
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
  ensurePlatformStyles();
  rewriteDesktop();
  rewriteDock(api);
  rewriteDesktopContextMenu(api);
  watchLauncher();
  updateDeviceDates();
  setInterval(updateDeviceDates,60_000);
  api.store.subscribe(()=>syncDock(api));
  document.documentElement.dataset.azProduct='aizanoi-platform';
  document.documentElement.dataset.azDeviceShell='adaptive';
}
