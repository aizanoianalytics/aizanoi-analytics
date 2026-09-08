/**
 * builders.js — Procedural Architecture Factories for Late Antique Rome (AD 410–476)
 * Aizanoi Analytics unified worlds runtime
 *
 * Imports shared architectural blocks from ../shared/assets/builders-common.js
 * and materials from ../shared/assets/materials.js.
 */

import * as THREE from '../../shared/vendor/three.module.js';
import { getMaterial } from '../../shared/assets/materials.js';
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

/* ── Master Dispatcher ────────────────────────────────────── */

export function buildStructure(building) {
  switch (building.type) {
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
    case 'insula': return createRomanInsula(building.w || 24, building.d || 18, Math.max(2, Math.round((building.h || 15) / 3.4)), 'romanBrick');
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
