/**
 * builders.js — Modern Architectural Procedural Factories for İGA Istanbul Airport
 * Shared Asset Engine Rebuild · Aizanoi Analytics unified worlds runtime
 *
 * Implements Nordic / Grimshaw / Haptic-inspired daylight-focused vaulted ceiling,
 * Y-shaped tree columns, Bosphorus Duty Free promenade, high-contrast dark wayfinding,
 * biometric security e-gates, anchored jetways, and apron support equipment.
 */

import * as THREE from '../../shared/vendor/three.module.js';
import { getMaterial } from '../../shared/assets/materials.js';
import {
  buildModernAirliner,
  buildBaggageTug,
  buildFuelTruck,
} from '../../shared/assets/props.js';

/* ── 1. Grand Terminal Hall (Daylight Vaulted Architecture) ──── */

export function buildGrandTerminal(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 860;
  const d = b.d || 410;
  const h = 44; // Raised to 44m for airy, soaring cathedral proportions

  // 1. Polished Terrazzo Terminal Floor
  const floorGeo = new THREE.PlaneGeometry(w, d);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, getMaterial('apronConcrete', { roughness: 0.12, metalness: 0.08 }));
  floor.position.y = 0.05;
  floor.receiveShadow = true;
  group.add(floor);

  // Bosphorus Sinuous Ribbon Flooring Accent (curved central promenade in darker terrazzo)
  const ribbonGeo = new THREE.PlaneGeometry(w * 0.45, d * 0.95);
  ribbonGeo.rotateX(-Math.PI / 2);
  const ribbonMat = getMaterial('structuralSteel', { color: 0x1e2836, roughness: 0.2, metalness: 0.1 });
  const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbonMesh.position.set(0, 0.06, 0);
  ribbonMesh.receiveShadow = true;
  group.add(ribbonMesh);

  // 2. Perimeter Glass Curtain Walls with Structural Steel Mullions
  const glassMat = getMaterial('glassCurtain');
  const steelMat = getMaterial('structuralSteel');

  // North & South glass walls
  for (const zSide of [-d / 2, d / 2]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.2), glassMat);
    wall.position.set(0, h / 2, zSide);
    group.add(wall);

    // Architectural mullion ribs
    const numMullions = 24;
    for (let m = 0; m <= numMullions; m++) {
      const mx = -w / 2 + m * (w / numMullions);
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, 1.6), steelMat);
      mullion.position.set(mx, h / 2, zSide);
      mullion.castShadow = true;
      group.add(mullion);
    }
  }

  // East & West glass walls
  for (const xSide of [-w / 2, w / 2]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, d), glassMat);
    wall.position.set(xSide, h / 2, 0);
    group.add(wall);
  }

  // 3. Structural Tree Columns (Grand Y-Columns) & Vaulted Modular Ceiling Bays
  const colRows = 4;
  const colCols = 6;
  const stepX = w / (colCols + 1);
  const stepZ = d / (colRows + 1);

  // Translucent glowing daylight oculus material
  const oculusMat = new THREE.MeshStandardMaterial({
    color: 0xe8f4fc,
    emissive: 0xd4ecff,
    emissiveIntensity: 0.85,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.92,
  });

  const ceilingMat = getMaterial('aluminumAnodized', { color: 0xf0f3f6, roughness: 0.35 });

  // Grid of Vaulted Modular Bays with Skylight Oculus Windows & Tree Columns
  for (let r = 1; r <= colRows; r++) {
    for (let c = 1; c <= colCols; c++) {
      const colX = -w / 2 + c * stepX;
      const colZ = -d / 2 + r * stepZ;

      // Base stainless steel collar
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 1.4, 16), steelMat);
      collar.position.set(colX, 0.7, colZ);
      collar.receiveShadow = true;
      group.add(collar);

      // Main vertical column shaft
      const shaftH = h * 0.70;
      const colShaft = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.5, shaftH, 16), steelMat);
      colShaft.position.set(colX, 0.7 + shaftH / 2, colZ);
      colShaft.castShadow = true;
      group.add(colShaft);

      // Four diagonal branching steel arms reaching out to support vault corners
      const armH = h * 0.30;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const armGeo = new THREE.CylinderGeometry(0.5, 0.75, armH * 1.3, 8);
          armGeo.rotateZ(sx * 0.42);
          armGeo.rotateX(sz * 0.38);
          const arm = new THREE.Mesh(armGeo, steelMat);
          arm.position.set(colX + sx * 6.5, 0.7 + shaftH + armH * 0.45, colZ + sz * 6.0);
          arm.castShadow = true;
          group.add(arm);
        }
      }

      // Vaulted Ceiling Arch Bay
      const vaultGeo = new THREE.BoxGeometry(stepX * 0.94, 2.2, stepZ * 0.92);
      const vault = new THREE.Mesh(vaultGeo, ceilingMat);
      vault.position.set(colX, h + 1.1, colZ);
      vault.castShadow = true;
      group.add(vault);

      // Central Circular Skylight Oculus (16m diameter)
      const oculusGeo = new THREE.CylinderGeometry(8.0, 8.0, 0.4, 24);
      const oculus = new THREE.Mesh(oculusGeo, oculusMat);
      oculus.position.set(colX, h + 2.4, colZ);
      group.add(oculus);

      // Oculus trim ring
      const ringGeo = new THREE.TorusGeometry(8.2, 0.5, 8, 24);
      ringGeo.rotateX(Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, steelMat);
      ring.position.set(colX, h + 2.2, colZ);
      group.add(ring);

    }
  }

  // Soft warm interior terminal fill lights (high efficiency, no per-pixel shader overload)
  for (const zOffset of [-d * 0.25, d * 0.25]) {
    const hallLight = new THREE.PointLight(0xfff3e4, 1.2, 450, 1.0);
    hallLight.position.set(0, h - 6, zOffset);
    group.add(hallLight);
  }

  // 4. Bosphorus Duty Free Central Promenade (between check-in and security)
  const dutyFreeGroup = buildDutyFreePromenade(w * 0.65, 85);
  dutyFreeGroup.position.set(0, 0, 50);
  group.add(dutyFreeGroup);

  // 5. Overhead Modern High-Contrast Wayfinding Signage Panels
  const wayfindingGroup = buildWayfindingPanels(w, d);
  group.add(wayfindingGroup);

  return group;
}

