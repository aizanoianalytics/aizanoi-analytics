import * as THREE from '../../shared/vendor/three.module.js';
import { getMaterial } from '../../shared/assets/materials.js';
import {
  createDoricColumn,
  createSteps,
  createPediment,
} from '../../shared/assets/builders-common.js';

// --- Shared builders (single source of truth; local dupes removed in visual uplift v1) ---

// --- Builders ---

export function buildTemple(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;

    const isParthenon = b.id === 'parthenon';

    const wReal = b.w || (isParthenon ? 30.9 : 20);
    const dReal = b.d || (isParthenon ? 69.5 : 40);
    const colCountW = isParthenon ? 8 : Math.max(4, Math.floor(wReal / 3.5));
    const colCountD = isParthenon ? 17 : Math.max(6, Math.floor(dReal / 3.2));
    const colHeight = isParthenon ? 10.4 : (b.h || (wReal / colCountW) * 2);
    const colRadius = colHeight / 11;

    // Krepidoma
    const steps = createSteps(wReal + 2, dReal + 2, 3, 0.4);
    group.add(steps);
    const platformY = 1.2;

    // Peristyle columns — shared fluted Doric order (capitals included;
    // the old local InstancedMesh pipes had neither flutes nor capitals)
    const stepW = (wReal - colRadius * 4) / Math.max(1, colCountW - 1);
    const stepD = (dReal - colRadius * 4) / Math.max(1, colCountD - 1);

    const startX = -(wReal/2) + colRadius * 2;
    const startZ = -(dReal/2) + colRadius * 2;

    // Place perimeter columns
    for (let x = 0; x < colCountW; x++) {
        for (let z = 0; z < colCountD; z++) {
            if (x === 0 || x === colCountW - 1 || z === 0 || z === colCountD - 1) {
                const col = createDoricColumn(colHeight, colRadius, 'marble');
                col.position.set(startX + x * stepW, platformY, startZ + z * stepD);
                group.add(col);
            }
        }
    }

    // Architrave & Frieze
    const entablatureY = platformY + colHeight;
    const archGeo = new THREE.BoxGeometry(wReal, colHeight * 0.15, dReal);
    const arch = new THREE.Mesh(archGeo, getMaterial('marble'));
    arch.position.y = entablatureY + (colHeight * 0.15)/2;
    arch.castShadow = true;
    arch.receiveShadow = true;
    group.add(arch);

    // Triglyph frieze — the Doric signature: alternating blue-grooved blocks.
    // Cheap instanced rhythm, unmistakable at any distance.
    const triglyphMat = getMaterial('limestone');
    const trigGeo = new THREE.BoxGeometry(0.7, colHeight * 0.11, 0.35);
    const trigN = Math.max(8, Math.floor(wReal / 1.5));
    for (const fz of [-dReal / 2 - 0.1, dReal / 2 + 0.1]) {
        for (let i = 0; i < trigN; i++) {
            const t = new THREE.Mesh(trigGeo, triglyphMat);
            t.position.set(-wReal / 2 + 0.75 + i * ((wReal - 1.5) / Math.max(1, trigN - 1)), entablatureY + colHeight * 0.075, fz);
            group.add(t);
        }
    }

    // Cella
    const cellaW = wReal - colRadius * 8;
    const cellaD = dReal - colRadius * 12;
    if (cellaW > 0 && cellaD > 0) {
        const cellaGeo = new THREE.BoxGeometry(cellaW, colHeight, cellaD);
        const cella = new THREE.Mesh(cellaGeo, getMaterial('marble'));
        cella.position.y = platformY + colHeight/2;
        cella.castShadow = true;
        cella.receiveShadow = true;
        group.add(cella);
    }

    // Roof & Pediment (shared builders return ready Meshes)
    const pedHeight = wReal * 0.15;
    const ped = createPediment(wReal, dReal, pedHeight, 'marble');
    ped.position.y = entablatureY + colHeight * 0.15;
    group.add(ped);

    // Roof tiles
    const roof = createPediment(wReal + 1, dReal + 1, pedHeight + 0.2, 'roofTile');
    roof.position.y = entablatureY + colHeight * 0.15 - 0.1;
    group.add(roof);

    return group;
}

