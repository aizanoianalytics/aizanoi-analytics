/**
 * builders.js — Procedural Architecture Factories for Roman Aizanoi (AD 225)
 * Shared Asset Engine Rebuild · Aizanoi Analytics unified worlds runtime
 */

import * as THREE from '../../shared/vendor/three.module.js';
import { getMaterial } from '../../shared/assets/materials.js';
import {
  createIonicColumn,
  createCorinthianColumn,
  createSteps,
  createPediment,
  createRomanArch,
  createCaveaSeating,
  createStoneArchBridge,
  createRomanInsula
} from '../../shared/assets/builders-common.js';

export function buildTempleOfZeus(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;
  const w = b.w || 55;
  const d = b.d || 35;
  const h = b.h || 18;
  const podiumH = 2.4;
  const podium = new THREE.Mesh(new THREE.BoxGeometry(w + 3, podiumH, d + 3), getMaterial('limestone'));
  podium.position.y = podiumH / 2;
  podium.receiveShadow = true;
  group.add(podium);
  const cryptOpening = createRomanArch(8, 2.2, 4, 4.5, 2.0, 'limestone');
  cryptOpening.position.set(0, 0, d / 2 + 1.2);
  group.add(cryptOpening);
  const colH = h * 0.58;
  const colR = colH / 10;
  const colsX = 15;
  const colsZ = 8;
  const stepX = (w - colR * 4) / (colsX - 1);
  const stepZ = (d - colR * 4) / (colsZ - 1);
  const startX = -w / 2 + colR * 2;
  const startZ = -d / 2 + colR * 2;
  for (let x = 0; x < colsX; x++) {
    for (let z = 0; z < colsZ; z++) {
      if (x === 0 || x === colsX - 1 || z === 0 || z === colsZ - 1) {
        const col = createIonicColumn(colH, colR, 'marble');
        col.position.set(startX + x * stepX, podiumH, startZ + z * stepZ);
        group.add(col);
      }
    }
  }
  const cellaW = w * 0.65;
  const cellaD = d * 0.55;
  const cella = new THREE.Mesh(new THREE.BoxGeometry(cellaW, colH, cellaD), getMaterial('marble'));
  cella.position.set(0, podiumH + colH / 2, 0);
  cella.castShadow = true;
  group.add(cella);
  const entY = podiumH + colH;
  const entablature = new THREE.Mesh(new THREE.BoxGeometry(w, colH * 0.15, d), getMaterial('marble'));
  entablature.position.set(0, entY + (colH * 0.15) / 2, 0);
  group.add(entablature);
  const pedH = d * 0.22;
  const pediment = createPediment(w, d, pedH, 'marble');
  pediment.position.set(0, entY + colH * 0.15, 0);
  group.add(pediment);
  const roof = createPediment(w + 1, d + 1, pedH + 0.3, 'roofTile');
  roof.position.set(0, entY + colH * 0.15 - 0.1, 0);
  group.add(roof);
  return group;
}

export function buildMacellum(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;
  const radius = (b.w || 54) / 2;
  const h = b.h || 11;
  const wallGeo = new THREE.CylinderGeometry(radius, radius, h * 0.65, 32, 1, true);
  const wall = new THREE.Mesh(wallGeo, getMaterial('marble'));
  wall.position.y = (h * 0.65) / 2;
  wall.castShadow = true;
  group.add(wall);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.4, 32), getMaterial('road'));
  floor.position.y = 0.2;
  group.add(floor);
  const tholosR = radius * 0.35;
  const colCount = 12;
  for (let i = 0; i < colCount; i++) {
    const angle = (i / colCount) * Math.PI * 2;
    const col = createCorinthianColumn(h * 0.7, 0.4, 'marble');
    col.position.set(Math.cos(angle) * tholosR, 0.4, Math.sin(angle) * tholosR);
    group.add(col);
  }
  const roofGeo = new THREE.ConeGeometry(tholosR * 1.25, 3.5, 24);
  const roof = new THREE.Mesh(roofGeo, getMaterial('roofTile'));
  roof.position.y = h * 0.7 + 1.75;
  group.add(roof);
  return group;
}

