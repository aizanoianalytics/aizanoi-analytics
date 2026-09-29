// js/systems/ProgressionSystem.js
// Zeus Kıvılcımı (XP), Seviye, Denarii ve Sonsuzluk Dalga Skoru

import { xpForLevel, LEVEL_UP_BONUS } from '../constants.js';
import { SKILL_TREE } from '../data/skills.js';

const STORAGE_KEY = 'aizanoi_dungeon_save_v2';
const LEGACY_STORAGE_KEY = 'aizanoi_dungeon_save_v1';

const KNOWN_SKILL_IDS = new Set(
  [SKILL_TREE.offense, SKILL_TREE.defense, SKILL_TREE.utility]
    .flatMap((branch) => branch.skills.map((skill) => skill.id))
);

const MAX_STAT_VALUE = 1000000000;
const MAX_WAVE_VALUE = 9999;

function toClampedInt(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

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
    this.recordRunXp(amount);
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
    this.recordRunGold(total);
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
    this.recordRunKill(isBoss);
    this.stats.enemiesKilled++;
    if (isBoss) this.stats.bossesDefeated++;
    this.save();
  }

  /**
   * Per-run tracking. The brief asks for a useful run/chapter summary, and the
   * statistics were already being recorded — they were simply never surfaced.
   * A run starts when a chapter sequence begins and ends at victory or death, so
   * the summary answers "how did this run go", not "how does my save look".
   */
  startRun() {
    this.run = {
      startedAtChapter: this.currentChapter,
      chaptersCleared: 0,
      enemiesKilled: 0,
      bossesDefeated: 0,
      denariiEarned: 0,
      xpEarned: 0,
      levelAtStart: this.level,
      deepestChapter: this.currentChapter
    };
    return this.run;
  }

  /** Fold a kill into the run, so the summary matches the run not the save. */
  recordRunKill(isBoss = false) {
    if (!this.run) this.startRun();
    this.run.enemiesKilled++;
    if (isBoss) this.run.bossesDefeated++;
  }

  recordRunXp(amount) {
    if (!this.run) this.startRun();
    this.run.xpEarned += Math.max(0, Math.round(amount));
  }

  recordRunGold(amount) {
    if (!this.run) this.startRun();
    this.run.denariiEarned += Math.max(0, Math.round(amount));
  }

  recordChapterCleared(chapterNumber) {
    if (!this.run) this.startRun();
    this.run.chaptersCleared = Math.max(this.run.chaptersCleared, chapterNumber);
    this.run.deepestChapter = Math.max(this.run.deepestChapter, chapterNumber + 1);
  }

  /**
   * The summary, shaped for display. Every number comes from a tracked field, so
   * a figure on this screen can always be traced back to something that happened.
   */
  runSummary() {
    const run = this.run || { chaptersCleared: 0, enemiesKilled: 0, bossesDefeated: 0, denariiEarned: 0, xpEarned: 0, levelAtStart: this.level, deepestChapter: this.currentChapter };
    const levelsGained = this.level - (run.levelAtStart ?? this.level);
    return {
      deepestChapter: run.deepestChapter,
      chaptersCleared: run.chaptersCleared,
      enemiesKilled: run.enemiesKilled,
      bossesDefeated: run.bossesDefeated,
      denariiEarned: run.denariiEarned,
      xpEarned: run.xpEarned,
      levelNow: this.level,
      levelsGained: Math.max(0, levelsGained),
      denariiLeft: this.gold,
      lifetimeKills: this.stats.enemiesKilled,
      lifetimeBosses: this.stats.bossesDefeated
    };
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
      let raw = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch (_) {
        raw = null;
      }
      if (!raw) {
        // Lossless v1 → v2 migration: adopt the legacy save once, then move it.
        let legacyRaw = null;
        try {
          legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
        } catch (_) {
          legacyRaw = null;
        }
        if (!legacyRaw) return;
        raw = legacyRaw;
        this.applySaveData(JSON.parse(raw));
        this.save();
        try {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch (_) {}
        return;
      }
      const data = JSON.parse(raw);
      this.applySaveData(data);
    } catch (e) {
      console.warn('[ProgressionSystem] LocalStorage okuma hatası, varsayilana donuldu:', e);
      this.reset();
    }
  }

  applySaveData(data) {
    if (!data || typeof data !== 'object') return;
    this.level = Math.max(1, Math.min(100, Number(data.level) || 1));
    this.currentXp = Math.max(0, Number(data.currentXp) || 0);
    this.nextXp = xpForLevel(this.level);
    if (this.currentXp >= this.nextXp) this.currentXp = 0;
    this.gold = Math.max(0, Number(data.gold) || 0);
    const ids = Array.isArray(data.unlockedSkills) ? data.unlockedSkills : [];
    this.unlockedSkills = new Set(ids.filter((id) => KNOWN_SKILL_IDS.has(id)));
    this.highestWave = toClampedInt(data.highestWave, 1, 1, MAX_WAVE_VALUE);
    this.currentChapter = toClampedInt(data.currentChapter, 1, 1, 10);
    const rawStats = (data.stats && typeof data.stats === 'object') ? data.stats : {};
    this.stats = {
      enemiesKilled: toClampedInt(rawStats.enemiesKilled, 0, 0, MAX_STAT_VALUE),
      bossesDefeated: toClampedInt(rawStats.bossesDefeated, 0, 0, MAX_STAT_VALUE),
      totalGoldCollected: toClampedInt(rawStats.totalGoldCollected, 0, 0, MAX_STAT_VALUE),
    };
  }

  reset() {
    this.level = 1;
    this.currentXp = 0;
    this.nextXp = xpForLevel(1);
    this.gold = 0;
    this.unlockedSkills = new Set();
    this.highestWave = 1;
    this.currentChapter = 1;
    this.stats = {
      enemiesKilled: 0,
      bossesDefeated: 0,
      totalGoldCollected: 0,
    };
    this.save();
  }
}
