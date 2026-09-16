import * as THREE from '../../worlds/shared/vendor/three.module.js';

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
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x28221b);
scene.fog = new THREE.Fog(0x28221b, 13, 33);

const camera = new THREE.PerspectiveCamera(61, innerWidth / innerHeight, 0.015, 90);
camera.up.set(0, 0, 1);

const colliders = [];
const WORLD_Z_MIN = 0.22;
const WORLD_Z_MAX = 2.62;
const OBSERVER_RADIUS = 0.21;

function canvasTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  if (kind === 'kilim') {
    g.fillStyle = '#7b3b27'; g.fillRect(0, 0, 512, 512);
    const bands = ['#2f4a43', '#d2a253', '#b95f3e', '#dcc8a6', '#46352e'];
    for (let y = 18; y < 512; y += 58) {
      g.fillStyle = bands[(y / 58) % bands.length | 0];
      g.fillRect(0, y, 512, 12);
      for (let x = 8; x < 512; x += 54) {
        g.beginPath();
        g.moveTo(x + 22, y + 18); g.lineTo(x + 44, y + 35); g.lineTo(x + 22, y + 52); g.lineTo(x, y + 35); g.closePath();
        g.fillStyle = bands[((x / 54) + (y / 58) + 2) % bands.length | 0]; g.fill();
      }
    }
  } else if (kind === 'patchwork') {
    const p = ['#874936', '#4f6550', '#c08a55', '#6f5668', '#b0a178', '#374e5b'];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.fillStyle = p[(x * 3 + y * 5) % p.length]; g.fillRect(x * 64, y * 64, 64, 64);
      g.strokeStyle = 'rgba(240,225,195,.28)'; g.lineWidth = 4; g.strokeRect(x * 64 + 2, y * 64 + 2, 60, 60);
      if ((x + y) % 3 === 0) { g.fillStyle = 'rgba(245,220,175,.34)'; g.beginPath(); g.arc(x * 64 + 32, y * 64 + 32, 13, 0, Math.PI * 2); g.fill(); }
    }
  } else if (kind === 'floral') {
    g.fillStyle = '#6d2f27'; g.fillRect(0, 0, 512, 512);
    for (let y = 45; y < 512; y += 105) for (let x = 40; x < 512; x += 115) {
      g.strokeStyle = '#71805b'; g.lineWidth = 6; g.beginPath(); g.moveTo(x, y + 40); g.quadraticCurveTo(x + 12, y + 10, x + 28, y - 8); g.stroke();
      for (let a = 0; a < 6; a++) { const ang = a / 6 * Math.PI * 2; g.fillStyle = a % 2 ? '#d99b71' : '#c76a5d'; g.beginPath(); g.arc(x + Math.cos(ang) * 16, y + Math.sin(ang) * 16, 10, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#e3bd72'; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === 'lace') {
    g.clearRect(0, 0, 512, 512);
    g.fillStyle = 'rgba(238,231,211,.72)'; g.fillRect(0, 0, 512, 512);
    g.globalCompositeOperation = 'destination-out';
    for (let y = 12; y < 512; y += 34) for (let x = 12; x < 512; x += 34) { g.beginPath(); g.arc(x + (y % 68 ? 8 : 0), y, 7, 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const MATERIALS = {
  plaster: new THREE.MeshStandardMaterial({ color: 0xd7c6ad, roughness: 0.96 }),
  plasterDark: new THREE.MeshStandardMaterial({ color: 0xbca98e, roughness: 0.98 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x6c7161, roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6e3e2c, roughness: 0.72 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x3b241c, roughness: 0.78 }),
  woodLight: new THREE.MeshStandardMaterial({ color: 0x9a6645, roughness: 0.76 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x2d2927, metalness: 0.62, roughness: 0.6 }),
  metalLight: new THREE.MeshStandardMaterial({ color: 0x7c746c, metalness: 0.68, roughness: 0.45 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x9fc0c5, roughness: 0.1, transmission: 0.15, transparent: true, opacity: 0.46 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x172427, roughness: 0.22, metalness: 0.08 }),
  greenTextile: new THREE.MeshStandardMaterial({ color: 0x66704e, roughness: 0.98 }),
  redTextile: new THREE.MeshStandardMaterial({ color: 0x8f4f40, roughness: 0.98 }),
  pinkTextile: new THREE.MeshStandardMaterial({ color: 0x9c6d6f, roughness: 0.98 }),
  blueTextile: new THREE.MeshStandardMaterial({ color: 0x4f7182, roughness: 0.96 }),
  kilim: new THREE.MeshStandardMaterial({ map: canvasTexture('kilim'), roughness: 0.98 }),
  patchwork: new THREE.MeshStandardMaterial({ map: canvasTexture('patchwork'), roughness: 0.98 }),
  floral: new THREE.MeshStandardMaterial({ map: canvasTexture('floral'), roughness: 0.98 }),
  lace: new THREE.MeshStandardMaterial({ map: canvasTexture('lace'), transparent: true, opacity: 0.8, side: THREE.DoubleSide, roughness: 1 }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0xd7d0bd, roughness: 0.45 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x536c43, roughness: 0.95 }),
  flower: new THREE.MeshStandardMaterial({ color: 0xa74438, roughness: 0.92 }),
  fire: new THREE.MeshStandardMaterial({ color: 0xff5a16, emissive: 0xff2d00, emissiveIntensity: 4.2, roughness: 0.35 }),
};

function registerCollider(mesh, padding = 0) {
  mesh.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(mesh);
  if (padding) bounds.expandByScalar(padding);
  colliders.push({ bounds, name: mesh.name });
}

function box(size, position, material, name, { solid = false, parent = scene, rotationZ = 0 } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.z = rotationZ;
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  if (solid) registerCollider(mesh);
  return mesh;
}

function cylinder(radius, depth, position, material, name, { axis = 'z', solid = false, parent = scene, vertices = 24 } = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, vertices), material);
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  if (solid) registerCollider(mesh);
  return mesh;
}

function addWallX(x, y0, y1, z0, z1, material, name) {
  return box([0.14, y1 - y0, z1 - z0], [x, (y0 + y1) / 2, (z0 + z1) / 2], material, name, { solid: true });
}
function addWallY(y, x0, x1, z0, z1, material, name) {
  return box([x1 - x0, 0.14, z1 - z0], [(x0 + x1) / 2, y, (z0 + z1) / 2], material, name, { solid: true });
}

function buildArchitecture() {
  // Slightly enlarged from v0.1. Main room remains intimate but no longer feels cramped.
  box([8.4, 6.4, 0.10], [0, 0, -0.05], MATERIALS.floor, 'main-floor');
  box([8.4, 6.4, 0.08], [0, 0, 2.89], MATERIALS.plasterDark, 'main-ceiling');
  addWallY(3.2, -4.2, 4.2, 0, 2.85, MATERIALS.plaster, 'main-north');
  addWallY(-3.2, -4.2, 4.2, 0, 2.85, MATERIALS.plaster, 'main-south');
  // West window opening: broad barred window + layered curtains, as in the reference.
  addWallX(-4.2, -3.2, -1.72, 0, 2.85, MATERIALS.plaster, 'west-a');
  addWallX(-4.2, 0.28, 3.2, 0, 2.85, MATERIALS.plaster, 'west-b');
  addWallX(-4.2, -1.72, 0.28, 0, 0.72, MATERIALS.plaster, 'west-sill');
  addWallX(-4.2, -1.72, 0.28, 2.28, 2.85, MATERIALS.plaster, 'west-head');
  // East doorway to bedroom.
  addWallX(4.2, -3.2, 0.34, 0, 2.85, MATERIALS.plaster, 'east-a');
  addWallX(4.2, 1.66, 3.2, 0, 2.85, MATERIALS.plaster, 'east-b');
  addWallX(4.2, 0.34, 1.66, 2.18, 2.85, MATERIALS.plaster, 'east-head');
  // Bedroom.
  box([4.2, 5.0, 0.10], [6.3, 1.15, -0.05], MATERIALS.floor, 'bed-floor');
  box([4.2, 5.0, 0.08], [6.3, 1.15, 2.89], MATERIALS.plasterDark, 'bed-ceiling');
  addWallX(8.4, -1.35, 3.65, 0, 2.85, MATERIALS.plaster, 'bed-east');
  addWallY(-1.35, 4.2, 8.4, 0, 2.85, MATERIALS.plaster, 'bed-south');
  addWallY(3.65, 4.2, 4.92, 0, 2.85, MATERIALS.plaster, 'bed-north-a');
  addWallY(3.65, 6.30, 8.4, 0, 2.85, MATERIALS.plaster, 'bed-north-b');
  addWallY(3.65, 4.92, 6.30, 0, 0.78, MATERIALS.plaster, 'bed-window-sill');
  addWallY(3.65, 4.92, 6.30, 2.20, 2.85, MATERIALS.plaster, 'bed-window-head');
  addWallX(4.2, -1.35, 0.34, 0, 2.85, MATERIALS.plaster, 'bed-west-a');
  addWallX(4.2, 1.66, 3.65, 0, 2.85, MATERIALS.plaster, 'bed-west-b');
  addWallX(4.2, 0.34, 1.66, 2.18, 2.85, MATERIALS.plaster, 'bed-west-head');

  // Ceiling beams and worn skirting add the dense old-house silhouette visible in the illustration.
  for (const y of [-2.35, -0.8, 0.75, 2.30]) box([8.15, 0.12, 0.16], [0, y, 2.73], MATERIALS.woodDark, `ceiling-beam-${y}`);
  for (const y of [-3.08, 3.08]) box([8.05, 0.07, 0.16], [0, y, 0.12], MATERIALS.woodDark, `skirting-${y}`);
}

function buildWindowAndCurtains() {
  box([0.035, 1.92, 1.50], [-4.12, -0.72, 1.49], MATERIALS.glass, 'window-glass', { solid: true });
  for (const y of [-1.53, -1.15, -0.77, -0.39, -0.01]) box([0.055, 0.045, 1.50], [-4.05, y, 1.49], MATERIALS.metal, `window-bar-v-${y}`);
  for (const z of [0.84, 1.28, 1.72, 2.14]) box([0.055, 1.92, 0.045], [-4.05, -0.72, z], MATERIALS.metal, `window-bar-h-${z}`);
  // Layered floral + lace curtains, deliberately fuller than the previous thin slabs.
  for (let i = 0; i < 5; i++) {
    box([0.08, 0.27, 2.34], [-3.91, 0.32 + i * 0.22, 1.48], MATERIALS.floral, `floral-curtain-${i}`, { rotationZ: (i - 2) * 0.015 });
  }
  for (let i = 0; i < 6; i++) box([0.055, 0.28, 2.18], [-3.94, -1.55 + i * 0.31, 1.52], MATERIALS.lace, `lace-curtain-${i}`);
  box([0.12, 2.25, 0.10], [-3.87, -0.66, 2.67], MATERIALS.woodDark, 'curtain-rail');

  // Small hanging bird cage-like detail from the reference image.
  const cage = new THREE.Group(); cage.position.set(-3.45, 1.72, 1.82); cage.name = 'birdcage-detail'; scene.add(cage);
  cylinder(0.27, 0.06, [0, 0, -0.38], MATERIALS.woodDark, 'cage-base', { parent: cage });
  cylinder(0.27, 0.06, [0, 0, 0.38], MATERIALS.woodDark, 'cage-top', { parent: cage });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; box([0.018, 0.018, 0.76], [Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0], MATERIALS.metal, `cage-wire-${i}`, { parent: cage }); }
}

function buildBenchWall() {
  // Long divan / carved wall-cabinet composition is the dominant reference anchor.
  box([3.95, 0.88, 0.46], [-0.65, 2.34, 0.34], MATERIALS.woodDark, 'divan-base', { solid: true });
  box([3.70, 0.76, 0.24], [-0.65, 2.22, 0.65], MATERIALS.greenTextile, 'divan-seat', { solid: true });
  box([3.90, 0.34, 1.20], [-0.65, 2.76, 1.55], MATERIALS.wood, 'cabinet-back', { solid: true });
  for (const x of [-2.35, -1.55, -0.75, 0.05, 0.85]) {
    box([0.06, 0.06, 1.08], [x, 2.54, 1.55], MATERIALS.woodLight, `cabinet-post-${x}`);
    box([0.64, 0.055, 0.42], [x + 0.34, 2.55, 1.77], MATERIALS.woodDark, `cabinet-panel-${x}`);
  }
  box([4.05, 0.14, 0.16], [-0.65, 2.55, 2.20], MATERIALS.woodLight, 'cabinet-cornice');
  // Patchwork throw and mismatched pillows.
  box([2.75, 0.72, 0.12], [-0.60, 2.14, 0.82], MATERIALS.patchwork, 'bench-quilt');
  const pillowXs = [-2.02, -1.25, -0.48, 0.28, 1.02];
  pillowXs.forEach((x, i) => box([0.60, 0.25, 0.50], [x, 2.47, 0.98 + (i % 2) * 0.04], [MATERIALS.greenTextile, MATERIALS.redTextile, MATERIALS.patchwork, MATERIALS.pinkTextile, MATERIALS.kilim][i], `pillow-${i}`, { solid: true, rotationZ: (i - 2) * 0.04 }));
  // Shelf clutter above the divan.
  for (let i = 0; i < 9; i++) {
    const x = -2.25 + i * 0.48;
    if (i % 3 === 0) cylinder(0.10 + (i % 2) * 0.03, 0.22, [x, 2.48, 2.38], MATERIALS.ceramic, `cabinet-pot-${i}`);
    else box([0.20, 0.16, 0.28 + (i % 2) * 0.08], [x, 2.48, 2.36], i % 2 ? MATERIALS.woodLight : MATERIALS.ceramic, `cabinet-object-${i}`);
  }
}

function buildStove() {
  box([1.02, 0.84, 1.18], [2.05, 0.76, 0.59], MATERIALS.metal, 'wood-stove', { solid: true });
  for (const x of [1.66, 2.44]) for (const y of [0.47, 1.05]) cylinder(0.055, 0.25, [x, y, 0.13], MATERIALS.metal, `stove-leg-${x}-${y}`, { solid: true });
  box([0.56, 0.025, 0.43], [2.05, 0.33, 0.60], MATERIALS.woodDark, 'stove-door');
  box([0.40, 0.018, 0.24], [2.05, 0.31, 0.61], MATERIALS.fire, 'stove-fire-window');
  cylinder(0.045, 0.18, [2.34, 0.29, 0.61], MATERIALS.metalLight, 'stove-door-handle', { axis: 'y' });
  // Kettle on stove.
  cylinder(0.19, 0.26, [2.03, 0.73, 1.30], MATERIALS.metalLight, 'kettle-body');
  cylinder(0.13, 0.06, [2.03, 0.73, 1.47], MATERIALS.metalLight, 'kettle-lid');
  box([0.32, 0.045, 0.08], [2.03, 0.73, 1.55], MATERIALS.woodDark, 'kettle-handle');

  const points = [new THREE.Vector3(2.05, .76, 1.20), new THREE.Vector3(2.05, .76, 2.35), new THREE.Vector3(1.35, .76, 2.56), new THREE.Vector3(-2.35, .76, 2.56), new THREE.Vector3(-2.85, .76, 2.42)];
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, .12, 14, false), MATERIALS.metal);
  pipe.name = 'stove-pipe'; pipe.castShadow = true; scene.add(pipe); registerCollider(pipe, 0.03);
}

