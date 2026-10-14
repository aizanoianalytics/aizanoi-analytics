// js/systems/VisibilitySystem.js
// Pure field-of-view + exploration memory. No Phaser dependency.

/** Bresenham line of sight on a grid (2 = wall/opaque). */
function hasLineOfSight(grid, x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if (x === x1 && y === y1) break;
    if (grid[y]?.[x] === 2) return false;
  }
  return true;
}

/**
 * Compute visible tile keys ("x,y") within radius using circular range +
 * wall-blocked LOS. Walls themselves are visible at the edge.
 */
export function computeVisible(grid, ox, oy, radius = 8) {
  const visible = new Set();
  const h = grid.length;
  const w = grid[0]?.length || 0;
  for (let y = Math.max(0, oy - radius); y <= Math.min(h - 1, oy + radius); y++) {
    for (let x = Math.max(0, ox - radius); x <= Math.min(w - 1, ox + radius); x++) {
      const dist = Math.hypot(x - ox, y - oy);
      if (dist > radius + 0.4) continue;
      if (hasLineOfSight(grid, ox, oy, x, y)) visible.add(`${x},${y}`);
    }
  }
  return visible;
}

export class VisibilityMemory {
  constructor() {
    this.explored = new Set();
  }
  remember(visibleSet) {
    for (const k of visibleSet) this.explored.add(k);
  }
  isExplored(x, y) {
    if (typeof x === 'string' && y === undefined) return this.explored.has(x);
    return this.explored.has(`${x},${y}`);
  }
  serialize() {
    return Array.from(this.explored);
  }
  static deserialize(arr) {
    const m = new VisibilityMemory();
    if (Array.isArray(arr)) for (const k of arr) m.explored.add(k);
    return m;
  }
}
