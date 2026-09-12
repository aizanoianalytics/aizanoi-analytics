import { launchDungeonGame } from './main.js';
import { toggleDungeonFullscreen } from './systems/SettingsSystem.js';

const container = document.getElementById('game-container');
if (container) {
  launchDungeonGame(container).then(() => {
    console.log('[Aizanoi Dungeon] Standalone started.');
  }).catch(err => {
    console.error('[Aizanoi Dungeon] Baslatma hatasi:', err);
    container.replaceChildren();
    const errorBox = document.createElement('div');
    errorBox.className = 'aizanoi-dungeon-error';
    errorBox.setAttribute('role', 'alert');
    const title = document.createElement('strong');
    title.textContent = 'Aizanoi Dungeon failed to start';
    const detail = document.createElement('p');
    detail.textContent = 'The game engine could not load (Phaser failed). Refresh the page.';
    errorBox.append(title, detail);
    container.appendChild(errorBox);
  });
}

function checkOrientation() {
  const warning = document.getElementById('orientation-warning');
  if (!warning) return;
  if (warning.dataset.dismissed === '1') {
    warning.hidden = true;
    return;
  }
  const isMobile = /Android|iPhone|iPad|iPod|touch/i.test(navigator.userAgent) || (window.innerWidth < 840 && 'ontouchstart' in window);
  if (isMobile && window.innerHeight > window.innerWidth) {
    warning.hidden = false;
  } else {
    warning.hidden = true;
  }
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);
checkOrientation();

document.getElementById('play-anyway')?.addEventListener('click', () => {
  const warning = document.getElementById('orientation-warning');
  if (warning) {
    warning.dataset.dismissed = '1';
    warning.hidden = true;
  }
});

document.getElementById('fullscreen-btn')?.addEventListener('click', () => {
  toggleDungeonFullscreen(document.documentElement);
});