function buildTVAndLeftClutter() {
  box([1.18, 0.72, 1.34], [-3.36, -2.05, 0.67], MATERIALS.wood, 'tv-cabinet', { solid: true });
  box([0.80, 0.03, 0.58], [-3.36, -2.42, 0.88], MATERIALS.screen, 'crt-screen');
  cylinder(0.055, 0.04, [-2.92, -2.44, 0.82], MATERIALS.metalLight, 'tv-knob-a', { axis: 'y' });
  cylinder(0.055, 0.04, [-2.92, -2.44, 0.96], MATERIALS.metalLight, 'tv-knob-b', { axis: 'y' });
  box([0.92, 0.58, 0.10], [-3.36, -2.05, 1.39], MATERIALS.woodDark, 'tv-top');
  // Basket with yarn and a soft blue bag.
  cylinder(0.37, 0.52, [-1.95, 0.58, 0.26], MATERIALS.woodLight, 'woven-basket', { solid: true });
  const yarnColors = [MATERIALS.redTextile, MATERIALS.greenTextile, MATERIALS.pinkTextile, MATERIALS.blueTextile];
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const s = new THREE.Mesh(new THREE.SphereGeometry(0.11 + (i % 2) * 0.025, 12, 8), yarnColors[i % yarnColors.length]); s.position.set(-1.95 + Math.cos(a) * 0.20, 0.58 + Math.sin(a) * 0.17, 0.55 + (i % 3) * 0.04); s.castShadow = true; scene.add(s); }
  box([0.76, 0.36, 0.55], [0.55, 0.18, 0.31], MATERIALS.blueTextile, 'blue-bag', { solid: true, rotationZ: -0.16 });
  for (const x of [0.30, 0.80]) box([0.05, 0.06, 0.43], [x, 0.18, 0.66], MATERIALS.woodDark, `bag-handle-${x}`);
}

