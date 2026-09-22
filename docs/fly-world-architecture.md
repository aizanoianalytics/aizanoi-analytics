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
| Odor | directional paired-antenna field | MODELLED |
| Taste / physical food contact | geometry-derived fly-scale contact contract | MODELLED |
| Food controller | explicit sensor-driven FSM with feeding lifecycle | HEURISTIC |
| Vision | implemented v1 | MODELLED with BIOLOGICALLY CONSTRAINED directional ray/looming assumptions |
| Connectome controller | experimental LC4 escape subgraph | CONNECTOME-DERIVED topology; MODELLED transduction/dynamics/motor mapping |
| Checkpoint/replay | implemented as checkpoint-2 | MODELLED; artifact/controller identity and state are validated |
| Browser telemetry | implemented | read-only spectator |
| Persistent deployment | supported | loopback systemd unit + exact same-origin read-only Nginx route; live state must be probed |

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

Configuration is explicit through `FLY_SIM_HOST`, `FLY_SIM_PORT`, `FLY_SIM_INTERVAL_MS`, `FLY_SIM_CONTROLLER`, `FLY_SIM_FLY_ID`, `FLY_SIM_ALLOWED_ORIGIN`, and `FLY_SIM_MAX_CLIENTS`. The default binds to loopback, requires the canonical production Origin for WebSocket upgrades, caps spectators, and creates one fly in the authored safe-spawn volume.

## Production boundary

- Install `infra/systemd/aizanoi-fly-simulation.service.example` as the dedicated unit; it binds only `127.0.0.1:8787` and runs with a read-only filesystem and no privilege escalation.
- Apply only the exact `location = /labs/fly-world/telemetry-1` block from the sanitized Nginx example to the live virtual host. Do not add a prefix proxy, generic API or browser command channel.
- Validate with `systemd-analyze verify`, `nginx -t`, a loopback WebSocket upgrade carrying `Origin: https://aizanoianalytics.com`, and a real browser on the canonical HTTPS route.
- The static deploy script does not install or restart the service. Runtime installation/restart is a separately verified infrastructure step tied to the merged Git SHA.

## Current milestone status (main)

- Stage A Fly House artifact exists and is the authored visual source.
- The authoritative reduced-order simulation exists with physics v2, directional vision/looming, environment sensor seam, checkpoint-2, controller state persistence, and scheduler discontinuity telemetry.
- The experimental FlyWire FAFB v783 LC4→DNp02/DNp11 escape circuit is runnable; topology is `CONNECTOME-DERIVED`, while transduction, temporal dynamics, motor mapping, and body physics are `MODELLED`.
- Food seeking is a deterministic `HEURISTIC` sensor-driven FSM with directional olfaction, geometry-derived physical contact, and modelled feeding lifecycle. Reproducible evidence is in `evidence/fly-world-final/`.
- Production deployment target includes the exact read-only same-origin spectator route plus a loopback-only authoritative service unit. Runtime deployment is accepted only after the merged SHA is installed and the public WebSocket is observed delivering valid identity-bound frames.
- Owner visual approval is **NOT RECORDED**; automated browser/CI smoke is not owner approval.
- Airflow remains zero/inactive where authored and absolute temperature remains `UNAVAILABLE`; neither is invented to make telemetry appear complete.

## Scientific provenance

Every implemented subsystem carries one of the allowed labels:

- `CONNECTOME-DERIVED` — the selected FlyWire FAFB v783 LC4→DNp02/DNp11 topology and its derived graph identity; this is not full-brain simulation.
- `BIOLOGICALLY CONSTRAINED` — fly profile dimensions/mass provenance and the directional visual-sampling assumptions, combined with `MODELLED` where the implementation is reduced-order.
- `MODELLED` — reduced-order body/physics, authored fields, raycast vision/looming, neural rate dynamics, motor mapping, contact and telemetry state.
- `HEURISTIC` — the deterministic sensor-driven food-seeking FSM baseline; it is not connectome-derived.

The LC4 controller is explicitly an experimental escape-circuit model. FlyWire supplies connectivity, not neuronal dynamics, sensory transduction, or motor biomechanics. Owner visual approval is not durably recorded; this documentation does not claim it.
