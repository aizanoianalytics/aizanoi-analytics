import { ARCHETYPES } from './config.js';

export function createPlayer() {
  return {
    position: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    xp: 0,
    xpToNext: 50,
    level: 1,
    gold: 0,
    combo: 0,
    comboExpires: 0,
    attackReadyAt: 0,
    dashCooldown: 0,
    dashCooldownMax: 1.2,
    dashRemaining: 0,
    dashDirection: { x: 1, z: 0 },
    bowReadyAt: 0,
    invulnerable: 0,
    damageMultiplier: 1,
    speedMultiplier: 1,
    attackSpeedMultiplier: 1,
    critChance: 0.05,
    critMultiplier: 1.6,
    damageTakenMultiplier: 1,
    lifesteal: 0,
    bowRangeMultiplier: 1,
    bowStaminaMultiplier: 1,
    dead: false,
    focusCharge: 0,
    rhythmWindow: 0,
  };
}

export function levelPlayer(player) {
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = Math.round(player.xpToNext * 1.35);
    player.maxHp += 12;
    player.hp = Math.min(player.maxHp, player.hp + 20);
    player.maxStamina += 5;
    player.stamina = player.maxStamina;
    player.damageMultiplier += 0.05;
  }
}

export function damagePlayer(state, amount, source) {
  const player = state.player;
  if (player.dead || player.invulnerable > 0) return false;
  const taken = Math.max(1, Math.round(amount * player.damageTakenMultiplier));
  player.hp = Math.max(0, player.hp - taken);
  player.invulnerable = 0.45;
  if (state.stats) state.stats.damageTaken += taken;
  return true;
}