/**
 * main.js — Aizanoi AD 225 Orchestration & Render Loop
 * Shared Asset Engine Rebuild · Aizanoi Analytics unified worlds runtime
 */

import * as THREE from '../../shared/vendor/three.module.js';

import {
  CITY, SOURCES, REGIONS, STREETS, BUILDINGS, WATERS,
  TELEPORTS, SPAWN, BOUNDS, TOUR_STOPS, DISTRICT_STYLES,
} from './city-data.js';

import { getMaterial, getEvidenceMaterial } from '../../shared/assets/materials.js';
import { buildStructure } from './builders.js';
import { Environment } from '../../shared/engine/environment.js';
import { WaterSystem } from '../../shared/engine/water.js';
import { VegetationSystem } from '../../shared/engine/vegetation.js';
import { ParticleSystem } from '../../shared/engine/particles.js';
import { CollisionSystem, PLAYER_HEIGHT } from '../../shared/engine/collision.js';
import { Controls, inputState } from '../../shared/engine/controls.js';
import { AudioSystem } from '../../shared/engine/audio.js';
import { UISystem } from '../../shared/engine/ui.js';
import { TourSystem } from '../../shared/engine/tour.js';
import { IntroSequence } from '../../shared/engine/intro.js';
import {
  buildMarketStall,
  buildAmphoraCluster,
  buildBrazier,
  buildStatueMonument,
  buildInscribedStele,
  buildStoneBench,
  buildRomanFountain,
  buildWoodenCart,
  buildSacrificialAltar,
  buildMerchantVessel,
  buildSundialMonument,
} from '../../shared/assets/props.js';

let renderer, scene, camera, clock;
let environment, waterSystem, vegetation, particles;
let collision, controls, audio, ui, tour, intro;
let buildingGroups = new Map();
let isRunning = false;

async function init() {
  const loadingEl = document.getElementById('loading-screen');
  const loadingProgress = document.getElementById('loading-progress');
  const loadingText = document.querySelector('.loading-title');

  function setProgress(pct, msg) {
    if (loadingProgress) loadingProgress.style.width = `${pct}%`;
    if (loadingText) loadingText.textContent = msg;
  }

  setProgress(10, 'Starting Aizanoi...');

  // 1. Renderer
  const canvas = document.getElementById('viewport');
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    logarithmicDepthBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 2. Scene & Camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.3, 3000);
  camera.position.set(SPAWN.x, PLAYER_HEIGHT, SPAWN.z);
  clock = new THREE.Clock();

  setProgress(20, 'Shaping the Penkalas valley...');

  // 3. Ground plane
  const groundGeo = new THREE.PlaneGeometry(
    BOUNDS.maxX - BOUNDS.minX + 200,
    BOUNDS.maxZ - BOUNDS.minZ + 200,
    64, 64
  );
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(
    (BOUNDS.minX + BOUNDS.maxX) / 2,
    0,
    (BOUNDS.minZ + BOUNDS.maxZ) / 2
  );
  const groundMesh = new THREE.Mesh(groundGeo, getMaterial('ground'));
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  setProgress(35, 'Laying Roman roads and riverfront paths...');

  // 4. Roads
  buildStreets();

  setProgress(50, 'Building the Temple of Zeus, Macellum and theatre–stadium...');

  // 5. Monuments
  buildAllMonuments();

  setProgress(65, 'Connecting the Penkalas river and Roman bridges...');

  // 6. Water System
  waterSystem = new WaterSystem(scene);
  waterSystem.buildFromData(WATERS);

  setProgress(75, 'Generating residential fabric and Phrygian streets...');

  // 7. Urban Infill
  buildUrbanFabric();

  setProgress(85, 'Planting olive groves and river vegetation...');

  // 8. Vegetation
  vegetation = new VegetationSystem(scene);
  vegetation.populateCity(REGIONS, BUILDINGS, STREETS);

  // 9. Environment
  environment = new Environment(scene, renderer, { startTime: 0.45, cycleSpeed: 0.005 });

  // 10. Particles & Audio
  particles = new ParticleSystem(scene);
  audio = new AudioSystem();

  // 11. Collision
  collision = new CollisionSystem();
  collision.buildFromData(BUILDINGS, STREETS, BOUNDS);

  // 12. Street Dressing & Cultural Props
  populateAizanoiDressing();

  // 13. Controls
  controls = new Controls(camera, canvas, document.body);

  // 14. UI & Tour
  ui = new UISystem(
    { CITY, SOURCES, REGIONS, BUILDINGS, TELEPORTS, BOUNDS, WATERS },
    camera,
    collision
  );
  ui.initMinimap();

  tour = new TourSystem(TOUR_STOPS, controls, ui);

  // 15. Cinematic Intro
  intro = new IntroSequence(camera, scene, controls);
  intro.curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-160, 180, 20),   // High above Temple of Zeus
    new THREE.Vector3(-65, 80, -35),    // Agora & Propylon
    new THREE.Vector3(112, 35, -160),   // Hadrianic Bridge II over Penkalas
    new THREE.Vector3(60, 20, -300),    // Over Macellum round market
    new THREE.Vector3(SPAWN.x, 1.7, SPAWN.z), // Touchdown facing Zeus Temple
  ]);
  intro.lookAtCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-160, 10, 20),
    new THREE.Vector3(-65, 5, -35),
    new THREE.Vector3(125, 0, 0),
    new THREE.Vector3(60, 5, -300),
    new THREE.Vector3(-160, 10, 20),
  ]);

  intro.onComplete = () => {
    controls.enable();
    audio.init();
    isRunning = true;
  };

  bindEvents();
  installWorldDebugHandle();
  setProgress(100, 'Aizanoi ready!');

  const introModal = document.getElementById('intro-modal');
  if (introModal) introModal.classList.remove('hidden');
  if (loadingEl) {
    setTimeout(() => {
      loadingEl.classList.add('fade-out');
      setTimeout(() => { loadingEl.style.display = 'none'; }, 600);
    }, 300);
  }

  renderer.setAnimationLoop(render);
}