export function buildGateway(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const w = b.w || 30;
    const d = b.d || 16;
    const h = b.h || 12;

    const marbleMat = getMaterial('marble');

    // Mnesicles Propylaea: two solid flanking wings and an open central sacred passageway
    const wingW = Math.max(4, w * 0.28);
    const wingH = h * 0.75;
    const wingX = w / 2 - wingW / 2;

    // North wing (Pinakotheke)
    const leftWing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, d), marbleMat);
    leftWing.position.set(-wingX, wingH / 2, 0);
    leftWing.castShadow = true;
    leftWing.receiveShadow = true;
    group.add(leftWing);

    // South wing
    const rightWing = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, d), marbleMat);
    rightWing.position.set(wingX, wingH / 2, 0);
    rightWing.castShadow = true;
    rightWing.receiveShadow = true;
    group.add(rightWing);

    // Doric columns flanking the open central passageway (shared fluted order)
    const colH = wingH;
    const colR = 0.45;
    const portalHalfW = (w - 2 * wingW) / 2;
    for (const zOff of [-d / 2 + 1.2, d / 2 - 1.2]) {
        for (const sign of [-1, 1]) {
            const col = createDoricColumn(colH, colR, 'marble');
            col.position.set(sign * Math.max(1.5, portalHalfW - 1.0), 0, zOff);
            group.add(col);
        }
    }

    // Overhead monumental entablature spanning across the central portal (leaving ground open)
    const beamH = h - wingH;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w, beamH, d), marbleMat);
    beam.position.set(0, wingH + beamH / 2, 0);
    beam.castShadow = true;
    beam.receiveShadow = true;
    group.add(beam);

    // Classical pediment over the central gateway
    const pedHeight = Math.max(2, w * 0.12);
    const ped = createPediment(w, d, pedHeight, 'marble');
    ped.position.y = h;
    group.add(ped);

    return group;
}

export function buildStoa(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const w = b.w || 50;
    const d = b.d || 15;
    const h = b.h || 6;
    const marbleMat = getMaterial('marble');

    // Stepped floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), getMaterial('limestone'));
    floor.position.y = 0.25;
    floor.receiveShadow = true;
    group.add(floor);

    // Enclosing back wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.8), getMaterial('plaster'));
    backWall.position.set(0, h / 2 + 0.5, -d / 2 + 0.4);
    backWall.castShadow = true;
    group.add(backWall);

    // Side walls
    const sideWallGeo = new THREE.BoxGeometry(0.8, h, d);
    const leftWall = new THREE.Mesh(sideWallGeo, getMaterial('plaster'));
    leftWall.position.set(-w / 2 + 0.4, h / 2 + 0.5, 0);
    group.add(leftWall);

    const rightWall = new THREE.Mesh(sideWallGeo, getMaterial('plaster'));
    rightWall.position.set(w / 2 - 0.4, h / 2 + 0.5, 0);
    group.add(rightWall);

    // Front colonnade
    const colSpacing = 3.6;
    const numCols = Math.max(4, Math.floor((w - 4) / colSpacing));
    const colH = h - 0.6;
    const colR = 0.32;
    const actualSpacing = (w - 4) / (numCols - 1);
    for (let i = 0; i < numCols; i++) {
        const col = createDoricColumn(colH, colR, 'marble');
        col.position.set(-w / 2 + 2 + i * actualSpacing, 0.5, d / 2 - 1);
        group.add(col);
    }

    // Architrave across colonnade
    const arch = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, 1.4), marbleMat);
    arch.position.set(0, 0.5 + colH + 0.3, d / 2 - 1);
    group.add(arch);

    // Pitched terracotta roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.4, d + 1), getMaterial('roofTile'));
    roof.position.set(0, h + 0.7, 0);
    roof.castShadow = true;
    group.add(roof);

    return group;
}

export function buildTheatre(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const radius = (b.w || 80) / 2;

    // 1. Orchestra (circular dancing floor)
    const orchRadius = radius * 0.35;
    const orchGeo = new THREE.CylinderGeometry(orchRadius, orchRadius, 0.3, 32);
    const orch = new THREE.Mesh(orchGeo, getMaterial('marble'));
    orch.position.y = 0.15;
    orch.receiveShadow = true;
    group.add(orch);

    // Thymele (central altar)
    const thymele = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 1.0, 1.0, 16),
        getMaterial('limestone')
    );
    thymele.position.y = 0.5;
    group.add(thymele);

    // 2. Theatron cavea (tiered semi-circular stone seating rising up the hillside)
    const tierCount = 7;
    const stepH = 0.65;
    const stepW = (radius - orchRadius) / tierCount;
    for (let i = 0; i < tierCount; i++) {
        const innerR = orchRadius + i * stepW;
        const outerR = innerR + stepW;
        const tierGeo = new THREE.RingGeometry(innerR, outerR, 32, 1, 0, Math.PI);
        const tier = new THREE.Mesh(tierGeo, getMaterial('limestone'));
        tier.rotation.x = -Math.PI / 2;
        tier.position.y = 0.2 + (i + 1) * stepH;
        tier.receiveShadow = true;
        group.add(tier);

        const riserGeo = new THREE.CylinderGeometry(innerR, innerR, stepH, 32, 1, true, 0, Math.PI);
        const riser = new THREE.Mesh(riserGeo, getMaterial('limestone'));
        riser.position.y = 0.2 + (i + 0.5) * stepH;
        group.add(riser);
    }

    // 3. Skene (stage building behind the orchestra)
    const skeneW = radius * 1.1;
    const skeneD = 8;
    const skeneH = 5;
    const skene = new THREE.Mesh(
        new THREE.BoxGeometry(skeneW, skeneH, skeneD),
        getMaterial('limestone')
    );
    skene.position.set(0, skeneH / 2, -orchRadius - skeneD / 2);
    skene.castShadow = true;
    group.add(skene);

    return group;
}

