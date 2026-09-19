import * as THREE from '../../worlds/shared/vendor/three.module.js';
import { GLTFLoader } from '../../worlds/shared/vendor/GLTFLoader.js';
import { createEnvironment } from './environment.js';
import { AudioSystem } from '../../worlds/shared/engine/audio.js';
import { BodyState, FixedStepScheduler, HeuristicTestController, Vec3, createBrowserSimulation, createFlyWorldEnvironmentAdapter } from '../fly-simulation/index.mjs';

const canvas = document.querySelector('#world');
const fatal = document.querySelector('#fatal');
const statusEl = document.querySelector('#observer-status');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x272119);
scene.fog = new THREE.Fog(0x272119, 15, 38);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.015, 100);
camera.up.set(0, 0, 1);

const colliders = [];
let environment;
const observerRadius = 0.21;
const zMin = 0.22;
const zMax = 2.62;

function addCollider(object) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (!bounds.isEmpty()) colliders.push({ bounds, name: object.name });
}

function collectCollisionRoots(root) {
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = !/^(plaster-wear|floor-marble|carpet-motif)/.test(object.name);
      object.receiveShadow = !/^(WALL__|CEILING__)/.test(object.name);
    }
  });

  root.traverse((object) => {
    const collision = object.userData?.collision;
    if (collision === 'solid') {
      if (object.name !== 'stove-pipe') addCollider(object);
      return;
    }
    if (collision === 'none') return;
    const byName = /^(WALL__|CEILING__|window-glass|bedroom-window|ASSET__)/.test(object.name || '');
    if (byName) addCollider(object);
  });
}

function sphereIntersectsBox(position, radius, box) {
  const closest = position.clone().clamp(box.min, box.max);
  return closest.distanceToSquared(position) < radius * radius;
}

class Observer {
  constructor() {
    this.keys = new Set();
    this.speed = 2.35;
    this.noClip = false;
    this.reset();
    canvas.addEventListener('click', () => canvas.requestPointerLock?.());
    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== canvas) return;
      this.yaw += event.movementX * .002;
      this.pitch -= event.movementY * .002;
      this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch));
    });
    addEventListener('keydown', (event) => {
      this.keys.add(event.code);
      if (event.code === 'KeyR') this.reset();
      if (event.code === 'KeyN' && !event.repeat) {
        this.noClip = !this.noClip;
        this.syncStatus();
      }
    });
    addEventListener('keyup', (event) => this.keys.delete(event.code));
    this.syncStatus();
  }

  syncStatus() {
    if (statusEl) statusEl.textContent = this.noClip
      ? 'Blender house v0.3 · DEBUG NOCLIP'
      : `Blender house v0.3 · collision ON · ${colliders.length} collider roots`;
  }

  reset() {
    camera.position.set(-1.85, -2.15, 1.58);
    this.yaw = .74;
    this.pitch = -.05;
  }

  frameCamera(x, y, z, yaw, pitch = -.04) {
    camera.position.set(x, y, z);
    this.yaw = yaw;
    this.pitch = Math.max(-1.48, Math.min(1.48, pitch));
  }

  blocked(position) {
    if (this.noClip) return false;
    if (position.z < zMin || position.z > zMax) return true;
    return environment.collisionAt(position, observerRadius);
  }

  tryMove(delta) {
    if (this.noClip) {
      camera.position.add(delta);
      return;
    }
    for (const axis of [
      new THREE.Vector3(delta.x, 0, 0),
      new THREE.Vector3(0, delta.y, 0),
      new THREE.Vector3(0, 0, delta.z),
    ]) {
      const candidate = camera.position.clone().add(axis);
      if (!this.blocked(candidate)) camera.position.copy(candidate);
    }
  }

  update(dt) {
    const horizontal = Math.cos(this.pitch);
    const forward = new THREE.Vector3(
      Math.sin(this.yaw) * horizontal,
      Math.cos(this.yaw) * horizontal,
      Math.sin(this.pitch),
    ).normalize();
    const flatForward = new THREE.Vector3(forward.x, forward.y, 0).normalize();
    const right = new THREE.Vector3().crossVectors(flatForward, new THREE.Vector3(0, 0, 1)).normalize();
    const step = this.speed * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 2.4 : 1) * dt;
    const delta = new THREE.Vector3();
    if (this.keys.has('KeyW')) delta.addScaledVector(flatForward, step);
    if (this.keys.has('KeyS')) delta.addScaledVector(flatForward, -step);
    if (this.keys.has('KeyA')) delta.addScaledVector(right, -step);
    if (this.keys.has('KeyD')) delta.addScaledVector(right, step);
    if (this.keys.has('KeyE')) delta.z += step;
    if (this.keys.has('KeyQ')) delta.z -= step;
    this.tryMove(delta);
    camera.lookAt(camera.position.clone().add(forward));
  }
}

