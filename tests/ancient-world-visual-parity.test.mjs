import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const rome = read('frontend/ancient-cities/rome-410-476/js/app.js');
const athens = read('frontend/ancient-cities/athens-450-430/js/app.js');
const shader = read('frontend/ancient-world/engine/surface-shader.js');
const environment = read('frontend/ancient-world/engine/environment-renderer.js');
const materials = read('frontend/ancient-world/assets/materials.js');

// Teleport safety is a movement-quality contract: a spawn must have usable
// forward space, not merely sit outside the destination collider.
test('teleports prefer a spawn with forward walking clearance', () => {
  for (const source of [rome, athens]) {
    assert.match(source, /teleportForwardClearance/);
    assert.match(source, /candidate\.clearance >= 3/);
    assert.match(source, /building\.d \* 0\.84/);
  }
});

test('Rome and Athens use the same horizontal mouse-look convention as Aizanoi', () => {
  for (const source of [rome, athens]) {
    assert.match(source, /player\.yaw \+= dx \* horizontal/);
    assert.doesNotMatch(source, /player\.yaw -= event\.movementX/);
    assert.match(source, /mouseDragDistance/);
    assert.match(source, /setPointerCapture/);
  }
});

test('shared renderer carries Aizanoi-derived material and atmosphere detail', () => {
  assert.match(shader, /gridLine/);
  assert.match(shader, /roofMask/);
  assert.match(shader, /course/);
  assert.match(environment, /fbm/);
  assert.match(environment, /createAncientSkyRenderer/);
  assert.match(environment, /createAncientWaterRenderer/);
  assert.match(environment, /shimmer/);
});

test('both cities render shared sky and animated water passes', () => {
  for (const source of [rome, athens]) {
    assert.match(source, /createAncientSkyRenderer/);
    assert.match(source, /createAncientWaterRenderer/);
    assert.match(source, /skyRenderer\.draw/);
    assert.match(source, /waterRenderer\.draw/);
    assert.match(source, /ANCIENT_CITY_FRAGMENT_SHADER/);
  }
});

test('street-level urban fabric has Aizanoi-style human-scale facade cues', () => {
  assert.match(rome, /addRomanStreetDetail/);
  assert.match(rome, /shopfront/);
  assert.match(rome, /C\.darkStone/);
  assert.match(athens, /addAthenianStreetDetail/);
  assert.match(athens, /C\.plaster2/);
  assert.match(athens, /C\.roof2/);
  assert.match(materials, /limestone2/);
  assert.match(materials, /plaster3/);
  assert.match(materials, /roof2/);
});

test('spectacle and hero buildings no longer rely only on generic massing', () => {
  for (const source of [rome, athens]) {
    assert.match(source, /Stepped semicircular cavea/);
  }
  assert.match(rome, /maxentiusHero/);
  assert.match(athens, /parthenonHero/);
  assert.match(athens, /propylaeaHero/);
});
