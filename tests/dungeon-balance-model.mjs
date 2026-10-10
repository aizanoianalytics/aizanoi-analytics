// Static balance model: replays CombatSystem + items + levels math headlessly.
// No Phaser needed — pure numbers from the same formulas the game uses.
import { AIZO_BASE_STATS, LEVEL_UP_BONUS, xpForLevel } from '../frontend/js/v3/apps/dungeon/js/constants.js';
import { WEAPONS, ARMORS, ACCESSORIES } from '../frontend/js/v3/apps/dungeon/js/data/items.js';
import { ENEMY_TYPES } from '../frontend/js/v3/apps/dungeon/js/data/enemies.js';
import { LEVELS } from '../frontend/js/v3/apps/dungeon/js/data/levels.js';
import { SKILL_TREE } from '../frontend/js/v3/apps/dungeon/js/data/skills.js';
import { BLESSINGS } from '../frontend/js/v3/apps/dungeon/js/data/blessings.js';

function playerStats(level, wpn, arm, accs, skills = []) {
  const s = { ...AIZO_BASE_STATS, lifesteal: 0 };
  s.hp += LEVEL_UP_BONUS.hp * (level - 1);
  s.attackDamage += LEVEL_UP_BONUS.attackDamage * (level - 1);
  s.armor += LEVEL_UP_BONUS.armor * (level - 1);
  const w = WEAPONS[wpn]; if (w) { s.attackDamage += w.stats.attackDamage; s.attackSpeed += w.stats.attackSpeed; s.attackRange = w.stats.attackRange; if (w.special?.lifestealBonus) s.lifesteal += w.special.lifestealBonus; }
  const a = ARMORS[arm]; if (a) { s.armor += a.stats.armor; s.hp += a.stats.hp; s.hpRegen += a.stats.hpRegen; if (a.special?.moveSpeedMultiplier) s.moveSpeed *= 1 + a.special.moveSpeedMultiplier; }
  for (const id of accs) { const ac = ACCESSORIES[id]; if (!ac) continue; s.attackDamage += ac.stats.attackDamage || 0; s.hp += ac.stats.hp || 0; s.hpRegen += ac.stats.hpRegen || 0; s.armor += ac.stats.armor || 0; s.critChance += ac.stats.critChance || 0; s.critMultiplier += ac.stats.critMultiplier || 0; s.lifesteal += ac.stats.lifesteal || 0; if (ac.stats.moveSpeedMultiplier) s.moveSpeed *= 1 + ac.stats.moveSpeedMultiplier; }
  const has = (id) => skills.includes(id);
  if (has('sharp_shards')) s.attackDamage = Math.round(s.attackDamage * 1.15);
  if (has('chiseled_skin')) s.armor = Math.round(s.armor * 1.25);
  if (has('penkalas_spring_regen')) s.hpRegen *= 1.5;
  if (has('wind_glide')) s.moveSpeed *= 1.16;
  if (has('eagles_gaze')) s.attackRange *= 1.32;
  return s;
}

function dmgAfterArmor(atk, armor) {
  const red = armor / (100 + armor);
  return Math.max(1, Math.round(atk * (1 - red)));
}

function enemyEffectiveHp(hp, armor, pen = 0) {
  const eff = armor * (1 - pen);
  return Math.round(hp / (1 - eff / (100 + eff)));
}

const rows = [];
console.log('=== PLAYER POWER BY GEAR TIER (level 1 = fresh start) ===');
const tiers = [
  ['fresh', 1, 'chiseled_marble', 'linen_tunic', []],
  ['ch1 bought', 2, 'doric_spear', 'linen_tunic', []],
  ['ch3 bought', 4, 'legion_gladius', 'leather_lorica', []],
  ['ch5 bought', 7, 'temple_hammer', 'bronze_squamata', ['scarab_amulet']],
  ['ch7 bought', 11, 'penkalas_bow', 'marble_plating', ['obsidian_eye_ring', 'scarab_amulet']],
  ['ch9 bought', 16, 'zeus_staff', 'oracle_robe', ['zeus_spark_amulet', 'laurel_wreath']],
  ['endgame', 25, 'zeus_splinter', 'sacred_aegis', ['zeus_spark_amulet', 'laurel_wreath']],
];
for (const [name, lv, w, a, accs] of tiers) {
  const st = playerStats(lv, w, a, accs);
  const wd = WEAPONS[w];
  const critAvg = st.attackDamage * (1 + st.critChance * (st.critMultiplier - 1));
  const perHit = critAvg * Math.max(0.6, st.attackSpeed);
  rows.push({ name, lv, hp: st.hp, dmg: st.attackDamage, crit: `${Math.round(st.critChance * 100)}%`, armor: st.armor, dps: +perHit.toFixed(1), range: st.attackRange, ranged: wd?.subtype === 'ranged' });
}
for (const r of rows) console.log(`  ${r.name.padEnd(12)} Lv${String(r.lv).padStart(2)} HP=${String(r.hp).padStart(4)} AD=${String(r.dmg).padStart(3)} crit=${r.crit.padStart(4)} armor=${String(r.armor).padStart(3)} DPS≈${String(r.dps).padStart(6)} range=${r.range}`);

