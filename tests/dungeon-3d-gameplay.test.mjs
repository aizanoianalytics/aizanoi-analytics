import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attack,
  chooseBlessing,
  createGameState,
  openChest,
  restoreRun,
  serializeRun,
  spawnWave,
  stepGame,
} from '../frontend/js/v3/apps/dungeon/src/game/index.js';

const tick = (state, seconds, input = {}) => {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i += 1) stepGame(state, input, 1 / 60);
  return state;
};

const enemy = (id, archetype, x, z, overrides = {}) => ({
  id, archetype, x, z, hp: 100, maxHp: 100, speed: 3,
  damage: 10, attackCooldown: 0, stun: 0, dead: false, intent: 'idle',
  xp: 10, gold: 5, ...overrides,
});

test('seeded runs and fixed-step input are deterministic', () => {
  const a = createGameState('iron-seed');
  const b = createGameState('iron-seed');
  spawnWave(a, 4);
  spawnWave(b, 4);
  for (let i = 0; i < 180; i += 1) {
    const input = { moveX: i % 40 < 20 ? 1 : -1, moveZ: 0.25, dash: i === 20 };
    stepGame(a, input, 1 / 60);
    stepGame(b, input, 1 / 60);
  }
  assert.equal(serializeRun(a), serializeRun(b));

  const c = createGameState(91);
  const d = createGameState(91);
  stepGame(c, { moveX: 1, moveZ: 0.5 }, 0.5);
  for (let i = 0; i < 30; i += 1) stepGame(d, { moveX: 1, moveZ: 0.5 }, 1 / 60);
  assert.deepEqual(c.player.position, d.player.position);
});

test('dash spends stamina, has cooldown, and grants damage i-frames', () => {
  const state = createGameState(7);
  state.enemies = [enemy('tank', 'tank', 0, 0, { damage: 25 })];
  stepGame(state, { moveX: 1, dash: true }, 1 / 60);
  assert.equal(state.player.hp, state.player.maxHp);
  assert.ok(state.player.invulnerable > 0);
  assert.ok(state.player.dashCooldown > 0);
  assert.ok(state.player.stamina < state.player.maxStamina);

  state.enemies[0].x = state.player.position.x;
  state.enemies[0].z = state.player.position.z;
  state.enemies[0].attackCooldown = 0;
  tick(state, 0.5);
  assert.ok(state.player.hp < state.player.maxHp, 'damage resumes after i-frames');
});

test('melee chain has three timed attacks with distinct damage and range', () => {
  const state = createGameState(2);
  state.enemies = [enemy('dummy', 'tank', 1.8, 0, { hp: 500, maxHp: 500, speed: 0 })];
  const first = attack(state, 'dummy');
  tick(state, 0.3);
  state.enemies[0].x = 2.15;
  const second = attack(state, 'dummy');
  tick(state, 0.3);
  state.enemies[0].x = 2.7;
  const third = attack(state, 'dummy');
  assert.deepEqual([first.chain, second.chain, third.chain], [1, 2, 3]);
  assert.ok(first.damage < second.damage && second.damage < third.damage);
  assert.ok(first.range < second.range && second.range < third.range);
  tick(state, 0.9);
  assert.equal(attack(state, 'dummy').chain, 1, 'expired chain resets');
});

test('enemy archetypes choose distinct role intents and archers fire projectiles', () => {
  const state = createGameState(11);
  state.player.position = { x: 0, z: 0 };
  state.enemies = [
    enemy('c', 'chaser', 5, 0),
    enemy('a', 'archer', 2, 0),
    enemy('t', 'tank', 1, 0),
    enemy('s', 'summoner', 7, 0),
    enemy('b', 'boss', 8, 0, { hp: 500, maxHp: 500 }),
  ];
  stepGame(state, {}, 1 / 60);
  assert.deepEqual(state.enemies.map((unit) => unit.intent),
    ['pursue', 'kite', 'slam', 'summon', 'hunt']);
  assert.ok(state.projectiles.some((shot) => shot.ownerId === 'a'));
});

