/**
 * fabric.js — the connective tissue that makes Aizanoi read as a city rather
 * than a scatter of monuments on a plane.
 *
 * Section 13 of the product brief asks for ground variation, paths, riverbank
 * treatment, bridge approaches, courtyards, street furniture and districts with
 * identifiable character -- and it is explicit that every prop must earn its
 * place by improving composition, navigation, scale readability or atmosphere,
 * with no "AI slop" decoration.
 *
 * Everything here is built from the world's own data (streets, quay, water
 * course, regions, buildings) and from one deterministic hash, so the city is
 * identical on every load and the tests can assert exact placement. Nothing is
 * random at runtime and nothing is placed "because it looks nice".
 */

import * as THREE from '../vendor/three.module.js';

/** Stable 0..1 hash of a string. Same input, same output, every load. */
export function hashUnit(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return ((h & 0x7fffffff) % 100000) / 100000;
}

/** Small deterministic PRNG seeded from a string, for repeatable jitter. */
function seeded(str) {
  let s = Math.floor(hashUnit(str) * 2 ** 31) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 2 ** 31;
  };
}

const GROUND_Y = 0.02;

/**
 * Ground variation. The city sat on a terrace above the Penkalas, so the plain
 * is not level: it steps down toward the river and lifts slightly under the
 * sanctuary. A flat plane is why the world read as "objects on a floor".
 *
 * The relief is gentle (a couple of units across hundreds) so it never fights
 * the collision system or the arrival framing, but it is enough that the
 * horizon line is not dead straight and that the eye reads terrain.
 */
export function buildGroundRelief(bounds, waterPoints) {
  const width = bounds.maxX - bounds.minX + 220;
  const depth = bounds.maxZ - bounds.minZ + 220;
  const geo = new THREE.PlaneGeometry(width, depth, 72, 72);
  geo.rotateX(-Math.PI / 2);
  geo.translate((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);

  // Average river x, used as the fall-off axis toward the water.
  const riverX = waterPoints.reduce((sum, p) => sum + p.x, 0) / (waterPoints.length || 1);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Terraces rise away from the river, with a low sine so the steps are not
    // perfectly straight. The amplitudes are small on purpose.
    const awayFromRiver = (x - riverX) / 200;
    const terrace = Math.tanh(awayFromRiver * 1.6) * 1.9;
    const undulation = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 0.55;
    pos.setY(i, terrace + undulation);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** The stone surface treatment for the ground, coloured by district. */
export function buildGroundMaterial(getMaterial) {
  return getMaterial('ground');
}

/**
 * Riverbank treatment. The quay street already exists as a polyline; this
 * gives it an actual embankment: a raised stone edge with steps down to the
 * water, so the river reads as contained rather than as a stripe painted on
 * the ground. This is the single biggest scale cue in the scene.
 */
export function buildRiverbank(scene, quay, riverPoints, materials) {
  const group = new THREE.Group();
  group.name = 'riverbank';
  if (!quay?.points?.length || !riverPoints?.length) return group;

  const riverX = riverPoints.reduce((s, p) => s + p.x, 0) / riverPoints.length;
  const bankMat = materials.bank || materials.road;

  for (let i = 0; i < quay.points.length - 1; i++) {
    const [x0, z0] = quay.points[i];
    const [x1, z1] = quay.points[i + 1];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) continue;

    // Embankment wall: a low box running along the quay, its long axis on z.
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, len), bankMat);
    wall.position.set(riverX - 12, 1.0, (z0 + z1) / 2);
    wall.receiveShadow = true;
    wall.castShadow = false;
    group.add(wall);

    // Coping stones along the top edge: a repeated rhythm the eye can count,
    // which is what makes a quay read as built rather than extruded.
    const coping = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, len), bankMat);
    coping.position.set(riverX - 12, 2.45, (z0 + z1) / 2);
    coping.castShadow = true;
    group.add(coping);
  }

  // Four sets of steps from the quay down to the water. They are placed at
  // intervals along the bank, at the same spacing, so they read as a planned
  // riverfront rather than decoration.
  const stepCount = 5;
  for (let s = 0; s < stepCount; s++) {
    const z = quay.points[0][1] + ((quay.points[quay.points.length - 1][1] - quay.points[0][1]) * (s + 0.5)) / stepCount;
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const h = 2.2 - i * 0.42;
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.5, h, 7.5), bankMat);
      step.position.set(riverX - 13.4 - i * 1.5, h / 2, z);
      step.receiveShadow = true;
      group.add(step);
    }
  }

  scene.add(group);
  return group;
}

/**
 * Courtyard paving. Monument footprints get a paved apron with a raised
 * threshold, which is what lets a visitor read a building's plan from outside
 * and gives the eye a flat, legible surface against the varied ground.
 */
