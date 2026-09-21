import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadFlyHouseRuntime, initialFlyBody } from '../services/fly-simulation/runtime.mjs';
import { FlySimulation, FlyWireLC4EscapeController, HeuristicBaselineController, checkpoint, restore, stateHash } from '../frontend/labs/fly-simulation/index.js';

const rootDir = resolve(process.cwd());

test('real Fly House physics artifact validates against environment and GLB identities', async () => {
  const runtime = await loadFlyHouseRuntime({ rootDir });
  assert.equal(runtime.environment.hash, '56dd975756fe1441eb6ac65930bad93c0bc177dd34e163e2fb16649f691587a8');
  assert.equal(runtime.environment.glbHash, '5b8168b415233ae119cc691d89c8d853b17274145ef0335aa8da7056996ee07a');
  assert.equal(runtime.physics.schemaVersion, 'fly-physics-2');
  assert.equal(runtime.hashes.physicsArtifactHash, '7096e8dd435e717815cb29344d0aec968a4228b09fb7e8468ee098c1748eeffc');
  assert.deepEqual(runtime.physics.colliders.map((collider) => collider.id), ['stove', 'tv-cabinet', 'divan', 'major-cabinet', 'food-support', 'bed-frame', 'bedside-table']);
  assert.equal(runtime.environment.raycast([0, .6, 1], [1, 0, 0], 10).surfaceId, 'stove');
  assert.equal(runtime.environment.raycast([-.5, 3, 1], [0, 1, 0], 10).surfaceId, 'major-cabinet');
  assert.equal(runtime.environment.raycast([-.75, 3, 1.55], [0, 1, 0], 10).surfaceId, 'food-support');
});

test('real artifact executes sensor-controller-motor-body loop and exposes food field', async () => {
  const runtime = await loadFlyHouseRuntime({ rootDir });
  const sim = new FlySimulation(runtime.environment, {
    fixedDt: 1 / 60,
    gravity: [0, 0, -9.81],
    motorLimits: { thrust: .00005, pitch: .02, yaw: .02, roll: .02 },
    controller: new HeuristicBaselineController()
  });
  sim.addFly({ flyId: 'real-fly', body: initialFlyBody({ spawn: [-1.85, -2.15, 1] }) });
  for (let index = 0; index < 120; index += 1) sim.stepOne();
  const fly = sim.getFly('real-fly');
  assert.equal(fly.controller.name, 'HEURISTIC BASELINE CONTROLLER');
  assert.equal(fly.sensors.provenance.channels.label, 'MODELLED');
  assert.notEqual(fly.sensors.channels.olfaction.status, 'UNAVAILABLE');
  assert.notDeepEqual(fly.body.position.toJSON(), [-1.85, -2.15, 1]);
  const food = runtime.physics.fields.food[0].center;
  const foodSim = new FlySimulation(runtime.environment, { fixedDt: 1 / 60, gravity: [0, 0, -9.81], controller: new HeuristicBaselineController(), motorLimits: { thrust: .00005, pitch: .02, yaw: .02, roll: .02 } });
  foodSim.addFly({ flyId: 'food-fly', body: initialFlyBody({ spawn: food }) });
  assert.equal(foodSim.getFly('food-fly').sensors.channels.olfaction.value, 1);
  assert.equal(foodSim.getFly('food-fly').sensors.channels.taste.status, 'AVAILABLE');
});

test('FlyWire controller result keeps motors separate from controller state', async () => {
  const runtime = await loadFlyHouseRuntime({ rootDir });
  const controller = new FlyWireLC4EscapeController(runtime.connectome);
  const sim = new FlySimulation(runtime.environment, { fixedDt: 1 / 60, gravity: [0, 0, -9.81], controller, motorLimits: { thrust: .00005, pitch: .02, yaw: .02, roll: .02 } });
  const result = controller.step({ channels: { vision: { looming: .8 } }, contact: { grounded: false } }, {});
  assert.equal(result.motors.pitch > 0, true);
  assert.equal(result.state.edgeCount, 265);
  assert.equal(result.state.totalSynapses, 1924);
  assert.equal(result.state.transduction, 'MODELLED');
  assert.notEqual(result.motors.edgeCount, 265);
});


test('real runtime depenetrates a fly that starts inside an authored furniture collider', async () => {
  const runtime = await loadFlyHouseRuntime({ rootDir });
  const sim = new FlySimulation(runtime.environment, { fixedDt: 1 / 60, gravity: [0, 0, 0] });
  sim.addFly({ flyId: 'inside-stove', body: initialFlyBody({ spawn: [2.15, .6, .59] }) });
  sim.step(0);
  const position = sim.getFly('inside-stove').body.position;
  const stove = runtime.physics.colliders.find((collider) => collider.id === 'stove');
  const [min, max] = stove.bounds;
  assert.equal(position.x < min[0] || position.x > max[0] || position.y < min[1] || position.y > max[1] || position.z < min[2] || position.z > max[2], true);
});
test('controller state is included in checkpoint identity and restores deterministically', async () => {
  const runtime = await loadFlyHouseRuntime({ rootDir });
  const options = { fixedDt: 1 / 60, gravity: [0, 0, -9.81], controller: new HeuristicBaselineController(), motorLimits: { thrust: .00005, pitch: .02, yaw: .02, roll: .02 } };
  const first = new FlySimulation(runtime.environment, options);
  first.addFly({ flyId: 'checkpoint-fly', body: initialFlyBody() });
  first.stepN(10);
  const cp = checkpoint(first);
  assert.equal(cp.flies[0].controller, 'HEURISTIC BASELINE CONTROLLER');
  const second = new FlySimulation(runtime.environment, options);
  restore(second, cp);
  assert.equal(stateHash(second), stateHash(first));
});
test('checkpoint restores dynamic food fields before the next sensor frame', async () => {
  const firstRuntime = await loadFlyHouseRuntime({ rootDir });
  const food = firstRuntime.physics.fields.food[0];
  const options = { fixedDt: 1 / 60, gravity: [0, 0, -9.81], controller: new HeuristicBaselineController(), motorLimits: { thrust: .00005, pitch: .02, yaw: .02, roll: .02 } };
  const first = new FlySimulation(firstRuntime.environment, options);
  first.addFly({ flyId: 'dynamic-food-fly', body: initialFlyBody({ spawn: food.center }) });
  firstRuntime.environment.restoreDynamicState({ food: [{ id: food.id, active: false }] });
  first.step(0);
  const cp = checkpoint(first);
  const secondRuntime = await loadFlyHouseRuntime({ rootDir });
  const second = new FlySimulation(secondRuntime.environment, options);
  restore(second, cp);
  assert.equal(second.getFly('dynamic-food-fly').sensors.channels.olfaction.value, 0);
  assert.equal(second.getFly('dynamic-food-fly').sensors.channels.taste.status, 'UNAVAILABLE');
  assert.equal(stateHash(second), stateHash(first));
});