console.log('\n=== ENEMY THREAT (per chapter scaling) ===');
const ENEMY_DENSITY = { low: 10, medium: 18, high: 26, very_high: 36 };
for (const lvl of LEVELS) {
  if (lvl.isEndless) continue;
  const types = lvl.enemies.types;
  let totalHp = 0, totalDps = 0, maxArmor = 0, names = [];
  for (const t of types) {
    const e = ENEMY_TYPES[t];
    totalHp += e.hp; totalDps += e.attackDamage / e.attackSpeed; maxArmor = Math.max(maxArmor, e.armor);
    names.push(`${e.name}(hp${e.hp}/armor${e.armor})`);
  }
  const count = ENEMY_DENSITY[lvl.enemies.density];
  const avgHp = totalHp / types.length, avgDps = totalDps / types.length;
  console.log(`  Ch${String(lvl.id).padStart(2)} n=${String(count).padStart(2)} avgHP=${avgHp.toFixed(0).padStart(4)} maxArmor=${String(maxArmor).padStart(3)} avgDPS=${avgDps.toFixed(1)} floorDPS≈${(avgDps * Math.min(count, 6)).toFixed(0).padStart(4)} boss=${ENEMY_TYPES[lvl.boss]?.name || '-'}`);
}

console.log('\n=== TIME-TO-KILL vs TIME-TO-DIE (ch1 fresh, ch10 endgame) ===');
function simulate(playerLv, w, a, accs, skills, chapterIdx, blessings = []) {
  const lvl = LEVELS[chapterIdx];
  const st = playerStats(playerLv, w, a, accs, skills);
  let blessingMods = { attackDmgMult: 1, attackSpeedMult: 1, maxHpBonus: 0 };
  for (const b of BLESSINGS) { if (blessings.includes(b.id)) b.apply(blessingMods); }
  const dmg = st.attackDamage * (blessingMods.attackDmgMult || 1);
  const atkSpd = Math.max(0.6, (st.attackSpeed) * (blessingMods.attackSpeedMult || 1));
  const hp = st.hp + (blessingMods.maxHpBonus || 0);
  const ENEMY_DENSITY = { low: 10, medium: 18, high: 26, very_high: 36 };
  const count = ENEMY_DENSITY[lvl.enemies.density];
  let ttks = [], ttd = [];
  for (const t of lvl.enemies.types) {
    const e = ENEMY_TYPES[t];
    const perHit = dmgAfterArmor(dmg, e.armor) * (1 + st.critChance * (st.critMultiplier - 1));
    ttks.push(enemyEffectiveHp(e.hp, e.armor) / (perHit * atkSpd));
    const toPlayer = dmgAfterArmor(e.attackDamage, st.armor);
    ttd.push(hp / (toPlayer / e.attackSpeed));
  }
  const avgTtks = ttks.reduce((x, y) => x + y, 0) / ttks.length;
  const avgTtd = ttd.reduce((x, y) => x + y, 0) / ttd.length;
  return { count, avgTtks: +avgTtks.toFixed(2), avgTtd: +avgTtd.toFixed(1), ratio: +(avgTtd / avgTtks).toFixed(1) };
}
console.log('  Ch1 fresh player:      ', JSON.stringify(simulate(1, 'chiseled_marble', 'linen_tunic', [], [], 0)));
console.log('  Ch4 mid gear (Lv5):    ', JSON.stringify(simulate(5, 'legion_gladius', 'leather_lorica', ['scarab_amulet'], [], 3)));
console.log('  Ch7 good gear (Lv10):  ', JSON.stringify(simulate(10, 'temple_hammer', 'bronze_squamata', ['obsidian_eye_ring'], ['sharp_shards','twin_sparks','chiseled_skin','wind_glide'], 6)));
console.log('  Ch10 endgame (Lv20):   ', JSON.stringify(simulate(20, 'zeus_staff', 'sacred_aegis', ['zeus_spark_amulet','laurel_wreath'], ['sharp_shards','twin_sparks','fissure_resonance','chiseled_skin','stone_reflection','sanctuary_aegis','wind_glide','denarii_seeker','eagles_gaze'], 9, ['savas_odagi','hizli_saldiri','mermer_beden','ruzgar_adim'])));
console.log('  Ch10 with 1 blessingL10:', JSON.stringify(simulate(10, 'legion_gladius', 'bronze_squamata', [], [], 9)));

