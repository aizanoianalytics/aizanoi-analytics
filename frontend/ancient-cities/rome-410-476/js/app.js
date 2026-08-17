import { CITY, SOURCES, REGIONS, STREETS, BUILDINGS, TELEPORTS } from '../data/city.js';
import {
  createTraversalSystem,
  rectCollider,
  walkRect,
  walkRamp,
} from '../../../ancient-world/engine/traversal.js';
import { createLifecycle } from '../../../ancient-world/engine/lifecycle.js';
import { installBackToOS } from '../../../ancient-world/engine/navigation.js';
import { ANCIENT_MATERIALS as M } from '../../../ancient-world/assets/materials.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const canvas = $('#glCanvas');
const overlayCanvas = $('#overlay');
const gl = canvas?.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
if (!gl) throw new Error('WebGL is unavailable.');

const lifecycle = createLifecycle();
const TOUCH = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
const FINE_POINTER = matchMedia('(pointer:fine)').matches;
const WORLD_BOUNDS = Object.freeze({ minX: -900, maxX: 700, minZ: -700, maxZ: 700 });
const EYE_HEIGHT = 1.68;
const WALK_SPEED = 3.8;
const SPRINT_SPEED = 7.2;

const C = {
  ...M,
  white: M.plaster,
};

const stateColor = {
  standing: C.marble,
  working: C.brick,
  new: C.white,
  repaired: C.marble,
  fortified: C.wall,
  spoliated: C.brick,
  damaged: C.brickDark,
  ruined: C.rubble,
  burial: C.rubble,
  inferred: C.brick,
  default: C.brick,
};
const stateLabel = {
  standing: 'Standing',
  working: 'In use',
  new: 'New in this period',
  repaired: 'Repaired',
  fortified: 'Fortified',
  spoliated: 'Stripped / spoliated',
  damaged: 'Damaged',
  ruined: 'Ruined',
  burial: 'Burial landscape',
  inferred: 'Schematic urban fabric',
};

const geometry = [];
const colliders = [];
const walkSurfaces = [];
const gates = BUILDINGS.filter((building) => building.type === 'gate');

function normalize3(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function faceNormal(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  return normalize3([
    uy * vz - uz * vy,
    uz * vx - ux * vz,
    ux * vy - uy * vx,
  ]);
}

function vertex(position, normal, color) {
  geometry.push(
    position[0], position[1], position[2],
    normal[0], normal[1], normal[2],
    color[0], color[1], color[2],
  );
}

function tri(a, b, c, color) {
  const normal = faceNormal(a, b, c);
  vertex(a, normal, color);
  vertex(b, normal, color);
  vertex(c, normal, color);
}

function quad(a, b, c, d, color) {
  tri(a, b, c, color);
  tri(a, c, d, color);
}

function rotateXZ(x, z, cx, cz, angle) {
  if (!angle) return [x, z];
  const dx = x - cx;
  const dz = z - cz;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  return [cx + dx * ca - dz * sa, cz + dx * sa + dz * ca];
}

function box(x, y, z, width, height, depth, color, rot = 0) {
  const y0 = y;
  const y1 = y + height;
  const local = [
    [-width / 2, -depth / 2],
    [ width / 2, -depth / 2],
    [ width / 2,  depth / 2],
    [-width / 2,  depth / 2],
  ];
  const points = local.map(([lx, lz]) => {
    const [rx, rz] = rotateXZ(x + lx, z + lz, x, z, rot);
    return [rx, rz];
  });
  const p = (index, py) => [points[index][0], py, points[index][1]];

  quad(p(1, y0), p(0, y0), p(0, y1), p(1, y1), color);
  quad(p(2, y0), p(1, y0), p(1, y1), p(2, y1), color);
  quad(p(3, y0), p(2, y0), p(2, y1), p(3, y1), color);
  quad(p(0, y0), p(3, y0), p(3, y1), p(0, y1), color);
  quad(p(0, y1), p(3, y1), p(2, y1), p(1, y1), color);
  quad(p(0, y0), p(1, y0), p(2, y0), p(3, y0), color);
}

function cylinder(x, y, z, radius, height, color, segments = 16) {
  const count = TOUCH ? Math.min(segments, 14) : segments;
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2;
    const b = (i + 1) / count * Math.PI * 2;
    const p0 = [x + Math.cos(a) * radius, y, z + Math.sin(a) * radius];
    const p1 = [x + Math.cos(b) * radius, y, z + Math.sin(b) * radius];
    const p2 = [p1[0], y + height, p1[2]];
    const p3 = [p0[0], y + height, p0[2]];
    quad(p0, p1, p2, p3, color);
    tri([x, y + height, z], p3, p2, color);
  }
}

