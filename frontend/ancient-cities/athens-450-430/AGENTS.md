# Athens · 450–430 BCE — Classical Athens of Pericles

A renderer-neutral historical city model served at `/ancient-cities/athens-450-430/`.

## Files

- `index.html` — UI, controls, intro, evidence and source modals.
- `js/app.js` — Athens-specific renderer, monument builders, district atlas, audio, modern overlay.
- `js/methodology.js` — keeps the reconstruction-methodology panel readable without WebGL.
- `data/city-source.js` — preserved source dataset / research ledger used for auditability.
- `data/city.js` — period-correct c. 432–430 BCE view of the source dataset consumed by the renderer.
- `data/terrain.js` — schematic Attic topography: Acropolis rock, Areopagus, Pnyx, hills around the walled town; the rivers Eridanos and Kephissos; the Kifissos out on the western plain.
- `data/urban-fabric.js` — deterministic, plausible Athens and Piraeus block massing subordinate to named buildings and major streets.
- `data/manifest.js` — `defineAncientCity(...)` adapter; same contract as Rome.
- `research/index.html` — local research summary, sources, methodology.
- `../../ancient-world/engine/` — shared traversal, lifecycle, navigation, evidence and adaptive quality.

## Period framing

- **Title / historical frame:** ATHENS · 450–430 BCE
- **Rendered visual snapshot:** c. 432–430 BCE, near the endpoint of that frame. This prevents later fifth-century buildings from being back-projected into an earlier city simply because their dates fall close to the title boundary.
- **Frame:** the Periclean city between the Thirty Years' Peace of 445 BCE and the outbreak of the Plague of Athens in 430 BCE.
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

`new` covers monuments complete by the c. 432–430 BCE visual snapshot (for example the Parthenon and Propylaea). `working` covers buildings whose construction plausibly overlaps that endpoint. A structure begun after 430 BCE is not rendered merely because the broader historical frame begins at 450 BCE.

## Safety / archaeology rules

1. Do not use CDN assets, map tiles, analytics, tracking or runtime APIs.
2. Audio must remain user-initiated: browsers block autoplay; use Web Audio only after an explicit click.
3. The "modern overlay" is a schematic orientation layer, not a surveyed modern cadastral map.
4. Domestic massing from `urban-fabric.js` is `plausible` by design, not an individually excavated restitution.
5. The Classical Temple of Athena Nike (426–421 BCE), Erechtheion (421–406 BCE), Athenian Asklepieion (founded 420/19 BCE), and the later Pompeion must not appear as completed c. 432–430 BCE buildings. Preserve earlier/repaired precinct elements where the evidence supports them.
6. The Olympieion here is the small archaic sanctuary / Deigma, not the later Roman giant.
7. The Long Walls shown are the Themistoclean walls of 478 BCE plus the Kimonian wall (mid-5th c., then broken — show a single line with a gap, not the Konon re-build of 394 BCE which is out of period).
8. The Theatre of Dionysus must not default to the later fourth-century monumental stone theatre. The safer Classical-period language is an earthen orchestra with substantial timber ikria/bleacher construction and a developing stage complex.
9. Do not claim to depict the Plague of Athens — it begins at the boundary of this period. Note the lead-in only.

## Required validation

- `node --test tests/rome-world.test.mjs tests/rome-world-rebuild.test.mjs tests/ancient-world-engine.test.mjs tests/ancient-world-integration.test.mjs tests/ancient-world-city-contract.test.mjs tests/athens-450-430.test.mjs`
- `node --check frontend/ancient-cities/athens-450-430/js/app.js`
- `node --check frontend/ancient-cities/athens-450-430/data/city.js`
- `node --check frontend/ancient-cities/athens-450-430/data/city-source.js`
- `node --check frontend/ancient-cities/athens-450-430/data/terrain.js`
- `node --check frontend/ancient-cities/athens-450-430/data/urban-fabric.js`
- `node --check frontend/ancient-cities/athens-450-430/data/manifest.js`
- Browser smoke test: ground-level eye height, hill/valley transitions, WASD speed, diagonal slide, all landmark teleports followed by immediate movement, regional atlas, evidence badge, source modal, mobile D-pad/look, pointer lock, Back to Aizanoi OS, no console errors.
- Visual chronology smoke: the Acropolis must show the c. 432–430 precinct rather than the later Erechtheion / Classical Athena Nike temple, and the South Slope/Kerameikos must not display the later Asklepieion/Pompeion as completed buildings.
- Before production: copy the whole Athens folder plus `frontend/ancient-world/`, set up nginx exact/prefix routes so SPA fallback does not swallow JS modules; backup first; `nginx -t`; reload; HTTP smoke test.
