import { CITY, SOURCES, REGIONS, STREETS, BUILDINGS, TELEPORTS } from '../data/city.js';
import {
  createTraversalSystem,
  rectCollider,
  walkRect,
  walkRamp,
} from '../../../ancient-world/engine/traversal.js';
import { createLifecycle } from '../../../ancient-world/engine/lifecycle.js';
import { createAdaptiveQualityController } from '../../../ancient-world/engine/performance.js';
import { installMobileControls } from '../../../ancient-world/engine/mobile-controls.js';
import { ANCIENT_CITY_FRAGMENT_SHADER } from '../../../ancient-world/engine/surface-shader.js';
import {
  createAncientSkyRenderer,
  createAncientWaterRenderer,
  waterRect,
  waterRibbon,
} from '../../../ancient-world/engine/environment-renderer.js';
import { installBackToOS } from '../../../ancient-world/engine/navigation.js';
import { ANCIENT_MATERIALS as M } from '../../../ancient-world/assets/materials.js';
import { evidenceForRecord, evidenceBadgeHTML, installEvidenceStyles } from '../../../ancient-world/engine/evidence.js';
import { HILLS, ERIDANOS, ILISSOS, KEPHISSOS, terrainHeightAt, terrainDescriptorAt } from '../data/terrain.js';
import { generateUrbanFabric, URBAN_FABRIC_METHOD } from '../data/urban-fabric.js';
import { ATHENS_MANIFEST } from '../data/manifest.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const canvas = $('#glCanvas');
const overlayCanvas = $('#overlay');
const gl = canvas?.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
if (!gl) throw new Error('WebGL is unavailable.');

const lifecycle = createLifecycle();
const TOUCH = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
const FINE_POINTER = matchMedia('(pointer:fine)').matches;
const WORLD_BOUNDS = ATHENS_MANIFEST.bounds;
const EYE_HEIGHT = 1.68;
const WALK_SPEED = 3.8;
const SPRINT_SPEED = 7.2;
const quality = createAdaptiveQualityController({
  mobile: TOUCH,
  highPixelRatio: ATHENS_MANIFEST.performance.maxPixelRatioDesktop,
  balancedPixelRatio: TOUCH ? ATHENS_MANIFEST.performance.maxPixelRatioMobile : 1.30,
  lowPixelRatio: TOUCH ? 0.85 : 1.0,
});

const C = {
  ...M,
  white: M.plaster,
};