function pitchedBuilding(x, y, z, width, height, depth, color) {
  const wallHeight = height * 0.72;
  box(x, y, z, width, wallHeight, depth, color);
  const y0 = y + wallHeight;
  const top = y + height;
  const x0 = x - width / 2;
  const x1 = x + width / 2;
  const z0 = z - depth / 2;
  const z1 = z + depth / 2;
  tri([x0, y0, z0], [x1, y0, z0], [x, top, z0], C.roof);
  tri([x1, y0, z1], [x0, y0, z1], [x, top, z1], C.roof);
  quad([x0, y0, z0], [x, top, z0], [x, top, z1], [x0, y0, z1], C.roof);
  quad([x, top, z0], [x1, y0, z0], [x1, y0, z1], [x, top, z1], C.roof);
}

function arch(x, y, z, width, height, depth, color) {
  const pierWidth = Math.max(2.2, width * 0.24);
  const opening = Math.max(3, width - pierWidth * 2);
  const spring = height * 0.62;
  box(x - (opening + pierWidth) / 2, y, z, pierWidth, spring, depth, color);
  box(x + (opening + pierWidth) / 2, y, z, pierWidth, spring, depth, color);
  box(x, y + spring, z, width, height - spring, depth, color);
}

function temple(building, color) {
  const base = Math.max(1.2, building.h * 0.16);
  box(building.x, 0, building.z, building.w, base, building.d, color);
  const columns = Math.max(4, Math.round(building.w / 10));
  for (let i = 0; i < columns; i++) {
    const x = building.x - building.w * 0.4 + i * (building.w * 0.8 / Math.max(1, columns - 1));
    cylinder(x, base, building.z - building.d * 0.34, 1.35, building.h * 0.55, C.marbleLight, 10);
    cylinder(x, base, building.z + building.d * 0.34, 1.35, building.h * 0.55, C.marbleLight, 10);
  }
  pitchedBuilding(building.x, base, building.z, building.w * 0.82, building.h - base, building.d * 0.62, color);
}

function roundBuilding(building, color) {
  const radius = Math.min(building.w, building.d) / 2;
  cylinder(building.x, 0, building.z, radius, building.h * 0.62, color, 24);
  for (let ring = 0; ring < 4; ring++) {
    cylinder(
      building.x,
      building.h * (0.62 + ring * 0.085),
      building.z,
      radius * (0.78 - ring * 0.1),
      building.h * 0.09,
      ring % 2 ? C.marble : color,
      24,
    );
  }
}

function theatre(building, color) {
  const radius = Math.max(building.w, building.d) * 0.46;
  for (let ring = 0; ring < 5; ring++) {
    cylinder(
      building.x,
      ring * building.h * 0.11,
      building.z,
      radius * (1 - ring * 0.08),
      building.h * 0.12,
      ring % 2 ? C.limestone : color,
      28,
    );
  }
}

function amphitheatre(building, color) {
  for (let ring = 0; ring < 5; ring++) {
    cylinder(
      building.x,
      building.h * ring / 5,
      building.z,
      Math.max(building.w, building.d) * (0.52 - ring * 0.04),
      building.h / 5,
      ring % 2 ? C.limestone : color,
      36,
    );
  }
}

function bath(building, color) {
  box(building.x, 0, building.z, building.w, building.h * 0.38, building.d, color);
  for (let i = -2; i <= 2; i++) {
    for (let j = -1; j <= 1; j++) {
      cylinder(
        building.x + i * building.w * 0.13,
        building.h * 0.38,
        building.z + j * building.d * 0.2,
        3,
        building.h * 0.36,
        i === 0 ? C.marbleLight : color,
        12,
      );
    }
  }
}

function basilica(building, color, church = false) {
  const naveWidth = building.w * 0.54;
  pitchedBuilding(building.x, 0, building.z, naveWidth, building.h, building.d * 0.78, color);
  box(building.x - building.w * 0.38, 0, building.z, building.w * 0.22, building.h * 0.55, building.d * 0.72, C.brick);
  box(building.x + building.w * 0.38, 0, building.z, building.w * 0.22, building.h * 0.55, building.d * 0.72, C.brick);
  cylinder(building.x, 0, building.z + building.d * 0.39, Math.min(building.w, building.d) * 0.18, building.h * 0.6, church ? C.plaster : color, 18);
  if (church) {
    box(building.x, 0.06, building.z - building.d * 0.58, building.w * 0.82, 0.18, building.d * 0.25, C.road);
  }
}

function forum(building, color) {
  box(building.x, 0, building.z, building.w, 0.16, building.d, C.road);
  walkSurfaces.push(walkRect(building.x, building.z, building.w - 1, building.d - 1, 0.16, 0, `${building.id} paving`, false));
  const step = Math.max(14, Math.min(building.w, building.d) / 5);
  for (let x = building.x - building.w * 0.42; x <= building.x + building.w * 0.42; x += step) {
    cylinder(x, 0.16, building.z - building.d * 0.43, 0.75, 6, C.marbleLight, 10);
    cylinder(x, 0.16, building.z + building.d * 0.43, 0.75, 6, C.marbleLight, 10);
  }
  box(building.x, 0.18, building.z, 2.6, 1.2, 2.6, color);
}

