/**
 * main.js — Rome AD 410–476 Orchestration & Render Loop
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
  buildAmphoraCluster,
  buildMarketStall,
  buildBrazier,
  buildStatueMonument,
  buildInscribedStele,
  buildStoneBench,
  buildRomanFountain,
  buildWoodenCart,
  buildUmbrellaPine,
  buildSacrificialAltar,
  buildMerchantVessel,
  buildSundialMonument
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

  setProgress(10, 'Starting Late Antique Rome...');

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
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 2. Scene & Camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.3, 3500);
  camera.position.set(SPAWN.x, PLAYER_HEIGHT, SPAWN.z);
  clock = new THREE.Clock();

  setProgress(20, 'Shaping the Tiber valley and terrain...');

  // 3. Ground plane
  const groundGeo = new THREE.PlaneGeometry(
    BOUNDS.maxX - BOUNDS.minX + 300,
    BOUNDS.maxZ - BOUNDS.minZ + 300,
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

  setProgress(35, 'Laying the principal Roman roads...');

  // 4. Roman Roads (Via Sacra, Via Appia, Via Flaminia...)
  buildRomanStreets();

  setProgress(50, 'Building the Colosseum, Pantheon and basilicas...');

  // 5. Named Monuments
  buildAllMonuments();

  setProgress(65, 'Connecting the Tiber and aqueduct landscape...');

  // 6. Waters (Tiber River)
  waterSystem = new WaterSystem(scene);
  waterSystem.buildFromData(WATERS);

  setProgress(75, 'Building the Aurelian Walls and Subura fabric...');

  // 7. Urban Insulae Fabric
  buildUrbanInsulae();

  setProgress(85, 'Planting Mediterranean vegetation and umbrella pines...');

  // 8. Vegetation
  vegetation = new VegetationSystem(scene);
  vegetation.populateCity(REGIONS, BUILDINGS, STREETS);

  // 9. Environment (Sky, Dusk Atmosphere, Torches)
  environment = new Environment(scene, renderer, { startTime: 0.68, cycleSpeed: 0.005 }); // Late afternoon Roman golden hour

  // 10. Particles & Audio
  particles = new ParticleSystem(scene);
  audio = new AudioSystem();

  // 11. Physics & Collision
  collision = new CollisionSystem();
  collision.buildFromData(BUILDINGS, STREETS, BOUNDS);

  setProgress(88, 'Adding fountains, market stalls and amphorae...');

  // 11b. Street dressing & Props
  populateRomeDressing();

  // 12. Controls
  controls = new Controls(camera, canvas, document.body);

  // 13. UI & Guided Tour
  ui = new UISystem(
    { CITY, SOURCES, REGIONS, BUILDINGS, TELEPORTS, BOUNDS, WATERS },
    camera,
    collision
  );
  ui.initMinimap();

  tour = new TourSystem(TOUR_STOPS, controls, ui);

  // 14. Cinematic Intro (High Colosseum view down to Forum)
  intro = new IntroSequence(camera, scene, controls, {
    heading:  CITY.title,
    subtitle: 'Late Antique Capital · Sack, Survival, Transformation',
  });
  intro.curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(52, 220, -65),    // Over Colosseum
    new THREE.Vector3(-60, 110, 35),    // Over Basilica of Maxentius
    new THREE.Vector3(-185, 45, -65),   // Forum Romanum
    new THREE.Vector3(-365, 30, 120),   // Pantheon rotunda
    new THREE.Vector3(SPAWN.x, 1.7, SPAWN.z), // Touchdown at Via Flaminia
  ]);
  intro.lookAtCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(52, 20, -65),
    new THREE.Vector3(-185, 10, -65),
    new THREE.Vector3(-365, 20, 120),
    new THREE.Vector3(-350, 5, 200),
    new THREE.Vector3(-350, 1.7, 300),
  ]);

  intro.onComplete = () => {
    controls.enable();
    audio.init();
    isRunning = true;
  };

  bindEvents();
  installWorldDebugHandle();
  setProgress(100, 'Rome ready!');

  // Show intro modal
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

function buildRomanStreets() {
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

function buildUrbanInsulae() {
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const globalCap = isMobile ? 260 : 650;
  const cell = isMobile ? 28 : 20;
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
    const style = DISTRICT_STYLES[r.id] || { density: 0.5, heightRange: [6, 12], shopRatio: 0.4 };
    const minX = r.x - r.w / 2 + cell * 0.5;
    const maxX = r.x + r.w / 2 - cell * 0.5;
    const minZ = r.z - r.d / 2 + cell * 0.5;
    const maxZ = r.z + r.d / 2 - cell * 0.5;

    for (let z = minZ; z <= maxZ && placed < globalCap; z += cell) {
      for (let x = minX; x <= maxX && placed < globalCap; x += cell) {
        const seed = `rome:${r.id}:${Math.round(x)}:${Math.round(z)}`;
        if (hash(seed) > style.density) continue;

        // Proximity check against named monuments
        const overlaps = BUILDINGS.some(b => {
          const dx = Math.abs(x - b.x);
          const dz = Math.abs(z - b.z);
          return dx < (b.w / 2 + 10) && dz < (b.d / 2 + 10);
        });
        if (overlaps) continue;

        const w = 12 + hash(`${seed}:w`) * 10;
        const d = 10 + hash(`${seed}:d`) * 8;
        const h = style.heightRange[0] + hash(`${seed}:h`) * (style.heightRange[1] - style.heightRange[0]);

        const insula = {
          id: `insula-${placed}`,
          type: 'insula',
          x, z, w, d, h,
          evidence: { level: 'plausible' }
        };

        try {
          const g = buildStructure(insula);
          if (g) {
            g.position.set(x, 0, z);
            scene.add(g);
            collision.grid.insert({ type: 'rect', id: insula.id, x, z, w, d, h, y: 0 });
          }
        } catch (e) {}

        placed++;
      }
    }
  }
}

/* ── Populate Rome Street Dressing & Imperial Props ───────── */

