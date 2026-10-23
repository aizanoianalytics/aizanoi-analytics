import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from '../frontend/worlds/shared/vendor/three.module.js';
import { GameApp } from '../frontend/js/v3/apps/dungeon/src/runtime/GameApp.js';

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

test('runtime hardens mount, teardown, telegraphs, hit-stop, joystick and context loss', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /this\.started/, 'startup boundary must guard double-start');
  assert.match(source, /rollbackScene/, 'renderer/scene failure must roll back');
  assert.match(source, /stylesheetRefs/, 'stylesheet must be reference counted');
  assert.match(source, /setVisible\(true\)/, 'HUD must be revealed on begin');
  assert.match(source, /attack-telegraph/, 'telegraph events must be wired to runtime feedback');
  assert.match(source, /syncTelegraphs|telegraphMeshes/, 'telegraphs need ground-ring visuals');
  assert.match(source, /hitStopUntil/, 'hit-stop effects must pause the simulation');
  assert.match(source, /pointerId/, 'joystick must track pointer ownership');
  assert.match(source, /setPointerCapture/, 'joystick must capture its pointer');
  assert.match(source, /webglcontextrestored/, 'context loss must recover');
  assert.match(source, /result\.fallback/, 'blessing fallback must be messaged truthfully');
});

test('mount rolls back an app whose start fails', () => {
  const entry = read('src/index.js');
  assert.match(entry, /try\s*\{[\s\S]*await\s+app\.start\(\)[\s\S]*\}\s*catch/, 'mount must catch start failures');
  assert.match(entry, /app\.destroy\(\)/, 'mount must destroy the failed app');
});

test('runtime maps every gameplay archetype and visible entity', () => {
  const source = read('src/runtime/GameApp.js');
  const requiredAssets = [
    'hero_aizo.glb', 'enemy_gargoyle.glb', 'enemy_skeletal_archer.glb',
    'enemy_armored_centurion.glb', 'enemy_cult_sorcerer.glb',
    'enemy_styx_ferryman.glb',
    'boss_marble_minotaur.glb', 'projectile_arrow.glb',
    'treasure_chest.glb', 'portal_ring.glb', 'floor_tile.glb',
    'wall_block.glb', 'arch_doorway.glb', 'column.glb', 'brazier.glb',
  ];
  requiredAssets.forEach((asset) => assert.ok(source.includes(asset), `missing asset ${asset}`));
  for (const role of ['chaser', 'archer', 'tank', 'summoner', 'flanker', 'boss']) {
    assert.match(source, new RegExp(`${role}\\s*:\\s*['"]`), `missing ${role} asset mapping`);
  }
  assert.match(source, /state\.projectiles/);
  assert.match(source, /state\.chests/);
  assert.match(source, /enemy-death/);
  assert.match(source, /particleResources/);
  assert.match(source, /disposeLoaded/);
});

test('windup state drives ground-ring telegraphs that clear on resolve', () => {
  const app = new GameApp({ container: {} });
  app.dynamic = new THREE.Group();
  app.state.enemies = [{
    id: 'e1', archetype: 'chaser', x: 1, z: 0, dead: false,
    windup: { kind: 'melee', remaining: 0.2, duration: 0.25, range: 1.4 },
  }];
  app.syncTelegraphs();
  assert.equal(app.telegraphMeshes.size, 1);
  const ring = app.telegraphMeshes.get('e1');
  assert.ok(ring, 'ring mesh exists during windup');
  assert.equal(Math.round(ring.position.x * 100), 100);
  assert.ok(ring.scale.x > 1, 'ring spans the strike range');

  app.state.enemies[0].windup = null;
  app.syncTelegraphs();
  assert.equal(app.telegraphMeshes.size, 0, 'ring clears when the windup resolves');
  assert.equal(ring.parent, null);
  app.destroy();
});

test('hit-stop effects pause simulation stepping', () => {
  const app = new GameApp({ container: {} });
  app.renderEffect({ type: 'hit-stop', durationMs: 85 });
  assert.ok((app.hitStopUntil || 0) > performance.now(), 'hit-stop window is armed');
  app.destroy();
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

test('settings persist separately and drive assist defaults', () => {
  const source = read('src/runtime/GameApp.js');
  const settings = readFileSync(base + 'src/game/settings.js', 'utf8');
  assert.match(source, /from\s+['"]\.\.\/game\/settings\.js['"]/);
  assert.match(source, /loadSettings\(this\.storage\)/);
  assert.match(source, /saveSettings\(this\.storage,\s*this\.settings\)/);
  assert.match(settings, /aizanoi\.dungeon\.settings\.v1/);
  assert.match(source, /dailySeed/);
});

test('blessing pick screen offers 3 cards with reroll and skip', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /showPick\(chest\)/);
  assert.match(source, /pickChoice\(index\)/);
  assert.match(source, /pickReroll\(\)/);
  assert.match(source, /pickSkip\(\)/);
  assert.match(source, /rerollChest/);
  assert.match(source, /chooseBlessing\(this\.state,\s*choice\.id\)/);
  assert.match(source, /Digit1/);
  assert.match(source, /az-dungeon-pick-card/);
  assert.match(source, /az-dungeon-rarity-/);
});

test('defeat offers retry-same-seed and victory offers share text', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /retrySeed\(\)/);
  assert.match(source, /Retry same seed/);
  assert.match(source, /createGameState\(seed\)/);
  assert.match(source, /az-dungeon-share/);
  assert.match(source, /clipboard/);
});

test('gamepad input and haptics are wired without breaking keyboard', () => {
  const source = read('src/runtime/GameApp.js');
  assert.match(source, /pollGamepad/);
  assert.match(source, /getGamepads/);
  assert.match(source, /navigator\.vibrate/);
  assert.match(source, /KeyJ/);
});

test('hit-stop tiers and slow-mo follow the juice table', () => {
  const feedback = readFileSync(base + 'src/ui/feedback.js', 'utf8');
  assert.match(feedback, /stop:\s*30/);
  assert.match(feedback, /stop:\s*60/);
  assert.match(feedback, /stop:\s*100/);
  assert.match(feedback, /stop:\s*120/);
  assert.match(feedback, /slow-mo/);
  const runtime = read('src/runtime/GameApp.js');
  assert.match(runtime, /feedback\.emit\('parry'/);
  assert.match(runtime, /feedback\.emit\('special'/);
});

test('audio carries distinct cues with variants and a volume bus', () => {
  const audio = readFileSync(base + 'src/ui/audio.js', 'utf8');
  for (const cue of ['parry', 'special', 'rhythm', 'focus-shot']) {
    assert.ok(audio.includes(cue), `missing cue ${cue}`);
  }
  assert.match(audio, /variant/);
  assert.match(audio, /setVolumes/);
});
