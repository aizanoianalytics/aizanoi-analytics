import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const moduleRoot = 'frontend/js/v3/apps/dungeon';
const manifest = JSON.parse(read(`${moduleRoot}/manifest.json`));
const registry = read('frontend/js/v3/registry.js');
const brandPlatform = read('frontend/js/v3/brand-platform.js');
const entrySource = read(`${moduleRoot}/src/index.js`);
const mainSource = read(`${moduleRoot}/js/main.js`);
const standaloneSource = read(`${moduleRoot}/js/standalone.js`);
const shellMain = read('frontend/js/v3/main.js');

test('Aizanoi Dungeon is a zero-capability desktop-app module', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'dungeon');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, []);
  assert.deepEqual(manifest.provides, ['desktop-app']);
  assert.ok(existsSync(`${moduleRoot}/index.md`), 'module must document itself');
  assert.ok(existsSync(`${moduleRoot}/src/index.js`), 'public entry must exist');
  assert.ok(existsSync(`${moduleRoot}/js/main.js`), 'module-owned Phaser bootstrap must exist');
});

test('canonical registry catalogs Dungeon and keeps the desktop contract', async () => {
  const { appById } = await import('../frontend/js/v3/registry.js');
  const dungeon = appById('dungeon');
  assert.equal(dungeon?.module, '/js/v3/apps/dungeon/src/index.js');
  assert.equal(dungeon?.label, 'Aizanoi Dungeon');
  assert.equal(dungeon?.short, 'Dungeon');
  assert.equal(dungeon?.group, 'explore');
  assert.match(registry, /id:'dungeon', label:'Aizanoi Dungeon', short:'Dungeon'/);
  assert.match(registry, /moduleId:'dungeon'/);
  assert.match(registry, /\/assets\/icons\/aizanoi-dungeon\.svg/);
  assert.ok(existsSync('frontend/assets/icons/aizanoi-dungeon.svg'), 'icon must exist');
});

test('Dungeon stays on the hand-curated DESKTOP list with an accessible shortcut', () => {
  assert.match(brandPlatform, /'games','dungeon','recycle-bin'/, 'DESKTOP literal must keep dungeon');
  assert.match(brandPlatform, /aria-label="Open \$\{esc\(app\.label\)\}"/);
  assert.match(brandPlatform, /\$\{esc\(app\.short\|\|app\.label\)\}/);
});

test('Dungeon manifest is pinned in the publish JSON allow-list', () => {
  const boundary = read('tests/audit/security-publish-boundary.test.mjs');
  assert.ok(boundary.includes('apps\\/dungeon\\/manifest\\.json'));
});

test('Dungeon is a fullscreen app, not a windowed one', () => {
  const shell = read('frontend/js/v3/shell.js');
  assert.match(registry, /id:'dungeon'[^}]*fullscreen:true/, 'registry must flag dungeon fullscreen');
  assert.match(shell, /app\.fullscreen \? createFullscreenSurface\(app\) : createWindow\(app\)/, 'shell must mount dungeon on the fullscreen layer');
  assert.match(shell, /az-fullscreen-app/, 'shell must define the fullscreen surface');
});

