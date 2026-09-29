import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('standalone Dungeon route references canonical assets, not duplicates', () => {
  const html = readFileSync(join(repoRoot, 'frontend/dungeon/index.html'), 'utf8');
  // The standalone route must reference the canonical asset tree, not a local copy.
  assert.match(html, /href="\.\.\/assets\/icons\/aizanoi-dungeon\.svg"/);
  assert.match(html, /href="\.\.\/js\/v3\/apps\/dungeon\/css\//);
  // No local asset references remain.
  assert.doesNotMatch(html, /href="assets\//);
  assert.doesNotMatch(html, /href="css\//);
});

test('no duplicate Dungeon asset tree exists under frontend/dungeon/', () => {
  const dupAssets = join(repoRoot, 'frontend/dungeon/assets');
  const dupCss = join(repoRoot, 'frontend/dungeon/css/game.css');
  assert.ok(!existsSync(dupAssets), 'frontend/dungeon/assets/ must not exist');
  assert.ok(!existsSync(dupCss), 'frontend/dungeon/css/game.css must not exist');
});

test('canonical Dungeon assets are intact', () => {
  const canonicalAssets = join(repoRoot, 'frontend/js/v3/apps/dungeon/assets');
  const canonicalCss = join(repoRoot, 'frontend/js/v3/apps/dungeon/css/game.css');
  assert.ok(existsSync(canonicalAssets), 'canonical assets/ must exist');
  assert.ok(existsSync(canonicalCss), 'canonical css/game.css must exist');
  // Spot-check a few critical assets.
  const sprites = readdirSync(join(canonicalAssets, 'sprites'));
  assert.ok(sprites.includes('aizo.png'), 'aizo.png must exist');
  assert.ok(sprites.includes('enemies.png'), 'enemies.png must exist');
  assert.ok(sprites.includes('structures.png'), 'structures.png must exist');
  const audio = readdirSync(join(canonicalAssets, 'audio'));
  assert.ok(audio.includes('ambient_cave_loop.wav'), 'ambient_cave_loop.wav must exist');
  assert.ok(audio.includes('ancient_chime.wav'), 'ancient_chime.wav must exist');
});
