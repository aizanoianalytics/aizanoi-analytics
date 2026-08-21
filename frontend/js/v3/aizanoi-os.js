import { APPS, WORLDS, appById, worldById } from './registry.js';

const PINNED_APPS = Object.freeze(['worlds','archive','notes','data-lab','source-reader','projects']);
const DESKTOP_APPS = Object.freeze(['archive','notes']);

const icons = Object.freeze({
  home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m3.5 10.5 8.5-7 8.5 7v9H15v-6H9v6H3.5Z"/></svg>',
  search:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="m20 20-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"/></svg>',
  grid:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/></svg>'
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]));
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

function activeAppLabel(store) {
  const id=store.getState().activeApp;
  return id ? (appById(id)?.short || appById(id)?.label || 'Workspace') : 'Desktop';
}

function syncTopBar(store) {
  const label=activeAppLabel(store);
  const node=document.querySelector('[data-active-app-title]');
  if(node)node.textContent=label;
  const button=document.querySelector('[data-os-switcher]');
  if(button)button.setAttribute('aria-label',`Open apps. Active: ${label}`);
}

function rewriteTopBar(store) {
  const bar=document.querySelector('.az-system-bar');
  const brand=bar?.querySelector('.az-brand-button');
  if(!bar || !brand)return;
  brand.innerHTML='<img src="/assets/branding/aizanoi-logo-mark.svg" alt=""><strong>AizanoiOS</strong>';
  brand.setAttribute('aria-label','AizanoiOS desktop');
  bar.querySelector('.az-system-menu')?.remove();
  const menu=document.createElement('nav');
  menu.className='az-system-menu';
  menu.setAttribute('aria-label','Active application');
  menu.innerHTML='<button type="button" data-shell-action="switcher" data-os-switcher><span aria-hidden="true">›</span><strong class="az-window-title" data-active-app-title>Desktop</strong></button>';
  brand.after(menu);
  bar.querySelector('.az-local-state')?.remove();
  bar.querySelectorAll('.az-system-label').forEach((node)=>node.remove());
  syncTopBar(store);
}

function dockApp(id) {
  const app=appById(id); if(!app)return '';
  return `<button class="az-shelf-button az-shelf-app" type="button" data-app="${escapeHtml(app.id)}" data-dock-app="${escapeHtml(app.id)}" aria-label="Open ${escapeHtml(app.label)}"><img src="${escapeHtml(app.icon)}" alt=""><span class="az-dock-tooltip">${escapeHtml(app.short || app.label)}</span></button>`;
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
  let frame=0;
  let lastX=0;
  let buttons=[];
  let centers=[];

  const measure=()=>{
    buttons=[...dock.querySelectorAll('.az-shelf-button')];
    centers=buttons.map((button)=>{
      const rect=button.getBoundingClientRect();
      return rect.left+rect.width/2;
    });
  };
  const reset=()=>{
    if(frame){cancelAnimationFrame(frame);frame=0;}
    dock.querySelectorAll('.az-shelf-button').forEach((button)=>{button.style.removeProperty('--az-dock-scale');button.style.removeProperty('--az-dock-lift');});
  };
  const update=()=>{
    frame=0;
    if(store.getState().reduceMotion){reset();return;}
    const current=[...dock.querySelectorAll('.az-shelf-button')];
    if(current.length!==buttons.length || current.some((button,index)=>button!==buttons[index]))measure();
    for(let index=0;index<buttons.length;index++){
      const distance=Math.abs(lastX-centers[index]);
      const influence=Math.max(0,1-distance/150);
      const eased=Math.sin(influence*Math.PI/2);
      buttons[index].style.setProperty('--az-dock-scale',String(1+eased*.48));
      buttons[index].style.setProperty('--az-dock-lift',`${Math.round(eased*14)}px`);
    }
  };

  dock.addEventListener('pointerenter',measure,{passive:true});
  dock.addEventListener('pointermove',(event)=>{
    lastX=event.clientX;
    if(!frame)frame=requestAnimationFrame(update);
  },{passive:true});
  dock.addEventListener('pointerleave',reset,{passive:true});
  new MutationObserver(()=>{centers=[];buttons=[];}).observe(dock,{childList:true,subtree:true});
  window.addEventListener('resize',()=>{centers=[];buttons=[];},{passive:true});
}

function launcherOverlay() {
  return document.getElementById('az-switcher-overlay');
}

