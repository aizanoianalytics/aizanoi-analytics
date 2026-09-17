import * as THREE from '../../worlds/shared/vendor/three.module.js';

// Environment-only contract. No observer/camera, agents, behaviour or physiology.
// Mesh refs are the actual visible surfaces, not enclosing furniture boxes.
//
// Semantics contract (v2):
//   - Stable mesh IDs: derived from name + hierarchy path (or a deterministic
//     floor counter for unnamed duplicates), never from random UUIDs.
//   - `hidden` and `observer_excluded` are inherited from the closest ancestor
//     that defines them during traversal.
//   - geometryRefs for windows / heat / food / landing surfaces MUST resolve
//     to at least one mesh; missing names raise instead of silently producing
//     empty entries, and each resolved mesh is exposed.
//   - Every surface exposes a `normalSpace` of `'world'` plus a `normal` and
//     `data` block derived from the actual geometry (bounds center, dominant
//     axis-aligned face normal, mesh reference, face count).
//   - `collisionAt` is documented as coarse observer-radius navigation only;
//     it is NOT a fly-body physics solver. It stays deterministic.
//   - Flue coverage is built from every consecutive pair of spec.flue.points
//     and from the `stove-pipe` mesh when present, so segment IDs are stable
//     across re-runs.

const SCHEMA_VERSION = 2;
const RESOLVE_KIND = new Set(['windows', 'heat', 'food']);

function hierarchyPath(object, root) {
  const segments = [];
  for (let current = object; current && current !== root; current = current.parent) {
    segments.unshift(current.name || current.uuid);
  }
  return segments.join('/') || (object.name || object.uuid);
}

function stableId(object, root, nameCounters) {
  const baseName = object.name || '(unnamed)';
  const path = hierarchyPath(object, root);
  const counter = nameCounters.get(baseName) ?? 0;
  nameCounters.set(baseName, counter + 1);
  return `${baseName}#${path}#${counter}`;
}

