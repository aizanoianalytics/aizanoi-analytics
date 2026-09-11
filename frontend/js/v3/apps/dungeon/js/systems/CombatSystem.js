// js/systems/CombatSystem.js
// Hasar hesaplamaları, zırh absorbsiyonu, kritik, can çalma ve şimşek arkları

import { WEAPONS } from '../data/items.js';

export class CombatSystem {
  /**
   * Zırh absorbsiyonu formülü:
   * reduction = targetArmor / (100 + targetArmor)
   */
  static calculateDamage(attackDamage, targetArmor, armorPenetration = 0) {
    const effectiveArmor = Math.max(0, targetArmor * (1 - armorPenetration));
    const reduction = effectiveArmor / (100 + effectiveArmor);
    const damage = attackDamage * (1 - reduction);
    return Math.max(1, Math.round(damage));
  }

  /**
   * Tam saldiri cozunurlugu. baseDamageOverride verilirse (ranged projectile
   * gibi) saldirganin ham attackDamage degeri yerine o kullanilir; tum diger
   * kurallar (zirh delme, crit, yetenekler, lifesteal) aynidir. Boylece
   * projectile collision yalnizca farkli bir delivery mechanism olur.
   */
  static processAttack(attacker, target, baseDamageOverride = null, meta = {}) {
    const weaponData = attacker.inventory ? WEAPONS[attacker.inventory.equipped.weapon] : attacker.weapon;
    const armorPen = weaponData?.special?.armorPenetration || 0;
    const targetArmor = target.stats?.armor ?? target.armor ?? 0;
    const rawBase = baseDamageOverride ?? attacker.stats.attackDamage;
    let baseDamage = this.calculateDamage(rawBase, targetArmor, armorPen);
    const damageType = meta.damageType || 'physical';

    // Kritik kontrolü
    let isCritical = false;
    if (Math.random() < (attacker.stats.critChance || 0)) {
      baseDamage = Math.round(baseDamage * (attacker.stats.critMultiplier || 1.5));
      isCritical = true;
    }

    // Yetenek: Çatlak Rezonansı (her 5. vuruş 2.2x)
    if (attacker.hasSkill && attacker.hasSkill('fissure_resonance')) {
      attacker.hitCounter = (attacker.hitCounter || 0) + 1;
      if (attacker.hitCounter % 5 === 0) {
        baseDamage = Math.round(baseDamage * 2.2);
        isCritical = true;
      }
    }

    // Yapılara karşı hasar çarpanı (Örn: Mabed Çekici)
    if (target.isStructure && weaponData?.special?.structureDamageMultiplier) {
      baseDamage = Math.round(baseDamage * weaponData.special.structureDamageMultiplier);
    }

    // Yetenek: İlahi İnfaz (%18 HP altındaki düşman tek vuruşta infaz)
    if (attacker.hasSkill && attacker.hasSkill('divine_execution') && !target.isBoss) {
      if ((target.hp / target.maxHp) <= 0.18) {
        baseDamage = target.hp;
        isCritical = true;
      }
    }

    // Hasarı hedefe ver
    target.takeDamage(baseDamage, isCritical, attacker, damageType);

    // Can çalma (Lifesteal)
    // attacker.stats.lifesteal already includes weapon lifestealBonus via InventorySystem
    const lifestealRate = attacker.stats.lifesteal || 0;
    if (lifestealRate > 0 && attacker.heal) {
      const healAmount = Math.max(1, Math.round(baseDamage * lifestealRate));
      attacker.heal(healAmount);
    }

    // Elite: vampiric enemies recover from damage dealt; this stays separate
    // from player lifesteal so no inventory or save state is affected.
    if (attacker.vampiricRate > 0 && attacker.heal) {
      attacker.heal(Math.max(1, Math.round(baseDamage * attacker.vampiricRate)));
    }

    // Taş Rezonansı Yansıtma (Savunma dalı yeteneği)
    if (target.hasSkill && target.hasSkill('stone_reflection') && attacker.takeDamage) {
      const reflected = Math.max(1, Math.round(baseDamage * 0.14));
      attacker.takeDamage(reflected, false, target);
    }

    return {
      damage: baseDamage,
      isCritical,
      targetKilled: target.hp <= 0,
    };
  }
}
