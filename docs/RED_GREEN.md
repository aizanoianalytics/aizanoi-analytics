# PR 261 verification evidence

All reproducible evidence below is from the current branch `feat/fly-simulation-foundation`.

## Historical RED status

The original interactive RED runs were not retained at a reviewable commit. They are therefore not presented as reproducible evidence here. The committed regression tests preserve the failure contracts that drove the fixes: publish-boundary separation, hostile upgrade rejection, bounded RFC6455 parsing, fragmented UTF-8 handling across TCP chunks, backpressure disconnects, quaternion integration, body-volume collision, fixed-step replay, checkpoint isolation, and telemetry allowlisting.

## Current GREEN evidence

```text
$ node --test tests/pr261-regressions.test.mjs
# tests 12
# pass 12
# fail 0

$ node --test tests/fly-simulation.test.mjs tests/fly-simulation-service.test.mjs tests/pr261-regressions.test.mjs
# tests 37
# pass 37
# fail 0

$ node --test tests/fly-simulation-browser.test.mjs
# tests 1
# pass 1
# fail 0

$ npm test
# tests 555
# pass 555
# fail 0

$ node --test tests/fly-world-*.test.mjs
# tests 34
# pass 34
# fail 0

$ node --check frontend/labs/fly-simulation/index.js && node --check services/fly-simulation/service.mjs && node --check frontend/labs/fly-world/glb-runtime-v3.js && git diff --check
exit 0
```

The Chromium test loads the real Fly House, injects only the explicit spectator endpoint configuration, connects to an ephemeral authoritative simulation service, observes telemetry-created mesh movement, drives local camera input, and verifies that browser input cannot mutate server state. It also rejects malformed and out-of-order visualization frames and confirms that no browser-local simulation, controller, or scheduler exists.

## Publish and transport boundaries

The Node simulation service lives at `services/fly-simulation/service.mjs`; no Fly backend/service exists under `frontend/`. The service uses monotonic elapsed wall time, explicit Host/Origin allowlists, bounded RFC6455 parsing with per-connection fragmented-message state, TelemetryProtocol-only output, an explicit disconnect-on-backpressure policy, and deterministic cleanup. The public browser has no local FlySimulation/controller/scheduler/fly creation and reports telemetry inactive without explicit host configuration.

A clean `npm ci --ignore-scripts --no-fund` resolves `lighthouse-logger`, correcting the lockfile truncation that caused the prior Lighthouse runner launch failure. A local real Lighthouse run subsequently launched successfully for every representative surface; final acceptance remains the final-SHA CI gate.