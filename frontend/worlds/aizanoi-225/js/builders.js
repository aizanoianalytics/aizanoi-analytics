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

/* ── 1. Temple of Zeus (Pseudodipteral Ionic Sanctuary) ────── */

export function buildTempleOfZeus(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 55;
  const d = b.d || 35;
  const h = b.h || 18;

  // High Roman Podium with 3-tier krepidoma
  const podiumH = 2.4;
  const podium = new THREE.Mesh(new THREE.BoxGeometry(w + 3, podiumH, d + 3), getMaterial('limestone'));
  podium.position.y = podiumH / 2;
  podium.receiveShadow = true;
  group.add(podium);

  // Subterranean Vaulted Crypt Chamber (Meter Steunene / Cybele underground shrine)
  const cryptW = w * 0.45;
  const cryptD = d * 0.45;
  const cryptH = 2.2;
  const cryptFloor = new THREE.Mesh(new THREE.BoxGeometry(cryptW, 0.2, cryptD), getMaterial('limestone'));
  cryptFloor.position.set(0, 0.1, 0);
  cryptFloor.receiveShadow = true;
  group.add(cryptFloor);

  // Vaulted stone ceiling over crypt
  const cryptArch = createRomanArch(cryptW * 0.9, cryptH, cryptD, cryptW * 0.75, cryptH * 0.85, 'limestone');
  cryptArch.position.set(0, 0, 0);
  group.add(cryptArch);

  // Subterranean Crypt Entrance Portals (on both North and South podium flanks)
  for (const zSide of [-d / 2 - 0.2, d / 2 + 0.2]) {
    const cryptOpening = createRomanArch(6.5, 2.4, 3.2, 4.2, 2.0, 'limestone');
    cryptOpening.position.set(0, 0, zSide);
    group.add(cryptOpening);
  }

  // Peristyle: 8 x 15 Pseudodipteral Ionic columns
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

  // Cella Wall (enclosed sanctum inside pseudodipteral perimeter)
  const cellaW = w * 0.65;
  const cellaD = d * 0.55;
  const cella = new THREE.Mesh(new THREE.BoxGeometry(cellaW, colH, cellaD), getMaterial('marble'));
  cella.position.set(0, podiumH + colH / 2, 0);
  cella.castShadow = true;
  group.add(cella);

  // Entablature & Pediment
  const entY = podiumH + colH;
  const entablature = new THREE.Mesh(new THREE.BoxGeometry(w, colH * 0.15, d), getMaterial('marble'));
  entablature.position.set(0, entY + (colH * 0.15) / 2, 0);
  group.add(entablature);

  const pedH = d * 0.22;
  // Aizanoi Temple of Zeus: 8x15 pseudodipteral entrance facade is on the short (d) side
  const pediment = createPediment(d, w, pedH, 'marble');
  pediment.rotation.y = Math.PI / 2;
  pediment.position.set(0, entY + colH * 0.15, 0);
  group.add(pediment);

  // Roof
  const roof = createPediment(d + 1, w + 1, pedH + 0.3, 'roofTile');
  roof.rotation.y = Math.PI / 2;
  roof.position.set(0, entY + colH * 0.15 - 0.1, 0);
  group.add(roof);

  return group;
}

