# PR 261 RED/GREEN evidence

All evidence below is from the current branch `feat/fly-simulation-foundation`.

RED

```text
$ node --test tests/pr261-regressions.test.mjs
ERR_MODULE_NOT_FOUND: Cannot find module services/fly-simulation/service.mjs
```

The regression file was written before the private service existed and failed on the expected missing implementation seam.

GREEN

```text
$ node --test tests/pr261-regressions.test.mjs
# tests 7
# pass 7
# fail 0

$ node --test tests/fly-simulation.test.mjs tests/fly-simulation-service.test.mjs tests/pr261-regressions.test.mjs
# tests 29
# pass 29
# fail 0

$ node --test tests/fly-simulation-browser.test.mjs
# tests 1
# pass 1
# fail 0

$ npm test
# tests 546
# pass 546
# fail 0

$ node --check frontend/labs/fly-simulation/index.js && node --check services/fly-simulation/service.mjs && node --check frontend/labs/fly-world/glb-runtime-v3.js && git diff --check
exit 0
```

The Chromium test uses the installed headless Chromium, an ephemeral simulation WebSocket, an ephemeral HTTP page, keyboard input, and server-state assertions. It proves telemetry is received and browser input does not mutate authoritative state.

Publish-boundary audit:

```text
frontend_node_backend_candidates ['frontend/service-worker.js']
```

The Node simulation service is `services/fly-simulation/service.mjs`; no Fly backend/service remains under `frontend/`. The service uses monotonic elapsed wall time, explicit Host/Origin allowlists, bounded RFC6455 parsing, TelemetryProtocol-only output, and deterministic cleanup. The browser has no local FlySimulation/controller/scheduler/fly creation and reports telemetry inactive without explicit host configuration.

`npm run qa:browser` was attempted but is a repository smoke entrypoint that expects an already-running server at `http://127.0.0.1:4173/`; it failed with `ERR_CONNECTION_REFUSED`. The dedicated Chromium spectator test above passed independently against the ephemeral service/page.
