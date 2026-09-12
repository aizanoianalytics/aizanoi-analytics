// js/data/blessings.js
// Oda kutsamalari (roguelite run buff): yalnizca mevcut run gecerli,
// save'e yazilmaz. Sahne restartinda scene data ile tasinir.

export const BLESSINGS = [
  {
    id: 'hizli_saldiri',
    label: '+10% attack speed',
    apply(mods) { mods.attackSpeedMult = (mods.attackSpeedMult || 1) * 1.1; },
  },
  {
    id: 'mermer_beden',
    label: '+15 max HP',
    apply(mods) { mods.maxHpBonus = (mods.maxHpBonus || 0) + 15; },
  },
  {
    id: 'ruzgar_adim',
    label: '+8% move speed',
    apply(mods) { mods.moveSpeedMult = (mods.moveSpeedMult || 1) * 1.08; },
  },
  {
    id: 'kritik_ogreti',
    label: '+10% crit damage',
    apply(mods) { mods.critDmgMult = (mods.critDmgMult || 1) * 1.1; },
  },
  {
    id: 'penkalas_can',
    label: '+1 HP/s regen',
    apply(mods) { mods.regenBonus = (mods.regenBonus || 0) + 1; },
  },
  {
    id: 'savas_odagi',
    label: '+12% attack power',
    apply(mods) { mods.attackDmgMult = (mods.attackDmgMult || 1) * 1.12; },
  },
];

export function createRunState() {
  // Deliberately contains no save/storage reference: this object travels only
  // through Phaser scene restart data for the active run.
  return { blessingIds: [] };
}

export function selectBlessing(runState, blessingId) {
  if (!runState || !BLESSINGS.some((blessing) => blessing.id === blessingId)) return false;
  runState.blessingIds ||= [];
  if (runState.blessingIds.includes(blessingId)) return false;
  runState.blessingIds.push(blessingId);
  return true;
}

export function pickBlessings(count = 3, random = Math.random, excludedIds = []) {
  const pool = BLESSINGS.filter((blessing) => !excludedIds.includes(blessing.id));
  const picks = [];
  while (picks.length < count && pool.length > 0) {
    const i = Math.floor(random() * pool.length);
    picks.push(pool.splice(i, 1)[0]);
  }
  return picks;
}
