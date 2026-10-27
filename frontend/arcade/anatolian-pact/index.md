# Anatolian Pact

Route: `/arcade/anatolian-pact/`. A static, six-power game of alliances,
simultaneous orders and betrayal on a generated real-geography hex map.
Every seat is human or a worker-hosted strategist. No backend, frameworks,
external fonts or runtime build step.

## External algorithm authors

Read [BOT_API.md](BOT_API.md) for the complete rules, state schema, payloads,
worker helpers, seed lifecycle, timing, fallback behaviour and model prompt.
Only `orders(state)` is required. Bots return synchronous JSON-compatible
payloads; asynchronous returns are not awaited.

Human submissions are validated by the engine before their private input
barrier is released. Invalid proposals, retreats or adjustments remain
editable rather than silently becoming defaults.

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
the province-code grid and legend. Commit the generated artifact for static
hosting. Do not edit its rows by hand.

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
  passage through both straits, home ownership, starting units and 24 centres.

A deterministic search over nearby grid resolutions and origins handles
coastal raster ambiguities. If no candidate passes every invariant, generation
fails without overwriting the existing artifact.

Regular hexes and true projected geographic proportions require more rows
than the original approximate grid design. Province codes are single UTF-16
characters. Land uses uppercase Latin and Greek capitals; seas use lowercase
Latin. Read `province.type`, not an A–Z regular expression.

`map-data.js` is UMD. Load it before `engine.js`. Same-realm Node VM consumers
must supply `PactMapData`; the engine never calls `require`.

## Geography and movement

Mainland Anatolia, Thrace and Cyprus are separate land components.
No convoys: armies cannot cross the straits or reach other land components
by water. Fleets can travel between them through adjacent seas.

The fleet passage is:

    Pontus West → Propontis → Hellespont → Aegean North

Direct fleet movement between adjoining coastal provinces requires a common
sea province. Open sea and Tuz lake are decorative, impassable cells.

There are six powers, eighteen owned home supply centres and six neutrals:
24 centres total. Lydia, Caria, Bithynia and Cilicia each start with one fleet.
Phrygia and Galatia start with armies only. Victory requires 13 centres.

## Modules

- `data/anatolia-geo.json`: public-domain source polygons.
- `map-data.js`: generated, validated map definition.
- `engine.js`: deterministic rules, computed adjacency, negotiation,
  trust, simultaneous-elimination cohorts and results.
- `bot-worker.js`: map/engine imports, ID-validated local bot loading,
  seeded `Math.random` and phase dispatch.
- `runner.js`: parallel calls, 2,000 ms load/call limits, validated human
  barriers, public fallback notices and cleanup.
- `map.js`: DPR-aware canvas, union-filled provinces, glowing coasts,
  collision-filtered labels, narrow-screen province codes and replay overlays.
- `game.js`: controllers, private hot-seat input, map and keyboard/touch
  order entry, province inspector, adjustments and public battle history.
- `bots.json`: house samples, explicitly not model entries.
- `BOT_API.md`: author-facing contract.

`PactRunner.start(seats, options)` returns `game`, `loaded`, `phase()`,
`waitingFor()`, `next()`, `submitHuman()` and `stop()`.
Concurrent `next()` callers share an advance. `stop()` releases pending waits.
A timed-out worker is terminated; subsequent phases use defaults.

The engine's `advance()` is an explicit phase commit, not a submission
barrier. Headless callers may deliberately omit submissions and use defaults.

Workers are execution/time boundaries, not secure sandboxes for hostile
scripts. Publish reviewed local bot files only.

## Play and inspect

Choose six controllers and press Start. Multiple humans receive an opaque
pass-device dialog before every private phase. Private drafts are cleared
between players and never appear in the public QA handle.

For orders, select a unit and destination on the map, or use the labelled
Your unit / Legal order selectors. Both methods produce the same draft.
Support mode highlights only legal targets and destinations. Clear selection
or Escape exits selection without deleting committed draft orders.

The public inspector shows complete province names, unit identity and centre
ownership. Narrow maps use codes to avoid dense western-coast label collisions.
The legend explains unit shapes, centres and replay marks.

Speed changes replay pauses, not bot deadlines. Random seats chooses six bots.

Example:

`?powers=human,sample-schemer,sample-expander,sample-turtle,sample-schemer,sample-expander&years=6&autostart=1`

Supported years: 6, 9, 12. Add `&speed=0` for Instant.
`window.__ANATOLIAN_PACT__()` returns detached public telemetry.

## Verification

Serve `frontend` over HTTP. Run:

    node --test tests/anatolian-pact-engine.test.mjs
    node --test tests/anatolian-pact-page.test.mjs
    node --test tests/anatolian-pact-review.test.mjs
    node --test tests/browser/anatolian-pact.test.mjs
    node --test tests/browser/anatolian-pact-review.test.mjs

Browser tests require Playwright and a site on port 4173, or
`ANCIENT_WORLD_BASE_URL`. They block service workers and apply same-origin CSP.

Bot manifest byte counts remain an independent integration requirement.
No sample bot files or manifest sizes were changed in this review.

Executable scripts and CSS are same-origin. JSON-LD is the only inline script.
There are no inline event handlers or style attributes in HTML. JavaScript
uses CSS custom properties through `style.setProperty`; canvas drawing is
independent of CSS.

This review was performed without code execution. It does not establish a
passing test run, regenerated map, bot-byte verification or browser screenshot
verification. Run the commands above before release.