function buildRugsAndFloorClutter() {
  box([4.85, 1.85, 0.035], [1.10, -1.35, 0.025], MATERIALS.kilim, 'main-kilim', { rotationZ: -0.07 });
  const round = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, .032, 64), MATERIALS.patchwork); round.rotation.x = Math.PI / 2; round.position.set(-0.70, -2.25, .025); round.receiveShadow = true; round.name = 'round-rug'; scene.add(round);
  // Books, toys, slippers, jars and folded cloth: intentionally clustered rather than random confetti.
  const objects = [
    [-1.05,-0.55,.16,.30,.18,.18,'book'],[-.72,-.62,.11,.26,.17,.10,'book'],[-.25,-.40,.13,.20,.16,.16,'toy'],
    [.18,-.28,.11,.22,.12,.14,'toy'],[.94,-.12,.18,.18,.18,.30,'jar'],[-2.62,-1.22,.12,.34,.15,.12,'slipper'],[-2.23,-1.16,.12,.34,.15,.12,'slipper'],
    [1.42,-.42,.12,.32,.26,.15,'cloth'],[1.62,-.28,.10,.28,.22,.12,'cloth'],[-1.52,-.14,.11,.22,.20,.13,'toy'],[-.30,.62,.16,.22,.20,.26,'jar']
  ];
  objects.forEach((o, i) => { const [x,y,z,w,d,h,type] = o; const m = type === 'jar' ? MATERIALS.ceramic : type === 'cloth' ? MATERIALS.redTextile : type === 'slipper' ? MATERIALS.woodDark : i % 2 ? MATERIALS.woodLight : MATERIALS.greenTextile; box([w,d,h], [x,y,z], m, `floor-${type}-${i}`, { solid: type === 'jar' }); });
}

