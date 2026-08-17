import { ROME_MANIFEST } from '../../../frontend/ancient-cities/rome-410-476/data/manifest.js';
import { BUILDINGS, STREETS, REGIONS } from '../../../frontend/ancient-cities/rome-410-476/data/city.js';
import { TIBER, terrainHeightAt, terrainNormalAt } from '../../../frontend/ancient-cities/rome-410-476/data/terrain.js';
import { generateUrbanFabric } from '../../../frontend/ancient-cities/rome-410-476/data/urban-fabric.js';
import {
  createTraversalSystem,
  rectCollider,
  walkRect,
  walkRamp,
} from '../../../frontend/ancient-world/engine/traversal.js';

const EYE_HEIGHT = 1.68;
const PASS_THROUGH = new Set(['wall', 'gate', 'arch', 'aqueduct', 'bridge', 'forum', 'market', 'garden', 'cemetery', 'island']);
const gates = BUILDINGS.filter((record) => record.type === 'gate');

function gateNearby(x, z, padding = 34) {
  return gates.some((gate) => Math.hypot(gate.x - x, gate.z - z) < padding + Math.max(gate.w, gate.d) * 0.5);
}

function wallColliders(record) {
  const colliders = [];
  const add = (x, z, width, depth) => {
    if (gateNearby(x, z)) return;
    colliders.push(rectCollider(x, z, width, depth, 0, record.name));
  };
  for (let i = -record.w / 2; i <= record.w / 2; i += 34) {
    add(record.x + i, record.z - record.d / 2, 32, 6);
    add(record.x + i, record.z + record.d / 2, 32, 6);
  }
  for (let i = -record.d / 2; i <= record.d / 2; i += 34) {
    add(record.x - record.w / 2, record.z + i, 6, 32);
    add(record.x + record.w / 2, record.z + i, 6, 32);
  }
  return colliders;
}

function bridgeSurfaces(record) {
  const ground = terrainHeightAt(record.x, record.z);
  const deckY = Math.max(ground + 5.2, 4.4);
  const approach = 20;
  const leftStart = record.x - record.w / 2 - approach;
  const leftEnd = record.x - record.w / 2;
  const rightStart = record.x + record.w / 2 + approach;
  const rightEnd = record.x + record.w / 2;
  const leftGround = terrainHeightAt(leftStart, record.z) + 0.06;
  const rightGround = terrainHeightAt(rightStart, record.z) + 0.06;
  return [
    walkRect(record.x, record.z, record.w - 1, record.d - 1, deckY, 0, `${record.id} deck`, false),
    walkRamp(leftStart, record.z, leftGround, leftEnd, record.z, deckY, record.d - 1, `${record.id} west approach`, true),
    walkRamp(rightStart, record.z, rightGround, rightEnd, record.z, deckY, record.d - 1, `${record.id} east approach`, true),
  ];
}

function tiberHazards() {
  const halfWidth = TIBER.halfWidth - 3;
  const gapMin = 65;
  const gapMax = 126;
  return [
    {
      type: 'rect',
      cx: TIBER.x,
      cz: (ROME_MANIFEST.bounds.minZ + gapMin) / 2,
      hx: halfWidth,
      hz: (gapMin - ROME_MANIFEST.bounds.minZ) / 2,
      rot: 0,
      tag: 'Tiber',
    },
    {
      type: 'rect',
      cx: TIBER.x,
      cz: (gapMax + ROME_MANIFEST.bounds.maxZ) / 2,
      hx: halfWidth,
      hz: (ROME_MANIFEST.bounds.maxZ - gapMax) / 2,
      rot: 0,
      tag: 'Tiber',
    },
  ];
}

export function createRomeSimulation({ mobile = false } = {}) {
  const colliders = [];
  const walkSurfaces = [];

  for (const record of BUILDINGS) {
    if (record.type === 'wall') {
      colliders.push(...wallColliders(record));
      continue;
    }
    if (record.type === 'bridge') {
      walkSurfaces.push(...bridgeSurfaces(record));
      continue;
    }
    if (!PASS_THROUGH.has(record.type)) {
      colliders.push(rectCollider(record.x, record.z, record.w, record.d, record.rot || 0, record.name));
    }
  }

  const urbanFabric = generateUrbanFabric({
    regions: REGIONS,
    buildings: BUILDINGS,
    streets: STREETS,
    mobile,
    tiberX: TIBER.x,
  });
  for (const record of urbanFabric) {
    colliders.push(rectCollider(record.x, record.z, record.w, record.d, record.rot || 0, record.name));
  }

  const player = {
    x: ROME_MANIFEST.spawn.x,
    y: EYE_HEIGHT,
    z: ROME_MANIFEST.spawn.z,
    yaw: ROME_MANIFEST.spawn.yaw ?? 0,
    pitch: ROME_MANIFEST.spawn.pitch ?? 0,
    floorY: 0,
    surfaceTag: 'ground',
    speed: 3.8,
    sprint: 7.2,
  };

  const traversal = createTraversalSystem({
    player,
    colliders,
    walkSurfaces,
    hazards: tiberHazards(),
    bounds: ROME_MANIFEST.bounds,
    baseHeightAt: terrainHeightAt,
    eyeHeight: EYE_HEIGHT,
  });
  traversal.snapPlayerToSupport();

  return {
    manifest: ROME_MANIFEST,
    buildings: BUILDINGS,
    streets: STREETS,
    regions: REGIONS,
    urbanFabric,
    tiber: TIBER,
    terrainHeightAt,
    terrainNormalAt,
    player,
    traversal,
    colliders,
    walkSurfaces,
  };
}