/* ── 2. Bosphorus Duty Free Retail Promenade ───────────────── */

function buildDutyFreePromenade(width, depth) {
  const group = new THREE.Group();
  const shopMat = getMaterial('aluminumAnodized', { color: 0x222933 });
  const displayMat = new THREE.MeshStandardMaterial({
    color: 0xfff6ea,
    emissive: 0xffe8cc,
    emissiveIntensity: 0.6,
    roughness: 0.2
  });

  // Boutique Storefront Pavilions (Luxury Brands & Old Bazaar)
  const numStores = 6;
  const storeW = width / numStores - 4;
  const storeD = 18;
  const storeH = 5.5;

  for (let i = 0; i < numStores; i++) {
    const sx = -width / 2 + (i + 0.5) * (width / numStores);

    // North store bank
    const storeN = new THREE.Mesh(new THREE.BoxGeometry(storeW, storeH, storeD), shopMat);
    storeN.position.set(sx, storeH / 2, -depth / 2 + storeD / 2);
    storeN.castShadow = true;
    group.add(storeN);

    // Glowing storefront display glass
    const displayN = new THREE.Mesh(new THREE.BoxGeometry(storeW * 0.8, storeH * 0.7, 0.2), displayMat);
    displayN.position.set(sx, storeH * 0.5, -depth / 2 + storeD + 0.1);
    group.add(displayN);

    // South store bank
    const storeS = new THREE.Mesh(new THREE.BoxGeometry(storeW, storeH, storeD), shopMat);
    storeS.position.set(sx, storeH / 2, depth / 2 - storeD / 2);
    storeS.castShadow = true;
    group.add(storeS);

    const displayS = new THREE.Mesh(new THREE.BoxGeometry(storeW * 0.8, storeH * 0.7, 0.2), displayMat);
    displayS.position.set(sx, storeH * 0.5, depth / 2 - storeD - 0.1);
    group.add(displayS);
  }

  // Central Lounge Islands (modern curved bench pods & planters)
  for (const lx of [-width * 0.25, 0, width * 0.25]) {
    const planter = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 4.0, 0.9, 16),
      getMaterial('structuralSteel', { color: 0x2a323d })
    );
    planter.position.set(lx, 0.45, 0);
    group.add(planter);

    const bench = new THREE.Mesh(
      new THREE.TorusGeometry(5.8, 0.6, 8, 20),
      getMaterial('woodPlanks', { color: 0xb89264 })
    );
    bench.rotateX(Math.PI / 2);
    bench.position.set(lx, 0.55, 0);
    group.add(bench);
  }

  return group;
}

