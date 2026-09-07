import * as THREE from '../../shared/vendor/three.module.js';
import { getMaterial } from '../../shared/assets/materials.js';

// --- Helpers ---

function createFlutedCylinder(height, radius, flutes, segments) {
    const geometry = new THREE.CylinderGeometry(radius * 0.8, radius, height, segments, 1);
    // Approximate flutes by using fewer segments or a custom shape. Here we use basic cylinder 
    // for performance but a real application might use a custom buffer geometry.
    return geometry;
}

function createDoricColumn(height, radius) {
    const group = new THREE.Group();
    const shaftMat = getMaterial('marble');
    
    // Shaft with entasis (approximated here by taper)
    const shaftGeo = createFlutedCylinder(height * 0.9, radius, 20, 16);
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.y = height * 0.45;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    group.add(shaft);

    // Capital
    const echinusGeo = new THREE.ConeGeometry(radius * 1.2, height * 0.05, 16);
    const echinus = new THREE.Mesh(echinusGeo, shaftMat);
    echinus.position.y = height * 0.925;
    echinus.castShadow = true;
    echinus.receiveShadow = true;
    group.add(echinus);

    const abacusGeo = new THREE.BoxGeometry(radius * 2.5, height * 0.05, radius * 2.5);
    const abacus = new THREE.Mesh(abacusGeo, shaftMat);
    abacus.position.y = height * 0.975;
    abacus.castShadow = true;
    abacus.receiveShadow = true;
    group.add(abacus);

    return group;
}

function createIonicColumn(height, radius) {
    const group = new THREE.Group();
    const mat = getMaterial('marble');

    // Base
    const baseGeo = new THREE.TorusGeometry(radius * 1.1, radius * 0.3, 8, 16);
    const base = new THREE.Mesh(baseGeo, mat);
    base.rotation.x = Math.PI / 2;
    base.position.y = radius * 0.3;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Shaft
    const shaftGeo = createFlutedCylinder(height * 0.85, radius, 24, 16);
    const shaft = new THREE.Mesh(shaftGeo, mat);
    shaft.position.y = radius * 0.6 + height * 0.425;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    group.add(shaft);

    // Capital
    const capGeo = new THREE.BoxGeometry(radius * 2.5, height * 0.05, radius * 2);
    const cap = new THREE.Mesh(capGeo, mat);
    cap.position.y = height - (height * 0.025);
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);

    return group;
}

function createSteps(width, depth, count, stepHeight) {
    const group = new THREE.Group();
    const mat = getMaterial('limestone');
    
    for (let i = 0; i < count; i++) {
        const w = width - (i * stepHeight * 2);
        const d = depth - (i * stepHeight * 2);
        const geo = new THREE.BoxGeometry(w, stepHeight, d);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = stepHeight / 2 + (i * stepHeight);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
    }
    return group;
}

function createPediment(width, depth, height) {
    const shape = new THREE.Shape();
    shape.moveTo(-width/2, 0);
    shape.lineTo(width/2, 0);
    shape.lineTo(0, height);
    shape.lineTo(-width/2, 0);

    const extrudeSettings = { depth: depth, bevelEnabled: false };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.translate(0, 0, -depth/2);
    return geo;
}

// --- Builders ---

