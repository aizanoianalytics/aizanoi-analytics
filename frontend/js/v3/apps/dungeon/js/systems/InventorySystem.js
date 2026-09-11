// js/systems/InventorySystem.js
// Antik Yadigarlar Envanter Yönetimi ve Stat Birleştirici

import { WEAPONS, ARMORS, ACCESSORIES } from '../data/items.js';
import { AIZO_BASE_STATS, LEVEL_UP_BONUS } from '../constants.js';

export class InventorySystem {
  constructor(progressionSystem) {
    this.progression = progressionSystem;
    this.equipped = {
      weapon: 'chiseled_marble',
      armor: 'linen_tunic',
      accessories: [null, null],
    };
    this.load();
  }

  equip(item) {
    let refundGold = 0;
    if (item.type === 'weapon') {
      const oldId = this.equipped.weapon;
      if (oldId && WEAPONS[oldId] && WEAPONS[oldId].sellPrice > 0) {
        refundGold += WEAPONS[oldId].sellPrice;
      }
      this.equipped.weapon = item.id;
    } else if (item.type === 'armor') {
      const oldId = this.equipped.armor;
      if (oldId && ARMORS[oldId] && ARMORS[oldId].sellPrice > 0) {
        refundGold += ARMORS[oldId].sellPrice;
      }
      this.equipped.armor = item.id;
    } else if (item.type === 'accessory') {
      // Boş slot varsa oraya koy, yoksa ilk slotu değiştir ve eskisini sat
      const emptyIdx = this.equipped.accessories.indexOf(null);
      if (emptyIdx !== -1) {
        this.equipped.accessories[emptyIdx] = item.id;
      } else {
        const oldId = this.equipped.accessories[0];
        if (oldId && ACCESSORIES[oldId] && ACCESSORIES[oldId].sellPrice > 0) {
          refundGold += ACCESSORIES[oldId].sellPrice;
        }
        this.equipped.accessories[0] = item.id;
      }
    }

    if (refundGold > 0) {
      this.progression.addGold(refundGold);
    }
    this.save();
    return refundGold;
  }

  getCalculatedStats() {
    const stats = { ...AIZO_BASE_STATS };
    const level = this.progression.level;

    // Seviye bonusları
    stats.hp += LEVEL_UP_BONUS.hp * (level - 1);
    stats.attackDamage += LEVEL_UP_BONUS.attackDamage * (level - 1);
    stats.armor += LEVEL_UP_BONUS.armor * (level - 1);

    // Silah katkısı
    const weapon = WEAPONS[this.equipped.weapon];
    if (weapon) {
      stats.attackDamage += weapon.stats.attackDamage || 0;
      stats.attackSpeed += weapon.stats.attackSpeed || 0;
      stats.attackRange = weapon.stats.attackRange || stats.attackRange;
      if (weapon.special?.lifestealBonus) stats.lifesteal += weapon.special.lifestealBonus;
    }

    // Zırh katkısı
    const armor = ARMORS[this.equipped.armor];
    if (armor) {
      stats.armor += armor.stats.armor || 0;
      stats.hp += armor.stats.hp || 0;
      stats.hpRegen += armor.stats.hpRegen || 0;
      if (armor.special?.moveSpeedMultiplier) {
        stats.moveSpeed *= (1 + armor.special.moveSpeedMultiplier);
      }
    }

    // Aksesuarlar katkısı
    for (const accId of this.equipped.accessories) {
      if (!accId) continue;
      const acc = ACCESSORIES[accId];
      if (!acc) continue;
      stats.attackDamage += acc.stats.attackDamage || 0;
      stats.hp += acc.stats.hp || 0;
      stats.hpRegen += acc.stats.hpRegen || 0;
      stats.armor += acc.stats.armor || 0;
      stats.critChance += acc.stats.critChance || 0;
      stats.critMultiplier += acc.stats.critMultiplier || 0;
      stats.lifesteal += acc.stats.lifesteal || 0;
      if (acc.stats.moveSpeedMultiplier) {
        stats.moveSpeed *= (1 + acc.stats.moveSpeedMultiplier);
      }
    }

    // Yetenek çarpanları (SkillTree)
    if (this.progression.unlockedSkills.has('sharp_shards')) {
      stats.attackDamage = Math.round(stats.attackDamage * 1.15);
    }
    if (this.progression.unlockedSkills.has('chiseled_skin')) {
      stats.armor = Math.round(stats.armor * 1.25);
    }
    if (this.progression.unlockedSkills.has('penkalas_spring_regen')) {
      stats.hpRegen *= 1.5;
    }
    if (this.progression.unlockedSkills.has('wind_glide')) {
      stats.moveSpeed *= 1.16;
    }
    if (this.progression.unlockedSkills.has('eagles_gaze')) {
      stats.attackRange *= 1.32;
    }

    return stats;
  }

  save() {
    try {
      localStorage.setItem('aizanoi_inventory_v1', JSON.stringify(this.equipped));
    } catch (e) {}
  }

  load() {
    try {
      const raw = localStorage.getItem('aizanoi_inventory_v1');
      if (raw) this.equipped = Object.assign(this.equipped, JSON.parse(raw));
    } catch (e) {}
  }
}