export function buildRound(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const radius = (b.w || 15) / 2;
    const marbleMat = getMaterial('marble');
    const colHeight = 4.8;

    // 1. Stepped limestone base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 32), getMaterial('limestone'));
    base.position.y = 0.5;
    base.receiveShadow = true;
    group.add(base);

    // 2. Peristyle of Doric marble columns physically supporting the roof
    const colCount = 16;
    const colRadius = 0.28;
    const ringR = radius * 0.82;
    for (let i = 0; i < colCount; i++) {
        const theta = (i / colCount) * Math.PI * 2;
        const col = createDoricColumn(colHeight, colRadius, 'marble');
        col.position.set(Math.cos(theta) * ringR, 1, Math.sin(theta) * ringR);
        group.add(col);
    }

    // 3. Interior circular cella wall
    const cellaGeo = new THREE.CylinderGeometry(radius * 0.65, radius * 0.65, colHeight, 32, 1, true);
    const cella = new THREE.Mesh(cellaGeo, getMaterial('plaster'));
    cella.position.y = 1 + colHeight / 2;
    group.add(cella);

    // 4. Circular marble entablature ring
    const entGeo = new THREE.CylinderGeometry(radius * 0.95, radius * 0.95, 0.6, 32);
    const ent = new THREE.Mesh(entGeo, marbleMat);
    ent.position.y = 1 + colHeight + 0.3;
    ent.castShadow = true;
    group.add(ent);

    // 5. Conical terracotta roof securely anchored to entablature
    const roof = new THREE.Mesh(new THREE.ConeGeometry(radius * 1.05, 3.2, 32), getMaterial('roofTile'));
    roof.position.y = 1 + colHeight + 0.6 + 1.6;
    roof.castShadow = true;
    group.add(roof);

    return group;
}

export function buildBuilding(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const w = b.w || 10;
    const d = b.d || 15;
    const h = 5;

    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), getMaterial('plaster'));
    box.position.y = h/2;
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);

    return group;
}

export function buildWall(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const w = b.w || 10;
    const h = b.h || 8;
    const d = b.d || 4;

    // Heavy ashlar stone curtain wall
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), getMaterial('limestone'));
    wallMesh.position.y = h / 2;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    group.add(wallMesh);

    // Parapet Walkway with Crenellations (merlons) along outer edge
    const merlonWidth = 1.2;
    const merlonHeight = 1.4;
    const merlonCount = Math.max(2, Math.floor(w / 3.0));
    for (let i = 0; i < merlonCount; i++) {
        const mx = -w / 2 + (i + 0.5) * (w / merlonCount);
        const merlon = new THREE.Mesh(new THREE.BoxGeometry(merlonWidth, merlonHeight, 0.6), getMaterial('limestone'));
        merlon.position.set(mx, h + merlonHeight / 2, -d / 2 + 0.3);
        merlon.castShadow = true;
        group.add(merlon);
    }

    return group;
}

export function buildGate(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const w = b.w || 25;
    const h = b.h || 12;
    const d = b.d || 16;

    // Monumental Dipylon Gateway with Twin Defensive Towers
    const towerW = w * 0.32;
    const towerD = d;
    const towerH = h + 3.0;

    // Left Tower
    const leftTower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerD), getMaterial('limestone'));
    leftTower.position.set(-w / 2 + towerW / 2, towerH / 2, 0);
    leftTower.castShadow = true;
    leftTower.receiveShadow = true;
    group.add(leftTower);

    // Right Tower
    const rightTower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerD), getMaterial('limestone'));
    rightTower.position.set(w / 2 - towerW / 2, towerH / 2, 0);
    rightTower.castShadow = true;
    rightTower.receiveShadow = true;
    group.add(rightTower);

    // Central Arched Passage Lintel & Portal Wall
    const portalW = w - (towerW * 2);
    const portalH = h * 0.85;
    const portalWall = new THREE.Mesh(new THREE.BoxGeometry(portalW, h - portalH, d * 0.8), getMaterial('limestone'));
    portalWall.position.set(0, portalH + (h - portalH) / 2, 0);
    portalWall.castShadow = true;
    group.add(portalWall);

    // Tower Battlements (Merlons atop both towers)
    for (const tx of [-w / 2 + towerW / 2, w / 2 - towerW / 2]) {
        for (let mz = -towerD / 2 + 1; mz <= towerD / 2 - 1; mz += 2.5) {
            const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 1.2), getMaterial('limestone'));
            merlon.position.set(tx, towerH + 0.6, mz);
            merlon.castShadow = true;
            group.add(merlon);
        }
    }

    return group;
}

