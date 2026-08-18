const STYLE_ID = 'ancient-world-navigation-style';
const LINK_ID = 'ancient-world-back-to-os';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${LINK_ID}{position:fixed;z-index:2147483000;left:max(12px,env(safe-area-inset-left));top:max(68px,calc(env(safe-area-inset-top) + 58px));display:inline-flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid rgba(236,203,145,.32);border-radius:9px;background:linear-gradient(180deg,rgba(28,24,18,.90),rgba(12,11,9,.90));color:#f2dfbd;text-decoration:none;font:800 10px/1.1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.055em;box-shadow:0 8px 28px rgba(0,0,0,.30);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);touch-action:manipulation;user-select:none}
#${LINK_ID}:hover{border-color:rgba(240,195,111,.70);background:linear-gradient(180deg,rgba(55,43,28,.95),rgba(19,16,12,.94));transform:translateY(-1px)}
#${LINK_ID}:focus-visible{outline:2px solid #f0c77f;outline-offset:3px}
@media(max-width:720px),(pointer:coarse){#${LINK_ID}{top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));padding:8px 9px;font-size:9px;opacity:.92}}
@media(prefers-reduced-motion:reduce){#${LINK_ID}{transition:none!important}#${LINK_ID}:hover{transform:none}}
`;
  document.head.appendChild(style);
}

export function installBackToOS({ href = '/', label = '← Aizanoi OS', onBeforeExit } = {}) {
  ensureStyle();
  const existing = document.getElementById(LINK_ID);
  if (existing) return existing;

  const link = document.createElement('a');
  link.id = LINK_ID;
  link.href = href;
  link.textContent = label;
  link.setAttribute('aria-label', 'Return to the Aizanoi OS desktop');
  link.dataset.ancientWorldNavigation = 'back-to-os';

  link.addEventListener('click', async (event) => {
    event.preventDefault();
    link.setAttribute('aria-disabled', 'true');
    try { document.exitPointerLock?.(); } catch (_) {}
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
    } catch (_) {}
    try { await onBeforeExit?.(); } catch (error) { console.warn('Ancient World exit cleanup failed:', error); }
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

/**
 * Consume an Aizanoi OS world command without coupling the shared engine to a
 * city renderer. The modular Rome/Athens pages already expose #enter and #jump;
 * using their public DOM controls preserves each city's own safe teleport logic.
 */
export async function consumeHistoricalWorldDeepLink({
  worldId,
  enterSelector = '#enter',
  jumpSelector = '#jump',
  introHiddenSelector = '#intro.hidden',
  timeout = 9000,
} = {}) {
  if (!worldId) return { handled:false, reason:'missing-world-id' };
  const url = new URL(location.href);
  const urlJump = url.searchParams.get('jump');
  const pending = readPendingWorldCommand(worldId);
  const landmark = urlJump || pending?.landmark || null;
  if (!landmark) return { handled:false, reason:'no-landmark' };

  const enter = await waitForElement(enterSelector, { timeout });
  const jump = await waitForElement(jumpSelector, { timeout });
  if (!jump) return { handled:false, reason:'jump-control-unavailable', landmark };

  const valid = [...jump.options].some((option) => option.value === landmark);
  if (!valid) return { handled:false, reason:'unknown-landmark', landmark };

  if (enter && !document.querySelector(introHiddenSelector)) {
    enter.click();
    await new Promise((resolve) => setTimeout(resolve, 90));
  }

  jump.value = landmark;
  jump.dispatchEvent(new Event('change', { bubbles:true }));
  clearPendingWorldCommand(worldId);

  // Remove the one-shot query while keeping the resulting world in history.
  if (urlJump) {
    url.searchParams.delete('jump');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return { handled:true, landmark };
}

function detectWorldId() {
  const path = location.pathname;
  if (path.includes('/rome-410-476/')) return 'rome';
  if (path.includes('/athens-450-430/')) return 'athens';
  return null;
}

// Rome and Athens import this module as part of normal startup. Auto-consume an
// optional Field System deep link after their UI has mounted. A failed or absent
// deep link is deliberately silent and cannot block manual entry.
const AUTO_WORLD_ID = typeof location !== 'undefined' ? detectWorldId() : null;
if (AUTO_WORLD_ID) {
  const autoConsume = () => setTimeout(() => {
    consumeHistoricalWorldDeepLink({ worldId:AUTO_WORLD_ID }).catch((error) => console.warn('Historical world deep link failed:', error));
  }, 0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoConsume, { once:true });
  else autoConsume();
}
