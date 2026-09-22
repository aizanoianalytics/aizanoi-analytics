import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadFlyHouseRuntime, initialFlyBody } from '../services/fly-simulation/runtime.mjs';
import { FlySimulation, HeuristicBaselineController, stateHash, restore } from '../frontend/labs/fly-simulation/index.js';
const root = resolve(new URL('.', import.meta.url).pathname, '..');
const read = (name) => JSON.parse(readFileSync(resolve(root, 'evidence/fly-world-final', name), 'utf8'));

test('food evidence proves sensor-only deterministic end-to-end loop', () => {
  const evidence = read('food-experiment.json');
  assert.equal(evidence.deterministic, true);
  assert.equal(evidence.runA.finalStateHash, evidence.runB.finalStateHash);
  assert.deepEqual(evidence.runA.events, evidence.runB.events);
  assert.deepEqual(evidence.runA.initialVelocity, [0, 0, 0]);
  assert.ok(evidence.runA.takeoffTick < evidence.runA.firstOdorDetectionTick);
  assert.ok(evidence.runA.firstDirectionalGradientTick <= evidence.runA.landingTick);
  assert.ok(evidence.runA.landingTick < evidence.runA.foodContactTick);
  assert.ok(evidence.runA.foodContactTick <= evidence.runA.feedingStartTick);
  assert.equal(evidence.runA.controller.provenance, 'HEURISTIC');
});

test('LC4 evidence proves real-vision escape response and deterministic graph identity', () => {
  const evidence = read('lc4-escape-experiment.json');
  assert.equal(evidence.deterministic, true);
  assert.equal(evidence.runA.finalStateHash, evidence.runB.finalStateHash);
  assert.equal(evidence.runA.graphHash, '6a141227d8bd4d5f5432bdb7e2a038f81941b2ef5446b0904ee54d7782b649c6');
  assert.equal(evidence.runA.edges, 265);
  assert.equal(evidence.runA.synapses, 1924);
  assert.ok(evidence.runA.loomingStartTick > 0);
  assert.ok(evidence.runA.peakLC4Activity > 0);
  assert.ok(evidence.runA.peakDNActivity > 0);
  assert.ok(evidence.runA.motorResponseTick >= evidence.runA.loomingStartTick);
  assert.ok(evidence.runA.peakMotor > evidence.runA.initialMotor);
  assert.ok(evidence.runA.trajectoryDelta.some((value) => Math.abs(value) > 0));
});

test('checkpoint restore preserves food FSM continuation and final state hash', async () => {
  const seed = 271828;
  const runtimeA = await loadFlyHouseRuntime({ rootDir: root });
  const simA = new FlySimulation(runtimeA.environment, { fixedDt: 1 / 60, rngState: seed, controller: new HeuristicBaselineController() });
  simA.addFly({ flyId: 'checkpoint-food-fly', body: initialFlyBody({ spawn: [-1.85, -2.15, 1.5] }) });
  for (let i = 0; i < 5000; i += 1) simA.stepOne();
  const checkpoint = simA.checkpoint();
  while (simA.tick < 5332) simA.stepOne();
  const originalHash = stateHash(simA);
  const runtimeB = await loadFlyHouseRuntime({ rootDir: root });
  const simB = new FlySimulation(runtimeB.environment, { fixedDt: 1 / 60, rngState: seed, controller: new HeuristicBaselineController() });
  restore(simB, checkpoint);
  while (simB.tick < 5332) simB.stepOne();
  assert.equal(simB.getFly('checkpoint-food-fly').controllerState.feedingStartTick, simA.getFly('checkpoint-food-fly').controllerState.feedingStartTick);
  assert.equal(stateHash(simB), originalHash);
});