export function buildTemple(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;

    const isParthenon = b.id === 'parthenon';
    
    const wReal = isParthenon ? 30.9 : (b.w || 20);
    const dReal = isParthenon ? 69.5 : (b.d || 40);
    const colCountW = isParthenon ? 8 : (Math.floor(wReal / 5) > 4 ? Math.floor(wReal / 5) : 6);
    const colCountD = isParthenon ? 17 : (colCountW * 2 + 1);
    const colHeight = isParthenon ? 10.4 : (b.h || (wReal / colCountW) * 2);
    const colRadius = colHeight / 11;
    
    // Krepidoma
    const steps = createSteps(wReal + 2, dReal + 2, 3, 0.4);
    group.add(steps);
    const platformY = 1.2;

    // Peristyle Columns (InstancedMesh for performance)
    const colGeo = new THREE.CylinderGeometry(colRadius*0.8, colRadius, colHeight, 16);
    const colMat = getMaterial('marble');
    const colCount = (colCountW * 2) + ((colCountD - 2) * 2);
    const iMesh = new THREE.InstancedMesh(colGeo, colMat, colCount);
    iMesh.castShadow = true;
    iMesh.receiveShadow = true;
    
    let idx = 0;
    const dummy = new THREE.Object3D();
    
    const stepW = (wReal - colRadius * 4) / (colCountW - 1);
    const stepD = (dReal - colRadius * 4) / (colCountD - 1);
    
    const startX = -(wReal/2) + colRadius * 2;
    const startZ = -(dReal/2) + colRadius * 2;

    // Place perimeter columns
    for (let x = 0; x < colCountW; x++) {
        for (let z = 0; z < colCountD; z++) {
            if (x === 0 || x === colCountW - 1 || z === 0 || z === colCountD - 1) {
                dummy.position.set(startX + x * stepW, platformY + colHeight/2, startZ + z * stepD);
                dummy.updateMatrix();
                iMesh.setMatrixAt(idx++, dummy.matrix);
            }
        }
    }
    group.add(iMesh);

    // Architrave & Frieze
    const entablatureY = platformY + colHeight;
    const archGeo = new THREE.BoxGeometry(wReal, colHeight * 0.15, dReal);
    const arch = new THREE.Mesh(archGeo, getMaterial('marble'));
    arch.position.y = entablatureY + (colHeight * 0.15)/2;
    arch.castShadow = true;
    arch.receiveShadow = true;
    group.add(arch);

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

    // Roof & Pediment
    const pedHeight = wReal * 0.15;
    const pedGeo = createPediment(wReal, dReal, pedHeight);
    const pedMat = getMaterial('marble');
    const ped = new THREE.Mesh(pedGeo, pedMat);
    ped.position.y = entablatureY + colHeight * 0.15;
    ped.castShadow = true;
    ped.receiveShadow = true;
    group.add(ped);
    
    // Roof tiles
    const roofGeo = createPediment(wReal + 1, dReal + 1, pedHeight + 0.2);
    const roofMat = getMaterial('roofTile');
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = entablatureY + colHeight * 0.15 - 0.1;
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);

    return group;
}

export function buildGateway(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const w = b.w || 30;
    const d = b.d || 20;
    
    const wallGeo = new THREE.BoxGeometry(w, 10, d);
    const wall = new THREE.Mesh(wallGeo, getMaterial('marble'));
    wall.position.y = 5;
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
    
    return group;
}

export function buildStoa(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const w = b.w || 50;
    const d = b.d || 15;
    
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), getMaterial('limestone'));
    floor.position.y = 0.25;
    group.add(floor);
    
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, 6, 1), getMaterial('plaster'));
    backWall.position.set(0, 3, -d/2 + 0.5);
    group.add(backWall);
    
    return group;
}

export function buildTheatre(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const radius = b.w || 40;
    
    const orchGeo = new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, 0.2, 32);
    const orch = new THREE.Mesh(orchGeo, getMaterial('ground'));
    orch.position.y = 0.1;
    group.add(orch);
    
    return group;
}

export function buildRound(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const radius = (b.w || 15) / 2;
    
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 32), getMaterial('limestone'));
    base.position.y = 0.5;
    group.add(base);
    
    const roof = new THREE.Mesh(new THREE.ConeGeometry(radius * 1.1, 5, 32), getMaterial('roofTile'));
    roof.position.y = 6;
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
    const box = new THREE.Mesh(new THREE.BoxGeometry(b.w || 10, 8, b.d || 4), getMaterial('limestone'));
    box.position.y = 4;
    group.add(box);
    return group;
}

export function buildGate(b) {
    const group = new THREE.Group();
    group.userData.buildingId = b.id;
    const box = new THREE.Mesh(new THREE.BoxGeometry(b.w || 15, 12, b.d || 8), getMaterial('limestone'));
    box.position.y = 6;
    group.add(box);
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
