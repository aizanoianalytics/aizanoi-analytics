/**
 * props.js — Parametric Urban Life, Street Furniture, & Architectural Dressing Props
 * Shared Asset Engine · Aizanoi Analytics unified worlds runtime
 *
 * Implements high-detail reusable 3D assets to populate ancient streets,
 * forums, sanctuaries, and modern airport aprons.
 */

import * as THREE from '../vendor/three.module.js';
import { getMaterial } from './materials.js';

/* ── 1. Classical Amphorae (Storage Vessels) ──────────────── */

export function buildAmphora(height = 1.1) {
  const group = new THREE.Group();
  const mat = getMaterial('terracotta');

  // Body: pointed base tapering into wide belly, then narrow neck
  const points = [
    new THREE.Vector2(0.04, 0),
    new THREE.Vector2(0.12, 0.25 * height),
    new THREE.Vector2(0.24, 0.55 * height),
    new THREE.Vector2(0.20, 0.75 * height),
    new THREE.Vector2(0.09, 0.88 * height),
    new THREE.Vector2(0.12, height),
    new THREE.Vector2(0.08, height),
  ];
  const lathe = new THREE.LatheGeometry(points, 16);
  const mesh = new THREE.Mesh(lathe, mat);
  mesh.castShadow = true;
  group.add(mesh);

  // Twin handles
  const handleGeo = new THREE.TorusGeometry(0.12 * height, 0.02 * height, 6, 12, Math.PI * 0.85);
  const h1 = new THREE.Mesh(handleGeo, mat);
  h1.position.set(0.14, 0.75 * height, 0);
  h1.rotation.z = Math.PI * 0.15;
  group.add(h1);

  const h2 = h1.clone();
  h2.position.set(-0.14, 0.75 * height, 0);
  h2.rotation.z = -Math.PI * 0.15;
  group.add(h2);

  return group;
}

export function buildAmphoraCluster(x, z, count = 5, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  for (let i = 0; i < count; i++) {
    const scale = 0.85 + Math.random() * 0.35;
    const a = buildAmphora(1.0 * scale);
    const offsetX = (Math.random() - 0.5) * 1.2;
    const offsetZ = (Math.random() - 0.5) * 1.2;
    a.position.set(offsetX, 0, offsetZ);
    // Slight lean against wall or each other
    a.rotation.z = (Math.random() - 0.5) * 0.18;
    a.rotation.y = Math.random() * Math.PI * 2;
    group.add(a);
  }
  return group;
}

/* ── 2. Street Market Stalls (Tabernae Booths) ─────────────── */

export function buildMarketStall(x, z, rot = 0, canopyColor = 0xd26838) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const woodMat = getMaterial('wood');
  const clothMat = getMaterial('plaster', { color: canopyColor, roughness: 0.85 });

  // 4 Corner Timber Posts
  const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6);
  const postPositions = [
    [-1.2, 1.3, -0.9],
    [ 1.2, 1.3, -0.9],
    [-1.2, 1.2,  0.9],
    [ 1.2, 1.2,  0.9],
  ];
  for (const [px, py, pz] of postPositions) {
    const post = new THREE.Mesh(postGeo, woodMat);
    post.position.set(px, py, pz);
    post.castShadow = true;
    group.add(post);
  }

  // Counter table
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.2), woodMat);
  tableTop.position.set(0, 0.9, 0.1);
  tableTop.castShadow = true;
  group.add(tableTop);

  // Slanted textile awning canopy
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.05, 2.1), clothMat);
  canopy.position.set(0, 2.55, 0);
  canopy.rotation.x = 0.12; // sloped forward
  canopy.castShadow = true;
  group.add(canopy);

  // Produce crates / amphorae on the counter
  const crateMat = getMaterial('woodPlanks');
  for (let c = 0; c < 3; c++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.25, 0.45), crateMat);
    crate.position.set(-0.7 + c * 0.7, 1.05, 0.1);
    crate.castShadow = true;
    group.add(crate);
  }

  return group;
}

/* ── 3. Bronze Tripod Braziers & Fire ─────────────────────── */

export function buildBrazier(x, z, height = 1.4) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const bronzeMat = getMaterial('bronze');

  // 3 Curved bronze legs
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, height, 8), bronzeMat);
    leg.position.set(Math.cos(angle) * 0.35, height / 2, Math.sin(angle) * 0.35);
    leg.rotation.z = Math.cos(angle) * 0.15;
    leg.rotation.x = -Math.sin(angle) * 0.15;
    leg.castShadow = true;
    group.add(leg);
  }

  // Bronze bowl
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), bronzeMat);
  bowl.position.set(0, height, 0);
  bowl.rotation.x = Math.PI;
  group.add(bowl);

  // Glowing coals
  const coalMat = new THREE.MeshStandardMaterial({
    color: 0xff4400,
    emissive: 0xff2200,
    emissiveIntensity: 0.8,
    roughness: 0.9,
  });
  const coal = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38), coalMat);
  coal.position.set(0, height + 0.05, 0);
  group.add(coal);

  // Point light for nighttime flickering glow
  const light = new THREE.PointLight(0xff6622, 1.5, 12);
  light.position.set(0, height + 0.4, 0);
  group.add(light);

  return group;
}

/* ── 4. Classical Statues & Monuments ─────────────────────── */

export function buildStatueMonument(x, z, rot = 0, isAthena = false, isDecayed = false) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const marbleMat = isDecayed ? getMaterial('travertine') : getMaterial('marble');
  const bronzeMat = isDecayed ? getMaterial('verdigrisBronze') : getMaterial('bronze');
  const goldMat = isDecayed ? getMaterial('verdigrisBronze') : getMaterial('goldLeaf');

  // Stepped marble pedestal (3 tiers)
  const base1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 2.4), marbleMat);
  base1.position.y = 0.2;
  base1.castShadow = true;
  group.add(base1);

  const base2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 1.8), marbleMat);
  base2.position.y = 0.65;
  base2.castShadow = true;
  group.add(base2);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.4), marbleMat);
  plinth.position.y = 1.2;
  plinth.castShadow = true;
  group.add(plinth);

  // Bronze Statue Figure
  const statY = 1.5;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.25, 1.4, 10), bronzeMat);
  torso.position.y = statY + 0.9;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), bronzeMat);
  head.position.y = statY + 1.8;
  head.castShadow = true;
  group.add(head);

  // Helmet crest
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.45), goldMat);
  crest.position.set(0, statY + 2.05, 0.05);
  group.add(crest);

  if (isAthena) {
    // Spear (held vertical, tipped with gold leaf)
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.2, 8), bronzeMat);
    spear.position.set(0.65, statY + 2.0, 0.2);
    group.add(spear);

    const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 8), goldMat);
    spearTip.position.set(0.65, statY + 4.2, 0.2);
    group.add(spearTip);

    // Round Shield
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.06, 16), bronzeMat);
    shield.position.set(-0.65, statY + 0.8, 0.1);
    shield.rotation.z = Math.PI / 2;
    group.add(shield);
  }

  return group;
}

