(() => {
  'use strict';

  const State = window.AIZANOI_OS_STATE;
  if (!State || window.AIZANOI_PLATFORM) return;

  const bus = new EventTarget();
  const commandProviders = new Set();
  const capabilityProviders = new Map();
  let installPrompt = window.__AIZANOI_INSTALL_PROMPT__ || null;
  let swRegistration = null;
  let swScheduled = false;

  const VERSION = '2.1.0-field';
  const BUILD = '2026.08.19';

  function emit(type, detail = {}) {
    bus.dispatchEvent(new CustomEvent(type, { detail }));
    try { window.dispatchEvent(new CustomEvent(`aizanoi:${type}`, { detail })); } catch (_) {}
  }

  function on(type, listener, options) {
    bus.addEventListener(type, listener, options);
    return () => bus.removeEventListener(type, listener, options);
  }

  function ensureInstallMetadata() {
    let manifest = document.querySelector('link[rel="manifest"]');
    if (!manifest) {
      manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = '/manifest.webmanifest';
      document.head.appendChild(manifest);
    }
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.content = '#0b1017';
    else {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = '#0b1017';
      document.head.appendChild(meta);
    }
  }

  async function registerServiceWorker() {
    if (swRegistration) return swRegistration;
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return null;
    try {
      swRegistration = await navigator.serviceWorker.register('/service-worker.js', { scope:'/' });
      emit('platform:service-worker', { ready:true });
      return swRegistration;
    } catch (error) {
      console.warn('Aizanoi service worker registration skipped.', error);
      emit('platform:service-worker', { ready:false, error:String(error?.message || error) });
      return null;
    }
  }

  function scheduleServiceWorker() {
    if (swScheduled) return;
    swScheduled = true;
    const schedule = () => setTimeout(() => registerServiceWorker(), 6500);
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once:true });
  }

  async function storageEstimate() {
    if (!navigator.storage?.estimate) return { usage:0, quota:0, percent:0 };
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      return { usage, quota, percent:quota ? Math.min(100, usage / quota * 100) : 0 };
    } catch (_) {
      return { usage:0, quota:0, percent:0 };
    }
  }

  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    const units = ['KB','MB','GB','TB'];
    let n = value / 1024;
    let unit = units[0];
    for (let i = 1; i < units.length && n >= 1024; i += 1) {
      n /= 1024;
      unit = units[i];
    }
    return `${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)} ${unit}`;
  }

  function notify(title, body = '', kind = 'system') {
    State.recordActivity(title, body, kind);
    if (typeof window.showBalloon === 'function') {
      try { window.showBalloon({ title, body, icon:kind === 'warning' ? 'warning' : 'info' }); } catch (_) {}
    }
    emit('platform:notification', { title, body, kind });
  }

  function registerCommandProvider(provider) {
    if (typeof provider !== 'function') return () => {};
    commandProviders.add(provider);
    return () => commandProviders.delete(provider);
  }

  function getContextCommands(context = State.getContext(), query = '') {
    const output = [];
    for (const provider of commandProviders) {
      try {
        const rows = provider(context, query);
        if (Array.isArray(rows)) output.push(...rows);
      } catch (error) {
        console.warn('Aizanoi command provider failed.', error);
      }
    }
    return output;
  }

  function registerCapability(name, provider) {
    if (!name || !provider) return false;
    capabilityProviders.set(String(name), provider);
    emit('platform:capability', { name:String(name), available:true });
    return true;
  }

  function capability(name) {
    return capabilityProviders.get(String(name)) || null;
  }

  async function invoke(name, method, ...args) {
    const provider = capability(name);
    if (!provider) throw new Error(`Capability unavailable: ${name}`);
    const fn = typeof provider === 'function' && !method ? provider : provider?.[method];
    if (typeof fn !== 'function') throw new Error(`Capability method unavailable: ${name}.${method || ''}`);
    return fn.apply(provider, args);
  }

  async function install() {
    if (!installPrompt) {
      notify('Install Aizanoi', 'Use your browser install/add-to-home-screen action on supported devices.', 'system');
      return false;
    }
    try {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      const accepted = choice?.outcome === 'accepted';
      if (accepted) installPrompt = null;
      emit('platform:install', { accepted });
      return accepted;
    } catch (_) {
      return false;
    }
  }

  function canInstall() {
    return Boolean(installPrompt);
  }

  function appCapabilities(appId) {
    const app = State.findApp(appId);
    return Array.isArray(app?.capabilities) ? [...app.capabilities] : [];
  }

  function supports(appId, capabilityName) {
    return appCapabilities(appId).includes(capabilityName);
  }

  function systemInfo() {
    const memory = Number(navigator.deviceMemory || 0);
    const cores = Number(navigator.hardwareConcurrency || 0);
    return {
      version:VERSION,
      build:BUILD,
      online:navigator.onLine,
      language:navigator.language,
      memoryGB:memory || null,
      cores:cores || null,
      viewport:{ width:innerWidth, height:innerHeight, dpr:devicePixelRatio || 1 },
      standalone:matchMedia('(display-mode: standalone)').matches || Boolean(navigator.standalone),
      swReady:Boolean(swRegistration),
      installable:canInstall(),
    };
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    window.__AIZANOI_INSTALL_PROMPT__ = event;
    emit('platform:installable', { available:true });
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    window.__AIZANOI_INSTALL_PROMPT__ = null;
    State.recordActivity('Aizanoi installed', 'Field System added as an installed web application.', 'system');
    emit('platform:installed', {});
  });
  window.addEventListener('online', () => emit('platform:network', { online:true }));
  window.addEventListener('offline', () => emit('platform:network', { online:false }));

  ensureInstallMetadata();
  scheduleServiceWorker();

  window.AIZANOI_PLATFORM = Object.freeze({
    VERSION,
    BUILD,
    on,
    emit,
    notify,
    formatBytes,
    storageEstimate,
    systemInfo,
    registerCommandProvider,
    getContextCommands,
    registerCapability,
    capability,
    invoke,
    appCapabilities,
    supports,
    canInstall,
    install,
    registerServiceWorker,
    get serviceWorkerRegistration() { return swRegistration; },
  });
})();