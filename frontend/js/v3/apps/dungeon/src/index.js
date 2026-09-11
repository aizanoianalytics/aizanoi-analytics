// src/index.js
// AizanoiOS Module Entry Contract
import { launchDungeonGame, stopDungeonGame } from '../js/main.js';

/**
 * Public AizanoiOS module entry point.
 * @param {object} context - Window and shell execution context
 * @param {HTMLElement} context.container - Host window DOM element
 * @param {object} [context.shell] - Host shell interface
 * @param {object} [context.windowInstance] - Window instance reference
 * @returns {Promise<Function>} Teardown cleanup function
 */
export async function mount({ container }) {
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
  container.appendChild(wrapper);

  const gameInstance = await launchDungeonGame(wrapper);

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