/* ── 5. Inscribed Marble Stele ────────────────────────────── */

export function buildInscribedStele(x, z, rot = 0, title = 'Edictum') {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const marbleMat = getMaterial('marble');

  // Base plinth
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.8), marbleMat);
  base.position.y = 0.15;
  group.add(base);

  // Upright slab (stele)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.22), marbleMat);
  slab.position.y = 1.4;
  slab.castShadow = true;
  group.add(slab);

  // Triangular pedimental crowning finial
  const ped = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 4), marbleMat);
  ped.position.y = 2.7;
  ped.rotation.y = Math.PI / 4;
  group.add(ped);

  return group;
}

/* ── 6. Classical Stone Bench ─────────────────────────────── */

export function buildStoneBench(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const mat = getMaterial('marble');

  // Seat slab
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.6), mat);
  seat.position.y = 0.52;
  seat.castShadow = true;
  group.add(seat);

  // Twin support legs
  const legGeo = new THREE.BoxGeometry(0.18, 0.46, 0.52);
  const leg1 = new THREE.Mesh(legGeo, mat);
  leg1.position.set(-0.8, 0.23, 0);
  group.add(leg1);

  const leg2 = new THREE.Mesh(legGeo, mat);
  leg2.position.set(0.8, 0.23, 0);
  group.add(leg2);

  return group;
}

/* ── 7. Roman Nymphaeum / Water Fountain ──────────────────── */

export function buildRomanFountain(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const stoneMat = getMaterial('travertine');
  const waterMat = getMaterial('waterSurface');

  // Octagonal outer stone basin
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.8, 8, 1, false), stoneMat);
  basin.position.y = 0.4;
  basin.castShadow = true;
  group.add(basin);

  // Inner water disc
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.05, 8), waterMat);
  water.position.y = 0.72;
  group.add(water);

  // Central ornate stone pedestal & water jet
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.6, 8), stoneMat);
  pillar.position.y = 1.2;
  group.add(pillar);

  const upperBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.3, 0.35, 8), stoneMat);
  upperBowl.position.y = 2.15;
  group.add(upperBowl);

  return group;
}

/* ── 8. Wooden Merchant Cart / Wagon ──────────────────────── */

export function buildWoodenCart(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const woodMat = getMaterial('wood');
  const ironMat = getMaterial('structuralSteel');

  // Flat cart bed
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.4), woodMat);
  bed.position.y = 0.75;
  bed.castShadow = true;
  group.add(bed);

  // Side boards
  const sideGeo = new THREE.BoxGeometry(2.4, 0.4, 0.08);
  const leftSide = new THREE.Mesh(sideGeo, woodMat);
  leftSide.position.set(0, 0.95, 0.66);
  group.add(leftSide);

  const rightSide = new THREE.Mesh(sideGeo, woodMat);
  rightSide.position.set(0, 0.95, -0.66);
  group.add(rightSide);

  // Axle
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), ironMat);
  axle.rotation.x = Math.PI / 2;
  axle.position.set(0, 0.65, 0);
  group.add(axle);

  // Two large spoked wooden wheels
  const wheelGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.08, 16);
  wheelGeo.rotateX(Math.PI / 2);

  const w1 = new THREE.Mesh(wheelGeo, woodMat);
  w1.position.set(0, 0.65, 0.85);
  w1.castShadow = true;
  group.add(w1);

  const w2 = new THREE.Mesh(wheelGeo, woodMat);
  w2.position.set(0, 0.65, -0.85);
  w2.castShadow = true;
  group.add(w2);

  // Pull shafts
  const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6);
  shaftGeo.rotateZ(Math.PI / 2);
  const s1 = new THREE.Mesh(shaftGeo, woodMat);
  s1.position.set(1.9, 0.55, 0.4);
  group.add(s1);
  const s2 = new THREE.Mesh(shaftGeo, woodMat);
  s2.position.set(1.9, 0.55, -0.4);
  group.add(s2);

  return group;
}

/* ── 9. Roman Umbrella Pine (Pinus Pinea) ─────────────────── */

export function buildUmbrellaPine(x, z, height = 18) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const trunkMat = getMaterial('trunk');
  const foliageMat = getMaterial('foliageDark');

  // Tall bare reddish-brown trunk with slight organic curve
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.4, height * 0.35, 0.2),
    new THREE.Vector3(-0.2, height * 0.7, -0.1),
    new THREE.Vector3(0, height * 0.9, 0),
  ]);
  const trunkGeo = new THREE.TubeGeometry(curve, 16, 0.6, 8, false);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.castShadow = true;
  group.add(trunk);

  // Broad horizontal parasol / umbrella canopy
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(7.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
    foliageMat
  );
  canopy.position.set(0, height * 0.95, 0);
  canopy.scale.set(1.2, 0.45, 1.2);
  canopy.castShadow = true;
  group.add(canopy);

  return group;
}

/* ── 10. Modern Commercial Airliner (İGA Airport) ─────────── */

