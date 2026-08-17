from pathlib import Path

path = Path('experiments/threejs-rome-renderer/src/main.js')
text = path.read_text(encoding='utf-8')

imports_old = "import { installRomePocControls } from './runtime-controls.js';\n"
imports_new = "import { installRomePocControls } from './runtime-controls.js';\nimport { buildColosseumHero } from './hero-builders.js';\n"
if text.count(imports_old) != 1:
    raise SystemExit(f'Expected one hero import insertion point, found {text.count(imports_old)}')
text = text.replace(imports_old, imports_new, 1)

hero_old = """  if (record.id === 'colosseum') {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 64, 1, true), material);
    shell.position.y = record.h / 2;
    shell.scale.set(record.w, record.h, record.d);
    group.add(shell);
    const arena = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.6, 64),
      new THREE.MeshStandardMaterial({ color: 0x8d7354, roughness: 1 }),
    );
    arena.position.y = 0.3;
    arena.scale.set(record.w * 0.62, 1, record.d * 0.58);
    group.add(arena);
  } else if (record.id === 'pantheon') {
"""
hero_new = """  if (record.id === 'colosseum') {
    group.add(buildColosseumHero(THREE, record, material));
  } else if (record.id === 'pantheon') {
"""
if text.count(hero_old) != 1:
    raise SystemExit(f'Expected one Colosseum proxy block, found {text.count(hero_old)}')
text = text.replace(hero_old, hero_new, 1)

path.write_text(text, encoding='utf-8')
print('Patched Three.js PoC to use the instanced Colosseum hero benchmark builder.')