const stateColor = {
  standing: C.marble,
  working: C.brick,
  new: C.marbleLight,
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

function pitchedBuilding(x, y, z, width, height, depth, color, rot = 0) {
  const wallHeight = height * 0.72;
  box(x, y, z, width, wallHeight, depth, color, rot);
  const y0 = y + wallHeight;
  const top = y + height;
  const corners = [
    [-width / 2, -depth / 2],
    [ width / 2, -depth / 2],
    [ width / 2,  depth / 2],
    [-width / 2,  depth / 2],
  ].map(([lx, lz]) => {
    const [rx, rz] = rotateXZ(x + lx, z + lz, x, z, rot);
    return [rx, y0, rz];
  });
  const ridgeA2 = rotateXZ(x, z - depth / 2, x, z, rot);
  const ridgeB2 = rotateXZ(x, z + depth / 2, x, z, rot);
  const ridgeA = [ridgeA2[0], top, ridgeA2[1]];
  const ridgeB = [ridgeB2[0], top, ridgeB2[1]];
  tri(corners[0], corners[1], ridgeA, C.roof);
  tri(corners[2], corners[3], ridgeB, C.roof);
  quad(corners[0], ridgeA, ridgeB, corners[3], C.roof);
  quad(ridgeA, corners[1], corners[2], ridgeB, C.roof);
  // Aizanoi-style ridge cap makes roof silhouettes read at street level.
  box(x, top - 0.08, z, 0.28, 0.16, depth + 0.55, C.roof2 || C.roof, rot);
}

function arch(x, y, z, width, height, depth, color) {
  const pierWidth = Math.max(2.2, width * 0.24);
  const opening = Math.max(3, width - pierWidth * 2);
  const spring = height * 0.62;
  box(x - (opening + pierWidth) / 2, y, z, pierWidth, spring, depth, color);
  box(x + (opening + pierWidth) / 2, y, z, pierWidth, spring, depth, color);
  box(x, y + spring, z, width, height - spring, depth, color);
}

function baseY(buildingOrX, z = null) {
  if (typeof buildingOrX === 'object') return terrainHeightAt(buildingOrX.x, buildingOrX.z);
  return terrainHeightAt(buildingOrX, z);
}

function temple(building, color) {
  const ground = baseY(building);
  const base = Math.max(1.2, building.h * 0.16);
  box(building.x, ground, building.z, building.w, base, building.d, color);
  const columns = Math.max(4, Math.round(building.w / 10));
  for (let i = 0; i < columns; i++) {
    const x = building.x - building.w * 0.4 + i * (building.w * 0.8 / Math.max(1, columns - 1));
    cylinder(x, ground + base, building.z - building.d * 0.34, 1.35, building.h * 0.55, C.marbleLight, 10);
    cylinder(x, ground + base, building.z + building.d * 0.34, 1.35, building.h * 0.55, C.marbleLight, 10);
  }
  pitchedBuilding(building.x, ground + base, building.z, building.w * 0.82, building.h - base, building.d * 0.62, color);
}

function parthenonHero(building, color) {
  const ground = baseY(building);
  const podiumH = Math.max(1.25, building.h * 0.12);
  // Three visible stylobate steps, exaggerated only enough to read at WebGL scale.
  for (let step = 0; step < 3; step++) {
    const inset = step * 0.55;
    box(
      building.x,
      ground + step * (podiumH / 3),
      building.z,
      building.w + 3.2 - inset * 2,
      podiumH / 3 + 0.04,
      building.d + 3.2 - inset * 2,
      step === 2 ? C.marbleLight : C.limestone,
    );
  }

  const stylobate = ground + podiumH;
  const columnH = building.h * 0.56;
  const radius = Math.max(0.38, Math.min(0.62, building.w / 86));
  const frontCount = TOUCH ? 8 : 8;
  const sideCount = TOUCH ? 13 : 17;
  const xMin = building.x - building.w * 0.44;
  const xMax = building.x + building.w * 0.44;
  const zMin = building.z - building.d * 0.44;
  const zMax = building.z + building.d * 0.44;

  for (let i = 0; i < frontCount; i++) {
    const x = xMin + (xMax - xMin) * (i / (frontCount - 1));
    cylinder(x, stylobate, zMin, radius, columnH, C.marbleLight, TOUCH ? 8 : 12);
    cylinder(x, stylobate, zMax, radius, columnH, C.marbleLight, TOUCH ? 8 : 12);
  }
  for (let i = 1; i < sideCount - 1; i++) {
    const z = zMin + (zMax - zMin) * (i / (sideCount - 1));
    cylinder(xMin, stylobate, z, radius, columnH, C.marbleLight, TOUCH ? 8 : 12);
    cylinder(xMax, stylobate, z, radius, columnH, C.marbleLight, TOUCH ? 8 : 12);
  }

  // Cella + pronaos massing. The peristyle remains visually separate.
  box(building.x, stylobate + 0.05, building.z, building.w * 0.52, columnH * 0.88, building.d * 0.50, color);
  const entablatureY = stylobate + columnH;
  box(building.x, entablatureY, building.z, building.w * 0.94, 1.15, building.d * 0.94, C.marble);
  pitchedBuilding(
    building.x,
    entablatureY + 1.10,
    building.z,
    building.w * 0.88,
    Math.max(3.2, building.h * 0.22),
    building.d * 0.84,
    C.marbleLight,
  );
}

function propylaeaHero(building, color) {
  const ground = baseY(building);
  const podium = 0.75;
  box(building.x, ground, building.z, building.w + 2.2, podium, building.d + 2.0, C.limestone);
  const hallY = ground + podium;
  pitchedBuilding(building.x, hallY, building.z, building.w * 0.60, building.h - podium, building.d * 0.74, color);
  const wingW = building.w * 0.19;
  box(building.x - building.w * 0.39, hallY, building.z, wingW, building.h * 0.62, building.d * 0.88, C.marble);
  box(building.x + building.w * 0.39, hallY, building.z, wingW, building.h * 0.62, building.d * 0.88, C.marble);
  const columns = building.id === 'propylaea' ? 6 : 4;
  for (let i = 0; i < columns; i++) {
    const x = building.x - building.w * 0.25 + i * (building.w * 0.50 / Math.max(1, columns - 1));
    cylinder(x, hallY, building.z - building.d * 0.42, 0.48, building.h * 0.52, C.marbleLight, 10);
  }
}

function hephaisteionHero(building, color) {
  const ground = baseY(building);
  const podium = Math.max(.9, building.h * .12);
  for (let step = 0; step < 3; step++) box(building.x, ground + step * .23, building.z, building.w + 2.2 - step * .55, .26, building.d + 2.0 - step * .50, C.limestone);
  const y = ground + podium;
  const colH = building.h * .56;
  const x0 = building.x - building.w * .43, x1 = building.x + building.w * .43;
  const z0 = building.z - building.d * .43, z1 = building.z + building.d * .43;
  for (let i = 0; i < 6; i++) {
    const x = x0 + (x1 - x0) * i / 5;
    cylinder(x, y, z0, .42, colH, C.marbleLight, TOUCH ? 8 : 11);
    cylinder(x, y, z1, .42, colH, C.marbleLight, TOUCH ? 8 : 11);
  }
  for (let i = 1; i < 12; i++) {
    const z = z0 + (z1 - z0) * i / 12;
    cylinder(x0, y, z, .42, colH, C.marbleLight, TOUCH ? 8 : 11);
    cylinder(x1, y, z, .42, colH, C.marbleLight, TOUCH ? 8 : 11);
  }
  box(building.x, y + .02, building.z, building.w * .54, colH * .88, building.d * .52, color);
  box(building.x, y + colH, building.z, building.w * .94, .72, building.d * .92, C.marble);
  pitchedBuilding(building.x, y + colH + .68, building.z, building.w * .88, Math.max(2.1, building.h * .22), building.d * .84, C.marbleLight);
}

function dionysusTheatreHero(building, color) {
  theatre(building, color);
  const ground = baseY(building);
  // Packed-earth orchestra and a light timber skene better match the Classical
  // period than a later monumental Roman-style stage building.
  cylinder(building.x, ground + .08, building.z + building.d * .12, Math.min(building.w, building.d) * .18, .12, C.roadLight, TOUCH ? 20 : 32);
  box(building.x, ground + .12, building.z - building.d * .26, building.w * .58, 3.1, 4.4, C.timber, building.rot || 0);
}

function stoaHero(building, color) {
  const ground = baseY(building);
  const rot = building.rot || 0;
  box(building.x, ground, building.z, building.w, .52, building.d, C.limestone, rot);
  const colCount = TOUCH ? Math.max(5, Math.round(building.w / 9)) : Math.max(7, Math.round(building.w / 6));
  for (let i = 0; i < colCount; i++) {
    const side = -building.w * .43 + i * (building.w * .86 / Math.max(1, colCount - 1));
    const p = facadePoint({ ...building, rot }, side, building.d * .42);
    cylinder(p[0], ground + .52, p[1], .34, building.h * .60, C.marbleLight, 8);
  }
  pitchedBuilding(building.x, ground + .52, building.z, building.w * .94, building.h - .52, building.d * .76, color, rot);
}

function ellipticalCylinder(cx, y, cz, rx, rz, height, color, segments = 36) {
  const count = TOUCH ? Math.min(segments, 28) : segments;
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2;
    const b = (i + 1) / count * Math.PI * 2;
    const p0 = [cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz];
    const p1 = [cx + Math.cos(b) * rx, y, cz + Math.sin(b) * rz];
    const p2 = [p1[0], y + height, p1[2]];
    const p3 = [p0[0], y + height, p0[2]];
    quad(p0, p1, p2, p3, color);
  }
}

function roundBuilding(building, color) {
  const ground = baseY(building);
  const radius = Math.min(building.w, building.d) / 2;
  cylinder(building.x, ground, building.z, radius, building.h * 0.62, color, 24);
  for (let ring = 0; ring < 4; ring++) {
    cylinder(
      building.x,
      ground + building.h * (0.62 + ring * 0.085),
      building.z,
      radius * (0.78 - ring * 0.1),
      building.h * 0.09,
      ring % 2 ? C.marble : color,
      24,
    );
  }
}

