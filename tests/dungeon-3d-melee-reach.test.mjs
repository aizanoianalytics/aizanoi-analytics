// A swing at an enemy that is out of reach must not happen at all: it must
// not spend the cooldown and it must not be counted as a swing. Otherwise
// the player watches the cooldown bar move and nothing else happens, and the
// run ledger counts swings that never landed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState,
  attack,
  stepGame,
  spawnWave,
} from '../frontend/js/v3/apps/dungeon/src/game/index.js';

const placeEnemy = (state, x, z) => {
  const enemy = state.enemies[0];
  enemy.x = x;
  enemy.z = z;
  enemy.hp = enemy.maxHp;
  enemy.dead = false;
  return enemy;
};

test('a swing at an out-of-range enemy does not spend the cooldown', () => {
  const state = createGameState('out-of-range');
  spawnWave(state, 1);
  const enemy = placeEnemy(state, 12, 0);
  const before = state.player.attackReadyAt;
  const result = attack(state, enemy.id);
  assert.equal(result.hit, false, 'an out-of-range swing must not hit');
  assert.equal(result.reason, 'out-of-range');
  assert.equal(state.player.attackReadyAt, before, 'the cooldown must not advance');
  assert.equal(state.player.hp, 100, 'nothing else may change');
});

test('a swing at an out-of-range enemy is not counted as a swing', () => {
  const state = createGameState('no-swing-count');
  spawnWave(state, 1);
  const enemy = placeEnemy(state, 12, 0);
  const before = state.stats.meleeSwings;
  attack(state, enemy.id);
  assert.equal(state.stats.meleeSwings, before,
    'a swing that could not land must not be counted');
});

test('a swing at a target in reach lands and is counted', () => {
  const state = createGameState('in-range');
  spawnWave(state, 1);
  const enemy = placeEnemy(state, 1.2, 0);
  const before = state.stats.meleeSwings;
  const result = attack(state, enemy.id);
  assert.equal(result.hit, true, 'a swing in reach must hit');
  assert.equal(state.stats.meleeSwings, before + 1, 'a landed swing must be counted');
  assert.ok(enemy.hp < enemy.maxHp, 'the enemy must take damage');
});

test('the swing counter only counts swings that landed', () => {
  const state = createGameState('mixed');
  spawnWave(state, 1);
  const enemy = placeEnemy(state, 12, 0);
  const before = state.stats.meleeSwings;
  // One out of reach.
  attack(state, enemy.id);
  assert.equal(state.stats.meleeSwings, before);
  // Now bring it into reach and swing again.
  enemy.x = 1.2;
  const result = attack(state, enemy.id);
  assert.equal(result.hit, true);
  assert.equal(state.stats.meleeSwings, before + 1);
});

test('a swing at a dead enemy does not spend the cooldown', () => {
  const state = createGameState('dead-target');
  spawnWave(state, 1);
  const enemy = placeEnemy(state, 1.2, 0);
  enemy.dead = true;
  const before = state.player.attackReadyAt;
  const result = attack(state, enemy.id);
  assert.equal(result.hit, false);
  assert.equal(state.player.attackReadyAt, before, 'the cooldown must not advance');
});

test('pressing attack with no enemy in reach does not move the cooldown', () => {
  const state = createGameState('no-enemy');
  spawnWave(state, 1);
  state.enemies = [];
  const before = state.player.attackReadyAt;
  stepGame(state, { attack: true }, 1 / 60);
  assert.equal(state.player.attackReadyAt, before,
    'pressing attack with nothing to hit must not spend the cooldown');
  assert.equal(state.stats.meleeSwings, 0, 'and must not be counted as a swing');
});
