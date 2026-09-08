import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionSystem } from '../frontend/worlds/shared/engine/collision.js';
import { BUILDINGS as AIZANOI_BUILDINGS } from '../frontend/worlds/aizanoi-225/js/city-data.js';
import { BUILDINGS as ATHENS_BUILDINGS } from '../frontend/worlds/athens-450-430/js/city-data.js';
import { BUILDINGS as ROME_BUILDINGS } from '../frontend/worlds/rome-410-476/js/city-data.js';
import { BUILDINGS as IGA_BUILDINGS } from '../frontend/worlds/iga-airport/js/airport-data.js';

test('Colosseum interior arena is walkable and perimeter walls collide with grand entrance openings', () => {
  const col = new CollisionSystem();
  col.buildFromData(ROME_BUILDINGS, [], { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 });
  const colosseum = ROME_BUILDINGS.find(b => b.id === 'colosseum');
  assert.ok(colosseum, 'Colosseum building found');

  // Center of Colosseum arena floor (52, -65) should NOT be blocked by solid obstacle
  const blockedAtCenter = col._checkCollision(colosseum.x, colosseum.z, 0);
  assert.equal(blockedAtCenter, false, 'Colosseum arena center must be open and walkable, not solid');

  // The outer perimeter wall wing should collide!
  const wallX = colosseum.x + colosseum.w / 2 - 3;
  const wallZ = colosseum.z + colosseum.d * 0.3;
  const blockedAtWall = col._checkCollision(wallX, wallZ, 0);
  assert.equal(blockedAtWall, true, 'Colosseum exterior wall wing must collide');

  // Entrance gate archway at cardinal axis should be open for entering
  const entranceX = colosseum.x + colosseum.w / 2;
  const entranceZ = colosseum.z;
  const blockedAtEntrance = col._checkCollision(entranceX, entranceZ, 0);
  assert.equal(blockedAtEntrance, false, 'Colosseum cardinal entrance portal must be open for walking in');
});

test('Pantheon rotunda interior is enterable and exterior drum collides', () => {
  const col = new CollisionSystem();
  col.buildFromData(ROME_BUILDINGS, [], { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 });
  const pantheon = ROME_BUILDINGS.find(b => b.id === 'pantheon');
  assert.ok(pantheon, 'Pantheon building found');

  // Interior center of rotunda (-365, 120) should NOT be blocked
  const blockedAtCenter = col._checkCollision(pantheon.x, pantheon.z, 0);
  assert.equal(blockedAtCenter, false, 'Pantheon rotunda center must be open for visitors');

  // Exterior drum wall should collide
  const wallX = pantheon.x + (pantheon.w / 2) - 1;
  const blockedAtWall = col._checkCollision(wallX, pantheon.z, 0);
  assert.equal(blockedAtWall, true, 'Pantheon drum wall must collide');
});

test('IGA International Pier concourse is a walkable corridor, not a solid block', () => {
  const col = new CollisionSystem();
  col.buildFromData(IGA_BUILDINGS, [], { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 });
  const pierWest = IGA_BUILDINGS.find(b => b.id === 'pier-west');
  assert.ok(pierWest, 'Pier west found');

  // Center of concourse spine (-470, 570) must NOT be blocked
  const blockedAtCenter = col._checkCollision(pierWest.x, pierWest.z, 0);
  assert.equal(blockedAtCenter, false, 'Concourse interior spine must be walkable');

  // Concourse side glass wall must collide
  const wallX = pierWest.x + (pierWest.w / 2) - 1;
  const blockedAtWall = col._checkCollision(wallX, pierWest.z, 0);
  assert.equal(blockedAtWall, true, 'Concourse exterior glass ribbon must collide');
});

test('findSafeSpawn finds open positions even for solid monuments larger than 100m', () => {
  const col = new CollisionSystem();
  col.buildFromData(ROME_BUILDINGS, [], { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 });
  const curia = ROME_BUILDINGS.find(b => b.id === 'curia');
  assert.ok(curia, 'Curia found');

  const spawn = col.findSafeSpawn(curia.x, curia.z);
  const isBlocked = col._checkCollision(spawn.x, spawn.z, 0);
  assert.equal(isBlocked, false, 'findSafeSpawn must return a collision-free location');
  const d = Math.hypot(spawn.x - curia.x, spawn.z - curia.z);
  assert.ok(d > 5, 'Spawn should exit the solid building core');
});

test('Urban fabric insula collision insertion maintains non-zero grid footprint', () => {
  const col = new CollisionSystem();
  col.buildFromData(AIZANOI_BUILDINGS, [], { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 });
  const initialCount = col.grid.query(0, 0).length;

  // Insert sample procedural urban fabric
  col.grid.insert({ type: 'rect', id: 'test-fabric-1', x: 250, z: 250, w: 12, d: 10, h: 8, y: 0 });
  const queried = col.grid.query(250, 250);
  assert.ok(queried.some(c => c.id === 'test-fabric-1'), 'Inserted fabric collider must be queryable in spatial grid');
  assert.equal(col._checkCollision(250, 250, 0), true, 'Fabric building interior must collide and block traversal');
  assert.equal(col._checkCollision(270, 270, 0), false, 'Empty street outside fabric building must be open');
});

test('Athens Propylaea central gateway is open while flanking wings collide', () => {
  const col = new CollisionSystem();
  col.buildFromData(ATHENS_BUILDINGS, [], { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 });
  const propylaea = ATHENS_BUILDINGS.find(b => b.id === 'propylaea');
  assert.ok(propylaea, 'Propylaea found');

  // Central passageway should be open
  const blockedAtCenter = col._checkCollision(propylaea.x, propylaea.z, 0);
  assert.equal(blockedAtCenter, false, 'Propylaea central passageway must be walkable');

  // Flanking tower wings collide
  const wingX = propylaea.x + (propylaea.w / 2) - 2;
  const blockedAtWing = col._checkCollision(wingX, propylaea.z, 0);
  assert.equal(blockedAtWing, true, 'Propylaea wing tower must collide');
});

test('Athens Parthenon cella core collides and stepped stylobate is walkable', () => {
  const col = new CollisionSystem();
  col.buildFromData(ATHENS_BUILDINGS, [], { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 });
  const parthenon = ATHENS_BUILDINGS.find(b => b.id === 'parthenon');
  assert.ok(parthenon, 'Parthenon found');

  // Cella core interior collides
  const blockedAtCella = col._checkCollision(parthenon.x, parthenon.z, 1.2);
  assert.equal(blockedAtCella, true, 'Parthenon cella core must block player traversal');

  // Stylobate surface height is elevated
  const groundY = col.getGroundLevel(parthenon.x, parthenon.z);
  assert.ok(groundY >= 1.2, 'Parthenon platform must provide walkable height >= 1.2');
});