function prepareSwitcherOverlay() {
  const overlay=launcherOverlay();
  overlay?.classList.remove('az-launchpad-overlay');
  overlay?.querySelector('.az-dialog')?.classList.remove('az-launchpad');
  const title=document.getElementById('az-switcher-title'); if(title)title.textContent='Open Apps';
  const close=overlay?.querySelector('[data-overlay-close]'); if(close)close.setAttribute('aria-label','Close open apps');
}

function renderLauncher() {
  const overlay=launcherOverlay();
  overlay?.classList.add('az-launchpad-overlay');
  overlay?.querySelector('.az-dialog')?.classList.add('az-launchpad');
  const title=document.getElementById('az-switcher-title'); if(title)title.textContent='Applications';
  const close=overlay?.querySelector('[data-overlay-close]'); if(close)close.setAttribute('aria-label','Close Applications');
  const host=document.querySelector('[data-switcher-list]'); if(!host)return;
  const worlds=WORLDS.map((world)=>`<button class="az-launchpad-item az-launchpad-world" type="button" data-world="${escapeHtml(world.id)}" data-launch-label="${escapeHtml(`${world.label} ${world.era}`.toLowerCase())}"><span class="az-launchpad-icon" data-accent="${escapeHtml(world.accent || 'blue')}"><img src="/assets/icons/ancient-world.svg" alt=""></span><strong>${escapeHtml(world.label)}</strong><small>${escapeHtml(world.era)}</small></button>`).join('');
  const apps=APPS.map((app)=>`<button class="az-launchpad-item" type="button" data-app="${escapeHtml(app.id)}" data-launch-label="${escapeHtml(`${app.label} ${app.description}`.toLowerCase())}"><span class="az-launchpad-icon"><img src="${escapeHtml(app.icon)}" alt=""></span><strong>${escapeHtml(app.label)}</strong><small>${escapeHtml(app.description)}</small></button>`).join('');
  host.innerHTML=`<div class="az-launchpad-search"><span aria-hidden="true">${icons.search}</span><input type="search" data-launcher-search autocomplete="off" spellcheck="false" placeholder="Search applications and worlds" aria-label="Search applications and worlds"></div><div class="az-command-empty az-launchpad-empty" data-launcher-empty role="status" aria-live="polite" hidden>No applications or worlds match your search.</div><section class="az-launchpad-group"><h3>Historical Worlds</h3><div class="az-launchpad-grid az-launchpad-worlds">${worlds}</div></section><section class="az-launchpad-group"><h3>Applications</h3><div class="az-launchpad-grid">${apps}</div></section>`;
  const input=host.querySelector('[data-launcher-search]');
  const empty=host.querySelector('[data-launcher-empty]');
  input?.addEventListener('input',()=>{
    const query=input.value.trim().toLowerCase();
    let visible=0;
    host.querySelectorAll('.az-launchpad-item').forEach((item)=>{
      const hidden=Boolean(query)&&!item.dataset.launchLabel.includes(query);
      item.toggleAttribute('hidden',hidden);
      if(!hidden)visible++;
    });
    if(empty){
      empty.hidden=visible!==0;
      empty.textContent=visible===0 ? `No applications or worlds match “${input.value.trim()}”.` : '';
    }
  });
}

function installLauncherLifecycle(api) {
  const overlay=launcherOverlay(); if(!overlay)return;

  const activateLauncher=()=>{
    setTimeout(()=>{
      renderLauncher();
      setTimeout(()=>overlay.querySelector('[data-launcher-search]')?.focus(),0);
    },0);
  };

  document.addEventListener('click',(event)=>{
    const switcher=event.target.closest('[data-shell-action="switcher"]');
    if(!switcher)return;
    prepareSwitcherOverlay();
    if(switcher.matches('[data-os-launcher]'))activateLauncher();
  },true);

  window.addEventListener('keydown',(event)=>{
    if(!(event.altKey && event.key==='Tab'))return;
    if(overlay.classList.contains('is-open') && overlay.classList.contains('az-launchpad-overlay')) {
      overlay.querySelector('[data-overlay-close]')?.click();
    }
    prepareSwitcherOverlay();
  },true);

  overlay.addEventListener('click',(event)=>{
    const item=event.target.closest('.az-launchpad-item');
    if(!item)return;
    event.preventDefault();
    event.stopPropagation();
    overlay.querySelector('[data-overlay-close]')?.click();
    if(item.dataset.app)api.openApp(item.dataset.app);
    else if(item.dataset.world)api.launchWorld(item.dataset.world);
  },true);
}

