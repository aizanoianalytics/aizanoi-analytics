import { launchDungeonGame } from './main.js';

const container = document.getElementById('game-container');
if (container) {
  launchDungeonGame(container).then(() => {
    console.log('[Aizanoi Dungeon] Standalone baslatildi.');
  }).catch(err => {
    console.error('[Aizanoi Dungeon] Baslatma hatasi:', err);
  });
}

// Orientation checker for mobile
function checkOrientation() {
  const warning = document.getElementById('orientation-warning');
  if (!warning) return;
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
