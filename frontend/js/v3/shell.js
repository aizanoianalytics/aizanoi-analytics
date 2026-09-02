import { APPS, WORLDS, appById, canonicalAppId, worldById, searchableEntries } from './registry.js';
import * as Store from './store.js';

const windows = new Map();
const openingApps = new Map();
const appGenerations = new Map();
let zCounter = 20;
let commandSelection = 0;
let activeOverlay = null;
let overlayOpener = null;
let keyboardWindowMode = null;
let appsStylePromise = null;

const icon = (name) => ({
  search:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="m20 20-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"/></svg>',
  home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m3.5 10.5 8.5-7 8.5 7v9H15v-6H9v6H3.5Z"/></svg>',
  grid:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/></svg>',
  settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M4 7h10m4 0h2M4 17h2m4 0h10M14 4v6M6 14v6"/></svg>'
})[name] || '';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function layoutMode() {
  const width = innerWidth;
  if (width < 900 && innerHeight <= 500) return 'compact';
  if (width < 600) return 'compact';
  if (width < 840) return 'medium';
  if (width < 1200) return 'expanded';
  return 'large';
}

function ensureAppsStyle() {
  if (appsStylePromise) return appsStylePromise;
  let link = document.querySelector('link[data-az-app-styles]');
  if (link?.dataset.azLoaded === 'true') return Promise.resolve();
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/styles/apps.css';
    link.dataset.azAppStyles = 'true';
    document.head.appendChild(link);
  }
  const attempt = new Promise((resolve, reject) => {
    link.addEventListener('load',resolve,{once:true});
    link.addEventListener('error',()=>reject(new Error('Aizanoi application styles failed to load.')),{once:true});
  }).then(()=>{link.dataset.azLoaded='true';}).catch((error)=>{
    link.remove();
    if(appsStylePromise===attempt)appsStylePromise=null;
    throw error;
  });
  appsStylePromise = attempt;
  return appsStylePromise;
}

function nextAppGeneration(appId) {
  const generation=(appGenerations.get(appId)||0)+1;
  appGenerations.set(appId,generation);
  return generation;
}

function announce(message) {
  const live = document.getElementById('az-live');
  if (!live) return;
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = String(message || ''); });
}

