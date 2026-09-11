// js/scenes/GameOverScene.js
// Aizo Heykel Uykusu ve Yeniden Doğuş Sahnesi

import { createGlassButton } from '../utils/ui-helpers.js';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data) {
    this.chapterIndex = data.chapterIndex || 0;
    this.isEndless = data.isEndless || false;
    this.wave = data.wave || 1;
  }

  create() {
    const { width, height } = this.cameras.main;

    this.add.rectangle(width / 2, height / 2, width, height, 0x0b0d13, 0.95);

    // Uyuyan Taş Aizo
    const aizoStatue = this.add.sprite(width / 2, height / 2 - 100, 'aizo', 52).setScale(3.5);

    this.add.text(width / 2, height / 2 - 20, 'MERMER HEYKEL UYKUSU', {
      fontSize: '24px', color: '#94a3b8', fontStyle: 'bold',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }).setOrigin(0.5);

    const desc = this.isEndless
      ? `Sonsuzluk Panteonu'nda ${this.wave}. dalgaya kadar direndin.`
      : `Alnındaki Zeus kıvılcımı söndü, tapınak mahzeninde derin bir uykuya daldın.`;

    this.add.text(width / 2, height / 2 + 15, desc, {
      fontSize: '13px', color: '#cbd5e1',
    }).setOrigin(0.5);

    // Butonlar
    createGlassButton(this, width / 2, height / 2 + 75, 220, 38, '⚡ Sunağında Uyan (Devam)', () => {
      this.scene.start('GameScene', {
        chapterIndex: this.chapterIndex,
        isEndless: this.isEndless,
        wave: this.wave,
      });
    });

    createGlassButton(this, width / 2, height / 2 + 125, 220, 38, '🏛️ Ana Menüye Dön', () => {
      this.scene.start('MenuScene');
    });
  }
}
