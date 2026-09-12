// js/main.js
// Aizanoi Dungeon — Phaser 3 Konfigürasyonu ve Çift-Çalışma Başlatıcısı

async function ensurePhaser() {
  if (typeof Phaser !== 'undefined') return window.Phaser;

  // Tek yukleme denemesi: vendored Phaser. Hata olursa reject — cagiran
  // (mount/standalone) gorunur hata UI basar. Duplicate fallback yok:
  // ayni URL'ye ikinci deneme anlamsizdi.
  return new Promise((resolve, reject) => {
    let script = document.querySelector('script[data-phaser]');
    if (!script) {
      script = document.createElement('script');
      script.dataset.phaser = 'true';
      script.src = '/vendor/phaser.min.js';
      document.head.appendChild(script);
    }
    if (typeof Phaser !== 'undefined') {
      resolve(window.Phaser); return;
    }
    script.addEventListener('load', () => {
      if (typeof Phaser !== 'undefined') resolve(window.Phaser);
      else reject(new Error('Phaser runtime could not be loaded from local vendor.'));
    });
    script.addEventListener('error', () => {
      reject(new Error('Phaser runtime could not be loaded from local vendor.'));
    });
  });
}

/**
 * Oyunu başlatan fonksiyon (Hem standalone hem AizanoiOS mount contract)
 * @param {HTMLElement} container - Canvas'ın bağlanacağı DOM elemanı
 * @returns {Promise<Phaser.Game>}
 */
export async function launchDungeonGame(container) {
  await ensurePhaser();

  const [
    { BootScene },
    { MenuScene },
    { GameScene },
    { UIScene },
    { ShopScene },
    { SkillTreeScene },
    { InventoryScene },
    { GameOverScene },
    { VictoryScene }
  ] = await Promise.all([
    import('./scenes/BootScene.js'),
    import('./scenes/MenuScene.js'),
    import('./scenes/GameScene.js'),
    import('./scenes/UIScene.js'),
    import('./scenes/ShopScene.js'),
    import('./scenes/SkillTreeScene.js'),
    import('./scenes/InventoryScene.js'),
    import('./scenes/GameOverScene.js'),
    import('./scenes/VictoryScene.js'),
  ]);

  const config = {
    type: Phaser.AUTO,
    width: 960,
    height: 640,
    parent: container,
    backgroundColor: '#0b0d13',
    pixelArt: true,
    antialias: false,
    disableContextMenu: true,
    scale: {
      mode: (Phaser.Scale && Phaser.Scale.EXPAND) ? Phaser.Scale.EXPAND : Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      fullscreenTarget: container,
      min: { width: 320, height: 240 },
      max: { width: 2560, height: 1600 },
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false,
      },
    },
    input: {
      activePointers: 3,
    },
    scene: [
      BootScene,
      MenuScene,
      GameScene,
      UIScene,
      ShopScene,
      SkillTreeScene,
      InventoryScene,
      GameOverScene,
      VictoryScene,
    ],
  };

  const game = new Phaser.Game(config);
  return game;
}

/**
 * Oyunu güvenli bir şekilde kapatıp kaynakları serbest bırakan fonksiyon
 * @param {Phaser.Game} gameInstance
 */
export function stopDungeonGame(gameInstance) {
  if (gameInstance) {
    try {
      gameInstance.destroy(true);
    } catch (err) {
      console.warn('[Aizanoi Dungeon] Error destroying game instance:', err);
    }
  }
  setDungeonExitHandler(null);
}

// AizanoiOS shell exit plumbing: the host sets a handler at mount so the
// in-game Return control and the ESC exit menu can close the fullscreen
// surface without a reload. Standalone has no handler.
let dungeonExitHandler = null;

export function setDungeonExitHandler(fn) {
  dungeonExitHandler = typeof fn === 'function' ? fn : null;
}

export function hasDungeonExitHandler() {
  return dungeonExitHandler !== null;
}

export function requestDungeonExit() {
  try {
    dungeonExitHandler?.();
  } catch (_) {}
}
