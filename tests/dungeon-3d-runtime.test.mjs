import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const base = 'frontend/js/v3/apps/dungeon/';
const read = (file) => readFileSync(base + file, 'utf8');

test('dungeon entry is a thin mount delegating to the runtime', () => {
  const entry = read('src/index.js');
  assert.ok(entry.split('\n').length <= 80, 'src/index.js must stay a thin module mount');
  assert.match(entry, /import\s+\{\s*GameApp\s*\}\s+from\s+['"]\.\/runtime\/GameApp\.js['"]/);
  assert.match(entry, /export\s+async\s+function\s+mount/);
  assert.match(entry, /await\s+app\.start\(\)/);
  assert.match(entry, /return\s+\(\)\s*=>\s*app\.destroy\(\)/);
});

test('runtime integrates simulation, HUD, audio and feedback', () => {
  assert.ok(existsSync(base + 'src/runtime/GameApp.js'));
  const source = read('src/runtime/GameApp.js');
  for (const name of ['createGameState', 'stepGame', 'spawnWave', 'openChest', 'chooseBlessing']) {
    assert.match(source, new RegExp(`\\b${name}\\b`), `runtime must use ${name}`);
  }
  assert.match(source, /createHud/);
  assert.match(source, /createAudioManager/);
  assert.match(source, /createFeedbackBus/);
  assert.match(source, /az-dungeon-exit-label/);
  assert.match(source, /FIXED_STEP\s*=\s*1\s*\/\s*60/);
  assert.match(source, /MAX_FRAME_DELTA/);
});

test('runtime owns focused controls and lifecycle guards', () => {
  const source = read('src/runtime/GameApp.js');
  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyJ', 'Escape', 'KeyH', 'Enter']) {
    assert.ok(source.includes(code), `missing ${code} control`);
  }
  assert.match(source, /root\.contains\(document\.activeElement\)|document\.activeElement\s*===\s*this\.root/);
  assert.match(source, /preventDefault\(\)/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /document\.hidden/);
  assert.match(source, /(?:blur|focusout)/);
  assert.match(source, /relatedTarget/);
  assert.match(source, /webglcontextlost/);
  assert.match(source, /AbortController|loadGeneration|destroyed/);
  assert.match(source, /devicePixelRatio[^\n]+2/);
  assert.match(source, /ACESFilmicToneMapping/);
  assert.match(source, /shadowMap\.enabled\s*=\s*true/);
});

test('runtime maps every gameplay archetype and visible entity', () => {
  const source = read('src/runtime/GameApp.js');
  const requiredAssets = [
    'hero_aizo.glb', 'enemy_gargoyle.glb', 'enemy_skeletal_archer.glb',
    'enemy_armored_centurion.glb', 'enemy_cult_sorcerer.glb',
    'boss_marble_minotaur.glb', 'projectile_arrow.glb',
    'treasure_chest.glb', 'portal_ring.glb', 'floor_tile.glb',
    'wall_block.glb', 'arch_doorway.glb', 'column.glb', 'brazier.glb',
  ];
  requiredAssets.forEach((asset) => assert.ok(source.includes(asset), `missing asset ${asset}`));
  for (const role of ['chaser', 'archer', 'tank', 'summoner', 'boss']) {
    assert.match(source, new RegExp(`${role}\\s*:\\s*['"]`), `missing ${role} asset mapping`);
  }
  assert.match(source, /state\.projectiles/);
  assert.match(source, /state\.chests/);
  assert.match(source, /enemy-death/);
  assert.match(source, /particleResources/);
  assert.match(source, /disposeLoaded/);
});

test('runtime exposes truthful read-only QA state and remains CSP safe', () => {
  const runtime = read('src/runtime/GameApp.js');
  const entry = read('src/index.js');
  const combined = `${runtime}\n${entry}`;
  for (const field of ['state', 'chapter', 'enemyCount', 'enemyHp', 'player', 'hp', 'frames']) {
    assert.match(runtime, new RegExp(`\\b${field}\\b`), `QA state missing ${field}`);
  }
  assert.match(runtime, /get\s+state\(\)\s*\{[^}]*paused[^}]*['"]paused['"]/);
  assert.match(runtime, /AIZANOI_DUNGEON_GAME/);
  assert.doesNotMatch(runtime, /AIZANOI_DUNGEON_GAME\s*=\s*[^;]*(?:spawn|kill|damage|teleport)/i);
  assert.doesNotMatch(combined, /\bstyle\s*=|\.style\b|\bon(?:click|pointerdown|touchstart)\s*=/i);
});
