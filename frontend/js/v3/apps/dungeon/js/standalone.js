import { launchDungeonGame } from './main.js';

const container = document.getElementById('game-container');
if (container) {
  launchDungeonGame(container).then(() => {
    console.log('[Aizanoi Dungeon] Standalone baslatildi.');
  }).catch(err => {
    console.error('[Aizanoi Dungeon] Baslatma hatasi:', err);
    container.replaceChildren();
    const errorBox = document.createElement('div');
    errorBox.className = 'aizanoi-dungeon-error';
    errorBox.setAttribute('role', 'alert');
    const title = document.createElement('strong');
    title.textContent = 'Aizanoi Dungeon baslatilamadi';
    const detail = document.createElement('p');
    detail.textContent = 'Oyun motoru yuklenemedi (Phaser calistirilamadi). Sayfayi yenilemeyi deneyin.';
    errorBox.append(title, detail);
    container.appendChild(errorBox);
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
