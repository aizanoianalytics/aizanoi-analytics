import * as THREE from '../../worlds/shared/vendor/three.module.js';
import { GLTFLoader } from '../../worlds/shared/vendor/GLTFLoader.js';
import { FrameMetrics } from '../../worlds/shared/engine/loop.js';
import { AdaptiveResolution } from '../../worlds/shared/engine/quality.js';

const canvas = document.querySelector('#world');
const fatal = document.querySelector('#fatal');
const titleSpan = document.querySelector('header h1 span');
const statusEl = document.querySelector('header .status');

function detectSoftwareGL() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

// Software rasterizers (SwiftShader/llvmpipe) and weak iGPUs drown in MSAA
// fill cost: this interior is 20k tris, so pixels — not geometry — dominate.
const softwareGL = detectSoftwareGL();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !softwareGL, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, softwareGL ? 1 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x211d18);
scene.fog = new THREE.Fog(0x211d18, 9, 23);

// Y-up: matches the Blender-exported fly-house.glb (+Y up). The legacy
// procedural fallback below is authored in the same Y-up convention.
const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.015, 80);

const MATERIALS = {
  'warm-aged-plaster': new THREE.MeshStandardMaterial({ color: 0xd8ccb8, roughness: 0.94 }),
  'aged-white-plaster': new THREE.MeshStandardMaterial({ color: 0xdad5ca, roughness: 0.96 }),
  'aged-green-floor': new THREE.MeshStandardMaterial({ color: 0x737664, roughness: 0.91 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x754231, roughness: 0.72 }),
  textile: new THREE.MeshStandardMaterial({ color: 0x887054, roughness: 0.94 }),
  rug: new THREE.MeshStandardMaterial({ color: 0x8a4d31, roughness: 0.98 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x332d2b, metalness: 0.6, roughness: 0.62 }),
  proxyBlue: new THREE.MeshStandardMaterial({ color: 0x52758a, roughness: 0.88 }),
};

// Procedural fallback: same room shell + proxy heroes as the original
// blockout, parented under one group so the GLB primary can replace it.
const fallbackGroup = new THREE.Group();
fallbackGroup.name = 'procedural-fallback';

function box(size, position, material, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  fallbackGroup.add(mesh);
  return mesh;
}

function addWallX(x, z0, z1, y0, y1, material, name) {
  return box([0.12, y1 - y0, z1 - z0], [x, (y0 + y1) / 2, (z0 + z1) / 2], material, name);
}

function addWallZ(z, x0, x1, y0, y1, material, name) {
  return box([x1 - x0, y1 - y0, 0.12], [(x0 + x1) / 2, (y0 + y1) / 2, z], material, name);
}

function buildMainRoom() {
  const wall = MATERIALS['warm-aged-plaster'];
  box([7.6, 0.08, 5.6], [0, -0.04, 0], MATERIALS['aged-green-floor'], 'main-floor');
  addWallZ(2.8, -3.8, 3.8, 0, 2.7, wall, 'main-north');
  addWallZ(-2.8, -3.8, 3.8, 0, 2.7, wall, 'main-south');
  addWallX(-3.8, -2.8, -1.63, 0, 2.7, wall, 'west-a');
  addWallX(-3.8, 0.13, 2.8, 0, 2.7, wall, 'west-b');
  addWallX(-3.8, -1.63, 0.13, 0, 0.72, wall, 'west-sill');
  addWallX(-3.8, -1.63, 0.13, 2.17, 2.7, wall, 'west-head');
  addWallX(3.8, -2.8, 0.39, 0, 2.7, wall, 'east-a');
  addWallX(3.8, 1.51, 2.8, 0, 2.7, wall, 'east-b');
  addWallX(3.8, 0.39, 1.51, 2.1, 2.7, wall, 'east-head');
}

function buildBedroom() {
  const wall = MATERIALS['warm-aged-plaster'];
  box([3.5, 0.08, 4.6], [5.55, -0.04, 1.1], MATERIALS['aged-green-floor'], 'bed-floor');
  addWallX(7.3, -1.2, 3.4, 0, 2.7, wall, 'bed-east');
  addWallZ(-1.2, 3.8, 7.3, 0, 2.7, wall, 'bed-south');
  addWallZ(3.4, 3.8, 4.58, 0, 2.7, wall, 'bed-north-a');
  addWallZ(3.4, 5.83, 7.3, 0, 2.7, wall, 'bed-north-b');
  addWallZ(3.4, 4.58, 5.83, 0, 0.78, wall, 'bed-north-sill');
  addWallZ(3.4, 4.58, 5.83, 2.13, 2.7, wall, 'bed-north-head');
  addWallX(3.8, -1.2, 0.39, 0, 2.7, wall, 'bed-west-a');
  addWallX(3.8, 1.51, 3.4, 0, 2.7, wall, 'bed-west-b');
  addWallX(3.8, 0.39, 1.51, 2.1, 2.7, wall, 'bed-west-head');
}

