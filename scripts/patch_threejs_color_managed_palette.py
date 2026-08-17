from pathlib import Path

path = Path('experiments/threejs-rome-renderer/src/main.js')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one patch target, found {count}')
    text = text.replace(old, new, 1)

replace_once(
    "import { buildColosseumHero } from './hero-builders.js';\n",
    "import { buildColosseumHero } from './hero-builders.js';\nimport { createTerrainColorSampler, ROME_VISUAL_PALETTE } from './visual-palette.js';\n",
    'palette import',
)

replace_once(
    "  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / step) + 1;\n  const positions = [];",
    "  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / step) + 1;\n  const terrainColorAt = createTerrainColorSampler(THREE);\n  const positions = [];",
    'terrain sampler creation',
)

replace_once(
"""      const y = simulation.terrainHeightAt(x, z);
      positions.push(x, y, z);
      const grain = (Math.sin(x * 0.021) + Math.sin(z * 0.017) + Math.sin((x + z) * 0.008)) * 0.018;
      const heightTint = Math.max(-0.025, Math.min(0.05, y * 0.005));
      const shade = 0.94 + grain + heightTint;
      colors.push(0.34 * shade, 0.29 * shade, 0.19 * shade);
""",
"""      const y = simulation.terrainHeightAt(x, z);
      positions.push(x, y, z);
      colors.push(...terrainColorAt(x, z, y));
""",
    'terrain color sampling',
)

replace_once(
    "  const wallColors = [0x84533a, 0xa47655, 0xc0ad86, 0x76503b];\n",
    "  const wallColors = ROME_VISUAL_PALETTE.urbanWalls;\n",
    'urban wall palette',
)

replace_once(
    "    color: 0x5f2f21,\n",
    "    color: ROME_VISUAL_PALETTE.roofs,\n",
    'roof palette',
)

replace_once(
    "  scene.background = new THREE.Color(0x76766d);\n  scene.fog = new THREE.FogExp2(0x7d786c, mobile ? 0.00096 : 0.00072);\n",
    "  scene.background = new THREE.Color(ROME_VISUAL_PALETTE.sky);\n  scene.fog = new THREE.FogExp2(ROME_VISUAL_PALETTE.fog, mobile ? 0.00096 : 0.00072);\n",
    'sky/fog palette',
)

path.write_text(text, encoding='utf-8')
print('Patched Three.js Rome to use the color-managed visual palette sampler.')