function lighting() {
  scene.add(new THREE.HemisphereLight(0xb9d2e1, 0x4a3426, 1.02));
  const sun = new THREE.DirectionalLight(0xffdfba, 1.75);
  sun.position.set(-6, -5, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.bias = 0.0008;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);

  const windowFill = new THREE.PointLight(0xa8d5ff, 2.9, 7, 2);
  windowFill.position.set(-3.6, -.7, 1.65);
  scene.add(windowFill);

  const stove = new THREE.PointLight(0xff6525, 7.2, 4, 2);
  stove.position.set(2.25, -.02, .62);
  stove.castShadow = true;
  scene.add(stove);

  const bedroom = new THREE.PointLight(0xffb45a, 4.2, 4.2, 2);
  bedroom.position.set(5.18, 2.35, 1.42);
  scene.add(bedroom);
}

async function boot() {
  lighting();
  const loader = new GLTFLoader();
  const loadStarted = performance.now();
  const gltf = await loader.loadAsync(new URL('./assets/fly-house.glb', import.meta.url).toString());
  gltf.scene.name = 'FLY_HOUSE_BLENDER_ROOT';
  scene.add(gltf.scene);
  collectCollisionRoots(gltf.scene);
  const response = await fetch(new URL('./assets/environment.json', import.meta.url));
  if (!response.ok) throw new Error(`Environment metadata HTTP ${response.status}`);
  const environmentSpec = await response.json();
  environment = createEnvironment(gltf.scene, environmentSpec);
  // Public, read-only diagnostics for the Stage A browser contract; the
  // underscored aliases remain for existing focused tests and tooling.
  window.FLY_ENVIRONMENT = environment;
  window.__FLY_ENVIRONMENT__ = environment;

  // Stage B is a read-only spectator bridge: it consumes authored environment
  // raycasts and telemetry, but never owns camera controls or sends fly commands.
  const safeSpawn = environment.integration.safeSpawnVolumes[0];
  const spawn = safeSpawn.bounds[0].map((value, index) => (value + safeSpawn.bounds[1][index]) / 2);
  const simulationEnvironment = createFlyWorldEnvironmentAdapter({
    environmentHash: environmentSpec.artifactHashes?.environmentSource ?? environmentSpec.sourceHashes?.['gelistirmeler/2026-09-16-fly-world-prototype/scene_spec.json'],
    glbHash: environmentSpec.artifactHashes?.flyHouseGlb,
    schemaVersion: `fly-world-environment-${environment.schemaVersion}`,
    downDirection: [0, 0, -1],
    raycast: environment.integration.raycast,
    roomAt: environment.integration.roomAt,
    zonesAt: environment.integration.zonesAt,
  });
  const spectator = createBrowserSimulation(simulationEnvironment, { fixedDt: environment.integration.tick.fixedDeltaSeconds, gravity: new Vec3(0, 0, -9.81), downDirection: [0, 0, -1] });
  const flyId = 'fly-house-demo';
  spectator.simulation.addFly({ flyId, body: new BodyState({ position: { x: spawn[0], y: spawn[1], z: spawn[2] }, radius: .025 }) });
  const controller = new HeuristicTestController();
  const scheduler = new FixedStepScheduler(spectator.simulation, { onStep: (sim) => {
    const live = sim.getFly(flyId);
    sim.setMotors(flyId, controller.motorFromSensor(live.sensors));
    const snapshot = sim.telemetrySnapshot(flyId, { lagSeconds: scheduler.lag, controller: controller.name });
    spectator.bridge.ingest({ version: 'telemetry-1', sequence: snapshot.tick, flyId, state: { position: snapshot.transform.position, orientation: snapshot.transform.orientation, room: snapshot.room, contact: snapshot.contact }, metadata: { controller: controller.name, provenance: 'MODELLED' }, lag: scheduler.lag });
  } });
  const flyMesh = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0x5c2800, emissiveIntensity: 1.2 }));
  flyMesh.name = 'AUTHORITATIVE_FLY_MESH'; flyMesh.castShadow = true; scene.add(flyMesh);
  window.__FLY_SPECTATOR_BRIDGE__ = spectator.bridge;
  window.__FLY_SIMULATION__ = Object.freeze({ simulation: spectator.simulation, bridge: spectator.bridge, authority: spectator.bridge.authority });
  const simulationStatus = document.querySelector('#simulation-status');
  if (simulationStatus) simulationStatus.textContent = 'Simulation spectator · HEURISTIC TEST CONTROLLER · MODELLED · read-only';
  // Authoritative ticks are wall-clock scheduled independently of render FPS.
  const simulationTimer = setInterval(() => {
    scheduler.advanceWallClock(spectator.simulation.fixedDt);
    const status = scheduler.status();
    const live = spectator.simulation.getFly(flyId);
    if (simulationStatus) simulationStatus.textContent = `Fly ${spectator.simulation.tick} · ${live.room ?? 'no-room'} · ${controller.name} · lag ${(status.lagSeconds * 1000).toFixed(1)}ms`;
  }, spectator.simulation.fixedDt * 1000);

  let meshCount = 0;
  let triangleCount = 0;
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    meshCount += 1;
    const index = object.geometry.index;
    triangleCount += index ? index.count / 3 : object.geometry.attributes.position.count / 3;
  });
  const metrics = { mode: 'glb', meshCount, triangleCount, colliderRoots: colliders.length, loadMs: Math.round(performance.now() - loadStarted), fps: 0, drawCalls: 0, animationTicks: 0 };
  window.FLY_DEBUG = metrics;
  window.__FLY_DEBUG__ = metrics;

  const observer = new Observer();
  metrics.environment = environment;
  metrics.observer = observer;
  metrics.camera = camera;
  metrics.frameCamera = (x, y, z, yaw, pitch = -.04) => observer.frameCamera(x, y, z, yaw, pitch);
  metrics.collisionAt = (x, y, z = 1.58) => observer.blocked(new THREE.Vector3(x, y, z));

  // Procedural room tone: same contract as the main-v3 fallback (flyworld
  // soundset, wood footsteps). Inits on first click (user gesture).
  const audio = new AudioSystem();
  audio.setSoundset('flyworld');
  window.__FLY_AUDIO__ = audio;
  canvas.addEventListener('click', () => {
    audio.init();
    audio.resume();
  }, { once: true });

  const clock = new THREE.Clock();
  let frames = 0;
  let fpsAt = performance.now();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), .05);
    observer.update(dt);
    spectator.bridge.render(flyMesh, .5);
    const status = scheduler.status();
    if (simulationStatus) simulationStatus.textContent = `Fly ${spectator.simulation.tick} · ${spectator.simulation.getFly(flyId).room ?? 'no-room'} · ${controller.name} · lag ${(status.lagSeconds * 1000).toFixed(1)}ms`;
    if (window.__FLY_AUDIO__) {
      const keys = observer.keys;
      const isMoving = keys.has('KeyW') || keys.has('KeyS') || keys.has('KeyA') || keys.has('KeyD');
      const isRunning = isMoving && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
      window.__FLY_AUDIO__.update(dt, camera.position, false, isMoving, isRunning, { surface: 'wood' });
    }
    renderer.render(scene, camera);
    frames += 1;
    metrics.animationTicks += 1;
    const now = performance.now();
    if (now - fpsAt >= 1000) {
      metrics.fps = Math.round(frames * 1000 / (now - fpsAt));
      metrics.drawCalls = renderer.info.render.calls;
      frames = 0;
      fpsAt = now;
    }
  });
}

boot().catch((error) => {
  console.error(error);
  if (fatal) {
    fatal.hidden = false;
    fatal.textContent = `Fly House GLB failed to initialize: ${error?.stack || error}`;
  }
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
});
