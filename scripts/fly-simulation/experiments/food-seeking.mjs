#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadFlyHouseRuntime, initialFlyBody } from '../../../services/fly-simulation/runtime.mjs';
import { FlySimulation, HeuristicBaselineController, stateHash } from '../../../frontend/labs/fly-simulation/index.js';

const rootDir = resolve(new URL('../../..', import.meta.url).pathname);
const seed = 271828;
const spawn = [-1.85, -2.15, 1.5];
const fixedDt = 1 / 60;

async function run() {
  const runtime = await loadFlyHouseRuntime({ rootDir });
  const body = initialFlyBody({ position: spawn, velocity: [0, 0, 0] });
  const sim = new FlySimulation(runtime.environment, { fixedDt, rngState: seed });
  sim.addFly({ flyId: 'food-experiment-fly', body, controller: new HeuristicBaselineController() });
  const initialVelocity = body.velocity.toJSON();
  const events = [];
  const trajectory = [];
  let previous = null;
  let finalTick = null;
  for (let i = 0; i < 12000; i += 1) {
    sim.stepOne(fixedDt);
    const fly = sim.getFly('food-experiment-fly');
    const state = fly.controllerState.fsmState;
    trajectory.push(fly.body.position.toJSON());
    if (state !== previous) {
      events.push({ state, tick: sim.tick });
      previous = state;
    }
    if (state === 'DISENGAGE' && finalTick === null) {
      finalTick = sim.tick;
      break;
    }
  }
  const tickFor = (names) => events.find((event) => names.includes(event.state))?.tick ?? null;
  const result = {
    seed,
    controller: flyControllerMetadata(sim),
    initialPosition: spawn,
    initialVelocity,
    takeoffTick: tickFor(['TAKEOFF']),
    firstOdorDetectionTick: tickFor(['ODOR_SEARCH']),
    firstDirectionalGradientTick: tickFor(['ODOR_TRACK']),
    approachTick: tickFor(['ODOR_TRACK']),
    landingTick: tickFor(['LAND']),
    foodContactTick: tickFor(['FOOD_CONTACT']),
    feedingStartTick: sim.getFly('food-experiment-fly').controllerState.feedingStartTick,
    feedingEndTick: sim.getFly('food-experiment-fly').controllerState.feedingEndTick,
    finalTick: finalTick ?? sim.tick,
    finalPosition: sim.getFly('food-experiment-fly').body.position.toJSON(),
    finalControllerState: sim.getFly('food-experiment-fly').controllerState,
    finalBodyState: sim.getFly('food-experiment-fly').body.toJSON(),
    trajectorySummary: summarize(trajectory),
    events,
    finalStateHash: stateHash(sim),
  };
  if (!result.takeoffTick || !result.firstOdorDetectionTick || !result.firstDirectionalGradientTick || !result.landingTick || !result.foodContactTick || !result.feedingStartTick) {
    throw new Error(`food experiment incomplete: ${JSON.stringify(result.events)}`);
  }
  return result;
}

function flyControllerMetadata(sim) {
  const controller = sim.getFly('food-experiment-fly').controller;
  return { name: controller.name, version: controller.version, provenance: controller.provenance };
}
function summarize(points) {
  const axes = points[0].map((_, axis) => points.reduce((out, point) => ({ min: Math.min(out.min, point[axis]), max: Math.max(out.max, point[axis]) }), { min: Infinity, max: -Infinity }));
  return { samples: points.length, bounds: axes, displacement: points.at(-1).map((value, axis) => value - points[0][axis]) };
}
const runA = await run();
const runB = await run();
const evidence = { experiment: 'deterministic-food-seeking-v1', runA, runB, deterministic: runA.finalStateHash === runB.finalStateHash && JSON.stringify(runA.events) === JSON.stringify(runB.events) };
if (!evidence.deterministic) throw new Error('food experiment is not deterministic');
const out = resolve(rootDir, 'evidence/fly-world-final/food-experiment.json');
await mkdir(resolve(out, '..'), { recursive: true });
await writeFile(out, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
