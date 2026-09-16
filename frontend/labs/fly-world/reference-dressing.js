/**
 * Fly World reference dressing pass v0.3.
 *
 * Adds the dense, lived-in details visible in the approved people-free house
 * illustration without changing the base room topology.  The browser fallback
 * deliberately mirrors the Blender detail pass so visual review does not see a
 * completely different house while the GLB is being regenerated.
 */

export function applyReferenceDressing({ THREE, scene, materials: M, box, cylinder }) {
  const addSphere = (radius, position, material, name, segments = 14) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.max(8, segments - 4)), material);
    mesh.position.set(...position);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  const addTorus = (major, tube, position, material, name, rotation = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(major, tube, 10, 28), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.name = name;
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  };

  const addLine = (a, b, material, name, radius = 0.012) => {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const length = direction.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
    mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.name = name;
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  };

  const plasterPatch = new THREE.MeshStandardMaterial({ color: 0xb7a58c, roughness: 1 });
  const plasterPatchDark = new THREE.MeshStandardMaterial({ color: 0x9d8d78, roughness: 1 });
  const clothWhite = new THREE.MeshStandardMaterial({ color: 0xe5dfcf, roughness: 1, side: THREE.DoubleSide });
  const mustardCloth = new THREE.MeshStandardMaterial({ color: 0x9c7b3e, roughness: 1, side: THREE.DoubleSide });
  const orange = new THREE.MeshStandardMaterial({ color: 0xc86b24, roughness: 0.8 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xcba43d, roughness: 0.85 });
  const paleBlue = new THREE.MeshStandardMaterial({ color: 0x7e9ead, roughness: 0.8 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1d1b1a, roughness: 0.72, metalness: 0.15 });

  // Large muted carpet under the seating/stove zone.  The reference has a broad
  // worn green carpet beneath the smaller runner and round rug, not bare floor.
  box([6.55, 4.35, 0.026], [-0.55, -0.05, 0.02], M.greenTextile, 'reference-main-carpet');
  for (const x of [-3.64, 2.54]) box([0.08, 4.18, 0.012], [x, -0.05, 0.04], M.woodLight, `carpet-border-x-${x}`);
  for (const y of [-2.10, 2.00]) box([6.15, 0.08, 0.012], [-0.55, y, 0.04], M.woodLight, `carpet-border-y-${y}`);
  for (let i = 0; i < 18; i++) {
    const x = -3.25 + (i % 6) * 1.1;
    const y = -1.72 + Math.floor(i / 6) * 1.52;
    box([0.16, 0.08, 0.012], [x, y, 0.047], i % 2 ? M.redTextile : M.woodDark, `carpet-motif-${i}`, { rotationZ: (i % 3 - 1) * 0.35 });
  }

  // Thick doorway casing: an important silhouette in the approved reference.
  box([0.28, 0.30, 2.58], [4.05, 0.16, 1.29], M.woodDark, 'door-frame-near', { solid: true });
  box([0.28, 0.30, 2.58], [4.05, 1.84, 1.29], M.woodDark, 'door-frame-far', { solid: true });
  box([0.28, 1.98, 0.28], [4.05, 1.00, 2.48], M.woodDark, 'door-frame-header', { solid: true });
  box([0.08, 1.68, 0.10], [3.91, 1.00, 0.05], M.woodLight, 'door-threshold');

  // Old round wall clock between the curtains and the cabinet.
  cylinder(0.26, 0.055, [-3.72, 1.18, 2.22], M.woodDark, 'wall-clock-frame', { axis: 'x' });
  cylinder(0.215, 0.065, [-3.69, 1.18, 2.22], M.ceramic, 'wall-clock-face', { axis: 'x' });
  addLine([-3.65, 1.18, 2.22], [-3.63, 1.18, 2.34], black, 'clock-hand-minute', 0.009);
  addLine([-3.65, 1.18, 2.22], [-3.65, 1.27, 2.18], black, 'clock-hand-hour', 0.011);

  // Cabinet-top still life: red books, lace runner, fruit bowl, framed photo and
  // the small blue decorative globe/ball visible in the illustration.
  box([0.52, 0.30, 0.06], [-2.10, 2.49, 2.42], M.redTextile, 'cabinet-top-book-red', { rotationZ: -0.09 });
  box([0.46, 0.28, 0.045], [-2.05, 2.47, 2.49], M.woodLight, 'cabinet-top-book-cream', { rotationZ: -0.04 });
  box([1.20, 0.44, 0.018], [-0.92, 2.48, 2.39], M.lace, 'cabinet-top-lace-runner', { rotationZ: 0.04 });
  cylinder(0.27, 0.08, [-0.75, 2.47, 2.48], M.woodLight, 'fruit-bowl');
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    addSphere(0.075 + (i % 3) * 0.01, [-0.75 + Math.cos(a) * 0.17, 2.47 + Math.sin(a) * 0.11, 2.56 + (i % 2) * 0.03], i % 2 ? orange : yellow, `fruit-${i}`);
  }
  box([0.31, 0.07, 0.39], [0.42, 2.47, 2.52], M.woodDark, 'cabinet-photo-frame', { rotationZ: -0.03 });
  box([0.24, 0.055, 0.31], [0.42, 2.43, 2.52], plasterPatchDark, 'cabinet-photo');
  addSphere(0.135, [-0.05, 2.46, 2.45], paleBlue, 'blue-ornamental-globe', 18);
  addLine([-0.05, 2.46, 2.30], [-0.05, 2.46, 2.42], M.metalLight, 'globe-stand', 0.018);

  // Carved cabinet face overlays.  These small frame/motif pieces make the long
  // reddish unit read as carved furniture instead of a featureless wall box.
  const panelXs = [-2.18, -1.20, -0.22, 0.76, 1.62];
  panelXs.forEach((x, i) => {
    box([0.66, 0.025, 0.72], [x, 2.555, 1.48], M.woodDark, `carved-panel-bg-${i}`);
    box([0.52, 0.018, 0.58], [x, 2.535, 1.48], M.woodLight, `carved-panel-inner-${i}`);
    addTorus(0.16, 0.025, [x, 2.515, 1.48], M.woodDark, `carved-rosette-${i}`, [Math.PI / 2, 0, 0]);
  });

  // Front-left CRT/radiogram cabinet gets louvers and a lower open shelf with
  // cups/glasses, matching the dense left edge of the reference.
  for (let i = 0; i < 6; i++) box([0.58, 0.035, 0.055], [-3.36, -2.425, 1.17 + i * 0.06], M.woodDark, `tv-louver-${i}`);
  box([0.88, 0.50, 0.58], [-3.36, -2.04, 0.23], M.woodDark, 'tv-lower-cabinet', { solid: true });
  box([0.72, 0.05, 0.33], [-3.36, -2.34, 0.28], black, 'tv-lower-open-shelf');
  for (let i = 0; i < 4; i++) {
    cylinder(0.07 + (i % 2) * 0.01, 0.15, [-3.61 + i * 0.17, -2.37, 0.26], M.ceramic, `shelf-cup-${i}`);
    addTorus(0.07, 0.015, [-3.54 + i * 0.17, -2.39, 0.28], M.ceramic, `shelf-cup-handle-${i}`, [Math.PI / 2, 0, 0]);
  }
  // Lace doily and tiny blue animal/ceramic figure on top of the TV cabinet.
  box([0.80, 0.42, 0.018], [-3.36, -2.03, 1.43], M.lace, 'tv-top-doily', { rotationZ: -0.04 });
  box([0.26, 0.12, 0.16], [-3.54, -2.06, 1.53], paleBlue, 'tv-top-blue-figurine', { rotationZ: 0.15 });
  addSphere(0.07, [-3.66, -2.06, 1.61], paleBlue, 'tv-top-figurine-head');

  // Stove hearth, ash pan and tools.  This makes the stove feel anchored to the
  // floor rather than floating as a generic cube.
  box([1.58, 1.32, 0.10], [2.05, 0.75, 0.05], M.ceramic, 'stove-hearth', { solid: true });
  box([0.50, 0.16, 0.18], [2.05, 0.26, 0.27], M.metal, 'stove-ash-pan');
  addLine([2.68, 0.24, 0.13], [2.78, 0.24, 1.22], M.metal, 'stove-poker', 0.018);
  addLine([2.81, 0.28, 0.15], [2.64, 0.28, 1.16], M.metalLight, 'stove-tongs-a', 0.015);
  addLine([2.88, 0.28, 0.15], [2.71, 0.28, 1.16], M.metalLight, 'stove-tongs-b', 0.015);

  // Hanging wire/rod and laundry beside the flue: two white cloths and a mustard
  // item are prominent in the original illustration.
  addLine([2.45, 0.52, 1.80], [3.55, 0.52, 1.80], M.metal, 'stove-laundry-rod', 0.018);
  box([0.36, 0.04, 0.58], [2.63, 0.50, 1.52], clothWhite, 'hanging-cloth-white-a', { rotationZ: 0.03 });
  box([0.30, 0.04, 0.48], [3.08, 0.50, 1.56], mustardCloth, 'hanging-cloth-mustard', { rotationZ: -0.04 });
  box([0.40, 0.04, 0.64], [3.44, 0.50, 1.48], clothWhite, 'hanging-cloth-white-b', { rotationZ: 0.02 });

  // Suspended tiny ornament/cup beneath the long horizontal stove pipe.
  addLine([0.02, 0.74, 2.80], [0.02, 0.74, 2.34], M.metal, 'hanging-ornament-string-a', 0.008);
  addLine([0.14, 0.74, 2.80], [0.14, 0.74, 2.34], M.metal, 'hanging-ornament-string-b', 0.008);
  cylinder(0.10, 0.16, [0.08, 0.74, 2.26], paleBlue, 'hanging-ornament-body');
  addTorus(0.09, 0.015, [0.16, 0.74, 2.28], paleBlue, 'hanging-ornament-handle', [Math.PI / 2, 0, 0]);

  // More intentional floor clutter from the drawing: notebook, toy whistle,
  // small car/block pieces, yarn ball, marbles and orange house slippers.
  box([0.42, 0.32, 0.035], [-1.90, -1.43, 0.075], M.ceramic, 'floor-notebook', { rotationZ: -0.28 });
  box([0.27, 0.05, 0.05], [-0.18, -1.12, 0.085], yellow, 'yellow-toy-whistle', { rotationZ: -0.55 });
  cylinder(0.055, 0.18, [-0.04, -1.18, 0.10], yellow, 'yellow-toy-bell');
  box([0.22, 0.11, 0.08], [-1.22, -1.52, 0.09], M.woodLight, 'toy-car-body', { rotationZ: 0.25 });
  for (const dx of [-0.08, 0.08]) for (const dy of [-0.045, 0.045]) addSphere(0.035, [-1.22 + dx, -1.52 + dy, 0.07], black, `toy-car-wheel-${dx}-${dy}`, 10);
  addSphere(0.15, [-1.02, -1.82, 0.16], paleBlue, 'loose-yarn-ball', 14);
  for (let i = 0; i < 8; i++) addSphere(0.025 + (i % 3) * 0.008, [0.18 + i * 0.11, -1.72 + (i % 2) * 0.10, 0.06], [paleBlue, orange, yellow, M.redTextile][i % 4], `floor-marble-${i}`, 10);
  box([0.39, 0.15, 0.08], [1.45, -2.19, 0.095], orange, 'orange-slipper-a', { rotationZ: 0.35 });
  box([0.39, 0.15, 0.08], [1.78, -2.04, 0.095], orange, 'orange-slipper-b', { rotationZ: 0.16 });

  // Right side of doorway: light switch, tall tulip vase, green knitting bag and
  // orange ball/soft toy visible in the foreground of the illustration.
  box([0.14, 0.035, 0.18], [3.94, 2.36, 1.20], M.ceramic, 'wall-light-switch');
  box([0.16, 0.18, 0.48], [3.92, 2.86, 1.62], M.ceramic, 'right-wall-vase');
  for (let i = 0; i < 4; i++) {
    addLine([3.92, 2.83, 1.80], [3.98 + i * 0.06, 2.82, 2.16 + (i % 2) * 0.08], M.leaf, `tulip-stem-${i}`, 0.012);
    addSphere(0.065, [3.98 + i * 0.06, 2.82, 2.18 + (i % 2) * 0.08], M.flower, `tulip-${i}`, 12);
  }
  box([0.54, 0.24, 0.48], [3.45, -2.72, 0.25], M.greenTextile, 'green-knitting-bag', { rotationZ: 0.05 });
  addLine([3.36, -2.72, 0.45], [3.30, -2.72, 1.02], M.woodLight, 'knitting-needle-a', 0.012);
  addLine([3.52, -2.72, 0.45], [3.60, -2.72, 1.00], M.woodLight, 'knitting-needle-b', 0.012);
  addSphere(0.27, [2.78, -2.82, 0.28], orange, 'orange-floor-ball', 18);
  for (let i = 0; i < 5; i++) addTorus(0.05 + i * 0.015, 0.012, [2.78 + (i - 2) * 0.06, -2.58, 0.28 + (i % 2) * 0.06], M.woodDark, `ball-mark-${i}`, [Math.PI / 2, 0, 0]);

  // Rough plaster scars and hairline crack suggestions.  These are shallow so
  // they remain decorative and never become collision geometry.
  const patches = [
    [-3.98, 1.86, 1.46, 0.015, 0.36, 0.22],
    [-3.98, 2.54, 0.94, 0.015, 0.25, 0.12],
    [2.90, 3.125, 2.26, 0.42, 0.015, 0.12],
    [1.85, 3.125, 1.05, 0.31, 0.015, 0.10],
    [-2.95, 3.125, 2.36, 0.28, 0.015, 0.11],
  ];
  patches.forEach((p, i) => {
    const [x, y, z, sx, sy, sz] = p;
    box([sx, sy, sz], [x, y, z], i % 2 ? plasterPatch : plasterPatchDark, `plaster-wear-${i}`, { rotationZ: (i - 2) * 0.06 });
  });

  // Bedroom enrichment.  Keep the visible bed dominant while filling in the
  // plausible continuation behind the doorway with the same household language.
  box([0.54, 0.42, 0.035], [5.18, 2.42, 0.86], M.lace, 'bedside-lace-doily');
  cylinder(0.08, 0.10, [5.04, 2.42, 0.96], M.ceramic, 'bedside-mug');
  addTorus(0.06, 0.014, [5.11, 2.43, 0.98], M.ceramic, 'bedside-mug-handle', [Math.PI / 2, 0, 0]);
  cylinder(0.09, 0.06, [5.31, 2.42, 0.96], paleBlue, 'bedside-alarm-clock');
  box([0.08, 0.10, 0.20], [5.31, 2.42, 1.06], black, 'bedside-clock-face');
  box([0.55, 0.05, 0.70], [7.10, 3.56, 1.72], M.woodDark, 'bedroom-wall-frame');
  box([0.46, 0.035, 0.61], [7.10, 3.53, 1.72], M.ceramic, 'bedroom-wall-picture');
  cylinder(0.18, 0.30, [7.82, 2.75, 1.98], M.ceramic, 'bedroom-plant-pot');
  for (let i = 0; i < 6; i++) addLine([7.82, 2.75, 2.10], [7.58 + i * 0.10, 2.73, 2.52 - (i % 2) * 0.08], M.leaf, `bedroom-plant-stem-${i}`, 0.018);
  // Foot basket and folded bedding seen at the lower-right side of the doorway.
  box([0.78, 0.50, 0.42], [7.48, 0.10, 0.22], M.woodLight, 'bedroom-foot-basket', { solid: true });
  box([0.68, 0.42, 0.12], [7.48, 0.10, 0.48], M.redTextile, 'bedroom-folded-blanket');
  box([0.60, 0.38, 0.10], [7.48, 0.10, 0.58], M.patchwork, 'bedroom-folded-blanket-top');

  // Small shelf beside the bedroom bed with books and a trailing plant.
  box([0.80, 0.22, 0.06], [7.70, 3.18, 2.16], M.woodDark, 'bedroom-high-shelf');
  for (let i = 0; i < 5; i++) box([0.09 + (i % 2) * 0.03, 0.16, 0.28], [7.45 + i * 0.12, 3.05, 2.34], [M.redTextile, M.greenTextile, M.woodLight][i % 3], `bedroom-high-book-${i}`);
  addSphere(0.12, [7.98, 3.06, 2.33], M.leaf, 'bedroom-trailing-plant-root');
  for (let i = 0; i < 7; i++) addSphere(0.055, [8.00 - i * 0.035, 3.03, 2.20 - i * 0.12], M.leaf, `bedroom-trailing-leaf-${i}`, 10);
}