function buildStreets() {
  const roadMat = getMaterial('road');
  for (const street of STREETS) {
    const pts = street.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const dx = p1[0] - p0[0];
      const dz = p1[1] - p0[1];
      const len = Math.sqrt(dx * dx + dz * dz);

      const geo = new THREE.PlaneGeometry(len, street.width);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, roadMat);
      mesh.receiveShadow = true;
      mesh.position.set((p0[0] + p1[0]) / 2, 0.02, (p0[1] + p1[1]) / 2);
      mesh.rotation.y = -Math.atan2(dz, dx);
      scene.add(mesh);
    }
  }
}

function buildAllMonuments() {
  for (const b of BUILDINGS) {
    try {
      const group = buildStructure(b);
      if (group) {
        group.position.set(b.x, b.y || 0, b.z);
        if (b.rot) group.rotation.y = b.rot;
        scene.add(group);
        buildingGroups.set(b.id, group);
      }
    } catch (e) {
      console.warn(`Failed to build ${b.id}:`, e);
    }
  }
}

function buildUrbanFabric() {
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const globalCap = isMobile ? 220 : 500;
  const cell = isMobile ? 26 : 18;
  let placed = 0;

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return ((h & 0x7fffffff) % 10000) / 10000;
  }

  for (const r of REGIONS) {
    if (placed >= globalCap) break;
    const style = DISTRICT_STYLES[r.id] || { density: 0.5, heightRange: [5, 10], shopRatio: 0.3 };
    const minX = r.x - r.w / 2 + cell * 0.5;
    const maxX = r.x + r.w / 2 - cell * 0.5;
    const minZ = r.z - r.d / 2 + cell * 0.5;
    const maxZ = r.z + r.d / 2 - cell * 0.5;

    for (let z = minZ; z <= maxZ && placed < globalCap; z += cell) {
      for (let x = minX; x <= maxX && placed < globalCap; x += cell) {
        const seed = `aizanoi:${r.id}:${Math.round(x)}:${Math.round(z)}`;
        if (hash(seed) > style.density) continue;

        const overlaps = BUILDINGS.some(b => {
          const dx = Math.abs(x - b.x);
          const dz = Math.abs(z - b.z);
          return dx < (b.w / 2 + 8) && dz < (b.d / 2 + 8);
        });
        if (overlaps) continue;

        const w = 10 + hash(`${seed}:w`) * 8;
        const d = 8 + hash(`${seed}:d`) * 8;
        const h = style.heightRange[0] + hash(`${seed}:h`) * (style.heightRange[1] - style.heightRange[0]);

        const fabric = {
          id: `fabric-${placed}`,
          type: 'insula',
          x, z, w, d, h,
          evidence: { level: 'plausible' }
        };

        try {
          const g = buildStructure(fabric);
          if (g) {
            g.position.set(x, 0, z);
            scene.add(g);
            collision.grid.insert({ type: 'rect', id: fabric.id, x, z, w, d, h, y: 0 });
          }
        } catch (e) {}

        placed++;
      }
    }
  }
}

