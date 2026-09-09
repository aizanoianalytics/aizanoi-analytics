/**
 * builders-common.js — Reusable Architectural & Classical Procedural Builders
 * Shared Asset Engine · Aizanoi Analytics unified worlds runtime
 *
 * Provides parametric builders for Doric, Ionic, and Corinthian orders,
 * Roman arches, aqueduct arcades, rotundas/domes, basilicas, theatres,
 * bridges, fortification walls, and multi-story insulae.
 */

import * as THREE from '../vendor/three.module.js';
import { getMaterial } from './materials.js';

/* ── 1. Classical Columns & Capitals ──────────────────────── */

/**
 * Creates a Doric column (no base, fluted shaft with entasis, echinus & abacus capital).
 */
export function createDoricColumn(height, radius, material = 'marble') {
  const group = new THREE.Group();
  const mat = getMaterial(material);

  // Fluted shaft (tapered). 24 radial segments = the real 20-flute Doric drum
  // read at silhouette distance; the old 16-segment tube looked like a pipe.
  const shaftGeo = new THREE.CylinderGeometry(radius * 0.82, radius, height * 0.90, 24, 3);
  const shaft = new THREE.Mesh(shaftGeo, mat);
  shaft.position.y = height * 0.45;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  group.add(shaft);

  // Capital (echinus + abacus)
  const echinusGeo = new THREE.ConeGeometry(radius * 1.25, height * 0.05, 24);
  const echinus = new THREE.Mesh(echinusGeo, mat);
  echinus.position.y = height * 0.925;
  group.add(echinus);

  const abacusGeo = new THREE.BoxGeometry(radius * 2.4, height * 0.05, radius * 2.4);
  const abacus = new THREE.Mesh(abacusGeo, mat);
  abacus.position.y = height * 0.975;
  group.add(abacus);

  return group;
}

/**
 * Creates an Ionic column (moulded torus base, slender fluted shaft, volute scroll capital).
 */
export function createIonicColumn(height, radius, material = 'marble') {
  const group = new THREE.Group();
  const mat = getMaterial(material);

  // Base
  const baseGeo = new THREE.CylinderGeometry(radius * 1.3, radius * 1.4, height * 0.05, 24);
  const base = new THREE.Mesh(baseGeo, mat);
  base.position.y = height * 0.025;
  group.add(base);

  // Shaft
  const shaftGeo = new THREE.CylinderGeometry(radius * 0.85, radius, height * 0.88, 24, 3);
  const shaft = new THREE.Mesh(shaftGeo, mat);
  shaft.position.y = height * 0.05 + height * 0.44;
  shaft.castShadow = true;
  group.add(shaft);

  // Volute capital
  const capGeo = new THREE.BoxGeometry(radius * 2.6, height * 0.07, radius * 1.8);
  const cap = new THREE.Mesh(capGeo, mat);
  cap.position.y = height * 0.965;
  group.add(cap);

  return group;
}

/**
 * Creates a Corinthian column (acanthus bell capital, ornate multi-tier).
 */
export function createCorinthianColumn(height, radius, material = 'marble') {
  const group = new THREE.Group();
  const mat = getMaterial(material);

  // Moulded base
  const baseGeo = new THREE.CylinderGeometry(radius * 1.35, radius * 1.45, height * 0.06, 24);
  const base = new THREE.Mesh(baseGeo, mat);
  base.position.y = height * 0.03;
  group.add(base);

  // Slender shaft
  const shaftGeo = new THREE.CylinderGeometry(radius * 0.86, radius, height * 0.84, 24, 3);
  const shaft = new THREE.Mesh(shaftGeo, mat);
  shaft.position.y = height * 0.06 + height * 0.42;
  shaft.castShadow = true;
  group.add(shaft);

  // Ornate bell capital (double cylinder flare)
  const bellGeo = new THREE.CylinderGeometry(radius * 1.4, radius * 0.9, height * 0.10, 24);
  const bell = new THREE.Mesh(bellGeo, mat);
  bell.position.y = height * 0.95;
  group.add(bell);

  return group;
}

