/**
 * builders.js — Procedural Architecture Factories for Late Antique Rome (AD 410–476)
 * Aizanoi Analytics unified worlds runtime
 *
 * Imports shared architectural blocks from ../shared/assets/builders-common.js
 * and materials from ../shared/assets/materials.js.
 */

import * as THREE from '../../shared/vendor/three.module.js';
import { getMaterial } from '../../shared/assets/materials.js';
import { buildDebrisPile } from '../../shared/assets/props.js';
import {
  createDoricColumn,
  createIonicColumn,
  createCorinthianColumn,
  createSteps,
  createPediment,
  createRomanArch,
  createAqueductArcade,
  createRotundaWithDome,
  createCaveaSeating,
  createStoneArchBridge,
  createCurtainWall,
  createFortifiedGate,
  createRomanInsula
} from '../../shared/assets/builders-common.js';

/* ── 1. Colosseum (Amphitheatrum Flavium) ─────────────────── */

export function buildColosseum(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const rx = (b.w || 135) / 2;
  const rz = (b.d || 110) / 2;
  const h = b.h || 48;
  const tiers = 4;
  const tierH = h / tiers;
  const travMat = getMaterial('travertine');
  const marbleColMat = getMaterial('marbleColosseum');

  // 4 tiered arcaded exterior shell
  for (let t = 0; t < tiers; t++) {
    const scale = 1.0 - t * 0.025;
    const tierGeo = new THREE.CylinderGeometry(rx * scale, rx * scale, tierH, 48, 1, true);
    tierGeo.scale(1, 1, rz / rx); // Elliptical scaling

    const matName = t === 3 ? 'travertine' : 'marbleColosseum';
    const mesh = new THREE.Mesh(tierGeo, getMaterial(matName));
    mesh.position.y = tierH / 2 + t * tierH;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Exterior pilasters / half-columns along the perimeter
    const numCols = 32;
    const colR = 0.55;
    const colGeo = new THREE.CylinderGeometry(colR * 0.9, colR, tierH * 0.9, 8);
    for (let i = 0; i < numCols; i++) {
      // Skip the 4 cardinal entrance vomitoria openings on ground tier
      const angle = (i / numCols) * Math.PI * 2;
      const isCardinal = Math.abs(Math.sin(angle)) < 0.1 || Math.abs(Math.cos(angle)) < 0.1;
      if (t === 0 && isCardinal) continue;

      const px = Math.cos(angle) * (rx * scale + 0.3);
      const pz = Math.sin(angle) * (rz * scale + 0.3);
      const col = new THREE.Mesh(colGeo, travMat);
      col.position.set(px, tierH / 2 + t * tierH, pz);
      col.castShadow = true;
      group.add(col);
    }

    // Cornice ring separating tiers
    const corniceGeo = new THREE.TorusGeometry(rx * scale + 0.2, 0.6, 6, 48);
    corniceGeo.scale(1, 1, rz / rx);
    corniceGeo.rotateX(Math.PI / 2);
    const cornice = new THREE.Mesh(corniceGeo, travMat);
    cornice.position.y = (t + 1) * tierH;
    group.add(cornice);
  }

  // 4 Cardinal Grand Entrance Portals (North, South, East, West Porta Sanivivaria & Triumphalis)
  for (const sign of [-1, 1]) {
    // East-West axis portals
    const archEW = createRomanArch(10, 8, 8, 6.5, 6.5, 'travertine');
    archEW.position.set(sign * (rx - 4), 0, 0);
    archEW.rotation.y = Math.PI / 2;
    group.add(archEW);

    // North-South axis portals
    const archNS = createRomanArch(10, 8, 8, 6.5, 6.5, 'travertine');
    archNS.position.set(0, 0, sign * (rz - 4));
    group.add(archNS);
  }

  // Interior Cavea Seating
  const caveaTiers = 14;
  for (let c = 0; c < caveaTiers; c++) {
    const rIn = (rx * 0.45) + c * (rx * 0.45 / caveaTiers);
    const rOut = rIn + (rx * 0.45 / caveaTiers);
    const ringGeo = new THREE.RingGeometry(rIn, rOut, 32);
    ringGeo.scale(1, rz / rx, 1);
    ringGeo.rotateX(-Math.PI / 2);

    const step = new THREE.Mesh(ringGeo, travMat);
    step.position.y = 3 + c * 2.2;
    step.receiveShadow = true;
    group.add(step);
  }

  // Arena floor (oval sand platform)
  const arenaGeo = new THREE.CylinderGeometry(rx * 0.42, rx * 0.42, 1.2, 32);
  arenaGeo.scale(1, 1, rz / rx);
  const arena = new THREE.Mesh(arenaGeo, getMaterial('ground'));
  arena.position.y = 0.6;
  arena.receiveShadow = true;
  group.add(arena);

  // Marble Podium Balustrade surrounding the arena
  const podiumGeo = new THREE.TorusGeometry(rx * 0.43, 0.45, 6, 32);
  podiumGeo.scale(1, 1, rz / rx);
  podiumGeo.rotateX(Math.PI / 2);
  const podium = new THREE.Mesh(podiumGeo, marbleColMat);
  podium.position.y = 2.2;
  group.add(podium);

  // Hypogeum subterranean access corridors visible on arena floor
  const hypogeumMat = getMaterial('romanBrick');
  for (const hx of [-rx * 0.15, 0, rx * 0.15]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, rz * 0.6), hypogeumMat);
    wall.position.set(hx, 1.3, 0);
    wall.castShadow = true;
    group.add(wall);
  }

  return group;
}

