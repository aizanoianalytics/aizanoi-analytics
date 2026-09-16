/**
 * asset-kit.js — Shared runtime loader for Blender-authored GLB asset kits.
 *
 * Architecture decision (2026-09-16, explicit): historical worlds may ship
 * low-poly studio-authored `.glb` kits under their own `assets/` folder,
 * loaded here through the single vendored Three.js r174 + GLTFLoader stack.
 * No CDN, no second Three copy, no external model dependency: every GLB is
 * authored in-repo (Blender headless scripts) and served as a static file
 * under `/worlds/`, so the service worker runtime-cache contract is unchanged.
 *
 * Usage (world-local main.js):
 *   const kitBase = new URL('./assets/', import.meta.url);
 *   const kit = await loadAssetKit(kitBase, [{ id: 'insula-a', file: 'insula-a.glb' }], onProgress);
 *   const g = kit.place('insula-a', { x, z, yaw, scale });
 *   scene.add(g);
 */

import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

export async function loadAssetKit(baseUrl, entries, onProgress) {
  const loader = new GLTFLoader();
  const cache = new Map();
  let done = 0;

  for (const entry of entries) {
    const url = new URL(entry.file, baseUrl).toString();
    const gltf = await loader.loadAsync(url);
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    cache.set(entry.id, gltf.scene);
    done += 1;
    if (typeof onProgress === 'function') {
      try { onProgress(done / entries.length, entry.id); } catch (e) { /* progress is best-effort */ }
    }
  }

  function clone(id) {
    const src = cache.get(id);
    if (!src) throw new Error(`asset-kit: unknown asset '${id}'`);
    return src.clone(true);
  }

  function place(id, { x = 0, y = 0, z = 0, yaw = 0, scale = 1 } = {}) {
    const group = new THREE.Group();
    group.userData.assetId = id;
    const model = clone(id);
    group.add(model);
    group.position.set(x, y, z);
    if (yaw) group.rotation.y = yaw;
    if (scale !== 1) group.scale.setScalar(scale);
    return group;
  }

  return {
    ids: [...cache.keys()],
    has: (id) => cache.has(id),
    clone,
    place,
  };
}
