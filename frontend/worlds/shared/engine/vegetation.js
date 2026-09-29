/**
 * vegetation.js — Procedural Mediterranean Vegetation System
 * Aizanoi Analytics unified worlds runtime (originally Athens 450-430 BCE reference implementation)
 *
 * Implements InstancedMesh rendering for olive trees, cypress, fig trees,
 * and dry Mediterranean shrubs with authentic historical placement
 * (river banks, sanctuary borders, civic-core corners).
 */

import * as THREE from '../vendor/three.module.js';
import { getMaterial } from '../assets/materials.js';

export class VegetationSystem {
  constructor(scene, isMobile = false) {
    this.scene = scene;
    this.isMobile = isMobile;
    this.maxInstances = this.isMobile ? 350 : 800;
    // Deterministic layout: every page load must grow the same forest, or no
    // arrival framing can ever be verified — a tree that blocks the Temple of
    // Zeus on one load is gone on the next, and screenshots stop being
    // evidence. A fixed-seed PRNG sequences every placement decision below.
    this._seed = 0xA17A001;
    // Compacted worlds shrink their monuments (Aizanoi renders at 0.39) while
    // full-size trees would tower over them and swallow arrival sightlines.
    // Worlds pass their kit factor so flora keeps its real proportion to the
    // monuments; worlds that do not pass one render exactly as before.
    this.layoutScale = 1;
    this.dummy = new THREE.Object3D();

    this.oliveTrunkMesh = null;
    this.oliveLeavesMesh = null;
    this.cypressMesh = null;
    this.cypressTrunkMesh = null;
    this.figMesh = null;
    this.figTrunkMesh = null;
    this.shrubMesh = null;
  }

  /** Deterministic [0, 1) stream replacing Math.random for layout. */
  rand() {
    this._seed = (this._seed * 1664525 + 1013904223) >>> 0;
    return this._seed / 4294967296;
  }

