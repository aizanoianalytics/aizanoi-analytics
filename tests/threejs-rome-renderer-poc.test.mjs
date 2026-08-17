import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const packageJson = JSON.parse(read('experiments/threejs-rome-renderer/package.json'));
const index = read('experiments/threejs-rome-renderer/index.html');
const main = read('experiments/threejs-rome-renderer/src/main.js');
const adapter = read('experiments/threejs-rome-renderer/src/rome-adapter.js');
const vendorScript = read('experiments/threejs-rome-renderer/scripts/vendor-three.mjs');

test('Three.js PoC pins its renderer dependency and vendors it locally', () => {
  assert.equal(packageJson.dependencies.three, '0.185.1');
  assert.match(packageJson.scripts.prepare, /npm run vendor/);
  assert.match(vendorScript, /node_modules\/three\/build\/three\.module\.js/);
  assert.match(vendorScript, /vendor.*three\.module\.js/s);
  assert.doesNotMatch(index, /https?:\/\//);
  assert.doesNotMatch(main, /https?:\/\//);
});

test('Three.js PoC consumes shared Rome contracts instead of inventing a new physics engine', () => {
  assert.match(adapter, /ROME_MANIFEST/);
  assert.match(adapter, /terrainHeightAt/);
  assert.match(adapter, /generateUrbanFabric/);
  assert.match(adapter, /createTraversalSystem/);
  assert.match(adapter, /walkRamp/);
  assert.match(main, /createAdaptiveQualityController/);
  assert.match(main, /simulation\.traversal\.moveWithSubsteps/);
});

test('Three.js PoC remains explicitly isolated from production', () => {
  assert.match(index, /not production/i);
  assert.match(index, /Renderer PoC unavailable/);
  assert.match(main, /__ROME_THREE_POC__/);
});
