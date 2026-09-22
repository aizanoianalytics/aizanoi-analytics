import * as THREE from '../../worlds/shared/vendor/three.module.js';
import { GLTFLoader } from '../../worlds/shared/vendor/GLTFLoader.js';
import { createEnvironment } from './environment.js';
import { AudioSystem } from '../../worlds/shared/engine/audio.js';
import { SpectatorBridge } from '../fly-simulation/index.js';

const canvas = document.querySelector('#world');
const fatal = document.querySelector('#fatal');
const statusEl = document.querySelector('#observer-status');
const researchEl = document.querySelector('#research-telemetry');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
window.__FLY_SCENE__ = scene;
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
    canvas.addEventListener('click', () => {
      canvas.focus({ preventScroll: true });
      canvas.requestPointerLock?.();
    });
    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== canvas) return;
      this.yaw += event.movementX * .002;
      this.pitch -= event.movementY * .002;
      this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch));
    });
    addEventListener('keydown', (event) => {
      if (document.activeElement !== canvas && document.pointerLockElement !== canvas) return;
      this.keys.add(event.code);
      if (/^(Key[WASDQERN]|ShiftLeft|ShiftRight)$/.test(event.code)) event.preventDefault();
      if (event.code === 'KeyR') this.reset();
      if (event.code === 'KeyN' && !event.repeat) {
        this.noClip = !this.noClip;
        this.syncStatus();
      }
    });
    addEventListener('keyup', (event) => this.keys.delete(event.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.keys.clear();
    });
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

