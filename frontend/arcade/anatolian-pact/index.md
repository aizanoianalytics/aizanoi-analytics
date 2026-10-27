# Anatolian Pact

Route: `/arcade/anatolian-pact/`. A static, six-power game of alliances and betrayal on a hex map of ancient Anatolia. Every seat is human or a worker-hosted strategist. No backend, frameworks, external fonts or build step.

## Modules

- `engine.js`: deterministic rules, map, negotiation, trust and results; supplied by the companion engine module.
- `bot-worker.js`: imports the engine and an ID-validated local bot, seeds `Math.random` and dispatches phase calls.
- `runner.js`: parallel bot calls, 2,000 ms load/call limits, human submission barriers and cleanup.
- `map.js`: DPR-aware pointy-top hex canvas, province hit testing, pieces and resolution overlays.
- `game.js`: seat roster, structured proposals, secret hot-seat input, orders, retreats, adjustments and public history.
- `bots.json`: the three house samples, explicitly labelled as samples rather than model entries.

`PactRunner.start(seats, options)` returns `game`, `loaded`, `phase()`, `waitingFor()`, `next()`, `submitHuman()` and `stop()`. Concurrent `next()` callers share one advance. Timed-out workers are terminated; later phases use defaults. `stop()` also releases pending human and worker waits.

Only `orders(state)` is required of bots. Optional methods are `propose`, `answer`, `retreats` and `builds`; return the matching engine submission payload synchronously. Invalid returns default to no proposals, rejection, holds and automatic retreat/disband handling. Workers are execution/time boundaries, not secure sandboxes for arbitrary hostile scripts: publish reviewed local files only.

## Play and inspect

Choose six controllers and press Start. Multiple humans receive an opaque pass-device dialog before every private phase. Submitted plans never appear in the public QA handle. Speed changes replay pauses, not bot time limits. Random seats chooses six bots.

Example:

`?powers=human,sample-schemer,sample-expander,sample-turtle,sample-schemer,sample-expander&years=6&autostart=1`

Supported years: 6, 9, 12. Add `&speed=0` for Instant. `window.__ANATOLIAN_PACT__()` returns detached public telemetry.

Serve `frontend` over HTTP. Run:

- `node --test tests/anatolian-pact-page.test.mjs`
- `node --test tests/browser/anatolian-pact.test.mjs`

Browser tests require Playwright and a site at port 4173, or `ANCIENT_WORLD_BASE_URL`. They block service workers and apply a strict same-origin CSP.

## Integration and verification

The requested `bytes: 0` manifest values are preserved. They conflict with an exact-file-size assertion for nonempty bot scripts. Replace them with measured byte counts after integrating the companion bot files; the strict size test deliberately reports this mismatch rather than accepting an inaccurate manifest.

Verified against the companion engine and bots: all four browser tests passed, including a completed six-bot game, one-human orders, two-human privacy and phone layout. Four non-size static/runner checks also passed. The full page suite still reports the manifest byte-count mismatch.

Executable scripts and CSS are same-origin files. The only inline script is JSON-LD metadata; no inline event handlers or style attributes are used.