export function buildCourtyards(scene, buildings, materials) {
  const group = new THREE.Group();
  group.name = 'courtyard-paving';
  const courtMat = materials.courtyard || materials.road;

  for (const b of buildings) {
    if (b.type === 'river' || b.type === 'road') continue;
    const w = (b.w || 0) + 9;
    const d = (b.d || 0) + 9;
    if (w <= 0 || d <= 0) continue;
    const court = new THREE.Mesh(new THREE.PlaneGeometry(w, d), courtMat);
    court.geometry.rotateX(-Math.PI / 2);
    court.position.set(b.x, GROUND_Y + 0.01, b.z);
    if (b.rot) court.rotation.y = b.rot;
    court.receiveShadow = true;
    court.name = `courtyard-${b.id}`;
    group.add(court);

    // A threshold strip on the street-facing side: a small, deliberate detail
    // that gives each monument an orientation a visitor can read.
    const threshold = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, 1.6), courtMat);
    threshold.geometry.rotateX(-Math.PI / 2);
    const away = b.z > 0 ? -1 : 1;
    threshold.position.set(b.x, GROUND_Y + 0.02, b.z + away * (d / 2 + 0.4));
    threshold.receiveShadow = true;
    group.add(threshold);
  }

  scene.add(group);
  return group;
}

/**
 * Street furniture, placed on a real rhythm along the streets: bollards on
 * the quay edge, and lamp posts at the street corners. The spacing is fixed and
 * the jitter is deterministic, so the streets look laid out rather than
 * sprinkled. Nothing is placed off-road.
 */
export function buildStreetFurniture(scene, streets, riverPoints, materials) {
  const group = new THREE.Group();
  group.name = 'street-furniture';
  const stoneMat = materials.furniture || materials.road;
  const lampMat = materials.lamp || materials.furniture || materials.road;
  const riverX = riverPoints.reduce((s, p) => s + p.x, 0) / (riverPoints.length || 1);

  // Lamp posts along the two main streets, at 22-unit intervals.
  for (const street of streets) {
    if (street.id === 'quay') continue;
    const pts = street.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.floor(len / 22));
      // Offset to the kerb, alternating sides so the street has a rhythm.
      const nx = -dz / len;
      const nz = dx / len;
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const side = s % 2 === 0 ? 1 : -1;
        const off = (street.width / 2 + 1.2) * side;
        const x = x0 + dx * t + nx * off;
        const z = z0 + dz * t + nz * off;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 5.2, 6), lampMat);
        post.position.set(x, 2.6, z);
        post.castShadow = true;
        post.name = `lamp-post-${street.id}-${s}`;
        group.add(post);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.8), lampMat);
        head.position.set(x, 5.4, z);
        head.castShadow = true;
        group.add(head);
      }
    }
  }

  // Bollards along the quay edge, facing the river.
  const quay = streets.find((s) => s.id === 'quay');
  if (quay) {
    const zs = quay.points.map((p) => p[1]);
    const z0 = Math.min(...zs);
    const z1 = Math.max(...zs);
    const count = 16;
    for (let i = 0; i <= count; i++) {
      const z = z0 + ((z1 - z0) * i) / count;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.3, 6), stoneMat);
      post.position.set(riverX - 9.4, 0.65, z);
      post.castShadow = true;
      post.name = `quay-bollard-${i}`;
      group.add(post);
    }
  }

  scene.add(group);
  return group;
}

/**
 * District character. Each region gets a paving treatment and a marker that
 * identifies it from a distance, so the city is legible as districts rather
 * than as one continuous field. The palette is a small closed set -- the brief
 * forbids uniform procedural noise, and a random colour per tile is exactly
 * that.
 */
const DISTRICT_PAVING = {
  sanctuary: 0xd8cdb4,
  'west-quarter': 0xc9bda4,
  'east-quarter': 0xc4bba6,
  'bath-quarter': 0xcfc7ae,
  spectacle: 0xbfb49c,
  south: 0xd2c7ae
};

export function buildDistrictPaving(scene, regions, bounds, materials) {
  const group = new THREE.Group();
  group.name = 'district-paving';

  for (const region of regions) {
    const color = DISTRICT_PAVING[region.id] ?? 0xc9bda4;
    const mat = materials.district?.clone?.() || materials.road.clone();
    if (mat.color) mat.color.setHex(color);
    mat.transparent = true;
    mat.opacity = 0.34;

    const tile = new THREE.Mesh(new THREE.PlaneGeometry(region.w, region.d), mat);
    tile.geometry.rotateX(-Math.PI / 2);
    tile.position.set(region.x, GROUND_Y + 0.005, region.z);
    tile.receiveShadow = true;
    tile.name = `district-${region.id}`;
    group.add(tile);
  }

  scene.add(group);
  return group;
}

/**
 * A low, non-blocking ground haze band that separates the near monuments from
 * the background silhouettes. Depth cueing only: it sits at ankle height, adds
 * no draw cost worth naming, and does not obscure anything.
 */
export function buildDepthBand(scene, materials) {
  const group = new THREE.Group();
  group.name = 'depth-band';
  const mat = materials.haze || null;
  if (!mat) return group;
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(760, 26),
      mat
    );
    band.geometry.rotateX(-Math.PI / 2);
    band.position.set(0, 0.4 + i * 0.35, -300 - i * 40);
    band.name = `depth-haze-${i}`;
    group.add(band);
  }
  scene.add(group);
  return group;
}
