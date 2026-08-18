const STYLE_ID = 'ancient-world-navigation-style';
const LINK_ID = 'ancient-world-back-to-os';
const ASK_ID = 'ancient-world-ask-ai';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${LINK_ID},#${ASK_ID}{position:fixed;z-index:2147483000;top:max(68px,calc(env(safe-area-inset-top) + 58px));display:inline-flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid rgba(236,203,145,.32);border-radius:9px;background:linear-gradient(180deg,rgba(28,24,18,.90),rgba(12,11,9,.90));color:#f2dfbd;text-decoration:none;font:800 10px/1.1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.055em;box-shadow:0 8px 28px rgba(0,0,0,.30);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);touch-action:manipulation;user-select:none;cursor:pointer}
#${LINK_ID}{left:max(12px,env(safe-area-inset-left))}
#${ASK_ID}{right:max(12px,env(safe-area-inset-right));color:#dcebea;border-color:rgba(132,185,188,.34);background:linear-gradient(180deg,rgba(24,42,43,.92),rgba(11,22,24,.92))}
#${LINK_ID}:hover,#${ASK_ID}:hover{border-color:rgba(240,195,111,.70);transform:translateY(-1px)}
#${ASK_ID}:hover{border-color:rgba(132,185,188,.72);background:linear-gradient(180deg,rgba(36,61,61,.96),rgba(15,30,32,.95))}
#${LINK_ID}:focus-visible,#${ASK_ID}:focus-visible{outline:2px solid #f0c77f;outline-offset:3px}
#${ASK_ID}:focus-visible{outline-color:#91c6c8}
@media(max-width:720px),(pointer:coarse){#${LINK_ID},#${ASK_ID}{top:max(8px,env(safe-area-inset-top));padding:8px 9px;font-size:9px;opacity:.94}#${LINK_ID}{left:max(8px,env(safe-area-inset-left))}#${ASK_ID}{right:max(8px,env(safe-area-inset-right))}}
@media(max-width:390px){#${ASK_ID}{max-width:47vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
@media(prefers-reduced-motion:reduce){#${LINK_ID},#${ASK_ID}{transition:none!important}#${LINK_ID}:hover,#${ASK_ID}:hover{transform:none}}
`;
  document.head.appendChild(style);
}

async function cleanupForExit(onBeforeExit) {
  try { document.exitPointerLock?.(); } catch (_) {}
  try {
    if (document.fullscreenElement) await document.exitFullscreen?.();
  } catch (_) {}
  try { await onBeforeExit?.(); } catch (error) { console.warn('Ancient World exit cleanup failed:', error); }
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
    await cleanupForExit(onBeforeExit);
    location.assign(href);
  });

  document.body.appendChild(link);
  return link;
}

function placeText(selector) {
  const raw = document.querySelector(selector)?.textContent?.trim();
  return raw && !/^(location|place|exploring)$/i.test(raw) ? raw.replace(/\s+/g,' ') : '';
}

export function installAskAizanoiAI({
  worldLabel = 'Historical World',
  placeSelector = '#place',
  onBeforeExit,
} = {}) {
  ensureStyle();
  const existing = document.getElementById(ASK_ID);
  if (existing) return existing;

  const button = document.createElement('button');
  button.id = ASK_ID;
  button.type = 'button';
  button.textContent = 'Ask AI about this';
  button.setAttribute('aria-label', `Ask Aizanoi AI about the current view in ${worldLabel}`);
  button.dataset.ancientWorldNavigation = 'ask-ai';
  button.addEventListener('click', async () => {
    button.disabled = true;
    const place = placeText(placeSelector);
    const subject = place ? `${place} in ${worldLabel}` : `what I was viewing in ${worldLabel}`;
    const prompt = `Explain ${subject}. Focus on the historical evidence, what is reconstructed or uncertain, and why this place matters. I just came from the interactive Historical World view.`;
    try {
      sessionStorage.setItem('aizanoi-world-ai-context', JSON.stringify({ worldLabel, place:place || null, timestamp:Date.now() }));
    } catch (_) {}
    await cleanupForExit(onBeforeExit);
    location.assign(`/?ask=${encodeURIComponent(prompt)}`);
  });
  document.body.appendChild(button);
  return button;
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
 * city renderer. Each experience keeps ownership of its own enter and teleport
 * behavior; this bridge only exercises the public DOM controls already used by visitors.
 */
export async function consumeHistoricalWorldDeepLink({
  worldId,
  enterSelector = '#enter',
  jumpSelector = '#jump',
  introHiddenSelector = '#intro.hidden',
  readySelector = null,
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
    worldId:'aizanoi', worldLabel:'Aizanoi', placeSelector:'#locName',
    enterSelector:'#enterBtn', jumpSelector:'#teleport',
    introHiddenSelector:'#boot.hidden', readySelector:'#boot:not(.hidden)',
  };
  if (path.includes('/rome-410-476/')) return { worldId:'rome', worldLabel:'Rome AD 410–476', placeSelector:'#place' };
  if (path.includes('/athens-450-430/')) return { worldId:'athens', worldLabel:'Classical Athens c. 432–430 BCE', placeSelector:'#place' };
  return null;
}

const AUTO_PROFILE = typeof location !== 'undefined' ? detectWorldProfile() : null;
if (AUTO_PROFILE) {
  const autoInstall = () => setTimeout(() => {
    installAskAizanoiAI(AUTO_PROFILE);
    consumeHistoricalWorldDeepLink(AUTO_PROFILE).catch((error) => console.warn('Historical world deep link failed:', error));
  }, 0);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInstall, { once:true });
  else autoInstall();
}