export function buildModernAirliner(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const fuseMat = getMaterial('jetFuselage');
  const liveryMat = getMaterial('jetLivery');
  const steelMat = getMaterial('structuralSteel');

  // Fuselage (Length ~60m, Diameter ~6m)
  const fuseGeo = new THREE.CylinderGeometry(2.9, 2.9, 58, 24);
  fuseGeo.rotateX(Math.PI / 2);
  const fuse = new THREE.Mesh(fuseGeo, fuseMat);
  fuse.position.y = 5.2;
  fuse.castShadow = true;
  group.add(fuse);

  // Nose cone
  const noseGeo = new THREE.ConeGeometry(2.9, 9, 24);
  noseGeo.rotateX(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, fuseMat);
  nose.position.set(0, 5.2, 33.5);
  group.add(nose);

  // Tail cone
  const tailGeo = new THREE.ConeGeometry(2.9, 14, 24);
  tailGeo.rotateX(Math.PI / 2);
  const tail = new THREE.Mesh(tailGeo, fuseMat);
  tail.position.set(0, 5.2, -36);
  group.add(tail);

  // Swept Main Wings (Wingspan ~62m)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(31, -16);
  wingShape.lineTo(31, -21);
  wingShape.lineTo(0, -9);
  wingShape.closePath();

  const extrudeSettings = { depth: 0.8, bevelEnabled: false };
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, extrudeSettings);
  wingGeo.rotateX(Math.PI / 2);

  const rightWing = new THREE.Mesh(wingGeo, fuseMat);
  rightWing.position.set(2.4, 4.6, 6);
  rightWing.rotation.z = 0.06; // dihedral
  rightWing.castShadow = true;
  group.add(rightWing);

  const leftWing = rightWing.clone();
  leftWing.scale.x = -1;
  leftWing.position.set(-2.4, 4.6, 6);
  group.add(leftWing);

  // Vertical Tailfin (Turkish Red Livery)
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0, 11);
  finShape.lineTo(-4.5, 10);
  finShape.lineTo(-10.5, 0);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.45, bevelEnabled: false });
  const fin = new THREE.Mesh(finGeo, liveryMat);
  fin.position.set(-0.22, 6.5, -28);
  fin.castShadow = true;
  group.add(fin);

  // Twin Turbofan Engines under wings
  for (const side of [-1, 1]) {
    const engine = new THREE.Group();
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.5, 6.5, 18), fuseMat);
    nacelle.rotateX(Math.PI / 2);
    nacelle.castShadow = true;
    engine.add(nacelle);

    // Intake interior fan
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.5, 16), steelMat);
    fan.rotateX(Math.PI / 2);
    fan.position.z = 2.8;
    engine.add(fan);

    engine.position.set(side * 11.5, 3.2, 4.5);
    group.add(engine);
  }

  // Multi-wheel Landing Gear
  const gearMat = getMaterial('tarmac');
  // Nose gear
  const nLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.8, 8), steelMat);
  nLeg.position.set(0, 1.9, 24);
  group.add(nLeg);
  const nWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12), gearMat);
  nWheel.rotateZ(Math.PI / 2);
  nWheel.position.set(0, 0.55, 24);
  group.add(nWheel);
  // Main gear (left and right)
  for (const side of [-1, 1]) {
    const mLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 3.8, 8), steelMat);
    mLeg.position.set(side * 5.8, 1.9, -2);
    group.add(mLeg);
    for (const zOffset of [-0.6, 0.6]) {
      const mWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.45, 12), gearMat);
      mWheel.rotateZ(Math.PI / 2);
      mWheel.position.set(side * 5.8, 0.62, -2 + zOffset);
      group.add(mWheel);
    }
  }

  // Navigation & Strobe Lights (ICAO standard)
  const lightGeo = new THREE.SphereGeometry(0.32, 8, 8);

  // Port (Left) Wingtip: Red Navigation Light
  const navRedMat = new THREE.MeshStandardMaterial({ color: 0xff0022, emissive: 0xff0022, emissiveIntensity: 1.0, roughness: 0.2 });
  const leftNav = new THREE.Mesh(lightGeo, navRedMat);
  leftNav.name = 'nav-red-port';
  leftNav.position.set(-33.4, 6.4, -12);
  group.add(leftNav);

  // Starboard (Right) Wingtip: Green Navigation Light
  const navGreenMat = new THREE.MeshStandardMaterial({ color: 0x00e676, emissive: 0x00e676, emissiveIntensity: 1.0, roughness: 0.2 });
  const rightNav = new THREE.Mesh(lightGeo, navGreenMat);
  rightNav.name = 'nav-green-starboard';
  rightNav.position.set(33.4, 6.4, -12);
  group.add(rightNav);

  // Tailcone: White Navigation Light
  const navWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.2 });
  const tailNav = new THREE.Mesh(lightGeo, navWhiteMat);
  tailNav.name = 'nav-white-tail';
  tailNav.position.set(0, 5.5, -43);
  group.add(tailNav);

  // Fuselage Anti-Collision Red Beacons (Top and Belly)
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff1100, emissive: 0xff1100, emissiveIntensity: 0.2, roughness: 0.2 });
  const topBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), beaconMat);
  topBeacon.name = 'beacon-top';
  topBeacon.position.set(0, 8.2, 5);
  group.add(topBeacon);
  const btmBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), beaconMat);
  btmBeacon.name = 'beacon-belly';
  btmBeacon.position.set(0, 2.2, 5);
  group.add(btmBeacon);

  // Wingtip White Strobes
  const strobeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.1 });
  const leftStrobe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), strobeMat);
  leftStrobe.name = 'strobe-left-wing';
  leftStrobe.position.set(-33.6, 6.5, -12.3);
  group.add(leftStrobe);
  const rightStrobe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), strobeMat);
  rightStrobe.name = 'strobe-right-wing';
  rightStrobe.position.set(33.6, 6.5, -12.3);
  group.add(rightStrobe);

  group.userData.updateLights = function(time, isNight) {
    const strobePhase = time % 1.2;
    const strobeOn = (strobePhase < 0.08) || (strobePhase > 0.16 && strobePhase < 0.24);
    strobeMat.emissiveIntensity = strobeOn ? (isNight ? 3.5 : 2.0) : 0.05;

    const beaconOn = (time % 1.0 < 0.14);
    beaconMat.emissiveIntensity = beaconOn ? (isNight ? 2.8 : 1.5) : 0.1;

    const navIntensity = isNight ? 1.6 : 0.9;
    navRedMat.emissiveIntensity = navIntensity;
    navGreenMat.emissiveIntensity = navIntensity;
    navWhiteMat.emissiveIntensity = navIntensity;
  };

  return group;
}

/* ── 11. Baggage Towing Tug with Luggage Carts (İGA Airport) ── */

export function buildBaggageTug(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const yellowMat = getMaterial('serviceVehicle');
  const steelMat = getMaterial('structuralSteel');
  const tireMat = getMaterial('tarmac');

  // Tug chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 1.4), yellowMat);
  chassis.position.y = 0.65;
  chassis.castShadow = true;
  group.add(chassis);

  // Roll cage cab
  const cage = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 1.3), steelMat);
  cage.position.set(-0.3, 1.45, 0);
  group.add(cage);

  // Wheels
  for (const sx of [-0.75, 0.75]) {
    for (const sz of [-0.72, 0.72]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12), tireMat);
      wheel.rotateX(Math.PI / 2);
      wheel.position.set(sx, 0.32, sz);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  // Connected Luggage Trailers (2 carts)
  const cartColors = [0x2e6b9e, 0xc45c38, 0x4a7c59, 0xd2a842, 0x8b3a3a];
  for (let c = 1; c <= 2; c++) {
    const cartZ = -c * 2.8;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 1.2), steelMat);
    bed.position.set(0, 0.35, cartZ);
    bed.castShadow = true;
    group.add(bed);

    // Staggered suitcases
    for (let s = 0; s < 4; s++) {
      const col = cartColors[(c * 3 + s) % cartColors.length];
      const caseMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.4), caseMat);
      bag.position.set(
        (s % 2 === 0 ? -0.35 : 0.35) + (Math.random() - 0.5) * 0.1,
        0.62,
        cartZ + (s < 2 ? -0.25 : 0.25)
      );
      bag.castShadow = true;
      group.add(bag);
    }

    // Trailer wheels
    for (const sz of [-0.65, 0.65]) {
      const twheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.15, 10), tireMat);
      twheel.rotateX(Math.PI / 2);
      twheel.position.set(0, 0.22, cartZ + sz * 0.6);
      group.add(twheel);
    }
  }

  return group;
}

