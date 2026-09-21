import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BodyState, Vec3, DROSOPHILA_MELANOGASTER_V1 } from '../../frontend/labs/fly-simulation/index.js';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const vector = (value) => value instanceof Vec3 ? value : new Vec3(value?.x ?? value?.[0] ?? 0, value?.y ?? value?.[1] ?? 0, value?.z ?? value?.[2] ?? 0);
const in2 = (value, bounds) => value >= bounds[0] && value <= bounds[1];
const in3 = (point, bounds) => point.x >= bounds[0][0] && point.x <= bounds[1][0]
  && point.y >= bounds[0][1] && point.y <= bounds[1][1]
  && point.z >= bounds[0][2] && point.z <= bounds[1][2];

function roomAt(rooms, point) {
  const p = vector(point);
  return rooms.find((room) => {
    const [sx, sy, sz] = room.size; const [ox, oy, oz] = room.origin;
    return p.x >= ox - sx / 2 && p.x <= ox + sx / 2
      && p.y >= oy - sy / 2 && p.y <= oy + sy / 2
      && p.z >= oz && p.z <= oz + sz;
  })?.id ?? null;
}

function rayBox(origin, direction, box, maxDistance) {
  let near = 0; let far = maxDistance; let nearNormal = null; let farNormal = null;
  const axes = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i += 1) {
    const axis = axes[i]; const o = origin[axis]; const d = direction[axis]; const min = box.bounds[0][i]; const max = box.bounds[1][i];
    if (Math.abs(d) < 1e-12) { if (o < min || o > max) return null; continue; }
    let t1 = (min - o) / d; let t2 = (max - o) / d;
    let n1 = [0, 0, 0]; let n2 = [0, 0, 0]; n1[i] = -1; n2[i] = 1;
    if (t1 > t2) { [t1, t2] = [t2, t1]; [n1, n2] = [n2, n1]; }
    if (t1 > near) { near = t1; nearNormal = n1; }
    if (t2 < far) { far = t2; farNormal = n2; }
    if (near > far || far < 0) return null;
  }
  const distance = near >= 0 ? near : far; const normal = near >= 0 ? nearNormal : farNormal;
  if (!(distance >= 0 && distance <= maxDistance)) return null;
  return { distance, point: origin.add(direction.mul(distance)), normal: vector(normal) };
}

function makeRaycast(surfaces, rooms, fields, colliders = []) {
  return (originValue, directionValue, maxDistance = 100) => {
    const origin = vector(originValue); const direction = vector(directionValue).normalize();
    let best = null;
    for (const surface of surfaces) {
      const axisIndex = surface.axis === 'x' ? 0 : surface.axis === 'y' ? 1 : 2;
      const component = [direction.x, direction.y, direction.z][axisIndex];
      if (Math.abs(component) < 1e-12) continue;
      const coordinate = [origin.x, origin.y, origin.z][axisIndex];
      const t = (surface.value - coordinate) / component;
      if (t < 0 || t > maxDistance || (best && t >= best.distance)) continue;
      const hit = origin.add(direction.mul(t));
      const [u, v] = surface.axis === 'x' ? [hit.y, hit.z] : surface.axis === 'y' ? [hit.x, hit.z] : [hit.x, hit.y];
      if (!in2(u, surface.bounds[0]) || !in2(v, surface.bounds[1])) continue;
      best = {
        surfaceId: surface.id,
        distance: t,
        point: hit,
        normal: vector(surface.normal),
        room: surface.room ?? roomAt(rooms, hit),
        zones: []
      };
    }
    for (const collider of colliders) {
      const hit = rayBox(origin, direction, collider, maxDistance);
      if (hit && (!best || hit.distance < best.distance)) best = { ...hit, surfaceId: collider.id, room: roomAt(rooms, hit.point), zones: [] };
    }
    return best;
  };
}

