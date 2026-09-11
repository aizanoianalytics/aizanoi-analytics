// js/main.js
// Aizanoi Dungeon — Phaser 3 Konfigürasyonu ve Çift-Çalışma Başlatıcısı

async function ensurePhaser() {
  if (typeof Phaser !== 'undefined') return window.Phaser;

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
    script.addEventListener('load', () => resolve(window.Phaser));
    script.addEventListener('error', () => {
      // Fallback relative vendor path
      const fallback = document.createElement('script');
      fallback.src = new URL('../../../../../vendor/phaser.min.js', import.meta.url).href;
      fallback.onload = () => resolve(window.Phaser);
      fallback.onerror = (err) => reject(new Error('Phaser runtime could not be loaded from local vendor.'));
      document.head.appendChild(fallback);
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
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      min: { width: 480, height: 320 },
      max: { width: 1920, height: 1280 },
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
}
