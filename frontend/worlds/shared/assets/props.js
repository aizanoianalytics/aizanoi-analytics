/**
 * props.js — Parametric Urban Life, Street Furniture, & Architectural Dressing Props
 * Shared Asset Engine · Aizanoi Analytics unified worlds runtime
 *
 * Implements high-detail reusable 3D assets to populate ancient streets,
 * forums, and sanctuaries.
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

// Compact-world hero dressing helpers. These remain procedural so the shared
// props module owns the authored landmarks used by all world entrypoints.
function _placedGroup(x, z, rot = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  return group;
}

function _box(group, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function buildAizanoiMacellumFoodCounter(x, z, rot = 0) {
  const group = _placedGroup(x, z, rot);
  _box(group, [3.2, 0.9, 1.0], [0, 0.45, 0], getMaterial('limestone'));
  _box(group, [3.5, 0.18, 1.2], [0, 1.0, 0], getMaterial('marble'));
  return group;
}

export function buildTempleOfZeusBronzeTripod(x, z, rot = 0) {
  const group = _placedGroup(x, z, rot);
  const bronze = getMaterial('bronze');
  for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 8), bronze);
    leg.position.set(Math.cos(angle) * 0.35, 0.6, Math.sin(angle) * 0.35);
    leg.rotation.z = Math.cos(angle) * 0.25;
    leg.rotation.x = Math.sin(angle) * 0.25;
    group.add(leg);
  }
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.14, 16), bronze);
  bowl.position.y = 1.22;
  group.add(bowl);
  return group;
}

export function buildCatacombMemorialCross(x, z, rot = 0) {
  const group = _placedGroup(x, z, rot);
  const stone = getMaterial('limestone');
  _box(group, [0.28, 2.5, 0.28], [0, 1.25, 0], stone);
  _box(group, [1.1, 0.28, 0.28], [0, 1.8, 0], stone);
  return group;
}
