// js/scenes/UIScene.js
// AizanoiOS Uyumlu HUD Overlay Sahnesi

import { drawStatBar } from '../utils/ui-helpers.js';
import { audioManager } from '../systems/AudioManager.js';

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  init(data) {
    this.gameScene = data.gameScene;
  }

  create() {
    const { width } = this.cameras.main;

    // 1. Üst Sol: Aizo Profil Kartı & Barlar
    const hudBox = this.add.rectangle(125, 42, 230, 68, 0xffffff, 0.88)
      .setStrokeStyle(2, 0xc5a059).setScrollFactor(0);

    this.add.sprite(36, 42, 'aizo', 0).setScale(1.4);

    this.levelBadge = this.add.text(36, 64, 'Lv.1', {
      fontSize: '10px', color: '#1e293b', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Can ve XP Bar Grafikleri
    this.hpGraphics = this.add.graphics().setScrollFactor(0);
    this.xpGraphics = this.add.graphics().setScrollFactor(0);

    this.hpText = this.add.text(75, 24, 'CAN: 120/120', {
      fontSize: '10px', color: '#1e293b', fontStyle: 'bold',
    });

    this.xpText = this.add.text(75, 46, 'KIVILCIM: 0/50', {
      fontSize: '10px', color: '#64748b', fontStyle: 'bold',
    });

    // 2. Üst Merkez: Bölüm / Dalga Bilgisi
    const chapterName = this.gameScene.isEndless
      ? `⚡ Sonsuzluk Panteonu (Dalga ${this.gameScene.endlessWave})`
      : this.gameScene.currentLevelConfig.name;

    this.chapterText = this.add.text(width / 2, 22, chapterName, {
      fontSize: '13px',
      color: '#c5a059',
      fontStyle: 'bold',
      backgroundColor: 'rgba(255,255,255,0.9)',
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setStroke('#c5a059', 1);

    // 3. Üst Sağ: Denarii Sayacı & Ses Butonu
    const goldBox = this.add.rectangle(width - 110, 32, 130, 36, 0xffffff, 0.88)
      .setStrokeStyle(2, 0xc5a059);

    this.add.image(width - 160, 32, 'coin-icon').setScale(1.3);
    this.goldText = this.add.text(width - 142, 25, '0', {
      fontSize: '14px', color: '#1e293b', fontStyle: 'bold',
    });

    const soundBox = this.add.rectangle(width - 25, 32, 34, 34, 0xffffff, 0.88)
      .setStrokeStyle(2, 0xc5a059).setInteractive({ useHandCursor: true });
    this.soundIcon = this.add.text(width - 25, 32, audioManager.isMuted ? '🔇' : '🔊', {
      fontSize: '15px',
    }).setOrigin(0.5);

    soundBox.on('pointerdown', () => {
      const isMuted = audioManager.toggleMute();
      this.soundIcon.setText(isMuted ? '🔇' : '🔊');
    });

    // 4. Alt Merkez: Yetenek Kısayolları (Q & R Cooldowns)
    this.createAbilityBar();

    // 5. Mini-Harita Çerçevesi (Sağ Alt)
    this.minimapBg = this.add.rectangle(width - 65, this.cameras.main.height - 65, 100, 100, 0x141822, 0.85)
      .setStrokeStyle(1.5, 0xc5a059);
    this.minimapPlayerDot = this.add.circle(width - 65, this.cameras.main.height - 65, 3, 0x00d2ff);
  }

  createAbilityBar() {
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height - 35;

    // Q Butonu Çerçevesi
    this.qBox = this.add.rectangle(cx - 30, cy, 48, 48, 0xffffff, 0.85).setStrokeStyle(2, 0xc5a059);
    this.add.text(cx - 30, cy - 8, 'Q', { fontSize: '13px', color: '#1e293b', fontStyle: 'bold' }).setOrigin(0.5);
    this.qCdText = this.add.text(cx - 30, cy + 10, 'HAZIR', { fontSize: '9px', color: '#27ae60', fontStyle: 'bold' }).setOrigin(0.5);

    // R Butonu Çerçevesi
    this.rBox = this.add.rectangle(cx + 30, cy, 48, 48, 0xffffff, 0.85).setStrokeStyle(2, 0xc5a059);
    this.add.text(cx + 30, cy - 8, 'R', { fontSize: '13px', color: '#1e293b', fontStyle: 'bold' }).setOrigin(0.5);
    this.rCdText = this.add.text(cx + 30, cy + 10, 'HAZIR', { fontSize: '9px', color: '#27ae60', fontStyle: 'bold' }).setOrigin(0.5);
  }

  update() {
    if (!this.gameScene || !this.gameScene.player) return;
    const player = this.gameScene.player;
    const prog = this.gameScene.progression;

    // Can Barı
    drawStatBar(this.hpGraphics, 75, 35, 140, 9, player.hp, player.maxHp, 0x27ae60);
    this.hpText.setText(`CAN: ${Math.max(0, Math.round(player.hp))}/${player.maxHp}`);

    // XP Barı
    drawStatBar(this.xpGraphics, 75, 57, 140, 6, prog.currentXp, prog.nextXp, 0xa569bd);
    this.xpText.setText(`KIVILCIM: ${prog.currentXp}/${prog.nextXp}`);
    this.levelBadge.setText(`Lv.${prog.level}`);

    // Denarii
    this.goldText.setText(`${prog.gold}`);

    // Q & R Cooldowns
    if (player.skill1Cooldown > 0) {
      this.qCdText.setText(`${Math.ceil(player.skill1Cooldown / 1000)}s`).setColor('#e74c3c');
    } else {
      this.qCdText.setText('HAZIR').setColor('#27ae60');
    }

    if (player.skill2Cooldown > 0) {
      this.rCdText.setText(`${Math.ceil(player.skill2Cooldown / 1000)}s`).setColor('#e74c3c');
    } else {
      this.rCdText.setText('HAZIR').setColor('#27ae60');
    }

    // Mini-harita oyuncu pozisyonu
    if (this.gameScene.mapData) {
      const mapW = this.gameScene.mapData.width * 32;
      const mapH = this.gameScene.mapData.height * 32;
      const nx = player.x / mapW;
      const ny = player.y / mapH;
      const mx = (this.cameras.main.width - 65) - 45 + (nx * 90);
      const my = (this.cameras.main.height - 65) - 45 + (ny * 90);
      this.minimapPlayerDot.setPosition(mx, my);
    }
  }
}
