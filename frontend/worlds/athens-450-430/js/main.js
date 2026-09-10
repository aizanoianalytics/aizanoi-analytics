/**
 * main.js — Scene Orchestration & Render Loop
 * Athens 450-430 BCE · AAA Rebuild
 *
 * Entry point that initializes all systems and runs the main loop.
 */

import * as THREE from '../../shared/vendor/three.module.js';

/* ── Module imports ───────────────────────────────────────── */

import {
  CITY, SOURCES, REGIONS, STREETS, BUILDINGS, WATERS,
  TELEPORTS, SPAWN, BOUNDS, TOUR_STOPS, DISTRICT_STYLES,
} from './city-data.js';

import { getMaterial, getEvidenceMaterial } from '../../shared/assets/materials.js';
import { buildStructure } from './builders.js';
import { Environment } from '../../shared/engine/environment.js';
import { WaterSystem, buildWaterSamplePoints } from '../../shared/engine/water.js';
import { VegetationSystem } from '../../shared/engine/vegetation.js';
import { ParticleSystem } from '../../shared/engine/particles.js';
import { CollisionSystem, PLAYER_HEIGHT } from '../../shared/engine/collision.js';
import { Controls, inputState } from '../../shared/engine/controls.js';
import { AudioSystem } from '../../shared/engine/audio.js';
import { UISystem } from '../../shared/engine/ui.js';
import { TourSystem } from '../../shared/engine/tour.js';
import { IntroSequence } from '../../shared/engine/intro.js';
import { GameLoop, PoseBlender, FrameMetrics, SIM_DT } from '../../shared/engine/loop.js';
import { showFatalInitError, installLoadingWatchdog } from '../../shared/engine/loading-safety.js';
import { installContextLossGuard } from '../../shared/engine/gl-recovery.js';
import { DeviceProfile, AdaptiveResolution } from '../../shared/engine/quality.js';
import {
  buildAmphoraCluster,
  buildMarketStall,
  buildBrazier,
  buildStatueMonument,
  buildInscribedStele,
  buildStoneBench,
  buildWoodenCart,
  buildSacrificialAltar,
  buildMerchantVessel,
  buildSundialMonument,
  buildRiverReeds,
  buildCargoSkiff,
  buildWoodenFootbridge,
  buildBirdFlock,
} from '../../shared/assets/props.js';

/* ── Global state ─────────────────────────────────────────── */


  // Dense sample points along rivers + springs — feeds proximity-based water ambience
  const WATER_POINTS = buildWaterSamplePoints(WATERS, 25);
let renderer, scene, camera;
let environment, waterSystem, vegetation, particles;
let collision, controls, audio, ui, tour, intro, birdFlock;
let buildingGroups = new Map();    // id → THREE.Group
let urbanFabricGroup;
let groundMesh;
let isRunning = false;

// Fixed-step simulation state. The authoritative player position lives here —
// NOT in camera.position. The renderer blends between the previous and current
// sim state each display frame (PoseBlender); writing a blended position back
// into the sim would make the player drift at fractional speed.
let simPos, pose, frameMetrics, gameLoop, resolutionGovernor;

/* ── Initialization ───────────────────────────────────────── */

