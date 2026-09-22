import test from 'node:test';
import assert from 'node:assert/strict';
import { compactAizanoiLayout } from '../frontend/worlds/aizanoi-225/js/city-data.js';
import { SPAWN as ROME_SPAWN, BUILDINGS as ROME_BUILDINGS } from '../frontend/worlds/rome-410-476/js/city-data.js';
import { SPAWN as ATHENS_SPAWN, BUILDINGS as ATHENS_BUILDINGS } from '../frontend/worlds/athens-450-430/js/city-data.js';
import { compactAirportLayout } from '../frontend/worlds/iga-airport/js/airport-data.js';

function facingAlignment(spawn, target) {
  const fx = Math.sin(spawn.angle);
  const fz = Math.cos(spawn.angle);
  const dx = target.x - spawn.x;
  const dz = target.z - spawn.z;
  const length = Math.hypot(dx, dz);
  return (fx * dx + fz * dz) / length;
}

const cases = [
  ['Aizanoi', compactAizanoiLayout(), 'temple'],
  ['Rome', { SPAWN: ROME_SPAWN, BUILDINGS: ROME_BUILDINGS }, 'colosseum'],
  ['Athens', { SPAWN: ATHENS_SPAWN, BUILDINGS: ATHENS_BUILDINGS }, 'parthenon'],
  ['IGA', compactAirportLayout(), 'terminal'],
];

for (const [name, world, landmarkId] of cases) {
  test(`${name} arrival faces a readable primary landmark`, () => {
    const target = world.BUILDINGS.find((building) => building.id === landmarkId);
    assert.ok(target, `${name} primary landmark missing`);
    assert.ok(
      facingAlignment(world.SPAWN, target) >= 0.75,
      `${name} spawn faces away from ${landmarkId}`,
    );
  });
}
