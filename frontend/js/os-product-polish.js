(() => {
  'use strict';

  if (window.AIZANOI_PRODUCT_POLISH) return;

  const STYLE_HREF = '/css/os-product-polish.css';
  const STYLE_KEY = 'aizanoi-product-polish';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function ensureStyleLast() {
    let link = $(`link[data-${STYLE_KEY}]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = STYLE_HREF;
      link.setAttribute(`data-${STYLE_KEY}`, '1');
      document.head.appendChild(link);
      return link;
    }
    if (document.head.lastElementChild !== link) document.head.appendChild(link);
    return link;
  }

  function windowsMap() {
    try { return typeof openWindows !== 'undefined' ? openWindows : null; }
    catch (_) { return null; }
  }

  function appIdForWindow(win) {
    const explicit = win?.dataset?.workbenchApp || win?.dataset?.appId || win?.dataset?.aizanoiApp;
    if (explicit) return explicit;
    const map = windowsMap();
    if (!map || !win) return null;
    for (const [appId, state] of map.entries()) if (state?.el === win) return appId;
    return null;
  }

  function setNamedMeta(name, value) {
    let node = document.querySelector(`meta[name="${name}"]`);
    if (!node) {
      node = document.createElement('meta');
      node.name = name;
      document.head.appendChild(node);
    }
    node.content = value;
  }

  function setPropertyMeta(name, value) {
    let node = document.querySelector(`meta[property="${name}"]`);
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute('property', name);
      document.head.appendChild(node);
    }
    node.content = value;
  }

  function currentProductMeta() {
    const pathname = location.pathname.replace(/\/+$/, '') || '/';
    const routes = {
      '/': ['Aizanoi Analytics | Interactive History & Digital Field System', 'Explore Aizanoi Analytics: interactive ancient worlds, a browser-native research workstation, local data tools, projects, games and digital experiments.'],
      '/ancient-world': ['Historical Worlds | Aizanoi Analytics', 'Explore Aizanoi, Late Antique Rome and Classical Athens through interactive historical environments.'],
      '/games': ['Games | Aizanoi Analytics', 'Small browser-native single-player experiments inside the Aizanoi Field System.'],
      '/projects': ['Projects | Aizanoi Analytics', 'Analytics, development and digital-history experiments from Aizanoi Analytics.'],
      '/videos': ['Aizanoi TV | Aizanoi Analytics', 'Video essays, project walkthroughs and historical deep-dives from Aizanoi Analytics.'],
      '/about': ['About | Aizanoi Analytics', 'About the Aizanoi Field System, its interactive history work and browser-native research tools.'],
      '/docs': ['Documentation | Aizanoi Analytics', 'Documentation for the static Aizanoi Field System and its browser-native applications.'],
      '/privacy': ['Privacy | Aizanoi Analytics', 'Privacy information for the static Aizanoi Analytics website and local browser workspace.'],
      '/terms': ['Terms | Aizanoi Analytics', 'Terms of use for Aizanoi Analytics.'],
      '/changelog': ['System Updates | Aizanoi Analytics', 'Release notes and project updates for Aizanoi Analytics.'],
    };
    return routes[pathname] || routes['/'];
  }

  function refreshProductMeta() {
    const [title, description] = currentProductMeta();
    document.title = title;
    setNamedMeta('description', description);
    setNamedMeta('twitter:title', title);
    setNamedMeta('twitter:description', description);
    setPropertyMeta('og:title', title);
    setPropertyMeta('og:description', description);
    document.documentElement.dataset.aizanoiProduct = 'field-system';
  }

  function patchRouteMetaBridge() {
    const routeMeta = window.ROUTE_META;
    if (routeMeta && typeof routeMeta === 'object') {
      Object.assign(routeMeta, {
        ancient:{ title:'Historical Worlds | Aizanoi Analytics', desc:'Explore interactive historical environments across Aizanoi, Rome and Athens.' },
        games:{ title:'Games | Aizanoi Analytics', desc:'Small browser-native single-player experiments inside the Aizanoi Field System.' },
        projects:{ title:'Projects | Aizanoi Analytics', desc:'Analytics, development and digital-history experiments.' },
        videos:{ title:'Aizanoi TV | Aizanoi Analytics', desc:'Video essays, project walkthroughs and historical deep-dives.' },
        about:{ title:'About | Aizanoi Analytics', desc:'About the Aizanoi Field System and its browser-native research tools.' },
        docs:{ title:'Documentation | Aizanoi Analytics', desc:'Documentation for the static Aizanoi Field System.' },
        privacy:{ title:'Privacy | Aizanoi Analytics', desc:'Privacy information for the static website and local browser workspace.' },
        terms:{ title:'Terms | Aizanoi Analytics', desc:'Terms of use for Aizanoi Analytics.' },
      });
    }

    if (Array.isArray(window.SEARCH_INDEX)) {
      for (let i = window.SEARCH_INDEX.length - 1; i >= 0; i -= 1) {
        if (/aizanoi ai|hr\s*&?\s*people analytics assistant/i.test(`${window.SEARCH_INDEX[i]?.title || ''} ${window.SEARCH_INDEX[i]?.desc || ''}`)) {
          window.SEARCH_INDEX.splice(i, 1);
        }
      }
    }

    if (typeof window.updateMetaForRoute === 'function' && !window.updateMetaForRoute.__productPolish) {
      const previous = window.updateMetaForRoute;
      const wrapped = function(...args) {
        const result = previous.apply(this, args);
        refreshProductMeta();
        return result;
      };
      wrapped.__productPolish = true;
      window.updateMetaForRoute = wrapped;
    }
  }

  function cleanBootAndFallbackCopy() {
    try {
      if (typeof BOOT_TIPS !== 'undefined' && Array.isArray(BOOT_TIPS)) {
        BOOT_TIPS.splice(0, BOOT_TIPS.length,
          'Tip: Press <b>Ctrl/Cmd + K</b> to search apps, worlds and landmarks.',
          'Tip: Open <b>Historical Worlds</b> to explore Aizanoi, Rome and Athens.',
          'Tip: Use <b>Field Archive</b> for local files, notes and datasets.',
          'Tip: Try <b>TAB</b> in Field Terminal for local command completion.',
          'Tip: Desktop and tablet windows can be moved, resized and restored.',
          'Tip: Mobile apps open fullscreen while keeping the same workspace identity.'
        );
      }
    } catch (_) {}

    const tip = $('#boot-tip');
    if (tip && /AI|Start\s*›\s*All Programs|Recycle Bin/i.test(tip.textContent || '')) {
      tip.innerHTML = 'Tip: Press <b>Ctrl/Cmd + K</b> to search apps, worlds and landmarks.';
    }
    const ssLabel = [...$$('#screensaver div')].find((node) => node.childElementCount === 0 && node.textContent.trim() === 'Aizanoi OS');
    if (ssLabel) ssLabel.textContent = 'Aizanoi Field System';
  }

  function removeLegacyAiEntrypoints() {
    $$('#start-menu [data-app="chatbot"], #icon-layer [data-app="chatbot"], [data-mobile-nav="ai"], #az-ai-button').forEach((node) => node.remove());
    const commandInput = $('#az-command-input');
    if (commandInput) commandInput.placeholder = 'Search apps, worlds, monuments or commands…';
    const commandFooter = $('.az-command-footer');
    if (commandFooter) commandFooter.innerHTML = '<span>↑↓ Navigate</span><span>Enter Open</span><span>Esc Close</span>';
    const callout = $('.az-command-callout p');
    if (callout) callout.textContent = 'Open apps, historical worlds and landmarks from the same searchable palette.';
  }

  function editorialShell({ mark='AOS', title, kicker, intro='', facts=[], body='' }) {
    return `
      <div class="azp-editorial-hero">
        <div class="azp-editorial-mark">${mark}</div>
        <div><h2>${title}</h2><div class="azp-editorial-kicker">${kicker}</div></div>
      </div>
      ${intro ? `<p>${intro}</p>` : ''}
      ${facts.length ? `<div class="azp-fact-grid">${facts.map(([label,value]) => `<article><span>${label}</span><b>${value}</b></article>`).join('')}</div>` : ''}
      ${body}`;
  }

  const EDITORIAL_APPS = new Set(['about','privacy','docs','terms','videos']);

  function editorialPad(appId, win) {
    let pad = $('.app-pad', win);
    if (pad) return pad;
    if (!EDITORIAL_APPS.has(appId)) return null;
    const body = $('.win-body', win);
    if (!body) return null;
    body.innerHTML = '<div class="app-pad" data-product-editorial-shell="1"></div>';
    return $('.app-pad', body);
  }

  function polishEditorialWindow(appId, win) {
    const pad = editorialPad(appId, win);
    if (!pad || pad.dataset.productCopy === '1') return;

    if (appId === 'about') {
      pad.dataset.productCopy = '1';
      pad.innerHTML = editorialShell({
        title:'Aizanoi Field System', kicker:'Browser-native digital archaeology workspace',
        intro:'Aizanoi Analytics is an independent interactive portfolio for historical reconstruction, local research tools, analytics experiments and small browser-native applications.',
        facts:[['Runtime','Static · browser-native'],['Workspace','Desktop · tablet · mobile'],['Storage','Local browser archive'],['Build','2026.08']],
        body:`<div class="azp-callout">One synchronized interface adapts from free desktop windows to touch-friendly tablet layouts and fullscreen mobile applications.</div>
          <h3>Quick guide</h3><ul><li>Open applications from the unified home or Aizanoi Index.</li><li>Use <b>Ctrl/Cmd + K</b> to search apps, worlds and landmarks.</li><li>Desktop and tablet windows can be moved, resized and restored.</li><li>Field Archive, Notes and Data Lab keep their working data in this browser.</li></ul>
          <h3>Environment</h3><p>Browser: <span id="about-browser">${navigator.userAgentData?.brands?.[0]?.brand || navigator.userAgent.split(' ').slice(-1)[0] || 'Browser'}</span></p>`
      });
      return;
    }

    if (appId === 'privacy') {
      pad.dataset.productCopy = '1';
      pad.innerHTML = editorialShell({
        mark:'PRV', title:'Privacy Notice', kicker:'Static runtime · local workspace',
        intro:'Aizanoi Analytics is a public static website and browser-native workspace. It does not require an account to explore the public experience.',
        facts:[['Accounts','Not required'],['App backend','None'],['Workspace data','Local browser storage'],['Advertising cookies','None']],
        body:`<h3>Local workspace data</h3><p>Field Archive, Field Notes and related workstation state are designed to remain in your browser unless you explicitly export or download something yourself.</p>
          <h3>Server logs</h3><p>The web server may retain ordinary request and security metadata such as IP address, path, timestamp and response status for operations and abuse prevention.</p>
          <h3>External services</h3><p>The public Aizanoi application does not send research notes, datasets or terminal commands to an external model provider. The Field Terminal is a browser-only virtual shell.</p>`
      });
      return;
    }

    if (appId === 'docs') {
      pad.dataset.productCopy = '1';
      pad.innerHTML = editorialShell({
        mark:'DOC', title:'Field System Documentation', kicker:'Static deployment contract',
        intro:'The public application is delivered as static HTML, CSS, JavaScript and assets behind Nginx. Visitor-facing application logic runs in the browser.',
        facts:[['Web runtime','Static'],['Terminal','Browser-only'],['/api/chat','410 Gone'],['Other /api/*','404']],
        body:`<h3>Core routes</h3><p><code>/</code> · <code>/historic-world/</code> · <code>/ancient-cities/rome-410-476/</code> · <code>/ancient-cities/athens-450-430/</code> · <code>/projects/</code> · <code>/games/</code></p>
          <h3>Workspace</h3><p>Field Archive uses browser storage. Data Lab inspects CSV/JSON locally. Source Reader and Artifact Viewer operate on local archive records. The terminal has no server shell or filesystem access.</p>`
      });
      return;
    }

    if (appId === 'terms') {
      pad.dataset.productCopy = '1';
      pad.innerHTML = editorialShell({
        mark:'TOS', title:'Terms of Use', kicker:'Independent experimental project',
        intro:'Aizanoi Analytics is an experimental educational and portfolio project. Historical reconstructions, datasets, code samples and interactive tools may evolve over time.',
        facts:[['Availability','No uptime guarantee'],['Historical content','Research-led / interpretive'],['Local tools','Use at your discretion'],['Project status','Experimental']],
        body:`<h3>Verification</h3><p>Do not treat historical reconstructions, calculations or demonstrations as a substitute for primary-source verification or professional advice.</p><h3>Use</h3><p>Use the site lawfully and do not attempt to disrupt the service or other users' access.</p>`
      });
      return;
    }

    if (appId === 'videos') {
      pad.dataset.productCopy = '1';
      pad.innerHTML = editorialShell({
        mark:'TV', title:'Aizanoi TV', kicker:'Video essays · builds · field notes',
        intro:'The video layer is being prepared as the public companion to Aizanoi Analytics: historical-world walkthroughs, project builds, analytics experiments and research notes.',
        facts:[['Channel','In preparation'],['Format','Long-form + walkthroughs'],['Focus','History · data · building'],['Workspace','Aizanoi Field System']],
        body:'<div class="azp-callout">The application is intentionally quiet until the first published collection is ready.</div>'
      });
    }
  }

  function polishLegacyWindow(appId, win) {
    if (appId === 'terminal') {
      const title = $('.win-title', win);
      if (title) title.textContent = 'Field Terminal';
      const prompt = $('.term-input-row > span', win);
      if (prompt) prompt.textContent = 'aizanoi@field:~$';
      const input = $('#term-input', win);
      if (input) input.placeholder = 'Type a command · try help';
    }

    if (appId === 'games') {
      const title = $('.win-title', win);
      if (title) title.textContent = 'Field Games';
      const header = $('.win-body > div > div:first-child', win);
      if (header) header.textContent = 'Field Games';
      const empty = $('#game-area > div', win);
      if (empty && /choose a game/i.test(empty.textContent || '')) empty.innerHTML = '<div style="font:700 28px/1 var(--azp-mono);color:var(--azp-amber-hi);margin-bottom:10px;">PLAY</div><div>Choose a local game above.</div>';
    }

    if (appId === 'ancient') {
      const title = $('.win-title', win);
      if (title) title.textContent = 'Historical Worlds';
    }

    polishEditorialWindow(appId, win);
  }

  function tagAndPolishWindows() {
    const map = windowsMap();
    $$('.win').forEach((win) => {
      const appId = appIdForWindow(win);
      win.dataset.productPolish = 'true';
      if (appId) win.dataset.appId = appId;
      if (appId) polishLegacyWindow(appId, win);
    });

    if (map) {
      for (const [appId, state] of map.entries()) {
        const win = state?.el;
        if (!win?.isConnected) continue;
        win.dataset.productPolish = 'true';
        win.dataset.appId = appId;
        polishLegacyWindow(appId, win);
      }
    }
  }

  function productSync() {
    ensureStyleLast();
    refreshProductMeta();
    patchRouteMetaBridge();
    cleanBootAndFallbackCopy();
    removeLegacyAiEntrypoints();
    tagAndPolishWindows();
    const homeCopy = $('.az-mobile-header p');
    if (homeCopy) homeCopy.textContent = 'FIELD SYSTEM · LOCAL WORKSPACE · STATIC RUNTIME';
  }

  let frame = 0;
  function scheduleSync() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      productSync();
    });
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length || mutation.removedNodes.length)) scheduleSync();
  });

  function init() {
    productSync();
    observer.observe(document.body, { childList:true, subtree:true });
    window.addEventListener('aizanoi:distribution-ready', () => {
      ensureStyleLast();
      scheduleSync();
    });
    window.addEventListener('popstate', scheduleSync);
    window.addEventListener('resize', scheduleSync, { passive:true });
    window.addEventListener('orientationchange', scheduleSync, { passive:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.AIZANOI_PRODUCT_POLISH = Object.freeze({
    version:'2026.08-product-polish',
    sync:productSync,
    style:STYLE_HREF,
  });
})();