console.log('\n=== XP CURVE vs XP AVAILABLE ===');
let cum = 0;
const levelCosts = [];
for (let l = 1; l <= 20; l++) { levelCosts.push(xpForLevel(l)); }
const totalToLv = (n) => levelCosts.slice(0, n - 1).reduce((a, b) => a + b, 0);
console.log('  XP needed: Lv2=%d Lv5=%d Lv10=%d Lv15=%d Lv20=%d', totalToLv(2), totalToLv(5), totalToLv(10), totalToLv(15), totalToLv(20));
let chapterXp = 0;
LEVELS.forEach((l) => {
  if (l.isEndless) return;
  const ENEMY_DENSITY = { low: 10, medium: 18, high: 26, very_high: 36 };
  const n = ENEMY_DENSITY[l.enemies.density];
  let xp = 0;
  for (const t of l.enemies.types) xp += ENEMY_TYPES[t].xpReward;
  const avg = xp / l.enemies.types.length;
  chapterXp += avg * n * 0.75; // 0.75 = typical clear rate
});
console.log('  XP from clearing ch1-10 (75%% of enemies): ~%d', Math.round(chapterXp));
console.log('  -> allows level ~%d if all farmed', (() => { let l = 1; while (totalToLv(l + 1) < chapterXp && l < 100) l++; return l; })());

console.log('\n=== GOLD ECONOMY ===');
const shopTiers = [
  ['ch1', 100, ['legion_gladius', 'bronze_squamata', 'scarab_amulet']],
  ['ch4', 400, ['temple_hammer', 'marble_plating', 'obsidian_eye_ring']],
  ['ch7', 650, ['zeus_staff', 'oracle_robe', 'zeus_spark_amulet']],
  ['ch10', 1500, ['zeus_splinter', 'sacred_aegis', 'laurel_wreath']],
];
let goldByChapter = 0;
LEVELS.forEach((l, i) => {
  if (l.isEndless) return;
  const ENEMY_DENSITY = { low: 10, medium: 18, high: 26, very_high: 36 };
  const n = ENEMY_DENSITY[l.enemies.density];
  let gold = 0;
  for (const t of l.enemies.types) gold += ENEMY_TYPES[t].goldReward;
  goldByChapter += (gold / l.enemies.types.length) * n * 0.75 + (l.goldBonus || 0);
  if ([0, 3, 6, 9].includes(i)) console.log(`  cum gold after Ch${l.id}: ~${Math.round(goldByChapter)}`);
});

console.log('\n=== BOSS MATH (they must be beatable but epic) ===');
for (const bid of ['marbleMinotaur', 'titanColossus']) {
  const b = ENEMY_TYPES[bid];
  const gear = bid === 'marbleMinotaur' ? [5, 'legion_gladius', 'leather_lorica', ['scarab_amulet'], []] : [20, 'zeus_splinter', 'sacred_aegis', ['zeus_spark_amulet', 'laurel_wreath'], ['sharp_shards', 'twin_sparks', 'fissure_resonance', 'chiseled_skin', 'stone_reflection', 'sanctuary_aegis', 'wind_glide', 'denarii_seeker', 'eagles_gaze']];
  const [lv, w, a, accs, sk] = gear;
  const st = playerStats(lv, w, a, accs, sk);
  const perHit = dmgAfterArmor(st.attackDamage, b.armor) * (1 + st.critChance * (st.critMultiplier - 1));
  const dps = perHit * Math.max(0.6, st.attackSpeed);
  const bDpsVsPlayer = dmgAfterArmor(b.attackDamage, st.armor) / b.attackSpeed;
  console.log(`  ${b.name}`);
  console.log(`    boss hp=${b.hp} armor=${b.armor} -> effective hp vs player: ${enemyEffectiveHp(b.hp, b.armor)}`);
  console.log(`    player dps≈${dps.toFixed(1)} -> TTK≈${(enemyEffectiveHp(b.hp, b.armor) / dps).toFixed(1)}s`);
  console.log(`    boss dps vs player≈${bDpsVsPlayer.toFixed(1)} -> TTD (no dodging)≈${(st.hp / bDpsVsPlayer).toFixed(0)}s`);
}