export function buildTheatreStadium(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;
  if (b.type === 'theatre') {
    const r = (b.w || 104) / 2;
    const cavea = createCaveaSeating(r, 16, Math.PI, 'limestone');
    cavea.position.set(0, 0, 0);
    cavea.rotation.y = Math.PI;
    group.add(cavea);
    const stage = new THREE.Mesh(new THREE.BoxGeometry(r * 1.8, 16, 12), getMaterial('marble'));
    stage.position.set(0, 8, -r * 0.15);
    stage.castShadow = true;
    group.add(stage);
  } else {
    const len = b.d || 220;
    const wid = b.w || 96;
    const standW = 12;
    const h = b.h || 14;
    const westStands = new THREE.Mesh(new THREE.BoxGeometry(standW, h, len), getMaterial('limestone'));
    westStands.position.set(-wid / 2 + standW / 2, h / 2, 0);
    group.add(westStands);
    const eastStands = new THREE.Mesh(new THREE.BoxGeometry(standW, h, len), getMaterial('limestone'));
    eastStands.position.set(wid / 2 - standW / 2, h / 2, 0);
    group.add(eastStands);
    const track = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.3, len), getMaterial('ground'));
    track.position.y = 0.15;
    group.add(track);
  }
  return group;
}

export function buildPenkalasBridge(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;
  const bridge = createStoneArchBridge(b.w || 78, b.d || 12, b.h || 6, 5, 'limestone');
  group.add(bridge);
  return group;
}

export function buildColonnadedStreet(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;
  const w = b.w || 36;
  const d = b.d || 420;
  const h = b.h || 8;
  const streetW = 16;
  const streetGeo = new THREE.BoxGeometry(streetW, 0.2, d);
  const streetMesh = new THREE.Mesh(streetGeo, getMaterial('road'));
  streetMesh.position.y = 0.1;
  streetMesh.receiveShadow = true;
  group.add(streetMesh);
  const porticoW = (w - streetW) / 2;
  const colSpacing = 8;
  const numCols = Math.floor(d / colSpacing);
  const colH = h * 0.75;
  const colR = colH / 11;
  for (const side of [-1, 1]) {
    const porticoCenterX = side * (streetW / 2 + porticoW / 2);
    const colonnadeLineX = side * (streetW / 2 + 0.8);
    const backWallX = side * (w / 2 - 0.4);
    const walkGeo = new THREE.BoxGeometry(porticoW, 0.45, d);
    const walkMesh = new THREE.Mesh(walkGeo, getMaterial('marble'));
    walkMesh.position.set(porticoCenterX, 0.225, 0);
    walkMesh.receiveShadow = true;
    group.add(walkMesh);
    for (let i = 0; i <= numCols; i++) {
      const colZ = -d / 2 + i * colSpacing;
      const col = createCorinthianColumn(colH, colR, 'marble');
      col.position.set(colonnadeLineX, 0.45, colZ);
      group.add(col);
    }
    const entGeo = new THREE.BoxGeometry(1.6, 0.9, d);
    const entMesh = new THREE.Mesh(entGeo, getMaterial('marble'));
    entMesh.position.set(colonnadeLineX, 0.45 + colH + 0.45, 0);
    entMesh.castShadow = true;
    group.add(entMesh);
    const roofGeo = new THREE.BoxGeometry(porticoW + 1.2, 0.35, d);
    const roofMesh = new THREE.Mesh(roofGeo, getMaterial('roofTile'));
    roofMesh.position.set(porticoCenterX, 0.45 + colH + 0.9, 0);
    roofMesh.rotation.z = side * 0.12;
    roofMesh.castShadow = true;
    group.add(roofMesh);
    const wallGeo = new THREE.BoxGeometry(0.8, h, d);
    const wallMesh = new THREE.Mesh(wallGeo, getMaterial('travertine'));
    wallMesh.position.set(backWallX, h / 2, 0);
    wallMesh.castShadow = true;
    group.add(wallMesh);
  }
  return group;
}

export function buildStructure(building) {
  if (building.id === 'temple') return buildTempleOfZeus(building);
  if (building.id === 'macellum') return buildMacellum(building);
  if (building.id === 'colonnaded-street') return buildColonnadedStreet(building);
  if (building.type === 'theatre' || building.type === 'stadium') return buildTheatreStadium(building);
  if (building.type === 'bridge') return buildPenkalasBridge(building);
  if (building.type === 'insula') return createRomanInsula(building.w || 16, building.d || 14, 2, 'romanBrick');
  const g = new THREE.Group();
  g.userData.buildingId = building.id;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(building.w || 20, building.h || 8, building.d || 20),
    getMaterial(building.type === 'bath' ? 'travertine' : 'limestone')
  );
  body.position.y = (building.h || 8) / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  return g;
}