  init() {
    const trunkMat = getMaterial('trunk') || new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 0.9 });

    // 1. Olive Trees (split trunk & leaves)
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.65, 3.2, 7);
    trunkGeo.translate(0, 1.6, 0);
    this.oliveTrunkMesh = new THREE.InstancedMesh(
      trunkGeo,
      trunkMat,
      this.maxInstances,
    );
    this.oliveTrunkMesh.castShadow = true;
    this.oliveTrunkMesh.receiveShadow = true;
    this.oliveTrunkMesh.count = 0;

    const leavesGeo = new THREE.DodecahedronGeometry(3.0, 1);
    leavesGeo.translate(0, 4.4, 0);
    this.oliveLeavesMesh = new THREE.InstancedMesh(
      leavesGeo,
      getMaterial('foliage') || new THREE.MeshStandardMaterial({ color: 0x5a7a48, roughness: 0.8 }),
      this.maxInstances,
    );
    this.oliveLeavesMesh.castShadow = true;
    this.oliveLeavesMesh.receiveShadow = true;
    this.oliveLeavesMesh.count = 0;

    // 2. Mediterranean Cypress (grounded trunk & slender columnar foliage)
    const cypressTrunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 2.0, 6);
    cypressTrunkGeo.translate(0, 1.0, 0);
    this.cypressTrunkMesh = new THREE.InstancedMesh(
      cypressTrunkGeo,
      trunkMat,
      this.maxInstances,
    );
    this.cypressTrunkMesh.castShadow = true;
    this.cypressTrunkMesh.receiveShadow = true;
    this.cypressTrunkMesh.count = 0;

    const cypressGeo = new THREE.ConeGeometry(1.2, 12, 8);
    cypressGeo.translate(0, 7.5, 0);
    this.cypressMesh = new THREE.InstancedMesh(
      cypressGeo,
      getMaterial('foliageDark') || new THREE.MeshStandardMaterial({ color: 0x2a4a28, roughness: 0.85 }),
      this.maxInstances,
    );
    this.cypressMesh.castShadow = true;
    this.cypressMesh.receiveShadow = true;
    this.cypressMesh.count = 0;

    // 3. Fig Trees (grounded gnarled trunk & broad spreading canopy)
    const figTrunkGeo = new THREE.CylinderGeometry(0.35, 0.6, 2.6, 7);
    figTrunkGeo.translate(0, 1.3, 0);
    this.figTrunkMesh = new THREE.InstancedMesh(
      figTrunkGeo,
      trunkMat,
      this.maxInstances,
    );
    this.figTrunkMesh.castShadow = true;
    this.figTrunkMesh.receiveShadow = true;
    this.figTrunkMesh.count = 0;

    const figGeo = new THREE.SphereGeometry(3.6, 8, 7);
    figGeo.scale(1.2, 0.7, 1.2);
    figGeo.translate(0, 3.4, 0);
    this.figMesh = new THREE.InstancedMesh(
      figGeo,
      new THREE.MeshStandardMaterial({ color: 0x6e8e48, roughness: 0.75 }),
      this.maxInstances,
    );
    this.figMesh.castShadow = true;
    this.figMesh.receiveShadow = true;
    this.figMesh.count = 0;

    // 4. Shrubs & Wild Thyme
    const shrubGeo = new THREE.DodecahedronGeometry(1.1, 1);
    shrubGeo.scale(1.0, 0.65, 1.0);
    shrubGeo.translate(0, 0.55, 0);
    this.shrubMesh = new THREE.InstancedMesh(
      shrubGeo,
      new THREE.MeshStandardMaterial({ color: 0x4f6c38, roughness: 0.9 }),
      this.maxInstances,
    );
    this.shrubMesh.castShadow = true;
    this.shrubMesh.receiveShadow = true;
    this.shrubMesh.count = 0;

    this.scene.add(this.oliveTrunkMesh);
    this.scene.add(this.oliveLeavesMesh);
    this.scene.add(this.cypressTrunkMesh);
    this.scene.add(this.cypressMesh);
    this.scene.add(this.figTrunkMesh);
    this.scene.add(this.figMesh);
    this.scene.add(this.shrubMesh);
  }

  addOlive(x, z, scale = 1) {
    scale *= this.layoutScale;
    if (this.oliveTrunkMesh.count >= this.maxInstances) return;
    const count = this.oliveTrunkMesh.count;

    this.dummy.position.set(x, 0, z);
    this.dummy.scale.set(scale, scale, scale);
    this.dummy.rotation.set(0, this.rand() * Math.PI * 2, 0);
    this.dummy.updateMatrix();

    this.oliveTrunkMesh.setMatrixAt(count, this.dummy.matrix);
    this.oliveLeavesMesh.setMatrixAt(count, this.dummy.matrix);
    this.oliveTrunkMesh.count++;
    this.oliveLeavesMesh.count++;
  }

  addCypress(x, z, scale = 1) {
    scale *= this.layoutScale;
    if (this.cypressMesh.count >= this.maxInstances) return;
    const count = this.cypressMesh.count;

    this.dummy.position.set(x, 0, z);
    this.dummy.scale.set(scale, scale * (0.9 + this.rand() * 0.3), scale);
    this.dummy.rotation.set(0, this.rand() * Math.PI * 2, 0);
    this.dummy.updateMatrix();

    this.cypressTrunkMesh.setMatrixAt(count, this.dummy.matrix);
    this.cypressMesh.setMatrixAt(count, this.dummy.matrix);
    this.cypressTrunkMesh.count++;
    this.cypressMesh.count++;
  }

  addFig(x, z, scale = 1) {
    scale *= this.layoutScale;
    if (this.figMesh.count >= this.maxInstances) return;
    const count = this.figMesh.count;

    this.dummy.position.set(x, 0, z);
    this.dummy.scale.set(scale, scale, scale);
    this.dummy.rotation.set(0, this.rand() * Math.PI * 2, 0);
    this.dummy.updateMatrix();

    this.figTrunkMesh.setMatrixAt(count, this.dummy.matrix);
    this.figMesh.setMatrixAt(count, this.dummy.matrix);
    this.figTrunkMesh.count++;
    this.figMesh.count++;
  }

  addShrub(x, z, scale = 1) {
    scale *= this.layoutScale;
    if (this.shrubMesh.count >= this.maxInstances) return;
    const count = this.shrubMesh.count;

    this.dummy.position.set(x, 0, z);
    this.dummy.scale.set(scale, scale, scale);
    this.dummy.rotation.set(0, this.rand() * Math.PI * 2, 0);
    this.dummy.updateMatrix();

    this.shrubMesh.setMatrixAt(count, this.dummy.matrix);
    this.shrubMesh.count++;
  }

  populateCity(regions = [], buildings = [], streets = [], scale = 1) {
    if (Number.isFinite(scale) && scale > 0) this.layoutScale = scale;
    this.init();

    const isNearBuilding = (x, z, pad = 8) => {
      for (const b of (buildings || [])) {
        const halfW = (b.w || 12) / 2 + pad;
        const halfD = (b.d || 12) / 2 + pad;
        if (x >= b.x - halfW && x <= b.x + halfW && z >= b.z - halfD && z <= b.z + halfD) {
          return true;
        }
      }
      return false;
    };

    if (regions && regions.length > 0) {
      // 1. Procedurally distribute vegetation within defined city regions
      for (const reg of regions) {
        const rw = reg.w || 200;
        const rd = reg.d || 200;
        const area = rw * rd;
        const baseBudget = Math.max(6, Math.min(55, Math.round(area / 3800)));
        const count = this.isMobile ? Math.max(3, Math.round(baseBudget * 0.5)) : baseBudget;

        const tag = `${reg.id || ''} ${reg.name || ''} ${reg.note || ''}`.toLowerCase();
        const isWater = tag.includes('river') || tag.includes('quay') || tag.includes('spring') || tag.includes('bath');
        const isSacred = tag.includes('sanctuary') || tag.includes('temple') || tag.includes('cemetery');

        for (let i = 0; i < count; i++) {
          const gx = reg.x + (this.rand() - 0.5) * (rw * 0.85);
          const gz = reg.z + (this.rand() - 0.5) * (rd * 0.85);

          if (!isNearBuilding(gx, gz, 6)) {
            if (isWater) {
              if (this.rand() > 0.45) {
                this.addFig(gx, gz, 0.8 + this.rand() * 0.4);
              } else {
                this.addShrub(gx, gz, 0.7 + this.rand() * 0.5);
              }
            } else if (isSacred) {
              if (this.rand() > 0.35) {
                this.addCypress(gx, gz, 0.85 + this.rand() * 0.4);
              } else {
                this.addOlive(gx, gz, 0.8 + this.rand() * 0.35);
              }
            } else {
              const roll = this.rand();
              if (roll < 0.55) {
                this.addOlive(gx, gz, 0.75 + this.rand() * 0.4);
              } else if (roll < 0.75) {
                this.addShrub(gx, gz, 0.65 + this.rand() * 0.6);
              } else if (roll < 0.90) {
                this.addCypress(gx, gz, 0.8 + this.rand() * 0.35);
              } else {
                this.addFig(gx, gz, 0.75 + this.rand() * 0.35);
              }
            }
          }
        }
      }

      // 2. Add trees along major streets
      if (streets && streets.length > 0) {
        for (const street of streets) {
          if (!street.points || street.points.length < 2) continue;
          const sWidth = street.width || 10;
          for (let p = 0; p < street.points.length - 1; p++) {
            const p1 = street.points[p];
            const p2 = street.points[p + 1];
            const mx = (p1[0] + p2[0]) / 2;
            const mz = (p1[1] + p2[1]) / 2;
            const dx = p2[0] - p1[0];
            const dz = p2[1] - p1[1];
            const len = Math.hypot(dx, dz) || 1;
            const nx = -dz / len;
            const nz = dx / len;
            const offsetDist = sWidth / 2 + 3.0 + this.rand() * 2.0;

            for (const side of [-1, 1]) {
              const tx = mx + nx * offsetDist * side + (this.rand() - 0.5) * 4;
              const tz = mz + nz * offsetDist * side + (this.rand() - 0.5) * 4;
              if (!isNearBuilding(tx, tz, 5)) {
                if (this.rand() > 0.4) {
                  this.addOlive(tx, tz, 0.8 + this.rand() * 0.3);
                } else {
                  this.addCypress(tx, tz, 0.85 + this.rand() * 0.3);
                }
              }
            }
          }
        }
      }
    } else {
      // General fallback if no regions provided
      for (let i = 0; i < (this.isMobile ? 50 : 120); i++) {
        const x = (this.rand() - 0.5) * 600;
        const z = (this.rand() - 0.5) * 600;
        if (!isNearBuilding(x, z, 6)) {
          this.addOlive(x, z, 0.8 + this.rand() * 0.4);
        }
      }
    }

    // Notify Three.js to upload instance matrices to GPU
    if (this.oliveTrunkMesh) this.oliveTrunkMesh.instanceMatrix.needsUpdate = true;
    if (this.oliveLeavesMesh) this.oliveLeavesMesh.instanceMatrix.needsUpdate = true;
    if (this.cypressTrunkMesh) this.cypressTrunkMesh.instanceMatrix.needsUpdate = true;
    if (this.cypressMesh) this.cypressMesh.instanceMatrix.needsUpdate = true;
    if (this.figTrunkMesh) this.figTrunkMesh.instanceMatrix.needsUpdate = true;
    if (this.figMesh) this.figMesh.instanceMatrix.needsUpdate = true;
    if (this.shrubMesh) this.shrubMesh.instanceMatrix.needsUpdate = true;
  }
}
