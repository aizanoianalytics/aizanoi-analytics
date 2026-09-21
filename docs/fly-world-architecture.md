# Fly World Architecture — v1 implementation status

## Authority boundary

```text
Fly House authored sources
  -> fly-physics.json (deterministic server artifact)
  -> Fly Simulation host
  -> sensors
  -> controller
  -> motor command
  -> reduced-order body physics
  -> room/contact/field state
  -> telemetry-1 WebSocket
  -> browser spectator
```

The browser loads the real Fly House GLB for presentation and accepts telemetry only. It does not create flies, advance ticks, submit commands, or own authoritative pose, physics, sensors, or controller state.

## Current implementation

| Subsystem | Status | Classification |
|---|---|---|
| Fly House GLB | implemented | AUTHORED |
| Compact physics artifact | implemented | MODELLED from authored room/doorway metadata |
| Artifact identity | implemented | exact environment source + GLB hashes |
| Fixed-step body loop | implemented | MODELLED |
| Body dimensions | implemented profile | BIOLOGICALLY CONSTRAINED for length/mass; MODELLED collision radius |
| Proprioception/contact | implemented | MODELLED |
| Light field | implemented | MODELLED, relative intensity |
| Temperature | explicit but absolute value unavailable near heat | MODELLED / UNAVAILABLE where uncalibrated |
| Airflow | explicit field, authored values currently zero | MODELLED |
| Odor | implemented normalized food concentration | MODELLED |
| Taste | food-contact signal | MODELLED |
| Vision | not implemented; explicit UNAVAILABLE | UNAVAILABLE |
| Baseline controller | implemented | HEURISTIC |
| Connectome controller | not implemented | no claim made |
| Checkpoint/replay | implemented for body, motors, controller state and sensor history | MODELLED |
| Browser telemetry | implemented | read-only spectator |
| Persistent deployment | not claimed | depends on a compatible service host |

## Physics artifact honesty

`frontend/labs/fly-world/assets/fly-physics.json` is intentionally compact. It contains room boundary planes, doorway openings, field definitions, safe-spawn metadata, and source identities. It is not a triangle-perfect collision export of every furniture mesh, not CFD, and not calibrated insect biomechanics. The server refuses stale source/GLB/artifact identity combinations.

Regenerate it with:

```bash
node scripts/fly-world/build_physics_artifact.mjs
```

## Runnable local host

```bash
node scripts/fly-simulation/start.mjs
```

Configuration is explicit through `FLY_SIM_HOST`, `FLY_SIM_PORT`, `FLY_SIM_INTERVAL_MS`, `FLY_SIM_CONTROLLER`, and `FLY_SIM_FLY_ID`. The default binds to loopback and creates one fly in the authored safe-spawn volume.

## Scientific provenance

Every implemented subsystem carries one of the allowed labels:

- `CONNECTOME-DERIVED` — none implemented yet.
- `BIOLOGICALLY CONSTRAINED` — none implemented yet.
- `MODELLED` — reduced-order physics, deterministic fields, contact and telemetry state.
- `HEURISTIC` — `HEURISTIC BASELINE CONTROLLER` only.

The baseline controller is not a brain or connectome. Neural dynamics and connectome data remain explicit future work and must not be implied by the current implementation.
