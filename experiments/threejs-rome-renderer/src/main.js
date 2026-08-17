import { createAdaptiveQualityController } from '../../../frontend/ancient-world/engine/performance.js';
import { createLifecycle } from '../../../frontend/ancient-world/engine/lifecycle.js';
import { createRomeSimulation } from './rome-adapter.js';
import { installRomePocControls } from './runtime-controls.js';
import { buildColosseumHero } from './hero-builders.js';
import { createTerrainColorSampler, ROME_VISUAL_PALETTE } from './visual-palette.js';

const statusEl = document.querySelector('#status');
const metricsEl = document.querySelector('#metrics');
const errorEl = document.querySelector('#error');
const errorTextEl = document.querySelector('#errorText');

function fail(error) {
  console.error('Rome Three.js PoC failed:', error);
  errorTextEl.textContent = error instanceof Error ? error.message : String(error);
  errorEl.classList.remove('hidden');
}

function materialForState(THREE, state, atmospheric = false) {
  const colors = {
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
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true });
}

function buildTerrain(THREE, scene, simulation, mobile) {
  const { bounds } = simulation.manifest;
  const step = mobile ? 46 : 32;
  const cols = Math.ceil((bounds.maxX - bounds.minX) / step) + 1;
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / step) + 1;
  const terrainColorAt = createTerrainColorSampler(THREE);
  const positions = [];
  const colors = [];
  const indices = [];

  for (let row = 0; row < rows; row++) {
    const z = Math.min(bounds.maxZ, bounds.minZ + row * step);
    for (let col = 0; col < cols; col++) {
      const x = Math.min(bounds.maxX, bounds.minX + col * step);
      const y = simulation.terrainHeightAt(x, z);
      positions.push(x, y, z);
      colors.push(...terrainColorAt(x, z, y));
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, terrainMaterial(THREE));
  mesh.name = 'Rome terrain · shared height field';
  scene.add(mesh);
  return mesh;
}

function addTiber(THREE, scene, simulation) {
  const { bounds } = simulation.manifest;
  const depth = bounds.maxZ - bounds.minZ;
  const geometry = new THREE.BoxGeometry(simulation.tiber.halfWidth * 2, 0.22, depth);
  const material = new THREE.MeshStandardMaterial({
    color: 0x4d7881,
    roughness: 0.42,
    metalness: 0.03,
    transparent: true,
    opacity: 0.86,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(simulation.tiber.x, simulation.tiber.waterY - 0.08, (bounds.minZ + bounds.maxZ) / 2);
  mesh.name = 'Tiber';
  scene.add(mesh);
}

function roadSegment(THREE, scene, simulation, a, b, width, material) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const planarLength = Math.hypot(dx, dz) || 1;
  const pieces = Math.max(1, Math.ceil(planarLength / 28));
  const geometry = new THREE.BoxGeometry(1, 1, 1);

  for (let piece = 0; piece < pieces; piece++) {
    const t0 = piece / pieces;
    const t1 = (piece + 1) / pieces;
    const x0 = a[0] + dx * t0;
    const z0 = a[1] + dz * t0;
    const x1 = a[0] + dx * t1;
    const z1 = a[1] + dz * t1;
    const y0 = simulation.terrainHeightAt(x0, z0) + 0.10;
    const y1 = simulation.terrainHeightAt(x1, z1) + 0.10;
    const direction = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
    const length = direction.length() || 1;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize());
    mesh.scale.set(length, 0.10, width);
    scene.add(mesh);
  }
}

function addRoads(THREE, scene, simulation) {
  const material = new THREE.MeshStandardMaterial({ color: 0x665f55, roughness: 1 });
  for (const road of simulation.streets) {
    for (let index = 1; index < road.points.length; index++) {
      roadSegment(THREE, scene, simulation, road.points[index - 1], road.points[index], road.width, material);
    }
  }
}

function addRamp(THREE, scene, x0, y0, z0, x1, y1, z1, width, material) {
  const direction = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
  const length = direction.length() || 1;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2 - 0.04, (z0 + z1) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize());
  mesh.scale.set(length, 0.16, width);
  scene.add(mesh);
}