async function init() {
  // Show loading
  const loadingEl = document.getElementById('loading-screen');
  const loadingProgress = document.getElementById('loading-progress');
  const loadingText = document.querySelector('.loading-title');

  function setProgress(pct, msg) {
    if (loadingProgress) loadingProgress.style.width = `${pct}%`;
    if (loadingText) loadingText.textContent = msg;
  }

  setProgress(5, 'Starting renderer...');

  /* ── 1. Renderer ──────────────────────────────────────── */

  const canvas = document.getElementById('viewport');
  const profile = DeviceProfile();
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: profile.antialias,
    alpha: false,
    logarithmicDepthBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(profile.startPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = profile.tier === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  /* ── 2. Scene & Camera ────────────────────────────────── */

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    65, window.innerWidth / window.innerHeight, 0.3, 3000,
  );
  camera.position.set(SPAWN.x, PLAYER_HEIGHT, SPAWN.z);

  // Fixed-timestep loop state: sim runs at 60 Hz regardless of display rate.
  simPos = new THREE.Vector3(SPAWN.x, PLAYER_HEIGHT, SPAWN.z);
  pose = new PoseBlender(simPos);
  frameMetrics = new FrameMetrics();
  resolutionGovernor = new AdaptiveResolution(renderer, frameMetrics, {
    minRatio: profile.tier === 'low' ? 0.6 : 0.75,
    maxRatio: profile.startPixelRatio,
  });

  setProgress(10, 'Shaping the Attic terrain...');

  /* ── 3. Ground plane ──────────────────────────────────── */

  const groundGeo = new THREE.PlaneGeometry(
    BOUNDS.maxX - BOUNDS.minX + 200,
    BOUNDS.maxZ - BOUNDS.minZ + 200,
    64, 64,
  );
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(
    (BOUNDS.minX + BOUNDS.maxX) / 2,
    0,
    (BOUNDS.minZ + BOUNDS.maxZ) / 2,
  );

  // Subtle vertex displacement for natural ground feel
  const posAttr = groundGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const noise = Math.sin(x * 0.02) * Math.cos(z * 0.03) * 0.15;
    posAttr.setY(i, posAttr.getY(i) + noise);
  }
  groundGeo.computeVertexNormals();

  const groundMat = getMaterial('ground');
  groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  setProgress(15, 'Laying streets and processional routes...');

  /* ── 4. Streets ───────────────────────────────────────── */

  buildStreets();

  setProgress(25, 'Building monuments...');

  /* ── 5. Buildings ─────────────────────────────────────── */

  buildAllStructures();

  /* ── 5b. Collision System (initialized before urban fabric) */

  collision = new CollisionSystem();
  collision.buildFromData(BUILDINGS, STREETS, BOUNDS);

  setProgress(50, 'Generating urban fabric...');

  /* ── 6. Urban fabric (procedural infill) ──────────────── */

  buildUrbanFabric();

  setProgress(60, 'Setting the atmosphere...');

  /* ── 7. Environment (sky, lighting, fog) ──────────────── */

  environment = new Environment(scene, renderer, {
    startTime: 0.42, mood: 'athens',
    shadowMapSize: profile.shadowMapSize, shadowRadius: profile.shadowRadius,
  });

  setProgress(65, 'Adding water features...');

  /* ── 8. Water ─────────────────────────────────────────── */

  waterSystem = new WaterSystem(scene);
  waterSystem.buildFromData(WATERS);

  setProgress(70, 'Planting Mediterranean vegetation...');

  /* ── 9. Vegetation ────────────────────────────────────── */

  vegetation = new VegetationSystem(scene);
  vegetation.populateCity(REGIONS, BUILDINGS, STREETS);

  setProgress(75, 'Adding atmospheric particles...');

  /* ── 10. Particles ────────────────────────────────────── */

  particles = new ParticleSystem(scene);

  setProgress(82, 'Adding markets, amphorae and civic details...');

  /* ── 11b. Street dressing & Props ──────────────────────── */

  populateStreetDressing();

  /* ── 12. Controls ─────────────────────────────────────── */

  controls = new Controls(camera, canvas, document.body);

  setProgress(85, 'Preparing ambient audio...');

  /* ── 13. Audio ────────────────────────────────────────── */

  audio = new AudioSystem();

  setProgress(90, 'Preparing the interface...');

  /* ── 14. UI ───────────────────────────────────────────── */

  ui = new UISystem(
    { CITY, SOURCES, REGIONS, BUILDINGS, TELEPORTS, BOUNDS, WATERS },
    camera,
    collision,
  );
  ui.initMinimap();

  /* ── 15. Tour ─────────────────────────────────────────── */

  tour = new TourSystem(TOUR_STOPS, controls, ui);

  /* ── 16. Intro sequence ───────────────────────────────── */

  intro = new IntroSequence(camera, scene, controls);
  intro.onComplete = () => {
    controls.enable();
    simPos.copy(camera.position);
    pose.snap();
    audio.init();
    audio.setSoundset('mediterranean');
    isRunning = true;
  };

  setProgress(95, 'Preparing arrival...');

  /* ── 17. Event bindings ───────────────────────────────── */

  bindEvents();
  installWorldDebugHandle();

  setProgress(100, 'Athens ready!');

  /* ── 18. Start ────────────────────────────────────────── */

  // Show intro modal
  const introModal = document.getElementById('intro-modal');
  if (introModal) introModal.classList.remove('hidden');
  if (loadingEl) {
    setTimeout(() => {
      loadingEl.classList.add('fade-out');
      setTimeout(() => { loadingEl.style.display = 'none'; }, 600);
    }, 300);
  }

  // Start render loop
  // Loading watchdog: if init stalls (throttled phone), surface a Try Again
  // escape hatch instead of an eternal spinner.
  installLoadingWatchdog({ ready: () => window.__WORLD_DEBUG__?.ready === true, worldName: 'Athens' });
  installContextLossGuard(renderer);

  renderer.setAnimationLoop(render);
}