/* ── 12. Airport Fuel Bowser Truck (İGA Airport) ──────────── */

export function buildFuelTruck(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const yellowMat = getMaterial('serviceVehicle');
  const steelMat = getMaterial('structuralSteel');
  const tireMat = getMaterial('tarmac');
  const whiteMat = getMaterial('jetFuselage');

  // Cab
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.2), yellowMat);
  cab.position.set(3.2, 1.4, 0);
  cab.castShadow = true;
  group.add(cab);

  // Windshield
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 1.8), getMaterial('glassCurtain'));
  glass.position.set(4.52, 1.7, 0);
  group.add(glass);

  // Cylindrical Fuel Tank
  const tankGeo = new THREE.CylinderGeometry(1.2, 1.2, 5.8, 16);
  tankGeo.rotateZ(Math.PI / 2);
  const tank = new THREE.Mesh(tankGeo, whiteMat);
  tank.position.set(-1.2, 1.8, 0);
  tank.castShadow = true;
  group.add(tank);

  // Chassis bed
  const bed = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.4, 2.0), steelMat);
  bed.position.set(0.6, 0.55, 0);
  group.add(bed);

  // 6 Wheels (3 axles)
  for (const ax of [-2.8, -1.2, 3.2]) {
    for (const side of [-1.15, 1.15]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 14), tireMat);
      wheel.rotateX(Math.PI / 2);
      wheel.position.set(ax, 0.5, side);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }

  return group;
}

/* ── 13. Runway Approach Light Bar Array ───────────────────── */

export function buildRunwayApproachLights(x, z, rot = 0, color = 0x00e676) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const steelMat = getMaterial('structuralSteel');
  const emissiveMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.8,
    roughness: 0.2
  });

  // Crossbar mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.2, 8), steelMat);
  mast.position.y = 1.1;
  group.add(mast);

  const bar = new THREE.Mesh(new THREE.BoxGeometry(14, 0.15, 0.15), steelMat);
  bar.position.y = 2.2;
  group.add(bar);

  // 7 light heads across bar
  for (let i = -3; i <= 3; i++) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), emissiveMat);
    lamp.position.set(i * 2.1, 2.35, 0);
    group.add(lamp);
  }

  return group;
}

/* ── 14. Classical Sacrificial Altar ───────────────────────── */

export function buildSacrificialAltar(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const marbleMat = getMaterial('marble');
  const bronzeMat = getMaterial('bronze');

  // Stepped Plinth
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 2.4), marbleMat);
  p1.position.y = 0.15;
  p1.receiveShadow = true;
  group.add(p1);

  const p2 = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.25, 2.0), marbleMat);
  p2.position.y = 0.42;
  group.add(p2);

  // Altar Table with carved frieze molding
  const altar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 1.4), marbleMat);
  altar.position.y = 1.1;
  altar.castShadow = true;
  group.add(altar);

  // 4 Corner Volute Horns
  for (const sx of [-1.08, 1.08]) {
    for (const sz of [-0.58, 0.58]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 8), marbleMat);
      horn.position.set(sx, 1.8, sz);
      group.add(horn);
    }
  }

  // Top Sacrificial Bronze Basin with Charred Coals
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.12, 16), bronzeMat);
  basin.position.y = 1.7;
  group.add(basin);

  const fireMat = new THREE.MeshStandardMaterial({
    color: 0xff4500,
    emissive: 0xff3300,
    emissiveIntensity: 1.2,
    roughness: 0.9
  });
  const coal = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), fireMat);
  coal.scale.set(1.4, 0.3, 1.1);
  coal.position.y = 1.78;
  group.add(coal);

  return group;
}

/* ── 15. Classical Mediterranean Merchant Vessel ───────────── */

export function buildMerchantVessel(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const woodMat = getMaterial('woodPlanks');
  const mastMat = getMaterial('wood');
  const sailMat = getMaterial('sailFabric');

  // Rounded cargo hull
  const hullGeo = new THREE.CylinderGeometry(2.8, 1.6, 14, 16);
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.scale(1.2, 0.7, 1.0);
  const hull = new THREE.Mesh(hullGeo, woodMat);
  hull.position.y = 0.8;
  hull.castShadow = true;
  group.add(hull);

  // Deck planking
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.2, 13.5), woodMat);
  deck.position.y = 1.35;
  group.add(deck);

  // Raised stern arch (cheniskos swan curve)
  const stern = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.2, 8, 16, Math.PI * 0.6), woodMat);
  stern.position.set(0, 2.4, -6.5);
  stern.rotation.y = Math.PI / 2;
  group.add(stern);

  // Main Mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 11, 12), mastMat);
  mast.position.set(0, 6.8, 0.5);
  mast.castShadow = true;
  group.add(mast);

  // Cross Yardarm
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7.5, 8), mastMat);
  yard.rotateZ(Math.PI / 2);
  yard.position.set(0, 10.5, 0.6);
  group.add(yard);

  // Square Linen Sail (furled / draped)
  const sailGeo = new THREE.PlaneGeometry(6.8, 6.2, 8, 8);
  const sail = new THREE.Mesh(sailGeo, sailMat);
  sail.position.set(0, 7.2, 0.9);
  sail.castShadow = true;
  group.add(sail);

  // Cargo in open hold: terracotta amphorae
  for (let i = 0; i < 8; i++) {
    const a = buildAmphora(0.9);
    a.position.set((i % 2 === 0 ? -0.7 : 0.7), 1.4, -2.5 + Math.floor(i / 2) * 1.1);
    group.add(a);
  }

  return group;
}

/* ── 16. Carved Stone Sundial Monument ─────────────────────── */

export function buildSundialMonument(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const marbleMat = getMaterial('marble');
  const bronzeMat = getMaterial('bronze');

  // Base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 16), marbleMat);
  base.position.y = 0.15;
  group.add(base);

  // Fluted column shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.1, 16), marbleMat);
  shaft.position.y = 0.85;
  shaft.castShadow = true;
  group.add(shaft);

  // Hemispherical sundial bowl (scaphe)
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), marbleMat);
  bowl.position.y = 1.4;
  bowl.rotation.x = Math.PI; // Concave facing skyward
  group.add(bowl);

  // Bronze gnomon indicator needle
  const gnomon = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.25, 6), bronzeMat);
  gnomon.position.set(0, 1.4, 0);
  gnomon.rotation.x = 0.45;
  group.add(gnomon);

  return group;
}

/* ── 17. Overgrown Street Paving Weeds ──────────────────────── */

