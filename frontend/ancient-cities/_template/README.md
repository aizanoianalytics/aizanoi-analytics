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
6. Reuse `traversal.js`, `lifecycle.js`, `navigation.js` and `evidence.js`; do not create a city-local movement engine.
7. Desktop pointer lock and mobile touch paths both work.
8. `← Aizanoi OS` is always available.
9. Runtime CDN dependencies are not allowed. Pin/vendor approved renderer libraries in-repo or use the current renderer.
10. Add tests before the city becomes deployable.

## Asset strategy

Use shared/procedural builders for repeated urban fabric and reserve custom GLB/geometry for hero monuments whose identity is lost in generic massing. Prefer a small number of high-value hero assets over a giant asset pack.

## Renderer migration

A city manifest is renderer-neutral. If a future Three.js renderer is introduced, it should consume the same manifest, terrain function, evidence records and traversal contract. The renderer is replaceable; the city research model is not.
