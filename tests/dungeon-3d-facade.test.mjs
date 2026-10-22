// Section 25: the 3D rewrite of Aizanoi Dungeon must keep the public
// contracts of the old build — one module manifest, one standalone HTML that
// boots the canonical entry directly, the SEO/fullscreen head, and the GLB
// assets the 3D scene loads. Nothing here asserts on rendering; it asserts
// that the facade wiring a visitor reaches is the canonical one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CANONICAL = 'frontend/js/v3/apps/dungeon';
const STANDALONE = 'frontend/dungeon';

test('the dungeon 3d manifest id and entry are valid', () => {
  const manifest = JSON.parse(read(`${CANONICAL}/manifest.json`));
  assert.equal(manifest.manifestVersion, 1, 'manifest schema must stay at version 1');
  assert.equal(manifest.id, 'dungeon', 'the AizanoiOS app id must stay dungeon');
  assert.equal(manifest.type, 'desktop-app', 'the module must remain a desktop app');
  assert.equal(manifest.entry, './src/index.js', 'the entry must point at the 3D module source');
  assert.deepEqual(manifest.requires, [], 'the dungeon must not declare shell requirements');
  assert.ok(existsSync(join(ROOT, CANONICAL, 'src/index.js')),
    'the manifest entry must exist on disk');
});

test('the standalone route is one HTML that loads the canonical 3d bootstrap directly', () => {
  const walk = (dir, files = []) => {
    for (const entry of readdirSync(join(ROOT, dir))) {
      const full = `${dir}/${entry}`;
      if (statSync(join(ROOT, full)).isDirectory()) walk(full, files);
      else files.push(full);
    }
    return files;
  };
  const files = walk(STANDALONE);
  assert.deepEqual(files, [`${STANDALONE}/index.html`],
    `the standalone route must be exactly one HTML, found: ${files.join(', ')}`);

  const html = read(`${STANDALONE}/index.html`);
  const moduleSrc = html.match(/<script type="module" src="([^"]+)"/);
  assert.ok(moduleSrc, 'the standalone route must load a module entry point');
  assert.equal(moduleSrc[1], '../js/v3/apps/dungeon/js/standalone.js',
    `the standalone route must load the canonical 3D bootstrap, got ${moduleSrc[1]}`);
  assert.doesNotMatch(html, /phaser/i,
    'the 3D route must not carry the retired 2D engine');
  assert.doesNotMatch(html, /src="\.\//,
    'the standalone route must not route through a local re-export shim');
});

test('the standalone route keeps its seo head tags and fullscreen contract', () => {
  const html = read(`${STANDALONE}/index.html`);
  assert.match(html,
    /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover">/,
    'the viewport must stay mobile-first with safe-area cover');
  assert.match(html, /<meta name="description" content="[^"]+">/,
    'the route must keep a description for search and sharing');
  assert.match(html, /<link rel="canonical" href="https:\/\/aizanoianalytics\.com\/dungeon\/">/,
    'the canonical URL must stay /dungeon/');
  for (const id of ['game-container', 'fullscreen-btn', 'orientation-warning']) {
    assert.match(html, new RegExp(`id="${id}"`), `the route must keep #${id}`);
  }
  assert.doesNotMatch(html, /app=dungeon|\?app=/,
    'the route must not require the AizanoiOS shell');
});

test('the registry builder check passes for the 3d module', () => {
  assert.doesNotThrow(() => {
    execFileSync('node', ['scripts/modules/build-module-registry.mjs', '--check'], {
      cwd: ROOT,
      stdio: 'pipe',
    });
  }, 'the generated module registry must match the manifests on disk');

  const glbDir = join(ROOT, CANONICAL, 'assets/glb');
  for (const asset of [
    'floor_tile.glb',
    'wall_block.glb',
    'column.glb',
    'hero_knight.glb',
    'enemy_slime_golem.glb',
    'treasure_chest.glb',
    'portal_ring.glb',
  ]) {
    assert.ok(existsSync(join(glbDir, asset)), `the 3D scene must ship ${asset}`);
  }
});
