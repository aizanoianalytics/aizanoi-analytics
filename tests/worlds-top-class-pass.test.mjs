import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');

test('landmark framing sizes the view for both footprint and height', async () => {
  const { landmarkStandoff, landmarkYaw } = await import('../frontend/worlds/shared/engine/framing.js');
  const lowWide = landmarkStandoff({ w: 120, d: 90, h: 20 });
  const tallNarrow = landmarkStandoff({ w: 30, d: 30, h: 100 });
  assert.ok(lowWide >= 140, `wide monument needs breathing room, got ${lowWide}`);
  assert.ok(tallNarrow >= 100, `tall monument must fit vertically, got ${tallNarrow}`);
  assert.equal(landmarkYaw({ x: 10, z: 0 }, { x: 0, z: 0 }), -Math.PI / 2);
  assert.equal(landmarkYaw({ x: 0, z: -10 }, { x: 0, z: 0 }), 0);
});

test('controls exposes an orientation-synchronised target framing helper', () => {
  const controls = read('frontend/worlds/shared/engine/controls.js');
  assert.match(controls, /teleportFacing\(x, z, targetX, targetY, targetZ, y = 1\.7\)/);
  assert.match(controls, /this\.camera\.lookAt\(targetX, targetY, targetZ\)/);
  assert.match(controls, /this\.euler\.setFromQuaternion\(this\.camera\.quaternion, 'YXZ'\)/);
});

test('all historical worlds use height-aware synchronised landmark framing', () => {
  for (const world of ['aizanoi-225', 'rome-410-476', 'athens-450-430', 'iga-airport']) {
    const source = read(`frontend/worlds/${world}/js/main.js`);
    assert.match(source, /landmarkStandoff/, `${world}: height-aware standoff`);
    assert.match(source, /controls\.teleportFacing\(/, `${world}: synchronised framing`);
    assert.doesNotMatch(source, /Math\.atan2\(safe\.x - building\.x, safe\.z - building\.z\)/, `${world}: inverted yaw removed`);
  }
});

test('safe-spawn search accepts a preferred landmark approach bearing', () => {
  const collision = read('frontend/worlds/shared/engine/collision.js');
  assert.match(collision, /findSafeSpawn\(targetX, targetZ, maxRadius = 160, minDistance = 0, preferredAngle = 0\)/);
  assert.match(collision, /preferredAngle \+ angleOffset/);
});

test('hero landmarks own curated approach bearings instead of generic east-side views', async () => {
  const specs = [
    ['../frontend/worlds/aizanoi-225/js/city-data.js', 'BUILDINGS', 'temple'],
    ['../frontend/worlds/rome-410-476/js/city-data.js', 'BUILDINGS', 'colosseum'],
    ['../frontend/worlds/athens-450-430/js/city-data.js', 'BUILDINGS', 'parthenon'],
    ['../frontend/worlds/iga-airport/js/airport-data.js', 'BUILDINGS', 'tower'],
  ];
  for (const [path, key, id] of specs) {
    const module = await import(path);
    const hero = module[key].find((building) => building.id === id);
    assert.ok(Number.isFinite(hero?.viewAngle), `${id}: curated viewAngle`);
  }
});

test('dungeon decor is sliced into 32px frames and placed deterministically', () => {
  const boot = read('frontend/js/v3/apps/dungeon/js/scenes/BootScene.js');
  const game = read('frontend/js/v3/apps/dungeon/js/scenes/GameScene.js');
  assert.match(boot, /load\.spritesheet\('tiles-decor',[\s\S]*frameWidth:\s*32,\s*frameHeight:\s*32/);
  assert.match(game, /decorNoise\(/);
  assert.doesNotMatch(game, /Math\.random\(\)[\s\S]{0,180}'tiles-decor'/);
});

test('dungeon gameplay camera keeps actors readable on desktop without shrinking mobile context', () => {
  const game = read('frontend/js/v3/apps/dungeon/js/scenes/GameScene.js');
  assert.match(game, /this\.cameras\.main\.setZoom\(this\.scale\.width >= 900 \? 1\.16 : 1\.0\)/);
});

test('Fly House lighting keeps practicals balanced and adds a neutral interior fill', () => {
  const source = read('frontend/labs/fly-world/glb-runtime-v3.js');
  assert.match(source, /const interiorFill = new THREE\.PointLight\(0xffe8cf,/);
  assert.match(source, /const stove = new THREE\.PointLight\(0xff7a3d,\s*3\.2,\s*5\.2,\s*2\)/);
  assert.doesNotMatch(source, /PointLight\(0xff6525,\s*7\.2/);
});
