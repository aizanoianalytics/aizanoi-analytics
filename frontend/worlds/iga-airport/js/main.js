/**
 * main.js — İGA Istanbul Airport Orchestration & Render Loop
 * Shared Asset Engine Rebuild · Aizanoi Analytics unified worlds runtime
 */

import * as THREE from '../../shared/vendor/three.module.js';

import {
  CITY, SOURCES, REGIONS, STREETS, BUILDINGS, WATERS,
  TELEPORTS, SPAWN, BOUNDS, TOUR_STOPS,
} from './airport-data.js';

import { getMaterial, getEvidenceMaterial } from '../../shared/assets/materials.js';
import { buildStructure } from './builders.js';
import { Environment } from '../../shared/engine/environment.js';
import { ParticleSystem } from '../../shared/engine/particles.js';
import { CollisionSystem, PLAYER_HEIGHT } from '../../shared/engine/collision.js';
import { Controls, inputState } from '../../shared/engine/controls.js';
import { AudioSystem } from '../../shared/engine/audio.js';
import { UISystem } from '../../shared/engine/ui.js';
import { TourSystem } from '../../shared/engine/tour.js';
import { IntroSequence } from '../../shared/engine/intro.js';
import {
  buildModernAirliner,
  buildBaggageTug,
  buildFuelTruck,
  buildRunwayApproachLights,
} from '../../shared/assets/props.js';
import { AirportTrafficSystem } from './aircraft.js';


  // Dense sample points along rivers + springs — feeds proximity-based water ambience
  const WATER_POINTS = (() => {
    const pts = [];
    for (const w of (WATERS || [])) {
      if (Array.isArray(w.points)) {
        for (const p of w.points) pts.push({ x: p.x, z: p.z });
        // densify segments (two-corner rivers are coarse; midpoint raises resolution)
        for (let i = 0; i < w.points.length - 1; i++) {
          const a = w.points[i], b = w.points[i + 1];
          pts.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
        }
      } else if (typeof w.x === 'number' && typeof w.z === 'number') {
        pts.push({ x: w.x, z: w.z });
      }
    }
    return pts;
  })();
let renderer, scene, camera, clock;
let environment, particles, collision, controls, audio, ui, tour, intro, traffic;
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

  setProgress(10, 'Starting Istanbul Airport...');

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
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 2. Scene & Camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.3, 4000);
  camera.position.set(SPAWN.x, PLAYER_HEIGHT, SPAWN.z);
  clock = new THREE.Clock();

  setProgress(25, 'Laying apron and airfield surfaces...');

  // 3. Ground plane (Airport Tarmac)
  const groundGeo = new THREE.PlaneGeometry(
    BOUNDS.maxX - BOUNDS.minX + 400,
    BOUNDS.maxZ - BOUNDS.minZ + 400,
    32, 32
  );
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(
    (BOUNDS.minX + BOUNDS.maxX) / 2,
    0,
    (BOUNDS.minZ + BOUNDS.maxZ) / 2
  );
  const groundMesh = new THREE.Mesh(groundGeo, getMaterial('tarmac'));
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  setProgress(45, 'Building terminal circulation axes...');

  // 4. Roads
  buildAirportRoads();

  setProgress(60, 'Building the main terminal and tulip-inspired control tower...');

  // 5. Buildings
  buildAllBuildings();

  setProgress(80, 'Setting lighting and atmosphere...');

  // 6. Environment (Clear day, noon sunlight)
  environment = new Environment(scene, renderer, { startTime: 0.48, cycleSpeed: 0.0 });

  // 7. Particles & Audio
  particles = new ParticleSystem(scene);
  audio = new AudioSystem();

  // 8. Collision
  collision = new CollisionSystem();
  collision.buildFromData(BUILDINGS, STREETS, BOUNDS);

  // 9. Apron Airliners & Ground Service Equipment Props
  populateAirportApron();
  traffic = new AirportTrafficSystem(scene, collision);
  traffic.init();

  // 10. Controls
  controls = new Controls(camera, canvas, document.body);

  // 11. UI & Tour
  ui = new UISystem(
    { CITY, SOURCES, REGIONS, BUILDINGS, TELEPORTS, BOUNDS, WATERS },
    camera,
    collision
  );
  ui.initMinimap();

  tour = new TourSystem(TOUR_STOPS, controls, ui);

  // 11. Cinematic Intro (High aerial overview of runways and terminal)
  intro = new IntroSequence(camera, scene, controls, {
    heading:  CITY.title,
    subtitle: 'Present-Day Global Aviation Gateway · Interactive Walkthrough',
  });
  intro.curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-250, 240, 1030), // High above Tulip Tower
    new THREE.Vector3(0, 120, 500),      // Over Pier concourses
    new THREE.Vector3(0, 50, 100),      // Descending into Terminal volume
    new THREE.Vector3(0, 15, -150),     // Check-in hall avenue
    new THREE.Vector3(SPAWN.x, 1.7, SPAWN.z), // Touchdown at Curbside Plaza
  ]);
  intro.lookAtCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 38, 0),        // Looking toward Grand Terminal
    new THREE.Vector3(0, 20, 200),
    new THREE.Vector3(0, 10, -50),
    new THREE.Vector3(0, 5, -270),
    new THREE.Vector3(0, 1.7, 0),
  ]);

  intro.onComplete = () => {
    controls.enable();
    audio.init();
    audio.setSoundset('airport');
    isRunning = true;
  };

  bindEvents();
  installWorldDebugHandle();
  setProgress(100, 'Istanbul Airport ready!');

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

