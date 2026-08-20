import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectTouchExperience, footprintSupport } from '../frontend/ancient-world/engine/city-grounding.js';
import { generateUrbanFabric as generateAthensFabric } from '../frontend/ancient-cities/athens-450-430/data/urban-fabric.js';
import { REGIONS as athensRegions, BUILDINGS as athensBuildings, STREETS as athensStreets } from '../frontend/ancient-cities/athens-450-430/data/city.js';
import { generateUrbanFabric as generateRomeFabric } from '../frontend/ancient-cities/rome-410-476/data/urban-fabric.js';
import { REGIONS as romeRegions, BUILDINGS as romeBuildings, STREETS as romeStreets } from '../frontend/ancient-cities/rome-410-476/data/city.js';

const root = resolve(import.meta.dirname, '..');
const source = (path) => readFileSync(resolve(root, path), 'utf8');

test('touch experience fallback enables city joystick on narrow touch-capable mobile viewports', () => {
  assert.equal(detectTouchExperience({ coarse: false, anyCoarse: false, touchPoints: 0, hasTouchEvent: true, viewportWidth: 390 }), true);
  assert.equal(detectTouchExperience({ coarse: false, anyCoarse: false, touchPoints: 0, hasTouchEvent: false, viewportWidth: 1280 }), false);
  assert.equal(detectTouchExperience({ coarse: true, anyCoarse: false, touchPoints: 0, hasTouchEvent: false, viewportWidth: 1280 }), true);
});

test('legacy footprint helper remains valid for archived topography research', () => {
  const support = footprintSupport({ x: 0, z: 0, w: 20, d: 10, rot: 0 }, (x, z) => x * 0.2 + z * 0.1);
  assert.ok(support.baseY > 1 && support.baseY <= 1.5, `unexpected base ${support.baseY}`);
  assert.ok(support.foundationDepth > 2, `unexpected foundation depth ${support.foundationDepth}`);
  assert.equal(support.samples.length, 9);
});

test('runtime, not each city adapter, owns mobile detection and flat support', () => {
  const runtime = source('frontend/ancient-world/engine/flat-city-runtime.js');
  assert.match(runtime, /installMobileControls/);
  assert.match(runtime, /baseHeightAt:\s*\(\) => 0/);
  assert.match(runtime, /EYE_HEIGHT = 1\.68/);
  for (const app of [
    'frontend/ancient-cities/rome-410-476/js/app.js',
    'frontend/ancient-cities/athens-450-430/js/app.js',
  ]) {
    const text = source(app);
    assert.match(text, /startFlatBlockyCity/);
    assert.doesNotMatch(text, /footprintSupport|buildFoundation|terrainHeightAt/);
  }
});

test('urban fabric reaches a street-scale density without changing evidence status', () => {
  const athens = generateAthensFabric({ regions: athensRegions, buildings: athensBuildings, streets: athensStreets, mobile: false });
  const rome = generateRomeFabric({ regions: romeRegions, buildings: romeBuildings, streets: romeStreets, mobile: false, tiberX: -505 });
  assert.ok(athens.length >= 250, `Athens remains too sparse: ${athens.length}`);
  assert.ok(rome.length >= 260, `Rome remains too sparse: ${rome.length}`);
  assert.ok([...athens, ...rome].every((building) => building.evidence?.level === 'plausible'));
});
