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
    "return new THREE.MeshStandardMaterial({ color: 0x584a31, roughness: 1, metalness: 0 });",
    "return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true });",
    'terrain material',
)

replace_once(
    "  const positions = [];\n  const indices = [];",
    "  const positions = [];\n  const colors = [];\n  const indices = [];",
    'terrain arrays',
)

replace_once(
"""      const x = Math.min(bounds.maxX, bounds.minX + col * step);
      positions.push(x, simulation.terrainHeightAt(x, z), z);
""",
"""      const x = Math.min(bounds.maxX, bounds.minX + col * step);
      const y = simulation.terrainHeightAt(x, z);
      positions.push(x, y, z);
      const grain = (Math.sin(x * 0.021) + Math.sin(z * 0.017) + Math.sin((x + z) * 0.008)) * 0.018;
      const heightTint = Math.max(-0.025, Math.min(0.05, y * 0.005));
      const shade = 0.94 + grain + heightTint;
      colors.push(0.34 * shade, 0.29 * shade, 0.19 * shade);
""",
    'terrain vertex color generation',
)

replace_once(
"""  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
""",
"""  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
""",
    'terrain color attribute',
)

replace_once(
"""  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
    vertexColors: true,
  });
""",
"""  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
  });
""",
    'instance color material',
)

path.write_text(text, encoding='utf-8')
print('Patched Three.js terrain vertex colors and urban instance-color material.')
