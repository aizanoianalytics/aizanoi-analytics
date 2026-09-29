/**
 * builders.js — Blender-kit placement for Compact Aizanoi (AD 225).
 * Every monument resolves to studio-authored CC0 GLB pieces
 * (../assets/*.glb) via the shared asset-kit runtime. No procedural
 * monument geometry remains; collision footprints still derive from
 * city-data.js so walkability contracts are unchanged.
 */

import * as THREE from '../../shared/vendor/three.module.js';
import { createIonicColumn } from '../../shared/assets/builders-common.js';
import { getMaterial } from '../../shared/assets/materials.js';

export const KIT_MANIFEST = [
  { id: 'temple_of_zeus', file: 'temple_of_zeus.glb' },
  { id: 'insula_a', file: 'insula_a.glb' },
  { id: 'insula_b', file: 'insula_b.glb' },
  { id: 'insula_c', file: 'insula_c.glb' },
  { id: 'domus', file: 'domus.glb' },
  { id: 'shop_row', file: '../../shared/assets/shop_row.glb' },
  { id: 'scaenae', file: '../../shared/assets/scaenae.glb' },
  { id: 'arch_gate', file: 'arch_gate.glb' },
  { id: 'stoa_seg', file: '../../shared/assets/stoa_seg.glb' },
  { id: 'theatre_wedge', file: '../../shared/assets/theatre_wedge.glb' },
  { id: 'stadium_stand', file: '../../shared/assets/stadium_stand.glb' },
  { id: 'bridge_seg', file: '../../shared/assets/bridge_seg.glb' },
  { id: 'bath_hall', file: '../../shared/assets/bath_hall.glb' },
  { id: 'tholos', file: 'tholos.glb' },
  { id: 'ring_seg', file: 'ring_seg.glb' },
];

let KIT = null;

export function setAssetKit(kit) {
  KIT = kit;
}

export function isKitReady() {
  return Boolean(KIT);
}

function P(asset, dx = 0, dz = 0, yaw = 0, scale = 1) {
  return { asset, dx, dz, yaw, scale };
}

const D2R = Math.PI / 180;

function theatreFan(count, stepDeg, startDeg, scale) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push(P('theatre_wedge', 0, 0, (startDeg + i * stepDeg) * D2R, scale));
  }
  return list;
}

function bridgeDeck() {
  return [-13.6, -6.8, 0, 6.8, 13.6].map((dx) => P('bridge_seg', dx, 0, 0, 1));
}

function streetColonnades() {
  const list = [];
  for (let k = 0; k < 6; k++) {
    const dz = -62.5 + k * 25;
    list.push(P('stoa_seg', -6, dz, Math.PI / 2, 1));
    list.push(P('stoa_seg', 6, dz, -Math.PI / 2, 1));
  }
  return list;
}

function macellumRing() {
  const list = [P('tholos', 0, 0, 0, 1)];
  for (let i = 0; i < 10; i++) {
    if (i === 0 || i === 5) continue; // north/south gate openings
    list.push(P('ring_seg', 0, 0, i * 36 * D2R, 1));
  }
  list.push(P('arch_gate', 0, -26, 0, 1));
  list.push(P('arch_gate', 0, 26, 0, 1));
  return list;
}

const PLACEMENTS = {
  // temple_of_zeus.glb carries podium, cella, door, architrave and pediment
  // but no peristasis, so the colonnade is built procedurally below from the
  // shared Ionic order (the documented order is Ionic, pseudodipteral 8x15).
  // The separate court kit was dropped: at its authored scale it rendered as a
  // 4-metre dollhouse with half its columns buried, contributing nothing
  // visible at any readable distance. The ring is the colonnade.
  temple: [P('temple_of_zeus', 0, 0, 0, 1)],
  agora: [
    P('stoa_seg', 0, -20, Math.PI, 1),
    P('stoa_seg', 0, 20, 0, 1),
    P('arch_gate', -17, 0, Math.PI / 2, 1),
  ],
  macellum: macellumRing(),
  theatre: [...theatreFan(10, 18, -81, 1), P('scaenae', 0, -16, 0, 1)],
  stadium: [
    P('stadium_stand', -11, -30, Math.PI / 2, 1),
    P('stadium_stand', -11, 0, Math.PI / 2, 1),
    P('stadium_stand', -11, 30, Math.PI / 2, 1),
    P('stadium_stand', 11, -30, Math.PI / 2, 1),
    P('stadium_stand', 11, 0, Math.PI / 2, 1),
    P('stadium_stand', 11, 30, Math.PI / 2, 1),
  ],
  greatbath: [P('bath_hall', -8.75, 0, 0, 1), P('bath_hall', 8.75, 0, 0, 1)],
  mosaicbath: [P('bath_hall', 0, 0, 0, 0.8)],
  odeon: [...theatreFan(5, 18, -36, 0.55), P('scaenae', 0, -9, 0, 0.35)],
  'colonnaded-street': streetColonnades(),
  bridge2: bridgeDeck(),
  bridge3: bridgeDeck(),
};

