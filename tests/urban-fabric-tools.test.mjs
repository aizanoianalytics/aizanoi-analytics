import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deterministicHash,
  nearestStreet,
  overlapsNamedBuilding,
  overlapsFabric,
  overlapsClearZones,
  regionalPlacementTarget,
  URBAN_FABRIC_TOOLKIT,
} from '../frontend/ancient-world/assets/urban-fabric-tools.js';

const streets = [{ width:8, points:[[0,0],[100,0]] }];

test('urban fabric toolkit is deterministic and geometry-neutral', () => {
  assert.equal(deterministicHash('aizanoi'), deterministicHash('aizanoi'));
  assert.notEqual(deterministicHash('aizanoi'), deterministicHash('rome'));
  assert.equal(URBAN_FABRIC_TOOLKIT.archaeologicalClaims, false);
});

test('nearest street preserves street-facing placement math', () => {
  const nearest = nearestStreet(40, 12, streets);
  assert.ok(nearest);
  assert.ok(Math.abs(nearest.distance - 12) < 0.001);
  assert.ok(Math.abs(nearest.angle) < 0.001);
});

test('shared overlap helpers protect named and inferred footprints', () => {
  const named = [{ type:'temple', x:0, z:0, w:30, d:20, h:15 }];
  assert.equal(overlapsNamedBuilding(10, 0, 8, 8, named), true);
  assert.equal(overlapsNamedBuilding(80, 0, 8, 8, named), false);
  const fabric = [{ x:0, z:0, w:10, d:10 }];
  assert.equal(overlapsFabric(8, 0, 8, 8, fabric, 1), true);
  assert.equal(overlapsFabric(30, 0, 8, 8, fabric, 1), false);
  assert.equal(overlapsClearZones(4, 0, 6, 6, [{ x:0, z:0, radius:5 }]), true);
});

test('regional quotas scale independently for desktop and mobile', () => {
  const region = { w:220, d:180 };
  const desktop = regionalPlacementTarget(region, 0.7, false);
  const mobile = regionalPlacementTarget(region, 0.7, true);
  assert.ok(desktop >= 16 && desktop <= 64);
  assert.ok(mobile >= 10 && mobile <= 32);
  assert.ok(desktop >= mobile);
});