/* ── Build streets as flat geometry ───────────────────────── */

function buildStreets() {
  const roadMat = getMaterial('road');

  for (const street of STREETS) {
    const points = street.points;
    const halfW = street.width / 2;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const dx = p1[0] - p0[0];
      const dz = p1[1] - p0[1];
      const len = Math.sqrt(dx * dx + dz * dz);

      const geo = new THREE.PlaneGeometry(len, street.width);
      geo.rotateX(-Math.PI / 2);

      const mesh = new THREE.Mesh(geo, roadMat);
      mesh.receiveShadow = true;

      // Position at midpoint
      const mx = (p0[0] + p1[0]) / 2;
      const mz = (p0[1] + p1[1]) / 2;
      mesh.position.set(mx, 0.02, mz);

      // Rotate to align with direction
      const angle = Math.atan2(dz, dx);
      mesh.rotation.y = -angle;

      scene.add(mesh);
    }
  }
}

/* ── Build all named structures ───────────────────────────── */

function buildAllStructures() {
  for (const building of BUILDINGS) {
    try {
      const group = buildStructure(building);
      if (group) {
        group.position.set(building.x, building.y || 0, building.z);
        if (building.rot) group.rotation.y = building.rot;
        scene.add(group);
        buildingGroups.set(building.id, group);
      }
    } catch (e) {
      console.warn(`Failed to build ${building.id}:`, e);
    }
  }
}

/* ── Procedural urban fabric ──────────────────────────────── */

function buildUrbanFabric() {
  urbanFabricGroup = new THREE.Group();
  urbanFabricGroup.name = 'urban-fabric';

  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const globalCap = isMobile ? 300 : 700;
  const cell = isMobile ? 25 : 18;
  let placed = 0;

  // Simple deterministic hash
  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return ((h & 0x7fffffff) % 10000) / 10000;
  }

  for (const region of REGIONS) {
    if (placed >= globalCap) break;
    if (region.id === 'long-walls') continue;

    const style = DISTRICT_STYLES[region.id] || {
      density: 0.5, heightRange: [4, 8], shopRatio: 0.4, materials: ['plaster'],
    };

    const minX = region.x - region.w / 2 + cell * 0.5;
    const maxX = region.x + region.w / 2 - cell * 0.5;
    const minZ = region.z - region.d / 2 + cell * 0.5;
    const maxZ = region.z + region.d / 2 - cell * 0.5;

    for (let z = minZ; z <= maxZ && placed < globalCap; z += cell) {
      for (let x = minX; x <= maxX && placed < globalCap; x += cell) {
        const seed = `${region.id}:${Math.round(x)}:${Math.round(z)}`;
        if (hash(seed) > style.density) continue;

        // Check overlap with named buildings
        const overlaps = BUILDINGS.some(b => {
          const dx = Math.abs(x - b.x);
          const dz = Math.abs(z - b.z);
          return dx < (b.w / 2 + 8) && dz < (b.d / 2 + 8);
        });
        if (overlaps) continue;

        // Create fabric building
        const w = 8 + hash(`${seed}:w`) * 8;
        const d = 7 + hash(`${seed}:d`) * 7;
        const h = style.heightRange[0] + hash(`${seed}:h`) * (style.heightRange[1] - style.heightRange[0]);
        const jx = (hash(`${seed}:jx`) - 0.5) * cell * 0.2;
        const jz = (hash(`${seed}:jz`) - 0.5) * cell * 0.2;

        const fabricBuilding = {
          id: `fabric-${placed}`,
          type: hash(`${seed}:shop`) < style.shopRatio * 0.3 ? 'shop' : 'urban-fabric',
          x: x + jx, z: z + jz, w, d, h,
          evidence: { level: 'plausible' },
        };

        try {
          const group = buildStructure(fabricBuilding);
          if (group) {
            group.position.set(fabricBuilding.x, 0, fabricBuilding.z);
            const rot = (hash(`${seed}:rot`) - 0.5) * 0.15;
            group.rotation.y = rot;
            urbanFabricGroup.add(group);

            // Add to collision
            collision.grid.insert({
              type: 'rect', id: fabricBuilding.id,
              x: fabricBuilding.x, z: fabricBuilding.z,
              w: fabricBuilding.w, d: fabricBuilding.d,
              h: fabricBuilding.h, y: 0, rot,
            });
          }
        } catch (e) { /* skip failed fabric */ }

        placed++;
      }
    }
  }

  scene.add(urbanFabricGroup);
}

