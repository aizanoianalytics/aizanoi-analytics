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
| Vision | implemented v1 | BIOLOGICALLY CONSTRAINED + MODELLED directional ray/looming samples |
| Baseline controller | foundation only | HEURISTIC; not yet a food-seeking FSM |
| Connectome controller | experimental LC4 escape subgraph | CONNECTOME-DERIVED topology; MODELLED transduction/dynamics/motor mapping |
| Checkpoint/replay | implemented as checkpoint-2 | MODELLED; artifact/controller identity and state are validated |
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

- `CONNECTOME-DERIVED` — the selected FlyWire FAFB v783 LC4→DNp02/DNp11 topology and its derived graph identity; this is not full-brain simulation.
- `BIOLOGICALLY CONSTRAINED` — fly profile dimensions/mass provenance and the directional visual-sampling assumptions, combined with `MODELLED` where the implementation is reduced-order.
- `MODELLED` — reduced-order body/physics, authored fields, raycast vision/looming, neural rate dynamics, motor mapping, contact and telemetry state.
- `HEURISTIC` — the baseline controller foundation; it is not yet the required sensor-driven food-seeking FSM.

The LC4 controller is explicitly an experimental escape-circuit model. FlyWire supplies connectivity, not neuronal dynamics, sensory transduction, or motor biomechanics. Owner visual approval is not durably recorded; this documentation does not claim it.
