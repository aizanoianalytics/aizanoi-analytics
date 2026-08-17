from pathlib import Path

path = Path('frontend/ancient-cities/rome-410-476/js/app.js')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        "import { createLifecycle } from '../../../ancient-world/engine/lifecycle.js';\n",
        "import { createLifecycle } from '../../../ancient-world/engine/lifecycle.js';\nimport { createAdaptiveQualityController } from '../../../ancient-world/engine/performance.js';\n",
    ),
    (
        "import { generateUrbanFabric, URBAN_FABRIC_METHOD } from '../data/urban-fabric.js';\n",
        "import { generateUrbanFabric, URBAN_FABRIC_METHOD } from '../data/urban-fabric.js';\nimport { ROME_MANIFEST } from '../data/manifest.js';\n",
    ),
    (
        "const WORLD_BOUNDS = Object.freeze({ minX: -900, maxX: 700, minZ: -700, maxZ: 700 });\n",
        "const WORLD_BOUNDS = ROME_MANIFEST.bounds;\n",
    ),
    (
        "const SPRINT_SPEED = 7.2;\n\nconst C = {",
        "const SPRINT_SPEED = 7.2;\nconst quality = createAdaptiveQualityController({\n  mobile: TOUCH,\n  highPixelRatio: ROME_MANIFEST.performance.maxPixelRatioDesktop,\n  balancedPixelRatio: TOUCH ? ROME_MANIFEST.performance.maxPixelRatioMobile : 1.30,\n  lowPixelRatio: TOUCH ? 0.85 : 1.0,\n});\n\nconst C = {",
    ),
    (
        "function resize() {\n  const cap = TOUCH ? 1.15 : 1.55;\n  const dpr = Math.min(devicePixelRatio || 1, cap);",
        "function resize() {\n  const dpr = Math.min(devicePixelRatio || 1, quality.pixelRatioCap());",
    ),
    (
        "  last = now;\n  updatePlayer(dt);\n  draw();",
        "  last = now;\n  quality.sample(dt);\n  updatePlayer(dt);\n  draw();",
    ),
    (
        "window.__ANCIENT_WORLD_DEBUG__ = {\n  city: CITY,",
        "window.__ANCIENT_WORLD_DEBUG__ = {\n  city: CITY,\n  manifest: ROME_MANIFEST,\n  quality: () => quality.snapshot(),",
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count == 0 and new in text:
        continue
    if count != 1:
        raise SystemExit(f'Expected exactly one Rome patch target, found {count}: {old[:80]!r}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Patched Rome to consume city manifest and adaptive quality controller.')
