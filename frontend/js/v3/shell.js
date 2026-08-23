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
      <div class="az-section-head"><div><h2 id="az-apps-title">Applications</h2><p>The eight public Aizanoi product families.</p></div></div>
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

function openOverlay(id, opener = document.activeElement) {
  closeOverlay(false);
  const overlay = document.getElementById(id); if (!overlay) return;
  activeOverlay = overlay;
  overlayOpener = opener instanceof HTMLElement ? opener : null;
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden','false');
  setBackgroundInert(true);
  const first = focusables(overlay)[0];
  setTimeout(() => first?.focus(), 0);
}

function closeOverlay(restore = true) {
  if (!activeOverlay) return;
  const last = activeOverlay;
  const opener = overlayOpener;
  activeOverlay = null;
  overlayOpener = null;
  last.classList.remove('is-open');
  last.setAttribute('aria-hidden','true');
  setBackgroundInert(false);
  if (restore && opener?.isConnected) opener.focus({ preventScroll:true });
}

function trapOverlayKey(event) {
  if (!activeOverlay) return false;
  if (event.key === 'Escape') { event.preventDefault(); closeOverlay(); return true; }
  if (event.key !== 'Tab') return false;
  const items = focusables(activeOverlay); if (!items.length) return false;
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  return true;
}

function defaultRect(appId) {
  const saved = Store.windowRect(appId); if (saved) return clampRect(saved);
  const index = Math.max(0, APPS.findIndex((app) => app.id === appId));
  const width = Math.min(980, Math.max(620, innerWidth * .66));
  const height = Math.min(700, Math.max(460, innerHeight * .70));
  return clampRect({ width, height, left:(innerWidth-width)/2 + (index%4)*14, top:Math.max(10,(innerHeight-height)/2 - 24 + (index%4)*10) });
}

function clampRect(rect) {
  const mode = layoutMode();
  if (mode !== 'large') return { left:0, top:0, width:innerWidth, height:Math.max(300, innerHeight - 126) };
  const width = Math.min(Math.max(360, Number(rect.width)||760), innerWidth-32);
  const height = Math.min(Math.max(260, Number(rect.height)||560), innerHeight-132);
  const left = Math.min(Math.max(12, Number(rect.left)||20), innerWidth-width-12);
  const top = Math.min(Math.max(8, Number(rect.top)||20), innerHeight-height-88);
  return { left, top, width, height };
}

function resizeMarkup() {
  return ['n','s','e','w','ne','nw','se','sw'].map((edge) => `<span class="az-resize-handle" data-edge="${edge}" tabindex="-1" aria-hidden="true"></span>`).join('');
}

