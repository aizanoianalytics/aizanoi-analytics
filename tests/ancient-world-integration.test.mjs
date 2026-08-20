import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('historical worlds expose the shared Field System return navigation', () => {
  const aizanoi = read('frontend/historic-world/index.html');
  const rome = read('frontend/ancient-cities/rome-410-476/js/app.js');
  const navigation = read('frontend/ancient-world/engine/navigation.js');
  assert.match(aizanoi, /installBackToOS/);
  assert.match(aizanoi, /__ANCIENT_WORLD_DEBUG__/);
  assert.match(rome, /installBackToOS/);
  assert.match(rome, /__ANCIENT_WORLD_DESTROY__/);
  assert.match(navigation, /label = '← Field System'/);
  assert.match(navigation, /Return to the Aizanoi Field System/);
  assert.doesNotMatch(navigation, /label = '← Aizanoi OS'/);
});

test('Rome uses shared traversal and human-scale first-person movement', () => {
  const rome = read('frontend/ancient-cities/rome-410-476/js/app.js');
  assert.match(rome, /createTraversalSystem/);
  assert.match(rome, /EYE_HEIGHT\s*=\s*1\.68/);
  assert.match(rome, /WALK_SPEED\s*=\s*3\.8/);
  assert.match(rome, /SPRINT_SPEED\s*=\s*7\.2/);
  assert.match(rome, /moveWithSubsteps/);
  assert.doesNotMatch(rome, /keys\.Shift\s*\?\s*120\s*:\s*55/);
});

test('Rome roads follow source polylines and terrain instead of axis-aligned boxes', () => {
  const rome = read('frontend/ancient-cities/rome-410-476/js/app.js');
  assert.match(rome, /const pieces = Math\.max\(1, Math\.ceil\(length \/ \(TOUCH \? 30 : 22\)\)\)/);
  assert.match(rome, /terrainHeightAt\(x0, z0\)/);
  assert.match(rome, /quad\(\s*\[x0 \+ nx \* half/);
});

test('Rome renderer has normals, cached shader locations and lifecycle cleanup', () => {
  const rome = read('frontend/ancient-cities/rome-410-476/js/app.js');
  assert.match(rome, /attribute vec3 aN/);
  assert.match(rome, /const locations = Object\.freeze/);
  assert.match(rome, /createLifecycle/);
  assert.match(rome, /pagehide/);
});