export function buildPavingWeeds(x, z, rot = 0, scale = 1.0) {
  const group = new THREE.Group();
  group.position.set(x, 0.02, z);
  group.rotation.y = rot;
  group.name = 'paving-weeds';

  const weedMat = getMaterial('overgrownGrass');
  const bladeGeo = new THREE.PlaneGeometry(0.55 * scale, 0.42 * scale);
  bladeGeo.translate(0, (0.42 * scale) / 2, 0);

  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeo, weedMat);
    blade.rotation.y = (i * Math.PI) / 3;
    blade.rotation.x = ((i * 0.13) % 0.2) - 0.1;
    group.add(blade);
  }
  return group;
}

/* ── 18. Fallen Column Drums & Shattered Stelae ────────────── */

export function buildFallenColumnDrums(x, z, rot = 0, count = 3) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  group.name = 'fallen-column-drums';

  const stoneMat = getMaterial('marble');
  const drumR = 0.65;
  const drumH = 1.25;

  for (let i = 0; i < count; i++) {
    const drumGeo = new THREE.CylinderGeometry(drumR, drumR, drumH, 12);
    drumGeo.rotateZ(Math.PI / 2);
    const drum = new THREE.Mesh(drumGeo, stoneMat);
    drum.position.set(i * 1.35, drumR * 0.85, (i % 2 === 0 ? 0.2 : -0.2));
    drum.rotation.y = (i * 0.15);
    drum.castShadow = true;
    drum.receiveShadow = true;
    group.add(drum);
  }

  const chunkMat = getMaterial('rubbleStone');
  for (let j = 0; j < 5; j++) {
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.35 + (j % 3) * 0.15, 0.25, 0.4),
      chunkMat
    );
    chunk.position.set((j - 2) * 0.9, 0.12, (j % 2 === 0 ? 1.0 : -0.9));
    chunk.rotation.set(0.2 * j, 0.5 * j, 0.1 * j);
    group.add(chunk);
  }

  return group;
}

export function buildShatteredStele(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  group.name = 'shattered-stele';

  const stoneMat = getMaterial('travertine');
  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.2, 1.1), stoneMat);
  lower.position.set(0, 0.1, 0);
  lower.castShadow = true;
  group.add(lower);

  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.2, 0.9), stoneMat);
  upper.position.set(0.4, 0.12, 1.15);
  upper.rotation.y = 0.35;
  upper.rotation.z = 0.08;
  upper.castShadow = true;
  group.add(upper);

  return group;
}

/* ── 19. Travertine & Brick Debris / Rubble Piles ───────────── */

export function buildDebrisPile(x, z, radius = 3.0, height = 1.2) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.name = 'debris-pile';

  const moundGeo = new THREE.ConeGeometry(radius, height, 9);
  const mound = new THREE.Mesh(moundGeo, getMaterial('tufa'));
  mound.position.y = height / 2;
  mound.scale.set(1.0, 1.0, 0.85);
  mound.receiveShadow = true;
  group.add(mound);

  const brickMat = getMaterial('romanBrick');
  const travMat = getMaterial('travertine');
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + 0.3;
    const dist = (radius * 0.35) + (i % 3) * (radius * 0.22);
    const px = Math.cos(angle) * dist;
    const pz = Math.sin(angle) * dist;
    const py = Math.max(0.15, height * (1 - dist / radius) * 0.7);

    const isBrick = i % 2 === 0;
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.55 + (i % 2) * 0.25, 0.3, 0.45),
      isBrick ? brickMat : travMat
    );
    chunk.position.set(px, py, pz);
    chunk.rotation.set((i * 0.4) % 1, (i * 0.7) % 2, (i * 0.3) % 1);
    chunk.castShadow = true;
    group.add(chunk);
  }

  return group;
}

/* ── 20. Period Riverbank Bulrushes & Reeds ─────────────────── */

export function buildRiverReeds(x, z, count = 12, spread = 3.0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.name = 'river-reeds';

  const stemMat = getMaterial('overgrownGrass');
  const catMat = new THREE.MeshStandardMaterial({ color: 0x483222, roughness: 0.9, metalness: 0.0 });

  const stemGeo = new THREE.CylinderGeometry(0.025, 0.035, 2.2, 5);
  stemGeo.translate(0, 1.1, 0);

  const cattailGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.42, 6);
  cattailGeo.translate(0, 2.1, 0);

  for (let i = 0; i < count; i++) {
    const reed = new THREE.Group();
    const rx = ((i * 1.7) % spread) - spread / 2;
    const rz = (((i + 2) * 2.3) % spread) - spread / 2;

    const stem = new THREE.Mesh(stemGeo, stemMat);
    reed.add(stem);

    if (i % 2 === 0) {
      const cattail = new THREE.Mesh(cattailGeo, catMat);
      reed.add(cattail);
    }

    reed.position.set(rx, 0, rz);
    reed.rotation.z = (Math.sin(i * 1.4) * 0.12);
    reed.rotation.x = (Math.cos(i * 1.1) * 0.12);
    group.add(reed);
  }

  return group;
}

/* ── 21. Ancient Wooden River Cargo Skiff ───────────────────── */

export function buildCargoSkiff(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0.1, z);
  group.rotation.y = rot;
  group.name = 'cargo-skiff';

  const woodMat = getMaterial('woodPlanks');
  const darkWoodMat = getMaterial('wood');

  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 5.8), woodMat);
  floor.receiveShadow = true;
  group.add(floor);

  for (const side of [-1, 1]) {
    const gunwale = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 5.8), woodMat);
    gunwale.position.set(side * 1.05, 0.36, 0);
    gunwale.castShadow = true;
    group.add(gunwale);
  }

  for (const end of [-1, 1]) {
    const transom = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.72, 0.16), woodMat);
    transom.position.set(0, 0.36, end * 2.9);
    transom.castShadow = true;
    group.add(transom);
  }

  for (const pos of [-1.5, 0, 1.5]) {
    const thwart = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.32), darkWoodMat);
    thwart.position.set(0, 0.52, pos);
    group.add(thwart);
  }

  const amp1 = buildAmphora(0.85);
  amp1.name = 'skiff-amphora';
  amp1.position.set(-0.4, 0.2, -0.6);
  amp1.rotation.z = 0.2;
  group.add(amp1);

  const amp2 = buildAmphora(0.85);
  amp2.name = 'skiff-amphora';
  amp2.position.set(0.4, 0.2, -0.5);
  amp2.rotation.z = -0.15;
  group.add(amp2);

  const amp3 = buildAmphora(0.8);
  amp3.name = 'skiff-amphora';
  amp3.position.set(0, 0.2, 0.6);
  group.add(amp3);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.8, 8), darkWoodMat);
  post.name = 'skiff-mooring-post';
  post.position.set(1.6, 0.9, 1.8);
  post.castShadow = true;
  group.add(post);

  return group;
}

/* ── 22. Ancient Rustic Wooden Footbridge ────────────────────── */

