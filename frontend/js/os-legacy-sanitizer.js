(() => {
  'use strict';

  window.AIZANOI_AI_DISABLED = true;

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
    ['Privacy Notice','privacy'],
  ]);

  function setMeta(selector, value, attribute = 'content') {
    const node = document.querySelector(selector);
    if (node) node.setAttribute(attribute, value);
  }

  function alignProductMetadata() {
    setMeta('meta[name="theme-color"]', '#121b22');
    setMeta('meta[name="description"]', 'Aizanoi Analytics is a local-first digital archaeology and analytics workspace with interactive historical worlds, research tools, projects and games.');
    setMeta('meta[property="og:description"]', 'Local-first analytics, research tools and interactive history inside the Aizanoi Field System.');
    setMeta('meta[name="twitter:description"]', 'Local-first analytics, research tools and interactive history inside the Aizanoi Field System.');
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

  function disableAiEntrypoints(root = document) {
    const scope = root instanceof Element ? root : document;
    const selectors = [
      '[data-app="chatbot"]',
      '#az-ai-button',
      '[data-mobile-nav="ai"]',
      '.chat-starter',
    ];
    for (const selector of selectors) {
      const nodes = scope.matches?.(selector) ? [scope] : [...scope.querySelectorAll?.(selector) || []];
      nodes.forEach((node) => {
        node.hidden = true;
        node.setAttribute?.('aria-hidden','true');
        if ('disabled' in node) node.disabled = true;
      });
    }
  }

  function relabelDesktopEntries(root = document) {
    const scope = root.matches?.('#icon-layer,.desktop-icon') ? root : document;
    const docs = scope.querySelector?.('.desktop-icon[data-app="docs"] .icon-label') || document.querySelector('.desktop-icon[data-app="docs"] .icon-label');
    if (docs) docs.textContent = 'Archive Docs';
    disableAiEntrypoints(root);
  }

  function tagWindow(win) {
    if (!(win instanceof Element) || !win.matches('.win')) return null;
    const title = win.querySelector('.win-title')?.textContent?.trim() || '';
    let appId = WINDOW_TITLES.get(title) || null;
    if (!appId) {
      if (/Notepad/i.test(title)) appId = 'notes';
      else if (/Terminal/i.test(title)) appId = 'terminal';
      else if (/Aizanoi TV/i.test(title)) appId = 'videos';
      else if (/Privacy/i.test(title)) appId = 'privacy';
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
      <header class="az-about-head"><img src="/assets/branding/aizanoi-logo-mark.svg" alt=""><div><h2>Aizanoi Field System</h2><p>Digital Archaeology + Local Research Workstation</p></div></header>
      <div class="az-about-grid">
        <div class="az-about-card"><b>Shell</b><span>Aizanoi Field System · Security build 2026.08</span></div>
        <div class="az-about-card"><b>Workspace</b><span>Historical Worlds · Analytics · Research · Experiments</span></div>
        <div class="az-about-card"><b>Storage</b><span>Local preferences, notes, files, recents and session state</span></div>
        <div class="az-about-card"><b>Security</b><span>AI handoff disabled · local research stays in this browser</span></div>
      </div>
      <h3>What this is</h3>
      <p>Aizanoi is an original browser workspace built around interactive history, local analysis and digital experiments. Research files, notes and datasets are designed to remain in the browser unless you explicitly export them.</p>
      <h3>Security mode</h3>
      <p>Aizanoi AI and all Workbench-to-AI handoffs are disabled in this security build. Local research material is not sent to Groq, Google or another AI provider by the browser workspace.</p>
      <h3>Field shortcuts</h3>
      <ul><li><b>Ctrl/Cmd + K</b> — search apps, worlds and monuments.</li><li><b>Alt + ← / →</b> — snap the active desktop window.</li><li><b>Ctrl + &#96;</b> — switch between open workspace apps.</li><li><b>Historical Worlds</b> — launch Aizanoi, Rome or Athens directly to important landmarks.</li></ul>
      <h3>Mobile</h3>
      <p>Phones use an app-first home, fullscreen applications and Home/Search/Recent navigation.</p>
    </section>`;
  }

  function privacyMarkup() {
    return `<div class="app-pad" style="padding:18px 20px;overflow:auto;height:100%;font-size:12px;line-height:1.6;color:#222;">
      <h2 style="margin:0 0 12px;font-size:15px;color:#1a5fd6;">Privacy Notice</h2>
      <p><b>No account.</b> Aizanoi Analytics does not require a user account or profile for the browser workspace.</p>
      <p><b>Local research archive.</b> Field Archive can import CSV, JSON, PDF, Markdown, text and image files. These imports are stored locally in your browser using browser storage. They are not uploaded to the Aizanoi server by the archive features.</p>
      <p><b>AI disabled.</b> Aizanoi AI and Workbench-to-AI handoffs are disabled in the security build. Local files, notes and datasets are not forwarded to third-party AI providers by these features.</p>
      <p><b>Explicit exports.</b> Files leave browser storage only when you explicitly download/export them or otherwise move them outside Aizanoi.</p>
      <p><b>Server logs.</b> The web server may record basic operational/security metadata such as IP address, request path, timestamp, response code and user agent.</p>
      <p><b>Local storage.</b> UI preferences, session state, notes and Field Archive items may be stored in localStorage, sessionStorage or IndexedDB on your device. Clearing site data removes this local state.</p>
      <p><b>No advertising cookies.</b> The project does not intentionally use advertising cookies or behavioral advertising trackers.</p>
    </div>`;
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

  function modernizePrivacyWindow(root = document) {
    const windows = root.matches?.('.win') ? [root] : [...root.querySelectorAll?.('.win') || []];
    for (const win of windows) {
      const appId = tagWindow(win);
      if (appId !== 'privacy' || win.dataset.aizanoiPrivacyModernized) continue;
      const body = win.querySelector('.win-body');
      if (!body) continue;
      win.dataset.aizanoiPrivacyModernized = '1';
      body.innerHTML = privacyMarkup();
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
          disableAiEntrypoints(node);
          relabelDesktopEntries(node);
          tagWindows(node);
          modernizeAboutWindow(node);
          modernizePrivacyWindow(node);
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
    disableAiEntrypoints();
    relabelDesktopEntries();
    tagWindows();
    modernizeAboutWindow();
    modernizePrivacyWindow();
    watchDynamicLegacySurfaces();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.AIZANOI_OS_SANITIZER = Object.freeze({
    repairScreensaverSurveyMark,
    modernizeAboutWindow,
    modernizePrivacyWindow,
    alignProductMetadata,
    disableAiEntrypoints,
    relabelDesktopEntries,
    tagWindow,
    tagWindows,
  });
})();