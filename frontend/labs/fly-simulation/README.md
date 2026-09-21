# Fly Simulation Foundation (Stage B)

A dependency-free deterministic core and browser spectator bridge. The core can run in the browser-safe test seam, while the real Fly House host is `services/fly-simulation` plus `scripts/fly-simulation/start.mjs`. The browser remains a read-only spectator; the host owns simulation authority.

## Browser seam

`createBrowserSimulation(authoredEnvironment)` returns `{ simulation, bridge }`. The authored adapter is built from Fly World `createEnvironment()` and uses explicit `raycast`, `roomAt`, and `zonesAt` callbacks. It never calls observer `collisionAt`; body contact uses authored surfaces and contact normals.

`SpectatorBridge` accepts only versioned `telemetry-1` frames, interpolates position/orientation for `requestAnimationFrame`, exposes lag/drop status, and is explicitly `spectator-read-only`. It has no command or authoritative pose mutation API: `ingest` only updates local visualization buffers and can never call or mutate the server simulation. The production browser runtime creates no local simulation; it connects only when `window.__FLY_TELEMETRY_CONFIG__.url` is explicitly supplied and otherwise displays telemetry inactive. The public bridge is therefore safe to expose for diagnostics, but must remain read-only.

## Classification accounting

- **CONNECTOME-DERIVED:** selected FlyWire FAFB v783 LC4→DNp02/DNp11 topology only; not a full-brain model.
- **BIOLOGICALLY CONSTRAINED:** Drosophila profile provenance and visual-sampling assumptions; implementation remains reduced-order.
- **MODELLED:** rigid-body integration, gravity, damping/drag, deterministic orientation, authored collision/contact, room/zone lookup, directional vision/looming, sensor fields, checkpoint/replay state, neural rate dynamics and telemetry metadata.
- **HEURISTIC:** named baseline controller foundation; it is not yet a complete food-seeking FSM.

Every scientific subsystem carries machine-readable `units`, `calibrated`, `assumptions`, `limitations`, and `version`. Missing provenance metadata is rejected. Vision is a modest directional ray/looming model; olfaction and audition remain explicit `UNAVAILABLE` where no authoritative adapter exists.

## Determinism and limits

- Fixed-step updates, deterministic normalized quaternions, actual drag, stable landing/takeoff/rest phases, and checkpoint restore cover body state, motor state, sensor history, RNG state, and environment dynamic state.
- `replay(sim, events)` applies identical timestamped motor inputs; `stateHash()` and `replayHash()` provide deterministic regression hashes.
- Telemetry is an allowlisted WebSocket-shaped adapter with required version/sequence/identity/state/metadata fields. Environment and GLB artifact hashes are immutable per frame and spectators reject mismatches. Unknown keys are rejected; configured lag raises `TelemetryLagError`, and bounded scheduler catch-up reports dropped wall time explicitly rather than silently simulating it.
- The core is a reduced-order test model, not a calibrated insect model, connectome, brain, physiology, or production controller. Authored Fly World geometry is environmental evidence, not biological evidence. No network transport is required; a socket-shaped object is injected only by the host.

Run focused tests:

```bash
node --test tests/fly-simulation.test.mjs tests/fly-simulation-service.test.mjs
```

## Narrow Fly World spectator service

`services/fly-simulation/service.mjs` exports both the generic `createFlySimulationService({ environment, simulation, host, port, intervalMs, server })` and the Fly House seam `createFlyWorldSimulationService({ authoredEnvironment, identity, simulationOptions, ...serviceOptions })`. The latter accepts the real `createEnvironment()` shape, reads its nested `integration` contract, derives Z-up gravity/down direction, requires exact environment and GLB identity, and preserves authored mesh raycasts for swept body collision.
The service is deliberately not a general backend: it owns (or accepts an injected)
`FlySimulation`, uses the authored Fly World environment adapter, and exposes only
`GET /spectator/telemetry-1` over a minimal RFC6455 WebSocket handshake and frames.
The default bind is loopback (`127.0.0.1`) and `port: 0` selects an ephemeral port.
`server` may be an already-created HTTP server; its lifecycle remains the caller's
responsibility in that mode.

```js
const service = createFlySimulationService({ environment, port: 0 });
await service.start();
console.log(service.address());
// ... browser spectator connects to /spectator/telemetry-1
await service.stop();
```

Only `telemetry-1` spectator upgrades are accepted. Telemetry is a fixed allowlist
containing simulation state, checkpoint identity, provenance, sequence, and fixed
scheduler lag status. Browser WebSocket messages are parsed only to consume valid
masked RFC6455 frames and are ignored: they cannot set positions, motors, run
commands, or otherwise mutate the server-authoritative simulation. `status()` reports
`authority: 'server-authoritative'`, protocol, client count, and scheduler state.

This is a narrow foundation for the browser spectator, not a production network
deployment. It has no authentication, command channel, arbitrary execution, secrets,
or remote-host default.