function buildAirportRoads() {
  const roadMat = getMaterial('road', { color: 0x2b3036 });
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

function buildAllBuildings() {
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

/* ── Apron Airliners & Ground Support Equipment Dressing ──── */

function populateAirportApron() {
  const apronGroup = new THREE.Group();
  apronGroup.name = 'airport-apron-props';

  // 1. Commercial Passenger Jets (Turkish Red Livery) at Pier Gates
  const aircraftStands = [
    // Pier West (International Pier A-B) Outer Gates
    // Note: Gate 1 at (-555, 420) is managed dynamically by AirportTrafficSystem (pushback + tug sequence)
    { x: -555, z: 600, rot: -Math.PI / 2, tug: true, fuel: false },
    { x: -555, z: 780, rot: -Math.PI / 2, tug: false, fuel: true },
    // Pier West Inner Gates
    { x: -385, z: 510, rot: Math.PI / 2, tug: true, fuel: true },
    { x: -385, z: 690, rot: Math.PI / 2, tug: false, fuel: false },

    // Pier East (International Pier C-F) Outer Gates
    { x: 555, z: 420, rot: Math.PI / 2, tug: true, fuel: true },
    { x: 555, z: 600, rot: Math.PI / 2, tug: false, fuel: true },
    { x: 555, z: 780, rot: Math.PI / 2, tug: true, fuel: false },
    // Pier East Inner Gates
    { x: 385, z: 510, rot: -Math.PI / 2, tug: true, fuel: true },
    { x: 385, z: 690, rot: -Math.PI / 2, tug: false, fuel: false },

    // Apron West Remote Stands
    { x: -470, z: 1060, rot: 0, tug: true, fuel: true },
    { x: -380, z: 1060, rot: 0, tug: true, fuel: false },

    // Apron East Remote Stands
    { x: 470, z: 1060, rot: 0, tug: true, fuel: true },
    { x: 380, z: 1060, rot: 0, tug: true, fuel: false },
  ];

  for (let i = 0; i < aircraftStands.length; i++) {
    const s = aircraftStands[i];
    const airliner = buildModernAirliner(s.x, s.z, s.rot);
    apronGroup.add(airliner);

    // Collision for airliner fuselage (length 58m, width ~6m)
    const isEW = Math.abs(Math.sin(s.rot)) > 0.5;
    collision.grid.insert({
      type: 'rect', id: `airliner-${i}`,
      x: s.x, z: s.z,
      w: isEW ? 58 : 10, d: isEW ? 10 : 58, h: 8, y: 0
    });

    // Ground Support Equipment (GSE)
    if (s.tug) {
      const tugOffsetX = isEW ? (Math.cos(s.rot) > 0 ? 26 : -26) : 6;
      const tugOffsetZ = isEW ? 6 : (Math.cos(s.rot) > 0 ? -26 : 26);
      apronGroup.add(buildBaggageTug(s.x + tugOffsetX, s.z + tugOffsetZ, s.rot + 0.3));
    }

    if (s.fuel) {
      const fuelOffsetX = isEW ? 12 : -18;
      const fuelOffsetZ = isEW ? -18 : 12;
      apronGroup.add(buildFuelTruck(s.x + fuelOffsetX, s.z + fuelOffsetZ, s.rot + Math.PI / 2));
    }
  }

  // 2. Runway Threshold & Approach Light Bars
  // Runway 16R/34L and 17L/35R approach bars
  const lightBars = [
    { x: -650, z: 1200, color: 0x00e676 }, // Green threshold
    { x: -650, z: 1230, color: 0xffffff },
    { x: -650, z: 1260, color: 0xffffff },
    { x: 650, z: 1200, color: 0x00e676 },  // Green threshold
    { x: 650, z: 1230, color: 0xffffff },
    { x: 650, z: 1260, color: 0xffffff },
  ];
  for (const lb of lightBars) {
    apronGroup.add(buildRunwayApproachLights(lb.x, lb.z, 0, lb.color));
  }

  scene.add(apronGroup);
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
        audio.setSoundset('airport');
      } catch (err) {
        console.warn('enter sequence: non-fatal', err);
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
    ui.hideTeleportMenu();
  };
}

function installWorldDebugHandle() {
  window.__WORLD_DEBUG__ = {
    id: 'iga',
    get ready() { return Boolean(renderer && camera && controls && collision && ui); },
    audio,
    get camera() { return camera; },
    get controls() { return controls; },
    get traffic() { return traffic; },
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
  const hit = collision.raycast(camera.position, dir, 100);
  let b = null;
  if (hit) {
    // Colliders use suffixed ids (terminal-wall-*, pier-*, ...) — match by parent prefix.
    b = BUILDINGS.find(item => item.id === hit.id || hit.id.startsWith(`${item.id}-`));
  }
  if (!b) {
    // Fallback: rays can run the length of open piers. Prefer the last teleport target,
    // then the nearest landmark.
    const lastId = window.__WORLD_LAST_TELEPORT__;
    if (lastId) b = BUILDINGS.find(item => item.id === lastId);
    if (!b) {
      let best = null;
      let bestD = 120 * 120;
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

function render() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (traffic) {
    traffic.update(dt, environment?.isNight ?? false, camera.position);
  }

  if (intro && !intro.isComplete) {
    intro.update(dt);
    environment.update(dt, camera.position);
    particles.update(dt, camera.position, environment.isNight);
    renderer.render(scene, camera);
    return;
  }

  controls.update(dt);

  if (tour.isActive) tour.update(dt);

  if (controls.enabled && !tour._isFlying) {
    const moveVec = controls.getMovementVector(dt);
    const wasAirborne = !collision.onGround;
    const velBefore = collision.playerVelocityY;
    collision.moveAndSlide(camera.position, moveVec, dt);
    const jump = controls.getJumpImpulse();
    if (jump > 0) {
      collision.jump(jump);
      audio.jump();
    }
    // Landing thud: airborne -> grounded transition this frame
    if (wasAirborne && collision.onGround && velBefore < -3) {
      audio.land(-velBefore);
    }
  }

  environment.update(dt, camera.position);
  particles.update(dt, camera.position, environment.isNight);

  const isMoving = Math.abs(inputState.forward) > 0.1 || Math.abs(inputState.strafe) > 0.1;
  audio.update(dt, camera.position, environment.isNight, isMoving, inputState.run, {
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

init().catch(err => console.error('Istanbul Airport init failed:', err));
