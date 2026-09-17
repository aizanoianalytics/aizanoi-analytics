/**
 * builders.js — Blender-kit placement for Compact Rome (AD 410-476).
 * Unique monuments resolve to studio-authored CC0 GLB clones; every
 * repeated element (fabric houses, theatre wedges, stoa edges, circus /
 * stadium stands, aqueduct segments, bridge decks) batches through
 * shared/engine/instanced-kit.js InstancedMesh groups.
 * Collision footprints still derive from city-data.js type contracts.
 */

import * as THREE from '../../shared/vendor/three.module.js';
import { BUILDINGS } from './city-data.js';
import { mergeByMaterial, buildInstancedMeshes } from '../../shared/engine/instanced-kit.js';

export const KIT_MANIFEST = [
  { id: 'colosseum', file: 'colosseum.glb' },
  { id: 'pantheon', file: 'pantheon.glb' },
  { id: 'basilica', file: 'basilica.glb' },
  { id: 'triumph_arch', file: 'triumph_arch.glb' },
  { id: 'roman_temple', file: 'roman_temple.glb' },
  { id: 'vesta_tholos', file: 'vesta_tholos.glb' },
  { id: 'trajan_column', file: 'trajan_column.glb' },
  { id: 'circus_stand', file: 'circus_stand.glb' },
  { id: 'spina', file: 'spina.glb' },
  { id: 'church', file: 'church.glb' },
  { id: 'city_gate', file: 'city_gate.glb' },
  { id: 'aqueduct_seg', file: 'aqueduct_seg.glb' },
  { id: 'mausoleum', file: 'mausoleum.glb' },
  { id: 'pyramid', file: 'pyramid.glb' },
  { id: 'palace_block', file: 'palace_block.glb' },
  { id: 'fabric_a', file: 'fabric_a.glb' },
  { id: 'fabric_b', file: 'fabric_b.glb' },
  { id: 'fabric_c', file: 'fabric_c.glb' },
  { id: 'bath_hall', file: 'bath_hall.glb' },
  { id: 'theatre_wedge', file: 'theatre_wedge.glb' },
  { id: 'scaenae', file: 'scaenae.glb' },
  { id: 'stadium_stand', file: 'stadium_stand.glb' },
  { id: 'bridge_seg', file: 'bridge_seg.glb' },
  { id: 'stoa_seg', file: 'stoa_seg.glb' },
  { id: 'shop_row', file: 'shop_row.glb' },
  { id: 'forum-civic-hero', file: 'forum_civic_hero.glb' },
];

let KIT = null;

export function setAssetKit(kit) {
  KIT = kit;
}

function decayMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.94 });
}

export function createCharredInsula(width, depth, floors = 3) {
  const group = new THREE.Group();
  group.name = 'charred-roofless-insula';
  const brick = decayMaterial(0x3f302b);
  const charredWood = decayMaterial(0x221f1c);
  const height = floors * 3.4;
  for (const [size, position] of [
    [[width, height * .82, .9], [0, height * .41, depth / 2 - .45]],
    [[width, height, .9], [0, height / 2, -depth / 2 + .45]],
    [[.9, height * .88, depth], [-width / 2 + .45, height * .44, 0]],
    [[.9, height * .62, depth], [width / 2 - .45, height * .31, 0]],
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), brick);
    wall.position.set(...position);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  }
  const joistCount = Math.max(3, Math.floor(width / 2.2));
  for (let i = 0; i < joistCount; i++) {
    if (i % 4 === 1) continue;
    const joist = new THREE.Mesh(new THREE.BoxGeometry(.22, .24, depth - 1.35), charredWood);
    joist.position.set(-width / 2 + 1.2 + i * ((width - 2.4) / (joistCount - 1)), height * .72, 0);
    group.add(joist);
  }
  const debris = new THREE.Group();
  debris.name = 'debris-pile';
  const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(Math.min(width, depth) * .16, 0), decayMaterial(0x5a463b));
  rubble.position.y = .35;
  debris.add(rubble);
  group.add(debris);
  return group;
}

export function buildCollapsedArcade(width = 24, height = 12, depth = 5) {
  const group = new THREE.Group();
  group.name = 'collapsed-arcade';
  const stone = decayMaterial(0xb49a79);
  const pier = new THREE.Mesh(new THREE.BoxGeometry(3, height, depth), stone);
  pier.position.set(-width / 4 - 1.5, height / 2, 0);
  group.add(pier);
  const center = pier.clone();
  center.position.set(0, height / 2, 0);
  group.add(center);
  const debris = new THREE.Group();
  debris.name = 'debris-pile';
  debris.add(new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), decayMaterial(0x6a5544)));
  debris.position.set(width / 4, .6, 0);
  group.add(debris);
  return group;
}

function P(asset, dx = 0, dz = 0, yaw = 0, scale = 1) {
  return { asset, dx, dz, yaw, scale };
}

const D2R = Math.PI / 180;

