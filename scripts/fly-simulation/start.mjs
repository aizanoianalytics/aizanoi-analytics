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
const maxClients = Number(process.env.FLY_SIM_MAX_CLIENTS ?? 64);
const allowedOrigin = process.env.FLY_SIM_ALLOWED_ORIGIN ?? 'https://aizanoianalytics.com';
const parsedOrigin = new URL(allowedOrigin);
if (host !== '127.0.0.1') throw new Error('Fly Simulation production host must remain loopback-only');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError('FLY_SIM_PORT must be an integer from 1 to 65535');
if (!Number.isInteger(intervalMs) || intervalMs < 5 || intervalMs > 1000) throw new RangeError('FLY_SIM_INTERVAL_MS must be an integer from 5 to 1000');
if (!Number.isInteger(maxClients) || maxClients < 1 || maxClients > 1024) throw new RangeError('FLY_SIM_MAX_CLIENTS must be an integer from 1 to 1024');
if (parsedOrigin.protocol !== 'https:' || parsedOrigin.origin !== allowedOrigin) throw new Error('FLY_SIM_ALLOWED_ORIGIN must be an exact HTTPS origin');
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
  allowedHosts: [`127.0.0.1:${port}`],
  allowedOrigins: [allowedOrigin],
  requireOrigin: true,
  maxClients,
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
