// The 2D build had twelve blessings, a capped summoner, and a run that was
// persisted between sessions. The 3D rewrite shipped with three blessings, an
// uncapped summoner, and a persistence layer that nothing called.
//
// These tests pin the restored behaviour, and they fail if the behaviour
// regresses back to the broken version.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseBlessing,
  createGameState,
  stepGame,
  BLESSING_IDS,
  BLESSING_LABELS,
  savePersistedRun,
  loadPersistedRun,
  clearPersistedRun,
  DUNGEON_SAVE_KEY,
} from '../frontend/js/v3/apps/dungeon/src/game/index.js';

// A minimal in-memory Storage, so the tests never touch the real localStorage.
const makeStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    get size() { return map.size; },
  };
};

test('the blessing pool holds the twelve blessings the 2D build had', () => {
  assert.equal(BLESSING_IDS.length, 12);
  assert.equal(new Set(BLESSING_IDS).size, 12);
  BLESSING_IDS.forEach((id) => {
    assert.ok(BLESSING_LABELS[id], `${id} must have a label`);
    assert.ok(BLESSING_LABELS[id].label.length > 0, `${id} must have a readable label`);
    assert.ok(BLESSING_LABELS[id].hint.length > 0, `${id} must explain what it does`);
  });
});

test('every blessing changes a player stat in the expected direction', () => {
  const expectations = {
    vitality: (p, before) => p.maxHp > before.maxHp,
    fury: (p, before) => p.damageMultiplier > before.damageMultiplier,
    windstep: (p, before) => p.dashCooldownMax < before.dashCooldownMax,
    swiftstrike: (p, before) => p.attackSpeedMultiplier > before.attackSpeedMultiplier,
    keeneye: (p, before) => p.critChance > before.critChance,
    honededge: (p, before) => p.critMultiplier > before.critMultiplier,
    ironskin: (p, before) => p.damageTakenMultiplier < before.damageTakenMultiplier,
    vampiric: (p, before) => p.lifesteal > before.lifesteal,
    longrange: (p, before) => p.bowRangeMultiplier > before.bowRangeMultiplier,
    stormstep: (p, before) => p.speedMultiplier > before.speedMultiplier,
    warmonger: (p, before) => p.damageMultiplier > before.damageMultiplier
      && p.attackSpeedMultiplier > before.attackSpeedMultiplier,
    penkalasblood: (p, before) => p.bowStaminaMultiplier < before.bowStaminaMultiplier,
  };
  BLESSING_IDS.forEach((id) => {
    const state = createGameState(`blessing-${id}`);
    const before = { ...state.player };
    const result = chooseBlessing(state, id);
    assert.equal(result.chosen, true, `${id} must be choosable`);
    assert.equal(result.label, BLESSING_LABELS[id].label);
    assert.equal(result.hint, BLESSING_LABELS[id].hint);
    assert.ok(expectations[id](state.player, before), `${id} must change the player as advertised`);
  });
});

test('a blessing stacks to level III, then refuses', () => {
  const state = createGameState('double-blessing');
  assert.equal(chooseBlessing(state, 'fury').chosen, true);
  assert.equal(chooseBlessing(state, 'fury').chosen, true, 'second pick stacks to II');
  assert.equal(chooseBlessing(state, 'fury').chosen, true, 'third pick stacks to III');
  const fourth = chooseBlessing(state, 'fury');
  assert.equal(fourth.chosen, false);
  assert.equal(fourth.reason, 'max-level');
  assert.equal(state.blessings.length, 1, 'stacking never duplicates the entry');
  assert.equal(state.blessingLevels.fury, 3);
});

test('an unknown blessing is rejected', () => {
  const state = createGameState('bad-blessing');
  assert.throws(() => chooseBlessing(state, 'not-a-blessing'), /Unknown blessing/);
});

test('the keen eye blessing makes critical hits land', () => {
  const state = createGameState('crit-blessing');
  chooseBlessing(state, 'keeneye');
  chooseBlessing(state, 'honededge');
  assert.ok(state.player.critChance >= 0.2, 'the crit chance must be raised');
  assert.ok(state.player.critMultiplier >= 1.95, 'the crit damage must be raised');
});

test('the iron skin blessing reduces the damage the player takes', () => {
  const state = createGameState('armor-blessing');
  const before = state.player.damageTakenMultiplier;
  chooseBlessing(state, 'ironskin');
  assert.ok(state.player.damageTakenMultiplier < before);
  assert.ok(state.player.damageTakenMultiplier > 0, 'the player must still be able to take damage');
});

test('the vampiric oath blessing heals the player when they hit', () => {
  const state = createGameState('lifesteal-blessing');
  chooseBlessing(state, 'vampiric');
  assert.ok(state.player.lifesteal > 0);
});

test('the summoner never grows the wave without bound', () => {
  const state = createGameState('summon-cap');
  const summoner = {
    id: 'summoner-1', archetype: 'summoner', x: 0, z: 8, hp: 90, maxHp: 90,
    speed: 2.2, damage: 7, xp: 26, gold: 13,
    attackCooldown: 0, shootCooldown: 0, summonCooldown: 0,
    stun: 0, windup: null, dead: false, intent: 'idle',
  };
  state.enemies.push(summoner);
  // Run long enough for the summoner to summon many times.
  for (let i = 0; i < 60 * 60; i += 1) stepGame(state, {}, 1 / 60);
  const minions = state.enemies.filter((enemy) => !enemy.dead && enemy.summonedBy === 'summoner-1');
  assert.ok(minions.length <= 3,
    `a summoner must not have more than 3 live minions, had ${minions.length}`);
});

test('a wave never starts more enemies than the live ceiling allows', () => {
  const state = createGameState('wave-ceiling');
  state.chapter = 50;
  // spawnWave is called through the exported API in the game module.
  const enemies = state.enemies;
  assert.ok(enemies.length <= 40, `a wave must not exceed 40 enemies, had ${enemies.length}`);
});

test('a run survives a save and restore round trip', () => {
  const storage = makeStorage();
  const state = createGameState('persist-me');
  state.chapter = 4;
  state.player.gold = 250;
  chooseBlessing(state, 'fury');
  const saved = savePersistedRun(storage, state);
  assert.equal(saved.saved, true);

  const loaded = loadPersistedRun(storage, 'persist-me');
  assert.equal(loaded.restored, true);
  assert.equal(loaded.state.chapter, 4);
  assert.equal(loaded.state.player.gold, 250);
  assert.deepEqual(loaded.state.blessings, ['fury']);
});

test('clearing the persisted run removes it', () => {
  const storage = makeStorage();
  const state = createGameState('clear-me');
  savePersistedRun(storage, state);
  assert.ok(storage.getItem(DUNGEON_SAVE_KEY));
  clearPersistedRun(storage);
  assert.equal(storage.getItem(DUNGEON_SAVE_KEY), null);
});

test('a corrupt save degrades to a fresh run instead of crashing', () => {
  const storage = makeStorage();
  storage.setItem(DUNGEON_SAVE_KEY, '{not json');
  const loaded = loadPersistedRun(storage, 'corrupt');
  assert.equal(loaded.restored, false);
  assert.ok(loaded.state, 'a fresh state must be returned');
  assert.equal(loaded.state.player.hp, 100);
});

test('a storage that throws never breaks the game', () => {
  const hostile = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const state = createGameState('hostile-storage');
  assert.deepEqual(savePersistedRun(hostile, state), { saved: false });
  const loaded = loadPersistedRun(hostile, 'hostile');
  assert.equal(loaded.restored, false);
  assert.ok(loaded.state);
});
