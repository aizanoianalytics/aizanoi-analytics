// Elite modifiers are transient spawn-time state. Bosses are always excluded.

export const ELITE_AFFIXES = [
  { id: 'swift', label: 'Swift', color: 0x67e8f9 },
  { id: 'armored', label: 'Armored', color: 0x94a3b8 },
  { id: 'vampiric', label: 'Vampiric', color: 0xef4444 },
  { id: 'volatile', label: 'Volatile', color: 0xfb923c },
  { id: 'stormtouched', label: 'Stormtouched', color: 0xa78bfa },
];

export function chooseEliteAffix(typeConfig, random = Math.random, chance = 0.1) {
  if (typeConfig?.isBoss || typeConfig?.isMiniBoss || typeConfig?.isFinalBoss || random() >= chance) return null;
  return ELITE_AFFIXES[Math.floor(random() * ELITE_AFFIXES.length)].id;
}

// Pure so spawn rules can be tested without Phaser.
export function applyEliteAffix(stats, affixId) {
  const result = { ...stats, eliteAffix: affixId };
  if (affixId === 'swift') result.moveSpeed = Math.round(result.moveSpeed * 1.25);
  if (affixId === 'armored') result.armor += 30;
  if (affixId === 'vampiric') result.vampiricRate = 0.2;
  if (affixId === 'volatile') result.volatileDamage = 12;
  if (affixId === 'stormtouched') result.stormInterval = 2200;
  return result;
}