/* ── Street Dressing & Cultural Props for Aizanoi ─────────── */

function populateAizanoiDressing() {
  const dressingGroup = new THREE.Group();
  dressingGroup.name = 'aizanoi-dressing';

  // 1. Temple of Zeus Sanctuary Props
  // Monumental Sacrificial Altar directly in front of the temple
  dressingGroup.add(buildSacrificialAltar(-160, 48, 0));
  collision.grid.insert({ type: 'rect', id: 'zeus-altar', x: -160, z: 48, w: 3.6, d: 2.4, h: 2.2 });

  // Bronze Tripod Braziers along the temple approach and podium corners
  const braziers = [
    { x: -188, z: 20 },
    { x: -132, z: 20 },
    { x: -160, z: -3 },
    { x: -175, z: 42 },
    { x: -145, z: 42 },
    { x: -65, z: 10 },  // Propylon
    { x: 50, z: -270 }, // Macellum gate
    { x: 70, z: -270 },
  ];
  for (const b of braziers) {
    dressingGroup.add(buildBrazier(b.x, b.z, 1.4));
  }

  // Statues of Zeus and Roman Emperors on marble pedestals
  dressingGroup.add(buildStatueMonument(-160, 58, 0, false)); // Imperial statue facing entrance
  dressingGroup.add(buildStatueMonument(-140, 20, Math.PI * 0.5, false));
  dressingGroup.add(buildStatueMonument(-65, -10, 0, true)); // Cult statue near Propylon

  // Carved marble sundial in the sanctuary temenos
  dressingGroup.add(buildSundialMonument(-142, 38));

  // Stone benches in the temenos courtyard
  const benches = [
    { x: -180, z: 40, rot: 0 },
    { x: -140, z: 40, rot: 0 },
    { x: -80, z: -25, rot: 0.3 },
    { x: -50, z: -25, rot: -0.3 },
  ];
  for (const b of benches) {
    dressingGroup.add(buildStoneBench(b.x, b.z, b.rot));
  }

  // 2. Agora & Propylon Marketplace
  // Central Roman nymphaeum fountain
  dressingGroup.add(buildRomanFountain(-65, -45, 4.2));

  // Agora Market Stalls
  const agoraStalls = [
    { x: -85, z: -45, rot: 0.1, color: 0x9e3824 },
    { x: -85, z: -35, rot: -0.05, color: 0xb8860b },
    { x: -45, z: -45, rot: Math.PI + 0.1, color: 0x4a7c59 },
    { x: -45, z: -35, rot: Math.PI - 0.05, color: 0x8b3a3a },
  ];
  for (const s of agoraStalls) {
    dressingGroup.add(buildMarketStall(s.x, s.z, s.rot, s.color));
    collision.grid.insert({ type: 'rect', id: `aizanoi-stall-${s.x}-${s.z}`, x: s.x, z: s.z, w: 2.8, d: 2.2, h: 2.6 });
  }

  // Amphora clusters in Agora
  dressingGroup.add(buildAmphoraCluster(-90, -55, 6, 0.3));
  dressingGroup.add(buildAmphoraCluster(-40, -55, 5, -0.2));

  // 3. Macellum (World's Earliest Stock/Commodity Exchange)
  // Diocletian Price Edict stelae in Greek & Latin
  dressingGroup.add(buildInscribedStele(60, -272, 0, 'Edictum de Pretiis'));
  dressingGroup.add(buildInscribedStele(48, -285, 0.4, 'Macellum Lex'));

  // Market stalls inside and around the circular Macellum
  const macellumStalls = [
    { x: 50, z: -315, rot: 0.3, color: 0xc45c38 },
    { x: 70, z: -315, rot: -0.3, color: 0xd2a842 },
    { x: 42, z: -300, rot: Math.PI * 0.5, color: 0x4a7c59 },
    { x: 78, z: -300, rot: -Math.PI * 0.5, color: 0x2e6b9e },
  ];
  for (const s of macellumStalls) {
    dressingGroup.add(buildMarketStall(s.x, s.z, s.rot, s.color));
    collision.grid.insert({ type: 'rect', id: `mac-stall-${s.x}-${s.z}`, x: s.x, z: s.z, w: 2.8, d: 2.2, h: 2.6 });
  }

  // Food amphora clusters and merchant carts at Macellum
  dressingGroup.add(buildAmphoraCluster(45, -310, 7, 0.5));
  dressingGroup.add(buildAmphoraCluster(75, -310, 6, -0.4));
  dressingGroup.add(buildWoodenCart(58, -255, 0.15));
  dressingGroup.add(buildWoodenCart(35, -280, -0.4));

  // 4. Penkalas River Quays & Bridges
  // Classical Merchant Cargo Vessels moored along the Penkalas river
  dressingGroup.add(buildMerchantVessel(112, -185, 0.08)); // Moored near Bridge II
  dressingGroup.add(buildMerchantVessel(132, 45, -0.12));  // Moored near Bridge III

  // River cargo amphora clusters stacked along the quays
  dressingGroup.add(buildAmphoraCluster(98, -145, 8, 0.2));
  dressingGroup.add(buildAmphoraCluster(126, -145, 6, -0.3));
  dressingGroup.add(buildAmphoraCluster(118, 85, 8, 0.1));
  dressingGroup.add(buildWoodenCart(95, -170, 0.3));

  // 5. Colonnaded Street Furnishings
  dressingGroup.add(buildInscribedStele(-65, -380, 0, 'Miliarium Aizanorum'));
  dressingGroup.add(buildStatueMonument(-65, -450, 0, false));
  dressingGroup.add(buildStatueMonument(-65, -620, Math.PI, false));
  dressingGroup.add(buildStoneBench(-55, -420, 0));
  dressingGroup.add(buildStoneBench(-75, -420, 0));
  dressingGroup.add(buildStoneBench(-55, -580, 0));
  dressingGroup.add(buildStoneBench(-75, -580, 0));

  scene.add(dressingGroup);
}

