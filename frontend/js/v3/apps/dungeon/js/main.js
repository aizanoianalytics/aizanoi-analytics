// js/main.js
// Aizanoi Dungeon — Phaser 3 Konfigürasyonu ve Çift-Çalışma Başlatıcısı

import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { SkillTreeScene } from './scenes/SkillTreeScene.js';
import { InventoryScene } from './scenes/InventoryScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { VictoryScene } from './scenes/VictoryScene.js';

/**
 * Phaser 3 Oyun Kurulum Konfigürasyonu
 */
export function createGameConfig(container) {
  return {
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
      activePointers: 3, // Çoklu dokunmatik (joystick + saldırı + menü)
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
}

/**
 * Oyunu başlatan fonksiyon (Hem standalone hem AizanoiOS mount contract)
 * @param {HTMLElement} container - Canvas'ın bağlanacağı DOM elemanı
 * @returns {Promise<Phaser.Game>}
 */
export async function launchDungeonGame(container) {
  // Phaser global yüklenmiş mi kontrolü
  if (typeof Phaser === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/phaser.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Phaser CDN yüklenemedi.'));
      document.head.appendChild(script);
    });
  }

  const config = createGameConfig(container);
  const game = new Phaser.Game(config);
  return game;
}

/**
 * Pencere kapatıldığında çağrılan temizlik fonksiyonu (Teardown)
 * @param {Phaser.Game} gameInstance
 */
export function stopDungeonGame(gameInstance) {
  if (gameInstance) {
    gameInstance.destroy(true);
    console.log('[Aizanoi Dungeon] Phaser instance başarıyla imha edildi.');
  }
}
