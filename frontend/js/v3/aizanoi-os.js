import { APPS, WORLDS, appById, worldById } from './registry.js';

const PINNED_APPS = Object.freeze(['worlds','archive','notes','data-lab','source-reader','projects']);
const DESKTOP_APPS = Object.freeze(['archive','notes']);

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
      body:session.landmark ? `Resume near ${session.landmark}.` : `Resume your most recent ${world?.label || 'world'} exploration.`,
      action:'continue-world', button:'Continue'
    };
  }
  return {label:'Suggested journey',title:'Walk Aizanoi',body:'Begin with the reconstructed city and keep your evidence nearby.',action:'walk-aizanoi',button:'Explore Aizanoi'};
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
  const shortcuts=`${WORLDS.map((world)=>worldShortcut(world.id)).join('')}${DESKTOP_APPS.map(appShortcut).join('')}`;
  host.innerHTML=`<main class="az-desktop" aria-label="AizanoiOS desktop"><div class="az-desktop-signature" aria-hidden="true"><strong>AizanoiOS</strong><span>Digital archaeology desktop</span></div><section class="az-desktop-shortcuts" aria-label="Desktop shortcuts">${shortcuts}</section><section class="az-session-widget" aria-label="${escapeHtml(item.label)}"><div class="az-session-orb" aria-hidden="true"></div><div class="az-session-copy"><span class="az-eyebrow">${escapeHtml(item.label)}</span><h1>${escapeHtml(item.title)}</h1><p>${escapeHtml(item.body)}</p><div class="az-session-actions"><button class="az-button az-button-primary" type="button" data-home-action="${escapeHtml(item.action)}">${escapeHtml(item.button)}</button><button class="az-button" type="button" data-app="archive">Archive</button></div></div></section></main>`;
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
    menu.innerHTML='<button type="button" data-shell-action="home">Desktop</button><button type="button" data-app="worlds">Worlds</button><button type="button" data-app="archive">Archive</button><button type="button" data-app="notes">Notes</button><button type="button" data-shell-action="switcher">Applications</button>';
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
  dock.addEventListener('click',(event)=>{
    const button=event.target.closest('.az-shelf-button');
    if(!button)return;

    // Opening a modal makes the dock inert. Finish the physical click first,
    // then route the same Applications command through the stable top-bar
    // representative so shell.js can own focus trapping/inert/restore normally.
    if(button.dataset.shellAction==='switcher') {
      event.preventDefault();
      event.stopPropagation();
      setTimeout(()=>document.querySelector('.az-system-menu [data-shell-action="switcher"]')?.click(),0);
      return;
    }

    if(store.getState().reduceMotion)return;
    button.classList.remove('is-launching');
    requestAnimationFrame(()=>button.classList.add('is-launching'));
    setTimeout(()=>button.classList.remove('is-launching'),430);
  },true);
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
  const reset=()=>dock.querySelectorAll('.az-shelf-button').forEach((button)=>{button.style.removeProperty('--az-dock-scale');button.style.removeProperty('--az-dock-lift');});
  dock.addEventListener('pointermove',(event)=>{
    if(store.getState().reduceMotion){reset();return;}
    for(const button of dock.querySelectorAll('.az-shelf-button')){
      const rect=button.getBoundingClientRect();
      const distance=Math.abs(event.clientX-(rect.left+rect.width/2));
      const influence=Math.max(0,1-distance/185);
      const eased=Math.sin(influence*Math.PI/2);
      button.style.setProperty('--az-dock-scale',String(1+eased*.52));
      button.style.setProperty('--az-dock-lift',`${Math.round(eased*15)}px`);
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
  const worlds=WORLDS.map((world)=>`<button class="az-launchpad-item az-launchpad-world" type="button" data-world="${escapeHtml(world.id)}" data-launch-label="${escapeHtml(`${world.label} ${world.era}`.toLowerCase())}"><span class="az-launchpad-icon" data-accent="${escapeHtml(world.accent || 'blue')}"><img src="/assets/icons/ancient-world.svg" alt=""></span><strong>${escapeHtml(world.label)}</strong><small>${escapeHtml(world.era)}</small></button>`).join('');
  const apps=APPS.map((app)=>`<button class="az-launchpad-item" type="button" data-app="${escapeHtml(app.id)}" data-launch-label="${escapeHtml(`${app.label} ${app.description}`.toLowerCase())}"><span class="az-launchpad-icon"><img src="${escapeHtml(app.icon)}" alt=""></span><strong>${escapeHtml(app.label)}</strong><small>${escapeHtml(app.description)}</small></button>`).join('');
  host.innerHTML=`<div class="az-launchpad-search"><span aria-hidden="true">${icons.search}</span><input type="search" data-launcher-search autocomplete="off" spellcheck="false" placeholder="Search applications and worlds" aria-label="Search applications and worlds"></div><section class="az-launchpad-group"><h3>Historical Worlds</h3><div class="az-launchpad-grid az-launchpad-worlds">${worlds}</div></section><section class="az-launchpad-group"><h3>Applications</h3><div class="az-launchpad-grid">${apps}</div></section>`;
  const input=host.querySelector('[data-launcher-search]');
  input?.addEventListener('input',()=>{
    const query=input.value.trim().toLowerCase();
    host.querySelectorAll('.az-launchpad-item').forEach((item)=>item.toggleAttribute('hidden',Boolean(query)&&!item.dataset.launchLabel.includes(query)));
  });
  setTimeout(()=>input?.focus(),0);
}

function installDesktopContextMenu(api) {
  if(matchMedia('(pointer:coarse)').matches)return;
  const desktop=document.querySelector('.az-desktop');
  const shell=document.querySelector('.az-shell');
  if(!desktop || !shell)return;
  const menu=document.createElement('div');
  menu.className='az-desktop-context';
  menu.setAttribute('role','menu');
  menu.setAttribute('aria-hidden','true');
  menu.innerHTML='<button type="button" role="menuitem" data-context-action="apps">Applications</button><button type="button" role="menuitem" data-context-action="search">Search</button><div class="az-context-divider" aria-hidden="true"></div><button type="button" role="menuitem" data-context-action="note">New field note</button><button type="button" role="menuitem" data-context-action="archive">Open Archive</button><button type="button" role="menuitem" data-context-action="aizanoi">Explore Aizanoi</button>';
  shell.appendChild(menu);
  const hide=()=>{menu.classList.remove('is-open');menu.setAttribute('aria-hidden','true');};
  desktop.addEventListener('contextmenu',(event)=>{
    if(event.target.closest('button'))return;
    event.preventDefault();
    const width=220, height=235;
    menu.style.left=`${Math.max(10,Math.min(event.clientX,innerWidth-width-10))}px`;
    menu.style.top=`${Math.max(42,Math.min(event.clientY,innerHeight-height-88))}px`;
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden','false');
    menu.querySelector('button')?.focus();
  });
  menu.addEventListener('click',(event)=>{
    const action=event.target.closest('[data-context-action]')?.dataset.contextAction;
    if(!action)return;
    hide();
    if(action==='apps') document.querySelector('[data-shell-action="switcher"]')?.click();
    if(action==='search') document.querySelector('[data-shell-action="search"]')?.click();
    if(action==='note') api.openApp('notes',{newNote:true});
    if(action==='archive') api.openApp('archive');
    if(action==='aizanoi') api.launchWorld('aizanoi');
  });
  document.addEventListener('pointerdown',(event)=>{if(!menu.contains(event.target))hide();},true);
  document.addEventListener('keydown',(event)=>{if(event.key==='Escape')hide();},true);
}

function observeShell(store) {
  const running=document.querySelector('[data-running-apps]');
  if(running)new MutationObserver(()=>queueMicrotask(()=>syncPinned(store))).observe(running,{childList:true,subtree:true});
  const switcher=document.getElementById('az-switcher-overlay');
  if(switcher)new MutationObserver(()=>{if(switcher.classList.contains('is-open'))queueMicrotask(renderLauncher);}).observe(switcher,{attributes:true,attributeFilter:['class']});
}

export function installAizanoiOS(api) {
  const switcher=document.getElementById('az-switcher-overlay');
  switcher?.classList.add('az-launchpad-overlay');
  switcher?.querySelector('.az-dialog')?.classList.add('az-launchpad');
  switcher?.addEventListener('click',(event)=>{
    if(event.target.closest('.az-launchpad-item')) switcher.querySelector('[data-overlay-close]')?.click();
  },true);
  rewriteTopBar();
  renderDesktop(api.store);
  rewriteDock(api.store);
  wireDockMagnification(api.store);
  installDesktopContextMenu(api);
  observeShell(api.store);
  document.documentElement.dataset.azShell='aizanoi-os';
}
