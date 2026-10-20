// js/standalone.js — standalone /dungeon/ page entry for Aizanoi Dungeon 3D.
// Mounts the AizanoiOS module entry into #game-container outside the shell.
import { mount } from '../src/index.js';

const container = document.getElementById('game-container');
if (container) {
  mount({
    container,
    api: {
      closeApp: () => {
        // No shell to return to: go back if possible, else the homepage.
        if (window.history.length > 1) window.history.back();
        else window.location.href = '/';
      },
    },
  }).then((teardown) => {
    window.addEventListener('pagehide', () => {
      try { teardown?.(); } catch (_) {}
    });
    console.log('[Aizanoi Dungeon] Standalone 3D started.');
  }).catch((err) => {
    console.error('[Aizanoi Dungeon] Start failed:', err);
    container.replaceChildren();
    const errorBox = document.createElement('div');
    errorBox.className = 'aizanoi-dungeon-error';
    errorBox.setAttribute('role', 'alert');
    const title = document.createElement('strong');
    title.textContent = 'Aizanoi Dungeon 3D could not start';
    const detail = document.createElement('p');
    detail.textContent = 'The 3D engine (Three.js) failed to load. Refresh the page or update your browser.';
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

document.getElementById('fullscreen-btn')?.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (_) {}
});
