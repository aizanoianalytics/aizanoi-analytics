import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const root = 'frontend/js/v3/apps/games';
const manifest = JSON.parse(read(`${root}/manifest.json`));
const app = read(`${root}/src/app.js`);
const utils = read(`${root}/assets/game-utils.js`);
const blockfall = read(`${root}/assets/blockfall.js`);

const ownedAssets = ['game-utils.js','snake.js','mines.js','brick.js','blockfall.js'];

test('Aizanoi Arcade keeps the stable games id as a zero-capability module', () => {
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.id, 'games');
  assert.equal(manifest.type, 'desktop-app');
  assert.equal(manifest.entry, './src/index.js');
  assert.equal(manifest.enabledByDefault, true);
  assert.deepEqual(manifest.requires, []);
  assert.deepEqual(manifest.provides, ['desktop-app']);
});

test('canonical registry resolves both games and arcade alias to the module public entry', async () => {
  const registry = await import('../frontend/js/v3/registry.js');
  const games = registry.appById('games');
  assert.equal(games?.module, '/js/v3/apps/games/src/index.js');
  assert.deepEqual([...games.requires], []);
  assert.equal(registry.canonicalAppId('arcade'), 'games');
  assert.equal(registry.canonicalAppId('games'), 'games');
});

test('Arcade owns every playable asset and no legacy shared games path remains', () => {
  for (const asset of ownedAssets) assert.equal(existsSync(`${root}/assets/${asset}`), true, `${asset} missing from Arcade ownership`);
  assert.equal(existsSync('frontend/games'), false, 'legacy frontend/games directory must stay retired');
  assert.equal(existsSync('frontend/js/v3/apps/games.js'), false, 'legacy flat Arcade launcher must stay retired');
  assert.doesNotMatch(app, /['"]\/games\//);
  assert.match(app, /\/js\/v3\/apps\/games\/assets/);
});

test('Arcade owns the local score namespace and compatibility globals stay inside its assets', () => {
  assert.match(utils, /const KEY = 'aizanoi-games'/);
  assert.match(utils, /window\.AizanoiGames/);
  assert.match(blockfall, /window\.AizanoiArcadeBlocks = \{ mount \}/);
  assert.doesNotMatch(app, /localStorage/);
});

test('Arcade launcher and Blockfall declare deterministic teardown behavior', () => {
  assert.match(app, /removeEventListener\('click', click\)/);
  assert.match(app, /scriptNode\?\.remove\(\)/);
  assert.match(app, /gameCleanup\?\.\(\)/);
  assert.match(blockfall, /cancelAnimationFrame\(raf\)/);
  assert.match(blockfall, /document\.removeEventListener\('keydown', keydown\)/);
});