function motionEnabled(store) {
  return !store.getState().reduceMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function dockButtonForApp(appId) {
  return document.querySelector(`[data-dock-app="${appId}"]`) || document.querySelector(`[data-running-apps] [data-task-app="${appId}"]`);
}

function animateWindowFromDock(el,dockRect,store) {
  if(!el || !dockRect || !motionEnabled(store) || typeof el.animate!=='function')return;
  const rect=el.getBoundingClientRect();
  const dx=dockRect.left+dockRect.width/2-(rect.left+rect.width/2);
  const dy=dockRect.top+dockRect.height/2-(rect.top+rect.height/2);
  el.animate([
    {opacity:.15,transform:`translate(${dx}px,${dy}px) scale(.22)`},
    {opacity:1,transform:'none'}
  ],{duration:190,easing:'cubic-bezier(.16,.84,.32,1)'});
}

function installWindowMotion(api) {
  const layer=document.querySelector('.az-window-layer'); if(!layer)return;
  const bypass=new WeakSet();
  const animating=new WeakSet();

  const animateEntry=(el)=>{
    if(!motionEnabled(api.store) || typeof el.animate!=='function')return;
    el.animate([
      {opacity:0,transform:'translateY(10px) scale(.97)'},
      {opacity:1,transform:'none'}
    ],{duration:180,easing:'cubic-bezier(.16,.84,.32,1)'});
  };

  new MutationObserver((records)=>{
    for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLElement && node.classList.contains('az-window'))animateEntry(node);
  }).observe(layer,{childList:true});

  layer.addEventListener('click',(event)=>{
    const button=event.target.closest('.az-window-control[data-action="minimize"]');
    if(!button)return;
    if(bypass.has(button)){bypass.delete(button);return;}
    const el=button.closest('.az-window');
    if(!el || !motionEnabled(api.store) || typeof el.animate!=='function')return;
    if(animating.has(el)){event.preventDefault();event.stopPropagation();return;}
    const appId=el.dataset.appId;
    const dockButton=dockButtonForApp(appId);
    const dockRect=dockButton?.getBoundingClientRect();
    if(!dockRect)return;
    event.preventDefault();
    event.stopPropagation();
    animating.add(el);
    const rect=el.getBoundingClientRect();
    const dx=dockRect.left+dockRect.width/2-(rect.left+rect.width/2);
    const dy=dockRect.top+dockRect.height/2-(rect.top+rect.height/2);
    const animation=el.animate([
      {opacity:1,transform:'none'},
      {opacity:0,transform:`translate(${dx}px,${dy}px) scale(.2)`}
    ],{duration:170,easing:'cubic-bezier(.5,0,.84,.16)'});
    animation.finished.catch(()=>{}).finally(()=>{
      animating.delete(el);
      bypass.add(button);
      button.click();
    });
  },true);
}

function installWindowSnapping(api) {
  if(matchMedia('(pointer:coarse)').matches)return;
  const layer=document.querySelector('.az-window-layer');
  const stage=document.querySelector('.az-stage');
  if(!layer || !stage)return;
  let drag=null;

  layer.addEventListener('pointerdown',(event)=>{
    const bar=event.target.closest('[data-window-drag]');
    if(!bar || event.target.closest('button') || innerWidth<1200)return;
    const el=bar.closest('.az-window');
    if(!el || el.classList.contains('is-maximized'))return;
    drag={el,appId:el.dataset.appId,startX:event.clientX,startY:event.clientY};
  },true);

  document.addEventListener('pointerup',(event)=>{
    const current=drag; drag=null;
    if(!current || innerWidth<1200)return;
    const moved=Math.hypot(event.clientX-current.startX,event.clientY-current.startY);
    if(moved<14)return;
    const stageRect=stage.getBoundingClientRect();
    const edge=28;
    const localX=event.clientX-stageRect.left;
    const side=localX<=edge ? 'left' : localX>=stageRect.width-edge ? 'right' : null;
    if(!side)return;
    const before=current.el.getBoundingClientRect();
    const margin=8, gap=8;
    const width=(stageRect.width-margin*2-gap)/2;
    const height=Math.max(300,stageRect.height-margin*2);
    const left=side==='left' ? margin : stageRect.width-margin-width;
    const top=margin;
    Object.assign(current.el.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});
    api.store.saveWindowRect(current.appId,{left,top,width,height});
    if(!motionEnabled(api.store) || typeof current.el.animate!=='function')return;
    const after=current.el.getBoundingClientRect();
    const dx=before.left-after.left, dy=before.top-after.top;
    const sx=before.width/after.width, sy=before.height/after.height;
    current.el.animate([
      {transform:`translate(${dx}px,${dy}px) scale(${sx},${sy})`,transformOrigin:'top left'},
      {transform:'none',transformOrigin:'top left'}
    ],{duration:180,easing:'cubic-bezier(.16,.84,.32,1)'});
  });
}

