// js/scenes/InventoryScene.js
// Aizo'nun Yadigarlar Sandığı ve İstatistik Özeti

import { createGlassButton } from '../utils/ui-helpers.js';
import { WEAPONS, ARMORS, ACCESSORIES } from '../data/items.js';

export class InventoryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'InventoryScene' });
  }

  create() {
    const { width, height } = this.cameras.main;
    this.gameScene = this.scene.get('GameScene');

    // Panel
    const panel = this.add.rectangle(width / 2, height / 2, 560, 420, 0xffffff, 0.94)
      .setStrokeStyle(3, 0xc5a059);

    this.add.text(width / 2, height / 2 - 180, '📦 AIZO\'NUN YADİGARLARI VE STATLARI', {
      fontSize: '18px', color: '#1e293b', fontStyle: 'bold',
    }).setOrigin(0.5);

    createGlassButton(this, width / 2 + 230, height / 2 - 180, 60, 28, '✕ Kapat', () => {
      this.scene.stop();
    });

    const inv = this.gameScene.inventory;
    const stats = inv.getCalculatedStats();

    // 1. Sol Taraf: Kuşanılan Eşyalar
    const leftX = width / 2 - 140;
    let startY = height / 2 - 120;

    const wItem = WEAPONS[inv.equipped.weapon];
    const aItem = ARMORS[inv.equipped.armor];
    const acc1 = ACCESSORIES[inv.equipped.accessories[0]];
    const acc2 = ACCESSORIES[inv.equipped.accessories[1]];

    this.renderEquipSlot(leftX, startY, '🗡️ SİLAH', wItem ? wItem.name : 'Yok', wItem ? `+${wItem.stats.attackDamage} AD` : '');
    this.renderEquipSlot(leftX, startY + 60, '🛡️ ZIRH', aItem ? aItem.name : 'Yok', aItem ? `+${aItem.stats.armor} Zırh` : '');
    this.renderEquipSlot(leftX, startY + 120, '💍 TILSIM 1', acc1 ? acc1.name : 'Boş', acc1 ? acc1.description : '');
    this.renderEquipSlot(leftX, startY + 180, '💍 TILSIM 2', acc2 ? acc2.name : 'Boş', acc2 ? acc2.description : '');

    // 2. Sağ Taraf: Toplam İstatistikler
    const rightX = width / 2 + 130;
    const statBox = this.add.rectangle(rightX, height / 2 - 30, 220, 240, 0xf8fafc, 0.9)
      .setStrokeStyle(1.5, 0xc5a059);

    this.add.text(rightX, height / 2 - 130, '📊 AIZO STATLARI', {
      fontSize: '13px', color: '#1e293b', fontStyle: 'bold',
    }).setOrigin(0.5);

    const statRows = [
      `Seviye: ${this.gameScene.progression.level}`,
      `Azami Can: ${stats.hp}`,
      `Can Yenileme: ${stats.hpRegen.toFixed(1)}/sn`,
      `Saldırı Gücü: ${stats.attackDamage}`,
      `Saldırı Hızı: ${stats.attackSpeed.toFixed(1)}/sn`,
      `Mermer Zırhı: ${stats.armor}`,
      `Kritik Şansı: %${Math.round(stats.critChance * 100)}`,
      `Hareket Hızı: ${Math.round(stats.moveSpeed)}`,
    ];

    statRows.forEach((row, idx) => {
      this.add.text(rightX - 90, height / 2 - 100 + idx * 22, row, {
        fontSize: '11px', color: '#334155', fontStyle: 'bold',
      });
    });

    // Hızlı Geçiş Butonları (Alt)
    createGlassButton(this, width / 2 - 80, height / 2 + 175, 140, 32, '⚡ Yetenekler', () => {
      this.scene.stop();
      this.scene.launch('SkillTreeScene');
    });

    createGlassButton(this, width / 2 + 80, height / 2 + 175, 140, 32, '🏪 Macellum', () => {
      this.scene.stop();
      this.scene.launch('ShopScene');
    });
  }

  renderEquipSlot(x, y, label, title, subtitle) {
    this.add.rectangle(x, y, 230, 48, 0xf1f5f9, 0.85).setStrokeStyle(1, 0xc5a059);
    this.add.text(x - 105, y - 14, label, { fontSize: '9px', color: '#64748b', fontStyle: 'bold' });
    this.add.text(x - 105, y - 1, title, { fontSize: '11px', color: '#1e293b', fontStyle: 'bold' });
    this.add.text(x - 105, y + 12, subtitle, { fontSize: '9px', color: '#27ae60' });
  }
}
