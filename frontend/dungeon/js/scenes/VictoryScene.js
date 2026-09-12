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

    this.add.text(width / 2, height / 2 - 25, 'THE TEMPLE OF ZEUS IS CLEANSED', {
      fontSize: '26px', color: '#f5d77f', fontStyle: 'bold',
      shadow: { blur: 16, color: '#c5a059', fill: true },
    }).setOrigin(0.5);

    const story = [
      'The Corrupted Titan Colossus is down.',
      'The shrine and the Penkalas waters are clear.',
      'Aizo stands as Aizanoi\'s keeper.',
    ].join('\n');

    this.add.text(width / 2, height / 2 + 30, story, {
      fontSize: '12px', color: '#cbd5e1', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5);

    // Butonlar
    createGlassButton(this, width / 2, height / 2 + 100, 260, 40, 'Enter the Endless Pantheon', () => {
      this.scene.start('GameScene', { chapterIndex: LEVELS.length - 1, isEndless: true });
    });

    createGlassButton(this, width / 2, height / 2 + 150, 260, 40, 'Main menu', () => {
      this.scene.start('MenuScene');
    });
  }
}
