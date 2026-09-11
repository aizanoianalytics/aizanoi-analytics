// js/systems/ProgressionSystem.js
// Zeus Kıvılcımı (XP), Seviye, Denarii ve Sonsuzluk Dalga Skoru

import { xpForLevel, LEVEL_UP_BONUS } from '../constants.js';

const STORAGE_KEY = 'aizanoi_dungeon_save_v1';

export class ProgressionSystem {
  constructor() {
    this.level = 1;
    this.currentXp = 0;
    this.nextXp = xpForLevel(1);
    this.gold = 0; // Denarii
    this.unlockedSkills = new Set();
    this.highestWave = 1;
    this.currentChapter = 1;
    this.stats = {
      enemiesKilled: 0,
      bossesDefeated: 0,
      totalGoldCollected: 0,
    };

    this.load();
  }

  addXp(amount) {
    this.currentXp += amount;
    let leveledUp = false;

    while (this.currentXp >= this.nextXp) {
      this.currentXp -= this.nextXp;
      this.level++;
      this.nextXp = xpForLevel(this.level);
      leveledUp = true;
    }

    this.save();
    return { leveledUp, newLevel: this.level };
  }

  addGold(amount) {
    const total = Math.max(0, Math.round(amount));
    this.gold += total;
    this.stats.totalGoldCollected += total;
    this.save();
    return this.gold;
  }

  spendGold(amount) {
    if (this.gold >= amount) {
      this.gold -= amount;
      this.save();
      return true;
    }
    return false;
  }

  recordKill(isBoss = false) {
    this.stats.enemiesKilled++;
    if (isBoss) this.stats.bossesDefeated++;
    this.save();
  }

  recordWave(waveNumber) {
    if (waveNumber > this.highestWave) {
      this.highestWave = waveNumber;
      this.save();
    }
  }

  save() {
    try {
      const data = {
        level: this.level,
        currentXp: this.currentXp,
        gold: this.gold,
        unlockedSkills: Array.from(this.unlockedSkills),
        highestWave: this.highestWave,
        currentChapter: this.currentChapter,
        stats: this.stats,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[ProgressionSystem] LocalStorage yazma hatası:', e);
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.level = data.level || 1;
      this.currentXp = data.currentXp || 0;
      this.nextXp = xpForLevel(this.level);
      this.gold = data.gold || 0;
      this.unlockedSkills = new Set(data.unlockedSkills || []);
      this.highestWave = data.highestWave || 1;
      this.currentChapter = data.currentChapter || 1;
      this.stats = Object.assign(this.stats, data.stats || {});
    } catch (e) {
      console.warn('[ProgressionSystem] LocalStorage okuma hatası:', e);
    }
  }
}
