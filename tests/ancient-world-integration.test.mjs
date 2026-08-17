import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('both historical worlds expose the shared Back to Aizanoi OS navigation', () => {
  const aizanoi = read('frontend/historic-world/index.html');
  const rome = read('frontend/ancient-cities/rome-410-476/js/app.js');
  assert.match(aizanoi, /installBackToOS/);
  assert.match(aizanoi, /__ANCIENT_WORLD_DEBUG__/);
  assert.match(rome, /installBackToOS/);
  assert.match(rome, /__ANCIENT_WORLD_DESTROY__/);
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

test('Rome roads apply their segment angle instead of discarding it', () => {
  const rome = read('frontend/ancient-cities/rome-410-476/js/app.js');
  assert.match(rome, /const angle = Math\.atan2\(dz, dx\)/);
  assert.match(rome, /C\.road, angle\)/);
});

test('Rome renderer has normals, cached shader locations and lifecycle cleanup', () => {
  const rome = read('frontend/ancient-cities/rome-410-476/js/app.js');
  assert.match(rome, /attribute vec3 aN/);
  assert.match(rome, /const locations = Object\.freeze/);
  assert.match(rome, /createLifecycle/);
  assert.match(rome, /pagehide/);
});