/* ── 3. High-Contrast Modern Wayfinding & FIDS Screens ──────── */

function buildWayfindingPanels(w, d) {
  const group = new THREE.Group();

  const darkPanelMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.3 });
  const fidsScreenMat = new THREE.MeshStandardMaterial({
    color: 0x0a1428,
    emissive: 0x1a457a,
    emissiveIntensity: 0.8,
    roughness: 0.2
  });
  const yellowAccentMat = new THREE.MeshStandardMaterial({
    color: 0xffcc00,
    emissive: 0xffaa00,
    emissiveIntensity: 0.7
  });

  // 1. Central Flight Information Display Systems (Grand FIDS Tower)
  const fidsW = 28;
  const fidsH = 7.5;
  const fidsD = 2.0;
  for (const fidsZ of [-10, 80]) {
    const fidsBox = new THREE.Mesh(new THREE.BoxGeometry(fidsW, fidsH, fidsD), darkPanelMat);
    fidsBox.position.set(0, 11, fidsZ);
    fidsBox.castShadow = true;
    group.add(fidsBox);

    // Front & rear illuminated flight display panels
    for (const zSide of [-1, 1]) {
      const screen = new THREE.Mesh(new THREE.BoxGeometry(fidsW * 0.92, fidsH * 0.82, 0.1), fidsScreenMat);
      screen.position.set(0, 11, fidsZ + zSide * (fidsD / 2 + 0.06));
      group.add(screen);

      // Yellow header strip
      const header = new THREE.Mesh(new THREE.BoxGeometry(fidsW * 0.92, 0.6, 0.12), yellowAccentMat);
      header.position.set(0, 11 + fidsH * 0.36, fidsZ + zSide * (fidsD / 2 + 0.07));
      group.add(header);
    }
  }

  // 2. Overhead Suspended Directional Wayfinding Signs
  const wayfindingSigns = [
    { x: -160, z: -10, text: 'Gates A · B ➔' },
    { x: 160, z: -10, text: 'Gates F · G ➔' },
    { x: 0, z: 95, text: 'Passport Control · Security ➔' },
    { x: -140, z: 95, text: 'International Transfers ➔' },
    { x: 140, z: 95, text: 'Bosphorus Lounges ➔' },
  ];

  for (const s of wayfindingSigns) {
    const signBox = new THREE.Mesh(new THREE.BoxGeometry(16, 2.6, 0.4), darkPanelMat);
    signBox.position.set(s.x, 8.5, s.z);
    group.add(signBox);

    // Yellow direction arrow accent
    const arrow = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.45), yellowAccentMat);
    arrow.position.set(s.x + 6.2, 8.5, s.z);
    group.add(arrow);

    // Steel suspension cables to ceiling
    for (const cableX of [-6, 6]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 30, 4), getMaterial('structuralSteel'));
      cable.position.set(s.x + cableX, 23.5, s.z);
      group.add(cable);
    }
  }

  return group;
}

/* ── 4. Central Security & Biometric E-Gate Filter ──────────── */