/* ── Populate Street Dressing & Life Props ────────────────── */

function populateStreetDressing() {
  const dressingGroup = new THREE.Group();
  dressingGroup.name = 'street-dressing';

  // 1. Agora Market Stalls (vibrant marketplace)
  const stalls = [
    { x: 95, z: -10, rot: 0.1, color: 0xc45c38 },
    { x: 105, z: -10, rot: -0.05, color: 0x4a7c59 },
    { x: 115, z: -10, rot: 0.08, color: 0xb8860b },
    { x: 85, z: 15, rot: Math.PI + 0.1, color: 0x8b3a3a },
    { x: 95, z: 15, rot: Math.PI - 0.05, color: 0x2e6b9e },
    { x: 105, z: 15, rot: Math.PI + 0.05, color: 0xd2a842 },
  ];
  for (const s of stalls) {
    dressingGroup.add(buildMarketStall(s.x, s.z, s.rot, s.color));
    collision.grid.insert({ type: 'rect', id: `stall-${s.x}-${s.z}`, x: s.x, z: s.z, w: 2.8, d: 2.2, h: 2.6 });
  }

  // 2. Amphorae clusters along Stoa and Kerameikos
  dressingGroup.add(buildAmphoraCluster(145, 10, 6, -Math.PI / 2));
  dressingGroup.add(buildAmphoraCluster(145, 30, 5, -Math.PI / 2));
  dressingGroup.add(buildAmphoraCluster(330, 260, 8, 0.4)); // Kerameikos potters
  dressingGroup.add(buildAmphoraCluster(370, 240, 6, -0.2));

  // 3. Braziers with burning coals at monumental entrances
  const braziers = [
    { x: -15, z: -300 }, // Parthenon west front
    { x: -55, z: -300 },
    { x: -25, z: -250 }, // Propylaea
    { x: 45, z: 140 },   // Hephaisteion
    { x: 65, z: 140 },
    { x: 68, z: -22 },   // Tholos
  ];
  for (const b of braziers) {
    dressingGroup.add(buildBrazier(b.x, b.z, 1.3));
  }

  // 4. Bronze Statues on marble pedestals
  dressingGroup.add(buildStatueMonument(-40, -280, 0, true)); // Athena on Acropolis
  dressingGroup.add(buildStatueMonument(80, -35, Math.PI * 0.4, false)); // Tyrannicides in Agora
  dressingGroup.add(buildStatueMonument(130, -5, -Math.PI * 0.3, false));

  // 5. Inscribed Stelae near Tholos and Bouleuterion
  dressingGroup.add(buildInscribedStele(72, -30, 0.2));
  dressingGroup.add(buildInscribedStele(75, -15, -0.1));

  // 6. Stone Benches along Panathenaic Way
  const benches = [
    { x: 120, z: -40, rot: 0.2 },
    { x: 160, z: 20, rot: -0.3 },
    { x: 220, z: 90, rot: 0.4 },
    { x: 280, z: 170, rot: 0.25 },
  ];
  for (const b of benches) {
    dressingGroup.add(buildStoneBench(b.x, b.z, b.rot));
  }

  // 7. Merchant Wooden Carts near Dipylon Gate
  dressingGroup.add(buildWoodenCart(325, 270, 0.4));
  dressingGroup.add(buildWoodenCart(355, 295, -0.6));

  // 8. Sacrificial Altars (Great Altar of Athena & Altar of Twelve Gods)
  dressingGroup.add(buildSacrificialAltar(10, -310, 0)); // In front of Parthenon
  collision.grid.insert({ type: 'rect', id: 'athena-altar', x: 10, z: -310, w: 3.6, d: 2.4, h: 2.2 });
  dressingGroup.add(buildSacrificialAltar(110, -35, 0.2)); // Altar of Twelve Gods in Agora
  collision.grid.insert({ type: 'rect', id: 'twelve-gods-altar', x: 110, z: -35, w: 3.6, d: 2.4, h: 2.2 });

  // 9. Classical Sundials
  dressingGroup.add(buildSundialMonument(-30, -320)); // Acropolis
  dressingGroup.add(buildSundialMonument(105, 5));    // Agora

  // 10. Mediterranean Merchant Trading Ships in Piraeus Harbour
  dressingGroup.add(buildMerchantVessel(920, 240, 0.4));
  dressingGroup.add(buildMerchantVessel(880, 270, -0.3));

  // 11. Living Water Assets & Acropolis Bird Flock
  // Riverbank reeds along Ilissos / Kallirrhoe spring and Eridanos stream
  dressingGroup.add(buildRiverReeds(-255, 163, 16, 2.8));
  dressingGroup.add(buildRiverReeds(-272, 155, 14, 2.5));
  dressingGroup.add(buildRiverReeds(-310, 150, 18, 3.2));
  dressingGroup.add(buildRiverReeds(280, 225, 16, 2.6));
  dressingGroup.add(buildRiverReeds(375, 235, 18, 3.0));

  // Ancient wooden cargo skiff moored along Ilissos
  dressingGroup.add(buildCargoSkiff(-280, 172, 0.25));

  // Rustic wooden footbridge across Ilissos river near Kallirrhoe
  dressingGroup.add(buildWoodenFootbridge(-270, 160, 0.78, 14, 2.4));

  // Aerial bird flock circling over the Acropolis sanctuary
  birdFlock = buildBirdFlock(0, 48, -280, 12, 36);
  dressingGroup.add(birdFlock);

  scene.add(dressingGroup);
}