export function buildWoodenFootbridge(x, z, rot = 0, span = 14, width = 2.4) {
  const group = new THREE.Group();
  group.position.set(x, 0.8, z);
  group.rotation.y = rot;
  group.name = 'wooden-footbridge';

  const woodMat = getMaterial('woodPlanks');
  const logMat = getMaterial('wood');

  for (const side of [-1, 1]) {
    const beamGeo = new THREE.CylinderGeometry(0.2, 0.22, span, 8);
    beamGeo.rotateX(Math.PI / 2);
    const beam = new THREE.Mesh(beamGeo, logMat);
    beam.name = 'bridge-stringer';
    beam.position.set(side * (width / 2 - 0.25), -0.2, 0);
    beam.castShadow = true;
    group.add(beam);
  }

  const plankSpacing = 0.38;
  const numPlanks = Math.floor(span / plankSpacing);
  const plankGeo = new THREE.BoxGeometry(width, 0.12, 0.32);
  for (let i = 0; i < numPlanks; i++) {
    const pz = -span / 2 + (i + 0.5) * plankSpacing;
    const plank = new THREE.Mesh(plankGeo, woodMat);
    plank.name = 'bridge-plank';
    plank.position.set(0, 0, pz);
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }

  const postCount = Math.max(3, Math.floor(span / 3.0));
  for (const side of [-1, 1]) {
    for (let p = 0; p <= postCount; p++) {
      const pz = -span / 2 + p * (span / postCount);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.2, 6), logMat);
      post.position.set(side * (width / 2 - 0.1), 0.6, pz);
      post.castShadow = true;
      group.add(post);
    }

    const railGeo = new THREE.CylinderGeometry(0.07, 0.07, span, 8);
    railGeo.rotateX(Math.PI / 2);
    const rail = new THREE.Mesh(railGeo, logMat);
    rail.position.set(side * (width / 2 - 0.1), 1.15, 0);
    group.add(rail);
  }

  return group;
}

/* ── 23. Aerial Bird Flock ─────────────────────────────────── */

export function buildBirdFlock(x, y, z, count = 8, radius = 24) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.name = 'bird-flock';

  const birdMat = new THREE.MeshStandardMaterial({
    color: 0x3a3f47,
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide
  });

  const birdGeo = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    0, 0, 0.5,     -1.1, 0.25, 0.0,   0, 0, -0.4,
    0, 0, 0.5,      0, 0, -0.4,       1.1, 0.25, 0.0
  ]);
  birdGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  birdGeo.computeVertexNormals();

  const birds = [];
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(birdGeo, birdMat);
    const orbitR = radius + (i % 3) * 5.0;
    const angle = (i / count) * Math.PI * 2;
    const alt = (i % 4) * 1.8;
    const speed = 0.45 + (i % 3) * 0.1;

    mesh.position.set(Math.cos(angle) * orbitR, alt, Math.sin(angle) * orbitR);
    mesh.rotation.y = -angle + Math.PI / 2;
    mesh.userData.orbitAngle = angle;
    group.add(mesh);

    birds.push({ mesh, orbitR, angle, alt, speed });
  }

  group.userData.update = function(dt) {
    for (const b of birds) {
      b.angle += b.speed * dt;
      b.mesh.userData.orbitAngle = b.angle;
      b.mesh.position.x = Math.cos(b.angle) * b.orbitR;
      b.mesh.position.z = Math.sin(b.angle) * b.orbitR;
      b.mesh.rotation.y = -b.angle + Math.PI / 2;
      b.mesh.rotation.z = Math.sin(b.angle * 8) * 0.15;
    }
  };

  return group;
}

/* ── 24. Roman Sarcophagus (Aizanoi Necropolis) ────────── */

export function buildRomanSarcophagus(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const marbleMat = getMaterial('marble');
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 1.2), marbleMat);
  base.position.y = 0.175;
  base.receiveShadow = true;
  group.add(base);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.95, 0.95), marbleMat);
  chest.position.y = 0.35 + 0.475;
  chest.castShadow = true;
  group.add(chest);

  const garlandFrieze = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.22, 0.99), marbleMat);
  garlandFrieze.position.y = 0.35 + 0.65;
  group.add(garlandFrieze);

  const lidBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 1.05), marbleMat);
  lidBase.position.y = 0.35 + 0.95 + 0.07;
  group.add(lidBase);

  const gabledRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.18, 3, 1, false, Math.PI / 2, Math.PI), marbleMat);
  gabledRoof.position.set(0, 0.35 + 0.95 + 0.14 + 0.18, 0);
  gabledRoof.rotation.z = Math.PI / 2;
  gabledRoof.castShadow = true;
  group.add(gabledRoof);

  for (const sx of [-1.02, 1.02]) {
    for (const sz of [-0.48, 0.48]) {
      const acroterion = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 4), marbleMat);
      acroterion.position.set(sx, 0.35 + 0.95 + 0.22, sz);
      acroterion.rotation.y = Math.PI / 4;
      group.add(acroterion);
    }
  }

  return group;
}

/* ── 25. Penkalas Water Mill (Aizanoi River Channel) ─────── */

export function buildPenkalasWaterMill(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const stoneMat = getMaterial('limestone');
  const roofMat = getMaterial('roofTile');
  const woodMat = getMaterial('wood');
  const ironMat = getMaterial('structuralSteel');

  const house = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.8, 4.4), stoneMat);
  house.position.set(0, 1.9, 0);
  house.castShadow = true;
  house.receiveShadow = true;
  group.add(house);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.8, 4), roofMat);
  roof.position.set(0, 3.8 + 0.9, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.1, 1.0, 0.9);
  roof.castShadow = true;
  group.add(roof);

  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(2.8, 1.8, 0);

  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 8), ironMat);
  axle.rotation.z = Math.PI / 2;
  wheelGroup.add(axle);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.1, 8, 20), woodMat);
  rim.rotation.y = Math.PI / 2;
  wheelGroup.add(rim);

  const innerRim = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 8, 20), woodMat);
  innerRim.rotation.y = Math.PI / 2;
  wheelGroup.add(innerRim);

  for (let i = 0; i < 8; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.7, 0.08), woodMat);
    spoke.rotation.x = (i * Math.PI) / 8;
    wheelGroup.add(spoke);
  }

  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI * 2) / 16;
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.42), woodMat);
    paddle.position.set(0, Math.sin(angle) * 1.9, Math.cos(angle) * 1.9);
    paddle.rotation.x = angle;
    wheelGroup.add(paddle);
  }

  wheelGroup.userData.update = function(dt) {
    wheelGroup.rotation.x += dt * 1.2;
  };
  group.add(wheelGroup);

  const flume = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 5.2), getMaterial('woodPlanks'));
  flume.position.set(2.8, 3.5, -1.2);
  flume.rotation.x = 0.08;
  group.add(flume);

  return group;
}

/* ── 26. Roman Treadwheel Quay Crane (Aizanoi Harbor) ────── */

