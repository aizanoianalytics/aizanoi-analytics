import { ARCHETYPES } from './config.js';
import { random } from './rng.js';

export function scaledArchetype(archetype, chapter) {
  const base = ARCHETYPES[archetype];
  const endless = Math.max(0, chapter - 10);
  const scale = 1 + (chapter - 1) * 0.12 + endless * 0.08;
  return {
    hp: Math.round(base.hp * scale),
    speed: base.speed * Math.min(1.45, 1 + (chapter - 1) * 0.012),
    damage: Math.round(base.damage * (1 + (chapter - 1) * 0.1 + endless * 0.05)),
    xp: Math.round(base.xp * scale),
    gold: Math.round(base.gold * Math.sqrt(scale)),
    scale,
  };
}

export function makeEnemy(state, archetype, chapter, index) {
  const stats = scaledArchetype(archetype, chapter);
  const angle = random(state) * Math.PI * 2;
  const radius = 7 + random(state) * 8;
  return {
    id: `enemy-${state.nextId++}`,
    archetype,
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    hp: stats.hp,
    maxHp: stats.hp,
    speed: stats.speed,
    damage: stats.damage,
    xp: stats.xp,
    gold: stats.gold,
    attackCooldown: random(state) * 0.4,
    shootCooldown: archetype === 'archer' ? random(state) * 0.5 : 0,
    summonCooldown: archetype === 'summoner' ? 1.5 + random(state) : 0,
    stun: 0,
    windup: null,
    dead: false,
    intent: 'idle',
    phase: archetype === 'boss' ? 1 : undefined,
    spawnIndex: index,
  };
}

export function killEnemy(state, target) {
  if (target.dead) return;
  target.dead = true;
  target.hp = 0;
  state.player.xp += target.xp;
  state.player.gold += target.gold;
  // level handled by caller? keep here via player module? avoid import cycle: inline level check
  const player = state.player;
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
  state.loot.push({ id: `loot-${state.nextId++}`, kind: 'gold', amount: target.gold,
    x: target.x, z: target.z, collected: true });
  if (state.loot.length > 64) state.loot.splice(0, state.loot.length - 64);
  // emitEvent in index; push event here minimal
  if (!state.events) state.events = [];
  state.eventSeq = (state.eventSeq || 0) + 1;
  state.events.push({ type: 'enemy-death', id: target.id, at: state.time, seq: state.eventSeq });
  if (state.events.length > 128) state.events.splice(0, state.events.length - 128);
  if (state.stats) {
    state.stats.kills += 1;
    if (target.archetype === 'boss') state.stats.bossKills += 1;
  }
}

export { levelPlayer } from './player.js';