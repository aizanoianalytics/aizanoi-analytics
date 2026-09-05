import './city-experience.js';
import './world-tour.js';

const STYLE_ID = 'ancient-world-navigation-style';
const LINK_ID = 'ancient-world-back-to-os';

/* Historical Worlds shared navigation chrome (back to AizanoiOS button)
   styles live in `frontend/ancient-world/engine/navigation.css`. The previous
   version created a runtime `<style>` element and assigned its `.textContent`,
   which is blocked under `style-src 'self'`. Each Historical World entry
   page links the stylesheet directly. */
function ensureStyle() {
  /* intentional no-op — see navigation.css */
}

async function cleanupForExit(onBeforeExit) {
  try { document.exitPointerLock?.(); } catch (_) {}
  try {
    if (document.fullscreenElement) await document.exitFullscreen?.();
  } catch (_) {}
  try { await onBeforeExit?.(); } catch (error) { console.warn('Ancient World exit cleanup failed:', error); }
}

export function installBackToOS({ href = '/', label = '← AizanoiOS', onBeforeExit } = {}) {
  ensureStyle();
  const existing = document.getElementById(LINK_ID);
  if (existing) return existing;

  const link = document.createElement('a');
  link.id = LINK_ID;
  link.href = href;
  link.textContent = label;
  link.setAttribute('aria-label', 'Return to AizanoiOS');
  link.dataset.ancientWorldNavigation = 'back-to-aizanoi-os';

  link.addEventListener('click', async (event) => {
    event.preventDefault();
    link.setAttribute('aria-disabled', 'true');
    await cleanupForExit(onBeforeExit);
    location.assign(href);
  });

  document.body.appendChild(link);
  return link;
}

function readPendingWorldCommand(worldId) {
  try {
    const raw = sessionStorage.getItem('aizanoi-world-command');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.worldId !== worldId || Date.now() - Number(parsed.timestamp || 0) > 120000) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function clearPendingWorldCommand(worldId) {
  try {
    const pending = readPendingWorldCommand(worldId);
    if (pending) sessionStorage.removeItem('aizanoi-world-command');
  } catch (_) {}
}

function waitForElement(selector, { timeout = 7000, interval = 60 } = {}) {
  return new Promise((resolve) => {
    const immediate = document.querySelector(selector);
    if (immediate) return resolve(immediate);
    const started = performance.now();
    const timer = setInterval(() => {
      const element = document.querySelector(selector);
      if (element || performance.now() - started >= timeout) {
        clearInterval(timer);
        resolve(element || null);
      }
    }, interval);
  });
}

function waitForRuntime({ timeout = 9000, interval = 40 } = {}) {
  return new Promise((resolve) => {
    if (window.__ANCIENT_WORLD_DEBUG__) return resolve(true);
    const started = performance.now();
    const timer = setInterval(() => {
      if (window.__ANCIENT_WORLD_DEBUG__ || performance.now() - started >= timeout) {
        clearInterval(timer);
        resolve(Boolean(window.__ANCIENT_WORLD_DEBUG__));
      }
    }, interval);
  });
}

/**
 * Consume an AizanoiOS world command without coupling the shared engine to a
 * city renderer. Each experience keeps ownership of its own enter and teleport
 */
export async function consumePendingWorldCommand({ worldId, onEnter, onTeleport, onLandmark, timeout = 9000 } = {}) {
  if (!worldId) return null;
  const pending = readPendingWorldCommand(worldId);
  if (!pending) return null;
  clearPendingWorldCommand(worldId);
  await waitForRuntime({ timeout });
  if (pending.action === 'teleport' && pending.landmark) {
    await onTeleport?.(pending.landmark);
    onLandmark?.(pending.landmark);
    return pending;
  }
  if (pending.action === 'enter' || pending.action === 'open') {
    await onEnter?.(pending);
    return pending;
  }
  return pending;
}

export default installBackToOS;

export async function consumeHistoricalWorldDeepLink({
  worldId,
  enterSelector = '#enter',
  jumpSelector = '#jump',
  introHiddenSelector = '#intro.hidden',
  readySelector = null,
  requireRuntime = false,
  timeout = 9000,
} = {}) {
  if (!worldId) return { handled:false, reason:'missing-world-id' };
  const url = new URL(location.href);
  const urlJump = url.searchParams.get('jump');
  const pending = readPendingWorldCommand(worldId);
  const landmark = urlJump || pending?.landmark || null;
  if (!landmark) return { handled:false, reason:'no-landmark' };

  if (readySelector) {
    const ready = await waitForElement(readySelector, { timeout });
    if (!ready) return { handled:false, reason:'world-not-ready', landmark };
  }
  if (requireRuntime) {
    const runtimeReady = await waitForRuntime({ timeout });
    if (!runtimeReady) return { handled:false, reason:'runtime-not-ready', landmark };
  }

  const enter = await waitForElement(enterSelector, { timeout });
  const jump = await waitForElement(jumpSelector, { timeout });
  if (!jump) return { handled:false, reason:'jump-control-unavailable', landmark };

  const valid = [...jump.options].some((option) => option.value === landmark);
  if (!valid) return { handled:false, reason:'unknown-landmark', landmark };

  if (enter && !document.querySelector(introHiddenSelector)) {
    enter.click();
    await new Promise((resolve) => setTimeout(resolve, 110));
  }

  jump.value = landmark;
  jump.dispatchEvent(new Event('change', { bubbles:true }));
  clearPendingWorldCommand(worldId);

  if (urlJump) {
    url.searchParams.delete('jump');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return { handled:true, landmark };
}

function detectWorldProfile() {
  const path = location.pathname;
  if (path.includes('/historic-world/')) return {
    worldId:'aizanoi', worldLabel:'Aizanoi',
    enterSelector:'#enterBtn', jumpSelector:'#teleport',
    introHiddenSelector:'#boot.hidden', readySelector:'#boot:not(.hidden)',
  };
  if (path.includes('/rome-410-476/')) return { worldId:'rome', worldLabel:'Rome AD 410–476', requireRuntime:true };
  if (path.includes('/athens-450-430/')) return { worldId:'athens', worldLabel:'Classical Athens c. 432–430 BCE', requireRuntime:true };
  if (path.includes('/iga/')) return { worldId:'iga', worldLabel:'İGA Istanbul Airport', requireRuntime:true };
  return null;
}

const AUTO_PROFILE = typeof location !== 'undefined' ? detectWorldProfile() : null;
if (AUTO_PROFILE) {
  const autoInstall = () => setTimeout(() => {
    consumeHistoricalWorldDeepLink(AUTO_PROFILE).catch((error) => console.warn('Historical world deep link failed:', error));
  }, 0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInstall, { once:true });
  else autoInstall();
}