export function buildMacellum(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const radius = (b.w || 54) / 2;
  const h = b.h || 11;
  const marbleMat = getMaterial('marble');
  const wallH = h * 0.65;

  // 1. Circular outer stone enclosure wall with 4 cardinal arched entrance gateways
  const numWallSegments = 4;
  for (let s = 0; s < numWallSegments; s++) {
    const startAngle = s * (Math.PI / 2) + 0.18;
    const arcLength = (Math.PI / 2) - 0.36;
    const wallGeo = new THREE.CylinderGeometry(radius, radius, wallH, 16, 1, true, startAngle, arcLength);
    const wall = new THREE.Mesh(wallGeo, marbleMat);
    wall.position.y = wallH / 2;
    wall.castShadow = true;
    group.add(wall);

    // Wall cap molding
    const capGeo = new THREE.RingGeometry(radius - 0.6, radius + 0.6, 16, 1, startAngle, arcLength);
    capGeo.rotateX(-Math.PI / 2);
    const cap = new THREE.Mesh(capGeo, marbleMat);
    cap.position.y = wallH;
    group.add(cap);
  }

  // Four Arched Gateway Portals at Cardinal Entrances
  for (const sign of [-1, 1]) {
    const archX = createRomanArch(6.5, 4.5, 2.4, 4.2, 3.6, 'marble');
    archX.position.set(sign * radius, 0, 0);
    archX.rotation.y = Math.PI / 2;
    group.add(archX);

    const archZ = createRomanArch(6.5, 4.5, 2.4, 4.2, 3.6, 'marble');
    archZ.position.set(0, 0, sign * radius);
    group.add(archZ);
  }

  // 2. Concentric Paved Marble Market Floor
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.4, 32), getMaterial('road'));
  floor.position.y = 0.2;
  floor.receiveShadow = true;
  group.add(floor);

  // 3. Central Tholos (kiosk with ring of columns)
  const tholosR = radius * 0.35;
  const colCount = 12;
  for (let i = 0; i < colCount; i++) {
    const angle = (i / colCount) * Math.PI * 2;
    const col = createCorinthianColumn(h * 0.7, 0.4, 'marble');
    col.position.set(Math.cos(angle) * tholosR, 0.4, Math.sin(angle) * tholosR);
    group.add(col);
  }

  // Conical tile roof over central kiosk
  const roofGeo = new THREE.ConeGeometry(tholosR * 1.25, 3.5, 24);
  const roof = new THREE.Mesh(roofGeo, getMaterial('roofTile'));
  roof.position.y = h * 0.7 + 1.75;
  roof.castShadow = true;
  group.add(roof);

  // 4. Stone Vendor Counters surrounding the central tholos
  const counterCount = 8;
  const counterR = radius * 0.65;
  for (let i = 0; i < counterCount; i++) {
    const angle = (i / counterCount) * Math.PI * 2 + 0.15;
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.9, 1.4),
      getMaterial('limestone')
    );
    counter.position.set(Math.cos(angle) * counterR, 0.65, Math.sin(angle) * counterR);
    counter.rotation.y = -angle + Math.PI / 2;
    counter.castShadow = true;
    group.add(counter);
  }

  return group;
}

/* ── 3. Theatre–Stadium Conjoined Spectacle Complex ────────── */

export function buildTheatreStadium(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  if (b.type === 'theatre') {
    const r = (b.w || 104) / 2;
    // Semicircular tiered cavea
    const cavea = createCaveaSeating(r, 16, Math.PI, 'limestone');
    cavea.position.set(0, 0, 0);
    cavea.rotation.y = Math.PI; // Face south toward stadium
    group.add(cavea);

    // Scaenae Frons (ornate stage building)
    const stage = new THREE.Mesh(new THREE.BoxGeometry(r * 1.8, 16, 12), getMaterial('marble'));
    stage.position.set(0, 8, -r * 0.15);
    stage.castShadow = true;
    group.add(stage);
  } else {
    // Stadium: Long U-shaped running track
    const len = b.d || 220;
    const wid = b.w || 96;
    const standW = 12;
    const h = b.h || 14;

    // West stands
    const westStands = new THREE.Mesh(new THREE.BoxGeometry(standW, h, len), getMaterial('limestone'));
    westStands.position.set(-wid / 2 + standW / 2, h / 2, 0);
    group.add(westStands);

    // East stands
    const eastStands = new THREE.Mesh(new THREE.BoxGeometry(standW, h, len), getMaterial('limestone'));
    eastStands.position.set(wid / 2 - standW / 2, h / 2, 0);
    group.add(eastStands);

    // Track surface
    const track = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.3, len), getMaterial('ground'));
    track.position.y = 0.15;
    group.add(track);
  }

  return group;
}

/* ── 4. Penkalas Roman Stone Bridges ───────────────────────── */

export function buildPenkalasBridge(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;
  const bridge = createStoneArchBridge(b.w || 78, b.d || 12, b.h || 6, 5, 'limestone');
  group.add(bridge);
  return group;
}