/* ── 2. Pantheon Rotunda & Portico ────────────────────────── */

export function buildPantheon(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const radius = (b.w || 64) / 2;
  const drumH = (b.h || 39) * 0.52;
  const domeH = (b.h || 39) * 0.48;

  // 1. Rotunda Cylinder & Hemispherical Dome
  const rotunda = createRotundaWithDome(radius, drumH, domeH, 3.2, 'travertine');
  rotunda.position.set(0, 0, 0);
  group.add(rotunda);

  // 2. Pronaos (Octastyle Corinthian Portico on North facade)
  const porticoW = radius * 1.35;
  const porticoD = radius * 0.85;
  const colH = drumH * 0.92;
  const colR = colH / 11;

  // Stepped platform
  const porticoSteps = createSteps(porticoW + 2, porticoD + 2, 4, 0.35, 'marble');
  porticoSteps.position.set(0, 0, radius + porticoD / 2);
  group.add(porticoSteps);

  // 8 front columns + 2 interior rows
  const colCols = 8;
  const colRows = 3;
  const stepX = (porticoW - colR * 4) / (colCols - 1);
  const stepZ = (porticoD - colR * 4) / (colRows - 1);
  const startX = -porticoW / 2 + colR * 2;
  const startZ = radius + colR * 2;

  for (let x = 0; x < colCols; x++) {
    for (let z = 0; z < colRows; z++) {
      if (z === 0 || x === 0 || x === colCols - 1) {
        const col = createCorinthianColumn(colH, colR, 'travertine');
        col.position.set(startX + x * stepX, 1.4, startZ + z * stepZ);
        group.add(col);
      }
    }
  }

  // Entablature & Pediment above portico
  const entY = 1.4 + colH;
  const architrave = new THREE.Mesh(
    new THREE.BoxGeometry(porticoW, colH * 0.16, porticoD),
    getMaterial('marble')
  );
  architrave.position.set(0, entY + (colH * 0.16) / 2, radius + porticoD / 2);
  group.add(architrave);

  const pedH = porticoW * 0.22;
  const pediment = createPediment(porticoW, porticoD, pedH, 'marble');
  pediment.position.set(0, entY + colH * 0.16, radius + porticoD / 2);
  pediment.rotation.y = Math.PI; // Face outwards
  group.add(pediment);

  return group;
}

/* ── 3. Roman Basilicas (Curia Julia, Maxentius, Aemilia) ──── */