function pantheon(building, color) {
  const ground = baseY(building);
  const radius = Math.min(building.w, building.d) * 0.38;
  const wallH = building.h * 0.48;
  cylinder(building.x, ground, building.z + building.d * 0.08, radius, wallH, C.brick, 36);
  for (let ring = 0; ring < 8; ring++) {
    const t = ring / 7;
    const r = radius * Math.cos(t * Math.PI * 0.47);
    const nextT = Math.min(1, (ring + 1) / 7);
    const y = ground + wallH + Math.sin(t * Math.PI * 0.5) * building.h * 0.42;
    const nextY = ground + wallH + Math.sin(nextT * Math.PI * 0.5) * building.h * 0.42;
    ellipticalCylinder(building.x, y, building.z + building.d * 0.08, Math.max(2.2, r), Math.max(2.2, r), Math.max(0.6, nextY - y), ring % 2 ? C.limestone : color, 32);
  }
  const porticoZ = building.z - building.d * 0.36;
  box(building.x, ground + 0.3, porticoZ, building.w * 0.82, 1.2, building.d * 0.24, C.marble);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 8; col++) {
      const x = building.x - building.w * 0.34 + col * (building.w * 0.68 / 7);
      cylinder(x, ground + 1.5, porticoZ + (row ? 5 : -5), 0.72, building.h * 0.28, C.marbleLight, 10);
    }
  }
  pitchedBuilding(building.x, ground + building.h * 0.28, porticoZ, building.w * 0.88, building.h * 0.20, building.d * 0.28, C.marbleLight);
}

function theatre(building, color) {
  const ground = baseY(building);
  const radius = Math.max(building.w, building.d) * 0.46;
  const rows = TOUCH ? 6 : 10;
  const segments = TOUCH ? 15 : 24;
  const orientation = building.rot || 0;
  // Stepped semicircular cavea: substantially closer to a theatre silhouette
  // than the old stack of full cylinders, while staying procedural.
  for (let row = 0; row < rows; row++) {
    const t = row / Math.max(1, rows - 1);
    const r = radius * (0.34 + t * 0.62);
    const rise = ground + row * Math.max(0.34, building.h * 0.052);
    const seatDepth = Math.max(1.5, radius * 0.052);
    const arcWidth = Math.max(2.1, Math.PI * r / segments * 0.92);
    for (let i = 0; i < segments; i++) {
      const a = (i / Math.max(1, segments - 1)) * Math.PI;
      const lx = Math.cos(a) * r;
      const lz = Math.sin(a) * r;
      const [x, z] = rotateXZ(building.x + lx, building.z + lz, building.x, building.z, orientation);
      box(x, rise, z, arcWidth, 0.42 + t * 0.22, seatDepth, row % 2 ? C.limestone : color, orientation + a + Math.PI / 2);
    }
  }
  const [stageX, stageZ] = rotateXZ(building.x, building.z - radius * 0.18, building.x, building.z, orientation);
  box(stageX, ground, stageZ, building.w * 0.74, Math.max(2.8, building.h * 0.30), Math.max(5, building.d * 0.16), C.brick, orientation);
  box(stageX, ground + Math.max(2.8, building.h * 0.30), stageZ, building.w * 0.78, 0.38, Math.max(5.4, building.d * 0.17), C.limestone, orientation);
}

function longStadium(building, color) {
  const ground = baseY(building);
  const long = Math.max(building.w, building.d);
  const short = Math.min(building.w, building.d);
  const alongX = building.w >= building.d;
  const straight = long * 0.66;
  const standH = Math.max(3, building.h * 0.68);
  if (alongX) {
    box(building.x, ground, building.z - short * 0.42, straight, standH, short * 0.12, color);
    box(building.x, ground, building.z + short * 0.42, straight, standH, short * 0.12, color);
    ellipticalCylinder(building.x - straight / 2, ground, building.z, short * 0.46, short * 0.46, standH * 0.72, C.limestone, 20);
    ellipticalCylinder(building.x + straight / 2, ground, building.z, short * 0.46, short * 0.46, standH * 0.72, C.limestone, 20);
    box(building.x, ground + 0.05, building.z, straight, 0.12, short * 0.56, C.road);
  } else {
    box(building.x - short * 0.42, ground, building.z, short * 0.12, standH, straight, color);
    box(building.x + short * 0.42, ground, building.z, short * 0.12, standH, straight, color);
    ellipticalCylinder(building.x, ground, building.z - straight / 2, short * 0.46, short * 0.46, standH * 0.72, C.limestone, 20);
    ellipticalCylinder(building.x, ground, building.z + straight / 2, short * 0.46, short * 0.46, standH * 0.72, C.limestone, 20);
    box(building.x, ground + 0.05, building.z, short * 0.56, 0.12, straight, C.road);
  }
}

function colosseum(building, color) {
  const ground = baseY(building);
  const rx = building.w / 2;
  const rz = building.d / 2;
  const tiers = 4;
  for (let tier = 0; tier < tiers; tier++) {
    const y = ground + tier * building.h / tiers;
    const shrink = tier * 1.8;
    ellipticalCylinder(building.x, y, building.z, rx - shrink, rz - shrink, building.h / tiers - 0.6, tier % 2 ? C.limestone : color, 48);
    // Arcade rhythm: dark recess markers around the ellipse make the monument
    // read as architecture rather than nested cylinders, without texture assets.
    const arcadeCount = TOUCH ? 28 : 44;
    for (let i = 0; i < arcadeCount; i++) {
      const a = i / arcadeCount * Math.PI * 2;
      const x = building.x + Math.cos(a) * (rx - shrink + 0.16);
      const z = building.z + Math.sin(a) * (rz - shrink + 0.16);
      box(x, y + building.h / tiers * 0.22, z, 1.1, building.h / tiers * 0.48, 0.55, C.brickDark, -a);
    }
  }
}

function amphitheatre(building, color) {
  if (building.id === 'colosseum') return colosseum(building, color);
  const ground = baseY(building);
  for (let ring = 0; ring < 5; ring++) {
    cylinder(
      building.x,
      ground + building.h * ring / 5,
      building.z,
      Math.max(building.w, building.d) * (0.52 - ring * 0.04),
      building.h / 5,
      ring % 2 ? C.limestone : color,
      36,
    );
  }
}