function resolveAabbPenetration(positionValue, radius, colliders) {
  let position = vector(positionValue);
  let contact = null;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    let best = null;
    for (const collider of colliders) {
      const min = collider.bounds[0].map((value) => value - radius);
      const max = collider.bounds[1].map((value) => value + radius);
      const coordinates = [position.x, position.y, position.z];
      if (coordinates.some((value, index) => value < min[index] || value > max[index])) continue;
      const candidates = [
        { penetration: coordinates[0] - min[0], normal: [-1, 0, 0] },
        { penetration: max[0] - coordinates[0], normal: [1, 0, 0] },
        { penetration: coordinates[1] - min[1], normal: [0, -1, 0] },
        { penetration: max[1] - coordinates[1], normal: [0, 1, 0] },
        { penetration: coordinates[2] - min[2], normal: [0, 0, -1] },
        { penetration: max[2] - coordinates[2], normal: [0, 0, 1] }
      ];
      const candidate = candidates.sort((a, b) => a.penetration - b.penetration)[0];
      if (!best || candidate.penetration < best.penetration) best = { ...candidate, id: collider.id };
    }
    if (!best) break;
    const normal = vector(best.normal);
    position = position.add(normal.mul(best.penetration + 1e-9));
    contact = { surfaceId: best.id, normal };
  }
  return contact ? { position, ...contact } : null;
}

function fieldSampler(fields) {
  const nearest = (entries, point) => entries
    .map((entry) => ({ entry, distance: vector(point).sub(vector(entry.center)).length() }))
    .filter(({ entry, distance }) => distance <= Number(entry.radius ?? 0))
    .sort((a, b) => a.distance - b.distance)[0] ?? null;
  return {
    light(point) {
      const hit = fields.light.map((entry) => ({ entry, distance: vector(point).sub(vector(entry.center)).length() })).sort((a, b) => a.distance - b.distance)[0];
      return hit ? { status: 'MODELLED', value: hit.entry.relativeIntensity * Math.max(0, 1 - hit.distance / 10), units: 'relative intensity', source: hit.entry.id } : { status: 'UNAVAILABLE', value: null, units: 'relative intensity' };
    },
    temperature(point) {
      const hit = nearest(fields.heat, point);
      return { status: 'UNAVAILABLE', value: null, units: 'K', reason: hit ? 'absolute temperature is not authored/calibrated' : 'no calibrated temperature field' };
    },
    olfaction(point) {
      const hit = nearest(fields.food.filter((entry) => entry.active), point);
      return { status: 'MODELLED', value: hit ? hit.entry.strength * Math.max(0, 1 - hit.distance / hit.entry.radius) : 0, units: 'normalized concentration', source: hit?.entry.id ?? null };
    },
    taste(point) {
      const hit = nearest(fields.food.filter((entry) => entry.active), point);
      return { status: hit ? 'AVAILABLE' : 'UNAVAILABLE', value: hit ? 1 : 0, units: 'contact flag', source: hit?.entry.id ?? null };
    },
    airflow(point) {
      const hit = fields.airflow.find((entry) => entry.active && in3(vector(point), entry.bounds));
      return hit ? { status: 'MODELLED', value: hit.direction.map((v) => v * hit.speedMetersPerSecond), units: 'm/s', source: hit.id } : { status: 'AVAILABLE', value: [0, 0, 0], units: 'm/s', calibrated: false };
    }
  };
}

