// js/scenes/MenuScene.js
// Antik Aizanoi Tapınak Temalı Ana Menü

import { createGlassButton } from '../utils/ui-helpers.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { audioManager } from '../systems/AudioManager.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const { width, height } = this.cameras.main;

    // Web Audio ilk dokunusta acilmasi icin dinleyici
    this.input.once('pointerdown', () => {
      audioManager.ensureContext();
    });

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

    this.add.text(width / 2, height / 2 - 10, 'Aizo\'nun Uyanışı: Zeus Tapınağı Mahzenleri', {
      fontSize: '14px',
      color: '#cbd5e1',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }).setOrigin(0.5);

    // Butonlar
    let btnStartY = height / 2 + 40;
    const btnSpacing = 48;

    if (savedChapter > 1 && savedChapter <= 10) {
      createGlassButton(this, width / 2, btnStartY, 260, 38, `🏛️ Devam Et (Bölüm ${savedChapter})`, () => {
        audioManager.playClick();
        this.scene.start('GameScene', { chapterIndex: savedChapter - 1, isEndless: false });
      });
      btnStartY += btnSpacing;

      createGlassButton(this, width / 2, btnStartY, 260, 38, '⚔️ Yeni Hikaye (Bölüm 1)', () => {
        audioManager.playClick();
        this.scene.start('GameScene', { chapterIndex: 0, isEndless: false });
      });
      btnStartY += btnSpacing;
    } else {
      createGlassButton(this, width / 2, btnStartY, 260, 40, '🏛️ 10 Kutsal Bölüm (Hikaye)', () => {
        audioManager.playClick();
        this.scene.start('GameScene', { chapterIndex: 0, isEndless: false });
      });
      btnStartY += btnSpacing;
    }

    createGlassButton(this, width / 2, btnStartY, 260, 38, '⚡ Sonsuzluk Panteonu (Endless)', () => {
      audioManager.playClick();
      this.scene.start('GameScene', { chapterIndex: 10, isEndless: true });
    });
    btnStartY += btnSpacing;

    createGlassButton(this, width / 2, btnStartY, 260, 38, '📜 Kontroller & Yadigarlar', () => {
      audioManager.playClick();
      this.showGuideModal();
    });

    // Alt Sürüm Bilgisi
    this.add.text(width / 2, height - 16, 'Aizanoi Analytics · v2.0 AAA Edition', {
      fontSize: '11px',
      color: '#64748b',
    }).setOrigin(0.5);
  }

  showGuideModal() {
    const { width, height } = this.cameras.main;
    const modal = this.add.container(width / 2, height / 2).setDepth(100);

    const bg = this.add.rectangle(0, 0, 480, 320, 0xffffff, 0.94);
    bg.setStrokeStyle(3, 0xc5a059);

    const title = this.add.text(0, -125, '📜 KONTROLLER VE OYUN KILAVUZU', {
      fontSize: '16px', color: '#1e293b', fontStyle: 'bold',
    }).setOrigin(0.5);

    const bodyText = [
      '• HAREKET: WASD veya Yön Tuşları (Mobilde Sol Sanal Joystick)',
      '• SALDIRI: Boşluk veya Fare Sol Tık (Mobilde Büyük Kırmızı Buton)',
      '• Q TUŞU: Zeus Çatlağı Işını (Doğrusal delici yıldırım dalgası)',
      '• R TUŞU: Dorik Kalkan (Sanctuary Aegis — 3.5 sn dokunulmazlık)',
      '• I / TAB: Envanter ve Antik Yadigarlar',
      '• MABED: Zeus Sunağı alanında can yenilenir ve alışveriş açılır.',
    ].join('\n\n');

    const desc = this.add.text(0, -15, bodyText, {
      fontSize: '12px', color: '#334155', lineSpacing: 4,
    }).setOrigin(0.5);

    const closeBtn = createGlassButton(this, 0, 125, 120, 32, 'Kapat', () => {
      modal.destroy();
    });

    modal.add([bg, title, desc, closeBtn]);
  }
}