function bath(building, color) {
  const ground = baseY(building);
  box(building.x, ground, building.z, building.w, building.h * 0.38, building.d, color);
  for (let i = -2; i <= 2; i++) {
    for (let j = -1; j <= 1; j++) {
      cylinder(
        building.x + i * building.w * 0.13,
        ground + building.h * 0.38,
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
  const ground = baseY(building);
  const naveWidth = building.w * 0.54;
  pitchedBuilding(building.x, ground, building.z, naveWidth, building.h, building.d * 0.78, color);
  box(building.x - building.w * 0.38, ground, building.z, building.w * 0.22, building.h * 0.55, building.d * 0.72, C.brick);
  box(building.x + building.w * 0.38, ground, building.z, building.w * 0.22, building.h * 0.55, building.d * 0.72, C.brick);
  cylinder(building.x, ground, building.z + building.d * 0.39, Math.min(building.w, building.d) * 0.18, building.h * 0.6, church ? C.plaster : color, 18);
  if (church) {
    const atriumZ = building.z - building.d * 0.58;
    box(building.x, ground + 0.06, atriumZ, building.w * 0.82, 0.18, building.d * 0.25, C.road);
    for (let i = -3; i <= 3; i++) {
      cylinder(building.x + i * building.w * 0.095, ground + 0.24, atriumZ - building.d * 0.08, 0.42, 4.2, C.marbleLight, 8);
    }
  }
}

function forum(building, color) {
  const ground = baseY(building);
  const paving = ground + 0.16;
  box(building.x, ground, building.z, building.w, 0.16, building.d, C.road);
  walkSurfaces.push(walkRect(building.x, building.z, building.w - 1, building.d - 1, paving, 0, `${building.id} paving`, false));
  const step = Math.max(14, Math.min(building.w, building.d) / 5);
  for (let x = building.x - building.w * 0.42; x <= building.x + building.w * 0.42; x += step) {
    cylinder(x, paving, building.z - building.d * 0.43, 0.75, 6, C.marbleLight, 10);
    cylinder(x, paving, building.z + building.d * 0.43, 0.75, 6, C.marbleLight, 10);
  }
  box(building.x, paving + 0.02, building.z, 2.6, 1.2, 2.6, color);
}

function market(building, color) {
  const ground = baseY(building);
  const court = ground + 0.14;
  box(building.x, ground, building.z, building.w, 0.14, building.d, C.road);
  walkSurfaces.push(walkRect(building.x, building.z, building.w - 1, building.d - 1, court, 0, `${building.id} court`, false));
  for (let i = -2; i <= 2; i++) {
    box(building.x + i * building.w * 0.16, court, building.z - building.d * 0.37, building.w * 0.11, 3.2, building.d * 0.16, color);
    box(building.x + i * building.w * 0.16, court, building.z + building.d * 0.37, building.w * 0.11, 3.2, building.d * 0.16, color);
  }
}

function palace(building, color) {
  const ground = baseY(building);
  const wingW = building.w * 0.28;
  const wingD = building.d * 0.28;
  box(building.x - building.w * 0.34, ground, building.z, wingW, building.h * 0.75, building.d, color);
  box(building.x + building.w * 0.34, ground, building.z, wingW, building.h * 0.75, building.d, color);
  box(building.x, ground, building.z - building.d * 0.34, building.w * 0.55, building.h * 0.65, wingD, C.brick);
  box(building.x, ground, building.z + building.d * 0.34, building.w * 0.55, building.h * 0.65, wingD, C.brick);
}

function insula(building, color) {
  const ground = baseY(building);
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
      pitchedBuilding(x, ground, z, cellW, height, cellD, col % 2 ? C.brickDark : color);
    }
  }
}

function warehouse(building, color) {
  const ground = baseY(building);
  for (let i = -2; i <= 2; i++) {
    pitchedBuilding(
      building.x + i * building.w * 0.17,
      ground,
      building.z,
      building.w * 0.14,
      building.h * (0.72 + (i % 2 ? 0.08 : 0)),
      building.d * 0.86,
      color,
    );
  }
}

function garden(building) {
  const ground = baseY(building);
  box(building.x, ground, building.z, building.w, 0.08, building.d, C.grass);
  for (let i = 0; i < 18; i++) {
    const angle = i * 2.399;
    const radius = (i % 7) / 7;
    const x = building.x + Math.cos(angle) * building.w * 0.42 * radius;
    const z = building.z + Math.sin(angle) * building.d * 0.42 * radius;
    const y = terrainHeightAt(x, z) + 0.08;
    cylinder(x, y, z, 0.35, 2.8 + (i % 4) * 0.6, C.timber, 7);
    cylinder(x, y + 2.0, z, 1.4 + (i % 3) * 0.4, 1.8, C.vegetation, 8);
  }
}

function cemetery(building) {
  const ground = baseY(building);
  box(building.x, ground, building.z, building.w, 0.06, building.d, C.earth);
  for (let i = 0; i < 20; i++) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = building.x - building.w * 0.36 + col * building.w * 0.18;
    const z = building.z - building.d * 0.32 + row * building.d * 0.21;
    box(x, terrainHeightAt(x, z) + 0.06, z, 2.2 + (i % 2), 1.1 + (i % 3) * 0.35, 3.2, C.rubble);
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
  const ground = baseY(building);
  const deckY = Math.max(ground + 4.4, 3.8);
  box(building.x, ground - 0.3, building.z, building.w, deckY - ground + 0.3, building.d, color);
  // Atina bridges (Ilissos, sacred-gate) span small streams; simple stone arches.
  for (let i = -building.w * 0.3; i <= building.w * 0.3; i += building.w * 0.3) {
    arch(building.x + i, ground - 0.3, building.z, building.w * 0.3, deckY - ground, building.d, C.limestone);
  }
  const approach = 14;
  const leftStart = building.x - building.w / 2 - approach;
  const leftEnd = building.x - building.w / 2;
  const rightStart = building.x + building.w / 2;
  const rightEnd = building.x + building.w / 2 + approach;
  const leftGround = terrainHeightAt(leftStart, building.z) + 0.06;
  const rightGround = terrainHeightAt(rightStart, building.z) + 0.06;
  addRampGeometry(leftStart, building.z, leftGround, leftEnd, building.z, deckY, building.d - 1, C.road);
  addRampGeometry(rightStart, building.z, rightGround, rightEnd, building.z, deckY, building.d - 1, C.road);
  walkSurfaces.push(walkRect(building.x, building.z, building.w - 1, building.d - 1, deckY, 0, `${building.id} deck`, false));
  walkSurfaces.push(walkRamp(leftStart, building.z, leftGround, leftEnd, building.z, deckY, building.d - 1, `${building.id} west approach`, true));
  walkSurfaces.push(walkRamp(rightStart, building.z, rightGround, rightEnd, building.z, deckY, building.d - 1, `${building.id} east approach`, true));
}

function gateNearby(x, z, padding = 34) {
  return gates.some((gate) => Math.hypot(gate.x - x, gate.z - z) < padding + Math.max(gate.w, gate.d) * 0.5);
}

function wall(building) {
  const { w, d, h } = building;
  const addSegment = (x, z, width, depth) => {
    if (gateNearby(x, z)) return;
    const ground = terrainHeightAt(x, z);
    box(x, ground, z, width, h, depth, C.wall);
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
      const x = building.x + i;
      if (!gateNearby(x, z, 26)) box(x, terrainHeightAt(x, z), z, 13, h + 6, 13, C.wall);
    }
  }
}

