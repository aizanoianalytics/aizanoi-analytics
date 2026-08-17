import { ANCIENT_MATERIALS } from '../../../frontend/ancient-world/assets/materials.js';

export const ROME_ROAD_RENDER_POLICY = Object.freeze({
  desktopPieceLength: 14,
  mobilePieceLength: 20,
  bedLift: 0.055,
  edgeLift: 0.028,
  edgeBandWidth: 0.16,
  edgeInset: 0.11,
});

export const ROME_ROAD_VISUAL_RESPONSE = Object.freeze({
  red: 0.72,
  green: 0.93,
  blue: 1.44,
});

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function normalize3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function compensatedRoadRgb(rgb) {
  if (!Array.isArray(rgb) || rgb.length < 3) throw new TypeError('compensatedRoadRgb requires an RGB array.');
  return [
    clamp01(rgb[0] * ROME_ROAD_VISUAL_RESPONSE.red),
    clamp01(rgb[1] * ROME_ROAD_VISUAL_RESPONSE.green),
    clamp01(rgb[2] * ROME_ROAD_VISUAL_RESPONSE.blue),
  ];
}

function materialColor(THREE, rgb) {
  const tuned = compensatedRoadRgb(rgb);
  return new THREE.Color().setRGB(tuned[0], tuned[1], tuned[2], THREE.SRGBColorSpace);
}

export function createRoadPiecePlan({ streets, terrainHeightAt, mobile = false }) {
  if (!Array.isArray(streets)) throw new TypeError('createRoadPiecePlan requires a streets array.');
  if (typeof terrainHeightAt !== 'function') throw new TypeError('createRoadPiecePlan requires terrainHeightAt.');

  const maxPieceLength = mobile
    ? ROME_ROAD_RENDER_POLICY.mobilePieceLength
    : ROME_ROAD_RENDER_POLICY.desktopPieceLength;
  const pieces = [];

  for (const road of streets) {
    for (let index = 1; index < road.points.length; index++) {
      const a = road.points[index - 1];
      const b = road.points[index];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const planarLength = Math.hypot(dx, dz) || 1;
      const subdivisions = Math.max(1, Math.ceil(planarLength / maxPieceLength));

      for (let piece = 0; piece < subdivisions; piece++) {
        const t0 = piece / subdivisions;
        const t1 = (piece + 1) / subdivisions;
        const x0 = a[0] + dx * t0;
        const z0 = a[1] + dz * t0;
        const x1 = a[0] + dx * t1;
        const z1 = a[1] + dz * t1;
        pieces.push({
          roadId: road.id,
          width: road.width,
          x0,
          z0,
          x1,
          z1,
          y0: terrainHeightAt(x0, z0) + ROME_ROAD_RENDER_POLICY.bedLift,
          y1: terrainHeightAt(x1, z1) + ROME_ROAD_RENDER_POLICY.bedLift,
        });
      }
    }
  }

  return pieces;
}

export function createRoadTangentFrame(piece, { terrainHeightAt, terrainNormalAt }) {
  if (typeof terrainHeightAt !== 'function' || typeof terrainNormalAt !== 'function') {
    throw new TypeError('createRoadTangentFrame requires terrain height and normal functions.');
  }

  const dx = piece.x1 - piece.x0;
  const dz = piece.z1 - piece.z0;
  const planarLength = Math.hypot(dx, dz) || 1;
  const midX = (piece.x0 + piece.x1) / 2;
  const midZ = (piece.z0 + piece.z1) / 2;
  const normal = normalize3(terrainNormalAt(midX, midZ));
  const planDirection = [dx / planarLength, 0, dz / planarLength];
  const alignment = planDirection[0] * normal[0] + planDirection[2] * normal[2];
  const tangentX = normalize3([
    planDirection[0] - normal[0] * alignment,
    -normal[1] * alignment,
    planDirection[2] - normal[2] * alignment,
  ]);
  const tangentZ = normalize3(cross3(tangentX, normal));
  const tangentXHorizontal = Math.hypot(tangentX[0], tangentX[2]) || 1;
  const tangentZHorizontal = Math.hypot(tangentZ[0], tangentZ[2]) || 1;
  const groundY = terrainHeightAt(midX, midZ);
  const center = [
    midX + normal[0] * ROME_ROAD_RENDER_POLICY.bedLift,
    groundY + normal[1] * ROME_ROAD_RENDER_POLICY.bedLift,
    midZ + normal[2] * ROME_ROAD_RENDER_POLICY.bedLift,
  ];

  return {
    center,
    tangentX,
    normal,
    tangentZ,
    surfaceLength: planarLength / tangentXHorizontal,
    surfaceWidth: piece.width / tangentZHorizontal,
    lateralScale: 1 / tangentZHorizontal,
  };
}

