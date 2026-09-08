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

    this.dummy = new THREE.Object3D();

    this.oliveTrunkMesh = null;
    this.oliveLeavesMesh = null;
    this.cypressMesh = null;
    this.cypressTrunkMesh = null;
    this.figMesh = null;
    this.figTrunkMesh = null;
    this.shrubMesh = null;
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
    if (this.oliveTrunkMesh.count >= this.maxInstances) return;
    const count = this.oliveTrunkMesh.count;

    this.dummy.position.set(x, 0, z);
    this.dummy.scale.set(scale, scale, scale);
    this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.dummy.updateMatrix();

    this.oliveTrunkMesh.setMatrixAt(count, this.dummy.matrix);
    this.oliveLeavesMesh.setMatrixAt(count, this.dummy.matrix);
    this.oliveTrunkMesh.count++;
    this.oliveLeavesMesh.count++;
  }

  addCypress(x, z, scale = 1) {
    if (this.cypressMesh.count >= this.maxInstances) return;
    const count = this.cypressMesh.count;

    this.dummy.position.set(x, 0, z);
    this.dummy.scale.set(scale, scale * (0.9 + Math.random() * 0.3), scale);
    this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.dummy.updateMatrix();

    this.cypressTrunkMesh.setMatrixAt(count, this.dummy.matrix);
    this.cypressMesh.setMatrixAt(count, this.dummy.matrix);
    this.cypressTrunkMesh.count++;
    this.cypressMesh.count++;
  }

  addFig(x, z, scale = 1) {
    if (this.figMesh.count >= this.maxInstances) return;
    const count = this.figMesh.count;

    this.dummy.position.set(x, 0, z);
    this.dummy.scale.set(scale, scale, scale);
    this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.dummy.updateMatrix();

    this.figTrunkMesh.setMatrixAt(count, this.dummy.matrix);
    this.figMesh.setMatrixAt(count, this.dummy.matrix);
    this.figTrunkMesh.count++;
    this.figMesh.count++;
  }

  addShrub(x, z, scale = 1) {
    if (this.shrubMesh.count >= this.maxInstances) return;
    const count = this.shrubMesh.count;

    this.dummy.position.set(x, 0, z);
    this.dummy.scale.set(scale, scale, scale);
    this.dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.dummy.updateMatrix();

    this.shrubMesh.setMatrixAt(count, this.dummy.matrix);
    this.shrubMesh.count++;
  }

  populateCity(regions, buildings, streets) {
    this.init();

    const isNearBuilding = (x, z, pad = 8) => {
      for (const b of buildings) {
        const halfW = (b.w || 12) / 2 + pad;
        const halfD = (b.d || 12) / 2 + pad;
        if (x >= b.x - halfW && x <= b.x + halfW && z >= b.z - halfD && z <= b.z + halfD) {
          return true;
        }
      }
      return false;
    };

    // 1. Academy Grove (Dense ancient olive orchard)
    for (let i = 0; i < (this.isMobile ? 40 : 85); i++) {
      const gx = 500 + (Math.random() - 0.5) * 110;
      const gz = 600 + (Math.random() - 0.5) * 75;
      if (!isNearBuilding(gx, gz, 4)) {
        this.addOlive(gx, gz, 0.9 + Math.random() * 0.4);
      }
    }

    // 2. Kerameikos Cemetery (Cypress trees guarding tombs)
    for (let i = 0; i < (this.isMobile ? 25 : 55); i++) {
      const cx = 430 + (Math.random() - 0.5) * 90;
      const cz = 210 + (Math.random() - 0.5) * 120;
      if (!isNearBuilding(cx, cz, 4)) {
        this.addCypress(cx, cz, 0.85 + Math.random() * 0.4);
      }
    }

    // 3. Ilissos River Banks & Kallirrhoe Spring (Figs, shrubs & plane trees)
    for (let i = 0; i < (this.isMobile ? 35 : 70); i++) {
      const t = Math.random();
      const rx = -380 + t * 280 + (Math.random() - 0.5) * 30;
      const rz = 140 + t * 60 + (Math.random() - 0.5) * 30;
      if (!isNearBuilding(rx, rz, 4)) {
        if (Math.random() > 0.4) {
          this.addFig(rx, rz, 0.8 + Math.random() * 0.4);
        } else {
          this.addShrub(rx, rz, 0.7 + Math.random() * 0.6);
        }
      }
    }

    // 4. Pnyx & Areopagus slopes (Dry shrubs & rocky olive trees)
    for (let i = 0; i < (this.isMobile ? 30 : 65); i++) {
      const px = -260 + (Math.random() - 0.5) * 140;
      const pz = -120 + (Math.random() - 0.5) * 160;
      if (!isNearBuilding(px, pz, 6)) {
        if (Math.random() > 0.5) {
          this.addOlive(px, pz, 0.75 + Math.random() * 0.3);
        } else {
          this.addShrub(px, pz, 0.6 + Math.random() * 0.7);
        }
      }
    }

    // 5. Civic-core borders and street corners
    for (let i = 0; i < (this.isMobile ? 20 : 45); i++) {
      const ax = 110 + (Math.random() - 0.5) * 260;
      const az = 10 + (Math.random() - 0.5) * 220;
      if (!isNearBuilding(ax, az, 10)) {
        this.addOlive(ax, az, 0.8 + Math.random() * 0.35);
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