export function buildSecurityFilter(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 410;
  const d = b.d || 26;
  const h = b.h || 12;

  const steelMat = getMaterial('structuralSteel');
  const glassMat = getMaterial('glassCurtain', { opacity: 0.65 });
  const blueGateMat = new THREE.MeshStandardMaterial({
    color: 0x0088cc,
    emissive: 0x00a2ff,
    emissiveIntensity: 0.9,
    roughness: 0.2
  });

  // Base screening boundary floor
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.2, d),
    getMaterial('aluminumAnodized', { color: 0x1e242d })
  );
  floor.position.y = 0.1;
  floor.receiveShadow = true;
  group.add(floor);

  // Left & Right Partition Walls (leaving central 30m security corridor open)
  const laneW = (w - 36) / 2;
  for (const side of [-1, 1]) {
    const wallX = side * (w / 2 - laneW / 2);

    // Glass security wall partition
    const glassWall = new THREE.Mesh(new THREE.BoxGeometry(laneW, 3.2, 0.4), glassMat);
    glassWall.position.set(wallX, 1.7, 0);
    group.add(glassWall);

    // Automated E-Gate banks (biometric turnstiles with glowing blue scanner halos)
    const numGates = Math.floor(laneW / 5.5);
    for (let g = 0; g < numGates; g++) {
      const gx = wallX - laneW / 2 + (g + 0.5) * 5.5;

      // Turnstile pedestal
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.3, 2.4), steelMat);
      pedestal.position.set(gx, 0.75, 0);
      pedestal.castShadow = true;
      group.add(pedestal);

      // Biometric blue scanner ring
      const scanner = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12), blueGateMat);
      scanner.position.set(gx, 1.45, -0.6);
      group.add(scanner);

      // Metal detector walkthrough portal
      const portalLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.6), steelMat);
      portalLeft.position.set(gx - 0.9, 1.4, 0);
      group.add(portalLeft);

      const portalRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.6), steelMat);
      portalRight.position.set(gx + 0.9, 1.4, 0);
      group.add(portalRight);

      const portalTop = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 0.6), steelMat);
      portalTop.position.set(gx, 2.7, 0);
      group.add(portalTop);
    }
  }

  // Overhead directional canopy above security filter
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.8, d * 0.6), steelMat);
  canopy.position.set(0, h * 0.65, 0);
  canopy.castShadow = true;
  group.add(canopy);

  return group;
}

/* ── 5. Tulip-Inspired Air Traffic Control Tower (90m) ────── */

export function buildTulipTower(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const h = b.h || 90;
  const shaftMat = getMaterial('atcShaft');
  const glassMat = getMaterial('glassCurtain', { opacity: 0.8, roughness: 0.05 });

  // Aerodynamic Tulip Stem (Pininfarina/AECOM iconic profile)
  const stemH = h * 0.68;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 8.5, stemH, 24), shaftMat);
  stem.position.y = stemH / 2;
  stem.castShadow = true;
  group.add(stem);

  // Tulip Petal Bulge
  const bulbH = h * 0.20;
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(14.0, 5.2, bulbH, 24), shaftMat);
  bulb.position.y = stemH + bulbH / 2;
  bulb.castShadow = true;
  group.add(bulb);

  // 360-degree Wrap-around Glazed Control Cab
  const cabH = h * 0.08;
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(15.5, 13.5, cabH, 24), glassMat);
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

  // Red Flashing Obstruction Hazard Beacon atop ATC Tower
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xff1100,
    emissiveIntensity: 2.0
  });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), beaconMat);
  beacon.position.y = h + 12.5;
  group.add(beacon);

  return group;
}

/* ── 6. Check-in Islands (Automated Bag Drop & Ticketing) ─── */

export function buildCheckinIslands(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 190;
  const d = b.d || 68;
  const rows = 4;
  const rowSpacing = d / (rows + 1);

  const counterMat = getMaterial('aluminumAnodized', { color: 0x242c36 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x003366,
    emissive: 0x0066aa,
    emissiveIntensity: 0.8,
    roughness: 0.3
  });

  for (let r = 1; r <= rows; r++) {
    const z = -d / 2 + r * rowSpacing;

    // Island main counter bank
    const island = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 1.3, 4.0), counterMat);
    island.position.set(0, 0.65, z);
    island.castShadow = true;
    group.add(island);

    // Individual automated bag drop stations with conveyor belts
    const deskCount = 14;
    const deskSpacing = (w * 0.80) / deskCount;
    for (let i = 0; i < deskCount; i++) {
      const dx = -(w * 0.80) / 2 + (i + 0.5) * deskSpacing;

      // Bag scale / conveyor
      const conveyor = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.25, 2.2),
        getMaterial('tarmac', { color: 0x111111 })
      );
      conveyor.position.set(dx, 0.2, z - 2.5);
      group.add(conveyor);

      // Desk monitor
      const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.1), screenMat);
      monitor.position.set(dx, 1.6, z - 1.2);
      monitor.rotation.x = -0.2;
      group.add(monitor);
    }

    // Overhead FIDS Flight Display Canopy
    const fids = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.82, 1.4, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111822, emissive: 0x0b2545, emissiveIntensity: 0.5 })
    );
    fids.position.set(0, 4.2, z);
    group.add(fids);
  }

  return group;
}

/* ── 7. International Concourse Piers & Anchored Jetways ────── */