test('Dungeon mount clears the shell placeholder and reports load failure visibly', async () => {
  const entry = await import('../frontend/js/v3/apps/dungeon/src/index.js');
  assert.equal(typeof entry.mount, 'function');
  assert.match(entrySource, /container\.replaceChildren\(\)/, 'mount must clear the Opening placeholder before appending');
  assert.match(entrySource, /aizanoi-dungeon-error/);
  assert.match(entrySource, /role.*alert/);
  assert.match(entrySource, /stopDungeonGame\(gameInstance\)/);
  assert.match(entrySource, /wrapper\.remove\(\)/);
  assert.doesNotMatch(entrySource, /innerHTML/);
  assert.doesNotMatch(entrySource, /\bapi\./, 'zero-capability module must not use api capabilities');
  assert.doesNotMatch(entrySource, /workspace\//);
});

test('Dungeon standalone entry shows a visible error when Phaser fails', () => {
  assert.match(standaloneSource, /console\.error\('\[Aizanoi Dungeon\] Baslatma hatasi:'/);
  assert.match(standaloneSource, /aizanoi-dungeon-error/);
  assert.match(standaloneSource, /role.*alert/);
});

test('Dungeon loads Phaser from one self-hosted vendor attempt only', () => {
  assert.match(mainSource, /script\.src = '\/vendor\/phaser\.min\.js'/);
  assert.doesNotMatch(mainSource, /fallback\.src|fallback = document\.createElement/, 'a retry to the same local URL is not a real fallback');
  assert.match(mainSource, /reject\(new Error\('Phaser runtime could not be loaded from local vendor\.'/);
  assert.doesNotMatch(mainSource, /cdn\.jsdelivr|unpkg\.com|cdnjs/, 'CSP script-src self forbids CDN loads');
  const page = read('frontend/dungeon/index.html');
  assert.match(page, /<script src="\/vendor\/phaser\.min\.js"><\/script>/);
  assert.doesNotMatch(page, /cdn\.jsdelivr|unpkg\.com|cdnjs/);
});

test('SkillTree overlay pauses the game like the Shop overlay', () => {
  const skillTree = read(`${moduleRoot}/js/scenes/SkillTreeScene.js`);
  assert.match(skillTree, /if \(this\.gameScene\) this\.gameScene\.scene\.pause\(\)/);
});

test('touch interact and the E key share the player.isInBase gate', () => {
  const touch = read(`${moduleRoot}/js/systems/TouchControls.js`);
  assert.match(touch, /this\.scene\.player\.isInBase/);
  assert.doesNotMatch(touch, /nearAltar/, 'GameScene has no altar concept outside isInBase');
  const game = read(`${moduleRoot}/js/scenes/GameScene.js`);
  assert.match(game, /if \(this\.player\.isInBase\) this\.scene\.launch\('ShopScene'\)/);
});

test('endless wave scaling is capped at wave 20 with light loot scaling', () => {
  const game = read(`${moduleRoot}/js/scenes/GameScene.js`);
  assert.ok((game.match(/Math\.min\(this\.endlessWave, 20\)/g) || []).length >= 3,
    'enemy count, hp/damage and loot scaling must all use the capped wave');
  assert.match(game, /rewardMult = 1 \+ 0\.04 \* \(cappedWave - 1\)/);
  assert.ok(Math.pow(1.15, 19) < 15, `hp cap ~${Math.pow(1.15, 19).toFixed(1)}x stays bounded`);
  assert.ok(Math.pow(1.10, 19) < 7, `damage cap ~${Math.pow(1.10, 19).toFixed(1)}x stays bounded`);
  assert.ok(Math.abs((1 + 0.04 * 19) - 1.76) < 0.001, 'wave-20 loot multiplier is 1.76x');
});

test('keyboard: ESC closes inventory, M mutes, P pauses; mouse dead zones are 48px', () => {
  const game = read(`${moduleRoot}/js/scenes/GameScene.js`);
  assert.match(game, /addKeys\('W,A,S,D,Q,R,E,I,M,P,TAB,SPACE,ESC,F,B'\)/);
  assert.match(game, /JustDown\(this\.wasd\.M\)\) audioManager\.toggleMute\(\)/);
  assert.match(game, /JustDown\(this\.wasd\.P\)\) this\.togglePause\(\)/);
  assert.match(game, /togglePause\(\) \{/);
  assert.match(game, /pointer\.x > 48 && pointer\.x < this\.scale\.width - 48/);
  const inventory = read(`${moduleRoot}/js/scenes/InventoryScene.js`);
  assert.match(inventory, /keydown-ESC/);
});

test('MenuScene clears saves through InventorySystem.clear and uses symbolic endless index', () => {
  const menu = read(`${moduleRoot}/js/scenes/MenuScene.js`);
  assert.match(menu, /InventorySystem\.clear\(\)/);
  assert.doesNotMatch(menu, /new \(class/);
  assert.match(menu, /chapterIndex: LEVELS\.length - 1, isEndless: true/);
  const victory = read(`${moduleRoot}/js/scenes/VictoryScene.js`);
  assert.match(victory, /chapterIndex: LEVELS\.length - 1, isEndless: true/);
  const inventorySystem = read(`${moduleRoot}/js/systems/InventorySystem.js`);
  assert.match(inventorySystem, /static clear\(\) \{/);
});

function stubStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    has: (key) => store.has(key),
  };
}

test('save migration: v1 moves to v2 lossless with unknown skills filtered and stats clamped', async () => {
  const storage = stubStorage({
    aizanoi_dungeon_save_v1: JSON.stringify({
      level: 5,
      currentXp: 10,
      gold: 250,
      unlockedSkills: ['sharp_shards', 'bogus_skill_xyz', 'wind_glide'],
      highestWave: 7,
      currentChapter: 3,
      stats: { enemiesKilled: -5, bossesDefeated: 'NaN', totalGoldCollected: 1e15, hacked: 123 },
    }),
  });
  globalThis.localStorage = storage;
  try {
    const { ProgressionSystem } = await import('../frontend/js/v3/apps/dungeon/js/systems/ProgressionSystem.js');
    const prog = new ProgressionSystem();
    assert.equal(prog.level, 5);
    assert.equal(prog.gold, 250);
    assert.deepEqual([...prog.unlockedSkills].sort(), ['sharp_shards', 'wind_glide']);
    assert.equal(prog.highestWave, 7);
    assert.equal(prog.currentChapter, 3);
    assert.equal(prog.stats.enemiesKilled, 0);
    assert.equal(prog.stats.bossesDefeated, 0);
    assert.equal(prog.stats.totalGoldCollected, 1000000000);
    assert.ok(!('hacked' in prog.stats), 'unknown stat keys are dropped');
    assert.equal(storage.has('aizanoi_dungeon_save_v1'), false, 'legacy key moves, not copies');
    assert.ok(storage.has('aizanoi_dungeon_save_v2'), 'migrated save persists under v2');
    const persisted = JSON.parse(storage.getItem('aizanoi_dungeon_save_v2'));
    assert.deepEqual(persisted.unlockedSkills.sort(), ['sharp_shards', 'wind_glide']);
  } finally {
    delete globalThis.localStorage;
  }
});

test('standalone and module trees stay byte-identical for shared game code', async () => {
  const { execFileSync } = await import('node:child_process');
  let out = '';
  try {
    out = execFileSync('diff', ['-rq', 'frontend/dungeon', 'frontend/js/v3/apps/dungeon'], { encoding: 'utf8' });
  } catch (err) {
    out = err.stdout || '';
  }
  const lines = out.trim().split('\n').filter(Boolean);
  const allowed = new Set([
    'Only in frontend/js/v3/apps/dungeon: DOCUMENTATION.md',
    'Only in frontend/dungeon: index.html',
    'Only in frontend/js/v3/apps/dungeon: index.md',
    'Only in frontend/js/v3/apps/dungeon: manifest.json',
    'Only in frontend/js/v3/apps/dungeon: src',
  ]);
  assert.deepEqual(lines.filter((line) => !allowed.has(line)), []);
});
