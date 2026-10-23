import { OBSTACLES, MAX_LOOT, MAX_EVENTS } from './config.js';

export function resolveObstacleCollision(unit, radius = 0.45) {
  for (const obstacle of OBSTACLES) {
    const dx = unit.x - obstacle.x;
    const dz = unit.z - obstacle.z;
    const minimum = obstacle.radius + radius;
    const gap = Math.hypot(dx, dz);
    if (gap >= minimum) continue;
    const nx = gap > 1e-6 ? dx / gap : 1;
    const nz = gap > 1e-6 ? dz / gap : 0;
    unit.x = Math.max(-18, Math.min(18, obstacle.x + nx * minimum));
    unit.z = Math.max(-18, Math.min(18, obstacle.z + nz * minimum));
  }
}

export function move(unit, vector, speed, dt, radius = 0.45) {
  unit.x = Math.max(-18, Math.min(18, unit.x + vector.x * speed * dt));
  unit.z = Math.max(-18, Math.min(18, unit.z + vector.z * speed * dt));
  resolveObstacleCollision(unit, radius);
}