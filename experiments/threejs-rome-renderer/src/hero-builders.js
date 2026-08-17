export function buildColosseumHero(THREE, record, material) {
  if (!THREE || !record) throw new TypeError('buildColosseumHero requires THREE and a monument record.');

  const group = new THREE.Group();
  group.name = `${record.name} · procedural hero benchmark`;
  group.userData.heroBuilder = 'colosseum-procedural-v1';
  group.userData.visualEvidence = 'plausible';

  // Keep a dark recessed inner body behind the facade instead of an opaque
  // outer cylinder. The arcade rhythm must be produced by actual separate
  // facade members so openings remain readable from street level.
  const innerMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a3729,
    roughness: 0.96,
    metalness: 0,
  });
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 1, 72, 3, true),
    innerMaterial,
  );
  inner.position.y = record.h * 0.34;
  inner.scale.set(record.w * 0.88, record.h * 0.68, record.d * 0.86);
  inner.name = 'Colosseum recessed inner structure';
  group.add(inner);

  const arena = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.6, 64),
    new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 1, metalness: 0 }),
  );
  arena.position.y = 0.3;
  arena.scale.set(record.w * 0.58, 1, record.d * 0.54);
  arena.name = 'Colosseum arena floor';
  group.add(arena);

  const facadeMaterial = new THREE.MeshStandardMaterial({
    color: 0xcdbb98,
    roughness: 0.88,
    metalness: 0,
  });
  const bandMaterial = new THREE.MeshStandardMaterial({
    color: 0xbca886,
    roughness: 0.90,
    metalness: 0,
  });

  const bandFractions = [0.055, 0.255, 0.455, 0.655];
  const bandHeight = record.h * 0.045;
  for (const fraction of bandFractions) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1, 72, 1, true),
      bandMaterial,
    );
    band.position.y = record.h * fraction;
    band.scale.set(record.w * 0.995, bandHeight, record.d * 0.995);
    band.name = `Colosseum structural band ${fraction}`;
    group.add(band);
  }

  const bays = 72;
  const levels = [0.075, 0.275, 0.475];
  const count = bays * levels.length;
  const pierHeight = record.h * 0.145;
  const a = record.w * 0.495;
  const b = record.d * 0.495;
  const pierGeometry = new THREE.BoxGeometry(1, 1, 1);
  const piers = new THREE.InstancedMesh(pierGeometry, facadeMaterial, count);
  piers.name = 'Colosseum instanced facade piers';
  piers.userData.instances = count;

  const lintelGeometry = new THREE.BoxGeometry(1, 1, 1);
  const lintels = new THREE.InstancedMesh(lintelGeometry, facadeMaterial, count);
  lintels.name = 'Colosseum instanced arcade lintels';
  lintels.userData.instances = count;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  let index = 0;

  for (const level of levels) {
    for (let bay = 0; bay < bays; bay++) {
      const angle = bay * Math.PI * 2 / bays;
      const x = Math.cos(angle) * a;
      const z = Math.sin(angle) * b;
      const tangentYaw = -Math.atan2(Math.cos(angle) * b, -Math.sin(angle) * a);
      euler.set(0, tangentYaw, 0);
      quaternion.setFromEuler(euler);

      position.set(x, record.h * level + pierHeight / 2, z);
      scale.set(1.55, pierHeight, 2.8);
      matrix.compose(position, quaternion, scale);
      piers.setMatrixAt(index, matrix);

      position.set(x, record.h * level + pierHeight + record.h * 0.012, z);
      scale.set(3.15, record.h * 0.024, 2.9);
      matrix.compose(position, quaternion, scale);
      lintels.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  piers.instanceMatrix.needsUpdate = true;
  lintels.instanceMatrix.needsUpdate = true;
  group.add(piers, lintels);

  // The upper attic remains more solid, but recessed dark panels preserve a
  // readable vertical rhythm without claiming an exact fifth-century facade.
  const atticHeight = record.h * 0.29;
  const attic = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 1, 72, 1, true),
    material,
  );
  attic.position.y = record.h * 0.835;
  attic.scale.set(record.w * 0.985, atticHeight, record.d * 0.985);
  attic.name = 'Colosseum upper attic mass';
  group.add(attic);

  const atticSlots = 48;
  const slotMaterial = new THREE.MeshStandardMaterial({ color: 0x3c2b22, roughness: 1, metalness: 0 });
  const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), slotMaterial, atticSlots);
  slots.name = 'Colosseum recessed attic slots';
  for (let bay = 0; bay < atticSlots; bay++) {
    const angle = bay * Math.PI * 2 / atticSlots;
    const x = Math.cos(angle) * record.w * 0.498;
    const z = Math.sin(angle) * record.d * 0.498;
    const tangentYaw = -Math.atan2(Math.cos(angle) * record.d, -Math.sin(angle) * record.w);
    position.set(x, record.h * 0.835, z);
    euler.set(0, tangentYaw, 0);
    quaternion.setFromEuler(euler);
    scale.set(1.15, record.h * 0.11, 0.9);
    matrix.compose(position, quaternion, scale);
    slots.setMatrixAt(bay, matrix);
  }
  slots.instanceMatrix.needsUpdate = true;
  group.add(slots);

  const topCornice = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 1, 72, 1, true),
    bandMaterial,
  );
  topCornice.position.y = record.h * 0.985;
  topCornice.scale.set(record.w, record.h * 0.035, record.d);
  topCornice.name = 'Colosseum top cornice';
  group.add(topCornice);

  group.userData.benchmark = Object.freeze({
    facadeInstances: count,
    lintelInstances: count,
    atticSlots,
    shellSegments: 72,
    tierBands: bandFractions.length,
  });
  return group;
}