export function buildPierConcourse(b) {
  const group = new THREE.Group();
  group.userData.buildingId = b.id;

  const w = b.w || 105;
  const d = b.d || 720;
  const h = b.h || 18;

  // Main pier concourse body
  const concourse = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    getMaterial('aluminumAnodized', { color: 0x303844 })
  );
  concourse.position.y = h / 2;
  concourse.castShadow = true;
  concourse.receiveShadow = true;
  group.add(concourse);

  // Apron-facing continuous floor-to-ceiling glass ribbon
  const glassRibbon = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.6, h * 0.65, d),
    getMaterial('glassCurtain', { opacity: 0.75 })
  );
  glassRibbon.position.y = h * 0.55;
  group.add(glassRibbon);

  // Jetway Boarding Bridges (fully anchored to terminal and tarmac)
  const gateBays = Math.floor(d / 90);
  const steelMat = getMaterial('structuralSteel');
  const aluminumMat = getMaterial('aluminumAnodized');

  for (let g = 0; g < gateBays; g++) {
    const gateZ = -d / 2 + 50 + g * 90;

    for (const side of [-1, 1]) {
      const bridgeLen = 32;
      const bridgeCenter = side * (w / 2 + bridgeLen / 2);

      // 1. Terminal Rotunda Pivot Node (anchoring bridge to concourse facade)
      const rotunda = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 5.0, 16), steelMat);
      rotunda.position.set(side * (w / 2 + 2), 5.5, gateZ);
      rotunda.castShadow = true;
      group.add(rotunda);

      // 2. Telescopic Glass-Sided Boarding Bridge Tunnel
      const jetway = new THREE.Mesh(new THREE.BoxGeometry(bridgeLen, 4.0, 3.8), aluminumMat);
      jetway.position.set(bridgeCenter, 5.5, gateZ);
      jetway.castShadow = true;
      group.add(jetway);

      // Glass viewing ribbon along jetway
      const jGlass = new THREE.Mesh(new THREE.BoxGeometry(bridgeLen * 0.85, 2.0, 4.0), getMaterial('glassCurtain'));
      jGlass.position.set(bridgeCenter, 5.8, gateZ);
      group.add(jGlass);

      // 3. Sturdy Steel Support Bogie & Columns down to tarmac (y = 0)
      const colX = side * (w / 2 + bridgeLen - 5);
      const supportCol = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 3.5, 8), steelMat);
      supportCol.position.set(colX, 1.75, gateZ);
      supportCol.castShadow = true;
      group.add(supportCol);

      // Wheel bogie base at tarmac level
      const wheelBogie = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.6, 2.8),
        getMaterial('tarmac', { color: 0x222222 })
      );
      wheelBogie.position.set(colX, 0.3, gateZ);
      group.add(wheelBogie);

      // 4. Aircraft Boarding Accordion Cab at the outer end
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 4.2, 4.4),
        getMaterial('structuralSteel', { color: 0x1f242c })
      );
      cab.position.set(side * (w / 2 + bridgeLen + 1), 5.5, gateZ);
      cab.castShadow = true;
      group.add(cab);
    }
  }

  return group;
}

/* ── 8. Apron Stands with High-Fidelity Airliners & GSE ─────── */

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

  // Parked high-detail widebody airliners with full landing gear, GE90 engines, and winglets
  const jet1 = buildModernAirliner(-w * 0.25, -d * 0.15, Math.PI * 0.15);
  group.add(jet1);

  const jet2 = buildModernAirliner(w * 0.25, d * 0.15, -Math.PI * 0.15);
  group.add(jet2);

  // Ground service vehicles servicing the aircraft
  const tug1 = buildBaggageTug(-w * 0.25 + 24, -d * 0.15 + 8, Math.PI * 0.25);
  group.add(tug1);

  const fuel1 = buildFuelTruck(w * 0.25 - 16, d * 0.15 - 12, -Math.PI * 0.35);
  group.add(fuel1);

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
    case 'gateway': return buildSecurityFilter(building);
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

      // Elevated Curbside Drop-off Canopy along terminal front
      const canopyW = (building.w || 800) * 0.75;
      const canopyD = 36;
      const canopyH = 11;
      const canopyZ = 90;

      const colMat = getMaterial('structuralSteel');
      const numCols = Math.floor(canopyW / 40);
      for (let c = 0; c <= numCols; c++) {
        const colX = -canopyW / 2 + c * 40;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, canopyH, 12), colMat);
        col.position.set(colX, canopyH / 2, canopyZ);
        col.castShadow = true;
        g.add(col);
      }

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