export function buildRock(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const geo = new THREE.DodecahedronGeometry(b.w || 10, 1);
    const mesh = new THREE.Mesh(geo, getMaterial('poros'));
    mesh.position.y = (b.w || 10) / 2;
    group.add(mesh);
    return group;
}

export function buildStatue(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;

    const ped = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), getMaterial('marble'));
    ped.position.y = 1;
    group.add(ped);

    const stat = new THREE.Mesh(new THREE.CapsuleGeometry(1, 4, 4, 8), getMaterial('bronze'));
    stat.position.y = 5;
    group.add(stat);

    return group;
}

export function buildBridge(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const box = new THREE.Mesh(new THREE.BoxGeometry(b.w || 20, 2, b.d || 5), getMaterial('limestone'));
    box.position.y = 1;
    group.add(box);
    return group;
}

export function buildForum(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(b.w || 40, 0.2, b.d || 40), getMaterial('road'));
    floor.position.y = 0.1;
    group.add(floor);
    return group;
}

export function buildGrove(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const box = new THREE.Mesh(new THREE.BoxGeometry(b.w || 20, 0.1, b.d || 20), getMaterial('ground'));
    group.add(box);
    return group;
}

export function buildCemetery(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const base = new THREE.Mesh(new THREE.BoxGeometry(b.w || 20, 0.2, b.d || 20), getMaterial('ground'));
    group.add(base);
    return group;
}

export function buildSanctuary(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const altar = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2), getMaterial('marble'));
    altar.position.y = 1;
    group.add(altar);
    return group;
}

export function buildHarbour(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const dock = new THREE.Mesh(new THREE.BoxGeometry(b.w || 50, 1, b.d || 10), getMaterial('limestone'));
    dock.position.y = 0.5;
    group.add(dock);
    return group;
}

export function buildNeoria(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const shed = new THREE.Mesh(new THREE.BoxGeometry(b.w || 10, 5, b.d || 40), getMaterial('wood'));
    shed.position.y = 2.5;
    group.add(shed);
    return group;
}

export function buildShop(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const box = new THREE.Mesh(new THREE.BoxGeometry(b.w || 8, 4, b.d || 8), getMaterial('plasterAged'));
    box.position.y = 2;
    group.add(box);
    return group;
}

export function buildUrbanFabric(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const box = new THREE.Mesh(new THREE.BoxGeometry(b.w || 12, 5, b.d || 12), getMaterial('plaster'));
    box.position.y = 2.5;
    group.add(box);
    return group;
}

export function buildHero(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const shrine = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 3), getMaterial('marble'));
    shrine.position.y = 2;
    group.add(shrine);
    return group;
}

export function buildStructure(building) {
    switch(building.type) {
        case 'temple': return buildTemple(building);
        case 'gateway': return buildGateway(building);
        case 'stoa': return buildStoa(building);
        case 'theatre': return buildTheatre(building);
        case 'round': return buildRound(building);
        case 'wall': return buildWall(building);
        case 'gate': return buildGate(building);
        case 'rock': return buildRock(building);
        case 'statue': return buildStatue(building);
        case 'bridge': return buildBridge(building);
        case 'forum': return buildForum(building);
        case 'grove': return buildGrove(building);
        case 'cemetery': return buildCemetery(building);
        case 'sanctuary': return buildSanctuary(building);
        case 'harbour': return buildHarbour(building);
        case 'neoria': return buildNeoria(building);
        case 'shop': return buildShop(building);
        case 'urbanFabric': return buildUrbanFabric(building);
        case 'urban-fabric': return buildUrbanFabric(building);
        case 'hero': return buildHero(building);
        case 'road': return buildForum(building);
        case 'porch': return buildSanctuary(building);
        case 'altar': return buildSanctuary(building);
        case 'hill': return buildRock(building);
        case 'building':
        default: return buildBuilding(building);
    }
}
