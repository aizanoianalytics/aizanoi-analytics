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
"""  const colors = {
    standing: 0xc9b58e,
    working: 0xa96543,
    new: 0xd8d0b4,
    repaired: 0xbfae8b,
    fortified: 0x94765a,
    spoliated: 0x9e7355,
    damaged: 0x875943,
    ruined: 0x685348,
    burial: 0x6f6554,
    inferred: 0x8c6c50,
  };
  return new THREE.MeshStandardMaterial({
    color: colors[state] ?? (atmospheric ? 0x846c51 : 0x9b7657),
    roughness: atmospheric ? 0.96 : 0.84,
    metalness: 0,
  });
}

function terrainMaterial(THREE) {
  return new THREE.MeshStandardMaterial({ color: 0x6f7350, roughness: 1, metalness: 0 });
}
""",
"""  const colors = {
    standing: 0xc8b894,
    working: 0x96563a,
    new: 0xd4c9aa,
    repaired: 0xbdaa87,
    fortified: 0x84664f,
    spoliated: 0x916448,
    damaged: 0x774a37,
    ruined: 0x5a473d,
    burial: 0x655b4d,
    inferred: 0x805039,
  };
  return new THREE.MeshStandardMaterial({
    color: colors[state] ?? (atmospheric ? 0x78503a : 0x987258),
    roughness: atmospheric ? 0.97 : 0.87,
    metalness: 0,
  });
}

function terrainMaterial(THREE) {
  return new THREE.MeshStandardMaterial({ color: 0x584a31, roughness: 1, metalness: 0 });
}
""",
'material palette',
)

old_urban = """function addUrbanFabric(THREE, scene, simulation) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = materialForState(THREE, 'inferred', true);
  const mesh = new THREE.InstancedMesh(geometry, material, simulation.urbanFabric.length);
  mesh.name = 'Plausible urban fabric';
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  for (const [index, record] of simulation.urbanFabric.entries()) {
    const ground = simulation.terrainHeightAt(record.x, record.z);
    position.set(record.x, ground + record.h / 2, record.z);
    euler.set(0, record.rot || 0, 0);
    quaternion.setFromEuler(euler);
    scale.set(record.w, record.h, record.d);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}
"""
new_urban = """function addUrbanFabric(THREE, scene, simulation) {
  const count = simulation.urbanFabric.length;
  const wallGeometry = new THREE.BoxGeometry(1, 1, 1);
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
    vertexColors: true,
  });
  const walls = new THREE.InstancedMesh(wallGeometry, wallMaterial, count);
  walls.name = 'Plausible urban fabric walls';

  const roofGeometry = new THREE.ConeGeometry(0.72, 1, 4, 1, false);
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x5f2f21,
    roughness: 0.98,
    metalness: 0,
  });
  const roofs = new THREE.InstancedMesh(roofGeometry, roofMaterial, count);
  roofs.name = 'Plausible urban fabric roof silhouettes';

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const wallColors = [0x84533a, 0xa47655, 0xc0ad86, 0x76503b];

  for (const [index, record] of simulation.urbanFabric.entries()) {
    const ground = simulation.terrainHeightAt(record.x, record.z);
    const rotation = record.rot || 0;

    position.set(record.x, ground + record.h / 2, record.z);
    euler.set(0, rotation, 0);
    quaternion.setFromEuler(euler);
    scale.set(record.w, record.h, record.d);
    matrix.compose(position, quaternion, scale);
    walls.setMatrixAt(index, matrix);
    walls.setColorAt(index, new THREE.Color(wallColors[index % wallColors.length]));

    const roofHeight = Math.min(4.4, Math.max(1.9, Math.min(record.w, record.d) * 0.19));
    position.set(record.x, ground + record.h + roofHeight / 2 - 0.05, record.z);
    euler.set(0, rotation + Math.PI / 4, 0);
    quaternion.setFromEuler(euler);
    scale.set(record.w * 0.78, roofHeight, record.d * 0.78);
    matrix.compose(position, quaternion, scale);
    roofs.setMatrixAt(index, matrix);
  }
  walls.instanceMatrix.needsUpdate = true;
  walls.instanceColor.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  scene.add(walls, roofs);
}
"""
replace_once(old_urban, new_urban, 'urban fabric')

replace_once(
"""  renderer.toneMappingExposure = 1.02;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7d8178);
  scene.fog = new THREE.FogExp2(0x8f897c, mobile ? 0.00105 : 0.00082);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.08, 2600);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight(0xd8d1b8, 0x4a4234, 2.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe1a8, 3.1);
  sun.position.set(340, 620, 220);
  scene.add(sun);
""",
"""  renderer.toneMappingExposure = 1.10;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x76766d);
  scene.fog = new THREE.FogExp2(0x7d786c, mobile ? 0.00096 : 0.00072);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.08, 2600);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight(0xd4cdb7, 0x3b3128, 2.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdda0, 3.85);
  sun.position.set(310, 590, 240);
  scene.add(sun);
""",
'lighting palette',
)

path.write_text(text, encoding='utf-8')
print('Patched Three.js Rome visual palette, roof silhouettes and lighting.')
