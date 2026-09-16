import * as THREE from '../../worlds/shared/vendor/three.module.js';

const canvas = document.querySelector('#world');
const fatal = document.querySelector('#fatal');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x211d18);
scene.fog = new THREE.Fog(0x211d18, 9, 23);

const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.015, 80);
camera.up.set(0, 0, 1);

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

function box(size, position, material, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addWallX(x, y0, y1, z0, z1, material, name) {
  return box([0.12, y1 - y0, z1 - z0], [x, (y0 + y1) / 2, (z0 + z1) / 2], material, name);
}

function addWallY(y, x0, x1, z0, z1, material, name) {
  return box([x1 - x0, 0.12, z1 - z0], [(x0 + x1) / 2, y, (z0 + z1) / 2], material, name);
}

function buildMainRoom() {
  const wall = MATERIALS['warm-aged-plaster'];
  box([7.6, 5.6, 0.08], [0, 0, -0.04], MATERIALS['aged-green-floor'], 'main-floor');
  addWallY(2.8, -3.8, 3.8, 0, 2.7, wall, 'main-north');
  addWallY(-2.8, -3.8, 3.8, 0, 2.7, wall, 'main-south');
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
  box([3.5, 4.6, 0.08], [5.55, 1.1, -0.04], MATERIALS['aged-green-floor'], 'bed-floor');
  addWallX(7.3, -1.2, 3.4, 0, 2.7, wall, 'bed-east');
  addWallY(-1.2, 3.8, 7.3, 0, 2.7, wall, 'bed-south');
  addWallY(3.4, 3.8, 4.58, 0, 2.7, wall, 'bed-north-a');
  addWallY(3.4, 5.83, 7.3, 0, 2.7, wall, 'bed-north-b');
  addWallY(3.4, 4.58, 5.83, 0, 0.78, wall, 'bed-north-sill');
  addWallY(3.4, 4.58, 5.83, 2.13, 2.7, wall, 'bed-north-head');
  addWallX(3.8, -1.2, 0.39, 0, 2.7, wall, 'bed-west-a');
  addWallX(3.8, 1.51, 3.4, 0, 2.7, wall, 'bed-west-b');
  addWallX(3.8, 0.39, 1.51, 2.1, 2.7, wall, 'bed-west-head');
}

function addHeroBlockout() {
  box([3.55, .9, .82], [-.8, 2.05, .41], MATERIALS.textile, 'PROXY__bench-sofa');
  box([4.05, .44, 1.55], [-.65, 2.53, 1.52], MATERIALS.wood, 'PROXY__carved-cabinet');
  box([.95, .82, 1.16], [1.95, .72, .58], MATERIALS.metal, 'PROXY__wood-stove');
  box([1.15, .72, 1.42], [-3.1, -1.75, .71], MATERIALS.wood, 'PROXY__old-tv');
  box([.72, .32, .68], [.65, .25, .34], MATERIALS.proxyBlue, 'PROXY__blue-bag').rotation.z = THREE.MathUtils.degToRad(-10);
  box([4.4, 1.65, .025], [1.15, -1.2, .018], MATERIALS.rug, 'PROXY__main-rug').rotation.z = THREE.MathUtils.degToRad(-5);
  const round = new THREE.Mesh(new THREE.CylinderGeometry(1.025, 1.025, .025, 48), new THREE.MeshStandardMaterial({ color: 0x80704d, roughness: .96 }));
  round.rotation.x = Math.PI / 2;
  round.position.set(-.45, -2.05, .018);
  round.receiveShadow = true;
  round.name = 'PROXY__round-rug';
  scene.add(round);
  box([1.65, 2.05, .62], [5.95, 1.7, .31], MATERIALS.wood, 'PROXY__wooden-bed');
  box([1.48, 1.9, .26], [5.95, 1.7, .75], new THREE.MeshStandardMaterial({ color: 0x985f4d, roughness: .96 }), 'PROXY__bed-quilt');
  box([.58, .52, .84], [4.55, 2.25, .42], MATERIALS.wood, 'PROXY__bedside-table');
  box([.95, .32, 1.55], [6.75, 3.13, .775], MATERIALS.wood, 'PROXY__bookshelf');
}

function addStovePipe() {
  const points = [
    new THREE.Vector3(1.95, .72, 1.18),
    new THREE.Vector3(1.95, .72, 2.28),
    new THREE.Vector3(1.35, .72, 2.48),
    new THREE.Vector3(-2.15, .72, 2.48),
    new THREE.Vector3(-2.55, .72, 2.38),
  ];
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, .115, 12, false), MATERIALS.metal);
  mesh.name = 'blockout-stove-pipe';
  mesh.castShadow = true;
  scene.add(mesh);
}

function addLighting() {
  scene.add(new THREE.HemisphereLight(0xb9d5e9, 0x4e392c, 1.15));
  const sun = new THREE.DirectionalLight(0xffe1ba, 2.0);
  sun.position.set(-5, -4, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);
  const stove = new THREE.PointLight(0xff6b25, 7.5, 3.2, 2);
  stove.position.set(1.95, .25, .62);
  scene.add(stove);
  const bedroom = new THREE.PointLight(0xffb45a, 4.5, 3.5, 2);
  bedroom.position.set(4.55, 2.15, 1.35);
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
    this.camera.position.set(-1.4, -1.6, 1.55);
    this.yaw = .78;
    this.pitch = -.08;
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
    const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 3 : 1;
    const step = this.speed * boost * dt;

    if (this.keys.has('KeyW')) this.camera.position.addScaledVector(flatForward, step);
    if (this.keys.has('KeyS')) this.camera.position.addScaledVector(flatForward, -step);
    if (this.keys.has('KeyA')) this.camera.position.addScaledVector(right, -step);
    if (this.keys.has('KeyD')) this.camera.position.addScaledVector(right, step);
    if (this.keys.has('KeyE')) this.camera.position.z += step;
    if (this.keys.has('KeyQ')) this.camera.position.z -= step;

    this.camera.lookAt(this.camera.position.clone().add(forward));
  }
}

try {
  buildMainRoom();
  buildBedroom();
  addHeroBlockout();
  addStovePipe();
  addLighting();
  const observer = new GhostObserver(camera, canvas);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    observer.update(Math.min(clock.getDelta(), .05));
    renderer.render(scene, camera);
  });
} catch (error) {
  console.error(error);
  fatal.hidden = false;
  fatal.textContent = `Fly House failed to initialize: ${error?.stack || error}`;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
});