export function notify(title, body = '', kind = 'system') {
  Store.recordActivity(title, body, kind);
  const stack = document.querySelector('.az-toast-stack');
  if (!stack) return;
  const toast = document.createElement('div');
  toast.className = 'az-toast';
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong>${body ? `<p>${escapeHtml(body)}</p>` : ''}`;
  stack.prepend(toast);
  announce(`${title}. ${body}`);
  setTimeout(() => toast.remove(), 4200);
}

function renderWorldCards() {
  return WORLDS.map((world) => `
    <button class="az-world-card" type="button" data-world="${escapeHtml(world.id)}" aria-label="Open ${escapeHtml(world.label)} historical world">
      <span class="az-world-era">${escapeHtml(world.era)}</span>
      <strong>${escapeHtml(world.label)}</strong>
      <small>${escapeHtml(world.summary)}</small>
    </button>`).join('');
}

function renderAppCards() {
  return APPS.filter((app) => app.id !== 'worlds').map((app) => `
    <button class="az-app-card" type="button" data-app="${escapeHtml(app.id)}">
      <img src="${escapeHtml(app.icon)}" alt="">
      <div><strong>${escapeHtml(app.label)}</strong><small>${escapeHtml(app.description)}</small></div>
    </button>`).join('');
}

function recentMission() {
  const session = Store.getFieldSession();
  if (session) {
    const world = worldById(session.worldId);
    return {
      label:'Continue journey',
      title:`Return to ${world?.label || 'Historical World'}`,
      body:session.landmark ? `Resume near ${session.landmark}.` : `Resume your most recent ${world?.label || 'world'} exploration.`,
      action:'continue-world',
      button:'Continue'
    };
  }
  return {
    label:'Suggested journey',
    title:'Walk Aizanoi',
    body:'Begin with the reconstructed city and explore the rest of Aizanoi from one home screen.',
    action:'walk-aizanoi',
    button:'Explore Aizanoi'
  };
}

function renderHome() {
  const host = document.querySelector('.az-home-scroll');
  if (!host) return;
  const mission = recentMission();
  host.innerHTML = `<main class="az-home" aria-label="AizanoiOS home">
    <section class="az-home-hero">
      <div class="az-home-intro">
        <p class="az-kicker">AizanoiOS</p>
        <h1>Media, data, software<br>and historical worlds.</h1>
        <p>The public Aizanoi studio surface adapts to desktop, tablet and phone without exposing internal power tools.</p>
      </div>
      <aside class="az-mission-card" aria-label="${escapeHtml(mission.label)}">
        <div><div class="az-mission-label">${escapeHtml(mission.label)}</div><h2>${escapeHtml(mission.title)}</h2><p>${escapeHtml(mission.body)}</p></div>
        <div class="az-mission-actions"><button class="az-button az-button-primary" type="button" data-home-action="${escapeHtml(mission.action)}">${escapeHtml(mission.button)}</button></div>
      </aside>
    </section>
    <section class="az-home-section" aria-labelledby="az-worlds-title">
      <div class="az-section-head"><div><h2 id="az-worlds-title">Historical Worlds</h2><p>Walk Aizanoi, Rome and Athens.</p></div><div class="az-system-spacer"></div><button class="az-button" type="button" data-app="worlds">World index</button></div>
      <div class="az-world-grid">${renderWorldCards()}</div>
    </section>
    <section class="az-home-section" aria-labelledby="az-apps-title">
      <div class="az-section-head"><div><h2 id="az-apps-title">Applications</h2><p>Public Aizanoi products and local workspace utilities.</p></div></div>
      <div class="az-app-grid">${renderAppCards()}</div>
    </section>
  </main>`;
}

function shelfMarkup() {
  return `<button class="az-shelf-button" type="button" data-shell-action="home" aria-label="Home">${icon('home')}</button>
    <button class="az-shelf-button" type="button" data-shell-action="search" aria-label="Search and commands">${icon('search')}</button>
    <div class="az-shelf-divider" aria-hidden="true"></div>
    <div class="az-shelf-running" data-running-apps></div>
    <div class="az-shelf-divider" aria-hidden="true"></div>
    <button class="az-shelf-button" type="button" data-shell-action="switcher" aria-label="Open apps">${icon('grid')}</button>`;
}

function renderShelf() {
  const host = document.querySelector('[data-running-apps]');
  if (!host) return;
  const state = Store.getState();
  host.replaceChildren();
  for (const appId of state.openApps) {
    const app = appById(appId); if (!app) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `az-shelf-button is-open${state.activeApp === appId ? ' is-active' : ''}`;
    button.dataset.taskApp = appId;
    button.setAttribute('aria-label', `${app.label}${state.activeApp === appId ? ', active' : ''}`);
    button.innerHTML = `<img src="${escapeHtml(app.icon)}" alt="">`;
    host.appendChild(button);
  }
}

function renderClock() {
  const el = document.querySelector('.az-clock');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  el.title = now.toLocaleString();
}

function shellTemplate() {
  return `<div class="az-shell" data-layout="${layoutMode()}">
    <header class="az-system-bar">
      <button class="az-brand-button" type="button" data-shell-action="home" aria-label="AizanoiOS home"><img src="/assets/branding/aizanoi-logo-mark.svg" alt=""><span class="az-brand-copy"><strong>AizanoiOS</strong></span></button>
      <div class="az-system-spacer"></div>
      <nav class="az-system-actions" aria-label="System actions">
        <span class="az-local-state" title="AizanoiOS runs in this browser">LOCAL</span>
        <button class="az-system-action" type="button" data-shell-action="search" aria-label="Search and commands">${icon('search')}<span class="az-system-label">Search</span></button>
        <button class="az-system-action" type="button" data-shell-action="settings" aria-label="System settings">${icon('settings')}<span class="az-system-label">Settings</span></button>
        <time class="az-clock">--:--</time>
      </nav>
    </header>
    <section class="az-stage">
      <div class="az-home-scroll"></div>
      <div class="az-window-layer" aria-live="polite"></div>
    </section>
    <footer class="az-task-shelf-wrap"><nav class="az-task-shelf" aria-label="Open apps and navigation">${shelfMarkup()}</nav></footer>
    ${overlayMarkup()}
    <div class="az-toast-stack" aria-live="polite" aria-relevant="additions"></div>
  </div>`;
}

function overlayMarkup() {
  return `<div class="az-overlay" id="az-command-overlay" aria-hidden="true"><section class="az-dialog az-command" role="dialog" aria-modal="true" aria-labelledby="az-command-title"><h2 id="az-command-title" class="az-sr-only">Search Aizanoi</h2><div class="az-command-search">${icon('search')}<input id="az-command-input" type="search" autocomplete="off" spellcheck="false" placeholder="Open an app, world or action…" aria-label="Search Aizanoi apps, worlds and commands"><span class="az-key">ESC</span></div><div class="az-command-results" role="listbox" aria-label="Search results"></div></section></div>
  <div class="az-overlay" id="az-switcher-overlay" aria-hidden="true"><section class="az-dialog" role="dialog" aria-modal="true" aria-labelledby="az-switcher-title"><header class="az-dialog-header"><strong id="az-switcher-title">Open Apps</strong><span class="az-system-spacer"></span><button class="az-icon-button" type="button" data-overlay-close aria-label="Close open apps">×</button></header><div class="az-dialog-body"><div class="az-switcher-list" data-switcher-list></div></div></section></div>
  <div class="az-overlay" id="az-settings-overlay" aria-hidden="true"><section class="az-dialog" role="dialog" aria-modal="true" aria-labelledby="az-settings-title"><header class="az-dialog-header"><strong id="az-settings-title">AizanoiOS Settings</strong><span class="az-system-spacer"></span><button class="az-icon-button" type="button" data-overlay-close aria-label="Close settings">×</button></header><div class="az-dialog-body" data-settings-body></div></section></div>
  <div class="az-overlay" id="az-window-menu-overlay" aria-hidden="true"><section class="az-dialog az-window-menu-dialog" role="dialog" aria-modal="true" aria-labelledby="az-window-menu-title"><header class="az-dialog-header"><strong id="az-window-menu-title">Window</strong><span class="az-system-spacer"></span><button class="az-icon-button" type="button" data-overlay-close aria-label="Close window menu">×</button></header><div class="az-dialog-body" data-window-menu-body></div></section></div>`;
}

function setBackgroundInert(value) {
  for (const selector of ['.az-system-bar','.az-stage','.az-task-shelf-wrap']) {
    const node = document.querySelector(selector);
    if (node) node.inert = Boolean(value);
  }
}

function focusables(root) {
  return [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter((node) => !node.hidden && getComputedStyle(node).display !== 'none');
}

function openOverlay(id, opener=null) {
  const overlay = document.getElementById(id); if (!overlay) return;
  if(activeOverlay && activeOverlay!==overlay)closeOverlay(false);
  activeOverlay=overlay;overlayOpener=opener instanceof HTMLElement ? opener : document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.classList.add('is-open'); overlay.setAttribute('aria-hidden','false');
  setBackgroundInert(true);
  const focusTarget=overlay.querySelector('input,button,[tabindex]:not([tabindex="-1"])');
  queueMicrotask(()=>focusTarget?.focus());
}

function closeOverlay(restoreFocus=true) {
  if (!activeOverlay) return;
  const previous=activeOverlay;activeOverlay=null;
  previous.classList.remove('is-open'); previous.setAttribute('aria-hidden','true');
  setBackgroundInert(false);
  if(restoreFocus){const opener=overlayOpener;overlayOpener=null;queueMicrotask(()=>opener?.isConnected&&opener.focus());}
  else overlayOpener=null;
}

function trapOverlayKey(event) {
  if(!activeOverlay)return;
  if(event.key==='Escape'){event.preventDefault();closeOverlay();return;}
  if(event.key!=='Tab')return;
  const nodes=focusables(activeOverlay);if(!nodes.length){event.preventDefault();return;}
  const first=nodes[0],last=nodes[nodes.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}

function clampRect(rect) {
  const stage = document.querySelector('.az-stage');
  const bounds = stage?.getBoundingClientRect() || { left:0, top:44, right:innerWidth, bottom:innerHeight-72, width:innerWidth, height:innerHeight-116 };
  let width = Math.min(Math.max(rect.width || 840, 380), Math.max(380, bounds.width));
  let height = Math.min(Math.max(rect.height || 620, 320), Math.max(320, bounds.height));
  let left = Math.min(Math.max(rect.left ?? bounds.left + 36, bounds.left), Math.max(bounds.left, bounds.right - width));
  let top = Math.min(Math.max(rect.top ?? bounds.top + 20, bounds.top), Math.max(bounds.top, bounds.bottom - height));
  return { left, top, width, height };
}

function positionFor(appId) {
  const saved = Store.windowRect(appId);
  const stage = document.querySelector('.az-stage')?.getBoundingClientRect();
  if (saved) return clampRect(saved);
  const offset = windows.size * 28;
  return clampRect({ left:(stage?.left || 0) + 68 + offset, top:(stage?.top || 44) + 32 + offset, width:860, height:620 });
}

function setRoute(appId, mode='replace') {
  const url = new URL(location.href);
  if (appId) url.searchParams.set('app', appId); else url.searchParams.delete('app');
  const state = { ...(history.state || {}), app:appId || null };
  history[mode === 'push' ? 'pushState' : 'replaceState'](state, '', url);
}

function syncCompactIsolation() {
  const compact=layoutMode()==='compact';
  const active=Store.getState().activeApp;
  const home=document.querySelector('.az-home-scroll');
  const dock=document.querySelector('.az-task-shelf-wrap');
  if(home)home.inert=Boolean(compact&&active);
  if(dock)dock.inert=Boolean(compact&&active);
}

function windowTemplate(app) {
  return `<section class="az-window" data-app-id="${escapeHtml(app.id)}" tabindex="-1" role="region" aria-label="${escapeHtml(app.label)} window">
    <div class="az-window-bar" data-drag-handle>
      <button class="az-window-app-menu" type="button" data-window-menu aria-label="${escapeHtml(app.label)} window menu"><img src="${escapeHtml(app.icon)}" alt=""></button>
      <strong>${escapeHtml(app.label)}</strong>
      <div class="az-window-controls">
        <button class="az-window-control" type="button" data-action="minimize" aria-label="Minimize ${escapeHtml(app.label)}">−</button>
        <button class="az-window-control" type="button" data-action="maximize" aria-label="Maximize ${escapeHtml(app.label)}">□</button>
        <button class="az-window-control" type="button" data-action="close" aria-label="Close ${escapeHtml(app.label)}">×</button>
      </div>
    </div>
    <div class="az-window-body" data-app-body></div>
    <div class="az-resize-handle az-resize-e" data-resize="e"></div><div class="az-resize-handle az-resize-s" data-resize="s"></div><div class="az-resize-handle az-resize-se" data-resize="se"></div>
  </section>`;
}

function focusWindow(appId,{updateRoute=true}={}) {
  const item = windows.get(appId); if (!item) return;
  for (const [id, other] of windows) {
    const active = id === appId;
    other.el.classList.toggle('is-active', active);
    if(active){other.minimized=false;other.el.classList.remove('is-minimized');}
  }
  item.el.style.zIndex = String(++zCounter);
  Store.setActiveApp(appId);
  renderShelf();
  syncCompactIsolation();
  if(updateRoute)setRoute(appId,'replace');
  announce(`${item.app.label} active`);
}

function removeWindow(appId,{deletePersisted=false}={}) {
  const item=windows.get(appId); if(!item)return;
  nextAppGeneration(appId);
  item.module?.unmount?.();
  item.el.remove();
  windows.delete(appId);
  openingApps.delete(appId);
  Store.closeApp(appId);
  if(deletePersisted)Store.clearWindowRect(appId);
  renderShelf();
  const remaining=[...windows.keys()];
  if(remaining.length)focusWindow(remaining[remaining.length-1]);
  else {Store.setActiveApp(null);syncCompactIsolation();setRoute(null,'replace');}
}

export function closeApp(appId,{deletePersisted=false}={}) { removeWindow(appId,{deletePersisted}); }

export async function openApp(appId,{fromHistory=false,restoring=false}={}) {
  const app = appById(appId); if (!app) return false;
  const existing = windows.get(appId);
  if (existing) { focusWindow(appId,{updateRoute:!fromHistory}); return true; }
  if(openingApps.has(appId))return openingApps.get(appId);
  const generation=nextAppGeneration(appId);
  const promise=(async()=>{
    await ensureAppsStyle();
    if(generation!==appGenerations.get(appId))return false;
    const layer = document.querySelector('.az-window-layer'); if (!layer) return false;
    const wrap = document.createElement('div'); wrap.innerHTML = windowTemplate(app); const el=wrap.firstElementChild;
    const rect=positionFor(appId); Object.assign(el.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,zIndex:String(++zCounter)});
    layer.appendChild(el);
    const body=el.querySelector('[data-app-body]');
    try{
      const module = await import(app.module);
      if(generation!==appGenerations.get(appId)||!el.isConnected){module.unmount?.();return false;}
      const appApi = { ...appApi, app };
      await module.mount?.(body, appApi);
      if(generation!==appGenerations.get(appId)||!el.isConnected){module.unmount?.();return false;}
      windows.set(appId,{app,el,module,minimized:false,maximized:false});
      Store.openApp(appId);
      renderShelf();
      if(!restoring || Store.getState().activeApp===appId)focusWindow(appId,{updateRoute:!fromHistory});
      el.querySelector('[data-drag-handle]')?.addEventListener('pointerdown',(event)=>pointerDrag(event,appId));
      el.querySelectorAll('[data-resize]').forEach((handle)=>handle.addEventListener('pointerdown',(event)=>pointerDrag(event,appId,handle.dataset.resize)));
      return true;
    }catch(error){
      el.remove();
      notify(`Could not open ${app.label}`, error?.message || 'Unexpected application error.');
      console.error(error);
      return false;
    }
  })();
  openingApps.set(appId,promise);
  try{return await promise;}finally{if(openingApps.get(appId)===promise)openingApps.delete(appId);}
}

function renderCommands(query='') {
  const host = document.querySelector('.az-command-results'); if (!host) return;
  const results=searchableEntries(query).slice(0,18);
  commandSelection=Math.max(0,Math.min(commandSelection,Math.max(0,results.length-1)));
  if(!results.length){host.innerHTML='<div class="az-command-empty">No apps, worlds or commands match.</div>';return;}
  host.innerHTML=results.map((item,index)=>`<button class="az-command-row${index===commandSelection?' is-selected':''}" type="button" role="option" aria-selected="${index===commandSelection?'true':'false'}" data-command-index="${index}"><img src="${escapeHtml(item.icon)}" alt=""><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.description)}</small></span><span class="az-command-kind">${escapeHtml(item.kind)}</span></button>`).join('');
}

function commandRows(query='') { return searchableEntries(query).slice(0,18); }

function executeCommand(index) {
  const input=document.getElementById('az-command-input');
  const item=commandRows(input?.value || '')[index];if(!item)return;
  closeOverlay(false);
  if(item.kind==='app')openApp(item.id);
  else if(item.kind==='world')launchWorld(item.id);
  else if(item.id==='clear-activity'){Store.clearActivity();notify('Activity cleared','Recent local activity has been removed.');}
  else if(item.id==='reset-workspace'){Store.resetWorkspace();location.reload();}
}

function renderSwitcher() {
  const host=document.querySelector('[data-switcher-list]');if(!host)return;
  const open=[...windows.values()].sort((a,b)=>(Number(b.el.style.zIndex)||0)-(Number(a.el.style.zIndex)||0));
  host.innerHTML=open.length?open.map((item)=>`<button class="az-switcher-item" type="button" data-switch-app="${escapeHtml(item.app.id)}"><img src="${escapeHtml(item.app.icon)}" alt=""><span><strong>${escapeHtml(item.app.label)}</strong><small>${item.minimized?'Minimized':'Open'}</small></span></button>`).join(''):'<div class="az-command-empty">No applications are open.</div>';
}

function renderSettings() {
  const state=Store.getState();
  const host=document.querySelector('[data-settings-body]');if(!host)return;
  host.innerHTML=`<div class="az-settings-list"><label><span><strong>Reduce motion</strong><small>Prefer calmer window transitions.</small></span><input type="checkbox" data-setting="reduceMotion" ${state.reduceMotion?'checked':''}></label><label><span><strong>Stored workspace</strong><small>${state.openApps.length} open app${state.openApps.length===1?'':'s'} saved locally in this browser.</small></span><button class="az-button" type="button" data-reset-workspace>Reset workspace</button></label></div>`;
}

function openWindowMenu(appId, opener) {
  const item=windows.get(appId);if(!item)return;
  const host=document.querySelector('[data-window-menu-body]');if(!host)return;
  host.dataset.appId=appId;
  host.innerHTML=`<div class="az-window-menu-actions"><button type="button" class="az-button" data-window-command="minimize">Minimize</button><button type="button" class="az-button" data-window-command="maximize">${item.maximized?'Restore':'Maximize'}</button><button type="button" class="az-button" data-window-command="move">Move with keyboard</button><button type="button" class="az-button" data-window-command="resize">Resize with keyboard</button><button type="button" class="az-button az-button-danger" data-window-command="close">Close</button></div>`;
  openOverlay('az-window-menu-overlay',opener);
}

function handleKeyboardWindowMode(event) {
  if(!keyboardWindowMode)return false;
  const item=windows.get(keyboardWindowMode.appId);if(!item){keyboardWindowMode=null;return false;}
  if(event.key==='Escape'){
    event.preventDefault();event.stopPropagation();
    const rect=keyboardWindowMode.original;Object.assign(item.el.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
    keyboardWindowMode=null;announce('Window move or resize cancelled');return true;
  }
  if(event.key==='Enter'){
    event.preventDefault();event.stopPropagation();Store.saveWindowRect(item.app.id,item.el.getBoundingClientRect());keyboardWindowMode=null;announce('Window position saved');return true;
  }
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return false;
  event.preventDefault();event.stopPropagation();
  const step=event.shiftKey?32:12;const rect=item.el.getBoundingClientRect();
  if(keyboardWindowMode.mode==='move'){
    if(event.key==='ArrowLeft')rect.x-=step;if(event.key==='ArrowRight')rect.x+=step;if(event.key==='ArrowUp')rect.y-=step;if(event.key==='ArrowDown')rect.y+=step;
  }else{
    if(event.key==='ArrowLeft')rect.width-=step;if(event.key==='ArrowRight')rect.width+=step;if(event.key==='ArrowUp')rect.height-=step;if(event.key==='ArrowDown')rect.height+=step;
  }
  const next=clampRect({left:rect.x,top:rect.y,width:rect.width,height:rect.height});Object.assign(item.el.style,{left:`${next.left}px`,top:`${next.top}px`,width:`${next.width}px`,height:`${next.height}px`});return true;
}

function handleRootClick(event) {
  const contextAction=event.target.closest('[data-context-action]')?.dataset.contextAction;
  if(contextAction){
    const menu=document.querySelector('.az-desktop-context');menu?.classList.remove('is-open');menu?.setAttribute('aria-hidden','true');
    if(contextAction==='apps'){document.querySelector('[data-os-launcher]')?.click();return;}
    if(contextAction==='search'){document.querySelector('[data-shell-action="search"]')?.click();return;}
    if(contextAction==='news'){openApp('news');return;}
    if(contextAction==='analytics'){openApp('analytics');return;}
    if(contextAction==='aizanoi'){launchWorld('aizanoi');return;}
  }
  const appButton=event.target.closest('[data-app]');if(appButton){openApp(appButton.dataset.app);return;}
  const worldButton=event.target.closest('[data-world]');if(worldButton){launchWorld(worldButton.dataset.world);return;}
  const shellAction=event.target.closest('[data-shell-action]')?.dataset.shellAction;
  if(shellAction==='home'){showHome();return;}
  if(shellAction==='search'){renderCommands();openOverlay('az-command-overlay',event.target.closest('[data-shell-action]'));return;}
  if(shellAction==='settings'){renderSettings();openOverlay('az-settings-overlay',event.target.closest('[data-shell-action]'));return;}
  if(shellAction==='switcher'){renderSwitcher();openOverlay('az-switcher-overlay',event.target.closest('[data-shell-action]'));return;}
  const taskButton=event.target.closest('[data-task-app]');if(taskButton){
    const id=taskButton.dataset.taskApp;const item=windows.get(id);if(!item)return;
    if(!item.minimized&&Store.getState().activeApp===id)minimizeApp(id);else focusWindow(id);
    return;
  }
  const control=event.target.closest('[data-action]');if(control){
    const id=control.closest('.az-window')?.dataset.appId;if(!id)return;
    if(control.dataset.action==='close')closeApp(id);if(control.dataset.action==='minimize')minimizeApp(id);if(control.dataset.action==='maximize')maximizeApp(id);return;
  }
  const windowMenu=event.target.closest('[data-window-menu]');if(windowMenu){const id=windowMenu.closest('.az-window')?.dataset.appId;if(id)openWindowMenu(id,windowMenu);return;}
  const switchItem=event.target.closest('[data-switch-app]');if(switchItem){closeOverlay(false);focusWindow(switchItem.dataset.switchApp);return;}
  const commandItem=event.target.closest('[data-command-index]');if(commandItem){executeCommand(Number(commandItem.dataset.commandIndex));return;}
  if(event.target.closest('[data-overlay-close]')){closeOverlay();return;}
  const windowCommand=event.target.closest('[data-window-command]')?.dataset.windowCommand;
  if(windowCommand){
    const body=document.querySelector('[data-window-menu-body]');
    const appId=body?.dataset.appId; if(!appId)return;
    if(windowCommand==='move'||windowCommand==='resize')startKeyboardWindowMode(appId,windowCommand);
    else{
      closeOverlay(false);
      if(windowCommand==='close')closeApp(appId);
      if(windowCommand==='minimize')minimizeApp(appId);
      if(windowCommand==='maximize')maximizeApp(appId);
    }
    return;
  }
  if(event.target.closest('[data-reset-workspace]')){Store.resetWorkspace();location.reload();return;}
  if(event.target.matches('[data-setting="reduceMotion"]')){
    Store.setPreference('reduceMotion',event.target.checked);
    document.body.classList.toggle('az-reduce-motion',event.target.checked);
    return;
  }
  if(activeOverlay && event.target===activeOverlay)closeOverlay();
}

function handleKeydown(event) {
  if(handleKeyboardWindowMode(event))return;
  if(activeOverlay){
    if(activeOverlay.id==='az-command-overlay' && ['ArrowDown','ArrowUp','Enter'].includes(event.key)){
      event.preventDefault();
      const rows=commandRows(document.getElementById('az-command-input')?.value||'');
      if(!rows.length)return;
      if(event.key==='ArrowDown')commandSelection=(commandSelection+1)%rows.length;
      else if(event.key==='ArrowUp')commandSelection=(commandSelection-1+rows.length)%rows.length;
      else {executeCommand(commandSelection);return;}
      renderCommands(document.getElementById('az-command-input')?.value||'');
      document.getElementById('az-command-input')?.focus();
      return;
    }
    trapOverlayKey(event);
    return;
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openCommand(document.activeElement);return;}
  if(event.altKey&&event.key==='F4'){
    const id=Store.getState().activeApp;
    if(id){event.preventDefault();closeApp(id);}
    return;
  }
  if(event.altKey&&event.key==='Tab'){event.preventDefault();renderSwitcher();openOverlay('az-switcher-overlay',document.activeElement);return;}
}

function routeIntent() {
  const url=new URL(location.href);
  return canonicalAppId(url.searchParams.get('app'));
}

async function syncFromHistory() {
  const appId=routeIntent();
  if(appId){
    await openApp(appId,{fromHistory:true});
    if(windows.has(appId)){
      focusWindow(appId,{updateRoute:false});
      setRoute(appId,'replace');
    }
  } else showHome({push:false});
}

async function restoreWorkspace() {
  const state=Store.getState();
  const routedApp=routeIntent();
  const presentedApp=routedApp || state.activeApp;
  const appIds=[...state.openApps];
  if(presentedApp && !appIds.includes(presentedApp))appIds.push(presentedApp);
  for(const appId of appIds)await openApp(appId,{fromHistory:true,restoring:true});
  if(presentedApp && windows.has(presentedApp)){
    focusWindow(presentedApp,{updateRoute:false});
    setRoute(presentedApp,'replace');
  } else if(!presentedApp)showHome({push:false});
}

function resizeAll() {
  document.querySelector('.az-shell')?.setAttribute('data-layout',layoutMode());
  for(const [id,item] of windows){
    if(layoutMode()!=='large'){
      item.el.classList.remove('is-maximized');
      item.maximized=false;
    }
    const rect=clampRect(item.el.getBoundingClientRect());
    Object.assign(item.el.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
    if(layoutMode()==='large')Store.saveWindowRect(id,rect);
  }
  syncCompactIsolation();
}

const appApi=Object.freeze({
  openApp,
  closeApp,
  launchWorld,
  notify,
  announce,
  store:Store,
  playSound:(name)=>{ import('./workspace/sounds.js').then((module)=>module.playSound(name)).catch(()=>{}); },
  get openWindows(){return [...windows.keys()];},
  get activeApp(){return Store.getState().activeApp;}
});

export function mountShell() {
  const root=document.getElementById('az-root');
  if(!root)throw new Error('AizanoiOS root missing.');
  root.innerHTML=shellTemplate();
  renderShelf();
  renderClock();
  setInterval(renderClock,30000);
  root.addEventListener('click',handleRootClick);
  root.addEventListener('input',(event)=>{if(event.target.id==='az-command-input'){commandSelection=0;renderCommands(event.target.value);}});
  document.addEventListener('keydown',handleKeydown,true);
  window.addEventListener('popstate',syncFromHistory);
  window.addEventListener('resize',()=>requestAnimationFrame(resizeAll));
  window.addEventListener('aizanoi:notify',(event)=>notify(event.detail?.title||'Notice',event.detail?.body||'',event.detail?.kind||'system'));
  requestAnimationFrame(()=>restoreWorkspace().catch((error)=>{
    console.error('AizanoiOS workspace restoration failed.',error);
    notify('Workspace restoration failed',error?.message||'Open an app to try again.');
  }));
  return appApi;
}

export { appApi };
