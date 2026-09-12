// js/scenes/ShopScene.js
// Antik Macellum Tüccarı Alışveriş Overlay Sahnesi

import { createGlassButton } from '../utils/ui-helpers.js';
import { WEAPONS, ARMORS, ACCESSORIES, CONSUMABLES } from '../data/items.js';
import { SHOP_CATALOG } from '../data/shop-catalog.js';
import { audioManager } from '../systems/AudioManager.js';

export class ShopScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ShopScene' });
  }

  create() {
    const { width, height } = this.cameras.main;
    this.gameScene = this.scene.get('GameScene');
    if (this.gameScene) this.gameScene.scene.pause();

    // Panel
    const panel = this.add.rectangle(width / 2, height / 2, 560, 440, 0xffffff, 0.94)
      .setStrokeStyle(3, 0xc5a059);

    this.add.text(width / 2, height / 2 - 190, 'MACELLUM — SHOP', {
      fontSize: '18px', color: '#1e293b', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Kapat Butonu
    createGlassButton(this, width / 2 + 230, height / 2 - 190, 60, 28, '✕ Close', () => {
      audioManager.playClick();
      if (this.gameScene) this.gameScene.scene.resume();
      this.scene.stop();
    });

    // Satıştaki Eşyalar
    let startY = height / 2 - 140;
    const items = [
      WEAPONS[SHOP_CATALOG.weapons[1]],      // Gladius
      WEAPONS[SHOP_CATALOG.weapons[2]],      // Mabed Çekici
      WEAPONS[SHOP_CATALOG.weapons[4]],      // Penkalas Yayı
      ARMORS[SHOP_CATALOG.armors[1]],        // Bronz Squamata
      ACCESSORIES[SHOP_CATALOG.accessories[1]], // Scarab Amulet
      CONSUMABLES.apprentice_spark,          // Çırak Kıvılcımı (XP)
      CONSUMABLES.oracle_spark,              // Kahin Kıvılcımı (XP)
    ];

    items.forEach((item, i) => {
      if (!item) return;
      const y = startY + i * 44;
      const row = this.add.rectangle(width / 2, y, 520, 38, 0xf8fafc, 0.85)
        .setStrokeStyle(1, 0xc5a059);

      const typeIcon = item.type === 'weapon' ? '🗡️' : (item.type === 'armor' ? '🛡️' : (item.type === 'consumable' ? '⚡' : '💍'));

      this.add.text(width / 2 - 240, y - 8, `${typeIcon} ${item.name}`, {
        fontSize: '12px', color: '#1e293b', fontStyle: 'bold',
      });
      this.add.text(width / 2 - 240, y + 7, item.description, {
        fontSize: '10px', color: '#64748b',
      });

      // Kuşanılma durumu ve Takas Fiyatı Kontrolü
      const isEquipped = (
        (item.type === 'weapon' && this.gameScene.inventory.equipped.weapon === item.id) ||
        (item.type === 'armor' && this.gameScene.inventory.equipped.armor === item.id) ||
        (item.type === 'accessory' && this.gameScene.inventory.equipped.accessories.includes(item.id))
      );

      let btnLabel = `${item.price} 🪙 Buy`;
      if (isEquipped) {
        btnLabel = '✓ Equipped';
      }

      // Satın Al Butonu
      createGlassButton(this, width / 2 + 200, y, 95, 26, btnLabel, () => {
        if (isEquipped) {
          this.gameScene.createFloatingText(this.gameScene.player.x, this.gameScene.player.y - 40, 'Already equipped', '#f39c12');
          return;
        }

        if (this.gameScene.progression.spendGold(item.price)) {
          audioManager.playCoin();
          if (item.type === 'consumable') {
            const res = this.gameScene.progression.addXp(item.xpReward);
            this.gameScene.createFloatingText(this.gameScene.player.x, this.gameScene.player.y - 40, `+${item.xpReward} Sparks`, '#a569bd');
            if (res.leveledUp) audioManager.playLevelUp();
          } else {
            const refund = this.gameScene.inventory.equip(item);
            let msg = `${item.name} equipped`;
            if (refund > 0) msg += ` (+${refund} 🪙 refund)`;
            this.gameScene.createFloatingText(this.gameScene.player.x, this.gameScene.player.y - 40, msg, '#27ae60');
          }
          if (this.gameScene) this.gameScene.scene.resume();
          this.scene.stop();
        } else {
          this.gameScene.createFloatingText(this.gameScene.player.x, this.gameScene.player.y - 40, 'Yetersiz Denarii!', '#e74c3c');
        }
      });
    });
  }
}