/* ── Event bindings ───────────────────────────────────────── */

function bindEvents() {
  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Enter button — start experience
  const enterBtn = document.getElementById('btn-enter');
  if (enterBtn) {
    enterBtn.addEventListener('click', () => {
      const introModal = document.getElementById('intro-modal');
      if (introModal) {
        introModal.style.display = 'none';
      }
      try {
        // Start cinematic intro
        intro.start();
        // Initialize audio on user gesture
        audio.init();
        audio.installLifecycleResume();
        audio.setSoundset('mediterranean');
      } catch (err) {
        console.warn('enter sequence: non-fatal', err);
        intro.start();
      }
    });
  }

  // Skip intro
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && intro && !intro.isComplete) {
      intro.skipIntro();
    }
  });

  // HUD button bindings
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };

  bind('btn-teleport', () => ui.toggleTeleportMenu());
  bind('btn-inspect', () => inspectLookedAt());
  bind('btn-map', () => ui.toggleMinimap());
  bind('btn-mobile-map', () => ui.toggleMinimap());
  bind('btn-audio', () => {
    if (!audio) return;
    audio.resume();
    audio.muted ? audio.unmute() : audio.mute();
    const b = document.getElementById('btn-audio');
    if (b) {
      b.textContent = audio.muted ? '🔇' : '🔊';
      b.setAttribute('aria-pressed', String(audio.muted));
      b.title = audio.muted ? 'Unmute ambient audio' : 'Mute ambient audio';
    }
  });
  bind('btn-evidence', () => {
    ui.toggleEvidence();
    applyEvidenceMode(ui.evidenceActive);
  });
  bind('btn-sources', () => ui.showSourcesModal());
  bind('btn-daynight', () => {
    // Real day/night toggle: jump to night (and hold it) / back to noon.
    // toggleCycle() only pauses the cycle — kept available for future controls.
    const goingNight = !environment.isNight;
    if (goingNight) {
      environment.jumpToNight();
      if (environment.cycleSpeed > 0) {
        environment._savedCycleSpeed = environment.cycleSpeed;
        environment.cycleSpeed = 0;
      }
    } else {
      environment.jumpToNoon();
      if (!environment.cycleSpeed) {
        environment.cycleSpeed = environment._savedCycleSpeed || 0.008;
      }
    }
    const b = document.getElementById('btn-daynight');
    if (b) {
      b.textContent = goingNight ? '☀️' : '🌙';
      b.title = goingNight ? 'Switch to day' : 'Switch to night';
      b.setAttribute('aria-pressed', String(goingNight));
    }
  });
  bind('btn-tour', () => {
    if (tour.isActive) tour.stop();
    else tour.start();
  });

  // Teleport callback
  ui.onTeleport = (teleportId) => {
    const building = BUILDINGS.find(b => b.id === teleportId);
    if (!building) return;
    // Stand far enough back that the landmark fills the arrival view instead of a wall:
    // standoff = 1.4 × half-diagonal of the footprint + 8m framing margin.
    const standoff = Math.hypot(building.w || 20, building.d || 20) * 0.7 + 8;
    const safe = collision.findSafeSpawn(building.x, building.z, 160, standoff);
    window.__WORLD_LAST_TELEPORT__ = building.id;
    // Face the landmark: yaw convention — 0 = North (+Z reversed), atan2(dx, +dz) looks AWAY
    const angle = Math.atan2(safe.x - building.x, safe.z - building.z);
    const targetY = typeof safe.y === 'number' ? safe.y + 1.7 : 1.7;
    controls.teleportTo(safe.x, safe.z, angle, targetY);
    // Teleport is a discrete jump: the sim state must land exactly there so
    // the pose blender doesn't glide across the map on the next frames.
    simPos.copy(camera.position);
    pose.snap();
    ui.hideTeleportMenu();
  };

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (!isRunning) return;
    switch (e.code) {
      case 'KeyM': ui.toggleMinimap(); break;
      case 'KeyV': ui.toggleEvidence(); applyEvidenceMode(ui.evidenceActive); break;
      case 'KeyT': ui.toggleTeleportMenu(); break;
      case 'KeyG': if (tour.isActive) tour.stop(); else tour.start(); break;
      case 'KeyN': environment.toggleCycle(); break;
    }
  });
}

