# Stage B RED/GREEN evidence

Focused acceptance tests were extended test-first for machine-readable provenance, checkpoint completeness, replay application, browser interpolation/non-authority, telemetry schema/lag, and Fly House integration.

## RED

```text
$ node --test frontend/labs/fly-simulation/fly-simulation.test.mjs
exit=1
SyntaxError: The requested module './index.mjs' does not provide an export named 'SpectatorBridge'
# tests 1
# pass 0
# fail 1
```

The failure was the expected feature-missing module export after the new tests were written. The replay slice was then independently checked red before its export was implemented:

```text
$ node --test frontend/labs/fly-simulation/fly-simulation.test.mjs
exit=1
SyntaxError: The requested module './index.mjs' does not provide an export named 'replay'
# tests 1
# pass 0
# fail 1
```

## GREEN

```text
$ node --test frontend/labs/fly-simulation/fly-simulation.test.mjs
# tests 14
# pass 14
# fail 0
# cancelled 0
# skipped 0
```

## Validation

```text
$ node --check frontend/labs/fly-simulation/index.mjs && node --check frontend/labs/fly-simulation/fly-simulation.test.mjs && node --check frontend/labs/fly-world/glb-runtime-v3.js && git diff --check
exit 0

$ node --test tests/fly-world*.test.mjs
# tests 33
# pass 33
# fail 0
# cancelled 0
# skipped 0

$ node --test tests/*.test.mjs
# tests 516
# pass 516
# fail 0
# cancelled 0
# skipped 0
```

The focused tests cover exact provenance metadata and omission rejection, deterministic rigid-body integration including drag/orientation/contact normals, room/zones and stable rest, unavailable sensor channels, named controller mapping, complete checkpoint/restore hashes, applied replay, versioned allowlisted telemetry with lag accounting, browser interpolation and read-only authority, and the real Fly House authored-environment/status integration. No build script or lint command is defined specifically for this lab; touched module syntax and repository whitespace checks pass.

## Acceptance-gap RED/GREEN

```text
$ node --test frontend/labs/fly-simulation/fly-simulation.test.mjs
RED: 14 passed, 4 failed (missing pause/stepOne, realtime start, telemetry snapshot, and exact adapter identity)

$ node --test frontend/labs/fly-simulation/fly-simulation.test.mjs
GREEN: 19 passed, 0 failed

$ node --test tests/fly-world*.test.mjs
GREEN: 33 passed, 0 failed

$ node --test tests/*.test.mjs
GREEN: 516 passed, 0 failed

$ node --check frontend/labs/fly-simulation/index.mjs && node --check frontend/labs/fly-simulation/fly-simulation.test.mjs && node --check frontend/labs/fly-world/glb-runtime-v3.js && git diff --check
exit 0
```

The acceptance slice adds explicit pause/resume and manual stepping, realtime scheduler lifecycle and lag accounting, deterministic telemetry snapshots, exact adapter/checkpoint identity preservation, and a GLB Fly House spectator demo with authored safe spawn, fixed Z-up simulation, named heuristic controller, read-only bridge, interpolated authoritative mesh, and live tick/room/provenance/lag status.

## Narrow service RED/GREEN

The integration test was written before `service.mjs` existed and exercised a real
ephemeral-port WebSocket connection using the authored test-plane adapter:

```text
$ node --test frontend/labs/fly-simulation/service.test.mjs
RED: ERR_MODULE_NOT_FOUND: frontend/labs/fly-simulation/service.mjs
```

After implementing the loopback-only-by-default service, minimal RFC6455 framing,
versioned allowlisted telemetry, fixed scheduler instrumentation, and ignored input
frames:

```text
$ node --test frontend/labs/fly-simulation/service.test.mjs
# tests 2
# pass 2
# fail 0
```

## Final verification commands

```text
$ node --test frontend/labs/fly-simulation/fly-simulation.test.mjs frontend/labs/fly-simulation/service.test.mjs
# tests 22
# pass 22
# fail 0

$ node --test tests/*.test.mjs
# tests 516
# pass 516
# fail 0

$ node --check frontend/labs/fly-simulation/index.mjs && node --check frontend/labs/fly-simulation/service.mjs && node --check frontend/labs/fly-simulation/fly-simulation.test.mjs && node --check frontend/labs/fly-simulation/service.test.mjs && node --check frontend/labs/fly-world/glb-runtime-v3.js
exit 0

$ git diff --check
exit 0
```