export function buildStructure(building) {
  const group = new THREE.Group();
  group.userData.buildingId = building.id;
  if (!KIT) return group;
  const list = PLACEMENTS[building.id]
    || (building.kit ? [P(building.kit, 0, 0, building.kitYaw || 0, 1)] : null);
  if (!list) return group;
  // The compact layout shrinks footprints, so the kit pieces placed at a
  // monument shrink with them, and their authored offsets shrink by the same
  // factor — otherwise a piece authored 19 units out in uncompacted space
  // lands back outside the precinct wall while the pieces shrink beneath it.
  const fitScale = building.fitScale ?? 1;
  for (const piece of list) {
    try {
      group.add(KIT.place(piece.asset, {
        x: piece.dx * fitScale,
        y: 0,
        z: piece.dz * fitScale,
        yaw: piece.yaw,
        scale: piece.scale * fitScale,
      }));
    } catch (e) {
      // Never fail the whole monument for one missing piece.
    }
  }
  if (building.rot) group.rotation.y = building.rot;
  if (building.id === 'temple') {
    try {
      group.add(buildTemplePeristasis(group));
    } catch (e) {
      // The kit mass still stands on its own; never fail the monument.
    }
  }
  return group;
}

/**
 * Procedural Ionic peristasis for the Temple of Zeus (pseudodipteral 8x15).
 *
 * The kit GLB models podium, cella, architrave and pediment but no columns,
 * so without this the hero monument reads as a blank white mass from every
 * arrival. Dimensions are measured off the placed kit piece, not hard-coded,
 * so a future kit rebuild re-frames the colonnade automatically. Column tops
 * meet the architrave underside; the ring stands inside the collision
 * footprint, so walkability contracts are unchanged.
 */
function buildTemplePeristasis(templeGroup) {
  const ring = new THREE.Group();
  const box = new THREE.Box3().setFromObject(templeGroup);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x) || size.x < 4 || !Number.isFinite(size.z) || size.z < 4) return ring;

  let baseY = box.min.y + size.y * 0.1;
  let topY = box.min.y + size.y * 0.68;
  const architrave = templeGroup.getObjectByName('architrave');
  if (architrave) {
    const archBox = new THREE.Box3().setFromObject(architrave);
    if (Number.isFinite(archBox.min.y)) topY = archBox.min.y;
  }
  for (const name of ['krepis_0', 'krepis_1', 'krepis_2']) {
    const step = templeGroup.getObjectByName(name);
    if (!step) continue;
    const stepBox = new THREE.Box3().setFromObject(step);
    if (Number.isFinite(stepBox.max.y) && stepBox.max.y + 0.2 < topY) baseY = Math.max(baseY, stepBox.max.y);
  }
  const height = topY - baseY;
  if (!(height > 1)) return ring;

  const inset = 0.9;
  const hx = size.x / 2 - inset;
  const hz = size.z / 2 - inset;
  const cx = (box.min.x + box.max.x) / 2 - templeGroup.position.x;
  const cz = (box.min.z + box.max.z) / 2 - templeGroup.position.z;
  // Slender Ionic shaft; radius follows the measured height so the order
  // keeps its proportions if the kit is ever re-authored.
  const radius = Math.max(0.12, Math.min(0.35, height / 18));
  // Aged marble: a touch warmer and much less glossy than the freshly-cut
  // shared marble, so sunlit shafts keep their modeling instead of clipping
  // to the same chalk white as the kit cella behind them.
  const ringMarble = getMaterial('marble', { color: 0xe6dcc4, roughness: 0.62 });
  const place = (x, z, yaw) => {
    const column = createIonicColumn(height, radius, 'marble');
    column.traverse((o) => { if (o.isMesh) o.material = ringMarble; });
    column.position.set(cx + x, baseY - templeGroup.position.y, cz + z);
    if (yaw) column.rotation.y = yaw;
    ring.add(column);
  };
  // Flanks (15 each, volutes face the long sides) and ends (8 each, volutes
  // turned to face outward). The four corners belong to the flanks; the end
  // rows skip them so no two shafts share a position and z-fight.
  for (let i = 0; i < 15; i++) {
    const x = hx - (i * (2 * hx)) / 14;
    place(x, -hz, 0);
    place(x, hz, 0);
  }
  for (let i = 1; i < 7; i++) {
    const z = hz - (i * (2 * hz)) / 7;
    place(-hx, z, Math.PI / 2);
    place(hx, z, Math.PI / 2);
  }
  return ring;
}
