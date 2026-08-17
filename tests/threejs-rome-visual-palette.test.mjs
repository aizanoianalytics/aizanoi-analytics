import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const palette = read('experiments/threejs-rome-renderer/src/visual-palette.js');
const main = read('experiments/threejs-rome-renderer/src/main.js');

test('terrain vertex colors enter Three.js through color-managed hex values', () => {
  assert.match(palette, /new THREE\.Color\(ROME_VISUAL_PALETTE\.terrainLow\)/);
  assert.match(palette, /new THREE\.Color\(ROME_VISUAL_PALETTE\.terrainMid\)/);
  assert.match(palette, /new THREE\.Color\(ROME_VISUAL_PALETTE\.terrainHigh\)/);
  assert.match(main, /createTerrainColorSampler/);
  assert.match(main, /colors\.push\(\.\.\.terrainColorAt\(x, z, y\)\)/);
  assert.doesNotMatch(main, /colors\.push\(0\.34 \* shade/);
});

test('terrain palette keeps deterministic broad and fine micro-variation', () => {
  assert.match(palette, /const broad =/);
  assert.match(palette, /const grain =/);
  assert.match(palette, /Math\.max\(0\.82, Math\.min\(1\.10, 0\.95 \+ broad \+ grain\)\)/);
  assert.doesNotMatch(palette, /Math\.random/);
});

test('renderer palette keeps inferred walls, eaves, roofs, sky and fog centralized', () => {
  assert.match(palette, /urbanWalls:/);
  assert.match(palette, /urbanEaves:/);
  assert.match(palette, /roofs:/);
  assert.match(palette, /sky:/);
  assert.match(palette, /fog:/);
  assert.match(main, /ROME_VISUAL_PALETTE\.urbanWalls/);
  assert.match(main, /ROME_VISUAL_PALETTE\.urbanEaves/);
  assert.match(main, /ROME_VISUAL_PALETTE\.roofs/);
  assert.match(main, /ROME_VISUAL_PALETTE\.sky/);
  assert.match(main, /ROME_VISUAL_PALETTE\.fog/);
});

test('inferred urban fabric uses one instanced eave layer between walls and roofs', () => {
  assert.match(main, /new THREE\.InstancedMesh\(eaveGeometry, eaveMaterial, count\)/);
  assert.match(main, /eaves\.name = 'Plausible urban fabric eave bands'/);
  assert.match(main, /eaves\.instanceMatrix\.needsUpdate = true/);
  assert.match(main, /scene\.add\(walls, eaves, roofs\)/);
});