function market(building, color) {
  box(building.x, 0, building.z, building.w, 0.14, building.d, C.road);
  walkSurfaces.push(walkRect(building.x, building.z, building.w - 1, building.d - 1, 0.14, 0, `${building.id} court`, false));
  for (let i = -2; i <= 2; i++) {
    box(building.x + i * building.w * 0.16, 0.14, building.z - building.d * 0.37, building.w * 0.11, 3.2, building.d * 0.16, color);
    box(building.x + i * building.w * 0.16, 0.14, building.z + building.d * 0.37, building.w * 0.11, 3.2, building.d * 0.16, color);
  }
}

function palace(building, color) {
  const wingW = building.w * 0.28;
  const wingD = building.d * 0.28;
  box(building.x - building.w * 0.34, 0, building.z, wingW, building.h * 0.75, building.d, color);
  box(building.x + building.w * 0.34, 0, building.z, wingW, building.h * 0.75, building.d, color);
  box(building.x, 0, building.z - building.d * 0.34, building.w * 0.55, building.h * 0.65, wingD, C.brick);
  box(building.x, 0, building.z + building.d * 0.34, building.w * 0.55, building.h * 0.65, wingD, C.brick);
}

function insula(building, color) {
  const rows = 2;
  const cols = 3;
  const gap = 4;
  const cellW = (building.w - gap * (cols - 1)) / cols;
  const cellD = (building.d - gap * (rows - 1)) / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = building.x - building.w / 2 + cellW / 2 + col * (cellW + gap);
      const z = building.z - building.d / 2 + cellD / 2 + row * (cellD + gap);
      const height = building.h * (0.68 + ((row + col) % 3) * 0.11);
      pitchedBuilding(x, 0, z, cellW, height, cellD, col % 2 ? C.brickDark : color);
    }
  }
}

function warehouse(building, color) {
  for (let i = -2; i <= 2; i++) {
    pitchedBuilding(
      building.x + i * building.w * 0.17,
      0,
      building.z,
      building.w * 0.14,
      building.h * (0.72 + (i % 2 ? 0.08 : 0)),
      building.d * 0.86,
      color,
    );
  }
}

function garden(building) {
  box(building.x, 0, building.z, building.w, 0.08, building.d, C.grass);
  for (let i = 0; i < 18; i++) {
    const angle = i * 2.399;
    const radius = (i % 7) / 7;
    const x = building.x + Math.cos(angle) * building.w * 0.42 * radius;
    const z = building.z + Math.sin(angle) * building.d * 0.42 * radius;
    cylinder(x, 0.08, z, 0.35, 2.8 + (i % 4) * 0.6, C.timber, 7);
    cylinder(x, 2.1, z, 1.4 + (i % 3) * 0.4, 1.8, C.vegetation, 8);
  }
}

function cemetery(building) {
  box(building.x, 0, building.z, building.w, 0.06, building.d, C.earth);
  for (let i = 0; i < 20; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = building.x - building.w * 0.36 + col * building.w * 0.18;
    const z = building.z - building.d * 0.32 + row * building.d * 0.21;
    box(x, 0.06, z, 2.2 + (i % 2), 1.1 + (i % 3) * 0.35, 3.2, C.rubble);
  }
}

function addRampGeometry(x1, z1, y1, x2, z2, y2, width, color) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz) || 1;
  const nx = -dz / length;
  const nz = dx / length;
  const half = width / 2;
  quad(
    [x1 + nx * half, y1, z1 + nz * half],
    [x2 + nx * half, y2, z2 + nz * half],
    [x2 - nx * half, y2, z2 - nz * half],
    [x1 - nx * half, y1, z1 - nz * half],
    color,
  );
}

function bridge(building, color) {
  const deckY = 5;
  box(building.x, 0, building.z, building.w, deckY, building.d, color);
  for (let i = -building.w * 0.35; i <= building.w * 0.35; i += building.w * 0.35) {
    arch(building.x + i, 0, building.z, building.w * 0.27, 6, building.d, C.limestone);
  }

  const approach = 18;
  const leftStart = building.x - building.w / 2 - approach;
  const leftEnd = building.x - building.w / 2;
  const rightStart = building.x + building.w / 2 + approach;
  const rightEnd = building.x + building.w / 2;
  addRampGeometry(leftStart, building.z, 0.04, leftEnd, building.z, deckY, building.d - 1, C.road);
  addRampGeometry(rightStart, building.z, 0.04, rightEnd, building.z, deckY, building.d - 1, C.road);
  walkSurfaces.push(walkRect(building.x, building.z, building.w - 1, building.d - 1, deckY, 0, `${building.id} deck`, false));
  walkSurfaces.push(walkRamp(leftStart, building.z, 0.04, leftEnd, building.z, deckY, building.d - 1, `${building.id} west approach`, true));
  walkSurfaces.push(walkRamp(rightStart, building.z, 0.04, rightEnd, building.z, deckY, building.d - 1, `${building.id} east approach`, true));
}

function gateNearby(x, z, padding = 34) {
  return gates.some((gate) => Math.hypot(gate.x - x, gate.z - z) < padding + Math.max(gate.w, gate.d) * 0.5);
}

