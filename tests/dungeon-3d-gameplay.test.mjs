import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attack,
  chooseBlessing,
  createGameState,
  openChest,
  DUNGEON_SAVE_KEY,
  loadPersistedRun,
  restoreRun,
  savePersistedRun,
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
  tick(state, 1.2);
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
    enemy('a', 'archer', 6, 0),
    enemy('t', 'tank', 1, 0),
    enemy('s', 'summoner', 7, 0),
    enemy('b', 'boss', 8, 0, { hp: 500, maxHp: 500 }),
  ];
  stepGame(state, {}, 1 / 60);
  assert.deepEqual(state.enemies.map((unit) => unit.intent),
    ['pursue', 'shoot', 'slam', 'summon', 'hunt']);
  tick(state, 0.3);
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

test('enemy archetypes announce windups before attacks and cancel invalid strikes', () => {
  const cases = [
    { archetype: 'chaser', x: 1, delay: 0.25, result: 'damage' },
    { archetype: 'tank', x: 1, delay: 0.25, result: 'damage' },
    { archetype: 'archer', x: 6, delay: 0.25, result: 'projectile' },
    { archetype: 'summoner', x: 6, delay: 0.25, result: 'summon' },
    { archetype: 'boss', x: 1, delay: 0.45, result: 'damage' },
  ];
  for (const entry of cases) {
    const state = createGameState(`windup-${entry.archetype}`);
    state.player.position = { x: 0, z: 0 };
    const unit = enemy(entry.archetype, entry.archetype, entry.x, 0, {
      hp: entry.archetype === 'boss' ? 500 : 100,
      maxHp: entry.archetype === 'boss' ? 500 : 100,
      shootCooldown: 0,
      summonCooldown: 0,
      speed: 0,
    });
    state.enemies = [unit];
    const hp = state.player.hp;
    stepGame(state, {}, 1 / 60);
    const telegraph = state.events.find((event) => event.type === 'attack-telegraph' && event.id === unit.id);
    assert.ok(telegraph, `${entry.archetype} emits a telegraph`);
    assert.ok(telegraph.duration >= entry.delay, `${entry.archetype} windup meets minimum`);
    assert.equal(state.player.hp, hp, `${entry.archetype} does not damage immediately`);
    assert.equal(state.projectiles.length, 0, `${entry.archetype} does not fire immediately`);
    tick(state, entry.delay - 2 / 60);
    assert.equal(state.player.hp, hp, `${entry.archetype} waits out windup`);
    if (entry.result === 'projectile') assert.equal(state.projectiles.length, 0);
    tick(state, 3 / 60);
    if (entry.result === 'damage') assert.ok(state.player.hp < hp, `${entry.archetype} resolves melee after windup`);
    if (entry.result === 'projectile') assert.ok(state.projectiles.some((shot) => shot.ownerId === unit.id));
    if (entry.result === 'summon') assert.ok(state.enemies.length > 1);
  }

  for (const cancellation of ['stun', 'range']) {
    const state = createGameState(`cancel-${cancellation}`);
    const unit = enemy('c', 'chaser', 1, 0, { speed: 0 });
    state.enemies = [unit];
    stepGame(state, {}, 1 / 60);
    if (cancellation === 'stun') unit.stun = 1;
    else unit.x = 8;
    tick(state, 0.4);
    assert.equal(state.player.hp, state.player.maxHp, `windup cancels on ${cancellation}`);
    assert.equal(unit.windup, null);
  }
});

test('dash persists for about 200ms in its stored direction', () => {
  const state = createGameState('dash-duration');
  stepGame(state, { moveX: 1, dash: true }, 1 / 60);
  const afterFirst = state.player.position.x;
  tick(state, 0.18, {});
  assert.ok(state.player.dashRemaining > 0, 'dash remains active after input is released');
  assert.deepEqual(state.player.dashDirection, { x: 1, z: 0 });
  assert.ok(state.player.position.x - afterFirst > 1.5, 'dash has meaningful sustained displacement');
  tick(state, 0.08, {});
  assert.equal(state.player.dashRemaining, 0);
});

