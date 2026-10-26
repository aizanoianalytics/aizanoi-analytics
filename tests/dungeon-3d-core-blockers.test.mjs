import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameApp } from '../frontend/js/v3/apps/dungeon/src/runtime/GameApp.js';
import { loadSettings, SETTINGS_KEY } from '../frontend/js/v3/apps/dungeon/src/game/settings.js';
import { createGameState, spawnWave, stepGame } from '../frontend/js/v3/apps/dungeon/src/game/index.js';

for (const auto of [false, true]) {
  test(`${auto ? 'assist' : 'manual'} melee finds reachable attacker behind distant sticky archer`, () => {
    const state = createGameState('reachable');
    spawnWave(state, 1);
    stepGame(state, {}, 1);
    while (state.pendingSpawns.length) stepGame(state, {}, 1 / 60);
    const [near, far] = state.enemies;
    state.enemies = [near, far];
    near.archetype = 'chaser'; near.x = 1.2; near.z = 0;
    far.archetype = 'archer'; far.x = 8; far.z = 0;
    state.assistTarget = far.id; state.assistTargetUntil = state.time + 10;
    const hp = near.hp;
    stepGame(state, auto ? { autoAttack: true } : { attack: true }, 1 / 60);
    assert.ok(near.hp < hp, 'reachable enemy must take the melee hit');
    assert.equal(state.stats.meleeSwings, 1);
  });
}

test('explicit distant lock is not silently replaced by reachable melee target', () => {
  const state = createGameState('explicit-lock');
  spawnWave(state, 1);
  while (state.pendingSpawns.length) stepGame(state, {}, 1 / 60);
  const [near, far] = state.enemies;
  state.enemies = [near, far];
  near.x = 1.2; near.z = 0; far.x = 8; far.z = 0;
  const hp = near.hp;
  stepGame(state, { attack: true, lockTarget: far.id }, 1 / 60);
  assert.equal(near.hp, hp);
  assert.equal(state.stats.meleeSwings, 0);
});

test('reward owns pause presentation without unpausing simulation', () => {
  const app = new GameApp({ container: {} });
  app.paused = true; app.pickPanel = {};
  let snapshot;
  app.hud = { update(value) { snapshot = value; } };
  app.updateHud();
  assert.equal(snapshot.paused, false, 'generic pause must not cover reward');
  assert.equal(app.paused, true, 'reward still freezes simulation');
  app.pickPanel = null;
  app.updateHud();
  assert.equal(snapshot.paused, true, 'ordinary pause still appears');
});

test('touch default applies only without a valid saved mode', () => {
  assert.equal(loadSettings(null, { coarsePointer: true }).assistMode, 'auto');
  assert.equal(loadSettings(null).assistMode, 'assist');
  for (const mode of ['manual', 'assist', 'auto']) {
    const storage = { getItem(key) { assert.equal(key, SETTINGS_KEY); return JSON.stringify({ assistMode: mode }); } };
    assert.equal(loadSettings(storage, { coarsePointer: true }).assistMode, mode);
  }
  assert.equal(loadSettings({ getItem() { return '{broken'; } }, { coarsePointer: true }).assistMode, 'auto');
});

test('touch-mode switch cycles every entry point and persists the choice', () => {
  const app = new GameApp({ container: {} });
  assert.equal(app.assistMode, 'assist');
  assert.equal(app.cycleAssistMode().mode, 'auto');
  assert.equal(app.cycleAssistMode().mode, 'manual');
  assert.equal(app.cycleAssistMode().mode, 'assist');
  assert.equal(app.settings.assistMode, 'assist');
  const map = new Map();
  app.storage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); } };
  assert.equal(app.cycleAssistMode().mode, 'auto');
  assert.equal(loadSettings(app.storage).assistMode, 'auto', 'the saved preference must survive a reload');
});

test('touch action buttons fire on touch pointerdown with click dedup', () => {
  const source = readFileSync('frontend/js/v3/apps/dungeon/src/runtime/GameApp.js', 'utf8');
  for (const label of ['Attack', 'Shoot', 'Dash', 'Guard', 'Wrath']) {
    assert.ok(source.includes(`makeTouchButton('az-touch-action${label === 'Attack' ? ' az-touch-action--primary' : ''}', '${label}'`), `${label} must use the touch button`);
  }
  assert.match(source, /pointerdown[\s\S]*?pointerType !== 'touch'/);
  assert.match(source, /touchFiredAt/);
});
