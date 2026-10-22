// The 3D dungeon replaced a 2D game whose player had a bow (Phrygian /
// Penkalas bows). The 3D build shipped with melee only, so the ranged half
// of the combat kit was simply gone. These tests pin the bow's contract:
// it costs stamina, it needs a target, it travels as a real projectile, and
// the arrow actually damages the enemy it was aimed at.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState, spawnWave, shoot, stepGame, chooseBlessing,
  serializeRun, restoreRun,
} from '../frontend/js/v3/apps/dungeon/src/game/index.js';

const placeEnemy = (state, id, x, z, hp = 100, gold = 0) => {
  const enemy = {
    id, archetype: 'chaser', x, z, hp, maxHp: hp, speed: 0, damage: 0,
    xp: 0, gold, attackCooldown: 99, shootCooldown: 99, summonCooldown: 99,
    stun: 0, windup: null, dead: false, intent: 'idle',
  };
  state.enemies.push(enemy);
  return enemy;
};

test('the bow fires at a living enemy and spends stamina', () => {
  const state = createGameState('bow-test');
  const enemy = placeEnemy(state, 'e1', 0, 5);
  state.player.facing = { x: 0, z: 1 };
  const staminaBefore = state.player.stamina;

  const result = shoot(state);

  assert.equal(result.fired, true, 'the bow must fire when a target is in reach');
  assert.equal(result.targetId, 'e1');
  assert.ok(state.player.stamina < staminaBefore, 'the bow must cost stamina');
  assert.equal(state.projectiles.length, 1, 'the shot must exist as a real projectile');
  assert.equal(state.projectiles[0].source, 'player');
  assert.equal(state.projectiles[0].ownerId, 'e1');
});

test('the bow refuses to fire without a target, a reason is truthful', () => {
  const state = createGameState('bow-empty');
  const result = shoot(state);
  assert.equal(result.fired, false);
  assert.equal(result.reason, 'no-target');
  assert.equal(state.projectiles.length, 0, 'no shot may be created without a target');
});

test('the bow refuses to fire while on cooldown', () => {
  const state = createGameState('bow-cooldown');
  placeEnemy(state, 'e1', 0, 4);
  state.player.facing = { x: 0, z: 1 };
  assert.equal(shoot(state).fired, true);
  const second = shoot(state);
  assert.equal(second.fired, false);
  assert.equal(second.reason, 'cooldown');
});

test('the bow refuses to fire without the stamina to draw it', () => {
  const state = createGameState('bow-stamina');
  placeEnemy(state, 'e1', 0, 4);
  state.player.stamina = 3;
  const result = shoot(state);
  assert.equal(result.fired, false);
  assert.equal(result.reason, 'stamina');
  assert.equal(state.projectiles.length, 0);
});

test('a flying arrow damages the enemy it was aimed at', () => {
  const state = createGameState('bow-damage');
  const enemy = placeEnemy(state, 'e1', 0, 6, 100);
  state.player.facing = { x: 0, z: 1 };
  shoot(state);
  const hpBefore = enemy.hp;

  // Advance the simulation so the arrow actually travels and lands.
  for (let i = 0; i < 40; i += 1) stepGame(state, {}, 1 / 60);

  assert.ok(enemy.hp < hpBefore, `the arrow must damage the target (${hpBefore} -> ${enemy.hp})`);
  assert.equal(enemy.dead, false, 'a 22-damage arrow must not kill a 100 hp enemy');
});

test('an arrow kills a weak enemy and pays out the reward', () => {
  const state = createGameState('bow-kill');
  const enemy = placeEnemy(state, 'e1', 0, 4, 10, 25);
  state.player.facing = { x: 0, z: 1 };
  const goldBefore = state.player.gold;
  shoot(state);
  for (let i = 0; i < 40; i += 1) stepGame(state, {}, 1 / 60);
  assert.equal(enemy.dead, true, 'a lethal arrow must kill its target');
  assert.ok(state.player.gold > goldBefore, 'a kill must pay out gold');
});

test('the bow prefers an enemy in front of the player', () => {
  const state = createGameState('bow-aim');
  // An enemy behind the player, a nearer one ahead.
  placeEnemy(state, 'behind', 0, -4);
  const ahead = placeEnemy(state, 'ahead', 0, 7);
  state.player.facing = { x: 0, z: 1 };
  const result = shoot(state);
  assert.equal(result.targetId, 'ahead', 'the bow must prefer the target the player faces');
});

test('the bow cannot reach a target beyond its range', () => {
  const state = createGameState('bow-range');
  placeEnemy(state, 'far', 0, 40);
  state.player.facing = { x: 0, z: 1 };
  const result = shoot(state);
  assert.equal(result.fired, false);
  assert.equal(result.reason, 'no-target');
});

test('enemy shots still hit the player, not the enemy they were fired at', () => {
  const state = createGameState('enemy-shot');
  const enemy = placeEnemy(state, 'archer', 0, 6);
  const hpBefore = state.player.hp;
  // Fired from in front of the player and travelling toward the player.
  state.projectiles.push({
    id: 'projectile-1', ownerId: 'archer', source: 'enemy',
    x: 0, z: 3, vx: 0, vz: -8, damage: 12, ttl: 3, radius: 0.32,
  });
  for (let i = 0; i < 20; i += 1) stepGame(state, {}, 1 / 60);
  assert.ok(state.player.hp < hpBefore, 'an enemy shot must damage the player');
  assert.equal(enemy.hp, enemy.maxHp, 'an enemy shot must not damage its own owner');
});

test('the run state round-trips through save and restore with the bow latch', () => {
  const state = createGameState('bow-save');
  placeEnemy(state, 'e1', 0, 5);
  state.player.facing = { x: 0, z: 1 };
  shoot(state);
  const restored = restoreRun(serializeRun(state));
  assert.equal(restored.player.bowReadyAt, state.player.bowReadyAt);
  assert.equal(restored.inputLatch.shoot, false);
  assert.equal(restored.projectiles.length, 1);
});

test('the bow is wired into the fixed-step input, not only the direct call', () => {
  const state = createGameState('bow-input');
  placeEnemy(state, 'e1', 0, 4);
  state.player.facing = { x: 0, z: 1 };
  const staminaBefore = state.player.stamina;
  stepGame(state, { shoot: true }, 1 / 60);
  assert.ok(state.player.stamina < staminaBefore, 'a shoot input must reach the bow');
  assert.equal(state.projectiles.length, 1);

  // Holding the key must not machine-gun: the latch allows one shot per press.
  const shotsAfterFirst = state.projectiles.length;
  stepGame(state, { shoot: true }, 1 / 60);
  assert.equal(state.projectiles.length, shotsAfterFirst,
    'a held shoot key must not fire every frame');
});

test('the blessing of fury still multiplies the bow damage', () => {
  const state = createGameState('bow-blessing');
  placeEnemy(state, 'e1', 0, 5);
  state.player.facing = { x: 0, z: 1 };
  chooseBlessing(state, 'fury');
  const result = shoot(state);
  assert.equal(result.fired, true);
  assert.ok(result.damage > 22, `the blessing must raise bow damage, got ${result.damage}`);
});

test('spawning a wave keeps the bow contract intact', () => {
  const state = createGameState('bow-wave');
  spawnWave(state, 1);
  assert.ok(state.enemies.length > 0);
  assert.equal(state.player.bowReadyAt, 0);
  assert.equal(state.inputLatch.shoot, false);
});