export async function loadFlyHouseRuntime({ rootDir, artifactPath }) {
  const environmentPath = `${rootDir}/frontend/labs/fly-world/assets/environment.json`;
  const glbPath = `${rootDir}/frontend/labs/fly-world/assets/fly-house.glb`;
  const physicsFile = artifactPath ?? `${rootDir}/frontend/labs/fly-world/assets/fly-physics.json`;
  const connectomePath = `${rootDir}/frontend/labs/fly-simulation/assets/flywire-fafb-v783-lc4-escape.json`;
  const [environmentBytes, glbBytes, physicsBytes, connectomeBytes] = await Promise.all([readFile(environmentPath), readFile(glbPath), readFile(physicsFile), readFile(connectomePath)]);
  const spec = JSON.parse(environmentBytes); const physics = JSON.parse(physicsBytes); const connectome = JSON.parse(connectomeBytes);
  const environmentSourceHash = sha256(environmentBytes); const glbHash = sha256(glbBytes); const physicsArtifactHash = sha256(physicsBytes); const connectomeGraphHash = sha256(connectomeBytes);
  if (physics.source.environmentSourceHash !== environmentSourceHash) throw new Error('fly physics environment source hash mismatch');
  if (physics.source.environmentArtifactHash !== spec.artifactHashes?.environmentSource) throw new Error('fly physics environment artifact identity mismatch');
  if (physics.source.glbArtifactHash !== spec.artifactHashes?.flyHouseGlb) throw new Error('fly physics GLB artifact identity mismatch');
  if (physics.source.flyHouseGlbHash !== glbHash) throw new Error('fly physics GLB hash mismatch');
  if (!physics.schemaVersion.startsWith('fly-physics-') || physics.axis !== 'Z-up') throw new Error('unsupported Fly House physics artifact');
  const fields = physics.fields;
  const sensors = fieldSampler(fields);
  const dynamicState = { food: fields.food.map((entry) => ({ id: entry.id, active: Boolean(entry.active) })) };
  const restoreDynamicState = (state = {}) => {
    const foodState = new Map((state.food ?? []).map((entry) => [entry.id, Boolean(entry.active)]));
    for (const food of fields.food) if (foodState.has(food.id)) food.active = foodState.get(food.id);
    dynamicState.food = fields.food.map((entry) => ({ id: entry.id, active: Boolean(entry.active) }));
  };
  const snapshotDynamicState = () => ({ food: fields.food.map((entry) => ({ id: entry.id, active: Boolean(entry.active) })) });
  const environment = {
    hash: spec.artifactHashes.environmentSource,
    glbHash: spec.artifactHashes.flyHouseGlb,
    schemaVersion: physics.schemaVersion,
    meta: { artifactHashes: { environmentSource: spec.artifactHashes.environmentSource, flyHouseGlb: spec.artifactHashes.flyHouseGlb, physicsArtifact: physicsArtifactHash, physicsSchema: physics.schemaVersion, connectomeGraph: connectomeGraphHash, connectomeDataset: connectome.release?.dataset ?? null, connectomeVersion: connectome.release?.version ?? null } },
    axis: physics.axis,
    downDirection: [0, 0, -1],
    surfaces: physics.surfaces,
    colliders: physics.colliders ?? [],
    rooms: physics.rooms,
    fields,
    provenance: physics.provenance,
    raycast: makeRaycast(physics.surfaces, physics.rooms, fields, physics.colliders ?? []),
    resolveCollision: (position, radius) => resolveAabbPenetration(position, radius, physics.colliders ?? []),
    roomAt: (point) => roomAt(physics.rooms, point),
    zonesAt: (point) => {
      const p = vector(point); const zones = [];
      for (const transition of physics.transitions) if (in3(p, transition.bounds)) zones.push(transition.id);
      for (const food of fields.food) if (p.sub(vector(food.center)).length() <= food.radius) zones.push(`food:${food.id}`);
      return zones;
    },
    sampleSensor: (channel, point) => sensors[channel]?.(point) ?? { status: 'UNAVAILABLE', value: null, units: 'n/a' },
    dynamicState,
    snapshotDynamicState,
    restoreDynamicState
  };
  return Object.freeze({ environment, spec, physics, connectome, hashes: { environmentSourceHash, glbHash, physicsArtifactHash, connectomeGraphHash } });
}

export function initialFlyBody({ spawn, profile = DROSOPHILA_MELANOGASTER_V1 } = {}) {
  const position = vector(spawn ?? [-1.85, -2.15, 1]);
  return new BodyState({ position, radius: profile.collisionRadiusMeters, mass: profile.massKg, damping: 0.15, drag: 0.2 });
}