// Heavy multi-mesh kits worth merging once per unique placement.
const MERGE_ASSETS = new Set(['bath_hall', 'church', 'palace_block', 'basilica']);

function placeOne(group, b, piece) {
  const m = KIT.place(piece.asset, { x: 0, y: 0, z: 0, yaw: 0, scale: 1 });
  const inner = m.children[0];
  if (MERGE_ASSETS.has(piece.asset)) {
    const merged = mergeByMaterial(m);
    merged.position.set(piece.dx, 0, piece.dz);
    merged.rotation.y = piece.yaw;
    merged.scale.setScalar(piece.scale);
    group.add(merged);
  } else {
    inner.position.set(piece.dx, 0, piece.dz);
    inner.rotation.y = piece.yaw;
    inner.scale.setScalar(piece.scale);
    group.add(m);
  }
}

const STATIC = {
  colosseum: [P('colosseum')],
  forum: [P('forum-civic-hero')],
  pantheon: [P('pantheon')],
  ludus: [P('circus_stand', 0, -8, 0, 0.35), P('circus_stand', 0, 8, Math.PI, 0.35)],
  curia: [P('basilica', 0, 0, 0, 0.5)],
  saturn: [P('roman_temple', 0, 0, 0, 0.8)],
  castor: [P('roman_temple', 0, 0, 0, 0.75)],
  vesta: [P('vesta_tholos', 0, 0, 0, 1.1)],
  aemilia: [P('basilica', 0, 0, 0, 0.85)],
  julia: [P('basilica', 0, 0, 0, 0.95)],
  maxentius: [P('basilica', 0, 0, 0, 1.15)],
  'constantine-arch': [P('triumph_arch')],
  'severus-arch': [P('triumph_arch', 0, 0, 0, 0.9)],
  'titus-arch': [P('triumph_arch', 0, 0, 0, 0.9)],
  janus: [P('triumph_arch', 0, 0, 0, 0.75)],
  'trajan-column': [P('trajan_column')],
  'trajan-market': [P('shop_row', -6, 0, 0, 1), P('shop_row', 6, 0, Math.PI, 1)],
  palatine: [P('palace_block'), P('palace_block', 15, 12, 0.4, 0.7)],
  'venus-roma': [P('roman_temple', 0, 0, 0, 1.9)],
  caracalla: [P('bath_hall', -9, 0, 0, 1), P('bath_hall', 9, 0, 0, 1)],
  diocletian: [P('bath_hall', -9, 0, 0, 1), P('bath_hall', 9, 0, 0, 1)],
  boarium: [P('shop_row', -7, 0, 0, 1), P('shop_row', 7, 0, Math.PI, 1)],
  portunus: [P('roman_temple', 0, 0, 0, 0.75)],
  hercules: [P('vesta_tholos', 0, 0, 0, 1.3)],
  'pons-aelius': [-13.6, -6.8, 0, 6.8, 13.6].map((dx) => P('bridge_seg', dx, 0, 0, 1)),
  hadrian: [P('mausoleum')],
  peter: [P('church', 0, 0, 0, 1.5)],
  'maria-maggiore': [P('church', 0, 0, 0, 1.1)],
  sabina: [P('church', 0, 0, 0, 1.0)],
  paul: [P('church', 0, 0, 0, 1.3)],
  'porta-appia': [P('city_gate')],
  'porta-ostiense': [P('city_gate')],
  pyramid: [P('pyramid')],
  'porta-flaminia': [P('city_gate')],
  'porta-salaria': [P('city_gate')],
  'porta-mag': [P('city_gate')],
  circus: [P('spina', 0, 0, Math.PI / 2, 1)],
};

// Buildings whose visual is fully instanced (no static meshes).
const INSTANCED_ONLY = new Set(['trajan-forum', 'trajan-forum', 'augustus-forum', 'circus', 'claudia', 'tiber', 'marcellus', 'pompey', 'stadium']);

export function buildStaticStructure(building) {
  const group = new THREE.Group();
  group.userData.buildingId = building.id;
  if (!KIT) return group;
  // Tag the runtime proof: which kit asset serves the hero.
  const list = STATIC[building.id];
  if (list) group.userData.kitAssets = list.map((p) => p.asset);
  if (!list) return group;
  for (const piece of list) {
    try {
      placeOne(group, building, piece);
    } catch (e) { /* never fail a monument for one piece */ }
  }
  if (building.rot) group.rotation.y = building.rot;
  return group;
}

// ── Instanced layer: fabric queue (from main.js) + monument repeats ──

const fabricQueue = { fabric_a: [], fabric_b: [], fabric_c: [] };

export function queueFabric(variant, t) {
  if (fabricQueue[variant]) fabricQueue[variant].push(t);
}

function byId(id) {
  return BUILDINGS.find((b) => b.id === id);
}

