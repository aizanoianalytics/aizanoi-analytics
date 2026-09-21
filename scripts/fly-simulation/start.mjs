#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFlyWorldSimulationService } from '../../services/fly-simulation/service.mjs';
import { loadFlyHouseRuntime, initialFlyBody } from '../../services/fly-simulation/runtime.mjs';
import { HeuristicBaselineController, FlyWireLC4EscapeController } from '../../frontend/labs/fly-simulation/index.js';

const rootDir = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const host = process.env.FLY_SIM_HOST ?? '127.0.0.1';
const port = Number(process.env.FLY_SIM_PORT ?? 8787);
const intervalMs = Number(process.env.FLY_SIM_INTERVAL_MS ?? 20);
const controller = process.env.FLY_SIM_CONTROLLER ?? 'HEURISTIC BASELINE CONTROLLER';
const runtime = await loadFlyHouseRuntime({ rootDir });
const activeController = controller === 'FLYWIRE LC4 ESCAPE EXPERIMENTAL CONTROLLER' ? new FlyWireLC4EscapeController(runtime.connectome) : new HeuristicBaselineController();
const service = createFlyWorldSimulationService({
  authoredEnvironment: runtime.environment,
  simulationOptions: { fixedDt: 1 / 60, gravity: [0, 0, -9.81], motorLimits: { thrust: 0.00005, pitch: 0.02, yaw: 0.02, roll: 0.02 }, controller: activeController },
  host,
  port,
  intervalMs,
  controller,
});
service.simulation.addFly({
  flyId: process.env.FLY_SIM_FLY_ID ?? 'fly-001',
  body: initialFlyBody({ spawn: runtime.spec.integration.safeSpawnVolumes[0]?.bounds?.[0] ?? [-1.85, -2.15, 1] }),
});
await service.start();
const address = service.address();
console.log(JSON.stringify({
  status: 'running',
  authority: 'server-authoritative',
  controller,
  endpoint: `ws://${address.address}:${address.port}${service.constructor?.FLY_SPECTATOR_PATH ?? '/spectator/telemetry-1'}`,
  environmentHash: runtime.environment.hash,
  glbHash: runtime.environment.glbHash,
  physicsArtifact: 'frontend/labs/fly-world/assets/fly-physics.json',
  flyIds: service.simulation.listFlyIds(),
}, null, 2));

const shutdown = async (signal) => {
  console.log(JSON.stringify({ status: 'stopping', signal }));
  await service.stop();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