/* ── Evidence mode visual application ─────────────────────── */

function installWorldDebugHandle() {
  window.__WORLD_DEBUG__ = {
    id: 'athens',
    get ready() { return Boolean(renderer && camera && controls && collision && ui); },
    audio,
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
    step(dt = SIM_DT) {
      if (!controls?.enabled || !collision) return false;
      const delta = Math.max(0, Math.min(Number(dt) || 0, 0.5));
      controls.update(delta, false);
      const moveVec = controls.getMovementVector(delta);
      const target = simPos || camera.position;
      collision.moveAndSlide(target, moveVec, delta);
      if (simPos) {
        camera.position.copy(simPos);
        pose?.snap();
      }
      return true;
    },
    metrics() {
      return frameMetrics ? frameMetrics.summary() : null;
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
    const building = BUILDINGS.find(b => b.id === id);
    if (!building) continue;

    group.traverse(child => {
      if (child.isMesh) {
        if (active && building.evidence) {
          child._originalMaterial = child._originalMaterial || child.material;
          child.material = getEvidenceMaterial(building.evidence.level);
        } else if (child._originalMaterial) {
          child.material = child._originalMaterial;
          delete child._originalMaterial;
        }
      }
    });
  }
}

/* ── Inspect looked-at building ───────────────────────────── */

function inspectLookedAt() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const result = collision.raycast(camera.position, dir, 60);
  let building = null;
  if (result) {
    // Colliders use suffixed ids (temple-cella, gate-left/right, ...) — match by parent prefix.
    building = BUILDINGS.find(b => b.id === result.id || result.id.startsWith(`${b.id}-`));
  }
  if (!building) {
    // Fallback: rays can slip through propylaea passages. Prefer the last teleport target,
    // then the nearest landmark.
    const lastId = window.__WORLD_LAST_TELEPORT__;
    if (lastId) building = BUILDINGS.find(b => b.id === lastId);
    if (!building) {
      let best = null;
      let bestD = 90 * 90;
      for (const item of BUILDINGS) {
        const dx = item.x - camera.position.x;
        const dz = item.z - camera.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD) { bestD = d2; best = item; }
      }
      building = best;
    }
  }
  if (building) {
    ui.showInfoCard(building, SOURCES);
  }
}

