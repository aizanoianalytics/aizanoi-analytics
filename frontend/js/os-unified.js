(() => {
  'use strict';

  const State = window.AIZANOI_OS_STATE;
  if (!State || window.AIZANOI_UNIFIED_SHELL) return;

  const CORE_APPS = ['ancient','archive','notes','data-lab','terminal','projects','games','videos'];
  const $ = (selector, root = document) => root.querySelector(selector);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
    }[char]));
  }

  function layoutMode() {
    const width = document.documentElement.clientWidth || innerWidth;
    if (width <= 700) return 'mobile';
    if (width <= 1100) return 'tablet';
    return 'desktop';
  }

  function openRecent(index) {
    const item = State.getState().recent?.[index];
    if (!item) return;
    if (item.type === 'world' && item.worldId) {
      window.AIZANOI_OS?.launchWorld?.(item.worldId, item.landmark || null);
      return;
    }
    const appId = item.appId || (item.type === 'app' ? item.id : null);
    if (appId) window.AIZANOI_OS?.launchApp?.(appId);
    else if (item.route) location.assign(item.route);
  }

  function wireRelocatedHome(home) {
    if (!home || home.dataset.unifiedClick === '1') return;
    home.dataset.unifiedClick = '1';
    home.addEventListener('click', (event) => {
      // While the home lives under #az-shell-layer the mature shell owns these
      // events. This bridge only handles the desktop/tablet relocation.
      if (home.closest('#az-shell-layer')) return;
      const app = event.target.closest('[data-app]');
      if (app) { window.AIZANOI_OS?.launchApp?.(app.dataset.app); return; }
      const world = event.target.closest('[data-world]');
      if (world) { window.AIZANOI_OS?.launchWorld?.(world.dataset.world); return; }
      const recent = event.target.closest('[data-recent-index]');
      if (recent) openRecent(Number(recent.dataset.recentIndex));
    });
  }

  function relocateHome(mode) {
    const home = $('#az-mobile-home');
    const desktop = $('#desktop');
    const shell = $('#az-shell-layer');
    if (!home || !desktop || !shell) return;
    wireRelocatedHome(home);

    if (mode === 'mobile') {
      if (home.parentElement !== shell) shell.appendChild(home);
      home.style.setProperty('z-index', '4', 'important');
      return;
    }

    // Desktop/tablet windows are children of #desktop with z=100+. Keep the
    // shared home in that exact stacking context at z=0 so it can never cover
    // title bars, resize handles or application content.
    if (home.parentElement !== desktop) desktop.insertBefore(home, desktop.firstChild);
    home.style.setProperty('z-index', '0', 'important');
  }

  function applyLayoutMode() {
    const mode = layoutMode();
    document.body.dataset.azLayout = mode;
    relocateHome(mode);
  }

  function appMarkup(app) {
    return `<button class="az-mobile-app" data-app="${escapeHtml(app.id)}" title="Open ${escapeHtml(app.label)}" aria-label="Open ${escapeHtml(app.label)}"><img src="${escapeHtml(app.icon)}" alt=""><span>${escapeHtml(app.short || app.label)}</span></button>`;
  }

  function syncAppLauncher() {
    const host = $('#az-mobile-apps');
    if (!host) return;
    const apps = CORE_APPS.map((id) => State.findApp(id)).filter(Boolean);
    const signature = apps.map((app) => app.id).join('|');
    if (host.dataset.unifiedSignature === signature) return;
    host.dataset.unifiedSignature = signature;
    host.innerHTML = apps.map(appMarkup).join('');
  }

  function simplifyMobileNav() {
    const nav = $('#az-mobile-nav');
    if (!nav || nav.dataset.unifiedNav === '1') return;
    nav.dataset.unifiedNav = '1';
    nav.querySelector('[data-mobile-nav="ai"]')?.remove();
    const home = nav.querySelector('[data-mobile-nav="home"]');
    const search = nav.querySelector('[data-mobile-nav="search"]');
    const recent = nav.querySelector('[data-mobile-nav="recent"]');
    if (home) home.innerHTML = '<strong>⌂</strong><span>Home</span>';
    if (search) search.innerHTML = '<strong>⌕</strong><span>Search</span>';
    if (recent) recent.innerHTML = '<strong>▣</strong><span>Open</span>';
  }

  function cleanLegacyCopy() {
    const headerCopy = $('.az-mobile-header p');
    if (headerCopy) headerCopy.textContent = 'FIELD SYSTEM · LOCAL WORKSPACE · STATIC RUNTIME';

    const callout = $('.az-command-callout');
    if (callout) {
      const title = callout.querySelector('b');
      const copy = callout.querySelector('p');
      if (title) title.textContent = 'Command the workspace';
      if (copy) copy.textContent = 'Open apps, historical worlds and landmarks from the same searchable palette.';
    }

    const command = $('#az-command-input');
    if (command) command.placeholder = 'Search apps, worlds, monuments or commands…';
    const footer = $('.az-command-footer');
    if (footer) footer.innerHTML = '<span>↑↓ Navigate</span><span>Enter Open</span><span>Esc Close</span>';
  }

  function tagUnifiedSurfaces() {
    $('#az-mobile-home')?.setAttribute('data-unified-home','true');
    $('#taskbar')?.setAttribute('data-unified-dock','true');
    document.querySelectorAll('.win').forEach((win) => win.setAttribute('data-unified-window','true'));
  }

  function sync() {
    applyLayoutMode();
    syncAppLauncher();
    simplifyMobileNav();
    cleanLegacyCopy();
    tagUnifiedSurfaces();
  }

  let frame = 0;
  function scheduleSync() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length)) scheduleSync();
  });

  function init() {
    sync();
    observer.observe(document.body, { childList:true, subtree:true });
    addEventListener('resize', scheduleSync, { passive:true });
    addEventListener('orientationchange', scheduleSync, { passive:true });
    addEventListener('aizanoi:state', scheduleSync);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.AIZANOI_UNIFIED_SHELL = Object.freeze({
    version:'2026.08-unified',
    coreApps:[...CORE_APPS],
    layoutMode,
    sync,
  });
})();
