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
import { buildStructure, buildStaticStructure, buildInstancedLayer, queueFabric, KIT_MANIFEST, setAssetKit } from './builders.js';
import { loadAssetKit } from '../../shared/engine/asset-kit.js';
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
  buildRomanFountain,
  buildWoodenCart,
  buildUmbrellaPine,
  buildSacrificialAltar,
  buildMerchantVessel,
  buildSundialMonument,
  buildPavingWeeds,
  buildFallenColumnDrums,
  buildShatteredStele,
  buildDebrisPile,
  buildRiverReeds,
  buildCargoSkiff,
  buildBirdFlock,
  buildRuinedTriumphalArch,
  buildLateRomanBarricade,
  buildForumWatchBrazier,
} from '../../shared/assets/props.js';


  // Dense sample points along rivers + springs — feeds proximity-based water ambience
  const WATER_POINTS = buildWaterSamplePoints(WATERS, 25);
let renderer, scene, camera;
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

  setProgress(10, 'Starting Late Antique Rome...');

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
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 2. Scene & Camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.3, 3500);
  camera.position.set(SPAWN.x, PLAYER_HEIGHT, SPAWN.z);

  // Fixed-timestep loop state: sim runs at 60 Hz regardless of display rate.
  simPos = new THREE.Vector3(SPAWN.x, PLAYER_HEIGHT, SPAWN.z);
  pose = new PoseBlender(simPos);
  frameMetrics = new FrameMetrics();
  resolutionGovernor = new AdaptiveResolution(renderer, frameMetrics, {
    minRatio: profile.tier === 'low' ? 0.6 : 0.75,
    maxRatio: profile.startPixelRatio,
  });

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

  // 4b. Blender asset kit (heroes + instanced fabric resolve to local GLBs)
  const kitBase = new URL('../assets/', import.meta.url);
  const kit = await loadAssetKit(kitBase, KIT_MANIFEST, (frac) => {
    setProgress(45 + Math.round(frac * 5), 'Loading Blender-crafted monuments...');
  });
  setAssetKit(kit);

  // 5. Named Monuments
  buildAllMonuments();

  setProgress(65, 'Connecting the Tiber and aqueduct landscape...');

  // 6. Waters (Tiber River)
  waterSystem = new WaterSystem(scene);
  waterSystem.buildFromData(WATERS);

  // 6b. Physics & Collision (initialized before insulae so they are inserted into grid)
  collision = new CollisionSystem();
  collision.buildFromData(BUILDINGS, STREETS, BOUNDS);

  setProgress(75, 'Building the Aurelian Walls and Subura fabric...');

  // 7. Urban Insulae Fabric (queued instances + collision grid)
  buildUrbanInsulae();
  scene.add(buildInstancedLayer());

  setProgress(85, 'Planting Mediterranean vegetation and umbrella pines...');

  // 8. Vegetation
  vegetation = new VegetationSystem(scene);
  vegetation.populateCity(REGIONS, BUILDINGS, STREETS);

  // 9. Environment (Sky, Dusk Atmosphere, Torches)
  environment = new Environment(scene, renderer, {
    startTime: 0.68, cycleSpeed: 0.005, mood: 'rome',
    shadowMapSize: profile.shadowMapSize, shadowRadius: profile.shadowRadius,
  }); // Late afternoon Roman golden hour

  // 10. Particles & Audio
  particles = new ParticleSystem(scene);
  audio = new AudioSystem();

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
    simPos.copy(camera.position);
    pose.snap();
    audio.init();
    audio.setSoundset('mediterranean');
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

  // Loading watchdog: if init stalls (throttled phone), surface a Try Again
  // escape hatch instead of an eternal spinner.
  installLoadingWatchdog({ ready: () => window.__WORLD_DEBUG__?.ready === true, worldName: 'Rome' });
  installContextLossGuard(renderer);

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
      const group = buildStaticStructure(b);
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

        const isCharred = hash(`${seed}:charred`) < 0.14;
        const variantPick = hash(`${seed}:kit`);
        const variant = variantPick < 0.4 ? 'fabric_a' : variantPick < 0.7 ? 'fabric_b' : 'fabric_c';
        const kitYaw = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(hash(`${seed}:yaw`) * 4)];
        const rotated = Math.abs(Math.sin(kitYaw)) > 0.5;
        queueFabric(variant, { x, y: 0, z, yaw: kitYaw, scale: 0.9 + hash(`${seed}:s`) * 0.3 });
        collision.grid.insert({ type: 'rect', id: `insula-${placed}`, x, z, w: rotated ? d : w, d: rotated ? w : d, h, y: 0 });

        placed++;
      }
    }
  }
}

