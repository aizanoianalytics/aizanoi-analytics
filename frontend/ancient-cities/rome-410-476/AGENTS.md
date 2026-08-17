# Rome 410–476 WebGL Context

Standalone static WebGL experience served at `/ancient-cities/rome-410-476/`.

## Files
- `index.html` — UI, controls, intro and responsive styling.
- `js/app.js` — dependency-free WebGL renderer, primitive mesh builders, movement, source modals, opt-in Web Audio ambience, modern overlay and 14-region minimap.
- `data/city.js` — source IDs, monuments, streets, regions and teleports. Keep archaeological claims in data, rather than embedding unsupported copy into renderer logic.
- `research/index.html` — browser-readable research summary.

## Safety / archaeology rules
1. Do not use CDN assets, map tiles, analytics, tracking or runtime APIs.
2. Audio must remain user-initiated: browsers block autoplay; use Web Audio only after an explicit click.
3. The `modern overlay` is schematic orientation only, not a claimed exact modern cadastral map.
4. Keep `state` distinct from evidence: it communicates the 410–476 visual treatment (`standing`, `working`, `damaged`, `ruined`, `spoliated`, `inferred`).
5. Do not make fifth-century visual claims in the UI without a source entry.
6. Treat domestic massing and unresolved elevation as schematic/inferred.

## Required validation
- `node --test tests/rome-world.test.mjs`
- `node --check frontend/ancient-cities/rome-410-476/js/app.js`
- Browser: initial WebGL render, 14-region atlas, modern overlay, source modal, landmark jump, and no console errors.
- Before production: copy the whole folder, create nginx exact/prefix routes so SPA fallback does not swallow JS modules; backup first; `nginx -t`; reload; HTTP smoke test.
