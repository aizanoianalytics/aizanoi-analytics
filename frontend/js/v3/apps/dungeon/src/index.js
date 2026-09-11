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
  container.appendChild(wrapper);

  let gameInstance;
  try {
    gameInstance = await launchDungeonGame(wrapper);
  } catch (err) {
    console.error('[Aizanoi Dungeon] Baslatma hatasi:', err);
    container.replaceChildren();
    const errorBox = document.createElement('div');
    errorBox.className = 'aizanoi-dungeon-error';
    errorBox.setAttribute('role', 'alert');
    const title = document.createElement('strong');
    title.textContent = 'Aizanoi Dungeon acilamadi';
    const detail = document.createElement('p');
    detail.textContent = 'Oyun motoru yuklenemedi (Phaser calistirilamadi). Baglantinizi kontrol edip pencereyi kapatip yeniden acmayi deneyin.';
    errorBox.append(title, detail);
    container.appendChild(errorBox);
    throw err;
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