function createWindow(app) {
  const layer = document.querySelector('.az-window-layer');
  const rect = defaultRect(app.id);
  const el = document.createElement('section');
  el.className = 'az-window';
  el.dataset.appId = app.id;
  el.setAttribute('role','region');
  el.setAttribute('aria-label', app.label);
  el.tabIndex = -1;
  Object.assign(el.style,{ left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`, height:`${rect.height}px`, zIndex:String(++zCounter) });
  el.innerHTML = `<header class="az-window-bar" data-window-drag><img class="az-window-icon" src="${escapeHtml(app.icon)}" alt=""><strong class="az-window-title">${escapeHtml(app.label)}</strong><span class="az-window-context">AIZANOI</span><div class="az-window-controls"><button class="az-window-control" type="button" data-action="menu" aria-label="Window menu">⋯</button><button class="az-window-control" type="button" data-action="minimize" aria-label="Minimize ${escapeHtml(app.label)}">—</button><button class="az-window-control" type="button" data-action="maximize" aria-label="Maximize or restore ${escapeHtml(app.label)}">□</button><button class="az-window-control" type="button" data-action="close" aria-label="Close ${escapeHtml(app.label)}">×</button></div></header><div class="az-window-body" data-app-body></div>${resizeMarkup()}`;
  layer.appendChild(el);
  wireWindow(el, app.id);
  return el;
}

function focusWindow(appId, { updateRoute=true } = {}) {
  const item = windows.get(appId); if (!item) return;
  for (const [id, other] of windows) other.el.classList.toggle('is-active', id === appId);
  item.minimized = false;
  item.el.classList.remove('is-minimized');
  item.el.style.zIndex = String(++zCounter);
  Store.setActiveApp(appId);
  renderShelf();
  syncCompactIsolation();
  if (updateRoute) setRoute(appId, 'push');
  setTimeout(() => item.el.focus({ preventScroll:true }), 0);
}

function syncCompactIsolation() {
  const activeId=Store.getState().activeApp;
  const active=activeId ? windows.get(activeId) : null;
  const isolated=layoutMode()==='compact' && Boolean(active && !active.minimized);
  for(const selector of ['.az-home-scroll','.az-task-shelf-wrap']){
    const node=document.querySelector(selector);
    if(node)node.inert=isolated;
  }
}

function setRoute(appId, mode='replace') {
  const url = new URL(location.href);
  if (appId) url.searchParams.set('app', appId); else url.searchParams.delete('app');
  url.hash = '';
  const next = `${url.pathname}${url.search}`;
  if (`${location.pathname}${location.search}` === next) return;
  history[mode === 'push' ? 'pushState' : 'replaceState']({ app:appId || null }, '', next);
}

async function openAppInstance(appId, app, options, generation) {
  await ensureAppsStyle();
  if(appGenerations.get(appId)!==generation)return null;
  const el = createWindow(app);
  const item = { app, el, cleanup:null, minimized:false, maximized:false, previousRect:null, generation };
  windows.set(appId, item);
  Store.markAppOpen(appId);
  renderShelf();
  const body = el.querySelector('[data-app-body]');
  body.innerHTML = '<div class="az-empty-state"><div><h3>Opening application…</h3><p>Loading only the code this app needs.</p></div></div>';
  try {
    const module = await import(app.module);
    if (windows.get(appId)!==item || appGenerations.get(appId)!==generation) return null;
    const result = await module.mount?.({ container:body, app, appId, api:appApi, options });
    if (windows.get(appId)!==item || appGenerations.get(appId)!==generation) { try { (typeof result === 'function' ? result : result?.cleanup)?.(); } catch (_) {} return null; }
    item.cleanup = typeof result === 'function' ? result : result?.cleanup || null;
  } catch (error) {
    if (windows.get(appId)!==item || appGenerations.get(appId)!==generation) return null;
    console.error(`Aizanoi app failed to open: ${appId}`, error);
    body.innerHTML = `<div class="az-empty-state"><div><h3>Could not open ${escapeHtml(app.label)}</h3><p>${escapeHtml(error?.message || 'Unknown application error')}</p><button class="az-button" type="button" data-retry-app="${escapeHtml(appId)}">Try again</button></div></div>`;
  }
  focusWindow(appId,{ updateRoute:!options.fromHistory });
  Store.recordActivity(`Opened ${app.label}`, app.description, 'app');
  announce(`${app.label} opened`);
  return el;
}

export function openApp(requestedAppId, options={}) {
  const appId=canonicalAppId(requestedAppId);
  const app = appById(appId); if (!app) return Promise.resolve(null);
  if (windows.has(appId)) {
    focusWindow(appId,{ updateRoute:!options.fromHistory });
    return Promise.resolve(windows.get(appId).el);
  }
  if(openingApps.has(appId))return openingApps.get(appId);
  const generation=nextAppGeneration(appId);
  const promise=openAppInstance(appId,app,options,generation).finally(()=>{
    if(openingApps.get(appId)===promise)openingApps.delete(appId);
  });
  openingApps.set(appId,promise);
  return promise;
}

export function closeApp(appId, { updateRoute=true } = {}) {
  const item = windows.get(appId);
  if (!item) {
    if(!openingApps.has(appId))return false;
    nextAppGeneration(appId);
    openingApps.delete(appId);
    return true;
  }
  nextAppGeneration(appId);
  try { item.cleanup?.(); } catch (_) {}
  item.el.remove();
  windows.delete(appId);
  Store.markAppClosed(appId);
  renderShelf();
  const state = Store.getState();
  const next = state.activeApp && windows.has(state.activeApp) ? state.activeApp : [...windows.keys()].at(-1) || null;
  if (next) focusWindow(next,{ updateRoute:false }); else Store.setActiveApp(null);
  syncCompactIsolation();
  if (updateRoute) setRoute(next,'replace');
  Store.recordActivity(`Closed ${item.app.label}`,'','app');
  announce(`${item.app.label} closed`);
  return true;
}

function minimizeApp(appId) {
  const item = windows.get(appId); if (!item) return;
  item.minimized = true;
  item.el.classList.add('is-minimized');
  item.el.classList.remove('is-active');
  Store.setActiveApp(null);
  renderShelf();
  syncCompactIsolation();
  setRoute(null,'replace');
  announce(`${item.app.label} minimized`);
}

function maximizeApp(appId) {
  const item = windows.get(appId); if (!item) return;
  item.maximized = !item.maximized;
  item.el.classList.toggle('is-maximized', item.maximized);
  announce(`${item.app.label} ${item.maximized ? 'maximized' : 'restored'}`);
}

function showHome({ push=true } = {}) {
  for (const item of windows.values()) {
    item.minimized = true;
    item.el.classList.add('is-minimized');
    item.el.classList.remove('is-active');
  }
  Store.setActiveApp(null);
  renderShelf();
  syncCompactIsolation();
  setRoute(null, push ? 'push' : 'replace');
  document.querySelector('.az-home-scroll')?.scrollTo({ top:0, behavior:Store.getState().reduceMotion ? 'auto' : 'smooth' });
}

export function launchWorld(worldId, landmark=null) {
  const world = worldById(worldId); if (!world) return false;
  Store.updateFieldSession({ worldId, landmark, route:world.route, source:'field-system' });
  Store.recordActivity(`Entered ${world.label}`, world.era, 'world');
  const url = landmark ? `${world.route}?jump=${encodeURIComponent(landmark)}&from=field-system` : `${world.route}?from=field-system`;
  location.href = url;
  return true;
}

function pointerDrag(event, appId, edge=null) {
  if (layoutMode() !== 'large') return;
  const item = windows.get(appId); if (!item || item.maximized || event.button !== 0) return;
  event.preventDefault();
  focusWindow(appId,{updateRoute:false});
  const start = { x:event.clientX, y:event.clientY, rect:item.el.getBoundingClientRect() };
  const move = (e) => {
    const dx=e.clientX-start.x, dy=e.clientY-start.y;
    let rect={ left:start.rect.left, top:start.rect.top, width:start.rect.width, height:start.rect.height };
    if (!edge) { rect.left += dx; rect.top += dy; }
    else {
      if (edge.includes('e')) rect.width += dx;
      if (edge.includes('s')) rect.height += dy;
      if (edge.includes('w')) { rect.left += dx; rect.width -= dx; }
      if (edge.includes('n')) { rect.top += dy; rect.height -= dy; }
    }
    rect=clampRect(rect);
    Object.assign(item.el.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
  };
  const finish = () => {
    document.removeEventListener('pointermove',move);
    document.removeEventListener('pointerup',finish);
    document.removeEventListener('pointercancel',finish);
    if (!item.el.isConnected) return;
    Store.saveWindowRect(appId,item.el.getBoundingClientRect());
  };
  document.addEventListener('pointermove',move);
  document.addEventListener('pointerup',finish,{once:true});
  document.addEventListener('pointercancel',finish,{once:true});
}

function startKeyboardWindowMode(appId, mode) {
  const item=windows.get(appId); if(!item) return;
  keyboardWindowMode={appId,mode,original:item.el.getBoundingClientRect()};
  closeOverlay(false);
  item.el.focus();
  announce(`${mode} mode. Use arrow keys, Shift for larger steps, Enter to accept, Escape to cancel.`);
}

function handleKeyboardWindowMode(event) {
  if (!keyboardWindowMode) return false;
  const {appId,mode,original}=keyboardWindowMode;
  const item=windows.get(appId);
  if(!item){keyboardWindowMode=null;return false;}
  if(event.key==='Enter'){
    event.preventDefault();
    keyboardWindowMode=null;
    Store.saveWindowRect(appId,item.el.getBoundingClientRect());
    announce(`${item.app.label} ${mode} complete`);
    return true;
  }
  if(event.key==='Escape'){
    event.preventDefault();
    Object.assign(item.el.style,{left:`${original.left}px`,top:`${original.top}px`,width:`${original.width}px`,height:`${original.height}px`});
    keyboardWindowMode=null;
    announce(`${mode} cancelled`);
    return true;
  }
  const map={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(!map[event.key])return false;
  event.preventDefault();
  const step=event.shiftKey?24:6;
  const [dx,dy]=map[event.key];
  const current=item.el.getBoundingClientRect();
  let rect={left:current.left,top:current.top,width:current.width,height:current.height};
  if(mode==='move'){rect.left+=dx*step;rect.top+=dy*step;} else {rect.width+=dx*step;rect.height+=dy*step;}
  rect=clampRect(rect);
  Object.assign(item.el.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
  return true;
}

function openWindowMenu(appId, opener) {
  const item=windows.get(appId); if(!item)return;
  const body=document.querySelector('[data-window-menu-body]');
  body.innerHTML=`<div class="az-simple-grid az-window-menu-grid"><button class="az-button" type="button" data-window-command="move">Move with keyboard</button><button class="az-button" type="button" data-window-command="resize">Resize with keyboard</button><button class="az-button" type="button" data-window-command="minimize">Minimize</button><button class="az-button" type="button" data-window-command="maximize">${item.maximized?'Restore':'Maximize'}</button><button class="az-button az-button-danger" type="button" data-window-command="close">Close</button></div>`;
  body.dataset.appId=appId;
  openOverlay('az-window-menu-overlay',opener);
}

function wireWindow(el, appId) {
  el.addEventListener('pointerdown',()=>focusWindow(appId,{updateRoute:false}));
  el.querySelector('[data-window-drag]').addEventListener('pointerdown',(event)=>{if(event.target.closest('button'))return;pointerDrag(event,appId);});
  el.querySelector('[data-window-drag]').addEventListener('dblclick',(event)=>{if(!event.target.closest('button'))maximizeApp(appId);});
  el.querySelectorAll('.az-resize-handle').forEach((handle)=>handle.addEventListener('pointerdown',(event)=>pointerDrag(event,appId,handle.dataset.edge)));
  el.querySelector('.az-window-controls').addEventListener('click',(event)=>{
    const action=event.target.closest('button')?.dataset.action; if(!action)return;
    if(action==='close')closeApp(appId);
    else if(action==='minimize')minimizeApp(appId);
    else if(action==='maximize')maximizeApp(appId);
    else if(action==='menu')openWindowMenu(appId,event.target.closest('button'));
  });
}

function renderSwitcher() {
  const host=document.querySelector('[data-switcher-list]'); if(!host)return;
  const state=Store.getState();
  host.innerHTML=state.openApps.length ? state.openApps.map((id)=>{
    const app=appById(id); if(!app)return '';
    return `<button class="az-switcher-item" type="button" data-switch-app="${escapeHtml(id)}"><img src="${escapeHtml(app.icon)}" alt=""><span><strong>${escapeHtml(app.label)}</strong><small>${state.activeApp===id?'Active application':'Open'}</small></span></button>`;
  }).join('') : '<div class="az-empty-state"><div><h3>No apps open</h3><p>Open an Aizanoi application or Historical World from Home.</p></div></div>';
}

function renderSettings() {
  const body=document.querySelector('[data-settings-body]'); if(!body)return;
  const state=Store.getState();
  body.innerHTML=`<div class="az-simple-grid az-settings-grid"><div class="az-simple-card"><h3>Appearance</h3><p>Motion follows your preference across the AizanoiOS shell.</p><label class="az-setting-row"><input type="checkbox" data-setting="reduceMotion" ${state.reduceMotion?'checked':''}> Reduce non-essential motion</label></div><div class="az-simple-card"><h3>Local state</h3><p>Open apps, recent activity, window positions and Historical Worlds session context are stored in this browser.</p><button class="az-button az-button-danger" type="button" data-reset-workspace>Reset local state</button></div></div>`;
}

function commandRows(query='') {
  const q=query.trim().toLowerCase();
  const entries=searchableEntries().filter((entry)=>!q || [entry.label,entry.description,...entry.keywords].join(' ').toLowerCase().includes(q));
  const commands=[
    {type:'action',id:'home',label:'Go Home',description:'Return to the AizanoiOS home screen',keywords:['home','desktop']},
    {type:'action',id:'continue',label:'Continue Historical World',description:'Return to your most recent historical journey',keywords:['continue','resume','world','session']}
  ].filter((entry)=>!q || [entry.label,entry.description,...entry.keywords].join(' ').toLowerCase().includes(q));
  return [...commands,...entries].slice(0,18);
}

function renderCommands(query='') {
  const host=document.querySelector('.az-command-results'); if(!host)return;
  const rows=commandRows(query);
  commandSelection=Math.min(commandSelection,Math.max(0,rows.length-1));
  if(!rows.length){host.innerHTML='<div class="az-command-empty">No direct match. Try an app, Historical World or action.</div>';return;}
  const groups=[];
  for(const type of ['action','world','app']){
    const subset=rows.filter((row)=>row.type===type);
    if(subset.length)groups.push({type,subset});
  }
  let index=0;
  host.innerHTML=groups.map(({type,subset})=>`<div class="az-command-group">${type==='action'?'Actions':type==='world'?'Historical Worlds':'Apps'}</div>${subset.map((row)=>{
    const current=index++;
    const image=row.type==='app'?appById(row.id)?.icon:row.type==='world'?'/assets/icons/ancient-world.svg':'/assets/branding/aizanoi-logo-mark.svg';
    return `<button class="az-command-row${current===commandSelection?' is-selected':''}" type="button" role="option" aria-selected="${current===commandSelection}" data-command-index="${current}"><img src="${escapeHtml(image)}" alt=""><span><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.description)}</small></span><span class="az-command-kind">${escapeHtml(row.type)}</span></button>`;
  }).join('')}`).join('');
}

function executeCommand(index) {
  const input=document.getElementById('az-command-input');
  const rows=commandRows(input?.value||'');
  const row=rows[index]; if(!row)return;
  closeOverlay(false);
  if(row.type==='app')openApp(row.id);
  else if(row.type==='world')launchWorld(row.id);
  else if(row.id==='home')showHome();
  else if(row.id==='continue'){
    const session=Store.getFieldSession();
    session?launchWorld(session.worldId,session.landmark):launchWorld('aizanoi');
  }
}

function openCommand(opener) {
  commandSelection=0;
  const input=document.getElementById('az-command-input');
  if(input)input.value='';
  renderCommands('');
  openOverlay('az-command-overlay',opener);
}

function handleRootClick(event) {
  const app=event.target.closest('[data-app]')?.dataset.app;
  if(app){openApp(app);return;}
  const world=event.target.closest('[data-world]')?.dataset.world;
  if(world){launchWorld(world);return;}
  const homeAction=event.target.closest('[data-home-action]')?.dataset.homeAction;
  if(homeAction==='walk-aizanoi'){launchWorld('aizanoi');return;}
  if(homeAction==='continue-world'){
    const session=Store.getFieldSession();
    session?launchWorld(session.worldId,session.landmark):launchWorld('aizanoi');
    return;
  }
  const shellAction=event.target.closest('[data-shell-action]')?.dataset.shellAction;
  if(shellAction==='home'){showHome();return;}
  if(shellAction==='search'){openCommand(event.target.closest('button'));return;}
  if(shellAction==='switcher'){renderSwitcher();openOverlay('az-switcher-overlay',event.target.closest('button'));return;}
  if(shellAction==='settings'){renderSettings();openOverlay('az-settings-overlay',event.target.closest('button'));return;}
  const task=event.target.closest('[data-task-app]')?.dataset.taskApp;
  if(task){focusWindow(task);return;}
  const switchApp=event.target.closest('[data-switch-app]')?.dataset.switchApp;
  if(switchApp){closeOverlay(false);focusWindow(switchApp);return;}
  if(event.target.closest('[data-overlay-close]')){closeOverlay();return;}
  const retry=event.target.closest('[data-retry-app]')?.dataset.retryApp;
  if(retry){closeApp(retry,{updateRoute:false});openApp(retry);return;}
  const commandIndex=event.target.closest('[data-command-index]')?.dataset.commandIndex;
  if(commandIndex!=null){executeCommand(Number(commandIndex));return;}
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
  get openWindows(){return [...windows.keys()];},
  get activeApp(){return Store.getState().activeApp;}
});

export function mountShell() {
  const root=document.getElementById('az-root');
  if(!root)throw new Error('AizanoiOS root missing.');
  root.innerHTML=shellTemplate();
  renderHome();
  renderShelf();
  renderClock();
  setInterval(renderClock,30000);
  root.addEventListener('click',handleRootClick);
  root.addEventListener('input',(event)=>{if(event.target.id==='az-command-input'){commandSelection=0;renderCommands(event.target.value);}});
  document.addEventListener('keydown',handleKeydown,true);
  window.addEventListener('popstate',syncFromHistory);
  window.addEventListener('resize',()=>requestAnimationFrame(resizeAll));
  window.addEventListener('aizanoi:notify',(event)=>notify(event.detail?.title||'Notice',event.detail?.body||'',event.detail?.kind||'system'));
  restoreWorkspace().catch((error)=>{
    console.error('AizanoiOS workspace restoration failed.',error);
    notify('Workspace restoration failed',error?.message||'Open an app to try again.');
  });
  return appApi;
}

export { appApi };