function addBridge(THREE, scene, simulation, record, material) {
  const ground = simulation.terrainHeightAt(record.x, record.z);
  const deckY = Math.max(ground + 5.2, 4.4);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(record.w, 1.0, record.d), material);
  deck.position.set(record.x, deckY - 0.5, record.z);
  scene.add(deck);

  const approach = 20;
  const leftStart = record.x - record.w / 2 - approach;
  const leftEnd = record.x - record.w / 2;
  const rightStart = record.x + record.w / 2 + approach;
  const rightEnd = record.x + record.w / 2;
  const leftGround = simulation.terrainHeightAt(leftStart, record.z) + 0.06;
  const rightGround = simulation.terrainHeightAt(rightStart, record.z) + 0.06;
  addRamp(THREE, scene, leftStart, leftGround, record.z, leftEnd, deckY, record.z, record.d - 1, material);
  addRamp(THREE, scene, rightStart, rightGround, record.z, rightEnd, deckY, record.z, record.d - 1, material);
}

function addWall(THREE, scene, simulation, record, material) {
  const gates = simulation.buildings.filter((building) => building.type === 'gate');
  const gateNearby = (x, z, padding = 34) => gates.some((gate) => Math.hypot(gate.x - x, gate.z - z) < padding + Math.max(gate.w, gate.d) * 0.5);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const add = (x, z, width, depth) => {
    if (gateNearby(x, z)) return;
    const mesh = new THREE.Mesh(geometry, material);
    const ground = simulation.terrainHeightAt(x, z);
    mesh.position.set(x, ground + record.h / 2, z);
    mesh.scale.set(width, record.h, depth);
    scene.add(mesh);
  };
  for (let i = -record.w / 2; i <= record.w / 2; i += 34) {
    add(record.x + i, record.z - record.d / 2, 32, 6);
    add(record.x + i, record.z + record.d / 2, 32, 6);
  }
  for (let i = -record.d / 2; i <= record.d / 2; i += 34) {
    add(record.x - record.w / 2, record.z + i, 6, 32);
    add(record.x + record.w / 2, record.z + i, 6, 32);
  }
}

function addHeroProxy(THREE, scene, simulation, record, material) {
  const ground = simulation.terrainHeightAt(record.x, record.z);
  const group = new THREE.Group();
  group.position.set(record.x, ground, record.z);
  group.rotation.y = record.rot || 0;
  group.name = record.name;

  if (record.id === 'colosseum') {
    group.add(buildColosseumHero(THREE, record, material));
  } else if (record.id === 'pantheon') {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(record.w * 0.42, record.w * 0.42, record.h * 0.52, 40), material);
    drum.position.y = record.h * 0.26;
    drum.scale.z = record.d / record.w;
    group.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(record.w * 0.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), material);
    dome.position.y = record.h * 0.52;
    dome.scale.z = record.d / record.w;
    group.add(dome);
  } else {
    let geometry;
    if (['round', 'dome', 'round-church', 'mausoleum', 'column'].includes(record.type)) {
      geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, record.type === 'column' ? 16 : 28);
    } else {
      geometry = new THREE.BoxGeometry(1, 1, 1);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = record.h / 2;
    mesh.scale.set(record.w, record.h, record.d);
    group.add(mesh);
  }
  scene.add(group);
}

function addMonuments(THREE, scene, simulation) {
  const cache = new Map();
  const getMaterial = (state) => {
    if (!cache.has(state)) cache.set(state, materialForState(THREE, state));
    return cache.get(state);
  };
  for (const record of simulation.buildings) {
    const material = getMaterial(record.state);
    if (record.type === 'wall') addWall(THREE, scene, simulation, record, material);
    else if (record.type === 'bridge') addBridge(THREE, scene, simulation, record, material);
    else addHeroProxy(THREE, scene, simulation, record, material);
  }
}

function addUrbanFabric(THREE, scene, simulation) {
  const count = simulation.urbanFabric.length;
  const wallGeometry = new THREE.BoxGeometry(1, 1, 1);
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
  });
  const walls = new THREE.InstancedMesh(wallGeometry, wallMaterial, count);
  walls.name = 'Plausible urban fabric walls';

  const roofGeometry = new THREE.ConeGeometry(0.72, 1, 4, 1, false);
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: ROME_VISUAL_PALETTE.roofs,
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
  const wallColors = ROME_VISUAL_PALETTE.urbanWalls;

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

