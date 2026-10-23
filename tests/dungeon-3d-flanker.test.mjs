// The 2D build had a flanker enemy (the Styx Ferryman) that circled its prey
// and then committed to one lunging dash. The 3D rewrite shipped with four
// archetypes and no flanker, so that behaviour was simply gone.
//
// These tests pin the flanker contract: it closes the distance when it is
// far, orbits at a readable distance, commits to exactly one lunge with a
// locked direction, and returns to the orbit afterwards. The phase timings
// must be wall-clock based, not frame-count based, or a slow machine would
// orbit for a different length of time than a fast one.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState, spawnWave, stepGame,
} from '../frontend/js/v3/apps/dungeon/src/game/index.js';

const makeFlanker = (state, x, z) => {
  const enemy = {
    id: 'flanker-1', archetype: 'flanker', x, z, hp: 80, maxHp: 80,
    speed: 3.4, damage: 12, xp: 18, gold: 9,
    attackCooldown: 0, shootCooldown: 0, summonCooldown: 0,
    stun: 0, windup: null, dead: false, intent: 'idle',
  };
  state.enemies.push(enemy);
  return enemy;
};

const run = (state, seconds) => {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) stepGame(state, {}, 1 / 60);
};

// The lunge window is short, so a test that looks at one instant can easily
// miss it. Sampling the whole window and recording what was seen is the
// honest way to assert "it lunges exactly once".
const sample = (state, seconds, secondsPerStep = 1 / 60) => {
  const seen = { phases: new Set(), intents: new Set(), windupSeen: false, lockedDirections: [] };
  const steps = Math.round(seconds / secondsPerStep);
  for (let i = 0; i < steps; i += 1) {
    stepGame(state, {}, secondsPerStep);
    const enemy = state.enemies[0];
    if (enemy.orbit) seen.phases.add(enemy.orbit.phase);
    seen.intents.add(enemy.intent);
    if (enemy.windup) seen.windupSeen = true;
    if (enemy.lungeDirection) seen.lockedDirections.push({ ...enemy.lungeDirection });
  }
  return seen;
};

test('a flanker closes the distance when it starts far away', () => {
  const state = createGameState('flanker-far');
  const flanker = makeFlanker(state, 0, 16);
  const gapBefore = Math.hypot(flanker.x - state.player.position.x, flanker.z - state.player.position.z);
  run(state, 0.5);
  const gapAfter = Math.hypot(flanker.x - state.player.position.x, flanker.z - state.player.position.z);
  assert.ok(gapAfter < gapBefore, `the flanker must close in (${gapBefore.toFixed(2)} -> ${gapAfter.toFixed(2)})`);
  assert.equal(flanker.intent, 'close');
});

test('a flanker enters the orbit once it is at a readable distance', () => {
  const state = createGameState('flanker-orbit');
  const flanker = makeFlanker(state, 0, 7);
  run(state, 0.2);
  assert.equal(flanker.intent, 'orbit', 'the flanker must take up an orbit');
  assert.ok(flanker.orbit, 'the flanker must keep an orbit state');
});

test('the flanker orbits at a readable distance instead of drifting away', () => {
  const state = createGameState('flanker-ring');
  const flanker = makeFlanker(state, 0, 7);
  run(state, 1.2);
  const gap = Math.hypot(flanker.x - state.player.position.x, flanker.z - state.player.position.z);
  assert.ok(gap > 3.5 && gap < 8, `the flanker must hold a readable ring, gap=${gap.toFixed(2)}`);
});

test('the flanker commits to a lunge with a locked direction', () => {
  const state = createGameState('flanker-lunge');
  const flanker = makeFlanker(state, 0, 7);
  run(state, 0.2);
  const seen = sample(state, 2.2);
  assert.ok(seen.phases.has('lunge'), `the flanker must lunge, phases=${[...seen.phases]}`);
  assert.ok(seen.intents.has('lunge'), 'the lunge must be visible as an intent');
  assert.ok(seen.lockedDirections.length > 0, 'the lunge must lock a direction');
  assert.ok(seen.lockedDirections.every((d) => Number.isFinite(d.x) && Number.isFinite(d.z)),
    'the locked direction must be a real vector');
});

test('the flanker returns to the orbit after the lunge ends', () => {
  const state = createGameState('flanker-return');
  const flanker = makeFlanker(state, 0, 7);
  run(state, 0.2);
  const seen = sample(state, 2.6);
  assert.ok(seen.phases.has('lunge'), 'the flanker must lunge first');
  assert.ok(seen.phases.has('idle') || seen.phases.has('orbit'),
    `the flanker must reset after the lunge, phases=${[...seen.phases]}`);
});

test('the flanker telegraphs its lunge so the player can read it', () => {
  const state = createGameState('flanker-telegraph');
  const flanker = makeFlanker(state, 0, 7);
  run(state, 0.2);
  const seen = sample(state, 2.2);
  assert.ok(seen.windupSeen, 'the lunge must be telegraphed with a windup');
});

test('the flanker lunges exactly once per orbit window', () => {
  const state = createGameState('flanker-once');
  const flanker = makeFlanker(state, 0, 7);
  run(state, 0.2);
  let lunges = 0;
  let wasLunging = false;
  for (let i = 0; i < Math.round(2.0 * 60); i += 1) {
    stepGame(state, {}, 1 / 60);
    const lunging = flanker.orbit?.phase === 'lunge';
    if (lunging && !wasLunging) lunges += 1;
    wasLunging = lunging;
  }
  assert.equal(lunges, 1, `the flanker must lunge once in 2s, lunged ${lunges} times`);
});

test('the flanker lunge actually covers ground', () => {
  const state = createGameState('flanker-dash');
  const flanker = makeFlanker(state, 0, 7);
  run(state, 0.2);
  let before = null;
  let moved = 0;
  for (let i = 0; i < Math.round(2.2 * 60); i += 1) {
    const lunging = flanker.orbit?.phase === 'lunge';
    if (lunging && before === null) before = { x: flanker.x, z: flanker.z };
    if (lunging && before !== null) moved = Math.hypot(flanker.x - before.x, flanker.z - before.z);
    stepGame(state, {}, 1 / 60);
  }
  assert.ok(moved > 0.5, `the lunge must dash forward, moved ${moved.toFixed(2)}`);
});

test('the flanker is part of the later chapter pools', () => {
  const state = createGameState('flanker-pool');
  spawnWave(state, 7);
  run(state, 1.2);
  assert.ok(state.enemies.some((enemy) => enemy.archetype === 'flanker'),
    'chapter 7 must be able to spawn a flanker');
});

test('a boss chapter includes the flanker alongside the boss', () => {
  const state = createGameState('flanker-boss-chapter');
  spawnWave(state, 5);
  run(state, 1.2);
  const roles = state.enemies.map((enemy) => enemy.archetype);
  assert.ok(roles.includes('flanker'), 'a boss chapter must include a flanker');
  assert.ok(roles.includes('boss'), 'a boss chapter must include the boss');
});

test('the flanker keeps its orbit state across a save and restore', () => {
  const state = createGameState('flanker-save');
  const flanker = makeFlanker(state, 0, 7);
  run(state, 0.2);
  assert.ok(flanker.orbit, 'the flanker must carry an orbit state');
  assert.ok(JSON.parse(JSON.stringify(state)).enemies[0].orbit,
    'the orbit state must survive serialization');
});
