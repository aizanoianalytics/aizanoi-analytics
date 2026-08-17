import test from 'node:test';
import assert from 'node:assert/strict';
import { defineAncientCity, validateAncientCity, cityCapabilities, CITY_CONTRACT_VERSION } from '../frontend/ancient-world/engine/city-contract.js';
import { ROME_MANIFEST, ROME_CAPABILITIES } from '../frontend/ancient-cities/rome-410-476/data/manifest.js';

function baseCity(overrides = {}) {
  return {
    id: 'test-city',
    title: 'TEST CITY',
    period: 'Test period',
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawn: { x: 0, z: 0 },
    districts: [{ id: 'd1', name: 'District' }],
    roads: [{ id: 'r1', name: 'Road' }],
    monuments: [{ id: 'm1', name: 'Monument', state: 'standing', source: 'source' }],
    teleportTargets: [{ id: 't1', monumentId: 'm1', position: { x: 5, z: 5 } }],
    ...overrides,
  };
}

test('city contract normalizes a valid renderer-neutral manifest', () => {
  const city = defineAncientCity(baseCity());
  assert.equal(city.contractVersion, CITY_CONTRACT_VERSION);
  assert.equal(city.monuments[0].evidence.id, 'documented');
  assert.equal(city.districts[0].evidence.id, 'documented');
  assert.equal(city.performance.maxPixelRatioMobile, 1.15);
});

test('city contract rejects duplicate ids and broken teleport references', () => {
  assert.throws(() => defineAncientCity(baseCity({
    monuments: [{ id: 'm1' }, { id: 'm1' }],
  })), /Duplicate monuments id/);

  assert.throws(() => defineAncientCity(baseCity({
    teleportTargets: [{ id: 't1', monumentId: 'missing', position: { x: 0, z: 0 } }],
  })), /references missing monument/);
});

test('city contract rejects spawn and teleport positions outside world bounds', () => {
  assert.throws(() => defineAncientCity(baseCity({ spawn: { x: 500, z: 0 } })), /spawn must be inside/);
  assert.throws(() => defineAncientCity(baseCity({
    teleportTargets: [{ id: 't1', monumentId: 'm1', position: { x: 0, z: 500 } }],
  })), /outside city\.bounds/);
});

test('validateAncientCity returns a non-throwing diagnostic result', () => {
  const result = validateAncientCity({ id: 'broken' });
  assert.equal(result.ok, false);
  assert.equal(result.city, null);
  assert.ok(result.errors[0].length > 0);
});

test('Rome publishes a valid shared city manifest and capabilities', () => {
  assert.equal(ROME_MANIFEST.id, 'rome-410-476');
  assert.equal(ROME_MANIFEST.contractVersion, CITY_CONTRACT_VERSION);
  assert.equal(ROME_MANIFEST.terrain.physicsMatchesVisibleSurface, true);
  assert.equal(ROME_CAPABILITIES.monuments, ROME_MANIFEST.monuments.length);
  assert.ok(ROME_CAPABILITIES.teleportTargets >= 8);
  assert.ok(ROME_CAPABILITIES.evidenceLevels.includes('documented'));
  assert.deepEqual(cityCapabilities(ROME_MANIFEST), ROME_CAPABILITIES);
});
