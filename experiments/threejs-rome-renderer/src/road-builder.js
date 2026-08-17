import { ANCIENT_MATERIALS } from '../../../frontend/ancient-world/assets/materials.js';

export const ROME_ROAD_RENDER_POLICY = Object.freeze({
  desktopPieceLength: 14,
  mobilePieceLength: 20,
  bedLift: 0.045,
  edgeLift: 0.022,
  edgeBandWidth: 0.16,
  edgeInset: 0.11,
});

function materialColor(THREE, rgb) {
  return new THREE.Color().setRGB(
    rgb[0],
    rgb[1],
    rgb[2],
    THREE.SRGBColorSpace,
  );
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

function pieceBasis(THREE, piece) {
  const direction = new THREE.Vector3(
    piece.x1 - piece.x0,
    piece.y1 - piece.y0,
    piece.z1 - piece.z0,
  );
  const length = direction.length() || 1;
  const xAxis = direction.clone().multiplyScalar(1 / length);
  const planarLength = Math.hypot(piece.x1 - piece.x0, piece.z1 - piece.z0) || 1;
  const zAxis = new THREE.Vector3(
    -(piece.z1 - piece.z0) / planarLength,
    0,
    (piece.x1 - piece.x0) / planarLength,
  );
  const yAxis = zAxis.clone().cross(xAxis).normalize();
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
  const midpoint = new THREE.Vector3(
    (piece.x0 + piece.x1) / 2,
    (piece.y0 + piece.y1) / 2,
    (piece.z0 + piece.z1) / 2,
  );
  return { length, quaternion, midpoint, yAxis, zAxis };
}

export function addInstancedRoads(THREE, scene, simulation, { mobile = false } = {}) {
  const pieces = createRoadPiecePlan({
    streets: simulation.streets,
    terrainHeightAt: simulation.terrainHeightAt,
    mobile,
  });
  if (!pieces.length) return { pieces: 0, drawLayers: 0, edgeInstances: 0 };

  // Production roads are flat terrain-following quads. Keep the same visual
  // model here: no box side faces, no curb-like thickness, and no per-piece
  // draw objects. The shared plane is instanced for all beds and edge bands.
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
    const { length, quaternion, midpoint, yAxis, zAxis } = pieceBasis(THREE, piece);

    scale.set(length, 1, piece.width);
    matrix.compose(midpoint, quaternion, scale);
    beds.setMatrixAt(index, matrix);

    const lateral = Math.max(
      0,
      piece.width / 2 - ROME_ROAD_RENDER_POLICY.edgeInset - ROME_ROAD_RENDER_POLICY.edgeBandWidth / 2,
    );
    for (const [sideIndex, side] of [-1, 1].entries()) {
      position.copy(midpoint)
        .addScaledVector(zAxis, lateral * side)
        .addScaledVector(yAxis, ROME_ROAD_RENDER_POLICY.edgeLift);
      scale.set(length, 1, ROME_ROAD_RENDER_POLICY.edgeBandWidth);
      matrix.compose(position, quaternion, scale);
      edges.setMatrixAt(index * 2 + sideIndex, matrix);
    }
  });

  beds.instanceMatrix.needsUpdate = true;
  edges.instanceMatrix.needsUpdate = true;
  beds.computeBoundingSphere();
  edges.computeBoundingSphere();
  beds.userData.roadBuilder = 'instanced-road-v2';
  beds.userData.benchmark = { pieces: pieces.length, drawLayers: 2, edgeInstances: pieces.length * 2 };
  edges.userData.roadBuilder = 'instanced-road-v2';
  scene.add(beds, edges);

  return beds.userData.benchmark;
}
