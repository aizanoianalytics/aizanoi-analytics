/**
 * builders.js — Blender-kit placement for Compact Aizanoi (AD 225).
 * Every monument resolves to studio-authored CC0 GLB pieces
 * (../assets/*.glb) via the shared asset-kit runtime. No procedural
 * monument geometry remains; collision footprints still derive from
 * city-data.js so walkability contracts are unchanged.
 */

import * as THREE from '../../shared/vendor/three.module.js';

export const KIT_MANIFEST = [
  { id: 'temple_of_zeus', file: 'temple_of_zeus.glb' },
  { id: 'temple_court', file: 'temple_court.glb' },
  { id: 'insula_a', file: 'insula_a.glb' },
  { id: 'insula_b', file: 'insula_b.glb' },
  { id: 'insula_c', file: 'insula_c.glb' },
  { id: 'domus', file: 'domus.glb' },
  { id: 'shop_row', file: 'shop_row.glb' },
  { id: 'scaenae', file: 'scaenae.glb' },
  { id: 'arch_gate', file: 'arch_gate.glb' },
  { id: 'stoa_seg', file: 'stoa_seg.glb' },
  { id: 'theatre_wedge', file: 'theatre_wedge.glb' },
  { id: 'stadium_stand', file: 'stadium_stand.glb' },
  { id: 'bridge_seg', file: 'bridge_seg.glb' },
  { id: 'bath_hall', file: 'bath_hall.glb' },
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
  return [-27.2, -13.6, 0, 13.6, 27.2].map((dx) => P('bridge_seg', dx, 0, 0, 1));
}

function streetColonnades() {
  const list = [];
  for (let k = 0; k < 6; k++) {
    const dz = -62.5 + k * 25;
    list.push(P('stoa_seg', -12, dz, Math.PI / 2, 1));
    list.push(P('stoa_seg', 12, dz, -Math.PI / 2, 1));
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
  temple: [P('temple_of_zeus', 0, 0, 0, 1), P('temple_court', 0, -19, 0, 0.22)],
  agora: [
    P('stoa_seg', 0, -20, Math.PI, 1),
    P('stoa_seg', 0, 20, 0, 1),
    P('arch_gate', -34, 0, Math.PI / 2, 1),
  ],
  macellum: macellumRing(),
  theatre: [...theatreFan(10, 18, -81, 1), P('scaenae', 0, -16, 0, 1)],
  stadium: [
    P('stadium_stand', -22, -30, Math.PI / 2, 1),
    P('stadium_stand', -22, 0, Math.PI / 2, 1),
    P('stadium_stand', -22, 30, Math.PI / 2, 1),
    P('stadium_stand', 22, -30, Math.PI / 2, 1),
    P('stadium_stand', 22, 0, Math.PI / 2, 1),
    P('stadium_stand', 22, 30, Math.PI / 2, 1),
  ],
  greatbath: [P('bath_hall', -17.5, 0, 0, 1), P('bath_hall', 17.5, 0, 0, 1)],
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
  for (const piece of list) {
    try {
      group.add(KIT.place(piece.asset, {
        x: piece.dx, y: 0, z: piece.dz, yaw: piece.yaw, scale: piece.scale,
      }));
    } catch (e) {
      // Never fail the whole monument for one missing piece.
    }
  }
  if (building.rot) group.rotation.y = building.rot;
  return group;
}
