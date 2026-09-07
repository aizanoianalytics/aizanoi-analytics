/**
 * builders.js — Modern Architectural Procedural Factories for İGA Istanbul Airport
 * Shared Asset Engine Rebuild · Aizanoi Analytics unified worlds runtime
 */

import * as THREE from '../../shared/vendor/three.module.js';
import { getMaterial } from '../../shared/assets/materials.js';

/* ── 1. Grand Terminal Hall (1.4M m² Vaulted Volume) ──────── */

export function buildGrandTerminal(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 860;
  const d = b.d || 410;
  const h = b.h || 38;

  // Polished Terrazzo Terminal Floor
  const floorGeo = new THREE.PlaneGeometry(w, d);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, getMaterial('apronConcrete', { roughness: 0.15, metalness: 0.1 }));
  floor.position.y = 0.05;
  floor.receiveShadow = true;
  group.add(floor);

  // Perimeter Glass Curtain Walls with Structural Steel Mullions
  const glassMat = getMaterial('glassCurtain');
  const steelMat = getMaterial('structuralSteel');

  // North & South glass walls
  for (const zSide of [-d / 2, d / 2]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.2), glassMat);
    wall.position.set(0, h / 2, zSide);
    group.add(wall);
  }

  // East & West glass walls
  for (const xSide of [-w / 2, w / 2]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, d), glassMat);
    wall.position.set(xSide, h / 2, 0);
    group.add(wall);
  }

  // Structural Support Tree Columns (Grand Y-columns characteristic of Istanbul Airport)
  const colRows = 4;
  const colCols = 7;
  const stepX = w / (colCols + 1);
  const stepZ = d / (colRows + 1);

  for (let r = 1; r <= colRows; r++) {
    for (let c = 1; c <= colCols; c++) {
      const colX = -w / 2 + c * stepX;
      const colZ = -d / 2 + r * stepZ;

      // Vertical shaft
      const colShaft = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, h * 0.75, 16), steelMat);
      colShaft.position.set(colX, (h * 0.75) / 2, colZ);
      colShaft.castShadow = true;
      group.add(colShaft);

      // Flaring branches supporting the ceiling vault
      const flareGeo = new THREE.ConeGeometry(7.0, h * 0.25, 8);
      flareGeo.rotateX(Math.PI);
      const flare = new THREE.Mesh(flareGeo, steelMat);
      flare.position.set(colX, h * 0.75 + (h * 0.25) / 2, colZ);
      group.add(flare);
    }
  }

  // Geometric Vaulted Roof Grid with Skylight Oculus Windows
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w + 10, 3.5, d + 10),
    getMaterial('aluminumAnodized')
  );
  roof.position.y = h + 1.75;
  roof.castShadow = true;
  group.add(roof);

  return group;
}

/* ── 2. Tulip-Inspired Air Traffic Control Tower (90m) ────── */

export function buildTulipTower(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const h = b.h || 90;
  const shaftMat = getMaterial('atcShaft');
  const glassMat = getMaterial('glassCurtain', { opacity: 0.8, roughness: 0.05 });

  // Aerodynamic Tulip Stem (tapering cylinder with smooth curvature)
  const stemH = h * 0.68;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(5.2, 8.5, stemH, 24),
    shaftMat
  );
  stem.position.y = stemH / 2;
  stem.castShadow = true;
  group.add(stem);

  // Tulip Petal Bulge (the characteristic organic flare of Pininfarina design)
  const bulbH = h * 0.20;
  const bulb = new THREE.Mesh(
    new THREE.CylinderGeometry(14.0, 5.2, bulbH, 24),
    shaftMat
  );
  bulb.position.y = stemH + bulbH / 2;
  bulb.castShadow = true;
  group.add(bulb);

  // Control Cab (360-degree wrap-around glazed viewing gallery)
  const cabH = h * 0.08;
  const cab = new THREE.Mesh(
    new THREE.CylinderGeometry(15.5, 13.5, cabH, 24),
    glassMat
  );
  cab.position.y = stemH + bulbH + cabH / 2;
  group.add(cab);

  // Crown Roof & Radar / Antenna Mast
  const crownH = h * 0.04;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(12.0, 15.5, crownH, 24), shaftMat);
  crown.position.y = stemH + bulbH + cabH + crownH / 2;
  group.add(crown);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 12, 8), getMaterial('structuralSteel'));
  mast.position.y = h + 6;
  group.add(mast);

  return group;
}

/* ── 3. Check-in Islands (Automated Bag Drop & Desks) ──────── */

export function buildCheckinIslands(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 190;
  const d = b.d || 68;
  const h = b.h || 6;

  // Multiple parallel island counters
  const rows = 4;
  const rowSpacing = d / (rows + 1);

  for (let r = 1; r <= rows; r++) {
    const z = -d / 2 + r * rowSpacing;

    // Island counter base
    const island = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.85, 1.4, 3.8),
      getMaterial('aluminumAnodized')
    );
    island.position.set(0, 0.7, z);
    island.castShadow = true;
    group.add(island);

    // Overhead Flight Information Display Screen (FIDS)
    const fids = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.80, 1.2, 0.3),
      getMaterial('structuralSteel', { color: 0x181c24 })
    );
    fids.position.set(0, 3.8, z);
    group.add(fids);
  }

  return group;
}

/* ── 4. International Concourse Piers & Jetways ────────────── */

