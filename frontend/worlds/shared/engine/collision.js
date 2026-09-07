/**
 * collision.js — Spatial Grid Collision System
 * Athens 450-430 BCE · AAA Rebuild
 *
 * Features:
 *  - 2D spatial hash grid for O(1) broad-phase lookup
 *  - Capsule collider for player (radius + height)
 *  - Sub-stepped movement to prevent tunneling
 *  - Axis-aligned wall sliding
 *  - Step-up/step-down for stairs and curbs
 *  - Gravity and ground detection
 *  - Walkable surface management (bridges, podiums, platforms)
 */

import * as THREE from '../vendor/three.module.js';

/* ── Constants ────────────────────────────────────────────── */

const CELL_SIZE = 40;           // Grid cell size (world units)
const PLAYER_RADIUS = 0.5;     // Capsule radius
const PLAYER_HEIGHT = 1.7;     // Eye height
const SUBSTEP_SIZE = 0.16;     // Max movement per substep
const STEP_UP_MAX = 0.46;      // Max step-up height
const STEP_DOWN_MAX = 0.62;    // Max step-down height
const GRAVITY = 30;            // Gravity acceleration (units/s²)
const GROUND_Y = 0;            // Default ground level

/* ── Spatial hash grid ────────────────────────────────────── */

class SpatialGrid {
  constructor(cellSize = CELL_SIZE) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  _key(ix, iz) {
    return `${ix},${iz}`;
  }

  _cellIndices(x, z) {
    return [
      Math.floor(x / this.cellSize),
      Math.floor(z / this.cellSize),
    ];
  }

  /**
   * Insert a collider into the grid.
   * Collider: { x, z, w, d, h, y?, type: 'rect'|'walkRect'|'walkDisk'|'walkRamp' }
   */
  insert(collider) {
    const rot = collider.rot || 0;
    const w = collider.w || 0;
    const d = collider.d || collider.w || 0;

    // Accurate rotated 2D bounding extents
    const cos = Math.abs(Math.cos(rot));
    const sin = Math.abs(Math.sin(rot));
    const halfW = (w / 2) * cos + (d / 2) * sin + PLAYER_RADIUS;
    const halfD = (w / 2) * sin + (d / 2) * cos + PLAYER_RADIUS;

    const [minIX, minIZ] = this._cellIndices(collider.x - halfW, collider.z - halfD);
    const [maxIX, maxIZ] = this._cellIndices(collider.x + halfW, collider.z + halfD);

    for (let ix = minIX; ix <= maxIX; ix++) {
      for (let iz = minIZ; iz <= maxIZ; iz++) {
        const key = this._key(ix, iz);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(collider);
      }
    }
  }

  /**
   * Query all colliders near a point.
   */
  query(x, z) {
    const [ix, iz] = this._cellIndices(x, z);
    const result = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = this.cells.get(this._key(ix + dx, iz + dz));
        if (cell) result.push(...cell);
      }
    }
    return result;
  }

  clear() {
    this.cells.clear();
  }
}

/* ── Collision system ─────────────────────────────────────── */

export class CollisionSystem {
  constructor() {
    this.grid = new SpatialGrid(CELL_SIZE);
    this.walkSurfaces = [];        // Elevated walkable surfaces
    this.playerY = GROUND_Y;       // Current player Y
    this.playerVelocityY = 0;      // Vertical velocity
    this.onGround = true;
    this.bounds = null;             // World boundary { minX, maxX, minZ, maxZ }
  }

  /* ── Build from city data ─────────────────────────────── */