/* ── 5. Colonnaded Marble Street ──────────────────────────── */

export function buildColonnadedStreet(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 36;
  const d = b.d || 420;
  const h = b.h || 8;

  // Central Paved Marble Street
  const streetW = 16;
  const streetGeo = new THREE.BoxGeometry(streetW, 0.2, d);
  const streetMesh = new THREE.Mesh(streetGeo, getMaterial('road'));
  streetMesh.position.y = 0.1;
  streetMesh.receiveShadow = true;
  group.add(streetMesh);

  // Sidewalks & Porticoes on Left (-X) and Right (+X)
  const porticoW = (w - streetW) / 2;
  const colSpacing = 8;
  const numCols = Math.floor(d / colSpacing);
  const colH = h * 0.75;
  const colR = colH / 11;

  for (const side of [-1, 1]) {
    const porticoCenterX = side * (streetW / 2 + porticoW / 2);
    const colonnadeLineX = side * (streetW / 2 + 0.8);
    const backWallX = side * (w / 2 - 0.4);

    // Raised marble portico sidewalk
    const walkGeo = new THREE.BoxGeometry(porticoW, 0.45, d);
    const walkMesh = new THREE.Mesh(walkGeo, getMaterial('marble'));
    walkMesh.position.set(porticoCenterX, 0.225, 0);
    walkMesh.receiveShadow = true;
    group.add(walkMesh);

    // Flanking Corinthian Colonnade
    for (let i = 0; i <= numCols; i++) {
      const colZ = -d / 2 + i * colSpacing;
      const col = createCorinthianColumn(colH, colR, 'marble');
      col.position.set(colonnadeLineX, 0.45, colZ);
      group.add(col);
    }

    // Continuous Entablature Beam above columns
    const entGeo = new THREE.BoxGeometry(1.6, 0.9, d);
    const entMesh = new THREE.Mesh(entGeo, getMaterial('marble'));
    entMesh.position.set(colonnadeLineX, 0.45 + colH + 0.45, 0);
    entMesh.castShadow = true;
    group.add(entMesh);

    // Slanted Terracotta Tile Portico Roof
    const roofGeo = new THREE.BoxGeometry(porticoW + 1.2, 0.35, d);
    const roofMesh = new THREE.Mesh(roofGeo, getMaterial('roofTile'));
    roofMesh.position.set(porticoCenterX, 0.45 + colH + 0.9, 0);
    roofMesh.rotation.z = side * 0.12;
    roofMesh.castShadow = true;
    group.add(roofMesh);

    // Rear Tabernae / Shop Facade Wall
    const wallGeo = new THREE.BoxGeometry(0.8, h, d);
    const wallMesh = new THREE.Mesh(wallGeo, getMaterial('travertine'));
    wallMesh.position.set(backWallX, h / 2, 0);
    wallMesh.castShadow = true;
    group.add(wallMesh);
  }

  return group;
}

/* ── Master Dispatcher for Aizanoi ────────────────────────── */

/* ── 6. Agora & Propylon (Monumental Civic Market & Gateway) ── */