/* ── Fixed-step simulation (60 Hz, dt is always SIM_DT) ─────────────── */

function stepSimulation(dt) {
  // Physics-only step: player movement + collision + jump state.
  // Look stays display-rate (drawFrame → controls.applyLook) for latency.
  if (!controls?.enabled || tour._isFlying) return;

  controls.update(dt, false);
  const moveVec = controls.getMovementVector(dt);
  const wasAirborne = !collision.onGround;
  const velBefore = collision.playerVelocityY;
  collision.moveAndSlide(simPos, moveVec, dt);
  const jump = controls.getJumpImpulse();
  if (jump > 0) {
    collision.jump(jump);
    audio.jump();
  }
  // Landing thud: airborne -> grounded transition this step
  if (wasAirborne && collision.onGround && velBefore < -3) {
    audio.land(-velBefore);
  }
}

/* ── Display frame (every animation frame, variable rate) ───────────── */

function drawFrame(frameDt, alpha) {
  // Intro still owns the camera entirely — no fixed-step movement yet.
  if (intro && !intro.isComplete) {
    intro.update(frameDt);
    environment.update(frameDt, camera.position);
    waterSystem.update(frameDt);
    particles.update(frameDt, camera.position, environment.isNight);
    renderer.render(scene, camera);
    return;
  }

  // Camera look (mouse/touch) stays display-rate for zero input latency.
  controls.applyLook();

  if (tour.isActive) {
    tour.update(frameDt);
  }

  // Tour flights and the cinematic intro move the camera directly; during a
  // flight the sim position must follow so the next handoff doesn't glide.
  if (tour._isFlying || (tour.isActive && tour._activeFlight)) {
    simPos.copy(camera.position);
    pose.snap();
  } else {
    // Show the simulation one step behind, blended by the fractional remainder.
    camera.position.copy(pose.sample(alpha));
  }

  if (birdFlock?.userData?.update) {
    birdFlock.userData.update(frameDt);
  }

  // Ecosystems & audio keep their own integration (display-rate is fine —
  // purely cosmetic layers with no collision coupling).
  environment.update(frameDt, camera.position);
  waterSystem.update(
    frameDt,
    environment.skyUniforms.uSunDir.value,
    environment.skyUniforms.uSkyTop.value,
  );
  particles.update(frameDt, camera.position, environment.isNight);

  const isMoving = Math.abs(inputState.forward) > 0.1 || Math.abs(inputState.strafe) > 0.1;
  audio.update(frameDt, camera.position, environment.isNight, isMoving, inputState.run, {
    waters: WATER_POINTS,
  });

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

function render(now) {
  if (!gameLoop) {
    gameLoop = new GameLoop({
      step: stepSimulation,
      render: drawFrame,
      beforeSteps: () => pose.capture(),
      metrics: frameMetrics,
    });
  }
  gameLoop.frame(now);
  if (resolutionGovernor) resolutionGovernor.update();
}

/* ── Bootstrap ────────────────────────────────────────────── */

// Check WebGL support. three.js r174 renders through WebGL 2 only — a WebGL 1
// context passes the old webgl2||webgl probe and then crashes init on devices
// that lack WebGL 2. requireWebGL2() is the honest gate and renders a repair
// message (with the detected iOS version) instead of a fatal-stack card.
if (!window.__WORLDS_ENTRY_NET__.requireWebGL2('Athens')) {
  console.warn('Athens: WebGL 2 unavailable; entry blocked by worlds-entry-net.');
} else {
  init().catch(err => {
    console.error('Athens initialization failed:', err);
    window.__WORLDS_ENTRY_NET__.recordInitCatch('Athens', err);
    showFatalInitError(err, 'Athens');
  });
}

/* ── Expose for debugging ─────────────────────────────────── */
window.__ATHENS__ = {
  get scene() { return scene; },
  get camera() { return camera; },
  get environment() { return environment; },
  get controls() { return controls; },
  get collision() { return collision; },
  get ui() { return ui; },
  get tour() { return tour; },
};