function addHeroBlockout() {
  box([3.55, .82, .9], [-.8, .41, 2.05], MATERIALS.textile, 'PROXY__bench-sofa');
  box([4.05, 1.55, .44], [-.65, 1.52, 2.53], MATERIALS.wood, 'PROXY__carved-cabinet');
  box([.95, 1.16, .82], [1.95, .58, .72], MATERIALS.metal, 'PROXY__wood-stove');
  box([1.15, 1.42, .72], [-3.1, .71, -1.75], MATERIALS.wood, 'PROXY__old-tv');
  box([.72, .68, .32], [.65, .34, .25], MATERIALS.proxyBlue, 'PROXY__blue-bag').rotation.y = THREE.MathUtils.degToRad(-10);
  box([4.4, .025, 1.65], [1.15, .018, -1.2], MATERIALS.rug, 'PROXY__main-rug').rotation.y = THREE.MathUtils.degToRad(-5);
  const round = new THREE.Mesh(new THREE.CylinderGeometry(1.025, 1.025, .025, 48), new THREE.MeshStandardMaterial({ color: 0x80704d, roughness: .96 }));
  round.position.set(-.45, .018, -2.05);
  round.receiveShadow = true;
  round.name = 'PROXY__round-rug';
  fallbackGroup.add(round);
  box([1.65, .62, 2.05], [5.95, .31, 1.7], MATERIALS.wood, 'PROXY__wooden-bed');
  box([1.48, .26, 1.9], [5.95, .75, 1.7], new THREE.MeshStandardMaterial({ color: 0x985f4d, roughness: .96 }), 'PROXY__bed-quilt');
  box([.58, .84, .52], [4.55, .42, 2.25], MATERIALS.wood, 'PROXY__bedside-table');
  box([.95, 1.55, .32], [6.75, .775, 3.13], MATERIALS.wood, 'PROXY__bookshelf');
}

function addStovePipe() {
  const points = [
    new THREE.Vector3(1.95, 1.18, .72),
    new THREE.Vector3(1.95, 2.28, .72),
    new THREE.Vector3(1.35, 2.48, .72),
    new THREE.Vector3(-2.15, 2.48, .72),
    new THREE.Vector3(-2.55, 2.38, .72),
  ];
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, .115, 12, false), MATERIALS.metal);
  mesh.name = 'blockout-stove-pipe';
  mesh.castShadow = true;
  fallbackGroup.add(mesh);
}

function addLighting() {
  scene.add(new THREE.HemisphereLight(0xb9d5e9, 0x4e392c, 1.15));
  const sun = new THREE.DirectionalLight(0xffe1ba, 2.0);
  sun.position.set(-5, 7, -4);
  sun.castShadow = true;
  const shadowSize = softwareGL ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  scene.add(sun);
  const stove = new THREE.PointLight(0xff6b25, 7.5, 3.2, 2);
  stove.position.set(1.95, .62, .25);
  scene.add(stove);
  const bedroom = new THREE.PointLight(0xffb45a, 4.5, 3.5, 2);
  bedroom.position.set(4.55, 1.35, 2.15);
  scene.add(bedroom);
}

class GhostObserver {
  constructor(viewCamera, domElement) {
    this.camera = viewCamera;
    this.domElement = domElement;
    this.keys = new Set();
    this.speed = 2.6;
    this.reset();
    domElement.addEventListener('click', () => domElement.requestPointerLock?.());
    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== domElement) return;
      this.yaw += event.movementX * .002;
      this.pitch -= event.movementY * .002;
      this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch));
    });
    addEventListener('keydown', (event) => {
      this.keys.add(event.code);
      if (event.code === 'KeyR') this.reset();
    });
    addEventListener('keyup', (event) => this.keys.delete(event.code));
  }

  reset() {
    this.camera.position.set(0.5, 1.6, 2.6);
    this.yaw = 0;
    this.pitch = -.1;
  }

  update(dt) {
    const horizontal = Math.cos(this.pitch);
    const forward = new THREE.Vector3(
      Math.sin(this.yaw) * horizontal,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * horizontal,
    ).normalize();
    const flatForward = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    const right = new THREE.Vector3().crossVectors(flatForward, new THREE.Vector3(0, 1, 0)).normalize();
    const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 3 : 1;
    const step = this.speed * boost * dt;

    if (this.keys.has('KeyW')) this.camera.position.addScaledVector(flatForward, step);
    if (this.keys.has('KeyS')) this.camera.position.addScaledVector(flatForward, -step);
    if (this.keys.has('KeyA')) this.camera.position.addScaledVector(right, -step);
    if (this.keys.has('KeyD')) this.camera.position.addScaledVector(right, step);
    if (this.keys.has('KeyE')) this.camera.position.y += step;
    if (this.keys.has('KeyQ')) this.camera.position.y -= step;

    this.camera.lookAt(this.camera.position.clone().add(forward));
  }
}