function road(points, width) {
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz) || 1;
    const pieces = Math.max(1, Math.ceil(length / (TOUCH ? 30 : 22)));
    const nx = -dz / length;
    const nz = dx / length;
    for (let piece = 0; piece < pieces; piece++) {
      const t0 = piece / pieces;
      const t1 = (piece + 1) / pieces;
      const x0 = a[0] + dx * t0;
      const z0 = a[1] + dz * t0;
      const x1 = a[0] + dx * t1;
      const z1 = a[1] + dz * t1;
      const y0 = terrainHeightAt(x0, z0) + 0.055;
      const y1 = terrainHeightAt(x1, z1) + 0.055;
      const half = width / 2;
      quad(
        [x0 + nx * half, y0, z0 + nz * half],
        [x1 + nx * half, y1, z1 + nz * half],
        [x1 - nx * half, y1, z1 - nz * half],
        [x0 - nx * half, y0, z0 - nz * half],
        C.road,
      );
      for (const side of [-1, 1]) {
        const edge = half - 0.28;
        const e0 = [x0 + nx * side * edge, y0 + 0.028, z0 + nz * side * edge];
        const e1 = [x1 + nx * side * edge, y1 + 0.028, z1 + nz * side * edge];
        const outer = edge + side * 0.18;
        const o0 = [x0 + nx * side * outer, y0 + 0.028, z0 + nz * side * outer];
        const o1 = [x1 + nx * side * outer, y1 + 0.028, z1 + nz * side * outer];
        quad(e0, e1, o1, o0, C.roadEdge);
      }
    }
  }
}

function scatteredRubble(building) {
  const count = TOUCH ? Math.max(5, Math.floor(building.w * building.d / 320)) : Math.max(8, Math.floor(building.w * building.d / 180));
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399;
    const radius = (i % 7) / 7 * Math.max(building.w, building.d) * 0.42;
    const x = building.x + Math.cos(angle) * radius;
    const z = building.z + Math.sin(angle) * radius;
    box(
      x,
      terrainHeightAt(x, z) + 0.02,
      z,
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
  colliders.push(rectCollider(building.x, building.z, building.w, building.d, building.rot || 0, building.name));
}

function renderBuilding(building) {
  const color = stateColor[building.state] || stateColor.default;
  registerSolidFootprint(building);
  const ground = baseY(building);

  if (building.type === 'wall') return wall(building);
  if (building.type === 'gate') return arch(building.x, ground, building.z, building.w, building.h, building.d, color);
  if (building.id === 'parthenon') parthenonHero(building, color);
  else if (building.id === 'propylaea' || building.id === 'propylaea-east') propylaeaHero(building, color);
  else if (building.id === 'hephaisteion') hephaisteionHero(building, color);
  else if (building.id === 'theatre-dionysus') dionysusTheatreHero(building, color);
  else if (String(building.type).toLowerCase() === 'stoa') stoaHero(building, color);
  else if (building.type === 'temple') temple(building, color);
  else if (['round', 'dome', 'round-church', 'mausoleum'].includes(building.type)) roundBuilding(building, color);
  else if (['stadium', 'circus', 'arena'].includes(building.type)) longStadium(building, color);
  else if (building.type === 'theatre') theatre(building, color);
  else if (building.type === 'amphitheatre') amphitheatre(building, color);
  else if (building.type === 'bath') bath(building, color);
  else if (building.type === 'arch') arch(building.x, ground, building.z, building.w, building.h, building.d, color);
  else if (building.type === 'column') cylinder(building.x, ground, building.z, Math.max(1.1, building.w * 0.18), building.h, C.marbleLight, 18);
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
    for (let i = -building.w / 2; i <= building.w / 2; i += 16) {
      const x = building.x + i;
      arch(x, terrainHeightAt(x, building.z), building.z, 13, building.h, building.d, color);
    }
  }
  else if (building.type === 'bridge') bridge(building, color);
  else if (building.type === 'island') {
    const islandY = ground + 0.35;
    box(building.x, ground - 0.15, building.z, building.w, 0.5, building.d, C.grass);
    walkSurfaces.push(walkRect(building.x, building.z, building.w - 2, building.d - 2, islandY, 0, `${building.id} surface`, false));
  }
  else if (building.type === 'pyramid') pitchedBuilding(building.x, ground, building.z, building.w, building.h, building.d, color);
  else pitchedBuilding(building.x, ground, building.z, building.w, building.h, building.d, color);

  if (['ruined', 'damaged', 'spoliated'].includes(building.state)) scatteredRubble(building);
}

function terrainColor(x, z, y) {
  const nearEridanos = Math.abs(x - ERIDANOS.x) < ERIDANOS.halfWidth + 22;
  const variation = ((Math.sin(x * 0.027) + Math.sin(z * 0.021)) * 0.5 + 1) * 0.5;
  const base = (y > 6 || nearEridanos === false && y > 4) ? C.grass : C.earth;
  // Use the marble-tinted limestone for hilltops, grass for gentle slopes, earth for valley floors.
  const palette = nearEridanos ? C.earth : (y > 6 ? C.grass : (y > 1.5 ? C.brick : C.earth));
  return palette.map((value, index) => Math.max(0, Math.min(1, value * (0.90 + variation * 0.13 + index * 0.004))));
}

function buildTerrainMesh() {
  const step = TOUCH ? 42 : 30;
  for (let z = WORLD_BOUNDS.minZ; z < WORLD_BOUNDS.maxZ; z += step) {
    for (let x = WORLD_BOUNDS.minX; x < WORLD_BOUNDS.maxX; x += step) {
      const x1 = Math.min(WORLD_BOUNDS.maxX, x + step);
      const z1 = Math.min(WORLD_BOUNDS.maxZ, z + step);
      const y00 = terrainHeightAt(x, z);
      const y10 = terrainHeightAt(x1, z);
      const y11 = terrainHeightAt(x1, z1);
      const y01 = terrainHeightAt(x, z1);
      const color = terrainColor((x + x1) / 2, (z + z1) / 2, (y00 + y10 + y11 + y01) / 4);
      quad([x, y00, z], [x1, y10, z], [x1, y11, z1], [x, y01, z1], color);
    }
  }
}

