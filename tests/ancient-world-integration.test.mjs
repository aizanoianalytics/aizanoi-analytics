import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const runtime = read('frontend/ancient-world/engine/flat-city-runtime.js');
const bootstrap = read('frontend/ancient-world/engine/city-bootstrap.js');
const evidenceMode = read('frontend/ancient-world/engine/evidence-mode.js');
const assets = read('frontend/ancient-world/assets/blocky-asset-library.js');
const rome = read('frontend/ancient-cities/rome-410-476/js/app.js');
const athens = read('frontend/ancient-cities/athens-450-430/js/app.js');
const aizanoi = read('frontend/historic-world/app.js');

test('historical worlds expose the shared AizanoiOS return navigation through one bootstrap', () => {
  const navigation = read('frontend/ancient-world/engine/navigation.js');
  for (const source of [rome, athens, aizanoi]) assert.match(source, /startAncientCity/);
  assert.match(bootstrap, /startFlatBlockyCity/);
  assert.match(bootstrap, /installCityCompatibility/);
  assert.match(bootstrap, /installEvidenceMode/);
  assert.match(runtime, /installBackToOS/);
  assert.match(runtime, /__ANCIENT_WORLD_DEBUG__/);
  assert.match(runtime, /__ANCIENT_WORLD_DESTROY__/);
  assert.match(navigation, /label = '← AizanoiOS'/);
  assert.match(navigation, /Return to AizanoiOS/);
  assert.match(navigation, /back-to-aizanoi-os/);
});

test('all cities use one shared human-scale traversal implementation', () => {
  assert.match(runtime, /createTraversalSystem/);
  assert.match(runtime, /EYE_HEIGHT = 1\.68/);
  assert.match(runtime, /WALK_SPEED = 3\.8/);
  assert.match(runtime, /SPRINT_SPEED = 7\.2/);
  assert.match(runtime, /moveWithSubsteps/);
  for (const source of [rome, athens, aizanoi]) {
    assert.match(source, /startAncientCity/);
    assert.doesNotMatch(source, /createTraversalSystem|startFlatBlockyCity|installCityCompatibility/);
  }
});

test('runtime ground is deliberately flat while roads and water remain city data', () => {
  assert.match(runtime, /baseHeightAt:\s*\(\) => 0/);
  assert.match(runtime, /function roadGeometry/);
  assert.match(runtime, /function waterGeometry/);
  assert.doesNotMatch(rome, /terrainHeightAt/);
  assert.doesNotMatch(athens, /terrainHeightAt/);
});

test('shared renderer owns normals, shader locations, lifecycle cleanup and reusable assets', () => {
  assert.match(runtime, /attribute vec3 aN/);
  assert.match(runtime, /const locations = Object\.freeze/);
  assert.match(runtime, /createLifecycle/);
  assert.match(runtime, /pagehide/);
  assert.match(runtime, /createBlockyAssetLibrary/);
  assert.match(assets, /createBlockyAssetLibrary/);
  assert.match(assets, /trueVoxelEngine:\s*false/);
});

test('Research Lens is a shared evidence-aware runtime surface with keyboard and touch-sized controls', () => {
  assert.match(evidenceMode, /Research Lens/);
  assert.match(evidenceMode, /KeyV/);
  assert.match(evidenceMode, /min-width:44px/);
  assert.match(evidenceMode, /min-height:44px/);
  assert.match(evidenceMode, /data-aw-evidence-visit/);
  assert.match(evidenceMode, /teleportTo/);
});