function buildWallDecor() {
  // Uneven framed pictures above furniture, matching the busy illustrated wall.
  const frames = [[-2.9,1.55,.44,.60],[-2.28,1.62,.33,.45],[-1.68,1.50,.42,.52],[0.96,1.62,.38,.48],[1.48,1.66,.28,.38],[2.88,1.70,.42,.55]];
  frames.forEach(([x,z,w,h], i) => { box([w,0.055,h],[x,3.07,z],MATERIALS.woodDark,`frame-${i}`); box([w-.07,0.045,h-.07],[x,3.035,z], i % 2 ? MATERIALS.plasterDark : MATERIALS.greenTextile,`picture-${i}`); });
  // Wall flower vase near doorway.
  cylinder(0.11,0.26,[3.50,1.88,1.32],MATERIALS.ceramic,'wall-vase',{axis:'y'});
  for (let i=0;i<5;i++) { box([0.02,0.02,0.48],[3.50 + (i-2)*0.05,1.85,1.60],MATERIALS.leaf,`flower-stem-${i}`); const f=new THREE.Mesh(new THREE.SphereGeometry(.06,10,8),MATERIALS.flower); f.position.set(3.50+(i-2)*.07,1.83,1.85+(i%2)*.08); scene.add(f); }
}

function buildBedroom() {
  // Old wooden bed and the prominent red/patterned quilt seen through the doorway.
  box([1.82, 2.20, 0.30], [6.72, 1.82, 0.42], MATERIALS.woodDark, 'bed-frame', { solid: true });
  box([1.68, 2.02, 0.28], [6.72, 1.82, 0.68], MATERIALS.redTextile, 'mattress', { solid: true });
  box([1.72, 2.02, 0.14], [6.72, 1.78, 0.88], MATERIALS.patchwork, 'bed-quilt');
  box([1.50, 0.18, 1.22], [6.72, 2.88, 1.05], MATERIALS.wood, 'headboard', { solid: true });
  box([0.64,0.42,0.24],[6.35,2.52,1.05],MATERIALS.pinkTextile,'bed-pillow-a',{solid:true,rotationZ:.08});
  box([0.64,0.42,0.24],[7.04,2.52,1.04],MATERIALS.greenTextile,'bed-pillow-b',{solid:true,rotationZ:-.08});
  // Bedside cabinet + warm lamp.
  box([0.62,0.56,0.82],[5.18,2.42,0.41],MATERIALS.wood,'bedside-table',{solid:true});
  cylinder(0.11,0.05,[5.18,2.42,0.86],MATERIALS.metalLight,'lamp-base');
  box([0.055,0.055,0.42],[5.18,2.42,1.09],MATERIALS.metalLight,'lamp-stem');
  const shade=new THREE.Mesh(new THREE.ConeGeometry(.28,.36,24,1,true),new THREE.MeshStandardMaterial({color:0xc99959,roughness:.82,side:THREE.DoubleSide,transparent:true,opacity:.86})); shade.position.set(5.18,2.42,1.40); shade.rotation.x=Math.PI/2; scene.add(shade);
  // Shelf/books, storage chest and wardrobe continue the same household language beyond the original crop.
  box([1.10,0.34,1.62],[7.65,3.18,0.81],MATERIALS.wood,'bedroom-bookshelf',{solid:true});
  for(let row=0;row<3;row++) for(let i=0;i<5;i++) box([.10+.03*(i%2),.22,.24+.04*((i+row)%2)],[7.28+i*.16,2.96,.32+row*.46], [MATERIALS.redTextile,MATERIALS.greenTextile,MATERIALS.woodLight,MATERIALS.blueTextile][(i+row)%4],`book-${row}-${i}`);
  box([1.25,.72,.64],[5.26,-.64,.32],MATERIALS.woodDark,'bedroom-trunk',{solid:true});
  box([1.25,.74,.09],[5.26,-.64,.69],MATERIALS.woodLight,'trunk-lid');
  box([1.18,.66,2.10],[7.58,-.78,1.05],MATERIALS.wood,'bedroom-wardrobe',{solid:true});
  box([1.45,1.95,.03],[6.05,.05,.025],MATERIALS.kilim,'bedroom-rug',{rotationZ:.06});
  // Bedroom window and curtain.
  box([1.34,.035,1.40],[5.61,3.58,1.48],MATERIALS.glass,'bedroom-window',{solid:true});
  for(let i=0;i<4;i++) box([.28,.055,1.78],[4.84+i*.25,3.48,1.55],MATERIALS.floral,`bedroom-curtain-${i}`);
}

