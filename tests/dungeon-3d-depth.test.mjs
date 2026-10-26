// Dungeon depth: real arenas/hazards, shop + settings + daily surfaces,
// world-projected feedback, readable elites. RED-first contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState, stepGame, spawnWave, chooseArena, openChest, buyShopItem } from '../frontend/js/v3/apps/dungeon/src/game/index.js';

const base = 'frontend/js/v3/apps/dungeon/';
const read = (file) => readFileSync(base + file, 'utf8');

test('arenas expose distinct obstacle layouts, not one shared room', async () => {
  const mod = await import('../frontend/js/v3/apps/dungeon/src/game/index.js');
  assert.ok(typeof mod.arenaObstacles === 'function', 'sim must export arenaObstacles(arenaId)');
  const layouts = {};
  for (const id of ['column-ring', 'broken-bridge', 'brazier-court', 'collapsing-tiles', 'ruined-stairs']) {
    layouts[id] = mod.arenaObstacles(id);
    assert.ok(Array.isArray(layouts[id]) && layouts[id].length > 0, `${id} needs obstacles`);
  }
  const keys = Object.values(layouts).map((list) => JSON.stringify(list));
  assert.ok(new Set(keys).size >= 4, 'arena layouts must actually differ');
});

test('chooseArena installs the arena obstacle field on state', async () => {
  const mod = await import('../frontend/js/v3/apps/dungeon/src/game/index.js');
  assert.ok(typeof mod.arenaObstacles === 'function', 'sim must export arenaObstacles');
  const state = createGameState('arena-install');
  mod.chooseArena(state, 2);
  assert.ok(typeof state.arena === 'string');
  assert.deepEqual(state.obstacles, mod.arenaObstacles(state.arena));
});

test('slow-water hazard slows player displacement', async () => {
  const mod = await import('../frontend/js/v3/apps/dungeon/src/game/index.js');
  const run = (arena, seed) => {
    const state = createGameState(seed);
    state.arena = arena;
    if (typeof mod.arenaObstacles === 'function') state.obstacles = mod.arenaObstacles(arena);
    state.player.position = { x: 0, z: 0 };
    state.player.facing = { x: 1, z: 0 };
    for (let i = 0; i < 60; i += 1) stepGame(state, { moveX: 1, moveZ: 0 }, 1 / 60);
    return state.player.position.x;
  };
  const plain = run('column-ring', 'slow-compare');
  const water = run('broken-bridge', 'slow-compare');
  assert.ok(water < plain, `water must slow the crossing (water=${water} plain=${plain})`);
});

test('brazier-court burns near braziers and collapsing-tiles strikes telegraphed zones', async () => {
  const mod = await import('../frontend/js/v3/apps/dungeon/src/game/index.js');
  assert.ok(typeof mod.arenaObstacles === 'function');
  const burn = createGameState('burn-compare');
  burn.arena = 'brazier-court';
  burn.obstacles = mod.arenaObstacles('brazier-court');
  const brazier = burn.obstacles.find((o) => o.kind === 'brazier');
  assert.ok(brazier, 'brazier-court needs braziers');
  burn.player.position = { x: brazier.x, z: brazier.z + (brazier.radius + 0.2) };
  burn.player.hp = burn.player.maxHp;
  const hpBefore = burn.player.hp;
  for (let i = 0; i < 240; i += 1) stepGame(burn, {}, 1 / 60);
  assert.ok(burn.player.hp < hpBefore || (burn.events || []).some((e) => String(e.type).includes('hazard')), 'braziers must threaten');
  const fall = createGameState('fall-compare');
  fall.arena = 'collapsing-tiles';
  fall.obstacles = mod.arenaObstacles('collapsing-tiles');
  for (let i = 0; i < 600; i += 1) stepGame(fall, {}, 1 / 60);
  assert.ok((fall.events || []).some((e) => String(e.type).includes('hazard')), 'falling tiles must telegraph/strike');
});

test('runtime rebuilds the room per arena and renders hazard geometry', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /buildRoom\(.*arena|rebuildRoom|arenaObstacles|this\.state\.arena/);
  assert.match(source, /brazier-court|broken-bridge|collapsing-tiles|ruined-stairs/);
});

test('pick screen exposes the Ferryman shop with purchasable slots', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /buyShopItem/);
  assert.match(source, /az-dungeon-shop/);
  assert.match(source, /pickShopBuy/);
});

test('settings surface covers volumes, quality, shake, contrast and handedness', () => {
  const source = read('src/runtime/GameApp.js');
  for (const key of ['masterVolume', 'quality', 'shake', 'highContrast', 'leftHanded']) {
    assert.ok(source.includes(key), `settings surface must wire ${key}`);
  }
  assert.match(source, /showSettings|az-dungeon-settings/);
});

test('menu offers a daily descent seeded by dailySeed', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /dailySeed/);
  assert.match(source, /Daily descent/);
  assert.match(source, /beginDaily|startDaily/);
});

test('slow-mo effects drive a runtime time-scale, not dead output', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /slow-mo|slowMo/);
  assert.match(source, /slowMoUntil|timeScale/);
});

test('floating damage is projected to the victim, not screen center', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /az-dmg-x|project\(|NDC|ndc/i);
  const css = read('css/game.css');
  assert.match(css, /az-dmg-x/);
});

test('pending spawns render visible portal markers', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /pendingSpawns/);
  assert.match(source, /spawnMeshes|syncSpawnPortals/);
});

test('elites carry a rendered identity beyond shared archetype assets', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /elite/);
  assert.match(source, /eliteRing|eliteMarker|is-elite|az-elite/i);
});
