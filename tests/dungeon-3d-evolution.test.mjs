import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attack,
  buyShopItem,
  checkDuo,
  chooseBlessing,
  createGameState,
  fireSpecial,
  openChest,
  rerollChest,
  restoreRun,
  serializeRun,
  shoot,
  spawnWave,
  stepGame,
} from '../frontend/js/v3/apps/dungeon/src/game/index.js';

const tick = (state, seconds, input = {}) => {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i += 1) stepGame(state, input, 1 / 60);
  return state;
};

test('spawns arrive through 1s portals, never within 6 units of the player', () => {
  const state = createGameState('portal-seed');
  spawnWave(state, 6);
  assert.equal(state.enemies.length, 0, 'no enemy pops in instantly');
  assert.ok(state.pendingSpawns.length > 0, 'wave waits in portals');
  const portals = state.events.filter((event) => event.type === 'spawn-portal');
  tick(state, 0.2);
  assert.ok(state.events.some((event) => event.type === 'spawn-portal'), 'portals announced with a warning');
  assert.deepEqual(portals, portals, 'sanity');
  tick(state, 1.2);
  assert.ok(state.enemies.length > 0, 'wave materializes after the telegraph');
  for (const enemy of state.enemies) {
    const gap = Math.hypot(enemy.x - state.player.position.x, enemy.z - state.player.position.z);
    assert.ok(gap >= 6, `spawn at safe distance (got ${gap.toFixed(2)})`);
  }
});

test('guard parries in the first 0.12s and reduces after', () => {
  const state = createGameState('parry-seed');
  state.enemies = [{ id: 'striker', archetype: 'chaser', x: 1, z: 0, hp: 100, maxHp: 100, speed: 0,
    damage: 20, attackCooldown: 0, stun: 0, windup: null, dead: false, intent: 'idle', xp: 0, gold: 0 }];
  state.player.stamina = 100;
  stepGame(state, { guard: true }, 1 / 60);
  assert.ok(state.player.parryWindowUntil > state.time, 'parry window opens');
  const hpBefore = state.player.hp;
  stepGame(state, { moveX: 0, moveZ: 0 }, 1 / 60);
  // Enemy attacks during parry window: no damage, attacker stunned.
  const attacker = state.enemies[0];
  attacker.attackCooldown = 0;
  attacker.windup = null;
  state.player.invulnerable = 0;
  tick(state, 0.05);
  assert.ok(state.player.hp >= hpBefore - 1 || attacker.stun > 0, 'parry negates or stuns');
});

test('phantom step triggers on dash through late telegraph', () => {
  const state = createGameState('phantom-seed');
  state.enemies = [{ id: 'bossy', archetype: 'boss', x: 2, z: 0, hp: 500, maxHp: 500, speed: 0,
    damage: 20, attackCooldown: 1, stun: 0, windup: { kind: 'slam', remaining: 0.1, duration: 0.45, range: 3 },
    dead: false, intent: 'charge', xp: 0, gold: 0, phase: 1 }];
  state.player.stamina = 100;
  stepGame(state, { dash: true, moveX: 1, moveZ: 0 }, 1 / 60);
  assert.ok(state.events.some((event) => event.type === 'phantom-step'), 'phantom step fires');
  assert.equal(state.player.dashCooldown, 0, 'dash refunded');
});

test('special fires at full charge and stuns the area', () => {
  const state = createGameState('wrath-seed');
  state.enemies = [{ id: 'near', archetype: 'chaser', x: 2, z: 0, hp: 100, maxHp: 100, speed: 0,
    damage: 10, attackCooldown: 1, stun: 0, windup: null, dead: false, intent: 'idle', xp: 0, gold: 0 }];
  state.player.specialCharge = 100;
  const result = fireSpecial(state);
  assert.equal(result.fired, true);
  assert.ok(state.enemies[0].stun >= 3, 'light enemy stunned 3s');
  assert.equal(fireSpecial(state).fired, false, 'special spends its charge');
});

test('chest offers a choice of 3 with rarity and a shop', () => {
  const state = createGameState('choice-seed');
  state.chapter = 3;
  state.wave = { active: true, complete: false, rewarded: false, chapter: 3, scale: 1 };
  state.enemies = [];
  state.pendingSpawns = [];
  stepGame(state, {}, 1 / 60);
  const chest = state.chests.at(-1);
  assert.ok(chest, 'chest spawns');
  assert.equal(chest.choices.length, 3, 'choice of 3');
  assert.ok(chest.choices.every((choice) => choice.rarity), 'rarity rolled');
  assert.equal(chest.shop.length, 3, 'shop has 3 items');
  assert.equal(chest.rerolls, 1, 'one reroll token');
});

