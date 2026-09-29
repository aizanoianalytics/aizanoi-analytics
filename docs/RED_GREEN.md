# PR 261 verification evidence

All reproducible evidence below is from the current branch `feat/-foundation`.

## Historical RED status

The original interactive RED runs were not retained at a reviewable commit. They are therefore not presented as reproducible evidence here. The committed regression tests preserve the failure contracts that drove the fixes: publish-boundary separation, hostile upgrade rejection, bounded RFC6455 parsing, fragmented UTF-8 handling across TCP chunks, backpressure disconnects, quaternion integration, body-volume collision, fixed-step replay, checkpoint isolation, and telemetry allowlisting.

## Current GREEN evidence

```text
$ node --test tests/pr261-regressions.test.mjs
# tests 12
# pass 12
# fail 0

$ node --test tests/.test.mjs tests/-service.test.mjs tests/pr261-regressions.test.mjs
# tests 38
# pass 38
# fail 0

$ node --test tests/-browser.test.mjs
# tests 1
# pass 1
# fail 0

$ npm test
# tests 556
# pass 556
# fail 0

$ node --test tests/-*.test.mjs
# tests 34
# pass 34
# fail 0

exit 0
```

The Chromium test loads the real Fly House, injects only the explicit spectator endpoint configuration, connects to an ephemeral authoritative simulation service, observes telemetry-created mesh movement, drives local camera input, and verifies that browser input cannot mutate server state. It also rejects malformed and out-of-order visualization frames and confirms that no browser-local simulation, controller, or scheduler exists.

## Publish and transport boundaries


A clean `npm ci --ignore-scripts --no-fund` resolves `lighthouse-logger`, correcting the lockfile truncation that caused the prior Lighthouse runner launch failure. A local real Lighthouse run subsequently launched successfully for every representative surface; final acceptance remains the final-SHA CI gate.