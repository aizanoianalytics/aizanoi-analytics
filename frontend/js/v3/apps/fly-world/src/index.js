// src/index.js
// Fly World — AizanoiOS desktop entry for the Fly House ghost-observer experience.
// Fullscreen surface (registry fullscreen:true, same lifecycle as Dungeon).
// The 3D experience itself lives at /labs/fly-world/ and is embedded via iframe so
// the desktop window owns framing/lifecycle while the labs page owns rendering,
// pointer-lock and resize behavior. No fly/connectome runtime is loaded here.

const LABS_URL = '/labs/fly-world/';
const STYLE_ID = 'aizanoi-fly-world-css';

/**
 * Public AizanoiOS module entry point.
 * @param {object} context
 * @param {HTMLElement} context.container - Host fullscreen body element
 * @param {object} [context.api] - Host shell API (closeApp)
 * @returns {Promise<Function>} Teardown cleanup function
 */
export async function mount({ container, api }) {
  container.replaceChildren();

  if (!document.getElementById(STYLE_ID)) {
    const styleLink = document.createElement('link');
    styleLink.id = STYLE_ID;
    styleLink.rel = 'stylesheet';
    styleLink.href = new URL('../css/fly-world.css', import.meta.url).href;
    document.head.appendChild(styleLink);
  }

  const root = document.createElement('div');
  root.className = 'aizanoi-fly-world-app-root';

  // Always-reachable return control on the fullscreen surface (dungeon pattern).
  // Pointer-lock Esc exits mouse capture inside the iframe natively and never
  // reaches this chrome, so Esc cannot accidentally close the app.
  const exitBtn = document.createElement('button');
  exitBtn.type = 'button';
  exitBtn.className = 'az-fly-world-exit';
  exitBtn.setAttribute('aria-label', 'Return to AizanoiOS');
  const exitArrow = document.createElement('span');
  exitArrow.setAttribute('aria-hidden', 'true');
  exitArrow.className = 'az-fly-world-exit-arrow';
  exitArrow.textContent = '←';
  const exitLabel = document.createElement('span');
  exitLabel.className = 'az-fly-world-exit-label';
  exitLabel.textContent = 'AizanoiOS';
  exitBtn.append(exitArrow, exitLabel);
  exitBtn.addEventListener('click', () => {
    try { api?.closeApp?.('fly-world'); } catch (_) {}
  });
  root.appendChild(exitBtn);

  const frame = document.createElement('iframe');
  frame.className = 'az-fly-world-frame';
  frame.title = 'Fly World — Fly House ghost observer';
  // pointer-lock: labs page captures the mouse on click; Esc releases capture natively.
  frame.allow = 'pointer-lock; fullscreen';
  frame.referrerPolicy = 'same-origin';
  frame.src = LABS_URL;
  root.appendChild(frame);
  container.appendChild(root);

  // Expose the live frame for headless verification (production never reads this).
  if (typeof window !== 'undefined') {
    window.AIZANOI_FLY_WORLD_FRAME = frame;
  }

  // Teardown: stop the labs runtime cleanly so reopening starts fresh.
  return function unmountFlyWorld() {
    try { frame.src = 'about:blank'; } catch (_) {}
    try { frame.remove(); } catch (_) {}
    try { root.remove(); } catch (_) {}
    try {
      if (typeof window !== 'undefined' && window.AIZANOI_FLY_WORLD_FRAME === frame) {
        delete window.AIZANOI_FLY_WORLD_FRAME;
      }
    } catch (_) {}
  };
}