function bindEvents() {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const enterBtn = document.getElementById('btn-enter');
  if (enterBtn) {
    enterBtn.addEventListener('click', () => {
      const introModal = document.getElementById('intro-modal');
      if (introModal) {
        introModal.classList.add('fade-out');
        setTimeout(() => { introModal.style.display = 'none'; }, 600);
      }
      intro.start();
      audio.init();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && intro && !intro.isComplete) {
      intro.skipIntro();
    }
  });

  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };

  bind('btn-teleport', () => ui.toggleTeleportMenu());
  bind('btn-inspect', () => inspectLookedAt());
  bind('btn-map', () => ui.toggleMinimap());
  bind('btn-mobile-map', () => ui.toggleMinimap());
  bind('btn-audio', () => {
    if (audio) audio.muted ? audio.unmute() : audio.mute();
  });
  bind('btn-evidence', () => {
    ui.toggleEvidence();
    applyEvidenceMode(ui.evidenceActive);
  });
  bind('btn-sources', () => ui.showSourcesModal());
  bind('btn-daynight', () => environment.toggleCycle());
  bind('btn-tour', () => {
    if (tour.isActive) tour.stop();
    else tour.start();
  });

  ui.onTeleport = (teleportId) => {
    const building = BUILDINGS.find(b => b.id === teleportId);
    if (!building) return;
    const safe = collision.findSafeSpawn(building.x, building.z);
    const angle = Math.atan2(building.x - safe.x, building.z - safe.z);
    controls.teleportTo(safe.x, safe.z, angle);
    ui.hideTeleportMenu();
  };
}