export function buildAgoraPropylon(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 98;
  const d = b.d || 82;
  const h = b.h || 8;

  // Central Open Peristyle Paved Plaza
  const floorGeo = new THREE.BoxGeometry(w, 0.4, d);
  const floorMesh = new THREE.Mesh(floorGeo, getMaterial('travertine'));
  floorMesh.position.y = 0.2;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // Outer Stoa Porticos (North, East, South walls)
  const wallThick = 1.2;
  const porticoDepth = 8.0;

  // North Stoa Back Wall
  const nWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallThick), getMaterial('limestone'));
  nWall.position.set(0, h / 2, -d / 2 + wallThick / 2);
  nWall.castShadow = true;
  group.add(nWall);

  // South Stoa Back Wall
  const sWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallThick), getMaterial('limestone'));
  sWall.position.set(0, h / 2, d / 2 - wallThick / 2);
  sWall.castShadow = true;
  group.add(sWall);

  // East Stoa Back Wall
  const eWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, h, d), getMaterial('limestone'));
  eWall.position.set(w / 2 - wallThick / 2, h / 2, 0);
  eWall.castShadow = true;
  group.add(eWall);

  // Stoa Roofs (pitched terracotta)
  const roofMat = getMaterial('roofTile');
  const nRoof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, porticoDepth), roofMat);
  nRoof.position.set(0, h + 0.2, -d / 2 + porticoDepth / 2);
  nRoof.castShadow = true;
  group.add(nRoof);

  const sRoof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, porticoDepth), roofMat);
  sRoof.position.set(0, h + 0.2, d / 2 - porticoDepth / 2);
  sRoof.castShadow = true;
  group.add(sRoof);

  // Colonnade columns facing inner courtyard
  const colCountX = 8;
  for (let i = 0; i < colCountX; i++) {
    const colX = -w / 2 + 10 + (i * (w - 20)) / (colCountX - 1);
    const colN = createCorinthianColumn(h, 0.45, 'marble');
    colN.position.set(colX, 0, -d / 2 + porticoDepth);
    group.add(colN);

    const colS = createCorinthianColumn(h, 0.45, 'marble');
    colS.position.set(colX, 0, d / 2 - porticoDepth);
    group.add(colS);
  }

  // Monumental Propylon Gateway (Western Entrance Approach)
  const propylonW = 20.0;
  const propylonD = 10.0;
  const propylonH = h + 2.0;

  // Propylon Stepped Approach
  const steps = createSteps(propylonW + 4, propylonD + 4, 5, 0.3);
  steps.position.set(-w / 2, 0, 0);
  group.add(steps);

  // 4 Monumental Corinthian Columns at West Facade
  for (let c = 0; c < 4; c++) {
    const colZ = -propylonD / 2 + 2.0 + (c * (propylonD - 4.0)) / 3;
    const col = createCorinthianColumn(propylonH, 0.55, 'marble');
    col.position.set(-w / 2 - 2, 1.5, colZ);
    group.add(col);
  }

  // Propylon Entablature & Pediment
  const ped = createPediment(propylonD + 2, 2.0, 3.2, 'marble');
  ped.position.set(-w / 2 - 2, propylonH + 1.5, 0);
  ped.rotation.y = Math.PI / 2;
  group.add(ped);

  return group;
}

/* ── 7. Great Bath–Palaestra (Imperial Thermae & Gymnasium) ── */

export function buildGreatBath(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 110;
  const d = b.d || 145;
  const h = b.h || 18;

  // Main Caldarium & Tepidarium Vaulted Thermal Halls (Northern half)
  const hallW = w * 0.85;
  const hallD = d * 0.5;
  const hallH = h;

  const hallBody = new THREE.Mesh(
    new THREE.BoxGeometry(hallW, hallH, hallD),
    getMaterial('travertine')
  );
  hallBody.position.set(0, hallH / 2, -d * 0.22);
  hallBody.castShadow = true;
  hallBody.receiveShadow = true;
  group.add(hallBody);

  // Barrel Vaulted Roofs over Thermal Halls
  const vaultRadius = hallW * 0.25;
  for (let v = -1; v <= 1; v++) {
    const vaultGeo = new THREE.CylinderGeometry(vaultRadius, vaultRadius, hallD, 32, 1, false, 0, Math.PI);
    const vaultMesh = new THREE.Mesh(vaultGeo, getMaterial('roofTile'));
    vaultMesh.rotation.z = Math.PI / 2;
    vaultMesh.rotation.y = Math.PI / 2;
    vaultMesh.position.set(v * vaultRadius * 1.5, hallH, -d * 0.22);
    vaultMesh.castShadow = true;
    group.add(vaultMesh);
  }

  // Southern Open Palaestra (Athletic Peristyle Court)
  const palaestraW = w * 0.9;
  const palaestraD = d * 0.42;
  const palaestraFloor = new THREE.Mesh(
    new THREE.BoxGeometry(palaestraW, 0.3, palaestraD),
    getMaterial('ground')
  );
  palaestraFloor.position.set(0, 0.15, d * 0.26);
  palaestraFloor.receiveShadow = true;
  group.add(palaestraFloor);

  // Palaestra Surrounding Colonnade
  const pCols = 10;
  for (let i = 0; i < pCols; i++) {
    const cx = -palaestraW / 2 + 5 + (i * (palaestraW - 10)) / (pCols - 1);
    const colS = createCorinthianColumn(8, 0.4, 'marble');
    colS.position.set(cx, 0, d * 0.26 + palaestraD / 2 - 2);
    group.add(colS);

    const colW = createCorinthianColumn(8, 0.4, 'marble');
    colW.position.set(-palaestraW / 2 + 2, 0, d * 0.26 - palaestraD / 2 + 4 + (i * (palaestraD - 8)) / (pCols - 1));
    group.add(colW);

    const colE = createCorinthianColumn(8, 0.4, 'marble');
    colE.position.set(palaestraW / 2 - 2, 0, d * 0.26 - palaestraD / 2 + 4 + (i * (palaestraD - 8)) / (pCols - 1));
    group.add(colE);
  }

  return group;
}

