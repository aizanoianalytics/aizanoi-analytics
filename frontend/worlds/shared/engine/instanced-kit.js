/**
 * instanced-kit.js — Draw-call batching for kit-based worlds.
 *
 * Two tools, same contract (no visual change, evidence-mode compatible):
 *
 * mergeByMaterial(group) — clone a kit model and merge meshes that share
 *   a material into one geometry each (baked world transforms). Turns
 *   multi-dozen-mesh kit pieces into a handful of meshes. Memory cost is
 *   one merged copy per call site — use for UNIQUE placements.
 *
 * buildInstancedMeshes(kit, assetId, transforms) — one InstancedMesh per
 *   source mesh, shared across every placement. Use for REPEATED assets
 *   (fabric houses, colonnades, aqueduct/wall segments, stands, wedges).
 *   N placements of an M-mesh asset cost exactly M draw calls.
 *
 * Transforms: [{ x, y, z, yaw, scale }].
 */

import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function composeTransform(t = {}) {
  _p.set(t.x || 0, t.y || 0, t.z || 0);
  _q.setFromAxisAngle(_up, t.yaw || 0);
  const s = t.scale ?? 1;
  _s.set(s, s, s);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

function bakedMeshes(root) {
  root.updateMatrixWorld(true);
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    // mergeGeometries needs a consistent attribute set.
    if (!geo.attributes.uv && geo.attributes.position) {
      const n = geo.attributes.position.count;
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    out.push({ geometry: geo, material: o.material, name: o.name });
  });
  return out;
}

export function mergeByMaterial(root) {
  const group = new THREE.Group();
  group.userData.assetId = root.userData?.assetId;
  const byMat = new Map();
  for (const m of bakedMeshes(root)) {
    const key = m.material?.uuid || m.material;
    if (!byMat.has(key)) byMat.set(key, { material: m.material, geos: [] });
    byMat.get(key).geos.push(m.geometry);
  }
  for (const { material, geos } of byMat.values()) {
    const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

export function buildInstancedMeshes(kit, assetId, transforms, { merged = false } = {}) {
  const group = new THREE.Group();
  group.userData.assetId = assetId;
  group.userData.instanced = transforms.length;
  if (!transforms.length) return group;
  let source = kit.clone(assetId);
  if (merged) source = mergeByMaterial(source);
  const matrices = transforms.map(composeTransform);
  for (const m of bakedMeshes(source)) {
    const im = new THREE.InstancedMesh(m.geometry, m.material, matrices.length);
    matrices.forEach((mat, i) => im.setMatrixAt(i, mat));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
  }
  return group;
}