/* ── 2. Steps & Pediments ─────────────────────────────────── */

export function createSteps(width, depth, count = 3, stepHeight = 0.4, material = 'limestone') {
  const group = new THREE.Group();
  const mat = getMaterial(material);

  for (let i = 0; i < count; i++) {
    const w = width - (i * stepHeight * 2);
    const d = depth - (i * stepHeight * 2);
    const geo = new THREE.BoxGeometry(w, stepHeight, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = stepHeight / 2 + (i * stepHeight);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

export function createPediment(width, depth, height, material = 'marble') {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();

  const extrudeSettings = { depth, bevelEnabled: false };
  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.translate(0, 0, -depth / 2);

  const mesh = new THREE.Mesh(geo, getMaterial(material));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ── 3. Roman Round Arches & Arcades ──────────────────────── */

/**
 * Creates a Roman arched opening in a stone wall block.
 */
export function createRomanArch(width, height, depth, openingWidth, openingHeight, material = 'travertine') {
  const group = new THREE.Group();
  const mat = getMaterial(material);

  const pierW = (width - openingWidth) / 2;

  // Left pier
  const leftPier = new THREE.Mesh(new THREE.BoxGeometry(pierW, openingHeight, depth), mat);
  leftPier.position.set(-width / 2 + pierW / 2, openingHeight / 2, 0);
  group.add(leftPier);

  // Right pier
  const rightPier = new THREE.Mesh(new THREE.BoxGeometry(pierW, openingHeight, depth), mat);
  rightPier.position.set(width / 2 - pierW / 2, openingHeight / 2, 0);
  group.add(rightPier);

  // Lintel / Arch beam
  const topH = height - openingHeight;
  if (topH > 0) {
    const topBlock = new THREE.Mesh(new THREE.BoxGeometry(width, topH, depth), mat);
    topBlock.position.set(0, openingHeight + topH / 2, 0);
    group.add(topBlock);
  }

  return group;
}

/**
 * Creates a Roman Aqueduct segment (multi-pier arcade).
 */
export function createAqueductArcade(length, height, depth, archCount = 5, material = 'travertine') {
  const group = new THREE.Group();
  const bayW = length / archCount;
  const archW = bayW * 0.65;
  const archH = height * 0.70;

  for (let i = 0; i < archCount; i++) {
    const x = -length / 2 + bayW / 2 + i * bayW;
    const arch = createRomanArch(bayW, height, depth, archW, archH, material);
    arch.position.x = x;
    group.add(arch);
  }

  // Top water channel (specus)
  const channel = new THREE.Mesh(new THREE.BoxGeometry(length, 1.2, depth * 1.1), getMaterial(material));
  channel.position.y = height + 0.6;
  group.add(channel);

  return group;
}

/* ── 4. Roman Rotundas & Domes (Pantheon Architecture) ─────── */

export function createRotundaWithDome(radius, wallHeight, domeHeight, oculusRadius = 2.5, material = 'travertine') {
  const group = new THREE.Group();
  const mat = getMaterial(material);
  const wallThick = 2.4;

  // 1. Paved Interior Floor (Polished imperial marble circle)
  const floorMat = getMaterial('marble', { roughness: 0.25 });
  const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(radius - 0.2, 32), floorMat);
  floorMesh.rotateX(-Math.PI / 2);
  floorMesh.position.y = 0.1;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // 2. Drum Wall with Open Northern Portal
  // Outer drum shell (open-ended cylinder)
  const outerDrumGeo = new THREE.CylinderGeometry(radius, radius, wallHeight, 36, 1, true);
  const outerDrum = new THREE.Mesh(outerDrumGeo, mat);
  outerDrum.position.y = wallHeight / 2;
  outerDrum.castShadow = true;
  outerDrum.receiveShadow = true;
  group.add(outerDrum);

  // Inner drum shell (inward-facing surface)
  const innerRadius = radius - wallThick;
  const innerDrumGeo = new THREE.CylinderGeometry(innerRadius, innerRadius, wallHeight, 36, 1, true);
  const innerMat = getMaterial('travertine', { side: THREE.BackSide, roughness: 0.8 });
  const innerDrum = new THREE.Mesh(innerDrumGeo, innerMat);
  innerDrum.position.y = wallHeight / 2;
  innerDrum.receiveShadow = true;
  group.add(innerDrum);

  // Drum top cap ring
  const capRingGeo = new THREE.RingGeometry(innerRadius, radius, 36);
  capRingGeo.rotateX(-Math.PI / 2);
  const capRing = new THREE.Mesh(capRingGeo, mat);
  capRing.position.y = wallHeight;
  group.add(capRing);

  // 3. Coffered Hemispherical Concrete Dome (visible from both inside and outside)
  const domeMat = getMaterial('concrete', { side: THREE.DoubleSide, roughness: 0.75 });
  const domeGeo = new THREE.SphereGeometry(radius * 0.98, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  domeGeo.scale(1, domeHeight / radius, 1);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.y = wallHeight;
  dome.castShadow = true;
  dome.receiveShadow = true;
  group.add(dome);

  // Interior dome coffering stepped rings
  for (let ring = 1; ring <= 5; ring++) {
    const ringRadius = (radius * 0.96) * Math.cos((ring / 6) * (Math.PI / 2));
    const ringY = wallHeight + (domeHeight * Math.sin((ring / 6) * (Math.PI / 2)));
    const cofferRing = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.4, 6, 32), mat);
    cofferRing.rotateX(Math.PI / 2);
    cofferRing.position.y = ringY;
    group.add(cofferRing);
  }

  // 4. Bronze Oculus Rim Ring
  const oculusGeo = new THREE.TorusGeometry(oculusRadius, 0.5, 8, 32);
  oculusGeo.rotateX(Math.PI / 2);
  const oculus = new THREE.Mesh(oculusGeo, getMaterial('bronze'));
  oculus.position.y = wallHeight + domeHeight;
  group.add(oculus);

  // 5. Oculus Golden Sunlight Beam descending through the rotunda
  const sunBeamMat = new THREE.MeshStandardMaterial({
    color: 0xfff3cc,
    emissive: 0xffe6aa,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const beamGeo = new THREE.CylinderGeometry(oculusRadius * 0.9, oculusRadius * 2.5, wallHeight + domeHeight, 16, 1, true);
  const beam = new THREE.Mesh(beamGeo, sunBeamMat);
  beam.position.y = (wallHeight + domeHeight) / 2;
  group.add(beam);

  return group;
}

/* ── 5. Classical & Roman Theatres / Amphitheatres ──────────── */

export function createCaveaSeating(radius, tiers = 12, arc = Math.PI, material = 'travertine') {
  const group = new THREE.Group();
  const mat = getMaterial(material);
  const tierDepth = (radius * 0.75) / tiers;
  const tierHeight = 0.5;

  for (let i = 0; i < tiers; i++) {
    const rInner = radius * 0.25 + i * tierDepth;
    const rOuter = rInner + tierDepth;
    const geo = new THREE.RingGeometry(rInner, rOuter, 32, 1, 0, arc);
    geo.rotateX(-Math.PI / 2);

    const step = new THREE.Mesh(geo, mat);
    step.position.y = i * tierHeight;
    step.receiveShadow = true;
    group.add(step);
  }

  return group;
}

/* ── 6. Bridges (Arched Stone Structures) ──────────────────── */

export function createStoneArchBridge(length, width, height, spanCount = 3, material = 'travertine') {
  const group = new THREE.Group();
  const mat = getMaterial(material);

  // Bridge deck (road)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(length, 0.8, width), getMaterial('road'));
  deck.position.y = height;
  deck.receiveShadow = true;
  group.add(deck);

  // Parapets
  const parapetLeft = new THREE.Mesh(new THREE.BoxGeometry(length, 1.0, 0.4), mat);
  parapetLeft.position.set(0, height + 0.5, width / 2 - 0.2);
  group.add(parapetLeft);

  const parapetRight = new THREE.Mesh(new THREE.BoxGeometry(length, 1.0, 0.4), mat);
  parapetRight.position.set(0, height + 0.5, -width / 2 + 0.2);
  group.add(parapetRight);

  // Piers & Arches
  const bayW = length / spanCount;
  for (let i = 0; i <= spanCount; i++) {
    const pierX = -length / 2 + i * bayW;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(bayW * 0.25, height, width * 1.1), mat);
    pier.position.set(pierX, height / 2, 0);
    pier.castShadow = true;
    group.add(pier);
  }

  return group;
}

/* ── 7. Fortification Walls, Towers, & Gates ────────────────── */

export function createCurtainWall(length, height, depth = 3.5, material = 'limestone') {
  const group = new THREE.Group();
  const mat = getMaterial(material);

  // Main wall mass
  const wall = new THREE.Mesh(new THREE.BoxGeometry(length, height, depth), mat);
  wall.position.y = height / 2;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  // Crenellations / Battlements
  const merlonW = 1.4;
  const merlonH = 1.0;
  const spacing = 2.4;
  const count = Math.floor(length / spacing);

  for (let i = 0; i < count; i++) {
    const x = -length / 2 + spacing * (i + 0.5);
    const merlon = new THREE.Mesh(new THREE.BoxGeometry(merlonW, merlonH, depth * 0.4), mat);
    merlon.position.set(x, height + merlonH / 2, depth * 0.3);
    group.add(merlon);
  }

  return group;
}

export function createFortifiedGate(width, height, depth, openingWidth = 8, material = 'limestone') {
  const group = new THREE.Group();
  const mat = getMaterial(material);

  const towerW = (width - openingWidth) / 2;

  // Twin towers (square or polygon)
  const towerLeft = new THREE.Mesh(new THREE.BoxGeometry(towerW, height * 1.25, depth * 1.3), mat);
  towerLeft.position.set(-width / 2 + towerW / 2, (height * 1.25) / 2, 0);
  towerLeft.castShadow = true;
  group.add(towerLeft);

  const towerRight = new THREE.Mesh(new THREE.BoxGeometry(towerW, height * 1.25, depth * 1.3), mat);
  towerRight.position.set(width / 2 - towerW / 2, (height * 1.25) / 2, 0);
  towerRight.castShadow = true;
  group.add(towerRight);

  // Central arch gate opening
  const arch = createRomanArch(openingWidth, height, depth, openingWidth * 0.7, height * 0.75, material);
  arch.position.set(0, 0, 0);
  group.add(arch);

  return group;
}

/* ── 8. Multi-Story Urban Insulae (Roman Tenement Housing) ──── */

export function createRomanInsula(width, depth, floors = 3, material = 'romanBrick') {
  const group = new THREE.Group();
  const mat = getMaterial(material);
  const floorH = 3.4;
  const totalH = floors * floorH;

  // Main block
  const block = new THREE.Mesh(new THREE.BoxGeometry(width, totalH, depth), mat);
  block.position.y = totalH / 2;
  block.castShadow = true;
  block.receiveShadow = true;
  group.add(block);

  // Street level tabernae openings (arches or wide lintels)
  const shopMat = getMaterial('plasterAged');
  const shopCount = Math.max(1, Math.floor(width / 6));
  for (let i = 0; i < shopCount; i++) {
    const x = -width / 2 + (width / (shopCount + 1)) * (i + 1);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 0.4), shopMat);
    frame.position.set(x, 1.3, depth / 2 + 0.1);
    group.add(frame);
  }

  // Roof (terracotta tiles with gentle slope)
  const roof = createPediment(width + 1.2, depth + 1.2, 2.0, 'roofTile');
  roof.position.y = totalH;
  group.add(roof);

  return group;
}