export function buildPierConcourse(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 105;
  const d = b.d || 720;
  const h = b.h || 18;

  // Main pier glass concourse body
  const concourse = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    getMaterial('aluminumAnodized')
  );
  concourse.position.y = h / 2;
  concourse.castShadow = true;
  concourse.receiveShadow = true;
  group.add(concourse);

  // Apron-facing continuous floor-to-ceiling glass ribbon
  const glassRibbon = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.4, h * 0.65, d),
    getMaterial('glassCurtain')
  );
  glassRibbon.position.y = h * 0.55;
  group.add(glassRibbon);

  // Jetway Boarding Bridges extending from the pier to aircraft positions
  const gateBays = Math.floor(d / 90);
  for (let g = 0; g < gateBays; g++) {
    const gateZ = -d / 2 + 50 + g * 90;

    for (const side of [-1, 1]) {
      const jetway = new THREE.Mesh(
        new THREE.BoxGeometry(32, 4.0, 4.0),
        getMaterial('aluminumAnodized')
      );
      jetway.position.set(side * (w / 2 + 16), 5.5, gateZ);
      jetway.castShadow = true;
      group.add(jetway);
    }
  }

  return group;
}

/* ── 5. Apron Stands with Commercial Jet Airliners ─────────── */

function buildAirliner() {
  const jet = new THREE.Group();

  const fuselageMat = getMaterial('jetFuselage');
  const accentMat = getMaterial('jetLivery');
  const wingMat = getMaterial('aluminumAnodized');

  // Fuselage cylinder
  const bodyGeo = new THREE.CylinderGeometry(2.8, 2.8, 56, 16);
  bodyGeo.rotateX(Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, fuselageMat);
  body.position.y = 5.5;
  body.castShadow = true;
  jet.add(body);

  // Nose cone
  const noseGeo = new THREE.ConeGeometry(2.8, 7.0, 16);
  noseGeo.rotateX(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, fuselageMat);
  nose.position.set(0, 5.5, -31.5);
  jet.add(nose);

  // Swept Wings (Left & Right)
  const wingGeo = new THREE.BoxGeometry(54, 0.6, 9.0);
  const wings = new THREE.Mesh(wingGeo, wingMat);
  wings.position.set(0, 4.8, 2.0);
  wings.castShadow = true;
  jet.add(wings);

  // Turbofan Jet Engines
  for (const side of [-12, 12]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.4, 6.0, 16), getMaterial('structuralSteel'));
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side, 3.2, 1.0);
    jet.add(engine);
  }

  // Vertical Tail Fin with Turkish Red livery
  const tailGeo = new THREE.BoxGeometry(0.5, 9.0, 7.0);
  const tail = new THREE.Mesh(tailGeo, accentMat);
  tail.position.set(0, 10.0, 24.0);
  jet.add(tail);

  return jet;
}

export function buildApronStands(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 260;
  const d = b.d || 260;

  // Tarmac concrete apron surface
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    getMaterial('tarmac')
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.05;
  apron.receiveShadow = true;
  group.add(apron);

  // Parked Modern Commercial Airliners (e.g. A350 / B777 scale)
  const jet1 = buildAirliner();
  jet1.position.set(-w * 0.25, 0, -d * 0.15);
  jet1.rotation.y = Math.PI * 0.15;
  group.add(jet1);

  const jet2 = buildAirliner();
  jet2.position.set(w * 0.25, 0, d * 0.15);
  jet2.rotation.y = -Math.PI * 0.15;
  group.add(jet2);

  return group;
}

/* ── Master Dispatcher for İGA Airport ────────────────────── */

export function buildStructure(building) {
  switch (building.type) {
    case 'terminal': return buildGrandTerminal(building);
    case 'tower': return buildTulipTower(building);
    case 'checkin': return buildCheckinIslands(building);
    case 'pier': return buildPierConcourse(building);
    case 'apron': return buildApronStands(building);
    case 'forecourt': {
      const g = new THREE.Group();
      g.userData.buildingId = building.id;

      // Paved forecourt drop-off roadway & pedestrian pavement
      const pave = new THREE.Mesh(
        new THREE.PlaneGeometry(building.w || 800, building.d || 240),
        getMaterial('tarmac')
      );
      pave.rotateX(-Math.PI / 2);
      pave.position.y = 0.05;
      pave.receiveShadow = true;
      g.add(pave);

      // Elevated Curbside Drop-off Canopy along the terminal front (depth 35m, not entire plaza)
      const canopyW = (building.w || 800) * 0.75;
      const canopyD = 36;
      const canopyH = 11;
      const canopyZ = 90; // Near terminal south facade

      // Support steel columns
      const colMat = getMaterial('structuralSteel');
      const numCols = Math.floor(canopyW / 40);
      for (let c = 0; c <= numCols; c++) {
        const colX = -canopyW / 2 + c * 40;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, canopyH, 12), colMat);
        col.position.set(colX, canopyH / 2, canopyZ);
        col.castShadow = true;
        g.add(col);
      }

      // Slender architectural aerodynamic canopy roof
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(canopyW, 0.8, canopyD),
        getMaterial('aluminumAnodized')
      );
      roof.position.set(0, canopyH, canopyZ);
      roof.castShadow = true;
      g.add(roof);

      return g;
    }
    default: {
      const g = new THREE.Group();
      g.userData.buildingId = building.id;
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(building.w || 30, building.h || 8, building.d || 30),
        getMaterial('aluminumAnodized')
      );
      b.position.y = (building.h || 8) / 2;
      g.add(b);
      return g;
    }
  }
}