  /**
   * Populate collision grid from buildings and streets.
   * @param {Array} buildings - BUILDINGS array
   * @param {Array} streets - STREETS array
   * @param {object} bounds - BOUNDS object
   */
  buildFromData(buildings, streets, bounds) {
    this.grid.clear();
    this.walkSurfaces = [];
    this.bounds = bounds;

    for (const b of buildings) {
      if (b.noCollision) continue;
      if (b.h <= 0) continue;

      // 1. Open public gathering spaces & outdoor pavements — completely open to traverse
      if (['forum', 'plaza', 'road', 'grove', 'cemetery', 'harbour', 'apron', 'forecourt', 'sanctuary'].includes(b.type)) {
        continue;
      }

      // 2. City Gates & Monumental Gateways: flanking towers collide, central portal is open!
      if (b.type === 'gate' || b.type === 'gateway') {
        const rot = b.rot || 0;
        const towerW = Math.max(3, b.w * 0.28);
        const towerD = b.d;
        const offsetX = (b.w / 2 - towerW / 2);
        
        // Left tower
        this.grid.insert({
          type: 'rect', id: `${b.id}-left`,
          x: b.x - offsetX * Math.cos(rot),
          z: b.z - offsetX * Math.sin(rot),
          w: towerW, d: towerD, h: b.h, y: b.y || 0, rot
        });
        // Right tower
        this.grid.insert({
          type: 'rect', id: `${b.id}-right`,
          x: b.x + offsetX * Math.cos(rot),
          z: b.z + offsetX * Math.sin(rot),
          w: towerW, d: towerD, h: b.h, y: b.y || 0, rot
        });
        continue;
      }

      // 3. Colonnaded ceremonial street: twin colonnade side walls, central street open
      if (b.id === 'colonnaded-street' || (b.type === 'stoa' && b.id.includes('street'))) {
        const colonnadeW = 5.0;
        const halfW = b.w / 2;
        const rot = b.rot || 0;
        // West colonnade wall
        this.grid.insert({
          type: 'rect', id: `${b.id}-west`,
          x: b.x - (halfW - colonnadeW / 2) * Math.cos(rot),
          z: b.z - (halfW - colonnadeW / 2) * Math.sin(rot),
          w: colonnadeW, d: b.d, h: b.h, y: b.y || 0, rot
        });
        // East colonnade wall
        this.grid.insert({
          type: 'rect', id: `${b.id}-east`,
          x: b.x + (halfW - colonnadeW / 2) * Math.cos(rot),
          z: b.z + (halfW - colonnadeW / 2) * Math.sin(rot),
          w: colonnadeW, d: b.d, h: b.h, y: b.y || 0, rot
        });
        continue;
      }

      // 4. Airport Grand Terminal: hollow perimeter with central curbside entrance opening
      if (b.type === 'terminal') {
        const wallThick = 2.5;
        const halfW = b.w / 2;
        const halfD = b.d / 2;
        const doorW = 50; // Central curbside passenger entrance
        
        // North wall (apron side)
        this.grid.insert({
          type: 'rect', id: `${b.id}-wall-n`,
          x: b.x, z: b.z + halfD,
          w: b.w, d: wallThick, h: b.h, y: b.y || 0
        });
        // South wall left wing
        const southWingW = (b.w - doorW) / 2;
        this.grid.insert({
          type: 'rect', id: `${b.id}-wall-s-l`,
          x: b.x - doorW / 2 - southWingW / 2, z: b.z - halfD,
          w: southWingW, d: wallThick, h: b.h, y: b.y || 0
        });
        // South wall right wing
        this.grid.insert({
          type: 'rect', id: `${b.id}-wall-s-r`,
          x: b.x + doorW / 2 + southWingW / 2, z: b.z - halfD,
          w: southWingW, d: wallThick, h: b.h, y: b.y || 0
        });
        // West wall
        this.grid.insert({
          type: 'rect', id: `${b.id}-wall-w`,
          x: b.x - halfW, z: b.z,
          w: wallThick, d: b.d, h: b.h, y: b.y || 0
        });
        // East wall
        this.grid.insert({
          type: 'rect', id: `${b.id}-wall-e`,
          x: b.x + halfW, z: b.z,
          w: wallThick, d: b.d, h: b.h, y: b.y || 0
        });
        continue;
      }

      // 5. Check-in Islands: individual counter colliders leaving aisles free
      if (b.type === 'checkin') {
        const numRows = 4;
        const rowSpacing = b.d / (numRows + 1);
        for (let r = 1; r <= numRows; r++) {
          const rowZ = b.z - b.d / 2 + r * rowSpacing;
          this.grid.insert({
            type: 'rect', id: `${b.id}-row-${r}`,
            x: b.x, z: rowZ,
            w: b.w * 0.85, d: 3.8, h: 2.2, y: b.y || 0
          });
        }
        continue;
      }

      // 3. Bridges: walkable deck surface on top + side parapet walls to prevent falling
      if (b.type === 'bridge') {
        const deckHeight = b.h || 4;
        this.walkSurfaces.push({
          type: 'walkRect',
          x: b.x, z: b.z,
          w: b.w + 2, d: b.d + 2,
          y: deckHeight
        });
        const paraThick = 0.8;
        const rot = b.rot || 0;
        const offsetZ = (b.d / 2 - paraThick / 2);
        this.grid.insert({
          type: 'rect', id: `${b.id}-parapet-1`,
          x: b.x - offsetZ * Math.sin(rot),
          z: b.z + offsetZ * Math.cos(rot),
          w: b.w, d: paraThick, h: deckHeight + 1.2, y: deckHeight, rot
        });
        this.grid.insert({
          type: 'rect', id: `${b.id}-parapet-2`,
          x: b.x + offsetZ * Math.sin(rot),
          z: b.z - offsetZ * Math.cos(rot),
          w: b.w, d: paraThick, h: deckHeight + 1.2, y: deckHeight, rot
        });
        continue;
      }

      // 4. Temples: stepped stylobate is walkable, interior cella core has collision
      if (b.type === 'temple') {
        const stylobateHeight = 1.2;
        this.walkSurfaces.push({
          type: 'walkRect',
          x: b.x, z: b.z,
          w: b.w, d: b.d,
          y: stylobateHeight
        });
        // Cella inner block (allowing walking between peristyle columns)
        const cellaW = b.w * 0.52;
        const cellaD = b.d * 0.62;
        this.grid.insert({
          type: 'rect', id: `${b.id}-cella`,
          x: b.x, z: b.z,
          w: cellaW, d: cellaD,
          h: b.h, y: stylobateHeight, rot: b.rot || 0
        });
        continue;
      }

      // 5. Theatres & Stadia: stage building / scaena collides, orchestra/track is walkable
      if (b.type === 'theatre' || b.type === 'stadium') {
        const rot = b.rot || 0;
        this.grid.insert({
          type: 'rect', id: `${b.id}-scaena`,
          x: b.x, z: b.z - b.d * 0.35,
          w: b.w * 0.85, d: b.d * 0.28,
          h: b.h, y: b.y || 0, rot
        });
        continue;
      }

      // 6. Standard solid buildings (houses, insulae, warehouses, solid monuments)
      this.grid.insert({
        type: 'rect',
        id: b.id,
        x: b.x,
        z: b.z,
        w: b.w,
        d: b.d,
        h: b.h,
        y: b.y || 0,
        rot: b.rot || 0,
      });

      if (b.walkable) {
        this.walkSurfaces.push({
          type: 'walkRect',
          x: b.x,
          z: b.z,
          w: b.w + 1,
          d: b.d + 1,
          y: b.h || 2,
        });
      }
    }
  }