function inheritFlag(object, root, key) {
  for (let current = object; current; current = current.parent) {
    if (current === root) break;
    const value = current.userData?.[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function isAncestorExcluded(object, root) {
  for (let current = object.parent; current && current !== root; current = current.parent) {
    if (current.userData?.observer_excluded === true) return true;
  }
  return false;
}

function dominantFaceNormal(bounds) {
  const size = bounds.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z
    ? 'x'
    : size.y >= size.z
      ? 'y'
      : 'z';
  if (axis === 'x') return new THREE.Vector3(1, 0, 0);
  if (axis === 'y') return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function faceCount(mesh) {
  const geometry = mesh.geometry;
  if (!geometry) return 0;
  const index = geometry.index;
  if (index) return Math.floor(index.count / 3);
  const position = geometry.attributes?.position;
  return position ? Math.floor(position.count / 3) : 0;
}

function buildSurface(object, root, id) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const normal = dominantFaceNormal(bounds);
  return Object.freeze({
    id,
    name: object.name,
    path: hierarchyPath(object, root),
    geometry: object,
    bounds,
    center,
    size,
    normal,
    normalSpace: 'world',
    representation: 'mesh-triangles',
    faceCount: faceCount(object),
    landing: object.userData?.landing_surface === true,
    data: Object.freeze({
      materialName: object.material?.name ?? null,
      materialUuid: object.material?.uuid ?? null,
      vertexCount: object.geometry?.attributes?.position?.count ?? 0,
      visible: object.visible,
      castShadow: !!object.castShadow,
      receiveShadow: !!object.receiveShadow,
    }),
  });
}

function buildCollisionEntry(object) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  return Object.freeze({ name: object.name, bounds });
}

function buildFlueSegments(spec, pipeMesh) {
  const segments = [];
  for (let i = 0; i < spec.flue.points.length - 1; i++) {
    const a = new THREE.Vector3(...spec.flue.points[i]);
    const b = new THREE.Vector3(...spec.flue.points[i + 1]);
    segments.push({
      id: `flue-segment-${i}`,
      a,
      b,
      radius: spec.flue.radius,
      length: a.distanceTo(b),
      mesh: pipeMesh ?? null,
    });
  }
  if (pipeMesh) {
    pipeMesh.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(pipeMesh);
    segments.push({
      id: 'flue-pipe-mesh',
      a: bounds.min.clone(),
      b: bounds.max.clone(),
      radius: spec.flue.radius,
      length: bounds.getSize(new THREE.Vector3()).length(),
      mesh: pipeMesh,
    });
  }
  return Object.freeze(segments);
}

function resolveGeometryRefs(root, kind, id, geometryRefs) {
  if (!Array.isArray(geometryRefs) || geometryRefs.length === 0) {
    throw new Error(`environment: ${kind} entry "${id}" has no geometryRefs`);
  }
  const missing = [];
  const meshes = [];
  for (const name of geometryRefs) {
    const anchor = root.getObjectByName(name);
    if (!anchor) { missing.push(name); continue; }
    anchor.traverse((child) => {
      if (child.isMesh && !isAncestorExcluded(child, root)) meshes.push(child);
    });
  }
  if (missing.length) {
    throw new Error(`environment: ${kind} entry "${id}" could not resolve geometryRefs: ${missing.join(', ')}`);
  }
  if (meshes.length === 0) {
    throw new Error(`environment: ${kind} entry "${id}" resolved geometryRefs but no non-excluded meshes remain`);
  }
  return meshes;
}

export function createEnvironment(root, spec) {
  root.updateMatrixWorld(true);

  const nameCounters = new Map();
  const surfaces = [];
  const collision = [];
  const hiddenIds = new Set();
  const excludedIds = new Set();

  root.traverse((object) => {
    const hidden = inheritFlag(object, root, 'hidden') === true || object.visible === false;
    const observerExcluded = isAncestorExcluded(object, root)
      || object.userData?.observer_excluded === true
      || object.isCamera
      || object.isLight;
    if (hidden) hiddenIds.add(object.uuid);
    if (observerExcluded) excludedIds.add(object.uuid);
    if (observerExcluded || hidden) return;
    if (object.isMesh) {
      const id = stableId(object, root, nameCounters);
      surfaces.push(buildSurface(object, root, id));
    }
    if (object.userData?.collision === 'solid' && object.name !== 'stove-pipe') {
      collision.push(buildCollisionEntry(object));
    }
  });

  const pipeMesh = root.getObjectByName('stove-pipe');
  const flueSegments = buildFlueSegments(spec, pipeMesh);
  const flueBounds = flueSegments.map((segment) => {
    const bounds = new THREE.Box3();
    bounds.expandByPoint(segment.a);
    bounds.expandByPoint(segment.b);
    bounds.expandByScalar(segment.radius);
    return bounds;
  });

  function collisionAt(position, radius) {
    // COARSE observer-radius navigation only. Not fly-body physics. Deterministic.
    const probe = position.clone();
    for (const entry of collision) {
      const bounds = entry.bounds;
      if (probe.x < bounds.min.x || probe.x > bounds.max.x) continue;
      if (probe.y < bounds.min.y || probe.y > bounds.max.y) continue;
      if (probe.z < bounds.min.z || probe.z > bounds.max.z) continue;
      const clamped = new THREE.Vector3(
        Math.max(bounds.min.x, Math.min(bounds.max.x, probe.x)),
        Math.max(bounds.min.y, Math.min(bounds.max.y, probe.y)),
        Math.max(bounds.min.z, Math.min(bounds.max.z, probe.z)),
      );
      if (clamped.distanceToSquared(probe) < radius * radius) return true;
    }
    for (let i = 0; i < flueSegments.length; i++) {
      const segment = flueSegments[i];
      const closest = new THREE.Line3(segment.a, segment.b).closestPointToPoint(probe, true, new THREE.Vector3());
      const limit = radius + segment.radius;
      if (closest.distanceToSquared(probe) < limit * limit) return true;
    }
    return false;
  }

  const withMesh = (kind, entry) => Object.freeze({
    ...entry,
    geometry: resolveGeometryRefs(root, kind, entry.id, entry.geometryRefs),
  });

  return Object.freeze({
    version: SCHEMA_VERSION,
    units: 'meters',
    axis: 'Z-up',
    observerExcluded: true,
    surfaces,
    collision,
    collisionAt,
    flue: Object.freeze({
      radius: spec.flue.radius,
      segments: flueSegments,
    }),
    rooms: spec.rooms,
    transitions: spec.transitions,
    windows: spec.windows.map((entry) => withMesh('windows', entry)),
    airflow: spec.airflow,
    heat: spec.heat.map((entry) => withMesh('heat', entry)),
    food: spec.food.map((entry) => withMesh('food', entry)),
    hiddenIds: Object.freeze([...hiddenIds]),
    observerExcludedIds: Object.freeze([...excludedIds]),
    meta: Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      contract: 'environment-only; coarse observer-radius navigation in collisionAt',
    }),
  });
}
