import test from 'node:test';
import assert from 'node:assert/strict';
import { createRomeSimulation } from '../experiments/threejs-rome-renderer/src/rome-adapter.js';

function placePlayer(simulation, x, z) {
  const start = simulation.traversal.resolveSpawn(x, z, 24);
  const support = simulation.traversal.absoluteSupportAt(start.x, start.z);
  simulation.player.x = start.x;
  simulation.player.z = start.z;
  simulation.player.floorY = support.y;
  simulation.player.surfaceTag = support.tag;
  simulation.player.y = support.y + 1.68;
  return start;
}

test('Three.js Rome adapter prevents tunnelling through a solid named monument', () => {
  const simulation = createRomeSimulation({ mobile: false });
  const monument = simulation.buildings.find((item) => item.id === 'curia');
  assert.ok(monument, 'Curia collider fixture should exist');

  const start = placePlayer(simulation, monument.x - monument.w / 2 - 4, monument.z);
  const intendedDistance = monument.w + 18;
  const moved = simulation.traversal.moveWithSubsteps(intendedDistance, 0);

  assert.equal(moved, true, 'player should move until reaching the obstacle');
  assert.ok(simulation.player.x > start.x, 'player should advance toward the obstacle');
  assert.ok(simulation.player.x < monument.x - monument.w / 2, 'player must remain outside the solid footprint');
  assert.equal(simulation.traversal.collide(simulation.player.x, simulation.player.z), false, 'final player position must remain non-colliding');
});

test('Three.js Rome adapter preserves diagonal wall slide instead of sticking at a collider', () => {
  const simulation = createRomeSimulation({ mobile: false });
  const monument = simulation.buildings.find((item) => item.id === 'curia');
  assert.ok(monument, 'Curia collider fixture should exist');

  const start = placePlayer(simulation, monument.x - monument.w / 2 - 4, monument.z);
  const moved = simulation.traversal.moveWithSubsteps(10, 10);

  assert.equal(moved, true, 'diagonal movement should make progress');
  assert.ok(simulation.player.x > start.x, 'player should approach the wall before contact');
  assert.ok(simulation.player.x < monument.x - monument.w / 2, 'wall-normal movement should remain blocked');
  assert.ok(simulation.player.z > start.z + 4, 'tangential movement should continue along the wall');
  assert.equal(simulation.traversal.collide(simulation.player.x, simulation.player.z), false, 'wall slide must end outside all colliders');
});

test('Three.js Rome adapter exposes Pons Aelius deck support above terrain', () => {
  const simulation = createRomeSimulation({ mobile: false });
  const bridge = simulation.buildings.find((item) => item.id === 'pons-aelius');
  assert.ok(bridge, 'Pons Aelius fixture should exist');

  const support = simulation.traversal.absoluteSupportAt(bridge.x, bridge.z);
  const terrain = simulation.terrainHeightAt(bridge.x, bridge.z);

  assert.match(support.tag, /pons-aelius deck/);
  assert.ok(support.y > terrain + 4, 'bridge deck must sit materially above river terrain support');
  assert.equal(simulation.traversal.collide(bridge.x, bridge.z), false, 'bridge deck location must remain traversable');
});

test('Three.js Rome adapter blocks the Tiber except through the Pons Aelius gap', () => {
  const simulation = createRomeSimulation({ mobile: false });
  const riverX = simulation.tiber.x;

  assert.equal(simulation.traversal.collide(riverX, 0), true, 'Tiber water outside the bridge gap must be a hazard');
  assert.equal(simulation.traversal.collide(riverX, 95), false, 'Pons Aelius gap must remain traversable');
});