function wall(building) {
  const { w, d, h } = building;
  const addSegment = (x, z, width, depth) => {
    if (gateNearby(x, z)) return;
    box(x, 0, z, width, h, depth, C.wall);
    colliders.push(rectCollider(x, z, width, depth, 0, 'Aurelian Wall'));
  };

  for (let i = -w / 2; i <= w / 2; i += 34) {
    addSegment(building.x + i, building.z - d / 2, 32, 6);
    addSegment(building.x + i, building.z + d / 2, 32, 6);
  }
  for (let i = -d / 2; i <= d / 2; i += 34) {
    addSegment(building.x - w / 2, building.z + i, 6, 32);
    addSegment(building.x + w / 2, building.z + i, 6, 32);
  }
  for (let i = -w / 2; i <= w / 2; i += 68) {
    for (const z of [building.z - d / 2, building.z + d / 2]) {
      if (!gateNearby(building.x + i, z, 26)) box(building.x + i, 0, z, 13, h + 6, 13, C.wall);
    }
  }
}

function road(points, width) {
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const x = (a[0] + b[0]) / 2;
    const z = (a[1] + b[1]) / 2;
    box(x, 0.02, z, length, 0.08, width, C.road, angle);
    const nx = -dz / (length || 1);
    const nz = dx / (length || 1);
    for (const side of [-1, 1]) {
      box(
        x + nx * side * (width / 2 - 0.35),
        0.105,
        z + nz * side * (width / 2 - 0.35),
        length,
        0.035,
        0.22,
        C.roadEdge,
        angle,
      );
    }
  }
}

function scatteredRubble(building) {
  const count = TOUCH ? Math.max(5, Math.floor(building.w * building.d / 320)) : Math.max(8, Math.floor(building.w * building.d / 180));
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399;
    const radius = (i % 7) / 7 * Math.max(building.w, building.d) * 0.42;
    box(
      building.x + Math.cos(angle) * radius,
      0.02,
      building.z + Math.sin(angle) * radius,
      1.5 + (i % 4),
      0.7 + (i % 3),
      1.5 + (i % 3),
      C.rubble,
      angle * 0.31,
    );
  }
}

function registerSolidFootprint(building) {
  const passThroughTypes = new Set(['wall', 'gate', 'arch', 'aqueduct', 'bridge', 'forum', 'market', 'garden', 'cemetery', 'island']);
  if (passThroughTypes.has(building.type)) return;
  colliders.push(rectCollider(building.x, building.z, building.w, building.d, 0, building.name));
}

function renderBuilding(building) {
  const color = stateColor[building.state] || stateColor.default;
  registerSolidFootprint(building);

  if (building.type === 'wall') return wall(building);
  if (building.type === 'gate') return arch(building.x, 0, building.z, building.w, building.h, building.d, color);
  if (building.type === 'temple') temple(building, color);
  else if (['round', 'dome', 'round-church', 'mausoleum'].includes(building.type)) roundBuilding(building, color);
  else if (['theatre', 'stadium', 'circus', 'arena'].includes(building.type)) theatre(building, color);
  else if (building.type === 'amphitheatre') amphitheatre(building, color);
  else if (building.type === 'bath') bath(building, color);
  else if (building.type === 'arch') arch(building.x, 0, building.z, building.w, building.h, building.d, color);
  else if (building.type === 'column') cylinder(building.x, 0, building.z, Math.max(1.1, building.w * 0.18), building.h, C.marbleLight, 18);
  else if (building.type === 'basilica') basilica(building, color, false);
  else if (building.type === 'church') basilica(building, color, true);
  else if (building.type === 'forum') forum(building, color);
  else if (building.type === 'market') market(building, color);
  else if (building.type === 'palace') palace(building, color);
  else if (building.type === 'insula') insula(building, color);
  else if (building.type === 'warehouse') warehouse(building, color);
  else if (building.type === 'garden') garden(building);
  else if (building.type === 'cemetery') cemetery(building);
  else if (building.type === 'fort') palace(building, C.wall);
  else if (building.type === 'aqueduct') {
    for (let i = -building.w / 2; i <= building.w / 2; i += 16) arch(building.x + i, 0, building.z, 13, building.h, building.d, color);
  }
  else if (building.type === 'bridge') bridge(building, color);
  else if (building.type === 'island') {
    box(building.x, -0.3, building.z, building.w, 2, building.d, C.grass);
    walkSurfaces.push(walkRect(building.x, building.z, building.w - 2, building.d - 2, 1.7, 0, `${building.id} surface`, false));
  }
  else if (building.type === 'pyramid') pitchedBuilding(building.x, 0, building.z, building.w, building.h, building.d, color);
  else pitchedBuilding(building.x, 0, building.z, building.w, building.h, building.d, color);

  if (['ruined', 'damaged', 'spoliated'].includes(building.state)) scatteredRubble(building);
}

