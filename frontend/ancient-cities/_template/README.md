# Ancient World city template

Use this folder as the starting contract for a new historical city. Do not copy Rome's renderer and movement code into a new directory. Reuse the shared engine and add city-specific research, terrain and builders.

## Minimum city package

```text
ancient-cities/<city-id>/
├── index.html
├── data/
│   ├── city.js          # source-led city content
│   ├── manifest.js      # defineAncientCity(...) adapter
│   └── terrain.js       # one source of truth for visible + physical height
├── js/
│   └── app.js           # renderer / city-specific builders only
└── research/
    └── index.html
```

## Non-negotiable rules

1. `manifest.js` must pass `defineAncientCity` validation.
2. Spawn and every teleport target must be inside bounds and safe after collision resolution.
3. Visible terrain and traversal support use the same height function.
4. Historical confidence is explicit: `archaeological`, `documented`, `plausible`, `atmospheric`.
5. Procedural urban fabric is never silently upgraded to archaeological fact.
6. Reuse `traversal.js`, `lifecycle.js`, `navigation.js`, `evidence.js` and `performance.js`; do not create a city-local movement engine.
7. Mobile exploration must use the shared `mobile-controls.js` + `mobile-controls.css` contract: left analog joystick, right-side drag look, hold-to-run and compact inspect/map actions. Do not introduce a city-local D-pad.
8. Walkable city pages should use `city-polish.css` as the shared presentation baseline, then add only historically appropriate city-specific tuning.
9. Desktop pointer lock/keyboard and mobile touch paths must both work without changing traversal semantics.
10. `← Aizanoi OS` is always available and must clean up lifecycle state before navigating home.
11. Runtime CDN dependencies are not allowed. Pin/vendor approved renderer libraries in-repo or use the current renderer.
12. Add both deterministic regression tests and a real browser smoke before the city becomes deployable.

## Shared mobile DOM contract

Every walkable Ancient World city should expose the same control IDs so the shared controller can be installed without city-specific input code:

```html
<div id="mobileControls" hidden>
  <div id="movePad"><div id="moveKnob"></div></div>
  <div id="lookHint">DRAG RIGHT SIDE · LOOK</div>
  <div class="mobileActionRail">
    <button id="mobileRun" class="mobileAction">RUN</button>
    <button id="mobileInspect" class="mobileAction">INSPECT</button>
    <button id="mobileMap" class="mobileAction">MAP</button>
  </div>
</div>
```

The city renderer reads `mobileControls.snapshot()` and feeds those values into the same shared traversal path used by WASD. Mobile input must never bypass collision/support/teleport rules.

## Asset strategy

Use shared/procedural builders for repeated urban fabric and reserve custom GLB/geometry for hero monuments whose identity is lost in generic massing. Prefer a small number of high-value hero assets over a giant asset pack.

## Renderer migration

A city manifest is renderer-neutral. If a future Three.js renderer is introduced, it should consume the same manifest, terrain function, evidence records and traversal contract. The renderer is replaceable; the city research model is not.