const flyT0 = performance.now();
const flyDebug = {
  ready: false,
  mode: 'loading',
  meshes: 0,
  tris: 0,
  hiddenProxies: 0,
  frames: 0,
  fps: 0,
  loadMs: 0,
};
window.__FLY_DEBUG__ = flyDebug;

function auditScene(root) {
  let meshes = 0, tris = 0, hiddenProxies = 0;
  root.traverse((o) => {
    if (o.isMesh) {
      if (o.name.startsWith('PROXY__') && o.visible === false) { hiddenProxies += 1; return; }
      meshes += 1;
      const g = o.geometry;
      tris += g?.index ? g.index.count / 3 : (g?.attributes?.position ? g.attributes.position.count / 3 : 0);
    }
  });
  return { meshes, tris: Math.round(tris), hiddenProxies };
}

try {
  buildMainRoom();
  buildBedroom();
  addHeroBlockout();
  addStovePipe();
  addLighting();
  scene.add(fallbackGroup);

  const observer = new GhostObserver(camera, canvas);
  flyDebug.look = (yaw, pitch) => { observer.yaw = yaw; observer.pitch = pitch; };
  flyDebug.move = (x, y, z) => { observer.camera.position.set(x, y, z); };
  const clock = new THREE.Clock();
  // Same adaptive-resolution system as the historical worlds: pixel-bound
  // rigs (software GL, weak iGPUs) step pixel ratio down instead of dying.
  const frameMetrics = new FrameMetrics();
  const resolutionGovernor = new AdaptiveResolution(renderer, frameMetrics, {
    minRatio: 0.5, maxRatio: Math.max(1, renderer.getPixelRatio()),
  });
  flyDebug.metrics = () => frameMetrics.summary();
  flyDebug.resolutionRatio = () => resolutionGovernor.ratio;
  let fpsMark = 0, framesMark = 0, lastT = performance.now();
  renderer.setAnimationLoop(() => {
    observer.update(Math.min(clock.getDelta(), .05));
    const frameStart = performance.now();
    renderer.render(scene, camera);
    frameMetrics.record(performance.now() - frameStart);
    resolutionGovernor.update();
    flyDebug.frames += 1;
    const elapsed = clock.elapsedTime;
    if (elapsed - fpsMark >= 2) {
      flyDebug.fps = Math.round((flyDebug.frames - framesMark) / (elapsed - fpsMark));
      fpsMark = elapsed;
      framesMark = flyDebug.frames;
    }
    lastT = elapsed;
  });

  // Primary runtime: the Blender-assembled fly-house.glb. The procedural
  // fallback stays only for GLB load failure.
  const glbUrl = new URL('./assets/fly-house.glb', import.meta.url).toString();
  new GLTFLoader().loadAsync(glbUrl).then((gltf) => {
    const model = gltf.scene;
    let hidden = 0;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.name.startsWith('PROXY__')) { o.visible = false; hidden += 1; }
      }
    });
    scene.add(model);
    scene.remove(fallbackGroup);
    if (new URLSearchParams(location.search).has('lowfx')) {
      renderer.shadowMap.enabled = false;
      model.traverse((o) => {
        if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; if (o.material) o.material.needsUpdate = true; }
      });
      scene.traverse((o) => { if (o.isDirectionalLight || o.isPointLight) o.castShadow = false; });
    }
    const audit = auditScene(model);
    flyDebug.ready = true;
    flyDebug.mode = 'glb';
    flyDebug.meshes = audit.meshes;
    flyDebug.tris = audit.tris;
    flyDebug.hiddenProxies = hidden;
    flyDebug.loadMs = Math.round(performance.now() - flyT0);
    if (titleSpan) titleSpan.textContent = 'BLENDER SCENE';
    if (statusEl) statusEl.innerHTML = `<i></i> Ghost observer · GLB live · ${audit.meshes} meshes`;
  }).catch((error) => {
    console.warn('fly-house.glb failed, procedural fallback active:', error);
    const audit = auditScene(fallbackGroup);
    flyDebug.ready = true;
    flyDebug.mode = 'fallback';
    flyDebug.meshes = audit.meshes;
    flyDebug.tris = audit.tris;
    if (statusEl) statusEl.innerHTML = '<i></i> Ghost observer · fallback (GLB missing)';
  });

  flyDebug.drawCalls = () => renderer.info.render.calls;
} catch (error) {
  console.error(error);
  fatal.hidden = false;
  fatal.textContent = `Fly House failed to initialize: ${error?.stack || error}`;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, softwareGL ? 1 : 2));
});