export function buildRiverQuayCrane(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const woodMat = getMaterial('wood');
  const ropeMat = getMaterial('plasterAged');

  const baseBeam1 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.25, 0.25), woodMat);
  baseBeam1.position.y = 0.125;
  group.add(baseBeam1);
  const baseBeam2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 3.2), woodMat);
  baseBeam2.position.y = 0.125;
  group.add(baseBeam2);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 6.2, 8), woodMat);
  mast.position.set(0, 3.1, 0);
  mast.castShadow = true;
  group.add(mast);

  const jib = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 5.8, 8), woodMat);
  jib.position.set(1.8, 4.2, 0);
  jib.rotation.z = -Math.PI / 4;
  jib.castShadow = true;
  group.add(jib);

  const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.8, 6), ropeMat);
  stay.position.set(-1.2, 3.8, 0);
  stay.rotation.z = Math.PI / 5;
  group.add(stay);

  const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 8, 18), woodMat);
  wheel.position.set(0, 2.0, 0.85);
  wheel.rotation.y = Math.PI / 2;
  group.add(wheel);

  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.5, 6), ropeMat);
  rope.position.set(3.8, 4.5, 0);
  group.add(rope);

  const cargoStone = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), getMaterial('marble'));
  cargoStone.position.set(3.8, 2.5, 0);
  cargoStone.castShadow = true;
  group.add(cargoStone);

  return group;
}

/* ── 27. Ruined Triumphal Archway (Late Rome AD 410-476) ─── */

export function buildRuinedTriumphalArch(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const stoneMat = getMaterial('travertine');
  const brickMat = getMaterial('romanBrickWeathered');

  const pierLeft = new THREE.Mesh(new THREE.BoxGeometry(2.8, 7.8, 3.2), stoneMat);
  pierLeft.position.set(-3.2, 3.9, 0);
  pierLeft.castShadow = true;
  group.add(pierLeft);

  const pierRight = new THREE.Mesh(new THREE.BoxGeometry(2.8, 5.2, 3.2), brickMat);
  pierRight.position.set(3.2, 2.6, 0);
  pierRight.castShadow = true;
  group.add(pierRight);

  const archSegment = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 3.0), stoneMat);
  archSegment.position.set(-1.8, 7.6, 0);
  archSegment.rotation.z = 0.22;
  group.add(archSegment);

  for (let i = 0; i < 5; i++) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.8), stoneMat);
    block.position.set(1.5 + (i % 3) * 0.9, 0.3, -1.0 + (i % 2) * 1.2);
    block.rotation.y = i * 0.4;
    block.rotation.z = (i % 2) * 0.15;
    block.castShadow = true;
    group.add(block);
  }

  return group;
}

/* ── 28. Late Roman Street Barricade (Rome Defense) ──────── */

export function buildLateRomanBarricade(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const charredMat = getMaterial('charredWood');
  const woodMat = getMaterial('wood');
  const stoneMat = getMaterial('rubbleStone');

  const wagonBed = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 1.4), woodMat);
  wagonBed.position.set(0, 0.8, 0);
  wagonBed.rotation.z = 0.55;
  wagonBed.castShadow = true;
  group.add(wagonBed);

  for (let i = 0; i < 4; i++) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.4, 6), charredMat);
    beam.position.set(-0.8 + i * 0.55, 0.7, (i % 2) * 0.4 - 0.2);
    beam.rotation.z = -0.4 + (i % 3) * 0.3;
    beam.rotation.y = (i * 0.5);
    beam.castShadow = true;
    group.add(beam);
  }

  for (let i = 0; i < 6; i++) {
    const stake = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.6, 5), woodMat);
    stake.position.set(-1.2 + i * 0.5, 0.45, 0.9);
    stake.rotation.x = Math.PI / 3;
    group.add(stake);
  }

  const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65), stoneMat);
  rubble.position.set(-1.1, 0.45, -0.2);
  group.add(rubble);

  return group;
}

/* ── 29. Forum Night Watch Fire Basket (Rome) ────────────── */

export function buildForumWatchBrazier(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const stoneMat = getMaterial('travertine');
  const ironMat = getMaterial('structuralSteel');

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.6, 1.3), stoneMat);
  base.position.y = 0.8;
  base.castShadow = true;
  group.add(base);

  const basketRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 6, 16), ironMat);
  basketRing.position.y = 1.7;
  basketRing.rotation.x = Math.PI / 2;
  group.add(basketRing);

  for (let i = 0; i < 10; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.75, 4), ironMat);
    const angle = (i * Math.PI * 2) / 10;
    bar.position.set(Math.cos(angle) * 0.55, 1.95, Math.sin(angle) * 0.55);
    group.add(bar);
  }

  const coals = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5), new THREE.MeshStandardMaterial({
    color: 0xff3300,
    emissive: 0xff4400,
    emissiveIntensity: 1.2,
    roughness: 0.9,
  }));
  coals.position.y = 1.95;
  group.add(coals);

  const light = new THREE.PointLight(0xff6622, 2.2, 18);
  light.position.y = 2.4;
  group.add(light);

  return group;
}

/* ── 30. Classical Herm Boundary Landmark (Athens Agora) ─── */

export function buildClassicalHerm(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const marbleMat = getMaterial('marble');

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.8), marbleMat);
  plinth.position.y = 0.125;
  group.add(plinth);

  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.44, 2.1, 0.44), marbleMat);
  shaft.position.y = 0.25 + 1.05;
  shaft.castShadow = true;
  group.add(shaft);

  const shoulderBoss = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.18), marbleMat);
  shoulderBoss.position.y = 0.25 + 1.85;
  group.add(shoulderBoss);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.42, 8), marbleMat);
  head.position.y = 0.25 + 2.31;
  head.castShadow = true;
  group.add(head);

  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 6), marbleMat);
  beard.position.set(0, 0.25 + 2.18, 0.14);
  beard.rotation.x = Math.PI / 6;
  group.add(beard);

  return group;
}

/* ── 31. Street of Tripods Monument Pillar (Athens) ───────── */

export function buildVotiveTripodPillar(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const marbleMat = getMaterial('marble');
  const bronzeMat = getMaterial('bronze');
  const goldMat = getMaterial('goldLeaf');

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), marbleMat);
  base.position.y = 0.25;
  group.add(base);

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 4.4, 6), marbleMat);
  pillar.position.y = 0.5 + 2.2;
  pillar.castShadow = true;
  group.add(pillar);

  const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.5, 0.4, 6), marbleMat);
  capital.position.y = 0.5 + 4.4 + 0.2;
  group.add(capital);

  const tripodY = 0.5 + 4.4 + 0.4;
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 1.1, 6), bronzeMat);
    leg.position.set(Math.cos(angle) * 0.35, tripodY + 0.55, Math.sin(angle) * 0.35);
    leg.rotation.z = Math.cos(angle) * 0.18;
    leg.rotation.x = -Math.sin(angle) * 0.18;
    group.add(leg);
  }

  const cauldron = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65),
    goldMat
  );
  cauldron.position.y = tripodY + 1.05;
  cauldron.rotation.x = Math.PI;
  group.add(cauldron);

  return group;
}

