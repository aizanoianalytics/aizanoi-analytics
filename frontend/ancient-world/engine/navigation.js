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