export function roadPlaneHeightAt(frame, x, z) {
  const [nx, ny, nz] = frame.normal;
  const [cx, cy, cz] = frame.center;
  if (Math.abs(ny) < 1e-6) return cy;
  return cy - (nx * (x - cx) + nz * (z - cz)) / ny;
}

function pieceBasis(THREE, piece, simulation) {
  const frame = createRoadTangentFrame(piece, simulation);
  const xAxis = new THREE.Vector3(...frame.tangentX);
  const yAxis = new THREE.Vector3(...frame.normal);
  const zAxis = new THREE.Vector3(...frame.tangentZ);
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  return {
    ...frame,
    quaternion: new THREE.Quaternion().setFromRotationMatrix(basis),
    midpoint: new THREE.Vector3(...frame.center),
    yAxis,
    zAxis,
  };
}

export function addInstancedRoads(THREE, scene, simulation, { mobile = false } = {}) {
  const pieces = createRoadPiecePlan({
    streets: simulation.streets,
    terrainHeightAt: simulation.terrainHeightAt,
    mobile,
  });
  if (!pieces.length) return { pieces: 0, drawLayers: 0, edgeInstances: 0 };
  if (typeof simulation.terrainNormalAt !== 'function') throw new TypeError('Rome road rendering requires terrainNormalAt.');

  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const bedMaterial = new THREE.MeshStandardMaterial({
    color: materialColor(THREE, ANCIENT_MATERIALS.road),
    roughness: 1,
    metalness: 0,
  });
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: materialColor(THREE, ANCIENT_MATERIALS.roadEdge),
    roughness: 1,
    metalness: 0,
  });

  const beds = new THREE.InstancedMesh(geometry, bedMaterial, pieces.length);
  beds.name = 'Terrain-following Roman road beds';
  const edges = new THREE.InstancedMesh(geometry, edgeMaterial, pieces.length * 2);
  edges.name = 'Roman road edge bands';

  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();

  pieces.forEach((piece, index) => {
    const frame = pieceBasis(THREE, piece, simulation);

    scale.set(frame.surfaceLength, 1, frame.surfaceWidth);
    matrix.compose(frame.midpoint, frame.quaternion, scale);
    beds.setMatrixAt(index, matrix);

    const lateral = Math.max(
      0,
      piece.width / 2 - ROME_ROAD_RENDER_POLICY.edgeInset - ROME_ROAD_RENDER_POLICY.edgeBandWidth / 2,
    ) * frame.lateralScale;
    for (const [sideIndex, side] of [-1, 1].entries()) {
      position.copy(frame.midpoint)
        .addScaledVector(frame.zAxis, lateral * side)
        .addScaledVector(frame.yAxis, ROME_ROAD_RENDER_POLICY.edgeLift);
      scale.set(
        frame.surfaceLength,
        1,
        ROME_ROAD_RENDER_POLICY.edgeBandWidth * frame.lateralScale,
      );
      matrix.compose(position, frame.quaternion, scale);
      edges.setMatrixAt(index * 2 + sideIndex, matrix);
    }
  });

  beds.instanceMatrix.needsUpdate = true;
  edges.instanceMatrix.needsUpdate = true;
  beds.computeBoundingSphere();
  edges.computeBoundingSphere();
  beds.userData.roadBuilder = 'instanced-road-v4';
  beds.userData.benchmark = { pieces: pieces.length, drawLayers: 2, edgeInstances: pieces.length * 2 };
  edges.userData.roadBuilder = 'instanced-road-v4';
  scene.add(beds, edges);

  return beds.userData.benchmark;
}