export function buildBasilica(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 60;
  const d = b.d || 30;
  const h = b.h || 20;

  if (b.id === 'maxentius') {
    // Monumental 3-bay barrel vaulted hall
    const bayW = w / 3;
    for (let i = 0; i < 3; i++) {
      const bay = new THREE.Mesh(
        new THREE.BoxGeometry(bayW * 0.92, h, d),
        getMaterial('concrete')
      );
      bay.position.set(-w / 2 + bayW / 2 + i * bayW, h / 2, 0);
      bay.castShadow = true;
      bay.receiveShadow = true;
      group.add(bay);

      // Huge coffered arch cutout visual
      const arch = createRomanArch(bayW * 0.88, h * 0.85, d * 1.05, bayW * 0.65, h * 0.70, 'travertine');
      arch.position.set(-w / 2 + bayW / 2 + i * bayW, 0, 0);
      group.add(arch);
    }
  } else {
    // Standard Roman Basilica (Curia, Aemilia, Julia)
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h * 0.85, d),
      getMaterial(b.id === 'curia' ? 'romanBrick' : 'travertine')
    );
    body.position.y = (h * 0.85) / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Gabled Roof
    const roof = createPediment(w + 1, d + 1, h * 0.25, 'roofTile');
    roof.position.y = h * 0.85;
    group.add(roof);

    // Arched portal
    const portal = createRomanArch(14, 10, 4, 8, 8, 'travertine');
    portal.position.set(0, 0, d / 2 + 1);
    group.add(portal);
  }

  return group;
}

/* ── 4. Triumphal Arches (Septimius Severus, Constantine, Titus) */

export function buildTriumphalArch(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 28;
  const d = b.d || 14;
  const h = b.h || 22;
  const isTriple = b.id === 'constantine-arch' || b.id === 'severus-arch';

  if (isTriple) {
    // Central bay (grand) + 2 side bays (smaller)
    const pierW = w * 0.22;
    const centerBayW = w * 0.32;
    const sideBayW = w * 0.16;

    // Pier pillars with attached Corinthian columns
    const mat = getMaterial(b.id === 'constantine-arch' ? 'porphyry' : 'travertine');
    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.75, d), mat);
    mainBody.position.y = (h * 0.75) / 2;
    mainBody.castShadow = true;
    group.add(mainBody);

    // Central opening
    const centerArch = createRomanArch(centerBayW + 2, h * 0.65, d * 1.2, centerBayW, h * 0.55, 'travertine');
    centerArch.position.set(0, 0, 0);
    group.add(centerArch);

    // Attic inscription storey
    const attic = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.25, d * 0.95), getMaterial('travertine'));
    attic.position.y = h * 0.75 + (h * 0.25) / 2;
    group.add(attic);
  } else {
    // Single bay arch (Titus, Janus)
    const arch = createRomanArch(w, h * 0.75, d, w * 0.5, h * 0.6, 'travertine');
    group.add(arch);

    const attic = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.25, d), getMaterial('travertine'));
    attic.position.y = h * 0.75 + (h * 0.25) / 2;
    group.add(attic);
  }

  return group;
}

/* ── 5. Imperial Thermae (Baths of Caracalla & Diocletian) ─── */

export function buildImperialBaths(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 175;
  const d = b.d || 130;
  const h = b.h || 35;

  // Main central vaulted block (Frigidarium)
  const centralBlock = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.55, h, d * 0.55),
    getMaterial('romanBrick')
  );
  centralBlock.position.y = h / 2;
  centralBlock.castShadow = true;
  centralBlock.receiveShadow = true;
  group.add(centralBlock);

  // Caldarium circular rotunda (projecting South)
  const rotundaR = (d * 0.25);
  const rotunda = createRotundaWithDome(rotundaR, h * 0.8, h * 0.35, 2.0, 'romanBrick');
  rotunda.position.set(0, 0, -d * 0.35);
  group.add(rotunda);

  // East & West Palaestra Courtyards (colonnaded peristyles)
  const palW = w * 0.22;
  const palD = d * 0.45;

  for (const side of [-1, 1]) {
    const palBlock = new THREE.Mesh(
      new THREE.BoxGeometry(palW, h * 0.5, palD),
      getMaterial('travertine')
    );
    palBlock.position.set(side * (w * 0.38), (h * 0.5) / 2, 0);
    group.add(palBlock);
  }

  return group;
}

/* ── 6. Circus Maximus & Arenas ───────────────────────────── */