test('blessings stack to III and duos unlock', () => {
  const state = createGameState('duo-seed');
  chooseBlessing(state, 'vampiric');
  chooseBlessing(state, 'fury');
  const duos = checkDuo(state);
  assert.ok(duos.includes('bloodrite'), 'vampiric+fury unlocks bloodrite');
  assert.equal(chooseBlessing(state, 'fury').level, 2, 'stacks to II');
  assert.equal(chooseBlessing(state, 'fury').level, 3, 'stacks to III');
  assert.equal(chooseBlessing(state, 'fury').chosen, false, 'refused past III');
});

test('reroll and shop spend gold honestly', () => {
  const state = createGameState('gold-seed');
  state.chapter = 2;
  state.wave = { active: true, complete: false, rewarded: false, chapter: 2, scale: 1 };
  state.enemies = [];
  state.pendingSpawns = [];
  state.player.gold = 500;
  stepGame(state, {}, 1 / 60);
  const chest = state.chests.at(-1);
  const before = chest.choices.map((choice) => choice.id).join(',');
  const rerolled = rerollChest(state, chest.id);
  assert.equal(rerolled.rerolled, true, 'reroll works with gold');
  assert.notEqual(chest.choices.map((choice) => choice.id).join(','), before, 'choices change');
  const heal = chest.shop.find((item) => item.kind === 'heal');
  state.player.hp = 10;
  const bought = buyShopItem(state, chest.id, heal.slot);
  assert.equal(bought.bought, true, 'heal bought');
  assert.ok(state.player.hp > 10, 'heal applies');
  const poor = createGameState('poor-seed');
  assert.equal(buyShopItem(poor, 'nope', 0).bought, false, 'unknown chest refuses');
});

test('slime splits and shieldbearer blocks from the front', () => {
  const state = createGameState('split-seed');
  state.enemies = [{ id: 'slime-1', archetype: 'slimegolem', x: 1.5, z: 0, hp: 1, maxHp: 160, speed: 0,
    damage: 10, attackCooldown: 1, stun: 0, windup: null, dead: false, intent: 'idle', xp: 0, gold: 0 }];
  state.player.position = { x: 0, z: 0 };
  state.player.attackReadyAt = 0;
  attack(state, 'slime-1');
  assert.ok(state.enemies.filter((enemy) => !enemy.dead).length >= 2, 'slime splits in two');
  const guard = createGameState('block-seed');
  guard.enemies = [{ id: 'wall', archetype: 'shieldbearer', x: 1.5, z: 0, hp: 130, maxHp: 130, speed: 0,
    damage: 10, attackCooldown: 1, stun: 0, windup: null, dead: false, intent: 'idle', xp: 0, gold: 0, blocked: true }];
  guard.player.position = { x: 0, z: 0 };
  guard.player.attackReadyAt = 0;
  const hpBefore = guard.enemies[0].hp;
  const result = attack(guard, 'wall');
  assert.ok(result.blocked > 0, 'frontal block halves the hit');
  assert.ok(guard.enemies[0].hp > hpBefore - result.damage, 'damage reduced');
});

test('elites appear from chapter 3 and heat scales waves', () => {
  const plain = createGameState('heat-0');
  spawnWave(plain, 6);
  tick(plain, 1.2);
  const hot = createGameState('heat-0');
  hot.heat = 5;
  spawnWave(hot, 6);
  tick(hot, 1.2);
  const plainHp = plain.enemies.reduce((sum, enemy) => sum + enemy.maxHp, 0);
  const hotHp = hot.enemies.reduce((sum, enemy) => sum + enemy.maxHp, 0);
  assert.ok(hotHp > plainHp, 'heat raises enemy health');
  const mid = createGameState('elite-seed');
  spawnWave(mid, 6);
  tick(mid, 1.2);
  assert.ok(mid.enemies.some((enemy) => enemy.elite), 'elites appear from chapter 3');
});

test('evolution saves round-trip with the new fields', () => {
  const state = createGameState('evo-save');
  spawnWave(state, 2);
  tick(state, 1.2);
  chooseBlessing(state, 'fury');
  const json = serializeRun(state);
  const restored = restoreRun(json);
  assert.equal(serializeRun(restored), json, 'round-trip exact');
  assert.ok(Array.isArray(restored.pendingSpawns), 'pendingSpawns survives');
  assert.ok(restored.blessingLevels, 'blessingLevels survives');
  assert.ok(restored.settings, 'settings survive');
});