// Ground, Tiber, roads and source-backed landmarks.
box(-90, -1, 0, 1800, 1, 1500, C.earth);
box(-505, -0.6, 0, 92, 0.42, 1290, C.water);
for (const street of STREETS) road(street.points, street.width);
for (const building of BUILDINGS) renderBuilding(building);

const player = {
  x: -205,
  y: EYE_HEIGHT,
  z: -165,
  yaw: Math.PI * 0.88,
  pitch: -0.03,
  speed: WALK_SPEED,
  sprint: SPRINT_SPEED,
  floorY: 0,
  surfaceTag: 'ground',
};

const traversal = createTraversalSystem({
  player,
  colliders,
  walkSurfaces,
  bounds: WORLD_BOUNDS,
  eyeHeight: EYE_HEIGHT,
});

const vertexShader = `
attribute vec3 aP;
attribute vec3 aN;
attribute vec3 aC;
uniform mat4 uP;
uniform mat4 uV;
varying vec3 vN;
varying vec3 vC;
varying float vDepth;
varying vec3 vW;
void main(){
  vec4 viewPos = uV * vec4(aP, 1.0);
  gl_Position = uP * viewPos;
  vN = aN;
  vC = aC;
  vDepth = length(viewPos.xyz);
  vW = aP;
}`;

const fragmentShader = `
precision mediump float;
varying vec3 vN;
varying vec3 vC;
varying float vDepth;
varying vec3 vW;
uniform vec3 uFog;
uniform vec3 uSun;
uniform float uAmbient;
uniform float uFogDensity;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec3 n = normalize(vN);
  vec3 sun = normalize(uSun);
  float direct = max(dot(n, sun), 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  float bounce = max(dot(n, -sun), 0.0);
  float lighting = uAmbient + direct * 0.62 + hemi * 0.10 + bounce * 0.035;
  float grain = (hash(floor(vW.xz * 0.72)) - 0.5) * 0.035;
  vec3 color = vC * (0.72 + lighting * 0.48 + grain);
  float fog = clamp(1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth), 0.0, 0.88);
  gl_FragColor = vec4(mix(color, uFog, fog), 1.0);
}`;

function makeProgram(vs, fs) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return program;
}

const program = makeProgram(vertexShader, fragmentShader);
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry), gl.STATIC_DRAW);

const locations = Object.freeze({
  aP: gl.getAttribLocation(program, 'aP'),
  aN: gl.getAttribLocation(program, 'aN'),
  aC: gl.getAttribLocation(program, 'aC'),
  uP: gl.getUniformLocation(program, 'uP'),
  uV: gl.getUniformLocation(program, 'uV'),
  uFog: gl.getUniformLocation(program, 'uFog'),
  uSun: gl.getUniformLocation(program, 'uSun'),
  uAmbient: gl.getUniformLocation(program, 'uAmbient'),
  uFogDensity: gl.getUniformLocation(program, 'uFogDensity'),
});