export function buildCircusMaximus(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const len = b.w || 280;
  const wid = b.d || 74;
  const h = b.h || 18;

  // Outer U-shaped grandstands (North, South long tiers and East curved hemicycle)
  const standThick = 12;

  // North stands
  const northStands = new THREE.Mesh(new THREE.BoxGeometry(len, h, standThick), getMaterial('travertine'));
  northStands.position.set(0, h / 2, wid / 2 - standThick / 2);
  group.add(northStands);

  // South stands
  const southStands = new THREE.Mesh(new THREE.BoxGeometry(len, h, standThick), getMaterial('travertine'));
  southStands.position.set(0, h / 2, -wid / 2 + standThick / 2);
  group.add(southStands);

  // Track (sand racing course)
  const track = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, wid), getMaterial('ground'));
  track.position.y = 0.2;
  group.add(track);

  // Spina (central barrier divider with obelisk)
  const spinaLen = len * 0.65;
  const spina = new THREE.Mesh(new THREE.BoxGeometry(spinaLen, 1.8, 4.0), getMaterial('marble'));
  spina.position.set(0, 0.9, 0);
  group.add(spina);

  // Central Obelisk
  const obelisk = new THREE.Mesh(new THREE.ConeGeometry(1.4, 24, 4), getMaterial('porphyry'));
  obelisk.position.set(0, 12, 0);
  group.add(obelisk);

  return group;
}

/* ── 7. Early Christian Basilicas (Peter, Sabina, Maggiore) ── */

export function buildChristianChurch(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 90;
  const d = b.d || 40;
  const h = b.h || 25;

  // High central nave
  const naveW = w * 0.65;
  const naveD = d * 0.55;
  const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, h, naveD), getMaterial('travertine'));
  nave.position.set(0, h / 2, 0);
  nave.castShadow = true;
  nave.receiveShadow = true;
  group.add(nave);

  // Gabled Nave Roof
  const roof = createPediment(naveW + 1, naveD + 1, h * 0.28, 'roofTile');
  roof.position.y = h;
  group.add(roof);

  // Semicircular Apse at West end
  const apseGeo = new THREE.CylinderGeometry(naveD * 0.45, naveD * 0.45, h * 0.75, 16, 1, false, 0, Math.PI);
  const apse = new THREE.Mesh(apseGeo, getMaterial('travertine'));
  apse.position.set(-naveW / 2, (h * 0.75) / 2, 0);
  apse.rotation.y = -Math.PI / 2;
  group.add(apse);

  // Columned Atrium forecourt (East)
  const atriumW = w * 0.35;
  const atrium = new THREE.Mesh(new THREE.BoxGeometry(atriumW, 1.2, d), getMaterial('road'));
  atrium.position.set(naveW / 2 + atriumW / 2, 0.6, 0);
  group.add(atrium);

  return group;
}

/* ── 8. Castel Sant'Angelo (Hadrian's Mausoleum) ───────────── */

export function buildHadrianMausoleum(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const s = b.w || 74;
  const h = b.h || 42;

  // Square travertine base podium
  const podiumH = h * 0.28;
  const podium = new THREE.Mesh(new THREE.BoxGeometry(s, podiumH, s), getMaterial('travertine'));
  podium.position.y = podiumH / 2;
  podium.castShadow = true;
  group.add(podium);

  // Massive cylinder drum
  const drumR = s * 0.44;
  const drumH = h * 0.45;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(drumR, drumR, drumH, 32), getMaterial('travertine'));
  drum.position.y = podiumH + drumH / 2;
  drum.castShadow = true;
  group.add(drum);

  // Earth tumulus & fortified crown
  const crownGeo = new THREE.CylinderGeometry(drumR * 0.35, drumR * 0.85, h * 0.27, 24);
  const crown = new THREE.Mesh(crownGeo, getMaterial('ground'));
  crown.position.y = podiumH + drumH + (h * 0.27) / 2;
  group.add(crown);

  return group;
}

/* ── 9. Pyramid of Cestius ─────────────────────────────────── */

export function buildPyramid(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;
  const s = b.w || 38;
  const h = b.h || 38;

  const geo = new THREE.ConeGeometry(s * 0.707, h, 4);
  geo.rotateY(Math.PI / 4);
  const mesh = new THREE.Mesh(geo, getMaterial('marble'));
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  return group;
}

