import { APPS, WORLDS, appById, worldById } from './registry.js';

const PINNED_APPS = Object.freeze(['worlds','archive','notes','data-lab','projects']);

const icons = Object.freeze({
  home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m3.5 10.5 8.5-7 8.5 7v9H15v-6H9v6H3.5Z"/></svg>',
  search:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="m20 20-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"/></svg>',
  grid:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/></svg>'
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function mission(store) {
  const session=store.getFieldSession();
  if (session) {
    const world=worldById(session.worldId);
    return {
      label:'Continue field session',
      title:`Return to ${world?.label || 'Historical World'}`,
      body:session.landmark ? `Resume near ${session.landmark}. Your local context is still on this device.` : `Resume your most recent ${world?.label || 'world'} exploration.`,
      action:'continue-world', button:'Continue'
    };
  }
  return {label:'Suggested first journey',title:'Walk Aizanoi',body:'Open the reconstructed city, then return to your Archive and Notes without leaving the desktop.',action:'walk-aizanoi',button:'Explore Aizanoi'};
}

function appShortcut(id) {
  const app=appById(id); if(!app)return '';
  return `<button class="az-desktop-shortcut" type="button" data-app="${escapeHtml(app.id)}" aria-label="Open ${escapeHtml(app.label)}"><span class="az-desktop-icon"><img src="${escapeHtml(app.icon)}" alt=""></span><span class="az-desktop-label">${escapeHtml(app.short || app.label)}</span></button>`;
}

function worldShortcut(id) {
  const world=worldById(id); if(!world)return '';
  return `<button class="az-desktop-shortcut az-world-shortcut" type="button" data-world="${escapeHtml(world.id)}" aria-label="Explore ${escapeHtml(world.label)}"><span class="az-desktop-icon" data-accent="${escapeHtml(world.accent || 'blue')}"><img src="/assets/icons/ancient-world.svg" alt=""></span><span class="az-desktop-label">${escapeHtml(world.label)}</span></button>`;
}

function renderDesktop(store) {
  const host=document.querySelector('.az-home-scroll'); if(!host)return;
  const item=mission(store);
  host.innerHTML=`<main class="az-desktop" aria-label="AizanoiOS desktop"><section class="az-desktop-shortcuts" aria-label="Desktop shortcuts">${['worlds','archive','notes','data-lab','source-reader','projects'].map(appShortcut).join('')}${['aizanoi','rome','athens'].map(worldShortcut).join('')}</section><section class="az-session-widget" aria-label="${escapeHtml(item.label)}"><div class="az-session-orb" aria-hidden="true"></div><div class="az-session-copy"><span class="az-eyebrow">${escapeHtml(item.label)}</span><h1>${escapeHtml(item.title)}</h1><p>${escapeHtml(item.body)}</p><div class="az-session-actions"><button class="az-button az-button-primary" type="button" data-home-action="${escapeHtml(item.action)}">${escapeHtml(item.button)}</button><button class="az-button" type="button" data-app="archive">Open Archive</button></div></div></section><div class="az-desktop-signature" aria-hidden="true"><strong>AizanoiOS</strong><span>history, research, worlds</span></div></main>`;
}

function rewriteTopBar() {
  const bar=document.querySelector('.az-system-bar');
  const brand=bar?.querySelector('.az-brand-button');
  if(!bar || !brand)return;
  brand.innerHTML='<img src="/assets/branding/aizanoi-logo-mark.svg" alt=""><strong>AizanoiOS</strong>';
  brand.setAttribute('aria-label','AizanoiOS desktop');
  if(!bar.querySelector('.az-system-menu')) {
    const menu=document.createElement('nav');
    menu.className='az-system-menu';
    menu.setAttribute('aria-label','AizanoiOS menu');
    menu.innerHTML='<button type="button" data-shell-action="home">Desktop</button><button type="button" data-app="worlds">Explore</button><button type="button" data-app="archive">Archive</button><button type="button" data-shell-action="switcher">Apps</button>';
    brand.after(menu);
  }
  bar.querySelectorAll('.az-system-label').forEach((node)=>node.remove());
}

function dockApp(id) {
  const app=appById(id); if(!app)return '';
  return `<button class="az-shelf-button az-shelf-app" type="button" data-app="${escapeHtml(app.id)}" data-dock-app="${escapeHtml(app.id)}" aria-label="Open ${escapeHtml(app.label)}"><img src="${escapeHtml(app.icon)}" alt=""><span class="az-dock-tooltip">${escapeHtml(app.short || app.label)}</span></button>`;
}

function rewriteDock(store) {
  const dock=document.querySelector('.az-task-shelf'); if(!dock)return;
  dock.innerHTML=`<button class="az-shelf-button" type="button" data-shell-action="home" aria-label="Show desktop">${icons.home}<span class="az-dock-tooltip">Desktop</span></button><button class="az-shelf-button" type="button" data-shell-action="search" aria-label="Search and commands">${icons.search}<span class="az-dock-tooltip">Search</span></button><div class="az-shelf-divider" aria-hidden="true"></div><div class="az-shelf-pinned">${PINNED_APPS.map(dockApp).join('')}</div><div class="az-shelf-running" data-running-apps></div><div class="az-shelf-divider" aria-hidden="true"></div><button class="az-shelf-button" type="button" data-shell-action="switcher" aria-label="Applications">${icons.grid}<span class="az-dock-tooltip">Applications</span></button>`;
  syncPinned(store);
}

function syncPinned(store) {
  const state=store.getState();
  document.querySelectorAll('[data-dock-app]').forEach((button)=>{
    const id=button.dataset.dockApp;
    button.classList.toggle('is-open',state.openApps.includes(id));
    button.classList.toggle('is-active',state.activeApp===id);
  });
  for(const id of PINNED_APPS) document.querySelector(`[data-running-apps] [data-task-app="${id}"]`)?.remove();
}

function wireDockMagnification(store) {
  const dock=document.querySelector('.az-task-shelf');
  if(!dock || matchMedia('(pointer:coarse)').matches)return;
  const reset=()=>dock.querySelectorAll('.az-shelf-button').forEach((button)=>{button.style.removeProperty('--dock-scale');button.style.removeProperty('--dock-lift');});
  dock.addEventListener('pointermove',(event)=>{
    if(store.getState().reduceMotion){reset();return;}
    for(const button of dock.querySelectorAll('.az-shelf-button')){
      const rect=button.getBoundingClientRect();
      const influence=Math.max(0,1-Math.abs(event.clientX-(rect.left+rect.width/2))/150);
      button.style.setProperty('--dock-scale',String(1+influence*.38));
      button.style.setProperty('--dock-lift',`${Math.round(influence*10)}px`);
    }
  });
  dock.addEventListener('pointerleave',reset);
}

function renderLauncher() {
  const overlay=document.getElementById('az-switcher-overlay');
  overlay?.classList.add('az-launchpad-overlay');
  overlay?.querySelector('.az-dialog')?.classList.add('az-launchpad');
  const title=document.getElementById('az-switcher-title'); if(title)title.textContent='Applications';
  const host=document.querySelector('[data-switcher-list]'); if(!host)return;
  const worlds=WORLDS.map((world)=>`<button class="az-launchpad-item az-launchpad-world" type="button" data-world="${escapeHtml(world.id)}"><span class="az-launchpad-icon" data-accent="${escapeHtml(world.accent || 'blue')}"><img src="/assets/icons/ancient-world.svg" alt=""></span><strong>${escapeHtml(world.label)}</strong><small>${escapeHtml(world.era)}</small></button>`).join('');
  const apps=APPS.map((app)=>`<button class="az-launchpad-item" type="button" data-app="${escapeHtml(app.id)}"><span class="az-launchpad-icon"><img src="${escapeHtml(app.icon)}" alt=""></span><strong>${escapeHtml(app.label)}</strong><small>${escapeHtml(app.description)}</small></button>`).join('');
  host.innerHTML=`<section class="az-launchpad-group"><h3>Historical Worlds</h3><div class="az-launchpad-grid az-launchpad-worlds">${worlds}</div></section><section class="az-launchpad-group"><h3>Applications</h3><div class="az-launchpad-grid">${apps}</div></section>`;
}

function observeShell(store) {
  const running=document.querySelector('[data-running-apps]');
  if(running)new MutationObserver(()=>queueMicrotask(()=>syncPinned(store))).observe(running,{childList:true,subtree:true});
  const switcher=document.getElementById('az-switcher-overlay');
  if(switcher)new MutationObserver(()=>{if(switcher.classList.contains('is-open'))queueMicrotask(renderLauncher);}).observe(switcher,{attributes:true,attributeFilter:['class']});
}

export function installAizanoiOS(api) {
  document.getElementById('az-switcher-overlay')?.classList.add('az-launchpad-overlay');
  document.querySelector('#az-switcher-overlay .az-dialog')?.classList.add('az-launchpad');
  rewriteTopBar();
  renderDesktop(api.store);
  rewriteDock(api.store);
  wireDockMagnification(api.store);
  observeShell(api.store);
  document.documentElement.dataset.azShell='aizanoi-os';
}