/* ── 32. Attic Hydria Fountain House (Athens Public Water) ── */

export function buildAtticHydriaFountain(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const stoneMat = getMaterial('poros');
  const waterMat = getMaterial('waterSurface');
  const bronzeMat = getMaterial('bronze');
  const terraMat = getMaterial('terracotta');

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 0.5), stoneMat);
  backWall.position.set(0, 1.2, -0.6);
  backWall.castShadow = true;
  group.add(backWall);

  const basin = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.8, 1.4), stoneMat);
  basin.position.set(0, 0.4, 0.35);
  basin.receiveShadow = true;
  group.add(basin);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.1), waterMat);
  water.position.set(0, 0.76, 0.35);
  water.rotation.x = -Math.PI / 2;
  group.add(water);

  for (const sx of [-0.9, 0.9]) {
    const spout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 8), bronzeMat);
    spout.position.set(sx, 1.25, -0.32);
    spout.rotation.x = Math.PI / 2;
    group.add(spout);
  }

  for (const sx of [-1.4, 1.4]) {
    const hydria = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.48, 8), terraMat);
    hydria.position.set(sx, 0.8 + 0.24, 0.35);
    group.add(hydria);
  }

  return group;
}

/* ── 33. Airport GSE Baggage Train (İGA Airport) ──────────── */

export function buildBaggageCartTrain(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const vehMat = getMaterial('serviceVehicle');
  const steelMat = getMaterial('structuralSteel');
  const aluMat = getMaterial('aluminumAnodized');

  const tug = new THREE.Group();
  const tugBody = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 2.8), vehMat);
  tugBody.position.y = 0.85;
  tugBody.castShadow = true;
  tug.add(tugBody);

  const tugCab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.85, 1.2), vehMat);
  tugCab.position.set(0, 1.7, -0.3);
  tug.add(tugCab);

  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.15, 8), new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0xff8800,
    emissiveIntensity: 1.0,
  }));
  beacon.position.set(0, 2.2, -0.3);
  tug.add(beacon);

  for (const [wx, wz] of [[-0.85, -0.8], [0.85, -0.8], [-0.85, 0.8], [0.85, 0.8]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12), steelMat);
    wheel.position.set(wx, 0.35, wz);
    wheel.rotation.z = Math.PI / 2;
    tug.add(wheel);
  }
  group.add(tug);

  for (let c = 0; c < 3; c++) {
    const cart = new THREE.Group();
    const cartZ = 2.4 + (c + 1) * 3.2;
    cart.position.set(0, 0, cartZ);

    const hitch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), steelMat);
    hitch.position.set(0, 0.35, -1.6);
    hitch.rotation.x = Math.PI / 2;
    cart.add(hitch);

    const cartBed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 2.4), steelMat);
    cartBed.position.y = 0.45;
    cart.add(cartBed);

    const container = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 2.2), aluMat);
    container.position.y = 1.15;
    container.castShadow = true;
    cart.add(container);

    for (const [wx, wz] of [[-0.8, -0.7], [0.8, -0.7], [-0.8, 0.7], [0.8, 0.7]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.15, 10), steelMat);
      wheel.position.set(wx, 0.24, wz);
      wheel.rotation.z = Math.PI / 2;
      cart.add(wheel);
    }
    group.add(cart);
  }

  return group;
}

/* ── 34. Passenger Boarding Stairs Vehicle (İGA Airport) ─── */

export function buildBoardingStairsTruck(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const vehMat = getMaterial('serviceVehicle');
  const aluMat = getMaterial('aluminumAnodized');
  const steelMat = getMaterial('structuralSteel');

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 7.2), vehMat);
  chassis.position.y = 0.65;
  chassis.castShadow = true;
  group.add(chassis);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.8), vehMat);
  cab.position.set(0, 1.7, -2.4);
  cab.castShadow = true;
  group.add(cab);

  const stairsAngle = 0.58;
  const numSteps = 14;
  for (let i = 0; i < numSteps; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.38), aluMat);
    const sy = 0.8 + i * 0.28;
    const sz = -1.2 + i * 0.42;
    step.position.set(0, sy, sz);
    group.add(step);
  }

  for (const sx of [-0.85, 0.85]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 6.2, 6), steelMat);
    rail.position.set(sx, 2.9, 1.5);
    rail.rotation.x = -stairsAngle;
    group.add(rail);
  }

  const topPlatform = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 1.6), aluMat);
  topPlatform.position.set(0, 0.8 + numSteps * 0.28, -1.2 + numSteps * 0.42 + 0.6);
  group.add(topPlatform);

  return group;
}

/* ── 35. Illuminated Airport Windsock (İGA Runway) ────────── */

export function buildAirportWindsock(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const steelMat = getMaterial('structuralSteel');
  const redMat = getMaterial('jetLivery');
  const whiteMat = getMaterial('runwayMarking');

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6.8, 8), steelMat);
  mast.position.y = 3.4;
  mast.castShadow = true;
  group.add(mast);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.9), steelMat);
  arm.position.set(0, 6.6, 0.45);
  group.add(arm);

  const sockRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 16), steelMat);
  sockRing.position.set(0, 6.6, 0.9);
  group.add(sockRing);

  for (let s = 0; s < 5; s++) {
    const r1 = 0.42 - s * 0.055;
    const r2 = 0.42 - (s + 1) * 0.055;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, 0.5, 12, 1, true), s % 2 === 0 ? redMat : whiteMat);
    band.position.set(0, 6.6 - (s * 0.04), 0.9 + 0.25 + s * 0.5);
    band.rotation.x = Math.PI / 2;
    group.add(band);
  }

  const light = new THREE.PointLight(0xffeedd, 1.2, 14);
  light.position.set(0, 7.0, 0.9);
  group.add(light);

  return group;
}

/* ── 36. Terminal Gate Guidance Sign (İGA VDGS) ───────────── */

export function buildGateMarshallerSign(x, z, rot = 0, gateText = 'B7') {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;

  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x11161d,
    roughness: 0.6,
    metalness: 0.8,
  });
  const textMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0xff8800,
    emissiveIntensity: 0.9,
    roughness: 0.4,
  });

  const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 0.18), panelMat);
  board.position.y = 8.2;
  board.castShadow = true;
  group.add(board);

  const display = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.1), textMat);
  display.position.set(0, 8.2, 0.1);
  group.add(display);

  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.2), getMaterial('structuralSteel'));
  bracket.position.set(0, 8.2, -0.6);
  group.add(bracket);

  return group;
}