/* ── 10. Trajan's Column ──────────────────────────────────── */

export function buildTrajanColumn(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;
  const h = b.h || 37;

  // Pedestal base
  const base = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), getMaterial('marble'));
  base.position.y = 3;
  group.add(base);

  // Fluted/spiraled shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.9, h - 8, 20), getMaterial('marble'));
  shaft.position.y = 6 + (h - 8) / 2;
  shaft.castShadow = true;
  group.add(shaft);

  // Top statue platform & statue
  const statue = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 2.5, 4, 8), getMaterial('goldLeaf'));
  statue.position.y = h;
  group.add(statue);

  return group;
}

/* ── 11. Charred Roofless Insula (Late Antique Sack Damage) ── */

export function createCharredInsula(width, depth, floors = 3) {
  const group = new THREE.Group();
  group.name = 'charred-roofless-insula';

  const wallMat = getMaterial('scorchedBrick');
  const woodMat = getMaterial('charredWood');
  const floorH = 3.4;
  const totalH = floors * floorH;
  const wallThick = 0.9;

  // Front wall with jagged damaged profile
  const frontWall = new THREE.Mesh(new THREE.BoxGeometry(width, totalH * 0.82, wallThick), wallMat);
  frontWall.position.set(0, (totalH * 0.82) / 2, depth / 2 - wallThick / 2);
  frontWall.castShadow = true;
  frontWall.receiveShadow = true;
  group.add(frontWall);

  // Back wall standing higher
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(width, totalH, wallThick), wallMat);
  backWall.position.set(0, totalH / 2, -depth / 2 + wallThick / 2);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);

  // Left wall
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, totalH * 0.88, depth), wallMat);
  leftWall.position.set(-width / 2 + wallThick / 2, (totalH * 0.88) / 2, 0);
  leftWall.castShadow = true;
  group.add(leftWall);

  // Right wall with collapsed upper corner
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, totalH * 0.62, depth), wallMat);
  rightWall.position.set(width / 2 - wallThick / 2, (totalH * 0.62) / 2, 0);
  rightWall.castShadow = true;
  group.add(rightWall);

  // Ground level charred lintel openings
  const shopCount = Math.max(1, Math.floor(width / 7));
  for (let i = 0; i < shopCount; i++) {
    const x = -width / 2 + (width / (shopCount + 1)) * (i + 1);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.45, 1.2), woodMat);
    lintel.position.set(x, 2.6, depth / 2);
    group.add(lintel);
  }

  // Exposed charred timber ceiling joists (NO TILED ROOF!)
  const joistCount = Math.max(3, Math.floor(width / 2.2));
  for (let j = 0; j < joistCount; j++) {
    if (j % 4 === 1) continue; // burned through
    const jx = -width / 2 + 1.2 + j * ((width - 2.4) / (joistCount - 1));
    const joist = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, depth - wallThick * 1.5), woodMat);
    joist.position.set(jx, totalH * 0.72, 0);
    if (j % 3 === 0) joist.rotation.z = 0.04;
    group.add(joist);
  }

  // Interior debris mound inside shell
  const rubble = buildDebrisPile(0, 0, Math.min(width, depth) * 0.35, 1.1);
  group.add(rubble);

  return group;
}

/* ── 12. Partially Collapsed Arcade ────────────────────────── */

