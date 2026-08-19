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

  function applyLayoutMode() {
    const mode = layoutMode();
    document.body.dataset.azLayout = mode;
    const home = $('#az-mobile-home');
    if (home) {
      // On larger screens the shared home is wallpaper/workspace content behind
      // normal windows. On phones it becomes the active full-screen home layer.
      home.style.setProperty('z-index', mode === 'mobile' ? '4' : '0', 'important');
    }
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
    const ai = nav.querySelector('[data-mobile-nav="ai"]');
    ai?.remove();
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