function perspective(fov, aspect, near, far) {
  const t = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    t / aspect, 0, 0, 0,
    0, t, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

const sub = (a, b) => a.map((value, i) => value - b[i]);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => {
  const length = Math.hypot(...a) || 1;
  return a.map((value) => value / length);
};

function lookAt(eye, center, up) {
  const z = norm(sub(eye, center));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

function camera() {
  const cp = Math.cos(player.pitch);
  const forward = [
    Math.sin(player.yaw) * cp,
    Math.sin(player.pitch),
    -Math.cos(player.yaw) * cp,
  ];
  const eye = [player.x, player.y, player.z];
  return lookAt(eye, [eye[0] + forward[0], eye[1] + forward[1], eye[2] + forward[2]], [0, 1, 0]);
}

let keys = new Set();
let last = performance.now();
let locked = false;
let modernOverlay = false;
let audio = null;
let gameStarted = false;
let mapFrame = 0;
let moveBlend = 0;
let walkClock = 0;

function modalOpen() {
  return !$('#modal')?.classList.contains('hidden');
}

function clearMovementState() {
  keys.clear();
  last = performance.now();
}

function resize() {
  const cap = TOUCH ? 1.15 : 1.55;
  const dpr = Math.min(devicePixelRatio || 1, cap);
  const width = Math.max(1, Math.floor(innerWidth * dpr));
  const height = Math.max(1, Math.floor(innerHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    gl.viewport(0, 0, width, height);
  }
}

function updatePlayer(dt) {
  if (!gameStarted || modalOpen()) return;
  dt = Math.min(dt, 0.05);
  let forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  let right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const moving = Boolean(forward || right);
  moveBlend += ((moving ? 1 : 0) - moveBlend) * Math.min(1, dt * 9);

  if (moving) {
    const length = Math.hypot(forward, right);
    if (length > 1) {
      forward /= length;
      right /= length;
    }
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? player.sprint : player.speed;
    const sy = Math.sin(player.yaw);
    const cy = Math.cos(player.yaw);
    const dx = (sy * forward + cy * right) * speed * dt;
    const dz = (-cy * forward + sy * right) * speed * dt;
    traversal.moveWithSubsteps(dx, dz);
    walkClock += dt * (speed > player.speed ? 9.0 : 6.0);
  }

  const targetEye = player.floorY + EYE_HEIGHT;
  const delta = targetEye - player.y;
  const settle = 1 - Math.exp(-dt * (delta >= 0 ? 22 : 18));
  player.y += delta * settle;
  if (Math.abs(targetEye - player.y) < 0.0015) player.y = targetEye;
}

function draw() {
  resize();
  const fog = modernOverlay ? [0.48, 0.60, 0.64] : [0.57, 0.53, 0.45];
  gl.clearColor(fog[0] * 0.82, fog[1] * 0.88, fog[2] * 0.92, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(program);

  const stride = 9 * 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(locations.aP);
  gl.vertexAttribPointer(locations.aP, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(locations.aN);
  gl.vertexAttribPointer(locations.aN, 3, gl.FLOAT, false, stride, 3 * 4);
  gl.enableVertexAttribArray(locations.aC);
  gl.vertexAttribPointer(locations.aC, 3, gl.FLOAT, false, stride, 6 * 4);

  gl.uniformMatrix4fv(locations.uP, false, perspective(62 * Math.PI / 180, canvas.width / canvas.height, 0.08, 2600));
  gl.uniformMatrix4fv(locations.uV, false, camera());
  gl.uniform3fv(locations.uFog, new Float32Array(fog));
  gl.uniform3fv(locations.uSun, new Float32Array([0.42, 0.82, 0.28]));
  gl.uniform1f(locations.uAmbient, 0.42);
  gl.uniform1f(locations.uFogDensity, TOUCH ? 0.00078 : 0.00062);
  gl.drawArrays(gl.TRIANGLES, 0, geometry.length / 9);

  if (modernOverlay) drawOverlay();
  else clearOverlay();
  updateNearest();
}

function clearOverlay() {
  const ctx = overlayCanvas?.getContext('2d');
  if (!ctx) return;
  if (overlayCanvas.width || overlayCanvas.height) ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

function drawOverlay() {
  const ctx = overlayCanvas?.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.floor(innerWidth * dpr));
  const height = Math.max(1, Math.floor(innerHeight * dpr));
  if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    overlayCanvas.style.width = `${innerWidth}px`;
    overlayCanvas.style.height = `${innerHeight}px`;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.strokeStyle = 'rgba(70,210,255,.42)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 17; i++) {
    const x = (i / 16) * innerWidth;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + innerHeight * 0.18, innerHeight);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(160,235,255,.82)';
  ctx.font = '12px system-ui';
  ctx.fillText('MODERN ALIGNMENT OVERLAY · schematic relation to present Rome', 18, innerHeight - 24);
}

function updateNearest() {
  let best = null;
  let distance = Infinity;
  for (const building of BUILDINGS) {
    const d = Math.hypot(building.x - player.x, building.z - player.z);
    if (d < distance) {
      distance = d;
      best = building;
    }
  }
  if (best && distance < 70) {
    $('#place').textContent = best.name;
    $('#detail').textContent = `${stateLabel[best.state] || best.state} · ${best.region === 'all' ? 'city circuit' : `Regio ${best.region}`} · surface ${player.floorY.toFixed(1)} m`;
  } else {
    $('#place').textContent = 'Street level';
    $('#detail').textContent = `Walk the late-antique city · ${player.surfaceTag || 'ground'}`;
  }
}

function drawRegionalMap() {
  const c = $('#minimap');
  if (!c) return;
  const ctx = c.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.floor(c.clientWidth * dpr));
  const height = Math.max(1, Math.floor(c.clientHeight * dpr));
  if (c.width !== width || c.height !== height) {
    c.width = width;
    c.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cw = c.clientWidth;
  const ch = c.clientHeight;
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#1b1b16';
  ctx.fillRect(0, 0, cw, ch);

  const spanX = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
  const spanZ = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;
  const tx = (x) => (x - WORLD_BOUNDS.minX) / spanX * cw;
  const tz = (z) => (z - WORLD_BOUNDS.minZ) / spanZ * ch;

  const wall = BUILDINGS.find((building) => building.type === 'wall');
  if (wall) {
    ctx.strokeStyle = '#a16e42';
    ctx.lineWidth = 1;
    ctx.strokeRect(tx(wall.x - wall.w / 2), tz(wall.z - wall.d / 2), wall.w / spanX * cw, wall.d / spanZ * ch);
  }

  for (const region of REGIONS) {
    ctx.fillStyle = 'rgba(198,155,83,.10)';
    ctx.fillRect(tx(region.x - region.w / 2), tz(region.z - region.d / 2), region.w / spanX * cw, region.d / spanZ * ch);
    ctx.strokeStyle = 'rgba(231,202,129,.30)';
    ctx.strokeRect(tx(region.x - region.w / 2), tz(region.z - region.d / 2), region.w / spanX * cw, region.d / spanZ * ch);
  }

  ctx.strokeStyle = '#4f94a6';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(tx(-505), 0);
  ctx.lineTo(tx(-505), ch);
  ctx.stroke();

  for (const building of BUILDINGS.filter((item) => !['wall', 'insula', 'aqueduct'].includes(item.type))) {
    ctx.fillStyle = building.type === 'church' ? '#e7d49c' : building.state === 'ruined' ? '#6d5141' : '#b68753';
    ctx.fillRect(tx(building.x) - 2, tz(building.z) - 2, 4, 4);
  }

  ctx.save();
  ctx.translate(tx(player.x), tz(player.z));
  ctx.rotate(player.yaw);
  ctx.fillStyle = '#f5f0d0';
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 5);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#f3dab2';
  ctx.font = '10px system-ui';
  ctx.fillText('14 REGIONES', 8, 14);
}

function tick(now) {
  if (lifecycle.destroyed) return;
  const dt = Math.min(0.05, (now - last || 16) / 1000);
  last = now;
  updatePlayer(dt);
  draw();
  if ((mapFrame++ % 4) === 0) drawRegionalMap();
  lifecycle.frame(tick);
}

function setModal(title, html) {
  clearMovementState();
  if (locked) document.exitPointerLock?.();
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modal').classList.remove('hidden');
}

function closeModal() {
  $('#modal').classList.add('hidden');
  clearMovementState();
  canvas.focus({ preventScroll: true });
}

function lookAtTarget(x, z) {
  player.yaw = Math.atan2(x - player.x, -(z - player.z));
  player.pitch = -0.03;
}

function teleportToPoint(x, z, { lookX = null, lookZ = null, label = 'destination' } = {}) {
  clearMovementState();
  const spawn = traversal.resolveSpawn(x, z);
  const support = traversal.absoluteSupportAt(spawn.x, spawn.z);
  player.x = spawn.x;
  player.z = spawn.z;
  player.floorY = support.y;
  player.surfaceTag = support.tag;
  player.y = support.y + EYE_HEIGHT;
  if (lookX != null && lookZ != null) lookAtTarget(lookX, lookZ);
  last = performance.now();
  drawRegionalMap();
  $('#place').textContent = label;
  canvas.focus({ preventScroll: true });
  return spawn;
}

function teleport(id) {
  const building = BUILDINGS.find((item) => item.id === id);
  if (!building) return false;
  const offsets = [
    [0, -building.d * 0.72 - 8],
    [building.w * 0.72 + 8, 0],
    [0, building.d * 0.72 + 8],
    [-building.w * 0.72 - 8, 0],
  ];
  let chosen = null;
  for (const [ox, oz] of offsets) {
    const candidate = traversal.resolveSpawn(building.x + ox, building.z + oz, 22);
    if (!traversal.collide(candidate.x, candidate.z)) {
      chosen = candidate;
      break;
    }
  }
  chosen ||= traversal.resolveSpawn(building.x, building.z - building.d * 0.72 - 8);
  teleportToPoint(chosen.x, chosen.z, { lookX: building.x, lookZ: building.z, label: building.name });
  $('#jump').value = '';
  return true;
}

function openAtlas() {
  const rows = REGIONS.map((region) => `<button class="region" data-region="${region.id}"><b>${region.id} · ${region.name}</b><span>${region.note}</span></button>`).join('');
  setModal('Regional atlas · 14 Augustan regiones', `<p>The regional minimap is schematic; it is intended for orientation, not cadastral certainty.</p><div class="regionGrid">${rows}</div>`);
  $$('.region').forEach((element) => {
    element.onclick = () => {
      const region = REGIONS.find((item) => item.id === element.dataset.region);
      if (!region) return;
      closeModal();
      teleportToPoint(region.x, region.z, { label: `Regio ${region.id} · ${region.name}` });
    };
  });
}

function openSources() {
  const rows = SOURCES.map((source) => `<li><a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title}</a></li>`).join('');
  setModal('Research sources', `<p>This reconstruction treats source links as an open research trail. Named monuments, major roads and the regional framework are source-led; unresolved domestic massing remains schematic where fifth-century elevation evidence is incomplete.</p><ul>${rows}</ul><p><a href="./research/">Open the local research notes →</a></p>`);
}

function nearestInfo() {
  const building = BUILDINGS.reduce((best, item) => (
    Math.hypot(item.x - player.x, item.z - player.z) < Math.hypot(best.x - player.x, best.z - player.z) ? item : best
  ), BUILDINGS[0]);
  const source = SOURCES.find((item) => item.id === building.source);
  setModal(
    building.name,
    `<p><b>${stateLabel[building.state] || building.state}</b> · ${building.region === 'all' ? 'city circuit' : `Regio ${building.region}`}</p><p>${building.detail}</p><p>Source: ${source ? `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title}</a>` : 'Research ledger'}</p>`,
  );
}

function toggleAudio() {
  if (!audio) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = lifecycle.trackAudioContext(new AudioContext());
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = noise;
    source.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 430;
    gain.gain.value = 0.025;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
    lifecycle.addCleanup(() => { try { source.stop(); } catch (_) {} });
    audio = { ctx, gain };
    $('#audio').textContent = 'Sound: on';
  } else {
    audio.gain.gain.value = audio.gain.gain.value ? 0 : 0.025;
    $('#audio').textContent = audio.gain.gain.value ? 'Sound: on' : 'Sound: off';
  }
}

function installInput() {
  lifecycle.listen(canvas, 'click', () => {
    if (gameStarted && FINE_POINTER && !modalOpen()) canvas.requestPointerLock?.();
  });
  lifecycle.listen(document, 'pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
  lifecycle.listen(document, 'mousemove', (event) => {
    if (!locked || modalOpen()) return;
    player.yaw -= event.movementX * 0.0024;
    player.pitch = Math.max(-1.1, Math.min(0.8, player.pitch - event.movementY * 0.002));
  });
  lifecycle.listen(window, 'keydown', (event) => {
    if (modalOpen()) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    }
    if (event.code === 'KeyE' && gameStarted) nearestInfo();
  });
  lifecycle.listen(window, 'keyup', (event) => keys.delete(event.code));
  lifecycle.listen(window, 'blur', clearMovementState);
  lifecycle.listen(document, 'visibilitychange', () => { if (document.hidden) clearMovementState(); });

  $$('[data-move]').forEach((button) => {
    const code = button.dataset.move;
    const down = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      keys.add(code);
    };
    const up = (event) => {
      event.preventDefault();
      keys.delete(code);
    };
    lifecycle.listen(button, 'pointerdown', down);
    lifecycle.listen(button, 'pointerup', up);
    lifecycle.listen(button, 'pointercancel', up);
    lifecycle.listen(button, 'lostpointercapture', up);
  });

  const lookPad = $('#lookPad');
  if (lookPad) {
    let pointer = null;
    let lastX = 0;
    let lastY = 0;
    lifecycle.listen(lookPad, 'pointerdown', (event) => {
      event.preventDefault();
      pointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      lookPad.setPointerCapture?.(event.pointerId);
    });
    lifecycle.listen(lookPad, 'pointermove', (event) => {
      if (event.pointerId !== pointer || modalOpen()) return;
      event.preventDefault();
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      if (Math.hypot(dx, dy) < 1.5) return;
      player.yaw -= dx * 0.0052;
      player.pitch = Math.max(-1.1, Math.min(0.8, player.pitch - dy * 0.0042));
    });
    const stop = (event) => { if (event.pointerId === pointer) pointer = null; };
    lifecycle.listen(lookPad, 'pointerup', stop);
    lifecycle.listen(lookPad, 'pointercancel', stop);
    lifecycle.listen(lookPad, 'lostpointercapture', stop);
  }
}