/* ── Populate Rome Street Dressing & Imperial Props ───────── */

function populateRomeDressing() {
  const dressingGroup = new THREE.Group();
  dressingGroup.name = 'rome-street-dressing';
  // Keep authored street furniture aligned with the compact survey coordinates.
  dressingGroup.scale.setScalar(0.84);
  dressingGroup.userData.layoutScale = 0.84;

  // 1. Roman Nymphaeum Stone Fountains in Public Plazas
  dressingGroup.add(buildRomanFountain(-60, -10, 0));  // Forum Romanum center
  dressingGroup.add(buildRomanFountain(-220, 110, Math.PI / 4)); // Campus Martius
  dressingGroup.add(buildRomanFountain(-170, 55, 0));  // Near Pantheon

  // 2. Market Stalls in Subura & Forum Boarium
  const stalls = [
    { x: -150, z: 80, rot: 0.2, color: 0x9e3824 },
    { x: -140, z: 80, rot: -0.1, color: 0xb8860b },
    { x: -130, z: 80, rot: 0.15, color: 0x4a7c59 },
    { x: -200, z: -45, rot: Math.PI + 0.1, color: 0x8b3a3a },
    { x: -190, z: -45, rot: Math.PI - 0.05, color: 0x2e6b9e },
  ];
  for (const s of stalls) {
    dressingGroup.add(buildMarketStall(s.x, s.z, s.rot, s.color));
    collision.grid.insert({ type: 'rect', id: `rome-stall-${s.x}-${s.z}`, x: s.x, z: s.z, w: 2.8, d: 2.2, h: 2.6 });
  }

  // 3. Amphora Clusters along Tiber River wharves
  dressingGroup.add(buildAmphoraCluster(-270, -40, 8, 0.4));
  dressingGroup.add(buildAmphoraCluster(-265, -80, 6, -0.3));
  dressingGroup.add(buildAmphoraCluster(-40, -30, 5, 0)); // Forum tabernae

  // 4. Braziers at Colosseum & Triumphal Arches
  const braziers = [
    { x: 70, z: -70 },  // Colosseum east gate
    { x: 110, z: -70 },
    { x: 70, z: -10 },  // Colosseum west gate
    { x: 110, z: -10 },
    { x: 30, z: -100 },  // Arch of Constantine
    { x: -130, z: 10 },  // Arch of Septimius Severus
  ];
  for (const b of braziers) {
    dressingGroup.add(buildBrazier(b.x, b.z, 1.4));
  }

  // 5. Imperial Statues on plinths in the Forum & Capitolium (weathered verdigris patina 0x42735d)
  dressingGroup.add(buildStatueMonument(-75, -5, 0, false, true));
  dressingGroup.add(buildStatueMonument(-50, 15, Math.PI * 0.5, false, true));
  dressingGroup.add(buildStatueMonument(-20, -30, -Math.PI * 0.25, false, true));

  // 6. Marble Inscribed Columns & Milestones
  dressingGroup.add(buildInscribedStele(-70, 5, 0.2, 'Miliarium Aureum'));
  dressingGroup.add(buildInscribedStele(-55, -2, -0.1, 'Lapis Niger'));

  // 7. Stone Benches along Via Sacra
  const benches = [
    { x: -120, z: -28, rot: 0.3 },
    { x: -90, z: -26, rot: 0.3 },
    { x: -60, z: -30, rot: 0.3 },
    { x: -30, z: -33, rot: 0.3 },
  ];
  for (const b of benches) {
    dressingGroup.add(buildStoneBench(b.x, b.z, b.rot));
  }

  // 8. Two-wheeled Merchant Carts along Via Flaminia
  dressingGroup.add(buildWoodenCart(-205, 200, 0.2));
  dressingGroup.add(buildWoodenCart(-200, 230, -0.4));

  // 9. Italian Stone Pines (Pinus Pinea)
  dressingGroup.add(buildUmbrellaPine(-40, 90, 20));
  dressingGroup.add(buildUmbrellaPine(0, 100, 22));
  dressingGroup.add(buildUmbrellaPine(120, -20, 19));
  dressingGroup.add(buildUmbrellaPine(-160, -20, 18));

  // 10. Great Altars in the Forum Romanum (Altar of Saturn & Temple of Concord)
  dressingGroup.add(buildSacrificialAltar(-80, -2, 0.15));
  collision.grid.insert({ type: 'rect', id: 'saturn-altar', x: -80, z: -2, w: 3.6, d: 2.4, h: 2.2 });

  // 11. Solarium Augusti / Horologium Sundial in Campus Martius
  dressingGroup.add(buildSundialMonument(-225, 120));

  // 12. Roman Merchant Vessels (Navis Oneraria) on the Tiber River
  dressingGroup.add(buildMerchantVessel(-285, -60, 0.22));
  dressingGroup.add(buildMerchantVessel(-280, 0, -0.18));

  // 13. Late Antique Decay Layer (AD 410–476 Post-Sack Neglect & Ruin)
  // Broken / fallen column drums in Imperial Fora & Forum Romanum
  dressingGroup.add(buildFallenColumnDrums(-70, -5, 0.4, 4));
  dressingGroup.add(buildFallenColumnDrums(-55, -20, -0.6, 3));
  dressingGroup.add(buildFallenColumnDrums(-40, 0, 0.8, 3));
  dressingGroup.add(buildFallenColumnDrums(-60, 40, 0.2, 3));

  // Shattered stelae in Forum Romanum
  dressingGroup.add(buildShatteredStele(-65, 5, 0.5));
  dressingGroup.add(buildShatteredStele(-50, -8, -0.3));

  // Travertine & brick debris mounds
  dressingGroup.add(buildDebrisPile(-60, 20, 2.8, 1.2));
  dressingGroup.add(buildDebrisPile(-70, -15, 3.2, 1.4));
  dressingGroup.add(buildDebrisPile(40, 30, 2.5, 1.0));
  dressingGroup.add(buildDebrisPile(120, 60, 3.4, 1.5));
  dressingGroup.add(buildDebrisPile(-140, -50, 3.0, 1.3));

  // Partially collapsed arcade on secondary aqueduct / portico spur
  const arcade1 = buildStructure({ type: 'collapsed-arcade', w: 26, h: 11, d: 5 });
  arcade1.position.set(150, 0, 40);
  arcade1.rotation.y = 0.4;
  dressingGroup.add(arcade1);
  collision.grid.insert({ type: 'rect', id: 'collapsed-arcade-1', x: 150, z: 40, w: 26, d: 5, h: 11 });

  // Fractured Late-Antique Ruined Triumphal Archway (Post-Sack)
  dressingGroup.add(buildRuinedTriumphalArch(-75, 25, 0.35));
  collision.grid.insert({ type: 'rect', id: 'ruined-arch-1', x: -75, z: 25, w: 7.2, d: 3.6, h: 7.8 });

  // Late Roman Street Defense Barricades
  dressingGroup.add(buildLateRomanBarricade(-50, -18, 0.28));
  collision.grid.insert({ type: 'rect', id: 'barricade-sacra-1', x: -50, z: -18, w: 3.2, d: 2.2, h: 1.8 });
  dressingGroup.add(buildLateRomanBarricade(-210, 240, -0.4));

  // Forum Night Watch Fire Baskets
  dressingGroup.add(buildForumWatchBrazier(-70, 15));
  dressingGroup.add(buildForumWatchBrazier(-45, -12));

  // Overgrown street paving weeds along Roman basalt roads
  const weedCoords = [
    [-68, 28], [-72, 36], [-80, 15], [-50, 48], [-40, 22],
    [-20, -5], [-10, -18], [5, -30], [20, -45], [35, -58],
    [50, 75], [60, 85], [30, 100], [-135, -100], [-145, -120],
    [-85, 40], [-60, 20], [-45, 10], [120, 75], [125, 65]
  ];
  for (let i = 0; i < weedCoords.length; i++) {
    const [wx, wz] = weedCoords[i];
    dressingGroup.add(buildPavingWeeds(wx, wz, (i * 0.7) % Math.PI, 0.9 + (i % 3) * 0.2));
  }

  // 14. Living Water & Bird Life (Tiber Reeds, Moored Skiffs, Capitolium Flock)
  // Reeds along Tiber river banks near Forum Boarium & wharves
  dressingGroup.add(buildRiverReeds(-275, -100, 18, 3.2));
  dressingGroup.add(buildRiverReeds(-280, -160, 16, 3.0));
  dressingGroup.add(buildRiverReeds(-270, -30, 14, 2.8));
  dressingGroup.add(buildRiverReeds(-285, -250, 20, 3.5));

  // Small river cargo skiffs moored at Tiber wharves
  dressingGroup.add(buildCargoSkiff(-278, -120, 0.18));
  dressingGroup.add(buildCargoSkiff(-282, -180, -0.22));

  // Aerial bird flock circling over the Forum Romanum & Capitoline Hill
  birdFlock = buildBirdFlock(-60, 40, 25, 14, 36);
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
        intro.start();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && intro && !intro.isComplete) {
      intro.skipIntro();
      return;
    }
    if (!isRunning) return;
    switch (e.code) {
      case 'KeyM': ui.toggleMinimap(); break;
      case 'KeyV': ui.toggleEvidence(); applyEvidenceMode(ui.evidenceActive); break;
      case 'KeyT': ui.toggleTeleportMenu(); break;
      case 'KeyG': if (tour.isActive) tour.stop(); else tour.start(); break;
      case 'KeyN': environment.toggleCycle(); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
      case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9': {
        const num = parseInt(e.code.replace('Digit', ''), 10);
        if (num >= 1 && num <= BUILDINGS.length && typeof ui.onTeleport === 'function') {
          ui.onTeleport(BUILDINGS[num - 1].id);
        }
        break;
      }
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
    id: 'rome',
    get scene() { return scene; },
    get ready() { return Boolean(renderer && camera && controls && collision && ui); },
    get drawCalls() { return renderer ? renderer.info.render.calls : 0; },
    audio,
    get camera() { return camera; },
    get controls() { return controls; },
    get environment() { return environment; },
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
    assetBoxes(ids = []) {
      const wanted = ids.length ? ids : [...buildingGroups.keys()];
      return wanted.map((id) => {
        const group = buildingGroups.get(id);
        if (!group) return { id, missing: true };
        const box = new THREE.Box3().setFromObject(group);
        return { id, min: box.min.toArray(), max: box.max.toArray(), kitAssets: group.userData.kitAssets || [] };
      });
    },
    teleport(id) {
      if (!ui?.onTeleport || !BUILDINGS.some((building) => building.id === id)) return false;
      ui.onTeleport(id);
      return true;
    },
    frameCamera(px, py, pz, yaw, pitch) {
      if (!controls || !collision) return false;
      intro?.skipIntro();
      controls.enable();
      isRunning = true;
      simPos.set(px, py, pz);
      camera.position.set(px, py, pz);
      pose?.snap();
      controls.euler.set(pitch, yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(controls.euler);
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
  let b = null;
  if (hit) {
    // Colliders use suffixed ids (temple-cella, amphitheatre-wall-*, ...) — match by parent prefix.
    b = BUILDINGS.find(item => item.id === hit.id || hit.id.startsWith(`${item.id}-`));
  }
  if (!b) {
    // Fallback: rays slip straight through the amphitheatre's opposing cardinal gates.
    // Prefer the landmark the player teleported to (e.g. Colosseum spawn is outside the
    // east gate, so the ray runs through both gates and misses the walls entirely).
    const lastId = window.__WORLD_LAST_TELEPORT__;
    if (lastId) b = BUILDINGS.find(item => item.id === lastId);
    if (!b) {
      let best = null;
      let bestD = 100 * 100;
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

// three.js r174 renders through WebGL 2 only; gate the boot on it so devices
// without WebGL 2 get a repair message instead of a fatal crash card.
if (!window.__WORLDS_ENTRY_NET__.requireWebGL2('Rome')) {
  console.warn('Rome: WebGL 2 unavailable; entry blocked by worlds-entry-net.');
} else {
  init().catch(err => {
    console.error('Rome init failed:', err);
    window.__WORLDS_ENTRY_NET__.recordInitCatch('Rome', err);
    showFatalInitError(err, 'Rome');
  });
}
