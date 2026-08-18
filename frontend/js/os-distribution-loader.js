(() => {
  'use strict';

  const State = window.AIZANOI_OS_STATE;
  if (!State || window.AIZANOI_DISTRIBUTION) return;

  const WORKBENCH_IDS = new Set((State.apps || []).filter((app) => app.runtime === 'workbench').map((app) => app.id));
  const SCRIPTS = [
    '/js/os-platform.js',
    '/js/os-archive.js',
    '/js/os-workbench.js',
    '/js/os-workbench-archive.js',
    '/js/os-workbench-readers.js',
    '/js/os-workbench-data.js',
    '/js/os-workbench-shell.js',
  ];
  let readyPromise = null;
  let warmTimer = null;

  function ensureStyle(href, key = href) {
    if (document.querySelector(`link[data-aizanoi-distribution-style="${key}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.aizanoiDistributionStyle = key;
    document.head.appendChild(link);
  }

  function ensureManifest() {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/manifest.webmanifest';
      document.head.appendChild(link);
    }
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.content = '#0b1017';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const selector = `script[data-aizanoi-distribution="${src}"]`;
      const existing = document.querySelector(selector);
      if (existing) {
        if (existing.dataset.loaded === '1') resolve();
        else {
          existing.addEventListener('load', resolve, { once:true });
          existing.addEventListener('error', reject, { once:true });
        }
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.aizanoiDistribution = src;
      script.addEventListener('load', () => { script.dataset.loaded = '1'; resolve(); }, { once:true });
      script.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once:true });
      document.body.appendChild(script);
    });
  }

  function ensureReady() {
    if (window.AIZANOI_WORKSPACE && window.AIZANOI_PLATFORM) return Promise.resolve(window.AIZANOI_WORKSPACE);
    if (readyPromise) return readyPromise;

    ensureStyle('/css/os-workbench-archive.css','workbench-archive');
    ensureStyle('/css/os-workbench-interactions.css','workbench-interactions');
    ensureStyle('/css/os-workbench-research.css','workbench-research');

    readyPromise = SCRIPTS.reduce((promise, src) => promise.then(() => loadScript(src)), Promise.resolve())
      .then(() => {
        if (!window.AIZANOI_WORKSPACE || !window.AIZANOI_PLATFORM) throw new Error('Aizanoi workstation contracts did not initialize.');
        window.dispatchEvent(new CustomEvent('aizanoi:distribution-ready'));
        return window.AIZANOI_WORKSPACE;
      })
      .catch((error) => {
        readyPromise = null;
        console.error('Aizanoi workstation distribution could not load.', error);
        if (typeof window.showBalloon === 'function') {
          try { window.showBalloon({ title:'Workstation unavailable', body:'The optional workstation layer could not load. Core Aizanoi OS is still available.', icon:'warning' }); } catch (_) {}
        }
        throw error;
      });
    return readyPromise;
  }

  function patchOpenApp() {
    if (!window.openApp || window.openApp.__aizanoiDistributionProxy) return;
    const coreOpen = window.openApp;
    const proxy = function(appId, ...args) {
      if (WORKBENCH_IDS.has(appId) && !window.AIZANOI_WORKSPACE) {
        ensureReady().then(() => window.openApp?.(appId, ...args)).catch(() => {});
        return null;
      }
      return coreOpen.call(this, appId, ...args);
    };
    proxy.__aizanoiDistributionProxy = true;
    proxy.__aizanoiNext = coreOpen.__aizanoiNext || false;
    window.openApp = proxy;
  }

  function scheduleWarmup() {
    clearTimeout(warmTimer);
    warmTimer = setTimeout(() => {
      if (document.visibilityState === 'visible' && !window.AIZANOI_WORKSPACE) ensureReady().catch(() => {});
    }, 9000);
  }

  ensureManifest();
  patchOpenApp();
  scheduleWarmup();

  window.AIZANOI_DISTRIBUTION = Object.freeze({
    ensureReady,
    isReady:() => Boolean(window.AIZANOI_WORKSPACE && window.AIZANOI_PLATFORM),
    workbenchApps:[...WORKBENCH_IDS],
  });
})();