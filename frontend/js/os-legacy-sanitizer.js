(() => {
  'use strict';

  const WINDOW_TITLES = new Map([
    ['Aizanoi AI','chatbot'],
    ['Games','games'],
    ['Ancient World','ancient'],
    ['Historical Worlds','ancient'],
    ['Projects','projects'],
    ['Documentation','docs'],
    ['System Updates','changelog'],
    ['Untitled - Notepad','notes'],
    ['C:\\Aizanoi - Terminal','terminal'],
    ['About Aizanoi','about'],
    ['Aizanoi TV','videos'],
    ['My Documents','docs'],
  ]);

  function setMeta(selector, value, attribute = 'content') {
    const node = document.querySelector(selector);
    if (node) node.setAttribute(attribute, value);
  }

  function alignProductMetadata() {
    setMeta('meta[name="theme-color"]', '#121b22');
    setMeta('meta[name="description"]', 'Aizanoi Analytics is an AI-native digital archaeology and analytics workspace featuring Aizanoi AI, interactive historical worlds, projects, games and educational media.');
    setMeta('meta[property="og:description"]', 'AI, analytics and interactive history inside the Aizanoi Field System.');
    setMeta('meta[name="twitter:description"]', 'AI, analytics and interactive history inside the Aizanoi Field System.');
  }

  function repairScreensaverSurveyMark() {
    const svg = document.getElementById('az-stars');
    if (!svg) return;
    const group = [...svg.querySelectorAll('g[transform]')].find((node) => /translate\([^)]*%/.test(node.getAttribute('transform') || ''));
    if (!group) return;
    const update = () => {
      const rect = svg.getBoundingClientRect();
      const width = Math.max(1, rect.width || innerWidth);
      const height = Math.max(1, rect.height || innerHeight);
      group.setAttribute('transform', `translate(${(width / 2).toFixed(1)} ${(height - 6).toFixed(1)})`);
    };
    update();
    window.addEventListener('resize', update, { passive:true });
  }

  function relabelDesktopEntries(root = document) {
    const scope = root.matches?.('#icon-layer,.desktop-icon') ? root : document;
    const docs = scope.querySelector?.('.desktop-icon[data-app="docs"] .icon-label') || document.querySelector('.desktop-icon[data-app="docs"] .icon-label');
    if (docs) docs.textContent = 'Archive Docs';
  }

  function tagWindow(win) {
    if (!(win instanceof Element) || !win.matches('.win')) return null;
    const title = win.querySelector('.win-title')?.textContent?.trim() || '';
    let appId = WINDOW_TITLES.get(title) || null;
    if (!appId) {
      if (/Notepad/i.test(title)) appId = 'notes';
      else if (/Terminal/i.test(title)) appId = 'terminal';
      else if (/Aizanoi TV/i.test(title)) appId = 'videos';
    }
    if (appId) win.dataset.aizanoiApp = appId;
    return appId;
  }

  function tagWindows(root = document) {
    const windows = root.matches?.('.win') ? [root] : [...root.querySelectorAll?.('.win') || []];
    windows.forEach(tagWindow);
  }

  function aboutMarkup() {
    return `<section class="az-about-field">
      <header class="az-about-head"><img src="/assets/branding/aizanoi-logo-mark.svg" alt=""><div><h2>Aizanoi Field System</h2><p>Digital Archaeology + Intelligence Workstation</p></div></header>
      <div class="az-about-grid">
        <div class="az-about-card"><b>Shell</b><span>Aizanoi Field System · 2026.08</span></div>
        <div class="az-about-card"><b>Workspace</b><span>AI · Historical Worlds · Analytics · Experiments</span></div>
        <div class="az-about-card"><b>Storage</b><span>Local preferences, notes, recents and session state</span></div>
        <div class="az-about-card"><b>Identity</b><span>Single-publisher, no account or social layer</span></div>
      </div>
      <h3>What this is</h3>
      <p>Aizanoi is an original browser workspace built around interactive history, AI-assisted analysis and digital experiments. Its shell preserves the useful desktop metaphor without imitating a specific commercial operating system.</p>
      <h3>Field shortcuts</h3>
      <ul><li><b>Ctrl/Cmd + K</b> — search apps, worlds, monuments or ask Aizanoi AI.</li><li><b>Alt + ← / →</b> — snap the active desktop window.</li><li><b>Ctrl + &#96;</b> — switch between open workspace apps.</li><li><b>Historical Worlds</b> — launch Aizanoi, Rome or Athens directly to important landmarks.</li></ul>
      <h3>Mobile</h3>
      <p>Phones use an app-first home, fullscreen applications and a dedicated Home/Search/AI/Recent navigation model instead of shrinking the desktop.</p>
    </section>`;
  }

  function modernizeAboutWindow(root = document) {
    const windows = root.matches?.('.win') ? [root] : [...root.querySelectorAll?.('.win') || []];
    for (const win of windows) {
      const appId = tagWindow(win);
      if (appId !== 'about' || win.dataset.aizanoiAboutModernized) continue;
      const body = win.querySelector('.win-body');
      if (!body) continue;
      win.dataset.aizanoiAboutModernized = '1';
      body.innerHTML = aboutMarkup();
      const status = win.querySelector('.win-statusbar .seg:last-child');
      if (status) status.textContent = 'Aizanoi Field System';
    }
  }

  function relabelLegacyScreens() {
    const lock = document.getElementById('lock-screen');
    if (lock) {
      const labels = [...lock.querySelectorAll('div')];
      const os = labels.find((node) => node.childElementCount === 0 && node.textContent.trim() === 'Aizanoi OS');
      if (os) os.textContent = 'Aizanoi Field System';
      const state = labels.find((node) => node.childElementCount === 0 && node.textContent.trim() === 'System Locked');
      if (state) state.textContent = 'Workspace Locked';
    }
  }

  function watchDynamicLegacySurfaces() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          relabelDesktopEntries(node);
          tagWindows(node);
          modernizeAboutWindow(node);
          if (node.id === 'shutdown-overlay') {
            const text = [...node.querySelectorAll('div')].find((item) => /Aizanoi OS/.test(item.textContent || ''));
            if (text) text.textContent = text.textContent.replace('Aizanoi OS', 'Aizanoi Field System');
          }
        }
      }
    });
    observer.observe(document.body, { childList:true, subtree:true });
  }

  function init() {
    alignProductMetadata();
    repairScreensaverSurveyMark();
    relabelLegacyScreens();
    relabelDesktopEntries();
    tagWindows();
    modernizeAboutWindow();
    watchDynamicLegacySurfaces();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.AIZANOI_OS_SANITIZER = Object.freeze({
    repairScreensaverSurveyMark,
    modernizeAboutWindow,
    alignProductMetadata,
    relabelDesktopEntries,
    tagWindow,
    tagWindows,
  });
})();