  /* ── Per-frame collision resolution ───────────────────── */

  /**
   * Move the player from current position by delta, resolving collisions.
   * @param {THREE.Vector3} position - Current player position (modified in place)
   * @param {THREE.Vector3} delta - Desired movement vector
   * @param {number} dt - Delta time
   * @returns {{ position: THREE.Vector3, onGround: boolean }}
   */
  moveAndSlide(position, delta, dt) {
    // Apply gravity
    if (!this.onGround) {
      this.playerVelocityY -= GRAVITY * dt;
    }
    position.y += this.playerVelocityY * dt;

    // Ground check
    const groundLevel = this._getGroundLevel(position.x, position.z);
    if (position.y <= groundLevel + PLAYER_HEIGHT) {
      position.y = groundLevel + PLAYER_HEIGHT;
      this.playerVelocityY = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // Horizontal movement with sub-stepping
    const moveLen = Math.sqrt(delta.x * delta.x + delta.z * delta.z);
    if (moveLen < 0.0001) return { position, onGround: this.onGround };

    const steps = Math.max(1, Math.ceil(moveLen / SUBSTEP_SIZE));
    const stepDelta = new THREE.Vector2(delta.x / steps, delta.z / steps);

    for (let i = 0; i < steps; i++) {
      const newX = position.x + stepDelta.x;
      const newZ = position.z + stepDelta.y;

      // Check collision at new position
      if (!this._checkCollision(newX, newZ, position.y - PLAYER_HEIGHT)) {
        position.x = newX;
        position.z = newZ;
      } else {
        // Try sliding along X only
        if (!this._checkCollision(newX, position.z, position.y - PLAYER_HEIGHT)) {
          position.x = newX;
        }
        // Try sliding along Z only
        else if (!this._checkCollision(position.x, newZ, position.y - PLAYER_HEIGHT)) {
          position.z = newZ;
        }
        // Fully blocked — stop
        else {
          break;
        }
      }
    }

    // World bounds clamping
    if (this.bounds) {
      position.x = Math.max(this.bounds.minX + PLAYER_RADIUS, Math.min(this.bounds.maxX - PLAYER_RADIUS, position.x));
      position.z = Math.max(this.bounds.minZ + PLAYER_RADIUS, Math.min(this.bounds.maxZ - PLAYER_RADIUS, position.z));
    }

    this.playerY = position.y;
    return { position, onGround: this.onGround };
  }

  /* ── Jump ──────────────────────────────────────────────── */

  jump(impulse) {
    if (this.onGround) {
      this.playerVelocityY = impulse;
      this.onGround = false;
    }
  }

  /* ── Collision check (point vs all nearby rectangles) ──── */

  _checkCollision(x, z, footY) {
    const nearby = this.grid.query(x, z);

    for (const c of nearby) {
      if (c.type !== 'rect') continue;

      // Check if player foot is below the top of the collider
      // and above the base (allowing step-up)
      const colliderTop = (c.y || 0) + c.h;
      const colliderBase = c.y || 0;

      // If player can step over, skip collision
      if (colliderTop <= footY + STEP_UP_MAX && c.h < 2) continue;

      // If player is above the collider, no horizontal collision
      if (footY >= colliderTop) continue;

      // Rectangle overlap test (AABB, optionally rotated)
      if (c.rot && Math.abs(c.rot) > 0.01) {
        if (this._checkOBBCollision(x, z, c)) return true;
      } else {
        const halfW = c.w / 2;
        const halfD = c.d / 2;
        if (
          x > c.x - halfW - PLAYER_RADIUS &&
          x < c.x + halfW + PLAYER_RADIUS &&
          z > c.z - halfD - PLAYER_RADIUS &&
          z < c.z + halfD + PLAYER_RADIUS
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /* ── Oriented Bounding Box collision ──────────────────── */

  _checkOBBCollision(px, pz, collider) {
    // Transform player position into collider's local space
    const cos = Math.cos(-collider.rot);
    const sin = Math.sin(-collider.rot);
    const dx = px - collider.x;
    const dz = pz - collider.z;
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;

    const halfW = collider.w / 2 + PLAYER_RADIUS;
    const halfD = collider.d / 2 + PLAYER_RADIUS;

    return (
      localX > -halfW && localX < halfW &&
      localZ > -halfD && localZ < halfD
    );
  }

  /* ── Ground level (walk surfaces) ─────────────────────── */

  _getGroundLevel(x, z) {
    let maxY = GROUND_Y;

    for (const ws of this.walkSurfaces) {
      if (ws.type === 'walkRect') {
        const halfW = ws.w / 2;
        const halfD = ws.d / 2;
        if (x > ws.x - halfW && x < ws.x + halfW &&
            z > ws.z - halfD && z < ws.z + halfD) {
          maxY = Math.max(maxY, ws.y);
        }
      } else if (ws.type === 'walkDisk') {
        const dx = x - ws.x;
        const dz = z - ws.z;
        if (dx * dx + dz * dz < ws.radius * ws.radius) {
          maxY = Math.max(maxY, ws.y);
        }
      }
    }

    return maxY;
  }

  /* ── Raycast for inspection ───────────────────────────── */

  /**
   * Find the nearest building collider in a direction.
   * @param {THREE.Vector3} origin - Ray origin
   * @param {THREE.Vector3} direction - Ray direction
   * @param {number} maxDist - Maximum distance
   * @returns {{ id: string, distance: number } | null}
   */
  raycast(origin, direction, maxDist = 60) {
    let closest = null;
    let closestDist = maxDist;

    // Step along the ray
    const step = 1.0;
    for (let t = 0; t < maxDist; t += step) {
      const x = origin.x + direction.x * t;
      const z = origin.z + direction.z * t;
      const nearby = this.grid.query(x, z);

      for (const c of nearby) {
        if (c.type !== 'rect') continue;
        const halfW = c.w / 2;
        const halfD = c.d / 2;
        if (x > c.x - halfW && x < c.x + halfW &&
            z > c.z - halfD && z < c.z + halfD) {
          if (t < closestDist) {
            closestDist = t;
            closest = { id: c.id, distance: t };
          }
        }
      }
      if (closest) break;
    }

    return closest;
  }

  /* ── Safe spawn point ─────────────────────────────────── */

  /**
   * Find a collision-free position near a target.
   */
  findSafeSpawn(targetX, targetZ) {
    for (let radius = 0; radius < 48; radius += 3) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
        const x = targetX + Math.cos(angle) * radius;
        const z = targetZ + Math.sin(angle) * radius;
        if (!this._checkCollision(x, z, GROUND_Y)) {
          return { x, z };
        }
      }
    }
    return { x: targetX, z: targetZ };
  }

  /* ── Dispose ──────────────────────────────────────────── */

  dispose() {
    this.grid.clear();
    this.walkSurfaces = [];
  }
}

/* ── Export constants ──────────────────────────────────────── */
export { PLAYER_RADIUS, PLAYER_HEIGHT, GRAVITY, GROUND_Y };