function buildEridanosWater() {
  const x0 = ERIDANOS.x - ERIDANOS.halfWidth;
  const x1 = ERIDANOS.x + ERIDANOS.halfWidth;
  const z0 = WORLD_BOUNDS.minZ;
  const z1 = WORLD_BOUNDS.maxZ;
  quad([x0, ERIDANOS.waterY, z0], [x1, ERIDANOS.waterY, z0], [x1, ERIDANOS.waterY, z1], [x0, ERIDANOS.waterY, z1], C.water);
}

function buildIlissosWater() {
  // The Ilissos runs roughly north-west/south-east south of the walled town.
  // Carve a narrow water plane along its trough.
  const length = 320;
  const a = Math.atan2(1, 0.4);
  const half = ILISSOS.halfWidth;
  const dx = Math.cos(a + Math.PI / 2) * half;
  const dz = Math.sin(a + Math.PI / 2) * half;
  const c = ILISSOS.x, z0 = ILISSOS.zOffset;
  quad([c - dx, ILISSOS.waterY, z0 - dz], [c + dx, ILISSOS.waterY, z0 + dz], [c + dx + length, ILISSOS.waterY, z0 + dz + length * 0.4], [c - dx + length, ILISSOS.waterY, z0 - dz + length * 0.4], C.water);
}

function buildStreamHazards() {
  // Eridanos: a north-south hazard in the Kerameikos corridor.
  return [
    { type: 'rect', cx: ERIDANOS.x, cz: WORLD_BOUNDS.minZ + 80, hx: ERIDANOS.halfWidth - 1.2, hz: 80, rot: 0, tag: 'Eridanos' },
    { type: 'rect', cx: ERIDANOS.x, cz: 240, hx: ERIDANOS.halfWidth - 1.2, hz: 80, rot: 0, tag: 'Eridanos' },
    { type: 'rect', cx: ERIDANOS.x, cz: WORLD_BOUNDS.maxZ - 80, hx: ERIDANOS.halfWidth - 1.2, hz: 80, rot: 0, tag: 'Eridanos' },
  ];
}

function facadePoint(building, side, front) {
  const rot = building.rot || 0;
  return [
    building.x + Math.cos(rot) * side - Math.sin(rot) * front,
    building.z + Math.sin(rot) * side + Math.cos(rot) * front,
  ];
}

function addAthenianStreetDetail(building, ground) {
  const rot = building.rot || 0;
  const front = building.d / 2 + 0.07;
  // Low stone base + plaster, timber openings and terracotta roof cues mirror
  // Aizanoi's street-level density without claiming excavated house elevations.
  box(building.x, ground, building.z, building.w + 0.22, 0.48, building.d + 0.22, C.limestone2, rot);
  let p = facadePoint(building, 0, front);
  box(p[0], ground + 0.48, p[1], Math.min(1.35, building.w * 0.18), 2.05, 0.15, C.timber, rot);
  const floors = Math.max(1, Math.min(2, building.floors || Math.round(building.h / 3.4)));
  if (floors > 1 && building.h > 5.1) {
    for (const side of [-0.25, 0.25]) {
      p = facadePoint(building, building.w * side, front + 0.02);
      box(p[0], ground + 3.10, p[1], Math.min(1.18, building.w * 0.16), 1.02, 0.13, C.darkStone, rot);
      box(p[0], ground + 4.12, p[1], Math.min(1.38, building.w * 0.18), 0.12, 0.18, C.limestone, rot);
    }
  }
  if (building.shopfront) {
    const shopSide = -building.w * 0.17;
    p = facadePoint(building, shopSide, front + 0.04);
    box(p[0], ground + 0.32, p[1], Math.min(3.0, building.w * 0.34), 2.15, 0.16, C.darkStone, rot);
    const awning = facadePoint(building, shopSide, front + 0.90);
    box(awning[0], ground + 2.42, awning[1], Math.min(3.55, building.w * 0.42), 0.09, 1.72, C.red, rot);
    if (!TOUCH) {
      const prop = facadePoint(building, building.w * 0.15, front + 0.62);
      cylinder(prop[0], ground + 0.02, prop[1], 0.20, 0.62, C.roof2, 8);
      cylinder(prop[0] + 0.50, ground + 0.02, prop[1] + 0.12, 0.17, 0.52, C.roof, 8);
    }
  }
}

function renderUrbanFabric(building) {
  const ground = terrainHeightAt(building.x, building.z);
  const material = building.material === 'brick' ? C.plaster2 : (C[building.material] || C.plaster3);
  if (building.courtyard) {
    const wingW = building.w * 0.38;
    pitchedBuilding(building.x - building.w * 0.28, ground, building.z, wingW, building.h, building.d, material, building.rot);
    pitchedBuilding(building.x + building.w * 0.28, ground, building.z, wingW, building.h * 0.92, building.d, material, building.rot);
  } else {
    pitchedBuilding(building.x, ground, building.z, building.w, building.h, building.d, material, building.rot);
  }
  addAthenianStreetDetail(building, ground);
  colliders.push(rectCollider(building.x, building.z, building.w, building.d, building.rot || 0, building.name));
}

function decorativeOlive(x, z, scale = 1) {
  const ground = terrainHeightAt(x, z);
  cylinder(x, ground, z, 0.24 * scale, 2.1 * scale, C.timber, 7);
  cylinder(x - 0.38 * scale, ground + 1.65 * scale, z, 1.18 * scale, 1.9 * scale, C.grass, TOUCH ? 7 : 10);
  cylinder(x + 0.52 * scale, ground + 1.8 * scale, z + 0.22 * scale, 1.05 * scale, 1.7 * scale, C.grass, TOUCH ? 7 : 10);
}

function buildAtmosphericDetails() {
  REGIONS.forEach((region, index) => {
    const count = TOUCH ? 1 : (['agora','lower-city','piraeus'].includes(region.id) ? 4 : 2);
    for (let i = 0; i < count; i++) {
      const angle = index * 2.03 + i * 2.41;
      const x = region.x + Math.cos(angle) * Math.min(52, region.w * .30);
      const z = region.z + Math.sin(angle) * Math.min(48, region.d * .30);
      const occupied = BUILDINGS.some((building) => Math.abs(building.x - x) < building.w * .62 && Math.abs(building.z - z) < building.d * .62);
      if (occupied) continue;
      decorativeOlive(x, z, .80 + ((index + i) % 3) * .13);
      if (!TOUCH && (region.id === 'agora' || region.id === 'piraeus') && i % 2 === 1) {
        const y = terrainHeightAt(x + 2.2, z + 1.6);
        cylinder(x + 2.2, y + .02, z + 1.6, .20, .62, C.roof2, 8);
        cylinder(x + 2.75, y + .02, z + 1.85, .16, .50, C.roof, 8);
        box(x + 3.45, y + .02, z + 1.5, 1.15, .60, .82, C.timber, angle * .18);
      }
    }
  });
}

