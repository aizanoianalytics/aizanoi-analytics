export function buildColosseumHero(THREE, record, material) {
  if (!THREE || !record) throw new TypeError('buildColosseumHero requires THREE and a monument record.');

  const group = new THREE.Group();
  group.name = `${record.name} · procedural hero benchmark`;
  group.userData.heroBuilder = 'colosseum-procedural-v1';
  group.userData.visualEvidence = 'plausible';

  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 1, 72, 4, true),
    material,
  );
  shell.position.y = record.h / 2;
  shell.scale.set(record.w, record.h, record.d);
  shell.name = 'Colosseum outer structural shell';
  group.add(shell);

  const innerMaterial = new THREE.MeshStandardMaterial({
    color: 0x5d4a3c,
    roughness: 0.94,
    metalness: 0,
    side: THREE.BackSide,
  });
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 1, 72, 3, true),
    innerMaterial,
  );
  inner.position.y = record.h * 0.47;
  inner.scale.set(record.w * 0.72, record.h * 0.82, record.d * 0.68);
  inner.name = 'Colosseum inner seating silhouette';
  group.add(inner);

  const arena = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.6, 64),
    new THREE.MeshStandardMaterial({ color: 0x8d7354, roughness: 1, metalness: 0 }),
  );
  arena.position.y = 0.3;
  arena.scale.set(record.w * 0.58, 1, record.d * 0.54);
  arena.name = 'Colosseum arena floor';
  group.add(arena);

  const bandMaterial = new THREE.MeshStandardMaterial({
    color: 0xb9a582,
    roughness: 0.86,
    metalness: 0,
  });
  for (const fraction of [0.22, 0.44, 0.66, 0.88]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.012, 5, 72), bandMaterial);
    band.rotation.x = Math.PI / 2;
    band.position.y = record.h * fraction;
    band.scale.set(record.w * 0.97, record.d * 0.97, Math.max(record.w, record.d));
    band.name = `Colosseum tier band ${fraction}`;
    group.add(band);
  }

  const bays = 72;
  const levels = [0.13, 0.34, 0.55];
  const count = bays * levels.length;
  const pierGeometry = new THREE.BoxGeometry(1, 1, 1);
  const pierMaterial = new THREE.MeshStandardMaterial({
    color: 0xc7b28d,
    roughness: 0.88,
    metalness: 0,
  });
  const piers = new THREE.InstancedMesh(pierGeometry, pierMaterial, count);
  piers.name = 'Colosseum instanced facade piers';
  piers.userData.instances = count;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const a = record.w * 0.49;
  const b = record.d * 0.49;
  const pierHeight = record.h * 0.15;
  let index = 0;

  for (const level of levels) {
    for (let bay = 0; bay < bays; bay++) {
      const angle = bay * Math.PI * 2 / bays;
      const x = Math.cos(angle) * a;
      const z = Math.sin(angle) * b;
      position.set(x, record.h * level + pierHeight / 2, z);
      euler.set(0, -Math.atan2(Math.cos(angle) * b, -Math.sin(angle) * a), 0);
      quaternion.setFromEuler(euler);
      scale.set(1.35, pierHeight, 2.0);
      matrix.compose(position, quaternion, scale);
      piers.setMatrixAt(index++, matrix);
    }
  }
  piers.instanceMatrix.needsUpdate = true;
  group.add(piers);

  group.userData.benchmark = Object.freeze({
    facadeInstances: count,
    shellSegments: 72,
    tierBands: 4,
  });
  return group;
}
