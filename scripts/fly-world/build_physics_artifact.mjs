import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const envPath = resolve(repo, 'frontend/labs/fly-world/assets/environment.json');
const glbPath = resolve(repo, 'frontend/labs/fly-world/assets/fly-house.glb');
const outPath = resolve(repo, 'frontend/labs/fly-world/assets/fly-physics.json');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const envBytes = await readFile(envPath);
const glbBytes = await readFile(glbPath);
const spec = JSON.parse(envBytes);
const surfaces = [];
const add = (surface) => surfaces.push({ id: surface.id, ...surface });

// The artifact is a compact, deterministic proxy of authored Fly House geometry.
// It is not a photogrammetric mesh or CFD result. Room boundaries and the
// authored doorway are explicit so the service can collide without a browser.
for (const room of spec.rooms) {
  const [sx, sy, sz] = room.size;
  const [ox, oy, oz] = room.origin;
  const minX = ox - sx / 2; const maxX = ox + sx / 2;
  const minY = oy - sy / 2; const maxY = oy + sy / 2;
  const minZ = oz; const maxZ = oz + sz;
  add({ id: `${room.id}:floor`, kind: 'plane', axis: 'z', value: minZ, normal: [0, 0, 1], bounds: [[minX, minY], [maxX, maxY]], room: room.id, landing: true, material: room.floorMaterial });
  add({ id: `${room.id}:ceiling`, kind: 'plane', axis: 'z', value: maxZ, normal: [0, 0, -1], bounds: [[minX, minY], [maxX, maxY]], room: room.id, landing: true, material: room.ceilingMaterial });
  add({ id: `${room.id}:west-wall`, kind: 'plane', axis: 'x', value: minX, normal: [1, 0, 0], bounds: [[minY, minZ], [maxY, maxZ]], room: room.id, landing: true, material: room.wallMaterial });
  add({ id: `${room.id}:east-wall`, kind: 'plane', axis: 'x', value: maxX, normal: [-1, 0, 0], bounds: [[minY, minZ], [maxY, maxZ]], room: room.id, landing: true, material: room.wallMaterial });
  add({ id: `${room.id}:south-wall`, kind: 'plane', axis: 'y', value: minY, normal: [0, 1, 0], bounds: [[minX, minZ], [maxX, maxZ]], room: room.id, landing: true, material: room.wallMaterial });
  add({ id: `${room.id}:north-wall`, kind: 'plane', axis: 'y', value: maxY, normal: [0, -1, 0], bounds: [[minX, minZ], [maxX, maxZ]], room: room.id, landing: true, material: room.wallMaterial });
}

// Remove the two wall sections occupied by the authored open doorway. The
// remaining wall segments preserve solid geometry on either side of it.
const doorway = spec.transitions.find((entry) => entry.id === 'bedroom-doorway' && entry.open);
if (doorway) {
  const [[minX, minY, minZ], [maxX, maxY, maxZ]] = doorway.bounds;
  const openingMinY = minY; const openingMaxY = maxY;
  const openingMinZ = minZ; const openingMaxZ = maxZ;
  for (const wallId of ['main-room:east-wall', 'bedroom:west-wall']) {
    const index = surfaces.findIndex((surface) => surface.id === wallId);
    if (index < 0) continue;
    const wall = surfaces[index];
    const [[wallMin, wallBottom], [wallMax, wallTop]] = wall.bounds;
    const pieces = [];
    if (wallMin < openingMinY) pieces.push({ ...wall, id: `${wall.id}:lower`, bounds: [[wallMin, wallBottom], [openingMinY, wallTop]] });
    if (openingMaxY < wallMax) pieces.push({ ...wall, id: `${wall.id}:upper`, bounds: [[openingMaxY, wallBottom], [wallMax, wallTop]] });
    if (wallBottom < openingMinZ) pieces.push({ ...wall, id: `${wall.id}:below`, bounds: [[openingMinY, wallBottom], [openingMaxY, openingMinZ]] });
    if (openingMaxZ < wallTop) pieces.push({ ...wall, id: `${wall.id}:above`, bounds: [[openingMinY, openingMaxZ], [openingMaxY, wallTop]] });
    surfaces.splice(index, 1, ...pieces);
  }
}

const artifact = {
  schemaVersion: 'fly-physics-1',
  units: 'meters',
  axis: 'Z-up',
  provenance: {
    label: 'MODELLED',
    source: 'scripts/fly-world/build_physics_artifact.mjs',
    units: 'meters',
    calibrated: false,
    assumptions: ['axis-aligned room boundary proxy derived from authored Fly House room and doorway metadata', 'furniture and mesh-level triangle collision are not represented'],
    limitations: ['not a triangle mesh export', 'not calibrated biomechanics or CFD', 'fine furniture collision is unavailable until a mesh collision export is added'],
    version: 'fly-physics-1',
    sourceReferences: ['frontend/labs/fly-world/assets/environment.json', 'frontend/labs/fly-world/assets/fly-house.glb']
  },
  source: {
    environmentSourceHash: sha256(envBytes),
    flyHouseGlbHash: sha256(glbBytes),
    environmentArtifactHash: spec.artifactHashes?.environmentSource ?? null,
    glbArtifactHash: spec.artifactHashes?.flyHouseGlb ?? null
  },
  rooms: spec.rooms.map(({ id, origin, size }) => ({ id, origin, size })),
  transitions: spec.transitions,
  safeSpawnVolumes: spec.integration?.safeSpawnVolumes ?? [],
  surfaces,
  fields: {
    food: spec.food.map(({ id, center, radius, strength, kind }) => ({ id, center, radius, strength, kind, active: true, activation: 'Fly Simulation v1 food target' })),
    heat: spec.heat.map(({ id, center, radius, temperatureCelsius, calibrated }) => ({ id, center, radius, temperatureCelsius, calibrated })),
    light: spec.windows.map(({ id, center, normal, light }) => ({ id, center, normal, relativeIntensity: light?.relativeIntensity ?? 0, kind: light?.kind ?? 'unknown' })),
    airflow: spec.airflow.map(({ id, bounds, direction, speedMetersPerSecond, active }) => ({ id, bounds, direction, speedMetersPerSecond, active }))
  }
};
await writeFile(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ outPath, environmentSourceHash: artifact.source.environmentSourceHash, flyHouseGlbHash: artifact.source.flyHouseGlbHash, surfaces: surfaces.length }, null, 2));