test('simulation collides with room props, separates entities, and clamps rewards', () => {
  const state = createGameState('collision');
  state.player.position = { x: -14, z: -12 };
  tick(state, 1, { moveX: 1 });
  assert.ok(Math.hypot(state.player.position.x + 12, state.player.position.z + 12) >= 1.35,
    'player cannot pass through a column');

  state.player.position = { x: 0, z: 0 };
  state.enemies = [enemy('one', 'chaser', 2, 0, { speed: 0 }), enemy('two', 'chaser', 2, 0, { speed: 0 })];
  stepGame(state, {}, 1 / 60);
  assert.ok(distanceBetween(state.enemies[0], state.enemies[1]) >= 0.75, 'enemies separate rather than overlap');

  state.player.position = { x: 17.8, z: 17.8 };
  state.wave = { active: true, complete: false, rewarded: false, chapter: 1, scale: 1 };
  state.enemies = [enemy('last', 'chaser', 17, 17, { hp: 1, maxHp: 1 })];
  state.player.attackReadyAt = 0;
  attack(state, 'last');
  stepGame(state, {}, 1 / 60);
  const chest = state.chests[0];
  assert.ok(Math.abs(chest.position.x) <= 16 && Math.abs(chest.position.z) <= 16);
  assert.ok(chest.reachable);
});

const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('versioned persistence safely restores combat, reward, and between-wave runs', () => {
  assert.match(DUNGEON_SAVE_KEY, /v3$/);
  const map = new Map();
  const storage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
  for (const status of ['combat', 'reward', 'between-waves']) {
    const state = createGameState(`persist-${status}`);
    spawnWave(state, 4);
    state.status = status;
    if (status !== 'combat') {
      state.chests = [{ id: 'stable', opened: status === 'between-waves', gold: 20, blessing: 'fury', position: { x: 15, z: -15 }, reachable: true }];
      state.portal = status === 'between-waves' ? { pending: true, position: { x: 15, z: -15 } } : { pending: false, position: null };
    }
    assert.equal(savePersistedRun(storage, state).saved, true);
    const loaded = loadPersistedRun(storage, 'fresh');
    assert.equal(loaded.restored, true);
    assert.equal(loaded.state.status, status);
    assert.deepEqual(loaded.state.chests, state.chests);
    assert.deepEqual(loaded.state.portal, state.portal);
  }

  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(savePersistedRun(denied, createGameState()).saved, false);
  assert.equal(loadPersistedRun(denied, 'fallback').restored, false);
  map.set(DUNGEON_SAVE_KEY, '{broken');
  assert.equal(loadPersistedRun(storage, 'fallback').state.seed, 'fallback');
  map.delete(DUNGEON_SAVE_KEY);
  map.set('aizanoi.dungeon.run.v2', '{}');
  const legacy = loadPersistedRun(storage, 'legacy-fresh');
  assert.equal(legacy.restored, false);
  assert.match(legacy.announcement, /older save.*fresh run/i);
});

test('five rewards never silently duplicate a blessing and histories stay bounded', () => {
  const state = createGameState('five-waves');
  const labels = [];
  for (let chapter = 1; chapter <= 5; chapter += 1) {
    state.chapter = chapter;
    state.wave = { active: true, complete: false, rewarded: false, chapter, scale: 1 };
    state.enemies = [];
    stepGame(state, {}, 1 / 60);
    const chest = state.chests.at(-1);
    const result = openChest(state, chest.id);
    const chosen = result.blessing ? chooseBlessing(state, result.blessing) : result.fallback;
    labels.push(chosen.label);
  }
  assert.equal(new Set(state.blessings).size, 3);
  assert.ok(labels.every(Boolean), 'every reward has truthful copy');
  assert.ok(labels.slice(3).every((label) => /gold|heal/i.test(label)), 'duplicates become stackable fallback rewards');

  for (let i = 0; i < 500; i += 1) {
    state.events.push({ type: 'noise', at: state.time });
    state.loot.push({ id: `old-${i}`, collected: true });
    stepGame(state, {}, 1 / 60);
  }
  assert.ok(state.events.length <= 128);
  assert.ok(state.loot.length <= 64);
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