function updateMovement(simulation, keys, dt) {
  let forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  let right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  if (!forward && !right) return;
  const length = Math.hypot(forward, right);
  if (length > 1) {
    forward /= length;
    right /= length;
  }
  const { player } = simulation;
  const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? player.sprint : player.speed;
  const sy = Math.sin(player.yaw);
  const cy = Math.cos(player.yaw);
  simulation.traversal.moveWithSubsteps(
    (sy * forward + cy * right) * speed * dt,
    (-cy * forward + sy * right) * speed * dt,
  );
}

async function bootstrap() {
  const THREE = await import('../vendor/three.module.js');
  const mobile = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
  const simulation = createRomeSimulation({ mobile });
  const quality = createAdaptiveQualityController({
    mobile,
    highPixelRatio: simulation.manifest.performance.maxPixelRatioDesktop,
    balancedPixelRatio: mobile ? simulation.manifest.performance.maxPixelRatioMobile : 1.30,
    lowPixelRatio: mobile ? 0.85 : 1.0,
  });
  const lifecycle = createLifecycle();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.10;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(ROME_VISUAL_PALETTE.sky);
  scene.fog = new THREE.FogExp2(ROME_VISUAL_PALETTE.fog, mobile ? 0.00096 : 0.00072);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.08, 2600);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight(0xd4cdb7, 0x3b3128, 2.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdda0, 3.85);
  sun.position.set(310, 590, 240);
  scene.add(sun);

  buildTerrain(THREE, scene, simulation, mobile);
  addTiber(THREE, scene, simulation);
  addRoads(THREE, scene, simulation);
  addMonuments(THREE, scene, simulation);
  addUrbanFabric(THREE, scene, simulation);

  const controls = installRomePocControls({ lifecycle, renderer, simulation, mobile });
  const { keys } = controls;
  let last = performance.now();
  let lastMetrics = 0;
  let currentWidth = 0;
  let currentHeight = 0;
  let currentDpr = -1;

  lifecycle.addCleanup(() => {
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
    const geometries = new Set();
    const materials = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const material = object.material;
      if (Array.isArray(material)) material.forEach((item) => item && materials.add(item));
      else if (material) materials.add(material);
    });
    geometries.forEach((geometry) => geometry.dispose?.());
    materials.forEach((material) => material.dispose?.());
    renderer.dispose();
    renderer.forceContextLoss?.();
    renderer.domElement.remove();
  });
  lifecycle.listen(window, 'pagehide', () => lifecycle.destroy(), { once: true });

  function resize() {
    const cap = quality.pixelRatioCap();
    const dpr = Math.min(devicePixelRatio || 1, cap);
    const width = Math.max(1, innerWidth);
    const height = Math.max(1, innerHeight);
    if (width === currentWidth && height === currentHeight && dpr === currentDpr) return;
    currentWidth = width;
    currentHeight = height;
    currentDpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last || 16) / 1000);
    last = now;
    quality.sample(dt);
    resize();
    updateMovement(simulation, keys, dt);

    const targetY = simulation.player.floorY + 1.68;
    simulation.player.y += (targetY - simulation.player.y) * (1 - Math.exp(-dt * 20));
    camera.position.set(simulation.player.x, simulation.player.y, simulation.player.z);
    camera.rotation.set(simulation.player.pitch, simulation.player.yaw, 0);
    renderer.render(scene, camera);

    if (now - lastMetrics > 500) {
      lastMetrics = now;
      const q = quality.snapshot();
      statusEl.textContent = `${simulation.player.surfaceTag} · x ${simulation.player.x.toFixed(1)} · z ${simulation.player.z.toFixed(1)} · floor ${simulation.player.floorY.toFixed(1)} m`;
      metricsEl.textContent = `${q.tier} quality · DPR cap ${q.pixelRatioCap.toFixed(2)} · ${renderer.info.render.triangles.toLocaleString()} triangles · ${renderer.info.render.calls} calls`;
    }
    lifecycle.frame(frame);
  }

  window.__ROME_THREE_POC__ = {
    THREE,
    renderer,
    scene,
    camera,
    simulation,
    quality,
    controls,
    lifecycle,
    contract: simulation.manifest,
    destroy: () => lifecycle.destroy(),
  };

  statusEl.textContent = `Shared contract v${simulation.manifest.contractVersion} loaded · ${simulation.buildings.length} named records · ${simulation.urbanFabric.length} inferred blocks`;
  resize();
  lifecycle.frame(frame);
}

bootstrap().catch(fail);