function addLighting() {
  scene.add(new THREE.HemisphereLight(0xb9d2e1, 0x4a3426, 1.12));
  const sun = new THREE.DirectionalLight(0xffdfba, 2.15); sun.position.set(-6, -5, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left=-10; sun.shadow.camera.right=10; sun.shadow.camera.top=10; sun.shadow.camera.bottom=-10; scene.add(sun);
  const windowFill = new THREE.PointLight(0xa8d5ff, 3.8, 6.5, 2); windowFill.position.set(-3.6,-.7,1.65); scene.add(windowFill);
  const stove = new THREE.PointLight(0xff6525, 8.5, 3.8, 2); stove.position.set(2.05,.28,.62); stove.castShadow = true; scene.add(stove);
  const bedroom = new THREE.PointLight(0xffb45a, 5.2, 4.0, 2); bedroom.position.set(5.18,2.35,1.42); bedroom.castShadow=true; scene.add(bedroom);
}

function sphereIntersectsBox(position, radius, box3) {
  const closest = position.clone().clamp(box3.min, box3.max);
  return closest.distanceToSquared(position) < radius * radius;
}

class GhostObserver {
  constructor(viewCamera, domElement) {
    this.camera = viewCamera;
    this.domElement = domElement;
    this.keys = new Set();
    this.speed = 2.45;
    this.noClip = false;
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
      if (event.code === 'KeyN' && !event.repeat) { this.noClip = !this.noClip; this.syncStatus(); }
    });
    addEventListener('keyup', (event) => this.keys.delete(event.code));
    this.syncStatus();
  }

  syncStatus() {
    if (statusEl) statusEl.textContent = this.noClip ? 'Ghost observer · DEBUG NOCLIP' : 'Ghost observer · collision ON';
  }

  reset() {
    this.camera.position.set(-1.55, -1.85, 1.58);
    this.yaw = .78;
    this.pitch = -.06;
  }

  blocked(position) {
    if (this.noClip) return false;
    if (position.z < WORLD_Z_MIN || position.z > WORLD_Z_MAX) return true;
    return colliders.some(({ bounds }) => sphereIntersectsBox(position, OBSERVER_RADIUS, bounds));
  }

  tryMove(delta) {
    if (this.noClip) { this.camera.position.add(delta); return; }
    // Axis-separated movement gives natural wall sliding instead of sticky diagonal collisions.
    const axes = [new THREE.Vector3(delta.x,0,0), new THREE.Vector3(0,delta.y,0), new THREE.Vector3(0,0,delta.z)];
    for (const axis of axes) {
      const candidate = this.camera.position.clone().add(axis);
      if (!this.blocked(candidate)) this.camera.position.copy(candidate);
    }
  }

  update(dt) {
    const horizontal = Math.cos(this.pitch);
    const forward = new THREE.Vector3(Math.sin(this.yaw) * horizontal, Math.cos(this.yaw) * horizontal, Math.sin(this.pitch)).normalize();
    const flatForward = new THREE.Vector3(forward.x, forward.y, 0).normalize();
    const right = new THREE.Vector3().crossVectors(flatForward, new THREE.Vector3(0, 0, 1)).normalize();
    const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 2.4 : 1;
    const step = this.speed * boost * dt;
    const delta = new THREE.Vector3();
    if (this.keys.has('KeyW')) delta.addScaledVector(flatForward, step);
    if (this.keys.has('KeyS')) delta.addScaledVector(flatForward, -step);
    if (this.keys.has('KeyA')) delta.addScaledVector(right, -step);
    if (this.keys.has('KeyD')) delta.addScaledVector(right, step);
    if (this.keys.has('KeyE')) delta.z += step;
    if (this.keys.has('KeyQ')) delta.z -= step;
    this.tryMove(delta);
    this.camera.lookAt(this.camera.position.clone().add(forward));
  }
}

try {
  buildArchitecture();
  buildWindowAndCurtains();
  buildBenchWall();
  buildStove();
  buildTVAndLeftClutter();
  buildRugsAndFloorClutter();
  buildWallDecor();
  buildBedroom();
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
