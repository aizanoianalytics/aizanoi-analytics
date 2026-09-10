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
  buildRiverReeds,
  buildCargoSkiff,
  buildWoodenFootbridge,
  buildBirdFlock,
} from '../../shared/assets/props.js';


  // Dense sample points along rivers + springs — feeds proximity-based water ambience
  const WATER_POINTS = buildWaterSamplePoints(WATERS, 25);
let renderer, scene, camera, clock;
let environment, waterSystem, vegetation, particles;
let collision, controls, audio, ui, tour, intro, birdFlock;
let buildingGroups = new Map();
let isRunning = false;

// Fixed-step simulation state. The authoritative player position lives here —
// NOT in camera.position. The renderer blends between the previous and current
// sim state each display frame (PoseBlender); writing a blended position back
// into the sim would make the player drift at fractional speed.
let simPos, pose, frameMetrics, gameLoop, resolutionGovernor;

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

  // 2. Scene & Camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.3, 3000);
  camera.position.set(SPAWN.x, PLAYER_HEIGHT, SPAWN.z);
  clock = new THREE.Clock();

  // Fixed-timestep loop state: sim runs at 60 Hz regardless of display rate.
  simPos = new THREE.Vector3(SPAWN.x, PLAYER_HEIGHT, SPAWN.z);
  pose = new PoseBlender(simPos);
  frameMetrics = new FrameMetrics();
  // Adaptive resolution: walk DPR down when p95 blows the budget (thermal
  // throttling, SwiftShader), recover when there is sustained headroom.
  resolutionGovernor = new AdaptiveResolution(renderer, frameMetrics, {
    minRatio: profile.tier === 'low' ? 0.6 : 0.75,
    maxRatio: profile.startPixelRatio,
  });

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

  // 6b. Collision System (initialized before urban fabric so insulae are inserted)
  collision = new CollisionSystem();
  collision.buildFromData(BUILDINGS, STREETS, BOUNDS);

  setProgress(75, 'Generating residential fabric and Phrygian streets...');

  // 7. Urban Infill (inserts insulae into collision grid)
  buildUrbanFabric();

  setProgress(85, 'Planting olive groves and river vegetation...');

  // 8. Vegetation
  vegetation = new VegetationSystem(scene);
  vegetation.populateCity(REGIONS, BUILDINGS, STREETS);

  // 9. Environment
  environment = new Environment(scene, renderer, {
    startTime: 0.45, cycleSpeed: 0.005, mood: 'aizanoi',
    shadowMapSize: profile.shadowMapSize, shadowRadius: profile.shadowRadius,
  });

  // 10. Particles & Audio
  particles = new ParticleSystem(scene);
  audio = new AudioSystem();

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

  tour = new TourSystem(TOUR_STOPS, controls, ui, scene);

  // 15. Cinematic Intro
  intro = new IntroSequence(camera, scene, controls, {
    heading:  CITY.title,
    subtitle: 'Phrygia Epiktetos · Temple of Zeus · Roman Imperial',
  });
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
    // Intro flew the camera to the spawn point; sync the fixed-step sim to it
    // (skip-path lands mid-curve if ESC/tap fired, so never assume SPAWN here).
    simPos.copy(camera.position);
    pose.snap();
    audio.init();
    audio.setSoundset('mediterranean');
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

  // Loading watchdog: if init stalls (throttled phone), surface a Try Again
  // escape hatch instead of an eternal spinner.
  installLoadingWatchdog({ ready: () => window.__WORLD_DEBUG__?.ready === true, worldName: 'Aizanoi' });
  installContextLossGuard(renderer);

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

  // 6. Penkalas River Living Assets & Sanctuary Birds
  // Riverbank reeds along Penkalas shallows and quays
  dressingGroup.add(buildRiverReeds(90, -220, 14, 3.2));
  dressingGroup.add(buildRiverReeds(130, -20, 12, 3.0));
  dressingGroup.add(buildRiverReeds(140, 110, 15, 3.5));
  dressingGroup.add(buildRiverReeds(95, -70, 10, 2.5));

  // Ancient wooden cargo skiffs moored along Penkalas riverbank
  dressingGroup.add(buildCargoSkiff(100, -115, 0.25));
  dressingGroup.add(buildCargoSkiff(125, 10, -0.3));

  // Rustic wooden footbridge spanning upper Penkalas
  dressingGroup.add(buildWoodenFootbridge(105, -290, 0.45, 16, 2.4));

  // Aerial bird flock circling over the Temple of Zeus sanctuary
  birdFlock = buildBirdFlock(-150, 42, 25, 10, 28);
  dressingGroup.add(birdFlock);

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
        introModal.style.display = 'none';
      }
      try {
        intro.start();
        audio.init();
        audio.installLifecycleResume();
        audio.setSoundset('mediterranean');
      } catch (err) {
        console.warn('enter sequence: non-fatal', err);
        // Never strand the player on the intro modal: force-start the intro.
        intro.start();
      }
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
}

function installWorldDebugHandle() {
  window.__WORLD_DEBUG__ = {
    id: 'aizanoi',
    get scene() { return scene; },
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
    get tour() {
      if (!tour) return null;
      const b = tour.beacon;
      return {
        isActive: tour.isActive,
        beacon: b ? { visible: b.visible, x: b.position.x, y: b.position.y, z: b.position.z, inScene: !!(b.parent && b.parent.isScene), parentType: b.parent ? b.parent.type : 'none' } : null,
      };
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
  let b = null;
  if (hit) {
    // Colliders use suffixed ids (temple-cella, theatre-scaena, gate-left/right, ...) —
    // match the parent building by prefix so Inspect works on every monument.
    b = BUILDINGS.find(item => item.id === hit.id || hit.id.startsWith(`${item.id}-`));
  }
  if (!b) {
    // Fallback: rays can slip through gate tunnels and colonnades. Prefer the landmark the
    // player just teleported to, then the nearest one.
    const lastId = window.__WORLD_LAST_TELEPORT__;
    if (lastId) b = BUILDINGS.find(item => item.id === lastId);
    if (!b) {
      let best = null;
      let bestD = 90 * 90;
      for (const item of BUILDINGS) {
        const dx = item.x - camera.position.x;
        const dz = item.z - camera.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD) { bestD = d2; best = item; }
      }
      b = best;
    }
  }
  if (b) ui.showInfoCard(b, SOURCES);
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

  if (tour.isActive) tour.update(frameDt);

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
    environment.skyUniforms.uSkyTop.value
  );
  particles.update(frameDt, camera.position, environment.isNight);

  const isMoving = Math.abs(inputState.forward) > 0.1 || Math.abs(inputState.strafe) > 0.1;
  audio.update(frameDt, camera.position, environment.isNight, isMoving, inputState.run, {
    waters: WATER_POINTS,
  });

  const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  ui.updateHud(frameDt, camera.position.x, camera.position.z, euler.y);

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

init().catch(err => { console.error('Aizanoi init failed:', err); showFatalInitError(err, 'Aizanoi'); });