// Terrain is the physical and visual base. Roads, named monuments and inferred
// fabric are then layered on top of exactly the same height function.
buildTerrainMesh();
buildEridanosWater();
buildIlissosWater();
for (const street of STREETS) road(street.points, street.width);
for (const building of BUILDINGS) renderBuilding(building);
const URBAN_FABRIC = generateUrbanFabric({ regions: REGIONS, buildings: BUILDINGS, streets: STREETS, mobile: TOUCH });
for (const building of URBAN_FABRIC) renderUrbanFabric(building);
buildAtmosphericDetails();
const ATHENS_HAZARDS = buildStreamHazards();

const player = {
  x: 110,
  y: EYE_HEIGHT,
  z: 230,
  yaw: Math.PI * 0.95,
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
  hazards: ATHENS_HAZARDS,
  bounds: WORLD_BOUNDS,
  baseHeightAt: terrainHeightAt,
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

const fragmentShader = ANCIENT_CITY_FRAGMENT_SHADER;

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

const skyRenderer = createAncientSkyRenderer(gl);
const waterRenderer = createAncientWaterRenderer(gl, [
  waterRect({
    x0: ERIDANOS.x - ERIDANOS.halfWidth,
    x1: ERIDANOS.x + ERIDANOS.halfWidth,
    z0: WORLD_BOUNDS.minZ,
    z1: WORLD_BOUNDS.maxZ,
    y: ERIDANOS.waterY + 0.035,
    color: C.water,
  }),
  waterRibbon({
    x0: ILISSOS.x - 40,
    z0: ILISSOS.zOffset - 16,
    x1: ILISSOS.x + 360,
    z1: ILISSOS.zOffset + 144,
    halfWidth: ILISSOS.halfWidth,
    y: ILISSOS.waterY + 0.035,
    color: C.water,
  }),
]);
lifecycle.addCleanup(() => { skyRenderer.destroy(); waterRenderer.destroy(); });

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
  const stable = Math.max(0.2, Math.min(1, 1 - Math.abs((player.floorY + EYE_HEIGHT) - player.y) * 3.2));
  const bob = Math.sin(walkClock * 2) * 0.017 * moveBlend * stable;
  const sway = Math.sin(walkClock) * 0.008 * moveBlend * stable;
  const cy = Math.cos(player.yaw);
  const sy = Math.sin(player.yaw);
  const eye = [player.x + cy * sway, player.y + bob, player.z + sy * sway];
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
let mobileControls = null;

function modalOpen() {
  return !$('#modal')?.classList.contains('hidden');
}

function clearMovementState() {
  keys.clear();
  mobileControls?.reset();
  last = performance.now();
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, quality.pixelRatioCap());
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
  const mobile = mobileControls?.snapshot() || { moveX: 0, moveY: 0, running: false };
  if (TOUCH) {
    forward += -mobile.moveY;
    right += mobile.moveX;
  }
  const moving = Boolean(forward || right);
  moveBlend += ((moving ? 1 : 0) - moveBlend) * Math.min(1, dt * 9);

  if (moving) {
    const length = Math.hypot(forward, right);
    if (length > 1) {
      forward /= length;
      right /= length;
    }
    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight') || mobile.running;
    const speed = sprinting ? player.sprint : player.speed;
    const sy = Math.sin(player.yaw);
    const cy = Math.cos(player.yaw);
    const dx = (sy * forward + cy * right) * speed * dt;
    const dz = (-cy * forward + sy * right) * speed * dt;
    traversal.moveWithSubsteps(dx, dz);
    walkClock += dt * (sprinting ? 9.5 : 6.2);
  }

  const targetEye = player.floorY + EYE_HEIGHT;
  const delta = targetEye - player.y;
  const settle = 1 - Math.exp(-dt * (delta >= 0 ? 22 : 18));
  player.y += delta * settle;
  if (Math.abs(targetEye - player.y) < 0.0015) player.y = targetEye;
}