test('boss changes phase below half health and enrages below one quarter', () => {
  const state = createGameState(1);
  state.enemies = [enemy('boss', 'boss', 8, 0, { hp: 240, maxHp: 500, phase: 1 })];
  stepGame(state, {}, 1 / 60);
  assert.equal(state.enemies[0].phase, 2);
  assert.equal(state.enemies[0].intent, 'charge');
  state.enemies[0].hp = 100;
  stepGame(state, {}, 1 / 60);
  assert.equal(state.enemies[0].phase, 3);
  assert.equal(state.enemies[0].intent, 'enrage');
});

test('hits stun, kills award XP/gold, and level-ups improve the player', () => {
  const state = createGameState(3);
  state.player.xpToNext = 10;
  state.enemies = [enemy('weak', 'chaser', 1, 0, { hp: 10, maxHp: 10, xp: 12, gold: 9 })];
  const result = attack(state, 'weak');
  assert.equal(result.hit, true);
  assert.equal(state.enemies[0].dead, true);
  assert.equal(state.player.level, 2);
  assert.equal(state.player.gold, 9);
  assert.ok(state.player.maxHp > 100);
});

test('wave completion creates deterministic loot and chest advances chapters into endless', () => {
  const state = createGameState('loot');
  state.chapter = 10;
  state.wave.active = true;
  state.enemies = [enemy('last', 'chaser', 1, 0, { hp: 1, maxHp: 1 })];
  attack(state, 'last');
  stepGame(state, {}, 1 / 60);
  assert.equal(state.wave.complete, true);
  assert.equal(state.chests.length, 1);
  const chest = state.chests[0];
  const beforeGold = state.player.gold;
  const loot = openChest(state, chest.id);
  assert.equal(loot.opened, true);
  assert.ok(state.player.gold > beforeGold);
  assert.equal(state.chapter, 11);
  assert.equal(state.mode, 'endless');

  spawnWave(state, 14);
  assert.equal(state.wave.chapter, 14);
  assert.ok(state.wave.scale > 1);
  assert.ok(state.enemies.every((unit) => unit.maxHp > 100));
});

test('spawnWave covers five combat archetypes and scales deterministically', () => {
  const a = createGameState(42);
  const b = createGameState(42);
  spawnWave(a, 10);
  spawnWave(b, 10);
  assert.equal(serializeRun(a), serializeRun(b));
  const roles = new Set(a.enemies.map((unit) => unit.archetype));
  for (const role of ['chaser', 'archer', 'tank', 'summoner', 'boss']) assert.ok(roles.has(role));
});

test('three blessings apply once with concrete build effects', () => {
  const state = createGameState(8);
  const base = { hp: state.player.maxHp, damage: state.player.damageMultiplier,
    dash: state.player.dashCooldownMax };
  assert.equal(chooseBlessing(state, 'vitality').chosen, true);
  assert.equal(chooseBlessing(state, 'fury').chosen, true);
  assert.equal(chooseBlessing(state, 'windstep').chosen, true);
  assert.ok(state.player.maxHp > base.hp);
  assert.ok(state.player.damageMultiplier > base.damage);
  assert.ok(state.player.dashCooldownMax < base.dash);
  assert.equal(chooseBlessing(state, 'fury').chosen, false);
  assert.throws(() => chooseBlessing(state, 'unknown'), /Unknown blessing/);
});

test('serialization round-trips exactly and rejects malformed or unsafe saves', () => {
  const state = createGameState('save-me');
  spawnWave(state, 6);
  tick(state, 0.5, { moveX: 0.5, moveZ: -1 });
  chooseBlessing(state, 'fury');
  const json = serializeRun(state);
  assert.equal(serializeRun(restoreRun(json)), json);
  assert.notEqual(restoreRun(json), state);
  for (const bad of ['nope', '{}', '{"version":99}',
    JSON.stringify({ ...JSON.parse(json), player: { hp: "lots" } })]) {
    assert.throws(() => restoreRun(bad), /Invalid dungeon save/);
  }
});
