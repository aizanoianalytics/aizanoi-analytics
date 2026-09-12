// js/scenes/MenuScene.js
// Antik Aizanoi Tapınak Temalı Ana Menü

import { createGlassButton } from '../utils/ui-helpers.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { LEVELS } from '../data/levels.js';
import { audioManager } from '../systems/AudioManager.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const { width, height } = this.cameras.main;
    if (typeof window !== 'undefined') window.__AIZANOI_DUNGEON_SCENE = 'MenuScene';

    // Web Audio ilk dokunusta acilmasi icin dinleyici
    this.input.once('pointerdown', () => {
      audioManager.ensureContext();
    });

    // Klavye ile baslatma (Enter/Space birincil aksiyonu tetikler)
    this._starting = false;
    this._primaryAction = null;
    this.input.keyboard?.on('keydown-ENTER', () => this._primaryAction?.());
    this.input.keyboard?.on('keydown-SPACE', () => this._primaryAction?.());

    // Kayitli ilerlemeyi kontrol et
    const tempProg = new ProgressionSystem();
    const savedChapter = tempProg.currentChapter || 1;

    // Arkaplan
    this.add.rectangle(width / 2, height / 2, width, height, 0x141822);

    // Hafif tapınak sütunları ve zemin ambiansı
    for (let x = 0; x < width; x += 64) {
      this.add.image(x, height / 2, 'tiles-floor', 0).setAlpha(0.2).setScale(2);
    }

    // Aizo Tanıtım Portresi (Merkezde)
    const aizoPortrait = this.add.sprite(width / 2, height / 2 - 130, 'aizo', 0)
      .setScale(3.5).setDepth(2);
    aizoPortrait.play('aizo-idle-down');

    // Başlık
    this.add.text(width / 2, height / 2 - 40, 'AIZANOI DUNGEON', {
      fontSize: '34px',
      color: '#f5d77f',
      fontStyle: 'bold',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      shadow: { blur: 12, color: '#c5a059', fill: true },
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 10, 'Aizo Awakens: Crypts of the Temple of Zeus', {
      fontSize: '14px',
      color: '#cbd5e1',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }).setOrigin(0.5);

    // Butonlar
    let btnStartY = height / 2 + 40;
    const btnSpacing = 48;

    if (savedChapter > 1 && savedChapter <= 10) {
      const continueAction = () => {
        this.scene.start('GameScene', { chapterIndex: savedChapter - 1, isEndless: false });
      };
      this._primaryAction = () => this._startOnce(continueAction);
      createGlassButton(this, width / 2, btnStartY, 260, 38, `Continue (Chapter ${savedChapter})`, () => this._startOnce(continueAction));
      btnStartY += btnSpacing;

      createGlassButton(this, width / 2, btnStartY, 260, 38, 'Restart Chapter 1 (keep gear)', () => this._startOnce(() => {
        this.scene.start('GameScene', { chapterIndex: 0, isEndless: false });
      }));
      btnStartY += btnSpacing;

      createGlassButton(this, width / 2, btnStartY, 260, 38, 'New run (wipe save)', () => {
        audioManager.playClick();
        if (window.confirm && window.confirm('This wipes progress and collected relics. Continue?')) {
          tempProg.reset();
          InventorySystem.clear();
          this.scene.restart();
        }
      });
      btnStartY += btnSpacing;
    } else {
      const storyAction = () => {
        this.scene.start('GameScene', { chapterIndex: 0, isEndless: false });
      };
      this._primaryAction = () => this._startOnce(storyAction);
      createGlassButton(this, width / 2, btnStartY, 260, 40, 'Story — 10 chapters', () => this._startOnce(storyAction));
      btnStartY += btnSpacing;
    }

    createGlassButton(this, width / 2, btnStartY, 260, 38, 'Endless Pantheon', () => this._startOnce(() => {
      this.scene.start('GameScene', { chapterIndex: LEVELS.length - 1, isEndless: true });
    }));
    btnStartY += btnSpacing;

    createGlassButton(this, width / 2, btnStartY, 260, 38, 'Controls & relics', () => {
      audioManager.playClick();
      this.showGuideModal();
    });

    // Alt Sürüm Bilgisi
    this.add.text(width / 2, height - 16, 'Aizanoi Analytics · v2.0 AAA Edition', {
      fontSize: '11px',
      color: '#64748b',
    }).setOrigin(0.5);
  }

  // Cift baslatma korumasi: ilk start eventinden sonra tekrarlari yoksay
  _startOnce(action) {
    if (this._starting) return;
    this._starting = true;
    audioManager.playClick();
    action();
  }

  showGuideModal() {
    const { width, height } = this.cameras.main;
    const modal = this.add.container(width / 2, height / 2).setDepth(100);

    const bg = this.add.rectangle(0, 0, 480, 320, 0xffffff, 0.94);
    bg.setStrokeStyle(3, 0xc5a059);

    const title = this.add.text(0, -125, 'CONTROLS', {
      fontSize: '16px', color: '#1e293b', fontStyle: 'bold',
    }).setOrigin(0.5);

    const bodyText = [
      '• MOVE: WASD or arrows (left stick on mobile)',
      '• ATTACK: Space / left click (red button on mobile). Auto-aim is on by default.',
      '• Q: Zeus Fissure Beam   R: Doric Aegis (3.5s immunity)',
      '• B: Recall to the altar   F: Fullscreen   E: Shop while in base',
      '• I / TAB: Inventory   M: Mute   P / ESC: Pause',
      '• Clear the floor, pick a blessing, take the portal.',
    ].join('\n\n');

    const desc = this.add.text(0, -15, bodyText, {
      fontSize: '12px', color: '#334155', lineSpacing: 4,
    }).setOrigin(0.5);

    const closeBtn = createGlassButton(this, 0, 125, 120, 32, 'Close', () => {
      modal.destroy();
    });

    modal.add([bg, title, desc, closeBtn]);
  }
}