function draw() {
  resize();
  const fog = modernOverlay ? [0.48, 0.60, 0.64] : [0.69, 0.67, 0.57];
  const fogDensity = TOUCH ? 0.00066 : 0.00050;
  const projection = perspective((TOUCH ? 72 : 69) * Math.PI / 180, canvas.width / canvas.height, 0.08, 2600);
  const view = camera();
  gl.clearColor(fog[0] * 0.91, fog[1] * 0.94, fog[2] * 0.98, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  skyRenderer.draw({
    top: modernOverlay ? [0.43, 0.57, 0.68] : [0.40, 0.58, 0.72],
    horizon: modernOverlay ? [0.66, 0.70, 0.68] : [0.83, 0.76, 0.59],
    yaw: player.yaw,
    pitch: player.pitch,
    sunYaw: 0.72,
  });
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

  gl.uniformMatrix4fv(locations.uP, false, projection);
  gl.uniformMatrix4fv(locations.uV, false, view);
  gl.uniform3fv(locations.uFog, new Float32Array(fog));
  gl.uniform3fv(locations.uSun, new Float32Array([0.36, 0.92, 0.24]));
  gl.uniform1f(locations.uAmbient, 0.52);
  gl.uniform1f(locations.uFogDensity, fogDensity);
  gl.drawArrays(gl.TRIANGLES, 0, geometry.length / 9);
  waterRenderer.draw({ projection, view, fog, fogDensity });

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
  ctx.fillText('MODERN ALIGNMENT OVERLAY · schematic relation to present-day Athens', 18, innerHeight - 24);
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
    const terrain = terrainDescriptorAt(player.x, player.z);
    $('#detail').textContent = `${stateLabel[best.state] || best.state} · ${best.region === 'all' ? 'city circuit' : `District · ${best.region}`} · ${terrain.feature} · ${player.floorY.toFixed(1)} m`;
  } else {
    $('#place').textContent = 'Street level';
    const terrain = terrainDescriptorAt(player.x, player.z);
    $('#detail').textContent = `Walk Classical Athens · ${terrain.feature} · ${player.floorY.toFixed(1)} m`;
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
  quality.sample(dt);
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

function teleportForwardClearance(candidate, building) {
  const dx = building.x - candidate.x;
  const dz = building.z - candidate.z;
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  let clear = 0;
  for (const distance of [1.25, 2.5, 4.0, 5.5]) {
    const x = candidate.x + ux * distance;
    const z = candidate.z + uz * distance;
    if (!traversal.collide(x, z)) clear += 1;
  }
  return clear;
}

function teleport(id) {
  const building = BUILDINGS.find((item) => item.id === id);
  if (!building) return false;
  const offsets = [
    [0, -building.d * 0.84 - 12],
    [building.w * 0.84 + 12, 0],
    [0, building.d * 0.84 + 12],
    [-building.w * 0.84 - 12, 0],
  ];
  const candidates = offsets.map(([ox, oz]) => {
    const candidate = traversal.resolveSpawn(building.x + ox, building.z + oz, 28);
    return {
      ...candidate,
      clearance: traversal.collide(candidate.x, candidate.z) ? -1 : teleportForwardClearance(candidate, building),
    };
  });
  candidates.sort((a, b) => b.clearance - a.clearance);
  let chosen = candidates.find((candidate) => candidate.clearance >= 3) || candidates[0];
  if (!chosen || chosen.clearance < 0) {
    chosen = traversal.resolveSpawn(building.x, building.z - building.d * 0.84 - 12, 30);
  }
  teleportToPoint(chosen.x, chosen.z, { lookX: building.x, lookZ: building.z, label: building.name });
  $('#jump').value = '';
  return true;
}

function openAtlas() {
  const rows = REGIONS.map((region) => `<button class="region" data-region="${region.id}"><b>${region.id} · ${region.name}</b><span>${region.note}</span></button>`).join('');
  setModal('District atlas · Classical Athens', `<p>The regional minimap is schematic; it is intended for orientation, not cadastral certainty.</p><div class="regionGrid">${rows}</div>`);
  $$('.region').forEach((element) => {
    element.onclick = () => {
      const region = REGIONS.find((item) => item.id === element.dataset.region);
      if (!region) return;
      closeModal();
      teleportToPoint(region.x, region.z, { label: region.name });
    };
  });
}

function openSources() {
  const rows = SOURCES.map((source) => `<li><a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title}</a></li>`).join('');
  setModal('Research sources', `<p>This reconstruction treats source links as an open research trail. Named monuments, major roads and the regional framework are source-led; unresolved domestic massing remains schematic where Classical-period elevation evidence is incomplete.</p><ul>${rows}</ul><p><a href="./research/">Open the local research notes →</a></p>`);
}

function nearestInfo() {
  const building = BUILDINGS.reduce((best, item) => (
    Math.hypot(item.x - player.x, item.z - player.z) < Math.hypot(best.x - player.x, best.z - player.z) ? item : best
  ), BUILDINGS[0]);
  const source = SOURCES.find((item) => item.id === building.source);
  const evidence = evidenceForRecord(building);
  setModal(
    building.name,
    `<p>${evidenceBadgeHTML(evidence)}</p><p><b>${stateLabel[building.state] || building.state}</b> · ${building.region === 'all' ? 'city circuit' : `District · ${building.region}`}</p><p>${building.detail}</p>${evidence.note ? `<p class="awEvidenceNote">${evidence.note}</p>` : ''}<p>Source: ${source ? `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.title}</a>` : 'Research ledger'}</p>`,
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
  let mouseDrag = null;
  let mouseDragDistance = 0;

  const applyMouseLook = (dx, dy, horizontal = 0.00315, vertical = 0.00285) => {
    // Match the mature Aizanoi convention: positive horizontal mouse motion
    // increases yaw, so moving/dragging right turns the view right.
    player.yaw += dx * horizontal;
    player.pitch = Math.max(-1.15, Math.min(0.85, player.pitch - dy * vertical));
  };

  lifecycle.listen(canvas, 'pointerdown', (event) => {
    if (TOUCH || !gameStarted || locked || modalOpen()) return;
    mouseDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    mouseDragDistance = 0;
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  lifecycle.listen(canvas, 'pointermove', (event) => {
    if (TOUCH || !mouseDrag || event.pointerId !== mouseDrag.id || locked || modalOpen()) return;
    const dx = event.clientX - mouseDrag.x;
    const dy = event.clientY - mouseDrag.y;
    mouseDrag.x = event.clientX;
    mouseDrag.y = event.clientY;
    mouseDragDistance += Math.abs(dx) + Math.abs(dy);
    applyMouseLook(dx, dy);
    event.preventDefault();
  });
  const finishMouseDrag = (event) => {
    if (!mouseDrag || event.pointerId !== mouseDrag.id) return;
    const shortClick = mouseDragDistance < 7;
    mouseDrag = null;
    if (shortClick && gameStarted && FINE_POINTER && !modalOpen()) canvas.requestPointerLock?.();
  };
  lifecycle.listen(canvas, 'pointerup', finishMouseDrag);
  lifecycle.listen(canvas, 'pointercancel', (event) => { if (mouseDrag?.id === event.pointerId) mouseDrag = null; });

  lifecycle.listen(document, 'pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
  lifecycle.listen(document, 'pointerlockerror', () => { locked = false; });
  lifecycle.listen(document, 'mousemove', (event) => {
    if (!locked || modalOpen()) return;
    applyMouseLook(event.movementX, event.movementY, 0.00185, 0.00165);
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

installEvidenceStyles();
installInput();
mobileControls = installMobileControls({
  canvas,
  lifecycle,
  enabled: TOUCH,
  isActive: () => gameStarted,
  isBlocked: modalOpen,
  onLook: (dx, dy) => {
    player.yaw += dx;
    player.pitch = Math.max(-1.15, Math.min(0.85, player.pitch - dy));
  },
  onInspect: nearestInfo,
  onMap: openAtlas,
});
installBackToOS({ onBeforeExit: () => lifecycle.destroy() });
lifecycle.listen(window, 'pagehide', () => lifecycle.destroy(), { once: true });

window.__ANCIENT_WORLD_DESTROY__ = () => lifecycle.destroy();
window.__ANCIENT_WORLD_DEBUG__ = {
  city: CITY,
  manifest: ATHENS_MANIFEST,
  quality: () => quality.snapshot(),
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
  geometry: () => ({ vertices: geometry.length / 9, triangles: geometry.length / 27, urbanFabric: URBAN_FABRIC.length }),
  terrainAt: terrainDescriptorAt,
  hills: HILLS,
  urbanFabric: URBAN_FABRIC,
  urbanFabricMethod: URBAN_FABRIC_METHOD,
  colliders,
  walkSurfaces,
  hazards: ATHENS_HAZARDS,
};

traversal.snapPlayerToSupport();
drawRegionalMap();
lifecycle.frame(tick);