function populateRomeDressing() {
  const dressingGroup = new THREE.Group();
  dressingGroup.name = 'rome-street-dressing';

  // 1. Roman Nymphaeum Stone Fountains in Public Plazas
  dressingGroup.add(buildRomanFountain(-65, 45, 0));  // Forum Romanum center
  dressingGroup.add(buildRomanFountain(-120, -180, Math.PI / 4)); // Campus Martius
  dressingGroup.add(buildRomanFountain(-40, -85, 0));  // Near Pantheon

  // 2. Market Stalls in Subura & Forum Boarium
  const stalls = [
    { x: 45, z: 80, rot: 0.2, color: 0x9e3824 },
    { x: 55, z: 80, rot: -0.1, color: 0xb8860b },
    { x: 65, z: 80, rot: 0.15, color: 0x4a7c59 },
    { x: -140, z: -110, rot: Math.PI + 0.1, color: 0x8b3a3a },
    { x: -150, z: -110, rot: Math.PI - 0.05, color: 0x2e6b9e },
  ];
  for (const s of stalls) {
    dressingGroup.add(buildMarketStall(s.x, s.z, s.rot, s.color));
    collision.grid.insert({ type: 'rect', id: `rome-stall-${s.x}-${s.z}`, x: s.x, z: s.z, w: 2.8, d: 2.2, h: 2.6 });
  }

  // 3. Amphora Clusters along Tiber River wharves
  dressingGroup.add(buildAmphoraCluster(-180, -220, 8, 0.4));
  dressingGroup.add(buildAmphoraCluster(-210, -260, 6, -0.3));
  dressingGroup.add(buildAmphoraCluster(-75, 60, 5, 0)); // Forum tabernae

  // 4. Braziers at Colosseum & Triumphal Arches
  const braziers = [
    { x: 42, z: -55 },  // Colosseum north arch
    { x: 62, z: -55 },
    { x: 42, z: -75 },  // Colosseum south arch
    { x: 62, z: -75 },
    { x: 15, z: -40 },  // Arch of Constantine
    { x: -80, z: 75 },  // Arch of Septimius Severus
  ];
  for (const b of braziers) {
    dressingGroup.add(buildBrazier(b.x, b.z, 1.4));
  }

  // 5. Imperial Statues on plinths in the Forum & Capitolium
  dressingGroup.add(buildStatueMonument(-80, 20, 0, false));
  dressingGroup.add(buildStatueMonument(-50, 60, Math.PI * 0.5, false));
  dressingGroup.add(buildStatueMonument(5, -35, -Math.PI * 0.25, false));

  // 6. Marble Inscribed Columns & Milestones
  dressingGroup.add(buildInscribedStele(-85, 35, 0.2, 'Miliarium Aureum'));
  dressingGroup.add(buildInscribedStele(-60, 25, -0.1, 'Lapis Niger'));

  // 7. Stone Benches along Via Sacra
  const benches = [
    { x: -30, z: -10, rot: 0.3 },
    { x: -10, z: -25, rot: 0.3 },
    { x: 10, z: -40, rot: 0.3 },
    { x: 30, z: -55, rot: 0.3 },
  ];
  for (const b of benches) {
    dressingGroup.add(buildStoneBench(b.x, b.z, b.rot));
  }

  // 8. Two-wheeled Merchant Carts along Via Flaminia
  dressingGroup.add(buildWoodenCart(-340, 480, 0.2));
  dressingGroup.add(buildWoodenCart(-360, 510, -0.4));

  // 9. Italian Stone Pines (Pinus Pinea)
  dressingGroup.add(buildUmbrellaPine(-20, 110, 20));
  dressingGroup.add(buildUmbrellaPine(20, 130, 22));
  dressingGroup.add(buildUmbrellaPine(90, -40, 19));
  dressingGroup.add(buildUmbrellaPine(-110, -60, 18));

  // 10. Great Altars in the Forum Romanum (Altar of Saturn & Temple of Concord)
  dressingGroup.add(buildSacrificialAltar(-85, 18, 0.15));
  collision.grid.insert({ type: 'rect', id: 'saturn-altar', x: -85, z: 18, w: 3.6, d: 2.4, h: 2.2 });

  // 11. Solarium Augusti / Horologium Sundial in Campus Martius
  dressingGroup.add(buildSundialMonument(-150, 140));

  // 12. Roman Merchant Vessels (Navis Oneraria) on the Tiber River
  dressingGroup.add(buildMerchantVessel(-205, -240, 0.22));
  dressingGroup.add(buildMerchantVessel(-170, -185, -0.18));

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
    id: 'rome',
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
  const hit = collision.raycast(camera.position, dir, 70);
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

init().catch(err => console.error('Rome init failed:', err));