/* ── 8. Mosaic Bath (Thermae with Decorated Satyr Mosaics) ──── */

export function buildMosaicBath(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 50;
  const d = b.d || 44;
  const h = b.h || 12;

  // Hypocaust Raised Foundation Base
  const hypoH = 1.5;
  const hypoMesh = new THREE.Mesh(new THREE.BoxGeometry(w, hypoH, d), getMaterial('romanBrick'));
  hypoMesh.position.y = hypoH / 2;
  hypoMesh.receiveShadow = true;
  group.add(hypoMesh);

  // Mosaic Terrace Floor
  const mosaicFloor = new THREE.Mesh(new THREE.BoxGeometry(w - 2, 0.2, d - 2), getMaterial('travertine'));
  mosaicFloor.position.y = hypoH + 0.1;
  mosaicFloor.receiveShadow = true;
  group.add(mosaicFloor);

  // Main Bath Enclosure
  const bathH = h - hypoH;
  const mainHall = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, bathH, d * 0.7), getMaterial('travertine'));
  mainHall.position.set(0, hypoH + bathH / 2, 0);
  mainHall.castShadow = true;
  group.add(mainHall);

  // Pitched Terracotta Roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.75, 0.5, d * 0.75), getMaterial('roofTile'));
  roof.position.set(0, h + 0.25, 0);
  roof.castShadow = true;
  group.add(roof);

  return group;
}

/* ── 9. Bouleuterion / Odeon (Covered Semicircular Chamber) ──── */

export function buildOdeon(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 48;
  const d = b.d || 45;
  const h = b.h || 9;

  // Outer Rectangular Enclosure Wall
  const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), getMaterial('limestone'));
  wallMesh.position.y = h / 2;
  wallMesh.castShadow = true;
  group.add(wallMesh);

  // Interior Tiered Semicircular Council Seating
  const seatingRadius = Math.min(w, d) * 0.4;
  const seating = createCaveaSeating(seatingRadius, 6, Math.PI, 'limestone');
  seating.position.set(0, 0.2, 0);
  seating.rotation.y = Math.PI;
  group.add(seating);

  // Covered Timber Truss Hipped Roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.6, 4.0, 4), getMaterial('roofTile'));
  roof.position.y = h + 2.0;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  return group;
}

/* ── Master Dispatcher for Aizanoi ────────────────────────── */

export function buildStructure(building) {
  if (building.id === 'temple') return buildTempleOfZeus(building);
  if (building.id === 'macellum') return buildMacellum(building);
  if (building.id === 'colonnaded-street') return buildColonnadedStreet(building);
  if (building.id === 'agora' || building.type === 'forum') return buildAgoraPropylon(building);
  if (building.id === 'greatbath') return buildGreatBath(building);
  if (building.id === 'mosaicbath') return buildMosaicBath(building);
  if (building.id === 'odeon') return buildOdeon(building);
  if (building.type === 'theatre' || building.type === 'stadium') return buildTheatreStadium(building);
  if (building.type === 'bridge') return buildPenkalasBridge(building);
  if (building.type === 'insula') return createRomanInsula(building.w || 16, building.d || 14, 2, 'romanBrick');

  // Generic / Stoas / Baths
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