function updateResearchTelemetry(frame) {
  if (!researchEl) return;
  const sensors = frame.state?.sensors?.channels ?? {};
  const odor = sensors.olfaction ?? {};
  const vision = sensors.vision ?? {};
  const controllerState = frame.state?.controllerState ?? {};
  const compact = {
    flyId: frame.flyId, controller: frame.metadata?.controller ?? 'unknown', version: frame.metadata?.version ?? frame.metadata?.controllerVersion ?? 'unknown',
    state: controllerState.fsmState ?? controllerState.state ?? 'n/a', tick: frame.sequence, simulationTime: frame.state?.time ?? frame.time ?? null,
    room: frame.state?.room ?? null, bodyPhase: frame.state?.contact?.phase ?? null, speed: frame.state?.velocity?.speed ?? null,
    contact: frame.state?.contact?.grounded ?? false, odor: { center: odor.centerConcentration ?? odor.value ?? null, left: odor.leftConcentration ?? null, right: odor.rightConcentration ?? null, gradient: odor.lateralGradient ?? null },
    taste: sensors.taste?.value ?? null, looming: vision.looming ?? null, lc4: controllerState.lc4Activity ?? null, dn: controllerState.dnActivity ?? null,
    motor: frame.state?.motor ?? null, checkpoint: frame.state?.checkpointStatus?.version ?? null, physicsHash: frame.state?.checkpointStatus?.physicsArtifactHash ?? null,
    graphHash: frame.state?.checkpointStatus?.connectomeGraphHash ?? null, lag: frame.lag?.lagSeconds ?? frame.lag ?? null, discontinuities: frame.state?.checkpointStatus?.scheduler?.discontinuityCount ?? null,
  };
  window.__FLY_RAW_TELEMETRY__ = frame;
  researchEl.textContent = Object.entries(compact).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value ?? 'UNAVAILABLE'}`).join('\\n');
}

function createFlyVisual() {
  const fly = new THREE.Group();
  fly.name = 'TELEMETRY_SPECTATOR_FLY';
  const dark = new THREE.MeshStandardMaterial({ color: 0x21160f, roughness: .82 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x321b48, roughness: .4, emissive: 0x160820, emissiveIntensity: .35 });
  const wing = new THREE.MeshStandardMaterial({ color: 0xc9e6df, transparent: true, opacity: .42, side: THREE.DoubleSide });
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(.00105, 10, 8), dark);
  thorax.name = 'fly-thorax'; fly.add(thorax);
  const abdomen = new THREE.Mesh(new THREE.CapsuleGeometry(.00072, .0021, 4, 8), dark);
  abdomen.name = 'fly-abdomen'; abdomen.rotation.y = Math.PI / 2; abdomen.position.y = -.00145; fly.add(abdomen);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.00078, 10, 8), dark);
  head.name = 'fly-head'; head.position.y = .00115; fly.add(head);
  for (const side of [-1, 1]) {
    const eyeMesh = new THREE.Mesh(new THREE.SphereGeometry(.00043, 8, 6), eye);
    eyeMesh.position.set(side * .00057, .00135, .00012); fly.add(eyeMesh);
    for (const z of [-.00035, 0, .00035]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(.000055, .000035, .0024, 5), dark);
      leg.position.set(side * .00075, 0, z); leg.rotation.z = side * .95; leg.rotation.x = .35; fly.add(leg);
    }
    const wingMesh = new THREE.Mesh(new THREE.PlaneGeometry(.0028, .0011), wing);
    wingMesh.position.set(side * .0007, .0001, .00042); wingMesh.rotation.set(.22, side * .28, side * .34); fly.add(wingMesh);
  }
  return fly;
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

  // The browser is a spectator only. A host must explicitly provide a WebSocket
  // URL; production has no default and reports telemetry as inactive.
  const bridge = new SpectatorBridge({ environmentIdentity: { environmentHash: environment.meta.artifactHashes.environmentSource, glbHash: environment.meta.artifactHashes.flyHouseGlb } });
  window.__FLY_SPECTATOR_BRIDGE__ = bridge;
  const config = window.__FLY_TELEMETRY_CONFIG__;
  const simulationStatus = document.querySelector('#simulation-status');
  const cameraModeEl = document.querySelector('#fly-camera-mode');
  let cameraMode = cameraModeEl?.value ?? 'FREE OBSERVER';
  const latestFrames = new Map();
  const flyMeshes = new Map();
  let telemetrySocket = null;
  cameraModeEl?.addEventListener('change', () => { cameraMode = cameraModeEl.value; });
  addEventListener('keydown', (event) => { if (event.code === 'Digit1') cameraMode = 'FREE OBSERVER'; if (event.code === 'Digit2') cameraMode = 'FOLLOW FLY'; if (event.code === 'Digit3') cameraMode = 'FLY-SCALE FOLLOW'; if (event.code === 'Digit4') cameraMode = 'OVERHEAD'; if (cameraModeEl) cameraModeEl.value = cameraMode; });
  const applyCameraMode = () => {
    if (cameraMode === 'FREE OBSERVER') return;
    const frame = latestFrames.get(bridge.activeFlyId);
    const position = frame?.state?.position;
    if (!Array.isArray(position) || position.length !== 3) return;
    const target = new THREE.Vector3(...position);
    const offset = cameraMode === 'OVERHEAD' ? new THREE.Vector3(0, 0, 3.5) : cameraMode === 'FLY-SCALE FOLLOW' ? new THREE.Vector3(0, -.007, .003) : new THREE.Vector3(0, -.035, .02);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  };
  if (!config?.url) {
    if (simulationStatus) simulationStatus.textContent = 'Telemetry inactive · no host-provided spectator service configured';
  } else {
    telemetrySocket = new WebSocket(config.url);
    window.__FLY_TELEMETRY_SOCKET__ = telemetrySocket;
    telemetrySocket.addEventListener('message', (event) => {
      try {
        const frame = JSON.parse(event.data);
        if (frame.version !== 'telemetry-1' || typeof frame.flyId !== 'string' || !frame.state?.position) return;
        latestFrames.set(frame.flyId, frame);
        let flyMesh = flyMeshes.get(frame.flyId);
        if (!flyMesh) {
          flyMesh = createFlyVisual(); flyMesh.castShadow = true; scene.add(flyMesh); flyMeshes.set(frame.flyId, flyMesh);
        }
        if (bridge.ingest(frame) && simulationStatus) simulationStatus.textContent = 'Telemetry active · read-only spectator';
        if (bridge.frames.at(-1) === frame || bridge.frames.at(-1)?.sequence === frame.sequence) updateResearchTelemetry(frame);
      } catch (error) { console.warn('Ignoring malformed telemetry', error); }
    });
    const markTelemetryInactive = (message) => { if (simulationStatus) simulationStatus.textContent = message; };
    telemetrySocket.addEventListener('error', () => markTelemetryInactive('Telemetry inactive · service error'));
    telemetrySocket.addEventListener('close', () => { telemetrySocket = null; markTelemetryInactive('Telemetry inactive · service disconnected'); });
    window.addEventListener('pagehide', () => {
      if (telemetrySocket && telemetrySocket.readyState < WebSocket.CLOSING) telemetrySocket.close(1000, 'pagehide');
    }, { once: true });
  }

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
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), .05);
    observer.update(dt);
    applyCameraMode();
    for (const [flyId, flyMesh] of flyMeshes) bridge.render(flyMesh, .5, flyId);
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
