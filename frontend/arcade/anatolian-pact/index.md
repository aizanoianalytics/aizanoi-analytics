# Anatolian Pact

Route: `/arcade/anatolian-pact/`. A static, six-power game of alliances,
simultaneous orders and betrayal on a generated real-geography hex map.
Every seat is human or a worker-hosted strategist. No backend, frameworks,
external fonts or runtime build step.

## Generated map pipeline

The geographic input is `data/anatolia-geo.json`: Natural Earth 1:50m land
and lake rings, clipped to the eastern Mediterranean and Anatolia.
Natural Earth data is public domain:
https://www.naturalearthdata.com/about/terms-of-use/

From the repository root, using Node 22 or newer, regenerate with:

    node scripts/arcade/build-anatolian-pact-map.mjs

Inspect without writing the generated artifact:

    node scripts/arcade/build-anatolian-pact-map.mjs --preview

The generator writes `frontend/arcade/anatolian-pact/map-data.js` and prints
the province-code grid and legend. Generate this file before serving the
page or running the tests. Commit the generated artifact for static hosting.
Do not edit its rows by hand.

The script:

- Uses an equirectangular plane with longitude scaled by cos(39°).
- Samples Natural Earth polygons at pointy-top, odd-r hex centres.
- Retains mainland Anatolia, a Thracian strip and Cyprus.
- Suppresses other islands and disconnected raster coastal fragments.
- Keeps Tuz lake impassable; smaller lakes become land.
- Opens sub-hex straits along real Bosporus and Dardanelles coordinates.
- Partitions land with multi-source BFS from real ancient-city sites.
- Merges provinces smaller than three hexes into the longest-border neighbour.
- Partitions a coastal sea band with connected geographic sea seeds.
- Selects six neutral centres using legal starting-unit arrival distances,
  requiring each power to have one or two earliest-reachable opportunities.
- Validates province connectivity, three separate land components, sea
  passage through both straits, home ownership, starting units and 24 centres
  before writing anything.

A deterministic search over nearby grid resolutions and origins handles
coastal raster ambiguities. If no candidate passes every invariant, generation
fails with the attempted resolutions and named invariant errors; an existing
artifact is not overwritten.

Regular hexes and the true projected geographic aspect ratio require more
rows than a stretched 64-by-34 illustration. The generator preserves geographic
proportions rather than independently stretching the axes.

Province codes are single UTF-16 characters. Land uses uppercase Latin and,
after Z, Greek capitals; sea uses lowercase Latin. There are more than 26 land
provinces, so consumers must read `province.type`, not test IDs against A–Z.

`map-data.js` is UMD: browsers and workers receive `PactMapData`; CommonJS
receives `module.exports`. Load it before `engine.js`. Node VM consumers must
supply `PactMapData` in the engine's realm; the engine never calls `require`.

## Geography and movement

Mainland Anatolia, Thrace and Cyprus are three separate land components.
There are no convoys. Armies cannot cross the straits or reach the other land
components by water. Fleets can travel between them through adjacent seas.

The fleet passage is:

    Pontus West → Propontis → Hellespont → Aegean North

Fleets moving directly between adjoining coastal provinces require a common
sea province. Open sea and Tuz lake are decorative, impassable cells.
Off-map territory is blank.

There are six powers, three owned home supply centres and three starting
units each, plus six neutral centres: 24 centres total. Lydia, Caria,
Bithynia and Cilicia start with one fleet each. Phrygia and Galatia start
with armies only. Victory requires 13 centres.

## Modules

- `data/anatolia-geo.json`: public-domain source polygons.
- `map-data.js`: generated, validated map definition.
- `engine.js`: deterministic rules, computed adjacency, negotiation, trust
  and results.
- `bot-worker.js`: imports map data, engine and an ID-validated local bot,
  seeds `Math.random` and dispatches phase calls.
- `runner.js`: parallel bot calls, 2,000 ms load/call limits, human
  submission barriers and cleanup.
- `map.js`: DPR-aware canvas, union-filled provinces, borders and glowing
  coasts, labels, supply centres, pieces and resolution overlays.
- `game.js`: roster, structured proposals, secret hot-seat input, orders,
  retreats, adjustments and public history.
- `bots.json`: the three house samples, explicitly labelled as samples
  rather than model entries.

`PactRunner.start(seats, options)` returns `game`, `loaded`, `phase()`,
`waitingFor()`, `next()`, `submitHuman()` and `stop()`. Concurrent `next()`
callers share one advance. Timed-out workers are terminated; later phases
use defaults. `stop()` releases pending human and worker waits.

Only `orders(state)` is required of bots. Optional methods are `propose`,
`answer`, `retreats` and `builds`; return the matching engine submission
payload synchronously. Invalid returns default to no proposals, rejection,
holds and automatic retreat/disband handling.

Workers are execution/time boundaries, not secure sandboxes for arbitrary
hostile scripts: publish reviewed local files only.

## Play and inspect

Choose six controllers and press Start. Multiple humans receive an opaque
pass-device dialog before every private phase. Submitted plans never appear
in the public QA handle. Speed changes replay pauses, not bot time limits.
Random seats chooses six bots.

Example:

`?powers=human,sample-schemer,sample-expander,sample-turtle,sample-schemer,sample-expander&years=6&autostart=1`

Supported years: 6, 9, 12. Add `&speed=0` for Instant.
`window.__ANATOLIAN_PACT__()` returns detached public telemetry.

Serve `frontend` over HTTP. After generating the map, run:

    node --test tests/anatolian-pact-engine.test.mjs
    node --test tests/anatolian-pact-page.test.mjs
    node --test tests/browser/anatolian-pact.test.mjs

Browser tests require Playwright and a site at port 4173, or
`ANCIENT_WORLD_BASE_URL`. They block service workers and apply a strict
same-origin CSP.

## Integration notes

Bot manifest byte counts remain an independent integration requirement.
If `bots.json` contains zero-byte placeholders, replace them with the actual
bot file sizes; the exact-size test intentionally rejects placeholders.

Executable scripts and CSS are same-origin files. The only inline script
is JSON-LD metadata; there are no inline event handlers or style attributes.

The code-only change does not itself establish a successful generation,
test run or browser verification. Run the commands above in the repository
to verify the generated artifact and integration.