export function buildCollapsedArcade(width = 24, height = 12, depth = 5) {
  const group = new THREE.Group();
  group.name = 'collapsed-arcade';

  const travMat = getMaterial('travertine');
  const brickMat = getMaterial('romanBrick');
  const pierW = 3.0;

  // Standing left pier
  const leftPier = new THREE.Mesh(new THREE.BoxGeometry(pierW, height, depth), travMat);
  leftPier.position.set(-width / 4 - pierW / 2, height / 2, 0);
  leftPier.castShadow = true;
  leftPier.receiveShadow = true;
  group.add(leftPier);

  // Intact arch span on left
  const intactArch = createRomanArch(width / 2, height, depth, (width / 2) - pierW, height * 0.75, 'travertine');
  intactArch.position.set(-width / 4, 0, 0);
  group.add(intactArch);

  // Center pier: standing
  const centerPier = new THREE.Mesh(new THREE.BoxGeometry(pierW, height * 0.95, depth), travMat);
  centerPier.position.set(0, (height * 0.95) / 2, 0);
  centerPier.castShadow = true;
  group.add(centerPier);

  // Right pier: fractured lower stump
  const brokenPier = new THREE.Mesh(new THREE.BoxGeometry(pierW, height * 0.42, depth), brickMat);
  brokenPier.position.set(width / 4 + pierW / 2, (height * 0.42) / 2, 0);
  brokenPier.castShadow = true;
  group.add(brokenPier);

  // Broken spring stub cantilevered right from center pier
  const springStub = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, depth * 0.9), travMat);
  springStub.position.set(1.2, height * 0.82, 0);
  springStub.rotation.z = -0.22;
  group.add(springStub);

  // Rubble pile of fallen arch keystones below
  const rubble = buildDebrisPile(width / 4, 0, 3.2, 1.4);
  group.add(rubble);

  return group;
}

/* ── Master Dispatcher ────────────────────────────────────── */

/* ── 15. Classical Roman Temples (Podium, Portico & Pediment) ── */

export function buildRomanTemple(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 30;
  const d = b.d || 22;
  const h = b.h || 17;
  const podiumH = 2.4;
  const marbleMat = getMaterial('marble');

  // 1. High Roman podium with frontal steps
  const podiumGeo = new THREE.BoxGeometry(w, podiumH, d);
  const podiumMesh = new THREE.Mesh(podiumGeo, getMaterial('travertine'));
  podiumMesh.position.y = podiumH / 2;
  podiumMesh.castShadow = true;
  podiumMesh.receiveShadow = true;
  group.add(podiumMesh);

  const steps = createSteps(w * 0.7, 4.0, 6, podiumH / 6, 'travertine');
  steps.position.set(0, 0, d / 2 + 2.0);
  group.add(steps);

  // 2. Peristyle / Portico Columns
  const colH = (h - podiumH) * 0.65;
  const colR = colH / 11;
  const colCountW = Math.max(4, Math.round(w / 4.5));
  const colCountD = Math.max(5, Math.round(d / 4.0));
  const stepW = (w - colR * 4) / Math.max(1, colCountW - 1);
  const stepD = (d - colR * 4) / Math.max(1, colCountD - 1);
  const startX = -w / 2 + colR * 2;
  const startZ = -d / 2 + colR * 2;

  for (let x = 0; x < colCountW; x++) {
    for (let z = 0; z < colCountD; z++) {
      const isFront = z === colCountD - 1;
      const isPerimeter = x === 0 || x === colCountW - 1 || z === 0 || isFront;
      if (isPerimeter) {
        const col = createCorinthianColumn(colH, colR, 'marble');
        col.position.set(startX + x * stepW, podiumH, startZ + z * stepD);
        group.add(col);
      }
    }
  }

  // 3. Cella inner sanctum
  const cellaW = w * 0.72;
  const cellaD = d * 0.62;
  const cellaGeo = new THREE.BoxGeometry(cellaW, colH, cellaD);
  const cella = new THREE.Mesh(cellaGeo, marbleMat);
  cella.position.set(0, podiumH + colH / 2, -d * 0.12);
  cella.castShadow = true;
  cella.receiveShadow = true;
  group.add(cella);

  // 4. Entablature & Pediment
  const entY = podiumH + colH;
  const entH = colH * 0.15;
  const entablature = new THREE.Mesh(new THREE.BoxGeometry(w, entH, d), marbleMat);
  entablature.position.set(0, entY + entH / 2, 0);
  entablature.castShadow = true;
  group.add(entablature);

  const pedH = Math.min(w, d) * 0.24;
  const pediment = createPediment(w, d, pedH, 'marble');
  pediment.position.set(0, entY + entH, 0);
  group.add(pediment);

  const roof = createPediment(w + 0.8, d + 0.8, pedH + 0.25, 'roofTile');
  roof.position.set(0, entY + entH - 0.05, 0);
  group.add(roof);

  return group;
}

/* ── 16. Circular Monopteros & Tholos Temples (Vesta / Hercules) ── */

