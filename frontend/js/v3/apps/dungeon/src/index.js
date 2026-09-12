// src/index.js
// AizanoiOS Module Entry Contract
import { launchDungeonGame, stopDungeonGame, setDungeonExitHandler } from '../js/main.js';

/**
 * Public AizanoiOS module entry point.
 * @param {object} context - Window and shell execution context
 * @param {HTMLElement} context.container - Host window DOM element
 * @param {object} [context.api] - Host shell API (openApp/closeApp/announce)
 * @param {object} [context.shell] - Host shell interface
 * @param {object} [context.windowInstance] - Window instance reference
 * @returns {Promise<Function>} Teardown cleanup function
 */
export async function mount({ container, api }) {
  // The shell renders an `.az-empty-state` "Opening application…" placeholder
  // into the window body before mount. Other apps wipe it when they render;
  // dungeon must clear it too, otherwise the placeholder keeps filling the
  // (small, mobile) window and squeezes the game canvas out of view.
  container.replaceChildren();
  // Inject local stylesheet if not already present
  let styleLink = document.getElementById('aizanoi-dungeon-css');
  if (!styleLink) {
    styleLink = document.createElement('link');
    styleLink.id = 'aizanoi-dungeon-css';
    styleLink.rel = 'stylesheet';
    styleLink.href = new URL('../css/game.css', import.meta.url).href;
    document.head.appendChild(styleLink);
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'aizanoi-dungeon-app-root';

  // Sol kenar donus kontrolu: fullscreen oyun yuzeyinde her zaman erisilir.
  // Wrapper icinde tutulur, teardown wrapper ile birlikte kaldirir.
  const exitBtn = document.createElement('button');
  exitBtn.type = 'button';
  exitBtn.className = 'az-dungeon-exit';
  exitBtn.setAttribute('aria-label', 'Return to AizanoiOS');
  const exitArrow = document.createElement('span');
  exitArrow.setAttribute('aria-hidden', 'true');
  exitArrow.className = 'az-dungeon-exit-arrow';
  exitArrow.textContent = '\u2190';
  const exitLabel = document.createElement('span');
  exitLabel.className = 'az-dungeon-exit-label';
  exitLabel.textContent = 'AizanoiOS';
  exitBtn.append(exitArrow, exitLabel);
  exitBtn.addEventListener('click', () => {
    try {
      api?.closeApp?.('dungeon');
    } catch (_) {}
  });
  wrapper.appendChild(exitBtn);
  container.appendChild(wrapper);

  setDungeonExitHandler(() => {
    try {
      api?.closeApp?.('dungeon');
    } catch (_) {}
  });

  let gameInstance;
  try {
    gameInstance = await launchDungeonGame(wrapper);
  } catch (err) {
    console.error('[Aizanoi Dungeon] Baslatma hatasi:', err);
    setDungeonExitHandler(null);
    container.replaceChildren();
    const errorBox = document.createElement('div');
    errorBox.className = 'aizanoi-dungeon-error';
    errorBox.setAttribute('role', 'alert');
    const title = document.createElement('strong');
    title.textContent = 'Aizanoi Dungeon could not open';
    const detail = document.createElement('p');
    detail.textContent = 'The game engine failed to load (Phaser). Close the window and try again.';
    errorBox.append(title, detail);
    container.appendChild(errorBox);
    throw err;
  }

  // QA escape hatch: surface the live Phaser.Game instance so the headless
  // browser suite can drive scene transitions without reverse-engineering
  // canvas letterboxing. Production code never reads this.
  if (typeof window !== 'undefined') {
    window.AIZANOI_DUNGEON_GAME = gameInstance;
  }

  // Pencere boyutu degistiginde otomatik canvas ve aspect ratio guncelleme
  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      try {
        if (gameInstance && gameInstance.scale) {
          gameInstance.scale.refresh();
        }
      } catch (_) {}
    });
    resizeObserver.observe(wrapper);
  }

  // Return teardown function called when the window is closed
  return () => {
    try {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      stopDungeonGame(gameInstance);
    } catch (err) {
      console.warn('[Aizanoi Dungeon] Error during teardown:', err);
    }
    wrapper.remove();
  };
}