$('#atlas').onclick = openAtlas;
$('#sources').onclick = openSources;
$('#audio').onclick = toggleAudio;
$('#inspect').onclick = nearestInfo;
$('#modern').onclick = () => {
  modernOverlay = !modernOverlay;
  $('#modern').textContent = modernOverlay ? 'Modern overlay: on' : 'Modern overlay: off';
  if (!modernOverlay) clearOverlay();
};
$('#modalClose').onclick = closeModal;
$('#jump').innerHTML = '<option value="">Jump to landmark…</option>' + TELEPORTS.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
$('#jump').onchange = (event) => teleport(event.target.value);
$('#enter').onclick = () => {
  $('#intro').classList.add('hidden');
  gameStarted = true;
  clearMovementState();
  traversal.snapPlayerToSupport();
  canvas.focus({ preventScroll: true });
  if (FINE_POINTER && !TOUCH) setTimeout(() => canvas.requestPointerLock?.(), 0);
};

$('#title').textContent = CITY.title;
$('#period').textContent = CITY.period;
$('#introTitle').textContent = CITY.title;
$('#introText').textContent = CITY.description;

installInput();
installBackToOS({ onBeforeExit: () => lifecycle.destroy() });
lifecycle.listen(window, 'pagehide', () => lifecycle.destroy(), { once: true });

window.__ANCIENT_WORLD_DESTROY__ = () => lifecycle.destroy();
window.__ANCIENT_WORLD_DEBUG__ = {
  city: CITY,
  get player() {
    return {
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      pitch: player.pitch,
      floorY: player.floorY,
      surfaceTag: player.surfaceTag,
      speed: player.speed,
      sprint: player.sprint,
    };
  },
  teleport,
  teleportToPoint,
  collide: traversal.collide,
  absoluteSupportAt: traversal.absoluteSupportAt,
  resolveSupport: traversal.resolveSupport,
  resolveSpawn: traversal.resolveSpawn,
  moveWithSubsteps: traversal.moveWithSubsteps,
  traversal: () => ({ ...traversal.config, ...traversal.stats() }),
  geometry: () => ({ vertices: geometry.length / 9, triangles: geometry.length / 27 }),
  colliders,
  walkSurfaces,
};

traversal.snapPlayerToSupport();
drawRegionalMap();
lifecycle.frame(tick);