function installWorldDebugHandle() {
  window.__WORLD_DEBUG__ = {
    id: 'aizanoi',
    get ready() { return Boolean(renderer && camera && controls && collision && ui); },
    get player() {
      if (!camera) return null;
      return { x: camera.position.x, y: camera.position.y, z: camera.position.z, controlsEnabled: Boolean(controls?.enabled) };
    },
    get evidenceActive() { return Boolean(ui?.evidenceActive); },
    start() {
      if (!controls || !collision) return false;
      intro?.skipIntro();
      controls.enable();
      isRunning = true;
      return true;
    },
    step(dt = 1 / 60) {
      if (!controls?.enabled || !collision) return false;
      const delta = Math.max(0, Math.min(Number(dt) || 0, 0.5));
      controls.update(delta);
      const moveVec = controls.getMovementVector(delta);
      collision.moveAndSlide(camera.position, moveVec, delta);
      return true;
    },
    teleport(id) {
      if (!ui?.onTeleport || !BUILDINGS.some((building) => building.id === id)) return false;
      ui.onTeleport(id);
      return true;
    },
    toggleEvidence() {
      if (!ui) return false;
      ui.toggleEvidence();
      applyEvidenceMode(ui.evidenceActive);
      return ui.evidenceActive;
    },
  };
  document.documentElement.dataset.worldReady = 'true';
}

function applyEvidenceMode(active) {
  for (const [id, group] of buildingGroups) {
    const b = BUILDINGS.find(item => item.id === id);
    if (!b) continue;

    group.traverse(child => {
      if (child.isMesh) {
        if (active && b.evidence) {
          child._orig = child._orig || child.material;
          child.material = getEvidenceMaterial(b.evidence.level);
        } else if (child._orig) {
          child.material = child._orig;
          delete child._orig;
        }
      }
    });
  }
}

function inspectLookedAt() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const hit = collision.raycast(camera.position, dir, 60);
  if (hit) {
    const b = BUILDINGS.find(item => item.id === hit.id);
    if (b) ui.showInfoCard(b, SOURCES);
  }
}

function render() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (intro && !intro.isComplete) {
    intro.update(dt);
    environment.update(dt, camera.position);
    waterSystem.update(dt);
    particles.update(dt, camera.position, environment.isNight);
    renderer.render(scene, camera);
    return;
  }

  controls.update(dt);

  if (tour.isActive) tour.update(dt);

  if (controls.enabled && !tour._isFlying) {
    const moveVec = controls.getMovementVector(dt);
    collision.moveAndSlide(camera.position, moveVec, dt);
    const jump = controls.getJumpImpulse();
    if (jump > 0) collision.jump(jump);
  }

  environment.update(dt, camera.position);
  waterSystem.update(
    dt,
    environment.skyUniforms.uSunDir.value,
    environment.skyUniforms.uSkyTop.value
  );
  particles.update(dt, camera.position, environment.isNight);

  const isMoving = Math.abs(inputState.forward) > 0.1 || Math.abs(inputState.strafe) > 0.1;
  audio.update(dt, camera.position, environment.isNight, isMoving, inputState.run);

  const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  ui.updateMinimap(camera.position.x, camera.position.z, euler.y);
  ui.updatePlaceName(camera.position.x, camera.position.z);
  ui.updateCompass(euler.y);

  if (inputState.interact) {
    inputState.interact = false;
    inspectLookedAt();
  }

  renderer.render(scene, camera);
}

init().catch(err => console.error('Aizanoi init failed:', err));