function rewriteDock(store) {
  const dock=document.querySelector('.az-task-shelf'); if(!dock)return;
  dock.innerHTML=`<button class="az-shelf-button" type="button" data-shell-action="home" aria-label="Show desktop">${icons.home}<span class="az-dock-tooltip">Desktop</span></button><button class="az-shelf-button" type="button" data-shell-action="search" aria-label="Search and commands">${icons.search}<span class="az-dock-tooltip">Search</span></button><div class="az-shelf-divider" aria-hidden="true"></div><div class="az-shelf-pinned">${PINNED_APPS.map(dockApp).join('')}</div><div class="az-shelf-running" data-running-apps></div><div class="az-shelf-divider" aria-hidden="true"></div><button class="az-shelf-button" type="button" data-shell-action="switcher" data-os-launcher aria-label="Applications">${icons.grid}<span class="az-dock-tooltip">Applications</span></button>`;
  syncPinned(store);
  dock.addEventListener('click',(event)=>{
    const button=event.target.closest('.az-shelf-button'); if(!button)return;
    const appId=button.dataset.dockApp || button.dataset.taskApp;
    const el=appId ? document.querySelector(`.az-window[data-app-id="${appId}"]`) : null;
    const wasMinimized=Boolean(el?.classList.contains('is-minimized'));
    const dockRect=wasMinimized ? button.getBoundingClientRect() : null;
    if(wasMinimized)queueMicrotask(()=>animateWindowFromDock(el,dockRect,store));
    if(button.matches('[data-os-launcher]'))return;
    if(store.getState().reduceMotion)return;
    button.classList.remove('is-launching');
    requestAnimationFrame(()=>button.classList.add('is-launching'));
    setTimeout(()=>button.classList.remove('is-launching'),430);
  },true);
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
  const menuItems=()=>[...menu.querySelectorAll('[role="menuitem"]')];
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
    if(action==='apps')document.querySelector('[data-os-launcher]')?.click();
    if(action==='search')document.querySelector('[data-shell-action="search"]')?.click();
    if(action==='note')api.openApp('notes',{newNote:true});
    if(action==='archive')api.openApp('archive');
    if(action==='aizanoi')api.launchWorld('aizanoi');
  });
  document.addEventListener('pointerdown',(event)=>{if(!menu.contains(event.target))hide();},true);
  document.addEventListener('keydown',(event)=>{
    if(!menu.classList.contains('is-open'))return;
    if(event.key==='Escape'){hide();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const items=menuItems(); if(!items.length)return;
    event.preventDefault();
    const current=Math.max(0,items.indexOf(document.activeElement));
    const next=event.key==='Home' ? 0 : event.key==='End' ? items.length-1 : event.key==='ArrowDown' ? (current+1)%items.length : (current-1+items.length)%items.length;
    items[next].focus();
  },true);
}

function observeRunningApps(store) {
  const running=document.querySelector('[data-running-apps]');
  if(running)new MutationObserver(()=>queueMicrotask(()=>syncPinned(store))).observe(running,{childList:true,subtree:true});
}

export function installAizanoiOS(api) {
  rewriteTopBar(api.store);
  renderDesktop(api.store);
  rewriteDock(api.store);
  wireDockMagnification(api.store);
  installLauncherLifecycle(api);
  installDesktopContextMenu(api);
  installWindowMotion(api);
  installWindowSnapping(api);
  observeRunningApps(api.store);
  api.store.subscribe(()=>{syncPinned(api.store);syncTopBar(api.store);});
  document.documentElement.dataset.azShell='aizanoi-os';
}
