# Athens · 450–430 BCE — Classical Athens of Pericles

A renderer-neutral historical city model served at `/ancient-cities/athens-450-430/`.

## Files

- `index.html` — UI, controls, intro, evidence and source modals.
- `js/app.js` — Athens-specific renderer, monument builders, district atlas, audio, modern overlay.
- `js/methodology.js` — keeps the reconstruction-methodology panel readable without WebGL.
- `data/city.js` — names, periods, regions, streets, buildings, teleports, sources (Greek/English labels).
- `data/terrain.js` — schematic Attic topography: Acropolis rock, Areopagus, Pnyx, hills around the walled town; the rivers Eridanos and Kephissos; the Kifissos out on the western plain.
- `data/urban-fabric.js` — deterministic, plausible Athens and Piraeus block massing subordinate to named buildings and major streets.
- `data/manifest.js` — `defineAncientCity(...)` adapter; same contract as Rome.
- `research/index.html` — local research summary, sources, methodology.
- `../../ancient-world/engine/` — shared traversal, lifecycle, navigation, evidence and adaptive quality.

## Period framing

- **Title:** ATHENS · 450–430 BCE
- **Frame:** the Periclean city at the peak of the High Classical period, between the Thirty Years' Peace of 445 BCE and the outbreak of the Plague of Athens in 430 BCE.
- **Geographic model:** the walled town on and around the Acropolis rock; the Agora to the northwest of the rock; the Kerameikos cemetery outside the Sacred and Dipylon Gates; the Piraeus harbour city connected by the Long Walls; the Long Walls corridor itself.

## Evidence vocabulary

Use the shared engine vocabulary verbatim:

- `archaeological` — physical evidence, excavated remains, foundation cuts, sculptural fragments in situ.
- `documented` — written source (inscription, literary mention) supported by physical context.
- `plausible` — scholarly consensus for a missing or inferred element (e.g. residential massing, interior plans).
- `atmospheric` — soundscape, smell, light and event references that are evocative, not evidentiary.

A monument, district or road must declare its evidence level. Procedural urban fabric is always `plausible`.

## State vocabulary

Use the same state vocabulary as Rome:

`standing`, `working`, `new`, `repaired`, `fortified`, `spoliated`, `damaged`, `ruined`, `burial`, `inferred`.

`new` covers monuments finished in this period (e.g. the Parthenon and Propylaea). `repaired` covers monuments that have just been rebuilt (e.g. the Hephaisteion). `under-construction` for the Erechtheion is not a separate state — it is `working` with the evidence note "under construction in this period".

## Safety / archaeology rules

1. Do not use CDN assets, map tiles, analytics, tracking or runtime APIs.
2. Audio must remain user-initiated: browsers block autoplay; use Web Audio only after an explicit click.
3. The "modern overlay" is a schematic orientation layer, not a surveyed modern cadastral map.
4. Domestic massing from `urban-fabric.js` is `plausible` by design, not an individually excavated restitution.
5. The Erechtheion was under construction in this period — never show it as finished marble.
6. The Olympieion here is the small archaic sanctuary / Deigma, not the later Roman giant.
7. The Long Walls shown are the Themistoclean walls of 478 BCE plus the Kimonian wall (mid-5th c., then broken — show a single line with a gap, not the Konon re-build of 394 BCE which is out of period).
8. Do not claim to depict the Plague of Athens — it begins at the boundary of this period. Note the lead-in only.

## Required validation

- `node --test tests/rome-world.test.mjs tests/rome-world-rebuild.test.mjs tests/ancient-world-engine.test.mjs tests/ancient-world-integration.test.mjs tests/ancient-world-city-contract.test.mjs tests/athens-450-430.test.mjs`
- `node --check frontend/ancient-cities/athens-450-430/js/app.js`
- `node --check frontend/ancient-cities/athens-450-430/data/city.js`
- `node --check frontend/ancient-cities/athens-450-430/data/terrain.js`
- `node --check frontend/ancient-cities/athens-450-430/data/urban-fabric.js`
- `node --check frontend/ancient-cities/athens-450-430/data/manifest.js`
- Browser smoke test: ground-level eye height, hill/valley transitions, WASD speed, diagonal slide, all landmark teleports followed by immediate movement, regional atlas, evidence badge, source modal, mobile D-pad/look, pointer lock, Back to Aizanoi OS, no console errors.
- Before production: copy the whole Athens folder plus `frontend/ancient-world/`, set up nginx exact/prefix routes so SPA fallback does not swallow JS modules; backup first; `nginx -t`; reload; HTTP smoke test.
