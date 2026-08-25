import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const enginePath = pathToFileURL(resolve(root, 'frontend/ancient-world/engine/traversal.js')).href;
const {
  createTraversalSystem,
  rectCollider,
  walkRect,
  walkRamp,
} = await import(enginePath);

function makePlayer(x = 0, z = 0) {
  return { x, y: 1.68, z, floorY: 0, surfaceTag: 'ground' };
}

test('shared traversal prevents tunnelling through solid colliders', () => {
  const player = makePlayer();
  const traversal = createTraversalSystem({
    player,
    colliders: [rectCollider(2, 0, 1, 8)],
    bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  });

  traversal.moveWithSubsteps(5, 0);
  assert.ok(player.x < 1.1, `player crossed collider: x=${player.x}`);
});

test('shared traversal can climb a registered ramp and settle on a platform', () => {
  const player = makePlayer(-1, 0);
  const surfaces = [
    walkRamp(-1, 0, 0, 2, 0, 1, 2, 'test approach'),
    walkRect(3, 0, 2, 2, 1, 0, 'test platform'),
  ];
  const traversal = createTraversalSystem({
    player,
    walkSurfaces: surfaces,
    bounds: { minX: -5, maxX: 8, minZ: -5, maxZ: 5 },
  });

  traversal.moveWithSubsteps(3.5, 0);
  assert.ok(player.floorY > 0.9, `expected platform support, got ${player.floorY}`);
  assert.match(player.surfaceTag, /platform|approach/);
});

test('shared traversal blocks unsafe drops', () => {
  const player = makePlayer(0, 0);
  player.floorY = 2;
  player.y = 3.68;
  const traversal = createTraversalSystem({
    player,
    walkSurfaces: [walkRect(0, 0, 2, 2, 2, 0, 'ledge')],
    bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
  });
  player.floorY = 2;
  player.y = 3.68;

  const moved = traversal.tryTraverse(1.4, 0);
  assert.equal(moved, false);
  assert.ok(player.x < 1.4);
});

test('safe spawn resolver moves a teleport target out of a collider', () => {
  const player = makePlayer(-4, 0);
  const traversal = createTraversalSystem({
    player,
    colliders: [rectCollider(0, 0, 4, 4)],
    bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  });
  const spawn = traversal.resolveSpawn(0, 0);
  assert.equal(traversal.collide(spawn.x, spawn.z), false);
});
