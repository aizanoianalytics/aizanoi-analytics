// js/scenes/UIScene.js
// Dark-glass HUD: HP, objective, LoL-style bar, live minimap

import { drawStatBar } from '../utils/ui-helpers.js';
import { audioManager } from '../systems/AudioManager.js';
import { loadSettings } from '../systems/SettingsSystem.js';

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  init(data) {
    this.gameScene = data.gameScene;
  }

  create() {
    const { width, height } = this.cameras.main;
    const glass = 0x0f1624;

    this.add.rectangle(128, 44, 236, 72, glass, 0.82).setStrokeStyle(1, 0xc5a059);
    this.add.sprite(36, 42, 'aizo', 0).setScale(1.35);
    this.levelBadge = this.add.text(36, 64, 'Lv.1', {
      fontSize: '10px', color: '#f5d77f', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.hpGraphics = this.add.graphics();
    this.xpGraphics = this.add.graphics();
    this.hpText = this.add.text(74, 22, 'HP: 120/120', { fontSize: '11px', color: '#e8eef8', fontStyle: 'bold' });
    this.xpText = this.add.text(74, 46, 'SPARK: 0/50', { fontSize: '10px', color: '#b7c0d0', fontStyle: 'bold' });

    this.chapterText = this.add.text(width / 2, 18, '', {
      fontSize: '13px', color: '#f5d77f', fontStyle: 'bold',
      backgroundColor: '#0f1624cc', padding: { x: 12, y: 5 },
    }).setOrigin(0.5);

    this.objectiveText = this.add.text(width / 2, 42, '', {
      fontSize: '11px', color: '#d1d5db',
      backgroundColor: '#0f1624aa', padding: { x: 10, y: 3 },
    }).setOrigin(0.5);

    this.add.rectangle(width - 118, 28, 150, 36, glass, 0.82).setStrokeStyle(1, 0xc5a059);
    this.add.image(width - 178, 28, 'coin-icon').setScale(1.2);
    this.goldText = this.add.text(width - 160, 20, '0', { fontSize: '14px', color: '#f5d77f', fontStyle: 'bold' });

    const soundBox = this.add.rectangle(width - 28, 28, 32, 32, glass, 0.82)
      .setStrokeStyle(1, 0xc5a059).setInteractive({ useHandCursor: true });
    this.soundIcon = this.add.text(width - 28, 28, audioManager.isMuted ? '🔇' : '🔊', { fontSize: '14px' }).setOrigin(0.5);
    soundBox.on('pointerdown', () => {
      this.soundIcon.setText(audioManager.toggleMute() ? '🔇' : '🔊');
    });

    this.createAbilityBar();

    this.minimapEnabled = loadSettings().showMinimap !== false;
    this.minimapContainer = this.add.container(width - 68, height - 68).setVisible(this.minimapEnabled);
    this.minimapGfx = this.add.graphics();
    this.minimapBg = this.add.rectangle(0, 0, 112, 112, 0x0b1220, 0.88).setStrokeStyle(1.5, 0xc5a059);
    this.minimapHint = this.add.text(0, -60, 'MAP', {
      fontSize: '9px', color: '#9aa8be',
    }).setOrigin(0.5);
    this.minimapContainer.add([this.minimapGfx, this.minimapBg, this.minimapHint]);

    this.hintText = this.add.text(width / 2, height - 78, '', {
      fontSize: '11px', color: '#f8fafc',
      backgroundColor: '#141822cc', padding: { x: 8, y: 3 },
    }).setOrigin(0.5);
  }

  createAbilityBar() {
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height - 34;
    this.abilitySlots = {};
    const defs = [
      { key: 'q', label: 'Q', x: cx - 78, name: 'Beam' },
      { key: 'r', label: 'R', x: cx - 26, name: 'Aegis' },
      { key: 'b', label: 'B', x: cx + 26, name: 'Recall' },
      { key: 'e', label: 'E', x: cx + 78, name: 'Shop' },
    ];
    defs.forEach((def) => {
      const box = this.add.rectangle(def.x, cy, 46, 46, 0x0f1624, 0.9).setStrokeStyle(2, 0xc5a059);
      this.add.text(def.x, cy - 8, def.label, { fontSize: '13px', color: '#f5d77f', fontStyle: 'bold' }).setOrigin(0.5);
      const cd = this.add.text(def.x, cy + 10, 'RDY', { fontSize: '9px', color: '#3dcea8', fontStyle: 'bold' }).setOrigin(0.5);
      this.abilitySlots[def.key] = { box, cd };
    });
  }

  setSlot(key, ready, seconds) {
    const slot = this.abilitySlots[key];
    if (!slot) return;
    if (ready) {
      slot.cd.setText('RDY').setColor('#3dcea8');
      slot.box.setStrokeStyle(2, 0xc5a059);
    } else {
      slot.cd.setText(`${seconds}s`).setColor('#f07186');
      slot.box.setStrokeStyle(2, 0x5a3a48);
    }
  }

  update() {
    if (!this.gameScene || !this.gameScene.player) return;
    const gs = this.gameScene;
    const player = gs.player;
    const prog = gs.progression;
    const { width, height } = this.cameras.main;

    const hpColor = player.hp / player.maxHp <= 0.25 ? 0xe74c3c : 0x27ae60;
    drawStatBar(this.hpGraphics, 74, 34, 148, 9, player.hp, player.maxHp, hpColor);
    drawStatBar(this.xpGraphics, 74, 56, 148, 6, prog.currentXp, prog.nextXp, 0xa569bd);
    this.hpText.setText(`HP: ${Math.max(0, Math.round(player.hp))}/${player.maxHp}`);
    this.xpText.setText(`SPARK: ${prog.currentXp}/${prog.nextXp}`);
    this.levelBadge.setText(`Lv.${prog.level}`);
    this.goldText.setText(`${prog.gold}`);

    const chapterName = gs.isEndless
      ? `Endless Pantheon — Wave ${gs.endlessWave}`
      : gs.currentLevelConfig.name;
    this.chapterText.setText(chapterName);

    const remaining = gs.enemies
      ? gs.enemies.getChildren().filter((e) => e.active && e.hp > 0).length
      : 0;
    const ready = remaining === 0;
    this.objectiveText.setText(ready ? 'Portal open — walk in' : `Clear the floor · ${remaining} left`);
    this.objectiveText.setColor(ready ? '#3dcea8' : '#d1d5db');

    this.setSlot('q', player.skill1Cooldown <= 0, Math.ceil((player.skill1Cooldown || 0) / 1000));
    this.setSlot('r', player.skill2Cooldown <= 0, Math.ceil((player.skill2Cooldown || 0) / 1000));
    this.setSlot('b', !(gs.recallChannel > 0), Math.ceil((gs.recallChannel || 0) / 1000));
    this.setSlot('e', Boolean(player.isInBase), player.isInBase ? 0 : 1);
    if (player.isInBase) this.abilitySlots.e.cd.setText('OPEN').setColor('#3dcea8');
    else this.abilitySlots.e.cd.setText('BASE').setColor('#9aa8be');

    this.hintText.setText(player.isInBase ? 'E Shop   I Relics   P Pause' : '');

    if (!this.minimapEnabled) return;
    this.minimapGfx.clear();
    if (!gs.mapData) return;
    const mapW = gs.mapData.width * 32;
    const mapH = gs.mapData.height * 32;
    const ox = -50;
    const oy = -50;
    const scaleX = 100 / mapW;
    const scaleY = 100 / mapH;
    const plot = (x, y, color, r = 2) => {
      this.minimapGfx.fillStyle(color, 1);
      this.minimapGfx.fillCircle(ox + x * scaleX, oy + y * scaleY, r);
    };
    plot(gs.baseAltar?.x || 0, gs.baseAltar?.y || 0, 0xf5d77f, 3);
    plot(gs.exitPortal?.x || 0, gs.exitPortal?.y || 0, ready ? 0x00d2ff : 0x64748b, 3);
    gs.enemies?.getChildren().forEach((enemy) => {
      if (enemy.active && enemy.hp > 0) plot(enemy.x, enemy.y, enemy.isBoss ? 0xf39c12 : 0xe74c3c, enemy.isBoss ? 3 : 1.6);
    });
    plot(player.x, player.y, 0x7ea0ff, 3);
  }
}
