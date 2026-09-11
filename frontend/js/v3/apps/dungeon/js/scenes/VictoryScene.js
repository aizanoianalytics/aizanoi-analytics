// js/scenes/VictoryScene.js
// Zeus Tapınağı Arındırıldı Zafer Sahnesi

import { createGlassButton } from '../utils/ui-helpers.js';
import { LEVELS } from '../data/levels.js';

export class VictoryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'VictoryScene' });
  }

  create() {
    const { width, height } = this.cameras.main;

    this.add.rectangle(width / 2, height / 2, width, height, 0x141824, 0.95);

    // Zafer Kutlaması Yapan Aizo (Defne Tacı açmış)
    const aizoHero = this.add.sprite(width / 2, height / 2 - 110, 'aizo', 60).setScale(4);
    aizoHero.play('aizo-victory');

    this.add.text(width / 2, height / 2 - 25, 'ZEUS TAPINAĞI ARINDIRILDI!', {
      fontSize: '26px', color: '#f5d77f', fontStyle: 'bold',
      shadow: { blur: 16, color: '#c5a059', fill: true },
    }).setOrigin(0.5);

    const story = [
      'Bozulmuş Titan Colossus alt edildi!',
      'Zeus\'un kadim mabedi ve Penkalas suları karanlık yozlaşmadan temizlendi.',
      'Aizo, Aizanoi\'nin ebedi koruyucusu olarak tarihe altın harflerle yazıldı.',
    ].join('\n');

    this.add.text(width / 2, height / 2 + 30, story, {
      fontSize: '12px', color: '#cbd5e1', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5);

    // Butonlar
    createGlassButton(this, width / 2, height / 2 + 100, 260, 40, '⚡ Sonsuzluk Panteonuna Gir', () => {
      this.scene.start('GameScene', { chapterIndex: LEVELS.length - 1, isEndless: true });
    });

    createGlassButton(this, width / 2, height / 2 + 150, 260, 40, '🏛️ Ana Menü', () => {
      this.scene.start('MenuScene');
    });
  }
}