export function buildCircularTemple(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const radius = (b.w || 24) / 2;
  const h = b.h || 17;
  const podiumH = 1.6;
  const marbleMat = getMaterial('marble');

  // 1. Circular stepped podium
  const baseSteps = 4;
  for (let s = 0; s < baseSteps; s++) {
    const r = radius + (baseSteps - s) * 0.6;
    const stepMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, podiumH / baseSteps, 32),
      getMaterial('travertine')
    );
    stepMesh.position.y = (s + 0.5) * (podiumH / baseSteps);
    stepMesh.receiveShadow = true;
    group.add(stepMesh);
  }

  // 2. Circular colonnade ring
  const colCount = 18;
  const colH = (h - podiumH) * 0.6;
  const colR = colH / 12;
  const ringR = radius - colR * 2;

  for (let i = 0; i < colCount; i++) {
    const angle = (i / colCount) * Math.PI * 2;
    const cx = Math.cos(angle) * ringR;
    const cz = Math.sin(angle) * ringR;
    const col = createCorinthianColumn(colH, colR, 'marble');
    col.position.set(cx, podiumH, cz);
    group.add(col);
  }

  // 3. Cylindrical inner cella
  const cellaR = radius * 0.55;
  const cellaMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(cellaR, cellaR, colH, 32),
    marbleMat
  );
  cellaMesh.position.y = podiumH + colH / 2;
  cellaMesh.castShadow = true;
  cellaMesh.receiveShadow = true;
  group.add(cellaMesh);

  // 4. Circular Entablature & Conical Tholos Roof
  const entY = podiumH + colH;
  const entH = colH * 0.14;
  const entRing = new THREE.Mesh(
    new THREE.CylinderGeometry(radius + 0.2, radius + 0.2, entH, 32),
    marbleMat
  );
  entRing.position.y = entY + entH / 2;
  entRing.castShadow = true;
  group.add(entRing);

  const roofH = (h - entY);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(radius + 0.6, roofH, 32),
    getMaterial('roofTile')
  );
  roof.position.y = entY + entH + roofH / 2;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  return group;
}

export function buildStructure(building) {
  switch (building.type) {
    case 'temple': return buildRomanTemple(building);
    case 'round': return buildCircularTemple(building);
    case 'amphitheatre': return buildColosseum(building);
    case 'dome': return buildPantheon(building);
    case 'basilica': return buildBasilica(building);
    case 'arch': return buildTriumphalArch(building);
    case 'bath': return buildImperialBaths(building);
    case 'circus': return buildCircusMaximus(building);
    case 'church':
    case 'round-church': return buildChristianChurch(building);
    case 'mausoleum': return buildHadrianMausoleum(building);
    case 'pyramid': return buildPyramid(building);
    case 'column': return buildTrajanColumn(building);
    case 'aqueduct': return createAqueductArcade(building.w || 150, building.h || 20, building.d || 10, 6, 'travertine');
    case 'bridge': return createStoneArchBridge(building.w || 100, building.d || 15, building.h || 10, 5, 'travertine');
    case 'wall': return createCurtainWall(building.w || 200, building.h || 16, building.d || 4, 'romanBrick');
    case 'gate': return createFortifiedGate(building.w || 38, building.h || 22, building.d || 18, 12, 'travertine');
    case 'insula': return createRomanInsula(building.w || 24, building.d || 18, Math.max(2, Math.round((building.h || 15) / 3.4)), 'romanBrickWeathered');
    case 'charred-insula': return createCharredInsula(building.w || 22, building.d || 16, Math.max(2, Math.round((building.h || 12) / 3.4)));
    case 'collapsed-arcade': return buildCollapsedArcade(building.w || 24, building.h || 12, building.d || 5);
    case 'forum':
    case 'market':
    default: {
      const g = new THREE.Group();
      g.userData.buildingId = building.id;
      const b = new THREE.Mesh(new THREE.BoxGeometry(building.w || 20, building.h || 10, building.d || 20), getMaterial('romanBrick'));
      b.position.y = (building.h || 10) / 2;
      b.castShadow = true;
      b.receiveShadow = true;
      g.add(b);
      return g;
    }
  }
}