function stoaEdges(b, out) {
  // Colonnaded plaza edges: stoas face the open center.
  // b.w is already x-halved (anisotropic compaction); x-insets halve to 2, z-insets stay 4.
  const nx = Math.max(2, Math.round(b.w / 24));
  const nz = Math.max(1, Math.round(b.d / 24));
  for (let i = 0; i < nx; i++) {
    const x = -b.w / 2 + (i + 0.5) * (b.w / nx);
    out.push({ x: b.x + x, y: 0, z: b.z - b.d / 2 + 4, yaw: Math.PI, scale: 1 });
    out.push({ x: b.x + x, y: 0, z: b.z + b.d / 2 - 4, yaw: 0, scale: 1 });
  }
  for (let i = 0; i < nz; i++) {
    const z = -b.d / 2 + (i + 0.5) * (b.d / nz);
    out.push({ x: b.x - b.w / 2 + 2, y: 0, z: b.z + z, yaw: Math.PI / 2, scale: 1 });
    out.push({ x: b.x + b.w / 2 - 2, y: 0, z: b.z + z, yaw: -Math.PI / 2, scale: 1 });
  }
}

export function buildInstancedLayer() {
  const group = new THREE.Group();
  group.name = 'rome-instanced-layer';
  if (!KIT) return group;

  // 1. Residential fabric (queued by main.js).
  for (const [asset, list] of Object.entries(fabricQueue)) {
    if (list.length) group.add(buildInstancedMeshes(KIT, asset, list));
  }

  // 2. Forum colonnades.
  const stoas = [];
  for (const id of ['forum', 'trajan-forum', 'augustus-forum']) {
    const b = byId(id);
    if (b) stoaEdges(b, stoas);
  }
  if (stoas.length) group.add(buildInstancedMeshes(KIT, 'stoa_seg', stoas));

  // 3. Theatre wedges (merged first: 41 meshes → few) + scaenae.
  const wedges = [];
  for (const [id, count, step, start, scale, dy] of [['marcellus', 8, 22.5, -78.75, 1, 0], ['pompey', 8, 22.5, -78.75, 1, 0]]) {
    const b = byId(id);
    if (!b) continue;
    for (let i = 0; i < count; i++) {
      wedges.push({ x: b.x, y: 0, z: b.z, yaw: (start + i * step) * D2R, scale });
    }
  }
  if (wedges.length) group.add(buildInstancedMeshes(KIT, 'theatre_wedge', wedges, { merged: true }));
  const scaenae = [];
  for (const [id, dz, s] of [['marcellus', -14, 0.8], ['pompey', -16, 0.9]]) {
    const b = byId(id);
    if (b) scaenae.push({ x: b.x, y: 0, z: b.z + dz, yaw: 0, scale: s });
  }
  if (scaenae.length) group.add(buildInstancedMeshes(KIT, 'scaenae', scaenae));

  // 4. Circus + stadium stands, spina handled statically.
  const stands = [];
  const circus = byId('circus');
  if (circus) {
    for (const dz of [-15, 15]) {

      for (const dx of [-15.5, 15.5]) {
        stands.push({ x: circus.x + dx, y: 0, z: circus.z + dz, yaw: dz > 0 ? Math.PI : 0, scale: 1 });
      }
    }
  }
  const ludus = byId('ludus');
  if (ludus) {
    for (const dz of [-8, 8]) {
      stands.push({ x: ludus.x, y: 0, z: ludus.z + dz, yaw: dz > 0 ? Math.PI : 0, scale: 0.35 });
    }
  }
  if (stands.length) group.add(buildInstancedMeshes(KIT, 'circus_stand', stands));

  const stadiumStands = [];
  const stadium = byId('stadium');
  if (stadium) {
    for (const dx of [-7.5, 7.5]) {
      for (const dz of [-8, 8]) {
        stadiumStands.push({ x: stadium.x + dx, y: 0, z: stadium.z + dz, yaw: Math.PI / 2, scale: 1 });
      }
    }
  }
  if (stadiumStands.length) group.add(buildInstancedMeshes(KIT, 'stadium_stand', stadiumStands));

  // 5. Aqueduct arcade.
  const claudia = byId('claudia');
  if (claudia) {
    const segs = [];
    for (let i = 0; i < 5; i++) {
      segs.push({ x: claudia.x - 30 + i * 15, y: 0, z: claudia.z, yaw: 0, scale: 1 });
    }
    group.add(buildInstancedMeshes(KIT, 'aqueduct_seg', segs));
  }

  return group;
}

// Back-compat: dressing uses buildStructure for the ruined arcade.
export function buildStructure(building) {
  if (building.type === 'collapsed-arcade') {
    const group = new THREE.Group();
    group.userData.buildingId = 'collapsed-arcade';
    if (KIT) {
      try {
        const m = KIT.place('aqueduct_seg', {});
        m.rotation.z = 0.12;
        m.position.y = -2;
        group.add(m);
      } catch (e) { /* fallback below */ }
    }
    return group;
  }
  return buildStaticStructure(building);
}
